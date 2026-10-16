import { protegido, ok, exigirAcceso } from "@/lib/api";
import { encolar, PRIORIDAD, claveIdempotente, rondaDe } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/** POST → EL ESTRATEGA redacta (o re-redacta) el Plan Estratégico de 15 secciones. Solo consultor. */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  // La clave es «la redacción número N del plan de esta empresa», no la hora: mientras una redacción
  // está en curso, volver a pedirla devuelve ese trabajo; cuando termina, la siguiente petición
  // re-redacta de verdad. Así el estratega (el agente más caro) nunca corre dos veces por un doble clic.
  const ronda = await rondaDe("plan_estrategico", id);
  const job = await encolar({ company_id: id, tipo: "plan_estrategico", payload: {}, prioridad: PRIORIDAD.proceso_voz, idempotency_key: claveIdempotente(["plan-estrategico", id, `ronda:${ronda}`]) });
  return ok({ job_id: job.id });
});
