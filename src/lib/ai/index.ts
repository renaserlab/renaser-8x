import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./anthropic";

let _ai: AIProvider | null = null;

/** El proveedor se cambia aquí y en ningún otro lugar. */
export function ai(): AIProvider {
  if (!_ai) _ai = new AnthropicProvider();
  return _ai;
}

export const VERSION_PROMPT = "v4.0";
