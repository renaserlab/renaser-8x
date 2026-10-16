import { z } from "zod";
import { uuid, texto } from "@/lib/api";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UNIDADES, FRECUENCIAS, TIPOS_INDICADOR, SENTIDOS_UMBRAL, UNIDADES_MONETARIAS, GRANULARIDAD_DE, FORMA_PERIODO,
  periodoValido, type Frecuencia, type Unidad,
} from "@/lib/kpis";

/**
 * LO QUE COMPARTEN LAS RUTAS DE INDICADORES: el esquema de los doce atributos y las comprobaciones que
 * no son de forma sino de sentido (un punto de partida sin periodo, un umbral sin sentido, un
 * responsable de otra empresa). Lo que aquí se rechaza no llega a la base.
 *
 * `valor_actual*` no está en ningún esquema a propósito: el valor actual solo entra por /valor, con
 * dato y con fecha. Zod descarta las claves desconocidas, así que mandarlo no hace nada.
 */
const num = z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000);
const periodoTexto = z.string().trim().min(4).max(20);
const fechaISO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "la fecha se escribe AAAA-MM-DD");

const Base = z.object({
  nombre: texto(120).optional(),
  clave: z.string().trim().max(60).optional(),
  como_se_mide: texto(400).optional(),
  definicion: texto(600).nullable().optional(),
  formula: texto(600).nullable().optional(),
  unidad: z.enum(UNIDADES).optional(),
  moneda: z.string().trim().toUpperCase().length(3).nullable().optional(),
  fuente: texto(300).nullable().optional(),
  responsable_participant_id: uuid.nullable().optional(),
  frecuencia: z.enum(FRECUENCIAS).optional(),
  mejor_si: z.enum(["sube", "baja", "neutro"]).optional(),
  tipo_indicador: z.enum(TIPOS_INDICADOR).nullable().optional(),
  linea_base_valor: num.nullable().optional(),
  linea_base_periodo: periodoTexto.nullable().optional(),
  linea_base_medicion_id: uuid.nullable().optional(),
  meta_valor: num.nullable().optional(),
  meta_texto: texto(200).nullable().optional(),
  meta_plazo: fechaISO.nullable().optional(),
  umbral_alerta: num.nullable().optional(),
  umbral_sentido: z.enum(SENTIDOS_UMBRAL).nullable().optional(),
  accion_asociada_id: uuid.nullable().optional(),
  decision_asociada: texto(400).nullable().optional(),
  origen_texto: texto(400).nullable().optional(),
  estado: z.enum(["propuesto", "activo", "archivado"]).optional(),
  /** Por qué se cambia. Queda en el rastro con quién y qué implicó. */
  motivo: texto(400).optional(),
});

export const Crear = Base.extend({
  nombre: texto(120),
  unidad: z.enum(UNIDADES).default("numero"),
  frecuencia: z.enum(FRECUENCIAS).default("mensual"),
  mejor_si: z.enum(["sube", "baja", "neutro"]).default("baja"),
});
export const Editar = Base;

export type Cambios = z.infer<typeof Base>;

/** Las columnas que se escriben en `indicadores` (todo menos `motivo`, que va al rastro). */
export const COLUMNAS = [
  "nombre", "clave", "como_se_mide", "definicion", "formula", "unidad", "moneda", "fuente", "responsable_participant_id", "frecuencia",
  "mejor_si", "tipo_indicador", "linea_base_valor", "linea_base_periodo", "linea_base_medicion_id", "meta_valor", "meta_texto", "meta_plazo",
  "umbral_alerta", "umbral_sentido", "accion_asociada_id", "decision_asociada", "origen_texto", "estado",
] as const;

type Coherente = {
  unidad: Unidad;
  moneda: string | null;
  frecuencia: Frecuencia;
  linea_base_valor: number | null;
  linea_base_periodo: string | null;
  meta_valor: number | null;
  meta_texto: string | null;
  meta_plazo: string | null;
  umbral_alerta: number | null;
  umbral_sentido: string | null;
};

