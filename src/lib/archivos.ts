/** Validación de archivos subidos (14.2): MIME, extensión, tamaño, nombre, ruta. Sin IA. */

export const MAX_MB = 30;

const PERMITIDOS: Record<string, { ext: string[]; tipo: "documento" | "foto" | "audio" | "dato" }> = {
  "application/pdf": { ext: ["pdf"], tipo: "documento" },
  "text/plain": { ext: ["txt", "md"], tipo: "documento" },
  "text/markdown": { ext: ["md"], tipo: "documento" },
  "text/csv": { ext: ["csv"], tipo: "dato" },
  "application/csv": { ext: ["csv"], tipo: "dato" },
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

export const RECHAZADOS_CON_MENSAJE: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "No pudimos leer ese Word. Expórtalo a PDF y súbelo de nuevo.",
  "application/msword": "No pudimos leer ese Word. Expórtalo a PDF y súbelo de nuevo.",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "No pudimos leer ese Excel. Guárdalo como CSV (Archivo → Guardar como → CSV) y súbelo de nuevo.",
  "application/vnd.ms-excel": "No pudimos leer ese Excel. Guárdalo como CSV y súbelo de nuevo.",
};

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
  if (a.mime in RECHAZADOS_CON_MENSAJE) return { ok: false, error: RECHAZADOS_CON_MENSAJE[a.mime] };
  let mime = a.mime.split(";")[0].trim().toLowerCase();
  // Algunos navegadores mandan octet-stream para audio/ogg de WhatsApp o csv: se resuelve por extensión.
  if (!PERMITIDOS[mime] || mime === "application/octet-stream") {
    const porExt = Object.entries(PERMITIDOS).find(([, v]) => v.ext.includes(ext));
    if (!porExt) return { ok: false, error: `No pudimos leer ese tipo de archivo (${ext || mime || "desconocido"}). Sube PDF, foto, nota de voz, texto o CSV.` };
    mime = porExt[0];
  }
  const def = PERMITIDOS[mime];
  if (ext && !def.ext.includes(ext)) return { ok: false, error: `La extensión .${ext} no coincide con el contenido (${mime}).` };
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
