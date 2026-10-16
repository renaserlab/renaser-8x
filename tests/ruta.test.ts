/**
 * LA RUTA DE CADA EMPRESA (src/lib/ruta.ts, 16-10-2026): etapas, compuertas y cuánto lleva.
 *
 * Lo que se fija: las etapas de los tres tipos de trabajo; el día de la ruta en el reloj de la empresa (Lima); cada
 * criterio hecho, falta, sin medir o no aplica; que una compuerta con algo sin medir NUNCA se sugiere en verde; que una
 * etapa solo pasa con el veredicto verde de la consultora; que el día no cambia ningún estado (solo avisa); y que el
 * dueño ve las etapas sin criterios, notas ni veredictos. Puro: sin base.
 */
import { describe, it, expect } from "vitest";
import { etapasDe, diaDeRuta, avanceRuta, vistaDueno, esClaveDeMarca, AVISO_SIN_TIPO, AVISO_SIN_INICIO, type HechosRuta } from "@/lib/ruta";
import { armarHechos, type LecturaNegocio, type LecturaRuta } from "@/lib/ruta-datos";

const LIMA = "America/Lima";

/** Una empresa en su primera semana, con todo leído. */
function hechos(extra: Partial<HechosRuta> = {}): HechosRuta {
  return {
    tipo: "estructurar",
    inicio: "2026-10-19",
    zona: LIMA,
    numeros: { conCifra: 6, comprobados: 3, venta: true, gastoFijo: true },
    lineaBase: { vigente: true },
    productos: { lineas: 10, completas: 8 },
    costos: { conMonto: 4 },
    historia: { respondidas: 5 },
    pedidos: { activadas: 3, completadas: 3, abiertas: 0 },
    planAceptado: true,
    indicadores: { activos: 3, listos: 3, conValorReciente: 3 },
    revisiones: { esperadas: 0, revisadas: 0 },
    plan: { aprobadas: 0, consideradas: 0, verificadasATiempo: 0 },
    organigrama: { puestos: 4, documentoConfirmado: true },
    procesos: { dibujados: 2, conSop: 2, conIndicador: 2 },
    cortes: { mesesCerrados: 0, congelados: 0 },
    marcas: {},
    ...extra,
  };
}

const MARCAS_DIAGNOSTICO = {
  "diagnostico.fugas": { valor: "cumple" as const, nota: "cuatro fugas con su cuenta", marcado_at: "2026-10-23T15:00:00Z" },
  "diagnostico.procesos_vitales": { valor: "cumple" as const, nota: null, marcado_at: "2026-10-23T15:00:00Z" },
  "diagnostico.compromiso": { valor: "cumple" as const, nota: null, marcado_at: "2026-10-23T15:00:00Z" },
};
const DIA_3 = new Date("2026-10-21T15:00:00Z");

describe("las etapas de cada tipo de trabajo", () => {
  it("estructurar: diagnóstico (1–7, Compuerta 5) y estructurar (8–30, Compuerta 30)", () => {
    const e = etapasDe("estructurar");
    expect(e.map((x) => [x.clave, x.desdeDia, x.hastaDia, x.compuerta])).toEqual([["diagnostico", 1, 7, "c5"], ["estructurar", 8, 30, "c30"]]);
    expect(e[0]!.compuertaNombre).toBe("Compuerta 5 · La Firma");
    expect(e[0]!.nombre).toBe("Diagnóstico y plan");
    expect(e[0]!.nombreDueno).toBe("Conocer tu empresa");
  });

  it("estructurar y sistematizar: cuatro etapas hasta el día 120", () => {
    expect(etapasDe("estructurar_y_sistematizar").map((x) => [x.clave, x.desdeDia, x.hastaDia, x.compuerta])).toEqual([
      ["diagnostico", 1, 7, "c5"], ["estructurar", 8, 30, "c30"], ["sistematizar", 31, 60, "c60"], ["monitoreo", 61, 120, "c120"],
    ]);
  });

  it("sistematizar directo: diagnóstico, ordenar y sistematizar por olas, y monitoreo hasta el día 90", () => {
    const e = etapasDe("sistematizar_directo");
    expect(e.map((x) => [x.clave, x.desdeDia, x.hastaDia, x.compuerta])).toEqual([["diagnostico", 1, 7, "c5"], ["ordenar_y_sistematizar", 8, 30, "c30"], ["monitoreo", 31, 90, "c90"]]);
    // Por olas: lo de estructurar más los procesos escritos y con indicador.
    expect(e[1]!.criterios.map((c) => c.clave)).toEqual(expect.arrayContaining(["anotados", "revision", "plan_cumplido", "organigrama", "escritos", "con_indicador"]));
  });

  it("las marcas que puede poner la consultora son solo las de criterios de marca", () => {
    expect(esClaveDeMarca("diagnostico.fugas")).toBe(true);
    expect(esClaveDeMarca("estructurar.ausencia")).toBe(true);
    expect(esClaveDeMarca("diagnostico.numeros")).toBe(false);
    expect(esClaveDeMarca("diagnostico.compuerta")).toBe(false);
  });
});

