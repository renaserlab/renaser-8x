/**
 * EL VOCABULARIO DE LAS CUENTAS DE LA ESTRATEGIA (spec-estrategia-8x.md §4).
 *
 * Cada cuenta es un `Calculo<Rango>` de finanzas.ts (fórmula, periodo, fuentes, supuestos, limitaciones; o null con su
 * motivo) más tres cosas que la estrategia necesita para pintarla sin mentir: su id (`C:…`), su unidad y su CLASE, que
 * es la del insumo más débil (sin dato < supuesto < estimado < hecho). Una cuenta hecha con un estimado del dueño vale
 * como estimado, aunque la fórmula sea exacta.
 *
 * Los insumos dicen de dónde salen en palabras, sin ids: «la venta del mes, estimado del dueño».
 *
 * Puro: sin base, sin red, sin IA.
 */
import type { Calculo } from "../finanzas";
import { estadoDatoDesdeMetrica, esExacto, rangoDe, type DatoOral, type EstadoDato, type Rango } from "../dato-oral";
import type { ConfigEmpresa } from "../formato";
import { normalizarMetrica, periodoEnPalabras, PERIODO_DORADA } from "../metricas";
import { vitalMasReciente } from "../rentabilidad";
import { metricasQueEntran, textoDeValor, type ClaseRef, type MetricaEntrada, type RefValor, type RespuestaEntrada, type Unidad } from "./paquete";

/** De la más débil a la más fuerte. */
export const FUERZA_CLASE: Record<ClaseRef, number> = { sin_dato: 0, supuesto: 1, estimado: 2, hecho: 3 };

/** La clase más débil. Sin ninguna, hecho (una constante del código no debilita nada). */
export function peorClase(clases: ClaseRef[]): ClaseRef {
  return clases.reduce<ClaseRef>((peor, c) => (FUERZA_CLASE[c] < FUERZA_CLASE[peor] ? c : peor), "hecho");
}

/** EstadoDato → clase de una cifra. Un estado que falta cuenta como estimado (peorEstado de dato-oral.ts). */
export function claseRefDeEstado(e: EstadoDato | null | undefined): ClaseRef {
  if (e === "comprobado" || e === "contado") return "hecho";
  if (e === "no_lo_se") return "sin_dato";
  return "estimado";
}

/** company_metricas.estado → clase de una cifra, por la única equivalencia que existe (estadoDatoDesdeMetrica). */
export const claseRefDeMetrica = (estado: string | null | undefined): ClaseRef => claseRefDeEstado(estadoDatoDesdeMetrica(estado) ?? "estimado");

/** Un insumo de una cuenta: su valor (o null con su motivo), su clase y de dónde sale, en palabras. */
export type Insumo = {
  id: string;
  /** Qué es, en minúscula y sin ids: «la venta del mes». */
  nombre: string;
  valor: Rango | null;
  unidad: Unidad;
  clase: ClaseRef;
  /** De dónde sale: «setiembre de 2026, dicho de memoria», «la tabla de productos, 9 de 10 líneas». */
  fuente: string;
  motivo_nulo?: string;
  provisional?: true;
  /** Lo que hay que saber de este insumo para leer bien la cuenta (periodos distintos, datos a ojo…). */
  limitaciones?: string[];
  /** El periodo del número (AAAA-MM, «actual» o la mejor época), cuando sale de los nueve números. */
  periodo?: string;
};

export function insumoNulo(id: string, nombre: string, unidad: Unidad, motivo: string): Insumo {
  return { id, nombre, valor: null, unidad, clase: "sin_dato", fuente: "sin dato", motivo_nulo: motivo };
}

/** Una cuenta de la estrategia, lista para pintar y para validar. */
export type Cuenta = {
  id: string;
  nombre: string;
  unidad: Unidad;
  clase: ClaseRef;
  calculo: Calculo<Rango>;
  /** Los insumos que la sostienen, en palabras: es el «origen» de la cifra. */
  origen: { nombre: string; clase: ClaseRef }[];
  provisional?: true;
};

type Marco = { formula: string; periodo?: string; supuestos?: string[]; limitaciones?: string[] };

/**
 * Arma una cuenta con sus insumos: clase la más débil, fuentes en palabras, provisional si algún insumo lo es, y las
 * limitaciones de cada insumo. Con `valor` null hace falta el motivo.
 */
