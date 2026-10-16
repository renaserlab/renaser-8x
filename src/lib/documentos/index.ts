import { PDFDocument, PDFDict, PDFName, PDFStream } from "pdf-lib";
import { leerWord, resumirAvisos, type LecturaWord } from "./word";
import { leerExcel, resumenVacias, resumenFilasDeResumen, resumenFilasConRotuloDeTotal, resumirAvisosExcel, type LecturaExcel } from "./excel";
import { traducirAvisosLectura } from "./fidelidad";

/**
 * QUÉ ARCHIVO ES Y CÓMO SE LEE; Y, SI NO SE PUEDE, DECIRLO EN VEZ DE FINGIR.
 *
 * Esta es la puerta única por la que la extracción (jobs/handlers/extraer.ts) pasa un archivo binario.
 * Devuelve la lectura con su FIDELIDAD, que se guarda en `sources.fidelidad_extraccion` y
 * `sources.fidelidad_nota` (migracion-evidencia-dimensiones.sql), para que cada afirmación o número
 * que salga de ahí lleve escrito cuán fiel fue la lectura de la que nació.
 *
 * Política para lo que NO sabemos leer (Word .doc y Excel .xls antiguos, PDF sin capa de texto, tipos
 * desconocidos): el archivo se conserva, la fuente queda «leída» con fidelidad «no_analizado» y una
 * nota con la limitación exacta y el siguiente paso, y no se crea ninguna afirmación. Nunca se simula
 * haberlo analizado: una fuente con cero afirmaciones y una nota honesta vale más que una lectura
 * inventada.
 */

export const MIME_WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MIME_EXCEL = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MIME_WORD_ANTIGUO = "application/msword";
export const MIME_EXCEL_ANTIGUO = "application/vnd.ms-excel";
export const MIME_PDF = "application/pdf";

export type Fidelidad = "alta" | "media" | "baja" | "no_analizado";

export type CapaTexto = "si" | "no" | "incierto";

export type Lectura =
  | { clase: "word"; fidelidad: Fidelidad; nota: string; word: LecturaWord }
  | { clase: "excel"; fidelidad: Fidelidad; nota: string; excel: LecturaExcel }
  | { clase: "pdf"; fidelidad: Fidelidad; nota: string; paginas: number; capaTexto: "si" }
  | {
      clase: "no_analizado";
      fidelidad: "no_analizado";
      /** Lo que ve el consultor: qué pasó y qué hacer, en castellano llano, sin mensajes de librería. */
      nota: string;
      /** El mensaje crudo de la librería (pdf-lib, mammoth, exceljs), para el resultado del trabajo y los registros. */
      detalle?: string | null;
    };

export const NOTA_WORD_ANTIGUO =
  "Es un Word del formato antiguo (.doc) y no sabemos leerlo. Ábrelo en Word, guárdalo como .docx (Archivo → Guardar como) o expórtalo a PDF, y súbelo de nuevo. El archivo se conservó; no se analizó nada.";
export const NOTA_EXCEL_ANTIGUO =
  "Es un Excel del formato antiguo (.xls) y no sabemos leerlo. Ábrelo en Excel, guárdalo como .xlsx (Archivo → Guardar como) y súbelo de nuevo. El archivo se conservó; no se analizó nada.";
/** El navegador dijo «Excel antiguo» pero los bytes no son ni .xls ni .xlsx: suele ser un CSV con el tipo que Windows le pone. */
export const NOTA_TIPO_OFFICE_DUDOSO =
  "El navegador rotuló este archivo como Office antiguo, pero su contenido no es un .doc ni un .xls. Si es un CSV, súbelo con la extensión .csv; si es un Excel o un Word, guárdalo como .xlsx o .docx y súbelo de nuevo. El archivo se conservó; no se analizó nada.";

function aBuffer(entrada: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(entrada)) return entrada;
  if (entrada instanceof ArrayBuffer) return Buffer.from(entrada);
  return Buffer.from(entrada.buffer, entrada.byteOffset, entrada.byteLength);
}

/** Firmas que no se pueden falsear desde el navegador: ZIP (docx/xlsx), OLE (doc/xls antiguos), PDF. */
export function firmaDe(b: Uint8Array): "zip" | "ole" | "pdf" | "otra" {
  if (b.length < 8) return "otra";
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "zip";
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "ole";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf";
  return "otra";
}

function tieneFuentes(recursos: PDFDict | undefined): boolean {
  const fuentes = recursos?.lookupMaybe(PDFName.of("Font"), PDFDict);
  return !!fuentes && fuentes.keys().length > 0;
}