describe("el día de la ruta, en el reloj de la empresa", () => {
  it("día 1 es el inicio; a las 22:00 de Lima del día 1 (ya día 2 en UTC) sigue siendo día 1", () => {
    expect(diaDeRuta("2026-10-19", new Date("2026-10-19T14:00:00Z"), LIMA)).toBe(1);
    expect(diaDeRuta("2026-10-19", new Date("2026-10-20T03:00:00Z"), LIMA)).toBe(1);
    expect(diaDeRuta("2026-10-19", new Date("2026-10-20T05:30:00Z"), LIMA)).toBe(2);
    expect(diaDeRuta("2026-10-19", new Date("2026-10-27T15:00:00Z"), LIMA)).toBe(9);
  });

  it("antes del inicio, 0 o menos; sin inicio, null", () => {
    expect(diaDeRuta("2026-10-19", new Date("2026-10-18T15:00:00Z"), LIMA)).toBe(0);
    expect(diaDeRuta(null, DIA_3, LIMA)).toBeNull();
  });
});

describe("los criterios y la compuerta", () => {
  it("con todo medido y marcado, la compuerta del diagnóstico se sugiere verde; sin pedidos, «lo pedido» no aplica", () => {
    const a = avanceRuta(hechos({ marcas: MARCAS_DIAGNOSTICO, pedidos: { activadas: 0, completadas: 0, abiertas: 0 } }), DIA_3);
    const d = a.etapas[0]!;
    expect(d.criterios.find((c) => c.clave === "pedidos")!.estado).toBe("no_aplica");
    expect(d.criterios.every((c) => c.estado === "hecho" || c.estado === "no_aplica")).toBe(true);
    expect(d.medibles).toBe(10);
    expect(d.pct).toBe(100);
    expect(d.compuerta.sugerido).toBe("verde");
    // Sugerido no es decidido: sin el veredicto de la consultora la etapa sigue en curso.
    expect(d.compuerta.veredicto).toBeNull();
    expect(d.estado).toBe("en_curso");
  });

  it("hecho, falta y sin medir: lo que no se pudo leer es «no se pudo leer», nunca «falta» ni «hecho»", () => {
    const a = avanceRuta(hechos({ marcas: MARCAS_DIAGNOSTICO, productos: { lineas: 10, completas: 5 }, historia: null, numeros: { conCifra: 7, comprobados: 1, venta: true, gastoFijo: false } }), DIA_3);
    const c = Object.fromEntries(a.etapas[0]!.criterios.map((x) => [x.clave, x]));
    expect(c.productos!.estado).toBe("falta");
    expect(c.productos!.detalle).toMatch(/5 de 10/);
    expect(c.historia!.estado).toBe("sin_medir");
    expect(c.historia!.detalle).toMatch(/^no se pudo leer/);
    expect(c.numeros!.estado).toBe("falta");
    expect(c.numeros!.detalle).toMatch(/falta el gasto fijo/);
    expect(c.linea_base!.estado).toBe("falta");
    // Los costos del mes cuentan aunque el gasto fijo no esté en los 9 números.
    expect(c.costos!.estado).toBe("hecho");
    expect(a.faltaParaLaCompuerta.map((x) => x.clave)).toEqual(["numeros", "productos", "historia", "linea_base"]);
  });

  it("una compuerta con algo sin medir NUNCA sale en verde, aunque todo lo demás esté hecho", () => {
    const a = avanceRuta(hechos({ marcas: MARCAS_DIAGNOSTICO, planAceptado: null }), DIA_3);
    const d = a.etapas[0]!;
    expect(d.criterios.filter((x) => x.estado === "sin_medir").map((x) => x.clave)).toEqual(["plan"]);
    expect(d.compuerta.sugerido).toBe("no_se_pudo_leer");
    expect(d.sinMedir).toBe(1);
    // Los sin medir cuentan como no hechos en el %.
    expect(d.pct).toBe(Math.round((100 * 10) / 11));
  });

  it("ámbar con 75 % o más; rojo por debajo; una marca ausente es «falta»", () => {
    const ambar = avanceRuta(hechos({ marcas: { ...MARCAS_DIAGNOSTICO, "diagnostico.compromiso": { valor: "no_cumple", nota: "no vino a la sesión", marcado_at: null } } }), DIA_3);
    expect(ambar.etapas[0]!.compuerta.sugerido).toBe("ambar");
    expect(ambar.etapas[0]!.criterios.find((c) => c.clave === "compromiso")!.detalle).toBe("la consultora marcó que no cumple: no vino a la sesión");
    const rojo = avanceRuta(hechos(), DIA_3);
    expect(rojo.etapas[0]!.criterios.find((c) => c.clave === "fugas")).toMatchObject({ estado: "falta", detalle: "la consultora todavía no lo marca" });
    expect(rojo.etapas[0]!.pct).toBe(Math.round((100 * 8) / 11));
    // 8 de 11: 73 %, por debajo de 75.
    expect(rojo.etapas[0]!.compuerta.sugerido).toBe("rojo");
    const muyRojo = avanceRuta(hechos({ numeros: { conCifra: 2, comprobados: 0, venta: false, gastoFijo: false }, costos: { conMonto: 0 }, planAceptado: false, indicadores: { activos: 0, listos: 0, conValorReciente: 0 } }), DIA_3);
    expect(muyRojo.etapas[0]!.compuerta.sugerido).toBe("rojo");
  });
});

