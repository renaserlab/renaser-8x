import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/** body: { generar: true } → REDACTOR; body: { publicar: [deliverable_ids] } → publica el paquete. */
export const POST = protegido<Ctx>({ consultor: true }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ generar?: boolean; publicar?: string[]; despublicar?: string[] }>(req);
  const sb = supabaseAdmin();
  if (b.generar) {
    const job = await encolar({ company_id: id, tipo: "redactar_entregables", payload: {}, prioridad: PRIORIDAD.lote });
    return ok({ job_id: job.id });
  }
  if (b.publicar?.length) {
    // Frontera: solo se publica si todos los hallazgos pendientes fueron revisados.
    const { count } = await sb.from("findings").select("id", { count: "exact", head: true }).eq("company_id", id).eq("estado_revision", "pendiente");
    if (count) return fallo(`Hay ${count} hallazgos sin revisar. Revísalos antes de publicar: nada llega al cliente sin pasar por ti.`);
    await sb.from("deliverables").update({ publicado: true, publicado_at: new Date().toISOString(), publicado_por: perfil.id }).in("id", b.publicar).eq("company_id", id);
    await sb.from("companies").update({ etapa: "implementacion" }).eq("id", id).in("etapa", ["diagnostico", "espejo"]);
    return ok({ publicados: b.publicar.length });
  }
  if (b.despublicar?.length) {
    await sb.from("deliverables").update({ publicado: false }).in("id", b.despublicar).eq("company_id", id);
    return ok({ despublicados: b.despublicar.length });
  }
  return fallo("Nada que hacer");
});
