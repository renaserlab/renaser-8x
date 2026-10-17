/**
 * EL VALIDADOR: NINGUNA CIFRA SIN ORIGEN (spec-estrategia-8x.md §6.3).
 *
 * `validar(estrategia, refs)` recorre cada texto que lista CAMPOS_DE_TEXTO, cada id citado y cada efecto, y devuelve
 * errores (bloquean la aprobación) y avisos (se muestran). Es la única puerta: lo que escribió el modelo, lo que armó
 * el código y lo que corrigió la consultora pasan por aquí.
 *
 * Errores:
 *  1. cifra_sin_origen — quitados los `{{…}}`, queda un dígito, «S/», «$», «%», «por ciento», un número en palabras con
 *     su unidad («dos mil soles», «veinte clientes») o una palabra de multiplicar («duplicar», «el doble», «la mitad»)
 *     en una frase sin `{{R:…}}` ni `{{C:mult.…}}`. Solo se permiten «de cada 10», «14 / 30 / 90 días», «día N» (de 1
 *     a 90) y «jugada N». Una cifra escrita por la consultora no es error: es aviso.
 *  2. ref_desconocida — un id que no existe en el paquete, los cálculos, los supuestos ni las proyecciones.
 *  3. efecto_mal_armado — un efecto que apunta a un id del tipo equivocado, a una parte del costo que no existe, a un
 *     supuesto de otra clave, o una habilitadora que abre una jugada que no está; un camino con menos de tres o más de
 *     cinco jugadas, o con menos de dos casos.
 *  4. supuesto_fuera_de_limite — bajo > alto, otra unidad o fuera de los límites del catálogo.
 *  5. supuesto_de_estado_actual — la IA supuso cuánto es algo hoy, o un cambio sin el dato de hoy del que parte.
 *  6. referencia_como_dato — la referencia del rubro (Z:) o el calendario (T:) como ancla, dentro de un efecto o como
 *     base o meta de lo que se mide.
 *  7. pregunta_mal_hecha — revisarPregunta.
 *  8. palabra_que_el_dueno_no_ve — en lo que lee el dueño y en las preguntas.
 *  9. nombre_de_referente — un autor, un libro u otra empresa, en cualquier texto.
 * Avisos: responsable_no_encontrado, fecha_fuera_de_horizonte, pide_mas_caja_de_la_que_hay, cifra_de_la_consultora y
 * supuesto_en_el_tope (la cuenta descansa en lo más optimista de lo creíble en 90 días).
 *
 * `quitarLoInvalido` (si después de la reparación quedan errores) quita lo inválido con marca visible, y
 * `estadoDeRevision` dice si la versión queda «lista» o «con_observaciones».
 *
 * Puro: sin base, sin red, sin IA.
 */
import type { Paquete, RefValor } from "./paquete";
import type { Calculos } from "./calculos";
import {
  enElTope, excesoDeCaja, idJugada, ordenarCamino, problemaDeSupuesto, refsDeEfecto, refsDeEstrategia, reproyectar, supuestoDeEfecto,
  type CaminoFinal, type Estrategia, type JugadaFinal, type LetraCamino,
} from "./armar";
import { CLAVES_SUPUESTO } from "./supuestos";
import { PATRON_LLAVES, refsEnTexto } from "./texto";
import { PATRON_REF } from "./esquemas";
import { MARCA_CAMINO_RESTAURADO, MARCA_JUGADA_DE_MAS, MARCA_QUITADO } from "./textos";

// ─── Tipos ───────────────────────────────────────────────────────────────────────────────────────

export const TIPOS_ERROR = [
  "cifra_sin_origen", "ref_desconocida", "efecto_mal_armado", "supuesto_fuera_de_limite", "supuesto_de_estado_actual",
  "referencia_como_dato", "pregunta_mal_hecha", "palabra_que_el_dueno_no_ve", "nombre_de_referente",
] as const;
export const TIPOS_AVISO = ["responsable_no_encontrado", "fecha_fuera_de_horizonte", "pide_mas_caja_de_la_que_hay", "cifra_de_la_consultora", "supuesto_en_el_tope"] as const;
export type TipoViolacion = (typeof TIPOS_ERROR)[number] | (typeof TIPOS_AVISO)[number];

/** Un problema con su lugar (puntero JSON dentro de la estrategia), qué es y qué hacer. */
export type Violacion = { puntero: string; tipo: TipoViolacion; texto: string; que_hacer: string };
export type Validacion = { errores: Violacion[]; avisos: Violacion[] };

export type OpcionesValidacion = {
  /** Los punteros de los textos que corrigió la consultora: su cifra es aviso, no error (§6.3). */
  editados?: ReadonlySet<string>;
  /** Las partes del costo de cada línea, por su id corto (`L:1a1a0001` → «compra», «flete»). */
  partes?: ReadonlyMap<string, string[]>;
};

// ─── Las listas ──────────────────────────────────────────────────────────────────────────────────

/** Sin tildes y en minúsculas, para comparar palabras (la ñ queda como n). */
export const sinTildes = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Una palabra o frase entera, sin distinguir tildes ni mayúsculas (sobre el texto ya pasado por sinTildes). */
const palabra = (p: string) => new RegExp(`(?<![\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`, "u");
/** Una sigla en mayúscula exacta («IA» no salta en «familia», «diaria» ni «media»). */
const sigla = (p: string) => new RegExp(`(?<![\\p{L}\\p{N}])${p}(?![\\p{L}\\p{N}])`, "u");

/**
 * Lo que el dueño no ve (spec-entrar-hoy.md §0.9, más las palabras del método de la estrategia). Con borde de palabra y
 * sin distinguir tildes; las siglas, en mayúscula exacta.
 */
export const PALABRAS_QUE_EL_DUENO_NO_VE: readonly { nombre: string; re: RegExp; sigla?: true }[] = [
  { nombre: "contribución", re: palabra("contribucion(?:es)?") },
  { nombre: "costo variable", re: palabra("costos? variables?") },
  { nombre: "SKU", re: sigla("SKU"), sigla: true },
  { nombre: "matriz", re: palabra("matriz") },
  { nombre: "KPI", re: sigla("KPIs?"), sigla: true },
  { nombre: "claim", re: palabra("claims?") },
  { nombre: "extraído", re: palabra("extraid[oa]s?") },
  { nombre: "IA", re: sigla("IA"), sigla: true },
  { nombre: "FODA", re: palabra("foda") },
  { nombre: "TOWS", re: palabra("tows") },
  { nombre: "lente", re: palabra("lentes?") },
  { nombre: "equipo rojo", re: palabra("equipo rojo") },
  // «por supuesto» es castellano de todos los días: no es la palabra del método.
  { nombre: "supuesto", re: new RegExp("(?<![\\p{L}\\p{N}])(?<!por )supuestos?(?![\\p{L}\\p{N}])", "u") },
  { nombre: "hipótesis", re: palabra("hipotesis") },
  { nombre: "percepción", re: palabra("percepcion(?:es)?") },
  { nombre: "camino B", re: palabra("camino b") },
];

