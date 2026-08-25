import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrEntrevistador } from "@/lib/ai/agents/entrevistador";
import { correrMinero } from "@/lib/ai/agents/minero";
import { claimsDeEmpresa, claimsComoTexto, registrarLlamada } from "@/lib/db/queries";
import { TIPOS_CRITICOS } from "@/lib/rules/vigencia";
import { bloquesSinCubrir, puedeCerrarSesion, BLOQUES } from "@/lib/rules/cobertura";
import { clasificarModelo, matricesComoTexto } from "@/lib/rules/matrices";
import { tablaResultadosComoTexto, type Metrica } from "@/lib/rules/anomalias";
import { encolar, PRIORIDAD, progreso, claveIdempotente } from "../queue";
import { ai } from "@/lib/ai";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

// ---- Candado de redundancia (queja real de cliente: la misma pregunta 5-6 veces con una palabra cambiada) ----
const palabras = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
/** Dos preguntas son "la misma" si comparten la mayoría de sus palabras significativas. */
export function preguntaRepetida(nueva: string, previas: string[]): boolean {
  const A = new Set(palabras(nueva));
  if (!A.size) return false;
  for (const p of previas) {
    const B = new Set(palabras(p));
    if (!B.size) continue;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter++;
    if (inter / Math.min(A.size, B.size) >= 0.6) return true;
  }
  return false;
}
/** "Ya te lo dije": si la persona lo reclama, ese bloque se cierra en código — no se le vuelve a preguntar. */
export const RECLAMO_REPETIDO = /\bya (te|se|le)? ?(lo|la)? ?(dije|cont[eé]|respond[ií]|expliqu[eé]|mencion[eé])|ya respond[ií]|te respond[ií]|misma pregunta|otra vez lo mismo/i;

