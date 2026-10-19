import { NextResponse } from "next/server";
import { protegido } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * "Ver como el empresario": el consultor entra al portal del cliente de una empresa suya.
 * GET ?empresa=<id> → cookie ver_como + redirect /portal · GET ?salir=1 → limpia y vuelve a la bandeja.
 * RENASER OS (19-10-2026): `destino` lleva a una pantalla de /os o de /portal de esa empresa (p. ej. su equipo en vivo,
 * desde el pulso de empresas). Solo una ruta interna de esas dos: cualquier otra cosa se ignora y se va a /portal.
 */
export const GET = protegido({ consultor: true }, async (_perfil, req) => {
  const url = new URL(req.url);
  const destinoBandeja = new URL("/bandeja", url.origin);

  if (url.searchParams.get("salir")) {
    const r = NextResponse.redirect(destinoBandeja);
    r.cookies.set("ver_como", "", { path: "/", maxAge: 0 });
    return r;
  }
  const empresa = url.searchParams.get("empresa") ?? "";
  const { data: c } = await supabaseAdmin().from("companies").select("id").eq("id", empresa).maybeSingle();
  if (!c) return NextResponse.redirect(destinoBandeja);
  const pedido = url.searchParams.get("destino") ?? "";
  const destino = /^\/(os|portal)(\/[a-z0-9-]+)*$/.test(pedido) ? pedido : "/portal";
  const r = NextResponse.redirect(new URL(destino, url.origin));
  r.cookies.set("ver_como", c.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 8 });
  return r;
});