/** Las palabras de `PALABRAS_QUE_EL_DUENO_NO_VE` que trae un texto. */
export function palabrasQueElDuenoNoVe(texto: string): string[] {
  const plano = sinTildes(texto);
  return PALABRAS_QUE_EL_DUENO_NO_VE.filter((p) => p.re.test(p.sigla ? texto : plano)).map((p) => p.nombre);
}

/** Jerga que no va en una pregunta para el dueño (§6.3, 7). */
export const JERGA_EN_PREGUNTAS: readonly { nombre: string; re: RegExp; sigla?: true }[] = [
  { nombre: "porcentaje", re: palabra("porcentajes?") },
  { nombre: "tasa", re: palabra("tasas?") },
  { nombre: "KPI", re: sigla("KPIs?"), sigla: true },
  { nombre: "indicador", re: palabra("indicador(?:es)?") },
  { nombre: "margen de contribución", re: palabra("margen de contribucion") },
  { nombre: "plata", re: palabra("plata") },
];

/**
 * Autores, libros y empresas que no se nombran en la salida (§6.3, 9). Lista propia y con borde de palabra: la de
 * verificarDocumento (plan.ts) trae «lean», que en castellano es el verbo leer («que lean el guion»).
 */
export const REFERENTES: readonly string[] = [
  "hormozi", "harnish", "lemonis", "goldratt", "sun tzu", "oceano azul", "kim y mauborgne", "mauborgne", "mckinsey",
  "collins", "ferriss", "google", "netflix", "toyota", "ritz", "apple",
];
const RE_REFERENTES = REFERENTES.map((r) => ({ nombre: r, re: palabra(r) }));
export const referentesEn = (texto: string): string[] => RE_REFERENTES.filter((r) => r.re.test(sinTildes(texto))).map((r) => r.nombre);

// ─── Cifras sin origen ───────────────────────────────────────────────────────────────────────────

/**
 * TODA CANTIDAD ESCRITA EN PALABRAS ES UNA CIFRA, con unidad o sin ella («quinientos por paciente», «subir a veinte»,
 * «miles de soles», «un tercio», «la cuarta parte», «una docena de locales»). Sobre el texto ya pasado por sinTildes.
 * Lo único que no cuenta son los conteos de la propia estrategia («los dos caminos», «las dos primeras jugadas», «de
 * tres a cinco jugadas») y «los dos» como pronombre: eso no es un dato de la empresa que se pueda inventar.
 */
const NUMEROS_EN_PALABRAS = [
  "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince",
  "dieciseis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veinti\\p{L}+", "treinta", "cuarenta", "cincuenta",
  "sesenta", "setenta", "ochenta", "noventa", "cien", "ciento", "cientos", "doscient[oa]s", "trescient[oa]s", "cuatrocient[oa]s",
  "quinient[oa]s", "seiscient[oa]s", "setecient[oa]s", "ochocient[oa]s", "novecient[oa]s", "mil", "miles", "millon", "millones",
  "centenar(?:es)?", "decenas?", "docenas?", "tercios?", "quintos?",
];
const NUM = `(?:${NUMEROS_EN_PALABRAS.join("|")})`;
/** «un millón», «un cuarto de…», «tres cuartos», «la tercera parte», y «medio» o «media» con su unidad («medio mes»). */
const FRACCIONES = "un\\s+(?:millon|mil)|(?:un|tres)\\s+cuartos?(?=\\s+(?:de|del)\\b)|tres\\s+cuartos|(?:la|una)\\s+(?:tercera|cuarta|quinta|decima)\\s+parte|(?:medio|media)\\s+(?:mes|semana|jornada|dia|ano|sueldo|kilo|caja|docena|millon)";
/** La unidad que suele seguir a una cantidad: solo para que el hallazgo se lea entero («dos mil soles»). */
const UNIDADES = [
  "soles?", "dolares?", "pesos", "euros?", "por ciento", "clientes?", "personas?", "interesados?", "pacientes?", "compradores?",
  "vendedores?", "trabajadores?", "empleados?", "unidades?", "cajas?", "pedidos?", "ventas?", "productos?", "piezas?",
  "articulos?", "kilos?", "litros?", "platos?", "proyectos?", "operaciones?", "compras?", "dias?", "semanas?", "meses", "mes",
  "horas?", "anos?", "veces", "puntos?", "locales", "de cada",
];
const NUMERO_EN_PALABRAS = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${FRACCIONES}|${NUM}(?:\\s+(?:y\\s+)?${NUM})*(?:\\s+(?:de\\s+)?(?:${UNIDADES.join("|")})(?![\\p{L}\\p{N}]))?)(?![\\p{L}\\p{N}])`,
  "gu"
);
/** Los conteos de la propia estrategia, que no son datos de la empresa: «los dos caminos», «de tres a cinco jugadas». */
const CONTEO_DE_LA_ESTRATEGIA = new RegExp(
  "(?<![\\p{L}\\p{N}])(?:dos|tres|cuatro|cinco)(?:\\s+(?:a|o|y)\\s+(?:dos|tres|cuatro|cinco))?\\s+(?:(?:primer|ultim|siguient|mism|otr)\\p{L}*\\s+)?" +
    "(?:caminos?|jugadas?|cruces?|casos?|cuadrantes?|preguntas?|pasos?|victorias?|frentes?|lentes?|miradas?|bolsas?|grupos?|cosas|opciones|rutas?|apuestas?|lados|columnas?|cuentas)(?![\\p{L}\\p{N}])" +
    // «los dos» como pronombre: «uno de los dos», «los dos a la vez», «las dos juntas».
    "|(?<![\\p{L}\\p{N}])(?:los|las|ambos)\\s+dos(?=\\s*(?:$|[,.;:!?)»]|a\\s+la\\s+vez|juntos|juntas|se\\s))",
  "gu"
);
/** Multiplicar o dividir sin decir cuánto («duplicar la utilidad», «doblar la atención») es una promesa: pide su cuenta en la misma frase. */
const MULTIPLICAR = new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:el|al|del|lo)\\s+doble|doble|dobla(?:r|n|mos|ra|ria)?\\p{L}*|duplic\\p{L}*|triple|triplic\\p{L}*|cuadruple|cuadruplic\\p{L}*|(?<!(?:^|\\s)a\\s)mitad|diez\\s+veces)(?![\\p{L}\\p{N}])`, "u");
/** Una moneda dicha sin su número también es una cifra a medio escribir: «S/», «$», «%», «USD», «PEN», «soles». */
const SIMBOLOS = /S\/|US\$|\$|%|por ciento|(?<![\p{L}\p{N}])(?:USD|PEN|soles|d[oó]lares)(?![\p{L}\p{N}])/iu;

/**
 * Las palabras de un plazo de dinero: junto a ellas, «a 30 días» o «al día 45» no es un horizonte del plan, es un plazo
 * de crédito, de cobro, de pago o de entrega —un dato de la empresa— y va con su id.
 */
