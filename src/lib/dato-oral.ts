/**
 * UN NÚMERO DICHO, COMO LO DICE UN DUEÑO (16-10-2026).
 *
 * Kelin: «que no sea tedioso para el dueño». Quien vende jeans no sabe su costo al céntimo: sabe «unos 40»,
 * «entre 30 y 50» o «no lo sé». El sistema acepta las tres formas y no convierte ninguna en otra: un rango no se
 * vuelve su promedio a escondidas, un «no lo sé» no se vuelve cero. Cada número lleva además su ESTADO:
 *
 *  - `estimado`   «Lo calculo a ojo».
 *  - `contado`    «Lo tengo anotado o lo conté».
 *  - `comprobado` «Comprobado con un documento». Solo lo pone la consultora: el dueño, si tiene el papel, lo
 *                 sube, y ella lo marca.
 *  - `no_lo_se`   «No lo sé». Es una respuesta, no un hueco: cuenta como respondido y no entra en ninguna cuenta.
 *
 * OJO, no es `company_metricas.estado`: allí «contado» quiere decir «dicho de memoria». La equivalencia vive en
 * una sola función (`estadoDatoDesdeMetrica`) y nadie más la reinventa.
 *
 * Puro: sin base, sin red, sin IA. La aritmética de rangos es la de intervalos: sumar suma los extremos, restar
 * cruza los extremos, multiplicar toma el menor y el mayor de los cuatro productos.
 */
import { z } from "zod";
import { numeroEscrito } from "./numero-escrito";

export const ESTADOS_DATO = ["estimado", "contado", "comprobado", "no_lo_se"] as const;
export type EstadoDato = (typeof ESTADOS_DATO)[number];

/** Para el dueño: lo que ve en el selector. «comprobado» no se ofrece al dueño. */
export const ESTADO_DATO_TEXTO: Record<EstadoDato, string> = {
  estimado: "Lo calculo a ojo",
  contado: "Lo tengo anotado o lo conté",
  comprobado: "Comprobado con un documento",
  no_lo_se: "No lo sé",
};

/** Lo que el dueño puede elegir. «Comprobado» lo marca la consultora con el documento delante. */
export const ESTADOS_DEL_DUENO: readonly EstadoDato[] = ["estimado", "contado", "no_lo_se"];

/** Un número dicho: exacto (valor), en rango (desde-hasta) o «no lo sé». Exactamente una de las tres formas. */
export type DatoOral = { valor?: number | null; desde?: number | null; hasta?: number | null; estado: EstadoDato };

/** El tope de cualquier número dicho: un billón. Más que eso es un error de tecleo, no un dato. */
export const MAXIMO_DATO = 1_000_000_000_000;

const hay = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

/** Qué forma tiene un dato: exacto, rango, «no lo sé», vacío (nada dicho todavía) o mal armado (dos formas a la vez). */
export function formaDe(d: Partial<DatoOral> | null | undefined): "exacto" | "rango" | "no_lo_se" | "vacio" | "mezclado" {
  if (!d) return "vacio";
  const exacto = hay(d.valor);
  const desde = hay(d.desde);
  const hasta = hay(d.hasta);
  if (d.estado === "no_lo_se") return exacto || desde || hasta ? "mezclado" : "no_lo_se";
  if (exacto && (desde || hasta)) return "mezclado";
  if (exacto) return "exacto";
  if (desde && hasta) return "rango";
  if (desde || hasta) return "mezclado";
  return "vacio";
}

type OpcionesEsquema = { max?: number; sinComprobado?: boolean; admiteVacio?: boolean };

/**
 * El esquema de un número dicho. `max` acota (un «de cada 10» no pasa de 10); `sinComprobado` es la variante del
 * dueño; `admiteVacio` deja guardar el nombre sin el número (una parte del costo que todavía no se sabe).
 */
export function esquemaDatoOral(o: OpcionesEsquema = {}) {
  const max = o.max ?? MAXIMO_DATO;
  const n = z.number().finite().min(0, "no puede ser negativo").max(max, `no puede pasar de ${max}`).nullable().optional();
  const estados = o.sinComprobado ? (["estimado", "contado", "no_lo_se"] as const) : ESTADOS_DATO;
  return z
    .object({ valor: n, desde: n, hasta: n, estado: z.enum(estados) })
    .strict()
    .superRefine((d, ctx) => {
      const forma = formaDe(d as DatoOral);
      if (forma === "mezclado") {
        const mensaje =
          d.estado === "no_lo_se"
            ? "«No lo sé» va sin números."
            : hay(d.valor)
              ? "Un número exacto o un rango, no los dos."
              : "Un rango necesita sus dos extremos: desde y hasta.";
        ctx.addIssue({ code: "custom", message: mensaje, path: ["valor"] });
      } else if (forma === "vacio" && !o.admiteVacio) {
        ctx.addIssue({ code: "custom", message: "Falta el número, un rango o «no lo sé».", path: ["valor"] });
      } else if (forma === "rango" && (d.desde as number) > (d.hasta as number)) {
        ctx.addIssue({ code: "custom", message: "El «desde» es mayor que el «hasta».", path: ["desde"] });
      }
    }) as unknown as z.ZodType<DatoOral>;
}

