/**
 * RENASER OS · LAS CUENTAS, SIN BASE DE DATOS. Todo lo que aquí se decide (qué tarea está vencida, qué es «trabajo para
 * hoy», cuánto tiempo se registró, cómo está una persona ahora, cuánto cumplió) es una función pura: la usan las
 * páginas y las rutas, y la prueban tests/os-calculos.test.ts sin red ni credenciales.
 *
 * Los días van como texto AAAA-MM-DD en el reloj de la empresa (companies.zona_horaria, Lima por defecto); los
 * instantes, como ISO. Compararlos como texto es correcto porque el formato ordena igual que las fechas.
 */
import { diaEnZona, lunesDe, sumarDias, ZONA_POR_DEFECTO } from "@/lib/revision-semanal";

export type EstadoTarea = "pendiente" | "en_curso" | "en_revision" | "completada" | "bloqueada";
export type Prioridad = "alta" | "media" | "baja";

export type TareaOS = {
  id: string;
  persona_id: string;
  proyecto_id: string | null;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: Prioridad;
  fecha_inicio: string | null;
  fecha_limite: string | null;
  completada_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RegistroTiempo = { id: string; tarea_id: string; persona_id: string; inicio: string; fin: string | null; nota: string | null };

export const NOMBRE_ESTADO: Record<EstadoTarea | "vencida", string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  en_revision: "En revisión",
  completada: "Completada",
  bloqueada: "Bloqueada",
  vencida: "Vencida",
};

export const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { alta: "Alta", media: "Media", baja: "Baja" };

/** El día de hoy en el reloj de la empresa. */
export function hoyEn(zona: string = ZONA_POR_DEFECTO, ahora: Date = new Date()): string {
  return diaEnZona(ahora, zona) ?? ahora.toISOString().slice(0, 10);
}

/** Lunes a viernes de la semana que empieza en `lunes`. */
export function diasHabiles(lunes: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => sumarDias(lunes, i));
}

