/**
 * LEER UN NÚMERO COMO LO ESCRIBE UN DUEÑO. Una sola regla para todo el sistema.
 *
 * Había tres copias de esta lectura (Tus números, registrar el valor de un indicador, el formulario de
 * producto) y dos lecturas sueltas más, cada una con su criterio. El 13-10-2026 un verificador probó la
 * de Tus números: «28.000» se guardaba como 28 y «S/. 28000» como 0,28. Con venta «40 mil» y fijos
 * «12 mil», el costo variable «28.000» daba un punto de equilibrio de S/ 12,008 «y estás S/ 27,992 por
 * encima»: una cifra exacta y falsa, sin ningún aviso. En el Perú se escribe «28,000» y también
 * «28.000»; el sistema tiene que entender las dos y, cuando no entiende, decirlo.
 *
 * Reglas, en orden:
 *  1. Vacío es «sin dato» (null). Nunca cero.
 *  2. Se quitan la moneda y los adornos: «S/.», «S/», «soles», «$», «US$», «USD», «PEN», «%» y los espacios.
 *  3. Multiplicadores hablados: «40 mil», «1,5 millones», «8k».
 *  4. Si hay punto Y coma, el que aparece al final es el decimal y el otro separa miles.
 *  5. Si hay un solo tipo de separador y aparece varias veces, separa miles («1.234.567»).
 *  6. Si aparece una vez seguido de EXACTAMENTE tres cifras (y lo de adelante no es «0»), separa miles:
 *     «28.000» y «8,500» son veintiocho mil y ocho mil quinientos. Con una o dos cifras detrás es decimal:
 *     «12.5», «8,5», «28.00». «0.125» es decimal porque nadie escribe miles empezando por cero.
 *  7. Lo que no se entiende devuelve «invalido»: quien llama decide cómo decirlo, pero no puede ignorarlo.
 *
 * Sin dependencias y sin IA: es aritmética de texto, se prueba caso por caso (tests/numero-escrito.test.ts).
 */

export type NumeroEscrito = number | null | "invalido";

const ADORNOS = /us\$|s\/\.?|soles?\b|\busd\b|\bpen\b|\$|%/g;
const MULTIPLICADORES: [RegExp, number][] = [
  [/(millones|millón|millon)$/, 1_000_000],
  [/(mil|k)$/, 1_000],
];

function leerNucleo(nucleo: string): number | "invalido" {
  if (!/^\d[\d.,]*$/.test(nucleo) || /[.,]$/.test(nucleo)) return "invalido";
  const puntos = (nucleo.match(/\./g) ?? []).length;
  const comas = (nucleo.match(/,/g) ?? []).length;

  // Punto y coma a la vez: el último que aparece es el decimal; el otro separa miles.
  if (puntos && comas) {
    const decimal = nucleo.lastIndexOf(".") > nucleo.lastIndexOf(",") ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    if (nucleo.split(decimal).length !== 2) return "invalido";
    const [entero, fraccion] = nucleo.split(decimal) as [string, string];
    if (!gruposDeMiles(entero, miles) || !/^\d+$/.test(fraccion)) return "invalido";
    return Number(`${entero.split(miles).join("")}.${fraccion}`);
  }

  const sep = puntos ? "." : comas ? "," : null;
  if (!sep) return Number(nucleo);
  const veces = puntos || comas;
  if (veces > 1) return gruposDeMiles(nucleo, sep) ? Number(nucleo.split(sep).join("")) : "invalido";

  const [antes, despues] = nucleo.split(sep) as [string, string];
  const esMiles = despues.length === 3 && antes.length <= 3 && !/^0+$/.test(antes);
  return esMiles ? Number(antes + despues) : Number(`${antes}.${despues}`);
}

/** «1.234.567»: primer grupo de una a tres cifras, los demás de exactamente tres. */
function gruposDeMiles(texto: string, sep: string): boolean {
  const grupos = texto.split(sep);
  return /^\d{1,3}$/.test(grupos[0] ?? "") && grupos.slice(1).every((g) => /^\d{3}$/.test(g));
}

/**
 * Lee lo que alguien tecleó. Devuelve el número, `null` si no escribió nada, o «invalido» si escribió
 * algo que no es un número. Los negativos solo se aceptan cuando quien llama lo pide (una utilidad puede
 * ser negativa; una venta, no).
 */
export function numeroEscrito(texto: string | null | undefined, opciones: { negativo?: boolean } = {}): NumeroEscrito {
  let t = String(texto ?? "").trim().toLowerCase().replace(/ /g, " ");
  if (!t) return null;
  const negativo = /^[-−]/.test(t);
  if (negativo) t = t.slice(1);
  t = t.replace(ADORNOS, "").replace(/\s+/g, "");
  if (!t) return "invalido";

  let factor = 1;
  for (const [patron, valor] of MULTIPLICADORES) {
    if (patron.test(t)) {
      t = t.replace(patron, "");
      factor = valor;
      break;
    }
  }

  // Con multiplicador, el separador único es decimal: «1,5 mil» y «1.5 mil» son mil quinientos.
  let n: number | "invalido";
  if (factor > 1 && /^\d+[.,]\d+$/.test(t)) n = Number(t.replace(",", "."));
  else n = leerNucleo(t);
  if (n === "invalido" || !Number.isFinite(n)) return "invalido";

  const valor = factor > 1 ? Math.round(n * factor) : n;
  if (negativo) return opciones.negativo ? -valor : "invalido";
  return valor;
}