export const EsquemaDatoOral: z.ZodType<DatoOral> = esquemaDatoOral();
export const EsquemaDatoOralDueno: z.ZodType<DatoOral> = esquemaDatoOral({ sinComprobado: true });

// ─── Rangos ──────────────────────────────────────────────────────────────────────────────────────

export type Rango = { bajo: number; alto: number };

/** valor → {v, v}; desde/hasta → {d, h}; «no lo sé», vacío o mal armado → null. */
export function rangoDe(d: Partial<DatoOral> | null | undefined): Rango | null {
  const forma = formaDe(d);
  if (forma === "exacto") return { bajo: d!.valor as number, alto: d!.valor as number };
  if (forma === "rango") {
    const a = d!.desde as number;
    const b = d!.hasta as number;
    return { bajo: Math.min(a, b), alto: Math.max(a, b) };
  }
  return null;
}

export const esExacto = (r: Rango): boolean => r.bajo === r.alto;
export const centro = (r: Rango): number => (r.bajo + r.alto) / 2;

/** La suma de varios. Si alguno no se sabe, la suma tampoco: null. Sin nada que sumar, también null (no es cero). */
export function sumarRangos(rs: (Rango | null)[]): Rango | null {
  if (!rs.length || rs.some((r) => r == null)) return null;
  return (rs as Rango[]).reduce((s, r) => ({ bajo: s.bajo + r.bajo, alto: s.alto + r.alto }), { bajo: 0, alto: 0 });
}

/** a − b en el peor y el mejor caso: {a.bajo − b.alto, a.alto − b.bajo}. */
export function restarRangos(a: Rango, b: Rango): Rango {
  return { bajo: a.bajo - b.alto, alto: a.alto - b.bajo };
}

/** a × b: el menor y el mayor de los cuatro productos de los extremos (vale con negativos). */
export function multiplicarRangos(a: Rango, b: Rango): Rango {
  const p = [a.bajo * b.bajo, a.bajo * b.alto, a.alto * b.bajo, a.alto * b.alto];
  return { bajo: Math.min(...p), alto: Math.max(...p) };
}

/** r × k. Con k negativo los extremos se cruzan. */
export function escalarRango(r: Rango, k: number): Rango {
  const a = r.bajo * k;
  const b = r.alto * k;
  return { bajo: Math.min(a, b), alto: Math.max(a, b) };
}

/** «S/ 40», «entre S/ 30 y S/ 50». Con el formato que se le pase (moneda de formato.ts o unidades). */
export function textoRango(r: Rango | null, formato: (n: number) => string, sinDato = "sin dato"): string {
  if (!r) return sinDato;
  if (esExacto(r)) return formato(r.bajo);
  const a = formato(r.bajo);
  const b = formato(r.alto);
  return a === b ? a : `entre ${a} y ${b}`;
}

// ─── Leer lo que la persona escribe como habla ───────────────────────────────────────────────────

// Los avisos salen debajo de la caja: no traen cifras de muestra, que se repiten como respuesta (revisión del 16-10).
export const AVISO_DATO_VACIO = "Escribe un número, o de cuánto a cuánto, o elige «No lo sé».";
export const AVISO_DATO_NEGATIVO = "Este número no puede ser negativo: escríbelo sin el signo menos.";
export const AVISO_DATO_NO_ENTENDIDO = "No entendimos este número. Escríbelo con cifras, o di de cuánto a cuánto.";

const NO_SE = /^(no\s*(lo\s*)?s[eé]|nose|ni\s+idea|no\s+tengo\s+idea|no\s+recuerdo|no\s+me\s+acuerdo|desconozco|no\s+sabr[ií]a)\.?$/;
/** «unos 40», «como 40», «más o menos 40», «aprox. 40», «alrededor de 40», «casi 40», «40 aprox». */
const APROXIMADO_ANTES = /^(unos|unas|como|m[aá]s\s+o\s+menos|aprox(imadamente)?\.?|alrededor\s+de|cerca\s+de|casi|aproximado)\s+/;
const APROXIMADO_DESPUES = /\s+(aprox(imadamente)?\.?|m[aá]s\s+o\s+menos|aproximado)$/;
const MULTIPLICADOR_FINAL = /(mil|millones|millón|millon|k)$/;

type Lectura = { ok: true; dato: Omit<DatoOral, "estado"> & { estado?: EstadoDato } } | { ok: false; aviso: string };

/** Un extremo suelto: el número, o el motivo para no entenderlo. */
function unNumero(t: string): number | "negativo" | "invalido" {
  if (/^[-−]/.test(t.trim())) return "negativo";
  const n = numeroEscrito(t);
  if (n === null || n === "invalido") return "invalido";
  return n;
}

