/**
 * INTEGRIDAD FINANCIERA: EL EQUILIBRIO NO SALE DE LA UTILIDAD.
 *
 * El paquete anterior propuso para Modas Lucero «equilibrio = fijos / (utilidad / ventas) =
 * 15.500 / (8.000 / 80.000) = 155.000» y Dirección lo rechazó (D5, 13-10-2026): la utilidad ya tiene
 * los fijos descontados, así que esa razón no es la del margen de contribución y el resultado los
 * cuenta dos veces. Hasta ese día metricas.ts publicaba como «equilibrio» otra cifra que tampoco
 * era la de la empresa: fijos / margen del producto estrella.
 *
 * Estas pruebas fijan lo que sí vale: margen de contribución (ventas − costos variables), mezcla
 * ponderada por lo que de verdad se vende, equilibrio solo con esa razón, costeo por SKU y por
 * servicio que dicen qué falta en vez de rellenarlo, un estado de resultados que separa el sueldo
 * del dueño y deja fuera los retiros, y la regla de que no se suman cifras que se superponen.
 * Los números de los pilotos salen de tests/fixtures/pilotos/declaraciones.json; todos los casos
 * se pueden rehacer a mano.
 */
import { describe, it, expect } from "vitest";
import declaraciones from "./fixtures/pilotos/declaraciones.json";
import {
  margenContribucion, margenContribucionPonderado, puntoEquilibrio, equilibrioPorProductoEstrella,
  costeoPorSku, costeoPorServicio, estadoDeResultados, comparables, explicarCalculo,
  MOTIVO_SIN_COSTOS_VARIABLES, MOTIVO_SIN_RAZON_MC, NOTA_SIN_REMUNERACION, ROTULO_PRODUCTO_ESTRELLA,
  type Calculo,
} from "@/lib/finanzas";
import { derivados, type Metrica } from "@/lib/metricas";

// MODAS LUCERO (piloto A). Lo declarado está en el fixture; los fijos y las compras salen de su
// propia nota de contradicciones: alquiler 6.500 + planilla 9.000 = 15.500 fijos; compras ~52.000.
const LUCERO = declaraciones.modas_lucero.entrada_breve;
const LUCERO_VENTAS = LUCERO.ventas_mes; // 80.000
const LUCERO_UTILIDAD = LUCERO.ganancia_mes; // 8.000 declarados
const LUCERO_FIJOS = 6500 + 9000; // alquiler + planilla (contradicciones_deliberadas[2])
const LUCERO_COMPRAS = 52000; // «compras ~52,000» (misma nota)

// ESTUDIO VARGAS (piloto B): «Unas 25 horas por caso» y 62 laborales en el semestre; tarifario 1.800.
const VARGAS = declaraciones.estudio_vargas.entrada_breve;
const VARGAS_HORAS_CASO = Number(/(\d+)\s*horas/.exec(VARGAS.horas_por_caso_laboral)![1]); // 25
const VARGAS_CASOS_LABORALES = 62;
const VARGAS_TARIFA_LABORAL = 1800;

/** Todo cálculo, con valor o sin él, tiene que poder explicarse. */
function explicable(c: Calculo<unknown>, nombre: string) {
  expect(c.formula.length, `${nombre}: fórmula`).toBeGreaterThan(20);
  expect(typeof c.periodo, `${nombre}: periodo`).toBe("string");
  expect(Array.isArray(c.fuentes), `${nombre}: fuentes`).toBe(true);
  expect(Array.isArray(c.supuestos), `${nombre}: supuestos`).toBe(true);
  expect(Array.isArray(c.limitaciones), `${nombre}: limitaciones`).toBe(true);
  if (c.valor == null) expect(c.motivo_nulo, `${nombre}: un null sin motivo es un fallo en silencio`).toBeTruthy();
  else expect(c.motivo_nulo, `${nombre}: con valor no hay motivo de nulo`).toBeUndefined();
}

