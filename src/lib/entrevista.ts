import { coberturaSesion } from "@/lib/rules/cobertura";
import { supabaseAdmin } from "./supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "./jobs/queue";

/** Registra una respuesta (texto o audio) y dispara extracción + siguiente pregunta. < 150 ms hasta el acuse. */
export async function registrarRespuesta(opts: { session_id: string; company_id: string; response_id?: string; texto?: string; audio?: File | Blob; mime?: string }) {
  const sb = supabaseAdmin();
  let responseId = opts.response_id;
  if (!responseId) {
    const { data } = await sb.from("interview_responses").select("id").eq("session_id", opts.session_id).is("respuesta", null).order("orden").limit(1);
    responseId = data?.[0]?.id;
  }
  if (!responseId) throw new Error("No hay pregunta abierta en esta sesión.");

  if (opts.audio) {
    const path = `${opts.company_id}/respuestas/${responseId}.webm`;
    const { error } = await sb.storage.from("fuentes").upload(path, opts.audio, { contentType: opts.mime ?? "audio/webm", upsert: true });
    if (error) throw new Error("No pudimos guardar el audio. Intenta de nuevo o escribe la respuesta.");
    await sb.from("interview_responses").update({ respuesta_audio_path: path }).eq("id", responseId);
    await encolar({ company_id: opts.company_id, tipo: "transcribir_respuesta", payload: { response_id: responseId }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["transcribir", responseId]) });
    return { response_id: responseId, modo: "audio" as const };
  }

  const texto = (opts.texto ?? "").trim();
  if (!texto) throw new Error("La respuesta está vacía.");
  await sb.from("interview_responses").update({ respuesta: texto, respondido_at: new Date().toISOString() }).eq("id", responseId);
  await encolar({ company_id: opts.company_id, tipo: "extraer", payload: { response_id: responseId }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["extraer", "resp", responseId]) });
  await encolar({ company_id: opts.company_id, tipo: "entrevista_siguiente", payload: { session_id: opts.session_id }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["siguiente", opts.session_id, responseId]) });
  return { response_id: responseId, modo: "texto" as const };
}

export async function pedirSiguiente(session_id: string, company_id: string) {
  return encolar({ company_id, tipo: "entrevista_siguiente", payload: { session_id }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["siguiente", session_id, Date.now()]) });
}

/** Estado de una sesión para la pantalla: pregunta abierta, respondidas, progreso de la máquina. */
export async function estadoSesion(session_id: string) {
  const sb = supabaseAdmin();
  const [{ data: ses }, { data: resp }, { data: job }] = await Promise.all([
    sb.from("interview_sessions").select("*, participants(nombre,puesto,rol)").eq("id", session_id).single(),
    sb.from("interview_responses").select("id,pregunta,respuesta,bloque,orden,respondido_at,origen_claim_id,respuesta_audio_path").eq("session_id", session_id).order("orden"),
    sb.from("jobs").select("id,estado,progreso,error").eq("tipo", "entrevista_siguiente").contains("payload", { session_id }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const abierta = (resp ?? []).find((r) => r.respuesta === null) ?? null;
  const respondidasLista = (resp ?? []).filter((r) => r.respuesta !== null);
  const cobertura = ses ? coberturaSesion(ses.tipo, respondidasLista, ((ses as { bloques_cubiertos?: string[] | null }).bloques_cubiertos ?? []) as string[]) : null;
  const pendienteTranscripcion = (resp ?? []).find((r) => r.respuesta === null && (r as { respuesta_audio_path?: string }).respuesta_audio_path);
  return { sesion: ses, abierta, respondidas: respondidasLista, cobertura, job, pendienteTranscripcion: !!pendienteTranscripcion };
}
