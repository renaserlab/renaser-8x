import { NextResponse } from "next/server";
import { perfilApi, puedeAcceder, type Perfil } from "./auth";
import { redactarToken } from "./tokens";

export function fallo(mensaje: string, status = 400) {
  return NextResponse.json({ error: mensaje }, { status });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/** Envuelve un handler: exige sesión; opcionalmente exige consultor. Convierte errores en JSON claros. */
export function protegido<Ctx>(
  opts: { consultor?: boolean },
  fn: (perfil: Perfil, req: Request, ctx: Ctx) => Promise<Response>
) {
  return async (req: Request, ctx: Ctx) => {
    const perfil = await perfilApi();
    if (!perfil) return fallo("Tienes que entrar primero.", 401);
    if (opts.consultor && perfil.rol !== "consultor") return fallo("Solo el consultor puede hacer esto.", 403);
    try {
      return await fn(perfil, req, ctx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(redactarToken(`[api ${req.method} ${new URL(req.url).pathname}] ${msg}`));
      return fallo(msg, 500);
    }
  };
}

export async function exigirAcceso(perfil: Perfil, companyId: string) {
  if (!(await puedeAcceder(perfil, companyId))) throw new Error("No tienes acceso a esta empresa.");
}

export async function leerJSON<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
