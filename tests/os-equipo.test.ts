/**
 * RENASER OS · «MI EQUIPO» SIN BASE DE DATOS (19-10-2026). Las cuentas de Equipo en vivo, del estado de un proyecto, del
 * reporte semanal, del monitoreo de talento y del armado de un ciclo 360. Todo en el reloj de Lima (UTC−5).
 */
import { describe, it, expect } from "vitest";
import { armarEquipo, inicioDelDia, instanteEn, localEn } from "@/lib/os/equipo";
import { avanceDe, estadoProyecto } from "@/lib/os/proyectos";
import { armarReporte } from "@/lib/os/reporte";
import { armarMonitoreo, asignaciones360 } from "@/lib/os/talento";
import type { PersonaOS } from "@/lib/os/acceso";
import type { TareaOS, RegistroTiempo } from "@/lib/os/calculos";

const LIMA = "America/Lima";
const HOY = "2026-10-19"; // lunes
const AHORA = new Date("2026-10-19T15:00:00Z"); // 10:00 en Lima

const persona = (id: string, nombre: string, extra: Partial<PersonaOS> = {}): PersonaOS => ({
  id, company_id: "e", user_id: `u-${id}`, email: null, nombre, puesto: null, area: null, rol: "persona", capacidad_min: 480, activo: true,
  created_at: "2026-01-01T00:00:00Z", ...extra,
});
const tarea = (id: string, persona_id: string, extra: Partial<TareaOS> = {}): TareaOS => ({
  id, persona_id, proyecto_id: null, titulo: `Tarea ${id}`, descripcion: null, estado: "pendiente", prioridad: "media",
  fecha_inicio: null, fecha_limite: null, completada_at: null, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z", ...extra,
});
const registro = (id: string, persona_id: string, tarea_id: string, inicio: string, fin: string | null): RegistroTiempo => ({ id, persona_id, tarea_id, inicio, fin, nota: null });

describe("el reloj de la empresa", () => {
  it("la medianoche de Lima es las 05:00 UTC", () => {
    expect(inicioDelDia("2026-10-19", LIMA).toISOString()).toBe("2026-10-19T05:00:00.000Z");
  });
  it("un datetime-local se lee en Lima y vuelve igual", () => {
    const i = instanteEn("2026-10-21T16:00", LIMA)!;
    expect(i.toISOString()).toBe("2026-10-21T21:00:00.000Z");
    expect(localEn(i, LIMA)).toBe("2026-10-21T16:00");
    expect(instanteEn("mañana", LIMA)).toBeNull();
  });
});

