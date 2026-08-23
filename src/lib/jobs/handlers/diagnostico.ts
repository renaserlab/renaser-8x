import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrDiagnosticador, correrAuditor } from "@/lib/ai/agents/diagnosticador";
import { claimsDeEmpresa, claimsComoTexto, procesoComoJSON, registrarTokens } from "@/lib/db/queries";
import { progreso } from "../queue";
import { calibrarImpacto, aplicarFiltros, estadoPilar } from "@/lib/rules/evidencia";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

const PILARES = ["personas", "procesos", "producto", "marketing"] as const;
const MIN_CONFIRMADAS = 5;

/** payload: { pilar } → DIAGNOSTICADOR + AUDITOR para un pilar. Se bloquea si hay contradicciones abiertas. */
export async function handleDiagnosticar(job: Job) {
  const sb = supabaseAdmin();
  const pilar = String(job.payload.pilar);
  if (!(PILARES as readonly string[]).includes(pilar)) throw new Error("Pilar inválido");

  const todas = await claimsDeEmpresa(job.company_id);
  const delPilar = todas.filter((c) => c.pilar === pilar || c.pilar === "transversal");
  const abiertas = delPilar.filter((c) => c.estado === "contradicho");
  if (abiertas.length && !job.payload.forzar) {
    throw new Error(`El pilar ${pilar} tiene ${abiertas.length} contradicciones sin resolver. Resuélvelas con el dueño antes de diagnosticar.`);
  }
  const confirmadas = delPilar.filter((c) => c.estado === "confirmado");
  const utiles = delPilar.filter((c) => c.estado === "confirmado" || c.estado === "contradicho" || c.estado === "caducado");

  // DESCONOCIDO es un resultado válido y honesto.
  if (confirmadas.length < MIN_CONFIRMADAS) {
    await sb.from("diagnoses").upsert({ company_id: job.company_id, pilar, estado: "desconocido", resumen: `Solo ${confirmadas.length} definiciones confirmadas sobre ${pilar}. No hay información suficiente para diagnosticar: hay que levantar más.` }, { onConflict: "company_id,pilar" });
    return { estado: "desconocido", confirmadas: confirmadas.length };
  }

  await progreso(job.id, `Diagnosticando ${pilar}: ${utiles.length} definiciones`);

  // Procesos del pilar (para procesos: todos los AS-IS)
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
  const { data: empresa } = await sb.from("companies").select("nombre,sector").eq("id", job.company_id).single();
  const contexto = [
    `EMPRESA: ${empresa?.nombre} · sector: ${empresa?.sector ?? "desconocido"}`,
    `PILAR: ${pilar}`,
    `AFIRMACIONES (${utiles.length}):`,
    claimsComoTexto(utiles),
    `PROCESOS:`,
    procesosTxt,
  ].join("\n\n");

  const d = await correrDiagnosticador(contexto);
  await registrarTokens(job.company_id, job.id, "diagnosticador", d.tokens_entrada, d.tokens_salida);

  const validIds = new Set(todas.map((c) => c.id));
  const hallazgos = d.data.hallazgos
    .map((h) => ({ ...h, claim_ids: h.claim_ids.filter((id) => validIds.has(id)), claims_contrarios: (h.claims_contrarios ?? []).filter((id) => validIds.has(id)) }))
    .filter((h) => h.claim_ids.length > 0); // sin evidencia no entra

  await progreso(job.id, `${hallazgos.length} hallazgos. Auditando`);

  // AUDITOR: intenta derribarlos
  const conIdx = hallazgos.map((h, i) => ({ id: `h${i + 1}`, ...h }));
  let auditorias: Record<string, { sustentado: boolean; evidencia_contraria: string[]; es_sintoma: boolean; duplicado_de?: string | null; observacion: string }> = {};
  if (conIdx.length) {
    const ctxA = [`HALLAZGOS:`, JSON.stringify(conIdx.map((h) => ({ id: h.id, titulo: h.titulo, causa_raiz: h.causa_raiz, impacto: h.impacto, claim_ids: h.claim_ids })), null, 1), `TODAS LAS AFIRMACIONES:`, claimsComoTexto(todas)].join("\n\n");
    const a = await correrAuditor(ctxA);
    await registrarTokens(job.company_id, job.id, "auditor", a.tokens_entrada, a.tokens_salida);
    auditorias = Object.fromEntries(a.data.auditorias.map((x) => [x.id, x]));
  }

  // Borra hallazgos IA pendientes previos de este pilar (los revisados se conservan)
  await sb.from("findings").delete().eq("company_id", job.company_id).eq("pilar", pilar).eq("origen", "ia").eq("estado_revision", "pendiente");

  let altos = 0, medios = 0;
  for (const h of conIdx) {
    const au = auditorias[h.id];
    if (au?.duplicado_de) continue;
    // Regla dura (src/lib/rules/evidencia.ts): impacto alto requiere dos fuentes independientes o una objetiva; el auditor puede bajarlo.
    const evidencia = h.claim_ids.map((id) => todas.find((c) => c.id === id)).filter(Boolean).map((c) => ({ id: c!.id, source_id: c!.source_id, participant_id: c!.participant_id, estado: c!.estado, source_tipo: c!.sources?.tipo ?? null }));
    const cal = calibrarImpacto(h.impacto, evidencia, au ? au.sustentado : null);
    const impacto = cal.impacto;
    const filtros = aplicarFiltros(h.filtros, h.recomendacion);
    const filtroBloquea = filtros.bloqueada;
    const { data: f } = await sb
      .from("findings")
      .insert({
        company_id: job.company_id,
        pilar,
        patron: h.patron,
        titulo: h.informacion_insuficiente ? `Información insuficiente: ${h.titulo}` : h.titulo,
        causa_raiz: h.causa_raiz,
        impacto,
        veredicto: h.veredicto,
        recomendacion: filtroBloquea ? null : h.recomendacion,
        filtros: { ...h.filtros, bloqueada: filtroBloquea, tension: filtros.tension, requiere_validacion: cal.requiere_validacion, motivo_calibracion: cal.motivo },
        auditoria: au ?? null,
        origen: "ia",
        estado_revision: "pendiente",
      })
      .select("id")
      .single();
    if (!f) continue;
    const evid = [
      ...h.claim_ids.map((id) => ({ finding_id: f.id, claim_id: id, relacion: "sustenta" })),
      ...[...new Set([...h.claims_contrarios, ...(au?.evidencia_contraria ?? []).filter((id) => validIds.has(id))])].filter((id) => !h.claim_ids.includes(id)).map((id) => ({ finding_id: f.id, claim_id: id, relacion: "contradice" })),
    ];
    await sb.from("finding_evidence").upsert(evid, { onConflict: "finding_id,claim_id" });
    if (impacto === "alto") altos++;
    if (impacto === "medio") medios++;
  }

  const estado = estadoPilar([...Array(altos).fill("alto"), ...Array(medios).fill("medio")], confirmadas.length, MIN_CONFIRMADAS);
  await sb.from("diagnoses").upsert({ company_id: job.company_id, pilar, estado, resumen: d.data.resumen_pilar ?? null }, { onConflict: "company_id,pilar" });
  return { estado, hallazgos: conIdx.length, preguntas_pendientes: d.data.preguntas_pendientes };
}
