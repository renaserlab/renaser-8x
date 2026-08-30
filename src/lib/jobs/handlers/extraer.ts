import { PDFDocument } from "pdf-lib";
import { normalizarMetrica } from "@/lib/metricas";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrExtractor } from "@/lib/ai/agents/extractor";
import type { Adjunto, Segmento } from "@/lib/ai/provider";
import { registrarLlamada } from "@/lib/db/queries";
import { requiereValidacionPrioritaria } from "@/lib/rules/vigencia";
import { encolar, PRIORIDAD, progreso, claveIdempotente } from "../queue";
import { ai } from "@/lib/ai";

const PALABRAS_POR_TRAMO = 8000;
const PAGINAS_POR_TRAMO = 15;
const FILAS_POR_TRAMO = 400;

export function trocear(texto: string, palabras = PALABRAS_POR_TRAMO): string[] {
  const w = texto.split(/\s+/);
  const tramos: string[] = [];
  for (let i = 0; i < w.length; i += palabras) tramos.push(w.slice(i, i + palabras).join(" "));
  return tramos.length ? tramos : [""];
}

/** CSV → texto con número de fila y nombre de columna, para que el extractor cite "fila N, columna X". */
export function csvComoTexto(csv: string): { tramos: string[]; filas: number } {
  const lineas = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { tramos: [""], filas: 0 };
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const cab = lineas[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const filas = lineas.slice(1);
  const tramos: string[] = [];
  for (let i = 0; i < filas.length; i += FILAS_POR_TRAMO) {
    const bloque = filas.slice(i, i + FILAS_POR_TRAMO).map((l, j) => {
      const v = l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
      return `fila ${i + j + 2}: ` + cab.map((c, k) => `${c}=${v[k] ?? ""}`).join(" | ");
    });
    tramos.push(`columnas: ${cab.join(", ")}\n${bloque.join("\n")}`);
  }
  return { tramos: tramos.length ? tramos : [""], filas: filas.length };
}

/** Busca el segmento de audio donde aparece un fragmento (1.10). */
export function segmentoDe(fragmento: string | null | undefined, segmentos: Segmento[]): Segmento | null {
  if (!fragmento || !segmentos.length) return null;
  const f = fragmento.toLowerCase().slice(0, 40);
  return segmentos.find((s) => s.texto.toLowerCase().includes(f) || f.includes(s.texto.toLowerCase().slice(0, 25))) ?? null;
}

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

type MetricaExtraida = { clave: string; periodo: string; valor: number | null; valor_texto?: string | null; estado: "contado" | "verificado" | "sin_dato"; nota?: string | null };

/** Sistema Adaptativo v2: guarda los números contados/verificados en company_metricas (upsert por clave+periodo).
 *  Un dato verificado nunca se degrada a contado; uno contado sí se mejora a verificado. */
async function guardarMetricas(sb: ReturnType<typeof supabaseAdmin>, companyId: string, metricas: MetricaExtraida[] | undefined, ref: { response_id?: string; source_id?: string; minEstado?: "verificado" }) {
  for (const m of metricas ?? []) {
    // NORMALIZACIÓN (30-08-2026): la IA inventaba una clave distinta cada vez para el mismo número
    // (`utilidad_mes`, `ganancia_neta_mes`, `ganancia_mes_western_union`), así que la radiografía
    // nunca se cerraba: Qori tenía 18 números y solo 3 de los nueve vitales. Aquí se lleva a la
    // clave canónica antes de guardar, y `venta_epoca_dorada` cae en venta_mes/epoca_dorada.
    const { clave, periodo } = normalizarMetrica(m.clave, m.periodo);
    const estado = ref.minEstado === "verificado" && m.estado !== "sin_dato" ? "verificado" : m.estado;
    const { data: prev } = await sb.from("company_metricas").select("id,estado").eq("company_id", companyId).eq("clave", clave).eq("periodo", periodo).maybeSingle();
    if (prev?.estado === "verificado" && estado !== "verificado") continue;
    const fila = { company_id: companyId, clave, periodo, valor: m.valor, valor_texto: m.valor_texto ?? null, estado, nota: m.nota ?? null, response_id: ref.response_id ?? null, source_id: ref.source_id ?? null, updated_at: new Date().toISOString() };
    if (prev) await sb.from("company_metricas").update(fila).eq("id", prev.id);
    else await sb.from("company_metricas").insert(fila);
  }
}

/**
 * payload: { source_id } → lee la fuente, la trocea (texto, CSV, PDF por páginas) y crea un job por tramo.
 * payload: { source_id, chunk_index, total, texto? | pdf_desde?, pdf_hasta? | adjunto? } → extrae ese tramo.
 * payload: { response_id } → extrae afirmaciones de una respuesta de entrevista.
 */
export async function handleExtraer(job: Job) {
  const sb = supabaseAdmin();
  const p = job.payload;
  if (p.response_id) return extraerDeRespuesta(job, String(p.response_id));

  const sourceId = String(p.source_id);
  const { data: src, error } = await sb.from("sources").select("*").eq("id", sourceId).single();
  if (error || !src) throw new Error("Fuente no encontrada");
  const mime = (src.mime as string | null) ?? "";

  // --- Fase 1: preparar y trocear ---
  if (p.chunk_index === undefined) {
    await sb.from("sources").update({ estado: "leyendo", error: null }).eq("id", sourceId);
    let texto = src.contenido as string | null;
    let segmentos: Segmento[] = [];
    let tramos: string[] | null = null;
    let pdfPaginas = 0;

    if (!texto && src.storage_path) {
      const { data: blob, error: e2 } = await sb.storage.from("fuentes").download(src.storage_path);
      if (e2 || !blob) throw new Error("No pudimos descargar el archivo de la fuente");
      if (src.tipo === "audio") {
        await progreso(job.id, "Escuchando la nota de voz");
        const t = await ai().transcribe(blob, mime || "audio/webm");
        texto = t.texto;
        segmentos = t.segmentos;
        await sb.from("sources").update({ contenido: texto }).eq("id", sourceId);
      } else if (mime.startsWith("text/") || mime.includes("csv") || src.tipo === "dato") {
        const crudo = await blob.text();
        await sb.from("sources").update({ contenido: crudo }).eq("id", sourceId);
        if (src.tipo === "dato" || mime.includes("csv")) {
          const c = csvComoTexto(crudo);
          tramos = c.tramos;
        } else texto = crudo;
      } else if (mime === "application/pdf") {
        try {
          const doc = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
          pdfPaginas = doc.getPageCount();
        } catch {
          throw new Error("No pudimos leer ese PDF: está dañado o protegido. Súbelo como fotos y lo leemos igual.");
        }
      }
    }

    if (!tramos && texto) tramos = trocear(texto);
    let n = 0;
    if (tramos) {
      for (let i = 0; i < tramos.length; i++) {
        await encolar({ company_id: job.company_id, tipo: "extraer", payload: { source_id: sourceId, chunk_index: i, total: tramos.length, texto: tramos[i], segmentos: segmentos.length ? segmentos : undefined }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer", sourceId, i]) });
      }
      n = tramos.length;
    } else if (pdfPaginas > 0) {
      const total = Math.ceil(pdfPaginas / PAGINAS_POR_TRAMO);
      for (let i = 0; i < total; i++) {
        await encolar({ company_id: job.company_id, tipo: "extraer", payload: { source_id: sourceId, chunk_index: i, total, pdf_desde: i * PAGINAS_POR_TRAMO, pdf_hasta: Math.min(pdfPaginas, (i + 1) * PAGINAS_POR_TRAMO) }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer", sourceId, i]) });
      }
      n = total;
    } else {
      // imagen u otro adjunto: una sola llamada
      await encolar({ company_id: job.company_id, tipo: "extraer", payload: { source_id: sourceId, chunk_index: 0, total: 1, adjunto: true }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer", sourceId, 0]) });
      n = 1;
    }
    await progreso(job.id, `Leyendo ${src.nombre}: ${n} tramo(s)`);
    return { tramos: n };
  }

  // --- Fase 2: extraer un tramo ---
  const idx = Number(p.chunk_index), total = Number(p.total ?? 1);
  await progreso(job.id, `Leyendo ${src.nombre} — tramo ${idx + 1} de ${total}`);

  let adjuntos: Adjunto[] | undefined;
  let paginaBase = 0;
  if ((p.adjunto || p.pdf_desde !== undefined) && src.storage_path) {
    const { data: blob } = await sb.storage.from("fuentes").download(src.storage_path);
    if (!blob) throw new Error("No pudimos descargar el archivo");
    const bytes = await blob.arrayBuffer();
    if (mime === "application/pdf") {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const desde = Number(p.pdf_desde ?? 0), hasta = Number(p.pdf_hasta ?? doc.getPageCount());
      paginaBase = desde;
      const parte = await PDFDocument.create();
      const idxs = Array.from({ length: hasta - desde }, (_, i) => desde + i);
      const paginas = await parte.copyPages(doc, idxs);
      paginas.forEach((pg) => parte.addPage(pg));
      adjuntos = [{ tipo: "pdf", base64: Buffer.from(await parte.save()).toString("base64") }];
    } else if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
      adjuntos = [{ tipo: "imagen", mime: mime as "image/jpeg", base64: Buffer.from(bytes).toString("base64") }];
    } else throw new Error(`No pudimos leer ese archivo (${mime || "tipo desconocido"}). Súbelo como PDF, foto o texto.`);
  }

  const fechaDoc = src.fecha_origen ? `Fecha del documento: ${src.fecha_origen}.` : "El documento no indica fecha.";
  const contexto = `Fuente: "${src.nombre}" (tipo: ${src.tipo}). ${fechaDoc} Tramo ${idx + 1} de ${total}.${paginaBase ? ` Reporta la página tal como la ves dentro de este tramo (1 = primera página del tramo); el sistema la convierte a la página del documento original.` : ""}`;
  const r = await correrExtractor({ texto: p.texto ? String(p.texto) : undefined, adjuntos, contexto });
  await registrarLlamada(job.company_id, job.id, "extractor", r);

  const segmentos = (p.segmentos as Segmento[] | undefined) ?? [];
  let nuevas = 0;
  for (let i = 0; i < r.data.afirmaciones.length; i++) {
    const a = r.data.afirmaciones[i];
    const seg = segmentoDe(a.fragmento, segmentos);
    let fragmentId: string | null = null;
    if (a.fragmento || a.pagina || a.seccion || a.celda || seg) {
      const { data: fr } = await sb
        .from("source_fragments")
        .insert({ source_id: sourceId, pagina: a.pagina != null ? a.pagina + paginaBase : null, seccion: a.seccion ?? null, celda: a.celda ?? null, audio_desde: seg?.desde ?? null, audio_hasta: seg?.hasta ?? null, texto: a.fragmento ?? null })
        .select("id")
        .single();
      fragmentId = fr?.id ?? null;
    }
    const fecha = a.fecha_afirmacion ?? (src.fecha_origen as string | null) ?? null;
    const prioridad = requiereValidacionPrioritaria({ id: "", tipo: a.tipo, temporalidad: a.temporalidad, estado: "sin_verificar", fecha_afirmacion: fecha, source_tipo: src.tipo });
    // P1-10: un reintento del mismo tramo no duplica (índice único parcial sobre idempotency_key).
    const { error: e3 } = await sb.from("claims").insert({
      company_id: job.company_id,
      source_id: sourceId,
      fragment_id: fragmentId,
      texto: a.texto,
      pilar: a.pilar,
      tipo: a.posible_instruccion ? "otro" : a.tipo,
      temporalidad: a.temporalidad,
      fecha_afirmacion: fecha,
      prioridad_validacion: prioridad,
      idempotency_key: claveIdempotente(["claim", sourceId, idx, i, a.texto.slice(0, 80)]),
    });
    if (!e3) nuevas++;
    else if (e3.code !== "23505") throw e3;
  }

  await guardarMetricas(sb, job.company_id, r.data.metricas, { source_id: sourceId, minEstado: "verificado" });

  // ¿Terminaron todos los tramos? → fuente leída + contraste en continuo (clave idempotente por fuente)
  const { count } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("company_id", job.company_id).eq("tipo", "extraer").in("estado", ["pendiente", "corriendo"]).neq("id", job.id).contains("payload", { source_id: sourceId });
  if (!count) {
    await sb.from("sources").update({ estado: "leido" }).eq("id", sourceId);
    await encolar({ company_id: job.company_id, tipo: "contrastar", payload: { source_id: sourceId }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["contrastar", sourceId]) });
  }
  await progreso(job.id, `Encontramos ${nuevas} definiciones en el tramo ${idx + 1} de ${total}`);
  return { nuevas };
}

async function extraerDeRespuesta(job: Job, responseId: string) {
  const sb = supabaseAdmin();
  const { data: r } = await sb.from("interview_responses").select("*, interview_sessions(id,company_id,participant_id,tipo,participants(nombre,puesto,rol))").eq("id", responseId).single();
  if (!r || !r.respuesta) return { nuevas: 0 };
  const ses = r.interview_sessions as { id: string; company_id: string; participant_id: string; tipo: string; participants: { nombre: string; puesto: string | null; rol: string | null } };

  const nombreFuente = `Entrevista · ${ses.participants?.puesto ?? ses.participants?.rol ?? "participante"} · ${ses.id.slice(0, 8)}`;
  let { data: src } = await sb.from("sources").select("id").eq("company_id", ses.company_id).eq("tipo", "entrevista").eq("nombre", nombreFuente).maybeSingle();
  if (!src) {
    const { data: s2 } = await sb.from("sources").insert({ company_id: ses.company_id, tipo: "entrevista", nombre: nombreFuente, fecha_origen: new Date().toISOString().slice(0, 10), origen: "cliente", estado: "leido" }).select("id").single();
    src = s2;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const rol = ses.participants?.rol;
  const quien = rol === "dueno" ? "el dueño" : rol === "socio" ? "un socio" : `una persona del equipo (${ses.participants?.puesto ?? rol})`;
  const contexto = `Transcripción de entrevista a ${quien}. Fecha: ${hoy}. Lo que dice es su percepción actual: temporalidad actual salvo que hable del pasado o de metas.`;
  const texto = `PREGUNTA: ${r.pregunta}\nRESPUESTA: ${r.respuesta}`;
  const out = await correrExtractor({ texto, contexto });
  await registrarLlamada(ses.company_id, job.id, "extractor", out);

  let nuevas = 0;
  for (let i = 0; i < out.data.afirmaciones.length; i++) {
    const a = out.data.afirmaciones[i];
    const { data: fr } = await sb.from("source_fragments").insert({ source_id: src!.id, seccion: `Pregunta ${r.orden ?? ""}: ${String(r.pregunta).slice(0, 120)}`, texto: a.fragmento ?? r.respuesta }).select("id").single();
    const { error } = await sb.from("claims").insert({
      company_id: ses.company_id,
      source_id: src!.id,
      fragment_id: fr?.id ?? null,
      participant_id: ses.participant_id,
      response_id: responseId,
      texto: a.texto,
      pilar: a.pilar,
      tipo: a.posible_instruccion ? "otro" : a.tipo,
      temporalidad: a.temporalidad,
      fecha_afirmacion: a.fecha_afirmacion ?? hoy,
      // P1-01: lo que una persona dice hoy, lo sostiene hoy → confirmado por quien lo dijo. La independencia de
      // fuentes (rules/evidencia.ts) impide que una sola opinión sostenga un hallazgo crítico.
      estado: "confirmado",
      validado_at: new Date().toISOString(),
      idempotency_key: claveIdempotente(["claim", "resp", responseId, i, a.texto.slice(0, 80)]),
    });
    if (!error) nuevas++;
    else if (error.code !== "23505") throw error;
  }
  await guardarMetricas(sb, ses.company_id, out.data.metricas, { response_id: responseId });
  if (nuevas) await encolar({ company_id: ses.company_id, tipo: "contrastar", payload: { response_id: responseId }, prioridad: PRIORIDAD.contrastar, idempotency_key: claveIdempotente(["contrastar", "resp", responseId]) });
  return { nuevas };
}
