/**
 * LO QUE LA PÁGINA DE LA ESTRATEGIA NECESITA PARA PINTARSE (spec-estrategia-8x.md §6.2, §8.1 y §8.3).
 *
 * La página de la consultora (`/empresa/[id]/estrategia`) lee la versión con el servidor y la arma aquí, sin base:
 *  - los ids de la versión, con los nombres que el código escribió para las jugadas («la jugada J2») pasados a su
 *    posición en el camino («la jugada 2»): NINGÚN ID LLEGA A LA PANTALLA, ni a la de la consultora;
 *  - lo que corrigió la consultora frente a lo que escribió 8X, lo que queda por resolver y la página del dueño tal
 *    como la vería al aprobar;
 *  - el lugar de cada cosa en palabras («Camino A, jugada 2: por qué») para los avisos del validador, que hablan con
 *    punteros (`/caminos/a/jugadas/1/por_que`);
 *  - cómo se escribe un texto con cifras en la caja de corregir (marcas.ts: cada `{{id}}` se ve como ⟦S/ 4,100⟧).
 *
 * Puro: sin base, sin red, sin IA. Solo lo usa el servidor (las piezas de cliente reciben los textos ya pintados).
 */
import { refsDeEstrategia, posicionDe, leerIdFoda, type Estrategia, type LetraCamino, type CaminoFinal, type Lente } from "./armar";
import { porResolver, punterosEditados, revisarVersion, type Revision } from "./edicion";
import { vistaParaDueno, PaginaDelDuenoInvalida, FORMATO_PARA_DUENO, type ParaDueno } from "./para-dueno";
import { PATRON_LLAVES, refsEnTexto } from "./texto";
import { TEXTO, ETAPA } from "./textos";
import { CAMPOS_DE_TEXTO, cifrasSinOrigen, referentesEn, textosEn } from "./validador";
import type { ClaseRef, RefValor } from "./paquete";
import type { ResumenVersion, VersionEstrategia, EstadoVersion } from "./datos";
import type { EsperaPregunta } from "./pedidos";

// ─── Los caminos, en palabras ────────────────────────────────────────────────────────────────────

export const LETRAS: readonly LetraCamino[] = ["a", "b"];
export const nombreCamino = (l: LetraCamino): string => (l === "a" ? TEXTO.camino_a : TEXTO.camino_b);
/** «el camino del dinero» / «el camino de la operación»: de qué mirada sale cada cosa. */
export const caminoDeLente = (l: Lente): string => (l === "dinero" ? TEXTO.camino_del_dinero : TEXTO.camino_de_la_operacion);

/**
 * Los ids de jugada que el código escribe en sus textos («la jugada J2», «abre J3») pasados a la posición de esa
 * jugada en su camino («la jugada 2», «abre la jugada 3»). En pantalla las jugadas se numeran por su posición.
 */
export function jugadasEnPalabras(texto: string, c: Pick<CaminoFinal, "jugadas">): string {
  return String(texto ?? "").replace(/(\b[Jj]ugadas?\s+)?\b(?:[ABab]\.)?J([1-9][0-9]?)\b/g, (_todo, previa: string | undefined, n: string) => {
    const pos = posicionDe(c, `J${n}`);
    if (previa) return pos ? `${previa}${pos}` : "una jugada que ya no está en el camino";
    return pos ? `la jugada ${pos}` : "una jugada que ya no está en el camino";
  });
}

/**
 * Los ids de la versión, listos para pintar: los de las proyecciones (`R:`) con sus jugadas nombradas por posición.
 * Lo demás va tal cual (sus nombres ya los escribió el código en palabras de consultora).
 */
