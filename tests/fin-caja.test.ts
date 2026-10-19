/**
 * FINANZAS · LAS CUENTAS DE LA CAJA Y DEL INFORME (src/lib/fin/caja-cuentas.ts). Qué mes se pide, qué fecha se propone,
 * si un mes está cerrado o se puede cerrar, el dinero en caja hoy, lo que se escribe como monto, las cuatro cifras del
 * informe (iguales a «Tus números») y en qué se fue el dinero. Nunca se suman soles con dólares sin tipo de cambio.
 */
import { describe, it, expect } from "vitest";
import {
  mesPedido, rangoDeMes, ultimoDiaDe, fechaPropuesta, fechaCorta, estadoDelMes, cajaHoy, variacion, leerMonto, cifrasDelMes,
  gastosPorCategoria, noEsVentaNiGasto, destinoValido, type Cierre,
} from "@/lib/fin/caja-cuentas";
import type { Categoria, Movimiento } from "@/lib/fin/calculos";

const HOY = "2026-10-19";

const cat = (id: string, tipo: "ingreso" | "egreso", destino: Categoria["destino"], nombre = id): Categoria => ({ id, nombre, tipo, destino, archivada: false, orden: 0 });
const CATS = [
  cat("ventas", "ingreso", "venta", "Ventas"),
  cat("prestamo", "ingreso", "ninguno", "Préstamo"),
  cat("mercaderia", "egreso", "costo_variable", "Mercadería"),
  cat("alquiler", "egreso", "gasto_fijo", "Alquiler"),
  cat("sueldos", "egreso", "gasto_fijo", "Sueldos"),
  cat("retiro", "egreso", "ninguno", "Retiro del dueño"),
];
let n = 0;
const mov = (categoria_id: string, monto: number, p: Partial<Movimiento> = {}): Movimiento => {
  const c = CATS.find((x) => x.id === categoria_id)!;
  return { id: `m${++n}`, fecha: "2026-10-05", tipo: c.tipo, categoria_id, monto, moneda: "PEN", detalle: null, origen: "manual", created_at: "", ...p };
};
const cierre = (p: Partial<Cierre>): Cierre => ({ id: "c", mes: "2026-09-01", tipo_cambio: null, fuente: null, cerrado_at: "2026-10-02T15:00:00Z", reabierto_at: null, motivo_reapertura: null, ...p });

describe("el mes que se mira", () => {
  it("toma ?mes= si es AAAA-MM válido; si no, el que corre", () => {
    expect(mesPedido("2026-09", HOY)).toBe("2026-09");
    expect(mesPedido(undefined, HOY)).toBe("2026-10");
    expect(mesPedido("2026-13", HOY)).toBe("2026-10");
    expect(mesPedido("septiembre", HOY)).toBe("2026-10");
  });
  it("su rango, su último día (con bisiestos) y la fecha que propone el formulario", () => {
    expect(rangoDeMes("2026-12")).toEqual({ desde: "2026-12-01", hastaExclusivo: "2027-01-01" });
    expect(ultimoDiaDe("2028-02")).toBe("2028-02-29");
    expect(ultimoDiaDe("2026-09")).toBe("2026-09-30");
    expect(fechaPropuesta("2026-10", HOY)).toBe(HOY);
    expect(fechaPropuesta("2026-09", HOY)).toBe("2026-09-30");
    expect(fechaPropuesta("2026-11", HOY)).toBe("2026-11-01");
  });
  it("las fechas se leen del texto, sin correrse por la zona horaria", () => {
    expect(fechaCorta("2026-10-01")).toBe("1 oct");
    expect(fechaCorta("2026-09-30", true)).toBe("30 set 2026");
  });
});

describe("abierto, cerrado o reabierto", () => {
  it("sin cierre: abierto, y se puede cerrar solo si ya terminó", () => {
    expect(estadoDelMes([], "2026-09", HOY)).toEqual({ estado: "abierto", reaperturas: [], sePuedeCerrar: true });
    expect(estadoDelMes([], "2026-10", HOY)).toMatchObject({ estado: "abierto", sePuedeCerrar: false });
  });
  it("el cierre vigente manda; los reabiertos quedan como historia, el más reciente primero", () => {
    const viejo = cierre({ id: "1", reabierto_at: "2026-10-05T10:00:00Z", motivo_reapertura: "faltó la luz" });
    const otro = cierre({ id: "2", reabierto_at: "2026-10-08T10:00:00Z", motivo_reapertura: "faltó el agua" });
    const vigente = cierre({ id: "3", tipo_cambio: "3.7500", fuente: "SBS" });
    const e = estadoDelMes([viejo, vigente, otro], "2026-09", HOY);
    expect(e.estado).toBe("cerrado");
    if (e.estado === "cerrado") {
      expect(e.cierre.id).toBe("3");
      expect(e.reaperturas.map((r) => r.id)).toEqual(["2", "1"]);
    }
    expect(estadoDelMes([viejo], "2026-09", HOY)).toMatchObject({ estado: "abierto", sePuedeCerrar: true, reaperturas: [viejo] });
  });
  it("un cierre de otro mes no cierra este", () => {
    expect(estadoDelMes([cierre({ mes: "2026-08-01" })], "2026-09", HOY).estado).toBe("abierto");
  });
});

