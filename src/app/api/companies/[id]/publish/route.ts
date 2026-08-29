import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";
import { construirSnapshot } from "@/lib/jobs/handlers/plan";
import { diagnosticoListo } from "@/lib/rules/suficiencia";

type Ctx = { params: Promise<{ id: string }> };

/** body: { generar: true } → REDACTOR; body: { publicar: [ids] } → congela (P1-18) y publica; { despublicar: [ids] }. */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ generar?: boolean; publicar?: string[]; despublicar?: string[] }>(req);
  const sb = supabaseAdmin();
  if (b.generar) {
    const job = await encolar({ company_id: id, tipo: "redactar_entregables", payload: {}, prioridad: PRIORIDAD.lote });
    return ok({ job_id: job.id });
  }
  if (b.publicar?.length) {
    // Frontera: nada se publica con hallazgos sin revisar o con validación pendiente.
    const { data: fs } = await sb.from("findings").select("estado_revision,requiere_validacion").eq("company_id", id);
    const d = diagnosticoListo(fs ?? []);
    if (!d.listo) return fallo(`No se puede publicar: ${d.pendientes} hallazgo(s) sin revisar y ${d.por_validar} con validación pendiente. Nada llega al cliente sin pasar por ti.`);
    const { data: docs } = await sb.from("deliverables").select("id,tipo").in("id", b.publicar).eq("company_id", id);
    for (const doc of docs ?? []) {
      const contenido = ["mapa_as_is", "mapa_to_be", "manual_procesos", "plan_90"].includes(doc.tipo) ? await construirSnapshot(id, doc.tipo) : undefined;
      await sb.from("deliverables").update({ publicado: true, publicado_at: new Date().toISOString(), publicado_por: perfil.id, ...(contenido ? { contenido } : {}) }).eq("id", doc.id);
    }
    await sb.from("companies").update({ etapa: "implementacion" }).eq("id", id).in("etapa", ["diagnostico", "espejo"]);
    return ok({ publicados: docs?.length ?? 0 });
  }
  if (b.despublicar?.length) {
    await sb.from("deliverables").update({ publicado: false }).in("id", b.despublicar).eq("company_id", id);
    return ok({ despublicados: b.despublicar.length });
  }
  return fallo("Nada que hacer");
});
