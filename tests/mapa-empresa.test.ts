/**
 * LA RADIOGRAFÍA NO MIENTE NI CONFUNDE.
 *
 * Dos reglas que esta pantalla no puede romper, porque es la que le enseñamos al dueño:
 *   1. El nivel de la empresa cuenta lo que le FALTA, no solo lo que hizo. Contar únicamente lo
 *      hecho da un número bonito y falso — y es exactamente lo que hace una consultora que quiere
 *      cobrar sin cambiar nada.
 *   2. Ningún nivel se regala. Cada uno se gana con algo comprobable en la base, y la pantalla
 *      siempre puede decir CON QUÉ se ganó y QUÉ FALTA para el siguiente.
 */
import { describe, it, expect } from "vitest";
import { madurezProceso, madurezEmpresa, NIVELES } from "@/lib/madurez";

const contado = { nodos: 5 };
const ordenado = { nodos: 5, responsable: "Cajera", tiempo: "10 min", inicio: "El cliente llega", resultado: "Operación registrada", proveedor: "El cliente", cliente_proceso: "Contabilidad" };
const escrito = { ...ordenado, documentado: true };
const medido = { ...escrito, indicador: "Descuadres por semana", medicionesReales: 3 };
const mejorando = { ...medido, mejoro: true };

describe("los dos números de la empresa dicen cosas distintas y ninguna engaña", () => {
  it("una empresa con un proceso perfecto y muchos sin mapear NO está arriba", () => {
    const e = madurezEmpresa([madurezProceso(mejorando)], 20);
    expect(e.nivel).toBeLessThan(1);
    expect(e.nivelMapeados, "lo que sí mapeó está perfecto, y eso también es verdad").toBe(5);
  });

  it("los dos números coinciden cuando está todo mapeado", () => {
    const evs = Array.from({ length: 4 }, () => madurezProceso(escrito));
    const e = madurezEmpresa(evs, 4);
    expect(e.nivel).toBe(e.nivelMapeados);
  });

  it("sin nada mapeado, el promedio de lo mapeado es 0 y no una división por cero", () => {
    const e = madurezEmpresa([], 12);
    expect(e.nivelMapeados).toBe(0);
    expect(Number.isFinite(e.nivel)).toBe(true);
  });

  it("nunca se inventan procesos esperados: el mínimo es lo que ya existe", () => {
    const e = madurezEmpresa([madurezProceso(contado), madurezProceso(contado)], 0);
    expect(e.esperados).toBe(2);
  });
});

describe("cada nivel se gana con algo comprobable", () => {
  it.each([
    ["dibujado", contado, 1],
    ["con dueño y tiempos", ordenado, 2],
    ["escrito paso a paso", escrito, 3],
    ["con su número anotado", medido, 4],
    ["y el número mejoró", mejorando, 5],
  ])("%s → nivel %i", (_caso, entrada, esperado) => {
    expect(madurezProceso(entrada).nivel).toBe(esperado);
  });

  it("una meta escrita sin anotar el número NO llega a medido", () => {
    const e = madurezProceso({ ...escrito, indicador: "Descuadres por semana", medicionesReales: 0 });
    expect(e.nivel).toBe(3);
    expect(e.siguiente).toMatch(/anotarlo/i);
  });

  it("un solo dato anotado tampoco: con uno no se compara nada", () => {
    expect(madurezProceso({ ...escrito, indicador: "Descuadres", medicionesReales: 1 }).nivel).toBe(3);
  });

  it("si el número empeoró, lo dice en vez de esconderlo", () => {
    const e = madurezProceso({ ...medido, mejoro: false });
    expect(e.nivel).toBe(4);
    expect(e.siguiente).toMatch(/empeor/i);
  });

  it("todo nivel por debajo del máximo dice qué falta para el siguiente", () => {
    for (const entrada of [contado, ordenado, escrito, medido]) expect(madurezProceso(entrada).siguiente).toBeTruthy();
    expect(madurezProceso(mejorando).siguiente).toBeNull();
  });

  it("y todo nivel alcanzado dice con qué se ganó", () => {
    expect(madurezProceso(medido).porque.length).toBeGreaterThan(2);
  });
});

describe("el texto de los niveles no promete lo que el sistema no comprueba", () => {
  it("no se dice «aprobado» en ningún nivel: los SOP no tienen aprobación todavía", () => {
    const todo = NIVELES.map((n) => `${n.nombre} ${n.queSignifica}`).join(" ").toLowerCase();
    expect(todo, "prometer una aprobación que no existe es la clase de mentira que este producto no comete").not.toMatch(/aprobad/);
  });
});
