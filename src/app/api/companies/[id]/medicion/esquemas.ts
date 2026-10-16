import { z } from "zod";

/**
 * Lo que las rutas de medición validan en común: fechas de período y cambios de condiciones. Vive aparte
 * de route.ts porque un archivo de ruta de Next solo puede exportar métodos HTTP.
 */
export const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");

export const CambioCondicionZ = z.object({
  que_cambio: z.string().trim().min(3).max(200),
  desde: Fecha,
  efecto_esperado: z.string().trim().min(3).max(300),
  afecta: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export const CondicionesZ = z.object({
  temporada: z.string().trim().max(60).nullable().optional(),
  cambios: z.array(CambioCondicionZ).max(30).optional(),
});

/** El período, si viene, viene entero y en orden. Devuelve el mensaje de error o null. */
export function validarPeriodo(desde?: string, hasta?: string): string | null {
  if (!desde && !hasta) return null;
  if (!desde || !hasta) return "El período va con sus dos fechas: desde y hasta.";
  if (desde > hasta) return "El período está al revés: «desde» es posterior a «hasta».";
  return null;
}
