/**
 * LOS DATOS QUE NO CUADRAN (src/lib/incongruencias.ts, 16-10-2026). Una prueba por regla de hoy —salta y no salta—,
 * los bordes de la tolerancia (5 % exacta, 20 % aproximada), periodos distintos que no se comparan, una línea sin
 * unidades que no suma, un rango contra su extremo, la huella que da por resuelta una corrección y la reabre cuando la
 * cifra cambia, las reglas que quedan para después y los títulos del dueño sin palabras del método.
 *
 * Todo es puro: sin base. Las empresas y productos son FICTICIOS (regla del 70a3701).
 */
import { describe, it, expect } from "vitest";
import {
  incongruenciasDe, abiertasDe, huellaDe, idDe, lineaDeCorreccion, masCercanos, partesDeId, ORIGEN_DUENO, ORDEN_REGLAS, REGLAS_DESPUES,
  type HechosIncongruencia, type Correccion, type ClaimContradicha,
} from "@/lib/incongruencias";
import { FICHA_VACIA, type CostoMes } from "@/lib/rentabilidad";
import { porDefecto } from "@/lib/formato";
import type { LineaProducto } from "@/lib/producto";
import type { MetricaGuardada } from "@/lib/rules/contradiccion-numerica";

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Jeans del Valle (ficticia)
/** Lo que el dueño nunca lee (tests/pantallas-entrar-hoy.test.ts). */
const PROHIBIDAS = /contribuci[oó]n|costo variable|\bSKU\b|matriz|\bKPI\b|claim|extra[ií]do|decisi[oó]n|INTERNO/i;

const m = (clave: string, periodo: string, valor: number | null, estado = "contado", extra: Partial<MetricaGuardada> = {}): MetricaGuardada => ({ clave, periodo, valor, estado, origen: "declarado", ...extra });

const linea = (id: string, nombre: string, precio: number | null, unidades: number | null, extra: Partial<LineaProducto> = {}): LineaProducto => ({
  id, company_id: EMP, codigo: null, nombre, tipo: "producto", cliente_objetivo: null, necesidad: null, promesa: null,
  precio, costo_variable_unitario: 40, unidades_periodo: null, horas_por_unidad: null, periodo: null, origen: "declarado", source_id: null,
  decision: null, decision_motivo: null, modelo: "fabrica_y_vende", grupo: null, componentes_costo: [], unidades_mes: unidades,
  unidades_mes_desde: null, unidades_mes_hasta: null, participacion_de_10: null, estados: { precio: "contado", costo: "contado", unidades: "contado" }, datos_modelo: null,
  ...extra,
});

const costo = (id: string, nombre: string, dato: CostoMes["dato"], tipo: CostoMes["tipo"] = "fijo"): CostoMes => ({ id, periodo: "mes_tipico", tipo, nombre, dato, nota: null });

function hechos(h: Partial<HechosIncongruencia> = {}): HechosIncongruencia {
  return {
    metricas: [], lineas: [], costos: [], ficha: { ...FICHA_VACIA }, config: porDefecto, claimsContradichas: [],
    preguntaDeRespuesta: new Map(), declarantes: new Map(), correcciones: [], mesPasado: "2026-09",
    ...h,
  };
}
const de = (h: Partial<HechosIncongruencia>, regla: string) => incongruenciasDe(hechos(h)).filter((i) => i.regla === regla);

// ─────────────────────── 1 · venta declarada frente a unidades × precio ───────────────────────

