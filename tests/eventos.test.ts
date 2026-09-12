/**
 * LOS EVENTOS DEL DÍA — las reglas que no se pueden romper.
 *
 * Dos son de honestidad y una de arquitectura:
 *
 *   · Lo que nadie anotó NO aparece como cero. Un tablero lleno de ceros hace creer que se midió
 *     algo que nadie registró, y esa es la mentira más fácil de contar con un dashboard.
 *   · Un evento alimenta los números que YA existen. Las facturas del mes son la venta del mes, no
 *     un número nuevo paralelo a los nueve vitales.
 *   · Lo obligatorio lo decide el catálogo, no cada pantalla ni cada ruta. Así un tipo nuevo no se
 *     olvida de validar en uno de los tres sitios.
 */
import { describe, it, expect } from "vitest";
import { TIPOS_EVENTO, TIPO_EVENTO, CLAVES_EVENTO, FAMILIAS, resumen, aporteAVitales, faltantes, esTipoEvento, type Evento } from "@/lib/eventos";
import { VITALES } from "@/lib/metricas";

const ev = (tipo: string, extra: Partial<Evento> = {}): Evento => ({
  id: `e-${Math.abs(tipo.length * 7 + (extra.monto ?? 0))}-${tipo}`,
  tipo, fecha: "2026-09-12", monto: null, minutos: null, persona_id: null, datos: null, ...extra,
});

describe("el catálogo de lo que se puede anotar", () => {
  it("cubre lo que Kelin pidió: tardanzas, facturación, proyectos y contratación", () => {
    for (const c of ["tardanza", "factura_emitida", "proyecto_trabado", "necesidad_persona", "incidencia"]) {
      expect(CLAVES_EVENTO, `falta poder anotar "${c}"`).toContain(c);
    }
  });

  it("no hay claves repetidas", () => {
    expect(new Set(CLAVES_EVENTO).size).toBe(CLAVES_EVENTO.length);
  });

  it("cada tipo pertenece a una familia que existe", () => {
    const familias = new Set(FAMILIAS.map((f) => f.clave));
    for (const t of TIPOS_EVENTO) expect(familias.has(t.familia), `${t.clave} en familia desconocida`).toBe(true);
  });

  it("cada tipo tiene pregunta hablada y al menos un campo obligatorio", () => {
    for (const t of TIPOS_EVENTO) {
      expect(t.pregunta.length, `${t.clave} sin pregunta`).toBeGreaterThan(10);
      expect(t.campos.some((c) => c.obligatorio), `${t.clave} no exige nada: se llenaría vacío`).toBe(true);
    }
  });

  it("ningún tipo pide más de tres cosas: un formulario largo no se llena nunca", () => {
    for (const t of TIPOS_EVENTO) expect(t.campos.length, `${t.clave} pide demasiado`).toBeLessThanOrEqual(3);
  });

  it("el que suma montos pide monto, y el que suma minutos pide minutos", () => {
    for (const t of TIPOS_EVENTO) {
      if (t.acumula === "suma_monto") expect(t.campos.some((c) => c.clave === "monto"), `${t.clave}`).toBe(true);
      if (t.acumula === "suma_minutos") expect(t.campos.some((c) => c.clave === "minutos"), `${t.clave}`).toBe(true);
    }
  });

  it("lo que alimenta un número lo alimenta con una clave vital REAL", () => {
    const vitales = new Set(VITALES.map((v) => v.clave));
    for (const t of TIPOS_EVENTO) {
      if (t.alimenta) expect(vitales.has(t.alimenta), `${t.clave} alimenta "${t.alimenta}", que no es un vital`).toBe(true);
    }
  });
});

describe("el resumen no inventa ni esconde", () => {
  it("lo que nadie anotó NO sale como cero", () => {
    const r = resumen([ev("tardanza", { minutos: 10 })]);
    expect(r).toHaveLength(1);
    expect(r.map((l) => l.tipo)).not.toContain("factura_emitida");
  });

  it("sin nada anotado, el resumen está vacío y no lleno de ceros", () => {
    expect(resumen([])).toEqual([]);
  });

  it("suma los montos de las facturas", () => {
    const r = resumen([ev("factura_emitida", { monto: 1200 }), ev("factura_emitida", { monto: 800 })]);
    expect(r[0].total).toBe(2000);
    expect(r[0].veces).toBe(2);
    expect(r[0].unidad).toBe("soles");
  });

  it("suma los minutos de las tardanzas, no las cuenta", () => {
    const r = resumen([ev("tardanza", { minutos: 15 }), ev("tardanza", { minutos: 5 })]);
    expect(r[0].total).toBe(20);
    expect(r[0].unidad).toBe("minutos");
  });

  it("cuenta las veces de lo que no tiene monto ni minutos", () => {
    const r = resumen([ev("proyecto_trabado"), ev("proyecto_trabado")]);
    expect(r[0].total).toBe(2);
    expect(r[0].unidad).toBe("veces");
  });

  it("un monto faltante cuenta como cero y no rompe la suma", () => {
    const r = resumen([ev("factura_emitida", { monto: 500 }), ev("factura_emitida", { monto: null })]);
    expect(r[0].total).toBe(500);
    expect(r[0].veces).toBe(2);
  });

  it("un tipo desconocido no se cuela en el resumen", () => {
    expect(resumen([ev("algo_que_no_existe")])).toEqual([]);
  });

  it("dice hacia dónde es mejorar: más facturas es bueno, más tardanzas no", () => {
    expect(TIPO_EVENTO.get("factura_emitida")!.mejorSi).toBe("sube");
    expect(TIPO_EVENTO.get("tardanza")!.mejorSi).toBe("baja");
  });
});

describe("los eventos alimentan los números que ya existen", () => {
  it("las facturas del mes son la venta del mes", () => {
    const a = aporteAVitales([ev("factura_emitida", { monto: 3000 }), ev("factura_emitida", { monto: 1500 })]);
    expect(a.venta_mes).toBe(4500);
  });

  it("lo que no alimenta un vital no aparece inventado como uno", () => {
    const a = aporteAVitales([ev("tardanza", { minutos: 30 }), ev("incidencia")]);
    expect(Object.keys(a)).toEqual([]);
  });

  it("sin eventos no hay aporte: no se estima nada", () => {
    expect(aporteAVitales([])).toEqual({});
  });
});

describe("lo obligatorio lo decide el catálogo, no cada pantalla", () => {
  it("una tardanza sin persona ni minutos dice exactamente qué falta", () => {
    expect(faltantes("tardanza", {})).toEqual(["Quién", "Cuántos minutos"]);
  });

  it("completa, no falta nada", () => {
    expect(faltantes("tardanza", { persona: "uuid", minutos: 10 })).toEqual([]);
  });

  it("los espacios en blanco no cuentan como respuesta", () => {
    expect(faltantes("necesidad_persona", { puesto: "   ", nota: "algo" })).toEqual(["Qué puesto"]);
  });

  it("lo opcional no se exige", () => {
    expect(faltantes("ausencia", { persona: "uuid" })).toEqual([]);
  });

  it("un tipo inexistente se rechaza en vez de pasar de largo", () => {
    expect(faltantes("inventado", {})).toHaveLength(1);
    expect(esTipoEvento("inventado")).toBe(false);
  });
});
