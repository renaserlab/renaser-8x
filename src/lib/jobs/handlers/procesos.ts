import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrArquitecto, correrToBe, correrSop } from "@/lib/ai/agents/arquitecto";
import { procesoCompleto, procesoComoJSON, registrarLlamada } from "@/lib/db/queries";
import { autoLayout } from "@/lib/layout";
import { validarFlujograma, tieneFinalMalo, removeConDependientes, automatizacionesInvalidas } from "@/lib/rules/grafo";
import type { SalidaArquitecto } from "@/lib/schemas";
import { progreso } from "../queue";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/** Avisos estructurales (P1-07): no bloquean el guardado; quedan en `problema` del nodo y en el resultado del job. */
export function avisosDeFlujo(flujo: SalidaArquitecto): { avisos: string[]; porNodo: Map<string, string[]> } {
  const f = { nodos: flujo.nodos.map((n) => ({ id: n.id, tipo: n.tipo, etiqueta: n.etiqueta, veredicto: n.veredicto ?? null, ejecutor: n.ejecutor ?? null })), conexiones: flujo.conexiones };
  const v = validarFlujograma(f);
  const porNodo = new Map<string, string[]>();
  const avisos: string[] = [];
  for (const p of v.problemas) {
    if (p.nodo) porNodo.set(p.nodo, [...(porNodo.get(p.nodo) ?? []), p.mensaje]);
    else avisos.push(p.mensaje);
  }
  if (!tieneFinalMalo(f)) avisos.push("El proceso no tiene ningún final malo dibujado: ¿dónde se pierde el cliente, el pedido o el dinero?");
  for (const d of removeConDependientes(f)) porNodo.set(d.nodo, [...(porNodo.get(d.nodo) ?? []), `Se elimina pero ${d.dependientes.length} paso(s) dependen de él: ¿de dónde saldrá ahora esa entrada?`]);
  for (const n of automatizacionesInvalidas(f)) porNodo.set(n.id, [...(porNodo.get(n.id) ?? []), "No se automatiza: paso indefinido o marcado para eliminar"]);
  return { avisos, porNodo };
}

/** Inserta nodos + conexiones con auto-layout y avisos estructurales. Devuelve el id del proceso. */
export async function guardarFlujograma(companyId: string, flujo: SalidaArquitecto, opts: { version: "as_is" | "to_be"; origen: "dibujado" | "generado_ia"; padre_id?: string | null; process_id?: string }) {
  const sb = supabaseAdmin();
  let processId = opts.process_id;
  if (!processId) {
    const { data: p, error } = await sb.from("processes").insert({ company_id: companyId, nombre: flujo.nombre, area: flujo.area ?? null, version: opts.version, origen: opts.origen, padre_id: opts.padre_id ?? null }).select("id").single();
    if (error) throw error;
    processId = p.id;
  } else {
    await sb.from("process_nodes").delete().eq("process_id", processId);
  }
  const { porNodo, avisos } = avisosDeFlujo(flujo);
  const pos = autoLayout(flujo.nodos.map((n) => ({ id: n.id, tipo: n.tipo })), flujo.conexiones.map((c) => ({ origen: c.de, destino: c.a })));
  const idMap = new Map<string, string>();
  for (const n of flujo.nodos) {
    const xy = pos.get(n.id) ?? { x: 0, y: 0 };
    const problema = [n.problema, ...(porNodo.get(n.id) ?? [])].filter(Boolean).join(" · ") || null;
    const { data: row } = await sb
      .from("process_nodes")
      .insert({ process_id: processId, tipo: n.tipo, etiqueta: n.etiqueta, responsable: n.responsable ?? null, rol: n.rol ?? null, ejecutor: n.ejecutor ?? (n.tipo === "actividad" ? "humano" : null), herramienta: n.herramienta ?? null, tiempo: n.tiempo ?? null, espera: n.espera ?? null, entrada: n.entrada ?? null, salida: n.salida ?? null, evidencia: n.evidencia ?? null, estandar: n.estandar ?? null, problema, veredicto: n.veredicto ?? null, pos_x: xy.x, pos_y: xy.y })
      .select("id")
      .single();
    if (row) idMap.set(n.id, row.id);
  }
  for (const c of flujo.conexiones) {
    const o = idMap.get(c.de), d = idMap.get(c.a);
    if (o && d) await sb.from("process_edges").insert({ process_id: processId, origen: o, destino: d, etiqueta: c.etiqueta ?? null });
  }
  return { processId: processId!, avisos, problemasPorNodo: porNodo.size };
}