describe("1 · venta del mes pasado frente a precio × unidades de la tabla", () => {
  const tabla = (unidades: number) => [linea("a", "Jean Clásico", 100, unidades)];

  it("salta con más de 5 % entre dos cifras exactas, y no salta en el borde exacto de 5 %", () => {
    const i = de({ metricas: [m("venta_mes", "2026-09", 10000)], lineas: tabla(120) }, "venta_vs_productos");
    expect(i).toHaveLength(1);
    expect(i[0]!.toleranciaPct).toBe(5);
    expect(i[0]!.izquierda.origen).toBe("lo_dijiste");
    expect(i[0]!.derecha?.origen).toBe("tu_tabla");
    expect(i[0]!.corrige).toEqual({ via: "numeros", clave: "venta_mes", periodo: "2026-09" });
    expect(i[0]!.opciones).toEqual(["izquierda", "derecha", "otra", "no_lo_se"]);
    // 10.000 frente a 10.500: 5 % justo, dentro de la tolerancia.
    expect(de({ metricas: [m("venta_mes", "2026-09", 10000)], lineas: [linea("a", "Jean Clásico", 105, 100)] }, "venta_vs_productos")).toHaveLength(0);
    // 10.000 frente a 10.510: 5,1 %, ya no.
    expect(de({ metricas: [m("venta_mes", "2026-09", 10000)], lineas: [linea("a", "Jean Clásico", 105.1, 100)] }, "venta_vs_productos")).toHaveLength(1);
  });

  it("una cifra aproximada tolera 20 %: en el borde no salta, pasado el borde sí", () => {
    const aprox = m("venta_mes", "2026-09", 10000, "contado", { valor_texto: "como 10 mil" });
    expect(de({ metricas: [aprox], lineas: [linea("a", "Jean", 100, 120)] }, "venta_vs_productos")).toHaveLength(0);
    const i = de({ metricas: [aprox], lineas: [linea("a", "Jean", 100.1, 120)] }, "venta_vs_productos");
    expect(i).toHaveLength(1);
    expect(i[0]!.toleranciaPct).toBe(20);
  });

  it("con un dato estimado en la tabla también es aproximada (20 %)", () => {
    const aOjo = linea("a", "Jean", 100, 112, { estados: { precio: "contado", costo: "contado", unidades: "estimado" } });
    expect(de({ metricas: [m("venta_mes", "2026-09", 10000)], lineas: [aOjo] }, "venta_vs_productos")).toHaveLength(0);
  });

  it("una línea sin unidades: la suma tiene un hueco y no se compara", () => {
    expect(de({ metricas: [m("venta_mes", "2026-09", 10000)], lineas: [linea("a", "Jean", 100, 500), linea("b", "Polo", 30, null)] }, "venta_vs_productos")).toHaveLength(0);
  });

  it("un rango se compara por su extremo más cercano, y no se ofrece «elegir» el lado en rango", () => {
    const rango = m("venta_mes", "2026-09", null, "contado", { valor_texto: "entre 8.000 y 10.000" });
    // La tabla dice 10.400: contra 10.000 (su extremo más cercano) es 4 %, dentro.
    expect(de({ metricas: [rango], lineas: [linea("a", "Jean", 104, 100)] }, "venta_vs_productos")).toHaveLength(0);
    const i = de({ metricas: [rango], lineas: [linea("a", "Jean", 130, 100)] }, "venta_vs_productos");
    expect(i).toHaveLength(1);
    expect(i[0]!.izquierda.rango).toEqual({ bajo: 8000, alto: 10000 });
    expect(i[0]!.izquierda.valor).toBeNull();
    expect(i[0]!.opciones).not.toContain("izquierda");
    expect(i[0]!.opciones).toContain("derecha");
    expect(masCercanos({ bajo: 8000, alto: 10000 }, { bajo: 13000, alto: 13000 })).toEqual([10000, 13000]);
    expect(masCercanos({ bajo: 8000, alto: 10000 }, { bajo: 9000, alto: 9500 })).toEqual([9000, 9000]);
  });

  it("periodos distintos no se comparan: sin venta del mes pasado no hay regla 1", () => {
    expect(de({ metricas: [m("venta_mes", "2026-08", 10000)], lineas: [linea("a", "Jean", 300, 100)] }, "venta_vs_productos")).toHaveLength(0);
    expect(de({ metricas: [m("venta_mes", "2026-09", 10000)], lineas: [linea("a", "Jean", 300, 100)], mesPasado: null }, "venta_vs_productos")).toHaveLength(0);
  });
});

// ─────────────────────── 2 · declarado frente a documento ───────────────────────

