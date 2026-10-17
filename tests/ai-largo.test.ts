/**
 * UNA LLAMADA LARGA NO PASA POR EL PRINCIPAL (spec-estrategia-8x.md §5.2 · src/lib/ai/gemini.ts).
 *
 * Con modelo de respaldo, al principal se le dan 15 s y después se salta al respaldo anotándole un fallo. Una salida de
 * diez mil tokens no termina en 15 s: cada llamada de la estrategia esperaría eso, gastaría una solicitud de más, y tres
 * seguidas abrirían el cortacircuitos del principal cinco minutos para todo 8X (también para las entrevistas). Con
 * `largo: true` va directo al respaldo con el plazo completo y no anota nada; sin él, todo sigue igual que hoy.
 *
 * Sin red: `fetch` es falso y responde una salida válida; el plazo de cada petición se lee de AbortSignal.timeout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { LLAMADA_LARGA } from "@/lib/ai/provider";

const rpcs = vi.hoisted(() => [] as { nombre: string; args: unknown }[]);
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    rpc: async (nombre: string, args: unknown) => {
      rpcs.push({ nombre, args });
      return { data: false, error: null };
    },
  }),
}));

type Peticion = { url: string; plazo: number | null };
let peticiones: Peticion[] = [];
let plazos: number[] = [];

async function proveedor(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ GEMINI_API_KEY: "clave-de-prueba", AI_TIMEOUT_MS: "120000", AI_TIMEOUT_PRINCIPAL_MS: "15000", ...env })) vi.stubEnv(k, v);
  const { GeminiProvider } = await import("@/lib/ai/gemini");
  return new GeminiProvider();
}

const respuestaValida = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: "listo" }) }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  peticiones = [];
  plazos = [];
  rpcs.length = 0;
  const original = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    plazos.push(ms);
    return original(ms);
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    peticiones.push({ url, plazo: plazos.at(-1) ?? null });
    return respuestaValida();
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pedido = (largo?: true) => ({ system: "s", user: "u", schema: z.object({ ok: z.string() }), priority: "batch" as const, agente: "lente_dinero", ...(largo ? { largo } : {}) });

describe("§5.2 · con `largo`, Gemini va directo al respaldo con el plazo completo", () => {
  it("con respaldo configurado: una sola petición, al respaldo, con AI_TIMEOUT_MS, sin consultar ni anotar el circuito del principal", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    const r = await p.complete(pedido(true));
    expect(r.data).toEqual({ ok: "listo" });
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]!.url).toContain("/modelo-respaldo:generateContent");
    expect(peticiones[0]!.plazo).toBe(120_000);
    expect(rpcs.map((x) => x.nombre)).not.toContain("circuito_fallo");
    expect(rpcs.map((x) => x.nombre)).not.toContain("circuito_abierto");
  });

  it("sin respaldo distinto (el mismo modelo): va al principal con el plazo completo", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-principal" });
    await p.complete(pedido(true));
    expect(peticiones[0]!.url).toContain("/modelo-principal:generateContent");
    expect(peticiones[0]!.plazo).toBe(120_000);
  });

  it("si el respaldo no contesta a tiempo, no se le anota un fallo al principal: se dice que el proveedor no responde", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      peticiones.push({ url, plazo: plazos.at(-1) ?? null });
      throw new Error("The operation was aborted due to timeout");
    }));
    await expect(p.complete(pedido(true))).rejects.toMatchObject({ name: "AIProviderDownError" });
    expect(peticiones.map((x) => x.url).every((u) => u.includes("modelo-respaldo"))).toBe(true);
    expect(rpcs.map((x) => x.nombre)).not.toContain("circuito_fallo");
  });
});

describe("§5.2 · sin `largo`, todo igual que hoy", () => {
  it("va al principal con su plazo corto y consulta el circuito", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    await p.complete(pedido());
    expect(peticiones[0]!.url).toContain("/modelo-principal:generateContent");
    expect(peticiones[0]!.plazo).toBe(15_000);
    expect(rpcs.map((x) => x.nombre)).toContain("circuito_abierto");
  });

  it("si el principal no contesta en su plazo, salta al respaldo y le anota el fallo (como siempre)", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      peticiones.push({ url, plazo: plazos.at(-1) ?? null });
      if (n++ === 0) throw new Error("The operation was aborted due to timeout");
      return respuestaValida();
    }));
    await p.complete(pedido());
    expect(peticiones.map((x) => [x.url.includes("modelo-principal") ? "principal" : "respaldo", x.plazo])).toEqual([["principal", 15_000], ["respaldo", 120_000]]);
    expect(rpcs.map((x) => x.nombre)).toContain("circuito_fallo");
  });
});

// ─── Lo que se le permite a una llamada larga, y la cuota del día (revisión del 17-10) ──────────────

/** Una respuesta con estado y cuerpo, como la manda Gemini. */
const respuesta = (status: number, cuerpo: unknown) => new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
/** Un 429 como lo manda Gemini de verdad: el quotaId va en el detalle, muy después del mensaje. */
const cuota429 = (quotaId: string) => ({
  error: {
    code: 429,
    message:
      "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/usage?tab=rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: modelo-respaldo\nPlease retry in 17.384s.",
    status: "RESOURCE_EXHAUSTED",
    details: [
      { "@type": "type.googleapis.com/google.rpc.Help", links: [{ description: "Learn more about Gemini API quotas", url: "https://ai.google.dev/gemini-api/docs/rate-limits" }] },
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId, quotaDimensions: { location: "global", model: "modelo-respaldo" }, quotaValue: "20" }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "17s" },
    ],
  },
});

