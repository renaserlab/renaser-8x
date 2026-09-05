import { describe, it, expect } from "vitest";
import { calibrarImpacto, aplicarFiltros, estadoPilar, puntajePilar, fuentesIndependientes, tieneFuenteObjetiva, tieneEvidencia, type ClaimEvidencia } from "@/lib/rules/evidencia";

const ev = (id: string, o: Partial<ClaimEvidencia> = {}): ClaimEvidencia => ({ id, source_id: "doc1", participant_id: null, estado: "confirmado", source_tipo: "documento", ...o });
const pasa = { resultado: "pasa" as const, nota: "" };
const noPasa = { resultado: "no_pasa" as const, nota: "destruye al dueño" };

describe("hallazgo crítico: dos fuentes independientes o una objetiva", () => {
  it("una sola opinión del dueño no sostiene un hallazgo alto → medio + requiere validación", () => {
    const r = calibrarImpacto("alto", [ev("a", { participant_id: "dueno", source_id: "ent1", source_tipo: "entrevista" })], true);
    expect(r.impacto).toBe("medio");
    expect(r.requiere_validacion).toBe(true);
  });
  it("dos claims de la misma persona siguen siendo UNA fuente", () => {
    const r = calibrarImpacto("alto", [ev("a", { participant_id: "p1", source_tipo: "entrevista" }), ev("b", { participant_id: "p1", source_tipo: "entrevista" })], true);
    expect(fuentesIndependientes([ev("a", { participant_id: "p1" }), ev("b", { participant_id: "p1" })])).toBe(1);
    expect(r.impacto).toBe("medio");
  });
  it("dueño + empleado de otra área → dos fuentes → alto se mantiene", () => {
    const r = calibrarImpacto("alto", [ev("a", { participant_id: "dueno", source_tipo: "entrevista" }), ev("b", { participant_id: "rosa", source_tipo: "entrevista" })], true);
    expect(r.impacto).toBe("alto");
    expect(r.requiere_validacion).toBe(false);
  });
  it("documento + entrevista → dos fuentes", () => {
    expect(calibrarImpacto("alto", [ev("a"), ev("b", { participant_id: "dueno", source_id: "ent" })], true).impacto).toBe("alto");
  });
  it("un solo dato operativo (CSV de ventas) es fuente fuerte: alto se mantiene", () => {
    expect(tieneFuenteObjetiva([ev("a", { source_tipo: "dato" })])).toBe(true);
    expect(calibrarImpacto("alto", [ev("a", { source_id: "csv", source_tipo: "dato" })], true).impacto).toBe("alto");
  });
  it("una 'observacion' escrita por el dueño NO es fuente objetiva", () => {
    expect(tieneFuenteObjetiva([ev("a", { source_tipo: "observacion" })])).toBe(false);
  });
  it("evidencia caducada no cuenta como sustento: sin evidencia vigente → bajo + requiere validación", () => {
    const r = calibrarImpacto("alto", [ev("a", { estado: "caducado" }), ev("b", { source_id: "doc2", estado: "caducado" })], true);
    expect(r.impacto).toBe("bajo");
    expect(r.requiere_validacion).toBe(true);
  });
  it("si el AUDITOR no lo sustenta → bajo + requiere validación, aunque tenga 3 fuentes", () => {
    const r = calibrarImpacto("alto", [ev("a"), ev("b", { source_id: "d2" }), ev("c", { source_id: "d3" })], false);
    expect(r.impacto).toBe("bajo");
    expect(r.requiere_validacion).toBe(true);
  });
  it("impacto medio no exige dos fuentes", () => {
    expect(calibrarImpacto("medio", [ev("a")], true).impacto).toBe("medio");
  });
  it("sin evidencia no existe", () => {
    expect(tieneEvidencia([])).toBe(false);
  });
});

