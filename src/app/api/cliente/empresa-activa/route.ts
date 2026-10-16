import { NextResponse } from "next/server";
import { z } from "zod";
import { protegido, leerValidado, exigirPertenencia, uuid } from "@/lib/api";
import { COOKIE_EMPRESA_ACTIVA } from "@/lib/auth";

/**
 * FIJAR LA EMPRESA ACTIVA. body: { company_id } → cookie `empresa_activa`.
 * Solo se acepta una empresa a la que la persona pertenezca de verdad: la cookie no da acceso, solo
 * elige entre lo que la membresía ya permite. Si alguien manda otra, es 403 y queda en el rastro.
 */
export const POST = protegido({ entidad: "empresa_activa" }, async (perfil, req) => {
  const b = await leerValidado(req, z.object({ company_id: uuid }));
  // Pertenencia estricta: también el consultor necesita membresía aquí; su modo «ver como» usa otra cookie.
  await exigirPertenencia(perfil, b.company_id);

  const r = NextResponse.json({ company_id: b.company_id });
  r.cookies.set(COOKIE_EMPRESA_ACTIVA, b.company_id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return r;
});