/**
 * ¿Tiene este PDF texto de verdad o es un escaneo? pdf-lib no extrae texto, pero sí sabe si una página
 * declara fuentes: sin fuentes no hay texto que leer, solo imagen. Se miran los recursos de cada página
 * y, un nivel más adentro, los formularios (XObject /Form) que traen sus propias fuentes; es lo que un
 * exportador normal produce. Si pdf-lib no puede abrirlo, no se adivina: «incierto».
 */
export async function inspeccionarPdf(entrada: Buffer | ArrayBuffer | Uint8Array): Promise<{ paginas: number; capaTexto: CapaTexto; conFuentes: number; motivo: string | null }> {
  try {
    const doc = await PDFDocument.load(aBuffer(entrada), { ignoreEncryption: true });
    const paginas = doc.getPages();
    let conFuentes = 0;
    for (const pagina of paginas) {
      const recursos = pagina.node.Resources();
      let tiene = tieneFuentes(recursos);
      if (!tiene) {
        const xobjetos = recursos?.lookupMaybe(PDFName.of("XObject"), PDFDict);
        for (const [, ref] of xobjetos?.entries() ?? []) {
          const flujo = doc.context.lookupMaybe(ref, PDFStream);
          const subtipo = flujo?.dict.lookupMaybe(PDFName.of("Subtype"), PDFName);
          if (subtipo?.decodeText() === "Form" && tieneFuentes(flujo?.dict.lookupMaybe(PDFName.of("Resources"), PDFDict))) {
            tiene = true;
            break;
          }
        }
      }
      if (tiene) conFuentes++;
    }
    if (!paginas.length) return { paginas: 0, capaTexto: "incierto", conFuentes: 0, motivo: "El PDF no tiene páginas." };
    return { paginas: paginas.length, capaTexto: conFuentes > 0 ? "si" : "no", conFuentes, motivo: null };
  } catch (e) {
    return { paginas: 0, capaTexto: "incierto", conFuentes: 0, motivo: e instanceof Error ? e.message : String(e) };
  }
}

function noAnalizado(nota: string, detalle?: unknown): Lectura {
  const d = detalle === undefined || detalle === null ? null : detalle instanceof Error ? detalle.message : String(detalle);
  return { clase: "no_analizado", fidelidad: "no_analizado", nota, detalle: d };
}

/**
 * Lee el archivo según su tipo declarado, comprobado contra sus primeros bytes. Lo que vuelve ya trae la
 * fidelidad y una nota en castellano llano para la pantalla del consultor.
 */
