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
