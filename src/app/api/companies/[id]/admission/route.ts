import { protegido, ok, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/** body: { respuestas?: {...}, decision?: 'admitida'|'rechazada', motivo_rechazo? } */
export const POST = protegido<Ctx>({ consultor: true }, async (_p, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ respuestas?: Record<string, string>; decision?: "admitida" | "rechazada"; motivo_rechazo?: string }>(req);
  const sb = supabaseAdmin();
  if (b.respuestas) {
    await sb.from("companies").update({ admision: b.respuestas }).eq("id", id);
    const job = await encolar({ company_id: id, tipo: "evaluar_admision", payload: {}, prioridad: PRIORIDAD.contrastar });
    return ok({ job_id: job.id });
  }
  if (b.decision) {
    await sb.from("companies").update({ estado_admision: b.decision, motivo_rechazo: b.motivo_rechazo ?? null, etapa: b.decision === "admitida" ? "levantamiento" : "admision" }).eq("id", id);
    return ok({ estado_admision: b.decision });
  }
  return ok({});
});