describe("plan cumplido: por resultados, nunca por calendario", () => {
  const planDe = (plan: HechosRuta["plan"]) => avanceRuta(hechos({ plan }), DIA_3).etapas[1]!.criterios.find((c) => c.clave === "plan_cumplido")!;

  it("todo verificado antes de vencer: hecho, sin esperar a ninguna fecha", () => {
    expect(planDe({ aprobadas: 4, consideradas: 4, verificadasATiempo: 4 })).toMatchObject({ estado: "hecho" });
    expect(planDe({ aprobadas: 4, consideradas: 4, verificadasATiempo: 4 }).detalle).toMatch(/^4 de 4 acciones verificadas a tiempo/);
  });

  it("sin acciones aprobadas, o sin ninguna verificada ni vencida: falta, y se dice por qué", () => {
    expect(planDe({ aprobadas: 0, consideradas: 0, verificadasATiempo: 0 })).toMatchObject({ estado: "falta", detalle: "el plan no tiene acciones aprobadas" });
    expect(planDe({ aprobadas: 3, consideradas: 0, verificadasATiempo: 0 })).toMatchObject({ estado: "falta", detalle: "3 acciones aprobadas; ninguna verificada todavía" });
  });

  it("de las acciones leídas: cuenta las vencidas y las ya verificadas aunque no vencieran; tarde no es a tiempo", () => {
    const lectura: LecturaRuta = {
      empresa: { tipo_trabajo: "estructurar", ruta_inicio: "2026-10-19", zona_horaria: LIMA },
      numeros: null, mediciones: [], pedidos: null, actasPlan: 1, indicadores: [], revisiones: [], organigrama: null, procesos: null, marcas: {},
      acciones: [
        // Verificada antes de vencer, y su fecha todavía no llega: cuenta, a tiempo.
        { estado: "verificado", vence_at: "2026-10-30", verificada_el: "2026-10-20T15:00:00Z" },
        // Vencida y verificada tarde: cuenta, no a tiempo.
        { estado: "verificado", vence_at: "2026-10-19", verificada_el: "2026-10-20T15:00:00Z" },
        // Vencida sin verificar: cuenta, no a tiempo.
        { estado: "en_ejecucion", vence_at: "2026-10-20", verificada_el: null },
        // Aprobada, ni vencida ni verificada: no cuenta todavía.
        { estado: "aprobado", vence_at: "2026-10-30", verificada_el: null },
        // Propuesta: no es parte del plan.
        { estado: "propuesto", vence_at: "2026-10-01", verificada_el: null },
      ],
    };
    const negocio: LecturaNegocio = { productos: null, costos: null, historia: null, guardado: null };
    expect(armarHechos(lectura, negocio, DIA_3)!.plan).toEqual({ aprobadas: 4, consideradas: 3, verificadasATiempo: 1 });
    // Sin la fila de la empresa no hay ruta.
    expect(armarHechos({ ...lectura, empresa: null }, negocio, DIA_3)).toBeNull();
  });

  it("el 70 %: 7 de 10 a tiempo es hecho; 6 de 10, falta", () => {
    expect(planDe({ aprobadas: 12, consideradas: 10, verificadasATiempo: 7 }).estado).toBe("hecho");
    expect(planDe({ aprobadas: 12, consideradas: 10, verificadasATiempo: 6 }).estado).toBe("falta");
    expect(planDe(null).estado).toBe("sin_medir");
  });
});

