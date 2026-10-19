/**
 * RENASER OS · «MI DÍA» SIN BASE DE DATOS (src/lib/os/dia.ts): cuándo se puede cerrar el día y la semana, la racha de
 * aperturas, qué archivo se puede entregar y cómo se arma el podio de la semana.
 */
import { describe, it, expect } from "vitest";
import {
  horaLocal, diaDeSemana, fechaLarga, desdeCuando, puedeCerrarDia, puedeCerrarSemana, racha, validarEntregable, textoTamano, armarPodio,
} from "@/lib/os/dia";

const ZONA = "America/Lima";

describe("horas y días de la empresa", () => {
  it("la hora se lee en el reloj de Lima", () => {
    expect(horaLocal("2026-10-19T13:04:00Z", ZONA)).toEqual({ h: 8, m: 4 });
  });
  it("el cierre del día se abre a las 17:00 de Lima", () => {
    expect(puedeCerrarDia(new Date("2026-10-19T21:59:00Z"), ZONA)).toBe(false); // 16:59
    expect(puedeCerrarDia(new Date("2026-10-19T22:00:00Z"), ZONA)).toBe(true); // 17:00
  });
  it("el cierre semanal, de viernes a domingo", () => {
    expect(puedeCerrarSemana("2026-10-22")).toBe(false);
    expect(puedeCerrarSemana("2026-10-23")).toBe(true);
    expect(puedeCerrarSemana("2026-10-25")).toBe(true);
    expect(diaDeSemana("2026-10-25")).toBe(7);
  });
  it("fechas escritas como se dicen", () => {
    expect(fechaLarga("2026-10-19")).toBe("Lunes 19 de octubre");
    expect(desdeCuando("2026-10-18", "2026-10-19")).toBe("ayer");
    expect(desdeCuando("2026-10-15", "2026-10-19")).toBe("el jueves");
    expect(desdeCuando("2026-09-30", "2026-10-19")).toBe("el 30 de septiembre");
  });
});

describe("racha de aperturas", () => {
  it("cuenta días hábiles seguidos; el fin de semana no la corta", () => {
    const dias = new Set(["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"]);
    expect(racha(dias, "2026-10-19")).toBe(5);
  });
  it("si hoy todavía no abrió, cuenta hasta ayer; un día hábil sin apertura la corta", () => {
    const dias = new Set(["2026-10-14", "2026-10-16"]);
    expect(racha(dias, "2026-10-19")).toBe(1);
    expect(racha(new Set(), "2026-10-19")).toBe(0);
  });
});

describe("entregables", () => {
  it("acepta documentos, hojas, imágenes, texto y zip; manda la extensión", () => {
    expect(validarEntregable({ nombre: "Cotización El Sol.pdf", bytes: 2048 })).toEqual({ ok: true, nombre: "Cotizaci_n_El_Sol.pdf", mime: "application/pdf" });
    expect(validarEntregable({ nombre: "fotos.zip", bytes: 10 }).ok).toBe(true);
  });
  it("rechaza vacío, demasiado grande y tipos raros, con un mensaje que se entiende", () => {
    expect(validarEntregable({ nombre: "a.pdf", bytes: 0 })).toEqual({ ok: false, error: "El archivo está vacío." });
    expect(validarEntregable({ nombre: "a.pdf", bytes: 16 * 1024 * 1024 }).ok).toBe(false);
    const exe = validarEntregable({ nombre: "programa.exe", bytes: 10 });
    expect(exe.ok).toBe(false);
    if (!exe.ok) expect(exe.error).toMatch(/\.exe/);
  });
  it("el tamaño se escribe en KB o MB", () => {
    expect(textoTamano(2048)).toBe("2 KB");
    expect(textoTamano(3 * 1024 * 1024)).toBe("3,0 MB");
    expect(textoTamano(null)).toBe("—");
  });
});

describe("el podio de la semana", () => {
  const lunes = "2026-10-12";
  const hoy = "2026-10-19";
  const personas = [
    { id: "a", nombre: "Ana", puesto: null },
    { id: "b", nombre: "Beto", puesto: null },
    { id: "c", nombre: "Carla", puesto: null },
    { id: "d", nombre: "Dante", puesto: null },
  ];
  const ahora = new Date("2026-10-19T15:00:00Z");

  it("ordena por cumplimiento, luego completadas y horas; sube al podio solo quien tuvo algo que contar", () => {
    const { filas, podio } = armarPodio(
      {
        personas,
        tareas: [
          { persona_id: "a", estado: "completada", fecha_limite: "2026-10-14", completada_at: "2026-10-14T15:00:00Z" },
          { persona_id: "b", estado: "completada", fecha_limite: "2026-10-14", completada_at: "2026-10-16T15:00:00Z" },
          { persona_id: "c", estado: "completada", fecha_limite: "2026-10-14", completada_at: "2026-10-13T15:00:00Z" },
          { persona_id: "c", estado: "completada", fecha_limite: "2026-10-15", completada_at: "2026-10-15T15:00:00Z" },
        ],
        registros: [{ persona_id: "b", inicio: "2026-10-13T14:00:00Z", fin: "2026-10-13T16:00:00Z" }],
        aperturas: [
          { persona_id: "a", fecha: "2026-10-13", created_at: "2026-10-13T13:30:00Z" }, // 8:30 en Lima: a tiempo
          { persona_id: "a", fecha: "2026-10-14", created_at: "2026-10-14T15:00:00Z" }, // 10:00: tarde
        ],
        lunes,
        hoy,
        zona: ZONA,
      },
      ahora
    );
    expect(filas.map((f) => f.persona_id)).toEqual(["c", "a", "b", "d"]);
    expect(podio.map((f) => f.persona_id)).toEqual(["c", "a", "b"]);
    expect(filas.find((f) => f.persona_id === "a")!.abrio_a_tiempo).toBe(1);
    expect(filas.find((f) => f.persona_id === "b")).toMatchObject({ pct: 0, completadas: 1, minutos: 120 });
  });

  it("sin nada que medir, no hay podio", () => {
    expect(armarPodio({ personas, tareas: [], registros: [], aperturas: [], lunes, hoy, zona: ZONA }, ahora).podio).toEqual([]);
  });
});
