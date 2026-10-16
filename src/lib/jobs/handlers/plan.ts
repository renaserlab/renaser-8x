import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrPlanificador, correrRedactor, correrAdmision } from "@/lib/ai/agents/planificador";
import { correrEstratega } from "@/lib/ai/agents/estratega";
import { comoDato } from "@/lib/rules/patrones";
import { hallazgosAprobadosConEvidencia, soloConclusionesDeHoy, procesoComoJSON, registrarLlamada, etiquetaFuente, claimsDeEmpresa } from "@/lib/db/queries";
import { detectarAnomalias, tablaResultadosComoTexto, type Metrica } from "@/lib/rules/anomalias";
import { progreso } from "../queue";
import { programarFrentes } from "@/lib/rules/plan";
import type { SalidaRedactor } from "@/lib/schemas";
import {
  reconciliarPropuesta, resolverResponsable, fechasDeFrente, transicion, escribirTransicion, leerAccion, lineaBaseVigente,
  MOTIVO_NO_APARECE, MOTIVO_REAPARECE, type Existente, type Participante, type Actor, type AccionPlan,
} from "@/lib/plan-intervencion";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/** payload: {} → EL ESTRATEGA redacta el Plan Estratégico (15 secciones, estándar firma top) → deliverables. */
export async function handlePlanEstrategico(job: Job) {
  const sb = supabaseAdmin();
  await progreso(job.id, "Reuniendo toda la evidencia de la empresa");
  const [{ data: empresa }, { data: hallazgosLeidos }, { data: metricasRaw }, { data: sueno }, { data: activos }, { data: participantes }] = await Promise.all([
    sb.from("companies").select("nombre,sector,ficha,modelo_operativo,etapa_negocio").eq("id", job.company_id).single(),
    sb.from("findings").select("titulo,causa_raiz,impacto,pilar,patron,recomendacion,filtros,origen").eq("company_id", job.company_id).neq("estado_revision", "rechazado").or("provisional.is.null,provisional.eq.false").limit(40),
    sb.from("company_metricas").select("clave,periodo,valor,valor_texto,estado,nota").eq("company_id", job.company_id).limit(80),
    sb.from("interview_responses").select("bloque,pregunta,respuesta, interview_sessions!inner(tipo,company_id)").eq("interview_sessions.company_id", job.company_id).not("respuesta", "is", null).limit(80),
    sb.from("company_assets").select("clave,estado,borrador,propuesta").eq("company_id", job.company_id).not("borrador", "is", null),
    sb.from("participants").select("nombre,puesto,rol").eq("company_id", job.company_id),
  ]);
  // Lo de la IA en un área que hoy no llega al mínimo de confirmadas tampoco entra, aunque su columna aún no lo diga.
  const findings = await soloConclusionesDeHoy(job.company_id, hallazgosLeidos ?? []);
  if (!findings.length) throw new Error("Todavía no hay hallazgos: corre el diagnóstico antes de pedir el plan estratégico.");
  const metricas = (metricasRaw ?? []) as Metrica[];
  const senales = detectarAnomalias(metricas);
  const ficha = (empresa?.ficha ?? {}) as Record<string, string>;

  await progreso(job.id, "El estratega está redactando el plan");
  const contexto = [
    `EMPRESA: ${empresa?.nombre} · ${empresa?.sector ?? ""} · ${ficha.personas ?? "?"} personas · etapa ${empresa?.etapa_negocio ?? "?"} · modelo ${((empresa?.modelo_operativo as string[]) ?? []).join(",") || "?"}`,
    `PERSONAS REALES (para responsables): ${(participantes ?? []).map((p) => `${p.nombre} (${p.puesto ?? p.rol})`).join(" · ") || "solo el dueño"}`,
    comoDato(`HALLAZGOS (${findings.length})`, findings.map((f) => `- [${f.impacto} · ${f.pilar}${(f.filtros as { preserva?: boolean })?.preserva ? " · FORTALEZA" : ""}] ${f.titulo}. Causa: ${f.causa_raiz ?? ""}${f.recomendacion ? `. Rec: ${f.recomendacion}` : ""}`).join("\n")),
    comoDato("NÚMEROS CON ESTADO", tablaResultadosComoTexto(metricas)),
    senales.length ? comoDato("SEÑALES DEL MOTOR", senales.map((s) => `- ${s.titulo}: ${s.detalle}`).join("\n")) : "",
    comoDato("LO QUE EL DUEÑO CONTÓ (sueño, historia, números)", (sueno ?? []).slice(0, 60).map((s) => `- ${s.pregunta} → ${String(s.respuesta).slice(0, 200)}`).join("\n")),
    (activos ?? []).length ? comoDato("DOCUMENTOS YA CONSTRUIDOS", (activos ?? []).map((a) => `## ${a.clave}\n${String(a.propuesta ?? a.borrador).slice(0, 1200)}`).join("\n\n")) : "",
  ].filter(Boolean).join("\n\n");

  const r = await correrEstratega(contexto);
  await registrarLlamada(job.company_id, job.id, "estratega", r);
  const { data: prev } = await sb.from("deliverables").select("version").eq("company_id", job.company_id).eq("tipo", "plan_estrategico").order("version", { ascending: false }).limit(1);
  const { error: errIns } = await sb.from("deliverables").insert({ company_id: job.company_id, tipo: "plan_estrategico", contenido: r.data, version: (prev?.[0]?.version ?? 0) + 1 });
  if (errIns) throw new Error(`No se pudo guardar el plan: ${errIns.message}`);
  return { version: (prev?.[0]?.version ?? 0) + 1, prioridades: r.data.prioridades.length };
}

