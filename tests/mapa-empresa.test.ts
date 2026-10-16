/**
 * LA RADIOGRAFÍA NO MIENTE NI CONFUNDE.
 *
 * Dos reglas que esta pantalla no puede romper, porque es la que le enseñamos al dueño:
 *   1. El nivel de la empresa cuenta lo que le FALTA, no solo lo que hizo. Contar únicamente lo
 *      hecho da un número bonito y falso — y es exactamente lo que hace una consultora que quiere
 *      cobrar sin cambiar nada.
 *   2. Ningún nivel se regala. Cada uno se gana con algo comprobable en la base, y la pantalla
 *      siempre puede decir CON QUÉ se ganó y QUÉ FALTA para el siguiente.
 *
 * Y una tercera desde el versionado del punto de partida (13-10-2026): CORREGIR EL «ANTES» NO ES VOLVER A
 * MEDIR. Las versiones reemplazadas siguen en la tabla; si contaran como anotaciones, tres correcciones
 * sin ningún corte llevarían un proceso a «medido». Al final se prueba la cuenta (`vecesAnotado`, pura) y
 * que `mapaDe` la usa, con un doble de `supabaseAdmin()`: aquí no hay base.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { madurezProceso, madurezEmpresa, NIVELES } from "@/lib/madurez";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  /** Columnas que «no existen» en esta base: una consulta que las pida falla, como en PostgREST. */
  columnasAusentes: {} as Record<string, string[]>,
  consultas: [] as { tabla: string; columnas: string }[],
}));

