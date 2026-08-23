import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrEntrevistador } from "@/lib/ai/agents/entrevistador";
import { correrMinero } from "@/lib/ai/agents/minero";
import { claimsDeEmpresa, claimsComoTexto, registrarTokens } from "@/lib/db/queries";
import { TIPOS_CRITICOS } from "@/lib/rules/vigencia";
import { encolar, PRIORIDAD, progreso, claveIdempotente } from "../queue";
import { ai } from "@/lib/ai";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/** payload: { session_id } → genera las siguientes 1–3 preguntas (prioridad 1). */
export async function handleEntrevistaSiguiente(job: Job) {
  const sb = supabaseAdmin();
  const sessionId = String(job.payload.session_id);
  const { data: ses } = await sb.from("interview_sessions").select("*, participants(nombre,puesto,rol,antiguedad)").eq("id", sessionId).single();
  if (!ses) throw new Error("Sesión no encontrada");

  // ¿Ya hay una pregunta sin responder? No generar otra.
  const { data: abiertas } = await sb.from("interview_responses").select("id").eq("session_id", sessionId).is("respuesta", null).limit(1);
  if (abiertas && abiertas.length) return { generadas: 0, motivo: "ya hay pregunta abierta" };

  await progreso(job.id, "Preparando la siguiente pregunta");

  const { data: todas } = await sb
    .from("interview_responses")
    .select("pregunta,respuesta,bloque,pilar,orden,interview_sessions!inner(tipo,company_id,participant_id)")
    .eq("interview_sessions.company_id", job.company_id)
    .not("respuesta", "is", null)
    .order("orden");
  const propias = (todas ?? []).filter((r) => (r.interview_sessions as unknown as { participant_id: string }).participant_id === ses.participant_id);
  const ajenas = (todas ?? []).filter((r) => (r.interview_sessions as unknown as { participant_id: string }).participant_id !== ses.participant_id);

  const claims = await claimsDeEmpresa(job.company_id);
  const porValidar = claims.filter((c) => c.estado === "contradicho" || (c.estado === "sin_verificar" && c.prioridad_validacion));
  const porPilar: Record<string, number> = {};
  for (const c of claims) if (c.estado === "confirmado" && c.pilar) porPilar[c.pilar] = (porPilar[c.pilar] ?? 0) + 1;
  const desconocidos = ["personas", "procesos", "producto", "marketing"].filter((p) => (porPilar[p] ?? 0) < 5);

  const p = ses.participants as { nombre: string; puesto: string | null; rol: string | null; antiguedad: string | null };
  const contexto = [
    `TIPO DE SESIÓN: ${ses.tipo}`,
    `PARTICIPANTE: ${p.nombre} · puesto: ${p.puesto ?? "—"} · rol: ${p.rol ?? "—"} · antigüedad: ${p.antiguedad ?? "—"}`,
    `PREGUNTAS YA RESPONDIDAS EN ESTA SESIÓN (${propias.length}):`,
    propias.map((r) => `- [${r.bloque}] ${r.pregunta}\n  → ${r.respuesta}`).join("\n") || "(ninguna)",
    `RESPUESTAS DE OTRAS SESIONES (${ajenas.length}, resumen):`,
    ajenas.slice(-30).map((r) => `- (${(r.interview_sessions as unknown as { tipo: string }).tipo}) ${r.pregunta} → ${String(r.respuesta).slice(0, 240)}`).join("\n") || "(ninguna)",
    `AFIRMACIONES POR VALIDAR O CONTRADICHAS (${porValidar.length}):`,
    claimsComoTexto(porValidar.slice(0, 40)) || "(ninguna)",
    `PILARES CON INFORMACIÓN INSUFICIENTE: ${desconocidos.join(", ") || "ninguno"}`,
    `TIPOS CRÍTICOS QUE DEBEN QUEDAR VERIFICADOS: ${TIPOS_CRITICOS.join(", ")}`,
  ].join("\n\n");

  const r = await correrEntrevistador(contexto);
  await registrarTokens(job.company_id, job.id, "entrevistador", r.tokens_entrada, r.tokens_salida);

  const { data: ult } = await sb.from("interview_responses").select("orden").eq("session_id", sessionId).order("orden", { ascending: false }).limit(1);
  let orden = (ult?.[0]?.orden ?? 0) + 1;
  const validIds = new Set(claims.map((c) => c.id));
  for (const q of r.data.preguntas.slice(0, 3)) {
    await sb.from("interview_responses").insert({
      session_id: sessionId,
      bloque: q.bloque,
      pilar: q.pilar ?? null,
      pregunta: q.texto,
      origen_claim_id: q.origen_claim_id && validIds.has(q.origen_claim_id) ? q.origen_claim_id : null,
      orden: orden++,
    });
  }
  if (r.data.preguntas.length === 0 || r.data.sesion_completa) {
    await sb.from("interview_sessions").update({ estado: "completa" }).eq("id", sessionId);
    // Al completar una sesión de personal/líder/know_how se mina el know-how
    if (["personal", "lider", "know_how"].includes(ses.tipo)) {
      await encolar({ company_id: job.company_id, tipo: "minar_know_how", payload: { session_id: sessionId }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["minar", sessionId]) });
    }
  } else if (ses.estado === "pendiente") {
    await sb.from("interview_sessions").update({ estado: "en_curso" }).eq("id", sessionId);
  }
  return { generadas: r.data.preguntas.length };
}

