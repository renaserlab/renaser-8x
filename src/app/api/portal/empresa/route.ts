import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaDelCliente } from "@/lib/auth";

/**
 * Alta autoservicio (bloqueador 6): el amigo que recibe el enlace crea SU empresa sin consultor.
 * body: { nombre, sector? } → empresa + membresía de dueño + participante dueño + sesiones de conversación.
 * Solo para usuarios cliente sin empresa (una empresa por cuenta en V1).
 */
export const POST = protegido({}, async (perfil, req) => {
  if (perfil.rol === "consultor") return fallo("Como consultor, crea empresas desde tu bandeja.");
  const existente = await empresaDelCliente(perfil.id);
  if (existente) return fallo("Ya tienes una empresa en 8X.");
  const b = await leerJSON<{ nombre?: string; sector?: string }>(req);
  const nombre = (b.nombre ?? "").trim();
  if (nombre.length < 2) return fallo("Cuéntanos el nombre de tu empresa.");
  const sb = supabaseAdmin();
  const { data: c, error } = await sb.from("companies").insert({ nombre: nombre.slice(0, 120), sector: (b.sector ?? "").trim().slice(0, 120) || null }).select("id").single();
  if (error) return fallo(error.message, 500);
  await sb.from("memberships").upsert({ user_id: perfil.id, company_id: c!.id, nivel: "dueno" });
  const { data: dueno } = await sb.from("participants").insert({ company_id: c!.id, nombre: perfil.nombre ?? "Dueño", puesto: "Dueño", rol: "dueno", user_id: perfil.id }).select("id").single();
  if (dueno) {
    await sb.from("interview_sessions").insert([
      { company_id: c!.id, participant_id: dueno.id, tipo: "sueno_dueno" },
      { company_id: c!.id, participant_id: dueno.id, tipo: "empresa_dueno" },
    ]);
  }
  return ok({ company_id: c!.id }, 201);
});
