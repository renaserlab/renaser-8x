import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { editarLinea, leerLinea, revisarLinea, ErrorDeLinea } from "@/lib/producto";
import { CambiosLinea } from "../esquemas";

type Ctx = { params: Promise<{ id: string; lid: string }> };

/**
 * PATCH: editar una línea o fijar su decisión. La decisión final es de la consultora: se guarda con su
 * motivo en la fila y con quién la fijó en el rastro. Quitar la decisión (null) también deja rastro, y
 * se lleva su motivo. Lo que no viene en el cuerpo no se toca; lo que viene null se borra a propósito.
 */
export const PATCH = protegido<Ctx>({ consultor: true, entidad: "linea_producto" }, async (perfil, req, ctx) => {
  const { id, lid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, CambiosLinea);
  if (Object.keys(b).length === 0) return fallo("No hay nada que cambiar.");

  const previa = await leerLinea(id, lid);
  if (!previa) return fallo("Esa línea no es de esta empresa.", 404);
  // El motivo es de UNA decisión: si la decisión cambia, el motivo anterior no la explica.
  if (b.decision && b.decision !== previa.decision && b.decision_motivo === undefined) return fallo("Di por qué: una decisión nueva se guarda con su propio motivo.");

  // Una decisión que se quita se lleva su motivo; un servicio que pasa a producto pierde sus horas.
  const cambios = {
    ...b,
    ...(b.decision === null ? { decision_motivo: null } : {}),
    ...(b.tipo === "producto" && b.horas_por_unidad === undefined ? { horas_por_unidad: null } : {}),
  };
  const queda = { ...previa, ...cambios };
  const reparo = revisarLinea(queda);
  if (reparo) return fallo(reparo);

  try {
    const linea = await editarLinea(id, lid, cambios);
    void registrar({
      companyId: id,
      actor: perfil,
      accion: "editar",
      entidad: "linea_producto",
      entidadId: lid,
      detalle: { campos: Object.keys(cambios), decision_antes: previa.decision, decision_despues: linea.decision, motivo: linea.decision_motivo },
      ruta: "/api/companies/producto",
      ip: ipDe(req),
    });
    return ok({ linea });
  } catch (e) {
    if (e instanceof ErrorDeLinea) return fallo(e.message, e.codigo === "23505" ? 409 : e.codigo === "no_encontrada" ? 404 : 500);
    throw e;
  }
});