describe("2 · lo declarado frente a lo que muestra un documento", () => {
  it("salta con la cifra del documento guardada al lado, y no salta dentro de la tolerancia", () => {
    const fila = m("deuda_propia", "actual", 40000, "contado", { cifra_desplazada: { lado: "extraido", valor: 79782 } });
    const i = de({ metricas: [fila] }, "declarado_vs_documento");
    expect(i).toHaveLength(1);
    expect(i[0]!.izquierda.valor).toBe(40000);
    expect(i[0]!.derecha?.valor).toBe(79782);
    expect(i[0]!.derecha?.origen).toBe("documento");
    expect(i[0]!.corrige).toEqual({ via: "numeros", clave: "deuda_propia", periodo: "actual" });
    expect(de({ metricas: [m("deuda_propia", "actual", 40000, "contado", { cifra_desplazada: { lado: "extraido", valor: 41000 } })] }, "declarado_vs_documento")).toHaveLength(0);
  });

  it("dicho por una persona del equipo: «otra fuente de tu empresa»", () => {
    const fila = m("venta_mes", "2026-08", 40000, "contado", { response_id: "r1", cifra_desplazada: { lado: "extraido", valor: 80000 } });
    const i = de({ metricas: [fila], declarantes: new Map([["r1", "equipo"]]) }, "declarado_vs_documento");
    expect(i[0]!.izquierda.origen).toBe("otra_fuente");
    expect(ORIGEN_DUENO[i[0]!.izquierda.origen]).toBe("otra fuente de tu empresa");
  });

  it("periodos distintos no se comparan", () => {
    const metricas = [m("venta_mes", "2026-09", 40000), m("venta_mes", "2026-08", 90000, "extraido", { origen: "extraido" })];
    expect(de({ metricas }, "declarado_vs_documento")).toHaveLength(0);
  });
});

// ─────────────────────── 3 · ganancia frente a la cuenta ───────────────────────

describe("3 · lo que quedó frente a venta − mercadería − gasto fijo", () => {
  const base = (ganancia: number, gf: MetricaGuardada = m("gasto_fijo_mes", "2026-09", 6000)) => [
    m("venta_mes", "2026-09", 20000), m("costo_variable_mes", "2026-09", 8000), gf, m("ganancia_mes", "2026-09", ganancia),
  ];

  it("salta cuando no cuadra; no salta en el borde de 5 %", () => {
    const i = de({ metricas: base(9000) }, "ganancia_vs_cuenta");
    expect(i).toHaveLength(1);
    expect(i[0]!.derecha?.valor).toBe(6000);
    expect(i[0]!.derecha?.origen).toBe("cuenta");
    expect(i[0]!.corrige).toEqual({ via: "numeros", clave: "ganancia_mes", periodo: "2026-09" });
    // La cuenta da 6.000: una ganancia de 6.300 difiere 4,8 % (|6.000 − 6.300| / 6.300), dentro.
    expect(de({ metricas: base(6300) }, "ganancia_vs_cuenta")).toHaveLength(0);
  });

  it("vale el gasto fijo de hoy si el del mes no está", () => {
    expect(de({ metricas: base(9000, m("gasto_fijo_mes", "actual", 6000)) }, "ganancia_vs_cuenta")).toHaveLength(1);
  });

  it("periodos distintos no se comparan; sin uno de los cuatro, no hay cuenta", () => {
    const otroMes = [m("venta_mes", "2026-08", 20000), m("costo_variable_mes", "2026-08", 8000), m("gasto_fijo_mes", "2026-08", 6000), m("ganancia_mes", "2026-09", 9000)];
    expect(de({ metricas: otroMes }, "ganancia_vs_cuenta")).toHaveLength(0);
    expect(de({ metricas: [m("venta_mes", "2026-09", 20000), m("gasto_fijo_mes", "2026-09", 6000), m("ganancia_mes", "2026-09", 9000)] }, "ganancia_vs_cuenta")).toHaveLength(0);
    // Un «no lo sé» no es cero.
    expect(de({ metricas: [...base(9000).filter((x) => x.clave !== "costo_variable_mes"), m("costo_variable_mes", "2026-09", null, "sin_dato")] }, "ganancia_vs_cuenta")).toHaveLength(0);
  });
});

// ─────────────────────── 4 · gasto fijo frente a la suma de la tabla ───────────────────────

