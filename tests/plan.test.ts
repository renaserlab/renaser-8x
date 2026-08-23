import { describe, it, expect } from "vitest";
import { programarFrentes, respetaTope, abiertosPorSemana, primerasSemanasSoloCriticos, MAX_ABIERTOS } from "@/lib/rules/plan";

const f = (p: number, s: number, c: number, id = `f${p}`) => ({ prioridad: p, semana_inicio: s, semana_cierre: c, finding_id: id, impacto: "alto" });

describe("plan 45 días: máximo 3 frentes abiertos por semana", () => {
  it("si el modelo propone 5 frentes en la semana 1, el código corre los sobrantes", () => {
    const out = programarFrentes([f(1, 1, 2), f(2, 1, 2), f(3, 1, 2), f(4, 1, 2), f(5, 1, 2)]);
    expect(respetaTope(out)).toBe(true);
    expect(abiertosPorSemana(out)[0]).toBe(MAX_ABIERTOS);
    expect(out.find((x) => x.prioridad === 4)!.semana_inicio).toBe(3);
  });
  it("la duración se conserva al correr un frente", () => {
    const out = programarFrentes([f(1, 1, 3), f(2, 1, 3), f(3, 1, 3), f(4, 1, 3)]);
    const cuarto = out.find((x) => x.prioridad === 4)!;
    expect(cuarto.semana_cierre - cuarto.semana_inicio).toBe(2);
  });
  it("ningún frente se sale de las 7 semanas", () => {
    const out = programarFrentes(Array.from({ length: 12 }, (_, i) => f(i + 1, 1, 7, `f${i}`)));
    expect(out.every((x) => x.semana_cierre <= 7 && x.semana_inicio >= 1)).toBe(true);
  });
  it("frentes sin hallazgo válido se descartan (ninguno huérfano)", () => {
    const out = programarFrentes([f(1, 1, 1, "ok"), f(2, 1, 1, "huerfano")], new Set(["ok"]));
    expect(out.map((x) => x.finding_id)).toEqual(["ok"]);
  });
  it("primeras dos semanas solo críticos", () => {
    expect(primerasSemanasSoloCriticos([{ semana_inicio: 1, impacto: "alto" }, { semana_inicio: 3, impacto: "bajo" }])).toBe(true);
    expect(primerasSemanasSoloCriticos([{ semana_inicio: 2, impacto: "medio" }])).toBe(false);
  });
});
