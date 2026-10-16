import { describe, it, expect, vi, beforeEach } from "vitest";

// LOS DOBLES SOLO SIRVEN A LA ÚLTIMA SECCIÓN (la ruta de cortes del consultor). Todo lo demás de este
// archivo es regla pura y no toca nada de esto. No hay base real aquí: `supabaseAdmin()` es un doble en
// memoria que filtra con los .eq recibidos, anota cada escritura y cada llamada a una función de base.
type Fila = Record<string, unknown>;
const doble = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  escrituras: [] as { tabla: string; op: "insert" | "update"; datos: Fila }[],
  rpc: [] as { fn: string; args: Fila }[],
  /** Lo que devuelve `congelar_medicion`: la fila nueva, o un error. */
  rpcResultado: { data: null as Fila[] | null, error: null as { message: string } | null },
  /** tabla → mensaje con el que falla un insert en ella. */
  fallarInsert: {} as Record<string, string | undefined>,
}));

vi.mock("@/lib/supabase/admin", () => {
  type Resultado = { data: Fila[] | null; error: { message: string } | null };
  const consulta = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = [];
    let modo: "select" | "insert" | "update" = "select";
    let cuerpo: Fila = {};
    const ejecutar = (): Resultado => {
      if (modo === "insert") {
        const mensaje = doble.fallarInsert[tabla];
        if (mensaje) return { data: null, error: { message: mensaje } };
        const fila = { id: `${tabla}-${doble.escrituras.length + 1}`, ...cuerpo };
        (doble.tablas[tabla] ??= []).push(fila);
        doble.escrituras.push({ tabla, op: "insert", datos: fila });
        return { data: [fila], error: null };
      }
      const filas = (doble.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
      if (modo === "update") {
        for (const f of filas) Object.assign(f, cuerpo);
        doble.escrituras.push({ tabla, op: "update", datos: { ...cuerpo } });
      }
      return { data: filas, error: null };
    };
    const q = {
      select: () => q, order: () => q, limit: () => q,
      eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return q; },
      insert: (datos: Fila) => { modo = "insert"; cuerpo = datos; return q; },
      update: (datos: Fila) => { modo = "update"; cuerpo = datos; return q; },
      maybeSingle: async () => { const r = ejecutar(); return { data: r.data?.[0] ?? null, error: r.error }; },
      single: async () => { const r = ejecutar(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then: (res: (v: Resultado) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  const rpc = async (fn: string, args: Fila) => {
    doble.rpc.push({ fn, args });
    // Como la función real: la fila congelada queda en la tabla con lo que se le pasó.
    for (const fila of doble.rpcResultado.data ?? []) (doble.tablas.mediciones ??= []).push({ company_id: args.p_company, tipo: args.p_tipo, valores: args.p_valores, derivados: args.p_derivados, nota: args.p_nota, creado_por: args.p_por, ...fila });
    return doble.rpcResultado;
  };
  return { supabaseAdmin: () => ({ from: consulta, rpc }) };
});
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));
// Solo para la sección de renderizado: las pantallas se pintan a texto, sin navegador ni enrutador de Next.
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, style }: { href: string; children?: unknown; style?: Record<string, unknown> }) => createElement("a", { href, style }, children as never) };
});

