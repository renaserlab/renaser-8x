import { NextResponse } from "next/server";
import { ok, uuid } from "@/lib/api";
import { registrar, ipDe, type Accion } from "@/lib/auditoria";
import type { Perfil } from "@/lib/auth";
import type { Resultado } from "@/lib/estrategia/resultado";

/**
 * LO QUE COMPARTEN LAS RUTAS DE LA ESTRATEGIA (spec-estrategia-8x.md §5 y §7). Vive aparte porque un archivo de ruta de
 * Next solo puede exportar sus métodos HTTP.
 */

/**
 * El resultado de una acción (src/lib/estrategia/resultado.ts) como respuesta: lo que salió bien, tal cual; lo que
 * no, con su código, el texto para la persona en `error` y lo que la pantalla necesita para seguir (lo que falta, lo
 * que queda por resolver…).
 */
export function respuesta<T extends object>(r: Resultado<T>, status = 200): Response {
  if (r.ok) {
    const { ok: _ok, ...resto } = r as { ok: true } & T;
    void _ok;
    return ok(resto, status);
  }
  return NextResponse.json({ error: r.texto, codigo: r.codigo, ...(r.extra ?? {}) }, { status: r.status });
}

/** Un id de la ruta que no tiene forma de id no es de ninguna versión: 404, sin preguntarle a la base. */
export const esId = (x: string): boolean => uuid.safeParse(x).success;

/** El rastro de lo que se hizo sobre la estrategia de una empresa (protegido() deja el suyo, sin la empresa). */
export function rastro(req: Request, perfil: Perfil, companyId: string, accion: Accion, entidadId: string | null, detalle: Record<string, unknown>, entidad = "estrategia") {
  void registrar({ companyId, actor: perfil, accion, entidad, entidadId, detalle, ruta: new URL(req.url).pathname, ip: ipDe(req) });
}
