import { describe, it, expect } from "vitest";
import { candidatasAContradiccion, brechasEstrategicas, clavePar, type ClaimC } from "@/lib/rules/contradiccion";

const c = (o: Partial<ClaimC> & { id: string }): ClaimC => ({ texto: "", tipo: "meta", temporalidad: "actual", estado: "sin_verificar", source_id: "s1", participant_id: null, contradice_a: null, ...o });

describe("candidatas a contradicción (reglas mecánicas, sin IA)", () => {
  it("mismo tipo, ambas actuales, distinta fuente → candidata", () => {
    const pares = candidatasAContradiccion([c({ id: "a", source_id: "doc" }), c({ id: "b", source_id: "entrevista" })]);
    expect(pares).toHaveLength(1);
  });
  it("misma fuente y mismo autor → no es candidata", () => {
    expect(candidatasAContradiccion([c({ id: "a" }), c({ id: "b" })])).toHaveLength(0);
  });
  it("misma fuente pero distinto participante → candidata (dueño vs empleado en la misma entrevista-fuente)", () => {
    expect(candidatasAContradiccion([c({ id: "a", participant_id: "p1" }), c({ id: "b", participant_id: "p2" })])).toHaveLength(1);
  });
  it("aspiracional no contradice a actual: no es candidata", () => {
    expect(candidatasAContradiccion([c({ id: "a", source_id: "doc" }), c({ id: "b", source_id: "otra", temporalidad: "aspiracional" })])).toHaveLength(0);
  });
  it("distinto tipo → no se comparan; tipo 'otro' nunca se compara", () => {
    expect(candidatasAContradiccion([c({ id: "a", source_id: "doc", tipo: "precio" }), c({ id: "b", source_id: "otra", tipo: "meta" })])).toHaveLength(0);
    expect(candidatasAContradiccion([c({ id: "a", source_id: "doc", tipo: "otro" }), c({ id: "b", source_id: "otra", tipo: "otro" })])).toHaveLength(0);
  });
  it("pares ya juzgados no se repiten (no se vuelve a pedir lo mismo al modelo)", () => {
    const ya = new Set([clavePar("b", "a")]);
    expect(candidatasAContradiccion([c({ id: "a", source_id: "doc" }), c({ id: "b", source_id: "otra" })], ya)).toHaveLength(0);
  });
  it("pares ya resueltos (contradice_a) no se repiten", () => {
    expect(candidatasAContradiccion([c({ id: "a", source_id: "doc", contradice_a: "b" }), c({ id: "b", source_id: "otra" })])).toHaveLength(0);
  });
  it("tope de 60 pares por corrida (control de costo)", () => {
    const muchos = Array.from({ length: 20 }, (_, i) => c({ id: `x${i}`, source_id: `s${i}` }));
    expect(candidatasAContradiccion(muchos).length).toBe(60);
  });
  it("brecha estratégica: aspiracional sin ninguna actual del mismo tipo", () => {
    const b = brechasEstrategicas([c({ id: "a", tipo: "vision", temporalidad: "aspiracional" }), c({ id: "b", tipo: "meta", temporalidad: "aspiracional" }), c({ id: "c", tipo: "meta", temporalidad: "actual" })]);
    expect(b.map((x) => x.id)).toEqual(["a"]);
  });
});
