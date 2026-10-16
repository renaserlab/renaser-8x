import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";

/**
 * `autoridad` es opcional y HOY nadie la carga al leer el perfil: la columna `users.autoridad` nace
 * en `supabase/migracion-autoridad.sql` y, hasta que se aplique, pedirla en el select haría fallar la
 * consulta entera y todo el mundo caería a «cliente». Quien la necesita (`exigirAutoridad`) la lee
 * aparte y tolera que no exista.
 */
export type Perfil = { id: string; email: string | null; nombre: string | null; rol: "consultor" | "cliente"; autoridad?: string[] };

/**
 * CUATRO PREGUNTAS DISTINTAS, EN ORDEN. ¿Hay sesión? (autenticación) · ¿Pertenece a esta empresa?
 * (pertenencia) · ¿Puede aprobar? (autoridad, en `autoridad.ts`) · ¿Gestiona personas? (administración).
 * Hasta el 13-10-2026 las dos primeras se confundían en un `Error` genérico que `protegido()` devolvía
 * como 500: un cliente ajeno a la empresa veía «error del servidor» y nada quedaba en `audit_log`.
 * Cada pregunta tiene ahora su error, su código HTTP y su rastro.
 */
export class NoAutenticado extends Error {
  readonly status = 401 as const;
  constructor(mensaje = "Tienes que entrar primero.") {
    super(mensaje);
    this.name = "NoAutenticado";
  }
}

export type MotivoDenegado = "pertenencia" | "rol" | "autoridad";

export class AccesoDenegado extends Error {
  readonly status = 403 as const;
  constructor(mensaje: string, public readonly motivo: MotivoDenegado, public readonly companyId: string | null = null) {
    super(mensaje);
    this.name = "AccesoDenegado";
  }
}

export async function usuarioActual(): Promise<Perfil | null> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  await aceptarInvitaciones(data.user.id, data.user.email ?? null);
  const { data: perfil } = await sb.from("users").select("id,email,nombre,rol").eq("id", data.user.id).maybeSingle();
  if (!perfil) return { id: data.user.id, email: data.user.email ?? null, nombre: null, rol: "cliente" };
  return perfil as Perfil;
}

export async function requerirConsultor(): Promise<Perfil> {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");
  if (u.rol !== "consultor") redirect("/portal");
  return u;
}

export async function requerirCliente(): Promise<Perfil> {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");
  return u;
}

// ---------------------------------------------------------------------------------------------
// EMPRESA ACTIVA. Un dueño normalmente tiene una empresa; cuando tiene varias, antes se elegía la
// primera por orden de id y en silencio (auth.ts:35 hasta el 13-10-2026): el portal mostraba la
// empresa equivocada sin avisar. Hoy no hay nadie con dos, pero el día que lo haya no puede ser una
// sorpresa. La elección se guarda en una cookie que solo se acepta si la membresía la respalda.
// ---------------------------------------------------------------------------------------------

export const COOKIE_EMPRESA_ACTIVA = "empresa_activa";

export type EstadoEmpresa = "sin_empresa" | "unica" | "elegida" | "ambigua";
export type EmpresaResuelta = { companyId: string | null; empresas: string[]; estado: EstadoEmpresa };

/** Las empresas a las que pertenece una persona. Orden estable por id: `memberships` no tiene `created_at`. */
export async function empresasDelUsuario(userId: string): Promise<string[]> {
  // OJO: memberships NO tiene created_at — ordenar por esa columna rompía la consulta en silencio
  // y el portal le pedía crear empresa a gente que YA la tenía (bug real del 26-08).
  const { data } = await supabaseAdmin().from("memberships").select("company_id").eq("user_id", userId).order("company_id");
  return (data ?? []).map((m) => String(m.company_id));
}

/**
 * La regla, pura: una empresa → esa; varias → la que diga la cookie, solo si está entre las suyas;
 * varias y sin cookie válida → ninguna (el portal pregunta). Una cookie que apunte a una empresa
 * ajena no vale nada: se trata igual que si no existiera.
 */
export function elegirEmpresa(empresas: readonly string[], cookie: string | null | undefined): EmpresaResuelta {
  const lista = [...empresas];
  if (lista.length === 0) return { companyId: null, empresas: lista, estado: "sin_empresa" };
  if (lista.length === 1) return { companyId: lista[0]!, empresas: lista, estado: "unica" };
  if (cookie && lista.includes(cookie)) return { companyId: cookie, empresas: lista, estado: "elegida" };
  return { companyId: null, empresas: lista, estado: "ambigua" };
}

/**
 * La cookie de empresa activa de la petición actual. Fuera de una petición (worker, scripts, pruebas)
 * no hay cookies y se devuelve null. `next/headers` se carga aquí y no arriba para que el worker,
 * que importa este módulo a través de `sesiones.ts`, no arrastre el runtime de Next.
 */
export async function cookieEmpresaActiva(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(COOKIE_EMPRESA_ACTIVA)?.value || null;
  } catch {
    return null;
  }
}

/** Empresa activa con el detalle de por qué: el layout del portal necesita distinguir «no tiene» de «no eligió». */
export async function resolverEmpresaActiva(userId: string, cookie?: string | null): Promise<EmpresaResuelta> {
  const empresas = await empresasDelUsuario(userId);
  return elegirEmpresa(empresas, cookie === undefined ? await cookieEmpresaActiva() : cookie);
}

/** Empresa activa del usuario, o null si no tiene ninguna o todavía no eligió entre varias. */
export async function empresaActiva(userId: string, cookie?: string | null): Promise<string | null> {
  return (await resolverEmpresaActiva(userId, cookie)).companyId;
}

/** Nombre histórico que usan portal.ts y las rutas /api/portal: hoy es `empresaActiva` con la cookie de la petición. */
export async function empresaDelCliente(userId: string): Promise<string | null> {
  return empresaActiva(userId);
}

/** Para rutas API: devuelve el perfil o null. */
export async function perfilApi(): Promise<Perfil | null> {
  return usuarioActual();
}

/** ¿Pertenece esta persona a esta empresa? Sin atajo para el consultor: es la pregunta de pertenencia, no la de acceso. */
export async function esMiembro(userId: string, companyId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("memberships").select("company_id").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
  return !!data;
}

/** ¿Puede este usuario tocar esta empresa? Consultor: siempre. Cliente: si tiene membresía. */
export async function puedeAcceder(perfil: Perfil, companyId: string): Promise<boolean> {
  if (perfil.rol === "consultor") return true;
  return esMiembro(perfil.id, companyId);
}

/** P1-16: si hay invitaciones pendientes para este correo, se convierten en membresías al entrar. */
export async function aceptarInvitaciones(userId: string, email: string | null) {
  if (!email) return;
  const sb = supabaseAdmin();
  const { data: inv } = await sb.from("invitations").select("id,company_id,nivel").eq("email", email.toLowerCase()).is("aceptada_at", null);
  for (const i of inv ?? []) {
    await sb.from("memberships").upsert({ user_id: userId, company_id: i.company_id, nivel: i.nivel });
    await sb.from("invitations").update({ aceptada_at: new Date().toISOString() }).eq("id", i.id);
  }
}
