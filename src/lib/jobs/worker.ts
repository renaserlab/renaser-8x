import { supabaseAdmin } from "../supabase/admin";
import { conTrabajo } from "./contexto";
import { AIRateLimitError, AIProviderDownError, AIValidationError } from "../ai/provider";
import { AIProviderPausedError } from "../ai";
import { superaTope, refrescarStats, registrarErrorLlamada } from "../db/queries";
import { handleExtraer } from "./handlers/extraer";
import { handleContrastar } from "./handlers/contrastar";
import { handleEntrevistaSiguiente, handleTranscribirRespuesta, handleMinarKnowHow } from "./handlers/entrevista";
import { handleGenerarProceso, handleGenerarToBe, handleGenerarSop } from "./handlers/procesos";
import { handleDiagnosticar, handleConsolidar } from "./handlers/diagnostico";
import { handlePlanificar, handleRedactarEntregables, handleEvaluarAdmision, handlePlanEstrategico } from "./handlers/plan";
import { handleConstruirActivo, handleSistematizarActivo } from "./handlers/activos";
import { handleProponerIndicadores } from "./handlers/indicadores";
import { handleEstudioOrganigrama } from "./handlers/organigrama";
import { handleModeloAltoRendimiento } from "./handlers/modelo";
import { handleFichaDireccion } from "./handlers/ficha-direccion";
import { esperaRateLimit, estadoTrasFallo, cambioTrasPausa, esperaCircuito, CIRCUITO_CREDITO } from "./reglas";
import { abrirCircuitoCredito, circuitoCreditoAbierto } from "./queue";
import { redactarToken } from "../tokens";

type Job = { id: string; company_id: string; tipo: string; payload: Record<string, unknown>; intentos: number; max_intentos: number; prioridad: number };

export const HANDLERS: Record<string, (job: Job) => Promise<unknown>> = {
  extraer: handleExtraer,
  contrastar: handleContrastar,
  entrevista_siguiente: handleEntrevistaSiguiente,
  transcribir_respuesta: handleTranscribirRespuesta,
  minar_know_how: handleMinarKnowHow,
  generar_proceso: handleGenerarProceso,
  generar_tobe: handleGenerarToBe,
  generar_sop: handleGenerarSop,
  diagnosticar: handleDiagnosticar,
  consolidar: handleConsolidar,
  planificar: handlePlanificar,
  redactar_entregables: handleRedactarEntregables,
  evaluar_admision: handleEvaluarAdmision,
  construir_activo: handleConstruirActivo,
  sistematizar_activo: handleSistematizarActivo,
  plan_estrategico: handlePlanEstrategico,
  proponer_indicadores: handleProponerIndicadores,
  estudio_organigrama: handleEstudioOrganigrama,
  modelo_alto_rendimiento: handleModeloAltoRendimiento,
  ficha_direccion: handleFichaDireccion,
};

const CONCURRENCIA = Number(process.env.WORKER_CONCURRENCIA ?? 6);
const LEASE = Number(process.env.WORKER_LEASE_MINUTOS ?? 10);
const MAX_PESADOS_POR_EMPRESA = Number(process.env.WORKER_MAX_PESADOS_POR_EMPRESA ?? 2);
const MAX_GLOBAL = Number(process.env.WORKER_MAX_GLOBAL ?? 12);
const HEARTBEAT_MS = 60_000;
/** Cada cuánto, como mucho, se le pregunta a la base si el circuito de crédito sigue abierto. */
const CONSULTA_CIRCUITO_MS = 10_000;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const activos = new Set<string>();

/** Un registro de log jamás lleva tokens ni secretos. */
function log(...a: unknown[]) {
  console.log(...a.map((x) => (typeof x === "string" ? redactarToken(x) : x)));
}

/**
 * Ejecuta UN trabajo ya tomado por `take_job`. Se exporta para poder probarlo con un manejador falso
 * y una base falsa: la regla «una pausa del proveedor no consume intentos» tiene que demostrarse,
 * no suponerse.
 */
