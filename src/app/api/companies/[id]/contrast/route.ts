import { protegido, ok, exigirAcceso } from "@/lib/api";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

export const POST = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const job = await encolar({ company_id: id, tipo: "contrastar", payload: { manual: true }, prioridad: PRIORIDAD.contrastar });
  return ok({ job_id: job.id });
});
