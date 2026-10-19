/**
 * RENASER OS · LAS CUENTAS SIN BASE DE DATOS (src/lib/os/calculos.ts). Qué es «trabajo para hoy», qué está vencido,
 * cuánto se registró, cuánto se cumplió y cómo está una persona ahora. Todo con días en el reloj de la empresa.
 */
import { describe, it, expect } from "vitest";
import {
  esParaHoy, vieneDeAntes, tieneTrabajoHoy, estaVencida, estadoVisible, ordenarTareas, minutosDe, minutosTotales,
  textoDuracion, textoReloj, cumplimiento, estadoPersona, cronometroOlvidado, iniciales, textoDia, textoDiaRelativo,
  siguienteDiaHabil, diasHabiles, hoyEn, type TareaOS,
} from "@/lib/os/calculos";

const HOY = "2026-10-19"; // lunes

function tarea(p: Partial<TareaOS> = {}): TareaOS {
  return {
    id: p.id ?? "t",
    persona_id: "p",
    proyecto_id: null,
    titulo: "Tarea",
    descripcion: null,
    estado: "pendiente",
    prioridad: "media",
    fecha_inicio: null,
    fecha_limite: null,
    completada_at: null,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...p,
  };
}

describe("trabajo para hoy (aprobado el 19-10-2026: lo de hoy más lo pendiente de antes)", () => {
  it("cuenta lo que se trabaja hoy y lo abierto de días anteriores; no lo de mañana", () => {
    expect(esParaHoy(tarea({ fecha_inicio: HOY }), HOY)).toBe(true);
    expect(esParaHoy(tarea({ fecha_inicio: "2026-10-15" }), HOY)).toBe(true);
    expect(esParaHoy(tarea({ fecha_inicio: "2026-10-20" }), HOY)).toBe(false);
  });
  it("sin día de trabajo, cuenta si ya venció o vence hoy; sin ninguna fecha, no", () => {
    expect(esParaHoy(tarea({ fecha_limite: HOY }), HOY)).toBe(true);
    expect(esParaHoy(tarea({ fecha_limite: "2026-10-16" }), HOY)).toBe(true);
    expect(esParaHoy(tarea({ fecha_limite: "2026-10-23" }), HOY)).toBe(false);
    expect(esParaHoy(tarea(), HOY)).toBe(false);
  });
  it("una completada no se ofrece para enfocarse", () => {
    expect(esParaHoy(tarea({ fecha_inicio: HOY, estado: "completada" }), HOY)).toBe(false);
  });
  it("«viene de antes» es lo abierto con su día ya pasado", () => {
    expect(vieneDeAntes(tarea({ fecha_inicio: "2026-10-15" }), HOY)).toBe(true);
    expect(vieneDeAntes(tarea({ fecha_inicio: HOY }), HOY)).toBe(false);
    expect(vieneDeAntes(tarea({ fecha_limite: "2026-10-16" }), HOY)).toBe(true);
    expect(vieneDeAntes(tarea({ fecha_inicio: "2026-10-15", estado: "completada" }), HOY)).toBe(false);
  });
  it("«trabajo puesto para hoy» (como RenaserOs): alguna tarea con día de trabajo hoy, en cualquier estado", () => {
    expect(tieneTrabajoHoy([tarea({ fecha_inicio: HOY, estado: "completada" })], HOY)).toBe(true);
    expect(tieneTrabajoHoy([tarea({ fecha_inicio: "2026-10-15" })], HOY)).toBe(false);
    expect(tieneTrabajoHoy([], HOY)).toBe(false);
  });
});

