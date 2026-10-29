/**
 * CADA PROVEEDOR CON SU MODELO.
 *
 * Archivo aparte a propósito: `tests/ai-respaldo.test.ts` mockea los dos proveedores para probar el
 * cambio de uno a otro, y aquí hace falta el proveedor DE VERDAD para comprobar con qué modelo se
 * construye. Mezclarlos daría una prueba que pasa mirando un doble.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { AnthropicProvider } from "@/lib/ai/anthropic";

/**
 * EL MODELO DEL RESPALDO NO PUEDE SER EL DEL PRINCIPAL.
 *
 * El fallo que esto cierra, encontrado al revisar: los dos proveedores leían `AI_MODEL`. Con Gemini
 * principal (`AI_MODEL=gemini-…`) y Anthropic de respaldo, la llamada de respaldo le pedía a
 * Anthropic el modelo «gemini-…». Eso NO es un «sin crédito»: es un 404 de modelo inexistente, que
 * el worker cobra como fallo del TRABAJO, gasta los tres intentos y lo deja fallido. O sea: con el
 * respaldo puesto, un 402 acababa PEOR que sin respaldo, que es justo lo contrario del encargo.
 */
describe("el respaldo no hereda el modelo del principal", () => {
  const guardar = () => ({ ...process.env });
  let antes: NodeJS.ProcessEnv;
  beforeEach(() => {
    antes = guardar();
  });
  afterEach(() => {
    process.env = antes;
  });

  it("Anthropic de respaldo usa SU modelo, no el de AI_MODEL del principal", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_MODEL = "gemini-3.7-flash";
    process.env.AI_MODEL_ANTHROPIC = "claude-sonnet-5";
    process.env.ANTHROPIC_API_KEY = "prueba";
    // El proveedor construido con su modelo no puede quedarse con el del otro.
    const conSuyo = new AnthropicProvider(process.env.AI_MODEL_ANTHROPIC);
    expect(conSuyo.modelo).toBe("claude-sonnet-5");
    expect(conSuyo.modelo, "pedirle a Anthropic un modelo de Gemini da un 404, no un 402").not.toMatch(/gemini/);
  });

  it("sin modelo propio, Anthropic cae en su modelo por defecto, nunca en uno de otro proveedor", () => {
    process.env.ANTHROPIC_API_KEY = "prueba";
    delete process.env.AI_MODEL;
    delete process.env.AI_MODEL_ANTHROPIC;
    expect(new AnthropicProvider().modelo).toMatch(/claude/);
  });

  it("Gemini de respaldo se rechaza, dicho, mientras AI_MODEL sea del principal", () => {
    // Su nombre de modelo es una constante del módulo y de ella cuelga la clave de su
    // cortacircuitos: no se le puede imponer uno por instancia sin rehacer eso. Antes de dejar
    // pasar un respaldo que pediría un modelo «claude-…», se dice qué variable hay que poner.
    const fuente = readFileSync(path.join(process.cwd(), "src/lib/ai/index.ts"), "utf8");
    expect(fuente).toMatch(/pedido === "gemini" && process\.env\.AI_MODEL/);
    expect(fuente).toMatch(/Se sigue SIN respaldo/);
    expect(fuente).toMatch(/AI_MODEL_GEMINI/);
  });

  it("cada proveedor tiene su variable de modelo, y AI_MODEL solo alcanza al principal", () => {
    const fuente = readFileSync(path.join(process.cwd(), "src/lib/ai/index.ts"), "utf8");
    expect(fuente).toMatch(/AI_MODEL_ANTHROPIC/);
    expect(fuente).toMatch(/AI_MODEL_GEMINI/);
    expect(fuente).toMatch(/if \(esPrincipal\) return process\.env\.AI_MODEL/);
  });
});