const CONTEXTO_DE_PLAZO = /(?<![\p{L}])(?:credito|cobr|pag[aoeu]|pague|plazo|entreg|factur|venc|proveedor|fiad|abon|cuota)\p{L}*/u;
/** ¿Lo que rodea a un número de días dice que es un plazo de dinero? Mira las cuatro palabras de antes (en la misma frase) y las tres de después. */
function esPlazoDeDinero(antes: string, despues: string): boolean {
  const previo = sinTildes(antes).split(/[,;:.()¿?!]/).pop()!.trim().split(/\s+/).slice(-4).join(" ");
  const sigue = sinTildes(despues).trim().split(/\s+/).slice(0, 3).join(" ");
  return CONTEXTO_DE_PLAZO.test(previo) || /^(?:de|para)\s+(?:credito|plazo|pago|cobro|pagar|cobrar|entrega)/.test(sigue);
}
const enHorizonte = (n: string | undefined) => n == null || (Number(n) >= 1 && Number(n) <= 90);

/**
 * Lo permitido sin llaves: «de cada 10», la marca 8X, «jugada N», los horizontes del plan y el día del plan.
 *  - Horizontes (14, 30 y 90 días): «en los primeros 30 días» siempre; «a los 90 días», «a 90 días», «en 14 días», «14,
 *    30 y 90 días», solo si no van junto a un plazo de dinero («crédito de 90 días», «pagar a proveedores a 90 días»).
 *  - El día del plan (de 1 a 90): «desde el día 7», «a partir del día 30», «del día 1 al 7», siempre; «el día 14» y «los
 *    días 1 a 7», si no van junto a un plazo de dinero («vence el día 15»). Nunca «al día 45» (es un plazo), ni «los días
 *    15 a 30 del mes» o «el día 5 de cada mes» (es el calendario, no el plan).
 */
function sinLoPermitido(t: string): string {
  const H = "(?:14|30|90)";
  const calendario = (resto: string) => /^\s*(?:del|de\s+cada|de)\s+(?:mes|semana|ano|año)\b/i.test(resto);
  return t
    .replace(/\bde cada 10\b/gi, " ")
    .replace(/\b8X\b/g, " ")
    .replace(/\bjugadas?\s+\d(?:\s*(?:,|y|e)\s*\d)*\b/gi, " ")
    .replace(new RegExp(`\\b(?:durante\\s+|dentro\\s+de\\s+)?(?:en\\s+)?los\\s+primeros\\s+${H}\\s+d[ií]as\\b`, "gi"), " ")
    .replace(new RegExp(`\\b(?:(?:a|en|de|hasta|antes\\s+de|despu[eé]s\\s+de|dentro\\s+de|durante)\\s+(?:los\\s+)?|entre\\s+|los\\s+)${H}(?:\\s*,\\s*${H})*(?:\\s+[yo]\\s+${H})?\\s+d[ií]as\\b`, "gi"), (todo: string, i: number, s: string) =>
      esPlazoDeDinero(s.slice(0, i), s.slice(i + todo.length)) ? todo : " "
    )
    // El día del plan con una marca que no deja dudas: desde, hasta, a partir de, del… al…
    .replace(/\b(?:(?:desde|hasta|antes\s+del|despu[eé]s\s+del|a\s+partir\s+del|entre)\s+el\s+|del\s+)d[ií]a\s+(\d{1,2})(?:\s*(?:al|y\s+el|a)\s*(?:d[ií]a\s+)?(\d{1,2}))?\b/gi, (todo: string, a: string, b: string | undefined, i: number, s: string) =>
      [a, b].every(enHorizonte) && !calendario(s.slice(i + todo.length)) ? " " : todo
    )
    // «el día 14», «los días 1 a 7»: solo si no es un plazo de dinero ni un día del calendario.
    .replace(/\b(?:el\s+d[ií]a\s+(\d{1,2})|(?:en\s+)?los\s+d[ií]as\s+(\d{1,2})\s*(?:a|al|y)\s*(\d{1,2}))\b/gi, (todo: string, a: string | undefined, b: string | undefined, c: string | undefined, i: number, s: string) => {
      const resto = s.slice(i + todo.length);
      return [a, b, c].every(enHorizonte) && !calendario(resto) && !esPlazoDeDinero(s.slice(0, i), resto) ? " " : todo;
    });
}

/** Las cantidades escritas en palabras de un texto (ya sin tildes), salvo los conteos de la propia estrategia. */
function numerosEnPalabras(plano: string): string[] {
  const sinConteos = plano.replace(CONTEO_DE_LA_ESTRATEGIA, (m) => " ".repeat(m.length));
  return [...sinConteos.matchAll(NUMERO_EN_PALABRAS)].map((m) => m[0]);
}

/** Las frases de un texto, sin partir los `{{…}}` (que llevan puntos dentro). Cada frase conserva su puntuación. */
export function frasesDe(texto: string): string[] {
  const frases: string[] = [];
  let actual = "";
  let dentro = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (c === "{" && texto[i + 1] === "{") dentro++;
    if (c === "}" && texto[i + 1] === "}" && dentro) dentro--;
    if (c === "\n" && !dentro) {
      if (actual.trim()) frases.push(actual.trim());
      actual = "";
      continue;
    }
    actual += c;
    if (!dentro && /[.;!?]/.test(c) && (i + 1 === texto.length || /\s/.test(texto[i + 1]!))) {
      if (actual.trim()) frases.push(actual.trim());
      actual = "";
    }
  }
  if (actual.trim()) frases.push(actual.trim());
  return frases;
}

/**
 * Las cifras sin origen de un texto: los trozos que las delatan. Vacío = limpio. Lo de dentro de `{{…}}` no cuenta.
 */
export function cifrasSinOrigen(texto: string): string[] {
  const hallazgos: string[] = [];
  const conMarcas = texto.replace(PATRON_LLAVES, (_m, id: string) => (id.startsWith("R:") || id.startsWith("C:mult.") ? " ⟦cuenta⟧ " : " ⟦dato⟧ "));
  const limpio = sinLoPermitido(conMarcas);
  for (const m of limpio.matchAll(/[^\s]*\d[^\s]*/g)) hallazgos.push(m[0]);
  const s = SIMBOLOS.exec(limpio);
  if (s) hallazgos.push(s[0]);
  // Los números en palabras se buscan antes de quitar «de cada 10»: «tres de cada 10» es una cifra.
  hallazgos.push(...numerosEnPalabras(sinTildes(conMarcas)));
  for (const frase of conMarcas.split(/(?<=[.;!?])\s+|\n+/)) {
    const m = MULTIPLICAR.exec(sinTildes(frase));
    if (m && !frase.includes("⟦cuenta⟧")) hallazgos.push(m[0]);
  }
  return [...new Set(hallazgos)];
}

// ─── Preguntas ───────────────────────────────────────────────────────────────────────────────────

