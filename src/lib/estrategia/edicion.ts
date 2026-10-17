/**
 * LO QUE CORRIGE LA CONSULTORA (spec-estrategia-8x.md §6.3, último párrafo; §7.3 y §8.1, punto 4).
 *
 * La consultora corrige en el lugar: un texto (el lápiz junto a cada uno), el rango de una cifra por confirmar (dos
 * cajas), aceptar que se quite lo que 8X quitó, o volver a lo que escribió 8X. Todo cambia `vigente`; `salida` —lo que
 * escribió 8X— nunca se toca, y de la diferencia entre las dos sale qué textos son de ella: su cifra a mano no es error,
 * es aviso con el chip «Escrito por la consultora». Cada cambio vuelve a pasar por el validador y por la lista de
 * control, y el estado sale de ahí: resuelto el último error, la versión vuelve a «lista» (sin eso, aprobar_estrategia
 * nunca la aceptaría).
 *
 * Solo se corrige lo que lista CAMPOS_EDITABLES: todos los textos de la estrategia menos lo que falta saber (esas
 * preguntas se retocan como preguntas, en estrategia_preguntas, antes de enviarlas).
 *
 * Puro: sin base, sin red, sin IA. La ruta (src/app/api/companies/[id]/estrategia/[eid]/route.ts) guarda y deja el
 * rastro en estrategia_ediciones.
 */
import type { Paquete } from "./paquete";
import type { Calculos } from "./calculos";
import { problemaDeSupuesto, refsDeEstrategia, reproyectar, resolverQuien, type Estrategia } from "./armar";
import { CAMPOS_DE_TEXTO, estadoDeRevision, partesDeLineas, resolverQuitado, textosEn, validar, type Validacion } from "./validador";
import { revisarCalidad, type ResultadoControl } from "./calidad";
import { API } from "./textos";

// ─── Qué se corrige ──────────────────────────────────────────────────────────────────────────────

/** Los textos que la consultora corrige con el lápiz, por patrón («*» es cualquier índice o clave). */
export const CAMPOS_EDITABLES: readonly string[] = CAMPOS_DE_TEXTO.filter((p) => !p.startsWith("/faltan/"));

const RE_EDITABLES = CAMPOS_EDITABLES.map((p) => new RegExp(`^${p.split("/").map((x) => (x === "*" ? "[a-z0-9_]+" : x)).join("/")}$`));

/** ¿Este puntero es de un texto que la consultora puede corregir? */
export const esEditable = (puntero: string): boolean => RE_EDITABLES.some((re) => re.test(puntero));

/** Los responsables: al corregirlos, 8X vuelve a buscar a la persona en la empresa. */
const ES_RESPONSABLE = /^\/(?:caminos\/[ab]\/jugadas\/\d+|victorias_14_dias\/\d+)\/responsable$/;

// ─── Leer y escribir por puntero ─────────────────────────────────────────────────────────────────

function padreDe(raiz: unknown, puntero: string): { padre: Record<string, unknown>; clave: string } | null {
  const partes = puntero.split("/").slice(1);
  if (!partes.length) return null;
  let x: unknown = raiz;
  for (const p of partes.slice(0, -1)) {
    if (x == null || typeof x !== "object") return null;
    x = (x as Record<string, unknown>)[p];
  }
  if (x == null || typeof x !== "object") return null;
  return { padre: x as Record<string, unknown>, clave: partes[partes.length - 1]! };
}

/** El texto que hay en un puntero, o null si ahí no hay un texto. */
export function textoEn(e: unknown, puntero: string): string | null {
  const l = padreDe(e, puntero);
  const v = l ? l.padre[l.clave] : undefined;
  return typeof v === "string" ? v : null;
}

/**
 * Los textos que corrigió la consultora: los que en `vigente` no dicen lo mismo que en `salida`. Las dos tienen la
 * misma forma (la consultora corrige textos y rangos, no agrega ni quita jugadas), así que el puntero es el mismo.
 */
export function punterosEditados(salida: Estrategia | null, vigente: Estrategia): Set<string> {
  if (!salida) return new Set();
  return new Set(textosEn(vigente, CAMPOS_DE_TEXTO).filter(({ puntero, texto }) => textoEn(salida, puntero) !== texto).map((x) => x.puntero));
}

// ─── Revisar ─────────────────────────────────────────────────────────────────────────────────────

export type Revision = { validacion: Validacion; calidad: ResultadoControl[]; estado: "lista" | "con_observaciones" };

/** Valida lo vigente (la cifra de la consultora es aviso), corre la lista de control y dice el estado. */
export function revisarVersion(vigente: Estrategia, salida: Estrategia | null, paquete: Paquete, calculos: Calculos): Revision {
  const refs = refsDeEstrategia(vigente, paquete, calculos);
  const validacion = validar(vigente, refs, { editados: punterosEditados(salida, vigente), partes: partesDeLineas(calculos) });
  return { validacion, calidad: revisarCalidad(vigente, paquete, calculos, { validacion, refs }), estado: estadoDeRevision(vigente, validacion) };
}

