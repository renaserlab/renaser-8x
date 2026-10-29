/**
 * UN WORD O UN EXCEL SE LEEN TAL COMO SON, Y NADA DE LO LEÍDO CUENTA HASTA QUE ALGUIEN LO REVISA.
 *
 * Hasta el 13-10-2026 el sistema rechazaba el .docx («expórtalo a PDF») y el .xlsx («guárdalo como CSV»):
 * le pasaba trabajo al dueño y perdía justo lo que hace trazable una cifra, la hoja y la celda. Peor: un
 * número leído de un PDF nacía «verificado» sin que nadie lo hubiera conciliado (extraer.ts, minEstado).
 *
 * Estas pruebas usan los archivos sintéticos de los dos pilotos (tests/fixtures/pilotos), que llevan
 * FALTANTES y CONTRADICCIONES deliberadas descritas en declaraciones.json: Jorge sin funciones, Carmen sin
 * horario, 40 de 120 artículos sin costo, 110 expedientes sin horas. Lo que se prueba no es que el sistema
 * «entienda» la empresa, sino que lea entero, cuente lo que falta sin rellenarlo, cite la celda exacta,
 * rechace con claridad lo que no sabe leer, y que ninguna cifra de documento se haga «verificado» sola.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { leerWord, parrafosDeHtml, tituloDe, decodificarEntidades, resumirAvisos } from "@/lib/documentos/word";
import { leerExcel, excelComoTexto, letraColumna, normalizarValor, resumenVacias, resumirAvisosExcel, esFilaDeResumen, resumenFilasDeResumen, resumenFilasConRotuloDeTotal, columnaDeCodigo, esCodigo, type Fila as FilaExcel } from "@/lib/documentos/excel";
import { detectarYLeer, firmaDe, MIME_EXCEL, MIME_EXCEL_ANTIGUO, MIME_WORD, MIME_WORD_ANTIGUO, NOTA_TIPO_OFFICE_DUDOSO, NOTA_WORD_ANTIGUO } from "@/lib/documentos";
import { FIDELIDAD_TEXTO, rotuloFidelidad, citaDe, traducirAvisosLectura, AVISO_LECTURA, PATRON_MENSAJE_CRUDO, afirmacionYaDecidida, numeroYaDecidido, NOTA_NUMERO_DESCARTADO, esLecturaEnParte, resumenLecturaEnParte, pasaPorRevision, LEIDA_EN_PARTE, NOTA_CONSOLIDADA_EN_PARTE, NOTA_LECTURA_ANTERIOR } from "@/lib/documentos/fidelidad";
import { validarArchivo, RECHAZADOS_CON_MENSAJE, EXTENSION_FORMATO_VIEJO } from "@/lib/archivos";
import { guardarMetricas, estadoAlGuardar, puedePisar, seccionDeParrafo, celdaConHoja, trocearParrafos, requiereRevision, releerDelArchivo, lecturaEnParte } from "@/lib/jobs/handlers/extraer";

import { baseConEsquema } from "./sql/aplicar";

const PILOTOS = path.resolve(__dirname, "fixtures/pilotos");
const LUCERO = (f: string) => readFileSync(path.join(PILOTOS, "modas-lucero", f));
const VARGAS = (f: string) => readFileSync(path.join(PILOTOS, "estudio-vargas", f));

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Lo mínimo de PostgREST que usan guardarMetricas y la ruta de consolidación, en memoria.
 * `topeFilas` imita el max-rows del servidor: ninguna respuesta trae más filas, pida lo que pida la consulta.
 * `registro` anota lo que se le pidió (la lista de ids más larga en un `in`, cuántas escrituras), para poder
 * afirmar que una fuente grande no se revisa con cientos de ids en una consulta ni con una escritura por fila.
 * `errores` rompe una tabla entera (`jobs`) o solo una forma de pedirla (`jobs|<columnas del select>`): así se
 * imita a una base que no acepta una consulta concreta y sí las demás.
 */
function crearBaseFalsa(inicial: Record<string, Fila[]> = {}, errores: Record<string, string> = {}, opciones: { topeFilas?: number } = {}) {
  const tablas: Record<string, Fila[]> = inicial;
  const registro = { idsEnUnIn: 0, escrituras: 0 };
  let seq = 0;
  class Consulta {
    private filtros: ((f: Fila) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" = "select";
    private fila: Fila | null = null;
    private patch: Fila | null = null;
    private unico: "single" | "maybe" | null = null;
    private rango: [number, number] | null = null;
    private columnas: string | null = null;
    constructor(private tabla: string) {}
    select(columnas?: string) { this.columnas = columnas ?? null; return this; }
    insert(f: Fila) { this.op = "insert"; this.fila = f; return this; }
    update(p: Fila) { this.op = "update"; this.patch = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c: string, v: unknown) { this.filtros.push((f) => f[c] === v); return this; }
    in(c: string, vs: unknown[]) { if (c === "id") registro.idsEnUnIn = Math.max(registro.idsEnUnIn, vs.length); this.filtros.push((f) => vs.includes(f[c])); return this; }
    // `payload @> {…}` de PostgREST: la fila contiene cada clave pedida con ese valor.
    contains(c: string, v: Record<string, unknown>) { this.filtros.push((f) => !!f[c] && Object.entries(v).every(([k, x]) => f[c][k] === x)); return this; }
    range(desde: number, hasta: number) { this.rango = [desde, hasta]; return this; }
    order() { return this; }
    limit() { return this; }
    single() { this.unico = "single"; return this; }
    maybeSingle() { this.unico = "maybe"; return this; }
    then<A, B>(res: (v: Fila) => A, rej?: (e: unknown) => B) { return Promise.resolve().then(() => this.ejecutar()).then(res, rej); }
    private ejecutar(): Fila {
      // Una tabla «rota» (columna inexistente, migración sin aplicar) responde como PostgREST: data null y error.
      const roto = errores[this.tabla] ?? (this.columnas ? errores[`${this.tabla}|${this.columnas}`] : undefined);
      if (roto) return { data: null, error: { message: roto } };
      const t = (tablas[this.tabla] ??= []);
      if (this.op === "insert") {
        const row = { id: `${this.tabla}-${++seq}`, ...this.fila };
        t.push(row);
        return { data: this.unico ? row : [row], error: null };
      }
      const filas = t.filter((f) => this.filtros.every((fn) => fn(f)));
      if (this.op === "update") { registro.escrituras++; for (const f of filas) Object.assign(f, this.patch); return { data: filas, error: null }; }
      // Borrar quita las filas de la tabla en su sitio: quien guardó `tablas.x` antes sigue viendo la misma lista.
      if (this.op === "delete") { registro.escrituras++; for (const f of filas) t.splice(t.indexOf(f), 1); return { data: null, error: null }; }
      if (this.unico === "single") return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: `esperaba una fila en ${this.tabla}, hay ${filas.length}` } };
      if (this.unico === "maybe") return { data: filas[0] ?? null, error: null };
      // Como PostgREST con `count: "exact"`: la página pedida y, aparte, cuántas filas hay en total.
      const desde = this.rango ? this.rango[0] : 0;
      const hasta = Math.min(this.rango ? this.rango[1] + 1 : filas.length, desde + (opciones.topeFilas ?? Infinity));
      return { data: filas.slice(desde, hasta), error: null, count: filas.length };
    }
  }
  return { from: (t: string) => new Consulta(t), tablas, registro };
}

describe("Word · funciones-del-personal.docx se lee entero, con títulos, viñetas y lo que falta", () => {
  it("encuentra el POR DEFINIR de Jorge y los cuatro puestos como títulos", async () => {
    const w = await leerWord(LUCERO("funciones-del-personal.docx"));
    expect(w.texto).toContain("POR DEFINIR");
    // El párrafo 1 es el título del documento; los cuatro títulos siguientes son los puestos.
    const puestos = w.parrafos.filter((p) => p.estilo === "titulo" && p.indice > 1);
    expect(puestos.map((p) => p.texto)).toEqual([
      "Gerente general — Lucero Quintana",
      "Vendedora principal / caja — Rosa Mamani",
      "Vendedora — Carmen Huamán",
      "Almacén y reparto (medio tiempo) — Jorge Ccahuana",
    ]);
    // 6 + 4 + 3 viñetas: Jorge no tiene ninguna, y eso es un dato del documento, no un hueco a rellenar.
    expect(w.parrafos.filter((p) => p.estilo === "lista")).toHaveLength(13);
    const jorge = puestos[3];
    const sinFunciones = w.parrafos.find((p) => p.texto === "Funciones: POR DEFINIR.")!;
    expect(tituloDe(w.parrafos, sinFunciones.indice)?.texto).toBe(jorge.texto);
    expect(w.parrafos.filter((p) => p.estilo === "lista" && tituloDe(w.parrafos, p.indice)?.texto === jorge.texto)).toHaveLength(0);
    // Carmen sin horario: el documento lo dice con esas palabras y así se conserva.
    expect(w.texto).toContain("Horario: (no indicado)");
  });
  it("el Título de Word no rebaja la fidelidad: mammoth no avisa de nada y la lectura es alta", async () => {
    const w = await leerWord(LUCERO("funciones-del-personal.docx"));
    expect(w.avisos).toEqual([]);
    expect(w.fidelidad).toBe("alta");
    expect(w.parrafos[0]).toMatchObject({ indice: 1, estilo: "titulo", texto: "MODAS LUCERO S.A.C. — Funciones del personal" });
  });
  it("el procedimiento de Vargas: seis viñetas y la frase que delata que no hay tablero compartido", async () => {
    const w = await leerWord(VARGAS("procedimiento-seguimiento.docx"));
    expect(w.parrafos.filter((p) => p.estilo === "lista")).toHaveLength(6);
    expect(w.texto).toContain("No hay tablero compartido");
    expect(w.texto).toContain("Última revisión: no consta.");
  });
  it("del HTML de mammoth salen párrafos en orden; una fila de tabla es un párrafo con sus celdas", () => {
    const p = parrafosDeHtml("<h1>T&amp;T</h1><ul><li>uno</li><li>dos</li></ul><table><tr><td><p>a</p></td><td><p>b</p></td></tr></table><p></p><p>fin</p>");
    expect(p.map((x) => [x.indice, x.estilo, x.texto])).toEqual([[1, "titulo", "T&T"], [2, "lista", "uno"], [3, "lista", "dos"], [4, "parrafo", "a | b"], [5, "parrafo", "fin"]]);
    expect(decodificarEntidades("&lt;S/&gt; &#39;x&#39; &#x41;")).toBe("<S/> 'x' A");
  });
});

