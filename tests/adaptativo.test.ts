import { describe, it, expect } from "vitest";
import { clasificarModelo, etapaDe, matricesComoTexto, MATRICES } from "@/lib/rules/matrices";
import { preguntaRepetida, RECLAMO_REPETIDO } from "@/lib/jobs/handlers/entrevista";
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

describe("Candado de redundancia (queja real: la misma pregunta 5-6 veces)", () => {
  const hechas = ["Cuéntame el día que decidiste empezar con las terapias: ¿qué estaba pasando en tu vida?"];
  it("detecta la misma pregunta con una palabra cambiada", () => {
    expect(preguntaRepetida("Cuéntame el día que decidiste empezar con las terapias: ¿qué pasaba en tu vida en ese momento?", hechas)).toBe(true);
    expect(preguntaRepetida("Cuéntame ese día en que decidiste empezar con las terapias: ¿qué estaba pasando?", hechas)).toBe(true);
  });
  it("deja pasar preguntas realmente distintas", () => {
    expect(preguntaRepetida("¿Cuánta plata entró al negocio el mes pasado, más o menos?", hechas)).toBe(false);
    expect(preguntaRepetida("¿Quiénes trabajan contigo y cómo llegó cada uno?", hechas)).toBe(false);
  });
  it("reconoce el reclamo 'ya te lo dije' en sus variantes", () => {
    for (const r of ["Ya te respondí en la anterior pregunta", "Te respondí por tercera vez", "eso ya lo dije", "ya respondí eso", "es la misma pregunta otra vez"]) expect(RECLAMO_REPETIDO.test(r)).toBe(true);
    expect(RECLAMO_REPETIDO.test("Empecé hace seis años con mi esposa")).toBe(false);
  });
});

describe("Biblioteca de documentos (el diagnóstico dicta qué construir)", async () => {
  const { bibliotecaRecomendada } = await import("@/lib/biblioteca");
  const { BLOQUES_ACTIVOS, EJEMPLOS } = await import("@/lib/activos");
  it("dependencia del fundador → funciones, políticas de decisión y plan de personal", () => {
    const r = bibliotecaRecomendada([{ patron: "dependencia_fundador", pilar: "personas", titulo: "Todo pasa por el dueño", impacto: "alto" }]);
    expect(r.map((x) => x.clave)).toContain("personas.funciones");
    expect(r[0].razon).toBe("Todo pasa por el dueño");
  });
  it("know-how en una persona → plan de personal (el plan B)", () => {
    const r = bibliotecaRecomendada([{ patron: "know_how_en_una_persona", pilar: "personas", titulo: "Solo Rosa sabe comprar", impacto: "alto" }]);
    expect(r[0].clave).toBe("personas.plan_personal");
  });
  it("sin hallazgos, la etapa sugiere y devuelve máximo 3", () => {
    const r = bibliotecaRecomendada([], "temprana");
    expect(r.length).toBe(3);
    expect(r[0].clave).toBe("procesos.mapa_procesos");
  });
  it("los hallazgos rechazados no dictan documentos", () => {
    const r = bibliotecaRecomendada([{ patron: "dependencia_fundador", pilar: "personas", titulo: "x", impacto: "alto", estado_revision: "rechazado" }], "madura");
    expect(r.every((x) => x.razon === "por la etapa de tu negocio")).toBe(true);
  });
  it("existen los 3 documentos nuevos con sus preguntas vividas", () => {
    const claves = BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`));
    for (const c of ["personas.plan_personal", "personas.reglamento", "personas.cultura"]) expect(claves).toContain(c);
  });
  it("cada ejemplo apunta a una pregunta que existe (sin claves huérfanas)", () => {
    const preguntas = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.flatMap((a) => a.preguntas)));
    for (const k of Object.keys(EJEMPLOS)) expect(preguntas.has(k), `ejemplo huérfano: ${k.slice(0, 60)}`).toBe(true);
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
