/**
 * RENASER OS · QUIÉN ENTRA Y QUÉ VE (19-10-2026).
 *
 * Tres maneras de llegar a /os, en este orden:
 *  1. La CONSULTORA mira una empresa con la cookie `ver_como` (la misma de «ver como el empresario»): ve todo, no es
 *     una persona del equipo y no se registra como tal.
 *  2. El DUEÑO (o un líder) tiene membresía de la empresa: además de RENASER OS conserva su portal de consultoría. La
 *     primera vez que entra se le crea su ficha en el equipo (dueño → «dueno», líder → «gerente», participante →
 *     «persona»): sin ficha no tendría tareas ni apertura propias.
 *  3. El PERSONAL no tiene membresía (la membresía abre el portal de la consultoría, que es solo del dueño): entra por su
 *     ficha en `os_personas`, que el dueño creó con su correo y que se enlaza a su cuenta al entrar (aceptarInvitaciones).
 *
 * «Gestión» (dueño, gerente, operaciones, RR.HH. y la consultora) ve «Mi equipo». «Talento» (dueño, gerente, RR.HH. y
 * la consultora) además abre legajos, acompañamiento y evaluaciones 360.
 *
 * Todo se lee y se escribe con la credencial del servidor (las tablas os_* no dan permisos al navegador): esta frontera
 * es la única, por eso cada ruta pasa por `exigirOS` y cada página por `contextoOS`.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { usuarioActual, resolverEmpresaActiva, AccesoDenegado, NoAutenticado, type Perfil } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { zonaDeEmpresa } from "@/lib/revision-semanal";

export type RolOS = "dueno" | "gerente" | "operaciones" | "talento" | "persona";

export const ROLES_OS: readonly RolOS[] = ["dueno", "gerente", "operaciones", "talento", "persona"];
export const ROLES_GESTION: readonly RolOS[] = ["dueno", "gerente", "operaciones", "talento"];
export const ROLES_TALENTO: readonly RolOS[] = ["dueno", "gerente", "talento"];

export const NOMBRE_ROL: Record<RolOS, string> = {
  dueno: "Dueño",
  gerente: "Gerente",
  operaciones: "Operaciones",
  talento: "RR.HH.",
  persona: "Colaborador",
};

export type PersonaOS = {
  id: string;
  company_id: string;
  user_id: string | null;
  email: string | null;
  nombre: string;
  puesto: string | null;
  area: string | null;
  rol: RolOS;
  capacidad_min: number;
  activo: boolean;
  created_at: string;
};

export const COLUMNAS_PERSONA = "id,company_id,user_id,email,nombre,puesto,area,rol,capacidad_min,activo,created_at";

export type ContextoOS = {
  perfil: Perfil;
  companyId: string;
  empresa: string;
  zona: string;
  /** La ficha de quien entra; null cuando mira la consultora. */
  persona: PersonaOS | null;
  rol: RolOS | "consultor";
  gestion: boolean;
  talento: boolean;
  /** ¿Conserva el portal de la consultoría? (tiene membresía, o es la consultora). */
  consultoria: boolean;
  vistaConsultor: boolean;
};

const NIVEL_A_ROL: Record<string, RolOS> = { dueno: "dueno", lider: "gerente", participante: "persona" };

/** La pregunta, sin redirecciones: null si esta persona no tiene RENASER OS en ninguna empresa. */
export async function resolverOS(perfil: Perfil): Promise<ContextoOS | null> {
  const sb = supabaseAdmin();
  let companyId: string | null = null;
  let persona: PersonaOS | null = null;
  let consultoria = false;
  let vistaConsultor = false;

  if (perfil.rol === "consultor") {
    companyId = (await cookies()).get("ver_como")?.value || null;
    if (!companyId) return null;
    vistaConsultor = true;
    consultoria = true;
  } else {
    const r = await resolverEmpresaActiva(perfil.id);
    if (r.companyId) {
      companyId = r.companyId;
      consultoria = true;
      persona = await fichaConMembresia(perfil, companyId);
    } else if (r.estado === "sin_empresa") {
      // Personal sin membresía: su ficha activa. Si estuviera en dos empresas, vale la cookie de empresa activa.
      const { data } = await sb.from("os_personas").select(COLUMNAS_PERSONA).eq("user_id", perfil.id).eq("activo", true).order("created_at");
      const fichas = (data ?? []) as PersonaOS[];
      const cookie = (await cookies()).get("empresa_activa")?.value;
      persona = fichas.find((f) => f.company_id === cookie) ?? fichas[0] ?? null;
      companyId = persona?.company_id ?? null;
    }
    if (!persona || !persona.activo) return null;
  }
  if (!companyId) return null;

  const [{ data: empresa }, zona] = await Promise.all([
    sb.from("companies").select("nombre").eq("id", companyId).maybeSingle(),
    zonaDeEmpresa(companyId, sb),
  ]);
  const rol: RolOS | "consultor" = vistaConsultor ? "consultor" : persona!.rol;
  return {
    perfil,
    companyId,
    empresa: empresa?.nombre ?? "Tu empresa",
    zona,
    persona,
    rol,
    gestion: rol === "consultor" || ROLES_GESTION.includes(rol),
    talento: rol === "consultor" || ROLES_TALENTO.includes(rol),
    consultoria,
    vistaConsultor,
  };
}

