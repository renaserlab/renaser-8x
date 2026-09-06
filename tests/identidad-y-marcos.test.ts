/**
 * EL MANUAL DE IDENTIDAD Y LOS DOS MARCOS QUE FALTABAN (06-09-2026).
 *
 * Competing Values para la cultura y la Cadena de Valor de Porter. Con estos, los cinco marcos que
 * usa la consultoría seria están anclados: APQC PCF, SIPOC, CMMI, cultura y cadena.
 *
 * Lo que estas pruebas cuidan es lo mismo de siempre: que ninguno de los dos se convierta en una
 * caja que le pone etiquetas a una empresa por su rubro, y que el cliente no escuche jamás la jerga.
 */
import { describe, it, expect } from "vitest";
import { CULTURAS, leerCultura, culturaComoTexto } from "@/lib/rules/cultura";
import { ESLABONES, APOYOS, traspasosDe, primerCorte, cadenaComoTexto, esPrimario } from "@/lib/rules/cadena-valor";
import { CATEGORIAS } from "@/lib/pcf";
import { BLOQUES_ACTIVOS } from "@/lib/activos";
import { PROMPT_CONSTRUCTOR } from "@/lib/jobs/handlers/activos";
import * as textos from "@/lib/textos";

describe("el marco de cultura describe, no etiqueta", () => {
  it("están los cuatro tipos del marco", () => {
    expect(CULTURAS).toHaveLength(4);
    expect(CULTURAS.map((c) => c.academico).sort()).toEqual(["Adhocracia", "Clan", "Jerarquía", "Mercado"]);
  });

  it("ninguno se presenta como el bueno: cada uno trae su fuerza Y su riesgo", () => {
    for (const c of CULTURAS) {
      expect(c.fuerza.length, `${c.nombre} sin fuerza`).toBeGreaterThan(10);
      expect(c.riesgo.length, `${c.nombre} sin riesgo`).toBeGreaterThan(10);
    }
  });

  it("sin historias no afirma nada: todo queda por preguntar", () => {
    const l = leerCultura(["", null, undefined]);
    expect(l.presentes).toHaveLength(0);
    expect(l.porPreguntar).toHaveLength(4);
  });

  it("no deduce del rubro: una pollería no «es de familia» porque suele serlo", () => {
    const l = leerCultura(["Somos una pollería a la brasa en Los Olivos con tres mesas"]);
    expect(l.presentes).toHaveLength(0);
  });

  it("pero sí reconoce lo que la empresa contó", () => {
    const l = leerCultura(["Aquí nos apoyamos, varios tienen años conmigo", "Al que más vende le damos un bono"]);
    const claves = l.presentes.map((c) => c.clave);
    expect(claves).toContain("familia");
    expect(claves).toContain("competidora");
    expect(claves).not.toContain("ordenada");
  });

  it("una empresa puede ser de varios tipos a la vez: es lo normal", () => {
    const l = leerCultura(["Tenemos protocolos para todo y también probamos cosas nuevas cada mes"]);
    expect(l.presentes.length).toBeGreaterThanOrEqual(2);
  });

  it("«metalmecánica» no activa la cultura de metas", () => {
    const l = leerCultura(["Es un taller de metalmecánica"]);
    expect(l.presentes.map((c) => c.clave)).not.toContain("competidora");
  });
});

