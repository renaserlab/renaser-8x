/**
 * CÓMO SE PINTAN LAS CIFRAS (spec-estrategia-8x.md §6.2).
 *
 * El modelo escribe cada cifra como `{{id}}`; aquí ese id se cambia por lo que vale, ya escrito con la moneda de la
 * empresa, y por un chip que dice de dónde sale. `pintar` parte el texto en trozos que la pantalla dibuja:
 *  - `texto`: lo que se lee tal cual.
 *  - `cifra`: un número con su chip. Para la consultora: «Hecho», «Estimado del dueño», «Supuesto · por confirmar» o
 *    «Cálculo», y al tocarla, qué es y cómo se calcula. Para el dueño: «lo que nos dijiste», «estimado» o «por
 *    confirmar». Lo que no tiene valor se pinta «sin dato» y rayado para la consultora: nunca «S/ 0».
 *  - `mencion`: un id que es una descripción y no un número (una línea de lo que vende, un proceso, una afirmación):
 *    se escribe su texto.
 *  - `falta`: solo para el dueño. Un número que todavía no se puede calcular no se pinta: se dice que falta.
 * NINGÚN ID LLEGA A LA PANTALLA: ni la consultora ni el dueño ven «SA2» ni «C:poder.precio».
 *
 * Puro: sin base, sin red. Lo puede importar un componente de cliente (solo tipos de paquete.ts).
 */
import type { ClaseRef, RefValor } from "./paquete";
import { CHIP_CONSULTORA, CHIP_DUENO, TEXTO } from "./textos";

/** Un `{{id}}` dentro de un texto. Las llaves vacías o con algo raro dentro también se capturan (el validador las rechaza). */
export const PATRON_LLAVES = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Los ids citados en un texto, en el orden en que aparecen (con repetidos). */
export function refsEnTexto(texto: string | null | undefined): string[] {
  return [...String(texto ?? "").matchAll(PATRON_LLAVES)].map((m) => m[1]!);
}

export type Para = "consultora" | "dueno";
export type Detalle = { etiqueta: string; texto: string };

export type Trozo =
  | { t: "texto"; texto: string }
  | { t: "cifra"; texto: string; chip: string; clase: ClaseRef | "consultora"; rayado: boolean; detalle: Detalle[]; provisional?: true }
  | { t: "mencion"; texto: string; detalle: Detalle[] }
  | { t: "falta"; texto: string };

/** Lo que el dueño lee donde va un número que todavía no se puede calcular. */
export const FALTA_PARA_DUENO = "lo calculamos en cuanto tengamos el dato";

/**
 * El chip de una cifra para la consultora: el de su clase, o «Supuesto» si es una apuesta. Una cuenta del código dice
 * también de qué sale, por lo más débil que usa: «Cálculo» (con hechos), «Cálculo · con estimados» o «Proyección · por
 * confirmar» (descansa en un supuesto). Así el color y la palabra dicen lo mismo.
 */
export function chipConsultora(id: string, r: Pick<RefValor, "clase">): string {
  if (id.startsWith("S:")) return CHIP_CONSULTORA.supuesto;
  if (id.startsWith("C:") || id.startsWith("R:")) return r.clase === "supuesto" ? CHIP_CONSULTORA.proyeccion : r.clase === "estimado" ? CHIP_CONSULTORA.calculo_estimado : CHIP_CONSULTORA.calculo;
  return r.clase === "hecho" ? CHIP_CONSULTORA.hecho : r.clase === "estimado" ? CHIP_CONSULTORA.estimado : r.clase === "supuesto" ? CHIP_CONSULTORA.supuesto : CHIP_CONSULTORA.sin_dato;
}

const NOMBRE_CLASE: Record<ClaseRef, string> = { hecho: "sale de hechos", estimado: "sale de estimados del dueño", supuesto: "depende de supuestos por confirmar", sin_dato: "sin dato" };

function detalleDe(id: string, r: RefValor): Detalle[] {
  const d: Detalle[] = [{ etiqueta: "Qué es", texto: r.nombre }];
  if (r.valor == null && r.motivo_nulo) d.push({ etiqueta: "Por qué no hay cifra", texto: r.motivo_nulo });
  if (id.startsWith("S:")) d.push({ etiqueta: "Lo que se supone", texto: r.formula });
  else if (id.startsWith("C:") || id.startsWith("R:")) {
    d.push({ etiqueta: "Cómo se calcula", texto: r.formula });
    if (r.valor != null) d.push({ etiqueta: "Qué tan firme es", texto: NOMBRE_CLASE[r.clase] });
  } else d.push({ etiqueta: "De dónde sale", texto: r.formula });
  if (r.provisional) d.push({ etiqueta: "Ojo", texto: CHIP_CONSULTORA.provisional });
  return d;
}