describe("Equipo en vivo", () => {
  const personas = [persona("a", "Carla Mendoza"), persona("b", "José Ramírez"), persona("c", "Jorge Salazar"), persona("d", "Pedro Rojas", { capacidad_min: 300 })];
  const tareas = [
    tarea("t1", "a", { fecha_inicio: HOY, estado: "en_curso" }),
    tarea("t2", "b", { fecha_inicio: HOY, estado: "bloqueada" }),
    tarea("t3", "c", { fecha_inicio: "2026-10-16" }),
  ];
  const e = armarEquipo({
    personas,
    tareas,
    registros: [
      registro("r1", "a", "t1", "2026-10-19T14:13:00Z", null), // 9:13 Lima, corriendo: 47 min
      registro("r2", "c", "t3", "2026-10-18T23:40:00Z", null), // ayer 18:40 Lima, corriendo: olvidado
    ],
    aperturas: [
      { id: "ap1", persona_id: "a", fecha: HOY, animo: 4, compromiso: null, created_at: "2026-10-19T13:04:00Z" },
      { id: "ap2", persona_id: "b", fecha: HOY, animo: 2, compromiso: null, created_at: "2026-10-19T13:20:00Z" },
      { id: "ap3", persona_id: "c", fecha: HOY, animo: 3, compromiso: null, created_at: "2026-10-19T13:30:00Z" },
    ],
    bloqueos: [{ id: "bl", tarea_id: "t2", persona_id: "b", causa: "sin camión", depende_de: null, desde: "2026-10-19T14:15:00Z", hasta: null }],
    hoy: HOY,
    zona: LIMA,
    ahora: AHORA,
  });
  const de = (id: string) => e.filas.find((f) => f.persona.id === id)!;

  it("cada persona con su estado: en foco, bloqueada, con un cronómetro olvidado (no es «activo») y sin abrir", () => {
    expect(de("a").estado).toBe("activo");
    expect(de("a").ahora).toBe("En foco: Tarea t1 · 47 min");
    expect(de("b").estado).toBe("bloqueado");
    expect(de("b").ahora).toMatch(/^Bloqueado: sin camión · hace 45 min$/);
    // Jorge abrió a las 8:30 y su único cronómetro es el olvidado de ayer: su último movimiento real tiene 90 minutos.
    expect(de("c").estado).toBe("sin_senal");
    expect(de("c").ahora).toBe("Cronómetro olvidado en «Tarea t3» · corre hace 15 h 20");
    expect(de("d").estado).toBe("no_abrio");
    expect(de("d").ahora).toBe("Sin apertura ni tareas para hoy");
  });

  it("los indicadores: 3 de 4 abrieron, 1 activo, 1 bloqueado, 1 sin señal; el cronómetro olvidado no suma a la utilización", () => {
    expect([e.abrieron, e.total, e.activos, e.bloqueados, e.sinSenal]).toEqual([3, 4, 1, 1, 1]);
    expect(e.capacidadMin).toBe(1440); // tres personas de 8 h; Pedro no abrió, su capacidad no cuenta
    // Solo los 47 min de Carla: las horas del cronómetro olvidado de Jorge no son trabajo.
    expect(e.minutosHoy).toBe(47);
    expect(e.utilizacion).toBe(3);
  });

  it("el cronómetro de ayer es un olvidado; sin tareas para hoy quedan Jorge y Pedro; el ánimo promedia 3", () => {
    expect(e.olvidados.map((o) => o.nombre)).toEqual(["Jorge Salazar"]);
    expect(e.sinTrabajo.map((p) => p.nombre)).toEqual(["Jorge Salazar", "Pedro Rojas"]);
    expect(e.animo).toEqual({ conteo: [0, 1, 1, 1, 0], promedio: 3 });
  });

  it("una ficha sin cuenta no cuenta en «abrieron X de N» ni como «no abrió»: va aparte", () => {
    const sin = armarEquipo({
      personas: [persona("a", "Carla Mendoza"), persona("x", "Ana Flores", { user_id: null, email: "ana@correo.pe" })],
      tareas: [],
      registros: [],
      aperturas: [{ id: "ap", persona_id: "a", fecha: HOY, animo: 5, compromiso: null, created_at: "2026-10-19T13:00:00Z" }],
      bloqueos: [],
      hoy: HOY,
      zona: LIMA,
      ahora: AHORA,
    });
    expect([sin.abrieron, sin.total]).toEqual([1, 1]);
    expect(sin.filas.map((f) => f.persona.nombre)).toEqual(["Carla Mendoza"]);
    expect(sin.sinCuenta).toEqual([{ id: "x", nombre: "Ana Flores", puesto: null, email: "ana@correo.pe" }]);
    expect(sin.sinTrabajo.map((p) => p.nombre)).toEqual(["Carla Mendoza"]);
  });
});

describe("el estado de un proyecto sale de sus tareas y de su entrega", () => {
  const p = { fecha_entrega: "2026-10-31", cerrado_at: null, created_at: "2026-10-01T12:00:00Z" };
  it("sin empezar, en camino, en riesgo, atrasado, listo y cerrado", () => {
    expect(estadoProyecto(p, avanceDe([{ estado: "pendiente" }]), HOY)).toBe("sin_empezar");
    // Corrió 18 de 30 días (60 %) y va en 50 %: 10 puntos por detrás, todavía en camino.
    expect(estadoProyecto(p, avanceDe([{ estado: "completada" }, { estado: "en_curso" }]), HOY)).toBe("en_camino");
    // Va en 25 %: 35 puntos por detrás del tiempo, en riesgo.
    expect(estadoProyecto(p, avanceDe([{ estado: "completada" }, { estado: "pendiente" }, { estado: "pendiente" }, { estado: "pendiente" }]), HOY)).toBe("en_riesgo");
    expect(estadoProyecto(p, avanceDe([{ estado: "completada" }, { estado: "bloqueada" }]), HOY)).toBe("en_riesgo");
    expect(estadoProyecto({ ...p, fecha_entrega: "2026-10-15" }, avanceDe([{ estado: "completada" }, { estado: "pendiente" }]), HOY)).toBe("atrasado");
    expect(estadoProyecto(p, avanceDe([{ estado: "completada" }]), HOY)).toBe("listo");
    expect(estadoProyecto({ ...p, cerrado_at: "2026-10-18T00:00:00Z" }, avanceDe([]), HOY)).toBe("cerrado");
  });
  it("sin tareas no hay porcentaje", () => {
    expect(avanceDe([]).pct).toBeNull();
  });
});

