import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// LOS DOBLES DE ABAJO SOLO SIRVEN A LA SECCIÓN «CIERRE Z3», que pinta la página «Tus números» entera. Todo lo
// demás de este archivo es regla pura o lectura de archivos y no toca nada de esto. No hay base real:
// `supabaseAdmin()` es una tabla en memoria que filtra con los .eq/.neq/.in recibidos; la sesión del portal
// se aparta (no hay cookies ni navegador) y `next/link` se pinta como un enlace normal.
const memoria = vi.hoisted(() => ({ tablas: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase/admin", () => {
  type F = Record<string, unknown>;
  const consulta = (tabla: string) => {
    const filtros: ((f: F) => boolean)[] = [];
    const filas = () => (memoria.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
    const q = {
      select: () => q, order: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return q; },
      neq: (k: string, v: unknown) => { filtros.push((f) => f[k] !== v); return q; },
      in: (k: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[k])); return q; },
      single: async () => ({ data: filas()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
      then: (res: (v: { data: F[]; error: null }) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: filas(), error: null }).then(res, rej),
    };
    return q;
  };
  return { supabaseAdmin: () => ({ from: consulta }) };
});
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => ({ companyId: "emp-1", queFalta: null }) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, className, style }: { href: string; children?: unknown; className?: string; style?: Record<string, unknown> }) => createElement("a", { href, className, style }, children as never) };
});

import {
  VITALES, RECONOCIDAS, CLAVES_VITALES, CLAVES_RECONOCIDAS, normalizarClave, normalizarMetrica, radiografia, derivados, etiquetaEstado,
  PERIODO_DORADA, MOTIVO_EQUILIBRIO_SIN_COSTO_VARIABLE, MOTIVO_EQUILIBRIO_COSTO_VARIABLE_CERO, LIMITACION_COSTO_VARIABLE_CERO, periodoEnPalabras, type Metrica,
  MOTIVO_EQUILIBRIO_GASTO_FIJO_CERO, LIMITACION_GASTO_FIJO_CERO, LIMITACION_NUMERO_EXTRAIDO,
  aNumero, cuerpoDeNumeros, filasDeNumeros, costoVariableDeclarado, claveAceptada, type FormularioNumeros,
  ROTULO_CIFRA_PROVISIONAL, MOTIVO_EQUILIBRIO_COSTO_VARIABLE_NO_SABE,
  lecturaDeCampo, revisarNumerosEscritos, campoDeValor, campoDeMes, AVISO_NUMERO_NO_ENTENDIDO, AVISO_FALTA_EL_MES,
  AVISO_NUMERO_NEGATIVO, AVISO_PERDIDA, serieDeVentas, vitalesSoloDeDocumento,
} from "@/lib/metricas";
import { TarjetaNumeros } from "@/components/cliente/TarjetaNumeros";
import { MisNumeros } from "@/components/cliente/MisNumeros";
import { MESES, ultimosMeses, nombreDePeriodo } from "@/lib/temporadas";
import { explicarCalculo } from "@/lib/finanzas";

const m = (clave: string, valor: number | null, periodo = "actual", estado = "contado"): Metrica => ({ clave, periodo, valor, estado });

