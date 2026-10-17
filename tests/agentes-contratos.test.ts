/**
 * NINGÚN AGENTE CORRE SIN FICHA.
 *
 * El Manual de Agentes y Estándares de RENASER (v1.2) lo exige en dos puntos que no son decorativos:
 *   AH01 · «Herramientas y permisos aplicados por el entorno, ADEMÁS de las instrucciones».
 *   AH05 · «Límites de costo, tiempo y reintentos configurados y probados».
 *
 * «Probados» es esta prueba. Un límite escrito en un prompt es una sugerencia que el modelo puede
 * ignorar; un límite escrito en un manual que nadie comprueba es una intención. Lo que de verdad
 * limita es código que falla cuando alguien lo rompe.
 *
 * La prueba clave es la de sincronía: recorre el código fuente buscando cada `agente: "x"` real y
 * exige que tenga contrato. Así, el día que alguien agregue el agente número diecisiete, las pruebas
 * se caen antes de que llegue a un cliente.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { CONTRATOS, CLAVES_AGENTE, aplicarContrato, esAgenteConocido, AgenteSinContrato, type Contrato } from "@/lib/agentes/contratos";
import { PRESUPUESTO_TOKENS } from "@/lib/estrategia/esquemas";

const SRC = path.resolve(__dirname, "../src");

function todoElCodigo(dir = SRC): string {
  let acc = "";
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) acc += todoElCodigo(f);
    else if (/[.]tsx?$/.test(e.name)) acc += readFileSync(f, "utf8") + "\n";
  }
  return acc;
}

const CODIGO = todoElCodigo();
// Los agentes que el código REALMENTE invoca, leídos del código y no de una lista paralela.
const INVOCADOS = [...new Set([...CODIGO.matchAll(/agente:\s*"([a-z_]+)"/g)].map((m) => m[1]))].sort();

describe("los agentes del código y sus contratos están sincronizados", () => {
  it("se detectaron agentes en el código (si esto falla, la prueba no mira nada)", () => {
    expect(INVOCADOS.length).toBeGreaterThan(10);
  });

  it.each(INVOCADOS)("el agente «%s» que corre en el código tiene ficha", (clave) => {
    expect(esAgenteConocido(clave), `"${clave}" corre sin ficha. El manual (sección 4) la exige antes de activarlo.`).toBe(true);
  });

  it("no hay fichas de agentes que ya nadie invoca", () => {
    const invocados = new Set(INVOCADOS);
    const huerfanas = CLAVES_AGENTE.filter((c) => !invocados.has(c));
    expect(huerfanas, `Fichas sin agente: ${huerfanas.join(", ")}. O se conecta el agente o se borra la ficha.`).toEqual([]);
  });
});

describe("cada ficha tiene los campos que el manual hace obligatorios", () => {
  const OBLIGATORIOS: (keyof Contrato)[] = [
    "clave", "version", "proposito", "disparador", "fuentes", "entrada", "salida",
    "acciones_prohibidas", "aprobador", "presupuesto_tokens", "tiempo_max_ms",
    "reintentos", "exito", "parada", "recuperacion", "responsable",
  ];

  it.each(CLAVES_AGENTE)("«%s» está completa", (clave) => {
    const c = CONTRATOS[clave];
    for (const campo of OBLIGATORIOS) {
      const v = c[campo];
      const vacio = v == null || v === "" || (Array.isArray(v) && v.length === 0);
      expect(vacio, `${clave}: falta "${campo}"`).toBe(false);
    }
  });

  it.each(CLAVES_AGENTE)("«%s» declara su clave igual que su posición en el registro", (clave) => {
    expect(CONTRATOS[clave].clave).toBe(clave);
  });

  it.each(CLAVES_AGENTE)("«%s» tiene presupuesto, tiempo y reintentos con sentido", (clave) => {
    const c = CONTRATOS[clave];
    expect(c.presupuesto_tokens).toBeGreaterThan(0);
    expect(c.tiempo_max_ms).toBeGreaterThanOrEqual(30_000);
    // El manual propone máximo dos reintentos para fallos transitorios.
    expect(c.reintentos).toBeLessThanOrEqual(2);
  });

  it("todo agente que escribe algo que el dueño verá tiene aprobador humano", () => {
    const sinAprobador = CLAVES_AGENTE.filter((k) => CONTRATOS[k].aprobador === "nadie");
    // Los únicos sin aprobador son los que no producen nada que el dueño lea directamente.
    expect(sinAprobador.sort()).toEqual(["auditor", "contrastador", "entrevistador", "extractor", "minero"]);
  });

  it("cada ficha dice si su presupuesto sale de medición o del límite heredado", () => {
    const medidos = CLAVES_AGENTE.filter((k) => CONTRATOS[k].medido);
    // Siete tienen su presupuesto medido con consumo real; el resto se corrige con datos, no con opinión. Los tres de la
    // estrategia pasan a medidos cuando el ensayo vivo (scripts/estrategia/ensayo-vivo.mts) los mida: entonces son diez.
    expect(medidos.length).toBe(7);
  });
});

describe("los tres agentes de la estrategia (spec-estrategia-8x.md §5.1)", () => {
  const ESTRATEGIA = ["lente_dinero", "lente_terreno", "equipo_rojo"] as const;

  it.each(ESTRATEGIA)("«%s» tiene ficha, la aprueba la consultora y responde Dirección", (clave) => {
    expect(CONTRATOS[clave]).toMatchObject({ clave, aprobador: "consultor", responsable: "Dirección", reintentos: 1, medido: false });
  });

  it.each(ESTRATEGIA)("«%s» tiene el presupuesto que cubre su esquema y el plazo verdadero (AI_TIMEOUT_MS)", (clave) => {
    expect(CONTRATOS[clave].presupuesto_tokens).toBe(PRESUPUESTO_TOKENS[clave]);
    expect(CONTRATOS[clave].tiempo_max_ms).toBe(120_000);
  });

  it.each(ESTRATEGIA)("«%s» prohíbe escribir cifras sin origen, suponer cuánto es algo hoy y nombrar a otra empresa", (clave) => {
    const p = CONTRATOS[clave].acciones_prohibidas.join(" · ");
    expect(p).toMatch(/cifra que no venga del paquete/);
    expect(p).toMatch(/Suponer cuánto es algo hoy/);
    expect(p).toMatch(/otra empresa/);
  });

  it("las dos lentes además prohíben leer la otra lente: la independencia es la razón de tener dos", () => {
    for (const clave of ["lente_dinero", "lente_terreno"] as const) expect(CONTRATOS[clave].acciones_prohibidas).toContain("Leer la otra lente");
  });

  it("cada uno se llama con su agente literal y con `largo: true`, en su propio archivo", () => {
    for (const [clave, archivo] of [["lente_dinero", "lente-dinero"], ["lente_terreno", "lente-terreno"], ["equipo_rojo", "equipo-rojo"]] as const) {
      const src = readFileSync(path.join(SRC, "lib/ai/agents", `${archivo}.ts`), "utf8");
      expect(src).toContain(`agente: "${clave}"`);
      expect(src).toMatch(/largo:\s*true/);
    }
  });
});

describe("el contrato se impone: el presupuesto del agente manda sobre lo que pida quien llama", () => {
  it("recorta una petición que excede el presupuesto", () => {
    const r = aplicarContrato("contrastador", 999_999);
    expect(r!.maxTokens).toBe(CONTRATOS.contrastador.presupuesto_tokens);
  });

  it("respeta una petición más austera que el presupuesto", () => {
    const r = aplicarContrato("diagnosticador", 1000);
    expect(r!.maxTokens).toBe(1000);
  });

  it("sin petición usa el presupuesto de la ficha", () => {
    expect(aplicarContrato("sop")!.maxTokens).toBe(CONTRATOS.sop.presupuesto_tokens);
  });

  it("un agente desconocido NO corre", () => {
    expect(() => aplicarContrato("agente_inventado")).toThrow(AgenteSinContrato);
  });

  it("una llamada sin agente pasa sin contrato (transcripción, pruebas)", () => {
    expect(aplicarContrato(undefined)).toBeNull();
  });

  it("devuelve también el tiempo máximo, los reintentos y la versión", () => {
    const r = aplicarContrato("equipo_rojo")!;
    expect(r.tiempo_max_ms).toBe(CONTRATOS.equipo_rojo.tiempo_max_ms);
    expect(r.reintentos).toBe(CONTRATOS.equipo_rojo.reintentos);
    expect(r.version).toBe(CONTRATOS.equipo_rojo.version);
  });
});

describe("el entorno lo aplica, no el prompt (AH01)", () => {
  it("los dos proveedores imponen el contrato al entrar a complete()", () => {
    for (const f of ["gemini.ts", "anthropic.ts"]) {
      const src = readFileSync(path.join(SRC, "lib/ai", f), "utf8");
      expect(src, `${f} no impone el contrato`).toContain("aplicarContrato(p.agente, p.maxTokens)");
    }
  });
});
