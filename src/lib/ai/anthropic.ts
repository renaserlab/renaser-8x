import Anthropic from "@anthropic-ai/sdk";
import { AIRateLimitError, AIValidationError, type AIProvider, type CompleteParams, type CompleteResult } from "./provider";

const MODEL = process.env.AI_MODEL ?? "claude-sonnet-5";

function extraerJSON(texto: string): string {
  // El modelo debe devolver solo JSON; si envuelve en ```json ... ``` lo limpiamos. Nada más.
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : texto).trim();
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");
    this.client = new Anthropic();
  }

  async complete<T>(p: CompleteParams<T>): Promise<CompleteResult<T>> {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const a of p.adjuntos ?? []) {
      if (a.tipo === "imagen") content.push({ type: "image", source: { type: "base64", media_type: a.mime, data: a.base64 } });
      else content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } });
    }
    content.push({ type: "text", text: p.user });

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
        if (status === 429 || status === 529) throw new AIRateLimitError(String((e as Error).message));
        throw e;
      }
      entrada += res.usage.input_tokens;
      salida += res.usage.output_tokens;
      const raw = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      ultimoRaw = raw;
      try {
        const parsed = JSON.parse(extraerJSON(raw));
        const r = p.schema.safeParse(parsed);
        if (r.success) return { data: r.data, tokens_entrada: entrada, tokens_salida: salida };
      } catch {
        /* JSON inválido: reintentar una vez */
      }
    }
    throw new AIValidationError("La salida del modelo no validó contra el esquema", ultimoRaw);
  }

  async transcribe(audio: Blob, mime: string): Promise<string> {
    // Anthropic no transcribe audio. Se usa OpenAI Whisper si hay llave; si no, se informa.
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No hay servicio de transcripción configurado (OPENAI_API_KEY). Pide la respuesta escrita o usa el micrófono del navegador.");
    const form = new FormData();
    const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : "webm";
    form.append("file", audio, `audio.${ext}`);
    form.append("model", "whisper-1");
    form.append("language", "es");
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!r.ok) throw new Error(`Transcripción falló: ${r.status} ${await r.text()}`);
    const j = (await r.json()) as { text: string };
    return j.text;
  }

  async speak(text: string): Promise<Blob> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("No hay servicio de voz configurado (OPENAI_API_KEY). El navegador lee la pregunta en voz alta.");
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "tts-1", voice: "alloy", input: text, response_format: "mp3" }),
    });
    if (!r.ok) throw new Error(`Síntesis falló: ${r.status}`);
    return await r.blob();
  }
}