export async function ejecutar(job: Job) {
  const sb = supabaseAdmin();
  const h = HANDLERS[job.tipo];
  if (!h) {
    // Tipo desconocido: puede ser una instancia VIEJA (deploy en curso) tomando un job nuevo. Nunca fallo
    // terminal inmediato: se devuelve a la cola con reintento para que lo tome una instancia actual.
    const agotado = estadoTrasFallo(job) === "fallido";
    await sb.from("jobs").update({ estado: agotado ? "fallido" : "pendiente", error: `Tipo de trabajo desconocido en esta instancia: ${job.tipo}`, lease_expira_at: null, terminado_at: agotado ? new Date().toISOString() : null }).eq("id", job.id);
    return;
  }
  // Tope de costo por empresa (P1-20): aplica a todo trabajo que llame a la IA. Nunca un cobro sorpresa.
  if (job.company_id && job.tipo !== "consolidar" && (await superaTope(job.company_id))) {
    await sb.from("jobs").update({ estado: "fallido", error: "Tope de tokens de la empresa superado. Sube el tope en la ficha de la empresa y reintenta.", terminado_at: new Date().toISOString() }).eq("id", job.id);
    return;
  }
  const t0 = Date.now();
  try {
    let resultado: unknown;
    for (let i = 0; ; i++) {
      try {
        // Con el trabajo como contexto ambiental, la cola y las fuentes se anotan solas.
        resultado = await conTrabajo({ jobId: job.id, companyId: job.company_id, tipo: job.tipo }, () => h(job));
        break;
      } catch (e) {
        // Sin crédito no se reintenta ni con backoff: se sale ya y el trabajo vuelve a la cola entero.
        if (e instanceof AIProviderPausedError) throw e;
        const espera = e instanceof AIRateLimitError || e instanceof AIProviderDownError ? esperaRateLimit(i) : null;
        if (espera !== null) {
          await sb.from("jobs").update({ progreso: `${e instanceof AIRateLimitError ? "Límite del proveedor" : "Proveedor no responde"}. Reintentando en ${espera / 1000}s` }).eq("id", job.id);
          await dormir(espera);
          continue;
        }
        throw e;
      }
    }
    await sb.from("jobs").update({ estado: "hecho", resultado: resultado ?? null, terminado_at: new Date().toISOString(), error: null }).eq("id", job.id);
  } catch (e) {
    const msg = redactarToken(e instanceof Error ? e.message : String(e));
    if (e instanceof AIProviderPausedError) {
      // EL PROVEEDOR ESTÁ SIN CRÉDITO, NO EL TRABAJO MAL HECHO (28-09-2026: 81 trabajos perdidos).
      // El trabajo vuelve a pendiente con el intento DEVUELTO y un error que cualquiera entiende, y se
      // abre el circuito compartido para que ningún otro trabajo pague el mismo 402 durante 30 minutos.
      await abrirCircuitoCredito();
      await registrarErrorLlamada(job.company_id, job.id, `trabajo:${job.tipo}`, `proveedor_pausado: ${msg}`, Date.now() - t0).catch(() => {});
      await sb.from("jobs").update(cambioTrasPausa(job, new Date())).eq("id", job.id);
      console.error(redactarToken(`[job ${job.tipo} ${job.id}] PAUSA del proveedor (sin crédito), devuelto a la cola sin consumir intento: ${msg}`));
      return;
    }
    const agotado = estadoTrasFallo(job) === "fallido";
    const tipoError = e instanceof AIValidationError ? "salida_invalida" : e instanceof AIRateLimitError ? "rate_limit" : e instanceof AIProviderDownError ? "proveedor_caido" : "error";
    // EL PREFIJO IMPORTA. Este fallo es del TRABAJO, no de un agente: puede ocurrir antes o después
    // de cualquier llamada al modelo. Escribirlo con el tipo de trabajo a secas ensuciaba la columna
    // `agente` de token_usage, y la torre acabó mostrando "contrastar" y "generar_proceso" como si
    // fueran agentes. Con el prefijo se siguen contando los fallos sin disfrazarlos de agente.
    await registrarErrorLlamada(job.company_id, job.id, `trabajo:${job.tipo}`, `${tipoError}: ${msg}`, Date.now() - t0).catch(() => {});
    await sb
      .from("jobs")
      .update({ estado: agotado ? "fallido" : "pendiente", error: msg, progreso: agotado ? `Falló: ${msg}` : `Reintento ${job.intentos}/${job.max_intentos}: ${msg}`, terminado_at: agotado ? new Date().toISOString() : null, lease_expira_at: null })
      .eq("id", job.id);
    console.error(redactarToken(`[job ${job.tipo} ${job.id}] ${agotado ? "FALLIDO" : "reintento"} (${tipoError}): ${msg}`));
  }
}

/**
 * Drena la cola durante como máximo maxMs: toma y ejecuta trabajos (mismo take_job, mismos handlers,
 * mismo heartbeat) y termina cuando la cola queda vacía o se acaba el presupuesto de tiempo.
 * Es la versión por ráfagas del worker para entornos serverless (Vercel). Convive con el worker local.
 */