/** payload: { session_id } → genera las siguientes 1–3 preguntas (prioridad 1). No cierra la sesión hasta cubrir sus bloques. */
export async function handleEntrevistaSiguiente(job: Job) {
  const sb = supabaseAdmin();
  const sessionId = String(job.payload.session_id);
  const { data: ses } = await sb.from("interview_sessions").select("*, participants(nombre,puesto,rol,antiguedad)").eq("id", sessionId).single();
  if (!ses) throw new Error("Sesión no encontrada");

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
  const deEstaSesion = (todas ?? []).filter((r) => (r.interview_sessions as unknown as { tipo: string; participant_id: string }).participant_id === ses.participant_id && (r.interview_sessions as unknown as { tipo: string }).tipo === ses.tipo);
  const ajenas = (todas ?? []).filter((r) => (r.interview_sessions as unknown as { participant_id: string }).participant_id !== ses.participant_id);

  const claims = await claimsDeEmpresa(job.company_id);
  const [{ data: khTodo }, { data: procesosTodo }, { data: fuentesTodo }, { data: empresa }, { data: metricas }] = await Promise.all([
    sb.from("know_how").select("puesto,situacion,senal,regla_practica").eq("company_id", job.company_id).limit(30),
    sb.from("processes").select("id,nombre,area, process_nodes(etiqueta,problema)").eq("company_id", job.company_id).eq("version", "as_is").limit(10),
    sb.from("sources").select("nombre,tipo,estado").eq("company_id", job.company_id).order("created_at", { ascending: false }).limit(25),
    sb.from("companies").select("nombre,sector,ficha,modelo_operativo,etapa_negocio").eq("id", job.company_id).single(),
    sb.from("company_metricas").select("clave,periodo,valor,valor_texto,estado,nota").eq("company_id", job.company_id).limit(60),
  ]);
  // Clasificación por modelo operativo (Sistema Adaptativo v2): usa la guardada o clasifica desde ficha/sector.
  const ficha = (empresa?.ficha ?? null) as Record<string, string> | null;
  let modelos = (empresa?.modelo_operativo ?? []) as string[];
  if (!modelos.length) {
    modelos = clasificarModelo([empresa?.sector, ficha?.actividad, ficha?.productos, ficha?.canales]);
    if (modelos.length) await sb.from("companies").update({ modelo_operativo: modelos }).eq("id", job.company_id);
  }
  const porValidar = claims.filter((c) => c.estado === "contradicho" || (c.estado === "sin_verificar" && c.prioridad_validacion));
  const porPilar: Record<string, number> = {};
  for (const c of claims) if (c.estado === "confirmado" && c.pilar) porPilar[c.pilar] = (porPilar[c.pilar] ?? 0) + 1;
  const desconocidos = ["personas", "procesos", "producto", "marketing"].filter((p) => (porPilar[p] ?? 0) < 5);
  let yaCubiertos = ((ses as { bloques_cubiertos?: string[] | null }).bloques_cubiertos ?? []) as string[];
  // Candado en código: si la persona reclamó "ya te lo dije", ese bloque queda cubierto sin depender del modelo.
  const reclamados = deEstaSesion.filter((r) => r.respuesta && RECLAMO_REPETIDO.test(String(r.respuesta))).map((r) => r.bloque).filter((b): b is string => !!b && !yaCubiertos.includes(b));
  if (reclamados.length) {
    yaCubiertos = [...yaCubiertos, ...reclamados];
    await sb.from("interview_sessions").update({ bloques_cubiertos: yaCubiertos }).eq("id", sessionId);
  }
  const sinCubrir = bloquesSinCubrir(ses.tipo, deEstaSesion, yaCubiertos);

  const p = ses.participants as { nombre: string; puesto: string | null; rol: string | null; antiguedad: string | null };
  const matrizTxt = matricesComoTexto(modelos);
  const contexto = [
    `TIPO DE SESIÓN: ${ses.tipo}`,
    `PARTICIPANTE: puesto: ${p.puesto ?? "—"} · rol: ${p.rol ?? "—"} · antigüedad: ${p.antiguedad ?? "—"}`,
    `EL NEGOCIO: ${empresa?.nombre ?? "—"} · a qué se dedica: ${ficha?.actividad ?? empresa?.sector ?? "aún no dicho"}${empresa?.etapa_negocio ? ` · etapa del negocio: ${empresa.etapa_negocio}` : ""}${ficha ? ` · ficha: ${Object.entries(ficha).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}` : ""}`,
    matrizTxt ? `PREGUNTAS DEL OFICIO (su modelo de negocio):\n${matrizTxt}` : null,
    ses.tipo === "empresa_dueno" ? `TABLA DE RESULTADOS (lo ya contado — pregunta lo que falta, un mes a la vez):\n${tablaResultadosComoTexto((metricas ?? []) as Metrica[])}` : null,
    `BLOQUES SIN CUBRIR (${sinCubrir.length}): ${sinCubrir.map((b) => `[${b.clave}] ${b.nombre}`).join(", ") || "ninguno"}`,
    `PREGUNTAS YA RESPONDIDAS POR ESTA PERSONA (${propias.length}):`,
    propias.map((r) => `- [${r.bloque}] ${r.pregunta}\n  → ${r.respuesta}`).join("\n") || "(ninguna)",
    `RESPUESTAS DE OTRAS SESIONES (${ajenas.length}, resumen, sin nombres):`,
    ajenas.slice(-30).map((r) => `- (${(r.interview_sessions as unknown as { tipo: string }).tipo}) ${r.pregunta} → ${String(r.respuesta).slice(0, 240)}`).join("\n") || "(ninguna)",
    `AFIRMACIONES POR VALIDAR O CONTRADICHAS (${porValidar.length}):`,
    claimsComoTexto(porValidar.slice(0, 40)) || "(ninguna)",
    `PILARES CON INFORMACIÓN INSUFICIENTE: ${desconocidos.join(", ") || "ninguno"}`,
    `LO QUE LA EMPRESA YA MOSTRÓ (no vuelvas a preguntar nada de esto):`,
    [
      `- Caleta capturada (${khTodo?.length ?? 0}): ${(khTodo ?? []).map((k) => `${k.puesto}: ${k.situacion ?? k.regla_practica ?? k.senal ?? ""}`.slice(0, 90)).join(" · ") || "ninguna"}`,
      `- Procesos dibujados (${procesosTodo?.length ?? 0}): ${(procesosTodo ?? []).map((p) => { const probs = ((p.process_nodes as { etiqueta: string; problema: string | null }[]) ?? []).filter((n) => n.problema).map((n) => n.etiqueta); return `${p.nombre}${probs.length ? ` (trabas: ${probs.slice(0, 3).join(", ")})` : ""}`; }).join(" · ") || "ninguno"}`,
      `- Fuentes entregadas (${fuentesTodo?.length ?? 0}): ${(fuentesTodo ?? []).map((f) => `${f.nombre} [${f.estado}]`).join(" · ") || "ninguna"}`,
    ].join("\n"),
    `TIPOS CRÍTICOS QUE DEBEN QUEDAR VERIFICADOS: ${TIPOS_CRITICOS.join(", ")}`,
  ].filter(Boolean).join("\n\n");

  const r = await correrEntrevistador(contexto);
  await registrarLlamada(job.company_id, job.id, "entrevistador", r);

  // El entrevistador puede declarar areas ya comprendidas por lo dicho: se cierran sin preguntar de mas.
  const clavesSesion = new Set((BLOQUES[ses.tipo] ?? []).map((b) => b.clave));
  const nuevosCubiertos = (r.data.bloques_cubiertos ?? []).filter((c) => clavesSesion.has(c) && !yaCubiertos.includes(c));
  const cubiertos = [...yaCubiertos, ...nuevosCubiertos];
  if (nuevosCubiertos.length) await sb.from("interview_sessions").update({ bloques_cubiertos: cubiertos }).eq("id", sessionId);

  const { data: ult } = await sb.from("interview_responses").select("orden").eq("session_id", sessionId).order("orden", { ascending: false }).limit(1);
  let orden = (ult?.[0]?.orden ?? 0) + 1;
  const validIds = new Set(claims.map((c) => c.id));
  const clavesValidas = new Set((BLOQUES[ses.tipo] ?? []).map((b) => b.clave));
  // CANDADO DE REDUNDANCIA en código (no solo en el prompt):
  // 1) nada parecido a lo ya preguntado a esta persona; 2) máximo 2 preguntas por bloque salvo validación;
  // 3) tampoco dos parecidas dentro del mismo lote.
  const yaHechas = propias.map((x) => String(x.pregunta));
  const porBloque = new Map<string, number>();
  for (const x of deEstaSesion) if (x.bloque) porBloque.set(x.bloque, (porBloque.get(x.bloque) ?? 0) + 1);
  const aceptadas: typeof r.data.preguntas = [];
  for (const q of r.data.preguntas) {
    if (preguntaRepetida(q.texto, [...yaHechas, ...aceptadas.map((x) => x.texto)])) continue;
    if (!q.origen_claim_id && (porBloque.get(q.bloque) ?? 0) >= 2) continue;
    aceptadas.push(q);
  }
  let preguntas = aceptadas.slice(0, 2);
  // Cobertura en código: si nada sobrevivió pero faltan bloques, entra la primera pregunta del banco AÚN NO hecha.
  const faltanTras = bloquesSinCubrir(ses.tipo, deEstaSesion, cubiertos);
  if (preguntas.length === 0 && faltanTras.length) {
    for (const b of faltanTras) {
      const libre = b.preguntas.find((t) => !preguntaRepetida(t, yaHechas));
      if (libre) { preguntas = [{ texto: libre, bloque: b.clave, pilar: null, origen_claim_id: null }]; break; }
    }
  }
  for (const q of preguntas) {
    await sb.from("interview_responses").insert({
      session_id: sessionId,
      bloque: clavesValidas.has(q.bloque) ? q.bloque : sinCubrir[0]?.clave ?? q.bloque,
      pilar: q.pilar ?? null,
      pregunta: q.texto,
      origen_claim_id: q.origen_claim_id && validIds.has(q.origen_claim_id) ? q.origen_claim_id : null,
      orden: orden++,
    });
  }
  const cerrar = preguntas.length === 0 && puedeCerrarSesion(ses.tipo, deEstaSesion, cubiertos);
  if (cerrar) {
    await sb.from("interview_sessions").update({ estado: "completa" }).eq("id", sessionId);
    if (["personal", "lider", "know_how"].includes(ses.tipo)) {
      await encolar({ company_id: job.company_id, tipo: "minar_know_how", payload: { session_id: sessionId }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["minar", sessionId]) });
    }
  } else if (ses.estado === "pendiente") {
    await sb.from("interview_sessions").update({ estado: "en_curso" }).eq("id", sessionId);
  }
  return { generadas: preguntas.length, bloques_sin_cubrir: sinCubrir.map((b) => b.clave), cerrada: cerrar };
}

