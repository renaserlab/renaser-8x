/**
 * LOS HECHOS DE LA RUTA, LEÍDOS DE LA BASE (16-10-2026). SERVIDOR.
 *
 * `ruta.ts` decide (puro); aquí se lee. Una lectura por tabla, todas en paralelo, con columnas explícitas y conteos
 * `head: true` donde solo se cuenta. Cada lectura que falla queda en null —y la ruta la muestra como «no se pudo
 * leer»—: una tabla ausente o una migración pendiente no rompe la página (mismo patrón que `pendientesDelDueno` en
 * src/lib/tablero.ts).
 *
 * PARA 100 O 1.000 EMPRESAS A LA VEZ. La barra de avance va en los dos layouts (consultora y portal) y el portal se
 * vuelve a pintar con cada guardado (router.refresh): sin caché, cada guardado de una caja eran 15 consultas. Ahora la
 * lectura se parte en dos y cada parte se guarda en la caché de Next por empresa (unstable_cache, con su etiqueta):
 *  - `negocio`: lo que la empresa anota de su negocio (productos, gastos del mes, su ficha). Se refresca con cada
 *    escritura de productos, gastos, ficha y ventas en otra moneda: 4 consultas, no 15;
 *  - `ruta`: lo demás (números, punto de partida, pedidos, plan, indicadores, revisiones, organigrama, procesos,
 *    marcas). Se refresca con lo que escriben las solicitudes, la ruta y los indicadores; y si no, a los 5 minutos.
 * Lo que depende del día (el día de la ruta, lo vencido, lo reciente) se calcula al armar, nunca dentro de la caché.
 * Dentro de una petición, `cache` de React hace que la barra y el Panorama compartan la misma lectura.
 * Fuera de Next (pruebas, scripts) no hay caché: se lee directo, igual que antes.
 *
 * Si las columnas de la ruta no existen todavía en companies (migracion-entrar-hoy.sql sin aplicar), no hay ruta:
 * `avanceDeEmpresa` devuelve null y la barra lo dice en una línea.
 */
import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase/admin";
import { normalizarMetrica, CLAVES_VITALES, type Metrica } from "./metricas";
import { desdeFila as kpiDesdeFila, preparacion, zonaDe } from "./kpis";
import { estadoCanonico } from "./plan-reglas";
import { desdeFila as lineaDesdeFila } from "./producto";
import { productoRentable, fichaDesdeFila, FICHA_VACIA } from "./rentabilidad";
import { respondidasDeHistoria } from "./esquemas-negocio";
import { avanceRuta, etapasDe, esTipoTrabajo, type AvanceRuta, type HechosRuta, type Marca, type TipoTrabajo } from "./ruta";

type Lector = Pick<SupabaseClient, "from">;
type Respuesta = { data: unknown; error: { message?: string | null; code?: string | null } | null; count?: number | null };

/** Las filas de una lectura, o null si no se pudo leer. Una lista vacía es «se leyó y no hay». */
async function filas<T>(pedir: () => PromiseLike<Respuesta>): Promise<T[] | null> {
  try {
    const { data, error } = await pedir();
    return error ? null : ((data ?? []) as T[]);
  } catch {
    return null;
  }
}

