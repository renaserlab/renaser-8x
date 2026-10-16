/**
 * LO DECLARADO FRENTE A LO EXTRAÍDO, EN NÚMEROS. Deterministas, sin modelo de IA, sin reloj.
 *
 * Lo que un consultor hace a mano cuando le llegan los papeles de una empresa: pone al lado lo que el
 * dueño dijo («tengo como 40.000 en mercadería») y lo que el documento muestra (el inventario suma
 * 79.782), y si no cuadran lo anota como contradicción CON LAS DOS CIFRAS A LA VISTA, cada una con su
 * rótulo. Ninguna pasa a «verificada» por haberse comparado: verificar es trabajo de una persona con el
 * dueño delante. Comparar solo produce una pregunta.
 *
 * Reglas que fija este módulo (13-10-2026, remate 4):
 *  - una cifra APROXIMADA («como 40.000», «unos 80 mil») tolera 20 % de diferencia; una EXACTA, 5 %;
 *  - la aproximación solo cuenta si acompaña a ESA cifra: «casi todo al contado» no vuelve aproximado
 *    nada, y «unos 3 clientes» en la nota de un 80.000 tampoco (habla de otro número);
 *  - dos cifras de periodos distintos NO se comparan: «no comparable», nunca contradicción;
 *  - sin dato no hay par: «no lo sé» es desconocido, no cero ni promedio;
 *  - una columna con celdas vacías no se suma: una celda vacía no es cero;
 *  - lo descartado, lo verificado y lo conciliado no entran: ya pasaron por una persona.
 *
 * Hasta hoy estas reglas vivían en tests/pilotos/_reglas.ts. Aquí pasan a producto: el manejador
 * `contrastar` las corre sobre los números de company_metricas y la Matriz de Realidad las muestra.
 *
 * CÓMO EXISTE EL PAR (cierre Z1, 13-10-2026). company_metricas guarda UN número por (empresa, clave,
 * periodo). Cuando el Excel trae 79.782 para el mismo número que el dueño declaró en 40.000, la fila se
 * reescribe, pero quien guarda conserva la cifra del otro lado en la columna `cifra_desplazada` (jsonb,
 * supabase/migracion-cifra-desplazada.sql). Los tres que guardan lo hacen así: `guardarMetricas`
 * (handlers/extraer.ts), api/portal/numeros y el espejo de indicadores (kpis/_registro.ts) leen la
 * fila previa ENTERA, arman la suya con `conCifraDesplazada` y la escriben con `escribirConservando`.
 * Si la base todavía no tiene la columna, el número nuevo se guarda igual, sin la cifra del otro lado
 * y con un aviso en consola: en esa base el par no existe, y la pantalla lo dice.
 * Una excepción, del espejo: una cifra EXTRAÍDA que nadie revisó no la reemplaza lo que se registra en
 * un indicador. Ahí el número de la fila no se toca y lo registrado se guarda al lado, como declarado
 * (`declaradoAlLado`): el par existe igual, y la pantalla ya no dice que falta la cifra declarada.
 *
 * LO GUARDADO AL LADO NO SE ESCONDE. Si la fila se queda después sin cifra propia (alguien respondió
 * «no lo sé» tras el Excel, o el consultor descartó la lectura del documento), la cifra que guarda al
 * lado sigue pendiente de conciliar: cuenta en su lado (`ladosDisponibles`) y la pantalla la nombra
 * (`cifrasSoloAlLado`). Y cuando la cifra del documento de un par es la guardada al lado, el par lo
 * dice (`extraido_al_lado`): esa cifra ya no figura en la revisión de su fuente.
 */
import type { Hoja, ValorCelda } from "@/lib/documentos/excel";
import type { Calculo } from "@/lib/finanzas";
import { normalizarMetrica, VITAL_POR_CLAVE, RECONOCIDA_POR_CLAVE, PERIODO_DORADA, type Vital } from "@/lib/metricas";
import { nombreDePeriodo } from "@/lib/temporadas";

// ─── Lo que el dueño declara: qué clase de cifra es ─────────────────────────────────────────────

export type CifraDeclarada =
  | { clase: "exacta"; valor: number; texto: string }
  | { clase: "aproximada"; valor: number; texto: string }
  | { clase: "rango"; valor: null; desde: number; hasta: number; texto: string }
  | { clase: "desconocida"; valor: null; texto: string };

/** Una declaración que sí trae cifra: con la desconocida no se forma par. */
export type CifraLeida = Exclude<CifraDeclarada, { clase: "desconocida" }>;

