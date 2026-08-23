import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const { data: j } = await supabaseAdmin().from("jobs").select("id,company_id,tipo,estado,progreso,error,resultado,created_at,terminado_at").eq("id", id).single();
  if (!j) return fallo("Trabajo no encontrado", 404);
  if (j.company_id) await exigirAcceso(perfil, j.company_id);
  // Frontera: el cliente no ve errores técnicos ni resultados crudos.
  if (perfil.rol !== "consultor") return ok({ id: j.id, estado: j.estado, progreso: j.progreso, error: j.estado === "fallido" ? "Algo no salió bien. Tu consultor ya lo sabe." : null });
  return ok(j);
});

/** Reintentar un trabajo fallido (consultor). */
export const POST = protegido<Ctx>({ consultor: true }, async (_p, _req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: j } = await sb.from("jobs").select("*").eq("id", id).single();
  if (!j) return fallo("Trabajo no encontrado", 404);
  await sb.from("jobs").delete().eq("id", id);
  const nuevo = await encolar({ company_id: j.company_id, tipo: j.tipo, payload: j.payload, prioridad: j.prioridad, idempotency_key: j.idempotency_key });
  return ok({ job_id: nuevo.id });
});