describe("(a) margen de contribución y punto de equilibrio: fijos 15.500, ventas 80.000, costos variables 52.000", () => {
  const mc = margenContribucion({ ventas: LUCERO_VENTAS, costos_variables: LUCERO_COMPRAS, periodo: "2026-08", fuentes: ["ventas-e-inventario.xlsx"] });

  it("la razón es 0,35: (80.000 − 52.000) / 80.000", () => {
    expect(mc.valor!.monto).toBe(28000);
    expect(mc.valor!.razon).toBeCloseTo(0.35, 10);
    explicable(mc, "margenContribucion");
  });

  it("el equilibrio es 15.500 / 0,35 = 44.285,71…, que se muestra como 44.286 y el redondeo queda documentado", () => {
    const pe = puntoEquilibrio({ costos_fijos: LUCERO_FIJOS, razon_mc: mc.valor!.razon, periodo: "2026-08", fuentes: ["contrato-alquiler.pdf", "ventas-e-inventario.xlsx"] });
    expect(pe.valor!.soles).toBeCloseTo(44285.714, 2);
    expect(pe.valor!.soles_redondeado).toBe(44286);
    expect(pe.supuestos.join(" ")).toMatch(/redondea al sol entero/);
    // Lo lee el dueño en «Cómo se calculó»: la cuenta dicha en sus palabras, sin «razón de margen de contribución».
    expect(pe.formula).toContain("costos fijos / lo que queda de cada sol vendido después de pagar lo que cuesta lo vendido");
    expect(`${pe.formula} ${pe.supuestos.join(" ")}`).not.toMatch(/razón|margen de contribución|unitario/i);
    // Sin precio y costo unitario no hay unidades, y se dice en vez de callarlo.
    expect(pe.valor!.unidades).toBeNull();
    expect(pe.limitaciones.join(" ")).toMatch(/solo en soles/);
    explicable(pe, "puntoEquilibrio");
  });

  it("con precio y costo variable unitario también sale en unidades: 15.500 / (120 − 78) = 369,05", () => {
    const pe = puntoEquilibrio({ costos_fijos: LUCERO_FIJOS, razon_mc: 0.35, precio_unitario: 120, costo_variable_unitario: 78 });
    expect(pe.valor!.unidades).toBeCloseTo(15500 / 42, 6);
  });

  it("una razón cero o negativa no produce un equilibrio: nada cubre los fijos", () => {
    expect(puntoEquilibrio({ costos_fijos: 15500, razon_mc: 0 }).valor).toBeNull();
    expect(puntoEquilibrio({ costos_fijos: 15500, razon_mc: -0.1 }).motivo_nulo).toMatch(/cero o negativa/);
    expect(margenContribucion({ ventas: 0, costos_variables: 10 }).valor).toBeNull();
  });
});

describe("(b) mezcla de tres líneas: la razón ponderada no es el promedio simple", () => {
  // A deja 40 %, B 20 %, C 60 %. Promedio simple: 40 %. Ponderado por lo que se vende: 38 %.
  const lineas = [
    { nombre: "Vestidos de fiesta", ventas: 50000, costo_variable: 30000 },
    { nombre: "Blusas", ventas: 30000, costo_variable: 24000 },
    { nombre: "Accesorios", ventas: 20000, costo_variable: 8000 },
  ];

  it("Σ MC / Σ ventas = (20.000 + 6.000 + 12.000) / 100.000 = 0,38", () => {
    const p = margenContribucionPonderado(lineas, { periodo: "2026-08" });
    expect(p.valor!.razon).toBeCloseTo(0.38, 10);
    const promedioSimple = (0.4 + 0.2 + 0.6) / 3;
    expect(p.valor!.razon).not.toBeCloseTo(promedioSimple, 3);
    expect(p.valor!.detalle.map((d) => d.participacion)).toEqual([0.5, 0.3, 0.2]);
    expect(p.valor!.detalle.reduce((s, d) => s + d.participacion, 0)).toBeCloseTo(1, 10);
    explicable(p, "margenContribucionPonderado");
  });

  it("el equilibrio con mezcla usa la razón ponderada: 15.500 / 0,38 = 40.789", () => {
    const p = margenContribucionPonderado(lineas);
    const pe = puntoEquilibrio({ costos_fijos: LUCERO_FIJOS, razon_mc: p.valor!.razon });
    expect(pe.valor!.soles_redondeado).toBe(40789);
  });

  it("si a una línea le falta el costo variable, la razón de la mezcla no existe y se nombra la línea", () => {
    const p = margenContribucionPonderado([...lineas.slice(0, 2), { nombre: "Accesorios", ventas: 20000, costo_variable: null }]);
    expect(p.valor).toBeNull();
    expect(p.motivo_nulo).toContain("1 de 3 líneas sin costo variable");
    expect(p.motivo_nulo).toContain("Accesorios");
  });
});