describe("Excel · ventas-e-inventario.xlsx: tres hojas, 120 artículos, 40 costos vacíos contados y nunca rellenados", () => {
  it("devuelve las tres hojas con sus encabezados", async () => {
    const x = await leerExcel(LUCERO("ventas-e-inventario.xlsx"));
    expect(x.hojas.map((h) => h.nombre)).toEqual(["Ventas", "Gastos", "Inventario"]);
    expect(x.hojas[2].encabezados).toEqual(["codigo", "descripcion", "categoria", "talla", "stock", "costo_unitario", "precio_venta"]);
    expect(x.hojas[2].filaEncabezados).toBe(1);
    expect(x.fidelidad).toBe("alta");
  });
  it("120 filas de inventario y 40 costos vacíos, contados por columna; la fila TOTAL se aparta como resumen y su cifra coincide con la suma", async () => {
    const x = await leerExcel(LUCERO("ventas-e-inventario.xlsx"));
    const inv = x.hojas[2];
    const col = (nombre: string) => inv.encabezados.indexOf(nombre);
    // Las 120 filas de datos son los 120 artículos: la fila «TOTAL A COSTO» ya no está entre ellas.
    expect(inv.filas).toHaveLength(120);
    expect(inv.filas.every((f) => String(f.celdas[col("codigo")].valor ?? "").startsWith("ML-"))).toBe(true);
    expect(inv.filas.filter((f) => f.celdas[col("costo_unitario")].valor === null)).toHaveLength(40);
    const vacias = inv.vacias.find((v) => v.columna === "costo_unitario")!;
    // Antes decía «40 vacías de 121»: contaba el total como un artículo más. Se cuenta sobre los datos.
    expect(vacias).toEqual({ columna: "costo_unitario", letra: "F", vacias: 40, de: 120 });
    expect(inv.resumen).toHaveLength(1);
    const total = inv.resumen[0];
    expect(total.numero).toBe(123); // tras la fila 122 vacía
    expect(String(total.celdas[0].valor)).toMatch(/^TOTAL A COSTO/);
    const suma = inv.filas.reduce((acc, f) => {
      const c = f.celdas[col("costo_unitario")].valor, s = f.celdas[col("stock")].valor;
      return typeof c === "number" && typeof s === "number" ? acc + c * s : acc;
    }, 0);
    expect(total.celdas[col("costo_unitario")].valor).toBe(suma);
    expect(suma).toBeGreaterThan(70000); // la contradicción deliberada con el «como 40,000» declarado
    // El aviso lo dice en palabras y no rebaja la fidelidad: no es fórmula ni error, es una fila de total.
    expect(inv.avisos.some((a) => /Fila 123 tomada como fila de resumen/.test(a))).toBe(true);
    expect(x.fidelidad).toBe("alta");
    expect(resumenFilasDeResumen(inv)).toMatch(/^1 fila de resumen apartada \(fila 123: TOTAL A COSTO.*F=\d+\)$/);
  });
  it("los gastos sin anotar quedan vacíos, con su cuenta: planilla y luz 2 de 6, transporte 3 de 6", async () => {
    const x = await leerExcel(LUCERO("ventas-e-inventario.xlsx"));
    const g = x.hojas[1];
    const cuenta = Object.fromEntries(g.vacias.map((v) => [v.columna, v.vacias]));
    expect(cuenta).toMatchObject({ planilla: 2, luz_agua_internet: 2, transporte: 3, otros: 1, alquiler: 0 });
    expect(resumenVacias(g)).toContain("transporte (F): 3 vacías de 6");
  });
  it("excelComoTexto cita hoja y celda (Inventario!F3) y marca (vacío) sin inventar un número", async () => {
    const x = await leerExcel(LUCERO("ventas-e-inventario.xlsx"));
    const t = excelComoTexto(x.hojas);
    expect(t.filas).toBe(6 + 6 + 120);
    const inv = t.tramos.find((tr) => tr.hoja === "Inventario")!;
    expect(inv.texto).toContain("Hoja «Inventario» · 120 fila(s) con datos (encabezados en la fila 1)");
    expect(inv.texto).toContain("Columnas: A codigo | B descripcion | C categoria | D talla | E stock | F costo_unitario | G precio_venta");
    expect(inv.texto).toContain("costo_unitario (F): 40 vacías de 120");
    expect(inv.texto).toMatch(/F3 costo_unitario=\d+/);
    // ML-003 (fila 4) es el primer artículo sin costo: la celda se marca, no se rellena.
    expect(inv.texto).toContain("F4 costo_unitario=(vacío)");
    expect(inv.texto).toContain("Inventario!A2");
    expect(inv.texto).not.toMatch(/F4 costo_unitario=0\b/);
    // La fila TOTAL va rotulada como resumen, con su celda, y NO como «fila 123:» entre los datos.
    expect(inv.texto).toMatch(/Filas de total o resumen escritas en la hoja \(NO son datos.*fila 123: A123 codigo=TOTAL A COSTO.*F123 costo_unitario=\d+/);
    expect(inv.texto).not.toMatch(/^fila 123:/m);
  });
  it("una hoja larga se parte en tramos que repiten el encabezado, el conteo de vacías y las filas de resumen", async () => {
    const x = await leerExcel(LUCERO("ventas-e-inventario.xlsx"));
    const t = excelComoTexto([x.hojas[2]], 50);
    expect(t.tramos).toHaveLength(3);
    for (const tr of t.tramos) {
      expect(tr.texto).toContain("costo_unitario (F): 40 vacías de 120");
      expect(tr.texto).toContain("Filas de total o resumen escritas en la hoja");
      expect(tr.texto).toMatch(/tramo [123] de 3/);
    }
    // 120 filas de datos (2 a 121): la fila 123 ya no cierra el último tramo.
    expect(t.tramos.map((tr) => [tr.desde, tr.hasta])).toEqual([[2, 51], [52, 101], [102, 121]]);
  });
});

describe("Excel · una fila de total no es un dato: se aparta como resumen y se conserva (remate R10.1)", () => {
  const fila = (numero: number, valores: (string | number | null)[]): FilaExcel => ({ numero, celdas: valores.map((v, i) => ({ ref: `${letraColumna(i + 1)}${numero}`, valor: v })) });
  it("esFilaDeResumen: empieza por TOTAL/SUBTOTAL/TOTALES (en cualquier columna con valor); tras una fila vacía con una sola cifra; lo demás es dato", () => {
    expect(esFilaDeResumen(fila(123, ["TOTAL A COSTO (solo los que tienen costo)", null, null, null, null, 79782, null]), true)).toMatch(/empieza por «TOTAL A COSTO/);
    expect(esFilaDeResumen(fila(9, ["Subtotal", 120]), false)).toMatch(/empieza por «Subtotal»/);
    expect(esFilaDeResumen(fila(9, [null, "Totales", 120, 300]), false)).toMatch(/Totales/);
    expect(esFilaDeResumen(fila(9, ["totalmente nuevo", 1, 2]), false)).toBeNull(); // «total» como palabra entera, no como prefijo de otra
    // Tras una fila vacía, una sola cifra (con o sin rótulo) es un total suelto al pie.
    expect(esFilaDeResumen(fila(30, [null, null, 5400]), true)).toMatch(/una sola cifra, en C30/);
    expect(esFilaDeResumen(fila(30, ["Saldo", null, 5400]), true)).toMatch(/una sola cifra/);
    // La misma fila sin hueco antes es un dato más: no se adivina.
    expect(esFilaDeResumen(fila(30, [null, null, 5400]), false)).toBeNull();
    // Tras un hueco, pero con dos cifras: es una fila de datos que viene después de un separador.
    expect(esFilaDeResumen(fila(30, ["ML-121", "Polo", 12, 49]), true)).toBeNull();
    // Un artículo que se llama «Total Wash» en la columna B no es un total: la primera celda con valor es el código.
    expect(esFilaDeResumen(fila(5, ["ML-005", "Total Wash detergente", 12, 49]), false)).toBeNull();
  });
  it("en un libro construido aquí: el total apartado no cuenta en «vacías de», sigue en resumen, y una fila de datos tras un separador no se toca", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Gastos");
    ws.addRow(["mes", "alquiler", "transporte"]);
    ws.addRow(["2026-04", 6500, 350]);
    ws.addRow(["2026-05", 6500, null]);
    ws.addRow(["2026-06", 6500, 380]);
    ws.addRow([]); // separador
    ws.addRow(["2026-07", 6500, 410]); // dato tras separador: dos cifras → sigue siendo dato
    ws.addRow([]);
    ws.addRow([null, null, 1140]); // total suelto: una sola cifra tras fila vacía
    ws.addRow(["TOTAL", 26000, null]); // total con rótulo
    const x = await leerExcel(Buffer.from(await wb.xlsx.writeBuffer()));
    const h = x.hojas[0];
    expect(h.filas.map((f) => f.numero)).toEqual([2, 3, 4, 6]);
    expect(h.resumen.map((f) => f.numero)).toEqual([8, 9]);
    expect(h.vacias.find((v) => v.columna === "transporte")).toMatchObject({ vacias: 1, de: 4 });
    expect(x.fidelidad).toBe("alta");
    expect(resumenFilasDeResumen(h)).toBe("2 filas de resumen apartadas (fila 8: C=1140 | fila 9: TOTAL · B=26000)");
    // Los avisos resumidos las nombran por fila, aparte de fórmulas y errores.
    expect(resumirAvisosExcel(x.avisos)).toContain("Gastos: 2 fila(s) de total o resumen apartadas (fila 8, 9), no cuentan como datos");
    // Y el texto para el extractor las rotula como lo que son, sin colarlas entre los datos.
    const t = excelComoTexto(x.hojas);
    expect(t.filas).toBe(4);
    expect(t.tramos[0].texto).toContain("Hoja «Gastos» · 4 fila(s) con datos");
    expect(t.tramos[0].texto).toContain("fila 9: A9 mes=TOTAL | B9 alquiler=26000");
    expect(t.tramos[0].texto).not.toMatch(/^fila 9:/m);
  });
  it("con el contexto de la hoja, «una sola cifra tras una vacía» solo aparta lo que es más ralo que un dato; con rótulo, solo al pie", () => {
    // Hoja de 7 columnas donde una fila normal trae 6 celdas: una cifra suelta es un total, esté donde esté.
    expect(esFilaDeResumen(fila(30, [null, null, 5400]), true, { tipico: 6, alPie: false })).toMatch(/una sola cifra, en C30/);
    // Rótulo y cifra: al pie es un total; con datos debajo es un dato tras un separador.
    expect(esFilaDeResumen(fila(30, ["Saldo", null, 5400]), true, { tipico: 6, alPie: true })).toMatch(/una sola cifra/);
    expect(esFilaDeResumen(fila(30, ["Saldo", null, 5400]), true, { tipico: 6, alPie: false })).toBeNull();
    // En una lista «concepto | monto» TODAS las filas traen una sola cifra: tener la forma de un dato no es ser un total.
    expect(esFilaDeResumen(fila(30, ["Publicidad", 500]), true, { tipico: 2, alPie: true })).toBeNull();
    expect(esFilaDeResumen(fila(30, [null, 9800]), true, { tipico: 2, alPie: true })).toMatch(/una sola cifra, en B30$/);
    // Con la misma forma que un dato, lo único que la delata es que su cifra sea la suma de la columna, y solo al pie.
    expect(esFilaDeResumen(fila(30, ["Saldo", 9800]), true, { tipico: 2, alPie: true, cuadraConLaSuma: true })).toMatch(/en B30, que es la suma de su columna$/);
    expect(esFilaDeResumen(fila(30, ["Saldo", 9800]), true, { tipico: 2, alPie: false, cuadraConLaSuma: true })).toBeNull();
    expect(esFilaDeResumen(fila(30, ["Saldo", 9800]), false, { tipico: 2, alPie: true, cuadraConLaSuma: true })).toBeNull(); // sin la fila vacía antes, es un dato más
    // Una sola columna de cifras: cada fila es una cifra suelta y ninguna es un total por eso… salvo la que suma a las demás.
    expect(esFilaDeResumen(fila(30, [120]), true, { tipico: 1, alPie: true })).toBeNull();
    expect(esFilaDeResumen(fila(30, [120]), true, { tipico: 1, alPie: true, cuadraConLaSuma: true })).toMatch(/suma de su columna/);
    // Código, descripción y precio (dos rótulos): es un artículo, con o sin contexto.
    expect(esFilaDeResumen(fila(30, ["ML-050", "Polo básico", null, null, 49]), true)).toBeNull();
    expect(esFilaDeResumen(fila(30, ["ML-050", "Polo básico", null, null, 49]), true, { tipico: 6, alPie: true })).toBeNull();
    // «TOTAL» manda siempre, con cualquier contexto.
    expect(esFilaDeResumen(fila(30, ["TOTAL", 500]), false, { tipico: 2, alPie: false })).toMatch(/empieza por «TOTAL»/);
  });
  it("una lista de precios con filas en blanco entre grupos no pierde artículos: la primera fila de cada grupo es un dato, no un total", async () => {
    const wb = new ExcelJS.Workbook();
    const precios = wb.addWorksheet("Precios");
    precios.addRow(["codigo", "descripcion", "precio"]);
    precios.addRow(["POL-1", "Polo básico", 49]);
    precios.addRow(["POL-2", "Polo estampado", 59]);
    precios.addRow([]); // separador entre grupos
    precios.addRow(["JEA-1", "Jean clásico", 129]); // tras una vacía, con una sola cifra… y es un artículo
    precios.addRow(["JEA-2", "Jean slim", 139]);
    precios.addRow([]);
    precios.addRow(["CAS-1", "Casaca", 199]); // último grupo, de una sola fila, al pie de la hoja
    const gastos = wb.addWorksheet("Gastos");
    gastos.addRow(["concepto", "monto"]);
    gastos.addRow(["Alquiler", 6500]);
    gastos.addRow(["Luz", 300]);
    gastos.addRow([]);
    gastos.addRow(["Publicidad", 500]); // tras una vacía, rótulo y cifra: igual que todas las demás → dato
    gastos.addRow(["Transporte", 200]);
    gastos.addRow([]);
    gastos.addRow([null, 7500]); // cifra suelta al pie, más rala que un dato → total
    const x = await leerExcel(Buffer.from(await wb.xlsx.writeBuffer()));
    const [p, g] = x.hojas;
    expect(p.filas.map((f) => f.numero)).toEqual([2, 3, 5, 6, 8]);
    expect(p.resumen).toEqual([]);
    expect(p.avisos).toEqual([]);
    expect(p.vacias.find((v) => v.columna === "precio")).toMatchObject({ vacias: 0, de: 5 });
    expect(g.filas.map((f) => f.numero)).toEqual([2, 3, 5, 6]);
    expect(g.resumen.map((f) => f.numero)).toEqual([8]);
    expect(resumenFilasDeResumen(g)).toBe("1 fila de resumen apartada (fila 8: B=7500)");
    // Lo apartado siempre se dice: quien revisa ve qué fila no se contó y por qué.
    expect(g.avisos).toEqual(["Fila 8 tomada como fila de resumen (viene tras una fila vacía con una sola cifra, en B8): no cuenta como dato."]);
  });
  it("un rótulo y una cifra tras una vacía: al pie de una hoja ancha es un total; con datos debajo es un dato; con la forma de las demás filas, solo si su cifra es la suma", async () => {
    const wb = new ExcelJS.Workbook();
    const ancha = wb.addWorksheet("Ventas");
    ancha.addRow(["mes", "tienda", "web", "total_mes"]);
    ancha.addRow(["2026-04", 50000, 24200, 74200]);
    ancha.addRow(["2026-05", 52000, 25000, 77000]);
    ancha.addRow([]);
    ancha.addRow(["Feria de mayo", null, null, 3100]); // rótulo y cifra, pero hay datos debajo → dato
    ancha.addRow(["2026-06", 51000, 26000, 77000]);
    ancha.addRow([]);
    ancha.addRow(["Acumulado del trimestre", null, null, 231300]); // rótulo y cifra al pie, más rala → total
    const corta = wb.addWorksheet("Caja");
    corta.addRow(["concepto", "monto"]);
    corta.addRow(["Efectivo", 1200]);
    corta.addRow(["Banco", 8600]);
    corta.addRow([]);
    corta.addRow(["Saldo", 9800]); // misma forma que un dato y sin la palabra TOTAL ni SUMA: la delata que 9.800 = 1.200 + 8.600
    const gastos = wb.addWorksheet("Gastos");
    gastos.addRow(["concepto", "monto"]);
    gastos.addRow(["Alquiler", 6500]);
    gastos.addRow(["Luz", 300]);
    gastos.addRow([]);
    gastos.addRow(["Otros", 300]); // misma forma, al pie, y NO es la suma de lo de arriba: es un gasto más
    const x = await leerExcel(Buffer.from(await wb.xlsx.writeBuffer()));
    const [a, c, g] = x.hojas;
    expect(a.filas.map((f) => f.numero)).toEqual([2, 3, 5, 6]);
    expect(a.resumen.map((f) => f.numero)).toEqual([8]);
    expect(c.filas.map((f) => f.numero)).toEqual([2, 3]);
    expect(c.resumen.map((f) => f.numero)).toEqual([5]);
    expect(c.avisos).toEqual(["Fila 5 tomada como fila de resumen (viene tras una fila vacía con una sola cifra, en B5, que es la suma de su columna): no cuenta como dato."]);
    expect(g.filas.map((f) => f.numero)).toEqual([2, 3, 5]);
    expect(g.resumen).toEqual([]);
    // Apartar una fila de resumen no rebaja la fidelidad: no es una fórmula rota ni un error, es un total.
    expect(x.fidelidad).toBe("alta");
  });
  it("«Total <algo>» también es el nombre de un artículo: el rótulo solo basta cuando no deja duda; si no, hace falta que la fila sea rala o que una cifra sume", () => {
    const ancha = { tipico: 5, alPie: false };
    const lista = { tipico: 2, alPie: true };
    // Un artículo completo que se llama «Total Clean 1L»: tiene la forma de las demás filas y no suma nada → dato.
    expect(esFilaDeResumen(fila(7, ["Total Clean 1L", "Pisos", 18, 6.4, 9.5]), false, ancha)).toBeNull();
    expect(esFilaDeResumen(fila(7, ["Total Clean 4L", "Pisos", 6, null, 32]), false, ancha)).toBeNull(); // le falta el costo, pero sigue siendo un artículo
    expect(esFilaDeResumen(fila(7, ["Total 90 crema", 26.9]), false, lista)).toBeNull();
    // Con algo debajo sigue siendo un artículo, venga o no tras una fila vacía: no suma y tiene la forma de las demás.
    expect(esFilaDeResumen(fila(7, ["Total 90 crema", 26.9]), true, { tipico: 2, alPie: false })).toBeNull();
    // Al pie y tras una fila vacía ya no: ahí «Total <algo>» es un total aunque tenga la forma de un dato (segundo cierre Z4).
    expect(esFilaDeResumen(fila(7, ["Total 90 crema", 26.9]), true, lista)).toBe("empieza por «Total 90 crema», al pie de la hoja y tras una fila vacía");
    // La misma forma, pero una de sus cifras es la suma de la columna: es un total.
    expect(esFilaDeResumen(fila(7, ["Total caja", 9800]), false, { ...lista, algunaCifraSuma: true })).toMatch(/empieza por «Total caja»/);
    expect(esFilaDeResumen(fila(7, ["Total ventas y devoluciones", 74200, 1300]), false, { tipico: 3, alPie: false, algunaCifraSuma: true })).toMatch(/empieza por «Total ventas y devoluciones»/);
    // Un rótulo con una sola cifra, más rala que un dato: es la forma de «TOTAL A COSTO … 79.782», aunque esa cifra no sea la suma de ninguna columna.
    expect(esFilaDeResumen(fila(123, ["TOTAL A COSTO (solo los que tienen costo)", null, null, null, null, 79782, null]), true, { tipico: 6, alPie: true })).toMatch(/empieza por «TOTAL A COSTO/);
    expect(esFilaDeResumen(fila(9, ["Total inventario", null, null, 5400, null]), false, ancha)).toMatch(/empieza por «Total inventario»/);
    // Rótulos que no dejan duda: bastan solos, con cualquier forma y sin fila vacía antes. «Gran total» entra aquí.
    for (const rotulo of ["Gran total", "GRAN TOTAL S/", "Total", "TOTAL:", "Totales", "Subtotal ropa", "Subtotales", "Total general", "Total de ventas", "Total del mes"]) {
      expect(esFilaDeResumen(fila(9, [rotulo, 42]), false, { tipico: 2, alPie: false }), rotulo).toMatch(/^empieza por «/);
      expect(esFilaDeResumen(fila(9, [rotulo, "Pisos", 18, 6.4, 9.5]), false, ancha), rotulo).toMatch(/^empieza por «/);
    }
    // Y lo que no empieza por la palabra entera no es un rótulo de total.
    for (const texto of ["Totalmente nuevo", "Grande total", "Detalle del total"]) expect(esFilaDeResumen(fila(9, [texto, 42]), false, lista), texto).toBeNull();
    // Sin contexto la fila se juzga sola y el rótulo basta, como siempre.
    expect(esFilaDeResumen(fila(7, ["Total Clean 1L", "Pisos", 18, 6.4, 9.5]), false)).toMatch(/empieza por «Total Clean 1L»/);
  });
  it("en un libro: los artículos «Total Clean» se cuentan y se avisan; «Gran total» pegado a los datos se aparta; un subtotal suma su grupo; un total que no cuadra se aparta al pie y queda a la vista con algo debajo", async () => {
    const wb = new ExcelJS.Workbook();
    const lim = wb.addWorksheet("Limpieza");
    lim.addRow(["producto", "categoria", "stock", "costo", "precio"]);
    lim.addRow(["Sapolio lavavajilla 1L", "Cocina", 24, 5.2, 7.9]);
    lim.addRow(["Total Clean 1L", "Pisos", 18, 6.4, 9.5]); // artículo completo
    lim.addRow(["Poett lavanda 900ml", "Pisos", 30, 4.8, 7.5]);
    lim.addRow(["Total Clean 4L", "Pisos", 6, null, 32]); // artículo sin costo
    lim.addRow(["Gran total", null, 78, null, null]); // pegado a los datos, sin fila vacía antes
    const grupos = wb.addWorksheet("Grupos");
    grupos.addRow(["concepto", "monto"]);
    grupos.addRow(["Polos", 10]);
    grupos.addRow(["Jeans", 20]);
    grupos.addRow(["Subtotal ropa", 30]);
    grupos.addRow(["Zapatos", 5]);
    grupos.addRow(["Sandalias", 7]);
    grupos.addRow(["Total calzado", 12]); // misma forma que un dato; la delata que 12 = 5 + 7 (su grupo)
    grupos.addRow(["Gran total", 42]);
    const caja = wb.addWorksheet("Caja");
    caja.addRow(["concepto", "monto"]);
    caja.addRow(["Efectivo", 1200]);
    caja.addRow(["Banco", 8600]);
    caja.addRow(["Total caja", 9500]); // misma forma y NO suma (1.200 + 8.600 = 9.800), pero es la última fila de la hoja: es el total que escribió la empresa
    const bancos = wb.addWorksheet("Bancos");
    bancos.addRow(["concepto", "monto"]);
    bancos.addRow(["Efectivo", 1200]);
    bancos.addRow(["Banco", 8600]);
    bancos.addRow(["Total caja", 9500]); // la misma fila con algo debajo: no se adivina, se cuenta y se avisa
    bancos.addRow(["Por cobrar", 400]);
    const x = await leerExcel(Buffer.from(await wb.xlsx.writeBuffer()));
    const [l, g, c, b] = x.hojas;

    // Los dos «Total Clean» son artículos: están entre los datos y cuentan en «vacías de».
    expect(l.filas.map((f) => f.numero)).toEqual([2, 3, 4, 5]);
    expect(l.resumen.map((f) => f.numero)).toEqual([6]);
    expect(l.vacias.find((v) => v.columna === "costo")).toMatchObject({ vacias: 1, de: 4 });
    expect(l.avisos).toEqual([
      "Fila 3 empieza por «Total Clean 1L» pero tiene la forma de un dato y ninguna de sus cifras suma su columna: se contó como dato.",
      "Fila 5 empieza por «Total Clean 4L» pero tiene la forma de un dato y ninguna de sus cifras suma su columna: se contó como dato.",
      "Fila 6 tomada como fila de resumen (empieza por «Gran total»): no cuenta como dato.",
    ]);
    // El subtotal y el total de grupo se apartan; lo que queda son los cuatro conceptos, y el gran total los suma.
    expect(g.filas.map((f) => f.numero)).toEqual([2, 3, 5, 6]);
    expect(g.resumen.map((f) => f.numero)).toEqual([4, 7, 8]);
    expect(g.filas.reduce((acc, f) => acc + (f.celdas[1].valor as number), 0)).toBe(42);
    // El total que no cuadra, como última fila de la hoja, es un total: se aparta (contarlo como dato sumaría 19.300) y
    // se conserva en `resumen` con sus 9.500, que es justo lo que se contrasta con los 9.800 que suman las filas.
    expect(c.filas.map((f) => f.numero)).toEqual([2, 3]);
    expect(c.resumen.map((f) => f.numero)).toEqual([4]);
    expect(c.avisos).toEqual(["Fila 4 tomada como fila de resumen (empieza por «Total caja» y es la última fila de la hoja): no cuenta como dato."]);
    expect(resumenFilasDeResumen(c)).toBe("1 fila de resumen apartada (fila 4: Total caja · B=9500)");
    // Con algo debajo no se esconde ni se da por bueno: queda como fila, con su aviso.
    expect(b.filas.map((f) => f.numero)).toEqual([2, 3, 4, 5]);
    expect(b.resumen).toEqual([]);
    expect(b.avisos).toEqual(["Fila 4 empieza por «Total caja» pero tiene la forma de un dato y ninguna de sus cifras suma su columna: se contó como dato."]);
    // Nada de esto es una fórmula rota ni un error de celda: la fidelidad sigue alta.
    expect(x.fidelidad).toBe("alta");

    // Quien revisa lo lee en castellano, por hoja; y el extractor también lo sabe.
    expect(resumenFilasConRotuloDeTotal(l)).toBe("2 filas que empiezan por «Total» contadas como dato (fila 3: Total Clean 1L | fila 5: Total Clean 4L)");
    expect(resumenFilasConRotuloDeTotal(c)).toBe("");
    expect(resumenFilasConRotuloDeTotal(b)).toBe("1 fila que empieza por «Total» contada como dato (fila 4: Total caja)");
    expect(resumenFilasConRotuloDeTotal(g)).toBe("");
    expect(resumirAvisosExcel(x.avisos)).toContain("Limpieza: 1 fila(s) de total o resumen apartadas (fila 6), no cuentan como datos; 2 fila(s) que empiezan por «Total» contadas como dato porque tienen la forma de un dato (fila 3, 5)");
    const texto = excelComoTexto(x.hojas).tramos;
    expect(texto[0].texto).toContain("Filas que empiezan por «Total» pero se leyeron como dato porque tienen la forma de un dato: fila 3, 5.");
    expect(texto[0].texto).toMatch(/^fila 3: A3 producto=Total Clean 1L/m);
    expect(texto[1].texto).not.toContain("Filas que empiezan por «Total» pero se leyeron como dato");
    const lectura = await detectarYLeer(MIME_EXCEL, Buffer.from(await wb.xlsx.writeBuffer()));
    expect(lectura.fidelidad).toBe("alta");
    expect(lectura.nota).toContain("Limpieza: 4 filas");
    expect(lectura.nota).toContain("2 filas que empiezan por «Total» contadas como dato (fila 3: Total Clean 1L | fila 5: Total Clean 4L)");
    expect(lectura.nota).toContain("Caja: 2 filas, vacías → ninguna celda vacía, 1 fila de resumen apartada (fila 4: Total caja · B=9500)");
    expect(lectura.nota).toContain("Bancos: 4 filas");
    expect(lectura.nota).toContain("1 fila que empieza por «Total» contada como dato (fila 4: Total caja)");
    expect(lectura.nota).not.toMatch(PATRON_MENSAJE_CRUDO);
  });
  it("el rótulo de un total puede decir «error» o «fórmula» sin que la lectura tenga ninguno: la fidelidad no baja por una palabra", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Caja");
    ws.addRow(["dia", "ventas", "faltante"]);
    ws.addRow(["lunes", 1200, 10]);
    ws.addRow(["martes", 1350, 0]);
    ws.addRow(["Total con error de caja (fórmula de Rosa)", 2550, 10]);
    const x = await leerExcel(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(x.hojas[0].resumen.map((f) => f.numero)).toEqual([4]);
    expect(x.hojas[0].filas).toHaveLength(2);
    expect(x.avisos).toEqual(["Caja: Fila 4 tomada como fila de resumen (empieza por «Total con error de caja (fórmula de Rosa)»): no cuenta como dato."]);
    expect(x.fidelidad).toBe("alta");
    // Un cero escrito es un dato; no se confunde con una celda vacía.
    expect(x.hojas[0].vacias.find((v) => v.columna === "faltante")).toMatchObject({ vacias: 0, de: 2 });
  });

  // ── Cierre Z4 (13-10-2026): dos huecos que dejó la regla anterior ──
  it("cierre Z4 · «TOTAL A COSTO» es un total aunque lleve una moneda, «120 artículos» o dos cifras; y «Suma» es rótulo de total", () => {
    const ancha = { tipico: 6, alPie: true };
    // Las tres formas que antes se contaban como un artículo más (otra celda de texto, o una segunda cifra).
    expect(esFilaDeResumen(fila(123, ["TOTAL A COSTO", "PEN", null, null, null, 79782, null]), true, ancha)).toBe("empieza por «TOTAL A COSTO»");
    expect(esFilaDeResumen(fila(123, ["TOTAL A COSTO", "120 artículos", null, null, null, 79782, null]), true, ancha)).toBe("empieza por «TOTAL A COSTO»");
    expect(esFilaDeResumen(fila(123, ["TOTAL A COSTO", null, null, null, 1840, 79782, null]), true, ancha)).toBe("empieza por «TOTAL A COSTO»");
    // El rótulo basta: pegada a los datos, con datos debajo, y hasta con la forma entera de un dato.
    expect(esFilaDeResumen(fila(9, ["TOTAL A COSTO", "PEN", 79782]), false, { tipico: 3, alPie: false })).toBe("empieza por «TOTAL A COSTO»");
    for (const rotulo of ["Total a pagar", "Total en soles", "Total por cobrar", "TOTAL S/", "Total (S/)", "Total PEN", "Suma", "SUMA:", "Suma total", "Suma de ventas", "Sumas", "Sumatoria del mes", "SUBTOTAL POLOS", "Subtotal", "TOTALES", "Gran total"]) {
      expect(esFilaDeResumen(fila(9, [rotulo, "PEN", 18, 6.4, 9.5]), false, { tipico: 5, alPie: false }), rotulo).toMatch(/^empieza por «/);
    }
    // «Suma» a secas ya no es un rótulo cualquiera: se aparta esté donde esté, con o sin fila vacía antes.
    expect(esFilaDeResumen(fila(30, ["Suma", null, 5400]), false, { tipico: 6, alPie: false })).toBe("empieza por «Suma»");
    expect(esFilaDeResumen(fila(30, ["Suma", 9800]), false, { tipico: 2, alPie: false })).toBe("empieza por «Suma»");
    // «Total <algo>» y «Suma <algo>» siguen pudiendo ser un artículo: con la forma de un dato y sin sumar, se cuentan.
    expect(esFilaDeResumen(fila(7, ["Suma Bac D10", "Cocina", 12, 30, 45]), false, { tipico: 5, alPie: false })).toBeNull();
    expect(esFilaDeResumen(fila(7, ["Total Clean 4L", "Pisos", 6, null, 32]), false, { tipico: 5, alPie: true })).toBeNull();
    // …salvo que los datos de la hoja lleven código y esa fila no lo traiga: no ocupa el sitio de un artículo.
    expect(esFilaDeResumen(fila(40, ["Total inventario", "PEN", null, 120, 79782]), false, { tipico: 5, alPie: false, codigo: "no" })).toBe("empieza por «Total inventario» y no trae código donde los datos lo llevan");
    // …o que esté al pie, tras una fila vacía, y sea más rala que un dato.
    expect(esFilaDeResumen(fila(40, ["Total inventario", "PEN", null, null, 79782]), true, { tipico: 5, alPie: true })).toBe("empieza por «Total inventario», al pie de la hoja y tras una fila vacía");
    expect(esFilaDeResumen(fila(40, ["Total inventario", "PEN", null, null, 79782]), true, { tipico: 5, alPie: false })).toBeNull(); // con datos debajo, la duda sigue (y se avisa)
    expect(esFilaDeResumen(fila(40, ["Total inventario", "PEN", null, null, 79782]), false, { tipico: 5, alPie: true })).toBeNull(); // pegada a los datos, también
    // Lo que no empieza por la palabra entera no es un rótulo de total.
    for (const texto of ["Sumar pedidos", "Sumamos", "Suministros"]) expect(esFilaDeResumen(fila(9, [texto, 42]), false, { tipico: 2, alPie: true }), texto).toBeNull();
  });
  it("cierre Z4 · una fila rala tras una vacía NO es un total si trae su código: es un artículo al que le faltan celdas", () => {
    // Antes: al pie, tras una fila en blanco, con un rótulo y una cifra → se apartaba como resumen. El rótulo era su código.
    const articulo = fila(30, ["ML-121", null, null, null, null, null, 49]);
    expect(esFilaDeResumen(articulo, true, { tipico: 6, alPie: true })).toMatch(/una sola cifra/); // sin saber que la hoja lleva códigos, la forma engaña
    expect(esFilaDeResumen(articulo, true, { tipico: 6, alPie: true, codigo: "si" })).toBeNull();
    // Un periodo también identifica la fila: un mes con un solo gasto anotado es un dato.
    expect(esFilaDeResumen(fila(8, ["2026-07", null, 410]), true, { tipico: 3, alPie: true, codigo: "si" })).toBeNull();
    // Pero el código no le gana a la suma (segundo cierre Z4): al pie, tras una fila vacía y con su cifra sumando la
    // columna, es el total, y el motivo dice las dos cosas. Antes esto se fijó al revés y el total contaba como un dato más.
    expect(esFilaDeResumen(fila(5, ["G-3", 300]), true, { tipico: 2, alPie: true, cuadraConLaSuma: true, codigo: "si" })).toBe("trae código, pero viene tras una fila vacía, al pie de la hoja, y su única cifra, en B5, es la suma de su columna");
    expect(esFilaDeResumen(fila(5, ["T1-2026", 600]), true, { tipico: 2, alPie: true, cuadraConLaSuma: true, codigo: "si", indiceCodigo: 0 })).toBe("trae código («T1-2026»), pero viene tras una fila vacía, al pie de la hoja, y su única cifra, en B5, es la suma de su columna");
    // Con código y sin sumar, o sumando pero con datos debajo o sin fila vacía antes, sigue siendo un dato.
    expect(esFilaDeResumen(fila(5, ["G-3", 300]), true, { tipico: 2, alPie: true, cuadraConLaSuma: false, codigo: "si" })).toBeNull();
    expect(esFilaDeResumen(fila(5, ["G-3", 300]), true, { tipico: 2, alPie: false, cuadraConLaSuma: true, codigo: "si" })).toBeNull();
    expect(esFilaDeResumen(fila(5, ["G-3", 300]), false, { tipico: 2, alPie: true, cuadraConLaSuma: true, codigo: "si" })).toBeNull();
    // La cifra suelta SIN código, en una hoja que los lleva, sigue siendo un total.
    expect(esFilaDeResumen(fila(31, [null, null, null, null, null, null, 5400]), true, { tipico: 6, alPie: true, codigo: "no" })).toMatch(/una sola cifra, en G31/);
  });
  it("cierre Z4 · columnaDeCodigo: la columna que los datos usan como código, por lo que traen las filas o por su encabezado si son números", () => {
    const cuerpo = (filas: (string | number | null)[][]) => filas.map((v, i) => fila(i + 2, v));
    expect(columnaDeCodigo(["codigo", "descripcion", "precio"], cuerpo([["ML-001", "Polo", 49], ["ML-002", "Jean", 129], ["ML-003", "Casaca", 199]]))).toEqual({ indice: 0, admiteNumero: true });
    // Un periodo identifica la fila igual que un código.
    expect(columnaDeCodigo(["mes", "ventas"], cuerpo([["2026-04", 100], ["2026-05", 120], ["2026-06", 90]]))).toEqual({ indice: 0, admiteNumero: false });
    // El código no tiene por qué ir en la primera columna.
    expect(columnaDeCodigo(["descripcion", "sku", "precio"], cuerpo([["Polo básico", "P-1", 49], ["Jean slim", "J-7", 129], ["Casaca", "C-3", 199]]))).toEqual({ indice: 1, admiteNumero: true });
    // Nombres con espacios o sin cifras no son códigos: una lista «concepto | monto» o un inventario por nombres no tienen columna de código.
    expect(columnaDeCodigo(["concepto", "monto"], cuerpo([["Alquiler", 6500], ["Luz", 300], ["Publicidad", 500]]))).toBeNull();
    expect(columnaDeCodigo(["producto", "precio"], cuerpo([["Sapolio lavavajilla 1L", 7.9], ["Poett lavanda 900ml", 7.5], ["Ayudín limón 1L", 9.5]]))).toBeNull();
    // Una columna de enteros solo es código si su encabezado lo dice: «N°» sí, «stock» no.
    expect(columnaDeCodigo(["N°", "descripcion", "precio"], cuerpo([[1, "Polo", 49], [2, "Jean", 129], [3, "Casaca", 199]]))).toEqual({ indice: 0, admiteNumero: true });
    expect(columnaDeCodigo(["stock", "descripcion", "precio"], cuerpo([[1, "Polo", 49], [2, "Jean", 129], [3, "Casaca", 199]]))).toBeNull();
    // Con dos filas no hay patrón; las filas de total no cuentan; y una fila sin código entre cinco no deshace la columna.
    expect(columnaDeCodigo(["codigo", "precio"], cuerpo([["ML-001", 49], ["ML-002", 129]]))).toBeNull();
    expect(columnaDeCodigo(["codigo", "precio"], cuerpo([["ML-001", 49], ["ML-002", 129], ["ML-003", 199], ["TOTAL", 377]]))).toEqual({ indice: 0, admiteNumero: true });
    expect(columnaDeCodigo(["codigo", "precio"], cuerpo([["ML-001", 49], ["ML-002", 129], ["ML-003", 199], ["ML-004", 59], [null, 436]]))).toEqual({ indice: 0, admiteNumero: true });
    expect(esCodigo("ML-001", false)).toBe(true);
    expect(esCodigo("2026-04", false)).toBe(true);
    expect(esCodigo("Polo básico", false)).toBe(false);
    expect(esCodigo("Alquiler", false)).toBe(false);
    expect(esCodigo(121, false)).toBe(false);
    expect(esCodigo(121, true)).toBe(true);
    expect(esCodigo(12.5, true)).toBe(false);
    expect(esCodigo(null, true)).toBe(false);
  });
  it("cierre Z4 · en un libro: el total con moneda o con dos cifras se aparta; el artículo ralo tras una fila en blanco se cuenta porque trae su código", async () => {
    const wb = new ExcelJS.Workbook();
    const inv = wb.addWorksheet("Inventario");
    inv.addRow(["codigo", "descripcion", "categoria", "stock", "costo_unitario", "precio_venta"]);
    inv.addRow(["ML-001", "Polo básico", "Polos", 40, 18, 49]);
    inv.addRow(["ML-002", "Polo estampado", "Polos", 25, 22, 59]);
    inv.addRow(["ML-003", "Jean clásico", "Jeans", 30, 55, 129]);
    inv.addRow(["ML-004", "Jean slim", "Jeans", 12, null, 139]);
    inv.addRow([]);
    inv.addRow(["ML-005", null, null, null, null, 199]); // fila 7: artículo de verdad al que le falta casi todo, tras una fila en blanco y sin más datos debajo
    inv.addRow([]);
    inv.addRow(["TOTAL A COSTO", "PEN", null, null, 2920, null]); // fila 9: lleva otra celda de texto; antes era «el artículo 6»
    const mensual = wb.addWorksheet("Mensual");
    mensual.addRow(["mes", "alquiler", "transporte"]);
    mensual.addRow(["2026-04", 6500, 350]);
    mensual.addRow(["2026-05", 6500, 380]);
    mensual.addRow(["2026-06", 6500, 410]);
    mensual.addRow([]);
    mensual.addRow(["2026-07", null, 400]); // fila 6: un mes con un solo gasto anotado, tras una fila en blanco
    mensual.addRow([]);
    mensual.addRow([null, null, 1540]); // fila 8: cifra suelta, sin periodo → total
    mensual.addRow(["Total gastos", "4 meses", 21040]); // fila 9: «Total <algo>» con otra celda de texto, la forma entera de un dato y sin sumar ninguna columna
    const limpieza = wb.addWorksheet("Limpieza");
    limpieza.addRow(["producto", "categoria", "stock", "costo", "precio"]);
    limpieza.addRow(["Sapolio lavavajilla 1L", "Cocina", 24, 5.2, 7.9]);
    limpieza.addRow(["Poett lavanda 900ml", "Pisos", 30, 4.8, 7.5]);
    limpieza.addRow(["Total Clean 4L", "Pisos", 6, null, 32]); // fila 4: un artículo que se llama así; sigue contándose
    limpieza.addRow([]);
    limpieza.addRow(["Total inventario", "PEN", null, 268.8, null]); // fila 6: sin códigos en la hoja, lo delata estar al pie, tras una vacía y ser más rala
    const numerada = wb.addWorksheet("Numerada");
    numerada.addRow(["N°", "descripcion", "precio"]);
    numerada.addRow([1, "Polo", 49]);
    numerada.addRow([2, "Jean", 129]);
    numerada.addRow([3, "Casaca", 199]);
    numerada.addRow([]);
    numerada.addRow([4, "Chompa", null]); // fila 6: artículo sin precio; su única cifra es su número
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    const x = await leerExcel(bytes);
    const [i, m, l, n] = x.hojas;

    // Inventario: cinco artículos (el ralo incluido) y un total apartado. Las vacías se cuentan sobre los cinco.
    expect(i.filas.map((f) => f.numero)).toEqual([2, 3, 4, 5, 7]);
    expect(i.resumen.map((f) => f.numero)).toEqual([9]);
    expect(i.avisos).toEqual(["Fila 9 tomada como fila de resumen (empieza por «TOTAL A COSTO»): no cuenta como dato."]);
    expect(i.vacias.find((v) => v.columna === "costo_unitario")).toMatchObject({ vacias: 2, de: 5 });
    expect(i.vacias.find((v) => v.columna === "descripcion")).toMatchObject({ vacias: 1, de: 5 });
    // Mensual: el mes ralo es un dato; la cifra suelta y el «Total gastos | 4 meses | …» son resumen.
    expect(m.filas.map((f) => f.numero)).toEqual([2, 3, 4, 6]);
    expect(m.resumen.map((f) => f.numero)).toEqual([8, 9]);
    expect(m.avisos).toEqual([
      "Fila 8 tomada como fila de resumen (viene tras una fila vacía con una sola cifra, en C8): no cuenta como dato.",
      "Fila 9 tomada como fila de resumen (empieza por «Total gastos» y no trae código donde los datos lo llevan): no cuenta como dato.",
    ]);
    expect(m.vacias.find((v) => v.columna === "alquiler")).toMatchObject({ vacias: 1, de: 4 });
    // Limpieza: el artículo «Total Clean 4L» se cuenta y se avisa; el total del pie se aparta.
    expect(l.filas.map((f) => f.numero)).toEqual([2, 3, 4]);
    expect(l.resumen.map((f) => f.numero)).toEqual([6]);
    expect(l.avisos).toEqual([
      "Fila 4 empieza por «Total Clean 4L» pero tiene la forma de un dato y ninguna de sus cifras suma su columna: se contó como dato.",
      "Fila 6 tomada como fila de resumen (empieza por «Total inventario», al pie de la hoja y tras una fila vacía): no cuenta como dato.",
    ]);
    // Numerada: el artículo sin precio sigue siendo un artículo, y su precio vacío se cuenta.
    expect(n.filas.map((f) => f.numero)).toEqual([2, 3, 4, 6]);
    expect(n.resumen).toEqual([]);
    expect(n.vacias.find((v) => v.columna === "precio")).toMatchObject({ vacias: 1, de: 4 });
    expect(x.fidelidad).toBe("alta");

    // Lo mismo llega al extractor y a la nota que lee el consultor.
    const texto = excelComoTexto(x.hojas).tramos;
    expect(texto[0].texto).toContain("Hoja «Inventario» · 5 fila(s) con datos");
    expect(texto[0].texto).toMatch(/^fila 7: A7 codigo=ML-005/m);
    expect(texto[0].texto).not.toMatch(/^fila 9:/m);
    expect(texto[0].texto).toContain("fila 9: A9 codigo=TOTAL A COSTO | B9 descripcion=PEN | E9 costo_unitario=2920");
    const lectura = await detectarYLeer(MIME_EXCEL, bytes);
    expect(lectura.nota).toContain("Inventario: 5 filas");
    expect(lectura.nota).toContain("1 fila de resumen apartada (fila 9: TOTAL A COSTO · PEN · E=2920)");
    expect(lectura.nota).toContain("Mensual: 4 filas");
    expect(lectura.nota).toContain("Numerada: 4 filas");
    expect(lectura.nota).not.toMatch(PATRON_MENSAJE_CRUDO);
  });

  // ── Segundo cierre Z4 (13-10-2026): lo que el primero dejó mal ──
  it("segundo cierre Z4 · el código no le gana a la suma: el total del trimestre o del año al pie de una hoja mensual se aparta y se dice; el mes ralo y el artículo numerado siguen siendo datos", async () => {
    const wb = new ExcelJS.Workbook();
    const hoja = (nombre: string, encabezados: string[], filas: (string | number | null)[][]) => {
      const ws = wb.addWorksheet(nombre);
      ws.addRow(encabezados);
      for (const f of filas) ws.addRow(f);
    };
    const meses: (string | number | null)[][] = [["2026-01", 100], ["2026-02", 200], ["2026-03", 300], []];
    hoja("Trimestre", ["mes", "ventas"], [...meses, ["T1-2026", 600]]); // antes: «un cuarto mes» de 600, sin aviso
    hoja("AnioTexto", ["mes", "ventas"], [...meses, ["2026", 600]]);
    hoja("AnioNumero", ["mes", "ventas"], [["2026-01", 100], ["2026-02", 200], ["2026-03", 300], ["2026-04", 400], [], [2026, 1000]]); // el año tecleado: Excel lo guarda como número
    hoja("AnioNumeroCorta", ["mes", "ventas"], [...meses, [2026, 600]]); // lo mismo bajo solo tres meses: límite conocido, se cuenta como dato
    const anchos: (string | number | null)[][] = [["2026-01", 100, 10], ["2026-02", 200, 20], ["2026-03", 300, 30], []];
    hoja("Ancha", ["mes", "tienda", "web"], [...anchos, ["T1-2026", 600, 60]]); // varias columnas: cuadran todas
    hoja("NoCuadra", ["mes", "tienda", "web"], [...anchos, ["2026-04", 600, 25]]); // una cuadra y la otra no: es abril
    hoja("OtroMes", ["mes", "ventas"], [...meses, ["2026-04", 250]]); // con código y sin sumar: un mes más
    hoja("Pegada", ["mes", "ventas"], [["2026-01", 100], ["2026-02", 200], ["2026-03", 300], ["2026-04", 600]]); // sin fila vacía antes no se adivina
    hoja("Numerada", ["N°", "descripcion", "precio"], [[1, "Polo", 49], [2, "Jean", 129], [3, "Casaca", 199], [], [6, "Chompa", null]]); // 6 = 1 + 2 + 3, pero es su número, no una cifra
    hoja("SinVentas", ["mes", "ventas"], [["2026-01", 0], ["2026-02", 0], ["2026-03", 0], [], ["2026-04", 0]]); // cero «suma» cero: abril sin ventas es un mes, no un total
    hoja("SinRotulo", ["concepto", "local", "web"], [["Alquiler", 6500, 350], ["Luz", 300, 20], [], [null, 6800, 370]]); // el total de las dos columnas, sin rótulo ni código
    const x = await leerExcel(Buffer.from(await wb.xlsx.writeBuffer()));
    const [trimestre, anioTexto, anioNumero, anioNumeroCorta, ancha, noCuadra, otroMes, pegada, numerada, sinVentas, sinRotulo] = x.hojas;

    for (const h of [trimestre, anioTexto, ancha]) {
      expect(h.filas.map((f) => f.numero), h.nombre).toEqual([2, 3, 4]);
      expect(h.resumen.map((f) => f.numero), h.nombre).toEqual([6]);
      // Lo que se cuenta suma lo que la empresa escribió como total: ya no hay 600 de más.
      expect(h.filas.reduce((acc, f) => acc + (f.celdas[1].valor as number), 0), h.nombre).toBe(600);
    }
    // El año como número: lo que la fila trae en la columna de los periodos la identifica, no es una segunda cifra.
    expect(anioNumero.filas.map((f) => f.numero)).toEqual([2, 3, 4, 5]);
    expect(anioNumero.resumen.map((f) => f.numero)).toEqual([7]);
    expect(anioNumero.avisos).toEqual(["Fila 7 tomada como fila de resumen (viene tras una fila vacía con una sola cifra, en B7, que es la suma de su columna): no cuenta como dato."]);
    // Límite conocido, fijado aquí para que no pase por resuelto: con solo tres meses la columna de periodos no llega
    // a reconocerse (tres de cuatro filas) y el año-número se cuenta como dato. Con el año como texto, o con cuatro meses, no pasa.
    expect(anioNumeroCorta.filas.map((f) => f.numero)).toEqual([2, 3, 4, 6]);
    expect(anioNumeroCorta.resumen).toEqual([]);
    expect(trimestre.avisos).toEqual(["Fila 6 tomada como fila de resumen (trae código («T1-2026»), pero viene tras una fila vacía, al pie de la hoja, y su única cifra, en B6, es la suma de su columna): no cuenta como dato."]);
    expect(anioTexto.avisos).toEqual(["Fila 6 tomada como fila de resumen (trae código («2026»), pero viene tras una fila vacía, al pie de la hoja, y su única cifra, en B6, es la suma de su columna): no cuenta como dato."]);
    // (El aviso del año escrito como número se comprueba arriba, con su hoja de cuatro meses.)
    expect(ancha.avisos).toEqual(["Fila 6 tomada como fila de resumen (trae código («T1-2026»), pero viene tras una fila vacía, al pie de la hoja, y cada una de sus cifras es la suma de su columna): no cuenta como dato."]);
    expect(resumenFilasDeResumen(trimestre)).toBe("1 fila de resumen apartada (fila 6: T1-2026 · B=600)");
    // Lo que no tiene forma de total sigue contándose, sin aviso: nada de esto es una duda.
    for (const h of [noCuadra, otroMes]) {
      expect(h.filas.map((f) => f.numero), h.nombre).toEqual([2, 3, 4, 6]);
      expect(h.resumen, h.nombre).toEqual([]);
      expect(h.avisos, h.nombre).toEqual([]);
    }
    expect(pegada.filas.map((f) => f.numero)).toEqual([2, 3, 4, 5]);
    expect(pegada.resumen).toEqual([]);
    expect(numerada.filas.map((f) => f.numero)).toEqual([2, 3, 4, 6]);
    expect(numerada.resumen).toEqual([]);
    expect(numerada.vacias.find((v) => v.columna === "precio")).toMatchObject({ vacias: 1, de: 4 });
    expect(sinVentas.filas.map((f) => f.numero)).toEqual([2, 3, 4, 6]);
    expect(sinVentas.resumen).toEqual([]);
    // Sin rótulo ni código, la fila del pie cuyas cifras suman TODAS su columna también es el total (antes contaba como un concepto más).
    expect(sinRotulo.filas.map((f) => f.numero)).toEqual([2, 3]);
    expect(sinRotulo.avisos).toEqual(["Fila 5 tomada como fila de resumen (viene tras una fila vacía, al pie de la hoja, y cada una de sus cifras es la suma de su columna): no cuenta como dato."]);
    expect(x.fidelidad).toBe("alta");
  });
  it("segundo cierre Z4 · el rótulo se busca en el primer texto de la fila, y «Total <algo>» al pie es un total aunque tenga la forma de un dato", async () => {
    // El rótulo tras una cifra: antes la fila contaba como artículo sin ningún aviso, porque se miraba la primera celda con valor.
    expect(esFilaDeResumen(fila(9, [60, "TOTAL A COSTO", "PEN", 79782]), false, { tipico: 4, alPie: false })).toBe("su primer texto es «TOTAL A COSTO»");
    expect(esFilaDeResumen(fila(9, [60, "Total valorizado", 79782]), false)).toBe("su primer texto es «Total valorizado»");
    // Un código de texto delante sigue mandando: ese es el primer texto, y la fila es un artículo.
    expect(esFilaDeResumen(fila(5, ["ML-005", "Total Wash detergente", 12, 49]), false, { tipico: 4, alPie: true, ultima: true, codigo: "si", indiceCodigo: 0 })).toBeNull();
    // «Total <algo>» con la forma entera de un dato y sin sumar: al pie es un total, tras una fila vacía o como última fila.
    expect(esFilaDeResumen(fila(40, ["TOTAL VALORIZADO", "PEN", 120, 79782]), true, { tipico: 4, alPie: true })).toBe("empieza por «TOTAL VALORIZADO», al pie de la hoja y tras una fila vacía");
    expect(esFilaDeResumen(fila(40, ["TOTAL INVENTARIO", "PEN", 79782]), false, { tipico: 3, alPie: true, ultima: true })).toBe("empieza por «TOTAL INVENTARIO» y es la última fila de la hoja");
    // La excepción de artículo queda para la fila que tiene algo debajo…
    expect(esFilaDeResumen(fila(40, ["TOTAL VALORIZADO", "PEN", 120, 79782]), true, { tipico: 4, alPie: false })).toBeNull();
    expect(esFilaDeResumen(fila(40, ["TOTAL INVENTARIO", "PEN", 79782]), false, { tipico: 3, alPie: true, ultima: false })).toBeNull();
    // …y para la que trae su código: un artículo numerado que se llama «Total Clean 1L», aunque sea el último.
    expect(esFilaDeResumen(fila(9, [7, "Total Clean 1L", "Pisos", 9.5]), false, { tipico: 4, alPie: true, ultima: true, codigo: "si", indiceCodigo: 0 })).toBeNull();
    expect(esFilaDeResumen(fila(9, [7, "Total Clean 1L", "Pisos", 9.5]), true, { tipico: 4, alPie: true, ultima: true, codigo: "si", indiceCodigo: 0 })).toBeNull();

    const wb = new ExcelJS.Workbook();
    const hoja = (nombre: string, encabezados: string[], filas: (string | number | null)[][]) => {
      const ws = wb.addWorksheet(nombre);
      ws.addRow(encabezados);
      for (const f of filas) ws.addRow(f);
    };
    const productos: (string | number | null)[][] = [["Sapolio lavavajilla 1L", "PEN", 24, 124.8], ["Poett lavanda 900ml", "PEN", 30, 144], ["Ayudín limón 1L", "PEN", 12, 60]];
    hoja("Valorizado", ["producto", "moneda", "stock", "valor"], [...productos, [], ["TOTAL VALORIZADO", "PEN", 120, 79782]]); // forma entera de un dato, ninguna cifra suma
    hoja("Pegado", ["producto", "moneda", "stock", "valor"], [...productos, ["TOTAL INVENTARIO", "PEN", null, 79782]]); // sin fila vacía antes
    hoja("Conteo", ["cantidad", "producto", "moneda", "valor"], [[24, "Sapolio lavavajilla 1L", "PEN", 124.8], [30, "Poett lavanda 900ml", "PEN", 144], [6, "Ayudín limón 1L", "PEN", 30], [59, "TOTAL A COSTO", "PEN", 79782]]); // el rótulo va tras una cifra
    hoja("Numerada", ["N°", "producto", "precio"], [[1, "Sapolio lavavajilla 1L", 7.9], [2, "Poett lavanda 900ml", 7.5], [3, "Total Clean 1L", 9.5], [4, "Ayudín limón 1L", 9.5], [5, "Total Clean 4L", 32]]); // dos artículos con su número; el N° 3 no «suma» los N° 1 y 2
    hoja("SinCodigo", ["producto", "categoria", "stock", "precio"], [["Sapolio lavavajilla 1L", "Cocina", 24, 7.9], ["Poett lavanda 900ml", "Pisos", 30, 7.5], ["Total Clean 4L", "Pisos", 6, 32]]); // el precio de la regla: un artículo así, último y sin código
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());
    const x = await leerExcel(bytes);
    const [valorizado, pegado, conteo, numerada, sinCodigo] = x.hojas;

    for (const h of [valorizado, pegado, conteo]) {
      expect(h.filas.map((f) => f.numero), h.nombre).toEqual([2, 3, 4]);
      expect(h.resumen, h.nombre).toHaveLength(1);
    }
    expect(valorizado.avisos).toEqual(["Fila 6 tomada como fila de resumen (empieza por «TOTAL VALORIZADO», al pie de la hoja y tras una fila vacía): no cuenta como dato."]);
    expect(pegado.avisos).toEqual(["Fila 5 tomada como fila de resumen (empieza por «TOTAL INVENTARIO» y es la última fila de la hoja): no cuenta como dato."]);
    expect(conteo.avisos).toEqual(["Fila 5 tomada como fila de resumen (su primer texto es «TOTAL A COSTO»): no cuenta como dato."]);
    // Los 79.782 no entran como el valor de un artículo: lo que se cuenta son los tres productos.
    expect(valorizado.filas.reduce((acc, f) => acc + (f.celdas[3].valor as number), 0)).toBeCloseTo(328.8);
    expect(resumenFilasDeResumen(conteo)).toBe("1 fila de resumen apartada (fila 5: A=59 · TOTAL A COSTO · PEN · D=79782)");
    // Con su número delante, «Total Clean» es un artículo esté donde esté: se cuenta y se avisa, también el último.
    expect(numerada.filas.map((f) => f.numero)).toEqual([2, 3, 4, 5, 6]);
    expect(numerada.resumen).toEqual([]);
    expect(numerada.avisos).toEqual([
      "Fila 4 tiene como primer texto «Total Clean 1L» pero tiene la forma de un dato y ninguna de sus cifras suma su columna: se contó como dato.",
      "Fila 6 tiene como primer texto «Total Clean 4L» pero tiene la forma de un dato y ninguna de sus cifras suma su columna: se contó como dato.",
    ]);
    expect(resumirAvisosExcel(x.avisos)).toContain("Numerada: 2 fila(s) que empiezan por «Total» contadas como dato porque tienen la forma de un dato (fila 4, 6)");
    // Lo que la regla cuesta, a la vista: sin código y como última fila, un artículo que se llama «Total Clean 4L» se
    // aparta. No se pierde (queda en `resumen`) y el aviso dice por qué, para que quien revisa lo vea y lo corrija.
    expect(sinCodigo.filas.map((f) => f.numero)).toEqual([2, 3]);
    expect(sinCodigo.avisos).toEqual(["Fila 4 tomada como fila de resumen (empieza por «Total Clean 4L» y es la última fila de la hoja): no cuenta como dato."]);
    expect(x.fidelidad).toBe("alta");
    const lectura = await detectarYLeer(MIME_EXCEL, bytes);
    expect(lectura.nota).toContain("Valorizado: 3 filas");
    expect(lectura.nota).toContain("1 fila de resumen apartada (fila 6: TOTAL VALORIZADO · PEN · C=120 · D=79782)");
    expect(lectura.nota).not.toMatch(PATRON_MENSAJE_CRUDO);
  });
});

