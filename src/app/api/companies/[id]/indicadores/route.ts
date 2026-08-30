import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";
import { registrar, ipDe } from "@/lib/auditoria";

type Ctx = { params: Promise<{ id: string }> };

/** Pedir que se propongan indicadores a partir de lo que sale mal seguido. */
export const POST = protegido<Ctx>({ cupo: "ia" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();

  // Si ya hay uno en cola, no se encola otro: dos propuestas en paralelo se pisan y se paga doble.
  const { data: enCola } = await sb
    .from("jobs")
    .select("id")
    .eq("company_id", id)
    .eq("tipo", "proponer_indicadores")
    .in("estado", ["pendiente", "corriendo"])
    .maybeSingle();
  if (enCola) return ok({ job_id: enCola.id, ya_estaba: true });

  const job = await encolar({ company_id: id, tipo: "proponer_indicadores", payload: {}, prioridad: PRIORIDAD.diagnosticar });
  void registrar({ companyId: id, actor: perfil, accion: "crear", entidad: "indicadores", ruta: "/api/companies/indicadores", ip: ipDe(req) });
  return ok({ job_id: job.id });
});

const Cambio = z.object({
  indicador_id: uuid,
  /** Adoptar, archivar, o anotar el valor de este periodo. */
  estado: z.enum(["activo", "archivado"]).optional(),
  valor: z.number().finite().min(-1_000_000_000).max(1_000_000_000).nullable().optional(),
  periodo: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/).optional(),
});

/**
 * Adoptar un indicador, archivarlo, o anotar cuánto dio este mes. Al anotar un valor, el número
 * entra en company_metricas con la clave del indicador: así se congela en los cortes junto a los
 * nueve vitales y responde la misma pregunta — ¿mejoró o no?
 */
export const PATCH = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Cambio);
  const sb = supabaseAdmin();

  const { data: ind } = await sb.from("indicadores").select("id,company_id,clave,estado").eq("id", b.indicador_id).maybeSingle();
  if (!ind || ind.company_id !== id) return fallo("Ese indicador no es de esta empresa.", 404);

  if (b.estado) {
    await sb.from("indicadores").update({ estado: b.estado }).eq("id", ind.id);
    void registrar({ companyId: id, actor: perfil, accion: b.estado === "activo" ? "aprobar" : "editar", entidad: "indicador", entidadId: ind.id, detalle: { clave: ind.clave, estado: b.estado }, ruta: "/api/companies/indicadores", ip: ipDe(req) });
  }

  if (b.valor !== undefined && b.periodo) {
    // Un indicador archivado no debería seguir recibiendo números: es ruido en la historia.
    if (ind.estado === "archivado" && b.estado !== "activo") return fallo("Ese indicador está archivado. Actívalo antes de anotarle un valor.", 400);
    const { data: prev } = await sb
      .from("company_metricas")
      .select("id")
      .eq("company_id", id)
      .eq("clave", ind.clave)
      .eq("periodo", b.periodo)
      .maybeSingle();
    const fila = { company_id: id, clave: ind.clave, periodo: b.periodo, valor: b.valor, estado: "contado", updated_at: new Date().toISOString() };
    if (prev) await sb.from("company_metricas").update(fila).eq("id", prev.id);
    else await sb.from("company_metricas").insert(fila);
    void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "indicador_valor", entidadId: ind.id, detalle: { clave: ind.clave, periodo: b.periodo }, ruta: "/api/companies/indicadores", ip: ipDe(req) });
  }

  return ok({ listo: true });
});
