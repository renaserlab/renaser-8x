import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** body: { corte: {...} } registra un corte quincenal · body: { cerrar: true, resultado_90d } cierra el caso y lo guarda en cases. */
export const POST = protegido<Ctx>({ consultor: true }, async (_p, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ corte?: { que_se_hizo?: string; que_se_trabo?: string; indicadores?: unknown; regresiones?: unknown }; cerrar?: boolean; resultado_90d?: unknown; monitoreo?: boolean }>(req);
  const sb = supabaseAdmin();
  if (b.corte) {
    const { data: prev } = await sb.from("checkpoints").select("numero").eq("company_id", id).order("numero", { ascending: false }).limit(1);
    const numero = (prev?.[0]?.numero ?? 0) + 1;
    const { data } = await sb.from("checkpoints").insert({ company_id: id, numero, ...b.corte }).select("*").single();
    return ok(data);
  }
  if (b.monitoreo) {
    await sb.from("companies").update({ etapa: "monitoreo" }).eq("id", id);
    return ok({ etapa: "monitoreo" });
  }
  if (b.cerrar) {
    const [{ data: c }, { data: hallazgos }, { data: plan }, { data: claims }] = await Promise.all([
      sb.from("companies").select("nombre,sector,admision").eq("id", id).single(),
      sb.from("findings").select("pilar,patron,titulo,causa_raiz,impacto,veredicto,recomendacion,estado_revision").eq("company_id", id).in("estado_revision", ["aprobado", "corregido"]),
      sb.from("actions").select("accion,responsable,kpi,semana_inicio,semana_cierre,estado,impacto").eq("company_id", id),
      sb.from("claims").select("estado").eq("company_id", id),
    ]);
    const perfil = { nombre: c?.nombre, sector: c?.sector, admision: c?.admision, afirmaciones: (claims ?? []).length, caducadas: (claims ?? []).filter((x) => x.estado === "caducado").length, contradichas: (claims ?? []).filter((x) => x.estado === "contradicho").length };
    const { data: caso, error } = await sb.from("cases").insert({ company_id: id, perfil, hallazgos_validados: hallazgos, plan_aplicado: plan, resultado_90d: b.resultado_90d ?? null, cerrado_at: new Date().toISOString() }).select("id").single();
    if (error) return fallo(error.message, 500);
    await sb.from("companies").update({ etapa: "cerrado" }).eq("id", id);
    return ok({ case_id: caso.id });
  }
  return fallo("Nada que hacer");
});
