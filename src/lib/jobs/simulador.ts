/**
 * Simulador de la cola (fase 13). Reproduce en memoria la semántica exacta de `take_job`, `recover_stale_jobs`,
 * `heartbeat_jobs` y del bucle del worker: prioridad, FIFO, fairness por empresa, tope global, lease, reintentos,
 * backoff, dead letter. Sirve para probar 30 empresas y los escenarios de recuperación sin Postgres ni IA.
 */
import { esperaRateLimit, estadoTrasFallo, ESPERAS_MS } from "./reglas";

export type JobSim = {
  id: string;
  company_id: string;
  tipo: string;
  prioridad: number;
  estado: "pendiente" | "corriendo" | "hecho" | "fallido";
  intentos: number;
  max_intentos: number;
  created_at: number;
  tomado_at?: number;
  lease_expira_at?: number;
  terminado_at?: number;
  idempotency_key: string;
  error?: string;
  espera_ms?: number; // creado→tomado
  latencia_ms?: number; // tomado→terminado
  duracion_ms: number; // cuánto tarda la "IA"
  falla?: "rate_limit" | "timeout" | "json_invalido" | "proveedor_caido" | "archivo_ilegible" | "worker_muere" | null;
  fallas_restantes?: number;
};

export type ConfigSim = { lease_ms: number; max_pesados_por_empresa: number; max_global: number; concurrencia_por_worker: number; workers: number; barrido_ms: number };
export const CONFIG_DEFAULT: ConfigSim = { lease_ms: 10 * 60_000, max_pesados_por_empresa: 2, max_global: 12, concurrencia_por_worker: 6, workers: 2, barrido_ms: 60_000 };

export class ColaSimulada {
  jobs: JobSim[] = [];
  ahora = 0;
  private seq = 0;
  eventos: string[] = [];
  tokens = 0;
  constructor(public cfg: ConfigSim = CONFIG_DEFAULT) {}

  encolar(j: Omit<JobSim, "id" | "estado" | "intentos" | "max_intentos" | "created_at" | "idempotency_key"> & { idempotency_key?: string; max_intentos?: number; created_at?: number }): JobSim | null {
    const key = j.idempotency_key ?? `k${++this.seq}`;
    if (this.jobs.some((x) => x.idempotency_key === key)) return null; // unique → duplicado ignorado
    const job: JobSim = { ...j, id: `j${++this.seq}`, estado: "pendiente", intentos: 0, max_intentos: j.max_intentos ?? 3, created_at: j.created_at ?? this.ahora, idempotency_key: key };
    this.jobs.push(job);
    return job;
  }

  corriendo() {
    return this.jobs.filter((j) => j.estado === "corriendo");
  }

  /** Espejo exacto de take_job(): prioridad, FIFO, tope global, fairness por empresa para p>=5. */
  takeJob(): JobSim | null {
    const corr = this.corriendo();
    if (corr.length >= this.cfg.max_global) return null;
    const candidatos = this.jobs
      .filter((j) => j.estado === "pendiente" && j.created_at <= this.ahora)
      .filter((j) => j.prioridad < 5 || corr.filter((r) => r.company_id === j.company_id && r.prioridad >= 5).length < this.cfg.max_pesados_por_empresa)
      .sort((a, b) => a.prioridad - b.prioridad || a.created_at - b.created_at);
    const j = candidatos[0];
    if (!j) return null;
    j.estado = "corriendo";
    j.intentos++;
    j.tomado_at = this.ahora;
    j.lease_expira_at = this.ahora + this.cfg.lease_ms;
    j.espera_ms = j.espera_ms ?? this.ahora - j.created_at;
    return j;
  }

  recoverStale(): number {
    let n = 0;
    for (const j of this.jobs) {
      if (j.estado === "corriendo" && (j.lease_expira_at ?? 0) < this.ahora) {
        j.estado = estadoTrasFallo(j);
        if (j.estado === "fallido") j.error = (j.error ?? "") + " [lease vencido]";
        n++;
      }
    }
    return n;
  }

  heartbeat(ids: string[]) {
    for (const j of this.jobs) if (ids.includes(j.id) && j.estado === "corriendo") j.lease_expira_at = this.ahora + this.cfg.lease_ms;
  }

  /** Ejecuta el job simulando la IA: duración, fallos programados y reintentos con backoff como el worker real. */
  terminar(j: JobSim, murioWorker = false) {
    if (murioWorker) return; // queda 'corriendo' hasta que venza el lease
    let backoff = 0;
    if (j.falla && (j.fallas_restantes ?? 1) > 0) {
      j.fallas_restantes = (j.fallas_restantes ?? 1) - 1;
      if (j.falla === "rate_limit" || j.falla === "proveedor_caido") {
        // el worker reintenta dentro del mismo job hasta 2 veces con 1s/4s; si persiste, cuenta como fallo del intento
        for (let i = 0; i < 2 && (j.fallas_restantes ?? 0) > 0; i++) {
          backoff += esperaRateLimit(i) ?? 0;
          j.fallas_restantes = (j.fallas_restantes ?? 1) - 1;
        }
        if ((j.fallas_restantes ?? 0) > 0) return this.fallo(j, j.falla, backoff);
      } else {
        return this.fallo(j, j.falla, 0);
      }
    }
    j.estado = "hecho";
    j.terminado_at = this.ahora + j.duracion_ms + backoff;
    j.latencia_ms = j.terminado_at - (j.tomado_at ?? this.ahora);
    this.tokens += 2000;
  }

