import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CuerpoOperacionMoneda, CuerpoOperacionMonedaDueno, diasEntreFechas } from "@/lib/esquemas-negocio";
import { listarOperacionesMoneda, operacionDesdeFila, ErrorDeNegocio, faltaMigracionNegocio, TEXTO_FALTA_MIGRACION, COLUMNAS_OPERACION } from "@/lib/negocio-datos";
import { fugaCambiaria } from "@/lib/rentabilidad";
import { respuestaDeBase, exigirModulo } from "../negocio/_comun";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string }> };
const RUTA = "/api/companies/moneda";

/** GET: las ventas cobradas en otra moneda (las 500 más recientes) y, por cada una, lo que se quedó en el camino. */
export const GET = protegido<Ctx>({ entidad: "operacion_moneda" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  try {
    const operaciones = await listarOperacionesMoneda(id);
    return ok({ operaciones, fugas: operaciones.map(fugaCambiaria) });
  } catch (e) {
    if (e instanceof ErrorDeNegocio && faltaMigracionNegocio(e.codigo)) return fallo(TEXTO_FALTA_MIGRACION, 409);
    throw e;
  }
});

/**
 * POST: anotar una venta cobrada en otra moneda. La consultora siempre; el dueño con «moneda» abierta (o con «productos» abierta si ya dijo que le pagan en otra moneda) y sin
 * «comprobado». Si vienen las dos fechas, los días de cobro se calculan de ellas (no se piden aparte).
 */
export const POST = protegido<Ctx>({ entidad: "operacion_moneda" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) await exigirModulo(perfil, id, "moneda");
  const b = esConsultora ? await leerValidado(req, CuerpoOperacionMoneda) : await leerValidado(req, CuerpoOperacionMonedaDueno);
  const dias = diasEntreFechas(b.fecha_venta, b.fecha_cobro);
  const fila = {
    company_id: id,
    fecha_venta: b.fecha_venta ?? null,
    fecha_cobro: b.fecha_cobro ?? null,
    dias_cobro: dias ?? b.dias_cobro ?? null,
    moneda: b.moneda,
    monto: b.monto,
    tc_cotizado: b.tc_cotizado ?? null,
    tc_cobro: b.tc_cobro ?? null,
    recibido: b.recibido ?? null,
    comisiones: b.comisiones ?? null,
    conversiones: b.conversiones ?? null,
    estado: b.estado ?? "estimado",
    source_id: b.source_id ?? null,
    nota: b.nota ?? null,
    creado_por: perfil.id,
  };
  if (fila.dias_cobro != null && fila.dias_cobro > 730) return fallo("Entre la venta y el cobro hay más de dos años: revisa las fechas.");
  const { data, error } = await supabaseAdmin().from("operaciones_moneda").insert(fila).select(COLUMNAS_OPERACION).single();
  if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "POST", que: "guardar la venta", perfil, companyId: id });
  const operacion = operacionDesdeFila(data as unknown as Record<string, unknown>);
  void registrar({ companyId: id, actor: perfil, accion: "crear", entidad: "operacion_moneda", entidadId: operacion.id, detalle: { moneda: operacion.moneda, monto: operacion.monto, estado: operacion.estado, por: esConsultora ? "consultora" : "cliente" }, ruta: RUTA, ip: ipDe(req) });
  refrescarRuta(id, "negocio");
  return ok({ operacion, fuga: fugaCambiaria(operacion) }, 201);
});