/** Un conteo, o null si no se pudo leer. */
async function contar(pedir: () => PromiseLike<Respuesta>): Promise<number | null> {
  try {
    const { count, error } = await pedir();
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

const DIA_MS = 86_400_000;
const sumarDias = (dia: string, n: number): string => new Date(Date.parse(`${dia.slice(0, 10)}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** El día de calendario de la empresa hoy (AAAA-MM-DD). */
function hoyEn(zona: string, ahora: Date): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(ahora).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Meses de calendario que cerraron por completo entre `desde` (incluido) y `hoy` (excluido). */
export function mesesCerradosDesde(desde: string, hoy: string): number {
  if (desde > hoy) return 0;
  const [a1, m1] = desde.split("-").map(Number) as [number, number];
  const [a2, m2] = hoy.split("-").map(Number) as [number, number];
  // El mes en que se empieza solo cuenta si se empezó el día 1.
  const primeroCompleto = desde.endsWith("-01") ? a1 * 12 + (m1 - 1) : a1 * 12 + m1;
  const actual = a2 * 12 + (m2 - 1); // el mes en curso no cerró
  return Math.max(0, actual - primeroCompleto);
}

/**
 * Una acción del plan, solo para LEER si venció y si se verificó a tiempo. Aquí no se escribe nada: la verificación
 * vive en la máquina de estados (plan-intervencion.ts), y el tipo se arma sin nombrar el campo como escritura.
 */
type FilaAccion = { estado: string; vence_at: string | null } & Partial<Record<"verificado_at", string | null>>;

const COLUMNAS_KPI =
  "id,company_id,clave,nombre,como_se_mide,estado,unidad,moneda,frecuencia,definicion,formula,fuente,responsable_participant_id,linea_base_valor,linea_base_periodo,meta_valor,meta_texto,meta_plazo,valor_actual,valor_actual_periodo,valor_actual_at,estado_validacion,umbral_alerta,umbral_sentido,accion_asociada_id,decision_asociada,tipo_indicador";
const COLUMNAS_LINEA =
  "id,company_id,nombre,tipo,precio,costo_variable_unitario,unidades_periodo,horas_por_unidad,periodo,modelo,grupo,precio_segundo,segundo_precio_es,de_cada_10_segundo,componentes_costo,unidades_mes,unidades_mes_desde,unidades_mes_hasta,participacion_de_10,estados,datos_modelo";

// ─── Lo que la empresa anota de su negocio (parte «negocio») ─────────────────────────────────────

/** Lo que la empresa dejó guardado en cada pantalla de «Mi empresa» que se abre con una solicitud. */
export type GuardadoPortal = { costos: boolean; historia: boolean; cobros: boolean };

/** Productos, gastos e historia para la ruta, y qué hay guardado para el portal. No depende del día. */
export type LecturaNegocio = Pick<HechosRuta, "productos" | "costos" | "historia"> & { guardado: GuardadoPortal | null };

export async function leerNegocioCon(sb: Lector, companyId: string): Promise<LecturaNegocio> {
  const [lineas, costos, ficha, operaciones] = await Promise.all([
    filas<Record<string, unknown>>(() => sb.from("lineas_producto").select(COLUMNAS_LINEA).eq("company_id", companyId).limit(1000)),
    filas<{ monto: number | null; monto_desde: number | null }>(() => sb.from("costos_mes").select("monto,monto_desde").eq("company_id", companyId).limit(200)),
    filas<Record<string, unknown>>(() => sb.from("ficha_negocio").select("historia,totales,modulos,moneda,credito,inventario").eq("company_id", companyId).limit(1)),
    contar(() => sb.from("operaciones_moneda").select("id", { count: "exact", head: true }).eq("company_id", companyId)),
  ]);
  const fichaNegocio = ficha ? (ficha[0] ? fichaDesdeFila(ficha[0]) : { ...FICHA_VACIA }) : null;

  let productos: HechosRuta["productos"] = null;
  if (lineas) {
    const f = fichaNegocio ?? { ...FICHA_VACIA };
    const completas = lineas.map(lineaDesdeFila).filter((l) => {
      const p = productoRentable(l, f);
      return p.precio_efectivo && p.costo && p.unidades_mes;
    }).length;
    productos = { lineas: lineas.length, completas };
  }

  const hay = (o: object | null | undefined) => !!o && Object.keys(o).length > 0;
  const guardado: GuardadoPortal | null =
    costos && fichaNegocio
      ? {
          costos: costos.length > 0,
          historia: hay(fichaNegocio.historia),
          cobros: Object.values(fichaNegocio.modulos).some((v) => v != null) || hay(fichaNegocio.moneda) || hay(fichaNegocio.credito) || hay(fichaNegocio.inventario) || (operaciones ?? 0) > 0,
        }
      : null;

  return {
    productos,
    costos: costos ? { conMonto: costos.filter((c) => c.monto != null || c.monto_desde != null).length } : null,
    historia: fichaNegocio ? { respondidas: respondidasDeHistoria(fichaNegocio.historia) } : null,
    guardado,
  };
}

// ─── Lo demás de la ruta (parte «ruta»), leído sin el día ────────────────────────────────────────

/** Lo que se lee para la ruta fuera del negocio: ya resumido donde no depende del día; en bruto lo justo donde sí. */
export type LecturaRuta = {
  empresa: { tipo_trabajo: string | null; ruta_inicio: string | null; zona_horaria: string | null } | null;
  numeros: HechosRuta["numeros"];
  mediciones: { tipo: string; vigente: boolean | null; fecha: string | null }[] | null;
  pedidos: HechosRuta["pedidos"];
  actasPlan: number | null;
  /** Por indicador activo: si está listo (no depende del día) y cuándo se anotó su último valor. */
  indicadores: { listo: boolean; valor_actual_at: string | null }[] | null;
  revisiones: { semana: string; revisada_at: string | null }[] | null;
  /** Las acciones del plan, con su estado ya leído como uno de los de hoy. */
  acciones: { estado: string; vence_at: string | null; verificada_el: string | null }[] | null;
  organigrama: HechosRuta["organigrama"];
  procesos: HechosRuta["procesos"];
  marcas: Record<string, Marca>;
};

export async function leerRutaCon(sb: Lector, companyId: string): Promise<LecturaRuta> {
  const [empresa, metricas, mediciones, solicitudes, actasPlan, indicadores, revisiones, acciones, puestos, documentos, procesos, marcas] = await Promise.all([
    filas<{ tipo_trabajo: string | null; ruta_inicio: string | null; zona_horaria: string | null }>(() => sb.from("companies").select("tipo_trabajo,ruta_inicio,zona_horaria").eq("id", companyId).limit(1)),
    filas<Metrica>(() => sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", companyId).limit(200)),
    filas<{ tipo: string; vigente: boolean | null; fecha: string | null }>(() => sb.from("mediciones").select("tipo,vigente,fecha").eq("company_id", companyId).limit(500)),
    filas<{ estado: string }>(() => sb.from("solicitudes_cliente").select("estado").eq("company_id", companyId).in("estado", ["activa", "completada"]).limit(500)),
    contar(() => sb.from("actas_aceptacion").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("tipo", "plan")),
    filas<Record<string, unknown>>(() => sb.from("indicadores").select(COLUMNAS_KPI).eq("company_id", companyId).eq("estado", "activo").limit(200)),
    filas<{ semana: string; revisada_at: string | null }>(() => sb.from("revisiones_semanales").select("semana,revisada_at").eq("company_id", companyId).limit(200)),
    filas<FilaAccion>(() => sb.from("actions").select("estado,vence_at,verificado_at").eq("company_id", companyId).limit(500)),
    contar(() => sb.from("org_puestos").select("id", { count: "exact", head: true }).eq("company_id", companyId)),
    filas<{ clave: string; confirmado_at: string | null }>(() => sb.from("company_assets").select("clave,confirmado_at").eq("company_id", companyId).in("clave", ["personas.organigrama", "personas.funciones"])),
    filas<{ id: string; version: string | null; sops: { indicador: string | null }[] | null }>(() => sb.from("processes").select("id,version,sops(indicador)").eq("company_id", companyId).limit(500)),
    filas<{ clave: string; valor: Marca["valor"]; nota: string | null; marcado_at: string | null }>(() => sb.from("ruta_marcas").select("clave,valor,nota,marcado_at").eq("company_id", companyId).limit(200)),
  ]);

  // Los 9 números: con cifra, comprobados, y si están la venta y el gasto fijo.
  let numeros: HechosRuta["numeros"] = null;
  if (metricas) {
    const conCifra = new Set<string>();
    const comprobados = new Set<string>();
    for (const m of metricas) {
      const n = normalizarMetrica(m.clave, m.periodo);
      if (!CLAVES_VITALES.has(n.clave) || m.valor == null || m.estado === "descartado") continue;
      conCifra.add(n.clave);
      if (m.estado === "verificado") comprobados.add(n.clave);
    }
    numeros = { conCifra: conCifra.size, comprobados: comprobados.size, venta: conCifra.has("venta_mes"), gastoFijo: conCifra.has("gasto_fijo_mes") };
  }

  let procesosH: HechosRuta["procesos"] = null;
  if (procesos) {
    const dibujados = procesos.filter((p) => p.version !== "sin_dibujar");
    procesosH = {
      dibujados: dibujados.length,
      conSop: dibujados.filter((p) => (p.sops ?? []).length > 0).length,
      conIndicador: dibujados.filter((p) => (p.sops ?? []).some((s) => !!s.indicador?.trim())).length,
    };
  }

  const marcasH: Record<string, Marca> = {};
  for (const m of marcas ?? []) marcasH[m.clave] = { valor: m.valor, nota: m.nota ?? null, marcado_at: m.marcado_at ?? null };

  return {
    empresa: empresa?.[0] ?? null,
    numeros,
    mediciones,
    pedidos: solicitudes
      ? { activadas: solicitudes.length, completadas: solicitudes.filter((s) => s.estado === "completada").length, abiertas: solicitudes.filter((s) => s.estado === "activa").length }
      : null,
    actasPlan,
    indicadores: indicadores
      ? indicadores.map(kpiDesdeFila).map((k) => ({ listo: preparacion(k) !== "por_definir", valor_actual_at: k.valor_actual_at ?? null }))
      : null,
    revisiones,
    acciones: acciones ? acciones.map((a) => ({ estado: estadoCanonico(a), vence_at: a.vence_at ?? null, verificada_el: a.verificado_at ?? null })) : null,
    organigrama: puestos != null && documentos ? { puestos, documentoConfirmado: documentos.some((d) => !!d.confirmado_at) } : null,
    procesos: procesosH,
    marcas: marcasH,
  };
}

// ─── Los hechos, armados con el día de hoy ──────────────────────────────────────────────────────

/** Los estados de una acción que ya es parte del plan (aprobada en adelante). */
const DEL_PLAN = new Set(["aprobado", "en_ejecucion", "reportado", "verificado", "bloqueado"]);

/** Arma los hechos de la ruta con lo leído y el día de la empresa. null si la empresa no existe o no tiene las columnas. */
export function armarHechos(r: LecturaRuta, n: LecturaNegocio, ahora: Date = new Date()): HechosRuta | null {
  const fila = r.empresa;
  if (!fila) return null;
  const tipo: TipoTrabajo | null = esTipoTrabajo(fila.tipo_trabajo) ? fila.tipo_trabajo : null;
  const inicio = typeof fila.ruta_inicio === "string" ? fila.ruta_inicio.slice(0, 10) : null;
  const zona = zonaDe(fila.zona_horaria);
  const hoy = hoyEn(zona, ahora);

  let indicadoresH: HechosRuta["indicadores"] = null;
  if (r.indicadores) {
    const desde = ahora.getTime() - 14 * DIA_MS;
    indicadoresH = {
      activos: r.indicadores.length,
      listos: r.indicadores.filter((k) => k.listo).length,
      conValorReciente: r.indicadores.filter((k) => k.valor_actual_at && Date.parse(k.valor_actual_at) >= desde).length,
    };
  }

  // Revisiones: las semanas completas desde el día 8 de la ruta, y cuántas de esas quedaron revisadas.
  let revisionesH: HechosRuta["revisiones"] = null;
  if (r.revisiones) {
    const dia8 = inicio ? sumarDias(inicio, 7) : null;
    const esperadas = dia8 && hoy >= dia8 ? Math.floor((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${dia8}T00:00:00Z`)) / (7 * DIA_MS)) : 0;
    const revisadas = dia8 ? r.revisiones.filter((x) => x.revisada_at && x.semana.slice(0, 10) >= dia8).length : 0;
    revisionesH = { esperadas, revisadas };
  }

  // El plan, por resultados y no por calendario: cuentan las acciones aprobadas que ya vencieron Y las que ya se
  // verificaron (aunque todavía no vencieran); a tiempo es verificada el día de su vencimiento o antes (o sin fecha).
  // Una empresa que cumplió todo antes de tiempo no espera a ninguna fecha para salir en verde.
  let plan: HechosRuta["plan"] = null;
  if (r.acciones) {
    const aprobadas = r.acciones.filter((a) => DEL_PLAN.has(a.estado));
    const verificada = (a: (typeof aprobadas)[number]) => a.estado === "verificado" && !!a.verificada_el;
    const vencida = (a: (typeof aprobadas)[number]) => !!a.vence_at && a.vence_at.slice(0, 10) < hoy;
    const consideradas = aprobadas.filter((a) => vencida(a) || verificada(a));
    const aTiempo = consideradas.filter((a) => verificada(a) && (!a.vence_at || hoyEn(zona, new Date(a.verificada_el as string)) <= a.vence_at.slice(0, 10)));
    plan = { aprobadas: aprobadas.length, consideradas: consideradas.length, verificadasATiempo: aTiempo.length };
  }

  // Cortes: los meses cerrados desde que empezó el monitoreo, y los cortes congelados desde entonces.
  let cortes: HechosRuta["cortes"] = null;
  if (r.mediciones) {
    const monitoreo = tipo ? etapasDe(tipo).find((e) => e.clave === "monitoreo") : null;
    const desde = inicio && monitoreo ? sumarDias(inicio, monitoreo.desdeDia - 1) : null;
    cortes = {
      mesesCerrados: desde ? mesesCerradosDesde(desde, hoy) : 0,
      congelados: desde ? r.mediciones.filter((m) => m.tipo === "corte" && (m.fecha ?? "").slice(0, 10) >= desde).length : 0,
    };
  }

  return {
    tipo,
    inicio,
    zona,
    numeros: r.numeros,
    lineaBase: r.mediciones ? { vigente: r.mediciones.some((m) => m.tipo === "linea_base" && m.vigente !== false) } : null,
    productos: n.productos,
    costos: n.costos,
    historia: n.historia,
    pedidos: r.pedidos,
    planAceptado: r.actasPlan == null ? null : r.actasPlan > 0,
    indicadores: indicadoresH,
    revisiones: revisionesH,
    plan,
    organigrama: r.organigrama,
    procesos: r.procesos,
    cortes,
    marcas: r.marcas,
  };
}

