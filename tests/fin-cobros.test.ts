import { describe, expect, it } from "vitest";
import type { Cobro } from "@/lib/fin/calculos";
import {
  cobradoEnMes,
  conEstado,
  diasPromedioDeCobro,
  estadoPago,
  ordenarCobros,
  pagadoEnMes,
  pagadoPorCobro,
  porPagarHastaFinDeMes,
  textoVencimiento,
  totalesDeCobros,
  ultimoHecho,
} from "@/lib/fin/cobros";
import { aMonto } from "@/components/fin/cobros/enviar";

/**
 * FINANZAS · COBROS Y PAGOS QUE SE REPITEN (19-10-2026): las cuentas puras de src/lib/fin/cobros.ts. Lo que la base
 * impide (cobrar de más, fecha futura, mes cerrado) se prueba en tests/sql/finanzas.test.ts; aquí, lo que se MUESTRA.
 */
const HOY = "2026-10-19";
const cobro = (id: string, o: Partial<Cobro> = {}): Cobro => ({
  id, cliente: `Cliente ${id}`, concepto: null, total: 1000, moneda: "PEN", emitido: "2026-09-01", vence: "2026-10-01", categoria_id: "cat", anulado_at: null, ...o,
});
const pago = (cobro_id: string, monto: number, fecha: string) => ({ id: `${cobro_id}-${fecha}-${monto}`, cobro_id, monto, fecha, medio: null, created_at: fecha });

describe("lo que te deben, por moneda", () => {
  const cobros = [
    cobro("a", { total: 1000, vence: "2026-10-10" }), // vencido, pagó 400
    cobro("b", { total: 500, vence: "2026-10-25" }), // vence pronto
    cobro("c", { total: 200, moneda: "USD", vence: "2026-10-05" }), // vencido en dólares
    cobro("d", { total: 300 }), // pagado completo
    cobro("e", { total: 900, anulado_at: "2026-10-02T00:00:00Z" }), // anulado: no cuenta
  ];
  const pagos = [pago("a", 400, "2026-10-12"), pago("d", 300, "2026-09-20")];
  const con = conEstado(cobros, pagadoPorCobro(pagos), HOY);

  it("cada cobro sabe lo que falta, su estado y su atraso", () => {
    const a = con.find((x) => x.id === "a")!;
    expect([a.saldo, a.estado, a.atraso]).toEqual([600, "vencido", 9]);
    expect(con.find((x) => x.id === "d")!.estado).toBe("pagado");
    expect(con.find((x) => x.id === "e")!.saldo).toBe(0);
  });

  it("soles y dólares nunca se suman; lo pagado y lo anulado no entran", () => {
    const t = totalesDeCobros(con);
    expect(t.deben).toEqual({ PEN: 1100, USD: 200 });
    expect(t.vencido).toEqual({ PEN: 600, USD: 200 });
    expect(t.abiertos).toBe(3);
    expect(t.clientesAtrasados).toBe(2);
  });

  it("lo más atrasado va arriba y lo anulado al fondo", () => {
    expect(ordenarCobros(con).map((x) => x.id)).toEqual(["c", "a", "b", "d", "e"]);
  });

  it("lo cobrado este mes cuenta solo los pagos de este mes, en su moneda", () => {
    expect(cobradoEnMes([...pagos, pago("c", 50, "2026-10-18")], cobros, "2026-10")).toEqual({ PEN: 400, USD: 50 });
  });
});

describe("cuánto tardas en cobrar (últimos 90 días)", () => {
  it("sin cobros que medir no hay promedio: null, no un cero inventado", () => {
    expect(diasPromedioDeCobro([], [], HOY)).toEqual({ dias: null, cobros: 0 });
    const alDia = conEstado([cobro("x", { vence: "2026-11-30" })], new Map(), HOY);
    expect(diasPromedioDeCobro(alDia, [], HOY).dias).toBeNull();
  });

  it("un pagado cuenta desde la emisión hasta su ÚLTIMO pago", () => {
    const cs = [cobro("a", { emitido: "2026-09-01", total: 1000 })];
    const ps = [pago("a", 500, "2026-09-11"), pago("a", 500, "2026-09-21")];
    expect(diasPromedioDeCobro(conEstado(cs, pagadoPorCobro(ps), HOY), ps, HOY)).toEqual({ dias: 20, cobros: 1 });
  });

  it("el que no paga también sube el promedio: un vencido abierto cuenta hasta hoy", () => {
    const cs = [cobro("a", { emitido: "2026-09-01", total: 100 }), cobro("b", { emitido: "2026-09-19", vence: "2026-10-01", total: 100 })];
    const ps = [pago("a", 100, "2026-09-11")];
    // a: 10 días; b: del 19-09 a hoy (19-10), 30 días → promedio 20
    expect(diasPromedioDeCobro(conEstado(cs, pagadoPorCobro(ps), HOY), ps, HOY)).toEqual({ dias: 20, cobros: 2 });
  });

  it("un pagado hace más de 90 días ya no entra; un anulado nunca", () => {
    const cs = [cobro("viejo", { emitido: "2026-05-01", vence: "2026-05-31", total: 100 }), cobro("x", { anulado_at: "2026-10-01T00:00:00Z" })];
    const ps = [pago("viejo", 100, "2026-06-15")];
    expect(diasPromedioDeCobro(conEstado(cs, pagadoPorCobro(ps), HOY), ps, HOY).dias).toBeNull();
  });
});

