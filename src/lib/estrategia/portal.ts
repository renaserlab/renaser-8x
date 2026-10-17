/**
 * LO QUE EL DUEÑO VE DE LA ESTRATEGIA, LEÍDO DE LA BASE (spec-estrategia-8x.md §7.3 y §8.2). SERVIDOR.
 *
 * Las páginas del portal no leen `estrategias` por su cuenta: leen esto. Y esto lee lo mínimo, FILTRADO EN LA
 * CONSULTA (tests/limite-cliente-consultora.test.ts):
 *  - `caminoAprobadoParaDueno`: de `estrategias`, solo la versión APROBADA de su empresa y solo cuatro columnas
 *    (id, version, para_dueno, aprobada_at). `para_dueno` es la página que se congeló al aprobar, con las cifras ya
 *    escritas: el otro camino, el análisis, los cálculos y los ids no están en esa columna ni se piden.
 *  - `preguntasDelDueno`: de `estrategia_preguntas`, solo las enviadas y las respondidas de su empresa, sin el porqué
 *    para la consultora, sin la clave del catálogo y sin las jugadas que esperan cada respuesta.
 *  - `preguntasPendientes`: cuántas enviadas siguen sin responder y si su pedido está abierto (para la línea de «Tu
 *    plan»: solo se ofrece «Responder» donde de verdad se puede responder).
 * `estrategia_ediciones` (lo que corrigió la consultora) no se lee nunca desde el portal.
 *
 * Una base sin la migración de la estrategia no es un fallo para el dueño: no hay nada aprobado y su página es la de
 * siempre. Cualquier otro fallo se dice (nada falla en silencio), sin el mensaje crudo de la base.
 */
import { supabaseAdmin } from "../supabase/admin";
import { seccionAbierta } from "../solicitudes";
import { FORMATO_PARA_DUENO, type FraseDueno, type ParaDueno } from "./para-dueno";
import { COLUMNAS_PREGUNTA_DUENO } from "./preguntas";
import { preguntaDesdeFila, type PreguntaDueno } from "./dueno";
import { faltaLaMigracion } from "./resultado";

/** Las únicas columnas de `estrategias` que llegan al portal. */
export const COLUMNAS_CAMINO_DUENO = "id,version,para_dueno,aprobada_at";
/** Cuántas preguntas se leen como mucho (las de varios envíos juntas). */
const TOPE_PREGUNTAS = 200;

export type CaminoDelDueno = { id: string; version: number; para_dueno: ParaDueno; aprobada_at: string | null };

/**
 * Lo que hay del camino: el aprobado; ninguno (todavía no se aprobó, o la base no tiene la estrategia); uno guardado
 * con una forma que esta versión de 8X no sabe pintar («anterior»); o una lectura que falló.
 */
export type LecturaCamino = { estado: "aprobado"; camino: CaminoDelDueno } | { estado: "ninguno" } | { estado: "anterior" } | { estado: "no_se_pudo" };

const esTrozo = (x: unknown): boolean => {
  if (!x || typeof x !== "object") return false;
  const t = x as { t?: unknown; texto?: unknown; chip?: unknown };
  if (typeof t.texto !== "string") return false;
  return t.t === "texto" || t.t === "falta" || (t.t === "cifra" && typeof t.chip === "string");
};
const esFrase = (x: unknown): x is FraseDueno => Array.isArray(x) && x.every(esTrozo);
const esFraseONula = (x: unknown) => x == null || esFrase(x);
const lista = (x: unknown, cada: (y: Record<string, unknown>) => boolean) => Array.isArray(x) && x.every((y) => !!y && typeof y === "object" && cada(y as Record<string, unknown>));

/**
 * ¿Es una página del dueño que esta versión de 8X sabe pintar? Se comprueba la forma entera antes de mostrarla: una
 * columna con otra forma no se pinta a medias (ni con un hueco, ni con un JSON).
 */
