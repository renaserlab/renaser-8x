/**
 * EL PULSO DE EMPRESAS (src/lib/os/pulso.ts), sin base: con un reloj fijo y datos planos, el estado de cada empresa,
 * sus puntos de «Requiere tu atención», el orden de la lista y el resumen de arriba.
 */
import { describe, it, expect } from "vitest";
import { armarPulso, estadoDe, horaYDia, enlaceAEmpresa, type Lectura } from "@/lib/os/pulso";

// Lunes 19-10-2026, 10:30 de Lima (UTC−5): día hábil y ya es hora de haber abierto el día.
const LUNES_1030 = new Date("2026-10-19T15:30:00Z");
// El mismo lunes a las 8:00 de Lima: todavía es temprano.
const LUNES_0800 = new Date("2026-10-19T13:00:00Z");
// Viernes 23-10-2026, 17:00 de Lima: ya se pide el cierre semanal.
const VIERNES = new Date("2026-10-23T22:00:00Z");

const vacia = (ahora: Date): Lectura => ({ ahora, empresas: [], personas: [], aperturas: [], tareas: [], bloqueos: [], cronometros: [], cierres: [], avisos: [] });

/** Una empresa con `n` personas con cuenta (p1…pn) y otra sin equipo. */
function lectura(ahora: Date, n = 4): Lectura {
  const l = vacia(ahora);
  l.empresas = [
    { id: "a", nombre: "Distribuidora Andina", zona_horaria: "America/Lima" },
    { id: "c", nombre: "Bodega Rosita", zona_horaria: null },
  ];
  l.personas = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, company_id: "a", user_id: `u${i + 1}` }));
  return l;
}

const base = { personas: 4, sinCuenta: 0, conCuenta: 4, abrieron: 4, horaDeAbrir: true, cumplimiento: { a_tiempo: 0, atrasadas: 0, pct: null }, bloqueos: 0, olvidados: 0, vencidas: 0, cierres: null, avisosSinLeer: 0 };

describe("el reloj de la empresa", () => {
  it("hora y día en Lima, no en UTC", () => {
    expect(horaYDia(LUNES_1030, "America/Lima")).toEqual({ hora: 10, dia: 1 });
    expect(horaYDia(VIERNES, "America/Lima")).toEqual({ hora: 17, dia: 5 });
    // Las 2:00 UTC del martes siguen siendo lunes en Lima.
    expect(horaYDia(new Date("2026-10-20T02:00:00Z"), "America/Lima")).toEqual({ hora: 21, dia: 1 });
  });
});

describe("el estado de una empresa, con reglas que se pueden decir en voz alta", () => {
  it("sin nadie en el equipo: sin RENASER OS", () => {
    expect(estadoDe({ ...base, personas: 0, conCuenta: 0, abrieron: 0 })).toBe("sin_os");
  });
  it("todo al día: bien", () => {
    expect(estadoDe(base)).toBe("bien");
    expect(estadoDe({ ...base, cumplimiento: { a_tiempo: 9, atrasadas: 1, pct: 90 } })).toBe("bien");
  });
  it("crítico: cumplimiento bajo 60, tres bloqueos, o menos de la mitad abrió a la hora de abrir", () => {
    expect(estadoDe({ ...base, cumplimiento: { a_tiempo: 5, atrasadas: 5, pct: 50 } })).toBe("critico");
    expect(estadoDe({ ...base, bloqueos: 3 })).toBe("critico");
    expect(estadoDe({ ...base, abrieron: 1 })).toBe("critico");
  });
  it("atento: cumplimiento bajo 80, un bloqueo, un cronómetro olvidado, una vencida, alguien sin abrir o cinco avisos sin leer", () => {
    expect(estadoDe({ ...base, cumplimiento: { a_tiempo: 7, atrasadas: 3, pct: 70 } })).toBe("atento");
    expect(estadoDe({ ...base, bloqueos: 1 })).toBe("atento");
    expect(estadoDe({ ...base, olvidados: 1 })).toBe("atento");
    expect(estadoDe({ ...base, vencidas: 1 })).toBe("atento");
    expect(estadoDe({ ...base, abrieron: 3 })).toBe("atento");
    expect(estadoDe({ ...base, avisosSinLeer: 5 })).toBe("atento");
    expect(estadoDe({ ...base, avisosSinLeer: 4 })).toBe("bien");
  });
  it("antes de la hora de abrir, nadie es culpable de no haber abierto", () => {
    expect(estadoDe({ ...base, abrieron: 0, horaDeAbrir: false })).toBe("bien");
  });
  it("sin tareas que midan, el cumplimiento no cuenta ni a favor ni en contra", () => {
    expect(estadoDe({ ...base, cumplimiento: { a_tiempo: 0, atrasadas: 0, pct: null } })).toBe("bien");
  });
});

