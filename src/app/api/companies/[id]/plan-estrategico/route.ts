import { protegido, ok, exigirAcceso } from "@/lib/api";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/** POST → EL ESTRATEGA redacta (o re-redacta) el Plan Estratégico de 15 secciones. Solo consultor. */
export const POST = protegido<Ctx>({ consultor: true }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const job = await encolar({ company_id: id, tipo: "plan_estrategico", payload: {}, prioridad: PRIORIDAD.proceso_voz, idempotency_key: claveIdempotente(["plan-estrategico", id, Date.now()]) });
  return ok({ job_id: job.id });
});