const NUMERO = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?`;
/** «40 mil», «2 millones», «1,5 millones»: así hablan los dueños y así lo escribe quien transcribe la voz. */
const MULTIPLO = String.raw`(?:\s*(millones|mill[oó]n|mil)(?![a-záéíóúñ]))?`;
const CIFRA = new RegExp(`(${NUMERO})${MULTIPLO}`, "i");
const RANGO = new RegExp(String.raw`entre\s+(${NUMERO})${MULTIPLO}\s+y\s+(${NUMERO})${MULTIPLO}`, "i");

const factorDe = (palabra: string | undefined): number => (!palabra ? 1 : /^mil$/i.test(palabra) ? 1_000 : 1_000_000);
const dosDecimales = (n: number): number => Math.round(n * 100) / 100;
/** Aplica el «mil» o el «millones». Quita el polvo de la coma flotante (1,1 × 1.000 es 1.100, no 1.100,0000000000002) sin tocar lo que no se multiplica. */
const porFactor = (n: number, factor: number): number => (factor === 1 ? n : dosDecimales(n * factor));

/** Convierte un número escrito a mano, con miles en coma o punto, a número. «0.125» es un decimal, no 125. */
function aNumero(crudo: string): number | null {
  let s = crudo.trim();
  const miles = /^[1-9]\d{0,2}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(s);
  if (miles) {
    // El último separador es decimal solo si deja 1 o 2 dígitos; los demás son de miles.
    const ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
    const cola = s.slice(ultimo + 1);
    if (cola.length === 3) s = s.replace(/[.,]/g, "");
    else s = s.slice(0, ultimo).replace(/[.,]/g, "") + "." + cola;
  } else {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** La primera cifra del texto, con su «mil» o su «millones» si los trae. */
function cifraDe(texto: string): number | null {
  const m = CIFRA.exec(texto);
  if (!m) return null;
  const n = aNumero(m[1]);
  return n === null ? null : porFactor(n, factorDe(m[2]));
}

const DESCONOCIDO = /no (lo )?s[eé]\b|no tengo (la suma|el dato|idea)|no lo tengo|desconozco|casi nada|ni idea/i;
/** Lo que puede ir entre el cuantificador y la cifra: «como S/ 40,000», «unos $ 80 mil». */
const ANTES_DE_LA_CIFRA = String.raw`(?:(?:S\/\.?|US\$|\$)\s*)?`;
/** Minúsculas y sin tildes, para comparar palabras. */
const sinTildes = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Los números en letras que dice un dueño, como los deja quien transcribe la voz. En un Map: «constructor» es una palabra, no un número. */
const EN_LETRAS: ReadonlyMap<string, number> = new Map(Object.entries({
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
  doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
}));
const ES_MILLON = /^mill(?:on|ones)$/;

/**
 * La cifra en letras con que EMPIEZA un texto: «cuarenta mil», «dos mil quinientos», «treinta y cinco»,
 * «medio millón», «un millón y medio». null si no empieza con una. «Un» y «una» a secas son artículos
 * («una sola caja»): solo cuentan delante de «mil» o «millón».
 */
function cifraEnLetras(texto: string): number | null {
  const palabras = sinTildes(texto).split(/[^a-z\s]/)[0].trim().split(/\s+/).filter(Boolean);
  let total = 0;
  let grupo = 0;
  let leidas = 0;
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i].replace(/ientas$/, "ientos");
    const sig = palabras[i + 1] ?? "";
    const n = EN_LETRAS.get(p);
    if (p === "medio" && ES_MILLON.test(sig)) {
      total += 500_000;
      i++;
    } else if (p === "y" && sig === "medio" && ES_MILLON.test(palabras[i - 1] ?? "")) {
      total += 500_000;
      i++;
    } else if (p === "y" && grupo % 100 >= 30 && grupo % 10 === 0 && (EN_LETRAS.get(sig) ?? 10) < 10) {
      continue; // «treinta y cinco»: la «y» no suma ni corta
    } else if (p === "mil") {
      total += (grupo || 1) * 1_000;
      grupo = 0;
    } else if (ES_MILLON.test(p)) {
      total = (total + grupo > 0 ? total + grupo : 1) * 1_000_000;
      grupo = 0;
    } else if (n !== undefined) {
      if (n === 1 && !leidas && sig !== "mil" && !ES_MILLON.test(sig)) return null;
      grupo += n;
    } else break;
    leidas++;
  }
  return leidas ? total + grupo : null;
}

const CIFRA_AL_INICIO = new RegExp(`^${ANTES_DE_LA_CIFRA}(${NUMERO})${MULTIPLO}`, "i");
const TODA_CIFRA = new RegExp(`(${NUMERO})${MULTIPLO}`, "gi");

/** La cifra con que empieza un texto, en dígitos («40.000», «S/ 40 mil») o en letras («cuarenta mil»). null si no empieza con una. */
function cifraAlInicio(texto: string): number | null {
  const m = CIFRA_AL_INICIO.exec(texto);
  if (!m) return cifraEnLetras(texto);
  const n = aNumero(m[1]);
  return n === null ? null : porFactor(n, factorDe(m[2]));
}

/** Todas las cifras que menciona un texto, en dígitos o en letras. */
function cifrasDe(texto: string): number[] {
  const cifras: number[] = [];
  for (const m of texto.matchAll(TODA_CIFRA)) {
    const n = aNumero(m[1]);
    if (n !== null) cifras.push(porFactor(n, factorDe(m[2])));
  }
  const palabras = texto.split(/\s+/);
  for (let i = 0; i < palabras.length; i++) {
    const n = cifraEnLetras(palabras.slice(i).join(" "));
    if (n !== null) cifras.push(n);
  }
  return cifras;
}

/** Lo que solo dice algo de una cifra cuando va PEGADO a ella: «como», «unos», «casi», «cerca de», «alrededor de», «por ahí de», «calculo que». */
const CUANTIFICADOR = new RegExp(
  String.raw`(?<![a-záéíóúñ])(?:como|un[oa]s|casi|cerca\s+de|alrededor\s+de|por\s+ah[ií](?:\s+de)?|calculo(?:\s+que)?(?:\s+(?:son|es|ser[aá]n?))?)\s+(?:(?:l[oa]s|un[oa]s)\s+)?`,
  "gi"
);
/** La cifra y, detrás, «por ahí»: «40 mil por ahí». */
const CIFRA_POR_AHI = new RegExp(String.raw`(${NUMERO})${MULTIPLO}(?:\s+soles)?,?\s+por\s+ah[ií]`, "gi");
/** Lo que solo se dice de una cifra. */
const PALABRA_DE_APROXIMACION = /aprox|m[aá]s o menos|redondeando/i;

/**
 * ¿El texto dice que ESA cifra es aproximada? Solo cuenta lo que la acompaña A ELLA:
 *  - «como», «unos/unas», «casi», «cerca de», «alrededor de», «por ahí de» y «calculo que» valen PEGADOS
 *    a la cifra («como 40.000», «casi 40 mil», «alrededor de los cuarenta mil»). Sueltos son un artículo,
 *    una comparación o un lugar («una sola caja», «casi todo al contado», «cerca del mercado», «cálculo
 *    del contador»). Y pegados a OTRO número hablan de ese otro: «unos 3 clientes», «como 2 veces al
 *    mes» o «cerca de 3 cuadras» en la nota de un 80.000 no dicen nada de cuán exacto es el 80.000;
 *  - «aprox.», «aproximado», «más o menos» y «redondeando» solo se dicen de una cifra y valen donde
 *    estén, salvo que el texto traiga cifras y ninguna sea esta («aprox. 3 clientes al día»).
 * Tomar por aproximada una cifra exacta le daría 20 % de tolerancia y escondería una diferencia real:
 * ante la duda, exacta.
 */
function aproximaA(texto: string, cifra: number): boolean {
  if (!texto) return false;
  const esLaCifra = (n: number | null): boolean => n !== null && dosDecimales(n) === dosDecimales(cifra);
  for (const m of texto.matchAll(CUANTIFICADOR)) {
    if (esLaCifra(cifraAlInicio(texto.slice((m.index ?? 0) + m[0].length)))) return true;
  }
  for (const m of texto.matchAll(CIFRA_POR_AHI)) {
    const n = aNumero(m[1]);
    if (n !== null && esLaCifra(porFactor(n, factorDe(m[2])))) return true;
  }
  if (!PALABRA_DE_APROXIMACION.test(texto)) return false;
  const mencionadas = cifrasDe(texto);
  return !mencionadas.length || mencionadas.some(esLaCifra);
}

/**
 * Clasifica lo que dijo el dueño. La regla que importa: una respuesta sin número no produce un número.
 * «No lo sé» es desconocido, «entre 18.000 y 25.000» es un rango sin punto medio inventado, «como 40.000»
 * es aproximado (y la comparación con un documento debe tolerarle más que a una cifra exacta).
 */
export function leerDeclaracion(v: unknown): CifraDeclarada {
  if (typeof v === "number" && Number.isFinite(v)) return { clase: "exacta", valor: v, texto: String(v) };
  if (v === null || v === undefined) return { clase: "desconocida", valor: null, texto: "" };
  const texto = String(v).trim();
  if (!texto) return { clase: "desconocida", valor: null, texto };
  const rango = RANGO.exec(texto);
  if (rango) {
    const a = aNumero(rango[1]);
    const b = aNumero(rango[3]);
    if (a !== null && b !== null) {
      const factorB = factorDe(rango[4]);
      // «entre 18 y 25 mil»: el «mil» del final vale para los dos.
      const factorA = rango[2] ? factorDe(rango[2]) : factorB !== 1 && a < b ? factorB : 1;
      const desde = porFactor(a, factorA);
      const hasta = porFactor(b, factorB);
      return { clase: "rango", valor: null, desde: Math.min(desde, hasta), hasta: Math.max(desde, hasta), texto };
    }
  }
  const n = cifraDe(texto);
  if (n === null || DESCONOCIDO.test(texto)) return { clase: "desconocida", valor: null, texto };
  return aproximaA(texto, n) ? { clase: "aproximada", valor: n, texto } : { clase: "exacta", valor: n, texto };
}

// ─── En qué se mide cada número: no todo son soles ──────────────────────────────────────────────

export type UnidadCifra = Vital["unidad"];

/** La unidad de un número conocido. De una clave que nadie definió no se sabe: se muestra el número a secas. */
export function unidadDeClave(clave: string): UnidadCifra {
  return VITAL_POR_CLAVE.get(clave)?.unidad ?? RECONOCIDA_POR_CLAVE.get(clave)?.unidad ?? "numero";
}

/** Enteros y montos grandes, sin decimales; un precio de 149,50 conserva sus céntimos. */
const numeroLegible = (n: number): string => (Number.isInteger(n) || Math.abs(n) >= 1000 ? Math.round(n) : dosDecimales(n)).toLocaleString("es-PE");

/** «S/ 40 000» (o «S/ 40,000» según la configuración regional de quien lo imprima). */
export const formatoSoles = (n: number): string => `S/ ${numeroLegible(n)}`;

/** Una cifra con su unidad: «S/ 40,000», «3 de cada 10», «45 días». Nunca soles para lo que no es dinero. */
export function formatoCifra(n: number, unidad: UnidadCifra = "soles"): string {
  switch (unidad) {
    case "soles":
      return formatoSoles(n);
    case "de_cada_10":
      return `${numeroLegible(n)} de cada 10`;
    case "dias":
      return `${numeroLegible(n)} ${n === 1 ? "día" : "días"}`;
    case "personas":
      return `${numeroLegible(n)} ${n === 1 ? "persona" : "personas"}`;
    default:
      return numeroLegible(n);
  }
}

// ─── Quién dijo la cifra declarada ──────────────────────────────────────────────────────────────

/**
 * Un número «contado» no siempre lo dijo el dueño: también lo dice una persona del equipo en su
 * entrevista, y lo escriben el formulario del portal y el espejo de indicadores sin dejar constancia
 * de quién. Cuando no consta, no se le atribuye a nadie: se rotula «Declarado» a secas.
 */
export type Declarante = "dueno" | "socio" | "equipo";

/** Del rol del participante de la entrevista a quién lo dijo. Un rol que no es de la empresa, o ninguno, no se adivina. */
export function declaranteDeRol(rol: string | null | undefined): Declarante | null {
  if (rol === "dueno" || rol === "socio") return rol;
  return rol === "lider" || rol === "empleado" ? "equipo" : null;
}

const QUIEN_DECLARO: Record<Declarante | "nadie", { rotulo: string; fuente: string; dijo: string }> = {
  dueno: { rotulo: "Declarado por el dueño", fuente: "lo que dijo el dueño", dijo: "nos dijiste " },
  socio: { rotulo: "Declarado por un socio", fuente: "lo que dijo un socio", dijo: "tu socio nos dijo " },
  equipo: { rotulo: "Declarado por una persona del equipo", fuente: "lo que dijo una persona del equipo", dijo: "una persona de tu equipo nos dijo " },
  nadie: { rotulo: "Declarado", fuente: "sin constancia de quién lo dijo", dijo: "en tus números figura " },
};

/** El rótulo de la cifra declarada: con quién la dijo si consta; si no, «Declarado» a secas. */
export const rotuloDeDeclarado = (quien: Declarante | null | undefined): string => QUIEN_DECLARO[quien ?? "nadie"].rotulo;

// ─── Declarado frente a extraído ────────────────────────────────────────────────────────────────

export type Rotulo = "declarado" | "extraido";

/** Cuánto se le tolera a cada clase de declaración antes de hablar de contradicción. */
export type ClaseTolerancia = "exacta" | "aproximada";
export const TOLERANCIA_PCT: Record<ClaseTolerancia, number> = { exacta: 5, aproximada: 20 };

export type CifraRotulada = {
  /** Qué mide: «stock a costo», «ventas del mes». Dos cifras de conceptos distintos no se comparan. */
  concepto: string;
  valor: number;
  periodo: string;
  moneda?: string;
  /** De dónde salió: la pregunta de la entrada breve, o la hoja y celda del archivo. */
  fuente: string;
  rotulo: Rotulo;
};

/** Ninguna comparación cambia el estado de una cifra: las dos siguen pendientes de conciliar. */
export type CifraPendiente = CifraRotulada & { estado: "pendiente" };

export type VeredictoNumerico = {
  tipo: "CONTRADICCION" | "COINCIDE" | "NO_COMPARABLE";
  declarado: CifraPendiente;
  extraido: CifraPendiente;
  /** extraído − declarado. null si no son comparables. */
  diferencia: number | null;
  /** |diferencia| / declarado × 100. null si no son comparables o el declarado es cero. */
  diferencia_pct: number | null;
  tolerancia_pct: number;
  /** De qué clase se tomó la declaración para fijar la tolerancia. */
  clase: ClaseTolerancia;
  motivo: string;
};

/**
 * Pone al lado lo que el dueño declaró y lo que el documento muestra. Si no hablan de lo mismo (otro
 * concepto, otro periodo, otra moneda) no se comparan y se dice por qué. Si difieren más que la
 * tolerancia, es CONTRADICCIÓN: las dos cifras quedan a la vista, rotuladas, y las dos siguen
 * pendientes. Comparar no verifica: verificar es trabajo de una persona con el dueño delante.
 *
 * La tolerancia sale de la clase de la declaración (exacta 5 %, aproximada 20 %); `tolerancia_pct`
 * la fija a mano cuando quien llama sabe algo más. `unidad` dice cómo se escriben las cifras en el
 * motivo; sin ella se escriben en soles, que es lo que comparan los pilotos.
 */
export function contradiccionesNumericas(
  declarado: CifraRotulada,
  extraido: CifraRotulada,
  opciones: { tolerancia_pct?: number; clase?: ClaseTolerancia; unidad?: UnidadCifra } = {}
): VeredictoNumerico {
  const clase: ClaseTolerancia = opciones.clase ?? "exacta";
  const tolerancia_pct = opciones.tolerancia_pct ?? TOLERANCIA_PCT[clase];
  const cifra = (n: number) => formatoCifra(n, opciones.unidad ?? "soles");
  const d: CifraPendiente = { ...declarado, rotulo: "declarado", estado: "pendiente" };
  const e: CifraPendiente = { ...extraido, rotulo: "extraido", estado: "pendiente" };
  const base = { declarado: d, extraido: e, tolerancia_pct, clase };
  const noComparable = (motivo: string): VeredictoNumerico => ({ ...base, tipo: "NO_COMPARABLE", diferencia: null, diferencia_pct: null, motivo });

  if (d.concepto !== e.concepto) return noComparable(`No miden lo mismo: «${d.concepto}» frente a «${e.concepto}». No se comparan.`);
  if (d.periodo !== e.periodo) return noComparable(`Periodos distintos (${d.periodo} y ${e.periodo}): no se comparan.`);
  if ((d.moneda ?? "PEN") !== (e.moneda ?? "PEN")) return noComparable(`Monedas distintas (${d.moneda ?? "PEN"} y ${e.moneda ?? "PEN"}): no se comparan.`);
  if (!Number.isFinite(d.valor) || !Number.isFinite(e.valor)) return noComparable("Falta una de las dos cifras: sin dato no hay comparación.");

  const diferencia = e.valor - d.valor;
  const diferencia_pct = d.valor === 0 ? null : (Math.abs(diferencia) / Math.abs(d.valor)) * 100;
  const contradice = diferencia_pct === null ? diferencia !== 0 : diferencia_pct > tolerancia_pct;
  const pct = diferencia_pct === null ? "" : ` (${Math.round(diferencia_pct)} %)`;
  const claseTexto = clase === "aproximada" ? "una cifra aproximada" : "una cifra exacta";
  if (contradice) {
    return {
      ...base,
      tipo: "CONTRADICCION",
      diferencia,
      diferencia_pct,
      motivo: `Lo declarado (${cifra(d.valor)}, ${d.fuente}) y lo que muestra el documento (${cifra(e.valor)}, ${e.fuente}) no cuadran: difieren en ${cifra(Math.abs(diferencia))}${pct}, más que la tolerancia de ${tolerancia_pct} % que se le da a ${claseTexto}. Las dos cifras quedan como están, declarada y extraída, hasta que alguien las concilie con el dueño.`,
    };
  }
  return {
    ...base,
    tipo: "COINCIDE",
    diferencia,
    diferencia_pct,
    motivo: `Lo declarado (${cifra(d.valor)}) y lo extraído (${cifra(e.valor)}) difieren en ${cifra(Math.abs(diferencia))}${pct}, dentro de la tolerancia de ${tolerancia_pct} % que se le da a ${claseTexto}. Coinciden, pero ninguna queda confirmada por eso: siguen pendientes de conciliar.`,
  };
}

// ─── Excel: filas con su celda, y sumas que se niegan si falta algo ─────────────────────────────

export type FilaLeida = {
  numero: number;
  valores: Record<string, ValorCelda>;
  /** La celda de cada valor («F3»), para citar de dónde salió. */
  celdas: Record<string, string>;
};

/** Cada fila de la hoja como objeto por encabezado, con la referencia de celda al lado. */
export function filasDe(hoja: Hoja): FilaLeida[] {
  return hoja.filas.map((f) => {
    const valores: Record<string, ValorCelda> = {};
    const celdas: Record<string, string> = {};
    f.celdas.forEach((c, i) => {
      const nombre = hoja.encabezados[i] || `columna ${c.ref.replace(/\d+$/, "")}`;
      valores[nombre] = c.valor;
      celdas[nombre] = c.ref;
    });
    return { numero: f.numero, valores, celdas };
  });
}

/**
 * Suma una columna SOLO si todas las filas consideradas tienen dato. Si alguna celda está vacía la
 * suma no existe: devuelve null con las celdas que faltan, para que se pidan, no para que se rellenen.
 * Un texto donde debería haber un número también impide sumar: se dice cuál.
 */
export function sumaSiCompleta(hoja: Hoja, columna: string, opciones: { filtro?: (f: FilaLeida) => boolean; periodo?: string } = {}): Calculo<number> {
  const filas = filasDe(hoja).filter(opciones.filtro ?? (() => true));
  const base = {
    formula: `suma de «${columna}» en la hoja «${hoja.nombre}», fila por fila; solo si ninguna celda está vacía`,
    periodo: opciones.periodo ?? "el que cubren las filas de la hoja",
    fuentes: filas.map((f) => `${hoja.nombre}!${f.celdas[columna] ?? "?"}`),
    supuestos: ["Cada fila es un periodo o un ítem distinto: no hay filas que se superpongan entre sí."],
    limitaciones: [] as string[],
  };
  if (!hoja.encabezados.includes(columna)) return { ...base, valor: null, motivo_nulo: `la hoja «${hoja.nombre}» no tiene una columna «${columna}»` };
  if (!filas.length) return { ...base, valor: null, motivo_nulo: "no hay filas que sumar" };
  const vacias = filas.filter((f) => f.valores[columna] === null);
  if (vacias.length) {
    const celdas = vacias.map((f) => f.celdas[columna]).join(", ");
    return { ...base, valor: null, motivo_nulo: `${columna}: ${vacias.length} ${vacias.length === 1 ? "celda vacía" : "celdas vacías"} de ${filas.length} (${celdas}). Una celda vacía no es cero: la suma no se puede hacer hasta que se complete el dato.` };
  }
  const noNumericas = filas.filter((f) => typeof f.valores[columna] !== "number");
  if (noNumericas.length) return { ...base, valor: null, motivo_nulo: `${columna}: ${noNumericas.length} celda(s) con texto en vez de número (${noNumericas.map((f) => f.celdas[columna]).join(", ")})` };
  return { ...base, valor: filas.reduce((s, f) => s + (f.valores[columna] as number), 0) };
}

// ─── En producto: los números guardados de una empresa, puestos al lado ─────────────────────────

/** Cuántos números de una empresa se leen para emparejar. Si se alcanza, quien lee lo dice: no se corta en silencio. */
export const TOPE_METRICAS = 1000;

/**
 * La cifra del OTRO lado que un número desplazó al guardarse: el 40.000 que el dueño declaró y que el
 * 79.782 del Excel pisó (o al revés). Viaja en la misma fila, así que es de la misma clave y del mismo
 * periodo por construcción. La escribe quien guarda (ver `cifraQueSeDesplaza`); este módulo solo la lee.
 */
export type CifraDesplazada = {
  lado: Rotulo;
  valor: number | string | null;
  valor_texto?: string | null;
  nota?: string | null;
  /** La respuesta de entrevista donde el dueño la dijo: por ahí se encuentra su afirmación. */
  response_id?: string | null;
  /** El documento del que se extrajo. */
  source_id?: string | null;
};

/** Una fila de company_metricas tal como se lee. `valor` puede llegar como texto desde Postgres (numeric). */
export type MetricaGuardada = {
  id?: string;
  clave: string;
  periodo: string | null;
  valor: number | string | null;
  valor_texto?: string | null;
  estado?: string | null;
  /** declarado / extraido / conciliado / calculado. Sin la migración de evidencia llega undefined. */
  origen?: string | null;
  nota?: string | null;
  response_id?: string | null;
  source_id?: string | null;
  /** Solo existe cuando quien guarda la conserva. Sin la columna llega undefined y no pasa nada. */
  cifra_desplazada?: CifraDesplazada | null;
};

const esLado = (v: unknown): v is Rotulo => v === "declarado" || v === "extraido";

/** numeric de Postgres llega como texto; una cadena vacía no es cero. */
function aFinito(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * De qué lado está un número, según CÓMO LLEGÓ (su estado) y de dónde (su origen).
 *
 * DECLARADO: lo dijo una persona de memoria (estado contado o declarado). Vale aunque la fila conserve
 * un origen «extraido» viejo: los formularios del portal pisan el valor sin tocar el origen, y lo que
 * manda es que el número de hoy lo escribió el dueño. EXTRAÍDO: lo leyó un lector de documento y nadie
 * lo revisó (estado extraido). Lo verificado, lo conciliado, lo calculado y lo descartado NO entran: ya
 * pasaron por una persona, o no son una declaración, o se desecharon. Sin dato no hay lado.
 */
export function ladoDeMetrica(m: Pick<MetricaGuardada, "estado" | "origen" | "valor" | "valor_texto">): Rotulo | null {
  if (m.estado === "sin_dato" || m.estado === "descartado" || m.estado === "verificado") return null;
  if (m.origen === "conciliado" || m.origen === "calculado") return null;
  // Un rango («entre 18.000 y 25.000») se guarda con valor null y el texto al lado: sigue siendo una declaración.
  if (aFinito(m.valor) === null && !m.valor_texto?.trim()) return null;
  if (m.estado === "extraido") return !m.origen || m.origen === "extraido" ? "extraido" : null;
  if (m.estado === "contado" || m.estado === "declarado") return "declarado";
  return null;
}

/**
 * PARA QUIEN GUARDA un número (guardarMetricas, el formulario del portal): si la fila que va a pisar es
 * del otro lado y todavía nadie la concilió, devuelve la cifra que hay que conservar en
 * `cifra_desplazada` para que el par siga existiendo. Devuelve null cuando no hay nada que conservar
 * (misma procedencia, fila sin dato, descartada o ya conciliada): en ese caso quien guarda NO toca la
 * `cifra_desplazada` que la fila ya tuviera.
 */
export function cifraQueSeDesplaza(previa: MetricaGuardada | null | undefined, ladoNuevo: Rotulo): CifraDesplazada | null {
  if (!previa) return null;
  const lado = ladoDeMetrica(previa);
  if (!lado || lado === ladoNuevo) return null;
  return {
    lado,
    valor: previa.valor ?? null,
    valor_texto: previa.valor_texto ?? null,
    nota: previa.nota ?? null,
    response_id: previa.response_id ?? null,
    source_id: previa.source_id ?? null,
  };
}

/**
 * LO QUE ESCRIBE QUIEN GUARDA, en una línea: la fila tal cual, o con `cifra_desplazada`.
 *  - La cifra del otro lado que esta escritura pisa, para que el par siga existiendo.
 *  - null, si el mismo lado vuelve a hablar y lo que había guardado de él quedó superado: el «no lo
 *    sé» de hoy retira el 40.000 de ayer, y un documento posterior no debe resucitarlo.
 *  - Sin la clave, si no hay nada que cambiar. Así una escritura que no desplaza nada no nombra la
 *    columna, y lo conservado antes se queda como está.
 * `ladoQueEscribe` es el camino por el que entra el número (entrevista, portal y espejo de
 * indicadores: declarado; lector de documentos: extraído), no el estado con que queda la fila.
 * `previa` debe traer la fila ENTERA (valor, texto, nota, respuesta, fuente y lo ya desplazado). Si
 * llega sin su valor (quien guarda leyó solo `id,estado`), aquí no habría nada que conservar y la cifra
 * se perdería sin aviso: por eso se rechaza en vez de callar.
 */
export function conCifraDesplazada<T extends object>(fila: T, previa: MetricaGuardada | null | undefined, ladoQueEscribe: Rotulo): T & { cifra_desplazada?: CifraDesplazada | null } {
  if (!previa) return fila;
  if (!("valor" in previa)) throw new Error("conCifraDesplazada necesita la fila previa entera (con su valor): léela con todas sus columnas antes de pisarla.");
  const desplazada = cifraQueSeDesplaza(previa, ladoQueEscribe);
  if (desplazada) return { ...fila, cifra_desplazada: desplazada };
  return previa.cifra_desplazada?.lado === ladoQueEscribe ? { ...fila, cifra_desplazada: null } : fila;
}

/**
 * PARA QUIEN NO PUEDE REEMPLAZAR EL NÚMERO DE LA FILA: lo que alguien registró, visto como la cifra
 * declarada que va AL LADO de una cifra extraída que nadie revisó todavía. No lleva texto, nota ni
 * respuesta de entrevista: es un número escrito en un formulario, sin constancia de quién lo dijo.
 */
export function declaradoAlLado(valor: number): CifraDesplazada {
  return { lado: "declarado", valor, valor_texto: null, nota: null, response_id: null, source_id: null };
}

/** Lo que hace falta del error de la base para reconocer una columna que todavía no existe. */
type ErrorDeBase = { message: string; code?: string | null };

/** Postgres dice 42703 (columna inexistente); PostgREST, PGRST204 (la columna no está en su esquema). */
export function faltaUnaColumna(error: ErrorDeBase): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /cifra_desplazada/i.test(error.message ?? "");
}

/**
 * LA ESCRITURA DE QUIEN GUARDA, tolerante con una base que aún no tiene la columna `cifra_desplazada`.
 * `escribir` hace el insert o el update con la fila que recibe. Si la base rechaza la fila por una
 * columna que no conoce y la fila llevaba `cifra_desplazada`, se escribe otra vez SIN esa columna: el
 * número nuevo nunca se pierde por una migración sin aplicar. Lo que sí se pierde en esa base es la
 * cifra del otro lado, y se dice en consola con el nombre de la migración. Cualquier otro fallo se
 * devuelve tal cual para que quien guarda lo trate como siempre.
 */
export async function escribirConservando<F extends object, E extends ErrorDeBase>(
  fila: F,
  escribir: (fila: F) => PromiseLike<{ error: E | null }>,
  donde: string
): Promise<{ error: E | null; sin_columna: boolean }> {
  const primera = await escribir(fila);
  if (!primera.error || !("cifra_desplazada" in fila) || !faltaUnaColumna(primera.error)) return { error: primera.error, sin_columna: false };
  const sinLaColumna = Object.fromEntries(Object.entries(fila).filter(([columna]) => columna !== "cifra_desplazada")) as F;
  const segunda = await escribir(sinLaColumna);
  if (segunda.error) return { error: segunda.error, sin_columna: false };
  console.warn(
    `[numeros] ${donde}: el número se guardó, pero la base todavía no tiene la columna cifra_desplazada (falta aplicar supabase/migracion-cifra-desplazada.sql). La cifra del otro lado que este guardado reemplaza no se conservó: ese par no se podrá contrastar.`
  );
  return { error: null, sin_columna: true };
}

/**
 * Qué clase de cifra declaró el dueño. Si escribió «como 40,000» (valor_texto) o la nota dice
 * «aproximado», es aproximada y se le tolera 20 %. Un número escrito a secas se toma como exacto.
 * La aproximación tiene que ser de ESTA cifra, la guardada: «unos 3 clientes» o «como 2 veces al mes»
 * en la nota hablan de otro número y no le regalan tolerancia (ver `aproximaA`).
 * Un rango escrito («entre 18.000 y 25.000») manda sobre cualquier punto medio que venga en `valor`,
 * con dos excepciones en las que el texto no es un rango de ESTA cifra:
 *  - los dos números parecen años («entre 2019 y 2021 vendía 80.000»): son fechas, no montos;
 *  - el valor guardado cae fuera del rango: el texto quedó de una declaración anterior y la cifra de
 *    hoy es otra. Manda el valor, y el texto viejo no se cita como si lo acompañara.
 * Si no hay `valor`, del texto libre NO se saca un número: «en 2024 vendía bastante» no declara 2.024.
 */
export function declaracionDeMetrica(m: Pick<MetricaGuardada, "valor" | "valor_texto" | "nota">): CifraDeclarada {
  const valor = aFinito(m.valor);
  let texto = (m.valor_texto ?? "").trim();
  const nota = (m.nota ?? "").trim();
  const leida = texto ? leerDeclaracion(texto) : null;
  if (leida?.clase === "rango") {
    const sonAnios = pareceAnio(leida.desde) && pareceAnio(leida.hasta);
    const valorFuera = valor !== null && (valor < leida.desde || valor > leida.hasta);
    if (!sonAnios && !valorFuera) return leida;
    if (valorFuera) texto = "";
  }
  if (valor === null) return { clase: "desconocida", valor: null, texto };
  const aproximada = aproximaA(texto, valor) || aproximaA(nota, valor);
  return { clase: aproximada ? "aproximada" : "exacta", valor, texto: texto || (aproximada ? nota : String(valor)) };
}

/** «Entre 2019 y 2021» son dos años, no dos montos. */
function pareceAnio(n: number): boolean {
  return Number.isInteger(n) && n >= 1990 && n <= 2100;
}

/** Nombre del número para el dueño: «Ventas del mes», no `venta_mes`. */
export function nombreDeClave(clave: string): string {
  const conocido = VITAL_POR_CLAVE.get(clave)?.nombre ?? RECONOCIDA_POR_CLAVE.get(clave)?.nombre;
  if (conocido) return conocido;
  const suelto = clave.replace(/_/g, " ").trim();
  return suelto.charAt(0).toUpperCase() + suelto.slice(1);
}

export type ParDeclaradoExtraido = {
  clave: string;
  nombre: string;
  unidad: UnidadCifra;
  /** Periodo del número declarado (normalizado: AAAA-MM, epoca_dorada o actual). */
  periodo: string;
  /** Periodo del número extraído. Si difiere del declarado, el veredicto es NO_COMPARABLE. */
  periodo_extraido: string;
  declarado: MetricaGuardada;
  extraido: MetricaGuardada;
  declaracion: CifraLeida;
  /** Quién dijo la cifra declarada, si consta (el participante de la respuesta de entrevista). null: no se sabe. */
  declarante: Declarante | null;
  /**
   * true cuando la cifra del documento no es el número de la fila sino la que quedó guardada al lado
   * (`cifra_desplazada`) porque el número se volvió a declarar después. Esa cifra ya no figura en la
   * revisión de su fuente (la fila dejó de ser «del documento»): la tarjeta lo dice, para que la
   * fuente no se dé por revisada sin haberla decidido.
   */
  extraido_al_lado: boolean;
  veredicto: VeredictoNumerico;
  /** La pregunta para el dueño, en sus palabras. Solo cuando hay contradicción. */
  pregunta: string | null;
};

/** Lo que quien llama sabe y los números guardados no traen. */
export type OpcionesDeEmparejar = {
  /** Quién dio cada respuesta de entrevista (id de la respuesta → quién). Lo que falte se rotula «Declarado» a secas. */
  declarantes?: ReadonlyMap<string, Declarante | null>;
};

/** `al_lado`: la cifra no es el número de la fila, es la que la fila guarda en `cifra_desplazada`. */
type FilaNormalizada = MetricaGuardada & { periodo: string; al_lado?: true };

const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
/** «Hoy» es lo más reciente; después los meses, del más nuevo al más viejo; la mejor época, al final. */
const recencia = (periodo: string): string => (ES_MES.test(periodo) ? periodo : periodo === PERIODO_DORADA ? "0000-00" : "9999-99");
const masReciente = (a: FilaNormalizada, b: FilaNormalizada): number => recencia(b.periodo).localeCompare(recencia(a.periodo));

function armarPar(d: FilaNormalizada, declaracion: CifraLeida, e: FilaNormalizada, valorExtraido: number, declarante: Declarante | null): ParDeclaradoExtraido {
  const nombre = nombreDeClave(d.clave);
  const unidad = unidadDeClave(d.clave);
  // Un rango («entre 18.000 y 25.000») se compara contra el extremo más cercano al documento, sin
  // inventar un punto medio; si el documento cae dentro del rango, coincide.
  const valorDeclarado = declaracion.clase === "rango" ? Math.min(Math.max(valorExtraido, declaracion.desde), declaracion.hasta) : declaracion.valor;
  const clase: ClaseTolerancia = declaracion.clase === "exacta" ? "exacta" : "aproximada";
  const dicho = declaracion.texto && declaracion.texto !== String(valorDeclarado) ? `: «${declaracion.texto}»` : "";
  const veredicto = contradiccionesNumericas(
    { concepto: nombre, valor: valorDeclarado, periodo: nombreDePeriodo(d.periodo), fuente: `${QUIEN_DECLARO[declarante ?? "nadie"].fuente}${dicho}`, rotulo: "declarado" },
    { concepto: nombre, valor: valorExtraido, periodo: nombreDePeriodo(e.periodo), fuente: e.nota?.trim() ? `documento: ${e.nota.trim().slice(0, 80)}` : "lo que muestra el documento", rotulo: "extraido" },
    { clase, unidad }
  );
  const par: ParDeclaradoExtraido = { clave: d.clave, nombre, unidad, periodo: d.periodo, periodo_extraido: e.periodo, declarado: d, extraido: e, declaracion, declarante, extraido_al_lado: e.al_lado === true, veredicto, pregunta: null };
  par.pregunta = veredicto.tipo === "CONTRADICCION" ? preguntaParaElDueno(par) : null;
  return par;
}

/**
 * Junta cada número declarado (por el dueño o por quien conste) con el número extraído de documento
 * de la misma clave.
 *
 * De dónde salen los dos lados: de dos filas distintas, o de UNA fila que trae en `cifra_desplazada`
 * la cifra del otro lado que pisó al guardarse. Mismo periodo → se comparan. Si para un número no hay
 * ningún par del mismo periodo, se deja UNA constancia con lo más reciente de cada lado como
 * NO_COMPARABLE: el consultor ve que existen las dos cifras, que no se compararon y por qué. Una sola,
 * no una por mes: doce «no se comparan» seguidos no le dicen nada a nadie. Un declarado sin dato o sin
 * número no forma par.
 */
export function emparejarDeclaradoExtraido(metricas: MetricaGuardada[], opciones: OpcionesDeEmparejar = {}): ParDeclaradoExtraido[] {
  const quienDijo = (d: FilaNormalizada): Declarante | null => (d.response_id ? (opciones.declarantes?.get(d.response_id) ?? null) : null);
  const { declarados, extraidos } = separarPorLado(metricas);

  const pares: ParDeclaradoExtraido[] = [];
  for (const [clave, filasDeclaradas] of declarados) {
    const candidatos = (extraidos.get(clave) ?? []).flatMap((e) => {
      const valor = aFinito(e.valor);
      return valor === null ? [] : [{ e, valor }];
    });
    if (!candidatos.length) continue;
    const legibles = filasDeclaradas.flatMap((d) => {
      const declaracion = declaracionDeMetrica(d);
      return declaracion.clase === "desconocida" ? [] : [{ d, declaracion }];
    });
    if (!legibles.length) continue;

    const delMismoPeriodo = legibles.flatMap(({ d, declaracion }) => {
      const c = candidatos.find((x) => x.e.periodo === d.periodo);
      return c ? [armarPar(d, declaracion, c.e, c.valor, quienDijo(d))] : [];
    });
    if (delMismoPeriodo.length) {
      pares.push(...delMismoPeriodo);
      continue;
    }
    const d = [...legibles].sort((a, b) => masReciente(a.d, b.d))[0];
    const c = [...candidatos].sort((a, b) => masReciente(a.e, b.e))[0];
    pares.push(armarPar(d.d, d.declaracion, c.e, c.valor, quienDijo(d.d)));
  }
  // Primero las contradicciones, después lo que coincide, al final lo que no se pudo comparar.
  const orden = { CONTRADICCION: 0, COINCIDE: 1, NO_COMPARABLE: 2 } as const;
  return pares.sort((a, b) => orden[a.veredicto.tipo] - orden[b.veredicto.tipo] || a.nombre.localeCompare(b.nombre) || recencia(b.periodo).localeCompare(recencia(a.periodo)));
}

type PorLado = { declarados: Map<string, FilaNormalizada[]>; extraidos: Map<string, FilaNormalizada[]> };

/**
 * ¿Se quedó la fila sin cifra propia que comparar, sin que nadie haya resuelto lo que guarda al lado?
 * Pasa cuando quedó «sin dato» (alguien respondió «no lo sé» después del Excel, o el documento no traía
 * el número) y cuando el consultor descartó SU cifra al revisar el documento. En los dos casos la cifra
 * del otro lado que la fila guarda en `cifra_desplazada` sigue pendiente de conciliar. No pasa cuando
 * la fila está verificada o conciliada (una persona ya eligió la cifra buena) ni cuando es un cálculo.
 */
function soloQuedaLoDeAlLado(m: MetricaGuardada): boolean {
  if (m.estado === "verificado" || m.origen === "conciliado" || m.origen === "calculado") return false;
  return m.estado === "sin_dato" || m.estado === "descartado" || (aFinito(m.valor) === null && !m.valor_texto?.trim());
}

/** La cifra que la fila guarda al lado, vista como un número de su lado, de la misma clave y del mismo periodo. */
function filaDeAlLado(otra: CifraDesplazada, clave: string, periodo: string): FilaNormalizada {
  return {
    clave,
    periodo,
    valor: otra.valor ?? null,
    valor_texto: otra.valor_texto ?? null,
    nota: otra.nota ?? null,
    response_id: otra.response_id ?? null,
    source_id: otra.source_id ?? null,
    estado: otra.lado === "declarado" ? "contado" : "extraido",
    origen: otra.lado,
    al_lado: true,
  };
}

/**
 * Cada número en su lado, por clave canónica. Una fila puede dar dos: la suya y la del otro lado que
 * desplazó al guardarse (`cifra_desplazada`), que es de la misma clave y del mismo periodo. Y puede
 * dar solo la de al lado: si la fila quedó sin cifra propia y nadie la resolvió (`soloQuedaLoDeAlLado`),
 * lo que guarda sigue pendiente. Saltarse esa fila escondía, por ejemplo, el 86.900 del Excel detrás
 * de un «no lo sé» posterior, y la pantalla afirmaba que no había nada extraído por conciliar.
 */
function separarPorLado(metricas: MetricaGuardada[]): PorLado {
  const declarados = new Map<string, FilaNormalizada[]>();
  const extraidos = new Map<string, FilaNormalizada[]>();
  const poner = (mapa: Map<string, FilaNormalizada[]>, fila: FilaNormalizada) => mapa.set(fila.clave, [...(mapa.get(fila.clave) ?? []), fila]);
  for (const m of metricas) {
    const lado = ladoDeMetrica(m);
    const otra = m.cifra_desplazada;
    const hayAlLado = !!otra && esLado(otra.lado) && otra.lado !== lado && (lado !== null || soloQuedaLoDeAlLado(m));
    if (!lado && !hayAlLado) continue;
    const n = normalizarMetrica(m.clave, m.periodo);
    if (lado) poner(lado === "declarado" ? declarados : extraidos, { ...m, clave: n.clave, periodo: n.periodo });
    if (otra && hayAlLado) poner(otra.lado === "declarado" ? declarados : extraidos, filaDeAlLado(otra, n.clave, n.periodo));
  }
  return { declarados, extraidos };
}

/** Una cifra que hoy solo existe guardada al lado de un número que no tiene cifra propia. */
export type CifraSoloAlLado = {
  clave: string;
  nombre: string;
  /** Periodo normalizado: AAAA-MM, epoca_dorada o actual. */
  periodo: string;
  lado: Rotulo;
  /** La cifra con su unidad, lista para mostrarse: «S/ 86,900», «entre S/ 18,000 y S/ 25,000». */
  texto: string;
  /** Cómo figura hoy el número de la fila. */
  figura: "sin_dato" | "descartado";
  /** El documento del que se extrajo, si es una cifra extraída. */
  source_id: string | null;
};

/**
 * Las cifras pendientes de conciliar que NO SE VEN en ninguna otra pantalla: la fila del número quedó
 * «sin dato» o descartada, y la cifra del otro lado solo existe en su `cifra_desplazada`. «Tus números»
 * muestra el número sin cifra, y la revisión de la fuente no lista la cifra extraída (la fila ya no es
 * «del documento»). La Matriz de Realidad las nombra para que no queden escondidas.
 */
export function cifrasSoloAlLado(metricas: MetricaGuardada[]): CifraSoloAlLado[] {
  const sueltas: CifraSoloAlLado[] = [];
  for (const m of metricas) {
    const otra = m.cifra_desplazada;
    if (!otra || !esLado(otra.lado) || ladoDeMetrica(m) || !soloQuedaLoDeAlLado(m)) continue;
    const n = normalizarMetrica(m.clave, m.periodo);
    const cifra = (v: number) => formatoCifra(v, unidadDeClave(n.clave));
    let texto: string;
    if (otra.lado === "declarado") {
      const d = declaracionDeMetrica(otra);
      if (d.clase === "desconocida") continue;
      texto = d.clase === "rango" ? `entre ${cifra(d.desde)} y ${cifra(d.hasta)}` : cifra(d.valor);
    } else {
      const v = aFinito(otra.valor);
      if (v === null) continue;
      texto = cifra(v);
    }
    sueltas.push({ clave: n.clave, nombre: nombreDeClave(n.clave), periodo: n.periodo, lado: otra.lado, texto, figura: m.estado === "descartado" ? "descartado" : "sin_dato", source_id: otra.source_id ?? null });
  }
  return sueltas.sort((a, b) => a.nombre.localeCompare(b.nombre) || recencia(b.periodo).localeCompare(recencia(a.periodo)));
}

/** Cuántos números hay de cada lado con una cifra que se pueda poner al lado de otra. */
export type LadosDisponibles = { declarados: number; extraidos: number };

/**
 * Lo que hay para comparar, aunque no haya ningún par: cuántos números declarados y cuántos extraídos
 * de documentos siguen pendientes de conciliar. Lo verificado, lo conciliado, lo descartado y lo «sin
 * dato» no cuentan (ver `ladoDeMetrica`); sí cuenta la cifra del otro lado que una fila «sin dato» o
 * descartada guarda al lado, porque nadie la resolvió. Sirve para que «no hay pares» no se lea como
 * «todo cuadra».
 */
export function ladosDisponibles(metricas: MetricaGuardada[]): LadosDisponibles {
  const { declarados, extraidos } = separarPorLado(metricas);
  let d = 0;
  let e = 0;
  for (const filas of declarados.values()) d += filas.filter((f) => declaracionDeMetrica(f).clase !== "desconocida").length;
  for (const filas of extraidos.values()) e += filas.filter((f) => aFinito(f.valor) !== null).length;
  return { declarados: d, extraidos: e };
}

/**
 * Por qué no hay ningún par, en una frase para el consultor. No haber pares NO es que los números
 * cuadren: es que no se comparó nada, y se dice qué cifra falta para poder comparar.
 */
export function motivoSinPares(l: LadosDisponibles): string {
  const d = `${l.declarados} ${l.declarados === 1 ? "número declarado" : "números declarados"}`;
  const e = `${l.extraidos} ${l.extraidos === 1 ? "número extraído de un documento" : "números extraídos de documentos"}`;
  const inicio = "No hay pares comparables todavía";
  if (!l.declarados && !l.extraidos) return `${inicio}: la empresa no tiene números declarados ni números extraídos de documentos que sigan pendientes de conciliar.`;
  if (!l.extraidos) return `${inicio}: hay ${d} y ninguno extraído de un documento que siga pendiente de conciliar. Falta la cifra del documento.`;
  if (!l.declarados) return `${inicio}: hay ${e} y ninguno declarado. Falta la cifra declarada.`;
  return `${inicio}: hay ${d} y ${e}, pero ninguno es del mismo número. Falta la cifra declarada o la del documento de un mismo número.`;
}

/**
 * «Sobre «Ventas del mes» (setiembre 2026): »: de qué número y de cuándo habla la pregunta. Por este
 * encabezado se reconoce, en una afirmación, la pregunta vieja de este mismo número.
 */
function encabezadoDePregunta(par: Pick<ParDeclaradoExtraido, "nombre" | "periodo">): string {
  const cuando = par.periodo === PERIODO_DORADA ? " (tu mejor época)" : ES_MES.test(par.periodo) ? ` (${nombreDePeriodo(par.periodo).toLowerCase()})` : "";
  return `Sobre «${par.nombre}»${cuando}: `;
}

/**
 * La pregunta que el consultor le hace al dueño. Sin jerga y de tú, como el resto de lo que se le
 * pregunta: las dos cifras, de dónde salió cada una, y la pregunta abierta. No afirma cuál es la buena.
 * «Nos dijiste» solo cuando consta que lo dijo el dueño: si lo dijo un socio o alguien del equipo se
 * dice así, y si no consta quién, se dice dónde figura la cifra.
 */
export function preguntaParaElDueno(par: Pick<ParDeclaradoExtraido, "nombre" | "unidad" | "declaracion" | "veredicto" | "periodo"> & { declarante?: Declarante | null }): string {
  const { declaracion, veredicto } = par;
  const cifra = (n: number) => formatoCifra(n, par.unidad);
  const dicho =
    declaracion.clase === "rango"
      ? `entre ${cifra(declaracion.desde)} y ${cifra(declaracion.hasta)}`
      : declaracion.clase === "aproximada"
        ? `aproximadamente ${cifra(declaracion.valor)}`
        : cifra(declaracion.valor);
  return `${encabezadoDePregunta(par)}${QUIEN_DECLARO[par.declarante ?? "nadie"].dijo}${dicho} y el documento que nos entregaste muestra ${cifra(veredicto.extraido.valor)}. ¿Cuál de las dos cifras está más cerca de la realidad, o miden cosas distintas (otra fecha, otra forma de contar)?`;
}

// ─── El plan de escritura para el manejador: qué afirmación del dueño recibe la pregunta ─────────

/** Lo mínimo de una afirmación para saber si es la de quien declaró ese número. */
export type ClaimMinimo = {
  id: string;
  texto: string;
  estado: string;
  response_id?: string | null;
  pregunta_sugerida?: string | null;
  /** El participante de la entrevista, si la consulta lo trae: de su rol sale quién declaró el número. */
  participants?: { rol: string | null } | null;
};

/** ¿El texto menciona esa cifra? Acepta 40000, 40.000, 40,000, 40 000 y «40 mil». */
export function mencionaNumero(texto: string, valor: number): boolean {
  const entero = Math.round(Math.abs(valor));
  const digitos = String(entero);
  const conMiles = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, "[.,\\s]");
  const patrones = [new RegExp(`(?<!\\d)${digitos}(?!\\d)`), new RegExp(`(?<!\\d)${conMiles}(?!\\d)`)];
  if (entero >= 1000 && entero % 1000 === 0) patrones.push(new RegExp(`(?<!\\d)${entero / 1000}\\s*mil(?!\\d)`, "i"));
  return patrones.some((p) => p.test(texto));
}

export type EscrituraEnClaim = {
  claim_id: string;
  pregunta_sugerida: string;
  /**
   * Lo que la afirmación tiene HOY en `pregunta_sugerida`, TAL CUAL: null, la cadena vacía que a veces
   * deja el modelo, o la pregunta vieja de este mismo número cuyas cifras cambiaron. Quien escribe lo
   * pone como condición (null → «es null»; cualquier texto, también el vacío → «es igual a»), así
   * nunca pisa una pregunta que llegó entretanto y una cadena vacía no deja la pregunta sin escribir.
   */
  reemplaza: string | null;
  /** Qué par la originó, para el rastro. */
  clave: string;
  periodo: string;
};

/** Palabras de una clave o de un nombre que no distinguen un número de otro. */
const PALABRAS_VACIAS = new Set(["cada", "total", "totales", "actual", "mensual", "mensuales", "todo", "todos", "para", "esta", "este", "tiene", "tienen", "soles"]);

/** Las raíces (cuatro letras) de las palabras de un texto: «ventas», «venta» y «ventanilla» no se distinguen, y basta. */
function raicesDe(texto: string): Set<string> {
  const raices = new Set<string>();
  for (const palabra of sinTildes(texto).split(/[^a-z]+/)) {
    if (palabra.length < 4 || PALABRAS_VACIAS.has(palabra)) continue;
    raices.add(palabra.slice(0, 4));
    // «Venta» y «vender» son la misma cosa dicha de dos formas: el dueño dice «vendo 40 mil».
    if (palabra.startsWith("vent")) raices.add("vend");
  }
  return raices;
}

/** Con qué palabras se habla de un número: su clave, su nombre y, si es conocido, las claves que suelen inventarse para él. */
function raicesDeClave(clave: string): Set<string> {
  const conocido = VITAL_POR_CLAVE.get(clave) ?? RECONOCIDA_POR_CLAVE.get(clave);
  return raicesDe([clave, conocido?.nombre ?? "", ...(conocido?.sinonimos ?? [])].join(" ").replace(/_/g, " "));
}

/** Cuántas de las palabras de ese número aparecen en el texto de la afirmación. */
function hablaDe(texto: string, clave: string): number {
  const delTexto = raicesDe(texto);
  let n = 0;
  for (const r of raicesDeClave(clave)) if (delTexto.has(r)) n++;
  return n;
}

/**
 * Varias afirmaciones de la misma respuesta mencionan la cifra: ¿cuál habla de ESTE número? La pregunta
 * va a una sola. `rivales` son los otros números que esa misma respuesta declaró con la misma cifra
 * («vendo 40.000» y «tengo 40.000 en mercadería»).
 *  1. La que nombra este número más que a un rival. Si son varias (la misma cifra dicha dos veces sobre
 *     el mismo número), una pregunta basta: la que más lo nombra y, a igualdad, la de id menor, para
 *     que cada corrida elija la misma.
 *  2. Si ninguna lo nombra, la única que tampoco nombra a un rival: las demás hablan del otro número.
 *  3. Si no se puede saber, ninguna: la pregunta queda en el resultado del trabajo antes que colgada de
 *     una afirmación que habla de otra cosa.
 */
function afirmacionDelNumero(candidatas: ClaimMinimo[], clave: string, rivales: string[]): ClaimMinimo | null {
  if (candidatas.length <= 1) return candidatas[0] ?? null;
  const medidas = candidatas.map((c) => ({ c, propia: hablaDe(c.texto, clave), ajena: Math.max(0, ...rivales.map((r) => hablaDe(c.texto, r))) }));
  const suyas = medidas.filter((m) => m.propia > m.ajena).sort((a, b) => b.propia - a.propia || a.c.id.localeCompare(b.c.id));
  if (suyas.length) return suyas[0].c;
  const neutras = medidas.filter((m) => m.propia === m.ajena);
  return neutras.length === 1 ? neutras[0].c : null;
}

export type ContrasteNumerico = {
  pares: ParDeclaradoExtraido[];
  contradicciones: number;
  coincidencias: number;
  no_comparables: number;
  /** Cuántos números había de cada lado para comparar, hubiera par o no. */
  lados: LadosDisponibles;
  /** Si no hubo ningún par, por qué: no haber pares no es que todo cuadre. null cuando sí hubo. */
  sin_pares: string | null;
  /** Qué se escribe sobre afirmaciones del dueño: SOLO pregunta y prioridad. Nunca su estado ni su texto. */
  escrituras: EscrituraEnClaim[];
  /** Afirmaciones que ya tienen esta misma pregunta: no se vuelve a marcar lo que ya se preguntó. */
  ya_preguntadas: number;
  /** Afirmaciones que ya tienen OTRA pregunta pendiente (del modelo o de otro número): no se pisa. */
  con_otra_pregunta: number;
  /** Contradicciones que no encontraron afirmación del dueño donde dejar la pregunta: quedan en el rastro del trabajo. `motivo`, cuando había candidatas y no se pudo elegir. */
  sin_afirmacion: { clave: string; periodo: string; pregunta: string; motivo?: string }[];
};

/** Por qué una contradicción se quedó sin afirmación aunque varias mencionaban la cifra. */
export const MOTIVO_VARIAS_AFIRMACIONES = "Varias afirmaciones de la misma respuesta mencionan esa cifra y no se pudo saber cuál habla de este número: la pregunta no se dejó en ninguna.";

/**
 * Lo que el manejador `contrastar` hace con los números, en una función sin base para poder probarla:
 * empareja, y para cada contradicción busca la afirmación de quien declaró ese número (misma
 * respuesta de entrevista y el número en el texto; si la respuesta tiene una sola afirmación, esa).
 * Una contradicción, una afirmación: si dos de la misma respuesta mencionan la cifra, la pregunta va
 * solo a la que habla de ese número (`afirmacionDelNumero`), nunca a las dos.
 * Devuelve qué escribir, no escribe. Nunca propone cambiar el estado de esa afirmación: lo que una
 * persona dijo no se pisa, se pregunta (P1-15).
 *
 * Correr dos veces no pregunta dos veces: si la afirmación ya tiene esta pregunta, no se toca (así,
 * cuando el consultor la da por atendida, la siguiente corrida no la vuelve a marcar). Si tiene la
 * pregunta de este mismo número con cifras viejas, se reemplaza: cambió el dato. Si tiene otra
 * pregunta, se respeta.
 */
export function contrasteNumerico(metricas: MetricaGuardada[], claims: ClaimMinimo[]): ContrasteNumerico {
  const porRespuesta = new Map<string, ClaimMinimo[]>();
  const declarantes = new Map<string, Declarante | null>();
  for (const c of claims) {
    if (!c.response_id) continue;
    porRespuesta.set(c.response_id, [...(porRespuesta.get(c.response_id) ?? []), c]);
    if (c.participants) declarantes.set(c.response_id, declaranteDeRol(c.participants.rol));
  }
  const pares = emparejarDeclaradoExtraido(metricas, { declarantes });
  const lados = ladosDisponibles(metricas);

  // Qué números declaró cada respuesta y con qué cifra: dos números distintos pueden valer lo mismo.
  const declaradoEnRespuesta = new Map<string, { clave: string; valor: number }[]>();
  for (const filas of separarPorLado(metricas).declarados.values()) {
    for (const f of filas) {
      const d = declaracionDeMetrica(f);
      if (!f.response_id || d.clase === "desconocida" || d.clase === "rango") continue;
      declaradoEnRespuesta.set(f.response_id, [...(declaradoEnRespuesta.get(f.response_id) ?? []), { clave: f.clave, valor: d.valor }]);
    }
  }

  const escrituras: EscrituraEnClaim[] = [];
  const sin_afirmacion: ContrasteNumerico["sin_afirmacion"] = [];
  const atendidas = new Set<string>();
  let ya_preguntadas = 0;
  let con_otra_pregunta = 0;
  for (const p of pares) {
    if (p.veredicto.tipo !== "CONTRADICCION" || !p.pregunta) continue;
    const delDueno = p.declarado.response_id ? (porRespuesta.get(p.declarado.response_id) ?? []) : [];
    const cifraDicha = p.declaracion.clase === "rango" ? null : p.declaracion.valor;
    const conNumero = cifraDicha === null ? [] : delDueno.filter((c) => mencionaNumero(c.texto, cifraDicha));
    const rivales = p.declarado.response_id && cifraDicha !== null
      ? [...new Set((declaradoEnRespuesta.get(p.declarado.response_id) ?? []).filter((d) => d.clave !== p.clave && d.valor === cifraDicha).map((d) => d.clave))]
      : [];
    const elegida = afirmacionDelNumero(conNumero, p.clave, rivales);
    const destino = elegida ? [elegida] : !conNumero.length && delDueno.length === 1 ? delDueno : [];
    if (!destino.length) {
      sin_afirmacion.push({ clave: p.clave, periodo: p.periodo, pregunta: p.pregunta, ...(conNumero.length > 1 ? { motivo: MOTIVO_VARIAS_AFIRMACIONES } : {}) });
      continue;
    }
    for (const c of destino) {
      const actual = c.pregunta_sugerida ?? null;
      // Una cadena vacía o de espacios no es una pregunta: no hay nada que respetar ni que reemplazar.
      const previa = actual?.trim() ? actual : null;
      if (atendidas.has(c.id)) {
        con_otra_pregunta++;
      } else if (previa === p.pregunta) {
        ya_preguntadas++;
      } else if (previa && !previa.startsWith(encabezadoDePregunta(p))) {
        con_otra_pregunta++;
      } else {
        escrituras.push({ claim_id: c.id, pregunta_sugerida: p.pregunta, reemplaza: actual, clave: p.clave, periodo: p.periodo });
      }
      atendidas.add(c.id);
    }
  }
  return {
    pares,
    contradicciones: pares.filter((p) => p.veredicto.tipo === "CONTRADICCION").length,
    coincidencias: pares.filter((p) => p.veredicto.tipo === "COINCIDE").length,
    no_comparables: pares.filter((p) => p.veredicto.tipo === "NO_COMPARABLE").length,
    lados,
    sin_pares: pares.length ? null : motivoSinPares(lados),
    escrituras,
    ya_preguntadas,
    con_otra_pregunta,
    sin_afirmacion,
  };
}