describe("revisión del 17-10 · la cuota del día se lee del detalle de la respuesta, no del mensaje recortado", () => {
  it("un 429 con «PerDay» en su quotaId sale como cuota del día, sin esperar ni repetir (aunque el mensaje diga «retry in»)", async () => {
    const cuerpo = JSON.stringify(cuota429("GenerateRequestsPerDayPerProjectPerModel-FreeTier"));
    // Lo que se guardaba antes (los primeros 300 caracteres) no decía «PerDay»: así nunca se detectaba.
    expect(cuerpo.slice(0, 300)).not.toMatch(/PerDay/);
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      peticiones.push({ url, plazo: plazos.at(-1) ?? null });
      return respuesta(429, cuerpo);
    }));
    const t0 = Date.now();
    const e = await p.complete(pedido()).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ name: "AIRateLimitError", porDia: true });
    expect(peticiones).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(5_000);
    // El manejador de la estrategia la anota como cuota del día y no la relanza.
    const { fallaQueNoSeReintenta } = await import("@/lib/jobs/handlers/estrategia");
    expect(fallaQueNoSeReintenta(e)).toMatchObject({ tipo: "cuota_del_dia" });
  });

  it("un 429 por minuto no es la cuota del día; en una llamada larga no se espera: se dice enseguida y lo reintenta el worker", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      peticiones.push({ url, plazo: plazos.at(-1) ?? null });
      return respuesta(429, cuota429("GenerateRequestsPerMinutePerProjectPerModel-FreeTier"));
    }));
    const t0 = Date.now();
    const e = await p.complete(pedido(true)).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ name: "AIRateLimitError", porDia: false });
    expect(peticiones).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it("cuotaDelDia lee el quotaId del JSON; sin él, null", async () => {
    const { cuotaDelDia } = await import("@/lib/ai/gemini");
    expect(cuotaDelDia(JSON.stringify(cuota429("GenerateRequestsPerDayPerProjectPerModel-FreeTier")))).toBe("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
    expect(cuotaDelDia(JSON.stringify(cuota429("GenerateRequestsPerMinutePerProjectPerModel")))).toBeNull();
    expect(cuotaDelDia("no es json")).toBeNull();
  });
});

describe("revisión del 17-10 · una llamada larga cabe en el reloj del drenaje", () => {
  it("un solo intento: una salida que no valida no se repite (lo decide la consultora con un botón)", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      peticiones.push({ url, plazo: plazos.at(-1) ?? null });
      return respuesta(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ otra: "cosa" }) }] }, finishReason: "STOP" }] });
    }));
    await expect(p.complete(pedido(true))).rejects.toMatchObject({ name: "AIValidationError" });
    expect(peticiones).toHaveLength(1);
    // Sin `largo`, como siempre: dos intentos.
    peticiones = [];
    await expect(p.complete(pedido())).rejects.toMatchObject({ name: "AIValidationError" });
    expect(peticiones).toHaveLength(2);
  });

  it("los 503 se reintentan pocas veces y con esperas cortas", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        peticiones.push({ url, plazo: plazos.at(-1) ?? null });
        return respuesta(503, { error: { code: 503, message: "The model is overloaded" } });
      }));
      const promesa = p.complete(pedido(true)).then(() => null, (x: unknown) => x);
      await vi.runAllTimersAsync();
      const e = await promesa;
      expect(e).toMatchObject({ name: "AIProviderDownError" });
      // La primera y dos reintentos, no seis.
      expect(peticiones).toHaveLength(1 + LLAMADA_LARGA.esperas503Ms.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("con `hasta`, cada petición se acota a lo que le queda al trabajo; si no alcanza, no se empieza", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    await p.complete({ ...pedido(true), hasta: Date.now() + 60_000 });
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0]!.plazo).toBeLessThanOrEqual(60_000);
    expect(peticiones[0]!.plazo).toBeGreaterThan(50_000);
    peticiones = [];
    const e = await p.complete({ ...pedido(true), hasta: Date.now() + 5_000 }).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ name: "AISinTiempoError" });
    expect(peticiones).toHaveLength(0);
  });

  it("una espera por 503 que no cabe en el reloj tampoco se hace: sale «sin tiempo»", async () => {
    const p = await proveedor({ AI_MODEL: "modelo-principal", AI_MODEL_RESPALDO: "modelo-respaldo" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      peticiones.push({ url, plazo: plazos.at(-1) ?? null });
      return respuesta(503, { error: { code: 503, message: "The model is overloaded" } });
    }));
    const e = await p.complete({ ...pedido(true), hasta: Date.now() + 16_000 }).then(() => null, (x: unknown) => x);
    expect(e).toMatchObject({ name: "AISinTiempoError" });
    expect(peticiones).toHaveLength(1);
  });
});
