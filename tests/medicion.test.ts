import { describe, it, expect } from "vitest";
import { comparar, veredicto, valoresActuales, derivadosActuales, nombreMedicion, type Medicion } from "@/lib/medicion";
import { VITALES, type Metrica } from "@/lib/metricas";

const med = (tipo: "linea_base" | "corte", fecha: string, valores: Record<string, number | null>, numero = 0): Medicion =>
  ({ id: tipo + numero, tipo, numero, fecha, valores, derivados: {}, nota: null });

const m = (clave: string, valor: number | null, periodo = "actual"): Metrica => ({ clave, periodo, valor, estado: "contado" });

/**
 * La línea base y los cortes: cómo se responde "¿funcionó lo que hicimos?". Antes era incontestable
 * —el diagnóstico era una foto única y los cortes guardaban texto libre— y estas pruebas existen
 * para que no vuelva a serlo.
 */
describe("dirección de mejora", () => {
  it("cada vital sabe hacia dónde es mejorar", () => {
    for (const v of VITALES) expect(["sube", "baja", "neutro"], v.clave).toContain(v.mejorSi);
  });

  it("bajar la deuda es mejorar, no retroceder", () => {
    expect(VITALES.find((v) => v.clave === "deuda_propia")!.mejorSi).toBe("baja");
    expect(VITALES.find((v) => v.clave === "gasto_fijo_mes")!.mejorSi).toBe("baja");
    expect(VITALES.find((v) => v.clave === "costo_producto_estrella")!.mejorSi).toBe("baja");
  });

  it("subir el precio no se juzga solo: puede sanear el margen o espantar clientes", () => {
    expect(VITALES.find((v) => v.clave === "precio_producto_estrella")!.mejorSi).toBe("neutro");
  });
});

describe("comparar dos mediciones", () => {
  const base = med("linea_base", "2026-05-01", { venta_mes: 40000, ganancia_mes: 4000, deuda_propia: 20000 });
  const corte = med("corte", "2026-08-01", { venta_mes: 48000, ganancia_mes: 6000, deuda_propia: 14000 }, 1);

  it("sin línea base no compara nada, en vez de inventar un punto de partida", () => {
    expect(comparar(null, corte)).toEqual([]);
    expect(comparar(base, null)).toEqual([]);
  });

  it("calcula la diferencia y el porcentaje", () => {
    const v = comparar(base, corte).find((x) => x.vital.clave === "venta_mes")!;
    expect(v.delta).toBe(8000);
    expect(v.deltaPct).toBeCloseTo(20, 5);
    expect(v.mejoro).toBe(true);
  });

  it("bajar la deuda cuenta como mejora, no como caída", () => {
    const d = comparar(base, corte).find((x) => x.vital.clave === "deuda_propia")!;
    expect(d.delta).toBe(-6000);
    expect(d.mejoro).toBe(true);
  });

  it("subir el gasto fijo cuenta como empeorar", () => {
    const c = comparar(med("linea_base", "2026-05-01", { gasto_fijo_mes: 10000 }), med("corte", "2026-08-01", { gasto_fijo_mes: 14000 }, 1));
    expect(c[0]!.mejoro).toBe(false);
  });

  it("un número neutro se muestra pero no se juzga", () => {
    const c = comparar(med("linea_base", "2026-05-01", { precio_producto_estrella: 20 }), med("corte", "2026-08-01", { precio_producto_estrella: 25 }, 1));
    expect(c[0]!.delta).toBe(5);
    expect(c[0]!.mejoro).toBeNull();
  });

  it("un vital que nunca se midió no aparece: es un vacío, no un retroceso", () => {
    const c = comparar(med("linea_base", "2026-05-01", { venta_mes: 40000 }), med("corte", "2026-08-01", { venta_mes: 44000 }, 1));
    expect(c).toHaveLength(1);
    expect(c.some((x) => x.vital.clave === "caja_hoy")).toBe(false);
  });

  it("si el corte no midió algo que la base sí, lo dice en vez de contarlo como caída a cero", () => {
    const c = comparar(med("linea_base", "2026-05-01", { caja_hoy: 5000 }), med("corte", "2026-08-01", {}, 1));
    expect(c[0]!.delta).toBeNull();
    expect(c[0]!.mejoro).toBeNull();
    expect(c[0]!.frase).toContain("no se midió");
  });

  it("de un punto de partida en cero no calcula porcentaje", () => {
    const c = comparar(med("linea_base", "2026-05-01", { ganancia_mes: 0 }), med("corte", "2026-08-01", { ganancia_mes: 3000 }, 1));
    expect(c[0]!.delta).toBe(3000);
    expect(c[0]!.deltaPct).toBeNull();
    expect(c[0]!.frase).not.toContain("Infinity");
  });

  it("sin cambio lo dice claro, sin inventar movimiento", () => {
    const c = comparar(med("linea_base", "2026-05-01", { venta_mes: 40000 }), med("corte", "2026-08-01", { venta_mes: 40000 }, 1));
    expect(c[0]!.mejoro).toBeNull();
    expect(c[0]!.frase).toContain("Sigue igual");
  });

  it("lo que empeoró va primero: el dueño no debe tener que buscarlo", () => {
    const c = comparar(
      med("linea_base", "2026-05-01", { venta_mes: 40000, gasto_fijo_mes: 10000 }),
      med("corte", "2026-08-01", { venta_mes: 44000, gasto_fijo_mes: 15000 }, 1)
    );
    expect(c[0]!.mejoro).toBe(false);
  });

  it("ninguna frase le muestra al dueño el nombre técnico de la clave", () => {
    for (const x of comparar(base, corte)) expect(x.frase, x.vital.clave).not.toMatch(/_/);
  });
});