/** payload: { response_id } → transcribe el audio guardado y dispara extracción. Si no hay transcriptor, libera la pregunta para texto (P1-11). */
export async function handleTranscribirRespuesta(job: Job) {
  const sb = supabaseAdmin();
  const id = String(job.payload.response_id);
  const { data: r } = await sb.from("interview_responses").select("id,respuesta_audio_path,session_id").eq("id", id).single();
  if (!r?.respuesta_audio_path) throw new Error("Sin audio");
  if (!ai().puedeTranscribir()) {
    await sb.from("interview_responses").update({ respuesta_audio_path: null }).eq("id", id);
    throw new Error("No hay transcriptor configurado. La pregunta volvió a abrirse para responder por texto.");
  }
  await progreso(job.id, "Escuchando tu respuesta");
  const { data: blob } = await sb.storage.from("fuentes").download(r.respuesta_audio_path);
  if (!blob) throw new Error("No pudimos descargar el audio");
  try {
    const t = await ai().transcribe(blob, blob.type || "audio/webm");
    await sb.from("interview_responses").update({ respuesta: t.texto, respondido_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    // Último intento fallido → liberar la pregunta para que la persona responda por texto.
    const { data: j } = await sb.from("jobs").select("intentos,max_intentos").eq("id", job.id).single();
    if (j && j.intentos >= j.max_intentos) await sb.from("interview_responses").update({ respuesta_audio_path: null }).eq("id", id);
    throw e;
  }
  await encolar({ company_id: job.company_id, tipo: "extraer", payload: { response_id: id }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["extraer", "resp", id]) });
  await encolar({ company_id: job.company_id, tipo: "entrevista_siguiente", payload: { session_id: r.session_id }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["siguiente", r.session_id, id]) });
  return { ok: true };
}