/**
 * Los hechos de la ruta de una empresa, leídos directo (sin caché). null si la empresa no existe o la base todavía no
 * tiene las columnas de la ruta. Lo demás, cada cosa por su lado: lo que no se pudo leer queda null y se ve como «no
 * se pudo leer».
 */
export async function leerHechosRutaCon(sb: Lector, companyId: string, ahora: Date = new Date()): Promise<HechosRuta | null> {
  const [r, n] = await Promise.all([leerRutaCon(sb, companyId), leerNegocioCon(sb, companyId)]);
  return armarHechos(r, n, ahora);
}

// ─── La caché por empresa ────────────────────────────────────────────────────────────────────────

/** Las etiquetas de la caché de una empresa: refrescarRuta las vence al escribir. */
export const etiquetaRuta = (companyId: string, parte: "negocio" | "ruta") => `ruta-${parte}:${companyId}`;
/** Lo más que una lectura de la ruta queda guardada si nadie la refresca al escribir (lo que escriben otras pantallas). */
const SEGUNDOS_EN_CACHE = 300;

/** ¿El fallo es que no hay caché de Next (una prueba, un script)? Entonces se lee directo. */
const sinCacheDeNext = (e: unknown) => e instanceof Error && /incrementalCache missing|static generation store missing/.test(e.message);

