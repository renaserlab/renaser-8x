/** Validación de archivos subidos (14.2): MIME, extensión, tamaño, nombre, ruta. Sin IA. */

export const MAX_MB = 30;

const PERMITIDOS: Record<string, { ext: string[]; tipo: "documento" | "foto" | "audio" | "dato" }> = {
  "application/pdf": { ext: ["pdf"], tipo: "documento" },
  "text/plain": { ext: ["txt", "md"], tipo: "documento" },
  "text/markdown": { ext: ["md"], tipo: "documento" },
  "text/csv": { ext: ["csv"], tipo: "dato" },
  "application/csv": { ext: ["csv"], tipo: "dato" },
  // Word y Excel modernos se leen en código (src/lib/documentos): el Word es un documento; el Excel, datos.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], tipo: "documento" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ["xlsx"], tipo: "dato" },
  "image/jpeg": { ext: ["jpg", "jpeg"], tipo: "foto" },
  "image/png": { ext: ["png"], tipo: "foto" },
  "image/webp": { ext: ["webp"], tipo: "foto" },
  "audio/webm": { ext: ["webm"], tipo: "audio" },
  "audio/ogg": { ext: ["ogg", "opus"], tipo: "audio" },
  "audio/mpeg": { ext: ["mp3"], tipo: "audio" },
  "audio/mp4": { ext: ["m4a", "mp4"], tipo: "audio" },
  "audio/x-m4a": { ext: ["m4a"], tipo: "audio" },
  "audio/wav": { ext: ["wav"], tipo: "audio" },
  "audio/x-wav": { ext: ["wav"], tipo: "audio" },
};

/**
 * Lo que se rechaza con una explicación y el siguiente paso, no con «tipo no permitido». Desde el
 * 13-10-2026 el .docx y el .xlsx SE LEEN (src/lib/documentos); solo quedan fuera los formatos antiguos
 * de Office (.doc, .xls), que ninguna librería del repo sabe abrir.
 *
 * OJO: estos dos MIME no bastan para rechazar, ni para decir «formato antiguo». En Windows con Excel
 * instalado el navegador declara `application/vnd.ms-excel` para cualquier .csv (y a veces para un .xlsx,
 * un .xlsm o un .tsv), y `application/msword` para algún .docx. Son MIME «genéricos de Office»: dicen de
 * qué programa viene el archivo, no qué formato tiene. Por eso `validarArchivo` decide por la extensión
 * (ver EXTENSION_FORMATO_VIEJO): el mensaje de formato antiguo solo sale cuando el archivo termina en
 * .doc o .xls. Con cualquier otra extensión, o sin ninguna, el rechazo nombra lo que se ve (la extensión)
 * y sugiere el paso que toca, sin afirmar un formato que nadie comprobó.
 */
export const RECHAZADOS_CON_MENSAJE: Record<string, string> = {
  "application/msword": "Ese Word es del formato antiguo (.doc). Ábrelo en Word, guárdalo como .docx (Archivo → Guardar como) y súbelo de nuevo.",
  "application/vnd.ms-excel": "Ese Excel es del formato antiguo (.xls). Ábrelo en Excel, guárdalo como .xlsx (Archivo → Guardar como) y súbelo de nuevo.",
};

/** Las extensiones que SÍ son formato viejo, con el mensaje que les toca. La extensión manda sobre el MIME genérico. */
export const EXTENSION_FORMATO_VIEJO: Record<string, string> = {
  doc: RECHAZADOS_CON_MENSAJE["application/msword"],
  xls: RECHAZADOS_CON_MENSAJE["application/vnd.ms-excel"],
};

/**
 * MIME que el navegador manda sin saber de verdad qué formato es el archivo: los dos genéricos de Office
 * y el comodín. Con cualquiera de ellos la decisión se toma por la extensión, nunca por el MIME.
 */
const MIME_GENERICOS = new Set(["application/octet-stream", ...Object.keys(RECHAZADOS_CON_MENSAJE)]);

