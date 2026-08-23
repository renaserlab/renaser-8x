import { describe, it, expect } from "vitest";
import { SalidaExtractor, SalidaContrastador, SalidaEntrevistador, SalidaMinero, SalidaArquitecto, SalidaDiagnosticador, SalidaAuditor, SalidaPlanificador, SalidaRedactor, SalidaSop } from "@/lib/schemas";

describe("esquemas Zod: salidas estructuradas siempre", () => {
  it("extractor: fecha inválida → null (nunca se estima); pilar desconocido → transversal", () => {
    const r = SalidaExtractor.parse({ afirmaciones: [{ texto: "Vendemos a pymes", pilar: "finanzas", tipo: "cliente", temporalidad: "actual", fecha_afirmacion: "2023" }] });
    expect(r.afirmaciones[0].fecha_afirmacion).toBeNull();
    expect(r.afirmaciones[0].pilar).toBe("transversal");
  });
  it("extractor: texto vacío es inválido", () => {
    expect(SalidaExtractor.safeParse({ afirmaciones: [{ texto: "", pilar: "personas", tipo: "rol", temporalidad: "actual", fecha_afirmacion: null }] }).success).toBe(false);
  });
  it("contrastador exige booleano", () => {
    expect(SalidaContrastador.safeParse({ se_contradicen: "sí", explicacion: "", cual_parece_vigente: null, pregunta_sugerida: null }).success).toBe(false);
  });
  it("entrevistador: nunca más de 3 preguntas", () => {
    const p = Array(4).fill({ texto: "¿Qué vendes hoy?", bloque: "hoy" });
    expect(SalidaEntrevistador.safeParse({ preguntas: p }).success).toBe(false);
    expect(SalidaEntrevistador.safeParse({ preguntas: p.slice(0, 3) }).success).toBe(true);
  });
  it("entrevistador: un origen_claim_id que no es uuid invalida la pregunta", () => {
    expect(SalidaEntrevistador.safeParse({ preguntas: [{ texto: "¿Sigue vigente?", bloque: "validacion", origen_claim_id: "abc" }] }).success).toBe(false);
  });
  it("minero: campos faltantes son null, destino por defecto pendiente", () => {
    const r = SalidaMinero.parse({ unidades: [{ situacion: "compra de palta", senal: "textura", decision: null, excepcion: null, estandar: null, error_frecuente: null, regla_practica: null, escalamiento: null, destino: "x" }] });
    expect(r.unidades[0].destino).toBe("pendiente");
  });
  it("arquitecto: tipo de nodo inválido rechaza", () => {
    expect(SalidaArquitecto.safeParse({ nombre: "x", nodos: [{ id: "n1", tipo: "tarea", etiqueta: "a" }], conexiones: [] }).success).toBe(false);
  });
  it("diagnosticador: un hallazgo sin claim_ids NO valida (sin evidencia no entra)", () => {
    const base = { titulo: "t", patron: null, causa_raiz: "c", impacto: "alto", veredicto: null, recomendacion: null, filtros: { proposito: { resultado: "pasa", nota: "" }, sabiduria: { resultado: "pasa", nota: "" }, excelencia: { resultado: "pasa", nota: "" } } };
    expect(SalidaDiagnosticador.safeParse({ hallazgos: [{ ...base, claim_ids: [] }] }).success).toBe(false);
    expect(SalidaDiagnosticador.safeParse({ hallazgos: [{ ...base, claim_ids: ["a"] }] }).success).toBe(true);
  });
  it("diagnosticador: los tres filtros son obligatorios", () => {
    const sinFiltros = { titulo: "t", patron: null, causa_raiz: "c", impacto: "alto", veredicto: null, recomendacion: null, claim_ids: ["a"] };
    expect(SalidaDiagnosticador.safeParse({ hallazgos: [sinFiltros] }).success).toBe(false);
  });
  it("auditor / planificador / redactor / sop", () => {
    expect(SalidaAuditor.safeParse({ auditorias: [{ id: "h1", sustentado: false, es_sintoma: true, observacion: "x" }] }).success).toBe(true);
    expect(SalidaPlanificador.safeParse({ frentes: [{ prioridad: 1, semana_inicio: 1, semana_cierre: 9, accion: "a", responsable: "r", kpi: "k", evidencia: "e", impacto: "alto", finding_id: "f" }] }).success).toBe(false);
    expect(SalidaRedactor.safeParse({ titulo: "t", secciones: [{ titulo: "s", parrafos: ["p"] }] }).success).toBe(true);
    expect(SalidaSop.safeParse({ objetivo: "o", disparador: "d", responsable: "r", pasos: [{ n: 1, que: "x" }], estandar: "e", indicador: "i" }).success).toBe(true);
  });
});
