/**
 * FINANZAS · LO QUE LEEN LA CAJA Y EL INFORME DEL MES (19-10-2026). Con la credencial del servidor y SIEMPRE filtrando
 * por la empresa del contexto. Las cuentas puras están en caja-cuentas.ts (que también usan los formularios).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sumarMeses, type Categoria, type Moneda, type Movimiento } from "./calculos";
import { cajaHoy, rangoDeMes, type Cierre, type SaldoInicial } from "./caja-cuentas";

export * from "./caja-cuentas";

export const COLUMNAS_MOVIMIENTO = "id,fecha,tipo,categoria_id,monto,moneda,detalle,origen,created_at";
export const COLUMNAS_CATEGORIA = "id,nombre,tipo,destino,archivada,orden";
export const COLUMNAS_CIERRE = "id,mes,tipo_cambio,fuente,cerrado_at,reabierto_at,motivo_reapertura";

/** De dónde vino un movimiento automático: el cobro (con su cliente) o el pago que se repite (con su nombre). */
export type OrigenAutomatico = { tipo: "cobro" | "pago"; texto: string; href: string };

/** Todo lo que la caja de un mes necesita, en una sola ida a la base. */
export async function cargarCaja(companyId: string, mes: string, hoy: string) {
  const sb = supabaseAdmin();
  const { desde, hastaExclusivo } = rangoDeMes(mes);
  const [cats, movs, cierres, saldos] = await Promise.all([
    sb.from("fin_categorias").select(COLUMNAS_CATEGORIA).eq("company_id", companyId).order("tipo").order("orden").order("nombre"),
    sb.from("fin_movimientos").select(COLUMNAS_MOVIMIENTO).eq("company_id", companyId).gte("fecha", desde).lt("fecha", hastaExclusivo).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
    sb.from("fin_cierres").select(COLUMNAS_CIERRE).eq("company_id", companyId).order("cerrado_at"),
    sb.from("fin_saldos_iniciales").select("id,moneda,monto,fecha").eq("company_id", companyId).is("anulado_at", null),
  ]);
  for (const r of [cats, movs, cierres, saldos]) if (r.error) throw new Error(r.error.message);
  const categorias = (cats.data ?? []) as Categoria[];
  const movimientos = (movs.data ?? []) as Movimiento[];
  const saldosIniciales = (saldos.data ?? []) as SaldoInicial[];

  // Caja hoy: los movimientos de cada moneda desde la fecha de su saldo inicial (solo si lo hay).
  const desdeSaldo = saldosIniciales.map((s) => s.fecha).sort()[0];
  const { data: desdeElSaldo, error: e2 } = desdeSaldo
    ? await sb.from("fin_movimientos").select("fecha,tipo,monto,moneda").eq("company_id", companyId).gte("fecha", desdeSaldo).lte("fecha", hoy)
    : { data: [], error: null };
  if (e2) throw new Error(e2.message);
  const caja: Record<Moneda, number | null> = {
    PEN: cajaHoy(saldosIniciales.find((s) => s.moneda === "PEN"), (desdeElSaldo ?? []) as Movimiento[], hoy),
    USD: cajaHoy(saldosIniciales.find((s) => s.moneda === "USD"), (desdeElSaldo ?? []) as Movimiento[], hoy),
  };

  // De dónde vino cada movimiento automático del mes.
  const automaticos = movimientos.filter((m) => m.origen !== "manual").map((m) => m.id);
  const origenes = new Map<string, OrigenAutomatico>();
  if (automaticos.length) {
    const [pc, ph] = await Promise.all([
      sb.from("fin_cobro_pagos").select("movimiento_id, fin_cobros(cliente,concepto)").eq("company_id", companyId).in("movimiento_id", automaticos),
      sb.from("fin_pagos_hechos").select("movimiento_id, fin_pagos_recurrentes(nombre)").eq("company_id", companyId).in("movimiento_id", automaticos),
    ]);
    for (const f of (pc.data ?? []) as unknown as { movimiento_id: string; fin_cobros: { cliente: string; concepto: string | null } | null }[]) {
      origenes.set(f.movimiento_id, { tipo: "cobro", texto: `entró sola: pago del cobro de ${f.fin_cobros?.cliente ?? "un cliente"}`, href: "/os/finanzas/cobros" });
    }
    for (const f of (ph.data ?? []) as unknown as { movimiento_id: string; fin_pagos_recurrentes: { nombre: string } | null }[]) {
      origenes.set(f.movimiento_id, { tipo: "pago", texto: `salió solo: pago de «${f.fin_pagos_recurrentes?.nombre ?? "algo que se repite"}»`, href: "/os/finanzas/pagos" });
    }
  }

  return {
    categorias,
    movimientos,
    cierres: (cierres.data ?? []) as Cierre[],
    saldosIniciales,
    caja,
    origenes,
  };
}

/** ¿Se usa la categoría? (movimientos, cobros o pagos que se repiten): entonces se archiva, no se borra. */
export async function categoriaEnUso(companyId: string, categoriaId: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const [m, c, p] = await Promise.all([
    sb.from("fin_movimientos").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("categoria_id", categoriaId),
    sb.from("fin_cobros").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("categoria_id", categoriaId),
    sb.from("fin_pagos_recurrentes").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("categoria_id", categoriaId),
  ]);
  return (m.count ?? 0) + (c.count ?? 0) + (p.count ?? 0) > 0;
}

/** CLAVES de company_metricas que la caja escribe por mes. */
const CLAVES_DEL_MES = ["venta_mes", "costo_variable_mes", "gasto_fijo_mes", "ganancia_mes"];

/** El informe de un mes y del anterior (para la variación): movimientos, cierres y lo que la caja ya escribió en «Tus números». */
export async function cargarInforme(companyId: string, mes: string) {
  const sb = supabaseAdmin();
  const anterior = sumarMeses(mes, -1);
  const [cats, movs, cierres, metricas] = await Promise.all([
    sb.from("fin_categorias").select(COLUMNAS_CATEGORIA).eq("company_id", companyId).order("orden"),
    sb.from("fin_movimientos").select(COLUMNAS_MOVIMIENTO).eq("company_id", companyId).gte("fecha", rangoDeMes(anterior).desde).lt("fecha", rangoDeMes(mes).hastaExclusivo),
    sb.from("fin_cierres").select(COLUMNAS_CIERRE).eq("company_id", companyId).order("cerrado_at"),
    sb.from("company_metricas").select("clave,periodo,valor").eq("company_id", companyId).eq("origen", "caja").in("periodo", [mes, anterior]).in("clave", CLAVES_DEL_MES),
  ]);
  for (const r of [cats, movs, cierres, metricas]) if (r.error) throw new Error(r.error.message);
  const todos = (movs.data ?? []) as Movimiento[];
  const deMes = (m: string) => todos.filter((x) => x.fecha.slice(0, 7) === m);
  const metricasDe = (m: string) => ((metricas.data ?? []) as { clave: string; periodo: string; valor: number | string | null }[]).filter((x) => x.periodo === m);
  return {
    anterior,
    categorias: (cats.data ?? []) as Categoria[],
    movimientos: deMes(mes),
    movimientosAnterior: deMes(anterior),
    cierres: (cierres.data ?? []) as Cierre[],
    metricas: metricasDe(mes),
    metricasAnterior: metricasDe(anterior),
  };
}