describe("el estado de cada etapa: lo decide el veredicto, no el calendario", () => {
  it("una etapa pasa SOLO con el veredicto verde; ámbar o rojo la dejan en curso", () => {
    const verde = avanceRuta(hechos({ marcas: { ...MARCAS_DIAGNOSTICO, "diagnostico.compuerta": { valor: "verde", nota: "firmado el día 5", marcado_at: null } } }), DIA_3);
    expect(verde.etapas.map((e) => e.estado)).toEqual(["pasada", "en_curso"]);
    expect(verde.actual).toBe("estructurar");
    const ambar = avanceRuta(hechos({ marcas: { "diagnostico.compuerta": { valor: "ambar", nota: "falta la línea base", marcado_at: null } } }), DIA_3);
    expect(ambar.etapas.map((e) => e.estado)).toEqual(["en_curso", "por_venir"]);
    expect(ambar.etapas[0]!.compuerta.veredicto).toBe("ambar");
    // Un verde de una etapa posterior no salta a la que está en curso.
    const saltado = avanceRuta(hechos({ marcas: { "estructurar.compuerta": { valor: "verde", nota: "x", marcado_at: null } } }), DIA_3);
    expect(saltado.etapas.map((e) => e.estado)).toEqual(["en_curso", "por_venir"]);
  });

  it("el día no cambia estados: el día 40 sin veredicto la etapa sigue en curso, y solo se avisa", () => {
    const dia40 = avanceRuta(hechos(), new Date("2026-11-27T15:00:00Z"));
    expect(dia40.dia).toBe(40);
    expect(dia40.etapas.map((e) => e.estado)).toEqual(["en_curso", "por_venir"]);
    expect(dia40.aviso).toBe("Va 33 días más de lo previsto para esta etapa");
    const dia3 = avanceRuta(hechos(), DIA_3);
    expect(dia3.etapas.map((e) => e.estado)).toEqual(dia40.etapas.map((e) => e.estado));
    expect(dia3.aviso).toBeNull();
    expect(avanceRuta(hechos(), new Date("2026-10-26T15:00:00Z")).aviso).toBe("Va 1 día más de lo previsto para esta etapa");
  });

  it("sin tipo de trabajo no hay etapas, y se dice; sin inicio, también", () => {
    const sinTipo = avanceRuta(hechos({ tipo: null }), DIA_3);
    expect(sinTipo).toMatchObject({ tipo: null, etapas: [], actual: null, aviso: AVISO_SIN_TIPO });
    const sinInicio = avanceRuta(hechos({ inicio: null }), DIA_3);
    expect(sinInicio.dia).toBeNull();
    expect(sinInicio.aviso).toBe(AVISO_SIN_INICIO);
    expect(sinInicio.etapas).toHaveLength(2);
  });
});

describe("lo que ve el dueño", () => {
  it("las etapas con su nombre, su estado y el %; sin criterios, sin notas, sin veredictos", () => {
    const a = avanceRuta(hechos({ marcas: { ...MARCAS_DIAGNOSTICO, "diagnostico.compuerta": { valor: "verde", nota: "NOTA-INTERNA", marcado_at: null } } }), DIA_3);
    const v = vistaDueno(a);
    expect(v).toEqual({
      etapas: [
        { clave: "diagnostico", nombre: "Conocer tu empresa", estado: "pasada", pct: 100 },
        { clave: "estructurar", nombre: "Ordenar", estado: "en_curso", pct: a.etapas[1]!.pct },
      ],
      actual: "estructurar",
      dia: 3,
      hastaDia: 30,
    });
    const texto = JSON.stringify(v);
    expect(texto).not.toMatch(/NOTA-INTERNA|criterio|veredicto|compuerta|fugas|cuatro fugas/);
  });
});