/** El próximo día hábil después de `dia` (el viernes y el sábado apuntan al lunes). Es el que mira «plan de mañana». */
export function siguienteDiaHabil(dia: string): string {
  const desfase = (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7; // lunes 0 … domingo 6
  return sumarDias(dia, desfase === 4 ? 3 : desfase === 5 ? 2 : 1);
}

export { lunesDe, sumarDias };

/** «Vencida» no se guarda: es una tarea abierta cuya fecha límite ya pasó. */
export function estaVencida(t: Pick<TareaOS, "estado" | "fecha_limite">, hoy: string): boolean {
  return t.estado !== "completada" && !!t.fecha_limite && t.fecha_limite < hoy;
}

/** El estado que se muestra: el guardado, salvo que la tarea abierta esté vencida (y no bloqueada, que pesa más). */
export function estadoVisible(t: Pick<TareaOS, "estado" | "fecha_limite">, hoy: string): EstadoTarea | "vencida" {
  if (t.estado !== "bloqueada" && estaVencida(t, hoy)) return "vencida";
  return t.estado;
}

/**
 * TRABAJO PARA HOY (aprobado el 19-10-2026): las tareas con fecha de hoy y las que quedaron pendientes de días
 * anteriores. Una tarea abierta cuenta si su día de trabajo es hoy o ya pasó; sin día de trabajo, si ya venció o
 * vence hoy. Las completadas no se ofrecen para enfocarse.
 */
export function esParaHoy(t: Pick<TareaOS, "estado" | "fecha_inicio" | "fecha_limite">, hoy: string): boolean {
  if (t.estado === "completada") return false;
  if (t.fecha_inicio) return t.fecha_inicio <= hoy;
  return !!t.fecha_limite && t.fecha_limite <= hoy;
}

/** ¿Viene de un día anterior? (para decirlo al lado de la tarea: «pendiente desde el jueves»). */
export function vieneDeAntes(t: Pick<TareaOS, "estado" | "fecha_inicio" | "fecha_limite">, hoy: string): boolean {
  if (t.estado === "completada") return false;
  const dia = t.fecha_inicio ?? t.fecha_limite;
  return !!dia && dia < hoy;
}

/** «Trabajo puesto para hoy», como lo mide RenaserOs: alguna tarea cuyo día de trabajo es hoy, en cualquier estado. */
export function tieneTrabajoHoy(tareas: readonly Pick<TareaOS, "fecha_inicio">[], hoy: string): boolean {
  return tareas.some((t) => t.fecha_inicio === hoy);
}

/** Orden para listar: primero lo urgente (vencidas y bloqueadas), después por prioridad y por fecha límite. */
export function ordenarTareas<T extends Pick<TareaOS, "estado" | "prioridad" | "fecha_limite" | "created_at">>(tareas: readonly T[], hoy: string): T[] {
  const peso = (t: T) => (t.estado === "completada" ? 3 : estaVencida(t, hoy) || t.estado === "bloqueada" ? 0 : t.estado === "en_curso" ? 1 : 2);
  const prio = { alta: 0, media: 1, baja: 2 } as const;
  return [...tareas].sort(
    (a, b) =>
      peso(a) - peso(b) ||
      prio[a.prioridad] - prio[b.prioridad] ||
      (a.fecha_limite ?? "9999").localeCompare(b.fecha_limite ?? "9999") ||
      a.created_at.localeCompare(b.created_at)
  );
}

/** Minutos de un tramo de cronómetro; el que sigue corriendo cuenta hasta `ahora`. */
export function minutosDe(r: Pick<RegistroTiempo, "inicio" | "fin">, ahora: Date = new Date()): number {
  const fin = r.fin ? new Date(r.fin).getTime() : ahora.getTime();
  return Math.max(0, Math.round((fin - new Date(r.inicio).getTime()) / 60000));
}

export function minutosTotales(registros: readonly Pick<RegistroTiempo, "inicio" | "fin">[], ahora: Date = new Date()): number {
  return registros.reduce((s, r) => s + minutosDe(r, ahora), 0);
}

/** «47 min», «2 h», «2 h 05». Nunca «0 h»: lo que no se registró se dice «—». */
export function textoDuracion(minutos: number | null | undefined): string {
  if (minutos == null || minutos <= 0) return "—";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** El cronómetro como reloj: 00:47:12. */
export function textoReloj(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor((s % 3600) / 60))}:${dos(s % 60)}`;
}

/**
 * CUMPLIMIENTO: de las tareas cuya fecha límite cayó dentro del periodo (y ya pasó o se completó), cuántas se
 * completaron a tiempo (el día de completarla, en el reloj de la empresa, no después de la fecha límite). Sin tareas
 * que midan, no hay porcentaje: null, nunca un cero inventado.
 */
export function cumplimiento(
  tareas: readonly Pick<TareaOS, "estado" | "fecha_limite" | "completada_at">[],
  desde: string,
  hasta: string,
  hoy: string,
  zona: string = ZONA_POR_DEFECTO
): { a_tiempo: number; atrasadas: number; pct: number | null } {
  let aTiempo = 0;
  let atrasadas = 0;
  for (const t of tareas) {
    if (!t.fecha_limite || t.fecha_limite < desde || t.fecha_limite > hasta) continue;
    const dia = t.completada_at ? diaEnZona(t.completada_at, zona) : null;
    if (t.estado === "completada" && dia && dia <= t.fecha_limite) aTiempo++;
    else if (t.estado === "completada" || t.fecha_limite < hoy) atrasadas++;
    // Una tarea abierta que todavía no vence no cuenta ni a favor ni en contra.
  }
  const total = aTiempo + atrasadas;
  return { a_tiempo: aTiempo, atrasadas, pct: total ? Math.round((aTiempo * 100) / total) : null };
}

export type EstadoPersona = "activo" | "bloqueado" | "sin_senal" | "en_pausa" | "no_abrio";

export const NOMBRE_ESTADO_PERSONA: Record<EstadoPersona, string> = {
  activo: "Activo",
  bloqueado: "Bloqueado",
  sin_senal: "Sin señal",
  en_pausa: "En pausa",
  no_abrio: "No abrió",
};

/**
 * CÓMO ESTÁ UNA PERSONA AHORA (Equipo en vivo). En este orden: sin apertura de hoy, «no abrió»; con un bloqueo abierto,
 * «bloqueado»; con el cronómetro corriendo, «activo»; si su último movimiento tiene más de 60 minutos, «sin señal»
 * (la misma hora que usa la regla de inactividad de la base); si no, «en pausa».
 */
export function estadoPersona(
  e: { abrio: boolean; bloqueada: boolean; cronometro: boolean; ultimoMovimiento: string | null },
  ahora: Date = new Date()
): EstadoPersona {
  if (!e.abrio) return "no_abrio";
  if (e.bloqueada) return "bloqueado";
  if (e.cronometro) return "activo";
  if (!e.ultimoMovimiento || ahora.getTime() - new Date(e.ultimoMovimiento).getTime() > 60 * 60000) return "sin_senal";
  return "en_pausa";
}

/** Un cronómetro que corre hace más de 10 horas se da por olvidado (mismo umbral que la regla de la base). */
export function cronometroOlvidado(r: Pick<RegistroTiempo, "inicio" | "fin">, ahora: Date = new Date()): boolean {
  return !r.fin && ahora.getTime() - new Date(r.inicio).getTime() > 10 * 3600000;
}

/** Iniciales para el avatar: «Carla Mendoza» → «CM». */
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").split(/[\s@.]+/).filter(Boolean);
  return partes.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "·";
}

/** «lun 19», «vie 23»: corto, en castellano, sin depender del idioma del servidor. */
export function textoDia(dia: string | null | undefined): string {
  if (!dia) return "Sin fecha";
  const d = new Date(`${dia}T12:00:00Z`);
  const nombres = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  return `${nombres[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** Fecha relativa a hoy: «Hoy», «Ayer», «Mañana» o «lun 19». */
export function textoDiaRelativo(dia: string | null | undefined, hoy: string): string {
  if (!dia) return "Sin fecha";
  if (dia === hoy) return "Hoy";
  if (dia === sumarDias(hoy, -1)) return "Ayer";
  if (dia === sumarDias(hoy, 1)) return "Mañana";
  return textoDia(dia);
}
