import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** P1-16: body { email, nivel? }. Si el usuario existe → membresía ya; si no → invitación que se acepta al registrarse/entrar. */
export const POST = protegido<Ctx>({ consultor: true }, async (_p, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ email?: string; nivel?: "dueno" | "lider" | "participante" }>(req);
  const email = b.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fallo("Correo inválido.");
  const sb = supabaseAdmin();
  const nivel = b.nivel ?? "dueno";
  const { data: u } = await sb.from("users").select("id").eq("email", email).maybeSingle();
  if (u) {
    await sb.from("memberships").upsert({ user_id: u.id, company_id: id, nivel });
    await sb.from("invitations").upsert({ company_id: id, email, nivel, aceptada_at: new Date().toISOString() }, { onConflict: "company_id,email" });
    return ok({ enlazado: true });
  }
  await sb.from("invitations").upsert({ company_id: id, email, nivel, aceptada_at: null }, { onConflict: "company_id,email" });
  return ok({ enlazado: false, invitacion: true, instruccion: `Pídele que se registre en /registro con ${email}; quedará enlazado al entrar.` });
});

export const GET = protegido<Ctx>({ consultor: true }, async (_p, _req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const [{ data: inv }, { data: mem }] = await Promise.all([sb.from("invitations").select("email,nivel,aceptada_at,created_at").eq("company_id", id), sb.from("memberships").select("nivel, users(email,nombre)").eq("company_id", id)]);
  return ok({ invitaciones: inv ?? [], miembros: mem ?? [] });
});
