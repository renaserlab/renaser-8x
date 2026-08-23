import { describe, it, expect } from "vitest";
import { generarToken, hashToken, tokenValido, formatoValido, redactarToken, expiracionPorDefecto, canjearEnlace, DIAS_VIGENCIA_TOKEN } from "@/lib/tokens";

const ahora = new Date("2026-08-22T12:00:00Z");
const vivo = (t: string) => ({ token_hash: hashToken(t), token_expira_at: "2026-09-21T12:00:00Z", token_revocado_at: null, token_usos: 3, token_max_usos: 200 });

describe("P0-04 · token de participante", () => {
  it("se genera con 192 bits de aleatoriedad criptográfica y formato base64url; dos tokens nunca coinciden", () => {
    const a = generarToken(), b = generarToken();
    expect(a).not.toBe(b);
    expect(formatoValido(a)).toBe(true);
    expect(a.length).toBe(32);
  });
  it("en la base solo vive el hash: el hash no permite recuperar el token y es estable", () => {
    const t = generarToken();
    expect(hashToken(t)).toHaveLength(64);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
  it("token correcto → ok", () => {
    const t = generarToken();
    expect(tokenValido(t, vivo(t), ahora)).toEqual({ ok: true, motivo: null });
  });
  it("token de otra sesión → no coincide", () => {
    expect(tokenValido(generarToken(), vivo(generarToken()), ahora).ok).toBe(false);
  });
  it("token vencido no se reutiliza", () => {
    const t = generarToken();
    expect(tokenValido(t, { ...vivo(t), token_expira_at: "2026-08-22T11:59:59Z" }, ahora).motivo).toBe("vencido");
  });
  it("token revocado no sirve aunque no haya vencido", () => {
    const t = generarToken();
    expect(tokenValido(t, { ...vivo(t), token_revocado_at: "2026-08-22T10:00:00Z" }, ahora).motivo).toBe("revocado");
  });
  it("uso limitado: al llegar al tope deja de servir", () => {
    const t = generarToken();
    expect(tokenValido(t, { ...vivo(t), token_usos: 200 }, ahora).motivo).toBe("usos_agotados");
  });
  it("participante sin token (revocado y no regenerado) → rechazado", () => {
    expect(tokenValido(generarToken(), { ...vivo("x"), token_hash: null }, ahora).motivo).toBe("sin_token");
  });
  it("formato manipulado (sql, path, vacío, muy largo) se rechaza antes de tocar la base", () => {
    for (const malo of ["", "abc", "' or 1=1 --", "../../etc", "a".repeat(100), "tok en"]) expect(tokenValido(malo, vivo("x"), ahora).motivo).toBe("formato");
  });
  it("expiración por defecto: 30 días", () => {
    expect(DIAS_VIGENCIA_TOKEN).toBe(30);
    expect(expiracionPorDefecto(ahora)).toBe("2026-09-21T12:00:00.000Z");
  });
  it("los logs no contienen tokens", () => {
    const t = generarToken();
    expect(redactarToken(`[api GET /api/participar/${t}] error`)).toBe("[api GET /api/participar/[token]] error");
  });
});

describe("enlace de un solo uso → token de sesión", () => {
  it("el canje devuelve un token de sesión distinto, guarda solo su hash y marca el enlace como canjeado", () => {
    const enlace = generarToken();
    const c = canjearEnlace(enlace, vivo(enlace), ahora);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.token_sesion).not.toBe(enlace);
    expect(c.cambios.token_hash).toBe(hashToken(c.token_sesion));
    expect(c.cambios.token_hash).not.toBe(hashToken(enlace));
    expect(c.cambios.token_canjeado_at).toBe(ahora.toISOString());
  });
  it("el enlace original queda inutilizado tras el canje (su hash ya no está en la base)", () => {
    const enlace = generarToken();
    const c = canjearEnlace(enlace, vivo(enlace), ahora);
    if (!c.ok) throw new Error();
    const despues = { ...vivo(enlace), ...c.cambios };
    expect(tokenValido(enlace, despues, ahora).ok).toBe(false);
    expect(tokenValido(c.token_sesion, despues, ahora).ok).toBe(true);
  });
  it("un segundo canje del mismo enlace falla (enlace_ya_usado)", () => {
    const enlace = generarToken();
    const c = canjearEnlace(enlace, vivo(enlace), ahora);
    if (!c.ok) throw new Error();
    const r = canjearEnlace(enlace, { ...vivo(enlace), ...c.cambios }, ahora);
    expect(r.ok).toBe(false);
  });
  it("enlace vencido o revocado no se canjea; la sesión hereda la expiración del enlace", () => {
    const enlace = generarToken();
    expect(canjearEnlace(enlace, { ...vivo(enlace), token_expira_at: "2026-08-22T11:59:59Z" }, ahora).ok).toBe(false);
    expect(canjearEnlace(enlace, { ...vivo(enlace), token_revocado_at: "2026-08-22T10:00:00Z" }, ahora).ok).toBe(false);
    const c = canjearEnlace(enlace, vivo(enlace), ahora);
    if (!c.ok) throw new Error();
    expect(c.cambios.token_expira_at).toBe("2026-09-21T12:00:00Z");
  });
});
