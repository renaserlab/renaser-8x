import { NextResponse } from "next/server";
import { z } from "zod";
import { perfilApi, puedeAcceder, type Perfil } from "./auth";
import { redactarToken } from "./tokens";
import { registrar, ipDe, accionDeMetodo } from "./auditoria";
import { registrarError } from "./errores";
import { limitar, CUPO, type Cupo } from "./limite";

export function fallo(mensaje: string, status = 400) {
  return NextResponse.json({ error: mensaje }, { status });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

function demasiado(c: Cupo) {
  return NextResponse.json(
    { error: `Vas muy rápido. Intenta de nuevo en ${Math.max(1, Math.ceil(c.reiniciaEn / 60))} minuto(s).` },
    { status: 429, headers: { "Retry-After": String(Math.max(1, c.reiniciaEn)) } }
  );
}

type Opciones = {
  consultor?: boolean;
  /** Qué cupo consume esta ruta. 'ia' y 'subida' son los caros; por defecto, escritura. */
  cupo?: keyof typeof CUPO | "ninguno";
  /** Qué se está haciendo, para el registro de auditoría. Por defecto se deduce del método. */
  entidad?: string;
};

/**
 * Envuelve un handler: exige sesión, aplica el cupo de peticiones, deja rastro de auditoría y
 * convierte los errores en JSON claro además de guardarlos. Las tres piezas que faltaban según
 * la auditoría del 29-08-2026 viven aquí, así las 46 rutas las heredan sin tocarlas una por una.
 */
export function protegido<Ctx>(
  opts: Opciones,
  fn: (perfil: Perfil, req: Request, ctx: Ctx) => Promise<Response>
) {
  return async (req: Request, ctx: Ctx) => {
    const perfil = await perfilApi();
    if (!perfil) return fallo("Tienes que entrar primero.", 401);
    if (opts.consultor && perfil.rol !== "consultor") return fallo("Solo el consultor puede hacer esto.", 403);

    const ruta = new URL(req.url).pathname;
    const escribe = req.method !== "GET" && req.method !== "HEAD";

    if (escribe && opts.cupo !== "ninguno") {
      const cual = CUPO[opts.cupo ?? "escritura"];
      const c = await limitar(`${opts.cupo ?? "escritura"}:${perfil.id}`, cual.max, cual.ventana);
      if (!c.permitido) return demasiado(c);
    }

    try {
      const res = await fn(perfil, req, ctx);
      const accion = accionDeMetodo(req.method);
      if (accion && res.ok) {
        void registrar({ actor: perfil, accion, entidad: opts.entidad ?? ruta.split("/")[3] ?? null, ruta, ip: ipDe(req) });
      }
      return res;
    } catch (e) {
      if (e instanceof EntradaInvalida) return fallo(e.message, 400);
      const msg = e instanceof Error ? e.message : String(e);
      console.error(redactarToken(`[api ${req.method} ${ruta}] ${msg}`));
      void registrarError({ ruta, metodo: req.method, mensaje: msg, detalle: e instanceof Error ? e.stack : null, actorId: perfil.id });
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

/**
 * Igual que leerJSON pero validando contra un esquema. Hallazgo medio de la auditoría del
 * 29-08-2026: las rutas comprobaban a mano (`if (!b.company_id)`) y Zod solo se usaba para las
 * salidas de la IA. Aquí el error que ve el usuario es en castellano, no el volcado de Zod.
 */
export class EntradaInvalida extends Error {
  constructor(public campos: string[]) {
    super(campos.length ? `Revisa estos campos: ${campos.join(", ")}.` : "Los datos enviados no son válidos.");
  }
}

export async function leerValidado<T>(req: Request, esquema: z.ZodType<T>): Promise<T> {
  const crudo = await leerJSON(req);
  const r = esquema.safeParse(crudo);
  if (!r.success) throw new EntradaInvalida([...new Set(r.error.issues.map((i) => i.path.join(".") || "cuerpo"))]);
  return r.data;
}

/** Piezas que se repiten en casi todas las rutas. */
export const uuid = z.string().uuid("no es un identificador válido");
export const texto = (max: number) => z.string().trim().min(1).max(max);
