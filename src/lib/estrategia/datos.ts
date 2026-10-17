/**
 * LAS VERSIONES DE LA ESTRATEGIA Y EN QUÉ VA CADA UNA (spec-estrategia-8x.md §5.3, §5.4 y §8.1).
 *
 * Lectura de servidor (service role, filtrando SIEMPRE por la empresa y con columnas explícitas): `versiones`,
 * `leerVersion`, `leerVersionPorId` y `trabajosDeVersion`.
 *
 * Y una función pura, `estadoDeEtapas`, que dice en qué va una versión que se está generando a partir de lo anotado en
 * la fila (`errores`, las columnas ya llenas) Y del estado de cada trabajo de la cola (`trabajos` → jobs.estado,
 * jobs.error, jobs.resultado). Las dos cosas: un trabajo que murió sin que su manejador anotara nada (la función
 * cortada, el lease vencido, un error inesperado tras tres intentos) también se ve. Sin esto, la versión quedaría
 * «generando» para siempre y bloquearía la siguiente.
 */
import { supabaseAdmin } from "../supabase/admin";
import { PREFIJO_PAUSA } from "../jobs/reglas";
import { ETAPA, MOTOR } from "./textos";
import type { Paquete } from "./paquete";
import type { Calculos } from "./calculos";
import type { Estrategia } from "./armar";
import type { Validacion } from "./validador";
import type { ResultadoControl } from "./calidad";
import type { ProyeccionesLentes } from "./motor";
import type { SalidaEquipoRojo, SalidaLenteDinero, SalidaLenteTerreno } from "./esquemas";

// ─── Tipos de la fila ────────────────────────────────────────────────────────────────────────────

export type EstadoVersion = "en_curso" | "lista" | "con_observaciones" | "aprobada" | "reemplazada" | "descartada";
export type EtapaVersion = "lentes" | "equipo_rojo" | "reparacion" | "armado" | "terminada";
/** Las etapas que corren en la cola, cada una con su trabajo en `trabajos`. */
export type EtapaMotor = "dinero" | "terreno" | "rojo";
export const ETAPAS_MOTOR: readonly EtapaMotor[] = ["dinero", "terreno", "rojo"];

/** Una etapa que falló, anotada por su manejador (o al ponerla en marcha). `job_id` dice de qué intento es. */
export type ErrorEtapa = {
  etapa: EtapaMotor | "poner_en_marcha";
  motivo: string;
  tipo: "salida_invalida" | "cortada" | "cuota_del_dia" | "no_se_puso_en_marcha" | "error";
  job_id: string | null;
  at: string;
};

/** Lo que guarda la columna `equipo_rojo`: la primera salida y, si hubo, la de la reparación. */
export type GuardadoEquipoRojo = { primera: SalidaEquipoRojo; reparacion: SalidaEquipoRojo | null };

