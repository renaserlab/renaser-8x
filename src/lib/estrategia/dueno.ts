/**
 * LO QUE EL DUEÑO LEE Y RESPONDE DE LA ESTRATEGIA, SIN NADA DE SERVIDOR (spec-estrategia-8x.md §7.3 y §8.2).
 *
 * Las piezas que comparten la página del servidor y la tarjeta del navegador:
 *  - una pregunta tal como le llega al dueño (las columnas de COLUMNAS_PREGUNTA_DUENO: sin el porqué para la
 *    consultora, sin la clave del catálogo y sin las jugadas que esperan su respuesta);
 *  - cómo se escribe su respuesta según la unidad de la pregunta (dinero, días, de cada 10…), sin inventar nada: un
 *    «no lo sé» se dice «No lo sé» y lo que nadie respondió no se escribe;
 *  - qué cuerpo se manda a la ruta al responder (PATCH /api/companies/[id]/estrategia-preguntas/[pid]);
 *  - el día del calendario de un «día N» del camino, contado desde que la consultora lo aprobó.
 *
 * Puro: sin base, sin red. Lo importa un componente de cliente: solo trae formato.ts, dato-oral.ts y tipos.
 */
import { formaDe, rangoDe, type DatoOral, type EstadoDato } from "../dato-oral";
import { moneda, numero, porDefecto, type ConfigEmpresa } from "../formato";

export const UNIDADES_PREGUNTA = ["soles", "de_cada_10", "dias", "unidades_mes", "veces_mes", "horas_semana", "personas", "texto"] as const;
export type UnidadPregunta = (typeof UNIDADES_PREGUNTA)[number];

/** Una pregunta como la ve el dueño. Solo las enviadas y las respondidas de su empresa llegan aquí. */
export type PreguntaDueno = {
  id: string;
  texto: string;
  unidad: UnidadPregunta;
  estado: "enviada" | "respondida";
  respuesta: DatoOral | null;
  respuesta_texto: string | null;
  respondida_at: string | null;
};

const ESTADOS_DATO: readonly EstadoDato[] = ["estimado", "contado", "comprobado", "no_lo_se"];
const numeroONulo = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Lo guardado en `respuesta` como DatoOral; lo que no tiene forma de dato dicho no se toma como respuesta. */
function datoDe(v: unknown): DatoOral | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!ESTADOS_DATO.includes(o.estado as EstadoDato)) return null;
  const d: DatoOral = { estado: o.estado as EstadoDato };
  const valor = numeroONulo(o.valor);
  const desde = numeroONulo(o.desde);
  const hasta = numeroONulo(o.hasta);
  if (valor != null) d.valor = valor;
  if (desde != null) d.desde = desde;
  if (hasta != null) d.hasta = hasta;
  const forma = formaDe(d);
  return forma === "mezclado" || forma === "vacio" ? null : d;
}

/**
 * Una fila de estrategia_preguntas como pregunta del dueño. Una pregunta propuesta o retirada no existe para él (la
 * consulta ya la deja fuera; aquí se descarta por si acaso), y una unidad que no se reconoce se lee como texto: se
 * responde escribiendo, que siempre se puede.
 */
export function preguntaDesdeFila(f: Record<string, unknown>): PreguntaDueno | null {
  const estado = f.estado;
  if (estado !== "enviada" && estado !== "respondida") return null;
  const texto = typeof f.texto === "string" ? f.texto.trim() : "";
  if (!texto || typeof f.id !== "string") return null;
  const unidad = (UNIDADES_PREGUNTA as readonly string[]).includes(String(f.unidad)) ? (f.unidad as UnidadPregunta) : "texto";
  return {
    id: f.id,
    texto,
    unidad,
    estado,
    respuesta: datoDe(f.respuesta),
    respuesta_texto: typeof f.respuesta_texto === "string" && f.respuesta_texto.trim() ? f.respuesta_texto.trim() : null,
    respondida_at: typeof f.respondida_at === "string" ? f.respondida_at : null,
  };
}

/** Un monto en la moneda de la empresa; si su configuración no se entiende, en soles (nunca un fallo en pantalla). */
function dinero(n: number, cfg: ConfigEmpresa): string {
  try {
    return moneda(n, cfg);
  } catch {
    return moneda(n, porDefecto);
  }
}
function cantidad(n: number, cfg: ConfigEmpresa): string {
  try {
    return numero(n, cfg);
  } catch {
    return numero(n, porDefecto);
  }
}

