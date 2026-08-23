import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";

let _ai: AIProvider | null = null;

/** El proveedor se cambia aquí y en ningún otro lugar. */
export function ai(): AIProvider {
  if (!_ai) _ai = new AnthropicProvider();
  return _ai;
}

/** Permite inyectar un proveedor falso en tests y en la simulación de carga. */
export function usarProveedor(p: AIProvider | null) {
  _ai = p;
}

/** ¿Hay transcriptor? Se consulta sin instanciar el proveedor (no exige ANTHROPIC_API_KEY). */
export function hayTranscriptor(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** Versión de los prompts. Cambia cuando cambia cualquier prompt: entra en idempotencia y en token_usage. */
export const VERSION_PROMPT = "v4.1";
