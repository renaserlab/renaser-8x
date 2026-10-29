import Anthropic from "@anthropic-ai/sdk";
import { AIProviderDownError, AIProviderPausedError, AIRateLimitError, AIValidationError, type AIProvider, type CompleteParams, type CompleteResult, type Transcripcion } from "./provider";
import { aplicarContrato } from "@/lib/agentes/contratos";

/**
 * El modelo por defecto de ESTE proveedor. `AI_MODEL` es del proveedor PRINCIPAL: cuando este corre
 * como respaldo, quien lo construye le pasa su modelo —de `AI_MODEL_ANTHROPIC`— porque leer
 * `AI_MODEL` aquí le pediría a Anthropic el nombre de un modelo de Gemini, y eso no es un «sin
 * crédito»: es un 404 que el worker cobra como fallo del trabajo y gasta los tres intentos.
 */
const MODELO_POR_DEFECTO = "claude-sonnet-5";
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 120_000);

function extraerJSON(texto: string): string {
  // El modelo debe devolver solo JSON; si envuelve en ```json ... ``` lo limpiamos. Nada más.
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fence ? fence[1] : texto).trim();
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  /** Con qué modelo va a llamar. Público a propósito: quien lo construye tiene que poder comprobar
   * que al respaldo no se le coló el modelo del principal, y la torre tiene que poder decirlo. */
  readonly modelo: string;
  /** `modelo`: el que le pasa quien lo construye. Sin él, el de `AI_MODEL` si es el principal, o el suyo. */
  constructor(modelo?: string) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");
    this.modelo = modelo?.trim() || process.env.AI_MODEL?.trim() || MODELO_POR_DEFECTO;
    this.client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  }

  async complete<T>(p: CompleteParams<T>): Promise<CompleteResult<T>> {
    // EL CONTRATO MANDA (manual RENASER v1.2, AH01 y AH05): el presupuesto del agente se impone
    // aquí, en el entorno, no en el prompt. Un agente sin ficha no corre.
    const contrato = aplicarContrato(p.agente, p.maxTokens);
    if (contrato) p = { ...p, maxTokens: contrato.maxTokens };
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
          model: this.modelo,
          max_tokens: p.maxTokens ?? 8000,
          system: p.system + "\n\nResponde ÚNICAMENTE con JSON válido, sin texto antes ni después.",
          messages: [{ role: "user", content }],
        });
      } catch (e: unknown) {
        const status = (e as { status?: number }).status;
        const msg = String((e as Error).message ?? e);
        if (status === 429 || status === 529) throw new AIRateLimitError(msg);
        // Sin crédito (Anthropic lo devuelve como 400 «credit balance is too low», o como 402): es una
        // pausa de la cola, no un fallo del trabajo. Mismo tratamiento que el 402 de Gemini.
        if (AIProviderPausedError.detecta(status, msg)) throw new AIProviderPausedError(`Anthropic ${status ?? "?"}: ${msg}`);
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
        if (r.success) return { data: r.data, tokens_entrada: entrada, tokens_salida: salida, modelo: this.modelo, latencia_ms: Date.now() - t0, intentos: intento + 1, fin: res.stop_reason ?? undefined };
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
    if (r.status === 402) throw new AIProviderPausedError("Transcripción 402: el servicio de transcripción no tiene crédito");
    if (!r.ok) throw new Error(`Transcripción falló: ${r.status}`);
    const j = (await r.json()) as { text: string; segments?: { start: number; end: number; text: string }[] };
    return { texto: j.text, segmentos: (j.segments ?? []).map((s) => ({ desde: Math.floor(s.start), hasta: Math.ceil(s.end), texto: s.text.trim() })) };
  }
}
