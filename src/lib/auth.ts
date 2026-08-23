import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";

export type Perfil = { id: string; email: string | null; nombre: string | null; rol: "consultor" | "cliente" };

export async function usuarioActual(): Promise<Perfil | null> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
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
  const { data } = await supabaseAdmin().from("memberships").select("company_id").eq("user_id", userId).limit(1).maybeSingle();
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
