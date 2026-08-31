import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { confirmacionValida, normalizarParaConfirmar } from "@/lib/confirmacion";

/**
 * El 30-08-2026 Kelin no podía eliminar sus empresas de prueba: la confirmación exigía el nombre
 * EXACTO y varias se llamaban "PRUEBA A · Estudio Jurídico Lex", con un punto medio que no está en
 * el teclado español. El botón no se habilitaba nunca.
 */
describe("confirmar escribiendo el nombre, sin volverlo imposible", () => {
  it("acepta el nombre sin el caracter que no está en el teclado", () => {
    expect(confirmacionValida("PRUEBA A Estudio Juridico Lex", "PRUEBA A · Estudio Jurídico Lex")).toBe(true);
  });

  it("perdona tildes y mayúsculas", () => {
    expect(confirmacionValida("cafe warmi", "Café Warmi")).toBe(true);
    expect(confirmacionValida("JARDIN RENASER", "Jardín Renaser")).toBe(true);
  });

  it("perdona espacios de más y de los bordes", () => {
    expect(confirmacionValida("  Jardín   Renaser  ", "Jardín Renaser")).toBe(true);
  });

  it("sigue exigiendo saber el nombre: otro nombre no pasa", () => {
    expect(confirmacionValida("Qori Home", "Jardín Renaser")).toBe(false);
    expect(confirmacionValida("", "Jardín Renaser")).toBe(false);
    expect(confirmacionValida("Jardin", "Jardín Renaser")).toBe(false);
  });

  it("no confunde dos empresas parecidas", () => {
    expect(confirmacionValida("Renaser eventos", "Mundo Z de Renaser eventos")).toBe(false);
    expect(confirmacionValida("PRUEBA A Estudio Juridico Lex", "PRUEBA B · Transportes Andino")).toBe(false);
  });

  it("un nombre que al normalizar queda vacío no se confirma con una cadena vacía", () => {
    expect(normalizarParaConfirmar("···")).toBe("");
    expect(confirmacionValida("", "···")).toBe(false);
  });

  it("ELIMINAR funciona escrito en minúscula: la palabra es la salvaguarda, no el bloqueo de mayúsculas", () => {
    expect(confirmacionValida("eliminar", "ELIMINAR")).toBe(true);
    expect(confirmacionValida("elimina", "ELIMINAR")).toBe(false);
  });
});

describe("la limpieza en lote no borra a ciegas", () => {
  const ruta = readFileSync(path.join(process.cwd(), "src/app/api/companies/eliminar-lote/route.ts"), "utf8");
  const tabla = readFileSync(path.join(process.cwd(), "src/components/consultor/LimpiarEmpresas.tsx"), "utf8");

  it("solo la consultora puede borrar en lote", () => {
    expect(ruta).toContain("consultor: true");
  });

  it("hay tope: un error no puede vaciar la base entera de un golpe", () => {
    expect(ruta).toMatch(/max\(30\)/);
  });

  it("borra también los archivos del bucket: el cascade de SQL no los toca y seguirían pagándose", () => {
    expect(ruta).toContain("archivos_de_empresa");
    expect(ruta).toContain('storage.from("fuentes").remove');
  });

  it("deja rastro de lo que se borró y cuánto contenía", () => {
    expect(ruta).toContain('accion: "eliminar"');
    expect(ruta).toMatch(/detalle: \{ nombre/);
  });

  it("si una falla sigue con las demás y dice cuál falló", () => {
    expect(ruta).toContain("fallidas");
    expect(tabla).toContain("r.fallidas");
  });

  it("nada viene marcado de antemano: el sistema no decide qué es prueba", () => {
    expect(tabla).toContain("useState<Set<string>>(new Set())");
  });

  it("avisa cuando lo marcado tiene trabajo real o gente con acceso", () => {
    expect(tabla).toContain("conTrabajo");
    expect(tabla).toContain("conPersonas");
    expect(tabla).toContain("se quedará sin empresa");
  });
});

/**
 * BORRAR UNA EMPRESA TRABAJADA. Kelin no pudo eliminar Jardín Renaser: «violates foreign key
 * constraint interview_responses_origen_claim_id_fkey». Al borrar la empresa sus definiciones se van
 * en cascada, pero otras filas apuntan a ellas SIN acción de borrado. No es una sola: hay diez
 * referencias así, y cuál salta depende del orden en que Postgres decida cascadear — o sea, del azar
 * y de qué datos tenga esa empresa. Por eso a veces se podía borrar y a veces no.
 */
describe("una empresa con trabajo dentro se puede borrar igual", () => {
  const src = readFileSync(path.join(process.cwd(), "src/lib/borrar-empresa.ts"), "utf8");

  it("suelta el enlace exacto que bloqueó a Kelin", () => {
    expect(src, "la respuesta de entrevista nacida de una definición").toContain("origen_claim_id: null");
  });

  it("suelta también las otras referencias sin cascada del esquema", () => {
    for (const [campo, porque] of [
      ["contradice_a: null", "una definición que contradice a otra"],
      ["finding_id: null", "acciones y correcciones sobre un hallazgo"],
      ["source_id: null", "el documento que apunta a su fuente"],
      ["padre_id: null", "el proceso TO-BE que apunta a su AS-IS"],
    ])
      expect(src, `falta soltar ${porque}`).toContain(campo);
  });

  it("borra los hijos en orden en vez de confiar en el orden de la cascada", () => {
    const orden = ["interview_responses", "interview_sessions", "findings", "claims", "sources", "participants"];
    const posiciones = orden.map((t) => src.indexOf(`from("${t}").delete()`));
    expect(posiciones.every((p) => p > -1), `faltan borrados: ${orden.filter((t, i) => posiciones[i] === -1).join(", ")}`).toBe(true);
    // De la hoja a la raíz: las respuestas antes que las sesiones, las definiciones antes que las fuentes.
    expect(posiciones[0]).toBeLessThan(posiciones[1]!);
    expect(posiciones[3]).toBeLessThan(posiciones[4]!);
  });

  it("se usa en las DOS rutas de borrado, no solo en una", () => {
    for (const r of ["src/app/api/companies/[id]/route.ts", "src/app/api/companies/eliminar-lote/route.ts"]) {
      const ruta = readFileSync(path.join(process.cwd(), r), "utf8");
      expect(ruta, `${r} borra sin sanear y volvería a fallar`).toContain("prepararBorradoEmpresa");
    }
  });

  it("va en lotes: una empresa trabajada tiene cientos de filas", () => {
    expect(src).toMatch(/i \+= 200/);
  });
});