/**
 * Comprobaciones de sentido sobre el indicador COMPLETO (lo que había más lo que cambia). Devuelve el
 * primer motivo de rechazo o, si todo cuadra, la moneda resuelta (soles → PEN cuando no se dijo).
 */
export function comprobarCoherencia(k: Coherente): { ok: true; moneda: string | null } | { ok: false; motivo: string } {
  let moneda = k.moneda;
  if (UNIDADES_MONETARIAS.has(k.unidad)) {
    if (!moneda && k.unidad !== "moneda") moneda = "PEN";
    if (!moneda) return { ok: false, motivo: "Si la unidad es dinero hay que decir en qué moneda (por ejemplo PEN o USD)." };
  } else {
    moneda = null;
  }
  const hayValorBase = k.linea_base_valor != null;
  const hayPeriodoBase = !!k.linea_base_periodo;
  if (hayValorBase !== hayPeriodoBase) return { ok: false, motivo: "El punto de partida va siempre con su periodo: valor y periodo juntos, o ninguno." };
  if (hayPeriodoBase && !periodoValido(k.linea_base_periodo!, k.frecuencia)) {
    return { ok: false, motivo: `El periodo del punto de partida tiene que tener la forma de la frecuencia (${FORMA_PERIODO[GRANULARIDAD_DE[k.frecuencia]]}); si no, nunca se podrá comparar con los valores.` };
  }
  const hayUmbral = k.umbral_alerta != null;
  const haySentido = !!k.umbral_sentido;
  if (hayUmbral !== haySentido) return { ok: false, motivo: "El umbral de alerta va con su sentido (por debajo o por encima): los dos, o ninguno." };
  const hayMeta = k.meta_valor != null || !!k.meta_texto;
  if (k.meta_plazo && !hayMeta) return { ok: false, motivo: "Un plazo sin meta no dice nada: pon la meta (número o en palabras) o quita el plazo." };
  return { ok: true, moneda };
}

/**
 * Lo que el indicador referencia tiene que ser de ESTA empresa: una persona, una acción o una medición
 * ajena no se cuelga de aquí aunque el id exista.
 */
export async function comprobarReferencias(
  sb: SupabaseClient,
  companyId: string,
  c: { responsable_participant_id?: string | null; accion_asociada_id?: string | null; linea_base_medicion_id?: string | null }
): Promise<string | null> {
  if (c.responsable_participant_id) {
    const { data } = await sb.from("participants").select("id").eq("id", c.responsable_participant_id).eq("company_id", companyId).maybeSingle();
    if (!data) return "El responsable tiene que ser una persona registrada en esta empresa.";
  }
  if (c.accion_asociada_id) {
    const { data } = await sb.from("actions").select("id").eq("id", c.accion_asociada_id).eq("company_id", companyId).maybeSingle();
    if (!data) return "La acción asociada tiene que ser una acción del plan de esta empresa.";
  }
  if (c.linea_base_medicion_id) {
    const { data } = await sb.from("mediciones").select("id").eq("id", c.linea_base_medicion_id).eq("company_id", companyId).maybeSingle();
    if (!data) return "La medición del punto de partida tiene que ser de esta empresa.";
  }
  return null;
}

/** Solo las claves que de verdad cambian, con antes y después: es lo que va al rastro. */
export function diferencias(antes: Record<string, unknown>, cambios: Record<string, unknown>): { antes: Record<string, unknown>; despues: Record<string, unknown> } {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const [clave, nuevo] of Object.entries(cambios)) {
    if (nuevo === undefined) continue;
    const viejo = antes[clave] ?? null;
    if (JSON.stringify(viejo) === JSON.stringify(nuevo ?? null)) continue;
    a[clave] = viejo;
    d[clave] = nuevo ?? null;
  }
  return { antes: a, despues: d };
}