/**
 * El vocabulario de los números. Auditoría del 30-08-2026: una empresa tenía 18 números y solo 3 de los
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
    expect(normalizarMetrica("venta_epoca_dorada", "actual")).toEqual({ clave: "venta_mes", periodo: PERIODO_DORADA, vital: true });
  });

  it("una clave que no es de los nueve PASA con la marca vital en false: no se pierde", () => {
    expect(normalizarMetrica("merma_semana", "2026-07")).toEqual({ clave: "merma_semana", periodo: "2026-07", vital: false });
    expect(normalizarMetrica("Ventas Mes", "2026-07").vital).toBe(true);
  });

  it("costo_variable_mes es reconocida (con sinónimos) pero NO vital: no cuenta para los nueve", () => {
    expect(normalizarClave("costos_variables_mes")).toBe("costo_variable_mes");
    expect(normalizarClave("costo_variable")).toBe("costo_variable_mes");
    expect(CLAVES_VITALES.has("costo_variable_mes")).toBe(false);
    expect(normalizarMetrica("costo_variable_mes", "2026-07").vital).toBe(false);
  });

  it("ningún sinónimo de las reconocidas choca con los vitales", () => {
    const vitales = new Set(VITALES.flatMap((v) => [v.clave, ...v.sinonimos]));
    for (const r of RECONOCIDAS) for (const s of [r.clave, ...r.sinonimos]) expect(vitales.has(s), s).toBe(false);
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

  it("un caso real: muchos números, pocos vitales", () => {
    const r = radiografia([
      m("ganancia_mes_western_union", 5000), m("ganancia_mes_dhl", 1000),
      m("comision_banco_recibo", 5), m("adelanto_emergencia_max", 100),
      m("venta_mes", 40000), m("gasto_mes", 35000),
    ]);
    // Los desgloses no cuentan; venta_mes y gasto_fijo_mes (vía "gasto_mes") sí.
    expect(r.listos).toBe(2);
    expect(r.faltan).toHaveLength(7);
    // ...pero ya no se descartan: quedan como «otros números de la empresa», con nombre legible.
    expect(r.otros.map((o) => o.clave)).toEqual(["adelanto_emergencia_max", "comision_banco_recibo", "ganancia_mes_dhl", "ganancia_mes_western_union"]);
    expect(r.otros[3]!.nombre).toBe("ganancia mes western union");
    expect(r.otros[3]!.valor).toBe(5000);
  });

  it("lo extraído de un documento se rotula «pendiente de conciliar», nunca «verificado»", () => {
    expect(etiquetaEstado("extraido")).toBe("extraído, pendiente de conciliar");
    expect(etiquetaEstado("extraido")).not.toContain("verificado");
    expect(etiquetaEstado("contado")).toBe("contado de memoria");
    expect(etiquetaEstado("verificado")).toBe("verificado");
    expect(etiquetaEstado(null)).toBe("sin rotular");
    const r = radiografia([m("merma_semana", 300, "2026-07", "extraido"), m("costo_variable_mes", 24000, "2026-07", "extraido")]);
    expect(r.otros.map((o) => o.etiquetaEstado)).toEqual(["extraído, pendiente de conciliar", "extraído, pendiente de conciliar"]);
    expect(r.otros.find((o) => o.clave === "costo_variable_mes")!.nombre).toBe("Costos variables del mes");
    expect(r.otros.find((o) => o.clave === "costo_variable_mes")!.reconocida).toBe(true);
    expect(r.listos).toBe(0);
  });

  it("un número descartado al revisar la extracción se rotula así, nunca «sin rotular», y no entra en ningún cálculo", () => {
    expect(etiquetaEstado("descartado")).toBe("descartado al revisar la extracción");
    expect(etiquetaEstado("descartado")).not.toContain("sin rotular");
    // El consolidador vacía el valor y deja el estado: el rastro queda, el número no cuenta.
    const r = radiografia([m("costo_variable_mes", null, "2026-07", "descartado"), m("gasto_fijo_mes", null, "2026-07", "descartado")]);
    expect(r.otros[0]!.etiquetaEstado).toBe("descartado al revisar la extracción");
    expect(r.listos).toBe(0);
    expect(r.sinDato).toHaveLength(0);
    const d = derivados([m("venta_mes", 40000, "2026-07"), m("gasto_fijo_mes", 12000, "2026-07"), m("costo_variable_mes", null, "2026-07", "descartado")]);
    expect(d.equilibrio).toBeNull();
    expect(d.detalle.equilibrio.motivo_nulo).toBe(MOTIVO_EQUILIBRIO_SIN_COSTO_VARIABLE);
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

  it("el equilibrio de la EMPRESA no sale del producto estrella: sin costos variables es null, con motivo", () => {
    const d = derivados(base);
    expect(d.margenUnitario).toBeCloseTo(40, 5);
    expect(d.equilibrio).toBeNull();
    expect(d.detalle.equilibrio.motivo_nulo).toBe(MOTIVO_EQUILIBRIO_SIN_COSTO_VARIABLE);
    // La cifra de antes (12000 / 0,40 = 30000) se conserva, pero bajo su nombre: hipótesis.
    expect(d.equilibrioProductoEstrella).toBeCloseTo(30000, 5);
    expect(d.detalle.equilibrioProductoEstrella.supuestos.join(" ").toLowerCase()).toContain("hipótesis: toda la venta fuera ese producto");
  });

  it("con los costos variables del mes sí hay equilibrio de empresa: fijos / lo que queda de cada sol vendido, dicho sin jerga", () => {
    // ventas 40000, costos variables 28000 → razón 0,30 → 12000 / 0,30 = 40000 (≠ 30000 del producto estrella)
    const d = derivados([...base, m("costo_variable_mes", 28000, "2026-07")]);
    expect(d.equilibrio).toBeCloseTo(40000, 5);
    expect(d.detalle.equilibrio.formula).toContain("lo que queda de cada sol vendido después de pagar lo que cuesta lo vendido");
    // Todo lo que el dueño despliega en «Cómo se calculó» de esta cifra, sin la jerga contable.
    expect(explicarCalculo(d.detalle.equilibrio).map((l) => l.texto).join(" ")).not.toMatch(/razón de margen|margen de contribución/i);
    expect(d.detalle.equilibrio.fuentes.some((f) => f.includes("Costos variables del mes") && f.includes("Julio 2026"))).toBe(true);
    expect(d.detalle.equilibrio.motivo_nulo).toBeUndefined();
  });

  it("nunca usa la utilidad sobre ventas como razón: Modas Lucero no da 155.000", () => {
    const lucero = [m("venta_mes", 80000, "2026-08"), m("ganancia_mes", 8000, "2026-08"), m("gasto_fijo_mes", 15500, "2026-08")];
    const d = derivados(lucero);
    expect(d.margen).toBeCloseTo(10, 5); // lo declarado: 8000 de cada 80000
    expect(d.equilibrio).toBeNull(); // y no 15500 / 0,10 = 155000
    expect(d.sobreEquilibrio).toBeNull();
  });

  it("ventas y costos variables de meses distintos no se mezclan", () => {
    const d = derivados([...base, m("costo_variable_mes", 28000, "2026-06")]);
    expect(d.equilibrio).toBeNull();
    expect(d.detalle.equilibrio.motivo_nulo).toContain("mismo mes");
  });

  it("los gastos fijos de OTRO mes no entran en la división: null, con los dos meses en palabras y la salida", () => {
    // Antes: venta y costos variables de julio, fijos de junio → 12000 / 0,30 = 40000 sin aviso.
    const d = derivados([m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 28000, "2026-07"), m("gasto_fijo_mes", 12000, "2026-06")]);
    expect(d.equilibrio).toBeNull();
    expect(d.sobreEquilibrio).toBeNull();
    const motivo = d.detalle.equilibrio.motivo_nulo ?? "";
    expect(motivo).toContain("julio de 2026");
    expect(motivo).toContain("junio de 2026");
    expect(motivo).toContain("mismo mes");
    expect(motivo).toContain("gastos fijos");
    expect(motivo).not.toMatch(/\d{4}-\d{2}/);
  });

  it("los gastos fijos declarados como los de hoy sí sirven para un mes fechado, con la limitación a la vista", () => {
    // Es como los pone el dueño en Tus números: «lo que pago sí o sí», sin mes.
    const d = derivados([m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 28000, "2026-07"), m("gasto_fijo_mes", 12000, "actual")]);
    expect(d.equilibrio).toBeCloseTo(40000, 5);
    const limitaciones = d.detalle.equilibrio.limitaciones.join(" ");
    expect(limitaciones).toContain("mes actual");
    expect(limitaciones).toContain("julio de 2026");
    expect(limitaciones).not.toContain("orientativa");
  });

  it("si hay fijos del mismo mes, «de hoy» y de otro mes, manda el del mismo mes", () => {
    const d = derivados([
      m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 28000, "2026-07"),
      m("gasto_fijo_mes", 5000, "2026-06"), m("gasto_fijo_mes", 9000, "actual"), m("gasto_fijo_mes", 12000, "2026-07"),
    ]);
    expect(d.equilibrio).toBeCloseTo(40000, 5);
    expect(d.detalle.equilibrio.limitaciones.join(" ")).not.toContain("mes actual");
    // Y si no hay del mismo mes, «de hoy» gana sobre el de otro mes (que haría null).
    const sinJulio = derivados([m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 28000, "2026-07"), m("gasto_fijo_mes", 5000, "2026-06"), m("gasto_fijo_mes", 12000, "actual")]);
    expect(sinJulio.equilibrio).toBeCloseTo(40000, 5);
  });

  it("exigir el mismo mes en el equilibrio no cambia «cuánto aguantas» ni la hipótesis: ahí mandan los fijos más recientes", () => {
    // Venta de julio; fijos de julio (12000) y de setiembre (18000). El equilibrio cruza julio con
    // julio; el aguante y la hipótesis se miden contra lo que se paga hoy, como antes del cambio.
    const d = derivados([
      m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 28000, "2026-07"),
      m("gasto_fijo_mes", 12000, "2026-07"), m("gasto_fijo_mes", 18000, "2026-09"),
      m("caja_hoy", 9000), m("precio_producto_estrella", 25), m("costo_producto_estrella", 15),
    ]);
    expect(d.equilibrio).toBeCloseTo(40000, 5); // 12000 / 0,30
    expect(d.detalle.equilibrio.fuentes.some((f) => f.includes("Gastos fijos del mes") && f.includes("Julio 2026"))).toBe(true);
    expect(d.diasAguante).toBeCloseTo(15, 5); // 9000 / 18000 × 30
    expect(d.detalle.diasAguante.fuentes.some((f) => f.includes("Gastos fijos del mes") && f.includes("Setiembre 2026"))).toBe(true);
    expect(d.equilibrioProductoEstrella).toBeCloseTo(45000, 5); // 18000 / 0,40
  });

  it("costos variables en cero no son un dato: null, y la limitación dice que el cero se trata como sin dato", () => {
    // Antes: razón (40000 − 0) / 40000 = 1 → equilibrio = fijos = 12000, exacto y falso.
    const d = derivados([m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 0, "2026-07"), m("gasto_fijo_mes", 12000, "2026-07")]);
    expect(d.equilibrio).toBeNull();
    expect(d.equilibrio).not.toBe(12000);
    expect(d.detalle.equilibrio.limitaciones.join(" ")).toContain("cero se trata como sin dato");
    expect(d.detalle.equilibrio.limitaciones).toEqual([LIMITACION_COSTO_VARIABLE_CERO]);
    expect(LIMITACION_COSTO_VARIABLE_CERO).toContain("cero se trata como sin dato");
    // El motivo dice qué pasó y qué hace falta; no repite la limitación palabra por palabra.
    expect(d.detalle.equilibrio.motivo_nulo).toBe(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_CERO);
    expect(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_CERO).toContain("cero");
    expect(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_CERO).not.toBe(LIMITACION_COSTO_VARIABLE_CERO);
    expect(d.sobreEquilibrio).toBeNull();
    // Con un costo variable de verdad la misma empresa sí tiene equilibrio.
    expect(derivados([m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 28000, "2026-07"), m("gasto_fijo_mes", 12000, "2026-07")]).equilibrio).toBeCloseTo(40000, 5);
  });

  it("los motivos de periodos distintos hablan en meses, no en códigos: «agosto de 2026» y «el mes actual»", () => {
    const d = derivados([m("venta_mes", 80000, "2026-08"), m("costo_variable_mes", 52000, "actual"), m("gasto_fijo_mes", 15500, "2026-08")]);
    expect(d.equilibrio).toBeNull();
    const motivo = d.detalle.equilibrio.motivo_nulo ?? "";
    expect(motivo).toContain("agosto de 2026");
    expect(motivo).toContain("el mes actual");
    expect(motivo).toContain("mismo mes");
    expect(motivo).not.toMatch(/2026-08|\(actual\)|periodos distintos/);
    expect(periodoEnPalabras("2026-09")).toBe("setiembre de 2026");
    expect(periodoEnPalabras("actual")).toBe("el mes actual");
    expect(periodoEnPalabras(PERIODO_DORADA)).toBe("su mejor época");
  });

  it("dice cuántos días aguanta si mañana no entra nada", () => {
    // 8000 de caja contra 12000 de fijos = 20 días
    expect(derivados(base).diasAguante).toBeCloseTo(20, 5);
  });

  it("avisa cuando vende por debajo de su punto de equilibrio (el de la empresa)", () => {
    // ventas 20000, costos variables 14000 → razón 0,30 → equilibrio 40000 → le faltan 20000
    const flojo = derivados([...base.filter((x) => x.clave !== "venta_mes"), m("venta_mes", 20000, "2026-07"), m("costo_variable_mes", 14000, "2026-07")]);
    expect(flojo.sobreEquilibrio).toBeCloseTo(-20000, 5);
  });

  it("sin los insumos devuelve null en vez de inventar un número", () => {
    const d = derivados([m("venta_mes", 40000, "2026-07")]);
    expect(d.margen).toBeNull();
    expect(d.equilibrio).toBeNull();
    expect(d.equilibrioProductoEstrella).toBeNull();
    expect(d.diasAguante).toBeNull();
  });

  it("nunca divide entre cero aunque el negocio declare venta o precio en cero", () => {
    const d = derivados([m("venta_mes", 0, "2026-07"), m("ganancia_mes", 0, "2026-07"), m("precio_producto_estrella", 0), m("costo_producto_estrella", 0), m("gasto_fijo_mes", 5000), m("costo_variable_mes", 0, "2026-07")]);
    expect(d.margen).toBeNull();
    expect(d.equilibrio).toBeNull();
    expect(d.equilibrioProductoEstrella).toBeNull();
  });

  it("cada cifra derivada trae fórmula, periodo y fuentes legibles para el dueño", () => {
    const d = derivados([...base, m("costo_variable_mes", 28000, "2026-07")]);
    for (const [nombre, c] of Object.entries(d.detalle)) {
      expect(c.formula.length, nombre).toBeGreaterThan(20);
      expect(c.periodo, nombre).not.toMatch(/^\d{4}-\d{2}$/); // "Julio 2026", no "2026-07"
      for (const f of c.fuentes) expect(f, `${nombre}: ${f}`).not.toMatch(/_/);
    }
    expect(d.detalle.diasAguante.fuentes).toContain("Dinero en caja hoy · Hoy · contado de memoria");
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

/**
 * REPAROS DEL VERIFICADOR (13-10-2026) sobre el equilibrio: un cero en gastos fijos daba «S/0» y
 * «por encima»; los motivos de la fórmula le llegaban crudos al dueño; una cifra con un insumo
 * extraído salía como firme; un descartado con valor habría entrado al cálculo.
 */