describe("(c) Modas Lucero: ventas 80.000, utilidad declarada 8.000, SIN costos variables", () => {
  it("el margen de contribución es null con el motivo exacto: la utilidad no lo sustituye", () => {
    const mc = margenContribucion({ ventas: LUCERO_VENTAS, costos_variables: null, periodo: "2026-08" });
    expect(mc.valor).toBeNull();
    expect(mc.motivo_nulo).toBe(MOTIVO_SIN_COSTOS_VARIABLES);
    explicable(mc, "margenContribucion sin costos variables");
  });

  it("el equilibrio de la empresa es null; NO es 155.000 (fijos / (utilidad / ventas)) ni 27.000", () => {
    const rechazada = LUCERO_FIJOS / (LUCERO_UTILIDAD / LUCERO_VENTAS);
    expect(rechazada).toBe(155000); // la cifra que Dirección rechazó, para que quede claro qué NO devolvemos
    const pe = puntoEquilibrio({ costos_fijos: LUCERO_FIJOS, razon_mc: null, periodo: "2026-08" });
    expect(pe.valor).toBeNull();
    expect(pe.motivo_nulo).toBe(MOTIVO_SIN_RAZON_MC);
    expect(pe.valor?.soles).not.toBe(155000);
    expect(pe.valor?.soles).not.toBe(27000);
  });

  it("derivados() con los vitales de Lucero tampoco da 155.000 ni 27.000 como equilibrio de empresa", () => {
    const m = (clave: string, valor: number, periodo = "2026-08"): Metrica => ({ clave, periodo, valor, estado: "contado" });
    const d = derivados([
      m("venta_mes", LUCERO_VENTAS), m("ganancia_mes", LUCERO_UTILIDAD), m("gasto_fijo_mes", LUCERO_FIJOS),
      m("precio_producto_estrella", 180, "actual"), m("costo_producto_estrella", 100, "actual"),
    ]);
    expect(d.equilibrio).toBeNull();
    expect(d.equilibrio).not.toBe(155000);
    expect(d.equilibrio).not.toBe(27000);
    expect(d.detalle.equilibrio.motivo_nulo).toMatch(/costos variables del mes/);
    // La hipótesis del producto estrella sigue disponible, con su rótulo: 15.500 / ((180 − 100) / 180) = 34.875
    expect(d.equilibrioProductoEstrella).toBeCloseTo(34875, 5);
    expect(d.detalle.equilibrioProductoEstrella.supuestos.join(" ").toLowerCase()).toContain(ROTULO_PRODUCTO_ESTRELLA);
  });

  it("derivados() con las compras de Lucero como costo variable del mismo mes da el equilibrio verdadero: 44.286", () => {
    const m = (clave: string, valor: number, periodo = "2026-08"): Metrica => ({ clave, periodo, valor, estado: "contado" });
    const d = derivados([m("venta_mes", LUCERO_VENTAS), m("ganancia_mes", LUCERO_UTILIDAD), m("gasto_fijo_mes", LUCERO_FIJOS), m("costo_variable_mes", LUCERO_COMPRAS)]);
    expect(d.equilibrio).toBeCloseTo(44285.714, 2);
    expect(d.equilibrio).not.toBe(155000);
    expect(d.detalle.equilibrio.motivo_nulo).toBeUndefined();
    explicable(d.detalle.equilibrio, "derivados.equilibrio");
    // Las mismas compras declaradas «de hoy» en vez de agosto: null, y el motivo lo dice en palabras.
    const mezclado = derivados([m("venta_mes", LUCERO_VENTAS), m("gasto_fijo_mes", LUCERO_FIJOS), m("costo_variable_mes", LUCERO_COMPRAS, "actual")]);
    expect(mezclado.equilibrio).toBeNull();
    expect(mezclado.detalle.equilibrio.motivo_nulo).toMatch(/agosto de 2026/);
    expect(mezclado.detalle.equilibrio.motivo_nulo).not.toMatch(/2026-08/);
  });

  it("equilibrioPorProductoEstrella dice lo que es y lo que no es", () => {
    const h = equilibrioPorProductoEstrella({ costos_fijos: LUCERO_FIJOS, precio: 180, costo_unitario: 100, periodo: "2026-08" });
    expect(h.valor!.soles_redondeado).toBe(34875);
    expect(h.valor!.unidades).toBeCloseTo(193.75, 6);
    expect(h.limitaciones.join(" ")).toMatch(/No es el punto de equilibrio de la empresa/);
    expect(equilibrioPorProductoEstrella({ costos_fijos: LUCERO_FIJOS, precio: 100, costo_unitario: 100 }).valor).toBeNull();
    explicable(h, "equilibrioPorProductoEstrella");
  });
});