describe("armarPulso", () => {
  it("el cumplimiento mira los últimos 7 días, no solo la semana en curso: un lunes ya cuenta lo que venció el jueves", () => {
    const l = lectura(LUNES_1030);
    l.tareas = [
      { company_id: "a", estado: "pendiente", fecha_limite: "2026-10-15", completada_at: null }, // jueves: dentro, atrasada
      { company_id: "a", estado: "completada", fecha_limite: "2026-10-16", completada_at: "2026-10-16T20:00:00Z" }, // viernes: a tiempo
      { company_id: "a", estado: "pendiente", fecha_limite: "2026-10-12", completada_at: null }, // hace 7 días: fuera
    ];
    const a = armarPulso(l).filas.find((f) => f.id === "a")!;
    expect(a.cumplimiento).toEqual({ a_tiempo: 1, atrasadas: 1, pct: 50 });
    expect(a.puntos.map((p) => p.texto)).toContain("Cumplimiento de los últimos 7 días: 50% (1 a tiempo, 1 atrasada).");
  });

  it("cuenta quién abrió hoy (solo personas con cuenta), los bloqueos, los cronómetros olvidados y las vencidas", () => {
    const l = lectura(LUNES_1030);
    l.personas.push({ id: "p5", company_id: "a", user_id: null });
    l.aperturas = [
      { company_id: "a", persona_id: "p1", fecha: "2026-10-19" },
      { company_id: "a", persona_id: "p2", fecha: "2026-10-19" },
      { company_id: "a", persona_id: "p3", fecha: "2026-10-16" }, // la del viernes no cuenta hoy
    ];
    l.bloqueos = [
      { company_id: "a", desde: "2026-10-19T14:45:00Z", titulo: "Ruta Lima Norte" },
      { company_id: "a", desde: "2026-10-19T13:00:00Z", titulo: "Conciliar Yape" },
    ];
    l.cronometros = [
      { company_id: "a", inicio: "2026-10-18T23:40:00Z", fin: null }, // 15 h 50: olvidado
      { company_id: "a", inicio: "2026-10-19T15:00:00Z", fin: null },
    ];
    l.tareas = [
      { company_id: "a", estado: "pendiente", fecha_limite: "2026-10-09", completada_at: null }, // vencida, fuera de los 7 días
      { company_id: "a", estado: "completada", fecha_limite: "2026-10-19", completada_at: "2026-10-19T14:00:00Z" },
    ];
    const { filas, resumen } = armarPulso(l);
    const a = filas.find((f) => f.id === "a")!;
    expect(a).toMatchObject({ personas: 5, conCuenta: 4, sinCuenta: 1, abrieron: 2, horaDeAbrir: true, bloqueos: 2, olvidados: 1, vencidas: 1, cierres: null });
    expect(a.cumplimiento).toEqual({ a_tiempo: 1, atrasadas: 0, pct: 100 });
    // La mitad abrió: no es «menos de la mitad», pero sí faltan dos → atento (con bloqueos y vencidas, también).
    expect(a.estado).toBe("atento");
    const textos = a.puntos.map((p) => p.texto);
    expect(textos[0]).toBe("2 personas no abrieron el día (abrieron 2 de 4).");
    expect(textos).toContain("2 bloqueos abiertos; el más antiguo, «Conciliar Yape», hace 2 h.");
    expect(textos).toContain("1 cronómetro olvidado (más de 10 horas corriendo).");
    expect(textos).toContain("1 tarea vencida sin terminar.");
    expect(textos).toContain("1 persona del equipo todavía no entra con su correo.");
    expect(resumen).toEqual({ empresas: 2, conOS: 1, conCuenta: 4, abrieron: 2, bloqueos: 2, avisosSinLeer: 0 });
  });

  it("la empresa sin equipo dice cómo activarlo, y va al final de la lista; la que pide atención, primero", () => {
    const l = lectura(LUNES_1030);
    l.empresas.push({ id: "b", nombre: "Estudio Vargas", zona_horaria: "America/Lima" });
    l.personas.push({ id: "q1", company_id: "b", user_id: "v1" });
    l.aperturas = [
      ...l.personas.filter((p) => p.company_id === "a").map((p) => ({ company_id: "a", persona_id: p.id, fecha: "2026-10-19" })),
      { company_id: "b", persona_id: "q1", fecha: "2026-10-19" },
    ];
    l.bloqueos = [1, 2, 3].map((i) => ({ company_id: "b", desde: `2026-10-19T1${i}:00:00Z`, titulo: null }));
    const { filas } = armarPulso(l);
    expect(filas.map((f) => [f.nombre, f.estado])).toEqual([
      ["Estudio Vargas", "critico"],
      ["Distribuidora Andina", "bien"],
      ["Bodega Rosita", "sin_os"],
    ]);
    expect(filas[1]!.puntos[0]).toEqual({ texto: "El equipo está al día.", tono: "verde" });
    expect(filas[2]!.puntos).toHaveLength(1);
    expect(filas[2]!.puntos[0]!.texto).toMatch(/Equipo y talento/);
  });

  it("temprano en la mañana no se exige la apertura: se informa cuántos abrieron, sin alarma", () => {
    const { filas } = armarPulso(lectura(LUNES_0800));
    const a = filas.find((f) => f.id === "a")!;
    expect(a.horaDeAbrir).toBe(false);
    expect(a.estado).toBe("bien");
    expect(a.puntos.map((p) => p.texto)).toContain("Abrieron el día 0 de 4.");
  });

  it("desde el viernes se cuenta el cierre semanal de esta semana (el de la anterior no vale)", () => {
    const l = lectura(VIERNES);
    l.aperturas = l.personas.map((p) => ({ company_id: "a", persona_id: p.id, fecha: "2026-10-23" }));
    l.cierres = [
      { company_id: "a", persona_id: "p1", semana: "2026-10-19" },
      { company_id: "a", persona_id: "p2", semana: "2026-10-12" },
    ];
    const a = armarPulso(l).filas.find((f) => f.id === "a")!;
    expect(a.cierres).toBe(1);
    expect(a.puntos.map((p) => p.texto)).toContain("Cierre semanal: 1 de 4.");
  });

  it("el enlace a una empresa pasa por «ver como el empresario» con su destino", () => {
    expect(enlaceAEmpresa("a b", "/os/equipo")).toBe("/api/consultor/ver-portal?empresa=a%20b&destino=%2Fos%2Fequipo");
  });
});