describe("el equilibrio no acepta ceros, no habla en jerga y rotula lo provisional", () => {
  const julio = [m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 28000, "2026-07")];

  it("gastos fijos en cero no son un dato: null con motivo, nunca S/0 ni «por encima»", () => {
    const d = derivados([...julio, m("gasto_fijo_mes", 0, "2026-07")]);
    expect(d.equilibrio).toBeNull();
    expect(d.sobreEquilibrio).toBeNull();
    expect(d.detalle.equilibrio.motivo_nulo).toBe(MOTIVO_EQUILIBRIO_GASTO_FIJO_CERO);
    expect(d.detalle.equilibrio.limitaciones).toEqual([LIMITACION_GASTO_FIJO_CERO]);
    expect(LIMITACION_GASTO_FIJO_CERO).toContain("cero se trata como sin dato");
  });

  it("un cero del mes de la venta no le gana a los fijos «de hoy»: se usan los 12.000 y se dice que el cero no se usó", () => {
    const d = derivados([...julio, m("gasto_fijo_mes", 0, "2026-07"), m("gasto_fijo_mes", 12000, "actual")]);
    expect(d.equilibrio).toBeCloseTo(40000, 5); // 12000 / 0,30 — antes: 0 / 0,30 = S/0
    expect(d.sobreEquilibrio).toBeCloseTo(0, 5);
    const limitaciones = d.detalle.equilibrio.limitaciones.join(" ");
    expect(limitaciones).toContain("anotados en cero y no se usaron");
    expect(limitaciones).toContain("julio de 2026");
    expect(limitaciones).toContain("mes actual");
  });

  it("con fijos en cero tampoco hay hipótesis del producto estrella ni «cuánto aguantas»: null, no S/0", () => {
    const d = derivados([m("gasto_fijo_mes", 0), m("precio_producto_estrella", 25), m("costo_producto_estrella", 15), m("caja_hoy", 8000)]);
    expect(d.equilibrioProductoEstrella).toBeNull();
    expect(d.detalle.equilibrioProductoEstrella.motivo_nulo).toContain("gastos fijos en cero");
    expect(d.diasAguante).toBeNull();
  });

  it("si lo que cuesta lo vendido iguala o supera la venta, el motivo habla como el dueño: sin «razón»", () => {
    for (const costo of [40000, 52000]) {
      const d = derivados([m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", costo, "2026-07"), m("gasto_fijo_mes", 12000, "2026-07")]);
      expect(d.equilibrio, String(costo)).toBeNull();
      expect(d.sobreEquilibrio).toBeNull();
      const motivo = d.detalle.equilibrio.motivo_nulo ?? "";
      expect(motivo).not.toMatch(/raz[oó]n|margen de contribuci[oó]n|volumen/i);
      expect(motivo).toContain("julio de 2026");
      expect(motivo).toContain("gastos fijos");
      expect(motivo).toMatch(/alquiler/);
      expect(motivo).not.toMatch(/\d{4}-\d{2}|_/);
    }
  });

  it("con ventas en cero el motivo también va en palabras del dueño", () => {
    const d = derivados([m("venta_mes", 0, "2026-07"), m("costo_variable_mes", 5000, "2026-07"), m("gasto_fijo_mes", 12000, "2026-07")]);
    expect(d.equilibrio).toBeNull();
    const motivo = d.detalle.equilibrio.motivo_nulo ?? "";
    expect(motivo).toContain("anotadas en cero");
    expect(motivo).toContain("julio de 2026");
    expect(motivo).not.toMatch(/raz[oó]n|margen de contribuci[oó]n/i);
  });

  it("ningún motivo del equilibrio trae jerga de la fórmula ni códigos, falte lo que falte", () => {
    const fijos = m("gasto_fijo_mes", 12000, "2026-07");
    const casos: Metrica[][] = [
      [], [m("venta_mes", 40000, "2026-07")], [...julio], [...julio, m("gasto_fijo_mes", 0, "2026-07")],
      [m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 0, "2026-07"), fijos],
      [m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 28000, "2026-06"), fijos],
      [...julio, m("gasto_fijo_mes", 12000, "2026-05")],
      [m("venta_mes", 40000, "2026-07"), m("costo_variable_mes", 45000, "2026-07"), fijos],
      [m("venta_mes", 0, "actual"), m("costo_variable_mes", 0, "actual"), fijos],
    ];
    for (const [i, caso] of casos.entries()) {
      const d = derivados(caso);
      expect(d.equilibrio, `caso ${i}`).toBeNull();
      const motivo = d.detalle.equilibrio.motivo_nulo ?? "";
      expect(motivo.length, `caso ${i}`).toBeGreaterThan(20);
      expect(motivo, `caso ${i}`).not.toMatch(/raz[oó]n|margen de contribuci[oó]n|\d{4}-\d{2}|[a-z]_[a-z]/i);
    }
  });

  it("una cifra con un insumo extraído sale marcada como provisional y con la limitación escrita; con contados, no", () => {
    const d = derivados([m("venta_mes", 40000, "2026-07", "extraido"), m("costo_variable_mes", 28000, "2026-07"), m("gasto_fijo_mes", 12000, "2026-07"), m("caja_hoy", 8000)]);
    expect(d.equilibrio).toBeCloseTo(40000, 5);
    expect(d.provisional.equilibrio).toBe(true);
    expect(d.detalle.equilibrio.limitaciones).toContain(LIMITACION_NUMERO_EXTRAIDO);
    // «Cuánto aguantas» no usó ese número: no se contagia.
    expect(d.provisional.diasAguante).toBe(false);
    expect(d.detalle.diasAguante.limitaciones).not.toContain(LIMITACION_NUMERO_EXTRAIDO);
    const contado = derivados([...julio, m("gasto_fijo_mes", 12000, "2026-07"), m("caja_hoy", 8000)]);
    expect(Object.values(contado.provisional)).toEqual([false, false, false, false, false]);
    expect(contado.detalle.equilibrio.limitaciones).not.toContain(LIMITACION_NUMERO_EXTRAIDO);
    // Sin cifra no hay nada que rotular.
    expect(derivados([m("venta_mes", 40000, "2026-07", "extraido")]).provisional.equilibrio).toBe(false);
  });

  it("un descartado no entra en ningún cálculo ni en la radiografía aunque conserve un valor", () => {
    const d = derivados([m("venta_mes", 40000, "2026-07"), m("gasto_fijo_mes", 12000, "2026-07"), m("costo_variable_mes", 28000, "2026-07", "descartado")]);
    expect(d.equilibrio).toBeNull();
    expect(d.detalle.equilibrio.motivo_nulo).toBe(MOTIVO_EQUILIBRIO_SIN_COSTO_VARIABLE);
    const r = radiografia([m("caja_hoy", 8000, "actual", "descartado")]);
    expect(r.listos).toBe(0);
    expect(r.faltan.some((v) => v.clave === "caja_hoy")).toBe(true);
  });
});

