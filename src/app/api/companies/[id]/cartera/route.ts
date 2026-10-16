import { z } from "zod";
import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { registrar, ipDe } from "@/lib/auditoria";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NIVELES, SIN_MIGRACION_CARTERA, faltaEnLaBase } from "@/lib/cartera";

type Ctx = { params: Promise<{ id: string }> };

const COLUMNAS = "consultor_responsable_id,nivel_contratado,alcance_contratado,proxima_decision,proxima_decision_fecha";
const CAMPOS = ["consultor_responsable_id", "nivel_contratado", "alcance_contratado", "proxima_decision", "proxima_decision_fecha"] as const;
type Campo = (typeof CAMPOS)[number];
type Asignacion = Record<Campo, string | null>;

const NO_ENCONTRADA = "Empresa no encontrada";
const NADA_QUE_CAMBIAR = "No hay nada que cambiar: manda al menos consultor responsable, nivel, alcance, próxima decisión o su fecha.";
const SOLO_ESTOS_CAMPOS = "Solo se pueden cambiar consultor responsable, nivel, alcance, próxima decisión y su fecha.";
const CUERPO_INVALIDO = "Los datos enviados no son válidos.";
const NO_ES_CONSULTOR = "Esa persona no es un consultor de RENASER: elige a alguien de la lista.";
const FECHA_SIN_DECISION = "Escribe la próxima decisión antes de ponerle fecha.";
const MENSAJE: Record<Campo, string> = {
  consultor_responsable_id: "El consultor responsable no es un identificador válido.",
  nivel_contratado: "El nivel contratado solo puede ser Nivel 1 o Nivel 2, o quedar sin definir.",
  alcance_contratado: "El alcance contratado no puede pasar de 2.000 letras.",
  proxima_decision: "La próxima decisión no puede pasar de 500 letras.",
  proxima_decision_fecha: "La fecha de la próxima decisión tiene que ser un día que exista, escrito AAAA-MM-DD.",
};

