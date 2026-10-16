import { NextResponse } from "next/server";
import { fallo } from "@/lib/api";
import { ReglaDeIniciativa } from "@/lib/iniciativas";
import { SinTablasDeIniciativas } from "./_datos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Un identificador mal escrito no llega a la base: es un «no existe», no un error del servidor. */
export const esUuid = (x: string): boolean => UUID.test(x);

/**
 * Una regla incumplida es un 400 con su mensaje y, si aplica, con lo que falta; una base sin las tablas es
 * un 503 que lo dice. Lo demás (una denegación de acceso, un fallo real) sigue hacia `protegido()`, que
 * sabe qué hacer con cada cosa.
 */
export function respuestaDeRegla(e: unknown): Response {
  if (e instanceof ReglaDeIniciativa) return NextResponse.json({ error: e.message, faltan: e.faltan ?? [] }, { status: 400 });
  if (e instanceof SinTablasDeIniciativas) return fallo(e.message, 503);
  throw e;
}
