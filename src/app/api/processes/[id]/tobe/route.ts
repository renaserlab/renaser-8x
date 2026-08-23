import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

export const POST = protegido<Ctx>({ consultor: true }, async (_p, _req, ctx) => {
  const { id } = await ctx.params;
  const { data: p } = await supabaseAdmin().from("processes").select("id,company_id,version").eq("id", id).single();
  if (!p) return fallo("Proceso no encontrado", 404);
  if (p.version !== "as_is") return fallo("El TO-BE se genera desde un proceso AS-IS.");
  const job = await encolar({ company_id: p.company_id, tipo: "generar_tobe", payload: { process_id: id }, prioridad: PRIORIDAD.diagnosticar });
  return ok({ job_id: job.id });
});
