import { describe, it, expect } from "vitest";
import { SalidaMinero } from "@/lib/schemas";
import { PROMPT_MINERO } from "@/lib/ai/agents/minero";
import { PROMPT_ENTREVISTADOR } from "@/lib/ai/agents/entrevistador";
import { PROMPT_DIAGNOSTICADOR, PROMPT_AUDITOR } from "@/lib/ai/agents/diagnosticador";
import { PROMPT_TOBE } from "@/lib/ai/agents/arquitecto";
import { PROMPT_CONTRASTADOR } from "@/lib/ai/agents/contrastador";
import { PROMPT_EXTRACTOR } from "@/lib/ai/agents/extractor";

describe("know-how: modelo y preguntas del minero", () => {
  it("una unidad incompleta se registra con lo dicho y marca lo que falta", () => {
    const r = SalidaMinero.parse({
      unidades: [{ situacion: "Compra de palta", senal: "Cuando tiene esta pequeña textura, en dos días está perfecta", decision: null, excepcion: null, estandar: null, error_frecuente: "El nuevo compra por color", regla_practica: null, escalamiento: null, destino: "criterio_calidad", falta_profundizar: "¿Qué textura exactamente?" }],
      riesgo_know_how_vacio: false,
    });
    expect(r.unidades[0].senal).toMatch(/textura/);
    expect(r.unidades[0].falta_profundizar).toBeTruthy();
    expect(["sop", "entrenamiento", "checklist", "criterio_calidad", "agente", "pendiente"]).toContain(r.unidades[0].destino);
  });
  it("el prompt del minero contiene la regla del puesto con know-how vacío y la de no inventar", () => {
    expect(PROMPT_MINERO).toMatch(/know-how\s+vacio/i);
    expect(PROMPT_MINERO).toMatch(/No completes/);
    expect(PROMPT_MINERO).toMatch(/opiniones sobre personas/);
  });
  it("las preguntas del minero (7.5) están en el banco del entrevistador para sesiones know_how", () => {
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const q of ["alguien nuevo tardaria meses en aprender", "antes que los demas cuando algo va a salir mal", "caso complicado", "nunca quedo escrita", "que se perderia contigo", "error comete siempre un principiante", "queda grande y hay que avisar"]) expect(norm(PROMPT_ENTREVISTADOR)).toContain(norm(q));
  });
});

describe("sesgos en los prompts (auditoría 4)", () => {
  const todos = [PROMPT_ENTREVISTADOR, PROMPT_DIAGNOSTICADOR, PROMPT_AUDITOR, PROMPT_TOBE, PROMPT_CONTRASTADOR, PROMPT_EXTRACTOR].join("\n");
  it("ningún prompt afirma que el cuello de botella está en el dueño", () => {
    expect(todos).not.toMatch(/cuello de botella (esta|está) en el due/i);
    expect(todos).not.toMatch(/el due[ñn]o es (el|la) (cuello|restricci)/i);
  });
  it("ningún prompt dice 'el problema nunca es la persona'", () => {
    expect(todos).not.toMatch(/nunca es la persona/i);
  });
  it("el diagnosticador exige auditar sistema, puesto y relación antes de culpar a una persona", () => {
    expect(PROMPT_DIAGNOSTICADOR).toMatch(/Nunca culpes a una persona antes de auditar/);
  });
  it("el diagnosticador usa los lentes para preguntar y solo afirma con evidencia interna (no está bloqueado con 'no uses conocimiento general')", () => {
    expect(PROMPT_DIAGNOSTICADOR).toMatch(/LENTES/);
    expect(PROMPT_DIAGNOSTICADOR).toMatch(/Hormozi/);
    expect(PROMPT_DIAGNOSTICADOR).toMatch(/solo puedes AFIRMAR con las\s+afirmaciones recibidas/);
    expect(PROMPT_DIAGNOSTICADOR).not.toMatch(/no uses conocimiento general/i);
  });
  it("el contrastador: ante la duda, false; aspiracional no contradice", () => {
    expect(PROMPT_CONTRASTADOR).toMatch(/Ante la duda, devuelve false/);
    expect(PROMPT_CONTRASTADOR).toMatch(/aspiracional no contradice/);
  });
  it("el extractor nunca estima fechas", () => {
    expect(PROMPT_EXTRACTOR).toMatch(/NUNCA la estimes/);
  });
  it("el entrevistador nunca pide juicios sobre personas y prohíbe jerga", () => {
    expect(PROMPT_ENTREVISTADOR).toMatch(/NUNCA le pidas juicios sobre otras personas/);
    expect(PROMPT_ENTREVISTADOR).toMatch(/Nunca digas\s+"KPI"/);
  });
});