describe("filtros propósito / sabiduría / excelencia", () => {
  it("los tres pasan → la recomendación se emite", () => {
    const r = aplicarFiltros({ proposito: pasa, sabiduria: pasa, excelencia: pasa }, "Contratar un gerente");
    expect(r.bloqueada).toBe(false);
    expect(r.recomendacion).toBe("Contratar un gerente");
  });
  it("propósito reprobado → la recomendación se bloquea y queda la tensión", () => {
    const r = aplicarFiltros({ proposito: noPasa, sabiduria: pasa, excelencia: pasa }, "Triplicar precios");
    expect(r.bloqueada).toBe(true);
    expect(r.recomendacion).toBeNull();
    expect(r.tension).toBe("Triplicar precios");
    expect(r.reprobados).toEqual(["proposito"]);
  });
  it("sabiduría o excelencia reprobadas también bloquean", () => {
    expect(aplicarFiltros({ proposito: pasa, sabiduria: noPasa, excelencia: pasa }, "x").bloqueada).toBe(true);
    expect(aplicarFiltros({ proposito: pasa, sabiduria: pasa, excelencia: noPasa }, "x").bloqueada).toBe(true);
  });
});

describe("estado del pilar", () => {
  it("DESCONOCIDO con menos de N confirmadas aunque haya hallazgos", () => {
    expect(estadoPilar(["alto"], 3, 5)).toBe("desconocido");
  });
  it("crítico / mejorable / sólido", () => {
    expect(estadoPilar(["alto", "bajo"], 10, 5)).toBe("critico");
    expect(estadoPilar(["medio"], 10, 5)).toBe("mejorable");
    expect(estadoPilar(["bajo"], 10, 5)).toBe("solido");
    expect(estadoPilar([], 10, 5)).toBe("solido");
  });
});

describe("puntaje del pilar: calculado de los hallazgos, no una etiqueta con número fijo", () => {
  it("sin hallazgos → 90 (sólido no es perfecto)", () => {
    expect(puntajePilar([])).toBe(90);
  });
  it("dos pilares 'mejorables' con distinta carga ya no salen iguales", () => {
    const liviano = puntajePilar([{ impacto: "medio" }]);
    const pesado = puntajePilar([{ impacto: "medio" }, { impacto: "medio" }, { impacto: "bajo" }]);
    expect(liviano).toBe(80);
    expect(pesado).toBe(66);
    expect(liviano).not.toBe(pesado);
  });
  it("un alto pesa el doble que un medio; pendiente de validación pesa la mitad", () => {
    expect(puntajePilar([{ impacto: "alto" }])).toBe(70);
    expect(puntajePilar([{ impacto: "alto", requiere_validacion: true }])).toBe(80);
  });
  it("las fortalezas suman y el techo es 95", () => {
    expect(puntajePilar([{ impacto: null, preserva: true }, { impacto: null, preserva: true }])).toBe(95);
  });
  it("una avalancha de hallazgos no baja del piso 10", () => {
    expect(puntajePilar(Array.from({ length: 10 }, () => ({ impacto: "alto" as const })))).toBe(10);
  });
  it("la salud no se regala: cada confirmación da 5 puntos de techo — con el mínimo (5), máximo 25", () => {
    // Criterio de Kelin, afinado en tres pasadas: "¿86? es imposible si casi no tienen nada",
    // "65 sigue demasiado alto", "yo diría un 20, 30, lo que realmente sea".
    expect(puntajePilar([{ impacto: "bajo" }], 5)).toBe(25);
    expect(puntajePilar([], 5)).toBe(25);
    expect(puntajePilar([], 10)).toBe(50);
  });
  it("con conversación de verdad (19+) el techo pleno de 95 vuelve a regir", () => {
    expect(puntajePilar([], 19)).toBe(90);
    expect(puntajePilar([{ impacto: null, preserva: true }, { impacto: null, preserva: true }], 19)).toBe(95);
    expect(puntajePilar([], 14)).toBe(70);
  });
});