describe("(d) costeo por SKU: 2 de 5 sin costo → el total es parcial y se dice", () => {
  const skus = [
    { codigo: "VF-01", precio: 180, costo_variable_unitario: 100, unidades: 50 },
    { codigo: "VF-02", precio: 220, costo_variable_unitario: 130, unidades: 30 },
    { codigo: "BL-01", precio: 70, costo_variable_unitario: 40, unidades: 200 },
    { codigo: "BL-02", precio: 65, costo_variable_unitario: null, unidades: 120 },
    { codigo: "AC-01", precio: 25, costo_variable_unitario: null, unidades: 300 },
  ];

  it("totales solo sobre los tres completos, con aviso de cuántos faltan", () => {
    const c = costeoPorSku(skus, { periodo: "2026-08", fuentes: ["ventas-e-inventario.xlsx · hoja Inventario"] });
    expect(c.valor!.parcial).toBe(true);
    expect(c.valor!.aviso).toBe("2 de 5 sin costo o sin unidades: el total es parcial");
    expect(c.valor!.sin_costo).toBe(2);
    expect(c.valor!.con_costo).toBe(3);
    // (180−100)×50 + (220−130)×30 + (70−40)×200 = 4.000 + 2.700 + 6.000
    expect(c.valor!.total_mc).toBe(12700);
    expect(c.valor!.total_ventas).toBe(180 * 50 + 220 * 30 + 70 * 200);
    expect(c.limitaciones).toContain(c.valor!.aviso!);
    explicable(c, "costeoPorSku");
  });

  it("los SKU sin costo aparecen en el detalle con su hueco explicado, no con un promedio", () => {
    const c = costeoPorSku(skus);
    const bl02 = c.valor!.detalle.find((d) => d.codigo === "BL-02")!;
    expect(bl02.mc_unitaria).toBeNull();
    expect(bl02.mc_total).toBeNull();
    expect(bl02.motivo).toBe("sin costo unitario");
    // La participación sí se conoce: depende del precio y las unidades, no del costo.
    expect(bl02.participacion).toBeCloseTo((65 * 120) / (180 * 50 + 220 * 30 + 70 * 200 + 65 * 120 + 25 * 300), 10);
  });

  it("si ningún SKU está completo no hay total, y el motivo lo cuenta", () => {
    const c = costeoPorSku(skus.map((s) => ({ ...s, costo_variable_unitario: null })));
    expect(c.valor).toBeNull();
    expect(c.motivo_nulo).toContain("5 sin costo");
  });
});