/**
 * Lee lo que la persona escribe como habla: «8 mil», «30 a 50», «entre 30 y 50», «30-50», «unos 40», «no sé».
 * Usa numeroEscrito (numero-escrito.ts) para cada número. «unos 40» sale como estimado; «no sé», como «no lo sé»;
 * un número a secas no trae estado: lo elige la persona. Un rango dicho al revés («entre 50 y 30») se ordena.
 * «entre 30 y 50 mil» son treinta mil a cincuenta mil: el multiplicador del segundo vale para el primero.
 */
export function leerDatoOral(texto: string): Lectura {
  let t = String(texto ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return { ok: false, aviso: AVISO_DATO_VACIO };
  if (NO_SE.test(t)) return { ok: true, dato: { estado: "no_lo_se" } };

  let aproximado = false;
  if (APROXIMADO_ANTES.test(t)) {
    t = t.replace(APROXIMADO_ANTES, "");
    aproximado = true;
  }
  if (APROXIMADO_DESPUES.test(t)) {
    t = t.replace(APROXIMADO_DESPUES, "");
    aproximado = true;
  }
  if (/^[-−]\s*\d/.test(t)) return { ok: false, aviso: AVISO_DATO_NEGATIVO };

  // Un rango: «entre 30 y 50», «de 30 a 50», «30 a 50», «30-50», «30 – 50», «30 hasta 50», y como se dice de cada 10:
  // «3 o 4», «7 u 8». («Más o menos 40» ya se leyó arriba como aproximado.)
  const sinEntre = t.replace(/^(entre|de|desde)\s+/, "");
  const partes = sinEntre.split(/\s+(?:a|y|o|u|hasta|al)\s+|\s*[-–—]\s*/).filter((p) => p.trim() !== "");
  if (partes.length === 2 && !/^[-−]/.test(sinEntre)) {
    const [primero, b] = partes.map((p) => p.trim()) as [string, string];
    // «30 a 50 mil»: el primero sin multiplicador hereda el del segundo.
    const mult = MULTIPLICADOR_FINAL.exec(b.replace(/\s+/g, ""));
    const a = mult && !MULTIPLICADOR_FINAL.test(primero.replace(/\s+/g, "")) ? `${primero} ${mult[1]}` : primero;
    const na = unNumero(a);
    const nb = unNumero(b);
    if (na === "negativo" || nb === "negativo") return { ok: false, aviso: AVISO_DATO_NEGATIVO };
    if (na === "invalido" || nb === "invalido") return { ok: false, aviso: AVISO_DATO_NO_ENTENDIDO };
    const desde = Math.min(na, nb);
    const hasta = Math.max(na, nb);
    if (hasta > MAXIMO_DATO) return { ok: false, aviso: AVISO_DATO_NO_ENTENDIDO };
    if (desde === hasta) return { ok: true, dato: { valor: desde, ...(aproximado ? { estado: "estimado" as const } : {}) } };
    return { ok: true, dato: { desde, hasta, estado: "estimado" } };
  }

  const n = unNumero(t);
  if (n === "negativo") return { ok: false, aviso: AVISO_DATO_NEGATIVO };
  if (n === "invalido" || n > MAXIMO_DATO) return { ok: false, aviso: AVISO_DATO_NO_ENTENDIDO };
  return { ok: true, dato: { valor: n, ...(aproximado ? { estado: "estimado" as const } : {}) } };
}

// ─── Estados ─────────────────────────────────────────────────────────────────────────────────────

/**
 * company_metricas.estado → EstadoDato. Allí «contado» es «dicho de memoria», que aquí es a ojo (estimado); un
 * número leído de un documento sin revisar (extraído) está anotado en algún sitio: contado; uno verificado está
 * comprobado; «sin_dato» es «no lo sé». Lo demás (descartado, sin rotular) no tiene equivalente: null.
 */
export function estadoDatoDesdeMetrica(estado: string | null | undefined): EstadoDato | null {
  switch (estado) {
    case "verificado": return "comprobado";
    case "extraido": return "contado";
    case "contado": return "estimado";
    case "sin_dato": return "no_lo_se";
    default: return null;
  }
}

const FUERZA: Record<Exclude<EstadoDato, "no_lo_se">, number> = { estimado: 0, contado: 1, comprobado: 2 };

/**
 * El más débil de varios (estimado < contado < comprobado): una cuenta vale lo que su dato más flojo. Si alguno es
 * «no lo sé», null: con eso no hay cuenta. Un estado que falta cuenta como estimado (lo que no dice de dónde salió no
 * puede valer más que un cálculo a ojo). Sin ninguno conocido, null.
 */
export function peorEstado(estados: (EstadoDato | null | undefined)[]): EstadoDato | null {
  if (!estados.length || estados.every((e) => e == null)) return null;
  if (estados.includes("no_lo_se")) return null;
  let peor: Exclude<EstadoDato, "no_lo_se"> = "comprobado";
  for (const e of estados) {
    const k = (e ?? "estimado") as Exclude<EstadoDato, "no_lo_se">;
    if (FUERZA[k] < FUERZA[peor]) peor = k;
  }
  return peor;
}
