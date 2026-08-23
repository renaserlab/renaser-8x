import Anthropic from "@anthropic-ai/sdk";
import { AIProviderDownError, AIRateLimitError, AIValidationError, type AIProvider, type CompleteParams, type CompleteResult, type Transcripcion } from "./provider";

const MODEL = process.env.AI_MODEL ?? "claude-sonnet-5";
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 120_000);

function extraerJSON(texto: string): string {
  // El modelo debe devolver solo JSON; si envuelve en ```json ... ``` lo limpiamos. Nada más.
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : texto).trim();
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");
    this.client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  }

  async complete<T>(p: CompleteParams<T>): Promise<CompleteResult<T>> {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const a of p.adjuntos ?? []) {
      if (a.tipo === "imagen") content.push({ type: "image", source: { type: "base64", media_type: a.mime, data: a.base64 } });
      else content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } });
    }
    content.push({ type: "text", text: p.user });

    const t0 = Date.now();
    let entrada = 0, salida = 0, ultimoRaw = "";
    for (let intento = 0; intento < 2; intento++) {
      let res: Anthropic.Message;
      try {
        res = await this.client.messages.create({
          model: MODEL,
          max_tokens: p.maxTokens ?? 8000,
          system: p.system + "\n\nResponde ÚNICAMENTE con JSON válido, sin texto antes ni después.",
          messages: [{ role: "user", content }],
        });
      } catch (e: unknown) {
        const status = (e as { status?: number }).status;
        const msg = String((e as Error).message ?? e);
        if (status === 429 || status === 529) throw new AIRateLimitError(msg);
        if (status === undefined || status >= 500 || /timeout|ECONNRESET|fetch failed/i.test(msg)) throw new AIProviderDownError(msg);
        throw e;
      }
      entrada += res.usage.input_tokens;
      salida += res.usage.output_tokens;
      const raw = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      ultimoRaw = raw;
      try {
        const parsed = JSON.parse(extraerJSON(raw));
        const r = p.schema.safeParse(parsed);
        if (r.success) return { data: r.data, tokens_entrada: entrada, tokens_salida: salida, modelo: MODEL, latencia_ms: Date.now() - t0, intentos: intento + 1 };
      } catch {
        /* JSON inválido: reintentar una vez */
      }
    }
    throw new AIValidationError("La salida del modelo no validó contra el esquema", ultimoRaw);
  }

  puedeTranscribir(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async transcribe(audio: Blob, mime: string): Promise<Transcripcion> {
    // Anthropic no transcribe audio. Se usa OpenAI Whisper (verbose_json → segmentos con tiempos) si hay llave.
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No hay servicio de transcripción configurado (OPENAI_API_KEY). Pide la respuesta escrita o usa el micrófono del navegador.");
    const form = new FormData();
    const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : "webm";
    form.append("file", audio, `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "es");
    form.append("response_format", "verbose_json");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    if (r.status === 429) throw new AIRateLimitError("Transcripción: límite del proveedor");
    if (!r.ok) throw new Error(`Transcripción falló: ${r.status}`);
    const j = (await r.json()) as { text: string; segments?: { start: number; end: number; text: string }[] };
    return { texto: j.text, segmentos: (j.segments ?? []).map((s) => ({ desde: Math.floor(s.start), hasta: Math.ceil(s.end), texto: s.text.trim() })) };
  }
}