/**
 * Cómo se lee el número que se entendió, dentro de la caja: el dinero con su moneda; lo demás, el número solo (la
 * pregunta ya dice de qué es). Para leerlo fuera de la caja, con su unidad, está `respuestaEnTexto`.
 */
export function formatoDeUnidad(unidad: UnidadPregunta, cfg: ConfigEmpresa = porDefecto): (n: number) => string {
  return unidad === "soles" ? (n) => dinero(n, cfg) : (n) => cantidad(n, cfg);
}

/** La unidad que va después del número, en singular o en plural según el número más alto. */
const SUFIJO: Record<Exclude<UnidadPregunta, "soles" | "texto">, (plural: boolean) => string> = {
  de_cada_10: () => "de cada 10",
  dias: (p) => (p ? "días" : "día"),
  unidades_mes: () => "al mes",
  veces_mes: (p) => (p ? "veces al mes" : "vez al mes"),
  horas_semana: (p) => (p ? "horas a la semana" : "hora a la semana"),
  personas: (p) => (p ? "personas" : "persona"),
};

/**
 * La respuesta del dueño para leerla: «S/ 4,000», «entre 3 y 4 de cada 10», «45 días», «No lo sé», o lo que escribió.
 * null si todavía no respondió: lo que no se dijo no se escribe (ni «0» ni «sin dato»).
 */
export function respuestaEnTexto(p: Pick<PreguntaDueno, "unidad" | "respuesta" | "respuesta_texto">, cfg: ConfigEmpresa = porDefecto): string | null {
  if (p.unidad === "texto") return p.respuesta_texto;
  if (p.respuesta?.estado === "no_lo_se") return "No lo sé";
  const r = rangoDe(p.respuesta);
  if (!r) return p.respuesta_texto;
  if (p.unidad === "soles") return r.bajo === r.alto ? dinero(r.bajo, cfg) : `entre ${dinero(r.bajo, cfg)} y ${dinero(r.alto, cfg)}`;
  const sufijo = SUFIJO[p.unidad](r.alto !== 1);
  return r.bajo === r.alto ? `${cantidad(r.bajo, cfg)} ${sufijo}` : `entre ${cantidad(r.bajo, cfg)} y ${cantidad(r.alto, cfg)} ${sufijo}`;
}

/** ¿Ya la respondió? Un «No lo sé» cuenta como respondida: es una respuesta, no un hueco. */
export const estaRespondida = (p: Pick<PreguntaDueno, "estado">): boolean => p.estado === "respondida";

/** Cuántas le quedan por responder. */
export const faltanPorResponder = (ps: readonly Pick<PreguntaDueno, "estado">[]): number => ps.filter((p) => !estaRespondida(p)).length;

/** El cuerpo que se manda a la ruta al responder: un dato dicho si la pregunta es de un número; texto si es abierta. */
export function cuerpoDeRespuesta(unidad: UnidadPregunta, r: { dato?: DatoOral | null; texto?: string | null }): { respuesta: DatoOral } | { respuesta_texto: string } | null {
  if (unidad === "texto") {
    const t = r.texto?.trim();
    return t ? { respuesta_texto: t } : null;
  }
  return r.dato ? { respuesta: r.dato } : null;
}

/** El tope de un «de cada 10» (la ruta rechaza más); las demás unidades no tienen tope propio. */
export const maximoDe = (unidad: UnidadPregunta): number | undefined => (unidad === "de_cada_10" ? 10 : undefined);

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * El día del calendario del «día N» del camino, con el día 1 el de la aprobación: «19 de octubre». null si no se sabe
 * cuándo se aprobó (la vista previa de la consultora, una copia de la biblioteca): entonces se dice «día N».
 */
export function diaDelCamino(aprobadaAt: string | null | undefined, n: number, zona = "America/Lima"): string | null {
  if (!aprobadaAt || !Number.isFinite(n) || n < 1) return null;
  const desde = new Date(aprobadaAt);
  if (Number.isNaN(desde.getTime())) return null;
  const dia = new Date(desde.getTime() + (Math.floor(n) - 1) * DIA_MS);
  const opciones: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  try {
    return new Intl.DateTimeFormat("es-PE", { ...opciones, timeZone: zona }).format(dia);
  } catch {
    return new Intl.DateTimeFormat("es-PE", { ...opciones, timeZone: "America/Lima" }).format(dia);
  }
}
