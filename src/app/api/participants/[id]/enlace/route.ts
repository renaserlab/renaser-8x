import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generarToken, hashToken, expiracionPorDefecto } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST → rota el enlace del participante (nuevo token, el anterior deja de servir). Devuelve el enlace una sola vez.
 * body: { revocar: true } → revoca sin generar uno nuevo.
 * P0-04: nunca se lee ni se devuelve un token existente; siempre se genera uno nuevo.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("id,company_id").eq("id", id).single();
  if (!p) return fallo("No encontrado", 404);
  await exigirAcceso(perfil, p.company_id);
  const b = await leerJSON<{ revocar?: boolean }>(req);
  if (b.revocar) {
    await sb.from("participants").update({ token_revocado_at: new Date().toISOString() }).eq("id", id);
    return ok({ revocado: true });
  }
  const token = generarToken();
  const expira = expiracionPorDefecto();
  const { error } = await sb.from("participants").update({ token_hash: hashToken(token), token_expira_at: expira, token_revocado_at: null, token_usos: 0, token_canjeado_at: null }).eq("id", id);
  if (error) return fallo(error.message, 500);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return ok({ enlace: `${base}/participar/${token}`, expira });
});
