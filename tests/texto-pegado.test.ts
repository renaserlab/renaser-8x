/**
 * UN WORD PEGADO NO ES UNA VISITA DE CAMPO.
 *
 * La fuerza de una fuente la decide su `tipo` (rules/evidencia.ts · fuerzaFuente): `observacion`
 * del consultor = strong, `documento` = medium. Hasta el 13-10-2026 el consultor pegaba un texto en
 * Subir.tsx sin decir qué era, la ruta lo guardaba como `observacion`, y el diagnóstico lo puntuaba
 * como si la consultora hubiera estado en la tienda. Las dos «fuentes fuertes» de la primera empresa cliente nacieron
 * así (clientes/8x-plan/E-evidencia-verificada.md §2-§3).
 *
 * El arreglo es doble y reversible: el servidor ya no asume nada cuando pega el consultor (E3), y la
 * pantalla del consultor manda siempre el tipo elegido (E2). El cliente sigue igual: lo que cuenta
 * de sí mismo es su observación, y vale `weak`, como siempre.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { validarTexto, TIPOS_TEXTO, PREGUNTA_TIPO_TEXTO } from "@/lib/archivos";
import { fuerzaFuente } from "@/lib/rules/evidencia";

describe("validarTexto: el servidor no adivina qué es un texto pegado", () => {
  it("el consultor sin tipo recibe la pregunta, no una observación regalada", () => {
    expect(validarTexto({ tipo: null, origen: "consultor" })).toEqual({ ok: false, error: PREGUNTA_TIPO_TEXTO });
    expect(validarTexto({ tipo: "", origen: "consultor" })).toEqual({ ok: false, error: PREGUNTA_TIPO_TEXTO });
    expect(validarTexto({ origen: "consultor" })).toEqual({ ok: false, error: PREGUNTA_TIPO_TEXTO });
  });
  it("el consultor que dice qué es, lo guarda como eso", () => {
    for (const t of TIPOS_TEXTO) expect(validarTexto({ tipo: t, origen: "consultor" })).toEqual({ ok: true, tipo: t });
  });
  it("el cliente sin tipo sigue siendo observación del cliente: nada cambia para el portal", () => {
    expect(validarTexto({ tipo: null, origen: "cliente" })).toEqual({ ok: true, tipo: "observacion" });
    expect(validarTexto({ tipo: "dato", origen: "cliente" })).toEqual({ ok: true, tipo: "dato" });
  });
  it("un tipo inventado no se convierte en silencio en otra cosa", () => {
    expect(validarTexto({ tipo: "entrevista", origen: "consultor" }).ok).toBe(false);
    expect(validarTexto({ tipo: "foto", origen: "cliente" }).ok).toBe(false);
  });
});

describe("por qué importa: la fuerza que da cada tipo", () => {
  it("documento del consultor = medium · observación del consultor = strong · observación del cliente = weak", () => {
    expect(fuerzaFuente({ source_tipo: "documento", source_origen: "consultor", participant_rol: null })).toBe("medium");
    expect(fuerzaFuente({ source_tipo: "observacion", source_origen: "consultor", participant_rol: null })).toBe("strong");
    expect(fuerzaFuente({ source_tipo: "observacion", source_origen: "cliente", participant_rol: null })).toBe("weak");
  });
});

describe("las dos pantallas usan la regla", () => {
  const SRC = path.resolve(__dirname, "../src");
  const ruta = readFileSync(path.join(SRC, "app/api/sources/route.ts"), "utf8");
  const subir = readFileSync(path.join(SRC, "components/Subir.tsx"), "utf8");
  it("la ruta decide con validarTexto y ya no tiene el `: \"observacion\"` de respaldo", () => {
    expect(ruta).toMatch(/validarTexto\(/);
    expect(ruta).not.toMatch(/\?\s*tipoPedido\s*:\s*"observacion"/);
  });
  it("Subir.tsx manda el tipo al guardar texto, y el selector solo lo ve el consultor", () => {
    const mandar = subir.slice(subir.indexOf("const mandarTexto"), subir.indexOf("const mandarAudio"));
    expect(mandar).toMatch(/if \(!paraCliente\) form\.set\("tipo", tipoTexto\)/);
    expect(subir).toMatch(/\{!paraCliente && \([\s\S]*?Qué es este texto/);
  });
});