import {
  comparar, veredicto, valoresActuales, derivadosActuales, nombreMedicion, nombreVersion, lineaBaseVigente, lineaBaseDe, versionesLineaBase,
  periodosEquivalentes, diasDePeriodo, registrarCondicion, atribucion, resumenAtribucion, cuentaAtribucion, etiquetaAtribucion, lecturaDeCorte, condicionesDe,
  ligarAcciones, fechaDia, textoPeriodo, textoSinVersion, VersionDistinta,
  duracionesEquivalentes, diaEnZona, mesCerradoAnterior, faltaEnPeriodo, pedidoDeMedicion,
  provisionalesActuales, provisionalesDe, nombresProvisionales, CLAVE_PROVISIONALES, ordenDePeriodos, periodoDeCorte,
  diaDeVerificacion, fraseProvisionales,
  type Medicion, type AccionLigada,
} from "@/lib/medicion";
import { VITALES, type Metrica } from "@/lib/metricas";
import { CondicionesZ } from "@/app/api/companies/[id]/medicion/esquemas";
import { perfilApi, type Perfil } from "@/lib/auth";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Avance } from "@/components/cliente/Avance";
import { ComoVamos } from "@/components/medicion/ComoVamos";
import { PanelMediciones } from "@/components/medicion/PanelMediciones";
import { CortesPlan } from "@/components/plan/CortesPlan";
import { readFileSync } from "node:fs";
import path from "node:path";

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

  it("…y tampoco cuando cada medición trae números distintos: sin dato en común no es «el negocio está parejo»", () => {
    const otraBase = med("linea_base", "2026-05-01", { deuda_clientes: 100 });
    const corte = med("corte", "2026-08-01", { caja_hoy: 9000 }, 1);
    const movs = comparar(otraBase, corte);
    expect(movs.map((x) => x.delta), "los dos números aparecen, pero ninguno en las dos mediciones").toEqual([null, null]);
    const v = veredicto(otraBase, corte, movs);
    expect(v.titular).toBe("No se midió ningún número en común: no se puede decir si mejoró o no.");
    expect(v.titular).not.toMatch(/parejo/);
    expect(v).toMatchObject({ mejoraron: 0, empeoraron: 0, sinCambio: 0, gananciaDelta: null });
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
    // D5 (13-10-2026): sin costos variables no hay equilibrio de empresa; la hipótesis del producto
    // estrella (12000 / 0,40 = 30000) se congela bajo su nombre, no como «equilibrio».
    expect(d.equilibrio).toBeNull();
    expect(d.equilibrioProductoEstrella).toBeCloseTo(30000, 5);
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

// ---------------------------------------------------------------------------------------------
// VERSIONES, PERÍODOS, CONDICIONES Y ATRIBUCIÓN (sección 14, 13-10-2026)
// ---------------------------------------------------------------------------------------------

/** Una línea base con versión: la de antes de la migración no trae estos campos, por eso son opcionales. */
const version = (n: number, id: string, valores: Record<string, number | null>, extra: Partial<Medicion> = {}): Medicion => ({
  ...med("linea_base", "2026-05-01", valores),
  id,
  version: n,
  vigente: extra.vigente ?? true,
  reemplaza_a: null,
  linea_base_id: null,
  ...extra,
});

describe("versiones del punto de partida", () => {
  const v1 = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000 }, { vigente: false });
  const v2 = version(2, "b2", { venta_mes: 41000, ganancia_mes: 3800 }, { vigente: true, reemplaza_a: "b1", motivo_version: "costos completos tras conciliar" });
  const corteV1: Medicion = { ...med("corte", "2026-08-01", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1" };
  const corteV2: Medicion = { ...med("corte", "2026-09-01", { venta_mes: 47000, ganancia_mes: 5500 }, 2), id: "c2", linea_base_id: "b2" };
  const todas = [v1, corteV1, v2, corteV2];

  it("la vigente es la marcada como tal, no la primera que aparece", () => {
    expect(lineaBaseVigente(todas)?.id).toBe("b2");
    expect(versionesLineaBase(todas).map((v) => v.version)).toEqual([2, 1]);
  });

  it("una fila anterior a la migración (sin vigente) sigue siendo el punto de partida", () => {
    const vieja = med("linea_base", "2026-05-01", { venta_mes: 1 });
    expect(lineaBaseVigente([vieja, corteV1])?.id).toBe(vieja.id);
  });

  it("lineaBaseDe devuelve la versión exacta del corte aunque ya no esté vigente", () => {
    expect(lineaBaseDe(corteV1, todas)).toEqual({ base: v1, registrada: true });
    expect(lineaBaseDe(corteV2, todas)).toEqual({ base: v2, registrada: true });
  });

  it("un corte sin registro de versión (anterior a la migración, sin huella) cae a la vigente y dice por qué", () => {
    const viejo = med("corte", "2026-07-01", { venta_mes: 45000 }, 9);
    expect(lineaBaseDe(viejo, todas)).toEqual({ base: v2, registrada: false, motivo: "anterior_al_versionado" });
    expect(lineaBaseDe(null, todas)).toEqual({ base: null, registrada: false });
  });

  it("un corte congelado SIN punto de partida vigente (con huella, sin referencia) no se compara con una base fijada después", () => {
    // La función nueva pone hash_contenido siempre; si además dejó linea_base_id nulo es que no había vigente al medir.
    const huerfano: Medicion = { ...med("corte", "2026-04-15", { venta_mes: 39000 }, 1), id: "c0", linea_base_id: null, hash_contenido: "a1b2c3" };
    const r = lineaBaseDe(huerfano, todas);
    expect(r).toEqual({ base: null, registrada: false, motivo: "sin_punto_de_partida" });
    expect(comparar(r.base, huerfano, todas)).toEqual([]);
  });

  it("los dos casos sin versión se explican distinto, al consultor y al dueño, y el que sí tiene versión no dice nada", () => {
    expect(textoSinVersion("sin_punto_de_partida", "consultor")).toMatch(/no había punto de partida vigente/);
    expect(textoSinVersion("sin_punto_de_partida", "dueno")).toMatch(/todavía no había punto de partida/);
    expect(textoSinVersion("anterior_al_versionado", "consultor")).toMatch(/anterior al versionado/);
    expect(textoSinVersion("anterior_al_versionado", "dueno")).toMatch(/anterior a que guardáramos las versiones/);
    expect(textoSinVersion("sin_punto_de_partida", "dueno")).not.toBe(textoSinVersion("anterior_al_versionado", "dueno"));
    expect(textoSinVersion(undefined, "dueno")).toBe("");
    for (const t of [textoSinVersion("sin_punto_de_partida", "dueno"), textoSinVersion("anterior_al_versionado", "dueno")]) expect(t).not.toMatch(/_|linea_base|hash/);
  });

  it("comparar rechaza una versión distinta y nombra la correcta: «este corte se midió contra la versión 1»", () => {
    expect(() => comparar(v2, corteV1, todas)).toThrow(VersionDistinta);
    expect(() => comparar(v2, corteV1, todas)).toThrow(/se midió contra la versión 1 del punto de partida, no contra la versión 2/);
    // Sin la lista de versiones no puede nombrar la correcta, pero sigue rechazando.
    expect(() => comparar(v2, corteV1)).toThrow(/otra versión del punto de partida/);
  });

  it("comparar acepta la versión correcta, y la comparación del corte 1 no cambia porque exista la versión 2", () => {
    const antes = comparar(v1, corteV1, todas).find((x) => x.vital.clave === "venta_mes")!;
    expect(antes.delta).toBe(8000);
    const despuesDeRecongelar = comparar(lineaBaseDe(corteV1, todas).base, corteV1, todas).find((x) => x.vital.clave === "venta_mes")!;
    expect(despuesDeRecongelar.delta).toBe(8000);
  });

  it("un corte sin linea_base_id se compara con lo que le pasen: compatibilidad con lo anterior", () => {
    const viejo = med("corte", "2026-07-01", { venta_mes: 45000 }, 9);
    expect(comparar(v2, viejo, todas)[0]!.delta).toBe(4000);
  });

  it("se nombran con su versión, en castellano", () => {
    expect(nombreVersion(v2)).toBe("Punto de partida · versión 2");
    expect(nombreVersion(med("linea_base", "2026-05-01", {}))).toBe("Punto de partida · versión 1");
    expect(nombreVersion(corteV2)).toBe("Corte 2");
  });
});

describe("fechas de medición sin zona horaria", () => {
  it("un día es un día: 2026-05-01 no se convierte en 30 de abril", () => {
    expect(fechaDia("2026-05-01")).toBe("1 may 2026");
    expect(fechaDia("2026-12-31T23:00:00Z")).toBe("31 dic 2026");
    expect(fechaDia(null)).toBe("sin fecha");
    expect(fechaDia("ayer")).toBe("sin fecha");
  });
  it("el período se dice completo o se dice que falta", () => {
    expect(textoPeriodo({ periodo_desde: "2026-04-01", periodo_hasta: "2026-04-30" })).toBe("del 1 abr 2026 al 30 abr 2026");
    expect(textoPeriodo({ periodo_desde: "2026-04-01", periodo_hasta: null })).toBe("período sin registrar");
  });
});

describe("períodos equivalentes", () => {
  const con = (desde: string, hasta: string, extra: Partial<Medicion> = {}): Medicion => ({ ...med("corte", hasta, { venta_mes: 1 }, 1), periodo_desde: desde, periodo_hasta: hasta, ...extra });

  it("cuenta los días con los dos extremos incluidos", () => {
    expect(diasDePeriodo(con("2026-04-01", "2026-04-30"))).toBe(30);
    expect(diasDePeriodo(con("2026-05-01", "2026-05-31"))).toBe(31);
    expect(diasDePeriodo({ periodo_desde: "2026-05-31", periodo_hasta: "2026-05-01" })).toBeNull();
    expect(diasDePeriodo({ periodo_desde: null, periodo_hasta: "2026-05-01" })).toBeNull();
  });

  it("acepta 30 frente a 31 días", () => {
    const e = periodosEquivalentes(con("2026-04-01", "2026-04-30"), con("2026-05-01", "2026-05-31"));
    expect(e.veredicto).toBe("equivalentes");
    expect(e.equivalentes).toBe(true);
    expect(e.motivo).toContain("30 y 31 días");
  });

  it("rechaza 30 frente a 90 días con el motivo", () => {
    const e = periodosEquivalentes(con("2026-04-01", "2026-04-30"), con("2026-05-01", "2026-07-29"));
    expect(e.veredicto).toBe("no_equivalentes");
    expect(e.equivalentes).toBe(false);
    expect(e.motivo).toMatch(/30 días frente a 90/);
  });

  it("sin período registrado no dice que sí: dice que no se puede saber, y quién no lo tiene", () => {
    const e = periodosEquivalentes(med("linea_base", "2026-05-01", { venta_mes: 1 }), con("2026-05-01", "2026-05-31"));
    expect(e.veredicto).toBe("sin_periodo");
    expect(e.equivalentes).toBe(false);
    expect(e.motivo).toContain("Punto de partida · versión 1");
  });

  it("avisa si cruzan temporadas distintas según las condiciones, aunque la longitud coincida", () => {
    const e = periodosEquivalentes(con("2026-04-01", "2026-04-30", { condiciones: { temporada: "normal" } }), con("2026-12-01", "2026-12-30", { condiciones: { temporada: "campaña navideña" } }));
    expect(e.equivalentes).toBe(true);
    expect(e.avisos[0]).toMatch(/temporadas distintas: «normal» frente a «campaña navideña»/);
    // Y como dato, no solo como aviso: es lo que rebaja la atribución.
    expect(e.temporadas).toEqual({ a: "normal", b: "campaña navideña" });
  });

  it("la misma temporada, o una sola registrada, no es «temporadas distintas»: de lo que falta no se deduce nada", () => {
    const abril = { periodo_desde: "2026-04-01", periodo_hasta: "2026-04-30" };
    expect(periodosEquivalentes(con(abril.periodo_desde, abril.periodo_hasta, { condiciones: { temporada: "Normal" } }), con("2026-05-01", "2026-05-31", { condiciones: { temporada: "normal " } })).temporadas).toBeNull();
    expect(periodosEquivalentes(con(abril.periodo_desde, abril.periodo_hasta, { condiciones: { temporada: "normal" } }), con("2026-05-01", "2026-05-31")).temporadas).toBeNull();
    expect(periodosEquivalentes(con(abril.periodo_desde, abril.periodo_hasta), con("2026-05-01", "2026-05-31")).avisos).toEqual([]);
  });

  it("una sola vara de duración, para el veredicto y para avisar antes de congelar", () => {
    expect(duracionesEquivalentes(30, 31)).toBe(true);
    expect(duracionesEquivalentes(30, 33)).toBe(true);
    expect(duracionesEquivalentes(30, 34)).toBe(false);
    expect(duracionesEquivalentes(30, 90)).toBe(false);
    expect(duracionesEquivalentes(0, 0)).toBe(false);
  });

  it("avisa de cada cambio de condiciones registrado, una sola vez", () => {
    const cambio = { que_cambio: "local nuevo en Gamarra", desde: "2026-05-10", efecto_esperado: "más ventas por más tráfico" };
    const e = periodosEquivalentes(con("2026-04-01", "2026-04-30", { condiciones: { cambios: [cambio] } }), con("2026-05-01", "2026-05-31", { condiciones: { cambios: [cambio] } }));
    expect(e.avisos).toHaveLength(1);
    expect(e.avisos[0]).toContain("local nuevo en Gamarra");
    expect(e.avisos[0]).toContain("10 may 2026");
  });
});

describe("las condiciones que entran por la API pasan por el esquema (medición y corte por igual)", () => {
  it("un cambio completo entra; la temporada puede ir sola", () => {
    expect(CondicionesZ.safeParse({ temporada: "campaña escolar", cambios: [{ que_cambio: "local nuevo", desde: "2026-03-01", efecto_esperado: "más tráfico" }] }).success).toBe(true);
    expect(CondicionesZ.safeParse({ temporada: "alta" }).success).toBe(true);
  });

  it("un cambio sin desde, sin efecto o con fecha que no es fecha se rechaza: no entra JSON arbitrario en la columna", () => {
    expect(CondicionesZ.safeParse({ cambios: [{ que_cambio: "local nuevo", efecto_esperado: "más tráfico" }] }).success).toBe(false);
    expect(CondicionesZ.safeParse({ cambios: [{ que_cambio: "local nuevo", desde: "2026-03-01" }] }).success).toBe(false);
    expect(CondicionesZ.safeParse({ cambios: [{ que_cambio: "local nuevo", desde: "marzo", efecto_esperado: "más tráfico" }] }).success).toBe(false);
    expect(CondicionesZ.safeParse({ cambios: "subió el precio" }).success).toBe(false);
  });
});

describe("registrarCondicion añade sin pisar", () => {
  const base = med("linea_base", "2026-05-01", { venta_mes: 1 });
  const primero = { que_cambio: "subió el precio del producto estrella", desde: "2026-06-01", efecto_esperado: "menos unidades, más margen" };

  it("guarda el cambio con su fecha de registro y conserva lo anterior", () => {
    const c1 = registrarCondicion({ condiciones: { temporada: "normal" } }, primero, new Date("2026-06-02T10:00:00Z"));
    expect(c1.temporada).toBe("normal");
    expect(c1.cambios).toHaveLength(1);
    expect(c1.cambios![0]).toMatchObject({ ...primero, registrado_at: "2026-06-02T10:00:00.000Z", registrado_por: null });
    const c2 = registrarCondicion({ condiciones: c1 }, { que_cambio: "local nuevo", desde: "2026-07-01", efecto_esperado: "más tráfico", afecta: ["venta_mes"], registrado_por: "u1" });
    expect(c2.cambios).toHaveLength(2);
    expect(c2.cambios![0]).toMatchObject(primero);
    expect(c2.cambios![1]).toMatchObject({ que_cambio: "local nuevo", afecta: ["venta_mes"], registrado_por: "u1" });
    // No muta lo que recibió.
    expect(c1.cambios).toHaveLength(1);
    expect(base.condiciones).toBeUndefined();
  });

  it("rechaza un cambio a medias: sin qué, sin desde o sin efecto esperado", () => {
    expect(() => registrarCondicion(base, { ...primero, que_cambio: "x" })).toThrow(/qué cambió/);
    expect(() => registrarCondicion(base, { ...primero, desde: "junio" })).toThrow(/desde cuándo/);
    expect(() => registrarCondicion(base, { ...primero, efecto_esperado: "" })).toThrow(/efecto/);
  });
});

describe("observado frente a atribuible", () => {
  const base = med("linea_base", "2026-05-01", { venta_mes: 40000, ganancia_mes: 4000, caja_hoy: 8000 });
  const corte: Medicion = { ...med("corte", "2026-08-01", { venta_mes: 48000, ganancia_mes: 4000 }, 1), linea_base_id: base.id };
  const movs = comparar(base, corte);
  const accion = (estado: string, fecha: string | null, clave: string | null = "venta_mes"): AccionLigada => ({ id: "a-" + estado, accion: "Vitrina y precios visibles", estado, clave, fecha_verificacion: fecha });
  const porClave = (lista: ReturnType<typeof atribucion>, clave: string) => lista.find((a) => a.clave === clave)!;

  it("con acción verificada antes del corte y sin condición registrada → atribuible, con la acción nombrada", () => {
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15")] }), "venta_mes");
    expect(a.atribuible).toBe("si");
    expect(a.observado).toMatch(/Subió de S\/40,000 a S\/48,000/);
    expect(a.motivo).toMatch(/Acción verificada «Vitrina y precios visibles» el 15 jul 2026, antes del corte/);
    expect(a.acciones_verificadas).toEqual(["Vitrina y precios visibles"]);
  });

  it("con acción verificada pero una condición registrada que lo explica → parcial, con el motivo", () => {
    const condiciones = { cambios: [{ que_cambio: "local nuevo en Gamarra", desde: "2026-07-01", efecto_esperado: "más ventas por más tráfico" }] };
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15")], condiciones }), "venta_mes");
    expect(a.atribuible).toBe("parcial");
    expect(a.motivo).toMatch(/también cambió «local nuevo en Gamarra» desde el 1 jul 2026/);
    expect(a.motivo).toMatch(/no se puede atribuir por completo/);
  });

  it("una condición que solo afecta a otro número no rebaja la atribución de este", () => {
    const condiciones = { cambios: [{ que_cambio: "préstamo nuevo", desde: "2026-07-01", efecto_esperado: "más caja, más deuda", afecta: ["caja_hoy", "deuda_propia"] }] };
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15")], condiciones }), "venta_mes");
    expect(a.atribuible).toBe("si");
  });

  it("con acción solo reportada → no atribuible: reportado no es verificado", () => {
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("reportado", null)] }), "venta_mes");
    expect(a.atribuible).toBe("no");
    expect(a.motivo).toMatch(/Observado, no atribuible/);
    expect(a.motivo).toMatch(/reportado no es verificado/);
  });

  it("una acción verificada DESPUÉS del corte, o sin fecha, no explica el corte", () => {
    expect(porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-08-20")] }), "venta_mes").atribuible).toBe("no");
    const sinFecha = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", null)] }), "venta_mes");
    expect(sinFecha.atribuible).toBe("no");
    expect(sinFecha.motivo).toMatch(/después del corte o sin fecha/);
  });

  it("sin ninguna acción ligada → observado, no atribuible, con motivo", () => {
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15", null)] }), "venta_mes");
    expect(a.atribuible).toBe("no");
    expect(a.motivo).toMatch(/ninguna acción verificada ligada a «.+» antes del corte/);
  });

  it("sin cambio no hay nada que atribuir; sin dato no hay resultado de ningún signo", () => {
    const lista = atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15", "ganancia_mes"), accion("verificado", "2026-07-15", "caja_hoy")] });
    expect(porClave(lista, "ganancia_mes")).toMatchObject({ atribuible: "no", motivo: "No hubo cambio: no hay nada que atribuir." });
    const caja = porClave(lista, "caja_hoy");
    expect(caja.delta).toBeNull();
    expect(caja.atribuible).toBe("no");
    expect(caja.motivo).toMatch(/Sin dato para comparar: no se midió en este corte/);
    expect(caja.motivo).not.toMatch(/0/);
  });

  it("temporadas distintas registradas («normal» frente a «campaña navideña») y acción verificada → como máximo parcial, nunca «si»", () => {
    const equivalencia = { veredicto: "equivalentes" as const, diasA: 30, diasB: 30, temporadas: { a: "normal", b: "campaña navideña" } };
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15")], equivalencia }), "venta_mes");
    expect(a.atribuible).toBe("parcial");
    expect(a.motivo).toMatch(/Hay acción verificada \(«Vitrina y precios visibles» el 15 jul 2026\) pero el punto de partida es de temporada «normal» y el corte de «campaña navideña»/);
    expect(a.motivo).toMatch(/puede ser de calendario/);
    expect(a.motivo).toMatch(/no se puede atribuir por completo/);
    expect(a.motivo).not.toMatch(/ninguna condición registrada explica/);
    // Sin temporadas distintas, la misma acción sí atribuye: la rebaja la causa la temporada y nada más.
    expect(porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15")], equivalencia: { ...equivalencia, temporadas: null } }), "venta_mes").atribuible).toBe("si");
  });

  it("temporadas distintas y además un cambio registrado → parcial, y el motivo nombra las dos cosas", () => {
    const condiciones = { cambios: [{ que_cambio: "local nuevo en Gamarra", desde: "2026-07-01", efecto_esperado: "más ventas por más tráfico" }] };
    const equivalencia = { veredicto: "equivalentes" as const, diasA: 30, diasB: 30, temporadas: { a: "normal", b: "campaña navideña" } };
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15")], condiciones, equivalencia }), "venta_mes");
    expect(a.atribuible).toBe("parcial");
    expect(a.motivo).toMatch(/también cambió «local nuevo en Gamarra» desde el 1 jul 2026 \(más ventas por más tráfico\) y además el punto de partida es de temporada «normal»/);
  });

  it("temporadas distintas sin acción verificada → sigue siendo «no», y la temporada se nombra", () => {
    const equivalencia = { veredicto: "equivalentes" as const, diasA: 30, diasB: 30, temporadas: { a: "normal", b: "campaña navideña" } };
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("reportado", null)], equivalencia }), "venta_mes");
    expect(a.atribuible).toBe("no");
    expect(a.motivo).toMatch(/reportado no es verificado; además el punto de partida es de temporada «normal» y el corte de «campaña navideña»/);
  });

  it("sin período registrado nada se adjudica, ni con acción verificada: no saber si miden el mismo tiempo no es saber que sí", () => {
    const a = porClave(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15")], equivalencia: { veredicto: "sin_periodo", diasA: null, diasB: null } }), "venta_mes");
    expect(a.atribuible).toBe("no");
    expect(a.motivo).toMatch(/Observado, no atribuible: falta registrar qué fechas cubre cada medición/);
    expect(a.motivo).toMatch(/Hay una acción verificada \(«Vitrina y precios visibles»\), pero sin ese dato el cambio no se le adjudica/);
    expect(a.acciones_verificadas).toEqual(["Vitrina y precios visibles"]);
    // Sin cambio y sin dato siguen diciendo lo suyo, no lo del período.
    const lista = atribucion({ corte, movimientos: movs, acciones: [], equivalencia: { veredicto: "sin_periodo", diasA: null, diasB: null } });
    expect(porClave(lista, "ganancia_mes").motivo).toBe("No hubo cambio: no hay nada que atribuir.");
    expect(porClave(lista, "caja_hoy").motivo).toMatch(/Sin dato para comparar/);
  });

  it("el resumen cuenta cada caso y cuántos tenían dato", () => {
    const r = resumenAtribucion(atribucion({ corte, movimientos: movs, acciones: [accion("verificado", "2026-07-15")] }));
    expect(r).toEqual({ si: 1, parcial: 0, no: 2, conDato: 2 });
  });

  it("ligarAcciones resuelve la clave por indicador_id; el «kpi» en texto libre no liga nada", () => {
    const ligadas = ligarAcciones(
      [{ id: "a1", accion: "Vitrina", estado: "verificado", indicador_id: "i1", fecha_verificacion: "2026-07-15" }, { id: "a2", accion: "Cobrar", estado: "reportado", indicador_id: null }, { id: "a3", accion: "Otro", estado: "verificado", indicador_id: "no-existe" }],
      [{ id: "i1", clave: "venta_mes" }]
    );
    expect(ligadas.map((l) => l.clave)).toEqual(["venta_mes", null, null]);
    expect(ligadas[0]!.fecha_verificacion).toBe("2026-07-15");
  });
});

// ---------------------------------------------------------------------------------------------
// LA LECTURA DEL DUEÑO, UNA SOLA PARA «TUS NÚMEROS» Y «TUS RESULTADOS» (remate L, 13-10-2026)
// ---------------------------------------------------------------------------------------------