/**
 * EL RECORRIDO ENTERO SIN NAVEGADOR NI BASE: lo que el dueño teclea → lo que la pantalla envía
 * (cuerpoDeNumeros) → las filas que la ruta guarda (filasDeNumeros) → lo que se calcula (derivados).
 * Son las mismas funciones que usan MisNumeros.tsx y /api/portal/numeros. Reparo del verificador:
 * la venta contestada en «Lo que falta» quedaba «de hoy» y el costo variable en el mes pasado, y el
 * equilibrio salía null aunque el dueño hubiera dado los dos números en la misma pantalla.
 */
describe("recorrido de Tus números: formulario → filas → derivados", () => {
  const vacio = { periodo: "", monto: "" };
  const formulario = (extra: Partial<FormularioNumeros>): FormularioNumeros => ({
    valores: {}, meses: {}, mejor: vacio, peor: vacio, sinDato: [], mesPasado: "2026-09", mesesConVenta: [], ...extra,
  });
  const guardar = (f: FormularioNumeros) => filasDeNumeros(cuerpoDeNumeros(f));
  const de = (filas: Metrica[], clave: string) => filas.filter((f) => f.clave === clave).map((f) => `${f.periodo}=${f.valor}`).sort();

  it("el dueño escribe como habla", () => {
    expect(aNumero("8 mil")).toBe(8000);
    expect(aNumero("8,5 mil")).toBe(8500);
    expect(aNumero("8,500")).toBe(8500);
    expect(aNumero("S/ 8500")).toBe(8500);
    expect(aNumero("")).toBeNull();
    expect(aNumero("no sé")).toBeNull();
    expect(aNumero("-5")).toBeNull();
  });

  it("contesta «Lo que falta» y su costo variable en la misma pantalla: caen en el mismo mes y hay equilibrio", () => {
    const filas = guardar(formulario({ valores: { venta_mes: "40 mil", ganancia_mes: "4 mil", gasto_fijo_mes: "12 mil", costo_variable_mes: "28 mil", caja_hoy: "8,000" } }));
    expect(de(filas, "venta_mes")).toEqual(["2026-09=40000"]); // antes: actual=40000
    expect(de(filas, "costo_variable_mes")).toEqual(["2026-09=28000"]);
    expect(de(filas, "ganancia_mes")).toEqual(["2026-09=4000"]);
    expect(de(filas, "gasto_fijo_mes")).toEqual(["actual=12000"]);
    expect(de(filas, "caja_hoy")).toEqual(["actual=8000"]);
    expect(filas.every((f) => f.estado === "contado")).toBe(true);

    const d = derivados(filas);
    expect(d.equilibrio).toBeCloseTo(40000, 5); // 12000 / (1 − 28000/40000)
    expect(d.detalle.equilibrio.motivo_nulo).toBeUndefined();
    expect(d.sobreEquilibrio).toBeCloseTo(0, 5);
    // El margen declarado no gana un aviso nuevo: venta y «lo que quedó libre» siguen juntos.
    expect(d.margen).toBeCloseTo(10, 5);
    expect(d.detalle.margen.limitaciones.join(" ")).not.toContain("orientativa");
    expect(d.diasAguante).toBeCloseTo(20, 5);
    expect(radiografia(filas).mesesConVenta).toBe(1);
  });

  it("si las ventas estaban guardadas sin mes, el costo variable solo no alcanza: null con motivo; con la venta de ese mes, sí", () => {
    const yaGuardado = [m("venta_mes", 40000, "actual"), m("gasto_fijo_mes", 12000, "actual")];
    const soloCosto = guardar(formulario({ valores: { costo_variable_mes: "28 mil" } }));
    expect(soloCosto).toEqual([{ clave: "costo_variable_mes", periodo: "2026-09", valor: 28000, estado: "contado" }]);
    const d = derivados([...yaGuardado, ...soloCosto]);
    expect(d.equilibrio).toBeNull();
    const motivo = d.detalle.equilibrio.motivo_nulo ?? "";
    expect(motivo).toContain("setiembre de 2026");
    expect(motivo).toContain("mes actual");
    expect(motivo).toContain("mismo mes");
    // La salida que la pantalla le señala al escribir: anotar las ventas de ese mismo mes.
    const conVenta = guardar(formulario({ valores: { costo_variable_mes: "28 mil" }, meses: { "2026-09": "40 mil" } }));
    expect(derivados([...yaGuardado, ...conVenta]).equilibrio).toBeCloseTo(40000, 5);
  });

  it("lo que quedó libre va con su venta: al mes pasado si ese mes tiene venta; si no, «de hoy» como siempre", () => {
    expect(guardar(formulario({ valores: { ganancia_mes: "4 mil" } }))).toEqual([{ clave: "ganancia_mes", periodo: "actual", valor: 4000, estado: "contado" }]);
    expect(guardar(formulario({ valores: { ganancia_mes: "4 mil" }, mesesConVenta: ["2026-09"] }))).toEqual([{ clave: "ganancia_mes", periodo: "2026-09", valor: 4000, estado: "contado" }]);
  });

  it("el mes escrito con su nombre manda sobre «Lo que falta», y este sobre «mejor» o «peor»", () => {
    const filas = guardar(formulario({
      valores: { venta_mes: "40 mil" }, meses: { "2026-09": "42 mil" },
      mejor: { periodo: "2026-09", monto: "90 mil" }, peor: { periodo: "2026-02", monto: "20 mil" },
    }));
    expect(de(filas, "venta_mes")).toEqual(["2026-02=20000", "2026-09=42000"]);
    const sinNombre = guardar(formulario({ valores: { venta_mes: "40 mil" }, mejor: { periodo: "2026-09", monto: "90 mil" } }));
    expect(sinNombre).toEqual([{ clave: "venta_mes", periodo: "2026-09", valor: 40000, estado: "contado" }]);
  });

  it("sin mes pasado que ofrecer todo queda «de hoy» y sigue coincidiendo: también hay equilibrio", () => {
    const filas = guardar(formulario({ mesPasado: null, valores: { venta_mes: "40 mil", costo_variable_mes: "28 mil", gasto_fijo_mes: "12 mil" } }));
    expect([...new Set(filas.map((f) => f.periodo))]).toEqual(["actual"]);
    expect(derivados(filas).equilibrio).toBeCloseTo(40000, 5);
  });

  it("«no lo sé» se guarda sin valor, nunca como cero; lo que no se entiende o no es de la casa no se guarda", () => {
    const filas = guardar(formulario({ valores: { caja_hoy: "no sé", costo_variable_mes: "", merma_semana: "300" }, sinDato: ["costo_variable_mes", "clave_inventada"] }));
    expect(filas).toEqual([{ clave: "costo_variable_mes", periodo: "actual", valor: null, estado: "sin_dato" }]);
    expect(derivados(filas).equilibrio).toBeNull();
  });

  it("la ruta guarda vitales y reconocidas, por nombre o por sinónimo, con número o como «no lo sé»", () => {
    expect(claveAceptada("costo_variable_mes")).toBe(true);
    expect(claveAceptada("venta_mes")).toBe(true);
    expect(claveAceptada("merma_semana")).toBe(false);
    const filas = filasDeNumeros({
      vitales: { caja_hoy: 8000, costos_variables: 5000, merma_semana: 3, deuda_propia: null },
      meses: [{ periodo: "2026-08", venta: 80000, costo_variable: 52000, gasto_fijo: 15500 }],
      epoca_dorada: 120000,
      sin_dato: ["costo_variable_mes", "Caja Hoy", "merma_semana"],
    });
    expect(filas).toEqual([
      { clave: "caja_hoy", periodo: "actual", valor: 8000, estado: "contado" },
      { clave: "costo_variable_mes", periodo: "actual", valor: 5000, estado: "contado" },
      { clave: "venta_mes", periodo: "2026-08", valor: 80000, estado: "contado" },
      { clave: "gasto_fijo_mes", periodo: "2026-08", valor: 15500, estado: "contado" },
      { clave: "costo_variable_mes", periodo: "2026-08", valor: 52000, estado: "contado" },
      { clave: "venta_mes", periodo: PERIODO_DORADA, valor: 120000, estado: "contado" },
      { clave: "costo_variable_mes", periodo: "actual", valor: null, estado: "sin_dato" },
      { clave: "caja_hoy", periodo: "actual", valor: null, estado: "sin_dato" },
    ]);
  });

  it("de los costos variables ya dados se muestra un monto; si no hay, el «no lo sé» manda sobre el cero", () => {
    const otros = (ms: Metrica[]) => radiografia(ms).otros;
    const cero = m("costo_variable_mes", 0, "2026-09");
    const noSe = m("costo_variable_mes", null, "actual", "sin_dato");
    expect(costoVariableDeclarado(otros([cero]), "2026-09")?.valor).toBe(0);
    // Antes: marcaba «No lo sé» y, al recargar, el aviso del cero seguía ahí.
    expect(costoVariableDeclarado(otros([cero, noSe]), "2026-09")?.estado).toBe("sin_dato");
    expect(costoVariableDeclarado(otros([cero, noSe, m("costo_variable_mes", 25000, "2026-08")]), "2026-09")).toMatchObject({ valor: 25000, periodo: "2026-08" });
    // El del mes por el que se pregunta primero; si no, el mes con nombre más reciente; «de hoy» al final.
    const varios = otros([m("costo_variable_mes", 26000, "actual"), m("costo_variable_mes", 25000, "2026-08"), m("costo_variable_mes", 28000, "2026-09")]);
    expect(costoVariableDeclarado(varios, "2026-08")?.valor).toBe(25000);
    expect(costoVariableDeclarado(varios, "2026-10")?.valor).toBe(28000);
    expect(costoVariableDeclarado(otros([m("costo_variable_mes", 26000, "actual")]), "2026-09")?.valor).toBe(26000);
    // Lo descartado al revisar una extracción no es algo que el dueño «ya contó».
    expect(costoVariableDeclarado(otros([m("costo_variable_mes", 28000, "2026-09", "descartado")]), "2026-09")).toBeNull();
    expect(costoVariableDeclarado([], "2026-09")).toBeNull();
  });
});