export function refsParaPantalla(e: Estrategia, refs: ReadonlyMap<string, RefValor>): Map<string, RefValor> {
  const salida = new Map(refs);
  for (const [id, r] of refs) {
    const m = /^R:([ab])\./.exec(id);
    if (!m) continue;
    const c = e.caminos[m[1] as LetraCamino];
    const limpio = (t: string) => jugadasEnPalabras(t, c);
    salida.set(id, { ...r, nombre: limpio(r.nombre), texto: limpio(r.texto), formula: limpio(r.formula), ...(r.motivo_nulo ? { motivo_nulo: limpio(r.motivo_nulo) } : {}) });
  }
  return salida;
}

// ─── El lugar de cada cosa, en palabras ──────────────────────────────────────────────────────────

const CUADRANTE: Record<string, string> = { f: "fortaleza", d: "debilidad", o: "oportunidad", a: "amenaza" };

const CAMPO: Record<string, string> = {
  que_se_mueve: "lo que se mueve", por_que: "por qué", respuesta_del_mercado: "qué responde el mercado", si_responde_distinto: "qué hacemos si responde distinto", que_abre: "qué abre", conviene_si: "en qué caso conviene",
  responsable: "quién responde", efecto: "su cuenta", refs: "un dato que cita",
  caso: "el caso", por_que_puede_pasar: "por qué puede pasar", solucion: "lo que haremos", senal: "la señal que lo avisa",
  evento: "lo que viene", que_hacemos_antes: "qué hacemos antes", cuando: "cuándo", indicador: "el indicador", mirar_el_dia: "el día en que se mira",
  que_mirar: "qué se mira", si_va_bien: "si va bien", si_no: "si no va", dia: "el día",
  titulo: "el título", pasos: "un paso", te_pedimos: "lo que se le pide",
  nombre: "el nombre", filosofia: "la filosofía",
  dinero: "el dinero que pide", horas_del_dueno: "las horas del dueño", personas: "las personas", herramientas: "las herramientas",
  estrategia: "la estrategia", pregunta_si_no_hay_cuenta: "la pregunta que lo calcularía", recursos: "los recursos",
  cambio_de_estructura: "el cambio de estructura", plazo_dias: "el plazo",
  que: "qué se hace", como_se_mide: "cómo se mide", quien_anota: "quién lo anota", frecuencia: "cada cuánto", base: "desde dónde parte",
  meta_30: "la meta a 30 días", meta_90: "la meta a 90 días",
  que_se_supone: "lo que se supone", rango: "el rango", ancla: "el dato del que parte",
  por_que_importa: "por qué importa", pregunta_si_otra: "la pregunta", clave: "lo que falta",
  objecion: "la objeción", arreglo: "el arreglo", texto: "el texto",
  para_quien: "para quién", resultado_sonado: "el resultado que sueña", probabilidad_percibida: "por qué cree que le va a funcionar",
  tiempo: "cuánto tarda", esfuerzo: "cuánto le cuesta", promesa: "la promesa", garantia: "la garantía", bonos: "un bono",
  urgencia_real: "la urgencia", precio: "el precio", oferta_escrita: "la oferta escrita",
  frase: "la frase", lectura: "la lectura", caja: "la caja", modelo_de_dinero: "cómo entra el dinero", como_entra_hoy: "cómo entra hoy",
  que_falta: "lo que le falta", restriccion: "lo que la frena", cual: "cuál es", por_que_manda: "por qué manda",
  procesos: "los procesos", producto: "el producto", dependencia_del_dueno: "la dependencia del dueño", tiempo_del_dueno: "el tiempo del dueño",
  arbol: "los árboles", problemas: "un problema", causas: "una causa", soluciones: "una solución", medio: "el medio",
  terreno: "el terreno", eliminar: "lo que se elimina", reducir: "lo que se reduce", incrementar: "lo que se incrementa", crear: "lo que se crea",
  donde_ganar_sin_pelear: "dónde ganar sin pelear", canvas: "el canvas", supuestos: "una cifra por confirmar", faltan: "lo que falta saber",
  tows: "un cruce", foda: "el FODA", jugadas: "una jugada", casos: "un caso", camino: "el camino",
};
const campo = (k: string | undefined): string => (k ? CAMPO[k] ?? "un texto" : "");
const conCampo = (base: string, k: string | undefined) => (k ? `${base}: ${campo(k)}` : base);
const n1 = (s: string | undefined) => Number(s) + 1;

