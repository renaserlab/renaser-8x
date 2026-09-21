import { protegido, ok, fallo, exigirAcceso, leerValidado, texto } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/** POST: encola el modelo de alto rendimiento del rubro (la tercera vista). */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  const { data: enCola } = await sb.from("jobs").select("id").eq("company_id", id).eq("tipo", "modelo_alto_rendimiento").in("estado", ["pendiente", "corriendo"]).limit(1);
  if (enCola?.length) return ok({ job_id: enCola[0].id, ya_estaba: true });
  const job = await encolar({
    company_id: id,
    tipo: "modelo_alto_rendimiento",
    payload: {},
    prioridad: PRIORIDAD.diagnosticar,
    idempotency_key: claveIdempotente(["modelo-ar", id, new Date().toISOString().slice(0, 10)]),
  });
  return ok({ job_id: job.id });
});

/** PATCH: la consultora declara CÓMO QUIERE QUE SEA esta empresa — la aspiración que dirige el diseño. */
export const PATCH = protegido<Ctx>({ consultor: true }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, z.object({ aspiracion: texto(1200) }));
  const { error } = await supabaseAdmin().from("companies").update({ aspiracion: b.aspiracion.trim() }).eq("id", id);
  if (error) return fallo(error.message, 500);
  return ok({ guardado: true });
});
