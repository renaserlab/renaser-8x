/**
 * LEER (Y SEMBRAR) LO QUE EL CLIENTE LLENA: la ficha del negocio, los gastos del mes, las ventas en otra moneda y el
 * trabajo de la empresa (16-10-2026). SERVIDOR: usa la service role y filtra SIEMPRE por la empresa en la consulta.
 *
 * Robustez para cientos de empresas a la vez: cada lectura es de UNA empresa, con columnas explícitas y con tope
 * (200 gastos, 500 operaciones); todas usan el índice por company_id que crea la migración.
 */
import { supabaseAdmin } from "./supabase/admin";
import { centro, esExacto, formaDe, rangoDe, textoRango, type DatoOral, type EstadoDato } from "./dato-oral";
import { modelosDe, type ModeloNegocio } from "./negocio";
import { esTipoTrabajo, type TipoTrabajo } from "./ruta";
import { fichaDesdeFila, FICHA_VACIA, type CostoMes, type FichaNegocio, type OperacionMoneda } from "./rentabilidad";
import { horaCierreValida } from "./kpis";
import { normalizarMetrica, PERIODO_DORADA } from "./metricas";

/** Error de lectura con el código de Postgres: la ruta responde 409 si es «falta la migración», 500 si no. */
export class ErrorDeNegocio extends Error {
  constructor(mensaje: string, readonly codigo: string | null = null) {
    super(mensaje);
    this.name = "ErrorDeNegocio";
  }
}

/** ¿La tabla o la columna todavía no existe (migracion-entrar-hoy.sql sin aplicar)? */
export const faltaMigracionNegocio = (codigo: string | null | undefined): boolean => ["42P01", "42703", "PGRST204", "PGRST205"].includes(codigo ?? "");
export const TEXTO_FALTA_MIGRACION = "Esta parte todavía no está habilitada en esta base: falta aplicar supabase/migracion-entrar-hoy.sql.";

export const COLUMNAS_FICHA = "company_id,historia,modulos,totales,moneda,credito,inventario,updated_at";
export const COLUMNAS_COSTO = "id,company_id,periodo,tipo,nombre,monto,monto_desde,monto_hasta,estado,nota,orden,creado_por,created_at,updated_at";
export const COLUMNAS_OPERACION = "id,company_id,fecha_venta,fecha_cobro,dias_cobro,moneda,monto,tc_cotizado,tc_cobro,recibido,comisiones,conversiones,estado,source_id,nota,creado_por,created_at,updated_at";

