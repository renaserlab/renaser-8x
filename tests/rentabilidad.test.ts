/**
 * CUÁNTO DEJA CADA COSA QUE SE VENDE (src/lib/rentabilidad.ts, 16-10-2026).
 *
 * Dos empresas FICTICIAS (nunca datos de un cliente real: regla del commit 70a3701):
 *  · «Jeans del Valle»: fabrica y vende; dos precios (por menor y por mayor), costo por partes (tela, costura, lavado,
 *    accesorios), volumen exacto, en rango y «de cada 10». Diez productos pensados para que caigan en los cuatro
 *    cuadrantes, uno en el borde, uno que resta y dos sin datos completos.
 *  · «Boutique Andina»: compra y revende, y exporta a Chile: cobra en pesos chilenos (CLP) días después y pierde en el
 *    cambio. Vende al crédito y guarda mercadería.
 *
 * Toda cifra esperada está calculada a mano en el comentario de cada caso, para que alguien sin el código la rehaga.
 */
import { describe, it, expect, vi } from "vitest";
import {
  productoRentable, volumenMensual, tableroRentabilidad, palanca, fugaCambiaria, resumenMensualParaDueno, usaTablaNueva, fichaDesdeFila,
  CUADRANTE_TEXTO, FICHA_VACIA, type FichaNegocio, type CostoMes, type OperacionMoneda,
} from "@/lib/rentabilidad";
import { explicarCalculo } from "@/lib/finanzas";
import { porDefecto } from "@/lib/formato";
import type { LineaProducto } from "@/lib/producto";
import type { Metrica } from "@/lib/metricas";

const EMP = "0000000a-0000-4000-8000-00000000000a";

/** Una línea armada a mano; lo que no se dice queda null, que es como llega de la base. */
const linea = (id: string, nombre: string, extra: Partial<LineaProducto> = {}): LineaProducto => ({
  id, company_id: EMP, codigo: null, nombre, tipo: "producto", cliente_objetivo: null, necesidad: null, promesa: null,
  precio: null, costo_variable_unitario: null, unidades_periodo: null, horas_por_unidad: null, periodo: null, origen: "declarado", source_id: null,
  decision: null, decision_motivo: null, modelo: "fabrica_y_vende", grupo: null, canal: null, precio_segundo: null, segundo_precio_es: null,
  de_cada_10_segundo: null, componentes_costo: [], unidades_mes: null, unidades_mes_desde: null, unidades_mes_hasta: null, participacion_de_10: null,
  estados: {}, datos_modelo: null, creada_por: null, ...extra,
});

const parte = (nombre: string, valor: number | null, estado: "estimado" | "contado" | "comprobado" | "no_lo_se" = "contado") =>
  valor == null ? { nombre, estado: estado === "no_lo_se" ? ("no_lo_se" as const) : estado } : { nombre, valor, estado };

// ─── Jeans del Valle (ficticia) ──────────────────────────────────────────────────────────────────

const JEANS: LineaProducto[] = [
  // L1: 80 por menor, 60 por mayor, 4 de cada 10 por mayor → (80·6 + 60·4)/10 = 72. Partes 18+8+5+4 = 35 → deja 37. 300 al mes → 11,100.
  linea("L1", "Jean Clásico", { precio: 80, precio_segundo: 60, segundo_precio_es: "por_mayor", de_cada_10_segundo: 4, componentes_costo: [parte("tela", 18), parte("costura", 8), parte("lavado", 5), parte("accesorios", 4)], unidades_mes: 300, estados: { precio: "contado", unidades: "contado" } }),
  // L2: 90 y 70 por mayor SIN «de cada 10» → precio entre 70 y 90. Partes 20+9+6+5 = 40 → deja entre 30 y 50. Vende 90 a 130.
  linea("L2", "Pantalón Cargo", { precio: 90, precio_segundo: 70, segundo_precio_es: "por_mayor", componentes_costo: [parte("tela", 20), parte("costura", 9), parte("lavado", 6, "estimado"), parte("accesorios", 5)], unidades_mes_desde: 90, unidades_mes_hasta: 130 }),
  // L3: el lavado está como «no lo sé» → costo de al menos 10 + 5 = 15.
  linea("L3", "Short Jean", { precio: 45, componentes_costo: [parte("tela", 10), parte("costura", 5), parte("lavado", null, "no_lo_se")], unidades_mes: 80 }),
  // L4: 2 de cada 10 casacas; el grupo vende 50 al mes → 10. Deja 150 − 95 = 55.
  linea("L4", "Casaca Jean", { grupo: "Casacas", precio: 150, costo_variable_unitario: 95, participacion_de_10: 2 }),
  // L5: 3 de cada 10 del grupo «Niños», pero nadie dijo cuántos niños vende en total.
  linea("L5", "Jean Niño", { grupo: "Niños", precio: 40, costo_variable_unitario: 22, participacion_de_10: 3 }),
  linea("L6", "Jean Premium", { precio: 120, costo_variable_unitario: 60, unidades_mes: 40 }),
  linea("L7", "Polo Básico", { precio: 30, costo_variable_unitario: 26, unidades_mes: 400 }),
  linea("L8", "Gorra", { precio: 15, costo_variable_unitario: 12, unidades_mes: 20 }),
  // L9: deja 85 − 50 = 35 y vende entre 120 y 250: cae a los dos lados del umbral de volumen.
  linea("L9", "Jean Slim", { precio: 85, costo_variable_unitario: 50, unidades_mes_desde: 120, unidades_mes_hasta: 250 }),
  // L10: cuesta más de lo que se cobra: resta.
  linea("L10", "Jean Outlet", { precio: 30, costo_variable_unitario: 35, unidades_mes: 50 }),
];

