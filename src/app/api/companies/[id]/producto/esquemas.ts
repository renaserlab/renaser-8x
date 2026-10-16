import { z } from "zod";
import { texto } from "@/lib/api";
import { TIPOS_LINEA, DECISIONES, ORIGENES_LINEA, type GrupoEstado } from "@/lib/producto";
import { camposLineaNuevos } from "@/lib/esquemas-negocio";

/**
 * Lo que las rutas de «lo que vende la empresa» validan en común. Vive aparte de route.ts porque un
 * archivo de ruta de Next solo puede exportar métodos HTTP.
 *
 * Un monto que no se sabe viaja como null, nunca como cero: por eso todos los numéricos admiten null.
 * Lo que no es de forma sino de sentido (una decisión sin motivo, horas en un producto, un periodo mal
 * escrito, un segundo precio sin su tipo) lo revisa `revisarLinea` en src/lib/producto.ts, con la línea ya armada.
 *
 * 16-10-2026: la consultora recibe también los campos que llena el cliente (dos precios, costo por partes,
 * cuánto se vende al mes, estado de cada dato), con «comprobado» incluido. Lo del dueño está en
 * src/lib/esquemas-negocio.ts (CuerpoLineaDueno): sin código, decisión, origen ni periodo.
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
  ...camposLineaNuevos(false),
});

/** Editar: los mismos campos, todos opcionales. Lo que no viene no se toca; lo que viene null se borra a propósito. */
export const CambiosLinea = CuerpoLinea.partial();

/** Qué campos son de cada grupo de datos de una línea: un grupo comprobado con un documento no lo cambia el dueño. */
export const CAMPOS_DEL_GRUPO: Record<GrupoEstado, string[]> = {
  precio: ["precio", "precio_segundo", "segundo_precio_es", "de_cada_10_segundo"],
  costo: ["componentes_costo", "costo_variable_unitario"],
  unidades: ["unidades_mes", "unidades_mes_desde", "unidades_mes_hasta", "participacion_de_10", "unidades_periodo"],
};
const NOMBRE_DEL_GRUPO: Record<GrupoEstado, string> = { precio: "El precio", costo: "Lo que te cuesta", unidades: "Cuánto vendes" };

/** El texto del 409 cuando el dueño intenta cambiar un dato que la consultora ya comprobó con un documento. */
export const textoComprobado = (g: GrupoEstado) => `«${NOMBRE_DEL_GRUPO[g]}» ya está comprobado con un documento y no se cambió. Si cambió, díselo a tu consultora.`;
export const TEXTO_NO_ES_SUYO = "Este producto lo anotó tu consultora: pídele que lo quite.";

