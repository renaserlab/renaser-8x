import ExcelJS from "exceljs";

/**
 * LEER UN EXCEL CELDA POR CELDA, Y CONTAR LO QUE FALTA EN VEZ DE RELLENARLO.
 *
 * Hasta el 13-10-2026 un .xlsx se rechazaba con «guárdalo como CSV». Un CSV pierde las hojas y la
 * referencia de celda; aquí cada dato sabe de qué hoja y de qué celda salió (Inventario!F3), que es
 * lo que hace falta para que una cifra extraída se pueda volver a mirar en el archivo original.
 *
 * Las celdas vacías son un hecho del documento, no un hueco que llenar: se marcan «(vacío)», se cuentan
 * por columna («costo_unitario: 40 vacías de 121») y jamás se sustituyen por cero, promedio ni estimación.
 * Un promedio inventado sobre 40 productos sin costo daría un margen que la empresa no tiene.
 *
 * Fidelidad: las celdas se leen tal cual, así que normalmente es «alta». Baja a «media» cuando hay
 * fórmulas sin resultado guardado o celdas con error (#DIV/0!): ahí el valor que vemos no es el que el
 * dueño ve en su pantalla, y se dice.
 *
 * Filas de resumen: una hoja de inventario suele terminar con «TOTAL A COSTO … 79.782». Hasta el remate del
 * 13-10-2026 esa fila contaba como un artículo más: el conteo decía «40 vacías de 121» (eran 120 artículos)
 * y la extracción podía mandar 79.782 como costo de un artículo. Ahora una fila que empieza por TOTAL, o que
 * viene tras una fila vacía con una sola cifra, se aparta en `resumen`: no es dato, pero tampoco se pierde,
 * porque el total que escribió la empresa es justo lo que se compara con lo que declaró.
 *
 * Y al revés: apartar un dato creyéndolo total también es perderlo. En una lista de precios con una fila en
 * blanco entre grupos, la primera fila de cada grupo «viene tras una vacía con una sola cifra» y es un artículo.
 * Por eso la segunda señal solo vale para una fila más RALA que las de datos (una cifra suelta, o un rótulo y
 * una cifra donde las demás traen más celdas) y, si lleva rótulo, solo al pie de la hoja. Cuando la fila tiene
 * la misma forma que un dato («Suma | 9.800» en una lista «concepto | monto»), lo único que la delata es que su
 * cifra sea la suma de la columna: solo entonces, y solo al pie, se aparta (ver esFilaDeResumen).
 *
 * Lo mismo vale para la palabra. «Subtotal», «Totales», «Gran total», «Total» a secas o «Total de…» no dejan
 * duda. Pero «Total <algo>» también es el nombre de un producto («Total Clean 1L»): ahí el rótulo solo no basta,
 * y la fila se aparta si además alguna de sus cifras suma su columna o si es un rótulo con una cifra, más rala
 * que un dato. Si tiene la forma de un artículo y no suma, se cuenta como dato y se avisa, para que quien revisa
 * lo vea: la duda se dice, no se resuelve en silencio.
 *
 * Cierre del 13-10-2026 (dos huecos que quedaban):
 *  - «TOTAL A COSTO | PEN | 79.782» o «TOTAL A COSTO | 120 artículos | 79.782» se contaba como un artículo más,
 *    porque llevaba otra celda de texto o una segunda cifra. Ahora «Total a…», «Total en…», «Total por…», «Total S/»
 *    y «Suma…» son rótulos que no dejan duda, lleven las celdas que lleven; y un «Total <algo>» dudoso se aparta
 *    también cuando los datos de la hoja llevan código y esa fila no lo trae, o cuando está al pie, tras una fila
 *    vacía y más rala que un dato.
 *  - Un artículo de verdad al que le faltan celdas («ML-121 | … | 49» tras una fila en blanco) se apartaba como
 *    total. Ahora la señal «fila rala tras una vacía» no vale para una fila que trae su código en la columna que
 *    los datos usan como código (ver columnaDeCodigo): ralo no es resumen.
 *
 * Segundo cierre del 13-10-2026 (lo que la regla anterior dejó mal):
 *  - EL CÓDIGO NO LE GANA A LA SUMA. En una hoja mensual («2026-01 | 100», «2026-02 | 200», «2026-03 | 300», fila en
 *    blanco, «T1-2026 | 600») el total del trimestre trae algo con forma de código y se contaba como un cuarto mes:
 *    600 de más, sin aviso. Traer código libra a una fila de ser tomada por total solo por rala; si además está al
 *    pie, tras una fila vacía, y su cifra es la suma de su columna, es el total, y el aviso dice las dos cosas. Lo
 *    mismo cuando el año va escrito como número («2026 | 1.000»): lo que una fila trae en la columna de código la
 *    identifica, no es una cifra más (hace falta que la hoja tenga columna de código: cuatro meses o más; ver
 *    columnaDeCodigo). Y cuando la hoja tiene varias columnas de cifras («T1-2026 | 600 | 60»), la fila del pie se
 *    aparta si CADA una de sus cifras suma su columna.
 *    Lo que sigue sin verse: un total sin rótulo PEGADO a los datos (sin fila vacía antes) o a mitad de hoja (un
 *    trimestre seguido de más meses). Ahí no hay nada que lo distinga de un dato y se cuenta como dato.
 *  - EL RÓTULO SE BUSCA EN LA PRIMERA CELDA CON TEXTO, no en la primera con valor: «60 | TOTAL A COSTO | PEN | 79.782»
 *    empieza por una cifra y se contaba como artículo sin ningún aviso. Un código de texto delante («ML-005 | Total
 *    Wash») sigue mandando: ese es el primer texto.
 *  - «TOTAL <ALGO>» AL PIE ES UN TOTAL AUNQUE TENGA LA FORMA DE UN DATO («TOTAL VALORIZADO | PEN | 120 | 79.782»,
 *    «TOTAL INVENTARIO | PEN | 79.782»). Se aparta si es la última fila de la hoja, o si está al pie tras una fila
 *    vacía. La excepción «puede ser un artículo que se llama así» queda para la fila que tiene algo debajo o que trae
 *    su código: ahí se cuenta y se avisa, como antes. El precio se sabe y se dice: un artículo «Total Clean 4L» que
 *    sea la última fila de una hoja sin códigos se aparta, con su aviso a la vista de quien revisa.
 */