describe("reporte semanal", () => {
  const LUNES = "2026-10-12";
  const r = armarReporte({
    lunes: LUNES,
    hoy: HOY,
    zona: LIMA,
    ahora: AHORA,
    personas: [persona("a", "Carla Mendoza"), persona("b", "Ana Flores")],
    tareas: [
      tarea("t1", "a", { estado: "completada", fecha_limite: "2026-10-13", completada_at: "2026-10-13T20:00:00Z" }), // a tiempo, martes
      tarea("t2", "a", { estado: "completada", fecha_limite: "2026-10-13", completada_at: "2026-10-15T20:00:00Z" }), // tarde, jueves
      tarea("t3", "b", { estado: "pendiente", fecha_limite: "2026-10-14" }), // vencida sin hacer
    ],
    registros: [
      registro("r1", "a", "t1", "2026-10-12T14:00:00Z", "2026-10-12T16:30:00Z"), // lunes, 2 h 30
      registro("r2", "a", "t2", "2026-10-15T14:00:00Z", "2026-10-15T15:00:00Z"), // jueves, 1 h
      registro("r3", "b", "t3", "2026-10-19T14:00:00Z", "2026-10-19T15:00:00Z"), // otra semana: no cuenta
    ],
    aperturas: [{ persona_id: "a", fecha: "2026-10-12" }, { persona_id: "a", fecha: "2026-10-15" }, { persona_id: "b", fecha: "2026-10-13" }],
    cierres: [{ persona_id: "a", fecha: "2026-10-12" }],
    cierresSemanales: [{ persona_id: "a", logros: "Salieron 9 pedidos", trabas: null, compromiso: null }],
    bloqueos: [
      { id: "b1", tarea_id: "t3", persona_id: "b", causa: "banco", depende_de: null, desde: "2026-10-14T14:00:00Z", hasta: "2026-10-14T16:00:00Z" },
      { id: "b2", tarea_id: "t3", persona_id: "b", causa: "banco", depende_de: null, desde: "2026-10-11T14:00:00Z", hasta: "2026-10-12T05:30:00Z" }, // empieza antes: cuenta desde el lunes 00:00 Lima
    ],
  });

  it("día por día: abrió, cerró, horas y tareas terminadas", () => {
    const carla = r.filas[0]!;
    expect(carla.dias.map((d) => [d.abrio, d.cerro, d.minutos, d.terminadas])).toEqual([
      [true, true, 150, 0],
      [false, false, 0, 1],
      [false, false, 0, 0],
      [true, false, 60, 1],
      [false, false, 0, 0],
    ]);
    expect([carla.minutos, carla.terminadas, carla.cierreSemanal]).toEqual([210, 2, true]);
  });

  it("la semana: terminadas, cumplimiento, tiempo bloqueado, cierres y lo que se trabó", () => {
    expect(r.terminadas).toBe(2);
    expect(r.cumplimiento).toEqual({ a_tiempo: 1, atrasadas: 2, pct: 33 });
    expect(r.minutosBloqueado).toBe(150);
    expect(r.bloqueos).toBe(2);
    expect([r.cierresHechos, r.faltanCierre]).toEqual([1, ["Ana Flores"]]);
    expect(r.trabas).toEqual([{ tarea: "Tarea t3", persona: "Ana Flores", veces: 2, minutos: 150 }]);
    expect(r.dichos).toEqual([{ nombre: "Carla Mendoza", logros: "Salieron 9 pedidos", trabas: null, compromiso: null }]);
  });
});

describe("talento", () => {
  it("inactiva: ficha vieja y sin un movimiento en 30 días; a quien llegó ayer no se le pide historia", () => {
    const filas = armarMonitoreo(
      [persona("a", "Carla"), persona("b", "Pedro"), persona("c", "Nueva", { created_at: "2026-10-18T00:00:00Z" })],
      [tarea("t1", "a", { estado: "completada", fecha_limite: "2026-10-10", completada_at: "2026-10-09T20:00:00Z" })],
      [{ persona_id: "a", cuando: "2026-10-19T14:00:00Z" }, { persona_id: "b", cuando: "2026-09-15T14:00:00Z" }],
      HOY,
      LIMA,
      AHORA
    );
    expect(filas.map((f) => [f.persona.nombre, f.pct, f.inactiva])).toEqual([
      ["Carla", 100, false],
      ["Pedro", null, true],
      ["Nueva", null, false],
    ]);
  });

  it("un ciclo 360: auto, jefe y dos pares; el jefe no se evalúa como jefe de sí mismo", () => {
    const azar = () => 0; // determinista
    const a = asignaciones360(["a", "j"], ["a", "b", "c", "d", "j"], "j", azar);
    const de = (id: string) => a.filter((x) => x.evaluado_id === id).map((x) => `${x.relacion}:${x.evaluador_id}`);
    expect(de("a")).toEqual(["auto:a", "jefe:j", "par:c", "par:d"]);
    expect(de("j")).toEqual(["auto:j", "par:b", "par:c"]);
    // Ningún par repetido sobre el mismo evaluado.
    for (const id of ["a", "j"]) {
      const evaluadores = a.filter((x) => x.evaluado_id === id).map((x) => x.evaluador_id);
      expect(new Set(evaluadores).size).toBe(evaluadores.length);
    }
  });
});
