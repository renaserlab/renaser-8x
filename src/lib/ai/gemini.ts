import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";
import { AIProviderDownError, AIRateLimitError, AIValidationError, type AIProvider, type CompleteParams, type CompleteResult, type Transcripcion } from "./provider";

/**
 * Proveedor Gemini (REST, sin SDK). Mismo contrato que AnthropicProvider:
 * salida JSON validada con Zod, un reintento, errores tipificados.
 * Se activa con AI_PROVIDER=gemini + GEMINI_API_KEY. El modelo sale de AI_MODEL.
 */
// trim(): un salto de línea invisible en la variable (p. ej. al setearla por consola) produce
// "unexpected model name format" y tumba TODA la IA — pasó en producción el 26-08.
const MODEL = (process.env.AI_MODEL ?? "gemini-3.7-flash").trim();
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 120_000);
/**
 * PACIENCIA CON EL PRINCIPAL, cuando hay respaldo. El 30-08-2026 Google dejó de fallar y pasó a
 * algo peor: responder 200 tras 111 SEGUNDOS en una petición trivial, mientras el respaldo
 * contestaba en 3. Esperar dos minutos a un modelo que el respaldo va a ganar por goleada no tiene
 * sentido: si el principal no contesta en este plazo, se salta. Sin respaldo configurado se usa el
 * plazo completo, porque ahí esperar es la única opción.
 *
 * Medido: con 25 s la primera pregunta seguía en 34 s (25 de espera + 9 del respaldo). Con 15 s
 * entra bajo el umbral. Es un plazo corto a propósito: mientras Google esté así, prácticamente todo
 * sale por el respaldo — cuya calidad ya se validó (estratega 6/6) — y cuando el principal sane
 * volverá a ganar la carrera por sí mismo, sin que haya que tocar nada.
 */
const TIMEOUT_PRINCIPAL_MS = Number(process.env.AI_TIMEOUT_PRINCIPAL_MS ?? 15_000);
/**
 * Gemini 3.x descuenta los tokens de razonamiento de maxOutputTokens. `maxTokens` del contrato es presupuesto
 * de RESPUESTA, así que se suma un margen para el razonamiento y se acota su nivel (verificado: con 600 tokens
 * y nivel por defecto el contrastador gastaba 572 pensando y el JSON salía truncado).
 */
const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL ?? "low";
const THINKING_HEADROOM = Number(process.env.GEMINI_THINKING_HEADROOM ?? 6000);
const MAX_REINTENTOS_503 = Number(process.env.GEMINI_REINTENTOS_503 ?? 5);
// Respaldo ante tormenta sostenida del principal: mismo proveedor, modelo estable.
const MODELO_RESPALDO = (process.env.AI_MODEL_RESPALDO ?? "gemini-3.6-flash").trim();
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * CORTACIRCUITOS DEL MODELO PRINCIPAL (2026-08-30: 3.7-flash devolviendo 503 sostenido durante horas).
 * Cuando el principal falla varias veces seguidas, se deja de intentar por unos minutos y todo va
 * directo al respaldo: sin esto, CADA trabajo paga la espera del modelo caído antes de rendirse.
 * El estado es COMPARTIDO (Postgres): la primera instancia que descubre el modelo caído protege a
 * todas las demás. Se cierra solo al vencer la ventana o al primer éxito del principal.
 */
const FALLOS_PARA_ABRIR = 3;
const VENTANA_CORTE_SEG = Math.round(Number(process.env.GEMINI_CORTE_MS ?? 300_000) / 1000);
const CLAVE_CIRCUITO = `modelo:${MODEL}`;

// El estado vive en Postgres, no en la memoria del proceso: en serverless cada instancia arranca
// con el contador en cero y la primera peticion de cada una volvia a pagar la espera del modelo
// caido (medido el 30-08-2026: 11,6 s solo en que Google devuelva el 503). Compartido, la primera
// instancia que lo descubre protege a todas las demas.
// Encima se memoriza unos segundos para no ir a la base en cada llamada dentro de una misma rafaga.
const MEMO_MS = 5_000;
let memo = { valor: false, hasta: 0 };

