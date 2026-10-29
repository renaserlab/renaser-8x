import { supabaseAdmin } from "./supabase/admin";
import { AccesoDenegado, type Perfil } from "./auth";

/**
 * AUTORIDAD: quién puede aprobar. Hasta el 13-10-2026 cualquier consultor aprobaba cualquier cosa y
 * cualquier dueño aprobaba sus documentos: la única pregunta era «¿tiene sesión y pertenece?». Esta es
 * la tercera pregunta, distinta de las dos anteriores (`auth.ts`): tener acceso a una empresa no es lo
 * mismo que poder comprometerla con una aprobación.
 *
 * Dónde vive: `users.autoridad text[]` (migracion-autoridad.sql). Vacía significa «no configurada», y
 * entonces rige lo que cada rol podía hacer hasta hoy: así la consultora no pierde nada el día que la
 * migración se aplique, y nada cambia para los dueños hasta que alguien decida restringir.
 */
export const ACCIONES_AUTORIDAD = ["aprobar_plan", "aprobar_hallazgo", "cerrar_medicion", "administrar", "ver_todo"] as const;
export type AccionAutoridad = (typeof ACCIONES_AUTORIDAD)[number];

/** Valor explícito para «esta persona no aprueba nada»: distinto de la lista vacía, que es «no configurado». */
export const SIN_AUTORIDAD = "ninguna";

/** Cómo se le dice a cada autoridad a la persona que no la tiene. */
export const QUE_SIGNIFICA: Record<AccionAutoridad, string> = {
  aprobar_plan: "aprobar o publicar el plan y sus documentos",
  aprobar_hallazgo: "aprobar, corregir o rechazar un hallazgo",
  cerrar_medicion: "congelar una medición o cerrar un corte",
  administrar: "gestionar personas y accesos",
  ver_todo: "ver todas las empresas y el registro de modificaciones de la casa",
};

/**
 * ADMINISTRADOR DE 8X. Es `ver_todo`, y es lo que distingue a quien lleva la casa de quien lleva una
 * cartera: ve todas las empresas, estén asignadas a quien estén, y ve el registro de quién cambió qué.
 *
 * Por qué existe (18-10-2026): 8X pasa a tener más de una consultora. Cada una trabaja su cartera —su
 * entorno— y eso es lo que ve al entrar; pero quien administra la casa tiene que poder ver cualquier
 * empresa y, sobre todo, enterarse de una modificación sin que nadie se la cuente.
 */
export function esAdministradorDe8X(perfil: Pick<Perfil, "rol" | "autoridad">): boolean {
  return tieneAutoridad(perfil, "ver_todo");
}

/**
 * LO QUE CADA ROL PUEDE HACER HOY sin que nadie se lo haya dado. Es la compatibilidad: la consultora
 * revisa hallazgos, pide y publica planes, cierra cortes y administra; el dueño aprueba los documentos
 * de su empresa (deliverables/aprobar) y congela sus mediciones (medicion). Ninguna ruta permitía más.
 */
const POR_DEFECTO: Record<Perfil["rol"], readonly AccionAutoridad[]> = {
  // `ver_todo` entra en el valor por defecto a propósito: hasta hoy TODA consultora veía todas las
  // empresas, y quitárselo con una migración dejaría a alguien sin su trabajo de un día para otro. La
  // separación por cartera se enciende dándole a cada quien su lista explícita, no quitándosela a todos.
  consultor: ACCIONES_AUTORIDAD,
  cliente: ["aprobar_plan", "cerrar_medicion"],
};

function esAccion(x: string): x is AccionAutoridad {
  return (ACCIONES_AUTORIDAD as readonly string[]).includes(x);
}

/** Las autoridades efectivas: las explícitas si hay alguna (o «ninguna»); si no, las del rol. Valores desconocidos se ignoran. */
export function autoridadesDe(perfil: Pick<Perfil, "rol" | "autoridad">): readonly AccionAutoridad[] {
  const crudas = perfil.autoridad ?? [];
  if (crudas.includes(SIN_AUTORIDAD)) return [];
  const explicitas = crudas.filter(esAccion);
  return explicitas.length ? explicitas : POR_DEFECTO[perfil.rol];
}

/** La regla, pura y sin base: ¿tiene esta persona esta autoridad? */
export function tieneAutoridad(perfil: Pick<Perfil, "rol" | "autoridad">, accion: AccionAutoridad): boolean {
  return autoridadesDe(perfil).includes(accion);
}

/**
 * Lee `users.autoridad`. Si la columna no existe todavía (migración sin aplicar), si la fila no está o
 * si la lectura falla, devuelve [] y rige la regla por defecto, que es la de hoy. Fallar aquí jamás
 * puede dejar a la consultora fuera de su propio sistema: esa es la decisión, y es deliberada.
 */
async function autoridadGuardada(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin().from("users").select("autoridad").eq("id", userId).maybeSingle();
    if (error || !data) return [];
    const v = (data as { autoridad?: unknown }).autoridad;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Exige la autoridad antes de aprobar. Se llama DESPUÉS de `protegido()` (sesión) y de `exigirAcceso`
 * (pertenencia): el orden es el de las preguntas. Si el perfil ya trae `autoridad`, no se consulta la base.
 */
export async function exigirAutoridad(perfil: Perfil, accion: AccionAutoridad): Promise<void> {
  const autoridad = perfil.autoridad ?? (await autoridadGuardada(perfil.id));
  if (!tieneAutoridad({ rol: perfil.rol, autoridad }, accion)) {
    throw new AccesoDenegado(`No tienes autoridad para ${QUE_SIGNIFICA[accion]}.`, "autoridad");
  }
}