/** La forma de un identificador, sin exigir versión: lo que Postgres acepta como uuid. */
const RE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un día que existe en el calendario: «2026-02-31» tiene la forma y no es un día. */
function esDiaReal(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Un texto que se puede vaciar: null o solo espacios lo dejan sin valor. */
const textoONada = (max: number) => z.union([z.string().trim().max(max), z.null()]).transform((v) => (v ? v : null));

/**
 * LO QUE SE PUEDE CAMBIAR. Parcial: se puede mandar un solo campo. `null` vacía el campo (quitar al consultor,
 * dejar el nivel sin definir, borrar la decisión). Una clave desconocida no se ignora en silencio: se rechaza.
 */
const Cuerpo = z
  .object({
    consultor_responsable_id: z.union([z.string().regex(RE_ID), z.null()]),
    nivel_contratado: z.union([z.enum(NIVELES), z.null()]),
    alcance_contratado: textoONada(2000),
    proxima_decision: textoONada(500),
    proxima_decision_fecha: z.union([z.string().refine(esDiaReal), z.null()]),
  })
  .partial()
  .strict();

/** El mensaje que ve la persona sale del campo que falló, no del texto de Zod. */
function mensajeDe(issue: z.core.$ZodIssue): string {
  if (issue.code === "unrecognized_keys") return SOLO_ESTOS_CAMPOS;
  const campo = issue.path[0];
  if (typeof campo === "string" && campo in MENSAJE) return MENSAJE[campo as Campo];
  return CUERPO_INVALIDO;
}

const comoAsignacion = (f: Partial<Record<Campo, unknown>>): Asignacion =>
  Object.fromEntries(CAMPOS.map((c) => [c, typeof f[c] === "string" ? (f[c] as string) : null])) as Asignacion;

/**
 * ASIGNAR LA CARTERA DE UNA EMPRESA: quién la lleva, qué nivel y qué alcance se contrató, y cuál es la próxima
 * decisión de Dirección. Solo la consultora. Cambiar al consultor responsable es administrar personas y exige
 * esa autoridad; lo demás lo puede escribir cualquier consultor. Deja rastro de qué había antes y qué quedó.
 */
export const PATCH = protegido<Ctx>({ consultor: true, entidad: "cartera" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  // Un identificador mal escrito no es una empresa: 404, no el error de Postgres sobre la forma de un uuid.
  if (!RE_ID.test(id)) return fallo(NO_ENCONTRADA, 404);
  await exigirAcceso(perfil, id);

  const r = Cuerpo.safeParse(await leerJSON(req));
  if (!r.success) return fallo(mensajeDe(r.error.issues[0]!), 400);
  const cambios = Object.fromEntries(Object.entries(r.data).filter(([, v]) => v !== undefined)) as Partial<Asignacion>;
  if (Object.keys(cambios).length === 0) return fallo(NADA_QUE_CAMBIAR, 400);

  // Decidir quién lleva una empresa es gestionar personas: no basta con ser consultor.
  if ("consultor_responsable_id" in cambios) await exigirAutoridad(perfil, "administrar");

  const sb = supabaseAdmin();
  const { data: antesFila, error: eLectura } = await sb.from("companies").select(COLUMNAS).eq("id", id).maybeSingle();
  if (faltaEnLaBase(eLectura)) return fallo(SIN_MIGRACION_CARTERA, 503);
  if (eLectura) return fallo(eLectura.message, 500);
  if (!antesFila) return fallo(NO_ENCONTRADA, 404);
  const antes = comoAsignacion(antesFila as Partial<Record<Campo, unknown>>);

  // El responsable tiene que ser un consultor que exista: un dueño o un identificador cualquiera no lleva una empresa.
  if (cambios.consultor_responsable_id) {
    const { data: persona, error: ePersona } = await sb.from("users").select("id,rol").eq("id", cambios.consultor_responsable_id).maybeSingle();
    if (ePersona) return fallo(ePersona.message, 500);
    if (!persona || (persona as { rol?: string }).rol !== "consultor") return fallo(NO_ES_CONSULTOR, 400);
  }

  // Una fecha sin decisión no dice nada: borrar la decisión borra su fecha, y no se pone fecha a una decisión vacía.
  if (cambios.proxima_decision === null && !("proxima_decision_fecha" in cambios)) cambios.proxima_decision_fecha = null;
  const decisionFinal = "proxima_decision" in cambios ? cambios.proxima_decision : antes.proxima_decision;
  const fechaFinal = "proxima_decision_fecha" in cambios ? cambios.proxima_decision_fecha : antes.proxima_decision_fecha;
  if (fechaFinal && !decisionFinal) return fallo(FECHA_SIN_DECISION, 400);

  // Lo que de verdad cambia. Guardar lo mismo que ya había no es un cambio y no deja rastro propio.
  const efectivos = Object.fromEntries(Object.entries(cambios).filter(([k, v]) => (antes[k as Campo] ?? null) !== (v ?? null))) as Partial<Asignacion>;
  if (Object.keys(efectivos).length === 0) return ok({ cartera: antes, sin_cambios: true });

  const { data, error } = await sb.from("companies").update(efectivos).eq("id", id).select(COLUMNAS).single();
  if (faltaEnLaBase(error)) return fallo(SIN_MIGRACION_CARTERA, 503);
  // 23514: la base rechazó el valor por su propia regla (el nivel). 23503: el consultor dejó de existir entre la comprobación y el guardado.
  if (error?.code === "23514") return fallo(MENSAJE.nivel_contratado, 400);
  if (error?.code === "23503") return fallo(NO_ES_CONSULTOR, 400);
  if (error) return fallo(error.message, 500);

  const despues = comoAsignacion(data as Partial<Record<Campo, unknown>>);
  // Además del rastro genérico de `protegido`, este dice de qué empresa, qué había y qué quedó: es lo que se pregunta después.
  void registrar({ companyId: id, actor: perfil, accion: "editar", entidad: "cartera", entidadId: id, detalle: { antes, despues, campos: Object.keys(efectivos) }, ruta: new URL(req.url).pathname, ip: ipDe(req) });
  return ok({ cartera: despues, sin_cambios: false });
});
