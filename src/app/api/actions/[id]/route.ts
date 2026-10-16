import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { leerAccion, modificarAccion, queLeFalta, ReglaDelPlan, CAMPOS_EDITABLES } from "@/lib/plan-intervencion";

type Ctx = { params: Promise<{ id: string }> };

const uuid = z.string().uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const texto = (max: number) => z.string().trim().max(max).nullable();

/**
 * LA FICHA DE UNA ACCIÓN: los 14 campos, las condiciones y los campos antiguos. El estado NO se cambia aquí
 * (va por /transicion). Solo la consultora edita; el dueño reporta y comenta por sus propias rutas.
 */
const Ficha = z
  .object({
    accion: z.string().trim().min(1).max(600),
    objetivo_empresarial: texto(1200),
    linea_base_id: uuid.nullable(),
    resultado_esperado: texto(1200),
    restriccion_oportunidad: texto(1200),
    evidencia_ids: z.array(uuid).max(50),
    entregable: texto(600),
    responsable_participant_id: uuid.nullable(),
    recursos: texto(1200),
    fecha_inicio: fecha.nullable(),
    vence_at: fecha.nullable(),
    depende_de: z.array(uuid).max(20),
    indicador_id: uuid.nullable(),
    criterio_aceptacion: texto(1200),
    riesgos: texto(1200),
    supuestos: texto(1200),
    obligaciones_cliente: texto(1200),
    obligaciones_renaser: texto(1200),
    responsable: texto(200),
    kpi: texto(400),
    evidencia: texto(600),
    impacto: z.enum(["alto", "medio", "bajo"]).nullable(),
    nota: texto(1200),
    semana_inicio: z.number().int().min(1).max(7).nullable(),
    semana_cierre: z.number().int().min(1).max(7).nullable(),
    prioridad: z.number().int().min(1).max(99).nullable(),
    es_prioridad: z.boolean(),
    fase: z.enum(["implementacion", "monitoreo"]),
    // Por qué se cambia y qué implica: obligatorios cuando la acción ya no es una propuesta.
    motivo: z.string().trim().max(2000).optional(),
    implica: z.string().trim().max(2000).optional(),
  })
  .partial();

export const PATCH = protegido<Ctx>({ consultor: true, entidad: "accion" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const a = await leerAccion(id);
  if (!a) return fallo("Esa acción no existe.", 404);
  await exigirAcceso(perfil, a.company_id);
  const b = await leerValidado(req, Ficha);
  const { motivo, implica, ...resto } = b;
  const cambios = Object.fromEntries(Object.entries(resto).filter(([k, v]) => v !== undefined && (CAMPOS_EDITABLES as readonly string[]).includes(k)));
  if (typeof cambios.fecha_inicio === "string" && typeof cambios.vence_at === "string" && cambios.vence_at < cambios.fecha_inicio) {
    return fallo("La fecha de vencimiento no puede ser anterior a la de inicio.");
  }
  try {
    const r = await modificarAccion(a, perfil, cambios, motivo, implica);
    void registrar({ companyId: a.company_id, actor: perfil, accion: "editar", entidad: "accion", entidadId: id, detalle: { campos: Object.keys(cambios), historial: r.historialId }, ruta: "/api/actions", ip: ipDe(req) });
    return ok({ accion: r.accion, falta: queLeFalta(r.accion), historial_id: r.historialId });
  } catch (e) {
    if (e instanceof ReglaDelPlan) return fallo(e.message, 400);
    throw e;
  }
});

/** La acción con lo que le falta para aprobarse. Lo lee cualquiera que pertenezca a la empresa. */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const a = await leerAccion(id);
  if (!a) return fallo("Esa acción no existe.", 404);
  await exigirAcceso(perfil, a.company_id);
  return ok({ accion: a, falta: queLeFalta(a) });
});