describe("la cadena de valor se monta sobre el mapa que ya existe, no lo duplica", () => {
  it("cada eslabón es una categoría real del mapa de 13", () => {
    const claves = new Set(CATEGORIAS.map((c) => c.clave));
    for (const e of ESLABONES) expect(claves.has(e.clave), `${e.clave} no está en el mapa`).toBe(true);
  });

  it("los apoyos son exactamente las categorías de soporte", () => {
    expect(APOYOS.map((a) => a.clave).sort()).toEqual(CATEGORIAS.filter((c) => c.familia === "soporte").map((c) => c.clave).sort());
  });

  it("ninguna categoría es primaria y de apoyo a la vez", () => {
    for (const a of APOYOS) expect(esPrimario(a.clave), `${a.clave} está en los dos lados`).toBe(false);
  });

  it("los traspasos solo se señalan entre partes que esta empresa TIENE", () => {
    const t = traspasosDe(["venta", "postventa"]);
    expect(t).toHaveLength(1);
    expect(t[0].de.clave).toBe("venta");
    expect(t[0].a.clave).toBe("postventa");
  });

  it("producto y servicio conviven: no se traspasan entre sí", () => {
    const t = traspasosDe(["entrega_producto", "entrega_servicio"]);
    expect(t).toHaveLength(0);
  });

  it("sin nada mapeado no inventa traspasos", () => {
    expect(traspasosDe([])).toHaveLength(0);
  });

  it("el corte es el primer eslabón del que no se contó nada", () => {
    expect(primerCorte(["venta", "entrega_producto", "postventa"])?.clave).toBe("oferta");
    expect(primerCorte(["oferta", "venta", "entrega_servicio", "postventa"])).toBeNull();
  });

  it("basta con tener producto O servicio para no cortar ahí", () => {
    expect(primerCorte(["oferta", "venta", "entrega_servicio"])?.clave).toBe("postventa");
  });
});

describe("el Manual de Identidad es UN documento compuesto, no dos pegados", () => {
  const identidad = BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => ({ ...a, completa: `${b.clave}.${a.clave}` }))).find((a) => a.completa === "personas.identidad");

  it("existe como activo", () => {
    expect(identidad).toBeDefined();
    expect(identidad!.nombre).toBe("Manual de Identidad");
  });

  it("compone lo que el dueño ya contó, en vez de volver a preguntárselo", () => {
    expect(identidad!.componer).toEqual(["personas.mvv", "personas.cultura"]);
  });

  it("todo lo que compone existe de verdad", () => {
    const todas = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));
    for (const b of BLOQUES_ACTIVOS)
      for (const a of b.activos)
        for (const c of a.componer ?? []) expect(todas.has(c), `${b.clave}.${a.clave} compone "${c}", que no existe`).toBe(true);
  });

  it("ninguno se compone a sí mismo", () => {
    for (const b of BLOQUES_ACTIVOS)
      for (const a of b.activos) expect(a.componer ?? []).not.toContain(`${b.clave}.${a.clave}`);
  });

  it("el redactor sabe que debe fundirlo, no concatenarlo", () => {
    expect(PROMPT_CONSTRUCTOR).toMatch(/UN\s*\nsolo documento que se lea corrido|fundirlo en UN/);
    expect(PROMPT_CONSTRUCTOR).toMatch(/no vuelvas a preguntar lo que ya esta ahi/i);
  });

  it("exige la historia detrás de cada valor: nada de póster", () => {
    expect(identidad!.estructura).toMatch(/historia real/i);
  });
});

describe("el cliente nunca escucha la jerga de los marcos", () => {
  const JERGA = ["Competing Values", "Cameron", "Quinn", "Porter", "cadena de valor", "adhocracia", "clan", "jerarquía"];

  it("no aparece en el copy de la interfaz", () => {
    const todo = JSON.stringify(textos).toLowerCase();
    for (const j of JERGA) expect(todo, `«${j}» se le está mostrando al cliente`).not.toContain(j.toLowerCase());
  });

  it("no aparece en lo que el dueño lee de los activos", () => {
    const visible = BLOQUES_ACTIVOS.flatMap((b) => b.activos.flatMap((a) => [a.nombre, a.ayuda, ...a.preguntas, a.estructura ?? ""])).join(" ").toLowerCase();
    for (const j of JERGA) expect(visible, `«${j}» se le está mostrando al cliente`).not.toContain(j.toLowerCase());
  });

  it("los marcos sí guardan su nombre académico adentro, para trazabilidad", () => {
    expect(culturaComoTexto()).toContain("Adhocracia");
    expect(cadenaComoTexto()).toMatch(/CADENA DE VALOR/);
  });
});
