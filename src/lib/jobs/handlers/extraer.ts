import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrExtractor } from "@/lib/ai/agents/extractor";
import type { Adjunto } from "@/lib/ai/provider";
import { registrarTokens } from "@/lib/db/queries";
import { requiereValidacionPrioritaria } from "@/lib/rules/vigencia";
import { encolar, PRIORIDAD, progreso, claveIdempotente } from "../queue";
import { ai } from "@/lib/ai";

const PALABRAS_POR_TRAMO = 8000;

export function trocear(texto: string, palabras = PALABRAS_POR_TRAMO): string[] {
  const w = texto.split(/\s+/);
  const tramos: string[] = [];
  for (let i = 0; i < w.length; i += palabras) tramos.push(w.slice(i, i + palabras).join(" "));
  return tramos.length ? tramos : [""];
}

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/**
 * payload: { source_id } → lee la fuente, la trocea y crea un job por tramo (chunk_index).
 * payload: { source_id, chunk_index, total } → extrae ese tramo.
 * payload: { response_id } → extrae afirmaciones de una respuesta de entrevista.
 */
export async function handleExtraer(job: Job) {
  const sb = supabaseAdmin();
  const p = job.payload;

  if (p.response_id) return extraerDeRespuesta(job, String(p.response_id));

  const sourceId = String(p.source_id);
  const { data: src, error } = await sb.from("sources").select("*").eq("id", sourceId).single();
  if (error || !src) throw new Error("Fuente no encontrada");

  // --- Fase 1: preparar (texto o adjunto) y trocear ---
  if (p.chunk_index === undefined) {
    await sb.from("sources").update({ estado: "leyendo", error: null }).eq("id", sourceId);
    let texto = src.contenido as string | null;
    const mime = (src.mime as string | null) ?? "";

    if (!texto && src.storage_path) {
      const { data: blob, error: e2 } = await sb.storage.from("fuentes").download(src.storage_path);
      if (e2 || !blob) throw new Error("No pudimos descargar el archivo de la fuente");
      if (src.tipo === "audio") {
        await progreso(job.id, "Escuchando la nota de voz");
        texto = await ai().transcribe(blob, mime || "audio/webm");
        await sb.from("sources").update({ contenido: texto }).eq("id", sourceId);
      } else if (mime.startsWith("text/") || mime.includes("csv")) {
        texto = await blob.text();
        await sb.from("sources").update({ contenido: texto }).eq("id", sourceId);
      }
      // imagen y PDF: se envían como adjunto en fase 2
    }

    if (texto) {
      const tramos = trocear(texto);
      for (let i = 0; i < tramos.length; i++) {
        await encolar({
          company_id: job.company_id,
          tipo: "extraer",
          payload: { source_id: sourceId, chunk_index: i, total: tramos.length, texto: tramos[i] },
          prioridad: PRIORIDAD.extraer,
          idempotency_key: claveIdempotente(["extraer", sourceId, i]),
        });
      }
      await progreso(job.id, `Leyendo ${src.nombre}: ${tramos.length} tramo(s) encolados`);
      return { tramos: tramos.length };
    }
    // Sin texto → una sola llamada con adjunto
    await encolar({
      company_id: job.company_id,
      tipo: "extraer",
      payload: { source_id: sourceId, chunk_index: 0, total: 1, adjunto: true },
      prioridad: PRIORIDAD.extraer,
      idempotency_key: claveIdempotente(["extraer", sourceId, 0]),
    });
    return { tramos: 1 };
  }

  // --- Fase 2: extraer un tramo ---
  const idx = Number(p.chunk_index), total = Number(p.total ?? 1);
  await progreso(job.id, `Leyendo ${src.nombre} — tramo ${idx + 1} de ${total}`);

  let adjuntos: Adjunto[] | undefined;
  if (p.adjunto && src.storage_path) {
    const { data: blob } = await sb.storage.from("fuentes").download(src.storage_path);
    if (!blob) throw new Error("No pudimos descargar el archivo");
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const mime = (src.mime as string) ?? "";
    if (mime === "application/pdf") adjuntos = [{ tipo: "pdf", base64 }];
    else if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) adjuntos = [{ tipo: "imagen", mime: mime as "image/jpeg", base64 }];
    else throw new Error(`No pudimos leer ese archivo (${mime || "tipo desconocido"}). Súbelo como PDF, foto o texto.`);
  }

  const fechaDoc = src.fecha_origen ? `Fecha del documento: ${src.fecha_origen}.` : "El documento no indica fecha.";
  const contexto = `Fuente: "${src.nombre}" (tipo: ${src.tipo}). ${fechaDoc} Tramo ${idx + 1} de ${total}.`;
  const r = await correrExtractor({ texto: p.texto ? String(p.texto) : undefined, adjuntos, contexto });
  await registrarTokens(job.company_id, job.id, "extractor", r.tokens_entrada, r.tokens_salida);

  let nuevas = 0;
  for (const a of r.data.afirmaciones) {
    let fragmentId: string | null = null;
    if (a.fragmento || a.pagina || a.seccion) {
      const { data: fr } = await sb
        .from("source_fragments")
        .insert({ source_id: sourceId, pagina: a.pagina ?? null, seccion: a.seccion ?? null, texto: a.fragmento ?? null })
        .select("id")
        .single();
      fragmentId = fr?.id ?? null;
    }
    const fecha = a.fecha_afirmacion ?? (src.fecha_origen as string | null) ?? null;
    const prioridad = requiereValidacionPrioritaria({ id: "", tipo: a.tipo, temporalidad: a.temporalidad, estado: "sin_verificar", fecha_afirmacion: fecha, source_tipo: src.tipo });
    const { error: e3 } = await sb.from("claims").insert({
      company_id: job.company_id,
      source_id: sourceId,
      fragment_id: fragmentId,
      texto: a.texto,
      pilar: a.pilar,
      tipo: a.tipo,
      temporalidad: a.temporalidad,
      fecha_afirmacion: fecha,
      prioridad_validacion: prioridad,
    });
    if (!e3) nuevas++;
  }

  // ¿Terminaron todos los tramos? → fuente leída + contraste en continuo
  const { count } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("company_id", job.company_id).eq("tipo", "extraer").in("estado", ["pendiente", "corriendo"]).neq("id", job.id).contains("payload", { source_id: sourceId });
  if (!count) {
    await sb.from("sources").update({ estado: "leido" }).eq("id", sourceId);
    await encolar({ company_id: job.company_id, tipo: "contrastar", payload: { source_id: sourceId }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["contrastar", sourceId, Date.now()]) });
  }
  await progreso(job.id, `Encontramos ${nuevas} definiciones en el tramo ${idx + 1} de ${total}`);
  return { nuevas };
}

