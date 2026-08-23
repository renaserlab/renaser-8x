/** Reglas puras de la cola: prioridad, reintentos, backoff, lease. Extraídas del worker para poder probarlas. Capítulo 28. */

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
