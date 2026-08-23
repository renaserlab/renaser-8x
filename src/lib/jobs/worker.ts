import { supabaseAdmin } from "../supabase/admin";
import { AIRateLimitError } from "../ai/provider";
import { superaTope, refrescarStats } from "../db/queries";
import { handleExtraer } from "./handlers/extraer";
import { handleContrastar } from "./handlers/contrastar";
import { handleEntrevistaSiguiente, handleTranscribirRespuesta, handleMinarKnowHow } from "./handlers/entrevista";
import { handleGenerarProceso, handleGenerarToBe, handleGenerarSop } from "./handlers/procesos";
import { handleDiagnosticar } from "./handlers/diagnostico";
import { handlePlanificar, handleRedactarEntregables, handleEvaluarAdmision } from "./handlers/plan";

type Job = { id: string; company_id: string; tipo: string; payload: Record<string, unknown>; intentos: number; max_intentos: number; prioridad: number };

const HANDLERS: Record<string, (job: Job) => Promise<unknown>> = {
  extraer: handleExtraer,
  contrastar: handleContrastar,
  entrevista_siguiente: handleEntrevistaSiguiente,
  transcribir_respuesta: handleTranscribirRespuesta,
  minar_know_how: handleMinarKnowHow,
  generar_proceso: handleGenerarProceso,
  generar_tobe: handleGenerarToBe,
  generar_sop: handleGenerarSop,
  diagnosticar: handleDiagnosticar,
  planificar: handlePlanificar,
  redactar_entregables: handleRedactarEntregables,
  evaluar_admision: handleEvaluarAdmision,
};

const CONCURRENCIA = Number(process.env.WORKER_CONCURRENCIA ?? 6);
const LEASE = Number(process.env.WORKER_LEASE_MINUTOS ?? 10);
import { esperaRateLimit, estadoTrasFallo } from "./reglas";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ejecutar(job: Job) {
  const sb = supabaseAdmin();
  const h = HANDLERS[job.tipo];
  if (!h) {
    await sb.from("jobs").update({ estado: "fallido", error: `Tipo de trabajo desconocido: ${job.tipo}`, terminado_at: new Date().toISOString() }).eq("id", job.id);
    return;
  }
  // Tope de costo por empresa: los trabajos de lote se pausan (vuelven a pendiente con menor prioridad), nunca un cobro sorpresa.
  if (job.company_id && job.prioridad >= 5 && (await superaTope(job.company_id))) {
    await sb.from("jobs").update({ estado: "fallido", error: "Tope de tokens de la empresa superado. Sube el tope en la ficha de la empresa y reintenta.", terminado_at: new Date().toISOString() }).eq("id", job.id);
    return;
  }
  try {
    let resultado: unknown;
    for (let i = 0; ; i++) {
      try {
        resultado = await h(job);
        break;
      } catch (e) {
        const espera = e instanceof AIRateLimitError ? esperaRateLimit(i) : null;
        if (espera !== null) {
          await sb.from("jobs").update({ progreso: `Límite del proveedor. Reintentando en ${espera / 1000}s` }).eq("id", job.id);
          await dormir(espera);
          continue;
        }
        throw e;
      }
    }
    await sb.from("jobs").update({ estado: "hecho", resultado: resultado ?? null, terminado_at: new Date().toISOString(), error: null }).eq("id", job.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const agotado = estadoTrasFallo(job) === "fallido";
    await sb
      .from("jobs")
      .update({ estado: agotado ? "fallido" : "pendiente", error: msg, progreso: agotado ? `Falló: ${msg}` : `Reintento ${job.intentos}/${job.max_intentos}: ${msg}`, terminado_at: agotado ? new Date().toISOString() : null, lease_expira_at: null })
      .eq("id", job.id);
    console.error(`[job ${job.tipo} ${job.id}] ${agotado ? "FALLIDO" : "reintento"}: ${msg}`);
  }
}

export async function correrWorker() {
  const sb = supabaseAdmin();
  console.log(`8X worker · concurrencia ${CONCURRENCIA} · lease ${LEASE} min`);
  let activos = 0;
  let ultimoBarrido = 0, ultimoRefresh = 0;
  for (;;) {
    const ahora = Date.now();
    if (ahora - ultimoBarrido > 60_000) {
      ultimoBarrido = ahora;
      const { data: n } = await sb.rpc("recover_stale_jobs");
      if (n) console.log(`recuperados ${n} trabajos con lease vencido`);
    }
    if (ahora - ultimoRefresh > 60_000) {
      ultimoRefresh = ahora;
      refrescarStats().catch(() => {});
    }
    if (activos >= CONCURRENCIA) {
      await dormir(250);
      continue;
    }
    const { data, error } = await sb.rpc("take_job", { lease_minutes: LEASE });
    if (error) {
      console.error("take_job:", error.message);
      await dormir(2000);
      continue;
    }
    const job = (Array.isArray(data) ? data[0] : data) as Job | undefined;
    if (!job) {
      await dormir(activos ? 300 : 1000);
      continue;
    }
    activos++;
    console.log(`→ ${job.tipo} (p${job.prioridad}) ${job.id}`);
    ejecutar(job).finally(() => {
      activos--;
    });
  }
}
