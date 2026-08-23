import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { puedeAcceder } from "@/lib/auth";
import { autorizarSesion } from "@/lib/sesiones";
import { pedirSiguiente, estadoSesion } from "@/lib/entrevista";

type Ctx = { params: Promise<{ id: string }> };

/**
 * body: { session_id } → encola ENTREVISTADOR (prioridad 1) y devuelve el estado de la sesión.
 * P0-05: no basta con acceder a la empresa; la sesión debe ser del propio usuario (o ser consultor).
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const { session_id } = await leerJSON<{ session_id?: string }>(req);
  if (!session_id) return fallo("Falta session_id");
  const { decision, sesion } = await autorizarSesion(perfil, session_id, (c) => puedeAcceder(perfil, c));
  if (!decision.permitido) return fallo(decision.motivo, decision.status);
  if (sesion!.company_id !== id) return fallo("Sesión no encontrada", 404);
  const est = await estadoSesion(session_id);
  if (!est.abierta && est.sesion?.estado !== "completa") await pedirSiguiente(session_id, id);
  return ok(await estadoSesion(session_id));
});

export const GET = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const session_id = new URL(req.url).searchParams.get("session_id");
  if (!session_id) return fallo("Falta session_id");
  const { decision, sesion } = await autorizarSesion(perfil, session_id, (c) => puedeAcceder(perfil, c));
  if (!decision.permitido) return fallo(decision.motivo, decision.status);
  if (sesion!.company_id !== id) return fallo("Sesión no encontrada", 404);
  return ok(await estadoSesion(session_id));
});