describe("4 · gasto fijo de los 9 números frente a la tabla de gastos", () => {
  it("salta si no cuadra y no salta dentro de la tolerancia", () => {
    const costos = [costo("c1", "Alquiler", { valor: 2000, estado: "contado" }), costo("c2", "Sueldos", { valor: 3000, estado: "contado" })];
    const i = de({ metricas: [m("gasto_fijo_mes", "2026-09", 4000)], costos }, "gasto_fijo_vs_tabla");
    expect(i).toHaveLength(1);
    expect(i[0]!.derecha?.valor).toBe(5000);
    expect(i[0]!.corrige).toEqual({ via: "numeros", clave: "gasto_fijo_mes", periodo: "2026-09" });
    expect(de({ metricas: [m("gasto_fijo_mes", "2026-09", 4900)], costos }, "gasto_fijo_vs_tabla")).toHaveLength(0);
  });

  it("una suma con un hueco no se suma", () => {
    const costos = [costo("c1", "Alquiler", { valor: 2000, estado: "contado" }), costo("c2", "Sueldos", { estado: "no_lo_se" })];
    expect(de({ metricas: [m("gasto_fijo_mes", "2026-09", 9000)], costos }, "gasto_fijo_vs_tabla")).toHaveLength(0);
  });

  it("los gastos para vender no entran en la suma de los fijos", () => {
    const costos = [costo("c1", "Alquiler", { valor: 4000, estado: "contado" }), costo("c2", "Delivery", { valor: 3000, estado: "contado" }, "comercializacion")];
    expect(de({ metricas: [m("gasto_fijo_mes", "2026-09", 4000)], costos }, "gasto_fijo_vs_tabla")).toHaveLength(0);
  });
});

// ─────────────────────── 6 · «de cada 10» ───────────────────────

describe("6 · partes «de cada 10» que no suman 10", () => {
  const conParte = (id: string, grupo: string, parte: number | null) => linea(id, `Línea ${id}`, 50, null, { grupo, participacion_de_10: parte });

  it("salta si todas tienen su parte y no suman 10; no salta si suman 10", () => {
    const i = de({ lineas: [conParte("a", "Pantalones", 6), conParte("b", "Pantalones", 6)] }, "de_cada_10");
    expect(i).toHaveLength(1);
    expect(i[0]!.izquierda.texto).toBe("suman 12 de 10");
    expect(i[0]!.derecha).toBeNull();
    expect(i[0]!.corrige).toEqual({ via: "seccion", seccion: "productos", href: "/portal/producto" });
    expect(de({ lineas: [conParte("a", "Pantalones", 6), conParte("b", "Pantalones", 4)] }, "de_cada_10")).toHaveLength(0);
  });

  it("con huecos solo salta si ya pasa de 10; cada grupo se suma por su lado", () => {
    expect(de({ lineas: [conParte("a", "Pantalones", 6), conParte("b", "Pantalones", null)] }, "de_cada_10")).toHaveLength(0);
    expect(de({ lineas: [conParte("a", "Pantalones", 7), conParte("b", "Pantalones", 5), conParte("c", "Pantalones", null)] }, "de_cada_10")).toHaveLength(1);
    expect(de({ lineas: [conParte("a", "Pantalones", 6), conParte("b", "Pantalones", 4), conParte("c", "Polos", 10)] }, "de_cada_10")).toHaveLength(0);
  });

  it("un rango dicho («3 o 4») cuenta como rango: si 10 cabe dentro, no salta", () => {
    const rango = linea("r", "Short", 50, null, { grupo: "Pantalones", datos_modelo: { rango_de_cada_10: { desde: 3, hasta: 4 } } });
    expect(de({ lineas: [conParte("a", "Pantalones", 6), rango] }, "de_cada_10")).toHaveLength(0);
    expect(de({ lineas: [conParte("a", "Pantalones", 8), rango] }, "de_cada_10")).toHaveLength(1);
  });
});

// ─────────────────────── 8 · dos respuestas que se contradicen ───────────────────────

describe("8 · dos respuestas que se contradicen", () => {
  const a: ClaimContradicha = { id: "c1", texto: "Todas las ventas se anotan en el cuaderno.", contradice_a: "c2", deDueno: true, fuente: "el dueño (entrevista)" };
  const b: ClaimContradicha = { id: "c2", texto: "Las ventas del sábado no se anotan.", contradice_a: "c1", deDueno: false, fuente: "Vendedora (entrevista)" };

  it("una vez por par, lo del dueño a la izquierda, y se corrige en Confirmar", () => {
    const i = de({ claimsContradichas: [b, a] }, "respuestas_contradichas");
    expect(i).toHaveLength(1);
    expect(i[0]!.izquierda.origen).toBe("lo_dijiste");
    expect(i[0]!.derecha?.origen).toBe("otra_fuente");
    expect(i[0]!.corrige).toEqual({ via: "validar", claimId: "c1" });
  });

  it("se resuelve sola: si la afirmación deja de estar contradicha, no aparece", () => {
    expect(de({ claimsContradichas: [{ ...a, estado: "confirmado" }, { ...b, estado: "confirmado" }] }, "respuestas_contradichas")).toHaveLength(0);
    expect(de({ claimsContradichas: [a] }, "respuestas_contradichas")).toHaveLength(0);
  });
});

