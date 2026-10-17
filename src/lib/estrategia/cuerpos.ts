/**
 * LO QUE ACEPTAN LAS RUTAS DE LA ESTRATEGIA, EN UN SOLO LUGAR (spec-estrategia-8x.md §5.3, §7 y §8).
 *
 * Las rutas validan con esto (leerValidado) y las pantallas pueden validar con lo mismo antes de mandar. Todo es
 * estricto: un campo que no está aquí no entra (nadie manda un estado, un autor o una versión por la puerta de atrás).
 *
 * Puro: sin base, sin red. Lo puede importar un componente de cliente.
 */
import { z } from "zod";
import { SECCIONES } from "../secciones";
import { PATRON_SUPUESTO } from "./esquemas";

/** El tope de un texto corregido: el del texto más largo que escribe el modelo (la oferta escrita). */
export const TOPE_TEXTO_EDITADO = 700;
/** El tope del motivo de una elección (check de estrategias.motivo_eleccion). */
export const TOPE_MOTIVO = 600;

const id = z.string().uuid("no es un identificador válido");
/** Un puntero dentro de la estrategia («/caminos/a/jugadas/0/que_se_mueve»), con la forma que admite estrategia_ediciones. */
const Puntero = z.string().max(200).regex(/^(\/[a-z0-9_]+)+$/, "no es un lugar de la estrategia");

/** POST /estrategia: generar no recibe nada (la empresa va en la ruta y lo demás lo lee 8X). */
export const CuerpoGenerar = z.object({}).strict();

/** PATCH /estrategia/[eid]: una corrección por vez. */
export const CuerpoCorregir = z.union([
  z.object({ texto: z.object({ puntero: Puntero, texto: z.string().trim().min(3, "escribe al menos tres letras").max(TOPE_TEXTO_EDITADO) }).strict() }).strict(),
  z.object({ supuesto: z.object({ id: z.string().regex(PATRON_SUPUESTO), bajo: z.number().finite(), alto: z.number().finite() }).strict() }).strict(),
  z.object({ aceptar: z.object({ puntero: Puntero }).strict() }).strict(),
  z.object({ restaurar: z.object({ puntero: Puntero }).strict() }).strict(),
  z.object({ elegir: z.object({ camino: z.enum(["a", "b"]), motivo: z.string().trim().max(TOPE_MOTIVO).nullable().optional() }).strict() }).strict(),
]);
export type CuerpoCorregir = z.infer<typeof CuerpoCorregir>;

/** POST /estrategia/[eid]: descartar una versión que se está generando. */
export const CuerpoDescartar = z.object({ descartar: z.literal(true) }).strict();

/** POST /estrategia/[eid]/aprobar: el motivo de la elección, si no se dijo al elegir. */
export const CuerpoAprobar = z.object({ motivo: z.string().trim().max(TOPE_MOTIVO).nullable().optional() }).strict();

/** POST /estrategia/[eid]/reintentar: la etapa (sin ella, todas las que fallaron). */
export const CuerpoReintentar = z.object({ etapa: z.enum(["dinero", "terreno", "rojo"]).nullable().optional() }).strict();

/** POST /estrategia/[eid]/actualizar: no recibe nada. */
export const CuerpoActualizar = z.object({}).strict();

/** POST /estrategia-preguntas: enviar (un toque). `secciones` acota lo que se abre; por defecto, todo lo que hace falta. */
export const CuerpoEnviarPreguntas = z
  .object({
    enviar: z.array(id).max(40),
    estrategia_id: id.nullable().optional(),
    secciones: z.array(z.enum(SECCIONES)).max(SECCIONES.length).nullable().optional(),
  })
  .strict();

/** PATCH /estrategia-preguntas/[pid] de la consultora: retocar antes de enviar, o retirar. */
export const CuerpoPreguntaConsultora = z.union([
  z.object({ retirar: z.literal(true) }).strict(),
  z
    .object({ texto: z.string().trim().min(8, "es demasiado corta").max(200).optional(), por_que: z.string().trim().max(300).nullable().optional() })
    .strict()
    .refine((x) => x.texto !== undefined || x.por_que !== undefined, { message: "no dice qué cambiar", path: ["texto"] }),
]);

/** PATCH /estrategia-preguntas/[pid] del dueño: su respuesta. La forma del número la revisa preguntas.ts según la pregunta. */
export const CuerpoRespuestaDueno = z.object({ respuesta: z.unknown().optional(), respuesta_texto: z.string().trim().max(1000).nullable().optional() }).strict();
