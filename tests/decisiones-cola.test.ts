/**
 * LA COLA DE DECISIONES. Lo que se comprueba aquí es lo que hace que la pantalla sea honesta:
 *  — que NINGUNA cifra se invente: todas salen del texto que la decisión ya traía;
 *  — que la confianza se declare siempre, y que se sepa cuándo la dedujo 8X y cuándo la dijo el agente;
 *  — que «no es decidible» signifique que le falta algo al SISTEMA, no que a la consultora le falte ganas;
 *  — y que el orden se pueda explicar en una frase, porque una cola sin motivo es una lista.
 */
import { describe, it, expect } from "vitest";
import { cifrasQueNombra, cifraQueFrena, confianzaDe, noEsDecidible, ordenarCola, conConfianza } from "@/lib/decisiones-cola";

const alt = (clave: string) => ({ clave, titulo: `Camino ${clave}`, que_implica: "algo" });

/** Una decisión completa, como las que hay en producción. */
const base = {
  id: "d1",
  company_id: "e1",
  titulo: "¿Dónde buscamos la venta que falta?",
  por_que_ahora: "Gastó S/40,000 y vendió S/20,000 dos meses seguidos, y tiene S/66,000 por cobrar.",
  evidencia: [{ tipo: "documento", id: null, texto: "dossier" }],
  faltantes: ["Cuántos contactos de clientes antiguos tiene."],
  supuestos: [],
  alternativas: [alt("A"), alt("B"), alt("C")],
  recomendacion: "A de los días 22 a 45.",
  recomendacion_por_que: "A es lo más barato y rápido.",
  confianza: null as "alta" | "media" | "baja" | null,
  confianza_por_que: null as string | null,
  created_at: "2026-10-16T15:08:04Z",
};

describe("las cifras salen del texto, no de ningún cálculo", () => {
  it("lee las tres formas que aparecen en el material real", () => {
    expect(cifrasQueNombra("Gastó S/40,000 y vendió S/ 20,000; debe S/ 66.000")).toEqual([40000, 20000, 66000]);
  });

  it("descarta las cantidades chicas: en estos textos no son plata parada sino unidades", () => {
    expect(cifrasQueNombra("de S/14 a S/32 por pantalón")).toEqual([]);
    expect(cifrasQueNombra("S/ 250,000 al año y S/ 99 de comisión")).toEqual([250000]);
  });

  it("sin cifras, no inventa ninguna", () => {
    expect(cifrasQueNombra("El precio lo fija una sola persona.")).toEqual([]);
    expect(cifrasQueNombra(null)).toEqual([]);
    expect(cifraQueFrena({ por_que_ahora: "sin plata nombrada" })).toBeNull();
  });

  it("la cifra con la que ordena es la mayor que nombra al explicar POR QUÉ AHORA", () => {
    expect(cifraQueFrena(base)).toBe(66000);
  });

  it("no mira el porqué de la recomendación: ahí hay metas, y una meta no es plata parada", () => {
    // En producción: «la meta serían S/ 250,000» hacía que esa decisión saltara al primer puesto por lo
    // que se espera ganar, no por lo que está costando esperar.
    const conMeta = { ...base, por_que_ahora: "sin cifras", recomendacion_por_que: "la meta serían S/ 250,000" };
    expect(cifraQueFrena(conMeta)).toBeNull();
  });
});

describe("la confianza se declara siempre", () => {
  it("si el agente la declaró, manda la suya y se sabe que es suya", () => {
    const c = confianzaDe({ ...base, confianza: "baja", confianza_por_que: "porque sí" });
    expect(c).toMatchObject({ nivel: "baja", porque: "porque sí", deducida: false });
  });

  it("si no la declaró, la deduce de su propia evidencia y lo dice", () => {
    const c = confianzaDe(base);
    expect(c.deducida).toBe(true);
    expect(c.nivel).toBe("media");
    expect(c.porque).toMatch(/deduce 8X/i);
    expect(c.porque).toMatch(/una sola fuente/i);
    expect(c.porque).toMatch(/un dato por confirmar/i);
  });

  it("alta solo con dos fuentes, nada por confirmar y ningún supuesto", () => {
    const dos = [{ tipo: "a", id: null, texto: "1" }, { tipo: "b", id: null, texto: "2" }];
    expect(confianzaDe({ ...base, evidencia: dos, faltantes: [] }).nivel).toBe("alta");
    expect(confianzaDe({ ...base, evidencia: dos, faltantes: [], supuestos: ["uno"] }).nivel).toBe("media");
  });

  it("sin ninguna fuente, baja, y lo dice con esas palabras", () => {
    const c = confianzaDe({ ...base, evidencia: [], faltantes: ["a", "b", "c"] });
    expect(c.nivel).toBe("baja");
    expect(c.porque).toMatch(/sin ninguna fuente/i);
    expect(c.porque).toMatch(/3 datos por confirmar/i);
  });

  it("conConfianza la deja puesta, para que nadie la pida como si faltara", () => {
    const d = conConfianza(base);
    expect(d.confianza).toBe("media");
    expect(d.confianza_por_que).toMatch(/deduce 8X/i);
    expect(d.confianza_deducida).toBe(true);
  });
});