/**
 * «Tus números» mostraba «El negocio deja S/X más al mes…» con los mismos datos con los que «Tus
 * resultados» avisaba de que los períodos no eran comparables. Las dos pantallas llaman ahora a
 * `lecturaDeCorte`; aquí se prueba lo que esa función le dice al dueño, sin pantalla.
 */
describe("lecturaDeCorte: lo que lee el dueño de un corte", () => {
  const abril = { periodo_desde: "2026-04-01", periodo_hasta: "2026-04-30" };
  const julio = { periodo_desde: "2026-07-01", periodo_hasta: "2026-07-31" };
  const base = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000, caja_hoy: 8000 }, abril);
  const corteCon = (extra: Partial<Medicion> = {}): Medicion => ({ ...med("corte", "2026-08-01", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1", ...extra });
  const verificada: AccionLigada = { id: "a1", accion: "Vitrina y precios visibles", estado: "verificado", clave: "ganancia_mes", fecha_verificacion: "2026-07-15" };
  const reportada: AccionLigada = { ...verificada, estado: "reportado", fecha_verificacion: null };
  const todoLoQueLee = (l: ReturnType<typeof lecturaDeCorte>) => [l.titular, l.periodos?.texto ?? "", l.lecturaAtribucion ?? "", l.avisoVersion ?? "", ...l.atribuciones.flatMap((a) => [a.observado, a.motivo, etiquetaAtribucion(a).etiqueta])].join(" ");

  it("períodos NO equivalentes (30 días frente a 90): el titular dice que no se puede comparar y por qué, no «deja S/2,000 más»", () => {
    const l = lecturaDeCorte({ corte: corteCon({ periodo_desde: "2026-05-01", periodo_hasta: "2026-07-29" }), mediciones: [base], acciones: [verificada] });
    expect(l.titular).toMatch(/no se puede comparar tal cual con tu punto de partida/);
    expect(l.titular).toContain("cubre 90 días");
    expect(l.titular).toContain("tu punto de partida, 30");
    expect(l.titular).not.toMatch(/más al mes/);
    expect(l.esResultado, "la pantalla no pinta «mejoraron / empeoraron»").toBe(false);
    expect(l.periodos).toMatchObject({ veredicto: "no_equivalentes" });
    expect(l.periodos!.texto).toMatch(/de calendario, no de gestión/);
    // Los números se siguen mostrando: lo observado es un hecho.
    expect(l.atribuciones.find((a) => a.clave === "ganancia_mes")!.observado).toMatch(/Subió de S\/4,000 a S\/6,000/);
  });

  it("y con períodos no equivalentes nada se adjudica, ni siquiera con acción verificada", () => {
    const l = lecturaDeCorte({ corte: corteCon({ periodo_desde: "2026-05-01", periodo_hasta: "2026-07-29" }), mediciones: [base], acciones: [verificada] });
    expect(l.cuenta).toMatchObject({ movidos: 2, si: 0, parcial: 0, observados: 2 });
    expect(l.atribuciones.every((a) => a.atribuible === "no")).toBe(true);
    expect(l.atribuciones.find((a) => a.clave === "ganancia_mes")!.motivo).toMatch(/no miden el mismo tiempo \(90 días frente a 30\)/);
    expect(l.lecturaAtribucion).toMatch(/queda como observado/);
    expect(todoLoQueLee(l)).not.toMatch(/Se debe al trabajo|se puede atribuir/);
    // La misma regla en la función que usa el panel del consultor: sin el veredicto de períodos sí atribuía.
    const movs = comparar(base, corteCon(), [base]);
    expect(atribucion({ corte: corteCon(), movimientos: movs, acciones: [verificada] }).find((a) => a.clave === "ganancia_mes")!.atribuible).toBe("si");
    expect(atribucion({ corte: corteCon(), movimientos: movs, acciones: [verificada], equivalencia: { veredicto: "no_equivalentes", diasA: 30, diasB: 90 } }).find((a) => a.clave === "ganancia_mes")!.atribuible).toBe("no");
  });

  it("períodos equivalentes y solo una acción reportada: el titular observa, y se dice que no se puede atribuir", () => {
    const l = lecturaDeCorte({ corte: corteCon(julio), mediciones: [base], acciones: [reportada] });
    expect(l.titular).toContain("S/2,000 más al mes");
    expect(l.esResultado).toBe(true);
    expect(l.periodos).toEqual({ veredicto: "equivalentes", texto: "Períodos comparables: 30 y 31 días." });
    expect(l.lecturaAtribucion).toMatch(/lo vimos en tus números, pero no podemos decir que fue por el trabajo que hicimos/);
    expect(l.lecturaAtribucion).toContain("De 2 números que se movieron, 0 se deben al trabajo que hicimos, 0 en parte y 2 solo se observaron.");
    expect(l.lecturaAtribucion).not.toMatch(/se puede atribuir/);
    expect(l.atribuciones.find((a) => a.clave === "ganancia_mes")!.motivo).toMatch(/reportado no es verificado/);
  });

  it("con acción verificada antes del corte, ligada a ese número, y nada más que lo explique: entonces sí se atribuye", () => {
    const l = lecturaDeCorte({ corte: corteCon(julio), mediciones: [base], acciones: [verificada] });
    expect(l.titular).toContain("S/2,000 más al mes");
    expect(l.lecturaAtribucion).toMatch(/se puede atribuir al trabajo que hicimos: hay una acción comprobada/);
    expect(l.lecturaAtribucion).toContain("De 2 números que se movieron, 1 se debe al trabajo que hicimos, 0 en parte y 1 solo se observó.");
    expect(etiquetaAtribucion(l.atribuciones.find((a) => a.clave === "ganancia_mes")!)).toEqual({ etiqueta: "Se debe al trabajo que hicimos", tono: "atribuible" });
    // La venta también subió, pero la acción no apuntaba a ella: observada, no atribuida.
    expect(etiquetaAtribucion(l.atribuciones.find((a) => a.clave === "venta_mes")!).tono).toBe("neutro");
  });

  it("acción verificada y además un cambio de condiciones registrado: en parte, y el cambio se nombra", () => {
    const cambio = { que_cambio: "local nuevo en Gamarra", desde: "2026-07-01", efecto_esperado: "más ventas por más tráfico" };
    const l = lecturaDeCorte({ corte: corteCon({ ...julio, condiciones: { cambios: [cambio] } }), mediciones: [base], acciones: [verificada] });
    expect(l.lecturaAtribucion).toMatch(/en parte al trabajo que hicimos y en parte a otra cosa/);
    expect(l.lecturaAtribucion).not.toMatch(/se puede atribuir/);
    expect(l.periodos!.texto).toContain("local nuevo en Gamarra");
    expect(l.cuenta).toMatchObject({ si: 0, parcial: 1 });
  });

  it("sin período registrado no afirma que sean comparables: lo dice y lo deja como orientación", () => {
    const l = lecturaDeCorte({ corte: corteCon(), mediciones: [base], acciones: [] });
    expect(l.periodos!.veredicto).toBe("sin_periodo");
    expect(l.periodos!.texto).toMatch(/No sabemos si los períodos son comparables/);
    expect(l.periodos!.texto).toMatch(/orientación, no como veredicto/);
    // ESTA AFIRMACIÓN CAMBIÓ A PROPÓSITO (13-10-2026). Antes decía `toContain("más al mes")`: fijaba como
    // correcto justo lo que el verificador señaló, que con el período sin registrar el dueño leyera «El negocio
    // deja S/2,000 más al mes…» con la reserva en letra chica. Ninguna pantalla mandaba el período de un corte,
    // así que ese era el único camino que la interfaz producía. La reserva va ahora dentro del titular.
    expect(l.titular).not.toMatch(/más al mes/);
    expect(l.titular).toBe("Todavía no podemos decirte si el negocio mejoró: falta anotar de qué fechas son los números de este corte.");
  });

  it("SIN PERÍODO NO ES UN RESULTADO: no se pinta «mejoraron», y con acción verificada tampoco se atribuye", () => {
    // Lo que producía el producto: el punto de partida con sus fechas, el corte sin ellas, una acción verificada.
    const l = lecturaDeCorte({ corte: corteCon(), mediciones: [base], acciones: [verificada] });
    expect(l.esResultado, "la pantalla no pinta «mejoraron / empeoraron»").toBe(false);
    expect(l.cuenta).toMatchObject({ movidos: 2, si: 0, parcial: 0, observados: 2 });
    expect(l.atribuciones.every((a) => a.atribuible === "no")).toBe(true);
    expect(l.lecturaAtribucion).toBe("Mientras no sepamos qué fechas cubre cada medición, lo que se movió queda como observado: no se le atribuye al trabajo ni a ninguna otra cosa.");
    expect(todoLoQueLee(l)).not.toMatch(/Se debe al trabajo|se puede atribuir|más al mes/);
    // Lo observado se sigue mostrando: es un hecho.
    expect(l.atribuciones.find((a) => a.clave === "ganancia_mes")!.observado).toMatch(/Subió de S\/4,000 a S\/6,000/);
    expect(etiquetaAtribucion(l.atribuciones.find((a) => a.clave === "ganancia_mes")!).tono).toBe("neutro");
  });

  it("sin período: el titular dice A QUIÉN le falta (al punto de partida, al corte o a los dos)", () => {
    const baseSinFechas = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000 });
    const soloBase = lecturaDeCorte({ corte: corteCon(julio), mediciones: [baseSinFechas], acciones: [verificada] });
    expect(soloBase.titular).toBe("Todavía no podemos decirte si el negocio mejoró: falta anotar de qué fechas son los números de tu punto de partida.");
    expect(soloBase.esResultado).toBe(false);
    expect(soloBase.cuenta.si).toBe(0);
    const los2 = lecturaDeCorte({ corte: corteCon(), mediciones: [baseSinFechas], acciones: [verificada] });
    expect(los2.titular).toBe("Todavía no podemos decirte si el negocio mejoró: falta anotar de qué fechas son los números de tu punto de partida y los de este corte.");
    // Un período al revés no es un período.
    const alReves = lecturaDeCorte({ corte: corteCon({ periodo_desde: "2026-07-31", periodo_hasta: "2026-07-01" }), mediciones: [base], acciones: [] });
    expect(alReves.periodos!.veredicto).toBe("sin_periodo");
    expect(alReves.titular).toMatch(/los números de este corte\.$/);
  });

  it("sin período y sin ningún número en común: manda lo más básico, que no hay nada que comparar", () => {
    const l = lecturaDeCorte({ corte: corteCon({ valores: { caja_hoy: 9000 } }), mediciones: [version(1, "b1", { venta_mes: 40000 }, abril)], acciones: [] });
    expect(l.movimientos.map((x) => x.delta)).toEqual([null, null]);
    expect(l.titular).toBe("No se midió ningún número en común: no se puede decir si mejoró o no.");
    expect(l.esResultado).toBe(false);
    expect(l.lecturaAtribucion).toBeNull();
    const vacio = lecturaDeCorte({ corte: corteCon({ valores: {} }), mediciones: [version(1, "b1", {}, abril)], acciones: [] });
    expect(vacio.titular).toBe("No se midió ningún número en común: no se puede decir si mejoró o no.");
    expect(vacio.esResultado).toBe(false);
  });

  it("temporadas distintas registradas y acción verificada: en parte, se nombra la temporada y no se dice «nada más lo explica»", () => {
    const baseNormal = { ...base, condiciones: { temporada: "normal" } };
    const l = lecturaDeCorte({ corte: corteCon({ ...julio, condiciones: { temporada: "campaña navideña" } }), mediciones: [baseNormal], acciones: [verificada] });
    expect(l.esResultado).toBe(true);
    expect(l.cuenta).toMatchObject({ si: 0, parcial: 1 });
    expect(l.atribuciones.find((a) => a.clave === "ganancia_mes")!.atribuible).toBe("parcial");
    expect(l.lecturaAtribucion).toContain("Ese cambio en lo que te queda se debe en parte al trabajo que hicimos y en parte a otra cosa: la temporada no es la misma («normal» en tu punto de partida, «campaña navideña» en este corte).");
    expect(todoLoQueLee(l)).not.toMatch(/nada más de lo registrado lo explica|se puede atribuir al trabajo|Se debe al trabajo que hicimos/);
    expect(l.periodos!.texto).toMatch(/La diferencia puede ser de calendario/);
    // Con un cambio registrado además de la temporada, se dicen las dos.
    const cambio = { que_cambio: "local nuevo en Gamarra", desde: "2026-07-01", efecto_esperado: "más ventas por más tráfico" };
    const l2 = lecturaDeCorte({ corte: corteCon({ ...julio, condiciones: { temporada: "campaña navideña", cambios: [cambio] } }), mediciones: [baseNormal], acciones: [verificada] });
    expect(l2.lecturaAtribucion).toContain("en parte a otra cosa que cambió en el negocio; además, la temporada no es la misma");
  });

  it("la voz del consultor: la misma decisión con «el punto de partida», para que su panel no diga otra cosa que el portal", () => {
    const noEq = { corte: corteCon({ periodo_desde: "2026-05-01", periodo_hasta: "2026-07-29" }), mediciones: [base], acciones: [verificada] };
    const dueno = lecturaDeCorte(noEq);
    const consultor = lecturaDeCorte({ ...noEq, para: "consultor" });
    expect(consultor.titular).toBe("Este corte no se puede comparar tal cual con el punto de partida: cubre 90 días y el punto de partida, 30.");
    expect(consultor.titular).not.toMatch(/más al mes|\btu\b/);
    expect(consultor.esResultado).toBe(dueno.esResultado);
    expect(consultor.cuenta).toEqual(dueno.cuenta);
    expect(consultor.atribuciones).toEqual(dueno.atribuciones);
    const sinFechas = lecturaDeCorte({ corte: corteCon(), mediciones: [base], acciones: [verificada], para: "consultor" });
    expect(sinFechas.titular).toBe("Todavía no se puede decir si el negocio mejoró: falta registrar el período de este corte.");
    expect(sinFechas.esResultado).toBe(false);
    // Y los avisos de versión, en su voz.
    const huerfano: Medicion = { ...med("corte", "2026-03-15", { venta_mes: 39000 }, 1), id: "c0", linea_base_id: null, hash_contenido: "a1b2c3" };
    expect(lecturaDeCorte({ corte: huerfano, mediciones: [base], acciones: [], para: "consultor" }).noComparable).toBe(textoSinVersion("sin_punto_de_partida", "consultor"));
    const viejo = med("corte", "2026-07-01", { venta_mes: 45000 }, 9);
    expect(lecturaDeCorte({ corte: viejo, mediciones: [base], acciones: [], para: "consultor" }).avisoVersion).toBe(textoSinVersion("anterior_al_versionado", "consultor"));
  });

  it("la cuenta cuadra: lo que se movió = atribuido + en parte + observado; sin dato y sin cambio van aparte", () => {
    const l = lecturaDeCorte({ corte: corteCon({ ...julio, valores: { venta_mes: 48000, ganancia_mes: 4000 } }), mediciones: [base], acciones: [verificada] });
    expect(l.cuenta).toEqual({ movidos: 1, si: 0, parcial: 0, observados: 1, sinCambio: 1, sinDato: 1 });
    expect(l.cuenta.si + l.cuenta.parcial + l.cuenta.observados).toBe(l.cuenta.movidos);
    expect(cuentaAtribucion(l.atribuciones)).toEqual(l.cuenta);
    // resumenAtribucion mezclaba los tres últimos en «no»: 3 «solo observados» de 2 con dato no sumaba.
    expect(resumenAtribucion(l.atribuciones)).toMatchObject({ no: 3, conDato: 2 });
    expect(l.lecturaAtribucion).toBe("De 1 número que se movió, 0 se deben al trabajo que hicimos, 0 en parte y 1 solo se observó.");
  });

  it("se compara con SU versión del punto de partida, no con la que rige hoy", () => {
    const v1 = { ...base, vigente: false };
    const v2 = version(2, "b2", { venta_mes: 41000, ganancia_mes: 5500 }, { ...abril, reemplaza_a: "b1", motivo_version: "costos completos tras conciliar" });
    const l = lecturaDeCorte({ corte: corteCon(julio), mediciones: [v1, v2], acciones: [] });
    expect(l.base?.id).toBe("b1");
    expect(l.registrada).toBe(true);
    expect(l.titular).toContain("S/2,000 más al mes");
    expect(l.avisoVersion).toBeNull();
  });

  it("un corte registrado cuando no había punto de partida no se compara con uno fijado después", () => {
    const huerfano: Medicion = { ...med("corte", "2026-03-15", { venta_mes: 39000 }, 1), id: "c0", linea_base_id: null, hash_contenido: "a1b2c3" };
    const l = lecturaDeCorte({ corte: huerfano, mediciones: [base], acciones: [verificada] });
    expect(l.noComparable).toMatch(/todavía no había punto de partida/);
    expect(l.titular).toBe(l.noComparable);
    expect(l).toMatchObject({ base: null, esResultado: false, periodos: null, lecturaAtribucion: null, atribuciones: [], movimientos: [] });
  });

  it("un corte anterior al versionado se compara con la vigente y avisa de que no quedó registro", () => {
    const viejo = med("corte", "2026-07-01", { venta_mes: 45000 }, 9);
    const l = lecturaDeCorte({ corte: viejo, mediciones: [base], acciones: [] });
    expect(l.base?.id).toBe("b1");
    expect(l.registrada).toBe(false);
    expect(l.avisoVersion).toMatch(/anterior a que guardáramos las versiones/);
    expect(l.noComparable).toBeNull();
  });

  it("nada de lo que lee el dueño dice «gracias a» ni enseña una clave técnica, en ningún caso", () => {
    const casos = [
      lecturaDeCorte({ corte: corteCon(julio), mediciones: [base], acciones: [verificada] }),
      lecturaDeCorte({ corte: corteCon(julio), mediciones: [base], acciones: [reportada] }),
      lecturaDeCorte({ corte: corteCon({ periodo_desde: "2026-05-01", periodo_hasta: "2026-07-29" }), mediciones: [base], acciones: [verificada] }),
      lecturaDeCorte({ corte: corteCon(), mediciones: [base], acciones: [] }),
      lecturaDeCorte({ corte: corteCon(), mediciones: [base], acciones: [verificada] }),
      lecturaDeCorte({ corte: corteCon({ ...julio, condiciones: { temporada: "campaña navideña" } }), mediciones: [{ ...base, condiciones: { temporada: "normal" } }], acciones: [verificada] }),
    ];
    for (const l of casos) {
      expect(todoLoQueLee(l)).not.toMatch(/gracias a/i);
      expect(todoLoQueLee(l)).not.toMatch(/[a-z]_[a-z]|linea_base|hash/);
    }
  });

  it("las etiquetas por número y las condiciones juntas son las mismas para las dos pantallas", () => {
    expect(etiquetaAtribucion({ delta: null, atribuible: "no" })).toEqual({ etiqueta: "Sin dato para comparar", tono: "neutro" });
    expect(etiquetaAtribucion({ delta: 0, atribuible: "no" })).toEqual({ etiqueta: "Sin cambio", tono: "neutro" });
    expect(etiquetaAtribucion({ delta: 5, atribuible: "parcial" })).toEqual({ etiqueta: "En parte por el trabajo, en parte por otra cosa", tono: "parcial" });
    expect(etiquetaAtribucion({ delta: -5, atribuible: "no" })).toEqual({ etiqueta: "Lo vimos, pero no podemos decir que fue por el trabajo", tono: "neutro" });
    const a = { que_cambio: "subió el precio", desde: "2026-06-01", efecto_esperado: "más margen" };
    const b = { que_cambio: "local nuevo", desde: "2026-07-01", efecto_esperado: "más tráfico" };
    const juntas = condicionesDe({ ...base, condiciones: { temporada: "normal", cambios: [a] } }, corteCon({ condiciones: { temporada: "campaña escolar", cambios: [b] } }));
    expect(juntas).toEqual({ temporada: "campaña escolar", cambios: [a, b] });
    expect(condicionesDe(null, null)).toEqual({ temporada: null, cambios: [] });
  });
});

