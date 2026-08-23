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