/**
 * El lugar de una cosa de la estrategia, dicho a la consultora: `/caminos/a/jugadas/1/por_que` → «Camino A, jugada 2:
 * por qué». Nunca devuelve un id ni un puntero.
 */
export function lugarDe(puntero: string, e?: Pick<Estrategia, "tows" | "supuestos"> | null): string {
  const p = String(puntero ?? "").split("/").filter(Boolean);
  const [a, b, c, d, f] = p;
  switch (a) {
    case "lectura":
      return b != null ? `La lectura, línea ${n1(b)}` : "La lectura";
    case "gran_apuesta":
      return b === "frase" || !b ? "La gran apuesta" : `La gran apuesta: ${campo(b)}`;
    case "foda":
      return b && CUADRANTE[b] ? (c != null ? `El FODA, ${CUADRANTE[b]} ${n1(c)}` : `El FODA: ${CUADRANTE[b]}s`) : "El FODA";
    case "tows": {
      if (b == null) return "Los cruces";
      const q = e?.tows?.[Number(b)]?.cuadrante;
      return conCampo(`El cruce ${n1(b)}${q ? ` (${q})` : ""}`, c);
    }
    case "caminos": {
      if (b !== "a" && b !== "b") return "Los caminos";
      const base = nombreCamino(b);
      if (c === "jugadas") return d != null && /^\d+$/.test(d) ? conCampo(`${base}, jugada ${n1(d)}`, f) : `${base}: sus jugadas`;
      if (c === "casos") return d != null && /^\d+$/.test(d) ? conCampo(`${base}, caso ${n1(d)}`, f) : `${base}: sus casos`;
      if (c === "anticipar") return d != null ? conCampo(`${base}, lo que viene ${n1(d)}`, f) : `${base}: lo que viene`;
      if (c === "senales_tempranas") return d != null ? conCampo(`${base}, señal temprana ${n1(d)}`, f) : `${base}: sus señales tempranas`;
      if (c === "punto_de_decision") return conCampo(`${base}, punto de decisión`, d);
      if (c === "que_pide") return d ? `${base}, qué pide: ${campo(d)}` : `${base}: qué pide`;
      if (c === "para_el_dueno") {
        if (d === "pasos") return f != null ? `${base}, lo que leerá el dueño: paso ${n1(f)}` : `${base}, lo que leerá el dueño: los pasos`;
        if (d === "te_pedimos") return f != null ? `${base}, lo que leerá el dueño: lo que se le pide (${n1(f)})` : `${base}, lo que leerá el dueño: lo que se le pide`;
        return d ? `${base}, lo que leerá el dueño: ${campo(d)}` : `${base}: lo que leerá el dueño`;
      }
      return c ? `${base}: ${campo(c)}` : base;
    }
    case "recomendado":
      return b === "por_que_no_el_otro" ? "Por qué no el otro camino" : "Por qué se recomienda";
    case "victorias_14_dias":
      return b != null ? conCampo(`Victoria ${n1(b)} de los primeros 14 días`, c) : "Las victorias de los primeros 14 días";
    case "oferta":
      return b ? `La oferta: ${campo(b)}` : "La oferta";
    case "medir_desde_el_dia_1":
      return b != null ? conCampo(`Lo que se mide desde el día 1, número ${n1(b)}`, c) : "Lo que se mide desde el día 1";
    case "supuestos": {
      if (b == null) return "Las cifras por confirmar";
      const s = e?.supuestos?.[Number(b)];
      return `La cifra por confirmar ${n1(b)}${s ? ` («${s.que_se_supone}»)` : ""}`;
    }
    case "faltan":
      return b != null ? `Lo que falta saber, número ${n1(b)}` : "Lo que falta saber";
    case "por_que_no_llega":
      return "Por qué no llega a duplicar";
    case "objeciones":
      return b != null ? conCampo(`Lo que se le objetó, número ${n1(b)}`, c) : "Lo que se le objetó";
    case "anexos":
      if (b === "dinero") return c ? `Cómo lo ve ${TEXTO.camino_del_dinero}: ${campo(c)}` : `Cómo lo ve ${TEXTO.camino_del_dinero}`;
      if (b === "terreno") return c ? `Cómo lo ve ${TEXTO.camino_de_la_operacion}: ${campo(c)}` : `Cómo lo ve ${TEXTO.camino_de_la_operacion}`;
      return "El análisis";
    case "lente_dinero":
      return `Lo que propuso ${TEXTO.camino_del_dinero}${b ? `: ${campo(b)}` : ""}`;
    case "lente_terreno":
      return `Lo que propuso ${TEXTO.camino_de_la_operacion}${b ? `: ${campo(b)}` : ""}`;
    case "equipo_rojo":
      return `${ETAPA.rojo.nombre.charAt(0).toUpperCase()}${ETAPA.rojo.nombre.slice(1)}${b ? `: ${campo(b)}` : ""}`;
    case "camino_elegido":
      return "El camino elegido";
    default:
      return "Otra parte de la estrategia";
  }
}