export function esParaDueno(x: unknown): x is ParaDueno {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  const esperamos = p.esperamos as Record<string, unknown> | null | undefined;
  return (
    p.formato === FORMATO_PARA_DUENO &&
    esFrase(p.titulo) &&
    esFrase(p.por_que) &&
    lista(p.pasos, (y) => esFrase(y.que) && (y.desde_dia == null || typeof y.desde_dia === "number") && (y.quien == null || typeof y.quien === "string")) &&
    !!esperamos &&
    typeof esperamos === "object" &&
    esFraseONula(esperamos.d30) &&
    esFraseONula(esperamos.d90) &&
    (esperamos.falta == null || typeof esperamos.falta === "string") &&
    Array.isArray(p.te_pedimos) &&
    p.te_pedimos.every(esFrase) &&
    lista(p.como_sabremos, (y) => esFrase(y.senal) && typeof y.dia === "number") &&
    lista(p.casos, (y) => esFrase(y.si_pasa) && esFrase(y.haremos))
  );
}

/** La versión aprobada de la estrategia de una empresa, como la ve su dueño. */
export async function caminoAprobadoParaDueno(companyId: string): Promise<LecturaCamino> {
  try {
    const { data, error } = await supabaseAdmin().from("estrategias").select(COLUMNAS_CAMINO_DUENO).eq("company_id", companyId).eq("estado", "aprobada").limit(1).maybeSingle();
    if (error) {
      if (faltaLaMigracion(error.code)) return { estado: "ninguno" };
      console.error("[estrategia] no se pudo leer el camino aprobado", error);
      return { estado: "no_se_pudo" };
    }
    if (!data) return { estado: "ninguno" };
    const f = data as unknown as Record<string, unknown>;
    if (!esParaDueno(f.para_dueno)) return { estado: "anterior" };
    return {
      estado: "aprobado",
      camino: { id: String(f.id), version: Number(f.version), para_dueno: f.para_dueno, aprobada_at: typeof f.aprobada_at === "string" ? f.aprobada_at : null },
    };
  } catch (e) {
    console.error("[estrategia] no se pudo leer el camino aprobado", e);
    return { estado: "no_se_pudo" };
  }
}

export type LecturaPreguntas = { ok: true; preguntas: PreguntaDueno[] } | { ok: false; falta: boolean };

/**
 * Las preguntas de la estrategia que su consultora le envió al dueño (y las que ya respondió), en el orden en que se
 * propusieron. `falta`: la base no tiene esta parte todavía (no es un error del dueño).
 */
export async function preguntasDelDueno(companyId: string): Promise<LecturaPreguntas> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("estrategia_preguntas")
      .select(COLUMNAS_PREGUNTA_DUENO)
      .eq("company_id", companyId)
      .in("estado", ["enviada", "respondida"])
      .order("created_at", { ascending: true })
      .limit(TOPE_PREGUNTAS);
    if (error) {
      if (!faltaLaMigracion(error.code)) console.error("[estrategia] no se pudieron leer las preguntas del dueño", error);
      return { ok: false, falta: faltaLaMigracion(error.code) };
    }
    const preguntas = ((data ?? []) as unknown as Record<string, unknown>[]).map(preguntaDesdeFila).filter((p): p is PreguntaDueno => p !== null);
    return { ok: true, preguntas };
  } catch (e) {
    console.error("[estrategia] no se pudieron leer las preguntas del dueño", e);
    return { ok: false, falta: false };
  }
}

export type PreguntasPendientes = { sin_responder: number; abierta: boolean };

/**
 * Cuántas preguntas enviadas siguen sin responder y si su pedido está abierto. null si no se pudo saber (o la base no
 * tiene esta parte): entonces no se ofrece la línea, en vez de prometer algo que la ruta rechazaría.
 */
export async function preguntasPendientes(companyId: string): Promise<PreguntasPendientes | null> {
  try {
    const [{ count, error }, abierta] = await Promise.all([
      supabaseAdmin().from("estrategia_preguntas").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "enviada"),
      seccionAbierta(companyId, "preguntas_estrategia"),
    ]);
    if (error || count == null) return null;
    return { sin_responder: count, abierta };
  } catch (e) {
    console.error("[estrategia] no se pudo contar las preguntas del dueño", e);
    return null;
  }
}