/** payload: { response_id } → transcribe el audio guardado y dispara extracción. */
export async function handleTranscribirRespuesta(job: Job) {
  const sb = supabaseAdmin();
  const id = String(job.payload.response_id);
  const { data: r } = await sb.from("interview_responses").select("id,respuesta_audio_path,session_id").eq("id", id).single();
  if (!r?.respuesta_audio_path) throw new Error("Sin audio");
  await progreso(job.id, "Escuchando tu respuesta");
  const { data: blob } = await sb.storage.from("fuentes").download(r.respuesta_audio_path);
  if (!blob) throw new Error("No pudimos descargar el audio");
  const texto = await ai().transcribe(blob, blob.type || "audio/webm");
  await sb.from("interview_responses").update({ respuesta: texto, respondido_at: new Date().toISOString() }).eq("id", id);
  await encolar({ company_id: job.company_id, tipo: "extraer", payload: { response_id: id }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["extraer", "resp", id]) });
  await encolar({ company_id: job.company_id, tipo: "entrevista_siguiente", payload: { session_id: r.session_id }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["siguiente", r.session_id, id]) });
  return { texto };
}

/** payload: { session_id } → MINERO DE KNOW-HOW sobre la transcripción completa. */
export async function handleMinarKnowHow(job: Job) {
  const sb = supabaseAdmin();
  const sessionId = String(job.payload.session_id);
  const { data: ses } = await sb.from("interview_sessions").select("*, participants(nombre,puesto,rol)").eq("id", sessionId).single();
  const { data: resp } = await sb.from("interview_responses").select("pregunta,respuesta").eq("session_id", sessionId).not("respuesta", "is", null).order("orden");
  if (!ses || !resp?.length) return { unidades: 0 };
  const p = ses.participants as { puesto: string | null; rol: string | null };
  await progreso(job.id, "Buscando lo que esta persona sabe y ningún manual dice");
  const transcripcion = resp.map((r) => `P: ${r.pregunta}\nR: ${r.respuesta}`).join("\n\n");
  const r = await correrMinero(p.puesto ?? p.rol ?? "puesto", transcripcion);
  await registrarTokens(job.company_id, job.id, "minero", r.tokens_entrada, r.tokens_salida);
  for (const u of r.data.unidades) {
    await sb.from("know_how").insert({
      company_id: job.company_id,
      participant_id: ses.participant_id,
      puesto: p.puesto ?? p.rol,
      situacion: u.situacion, senal: u.senal, decision: u.decision, excepcion: u.excepcion, estandar: u.estandar,
      error_frecuente: u.error_frecuente, regla_practica: u.regla_practica, escalamiento: u.escalamiento,
      destino: u.destino,
    });
  }
  return { unidades: r.data.unidades.length, riesgo: r.data.riesgo_know_how_vacio ?? false };
}
