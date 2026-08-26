import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";

export type Perfil = { id: string; email: string | null; nombre: string | null; rol: "consultor" | "cliente" };

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

/** Empresa del cliente (la primera membresía). Un cliente normalmente tiene una. */
export async function empresaDelCliente(userId: string): Promise<string | null> {
  // Con más de una membresía, gana la más reciente (determinista): la última empresa a la que se le dio acceso.
  const { data } = await supabaseAdmin().from("memberships").select("company_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.company_id ?? null;
}

/** Para rutas API: devuelve el perfil o null. */
export async function perfilApi(): Promise<Perfil | null> {
  return usuarioActual();
}

/** ¿Puede este usuario tocar esta empresa? Consultor: siempre. Cliente: si tiene membresía. */
export async function puedeAcceder(perfil: Perfil, companyId: string): Promise<boolean> {
  if (perfil.rol === "consultor") return true;
  const { data } = await supabaseAdmin().from("memberships").select("company_id").eq("user_id", perfil.id).eq("company_id", companyId).maybeSingle();
  return !!data;
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
