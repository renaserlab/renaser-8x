import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

let _ai: AIProvider | null = null;

/** El proveedor se cambia aquí y en ningún otro lugar (AI_PROVIDER=anthropic|gemini). */
export function ai(): AIProvider {
  if (!_ai) _ai = process.env.AI_PROVIDER === "gemini" ? new GeminiProvider() : new AnthropicProvider();
  return _ai;
}

/** Permite inyectar un proveedor falso en tests y en la simulación de carga. */
export function usarProveedor(p: AIProvider | null) {
  _ai = p;
}

/** ¿Hay transcriptor? Gemini transcribe nativamente; con Anthropic se usa Whisper (OPENAI_API_KEY). */
export function hayTranscriptor(): boolean {
  if (process.env.AI_PROVIDER === "gemini") return !!process.env.GEMINI_API_KEY;
  return !!process.env.OPENAI_API_KEY;
}

/** Versión de los prompts. Cambia cuando cambia cualquier prompt: entra en idempotencia y en token_usage. */
export const VERSION_PROMPT = "v4.2";
