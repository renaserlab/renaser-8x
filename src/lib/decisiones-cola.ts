/**
 * LA COLA DE DECISIONES: CUÁL PRIMERO, Y POR QUÉ ÉSA.
 *
 * EL PROBLEMA QUE RESUELVE (13-11-2026). En producción hay 20 decisiones, todas en «pendiente», todas
 * con evidencia, alternativas y recomendación — y ninguna decidida. La pantalla las daba como una tabla
 * de 20 filas iguales, cada una con una columna que decía «le falta 1» en ámbar. Eso no ayuda a decidir:
 * es una lista de pendientes con un reproche al lado, y lo que produce es que se abra y se cierre.
 *
 * Kelin lo dijo así: «necesito que me ayude a tomar decisiones, nada de eso tengo». Lo que hace falta no
 * es más información: es ORDEN —cuál primero— y que el sistema diga lo que sabe en vez de señalar lo que
 * le falta.
 *
 * LAS TRES REGLAS DE ESTE MÓDULO:
 *
 *  1. NO SE INVENTA NINGUNA CIFRA. Lo que se muestra como «lo que frena a esta empresa» sale del texto
 *     que la propia decisión ya trae en `por_que_ahora`. Si no nombra ninguna cifra, no se muestra
 *     ninguna: se ordena por lo demás. Nunca se estima ni se redondea hacia arriba.
 *  2. LA CONFIANZA SE DECLARA SIEMPRE. Si el agente la declaró, manda la suya. Si no, se deduce de su
 *     propia evidencia —cuántas fuentes cita, cuántos datos quedan por confirmar, cuántos supuestos
 *     hace— y se dice que es deducida. Un sistema que recomienda sin decir qué tan seguro está le
 *     traslada todo el riesgo a quien firma.
 *  3. «NO DECIDIBLE» ES OTRA COSA QUE «INCÓMODA». Una decisión sin dos caminos o sin evidencia no es una
 *     decisión: es una opinión con botones, y va aparte. Que falte un dato por confirmar NO la bloquea:
 *     la recomendación ya dice qué hacer mientras tanto, y el dato se pregunta.
 */
import type { Decision } from "./decisiones";

export type Confianza = "alta" | "media" | "baja";

/**
 * Las cifras en soles que un texto NOMBRA. Se aceptan «S/40,000», «S/ 40,000» y «S/ 40.000»: en el
 * material real aparecen de las tres formas. Se descartan las menores de 100 porque en estos textos
 * son cantidades de cosas («S/ 14 a S/ 32 por pantalón»), no plata en juego.
 */
export function cifrasQueNombra(texto: string | null | undefined): number[] {
  const cifras: number[] = [];
  for (const m of String(texto ?? "").matchAll(/S\/\s?(\d[\d.,]*)/g)) {
    // Un separador de miles es un punto o una coma seguida de exactamente tres dígitos.
    const n = Number(m[1]!.replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 100) cifras.push(n);
  }
  return cifras;
}

/**
 * La cifra con la que se ordena: la mayor que la decisión nombra al explicar por qué ahora.
 *
 * OJO CON LO QUE ESTO ES Y LO QUE NO ES. `por_que_ahora` describe lo que hoy más limita a la EMPRESA,
 * no lo que está en juego en esta decisión concreta; por eso varias decisiones de una misma empresa
 * comparten su cifra. Sirve para ordenar —primero la empresa que más sangra— y la pantalla lo nombra
 * así, no como «lo que ganas con esta decisión», que sería mentir.
 *
 * Y SOLO MIRA AHÍ, A PROPÓSITO. Se probó mirando también el porqué de la recomendación y aparecieron
 * cifras que no son plata parada sino METAS («la meta serían S/ 250,000»): una decisión subía al primer
 * puesto por lo que se espera ganar, no por lo que está costando esperar. El orden lo manda lo que duele
 * hoy, no lo que se aspira a tener.
 */
export function cifraQueFrena(d: Pick<Decision, "por_que_ahora">): number | null {
  const todas = cifrasQueNombra(d.por_que_ahora);
  return todas.length ? Math.max(...todas) : null;
}

/**
 * La confianza del sistema en su propia recomendación. Si el agente la declaró, se respeta. Si no, se
 * deduce de lo que él mismo dejó escrito, y se dice que es deducida para que nadie la confunda con un
 * juicio del agente.
 */
