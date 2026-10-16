import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { leerAccion, aplicarTransicion, queLeFalta, ReglaDelPlan, EVENTOS } from "@/lib/plan-intervencion";

type Ctx = { params: Promise<{ id: string }> };

const Pedido = z.object({
  evento: z.enum(EVENTOS),
  motivo: z.string().trim().max(2000).optional(),
  implica: z.string().trim().max(2000).optional(),
  evidencia_id: z.string().uuid().optional(),
  escalado_a: z.string().uuid().optional(),
});

/**
 * UN EVENTO SOBRE UNA ACCIÓN DEL PLAN: aprobar, rechazar, posponer, iniciar, reportar, verificar, devolver,
 * bloquear, desbloquear, escalar, volver a proponer. La regla vive en plan-intervencion.ts: qué estado
 * admite qué evento, quién puede, qué autoridad hace falta, qué motivo e implicación se exigen, qué prueba
 * pide verificar y cuántas prioridades pueden estar abiertas. Aquí solo se comprueba sesión y pertenencia
 * y se traduce la regla incumplida a un 409 con su mensaje: la petición está bien formada y lo que choca es el
 * estado del plan. Es el mismo código que da el PATCH de evidencia por la misma regla; el 400 queda para el
 * cuerpo mal formado (un evento que no existe, un identificador que no lo es).
 */
export const POST = protegido<Ctx>({ entidad: "accion_transicion" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const a = await leerAccion(id);
  if (!a) return fallo("Esa acción no existe.", 404);
  await exigirAcceso(perfil, a.company_id);
  const b = await leerValidado(req, Pedido);
  try {
    const r = await aplicarTransicion(a, perfil, b);
    void registrar({
      companyId: a.company_id, actor: perfil, accion: b.evento === "aprobar" || b.evento === "verificar" ? "aprobar" : "editar",
      entidad: "accion_transicion", entidadId: id, detalle: { evento: b.evento, de: a.estado, a: r.estado, historial: r.historialIds },
      ruta: "/api/actions/transicion", ip: ipDe(req),
    });
    return ok({ estado: r.estado, accion: r.accion, falta: queLeFalta(r.accion), historial_ids: r.historialIds });
  } catch (e) {
    if (e instanceof ReglaDelPlan) return fallo(e.message, 409);
    throw e;
  }
});
