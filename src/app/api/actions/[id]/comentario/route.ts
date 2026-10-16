import { z } from "zod";
import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { leerAccion, aplicarTransicion, ReglaDelPlan } from "@/lib/plan-intervencion";

type Ctx = { params: Promise<{ id: string }> };

const Comentario = z.object({ texto: z.string().trim().min(1, "Escribe algo.").max(2000) });

/**
 * UN COMENTARIO SOBRE UNA ACCIÓN, de la consultora o del dueño. Es una fila más del historial (accion
 * «comentar»): no cambia el estado y nunca se pisa. Es donde el dueño dice «me falta la llave del almacén» y
 * la consultora «te la lleva Rosa el martes».
 */
export const POST = protegido<Ctx>({ entidad: "accion_comentario" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const a = await leerAccion(id);
  if (!a) return fallo("Esa acción no existe.", 404);
  await exigirAcceso(perfil, a.company_id);
  const b = await leerValidado(req, Comentario);
  try {
    const r = await aplicarTransicion(a, perfil, { evento: "comentar", motivo: b.texto });
    void registrar({ companyId: a.company_id, actor: perfil, accion: "crear", entidad: "accion_comentario", entidadId: id, detalle: { historial: r.historialIds }, ruta: "/api/actions/comentario", ip: ipDe(req) });
    return ok({ historial_id: r.historialIds[0] ?? null }, 201);
  } catch (e) {
    if (e instanceof ReglaDelPlan) return fallo(e.message, 400);
    throw e;
  }
});
