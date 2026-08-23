import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Tokens de participante (P0-04). El token plano se genera una vez y solo se entrega al consultor/cliente
 * que lo crea; en la base se guarda su sha256. Expira, se revoca y tiene tope de usos.
 */

export const DIAS_VIGENCIA_TOKEN = 30;
export const MAX_USOS_TOKEN = 200;
const BYTES = 24; // 192 bits

export function generarToken(): string {
  return randomBytes(BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function formatoValido(token: string): boolean {
  return typeof token === "string" && /^[A-Za-z0-9_-]{28,48}$/.test(token);
}

export function hashesIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8"), bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export type EstadoToken = { token_hash: string | null; token_expira_at: string | null; token_revocado_at: string | null; token_usos: number | null; token_max_usos: number | null };

export function expiracionPorDefecto(desde = new Date()): string {
  const d = new Date(desde);
  d.setDate(d.getDate() + DIAS_VIGENCIA_TOKEN);
  return d.toISOString();
}

/** Decide si un token presentado es aceptable para este participante. Nunca revela por qué falla al exterior. */
export function tokenValido(presentado: string, p: EstadoToken, ahora = new Date()): { ok: boolean; motivo: "formato" | "sin_token" | "no_coincide" | "revocado" | "vencido" | "usos_agotados" | null } {
  if (!formatoValido(presentado)) return { ok: false, motivo: "formato" };
  if (!p.token_hash) return { ok: false, motivo: "sin_token" };
  if (!hashesIguales(hashToken(presentado), p.token_hash)) return { ok: false, motivo: "no_coincide" };
  if (p.token_revocado_at) return { ok: false, motivo: "revocado" };
  if (p.token_expira_at && new Date(p.token_expira_at) <= ahora) return { ok: false, motivo: "vencido" };
  if ((p.token_usos ?? 0) >= (p.token_max_usos ?? MAX_USOS_TOKEN)) return { ok: false, motivo: "usos_agotados" };
  return { ok: true, motivo: null };
}

/** Quita tokens de cualquier texto que vaya a un log. */
export function redactarToken(texto: string): string {
  return texto.replace(/\/participar\/[A-Za-z0-9_-]{20,}/g, "/participar/[token]");
}