vi.mock("@/lib/supabase/admin", () => {
  // Doble de solo lectura: devuelve las filas de la tabla tal cual (los filtros no importan aquí: hay una
  // sola empresa) y falla si se piden columnas declaradas ausentes.
  const consulta = (tabla: string) => {
    let columnas = "*";
    const ejecutar = () => {
      base.consultas.push({ tabla, columnas });
      const ausente = (base.columnasAusentes[tabla] ?? []).find((c) => columnas.split(",").map((x) => x.trim()).includes(c));
      if (ausente) return { data: null, error: { message: `column ${tabla}.${ausente} does not exist` } };
      return { data: base.tablas[tabla] ?? [], error: null };
    };
    const q = {
      select: (cols?: string) => { columnas = cols ?? "*"; return q; },
      eq: () => q, neq: () => q, in: () => q, not: () => q, order: () => q, limit: () => q,
      single: async () => { const r = ejecutar(); return { data: r.data?.[0] ?? null, error: r.error }; },
      maybeSingle: async () => { const r = ejecutar(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (res: (v: ReturnType<typeof ejecutar>) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  return { supabaseAdmin: () => ({ from: consulta }) };
});

import { vecesAnotado, mapaDe, type MedicionAnotada } from "@/lib/mapa-empresa";

const contado = { nodos: 5 };
const ordenado = { nodos: 5, responsable: "Cajera", tiempo: "10 min", inicio: "El cliente llega", resultado: "Operación registrada", proveedor: "El cliente", cliente_proceso: "Contabilidad" };
const escrito = { ...ordenado, documentado: true };
const medido = { ...escrito, indicador: "Descuadres por semana", medicionesReales: 3 };
const mejorando = { ...medido, mejoro: true };

describe("los dos números de la empresa dicen cosas distintas y ninguna engaña", () => {
  it("una empresa con un proceso perfecto y muchos sin mapear NO está arriba", () => {
    const e = madurezEmpresa([madurezProceso(mejorando)], 20);
    expect(e.nivel).toBeLessThan(1);
    expect(e.nivelMapeados, "lo que sí mapeó está perfecto, y eso también es verdad").toBe(5);
  });

  it("los dos números coinciden cuando está todo mapeado", () => {
    const evs = Array.from({ length: 4 }, () => madurezProceso(escrito));
    const e = madurezEmpresa(evs, 4);
    expect(e.nivel).toBe(e.nivelMapeados);
  });

  it("sin nada mapeado, el promedio de lo mapeado es 0 y no una división por cero", () => {
    const e = madurezEmpresa([], 12);
    expect(e.nivelMapeados).toBe(0);
    expect(Number.isFinite(e.nivel)).toBe(true);
  });

  it("nunca se inventan procesos esperados: el mínimo es lo que ya existe", () => {
    const e = madurezEmpresa([madurezProceso(contado), madurezProceso(contado)], 0);
    expect(e.esperados).toBe(2);
  });
});

describe("cada nivel se gana con algo comprobable", () => {
  it.each([
    ["dibujado", contado, 1],
    ["con dueño y tiempos", ordenado, 2],
    ["escrito paso a paso", escrito, 3],
    ["con su número anotado", medido, 4],
    ["y el número mejoró", mejorando, 5],
  ])("%s → nivel %i", (_caso, entrada, esperado) => {
    expect(madurezProceso(entrada).nivel).toBe(esperado);
  });

  it("una meta escrita sin anotar el número NO llega a medido", () => {
    const e = madurezProceso({ ...escrito, indicador: "Descuadres por semana", medicionesReales: 0 });
    expect(e.nivel).toBe(3);
    expect(e.siguiente).toMatch(/anotarlo/i);
  });

  it("un solo dato anotado tampoco: con uno no se compara nada", () => {
    expect(madurezProceso({ ...escrito, indicador: "Descuadres", medicionesReales: 1 }).nivel).toBe(3);
  });

  it("si el número empeoró, lo dice en vez de esconderlo", () => {
    const e = madurezProceso({ ...medido, mejoro: false });
    expect(e.nivel).toBe(4);
    expect(e.siguiente).toMatch(/empeor/i);
  });

  it("todo nivel por debajo del máximo dice qué falta para el siguiente", () => {
    for (const entrada of [contado, ordenado, escrito, medido]) expect(madurezProceso(entrada).siguiente).toBeTruthy();
    expect(madurezProceso(mejorando).siguiente).toBeNull();
  });

  it("y todo nivel alcanzado dice con qué se ganó", () => {
    expect(madurezProceso(medido).porque.length).toBeGreaterThan(2);
  });
});

describe("el texto de los niveles no promete lo que el sistema no comprueba", () => {
  it("no se dice «aprobado» en ningún nivel: los SOP no tienen aprobación todavía", () => {
    const todo = NIVELES.map((n) => `${n.nombre} ${n.queSignifica}`).join(" ").toLowerCase();
    expect(todo, "prometer una aprobación que no existe es la clase de mentira que este producto no comete").not.toMatch(/aprobad/);
  });
});

// ---------------------------------------------------------------------------------------------
// CORREGIR EL PUNTO DE PARTIDA NO ES VOLVER A MEDIR (remate L, 13-10-2026)
// ---------------------------------------------------------------------------------------------

const version = (n: number, vigente: boolean, valores: Record<string, unknown>): MedicionAnotada => ({ tipo: "linea_base", version: n, vigente, valores });
const corte = (valores: Record<string, unknown>): MedicionAnotada => ({ tipo: "corte", valores });

describe("cuántas veces se anotó un número: el punto de partida vigente y los cortes, nada más", () => {
  const v1 = version(1, false, { venta_mes: 40000, ganancia_mes: 4000 });
  const v2 = version(2, false, { venta_mes: 41000, ganancia_mes: 3800, gasto_fijo_mes: 12000 });
  const v3 = version(3, true, { venta_mes: 40500, ganancia_mes: 3900 });

  it("tres versiones del punto de partida y ningún corte son UNA anotación, no tres", () => {
    const veces = vecesAnotado([v1, v2, v3]);
    expect(veces.get("venta_mes")).toBe(1);
    expect(veces.get("ganancia_mes")).toBe(1);
  });

  it("un número que solo estaba en una versión reemplazada no cuenta: esa foto ya no rige", () => {
    expect(vecesAnotado([v1, v2, v3]).get("gasto_fijo_mes")).toBeUndefined();
  });

  it("cada corte suma una, se haya medido contra la versión que sea", () => {
    const veces = vecesAnotado([v1, corte({ venta_mes: 42000 }), v2, corte({ venta_mes: 43000, ganancia_mes: 4800 }), v3]);
    expect(veces.get("venta_mes")).toBe(3);
    expect(veces.get("ganancia_mes")).toBe(2);
  });

  it("un valor vacío, nulo o que no es número no es una anotación", () => {
    const veces = vecesAnotado([version(1, true, { venta_mes: null, ganancia_mes: "", caja_hoy: "no sé", deuda_propia: 0 }), corte({ venta_mes: "45000" })]);
    expect(veces.get("venta_mes")).toBe(1);
    expect(veces.get("ganancia_mes")).toBeUndefined();
    expect(veces.get("caja_hoy")).toBeUndefined();
    expect(veces.get("deuda_propia"), "cero es un dato; la falta de dato no").toBe(1);
  });

  it("una base anterior al versionado (sin vigente ni versión) sigue contando su única línea base", () => {
    const veces = vecesAnotado([{ tipo: "linea_base", valores: { venta_mes: 40000 } }, corte({ venta_mes: 42000 })]);
    expect(veces.get("venta_mes")).toBe(2);
  });

  it("si ninguna versión está vigente, solo cuentan los cortes", () => {
    expect(vecesAnotado([v1, v2, corte({ venta_mes: 42000 })]).get("venta_mes")).toBe(1);
    expect(vecesAnotado([]).size).toBe(0);
  });
});

describe("mapaDe usa esa cuenta: tres correcciones sin corte no llevan un proceso a «medido»", () => {
  const EMP = "0000000a-0000-4000-8000-00000000000a";
  const proceso: Fila = {
    id: "p1", nombre: "Venta en mostrador", area: "ventas", categoria: null, version: "as_is",
    responsable: "Cajera", tiempo: "10 min", inicio: "El cliente llega", resultado: "Venta registrada", proveedor: "El cliente", cliente_proceso: "Caja",
    indicador: "Ventas del mes", descripcion_original: "Así vendemos en el mostrador",
    process_nodes: [{ count: 5 }], sops: [{ count: 1 }],
  };
  const tresVersiones: Fila[] = [
    { tipo: "linea_base", version: 1, vigente: false, valores: { venta_mes: 40000 } },
    { tipo: "linea_base", version: 2, vigente: false, valores: { venta_mes: 41000 } },
    { tipo: "linea_base", version: 3, vigente: true, valores: { venta_mes: 40500 } },
  ];

  beforeEach(() => {
    base.consultas.length = 0;
    base.columnasAusentes = {};
    base.tablas = {
      companies: [{ id: EMP, sector: "comercio", ficha: null }],
      processes: [proceso],
      company_assets: [],
      interview_sessions: [],
      indicadores: [{ clave: "venta_mes", nombre: "Ventas del mes", estado: "activo" }],
      mediciones: tresVersiones,
    };
  });

  it("con tres versiones y ningún corte el proceso se queda en «escrito»: su número se anotó una vez", async () => {
    const mapa = await mapaDe(EMP);
    const p = mapa!.procesos.find((x) => x.id === "p1")!;
    expect(p.evaluacion.nivel).toBe(3);
    expect(p.evaluacion.siguiente).toMatch(/anotarlo al menos dos veces/);
  });

  it("con el primer corte ya son dos anotaciones y llega a «medido»", async () => {
    base.tablas.mediciones = [...tresVersiones, { tipo: "corte", valores: { venta_mes: 43000 } }];
    const p = (await mapaDe(EMP))!.procesos.find((x) => x.id === "p1")!;
    expect(p.evaluacion.nivel).toBe(4);
    expect(p.evaluacion.porque.join(" ")).toMatch(/se anotó 2 veces/);
  });

  it("pide el tipo y la vigencia de cada medición, no solo los valores", async () => {
    await mapaDe(EMP);
    const pedidas = base.consultas.filter((c) => c.tabla === "mediciones").map((c) => c.columnas);
    expect(pedidas).toEqual(["tipo,valores,version,vigente"]);
  });

  it("si la base no tiene las columnas de versión, lee las de siempre en vez de quedarse sin mediciones", async () => {
    base.columnasAusentes = { mediciones: ["vigente"] };
    base.tablas.mediciones = [{ tipo: "linea_base", valores: { venta_mes: 40000 } }, { tipo: "corte", valores: { venta_mes: 43000 } }];
    const p = (await mapaDe(EMP))!.procesos.find((x) => x.id === "p1")!;
    expect(base.consultas.filter((c) => c.tabla === "mediciones").map((c) => c.columnas)).toEqual(["tipo,valores,version,vigente", "tipo,valores"]);
    expect(p.evaluacion.nivel).toBe(4);
  });
});