describe("Excel · expedientes-2026-I.xlsx: 110 expedientes y ninguno con horas", () => {
  it("110 filas; horas_estimadas 110 vacías de 110; cobrado con huecos", async () => {
    const x = await leerExcel(VARGAS("expedientes-2026-I.xlsx"));
    expect(x.hojas).toHaveLength(1);
    expect(x.hojas[0].nombre).toBe("Expedientes 2026-I");
    expect(x.hojas[0].filas).toHaveLength(110);
    const horas = x.hojas[0].vacias.find((v) => v.columna === "horas_estimadas")!;
    expect(horas).toMatchObject({ letra: "I", vacias: 110, de: 110 });
    const cobrado = x.hojas[0].vacias.find((v) => v.columna === "cobrado")!;
    expect(cobrado.vacias).toBeGreaterThan(0);
    expect(cobrado.vacias).toBeLessThan(110);
    const t = excelComoTexto(x.hojas);
    expect(t.tramos[0].texto).toContain("horas_estimadas (I): 110 vacías de 110");
    expect(t.tramos[0].texto).toContain("I2 horas_estimadas=(vacío)");
  });
  it("valores raros de celda: fórmula sin resultado y error se avisan y quedan vacíos; fechas salen como día", () => {
    const avisos: string[] = [];
    expect(normalizarValor({ formula: "SUM(A1:A3)" }, "B9", avisos)).toBeNull();
    expect(normalizarValor({ formula: "SUM(A1:A3)", result: 42 }, "B10", avisos)).toBe(42);
    expect(normalizarValor({ error: "#DIV/0!" }, "C1", avisos)).toBeNull();
    expect(normalizarValor({ richText: [{ text: "Hola " }, { text: "mundo" }] }, "D1", avisos)).toBe("Hola mundo");
    expect(normalizarValor(new Date(Date.UTC(2026, 3, 1)), "E1", avisos)).toBe("2026-04-01");
    expect(normalizarValor("   ", "F1", avisos)).toBeNull();
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain("B9");
    expect(letraColumna(1)).toBe("A");
    expect(letraColumna(26)).toBe("Z");
    expect(letraColumna(27)).toBe("AA");
  });
});

describe("Lo que no sabemos leer se dice, no se simula (política de no_analizado)", () => {
  const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);
  it(".doc y .xls antiguos: no_analizado con el siguiente paso escrito", async () => {
    expect(firmaDe(OLE)).toBe("ole");
    const doc = await detectarYLeer(MIME_WORD_ANTIGUO, OLE);
    expect(doc).toMatchObject({ clase: "no_analizado", fidelidad: "no_analizado" });
    expect(doc.nota).toMatch(/\.doc\b/);
    expect(doc.nota).toMatch(/\.docx/);
    const xls = await detectarYLeer(MIME_EXCEL_ANTIGUO, OLE);
    expect(xls.nota).toMatch(/\.xls\b/);
    expect(xls.nota).toMatch(/\.xlsx/);
    // Sin tipo declarado pero con firma OLE: tampoco se intenta.
    expect((await detectarYLeer("application/octet-stream", OLE)).clase).toBe("no_analizado");
  });
  it("un PDF sin fuentes (escaneo) no se analiza; uno con texto sí, con fidelidad media y la nota de que lo lee el modelo", async () => {
    const vacio = await PDFDocument.create();
    vacio.addPage();
    const escaneo = await detectarYLeer("application/pdf", Buffer.from(await vacio.save()));
    expect(escaneo).toMatchObject({ clase: "no_analizado" });
    expect(escaneo.nota).toMatch(/sin capa de texto/);
    expect(escaneo.nota).toMatch(/fotos/);

    const contrato = await detectarYLeer("application/pdf", LUCERO("contrato-alquiler.pdf"));
    expect(contrato).toMatchObject({ clase: "pdf", paginas: 1, fidelidad: "media", capaTexto: "si" });
    expect(contrato.nota).toMatch(/capa de texto/);
  });
  it("bytes que no son un PDF con tipo PDF: no se puede saber con certeza → no_analizado y se dice", async () => {
    const r = await detectarYLeer("application/pdf", Buffer.from("esto no es un pdf ni de lejos, solo texto"));
    expect(r.clase).toBe("no_analizado");
    expect(r.nota).toMatch(/certeza/);
  });
  it("un tipo que dice ser Word pero no es ZIP, y un tipo desconocido", async () => {
    expect((await detectarYLeer(MIME_WORD, Buffer.from("hola mundo, soy texto plano"))).nota).toMatch(/dice ser un Word/);
    expect((await detectarYLeer("application/zip", Buffer.from("PK\u0003\u0004xxxxxxxx"))).nota).toMatch(/no sabemos leer/);
  });
  it("los fixtures reales pasan por la misma puerta: Word alta, Excel alta con el conteo en la nota", async () => {
    const w = await detectarYLeer(MIME_WORD, LUCERO("funciones-del-personal.docx"));
    expect(w).toMatchObject({ clase: "word", fidelidad: "alta" });
    expect(w.nota).toMatch(/párrafos/);
    const x = await detectarYLeer(MIME_EXCEL, LUCERO("ventas-e-inventario.xlsx"));
    expect(x).toMatchObject({ clase: "excel", fidelidad: "alta" });
    expect(x.nota).toContain("costo_unitario (F): 40 vacías de 120");
    expect(x.nota).toContain("1 fila de resumen apartada (fila 123: TOTAL A COSTO");
  });
  it("el MIME «Excel antiguo» que pone Windows no manda: si los bytes son ZIP se lee como .xlsx; si no son ni ZIP ni OLE, se dice la duda sin fingir", async () => {
    // En Windows con Excel instalado el navegador declara vnd.ms-excel para un .xlsx y para cualquier .csv.
    const x = await detectarYLeer(MIME_EXCEL_ANTIGUO, LUCERO("ventas-e-inventario.xlsx"));
    expect(x).toMatchObject({ clase: "excel", fidelidad: "alta" });
    const w = await detectarYLeer(MIME_WORD_ANTIGUO, LUCERO("funciones-del-personal.docx"));
    expect(w).toMatchObject({ clase: "word", fidelidad: "alta" });
    // Un CSV rotulado como vnd.ms-excel no es .xls: la nota no dice «formato antiguo», dice qué hacer.
    const csv = await detectarYLeer(MIME_EXCEL_ANTIGUO, Buffer.from("mes,ventas\n2026-04,74200\n"));
    expect(csv).toMatchObject({ clase: "no_analizado", nota: NOTA_TIPO_OFFICE_DUDOSO });
    expect(csv.nota).toMatch(/CSV/);
    expect(csv.nota).not.toMatch(/formato antiguo/);
  });
});

