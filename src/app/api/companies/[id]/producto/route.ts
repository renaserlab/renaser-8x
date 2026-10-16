import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { listarLineas, crearLinea, evaluar, resumenParaDueno, revisarLinea, configDeEmpresa, capacidadDe, periodoValido, ErrorDeLinea, SIN_PERIODO, FORMA_PERIODO } from "@/lib/producto";
import { CuerpoLinea } from "./esquemas";

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
 * POST: crear una línea a mano. Es trabajo de la consultora. Lo que no se sabe no se manda: un precio
 * que no se conoce no es cero. Si viene decisión, viene con motivo: una decisión sin porqué no se guarda.
 */
export const POST = protegido<Ctx>({ consultor: true, entidad: "linea_producto" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, CuerpoLinea);
  const reparo = revisarLinea({ tipo: b.tipo, horas_por_unidad: b.horas_por_unidad ?? null, decision: b.decision ?? null, decision_motivo: b.decision_motivo ?? null, periodo: b.periodo ?? null });
  if (reparo) return fallo(reparo);
  try {
    const linea = await crearLinea(id, { ...b, origen: b.origen ?? "declarado" });
    void registrar({
      companyId: id,
      actor: perfil,
      accion: "crear",
      entidad: "linea_producto",
      entidadId: linea.id,
      detalle: { codigo: linea.codigo, nombre: linea.nombre, tipo: linea.tipo, decision: linea.decision },
      ruta: "/api/companies/producto",
      ip: ipDe(req),
    });
    return ok({ linea }, 201);
  } catch (e) {
    if (e instanceof ErrorDeLinea) return fallo(e.message, e.codigo === "23505" ? 409 : 500);
    throw e;
  }
});
