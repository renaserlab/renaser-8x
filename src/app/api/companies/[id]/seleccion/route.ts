import { protegido, ok, fallo, exigirAcceso, leerValidado, texto } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POR DÓNDE SE EMPIEZA: hasta 8 procesos para pedir que los cuenten, y 1 a 3 claves de intervención.
 *
 * La selección nace en estado «propuesta» y NO puede llegarle al cliente así. Regla de Kelin
 * (18-10-2026): la consultora aprueba antes de que el cliente la vea, porque es la primera cosa
 * que el empresario ve de nuestro criterio y tiene que llegarle decidida.
 */

/** POST: encola la selección. Necesita el modelo del rubro ya hecho: de ahí se elige. */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();

  const { data: enCola } = await sb
    .from("jobs")
    .select("id")
    .eq("company_id", id)
    .eq("tipo", "seleccionar_procesos")
    .in("estado", ["pendiente", "corriendo"])
    .limit(1);
  if (enCola?.length) return ok({ job_id: enCola[0].id, ya_estaba: true });

  // Se avisa aquí en vez de dejar fallar al trabajo: el consultor sabe qué le falta antes de esperar.
  const { data: modelo } = await sb.from("modelo_alto_rendimiento").select("company_id").eq("company_id", id).maybeSingle();
  if (!modelo) {
    return fallo("Falta el modelo de alto rendimiento del rubro: la selección se hace eligiendo de esa lista, no inventando procesos. Córrelo primero desde «Cómo debe ser».", 409);
  }

  const job = await encolar({
    company_id: id,
    tipo: "seleccionar_procesos",
    payload: {},
    prioridad: PRIORIDAD.diagnosticar,
    idempotency_key: claveIdempotente(["seleccion", id, new Date().toISOString().slice(0, 10)]),
  });
  return ok({ job_id: job.id });
});

/**
 * PATCH: la consultora aprueba o descarta la selección propuesta.
 *
 * Aprobar deja constancia de quién y cuándo — la restricción de la tabla lo exige, porque
 * «aprobada» sin firma no es una aprobación, es un campo cambiado. Y al aprobar una, cualquier
 * otra aprobada anterior pasa a descartada: dos vigentes dejarían al consultor y al cliente
 * mirando listas distintas.
 */
export const PATCH = protegido<Ctx>({ consultor: true }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(
    req,
    z.object({
      accion: z.enum(["aprobar", "descartar"]),
      nota: texto(1200).optional(),
    })
  );
  const sb = supabaseAdmin();

  const { data: propuesta } = await sb
    .from("seleccion_procesos")
    .select("id")
    .eq("company_id", id)
    .eq("estado", "propuesta")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!propuesta) return fallo("No hay ninguna selección propuesta que aprobar o descartar.", 404);

  const ahora = new Date().toISOString();

  if (b.accion === "descartar") {
    const { error } = await sb
      .from("seleccion_procesos")
      .update({ estado: "descartada", nota_consultora: b.nota?.trim() ?? null, updated_at: ahora })
      .eq("id", propuesta.id);
    if (error) return fallo(error.message, 500);
    return ok({ estado: "descartada" });
  }

  // Solo puede haber una aprobada vigente (índice único parcial en la tabla).
  await sb.from("seleccion_procesos").update({ estado: "descartada", updated_at: ahora }).eq("company_id", id).eq("estado", "aprobada");

  const { error } = await sb
    .from("seleccion_procesos")
    .update({
      estado: "aprobada",
      aprobada_por: perfil.id,
      aprobada_at: ahora,
      nota_consultora: b.nota?.trim() ?? null,
      updated_at: ahora,
    })
    .eq("id", propuesta.id);
  if (error) return fallo(error.message, 500);
  return ok({ estado: "aprobada", aprobada_at: ahora });
});
