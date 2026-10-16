import { protegido, ok, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/**
 * «PROPONER INTERPRETACIONES». Encola el trabajo `ficha_direccion`: primero arma y guarda el borrador con lo que
 * ya hay (determinista) y después le pide al asistente lo que se puede leer de las declaraciones del dueño. Lo
 * que el asistente devuelve entra como interpretación sin revisar; nunca como algo que dijo el dueño.
 *
 * Es la única acción de la ficha que cuesta modelo, por eso vive aparte y consume el cupo «ia». Dos clics son un
 * solo trabajo: si ya hay uno en cola o corriendo, se devuelve ese.
 */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia", entidad: "ficha_direccion" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const { data: enCola } = await supabaseAdmin().from("jobs").select("id").eq("company_id", id).eq("tipo", "ficha_direccion").in("estado", ["pendiente", "corriendo"]).limit(1);
  if (enCola?.length) return ok({ job_id: enCola[0].id, ya_estaba: true });
  const job = await encolar({ company_id: id, tipo: "ficha_direccion", payload: { actor_id: perfil.id }, prioridad: PRIORIDAD.diagnosticar });
  return ok({ job_id: job.id, ya_estaba: job.duplicado });
});