describe("(e) costeo por servicio: Estudio Vargas, 62 casos laborales × 25 h contra 2 personas × 160 h", () => {
  const laboral = { nombre: "Laboral", tarifa: VARGAS_TARIFA_LABORAL, horas_por_caso: VARGAS_HORAS_CASO, casos: VARGAS_CASOS_LABORALES, costo_hora: 40 };
  const capacidad = { personas: 2, horas_mes_por_persona: 160 };

  it("1.550 horas contra 320 disponibles: utilización 484 % y margen por hora 32", () => {
    const c = costeoPorServicio([laboral], capacidad, { periodo: "2026-I" });
    expect(c.valor!.horas_requeridas).toBe(1550);
    expect(c.valor!.horas_disponibles).toBe(320);
    expect(c.valor!.utilizacion_pct).toBeCloseTo(484.375, 6);
    expect(c.valor!.utilizacion_pct!).toBeGreaterThan(100);
    // ingreso 111.600; costo 40 × 1.550 = 62.000; (111.600 − 62.000) / 1.550 = 32
    expect(c.valor!.detalle[0]!.ingreso).toBe(111600);
    expect(c.valor!.detalle[0]!.ingreso_por_hora).toBeCloseTo(72, 6);
    expect(c.valor!.detalle[0]!.mc_por_hora).toBeCloseTo(32, 6);
    expect(c.limitaciones.join(" ")).toMatch(/superan la capacidad/);
    explicable(c, "costeoPorServicio");
  });

  it("los 62 casos son de un semestre: con meses = 6 la utilización baja a 81 % (el periodo cambia la lectura)", () => {
    const c = costeoPorServicio([laboral], { ...capacidad, meses: 6 });
    expect(c.valor!.horas_disponibles).toBe(1920);
    expect(c.valor!.utilizacion_pct).toBeCloseTo(80.729, 2);
    expect(c.supuestos.join(" ")).toContain("× 6 mes(es)");
  });

  it("horas null → margen por hora null con motivo «horas no registradas»; el resultado sigue siendo válido", () => {
    const c = costeoPorServicio([{ ...laboral, horas_por_caso: null }], capacidad);
    expect(c.valor).not.toBeNull();
    expect(c.valor!.detalle[0]!.mc_por_hora).toBeNull();
    expect(c.valor!.detalle[0]!.ingreso_por_hora).toBeNull();
    expect(c.valor!.detalle[0]!.motivo).toBe("horas no registradas");
    expect(c.valor!.utilizacion_pct).toBeNull();
    expect(c.valor!.servicios_sin_horas).toEqual(["Laboral"]);
    expect(c.valor!.ingreso_total).toBe(111600);
    expect(c.limitaciones.join(" ")).toMatch(/Horas no registradas en: Laboral/);
  });

  it("costo por hora null → margen por hora null con su motivo, pero el ingreso por hora sí se da", () => {
    const c = costeoPorServicio([{ ...laboral, costo_hora: null }], capacidad);
    expect(c.valor!.detalle[0]!.ingreso_por_hora).toBeCloseTo(72, 6);
    expect(c.valor!.detalle[0]!.mc_por_hora).toBeNull();
    expect(c.valor!.detalle[0]!.motivo).toBe("costo por hora no registrado");
  });
});

describe("(f) estado de resultados: con y sin remuneración del propietario", () => {
  const base = { ventas: LUCERO_VENTAS, costo_ventas: LUCERO_COMPRAS, gastos_operativos: LUCERO_FIJOS, otros: 0, impuestos: 0, periodo: "2026-08" };

  it("sin remuneración: bruta 28.000, operativa 12.500, y la nota de que la utilidad suele esconder el sueldo del dueño", () => {
    const er = estadoDeResultados(base);
    expect(er.valor!.utilidad_bruta).toBe(28000);
    expect(er.valor!.utilidad_operativa).toBe(12500);
    expect(er.valor!.utilidad_neta).toBe(12500);
    expect(er.valor!.remuneracion_propietario_considerada).toBe(false);
    expect(er.limitaciones).toContain(NOTA_SIN_REMUNERACION);
    explicable(er, "estadoDeResultados");
  });

  it("con remuneración 4.500: la operativa baja a 8.000 —justo lo que Lucero declara— y la nota desaparece", () => {
    const er = estadoDeResultados({ ...base, remuneracion_propietario: 4500 });
    expect(er.valor!.utilidad_operativa).toBe(LUCERO_UTILIDAD);
    expect(er.valor!.remuneracion_propietario_considerada).toBe(true);
    expect(er.limitaciones).not.toContain(NOTA_SIN_REMUNERACION);
  });

  it("impuestos u otros sin registrar no son cero: la neta queda null con motivo, la operativa se mantiene", () => {
    const er = estadoDeResultados({ ...base, impuestos: null });
    expect(er.valor!.utilidad_operativa).toBe(12500);
    expect(er.valor!.utilidad_neta).toBeNull();
    expect(er.valor!.motivos.utilidad_neta).toMatch(/impuestos no registrados/);
    const sinOtros = estadoDeResultados({ ...base, otros: null });
    expect(sinOtros.valor!.utilidad_neta).toBeNull();
    expect(sinOtros.valor!.motivos.utilidad_neta).toMatch(/no se asumen en cero/);
  });

  it("un retiro de la dueña no entra en el resultado: las cifras no cambian y queda constancia de que se dejó fuera", () => {
    const sin = estadoDeResultados(base);
    const con = estadoDeResultados({ ...base, movimientos_patrimoniales: [{ tipo: "retiro", monto: 3000, fecha: "2026-08-15" }, { tipo: "aporte", monto: 10000, fecha: "2026-08-02" }] });
    expect(con.valor!.utilidad_bruta).toBe(sin.valor!.utilidad_bruta);
    expect(con.valor!.utilidad_operativa).toBe(sin.valor!.utilidad_operativa);
    expect(con.valor!.utilidad_neta).toBe(sin.valor!.utilidad_neta);
    expect(con.supuestos.join(" ")).toMatch(/2 movimiento\(s\) patrimonial\(es\) por S\/ 13000 \(retiro, aporte\): no son ingreso ni gasto/);
  });

  it("sin costo de ventas no hay bruta ni nada que cuelgue de ella; cada hueco con su motivo", () => {
    const er = estadoDeResultados({ ...base, costo_ventas: null });
    expect(er.valor!.utilidad_bruta).toBeNull();
    expect(er.valor!.utilidad_operativa).toBeNull();
    expect(er.valor!.motivos.utilidad_bruta).toBe("costo de ventas no registrado");
  });
});