// ─── Sin ids en lo que escribió el código ────────────────────────────────────────────────────────

const RE_PUNTERO_ENTRE_PARENTESIS = /\((\/[a-z][a-z0-9_]*(?:\/[a-z0-9_]+)+)\)/g;
const RE_PUNTERO = /(?<![\w/])(\/[a-z][a-z0-9_]*(?:\/[a-z0-9_]+)+)/g;
const RE_REF = /«?\b(?:N|L|G|B|K|F|P|D|Q|T|Z|X|C|S|R):[A-Za-z0-9_.:@-]+»?/g;
const RE_SUPUESTO = /«?\bS[ABR][1-9][0-9]?\b»?/g;
const RE_FODA = /«?\b[AB]\.[FDOA][1-9]\b»?/g;
const RE_CRUCE = /«?\b[AB]\.T[1-9]\b»?/g;
const RE_JUGADA = /«?\b(?:[ABab]\.)?J[1-9][0-9]?\b»?/g;

/**
 * Un texto que escribió el código (un aviso del validador, un ítem de la lista de control, lo que 8X quitó) sin los
 * símbolos del código: el lugar va en palabras y un id suelto se dice «un dato». Lo que no trae ids queda igual.
 */
export function sinIds(texto: string | null | undefined, e?: Pick<Estrategia, "tows" | "supuestos"> | null): string {
  return String(texto ?? "")
    .replace(PATRON_LLAVES, "un dato")
    .replace(RE_PUNTERO_ENTRE_PARENTESIS, (_t, p: string) => `(${lugarDe(p, e)})`)
    .replace(RE_PUNTERO, (_t, p: string) => lugarDe(p, e))
    .replace(RE_REF, "un dato")
    .replace(RE_SUPUESTO, "una cifra por confirmar")
    .replace(RE_FODA, "un punto del FODA")
    .replace(RE_CRUCE, "un cruce")
    .replace(RE_JUGADA, "una jugada")
    // Los nombres del código no salen a la pantalla (§8.3): «lente» y «equipo rojo» se dicen como los ve la consultora.
    .replace(/\b([Ee])l equipo rojo\b/g, (_t, e: string) => `${e === "E" ? "L" : "l"}a prueba de los dos caminos`)
    .replace(/\bequipo rojo\b/gi, "prueba de los dos caminos")
    .replace(/\blas dos lentes\b/gi, "los dos caminos")
    .replace(/\b([Ll])a lente\b/g, (_t, l: string) => `${l === "L" ? "E" : "e"}l camino`)
    .replace(/\b([Uu])na lente\b/g, (_t, u: string) => `${u === "U" ? "U" : "u"}n camino`)
    .replace(/\blentes\b/gi, "caminos")
    .replace(/\blente\b/gi, "camino");
}

