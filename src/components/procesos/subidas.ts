/**
 * SUBIR EN CADA PARTE (16-10-2026): cómo se nombra el estado de un archivo subido y qué texto se manda a dibujar.
 *
 * Kelin: «después debe poder subir sus archivos en cada parte que corresponde: si tiene organigrama, manuales; si está
 * dibujando procesos, subir sus archivos allí, importarlo y dibujarlo para mejorarlo». Aquí vive lo que comparten las
 * pantallas (del navegador y del servidor) y las rutas: los tres estados de una subida, sus rótulos para el dueño y
 * para la consultora, y el texto que se le pasa al dibujo.
 *
 * Puro: sin base, sin red, sin nada de servidor. Lo puede importar un componente «use client».
 */
import { pasaPorRevision } from "@/lib/documentos/fidelidad";

/**
 * Un archivo subido, con lo justo para decir en qué va. `estado` y `revision` son las columnas de `sources`:
 * estado subido | leyendo | leido | error; revision pendiente | consolidada | null (null = no pasa por revisión).
 */
export type FuenteSubida = {
  id: string;
  nombre: string;
  tipo: string | null;
  estado: string | null;
  revision: string | null;
  origen?: string | null;
  created_at: string | null;
  process_id?: string | null;
};

/** Las columnas que se leen de `sources` para decir el estado de una subida. Ni el contenido ni la ruta del archivo. */
export const COLUMNAS_FUENTE_SUBIDA = "id,nombre,tipo,estado,revision,origen,created_at,process_id";

/**
 * Los estados de una subida, en el orden en que pasan:
 *  - «subido»: llegó y se está leyendo (o espera turno para leerse);
 *  - «por_revisar»: se leyó y la consultora todavía no lo revisó (solo documentos y tablas pasan por su revisión);
 *  - «listo»: leído, y revisado si le tocaba revisión;
 *  - «no_se_pudo»: la lectura terminó en error. Se dice, con qué hacer; nunca se queda «leyendo» callado.
 */
export type EstadoSubida = "subido" | "por_revisar" | "listo" | "no_se_pudo";

export function estadoSubida(f: Pick<FuenteSubida, "tipo" | "estado" | "revision">): EstadoSubida {
  if (f.estado === "error") return "no_se_pudo";
  if (f.estado !== "leido") return "subido";
  // Solo `pendiente` espera revisión. Una foto, un audio o una nota nunca pasan por la pantalla de revisión
  // (pasaPorRevision): al terminar de leerse ya no esperan nada de nadie.
  if (f.revision === "pendiente" && pasaPorRevision(f.tipo)) return "por_revisar";
  return "listo";
}

/** ¿Se puede mandar a dibujar? Cuando terminó de leerse, esté o no revisado. */
export const sePuedeDibujar = (e: EstadoSubida): boolean => e === "por_revisar" || e === "listo";

/** El color del chip: clases `.estado` de src/design/tablero.css. */
export type ClaseEstado = "neutro" | "espera" | "ok" | "alto";

/**
 * Cómo se dice cada estado. «documento» es un archivo que se queda como respaldo (organigrama, manual); «dibujar» es
 * el archivo de un proceso que todavía hay que dibujar: ahí lo que le importa al dueño es si ya se puede dibujar, no
 * si la consultora lo revisó.
 */
export function rotuloSubida(e: EstadoSubida, modo: "dueno" | "consultora", contexto: "documento" | "dibujar" = "documento"): { texto: string; clase: ClaseEstado } {
  if (e === "no_se_pudo") return { texto: modo === "dueno" ? "No pudimos leerlo" : "No se pudo leer", clase: "alto" };
  if (e === "subido") return { texto: modo === "dueno" ? "Subido: lo estamos leyendo" : "Subido: en lectura", clase: "neutro" };
  if (contexto === "dibujar") {
    if (modo === "dueno") return { texto: "Leído: listo para dibujar", clase: "ok" };
    return e === "por_revisar" ? { texto: "Leído · por revisar en Fuentes", clase: "espera" } : { texto: "Leído · listo para dibujar", clase: "ok" };
  }
  if (e === "por_revisar") return { texto: modo === "dueno" ? "Por revisar: tu consultora lo revisa" : "Por revisar", clase: "espera" };
  return { texto: "Listo", clase: "ok" };
}

/** Qué hacer cuando no se pudo leer. Al dueño, en sus palabras; a la consultora, dónde está el motivo. */
export const QUE_HACER_NO_SE_PUDO = {
  dueno: "Súbelo otra vez, mejor en PDF, Word o una foto con buena luz; o cuéntalo con tu voz en «Cuéntanos un proceso».",
  consultora: "El motivo está en Fuentes; desde ahí se vuelve a leer.",
} as const;

/** Los archivos que se aceptan para un proceso: foto, PDF, Word o Excel (los mismos que lee src/lib/archivos.ts). */
export const ACEPTA_ARCHIVO_PROCESO =
  ".pdf,.docx,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Un proceso de la empresa que existe pero no está dibujado, con sus archivos del más nuevo al más viejo. */
export type ProcesoPorDibujar = { id: string; nombre: string; area: string | null; archivos: FuenteSubida[] };

// ─────────────────────── El texto que se manda a dibujar ───────────────────────

/** El mismo tope que /api/processes/generate: es texto que se le manda al modelo y se paga por letra. */
export const MAX_TEXTO_DIBUJO = 8000;
/** Lo que ya se sabía del proceso (la descripción de la lista, lo que se dictó) entra, pero sin comerse el archivo. */
const MAX_PREVIA = 1500;

