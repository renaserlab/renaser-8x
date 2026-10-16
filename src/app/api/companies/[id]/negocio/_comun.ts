import { fallo, AccesoDenegado } from "@/lib/api";
import type { Perfil } from "@/lib/auth";
import { registrarError } from "@/lib/errores";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirLlenado, type Seccion } from "@/lib/solicitudes";
import { faltaMigracionNegocio, TEXTO_FALTA_MIGRACION } from "@/lib/negocio-datos";

/**
 * LO QUE COMPARTEN LAS RUTAS DE «LO QUE EL CLIENTE LLENA HOY» (16-10-2026): solicitudes, costos, negocio, moneda y
 * ruta. Vive aparte porque un archivo de ruta de Next solo puede exportar métodos HTTP.
 */

type ErrorBase = { message?: string | null; code?: string | null } | null | undefined;

/**
 * La respuesta a un fallo de la base, en palabras. Si es que la tabla o la columna todavía no existe (la migración
 * del 16-10 sin aplicar), 409 con qué falta; si es otra cosa, 500 con una frase, y el mensaje de la base va al
 * registro de errores que revisa la consultora (no a la pantalla del dueño).
 */
export function respuestaDeBase(error: ErrorBase, e: { ruta: string; metodo: string; que: string; perfil: Perfil; companyId: string }) {
  if (faltaMigracionNegocio(error?.code)) return fallo(TEXTO_FALTA_MIGRACION, 409);
  void registrarError({ ruta: e.ruta, metodo: e.metodo, mensaje: `No se pudo ${e.que}`, detalle: error?.message ?? null, actorId: e.perfil.id, companyId: e.companyId });
  return fallo(`No pudimos ${e.que}. Inténtalo de nuevo.`, 500);
}

/** Basta con que UNA de esas secciones esté abierta (los módulos los puede marcar quien llena productos, moneda, crédito o inventario). */
export async function exigirAlgunaSeccion(perfil: Perfil, companyId: string, secciones: Seccion[]): Promise<void> {
  let primero: unknown = null;
  for (const s of secciones) {
    try {
      await exigirLlenado(perfil, companyId, s);
      return;
    } catch (e) {
      if (!(e instanceof AccesoDenegado)) throw e;
      primero ??= e;
    }
  }
  throw primero;
}

export type Modulo = "moneda" | "credito" | "inventario";

/**
 * Para escribir un módulo (ventas en otra moneda, venta al crédito, mercadería guardada): su propia sección abierta, o
 * «productos» abierta Y la empresa ya respondió «sí» a esa pregunta (ficha_negocio.modulos). Así los módulos se
 * encienden con una pregunta: si el dueño dice «Sí, me pagan en otra moneda» mientras llena lo que vende, puede llenar
 * ese bloque sin que la consultora tenga que adivinar de antemano que exporta. Si no, el AccesoDenegado de la sección
 * del módulo (texto de sección cerrada, 403 y queda en el rastro).
 */
export async function exigirModulo(perfil: Perfil, companyId: string, modulo: Modulo): Promise<void> {
  if (perfil.rol === "consultor") return;
  let primero: AccesoDenegado;
  try {
    await exigirLlenado(perfil, companyId, modulo);
    return;
  } catch (e) {
    if (!(e instanceof AccesoDenegado)) throw e;
    primero = e;
  }
  try {
    await exigirLlenado(perfil, companyId, "productos");
  } catch (e) {
    if (!(e instanceof AccesoDenegado)) throw e;
    throw primero;
  }
  const { data, error } = await supabaseAdmin().from("ficha_negocio").select("modulos").eq("company_id", companyId).maybeSingle();
  if (error) {
    if (faltaMigracionNegocio(error.code)) throw primero;
    throw new Error(`No se pudo leer qué respondió la empresa: ${error.message}`);
  }
  const modulos = (data as { modulos?: Record<string, unknown> | null } | null)?.modulos ?? {};
  if (modulos[modulo] !== true) throw primero;
}

/** El texto del 409 cuando el dueño intenta cambiar algo que la consultora ya comprobó con un documento. */
export const textoComprobadoFila = (que: string) => `${que} ya está comprobado con un documento y no se cambió. Si cambió, díselo a tu consultora.`;
