/**
 * FINANZAS · LAS CUENTAS SIN BASE (src/lib/fin/calculos.ts, 19-10-2026). Lo que se muestra en la caja, los cobros, los
 * pagos y el informe del mes:
 *  - los montos se escriben «S/ 1,250.50» o «US$ 1,200», con céntimos solo cuando los hay;
 *  - los meses se cuentan sin Date (diciembre + 1 es enero del año siguiente);
 *  - los totales van POR MONEDA y por destino de la categoría: nunca se suman soles con dólares;
 *  - «libre» es ventas − costos variables − gastos fijos (lo que no es venta ni gasto no entra);
 *  - el estado de un cobro: anulado manda, después pagado, vencido, vence pronto (7 días) y al día;
 *  - el mensaje de la base llega al dueño sin el «ERROR:» técnico.
 * Las reglas que no pueden fallar (mes cerrado, la caja manda, pagar en una sola operación) se prueban en la base:
 * tests/sql/finanzas.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  CLAVE_DE_DESTINO,
  NOMBRE_ESTADO_COBRO,
  NUMERO_DE_DESTINO,
  diasDeAtraso,
  estadoCobro,
  inicioDeMes,
  libre,
  mensajeDeLaBase,
  nombreDeMes,
  saldoDeCobro,
  sumarMeses,
  textoMonto,
  totalesPorMoneda,
  type Categoria,
  type Movimiento,
} from "@/lib/fin/calculos";

const cat = (id: string, tipo: Categoria["tipo"], destino: Categoria["destino"]): Categoria => ({ id, nombre: id, tipo, destino, archivada: false, orden: 0 });
const CATEGORIAS = [
  cat("tienda", "ingreso", "venta"),
  cat("prestamo", "ingreso", "ninguno"),
  cat("mercaderia", "egreso", "costo_variable"),
  cat("alquiler", "egreso", "gasto_fijo"),
  cat("retiro", "egreso", "ninguno"),
];
let n = 0;
const mov = (categoria_id: string, tipo: Movimiento["tipo"], monto: number | string, moneda: Movimiento["moneda"] = "PEN"): Movimiento => ({
  id: `m${++n}`, fecha: "2026-10-05", tipo, categoria_id, monto, moneda, detalle: null, origen: "manual", created_at: "2026-10-05T12:00:00Z",
});

describe("textoMonto: soles o dólares, céntimos solo si los hay", () => {
  it("soles por defecto y miles con coma", () => {
    expect(textoMonto(1250)).toBe("S/ 1,250");
    expect(textoMonto(1250.5)).toBe("S/ 1,250.50");
    expect(textoMonto("48320.00")).toBe("S/ 48,320");
  });
  it("dólares con US$, y lo que falta es cero, no «NaN»", () => {
    expect(textoMonto(1200, "USD")).toBe("US$ 1,200");
    expect(textoMonto(0.05, "USD")).toBe("US$ 0.05");
    expect(textoMonto(null)).toBe("S/ 0");
    expect(textoMonto(undefined, "USD")).toBe("US$ 0");
  });
});

describe("meses sin Date", () => {
  it("inicioDeMes: el primer día del mes de una fecha", () => {
    expect(inicioDeMes("2026-10-19")).toBe("2026-10-01");
    expect(inicioDeMes("2026-02-28")).toBe("2026-02-01");
  });
  it("sumarMeses cruza el año hacia adelante y hacia atrás", () => {
    expect(sumarMeses("2026-10", 1)).toBe("2026-11");
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(sumarMeses("2026-10", -22)).toBe("2024-12");
    expect(sumarMeses("2026-10", 0)).toBe("2026-10");
  });
  it("nombreDeMes en minúscula, con o sin el año", () => {
    expect(nombreDeMes("2026-09")).toBe("septiembre 2026");
    expect(nombreDeMes("2026-10", false)).toBe("octubre");
    expect(nombreDeMes("2027-01")).toBe("enero 2027");
  });
});

describe("totalesPorMoneda: nunca se suman soles con dólares", () => {
  const movimientos = [
    mov("tienda", "ingreso", 30000),
    mov("tienda", "ingreso", "15900.50"),
    mov("prestamo", "ingreso", 5000),
    mov("mercaderia", "egreso", 18000),
    mov("alquiler", "egreso", 3500),
    mov("retiro", "egreso", 2000),
    mov("tienda", "ingreso", 1200, "USD"),
    mov("mercaderia", "egreso", 300, "USD"),
  ];
  const t = totalesPorMoneda(movimientos, CATEGORIAS);

  it("cada moneda con su entró, salió y destinos", () => {
    expect(t.PEN).toEqual({ entro: 50900.5, salio: 23500, venta: 45900.5, costo_variable: 18000, gasto_fijo: 3500, ninguno_ingreso: 5000, ninguno_egreso: 2000 });
    expect(t.USD).toEqual({ entro: 1200, salio: 300, venta: 1200, costo_variable: 300, gasto_fijo: 0, ninguno_ingreso: 0, ninguno_egreso: 0 });
  });
  it("una categoría que no se conoce no alimenta ningún número (cuenta como «ninguno»)", () => {
    const x = totalesPorMoneda([mov("borrada", "ingreso", 700), mov("borrada", "egreso", 100)], CATEGORIAS);
    expect(x.PEN).toMatchObject({ entro: 700, salio: 100, venta: 0, ninguno_ingreso: 700, ninguno_egreso: 100 });
  });
  it("redondea a céntimos: 0.1 + 0.2 es 0.3", () => {
    const x = totalesPorMoneda([mov("tienda", "ingreso", 0.1), mov("tienda", "ingreso", 0.2)], CATEGORIAS);
    expect(x.PEN.venta).toBe(0.3);
    expect(x.PEN.entro).toBe(0.3);
  });
  it("sin movimientos, todo en cero en las dos monedas", () => {
    const x = totalesPorMoneda([], CATEGORIAS);
    expect(Object.values(x.PEN).every((v) => v === 0)).toBe(true);
    expect(Object.values(x.USD).every((v) => v === 0)).toBe(true);
  });
  it("libre: ventas − costos variables − gastos fijos; el préstamo y el retiro no entran", () => {
    expect(libre(t.PEN)).toBe(24400.5);
    expect(libre({ venta: 1000, costo_variable: 700, gasto_fijo: 600 })).toBe(-300);
  });
});

describe("destinos: a qué número de «Tus números» va cada categoría", () => {
  it("venta, costo variable y gasto fijo alimentan su clave; «ninguno» no alimenta nada", () => {
    expect(CLAVE_DE_DESTINO).toEqual({ venta: "venta_mes", costo_variable: "costo_variable_mes", gasto_fijo: "gasto_fijo_mes", ninguno: null });
    expect(NUMERO_DE_DESTINO.ninguno).toBe("No es venta ni gasto");
    expect(Object.keys(NUMERO_DE_DESTINO).sort()).toEqual(Object.keys(CLAVE_DE_DESTINO).sort());
  });
});

describe("cobros: saldo, estado y atraso", () => {
  const HOY = "2026-10-19";
  const cobro = (vence: string, total: number | string = 1000, anulado_at: string | null = null) => ({ vence, total, anulado_at });

  it("saldoDeCobro: el total menos lo pagado, nunca negativo y en céntimos", () => {
    expect(saldoDeCobro(1000, 400)).toBe(600);
    expect(saldoDeCobro("1000.00", 1000)).toBe(0);
    expect(saldoDeCobro(1000, 1200)).toBe(0);
    expect(saldoDeCobro(100.3, 0.1)).toBe(100.2);
  });
  it("anulado manda sobre todo, y pagado sobre la fecha", () => {
    expect(estadoCobro(cobro("2026-09-01", 1000, "2026-10-01T00:00:00Z"), 0, HOY)).toBe("anulado");
    expect(estadoCobro(cobro("2026-09-01"), 1000, HOY)).toBe("pagado");
  });
  it("vencido si la fecha ya pasó; vence pronto dentro de 7 días (hoy incluido); si no, al día", () => {
    expect(estadoCobro(cobro("2026-10-18"), 0, HOY)).toBe("vencido");
    expect(estadoCobro(cobro("2026-10-18"), 999, HOY)).toBe("vencido");
    expect(estadoCobro(cobro("2026-10-19"), 0, HOY)).toBe("vence_pronto");
    expect(estadoCobro(cobro("2026-10-26"), 0, HOY)).toBe("vence_pronto");
    expect(estadoCobro(cobro("2026-10-27"), 0, HOY)).toBe("al_dia");
  });
  it("vence pronto cruza el fin de mes", () => {
    expect(estadoCobro(cobro("2026-11-02"), 0, "2026-10-28")).toBe("vence_pronto");
  });
  it("cada estado tiene su nombre para la pantalla", () => {
    expect(Object.keys(NOMBRE_ESTADO_COBRO).sort()).toEqual(["al_dia", "anulado", "pagado", "vence_pronto", "vencido"]);
    expect(NOMBRE_ESTADO_COBRO.vence_pronto).toBe("Vence pronto");
  });
  it("diasDeAtraso: 0 si no está vencido; los días contados en calendario si lo está", () => {
    expect(diasDeAtraso("2026-10-19", HOY)).toBe(0);
    expect(diasDeAtraso("2026-10-30", HOY)).toBe(0);
    expect(diasDeAtraso("2026-10-18", HOY)).toBe(1);
    expect(diasDeAtraso("2026-09-19", HOY)).toBe(30);
    expect(diasDeAtraso("2025-10-19", HOY)).toBe(365);
  });
});

describe("mensajeDeLaBase: la frase de la base, sin el ruido técnico", () => {
  it("quita «ERROR:» y los espacios", () => {
    expect(mensajeDeLaBase({ message: "ERROR:  Septiembre 2026 está cerrado: reábrelo para cambiarlo. " })).toBe("Septiembre 2026 está cerrado: reábrelo para cambiarlo.");
    expect(mensajeDeLaBase({ message: "error: el pago supera lo que falta cobrar" })).toBe("el pago supera lo que falta cobrar");
  });
  it("sin mensaje, la frase genérica o la que se pida", () => {
    expect(mensajeDeLaBase(null)).toBe("No se pudo guardar. Vuelve a intentarlo.");
    expect(mensajeDeLaBase({ message: "  " })).toBe("No se pudo guardar. Vuelve a intentarlo.");
    expect(mensajeDeLaBase(undefined, "No se pudo pagar.")).toBe("No se pudo pagar.");
  });
});
