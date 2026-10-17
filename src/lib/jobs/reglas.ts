/** Reglas puras de la cola: prioridad, reintentos, backoff, lease. Extraídas del worker para poder probarlas. Capítulo 28. */
import { LLAMADA_LARGA } from "../ai/provider";

export const ESPERAS_MS = [1000, 4000, 16000];
export const MAX_REINTENTOS_RATE_LIMIT = 2;

export type JobMin = { id: string; prioridad: number; created_at: string; estado: string; intentos: number; max_intentos: number; lease_expira_at?: string | null };

/** Orden en que `take_job` entrega: prioridad ascendente, luego antigüedad. */
export function ordenarCola<T extends JobMin>(jobs: T[]): T[] {
  return [...jobs].filter((j) => j.estado === "pendiente").sort((a, b) => a.prioridad - b.prioridad || a.created_at.localeCompare(b.created_at));
}

/** Tras un fallo: vuelve a pendiente hasta agotar intentos; después fallido (cola muerta visible). */
export function estadoTrasFallo(job: Pick<JobMin, "intentos" | "max_intentos">): "pendiente" | "fallido" {
  return job.intentos >= job.max_intentos ? "fallido" : "pendiente";
}

/** Lease vencido → pendiente (o fallido si agotó intentos). Espejo de `recover_stale_jobs`. */
export function recuperarVencidos<T extends JobMin>(jobs: T[], ahora: Date): T[] {
  return jobs.map((j) => {
    if (j.estado !== "corriendo" || !j.lease_expira_at || new Date(j.lease_expira_at) >= ahora) return j;
    return { ...j, estado: estadoTrasFallo(j) };
  });
}

/** Espera antes del reintento i (0-based) por límite del proveedor; null si ya no se reintenta. */
export function esperaRateLimit(intento: number): number | null {
  return intento < MAX_REINTENTOS_RATE_LIMIT ? ESPERAS_MS[intento] : null;
}

// ---- Pausa del proveedor por falta de crédito (28-09-2026: 81 trabajos perdidos por un 402) ----

/** Clave del circuito compartido que detiene TODA la cola mientras no hay crédito. */
export const CIRCUITO_CREDITO = "proveedor:credito";
/** Cuánto espera la cola tras detectar falta de crédito antes de volver a probar: 30 minutos. */
export const PAUSA_CREDITO_SEG = 30 * 60;
/** Con qué empieza el error de un trabajo devuelto a la cola por pausa. La torre y el reencolado lo buscan. */
export const PREFIJO_PAUSA = "Proveedor en pausa";
/**
 * Los dos prefijos de error que significan «se perdió por falta de crédito, no por el trabajo»:
 * el histórico (el 402 crudo que escribía el proveedor) y el nuevo (la pausa que anota el worker).
 */
export const PREFIJOS_ERROR_PAUSA = ["Gemini 402", PREFIJO_PAUSA] as const;

export function esErrorDePausa(error: string | null | undefined): boolean {
  return !!error && PREFIJOS_ERROR_PAUSA.some((p) => error.startsWith(p));
}

/** Lo que lee el CLIENTE cuando su trabajo espera por crédito. Honesto y sin técnica: nada se perdió. */
export const MENSAJE_PAUSA_CLIENTE =
  "El asistente está en pausa un momento. Tus respuestas y tus números siguen guardados; en cuanto se reanude, seguimos donde lo dejaste.";

const horaLima = (d: Date) =>
  d.toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** El error legible que queda en el trabajo: desde cuándo espera. Recibe la hora para ser reproducible. */
export function mensajePausa(ahora: Date): string {
  return `${PREFIJO_PAUSA} (sin crédito) desde ${horaLima(ahora)}`;
}

/**
 * Qué se escribe en el trabajo cuando el proveedor está sin crédito. Vuelve a `pendiente` y
 * DEVUELVE el intento: `take_job` ya sumó uno al tomarlo, y una espera no es un intento fallido.
 * Si no se devolviera, tres pausas seguidas mandarían el trabajo a «fallido» — que es exactamente
 * cómo se perdieron los 81 del 28-09.
 */
export function cambioTrasPausa(job: Pick<JobMin, "intentos">, ahora: Date) {
  const error = mensajePausa(ahora);
  return { estado: "pendiente" as const, intentos: Math.max(job.intentos - 1, 0), error, progreso: error, lease_expira_at: null, terminado_at: null };
}

/** Esperas del worker mientras el circuito de crédito está abierto: crece hasta un minuto, nunca un bucle apretado. */
export const ESPERAS_CIRCUITO_MS = [5_000, 10_000, 20_000, 40_000, 60_000];
export function esperaCircuito(intento: number): number {
  return ESPERAS_CIRCUITO_MS[Math.min(Math.max(intento, 0), ESPERAS_CIRCUITO_MS.length - 1)];
}

// ---- Trabajos largos al final de un drenaje (spec-estrategia-8x.md §5.3) ----

/**
 * Los trabajos que hacen UNA llamada larga al modelo (las lentes y el equipo rojo de la estrategia). El drenaje en
 * Vercel corta la función a los 300 s: uno de estos tomado con poco tiempo por delante moría sin que su manejador
 * anotara nada, el lease vencía a los diez minutos y se reintentaba gastando otra llamada.
 */
export const TIPOS_LARGOS: ReadonlySet<string> = new Set(["estrategia_lente", "estrategia_rojo"]);
/** Lo que necesita un trabajo largo, además de su llamada al modelo: leer la versión, registrar la llamada, guardar y encolar. */
export const RESPIRO_TRABAJO_LARGO_MS = 20_000;
/**
 * Lo que necesita por delante un trabajo largo para terminar dentro del drenaje: el plazo de su única petición, más las
 * esperas por 503 que se le permiten, más el respiro de guardar (revisión del 17-10). Antes era un número fijo (150 s)
 * mientras una sola llamada podía tardar más de 300 s; ahora sale de lo que de verdad se le permite a la llamada.
 */
export const MARGEN_TRABAJO_LARGO_MS =
  LLAMADA_LARGA.plazoMs * LLAMADA_LARGA.intentos + LLAMADA_LARGA.esperas503Ms.reduce((a, b) => a + b, 0) + RESPIRO_TRABAJO_LARGO_MS;
export const PROGRESO_DEVUELTO = "Espera al siguiente drenaje: necesita más tiempo del que le quedaba a este.";

/**
 * Qué se escribe en un trabajo largo que el drenaje tomó sin tiempo para terminarlo: vuelve a `pendiente` y DEVUELVE el
 * intento que `take_job` sumó al tomarlo (la misma forma que cambioTrasPausa). No es un fallo: no lleva error.
 */
export function cambioTrasDevolver(job: Pick<JobMin, "intentos">) {
  return { estado: "pendiente" as const, intentos: Math.max(job.intentos - 1, 0), progreso: PROGRESO_DEVUELTO, lease_expira_at: null, terminado_at: null };
}

/** ¿Este trabajo se devuelve sin tocarlo? Solo los largos, y solo si al drenaje le queda menos que su margen. */
export function hayQueDevolver(tipo: string, quedaMs: number): boolean {
  return TIPOS_LARGOS.has(tipo) && quedaMs < MARGEN_TRABAJO_LARGO_MS;
}