describe("vencida y estado visible", () => {
  it("vencida = abierta con la fecha límite pasada; vencer hoy todavía no es vencida", () => {
    expect(estaVencida(tarea({ fecha_limite: "2026-10-18" }), HOY)).toBe(true);
    expect(estaVencida(tarea({ fecha_limite: HOY }), HOY)).toBe(false);
    expect(estaVencida(tarea({ fecha_limite: "2026-10-18", estado: "completada" }), HOY)).toBe(false);
  });
  it("lo bloqueado se muestra bloqueado aunque esté vencido; lo demás vencido se muestra vencido", () => {
    expect(estadoVisible(tarea({ fecha_limite: "2026-10-18", estado: "bloqueada" }), HOY)).toBe("bloqueada");
    expect(estadoVisible(tarea({ fecha_limite: "2026-10-18", estado: "en_curso" }), HOY)).toBe("vencida");
    expect(estadoVisible(tarea({ estado: "en_revision" }), HOY)).toBe("en_revision");
  });
  it("ordena lo urgente primero, luego por prioridad y fecha, y lo completado al final", () => {
    const lista = ordenarTareas(
      [
        tarea({ id: "hecha", estado: "completada", prioridad: "alta" }),
        tarea({ id: "baja", prioridad: "baja", fecha_limite: "2026-10-20" }),
        tarea({ id: "alta", prioridad: "alta", fecha_limite: "2026-10-25" }),
        tarea({ id: "vencida", prioridad: "baja", fecha_limite: "2026-10-10" }),
        tarea({ id: "curso", estado: "en_curso", prioridad: "baja" }),
      ],
      HOY
    );
    expect(lista.map((t) => t.id)).toEqual(["vencida", "curso", "alta", "baja", "hecha"]);
  });
});

describe("tiempo registrado", () => {
  const ahora = new Date("2026-10-19T15:00:00Z");
  it("un tramo cerrado cuenta sus minutos; el que corre, hasta ahora", () => {
    expect(minutosDe({ inicio: "2026-10-19T13:10:00Z", fin: "2026-10-19T13:57:00Z" }, ahora)).toBe(47);
    expect(minutosDe({ inicio: "2026-10-19T14:30:00Z", fin: null }, ahora)).toBe(30);
    expect(minutosTotales([{ inicio: "2026-10-19T13:00:00Z", fin: "2026-10-19T14:00:00Z" }, { inicio: "2026-10-19T14:30:00Z", fin: null }], ahora)).toBe(90);
  });
  it("se escribe como se lee: «47 min», «2 h», «2 h 05» y «—» cuando no hay nada", () => {
    expect(textoDuracion(47)).toBe("47 min");
    expect(textoDuracion(120)).toBe("2 h");
    expect(textoDuracion(125)).toBe("2 h 05");
    expect(textoDuracion(0)).toBe("—");
    expect(textoDuracion(null)).toBe("—");
  });
  it("el cronómetro como reloj", () => {
    expect(textoReloj(2832)).toBe("00:47:12");
    expect(textoReloj(-5)).toBe("00:00:00");
    expect(textoReloj(36000)).toBe("10:00:00");
  });
  it("un cronómetro de más de 10 horas se da por olvidado", () => {
    expect(cronometroOlvidado({ inicio: "2026-10-18T23:40:00Z", fin: null }, ahora)).toBe(true);
    expect(cronometroOlvidado({ inicio: "2026-10-19T10:00:00Z", fin: null }, ahora)).toBe(false);
    expect(cronometroOlvidado({ inicio: "2026-10-18T23:40:00Z", fin: "2026-10-19T01:00:00Z" }, ahora)).toBe(false);
  });
});