/**
 * LAS PANTALLAS Y LA RUTA: solo su estructura, leída del archivo. Sin base ni navegador no se puede
 * afirmar más que esto; se dice tal cual (pantalla solo compilada).
 */
describe("el dueño puede dar su costo variable y los números llegan a las decisiones (estructura de los archivos)", () => {
  const leer = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8");
  const RUTA = leer("src/app/api/portal/numeros/route.ts");
  const PANTALLA = leer("src/components/cliente/MisNumeros.tsx");
  const DECISION = leer("src/app/(consultor)/decisiones/[id]/page.tsx");
  const TARJETA = leer("src/components/consultor/TarjetaDecision.tsx");

  it("la ruta acepta las claves reconocidas además de las vitales: arma sus filas con la función que se prueba arriba", () => {
    // Qué clave entra y en qué periodo queda ya no está copiado en la ruta: lo decide filasDeNumeros,
    // cuyo comportamiento (vitales, reconocidas, «no lo sé») se comprueba en el recorrido.
    expect(RUTA).toContain("filasDeNumeros(b)");
    // POR COMPORTAMIENTO, no por una palabra: «CLAVES_RECONOCIDAS» solo aparece en un comentario de la ruta, y
    // una aserción que pasa gracias a un comentario no prueba nada. Lo que se afirma es lo que hace la función
    // con la que la ruta arma sus filas: una clave reconocida entra (por su nombre, por su sinónimo y dentro
    // de un mes) y una que no es ni vital ni reconocida se queda fuera.
    expect([...CLAVES_RECONOCIDAS]).toContain("costo_variable_mes");
    const filas = filasDeNumeros({ vitales: { costo_variable_mes: 5000, merma_semana: 3 }, meses: [{ periodo: "2026-08", venta: null, costo_variable: 52000 }], sin_dato: ["costos_variables", "merma_semana"] });
    expect(filas).toEqual([
      { clave: "costo_variable_mes", periodo: "actual", valor: 5000, estado: "contado" },
      { clave: "costo_variable_mes", periodo: "2026-08", valor: 52000, estado: "contado" },
      { clave: "costo_variable_mes", periodo: "actual", valor: null, estado: "sin_dato" },
    ]);
    expect(RUTA).not.toMatch(/if \(!CLAVES_VITALES\.has\(clave\)/);
    expect(RUTA).toMatch(/costo_variable: monto/);
  });

  it("la ruta no cuenta como guardado lo que la base rechazó: lo registra y se lo dice al dueño", () => {
    expect(RUTA).toMatch(/const \{ error \} = prev/);
    expect(RUTA).toContain("noGuardados.push(");
    expect(RUTA).toContain("registrarError(");
    expect(RUTA).toContain("No pudimos guardar tus números");
    // El contador solo sube después de comprobar el error.
    expect(RUTA.indexOf("noGuardados.push(")).toBeLessThan(RUTA.indexOf("guardados++"));
  });

  it("Tus números tiene el campo de costos variables con su frase de ayuda y su «no lo sé»", () => {
    // Sin lista de ejemplo dentro de la pregunta (revisión del 16-10-2026): por el episodio, una sola cosa.
    expect(PANTALLA).toContain("El mes pasado, ¿cuánto te costó lo que vendiste?");
    expect(PANTALLA).toContain("costo_variable_mes");
    expect(PANTALLA).toMatch(/No lo sé/);
    // La ayuda es UNA frase, y dice que «no lo sé» va en vez de un cero.
    const ayuda = /const AYUDA_COSTO_VARIABLE =\s*"([^"]+)";/.exec(PANTALLA)?.[1] ?? "";
    expect(ayuda).toContain("en vez de poner cero");
    expect(ayuda.split(/[.!?]\s/).length, "la ayuda es una sola frase").toBe(1);
    // Y va por el mismo patrón que los nueve: campoVital con su ayuda.
    expect(PANTALLA).toContain("campoVital(CAMPO_COSTO_VARIABLE, AYUDA_COSTO_VARIABLE)");
  });

  it("un cero ya guardado en costos variables se le dice al dueño: se toma como «no lo sé»", () => {
    // Qué se le muestra (monto > «no lo sé» > cero) lo decide costoVariableDeclarado, probado arriba.
    expect(PANTALLA).toContain("costoVariableDeclarado(radiografia.otros");
    expect(PANTALLA).toMatch(/Un cero lo tomamos como «no lo sé»/);
  });

  it("Tus números envía lo que arma cuerpoDeNumeros y avisa si al costo variable le falta la venta de su mes", () => {
    expect(PANTALLA).toContain("cuerpoDeNumeros({");
    expect(PANTALLA).toContain("json: { ...cuerpo,");
    expect(PANTALLA).toContain("faltaLaVentaDelMes &&");
    expect(PANTALLA).toMatch(/faltan tus ventas de \{mesPasado\.etiqueta\}/);
  });

  it("la tarjeta de decisión marca junto a la cifra lo que se apoya en un número extraído", () => {
    expect(TARJETA).toContain("provisional={numeros.provisional.equilibrio}");
    expect(TARJETA).toMatch(/valor != null && provisional/);
    expect(TARJETA).toContain("Provisional:");
  });

  it("la decisión lee los números de la empresa y se los pasa a la tarjeta", () => {
    expect(DECISION).toContain('from("company_metricas")');
    expect(DECISION).toContain("clave,periodo,valor,estado");
    expect(DECISION).toMatch(/derivados\(/);
    expect(DECISION).toMatch(/numeros=\{numeros\}/);
  });

  it("si la lectura de los números falla, la decisión no calcula sobre una lista vacía: lo avisa", () => {
    expect(DECISION).toMatch(/errorNumeros \? null : derivados\(/);
    expect(DECISION).toMatch(/avisoNumeros=\{avisoNumeros\}/);
    expect(TARJETA).toMatch(/!numeros && avisoNumeros/);
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

// ---------------------------------------------------------------------------------------------
// CIERRE Z3 (13-10-2026) · NINGUNA CIFRA FIRME QUE NO LO SEA
// ---------------------------------------------------------------------------------------------

/**
 * Tres reparos de los verificadores, cada uno con su regla pura y, donde la hay, con la pantalla pintada a
 * texto (sin navegador: es el HTML del servidor, lo que el dueño ve antes de tocar nada).
 *  (a) `derivados` sabía qué cifra era provisional pero al dueño le salía firme: el rótulo va junto a la cifra.
 *  (b) con un cero en el mes y «no lo sé» declarado, la misma página decía dos cosas distintas.
 *  (c) un número mal escrito desaparecía al guardar sin aviso.
 */
describe("cierre Z3 · lo provisional se rotula junto a la cifra, a la vista", () => {
  const limpio = (html: string) => html.replace(/<!-- -->/g, "");
  const texto = (html: string) => limpio(html).replace(/<[^>]+>/g, "");
  const ROTULO = "provisional: sale de un documento que falta revisar";
  const nueve = (estadoVenta: string): Metrica[] => [
    m("venta_mes", 40000, "2026-09", estadoVenta), m("ganancia_mes", 4000, "2026-09"), m("caja_hoy", 8000), m("gasto_fijo_mes", 12000),
    m("precio_producto_estrella", 25), m("costo_producto_estrella", 15), m("conversion_de_cada_10", 3), m("deuda_clientes", 3000), m("deuda_propia", 20000),
  ];

  it("la radiografía lleva las mismas marcas que los derivados: una sola fuente para todas las pantallas", () => {
    expect(ROTULO_CIFRA_PROVISIONAL).toBe(ROTULO);
    const ms = nueve("extraido");
    expect(radiografia(ms).cifrasProvisionales).toEqual(derivados(ms).provisional);
    expect(radiografia(ms).cifrasProvisionales).toMatchObject({ margen: true, diasAguante: false });
    expect(Object.values(radiografia(nueve("contado")).cifrasProvisionales)).toEqual([false, false, false, false, false]);
  });

  it("la tarjeta de «Mi empresa» pone el rótulo pegado al margen provisional, y no a lo que no lo es", () => {
    const ms = nueve("extraido");
    const d = derivados(ms);
    // Tal como la monta hoy «Mi empresa»: radiografía y dos cifras sueltas, sin pasarle nada más.
    const tarjeta = texto(renderToStaticMarkup(createElement(TarjetaNumeros, { radiografia: radiografia(ms), margen: d.margen, diasAguante: d.diasAguante })));
    expect(tarjeta).toContain(`De cada 100 soles que vendes te quedan 10 (${ROTULO}).`);
    expect(tarjeta).toContain("Con la caja de hoy aguantas 20 días sin vender.");
    // Con todo contado de memoria no hay rótulo: no se marca de más.
    const c = nueve("contado");
    const firme = texto(renderToStaticMarkup(createElement(TarjetaNumeros, { radiografia: radiografia(c), margen: derivados(c).margen, diasAguante: derivados(c).diasAguante })));
    expect(firme).toContain("De cada 100 soles que vendes te quedan 10. Con la caja de hoy aguantas 20 días sin vender.");
    expect(firme).not.toMatch(/provisional/i);
    // Si quien la monta pasa las marcas, mandan esas.
    const forzada = texto(renderToStaticMarkup(createElement(TarjetaNumeros, { radiografia: radiografia(c), margen: 10, diasAguante: 20, provisional: { diasAguante: true } })));
    expect(forzada).toContain(`aguantas 20 días sin vender (${ROTULO}).`);
  });

  describe("la página «Tus números», pintada entera con una base en memoria", () => {
    const EMP = "emp-1";
    const filas = (ms: Metrica[]) => ms.map((x) => ({ company_id: EMP, ...x }));
    const pintar = async (ms: Metrica[], zona: string | null = "America/Lima") => {
      memoria.tablas = { company_metricas: filas(ms), companies: [{ id: EMP, ficha: {}, zona_horaria: zona }], mediciones: [], indicadores: [], actions: [] };
      const { default: Numeros } = await import("@/app/(cliente)/portal/numeros/page");
      return limpio(renderToStaticMarkup(await Numeros()));
    };
    const conEquilibrio = (estadoVenta: string): Metrica[] => [
      m("venta_mes", 50000, "2026-09", estadoVenta), m("costo_variable_mes", 28000, "2026-09"), m("gasto_fijo_mes", 12000),
      m("ganancia_mes", 5000, "2026-09"), m("caja_hoy", 8000), m("deuda_propia", 20000),
    ];

    it("equilibrio con la venta leída de un documento sin revisar: el rótulo sale al lado, fuera de «Cómo se calculó»", async () => {
      const html = await pintar(conEquilibrio("extraido"));
      // 12.000 / ((50.000 − 28.000) / 50.000) = 27.272,7
      // La cifra va en su tarjeta, «Para cubrir tus costos», una sola vez (revisión del 16-10-2026: también salía en una
      // franja de cifras debajo del tablero, «S/27,273» y «S/ 27,273»).
      expect(texto(html)).toContain("Para cubrir tus costosLo que necesitas vender al mesS/27,273");
      expect(texto(html).match(/27,273/g) ?? []).toHaveLength(1); // con un solo mes de venta no hay línea: solo la tarjeta
      // Justo debajo de la cifra y ANTES del desplegable: no hace falta abrir nada para leerlo.
      expect(html).toMatch(/tienes que vender al mes para cubrir tus costos<\/p><p[^>]*>Provisional: sale de un documento que falta revisar\.<\/p><details/);
      expect(html).toMatch(/de cada 100 soles, te queda<\/p><p[^>]*>Provisional: sale de un documento que falta revisar\.<\/p><details/);
      // La caja y los gastos fijos son contados: los días de aguante no llevan rótulo.
      expect(html).toMatch(/aguantas si mañana no entra nada<\/p><details/);
      // Y la frase que antes decía «estás S/X por encima» como si fuera firme.
      expect(texto(html)).toContain(`Vendiendo lo del último mes estarías S/ 22,727 por encima de tu punto de equilibrio (${ROTULO}).`);
      expect(texto(html)).not.toContain("estás S/ 22,727 por encima");
    });

    it("con los mismos números contados de memoria la página no rotula nada y habla en firme", async () => {
      const html = await pintar(conEquilibrio("contado"));
      expect(texto(html)).toContain("Vendiendo lo del último mes estás S/ 22,727 por encima de tu punto de equilibrio.");
      expect(html).not.toMatch(/sale de un documento que falta revisar/);
      expect(html).toMatch(/tienes que vender al mes para cubrir tus costos<\/p><details/);
    });

    it("cero en el mes y «no lo sé» declarado: la página dice UNA sola cosa, arriba y abajo", async () => {
      const html = texto(await pintar([
        m("venta_mes", 40000, "2026-09"), m("gasto_fijo_mes", 12000), m("ganancia_mes", 4000, "2026-09"), m("caja_hoy", 8000),
        m("costo_variable_mes", 0, "2026-09"), m("costo_variable_mes", null, "actual", "sin_dato"),
      ]));
      expect(html).toContain(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_NO_SABE);
      expect(html).toContain("Nos dijiste que no lo sabes. Si ahora lo sabes, escríbelo aquí.");
      // Lo que antes se contradecía: arriba pedía marcar «no lo sé» y hablaba del cero; abajo decía que ya lo dijo.
      expect(html).not.toContain("márcalo como «no lo sé»");
      expect(html).not.toContain("están anotados en cero");
      expect(html).not.toContain("Tienes anotado cero");
    });

    it("«hoy» y «el mes pasado» son los del reloj de la empresa, no los del servidor", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        // 1 de noviembre a las 03:00 UTC: en Lima todavía es 31 de octubre a las 22:00; en Tokio ya es 1 de noviembre.
        vi.setSystemTime(new Date("2026-11-01T03:00:00Z"));
        const lima = texto(await pintar(conEquilibrio("contado"), "America/Lima"));
        expect(lima).toContain("¿Cuánto vendiste en Setiembre 2026?");
        expect(lima).toContain("Son del mes pasado: del 1 sep 2026 al 30 sep 2026");
        const tokio = texto(await pintar(conEquilibrio("contado"), "Asia/Tokyo"));
        expect(tokio).toContain("¿Cuánto vendiste en Octubre 2026?");
        expect(tokio).toContain("Son del mes pasado: del 1 oct 2026 al 31 oct 2026");
        // Sin zona guardada, o con una inventada, se cae a Lima: nunca a la hora del servidor.
        expect(texto(await pintar(conEquilibrio("contado"), null))).toContain("¿Cuánto vendiste en Setiembre 2026?");
        expect(texto(await pintar(conEquilibrio("contado"), "Marte/Olimpo"))).toContain("¿Cuánto vendiste en Setiembre 2026?");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe("cierre Z3 · cero y «no lo sé» en costos variables: un solo mensaje", () => {
  const venta = [m("venta_mes", 40000, "2026-09"), m("gasto_fijo_mes", 12000)];
  const cero = m("costo_variable_mes", 0, "2026-09");
  const noSe = m("costo_variable_mes", null, "actual", "sin_dato");

  it("con el «no lo sé» declarado, el motivo repite eso y no vuelve a pedirle que lo marque", () => {
    const d = derivados([...venta, cero, noSe]);
    expect(d.equilibrio).toBeNull();
    expect(d.detalle.equilibrio.motivo_nulo).toBe(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_NO_SABE);
    expect(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_NO_SABE).toMatch(/^Nos dijiste que no sabes/);
    const todo = explicarCalculo(d.detalle.equilibrio).map((l) => l.texto).join(" ");
    expect(todo).not.toContain("márcalo como «no lo sé»");
    expect(todo).not.toContain(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_CERO);
    // El cero no se esconde: se dice que está y que no se usa.
    expect(d.detalle.equilibrio.limitaciones).toHaveLength(1);
    expect(d.detalle.equilibrio.limitaciones[0]).toMatch(/Hay además un cero anotado en costos variables de setiembre de 2026: no entra en ninguna cuenta/);
    // Y es lo mismo que decide la frase de más abajo en la página (Tus números).
    expect(costoVariableDeclarado(radiografia([...venta, cero, noSe]).otros, "2026-09")?.estado).toBe("sin_dato");
  });

  it("solo el «no lo sé», sin cero: el mismo mensaje y ninguna limitación", () => {
    const d = derivados([...venta, noSe]);
    expect(d.detalle.equilibrio.motivo_nulo).toBe(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_NO_SABE);
    expect(d.detalle.equilibrio.limitaciones).toEqual([]);
  });

  it("sin «no lo sé», el cero sigue diciendo lo de siempre; y un monto de verdad manda sobre las dos cosas", () => {
    const soloCero = derivados([...venta, cero]);
    expect(soloCero.detalle.equilibrio.motivo_nulo).toBe(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_CERO);
    expect(soloCero.detalle.equilibrio.limitaciones).toEqual([LIMITACION_COSTO_VARIABLE_CERO]);
    const conMonto = derivados([...venta, noSe, m("costo_variable_mes", 28000, "2026-09")]);
    expect(conMonto.equilibrio).toBeCloseTo(40000, 5);
    // Un monto en OTRO mes: no es «no lo sé» (ya lo contó), y la página de abajo tampoco lo dice.
    const otroMes = [...venta, cero, noSe, m("costo_variable_mes", 25000, "2026-08")];
    expect(derivados(otroMes).detalle.equilibrio.motivo_nulo).not.toBe(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_NO_SABE);
    expect(costoVariableDeclarado(radiografia(otroMes).otros, "2026-09")).toMatchObject({ valor: 25000 });
  });
});

describe("cierre Z3 · un número mal escrito no desaparece: se avisa y no se guarda", () => {
  const vacio = { periodo: "", monto: "" };
  const escrito = (extra: Partial<Pick<FormularioNumeros, "valores" | "meses" | "mejor" | "peor" | "sinDato">> = {}) =>
    revisarNumerosEscritos({ valores: {}, meses: {}, mejor: vacio, peor: vacio, ...extra });

  it("vacío no es lo mismo que mal escrito, ni mal escrito lo mismo que negativo: son lecturas distintas", () => {
    expect(lecturaDeCampo("")).toBe("vacio");
    expect(lecturaDeCampo("   ")).toBe("vacio");
    expect(lecturaDeCampo(null)).toBe("vacio");
    for (const bien of ["8500", "8,500", "8 mil", "28.000", "S/. 8500", "0"]) expect(lecturaDeCampo(bien), bien).toBe("numero");
    for (const mal of ["8.5oo", "ocho mil", "no sé", "12,34,5", "S/"]) expect(lecturaDeCampo(mal), mal).toBe("invalido");
    // Un negativo está bien escrito: no es «no entendimos» (ver más abajo «una pérdida no es un número mal escrito»).
    expect(lecturaDeCampo("-500")).toBe("negativo");
    // Justo lo que `aNumero` no distingue, y por eso la pantalla no podía avisar.
    expect(aNumero("")).toBeNull();
    expect(aNumero("8.5oo")).toBeNull();
  });

  it("nada escrito, o todo bien escrito: se puede guardar", () => {
    expect(escrito()).toEqual({ invalidos: [], negativos: [], sinMes: [], perdida: false, listo: true });
    expect(escrito({ valores: { caja_hoy: "8 mil", deuda_propia: "" }, meses: { "2026-09": "40.000" }, mejor: { periodo: "2026-07", monto: "55 mil" } }).listo).toBe(true);
  });

  it("señala la caja exacta que no se entiende, sea un número de los nueve, un mes o el mejor/peor mes", () => {
    const r = escrito({
      valores: { caja_hoy: "8.5oo", deuda_propia: "20 mil", costo_variable_mes: "veintiocho" },
      meses: { "2026-09": "cuarenta" },
      mejor: { periodo: "2026-07", monto: "mucho" },
      peor: { periodo: "2026-02", monto: "12 mil" },
    });
    expect(r.invalidos).toEqual([campoDeValor("caja_hoy"), campoDeValor("costo_variable_mes"), campoDeMes("2026-09"), "mejor"]);
    expect(r.sinMes).toEqual([]);
    expect(r.listo).toBe(false);
    expect(AVISO_NUMERO_NO_ENTENDIDO).toBe("No entendimos este número; escríbelo como 8500, 8,500 u 8 mil.");
  });

  it("lo marcado «No lo sé» no se revisa, y un monto sin su mes tampoco se pierde en silencio", () => {
    expect(escrito({ valores: { caja_hoy: "xx" }, sinDato: ["caja_hoy"] }).listo).toBe(true);
    const r = escrito({ peor: { periodo: "", monto: "12 mil" } });
    expect(r).toEqual({ invalidos: [], negativos: [], sinMes: ["peor"], perdida: false, listo: false });
    expect(AVISO_FALTA_EL_MES).toMatch(/Elige el mes/);
    // Mal escrito Y sin mes: manda lo primero (no se le piden dos cosas a la vez).
    expect(escrito({ mejor: { periodo: "", monto: "mucho" } })).toEqual({ invalidos: ["mejor"], negativos: [], sinMes: [], perdida: false, listo: false });
  });

  it("justo lo que se perdía: `cuerpoDeNumeros` arma el envío sin el número mal escrito, y la revisión lo detiene antes", () => {
    const f: FormularioNumeros = { valores: { caja_hoy: "8.5oo", deuda_propia: "20 mil" }, meses: {}, mejor: vacio, peor: vacio, sinDato: [], mesPasado: "2026-09", mesesConVenta: [] };
    expect(cuerpoDeNumeros(f).vitales).toEqual({ deuda_propia: 20000 });
    expect(revisarNumerosEscritos(f)).toMatchObject({ invalidos: [campoDeValor("caja_hoy")], listo: false });
  });

  it("la pantalla usa esa revisión: avisa bajo la caja y no guarda hasta corregir (estructura del archivo)", () => {
    const PANTALLA = readFileSync(path.resolve(__dirname, "..", "src/components/cliente/MisNumeros.tsx"), "utf8");
    expect(PANTALLA).toContain("revisarNumerosEscritos({ valores, meses, mejor, peor, sinDato: [...sinDato] })");
    expect(PANTALLA).toContain("{avisoDe(campoDeValor(v.clave))}");
    expect(PANTALLA).toContain("{avisoDe(campoDeMes(mesPasado.periodo))}");
    expect(PANTALLA).toContain("{avisoDe(f.id)}");
    expect(PANTALLA).toMatch(/if \(!revision\.listo\) \{[\s\S]{0,260}return;/);
    expect(PANTALLA).toContain("disabled={guardando || !revision.listo}");
  });

  it("la pantalla pintada no marca nada mientras no se escribe: las cajas vacías no son errores", () => {
    const html = renderToStaticMarkup(createElement(MisNumeros, { radiografia: radiografia([]), serieVenta: [], temporadasAltas: [], mesesDisponibles: [{ periodo: "2026-09", etiqueta: "Setiembre 2026" }] }));
    expect(html).not.toContain("No entendimos este número");
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).toContain("Puedes corregirlos cuando quieras. Nada se pierde.");
  });
});

/**
 * CIERRE Z3, SEGUNDA VUELTA. Dos reparos del verificador sobre lo que el dueño ve en «Tus números»:
 *  - «-2000» en «Lo que te quedó libre» recibía «No entendimos este número; escríbelo como 8500…» y no dejaba
 *    guardar NADA hasta borrarlo. Quien perdió plata no escribió mal: se le dice qué pasa con su pérdida.
 *  - «Tus ventas mes a mes», bajo «Lo que ya nos contaste», pintaba como contada una venta leída de un
 *    documento, y hasta una descartada que conservara su valor.
 */
describe("cierre Z3 · una pérdida no es un número mal escrito", () => {
  const vacio = { periodo: "", monto: "" };
  const revisar = (extra: Partial<Pick<FormularioNumeros, "valores" | "meses" | "mejor" | "peor" | "sinDato">> = {}) =>
    revisarNumerosEscritos({ valores: {}, meses: {}, mejor: vacio, peor: vacio, ...extra });

  it("un número con signo menos se lee como negativo, no como «no entendimos»", () => {
    for (const neg of ["-2000", "−2000", "-2 mil", "- S/ 2,000", "-0.5"]) expect(lecturaDeCampo(neg), neg).toBe("negativo");
    for (const mal of ["-", "-dos mil", "--5", "5-"]) expect(lecturaDeCampo(mal), mal).toBe("invalido");
    // «numero» es solo lo que de verdad se guardaría: `aNumero` sigue sin dejar pasar un negativo.
    expect(aNumero("-2000")).toBeNull();
    expect(lecturaDeCampo("2000")).toBe("numero");
  });

  it("en «Lo que te quedó libre» es una pérdida: se avisa con su frase y no detiene lo demás", () => {
    const valores = { ganancia_mes: "-2000", caja_hoy: "8 mil" };
    expect(revisar({ valores })).toEqual({ invalidos: [], negativos: [], sinMes: [], perdida: true, listo: true });
    expect(AVISO_PERDIDA).toMatch(/perdiste plata/);
    expect(AVISO_PERDIDA).toMatch(/este número no se va a guardar/);
    expect(AVISO_PERDIDA).toMatch(/Lo demás que escribiste se guarda igual/);
    expect(AVISO_PERDIDA).not.toMatch(/No entendimos/);
    // Lo demás viaja. La pérdida no se guarda como −2000 ni, peor, como 2000 o como cero: lo dice el aviso.
    const cuerpo = cuerpoDeNumeros({ valores, meses: { "2026-09": "40 mil" }, mejor: vacio, peor: vacio, sinDato: [], mesPasado: "2026-09", mesesConVenta: [] });
    expect(cuerpo.vitales).toEqual({ caja_hoy: 8000 });
    expect(cuerpo.meses).toEqual([{ periodo: "2026-09", venta: 40000 }]);
    expect(filasDeNumeros(cuerpo).map((f) => f.clave)).not.toContain("ganancia_mes");
    // Marcada «No lo sé», la caja está apagada y no se revisa.
    expect(revisar({ valores: { ganancia_mes: "-2000" }, sinDato: ["ganancia_mes"] }).perdida).toBe(false);
  });

  it("en cualquier otra caja un negativo no cabe: se dice eso, en su caja, y hay que corregirlo antes de guardar", () => {
    const r = revisar({
      valores: { caja_hoy: "-500", deuda_propia: "20 mil" },
      meses: { "2026-09": "-40 mil" },
      mejor: { periodo: "2026-07", monto: "-1" },
      peor: { periodo: "", monto: "-1" },
    });
    expect(r).toEqual({ invalidos: [], negativos: [campoDeValor("caja_hoy"), campoDeMes("2026-09"), "mejor", "peor"], sinMes: [], perdida: false, listo: false });
    expect(AVISO_NUMERO_NEGATIVO).toBe("Este número no puede ser negativo: escríbelo sin el signo menos.");
  });

  it("la pantalla pinta cada aviso bajo su caja, y la pérdida no apaga el botón (estructura del archivo)", () => {
    const PANTALLA = readFileSync(path.resolve(__dirname, "..", "src/components/cliente/MisNumeros.tsx"), "utf8");
    expect(PANTALLA).toMatch(/revision\.negativos\.includes\(campo\) \? \([\s\S]{0,200}\{AVISO_NUMERO_NEGATIVO\}/);
    expect(PANTALLA).toMatch(/revision\.perdida && campo === campoDeValor\(CLAVE_QUE_PUEDE_SER_PERDIDA\) \? \([\s\S]{0,240}\{AVISO_PERDIDA\}/);
    // El guardado depende solo de `listo`, y `listo` no mira la pérdida.
    expect(PANTALLA).toContain("disabled={guardando || !revision.listo}");
  });
});

describe("cierre Z3 · «Tus ventas mes a mes» no pinta como contado lo que salió de un documento", () => {
  const limpio = (html: string) => html.replace(/<!-- -->/g, "");
  const texto = (html: string) => limpio(html).replace(/<[^>]+>/g, "");
  const ROTULO = ROTULO_CIFRA_PROVISIONAL;

  it("la serie deja fuera lo descartado aunque conserve su valor, marca lo extraído y va del mes más reciente al más antiguo", () => {
    const serie = serieDeVentas([
      m("venta_mes", 30000, "2026-07"), m("venta_mes", 38000, "2026-08", "descartado"), m("venta_mes", 41000, "2026-09", "extraido"),
      m("venta_mes", 35000, "2026-06", "verificado"), m("venta_mes", 99000, PERIODO_DORADA), m("venta_mes", 40000, "actual"),
      m("venta_mes", null, "2026-05", "sin_dato"), m("ganancia_mes", 4000, "2026-09"),
    ]);
    expect(serie).toEqual([
      { periodo: "2026-09", valor: 41000, provisional: true },
      { periodo: "2026-07", valor: 30000, provisional: false },
      { periodo: "2026-06", valor: 35000, provisional: false },
    ]);
  });

  it("un vital del que solo hay un número leído de un documento no figura como contado", () => {
    expect(vitalesSoloDeDocumento([
      m("venta_mes", 41000, "2026-09", "extraido"), m("ventas_mes", 39000, "2026-08", "extraido"), m("caja_hoy", 8000),
      m("deuda_propia", 20000, "actual", "extraido"), m("deuda_propia", 21000, "2026-09", "contado"),
      m("gasto_fijo_mes", 12000, "actual", "descartado"), m("deuda_clientes", null, "actual", "sin_dato"),
    ])).toEqual(["venta_mes"]);
    // Si además lo contó él, deja de ser «solo de documento».
    expect(vitalesSoloDeDocumento([m("venta_mes", 41000, "2026-09", "extraido"), m("venta_mes", 40000, "actual")])).toEqual([]);
  });

  it("la pantalla rotula la venta extraída junto a su cifra, y no rotula las contadas", () => {
    const html = texto(renderToStaticMarkup(createElement(MisNumeros, {
      radiografia: radiografia([m("venta_mes", 41000, "2026-09", "extraido"), m("venta_mes", 30000, "2026-07"), m("caja_hoy", 8000)]),
      serieVenta: [{ periodo: "2026-09", valor: 41000, provisional: true }, { periodo: "2026-07", valor: 30000, provisional: false }],
      temporadasAltas: [],
      mesesDisponibles: [{ periodo: "2026-09", etiqueta: "Setiembre 2026" }],
    })));
    expect(html).toContain(`Setiembre 2026 · ${ROTULO}S/41,000`);
    expect(html).toContain("Julio 2026S/30,000");
  });

  it("la página entera: la extraída sale rotulada, la descartada no sale, y «Hoy, S/X» tampoco se da por firme", async () => {
    const EMP = "emp-1";
    const ms: Metrica[] = [
      m("venta_mes", 41000, "2026-09", "extraido"), m("venta_mes", 38000, "2026-08", "descartado"), m("venta_mes", 30000, "2026-07"),
      m("venta_mes", 60000, PERIODO_DORADA), m("caja_hoy", 8000), m("gasto_fijo_mes", 12000), m("deuda_propia", 20000, "actual", "extraido"),
    ];
    memoria.tablas = { company_metricas: ms.map((x) => ({ company_id: EMP, ...x })), companies: [{ id: EMP, ficha: {}, zona_horaria: "America/Lima" }], mediciones: [], indicadores: [], actions: [] };
    const { default: Numeros } = await import("@/app/(cliente)/portal/numeros/page");
    const html = texto(renderToStaticMarkup(await Numeros()));
    expect(html).toContain(`Setiembre 2026 · ${ROTULO}S/41,000`);
    expect(html).toContain("Julio 2026S/30,000");
    // La venta de agosto se descartó al revisar el documento: su cifra no aparece en ninguna parte de la página.
    expect(html).not.toContain("S/38,000");
    expect(html).toContain(`Tu mejor época vendías S/ 60,000 al mes. Hoy, S/ 41,000 (${ROTULO}).`);
    // Bajo «Lo que ya nos contaste», lo que solo salió de un documento lleva su rótulo; lo contado, no.
    expect(html).toContain(`Lo que tú debes · ${ROTULO}`);
    expect(html).not.toContain(`Dinero en caja hoy · ${ROTULO}`);
    expect(html).not.toContain(`Ventas del mes · ${ROTULO}`);
  });
});