describe("dinero en caja hoy", () => {
  const saldo = { id: "s", moneda: "PEN" as const, monto: "1000.00", fecha: "2026-10-01" };
  it("sin saldo inicial no se sabe: null, nunca un número inventado", () => {
    expect(cajaHoy(null, [mov("ventas", 500)], HOY)).toBeNull();
  });
  it("saldo + lo que entró − lo que salió, desde su fecha hasta hoy, en su moneda", () => {
    const movs = [
      mov("ventas", 500.5),
      mov("alquiler", 1200),
      mov("retiro", 100),
      mov("ventas", 999, { fecha: "2026-09-30" }), // antes del saldo
      mov("ventas", 999, { fecha: "2026-10-25" }), // después de hoy
      mov("ventas", 999, { moneda: "USD" }), // otra moneda
    ];
    expect(cajaHoy(saldo, movs, HOY)).toBe(200.5);
  });
});

describe("lo que el dueño escribe como monto", () => {
  it("entiende la coma de miles, la coma decimal y el símbolo", () => {
    expect(leerMonto("1,250.50")).toBe(1250.5);
    expect(leerMonto("1.250,50")).toBe(1250.5);
    expect(leerMonto("1250,5")).toBe(1250.5);
    expect(leerMonto("1,250")).toBe(1250);
    expect(leerMonto("12,5")).toBe(12.5);
    expect(leerMonto(" S/ 3 500 ")).toBe(3500);
    expect(leerMonto("80")).toBe(80);
  });
  it("lo que no es un número da null", () => {
    expect(leerMonto("")).toBeNull();
    expect(leerMonto("abc")).toBeNull();
    expect(leerMonto("1.2.3")).toBeNull();
    expect(leerMonto("-50")).toBeNull();
  });
});

describe("las cuatro cifras del informe", () => {
  const movs = [mov("ventas", 10000), mov("mercaderia", 3000), mov("alquiler", 1500), mov("sueldos", 2500), mov("retiro", 800), mov("prestamo", 5000)];
  it("con los movimientos: ventas − costos variables − gastos fijos; retiros y préstamos no cuentan", () => {
    expect(cifrasDelMes([], movs, CATS, null)).toEqual({ venta: 10000, costo_variable: 3000, gasto_fijo: 4000, libre: 3000 });
  });
  it("si «Tus números» ya las tiene (las escribió la caja), son esas", () => {
    const metricas = [
      { clave: "venta_mes", valor: "9000" },
      { clave: "costo_variable_mes", valor: "1000" },
      { clave: "gasto_fijo_mes", valor: "2000" },
      { clave: "ganancia_mes", valor: "6000" },
    ];
    expect(cifrasDelMes(metricas, movs, CATS, null)).toEqual({ venta: 9000, costo_variable: 1000, gasto_fijo: 2000, libre: 6000 });
  });
  it("si faltan algunas, se calculan todas (nunca mezcladas)", () => {
    expect(cifrasDelMes([{ clave: "venta_mes", valor: 1 }], movs, CATS, null)?.venta).toBe(10000);
  });
  it("los dólares solo suman con el tipo de cambio del cierre", () => {
    const conUSD = [...movs, mov("ventas", 1000, { moneda: "USD" })];
    expect(cifrasDelMes([], conUSD, CATS, null)?.venta).toBe(10000);
    expect(cifrasDelMes([], conUSD, CATS, 3.75)).toMatchObject({ venta: 13750, libre: 6750 });
  });
  it("sin movimientos ni cifras: null (no hay nada que contar)", () => {
    expect(cifrasDelMes([], [], CATS, null)).toBeNull();
  });
  it("la variación contra el mes anterior, sin dividir por cero", () => {
    expect(variacion(1200, 1000)).toBe(20);
    expect(variacion(800, 1000)).toBe(-20);
    expect(variacion(-500, -1000)).toBe(50);
    expect(variacion(100, 0)).toBeNull();
    expect(variacion(100, null)).toBeNull();
  });
});

describe("en qué se fue el dinero", () => {
  const movs = [mov("alquiler", 1500), mov("sueldos", 2500), mov("sueldos", 500), mov("mercaderia", 3000), mov("retiro", 800), mov("alquiler", 99, { moneda: "USD" }), mov("prestamo", 5000)];
  it("los gastos y costos por categoría, de mayor a menor y por moneda", () => {
    expect(gastosPorCategoria(movs, CATS, "PEN").map((f) => [f.nombre, f.monto])).toEqual([
      ["Sueldos", 3000],
      ["Mercadería", 3000],
      ["Alquiler", 1500],
    ]);
    expect(gastosPorCategoria(movs, CATS, "USD")).toEqual([{ categoria_id: "alquiler", nombre: "Alquiler", destino: "gasto_fijo", monto: 99 }]);
  });
  it("lo que no es venta ni gasto va aparte, entrado y salido", () => {
    expect(noEsVentaNiGasto(movs, CATS, "PEN", "egreso").map((f) => f.nombre)).toEqual(["Retiro del dueño"]);
    expect(noEsVentaNiGasto(movs, CATS, "PEN", "ingreso").map((f) => [f.nombre, f.monto])).toEqual([["Préstamo", 5000]]);
    expect(gastosPorCategoria(movs, CATS, "PEN").some((f) => f.nombre === "Retiro del dueño")).toBe(false);
  });
});

describe("a qué número puede ir una categoría", () => {
  it("un ingreso es venta o nada; un egreso es costo, gasto o nada", () => {
    expect(destinoValido("ingreso", "venta")).toBe(true);
    expect(destinoValido("ingreso", "ninguno")).toBe(true);
    expect(destinoValido("ingreso", "gasto_fijo")).toBe(false);
    expect(destinoValido("egreso", "venta")).toBe(false);
    expect(destinoValido("egreso", "costo_variable")).toBe(true);
    expect(destinoValido("egreso", "ninguno")).toBe(true);
  });
});