// ─────────────────────── 9 · posible eco ───────────────────────

describe("9 · posible eco de la pregunta", () => {
  it("salta si la pregunta ya traía la cifra, y no si no la traía", () => {
    const fila = m("venta_mes", "2026-09", 30000, "contado", { response_id: "r1" });
    const i = de({ metricas: [fila], preguntaDeRespuesta: new Map([["r1", "¿Vendes unos 30 mil al mes, más o menos?"]]) }, "posible_eco");
    expect(i).toHaveLength(1);
    expect(i[0]!.derecha).toBeNull();
    expect(i[0]!.opciones).toEqual(["izquierda", "otra", "no_lo_se"]);
    expect(de({ metricas: [fila], preguntaDeRespuesta: new Map([["r1", "¿Cuánto vendió tu negocio el mes pasado?"]]) }, "posible_eco")).toHaveLength(0);
    // «De cada 10» siempre dice 10 en su pregunta: no es eco.
    const conv = m("conversion_de_cada_10", "actual", 10, "contado", { response_id: "r2" });
    expect(de({ metricas: [conv], preguntaDeRespuesta: new Map([["r2", "De cada 10 personas que preguntan, ¿cuántas compran?"]]) }, "posible_eco")).toHaveLength(0);
  });
});

// ─────────────────────── 10 · lo que no puede ser ───────────────────────

describe("10 · valores imposibles", () => {
  it("una ganancia mayor que la venta del mismo mes: un solo lado y solo «otra» o «no lo sé»; la cuenta no lo repite", () => {
    const metricas = [m("venta_mes", "2026-09", 20000), m("ganancia_mes", "2026-09", 25000), m("costo_variable_mes", "2026-09", 8000), m("gasto_fijo_mes", "2026-09", 6000)];
    const todas = incongruenciasDe(hechos({ metricas }));
    const i = todas.filter((x) => x.regla === "imposible");
    expect(i).toHaveLength(1);
    expect(i[0]!.opciones).toEqual(["otra", "no_lo_se"]);
    expect(i[0]!.derecha).toBeNull();
    expect(todas.filter((x) => x.regla === "ganancia_vs_cuenta")).toHaveLength(0);
    expect(de({ metricas: [m("venta_mes", "2026-09", 20000), m("ganancia_mes", "2026-08", 25000)] }, "imposible")).toHaveLength(0);
  });

  it("caja negativa sí; caja positiva no", () => {
    expect(de({ metricas: [m("caja_hoy", "actual", -500)] }, "imposible")).toHaveLength(1);
    expect(de({ metricas: [m("caja_hoy", "actual", 500)] }, "imposible")).toHaveLength(0);
  });
});

// ─────────────────────── Resuelta, reabierta, orden ───────────────────────