describe("La subida acepta .docx y .xlsx con el tipo correcto; .doc y .xls se rechazan con mensaje", () => {
  it("docx → documento; xlsx → dato", () => {
    expect(validarArchivo({ nombre: "funciones.docx", mime: MIME_WORD, bytes: 1000 })).toMatchObject({ ok: true, tipo: "documento", mime: MIME_WORD });
    expect(validarArchivo({ nombre: "ventas.xlsx", mime: MIME_EXCEL, bytes: 1000 })).toMatchObject({ ok: true, tipo: "dato", mime: MIME_EXCEL });
    // El navegador a veces manda octet-stream: la extensión decide.
    expect(validarArchivo({ nombre: "ventas.xlsx", mime: "application/octet-stream", bytes: 1000 })).toMatchObject({ ok: true, tipo: "dato", mime: MIME_EXCEL });
  });
  it(".doc y .xls: rechazo con el siguiente paso, sin pedir ya exportar a PDF ni a CSV", () => {
    const doc = validarArchivo({ nombre: "manual.doc", mime: MIME_WORD_ANTIGUO, bytes: 10 }) as { ok: false; error: string };
    expect(doc.ok).toBe(false);
    expect(doc.error).toMatch(/Word.*\.doc/);
    expect(doc.error).toMatch(/\.docx/);
    const xls = validarArchivo({ nombre: "ventas.xls", mime: MIME_EXCEL_ANTIGUO, bytes: 10 }) as { ok: false; error: string };
    expect(xls.error).toMatch(/Excel.*\.xls/);
    expect(xls.error).toMatch(/\.xlsx/);
    expect(Object.keys(RECHAZADOS_CON_MENSAJE)).not.toContain(MIME_WORD);
    expect(Object.keys(RECHAZADOS_CON_MENSAJE)).not.toContain(MIME_EXCEL);
    for (const m of Object.values(RECHAZADOS_CON_MENSAJE)) expect(m).not.toMatch(/PDF|CSV/);
  });
  it("Subir.tsx deja entrar .docx y .xlsx y ya no pide exportar", () => {
    const subir = readFileSync(path.resolve(__dirname, "../src/components/Subir.tsx"), "utf8");
    expect(subir).toMatch(/accept=\{[^}]*\.docx,\.xlsx/);
    expect(subir).not.toMatch(/expórtalo a PDF/);
    expect(subir).not.toMatch(/guárdalo como CSV/);
  });
  it("el MIME genérico de Office que pone Windows (vnd.ms-excel para .csv y .xlsx; msword para .docx) no produce un rechazo falso: la extensión manda", () => {
    expect(validarArchivo({ nombre: "ventas.csv", mime: MIME_EXCEL_ANTIGUO, bytes: 1000 })).toMatchObject({ ok: true, tipo: "dato", mime: "text/csv" });
    expect(validarArchivo({ nombre: "ventas.xlsx", mime: MIME_EXCEL_ANTIGUO, bytes: 1000 })).toMatchObject({ ok: true, tipo: "dato", mime: MIME_EXCEL });
    expect(validarArchivo({ nombre: "manual.docx", mime: MIME_WORD_ANTIGUO, bytes: 1000 })).toMatchObject({ ok: true, tipo: "documento", mime: MIME_WORD });
    expect(validarArchivo({ nombre: "Ventas 2026.CSV", mime: "application/vnd.ms-excel; charset=utf-8", bytes: 1000 })).toMatchObject({ ok: true, tipo: "dato", mime: "text/csv" });
    // Solo cuando extensión y MIME dicen los dos «formato viejo» se rechaza, con el mensaje que toca a la extensión.
    const xls = validarArchivo({ nombre: "ventas.xls", mime: MIME_EXCEL_ANTIGUO, bytes: 1000 }) as { ok: false; error: string };
    expect(xls.ok).toBe(false);
    expect(xls.error).toMatch(/Excel.*\.xls\b.*\.xlsx/);
    const doc = validarArchivo({ nombre: "manual.doc", mime: MIME_WORD_ANTIGUO, bytes: 1000 }) as { ok: false; error: string };
    expect(doc.error).toMatch(/Word.*\.doc\b.*\.docx/);
    // Un .doc de verdad se rechaza aunque el navegador mande otro MIME (octet-stream): la extensión es la que sabe.
    expect((validarArchivo({ nombre: "manual.doc", mime: "application/octet-stream", bytes: 1000 }) as { error: string }).error).toBe(EXTENSION_FORMATO_VIEJO.doc);
    // Sin una extensión que leamos tampoco se acepta a ciegas, pero NO se dice «formato antiguo (.xls)»: el MIME
    // genérico no sabe qué formato es. Un .xlsm, un .tsv o un archivo sin extensión no son un .xls.
    for (const nombre of ["ventas", "macros.xlsm", "datos.tsv", "plantilla.xltx"]) {
      const r = validarArchivo({ nombre, mime: MIME_EXCEL_ANTIGUO, bytes: 1000 }) as { ok: false; error: string };
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/^No pudimos leer ese tipo de archivo/);
      expect(r.error).not.toMatch(/formato antiguo|\(\.xls\)/);
      // Lo que el MIME sí dice (viene de Excel) sirve para sugerir el paso, no para nombrar el formato.
      expect(r.error).toContain("guárdala como .xlsx o como CSV");
      expect(r.error).not.toMatch(/application\/|vnd\./);
    }
    expect((validarArchivo({ nombre: "macros.xlsm", mime: MIME_EXCEL_ANTIGUO, bytes: 1000 }) as { error: string }).error).toContain("(.xlsm)");
    expect((validarArchivo({ nombre: "datos.tsv", mime: MIME_EXCEL_ANTIGUO, bytes: 1000 }) as { error: string }).error).toContain("(.tsv)");
    expect((validarArchivo({ nombre: "ventas", mime: MIME_EXCEL_ANTIGUO, bytes: 1000 }) as { error: string }).error).toContain("su nombre no termina en ninguna extensión");
    const rtf = validarArchivo({ nombre: "carta.rtf", mime: MIME_WORD_ANTIGUO, bytes: 1000 }) as { ok: false; error: string };
    expect(rtf.error).toContain("(.rtf)");
    expect(rtf.error).toContain("guárdalo como .docx");
    expect(rtf.error).not.toMatch(/formato antiguo|\(\.doc\)/);
  });
  it("otros rechazos falsos que ya no ocurren: un .csv declarado text/plain entra; un nombre o un tipo raros no rompen; los mensajes no llevan tipos técnicos", () => {
    // Hay sistemas que declaran text/plain para un CSV: es el genérico del texto, y la extensión dice cuál es.
    expect(validarArchivo({ nombre: "ventas.csv", mime: "text/plain", bytes: 1000 })).toMatchObject({ ok: true, tipo: "dato", mime: "text/csv" });
    expect(validarArchivo({ nombre: "notas.md", mime: "text/plain", bytes: 1000 })).toMatchObject({ ok: true, tipo: "documento", mime: "text/plain" });
    // Pero text/plain no abre la puerta a cualquier extensión: un .pdf declarado como texto sigue sin cuadrar.
    const raro = validarArchivo({ nombre: "plan.pdf", mime: "text/plain", bytes: 1000 }) as { ok: false; error: string };
    expect(raro.ok).toBe(false);
    expect(raro.error).toMatch(/termina en \.pdf/);
    // «constructor» existe en cualquier objeto de JavaScript: ni como extensión ni como tipo debe encontrar otra cosa que un rechazo con texto.
    for (const a of [{ nombre: "informe.constructor", mime: "application/octet-stream" }, { nombre: "informe", mime: "constructor" }, { nombre: "informe.constructor", mime: "constructor" }]) {
      const r = validarArchivo({ ...a, bytes: 1000 }) as { ok: false; error: string };
      expect(r.ok).toBe(false);
      expect(typeof r.error).toBe("string");
      expect(r.error).toMatch(/^No pudimos leer ese tipo de archivo/);
    }
    // Al dueño se le nombra la extensión que ve, no el tipo que declara el navegador.
    const exe = validarArchivo({ nombre: "x.exe", mime: "application/x-msdownload", bytes: 10 }) as { ok: false; error: string };
    expect(exe.error).toContain("(.exe)");
    for (const e of [exe.error, raro.error, (validarArchivo({ nombre: "a.pdf", mime: "image/png", bytes: 10 }) as { error: string }).error]) expect(e).not.toMatch(/application\/|image\/|text\/|octet/);
  });
  it("Subir.tsx no promete al cliente una pantalla que no tiene, y el selector del consultor ya no habla de «Word pegado»", () => {
    const subir = readFileSync(path.resolve(__dirname, "../src/components/Subir.tsx"), "utf8");
    // La revisión fila por fila existe solo para el consultor: al cliente se le dice quién revisa.
    expect(subir).toContain("tu consultor revisa lo que leímos antes de que cuente");
    expect(subir).toMatch(/paraCliente\s*\?\s*"Lo que leamos de un Word o un Excel queda rotulado como «extraído»: tu consultor revisa/);
    expect(subir).toMatch(/:\s*"Lo que leamos de un Word o un Excel queda rotulado como «extraído» y te lo mostramos fila por fila/);
    expect(subir).not.toMatch(/Word pegado/);
    expect(subir).toContain("o un Word subido");
  });
});

describe("Un número leído de un documento nace extraído, nunca verificado; y no pisa lo conciliado", () => {
  it("estadoAlGuardar: documento → extraido (aunque el modelo diga verificado); entrevista → lo que diga; sin_dato se respeta", () => {
    expect(estadoAlGuardar("verificado", "extraido")).toBe("extraido");
    expect(estadoAlGuardar("contado", "extraido")).toBe("extraido");
    expect(estadoAlGuardar("sin_dato", "extraido")).toBe("sin_dato");
    expect(estadoAlGuardar("contado", "declarado")).toBe("contado");
    expect(estadoAlGuardar("sin_dato", "declarado")).toBe("sin_dato");
  });
  it("puedePisar: conciliado no se toca; verificado no se degrada; lo demás sí", () => {
    expect(puedePisar(null, { estado: "extraido", origen: "extraido" })).toBe(true);
    expect(puedePisar({ id: "1", estado: "verificado", origen: "conciliado" }, { estado: "extraido", origen: "extraido" })).toBe(false);
    expect(puedePisar({ id: "1", estado: "verificado", origen: "conciliado" }, { estado: "contado", origen: "declarado" })).toBe(false);
    expect(puedePisar({ id: "1", estado: "verificado", origen: null }, { estado: "extraido", origen: "extraido" })).toBe(false);
    expect(puedePisar({ id: "1", estado: "contado", origen: "declarado" }, { estado: "extraido", origen: "extraido" })).toBe(true);
    expect(puedePisar({ id: "1", estado: "extraido", origen: "extraido" }, { estado: "extraido", origen: "extraido" })).toBe(true);
  });
  it("guardarMetricas con base falsa: de un Excel nada entra como verificado, y el conciliado queda intacto", async () => {
    const base = crearBaseFalsa({
      company_metricas: [
        { id: "m-conc", company_id: "E", clave: "venta_mes", periodo: "2026-09", valor: 86900, estado: "verificado", origen: "conciliado", conciliado_por: "u-1" },
        { id: "m-cont", company_id: "E", clave: "gasto_fijo_mes", periodo: "2026-09", valor: 15000, estado: "contado", origen: "declarado" },
      ],
    });
    await guardarMetricas(base as never, "E", [
      { clave: "venta_mes", periodo: "2026-09", valor: 99999, estado: "verificado" },
      { clave: "gasto_fijo_mes", periodo: "2026-09", valor: 16495, estado: "verificado" },
      { clave: "costo_producto_estrella", periodo: "actual", valor: 61, estado: "verificado" },
      { clave: "deuda_clientes", periodo: "actual", valor: null, estado: "sin_dato", nota: "no hay registro" },
    ], { source_id: "S", origen: "extraido" });
    const m = base.tablas.company_metricas;
    const por = (clave: string) => m.find((x) => x.clave === clave)!;
    expect(por("venta_mes")).toMatchObject({ valor: 86900, estado: "verificado", origen: "conciliado" });
    expect(por("gasto_fijo_mes")).toMatchObject({ valor: 16495, estado: "extraido", origen: "extraido", source_id: "S" });
    expect(por("costo_producto_estrella")).toMatchObject({ valor: 61, estado: "extraido", origen: "extraido" });
    expect(por("deuda_clientes")).toMatchObject({ valor: null, estado: "sin_dato", origen: "extraido" });
    expect(m.filter((x) => x.source_id === "S" && x.estado === "verificado")).toHaveLength(0);
  });
  // La pista del error se saca del mensaje de Postgres y ya no se adivina. Antes era fija y decía
  // siempre «¿falta aplicar migracion-evidencia-dimensiones.sql?»: el 18-10 murieron cuatro
  // extracciones, esa migración SÍ estaba aplicada, el culpable era un check sobre `estado` que la
  // base de producción tenía y el repositorio no declaraba, y nadie lo persiguió durante diez días.
  // Un error que acusa al inocente manda a buscar al lugar equivocado, y con autoridad.
  it("si falta una columna, el error lo dice y manda a buscar la migración que la crea", async () => {
    const base = crearBaseFalsa({}, { company_metricas: 'column "origen" does not exist' });
    await expect(guardarMetricas(base as never, "E", [{ clave: "venta_mes", periodo: "2026-09", valor: 1, estado: "contado" }], { source_id: "S", origen: "extraido" })).rejects.toThrow(/falta una columna[\s\S]*origen/);
  });

  it("si lo que se queja es un candado, el error lo nombra: es el dato que faltaba para encontrarlo", async () => {
    const base = crearBaseFalsa({}, { company_metricas: 'new row for relation "company_metricas" violates check constraint "company_metricas_estado_check"' });
    await expect(
      guardarMetricas(base as never, "E", [{ clave: "venta_mes", periodo: "2026-09", valor: 1, estado: "contado" }], { source_id: "S", origen: "extraido" }),
    ).rejects.toThrow(/company_metricas_estado_check/);
    // Y dice qué hacer con ese nombre, que es lo que nadie supo durante diez días.
    await expect(
      guardarMetricas(base as never, "E", [{ clave: "venta_mes", periodo: "2026-09", valor: 1, estado: "contado" }], { source_id: "S", origen: "extraido" }),
    ).rejects.toThrow(/solo en producción/);
  });
  it("una entrevista sigue como hasta hoy: contado y origen declarado", async () => {
    const base = crearBaseFalsa();
    await guardarMetricas(base as never, "E", [{ clave: "ventas_mes", periodo: "2026-09", valor: 80000, estado: "contado", valor_texto: "unos 80 mil" }], { response_id: "R", origen: "declarado" });
    expect(base.tablas.company_metricas[0]).toMatchObject({ clave: "venta_mes", estado: "contado", origen: "declarado", response_id: "R" });
  });
  it("el handler ya no tiene minEstado y marca la fuente de documento como pendiente de revisión", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/lib/jobs/handlers/extraer.ts"), "utf8");
    expect(src).not.toMatch(/minEstado\??:/); // ni el campo ni la llamada; el comentario histórico sí puede nombrarlo
    expect(src).toMatch(/revision: "pendiente"/);
    expect(src).toMatch(/origen: "extraido"/);
    expect(requiereRevision("documento")).toBe(true);
    expect(requiereRevision("dato")).toBe(true);
    expect(requiereRevision("audio")).toBe(false);
    expect(requiereRevision("entrevista")).toBe(false);
    expect(requiereRevision("observacion")).toBe(false);
  });
});

describe("Trazabilidad por formato: párrafo y título en Word, hoja y celda en Excel", () => {
  it("seccionDeParrafo encuentra el párrafo del fragmento y lo cita con su título", async () => {
    const w = await leerWord(LUCERO("funciones-del-personal.docx"));
    expect(seccionDeParrafo("Fija precios de las ofertas de fin de temporada", w.parrafos)).toMatch(/^párrafo \d+ · Vendedora principal \/ caja — Rosa Mamani$/);
    expect(seccionDeParrafo("Funciones: POR DEFINIR.", w.parrafos)).toMatch(/Jorge Ccahuana$/);
    // Si el modelo parafraseó y no hay literal, vale lo que el modelo dijo de sección; si nada, null.
    expect(seccionDeParrafo("esto no está en el documento", w.parrafos, "Sección dicha por el modelo")).toBe("Sección dicha por el modelo");
    expect(seccionDeParrafo(null, w.parrafos)).toBeNull();
  });
  it("celdaConHoja antepone la hoja cuando falta", () => {
    expect(celdaConHoja("F3", "Inventario")).toBe("Inventario!F3");
    expect(celdaConHoja("Gastos!C5", "Inventario")).toBe("Gastos!C5");
    expect(celdaConHoja("", "Inventario")).toBeNull();
    expect(celdaConHoja("F3", null)).toBe("F3");
  });
  it("trocearParrafos nunca parte un párrafo y respeta el tope de palabras", () => {
    const parrafos = Array.from({ length: 10 }, (_, i) => ({ indice: i + 1, estilo: "parrafo" as const, texto: "palabra ".repeat(30).trim() }));
    const tramos = trocearParrafos(parrafos, 100);
    expect(tramos.map((t) => t.length)).toEqual([3, 3, 3, 1]);
    expect(tramos.flat().map((p) => p.indice)).toEqual(parrafos.map((p) => p.indice));
    expect(trocearParrafos([], 100)).toEqual([[]]);
  });
});

// ─────────────────────── Revisión antes de consolidar (R10.2) ───────────────────────

