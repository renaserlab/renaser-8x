/**
 * EL MAPA NO PUEDE DESVIARSE DEL SISTEMA REAL.
 *
 * Un diagrama que se desvía del código es peor que no tener diagrama, porque se le cree. Así que el
 * mapa no se declara y ya: cada nodo debe ser un tipo de trabajo REGISTRADO en el worker, cada
 * flecha una llamada real a `encolar()` dentro de un manejador, y cada disparador una ruta de la API
 * que existe en disco.
 *
 * Si alguien conecta dos trabajos y no toca el mapa, esta prueba falla. Ese es todo su propósito.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import { NODOS, NODO, ARISTAS, AUTO_ENCOLA, FASES, agentesFueraDelMapa } from "@/lib/mapa-sistema";
import { CLAVES_AGENTE, esAgenteConocido } from "@/lib/agentes/contratos";

const RAIZ = path.resolve(__dirname, "..");
const WORKER = readFileSync(path.join(RAIZ, "src/lib/jobs/worker.ts"), "utf8");

/** Los tipos que el worker sabe ejecutar: `tipo: handler,` dentro del registro HANDLERS. */
const REGISTRADOS = (() => {
  const i = WORKER.indexOf("HANDLERS");
  const bloque = WORKER.slice(i, WORKER.indexOf("};", i));
  return [...bloque.matchAll(/^\s{2}([a-z_]+):\s*handle/gm)].map((m) => m[1]);
})();

/** Todas las llamadas a encolar() de los manejadores, con el tipo que encolan. */
const ENCOLADOS = (() => {
  const dir = path.join(RAIZ, "src/lib/jobs/handlers");
  const pares: { archivo: string; tipo: string }[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts")) continue;
    const src = readFileSync(path.join(dir, f), "utf8");
    for (const m of src.matchAll(/encolar\(\{[\s\S]{0,300}?tipo:\s*"([a-z_]+)"/g)) {
      if (REGISTRADOS.includes(m[1])) pares.push({ archivo: f, tipo: m[1] });
    }
  }
  return pares;
})();

describe("cada nodo del mapa es un trabajo que el worker sabe ejecutar", () => {
  it("se leyó el registro del worker (si esto falla, la prueba no mira nada)", () => {
    expect(REGISTRADOS.length).toBeGreaterThanOrEqual(15);
  });

  it.each(NODOS.map((n) => [n.tipo, n] as const))("«%s» está registrado en el worker", (tipo) => {
    expect(REGISTRADOS, `el mapa dibuja "${tipo}" pero el worker no lo ejecuta`).toContain(tipo);
  });

  it("no hay trabajos registrados que el mapa esconda", () => {
    const enMapa = new Set(NODOS.map((n) => n.tipo));
    const faltan = REGISTRADOS.filter((t) => !enMapa.has(t));
    expect(faltan, `El worker ejecuta esto y el mapa no lo dibuja: ${faltan.join(", ")}`).toEqual([]);
  });

  it("cada nodo está en una fase que existe", () => {
    const fases = new Set(FASES.map((f) => f.clave));
    for (const n of NODOS) expect(fases.has(n.fase), `${n.tipo} en fase desconocida`).toBe(true);
  });

  it("cada nodo explica qué hace, en una línea legible", () => {
    for (const n of NODOS) expect(n.hace.length, n.tipo).toBeGreaterThan(25);
  });
});

describe("cada flecha corresponde a una llamada real a la cola", () => {
  it("se encontraron llamadas a encolar en los manejadores", () => {
    expect(ENCOLADOS.length).toBeGreaterThan(3);
  });

  it.each(ARISTAS.map((a) => [`${a.de} → ${a.a}`, a] as const))("%s existe en el código", (_n, a) => {
    const tipos = ENCOLADOS.map((e) => e.tipo);
    expect(tipos, `el mapa dibuja ${a.de} → ${a.a} pero ningún manejador encola "${a.a}"`).toContain(a.a);
  });

  it("no se dibuja ninguna flecha de más: todo lo encolado está declarado", () => {
    const declarado = new Set(NODOS.flatMap((n) => n.encola));
    const reales = [...new Set(ENCOLADOS.map((e) => e.tipo))];
    const sinDibujar = reales.filter((t) => !declarado.has(t));
    expect(sinDibujar, `Estos trabajos se encolan en el código y el mapa no lo dice: ${sinDibujar.join(", ")}`).toEqual([]);
  });
});

describe("los disparadores declarados son rutas que existen", () => {
  it.each(NODOS.flatMap((n) => n.disparadores.map((d) => [`${n.tipo}: ${d}`, d] as const)))("%s", (_n, ruta) => {
    const f = path.join(RAIZ, "src/app/api", ruta, "route.ts");
    expect(existsSync(f), `declarada la ruta ${ruta} y no existe en disco`).toBe(true);
  });
});

describe("ningún agente queda fuera del mapa sin que se diga", () => {
  it("todos los agentes del mapa tienen contrato", () => {
    for (const n of NODOS) for (const a of n.agentes) expect(esAgenteConocido(a), `${n.tipo} usa "${a}" sin contrato`).toBe(true);
  });

  it("los agentes con contrato que no están en el mapa se reportan, no se ocultan", () => {
    const fuera = agentesFueraDelMapa();
    // No se exige que esté vacío: un agente puede existir y no estar conectado todavía. Lo que se
    // exige es que la función lo DIGA, para que la pantalla pueda mostrarlo en vez de callarlo.
    for (const f of fuera) expect(CLAVES_AGENTE as readonly string[]).toContain(f);
    expect(Array.isArray(fuera)).toBe(true);
  });
});

describe("la estrategia en el mapa (spec-estrategia-8x.md §5.3)", () => {
  it("las lentes y el equipo rojo son dos trabajos de la fase de diseño, con sus agentes", () => {
    expect(NODO.get("estrategia_lente")).toMatchObject({ fase: "diseno", agentes: ["lente_dinero", "lente_terreno"] });
    expect(NODO.get("estrategia_rojo")).toMatchObject({ fase: "diseno", agentes: ["equipo_rojo"] });
  });

  it("la consultora la dispara al pedirla (las dos lentes) y al reintentar una etapa (cualquiera de las tres)", () => {
    expect(NODO.get("estrategia_lente")!.disparadores).toEqual(["/companies/[id]/estrategia", "/companies/[id]/estrategia/[eid]/reintentar"]);
    expect(NODO.get("estrategia_rojo")!.disparadores).toEqual(["/companies/[id]/estrategia/[eid]/reintentar"]);
  });

  it("la lente encola al equipo rojo, y el equipo rojo a sí mismo (la reparación, una sola vez)", () => {
    expect(ARISTAS).toContainEqual({ de: "estrategia_lente", a: "estrategia_rojo", tipo: "encola" });
    expect(AUTO_ENCOLA).toContain("estrategia_rojo");
    const handler = readFileSync(path.join(RAIZ, "src/lib/jobs/handlers/estrategia.ts"), "utf8");
    expect(handler.match(/tipo:\s*"estrategia_rojo"/g)?.length).toBe(2);
  });
});