describe("(g) comparables: no se suma un total con una de sus partes", () => {
  const p = (clave: string, valor: number, extra: Partial<{ periodo: string; moneda: "PEN" | "USD"; incluye: string[] }> = {}) =>
    ({ clave, valor, periodo: "2026-08", ...extra });

  it("ventas al contado + ventas con tarjeta: sí", () => {
    expect(comparables(p("ventas_contado", 50000), p("ventas_tarjeta", 30000)).ok).toBe(true);
  });

  it("total de ventas + ventas al contado: no, por el nombre", () => {
    const r = comparables(p("total_ventas", 80000), p("ventas_contado", 50000));
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/total que, por su nombre, contiene a ventas_contado/);
    expect(comparables(p("ventas_contado", 50000), p("ventas_total", 80000)).ok).toBe(false);
  });

  it("un total que declara sus partes tampoco se suma con ellas", () => {
    const r = comparables(p("ingresos", 80000, { incluye: ["honorarios_laboral", "honorarios_civil"] }), p("honorarios_civil", 30000));
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("ingresos ya contiene a honorarios_civil");
  });

  it("periodos o monedas distintas: no", () => {
    expect(comparables(p("ventas_contado", 50000), p("ventas_tarjeta", 30000, { periodo: "2026-07" })).motivo).toMatch(/periodos distintos/);
    expect(comparables(p("ventas_contado", 50000), p("ventas_tarjeta", 30000, { moneda: "USD" })).motivo).toMatch(/monedas distintas/);
  });

  it("la misma cifra dos veces se duplica, no se suma", () => {
    expect(comparables(p("venta_mes", 80000), p("venta_mes", 80000)).ok).toBe(false);
  });
});

describe("explicarCalculo: lo que ve el dueño en el detalle desplegable", () => {
  it("un cálculo sin valor abre con el porqué; uno con valor no", () => {
    const sin = explicarCalculo(puntoEquilibrio({ costos_fijos: 15500, razon_mc: null }));
    expect(sin[0]!.etiqueta).toBe("Por qué no hay cifra");
    expect(sin[0]!.texto).toBe(MOTIVO_SIN_RAZON_MC);
    const con = explicarCalculo(puntoEquilibrio({ costos_fijos: 15500, razon_mc: 0.35, fuentes: ["ventas-e-inventario.xlsx"] }));
    expect(con[0]!.etiqueta).toBe("Cómo se calcula");
    expect(con.map((l) => l.etiqueta)).toEqual(["Cómo se calcula", "Periodo", "De dónde salen los números", "Lo que se asume", "Lo que no dice"]);
    expect(con.find((l) => l.etiqueta === "De dónde salen los números")!.texto).toBe("ventas-e-inventario.xlsx");
  });
});
