import { protegido, ok, fallo, leerValidado, exigirAcceso } from "@/lib/api";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirLlenado } from "@/lib/solicitudes";
import { CuerpoCosto, CuerpoCostoDueno, columnasDeDato } from "@/lib/esquemas-negocio";
import { listarCostos, costoDesdeFila, ErrorDeNegocio, faltaMigracionNegocio, TEXTO_FALTA_MIGRACION, COLUMNAS_COSTO } from "@/lib/negocio-datos";
import { respuestaDeBase } from "../negocio/_comun";
import { refrescarRuta } from "@/lib/ruta-datos";

type Ctx = { params: Promise<{ id: string }> };
const RUTA = "/api/companies/costos";
const RE_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** GET: los gastos del mes típico (o del mes ?periodo=AAAA-MM). Los leen la consultora y el dueño. */
export const GET = protegido<Ctx>({ entidad: "costo_mes" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const periodo = new URL(req.url).searchParams.get("periodo")?.trim() || "mes_tipico";
  if (periodo !== "mes_tipico" && !RE_MES.test(periodo)) return fallo("El mes se escribe AAAA-MM (por ejemplo 2026-09).");
  try {
    return ok({ costos: await listarCostos(id, periodo) });
  } catch (e) {
    if (e instanceof ErrorDeNegocio && faltaMigracionNegocio(e.codigo)) return fallo(TEXTO_FALTA_MIGRACION, 409);
    throw e;
  }
});

/**
 * POST: anotar un gasto del mes: fijo («lo que pagas sí o sí») o de vender (publicidad, vendedores, delivery). Un
 * monto, un rango o «no lo sé», nunca un cero puesto por nosotros. La consultora siempre; el dueño, con «costos»
 * abierta y sin «comprobado».
 */
export const POST = protegido<Ctx>({ entidad: "costo_mes" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const esConsultora = perfil.rol === "consultor";
  if (!esConsultora) await exigirLlenado(perfil, id, "costos");
  const b = esConsultora ? await leerValidado(req, CuerpoCosto) : await leerValidado(req, CuerpoCostoDueno);
  const fila = {
    company_id: id,
    periodo: b.periodo ?? "mes_tipico",
    tipo: b.tipo,
    nombre: b.nombre,
    ...columnasDeDato(b.dato),
    nota: b.nota ?? null,
    orden: b.orden ?? 0,
    creado_por: perfil.id,
  };
  const { data, error } = await supabaseAdmin().from("costos_mes").insert(fila).select(COLUMNAS_COSTO).single();
  if (error) return respuestaDeBase(error, { ruta: RUTA, metodo: "POST", que: "guardar el gasto", perfil, companyId: id });
  const costo = costoDesdeFila(data as unknown as Record<string, unknown>);
  void registrar({ companyId: id, actor: perfil, accion: "crear", entidad: "costo_mes", entidadId: costo.id, detalle: { tipo: costo.tipo, nombre: costo.nombre, estado: fila.estado, por: esConsultora ? "consultora" : "cliente" }, ruta: RUTA, ip: ipDe(req) });
  refrescarRuta(id, "negocio");
  return ok({ costo }, 201);
});
