import { describe, it, expect } from "vitest";
import { estudioOrganigrama, nivelesDelArbol, tieneCiclo, type Puesto } from "@/lib/rules/organigrama";

const p = (id: string, nombre: string, extra: Partial<Puesto> = {}): Puesto => ({
  id, nombre, mision: "entrega X", decide: "resuelve Y", persona: `Persona ${id}`, respaldo: "Alguien", reporta_a: null, ...extra,
});

describe("el estudio del organigrama: reglas con nombre, no opinión", () => {
  it("una estructura sana cumple las 7 reglas", () => {
    const puestos = [p("g", "Gerencia"), p("e1", "Encargado 1", { reporta_a: "g" }), p("v1", "Ventanillero", { reporta_a: "e1" })];
    expect(estudioOrganigrama(puestos).every((r) => r.cumple)).toBe(true);
  });
  it("dos cabezas en una pyme son cero cabezas", () => {
    const r = estudioOrganigrama([p("a", "Gerencia"), p("b", "Dirección")]).find((x) => x.clave === "cima_unica")!;
    expect(r.cumple).toBe(false);
    expect(r.detalle).toContain("Dirección");
  });
  it("un ciclo de reporte no es una estructura", () => {
    const puestos = [p("a", "A", { reporta_a: "b" }), p("b", "B", { reporta_a: "a" })];
    expect(tieneCiclo(puestos)).toBe(true);
    expect(estudioOrganigrama(puestos).find((x) => x.clave === "cima_unica")!.cumple).toBe(false);
  });
  it("nadie dirige a más de 6", () => {
    const puestos = [p("g", "Gerencia"), ...Array.from({ length: 7 }, (_, i) => p(`v${i}`, `Puesto ${i}`, { reporta_a: "g" }))];
    const r = estudioOrganigrama(puestos).find((x) => x.clave === "tramo_de_control")!;
    expect(r.cumple).toBe(false);
    expect(r.detalle).toContain("7 reportes");
  });
  it("más de 3 niveles es burocracia para una pyme", () => {
    const puestos = [p("a", "N1"), p("b", "N2", { reporta_a: "a" }), p("c", "N3", { reporta_a: "b" }), p("d", "N4", { reporta_a: "c" })];
    expect(nivelesDelArbol(puestos).length).toBe(4);
    expect(estudioOrganigrama(puestos).find((x) => x.clave === "niveles")!.cumple).toBe(false);
  });
  it("un puesto sin decisión es un mensajero caro, y sin respaldo es un punto único de falla", () => {
    const puestos = [p("g", "Gerencia", { decide: "", respaldo: "" })];
    const reglas = estudioOrganigrama(puestos);
    expect(reglas.find((x) => x.clave === "mision_y_decision")!.cumple).toBe(false);
    expect(reglas.find((x) => x.clave === "respaldo")!.detalle).toContain("Gerencia");
  });
  it("tres sombreros en la misma cabeza es el cuello de botella", () => {
    const puestos = [p("g", "Gerencia", { persona: "Rosa" }), p("t", "Tesorería", { persona: "rosa ", reporta_a: "g" }), p("c", "Comercial", { persona: "Rosa", reporta_a: "g" })];
    const r = estudioOrganigrama(puestos).find((x) => x.clave === "sobrecarga")!;
    expect(r.cumple).toBe(false);
    expect(r.detalle).toContain("3 puestos");
  });
  it("los huérfanos no desaparecen del árbol: se ven al final", () => {
    const puestos = [p("g", "Gerencia"), p("x", "Suelto", { reporta_a: "no-existe" })];
    const niveles = nivelesDelArbol(puestos);
    expect(niveles.flat().map((n) => n.id)).toContain("x");
  });
});
