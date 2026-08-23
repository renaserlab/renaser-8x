import { protegido, ok, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VERSION_PROMPT } from "@/lib/ai";

/** Set de evaluación: precisión y cobertura a partir de corrections (capítulo 38). No usa IA: es una consulta. */
export const POST = protegido({ consultor: true }, async (_p, req) => {
  const b = await leerJSON<{ case_id?: string; company_id?: string; criticos_reales?: number }>(req);
  const sb = supabaseAdmin();
  let q = sb.from("findings").select("id,impacto,estado_revision,company_id,corrections(motivo)");
  if (b.company_id) q = q.eq("company_id", b.company_id);
  const { data: f } = await q;
  const hallazgos = (f ?? []).filter((x) => x.estado_revision !== "pendiente");
  const validos = hallazgos.filter((x) => x.estado_revision === "aprobado" || x.estado_revision === "corregido").length;
  const precision = hallazgos.length ? validos / hallazgos.length : 0;
  const criticosEncontrados = hallazgos.filter((x) => x.impacto === "alto" && x.estado_revision !== "rechazado").length;
  const cobertura = b.criticos_reales ? Math.min(1, criticosEncontrados / b.criticos_reales) : null;
  const motivos: Record<string, number> = {};
  for (const h of hallazgos) for (const c of (h.corrections as { motivo: string | null }[]) ?? []) if (c.motivo) motivos[c.motivo] = (motivos[c.motivo] ?? 0) + 1;
  const detalle = { revisados: hallazgos.length, validos, criticos_encontrados: criticosEncontrados, motivos };
  if (b.case_id) await sb.from("eval_runs").insert({ case_id: b.case_id, version_prompt: VERSION_PROMPT, cobertura, precision, detalle });
  return ok({ precision, cobertura, detalle, version_prompt: VERSION_PROMPT });
});
