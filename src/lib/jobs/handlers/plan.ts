import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrPlanificador, correrRedactor, correrAdmision } from "@/lib/ai/agents/planificador";
import { hallazgosAprobadosConEvidencia, procesoComoJSON, registrarTokens, etiquetaFuente, claimsDeEmpresa } from "@/lib/db/queries";
import { progreso } from "../queue";
import { programarFrentes } from "@/lib/rules/plan";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/** PLANIFICADOR → actions (45 días en 7 semanas, máx. 3 abiertos). */
export async function handlePlanificar(job: Job) {
  const sb = supabaseAdmin();
  const hallazgos = await hallazgosAprobadosConEvidencia(job.company_id);
  if (!hallazgos.length) throw new Error("No hay hallazgos aprobados. Aprueba al menos uno antes de planificar.");
  await progreso(job.id, `Armando el plan con ${hallazgos.length} hallazgos aprobados`);
  const { data: tobes } = await sb.from("processes").select("id,nombre,area").eq("company_id", job.company_id).eq("version", "to_be");
  const partes: string[] = [];
  for (const p of tobes ?? []) {
    const [{ data: n }, { data: e }] = await Promise.all([sb.from("process_nodes").select("*").eq("process_id", p.id), sb.from("process_edges").select("*").eq("process_id", p.id)]);
    partes.push(`TO-BE "${p.nombre}":\n${procesoComoJSON(n ?? [], e ?? [])}`);
  }
  const contexto = [
    `HALLAZGOS APROBADOS:`,
    hallazgos.map((h) => `[${h.id}] (${h.pilar}, impacto ${h.impacto}) ${h.titulo}. Causa: ${h.causa_raiz}. Recomendación: ${h.recomendacion ?? "(bloqueada por filtro)"}`).join("\n"),
    `PROCESOS TO-BE:`,
    partes.join("\n\n") || "(ninguno)",
  ].join("\n\n");
  const r = await correrPlanificador(contexto);
  await registrarTokens(job.company_id, job.id, "planificador", r.tokens_entrada, r.tokens_salida);

  // Regla en código (src/lib/rules/plan.ts): máx. 3 abiertos por semana; ninguno huérfano.
  const validos = new Set(hallazgos.map((h) => h.id));
  const frentes = programarFrentes(r.data.frentes, validos);
  const inicio = new Date();
  await sb.from("actions").delete().eq("company_id", job.company_id).eq("fase", "implementacion").eq("estado", "pendiente");
  for (const f of frentes) {
    const vence = new Date(inicio);
    vence.setDate(vence.getDate() + f.semana_cierre * 7);
    await sb.from("actions").insert({
      company_id: job.company_id, finding_id: f.finding_id, prioridad: f.prioridad, fase: "implementacion",
      semana_inicio: f.semana_inicio, semana_cierre: f.semana_cierre, accion: f.accion, responsable: f.responsable, kpi: f.kpi, evidencia: f.evidencia, impacto: f.impacto,
      vence_at: vence.toISOString().slice(0, 10),
    });
  }
  return { frentes: frentes.length };
}

const TIPOS_DOC = [
  { tipo: "informe_realidad", titulo: "Informe de realidad", guia: "La distancia entre lo que la empresa declara y lo que realmente ocurre. Usa las afirmaciones caducadas y contradichas, y las confirmadas que las contrastan." },
  { tipo: "diagnostico_4p", titulo: "Diagnóstico 4P", guia: "Estado de cada uno de los cuatro pilares (personas, procesos, producto, marketing), con lo encontrado, su evidencia y su causa." },
  { tipo: "mapa_automatizacion", titulo: "Mapa de automatización", guia: "Para cada actividad de los procesos rediseñados: quién la ejecuta (persona / software / agente de IA / IA prepara y persona aprueba) y por qué. Regla: nada indefinido se automatiza." },
] as const;

/** REDACTOR → deliverables (informe_realidad, diagnostico_4p, mapa_automatizacion) + mapas y manual desde datos. */
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
      const fuentes = ev.map((e) => `  ${e.relacion === "sustenta" ? "+" : "−"} "${e.claims.texto}" — ${etiquetaFuente({ ...e.claims, id: "", company_id: "", source_id: "", fragment_id: null, participant_id: null, pilar: null, tipo: null, temporalidad: null, estado: "", contradice_a: null, explicacion_contradiccion: null, pregunta_sugerida: null, prioridad_validacion: false, created_at: "" })} (${e.claims.fecha_afirmacion ?? "sin fecha"})`).join("\n");
      return `- (${h.pilar}, impacto ${h.impacto}) ${h.titulo}\n  Causa: ${h.causa_raiz}\n  Recomendación: ${h.recomendacion ?? "—"}\n  Evidencia:\n${fuentes}`;
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

  for (const d of TIPOS_DOC) {
    await progreso(job.id, `Redactando: ${d.titulo}`);
    const r = await correrRedactor(`DOCUMENTO A REDACTAR: ${d.titulo}. ${d.guia}\n\n${base}`);
    await registrarTokens(job.company_id, job.id, "redactor", r.tokens_entrada, r.tokens_salida);
    await sb.from("deliverables").insert({ company_id: job.company_id, tipo: d.tipo, contenido: r.data, version: await versionSiguiente(d.tipo) });
  }

  // Mapas, manual y plan: consulta, no IA (se arman desde datos al publicar/ver)
  const asis = (procs ?? []).filter((p) => p.version === "as_is").map((p) => p.id);
  const tobe = (procs ?? []).filter((p) => p.version === "to_be").map((p) => p.id);
  await sb.from("deliverables").insert({ company_id: job.company_id, tipo: "mapa_as_is", contenido: { process_ids: asis }, version: await versionSiguiente("mapa_as_is") });
  await sb.from("deliverables").insert({ company_id: job.company_id, tipo: "mapa_to_be", contenido: { process_ids: tobe }, version: await versionSiguiente("mapa_to_be") });
  const { data: sops } = await sb.from("sops").select("id,process_id").in("process_id", [...asis, ...tobe].length ? [...asis, ...tobe] : ["00000000-0000-0000-0000-000000000000"]);
  await sb.from("deliverables").insert({ company_id: job.company_id, tipo: "manual_procesos", contenido: { sop_ids: (sops ?? []).map((s) => s.id) }, version: await versionSiguiente("manual_procesos") });
  await sb.from("deliverables").insert({ company_id: job.company_id, tipo: "plan_90", contenido: { generado: new Date().toISOString() }, version: await versionSiguiente("plan_90") });
  return { documentos: 7 };
}

/** Admisión: recomendación del modelo; el consultor decide. */
export async function handleEvaluarAdmision(job: Job) {
  const sb = supabaseAdmin();
  const { data: c } = await sb.from("companies").select("nombre,sector,admision").eq("id", job.company_id).single();
  const r = await correrAdmision(`EMPRESA: ${c?.nombre} · sector ${c?.sector ?? "—"}\n\nCUESTIONARIO:\n${JSON.stringify(c?.admision ?? {}, null, 1)}`);
  await registrarTokens(job.company_id, job.id, "admision", r.tokens_entrada, r.tokens_salida);
  await sb.from("companies").update({ admision: { ...(c?.admision as object), evaluacion: r.data } }).eq("id", job.company_id);
  return r.data;
}
