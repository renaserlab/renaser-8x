import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { valoresActuales, derivadosActuales } from "@/lib/medicion";
import type { Metrica } from "@/lib/metricas";

type Ctx = { params: Promise<{ id: string }> };

type Regresion = { proceso?: string; que_volvio?: string; evidencia?: string };

/** body: { corte: {…, regresiones: [{proceso, que_volvio, evidencia}] } } · { monitoreo: true } · { cerrar: true, resultado_90d } */
export const POST = protegido<Ctx>({ consultor: true }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ corte?: { que_se_hizo?: string; que_se_trabo?: string; indicadores?: unknown; regresiones?: Regresion[] }; cerrar?: boolean; resultado_90d?: unknown; monitoreo?: boolean }>(req);
  const sb = supabaseAdmin();
  if (b.corte) {
    const { data: prev } = await sb.from("checkpoints").select("numero").eq("company_id", id).order("numero", { ascending: false }).limit(1);
    const numero = (prev?.[0]?.numero ?? 0) + 1;

    // LOS NÚMEROS DEL CORTE (30-08-2026): el corte guardaba sus indicadores como texto libre, así que
    // aunque se hiciera, nada podía calcular si el indicador se movió. Ahora se congela también una
    // medición con los nueve vitales de hoy, y las dos historias —lo que se hizo y lo que se movió—
    // quedan enlazadas. Si la empresa todavía no tiene números, el corte cualitativo se guarda igual.
    const { data: metricasRaw } = await sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", id).limit(300);
    const metricas = (metricasRaw ?? []) as Metrica[];
    const valores = valoresActuales(metricas);
    let medicionId: string | null = null;
    if (Object.keys(valores).length > 0) {
      const { data: med } = await sb.rpc("congelar_medicion", {
        p_company: id, p_tipo: "corte", p_valores: valores,
        p_derivados: derivadosActuales(metricas), p_nota: b.corte.que_se_hizo ?? null, p_por: perfil.id,
      });
      medicionId = ((Array.isArray(med) ? med[0] : med) as { id?: string } | null)?.id ?? null;
    }

    const { data } = await sb.from("checkpoints").insert({ company_id: id, numero, que_se_hizo: b.corte.que_se_hizo ?? null, que_se_trabo: b.corte.que_se_trabo ?? null, indicadores: b.corte.indicadores ?? null, regresiones: b.corte.regresiones ?? null, medicion_id: medicionId }).select("*").single();
    // P1-17: cada regresión detectada es un hallazgo nuevo con su evidencia (una observación directa del consultor = fuente fuerte).
    let creados = 0;
    for (const r of b.corte.regresiones ?? []) {
      if (!r.que_volvio?.trim()) continue;
      const { data: s } = await sb.from("sources").insert({ company_id: id, tipo: "observacion", nombre: `Corte ${numero}: regresión observada`, fecha_origen: new Date().toISOString().slice(0, 10), contenido: `${r.proceso ? `Proceso ${r.proceso}: ` : ""}${r.que_volvio}. ${r.evidencia ?? ""}`, origen: "consultor", estado: "leido" }).select("id").single();
      if (!s) continue;
      const { data: c } = await sb.from("claims").insert({ company_id: id, source_id: s.id, texto: `${r.proceso ? `En ${r.proceso}, ` : ""}${r.que_volvio}`, pilar: "procesos", tipo: "proceso", temporalidad: "actual", fecha_afirmacion: new Date().toISOString().slice(0, 10), estado: "confirmado", validado_por: perfil.id, validado_at: new Date().toISOString() }).select("id").single();
      if (!c) continue;
      const { data: f } = await sb.from("findings").insert({ company_id: id, pilar: "procesos", patron: null, titulo: `Regresión en monitoreo (corte ${numero}): ${r.que_volvio}`, causa_raiz: "El cambio no se sostuvo sin el consultor encima", impacto: "medio", veredicto: "improve", recomendacion: "Revisar el frente correspondiente y volver a instalar el proceso con su indicador", filtros: { proposito: { resultado: "pasa", nota: "" }, sabiduria: { resultado: "pasa", nota: "" }, excelencia: { resultado: "pasa", nota: "" } }, origen: "consultor", estado_revision: "aprobado" }).select("id").single();
      if (f) {
        await sb.from("finding_evidence").insert({ finding_id: f.id, claim_id: c.id, relacion: "sustenta" });
        await sb.from("corrections").insert({ finding_id: f.id, user_id: perfil.id, accion: "aprobado", comentario: "Regresión registrada en corte de monitoreo" });
        creados++;
      }
    }
    return ok({ ...data, hallazgos_por_regresion: creados });
  }
  if (b.monitoreo) {
    await sb.from("companies").update({ etapa: "monitoreo" }).eq("id", id);
    return ok({ etapa: "monitoreo" });
  }
  if (b.cerrar) {
    const [{ data: c }, { data: hallazgos }, { data: plan }, { data: claims }, { data: corr }] = await Promise.all([
      sb.from("companies").select("nombre,sector,admision").eq("id", id).single(),
      sb.from("findings").select("pilar,patron,titulo,causa_raiz,impacto,veredicto,recomendacion,estado_revision").eq("company_id", id).in("estado_revision", ["aprobado", "corregido"]),
      sb.from("actions").select("accion,responsable,kpi,semana_inicio,semana_cierre,estado,impacto").eq("company_id", id),
      sb.from("claims").select("estado").eq("company_id", id),
      sb.from("corrections").select("accion,motivo").eq("finding_id", id),
    ]);
    const perfil_ = { nombre: c?.nombre, sector: c?.sector, admision: c?.admision, afirmaciones: (claims ?? []).length, caducadas: (claims ?? []).filter((x) => x.estado === "caducado").length, contradichas: (claims ?? []).filter((x) => x.estado === "contradicho").length, correcciones: corr?.length ?? 0 };
    const { data: caso, error } = await sb.from("cases").insert({ company_id: id, perfil: perfil_, hallazgos_validados: hallazgos, plan_aplicado: plan, resultado_90d: b.resultado_90d ?? null, cerrado_at: new Date().toISOString() }).select("id").single();
    if (error) return fallo(error.message, 500);
    await sb.from("companies").update({ etapa: "cerrado" }).eq("id", id);
    return ok({ case_id: caso.id });
  }
  return fallo("Nada que hacer");
});