const estado = vi.hoisted(() => ({ base: null as null | ReturnType<typeof crearBaseFalsa>, autoridad: true }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
// Para renderizar la página y el componente en Node: el enrutador de Next y los componentes de cliente que
// no tienen que ver con la revisión (subir archivos, reintentar trabajos) se sustituyen por nada.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/components/Subir", () => ({ Subir: () => null }));
vi.mock("@/components/consultor/FuentesAcciones", () => ({ AccionesFuente: () => null, ReintentarJob: () => null }));
vi.mock("@/lib/autoridad", () => ({
  exigirAutoridad: async (_p: unknown, accion: string) => {
    if (!estado.autoridad) throw new Error(`sin autoridad para ${accion}`);
  },
}));
// La capa de sesión se aparta: aquí se prueba lo que la ruta HACE con la base, no quién puede llamarla.
vi.mock("@/lib/api", async () => {
  const { z } = await import("zod");
  class EntradaInvalida extends Error {}
  return {
    protegido: (_opts: unknown, fn: unknown) => fn,
    ok: (data: unknown, status = 200) => ({ status, body: data }),
    fallo: (mensaje: string, status = 400) => ({ status, body: { error: mensaje } }),
    exigirAcceso: async () => {},
    leerValidado: async (req: Request, esquema: { safeParse: (x: unknown) => { success: boolean; data?: unknown } }) => {
      const r = esquema.safeParse(await req.json());
      if (!r.success) throw new EntradaInvalida("entrada inválida");
      return r.data;
    },
    uuid: z.string().uuid(),
    EntradaInvalida,
  };
});

const SRC = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";
const C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const C2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const C3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const CX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9";
const M1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const M2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const M3 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
const PERFIL = { id: "u-consultor", rol: "consultor" as const, email: null, nombre: null };

function baseConFuente() {
  return crearBaseFalsa({
    sources: [{ id: SRC, company_id: "E", tipo: "dato", estado: "leido", revision: "pendiente" }, { id: OTRA, company_id: "E", tipo: "documento", estado: "leido", revision: "pendiente" }],
    jobs: [],
    claims: [
      { id: C1, source_id: SRC, texto: "Rosa fija los precios de las ofertas de fin de temporada", estado: "sin_verificar" },
      { id: C2, source_id: SRC, texto: "La tienda abre de lunes a sabado", estado: "sin_verificar" },
      { id: C3, source_id: SRC, texto: "Hay un manual de caja", estado: "sin_verificar" },
      { id: CX, source_id: OTRA, texto: "De otra fuente", estado: "sin_verificar" },
    ],
    company_metricas: [
      { id: M1, company_id: "E", source_id: SRC, clave: "venta_mes", periodo: "2026-09", valor: 86900, estado: "extraido", origen: "extraido" },
      { id: M2, company_id: "E", source_id: SRC, clave: "gasto_fijo_mes", periodo: "2026-09", valor: 16495, estado: "extraido", origen: "extraido" },
      { id: M3, company_id: "E", source_id: SRC, clave: "costo_producto_estrella", periodo: "actual", valor: 61, estado: "extraido", origen: "extraido", nota: "promedio de la hoja" },
    ],
  });
}

async function consolidar(cuerpo: unknown, id = SRC, perfil: { id: string; rol: "consultor"; email: null; nombre: null } = PERFIL) {
  const { POST } = await import("@/app/api/sources/[id]/consolidar/route");
  const req = new Request(`http://local/api/sources/${id}/consolidar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  const handler = POST as unknown as (perfil: typeof PERFIL, req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<{ status: number; body: Fila }>;
  return handler(perfil, req, { params: Promise.resolve({ id }) });
}

describe("POST /api/sources/[id]/consolidar: el consultor decide fila por fila y la fuente queda consolidada", () => {
  it("confirma, corrige y descarta afirmaciones; acepta, corrige y descarta números; marca la fuente", async () => {
    estado.base = baseConFuente();
    estado.autoridad = true;
    const r = await consolidar({
      claims: [
        { id: C1, accion: "confirmar" },
        { id: C2, accion: "corregir", texto: "La tienda abre de lunes a sábado de 10 a 20" },
        { id: C3, accion: "descartar", texto: "El propio documento dice que no hay manual de caja" },
      ],
      metricas: [
        { id: M1, accion: "aceptar" },
        { id: M2, accion: "corregir", valor: 16500, nota: "redondeo del alquiler" },
        { id: M3, accion: "descartar" },
      ],
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ revision: "consolidada", pendientes: 0, claims: { confirmadas: 1, corregidas: 1, descartadas: 1 }, metricas: { aceptadas: 1, corregidas: 1, descartadas: 1 } });

    const t = estado.base.tablas;
    const claim = (id: string) => t.claims.find((c) => c.id === id)!;
    expect(claim(C1)).toMatchObject({ estado: "confirmado", validado_por: "u-consultor" });
    expect(claim(C1).validado_at).toBeTruthy();
    expect(claim(C2)).toMatchObject({ estado: "confirmado", texto: "La tienda abre de lunes a sábado de 10 a 20", comprobacion: "comprobado_por_consultor" });
    expect(claim(C2).comprobacion_nota).toContain("La tienda abre de lunes a sabado"); // el original no se pierde
    expect(claim(C3)).toMatchObject({ estado: "caducado", comprobacion: "refutado" });
    expect(claim(C3).comprobacion_nota).toContain("no hay manual de caja");
    expect(claim(CX)).toMatchObject({ estado: "sin_verificar" }); // la otra fuente no se tocó

    const met = (id: string) => t.company_metricas.find((m) => m.id === id)!;
    // ESTE es el único camino por el que una cifra de documento llega a «verificado».
    expect(met(M1)).toMatchObject({ estado: "verificado", origen: "conciliado", conciliado_por: "u-consultor", valor: 86900 });
    expect(met(M2)).toMatchObject({ estado: "verificado", origen: "conciliado", valor: 16500 });
    expect(met(M2).nota).toContain("16495");
    expect(met(M2).nota).toContain("redondeo del alquiler");
    expect(met(M3)).toMatchObject({ estado: "descartado", valor: null, origen: "extraido" });
    expect(met(M3).nota).toContain("61");
    expect(met(M3).nota).toContain("promedio de la hoja");

    expect(t.sources.find((s) => s.id === SRC)).toMatchObject({ revision: "consolidada", revisada_por: "u-consultor" });
    expect(t.sources.find((s) => s.id === OTRA)).toMatchObject({ revision: "pendiente" });
  });

  it("un subconjunto de filas se aplica pero NO consolida: la fuente sigue pendiente con las que faltan contadas; al terminar, consolida", async () => {
    estado.base = baseConFuente();
    estado.autoridad = true;
    // Primera tanda: una afirmación y un número. Quedan dos afirmaciones y dos números sin decidir.
    const r1 = await consolidar({ claims: [{ id: C1, accion: "confirmar" }], metricas: [{ id: M3, accion: "descartar" }] });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ revision: "pendiente", pendientes: 4, claims: { confirmadas: 1 }, metricas: { descartadas: 1 } });
    const t = estado.base.tablas;
    expect(t.claims.find((c) => c.id === C1)).toMatchObject({ estado: "confirmado", validado_por: "u-consultor" }); // lo decidido sí se aplicó
    expect(t.company_metricas.find((m) => m.id === M3)).toMatchObject({ estado: "descartado", valor: null });
    expect(t.claims.find((c) => c.id === C2)).toMatchObject({ estado: "sin_verificar" }); // lo no mirado sigue como estaba
    expect(t.company_metricas.find((m) => m.id === M1)).toMatchObject({ estado: "extraido", origen: "extraido" });
    // Marcar consolidada aquí diría que se revisó lo que nadie revisó: la fuente sigue pendiente y su pantalla sigue.
    expect(t.sources.find((s) => s.id === SRC)).toMatchObject({ revision: "pendiente" });
    expect(t.sources.find((s) => s.id === SRC)?.revisada_por).toBeUndefined();

    // Segunda tanda: el resto. Ahora no queda nada sin decidir y la fuente se consolida.
    const r2 = await consolidar({
      claims: [{ id: C2, accion: "confirmar" }, { id: C3, accion: "descartar" }],
      metricas: [{ id: M1, accion: "aceptar" }, { id: M2, accion: "corregir", valor: 16500 }],
    });
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ revision: "consolidada", pendientes: 0 });
    expect(t.sources.find((s) => s.id === SRC)).toMatchObject({ revision: "consolidada", revisada_por: "u-consultor" });
  });

  it("lo ya decidido no se vuelve a decidir: una tanda posterior que reenvía filas resueltas no pisa el rastro ni resucita un número descartado", async () => {
    estado.base = baseConFuente();
    estado.autoridad = true;
    const r1 = await consolidar({
      claims: [{ id: C2, accion: "corregir", texto: "La tienda abre de lunes a sábado de 10 a 20" }, { id: C3, accion: "descartar" }],
      metricas: [{ id: M1, accion: "aceptar" }, { id: M3, accion: "descartar" }],
    });
    expect(r1.body).toMatchObject({ revision: "pendiente", pendientes: 2, ya_decididas: 0 });
    const t = estado.base.tablas;
    const claim = (id: string) => t.claims.find((c) => c.id === id)!;
    const met = (id: string) => t.company_metricas.find((m) => m.id === id)!;
    expect(met(M3).nota.startsWith(NOTA_NUMERO_DESCARTADO)).toBe(true);
    const notaC2 = claim(C2).comprobacion_nota, notaM3 = met(M3).nota, cuandoM1 = met(M1).conciliado_at;

    // Segunda tanda desde una pestaña vieja: reenvía las cuatro filas ya resueltas, con otras decisiones, y las dos que faltaban.
    const r2 = await consolidar({
      claims: [{ id: C1, accion: "confirmar" }, { id: C2, accion: "corregir", texto: "Otra redacción" }, { id: C3, accion: "confirmar" }],
      metricas: [{ id: M1, accion: "descartar" }, { id: M2, accion: "aceptar" }, { id: M3, accion: "aceptar" }],
    });
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ revision: "consolidada", pendientes: 0, ya_decididas: 4, claims: { confirmadas: 1, corregidas: 0, descartadas: 0 }, metricas: { aceptadas: 1, corregidas: 0, descartadas: 0 } });
    // La corrección de la primera tanda sigue, y su nota sigue citando lo que decía la LECTURA, no la corrección.
    expect(claim(C2)).toMatchObject({ estado: "confirmado", texto: "La tienda abre de lunes a sábado de 10 a 20", comprobacion_nota: notaC2 });
    expect(claim(C2).comprobacion_nota).toContain("La tienda abre de lunes a sabado");
    expect(claim(C3)).toMatchObject({ estado: "caducado", comprobacion: "refutado" });
    // El número aceptado no se descarta por el reenvío; el descartado no vuelve como «verificado» sin valor.
    expect(met(M1)).toMatchObject({ estado: "verificado", origen: "conciliado", valor: 86900, conciliado_at: cuandoM1 });
    expect(met(M3)).toMatchObject({ estado: "descartado", valor: null, origen: "extraido", nota: notaM3 });
    expect(met(M2)).toMatchObject({ estado: "verificado", origen: "conciliado", valor: 16495 });
  });

  it("aceptar una lectura sin cifra no la vuelve «verificado»: sigue sin dato, conciliada; y mientras nadie la mire, la fuente no se consolida", async () => {
    estado.base = baseConFuente();
    estado.autoridad = true;
    const M4 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";
    estado.base.tablas.company_metricas.push({ id: M4, company_id: "E", source_id: SRC, clave: "caja_hoy", periodo: "actual", valor: null, estado: "sin_dato", origen: "extraido", nota: "el documento dice que no se lleva caja" });
    const todoMenosM4 = {
      claims: [{ id: C1, accion: "confirmar" }, { id: C2, accion: "confirmar" }, { id: C3, accion: "confirmar" }],
      metricas: [{ id: M1, accion: "aceptar" }, { id: M2, accion: "aceptar" }, { id: M3, accion: "aceptar" }],
    };
    // Un «sin dato» leído del documento también espera decisión: sin ella la fuente sigue pendiente.
    expect((await consolidar(todoMenosM4)).body).toMatchObject({ revision: "pendiente", pendientes: 1 });
    const r = await consolidar({ metricas: [{ id: M4, accion: "aceptar" }] });
    expect(r.body).toMatchObject({ revision: "consolidada", pendientes: 0, metricas: { aceptadas: 1 } });
    const m4 = estado.base.tablas.company_metricas.find((m) => m.id === M4)!;
    // La falta de dato no es cero ni es «verificado»: es un «sin dato» que alguien confirmó.
    expect(m4).toMatchObject({ estado: "sin_dato", origen: "conciliado", valor: null, conciliado_por: "u-consultor" });
    expect(m4.nota).toBe("el documento dice que no se lleva caja");
  });

  it("un cuerpo vacío consolida solo cuando no hay nada por decidir: la lectura no encontró nada, o ya se decidió todo", async () => {
    // La pantalla ofrece «consolidar para dejar constancia» cuando la lectura no encontró nada: la ruta tiene que cumplirlo.
    estado.base = crearBaseFalsa({ sources: [{ id: SRC, company_id: "E", tipo: "documento", estado: "leido", revision: "pendiente" }], claims: [], company_metricas: [], jobs: [] });
    estado.autoridad = true;
    const sinNada = await consolidar({});
    expect(sinNada.status).toBe(200);
    expect(sinNada.body).toMatchObject({ revision: "consolidada", pendientes: 0 });
    expect(estado.base.tablas.sources[0]).toMatchObject({ revision: "consolidada", revisada_por: "u-consultor" });

    // Todo decidido en tandas anteriores (afirmaciones confirmadas en otra pantalla, número descartado): también cierra.
    estado.base = baseConFuente();
    for (const c of estado.base.tablas.claims) if (c.source_id === SRC) c.estado = "confirmado";
    for (const m of estado.base.tablas.company_metricas) Object.assign(m, { estado: "descartado", valor: null });
    expect((await consolidar({})).body).toMatchObject({ revision: "consolidada", pendientes: 0 });

    // Con una sola fila sin mirar, el cuerpo vacío se rechaza y nada cambia.
    estado.base = baseConFuente();
    for (const m of estado.base.tablas.company_metricas) Object.assign(m, { estado: "descartado", valor: null });
    for (const c of estado.base.tablas.claims) if (c.id !== C1) c.estado = "confirmado";
    const queda = await consolidar({});
    expect(queda.status).toBe(400);
    expect(queda.body.error).toMatch(/nada que consolidar/);
    expect(estado.base.tablas.sources.find((s) => s.id === SRC)).toMatchObject({ revision: "pendiente" });
  });

  it("una afirmación de otra fuente no se toca, aunque el consultor pueda ver la empresa", async () => {
    estado.base = baseConFuente();
    const r = await consolidar({ claims: [{ id: CX, accion: "confirmar" }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/no pertenece a esta fuente/);
    expect(estado.base.tablas.claims.find((c) => c.id === CX)).toMatchObject({ estado: "sin_verificar" });
    expect(estado.base.tablas.sources.find((s) => s.id === SRC)).toMatchObject({ revision: "pendiente" });
  });

  it("corregir sin texto o sin valor, y un cuerpo vacío, se rechazan antes de escribir nada", async () => {
    estado.base = baseConFuente();
    expect((await consolidar({ claims: [{ id: C1, accion: "corregir" }] })).status).toBe(400);
    expect((await consolidar({ metricas: [{ id: M1, accion: "corregir" }] })).status).toBe(400);
    // La misma fila dos veces, con decisiones distintas: no se adivina cuál vale.
    const doble = await consolidar({ claims: [{ id: C1, accion: "confirmar" }, { id: C1, accion: "descartar" }] });
    expect(doble.status).toBe(400);
    expect(doble.body.error).toMatch(/una sola decisión/);
    const vacio = await consolidar({});
    expect(vacio.status).toBe(400);
    expect(vacio.body.error).toMatch(/nada que consolidar/);
    expect(estado.base.tablas.sources.find((s) => s.id === SRC)).toMatchObject({ revision: "pendiente" });
    expect(estado.base.tablas.claims.find((c) => c.id === C1)).toMatchObject({ estado: "sin_verificar" });
  });

  it("sin autoridad para aprobar hallazgos no se consolida (la ruta la exige después del acceso)", async () => {
    estado.base = baseConFuente();
    estado.autoridad = false;
    await expect(consolidar({ claims: [{ id: C1, accion: "confirmar" }] })).rejects.toThrow(/aprobar_hallazgo/);
    estado.autoridad = true;
    const src = readFileSync(path.resolve(__dirname, "../src/app/api/sources/[id]/consolidar/route.ts"), "utf8");
    expect(src).toMatch(/exigirAutoridad\(perfil, "aprobar_hallazgo"\)/);
    expect(src).toMatch(/consultor: true/);
    expect(src.indexOf("exigirAcceso(")).toBeLessThan(src.indexOf('exigirAutoridad(perfil, "aprobar_hallazgo")'));
  });

  it("una fuente que no existe responde 404", async () => {
    estado.base = baseConFuente();
    const r = await consolidar({ claims: [{ id: C1, accion: "confirmar" }] }, "33333333-3333-4333-8333-333333333333");
    expect(r.status).toBe(404);
  });

  it("una afirmación «contradicho» también espera decisión: la ruta la cuenta igual que la pantalla y no consolida hasta que alguien la decide", async () => {
    estado.base = baseConFuente();
    estado.autoridad = true;
    // El contraste marcó C3 como contradicha al terminar la lectura. La pantalla la sigue pidiendo (afirmacionYaDecidida).
    estado.base.tablas.claims.find((c) => c.id === C3)!.estado = "contradicho";
    const fuente = () => estado.base!.tablas.sources.find((x) => x.id === SRC)!;
    const r1 = await consolidar({
      claims: [{ id: C1, accion: "confirmar" }, { id: C2, accion: "confirmar" }],
      metricas: [{ id: M1, accion: "aceptar" }, { id: M2, accion: "aceptar" }, { id: M3, accion: "aceptar" }],
    });
    // Antes del arreglo esto respondía «consolidada»: la ruta solo contaba «sin_verificar» y la contradicha quedaba sin decidir.
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ revision: "pendiente", pendientes: 1 });
    expect(fuente()).toMatchObject({ revision: "pendiente" });
    expect(fuente().revisada_por).toBeUndefined();
    // Tampoco se cuela con un cuerpo vacío: queda una fila por mirar.
    const vacio = await consolidar({});
    expect(vacio.status).toBe(400);
    expect(vacio.body.error).toMatch(/nada que consolidar/);
    const r2 = await consolidar({ claims: [{ id: C3, accion: "descartar", texto: "La contradice el tarifario vigente" }] });
    expect(r2.body).toMatchObject({ revision: "consolidada", pendientes: 0, claims: { descartadas: 1 } });
    const c3 = estado.base.tablas.claims.find((c) => c.id === C3)!;
    expect(c3).toMatchObject({ estado: "caducado", comprobacion: "refutado", validado_por: "u-consultor" });
    expect(c3.comprobacion_nota).toContain("La contradice el tarifario vigente");
    expect(fuente()).toMatchObject({ revision: "consolidada", revisada_por: "u-consultor" });
  });

  it("401 filas con una contradicha al final: las cinco tandas se envían, el descarte de la última llega y solo entonces se consolida", async () => {
    const { tandasDeRevision } = await import("@/components/realidad/RevisarExtraccion");
    const idDe = (i: number) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`;
    estado.base = crearBaseFalsa({
      sources: [{ id: SRC, company_id: "E", tipo: "documento", estado: "leido", revision: "pendiente" }],
      jobs: [],
      claims: Array.from({ length: 401 }, (_, i) => ({ id: idDe(i), source_id: SRC, texto: `Afirmación ${i}`, estado: i === 400 ? "contradicho" : "sin_verificar" })),
      company_metricas: [],
    });
    estado.autoridad = true;
    // Lo que hace la pantalla: una decisión por fila, partidas en tandas, y solo la última pide cerrar.
    const decisiones = Array.from({ length: 401 }, (_, i) => (i === 400 ? { id: idDe(i), accion: "descartar", texto: "La contradice el contrato firmado" } : { id: idDe(i), accion: "confirmar" }));
    const tandas = tandasDeRevision(decisiones, []);
    expect(tandas.map((t) => t.claims.length)).toEqual([100, 100, 100, 100, 1]);
    const respuestas: { status: number; body: Fila }[] = [];
    for (let i = 0; i < tandas.length; i++) respuestas.push(await consolidar({ ...tandas[i], cerrar: i === tandas.length - 1 }));
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(respuestas.map((r) => r.body.revision)).toEqual(["pendiente", "pendiente", "pendiente", "pendiente", "consolidada"]);
    expect(respuestas.map((r) => r.body.pendientes)).toEqual([301, 201, 101, 1, 0]);
    const t = estado.base.tablas;
    expect(t.claims.filter((c) => c.estado === "confirmado")).toHaveLength(400);
    // El descarte que antes se perdía (la fuente se cerraba en la primera tanda y el reintento daba 409) está guardado.
    expect(t.claims[400]).toMatchObject({ estado: "caducado", comprobacion: "refutado" });
    expect(t.claims[400].comprobacion_nota).toContain("La contradice el contrato firmado");
    expect(t.sources[0]).toMatchObject({ revision: "consolidada", revisada_por: "u-consultor" });
    // Cien confirmaciones son dos escrituras (trozos de 50 ids), no cien; y ninguna consulta lleva cientos de ids.
    expect(estado.base.registro.idsEnUnIn).toBeLessThanOrEqual(50);
    expect(estado.base.registro.escrituras).toBeLessThanOrEqual(4 * 2 + 1 + 1);
  });

  it("una tanda que no cierra nunca consolida, aunque ya no quede nada por decidir; la que cierra, sí", async () => {
    estado.base = baseConFuente();
    estado.autoridad = true;
    const todo = {
      claims: [{ id: C1, accion: "confirmar" }, { id: C2, accion: "confirmar" }, { id: C3, accion: "descartar" }],
      metricas: [{ id: M1, accion: "aceptar" }, { id: M2, accion: "aceptar" }, { id: M3, accion: "descartar" }],
    };
    const guardada = await consolidar({ ...todo, cerrar: false });
    expect(guardada.status).toBe(200);
    expect(guardada.body).toMatchObject({ revision: "pendiente", pendientes: 0, claims: { confirmadas: 2, descartadas: 1 }, metricas: { aceptadas: 2, descartadas: 1 } });
    expect(estado.base.tablas.sources.find((x) => x.id === SRC)).toMatchObject({ revision: "pendiente" });
    // Una tanda sin decisiones que tampoco cierra no hace nada: se rechaza en vez de responder «guardado».
    const nada = await consolidar({ cerrar: false });
    expect(nada.status).toBe(400);
    expect(nada.body.error).toMatch(/nada que guardar/);
    // El descarte sin motivo deja el mismo rastro que antes de agrupar las escrituras.
    expect(estado.base.tablas.claims.find((c) => c.id === C3)).toMatchObject({ estado: "caducado", comprobacion: "refutado", comprobacion_nota: "Descartada al revisar la extracción: no es una afirmación de la empresa o la lectura fue errónea." });
    const cierre = await consolidar({});
    expect(cierre.body).toMatchObject({ revision: "consolidada", pendientes: 0 });
    expect(estado.base.tablas.sources.find((x) => x.id === SRC)).toMatchObject({ revision: "consolidada", revisada_por: "u-consultor" });
  });

  it("una lectura en curso o cortada no se sella como revisada: 409 sin escribir nada, con el cuerpo vacío o con decisiones", async () => {
    estado.autoridad = true;
    const sinFilas = (fuente: Fila, jobs: Fila[] = []) => crearBaseFalsa({ sources: [{ id: SRC, company_id: "E", tipo: "documento", ...fuente }], claims: [], company_metricas: [], jobs });
    const trabajo = (extra: Fila) => ({ id: `j-${extra.estado}`, company_id: "E", tipo: "extraer", payload: { source_id: SRC }, ...extra });
    const noSella = async (base: ReturnType<typeof crearBaseFalsa>, motivo: RegExp, cuerpo: unknown = {}) => {
      estado.base = base;
      const antes = JSON.stringify(base.tablas);
      const r = await consolidar(cuerpo);
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(motivo);
      expect(JSON.stringify(base.tablas)).toBe(antes); // ni la fuente ni una sola fila cambiaron
      expect(base.registro.escrituras).toBe(0);
      // El mensaje es para el consultor: dice qué hacer y no lleva nombres de columnas, de estados ni de tablas.
      expect(r.body.error).not.toMatch(/revision\b|estado|leyendo|leido|jobs|payload/);
      expect(r.body.error).toMatch(/vuelve a extraerla/);
    };
    // 1. Primera lectura en marcha: la fuente todavía no espera revisión y su estado es «leyendo» (o recién subida).
    await noSella(sinFilas({ estado: "leyendo", revision: null }), /todavía no terminó de leerse/);
    await noSella(sinFilas({ estado: "subido", revision: null }), /todavía no terminó de leerse/);
    // 2. Reextracción: la revisión sigue «pendiente» de la lectura anterior, las afirmaciones se archivaron y se está leyendo otra vez.
    //    Antes, el panel ofrecía «consolidar para dejar constancia» y el cuerpo vacío sellaba «revisada» una lectura sin terminar.
    await noSella(sinFilas({ estado: "leyendo", revision: "pendiente" }), /todavía no terminó de leerse/);
    // 3. Reextracción recién pedida: el estado sigue «leido» hasta que el trabajo arranca, pero ya hay un trabajo de extracción vivo.
    await noSella(sinFilas({ estado: "leido", revision: "pendiente" }, [trabajo({ estado: "pendiente" })]), /todavía no terminó de leerse/);
    await noSella(sinFilas({ estado: "leido", revision: "pendiente" }, [trabajo({ estado: "corriendo", payload: { source_id: SRC, chunk_index: 2, total: 5 } })]), /todavía no terminó de leerse/);
    // 4. Una fuente leída que no pasa por esta revisión (entrevista, nota de voz, archivo no analizado): otro motivo, mismo 409.
    await noSella(sinFilas({ estado: "leido", revision: null }), /no está esperando revisión/);
    // 5. Con decisiones tampoco: revisar la mitad que ya se leyó sería dar por revisado lo que falta por leer.
    const aMedias = baseConFuente();
    aMedias.tablas.sources.find((x) => x.id === SRC)!.estado = "leyendo";
    await noSella(aMedias, /todavía no terminó de leerse/, { claims: [{ id: C1, accion: "confirmar" }], metricas: [{ id: M1, accion: "aceptar" }] });
    const conTrabajo = baseConFuente();
    conTrabajo.tablas.jobs.push(trabajo({ estado: "corriendo" }));
    await noSella(conTrabajo, /todavía no terminó de leerse/, { claims: [{ id: C1, accion: "confirmar" }, { id: C2, accion: "confirmar" }, { id: C3, accion: "confirmar" }], metricas: [{ id: M1, accion: "aceptar" }, { id: M2, accion: "aceptar" }, { id: M3, accion: "aceptar" }] });

    // 6. Lo que NO bloquea: trabajos ya terminados (hechos o fallidos), los de otra fuente y los de otro tipo.
    estado.base = sinFilas({ estado: "leido", revision: "pendiente" }, [
      trabajo({ id: "j1", estado: "hecho" }),
      trabajo({ id: "j2", estado: "fallido", payload: { source_id: SRC, chunk_index: 2, total: 5 } }),
      trabajo({ id: "j3", estado: "corriendo", payload: { source_id: OTRA } }),
      trabajo({ id: "j4", estado: "pendiente", tipo: "contrastar" }),
    ]);
    const leida = await consolidar({});
    expect(leida.status).toBe(200);
    expect(leida.body).toMatchObject({ revision: "consolidada", pendientes: 0 });
    expect(estado.base.tablas.sources[0]).toMatchObject({ revision: "consolidada", revisada_por: "u-consultor" });
  });

  it("una fuente con más filas de las que la base entrega de una vez se lee entera: lo pendiente más allá de la primera página también cuenta", async () => {
    const idDe = (i: number) => `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`;
    const fuenteGrande = () =>
      crearBaseFalsa(
        {
          sources: [{ id: SRC, company_id: "E", tipo: "dato", estado: "leido", revision: "pendiente" }],
          jobs: [],
          // 1.205 afirmaciones: todas decididas menos la última, que cae en la quinta página.
          claims: Array.from({ length: 1205 }, (_, i) => ({ id: idDe(i), source_id: SRC, texto: `Afirmación ${i}`, estado: i === 1204 ? "sin_verificar" : "confirmado" })),
          company_metricas: [],
        },
        {},
        { topeFilas: 300 } // el servidor recorta cada respuesta a 300 filas, pida lo que pida la consulta
      );
    estado.base = fuenteGrande();
    estado.autoridad = true;
    // Si la ruta se fiara de la primera respuesta (300 filas, todas decididas), aquí consolidaría una fuente con una fila sin mirar.
    const vacio = await consolidar({});
    expect(vacio.status).toBe(400);
    expect(vacio.body.error).toMatch(/nada que consolidar/);
    expect(estado.base.tablas.sources[0]).toMatchObject({ revision: "pendiente" });
    // Y la fila 1.205 pertenece a la fuente aunque no venga en la primera página: su decisión se acepta y cierra.
    const r = await consolidar({ claims: [{ id: idDe(1204), accion: "confirmar" }, { id: idDe(3), accion: "descartar" }] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ revision: "consolidada", pendientes: 0, ya_decididas: 1, claims: { confirmadas: 1, descartadas: 0 } });
    expect(estado.base.tablas.claims[1204]).toMatchObject({ estado: "confirmado", validado_por: "u-consultor" });
    expect(estado.base.tablas.claims[3]).toMatchObject({ estado: "confirmado" }); // ya estaba decidida: no se descarta por el reenvío
  });

  it("una fuente ya consolidada no se reconsolida: 409 con el motivo, y nada cambia", async () => {
    estado.base = baseConFuente();
    const fuente = estado.base.tablas.sources.find((x) => x.id === SRC)!;
    Object.assign(fuente, { revision: "consolidada", revisada_por: "u-otro", revisada_at: "2026-10-12T15:00:00.000Z" });
    const r = await consolidar({ claims: [{ id: C1, accion: "confirmar" }], metricas: [{ id: M1, accion: "aceptar" }] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/ya fue revisada y consolidada el 2026-10-12/);
    expect(r.body.error).toMatch(/vuelve a extraerla/);
    expect(estado.base.tablas.claims.find((c) => c.id === C1)).toMatchObject({ estado: "sin_verificar" });
    expect(estado.base.tablas.company_metricas.find((m) => m.id === M1)).toMatchObject({ estado: "extraido", origen: "extraido" });
    expect(fuente).toMatchObject({ revision: "consolidada", revisada_por: "u-otro" });
  });

  it("la pantalla del consultor muestra la revisión solo para fuentes pendientes, con el texto acordado y sin prometer una exclusión que no existe", () => {
    const pagina = readFileSync(path.resolve(__dirname, "../src/app/(consultor)/empresa/[id]/fuentes/page.tsx"), "utf8");
    const comp = readFileSync(path.resolve(__dirname, "../src/components/realidad/RevisarExtraccion.tsx"), "utf8");
    expect(pagina).toMatch(/revision === "pendiente"/);
    expect(pagina).toMatch(/<RevisarExtraccion/);
    expect(pagina).toMatch(/fidelidad_extraccion,fidelidad_nota,revision/);
    expect(comp).toContain("Revisa lo que leímos antes de que cuente");
    expect(comp).toMatch(/\/api\/sources\/\$\{sourceId\}\/consolidar/);
    // Nada se confirma por omisión: el botón espera a que todas las filas tengan decisión.
    expect(comp).toMatch(/disabled=\{pendientes > 0/);
    // Un número «extraido» con valor SÍ cuenta en la radiografía y entra al diagnóstico, rotulado (metricas.ts):
    // la pantalla no puede decir que «no cuenta» ni que «nada entra» hasta confirmar.
    expect(comp).not.toMatch(/Nada de esto entra al diagnóstico/);
    expect(pagina).not.toMatch(/no cuenta en el diagnóstico/);
    expect(comp).toContain("extraído, pendiente de conciliar");
    expect(pagina).toContain("extraído, pendiente de conciliar");
    // Confirmar sin mirar no es confirmar: no existe el botón que marcaba el resto en bloque.
    expect(comp).not.toMatch(/Marcar el resto|marcarResto/);
    // Si la ruta responde «pendiente», la pantalla lo dice y NO se cierra: solo la consolidación cierra el botón.
    expect(comp).toMatch(/if \(r\?\.revision === "consolidada"\) setListo\(/);
    expect(comp).toMatch(/else setAviso\(/);
    expect(comp).toMatch(/disabled=\{pendientes > 0 \|\| enviando \|\| !!listo \|\| leyendo\}/);
    expect(comp).not.toMatch(/!!aviso/);
    // Y lo decidido viaja en tandas que la ruta acepta, no en una sola llamada que una fuente grande haría rebotar.
    // TODAS se envían (el bucle no se corta a mitad) y solo la última pide cerrar.
    const bucle = comp.slice(comp.indexOf("for (let i = 0; i < tandas.length; i++)"), comp.indexOf("const resumen ="));
    expect(bucle).toContain("cerrar: i === tandas.length - 1");
    expect(bucle).not.toMatch(/\bbreak\b/);
    // Las claves internas no se muestran: los números se nombran como al dueño y los pilares/tipos con su nombre.
    expect(comp).toMatch(/VITAL_POR_CLAVE|RECONOCIDA_POR_CLAVE/);
    expect(comp).toMatch(/nombreDePeriodo\(/);
    expect(comp).toMatch(/PILAR\b/);
  });
});

// ─────────────────────── La misma ruta contra el esquema real (Postgres embebido) ───────────────────────

/**
 * Lo mínimo de PostgREST que usa la ruta de consolidación, traducido a SQL contra Postgres embebido (PGlite).
 * NO es PostgREST: aquí no hay URL (así que no prueba el largo de una consulta con muchos ids) ni tope de filas
 * por respuesta. Lo que sí prueba es que lo que la ruta escribe cabe en el esquema del repositorio: los checks de
 * estado y comprobación, las claves foráneas de quién validó y quién revisó, y el `payload @> …` de los trabajos.
 */
function basePostgres(pg: PGlite) {
  class Consulta {
    private donde: string[] = [];
    private params: unknown[] = [];
    private patch: Fila | null = null;
    private columnas = "*";
    private orden = "";
    private rango: [number, number] | null = null;
    private tope: number | null = null;
    private unico = false;
    constructor(private tabla: string) {}
    private p(v: unknown) { this.params.push(v); return `$${this.params.length}`; }
    select(columnas = "*") { if (!this.patch) this.columnas = columnas; return this; }
    update(patch: Fila) { this.patch = patch; return this; }
    eq(c: string, v: unknown) { this.donde.push(`${c} = ${this.p(v)}`); return this; }
    in(c: string, vs: unknown[]) { this.donde.push(vs.length ? `${c} in (${vs.map((v) => this.p(v)).join(", ")})` : "false"); return this; }
    contains(c: string, v: unknown) { this.donde.push(`${c} @> ${this.p(JSON.stringify(v))}::jsonb`); return this; }
    order(c: string) { this.orden = ` order by ${c}`; return this; }
    range(desde: number, hasta: number) { this.rango = [desde, hasta]; return this; }
    limit(n: number) { this.tope = n; return this; }
    single() { this.unico = true; return this; }
    then<A, B>(res: (v: Fila) => A, rej?: (e: unknown) => B) { return this.ejecutar().then(res, rej); }
    private async ejecutar(): Promise<Fila> {
      const where = this.donde.length ? ` where ${this.donde.join(" and ")}` : "";
      try {
        if (this.patch) {
          const sets = Object.entries(this.patch).map(([k, v]) => `${k} = ${this.p(v)}`).join(", ");
          await pg.query(`update ${this.tabla} set ${sets}${where}`, this.params);
          return { data: null, error: null };
        }
        const total = (await pg.query<{ n: number }>(`select count(*)::int as n from ${this.tabla}${where}`, this.params)).rows[0].n;
        const pagina = this.rango ? ` offset ${this.rango[0]} limit ${this.rango[1] - this.rango[0] + 1}` : this.tope !== null ? ` limit ${this.tope}` : "";
        const { rows } = await pg.query<Fila>(`select ${this.columnas} from ${this.tabla}${where}${this.orden}${pagina}`, this.params);
        // PostgREST entrega un `numeric` como número; PGlite, como texto.
        for (const f of rows) if (typeof f.valor === "string") f.valor = Number(f.valor);
        if (this.unico) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `esperaba una fila en ${this.tabla}, hay ${rows.length}` } };
        return { data: rows, error: null, count: total };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    }
  }
  return { from: (t: string) => new Consulta(t) };
}

describe("Postgres embebido (PGlite), no Supabase: consolidar una fuente de 371 filas en tandas de 100 contra el esquema del repositorio", () => {
  const EMP = "0000000e-0000-4000-8000-0000000000e1";
  const USR = "0000000a-0000-4000-8000-0000000000a1";
  const FUENTE = "0000000f-0000-4000-8000-0000000000f1";
  const FUENTE_2 = "0000000f-0000-4000-8000-0000000000f2";
  const CONSULTORA = { id: USR, rol: "consultor" as const, email: null, nombre: null };
  let pg: PGlite | undefined;
  let fallo: unknown;

  beforeAll(async () => {
    try {
      pg = (await baseConEsquema()).pg;
      await pg.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)')", [EMP]);
      await pg.query("insert into users (id, nombre, email, rol) values ($1, 'Consultora de prueba', 'consultora@prueba.local', 'consultor')", [USR]);
      await pg.query("insert into sources (id, company_id, tipo, nombre, origen, estado, revision) values ($1, $3, 'dato', 'inventario.xlsx', 'consultor', 'leido', 'pendiente'), ($2, $3, 'documento', 'manual.docx', 'consultor', 'leido', 'pendiente')", [FUENTE, FUENTE_2, EMP]);
      // 250 afirmaciones: la última, contradicha por el contraste. 121 números extraídos: el último, un «sin dato» leído.
      await pg.query("insert into claims (company_id, source_id, texto, pilar, estado) select $1::uuid, $2::uuid, 'Afirmación ' || g, 'procesos', case when g = 250 then 'contradicho' else 'sin_verificar' end from generate_series(1, 250) g", [EMP, FUENTE]);
      await pg.query("insert into company_metricas (company_id, source_id, clave, periodo, valor, estado, origen) select $1::uuid, $2::uuid, 'dato_' || g, 'actual', case when g = 121 then null else g * 10 end, case when g = 121 then 'sin_dato' else 'extraido' end, 'extraido' from generate_series(1, 121) g", [EMP, FUENTE]);
      // Los trabajos de la lectura ya terminada (uno hecho, uno fallido) no impiden revisar.
      await pg.query(`insert into jobs (company_id, tipo, payload, estado) values ($1, 'extraer', $2::jsonb, 'hecho'), ($1, 'extraer', $3::jsonb, 'fallido')`, [EMP, JSON.stringify({ source_id: FUENTE }), JSON.stringify({ source_id: FUENTE, chunk_index: 1, total: 2 })]);
    } catch (e) {
      fallo = e;
    }
  }, 180_000);

  afterAll(async () => {
    await pg?.close();
  });

  function base(): PGlite {
    if (fallo) throw fallo;
    if (!pg) throw new Error("no hay base: beforeAll no la creó");
    return pg;
  }

  it("tres tandas, cada escritura aceptada por los checks y las claves foráneas; la fuente se consolida en la última y no antes", async () => {
    const { tandasDeRevision } = await import("@/components/realidad/RevisarExtraccion");
    estado.base = basePostgres(base()) as unknown as ReturnType<typeof crearBaseFalsa>;
    estado.autoridad = true;
    const claims = (await base().query<{ id: string; texto: string; estado: string }>("select id, texto, estado from claims where source_id = $1 order by created_at, texto", [FUENTE])).rows;
    const metricas = (await base().query<{ id: string; clave: string }>("select id, clave from company_metricas where source_id = $1 order by clave", [FUENTE])).rows;
    const corregida = claims.find((c) => c.texto === "Afirmación 10")!;
    const conMotivo = claims.find((c) => c.texto === "Afirmación 20")!;
    const sinMotivo = claims.find((c) => c.texto === "Afirmación 30")!;
    const contradicha = claims.find((c) => c.estado === "contradicho")!;
    const numCorregido = metricas.find((m) => m.clave === "dato_5")!;
    const numDescartado = metricas.find((m) => m.clave === "dato_6")!;
    const decClaims = claims.map((c) =>
      c.id === corregida.id
        ? { id: c.id, accion: "corregir", texto: "Afirmación 10, corregida por la consultora" }
        : c.id === conMotivo.id || c.id === contradicha.id
          ? { id: c.id, accion: "descartar", texto: "La contradice el inventario contado" }
          : c.id === sinMotivo.id
            ? { id: c.id, accion: "descartar" }
            : { id: c.id, accion: "confirmar" }
    );
    const decMetricas = metricas.map((m) => (m.id === numCorregido.id ? { id: m.id, accion: "corregir", valor: 999.5, nota: "contado a mano" } : m.id === numDescartado.id ? { id: m.id, accion: "descartar" } : { id: m.id, accion: "aceptar" }));
    const tandas = tandasDeRevision(decClaims, decMetricas);
    expect(tandas.map((t) => [t.claims.length, t.metricas.length])).toEqual([[100, 100], [100, 21], [50, 0]]);
    const respuestas: { status: number; body: Fila }[] = [];
    for (let i = 0; i < tandas.length; i++) respuestas.push(await consolidar({ ...tandas[i], cerrar: i === tandas.length - 1 }, FUENTE, CONSULTORA));
    expect(respuestas.map((r) => [r.status, r.body.error ?? null])).toEqual([[200, null], [200, null], [200, null]]);
    expect(respuestas.map((r) => r.body.revision)).toEqual(["pendiente", "pendiente", "consolidada"]);
    expect(respuestas.map((r) => r.body.pendientes)).toEqual([171, 50, 0]);

    const porEstado = async (sql: string) => Object.fromEntries((await base().query<{ k: string; n: number }>(sql, [FUENTE])).rows.map((x) => [x.k, x.n]));
    expect(await porEstado("select estado as k, count(*)::int as n from claims where source_id = $1 group by estado")).toEqual({ confirmado: 247, caducado: 3 });
    expect(await porEstado("select coalesce(comprobacion, 'sin_marca') as k, count(*)::int as n from claims where source_id = $1 group by 1")).toEqual({ sin_marca: 246, comprobado_por_consultor: 1, refutado: 3 });
    expect(await porEstado("select estado || '/' || origen as k, count(*)::int as n from company_metricas where source_id = $1 group by 1")).toEqual({ "verificado/conciliado": 119, "sin_dato/conciliado": 1, "descartado/extraido": 1 });
    // Quién y cuándo, en todas: la clave foránea a users aceptó al revisor.
    const sinFirma = await base().query<{ n: number }>("select count(*)::int as n from claims where source_id = $1 and (validado_por is distinct from $2 or validado_at is null)", [FUENTE, USR]);
    expect(sinFirma.rows[0].n).toBe(0);
    const c10 = (await base().query<Fila>("select texto, comprobacion_nota from claims where id = $1", [corregida.id])).rows[0];
    expect(c10.texto).toBe("Afirmación 10, corregida por la consultora");
    expect(c10.comprobacion_nota).toContain("La lectura decía: «Afirmación 10»");
    const c250 = (await base().query<Fila>("select estado, comprobacion_nota from claims where id = $1", [contradicha.id])).rows[0];
    expect(c250).toMatchObject({ estado: "caducado" });
    expect(c250.comprobacion_nota).toContain("La contradice el inventario contado");
    const m5 = (await base().query<Fila>("select valor::float8 as valor, nota, conciliado_por from company_metricas where id = $1", [numCorregido.id])).rows[0];
    expect(m5).toMatchObject({ valor: 999.5, conciliado_por: USR });
    expect(m5.nota).toContain("la lectura decía 50");
    expect(m5.nota).toContain("contado a mano");
    const m6 = (await base().query<Fila>("select valor, nota from company_metricas where id = $1", [numDescartado.id])).rows[0];
    expect(m6.valor).toBeNull();
    expect(m6.nota.startsWith(NOTA_NUMERO_DESCARTADO)).toBe(true);
    const fuente = (await base().query<Fila>("select revision, revisada_por, revisada_at from sources where id = $1", [FUENTE])).rows[0];
    expect(fuente).toMatchObject({ revision: "consolidada", revisada_por: USR });
    expect(fuente.revisada_at).toBeTruthy();
    // Ya consolidada: no se reconsolida.
    expect((await consolidar({}, FUENTE, CONSULTORA)).status).toBe(409);
  }, 60_000);

  it("con un trabajo de extracción vivo la fuente no se sella (el `payload @>` filtra en Postgres de verdad); cuando termina, sí", async () => {
    estado.base = basePostgres(base()) as unknown as ReturnType<typeof crearBaseFalsa>;
    estado.autoridad = true;
    const job = (await base().query<{ id: string }>("insert into jobs (company_id, tipo, payload, estado) values ($1, 'extraer', $2::jsonb, 'corriendo') returning id", [EMP, JSON.stringify({ source_id: FUENTE_2, chunk_index: 0, total: 3 })])).rows[0].id;
    const enCurso = await consolidar({}, FUENTE_2, CONSULTORA);
    expect(enCurso.status).toBe(409);
    expect(enCurso.body.error).toMatch(/todavía no terminó de leerse/);
    expect((await base().query<Fila>("select revision, revisada_por from sources where id = $1", [FUENTE_2])).rows[0]).toEqual({ revision: "pendiente", revisada_por: null });
    await base().query("update jobs set estado = 'hecho' where id = $1", [job]);
    const terminada = await consolidar({}, FUENTE_2, CONSULTORA);
    expect(terminada.status).toBe(200);
    expect(terminada.body).toMatchObject({ revision: "consolidada", pendientes: 0 });
    expect((await base().query<Fila>("select revision, revisada_por from sources where id = $1", [FUENTE_2])).rows[0]).toEqual({ revision: "consolidada", revisada_por: USR });
  }, 60_000);
});

// ─────────────────────── La fidelidad se rotula igual en servidor y en cliente ───────────────────────

describe("El rótulo de fidelidad vive en un módulo sin «use client» y la página lo lee de ahí", () => {
  it("rotuloFidelidad y citaDe: en palabras, y null cuando la fuente no tiene fidelidad", () => {
    expect(rotuloFidelidad("alta")).toEqual({ texto: "Lectura fiel", color: "var(--confirmado)" });
    expect(rotuloFidelidad("no_analizado")?.texto).toBe("No analizado");
    expect(rotuloFidelidad(null)).toBeNull();
    expect(rotuloFidelidad("")).toBeNull();
    expect(rotuloFidelidad("algo_raro")?.texto).toBe("Fidelidad sin registrar");
    expect(Object.keys(FIDELIDAD_TEXTO).sort()).toEqual(["alta", "baja", "media", "no_analizado"]);
    expect(citaDe({ texto: null, pagina: 3, seccion: "párrafo 14 · Vendedora — Carmen Huamán", celda: null })).toBe("página 3 · párrafo 14 · Vendedora — Carmen Huamán");
    expect(citaDe({ texto: "x", pagina: null, seccion: "Inventario", celda: "Inventario!F3" })).toBe("Inventario · Inventario!F3");
    expect(citaDe({ texto: "x", pagina: null, seccion: null, celda: null })).toBe("sin ubicación en el documento");
    expect(citaDe(null)).toBe("sin fragmento citado");
  });

  it("guardia: de un módulo «use client» la página de servidor solo importa el componente y tipos; los valores salen de @/lib/documentos/fidelidad", () => {
    // En la compilación de servidor de Next, cada export de un módulo "use client" se sustituye por una
    // referencia opaca: un objeto importado de ahí llega vacío y FIDELIDAD_TEXTO["alta"] era undefined.
    // tsc no lo ve (los tipos son los mismos), así que se vigila aquí el texto de los imports.
    const pagina = readFileSync(path.resolve(__dirname, "../src/app/(consultor)/empresa/[id]/fuentes/page.tsx"), "utf8");
    const comp = readFileSync(path.resolve(__dirname, "../src/components/realidad/RevisarExtraccion.tsx"), "utf8");
    const fidelidad = readFileSync(path.resolve(__dirname, "../src/lib/documentos/fidelidad.ts"), "utf8");
    expect(comp.trimStart().startsWith('"use client"')).toBe(true);
    // La directiva es una línea sola al principio; el comentario del módulo puede nombrarla para explicar por qué no la lleva.
    expect(fidelidad).not.toMatch(/^\s*["']use client["'];?\s*$/m);
    const importDelComponente = pagina.match(/import \{([^}]*)\} from "@\/components\/realidad\/RevisarExtraccion"/);
    expect(importDelComponente).not.toBeNull();
    const nombres = importDelComponente![1].split(",").map((x) => x.trim()).filter(Boolean);
    const valores = nombres.filter((n) => !n.startsWith("type "));
    expect(valores).toEqual(["RevisarExtraccion"]);
    expect(pagina).toMatch(/from "@\/lib\/documentos\/fidelidad"/);
    expect(pagina).not.toMatch(/FIDELIDAD_TEXTO/);
  });

  it("el componente renderizado en servidor muestra «Lectura fiel», la cita de la celda y el texto honesto", async () => {
    const { RevisarExtraccion } = await import("@/components/realidad/RevisarExtraccion");
    const html = renderToStaticMarkup(
      createElement(RevisarExtraccion, {
        sourceId: SRC,
        nombre: "ventas-e-inventario.xlsx",
        fidelidad: "alta",
        fidelidadNota: "Excel leído celda por celda (3 hoja(s) con datos).",
        claims: [
          { id: C1, texto: "Hay 40 artículos sin costo", tipo: "hecho", pilar: "finanzas", estado: "sin_verificar", fragmento: { texto: "F4 costo_unitario=(vacío)", pagina: null, seccion: "Inventario", celda: "Inventario!F4" } },
          { id: C2, texto: "Instagram trae gente nueva", tipo: "canal", pilar: "marketing", estado: "contradicho", fragmento: null },
        ],
        metricas: [
          { id: M1, clave: "venta_mes", periodo: "2026-09", valor: 86900, valor_texto: null, nota: null },
          { id: M2, clave: "costo_variable_mes", periodo: "actual", valor: 54700, valor_texto: null, nota: null },
          { id: M3, clave: "merma_mes", periodo: "epoca_dorada", valor: 300, valor_texto: null, nota: null },
        ],
      })
    );
    expect(html).toContain("Lectura fiel");
    expect(html).toContain("Revisa lo que leímos antes de que cuente");
    expect(html).toContain("Inventario · Inventario!F4");
    expect(html).toContain("extraído, pendiente de conciliar");
    expect(html).not.toContain("Nada de esto entra");
    // Cinco filas sin decidir: el botón de consolidar nace deshabilitado, y no hay atajo para marcar el resto.
    expect(html).toMatch(/5 fila\(s\) sin decidir/);
    expect(html).not.toMatch(/Marcar el resto/);
    // Nombres para personas, no claves del sistema: vitales y reconocidas por su nombre, lo propio de la empresa con espacios.
    expect(html).toContain("Ventas del mes");
    expect(html).toContain("Costos variables del mes");
    expect(html).toContain("merma mes");
    expect(html).toContain("Setiembre 2026");
    expect(html).toContain("Su mejor época");
    expect(html).toContain("Marketing");
    expect(html).toContain("Canal de venta");
    expect(html).toContain("Contradicho");
    for (const clave of ["venta_mes", "costo_variable_mes", "merma_mes", "2026-09", "epoca_dorada", ">canal<", ">marketing<", "contradicho"]) expect(html).not.toContain(clave);
  });

  it("qué fila ya tiene decisión: la misma regla para la ruta y para la pantalla", () => {
    expect(afirmacionYaDecidida("confirmado")).toBe(true);
    expect(afirmacionYaDecidida("caducado")).toBe(true);
    for (const e of ["sin_verificar", "contradicho", null, undefined, ""]) expect(afirmacionYaDecidida(e)).toBe(false);
    // Un número leído: decidido si se descartó o si dejó de ser «extraido».
    expect(numeroYaDecidido({ estado: "descartado", origen: "extraido" })).toBe(true);
    expect(numeroYaDecidido({ estado: "verificado", origen: "conciliado" })).toBe(true);
    expect(numeroYaDecidido({ estado: "extraido", origen: "extraido" })).toBe(false);
    // Un «sin dato» leído NO está decidido: no tiene valor, pero nadie lo miró.
    expect(numeroYaDecidido({ estado: "sin_dato", origen: "extraido", valor: null, nota: null })).toBe(false);
    expect(numeroYaDecidido({ valor: null, nota: "el documento no trae la cifra" })).toBe(false);
    // Sin estado a la vista (así llega hoy a la pantalla), el descartado se reconoce por la nota que le deja la ruta.
    expect(numeroYaDecidido({ valor: null, nota: `${NOTA_NUMERO_DESCARTADO} (la lectura decía 61).` })).toBe(true);
    expect(numeroYaDecidido({ valor: 61, nota: `${NOTA_NUMERO_DESCARTADO} (la lectura decía 61).` })).toBe(false);
  });

  it("la pantalla no vuelve a pedir lo ya decidido: lo cuenta en una línea y solo deja por decidir lo que falta", async () => {
    const { RevisarExtraccion } = await import("@/components/realidad/RevisarExtraccion");
    const html = renderToStaticMarkup(
      createElement(RevisarExtraccion, {
        sourceId: SRC,
        nombre: "ventas-e-inventario.xlsx",
        fidelidad: "alta",
        fidelidadNota: null,
        claims: [
          { id: C1, texto: "Rosa fija los precios de las ofertas", tipo: "precio", pilar: "producto", estado: "confirmado", fragmento: null },
          { id: C2, texto: "Hay un manual de caja", tipo: "proceso", pilar: "procesos", estado: "caducado", fragmento: null },
          { id: C3, texto: "La tienda abre de lunes a sábado", tipo: "politica", pilar: "procesos", estado: "sin_verificar", fragmento: null },
        ],
        metricas: [
          { id: M1, clave: "venta_mes", periodo: "2026-09", valor: 86900, valor_texto: null, nota: null },
          { id: M2, clave: "gasto_fijo_mes", periodo: "2026-09", valor: null, valor_texto: null, nota: `${NOTA_NUMERO_DESCARTADO} (la lectura decía 16495).` },
          { id: M3, clave: "costo_producto_estrella", periodo: "actual", valor: null, valor_texto: null, nota: "otra nota", estado: "descartado" },
        ],
      })
    );
    // Quedan una afirmación y un número; las cuatro filas resueltas no aparecen como filas por decidir.
    expect(html).toMatch(/2 fila\(s\) sin decidir/);
    expect(html).toContain("4 fila(s) ya tienen decisión de una revisión anterior");
    expect(html).toContain("Afirmaciones (1)");
    expect(html).toContain("Números (1)");
    expect(html).toContain("La tienda abre de lunes a sábado");
    expect(html).not.toContain("Rosa fija los precios");
    expect(html).not.toContain("Hay un manual de caja");
    expect(html).not.toContain("la lectura decía 16495");

    // Todo decidido antes: no promete «la lectura no encontró nada»; dice que no queda nada y deja consolidar.
    const cerrado = renderToStaticMarkup(
      createElement(RevisarExtraccion, {
        sourceId: SRC, nombre: "x.docx", fidelidad: "alta", fidelidadNota: null,
        claims: [{ id: C1, texto: "Ya confirmada", tipo: null, pilar: null, estado: "confirmado", fragmento: null }],
        metricas: [],
      })
    );
    expect(cerrado).toContain("No queda nada por decidir");
    expect(cerrado).not.toContain("no encontró afirmaciones ni números");
    expect(cerrado).not.toMatch(/fila\(s\) sin decidir/);
    // Sin nada leído ni decidido: consolidar deja constancia (la ruta lo acepta: ver la prueba del cuerpo vacío), pero la
    // pantalla no afirma que la lectura «no encontró nada» sin saber si terminó: lo dice en condicional.
    const vacio = renderToStaticMarkup(createElement(RevisarExtraccion, { sourceId: SRC, nombre: "x.docx", fidelidad: "alta", fidelidadNota: null, claims: [], metricas: [] }));
    expect(vacio).toContain("No hay afirmaciones ni números por decidir");
    expect(vacio).toContain("Si la lectura ya terminó y no encontró nada, consolida para dejar constancia");
    expect(vacio).not.toMatch(/<button[^>]*disabled/);
    // Cuando la página sabe que la fuente se está leyendo, se dice y el botón no se ofrece.
    const leyendo = renderToStaticMarkup(createElement(RevisarExtraccion, { sourceId: SRC, nombre: "x.docx", fidelidad: "alta", fidelidadNota: null, claims: [], metricas: [], leyendo: true }));
    expect(leyendo).toContain("Esta fuente todavía se está leyendo");
    expect(leyendo).not.toContain("consolida para dejar constancia");
    expect(leyendo).toMatch(/<button[^>]*disabled[^>]*>Consolidar/);
  });

  it("una fuente grande se consolida en tandas que la ruta acepta; una lectura sin nada es una sola llamada vacía", async () => {
    const { tandasDeRevision, FILAS_POR_TANDA } = await import("@/components/realidad/RevisarExtraccion");
    const ruta = readFileSync(path.resolve(__dirname, "../src/app/api/sources/[id]/consolidar/route.ts"), "utf8");
    // El tope de la ruta está escrito en su esquema: la tanda de la pantalla tiene que caber.
    const topes = [...ruta.matchAll(/\.max\((\d+)\)\s*\.default\(\[\]\)/g)].map((m) => Number(m[1]));
    expect(topes).toHaveLength(2);
    for (const tope of topes) expect(FILAS_POR_TANDA).toBeLessThanOrEqual(tope);
    const afirmaciones = Array.from({ length: 950 }, (_, i) => `c${i}`);
    const numeros = ["m0", "m1", "m2"];
    const tandas = tandasDeRevision(afirmaciones, numeros);
    expect(FILAS_POR_TANDA).toBe(100);
    expect(tandas.map((t) => [t.claims.length, t.metricas.length])).toEqual([[100, 3], ...Array.from({ length: 8 }, () => [100, 0]), [50, 0]]);
    // Nada se pierde ni se repite al partir.
    expect(tandas.flatMap((t) => t.claims)).toEqual(afirmaciones);
    expect(tandas.flatMap((t) => t.metricas)).toEqual(numeros);
    expect(tandasDeRevision([], [])).toEqual([{ claims: [], metricas: [] }]);
    expect(tandasDeRevision(["a"], ["x", "y", "z"], 2)).toEqual([{ claims: ["a"], metricas: ["x", "y"] }, { claims: [], metricas: ["z"] }]);
  });

  it("la página de fuentes, renderizada con una base falsa, rotula la columna «Lectura» de cada fuente", async () => {
    estado.base = crearBaseFalsa({
      sources: [
        { id: SRC, company_id: "E", tipo: "dato", nombre: "ventas-e-inventario.xlsx", fecha_origen: "2026-09-30", origen: "consultor", estado: "leido", error: null, created_at: "2026-10-13T10:00:00.000Z", fidelidad_extraccion: "alta", fidelidad_nota: "Excel leído celda por celda (3 hoja(s) con datos).", revision: "pendiente" },
        { id: OTRA, company_id: "E", tipo: "documento", nombre: "manual-viejo.doc", fecha_origen: null, origen: "cliente", estado: "leido", error: null, created_at: "2026-10-13T09:00:00.000Z", fidelidad_extraccion: "no_analizado", fidelidad_nota: "Es un Word del formato antiguo (.doc) y no sabemos leerlo.", revision: null },
        { id: "33333333-3333-4333-8333-333333333333", company_id: "E", tipo: "audio", nombre: "nota.ogg", fecha_origen: "2026-10-01", origen: "cliente", estado: "leido", error: null, created_at: "2026-10-13T08:00:00.000Z", fidelidad_extraccion: null, fidelidad_nota: null, revision: null },
      ],
      jobs: [],
      claims: [{ id: C1, source_id: SRC, texto: "Hay 40 artículos sin costo", tipo: "hecho", pilar: "finanzas", estado: "sin_verificar", fragmento: null, created_at: "2026-10-13" }],
      company_metricas: [{ id: M1, company_id: "E", source_id: SRC, clave: "venta_mes", periodo: "2026-09", valor: 86900, valor_texto: null, nota: null, estado: "extraido", origen: "extraido" }],
    });
    const { default: Fuentes } = await import("@/app/(consultor)/empresa/[id]/fuentes/page");
    const html = renderToStaticMarkup(await Fuentes({ params: Promise.resolve({ id: "E" }) }));
    // Antes del arreglo esta columna decía «—» para TODAS las fuentes, también para las que tenían fidelidad.
    expect(html).toContain("Lectura fiel");
    expect(html).toContain("No analizado");
    expect(html).toContain("Es un Word del formato antiguo (.doc) y no sabemos leerlo.");
    expect((html.match(/Lectura fiel/g) ?? []).length).toBeGreaterThanOrEqual(2); // en la tabla y en el panel de revisión
    expect(html).toContain("por revisar");
    expect(html).toContain("Por revisar (1)");
    expect(html).toContain("Hay 40 artículos sin costo");
    expect(html).not.toContain("no cuenta en el diagnóstico");
    // La nota de voz no tiene fidelidad: «—», no «Fidelidad sin registrar».
    expect(html).toContain("—");
    expect(html).not.toContain("Fidelidad sin registrar");
  });
});

// ─────────────────────── Reextraer un Word o un Excel vuelve al archivo ───────────────────────

describe("Reextraer: Word y Excel se releen del archivo; audio, texto y CSV reutilizan su contenido", () => {
  it("releerDelArchivo", () => {
    expect(releerDelArchivo(MIME_WORD, "texto plano guardado la primera vez", "fuentes/x.docx")).toBe(true);
    expect(releerDelArchivo(MIME_EXCEL, "Hoja «Inventario» · 121 fila(s)…", "fuentes/x.xlsx")).toBe(true);
    expect(releerDelArchivo("application/pdf", null, "fuentes/x.pdf")).toBe(true);
    expect(releerDelArchivo("audio/webm", "transcripción ya hecha", "fuentes/x.webm")).toBe(false);
    expect(releerDelArchivo("text/csv", "a,b\n1,2", "fuentes/x.csv")).toBe(false);
    expect(releerDelArchivo("text/plain", null, "fuentes/x.txt")).toBe(true);
    // Sin archivo no hay de dónde releer: texto pegado.
    expect(releerDelArchivo(MIME_WORD, "texto pegado", null)).toBe(false);
  });
  it("el handler usa releerDelArchivo y no la condición vieja «!texto && storage_path»", () => {
    const src = readFileSync(path.resolve(__dirname, "../src/lib/jobs/handlers/extraer.ts"), "utf8");
    expect(src).toMatch(/if \(releerDelArchivo\(mime, texto, src\.storage_path/);
    expect(src).not.toMatch(/if \(!texto && src\.storage_path\)/);
  });
});

// ─────────────────────── Avisos en castellano; el detalle técnico fuera de la pantalla ───────────────────────

describe("Lo que el consultor lee en «Cómo se leyó» está en castellano y resumido; el mensaje crudo va al trabajo", () => {
  it("resumirAvisos agrupa los mensajes de mammoth y los dice en palabras", () => {
    const r = resumirAvisos([
      "warning: Unrecognised paragraph style: 'Cita' (Style ID: Quote)",
      "warning: Unrecognised paragraph style: 'Cita' (Style ID: Quote)",
      "warning: Unrecognised paragraph style: 'Encabezado de tabla' (Style ID: TableHead)",
      "warning: Unrecognised run style: 'Énfasis' (Style ID: Emphasis)",
      "warning: An unrecognised element was ignored: w:sdt",
      "warning: A v:imagedata element without a relationship ID was ignored",
      "error: algo que no sabemos clasificar",
    ]);
    expect(r).toContain("3 párrafo(s) con un estilo que no reconocemos (Cita, Encabezado de tabla)");
    expect(r).toContain("1 trozo(s) de texto con formato que no reconocemos (Énfasis)");
    expect(r).toContain("1 elemento(s) del Word que no sabemos leer se omitieron (w:sdt)");
    expect(r).toContain("1 imagen(es) omitida(s)");
    expect(r).toContain("1 aviso(s) técnico(s) más");
    expect(r).not.toMatch(/Unrecognised|ignored|warning/);
    expect(resumirAvisos([])).toBe("");
  });
  it("resumirAvisosExcel cuenta por hoja y nombra las primeras celdas", () => {
    const r = resumirAvisosExcel([
      "Ventas: Celda B9 tiene una fórmula sin resultado guardado: se dejó vacía, no se recalculó.",
      "Ventas: Celda B10 tiene una fórmula sin resultado guardado: se dejó vacía, no se recalculó.",
      "Ventas: Celda C1 con error #DIV/0!: se dejó vacía.",
      "Notas: La hoja está vacía.",
    ]);
    expect(r).toContain("Ventas: 2 celda(s) con fórmula sin resultado guardado (B9, B10), tomadas como vacías; 1 celda(s) con error de Excel (C1), tomadas como vacías");
    expect(r).toContain("Notas: hoja vacía");
    expect(resumirAvisosExcel([])).toBe("");
  });
  it("un .docx dañado: la nota dice qué hacer sin el mensaje de la librería; el detalle técnico va aparte", async () => {
    const roto = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("esto no es un zip de verdad ".repeat(8))]);
    const w = await detectarYLeer(MIME_WORD, roto);
    expect(w.clase).toBe("no_analizado");
    expect(w.nota).toMatch(/No pudimos abrir ese Word|no tiene texto legible/);
    expect(w.nota).not.toMatch(/Error|zip|undefined|at /);
    if (w.clase === "no_analizado" && w.nota.startsWith("No pudimos abrir")) expect(w.detalle).toBeTruthy();
    const x = await detectarYLeer(MIME_EXCEL, roto);
    expect(x.clase).toBe("no_analizado");
    expect(x.nota).toMatch(/No pudimos abrir ese Excel|no tiene filas/);
    expect(x.nota).not.toMatch(/Error|zip|undefined|at /);
  });
  it("un PDF que no se puede abrir: la nota dice «porque no pudimos abrirlo» y el motivo de pdf-lib queda en detalle", async () => {
    const r = await detectarYLeer("application/pdf", Buffer.from("esto no es un pdf ni de lejos, solo texto"));
    expect(r.clase).toBe("no_analizado");
    expect(r.nota).toContain("porque no pudimos abrirlo");
    expect(r.nota).not.toMatch(/Failed|header|offset/i);
    if (r.clase === "no_analizado") expect(typeof r.detalle).toBe("string");
  });
  it("traducirAvisosLectura: cada clase de aviso de mammoth es una frase corta en castellano, sin repetir y sin el mensaje crudo", () => {
    const frases = traducirAvisosLectura([
      "warning: Unrecognised paragraph style: 'Cita' (Style ID: Quote)",
      "warning: Unrecognised paragraph style: 'Encabezado de tabla' (Style ID: TableHead)",
      "warning: Unrecognised run style: 'Énfasis' (Style ID: Emphasis)",
      "warning: Paragraph style with ID Quote was referenced but not defined in the document",
      "warning: An unrecognised element was ignored: w:sdt",
      "warning: A w:sym element with an unsupported character was ignored: char F0B7 in font Symbol",
      "warning: A v:imagedata element without a relationship ID was ignored",
      "warning: footnote reference without id was ignored",
      "error: algo que no sabemos clasificar",
    ]);
    expect(frases).toEqual([AVISO_LECTURA.estilos, AVISO_LECTURA.elementos, AVISO_LECTURA.imagenes, AVISO_LECTURA.notas, AVISO_LECTURA.otro]);
    expect(AVISO_LECTURA.estilos).toBe("algunos estilos del Word no se reconocieron; el texto se leyó igual");
    for (const f of frases) expect(f).not.toMatch(PATRON_MENSAJE_CRUDO);
    expect(traducirAvisosLectura([])).toEqual([]);
  });
  it("un Word con un estilo que mammoth no reconoce: la nota del consultor dice «algunos estilos del Word no se reconocieron; el texto se leyó igual», nunca el mensaje en inglés", async () => {
    // Un .docx mínimo armado aquí: un párrafo con el estilo «Cita» (Style ID Quote), que no está en el mapa de mammoth.
    const zip = new JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Cita"/></w:style></w:styles>`);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Manual de caja</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr><w:r><w:t>La caja se cierra a las 8 de la noche.</w:t></w:r></w:p></w:body></w:document>`);
    const docx = await zip.generateAsync({ type: "nodebuffer" });
    const w = await leerWord(docx);
    expect(w.avisos.some((a) => /Unrecognised paragraph style: 'Cita'/.test(a))).toBe(true); // el crudo sigue ahí, para el trabajo
    expect(w.fidelidad).toBe("media");
    const r = await detectarYLeer(MIME_WORD, docx);
    expect(r).toMatchObject({ clase: "word", fidelidad: "media" });
    expect(r.nota).toContain("Word leído con avisos (2 párrafos): algunos estilos del Word no se reconocieron; el texto se leyó igual.");
    expect(r.nota).not.toMatch(PATRON_MENSAJE_CRUDO);
    expect(r.nota).not.toMatch(/Cita|Quote/); // ni siquiera el nombre del estilo: el consultor no tiene que saber qué es un estilo de Word
  });
  it("ninguna nota de fidelidad, de ninguna clase de lectura, lleva un mensaje crudo de librería", async () => {
    const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const roto = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("esto no es un zip de verdad ".repeat(8))]);
    const vacio = await PDFDocument.create();
    vacio.addPage();
    const lecturas = await Promise.all([
      detectarYLeer(MIME_WORD, LUCERO("funciones-del-personal.docx")),
      detectarYLeer(MIME_EXCEL, LUCERO("ventas-e-inventario.xlsx")),
      detectarYLeer("application/pdf", LUCERO("contrato-alquiler.pdf")),
      detectarYLeer("application/pdf", Buffer.from(await vacio.save())),
      detectarYLeer("application/pdf", Buffer.from("no es pdf")),
      detectarYLeer(MIME_WORD, roto),
      detectarYLeer(MIME_EXCEL, roto),
      detectarYLeer(MIME_WORD_ANTIGUO, OLE),
      detectarYLeer(MIME_EXCEL_ANTIGUO, Buffer.from("a,b\n1,2")),
      detectarYLeer("application/zip", Buffer.from("PK\u0003\u0004xxxxxxxx")),
    ]);
    for (const l of lecturas) expect(l.nota, l.nota).not.toMatch(PATRON_MENSAJE_CRUDO);
  });
  it("un Excel con una fórmula sin resultado y una celda con error: la nota lo cuenta en castellano, con la celda, y la lectura baja a «con avisos»", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Ventas");
    ws.addRow(["mes", "ventas", "margen"]);
    ws.addRow(["2026-04", 74200, 0.31]);
    ws.addRow(["2026-05", 77000, 0.29]);
    ws.getCell("B4").value = { formula: "SUM(B2:B3)" } as ExcelJS.CellValue; // fórmula sin resultado guardado
    ws.getCell("A4").value = "2026-06";
    ws.getCell("C4").value = { error: "#DIV/0!" } as ExcelJS.CellValue;
    const r = await detectarYLeer(MIME_EXCEL, Buffer.from(await wb.xlsx.writeBuffer()));
    expect(r).toMatchObject({ clase: "excel", fidelidad: "media" });
    expect(r.nota).toMatch(/^Excel leído con avisos/);
    expect(r.nota).toContain("1 celda(s) con fórmula sin resultado guardado (B4), tomadas como vacías");
    expect(r.nota).toContain("1 celda(s) con error de Excel (C4), tomadas como vacías");
    // Las dos celdas cuentan como vacías, no como cero.
    expect(r.nota).toContain("ventas (B): 1 vacía de 3");
    expect(r.nota).not.toMatch(PATRON_MENSAJE_CRUDO);
  });
});

// ─────────────────────── Cierre Z4 · el documento se lee entero o se dice qué parte falta ───────────────────────

const M4 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";
const M5 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5";
const S3 = "33333333-3333-4333-8333-333333333333";
const S4 = "44444444-4444-4444-8444-444444444444";
const S5 = "55555555-5555-4555-8555-555555555555";

async function reextraer(id = SRC) {
  const { POST } = await import("@/app/api/sources/[id]/extract/route");
  const handler = POST as unknown as (perfil: typeof PERFIL, req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<{ status: number; body: Fila }>;
  return handler(PERFIL, new Request(`http://local/api/sources/${id}/extract`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

/**
 * La fuente SRC ya leída y pendiente, con todo lo que una reextracción tiene que respetar: tres afirmaciones, un número
 * leído que guarda al lado la cifra que declaró el dueño (M1), uno leído sin cifra (M2), uno que el consultor descartó
 * (M3), uno que ya concilió (M4) y uno de otra fuente (M5).
 */
function tablasParaReextraer(): Record<string, Fila[]> {
  const t = baseConFuente().tablas;
  Object.assign(t.sources.find((x) => x.id === SRC)!, { origen: "consultor", fidelidad_extraccion: "alta", fidelidad_nota: "Excel leído celda por celda (3 hoja(s) con datos)." });
  t.source_fragments = [{ id: "f1", source_id: SRC }, { id: "f2", source_id: OTRA }];
  t.claims_archivo = [];
  t.jobs.push({ id: "j-viejo", company_id: "E", tipo: "extraer", payload: { source_id: SRC }, estado: "hecho" });
  const m = (id: string) => t.company_metricas.find((x) => x.id === id)!;
  Object.assign(m(M1), { nota: null, cifra_desplazada: { lado: "declarado", valor: 80000, valor_texto: "unos 80 mil", nota: null, response_id: "R1", source_id: null } });
  Object.assign(m(M2), { valor: null, estado: "sin_dato", nota: "la hoja Gastos no trae el total" });
  Object.assign(m(M3), { valor: null, estado: "descartado", nota: `${NOTA_NUMERO_DESCARTADO} (la lectura decía 61).` });
  t.company_metricas.push(
    { id: M4, company_id: "E", source_id: SRC, clave: "clientes_mes", periodo: "2026-09", valor: 410, estado: "verificado", origen: "conciliado", conciliado_por: "u-consultor", nota: null },
    { id: M5, company_id: "E", source_id: OTRA, clave: "ticket_promedio", periodo: "2026-09", valor: 212, estado: "extraido", origen: "extraido", nota: null }
  );
  return t;
}

describe("Cierre Z4 · POST /api/sources/[id]/extract: reextraer archiva también los números leídos y saca la fuente de revisión", () => {
  // La cola, al encolar, puede avisar al trabajador por la red; aquí no hay red que valga.
  beforeAll(() => { vi.stubEnv("WORKER_LOCAL", "1"); });
  afterAll(() => { vi.unstubAllEnvs(); });

  it("archiva afirmaciones y números leídos en el mismo bloque, no toca los conciliados, marca los que quedan y la fuente deja de estar «por revisar»", async () => {
    estado.base = crearBaseFalsa(tablasParaReextraer());
    estado.autoridad = true;
    const t = estado.base.tablas;
    const m = (id: string) => t.company_metricas.find((x) => x.id === id)!;
    const descartadoAntes = JSON.stringify(m(M3));
    const conciliadoAntes = JSON.stringify(m(M4));
    const otraFuenteAntes = JSON.stringify(m(M5));

    const r = await reextraer();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version_archivada: 1, afirmaciones_archivadas: 3, numeros_archivados: 3, numeros_conciliados_intactos: 1 });
    // «Los conciliados no se tocan y se dice»: la respuesta lo trae en palabras, con su cuenta.
    expect(r.body.mensaje).toBe("Se archivaron 3 afirmación(es) y 3 número(s) leído(s) como versión 1. La fuente salió de revisión hasta que termine la nueva lectura. 1 número(s) que ya habías conciliado no se tocaron: siguen como los dejaste.");

    // El archivo: una sola fila. Las afirmaciones, tal cual; los números, marcados para que nadie los tome por afirmaciones.
    expect(t.claims_archivo).toHaveLength(1);
    expect(t.claims_archivo[0]).toMatchObject({ source_id: SRC, company_id: "E", version: 1, motivo: "reextraccion", archivado_por: "u-consultor" });
    const bloque = t.claims_archivo[0].claims as Fila[];
    expect(bloque.filter((x) => !x.archivo_de).map((x) => x.id).sort()).toEqual([C1, C2, C3]);
    const numeros = bloque.filter((x) => x.archivo_de === "company_metricas");
    expect(numeros.map((x) => x.id).sort()).toEqual([M1, M2, M3]); // ni el conciliado (M4) ni el de otra fuente (M5)
    // Se archivan como ESTABAN: con su valor, su nota de entonces y la cifra declarada que guardaban al lado.
    expect(numeros.find((x) => x.id === M1)).toMatchObject({ valor: 86900, estado: "extraido", origen: "extraido", nota: null, cifra_desplazada: { lado: "declarado", valor: 80000 } });
    expect(numeros.find((x) => x.id === M2)).toMatchObject({ valor: null, estado: "sin_dato", nota: "la hoja Gastos no trae el total" });

    // De los números no se borra ninguno: borrar la fila de M1 se llevaría los «unos 80 mil» que declaró el dueño.
    expect(t.company_metricas.map((x) => x.id).sort()).toEqual([M1, M2, M3, M4, M5]);
    expect(m(M1)).toMatchObject({ valor: 86900, estado: "extraido", origen: "extraido", cifra_desplazada: { lado: "declarado", valor: 80000, valor_texto: "unos 80 mil" } });
    // Los que nadie decidió quedan marcados como de la lectura anterior; la nota que tenían sigue detrás.
    expect(m(M1).nota).toBe(`${NOTA_LECTURA_ANTERIOR} (archivada como versión 1): la nueva lectura todavía no trajo este número.`);
    expect(m(M2).nota).toBe(`${NOTA_LECTURA_ANTERIOR} (archivada como versión 1): la nueva lectura todavía no trajo este número. la hoja Gastos no trae el total`);
    // La marca no los da por decididos: siguen esperando a quien revise.
    expect(numeroYaDecidido(m(M1))).toBe(false);
    expect(numeroYaDecidido({ valor: m(M2).valor, nota: m(M2).nota })).toBe(false);
    // El descartado (decisión del consultor), el conciliado y el de otra fuente quedan EXACTAMENTE como estaban.
    expect(JSON.stringify(m(M3))).toBe(descartadoAntes);
    expect(JSON.stringify(m(M4))).toBe(conciliadoAntes);
    expect(JSON.stringify(m(M5))).toBe(otraFuenteAntes);

    // La fuente sale de revisión; la otra fuente sigue como estaba. Afirmaciones y fragmentos, solo los de ESTA fuente.
    expect(t.sources.find((x) => x.id === SRC)).toMatchObject({ revision: null });
    expect(t.sources.find((x) => x.id === OTRA)).toMatchObject({ revision: "pendiente" });
    expect(t.claims.map((c) => c.id)).toEqual([CX]);
    expect(t.source_fragments.map((f) => f.id)).toEqual(["f2"]);
    expect(t.jobs.find((j) => j.id === "j-viejo")).toBeUndefined();
    const nuevos = t.jobs.filter((j) => j.tipo === "extraer");
    expect(nuevos).toHaveLength(1);
    expect(nuevos[0]).toMatchObject({ company_id: "E", payload: { source_id: SRC } });
    expect(r.body.job_id).toBe(nuevos[0].id);

    // Mientras la nueva lectura no termine, consolidar dice que la fuente todavía se lee, no que «no espera revisión».
    nuevos[0].estado = "pendiente"; // en la base lo pone el valor por defecto de la columna
    const enCurso = await consolidar({});
    expect(enCurso.status).toBe(409);
    expect(enCurso.body.error).toMatch(/todavía no terminó de leerse/);
    expect(enCurso.body.error).not.toMatch(/no está esperando revisión/);

    // La nueva lectura vuelve a traer las ventas: la fila se reescribe, la marca desaparece y lo declarado sigue al lado.
    await guardarMetricas(estado.base as never, "E", [{ clave: "venta_mes", periodo: "2026-09", valor: 88100, estado: "verificado", nota: "Ventas!D8" }], { source_id: SRC, origen: "extraido" });
    expect(m(M1)).toMatchObject({ valor: 88100, estado: "extraido", origen: "extraido", nota: "Ventas!D8", cifra_desplazada: { lado: "declarado", valor: 80000 } });
    // El que la nueva lectura no trajo conserva la marca: quien revise sabrá que no salió de la lectura que tiene delante.
    expect(String(m(M2).nota).startsWith(NOTA_LECTURA_ANTERIOR)).toBe(true);
  });

  it("si no se puede consultar el archivo o leer los números anteriores, no se borra ni se marca nada y la fuente sigue en revisión", async () => {
    const casos: [string, RegExp][] = [
      ["claims_archivo", /No se pudo consultar el archivo de afirmaciones/],
      ["company_metricas", /No se pudieron leer los números que dejó la lectura anterior, así que no se borra nada/],
    ];
    for (const [tabla, motivo] of casos) {
      estado.base = crearBaseFalsa(tablasParaReextraer(), { [tabla]: "permiso denegado" });
      const antes = JSON.stringify(estado.base.tablas);
      const r = await reextraer();
      expect(r.status, tabla).toBe(500);
      expect(r.body.error, tabla).toMatch(motivo);
      expect(JSON.stringify(estado.base.tablas), tabla).toBe(antes);
      expect(estado.base.registro.escrituras, tabla).toBe(0);
    }
  });

  it("volver a reextraer no apila marcas; y una fuente sin nada leído no archiva nada, pero igual sale de revisión", async () => {
    estado.base = crearBaseFalsa(tablasParaReextraer());
    const t = estado.base.tablas;
    await reextraer();
    const segunda = await reextraer();
    expect(segunda.status).toBe(200);
    expect(segunda.body).toMatchObject({ version_archivada: 2, afirmaciones_archivadas: 0, numeros_archivados: 3, numeros_conciliados_intactos: 1 });
    expect(t.claims_archivo.map((a) => a.version)).toEqual([1, 2]);
    const nota = String(t.company_metricas.find((x) => x.id === M2)!.nota);
    expect(nota.split(NOTA_LECTURA_ANTERIOR).length - 1).toBe(1);
    expect(nota).toContain("versión 1"); // la marca dice de qué lectura viene el número, no cuál fue la última petición

    // Una fuente ya consolidada, sin afirmaciones ni números: no hay nada que archivar, y deja de figurar como revisada mientras se relee.
    estado.base = crearBaseFalsa({ sources: [{ id: SRC, company_id: "E", tipo: "documento", origen: "consultor", estado: "leido", revision: "consolidada", revisada_por: "u-otro" }], claims: [], company_metricas: [], claims_archivo: [], source_fragments: [], jobs: [] });
    const vacia = await reextraer();
    expect(vacia.status).toBe(200);
    expect(vacia.body).toMatchObject({ version_archivada: null, afirmaciones_archivadas: 0, numeros_archivados: 0, numeros_conciliados_intactos: 0 });
    expect(vacia.body.mensaje).toBe("No había afirmaciones ni números leídos que archivar. La fuente salió de revisión hasta que termine la nueva lectura.");
    expect(estado.base.tablas.claims_archivo).toHaveLength(0);
    expect(estado.base.tablas.sources[0]).toMatchObject({ revision: null });
  });
});

describe("Cierre Z4 · consolidar: el 409 dice qué hacer según la fuente, y una lectura en parte no se consolida callada", () => {
  it("«no está esperando revisión»: a un documento o a una tabla de datos se le dice «vuelve a extraerla»; a una entrevista, un audio, una foto, una observación o un archivo no analizado, no", async () => {
    estado.autoridad = true;
    const rechazo = async (fuente: Fila, jobs: Fila[] = []) => {
      estado.base = crearBaseFalsa({ sources: [{ id: SRC, company_id: "E", estado: "leido", revision: null, ...fuente }], claims: [], company_metricas: [], jobs });
      const antes = JSON.stringify(estado.base.tablas);
      const r = await consolidar({});
      expect(r.status).toBe(409);
      expect(JSON.stringify(estado.base.tablas)).toBe(antes);
      // Para el consultor: sin nombres de columnas, de estados ni de tablas.
      expect(r.body.error).not.toMatch(/revision|estado|leyendo|leido|jobs|payload|no_analizado/);
      return String(r.body.error);
    };
    // Las que nunca pasan por esta pantalla: releerlas no las trae aquí, así que no se les manda a reextraer.
    const clases: [string, string][] = [["entrevista", "una entrevista"], ["audio", "una nota de voz"], ["foto", "una foto"], ["observacion", "una observación"]];
    for (const [tipo, clase] of clases) {
      const mensaje = await rechazo({ tipo });
      expect(mensaje, tipo).toContain("no está esperando revisión");
      expect(mensaje, tipo).toContain(`es ${clase} y no pasa por esta pantalla, tampoco después de volver a leerla`);
      expect(mensaje, tipo).toContain("«Afirmaciones»");
      expect(mensaje, tipo).not.toMatch(/vuelve a extraerla/);
    }
    // Un archivo que no se pudo analizar: se repite por qué y qué hacer; releerlo igual no cambia nada.
    const noAnalizado = await rechazo({ tipo: "documento", fidelidad_extraccion: "no_analizado", fidelidad_nota: NOTA_WORD_ANTIGUO });
    expect(noAnalizado).toContain("el archivo no se pudo analizar, así que no hay nada leído que revisar");
    expect(noAnalizado).toContain("guárdalo como .docx");
    expect(noAnalizado).not.toMatch(/vuelve a extraerla/);
    const sinNota = await rechazo({ tipo: "dato", fidelidad_extraccion: "no_analizado", fidelidad_nota: null });
    expect(sinNota).toContain("Súbelo de nuevo en un formato que sepamos leer");
    expect(sinNota).not.toMatch(/vuelve a extraerla/);
    // Un documento o una tabla de datos que sí sabemos leer: al releerse queda pendiente, y eso es lo que se le dice.
    for (const tipo of ["documento", "dato"]) expect(await rechazo({ tipo, fidelidad_extraccion: "alta" }), tipo).toMatch(/no está esperando revisión.*vuelve a extraerla/);
    // Y si ya se mandó a leer otra vez (fuera de revisión, con un trabajo vivo), no se le dice «vuelve a extraerla» por no esperar revisión: se le dice que espere.
    const releyendo = await rechazo({ tipo: "documento", fidelidad_extraccion: "alta" }, [{ id: "j1", company_id: "E", tipo: "extraer", estado: "pendiente", payload: { source_id: SRC } }]);
    expect(releyendo).toMatch(/todavía no terminó de leerse/);
    expect(releyendo).not.toMatch(/no está esperando revisión/);
  });

  it("una fuente leída en parte se puede revisar, pero al consolidarla la respuesta lo dice y queda escrito en la fuente; una lectura entera no lleva aviso", async () => {
    estado.autoridad = true;
    const todo = { claims: [C1, C2, C3].map((id) => ({ id, accion: "confirmar" })), metricas: [M1, M2, M3].map((id) => ({ id, accion: "aceptar" })) };

    // Falló el tramo 2 de 3 y nadie lo reintentó: la extracción dejó la fuente leída, con la nota que empieza por «Se leyó en parte».
    estado.base = baseConFuente();
    const fuente = estado.base.tablas.sources.find((x) => x.id === SRC)!;
    Object.assign(fuente, lecturaEnParte([1], 3, "Excel leído celda por celda (3 hoja(s) con datos)."));
    estado.base.tablas.jobs.push({ id: "j-caido", company_id: "E", tipo: "extraer", estado: "fallido", payload: { source_id: SRC, chunk_index: 1, total: 3 } });
    expect(fuente).toMatchObject({ fidelidad_extraccion: "baja" });

    // Una tanda que no cierra guarda sin aviso: todavía no se está dando nada por revisado.
    const tanda = await consolidar({ claims: todo.claims.slice(0, 1), metricas: [], cerrar: false });
    expect(tanda.body).toMatchObject({ revision: "pendiente" });
    expect(tanda.body.lectura_en_parte).toBeUndefined();
    expect(String(fuente.fidelidad_nota)).not.toContain(NOTA_CONSOLIDADA_EN_PARTE);

    const r = await consolidar(todo);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ revision: "consolidada", pendientes: 0, lectura_en_parte: true });
    expect(r.body.aviso).toBe("Esta fuente se leyó en parte: quedó consolidado lo que se leyó, y así quedó anotado en la fuente. Para leer lo que falta, vuelve a extraerla.");
    expect(fuente).toMatchObject({ revision: "consolidada", revisada_por: "u-consultor", fidelidad_extraccion: "baja" });
    const nota = String(fuente.fidelidad_nota);
    // Sigue empezando igual (por ahí la reconoce la extracción al releer), conserva lo que decía y termina con la constancia fechada.
    expect(nota.startsWith("Se leyó en parte: falló el tramo 2 de 3.")).toBe(true);
    expect(nota).toContain("Excel leído celda por celda (3 hoja(s) con datos).");
    expect(nota).toMatch(new RegExp(`${NOTA_CONSOLIDADA_EN_PARTE} el \\d{4}-\\d{2}-\\d{2}: se revisó lo que se leyó; lo que traía la parte que falló no se leyó ni se revisó\\.$`));
    expect(esLecturaEnParte(nota)).toBe(true);
    expect(nota).not.toMatch(PATRON_MENSAJE_CRUDO);

    // La misma revisión sobre una lectura entera: ni aviso ni nota tocada.
    estado.base = baseConFuente();
    const entera = estado.base.tablas.sources.find((x) => x.id === SRC)!;
    Object.assign(entera, { fidelidad_extraccion: "alta", fidelidad_nota: "Excel leído celda por celda (3 hoja(s) con datos)." });
    const r2 = await consolidar(todo);
    expect(r2.body).toMatchObject({ revision: "consolidada" });
    expect(r2.body.lectura_en_parte).toBeUndefined();
    expect(r2.body.aviso).toBeUndefined();
    expect(entera.fidelidad_nota).toBe("Excel leído celda por celda (3 hoja(s) con datos).");
  });

  it("«se leyó en parte» se reconoce igual donde se escribe y donde se muestra; y qué fuentes pasan por revisión es una sola regla", () => {
    const parcial = lecturaEnParte([0, 2], 4, "Word leído entero: 40 párrafos.")!;
    expect(parcial.fidelidad_nota.startsWith(LEIDA_EN_PARTE)).toBe(true);
    expect(esLecturaEnParte(parcial.fidelidad_nota)).toBe(true);
    expect(resumenLecturaEnParte(parcial.fidelidad_nota)).toBe("Se leyó en parte: fallaron los tramos 1 y 3 de 4");
    expect(resumenLecturaEnParte(lecturaEnParte([1], 3)!.fidelidad_nota)).toBe("Se leyó en parte: falló el tramo 2 de 3");
    for (const nota of [null, undefined, "", "Excel leído celda por celda.", "PDF con capa de texto (3 página(s))."]) {
      expect(esLecturaEnParte(nota)).toBe(false);
      expect(resumenLecturaEnParte(nota)).toBeNull();
    }
    // La extracción (jobs/handlers/extraer.ts) y la ruta que consolida deciden lo mismo sobre qué fuente se revisa.
    for (const tipo of ["documento", "dato", "foto", "audio", "entrevista", "observacion", "", null, undefined]) expect(pasaPorRevision(tipo), String(tipo)).toBe(requiereRevision(tipo));
  });

  it("la regla de «fila decidida» es una sola: la ruta y la pantalla la toman de fidelidad.ts y ninguna la reescribe por su cuenta", () => {
    const ruta = readFileSync(path.resolve(__dirname, "../src/app/api/sources/[id]/consolidar/route.ts"), "utf8");
    const comp = readFileSync(path.resolve(__dirname, "../src/components/realidad/RevisarExtraccion.tsx"), "utf8");
    for (const src of [ruta, comp]) {
      expect(src).toMatch(/import \{[^}]*afirmacionYaDecidida[^}]*numeroYaDecidido[^}]*\} from "@\/lib\/documentos\/fidelidad"/);
      expect(src).not.toMatch(/function (afirmacionYaDecidida|numeroYaDecidido)\b/);
      // Ninguna compara estados a mano para decidir si una fila está resuelta.
      expect(src).not.toMatch(/=== "confirmado" \|\|[^\n]*=== "caducado"/);
      expect(src).not.toMatch(/estado === "descartado"/);
    }
    // Y la ruta cuenta lo pendiente con esa misma regla, no con otra.
    expect(ruta).toMatch(/!afirmacionYaDecidida\(c\.estado\)/);
    expect(ruta).toMatch(/!numeroYaDecidido\(m\)/);
    // Un número marcado como «de la lectura anterior» no está decidido por eso: sigue esperando a quien revise.
    expect(numeroYaDecidido({ estado: "extraido", origen: "extraido", valor: 86900, nota: `${NOTA_LECTURA_ANTERIOR} (archivada como versión 1): …` })).toBe(false);
    expect(numeroYaDecidido({ valor: null, nota: `${NOTA_LECTURA_ANTERIOR} (archivada como versión 1): …` })).toBe(false);
    // Aceptado «sin cifra»: conciliado, o sea decidido, aunque no tenga valor.
    expect(numeroYaDecidido({ estado: "sin_dato", origen: "conciliado", valor: null, nota: null })).toBe(true);
  });
});