const PROMEDIO = /\ben un (?:mes|dia|ano|semana) normal\b|\bmas o menos\b|\bpromedio\b|\bnormalmente\b|\bsuel(?:e|en|es)\b|\bpor lo general\b/;
const POR_EJEMPLO = /por ejemplo|(?:^|[\s(«])(?:p\.\s?)?ej\./;
/**
 * Dos preguntas unidas: «y cuánto», «y qué», «o si». Se mira con tildes: «y qué» pregunta otra cosa; «y que» (sin tilde)
 * es un relativo y no une nada.
 */
const DOS_PREGUNTAS = new RegExp("(?<![\\p{L}])y (?:cu[aá]nt[oa]s?|qué|cómo|cuál(?:es)?|dónde|cuándo|por qué|quién(?:es)?)(?![\\p{L}])|(?<![\\p{L}])o si(?![\\p{L}])", "u");

/**
 * Una pregunta para el dueño, revisada (§6.3, 7; principio de las preguntas orales): una sola pregunta, corta, sin
 * cifras (salvo «de cada 10»), sin promedios ni ejemplos, sin jerga. Devuelve los problemas en palabras; vacío = bien.
 */
export function revisarPregunta(texto: string): string[] {
  const t = texto.trim();
  const plano = sinTildes(t);
  const problemas: string[] = [];
  const cierres = (t.match(/\?/g) ?? []).length; // el «¿» de apertura no cuenta
  if (cierres === 0) problemas.push("no es una pregunta: le falta el signo de cierre");
  if (cierres > 1) problemas.push("trae más de una pregunta");
  if (t.split(/\s+/).filter(Boolean).length > 30) problemas.push("es larga: más de treinta palabras");
  if (/\d/.test(t.replace(/de cada 10/gi, "")) || SIMBOLOS.test(t) || numerosEnPalabras(plano).length) problemas.push("trae una cifra: la cifra la pone el dueño, nunca la pregunta");
  if (DOS_PREGUNTAS.test(t.toLowerCase())) problemas.push("une dos preguntas en una");
  if (PROMEDIO.test(plano)) problemas.push("pide un promedio: se pregunta por el episodio («el mes pasado», «la última vez»)");
  if (POR_EJEMPLO.test(plano)) problemas.push("trae un ejemplo: lo que va en la pregunta se devuelve como respuesta");
  const jerga = JERGA_EN_PREGUNTAS.filter((j) => j.re.test(j.sigla ? t : plano)).map((j) => j.nombre);
  if (jerga.length) problemas.push(`usa palabras que el dueño no usa: ${jerga.join(", ")}`);
  return problemas;
}

// ─── Dónde hay texto ─────────────────────────────────────────────────────────────────────────────

/**
 * Los textos libres de una estrategia, por puntero («*» es cualquier índice o clave). Todo texto que llega a una
 * pantalla está aquí; tests/estrategia-validador.test.ts comprueba que no quede uno afuera.
 */
export const CAMPOS_DE_TEXTO: readonly string[] = [
  "/lectura/*",
  "/gran_apuesta/frase", "/gran_apuesta/por_que",
  "/foda/*/*/texto",
  "/tows/*/estrategia", "/tows/*/pregunta_si_no_hay_cuenta", "/tows/*/recursos", "/tows/*/cambio_de_estructura", "/tows/*/indicador",
  "/caminos/*/nombre", "/caminos/*/filosofia",
  "/caminos/*/jugadas/*/que_se_mueve", "/caminos/*/jugadas/*/por_que", "/caminos/*/jugadas/*/respuesta_del_mercado", "/caminos/*/jugadas/*/si_responde_distinto", "/caminos/*/jugadas/*/que_abre", "/caminos/*/jugadas/*/responsable",
  "/caminos/*/conviene_si",
  "/caminos/*/que_pide/*",
  "/caminos/*/casos/*/caso", "/caminos/*/casos/*/por_que_puede_pasar", "/caminos/*/casos/*/solucion", "/caminos/*/casos/*/senal",
  "/caminos/*/anticipar/*/evento", "/caminos/*/anticipar/*/que_hacemos_antes",
  "/caminos/*/senales_tempranas/*/senal", "/caminos/*/senales_tempranas/*/indicador",
  "/caminos/*/punto_de_decision/que_mirar", "/caminos/*/punto_de_decision/si_va_bien", "/caminos/*/punto_de_decision/si_no",
  "/caminos/*/para_el_dueno/titulo", "/caminos/*/para_el_dueno/por_que", "/caminos/*/para_el_dueno/pasos/*", "/caminos/*/para_el_dueno/te_pedimos/*",
  "/recomendado/por_que", "/recomendado/por_que_no_el_otro",
  "/victorias_14_dias/*/que", "/victorias_14_dias/*/responsable",
  "/oferta/para_quien", "/oferta/resultado_sonado/texto", "/oferta/probabilidad_percibida/texto", "/oferta/tiempo/texto", "/oferta/esfuerzo/texto",
  "/oferta/nombre", "/oferta/promesa", "/oferta/garantia", "/oferta/bonos/*", "/oferta/urgencia_real", "/oferta/oferta_escrita",
  "/medir_desde_el_dia_1/*/nombre", "/medir_desde_el_dia_1/*/como_se_mide", "/medir_desde_el_dia_1/*/quien_anota",
  "/supuestos/*/que_se_supone", "/supuestos/*/por_que",
  "/faltan/*/por_que_importa", "/faltan/*/pregunta_si_otra",
  "/por_que_no_llega",
  "/objeciones/*/objecion", "/objeciones/*/arreglo",
  "/anexos/dinero/lectura", "/anexos/dinero/modelo_de_dinero/como_entra_hoy", "/anexos/dinero/modelo_de_dinero/que_falta/*", "/anexos/dinero/caja",
  "/anexos/terreno/lectura", "/anexos/terreno/restriccion/cual", "/anexos/terreno/restriccion/por_que_manda",
  "/anexos/terreno/personas", "/anexos/terreno/procesos", "/anexos/terreno/producto", "/anexos/terreno/dependencia_del_dueno", "/anexos/terreno/tiempo_del_dueno",
  "/anexos/terreno/arbol/problemas/*/efecto", "/anexos/terreno/arbol/problemas/*/causas/*/causa",
  "/anexos/terreno/arbol/soluciones/*/causa", "/anexos/terreno/arbol/soluciones/*/medio", "/anexos/terreno/arbol/soluciones/*/que",
  "/anexos/terreno/terreno/eliminar/*", "/anexos/terreno/terreno/reducir/*", "/anexos/terreno/terreno/incrementar/*", "/anexos/terreno/terreno/crear/*", "/anexos/terreno/terreno/donde_ganar_sin_pelear",
  "/anexos/terreno/canvas/*/texto",
];

/** Las preguntas que escribe el modelo: se revisan como preguntas para el dueño. */
export const CAMPOS_DE_PREGUNTA: readonly string[] = ["/faltan/*/pregunta_si_otra", "/tows/*/pregunta_si_no_hay_cuenta"];

/** Los textos que se escribieron por código (no por el modelo): no se les pide nada. Una prueba revisa que cada texto esté en una de las dos listas. */
export const CAMPOS_DEL_CODIGO: readonly string[] = ["/nota_de_confianza"];

/** Los textos de una estrategia que casan con los patrones, con su puntero real. */
export function textosEn(obj: unknown, patrones: readonly string[]): { puntero: string; texto: string }[] {
  const salida: { puntero: string; texto: string }[] = [];
  for (const patron of patrones) {
    const partes = patron.split("/").slice(1);
    const bajar = (v: unknown, i: number, camino: string) => {
      if (v == null) return;
      if (i === partes.length) {
        if (typeof v === "string") salida.push({ puntero: camino, texto: v });
        return;
      }
      const p = partes[i]!;
      if (p === "*") {
        if (Array.isArray(v)) v.forEach((x, k) => bajar(x, i + 1, `${camino}/${k}`));
        else if (typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) bajar(x, i + 1, `${camino}/${k}`);
      } else if (typeof v === "object" && !Array.isArray(v)) bajar((v as Record<string, unknown>)[p], i + 1, `${camino}/${p}`);
    };
    bajar(obj, 0, "");
  }
  return salida;
}

/** Lo que lee el dueño de un camino (§8.2): su página, los dos primeros casos y las señales. vistaParaDueno usa lo mismo. */
export function camposDelDueno(e: Pick<Estrategia, "caminos">, letra: LetraCamino): { puntero: string; texto: string }[] {
  const c = e.caminos[letra];
  const base = `/caminos/${letra}`;
  const salida: { puntero: string; texto: string }[] = [];
  salida.push({ puntero: `${base}/para_el_dueno/titulo`, texto: c.para_el_dueno.titulo });
  salida.push({ puntero: `${base}/para_el_dueno/por_que`, texto: c.para_el_dueno.por_que });
  c.para_el_dueno.pasos.forEach((p, i) => salida.push({ puntero: `${base}/para_el_dueno/pasos/${i}`, texto: p }));
  c.para_el_dueno.te_pedimos.forEach((p, i) => salida.push({ puntero: `${base}/para_el_dueno/te_pedimos/${i}`, texto: p }));
  for (const i of casosDelDueno(c)) {
    salida.push({ puntero: `${base}/casos/${i}/caso`, texto: c.casos[i]!.caso });
    salida.push({ puntero: `${base}/casos/${i}/solucion`, texto: c.casos[i]!.solucion });
  }
  c.senales_tempranas.forEach((s, i) => salida.push({ puntero: `${base}/senales_tempranas/${i}/senal`, texto: s.senal }));
  return salida;
}

/** Los dos casos que ve el dueño: primero los del equipo rojo (la voz final), después los de la lente. Los que sumó 8X, no. */
export function casosDelDueno(c: Pick<CaminoFinal, "casos">): number[] {
  const idx = c.casos.map((x, i) => ({ x, i })).filter(({ x }) => x.origen !== "8x");
  return [...idx.filter(({ x }) => x.origen === "equipo_rojo"), ...idx.filter(({ x }) => x.origen !== "equipo_rojo")].slice(0, 2).map(({ i }) => i);
}

// ─── Validar ─────────────────────────────────────────────────────────────────────────────────────

const v = (puntero: string, tipo: TipoViolacion, texto: string, que_hacer: string): Violacion => ({ puntero, tipo, texto, que_hacer });
const QUE_HACER: Record<TipoViolacion, string> = {
  cifra_sin_origen: "Escribir la cifra como {{id}} con un id del paquete, de los cálculos, de un supuesto o de una proyección; o quitarla.",
  ref_desconocida: "Citar solo ids que existen en la versión.",
  efecto_mal_armado: "Que el efecto nombre una línea, una fuga o un dato de hoy del tipo correcto, con un supuesto de su clave.",
  supuesto_fuera_de_limite: "Dejar el rango dentro de su límite, con el bajo antes que el alto y en la unidad del catálogo.",
  supuesto_de_estado_actual: "Lo que es cuánto es algo hoy no se supone: se anota en «faltan» y sale como pregunta.",
  referencia_como_dato: "La referencia del rubro y el calendario son contexto: nunca el ancla, el efecto ni la meta.",
  pregunta_mal_hecha: "Una sola pregunta, corta, por el episodio y sin cifras ni jerga.",
  palabra_que_el_dueno_no_ve: "Decirlo con palabras de todos los días.",
  nombre_de_referente: "Quitar el nombre del autor, del libro o de la empresa: se dice la idea, no de quién es.",
  responsable_no_encontrado: "Elegir a una persona de la empresa, o dejarlo por definir.",
  fecha_fuera_de_horizonte: "Anticipar solo lo que pasa en los tres meses que siguen.",
  pide_mas_caja_de_la_que_hay: "Empezar por lo que no pide dinero, o ver de dónde sale.",
  cifra_de_la_consultora: "Es tu cifra: queda con el chip «Escrito por la consultora».",
  supuesto_en_el_tope: "Mirar si con lo bajo del rango el camino sigue valiendo la pena, o traer el dato que sostenga lo alto.",
};

/** Los meses del horizonte: el de hoy y los tres que siguen (AAAA-MM). */
function mesesDelHorizonte(hoy: string): string[] {
  const [a, m] = hoy.split("-").map(Number) as [number, number];
  return [0, 1, 2, 3].map((k) => {
    const mm = (m - 1 + k) % 12;
    return `${a + Math.floor((m - 1 + k) / 12)}-${String(mm + 1).padStart(2, "0")}`;
  });
}

/** Lo que tiene que ser cada dato que nombra un efecto. */
const PREFIJOS_DATO_DE_HOY = /^[NQXLB]:/;

/**
 * Valida una estrategia armada contra sus ids. `refs` son los de refsDeEstrategia (paquete, cálculos, supuestos y
 * proyecciones). Devuelve errores y avisos; un error bloquea la aprobación.
 */
export function validar(e: Estrategia, refs: ReadonlyMap<string, RefValor>, opciones: OpcionesValidacion = {}): Validacion {
  const errores: Violacion[] = [...e.problemas];
  const avisos: Violacion[] = [];
  const editados = opciones.editados ?? new Set<string>();
  const dueno = new Set([...camposDelDueno(e, "a"), ...camposDelDueno(e, "b")].map((x) => x.puntero));
  const preguntas = new Set(textosEn(e, CAMPOS_DE_PREGUNTA).map((x) => x.puntero));

  // ── Los textos.
  for (const { puntero, texto } of textosEn(e, CAMPOS_DE_TEXTO)) {
    if (!texto.trim()) continue;
    const cifras = cifrasSinOrigen(texto);
    if (cifras.length) {
      if (editados.has(puntero)) avisos.push(v(puntero, "cifra_de_la_consultora", `Cifra escrita a mano: ${cifras.join(", ")}.`, QUE_HACER.cifra_de_la_consultora));
      else errores.push(v(puntero, "cifra_sin_origen", `Cifra sin origen: ${cifras.join(", ")}.`, QUE_HACER.cifra_sin_origen));
    }
    for (const id of refsEnTexto(texto)) {
      if (!PATRON_REF.test(id) || !refs.has(id)) errores.push(v(puntero, "ref_desconocida", `Cita «${id}», que no existe en esta versión.`, QUE_HACER.ref_desconocida));
    }
    if (/\{\{|\}\}/.test(texto.replace(PATRON_LLAVES, ""))) errores.push(v(puntero, "ref_desconocida", "Tiene llaves sueltas que no citan ningún dato.", QUE_HACER.ref_desconocida));
    const autores = referentesEn(texto);
    if (autores.length) errores.push(v(puntero, "nombre_de_referente", `Nombra a ${autores.join(", ")}.`, QUE_HACER.nombre_de_referente));
    if (dueno.has(puntero) || preguntas.has(puntero)) {
      const p = palabrasQueElDuenoNoVe(texto);
      if (p.length) errores.push(v(puntero, "palabra_que_el_dueno_no_ve", `El dueño leería: ${p.join(", ")}.`, QUE_HACER.palabra_que_el_dueno_no_ve));
    }
    if (preguntas.has(puntero)) {
      const p = revisarPregunta(texto);
      if (p.length) errores.push(v(puntero, "pregunta_mal_hecha", `La pregunta ${p.join("; ")}.`, QUE_HACER.pregunta_mal_hecha));
    }
  }

  // ── Los ids sueltos: refs, anclas, bases y metas.
  const revisarId = (puntero: string, id: string | null | undefined, comoDato = false) => {
    if (!id) return;
    if (!refs.has(id)) errores.push(v(puntero, "ref_desconocida", `Cita «${id}», que no existe en esta versión.`, QUE_HACER.ref_desconocida));
    else if (comoDato && /^[ZT]:/.test(id)) errores.push(v(puntero, "referencia_como_dato", `Usa «${refs.get(id)!.texto}» (contexto) como si fuera un dato de la empresa.`, QUE_HACER.referencia_como_dato));
  };
  const recorrerRefs = (x: unknown, camino: string): void => {
    if (Array.isArray(x)) x.forEach((y, i) => recorrerRefs(y, `${camino}/${i}`));
    else if (x && typeof x === "object") {
      for (const [k, y] of Object.entries(x as Record<string, unknown>)) {
        if (k === "proyeccion" || k === "impacto" || k === "cambiadas" || k === "cuentas" || k === "problemas" || k === "quitado" || k === "destraban" || k === "efecto" || k === "efecto_retirado") continue;
        if (k === "refs" && Array.isArray(y)) y.forEach((id, i) => typeof id === "string" && revisarId(`${camino}/refs/${i}`, id));
        else recorrerRefs(y, `${camino}/${k}`);
      }
    }
  };
  recorrerRefs(e, "");
  e.supuestos.forEach((s, i) => revisarId(`/supuestos/${i}/ancla`, s.ancla, true));
  e.medir_desde_el_dia_1.forEach((m, i) => {
    revisarId(`/medir_desde_el_dia_1/${i}/base`, m.base, true);
    revisarId(`/medir_desde_el_dia_1/${i}/meta_30`, m.meta_30, true);
    revisarId(`/medir_desde_el_dia_1/${i}/meta_90`, m.meta_90, true);
  });
  revisarId("/oferta/precio", e.oferta.precio, true);

  // ── Los supuestos (4 y 5). Uno retirado por 8X ya está en `quitado`: no se cuenta dos veces.
  e.supuestos.forEach((s, i) => {
    if (s.retirado) return;
    const p = problemaDeSupuesto(s, refs);
    if (p) errores.push(v(`/supuestos/${i}`, p.tipo, `Supuesto «${s.que_se_supone}»: ${p.texto}.`, QUE_HACER[p.tipo]));
  });

  // ── Los efectos (3 y 6).
  const revisarEfecto = (puntero: string, ef: JugadaFinal["efecto"], camino: CaminoFinal | null) => {
    if (!ef) return;
    const mal = (texto: string) => errores.push(v(puntero, "efecto_mal_armado", texto, QUE_HACER.efecto_mal_armado));
    for (const id of refsDeEfecto(ef)) {
      if (/^[ZT]:/.test(id)) errores.push(v(puntero, "referencia_como_dato", `El efecto usa «${id}», que es contexto y no un dato de la empresa.`, QUE_HACER.referencia_como_dato));
      else if (!refs.has(id)) errores.push(v(puntero, "ref_desconocida", `El efecto cita «${id}», que no existe en esta versión.`, QUE_HACER.ref_desconocida));
    }
    if (ef.tipo === "precio_linea" || ef.tipo === "costo_parte" || ef.tipo === "volumen_linea") {
      const corto = /^L:[A-Za-z0-9_]+/.exec(ef.linea)?.[0];
      if (!corto || !refs.has(corto)) mal(`«${ef.linea}» no es una línea de lo que vende la empresa.`);
      else if (ef.tipo === "costo_parte") {
        const partes = opciones.partes?.get(corto);
        if (partes && !partes.some((p) => p.trim().toLowerCase() === ef.parte.trim().toLowerCase())) mal(`«${refs.get(corto)!.texto}» no tiene una parte del costo llamada «${ef.parte}».`);
      }
    }
    if (ef.tipo === "conversion" || ef.tipo === "recompra") {
      for (const id of refsDeEfecto(ef)) if (!PREFIJOS_DATO_DE_HOY.test(id) && !/^[ZT]:/.test(id)) mal(`«${id}» tiene que ser un dato de hoy (un número de la empresa o una respuesta del dueño), no ${id.startsWith("S:") ? "un supuesto" : "un cálculo"}.`);
    }
    if (ef.tipo === "cierre_fuga" && !/^C:fuga\./.test(ef.fuga)) mal(`«${ef.fuga}» no es una fuga del mes${ef.fuga.startsWith("C:parado.") ? ": es dinero parado" : ""}.`);
    if (ef.tipo === "habilitador") {
      const abre = idJugada(ef.abre);
      const existe = camino ? camino.jugadas.some((j) => j.id === abre) : (["a", "b"] as const).some((l) => e.caminos[l].jugadas.some((j) => j.id === abre));
      if (!existe) mal(`Abre la jugada «${ef.abre}», que no está en el camino.`);
    }
    const s = supuestoDeEfecto(ef);
    if (s) {
      const def = e.supuestos.find((x) => x.id === s.id);
      if (!def) mal(`Usa el supuesto «${s.id}», que no existe.`);
      else if (def.clave !== s.clave) mal(`Usa el supuesto de «${CLAVES_SUPUESTO[def.clave]?.nombre ?? def.clave}» donde va «${CLAVES_SUPUESTO[s.clave]?.nombre ?? s.clave}».`);
    }
  };
  for (const letra of ["a", "b"] as const) {
    const c = e.caminos[letra];
    c.jugadas.forEach((j, i) => revisarEfecto(`/caminos/${letra}/jugadas/${i}/efecto`, j.efecto, c));
    if (c.jugadas.length < 3 || c.jugadas.length > 5) errores.push(v(`/caminos/${letra}/jugadas`, "efecto_mal_armado", `Con los cambios, el camino quedó con ${c.jugadas.length} jugadas: tienen que ser de tres a cinco.`, "Quitar, reemplazar o agregar de modo que queden de tres a cinco."));
    if (c.casos.length < 2) errores.push(v(`/caminos/${letra}/casos`, "efecto_mal_armado", "El camino quedó con menos de dos casos a tener en cuenta.", "Dejar al menos dos casos, cada uno con su solución."));
  }
  e.tows.forEach((t, i) => revisarEfecto(`/tows/${i}/efecto`, t.efecto, null));
  (e.victorias_14_dias ?? []).forEach((x, i) => revisarEfecto(`/victorias_14_dias/${i}/efecto`, x.efecto ?? null, null));

  // ── Las preguntas que faltan: una clave del catálogo que se pregunta, o «otra» con su pregunta.
  e.faltan.forEach((f, i) => {
    const def = CLAVES_SUPUESTO[f.clave];
    if (!def || def.tipo !== "estado_actual") errores.push(v(`/faltan/${i}`, "ref_desconocida", `«${f.clave}» no es algo que se le pueda preguntar al dueño en el catálogo.`, "Usar una clave de «cuánto es hoy» del catálogo, u «otra» con su pregunta."));
    else if (f.clave === "otra" && !f.pregunta_si_otra?.trim()) errores.push(v(`/faltan/${i}`, "pregunta_mal_hecha", "Pide algo que el catálogo no nombra y no trae la pregunta.", QUE_HACER.pregunta_mal_hecha));
  });

  // ── Avisos.
  for (const letra of ["a", "b"] as const) {
    const c = e.caminos[letra];
    c.jugadas.forEach((j, i) => {
      if (!j.responsable_encontrado) avisos.push(v(`/caminos/${letra}/jugadas/${i}/responsable`, "responsable_no_encontrado", `8X no encontró a «${j.responsable_dicho ?? j.responsable}» en la empresa.`, QUE_HACER.responsable_no_encontrado));
    });
    const horizonte = mesesDelHorizonte(e.hoy);
    c.anticipar.forEach((a, i) => {
      if (!horizonte.includes(a.cuando)) avisos.push(v(`/caminos/${letra}/anticipar/${i}/cuando`, "fecha_fuera_de_horizonte", `Anticipa algo de ${a.cuando}, fuera de los tres meses que siguen.`, QUE_HACER.fecha_fuera_de_horizonte));
    });
    if (excesoDeCaja(c, refs)) avisos.push(v(`/caminos/${letra}/que_pide/dinero`, "pide_mas_caja_de_la_que_hay", "Lo que pide este camino en dinero pasa lo que hay en caja o lo que el dueño puede poner.", QUE_HACER.pide_mas_caja_de_la_que_hay));
  }
  e.supuestos.forEach((s, i) => {
    if (s.retirado || !s.usado_en.length || problemaDeSupuesto(s, refs) || !enElTope(s, refs)) return;
    avisos.push(v(`/supuestos/${i}`, "supuesto_en_el_tope", `«${s.que_se_supone}» llega al tope de lo que es creíble en 90 días: la cuenta descansa en lo más optimista.`, QUE_HACER.supuesto_en_el_tope));
  });
  e.victorias_14_dias.forEach((x, i) => {
    if (!x.responsable_encontrado) avisos.push(v(`/victorias_14_dias/${i}/responsable`, "responsable_no_encontrado", `8X no encontró a «${x.responsable_dicho ?? x.responsable}» en la empresa.`, QUE_HACER.responsable_no_encontrado));
  });

  return { errores: unicas(errores), avisos: unicas(avisos) };
}

const unicas = (xs: Violacion[]) => {
  const vistas = new Set<string>();
  return xs.filter((x) => {
    const k = `${x.puntero}|${x.tipo}|${x.texto}`;
    return vistas.has(k) ? false : (vistas.add(k), true);
  });
};

/** Las partes del costo de cada línea (para `costo_parte`), desde los cálculos congelados. */
export function partesDeLineas(calculos: Pick<Calculos, "lineas" | "tablero">): Map<string, string[]> {
  return new Map(calculos.lineas.map((l) => [l.corto, calculos.tablero.productos.find((p) => p.id === l.id)?.costo_partes.map((c) => c.nombre) ?? []]));
}

// ─── Quitar lo inválido ──────────────────────────────────────────────────────────────────────────

const TIPOS_DE_TEXTO = new Set<TipoViolacion>(["cifra_sin_origen", "ref_desconocida", "nombre_de_referente", "palabra_que_el_dueno_no_ve", "pregunta_mal_hecha"]);
const HUECO = "\u0000";

/** El objeto que tiene el último tramo de un puntero, y ese tramo. */
function enPuntero(raiz: unknown, puntero: string): { padre: Record<string, unknown> | unknown[]; clave: string } | null {
  const partes = puntero.split("/").slice(1);
  let x: unknown = raiz;
  for (const p of partes.slice(0, -1)) {
    if (x == null || typeof x !== "object") return null;
    x = (x as Record<string, unknown>)[p];
  }
  if (x == null || typeof x !== "object") return null;
  return { padre: x as Record<string, unknown>, clave: partes[partes.length - 1]! };
}

/** Si una frase, sola, sigue teniendo el problema de ese tipo. */
function fraseConProblema(frase: string, tipo: TipoViolacion, refs: ReadonlyMap<string, RefValor>): boolean {
  switch (tipo) {
    case "cifra_sin_origen":
      return cifrasSinOrigen(frase).length > 0;
    case "ref_desconocida":
      return refsEnTexto(frase).some((id) => !PATRON_REF.test(id) || !refs.has(id)) || /\{\{|\}\}/.test(frase.replace(PATRON_LLAVES, ""));
    case "nombre_de_referente":
      return referentesEn(frase).length > 0;
    case "palabra_que_el_dueno_no_ve":
      return palabrasQueElDuenoNoVe(frase).length > 0;
    default:
      return false;
  }
}

/**
 * Lo que sigue inválido después de la reparación se quita, con marca visible (§5.4): las frases con la cifra sin
 * origen, el id que no existe, el efecto que no se puede calcular (la jugada queda sin número), el supuesto fuera de su
 * límite (queda fuera de las cuentas), la pregunta que no se puede hacer. Un camino que quedó con menos de tres jugadas
 * recupera las que el equipo rojo le quitó; uno con más de cinco pierde la agregada. Cada cosa quitada queda en
 * `quitado`, sin resolver: la consultora la edita o acepta que se quite, y recién entonces se puede aprobar. Las
 * cuentas se rehacen al final.
 */
export function quitarLoInvalido(e: Estrategia, errores: readonly Violacion[], ctx: { paquete: Paquete; calculos: Calculos }): Estrategia {
  const refs = refsDeEstrategia(e, ctx.paquete, ctx.calculos);
  const s: Estrategia = structuredClone(e);
  const marcar = (puntero: string, tipo: string, que: string, motivo?: string) => s.quitado.push({ puntero, tipo, quitado: que, motivo: motivo ?? MARCA_QUITADO[tipo] ?? "8X quitó esto", resuelto: false });
  const faltasFuera = new Set<number>();

  for (const err of errores) {
    const p = err.puntero;
    // Lo que no se pudo armar (un ítem del FODA o un cruce que no existe) ya quedó fuera: se deja dicho.
    if (e.problemas.some((x) => x.puntero === p && x.tipo === err.tipo && x.texto === err.texto)) {
      marcar(p, err.tipo, err.texto, err.texto);
      continue;
    }
    // Un camino con jugadas de menos o de más.
    const camino = /^\/caminos\/([ab])\/jugadas$/.exec(p);
    if (camino) {
      const c = s.caminos[camino[1] as LetraCamino];
      // Sale la agregada (la de número más alto), no la última en el orden de juego.
      while (c.jugadas.length > 5) {
        const k = c.jugadas.reduce((m, j, i, xs) => (Number(j.id.slice(1)) > Number(xs[m]!.id.slice(1)) ? i : m), 0);
        marcar(p, err.tipo, c.jugadas.splice(k, 1)[0]!.que_se_mueve, MARCA_JUGADA_DE_MAS);
      }
      const recuperar = [...c.cambiadas].sort((a, b) => Number(a.jugada.id.slice(1)) - Number(b.jugada.id.slice(1)));
      while (c.jugadas.length < 3 && recuperar.length) {
        const x = recuperar.shift()!;
        c.cambiadas = c.cambiadas.filter((y) => y !== x);
        // Vuelve a su lugar en la lente (J1 primero), sin pasar del final.
        c.jugadas.splice(Math.min(Number(x.jugada.id.slice(1)) - 1, c.jugadas.length), 0, x.jugada);
        marcar(p, err.tipo, x.jugada.que_se_mueve, MARCA_CAMINO_RESTAURADO);
      }
      ordenarCamino(c);
      continue;
    }
    if (/^\/caminos\/[ab]\/casos$/.test(p)) {
      marcar(p, err.tipo, err.texto, err.texto);
      continue;
    }
    // Un efecto que no se puede calcular: la jugada (o el cruce) queda sin número.
    const efecto = /^(\/caminos\/([ab])\/jugadas\/(\d+)|\/tows\/(\d+)|\/victorias_14_dias\/(\d+))\/efecto$/.exec(p);
    if (efecto) {
      const duenio: { efecto?: JugadaFinal["efecto"]; efecto_retirado?: JugadaFinal["efecto_retirado"] } | undefined = efecto[2]
        ? s.caminos[efecto[2] as LetraCamino].jugadas[Number(efecto[3])]
        : efecto[4] != null
          ? s.tows[Number(efecto[4])]
          : s.victorias_14_dias[Number(efecto[5])];
      if (duenio?.efecto) {
        duenio.efecto_retirado = { efecto: duenio.efecto, motivo: err.texto };
        duenio.efecto = null;
        marcar(p, err.tipo, err.texto);
      }
      continue;
    }
    // Un supuesto: queda fuera de las cuentas. Sin su ancla, también, si la clave la pide.
    const sup = /^\/supuestos\/(\d+)(\/ancla)?$/.exec(p);
    if (sup) {
      const x = s.supuestos[Number(sup[1])];
      if (!x) continue;
      if (sup[2]) {
        marcar(p, err.tipo, x.ancla ?? "");
        x.ancla = null;
        if (CLAVES_SUPUESTO[x.clave]?.pide_ancla && !x.retirado) x.retirado = err.texto;
      } else if (!x.retirado) {
        x.retirado = err.texto;
        marcar(p, err.tipo, x.que_se_supone);
      }
      continue;
    }
    // Una pregunta que no se puede hacer: se quita entera.
    const falta = /^\/faltan\/(\d+)(\/pregunta_si_otra)?$/.exec(p);
    if (falta) {
      const f = e.faltan[Number(falta[1])];
      faltasFuera.add(Number(falta[1]));
      marcar(p, err.tipo, f?.pregunta_si_otra ?? f?.clave ?? "");
      continue;
    }
    const lugar = enPuntero(s, p);
    if (!lugar) continue;
    const { padre, clave } = lugar;
    const valor = (padre as Record<string, unknown>)[clave];
    // Un id suelto en una lista de refs.
    if (Array.isArray(padre) && /\/refs\/\d+$/.test(p)) {
      marcar(p, err.tipo, String(valor));
      padre[Number(clave)] = HUECO;
      continue;
    }
    // Un id en una base, una meta o el precio de la oferta, o la pregunta de un cruce: se deja vacío.
    if (/\/(base|meta_30|meta_90|precio|pregunta_si_no_hay_cuenta)$/.test(p)) {
      marcar(p, err.tipo, String(valor ?? ""));
      (padre as Record<string, unknown>)[clave] = null;
      continue;
    }
    // Un texto: se quitan las frases que traen el problema (si ninguna lo trae sola, el texto entero).
    if (typeof valor === "string" && TIPOS_DE_TEXTO.has(err.tipo)) {
      const frases = frasesDe(valor);
      const malas = frases.filter((f) => fraseConProblema(f, err.tipo, refs));
      const quedan = malas.length ? frases.filter((f) => !malas.includes(f)) : [];
      (padre as Record<string, unknown>)[clave] = quedan.join(" ").trim();
      marcar(p, err.tipo, malas.length ? malas.join(" ") : valor);
    }
  }
  s.faltan = s.faltan.filter((_f, i) => !faltasFuera.has(i));
  const sinHuecos = (x: unknown): void => {
    if (Array.isArray(x)) {
      for (let i = x.length - 1; i >= 0; i--) if (x[i] === HUECO) x.splice(i, 1);
      x.forEach(sinHuecos);
    } else if (x && typeof x === "object") Object.values(x).forEach(sinHuecos);
  };
  sinHuecos(s);
  s.problemas = [];
  return reproyectar(s, ctx.paquete, ctx.calculos);
}

// ─── El estado de la revisión ────────────────────────────────────────────────────────────────────

/**
 * «lista» si no queda ningún error ni nada quitado sin resolver; si no, «con_observaciones» (§5.4). Resuelto el último,
 * la versión vuelve a «lista»: sin eso, aprobar_estrategia nunca la aceptaría.
 */
export function estadoDeRevision(e: Pick<Estrategia, "quitado">, validacion: Pick<Validacion, "errores">): "lista" | "con_observaciones" {
  return validacion.errores.length || e.quitado.some((q) => !q.resuelto) ? "con_observaciones" : "lista";
}

/** La consultora resolvió lo quitado en un puntero (lo editó o aceptó que se quite). */
export function resolverQuitado(e: Estrategia, puntero: string): Estrategia {
  const s = structuredClone(e);
  for (const q of s.quitado) if (q.puntero === puntero) q.resuelto = true;
  return s;
}
