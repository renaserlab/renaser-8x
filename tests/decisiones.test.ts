/**
 * LA CORRECCIÓN DE LA CONSULTORA NO PISA LO QUE PROPUSO EL SISTEMA.
 *
 * El manual (§17) pide medir si la corrección humana produjo mejor resultado, y advierte: «no
 * asumir automáticamente que la IA o el humano tenía razón». Esa medición es imposible si al
 * modificar se sobrescribe la propuesta original — quedaría solo la versión de quien corrigió.
 *
 * Y una tarjeta de decisión sin evidencia ni alternativas no es una decisión: es una opinión con
 * botones. Por eso el sistema dice qué le falta ANTES de pedirle a nadie que apruebe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { ACCION, ACCIONES, CAMPOS_CORREGIBLES, queLeFalta } from "@/lib/decisiones";

const LIB = readFileSync(path.resolve(__dirname, "../src/lib/decisiones.ts"), "utf8");
const SQL = readFileSync(path.resolve(__dirname, "../supabase/migracion-decisiones.sql"), "utf8");
const TARJETA = readFileSync(path.resolve(__dirname, "../src/components/consultor/TarjetaDecision.tsx"), "utf8");

const completa = {
  evidencia: [{ tipo: "hallazgo", id: null, texto: "algo" }],
  alternativas: [
    { clave: "a", titulo: "A", que_implica: "x" },
    { clave: "b", titulo: "B", que_implica: "y" },
  ],
  recomendacion: "a",
  confianza: "media" as const,
};

describe("las seis acciones del manual, ni una menos", () => {
  it("están las seis", () => {
    expect([...ACCIONES].sort()).toEqual(["aprobar", "modificar", "objetar", "pedir_evidencia", "posponer", "rechazar"]);
  });

  it("cada una deja un estado distinto y explica qué significa", () => {
    const estados = ACCIONES.map((a) => ACCION[a].deja);
    expect(new Set(estados).size).toBe(ACCIONES.length);
    for (const a of ACCIONES) expect(ACCION[a].explica.length, a).toBeGreaterThan(15);
  });

  it("posponer no es rechazar: son estados distintos y se dice", () => {
    expect(ACCION.posponer.deja).not.toBe(ACCION.rechazar.deja);
    expect(ACCION.posponer.explica).toMatch(/no es un no/i);
  });
});

describe("una decisión sin con qué decidirse lo dice antes de pedir aprobación", () => {
  it("sin evidencia lo señala", () => {
    expect(queLeFalta({ ...completa, evidencia: [] }).join(" ")).toMatch(/evidencia/i);
  });

  it("con una sola alternativa lo señala: sin comparación no hay decisión", () => {
    const f = queLeFalta({ ...completa, alternativas: [completa.alternativas[0]] });
    expect(f.join(" ")).toMatch(/comparaci|alternativas/i);
  });

  it("sin recomendación lo señala: recomendar es trabajo del sistema", () => {
    expect(queLeFalta({ ...completa, recomendacion: null }).join(" ")).toMatch(/recomienda/i);
  });

  it("sin confianza declarada lo señala", () => {
    expect(queLeFalta({ ...completa, confianza: null }).join(" ")).toMatch(/confianza/i);
  });

  it("una decisión completa no arrastra pendientes", () => {
    expect(queLeFalta(completa)).toEqual([]);
  });
});

describe("el historial conserva las dos versiones", () => {
  it("la tabla guarda antes Y después, no solo el resultado final", () => {
    const t = SQL.slice(SQL.indexOf("create table if not exists decision_historial"));
    expect(t).toMatch(/antes jsonb/);
    expect(t).toMatch(/despues jsonb/);
  });

  it("el motivo es obligatorio: sin él el historial no sirve para nada después", () => {
    expect(SQL).toMatch(/motivo text not null/);
  });

  it("el resultado posterior nace nulo: nadie puede afirmar el mismo día si fue acertada", () => {
    const t = SQL.slice(SQL.indexOf("create table if not exists decision_historial"));
    expect(t).toMatch(/resultado text/);
    expect(t).not.toMatch(/resultado text not null/);
  });

  it("al decidir se guarda el estado anterior aunque no se modifique nada", () => {
    const fn = LIB.slice(LIB.indexOf("export async function decidir"));
    expect(fn).toMatch(/for \(const c of CAMPOS_CORREGIBLES\) antes\[c\]/);
  });

  it("modificar sin cambiar nada se rechaza: eso es aprobar con otro nombre", () => {
    expect(LIB).toMatch(/Para modificar hay que cambiar algo/);
  });
});

describe("lo que la consultora puede corregir está acotado", () => {
  it("solo los campos de criterio, no la evidencia ni la autoría", () => {
    expect([...CAMPOS_CORREGIBLES].sort()).toEqual(["impacto_esperado", "que_pasa_si_se_aprueba", "recomendacion", "recomendacion_por_que"]);
    expect(CAMPOS_CORREGIBLES as readonly string[], "la evidencia no se edita: se cita o no se cita").not.toContain("evidencia");
    expect(CAMPOS_CORREGIBLES as readonly string[], "quién la produjo no se reescribe").not.toContain("agente");
  });
});

describe("la tarjeta no promete lo que no sabe", () => {
  it("dice que el resultado está pendiente de observación, no que fue acertada", () => {
    expect(TARJETA).toMatch(/pendiente de observación/i);
    expect(TARJETA).toMatch(/Nadie puede afirmar hoy/i);
  });

  it("muestra las dos columnas: qué proponía el sistema y qué puso la consultora", () => {
    expect(TARJETA).toMatch(/El sistema proponía/);
    expect(TARJETA).toMatch(/Kelin puso/);
  });

  it("avisa arriba cuando la decisión no está lista, antes de ofrecer los botones", () => {
    const iFalta = TARJETA.indexOf("ESTA DECISIÓN NO ESTÁ LISTA");
    const iBotones = TARJETA.indexOf("TU DECISIÓN");
    expect(iFalta).toBeGreaterThan(-1);
    expect(iFalta, "el aviso tiene que ir antes que los botones").toBeLessThan(iBotones);
  });
});
