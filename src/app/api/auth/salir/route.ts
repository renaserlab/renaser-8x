import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { perfilApi } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/auditoria";

export async function POST(req: Request) {
  // El rastro se toma ANTES de cerrar: después ya no hay de quién decir que salió.
  const perfil = await perfilApi();
  if (perfil) await registrar({ actor: perfil, accion: "salir", entidad: "sesion", ruta: "/api/auth/salir", ip: ipDe(req) });
  const sb = await supabaseServer();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/entrar", req.url), { status: 303 });
}
