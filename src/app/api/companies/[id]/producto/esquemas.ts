import { z } from "zod";
import { texto } from "@/lib/api";
import { TIPOS_LINEA, DECISIONES, ORIGENES_LINEA } from "@/lib/producto";

/**
 * Lo que las rutas de «lo que vende la empresa» validan en común. Vive aparte de route.ts porque un
 * archivo de ruta de Next solo puede exportar métodos HTTP.
 *
 * Un monto que no se sabe viaja como null, nunca como cero: por eso todos los numéricos admiten null.
 * Lo que no es de forma sino de sentido (una decisión sin motivo, horas en un producto, un periodo mal
 * escrito) lo revisa `revisarLinea` en src/lib/producto.ts, con la línea ya armada.
 */
const monto = z.number().finite().min(0, "no puede ser negativo").max(1_000_000_000_000).nullable().optional();

export const CuerpoLinea = z.object({
  codigo: texto(60).nullable().optional(),
  nombre: texto(160),
  tipo: z.enum(TIPOS_LINEA),
  cliente_objetivo: texto(300).nullable().optional(),
  necesidad: texto(300).nullable().optional(),
  promesa: texto(300).nullable().optional(),
  precio: monto,
  costo_variable_unitario: monto,
  unidades_periodo: monto,
  horas_por_unidad: monto,
  periodo: texto(20).nullable().optional(),
  origen: z.enum(ORIGENES_LINEA).nullable().optional(),
  decision: z.enum(DECISIONES).nullable().optional(),
  decision_motivo: texto(600).nullable().optional(),
});

/** Editar: los mismos campos, todos opcionales. Lo que no viene no se toca; lo que viene null se borra a propósito. */
export const CambiosLinea = CuerpoLinea.partial();