/**
 * Lo único que un MIME genérico de Office sí dice: de qué programa viene. Sirve para sugerir el siguiente paso
 * («guárdalo como .xlsx») cuando la extensión no es ninguna de las que leemos; no para nombrar el formato.
 */
const PASO_POR_PROGRAMA: Record<string, string> = {
  "application/msword": "Si es un Word, ábrelo y guárdalo como .docx (Archivo → Guardar como).",
  "application/vnd.ms-excel": "Si es una hoja de cálculo, ábrela en Excel y guárdala como .xlsx o como CSV (Archivo → Guardar como).",
};

/**
 * ¿Está esta clave en la tabla, de verdad? `"constructor" in tabla` es cierto para cualquier objeto: un archivo
 * llamado «algo.constructor» o un MIME «constructor» encontraban una función donde se esperaba un mensaje.
 */
const tiene = (tabla: object, clave: string): boolean => Object.prototype.hasOwnProperty.call(tabla, clave);

export type Validacion = { ok: true; tipo: "documento" | "foto" | "audio" | "dato"; mime: string; nombre: string } | { ok: false; error: string };

export function extensionDe(nombre: string): string {
  const m = nombre.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Nombre seguro para Storage: sin rutas, sin caracteres raros, longitud acotada. */
export function nombreSeguro(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? "archivo";
  const limpio = base.replace(/[^\w.\-]+/g, "_").replace(/\.{2,}/g, ".").replace(/^\.+/, "");
  return (limpio || "archivo").slice(0, 120);
}

export function validarArchivo(a: { nombre: string; mime: string; bytes: number }): Validacion {
  if (a.bytes <= 0) return { ok: false, error: "El archivo está vacío." };
  if (a.bytes > MAX_MB * 1024 * 1024) return { ok: false, error: `El archivo pesa más de ${MAX_MB} MB. Divídelo o súbelo como fotos.` };
  const nombre = nombreSeguro(a.nombre);
  const ext = extensionDe(nombre);
  let mime = a.mime.split(";")[0].trim().toLowerCase();
  // Un .doc o un .xls de verdad se rechaza con su mensaje, diga lo que diga el MIME.
  if (tiene(EXTENSION_FORMATO_VIEJO, ext)) return { ok: false, error: EXTENSION_FORMATO_VIEJO[ext] };
  // Un MIME genérico de Office (vnd.ms-excel, msword) u octet-stream no decide nada: la extensión manda. Algunos
  // navegadores mandan octet-stream para el audio/ogg de WhatsApp o para un csv: también se resuelve por extensión.
  if (!tiene(PERMITIDOS, mime) || MIME_GENERICOS.has(mime)) {
    const porExt = Object.entries(PERMITIDOS).find(([, v]) => v.ext.includes(ext));
    if (!porExt) {
      // Al dueño se le nombra la extensión, que es lo que ve en su archivo; el tipo técnico que declara el navegador no le
      // dice nada. Y sin una extensión que leamos NO se dice «formato antiguo (.xls)»: un .xlsm, un .tsv o un archivo sin
      // extensión con el MIME de Excel no es un .xls, y decirlo sería mandar al dueño a arreglar lo que no está roto.
      const cual = ext ? ` (.${ext})` : ": su nombre no termina en ninguna extensión";
      const paso = tiene(PASO_POR_PROGRAMA, mime) ? ` ${PASO_POR_PROGRAMA[mime]}` : "";
      return { ok: false, error: `No pudimos leer ese tipo de archivo${cual}.${paso} Sube PDF, Word (.docx), Excel (.xlsx), CSV, foto, nota de voz o texto.` };
    }
    mime = porExt[0];
  }
  // «text/plain» es el genérico de los archivos de texto: hay sistemas que lo declaran para un .csv. La extensión
  // dice cuál de los tipos de texto es; rechazarlo por «no coincide» sería rechazar un CSV de verdad.
  if (mime === "text/plain" && ext && !PERMITIDOS[mime].ext.includes(ext)) {
    const deTexto = Object.entries(PERMITIDOS).find(([m, v]) => m.startsWith("text/") && v.ext.includes(ext));
    if (deTexto) mime = deTexto[0];
  }
  const def = PERMITIDOS[mime];
  if (ext && !def.ext.includes(ext)) return { ok: false, error: `El nombre del archivo termina en .${ext}, pero su contenido es de otro tipo. Revisa que sea el archivo correcto y súbelo de nuevo.` };
  return { ok: true, tipo: def.tipo, mime, nombre };
}

/** Ruta dentro del bucket: siempre bajo la carpeta de la empresa; nunca acepta rutas del cliente. */
export function rutaStorage(companyId: string, nombre: string, ahora = Date.now()): string {
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new Error("company_id inválido");
  return `${companyId}/${ahora}-${nombreSeguro(nombre)}`;
}

/**
 * QUÉ ES DE VERDAD EL ARCHIVO. `validarArchivo` confía en lo que declara el navegador, que sirve
 * para dar mensajes claros pero no para decidir. Esto lee los primeros bytes, que no se pueden
 * falsear. Sale de endurecer la subida del logo (auditoría del 29-08-2026) y lo usan las evidencias
 * de implementación. El SVG NO entra: puede llevar script dentro.
 */
export type FirmaArchivo = { mime: string; ext: string; familia: "foto" | "documento" };

const FIRMAS: (FirmaArchivo & { prueba: (b: Uint8Array) => boolean })[] = [
  { mime: "image/png", ext: "png", familia: "foto", prueba: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", ext: "jpg", familia: "foto", prueba: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", familia: "foto", prueba: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  // El celular de un dueño peruano suele mandar HEIC sin avisar: se acepta como foto.
  { mime: "image/heic", ext: "heic", familia: "foto", prueba: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 && b[8] === 0x68 && b[9] === 0x65 && b[10] === 0x69 && b[11] === 0x63 },
  { mime: "application/pdf", ext: "pdf", familia: "documento", prueba: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
];

/** Devuelve qué es el archivo, o null si no es un tipo que aceptemos como evidencia. */
export function reconocerPorBytes(bytes: Uint8Array): FirmaArchivo | null {
  if (bytes.length < 12) return null;
  const f = FIRMAS.find((x) => x.prueba(bytes));
  return f ? { mime: f.mime, ext: f.ext, familia: f.familia } : null;
}

/** Una evidencia es una foto del celular o un reporte: 8 MB alcanza de sobra y protege la cuota. */
export const MAX_EVIDENCIA_BYTES = 8 * 1024 * 1024;

/**
 * QUÉ ES UN TEXTO PEGADO. La fuerza de una fuente de texto no la decide el contenido sino el `tipo`
 * con que se guarda (rules/evidencia.ts · fuerzaFuente): una `observacion` del consultor vale
 * `strong`; un `documento`, `medium`. Hasta el 13-10-2026 el texto que el consultor pegaba sin decir
 * qué era caía a `observacion` y puntuaba como visita de campo. Un Word pegado no lo es.
 * El cliente no decide: lo que cuenta de sí mismo es su observación (`weak`), como siempre fue.
 */
export const TIPOS_TEXTO = ["documento", "observacion", "dato"] as const;
export type TipoTexto = (typeof TIPOS_TEXTO)[number];
export type ValidacionTexto = { ok: true; tipo: TipoTexto } | { ok: false; error: string };

export const PREGUNTA_TIPO_TEXTO = "Indica qué es este texto: un documento de la empresa, lo que viste en campo o un dato.";

export function validarTexto(e: { tipo?: string | null; origen: "consultor" | "cliente" }): ValidacionTexto {
  const pedido = (e.tipo ?? "").trim();
  if ((TIPOS_TEXTO as readonly string[]).includes(pedido)) return { ok: true, tipo: pedido as TipoTexto };
  if (pedido) return { ok: false, error: `Ese tipo de texto no existe. ${PREGUNTA_TIPO_TEXTO}` };
  if (e.origen === "consultor") return { ok: false, error: PREGUNTA_TIPO_TEXTO };
  return { ok: true, tipo: "observacion" };
}
