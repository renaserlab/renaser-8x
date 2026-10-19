/**
 * RENASER OS · PROYECTOS Y OBJETIVO DE LA SEMANA (19-10-2026). El avance de un proyecto no se escribe a mano: son sus
 * tareas completadas sobre sus tareas. El estado tampoco: sale de la fecha de entrega, del avance contra el tiempo que
 * ya corrió y de si tiene tareas bloqueadas. Pura; la prueba tests/os-equipo.test.ts.
 */
import { sumarDias } from "./calculos";

export type EstadoProyecto = "sin_empezar" | "en_camino" | "en_riesgo" | "atrasado" | "listo" | "cerrado";

export const NOMBRE_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  sin_empezar: "Sin empezar",
  en_camino: "En camino",
  en_riesgo: "En riesgo",
  atrasado: "Atrasado",
  listo: "Listo para cerrar",
  cerrado: "Cerrado",
};

export type Proyecto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  responsable_id: string | null;
  fecha_entrega: string | null;
  cerrado_at: string | null;
  created_at: string;
};

export type Avance = { total: number; completadas: number; bloqueadas: number; enCurso: number; pct: number | null };

export function avanceDe(tareas: readonly { estado: string }[]): Avance {
  const total = tareas.length;
  const completadas = tareas.filter((t) => t.estado === "completada").length;
  return {
    total,
    completadas,
    bloqueadas: tareas.filter((t) => t.estado === "bloqueada").length,
    enCurso: tareas.filter((t) => t.estado === "en_curso" || t.estado === "en_revision").length,
    pct: total ? Math.round((completadas * 100) / total) : null,
  };
}

/** Días entre dos fechas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/**
 * EL ESTADO, en este orden: cerrado; atrasado (la entrega ya pasó y falta algo); listo (todas sus tareas completadas);
 * sin empezar (nada completado ni en curso); en riesgo (alguna bloqueada, o el avance va 15 puntos o más por detrás
 * del tiempo que ya corrió entre que nació y su entrega); y si no, en camino.
 */
export function estadoProyecto(p: Pick<Proyecto, "fecha_entrega" | "cerrado_at" | "created_at">, a: Avance, hoy: string): EstadoProyecto {
  if (p.cerrado_at) return "cerrado";
  const pct = a.pct ?? 0;
  if (p.fecha_entrega && p.fecha_entrega < hoy && pct < 100) return "atrasado";
  if (a.total > 0 && pct === 100) return "listo";
  if (a.completadas === 0 && a.enCurso === 0 && a.bloqueadas === 0) return "sin_empezar";
  if (a.bloqueadas > 0) return "en_riesgo";
  if (p.fecha_entrega) {
    const nacio = p.created_at.slice(0, 10);
    const plazo = diasEntre(nacio, p.fecha_entrega);
    if (plazo > 0) {
      const corrido = Math.min(1, Math.max(0, diasEntre(nacio, hoy) / plazo));
      if (corrido * 100 - pct >= 15) return "en_riesgo";
    }
  }
  return "en_camino";
}

/** ¿Pide atención? (el filtro «En riesgo» junta los en riesgo y los atrasados). */
export function pideAtencion(e: EstadoProyecto): boolean {
  return e === "en_riesgo" || e === "atrasado";
}

/** El lunes anterior, para mostrar el objetivo de la semana pasada. */
export function lunesAnterior(lunes: string): string {
  return sumarDias(lunes, -7);
}
