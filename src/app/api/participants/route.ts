import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generarToken, hashToken, expiracionPorDefecto, MAX_USOS_TOKEN } from "@/lib/tokens";

/**
 * body: { company_id, nombre, puesto?, rol, antiguedad?, sesiones?: tipo[] } → participante + sesiones + enlace.
 * P0-04: el token plano se devuelve UNA vez aquí; en la base solo queda su hash, con expiración y tope de usos.
 */
export const POST = protegido({}, async (perfil, req) => {
  const b = await leerJSON<{ company_id?: string; nombre?: string; puesto?: string; rol?: string; antiguedad?: string; sesiones?: string[] }>(req);
  if (!b.company_id || !b.nombre?.trim()) return fallo("Falta el nombre de la persona.");
  await exigirAcceso(perfil, b.company_id);
  const sb = supabaseAdmin();
  const rol = b.rol ?? "empleado";
  const token = generarToken();
  const { data: p, error } = await sb
    .from("participants")
    .insert({ company_id: b.company_id, nombre: b.nombre.trim(), puesto: b.puesto ?? null, rol, antiguedad: b.antiguedad ?? null, token_hash: hashToken(token), token_expira_at: expiracionPorDefecto(), token_usos: 0, token_max_usos: MAX_USOS_TOKEN })
    .select("id,company_id,nombre,puesto,rol,antiguedad,token_expira_at")
    .single();
  if (error) return fallo(error.message, 500);
  const tipos = b.sesiones?.length ? b.sesiones : rol === "dueno" || rol === "socio" ? ["sueno_dueno", "empresa_dueno"] : rol === "lider" ? ["lider", "know_how"] : ["personal", "know_how"];
  await sb.from("interview_sessions").insert(tipos.map((tipo) => ({ company_id: b.company_id, participant_id: p.id, tipo })));
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return ok({ participante: p, enlace: `${base}/participar/${token}`, expira: p.token_expira_at }, 201);
});

export const DELETE = protegido({}, async (perfil, req) => {
  const { id } = await leerJSON<{ id?: string }>(req);
  if (!id) return fallo("Falta id");
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("company_id").eq("id", id).single();
  if (!p) return fallo("No encontrado", 404);
  await exigirAcceso(perfil, p.company_id);
  await sb.from("participants").delete().eq("id", id);
  return ok({ eliminado: true });
});