export async function detectarYLeer(mime: string, entrada: Buffer | ArrayBuffer | Uint8Array): Promise<Lectura> {
  const buffer = aBuffer(entrada);
  const declarado = (mime ?? "").split(";")[0].trim().toLowerCase();
  const firma = firmaDe(buffer);

  // Los MIME «antiguos» de Office los pone el navegador, no el archivo: en Windows con Excel instalado un .xlsx
  // (y cualquier .csv) llega como vnd.ms-excel. Los bytes no mienten: si la firma es ZIP, es un .docx/.xlsx moderno
  // y se lee como tal; si es OLE, sí es el formato viejo; si no es ninguna, se dice la duda sin fingir.
  const tipo = firma === "zip" && declarado === MIME_WORD_ANTIGUO ? MIME_WORD : firma === "zip" && declarado === MIME_EXCEL_ANTIGUO ? MIME_EXCEL : declarado;
  if (tipo === MIME_WORD_ANTIGUO) return noAnalizado(firma === "ole" ? NOTA_WORD_ANTIGUO : NOTA_TIPO_OFFICE_DUDOSO);
  if (tipo === MIME_EXCEL_ANTIGUO) return noAnalizado(firma === "ole" ? NOTA_EXCEL_ANTIGUO : NOTA_TIPO_OFFICE_DUDOSO);
  if (firma === "ole") return noAnalizado("Es un archivo de Office del formato antiguo (.doc o .xls) y no sabemos leerlo. Guárdalo como .docx o .xlsx y súbelo de nuevo. El archivo se conservó; no se analizó nada.");

  if (tipo === MIME_WORD) {
    if (firma !== "zip") return noAnalizado("El archivo dice ser un Word (.docx) pero su contenido no lo es. Ábrelo en Word y guárdalo de nuevo como .docx. No se analizó nada.");
    try {
      const word = await leerWord(buffer);
      if (!word.parrafos.length) return noAnalizado("El Word no tiene texto legible: puede estar vacío o ser solo imágenes. Si es un escaneo, súbelo como fotos. No se analizó nada.");
      // Los avisos de mammoth llegan en inglés y uno por caso: a la pantalla van como frases cortas en castellano
      // (fidelidad.ts · traducirAvisosLectura). Los crudos quedan en word.avisos para el trabajo y los registros.
      const nota = word.fidelidad === "alta" ? `Word leído entero: ${word.parrafos.length} párrafos.` : `Word leído con avisos (${word.parrafos.length} párrafos): ${traducirAvisosLectura(word.avisos).join("; ")}.`;
      return { clase: "word", fidelidad: word.fidelidad, nota, word };
    } catch (e) {
      return noAnalizado("No pudimos abrir ese Word: el archivo parece dañado o no es un .docx de verdad. Ábrelo en Word, guárdalo de nuevo como .docx o expórtalo a PDF, y súbelo otra vez. No se analizó nada.", e);
    }
  }

  if (tipo === MIME_EXCEL) {
    if (firma !== "zip") return noAnalizado("El archivo dice ser un Excel (.xlsx) pero su contenido no lo es. Ábrelo en Excel y guárdalo de nuevo como .xlsx. No se analizó nada.");
    try {
      const excel = await leerExcel(buffer);
      const conDatos = excel.hojas.filter((h) => h.filas.length);
      if (!conDatos.length) return noAnalizado("El Excel no tiene filas con datos en ninguna hoja. No se analizó nada.");
      // Una fila «TOTAL …» al pie de la hoja no es un dato: se dice cuántas se apartaron y qué decían. Y una fila
      // «Total <algo>» que se contó como dato (puede ser un artículo) también se nombra: la duda no se calla.
      const detalle = conDatos
        .map((h) => {
          const dudosas = resumenFilasConRotuloDeTotal(h);
          return `${h.nombre}: ${h.filas.length} filas, vacías → ${resumenVacias(h)}${h.resumen.length ? `, ${resumenFilasDeResumen(h)}` : ""}${dudosas ? `, ${dudosas}` : ""}`;
        })
        .join(" || ");
      const nota = `${excel.fidelidad === "alta" ? "Excel leído celda por celda" : "Excel leído con avisos"} (${conDatos.length} hoja(s) con datos). ${detalle}.${excel.fidelidad === "media" ? ` Avisos: ${resumirAvisosExcel(excel.avisos)}.` : ""}`;
      return { clase: "excel", fidelidad: excel.fidelidad, nota, excel };
    } catch (e) {
      return noAnalizado("No pudimos abrir ese Excel: el archivo parece dañado o no es un .xlsx de verdad. Ábrelo en Excel, guárdalo de nuevo como .xlsx y súbelo otra vez. No se analizó nada.", e);
    }
  }

  if (tipo === MIME_PDF || firma === "pdf") {
    const r = await inspeccionarPdf(buffer);
    if (r.capaTexto === "incierto") {
      const porQue = r.paginas === 0 && r.motivo === "El PDF no tiene páginas." ? " porque no tiene páginas" : " porque no pudimos abrirlo";
      return noAnalizado(`No pudimos saber con certeza si este PDF tiene texto legible${porQue}. No lo analizamos para no inventar una lectura. Si lo abres y puedes seleccionar el texto, vuelve a exportarlo a PDF; si es un escaneo, súbelo como fotos.`, r.motivo);
    }
    if (r.capaTexto === "no") return noAnalizado(`PDF sin capa de texto: ninguna de sus ${r.paginas} página(s) declara fuentes, así que parece un escaneo o una foto convertida. No lo analizamos para no inventar una lectura. Súbelo como fotos (una por página) y lo leemos como imagen.`);
    const parcial = r.conFuentes < r.paginas ? ` Solo ${r.conFuentes} de ${r.paginas} páginas tienen texto; las demás parecen imagen y pueden quedar sin leer.` : "";
    return { clase: "pdf", fidelidad: "media", nota: `PDF con capa de texto (${r.paginas} página(s)). El texto lo lee el modelo directamente del archivo; este sistema no lo comprobó letra por letra.${parcial}`, paginas: r.paginas, capaTexto: "si" };
  }

  return noAnalizado(`Tipo de archivo que no sabemos leer (${tipo || "desconocido"}). Súbelo como PDF, Word (.docx), Excel (.xlsx), CSV, texto o foto. El archivo se conservó; no se analizó nada.`);
}

export { leerWord, leerExcel, resumenVacias, resumenFilasDeResumen, resumenFilasConRotuloDeTotal, resumirAvisos, resumirAvisosExcel, traducirAvisosLectura };
export type { LecturaWord, LecturaExcel };