/**
 * PLANIFICADOR → actions (45 días en 7 semanas, máx. 3 abiertos). Las acciones nacen PROPUESTAS y las
 * aprueba la consultora; nada se borra: lo que ya no se propone se pospone con motivo (plan-intervencion.ts).
 */
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
    comoDato("HALLAZGOS APROBADOS", hallazgos.map((h) => `[${h.id}] (${h.pilar}, impacto ${h.impacto}${(h.filtros as { preserva?: boolean })?.preserva ? ", FORTALEZA A PRESERVAR" : ""}) ${h.titulo}. Causa: ${h.causa_raiz}. Recomendación: ${h.recomendacion ?? "(bloqueada por filtro)"}`).join("\n")),
    comoDato("PROCESOS TO-BE", partes.join("\n\n") || "(ninguno)"),
  ].join("\n\n");
  const r = await correrPlanificador(contexto);
  await registrarLlamada(job.company_id, job.id, "planificador", r);

  const validos = new Set(hallazgos.map((h) => h.id));
  const frentes = programarFrentes(r.data.frentes, validos);
  const inicio = new Date();

  // EL PLANIFICADOR NO BORRA (sección 12). Lo que la consultora ya decidió (aprobado, en ejecución, reportado,
  // verificado, rechazado, bloqueado) no se toca. Lo propuesto que ya no viene se pospone con motivo y
  // queda en el historial; lo idéntico no se duplica; lo pospuesto que reaparece se vuelve a proponer.
  const [{ data: existentes }, { data: participantes }, base] = await Promise.all([
    sb.from("actions").select("id,finding_id,accion,estado,verificado_at").eq("company_id", job.company_id).eq("fase", "implementacion"),
    sb.from("participants").select("id,nombre,puesto,rol").eq("company_id", job.company_id),
    lineaBaseVigente(job.company_id),
  ]);
  const plan = reconciliarPropuesta((existentes ?? []) as Existente[], frentes);
  const sistema: Actor = { id: null, rol: "sistema" };

  for (const e of plan.posponer) {
    const accion = await leerAccion(e.id);
    if (!accion) continue;
    const t = transicion(accion, "posponer", sistema, { motivo: MOTIVO_NO_APARECE, implica: "deja de estar en la propuesta; la consultora puede volver a proponerla", ahora: inicio });
    if (t.ok) await escribirTransicion(accion, t);
  }
  for (const e of plan.reproponer) {
    const accion = await leerAccion(e.id);
    if (!accion) continue;
    const t = transicion(accion, "proponer", sistema, { motivo: MOTIVO_REAPARECE, ahora: inicio });
    if (t.ok) await escribirTransicion(accion, t);
  }

  // Lo que el planificador puede llenar hoy: acción, responsable (texto y, si coincide, la persona), indicador
  // en texto, prueba esperada (que es el criterio de aceptación), impacto, semanas y fechas, y la versión
  // exacta de la línea base vigente. Si el contrato del planificador algún día trae objetivo, resultado
  // esperado, riesgos, supuestos, recursos u obligaciones, entran aquí tal cual, rotulados como propuesta.
  let sinResponsable = 0;
  for (const f of plan.crear) {
    const extra = f as Partial<Pick<AccionPlan, "objetivo_empresarial" | "resultado_esperado" | "riesgos" | "supuestos" | "recursos" | "obligaciones_cliente" | "obligaciones_renaser" | "restriccion_oportunidad" | "entregable">>;
    const persona = resolverResponsable(f.responsable, (participantes ?? []) as Participante[]);
    if (!persona) sinResponsable++;
    const fechas = fechasDeFrente(inicio, f.semana_inicio, f.semana_cierre);
    const { data: creada, error } = await sb
      .from("actions")
      .insert({
        company_id: job.company_id, finding_id: f.finding_id, prioridad: f.prioridad, fase: "implementacion",
        semana_inicio: f.semana_inicio, semana_cierre: f.semana_cierre, accion: f.accion, responsable: f.responsable, kpi: f.kpi,
        evidencia: f.evidencia, impacto: f.impacto, vence_at: fechas.vence_at, fecha_inicio: fechas.fecha_inicio,
        estado: "propuesto", es_prioridad: true, responsable_participant_id: persona?.id ?? null, linea_base_id: base?.id ?? null,
        criterio_aceptacion: f.evidencia || null,
        objetivo_empresarial: extra.objetivo_empresarial ?? null, resultado_esperado: extra.resultado_esperado ?? null,
        restriccion_oportunidad: extra.restriccion_oportunidad ?? null, entregable: extra.entregable ?? null,
        riesgos: extra.riesgos ?? null, supuestos: extra.supuestos ?? null, recursos: extra.recursos ?? null,
        obligaciones_cliente: extra.obligaciones_cliente ?? null, obligaciones_renaser: extra.obligaciones_renaser ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`No se pudo guardar un frente del plan: ${error.message}`);
    await sb.from("accion_historial").insert({
      action_id: creada.id, accion: "proponer", antes: null,
      despues: { estado: "propuesto", responsable_participant_id: persona?.id ?? null, linea_base_id: base?.id ?? null },
      motivo: `propuesta del planificador (trabajo ${job.id})`, actor_id: null, actor_rol: "sistema",
    });
  }
  return { frentes: plan.crear.length, pospuestas: plan.posponer.length, repropuestas: plan.reproponer.length, iguales: plan.iguales, sin_responsable: sinResponsable };
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
  // Solo lo dibujado y lo rediseñado: un proceso de la lista de la empresa que nadie ha dibujado (version
  // 'sin_dibujar') no tiene mapa que redactar.
  for (const p of (procs ?? []).filter((x) => x.version === "as_is" || x.version === "to_be")) {
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
    const r = await correrRedactor(`DOCUMENTO A REDACTAR: ${d.titulo}. ${d.guia}\n\n${comoDato("EVIDENCIA DE LA EMPRESA", base)}`);
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
