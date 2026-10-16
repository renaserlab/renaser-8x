import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { listarLineas, crearLinea, evaluar, resumenParaDueno, revisarLinea, configDeEmpresa, capacidadDe, periodoValido, sincronizarCosto, ErrorDeLinea, SIN_PERIODO, FORMA_PERIODO, type DatosLinea } from "@/lib/producto";
import { exigirLlenado } from "@/lib/solicitudes";
import { CuerpoLineaDueno } from "@/lib/esquemas-negocio";
import { MODELO } from "@/lib/negocio";
import { CuerpoLinea } from "./esquemas";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET: lo que vende la empresa.
 *
 * La consultora recibe las líneas con su evaluación (ingreso, lo que deja, participación, horas), la
 * sugerencia determinista y la decisión. Admite ?periodo= y, para los servicios, ?personas=&horas=.
 * El dueño recibe solo su resumen, en sus palabras y SIN decisiones: la tabla no distingue una decisión
 * acordada con él de una que la consultora todavía está pensando, así que por aquí no sale ninguna.
 */
export const GET = protegido<Ctx>({ entidad: "linea_producto" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const parametros = new URL(req.url).searchParams;
  const periodo = parametros.get("periodo")?.trim() || null;
  if (periodo && periodo !== SIN_PERIODO && !periodoValido(periodo)) return fallo(`El periodo se escribe así: ${FORMA_PERIODO}.`);
  const paraDueno = perfil.rol !== "consultor";
  // Al dueño la decisión ni se le pide a la base: se filtra en la consulta, no al responder.
  const [lineas, config] = await Promise.all([listarLineas(id, { paraDueno }), configDeEmpresa(id)]);
  const evaluacion = evaluar(lineas, { periodo, config, capacidad: capacidadDe({ personas: parametros.get("personas"), horas: parametros.get("horas") }) });
  if (paraDueno) return ok({ resumen: resumenParaDueno(lineas, evaluacion, config) });
  return ok({ lineas, evaluacion });
});

/**
 * POST: crear una línea.
 *
 * La consultora, con todo (también la decisión, con su motivo, y «comprobado»). El dueño (16-10-2026), solo con la
 * sección «productos» abierta por su consultora y solo con lo suyo: nombre, cómo gana dinero, precios, partes del
 * costo, cuánto vende al mes y el estado de cada dato (nunca «comprobado»). Su línea entra como «declarado» y con su
 * nombre en `creada_por`, para que pueda quitar lo que él mismo anotó.
 *
 * Con partes del costo, 8X escribe el costo por unidad (centro de la suma) y su estado si todas tienen número; si
 * falta alguna, el costo por unidad queda vacío. Así la vista por periodo de la consultora sigue igual.
 */
export const POST = protegido<Ctx>({ entidad: "linea_producto" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";

  let datos: DatosLinea & { nombre: string; tipo: "producto" | "servicio" };
  if (esConsultora) {
    const b = await leerValidado(req, CuerpoLinea);
    datos = { ...b, origen: b.origen ?? "declarado" };
  } else {
    await exigirLlenado(perfil, id, "productos");
    const b = await leerValidado(req, CuerpoLineaDueno);
    const tipo = b.tipo ?? (b.modelo ? MODELO[b.modelo].tipoLinea : "producto");
    datos = { ...b, tipo, origen: "declarado", creada_por: perfil.id };
  }
  Object.assign(datos, sincronizarCosto(datos.componentes_costo, undefined, datos.estados));

  const reparo = revisarLinea({
    tipo: datos.tipo,
    horas_por_unidad: datos.horas_por_unidad ?? null,
    decision: datos.decision ?? null,
    decision_motivo: datos.decision_motivo ?? null,
    periodo: datos.periodo ?? null,
    precio_segundo: datos.precio_segundo ?? null,
    segundo_precio_es: datos.segundo_precio_es ?? null,
    de_cada_10_segundo: datos.de_cada_10_segundo ?? null,
    unidades_mes: datos.unidades_mes ?? null,
    unidades_mes_desde: datos.unidades_mes_desde ?? null,
    unidades_mes_hasta: datos.unidades_mes_hasta ?? null,
    participacion_de_10: datos.participacion_de_10 ?? null,
    componentes_costo: datos.componentes_costo ?? [],
  });
  if (reparo) return fallo(reparo);
  try {
    const linea = await crearLinea(id, datos);
    void registrar({
      companyId: id,
      actor: perfil,
      accion: "crear",
      entidad: "linea_producto",
      entidadId: linea.id,
      detalle: { codigo: linea.codigo, nombre: linea.nombre, tipo: linea.tipo, decision: linea.decision, por: esConsultora ? "consultora" : "cliente" },
      ruta: "/api/companies/producto",
      ip: ipDe(req),
    });
    refrescarRuta(id, "negocio");
    return ok({ linea }, 201);
  } catch (e) {
    if (e instanceof ErrorDeLinea) return fallo(e.message, e.codigo === "23505" ? 409 : 500);
    throw e;
  }
});
