import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { completitud } from "@/lib/iniciativas";
import { leerIniciativa, aplicarTransicion } from "../../_datos";
import { Transitar } from "../../_esquemas";
import { esUuid, respuestaDeRegla } from "../../_respuesta";

type Ctx = { params: Promise<{ id: string; iid: string }> };

/**
 * POST: un paso de la iniciativa en su tabla de estados. Aprobar exige la ficha completa y la autoridad
 * de aprobar; continuar, ajustar y detener exigen motivo, evidencia de lo observado y la misma autoridad.
 * La regla vive en src/lib/iniciativas.ts; aquí se comprueba sesión y pertenencia, y la regla incumplida
 * vuelve como 400 con su mensaje. Cada paso deja su fila en el historial.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "iniciativa_transicion" }, async (perfil, req, ctx) => {
  const { id, iid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, Transitar);
  try {
    const i = esUuid(iid) ? await leerIniciativa(iid) : null;
    if (!i || i.company_id !== id) return fallo("Esa iniciativa no existe en esta empresa.", 404);
    const r = await aplicarTransicion(i, perfil, { a_estado: b.a_estado, motivo: b.motivo, que_se_observo: b.que_se_observo, valor_observado: b.valor_observado, evidencia_ids: b.evidencia_ids });
    void registrar({
      companyId: id, actor: perfil, accion: b.a_estado === "aprobada" ? "aprobar" : "editar", entidad: "iniciativa_transicion", entidadId: iid,
      detalle: { de: i.estado, a: r.estado, historial: r.historialId }, ruta: "/api/companies/iniciativas/transicion", ip: ipDe(req),
    });
    return ok({ estado: r.estado, iniciativa: r.iniciativa, falta: completitud(r.iniciativa), historial_id: r.historialId, aviso: r.aviso });
  } catch (e) {
    return respuestaDeRegla(e);
  }
});
