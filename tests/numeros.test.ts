import { describe, it, expect } from "vitest";
import { VITALES, normalizarClave, normalizarMetrica, radiografia, derivados, PERIODO_DORADA, type Metrica } from "@/lib/metricas";
import { MESES, ultimosMeses, nombreDePeriodo } from "@/lib/temporadas";

const m = (clave: string, valor: number | null, periodo = "actual", estado = "contado"): Metrica => ({ clave, periodo, valor, estado });

/**
 * El vocabulario de los números. Auditoría del 30-08-2026: Qori tenía 18 números y solo 3 de los
 * nueve vitales porque la IA inventaba una clave distinta cada vez. Estas pruebas son la barrera.
 */
describe("vocabulario canónico", () => {
  it("los nueve vitales tienen clave, pregunta hablada y unidad", () => {
    expect(VITALES).toHaveLength(9);
    for (const v of VITALES) {
      expect(v.clave, v.nombre).toMatch(/^[a-z0-9_]+$/);
      expect(v.pregunta.length, v.clave).toBeGreaterThan(20);
      expect(v.pregunta, `${v.clave} debe preguntarse hablando`).toMatch(/\?/);
      expect(v.nombre, `${v.clave} no puede mostrar jerga al dueño`).not.toMatch(/_/);
    }
  });

  it("ninguna clave ni sinónimo se repite entre vitales", () => {
    const todas = VITALES.flatMap((v) => [v.clave, ...v.sinonimos]);
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("las variantes que inventaba la IA caen en su clave canónica", () => {
    expect(normalizarClave("utilidad_mes")).toBe("ganancia_mes");
    expect(normalizarClave("ganancia_neta_mes")).toBe("ganancia_mes");
    expect(normalizarClave("facturacion_mes")).toBe("venta_mes");
    expect(normalizarClave("cuentas_por_cobrar")).toBe("deuda_clientes");
    expect(normalizarClave("cuentas_por_pagar")).toBe("deuda_propia");
    expect(normalizarClave("efectivo_hoy")).toBe("caja_hoy");
  });

  it("limpia mayúsculas, espacios y basura sin romper la clave", () => {
    expect(normalizarClave("  Ventas Mes  ")).toBe("venta_mes");
    expect(normalizarClave("VENTA_MES")).toBe("venta_mes");
  });

  it("una clave que no es de los nueve se conserva tal cual: no se fuerza a encajar", () => {
    expect(normalizarClave("merma_semana")).toBe("merma_semana");
    expect(normalizarClave("citas_perdidas_10")).toBe("citas_perdidas_10");
  });

  it("el desglose por línea NO se confunde con el vital: el vital es siempre el total", () => {
    expect(normalizarClave("ganancia_mes_western_union")).not.toBe("ganancia_mes");
  });

  it("venta_epoca_dorada se guarda como venta_mes en el periodo dorado, no como clave aparte", () => {
    expect(normalizarMetrica("venta_epoca_dorada", "actual")).toEqual({ clave: "venta_mes", periodo: PERIODO_DORADA });
  });

  it("el periodo solo acepta AAAA-MM, el dorado o 'actual'", () => {
    expect(normalizarMetrica("venta_mes", "2026-07").periodo).toBe("2026-07");
    expect(normalizarMetrica("venta_mes", "el mes pasado").periodo).toBe("actual");
    expect(normalizarMetrica("venta_mes", "2026-13").periodo).toBe("actual");
  });
});

describe("la radiografía: qué falta", () => {
  it("sin ningún número faltan los nueve", () => {
    const r = radiografia([]);
    expect(r.listos).toBe(0);
    expect(r.faltan).toHaveLength(9);
    expect(r.completa).toBe(false);
  });

  it("cuenta los nueve aunque hayan entrado con nombres inventados", () => {
    const r = radiografia([
      m("facturacion_mes", 40000), m("utilidad_mes", 4000), m("efectivo_hoy", 8000),
      m("gasto_fijo_mes", 30000), m("precio_producto_estrella", 25), m("costo_producto_estrella", 15),
      m("conversion_de_cada_10", 3), m("cuentas_por_cobrar", 5000), m("cuentas_por_pagar", 12000),
    ]);
    expect(r.listos).toBe(9);
    expect(r.completa).toBe(true);
  });

  it("el caso real de Qori: muchos números, pocos vitales", () => {
    const r = radiografia([
      m("ganancia_mes_western_union", 5000), m("ganancia_mes_dhl", 1000),
      m("comision_banco_recibo", 5), m("adelanto_emergencia_max", 100),
      m("venta_mes", 40000), m("gasto_mes", 35000),
    ]);
    // Los desgloses no cuentan; venta_mes y gasto_fijo_mes (vía "gasto_mes") sí.
    expect(r.listos).toBe(2);
    expect(r.faltan).toHaveLength(7);
  });

  it("decir 'no lo sé' cuenta como respondido, pero queda marcado como hallazgo", () => {
    const r = radiografia([m("caja_hoy", null, "actual", "sin_dato")]);
    expect(r.listos).toBe(1);
    expect(r.sinDato.map((v) => v.clave)).toEqual(["caja_hoy"]);
    expect(r.faltan.some((v) => v.clave === "caja_hoy")).toBe(false);
  });

  it("un número con valor gana sobre un 'no lo sé' anterior", () => {
    const r = radiografia([m("caja_hoy", null, "actual", "sin_dato"), m("caja_hoy", 8000)]);
    expect(r.sinDato).toHaveLength(0);
    expect(r.listos).toBe(1);
  });

  it("cuenta los meses con venta: con menos de tres no hay curva", () => {
    const r = radiografia([m("venta_mes", 40000, "2026-05"), m("venta_mes", 38000, "2026-06"), m("venta_mes", 41000, "2026-07")]);
    expect(r.mesesConVenta).toBe(3);
  });

  it("el mismo mes repetido no infla la cuenta de meses", () => {
    const r = radiografia([m("venta_mes", 40000, "2026-07"), m("venta_mes", 41000, "2026-07")]);
    expect(r.mesesConVenta).toBe(1);
  });

  it("la época dorada no cuenta como mes de la serie", () => {
    const r = radiografia([m("venta_mes", 90000, PERIODO_DORADA)]);
    expect(r.mesesConVenta).toBe(0);
    expect(r.hayEpocaDorada).toBe(true);
  });
});

describe("lo que se calcula con los números", () => {
  const base = [
    m("venta_mes", 40000, "2026-07"), m("ganancia_mes", 4000, "2026-07"),
    m("gasto_fijo_mes", 12000, "2026-07"), m("precio_producto_estrella", 25),
    m("costo_producto_estrella", 15), m("caja_hoy", 8000),
  ];

  it("el margen es lo que queda de cada 100 soles vendidos", () => {
    expect(derivados(base).margen).toBeCloseTo(10, 5);
  });

  it("el punto de equilibrio usa el margen del producto estrella, no el promedio", () => {
    // margen unitario 40% → 12000 / 0.40 = 30000
    expect(derivados(base).margenUnitario).toBeCloseTo(40, 5);
    expect(derivados(base).equilibrio).toBeCloseTo(30000, 5);
  });

  it("dice cuántos días aguanta si mañana no entra nada", () => {
    // 8000 de caja contra 12000 de fijos = 20 días
    expect(derivados(base).diasAguante).toBeCloseTo(20, 5);
  });

  it("avisa cuando vende por debajo de su punto de equilibrio", () => {
    const flojo = derivados([...base.filter((x) => x.clave !== "venta_mes"), m("venta_mes", 20000, "2026-07")]);
    expect(flojo.sobreEquilibrio).toBeLessThan(0);
  });

  it("sin los insumos devuelve null en vez de inventar un número", () => {
    const d = derivados([m("venta_mes", 40000, "2026-07")]);
    expect(d.margen).toBeNull();
    expect(d.equilibrio).toBeNull();
    expect(d.diasAguante).toBeNull();
  });

  it("nunca divide entre cero aunque el negocio declare venta o precio en cero", () => {
    const d = derivados([m("venta_mes", 0, "2026-07"), m("ganancia_mes", 0, "2026-07"), m("precio_producto_estrella", 0), m("costo_producto_estrella", 0), m("gasto_fijo_mes", 5000)]);
    expect(d.margen).toBeNull();
    expect(d.equilibrio).toBeNull();
  });

  it("manda el mes más reciente, no el primero que aparezca", () => {
    const d = derivados([m("venta_mes", 10000, "2026-05"), m("venta_mes", 50000, "2026-07"), m("ganancia_mes", 5000, "2026-07")]);
    expect(d.margen).toBeCloseTo(10, 5);
  });

  it("la época dorada nunca se usa para calcular el presente", () => {
    const d = derivados([m("venta_mes", 90000, PERIODO_DORADA), m("venta_mes", 40000, "2026-07"), m("ganancia_mes", 4000, "2026-07")]);
    expect(d.margen).toBeCloseTo(10, 5);
  });
});

describe("calendario comercial peruano", () => {
  it("están los doce meses, con su nota de temporada", () => {
    expect(MESES).toHaveLength(12);
    for (const x of MESES) expect(x.nota.length, x.nombre).toBeGreaterThan(10);
  });

  it("julio y diciembre están marcados como los picos: gratificación", () => {
    expect(MESES.find((x) => x.nombre === "Julio")!.nota.toLowerCase()).toContain("gratificación");
    expect(MESES.find((x) => x.nombre === "Diciembre")!.nota.toLowerCase()).toContain("gratificación");
  });

  it("los meses ofrecidos son cerrados: nunca incluye el mes en curso", () => {
    const meses = ultimosMeses(new Date(2026, 7, 30), 3); // 30 de agosto de 2026
    expect(meses.map((x) => x.periodo)).toEqual(["2026-07", "2026-06", "2026-05"]);
  });

  it("cruza el año hacia atrás sin equivocarse", () => {
    const meses = ultimosMeses(new Date(2026, 0, 15), 2); // enero de 2026
    expect(meses.map((x) => x.periodo)).toEqual(["2025-12", "2025-11"]);
  });

  it("ningún periodo se le muestra al dueño como código", () => {
    expect(nombreDePeriodo("2026-07")).toBe("Julio 2026");
    expect(nombreDePeriodo(PERIODO_DORADA)).toBe("Su mejor época");
    expect(nombreDePeriodo("actual")).toBe("Hoy");
  });
});