describe("el estado de un pago que se repite", () => {
  it("vencido, vence hoy, vence pronto (7 días) o al día", () => {
    expect(estadoPago("2026-10-18", HOY)).toBe("vencido");
    expect(estadoPago(HOY, HOY)).toBe("vence_hoy");
    expect(estadoPago("2026-10-26", HOY)).toBe("vence_pronto");
    expect(estadoPago("2026-10-27", HOY)).toBe("al_dia");
  });

  it("se lee en palabras", () => {
    expect(textoVencimiento("2026-10-16", HOY)).toBe("Venció hace 3 días");
    expect(textoVencimiento("2026-10-18", HOY)).toBe("Venció ayer");
    expect(textoVencimiento(HOY, HOY)).toBe("Vence hoy");
    expect(textoVencimiento("2026-10-20", HOY)).toBe("Vence mañana");
    expect(textoVencimiento("2026-10-28", HOY)).toBe("Vence en 9 días");
    expect(textoVencimiento("2026-11-05", HOY)).toBe("Vence el 5 nov");
  });

  it("cruza bien el cambio de año", () => {
    expect(estadoPago("2027-01-02", "2026-12-28")).toBe("vence_pronto");
  });
});

describe("lo que vence hasta fin de mes y lo pagado", () => {
  const pagos = [
    { id: "alq", monto: 2400, moneda: "PEN" as const, proximo_vencimiento: "2026-10-05", activo: true }, // vencido sin pagar: entra
    { id: "luz", monto: 180.5, moneda: "PEN" as const, proximo_vencimiento: "2026-10-31", activo: true },
    { id: "sw", monto: 50, moneda: "USD" as const, proximo_vencimiento: "2026-10-25", activo: true },
    { id: "nov", monto: 900, moneda: "PEN" as const, proximo_vencimiento: "2026-11-01", activo: true }, // el mes que viene: no
    { id: "baja", monto: 700, moneda: "PEN" as const, proximo_vencimiento: "2026-10-10", activo: false }, // de baja: no
  ];

  it("incluye lo ya vencido, separa monedas y deja fuera lo de baja y lo del mes que viene", () => {
    expect(porPagarHastaFinDeMes(pagos, HOY)).toEqual({ total: { PEN: 2580.5, USD: 50 }, cuantos: 3 });
  });

  it("en diciembre, el tope es el 1 de enero", () => {
    expect(porPagarHastaFinDeMes([{ monto: 10, moneda: "PEN", proximo_vencimiento: "2026-12-31", activo: true }], "2026-12-15").cuantos).toBe(1);
  });

  it("lo pagado en el mes va por la fecha del pago y en la moneda del pago que se repite", () => {
    const hechos = [
      { pago_id: "alq", monto: 2400, fecha: "2026-09-30" },
      { pago_id: "luz", monto: 175, fecha: "2026-10-02" },
      { pago_id: "sw", monto: 50, fecha: "2026-10-03" },
    ];
    expect(pagadoEnMes(hechos, pagos, "2026-10")).toEqual({ PEN: 175, USD: 50 });
  });

  it("solo el último pago hecho se puede anular", () => {
    expect(ultimoHecho([{ id: "1", ciclo: "2026-08-05" }, { id: "3", ciclo: "2026-10-05" }, { id: "2", ciclo: "2026-09-05" }])?.id).toBe("3");
    expect(ultimoHecho([])).toBeNull();
  });
});

describe("el monto que escribe el dueño", () => {
  it("acepta comas de miles, coma decimal y el símbolo; rechaza cero y basura", () => {
    expect(aMonto("1,250.50")).toBe(1250.5);
    expect(aMonto("1250,5")).toBe(1250.5);
    expect(aMonto("S/ 980")).toBe(980);
    expect(aMonto("0")).toBeNull();
    expect(aMonto("abc")).toBeNull();
  });
});