export function cuenta(id: string, nombre: string, unidad: Unidad, insumos: Insumo[], marco: Marco, valor: Rango | null, motivo?: string): Cuenta {
  const provisional = insumos.some((i) => i.provisional);
  const limitaciones = [...(marco.limitaciones ?? []), ...insumos.flatMap((i) => i.limitaciones ?? [])];
  const calculo: Calculo<Rango> = {
    valor,
    formula: marco.formula,
    periodo: marco.periodo ?? "un mes",
    fuentes: insumos.map((i) => `${i.nombre}: ${i.fuente}`),
    supuestos: [...(marco.supuestos ?? [])],
    limitaciones: [...new Set(limitaciones)],
    ...(valor == null ? { motivo_nulo: motivo ?? "faltan datos" } : {}),
  };
  return {
    id,
    nombre,
    unidad,
    clase: valor == null ? "sin_dato" : peorClase(insumos.map((i) => i.clase)),
    calculo,
    origen: insumos.map((i) => ({ nombre: i.nombre, clase: i.clase })),
    ...(provisional && valor != null ? { provisional: true as const } : {}),
  };
}

/** Lo que falta de una lista de insumos, en una frase. */
export function motivoDeFaltantes(insumos: Insumo[]): string {
  const faltan = [...new Set(insumos.filter((i) => !i.valor).map((i) => i.nombre))];
  if (!faltan.length) return "faltan datos";
  if (faltan.length === 1) return `falta ${faltan[0]}`;
  return `faltan ${faltan.slice(0, -1).join(", ")} y ${faltan[faltan.length - 1]}`;
}

const CHIP_ORIGEN: Record<ClaseRef, string> = { hecho: "hecho", estimado: "estimado del dueño", supuesto: "por confirmar", sin_dato: "sin dato" };

/** «sale de la venta del mes, estimado del dueño, y de cuánto sube el precio, por confirmar». Sin ids. */
export function textoDeOrigen(origen: { nombre: string; clase: ClaseRef }[]): string {
  const vistos = new Set<string>();
  const partes = origen
    .filter((o) => (vistos.has(o.nombre) ? false : (vistos.add(o.nombre), true)))
    .map((o) => `${o.nombre}, ${CHIP_ORIGEN[o.clase]}`);
  if (!partes.length) return "";
  if (partes.length === 1) return `sale de ${partes[0]}`;
  return `sale de ${partes.slice(0, -1).join("; ")}; y de ${partes[partes.length - 1]}`;
}

/** La cuenta como la ve el pintor y el validador. */
export function refDeCuenta(c: Cuenta, cfg: ConfigEmpresa): RefValor {
  return {
    valor: c.calculo.valor,
    unidad: c.unidad,
    // Una cuenta que no sale solo de hechos, o que es un rango, se escribe redondeada: sin precisión falsa.
    texto: textoDeValor(c.calculo.valor, c.unidad, cfg, { redondear: c.clase !== "hecho" || (!!c.calculo.valor && c.calculo.valor.bajo !== c.calculo.valor.alto) }),
    clase: c.clase,
    formula: c.calculo.formula,
    nombre: c.nombre,
    ...(c.calculo.valor == null ? { motivo_nulo: c.calculo.motivo_nulo ?? "faltan datos" } : {}),
    ...(c.provisional ? { provisional: true as const } : {}),
  };
}

/** Un insumo como referencia (los «hoy» del poder del uno: días de cobro, gastos del mes…). */
export function refDeInsumo(i: Insumo, cfg: ConfigEmpresa): RefValor {
  return {
    valor: i.valor,
    unidad: i.unidad,
    texto: textoDeValor(i.valor, i.unidad, cfg),
    clase: i.valor ? i.clase : "sin_dato",
    formula: i.fuente,
    nombre: i.nombre,
    ...(i.valor ? {} : { motivo_nulo: i.motivo_nulo ?? "sin dato" }),
    ...(i.provisional ? { provisional: true as const } : {}),
  };
}

/** Suma rangos que sí existen. Sin ninguno, null (no es cero). */
export function sumaDeExistentes(rs: (Rango | null)[]): Rango | null {
  const hay = rs.filter((r): r is Rango => r != null);
  return hay.length ? hay.reduce((s, r) => ({ bajo: s.bajo + r.bajo, alto: s.alto + r.alto }), { bajo: 0, alto: 0 }) : null;
}

