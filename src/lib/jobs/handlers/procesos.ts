import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrArquitecto, correrToBe, correrSop } from "@/lib/ai/agents/arquitecto";
import { procesoCompleto, procesoComoJSON, registrarTokens } from "@/lib/db/queries";
import { autoLayout } from "@/lib/layout";
import type { SalidaArquitecto } from "@/lib/schemas";
import { progreso } from "../queue";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/** Inserta nodos + conexiones con auto-layout. Devuelve el id del proceso. */
export async function guardarFlujograma(companyId: string, flujo: SalidaArquitecto, opts: { version: "as_is" | "to_be"; origen: "dibujado" | "generado_ia"; padre_id?: string | null; process_id?: string }) {
  const sb = supabaseAdmin();
  let processId = opts.process_id;
  if (!processId) {
    const { data: p, error } = await sb
      .from("processes")
      .insert({ company_id: companyId, nombre: flujo.nombre, area: flujo.area ?? null, version: opts.version, origen: opts.origen, padre_id: opts.padre_id ?? null })
      .select("id")
      .single();
    if (error) throw error;
    processId = p.id;
  } else {
    await sb.from("process_nodes").delete().eq("process_id", processId);
  }
  const pos = autoLayout(flujo.nodos.map((n) => ({ id: n.id, tipo: n.tipo })), flujo.conexiones.map((c) => ({ origen: c.de, destino: c.a })));
  const idMap = new Map<string, string>();
  for (const n of flujo.nodos) {
    const xy = pos.get(n.id) ?? { x: 0, y: 0 };
    const { data: row } = await sb
      .from("process_nodes")
      .insert({ process_id: processId, tipo: n.tipo, etiqueta: n.etiqueta, responsable: n.responsable ?? null, ejecutor: n.ejecutor ?? (n.tipo === "actividad" ? "humano" : null), herramienta: n.herramienta ?? null, tiempo: n.tiempo ?? null, problema: n.problema ?? null, veredicto: n.veredicto ?? null, pos_x: xy.x, pos_y: xy.y })
      .select("id")
      .single();
    if (row) idMap.set(n.id, row.id);
  }
  for (const c of flujo.conexiones) {
    const o = idMap.get(c.de), d = idMap.get(c.a);
    if (o && d) await sb.from("process_edges").insert({ process_id: processId, origen: o, destino: d, etiqueta: c.etiqueta ?? null });
  }
  return processId!;
}

/** payload: { descripcion, process_id? } → ARQUITECTO dibuja (prioridad 2). */
export async function handleGenerarProceso(job: Job) {
  await progreso(job.id, "Dibujando el proceso que describiste");
  const r = await correrArquitecto(String(job.payload.descripcion));
  await registrarTokens(job.company_id, job.id, "arquitecto", r.tokens_entrada, r.tokens_salida);
  const id = await guardarFlujograma(job.company_id, r.data, { version: "as_is", origen: "generado_ia", process_id: job.payload.process_id ? String(job.payload.process_id) : undefined });
  return { process_id: id, nodos: r.data.nodos.length };
}

/** payload: { process_id } → TO-BE del AS-IS. */
export async function handleGenerarToBe(job: Job) {
  const sb = supabaseAdmin();
  const pid = String(job.payload.process_id);
  const { proceso, nodos, edges } = await procesoCompleto(pid);
  if (!proceso) throw new Error("Proceso no encontrado");
  await progreso(job.id, `Rediseñando "${proceso.nombre}"`);
  const [{ data: hallazgos }, { data: kh }] = await Promise.all([
    sb.from("findings").select("titulo,causa_raiz,recomendacion,veredicto,impacto").eq("company_id", job.company_id).in("estado_revision", ["aprobado", "corregido"]),
    sb.from("know_how").select("puesto,situacion,senal,decision,regla_practica").eq("company_id", job.company_id),
  ]);
  const contexto = [
    `PROCESO AS-IS: ${proceso.nombre} (área: ${proceso.area ?? "—"})`,
    procesoComoJSON(nodos, edges),
    `HALLAZGOS APROBADOS (${hallazgos?.length ?? 0}):`,
    (hallazgos ?? []).map((h) => `- [${h.impacto}] ${h.titulo}. Causa: ${h.causa_raiz}. Recomendación: ${h.recomendacion ?? "—"}`).join("\n") || "(ninguno)",
    `KNOW-HOW MINADO (${kh?.length ?? 0}):`,
    (kh ?? []).map((k) => `- ${k.puesto}: ${k.situacion ?? ""} | señal: ${k.senal ?? ""} | decisión: ${k.decision ?? ""} | regla: ${k.regla_practica ?? ""}`).join("\n") || "(ninguno — si un puesto se va a automatizar, es un riesgo)",
  ].join("\n\n");
  const r = await correrToBe(contexto);
  await registrarTokens(job.company_id, job.id, "rediseno", r.tokens_entrada, r.tokens_salida);
  // Reemplaza un TO-BE previo del mismo padre
  const { data: previo } = await sb.from("processes").select("id").eq("padre_id", pid).eq("version", "to_be").maybeSingle();
  const id = await guardarFlujograma(job.company_id, { ...r.data, nombre: r.data.nombre || proceso.nombre }, { version: "to_be", origen: "generado_ia", padre_id: pid, process_id: previo?.id });
  if (previo) await sb.from("processes").update({ nombre: r.data.nombre || proceso.nombre }).eq("id", previo.id);
  return { process_id: id, justificacion: r.data.justificacion };
}

/** payload: { process_id } → SOP. */
export async function handleGenerarSop(job: Job) {
  const sb = supabaseAdmin();
  const pid = String(job.payload.process_id);
  const { proceso, nodos, edges } = await procesoCompleto(pid);
  if (!proceso) throw new Error("Proceso no encontrado");
  await progreso(job.id, `Escribiendo cómo se hace "${proceso.nombre}"`);
  const { data: kh } = await sb.from("know_how").select("puesto,situacion,senal,decision,excepcion,estandar,error_frecuente,regla_practica,escalamiento").eq("company_id", job.company_id);
  const contexto = [`PROCESO: ${proceso.nombre} (${proceso.version})`, procesoComoJSON(nodos, edges), `KNOW-HOW:`, JSON.stringify(kh ?? [], null, 1)].join("\n\n");
  const r = await correrSop(contexto);
  await registrarTokens(job.company_id, job.id, "sop", r.tokens_entrada, r.tokens_salida);
  await sb.from("sops").delete().eq("process_id", pid);
  const { data: s } = await sb
    .from("sops")
    .insert({ process_id: pid, objetivo: r.data.objetivo, disparador: r.data.disparador, responsable: r.data.responsable, pasos: r.data.pasos, entradas: r.data.entradas, salidas: r.data.salidas, estandar: r.data.estandar, indicador: r.data.indicador, excepciones: r.data.excepciones })
    .select("id")
    .single();
  return { sop_id: s?.id };
}