describe("cumplimiento", () => {
  it("a tiempo = completada el día de su fecha límite o antes, en el reloj de Lima", () => {
    const r = cumplimiento(
      [
        // Completada el 16 a las 23:30 de Lima (04:30 UTC del 17): a tiempo para el 16.
        tarea({ fecha_limite: "2026-10-16", estado: "completada", completada_at: "2026-10-17T04:30:00Z" }),
        tarea({ fecha_limite: "2026-10-15", estado: "completada", completada_at: "2026-10-17T15:00:00Z" }),
        tarea({ fecha_limite: "2026-10-14", estado: "pendiente" }),
      ],
      "2026-10-12",
      "2026-10-18",
      HOY,
      "America/Lima"
    );
    expect(r).toEqual({ a_tiempo: 1, atrasadas: 2, pct: 33 });
  });
  it("lo abierto que todavía no vence no cuenta; sin nada que medir, no hay porcentaje", () => {
    expect(cumplimiento([tarea({ fecha_limite: "2026-10-23" })], "2026-10-19", "2026-10-25", HOY)).toEqual({ a_tiempo: 0, atrasadas: 0, pct: null });
    expect(cumplimiento([], "2026-10-19", "2026-10-25", HOY).pct).toBeNull();
  });
  it("lo que vence fuera del periodo no entra", () => {
    expect(cumplimiento([tarea({ fecha_limite: "2026-10-30", estado: "completada", completada_at: "2026-10-19T15:00:00Z" })], "2026-10-19", "2026-10-25", HOY).pct).toBeNull();
  });
});

describe("cómo está una persona ahora", () => {
  const ahora = new Date("2026-10-19T15:00:00Z");
  it("sin apertura de hoy, «no abrió», aunque tenga el cronómetro corriendo", () => {
    expect(estadoPersona({ abrio: false, bloqueada: false, cronometro: true, ultimoMovimiento: null }, ahora)).toBe("no_abrio");
  });
  it("el bloqueo pesa más que el cronómetro", () => {
    expect(estadoPersona({ abrio: true, bloqueada: true, cronometro: true, ultimoMovimiento: "2026-10-19T14:59:00Z" }, ahora)).toBe("bloqueado");
  });
  it("cronómetro corriendo = activo; sin movimiento en una hora = sin señal; si no, en pausa", () => {
    expect(estadoPersona({ abrio: true, bloqueada: false, cronometro: true, ultimoMovimiento: null }, ahora)).toBe("activo");
    expect(estadoPersona({ abrio: true, bloqueada: false, cronometro: false, ultimoMovimiento: "2026-10-19T13:30:00Z" }, ahora)).toBe("sin_senal");
    expect(estadoPersona({ abrio: true, bloqueada: false, cronometro: false, ultimoMovimiento: null }, ahora)).toBe("sin_senal");
    expect(estadoPersona({ abrio: true, bloqueada: false, cronometro: false, ultimoMovimiento: "2026-10-19T14:30:00Z" }, ahora)).toBe("en_pausa");
  });
});

describe("días y textos", () => {
  it("el día de hoy se cuenta en el reloj de la empresa", () => {
    // 03:00 UTC del 20 es todavía el 19 en Lima.
    expect(hoyEn("America/Lima", new Date("2026-10-20T03:00:00Z"))).toBe("2026-10-19");
  });
  it("el próximo día hábil: el viernes y el sábado apuntan al lunes", () => {
    expect(siguienteDiaHabil("2026-10-19")).toBe("2026-10-20");
    expect(siguienteDiaHabil("2026-10-23")).toBe("2026-10-26");
    expect(siguienteDiaHabil("2026-10-24")).toBe("2026-10-26");
    expect(siguienteDiaHabil("2026-10-25")).toBe("2026-10-26");
  });
  it("lunes a viernes de una semana", () => {
    expect(diasHabiles("2026-10-19")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  });
  it("fechas cortas en castellano y relativas a hoy", () => {
    expect(textoDia("2026-10-23")).toBe("vie 23");
    expect(textoDia(null)).toBe("Sin fecha");
    expect(textoDiaRelativo(HOY, HOY)).toBe("Hoy");
    expect(textoDiaRelativo("2026-10-18", HOY)).toBe("Ayer");
    expect(textoDiaRelativo("2026-10-20", HOY)).toBe("Mañana");
    expect(textoDiaRelativo("2026-10-15", HOY)).toBe("jue 15");
  });
  it("iniciales para el avatar", () => {
    expect(iniciales("Carla Mendoza")).toBe("CM");
    expect(iniciales("rosa@empresa.pe")).toBe("RE");
    expect(iniciales("")).toBe("·");
  });
});
