import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ sesion: string }> };

export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (_p, _req, ctx) => {
  const { sesion } = await ctx.params;
  const { data: ses } = await supabaseAdmin().from("interview_sessions").select("id,company_id").eq("id", sesion).single();
  if (!ses) return fallo("Sesión no encontrada", 404);
  const job = await encolar({ company_id: ses.company_id, tipo: "minar_know_how", payload: { session_id: sesion }, prioridad: PRIORIDAD.extraer });
  return ok({ job_id: job.id });
});
