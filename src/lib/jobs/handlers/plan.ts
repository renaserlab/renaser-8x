import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrPlanificador, correrRedactor, correrAdmision } from "@/lib/ai/agents/planificador";
import { correrEstratega } from "@/lib/ai/agents/estratega";
import { hallazgosAprobadosConEvidencia, procesoComoJSON, registrarLlamada, etiquetaFuente, claimsDeEmpresa } from "@/lib/db/queries";
import { detectarAnomalias, tablaResultadosComoTexto, type Metrica } from "@/lib/rules/anomalias";
import { progreso } from "../queue";
import { programarFrentes } from "@/lib/rules/plan";
import type { SalidaRedactor } from "@/lib/schemas";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/** payload: {} → EL ESTRATEGA redacta el Plan Estratégico (15 secciones, estándar firma top) → deliverables. */
export async function handlePlanEstrategico(job: Job) {
  const sb = supabaseAdmin();
  await progreso(job.id, "Reuniendo toda la evidencia de la empresa");
  const [{ data: empresa }, { data: findings }, { data: metricasRaw }, { data: sueno }, { data: activos }, { data: participantes }] = await Promise.all([
    sb.from("companies").select("nombre,sector,ficha,modelo_operativo,etapa_negocio").eq("id", job.company_id).single(),
    sb.from("findings").select("titulo,causa_raiz,impacto,pilar,patron,recomendacion,filtros").eq("company_id", job.company_id).neq("estado_revision", "rechazado").limit(40),
    sb.from("company_metricas").select("clave,periodo,valor,valor_texto,estado,nota").eq("company_id", job.company_id).limit(80),
    sb.from("interview_responses").select("bloque,pregunta,respuesta, interview_sessions!inner(tipo,company_id)").eq("interview_sessions.company_id", job.company_id).not("respuesta", "is", null).limit(80),
    sb.from("company_assets").select("clave,estado,borrador,propuesta").eq("company_id", job.company_id).not("borrador", "is", null),
    sb.from("participants").select("nombre,puesto,rol").eq("company_id", job.company_id),
  ]);
  if (!findings?.length) throw new Error("Todavía no hay hallazgos: corre el diagnóstico antes de pedir el plan estratégico.");
  const metricas = (metricasRaw ?? []) as Metrica[];
  const senales = detectarAnomalias(metricas);
  const ficha = (empresa?.ficha ?? {}) as Record<string, string>;

  await progreso(job.id, "El estratega está redactando el plan");
  const contexto = [
    `EMPRESA: ${empresa?.nombre} · ${empresa?.sector ?? ""} · ${ficha.personas ?? "?"} personas · etapa ${empresa?.etapa_negocio ?? "?"} · modelo ${((empresa?.modelo_operativo as string[]) ?? []).join(",") || "?"}`,
    `PERSONAS REALES (para responsables): ${(participantes ?? []).map((p) => `${p.nombre} (${p.puesto ?? p.rol})`).join(" · ") || "solo el dueño"}`,
    `HALLAZGOS (${findings.length}):\n${findings.map((f) => `- [${f.impacto} · ${f.pilar}${(f.filtros as { preserva?: boolean })?.preserva ? " · FORTALEZA" : ""}] ${f.titulo}. Causa: ${f.causa_raiz ?? ""}${f.recomendacion ? `. Rec: ${f.recomendacion}` : ""}`).join("\n")}`,
    `NÚMEROS CON ESTADO:\n${tablaResultadosComoTexto(metricas)}`,
    senales.length ? `SEÑALES DEL MOTOR:\n${senales.map((s) => `- ${s.titulo}: ${s.detalle}`).join("\n")}` : "",
    `LO QUE EL DUEÑO CONTÓ (sueño, historia, números):\n${(sueno ?? []).slice(0, 60).map((s) => `- ${s.pregunta} → ${String(s.respuesta).slice(0, 200)}`).join("\n")}`,
    (activos ?? []).length ? `DOCUMENTOS YA CONSTRUIDOS:\n${(activos ?? []).map((a) => `## ${a.clave}\n${String(a.propuesta ?? a.borrador).slice(0, 1200)}`).join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");

  const r = await correrEstratega(contexto);
  await registrarLlamada(job.company_id, job.id, "estratega", r);
  const { data: prev } = await sb.from("deliverables").select("version").eq("company_id", job.company_id).eq("tipo", "plan_estrategico").order("version", { ascending: false }).limit(1);
  const { error: errIns } = await sb.from("deliverables").insert({ company_id: job.company_id, tipo: "plan_estrategico", contenido: r.data, version: (prev?.[0]?.version ?? 0) + 1 });
  if (errIns) throw new Error(`No se pudo guardar el plan: ${errIns.message}`);
  return { version: (prev?.[0]?.version ?? 0) + 1, prioridades: r.data.prioridades.length };
}

/** PLANIFICADOR → actions (45 días en 7 semanas, máx. 3 abiertos). */
export async function handlePlanificar(job: Job) {
  const sb = supabaseAdmin();
  const hallazgos = await hallazgosAprobadosConEvidencia(job.company_id);
  if (!hallazgos.length) throw new Error("No hay hallazgos aprobados sin validación pendiente. Aprueba al menos uno antes de planificar.");
  await progreso(job.id, `Armando el plan con ${hallazgos.length} hallazgos aprobados`);
  const { data: tobes } = await sb.from("processes").select("id,nombre,area").eq("company_id", job.company_id).eq("version", "to_be");
  const partes: string[] = [];
  for (const p of tobes ?? []) {
    const [{ data: n }, { data: e }] = await Promise.all([sb.from("process_nodes").select("*").eq("process_id", p.id), sb.from("process_edges").select("*").eq("process_id", p.id)]);
    partes.push(`TO-BE "${p.nombre}":\n${procesoComoJSON(n ?? [], e ?? [])}`);
  }
  const contexto = [
    `HALLAZGOS APROBADOS:`,
    hallazgos.map((h) => `[${h.id}] (${h.pilar}, impacto ${h.impacto}${(h.filtros as { preserva?: boolean })?.preserva ? ", FORTALEZA A PRESERVAR" : ""}) ${h.titulo}. Causa: ${h.causa_raiz}. Recomendación: ${h.recomendacion ?? "(bloqueada por filtro)"}`).join("\n"),
    `PROCESOS TO-BE:`,
    partes.join("\n\n") || "(ninguno)",
  ].join("\n\n");
  const r = await correrPlanificador(contexto);
  await registrarLlamada(job.company_id, job.id, "planificador", r);

  const validos = new Set(hallazgos.map((h) => h.id));
  const frentes = programarFrentes(r.data.frentes, validos);
  const inicio = new Date();
  await sb.from("actions").delete().eq("company_id", job.company_id).eq("fase", "implementacion").eq("estado", "pendiente");
  for (const f of frentes) {
    const vence = new Date(inicio);
    vence.setDate(vence.getDate() + f.semana_cierre * 7);
    await sb.from("actions").insert({ company_id: job.company_id, finding_id: f.finding_id, prioridad: f.prioridad, fase: "implementacion", semana_inicio: f.semana_inicio, semana_cierre: f.semana_cierre, accion: f.accion, responsable: f.responsable, kpi: f.kpi, evidencia: f.evidencia, impacto: f.impacto, vence_at: vence.toISOString().slice(0, 10) });
  }
  return { frentes: frentes.length };
}

const TIPOS_DOC = [
  { tipo: "informe_realidad", titulo: "Informe de realidad", guia: "La distancia entre lo que la empresa declara y lo que realmente ocurre. Usa las afirmaciones caducadas y contradichas, y las confirmadas que las contrastan." },
  { tipo: "diagnostico_4p", titulo: "Diagnóstico 4P", guia: "Estado de cada uno de los cuatro pilares (personas, procesos, producto, marketing), con lo encontrado, su evidencia y su causa. Incluye las fortalezas que se conservan." },
  { tipo: "mapa_automatizacion", titulo: "Mapa de automatización", guia: "Para cada actividad de los procesos rediseñados: quién la ejecuta (persona / software / agente de IA / IA prepara y persona aprueba) y por qué. Regla: nada indefinido se automatiza." },
] as const;

/** Verificación en código (P1-18): ninguna sección sin fuente; nombres de referentes fuera. */
export function verificarDocumento(doc: SalidaRedactor): { doc: SalidaRedactor; descartadas: number; problemas: string[] } {
  const problemas: string[] = [];
  const prohibidos = /lemonis|mckinsey|hormozi|jobs\b|apple|collins|\blean\b|\beos\b/i;
  const secciones = doc.secciones.filter((s) => {
    if (!s.fuentes?.length) {
      problemas.push(`Sección "${s.titulo}" sin fuente: descartada`);
      return false;
    }
    if (s.parrafos.some((p) => prohibidos.test(p))) problemas.push(`Sección "${s.titulo}" menciona un referente externo`);
    return true;
  }).map((s) => ({ ...s, parrafos: s.parrafos.map((p) => p.replace(prohibidos, "un referente del método")) }));
  return { doc: { ...doc, secciones }, descartadas: doc.secciones.length - secciones.length, problemas };
}

/** Snapshot congelado de un entregable que se arma desde datos (mapas, manual, plan). Se guarda al publicar (P1-18). */
export async function construirSnapshot(companyId: string, tipo: string): Promise<Record<string, unknown>> {
  const sb = supabaseAdmin();
  if (tipo === "mapa_as_is" || tipo === "mapa_to_be") {
    const { data: procs } = await sb.from("processes").select("id,nombre,area").eq("company_id", companyId).eq("version", tipo === "mapa_as_is" ? "as_is" : "to_be");
    const procesos = [];
    for (const p of procs ?? []) {
      const [{ data: n }, { data: e }] = await Promise.all([sb.from("process_nodes").select("*").eq("process_id", p.id), sb.from("process_edges").select("*").eq("process_id", p.id)]);
      procesos.push({ ...p, nodos: n ?? [], edges: e ?? [] });
    }
    return { process_ids: procesos.map((p) => p.id), procesos, congelado_at: new Date().toISOString() };
  }
  if (tipo === "manual_procesos") {
    const { data: procs } = await sb.from("processes").select("id").eq("company_id", companyId);
    const ids = (procs ?? []).map((p) => p.id);
    const { data: sops } = ids.length ? await sb.from("sops").select("*, processes(nombre,area)").in("process_id", ids) : { data: [] };
    return { sop_ids: (sops ?? []).map((s) => s.id), sops: sops ?? [], congelado_at: new Date().toISOString() };
  }
  if (tipo === "plan_90") {
    const { data: acciones } = await sb.from("actions").select("*, findings(titulo)").eq("company_id", companyId).order("semana_inicio").order("prioridad");
    return { acciones: acciones ?? [], congelado_at: new Date().toISOString() };
  }
  return {};
}

/** REDACTOR → deliverables (3 redactados, verificados) + 4 desde datos (se congelan al publicar). */
export async function handleRedactarEntregables(job: Job) {
  const sb = supabaseAdmin();
  const hallazgos = await hallazgosAprobadosConEvidencia(job.company_id);
  const claims = await claimsDeEmpresa(job.company_id);
  const { data: acciones } = await sb.from("actions").select("*").eq("company_id", job.company_id).order("semana_inicio");
  const { data: procs } = await sb.from("processes").select("id,nombre,area,version,padre_id").eq("company_id", job.company_id);
  const { data: empresa } = await sb.from("companies").select("nombre,sector").eq("id", job.company_id).single();

  const mapaProcesos: string[] = [];
  for (const p of procs ?? []) {
    const [{ data: n }, { data: e }] = await Promise.all([sb.from("process_nodes").select("*").eq("process_id", p.id), sb.from("process_edges").select("*").eq("process_id", p.id)]);
    mapaProcesos.push(`${p.version.toUpperCase()} "${p.nombre}":\n${procesoComoJSON(n ?? [], e ?? [])}`);
  }
  const hallazgosTxt = hallazgos
    .map((h) => {
      const ev = (h.finding_evidence as { relacion: string; claims: { texto: string; fecha_afirmacion: string | null; sources: { nombre: string; tipo: string; fecha_origen: string | null } | null; participants: { nombre: string; rol: string | null; puesto: string | null } | null } }[]) ?? [];
      const fuentes = ev.map((e) => `  ${e.relacion === "sustenta" ? "+" : "−"} "${e.claims.texto}" — ${etiquetaFuente(e.claims)} (${e.claims.fecha_afirmacion ?? "sin fecha"})`).join("\n");
      return `- (${h.pilar}, impacto ${h.impacto}${(h.filtros as { preserva?: boolean })?.preserva ? ", fortaleza" : ""}) ${h.titulo}\n  Causa: ${h.causa_raiz}\n  Recomendación: ${h.recomendacion ?? "—"}\n  Evidencia:\n${fuentes}`;
    })
    .join("\n\n");
  const base = [
    `EMPRESA: ${empresa?.nombre} · sector: ${empresa?.sector ?? "—"}`,
    `HALLAZGOS APROBADOS:\n${hallazgosTxt || "(ninguno)"}`,
    `AFIRMACIONES CADUCADAS O CONTRADICHAS:\n${claims.filter((c) => c.estado === "caducado" || c.estado === "contradicho").map((c) => `- [${c.estado}] "${c.texto}" — ${etiquetaFuente(c)} (${c.fecha_afirmacion ?? "sin fecha"})`).join("\n") || "(ninguna)"}`,
    `AFIRMACIONES CONFIRMADAS (muestra):\n${claims.filter((c) => c.estado === "confirmado").slice(0, 60).map((c) => `- "${c.texto}" — ${etiquetaFuente(c)} (${c.fecha_afirmacion ?? "sin fecha"})`).join("\n") || "(ninguna)"}`,
    `PLAN:\n${(acciones ?? []).map((a) => `- Semana ${a.semana_inicio}–${a.semana_cierre}: ${a.accion} · ${a.responsable} · indicador: ${a.kpi}`).join("\n") || "(sin plan)"}`,
    `PROCESOS:\n${mapaProcesos.join("\n\n") || "(ninguno)"}`,
  ].join("\n\n");

  const versionSiguiente = async (tipo: string) => {
    const { data } = await sb.from("deliverables").select("version").eq("company_id", job.company_id).eq("tipo", tipo).order("version", { ascending: false }).limit(1);
    return (data?.[0]?.version ?? 0) + 1;
  };

  const problemas: string[] = [];
  for (const d of TIPOS_DOC) {
    await progreso(job.id, `Redactando: ${d.titulo}`);
    const r = await correrRedactor(`DOCUMENTO A REDACTAR: ${d.titulo}. ${d.guia}\n\n${base}`);
    await registrarLlamada(job.company_id, job.id, "redactor", r);
    const v = verificarDocumento(r.data);
    problemas.push(...v.problemas);
    await sb.from("deliverables").insert({ company_id: job.company_id, tipo: d.tipo, contenido: { ...v.doc, verificacion: { secciones_descartadas: v.descartadas } }, version: await versionSiguiente(d.tipo) });
  }
  for (const tipo of ["mapa_as_is", "mapa_to_be", "manual_procesos", "plan_90"]) {
    await sb.from("deliverables").insert({ company_id: job.company_id, tipo, contenido: await construirSnapshot(job.company_id, tipo), version: await versionSiguiente(tipo) });
  }
  return { documentos: 7, problemas };
}

/** Admisión: recomendación del modelo; el consultor decide. */
export async function handleEvaluarAdmision(job: Job) {
  const sb = supabaseAdmin();
  const { data: c } = await sb.from("companies").select("nombre,sector,admision").eq("id", job.company_id).single();
  const r = await correrAdmision(`EMPRESA: ${c?.nombre} · sector ${c?.sector ?? "—"}\n\nCUESTIONARIO:\n${JSON.stringify(c?.admision ?? {}, null, 1)}`);
  await registrarLlamada(job.company_id, job.id, "admision", r);
  await sb.from("companies").update({ admision: { ...(c?.admision as object), evaluacion: r.data } }).eq("id", job.company_id);
  return r.data;
}