async function extraerDeRespuesta(job: Job, responseId: string) {
  const sb = supabaseAdmin();
  const { data: r } = await sb.from("interview_responses").select("*, interview_sessions(id,company_id,participant_id,tipo,participants(nombre,puesto,rol))").eq("id", responseId).single();
  if (!r || !r.respuesta) return { nuevas: 0 };
  const ses = r.interview_sessions as { id: string; company_id: string; participant_id: string; tipo: string; participants: { nombre: string; puesto: string | null; rol: string | null } };

  // Fuente "entrevista" por sesión (una sola)
  let { data: src } = await sb.from("sources").select("id").eq("company_id", ses.company_id).eq("tipo", "entrevista").eq("nombre", `Entrevista · ${ses.participants?.puesto ?? ses.participants?.rol ?? "participante"} · ${ses.id.slice(0, 8)}`).maybeSingle();
  if (!src) {
    const { data: s2 } = await sb
      .from("sources")
      .insert({ company_id: ses.company_id, tipo: "entrevista", nombre: `Entrevista · ${ses.participants?.puesto ?? ses.participants?.rol ?? "participante"} · ${ses.id.slice(0, 8)}`, fecha_origen: new Date().toISOString().slice(0, 10), origen: "cliente", estado: "leido" })
      .select("id")
      .single();
    src = s2;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const quien = ses.participants?.rol === "dueno" ? "el dueño" : `una persona del equipo (${ses.participants?.puesto ?? ses.participants?.rol})`;
  const contexto = `Transcripción de entrevista a ${quien}. Fecha: ${hoy}. Lo que dice es su percepción actual: temporalidad actual salvo que hable del pasado o de metas.`;
  const texto = `PREGUNTA: ${r.pregunta}\nRESPUESTA: ${r.respuesta}`;
  const out = await correrExtractor({ texto, contexto });
  await registrarTokens(ses.company_id, job.id, "extractor", out.tokens_entrada, out.tokens_salida);

  let nuevas = 0;
  for (const a of out.data.afirmaciones) {
    const { data: fr } = await sb.from("source_fragments").insert({ source_id: src!.id, seccion: `Pregunta ${r.orden ?? ""}`, texto: a.fragmento ?? r.respuesta }).select("id").single();
    const { error } = await sb.from("claims").insert({
      company_id: ses.company_id,
      source_id: src!.id,
      fragment_id: fr?.id ?? null,
      participant_id: ses.participant_id,
      texto: a.texto,
      pilar: a.pilar,
      tipo: a.tipo,
      temporalidad: a.temporalidad,
      fecha_afirmacion: a.fecha_afirmacion ?? hoy,
      // Lo que el dueño dice hoy, lo sostiene hoy.
      estado: ses.participants?.rol === "dueno" ? "confirmado" : "sin_verificar",
    });
    if (!error) nuevas++;
  }
  if (nuevas) await encolar({ company_id: ses.company_id, tipo: "contrastar", payload: { response_id: responseId }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["contrastar", "resp", responseId]) });
  return { nuevas };
}
