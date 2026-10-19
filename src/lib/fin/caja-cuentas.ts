/**
 * FINANZAS · LAS CUENTAS DE LA CAJA Y DEL INFORME, SIN BASE DE DATOS (19-10-2026). Puras: las usan las páginas (servidor),
 * los formularios (navegador) y tests/fin-caja.test.ts. La lectura de la base vive aparte, en caja.ts, porque usa la
 * credencial del servidor y no puede viajar al navegador.
 *
 * Nunca se suman soles con dólares. Los meses van como AAAA-MM y los días como AAAA-MM-DD, en el reloj de la empresa.
 */
import { sumarDias } from "@/lib/revision-semanal";
import { sumarMeses, totalesPorMoneda, libre, type Categoria, type Destino, type Moneda, type Movimiento } from "./calculos";

export const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * LO QUE EL DUEÑO ESCRIBE COMO MONTO, a número. En el Perú se escribe «1,250.50» (coma de miles, punto decimal), pero
 * también llega «1250,50» o «1.250,50». Con los dos separadores, el último es el decimal. Con solo comas, son de miles
 * si cada grupo después de una coma tiene tres cifras («1,250» = 1250); si no, es decimal («12,5»). Con solo puntos,
 * el punto es decimal. Lo que no es un número da null.
 */
export function leerMonto(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "").replace(/^(S\/|US\$)/i, "");
  if (!limpio || !/^[\d.,]+$/.test(limpio)) return null;
  const coma = limpio.lastIndexOf(",");
  const punto = limpio.lastIndexOf(".");
  let normal: string;
  if (coma >= 0 && punto >= 0) normal = coma > punto ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  else if (coma >= 0) normal = /^\d{1,3}(,\d{3})+$/.test(limpio) ? limpio.replace(/,/g, "") : limpio.replace(",", ".");
  else normal = limpio;
  if ((normal.match(/\./g) ?? []).length > 1) return null;
  const v = Number(normal);
  return Number.isFinite(v) ? v : null;
}

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** «2026-10-19» → «19 oct» (o «19 oct 2026»). Se lee del texto: nada de zonas horarias. */
export function fechaCorta(dia: string, conAnio = false): string {
  const texto = `${Number(dia.slice(8, 10))} ${MES_CORTO[Number(dia.slice(5, 7)) - 1] ?? ""}`;
  return conAnio ? `${texto} ${dia.slice(0, 4)}` : texto;
}

/** El mes pedido por la dirección (?mes=AAAA-MM), o el que corre si no es uno válido. */
export function mesPedido(pedido: string | undefined | null, hoy: string): string {
  return pedido && RE_MES.test(pedido) ? pedido : hoy.slice(0, 7);
}

/** Primer día del mes y primer día del siguiente (límite abierto), para filtrar fechas. */
export function rangoDeMes(mes: string): { desde: string; hastaExclusivo: string } {
  return { desde: `${mes}-01`, hastaExclusivo: `${sumarMeses(mes, 1)}-01` };
}

/** El último día de un mes: con qué fecha se propone registrar algo de un mes que ya pasó. */
export function ultimoDiaDe(mes: string): string {
  return sumarDias(`${sumarMeses(mes, 1)}-01`, -1);
}

/** La fecha que el formulario propone: hoy en el mes en curso; el último día en uno pasado; el primero en uno futuro. */
export function fechaPropuesta(mes: string, hoy: string): string {
  const actual = hoy.slice(0, 7);
  if (mes === actual) return hoy;
  return mes < actual ? ultimoDiaDe(mes) : `${mes}-01`;
}

export type Cierre = {
  id: string;
  mes: string;
  tipo_cambio: number | string | null;
  fuente: string | null;
  cerrado_at: string;
  reabierto_at: string | null;
  motivo_reapertura: string | null;
};

export type EstadoMes =
  | { estado: "abierto"; reaperturas: Cierre[]; sePuedeCerrar: boolean }
  | { estado: "cerrado"; cierre: Cierre; reaperturas: Cierre[] };

/**
 * El estado de un mes: cerrado (con su cierre vigente) o abierto. Uno abierto puede haber sido reabierto antes (la
 * historia se muestra) y se puede cerrar solo si ya terminó: el mes en curso todavía se mueve.
 */
export function estadoDelMes(cierres: readonly Cierre[], mes: string, hoy: string): EstadoMes {
  const delMes = cierres.filter((c) => c.mes.slice(0, 7) === mes);
  const vigente = delMes.find((c) => !c.reabierto_at);
  const reaperturas = delMes.filter((c) => c.reabierto_at).sort((a, b) => (b.reabierto_at ?? "").localeCompare(a.reabierto_at ?? ""));
  if (vigente) return { estado: "cerrado", cierre: vigente, reaperturas };
  return { estado: "abierto", reaperturas, sePuedeCerrar: mes < hoy.slice(0, 7) };
}

export type SaldoInicial = { id: string; moneda: Moneda; monto: number | string; fecha: string };

/**
 * DINERO EN CAJA HOY, por moneda: el saldo inicial más lo que entró menos lo que salió desde su fecha hasta hoy. Sin
 * saldo inicial no se sabe cuánto había antes: null, nunca un número inventado. (Es la misma cuenta que hace la base
 * para «Tus números», en soles.)
 */
