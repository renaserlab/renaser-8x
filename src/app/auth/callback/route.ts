import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { perfilApi } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/auditoria";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    await sb.auth.exchangeCodeForSession(code);
    // Cada entrada deja rastro con su IP: ISO 27001 A.8.15 pide poder reconstruir los accesos.
    const perfil = await perfilApi();
    if (perfil) await registrar({ actor: perfil, accion: "entrar", entidad: "sesion", ruta: "/auth/callback", ip: ipDe(req) });
  }
  return NextResponse.redirect(new URL("/", req.url));
}
