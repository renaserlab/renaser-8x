/**
 * RENASER OS · EQUIPO Y TALENTO (19-10-2026). El monitoreo de los últimos 30 días (cumplimiento, tareas a tiempo y
 * atrasadas, última actividad, quién lleva más de 30 días sin moverse) y el armado de un ciclo de evaluación 360.
 * Puras; la prueba tests/os-equipo.test.ts.
 */
import type { PersonaOS } from "./acceso";
import { cumplimiento, sumarDias, type TareaOS } from "./calculos";

export const DIAS_INACTIVO = 30;

export type FilaMonitoreo = {
  persona: Pick<PersonaOS, "id" | "nombre" | "puesto" | "rol" | "created_at" | "user_id">;
  pct: number | null;
  aTiempo: number;
  atrasadas: number;
  /** El último movimiento: tramo de cronómetro, tarea tocada o apertura. null si nunca hizo nada. */
  ultima: string | null;
  inactiva: boolean;
};

/**
 * Inactiva: sin un solo movimiento en los últimos 30 días, y con la ficha creada hace más de 30 días (a quien llegó
 * ayer no se le pide historia). Sin cuenta enlazada también cuenta: puede ser alguien que nunca entró.
 */
export function armarMonitoreo(
  personas: readonly Pick<PersonaOS, "id" | "nombre" | "puesto" | "rol" | "created_at" | "user_id">[],
  tareas: readonly TareaOS[],
  movimientos: readonly { persona_id: string; cuando: string }[],
  hoy: string,
  zona: string,
  ahora: Date = new Date()
): FilaMonitoreo[] {
  const desde = sumarDias(hoy, -(DIAS_INACTIVO - 1));
  const limite = ahora.getTime() - DIAS_INACTIVO * 86400000;
  return personas.map((p) => {
    const c = cumplimiento(tareas.filter((t) => t.persona_id === p.id), desde, hoy, hoy, zona);
    const ultima = movimientos.filter((m) => m.persona_id === p.id).map((m) => m.cuando).sort().at(-1) ?? null;
    const vieja = new Date(p.created_at).getTime() < limite;
    return {
      persona: p,
      pct: c.pct,
      aTiempo: c.a_tiempo,
      atrasadas: c.atrasadas,
      ultima,
      inactiva: vieja && (!ultima || new Date(ultima).getTime() < limite),
    };
  });
}

export type Asignacion360 = { evaluado_id: string; evaluador_id: string; relacion: "auto" | "jefe" | "par" };

/**
 * UN CICLO 360: por cada evaluado, su autoevaluación, la de quien crea el ciclo como su jefe (si tiene ficha y no es
 * el mismo evaluado) y hasta dos compañeros al azar del equipo activo. Nunca dos veces el mismo evaluador sobre el
 * mismo evaluado (es la única de la tabla). `azar` se inyecta para que la prueba sea determinista.
 */
export function asignaciones360(
  evaluados: readonly string[],
  equipo: readonly string[],
  jefeId: string | null,
  azar: () => number = Math.random
): Asignacion360[] {
  const salida: Asignacion360[] = [];
  for (const evaluado of new Set(evaluados)) {
    salida.push({ evaluado_id: evaluado, evaluador_id: evaluado, relacion: "auto" });
    if (jefeId && jefeId !== evaluado) salida.push({ evaluado_id: evaluado, evaluador_id: jefeId, relacion: "jefe" });
    const candidatos = equipo.filter((id) => id !== evaluado && id !== jefeId);
    // Barajado de Fisher-Yates con el azar inyectado; los dos primeros son los pares.
    const barajados = [...candidatos];
    for (let i = barajados.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [barajados[i], barajados[j]] = [barajados[j]!, barajados[i]!];
    }
    for (const par of barajados.slice(0, 2)) salida.push({ evaluado_id: evaluado, evaluador_id: par, relacion: "par" });
  }
  return salida;
}
