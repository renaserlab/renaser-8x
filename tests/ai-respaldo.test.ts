/**
 * QUEDARSE SIN CRÉDITO EN UN PROVEEDOR NO DETIENE 8X (src/lib/ai/index.ts).
 *
 * El 28-09-2026 Gemini devolvió «402 · Your prepayment credits are depleted» y los 16 agentes quedaron detenidos por
 * una cuenta sin saldo: `ai()` elegía un proveedor al arrancar y no tenía a dónde ir. Con `AI_PROVIDER_RESPALDO` esa
 * llamada la contesta el otro proveedor y QUEDA DICHO (consola y `respaldo` en el resultado).
 *
 * Lo que se fija aquí:
 *  - sin `AI_PROVIDER_RESPALDO` no cambia nada: el otro proveedor no se construye ni se llama, y el 402 sube igual;
 *  - ante «sin crédito» contesta el respaldo, y el resultado dice quién contestó y por qué;
 *  - ante un 429, un 503 o una salida que no valida el respaldo NO entra: un límite por ventana se espera;
 *  - si el respaldo no tiene clave, o también está sin crédito, sube el error ORIGINAL del principal con la frase que
 *    explica por qué el respaldo no estaba (un «sin crédito» cuando faltaba la clave hace perder una hora);
 *  - el respaldo se construye TARDE: un respaldo mal configurado no impide que el sistema arranque ni que el principal
 *    conteste;
 *  - un proveedor inyectado (`usarProveedor`) no lleva respaldo: una prueba que se fuera a la nube es gasto invisible.
 *
 * Sin red y sin base: los dos proveedores están reemplazados por falsos que leen su llave del entorno igual que los de
 * verdad (`anthropic.ts:17` y `gemini.ts:127`), así que ninguna prueba puede salir a internet ni gastar crédito.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

/** Los dos proveedores, falsos: cuentan construcciones y llamadas, y hacen lo que cada prueba les diga. */
const falso = vi.hoisted(() => {
  const estado = {
    construidos: [] as string[],
    llamadas: [] as { proveedor: string; agente?: string }[],
    /** Qué hace cada proveedor al ser llamado: devolver una salida, o lanzar el error que la prueba quiera. */
    acciones: {} as Record<string, () => unknown>,
  };
  const clase = (nombre: string, variable: string) =>
    class {
      constructor() {
        estado.construidos.push(nombre);
        // Igual que los proveedores de verdad: sin llave en el entorno, el constructor lanza.
        if (!process.env[variable]) throw new Error(`Falta ${variable}`);
      }
      async complete(p: { schema: { parse: (v: unknown) => unknown }; agente?: string }) {
        estado.llamadas.push({ proveedor: nombre, agente: p.agente });
        const accion = estado.acciones[nombre];
        if (!accion) throw new Error(`La prueba no dijo qué hace el proveedor «${nombre}».`);
        return { data: p.schema.parse(accion()), tokens_entrada: 10, tokens_salida: 5, modelo: `modelo-de-${nombre}`, latencia_ms: 1, intentos: 1 };
      }
      async transcribe() {
        throw new Error(`El proveedor falso «${nombre}» no transcribe.`);
      }
      puedeTranscribir() {
        return false;
      }
    };
  return { estado, clase };
});
vi.mock("@/lib/ai/gemini", () => ({ GeminiProvider: falso.clase("gemini", "GEMINI_API_KEY") }));
vi.mock("@/lib/ai/anthropic", () => ({ AnthropicProvider: falso.clase("anthropic", "ANTHROPIC_API_KEY") }));

let avisos: string[] = [];

/**
 * Arranca el módulo de IA con el entorno que se le dé (`undefined` = la variable NO está). Hay que recargarlo en cada
 * prueba porque `AI_PROVIDER` y `AI_PROVIDER_RESPALDO` se leen al elegir proveedor, y porque `ai()` cachea.
 * Devuelve también las clases de error RECARGADAS: tras `resetModules` las de otro ciclo no son las mismas clases y
 * `instanceof` fallaría.
 */
async function arrancar(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  const base = { AI_PROVIDER: "gemini", AI_PROVIDER_RESPALDO: undefined, GEMINI_API_KEY: "llave-falsa", ANTHROPIC_API_KEY: "llave-falsa" };
  for (const [k, v] of Object.entries({ ...base, ...env })) vi.stubEnv(k, v as string);
  const mod = await import("@/lib/ai");
  const errores = await import("@/lib/ai/provider");
  return { ...mod, errores };
}

const pedido = (agente?: string) => ({ system: "s", user: "u", schema: z.object({ ok: z.string() }), priority: "batch" as const, ...(agente ? { agente } : {}) });

/** El error de una llamada que TIENE que fallar. Si contesta, la prueba muere aquí y no en un `expect` confuso. */
async function elErrorDe(llamada: Promise<unknown>): Promise<Error> {
  try {
    await llamada;
  } catch (e) {
    return e as Error;
  }
  throw new Error("se esperaba que la llamada fallara y contestó");
}

const SIN_CREDITO = "Gemini 402: Your prepayment credits are depleted";
const proveedoresLlamados = () => falso.estado.llamadas.map((l) => l.proveedor);
const dicho = () => avisos.join("\n");

