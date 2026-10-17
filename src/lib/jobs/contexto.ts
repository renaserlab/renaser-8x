import { AsyncLocalStorage } from "node:async_hooks";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * EL TRABAJO QUE ESTÁ CORRIENDO AHORA MISMO.
 *
 * La procedencia de una ejecución —qué fuentes leyó y a qué paso entregó— tenía dos formas de
 * registrarse: pasar el id del trabajo por parámetro a través de los dieciocho manejadores y todas
 * sus funciones intermedias, o tenerlo disponible en el ámbito de la ejecución. Lo primero significa
 * tocar todo el código y confiar en que nadie se olvide de pasarlo; y lo que se puede olvidar, se
 * olvida — así fue como ocho agentes acabaron recibiendo contenido sin acotar.
 *
 * `AsyncLocalStorage` mantiene el contexto a través de los `await` sin variables globales ni riesgo
 * de que dos trabajos concurrentes se pisen: cada ejecución tiene su propio almacén.
 *
 * Fuera de un trabajo —una ruta API que llama al modelo directamente— no hay contexto y las
 * funciones no hacen nada. Eso es correcto: no hay trabajo al que atribuirle la procedencia.
 */
/**
 * `hasta`: cuándo se corta la función que corre el trabajo (el drenaje en Vercel), en ms desde 1970. Las llamadas largas
 * al modelo lo usan para no empezar lo que no alcanzan a terminar (provider.ts, `hasta`). El worker local no lo pone.
 */
export type ContextoJob = { jobId: string; companyId: string | null; tipo: string; hasta?: number };

const almacen = new AsyncLocalStorage<ContextoJob>();

/** Corre `fn` con el trabajo como contexto ambiental. Lo usa el worker, y nadie más debería. */
export function conTrabajo<T>(ctx: ContextoJob, fn: () => Promise<T>): Promise<T> {
  return almacen.run(ctx, fn);
}

export const trabajoActual = (): ContextoJob | undefined => almacen.getStore();

/** Referencia a una fuente: id, nombre y fecha. NUNCA el contenido. */
export type RefFuente = { id: string; nombre: string; version: string | null };

/**
 * Anota qué fuentes leyó el trabajo en curso. Se guardan REFERENCIAS con su fecha, no copias: el
 * contenido ya vive en `sources` y duplicarlo multiplicaría la superficie de exposición del material
 * del cliente sin añadir nada que la referencia no dé.
 *
 * Es acumulativo e idempotente: un manejador que lee fuentes en dos tandas las suma sin repetirlas.
 * Nunca lanza — perder la anotación de procedencia no puede tumbar el trabajo que la produce.
 */
export async function anotarFuentes(ids: string[]): Promise<void> {
  const ctx = trabajoActual();
  if (!ctx || ids.length === 0) return;
  try {
    const sb = supabaseAdmin();
    const [{ data: fuentes }, { data: job }] = await Promise.all([
      sb.from("sources").select("id,nombre,fecha_origen").in("id", [...new Set(ids)]),
      sb.from("jobs").select("fuentes_usadas").eq("id", ctx.jobId).maybeSingle(),
    ]);
    const previas = (job?.fuentes_usadas ?? []) as RefFuente[];
    const vistas = new Set(previas.map((f) => f.id));
    const nuevas: RefFuente[] = (fuentes ?? [])
      .filter((f) => !vistas.has(f.id))
      .map((f) => ({ id: f.id, nombre: f.nombre, version: f.fecha_origen ?? null }));
    if (nuevas.length === 0) return;
    await sb.from("jobs").update({ fuentes_usadas: [...previas, ...nuevas] }).eq("id", ctx.jobId);
  } catch {
    // Silencio deliberado y acotado: esto es observabilidad, no el trabajo. Si falla, el inspector
    // mostrará el hueco — que es exactamente lo que debe mostrar cuando no se registró nada.
  }
}

/** Las fuentes de las que salieron unas afirmaciones. Para manejadores que leen claims, no sources. */
export async function anotarFuentesDeClaims(claimIds: string[]): Promise<void> {
  const ctx = trabajoActual();
  if (!ctx || claimIds.length === 0) return;
  try {
    const { data } = await supabaseAdmin().from("claims").select("source_id").in("id", [...new Set(claimIds)]).not("source_id", "is", null);
    await anotarFuentes([...new Set((data ?? []).map((c) => String(c.source_id)))]);
  } catch {
    // Mismo criterio: la procedencia no puede tumbar el trabajo.
  }
}
