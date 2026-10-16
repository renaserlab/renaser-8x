import { protegido, ok, fallo, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { editarLinea, leerLinea, revisarLinea, borrarLinea, sincronizarCosto, ErrorDeLinea, type DatosLinea, type GrupoEstado } from "@/lib/producto";
import { exigirLlenado } from "@/lib/solicitudes";
import { CambiosLineaDueno, CLAVES_DATOS_MODELO_DEL_GRUPO } from "@/lib/esquemas-negocio";
import { CambiosLinea, CAMPOS_DEL_GRUPO, textoComprobado, TEXTO_NO_ES_SUYO } from "../esquemas";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string; lid: string }> };

/**
 * PATCH: editar una línea o fijar su decisión. La decisión final es de la consultora: se guarda con su
 * motivo en la fila y con quién la fijó en el rastro. Quitar la decisión (null) también deja rastro, y
 * se lleva su motivo. Lo que no viene en el cuerpo no se toca; lo que viene null se borra a propósito.
 *
 * El dueño (16-10-2026) edita con la sección «productos» abierta, solo lo suyo (precios, partes del costo, cuánto vende
 * y el estado de cada dato, nunca «comprobado» ni la decisión), y no toca un grupo de datos que la consultora ya
 * comprobó con un documento: 409, con qué grupo y qué hacer. Los estados se mezclan con los que había, así nadie borra
 * un «comprobado» por mandar otro grupo.
 */
export const PATCH = protegido<Ctx>({ entidad: "linea_producto" }, async (perfil, req, ctx) => {
  const { id, lid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) await exigirLlenado(perfil, id, "productos");
  const b: DatosLinea = esConsultora ? await leerValidado(req, CambiosLinea) : await leerValidado(req, CambiosLineaDueno);
  if (Object.keys(b).length === 0) return fallo("No hay nada que cambiar.");

  const previa = await leerLinea(id, lid);
  if (!previa) return fallo("Esa línea no es de esta empresa.", 404);

  if (!esConsultora) {
    const estadosPrevios = previa.estados ?? {};
    // Lo que vive en datos_modelo también es de un grupo (si cobra por hora y el rango del precio son del precio; el
    // rango del «de cada 10», de cuánto vende): cambiarlo es tocar el grupo. Igual que antes no cuenta como tocarlo.
    const dmAntes = (previa.datos_modelo ?? {}) as Record<string, unknown>;
    const dmNuevo = b.datos_modelo === undefined ? null : ((b.datos_modelo ?? {}) as Record<string, unknown>);
    const cambiaEnDatosModelo = (g: GrupoEstado) => dmNuevo !== null && CLAVES_DATOS_MODELO_DEL_GRUPO[g].some((k) => JSON.stringify(dmAntes[k] ?? null) !== JSON.stringify(dmNuevo[k] ?? null));
    // Cobrando por hora, las horas de un caso son parte del precio de un caso.
    const horasDelPrecio = (g: GrupoEstado) => g === "precio" && dmAntes.por_hora === true && b.horas_por_unidad !== undefined && b.horas_por_unidad !== previa.horas_por_unidad;
    for (const g of Object.keys(CAMPOS_DEL_GRUPO) as GrupoEstado[]) {
      if (estadosPrevios[g] !== "comprobado") continue;
      const tocaGrupo = CAMPOS_DEL_GRUPO[g].some((c) => (b as Record<string, unknown>)[c] !== undefined) || b.estados?.[g] !== undefined || cambiaEnDatosModelo(g) || horasDelPrecio(g);
      if (tocaGrupo) return fallo(textoComprobado(g), 409);
    }
  }

  // El motivo es de UNA decisión: si la decisión cambia, el motivo anterior no la explica.
  if (b.decision && b.decision !== previa.decision && b.decision_motivo === undefined) return fallo("Di por qué: una decisión nueva se guarda con su propio motivo.");
  // Con partes del costo, el costo por unidad lo escribe 8X: no se manda suelto.
  if (b.costo_variable_unitario !== undefined && b.componentes_costo === undefined && (previa.componentes_costo?.length ?? 0) > 0) {
    return fallo("Este producto tiene su costo por partes: cambia las partes y 8X saca el total.");
  }

  // Una decisión que se quita se lleva su motivo; un servicio que pasa a producto pierde sus horas. Los estados se
  // mezclan con los que había; con partes del costo, el costo por unidad y su estado salen de las partes.
  const cambios: DatosLinea = {
    ...b,
    ...(b.decision === null ? { decision_motivo: null } : {}),
    ...(b.tipo === "producto" && b.horas_por_unidad === undefined ? { horas_por_unidad: null } : {}),
    ...(b.estados !== undefined ? { estados: { ...(previa.estados ?? {}), ...b.estados } } : {}),
  };
  Object.assign(cambios, sincronizarCosto(b.componentes_costo, previa.estados, b.estados));
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
      detalle: { campos: Object.keys(cambios), decision_antes: previa.decision, decision_despues: linea.decision, motivo: linea.decision_motivo, por: esConsultora ? "consultora" : "cliente" },
      ruta: "/api/companies/producto",
      ip: ipDe(req),
    });
    refrescarRuta(id, "negocio");
    return ok({ linea });
  } catch (e) {
    if (e instanceof ErrorDeLinea) return fallo(e.message, e.codigo === "23505" ? 409 : e.codigo === "no_encontrada" ? 404 : 500);
    throw e;
  }
});

/**
 * DELETE (16-10-2026): quitar una línea. La consultora, cualquiera. El dueño, solo la que él mismo anotó y con
 * «productos» abierta: lo que anotó la consultora (o salió de un documento) se lo pide a ella.
 */
export const DELETE = protegido<Ctx>({ entidad: "linea_producto" }, async (perfil, req, ctx) => {
  const { id, lid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) await exigirLlenado(perfil, id, "productos");
  const previa = await leerLinea(id, lid);
  if (!previa) return fallo("Esa línea no es de esta empresa.", 404);
  if (!esConsultora && previa.creada_por !== perfil.id) throw new AccesoDenegado(TEXTO_NO_ES_SUYO, "autoridad", id);
  try {
    const borrada = await borrarLinea(id, lid);
    if (!borrada) return fallo("Esa línea no es de esta empresa.", 404);
    void registrar({
      companyId: id,
      actor: perfil,
      accion: "eliminar",
      entidad: "linea_producto",
      entidadId: lid,
      detalle: { nombre: previa.nombre, codigo: previa.codigo, por: esConsultora ? "consultora" : "cliente" },
      ruta: "/api/companies/producto",
      ip: ipDe(req),
    });
    refrescarRuta(id, "negocio");
    return ok({ borrada: true });
  } catch (e) {
    if (e instanceof ErrorDeLinea) return fallo(e.message, 500);
    throw e;
  }
});
