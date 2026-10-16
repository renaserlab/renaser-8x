import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { completitud } from "@/lib/iniciativas";
import { leerIniciativa, modificarIniciativa } from "../_datos";
import { Editar } from "../_esquemas";
import { esUuid, respuestaDeRegla } from "../_respuesta";

type Ctx = { params: Promise<{ id: string; iid: string }> };

/**
 * PATCH: editar la ficha de una iniciativa o añadirle una fuente aportada. Mientras es propuesta se
 * completa sin más y queda rastro de qué cambió. Ya aprobada, cambiarla es volver a decidir: pide motivo,
 * pide la autoridad de aprobar y no puede quedar incompleta. Lo detenido y lo cerrado ya no se edita.
 * El estado no se cambia por aquí: eso es /transicion.
 */
export const PATCH = protegido<Ctx>({ consultor: true, entidad: "iniciativa" }, async (perfil, req, ctx) => {
  const { id, iid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Editar);
  try {
    const i = esUuid(iid) ? await leerIniciativa(iid) : null;
    if (!i || i.company_id !== id) return fallo("Esa iniciativa no existe en esta empresa.", 404);
    const { motivo, fuente_aportada, ...cambios } = b;
    if (!Object.keys(cambios).length && !fuente_aportada) return fallo("No llegó ningún cambio que guardar.", 400);
    const r = await modificarIniciativa(i, perfil, { cambios, motivo, fuente_aportada });
    if (r.historialIds.length) {
      void registrar({
        companyId: id, actor: perfil, accion: "editar", entidad: "iniciativa", entidadId: iid,
        detalle: { estado: i.estado, campos: Object.keys(cambios), fuente_aportada: Boolean(fuente_aportada), historial: r.historialIds },
        ruta: "/api/companies/iniciativas", ip: ipDe(req),
      });
    }
    return ok({ iniciativa: r.iniciativa, falta: completitud(r.iniciativa), sin_cambios: r.historialIds.length === 0 });
  } catch (e) {
    return respuestaDeRegla(e);
  }
});