describe("la huella decide si está resuelta", () => {
  const metricas = [m("gasto_fijo_mes", "2026-09", 4000)];
  const costos = [costo("c1", "Alquiler", { valor: 2000, estado: "contado" }), costo("c2", "Sueldos", { valor: 3000, estado: "contado" })];
  const id = idDe("gasto_fijo_vs_tabla", "gasto_fijo_mes", "2026-09");

  it("con una corrección de la misma huella: resuelta, con su línea de rastro, y va después de las abiertas", () => {
    const correccion: Correccion = {
      id: "1", incongruencia: id, huella: huellaDe("gasto_fijo_vs_tabla", "gasto_fijo_mes", "2026-09", 4000, 5000), eleccion: "izquierda",
      antes: { izquierda: 4000, derecha: 5000 }, despues: 4000, motivo: "La tabla tiene un sueldo de más", at: "2026-10-17T15:00:00.000Z", quien: "Rosa",
    };
    const todas = incongruenciasDe(hechos({ metricas: [...metricas, m("caja_hoy", "actual", -10)], costos, correcciones: [correccion] }));
    const r = todas.find((i) => i.id === id)!;
    expect(r.resuelta).not.toBeNull();
    expect(r.resuelta!.linea).toContain("17-10 · Rosa confirmó «Gastos fijos del mes» (setiembre 2026)");
    expect(abiertasDe(todas).map((i) => i.id)).not.toContain(id);
    expect(todas[todas.length - 1]!.id).toBe(id);
  });

  it("si la cifra cambia después, la huella cambia y vuelve a abrirse", () => {
    const vieja: Correccion = { id: "1", incongruencia: id, huella: huellaDe("gasto_fijo_vs_tabla", "gasto_fijo_mes", "2026-09", 4000, 5000), eleccion: "izquierda", antes: null, despues: 4000, motivo: null, at: "2026-10-17T15:00:00.000Z", quien: null };
    const i = de({ metricas: [m("gasto_fijo_mes", "2026-09", 3500)], costos, correcciones: [vieja] }, "gasto_fijo_vs_tabla");
    expect(i).toHaveLength(1);
    expect(i[0]!.resuelta).toBeNull();
  });

  it("la huella distingue «sin lado derecho» de «lado derecho sin cifra única»", () => {
    expect(huellaDe("r", "c", "p", 1, undefined)).not.toBe(huellaDe("r", "c", "p", 1, null));
    expect(huellaDe("r", null, null, 1.004, 2)).toBe(huellaDe("r", null, null, 1.0049, 2));
    expect(partesDeId(idDe("imposible", "caja_hoy", "actual"))).toEqual({ regla: "imposible", clave: "caja_hoy", periodo: "actual" });
  });

  it("la línea del rastro dice de qué a qué cambió, y «no lo sé» como tal", () => {
    const c: Correccion = { id: "9", incongruencia: idDe("ganancia_vs_cuenta", "ganancia_mes", "2026-09"), huella: "", eleccion: "no_lo_se", antes: { izquierda: { valor: 9000 }, derecha: 6000 }, despues: "no_lo_se", motivo: null, at: "2026-10-17T15:00:00.000Z", quien: "Rosa" };
    expect(lineaDeCorreccion(c)).toBe("17-10 · Rosa cambió «Lo que te quedó libre» (setiembre 2026) de S/ 9,000 a «no lo sé»");
    expect(lineaDeCorreccion({ ...c, eleccion: "otra", despues: 7500, quien: null })).toBe("17-10 · se cambió «Lo que te quedó libre» (setiembre 2026) de S/ 9,000 a S/ 7,500");
  });
});

describe("lo que no se promete y lo que lee el dueño", () => {
  it("las reglas 5 y 7 nunca aparecen", () => {
    expect([...REGLAS_DESPUES]).toEqual(["deuda_vs_por_cliente", "producido_vs_vendido"]);
    for (const r of REGLAS_DESPUES) expect(ORDEN_REGLAS as readonly string[]).not.toContain(r);
    // Con deudas y producción en la base, ninguna incongruencia habla de ellas.
    const todas = incongruenciasDe(hechos({ metricas: [m("deuda_clientes", "actual", 50000), m("deuda_propia", "actual", 10000)] }));
    for (const i of todas) expect(REGLAS_DESPUES as readonly string[]).not.toContain(i.regla);
  });

  it("ningún título del dueño trae palabras del método", () => {
    const metricas = [
      m("venta_mes", "2026-09", 10000), m("costo_variable_mes", "2026-09", 3000), m("gasto_fijo_mes", "2026-09", 2000), m("ganancia_mes", "2026-09", 9000),
      m("caja_hoy", "actual", -50), m("deuda_propia", "actual", 40000, "contado", { response_id: "r1", cifra_desplazada: { lado: "extraido", valor: 79782 } }),
      m("ganancia_mes", "2026-08", 12000), m("venta_mes", "2026-08", 11000),
    ];
    const todas = incongruenciasDe(hechos({
      metricas,
      lineas: [linea("a", "Jean", 100, 200, { grupo: "Pantalones", participacion_de_10: 7 }), linea("b", "Cargo", 120, 10, { grupo: "Pantalones", participacion_de_10: 6 })],
      costos: [costo("c1", "Alquiler", { valor: 8000, estado: "contado" })],
      claimsContradichas: [{ id: "c1", texto: "x", contradice_a: "c2", deDueno: true, fuente: "f" }, { id: "c2", texto: "y", contradice_a: "c1", deDueno: false, fuente: "g" }],
      preguntaDeRespuesta: new Map([["r1", "¿Debes unos 40 mil?"]]),
    }));
    expect(new Set(todas.map((i) => i.regla)).size).toBeGreaterThanOrEqual(7);
    for (const i of todas) expect(i.tituloDueno, i.regla).not.toMatch(PROHIBIDAS);
    for (const o of Object.values(ORIGEN_DUENO)) expect(o).not.toMatch(PROHIBIDAS);
  });
});