/** ¿Trae un texto algo que parezca un id del código? (Lo usan las pruebas y la página para no dejar pasar ninguno.) */
export const PATRON_ID_A_LA_VISTA = /\{\{|\b(?:N|L|G|B|K|F|P|D|Q|T|Z|X|C|S|R):[A-Za-z0-9_]|\bS[ABR][1-9]\b|\b[AB]\.[FDOATJ][1-9]\b|\bJ[1-9][0-9]?\b/;

// ─── La caja de corregir: las cifras de 8X entre ⟦ ⟧ ────────────────────────────────────────────

export { aEditable, deEditable, type Marca } from "./marcas";

// ─── Lo que espera cada respuesta ────────────────────────────────────────────────────────────────

/** «a.J2» → «Camino A, jugada 2»; «A.T1» → «el cruce FO». Lo que ya no está en la versión no se nombra. */
export function esperanEnPalabras(esperan: readonly string[], e: Pick<Estrategia, "caminos" | "tows">): string[] {
  const salida: string[] = [];
  for (const x of esperan) {
    const j = /^([ab])\.(J\d+)$/.exec(x);
    if (j) {
      const pos = posicionDe(e.caminos[j[1] as LetraCamino], j[2]!);
      if (pos) salida.push(`${nombreCamino(j[1] as LetraCamino)}, jugada ${pos}`);
      continue;
    }
    const t = e.tows.find((c) => c.de === x);
    if (t) salida.push(`el cruce ${t.cuadrante}`);
  }
  return [...new Set(salida)];
}

/** Lo que espera una pregunta guardada (estrategia_preguntas.espera), dicho contra la versión que se está viendo. */
export function esperaEnPalabras(espera: readonly EsperaPregunta[] | null | undefined, e: Pick<Estrategia, "caminos" | "tows">, version: number): string[] {
  const deEsta = (espera ?? []).filter((x) => x.version === version).map((x) => (x.camino ? `${x.camino}.${x.jugada}` : x.jugada));
  const otras = new Set((espera ?? []).filter((x) => x.version !== version).map((x) => x.version));
  return [...esperanEnPalabras(deEsta, e), ...[...otras].sort((a, b) => a - b).map((v) => `una jugada de la versión ${v}`)];
}

/** El texto de un punto del FODA de una lente (para nombrar lo que cruza un cruce): «A.F1» → su texto, o null. */
export function textoDeFoda(id: string, lentes: { dinero: { foda: Record<string, { texto: string }[]> } | null; terreno: { foda: Record<string, { texto: string }[]> } | null }): string | null {
  const l = leerIdFoda(id);
  if (!l) return null;
  const salida = l.lente === "A" ? lentes.dinero : lentes.terreno;
  return salida?.foda?.[l.cuadrante]?.[l.n - 1]?.texto ?? null;
}

/**
 * El texto de un punto del FODA que cruza un cruce, VALIDADO (revisión del 17-10): el del FODA final si el punto está
 * en él (ese pasó por el validador); si no, el de su lente solo si no trae cifras sin origen, ids que no existen ni
 * nombres de autores. Lo que no pasa no se muestra: nada de la lente llega a la pantalla sin revisar.
 */
export function textoDeFodaSeguro(id: string, e: Pick<Estrategia, "foda">, lentes: Parameters<typeof textoDeFoda>[1], refs: ReadonlyMap<string, RefValor>): string | null {
  const final = Object.values(e.foda).flat().find((i) => i.de === id);
  if (final) return final.texto;
  const t = textoDeFoda(id, lentes);
  if (!t) return null;
  if (cifrasSinOrigen(t).length || refsEnTexto(t).some((r) => !refs.has(r)) || referentesEn(t).length) return null;
  return t;
}

// ─── De dónde sale lo que deja un camino ─────────────────────────────────────────────────────────

const ORIGEN_UNO: Record<ClaseRef, [string, string]> = {
  hecho: ["hecho", "hechos"],
  estimado: ["estimado del dueño", "estimados del dueño"],
  supuesto: ["cifra por confirmar", "cifras por confirmar"],
  sin_dato: ["dato que falta", "datos que faltan"],
};

/**
 * De dónde sale lo que deja un camino, contado en una línea («Sale de 4 estimados del dueño y 3 cifras por
 * confirmar.»), y la lista entera para el panel que se abre al tocar (revisión del 17-10: debajo del número había un
 * párrafo gris con nueve insumos en una sola frase).
 */
export function conteoDeOrigen(origen: readonly { nombre: string; clase: ClaseRef }[]): { linea: string; lista: { nombre: string; clase: ClaseRef }[] } {
  const vistos = new Map<string, ClaseRef>();
  for (const o of origen) if (!vistos.has(o.nombre)) vistos.set(o.nombre, o.clase);
  const lista = [...vistos.entries()].map(([nombre, clase]) => ({ nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), clase }));
  const partes = (["hecho", "estimado", "supuesto", "sin_dato"] as const)
    .map((k) => ({ k, n: lista.filter((x) => x.clase === k).length }))
    .filter((x) => x.n > 0)
    .map(({ k, n }) => `${n} ${ORIGEN_UNO[k][n === 1 ? 0 : 1]}`);
  if (!partes.length) return { linea: "", lista };
  const juntas = partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  return { linea: `Sale de ${juntas}.`, lista };
}

// ─── Qué versión se abre ─────────────────────────────────────────────────────────────────────────

/**
 * La versión que abre la página: la pedida con `?v=N` o, si no se pide ninguna, la más nueva que no se descartó (una
 * generación descartada no tapa la estrategia que ya había). null = no hay ninguna que mostrar.
 */
export function elegirVersion(versiones: readonly ResumenVersion[], v?: number | null): ResumenVersion | null | "no_existe" {
  if (v != null) return versiones.find((x) => x.version === v) ?? "no_existe";
  return versiones.find((x) => x.estado !== "descartada") ?? null;
}

// ─── Los datos que cita la estrategia ────────────────────────────────────────────────────────────

/** Todos los ids que cita lo vigente: en sus textos y en sus listas de datos. */
export function idsCitados(e: Estrategia): Set<string> {
  const ids = new Set<string>();
  for (const { texto } of textosEn(e, CAMPOS_DE_TEXTO)) for (const id of refsEnTexto(texto)) ids.add(id);
  const mirar = (x: unknown, clave: string | null): void => {
    if (clave === "proyeccion" || clave === "impacto" || clave === "cambiadas" || clave === "cuentas" || clave === "quitado" || clave === "problemas") return;
    if (Array.isArray(x)) x.forEach((y) => (clave === "refs" && typeof y === "string" ? ids.add(y) : mirar(y, null)));
    else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) mirar(y, k);
  };
  mirar(e, null);
  return ids;
}