/** payload: { session_id } → MINERO DE KNOW-HOW sobre la transcripción completa. Relaciona con proceso y crea hallazgo de riesgo si corresponde. */
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
  await registrarLlamada(job.company_id, job.id, "minero", r);

  const { data: procesos } = await sb.from("processes").select("id,nombre").eq("company_id", job.company_id).eq("version", "as_is");
  const buscarProceso = (nombre: string | null | undefined) => {
    if (!nombre) return null;
    const n = nombre.toLowerCase();
    return (procesos ?? []).find((x) => x.nombre.toLowerCase().includes(n) || n.includes(x.nombre.toLowerCase()))?.id ?? null;
  };
  for (const u of r.data.unidades) {
    await sb.from("know_how").insert({
      company_id: job.company_id,
      participant_id: ses.participant_id,
      puesto: p.puesto ?? p.rol,
      rol: p.rol,
      process_id: buscarProceso(u.proceso),
      situacion: u.situacion, senal: u.senal, decision: u.decision, excepcion: u.excepcion, estandar: u.estandar,
      error_frecuente: u.error_frecuente, regla_practica: u.regla_practica, escalamiento: u.escalamiento, criterio_experto: u.criterio_experto ?? null,
      criticidad: u.criticidad, documentado: u.documentado, destino: u.destino,
    });
  }
  // Un puesto crítico con know-how vacío es un hallazgo de riesgo (7.5). Se crea pendiente de revisión, con la evidencia de la entrevista.
  if (r.data.riesgo_know_how_vacio) {
    const { data: claimsPersona } = await sb.from("claims").select("id").eq("company_id", job.company_id).eq("participant_id", ses.participant_id).limit(3);
    if (claimsPersona?.length) {
      const { data: f } = await sb.from("findings").insert({ company_id: job.company_id, pilar: "personas", patron: "know_how_en_una_persona", titulo: `Información insuficiente: el puesto "${p.puesto ?? p.rol}" no tiene su know-how capturado`, causa_raiz: "La entrevista no logró extraer criterios del oficio; no se puede rediseñar ni automatizar este puesto sin ellos", impacto: "medio", veredicto: null, recomendacion: "Profundizar con una sesión de know-how antes de tocar este puesto", filtros: { proposito: { resultado: "pasa", nota: "" }, sabiduria: { resultado: "pasa", nota: "" }, excelencia: { resultado: "pasa", nota: "" } }, origen: "ia", requiere_validacion: true, motivo_validacion: "Generado por regla: know-how vacío" }).select("id").single();
      if (f) await sb.from("finding_evidence").insert(claimsPersona.map((c) => ({ finding_id: f.id, claim_id: c.id, relacion: "sustenta" })));
    }
  }
  return { unidades: r.data.unidades.length, riesgo: r.data.riesgo_know_how_vacio ?? false };
}
