/**
 * EL ENSAYO DE LA ESTRATEGIA (src/lib/estrategia/ensayo.ts y scripts/estrategia/ensayo-vivo.mts · spec-estrategia-8x.md
 * §9.4 y §11, tramo 8), CON UN PROVEEDOR FALSO QUE CUENTA LAS LLAMADAS. Ningún modelo real, ninguna base.
 *
 * El ensayo vivo es lo que mide los contratos de los tres agentes antes de llamarlos «medidos»; aquí se fija que mide lo
 * que corre en la cola, y que lo mide sin inventar:
 *  - tres llamadas en el caso normal y cuatro con la reparación, largas y con su agente, en el orden del manejador;
 *  - por llamada: su tiempo, sus tokens, su presupuesto y por qué terminó (si el proveedor no lo dice, null, nunca un
 *    valor supuesto); una que falla deja sus tokens en null y su motivo con las palabras de la pantalla;
 *  - una lente que no sale deja sin equipo rojo; una salida cortada por tamaño se marca; una etapa de más de 90 s, también;
 *  - sin el mínimo para generar no se llama al modelo;
 *  - no toca la base: si alguien llamara a supabaseAdmin(), la prueba lo vería;
 *  - el script no corre sin llave ni sin --gastar, y no guarda nada dentro del repositorio salvo en clientes/.
 *
 * Empresas FICTICIAS (tests/fixtures/estrategia-falsa.ts).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { usarProveedor } from "@/lib/ai";
import { AIValidationError, type AIProvider } from "@/lib/ai/provider";
import { ensayarEstrategia, LIMITE_ETAPA_MS } from "@/lib/estrategia/ensayo";
import { PRESUPUESTO_TOKENS } from "@/lib/estrategia/esquemas";
import { TOKENS_POR_ESTRATEGIA } from "@/lib/estrategia/motor";
import { CLAVES_CONTROL } from "@/lib/estrategia/calidad";
import { MOTOR } from "@/lib/estrategia/textos";
import { INSTRUCCION_REPARACION } from "@/lib/ai/agents/equipo-rojo";
import { PATRON_ID_A_LA_VISTA } from "@/lib/estrategia/pantalla";
import { proveedorFalso } from "./fixtures/base-estrategia";
import { entradasDental, entradasFrutas, HOY, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, ROJO_BUENO, ROJO_CON_CIFRAS } from "./fixtures/estrategia-falsa";

// Si el ensayo tocara la base, quedaría anotado aquí (y la llamada fallaría).
const estado = vi.hoisted(() => ({ base: [] as string[] }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => {
    estado.base.push("supabaseAdmin");
    throw new Error("el ensayo no toca la base");
  },
  supabaseSoloLectura: () => {
    estado.base.push("supabaseSoloLectura");
    throw new Error("el ensayo no toca la base");
  },
}));

const BUENAS = { lente_dinero: LENTE_DINERO_BUENA, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: ROJO_BUENO };

afterEach(() => {
  usarProveedor(null);
  estado.base = [];
});

describe("el ensayo corre el motor entero, en el orden de la cola, sin base", () => {
  it("lo normal son tres llamadas largas, cada una con su agente; la versión quedaría lista y el informe lo dice todo", async () => {
    const p = proveedorFalso(BUENAS);
    usarProveedor(p.proveedor);
    const inf = await ensayarEstrategia(entradasFrutas(), HOY);
    expect(p.llamadas.map((l) => l.agente)).toEqual(["lente_dinero", "lente_terreno", "equipo_rojo"]);
    expect(p.llamadas.every((l) => l.largo)).toBe(true);
    // Cada lente recibe el material de la empresa y nada de la otra (la otra todavía no existe cuando las dos salen).
    expect(p.llamadas[0]!.user).not.toContain(LENTE_TERRENO_BUENA.lectura);
    expect(p.llamadas[1]!.user).not.toContain(LENTE_DINERO_BUENA.lectura);
    expect(inf).toMatchObject({ estado: "lista", fallo: null, lentas: [], cortadas: [], falta_para_generar: [] });
    expect(inf.llamadas.map((l) => [l.etapa, l.agente, l.ok])).toEqual([["dinero", "lente_dinero", true], ["terreno", "lente_terreno", true], ["rojo", "equipo_rojo", true]]);
    for (const l of inf.llamadas) {
      expect(l).toMatchObject({ tokens_entrada: 1000, tokens_salida: 500, presupuesto: PRESUPUESTO_TOKENS[l.agente], modelo: "modelo-falso", intentos: 1, motivo: null });
      expect(l.ms).toBeGreaterThanOrEqual(0);
    }
    expect(inf.tokens).toEqual({ entrada: 3000, salida: 1500, total: 4500, previsto: TOKENS_POR_ESTRATEGIA });
    expect(inf.validador).toEqual({ errores: 0, avisos: expect.any(Number) });
    expect(inf.quitado).toEqual([]);
    // La lista de control es la del código, una sola vez; la buena la cumple entera.
    expect(inf.control.map((c) => c.clave)).toEqual([...CLAVES_CONTROL]);
    expect(inf.control.filter((c) => !c.cumple).map((c) => c.clave)).toEqual([]);
    expect(inf.estrategia?.caminos.a.jugadas.length).toBeGreaterThanOrEqual(3);
    expect(inf.recortes).toEqual(expect.any(Array));
    // Lo principal en palabras, para leerlo contra la vara: con las cifras escritas y sin un solo id del código.
    const leer = inf.para_leer!;
    expect(leer.lectura).toHaveLength(5);
    expect(leer.caminos.map((c) => c.letra)).toEqual(["a", "b"]);
    for (const c of leer.caminos) {
      expect(c.jugadas.length).toBe(inf.estrategia!.caminos[c.letra].jugadas.length);
      expect(c.casos.length).toBeGreaterThanOrEqual(2);
      expect(c.a_90_dias).toMatch(/S\/|sin dato/);
    }
    expect(leer.victorias.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(leer)).not.toMatch(PATRON_ID_A_LA_VISTA);
    // No se tocó la base.
    expect(estado.base).toEqual([]);
  });

  it("si el proveedor no dice por qué terminó, queda null (no se supone); si lo dice, se informa tal cual", async () => {
    const p = proveedorFalso(BUENAS);
    usarProveedor(p.proveedor);
    expect((await ensayarEstrategia(entradasFrutas(), HOY)).llamadas.map((l) => l.fin)).toEqual([null, null, null]);
    const conFin: AIProvider = { ...p.proveedor, complete: async (x) => ({ ...(await p.proveedor.complete(x)), fin: "STOP" }) };
    usarProveedor(conFin);
    expect((await ensayarEstrategia(entradasFrutas(), HOY)).llamadas.map((l) => l.fin)).toEqual(["STOP", "STOP", "STOP"]);
  });

  it("con cifras sin origen: una sola reparación (cuatro llamadas) y, si persisten, se quitan con marca y quedaría «con observaciones»", async () => {
    const p = proveedorFalso({ ...BUENAS, equipo_rojo: ROJO_CON_CIFRAS });
    usarProveedor(p.proveedor);
    const inf = await ensayarEstrategia(entradasFrutas(), HOY);
    expect(p.llamadas.map((l) => l.agente)).toEqual(["lente_dinero", "lente_terreno", "equipo_rojo", "equipo_rojo"]);
    expect(p.llamadas[3]!.user).toContain(INSTRUCCION_REPARACION);
    expect(inf.llamadas.map((l) => l.etapa)).toEqual(["dinero", "terreno", "rojo", "reparacion"]);
    expect(inf.estado).toBe("con_observaciones");
    expect(inf.quitado.length).toBeGreaterThan(0);
    expect(inf.control.find((c) => c.clave === "cifras_con_origen")?.cumple).toBe(true);
    expect(inf.tokens.total).toBe(6000);
  });

  it("si la reparación arregla, quedaría lista sin quitar nada", async () => {
    const p = proveedorFalso({ ...BUENAS, equipo_rojo: (_x, n) => (n === 1 ? ROJO_CON_CIFRAS : ROJO_BUENO) });
    usarProveedor(p.proveedor);
    const inf = await ensayarEstrategia(entradasFrutas(), HOY);
    expect(p.llamadas).toHaveLength(4);
    expect(inf).toMatchObject({ estado: "lista", quitado: [] });
  });

  it("una lente que no sale deja sin equipo rojo, con su motivo en palabras; cortada por tamaño se marca y sus tokens quedan sin dato", async () => {
    const cortada = () => {
      throw new AIValidationError("La salida del modelo no validó contra el esquema (lente_terreno): JSON inválido", "[finishReason=MAX_TOKENS] {\"lectura\":");
    };
    const p = proveedorFalso({ ...BUENAS, lente_terreno: cortada });
    usarProveedor(p.proveedor);
    const inf = await ensayarEstrategia(entradasFrutas(), HOY);
    expect(p.llamadas.map((l) => l.agente)).toEqual(["lente_dinero", "lente_terreno"]);
    expect(inf).toMatchObject({ estado: "fallida", fallo: { etapa: "terreno", motivo: MOTOR.cortada }, cortadas: ["terreno"], estrategia: null });
    expect(inf.llamadas[1]).toMatchObject({ ok: false, tokens_entrada: null, tokens_salida: null, fin: "MAX_TOKENS", motivo: MOTOR.cortada });
    // Lo que sí salió cuenta en los tokens; lo que no, no suma cero: no está.
    expect(inf.tokens.total).toBe(1500);

    const noValida = () => {
      throw new AIValidationError("La salida del modelo no validó contra el esquema (equipo_rojo): lectura: Too small", "{}");
    };
    usarProveedor(proveedorFalso({ ...BUENAS, equipo_rojo: noValida }).proveedor);
    const rojo = await ensayarEstrategia(entradasFrutas(), HOY);
    expect(rojo.estado).toBe("fallida");
    expect(rojo.fallo?.etapa).toBe("rojo");
    expect(rojo.fallo?.motivo).toBe(MOTOR.no_valido("lectura: Too small"));
    expect(rojo.cortadas).toEqual([]);
  });

  it("una etapa que pasa de 90 s queda marcada: se recortan los topes del esquema antes de seguir", async () => {
    usarProveedor(proveedorFalso(BUENAS).proveedor);
    // Un reloj que avanza un minuto en cada lectura: las lentes (que corren a la vez) duran dos; el equipo rojo, uno.
    let t = 0;
    const inf = await ensayarEstrategia(entradasFrutas(), HOY, { reloj: () => (t += 60_000) - 60_000 });
    expect(inf.llamadas.map((l) => [l.etapa, l.ms])).toEqual([["dinero", 120_000], ["terreno", 120_000], ["rojo", 60_000]]);
    expect(inf.lentas).toEqual(["dinero", "terreno"]);
    expect(LIMITE_ETAPA_MS).toBe(90_000);
  });

  it("sin el mínimo para generar no se llama al modelo, y dice qué falta", async () => {
    const p = proveedorFalso(BUENAS);
    usarProveedor(p.proveedor);
    const inf = await ensayarEstrategia(entradasDental(), HOY);
    expect(inf.estado).toBe("sin_generar");
    expect(inf.falta_para_generar.length).toBeGreaterThan(0);
    expect(p.llamadas).toEqual([]);
    expect(inf.tokens.total).toBe(0);
  });

  it("las preguntas que saldrían para el dueño son las del catálogo, sin cifras de ejemplo", async () => {
    usarProveedor(proveedorFalso(BUENAS).proveedor);
    const inf = await ensayarEstrategia(entradasFrutas(), HOY);
    expect(inf.preguntas.length, "si esto falla, la prueba no mira nada").toBeGreaterThan(0);
    for (const q of inf.preguntas) expect(q, q).not.toMatch(/\d/);
  });
});

describe("el script del ensayo vivo (no se corre aquí: llamaría al modelo real)", () => {
  const script = readFileSync(path.resolve(__dirname, "../scripts/estrategia/ensayo-vivo.mts"), "utf8");
  const importaciones = script.split("\n").filter((l) => /^import\b/.test(l));

  it("sin llave sale con BLOCKED_EXTERNAL (código 2) y sin --gastar no llama a nada", () => {
    expect(script).toMatch(/BLOCKED_EXTERNAL[\s\S]*process\.exit\(2\)/);
    expect(script).toMatch(/process\.argv\.includes\("--gastar"\)/);
    // Las dos comprobaciones van antes de ensayar.
    expect(script.indexOf("BLOCKED_EXTERNAL")).toBeLessThan(script.indexOf("await ensayarEstrategia("));
    expect(script.indexOf('includes("--gastar")')).toBeLessThan(script.indexOf("await ensayarEstrategia("));
  });

  it("arma la empresa desde la fixture ficticia y corre el ensayo de la librería; no importa nada de la base", () => {
    expect(importaciones.join("\n")).toContain("../../src/lib/estrategia/ensayo");
    expect(importaciones.join("\n")).toContain("../../tests/fixtures/estrategia-falsa");
    expect(importaciones.some((l) => /supabase|db\/queries|jobs\//i.test(l)), importaciones.join("\n")).toBe(false);
  });

  it("solo escribe el informe donde se le dice, y nunca dentro del repositorio versionado salvo clientes/", () => {
    expect(script.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(script).toMatch(/dentroDelRepo && relativo\.split\(path\.sep\)\[0\] !== "clientes"/);
    expect(script.indexOf('!== "clientes"')).toBeLessThan(script.indexOf("await ensayarEstrategia("));
  });
});
