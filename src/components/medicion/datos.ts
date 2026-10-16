import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUMNAS_MEDICION, COLUMNAS_MEDICION_LEGADO, lineaBaseVigente, versionesLineaBase, ligarAcciones, type Medicion, type AccionLigada } from "@/lib/medicion";
import type { Acta } from "@/lib/actas";

/**
 * LO QUE LAS PANTALLAS DE MEDICIÓN LEEN DE LA BASE (servidor). Tres cargas y una regla: si una tabla o
 * columna no existe todavía (migración de 13-10 sin aplicar en ese entorno), la pantalla no se cae ni
 * finge; se lee lo que hay y se dice `conVersiones: false`.
 */

export type MedicionesCargadas = {
  mediciones: Medicion[];
  vigente: Medicion | null;
  versiones: Medicion[];
  /** Cortes, el más reciente primero. */
  cortes: Medicion[];
  /** false cuando la base no tiene las columnas de versión: se leyó con las columnas de siempre. */
  conVersiones: boolean;
};

export async function cargarMediciones(sb: SupabaseClient, companyId: string): Promise<MedicionesCargadas> {
  let conVersiones = true;
  let filas: unknown[] = [];
  const completo = await sb.from("mediciones").select(COLUMNAS_MEDICION).eq("company_id", companyId);
  if (completo.error) {
    // Columnas de versión ausentes (migración de 13-10 sin aplicar): se leen las de siempre y se dice.
    conVersiones = false;
    const legado = await sb.from("mediciones").select(COLUMNAS_MEDICION_LEGADO).eq("company_id", companyId);
    filas = legado.data ?? [];
  } else {
    filas = completo.data ?? [];
  }
  const mediciones = (filas as Medicion[]).map((m) => ({ ...m, valores: m.valores ?? {}, derivados: m.derivados ?? {} }));
  const cortes = mediciones.filter((m) => m.tipo === "corte").sort((a, b) => b.numero - a.numero);
  return { mediciones, vigente: lineaBaseVigente(mediciones), versiones: versionesLineaBase(mediciones), cortes, conVersiones };
}

/** Las actas de una empresa, la más reciente primero. Sin tabla (migración sin aplicar) devuelve lista vacía. */
export async function cargarActas(sb: SupabaseClient, companyId: string): Promise<Acta[]> {
  const { data, error } = await sb
    .from("actas_aceptacion")
    .select("id,company_id,tipo,referencia_id,version,contenido,hash_contenido,aceptado_por,aceptado_nombre,aceptado_rol,aceptado_at,documento_path,nota_juridica")
    .eq("company_id", companyId)
    .order("aceptado_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as Acta[];
}

/**
 * Las acciones del plan ligadas a un número (vía indicadores.clave) con su fecha de verificación: la
 * del último «verificar» del historial o, si no hay historial, la de la fila cuando ya está verificada.
 * Las que no apuntan a ningún indicador quedan con clave null: no se les atribuye nada.
 */
export async function cargarAccionesLigadas(sb: SupabaseClient, companyId: string): Promise<AccionLigada[]> {
  const { data: acciones, error } = await sb.from("actions").select("id,accion,estado,indicador_id,updated_at").eq("company_id", companyId);
  if (error || !acciones?.length) return [];
  const ids = acciones.map((a) => a.id as string);
  const [{ data: indicadores }, { data: historial }] = await Promise.all([
    sb.from("indicadores").select("id,clave").eq("company_id", companyId),
    sb.from("accion_historial").select("action_id,created_at").eq("accion", "verificar").in("action_id", ids).order("created_at", { ascending: false }),
  ]);
  const verificadoEn = new Map<string, string>();
  for (const h of historial ?? []) if (!verificadoEn.has(h.action_id as string)) verificadoEn.set(h.action_id as string, h.created_at as string);
  return ligarAcciones(
    acciones.map((a) => ({
      id: a.id as string,
      accion: a.accion as string,
      estado: a.estado as string,
      indicador_id: (a.indicador_id as string | null) ?? null,
      fecha_verificacion: verificadoEn.get(a.id as string) ?? (a.estado === "verificado" ? ((a.updated_at as string | null) ?? null) : null),
    })),
    ((indicadores ?? []) as { id: string; clave: string }[])
  );
}

/** Las actas que aceptan una medición concreta, la más reciente primero. */
export function actasDe(actas: readonly Acta[], medicionId: string): Acta[] {
  return actas.filter((a) => a.referencia_id === medicionId);
}