describe("«todavía no es una decisión» es culpa del sistema, no de la consultora", () => {
  it("que falte un dato por confirmar NO la traba: la recomendación ya dice qué hacer mientras tanto", () => {
    expect(noEsDecidible(base)).toEqual([]);
    const conFaltantes = { ...base, faltantes: ["a", "b", "c", "d", "e"] };
    expect(noEsDecidible(conFaltantes)).toEqual([]);
  });

  it("sin evidencia, sin dos caminos o sin recomendación, sí la traba", () => {
    expect(noEsDecidible({ ...base, evidencia: [] }).join(" ")).toMatch(/fuente/i);
    expect(noEsDecidible({ ...base, alternativas: [alt("A")] }).join(" ")).toMatch(/dos caminos/i);
    expect(noEsDecidible({ ...base, recomendacion: null }).join(" ")).toMatch(/recomienda/i);
    // La de «Línea de mando» en producción: ni alternativas ni evidencia.
    expect(noEsDecidible({ ...base, evidencia: [], alternativas: [] })).toHaveLength(2);
  });
});

describe("la cola: cuál primero y por qué ésa", () => {
  const con = (id: string, p: Partial<typeof base>) => ({ ...base, id, ...p });

  it("primero la que más plata tiene parada, y lo explica en una frase", () => {
    const cola = ordenarCola([
      con("chica", { por_que_ahora: "tiene S/ 2,800 parados" }),
      con("grande", { por_que_ahora: "tiene S/ 66,000 por cobrar" }),
      con("media", { por_que_ahora: "tiene S/ 4,000 parados" }),
    ]);
    expect(cola.hoy?.decision.id).toBe("grande");
    expect(cola.siguen.map((x) => x.decision.id)).toEqual(["media", "chica"]);
    expect(cola.porQueEsaPrimero).toMatch(/S\/ 66[.,]000/);
  });

  it("a igualdad de cifra, la que lleva más tiempo esperando: una decisión vieja ya costó", () => {
    const cola = ordenarCola([
      con("nueva", { created_at: "2026-11-01T00:00:00Z" }),
      con("vieja", { created_at: "2026-10-16T00:00:00Z" }),
    ]);
    expect(cola.hoy?.decision.id).toBe("vieja");
  });

  it("las que no son decisiones salen de la cola y van a su montón, con el motivo", () => {
    const cola = ordenarCola([con("buena", {}), con("trabada", { evidencia: [], alternativas: [] })]);
    expect(cola.hoy?.decision.id).toBe("buena");
    expect(cola.siguen).toHaveLength(0);
    expect(cola.trabadas.map((x) => x.decision.id)).toEqual(["trabada"]);
    expect(cola.trabadas[0]!.trabada.length).toBe(2);
  });

  it("las que no nombran ninguna cifra van después de las que sí, no antes", () => {
    const cola = ordenarCola([
      con("sin", { por_que_ahora: "el precio lo fija una sola persona" }),
      con("con", { por_que_ahora: "tiene S/ 2,800 parados" }),
    ]);
    expect(cola.hoy?.decision.id).toBe("con");
    expect(cola.siguen[0]!.cifra).toBeNull();
  });

  it("si ninguna es decidible, no hay «la de hoy» y no se inventa una", () => {
    const cola = ordenarCola([con("x", { alternativas: [] }), con("y", { evidencia: [] })]);
    expect(cola.hoy).toBeNull();
    expect(cola.porQueEsaPrimero).toBeNull();
    expect(cola.trabadas).toHaveLength(2);
  });

  it("con la cola vacía no se rompe", () => {
    expect(ordenarCola([])).toMatchObject({ hoy: null, siguen: [], trabadas: [], porQueEsaPrimero: null });
  });
});