// ---------------------------------------------------------------------------------------------
// EL PERÍODO QUE «TUS NÚMEROS» PIDE ANTES DE CONGELAR (lógica pura; la pantalla solo la pinta)
// ---------------------------------------------------------------------------------------------

describe("el período que se pide al congelar", () => {
  it("el día de hoy se toma en hora de Lima, no en la del servidor", () => {
    // 13 de octubre a las 02:00 UTC son todavía las 21:00 del 12 en Lima.
    expect(diaEnZona(new Date("2026-10-13T02:00:00Z"))).toBe("2026-10-12");
    expect(diaEnZona(new Date("2026-10-13T12:00:00Z"))).toBe("2026-10-13");
    expect(diaEnZona(new Date("2026-10-13T02:00:00Z"), "UTC")).toBe("2026-10-13");
  });

  it("el mes pasado va del primer día al último, también en enero y en febrero", () => {
    expect(mesCerradoAnterior("2026-10-13")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(mesCerradoAnterior("2026-01-05")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
    expect(mesCerradoAnterior("2026-03-31")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(mesCerradoAnterior("2028-03-01")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
    expect(mesCerradoAnterior("ayer")).toBeNull();
    expect(mesCerradoAnterior(null)).toBeNull();
    // Y dura lo que dura un mes: comparable con otro mes.
    const p = mesCerradoAnterior("2026-10-13")!;
    expect(diasDePeriodo({ periodo_desde: p.desde, periodo_hasta: p.hasta })).toBe(30);
  });

  it("sin las dos fechas, al revés o en el futuro no se congela, y se dice por qué en palabras del dueño", () => {
    expect(faltaEnPeriodo("", "")).toMatch(/Faltan las fechas/);
    expect(faltaEnPeriodo("2026-09-01", "")).toMatch(/Faltan las fechas/);
    expect(faltaEnPeriodo(null, "2026-09-30")).toMatch(/Faltan las fechas/);
    expect(faltaEnPeriodo("setiembre", "2026-09-30")).toMatch(/no es una fecha/);
    expect(faltaEnPeriodo("2026-09-30", "2026-09-01")).toMatch(/al revés/);
    expect(faltaEnPeriodo("2026-10-01", "2026-10-31", "2026-10-13")).toMatch(/todavía no llega/);
    expect(faltaEnPeriodo("2026-09-01", "2026-09-30", "2026-10-13")).toBeNull();
    expect(faltaEnPeriodo("2026-10-01", "2026-10-13", "2026-10-13"), "hasta hoy mismo vale").toBeNull();
    expect(faltaEnPeriodo("2026-09-01", "2026-09-30"), "sin saber qué día es hoy no se inventa el límite").toBeNull();
    for (const t of [faltaEnPeriodo("", ""), faltaEnPeriodo("2026-09-30", "2026-09-01"), faltaEnPeriodo("2026-10-01", "2026-10-31", "2026-10-13")]) expect(t).not.toMatch(/_|periodo_|AAAA/);
  });

  it("lo que la pantalla manda al congelar lleva el período entero, o no se manda nada", () => {
    expect(pedidoDeMedicion("corte", "2026-09-01", "2026-09-30", "2026-10-13")).toEqual({ tipo: "corte", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(pedidoDeMedicion("linea_base", "2026-09-01", "2026-09-30")).toEqual({ tipo: "linea_base", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(pedidoDeMedicion("corte", "", "")).toBeNull();
    expect(pedidoDeMedicion("corte", "2026-09-01", "")).toBeNull();
    expect(pedidoDeMedicion("corte", "2026-09-30", "2026-09-01")).toBeNull();
    expect(pedidoDeMedicion("corte", "2026-10-01", "2026-10-31", "2026-10-13")).toBeNull();
  });

  it("un corte congelado con el período que pide la pantalla SÍ se lee como resultado", () => {
    // El recorrido entero: el dueño fija su punto de partida con «el mes pasado» y un mes después registra un corte igual.
    const pBase = mesCerradoAnterior("2026-09-10")!;
    const pCorte = mesCerradoAnterior("2026-10-13")!;
    const b = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000 }, { periodo_desde: pBase.desde, periodo_hasta: pBase.hasta });
    const c: Medicion = { ...med("corte", "2026-10-13", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1", periodo_desde: pCorte.desde, periodo_hasta: pCorte.hasta };
    const l = lecturaDeCorte({ corte: c, mediciones: [b], acciones: [] });
    expect(l.periodos).toEqual({ veredicto: "equivalentes", texto: "Períodos comparables: 31 y 30 días." });
    expect(l.esResultado).toBe(true);
    expect(l.titular).toContain("S/2,000 más al mes");
  });
});

// ---------------------------------------------------------------------------------------------
// LO QUE SE PINTA: LAS TRES PANTALLAS, RENDERIZADAS A TEXTO CON LA MISMA MEDICIÓN
// ---------------------------------------------------------------------------------------------

/**
 * El verificador encontró el defecto renderizando, no leyendo la función: la regla estaba bien y la pantalla
 * seguía diciendo «El negocio deja S/2,000 más al mes…». Aquí se pintan «Tus números» (Avance), «Tus
 * resultados» (ComoVamos) y el panel del consultor con los MISMOS datos y se lee lo que sale. No hay
 * navegador: es el HTML del servidor, que es lo que el dueño ve antes de tocar nada.
 */
describe("renderizado: dueño y consultor leen lo mismo de un mismo corte", () => {
  const EMP = "0000000a-0000-4000-8000-00000000000a";
  const abril = { periodo_desde: "2026-04-01", periodo_hasta: "2026-04-30" };
  const julio = { periodo_desde: "2026-07-01", periodo_hasta: "2026-07-31" };
  const base = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000 }, abril);
  const corteCon = (extra: Partial<Medicion> = {}): Medicion => ({ ...med("corte", "2026-08-01", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1", ...extra });
  const verificada: AccionLigada = { id: "a1", accion: "Vitrina y precios visibles", estado: "verificado", clave: "ganancia_mes", fecha_verificacion: "2026-07-15" };
  const limpio = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");
  const HOY = "2026-10-13";

  const avance = (corte: Medicion, b: Medicion = base, acciones: AccionLigada[] = [verificada]) =>
    limpio(renderToStaticMarkup(createElement(Avance, {
      companyId: EMP, base: b, ultimoCorte: corte, cortes: [corte], numerosListos: 6, hoy: HOY, mesPasado: mesCerradoAnterior(HOY),
      lectura: lecturaDeCorte({ corte, mediciones: [b], acciones }),
    })));
  const comoVamos = (corte: Medicion, b: Medicion = base, acciones: AccionLigada[] = [verificada]) =>
    limpio(renderToStaticMarkup(createElement(ComoVamos, { companyId: EMP, mediciones: [b, corte], actas: [], acciones, puedeAceptar: true })));
  const panel = (corte: Medicion, b: Medicion = base, acciones: AccionLigada[] = [verificada]) =>
    limpio(renderToStaticMarkup(createElement(PanelMediciones, { companyId: EMP, mediciones: [b, corte], actas: [], acciones, numerosListos: 6 })));
  /**
   * Lo que ninguna pantalla puede decir cuando la comparación no es un resultado. «Ese cambio en lo que te
   * queda se puede atribuir…» es la frase causal; la introducción de «Tus resultados» («qué parte se puede
   * atribuir al trabajo que hicimos juntos») explica la pantalla y no afirma nada, por eso no se busca suelta.
   */
  const VEREDICTO = /más al mes|menos al mes|\d+ mejoraron|>mejoraron<|>empeoraron<|Se debe al trabajo|Ese cambio en lo que te queda se puede atribuir|\d atribuibles? al trabajo \(acción verificada\), 0 en parte, 0/;

  it("CORTE SIN PERÍODO (lo que el producto producía) con acción verificada: ninguna de las tres pantallas da un veredicto", () => {
    const corte = corteCon();
    const a = avance(corte);
    expect(a).toContain("Todavía no podemos decirte si el negocio mejoró: falta anotar de qué fechas son los números de este corte.");
    expect(a).not.toMatch(/más al mes|>mejoraron<|>empeoraron<|Se debe al trabajo|Ese cambio en lo que te queda se puede atribuir/);
    expect(a).toContain("Lo que cambió en tus números, sin sacar conclusiones todavía.");
    expect(a).toContain("Lo vimos, pero no podemos decir que fue por el trabajo");
    expect(a, "lo observado se sigue mostrando").toContain("Subió de S/4,000 a S/6,000");

    const r = comoVamos(corte);
    expect(r).toContain("Todavía no podemos decirte si el negocio mejoró: falta anotar de qué fechas son los números de este corte.");
    expect(r).not.toMatch(/más al mes|Se debe al trabajo|Ese cambio en lo que te queda se puede atribuir/);

    const p = panel(corte);
    expect(p).toContain("Todavía no se puede decir si el negocio mejoró: falta registrar el período de este corte.");
    expect(p).toContain("lo que se movió queda como observado, sin veredicto");
    expect(p).not.toMatch(/más al mes|\d+ mejoraron|ATRIBUIBLE</);
    expect(p).toContain("0 atribuibles al trabajo (acción verificada), 0 en parte, 2 solo observados");
    expect(p).toContain("No se puede saber si los períodos son equivalentes: Corte 1 no tiene período registrado.");
  });

  it("PERÍODOS NO EQUIVALENTES (30 días frente a 90): el panel del consultor ya no titula «deja S/2,000 más» ni «2 mejoraron»", () => {
    const corte = corteCon({ periodo_desde: "2026-05-01", periodo_hasta: "2026-07-29" });
    const p = panel(corte);
    expect(p).toContain("Este corte no se puede comparar tal cual con el punto de partida: cubre 90 días y el punto de partida, 30.");
    expect(p).toContain("Períodos no equivalentes: 30 días frente a 90. La comparación directa no vale.");
    expect(p).not.toMatch(/más al mes|\d+ mejoraron|ATRIBUIBLE</);
    expect(p).toContain("SOLO OBSERVADO");
    // Y el dueño lee lo mismo, en su voz, en sus dos pantallas.
    for (const html of [avance(corte), comoVamos(corte)]) {
      expect(html).toContain("Este corte no se puede comparar tal cual con tu punto de partida: cubre 90 días y tu punto de partida, 30.");
      expect(html).not.toMatch(VEREDICTO);
    }
  });

  it("PERÍODOS EQUIVALENTES y acción verificada: ahí sí, las tres dicen el resultado y lo atribuyen", () => {
    const corte = corteCon(julio);
    const a = avance(corte);
    expect(a).toContain("El negocio deja S/2,000 más al mes que cuando empezamos.");
    expect(a).toMatch(/>2<\/p><p[^>]*>mejoraron</);
    expect(a).toContain("Se debe al trabajo que hicimos");
    expect(a).toContain("Períodos comparables: 30 y 31 días.");
    const p = panel(corte);
    expect(p).toContain("El negocio deja S/2,000 más al mes que cuando empezamos.");
    expect(p).toContain("2 mejoraron, 0 empeoraron");
    expect(p).toContain("1 atribuible al trabajo (acción verificada), 0 en parte, 1 solo observado");
    expect(comoVamos(corte)).toContain("El negocio deja S/2,000 más al mes que cuando empezamos.");
  });

  it("TEMPORADAS DISTINTAS con acción verificada: «en parte» en las tres, nunca «se debe al trabajo»", () => {
    const b = { ...base, condiciones: { temporada: "normal" } };
    const corte = corteCon({ ...julio, condiciones: { temporada: "campaña navideña" } });
    for (const html of [avance(corte, b), comoVamos(corte, b)]) {
      expect(html).toContain("En parte por el trabajo, en parte por otra cosa");
      expect(html).toContain("la temporada no es la misma («normal» en tu punto de partida, «campaña navideña» en este corte)");
      expect(html).not.toMatch(/Se debe al trabajo que hicimos|nada más de lo registrado lo explica/);
    }
    const p = panel(corte, b);
    expect(p).toContain("0 atribuibles al trabajo (acción verificada), 1 en parte, 1 solo observado");
    expect(p).toContain("EN PARTE");
    expect(p).not.toMatch(/ATRIBUIBLE</);
  });

  it("las fechas son días: un corte del 1 de agosto sale «1 ago 2026» en «Tus números», igual que en «Tus resultados»", () => {
    const corte = corteCon(julio);
    const a = avance(corte);
    expect(a).toContain("Corte 1 del 1 ago 2026, medido contra la versión 1 de tu punto de partida (1 may 2026)");
    expect(a).not.toMatch(/31 jul|30 abr/);
    expect(comoVamos(corte)).toContain("Corte 1 · 1 ago 2026");
  });

  it("«Tus números» pide el período antes de congelar: cajas vacías, el mes pasado a un toque y el botón apagado hasta elegir", () => {
    const sinBase = limpio(renderToStaticMarkup(createElement(Avance, { companyId: EMP, base: null, ultimoCorte: null, cortes: [], numerosListos: 6, hoy: HOY, mesPasado: mesCerradoAnterior(HOY) })));
    const sinCorte = limpio(renderToStaticMarkup(createElement(Avance, { companyId: EMP, base, ultimoCorte: null, cortes: [], numerosListos: 6, hoy: HOY, mesPasado: mesCerradoAnterior(HOY) })));
    const conCorte = avance(corteCon(julio));
    for (const [html, boton] of [[sinBase, "Fijar mi punto de partida"], [sinCorte, "Registrar un corte ahora"], [conCorte, "Registrar un corte nuevo"]] as const) {
      expect(html).toContain("¿De qué fechas son estos números?");
      expect(html).toContain("Son del mes pasado: del 1 sep 2026 al 30 sep 2026");
      // Las dos cajas nacen vacías: el mes pasado se ofrece fuera de ellas, no se da por contestado.
      const cajas = html.match(/<input[^>]*type="date"[^>]*>/g) ?? [];
      expect(cajas).toHaveLength(2);
      for (const caja of cajas) {
        expect(caja).toContain('value=""');
        expect(caja).toContain('max="2026-10-13"');
        expect(caja).not.toContain("placeholder");
      }
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${boton}</button>`));
      expect(html).toContain("Elige primero de qué fechas son tus números.");
    }
    // El punto de partida dice de qué fechas es, o que no quedó anotado.
    expect(sinCorte).toContain("Son los números del 1 abr 2026 al 30 abr 2026.");
    const sinFechas = limpio(renderToStaticMarkup(createElement(Avance, { companyId: EMP, base: version(1, "b1", { venta_mes: 1 }), ultimoCorte: null, cortes: [], numerosListos: 6 })));
    expect(sinFechas).toContain("No quedó anotado de qué fechas son esos números.");
    // Sin sugerencia (no se supo el día de hoy) siguen las dos cajas, sin el botón del mes pasado.
    expect(sinFechas).not.toContain("Son del mes pasado");
    expect(sinFechas).toContain("Desde el día");
  });

  it("con menos de 5 números no se pide período ni se ofrece fijar nada", () => {
    const html = limpio(renderToStaticMarkup(createElement(Avance, { companyId: EMP, base: null, ultimoCorte: null, cortes: [], numerosListos: 3, hoy: HOY, mesPasado: mesCerradoAnterior(HOY) })));
    expect(html).toContain("Con 3 de 9 números la foto saldría en blanco.");
    expect(html).not.toContain("¿De qué fechas son estos números?");
    expect(html).not.toContain("<button");
  });
});

// ---------------------------------------------------------------------------------------------
// EL CORTE QUE REGISTRA EL CONSULTOR (api/companies/[id]/close) — con dobles, sin base
// ---------------------------------------------------------------------------------------------

/**
 * Un corte con números es una medición, y una medición sin punto de partida vigente no tiene contra qué
 * compararse: la ruta lo rechaza con 409 antes de escribir nada. Lo que hace la función de base
 * (`congelar_medicion`) lo prueba tests/sql/medicion-versiones.test.ts sobre Postgres embebido; aquí se
 * prueba la decisión de la ruta, con `supabaseAdmin()` doblado en memoria.
 */
describe("registrar un corte desde el plan: sin punto de partida vigente no nace ninguna medición (con dobles)", () => {
  const EMP = "0000000a-0000-4000-8000-00000000000a";
  const CONSULTORA: Perfil = { id: "22222222-2222-4222-8222-222222222222", email: "consultora@ejemplo.test", nombre: "Consultora", rol: "consultor", autoridad: ["cerrar_medicion"] };
  const NUMEROS: [string, number][] = [["venta_mes", 45000], ["ganancia_mes", 4500], ["caja_hoy", 8000], ["gasto_fijo_mes", 12000], ["deuda_propia", 20000], ["deuda_clientes", 3000]];
  const numeros = (n: number): Fila[] => NUMEROS.slice(0, n).map(([clave, valor]) => ({ company_id: EMP, clave, periodo: "actual", valor, estado: "contado" }));
  const baseVigente = (): Fila => ({ id: "b2", company_id: EMP, tipo: "linea_base", numero: 0, fecha: "2026-09-01", valores: { venta_mes: 40000 }, derivados: {}, nota: null, version: 2, vigente: true });

  const registrarCorte = async (corte: Fila) => {
    const { POST } = await import("@/app/api/companies/[id]/close/route");
    const res = await POST(
      new Request(`http://8x.test/api/companies/${EMP}/close`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ corte }) }),
      { params: Promise.resolve({ id: EMP }) }
    );
    return { status: res.status, cuerpo: (await res.json()) as Fila };
  };

  beforeEach(() => {
    doble.tablas = { company_metricas: numeros(6), mediciones: [], checkpoints: [] };
    doble.escrituras.length = 0;
    doble.rpc.length = 0;
    doble.rpcResultado = { data: [{ id: "c1", numero: 1, linea_base_id: "b2" }], error: null };
    doble.fallarInsert = {};
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
  });

  it("sin punto de partida → 409 «Primero fija el punto de partida», y no se escribe NADA", async () => {
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja", que_se_trabo: "Nada" });
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toMatch(/^Primero fija el punto de partida/);
    expect(doble.rpc, "no se congela ninguna medición").toEqual([]);
    expect(doble.escrituras, "ni corte, ni hallazgos de regresión").toEqual([]);
  });

  it("con menos de 5 números, el mismo 409 dice además cuántos hay", async () => {
    doble.tablas.company_metricas = numeros(3);
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toMatch(/hacen falta al menos 5 de los 9 números; hoy hay 3/);
    expect(doble.rpc).toEqual([]);
  });

  it("una versión reemplazada no es un punto de partida: si ninguna está vigente, también 409", async () => {
    doble.tablas.mediciones = [{ ...baseVigente(), vigente: false }];
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    expect(r.status).toBe(409);
    expect(doble.rpc).toEqual([]);
    expect(doble.escrituras).toEqual([]);
  });

  it("con punto de partida vigente se congela el corte y la respuesta dice contra qué versión se midió", async () => {
    doble.tablas.mediciones = [baseVigente()];
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    expect(r.status).toBe(200);
    expect(doble.rpc).toHaveLength(1);
    expect(doble.rpc[0]).toMatchObject({ fn: "congelar_medicion", args: { p_company: EMP, p_tipo: "corte", p_valores: { venta_mes: 45000, ganancia_mes: 4500 } } });
    expect(r.cuerpo.medicion).toEqual({ id: "c1", linea_base_id: "b2", version_linea_base: 2 });
    const corte = doble.escrituras.find((e) => e.tabla === "checkpoints")!;
    expect(corte.datos).toMatchObject({ company_id: EMP, numero: 1, medicion_id: "c1", que_se_hizo: "Se ordenó la caja" });
  });

  it("las condiciones pasan por el esquema: un cambio sin «desde» ni efecto → 400 y nada escrito, aunque haya punto de partida", async () => {
    doble.tablas.mediciones = [baseVigente()];
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja", condiciones: { cambios: [{ que_cambio: "local nuevo" }] } });
    expect(r.status).toBe(400);
    expect(r.cuerpo.error).toMatch(/condiciones del corte no están completas/);
    expect(doble.rpc).toEqual([]);
    expect(doble.escrituras).toEqual([]);
    // Tampoco entra un JSON cualquiera en la columna.
    expect((await registrarCorte({ que_se_hizo: "x", condiciones: "subió el precio" })).status).toBe(400);
  });

  it("período y condiciones válidos se guardan SOLO en sus columnas: los valores congelados no se tocan", async () => {
    doble.tablas.mediciones = [baseVigente()];
    const condiciones = { temporada: "campaña escolar", cambios: [{ que_cambio: "local nuevo", desde: "2026-09-10", efecto_esperado: "más tráfico" }] };
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30", condiciones });
    expect(r.status).toBe(200);
    const cambio = doble.escrituras.find((e) => e.tabla === "mediciones" && e.op === "update")!;
    expect(Object.keys(cambio.datos).sort()).toEqual(["condiciones", "periodo_desde", "periodo_hasta"]);
    const congelado = doble.tablas.mediciones!.find((f) => f.id === "c1")!;
    expect(congelado).toMatchObject({ periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30", condiciones });
    expect(congelado.valores).toEqual(doble.rpc[0]!.args.p_valores);
  });

  it("si la medición no se pudo congelar, lo dice y no guarda el corte «sin números» en silencio", async () => {
    doble.tablas.mediciones = [baseVigente()];
    doble.rpcResultado = { data: null, error: { message: "permission denied for function congelar_medicion" } };
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    expect(r.status).toBe(500);
    expect(r.cuerpo.error).toMatch(/No se pudo congelar la medición de este corte: permission denied/);
    expect(r.cuerpo.error).toMatch(/No se guardó nada/);
    expect(doble.escrituras).toEqual([]);
  });

  it("si el corte no se pudo guardar, no responde 200 con la respuesta vacía", async () => {
    doble.tablas.mediciones = [baseVigente()];
    doble.fallarInsert = { checkpoints: "violates check constraint" };
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    expect(r.status).toBe(500);
    expect(r.cuerpo.error).toMatch(/La medición del corte quedó congelada, pero no se pudo guardar el corte/);
  });

  it("…y al reintentar igual se enlaza a la medición que ya quedó congelada: no nace un segundo corte idéntico", async () => {
    doble.tablas.mediciones = [baseVigente()];
    doble.fallarInsert = { checkpoints: "violates check constraint" };
    const primero = await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    expect(primero.status).toBe(500);
    expect(primero.cuerpo.error).toMatch(/Vuelve a registrarlo con el mismo texto y sin cambiar los números: se enlazará a esa medición, no se congelará otra/);
    expect(doble.rpc).toHaveLength(1);

    doble.fallarInsert = {};
    const segundo = await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    expect(segundo.status).toBe(200);
    expect(doble.rpc, "no se congela una segunda medición").toHaveLength(1);
    expect(doble.tablas.mediciones!.filter((f) => f.tipo === "corte")).toHaveLength(1);
    expect(segundo.cuerpo.medicion).toEqual({ id: "c1", linea_base_id: "b2", version_linea_base: 2, reutilizada: true });
    expect(doble.escrituras.filter((e) => e.tabla === "checkpoints").map((e) => e.datos.medicion_id)).toEqual(["c1"]);
    // Lo congelado no se tocó al reutilizarlo: ninguna escritura sobre la medición.
    expect(doble.escrituras.filter((e) => e.tabla === "mediciones")).toEqual([]);
  });

  it("solo se reutiliza lo que es el mismo corte: otro texto, otros números, otra persona u otro punto de partida congelan una medición nueva", async () => {
    const pendiente = (extra: Fila = {}): Fila => ({ id: "c1", company_id: EMP, tipo: "corte", numero: 1, linea_base_id: "b2", nota: "Se ordenó la caja", creado_por: CONSULTORA.id, valores: Object.fromEntries(NUMEROS), derivados: {}, ...extra });
    const intentar = async (fila: Fila, corte: Fila = { que_se_hizo: "Se ordenó la caja" }) => {
      doble.tablas = { company_metricas: numeros(6), mediciones: [baseVigente(), fila], checkpoints: [] };
      doble.rpc.length = 0;
      doble.rpcResultado = { data: [{ id: "c2", numero: 2, linea_base_id: "b2" }], error: null };
      const r = await registrarCorte(corte);
      expect(r.status).toBe(200);
      return doble.rpc.length;
    };
    // Los derivados del doble salen de los mismos números: se toman de una primera llamada real para no copiarlos a mano.
    doble.tablas.mediciones = [baseVigente()];
    await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    const derivados = doble.rpc[0]!.args.p_derivados as Fila;

    expect(await intentar(pendiente({ derivados })), "el mismo corte, sin enlazar: se reutiliza").toBe(0);
    expect(await intentar(pendiente({ derivados }), { que_se_hizo: "Se cambió el horario" }), "otro texto").toBe(1);
    expect(await intentar(pendiente({ derivados, valores: { ...Object.fromEntries(NUMEROS), venta_mes: 1 } })), "otros números").toBe(1);
    expect(await intentar(pendiente({ derivados, creado_por: "33333333-3333-4333-8333-333333333333" })), "lo congeló el dueño desde su portal").toBe(1);
    expect(await intentar(pendiente({ derivados, linea_base_id: "b1" })), "se midió contra una versión anterior").toBe(1);
  });

  it("un corte que ya tiene su registro en el plan no se reutiliza: repetir el mismo corte a propósito congela otro", async () => {
    doble.tablas.mediciones = [baseVigente()];
    expect((await registrarCorte({ que_se_hizo: "Se ordenó la caja" })).status).toBe(200);
    expect((await registrarCorte({ que_se_hizo: "Se ordenó la caja" })).status).toBe(200);
    expect(doble.rpc, "dos cortes, dos mediciones").toHaveLength(2);
  });

  it("un corte con números y sin período se guarda, pero la respuesta lo dice; con período, no hay aviso", async () => {
    doble.tablas.mediciones = [baseVigente()];
    const sin = await registrarCorte({ que_se_hizo: "Se ordenó la caja" });
    expect(sin.status).toBe(200);
    expect(sin.cuerpo.aviso_periodo).toMatch(/se guardó sin período.*observada, no como resultado/);
    const con = await registrarCorte({ que_se_hizo: "Se revisaron precios", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(con.status).toBe(200);
    expect(con.cuerpo.aviso_periodo).toBeUndefined();
  });

  it("lo que manda «Tus números» (tipo y período) lo guarda la ruta de medición en las columnas del período, y solo en ellas", async () => {
    doble.tablas.mediciones = [baseVigente()];
    const pedido = pedidoDeMedicion("corte", "2026-09-01", "2026-09-30", "2026-10-13");
    const { POST } = await import("@/app/api/companies/[id]/medicion/route");
    const res = await POST(
      new Request(`http://8x.test/api/companies/${EMP}/medicion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pedido) }),
      { params: Promise.resolve({ id: EMP }) }
    );
    expect(res.status).toBe(201);
    expect(doble.rpc).toHaveLength(1);
    expect(doble.rpc[0]).toMatchObject({ fn: "congelar_medicion", args: { p_tipo: "corte" } });
    const cambio = doble.escrituras.find((e) => e.tabla === "mediciones" && e.op === "update")!;
    expect(cambio.datos).toEqual({ periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(doble.tablas.mediciones!.find((f) => f.id === "c1")).toMatchObject({ periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30", linea_base_id: "b2" });
  });

  it("un corte sin ningún número (solo qué se hizo) no es una medición: se guarda y no congela nada", async () => {
    doble.tablas.company_metricas = [];
    const r = await registrarCorte({ que_se_hizo: "Se ordenó la caja", que_se_trabo: "Faltó la lista de precios" });
    expect(r.status).toBe(200);
    expect(doble.rpc).toEqual([]);
    expect(r.cuerpo.medicion).toBeNull();
    expect(doble.escrituras.map((e) => [e.tabla, e.op])).toEqual([["checkpoints", "insert"]]);
    expect(doble.escrituras[0]!.datos).toMatchObject({ medicion_id: null, que_se_hizo: "Se ordenó la caja" });
    // No es una medición: no hay período que echar en falta.
    expect(r.cuerpo.aviso_periodo).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// CIERRE Z3 (13-10-2026) · NINGUNA CIFRA FIRME QUE NO LO SEA
// ---------------------------------------------------------------------------------------------

/** Una medición que se congeló con estas claves marcadas como provisionales (así queda guardada en `derivados`). */
const marcaProvisional = (claves: string[]) => ({ [CLAVE_PROVISIONALES]: claves.join(", ") }) as unknown as Record<string, number | null>;

describe("cierre Z3 · lo que se congela: lo descartado no entra y lo provisional queda escrito", () => {
  const e = (clave: string, valor: number | null, periodo: string, estado: string): Metrica => ({ clave, periodo, valor, estado });
  const contados = [m("venta_mes", 45000, "2026-07"), m("ganancia_mes", 4500, "2026-07"), m("caja_hoy", 8000), m("gasto_fijo_mes", 12000, "2026-07")];

  it("un «descartado» que conserva su valor no entra en la foto, aunque sea el mes más reciente", () => {
    const ms = [m("venta_mes", 45000, "2026-07"), e("venta_mes", 99000, "2026-08", "descartado"), e("caja_hoy", 5000, "actual", "descartado")];
    expect(valoresActuales(ms)).toEqual({ venta_mes: 45000 });
  });

  it("con números contados nada cambia: ni marca ni clave nueva en lo congelado", () => {
    expect(provisionalesActuales(contados)).toEqual([]);
    expect(Object.keys(derivadosActuales(contados)).sort()).toEqual(["diasAguante", "equilibrio", "equilibrioProductoEstrella", "margen", "margenUnitario"]);
    expect(provisionalesDe({ derivados: derivadosActuales(contados) })).toEqual([]);
    expect(provisionalesDe(null)).toEqual([]);
  });

  it("un número extraído se congela, pero la medición lleva escrito que él y la cifra que se apoya en él eran provisionales", () => {
    const ms = [e("venta_mes", 45000, "2026-07", "extraido"), m("ganancia_mes", 4500, "2026-07"), m("caja_hoy", 8000), m("gasto_fijo_mes", 12000, "2026-07")];
    expect(valoresActuales(ms).venta_mes).toBe(45000);
    // La venta, y el margen que sale de ella. Los días de aguante (caja y fijos contados) no.
    expect(provisionalesActuales(ms)).toEqual(["venta_mes", "margen"]);
    const congelado = derivadosActuales(ms);
    expect(congelado.margen).toBeCloseTo(10, 5);
    expect(provisionalesDe({ derivados: congelado })).toEqual(["venta_mes", "margen"]);
    expect(nombresProvisionales({ derivados: congelado })).toEqual(["Ventas del mes"]);
    // Es texto, no una lista: el reintento de un corte compara lo congelado clave por clave con `!==`.
    expect((congelado as Record<string, unknown>)[CLAVE_PROVISIONALES]).toBe("venta_mes, margen");
  });

  it("solo marca el número que de verdad se congela: un extraído de un mes anterior no mancha el contado más reciente", () => {
    expect(provisionalesActuales([e("venta_mes", 30000, "2026-06", "extraido"), m("venta_mes", 45000, "2026-07")])).toEqual([]);
  });
});

describe("cierre Z3 · la comparación dice lo que era provisional y no lo da por resultado", () => {
  const abril = { periodo_desde: "2026-04-01", periodo_hasta: "2026-04-30" };
  const julio = { periodo_desde: "2026-07-01", periodo_hasta: "2026-07-31" };
  const valoresBase = { venta_mes: 40000, ganancia_mes: 4000, deuda_propia: 20000 };
  const baseFirme = version(1, "b1", valoresBase, abril);
  const baseProvisional = version(1, "b1", valoresBase, { ...abril, derivados: marcaProvisional(["ganancia_mes", "margen"]) });
  const corte: Medicion = { ...med("corte", "2026-08-01", { venta_mes: 48000, ganancia_mes: 6000, deuda_propia: 14000 }, 1), id: "c1", linea_base_id: "b1", ...julio };
  const verificada: AccionLigada = { id: "a1", accion: "Vitrina y precios visibles", estado: "verificado", clave: "ganancia_mes", fecha_verificacion: "2026-07-15" };
  const limpio = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");

  it("el movimiento se muestra, la frase dice de dónde sale y no se juzga como mejora", () => {
    const movs = comparar(baseProvisional, corte);
    const g = movs.find((x) => x.vital.clave === "ganancia_mes")!;
    expect(g).toMatchObject({ delta: 2000, provisional: true, mejoro: null });
    expect(g.frase).toBe("Subió de S/4,000 a S/6,000 (+S/2,000, 50%). Provisional: el número del punto de partida sale de un documento que falta revisar.");
    // Lo que no era provisional sigue igual que siempre.
    const v = movs.find((x) => x.vital.clave === "venta_mes")!;
    expect(v).toMatchObject({ provisional: false, mejoro: true });
    expect(v.frase).not.toMatch(/Provisional/);
    // Con la misma base sin marca, la ganancia sí se juzga: la diferencia la hace la marca y nada más.
    expect(comparar(baseFirme, corte).find((x) => x.vital.clave === "ganancia_mes")).toMatchObject({ provisional: false, mejoro: true });
  });

  it("dice de cuál de las dos mediciones es el dato provisional", () => {
    const corteProv: Medicion = { ...corte, derivados: marcaProvisional(["ganancia_mes"]) };
    expect(comparar(baseFirme, corteProv).find((x) => x.vital.clave === "ganancia_mes")!.frase).toMatch(/Provisional: el número de este corte sale de un documento que falta revisar\.$/);
    expect(comparar(baseProvisional, corteProv).find((x) => x.vital.clave === "ganancia_mes")!.frase).toMatch(/Provisional: los dos números salen de documentos que falta revisar\.$/);
  });

  it("el titular no dice «el negocio deja S/2,000 más»: lo dice en condicional y avisa de que no es un resultado", () => {
    const l = lecturaDeCorte({ corte, mediciones: [baseProvisional], acciones: [verificada] });
    expect(l.titular).toBe("Con números que falta revisar, el negocio dejaría S/2,000 más al mes que cuando empezamos. Es provisional: todavía no es un resultado.");
    expect(l.veredicto.provisionales).toEqual(["Lo que te quedó libre"]);
    // La venta y la deuda (firmes) mejoraron; la ganancia no cuenta como mejora.
    expect(l.veredicto).toMatchObject({ mejoraron: 2, empeoraron: 0 });
    // Y con la base firme, el titular de siempre.
    expect(lecturaDeCorte({ corte, mediciones: [baseFirme], acciones: [verificada] }).titular).toBe("El negocio deja S/2,000 más al mes que cuando empezamos.");
  });

  it("no se atribuye al trabajo ni con acción verificada: provisional no es resultado", () => {
    const l = lecturaDeCorte({ corte, mediciones: [baseProvisional], acciones: [verificada] });
    const g = l.atribuciones.find((a) => a.clave === "ganancia_mes")!;
    expect(g).toMatchObject({ provisional: true, atribuible: "no" });
    expect(g.motivo).toMatch(/el número sale de un documento que falta revisar, y lo provisional no es un resultado/);
    expect(g.motivo).toMatch(/Hay una acción verificada \(«Vitrina y precios visibles»\), pero mientras el dato sea provisional el cambio no se le adjudica/);
    expect(l.lecturaAtribucion).toMatch(/Ese cambio en lo que te queda sale de un documento que falta revisar/);
    expect(l.lecturaAtribucion).not.toMatch(/se puede atribuir/);
    // La misma acción, con la base firme, sí atribuye.
    expect(lecturaDeCorte({ corte, mediciones: [baseFirme], acciones: [verificada] }).atribuciones.find((a) => a.clave === "ganancia_mes")!.atribuible).toBe("si");
  });

  it("si TODO lo que se movió es provisional, no dice «el negocio está parejo»: dice que todavía no se puede decir", () => {
    const b = version(1, "b1", { venta_mes: 40000 }, { ...abril, derivados: marcaProvisional(["venta_mes"]) });
    const c: Medicion = { ...med("corte", "2026-08-01", { venta_mes: 48000 }, 1), id: "c1", linea_base_id: "b1", ...julio };
    const l = lecturaDeCorte({ corte: c, mediciones: [b], acciones: [] });
    expect(l.titular).toBe("Lo que se movió sale de documentos que falta revisar: todavía no se puede decir si el negocio mejoró.");
    expect(l.veredicto).toMatchObject({ mejoraron: 0, empeoraron: 0 });
  });

  it("las tres pantallas lo dicen: «Tus números», «Tus resultados» y el panel del consultor", () => {
    const EMP = "0000000a-0000-4000-8000-00000000000a";
    const l = lecturaDeCorte({ corte, mediciones: [baseProvisional], acciones: [verificada] });
    const avance = limpio(renderToStaticMarkup(createElement(Avance, { companyId: EMP, base: baseProvisional, ultimoCorte: corte, cortes: [corte], numerosListos: 6, hoy: "2026-10-13", lectura: l })));
    const resultados = limpio(renderToStaticMarkup(createElement(ComoVamos, { companyId: EMP, mediciones: [baseProvisional, corte], actas: [], acciones: [verificada], puedeAceptar: true })));
    const panel = limpio(renderToStaticMarkup(createElement(PanelMediciones, { companyId: EMP, mediciones: [baseProvisional, corte], actas: [], acciones: [verificada], numerosListos: 6 })));
    for (const [nombre, html] of [["Tus números", avance], ["Tus resultados", resultados], ["panel del consultor", panel]] as const) {
      expect(html, nombre).toContain("el negocio dejaría S/2,000 más al mes");
      expect(html, nombre).not.toContain("El negocio deja S/2,000 más al mes");
      expect(html, nombre).not.toMatch(/Se debe al trabajo que hicimos|Ese cambio en lo que te queda se puede atribuir/);
    }
    // En «Tus números» el rótulo va además junto al nombre del número, no solo dentro de la frase.
    expect(avance).toMatch(/Lo que te quedó libre<\/span>.*?>provisional: sale de un documento que falta revisar<\/span>/);
    expect(avance).toContain("Provisional: el número del punto de partida sale de un documento que falta revisar.");
    // Dos mejoraron (venta y deuda), no tres.
    expect(avance).toMatch(/>2<\/p><p[^>]*>mejoraron</);
    expect(panel).toContain("2 mejoraron, 0 empeoraron");
  });

  it("el punto de partida recién fijado dice cuáles de sus números son provisionales, con su nombre", () => {
    const html = limpio(renderToStaticMarkup(createElement(Avance, { companyId: "e", base: baseProvisional, ultimoCorte: null, cortes: [], numerosListos: 6, hoy: "2026-10-13" })));
    expect(html).toContain("Un número de esa foto es provisional: Lo que te quedó libre.");
    expect(html).toContain("de un documento que falta revisar");
    const firme = limpio(renderToStaticMarkup(createElement(Avance, { companyId: "e", base: baseFirme, ultimoCorte: null, cortes: [], numerosListos: 6, hoy: "2026-10-13" })));
    expect(firme).not.toMatch(/provisional/i);
  });
});

describe("cierre Z3 · antes y después: el mismo período, o un corte anterior, no son un resultado", () => {
  const con = (desde: string, hasta: string, extra: Partial<Medicion> = {}): Medicion => ({ ...med("corte", hasta, { venta_mes: 1 }, 1), periodo_desde: desde, periodo_hasta: hasta, ...extra });
  const setiembre = { periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" };
  const verificada: AccionLigada = { id: "a1", accion: "Vitrina y precios visibles", estado: "verificado", clave: "ganancia_mes", fecha_verificacion: "2026-09-15" };
  const limpio = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");

  it("el mismo período dura lo mismo y aun así no vale: «son el mismo período: no hay antes y después»", () => {
    const e = periodosEquivalentes(con("2026-09-01", "2026-09-30"), con("2026-09-01", "2026-09-30"));
    expect(e).toMatchObject({ veredicto: "no_equivalentes", equivalentes: false, orden: "mismo_periodo", diasA: 30, diasB: 30 });
    expect(e.motivo).toBe("Son el mismo período (del 1 sep 2026 al 30 sep 2026): no hay antes y después. La comparación no es un resultado.");
  });

  it("un corte de fechas anteriores a las del punto de partida tampoco: no es posterior", () => {
    const anterior = periodosEquivalentes(con("2026-09-01", "2026-09-30"), con("2026-08-01", "2026-08-31"));
    expect(anterior).toMatchObject({ veredicto: "no_equivalentes", equivalentes: false, orden: "no_posterior" });
    expect(anterior.motivo).toMatch(/\(del 1 ago 2026 al 31 ago 2026\) no es posterior al de .+ \(del 1 sep 2026 al 30 sep 2026\): no hay antes y después/);
    // Empieza el mismo día y dura un poco más: tampoco es un después.
    expect(periodosEquivalentes(con("2026-09-01", "2026-09-30"), con("2026-09-01", "2026-10-02")).orden).toBe("no_posterior");
  });

  it("un período posterior sigue valiendo; si se pisan en parte, vale pero se avisa", () => {
    const bien = periodosEquivalentes(con("2026-09-01", "2026-09-30"), con("2026-10-01", "2026-10-31"));
    expect(bien).toMatchObject({ veredicto: "equivalentes", equivalentes: true, orden: null });
    expect(bien.avisos).toEqual([]);
    const pisados = periodosEquivalentes(con("2026-09-01", "2026-09-30"), con("2026-09-16", "2026-10-15"));
    expect(pisados).toMatchObject({ veredicto: "equivalentes", orden: null });
    expect(pisados.avisos).toHaveLength(1);
    expect(pisados.avisos[0]).toMatch(/se pisan: hay días que están en las dos mediciones/);
  });

  it("la regla sola, que es la que usa la pantalla para avisar antes de congelar; sin período no deduce nada", () => {
    expect(ordenDePeriodos(setiembre, setiembre)).toBe("mismo_periodo");
    expect(ordenDePeriodos(setiembre, { periodo_desde: "2026-08-01", periodo_hasta: "2026-08-31" })).toBe("no_posterior");
    expect(ordenDePeriodos(setiembre, { periodo_desde: "2026-10-01", periodo_hasta: "2026-10-31" })).toBeNull();
    expect(ordenDePeriodos(setiembre, { periodo_desde: null, periodo_hasta: null })).toBeNull();
    expect(ordenDePeriodos({ periodo_desde: "2026-09-30", periodo_hasta: "2026-09-01" }, setiembre)).toBeNull();
  });

  it("dos toques a «son del mes pasado» en el mismo mes: el titular lo dice, no es resultado y nada se atribuye", () => {
    const base = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000 }, setiembre);
    const corte: Medicion = { ...med("corte", "2026-10-20", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1", ...setiembre };
    const l = lecturaDeCorte({ corte, mediciones: [base], acciones: [verificada] });
    expect(l.titular).toBe("Este corte y tu punto de partida son del mismo período (del 1 sep 2026 al 30 sep 2026): no hay antes y después, así que no se puede decir si el negocio mejoró.");
    expect(l.esResultado).toBe(false);
    expect(l.periodos).toMatchObject({ veredicto: "no_equivalentes" });
    expect(l.periodos!.texto).toMatch(/no son un antes y un después/);
    expect(l.atribuciones.every((a) => a.atribuible === "no")).toBe(true);
    expect(l.atribuciones.find((a) => a.clave === "ganancia_mes")!.motivo).toMatch(/el corte y el punto de partida son del mismo período\. No hay antes y después/);
    expect(l.lecturaAtribucion).toMatch(/queda como observado/);
    // La voz del consultor: la misma decisión.
    expect(lecturaDeCorte({ corte, mediciones: [base], acciones: [verificada], para: "consultor" }).titular).toMatch(/^Este corte y el punto de partida son del mismo período/);

    // Y pintado: ninguna de las tres pantallas da un veredicto.
    const EMP = "0000000a-0000-4000-8000-00000000000a";
    const VEREDICTO = /más al mes|menos al mes|\d+ mejoraron|>mejoraron<|>empeoraron<|Se debe al trabajo|Ese cambio en lo que te queda se puede atribuir/;
    const avance = limpio(renderToStaticMarkup(createElement(Avance, { companyId: EMP, base, ultimoCorte: corte, cortes: [corte], numerosListos: 6, hoy: "2026-10-20", lectura: l })));
    const resultados = limpio(renderToStaticMarkup(createElement(ComoVamos, { companyId: EMP, mediciones: [base, corte], actas: [], acciones: [verificada], puedeAceptar: true })));
    const panel = limpio(renderToStaticMarkup(createElement(PanelMediciones, { companyId: EMP, mediciones: [base, corte], actas: [], acciones: [verificada], numerosListos: 6 })));
    for (const [nombre, html] of [["Tus números", avance], ["Tus resultados", resultados], ["panel del consultor", panel]] as const) {
      expect(html, nombre).toMatch(/son del mismo período/);
      expect(html, nombre).not.toMatch(VEREDICTO);
    }
    expect(panel).toContain("Son el mismo período (del 1 sep 2026 al 30 sep 2026): no hay antes y después.");
  });

  it("un corte con fechas anteriores a las del punto de partida: el titular nombra las dos y no hay resultado", () => {
    const base = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000 }, setiembre);
    const corte: Medicion = { ...med("corte", "2026-10-20", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1", periodo_desde: "2026-08-01", periodo_hasta: "2026-08-31" };
    const l = lecturaDeCorte({ corte, mediciones: [base], acciones: [] });
    expect(l.titular).toBe("Los números de este corte (del 1 ago 2026 al 31 ago 2026) no son posteriores a los de tu punto de partida (del 1 sep 2026 al 30 sep 2026): no hay antes y después, así que no se puede decir si el negocio mejoró.");
    expect(l.esResultado).toBe(false);
  });
});

describe("cierre Z3 · una acción verificada después del período medido no explica ese período", () => {
  const abril = { periodo_desde: "2026-04-01", periodo_hasta: "2026-04-30" };
  const julio = { periodo_desde: "2026-07-01", periodo_hasta: "2026-07-31" };
  const base = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000 }, abril);
  // El corte mide julio, pero se congeló el 20 de agosto: entre el 31 de julio y ese día hay un hueco.
  const corte: Medicion = { ...med("corte", "2026-08-20", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1", ...julio };
  const movs = comparar(base, corte, [base]);
  const accion = (fecha: string | null): AccionLigada => ({ id: "a1", accion: "Vitrina y precios visibles", estado: "verificado", clave: "ganancia_mes", fecha_verificacion: fecha });
  const ganancia = (acciones: AccionLigada[], condiciones?: Medicion["condiciones"]) => atribucion({ corte, movimientos: movs, acciones, condiciones }).find((a) => a.clave === "ganancia_mes")!;

  it("verificada el 10 de agosto (antes de congelar, después de julio): no explica los números de julio", () => {
    const a = ganancia([accion("2026-08-10")]);
    expect(a.atribuible).toBe("no");
    expect(a.motivo).toMatch(/ninguna acción verificada ligada a «Lo que te quedó libre» antes de que terminara el período medido/);
    expect(a.motivo).toMatch(/hay 1 acción\(es\) verificada\(s\) después del período medido \(terminó el 31 jul 2026\)/);
    expect(a.motivo).toMatch(/lo que se verificó después no explica los números de ese período/);
    // Lo mismo por la lectura entera, que es la que pintan las pantallas.
    const l = lecturaDeCorte({ corte, mediciones: [base], acciones: [accion("2026-08-10")] });
    expect(l.cuenta).toMatchObject({ si: 0, parcial: 0 });
    expect(l.lecturaAtribucion).not.toMatch(/se puede atribuir/);
  });

  it("verificada dentro del período (o el último día) sí cuenta, y el motivo dice contra qué se comparó", () => {
    expect(ganancia([accion("2026-07-31")]).atribuible).toBe("si");
    const a = ganancia([accion("2026-07-15")]);
    expect(a.atribuible).toBe("si");
    expect(a.motivo).toMatch(/Acción verificada «Vitrina y precios visibles» el 15 jul 2026, antes de que terminara el período medido, y ninguna condición registrada explica el cambio/);
    expect(ganancia([accion("2026-08-01")]).atribuible).toBe("no");
  });

  it("un cambio de condiciones que empezó después del período tampoco rebaja lo que pasó dentro de él", () => {
    const despues = { cambios: [{ que_cambio: "local nuevo en Gamarra", desde: "2026-08-05", efecto_esperado: "más ventas por más tráfico" }] };
    expect(ganancia([accion("2026-07-15")], despues).atribuible).toBe("si");
    const dentro = { cambios: [{ que_cambio: "local nuevo en Gamarra", desde: "2026-07-10", efecto_esperado: "más ventas por más tráfico" }] };
    expect(ganancia([accion("2026-07-15")], dentro).atribuible).toBe("parcial");
  });

  it("sin período registrado en el corte se sigue comparando con el día en que se congeló (y con la frase de siempre)", () => {
    const sinPeriodo: Medicion = { ...med("corte", "2026-08-20", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1" };
    const a = atribucion({ corte: sinPeriodo, movimientos: movs, acciones: [accion("2026-08-10")] }).find((x) => x.clave === "ganancia_mes")!;
    expect(a.atribuible).toBe("si");
    expect(a.motivo).toMatch(/antes del corte/);
  });
});

describe("cierre Z3 · las rutas: 409 sin punto de partida, lo provisional dicho al congelar y el período del plan (con dobles)", () => {
  const EMP = "0000000a-0000-4000-8000-00000000000a";
  const CONSULTORA: Perfil = { id: "22222222-2222-4222-8222-222222222222", email: "consultora@ejemplo.test", nombre: "Consultora", rol: "consultor", autoridad: ["cerrar_medicion"] };
  const NUMEROS: [string, number][] = [["venta_mes", 45000], ["ganancia_mes", 4500], ["caja_hoy", 8000], ["gasto_fijo_mes", 12000], ["deuda_propia", 20000], ["deuda_clientes", 3000]];
  const numeros = (estadoVenta = "contado"): Fila[] => NUMEROS.map(([clave, valor]) => ({ company_id: EMP, clave, periodo: "actual", valor, estado: clave === "venta_mes" ? estadoVenta : "contado" }));
  const baseVigente = (): Fila => ({ id: "b2", company_id: EMP, tipo: "linea_base", numero: 0, fecha: "2026-09-01", valores: { venta_mes: 40000 }, derivados: {}, nota: null, version: 2, vigente: true });

  const congelar = async (cuerpo: Fila) => {
    const { POST } = await import("@/app/api/companies/[id]/medicion/route");
    const res = await POST(
      new Request(`http://8x.test/api/companies/${EMP}/medicion`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }),
      { params: Promise.resolve({ id: EMP }) }
    );
    return { status: res.status, cuerpo: (await res.json()) as Fila };
  };
  const registrarCorte = async (corte: Fila) => {
    const { POST } = await import("@/app/api/companies/[id]/close/route");
    const res = await POST(
      new Request(`http://8x.test/api/companies/${EMP}/close`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ corte }) }),
      { params: Promise.resolve({ id: EMP }) }
    );
    return { status: res.status, cuerpo: (await res.json()) as Fila };
  };

  beforeEach(() => {
    doble.tablas = { company_metricas: numeros(), mediciones: [], checkpoints: [] };
    doble.escrituras.length = 0;
    doble.rpc.length = 0;
    doble.rpcResultado = { data: [{ id: "c1", numero: 1, linea_base_id: "b2" }], error: null };
    doble.fallarInsert = {};
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
  });

  it("un corte desde «Tus números» sin punto de partida vigente → 409 (antes 400), como en /close, y no se congela nada", async () => {
    const r = await congelar({ tipo: "corte", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(r.status).toBe(409);
    expect(r.cuerpo.error).toMatch(/No hay punto de partida contra el que medir este corte/);
    expect(doble.rpc).toEqual([]);
    expect(doble.escrituras).toEqual([]);
    // Una versión reemplazada tampoco es un punto de partida.
    doble.tablas.mediciones = [{ ...baseVigente(), vigente: false }];
    expect((await congelar({ tipo: "corte", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" })).status).toBe(409);
    // Lo que sí está mal formado sigue siendo 400.
    expect((await congelar({ tipo: "corte", periodo_desde: "2026-09-30", periodo_hasta: "2026-09-01" })).status).toBe(400);
  });

  it("punto de partida con un número extraído: se congela, la medición lleva la marca y la respuesta lo dice con su nombre", async () => {
    doble.tablas.company_metricas = numeros("extraido");
    doble.rpcResultado = { data: [{ id: "b1", numero: 0, version: 1, vigente: true }], error: null };
    const r = await congelar({ tipo: "linea_base", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(r.status).toBe(201);
    const enviado = doble.rpc[0]!.args.p_derivados as Record<string, number | null>;
    expect(provisionalesDe({ derivados: enviado })).toEqual(["venta_mes", "margen"]);
    expect(r.cuerpo.provisionales).toEqual(["Ventas del mes"]);
    expect(r.cuerpo.aviso_provisional).toBe("Un número de esta medición sale de un documento que falta revisar (Ventas del mes): queda guardado como provisional y no se lee como resultado hasta que se revise.");
    // Y queda en la fila guardada, que es de donde lo leerán la comparación y el acta.
    expect(nombresProvisionales(doble.tablas.mediciones!.find((f) => f.id === "b1") as unknown as Medicion)).toEqual(["Ventas del mes"]);
  });

  it("…y lo dice también en `aviso`, que es lo único que pinta la pantalla de la consultora al fijar el punto de partida", async () => {
    doble.tablas.company_metricas = numeros("extraido");
    doble.rpcResultado = { data: [{ id: "b1", numero: 0, version: 1, vigente: true }], error: null };
    const r = await congelar({ tipo: "linea_base", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(r.cuerpo.aviso).toBe(r.cuerpo.aviso_provisional);
    expect(r.cuerpo.aviso).toMatch(/Ventas del mes/);
    // No es un fallo al guardar: «Tus números» no se queda bloqueada por esto; recarga y la página lo dice.
    expect(r.cuerpo.aviso_guardado).toBeUndefined();
    const AVANCE = readFileSync(path.resolve(__dirname, "..", "src/components/cliente/Avance.tsx"), "utf8");
    expect(AVANCE).toContain("if (r?.aviso_guardado) {");
  });

  it("con números contados no hay marca ni aviso: la respuesta es la de siempre", async () => {
    doble.rpcResultado = { data: [{ id: "b1", numero: 0, version: 1, vigente: true }], error: null };
    const r = await congelar({ tipo: "linea_base", periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(r.status).toBe(201);
    expect(r.cuerpo.aviso).toBeUndefined();
    expect(r.cuerpo.provisionales).toBeUndefined();
    expect(r.cuerpo.aviso_provisional).toBeUndefined();
    expect(Object.keys(doble.rpc[0]!.args.p_derivados as Fila)).not.toContain(CLAVE_PROVISIONALES);
  });

  it("el corte del plan (/close) también congela la marca, sin que la ruta haga nada: viaja dentro de lo congelado", async () => {
    doble.tablas.company_metricas = numeros("extraido");
    doble.tablas.mediciones = [baseVigente()];
    const r = await registrarCorte({ que_se_hizo: "Se revisaron precios", periodo_desde: "2026-10-01", periodo_hasta: "2026-10-31" });
    expect(r.status).toBe(200);
    expect(provisionalesDe({ derivados: doble.rpc[0]!.args.p_derivados as Record<string, number | null> })).toEqual(["venta_mes", "margen"]);
    // Y el reintento sigue reconociendo «los mismos números»: la marca es texto y se compara por valor.
    doble.tablas.checkpoints = [];
    doble.fallarInsert = {};
    const otra = await registrarCorte({ que_se_hizo: "Se revisaron precios", periodo_desde: "2026-10-01", periodo_hasta: "2026-10-31" });
    expect(otra.status).toBe(200);
    expect((otra.cuerpo.medicion as Fila).reutilizada).toBe(true);
    expect(doble.rpc).toHaveLength(1);
  });

  it("periodoDeCorte: el período entero, nada si no se escribió ninguna fecha, y null si está a medias o al revés", () => {
    expect(periodoDeCorte("", "")).toEqual({});
    expect(periodoDeCorte("2026-09-01", "2026-09-30")).toEqual({ periodo_desde: "2026-09-01", periodo_hasta: "2026-09-30" });
    expect(periodoDeCorte("2026-09-01", "")).toBeNull();
    expect(periodoDeCorte("", "2026-09-30")).toBeNull();
    expect(periodoDeCorte("2026-09-30", "2026-09-01")).toBeNull();
    expect(periodoDeCorte("2026-10-01", "2026-10-31", "2026-10-13")).toBeNull();
  });

  it("lo que manda el plan con sus fechas llega a /close y el corte queda con período: sin aviso. Sin fechas, la ruta avisa", async () => {
    doble.tablas.mediciones = [baseVigente()];
    const con = await registrarCorte({ que_se_hizo: "Se revisaron precios", que_se_trabo: "", indicadores: null, ...periodoDeCorte("2026-10-01", "2026-10-31") });
    expect(con.status).toBe(200);
    expect(con.cuerpo.aviso_periodo).toBeUndefined();
    expect(doble.tablas.mediciones!.find((f) => f.id === "c1")).toMatchObject({ periodo_desde: "2026-10-01", periodo_hasta: "2026-10-31" });
    doble.tablas.mediciones = [baseVigente()];
    doble.tablas.checkpoints = [];
    const sin = await registrarCorte({ que_se_hizo: "Se ordenó la caja", que_se_trabo: "", indicadores: null, ...periodoDeCorte("", "") });
    expect(sin.cuerpo.aviso_periodo).toMatch(/se guardó sin período/);
  });

  it("la pantalla del plan pide las dos fechas a la consultora y dice lo que pasa sin ellas; al dueño no le pide nada", () => {
    const limpio = (html: string) => html.replace(/<!-- -->/g, "");
    const consultora = limpio(renderToStaticMarkup(createElement(CortesPlan, { companyId: EMP, cortes: [], puedeRegistrar: true })));
    expect(consultora).toContain("¿De qué fechas son los números de este corte?");
    expect(consultora).toContain('aria-label="Desde qué día son los números del corte"');
    expect(consultora).toContain('aria-label="Hasta qué día son los números del corte"');
    expect(consultora).toContain("Sin fechas, el corte se guarda igual, pero sus números quedan como observados y sin veredicto");
    const dueno = limpio(renderToStaticMarkup(createElement(CortesPlan, { companyId: EMP, cortes: [], puedeRegistrar: false })));
    expect(dueno).not.toContain("De qué fechas");
    // Lo que no se puede pintar sin navegador (el envío y el aviso de después), leído del archivo.
    const fuente = readFileSync(path.resolve(__dirname, "..", "src/components/plan/CortesPlan.tsx"), "utf8");
    expect(fuente).toContain("const periodo = periodoDeCorte(desde, hasta);");
    expect(fuente).toContain("...periodo } },");
    expect(fuente).toContain("setAvisos([r?.aviso_periodo, r?.medicion?.aviso]");
  });
});

/**
 * CIERRE Z3, SEGUNDA VUELTA. `atribucion` comparaba el instante de la verificación (guardado en UTC) con el
 * último día del período (un día local): una acción verificada el 31 de agosto después de las 7 de la noche
 * en Lima caía «después del período» y no se atribuía. El día se toma ahora en el calendario de la empresa.
 */
describe("cierre Z3 · el día de la verificación es el del calendario de la empresa, no el de UTC", () => {
  const julio = { periodo_desde: "2026-07-01", periodo_hasta: "2026-07-31" };
  const agosto = { periodo_desde: "2026-08-01", periodo_hasta: "2026-08-31" };
  const base = version(1, "b1", { venta_mes: 40000, ganancia_mes: 4000 }, julio);
  const corte: Medicion = { ...med("corte", "2026-09-10", { venta_mes: 48000, ganancia_mes: 6000 }, 1), id: "c1", linea_base_id: "b1", ...agosto };
  const movs = comparar(base, corte, [base]);
  // 31 de agosto a las 8 de la noche en Lima = 1 de setiembre a la 01:00 en UTC.
  const NOCHE_DEL_31 = "2026-09-01T01:00:00Z";
  const accion = (fecha: string | null): AccionLigada => ({ id: "a1", accion: "Vitrina y precios visibles", estado: "verificado", clave: "ganancia_mes", fecha_verificacion: fecha });
  const ganancia = (fecha: string | null, zona?: string) => atribucion({ corte, movimientos: movs, acciones: [accion(fecha)], zona }).find((a) => a.clave === "ganancia_mes")!;

  it("el instante se pasa a día en la zona de la empresa; un día suelto se deja como está", () => {
    expect(diaDeVerificacion(NOCHE_DEL_31)).toBe("2026-08-31");
    expect(diaDeVerificacion(NOCHE_DEL_31, "America/Lima")).toBe("2026-08-31");
    expect(diaDeVerificacion(NOCHE_DEL_31, "Asia/Tokyo")).toBe("2026-09-01");
    expect(diaDeVerificacion("2026-08-31")).toBe("2026-08-31");
    expect(diaDeVerificacion("2026-08-31", "Asia/Tokyo")).toBe("2026-08-31");
    expect(diaDeVerificacion(null)).toBeNull();
    expect(diaDeVerificacion("ayer")).toBeNull();
    // Una zona que no existe no tumba la lectura: se cae a la de la casa.
    expect(diaDeVerificacion(NOCHE_DEL_31, "Marte/Olimpo")).toBe("2026-08-31");
  });

  it("verificada el último día del período a las 8 de la noche de Lima: cuenta, y el motivo dice 31 de agosto", () => {
    const a = ganancia(NOCHE_DEL_31);
    expect(a.atribuible).toBe("si");
    expect(a.motivo).toMatch(/Acción verificada «Vitrina y precios visibles» el 31 ago 2026, antes de que terminara el período medido/);
    // Pasada la medianoche de Lima ya es 1 de setiembre: no explica agosto.
    expect(ganancia("2026-09-01T06:00:00Z").atribuible).toBe("no");
    // El mismo instante, para una empresa en otro huso, ya es el día siguiente.
    expect(ganancia(NOCHE_DEL_31, "Asia/Tokyo").atribuible).toBe("no");
    // Sin fecha sigue sin poder decirse que fue antes de nada.
    expect(ganancia(null).atribuible).toBe("no");
  });

  it("la lectura que pintan las pantallas recibe la zona y decide igual; sin zona, la de la casa", () => {
    const leer = (zona?: string) => lecturaDeCorte({ corte, mediciones: [base], acciones: [accion(NOCHE_DEL_31)], zona }).cuenta;
    expect(leer("America/Lima")).toMatchObject({ si: 1 });
    expect(leer("Asia/Tokyo")).toMatchObject({ si: 0 });
    expect(leer()).toMatchObject({ si: 1 });
  });
});

describe("cierre Z3 · el punto de partida provisional se dice con una sola frase", () => {
  it("nombra cada número con el nombre que lee el dueño, en singular o en plural, y calla si nada era provisional", () => {
    expect(fraseProvisionales(null)).toBeNull();
    expect(fraseProvisionales({ derivados: {} })).toBeNull();
    // Solo una cifra calculada provisional y ningún vital: no hay número que nombrar.
    expect(fraseProvisionales({ derivados: marcaProvisional(["margen"]) })).toBeNull();
    expect(fraseProvisionales({ derivados: marcaProvisional(["ganancia_mes", "margen"]) })).toBe(
      "Un número de esa foto es provisional: Lo que te quedó libre. Sale de un documento que falta revisar; hasta entonces, lo que se compare con él no se lee como resultado."
    );
    expect(fraseProvisionales({ derivados: marcaProvisional(["venta_mes", "ganancia_mes", "margen"]) }, "este punto de partida")).toBe(
      "2 números de este punto de partida son provisionales: Ventas del mes, Lo que te quedó libre. Salen de un documento que falta revisar; hasta entonces, lo que se compare con ellos no se lee como resultado."
    );
  });
});
