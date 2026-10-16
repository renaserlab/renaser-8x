import { protegido, ok, fallo, leerValidado, exigirAcceso, AccesoDenegado } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CambiosOperacionMoneda, CambiosOperacionMonedaDueno, diasEntreFechas } from "@/lib/esquemas-negocio";
import { operacionDesdeFila, COLUMNAS_OPERACION } from "@/lib/negocio-datos";
import { fugaCambiaria } from "@/lib/rentabilidad";
import { respuestaDeBase, textoComprobadoFila, exigirModulo } from "../../negocio/_comun";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string; oid: string }> };
const RUTA = "/api/companies/moneda";

async function leerPrevia(id: string, oid: string) {
  return supabaseAdmin().from("operaciones_moneda").select(COLUMNAS_OPERACION).eq("id", oid).eq("company_id", id).maybeSingle();
}

/**
 * PATCH: corregir una venta en otra moneda. La consultora siempre (puede marcarla «comprobada»); el dueño con «moneda»
 * abierta y no sobre una venta ya comprobada. Si cambia alguna fecha, los días de cobro se recalculan.
 */
export const PATCH = protegido<Ctx>({ entidad: "operacion_moneda" }, async (perfil, req, ctx) => {
  const { id, oid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) await exigirModulo(perfil, id, "moneda");
  const b = esConsultora ? await leerValidado(req, CambiosOperacionMoneda) : await leerValidado(req, CambiosOperacionMonedaDueno);
  if (Object.keys(b).length === 0) return fallo("No hay nada que cambiar.");

  const { data: previa, error: errorLeer } = await leerPrevia(id, oid);
  if (errorLeer) return respuestaDeBase(errorLeer, { ruta: RUTA, metodo: "PATCH", que: "leer la venta", perfil, companyId: id });
  if (!previa) return fallo("Esa venta no es de esta empresa.", 404);
  const antes = operacionDesdeFila(previa as unknown as Record<string, unknown>);
  if (!esConsultora && antes.estado === "comprobado") return fallo(textoComprobadoFila("Esta venta"), 409);

  const cambios: Record<string, unknown> = { ...b, updated_at: new Date().toISOString() };
  const venta = b.fecha_venta !== undefined ? b.fecha_venta : antes.fecha_venta;
  const cobro = b.fecha_cobro !== undefined ? b.fecha_cobro : antes.fecha_cobro;
  if (venta && cobro && cobro < venta) return fallo("Te cobraron antes de venderlo: revisa las fechas.");
  if (b.fecha_venta !== undefined || b.fecha_cobro !== undefined) {
    const dias = diasEntreFechas(venta, cobro);
    if (dias != null) cambios.dias_cobro = dias;
  }
  if (typeof cambios.dias_cobro === "number" && cambios.dias_cobro > 730) return fallo("Entre la venta y el cobro hay más de dos años: revisa las fechas.");

  const { data, error } = await supabaseAdmin().from("operaciones_moneda").update(cambios).eq("id", oid).eq("company_id", id).select(COLUMNAS_OPERACION).maybeSingle();
  if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "PATCH", que: "guardar la venta", perfil, companyId: id });
  if (!data) return fallo("Esa venta no es de esta empresa.", 404);
  const operacion = operacionDesdeFila(data as unknown as Record<string, unknown>);
  void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "operacion_moneda", entidadId: oid, detalle: { campos: Object.keys(b), estado_antes: antes.estado, estado_despues: operacion.estado, por: esConsultora ? "consultora" : "cliente" }, ruta: RUTA, ip: ipDe(req) });
  refrescarRuta(id, "negocio");
  return ok({ operacion, fuga: fugaCambiaria(operacion) });
});

/** DELETE: quitar una venta. La consultora, cualquiera; el dueño, con «moneda» abierta, solo la que él anotó y no comprobada. */
export const DELETE = protegido<Ctx>({ entidad: "operacion_moneda" }, async (perfil, req, ctx) => {
  const { id, oid } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) await exigirModulo(perfil, id, "moneda");
  const { data: previa, error: errorLeer } = await leerPrevia(id, oid);
  if (errorLeer) return respuestaDeBase(errorLeer, { ruta: RUTA, metodo: "DELETE", que: "leer la venta", perfil, companyId: id });
  if (!previa) return fallo("Esa venta no es de esta empresa.", 404);
  const antes = operacionDesdeFila(previa as unknown as Record<string, unknown>);
  if (!esConsultora) {
    if (antes.estado === "comprobado") return fallo(textoComprobadoFila("Esta venta"), 409);
    if (antes.creado_por !== perfil.id) throw new AccesoDenegado("Esta venta la anotó tu consultora: pídele que la quite.", "autoridad", id);
  }
  const { error } = await supabaseAdmin().from("operaciones_moneda").delete().eq("id", oid).eq("company_id", id);
  if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "DELETE", que: "quitar la venta", perfil, companyId: id });
  void registrar({ companyId: id, actor: perfil, accion: "eliminar", entidad: "operacion_moneda", entidadId: oid, detalle: { moneda: antes.moneda, monto: antes.monto, por: esConsultora ? "consultora" : "cliente" }, ruta: RUTA, ip: ipDe(req) });
  refrescarRuta(id, "negocio");
  return ok({ borrada: true });
});
