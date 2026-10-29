import { supabaseAdmin } from "./supabase/admin";

/**
 * QUIÉN CAMBIÓ QUÉ, EN TODA LA CASA.
 *
 * POR QUÉ EXISTE (18-10-2026). 8X deja de tener una sola consultora. Cada una trabaja su cartera —su
 * entorno—, y eso es lo que ve al entrar. Pero quien administra la casa pidió una cosa concreta: «si
 * alguna modificación, pues yo también verlo». Hasta hoy el rastro existía por empresa
 * (`rastroDeEmpresa`) y no había dónde mirarlo entero: para enterarse de un cambio había que saber de
 * antemano en qué empresa buscarlo, que es justo lo contrario de enterarse.
 *
 * QUÉ ENTRA Y QUÉ NO. Solo lo que CAMBIA algo: crear, editar, eliminar, publicar y aprobar. Mirar no
 * es modificar, y meter cada `ver` convertiría el registro en ruido donde el cambio se pierde. Los
 * intentos denegados sí entran: un acceso rechazado es, de las dos, la noticia más importante.
 */
export const ACCIONES_QUE_CAMBIAN = ["crear", "editar", "eliminar", "publicar", "aprobar", "denegado"] as const;

export type Modificacion = {
  id: number;
  cuando: string;
  accion: string;
  entidad: string | null;
  ruta: string | null;
  company_id: string | null;
  empresa: string | null;
  quien: string;
  rol: string | null;
  /** Qué campos se tocaron, si la ruta los dejó dichos. Vacío no es «nada»: es «no quedó dicho». */
  campos: string[];
};

type Fila = {
  id: number;
  created_at: string;
  accion: string;
  entidad: string | null;
  ruta: string | null;
  company_id: string | null;
  actor_rol: string | null;
  detalle: Record<string, unknown> | null;
  actor?: { nombre: string | null; email: string | null } | null;
  empresa?: { nombre: string | null } | null;
};

/** Los campos tocados, cuando la ruta los dejó escritos en el detalle. */
function camposDe(detalle: Record<string, unknown> | null): string[] {
  const c = detalle?.campos;
  return Array.isArray(c) ? c.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Las últimas modificaciones de TODAS las empresas. Solo la llama quien administra 8X: la ruta
 * comprueba la autoridad antes, no esta función.
 *
 * `desde` permite preguntar «qué pasó desde que me fui», que es como se usa de verdad: se abre por la
 * mañana y lo que importa es lo de anoche, no las últimas cien filas de siempre.
 */
export async function modificacionesDeLaCasa(opciones: { limite?: number; desde?: string } = {}): Promise<Modificacion[]> {
  const limite = Math.min(Math.max(opciones.limite ?? 80, 1), 300);
  let q = supabaseAdmin()
    .from("audit_log")
    .select(
      "id,created_at,accion,entidad,ruta,company_id,actor_rol,detalle,actor:users!audit_log_actor_id_fkey(nombre,email),empresa:companies(nombre)"
    )
    .in("accion", ACCIONES_QUE_CAMBIAN as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(limite);
  if (opciones.desde) q = q.gte("created_at", opciones.desde);

  const { data, error } = await q;
  // Si no se pudo leer, se dice lanzando: una lista vacía se leería como «no hubo modificaciones»,
  // que es exactamente la confusión que este registro existe para evitar.
  if (error) throw new Error(`No se pudo leer el registro de modificaciones: ${error.message}`);

  return ((data ?? []) as unknown as Fila[]).map((f) => ({
    id: f.id,
    cuando: f.created_at,
    accion: f.accion,
    entidad: f.entidad,
    ruta: f.ruta,
    company_id: f.company_id,
    empresa: f.empresa?.nombre ?? null,
    quien: f.actor?.nombre?.trim() || f.actor?.email || "sin registrar",
    rol: f.actor_rol,
    campos: camposDe(f.detalle),
  }));
}

/** Cómo se lee cada acción en pantalla. En la voz de la casa, no en la del registro. */
export const COMO_SE_LEE: Record<string, string> = {
  crear: "creó",
  editar: "cambió",
  eliminar: "borró",
  publicar: "publicó",
  aprobar: "aprobó",
  denegado: "intentó entrar y se le negó",
};

/**
 * Una modificación, dicha en una frase. Lo que no quedó registrado se dice así —«en una empresa sin
 * registrar», «no quedó dicho qué campos»— en vez de omitirse: un hueco que no se ve se lee como que
 * no hay hueco.
 */
export function enUnaFrase(m: Modificacion): string {
  const que = COMO_SE_LEE[m.accion] ?? m.accion;
  const donde = m.empresa ? `en ${m.empresa}` : m.company_id ? "en una empresa que ya no está" : "fuera de una empresa";
  const sobre = m.entidad ? ` el ${m.entidad.replace(/_/g, " ")}` : "";
  const campos = m.campos.length ? ` (${m.campos.join(", ")})` : "";
  return `${m.quien} ${que}${sobre}${campos} ${donde}`;
}

/** Agrupadas por día, que es como se mira: «esto pasó ayer». La clave es la fecha en Lima. */
export function porDia(ms: readonly Modificacion[], zona = "America/Lima"): { dia: string; modificaciones: Modificacion[] }[] {
  const dias = new Map<string, Modificacion[]>();
  for (const m of ms) {
    const dia = new Intl.DateTimeFormat("es-PE", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(m.cuando));
    dias.set(dia, [...(dias.get(dia) ?? []), m]);
  }
  return [...dias.entries()].map(([dia, modificaciones]) => ({ dia, modificaciones }));
}