/** payload: { descripcion, process_id? } → ARQUITECTO dibuja (prioridad 2). */
export async function handleGenerarProceso(job: Job) {
  const descripcion = String(job.payload.descripcion ?? "").trim();
  if (!descripcion || descripcion === "(vacío)") {
    // Proceso en blanco: no se gasta una llamada. Un inicio y un fin para empezar a dibujar.
    const r = await guardarFlujograma(job.company_id, { nombre: "Proceso nuevo", nodos: [{ id: "a", tipo: "inicio", etiqueta: "Empieza" }, { id: "b", tipo: "fin", etiqueta: "Termina" }], conexiones: [{ de: "a", a: "b" }] }, { version: "as_is", origen: "dibujado", process_id: job.payload.process_id ? String(job.payload.process_id) : undefined });
    return { process_id: r.processId, nodos: 2, en_blanco: true };
  }
  await progreso(job.id, "Dibujando el proceso que describiste");
  const r = await correrArquitecto(descripcion);
  await registrarLlamada(job.company_id, job.id, "arquitecto", r);
  const g = await guardarFlujograma(job.company_id, r.data, { version: "as_is", origen: "generado_ia", process_id: job.payload.process_id ? String(job.payload.process_id) : undefined });
  const sbP = supabaseAdmin();
  if (job.payload.process_id) {
    const ficha = r.data.ficha ?? null;
    await sbP.from("processes").update({
      confirmacion: "por_confirmar",
      descripcion_original: descripcion,
      objetivo: ficha?.objetivo ?? null,
      inicio: ficha?.inicio ?? null,
      resultado: ficha?.resultado ?? null,
      tiempo: ficha?.tiempo ?? null,
      herramientas: ficha?.herramientas ?? null,
      // Lo que la persona ya contó sobre qué se traba y cómo se mide: estaba en la base desde
      // siempre y nadie lo guardaba, así que la ficha volvía a preguntárselo. Null si no lo dijo.
      sale_mal: ficha?.sale_mal ?? null,
      como_bien: ficha?.como_bien ?? null,
      indicador: ficha?.indicador ?? null,
      meta: ficha?.meta ?? null,
      medicion_donde: ficha?.medicion_donde ?? null,
    }).eq("id", String(job.payload.process_id));
  }
  // La pregunta del hueco (fase 17) entra a la conversación del dueño como siguiente pregunta pendiente.
  if (r.data.pregunta_gap?.trim()) {
    const { data: sesDueno } = await sbP.from("interview_sessions").select("id, participants!inner(rol)").eq("company_id", job.company_id).eq("tipo", "empresa_dueno").in("participants.rol", ["dueno", "socio"]).neq("estado", "completa").limit(1).maybeSingle();
    if (sesDueno) {
      const { data: ult } = await sbP.from("interview_responses").select("orden").eq("session_id", sesDueno.id).order("orden", { ascending: false }).limit(1);
      const { data: hayAbierta } = await sbP.from("interview_responses").select("id").eq("session_id", sesDueno.id).is("respuesta", null).limit(1);
      if (!hayAbierta?.length) await sbP.from("interview_responses").insert({ session_id: sesDueno.id, bloque: "procesos", pilar: "procesos", pregunta: r.data.pregunta_gap.trim(), orden: (ult?.[0]?.orden ?? 0) + 1 });
    }
  }
  return { process_id: g.processId, nodos: r.data.nodos.length, avisos: g.avisos, nodos_con_avisos: g.problemasPorNodo };
}

