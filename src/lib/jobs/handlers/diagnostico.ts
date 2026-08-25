import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrDiagnosticador, correrAuditor } from "@/lib/ai/agents/diagnosticador";
import { claimsDeEmpresa, claimsComoTexto, procesoComoJSON, registrarLlamada } from "@/lib/db/queries";
import { progreso, encolar, PRIORIDAD, claveIdempotente } from "../queue";
import { calibrarImpacto, aplicarFiltros, estadoPilar } from "@/lib/rules/evidencia";
import { MIN_CONFIRMADAS_POR_PILAR } from "@/lib/rules/suficiencia";
import { detectarAnomalias, tablaResultadosComoTexto, type Metrica } from "@/lib/rules/anomalias";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

const PILARES = ["personas", "procesos", "producto", "marketing"] as const;

/** payload: { pilar } → DIAGNOSTICADOR + AUDITOR para un pilar. Se bloquea si hay contradicciones abiertas. */
export async function handleDiagnosticar(job: Job) {
  const sb = supabaseAdmin();
  const pilar = String(job.payload.pilar);
  if (!(PILARES as readonly string[]).includes(pilar)) throw new Error("Pilar inválido");

  const todas = await claimsDeEmpresa(job.company_id);
  const delPilar = todas.filter((c) => c.pilar === pilar || c.pilar === "transversal");
  const abiertas = delPilar.filter((c) => c.estado === "contradicho");
  if (abiertas.length && !job.payload.forzar) {
    // Espera limpia, no fallo: el diagnóstico se re-dispara solo cuando el dueño valida (dispararDiagnosticoSiListo
    // corre en la ruta de validación). Un job "fallido" aquí sería ruido: el sistema está esperando a la persona.
    return { estado: "esperando_validacion", contradicciones_abiertas: abiertas.length, pilar };
  }
  const confirmadas = delPilar.filter((c) => c.estado === "confirmado");
  const utiles = delPilar.filter((c) => c.estado === "confirmado" || c.estado === "contradicho" || c.estado === "caducado");

  // DESCONOCIDO es un resultado válido y honesto.
  if (confirmadas.length < MIN_CONFIRMADAS_POR_PILAR) {
    await sb.from("diagnoses").upsert({ company_id: job.company_id, pilar, estado: "desconocido", resumen: `Solo ${confirmadas.length} definiciones confirmadas sobre ${pilar}. No hay información suficiente para diagnosticar: hay que levantar más.` }, { onConflict: "company_id,pilar" });
    return { estado: "desconocido", confirmadas: confirmadas.length };
  }

  await progreso(job.id, `Diagnosticando ${pilar}: ${utiles.length} definiciones`);

  // Procesos (solo para 'procesos'), know-how y sueño del dueño (para personas y transversal)
  let procesosTxt = "(sin procesos dibujados)";
  if (pilar === "procesos") {
    const { data: procs } = await sb.from("processes").select("id,nombre,area").eq("company_id", job.company_id).eq("version", "as_is");
    const partes: string[] = [];
    for (const p of procs ?? []) {
      const [{ data: n }, { data: e }] = await Promise.all([sb.from("process_nodes").select("*").eq("process_id", p.id), sb.from("process_edges").select("*").eq("process_id", p.id)]);
      partes.push(`PROCESO "${p.nombre}" (${p.area ?? "—"}):\n${procesoComoJSON(n ?? [], e ?? [])}`);
    }
    if (partes.length) procesosTxt = partes.join("\n\n");
  }
  // Know-how con la persona y sus afirmaciones: sin ids citables el modelo no puede sustentar (ni preservar) ese know-how.
  const { data: kh } = await sb.from("know_how").select("participant_id,puesto,situacion,senal,decision,regla_practica,criticidad,documentado, participants(nombre)").eq("company_id", job.company_id);
  const idsDe = (pid: string | null) => (pid ? todas.filter((c) => c.participant_id === pid).map((c) => c.id) : []);
  // Las afirmaciones de quien tiene el know-how entran al contexto del pilar (con su texto): sin ellas el modelo no puede conectar el síntoma con su causa.
  const idsKnowHow = new Set((kh ?? []).flatMap((k) => idsDe(k.participant_id)));
  const conKnowHow = [...utiles, ...todas.filter((c) => idsKnowHow.has(c.id) && !utiles.some((u) => u.id === c.id) && (c.estado === "confirmado" || c.estado === "contradicho" || c.estado === "caducado"))];
  const { data: sueno } = await sb.from("interview_responses").select("bloque,pregunta,respuesta, interview_sessions!inner(tipo,company_id)").eq("interview_sessions.company_id", job.company_id).eq("interview_sessions.tipo", "sueno_dueno").not("respuesta", "is", null);
  const { data: empresa } = await sb.from("companies").select("nombre,sector,modelo_operativo,etapa_negocio").eq("id", job.company_id).single();
  const { data: metricasRaw } = await sb.from("company_metricas").select("clave,periodo,valor,valor_texto,estado,nota").eq("company_id", job.company_id).limit(80);
  const metricas = (metricasRaw ?? []) as Metrica[];
  const senales = detectarAnomalias(metricas);
  const contexto = [
    `EMPRESA: ${empresa?.nombre} · sector: ${empresa?.sector ?? "desconocido"}${empresa?.modelo_operativo?.length ? ` · modelo operativo: ${(empresa.modelo_operativo as string[]).join(", ")}` : ""}${empresa?.etapa_negocio ? ` · etapa del negocio: ${empresa.etapa_negocio}` : ""}`,
    `PILAR: ${pilar}`,
    metricas.length ? `TABLA DE RESULTADOS (contado por la empresa o verificado en sus registros):\n${tablaResultadosComoTexto(metricas)}` : null,
    senales.length ? `SEÑALES DETECTADAS POR EL MOTOR DE ANOMALÍAS:\n${senales.map((s) => `- [${s.regla}] ${s.titulo}: ${s.detalle}`).join("\n")}` : null,
    `AFIRMACIONES (${conKnowHow.length}):`,
    claimsComoTexto(conKnowHow),
    `PROCESOS:`,
    procesosTxt,
    `KNOW-HOW MINADO (${kh?.length ?? 0}):`,
    (kh ?? []).map((k) => { const nombre = (k.participants as unknown as { nombre: string } | null)?.nombre; const ids = idsDe(k.participant_id); return `- ${nombre ? `${nombre} (${k.puesto})` : k.puesto} [${k.criticidad}${k.documentado ? "" : ", no documentado"}]: ${k.situacion ?? ""} · señal: ${k.senal ?? ""} · regla: ${k.regla_practica ?? ""}${ids.length ? ` · afirmaciones de esta persona: ${ids.join(", ")}` : ""}`; }).join("\n") || "(ninguno)",
    `SUEÑO DEL DUEÑO (${sueno?.length ?? 0} respuestas):`,
    (sueno ?? []).map((s) => `- [${s.bloque}] ${s.pregunta} → ${String(s.respuesta).slice(0, 300)}`).join("\n") || "(sin sesión de sueño completada)",
  ].filter(Boolean).join("\n\n");

  const d = await correrDiagnosticador(contexto);
  await registrarLlamada(job.company_id, job.id, "diagnosticador", d);

  const validIds = new Set(todas.map((c) => c.id));
  const hallazgos = d.data.hallazgos
    .map((h) => ({ ...h, claim_ids: h.claim_ids.filter((id) => validIds.has(id)), claims_contrarios: (h.claims_contrarios ?? []).filter((id) => validIds.has(id)) }))
    .filter((h) => h.claim_ids.length > 0); // sin evidencia no entra

  await progreso(job.id, `${hallazgos.length} hallazgos. Auditando`);

  const conIdx = hallazgos.map((h, i) => ({ id: `h${i + 1}`, ...h }));
  let auditorias: Record<string, { sustentado: boolean; evidencia_contraria: string[]; es_sintoma: boolean; culpa_persona_sin_auditar?: boolean; benchmark_como_hecho?: boolean; duplicado_de?: string | null; causa_corregida?: string | null; observacion: string }> = {};
  if (conIdx.length) {
    const ctxA = [`HALLAZGOS:`, JSON.stringify(conIdx.map((h) => ({ id: h.id, titulo: h.titulo, causa_raiz: h.causa_raiz, impacto: h.impacto, preserva: !!h.preserva, veredicto: h.veredicto ?? null, claim_ids: h.claim_ids })), null, 1), `TODAS LAS AFIRMACIONES:`, claimsComoTexto(todas)].join("\n\n");
    const a = await correrAuditor(ctxA);
    await registrarLlamada(job.company_id, job.id, "auditor", a);
    auditorias = Object.fromEntries(a.data.auditorias.map((x) => [x.id, x]));
  }

  await sb.from("findings").delete().eq("company_id", job.company_id).eq("pilar", pilar).eq("origen", "ia").eq("estado_revision", "pendiente");

  let altos = 0, medios = 0;
  for (const h of conIdx) {
    const au = auditorias[h.id];
    if (au?.duplicado_de) continue;
    // Bucle de reparacion: el auditor corrigio la causa; el hallazgo sigue vivo con la causa correcta.
    if (au?.causa_corregida?.trim()) h.causa_raiz = au.causa_corregida.trim();
    const evidencia = h.claim_ids.map((id) => todas.find((c) => c.id === id)).filter(Boolean).map((c) => ({ id: c!.id, source_id: c!.source_id, participant_id: c!.participant_id, estado: c!.estado, source_tipo: c!.sources?.tipo ?? null, source_origen: c!.sources?.origen ?? null, participant_rol: c!.participants?.rol ?? null }));
    const sustentado = au ? au.sustentado && !au.culpa_persona_sin_auditar && !au.benchmark_como_hecho : null;
    const cal = calibrarImpacto(h.impacto, evidencia, sustentado);
    const filtros = aplicarFiltros(h.filtros, h.recomendacion);
    const { data: f } = await sb
      .from("findings")
      .insert({
        company_id: job.company_id,
        pilar,
        patron: h.patron,
        titulo: h.informacion_insuficiente ? `Información insuficiente: ${h.titulo}` : h.preserva ? `Fortaleza: ${h.titulo}` : h.titulo,
        causa_raiz: h.causa_raiz,
        impacto: cal.impacto,
        veredicto: h.preserva ? "keep" : h.veredicto,
        recomendacion: filtros.recomendacion,
        filtros: { ...h.filtros, bloqueada: filtros.bloqueada, tension: filtros.tension, dimension: h.dimension ?? null, preserva: !!h.preserva, fuerza_maxima: cal.fuerza_maxima, fuentes_independientes: cal.fuentes, costo_posible: h.costo_posible ?? null },
        auditoria: au ?? null,
        origen: "ia",
        estado_revision: "pendiente",
        requiere_validacion: cal.requiere_validacion || !!h.informacion_insuficiente,
        motivo_validacion: cal.motivo ?? (h.informacion_insuficiente ? "Información insuficiente" : null),
      })
      .select("id")
      .single();
    if (!f) continue;
    const evid = [
      ...h.claim_ids.map((id) => ({ finding_id: f.id, claim_id: id, relacion: "sustenta" })),
      ...[...new Set([...h.claims_contrarios, ...(au?.evidencia_contraria ?? []).filter((id) => validIds.has(id))])].filter((id) => !h.claim_ids.includes(id)).map((id) => ({ finding_id: f.id, claim_id: id, relacion: "contradice" })),
    ];
    await sb.from("finding_evidence").upsert(evid, { onConflict: "finding_id,claim_id" });
    if (!cal.requiere_validacion && !h.preserva) {
      if (cal.impacto === "alto") altos++;
      if (cal.impacto === "medio") medios++;
    }
  }

  // Preguntas pendientes (lentes sin evidencia) → vuelven al levantamiento como preguntas para el dueño/líder.
  for (const q of d.data.preguntas_pendientes.slice(0, 6)) {
    const tipoSesion = q.para === "lider" ? "lider" : q.para === "personal" ? "personal" : "empresa_dueno";
    const { data: ses } = await sb.from("interview_sessions").select("id").eq("company_id", job.company_id).eq("tipo", tipoSesion).neq("estado", "completa").limit(1).maybeSingle();
    if (ses) {
      const { data: ult } = await sb.from("interview_responses").select("orden").eq("session_id", ses.id).order("orden", { ascending: false }).limit(1);
      await sb.from("interview_responses").insert({ session_id: ses.id, bloque: pilar, pilar, pregunta: q.texto, orden: (ult?.[0]?.orden ?? 0) + 1 });
    }
  }

  let estado = estadoPilar([...Array(altos).fill("alto"), ...Array(medios).fill("medio")], confirmadas.length, MIN_CONFIRMADAS_POR_PILAR);
  // Un pilar con hallazgos esperando validacion no puede leerse "solido": hay algo en revision.
  const { count: enRevision } = await sb.from("findings").select("id", { count: "exact", head: true }).eq("company_id", job.company_id).eq("pilar", pilar).eq("requiere_validacion", true).neq("estado_revision", "rechazado");
  if (estado === "solido" && (enRevision ?? 0) > 0) estado = "mejorable";
  await sb.from("diagnoses").upsert({ company_id: job.company_id, pilar, estado, resumen: d.data.resumen_pilar ?? null }, { onConflict: "company_id,pilar" });

  // ¿Terminaron los 4 pilares? → consolidación cross-pilar (P1-19)
  const { count } = await sb.from("jobs").select("id", { count: "exact", head: true }).eq("company_id", job.company_id).eq("tipo", "diagnosticar").in("estado", ["pendiente", "corriendo"]).neq("id", job.id);
  if (!count) await encolar({ company_id: job.company_id, tipo: "consolidar", payload: {}, prioridad: PRIORIDAD.diagnosticar, idempotency_key: claveIdempotente(["consolidar", job.company_id, job.id]) });

  return { estado, hallazgos: conIdx.length, preguntas_pendientes: d.data.preguntas_pendientes.length, dimensiones_sin_evidencia: d.data.dimensiones_sin_evidencia };
}