export const CERO: Rango = Object.freeze({ bajo: 0, alto: 0 }) as Rango;
export const exacto = (n: number): Rango => ({ bajo: n, alto: n });

// ─── Insumos desde los datos de la empresa ───────────────────────────────────────────────────────

const COMO_METRICA: Record<string, string> = {
  verificado: "verificado con un documento",
  extraido: "leído de un documento, falta revisar",
  contado: "dicho de memoria",
};

/**
 * Un número de los nueve (o reconocido) como insumo: el más reciente, nunca el de la mejor época (vitalMasReciente de
 * rentabilidad.ts), salvo que se pida la mejor época. `ceroEsSinDato`: en gastos fijos y costos variables un cero no
 * es un dato (metricas.ts): se trata como sin dato y se dice.
 */
export function insumoDeVital(
  metricas: MetricaEntrada[],
  clave: string,
  nombre: string,
  unidad: Unidad,
  opciones: { ceroEsSinDato?: boolean; mejorEpoca?: boolean } = {}
): Insumo {
  const validas = metricasQueEntran(metricas);
  let v: { valor: number; periodo: string; estado: string | null } | null;
  if (opciones.mejorEpoca) {
    const m = validas.find((x) => normalizarMetrica(x.clave, x.periodo).periodo === PERIODO_DORADA && normalizarMetrica(x.clave, x.periodo).clave === clave && x.valor != null && Number.isFinite(Number(x.valor)));
    v = m ? { valor: Number(m.valor), periodo: PERIODO_DORADA, estado: (m.estado as string | null | undefined) ?? null } : null;
  } else v = vitalMasReciente(validas, clave);
  const id = opciones.mejorEpoca ? `N:${clave}@${PERIODO_DORADA}` : `N:${clave}`;
  if (!v) return insumoNulo(id, nombre, unidad, `falta ${nombre}`);
  if (opciones.ceroEsSinDato && v.valor <= 0) return insumoNulo(id, nombre, unidad, `${nombre} está anotado en cero: un cero aquí no es un dato`);
  return {
    id,
    nombre,
    valor: exacto(v.valor),
    unidad,
    clase: claseRefDeMetrica(v.estado),
    fuente: `${periodoEnPalabras(v.periodo)}, ${COMO_METRICA[v.estado ?? ""] ?? "sin rotular"}`,
    ...(v.estado === "extraido" ? { provisional: true as const } : {}),
    periodo: v.periodo,
  };
}

/** La respuesta más reciente del dueño a una pregunta de la estrategia, como insumo. Sin respuesta con número, sin dato. */
export function insumoDeRespuesta(respuestas: RespuestaEntrada[], clave: string, nombre: string, unidad: Unidad): Insumo {
  const r = respuestas
    .filter((x) => x.clave === clave && x.respuesta && rangoDe(x.respuesta))
    .sort((a, b) => (b.respondida_at ?? "").localeCompare(a.respondida_at ?? ""))[0];
  if (!r) {
    const dijo = respuestas.some((x) => x.clave === clave && x.respuesta?.estado === "no_lo_se");
    return insumoNulo(`X:${clave}`, nombre, unidad, dijo ? `el dueño dijo que no sabe ${nombre}` : `falta ${nombre}`);
  }
  const rango = rangoDe(r.respuesta)!;
  const clase = claseRefDeEstado(r.respuesta!.estado);
  return { id: `Q:${clave}`, nombre, valor: rango, unidad, clase: !esExacto(rango) && clase === "hecho" ? "estimado" : clase, fuente: r.respondida_at ? `respondió el dueño el ${r.respondida_at.slice(0, 10)}` : "respondió el dueño" };
}

/** Un dato dicho (ficha del negocio) como insumo. */
export function insumoDeDato(id: string, nombre: string, unidad: Unidad, dato: Partial<DatoOral> | null | undefined, fuente: string): Insumo {
  const r = dato ? rangoDe(dato) : null;
  if (!r || dato?.estado === "no_lo_se") return insumoNulo(id, nombre, unidad, dato?.estado === "no_lo_se" ? `el dueño dijo que no sabe ${nombre}` : `falta ${nombre}`);
  const clase = claseRefDeEstado(dato!.estado ?? null);
  return { id, nombre, valor: r, unidad, clase: !esExacto(r) && clase === "hecho" ? "estimado" : clase, fuente };
}