/** payload: { process_id } → TO-BE del AS-IS. */
export async function handleGenerarToBe(job: Job) {
  const sb = supabaseAdmin();
  const pid = String(job.payload.process_id);
  const { proceso, nodos, edges } = await procesoCompleto(pid);
  if (!proceso) throw new Error("Proceso no encontrado");
  await progreso(job.id, `Rediseñando "${proceso.nombre}"`);
  const [{ data: hallazgos }, { data: kh }] = await Promise.all([
    sb.from("findings").select("titulo,causa_raiz,recomendacion,veredicto,impacto").eq("company_id", job.company_id).in("estado_revision", ["aprobado", "corregido"]).eq("requiere_validacion", false),
    sb.from("know_how").select("puesto,situacion,senal,decision,regla_practica,criticidad,documentado").eq("company_id", job.company_id).or(`process_id.eq.${pid},process_id.is.null`),
  ]);
  const contexto = [
    `PROCESO AS-IS: ${proceso.nombre} (área: ${proceso.area ?? "—"})`,
    procesoComoJSON(nodos, edges),
    `HALLAZGOS APROBADOS (${hallazgos?.length ?? 0}):`,
    (hallazgos ?? []).map((h) => `- [${h.impacto}] ${h.titulo}. Causa: ${h.causa_raiz}. Recomendación: ${h.recomendacion ?? "—"}`).join("\n") || "(ninguno)",
    `KNOW-HOW MINADO (${kh?.length ?? 0}):`,
    (kh ?? []).map((k) => `- ${k.puesto} [criticidad ${k.criticidad}${k.documentado ? ", documentado" : ", NO documentado"}]: ${k.situacion ?? ""} | señal: ${k.senal ?? ""} | decisión: ${k.decision ?? ""} | regla: ${k.regla_practica ?? ""}`).join("\n") || "(ninguno — si un puesto se va a automatizar, es un riesgo)",
  ].join("\n\n");
  const r = await correrToBe(contexto);
  await registrarLlamada(job.company_id, job.id, "rediseno", r);
  const { data: previo } = await sb.from("processes").select("id").eq("padre_id", pid).eq("version", "to_be").maybeSingle();
  const g = await guardarFlujograma(job.company_id, { ...r.data, nombre: r.data.nombre || proceso.nombre }, { version: "to_be", origen: "generado_ia", padre_id: pid, process_id: previo?.id });
  if (previo) await sb.from("processes").update({ nombre: r.data.nombre || proceso.nombre }).eq("id", previo.id);
  // Regla: un create sin justificación es inválido → se marca en el nodo.
  const justificados = new Set(r.data.cambios.map((c) => c.nodo.toLowerCase()));
  for (const n of r.data.nodos.filter((x) => x.veredicto === "create" && !justificados.has(x.etiqueta.toLowerCase()))) {
    await sb.from("process_nodes").update({ problema: "Paso nuevo sin justificación: revisar antes de aprobar" }).eq("process_id", g.processId).eq("etiqueta", n.etiqueta);
  }
  return { process_id: g.processId, justificacion: r.data.justificacion, cambios: r.data.cambios.length, avisos: g.avisos };
}

/** payload: { process_id } → SOP, y enlaza el know-how del proceso al SOP (destino). */
export async function handleGenerarSop(job: Job) {
  const sb = supabaseAdmin();
  const pid = String(job.payload.process_id);
  const { proceso, nodos, edges } = await procesoCompleto(pid);
  if (!proceso) throw new Error("Proceso no encontrado");
  await progreso(job.id, `Escribiendo cómo se hace "${proceso.nombre}"`);
  const padre = proceso.padre_id ?? pid;
  const { data: kh } = await sb.from("know_how").select("id,puesto,situacion,senal,decision,excepcion,estandar,error_frecuente,regla_practica,escalamiento,criterio_experto").eq("company_id", job.company_id).or(`process_id.eq.${pid},process_id.eq.${padre},process_id.is.null`);
  const contexto = [`PROCESO: ${proceso.nombre} (${proceso.version})`, procesoComoJSON(nodos, edges), `KNOW-HOW:`, JSON.stringify((kh ?? []).map((x) => ({ ...x, id: undefined })), null, 1)].join("\n\n");
  const r = await correrSop(contexto);
  await registrarLlamada(job.company_id, job.id, "sop", r);
  await sb.from("sops").delete().eq("process_id", pid);
  const { data: s } = await sb.from("sops").insert({ process_id: pid, objetivo: r.data.objetivo, disparador: r.data.disparador, responsable: r.data.responsable, pasos: r.data.pasos, entradas: r.data.entradas, salidas: r.data.salidas, estandar: r.data.estandar, indicador: r.data.indicador, excepciones: r.data.excepciones }).select("id").single();
  const delProceso = (kh ?? []).filter(() => true).map((k) => k.id);
  if (s && delProceso.length) await sb.from("know_how").update({ sop_id: s.id, destino: "sop" }).in("id", delProceso).or(`process_id.eq.${pid},process_id.eq.${padre}`);
  return { sop_id: s?.id };
}
