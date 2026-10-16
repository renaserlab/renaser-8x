import { z } from "zod";
import { uuid } from "@/lib/api";
import { CLAVES_DOMINIO, ESTADOS } from "@/lib/iniciativas";

/**
 * LA FORMA DE LO QUE LLEGA A LAS RUTAS DE INICIATIVAS. Aquí solo se mira la forma (tipos y tamaños); el
 * sentido (qué es obligatorio en cada estado, qué exige mercado y competencia, qué fecha vale) lo decide
 * src/lib/iniciativas.ts. Los textos se aceptan vacíos a propósito: la regla responde con un mensaje que
 * dice qué falta, en vez de un «revisa estos campos».
 *
 * `estado`, `decision_*`, `creada_por` y `fuentes_aportadas` no están en ningún esquema: el estado solo
 * cambia por /transicion y las fuentes solo se añaden de una en una. Zod descarta las claves que no conoce.
 */
const largo = (max: number) => z.string().max(max);
const opcional = (max: number) => z.string().max(max).nullable().optional();

export const Fuente = z.object({ nombre: largo(200), quien: largo(160), fecha: largo(10), que_dice: largo(1000) });

const Ficha = z.object({
  dominio: z.enum(CLAVES_DOMINIO).optional(),
  titulo: largo(200).optional(),
  hipotesis: largo(2000).optional(),
  medida_exito: largo(1000).optional(),
  evidencia_ids: z.array(uuid).max(60).optional(),
  pendiente_investigacion: opcional(2000),
  recursos: opcional(1500),
  plazo_inicio: opcional(10),
  plazo_fin: opcional(10),
  indicador_id: uuid.nullable().optional(),
  criterio_continuar: opcional(600),
  criterio_ajustar: opcional(600),
  criterio_detener: opcional(600),
  responsable_participant_id: uuid.nullable().optional(),
});

export const Crear = Ficha.extend({ dominio: z.enum(CLAVES_DOMINIO), fuente_aportada: Fuente.nullable().optional() });

export const Editar = Ficha.extend({
  /** Por qué se cambia. Obligatorio cuando la iniciativa ya está aprobada; queda en el historial. */
  motivo: opcional(2000),
  /** Una fuente aportada que se añade. */
  fuente_aportada: Fuente.nullable().optional(),
});

export const Transitar = z.object({
  a_estado: z.enum(ESTADOS),
  motivo: opcional(2000),
  que_se_observo: opcional(2000),
  valor_observado: opcional(40),
  evidencia_ids: z.array(uuid).max(60).optional(),
});
