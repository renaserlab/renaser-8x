/**
 * EL EJE DEL GRÁFICO DE LÍNEA (17-10-2026). Con un máximo de 2.2 confirmadas por semana, el eje se partía en cuartos y
 * escribía «0, 1, 1, 2, 2»; con ocho semanas en 230 px, las fechas se montaban unas sobre otras. El eje va en números
 * redondos (como mucho cinco tramos, solo enteros) y las fechas se saltean, siempre con la más reciente escrita.
 */
import { describe, expect, it } from "vitest";
import { escalaEje, saltoEtiquetas } from "@/components/tablero/GraficoLinea";

const marcas = (maximo: number) => {
  const { paso, tope } = escalaEje(maximo, true);
  return Array.from({ length: Math.round(tope / paso) + 1 }, (_, k) => k * paso);
};

describe("el eje del gráfico de línea", () => {
  it("un conteo chico va de uno en uno y ninguna marca se repite", () => {
    expect(marcas(2.2 * 1.05)).toEqual([0, 1, 2, 3]);
  });

  it("los soles van en pasos redondos, de cero al tope, en cinco tramos o menos", () => {
    const m = marcas(41800 * 1.05);
    expect(m[0]).toBe(0);
    expect(m.at(-1)).toBeGreaterThanOrEqual(41800 * 1.05);
    expect(m.length - 1).toBeLessThanOrEqual(5);
    expect(new Set(m).size).toBe(m.length);
    for (const v of m) expect(v % 1000).toBe(0);
  });

  it("nunca hay marcas con decimales, aunque todo sea cero", () => {
    for (const max of [0, 0.4, 1, 3.15, 12.6, 999, 63000, 120000]) {
      for (const v of marcas(max)) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("las fechas se saltean cuando no caben y se escriben todas cuando caben", () => {
    const semanas = ["24 ago", "31 ago", "7 set", "14 set", "21 set", "28 set", "5 oct", "12 oct"];
    expect(saltoEtiquetas(semanas, 230)).toBeGreaterThan(1);
    expect(saltoEtiquetas(["may", "jun", "jul", "ago", "set"], 300)).toBe(1);
    expect(saltoEtiquetas(["set"], 300)).toBe(1);
  });
});