/** Cuántas cosas faltan por resolver antes de aprobar: los errores y lo quitado sin resolver (contado una vez por puntero). */
export function porResolver(vigente: Pick<Estrategia, "quitado">, validacion: Pick<Validacion, "errores">): { puntero: string; texto: string }[] {
  const salida = new Map<string, string>();
  for (const e of validacion.errores) if (!salida.has(e.puntero)) salida.set(e.puntero, e.texto);
  for (const q of vigente.quitado) if (!q.resuelto && !salida.has(q.puntero)) salida.set(q.puntero, q.motivo);
  return [...salida.entries()].map(([puntero, texto]) => ({ puntero, texto }));
}

// ─── Corregir ────────────────────────────────────────────────────────────────────────────────────

export type ResultadoEdicion = { ok: true; vigente: Estrategia; puntero: string; antes: unknown; despues: unknown } | { ok: false; texto: string };

/** Lo que 8X quitó en ese puntero queda resuelto: la consultora lo corrigió. */
const resolverEn = (e: Estrategia, puntero: string): Estrategia => (e.quitado.some((q) => q.puntero === puntero && !q.resuelto) ? resolverQuitado(e, puntero) : e);

/**
 * Corrige un texto. Si es un responsable, 8X vuelve a buscar a la persona entre las de la empresa: encontrada, el
 * aviso se va; si no, queda lo que escribió la consultora con su aviso. Lo que 8X había quitado ahí queda resuelto.
 */
export function editarTexto(vigente: Estrategia, puntero: string, texto: string, paquete: Pick<Paquete, "personas">): ResultadoEdicion {
  if (!esEditable(puntero)) return { ok: false, texto: API.no_editable };
  const antes = textoEn(vigente, puntero);
  if (antes == null) return { ok: false, texto: API.no_editable };
  const nuevo = texto.trim();
  let e: Estrategia = structuredClone(vigente);
  const lugar = padreDe(e, puntero)!;
  lugar.padre[lugar.clave] = nuevo;
  if (ES_RESPONSABLE.test(puntero)) {
    const quien = resolverQuien(nuevo, paquete.personas);
    lugar.padre.responsable_encontrado = quien.encontrado;
    if (quien.encontrado) delete lugar.padre.responsable_dicho;
    else lugar.padre.responsable_dicho = nuevo;
  }
  e = resolverEn(e, puntero);
  return { ok: true, vigente: e, puntero, antes, despues: nuevo };
}

/** Vuelve a lo que escribió 8X en ese texto (deshace la corrección de la consultora). */
export function restaurarTexto(vigente: Estrategia, salida: Estrategia, puntero: string): ResultadoEdicion {
  if (!esEditable(puntero)) return { ok: false, texto: API.no_editable };
  const de8x = textoEn(salida, puntero);
  const ahora = textoEn(vigente, puntero);
  if (de8x == null || ahora == null) return { ok: false, texto: API.no_editable };
  if (de8x === ahora) return { ok: false, texto: API.ya_es_lo_de_8x };
  const e: Estrategia = structuredClone(vigente);
  const lugar = padreDe(e, puntero)!;
  lugar.padre[lugar.clave] = de8x;
  if (ES_RESPONSABLE.test(puntero)) {
    // Lo de 8X, entero: su texto, si lo encontró y lo que se dijo.
    const original = padreDe(salida, puntero)!.padre;
    lugar.padre.responsable_encontrado = original.responsable_encontrado;
    if (original.responsable_dicho != null) lugar.padre.responsable_dicho = original.responsable_dicho;
    else delete lugar.padre.responsable_dicho;
  }
  return { ok: true, vigente: e, puntero, antes: ahora, despues: de8x };
}

/**
 * Corrige el rango de una cifra por confirmar (un supuesto de cambio) y rehace los números de los caminos. Un rango
 * fuera de su límite, al revés o de una clave que no es de cambio no entra en las cuentas: no se guarda y se dice por
 * qué. Si 8X lo había dejado fuera de las cuentas y el rango nuevo es bueno, vuelve a entrar y lo quitado se resuelve.
 */
export function editarSupuesto(vigente: Estrategia, id: string, rango: { bajo: number; alto: number }, paquete: Paquete, calculos: Calculos): ResultadoEdicion {
  const i = vigente.supuestos.findIndex((s) => s.id === id);
  if (i < 0) return { ok: false, texto: API.supuesto_no_existe };
  const s = vigente.supuestos[i]!;
  const problema = problemaDeSupuesto({ ...s, rango }, refsDeEstrategia(vigente, paquete, calculos));
  if (problema) return { ok: false, texto: API.supuesto_fuera(problema.texto) };
  let e: Estrategia = structuredClone(vigente);
  const x = e.supuestos[i]!;
  const antes = { bajo: x.rango.bajo, alto: x.rango.alto };
  x.rango = { bajo: rango.bajo, alto: rango.alto };
  if (x.retirado) delete x.retirado;
  e = resolverEn(e, `/supuestos/${i}`);
  return { ok: true, vigente: reproyectar(e, paquete, calculos), puntero: `/supuestos/${i}/rango`, antes, despues: { bajo: rango.bajo, alto: rango.alto } };
}

/** La consultora acepta que se quede quitado lo que 8X quitó en ese puntero. */
export function aceptarQuitado(vigente: Estrategia, puntero: string): ResultadoEdicion {
  const pendientes = vigente.quitado.filter((q) => q.puntero === puntero && !q.resuelto);
  if (!pendientes.length) return { ok: false, texto: API.nada_que_aceptar };
  return { ok: true, vigente: resolverQuitado(vigente, puntero), puntero, antes: pendientes.map((q) => q.quitado), despues: null };
}