describe("Cierre Z4 · la pantalla de fuentes no rotula «por revisar» lo que todavía se lee, y pone arriba lo que se leyó en parte", () => {
  const fuente = (extra: Fila): Fila => ({ company_id: "E", tipo: "documento", fecha_origen: "2026-09-30", origen: "consultor", estado: "leido", error: null, created_at: "2026-10-13T10:00:00.000Z", fidelidad_extraccion: "alta", fidelidad_nota: "Word leído entero: 40 párrafos.", revision: null, ...extra });

  it("la página: una fuente pendiente con un trabajo de lectura vivo o con la lectura cortada no cuenta como «por revisar» ni ofrece consolidar", async () => {
    const parcial = lecturaEnParte([1], 3, "Excel leído celda por celda (3 hoja(s) con datos).")!;
    estado.base = crearBaseFalsa({
      sources: [
        // 1. Pendiente, y se le está reintentando un tramo: se está leyendo.
        fuente({ id: SRC, tipo: "dato", nombre: "ventas-e-inventario.xlsx", revision: "pendiente" }),
        // 2. Pendiente de una lectura anterior, empezó a releerse y se cortó: ya no hay nada leyéndola.
        fuente({ id: OTRA, nombre: "funciones-del-personal.docx", estado: "leyendo", revision: "pendiente" }),
        // 3. Pendiente, leída… en parte.
        fuente({ id: S3, tipo: "dato", nombre: "expedientes-2026-I.xlsx", revision: "pendiente", ...parcial }),
        // 4. Una observación guardada como texto: nunca pasó por el lector y no es una lectura cortada.
        fuente({ id: S4, tipo: "observacion", nombre: "Seguimiento de validación", estado: "subido", fidelidad_extraccion: null, fidelidad_nota: null }),
        // 5. Mandada a leer otra vez: ya salió de revisión y su trabajo espera en la cola.
        fuente({ id: S5, nombre: "contrato-alquiler.pdf", fidelidad_extraccion: "media", fidelidad_nota: "PDF con capa de texto (4 página(s))." }),
      ],
      jobs: [
        { id: "j1", company_id: "E", tipo: "extraer", estado: "pendiente", progreso: null, error: null, created_at: "2026-10-13T11:00:00.000Z", payload: { source_id: SRC, chunk_index: 2, total: 5 } },
        { id: "j5", company_id: "E", tipo: "extraer", estado: "corriendo", progreso: "Leyendo contrato-alquiler.pdf: 2 tramo(s)", error: null, created_at: "2026-10-13T11:01:00.000Z", payload: { source_id: S5 } },
        // Un trabajo de otra clase, o ya terminado, no es una lectura en marcha.
        { id: "j6", company_id: "E", tipo: "contrastar", estado: "pendiente", progreso: null, error: null, created_at: "2026-10-13T11:02:00.000Z", payload: { source_id: S3 } },
        { id: "j7", company_id: "E", tipo: "extraer", estado: "hecho", progreso: null, error: null, created_at: "2026-10-13T09:00:00.000Z", payload: { source_id: S3 } },
      ],
      claims: [{ id: C1, source_id: SRC, texto: "Hay 40 artículos sin costo", tipo: "hecho", pilar: "finanzas", estado: "sin_verificar", fragmento: null, created_at: "2026-10-13" }],
      company_metricas: [],
    });
    const { default: Fuentes } = await import("@/app/(consultor)/empresa/[id]/fuentes/page");
    const html = renderToStaticMarkup(await Fuentes({ params: Promise.resolve({ id: "E" }) }));
    const veces = (trozo: string) => html.split(trozo).length - 1;

    // De las tres pendientes, solo una terminó de leerse: esa es la única «por revisar».
    expect(html).toContain("Por revisar (1)");
    expect(html).toContain("2 fuente(s) más no han terminado de leerse: se revisan cuando la lectura termine.");
    expect(veces(">por revisar<")).toBe(1);
    expect(veces("se revisa cuando termine de leerse")).toBe(2);
    // Cada panel dice lo suyo: se está leyendo, o se cortó.
    expect(veces("Esta fuente todavía se está leyendo")).toBe(1);
    expect(veces("La lectura de esta fuente se cortó antes de terminar y ya no hay nada leyéndola")).toBe(1);
    // Y consolidar no se ofrece en ninguno de los dos; en el tercero, sí.
    expect(veces("Consolidar</button>")).toBe(3);
    expect((html.match(/<button[^>]*disabled[^>]*>Consolidar/g) ?? []).length).toBe(2);
    // En la tabla: «leyendo» para las dos que tienen un trabajo vivo (aunque su estado guardado siga «leido»), y la cortada lo dice.
    expect(veces(">leyendo<")).toBe(2);
    expect(veces("la lectura se cortó: vuelve a leerla")).toBe(1);
    expect(html).toContain(">subido<"); // la observación se muestra como está: no es una lectura cortada
    // Lo que se leyó en parte se dice arriba del panel y en la tabla, con el tramo que falló.
    expect(veces("Se leyó en parte: falló el tramo 2 de 3")).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Se leyó en parte: falló el tramo 2 de 3. Lo que traía esa parte no está en la lectura: vuelve a leerla.");
    expect(html).toContain("Lectura dudosa");
    expect(html).not.toMatch(PATRON_MENSAJE_CRUDO);
  });

  it("el panel: «se leyó en parte» va arriba, antes que nada, y avisa de lo que quedará anotado; una lectura cortada no dice que «se está leyendo»", async () => {
    const { RevisarExtraccion } = await import("@/components/realidad/RevisarExtraccion");
    const base = { sourceId: SRC, nombre: "ventas-e-inventario.xlsx", claims: [], metricas: [] };
    const nota = lecturaEnParte([1], 3, "Excel leído celda por celda (3 hoja(s) con datos).")!.fidelidad_nota;
    const html = renderToStaticMarkup(createElement(RevisarExtraccion, { ...base, fidelidad: "baja", fidelidadNota: nota }));
    const aviso = html.indexOf("Se leyó en parte: falló el tramo 2 de 3. Lo que traía esa parte no está aquí: lo que ves es solo lo que se leyó.");
    expect(aviso).toBeGreaterThan(-1);
    expect(aviso).toBeLessThan(html.indexOf("Mientras no lo revises"));
    expect(aviso).toBeLessThan(html.indexOf("Cómo se leyó:"));
    expect(html).toMatch(/role="alert"[^>]*>Se leyó en parte/);
    expect(html).toContain("si la consolidas así, quedará anotado en la fuente que se revisó una lectura en parte");
    expect(html).toContain("Lectura dudosa");
    // Se puede revisar y consolidar lo que sí se leyó: el botón no se cierra por esto.
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Consolidar/);

    // Una lectura entera no lleva ese aviso.
    const entera = renderToStaticMarkup(createElement(RevisarExtraccion, { ...base, fidelidad: "alta", fidelidadNota: "Excel leído celda por celda (3 hoja(s) con datos)." }));
    expect(entera).not.toContain("Se leyó en parte");
    expect(entera).not.toContain('role="alert"');

    // Cortada: no «se está leyendo»; se cortó, y tampoco se consolida.
    const cortada = renderToStaticMarkup(createElement(RevisarExtraccion, { ...base, fidelidad: "alta", fidelidadNota: null, leyendo: true, lecturaCortada: true }));
    expect(cortada).toContain("La lectura de esta fuente se cortó antes de terminar y ya no hay nada leyéndola. Vuelve a leerla");
    expect(cortada).not.toContain("todavía se está leyendo");
    expect(cortada).not.toContain("consolida para dejar constancia");
    expect(cortada).toMatch(/<button[^>]*disabled[^>]*>Consolidar/);

    // Al consolidar, la pantalla repite el aviso que manda la ruta junto al resultado.
    const comp = readFileSync(path.resolve(__dirname, "../src/components/realidad/RevisarExtraccion.tsx"), "utf8");
    expect(comp).toMatch(/setListo\(`Consolidado: \$\{resumen\}\$\{saltadas\}\$\{r\.aviso \? ` \$\{r\.aviso\}` : ""\}`\)/);
  });

  it("la página: una fuente pendiente cuya lectura terminó en error no dice que «se está leyendo»; y mientras una fuente se relee no se le pide «vuelve a leerla»", async () => {
    const parcial = lecturaEnParte([1], 3, "Excel leído celda por celda (3 hoja(s) con datos).")!;
    estado.base = crearBaseFalsa({
      sources: [
        // Quedó pendiente de una lectura anterior y la relectura falló: ni se está leyendo ni está lista para revisar.
        fuente({ id: SRC, nombre: "funciones-del-personal.docx", estado: "error", error: "No se pudo abrir el archivo", revision: "pendiente" }),
        // Leída en parte, pendiente, y con el tramo caído reintentándose ahora mismo.
        fuente({ id: S3, tipo: "dato", nombre: "expedientes-2026-I.xlsx", revision: "pendiente", ...parcial }),
      ],
      jobs: [{ id: "j1", company_id: "E", tipo: "extraer", estado: "corriendo", progreso: null, error: null, created_at: "2026-10-13T11:00:00.000Z", payload: { source_id: S3, chunk_index: 1, total: 3 } }],
      claims: [],
      company_metricas: [],
    });
    const { default: Fuentes } = await import("@/app/(consultor)/empresa/[id]/fuentes/page");
    const html = renderToStaticMarkup(await Fuentes({ params: Promise.resolve({ id: "E" }) }));
    const veces = (trozo: string) => html.split(trozo).length - 1;

    // Ninguna de las dos está lista: nada «por revisar» y ningún botón de consolidar abierto.
    expect(html).toContain("Por revisar (0)");
    expect(veces(">por revisar<")).toBe(0);
    expect(veces("Consolidar</button>")).toBe(2);
    expect((html.match(/<button[^>]*disabled[^>]*>Consolidar/g) ?? []).length).toBe(2);
    // La que falló: se dice que se cortó (y en la tabla, su error), no que «se está leyendo».
    expect(veces("La lectura de esta fuente se cortó antes de terminar y ya no hay nada leyéndola")).toBe(1);
    expect(html).toContain("No se pudo abrir el archivo");
    // La que se relee: se dice que se está leyendo, y la nota «en parte» de la lectura anterior no pide volver a leerla.
    expect(veces("Esta fuente todavía se está leyendo")).toBe(1);
    expect(html).not.toContain("Lo que traía esa parte no está en la lectura: vuelve a leerla.");
    expect(html).not.toContain("Lo que traía esa parte no está aquí");
  });

  // ── Segundo cierre Z4: la consulta de trabajos vivos puede fallar, y su error ya no se ignora ──
  const fuentesSinCola = (): Record<string, Fila[]> => ({
    sources: [
      // 1. Leyéndose ahora mismo (tiene un trabajo vivo); su estado guardado es «leyendo».
      fuente({ id: SRC, tipo: "dato", nombre: "ventas-e-inventario.xlsx", estado: "leyendo", fidelidad_extraccion: null, fidelidad_nota: null }),
      // 2. Leída y pendiente de revisión: puede tener un tramo reintentándose, o no.
      fuente({ id: OTRA, nombre: "funciones-del-personal.docx", revision: "pendiente" }),
      // 3. Pendiente y con la lectura terminada en error: eso se sabe sin mirar la cola.
      fuente({ id: S3, nombre: "contrato-alquiler.pdf", estado: "error", error: "No se pudo abrir el archivo", revision: "pendiente" }),
      // 4. Ya revisada: no hay nada que decidir sobre ella.
      fuente({ id: S5, nombre: "reglamento.docx", revision: "consolidada" }),
    ],
    jobs: [{ id: "j1", company_id: "E", tipo: "extraer", estado: "corriendo", progreso: null, error: null, created_at: "2026-10-13T11:00:00.000Z", payload: { source_id: SRC, chunk_index: 0, total: 3, texto: "…el tramo…" } }],
    claims: [],
    company_metricas: [],
  });

  it("la página: si no se puede comprobar qué fuentes se están leyendo, no dice «se cortó» ni «por revisar»: dice que no se pudo comprobar, con el motivo, y deja que la ruta lo compruebe al consolidar", async () => {
    estado.base = crearBaseFalsa(fuentesSinCola(), { jobs: "permiso denegado para la tabla jobs" });
    const { default: Fuentes } = await import("@/app/(consultor)/empresa/[id]/fuentes/page");
    const html = renderToStaticMarkup(await Fuentes({ params: Promise.resolve({ id: "E" }) }));
    const veces = (trozo: string) => html.split(trozo).length - 1;

    // Arriba, a la vista y con el motivo: nada falla en silencio.
    expect(html).toMatch(/role="alert"[^>]*><h2[^>]*>No pudimos comprobar los trabajos de lectura<\/h2>/);
    expect(html).toContain("No se pudo saber qué fuentes se están leyendo ahora mismo.");
    expect(html).toContain("Tampoco se pudo leer la lista de trabajos en curso y fallidos: que abajo no aparezca ninguno no quiere decir que no los haya.");
    expect(html).toContain("Motivo que dio la base: permiso denegado para la tabla jobs");
    // La que se está leyendo NO aparece en rojo como «se cortó: vuelve a leerla»: volver a leerla retiraría el trabajo que la lee.
    expect(veces("la lectura se cortó: vuelve a leerla")).toBe(0);
    expect(html).toContain(">no se pudo comprobar si se está leyendo<");
    // La pendiente NO se rotula «por revisar» ni se cuenta como lista: se dice que no se sabe.
    expect(html).toContain("Por revisar (0)");
    expect(veces(">por revisar<")).toBe(0);
    expect(html).toContain("De 1 fuente(s) más no se pudo comprobar si todavía se está leyendo: no se cuenta arriba.");
    expect(html).toContain(">leido; no se pudo comprobar si se está leyendo otra vez<");
    expect(veces("espera revisión; al consolidar se comprueba si terminó de leerse")).toBe(1);
    // Su panel lo dice y deja revisar: la ruta comprueba la cola por su cuenta y no cierra una lectura en curso.
    expect(veces("No pudimos comprobar si esta fuente todavía se está leyendo. Puedes revisar lo que hay; al consolidar se comprueba otra vez")).toBe(1);
    // La que terminó en error sí se sabe cortada: su panel lo dice y no ofrece consolidar.
    expect(html).toContain("1 fuente(s) más no ha terminado de leerse: se revisa cuando la lectura termine.");
    expect(veces("La lectura de esta fuente se cortó antes de terminar y ya no hay nada leyéndola")).toBe(1);
    expect(veces("Consolidar</button>")).toBe(2);
    expect((html.match(/<button[^>]*disabled[^>]*>Consolidar/g) ?? []).length).toBe(1);
    // Y la ya revisada sigue como estaba.
    expect(veces(">revisada<")).toBe(1);

    // La ruta, que mira la cola con su propia consulta, es la que no deja sellar una lectura en curso.
    estado.base = crearBaseFalsa({ ...fuentesSinCola(), jobs: [{ id: "j2", company_id: "E", tipo: "extraer", estado: "pendiente", payload: { source_id: OTRA, chunk_index: 1 } }] });
    estado.autoridad = true;
    const r = await consolidar({}, OTRA);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/todavía no terminó de leerse/);
    expect(estado.base.tablas.sources.find((x) => x.id === OTRA)).toMatchObject({ revision: "pendiente" });
  });

  it("la página: si la base no acepta la consulta ligera de trabajos vivos, la de respaldo contesta y nada cambia: «leyendo» es leyendo y «por revisar» es por revisar", async () => {
    estado.base = crearBaseFalsa(fuentesSinCola(), { "jobs|source_id:payload->>source_id": "failed to parse select parameter" });
    const { default: Fuentes } = await import("@/app/(consultor)/empresa/[id]/fuentes/page");
    const html = renderToStaticMarkup(await Fuentes({ params: Promise.resolve({ id: "E" }) }));
    const veces = (trozo: string) => html.split(trozo).length - 1;
    expect(html).not.toContain("No pudimos comprobar los trabajos de lectura");
    expect(html).not.toContain("no se pudo comprobar");
    expect(veces(">leyendo<")).toBe(1);
    expect(veces("la lectura se cortó: vuelve a leerla")).toBe(0);
    expect(html).toContain("Por revisar (1)");
    expect(veces(">por revisar<")).toBe(1);
    // Con la cola a la vista y sin trabajo que la lea, una fuente «leyendo» sí se dice cortada.
    estado.base = crearBaseFalsa({ ...fuentesSinCola(), jobs: [] }, { "jobs|source_id:payload->>source_id": "failed to parse select parameter" });
    const sinTrabajo = renderToStaticMarkup(await Fuentes({ params: Promise.resolve({ id: "E" }) }));
    expect(sinTrabajo).toContain("la lectura se cortó: vuelve a leerla");
    // Lo que hace «Volver a leer» se dice en la página, antes de pulsarlo.
    expect(html).toContain("«Volver a leer» archiva lo que se leyó antes (afirmaciones y números) y saca la fuente de revisión hasta que termine la nueva lectura. Los números que ya conciliaste no se tocan: siguen como los dejaste.");
  });
});
