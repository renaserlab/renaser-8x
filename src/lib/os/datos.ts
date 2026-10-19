/**
 * RENASER OS · LECTURAS QUE COMPARTEN VARIAS PANTALLAS. Siempre con la credencial del servidor y SIEMPRE filtrando por
 * la empresa del contexto: la frontera es esta (las tablas os_* no dan permisos al navegador). Lo propio de una sola
 * pantalla vive junto a ella; aquí solo lo que se repite.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { COLUMNAS_PERSONA, type ContextoOS, type PersonaOS } from "./acceso";
import type { RegistroTiempo, TareaOS } from "./calculos";

export const COLUMNAS_TAREA = "id,persona_id,proyecto_id,titulo,descripcion,estado,prioridad,fecha_inicio,fecha_limite,completada_at,created_at,updated_at";
export const COLUMNAS_REGISTRO = "id,tarea_id,persona_id,inicio,fin,nota";

export type Aviso = {
  id: string;
  persona_id: string | null;
  para_gestion: boolean;
  regla: "inactividad" | "bloqueos" | "plan" | "cierre_semanal" | "diagnostico";
  titulo: string;
  detalle: string | null;
  enlace: string | null;
  /** La regla arma la suya («bloqueo:<id>»…); los que deja la gestión a mano empiezan por «manual:». */
  clave: string;
  leido_at: string | null;
  created_at: string;
};

export type Bloqueo = { id: string; tarea_id: string; persona_id: string; causa: string; depende_de: string | null; desde: string; hasta: string | null };
export type Apertura = { id: string; persona_id: string; fecha: string; animo: number; compromiso: string | null; created_at: string };

/**
 * Los avisos que le tocan a quien entra: los suyos y, si es gestión, los de la gestión. Un aviso de gestión lo marca
 * leído cualquiera de la gestión: es uno solo para el equipo que dirige, no uno por cabeza.
 */
function filtroAvisos(c: ContextoOS) {
  const propios = c.persona ? `persona_id.eq.${c.persona.id}` : null;
  return [propios, c.gestion ? "para_gestion.eq.true" : null].filter(Boolean).join(",");
}

export async function avisosSinLeer(c: ContextoOS): Promise<number> {
  const filtro = filtroAvisos(c);
  if (!filtro) return 0;
  const { count } = await supabaseAdmin().from("os_avisos").select("id", { count: "exact", head: true }).eq("company_id", c.companyId).is("leido_at", null).or(filtro);
  return count ?? 0;
}

export async function avisosDe(c: ContextoOS, limite = 100): Promise<Aviso[]> {
  const filtro = filtroAvisos(c);
  if (!filtro) return [];
  const { data } = await supabaseAdmin()
    .from("os_avisos")
    .select("id,persona_id,para_gestion,regla,titulo,detalle,enlace,clave,leido_at,created_at")
    .eq("company_id", c.companyId)
    .or(filtro)
    .order("created_at", { ascending: false })
    .limit(limite);
  return (data ?? []) as Aviso[];
}

export async function personasDeLaEmpresa(companyId: string, { soloActivas = true } = {}): Promise<PersonaOS[]> {
  let q = supabaseAdmin().from("os_personas").select(COLUMNAS_PERSONA).eq("company_id", companyId).order("nombre");
  if (soloActivas) q = q.eq("activo", true);
  const { data } = await q;
  return (data ?? []) as PersonaOS[];
}

export async function tareasDe(companyId: string, personaIds?: readonly string[]): Promise<TareaOS[]> {
  let q = supabaseAdmin().from("os_tareas").select(COLUMNAS_TAREA).eq("company_id", companyId);
  if (personaIds) {
    if (!personaIds.length) return [];
    q = q.in("persona_id", [...personaIds]);
  }
  const { data } = await q.order("created_at");
  return (data ?? []) as TareaOS[];
}

/** Tramos de cronómetro desde un instante (incluye el que siga corriendo aunque haya empezado antes). */
export async function registrosDesde(companyId: string, desde: string, personaIds?: readonly string[]): Promise<RegistroTiempo[]> {
  const sb = supabaseAdmin();
  let q = sb.from("os_registros_tiempo").select(COLUMNAS_REGISTRO).eq("company_id", companyId).or(`inicio.gte.${desde},fin.is.null,fin.gte.${desde}`);
  if (personaIds) q = q.in("persona_id", [...personaIds]);
  const { data } = await q.order("inicio");
  return (data ?? []) as RegistroTiempo[];
}

export async function cronometroDe(personaId: string): Promise<RegistroTiempo | null> {
  const { data } = await supabaseAdmin().from("os_registros_tiempo").select(COLUMNAS_REGISTRO).eq("persona_id", personaId).is("fin", null).maybeSingle();
  return (data as RegistroTiempo | null) ?? null;
}

export async function bloqueosAbiertos(companyId: string): Promise<Bloqueo[]> {
  const { data } = await supabaseAdmin().from("os_bloqueos").select("id,tarea_id,persona_id,causa,depende_de,desde,hasta").eq("company_id", companyId).is("hasta", null);
  return (data ?? []) as Bloqueo[];
}

export async function aperturasEntre(companyId: string, desde: string, hasta: string): Promise<Apertura[]> {
  const { data } = await supabaseAdmin().from("os_aperturas").select("id,persona_id,fecha,animo,compromiso,created_at").eq("company_id", companyId).gte("fecha", desde).lte("fecha", hasta);
  return (data ?? []) as Apertura[];
}
