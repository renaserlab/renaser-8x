import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/** POST: encola el ESTUDIO de organigrama (qué quiere la empresa y qué necesita construir). */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  // Colapso de duplicados: si ya hay un estudio en cola, no se apila otro.
  const { data: enCola } = await sb.from("jobs").select("id").eq("company_id", id).eq("tipo", "estudio_organigrama").in("estado", ["pendiente", "corriendo"]).limit(1);
  if (enCola?.length) return ok({ job_id: enCola[0].id, ya_estaba: true });
  const job = await encolar({
    company_id: id,
    tipo: "estudio_organigrama",
    payload: {},
    prioridad: PRIORIDAD.diagnosticar,
    idempotency_key: claveIdempotente(["estudio-org", id, new Date().toISOString().slice(0, 10)]),
  });
  return ok({ job_id: job.id });
});
