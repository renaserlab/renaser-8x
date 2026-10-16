import type { ZodType } from "zod";

export type Adjunto =
  | { tipo: "imagen"; mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string }
  | { tipo: "pdf"; base64: string };

export interface CompleteParams<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  priority: "interactive" | "batch";
  adjuntos?: Adjunto[];
  maxTokens?: number;
  agente?: string;
}

export interface CompleteResult<T> {
  data: T;
  tokens_entrada: number;
  tokens_salida: number;
  modelo: string;
  latencia_ms: number;
  intentos: number;
}

export type Segmento = { desde: number; hasta: number; texto: string };
export type Transcripcion = { texto: string; segmentos: Segmento[] };

export interface AIProvider {
  /** Salida estructurada obligatoria. Valida contra Zod; reintenta una vez; luego lanza. */
  complete<T>(params: CompleteParams<T>): Promise<CompleteResult<T>>;
  /** Transcripción con marcas de tiempo cuando el servicio las da (1.10). */
  transcribe(audio: Blob, mime: string, segundos?: number): Promise<Transcripcion>;
  /** ¿Hay transcriptor configurado? Sin él, el navegador no debe ofrecer grabar audio (P1-11). */
  puedeTranscribir(): boolean;
}

export class AIValidationError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
    this.name = "AIValidationError";
  }
}

export class AIRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIRateLimitError";
  }
}

export class AIProviderDownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderDownError";
  }
}

/**
 * EL PROVEEDOR NO ESTÁ CAÍDO: ESTÁ SIN CRÉDITO. El 28-09-2026 Gemini devolvió 402 «prepayment
 * credits depleted» y el código lo trató como un error cualquiera: cada trabajo gastó sus tres
 * intentos en segundos y 81 trabajos (76 preguntas de entrevista ya pagadas) acabaron en «fallido».
 * Sin crédito no hay nada que reintentar: la respuesta correcta es ESPERAR sin consumir intentos.
 * Este error existe para que el worker distinga «espera» de «falla». Vive junto a sus hermanos
 * (AIRateLimitError, AIProviderDownError) en el contrato de proveedor; se reexporta desde ./index.
 */
export class AIProviderPausedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderPausedError";
  }

  /**
   * ¿Este fallo del proveedor es «sin crédito»? El 402 siempre; y cualquier otro estado cuyo texto
   * hable de prepago, créditos, facturación o saldo insuficiente (Anthropic devuelve 400 con
   * «credit balance is too low»). NUNCA un 429/529: el mensaje de cuota de Google también menciona
   * «billing details» y es un límite por ventana, no falta de crédito.
   */
  static detecta(status: number | undefined, texto: string): boolean {
    if (status === 429 || status === 529) return false;
    if (status === 402) return true;
    return /prepayment|credit balance|\bcredits?\b|billing|insufficient (balance|funds)|saldo insuficiente/i.test(texto);
  }
}