beforeEach(() => {
  falso.estado.construidos = [];
  falso.estado.llamadas = [];
  falso.estado.acciones = {};
  avisos = [];
  vi.spyOn(console, "warn").mockImplementation((...partes: unknown[]) => {
    avisos.push(partes.map(String).join(" "));
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ─── Sin respaldo configurado: nada cambia ───────────────────────────────────────────────────────

describe("sin AI_PROVIDER_RESPALDO el comportamiento es el de siempre", () => {
  it("el principal contesta y el resultado no habla de respaldo", async () => {
    const s = await arrancar();
    falso.estado.acciones.gemini = () => ({ ok: "listo" });
    const r = await s.ai().complete(pedido("revisor"));
    expect(r.data).toEqual({ ok: "listo" });
    expect(r.modelo).toBe("modelo-de-gemini");
    expect(r.respaldo).toBeUndefined();
    expect(falso.estado.construidos).toEqual(["gemini"]);
  });

  it("ante «sin crédito» sube el mismo error, y el otro proveedor no se construye ni se llama", async () => {
    const s = await arrancar();
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e).toBeInstanceOf(s.errores.AIProviderPausedError);
    expect(e.message).toBe(SIN_CREDITO);
    expect(e.message).not.toContain("RESPALDO");
    expect(falso.estado.construidos).toEqual(["gemini"]);
    expect(proveedoresLlamados()).toEqual(["gemini"]);
  });
});

// ─── Con respaldo: entra solo ante «sin crédito», y queda dicho ──────────────────────────────────

describe("con AI_PROVIDER_RESPALDO el respaldo entra ante «sin crédito»", () => {
  it("contesta el respaldo, y el resultado dice quién contestó y por qué", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    falso.estado.acciones.anthropic = () => ({ ok: "contestó el respaldo" });
    const r = await s.ai().complete(pedido("revisor"));
    expect(r.data).toEqual({ ok: "contestó el respaldo" });
    // Qué modelo contestó se puede saber después: `modelo` es el del respaldo y `registrarLlamada` ya lo guarda.
    expect(r.modelo).toBe("modelo-de-anthropic");
    expect(r.respaldo).toEqual({ proveedor: "anthropic", porque: SIN_CREDITO });
    expect(proveedoresLlamados()).toEqual(["gemini", "anthropic"]);
  });

  it("queda dicho por consola, con el prefijo del módulo, de quién es la llamada y qué dijo el principal", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    falso.estado.acciones.anthropic = () => ({ ok: "listo" });
    await s.ai().complete(pedido("revisor"));
    expect(dicho()).toContain("[ia]");
    expect(dicho()).toContain("«gemini» está sin crédito");
    expect(dicho()).toContain("respaldo «anthropic»");
    expect(dicho()).toContain("revisor");
    expect(dicho()).toContain(SIN_CREDITO);
  });

  it("el respaldo se construye TARDE: si el principal contesta, nunca se construye", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    falso.estado.acciones.gemini = () => ({ ok: "listo" });
    const r = await s.ai().complete(pedido());
    expect(r.respaldo).toBeUndefined();
    expect(falso.estado.construidos).toEqual(["gemini"]);
  });

  it("el nombre se lee con espacios y mayúsculas: un salto de línea en la variable no debe dejar sin respaldo", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: " Anthropic \n" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    falso.estado.acciones.anthropic = () => ({ ok: "listo" });
    const r = await s.ai().complete(pedido());
    expect(r.respaldo?.proveedor).toBe("anthropic");
  });

  it("al revés también: con Anthropic principal, el respaldo es Gemini", async () => {
    const s = await arrancar({ AI_PROVIDER: "anthropic", AI_PROVIDER_RESPALDO: "gemini" });
    falso.estado.acciones.anthropic = () => {
      throw new s.errores.AIProviderPausedError("Anthropic 400: credit balance is too low");
    };
    falso.estado.acciones.gemini = () => ({ ok: "listo" });
    const r = await s.ai().complete(pedido());
    expect(r.respaldo?.proveedor).toBe("gemini");
    expect(proveedoresLlamados()).toEqual(["anthropic", "gemini"]);
  });
});

// ─── Lo que NO dispara el respaldo ───────────────────────────────────────────────────────────────