/** Una cifra escrita a mano por la consultora dentro de su texto (no viene de un `{{id}}`). */
const CIFRA_A_MANO = /(?:S\/\s?|\$\s?)?\d[\d.,]*(?:\s?%)?/g;

function trozosDeTextoPlano(texto: string, para: Para, escritoPorConsultora: boolean): Trozo[] {
  if (!texto) return [];
  if (!escritoPorConsultora || para !== "consultora") return [{ t: "texto", texto }];
  const salida: Trozo[] = [];
  let desde = 0;
  for (const m of texto.matchAll(CIFRA_A_MANO)) {
    if (m.index! > desde) salida.push({ t: "texto", texto: texto.slice(desde, m.index) });
    salida.push({ t: "cifra", texto: m[0], chip: CHIP_CONSULTORA.escrito_por_consultora, clase: "consultora", rayado: false, detalle: [{ etiqueta: "De dónde sale", texto: CHIP_CONSULTORA.escrito_por_consultora }] });
    desde = m.index! + m[0].length;
  }
  if (desde < texto.length) salida.push({ t: "texto", texto: texto.slice(desde) });
  return salida;
}

/**
 * Parte un texto con `{{id}}` en trozos para pintarlo. `refs` son los ids de la versión (paquete, cálculos, supuestos y
 * proyecciones). Un id que no está en `refs` no se muestra: se pinta «sin dato» (el validador ya lo rechazó antes).
 * `escritoPorConsultora`: el texto lo corrigió la consultora; sus cifras a mano llevan el chip «Escrito por la consultora».
 */
export function pintar(texto: string | null | undefined, refs: ReadonlyMap<string, RefValor>, para: Para, opciones: { escritoPorConsultora?: boolean } = {}): Trozo[] {
  const t = String(texto ?? "");
  const salida: Trozo[] = [];
  let desde = 0;
  for (const m of t.matchAll(PATRON_LLAVES)) {
    salida.push(...trozosDeTextoPlano(t.slice(desde, m.index), para, !!opciones.escritoPorConsultora));
    desde = m.index! + m[0].length;
    const id = m[1]!;
    const r = refs.get(id);
    if (!r) {
      salida.push(para === "dueno" ? { t: "falta", texto: FALTA_PARA_DUENO } : { t: "cifra", texto: TEXTO.sin_dato, chip: CHIP_CONSULTORA.sin_dato, clase: "sin_dato", rayado: true, detalle: [{ etiqueta: "Por qué no hay cifra", texto: "8X no encontró este dato en la versión" }] });
      continue;
    }
    // Una descripción (una línea, un proceso, una afirmación, un conteo en palabras): se escribe su texto.
    if (r.valor == null && r.unidad === "texto" && !r.motivo_nulo) {
      salida.push({ t: "mencion", texto: r.texto, detalle: [{ etiqueta: "De dónde sale", texto: r.formula }] });
      continue;
    }
    if (r.valor == null) {
      salida.push(para === "dueno" ? { t: "falta", texto: FALTA_PARA_DUENO } : { t: "cifra", texto: TEXTO.sin_dato, chip: CHIP_CONSULTORA.sin_dato, clase: "sin_dato", rayado: true, detalle: detalleDe(id, r) });
      continue;
    }
    if (para === "dueno") {
      const chip = r.clase === "hecho" ? CHIP_DUENO.hecho : r.clase === "estimado" ? CHIP_DUENO.estimado : CHIP_DUENO.supuesto;
      salida.push({ t: "cifra", texto: r.texto, chip, clase: r.clase, rayado: false, detalle: [] });
      continue;
    }
    salida.push({ t: "cifra", texto: r.texto, chip: chipConsultora(id, r), clase: r.clase, rayado: false, detalle: detalleDe(id, r), ...(r.provisional ? { provisional: true as const } : {}) });
  }
  salida.push(...trozosDeTextoPlano(t.slice(desde), para, !!opciones.escritoPorConsultora));
  // Junta los trozos de texto seguidos (más fácil de dibujar y de comparar).
  return salida.reduce<Trozo[]>((acc, x) => {
    const previo = acc[acc.length - 1];
    if (x.t === "texto" && previo?.t === "texto") previo.texto += x.texto;
    else if (!(x.t === "texto" && !x.texto)) acc.push(x);
    return acc;
  }, []);
}

/** Los trozos como una sola línea de texto (para buscar palabras, comparar o leer en una prueba). */
export function textoDeTrozos(trozos: readonly Trozo[]): string {
  return trozos.map((x) => x.texto).join("");
}

/** Un texto ya pintado, de una vez: lo que lee la persona, sin chips. */
export const textoPintado = (texto: string | null | undefined, refs: ReadonlyMap<string, RefValor>, para: Para): string => textoDeTrozos(pintar(texto, refs, para));
