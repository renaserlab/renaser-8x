/**
 * SIN CRÉDITO NO SE REINTENTA: SE ESPERA.
 *
 * El 28-09-2026 Gemini devolvió 402 «prepayment credits depleted». El proveedor lo convertía en un
 * Error cualquiera, el worker consumía un intento por cada 402 y a la tercera mandaba el trabajo a
 * «fallido». Así se perdieron 81 trabajos, 76 de ellos preguntas de entrevista ya pagadas. Estas
 * pruebas fijan el comportamiento nuevo con el proveedor FALSO (ningún modelo real, ninguna base
 * real): el 402 es una PAUSA, la pausa no consume intentos, abre el circuito compartido y el cliente
 * recibe un mensaje honesto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { AIProviderPausedError } from "@/lib/ai";
import { AIRateLimitError } from "@/lib/ai/provider";
import {
  cambioTrasPausa, esErrorDePausa, mensajePausa, esperaCircuito, ESPERAS_CIRCUITO_MS,
  CIRCUITO_CREDITO, PAUSA_CREDITO_SEG, PREFIJO_PAUSA, MENSAJE_PAUSA_CLIENTE,
} from "@/lib/jobs/reglas";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

// ---- Base de datos FALSA, mínima: solo lo que el worker toca al cerrar un trabajo ----
type Fila = Record<string, unknown>;
const estado = vi.hoisted(() => ({
  jobs: [] as Fila[],
  rpcs: [] as { nombre: string; args: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: (tabla: string) => ({
      update: (patch: Fila) => ({
        eq: async (col: string, v: unknown) => {
          if (tabla !== "jobs") return { data: null, error: null };
          for (const f of estado.jobs) if (f[col] === v) Object.assign(f, patch);
          return { data: null, error: null };
        },
      }),
    }),
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      estado.rpcs.push({ nombre, args });
      return { data: nombre === "circuito_abierto" ? false : true, error: null };
    },
  }),
}));
// El tope de tokens y el registro de errores van a la base real: aquí se neutralizan.
vi.mock("@/lib/db/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/db/queries")>()),
  superaTope: async () => false,
  registrarErrorLlamada: async () => {},
}));

describe("el proveedor distingue «sin crédito» de «error»", () => {
  it("un 402 es pausa, diga lo que diga el texto", () => {
    expect(AIProviderPausedError.detecta(402, "")).toBe(true);
    expect(AIProviderPausedError.detecta(402, "prepayment credits depleted")).toBe(true);
  });
  it("prepago, créditos, facturación y saldo insuficiente son pausa aunque el estado sea otro", () => {
    expect(AIProviderPausedError.detecta(400, "Your credit balance is too low to access the Anthropic API")).toBe(true);
    expect(AIProviderPausedError.detecta(403, "Billing account disabled")).toBe(true);
    expect(AIProviderPausedError.detecta(400, "insufficient balance")).toBe(true);
    expect(AIProviderPausedError.detecta(undefined, "prepayment required")).toBe(true);
  });
  it("un 429 NUNCA es pausa, aunque Google mencione «billing details» en el mensaje de cuota", () => {
    expect(AIProviderPausedError.detecta(429, "You exceeded your current quota, please check your plan and billing details")).toBe(false);
    expect(AIProviderPausedError.detecta(529, "overloaded, check billing")).toBe(false);
  });
  it("un 500 o un 400 de esquema siguen siendo lo que eran", () => {
    expect(AIProviderPausedError.detecta(500, "Internal error")).toBe(false);
    expect(AIProviderPausedError.detecta(400, "Invalid JSON payload received. Unknown name responseJsonSchema")).toBe(false);
  });
  it("el error tiene nombre propio y es un Error de verdad", () => {
    const e = new AIProviderPausedError("Gemini 402: prepayment credits depleted");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("AIProviderPausedError");
    expect(e).not.toBeInstanceOf(AIRateLimitError);
  });
  it("gemini.ts y anthropic.ts lanzan AIProviderPausedError ante el 402 (afirmado sobre el código)", () => {
    const gemini = leer("src/lib/ai/gemini.ts");
    expect(gemini).toMatch(/res\.status === 402[\s\S]{0,400}throw new AIProviderPausedError\(`Gemini 402/);
    expect(gemini).toMatch(/AIProviderPausedError\.detecta\(res\.status, txt\)/);
    const anthropic = leer("src/lib/ai/anthropic.ts");
    expect(anthropic).toMatch(/AIProviderPausedError\.detecta\(status, msg\)[\s\S]{0,80}throw new AIProviderPausedError/);
    // El 429 se decide ANTES que la pausa: una cuota nunca se confunde con falta de crédito.
    expect(anthropic.indexOf("throw new AIRateLimitError(msg)")).toBeLessThan(anthropic.indexOf("AIProviderPausedError.detecta(status, msg)"));
  });
});

describe("la regla de la pausa (pura)", () => {
  const ahora = new Date("2026-10-13T14:05:00Z"); // 09:05 en Lima
  it("devuelve el trabajo a pendiente y DEVUELVE el intento que take_job había sumado", () => {
    expect(cambioTrasPausa({ intentos: 1 }, ahora)).toMatchObject({ estado: "pendiente", intentos: 0, lease_expira_at: null, terminado_at: null });
    expect(cambioTrasPausa({ intentos: 3 }, ahora).intentos).toBe(2);
    expect(cambioTrasPausa({ intentos: 0 }, ahora).intentos).toBe(0);
  });
  it("el error es legible y dice desde cuándo, en hora de Lima", () => {
    const m = mensajePausa(ahora);
    expect(m.startsWith(`${PREFIJO_PAUSA} (sin crédito) desde `)).toBe(true);
    expect(m).toContain("13/10/2026");
    expect(m).toContain("09:05");
    expect(cambioTrasPausa({ intentos: 1 }, ahora).error).toBe(m);
  });
  it("reconoce los dos prefijos del error perdido por crédito: el histórico y el nuevo", () => {
    expect(esErrorDePausa("Gemini 402: prepayment credits depleted")).toBe(true);
    expect(esErrorDePausa(mensajePausa(ahora))).toBe(true);
    expect(esErrorDePausa("Tope de tokens de la empresa superado.")).toBe(false);
    expect(esErrorDePausa("Gemini 429: quota")).toBe(false);
    expect(esErrorDePausa(null)).toBe(false);
  });
  it("el circuito se llama proveedor:credito y dura 30 minutos", () => {
    expect(CIRCUITO_CREDITO).toBe("proveedor:credito");
    expect(PAUSA_CREDITO_SEG).toBe(1800);
  });
  it("la espera del worker con el circuito abierto crece y se acota a un minuto: nunca un bucle apretado", () => {
    expect(ESPERAS_CIRCUITO_MS[0]).toBeGreaterThanOrEqual(5_000);
    expect(esperaCircuito(0)).toBe(5_000);
    expect(esperaCircuito(1)).toBeGreaterThan(esperaCircuito(0));
    expect(esperaCircuito(99)).toBe(60_000);
    expect(esperaCircuito(-1)).toBe(5_000);
  });
});

describe("el worker ante AIProviderPausedError (manejador falso, base falsa)", () => {
  beforeEach(() => {
    estado.jobs.length = 0;
    estado.rpcs.length = 0;
  });

  const trabajo = (intentos: number) => ({ id: "j1", company_id: "c1", tipo: "prueba_pausa", payload: {}, intentos, max_intentos: 3, prioridad: 5 });
  // La fila como la deja take_job: corriendo y con el intento ya sumado.
  const fila = (intentos: number) => ({ id: "j1", estado: "corriendo", intentos, max_intentos: 3, error: null, progreso: null });

  // Bajo la suite completa esta prueba importa el worker entero: 15 s de margen para que la carga no la vuelva intermitente.
  it("deja el trabajo pendiente, con los intentos como estaban ANTES de tomarlo, y abre el circuito", { timeout: 15000 }, async () => {
    const { ejecutar, HANDLERS } = await import("@/lib/jobs/worker");
    HANDLERS.prueba_pausa = async () => {
      throw new AIProviderPausedError("Gemini 402: prepayment credits depleted");
    };
    estado.jobs.push(fila(1));
    const t0 = Date.now();
    await ejecutar(trabajo(1));
    // Sin backoff: una pausa no se reintenta dentro del trabajo (el backoff del límite serían 1 s + 4 s).
    expect(Date.now() - t0).toBeLessThan(900);
    expect(estado.jobs[0]).toMatchObject({ estado: "pendiente", intentos: 0, lease_expira_at: null });
    expect(String(estado.jobs[0].error).startsWith(PREFIJO_PAUSA)).toBe(true);
    const circuito = estado.rpcs.find((r) => r.nombre === "circuito_fallo");
    expect(circuito?.args).toMatchObject({ p_clave: CIRCUITO_CREDITO, p_umbral: 1, p_corte_seg: PAUSA_CREDITO_SEG });
  });

  it("en el tercer intento la pausa tampoco lo manda a fallido: sigue pendiente con intentos 2", async () => {
    const { ejecutar, HANDLERS } = await import("@/lib/jobs/worker");
    HANDLERS.prueba_pausa = async () => {
      throw new AIProviderPausedError("Gemini 402: prepayment credits depleted");
    };
    estado.jobs.push(fila(3));
    await ejecutar(trabajo(3));
    expect(estado.jobs[0]).toMatchObject({ estado: "pendiente", intentos: 2 });
  });

  it("contraste: un error cualquiera SÍ consume el intento y al tercero va a fallido", async () => {
    const { ejecutar, HANDLERS } = await import("@/lib/jobs/worker");
    HANDLERS.prueba_pausa = async () => {
      throw new Error("empresa no encontrada");
    };
    estado.jobs.push(fila(1));
    await ejecutar(trabajo(1));
    expect(estado.jobs[0]).toMatchObject({ estado: "pendiente", intentos: 1, error: "empresa no encontrada" });
    estado.jobs.length = 0;
    estado.jobs.push(fila(3));
    await ejecutar(trabajo(3));
    expect(estado.jobs[0]).toMatchObject({ estado: "fallido", intentos: 3 });
    expect(estado.rpcs.some((r) => r.nombre === "circuito_fallo")).toBe(false);
  });

  it("los dos bucles del worker preguntan por el circuito ANTES de pedir take_job (afirmado sobre el código)", () => {
    const src = leer("src/lib/jobs/worker.ts");
    const drenar = src.slice(src.indexOf("export async function drenarCola"), src.indexOf("export async function correrWorker"));
    const correr = src.slice(src.indexOf("export async function correrWorker"));
    for (const [nombre, cuerpo] of [["drenarCola", drenar], ["correrWorker", correr]] as const) {
      const circuito = cuerpo.indexOf("circuitoCreditoAbierto()");
      const take = cuerpo.indexOf('rpc("take_job"');
      expect(circuito, `${nombre} no consulta el circuito`).toBeGreaterThan(-1);
      expect(circuito, `${nombre} pide take_job antes de mirar el circuito`).toBeLessThan(take);
    }
    // Y la espera con el circuito abierto es la del backoff, no un `continue` a secas.
    expect(correr).toMatch(/await dormir\(esperaCircuito\(/);
  });
});

describe("lo que ve el cliente cuando el asistente está en pausa", () => {
  it("el mensaje dice que está en pausa y que sus respuestas y números siguen guardados", () => {
    expect(MENSAJE_PAUSA_CLIENTE).toMatch(/en pausa/);
    expect(MENSAJE_PAUSA_CLIENTE).toMatch(/respuestas/);
    expect(MENSAJE_PAUSA_CLIENTE).toMatch(/números/);
    expect(MENSAJE_PAUSA_CLIENTE).toMatch(/guardad/);
    expect(MENSAJE_PAUSA_CLIENTE).not.toMatch(/402|Gemini|proveedor/i);
  });
  it("la ruta GET /api/jobs/[id] lo usa para el cliente, nunca el 402 crudo", () => {
    const ruta = leer("src/app/api/jobs/[id]/route.ts");
    expect(ruta).toContain("MENSAJE_PAUSA_CLIENTE");
    expect(ruta).toMatch(/esErrorDePausa\(j\.error\)/);
    expect(ruta).toMatch(/perfil\.rol !== "consultor"/);
  });
  it("la entrevista sirve una pregunta del banco cuando el modelo LANZA, no solo cuando responde vacío", () => {
    const h = leer("src/lib/jobs/handlers/entrevista.ts");
    expect(h).toMatch(/try \{\s*r = await correrEntrevistador\(contexto\);/);
    expect(h).toMatch(/origen = "banco"/);
    expect(h).toMatch(/if \(e instanceof AIProviderPausedError\) await abrirCircuitoCredito\(\)/);
  });
  it("medidor, investigador y organizador registran su llamada como los demás manejadores", () => {
    expect(leer("src/lib/jobs/handlers/indicadores.ts")).toContain('registrarLlamada(job.company_id, job.id, "medidor", r)');
    expect(leer("src/lib/jobs/handlers/modelo.ts")).toContain('registrarLlamada(job.company_id, job.id, "investigador", r)');
    expect(leer("src/lib/jobs/handlers/organigrama.ts")).toContain('registrarLlamada(job.company_id, job.id, "organizador", r)');
  });
});
