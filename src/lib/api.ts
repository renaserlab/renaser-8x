import { NextResponse } from "next/server";
import { z } from "zod";
import { perfilApi, puedeAcceder, esMiembro, NoAutenticado, AccesoDenegado, type Perfil } from "./auth";
import { redactarToken } from "./tokens";
import { registrar, ipDe, accionDeMetodo, type Accion } from "./auditoria";
import { registrarError } from "./errores";
import { limitar, CUPO, type Cupo } from "./limite";

export { NoAutenticado, AccesoDenegado };

/**
 * Acción de auditoría de un intento denegado. `audit_log.accion` es `text` sin check
 * (migracion-gobierno.sql:14), así que el valor entra tal cual; el tipo `Accion` de auditoria.ts
 * todavía no lo lista porque ese archivo es de otro encargo (cambio propuesto allí). En cuanto se
 * añada, esta conversión sobra.
 */
const DENEGADO: Accion = "denegado";

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
    const ruta = new URL(req.url).pathname;
    const entidad = opts.entidad ?? ruta.split("/")[3] ?? null;
    let perfil: Perfil | null = null;

    try {
      perfil = await perfilApi();
      if (!perfil) throw new NoAutenticado();
      if (opts.consultor && perfil.rol !== "consultor") throw new AccesoDenegado("Solo el consultor puede hacer esto.", "rol");

      const escribe = req.method !== "GET" && req.method !== "HEAD";
      if (escribe && opts.cupo !== "ninguno") {
        const cual = CUPO[opts.cupo ?? "escritura"];
        const c = await limitar(`${opts.cupo ?? "escritura"}:${perfil.id}`, cual.max, cual.ventana);
        if (!c.permitido) return demasiado(c);
      }

      const res = await fn(perfil, req, ctx);
      const accion = accionDeMetodo(req.method);
      if (accion && res.ok) {
        void registrar({ actor: perfil, accion, entidad, ruta, ip: ipDe(req) });
      }
      return res;
    } catch (e) {
      if (e instanceof EntradaInvalida) return fallo(e.message, 400);
      if (e instanceof NoAutenticado) return fallo(e.message, 401);
      if (e instanceof AccesoDenegado) {
        // Un acceso denegado no es un fallo del sistema: es un hecho de seguridad y queda en el rastro,
        // con quién lo intentó y sobre qué. La empresa va en `detalle` y no en `company_id` porque un
        // identificador inventado rompería la clave foránea y el intento se perdería en silencio.
        void registrar({
          actor: perfil, accion: DENEGADO, entidad, ruta, ip: ipDe(req),
          detalle: { motivo: e.motivo, empresa: e.companyId, metodo: req.method },
        });
        return fallo(redactarToken(e.message), 403);
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error(redactarToken(`[api ${req.method} ${ruta}] ${msg}`));
      void registrarError({ ruta, metodo: req.method, mensaje: msg, detalle: e instanceof Error ? e.stack : null, actorId: perfil?.id ?? null });
      return fallo(msg, 500);
    }
  };
}

/** Pertenencia con el atajo del consultor: la consultora entra a cualquier empresa; el cliente, a las suyas. */
export async function exigirAcceso(perfil: Perfil, companyId: string) {
  if (!(await puedeAcceder(perfil, companyId))) throw new AccesoDenegado("No tienes acceso a esta empresa.", "pertenencia", companyId);
}

/**
 * Pertenencia estricta: tampoco el consultor pasa sin membresía. Para lo que es de la persona y no de
 * la consultora, como elegir SU empresa activa (el consultor tiene su propio modo «ver como»).
 */
export async function exigirPertenencia(perfil: Perfil, companyId: string) {
  if (!(await esMiembro(perfil.id, companyId))) throw new AccesoDenegado("No perteneces a esta empresa.", "pertenencia", companyId);
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