const FICHA_JEANS: FichaNegocio = { ...FICHA_VACIA, totales: { grupos: { Casacas: { valor: 50, estado: "estimado" } } } };

const COSTOS_JEANS: CostoMes[] = [
  { id: "c1", periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler del taller", dato: { valor: 2500, estado: "contado" }, nota: null },
  { id: "c2", periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos", dato: { valor: 6000, estado: "contado" }, nota: null },
  { id: "c3", periodo: "mes_tipico", tipo: "fijo", nombre: "Luz y agua", dato: { desde: 300, hasta: 500, estado: "estimado" }, nota: null },
  { id: "c4", periodo: "mes_tipico", tipo: "comercializacion", nombre: "Publicidad", dato: { valor: 800, estado: "contado" }, nota: null },
  { id: "c5", periodo: "mes_tipico", tipo: "comercializacion", nombre: "Comisión de la vendedora", dato: { valor: 1200, estado: "contado" }, nota: null },
];

/** En «Tus números» dijo 7,000 de gastos fijos: la tabla suma entre 8,800 y 9,000. */
const METRICAS_JEANS: Metrica[] = [
  { clave: "gasto_fijo_mes", periodo: "2026-08", valor: 6500, estado: "contado" },
  { clave: "gasto_fijo_mes", periodo: "2026-09", valor: 7000, estado: "contado" },
  { clave: "venta_mes", periodo: "2026-09", valor: 60000, estado: "contado" },
];

const tableroJeans = () => tableroRentabilidad({ lineas: JEANS, costos: COSTOS_JEANS, ficha: FICHA_JEANS, operaciones: [], metricas: METRICAS_JEANS, config: porDefecto });
const prod = (t: ReturnType<typeof tableroJeans>, id: string) => t.productos.find((p) => p.id === id)!;

describe("Jeans del Valle (ficticia) · por producto", () => {
  it("dos precios con «de cada 10»: el promedio ponderado, exacto", () => {
    const p = productoRentable(JEANS[0]!, FICHA_JEANS);
    expect(p.precio_efectivo).toEqual({ bajo: 72, alto: 72 });
    expect(p.costo).toEqual({ bajo: 35, alto: 35 });
    expect(p.margen_unitario).toEqual({ bajo: 37, alto: 37 });
    expect(p.margen_pct!.bajo).toBeCloseTo(37 / 72, 6);
    expect(p.contribucion_mes).toEqual({ bajo: 11100, alto: 11100 });
    expect(p.estados).toEqual({ precio: "contado", costo: "contado", unidades: "contado" });
    expect(p.motivos).toEqual([]);
  });

  it("dos precios SIN «de cada 10»: el rango entre los dos, y lo que falta nombrado", () => {
    const p = productoRentable(JEANS[1]!, FICHA_JEANS);
    expect(p.precio_efectivo).toEqual({ bajo: 70, alto: 90 });
    expect(p.motivos).toContain("falta: de cada 10 ventas, cuántas van por mayor");
    expect(p.margen_unitario).toEqual({ bajo: 30, alto: 50 });
    // (p − c)/p con el peor caso: 1 − 40/70 y 1 − 40/90.
    expect(p.margen_pct!.bajo).toBeCloseTo(1 - 40 / 70, 6);
    expect(p.margen_pct!.alto).toBeCloseTo(1 - 40 / 90, 6);
    expect(p.contribucion_mes).toEqual({ bajo: 2700, alto: 6500 });
    // El lavado es a ojo: el costo vale lo que su parte más floja.
    expect(p.estados.costo).toBe("estimado");
  });

  it("partes incompletas: no hay costo, se dice «de al menos» cuánto y qué falta", () => {
    const p = productoRentable(JEANS[2]!, FICHA_JEANS);
    expect(p.costo).toBeNull();
    expect(p.margen_unitario).toBeNull();
    expect(p.contribucion_mes).toBeNull();
    expect(p.motivos).toContain("costo de al menos S/ 15; falta: lavado");
    expect(p.costo_partes.find((c) => c.nombre === "lavado")).toEqual({ nombre: "lavado", rango: null, estado: "no_lo_se" });
  });

  it("«de cada 10» con el total de su grupo: unidades del mes, a lo sumo estimadas", () => {
    expect(volumenMensual(JEANS[3]!, FICHA_JEANS)).toEqual({ rango: { bajo: 10, alto: 10 }, fuente: "de_cada_10", motivo: null });
    const p = productoRentable(JEANS[3]!, FICHA_JEANS);
    expect(p.contribucion_mes).toEqual({ bajo: 550, alto: 550 });
    expect(p.estados.unidades).toBe("estimado");
  });

  it("«de cada 10» sin el total de su grupo: no se inventa un volumen, se pide el total", () => {
    const v = volumenMensual(JEANS[4]!, FICHA_JEANS);
    expect(v.rango).toBeNull();
    expect(v.motivo).toBe("falta: cuántos «Niños» vende en total en un mes normal (dijo 3 de cada 10)");
    // Con el total de toda la empresa (clave ""), sí: 3 de cada 10 de 200.
    const conEmpresa: FichaNegocio = { ...FICHA_JEANS, totales: { grupos: { "": { valor: 200, estado: "estimado" } } } };
    expect(volumenMensual(JEANS[4]!, conEmpresa).rango).toEqual({ bajo: 60, alto: 60 });
  });

  it("lo del periodo se lleva a un mes normal, y se dice que es un promedio", () => {
    const l = linea("V", "Vestido", { precio: 100, costo_variable_unitario: 50, unidades_periodo: 90, periodo: "2026-T3" });
    expect(volumenMensual(l, FICHA_VACIA)).toEqual({ rango: { bajo: 30, alto: 30 }, fuente: "periodo", motivo: "promedio de trimestre 3 de 2026 (3 meses)" });
  });
});

describe("Jeans del Valle (ficticia) · el tablero de la consultora", () => {
  it("umbrales explícitos de la propia empresa, y no la regla del 70 %", () => {
    const t = tableroJeans();
    // Σ unidades (centros) = 300+110+10+40+400+20+185+50 = 1115 en 8 líneas → 139.375.
    // Σ lo que dejan (centros) = 11100+4600+550+2400+1600+60+6475−250 = 26535 → 26535/1115.
    expect(t.umbrales.con_datos).toBe(8);
    expect(t.umbrales.de).toBe(10);
    expect(t.umbrales.unidades_mes).toBeCloseTo(139.375, 6);
    expect(t.umbrales.margen_unitario).toBeCloseTo(26535 / 1115, 6);
    expect(t.umbrales.regla).toMatch(/no es la regla del 70 %/);
  });

  it("los cuatro cuadrantes, el borde y los sin dato", () => {
    const t = tableroJeans();
    expect(t.matriz).toEqual({ estrella: ["L1"], caballo: ["L7"], joya: ["L2", "L4", "L6"], hueso: ["L8", "L10"], en_el_borde: ["L9"], sin_dato: ["L3", "L5"] });
    expect(prod(t, "L9").cuadrante).toBe("en_el_borde");
    expect(prod(t, "L3").cuadrante).toBeNull();
    expect(CUADRANTE_TEXTO.caballo.nombre).toBe("Caballo de trabajo");
    expect(CUADRANTE_TEXTO.joya.nombre).toBe("Joya escondida");
  });

  it("con menos de 3 productos con datos no hay matriz, y se dice por qué", () => {
    const t = tableroRentabilidad({ lineas: [JEANS[0]!, JEANS[5]!, JEANS[2]!], costos: [], ficha: FICHA_JEANS, operaciones: [], metricas: [], config: porDefecto });
    expect(t.umbrales.margen_unitario).toBeNull();
    expect(t.matriz.estrella).toEqual([]);
    expect(t.faltan).toContain("con menos de 3 productos con datos no hay con qué comparar");
  });

  it("el 90/10: 4 de 8 líneas dejan el 90 %; la que resta va aparte; con fórmula y supuestos", () => {
    const t = tableroJeans();
    // De mayor a menor: 11100, 6475, 4600, 2400 = 24575 ≥ 90 % de 26785 (las que dejan algo).
    expect(t.noventaDiez.valor).toMatchObject({ lineas: ["L1", "L9", "L2", "L6"], cuantas: 4, de: 8, pct_lineas: 0.5, restan: ["L10"] });
    expect(t.noventaDiez.valor!.pct_contribucion).toBeCloseTo(24575 / 26785, 3);
    expect(t.noventaDiez.formula).toMatch(/90 %/);
    expect(t.noventaDiez.limitaciones.join(" ")).toMatch(/Entre las 8 líneas con datos completos, de 10/);
    expect(t.noventaDiez.supuestos.join(" ")).toMatch(/centro del rango/);
  });

  it("gastos del mes: la tabla manda; la diferencia con los 9 números se informa, no se elige", () => {
    const t = tableroJeans();
    expect(t.fijos.fuente).toBe("costos_mes");
    expect(t.fijos.total).toEqual({ bajo: 10800, alto: 11000 });
    expect(t.fijos.solo_fijos).toEqual({ bajo: 8800, alto: 9000 });
    expect(t.fijos.comercializacion).toEqual({ bajo: 2000, alto: 2000 });
    // El vital más reciente (setiembre: 7,000), no el de agosto.
    expect(t.fijos.vital).toBe(7000);
    expect(t.fijos.diferencia_pct).toBeCloseTo(((8900 - 7000) / 7000) * 100, 0);
    expect(t.faltan.some((f) => /difieren 27\.1 %: se informa, no se elige/.test(f))).toBe(true);
    // Sin filas en la tabla, el vital, rotulado.
    const soloVital = tableroRentabilidad({ lineas: JEANS, costos: [], ficha: FICHA_JEANS, operaciones: [], metricas: METRICAS_JEANS, config: porDefecto });
    expect(soloVital.fijos).toMatchObject({ fuente: "vital", total: { bajo: 7000, alto: 7000 }, diferencia_pct: null });
    expect(soloVital.equilibrio.supuestos.join(" ")).toMatch(/de tus 9 números/);
  });

  it("el punto de equilibrio con la mezcla de hoy, en rango, con lo que se asume", () => {
    const t = tableroJeans();
    const e = t.equilibrio.valor!;
    // Lo que deja cada unidad de la mezcla, pesado por unidades: (25235 a 27435) / 1115.
    const mBajo = 25235 / 1115;
    const mAlto = 27435 / 1115;
    expect(e.unidades.bajo).toBeCloseTo(10800 / mAlto, 6);
    expect(e.unidades.alto).toBeCloseTo(11000 / mBajo, 6);
    expect(e.vendes_hoy).toEqual({ bajo: 1030, alto: 1200 });
    // En dinero: 10,900 / (26535 / 66225).
    expect(e.soles).toBeCloseTo(10900 / (26535 / 66225), 3);
    expect(e.por_producto).toHaveLength(8);
    expect(t.equilibrio.supuestos.join(" ")).toMatch(/La mezcla de hoy se mantiene/);
    expect(t.equilibrio.formula).toMatch(/gastos del mes/);
    expect(explicarCalculo(t.equilibrio).map((l) => l.etiqueta)).toContain("Lo que se asume");
  });

  it("equilibrio sin gastos del mes, y con lo que deja la mezcla en cero o negativo: null con el motivo de finanzas.ts", () => {
    const sinFijos = tableroRentabilidad({ lineas: JEANS, costos: [], ficha: FICHA_JEANS, operaciones: [], metricas: [], config: porDefecto });
    expect(sinFijos.equilibrio.valor).toBeNull();
    expect(sinFijos.equilibrio.motivo_nulo).toBe("sin costos fijos no hay punto de equilibrio");
    expect(sinFijos.faltan).toContain("faltan los gastos del mes (ni en la tabla de gastos ni en los 9 números)");

    const perdedoras = [JEANS[9]!, linea("P2", "Bermuda", { precio: 20, costo_variable_unitario: 25, unidades_mes: 30 })];
    const negativo = tableroRentabilidad({ lineas: perdedoras, costos: COSTOS_JEANS, ficha: FICHA_VACIA, operaciones: [], metricas: [], config: porDefecto });
    expect(negativo.equilibrio.valor).toBeNull();
    expect(negativo.equilibrio.motivo_nulo).toMatch(/cero o negativa: ningún volumen de venta cubre los fijos/);
  });

  it("palanca de precio: si sube 5 % y vende lo mismo, deja más; y cuánto volumen podría perder sin perder dinero", () => {
    const t = tableroJeans();
    const r = palanca(t, { tipo: "precio", lineaId: "L1", pct: 5 });
    // 72 × 5 % = 3.6 por unidad × 300 = 1,080 al mes; margen 37 → 40.6; 1 − 37/40.6 = 8.9 %.
    expect(r.valor!.delta_mes.bajo).toBeCloseTo(1080, 6);
    expect(r.valor!.delta_mes.alto).toBeCloseTo(1080, 6);
    expect(r.valor!.nuevo_margen_unitario.bajo).toBeCloseTo(40.6, 6);
    expect(r.valor!.volumen_que_se_puede_perder_pct).toBeCloseTo(8.9, 1);
    expect(r.valor!.nuevo_equilibrio_unidades!.alto).toBeLessThan(t.equilibrio.valor!.unidades.alto);
    expect(r.supuestos[0]).toMatch(/vendes la misma cantidad que hoy/);
    expect(r.limitaciones.join(" ")).toMatch(/no una promesa/);
  });

  it("palanca de una parte del costo y de volumen; y sugeridas para las tres que más se venden", () => {
    const t = tableroJeans();
    expect(palanca(t, { tipo: "parte", lineaId: "L1", parte: "tela", pct: 10 }).valor!.delta_mes).toEqual({ bajo: 540, alto: 540 });
    expect(palanca(t, { tipo: "volumen", lineaId: "L7", pct: 10 }).valor!.delta_mes.alto).toBeCloseTo(160, 6);
    expect(palanca(t, { tipo: "parte", lineaId: "L1", parte: "botones", pct: 10 }).motivo_nulo).toMatch(/no tiene una parte del costo llamada «botones»/);
    expect(palanca(t, { tipo: "precio", lineaId: "L3", pct: 5 }).valor).toBeNull();
    expect(t.palancasSugeridas).toEqual([
      { tipo: "precio", lineaId: "L7", pct: 5 },
      { tipo: "precio", lineaId: "L1", pct: 5 },
      { tipo: "parte", lineaId: "L1", parte: "tela", pct: 10 },
      { tipo: "precio", lineaId: "L9", pct: 5 },
    ]);
  });
});

describe("Jeans del Valle (ficticia) · lo que ve el dueño", () => {
  it("en sus palabras: cuánto deja al mes, sin palabras de consultora ni ceros inventados", () => {
    const r = resumenMensualParaDueno(JEANS, FICHA_JEANS, porDefecto);
    expect(r.lineas.find((l) => l.id === "L1")!.deja).toBe("Al mes te deja S/ 11,100.");
    expect(r.lineas.find((l) => l.id === "L2")!.deja).toBe("Al mes te deja entre S/ 2,700 y S/ 6,500.");
    expect(r.lineas.find((l) => l.id === "L3")!.deja).toBe("Todavía no sabemos cuánto te deja: falta lo que te cuesta cada unidad.");
    expect(r.lineas.find((l) => l.id === "L5")!.deja).toBe("Te deja S/ 18 por unidad. Falta saber cuántos vendiste el mes pasado.");
    expect(r.lineas.find((l) => l.id === "L10")!.deja).toBe("Al mes te cuesta S/ 250 más de lo que cobras.");
    expect(r.dejanMas.map((d) => d.nombre)).toEqual(["Jean Clásico", "Jean Slim", "Pantalón Cargo"]);
    expect(r.faltan).toBe("De 2 de tus 10 productos o servicios todavía no sabemos cuánto te deja en un mes: falta lo que te cuesta y cuántos vendiste el mes pasado. No lo calculamos a ojo.");
    const todo = JSON.stringify(r);
    expect(todo).not.toMatch(/contribuci[oó]n|costo variable|\bSKU\b|matriz|\bKPI\b|claim|extra[ií]do|\bIA\b/i);
    expect(todo).not.toMatch(/S\/ 0\b/);
  });

  it("la tabla nueva se reconoce por sus datos", () => {
    expect(usaTablaNueva(JEANS)).toBe(true);
    expect(usaTablaNueva([linea("X", "Viejo", { modelo: null, precio: 10, costo_variable_unitario: 5, unidades_periodo: 3, periodo: "2026-09" })])).toBe(false);
  });
});

// ─── Lo dicho como se habla: rangos y cobro por hora ─────────────────────────────────────────────

describe("rangos en el precio, el costo total y los «de cada 10»; cobrar por hora", () => {
  it("precio «62 a 66» y costo total «20 a 22» (en datos_modelo, la columna vacía): el rango se arrastra, no su centro", () => {
    const l = linea("R1", "Polo estampado", { precio: null, costo_variable_unitario: null, unidades_mes: 100, datos_modelo: { rango_precio: { desde: 62, hasta: 66 }, rango_costo: { desde: 20, hasta: 22 } } });
    const p = productoRentable(l, FICHA_VACIA);
    expect(p.precio_efectivo).toEqual({ bajo: 62, alto: 66 });
    expect(p.costo).toEqual({ bajo: 20, alto: 22 });
    expect(p.margen_unitario).toEqual({ bajo: 40, alto: 46 });
    expect(p.contribucion_mes).toEqual({ bajo: 4000, alto: 4600 });
    expect(p.motivos).toEqual([]);
    // Si la columna tiene número, manda la columna (lo más nuevo que se escribió): el rango viejo no se usa.
    expect(productoRentable({ ...l, precio: 50 }, FICHA_VACIA).precio_efectivo).toEqual({ bajo: 50, alto: 50 });
    expect(usaTablaNueva([linea("R2", "Solo rango", { modelo: null, datos_modelo: { rango_precio: { desde: 10, hasta: 12 } } })])).toBe(true);
  });

  it("«de cada 10 van por mayor: 3 o 4»: el precio queda entre las esquinas; «de cada 10 son Slim: 3 o 4», el volumen en rango", () => {
    // 80 por menor, 60 por mayor, 3 a 4 de cada 10 por mayor: (80·7 + 60·3)/10 = 74 y (80·6 + 60·4)/10 = 72.
    const l = linea("R3", "Pantalón Cargo", { precio: 80, precio_segundo: 60, segundo_precio_es: "por_mayor", costo_variable_unitario: 40, unidades_mes: 100, datos_modelo: { rango_de_cada_10_segundo: { desde: 3, hasta: 4 } } });
    expect(productoRentable(l, FICHA_VACIA).precio_efectivo).toEqual({ bajo: 72, alto: 74 });
    expect(productoRentable(l, FICHA_VACIA).motivos).toEqual([]);
    // De un grupo de 300 al mes, 3 o 4 de cada 10: entre 90 y 120.
    const ficha: FichaNegocio = { ...FICHA_VACIA, totales: { grupos: { Jeans: { valor: 300, estado: "contado" } } } };
    const v = volumenMensual(linea("R4", "Jean Slim", { grupo: "Jeans", datos_modelo: { rango_de_cada_10: { desde: 3, hasta: 4 } } }), ficha);
    expect(v).toEqual({ rango: { bajo: 90, alto: 120 }, fuente: "de_cada_10", motivo: null });
    expect(volumenMensual(linea("R5", "Jean Mom", { grupo: "Mom", datos_modelo: { rango_de_cada_10: { desde: 3, hasta: 4 } } }), ficha).motivo).toBe("falta: cuántos «Mom» vende en total en un mes normal (dijo 3 a 4 de cada 10)");
  });

  it("un estudio que cobra S/ 150 la hora, con casos de 6 horas que le cuestan S/ 800: deja S/ 100 por caso, no «te cuesta S/ 650 más»", () => {
    const base = { modelo: "vende_horas_o_casos" as const, tipo: "servicio" as const, precio: 150, costo_variable_unitario: 800, unidades_mes: 20, datos_modelo: { por_hora: true } };
    const p = productoRentable(linea("H1", "Defensa laboral", { ...base, horas_por_unidad: 6 }), FICHA_VACIA);
    expect(p.precio_efectivo).toEqual({ bajo: 900, alto: 900 });
    expect(p.margen_unitario).toEqual({ bajo: 100, alto: 100 });
    expect(p.contribucion_mes).toEqual({ bajo: 2000, alto: 2000 });
    // Sin las horas de un caso no hay precio de un caso: margen null, y se dice qué falta.
    const sinHoras = productoRentable(linea("H2", "Consulta", { ...base, horas_por_unidad: null }), FICHA_VACIA);
    expect(sinHoras.precio_efectivo).toBeNull();
    expect(sinHoras.margen_unitario).toBeNull();
    expect(sinHoras.motivos).toContain("falta: cuántas horas lleva un caso (cobra por hora)");
    const r = resumenMensualParaDueno([linea("H2", "Consulta", { ...base, horas_por_unidad: null })], FICHA_VACIA, porDefecto);
    expect(r.lineas[0]!.deja).toBe("Todavía no sabemos cuánto te deja: falta cuántas horas te lleva cada caso.");
    expect(r.lineas[0]!.deja).not.toMatch(/más de lo que cobras/);
    expect(r.faltan).toMatch(/cuántas horas te lleva cada caso/);
  });
});

// ─── Boutique Andina (ficticia): exporta a Chile ─────────────────────────────────────────────────

const OPERACIONES: OperacionMoneda[] = [
  // 1,000,000 CLP; precio puesto a 0.0041 → 4,100; el día del cobro 0.0039 → 3,900; llegaron 3,750; el banco cobró 60.
  { id: "o1", fecha_venta: "2026-09-01", fecha_cobro: "2026-09-25", dias_cobro: 24, moneda: "CLP", monto: 1_000_000, tc_cotizado: 0.0041, tc_cobro: 0.0039, recibido: 3750, comisiones: 60, conversiones: 2, estado: "contado" },
  // Sin saber cuánto llegó: 2,050 esperados, 2,000 al cambio del día, 25 de comisión.
  { id: "o2", fecha_venta: "2026-09-10", fecha_cobro: null, dias_cobro: null, moneda: "CLP", monto: 500_000, tc_cotizado: 0.0041, tc_cobro: 0.004, recibido: null, comisiones: 25, conversiones: null, estado: "estimado" },
  // Sin el tipo de cambio con que se puso el precio: no hay cuenta.
  { id: "o3", fecha_venta: "2026-09-20", fecha_cobro: null, dias_cobro: null, moneda: "CLP", monto: 300_000, tc_cotizado: null, tc_cobro: 0.004, recibido: 1150, comisiones: null, conversiones: null, estado: "estimado" },
];

const FICHA_BOUTIQUE: FichaNegocio = {
  ...FICHA_VACIA,
  modulos: { moneda: true, credito: true, inventario: true },
  moneda: { vende_en: ["CLP"], costos_en: "PEN", operaciones_mes: { desde: 4, hasta: 6, estado: "estimado" }, monto_tipico: { valor: 800_000, estado: "estimado" } },
  credito: { de_cada_10: { valor: 3, estado: "estimado" }, dias: { valor: 45, estado: "contado" }, incobrables_de_cada_10: { valor: 1, estado: "estimado" } },
  inventario: { valor: { valor: 30000, estado: "estimado" }, meses: { desde: 2, hasta: 3, estado: "estimado" }, parado: { valor: 8000, estado: "estimado" } },
};

const BOUTIQUE = [
  linea("B1", "Chompa de alpaca", { modelo: "compra_y_revende", precio: 220, componentes_costo: [parte("proveedor", 120), parte("flete", 10)], unidades_mes: 60 }),
  linea("B2", "Chalina", { modelo: "compra_y_revende", precio: 90, costo_variable_unitario: 40, unidades_mes: 100 }),
];

const tableroBoutique = () =>
  tableroRentabilidad({ lineas: BOUTIQUE, costos: [], ficha: FICHA_BOUTIQUE, operaciones: OPERACIONES, metricas: [{ clave: "venta_mes", periodo: "2026-09", valor: 40000, estado: "contado" }], config: porDefecto });

describe("Boutique Andina (ficticia) · lo que se queda en el camino al cobrar en pesos chilenos", () => {
  it("una operación completa: por el tipo de cambio, por la conversión y por el banco", () => {
    const f = fugaCambiaria(OPERACIONES[0]!);
    expect(f.esperado).toBeCloseTo(4100, 6);
    expect(f.referencia).toBeCloseTo(3900, 6);
    expect(f.por_tipo_de_cambio).toBeCloseTo(200, 6);
    expect(f.por_comisiones).toBe(60);
    // 3,900 − 3,750 − 60 = 90: el diferencial del cambio, con la doble conversión dentro.
    expect(f.por_conversion).toBeCloseTo(90, 6);
    expect(f.total).toBeCloseTo(350, 6);
    expect(f.pct).toBeCloseTo(350 / 4100, 4);
    expect(f.motivos.join(" ")).toMatch(/dos conversiones/);
  });

  it("sin saber cuánto llegó: el tipo de cambio y el banco, y se dice que falta el costo del cambio", () => {
    const f = fugaCambiaria(OPERACIONES[1]!);
    expect(f.total).toBeCloseTo(75, 6);
    expect(f.por_conversion).toBeNull();
    expect(f.motivos).toContain("sin saber cuánto llegó, falta el costo del cambio");
  });

  it("sin el tipo de cambio con que se puso el precio no hay cuenta", () => {
    const f = fugaCambiaria(OPERACIONES[2]!);
    expect(f.esperado).toBeNull();
    expect(f.total).toBeNull();
    expect(f.motivos).toContain("falta el tipo de cambio con el que se puso el precio");
  });

  it("el resumen suma solo las que tienen lo que llegó a la cuenta; la que no lo tiene es un piso aparte; el estimado del mes sale de la ficha", () => {
    const m = tableroBoutique().moneda!;
    expect(m.operaciones).toHaveLength(3);
    expect(m.operaciones.map((x) => x.completa)).toEqual([true, false, false]);
    const r = m.resumen.valor!;
    // Solo o1: se esperaban 4,100 y llegaron 3,750 (lo anotado, no una resta): se quedaron 350.
    expect(r.esperado).toBeCloseTo(4100, 6);
    expect(r.recibido).toBe(3750);
    expect(r.perdido).toBeCloseTo(350, 6);
    expect(r.pct).toBeCloseTo(350 / 4100, 4);
    // o2 no dice cuánto llegó: 50 por el tipo de cambio + 25 del banco = al menos 75, aparte y nombrado.
    expect(r.al_menos).toBeCloseTo(75, 6);
    const pct = Math.round((350 / 4100) * 10000) / 10000;
    expect(r.mes_estimado!.bajo).toBeCloseTo(4 * 800_000 * 0.0041 * pct, 3);
    expect(r.mes_estimado!.alto).toBeCloseTo(6 * 800_000 * 0.0041 * pct, 3);
    expect(m.resumen.supuestos.join(" ")).toMatch(/estimado/);
    const lim = m.resumen.limitaciones.join(" ");
    expect(lim).toMatch(/2 de 3 operaciones sin la cuenta completa/);
    expect(lim).toMatch(/1 venta sin lo que llegó a la cuenta: allí se perdió al menos S\/ 75/);
  });

  it("dos ventas de CLP 1.000.000, una sin lo que llegó: el resumen no inventa un «recibido» por resta", () => {
    const ops: OperacionMoneda[] = [
      { id: "a", fecha_venta: "2026-09-01", fecha_cobro: "2026-09-20", dias_cobro: 19, moneda: "CLP", monto: 1_000_000, tc_cotizado: 0.0041, tc_cobro: 0.0039, recibido: 3700, comisiones: 50, conversiones: null, estado: "contado" },
      { id: "b", fecha_venta: "2026-09-05", fecha_cobro: null, dias_cobro: null, moneda: "CLP", monto: 1_000_000, tc_cotizado: 0.0041, tc_cobro: 0.0039, recibido: null, comisiones: null, conversiones: null, estado: "contado" },
    ];
    const m = tableroRentabilidad({ lineas: BOUTIQUE, costos: [], ficha: FICHA_BOUTIQUE, operaciones: ops, metricas: [], config: porDefecto }).moneda!;
    const r = m.resumen.valor!;
    expect(r.esperado).toBeCloseTo(4100, 6);
    expect(r.recibido).toBe(3700);
    expect(r.perdido).toBeCloseTo(400, 6);
    expect(r.al_menos).toBeCloseTo(200, 6);
    expect(m.resumen.limitaciones.join(" ")).toMatch(/1 de 2 operaciones sin la cuenta completa/);
    // Sin ninguna venta con lo que llegó, no hay resumen: se dice el piso, no una suma.
    const soloPiso = tableroRentabilidad({ lineas: BOUTIQUE, costos: [], ficha: FICHA_BOUTIQUE, operaciones: [ops[1]!], metricas: [], config: porDefecto }).moneda!;
    expect(soloPiso.resumen.valor).toBeNull();
    expect(soloPiso.resumen.motivo_nulo).toBe("ninguna venta tiene lo que llegó a la cuenta; en 1 se perdió al menos S/ 200");
  });

  it("crédito: el dinero en la calle y lo que no se cobra cada mes; inventario: lo dicho, sin costo de oportunidad", () => {
    const t = tableroBoutique();
    // 40,000 × 3/10 × 45/30 = 18,000; 40,000 × 3/10 × 1/10 = 1,200.
    const c = t.credito!.valor!;
    expect(c.dinero_en_la_calle.bajo).toBeCloseTo(18000, 6);
    expect(c.dinero_en_la_calle.alto).toBeCloseTo(18000, 6);
    expect(c.perdida_mes!.bajo).toBeCloseTo(1200, 6);
    expect(c.perdida_mes!.alto).toBeCloseTo(1200, 6);
    expect(t.credito!.fuentes.join(" ")).toMatch(/de tus 9 números/);
    expect(t.inventario!.valor).toEqual({ dinero_parado: { bajo: 8000, alto: 8000 }, meses: { bajo: 2, alto: 3 } });
    expect(t.inventario!.limitaciones.join(" ")).toMatch(/costo de oportunidad/);
    // Sin la venta del mes, el crédito no se calcula: no se inventa.
    const sinVenta = tableroRentabilidad({ lineas: BOUTIQUE, costos: [], ficha: FICHA_BOUTIQUE, operaciones: [], metricas: [], config: porDefecto });
    expect(sinVenta.credito!.motivo_nulo).toBe("falta la venta del mes (de tus 9 números)");
  });

  it("sin módulos y sin operaciones, no hay bloques de moneda, crédito ni inventario", () => {
    const t = tableroRentabilidad({ lineas: BOUTIQUE, costos: [], ficha: FICHA_VACIA, operaciones: [], metricas: [], config: porDefecto });
    expect(t.moneda).toBeNull();
    expect(t.credito).toBeNull();
    expect(t.inventario).toBeNull();
    // Sin gastos del mes no hay equilibrio, y se dice.
    expect(t.equilibrio.motivo_nulo).toBe("sin costos fijos no hay punto de equilibrio");
  });

  it("equilibrio con un gasto en «no lo sé»: el motivo nombra el gasto que falta, no dice que no hay gastos", () => {
    // La tarjeta de gastos muestra los fijos (sí hay cifra) y el equilibrio decía «sin costos fijos»: se contradecían.
    const costos: CostoMes[] = [...COSTOS_JEANS.filter((c) => c.id !== "c4"), { id: "c4", periodo: "mes_tipico", tipo: "comercializacion", nombre: "Publicidad", dato: { estado: "no_lo_se" }, nota: null }];
    const t = tableroRentabilidad({ lineas: JEANS, costos, ficha: FICHA_JEANS, operaciones: [], metricas: [], config: porDefecto });
    expect(t.fijos.total).toBeNull();
    expect(t.fijos.solo_fijos).not.toBeNull();
    expect(t.equilibrio.valor).toBeNull();
    expect(t.equilibrio.motivo_nulo).toBe("falta el monto de «Publicidad» en los gastos del mes: sin él no hay total de gastos ni punto de equilibrio");
  });

  it("un bloque de la ficha con una llave de más se lee campo por campo: lo que calza queda, lo demás fuera y anotado", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fichaDesdeFila({ historia: { anio_inicio: { valor: 2012, estado: "contado" }, llave_vieja: 1 }, modulos: { moneda: true, credito: "sí" } });
    expect(f.historia.anio_inicio).toEqual({ valor: 2012, estado: "contado" });
    expect(f.historia).not.toHaveProperty("llave_vieja");
    expect(f.modulos).toEqual({ moneda: true });
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("la ficha que viene de la base: un bloque mal formado se deja vacío, no se adivina", () => {
    const f = fichaDesdeFila({ historia: { anio_inicio: { valor: 2015, estado: "contado" } }, modulos: { moneda: "sí" }, totales: null, moneda: {}, credito: {}, inventario: {} });
    expect(f.historia.anio_inicio).toEqual({ valor: 2015, estado: "contado" });
    expect(f.modulos).toEqual({});
    expect(fichaDesdeFila(null)).toEqual(FICHA_VACIA);
  });
});
