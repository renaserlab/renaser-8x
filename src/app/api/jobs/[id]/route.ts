import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { reencolarSeguro } from "@/lib/jobs/queue";
import { esErrorDePausa, MENSAJE_PAUSA_CLIENTE } from "@/lib/jobs/reglas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = protegido<Ctx>({ cupo: "ia" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const { data: j } = await supabaseAdmin().from("jobs").select("id,company_id,tipo,estado,progreso,error,resultado,created_at,terminado_at").eq("id", id).single();
  if (!j) return fallo("Trabajo no encontrado", 404);
  if (j.company_id) await exigirAcceso(perfil, j.company_id);
  // Frontera: el cliente no ve errores técnicos ni resultados crudos.
  if (perfil.rol !== "consultor") {
    // Si el trabajo espera porque el proveedor está sin crédito, se le dice la verdad en sus palabras:
    // el asistente está en pausa y nada de lo suyo se perdió. Ni «algo salió mal» ni un 402.
    // Solo mientras está PENDIENTE: `take_job` no limpia `error` al retomarlo, así que un trabajo que
    // ya volvió a correr seguiría rotulado «en pausa» y taparía el progreso real del manejador.
    const enPausa = esErrorDePausa(j.error);
    return ok({
      id: j.id,
      estado: j.estado,
      progreso: enPausa && j.estado === "pendiente" ? MENSAJE_PAUSA_CLIENTE : j.progreso,
      error: j.estado === "fallido" ? (enPausa ? MENSAJE_PAUSA_CLIENTE : "Algo no salió bien. Tu consultor ya lo sabe.") : null,
    });
  }
  return ok(j);
});

/**
 * Reintentar un trabajo fallido (consultor). Ya no se borra el original ni se repite lo que otro
 * trabajo posterior ya hizo bien: `reencolarSeguro` decide y explica. `job_id` es el trabajo que
 * ahora representa la petición (el nuevo, o el posterior que ya la cumplió), para que la pantalla
 * pueda seguirlo.
 */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (_p, _req, ctx) => {
  const { id } = await ctx.params;
  const r = await reencolarSeguro(id);
  if (!r.reencolado && r.motivo === "El trabajo no existe.") return fallo("Trabajo no encontrado", 404);
  return ok({ job_id: r.job_id, reencolado: r.reencolado, motivo: r.motivo, job_posterior_id: r.job_posterior_id });
});
