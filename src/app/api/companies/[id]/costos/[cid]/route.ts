import { protegido, ok, fallo, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirLlenado } from "@/lib/solicitudes";
import { CambiosCosto, CambiosCostoDueno, columnasDeDato } from "@/lib/esquemas-negocio";
import { costoDesdeFila, COLUMNAS_COSTO } from "@/lib/negocio-datos";
import { respuestaDeBase, textoComprobadoFila } from "../../negocio/_comun";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string; cid: string }> };
const RUTA = "/api/companies/costos";

async function leerPrevia(id: string, cid: string) {
  return supabaseAdmin().from("costos_mes").select(COLUMNAS_COSTO).eq("id", cid).eq("company_id", id).maybeSingle();
}

/**
 * PATCH: cambiar un gasto. La consultora siempre (puede marcarlo «comprobado»); el dueño con «costos» abierta, y no
 * cambia un gasto que la consultora ya comprobó con un documento (409, con qué hacer).
 */
export const PATCH = protegido<Ctx>({ entidad: "costo_mes" }, async (perfil, req, ctx) => {
  const { id, cid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) await exigirLlenado(perfil, id, "costos");
  const b = esConsultora ? await leerValidado(req, CambiosCosto) : await leerValidado(req, CambiosCostoDueno);
  if (Object.keys(b).length === 0) return fallo("No hay nada que cambiar.");

  const { data: previa, error: errorLeer } = await leerPrevia(id, cid);
  if (errorLeer) return respuestaDeBase(errorLeer, { ruta: RUTA, metodo: "PATCH", que: "leer el gasto", perfil, companyId: id });
  if (!previa) return fallo("Ese gasto no es de esta empresa.", 404);
  const antes = previa as unknown as Record<string, unknown>;
  if (!esConsultora && antes.estado === "comprobado") return fallo(textoComprobadoFila("Este gasto"), 409);

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.periodo !== undefined) cambios.periodo = b.periodo;
  if (b.tipo !== undefined) cambios.tipo = b.tipo;
  if (b.nombre !== undefined) cambios.nombre = b.nombre;
  if (b.nota !== undefined) cambios.nota = b.nota;
  if (b.orden !== undefined) cambios.orden = b.orden;
  if (b.dato !== undefined) Object.assign(cambios, columnasDeDato(b.dato));

  const { data, error } = await supabaseAdmin().from("costos_mes").update(cambios).eq("id", cid).eq("company_id", id).select(COLUMNAS_COSTO).maybeSingle();
  if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "PATCH", que: "guardar el gasto", perfil, companyId: id });
  if (!data) return fallo("Ese gasto no es de esta empresa.", 404);
  const costo = costoDesdeFila(data as unknown as Record<string, unknown>);
  void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "costo_mes", entidadId: cid, detalle: { campos: Object.keys(b), estado_antes: antes.estado, estado_despues: data && (data as Record<string, unknown>).estado, por: esConsultora ? "consultora" : "cliente" }, ruta: RUTA, ip: ipDe(req) });
  refrescarRuta(id, "negocio");
  return ok({ costo });
});

/**
 * DELETE: quitar un gasto. La consultora, cualquiera. El dueño, con «costos» abierta, solo el que él anotó y que no
 * esté comprobado: lo que anotó la consultora se lo pide a ella.
 */
export const DELETE = protegido<Ctx>({ entidad: "costo_mes" }, async (perfil, req, ctx) => {
  const { id, cid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) await exigirLlenado(perfil, id, "costos");
  const { data: previa, error: errorLeer } = await leerPrevia(id, cid);
  if (errorLeer) return respuestaDeBase(errorLeer, { ruta: RUTA, metodo: "DELETE", que: "leer el gasto", perfil, companyId: id });
  if (!previa) return fallo("Ese gasto no es de esta empresa.", 404);
  const antes = previa as unknown as Record<string, unknown>;
  if (!esConsultora) {
    if (antes.estado === "comprobado") return fallo(textoComprobadoFila("Este gasto"), 409);
    if (antes.creado_por !== perfil.id) throw new AccesoDenegado("Este gasto lo anotó tu consultora: pídele que lo quite.", "autoridad", id);
  }
  const { error } = await supabaseAdmin().from("costos_mes").delete().eq("id", cid).eq("company_id", id);
  if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "DELETE", que: "quitar el gasto", perfil, companyId: id });
  void registrar({ companyId: id, actor: perfil, accion: "eliminar", entidad: "costo_mes", entidadId: cid, detalle: { nombre: antes.nombre, tipo: antes.tipo, por: esConsultora ? "consultora" : "cliente" }, ruta: RUTA, ip: ipDe(req) });
  refrescarRuta(id, "negocio");
  return ok({ borrado: true });
});