export type ValorCelda = string | number | boolean | null;

export type Celda = {
  /** Referencia A1 dentro de la hoja: «F3». */
  ref: string;
  valor: ValorCelda;
};

export type Fila = {
  /** Número de fila tal como lo muestra Excel (1 = primera fila). */
  numero: number;
  celdas: Celda[];
};

export type ConteoVacias = {
  /** Nombre del encabezado, o «columna F» si la columna no tiene encabezado. */
  columna: string;
  letra: string;
  vacias: number;
  /** Sobre cuántas filas con datos se contó. */
  de: number;
};

export type Hoja = {
  nombre: string;
  /** Un nombre por columna, en orden (A, B, C…); "" si esa celda del encabezado está vacía. */
  encabezados: string[];
  /** En qué fila están los encabezados (la primera no vacía), o null si la hoja está vacía. */
  filaEncabezados: number | null;
  /** Las filas con datos, después del encabezado. Cada una trae TODAS las columnas, vacías incluidas. */
  filas: Fila[];
  /**
   * Las filas de total o resumen que la hoja trae escritas (ver esFilaDeResumen). No son datos y no entran en
   * `filas` ni en el conteo de vacías, pero se conservan: el total de la empresa sirve para contrastar.
   */
  resumen: Fila[];
  vacias: ConteoVacias[];
  avisos: string[];
};

export type FidelidadExcel = "alta" | "media";

export type LecturaExcel = { hojas: Hoja[]; avisos: string[]; fidelidad: FidelidadExcel };

function aBuffer(entrada: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(entrada)) return entrada;
  if (entrada instanceof ArrayBuffer) return Buffer.from(entrada);
  return Buffer.from(entrada.buffer, entrada.byteOffset, entrada.byteLength);
}

