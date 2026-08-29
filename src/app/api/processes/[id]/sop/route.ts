import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (_p, _req, ctx) => {
  const { id } = await ctx.params;
  const { data: p } = await supabaseAdmin().from("processes").select("id,company_id").eq("id", id).single();
  if (!p) return fallo("Proceso no encontrado", 404);
  const job = await encolar({ company_id: p.company_id, tipo: "generar_sop", payload: { process_id: id }, prioridad: PRIORIDAD.lote });
  return ok({ job_id: job.id });
});