export const TEXTOS_DIBUJO = {
  leyendo: "Todavía estamos leyendo el archivo. Vuelve en un momento.",
  sinTexto: "Este archivo no trae texto que podamos leer. Cuéntalo con tu voz y lo dibujamos.",
  noSeLeyo: "No pudimos leer este archivo. Súbelo otra vez (mejor en PDF, Word o una foto con buena luz) o cuéntalo con tu voz y lo dibujamos.",
  ajeno: "Ese archivo no es de este proceso.",
  yaDibujado: "Este proceso ya está dibujado. Si lo dibujamos otra vez con el archivo, lo que está dibujado se reemplaza: confírmalo para seguir.",
  rediseno: "Esto es el rediseño de un proceso: se dibuja desde el proceso de hoy, no desde un archivo.",
  soloDuenoOLider: "Esto lo hace el dueño de la empresa, alguien a quien él se lo encargó, o la consultora.",
  confirmado: "Este proceso ya está confirmado: no se vuelve a dibujar con un archivo. Si cambió, díselo a tu consultora.",
  conTrabajo: "Tu consultora ya trabajó sobre este proceso (su rediseño o su procedimiento escrito): no se vuelve a dibujar con un archivo. Si cambió, díselo a ella.",
  sinCopia: "No pudimos guardar una copia de cómo está dibujado ahora, así que no lo volvimos a dibujar. Inténtalo de nuevo en un momento.",
} as const;

export type FragmentoTexto = { texto: string | null; pagina?: number | null; audio_desde?: number | null };

/**
 * El texto de una fuente: su contenido si lo tiene (Word, Excel, texto, la transcripción de un audio) o, si no (PDF,
 * foto), los fragmentos que se citaron al leerla, en orden de página y, dentro de la página, de minuto. Sin repetir el
 * mismo fragmento dos veces. Vacío si no hay nada: eso es «no trae texto», nunca un texto inventado.
 */
export function textoDeFuente(contenido: string | null | undefined, fragmentos: FragmentoTexto[] = []): string {
  const c = (contenido ?? "").trim();
  if (c) return c;
  const orden = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER);
  const vistos = new Set<string>();
  return fragmentos
    .map((f, i) => ({ t: (f.texto ?? "").trim(), p: orden(f.pagina), a: orden(f.audio_desde), i }))
    .filter((f) => f.t)
    .sort((x, y) => x.p - y.p || x.a - y.a || x.i - y.i)
    .filter((f) => (vistos.has(f.t) ? false : (vistos.add(f.t), true)))
    .map((f) => f.t)
    .join("\n");
}

const INICIO = "Proceso: «";
const PREVIA = "Lo que ya se sabía de este proceso:\n";
const ARCHIVO = "\n\nLo que dice el archivo «";

/**
 * Lo que ya se sabía, sin anidar. Si la descripción guardada es una que armamos aquí (el proceso ya se dibujó antes con
 * un archivo), lo que se sabía antes es su bloque «Lo que ya se sabía»; el texto del archivo anterior no se arrastra.
 */
export function loQueYaSeSabia(previa: string | null | undefined): string | null {
  const p = (previa ?? "").trim();
  if (!p) return null;
  if (!p.startsWith(INICIO)) return p;
  const i = p.indexOf(PREVIA);
  if (i < 0) return null;
  const desde = i + PREVIA.length;
  const hasta = p.indexOf(ARCHIVO, desde);
  const dentro = (hasta < 0 ? p.slice(desde) : p.slice(desde, hasta)).trim();
  return dentro || null;
}

/**
 * La descripción que se encola para dibujar: el nombre del proceso, lo que ya se sabía (para que el dibujo no lo pierda:
 * el trabajo de dibujo la guarda como descripción original) y el texto del archivo. Nunca pasa de MAX_TEXTO_DIBUJO; si
 * el archivo no cabe se recorta y se dice cuánto entró.
 */
export function armarDescripcion(o: { nombre: string; previa?: string | null; archivo: string; texto: string }): {
  descripcion: string;
  recortado: boolean;
  letrasArchivo: number;
  letrasUsadas: number;
} {
  let previa = loQueYaSeSabia(o.previa);
  if (previa && previa.length > MAX_PREVIA) previa = `${previa.slice(0, MAX_PREVIA).trimEnd()}…`;
  const cabeza = `${INICIO}${o.nombre.trim()}».${previa ? `\n\n${PREVIA}${previa}` : ""}${ARCHIVO}${o.archivo.trim()}»:\n`;
  const texto = o.texto.trim();
  const cabe = Math.max(0, MAX_TEXTO_DIBUJO - cabeza.length);
  const recortado = texto.length > cabe;
  const usado = recortado ? texto.slice(0, cabe) : texto;
  return { descripcion: cabeza + usado, recortado, letrasArchivo: texto.length, letrasUsadas: usado.length };
}

/** El aviso de recorte, en palabras: cuánto entró y qué hacer con el resto. */
export function avisoRecorte(letrasUsadas: number, letrasArchivo: number): string {
  const f = (n: number) => n.toLocaleString("es-PE");
  return `El archivo es largo: lo dibujamos con las primeras ${f(letrasUsadas)} letras de ${f(letrasArchivo)}. Lo que quedó fuera lo puedes agregar a mano en el dibujo.`;
}

/** «Área» → «area»; «Atención  de pedidos» → «atencion de pedidos». Así se comparan los nombres de procesos. */
export const normalizarNombre = (s: string): string =>
  s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();