/** La ficha de la empresa. Sin fila, todos los bloques vacíos (nadie respondió todavía, que no es «cero»). */
export async function leerFichaNegocio(companyId: string): Promise<FichaNegocio> {
  const { data, error } = await supabaseAdmin().from("ficha_negocio").select(COLUMNAS_FICHA).eq("company_id", companyId).maybeSingle();
  if (error) throw new ErrorDeNegocio(error.message, error.code ?? null);
  return data ? fichaDesdeFila(data as unknown as Record<string, unknown>) : { ...FICHA_VACIA };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const ESTADOS: readonly EstadoDato[] = ["estimado", "contado", "comprobado", "no_lo_se"];

/** Una fila de costos_mes a CostoMes: monto, rango o «no lo sé» vuelven a ser un DatoOral. */
export function costoDesdeFila(f: Record<string, unknown>): CostoMes & { orden: number; creado_por: string | null } {
  const estado = ESTADOS.includes(f.estado as EstadoDato) ? (f.estado as EstadoDato) : "estimado";
  const monto = num(f.monto);
  const desde = num(f.monto_desde);
  const hasta = num(f.monto_hasta);
  const dato: DatoOral = monto != null ? { valor: monto, estado } : desde != null && hasta != null ? { desde, hasta, estado } : { estado };
  return {
    id: String(f.id),
    periodo: String(f.periodo ?? "mes_tipico"),
    tipo: f.tipo === "comercializacion" ? "comercializacion" : "fijo",
    nombre: String(f.nombre ?? ""),
    dato,
    nota: typeof f.nota === "string" && f.nota.trim() ? f.nota : null,
    orden: num(f.orden) ?? 0,
    creado_por: typeof f.creado_por === "string" ? f.creado_por : null,
  };
}

/** Los gastos de un periodo (por defecto, el mes típico), en el orden que les dio quien los anotó. Tope 200. */
export async function listarCostos(companyId: string, periodo = "mes_tipico"): Promise<(CostoMes & { orden: number; creado_por: string | null })[]> {
  const { data, error } = await supabaseAdmin().from("costos_mes").select(COLUMNAS_COSTO).eq("company_id", companyId).eq("periodo", periodo).order("orden").order("created_at").limit(200);
  if (error) throw new ErrorDeNegocio(error.message, error.code ?? null);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(costoDesdeFila);
}

/** Una fila de operaciones_moneda. «comprobado» solo si la base lo dice; lo desconocido es estimado. */
export function operacionDesdeFila(f: Record<string, unknown>): OperacionMoneda & { source_id: string | null; nota: string | null; creado_por: string | null } {
  const estado: EstadoDato = f.estado === "contado" || f.estado === "comprobado" ? f.estado : "estimado";
  const conv = num(f.conversiones);
  return {
    id: String(f.id),
    fecha_venta: typeof f.fecha_venta === "string" ? f.fecha_venta.slice(0, 10) : null,
    fecha_cobro: typeof f.fecha_cobro === "string" ? f.fecha_cobro.slice(0, 10) : null,
    dias_cobro: num(f.dias_cobro),
    moneda: String(f.moneda ?? ""),
    monto: num(f.monto) ?? 0,
    tc_cotizado: num(f.tc_cotizado),
    tc_cobro: num(f.tc_cobro),
    recibido: num(f.recibido),
    comisiones: num(f.comisiones),
    conversiones: conv === 1 || conv === 2 ? conv : null,
    estado,
    source_id: typeof f.source_id === "string" ? f.source_id : null,
    nota: typeof f.nota === "string" && f.nota.trim() ? f.nota : null,
    creado_por: typeof f.creado_por === "string" ? f.creado_por : null,
  };
}

/** Las ventas cobradas en otra moneda, las más recientes primero. Tope 500. */
export async function listarOperacionesMoneda(companyId: string): Promise<ReturnType<typeof operacionDesdeFila>[]> {
  const { data, error } = await supabaseAdmin()
    .from("operaciones_moneda")
    .select(COLUMNAS_OPERACION)
    .eq("company_id", companyId)
    .order("fecha_venta", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new ErrorDeNegocio(error.message, error.code ?? null);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(operacionDesdeFila);
}

export type TrabajoEmpresa = { modelo_negocio: ModeloNegocio[]; tipo_trabajo: TipoTrabajo | null; ruta_inicio: string | null; hora_cierre: string | null; modelo_operativo: string[] };

/**
 * Cómo gana dinero la empresa, qué trabajo compró, cuándo arrancó su ruta y a qué hora cierra. Si las columnas nuevas
 * todavía no existen en esta base, se devuelve lo de siempre (modelo operativo) y lo demás vacío: la pantalla no se cae.
 */
export async function leerTrabajoEmpresa(companyId: string): Promise<TrabajoEmpresa> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("companies").select("modelo_negocio,tipo_trabajo,ruta_inicio,hora_cierre,modelo_operativo").eq("id", companyId).maybeSingle();
  let fila = data as Record<string, unknown> | null;
  if (error) {
    if (!faltaMigracionNegocio(error.code)) throw new ErrorDeNegocio(error.message, error.code ?? null);
    const viejo = await sb.from("companies").select("modelo_operativo").eq("id", companyId).maybeSingle();
    fila = (viejo.data as Record<string, unknown> | null) ?? null;
  }
  const operativo = Array.isArray(fila?.modelo_operativo) ? (fila!.modelo_operativo as unknown[]).map(String) : [];
  return {
    modelo_negocio: modelosDe(fila?.modelo_negocio),
    tipo_trabajo: esTipoTrabajo(fila?.tipo_trabajo) ? fila!.tipo_trabajo : null,
    ruta_inicio: typeof fila?.ruta_inicio === "string" ? fila.ruta_inicio.slice(0, 10) : null,
    hora_cierre: horaCierreValida(fila?.hora_cierre),
    modelo_operativo: operativo,
  };
}

/**
 * A qué hora cierra el negocio («19:00»), o null. Consulta aparte y sin lanzar: si la columna todavía no existe
 * (migración pendiente), las pantallas de indicadores siguen igual que antes (lo de hoy se anota desde mañana).
 */
export async function leerHoraCierre(companyId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin().from("companies").select("hora_cierre").eq("id", companyId).maybeSingle();
    return error ? null : horaCierreValida((data as { hora_cierre?: unknown } | null)?.hora_cierre);
  } catch {
    return null;
  }
}

/**
 * SEMBRAR EL MEJOR MES DESDE LA HISTORIA. Si el dueño dijo cuánto vendía al mes en su mejor época y la empresa
 * todavía no tiene ese número en sus 9 (`venta_mes` en el periodo `epoca_dorada`), se inserta: contado de memoria
 * (estado 'contado', origen 'declarado'), con la nota de dónde salió y el rango si lo dio en rango (el valor es el
 * centro del rango y la nota lo dice). Si ya hay fila, NUNCA se toca: lo que había lo puso alguien con su motivo.
 * «No lo sé» no siembra nada. Devuelve si sembró.
 */
export async function sembrarEpocaDorada(companyId: string, dato: DatoOral): Promise<boolean> {
  const r = rangoDe(dato);
  if (!r || formaDe(dato) === "no_lo_se") return false;
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("company_metricas").select("id,clave,periodo").eq("company_id", companyId).in("clave", ["venta_mes", "venta_epoca_dorada", "mejor_mes_venta", "venta_mejor_mes"]);
  if (error) throw new ErrorDeNegocio(error.message, error.code ?? null);
  const ya = ((data ?? []) as { clave: string; periodo: string | null }[]).some((f) => normalizarMetrica(f.clave, f.periodo).periodo === PERIODO_DORADA);
  if (ya) return false;
  const nota = esExacto(r) ? "De la historia del negocio" : `De la historia del negocio (dijo ${textoRango(r, (n) => n.toLocaleString("es-PE"))} al mes)`;
  const fila = { company_id: companyId, clave: "venta_mes", periodo: PERIODO_DORADA, valor: centro(r), estado: "contado", origen: "declarado", nota };
  const { error: errorInsertar } = await sb.from("company_metricas").insert(fila);
  if (errorInsertar) throw new ErrorDeNegocio(errorInsertar.message, errorInsertar.code ?? null);
  return true;
}
