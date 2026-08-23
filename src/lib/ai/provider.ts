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
}

export interface CompleteResult<T> {
  data: T;
  tokens_entrada: number;
  tokens_salida: number;
}

export interface AIProvider {
  /** Salida estructurada obligatoria. Valida contra Zod; reintenta una vez; luego lanza. */
  complete<T>(params: CompleteParams<T>): Promise<CompleteResult<T>>;
  transcribe(audio: Blob, mime: string): Promise<string>;
  speak(text: string): Promise<Blob>;
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