describe("el respaldo NO entra ante un límite por ventana ni ante cualquier otro fallo", () => {
  it("un 429 se espera, no se cambia de proveedor (cambiar duplicaría el gasto por segundos de espera)", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIRateLimitError("Gemini 429: quota exceeded");
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e).toBeInstanceOf(s.errores.AIRateLimitError);
    expect(e.message).toBe("Gemini 429: quota exceeded");
    expect(falso.estado.construidos).toEqual(["gemini"]);
    expect(proveedoresLlamados()).toEqual(["gemini"]);
  });

  it("un 503 del proveedor tampoco: eso ya lo reintenta el proveedor y, si no, el worker", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderDownError("Gemini 503: model overloaded");
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e).toBeInstanceOf(s.errores.AIProviderDownError);
    expect(proveedoresLlamados()).toEqual(["gemini"]);
  });

  it("una salida que no valida es problema de la salida, no del crédito", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIValidationError("La salida del modelo no validó contra el esquema", "{}");
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e).toBeInstanceOf(s.errores.AIValidationError);
    expect(proveedoresLlamados()).toEqual(["gemini"]);
  });

  it("un respaldo que es el mismo proveedor principal no respalda nada: se avisa y se sigue sin respaldo", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "gemini" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e.message).toBe(SIN_CREDITO);
    expect(proveedoresLlamados()).toEqual(["gemini"]);
    expect(dicho()).toContain("[ia]");
    expect(dicho()).toContain("mismo proveedor principal");
  });

  it("un nombre que no es de este sistema no se traga en silencio: se avisa y se sigue sin respaldo", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "openai" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e.message).toBe(SIN_CREDITO);
    expect(dicho()).toContain("no es un proveedor de este sistema");
  });
});

// ─── Cuando el respaldo no está: el error que sube es el del principal ───────────────────────────

describe("si el respaldo no está, sube el error ORIGINAL del principal diciendo por qué", () => {
  it("sin la llave del respaldo: el 402 del principal, con «Falta ANTHROPIC_API_KEY» al final", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic", ANTHROPIC_API_KEY: undefined });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    // El mismo tipo y el mismo prefijo: el worker decide por `instanceof` y la torre busca «Gemini 402».
    expect(e).toBeInstanceOf(s.errores.AIProviderPausedError);
    expect(e.message.startsWith(SIN_CREDITO)).toBe(true);
    expect(e.message).toContain("RESPALDO NO DISPONIBLE");
    expect(e.message).toContain("Falta ANTHROPIC_API_KEY");
    // Se intentó construirlo (de ahí el motivo), pero nunca se le pidió nada.
    expect(falso.estado.construidos).toEqual(["gemini", "anthropic"]);
    expect(proveedoresLlamados()).toEqual(["gemini"]);
  });

  it("un respaldo sin llave no impide arrancar ni estorba cuando el principal contesta", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic", ANTHROPIC_API_KEY: undefined });
    falso.estado.acciones.gemini = () => ({ ok: "listo" });
    const r = await s.ai().complete(pedido());
    expect(r.data).toEqual({ ok: "listo" });
    expect(falso.estado.construidos).toEqual(["gemini"]);
  });

  it("el respaldo tampoco tiene crédito: sube el del principal, que es la cuenta que hay que recargar primero", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    falso.estado.acciones.anthropic = () => {
      throw new s.errores.AIProviderPausedError("Anthropic 400: credit balance is too low");
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e).toBeInstanceOf(s.errores.AIProviderPausedError);
    expect(e.message.startsWith(SIN_CREDITO)).toBe(true);
    expect(e.message).toContain("también está sin crédito");
    expect(e.message).toContain("credit balance is too low");
    expect(proveedoresLlamados()).toEqual(["gemini", "anthropic"]);
  });

  it("si el respaldo falla por otra cosa, sube SU error (es la llamada que de verdad se hizo) y queda dicho", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    falso.estado.acciones.gemini = () => {
      throw new s.errores.AIProviderPausedError(SIN_CREDITO);
    };
    falso.estado.acciones.anthropic = () => {
      throw new s.errores.AIRateLimitError("Anthropic 429: rate limited");
    };
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e).toBeInstanceOf(s.errores.AIRateLimitError);
    expect(dicho()).toContain("el respaldo «anthropic» tampoco pudo");
    expect(dicho()).toContain("Anthropic 429");
  });
});

// ─── Un proveedor inyectado no lleva respaldo ────────────────────────────────────────────────────

describe("usarProveedor sigue funcionando igual, y lo inyectado no dispara respaldo", () => {
  it("el proveedor inyectado contesta, y ningún proveedor real se construye", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    s.usarProveedor({
      complete: async () => ({ data: { ok: "inyectado" } as never, tokens_entrada: 1, tokens_salida: 1, modelo: "modelo-falso", latencia_ms: 1, intentos: 1 }),
      transcribe: async () => ({ texto: "", segmentos: [] }),
      puedeTranscribir: () => false,
    });
    const r = await s.ai().complete(pedido());
    expect(r.data).toEqual({ ok: "inyectado" });
    expect(falso.estado.construidos).toEqual([]);
    s.usarProveedor(null);
  });

  it("su «sin crédito» sube tal cual: nadie sale a la nube a buscar un respaldo", async () => {
    const s = await arrancar({ AI_PROVIDER_RESPALDO: "anthropic" });
    s.usarProveedor({
      complete: async () => {
        throw new s.errores.AIProviderPausedError("el proveedor falso dice 402");
      },
      transcribe: async () => ({ texto: "", segmentos: [] }),
      puedeTranscribir: () => false,
    });
    const e = await elErrorDe(s.ai().complete(pedido()));
    expect(e.message).toBe("el proveedor falso dice 402");
    expect(e.message).not.toContain("RESPALDO");
    expect(falso.estado.construidos).toEqual([]);
    expect(proveedoresLlamados()).toEqual([]);
    s.usarProveedor(null);
  });
});
