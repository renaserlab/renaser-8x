import { describe, it, expect } from "vitest";
import { requiereValidacionPrioritaria, VIDA_UTIL_MESES, mesesDesde, preguntaDeVigencia, TIPOS_CRITICOS } from "@/lib/rules/vigencia";

const hoy = new Date("2026-08-22");

describe("vigencia: la edad nunca caduca nada por sí sola", () => {
  it("un propósito de hace 8 años NO dispara validación (vida útil null)", () => {
    expect(VIDA_UTIL_MESES.proposito).toBeNull();
    expect(requiereValidacionPrioritaria({ id: "1", tipo: "proposito", temporalidad: "actual", estado: "sin_verificar", fecha_afirmacion: "2018-01-01" }, hoy)).toBe(false);
  });
  it("una visión de hace 3 años no dispara; de hace 6 sí (solo validación, nunca caducado)", () => {
    expect(requiereValidacionPrioritaria({ id: "1", tipo: "vision", temporalidad: "actual", estado: "sin_verificar", fecha_afirmacion: "2023-08-01" }, hoy)).toBe(false);
    expect(requiereValidacionPrioritaria({ id: "1", tipo: "vision", temporalidad: "actual", estado: "sin_verificar", fecha_afirmacion: "2020-08-01" }, hoy)).toBe(true);
  });
  it("un precio de hace 4 meses dispara validación", () => {
    expect(requiereValidacionPrioritaria({ id: "1", tipo: "precio", temporalidad: "actual", estado: "sin_verificar", fecha_afirmacion: "2026-04-01" }, hoy)).toBe(true);
  });
  it("fecha nula en documento → validación prioritaria; fecha nula en entrevista → no", () => {
    expect(requiereValidacionPrioritaria({ id: "1", tipo: "proceso", temporalidad: "actual", estado: "sin_verificar", fecha_afirmacion: null, source_tipo: "documento" }, hoy)).toBe(true);
    expect(requiereValidacionPrioritaria({ id: "1", tipo: "proceso", temporalidad: "actual", estado: "sin_verificar", fecha_afirmacion: null, source_tipo: "entrevista" }, hoy)).toBe(false);
  });
  it("una afirmación ya confirmada nunca vuelve a pedir validación por edad", () => {
    expect(requiereValidacionPrioritaria({ id: "1", tipo: "precio", temporalidad: "actual", estado: "confirmado", fecha_afirmacion: "2020-01-01" }, hoy)).toBe(false);
  });
  it("no existe ninguna regla '18 meses = caducado': la función nunca devuelve un estado", () => {
    const r = requiereValidacionPrioritaria({ id: "1", tipo: "proceso", temporalidad: "actual", estado: "sin_verificar", fecha_afirmacion: "2020-01-01" }, hoy);
    expect(typeof r).toBe("boolean");
  });
  it("mesesDesde y la pregunta de validación", () => {
    expect(mesesDesde("2025-08-22", hoy)).toBe(12);
    expect(preguntaDeVigencia("Ser líder nacional", "Plan estratégico", "2023-05-01")).toMatch(/Plan estratégico/);
    expect(TIPOS_CRITICOS).toContain("precio");
  });
});
