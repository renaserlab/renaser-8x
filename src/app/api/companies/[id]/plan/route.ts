import { protegido, ok, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

export const POST = protegido<Ctx>({ consultor: true }, async (_p, _req, ctx) => {
  const { id } = await ctx.params;
  const job = await encolar({ company_id: id, tipo: "planificar", payload: {}, prioridad: PRIORIDAD.diagnosticar });
  return ok({ job_id: job.id });
});

export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  const [{ data: acciones }, { data: cortes }] = await Promise.all([
    sb.from("actions").select("*, findings(titulo)").eq("company_id", id).order("semana_inicio").order("prioridad"),
    sb.from("checkpoints").select("*").eq("company_id", id).order("numero"),
  ]);
  return ok({ acciones: acciones ?? [], cortes: cortes ?? [] });
});