/** Consolidación (pasadas B y F): dedupe de hallazgos que comparten la misma evidencia entre pilares; orden por multiplicación. Sin IA. */
export async function handleConsolidar(job: Job) {
  const sb = supabaseAdmin();
  const { data: fs } = await sb.from("findings").select("id,pilar,titulo,impacto,veredicto,patron,created_at, finding_evidence(claim_id,relacion)").eq("company_id", job.company_id).eq("estado_revision", "pendiente").eq("origen", "ia");
  const filas = (fs ?? []).map((f) => ({
    id: f.id,
    fortaleza: f.veredicto === "keep",
    patron: (f.patron as string | null) ?? null,
    ids: new Set(((f.finding_evidence as { claim_id: string; relacion: string }[]) ?? []).filter((e) => e.relacion === "sustenta").map((e) => e.claim_id)),
  })).filter((f) => f.ids.size > 0);
  const duplicadoDe = (f: (typeof filas)[number]) =>
    filas.find((g) => g !== f && g.fortaleza === f.fortaleza && (
      // misma evidencia exacta (gana el de mayor evidencia; a igual evidencia, el otro si aún no fue eliminado)
      ([...f.ids].sort().join("|") === [...g.ids].sort().join("|") && filas.indexOf(g) < filas.indexOf(f)) ||
      // mismo patrón (o ambas fortalezas: el patrón es de problemas) con evidencia subconjunto estricto: mismo hallazgo con menos sustento
      (((f.patron !== null && f.patron === g.patron) || (f.fortaleza && g.fortaleza)) && f.ids.size < g.ids.size && [...f.ids].every((id) => g.ids.has(id)))
    ));
  let eliminados = 0;
  const borrar = filas.filter((f) => duplicadoDe(f));
  for (const f of borrar) {
    await sb.from("findings").delete().eq("id", f.id);
    eliminados++;
  }
  await sb.from("companies").update({ etapa: "diagnostico" }).eq("id", job.company_id).in("etapa", ["levantamiento", "contraste"]);
  return { duplicados_eliminados: eliminados, hallazgos: (fs?.length ?? 0) - eliminados };
}