export function confianzaDe(
  d: Pick<Decision, "confianza" | "confianza_por_que" | "evidencia" | "faltantes" | "supuestos">
): { nivel: Confianza; porque: string; deducida: boolean } {
  if (d.confianza) {
    return { nivel: d.confianza, porque: d.confianza_por_que ?? "Lo declaró el agente que la produjo.", deducida: false };
  }
  const fuentes = d.evidencia?.length ?? 0;
  const porConfirmar = d.faltantes?.length ?? 0;
  const supuestos = d.supuestos?.length ?? 0;
  const nivel: Confianza = fuentes >= 2 && porConfirmar === 0 && supuestos === 0 ? "alta" : fuentes >= 1 && porConfirmar <= 2 ? "media" : "baja";
  const partes = [
    fuentes === 0 ? "sin ninguna fuente citada" : fuentes === 1 ? "una sola fuente citada" : `${fuentes} fuentes citadas`,
    porConfirmar === 0 ? "nada por confirmar" : porConfirmar === 1 ? "un dato por confirmar" : `${porConfirmar} datos por confirmar`,
  ];
  if (supuestos) partes.push(supuestos === 1 ? "un supuesto" : `${supuestos} supuestos`);
  return { nivel, porque: `La deduce 8X de su propia evidencia: ${partes.join(", ")}.`, deducida: true };
}

/**
 * Devuelve la decisión con su confianza siempre puesta. Se aplica al LEER, no al guardar: así la
 * confianza deducida se mantiene al día con la evidencia que la decisión tenga en ese momento, y
 * `queLeFalta` deja de pedirla —que es correcto, porque ya no falta—.
 */
export function conConfianza<T extends Parameters<typeof confianzaDe>[0]>(d: T): T & { confianza_deducida: boolean } {
  const c = confianzaDe(d);
  return { ...d, confianza: c.nivel, confianza_por_que: c.porque, confianza_deducida: c.deducida };
}

/**
 * Lo que impide que esto SEA una decisión. No es lo mismo que estar incómoda: que falte un dato por
 * confirmar no bloquea nada, porque la recomendación ya dice qué hacer mientras tanto.
 */
export function noEsDecidible(d: Pick<Decision, "evidencia" | "alternativas" | "recomendacion">): string[] {
  const razones: string[] = [];
  if ((d.evidencia?.length ?? 0) === 0) razones.push("No cita ninguna fuente: no se puede decidir sobre algo sin respaldo.");
  if ((d.alternativas?.length ?? 0) < 2) razones.push("No ofrece dos caminos: sin comparación no hay decisión, hay aceptación.");
  if (!d.recomendacion) razones.push("No recomienda nada: recomendar es trabajo del sistema, decidir es tuyo.");
  return razones;
}

export type EnCola<T> = { decision: T; cifra: number | null; confianza: ReturnType<typeof confianzaDe>; trabada: string[] };

export type Cola<T> = {
  /** La que toca ahora. `null` solo si no hay ninguna decidible. */
  hoy: EnCola<T> | null;
  /** Las que siguen, ya ordenadas. */
  siguen: EnCola<T>[];
  /** Las que no son decidibles todavía, con el motivo. */
  trabadas: EnCola<T>[];
  /** Por qué ésa es la primera, en una frase que se puede leer en pantalla. */
  porQueEsaPrimero: string | null;
};

const soles = (n: number) => "S/ " + n.toLocaleString("es-PE");

/**
 * Ordena la cola. Primero lo que más frena —la empresa que más plata tiene parada— y, a igualdad, la
 * que lleva más tiempo esperando: una decisión vieja sin tomar es una decisión que ya costó.
 * Las no decidibles salen de la cola y van a su propio montón, nunca mezcladas.
 */
export function ordenarCola<T extends Parameters<typeof cifraQueFrena>[0] & Parameters<typeof confianzaDe>[0] & Parameters<typeof noEsDecidible>[0] & { created_at: string }>(
  decisiones: readonly T[]
): Cola<T> {
  const enCola: EnCola<T>[] = decisiones.map((d) => ({
    decision: d,
    cifra: cifraQueFrena(d),
    confianza: confianzaDe(d),
    trabada: noEsDecidible(d),
  }));

  const trabadas = enCola.filter((x) => x.trabada.length);
  const listas = enCola
    .filter((x) => !x.trabada.length)
    .sort((a, b) => (b.cifra ?? -1) - (a.cifra ?? -1) || a.decision.created_at.localeCompare(b.decision.created_at));

  const hoy = listas[0] ?? null;
  const porQueEsaPrimero = !hoy
    ? null
    : hoy.cifra !== null
      ? `Primero ésta: es la empresa con más plata parada —${soles(hoy.cifra)}— de las que ya se pueden decidir.`
      : `Primero ésta: es la que lleva más tiempo esperando de las que ya se pueden decidir.`;

  return { hoy, siguen: listas.slice(1), trabadas, porQueEsaPrimero };
}
