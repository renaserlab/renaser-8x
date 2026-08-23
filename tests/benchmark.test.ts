/** Fase 12: el benchmark congelado mide el resultado simulado de la EMPRESA DEMO y rechaza un set inventado. */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { medir, aprueba, type Esperado } from "@/lib/benchmark";
import { DIAGNOSTICO_SIMULADO, JUICIOS_CONTRASTE } from "./fixtures/empresa-demo";

const esperado = JSON.parse(readFileSync(path.resolve(__dirname, "../benchmark/esperado.json"), "utf8")) as Esperado;

const obtenidosSimulados = [
  ...Object.entries(DIAGNOSTICO_SIMULADO).flatMap(([pilar, d]) => d.hallazgos.map((h) => ({ titulo: h.titulo, causa_raiz: h.causa_raiz, pilar, patron: h.patron, impacto: h.impacto, preserva: false }))),
  // lo que el diagnosticador real debería añadir con el sueño del dueño y el know-how de Rosa:
  { titulo: "La empresa del plan 2022 exige provincias y 70 horas; el dueño quiere Lima y 30 horas", causa_raiz: "La dirección documentada no se actualizó tras el cambio de vida deseada", pilar: "personas", patron: "sueno_vs_empresa", impacto: "medio", preserva: false },
  { titulo: "Fortaleza: el criterio de textura de Rosa mantiene la calidad de la palta", causa_raiz: "Know-how de 14 años no escrito", pilar: "producto", patron: "know_how_en_una_persona", impacto: "alto", preserva: true },
].filter((h) => !/incompetente|40%/.test(h.titulo)); // el AUDITOR (bajo + requiere_validacion) y los filtros (bloqueada) los dejan fuera de lo visible

const contradicciones = Object.entries(JUICIOS_CONTRASTE).filter(([, j]) => j.se_contradicen).map(([k]) => ({ a: k.split("|")[0], b: k.split("|")[1] }));
const preguntas = Object.values(JUICIOS_CONTRASTE).map((j) => j.pregunta_sugerida ?? "");

describe("benchmark congelado", () => {
  it("el resultado simulado de la EMPRESA DEMO aprueba: cobertura, precisión, 0 falsos positivos, fortaleza, contradicciones", () => {
    const m = medir(esperado, obtenidosSimulados, contradicciones, preguntas);
    const a = aprueba(m);
    expect(a.ok, a.motivos.join("; ")).toBe(true);
    expect(m.cobertura).toBe(1);
    expect(m.falsos_positivos).toBe(0);
    expect(m.preservacion).toBe(1);
    expect(m.contradicciones).toBe(1);
    expect(m.preguntas).toBe(1);
  });
  it("un resultado que culpa a la persona o sube el precio 40% se detecta como falso positivo y NO aprueba", () => {
    const malo = [...obtenidosSimulados, { titulo: "El jefe de ventas es incompetente", causa_raiz: "", pilar: "personas", impacto: "alto" }];
    const m = medir(esperado, malo, contradicciones, preguntas);
    expect(m.falsos_positivos).toBe(1);
    expect(aprueba(m).ok).toBe(false);
  });
  it("un resultado que omite el canal único o no reconoce la fortaleza NO aprueba", () => {
    const sinCanal = obtenidosSimulados.filter((h) => h.patron !== "canal_unico");
    expect(aprueba(medir(esperado, sinCanal, contradicciones, preguntas)).motivos.join()).toMatch(/canal_unico/);
    const sinFort = obtenidosSimulados.map((h) => ({ ...h, preserva: false }));
    expect(aprueba(medir(esperado, sinFort, contradicciones, preguntas)).motivos.join()).toMatch(/fortalezas/);
  });
  it("el set esperado está versionado", () => {
    expect((esperado as unknown as { version: string }).version).toBe("1.0.0");
  });
});
