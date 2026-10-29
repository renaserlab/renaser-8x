import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { crearAccion, queLeFalta, ReglaDelPlan } from "@/lib/plan-intervencion";

type Ctx = { params: Promise<{ id: string }> };
const RUTA = "/api/companies/plan/accion";

const uuid = z.string().uuid();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const texto = (max: number) => z.string().trim().max(max).nullable();

/**
 * UNA ACCIÓN ESCRITA A MANO. Los mismos campos que la ficha deja editar después, todos opcionales menos el
 * primero: lo único que una acción necesita para existir es decir qué se hace. Lo demás se completa en su ficha,
 * que ya dice qué le falta para poder aprobarse.
 */
const Nueva = z.object({
  accion: z.string().trim().min(1).max(600),
  objetivo_empresarial: texto(1200).optional(),
  resultado_esperado: texto(1200).optional(),
  restriccion_oportunidad: texto(1200).optional(),
  entregable: texto(600).optional(),
  criterio_aceptacion: texto(1200).optional(),
  recursos: texto(1200).optional(),
  riesgos: texto(1200).optional(),
  supuestos: texto(1200).optional(),
  obligaciones_cliente: texto(1200).optional(),
  obligaciones_renaser: texto(1200).optional(),
  responsable: texto(200).optional(),
  responsable_participant_id: uuid.nullable().optional(),
  indicador_id: uuid.nullable().optional(),
  linea_base_id: uuid.nullable().optional(),
  depende_de: z.array(uuid).max(20).optional(),
  evidencia_ids: z.array(uuid).max(50).optional(),
  kpi: texto(400).optional(),
  nota: texto(1200).optional(),
  fecha_inicio: fecha.nullable().optional(),
  vence_at: fecha.nullable().optional(),
  semana_inicio: z.number().int().min(1).max(7).nullable().optional(),
  semana_cierre: z.number().int().min(1).max(7).nullable().optional(),
  prioridad: z.number().int().min(1).max(99).nullable().optional(),
  impacto: z.enum(["alto", "medio", "bajo"]).nullable().optional(),
  fase: z.enum(["implementacion", "monitoreo"]).optional(),
  es_prioridad: z.boolean().optional(),
  /** Por qué se propone. No es obligatorio —proponer no exige motivo— pero queda en el historial si se escribe. */
  motivo: z.string().trim().max(2000).optional(),
});

/**
 * POST: la consultora escribe una acción del plan a mano.
 *
 * POR QUÉ EXISTE. La única puerta por la que nacía una acción era el planificador de IA: sin crédito, sin
 * hallazgos aprobados o con un frente que no sale de un hallazgo, la consultora se quedaba mirando una tabla
 * vacía sin nada que pulsar más que «Generar propuesta». El plan es suyo; tiene que poder escribirlo.
 *
 * NO PIDE LA AUTORIDAD DE APROBAR PLANES, igual que crear una iniciativa no la pide: lo que nace es una
 * PROPUESTA, y aprobarla sigue exigiendo la autoridad, los seis mínimos llenos y sitio dentro del límite de
 * frentes abiertos de la empresa.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "accion" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const { motivo, ...campos } = await leerValidado(req, Nueva);
  try {
    const r = await crearAccion(id, perfil, campos, motivo);
    void registrar({
      companyId: id, actor: perfil, accion: "crear", entidad: "accion", entidadId: r.accion.id,
      detalle: { accion: r.accion.accion, campos: Object.keys(campos), historial: r.historialId }, ruta: RUTA, ip: ipDe(req),
    });
    return ok({ accion: r.accion, falta: queLeFalta(r.accion), historial_id: r.historialId }, 201);
  } catch (e) {
    if (e instanceof ReglaDelPlan) return fallo(e.message, 400);
    throw e;
  }
});
