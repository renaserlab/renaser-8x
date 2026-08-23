import { z } from "zod";
import { AIProviderDownError, AIRateLimitError, AIValidationError, type AIProvider, type CompleteParams, type CompleteResult, type Transcripcion } from "./provider";
import { AnthropicProvider } from "./anthropic";

/**
 * Proveedor Gemini (REST, sin SDK). Mismo contrato que AnthropicProvider:
 * salida JSON validada con Zod, un reintento, errores tipificados.
 * Se activa con AI_PROVIDER=gemini + GEMINI_API_KEY. El modelo sale de AI_MODEL.
 */
const MODEL = process.env.AI_MODEL ?? "gemini-3.7-flash";
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 120_000);
/**
 * Gemini 3.x descuenta los tokens de razonamiento de maxOutputTokens. `maxTokens` del contrato es presupuesto
 * de RESPUESTA, así que se suma un margen para el razonamiento y se acota su nivel (verificado: con 600 tokens
 * y nivel por defecto el contrastador gastaba 572 pensando y el JSON salía truncado).
 */
const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL ?? "low";
const THINKING_HEADROOM = Number(process.env.GEMINI_THINKING_HEADROOM ?? 6000);
const MAX_REINTENTOS_503 = Number(process.env.GEMINI_REINTENTOS_503 ?? 5);
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function extraerJSON(texto: string): string {
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : texto).trim();
}

type Respuesta = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
};

export class GeminiProvider implements AIProvider {
  private key: string;
  constructor() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Falta GEMINI_API_KEY");
    this.key = key;
  }

  async complete<T>(p: CompleteParams<T>): Promise<CompleteResult<T>> {
    const parts: Record<string, unknown>[] = [];
    for (const a of p.adjuntos ?? []) {
      parts.push({ inlineData: { mimeType: a.tipo === "imagen" ? a.mime : "application/pdf", data: a.base64 } });
    }
    parts.push({ text: p.user });
    let jsonSchema: unknown = null;
    try {
      jsonSchema = z.toJSONSchema(p.schema as z.ZodType, { unrepresentable: "any" });
    } catch {
      jsonSchema = null; // esquema no representable: se confía en el prompt + validación Zod
    }
    const body = {
      systemInstruction: { parts: [{ text: p.system + "\n\nResponde ÚNICAMENTE con JSON válido, sin texto antes ni después." }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        // Sin fijarla, Gemini usa temperature 1.0 y el diagnóstico varía muchísimo entre corridas (verificado
        // con el benchmark). 0 = salida estable y mejor apego a las reglas; configurable por entorno.
        temperature: Number(process.env.GEMINI_TEMPERATURE ?? 0),
        maxOutputTokens: (p.maxTokens ?? 8000) + THINKING_HEADROOM,
        responseMimeType: "application/json",
        // Salida estructurada nativa a partir del mismo esquema Zod (verificado: sin ella los modelos lite inventan claves).
        ...(jsonSchema ? { responseJsonSchema: jsonSchema } : {}),
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      },
    };

    const t0 = Date.now();
    let entrada = 0, salida = 0, ultimoRaw = "", modelo = MODEL, esperado429 = false, reintentos503 = 0, ultimoDetalle = "";
    for (let intento = 0; intento < 2; intento++) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/${MODEL}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e: unknown) {
        throw new AIProviderDownError(String((e as Error).message ?? e));
      }
      if (res.status === 429) {
        // Cuota por ventana (free tier: 20 solicitudes/ventana). Si el proveedor indica cuánto esperar (≤ 90 s), se espera una vez.
        const txt = await res.text();
        const seg = Number(txt.match(/retry in ([\d.]+)s/i)?.[1] ?? NaN);
        if (!esperado429 && seg > 0 && seg <= 90) {
          esperado429 = true;
          await new Promise((r) => setTimeout(r, Math.ceil(seg * 1000) + 1000));
          intento--;
          continue;
        }
        throw new AIRateLimitError(`Gemini 429: ${txt.slice(0, 300)}`);
      }
      if (res.status === 503 && reintentos503 < MAX_REINTENTOS_503) {
        // "High demand" intermitente (verificado en gemini-3.7-flash): reintentos con espera creciente; el worker aplica su propio backoff después.
        reintentos503++;
        await new Promise((r) => setTimeout(r, Math.min(3000 * 2 ** (reintentos503 - 1), 40_000)));
        intento--;
        continue;
      }
      if (res.status >= 500) throw new AIProviderDownError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = (await res.json()) as Respuesta;
      entrada += j.usageMetadata?.promptTokenCount ?? 0;
      salida += (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0);
      modelo = j.modelVersion ?? MODEL;
      const raw = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("");
      ultimoRaw = j.candidates?.[0]?.finishReason === "MAX_TOKENS" ? `[finishReason=MAX_TOKENS] ${raw}` : raw;
      try {
        const parsed = JSON.parse(extraerJSON(raw));
        const r = p.schema.safeParse(parsed);
        if (r.success) return { data: r.data, tokens_entrada: entrada, tokens_salida: salida, modelo, latencia_ms: Date.now() - t0, intentos: intento + 1 };
        ultimoDetalle = r.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      } catch (e) {
        ultimoDetalle = `JSON inválido: ${String((e as Error).message).slice(0, 120)}`;
      }
    }
    throw new AIValidationError(`La salida del modelo no validó contra el esquema (${p.agente ?? "?"}): ${ultimoDetalle}`, ultimoRaw);
  }

  puedeTranscribir(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  transcribe(audio: Blob, mime: string): Promise<Transcripcion> {
    // La transcripción sigue siendo Whisper (misma implementación, sin llave Anthropic).
    return AnthropicProvider.prototype.transcribe.call({} as AnthropicProvider, audio, mime);
  }
}