  private fallo(j: JobSim, motivo: string, backoff: number) {
    j.estado = estadoTrasFallo(j);
    j.error = motivo;
    j.lease_expira_at = undefined;
    if (j.estado === "fallido") j.terminado_at = this.ahora + backoff;
    this.eventos.push(`${j.id} ${motivo} → ${j.estado}`);
  }

  /** Bucle: avanza el reloj en pasos, con N workers × concurrencia, hasta vaciar la cola o agotar el tiempo. */
  correr(opts: { paso_ms?: number; max_ms: number; matarWorkerEn?: number }): { tiempo_ms: number; pendientes: number } {
    const paso = opts.paso_ms ?? 1000;
    const enVuelo: { job: JobSim; fin: number; worker: number }[] = [];
    let ultimoBarrido = 0, ultimoHb = 0;
    const vivos = new Set(Array.from({ length: this.cfg.workers }, (_, i) => i));
    while (this.ahora <= opts.max_ms) {
      if (opts.matarWorkerEn !== undefined && this.ahora >= opts.matarWorkerEn && vivos.has(0)) {
        vivos.delete(0);
        for (const e of enVuelo.filter((x) => x.worker === 0)) e.fin = Infinity; // sus jobs quedan colgados
        this.eventos.push("worker 0 murió");
      }
      if (this.ahora - ultimoBarrido >= this.cfg.barrido_ms) {
        ultimoBarrido = this.ahora;
        const n = this.recoverStale();
        if (n) this.eventos.push(`barrido: ${n} recuperados`);
        for (let i = enVuelo.length - 1; i >= 0; i--) if (enVuelo[i].fin === Infinity && enVuelo[i].job.estado !== "corriendo") enVuelo.splice(i, 1);
      }
      if (this.ahora - ultimoHb >= 60_000) {
        ultimoHb = this.ahora;
        this.heartbeat(enVuelo.filter((e) => e.fin !== Infinity).map((e) => e.job.id));
      }
      for (let i = enVuelo.length - 1; i >= 0; i--) {
        if (enVuelo[i].fin <= this.ahora) {
          this.terminar(enVuelo[i].job);
          enVuelo.splice(i, 1);
        }
      }
      for (const w of vivos) {
        while (enVuelo.filter((e) => e.worker === w).length < this.cfg.concurrencia_por_worker) {
          const j = this.takeJob();
          if (!j) break;
          enVuelo.push({ job: j, fin: this.ahora + j.duracion_ms, worker: w });
        }
      }
      const pend = this.jobs.filter((j) => j.estado === "pendiente" || j.estado === "corriendo").length;
      if (pend === 0) break;
      if (enVuelo.length === 0 && !this.jobs.some((j) => j.estado === "pendiente" && j.created_at <= this.ahora)) {
        const prox = Math.min(...this.jobs.filter((j) => j.estado === "pendiente").map((j) => j.created_at));
        if (isFinite(prox) && prox > this.ahora) { this.ahora = prox; continue; }
      }
      this.ahora += paso;
    }
    return { tiempo_ms: this.ahora, pendientes: this.jobs.filter((j) => j.estado === "pendiente" || j.estado === "corriendo").length };
  }

  metricas() {
    const hechos = this.jobs.filter((j) => j.estado === "hecho");
    const esperas = hechos.map((j) => j.espera_ms ?? 0).sort((a, b) => a - b);
    const lat = hechos.map((j) => j.latencia_ms ?? 0).sort((a, b) => a - b);
    const p = (arr: number[], q: number) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : 0);
    const porEmpresa = new Map<string, number>();
    for (const j of hechos) porEmpresa.set(j.company_id, Math.max(porEmpresa.get(j.company_id) ?? 0, j.espera_ms ?? 0));
    return {
      total: this.jobs.length,
      hechos: hechos.length,
      fallidos: this.jobs.filter((j) => j.estado === "fallido").length,
      pendientes: this.jobs.filter((j) => j.estado === "pendiente").length,
      corriendo: this.corriendo().length,
      reintentos: this.jobs.reduce((s, j) => s + Math.max(0, j.intentos - 1), 0),
      espera_p50: p(esperas, 0.5),
      espera_p95: p(esperas, 0.95),
      espera_max: esperas[esperas.length - 1] ?? 0,
      latencia_p95: p(lat, 0.95),
      espera_interactivos_max: Math.max(0, ...hechos.filter((j) => j.prioridad < 5).map((j) => j.espera_ms ?? 0)),
      peor_empresa_espera: Math.max(0, ...porEmpresa.values()),
      tokens: this.tokens,
      costo_usd: (this.tokens / 1_000_000) * 6,
    };
  }
}

export { ESPERAS_MS };