// ─── La vista entera ─────────────────────────────────────────────────────────────────────────────

/** Una pregunta para el dueño, como la ve la consultora (estrategia_preguntas, sin lo que no hace falta). */
export type PreguntaFila = {
  id: string;
  texto: string;
  por_que: string | null;
  estado: "propuesta" | "enviada" | "respondida" | "retirada";
  espera: EsperaPregunta[];
  respondida_at: string | null;
};

export type VistaEstrategia = {
  companyId: string;
  v: VersionEstrategia;
  /** Lo vigente: lo que escribió 8X con lo que corrigió la consultora. */
  e: Estrategia;
  salida: Estrategia | null;
  /** Los ids de la versión, listos para pintar (sin ids de jugada en sus nombres). */
  refs: Map<string, RefValor>;
  /** Los textos que corrigió la consultora (difieren de lo que escribió 8X). */
  editados: Set<string>;
  /** Se corrige con el lápiz: solo una versión lista o con observaciones (§7.3). */
  editable: boolean;
  revision: Revision;
  /** Lo que falta resolver antes de aprobar: cada error y cada cosa quitada sin resolver, una vez por lugar. */
  pendientes: { puntero: string; lugar: string; texto: string }[];
  /** La página que vería el dueño con el camino elegido, o por qué no se puede aprobar así. */
  paraDueno: { ok: true; p: ParaDueno } | { ok: false; problemas: string[] } | null;
  /** La página que ya ve (o vio) el dueño: la congelada al aprobar. */
  congelada: ParaDueno | null;
  /** El camino elegido tiene jugadas corregidas y su página del dueño no: hay que revisarla antes de aprobar. */
  duenoSinRevisar: boolean;
  preguntas: PreguntaFila[];
};