export function cajaHoy(saldo: SaldoInicial | null | undefined, movimientos: readonly Pick<Movimiento, "fecha" | "tipo" | "monto" | "moneda">[], hoy: string): number | null {
  if (!saldo) return null;
  const neto = movimientos
    .filter((m) => m.moneda === saldo.moneda && m.fecha >= saldo.fecha && m.fecha <= hoy)
    .reduce((s, m) => s + (m.tipo === "ingreso" ? 1 : -1) * Number(m.monto), 0);
  return Math.round((Number(saldo.monto) + neto) * 100) / 100;
}

/** Cuánto cambió una cifra contra el mes anterior, en porcentaje entero. Sin base (anterior nulo o cero), null. */
export function variacion(actual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (actual == null || anterior == null || anterior === 0) return null;
  return Math.round(((actual - anterior) * 100) / Math.abs(anterior));
}

export type FilaPorCategoria = { categoria_id: string; nombre: string; destino: Destino; monto: number };

/** Lo que salió en una moneda, por categoría y de mayor a menor (lo que no es gasto queda fuera: va aparte). */
export function gastosPorCategoria(movimientos: readonly Movimiento[], categorias: readonly Categoria[], moneda: Moneda): FilaPorCategoria[] {
  return sumarPorCategoria(movimientos, categorias, moneda, "egreso").filter((f) => f.destino !== "ninguno");
}

/** Lo que entró o salió sin ser venta ni gasto (retiros, préstamos, aportes), por categoría. */
export function noEsVentaNiGasto(movimientos: readonly Movimiento[], categorias: readonly Categoria[], moneda: Moneda, tipo: "ingreso" | "egreso"): FilaPorCategoria[] {
  return sumarPorCategoria(movimientos, categorias, moneda, tipo).filter((f) => f.destino === "ninguno");
}

function sumarPorCategoria(movimientos: readonly Movimiento[], categorias: readonly Categoria[], moneda: Moneda, tipo: "ingreso" | "egreso"): FilaPorCategoria[] {
  const deCategoria = new Map(categorias.map((c) => [c.id, c]));
  const suma = new Map<string, number>();
  for (const m of movimientos) {
    if (m.moneda !== moneda || m.tipo !== tipo) continue;
    suma.set(m.categoria_id, (suma.get(m.categoria_id) ?? 0) + Number(m.monto));
  }
  return [...suma.entries()]
    .map(([id, monto]) => {
      const c = deCategoria.get(id);
      return { categoria_id: id, nombre: c?.nombre ?? "Sin categoría", destino: (c?.destino ?? "ninguno") as Destino, monto: Math.round(monto * 100) / 100 };
    })
    .sort((a, b) => b.monto - a.monto);
}

export type CifrasDelMes = { venta: number; costo_variable: number; gasto_fijo: number; libre: number };

/**
 * LAS CUATRO CIFRAS DEL INFORME, iguales a las de «Tus números»: si la base ya las escribió (company_metricas con
 * origen 'caja'), esas; si no, las mismas cuentas con los movimientos (soles, más los dólares al tipo de cambio del
 * cierre si el mes está cerrado). Así el informe nunca contradice lo que el dueño ve en «Tus números».
 */
export function cifrasDelMes(
  metricas: readonly { clave: string; valor: number | string | null }[],
  movimientos: readonly Movimiento[],
  categorias: readonly Categoria[],
  tipoCambio: number | null
): CifrasDelMes | null {
  const de = (clave: string) => {
    const f = metricas.find((m) => m.clave === clave);
    return f && f.valor != null ? Number(f.valor) : null;
  };
  const guardadas = { venta: de("venta_mes"), costo_variable: de("costo_variable_mes"), gasto_fijo: de("gasto_fijo_mes"), libre: de("ganancia_mes") };
  if (guardadas.venta != null && guardadas.costo_variable != null && guardadas.gasto_fijo != null && guardadas.libre != null) {
    return guardadas as CifrasDelMes;
  }
  if (!movimientos.length) return null;
  const t = totalesPorMoneda(movimientos, categorias);
  const tc = tipoCambio ?? 0;
  const r = (v: number) => Math.round(v * 100) / 100;
  const venta = r(t.PEN.venta + t.USD.venta * tc);
  const costo_variable = r(t.PEN.costo_variable + t.USD.costo_variable * tc);
  const gasto_fijo = r(t.PEN.gasto_fijo + t.USD.gasto_fijo * tc);
  return { venta, costo_variable, gasto_fijo, libre: libre({ venta, costo_variable, gasto_fijo }) };
}

/** ¿Una categoría admite este destino? Un ingreso es venta o nada; un egreso es costo, gasto o nada. */
export function destinoValido(tipo: "ingreso" | "egreso", destino: Destino): boolean {
  return tipo === "ingreso" ? destino === "venta" || destino === "ninguno" : destino !== "venta";
}

/** Qué significa cada destino, dicho para el dueño. */
export const EXPLICACION_DESTINO: Record<Destino, string> = {
  venta: "Lo que vendiste: suma en «Ventas del mes».",
  costo_variable: "Lo que gastas para vender (mercadería, fletes): sube si vendes más.",
  gasto_fijo: "Lo que pagas vendas o no (alquiler, sueldos, servicios).",
  ninguno: "Mueve la caja pero no es venta ni gasto (retiros, préstamos, aportes).",
};
