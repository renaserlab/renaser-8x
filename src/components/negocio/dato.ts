/**
 * LO QUE COMPARTEN LAS PANTALLAS DE «LO QUE EL CLIENTE LLENA» (16-10-2026): cómo se escribe en la caja un número
 * dicho, cómo se lee de vuelta y cómo se muestra. Puro y sin nada de servidor: lo usan los componentes de cliente
 * (las cajas) y los de servidor (las lecturas) por igual.
 *
 * Ojo con dos cosas que este archivo NO hace:
 *  - No calcula márgenes ni rentabilidad: eso es src/lib/rentabilidad.ts y corre en el servidor (importa producto.ts,
 *    que trae el lector de Excel y el cliente de la base: nada de eso puede viajar al navegador). Las pantallas
 *    reciben lo ya calculado.
 *  - No inventa un número: una caja vacía es «sin dato», un «no lo sé» es una respuesta, y ninguno es cero.
 */
import { formaDe, leerDatoOral, rangoDe, sumarRangos, textoRango, type DatoOral, type EstadoDato, type Rango } from "@/lib/dato-oral";

export type Modo = "dueno" | "consultora";

/** Lo que se muestra dentro de la caja: el número o el rango de la propia persona. Vacío si no hay o es «no lo sé». */
export function textoDeCaja(d: Partial<DatoOral> | null | undefined): string {
  const forma = formaDe(d);
  if (forma === "exacto") return String(d!.valor);
  if (forma === "rango") return `${d!.desde} a ${d!.hasta}`;
  return "";
}

export type Lectura = { tipo: "vacio" } | { tipo: "ok"; dato: DatoOral } | { tipo: "aviso"; aviso: string };

/**
 * Lee lo que la persona escribió en la caja. El estado: el que trae lo escrito («unos 40» es a ojo), si no el que
 * ya tenía el dato, y si no «a ojo» (lo que no dice de dónde salió no puede valer más que un cálculo a ojo).
 */
export function leerCaja(texto: string, previo: Partial<DatoOral> | null | undefined, o: { max?: number; soloExacto?: boolean; entero?: boolean } = {}): Lectura {
  if (!texto.trim()) return { tipo: "vacio" };
  const r = leerDatoOral(texto);
  if (!r.ok) return { tipo: "aviso", aviso: r.aviso };
  if (r.dato.estado === "no_lo_se") return { tipo: "ok", dato: { estado: "no_lo_se" } };
  const estadoPrevio = previo?.estado && previo.estado !== "no_lo_se" ? previo.estado : null;
  const estado: EstadoDato = r.dato.estado ?? estadoPrevio ?? "estimado";
  const esRango = r.dato.desde != null && r.dato.hasta != null;
  if (esRango && o.soloExacto) return { tipo: "aviso", aviso: "Aquí va un solo número. Si no estás seguro, escribe el que más se acerca y elige «Lo calculo a ojo»." };
  const numeros = esRango ? [r.dato.desde as number, r.dato.hasta as number] : [r.dato.valor as number];
  if (o.max != null && numeros.some((n) => n > o.max!)) return { tipo: "aviso", aviso: `Aquí el número va de 0 a ${o.max}.` };
  if (o.entero && numeros.some((n) => !Number.isInteger(n))) return { tipo: "aviso", aviso: "Aquí va un número entero." };
  return { tipo: "ok", dato: esRango ? { desde: r.dato.desde, hasta: r.dato.hasta, estado } : { valor: r.dato.valor, estado } };
}

/** Un número exacto escrito como habla la persona («8 mil», «3.80»): el número, null si la caja está vacía, o el aviso. */
export function leerNumero(texto: string): { ok: true; n: number | null } | { ok: false; aviso: string } {
  if (!texto.trim()) return { ok: true, n: null };
  const r = leerDatoOral(texto);
  if (!r.ok) return { ok: false, aviso: r.aviso };
  if (r.dato.estado === "no_lo_se") return { ok: true, n: null };
  if (r.dato.valor == null) return { ok: false, aviso: "Aquí va un solo número, no un rango." };
  return { ok: true, n: r.dato.valor };
}

/** ¿Dicen lo mismo dos datos? (Para no guardar lo que no cambió.) */
export function mismoDato(a: Partial<DatoOral> | null | undefined, b: Partial<DatoOral> | null | undefined): boolean {
  const n = (d: Partial<DatoOral> | null | undefined) => (d ? { v: d.valor ?? null, d: d.desde ?? null, h: d.hasta ?? null, e: d.estado ?? null } : null);
  return JSON.stringify(n(a)) === JSON.stringify(n(b));
}

/** Un dato para leer: «S/ 40», «entre S/ 30 y S/ 50», «No lo sé», o «sin dato» si nadie lo dijo. */
export function mostrarDato(d: Partial<DatoOral> | null | undefined, formato: (n: number) => string, sinDato = "sin dato"): string {
  if (d?.estado === "no_lo_se") return "No lo sé";
  return textoRango(rangoDe(d), formato, sinDato);
}

/** Un número entero o con un decimal, con los separadores de Perú: «1,250», «2.5». */
export const cantidad = (n: number): string => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });

/** El estado en una palabra, para los chips de lectura. */
export const ESTADO_CORTO: Record<EstadoDato, string> = { estimado: "a ojo", contado: "anotado", comprobado: "comprobado", no_lo_se: "no lo sabe" };

/** El color del chip (clases .estado de tablero.css): comprobado en verde, a ojo en ámbar, lo demás neutro. */
export const ESTADO_CLASE: Record<EstadoDato, "ok" | "espera" | "neutro"> = { comprobado: "ok", contado: "neutro", estimado: "espera", no_lo_se: "neutro" };

/**
 * Lo que suman las partes del costo mientras se escriben, para decirlo debajo de la tarjeta («Te cuesta S/ 35 cada
 * uno» o «al menos S/ 18; falta: lavado»). Es la misma regla que costoDesdePartes de src/lib/producto.ts —si falta
 * una parte, el total no existe— hecha aquí con las piezas de dato-oral porque producto.ts no puede viajar al
 * navegador. Lo que se GUARDA lo calcula la ruta con la de producto.ts; esto solo se muestra.
 */
export function sumaDePartes(partes: (Partial<DatoOral> & { nombre?: string })[]): { total: Rango | null; conocido: Rango | null; faltan: string[] } {
  const rangos = partes.map((p) => rangoDe(p));
  const faltan = partes.filter((_, i) => rangos[i] == null).map((p) => p.nombre?.trim() || "una parte sin nombre");
  const conNumero = rangos.filter((r): r is Rango => r != null);
  return { total: partes.length && !faltan.length ? sumarRangos(rangos) : null, conocido: conNumero.length ? sumarRangos(conNumero) : null, faltan };
}

/** «16-10»: el día y el mes, en el reloj de la empresa. */
export function diaMes(iso: string | null | undefined, zona = "America/Lima"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", timeZone: zona }).format(d).replace(/\//g, "-");
  } catch {
    return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", timeZone: "America/Lima" }).format(d).replace(/\//g, "-");
  }
}

/** «17 de octubre»: para decirle al dueño cuándo avisó. */
export function diaLargo(iso: string | null | undefined, zona = "America/Lima"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: zona }).format(d);
  } catch {
    return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", timeZone: "America/Lima" }).format(d);
  }
}

/** El mensaje de un fallo, para decirlo en pantalla. Nunca un fallo mudo. */
export const mensajeDe = (e: unknown, porDefecto = "No pudimos guardarlo. Inténtalo de nuevo."): string => (e instanceof Error && e.message ? e.message : porDefecto);