/** 1 → A, 26 → Z, 27 → AA. */
export function letraColumna(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function fechaATexto(d: Date): string {
  const iso = d.toISOString();
  // Una fecha sin hora se guarda como día; con hora, entera. Nunca como número de serie de Excel.
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

/**
 * Lo que hay en la celda, reducido a texto, número, booleano o nada. `avisos` recibe lo que no se puede
 * dar por bueno (fórmula sin resultado, error) para que la fidelidad lo refleje.
 */
export function normalizarValor(valor: ExcelJS.CellValue, ref: string, avisos: string[]): ValorCelda {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "string") return valor.trim() === "" ? null : valor.trim();
  if (valor instanceof Date) return fechaATexto(valor);
  if ("richText" in valor) return normalizarValor(valor.richText.map((t) => t.text).join(""), ref, avisos);
  if ("hyperlink" in valor) return normalizarValor(valor.text, ref, avisos);
  if ("error" in valor) {
    avisos.push(`Celda ${ref} con error ${valor.error}: se dejó vacía.`);
    return null;
  }
  if ("formula" in valor || "sharedFormula" in valor) {
    const resultado = (valor as ExcelJS.CellFormulaValue).result;
    if (resultado === undefined || resultado === null) {
      avisos.push(`Celda ${ref} tiene una fórmula sin resultado guardado: se dejó vacía, no se recalculó.`);
      return null;
    }
    return normalizarValor(resultado, ref, avisos);
  }
  return null;
}

function leerHoja(ws: ExcelJS.Worksheet): Hoja {
  const avisos: string[] = [];
  const columnas = ws.columnCount;
  const crudas: Fila[] = [];
  ws.eachRow({ includeEmpty: false }, (fila, numero) => {
    const celdas: Celda[] = [];
    for (let c = 1; c <= columnas; c++) {
      const ref = `${letraColumna(c)}${numero}`;
      celdas.push({ ref, valor: normalizarValor(fila.getCell(c).value, ref, avisos) });
    }
    // Una fila con formato pero sin ningún valor no es una fila con datos.
    if (celdas.some((x) => x.valor !== null)) crudas.push({ numero, celdas });
  });

  if (!crudas.length) return { nombre: ws.name, encabezados: [], filaEncabezados: null, filas: [], resumen: [], vacias: [], avisos: [...avisos, "La hoja está vacía."] };

  const [cabecera, ...cuerpo] = crudas;
  const encabezados = cabecera.celdas.map((x) => (x.valor === null ? "" : String(x.valor)));
  const filas: Fila[] = [];
  const resumen: Fila[] = [];
  // ¿Los datos de esta hoja llevan código? Si lo llevan, cada fila dice si trae el suyo: una fila con código es un dato aunque sea rala.
  const columnaCodigo = columnaDeCodigo(encabezados, cuerpo);
  const indiceCodigo = columnaCodigo?.indice;
  const codigoDe = (f: Fila): "si" | "no" | undefined => {
    if (!columnaCodigo) return undefined;
    const celda = f.celdas[columnaCodigo.indice];
    // Un rótulo de total escrito en la columna de código («TOTAL-2026») no es el código de un artículo.
    if (rotuloDeTotal(f)?.celda === celda) return "no";
    return esCodigo(celda?.valor ?? null, columnaCodigo.admiteNumero) ? "si" : "no";
  };
  // Cuántas celdas con valor trae una fila normal de esta hoja (la mediana): contra eso se mide si una fila es rala.
  const llenas = cuerpo.map((f) => f.celdas.filter((c) => c.valor !== null).length).sort((a, b) => a - b);
  const tipico = llenas.length ? llenas[Math.floor(llenas.length / 2)] : 0;
  const motivos: (string | null)[] = cuerpo.map(() => null);
  const trasVacia = (i: number) => cuerpo[i].numero > (i === 0 ? cabecera.numero : cuerpo[i - 1].numero) + 1;
  // Primero, de arriba abajo, las filas que empiezan por un rótulo de total: que lo sean depende de su forma y de
  // las filas de arriba (¿alguna de sus cifras suma su columna?), nunca de lo que venga debajo.
  for (let i = 0; i < cuerpo.length; i++) {
    if (!rotuloDeTotal(cuerpo[i])) continue;
    motivos[i] = esFilaDeResumen(cuerpo[i], trasVacia(i), { tipico, alPie: false, algunaCifraSuma: algunaCifraSuma(cuerpo, i, motivos, indiceCodigo), codigo: codigoDe(cuerpo[i]), indiceCodigo });
  }
  // Después, de abajo arriba, las demás: así se sabe si debajo de cada fila quedan datos o solo más filas de resumen (el pie de la hoja).
  let alPie = true;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    // La suma solo se mira al pie: en cuanto aparece un dato desde abajo ya no se vuelve a calcular.
    if (!rotuloDeTotal(cuerpo[i])) motivos[i] = esFilaDeResumen(cuerpo[i], trasVacia(i), { tipico, alPie, cuadraConLaSuma: alPie && cuadraConLaSuma(cuerpo, i, motivos, indiceCodigo), codigo: codigoDe(cuerpo[i]), indiceCodigo });
    // Un «Total <algo>» que arriba quedó en duda se vuelve a mirar ahora que se sabe que está al pie: ahí es un total si
    // viene tras una fila vacía o si es la última fila de la hoja, tenga la forma que tenga.
    else if (!motivos[i] && alPie) motivos[i] = esFilaDeResumen(cuerpo[i], trasVacia(i), { tipico, alPie: true, ultima: i === cuerpo.length - 1, codigo: codigoDe(cuerpo[i]), indiceCodigo });
    if (!motivos[i]) alPie = false;
  }
  cuerpo.forEach((f, i) => {
    const motivo = motivos[i];
    if (motivo) {
      resumen.push(f);
      avisos.push(`Fila ${f.numero} tomada como fila de resumen (${motivo}): no cuenta como dato.`);
      return;
    }
    filas.push(f);
    // Empieza por «Total…» y aun así se contó: se dice, porque puede ser un artículo («Total Clean 1L») o un total que no cuadra.
    const dudosa = rotuloDeTotal(f);
    if (dudosa) avisos.push(`Fila ${f.numero} ${dudosa.primera ? "empieza por" : "tiene como primer texto"} «${textoDeRotulo(dudosa.celda)}» pero tiene la forma de un dato y ninguna de sus cifras suma su columna: se contó como dato.`);
  });
  const vacias: ConteoVacias[] = encabezados.map((nombre, i) => {
    const letra = letraColumna(i + 1);
    return { columna: nombre || `columna ${letra}`, letra, vacias: filas.filter((f) => f.celdas[i].valor === null).length, de: filas.length };
  });
  return { nombre: ws.name, encabezados, filaEncabezados: cabecera.numero, filas, resumen, vacias, avisos };
}

/** Empieza por «total», «totales», «subtotal», «gran total», «suma», «sumas» o «sumatoria», como palabra entera («totalmente» y «sumar» no). */
const EMPIEZA_POR_TOTAL = /^\s*(?:(?:gran\s+|sub)?total(?:es)?|sumas?|sumatoria)\b/i;
/**
 * Rótulos que no dejan duda, lleve la fila las celdas que lleve (una moneda, «120 artículos», dos cifras):
 *  - «Subtotal…», «Totales…», «Gran total…», «Sumas…», «Sumatoria…»;
 *  - «Total» o «Suma» a secas (con o sin dos puntos), o seguidos de un paréntesis o de una moneda («Total (S/)», «TOTAL S/», «Total PEN»);
 *  - «Total general», «Suma total» y «Total» o «Suma» seguidos de preposición: «Total de…», «Total del…», «TOTAL A COSTO»,
 *    «Total en soles», «Total por cobrar».
 * Nadie llama así a un artículo. Lo que queda fuera es «Total <algo>» y «Suma <algo>», que también pueden ser el nombre
 * de un producto («Total Clean 1L», «Total 90», «Suma Bac D10»).
 */