export async function drenarCola(maxMs: number): Promise<{ procesados: number; ms: number; pausado?: boolean }> {
  const sb = supabaseAdmin();
  const t0 = Date.now();
  let procesados = 0;
  let ultimoHeartbeat = Date.now();
  let pausado = false;
  await sb.rpc("recover_stale_jobs").then(() => {});
  const enVuelo: Promise<void>[] = [];
  for (;;) {
    if (Date.now() - t0 > maxMs - 20_000) break; // margen para cerrar limpio antes del límite de la función
    if (activos.size && Date.now() - ultimoHeartbeat > HEARTBEAT_MS) {
      ultimoHeartbeat = Date.now();
      await sb.rpc("heartbeat_jobs", { ids: [...activos], lease_minutes: LEASE }).then(() => {});
    }
    if (activos.size >= CONCURRENCIA) {
      await dormir(250);
      continue;
    }
    // Sin crédito no se toma nada más: en serverless esperar es gastar función. Lo que está en vuelo
    // termina (o se pausa solo) y el siguiente drenaje volverá a preguntar.
    if (await circuitoCreditoAbierto()) {
      pausado = true;
      log(`circuito ${CIRCUITO_CREDITO} abierto: el drenaje no toma más trabajos`);
      break;
    }
    const { data, error } = await sb.rpc("take_job", { lease_minutes: LEASE, max_pesados_por_empresa: MAX_PESADOS_POR_EMPRESA, max_global: MAX_GLOBAL });
    if (error) {
      await dormir(1500);
      continue;
    }
    const job = (Array.isArray(data) ? data[0] : data) as Job | undefined;
    if (!job) {
      if (!activos.size) break; // cola vacía y nada en vuelo: terminamos
      await dormir(300);
      continue;
    }
    activos.add(job.id);
    procesados++;
    log(`→ ${job.tipo} (p${job.prioridad}) ${job.id} [drain]`);
    enVuelo.push(ejecutar(job).finally(() => activos.delete(job.id)));
  }
  await Promise.allSettled(enVuelo);
  return { procesados, ms: Date.now() - t0, ...(pausado ? { pausado } : {}) };
}

export async function correrWorker() {
  const sb = supabaseAdmin();
  log(`8X worker · concurrencia ${CONCURRENCIA} · lease ${LEASE} min · máx ${MAX_PESADOS_POR_EMPRESA} pesados/empresa · máx global ${MAX_GLOBAL}`);
  let ultimoBarrido = 0, ultimoRefresh = 0, ultimoHeartbeat = 0, ultimaConsultaCircuito = 0;
  let circuitoAbierto = false, esperasCircuito = 0;
  for (;;) {
    const ahora = Date.now();
    if (ahora - ultimoBarrido > 60_000) {
      ultimoBarrido = ahora;
      const { data: n } = await sb.rpc("recover_stale_jobs");
      if (n) log(`recuperados ${n} trabajos con lease vencido`);
    }
    if (ahora - ultimoRefresh > 60_000) {
      ultimoRefresh = ahora;
      refrescarStats().catch((e) => console.error("refresh_company_stats:", e?.message ?? e));
    }
    // Heartbeat (P1-13): los trabajos vivos renuevan su lease; un trabajo largo no se duplica.
    if (activos.size && ahora - ultimoHeartbeat > HEARTBEAT_MS) {
      ultimoHeartbeat = ahora;
      sb.rpc("heartbeat_jobs", { ids: [...activos], lease_minutes: LEASE }).then(({ error }) => error && console.error("heartbeat:", error.message));
    }
    if (activos.size >= CONCURRENCIA) {
      await dormir(250);
      continue;
    }
    // Antes de pedir trabajo: ¿hay crédito? Se consulta como mucho cada CONSULTA_CIRCUITO_MS y, si el
    // circuito está abierto, se espera con backoff creciente (5 s → 60 s). Nunca un bucle apretado
    // contra la base ni contra el proveedor.
    if (ahora - ultimaConsultaCircuito > CONSULTA_CIRCUITO_MS) {
      ultimaConsultaCircuito = ahora;
      const abiertoAhora = await circuitoCreditoAbierto();
      if (abiertoAhora && !circuitoAbierto) log(`circuito ${CIRCUITO_CREDITO} abierto: la cola espera a que vuelva el crédito`);
      if (!abiertoAhora && circuitoAbierto) log(`circuito ${CIRCUITO_CREDITO} cerrado: la cola sigue`);
      circuitoAbierto = abiertoAhora;
      if (!abiertoAhora) esperasCircuito = 0;
    }
    if (circuitoAbierto) {
      await dormir(esperaCircuito(esperasCircuito++));
      continue;
    }
    const { data, error } = await sb.rpc("take_job", { lease_minutes: LEASE, max_pesados_por_empresa: MAX_PESADOS_POR_EMPRESA, max_global: MAX_GLOBAL });
    if (error) {
      console.error("take_job:", error.message);
      await dormir(2000);
      continue;
    }
    const job = (Array.isArray(data) ? data[0] : data) as Job | undefined;
    if (!job) {
      await dormir(activos.size ? 300 : 1000);
      continue;
    }
    activos.add(job.id);
    log(`→ ${job.tipo} (p${job.prioridad}) ${job.id}`);
    ejecutar(job).finally(() => activos.delete(job.id));
  }
}
