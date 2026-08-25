import { describe, it, expect } from "vitest";
import { clasificarModelo, etapaDe, matricesComoTexto, MATRICES } from "@/lib/rules/matrices";
import { detectarAnomalias, tablaResultadosComoTexto, type Metrica } from "@/lib/rules/anomalias";
import { BLOQUES } from "@/lib/rules/cobertura";

describe("Sistema Adaptativo v2 · clasificación por modelo operativo", () => {
  it("clasifica negocios típicos peruanos por sus señales", () => {
    expect(clasificarModelo(["Cevichería en Surquillo"])).toContain("restaurante");
    expect(clasificarModelo(["ferretería y venta de materiales"])).toContain("retail");
    expect(clasificarModelo(["taller mecánico"])).toContain("orden");
    expect(clasificarModelo(["peluquería y spa"])).toContain("citas");
    expect(clasificarModelo(["estudio contable"])).toContain("profesional");
    expect(clasificarModelo(["academia de inglés"])).toContain("recurrencia");
    expect(clasificarModelo(["planta agroindustrial"])).toContain("produccion");
  });
  it("un negocio puede activar varias matrices (varios motores)", () => {
    const m = clasificarModelo(["clínica dental que también tiene tienda de productos"]);
    expect(m).toContain("citas");
    expect(m).toContain("retail");
  });
  it("regla de respaldo: sin señales devuelve vacío y el sistema sigue con el árbol universal", () => {
    expect(clasificarModelo(["importadora de maquinaria especial xyz"])).toEqual([]);
    expect(matricesComoTexto([])).toBe("");
  });
  it("las preguntas de las matrices no usan jerga (sin porcentaje/ticket/lead/conversión)", () => {
    const prohibidas = /porcentaje|ticket|lead|conversi[oó]n|no.?show|kpi|margen operativo|food cost/i;
    for (const m of MATRICES) for (const q of m.preguntas) expect(q).not.toMatch(prohibidas);
  });
  it("la etapa se deriva de la antigüedad", () => {
    expect(etapaDe(0.5)).toBe("inicio");
    expect(etapaDe(2)).toBe("temprana");
    expect(etapaDe(5)).toBe("estructura");
    expect(etapaDe(12)).toBe("madura");
    expect(etapaDe(null)).toBeNull();
  });
});

describe("Sistema Adaptativo v2 · motor de anomalías", () => {
  const base: Metrica[] = [
    { clave: "venta_mes", periodo: "2026-05", valor: 20000, estado: "contado" },
    { clave: "venta_mes", periodo: "2026-06", valor: 18000, estado: "contado" },
    { clave: "venta_mes", periodo: "2026-07", valor: 16000, estado: "contado" },
  ];
  it("regla caja: se vende más de lo que se cobra", () => {
    const s = detectarAnomalias([...base, { clave: "cobrado_mes", periodo: "2026-07", valor: 10000, estado: "contado" }]);
    expect(s.some((x) => x.regla === "caja")).toBe(true);
  });
  it("regla época dorada: el pasado supera al presente → volver a lo probado", () => {
    const s = detectarAnomalias([...base, { clave: "venta_epoca_dorada", periodo: "epoca_dorada", valor: 40000, valor_texto: "en 2023 vendía el doble", estado: "contado" }]);
    const e = s.find((x) => x.regla === "epoca_dorada");
    expect(e).toBeDefined();
    expect(e!.detalle).toContain("40");
    expect(e!.detalle.toLowerCase()).toContain("abandon");
  });
  it("regla sin registro: la falta de dato es hallazgo, no culpa", () => {
    const s = detectarAnomalias([{ clave: "clientes_activos", periodo: "actual", valor: null, estado: "sin_dato", nota: "no queda apuntado en ningún lado" }]);
    const x = s.find((y) => y.regla === "sin_registro");
    expect(x).toBeDefined();
    expect(x!.detalle).toContain("Nunca es una falta del dueño");
  });
  it("volatilidad: el mejor mes dobla al peor", () => {
    const s = detectarAnomalias([
      { clave: "venta_mes", periodo: "2026-04", valor: 30000, estado: "contado" },
      { clave: "venta_mes", periodo: "2026-05", valor: 12000, estado: "contado" },
      { clave: "venta_mes", periodo: "2026-06", valor: 14000, estado: "contado" },
    ]);
    expect(s.some((x) => x.regla === "volatilidad")).toBe(true);
  });
  it("sin métricas no inventa señales", () => {
    expect(detectarAnomalias([])).toEqual([]);
  });
  it("la tabla de resultados se resume con estados y guía de llenado conversacional", () => {
    const t = tablaResultadosComoTexto(base);
    expect(t).toContain("2026-07");
    expect(t).toContain("[contado]");
    expect(t).toContain("un");
    expect(tablaResultadosComoTexto([])).toContain("conversando");
  });
});

describe("Sistema Adaptativo v2 · banco", () => {
  it("empresa_dueno incluye la época dorada con la secuencia completa", () => {
    const b = BLOQUES.empresa_dueno.find((x) => x.clave === "epoca_dorada");
    expect(b).toBeDefined();
    const todas = b!.preguntas.join(" ");
    for (const frag of ["vendía más que hoy", "Cuánto vendías", "ya no haces", "qué cambió", "volvió a buscar", "volver a hacer", "no habría que repetir"]) expect(todas.toLowerCase()).toContain(frag.toLowerCase());
  });
});