/** ¿Hay en `editados` algún texto bajo este prefijo? */
const hayEditados = (editados: ReadonlySet<string>, prefijo: string) => [...editados].some((p) => p.startsWith(prefijo));

/**
 * Arma lo que pinta la página para una versión que ya tiene su estrategia (lista, con observaciones, aprobada o
 * reemplazada). Vuelve a revisar lo vigente aquí: el veredicto guardado puede ser de antes de la última corrección.
 */
export function armarVista(x: { companyId: string; v: VersionEstrategia; preguntas?: PreguntaFila[] }): VistaEstrategia | null {
  const { v } = x;
  if (!v.vigente) return null;
  const e = v.vigente;
  const base = refsDeEstrategia(e, v.paquete, v.calculos);
  const refs = refsParaPantalla(e, base);
  const editados = punterosEditados(v.salida, e);
  const editable = v.estado === "lista" || v.estado === "con_observaciones";
  const revision = revisarVersion(e, v.salida, v.paquete, v.calculos);
  const pendientes = porResolver(e, revision.validacion).map((p) => ({ puntero: p.puntero, lugar: lugarDe(p.puntero, e), texto: sinIds(p.texto, e) }));

  let paraDueno: VistaEstrategia["paraDueno"] = null;
  if (v.camino_elegido) {
    try {
      paraDueno = { ok: true, p: vistaParaDueno(e, v.camino_elegido, base) };
    } catch (err) {
      if (err instanceof PaginaDelDuenoInvalida) paraDueno = { ok: false, problemas: err.problemas.map((t) => sinIds(t, e)) };
      else throw err;
    }
  }
  const guardada = v.para_dueno as ParaDueno | null;
  const congelada = guardada && typeof guardada === "object" && guardada.formato === FORMATO_PARA_DUENO ? guardada : null;
  const l = v.camino_elegido;
  const duenoSinRevisar = !!l && hayEditados(editados, `/caminos/${l}/jugadas/`) && !hayEditados(editados, `/caminos/${l}/para_el_dueno/`);
  return { companyId: x.companyId, v, e, salida: v.salida, refs, editados, editable, revision, pendientes, paraDueno, congelada, duenoSinRevisar, preguntas: x.preguntas ?? [] };
}

/** El estado de una versión, dicho a la consultora, y la clase de su chip. */
export const ESTADO_VERSION: Record<EstadoVersion, { texto: string; clase: "ok" | "espera" | "alto" | "neutro" }> = {
  en_curso: { texto: "generándose", clase: "neutro" },
  lista: { texto: "lista para elegir y aprobar", clase: "espera" },
  con_observaciones: { texto: "con cosas por resolver", clase: "alto" },
  aprobada: { texto: "aprobada · la ve tu cliente", clase: "ok" },
  reemplazada: { texto: "reemplazada", clase: "neutro" },
  descartada: { texto: "descartada", clase: "neutro" },
};
