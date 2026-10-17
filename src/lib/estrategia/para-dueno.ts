/**
 * LA PÁGINA DEL DUEÑO (spec-estrategia-8x.md §8.2).
 *
 * Al aprobar, `vistaParaDueno` arma, desde lo vigente y el camino elegido, lo único que el dueño ve de la estrategia:
 * el camino que elegimos y por qué, los pasos (qué haremos, desde cuándo y quién), qué esperamos ver a 30 y a 90 días
 * —en rango y con «si»—, lo que le pedimos, cómo sabremos que funciona y, como mucho, dos casos con lo que haremos.
 *
 * Se congela CON LAS CIFRAS YA ESCRITAS (sin ningún `{{id}}`): lo que se aprueba no puede depender de un paquete que
 * mañana cambia. El dueño nunca ve el otro camino, el FODA, los cálculos, los ids ni las palabras del método: si alguna
 * se cuela, `vistaParaDueno` falla en vez de mostrarla. Un número que todavía no se puede calcular no se pinta rayado:
 * se dice que lo calculamos cuando responda.
 *
 * Puro: sin base, sin red.
 */
import type { RefValor } from "./paquete";
import type { Estrategia, LetraCamino } from "./armar";
import { pintar, type Trozo } from "./texto";
import { casosDelDueno, palabrasQueElDuenoNoVe } from "./validador";
import { CHIP_DUENO, PARA_DUENO } from "./textos";

/** El formato del contenido que se congela en `deliverables` (§8.4): VistaEntregable lo reconoce por este nombre. */
export const FORMATO_PARA_DUENO = "estrategia_dueno_v1";

/** Un trozo de lo que lee el dueño: texto, una cifra con su chip, o el aviso de que falta un dato. Sin ids. */
export type TrozoDueno = { t: "texto"; texto: string } | { t: "cifra"; texto: string; chip: string } | { t: "falta"; texto: string };
export type FraseDueno = TrozoDueno[];

export type ParaDueno = {
  formato: typeof FORMATO_PARA_DUENO;
  titulo: FraseDueno;
  por_que: FraseDueno;
  pasos: { que: FraseDueno; desde_dia: number | null; quien: string | null }[];
  /**
   * A 30 y a 90 días: lo que dejaría de más al mes; y la caja que liberaría una sola vez (cobrar antes, liberar lo
   * parado), que en un camino de caja es lo principal y no puede quedar escondida en un paso. Sin número, `falta` dice
   * por qué (nunca un hueco rayado).
   */
  esperamos: { d30: FraseDueno | null; d90: FraseDueno | null; caja?: FraseDueno | null; falta: string | null };
  te_pedimos: FraseDueno[];
  como_sabremos: { senal: FraseDueno; dia: number }[];
  casos: { si_pasa: FraseDueno; haremos: FraseDueno }[];
};

/** El contenido de la copia en la biblioteca: solo la página del dueño (§8.4). */
export type ContenidoEntregable = { formato: typeof FORMATO_PARA_DUENO; estrategia_id: string; version: number; para_dueno: ParaDueno };

export class PaginaDelDuenoInvalida extends Error {
  constructor(public readonly problemas: string[]) {
    super(`La página del dueño no se puede congelar: ${problemas.join("; ")}`);
    this.name = "PaginaDelDuenoInvalida";
  }
}

function aDueno(trozos: Trozo[]): FraseDueno {
  return trozos.map((x): TrozoDueno => (x.t === "cifra" ? { t: "cifra", texto: x.texto, chip: x.chip } : x.t === "falta" ? { t: "falta", texto: x.texto } : { t: "texto", texto: x.texto }));
}

/** Una frase del dueño como una sola línea (para buscar palabras o leerla en una prueba). */
export const textoDeFrase = (f: FraseDueno | null | undefined): string => (f ? f.map((x) => x.texto).join("") : "");

/**
 * Arma la página del dueño de un camino. `refs` son los de la versión (refsDeEstrategia). Lanza
 * `PaginaDelDuenoInvalida` si encuentra una palabra que el dueño no ve o un `{{`.
 */
