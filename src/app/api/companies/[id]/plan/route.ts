import { protegido, ok, exigirAcceso } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";
import { cargarPlan } from "@/lib/plan-intervencion";

type Ctx = { params: Promise<{ id: string }> };

/** Pedir el plan compromete a la consultora con un borrador que luego aprobará: exige la misma autoridad que aprobarlo. */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAutoridad(perfil, "aprobar_plan");
  const job = await encolar({ company_id: id, tipo: "planificar", payload: {}, prioridad: PRIORIDAD.diagnosticar });
  return ok({ job_id: job.id });
});

/**
 * EL PLAN ENTERO con lo que a cada acción le falta para aprobarse, el límite de frentes de la empresa y
 * cuáles están abiertos. El dueño solo recibe lo aprobado y lo que sigue de ahí; lo propuesto, rechazado o
 * pospuesto es conversación de la consultora. Los cortes se conservan para quien ya los leía aquí.
 */
export const GET = protegido<Ctx>({ cupo: "ia" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const [plan, { data: cortes }] = await Promise.all([
    cargarPlan(id),
    supabaseAdmin().from("checkpoints").select("*").eq("company_id", id).order("numero"),
  ]);
  const visibles = perfil.rol === "consultor" ? plan.acciones : plan.acciones.filter((a) => ["aprobado", "en_ejecucion", "reportado", "verificado", "bloqueado"].includes(a.estado_canonico));
  return ok({
    acciones: visibles,
    limite_frentes: plan.limiteFrentes,
    abiertas: plan.abiertas.map((a) => ({ id: a.id, accion: a.accion, estado: a.estado_canonico })),
    linea_base_vigente: plan.lineaBaseVigente,
    cortes: cortes ?? [],
  });
});
