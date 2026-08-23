import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase/admin";
import { registrarRespuesta, pedirSiguiente, estadoSesion } from "./entrevista";
import { hashToken, formatoValido, tokenValido, canjearEnlace } from "./tokens";
import { hayTranscriptor } from "./ai";

/**
 * Acceso por enlace, sin cuenta. El participante ve únicamente su propia sesión. Capítulo 36.
 * P0-04: búsqueda por hash; expiración, revocación y usos; 404 uniforme.
 * P2-17: el token viaja en cabecera (`x-participante-token`), nunca en la URL de la API.
 * Enlace de un solo uso: `canjear` verifica el token del enlace una vez y lo sustituye por un token de sesión;
 * el enlace original queda inutilizado. Las demás rutas solo aceptan el token de sesión (participante ya canjeado).
 */
export const INVALIDO = () => NextResponse.json({ error: "Este enlace no es válido o ya venció. Pide uno nuevo a quien te lo envió." }, { status: 404 });

export async function participantePorToken(token: string) {
  if (!formatoValido(token)) return null;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("id,company_id,nombre,puesto,rol,token_hash,token_expira_at,token_revocado_at,token_usos,token_max_usos,token_canjeado_at, companies(nombre)").eq("token_hash", hashToken(token)).maybeSingle();
  if (!p) return null;
  if (!p.token_canjeado_at) return null; // un enlace sin canjear no da acceso: primero /canjear
  if (!tokenValido(token, p).ok) return null;
  return p;
}

/** Canje único del enlace → token de sesión (se devuelve una sola vez). */
export async function canjearParticipante(tokenEnlace: string) {
  if (!formatoValido(tokenEnlace)) return INVALIDO();
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("id,token_hash,token_expira_at,token_revocado_at,token_usos,token_max_usos,token_canjeado_at").eq("token_hash", hashToken(tokenEnlace)).maybeSingle();
  if (!p) return INVALIDO();
  const c = canjearEnlace(tokenEnlace, p);
  if (!c.ok) return INVALIDO();
  // Condición de carrera: solo canjea si el hash sigue siendo el del enlace (un segundo clic simultáneo falla).
  const { data: upd } = await sb.from("participants").update(c.cambios).eq("id", p.id).eq("token_hash", p.token_hash).is("token_canjeado_at", null).select("id").maybeSingle();
  if (!upd) return INVALIDO();
  return NextResponse.json({ token_sesion: c.token_sesion, expira: c.cambios.token_expira_at });
}

export async function estadoParticipante(token: string) {
  const p = await participantePorToken(token);
  if (!p) return INVALIDO();
  const sb = supabaseAdmin();
  const { data: sesiones } = await sb.from("interview_sessions").select("id,tipo,estado").eq("participant_id", p.id).order("created_at");
  const activa = (sesiones ?? []).find((s) => s.estado !== "completa") ?? null;
  let estado = null;
  if (activa) {
    estado = await estadoSesion(activa.id);
    if (!estado.abierta && !estado.job?.estado?.match(/pendiente|corriendo/)) {
      await pedirSiguiente(activa.id, p.company_id);
      estado = await estadoSesion(activa.id);
    }
  }
  return NextResponse.json({
    participante: { nombre: p.nombre, puesto: p.puesto, rol: p.rol, empresa: (p.companies as unknown as { nombre: string } | null)?.nombre },
    sesiones: sesiones ?? [],
    activa,
    abierta: estado?.abierta ?? null,
    respondidas: estado?.respondidas.length ?? 0,
    progreso: estado?.job?.progreso ?? null,
    pendienteTranscripcion: estado?.pendienteTranscripcion ?? false,
    transcriptor: hayTranscriptor(),
  });
}

export async function responderParticipante(token: string, form: FormData) {
  const p = await participantePorToken(token);
  if (!p) return INVALIDO();
  try {
    const session_id = String(form.get("session_id") ?? "");
    const sb = supabaseAdmin();
    const { data: ses } = await sb.from("interview_sessions").select("id,participant_id").eq("id", session_id).maybeSingle();
    if (!ses || ses.participant_id !== p.id) return NextResponse.json({ error: "Esa conversación no es tuya." }, { status: 403 });
    const audio = form.get("audio");
    if (audio instanceof File && !hayTranscriptor()) return NextResponse.json({ error: "Por ahora no podemos escuchar audios. Escribe tu respuesta o usa el micrófono del navegador." }, { status: 400 });
    const r = await registrarRespuesta({ session_id, company_id: p.company_id, response_id: String(form.get("response_id") ?? "") || undefined, texto: String(form.get("texto") ?? ""), audio: audio instanceof File ? audio : undefined, mime: audio instanceof File ? audio.type : undefined });
    await sb.from("participants").update({ token_usos: (p.token_usos ?? 0) + 1 }).eq("id", p.id);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No pudimos guardar tu respuesta." }, { status: 400 });
  }
}
