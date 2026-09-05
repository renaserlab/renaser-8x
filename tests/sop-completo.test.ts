/**
 * NADA DE LO QUE LA IA REDACTA SE TIRA EN SILENCIO.
 *
 * El SOP se rompió así una vez: el prompt pedía "materiales" (lo que hay que tener a mano antes de
 * empezar), el esquema lo validaba y la pantalla ya lo mostraba… pero el INSERT no lo guardaba y la
 * columna no existía. El agente lo escribía en cada SOP y se perdía, sin error y sin aviso.
 *
 * Esta prueba cierra esa clase de fallo: todo campo que el esquema produzca tiene que guardarse.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SalidaSop } from "@/lib/schemas";

const handler = readFileSync(path.resolve(__dirname, "../src/lib/jobs/handlers/procesos.ts"), "utf8");
const insertSop = handler.slice(handler.indexOf('from("sops").insert('));
const pantalla = readFileSync(path.resolve(__dirname, "../src/components/Entregable.tsx"), "utf8");

describe("el SOP se guarda entero", () => {
  const campos = Object.keys(SalidaSop.shape);

  it("el esquema no está vacío (si esto falla, la prueba no está mirando nada)", () => {
    expect(campos.length).toBeGreaterThan(5);
  });

  it.each(campos)("«%s» se guarda en la tabla sops", (campo) => {
    expect(insertSop, `El agente redacta "${campo}" y el INSERT lo tira.`).toContain(`${campo}: r.data.${campo}`);
  });

  it.each(campos)("«%s» se muestra en el documento impreso", (campo) => {
    expect(pantalla, `Se guarda "${campo}" pero nadie lo ve nunca.`).toContain(`sop.${campo}`);
  });
});
