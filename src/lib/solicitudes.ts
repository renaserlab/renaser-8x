/**
 * LO QUE LA CONSULTORA LE PIDE AL CLIENTE (16-10-2026).
 *
 * Kelin: «si hay cosas por corroborar, yo activarle esa vista y que lo llene; si le falta algo, yo activarlo y lo
 * llene». Una solicitud es eso: la consultora abre una sección para la empresa, con una nota opcional, y el dueño la
 * llena y la marca como lista. Mientras no esté abierta, el dueño ve lo suyo pero no escribe en las tablas nuevas
 * (productos, costos, historia, moneda, crédito, inventario): así nadie le cambia a la consultora los números entre
 * una revisión y la otra sin que ella lo haya pedido.
 *
 * Las secciones de «confirmar» y «subir» llevan a pantallas que ya existían (validar, números, activos, procesos):
 * la solicitud allí es el pedido y su aviso; esas pantallas siguen con sus propias reglas.
 *
 * Una sola solicitud activa por sección y empresa (índice único parcial en la base). Retirada = la consultora la
 * quitó: el dueño ya no la ve. Completada = el dueño dijo que ya lo llenó.
 *
 * SERVIDOR. El vocabulario puro (SECCIONES, SECCION, abiertas…) vive en src/lib/secciones.ts y se re-exporta aquí
 * con los mismos nombres; un componente de cliente lo importa de allá, porque este archivo trae src/lib/auth.ts.
 */
import { AccesoDenegado, type Perfil } from "./auth";
import { supabaseAdmin } from "./supabase/admin";
import { TEXTO_SECCION_CERRADA, esSeccion, solicitudDesdeFila, type Seccion, type Solicitud } from "./secciones";

export {
  SECCIONES, SECCIONES_QUE_ABREN_ESCRITURA, SECCION, GRUPOS_SECCION, TEXTO_SECCION_CERRADA, TEXTO_YA_LISTO, PANTALLA_CONDICIONAL,
  abiertas, esSeccion, solicitudDesdeFila, pantallasOcultas,
  type Seccion, type DefSeccion, type Solicitud, type EstadoSolicitud,
} from "./secciones";

/** Error de lectura con el código de Postgres, para distinguir «falta la migración» de un fallo de verdad. */
export class ErrorDeSolicitud extends Error {
  constructor(mensaje: string, readonly codigo: string | null = null) {
    super(mensaje);
    this.name = "ErrorDeSolicitud";
  }
}

/** ¿El fallo dice que la tabla o una columna no existe todavía (migración sin aplicar)? */
export const faltaLaTabla = (codigo: string | null | undefined): boolean => ["42P01", "42703", "PGRST204", "PGRST205"].includes(codigo ?? "");

/** Las columnas que se le leen al dueño: sin quién activó ni cuándo se retiró. */
export const COLUMNAS_SOLICITUD_DUENO = "id,seccion,nota,estado,activada_at,completada_at";
const COLUMNAS_SOLICITUD = "id,company_id,seccion,nota,estado,activada_at,completada_at,retirada_at,activada_por,completada_por";

/**
 * Las solicitudes de una empresa, las más recientes primero (tope 200). `paraDueno`: sin las retiradas y con las
 * columnas que le tocan, filtrado en la consulta (no al pintar).
 */
export async function listarSolicitudes(companyId: string, o: { paraDueno?: boolean } = {}): Promise<Solicitud[]> {
  let q = supabaseAdmin().from("solicitudes_cliente").select(o.paraDueno ? COLUMNAS_SOLICITUD_DUENO : COLUMNAS_SOLICITUD).eq("company_id", companyId);
  if (o.paraDueno) q = q.in("estado", ["activa", "completada"]);
  const { data, error } = await q.order("activada_at", { ascending: false }).limit(200);
  if (error) throw new ErrorDeSolicitud(error.message, error.code ?? null);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((f) => solicitudDesdeFila(f, companyId)).filter((s): s is Solicitud => s !== null);
}

/** ¿Hay una solicitud activa de esa sección? Si la tabla no existe todavía, no: nada está abierto. */
export async function seccionAbierta(companyId: string, seccion: Seccion): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("solicitudes_cliente").select("id").eq("company_id", companyId).eq("seccion", seccion).eq("estado", "activa").limit(1);
  if (error) {
    if (faltaLaTabla(error.code)) return false;
    throw new ErrorDeSolicitud(error.message, error.code ?? null);
  }
  return (data ?? []).length > 0;
}

/** La membresía del cliente en la empresa: dueno, lider, participante, o null si no tiene. */
export async function nivelEnEmpresa(userId: string, companyId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("memberships").select("nivel").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  return (data as { nivel?: string | null } | null)?.nivel ?? null;
}

/**
 * ¿Puede esta persona escribir en esta sección AHORA? Consultora: siempre. Cliente: si es dueño o líder de la empresa
 * Y hay una solicitud activa de esa sección. Si no, AccesoDenegado con TEXTO_SECCION_CERRADA: protegido() responde
 * 403 y deja el intento en el rastro.
 */
export async function exigirLlenado(perfil: Perfil, companyId: string, seccion: Seccion): Promise<void> {
  if (perfil.rol === "consultor") return;
  const nivel = await nivelEnEmpresa(perfil.id, companyId);
  if (nivel !== "dueno" && nivel !== "lider") throw new AccesoDenegado(TEXTO_SECCION_CERRADA, "autoridad", companyId);
  if (!(await seccionAbierta(companyId, seccion))) throw new AccesoDenegado(TEXTO_SECCION_CERRADA, "autoridad", companyId);
}

/**
 * Las secciones con una solicitud activa (sin repetir): el aviso junto a «Inicio» y qué pantallas de «Mi empresa» se
 * ven (pantallasOcultas). Una sola lectura, chica (a lo más una por sección). Si no se pudo leer, null: no se inventa
 * «nada abierto».
 */
export async function seccionesAbiertas(companyId: string): Promise<Seccion[] | null> {
  const { data, error } = await supabaseAdmin().from("solicitudes_cliente").select("seccion").eq("company_id", companyId).eq("estado", "activa").limit(50);
  if (error) return null;
  return [...new Set(((data ?? []) as { seccion: unknown }[]).map((f) => f.seccion).filter(esSeccion))];
}

/** Cuántas solicitudes activas tiene la empresa (el aviso junto a «Inicio»). Si no se pudo leer, null: no se inventa un cero. */
export async function contarAbiertas(companyId: string): Promise<number | null> {
  const { count, error } = await supabaseAdmin().from("solicitudes_cliente").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("estado", "activa");
  if (error) return null;
  return count ?? 0;
}