async function conCache<T>(companyId: string, parte: "negocio" | "ruta", leer: () => Promise<T>): Promise<T> {
  try {
    return await unstable_cache(leer, [`ruta-${parte}-v1`, companyId], { tags: [etiquetaRuta(companyId, parte)], revalidate: SEGUNDOS_EN_CACHE })();
  } catch (e) {
    if (sinCacheDeNext(e)) return leer();
    throw e;
  }
}

/** Lo que la empresa anota de su negocio, con caché (y una sola vez por petición). */
export const negocioDeEmpresa = cache((companyId: string): Promise<LecturaNegocio> => conCache(companyId, "negocio", () => leerNegocioCon(supabaseAdmin(), companyId)));
const rutaDeEmpresa = cache((companyId: string): Promise<LecturaRuta> => conCache(companyId, "ruta", () => leerRutaCon(supabaseAdmin(), companyId)));

/** Los hechos de la ruta de una empresa, una sola vez por petición y con la caché por empresa. */
export const leerHechosRuta = cache(async (companyId: string): Promise<HechosRuta | null> => {
  const [r, n] = await Promise.all([rutaDeEmpresa(companyId), negocioDeEmpresa(companyId)]);
  return armarHechos(r, n, new Date());
});

/** El avance de la ruta de una empresa, una sola vez por petición. null si faltan las columnas (migración sin aplicar). */
export const avanceDeEmpresa = cache(async (companyId: string, hoy?: Date): Promise<AvanceRuta | null> => {
  const h = await leerHechosRuta(companyId);
  return h ? avanceRuta(h, hoy ?? new Date()) : null;
});

/**
 * Vence la caché de la ruta de una empresa: lo llama cada ruta que escribe algo que la ruta cuenta, DESPUÉS de
 * escribir. «negocio»: productos, gastos, ficha, ventas en otra moneda. «ruta»: solicitudes, marcas y veredictos,
 * tipo de trabajo, indicadores. Vence al instante (la próxima lectura ya trae lo nuevo). Fuera de una petición de
 * Next (pruebas, scripts) no hay caché que vencer, y no pasa nada.
 */
export function refrescarRuta(companyId: string, parte: "negocio" | "ruta" | "todo" = "todo"): void {
  for (const p of parte === "todo" ? (["negocio", "ruta"] as const) : [parte]) {
    try {
      revalidateTag(etiquetaRuta(companyId, p), { expire: 0 });
    } catch (e) {
      if (!sinCacheDeNext(e)) console.error("[ruta] no se pudo refrescar la caché de la empresa", companyId, p, e);
    }
  }
}