async function principalCaido(): Promise<boolean> {
  if (Date.now() < memo.hasta) return memo.valor;
  try {
    const { data } = await supabaseAdmin().rpc("circuito_abierto", { p_clave: CLAVE_CIRCUITO });
    memo = { valor: data === true, hasta: Date.now() + MEMO_MS };
    return memo.valor;
  } catch {
    // Si no se puede consultar, se asume sano: un circuito roto no puede dejar sin IA al cliente.
    return false;
  }
}

async function anotarFallo() {
  try {
    const { data } = await supabaseAdmin().rpc("circuito_fallo", {
      p_clave: CLAVE_CIRCUITO, p_umbral: FALLOS_PARA_ABRIR, p_corte_seg: VENTANA_CORTE_SEG,
    });
    memo = { valor: data === true, hasta: Date.now() + MEMO_MS };
  } catch {}
}

async function anotarExito() {
  memo = { valor: false, hasta: Date.now() + MEMO_MS };
  try {
    await supabaseAdmin().rpc("circuito_exito", { p_clave: CLAVE_CIRCUITO });
  } catch {}
}

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
    let entrada = 0, salida = 0, ultimoRaw = "", modelo = MODEL, esperado429 = false, reintentos503 = 0, ultimoDetalle = "", saltoPorTiempo = false;
    // Si el principal está cortado por fallos recientes, se arranca directo en el respaldo.
    let modeloActivo = MODELO_RESPALDO && (await principalCaido()) ? MODELO_RESPALDO : MODEL;
    for (let intento = 0; intento < 2; intento++) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/${modeloActivo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.key },
          body: JSON.stringify(body),
          // Al principal se le da menos cuerda que al respaldo: si tarda más, el respaldo ya habría
          // contestado. El respaldo sí se espera hasta el final — no hay a quién saltar después.
          signal: AbortSignal.timeout(
            modeloActivo === MODEL && MODELO_RESPALDO && MODELO_RESPALDO !== MODEL && !saltoPorTiempo
              ? Math.min(TIMEOUT_PRINCIPAL_MS, TIMEOUT_MS)
              : TIMEOUT_MS
          ),
        });
      } catch (e: unknown) {
        // AGOTAR EL TIEMPO TAMBIÉN ES CAER (30-08-2026). El cortacircuitos solo contaba los 503, y
        // ese día Google dejó de devolver 503 y pasó a responder 200 tras 111 SEGUNDOS en una
        // petición trivial: el modelo nunca "fallaba", solo era inservible, así que el circuito no
        // se abría nunca y cada trabajo pagaba la espera completa antes de rendirse. Ahora un
        // tiempo agotado en el principal cuenta como fallo y salta al respaldo, igual que un 503.
        const mensaje = String((e as Error).message ?? e);
        if (modeloActivo === MODEL && MODELO_RESPALDO && MODELO_RESPALDO !== MODEL && !saltoPorTiempo) {
          await anotarFallo();
          saltoPorTiempo = true;
          modeloActivo = MODELO_RESPALDO;
          reintentos503 = 0;
          // No consume el intento: el salto al respaldo es la reacción al fallo, no un reintento.
          intento--;
          continue;
        }
        throw new AIProviderDownError(mensaje);
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
      if (res.status === 503 && MODELO_RESPALDO && modeloActivo === MODEL && MODELO_RESPALDO !== MODEL) {
        // Tormenta sostenida en el principal (2026-08-26: 3.7-flash caído todo el día): en vez de rendirse,
        // se cambia al modelo de respaldo y se reintenta. Calidad validada del respaldo: estratega PASS 6/6.
        await res.text();
        await anotarFallo();
        modeloActivo = MODELO_RESPALDO;
        reintentos503 = 0;
        intento--;
        continue;
      }
      if (res.status >= 500) throw new AIProviderDownError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status === 400 && jsonSchema) {
        // Esquemas grandes (p. ej. el plan estratégico completo) exceden el límite de responseJsonSchema
        // aunque cada sección pase sola (verificado por bisección). Se reintenta sin esquema nativo pero
        // inyectándolo como texto (sin él, el modelo aplana la estructura); la validación Zod sigue siendo la puerta.
        parts.push({ text: `\n\nESQUEMA JSON OBLIGATORIO (respeta cada clave y tipo, incluidos los objetos anidados):\n${JSON.stringify(jsonSchema)}` });
        jsonSchema = null;
        delete (body.generationConfig as Record<string, unknown>).responseJsonSchema;
        await res.text();
        intento--;
        continue;
      }
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
        if (r.success) {
          if (modeloActivo === MODEL) void anotarExito();
          return { data: r.data, tokens_entrada: entrada, tokens_salida: salida, modelo, latencia_ms: Date.now() - t0, intentos: intento + 1 };
        }
        ultimoDetalle = r.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
      } catch (e) {
        ultimoDetalle = `JSON inválido: ${String((e as Error).message).slice(0, 120)}`;
      }
    }
    throw new AIValidationError(`La salida del modelo no validó contra el esquema (${p.agente ?? "?"}): ${ultimoDetalle}`, ultimoRaw);
  }

  puedeTranscribir(): boolean {
    return true; // Gemini transcribe audio nativamente
  }

  /**
   * Transcripción con Gemini: el audio (MediaRecorder) entra como inlineData; sale el texto literal.
   * Es INTERACTIVA: la persona está mirando la pantalla. Por eso usa un modelo dedicado estable
   * (el 3.7-flash sufre tormentas de "high demand" que con backoff largo tardaban minutos) y
   * reintentos cortos: si Gemini está saturado, mejor fallar rápido y que la persona escriba.
   */
  async transcribe(audio: Blob, mime: string, segundos?: number): Promise<Transcripcion> {
    // Audios LARGOS (2.5+ min): el modelo ligero recorta o parafrasea la cola. La decisión va por
    // DURACIÓN real cuando el cliente la manda (el tamaño engañaba: 1–2 min de webm ya pasaban
    // 1.2MB y se iban al modelo lento sin necesidad — "está tardando", caso Qori Home).
    const largo = segundos != null && segundos > 0 ? segundos > 150 : audio.size > 3_000_000;
    const modelo = largo
      ? (process.env.GEMINI_TRANSCRIBE_MODEL_LARGO ?? "gemini-3.6-flash").trim()
      : (process.env.GEMINI_TRANSCRIBE_MODEL ?? "gemini-3.5-flash-lite").trim();
    const thinking = modelo.startsWith("gemini-2.5") ? { thinkingBudget: 0 } : { thinkingLevel: "low" };
    const buf = Buffer.from(await audio.arrayBuffer());
    const body = {
      systemInstruction: { parts: [{ text: "Quien habla es una persona de negocios en Perú describiendo su empresa, en español. Transcribe FIELMENTE lo dicho: no resumas, no cambies palabras, no añadas nada. Corrige SOLO la puntuación y la separación de frases para que se lea natural. Conserva los montos y números tal como se dijeron ('25 mil soles', 'de cada 10, unos 3'). Si una palabra no se entiende, escribe [inaudible] en su lugar — nunca la adivines. Si hay silencios, simplemente continúa. Devuelve SOLO el texto transcrito." }] },
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime || "audio/webm", data: buf.toString("base64") } }, { text: "Transcribe este audio." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: largo ? 16000 : 8000, thinkingConfig: thinking },
    };
    const MAX_REINTENTOS_INTERACTIVOS = 2;
    let reintentos = 0;
    for (;;) {
      const res = await fetch(`${BASE}/${modelo}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.key }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 503 && reintentos < MAX_REINTENTOS_INTERACTIVOS) {
        reintentos++;
        await new Promise((r) => setTimeout(r, 2000 * reintentos));
        continue;
      }
      if (res.status === 429) throw new AIRateLimitError(`Transcripción 429`);
      if (!res.ok) throw new Error(`Transcripción falló: ${res.status}`);
      const j = (await res.json()) as Respuesta;
      const texto = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
      if (!texto) throw new Error("No pudimos entender el audio. Intenta de nuevo o escribe la respuesta.");
      // Si el modelo se quedó sin presupuesto a mitad del audio, mejor decirlo que entregar la mitad en silencio.
      if (j.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("El audio es muy largo para convertirlo de una vez. Guárdalo como audio y nosotros lo escuchamos completo.");
      return { texto, segmentos: [] };
    }
  }
}
