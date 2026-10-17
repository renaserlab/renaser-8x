/**
 * LO QUE DEVUELVE CADA ACCIÓN DE LA ESTRATEGIA (acciones.ts, preguntas.ts, generar.ts).
 *
 * Las acciones de servidor no saben de HTTP: dicen si se pudo y, si no, con qué código de respuesta, una clave corta
 * para la pantalla y el texto que lee la persona (de textos.ts, nunca el mensaje crudo de la base). La ruta solo lo
 * traduce (src/app/api/companies/[id]/estrategia/_comun.ts). Así cada acción se prueba entera con la base falsa.
 *
 * Puro.
 */

export type Fallo = { ok: false; status: 400 | 403 | 404 | 409 | 429 | 500 | 503; codigo: string; texto: string; extra?: Record<string, unknown> };
export type Resultado<T extends object> = ({ ok: true } & T) | Fallo;

export const no = (status: Fallo["status"], codigo: string, texto: string, extra?: Record<string, unknown>): Fallo => ({ ok: false, status, codigo, texto, ...(extra ? { extra } : {}) });

/** El texto de un error, venga como Error o como el objeto que devuelve la base ({ code, message }). */
export const mensajeDe = (e: unknown): string =>
  e instanceof Error ? e.message : typeof (e as { message?: unknown } | null)?.message === "string" ? String((e as { message: string }).message) : String(e);

/** ¿El fallo de la base dice que la tabla o una columna todavía no existe (la migración sin aplicar)? */
export const faltaLaMigracion = (codigo: string | null | undefined): boolean => ["42P01", "42703", "PGRST204", "PGRST205"].includes(codigo ?? "");