/** La ficha de quien tiene membresía; la crea la primera vez con el rol que corresponde a su nivel. */
async function fichaConMembresia(perfil: Perfil, companyId: string): Promise<PersonaOS | null> {
  const sb = supabaseAdmin();
  const { data: ya } = await sb.from("os_personas").select(COLUMNAS_PERSONA).eq("company_id", companyId).eq("user_id", perfil.id).maybeSingle();
  if (ya) return ya as PersonaOS;
  const { data: m } = await sb.from("memberships").select("nivel").eq("user_id", perfil.id).eq("company_id", companyId).maybeSingle();
  const rol = NIVEL_A_ROL[String(m?.nivel ?? "dueno")] ?? "persona";
  const email = perfil.email?.toLowerCase() ?? null;
  // Si el dueño ya había cargado una ficha con su propio correo (sin cuenta enlazada), se usa esa en vez de duplicarla.
  if (email) {
    const { data: porCorreo } = await sb.from("os_personas").select(COLUMNAS_PERSONA).eq("company_id", companyId).eq("email", email).is("user_id", null).maybeSingle();
    if (porCorreo) {
      const { data } = await sb.from("os_personas").update({ user_id: perfil.id }).eq("id", porCorreo.id).select(COLUMNAS_PERSONA).single();
      return (data as PersonaOS | null) ?? null;
    }
  }
  // Se crea con upsert que ignora el duplicado y se lee después con otra consulta (con `limit`). Si dos pedidos la crean a
  // la vez (dos pestañas), el segundo no falla. Releer con la MISMA consulta del principio no sirve: dentro de un render,
  // Next memoriza los GET idénticos y devolvería el «no existe» de antes. Ese fue el fallo del 19-10-2026: la primera
  // entrada del dueño a /os lo devolvía al portal.
  await sb
    .from("os_personas")
    .upsert({ company_id: companyId, user_id: perfil.id, email, nombre: perfil.nombre?.trim() || email || "Dueño", rol }, { onConflict: "company_id,user_id", ignoreDuplicates: true });
  const { data } = await sb.from("os_personas").select(COLUMNAS_PERSONA).eq("company_id", companyId).eq("user_id", perfil.id).limit(1);
  return ((data ?? [])[0] as PersonaOS | undefined) ?? null;
}

/** Una sola resolución por petición: el layout y la página la piden los dos. */
const resolverOSUnaVez = cache(resolverOS);

/** Para páginas: sin sesión, a entrar; sin RENASER OS, al portal (que sabe qué decirle a quien no tiene empresa). */
export async function contextoOS(): Promise<ContextoOS> {
  const perfil = await usuarioActual();
  if (!perfil) redirect("/entrar");
  const c = await resolverOSUnaVez(perfil);
  if (!c) redirect(perfil.rol === "consultor" ? "/pulso" : "/portal");
  return c;
}

export async function contextoGestionOS(): Promise<ContextoOS> {
  const c = await contextoOS();
  if (!c.gestion) redirect("/os/mi-trabajo");
  return c;
}

/** Para rutas API (dentro de `protegido`): la misma pregunta, con errores en vez de redirecciones. */
export async function exigirOS(perfil: Perfil, opts: { gestion?: boolean; talento?: boolean; persona?: boolean } = {}): Promise<ContextoOS> {
  if (!perfil) throw new NoAutenticado();
  const c = await resolverOS(perfil);
  if (!c) throw new AccesoDenegado("No tienes RENASER OS en esta empresa.", "pertenencia");
  if (opts.gestion && !c.gestion) throw new AccesoDenegado("Esto lo hace la gestión de la empresa.", "rol", c.companyId);
  if (opts.talento && !c.talento) throw new AccesoDenegado("Esto lo hace RR.HH., el gerente o el dueño.", "rol", c.companyId);
  // Lo que es de una persona (su tarea, su cronómetro, su apertura) exige una ficha: la consultora mira, no trabaja.
  if (opts.persona && !c.persona) throw new AccesoDenegado("La consultora puede mirar, pero esto lo hace cada persona del equipo.", "rol", c.companyId);
  return c;
}

/** ¿Puede quien entra tocar algo de esta persona? Lo suyo, siempre; lo de otro, solo la gestión de la misma empresa. */
export async function exigirPersonaDeLaEmpresa(c: ContextoOS, personaId: string): Promise<PersonaOS> {
  const { data } = await supabaseAdmin().from("os_personas").select(COLUMNAS_PERSONA).eq("id", personaId).eq("company_id", c.companyId).maybeSingle();
  if (!data) throw new AccesoDenegado("Esa persona no es de tu equipo.", "pertenencia", c.companyId);
  if (data.id !== c.persona?.id && !c.gestion) throw new AccesoDenegado("Solo puedes tocar lo tuyo.", "rol", c.companyId);
  return data as PersonaOS;
}

/** Para el portal: ¿tiene esta persona RENASER OS sin membresía? (personal que entró por /portal). */
export async function tieneFichaOS(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("os_personas").select("id").eq("user_id", userId).eq("activo", true).limit(1);
  return (data ?? []).length > 0;
}
