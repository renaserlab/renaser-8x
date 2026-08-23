import { supabaseAdmin } from "./supabase/admin";
import type { Perfil } from "./auth";

/**
 * Autorización de sesiones de entrevista (P0-05).
 * Regla: consultor → sí. Usuario con cuenta → solo si la sesión es de SU participante (participants.user_id = auth.uid()).
 * Participante por enlace → solo su propia sesión (lo resuelve /api/participar con el token).
 * Tener acceso a la empresa NO basta.
 */

export type Actor = { rol: "consultor" | "cliente"; id: string };
export type SesionMin = { id: string; company_id: string; participant_id: string; participant_user_id: string | null };

export type Decision = { permitido: true } | { permitido: false; status: 403 | 404; motivo: string };

export function autorizaSesion(actor: Actor, sesion: SesionMin | null, tieneAccesoEmpresa: boolean): Decision {
  // 404 uniforme si la sesión no existe o pertenece a una empresa ajena: no se revela existencia.
  if (!sesion || !tieneAccesoEmpresa) return { permitido: false, status: 404, motivo: "Sesión no encontrada" };
  if (actor.rol === "consultor") return { permitido: true };
  if (sesion.participant_user_id && sesion.participant_user_id === actor.id) return { permitido: true };
  return { permitido: false, status: 403, motivo: "Solo puedes ver y responder tu propia conversación." };
}

export async function cargarSesion(sessionId: string): Promise<SesionMin | null> {
  const { data } = await supabaseAdmin().from("interview_sessions").select("id,company_id,participant_id, participants(user_id)").eq("id", sessionId).maybeSingle();
  if (!data) return null;
  const p = data.participants as unknown as { user_id: string | null } | null;
  return { id: data.id, company_id: data.company_id, participant_id: data.participant_id, participant_user_id: p?.user_id ?? null };
}

export async function autorizarSesion(perfil: Perfil, sessionId: string, accesoEmpresa: (companyId: string) => Promise<boolean>): Promise<{ decision: Decision; sesion: SesionMin | null }> {
  const sesion = await cargarSesion(sessionId);
  const acceso = sesion ? await accesoEmpresa(sesion.company_id) : false;
  return { decision: autorizaSesion({ rol: perfil.rol, id: perfil.id }, sesion, acceso), sesion };
}