const TOTAL_SIN_DUDA = new RegExp(
  "^\\s*(?:" +
    "(?:gran\\s+total(?:es)?|subtotal(?:es)?|totales|sumas|sumatoria)\\b" +
    "|(?:total|suma)\\s*[:.=]*\\s*$" +
    "|(?:total|suma)\\s*[:.=]*\\s*(?:\\(|S\\/|US\\$|\\$|€)" +
    "|(?:total|suma)\\s+(?:general(?:es)?|total(?:es)?|de|del|a|al|en|por|pen|usd|soles)\\b" +
    ")",
  "i"
);

/** «ML-001», «EXP-2026-014», «2026-04», «A12»: una sola pieza, sin espacios y con alguna cifra. Así se escribe un código, no un nombre. */
const PARECE_CODIGO = /^(?=\S*\d)\S{1,24}$/;
/**
 * Encabezados que nombran un identificador. Solo bajo uno de ellos vale como código un número entero (un «N°» 1, 2, 3…
 * o un SKU numérico); sin ese encabezado una columna de enteros es una cantidad, no un código.
 */
const ENCABEZADO_DE_CODIGO = /^\s*(?:(?:#|n[°º]|n[°ºo]\.|nro\.?|n[uú]m\.?|n[uú]mero)\s*$|(?:c[oó]d\.?|c[oó]digo|id|sku|[ií]tem|ref\.?|referencia)(?:[\s_\-:.]|$))/i;
/** Con menos filas no hay patrón que reconocer: tres códigos seguidos sí lo son. */
const MIN_FILAS_CON_CODIGO = 3;

/** ¿Es este valor un código? Un texto de una pieza con alguna cifra; o, si la columna se llama «código», «N°», «id»…, también un entero. */
export function esCodigo(valor: ValorCelda, admiteNumero: boolean): boolean {
  if (typeof valor === "string") return PARECE_CODIGO.test(valor);
  return admiteNumero && typeof valor === "number" && Number.isInteger(valor);
}

/**
 * LA COLUMNA QUE LOS DATOS USAN COMO CÓDIGO: la primera, de izquierda a derecha, en la que al menos cuatro de cada
 * cinco filas traen un código («ML-001», un periodo «2026-04», o un entero bajo un encabezado «N°» o «código»).
 * No se cuentan las filas cuyo primer texto es un rótulo de total. Devuelve null si la hoja no tiene ninguna: una
 * lista «concepto | monto» o un inventario identificado solo por nombres no llevan código, y ahí nada cambia.
 * El umbral no se afloja para hojas cortas: con cuatro filas, tres códigos no bastan. Aflojarlo apartaba como total
 * un artículo sin código que se llama «Total Sport zapatilla» (lo cubre tests/producto.test.ts). El precio: bajo
 * solo tres meses, un año escrito como NÚMERO («2026 | 600») no se reconoce como total; con cuatro meses o más, sí.
 *
 * Sirve para dos cosas: una fila que TRAE su código es un dato aunque le falten celdas (ralo no es resumen); y una
 * fila «Total <algo>» que NO lo trae, en una hoja donde los datos lo llevan, no es un artículo.
 */
export function columnaDeCodigo(encabezados: string[], cuerpo: Fila[]): { indice: number; admiteNumero: boolean } | null {
  const datos = cuerpo.filter((f) => !rotuloDeTotal(f));
  if (datos.length < MIN_FILAS_CON_CODIGO) return null;
  const columnas = Math.max(encabezados.length, ...datos.map((f) => f.celdas.length));
  for (let k = 0; k < columnas; k++) {
    const admiteNumero = ENCABEZADO_DE_CODIGO.test(encabezados[k] ?? "");
    const conCodigo = datos.filter((f) => esCodigo(f.celdas[k]?.valor ?? null, admiteNumero)).length;
    if (conCodigo >= MIN_FILAS_CON_CODIGO && conCodigo >= datos.length * 0.8) return { indice: k, admiteNumero };
  }
  return null;
}

/**
 * La primera celda CON TEXTO de la fila, si es un rótulo de total. `claro` dice si el rótulo basta por sí solo;
 * `primera`, si además es lo primero que trae la fila.
 *
 * Se mira el primer texto y no la primera celda con valor: en «60 | TOTAL A COSTO | PEN | 79.782» lo primero es una
 * cifra (un conteo, un número de fila) y el rótulo viene después. Un código de texto delante sí manda: en
 * «ML-005 | Total Wash detergente» el primer texto es el código, y esa fila es un artículo.
 */
export function rotuloDeTotal(fila: Fila): { celda: Celda; claro: boolean; primera: boolean } | null {
  const texto = fila.celdas.find((c) => typeof c.valor === "string");
  if (!texto || typeof texto.valor !== "string" || !EMPIEZA_POR_TOTAL.test(texto.valor)) return null;
  return { celda: texto, claro: TOTAL_SIN_DUDA.test(texto.valor), primera: fila.celdas.find((c) => c.valor !== null) === texto };
}

const textoDeRotulo = (celda: Celda): string => String(celda.valor).trim().slice(0, 60);

const casiIgual = (suma: number, total: number): boolean => Math.abs(suma - total) <= Math.max(0.01, Math.abs(total) * 1e-9);

/**
 * ¿CADA cifra de la fila `i` es la suma de su misma columna en las filas de arriba? Con una sola cifra es la pregunta
 * de siempre («Saldo | 9.800»); con varias («T1-2026 | 600 | 60») tienen que cuadrar todas: una que no cuadre y la
 * fila es un dato. Hacen falta al menos dos sumandos por columna (una fila igual a la de arriba no es una suma) y se
 * dejan fuera las filas ya apartadas como total, que no son sumandos. Una fila «Total Clean 1L» que se quedó como
 * dato sí suma: es un artículo más.
 *
 * Lo que la fila trae en la columna de código no es una cifra que sumar: es su identificador, aunque sea un número
 * (el año «2026» bajo los meses, o el «N°» de un artículo). Sin esto, un artículo N° 3 sin precio, tras los N° 1 y 2,
 * «sumaba» su columna.
 *
 * Una suma de ceros no delata nada: bajo dos meses sin ventas, un tercer mes sin ventas «suma» su columna y es un
 * mes. Si todas las cifras de la fila son cero, no cuadra.
 */
function cuadraConLaSuma(cuerpo: Fila[], i: number, apartadas: (string | null)[], indiceCodigo?: number): boolean {
  const cifras = cuerpo[i].celdas.map((c, k) => ({ c, k })).filter((x) => typeof x.c.valor === "number" && x.k !== indiceCodigo);
  if (!cifras.length || cifras.every(({ c }) => c.valor === 0)) return false;
  return cifras.every(({ c, k }) => {
    let suma = 0;
    let sumandos = 0;
    for (let j = 0; j < i; j++) {
      const v = cuerpo[j].celdas[k]?.valor;
      if (typeof v !== "number" || apartadas[j]) continue;
      suma += v;
      sumandos++;
    }
    return sumandos >= 2 && casiIgual(suma, c.valor as number);
  });
}

/**
 * ¿Alguna cifra de la fila `i` es la suma de su columna en las filas de arriba? Vale la suma de todo lo anterior
 * (un total) o la del grupo que empieza tras la última fila ya apartada (un subtotal). Al menos dos sumandos.
 * Es lo que distingue «Total ventas | 9.800» de un artículo que se llama «Total Clean 1L | 12,50».
 * La columna de código no se mira: el «N°» 3 de un artículo no es la suma de los N° 1 y 2.
 */
function algunaCifraSuma(cuerpo: Fila[], i: number, apartadas: (string | null)[], indiceCodigo?: number): boolean {
  return cuerpo[i].celdas.some((c, k) => {
    if (typeof c.valor !== "number" || k === indiceCodigo) return false;
    let todo = 0;
    let nTodo = 0;
    let grupo = 0;
    let nGrupo = 0;
    for (let j = 0; j < i; j++) {
      if (apartadas[j]) {
        grupo = 0;
        nGrupo = 0;
        continue;
      }
      const v = cuerpo[j].celdas[k]?.valor;
      if (typeof v !== "number") continue;
      todo += v;
      nTodo++;
      grupo += v;
      nGrupo++;
    }
    return (nTodo >= 2 && casiIgual(todo, c.valor)) || (nGrupo >= 2 && casiIgual(grupo, c.valor));
  });
}

/** Lo que la hoja sabe de la fila que se está mirando; sin él, esFilaDeResumen juzga la fila sola. */
export type ContextoDeFila = {
  /** Cuántas celdas con valor trae una fila normal de la hoja. */
  tipico: number;
  /** true si debajo no queda ninguna fila de datos (solo, si acaso, más filas de resumen). */
  alPie: boolean;
  /** true si esta es la última fila con valores de la hoja: debajo no hay nada, ni datos ni otros totales. Solo se mira en filas «Total <algo>». */
  ultima?: boolean;
  /** true si cada cifra de la fila (la única, si trae una sola) es la suma de su columna en las filas de arriba. */
  cuadraConLaSuma?: boolean;
  /** true si alguna cifra de la fila es la suma de su columna (de todo lo anterior, o de su grupo). Solo se mira en filas «Total <algo>». */
  algunaCifraSuma?: boolean;
  /**
   * Si los datos de la hoja usan una columna como código (ver columnaDeCodigo): «si» cuando esta fila trae el suyo,
   * «no» cuando no lo trae. Sin definir: la hoja no tiene columna de código y la fila se juzga por su forma.
   */
  codigo?: "si" | "no";
  /**
   * En qué columna (0 = A) llevan su código los datos de la hoja, si lo llevan. Lo que esta fila trae ahí la identifica
   * y no cuenta como cifra aunque sea un número: «2026 | 600» bajo los meses es un rótulo y una cifra, no dos cifras.
   */
  indiceCodigo?: number;
};

/**
 * ¿Es esta fila un total que escribió la empresa y no un dato más? Dos señales, cualquiera basta:
 *  - la primera celda con texto empieza por «TOTAL», «SUBTOTAL», «TOTALES», «GRAN TOTAL» o «SUMA». Si el rótulo no
 *    deja duda («Total», «Subtotal…», «Total de…», «TOTAL A COSTO», «Suma»), basta, con o sin más celdas. Si es
 *    «Total <algo>» o «Suma <algo>», que también puede ser el nombre de un artículo, con el contexto de la hoja se
 *    exige además una de estas cosas: que alguna de sus cifras sume su columna; que sea un rótulo con una cifra como
 *    mucho y más rala que un dato; que los datos de la hoja lleven código y esta fila no lo traiga; que esté al pie
 *    tras una fila vacía; o que sea la última fila de la hoja. Las dos últimas no valen para la fila que trae su
 *    código: esa es un artículo que se llama así. Sin contexto la fila se juzga sola y el rótulo basta;
 *  - viene después de una fila vacía y trae una sola cifra, sola o con un único rótulo: es la forma típica de
 *    un total suelto. Con el contexto de la hoja se exige además algo que la distinga de un dato:
 *      · que sea más rala que una fila normal (una cifra suelta donde las demás traen varias celdas) y, si lleva
 *        rótulo, que esté al pie: un nombre y una cifra seguidos de más datos son un dato tras un separador. Esto
 *        no vale para una fila que trae su código donde los datos lo llevan: es un artículo (o un periodo) al que
 *        le faltan celdas, y ralo no es resumen;
 *      · o que esté al pie y su cifra sea la suma de la columna. Esto sí vale aunque traiga código: «T1-2026 | 600»
 *        bajo tres meses que suman 600 es el total del trimestre, no un cuarto mes. Con varias cifras
 *        («T1-2026 | 600 | 60») tienen que sumar todas.
 * Lo que la fila trae en la columna de código la identifica y no cuenta como cifra, aunque sea un número («2026»).
 * Devuelve el motivo en palabras (para el aviso) o null si es una fila de datos. Lo que se aparta deja de contarse,
 * así que solo se aparta lo que tiene forma de total, y siempre con su aviso, que dice por qué.
 */
export function esFilaDeResumen(fila: Fila, trasFilaVacia: boolean, contexto?: ContextoDeFila): string | null {
  const conValor = fila.celdas.filter((c) => c.valor !== null);
  const enCodigo = contexto?.indiceCodigo === undefined ? undefined : fila.celdas[contexto.indiceCodigo];
  const cifras = conValor.filter((c) => typeof c.valor === "number" && c !== enCodigo);
  const rotulos = conValor.filter((c) => typeof c.valor === "string" || (c === enCodigo && typeof c.valor === "number"));
  const total = rotuloDeTotal(fila);
  if (total) {
    const rotulo = `${total.primera ? "empieza por" : "su primer texto es"} «${textoDeRotulo(total.celda)}»`;
    const soloRotuloYCifra = rotulos.length === 1 && cifras.length <= 1 && rotulos.length + cifras.length === conValor.length;
    if (!contexto || total.claro || contexto.algunaCifraSuma || (soloRotuloYCifra && conValor.length < contexto.tipico)) return rotulo;
    // Con más celdas (una moneda, «120 artículos», una segunda cifra) sigue siendo un total si no ocupa el sitio de un
    // artículo: los datos llevan código y esta fila no.
    if (contexto.codigo === "no") return `${rotulo} y no trae código donde los datos lo llevan`;
    // O si está al pie, tenga la forma que tenga: tras una fila vacía, o como última fila de la hoja. La que trae su
    // código (un «N°» delante) no: es un artículo que se llama así, y sigue abajo como cualquier otra fila.
    if (contexto.codigo !== "si") {
      if (trasFilaVacia && contexto.alPie) return `${rotulo}, al pie de la hoja y tras una fila vacía`;
      if (contexto.ultima) return `${rotulo} y es la última fila de la hoja`;
    }
    // «Total <algo>» con la forma de un dato, sin sumar nada y con algo debajo: sigue abajo como cualquier otra fila.
  }
  if (!trasFilaVacia || !cifras.length || rotulos.length > 1 || cifras.length + rotulos.length !== conValor.length) return null;
  const suma = !!contexto?.alPie && !!contexto.cuadraConLaSuma;
  const conCodigo = contexto?.codigo === "si";
  const suCodigo = conCodigo ? `trae código${enCodigo && enCodigo.valor !== null ? ` («${String(enCodigo.valor).slice(0, 40)}»)` : ""}, pero ` : "";
  // Varias cifras tras una fila vacía son un dato tras un separador… salvo que CADA una sea la suma de su columna y
  // debajo no queden datos: el total del año o del trimestre bajo sus meses.
  if (cifras.length > 1) return suma ? `${suCodigo}viene tras una fila vacía, al pie de la hoja, y cada una de sus cifras es la suma de su columna` : null;
  if (contexto) {
    // Trae su código: ralo no es resumen. Pero el código no le gana a la suma: al pie y sumando su columna, es el total.
    if (conCodigo) return suma ? `${suCodigo}viene tras una fila vacía, al pie de la hoja, y su única cifra, en ${cifras[0].ref}, es la suma de su columna` : null;
    const rala = conValor.length < contexto.tipico;
    if (rala && rotulos.length === 1 && !contexto.alPie) return null;
    if (!rala && !suma) return null;
    if (!rala) return `viene tras una fila vacía con una sola cifra, en ${cifras[0].ref}, que es la suma de su columna`;
  }
  return `viene tras una fila vacía con una sola cifra, en ${cifras[0].ref}`;
}

export async function leerExcel(entrada: Buffer | ArrayBuffer | Uint8Array): Promise<LecturaExcel> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(aBuffer(entrada) as unknown as ExcelJS.Buffer);
  const hojas = wb.worksheets.map(leerHoja);
  const avisos = hojas.flatMap((h) => h.avisos.map((a) => `${h.nombre}: ${a}`));
  // Solo rebajan la fidelidad los avisos de celda (fórmula sin resultado, error). Una fila de resumen apartada no:
  // y su aviso cita el rótulo de la fila, que puede decir «error» o «fórmula» sin que la lectura tenga ninguno.
  const conDudas = hojas.some((h) => h.avisos.some((a) => /^Celda \S+ (tiene una fórmula|con error)/.test(a)));
  return { hojas, avisos, fidelidad: conDudas ? "media" : "alta" };
}

/**
 * Los avisos de leerExcel ya están en castellano, pero salen uno por celda: una hoja con 300 fórmulas sin
 * resultado daría 300 líneas en la pantalla del consultor. Aquí se cuentan por clase y por hoja y se
 * nombran las primeras celdas; el resto queda en `LecturaExcel.avisos` para quien quiera el detalle.
 */
export function resumirAvisosExcel(avisos: string[]): string {
  if (!avisos.length) return "";
  type Cuenta = { formulas: string[]; errores: string[]; resumen: string[]; dudosas: string[]; vacias: boolean; otros: number };
  const porHoja = new Map<string, Cuenta>();
  for (const a of avisos) {
    const sep = a.indexOf(": ");
    const hoja = sep > 0 ? a.slice(0, sep) : "(hoja)";
    const resto = sep > 0 ? a.slice(sep + 2) : a;
    const c = porHoja.get(hoja) ?? { formulas: [], errores: [], resumen: [], dudosas: [], vacias: false, otros: 0 };
    const celda = resto.match(/^Celda ([A-Z]+\d+)/)?.[1];
    const filaResumen = resto.match(/^Fila (\d+) tomada como fila de resumen/)?.[1];
    const filaDudosa = resto.match(/^Fila (\d+) (?:empieza por|tiene como primer texto) «/)?.[1];
    if (celda && /fórmula sin resultado/.test(resto)) c.formulas.push(celda);
    else if (celda && /con error/.test(resto)) c.errores.push(celda);
    else if (filaResumen) c.resumen.push(filaResumen);
    else if (filaDudosa) c.dudosas.push(filaDudosa);
    else if (/está vacía/.test(resto)) c.vacias = true;
    else c.otros++;
    porHoja.set(hoja, c);
  }
  const primeras = (xs: string[]) => xs.slice(0, 5).join(", ") + (xs.length > 5 ? "…" : "");
  const partes: string[] = [];
  for (const [hoja, c] of porHoja) {
    const de: string[] = [];
    if (c.formulas.length) de.push(`${c.formulas.length} celda(s) con fórmula sin resultado guardado (${primeras(c.formulas)}), tomadas como vacías`);
    if (c.errores.length) de.push(`${c.errores.length} celda(s) con error de Excel (${primeras(c.errores)}), tomadas como vacías`);
    if (c.resumen.length) de.push(`${c.resumen.length} fila(s) de total o resumen apartadas (fila ${primeras(c.resumen)}), no cuentan como datos`);
    if (c.dudosas.length) de.push(`${c.dudosas.length} fila(s) que empiezan por «Total» contadas como dato porque tienen la forma de un dato (fila ${primeras(c.dudosas)})`);
    if (c.vacias) de.push("hoja vacía");
    if (c.otros) de.push(`${c.otros} aviso(s) más`);
    partes.push(`${hoja}: ${de.join("; ")}`);
  }
  return partes.join(" · ");
}

export const FILAS_POR_TRAMO_EXCEL = 400;

export type TramoExcel = {
  hoja: string;
  texto: string;
  /** Primera y última fila de Excel incluidas en este tramo. */
  desde: number | null;
  hasta: number | null;
};

/** «costo_unitario (F): 40 vacías de 120 · transporte (F): 3 vacías de 6». Solo las columnas con huecos. */
export function resumenVacias(hoja: Hoja): string {
  const con = hoja.vacias.filter((v) => v.vacias > 0);
  if (!con.length) return "ninguna celda vacía";
  return con.map((v) => `${v.columna} (${v.letra}): ${v.vacias} ${v.vacias === 1 ? "vacía" : "vacías"} de ${v.de}`).join(" · ");
}

function valorATexto(v: ValorCelda): string {
  if (v === null) return "(vacío)";
  if (typeof v === "boolean") return v ? "VERDADERO" : "FALSO";
  return String(v);
}

/** «1 fila de resumen apartada (fila 123: TOTAL A COSTO … · F=79782)», o "" si la hoja no trae ninguna. */
export function resumenFilasDeResumen(hoja: Hoja): string {
  if (!hoja.resumen.length) return "";
  const describir = (f: Fila) =>
    `fila ${f.numero}: ` +
    f.celdas
      .filter((c) => c.valor !== null)
      .map((c) => (typeof c.valor === "string" ? c.valor.slice(0, 60) : `${c.ref.replace(/\d+$/, "")}=${valorATexto(c.valor)}`))
      .join(" · ");
  const n = hoja.resumen.length;
  return `${n} fila${n === 1 ? "" : "s"} de resumen apartada${n === 1 ? "" : "s"} (${hoja.resumen.slice(0, 3).map(describir).join(" | ")}${n > 3 ? " | …" : ""})`;
}

/**
 * Las filas que empiezan por «Total…» y aun así se contaron como dato (tienen la forma de un artículo y no suman
 * su columna). «1 fila que empieza por «Total» contada como dato (fila 7: Total Clean 1L)», o "" si no hay ninguna.
 * No se guardan aparte: son las filas de datos cuyo primer valor es un rótulo de total.
 */
export function resumenFilasConRotuloDeTotal(hoja: Hoja): string {
  const dudosas = hoja.filas.map((f) => ({ f, r: rotuloDeTotal(f) })).filter((x) => x.r);
  if (!dudosas.length) return "";
  const n = dudosas.length;
  const cuales = dudosas.slice(0, 3).map((x) => `fila ${x.f.numero}: ${textoDeRotulo(x.r!.celda)}`).join(" | ");
  return `${n} fila${n === 1 ? "" : "s"} que empieza${n === 1 ? "" : "n"} por «Total» contada${n === 1 ? "" : "s"} como dato (${cuales}${n > 3 ? " | …" : ""})`;
}

/**
 * Texto tabular por hoja, con la referencia de cada celda delante de su valor, para que la extracción
 * cite «Inventario!F3» y no «la tercera fila». Cada tramo repite el encabezado y el conteo de vacías:
 * un tramo se lee solo, sin el anterior.
 */
export function excelComoTexto(hojas: Hoja[], filasPorTramo = FILAS_POR_TRAMO_EXCEL): { tramos: TramoExcel[]; filas: number } {
  const tramos: TramoExcel[] = [];
  let totalFilas = 0;
  for (const h of hojas) {
    totalFilas += h.filas.length;
    const columnas = h.encabezados.map((e, i) => `${letraColumna(i + 1)} ${e || "(sin encabezado)"}`).join(" | ");
    const totalTramos = Math.max(1, Math.ceil(h.filas.length / filasPorTramo));
    for (let t = 0; t < totalTramos; t++) {
      const bloque = h.filas.slice(t * filasPorTramo, (t + 1) * filasPorTramo);
      // Las filas de resumen van en la cabecera de cada tramo, rotuladas: el total que escribió la empresa es
      // un dato de la hoja (sirve para contrastar), pero no es un artículo ni una fila más que sumar.
      const describirResumen = (f: Fila) =>
        `fila ${f.numero}: ` +
        f.celdas
          .map((c, i) => (c.valor === null ? null : `${c.ref} ${h.encabezados[i] || "(sin encabezado)"}=${valorATexto(c.valor)}`))
          .filter(Boolean)
          .join(" | ");
      const resumen = h.resumen.length
        ? [`Filas de total o resumen escritas en la hoja (NO son datos: no las cuentes como fila ni las sumes; cítalas como total de la hoja): ${h.resumen.map(describirResumen).join(" || ")}`]
        : [];
      // Y al revés: una fila «Total <algo>» que se dejó entre los datos se señala, para que el extractor no la sume a ciegas.
      const dudosasDelTramo = bloque.filter((f) => rotuloDeTotal(f)).map((f) => f.numero);
      const dudosas = dudosasDelTramo.length
        ? [`Filas que empiezan por «Total» pero se leyeron como dato porque tienen la forma de un dato: fila ${dudosasDelTramo.join(", ")}. Si por su contenido es un total y no un artículo, no la cuentes como fila ni la sumes.`]
        : [];
      const cabecera = [
        `Hoja «${h.nombre}» · ${h.filas.length} fila(s) con datos${h.filaEncabezados ? ` (encabezados en la fila ${h.filaEncabezados})` : ""} · tramo ${t + 1} de ${totalTramos}`,
        `Columnas: ${columnas || "(ninguna)"}`,
        `Celdas vacías por columna: ${resumenVacias(h)}`,
        ...resumen,
        ...dudosas,
        `Cita cada dato con hoja y celda, por ejemplo ${h.nombre}!${letraColumna(1)}${bloque[0]?.numero ?? 2}. Una celda «(vacío)» no tiene dato: no la rellenes ni la estimes.`,
      ];
      const lineas = bloque.map((f) => `fila ${f.numero}: ` + f.celdas.map((c, i) => `${c.ref} ${h.encabezados[i] || "(sin encabezado)"}=${valorATexto(c.valor)}`).join(" | "));
      tramos.push({ hoja: h.nombre, texto: [...cabecera, ...lineas].join("\n"), desde: bloque[0]?.numero ?? null, hasta: bloque[bloque.length - 1]?.numero ?? null });
    }
  }
  return { tramos, filas: totalFilas };
}