export type VersionEstrategia = {
  id: string;
  company_id: string;
  version: number;
  estado: EstadoVersion;
  etapa: EtapaVersion;
  origen: "ia" | "actualizacion";
  paquete: Paquete;
  paquete_huella: string;
  calculos: Calculos;
  lente_dinero: (SalidaLenteDinero & { ids?: Record<string, string> }) | null;
  lente_terreno: (SalidaLenteTerreno & { ids?: Record<string, string> }) | null;
  proyecciones_lentes: ProyeccionesLentes | null;
  equipo_rojo: GuardadoEquipoRojo | null;
  salida: Estrategia | null;
  vigente: Estrategia | null;
  validacion: Partial<Validacion> & { de?: "primera" | "reparacion" | "final" };
  calidad: { items?: ResultadoControl[] };
  errores: ErrorEtapa[];
  trabajos: Partial<Record<EtapaMotor, string>>;
  camino_elegido: "a" | "b" | null;
  motivo_eleccion: string | null;
  para_dueno: unknown;
  basada_en: string | null;
  pedida_por: string | null;
  aprobada_por: string | null;
  aprobada_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ResumenVersion = Pick<VersionEstrategia, "id" | "version" | "estado" | "etapa" | "origen" | "camino_elegido" | "aprobada_at" | "created_at" | "updated_at">;

export const COLUMNAS_VERSION =
  "id,company_id,version,estado,etapa,origen,paquete,paquete_huella,calculos,lente_dinero,lente_terreno,proyecciones_lentes,equipo_rojo,salida,vigente,validacion,calidad,errores,trabajos,camino_elegido,motivo_eleccion,para_dueno,basada_en,pedida_por,aprobada_por,aprobada_at,created_at,updated_at";
export const COLUMNAS_RESUMEN = "id,version,estado,etapa,origen,camino_elegido,aprobada_at,created_at,updated_at";

/** Una fila de estrategias, con lo que falte puesto en vacío para no romper la pantalla. */
export function versionDesdeFila(f: Record<string, unknown>): VersionEstrategia {
  const obj = <T>(v: unknown, vacio: T): T => (v && typeof v === "object" && !Array.isArray(v) ? (v as T) : vacio);
  return {
    ...(f as unknown as VersionEstrategia),
    version: Number(f.version),
    errores: Array.isArray(f.errores) ? (f.errores as ErrorEtapa[]) : [],
    trabajos: obj(f.trabajos, {}),
    validacion: obj(f.validacion, {}),
    calidad: obj(f.calidad, {}),
  };
}

// ─── Lectura (servidor) ──────────────────────────────────────────────────────────────────────────

/** Un fallo de lectura con el código de Postgres: así se distingue «falta la migración» de un fallo de verdad. */
export class ErrorDeEstrategia extends Error {
  constructor(mensaje: string, readonly codigo: string | null = null) {
    super(mensaje);
    this.name = "ErrorDeEstrategia";
  }
}

/** Las versiones de una empresa, de la más nueva a la más vieja (como mucho cien). */
export async function versiones(companyId: string): Promise<ResumenVersion[]> {
  const { data, error } = await supabaseAdmin().from("estrategias").select(COLUMNAS_RESUMEN).eq("company_id", companyId).order("version", { ascending: false }).limit(100);
  if (error) throw new ErrorDeEstrategia(`No se pudieron leer las versiones de la estrategia: ${error.message}`, error.code ?? null);
  return ((data ?? []) as unknown as ResumenVersion[]).map((v) => ({ ...v, version: Number(v.version) })).sort((a, b) => b.version - a.version);
}

/** Una versión de ESTA empresa por su id, o null. El id solo no basta: la empresa va siempre en la consulta. */
export async function leerVersionPorId(companyId: string, id: string): Promise<VersionEstrategia | null> {
  const { data, error } = await supabaseAdmin().from("estrategias").select(COLUMNAS_VERSION).eq("id", id).eq("company_id", companyId).maybeSingle();
  if (error) throw new ErrorDeEstrategia(`No se pudo leer la versión de la estrategia: ${error.message}`, error.code ?? null);
  return data ? versionDesdeFila(data as Record<string, unknown>) : null;
}

/**
 * SOLO LO QUE HACE FALTA PARA DECIR EN QUÉ VA (revisión del 17-10): la pantalla lo pide cada pocos segundos mientras se
 * genera, y traer la fila entera (paquete, cálculos, lentes y salidas) cada vez era mover cientos de kilobytes para
 * pintar cuatro marcas. Las columnas grandes no se leen: de ellas solo se pregunta si ya están (una cuenta por cada una).
 * Si esa cuenta no se puede hacer, se lee la versión entera, como antes.
 */
export async function leerEtapasPorId(companyId: string, id: string): Promise<(VersionParaEtapas & Pick<VersionEstrategia, "id" | "company_id">) | null> {
  const sb = supabaseAdmin();
  const vacia = (col: "lente_dinero" | "lente_terreno" | "salida") => sb.from("estrategias").select("id", { count: "exact", head: true }).eq("id", id).eq("company_id", companyId).is(col, null);
  const [fila, sinDinero, sinTerreno, sinSalida] = await Promise.all([
    sb.from("estrategias").select("id,company_id,estado,etapa,errores,trabajos").eq("id", id).eq("company_id", companyId).maybeSingle(),
    vacia("lente_dinero"),
    vacia("lente_terreno"),
    vacia("salida"),
  ]);
  if (fila.error) throw new ErrorDeEstrategia(`No se pudo leer el avance de la estrategia: ${fila.error.message}`, fila.error.code ?? null);
  if (!fila.data) return null;
  if ([sinDinero, sinTerreno, sinSalida].some((r) => r.error || r.count == null)) return leerVersionPorId(companyId, id);
  // La cuenta es de las filas donde la columna está vacía: 0 quiere decir que ya está.
  const esta = (r: { count: number | null }) => (r.count === 0 ? true : null);
  const v = versionDesdeFila(fila.data as Record<string, unknown>);
  return { id: v.id, company_id: v.company_id, estado: v.estado, etapa: v.etapa, errores: v.errores, trabajos: v.trabajos, lente_dinero: esta(sinDinero), lente_terreno: esta(sinTerreno), salida: esta(sinSalida) };
}

/** La versión número `n` de la empresa, o la más nueva si no se dice cuál. */
export async function leerVersion(companyId: string, n?: number): Promise<VersionEstrategia | null> {
  const todas = await versiones(companyId);
  const elegida = n == null ? todas[0] : todas.find((v) => v.version === n);
  return elegida ? leerVersionPorId(companyId, elegida.id) : null;
}

/** Lo que la pantalla necesita de cada trabajo de una versión para decir en qué va. */
export type TrabajoEtapa = { id: string; estado: string; error: string | null; progreso: string | null; resultado: unknown };

/** Los trabajos de la cola que anota `trabajos` (el último de cada etapa). */
export async function trabajosDeVersion(v: Pick<VersionEstrategia, "company_id" | "trabajos">): Promise<TrabajoEtapa[]> {
  const ids = ETAPAS_MOTOR.map((e) => v.trabajos[e]).filter((x): x is string => !!x);
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin().from("jobs").select("id,estado,error,progreso,resultado").eq("company_id", v.company_id).in("id", ids);
  if (error) throw new ErrorDeEstrategia(`No se pudo leer el avance de la estrategia: ${error.message}`, error.code ?? null);
  return (data ?? []) as unknown as TrabajoEtapa[];
}

// ─── En qué va (puro) ────────────────────────────────────────────────────────────────────────────

export type EstadoEtapa = "esperando" | "en_cola" | "corriendo" | "lista" | "fallida" | "en_pausa";
export type Paso = {
  clave: EtapaMotor | "revision";
  /** «Pensando el camino del dinero», «Poniéndolos a prueba»… */
  texto: string;
  estado: EstadoEtapa;
  /** Por qué falló, en palabras, o qué está pasando (el progreso del trabajo). */
  detalle: string | null;
  /** El trabajo de la cola que se reintentaría (el último de la etapa). */
  job_id: string | null;
  /** Se puede reintentar esta etapa (§5.4). */
  reintentable: boolean;
};
export type EstadoDeEtapas = {
  pasos: Paso[];
  /** Alguna etapa falló: la pantalla ofrece «Reintentar esta etapa» y «Descartar esta versión». */
  fallida: boolean;
  /** La generación terminó (la versión dejó de estar en curso). */
  terminada: boolean;
  /** Una línea para la consultora con lo que falló (§5.4), o null. */
  aviso: string | null;
};

type VersionParaEtapas = Pick<VersionEstrategia, "estado" | "etapa" | "errores" | "trabajos"> & {
  lente_dinero: unknown;
  lente_terreno: unknown;
  salida: unknown;
};

const NOMBRE: Record<EtapaMotor, string> = { dinero: ETAPA.dinero.nombre, terreno: ETAPA.terreno.nombre, rojo: ETAPA.rojo.nombre };
const PENSANDO: Record<EtapaMotor | "revision", string> = { dinero: ETAPA.dinero.pensando, terreno: ETAPA.terreno.pensando, rojo: ETAPA.rojo.pensando, revision: ETAPA.revision.pensando };

/** Lo que dice el trabajo de una etapa que no tiene su resultado guardado. */
function desdeTrabajo(etapa: EtapaMotor, v: VersionParaEtapas, jobs: readonly TrabajoEtapa[]): Omit<Paso, "clave" | "texto"> {
  const id = v.trabajos[etapa] ?? null;
  const anotado = v.errores.filter((e) => e.etapa === etapa && (e.job_id == null || e.job_id === id)).at(-1);
  if (anotado) return { estado: "fallida", detalle: anotado.motivo, job_id: id, reintentable: true };
  if (!id) return { estado: "fallida", detalle: MOTOR.sin_trabajo, job_id: null, reintentable: false };
  const j = jobs.find((x) => x.id === id);
  if (!j) return { estado: "en_cola", detalle: null, job_id: id, reintentable: false };
  const fallidaEnResultado = (j.resultado as { fallida?: boolean; motivo?: string } | null)?.fallida ? (j.resultado as { motivo?: string }).motivo ?? null : null;
  if (fallidaEnResultado) return { estado: "fallida", detalle: fallidaEnResultado, job_id: id, reintentable: true };
  if (j.estado === "fallido") return { estado: "fallida", detalle: MOTOR.etapa_no_termino(NOMBRE[etapa], j.error ?? "sin motivo anotado"), job_id: id, reintentable: true };
  if (j.estado === "pendiente" && j.error?.startsWith(PREFIJO_PAUSA)) return { estado: "en_pausa", detalle: MOTOR.en_pausa, job_id: id, reintentable: false };
  if (j.estado === "corriendo") return { estado: "corriendo", detalle: j.progreso, job_id: id, reintentable: false };
  if (j.estado === "pendiente") return { estado: "en_cola", detalle: j.progreso, job_id: id, reintentable: false };
  // «hecho» sin el resultado guardado ni falla anotada: el manejador terminó sin escribir lo suyo.
  return { estado: "fallida", detalle: MOTOR.sin_resultado, job_id: id, reintentable: true };
}

/**
 * En qué va una versión: un paso por etapa (las dos lentes, la prueba y la revisión de cada cifra), cada uno con su
 * estado y, si falló, por qué y si se puede reintentar. Lo deduce de la fila y de los trabajos de la cola.
 */
export function estadoDeEtapas(v: VersionParaEtapas, jobs: readonly TrabajoEtapa[]): EstadoDeEtapas {
  const terminada = v.estado !== "en_curso";
  const paso = (clave: Paso["clave"], x: Omit<Paso, "clave" | "texto">): Paso => ({ clave, texto: PENSANDO[clave], ...x });
  const listo: Omit<Paso, "clave" | "texto"> = { estado: "lista", detalle: null, job_id: null, reintentable: false };

  const lentes = (["dinero", "terreno"] as const).map((l) => {
    const guardada = l === "dinero" ? v.lente_dinero : v.lente_terreno;
    return paso(l, guardada || terminada ? { ...listo, job_id: v.trabajos[l] ?? null } : desdeTrabajo(l, v, jobs));
  });
  const lasDos = lentes.every((p) => p.estado === "lista");

  let rojo: Paso;
  let revision: Paso;
  if (terminada) {
    rojo = paso("rojo", { ...listo, job_id: v.trabajos.rojo ?? null });
    revision = paso("revision", listo);
  } else if (!lasDos) {
    rojo = paso("rojo", { estado: "esperando", detalle: MOTOR.espera_los_dos, job_id: null, reintentable: false });
    revision = paso("revision", { estado: "esperando", detalle: null, job_id: null, reintentable: false });
  } else if (!v.trabajos.rojo) {
    // Las dos lentes están; si sus trabajos ya terminaron y nadie puso en marcha la prueba, es una falla que se reintenta.
    const lentesTerminaron = (["dinero", "terreno"] as const).every((l) => jobs.find((j) => j.id === v.trabajos[l])?.estado === "hecho");
    rojo = paso("rojo", lentesTerminaron ? { estado: "fallida", detalle: MOTOR.rojo_sin_lanzar, job_id: null, reintentable: true } : { estado: "en_cola", detalle: null, job_id: null, reintentable: false });
    revision = paso("revision", { estado: "esperando", detalle: null, job_id: null, reintentable: false });
  } else {
    // La primera vuelta de la prueba ya terminó si la versión pasó a la revisión: entonces el trabajo de `rojo` es el de
    // la reparación, y lo que diga es de la revisión de cada cifra.
    const r = desdeTrabajo("rojo", v, jobs);
    const enRevision = v.etapa === "reparacion" || v.etapa === "armado";
    rojo = paso("rojo", enRevision ? { ...listo, job_id: r.job_id } : r);
    revision = paso("revision", enRevision ? r : { estado: "esperando", detalle: null, job_id: null, reintentable: false });
  }

  const pasos = [...lentes, rojo, revision];
  const fallidas = pasos.filter((p) => p.estado === "fallida");
  let aviso: string | null = null;
  if (fallidas.length) {
    const [dinero, terreno] = lentes;
    if (dinero!.estado === "lista" && terreno!.estado === "fallida") aviso = MOTOR.lente_lista_y_fallida(ETAPA.dinero.nombre, ETAPA.terreno.nombre, terreno!.detalle ?? "");
    else if (terreno!.estado === "lista" && dinero!.estado === "fallida") aviso = MOTOR.lente_lista_y_fallida(ETAPA.terreno.nombre, ETAPA.dinero.nombre, dinero!.detalle ?? "");
    else aviso = fallidas.map((p) => MOTOR.etapa_fallida(p.clave === "revision" ? ETAPA.revision.nombre : NOMBRE[p.clave as EtapaMotor], p.detalle ?? "")).join(" ");
  }
  return { pasos, fallida: fallidas.length > 0, terminada, aviso };
}
