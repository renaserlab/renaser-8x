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