export function vistaParaDueno(e: Estrategia, letra: LetraCamino, refs: ReadonlyMap<string, RefValor>): ParaDueno {
  const c = e.caminos[letra];
  const p = c.para_el_dueno;
  const frase = (t: string) => aDueno(pintar(t, refs, "dueno"));

  // Los pasos van uno por jugada, en el mismo orden: si coinciden en número, cada paso lleva desde cuándo y quién, y se
  // leen en el orden en que se juegan (por su día de inicio): el dueño no lee «desde el día 7» después de «desde el 30».
  const pareados = p.pasos.length === c.jugadas.length;
  const pasos = p.pasos
    .map((t, i) => {
      const j = pareados ? c.jugadas[i] : undefined;
      return { que: frase(t), desde_dia: j?.desde_dia ?? null, quien: j && j.responsable_encontrado ? j.responsable : null, i };
    })
    .sort((a, b) => (a.desde_dia ?? 0) - (b.desde_dia ?? 0) || a.i - b.i)
    .map(({ que, desde_dia, quien }) => ({ que, desde_dia, quien }));

  // Qué esperamos ver: lo que el camino deja de más al mes a los 30 y a los 90 días.
  const esperado = (dias: 30 | 90, desde = false): FraseDueno | null => {
    const r = refs.get(`R:${letra}.total.d${dias}`);
    if (!r?.valor || r.valor.alto <= 0) return null;
    const chip = r.clase === "hecho" ? CHIP_DUENO.hecho : r.clase === "estimado" ? CHIP_DUENO.estimado : CHIP_DUENO.supuesto;
    return [{ t: "texto", texto: desde ? PARA_DUENO.desde_los(dias) : PARA_DUENO.si_se_cumple(dias) }, { t: "cifra", texto: r.texto, chip }, { t: "texto", texto: PARA_DUENO.mas_al_mes }];
  };
  // Si a los 30 días ya da lo mismo que a los 90, se dice una sola vez («desde los 30 días»): dos líneas iguales marean.
  const r30 = refs.get(`R:${letra}.total.d30`)?.texto;
  const mismo = !!r30 && r30 === refs.get(`R:${letra}.total.d90`)?.texto;
  const d30 = mismo ? null : esperado(30);
  const d90 = mismo ? esperado(30, true) : esperado(90);
  // La caja que se libera de una vez, a los 90 días: va con lo que esperamos ver, no escondida en un paso.
  const rc = refs.get(`R:${letra}.caja.d90`);
  const caja: FraseDueno | null =
    d90 && rc?.valor && rc.valor.alto > 0
      ? [{ t: "texto", texto: PARA_DUENO.caja_1 }, { t: "cifra", texto: rc.texto, chip: rc.clase === "hecho" ? CHIP_DUENO.hecho : rc.clase === "estimado" ? CHIP_DUENO.estimado : CHIP_DUENO.supuesto }, { t: "texto", texto: PARA_DUENO.caja_2 }]
      : null;
  // Solo las preguntas que esperan jugadas de ESTE camino: las del otro no le dicen nada al dueño.
  const hayPreguntas = e.destraban.some((x) => x.pregunta && x.esperan.some((j) => j.startsWith(`${letra}.`)));
  const falta = d90 ? null : hayPreguntas ? PARA_DUENO.falta_responder : PARA_DUENO.falta_datos;

  const salida: ParaDueno = {
    formato: FORMATO_PARA_DUENO,
    titulo: frase(p.titulo),
    por_que: frase(p.por_que),
    pasos,
    esperamos: { d30, d90, caja, falta },
    te_pedimos: p.te_pedimos.map(frase),
    como_sabremos: c.senales_tempranas.map((s) => ({ senal: frase(s.senal), dia: s.mirar_el_dia })),
    casos: casosDelDueno(c).map((i) => ({ si_pasa: frase(c.casos[i]!.caso), haremos: frase(c.casos[i]!.solucion) })),
  };

  // Lo que se congela no puede traer un id ni una palabra del método.
  const problemas: string[] = [];
  const todo = JSON.stringify(salida);
  if (todo.includes("{{")) problemas.push("trae un id sin pintar");
  const textos = [salida.titulo, salida.por_que, ...salida.pasos.map((x) => x.que), ...salida.te_pedimos, ...salida.como_sabremos.map((x) => x.senal), ...salida.casos.flatMap((x) => [x.si_pasa, x.haremos])].map(textoDeFrase);
  for (const t of textos) {
    const p2 = palabrasQueElDuenoNoVe(t);
    if (p2.length) problemas.push(`«${t}» dice ${p2.join(", ")}`);
  }
  if (problemas.length) throw new PaginaDelDuenoInvalida(problemas);
  return salida;
}

/** El contenido que se congela en `deliverables` al aprobar. */
export function contenidoEntregable(estrategia_id: string, version: number, para_dueno: ParaDueno): ContenidoEntregable {
  return { formato: FORMATO_PARA_DUENO, estrategia_id, version, para_dueno };
}

/** Si un contenido de `deliverables` es una página del dueño de esta versión de 8X (si no, es un plan viejo). */
export function esPaginaDelDueno(contenido: unknown): contenido is ContenidoEntregable {
  return !!contenido && typeof contenido === "object" && (contenido as { formato?: unknown }).formato === FORMATO_PARA_DUENO && typeof (contenido as { para_dueno?: unknown }).para_dueno === "object";
}

/** Toda la página como texto llano, para comprobar qué ve el dueño. */
export function textoDePagina(p: ParaDueno): string {
  return [
    textoDeFrase(p.titulo), textoDeFrase(p.por_que), ...p.pasos.map((x) => textoDeFrase(x.que)), textoDeFrase(p.esperamos.d30), textoDeFrase(p.esperamos.d90), textoDeFrase(p.esperamos.caja), p.esperamos.falta ?? "",
    ...p.te_pedimos.map(textoDeFrase), ...p.como_sabremos.map((x) => textoDeFrase(x.senal)), ...p.casos.flatMap((x) => [textoDeFrase(x.si_pasa), textoDeFrase(x.haremos)]),
  ].join("\n");
}