describe("el veredicto del corte", () => {
  const base = med("linea_base", "2026-05-01", { venta_mes: 40000, ganancia_mes: 4000 });

  it("el titular habla de dinero cuando hay ganancia que comparar", () => {
    const corte = med("corte", "2026-08-01", { venta_mes: 48000, ganancia_mes: 6000 }, 1);
    const v = veredicto(base, corte, comparar(base, corte));
    expect(v.gananciaDelta).toBe(2000);
    expect(v.titular).toContain("2,000");
    expect(v.titular).toContain("más al mes");
  });

  it("si el negocio deja menos, lo dice sin maquillarlo", () => {
    const corte = med("corte", "2026-08-01", { venta_mes: 48000, ganancia_mes: 2500 }, 1);
    const v = veredicto(base, corte, comparar(base, corte));
    expect(v.titular).toContain("menos al mes");
  });

  it("cuenta los días transcurridos desde el punto de partida", () => {
    const corte = med("corte", "2026-08-01", { venta_mes: 41000 }, 1);
    expect(veredicto(base, corte, comparar(base, corte)).dias).toBe(92);
  });

  it("sin línea base no promete nada", () => {
    const v = veredicto(null, med("corte", "2026-08-01", { venta_mes: 41000 }, 1), []);
    expect(v.titular).toContain("Todavía no hay");
  });

  it("si no hay ningún número en común lo dice, en vez de fingir un resultado", () => {
    const corte = med("corte", "2026-08-01", { caja_hoy: 9000 }, 1);
    const movs = comparar(med("linea_base", "2026-05-01", { deuda_clientes: 100 }), corte);
    const v = veredicto(base, corte, movs.filter(() => false));
    expect(v.titular).toContain("no se puede decir");
  });
});

describe("qué se congela", () => {
  const metricas = [
    m("venta_mes", 40000, "2026-06"), m("venta_mes", 45000, "2026-07"),
    m("ganancia_mes", 4500, "2026-07"), m("caja_hoy", 8000),
    m("gasto_fijo_mes", 12000, "2026-07"), m("precio_producto_estrella", 25),
    m("costo_producto_estrella", 15), m("venta_mes", 90000, "epoca_dorada"),
    m("merma_semana", 300),
  ];

  it("congela el mes más reciente, no el primero que aparezca", () => {
    expect(valoresActuales(metricas).venta_mes).toBe(45000);
  });

  it("la época dorada nunca entra en la foto del presente", () => {
    expect(valoresActuales(metricas).venta_mes).not.toBe(90000);
  });

  it("solo congela los nueve vitales: lo demás no es comparable entre empresas", () => {
    expect(valoresActuales(metricas)).not.toHaveProperty("merma_semana");
  });

  it("los derivados se congelan con la foto, para que la historia no cambie si cambia la fórmula", () => {
    const d = derivadosActuales(metricas);
    expect(d.margen).toBeCloseTo(10, 5);
    expect(d.equilibrio).toBeCloseTo(30000, 5);
    expect(d.diasAguante).toBeCloseTo(20, 5);
  });

  it("no inventa nada cuando no hay números", () => {
    expect(Object.keys(valoresActuales([]))).toHaveLength(0);
  });

  it("las mediciones se nombran en castellano, no por su tipo interno", () => {
    expect(nombreMedicion(med("linea_base", "2026-05-01", {}))).toBe("Punto de partida");
    expect(nombreMedicion(med("corte", "2026-08-01", {}, 2))).toBe("Corte 2");
  });
});
