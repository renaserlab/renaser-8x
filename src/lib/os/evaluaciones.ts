/**
 * EVALUACIÓN 360 · EL CONTRATO QUE COMPARTEN QUIEN EVALÚA Y RR.HH. (19-10-2026). Un ciclo («2026-10») pide a cada
 * evaluador una respuesta sobre cada evaluado: la persona sobre sí misma (auto), su jefe (jefe), compañeros (par) y,
 * cuando el evaluado dirige, su equipo (equipo). Cada respuesta puntúa estas cinco dimensiones del 1 al 5 y deja un
 * comentario. `os_evaluaciones.puntajes` guarda exactamente este objeto.
 */
import { z } from "zod";

export const DIMENSIONES_360 = [
  ["compromiso", "Compromiso", "Cumple lo que promete y se hace cargo de su trabajo."],
  ["calidad", "Calidad", "Lo que entrega está bien hecho a la primera."],
  ["equipo", "Trabajo en equipo", "Ayuda, comparte y pide ayuda a tiempo."],
  ["comunicacion", "Comunicación", "Avisa a tiempo, dice las cosas claras y escucha."],
  ["orden", "Orden y puntualidad", "Llega, abre y cierra su día a tiempo; su trabajo está al día."],
] as const;

export type Dimension360 = (typeof DIMENSIONES_360)[number][0];

export const NOMBRE_RELACION = { auto: "Autoevaluación", jefe: "Su jefe", par: "Un compañero", equipo: "Su equipo" } as const;

export const EsquemaPuntajes = z.object(
  Object.fromEntries(DIMENSIONES_360.map(([k]) => [k, z.number().int().min(1).max(5)])) as Record<Dimension360, z.ZodNumber>
);
export type Puntajes = z.infer<typeof EsquemaPuntajes>;

/** El ciclo del mes: «2026-10». */
export function cicloDe(dia: string): string {
  return dia.slice(0, 7);
}

/** Promedio por dimensión de las respuestas ya dadas (sin respuestas, null: nunca un cero inventado). */
export function promedios(respuestas: readonly (Puntajes | null)[]): Record<Dimension360, number | null> {
  const dadas = respuestas.filter((r): r is Puntajes => !!r);
  return Object.fromEntries(
    DIMENSIONES_360.map(([k]) => [k, dadas.length ? Math.round((dadas.reduce((s, r) => s + r[k], 0) / dadas.length) * 10) / 10 : null])
  ) as Record<Dimension360, number | null>;
}
