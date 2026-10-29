/**
 * LA VISTA «NÚMEROS» DE LA CONSULTORA (16-10-2026) — clientes/8x-plan/spec-vistas-limpias.md §5.
 *
 * Lo que se fija:
 *  - `marcaDe`: cinco marcas y nada más (comprobado · de memoria · de un documento, sin revisar · no lo sabe · falta);
 *  - `filasVitales`: nueve filas en el orden de VITALES; los tres mensuales con seis barras que terminan en el mes
 *    pasado; un mes sin cifra es null (rayado), nunca cero; lo descartado no cuenta;
 *  - la línea de ventas, la meta, la referencia (equilibrio o mejor época) y las cuatro cifras que salen de los números;
 *  - las fugas: «no aplica» (la empresa dijo que no) frente a «sin dato» (aplica y falta algo) y frente a «no se sabe si
 *    aplica» (nadie lo dijo);
 *  - la pantalla /empresa/[id]/numeros con la base en memoria: con dos meses hay línea, con uno el aviso; aparece el
 *    tablero de rentabilidad; lo que no cuadra; y una empresa vacía no pinta ningún «S/ 0» inventado.
 *
 * Cómo se prueba, para no llamar verificado a lo que no lo está: `supabaseAdmin()` es la base en memoria de
 * tests/fixtures/base-falsa.ts y la pantalla se renderiza a HTML con renderToStaticMarkup. Nadie la abrió en un
 * navegador: el globo de la línea y los formularios no se ejecutan aquí. La fecha se fija en el 16-10-2026 (solo Date).
 * La empresa es FICTICIA (regla del 70a3701).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type BaseFalsa, type Fila } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), redirect: () => {}, usePathname: () => "/empresa/x/numeros" }));

import { VITALES, derivados, type Metrica } from "@/lib/metricas";
import { porDefecto } from "@/lib/formato";
import { tableroRentabilidad, FICHA_VACIA, type FichaNegocio } from "@/lib/rentabilidad";
import {
  marcaDe,
  filasVitales,
  conteoMarcas,
  partesMarcas,
  cifraVital,
  puntosDeVenta,
  ventaArriba,
  metaDeFicha,
  doradaDe,
  referenciaDeLinea,
  cifrasDerivadas,
  fugasDe,
  queNoCuadra,
  resumenProductos,
  sumarMeses,
  MESES_BARRAS,
  MAX_MESES_LINEA,
} from "@/lib/numeros-vista";
import { emparejarDeclaradoExtraido, type MetricaGuardada } from "@/lib/rules/contradiccion-numerica";

vi.setConfig({ testTimeout: 30_000 });

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Jeans del Valle (ficticia)
/** Un cero en dinero que nadie dijo: «S/ 0» seguido de algo que no es un decimal. */
const CERO_INVENTADO = /S\/\s0(?![.,]?\d)/;

const m = (clave: string, periodo: string, valor: number | null, estado: string): Metrica => ({ clave, periodo, valor, estado });

// ─────────────────────── marcaDe ───────────────────────

describe("marcaDe: cinco marcas", () => {
  it("cada estado con su marca y su chip", () => {
    expect(marcaDe("verificado")).toMatchObject({ clave: "comprobado", texto: "comprobado", clase: "ok" });
    expect(marcaDe("contado")).toMatchObject({ clave: "de_memoria", texto: "de memoria", clase: "neutro" });
    expect(marcaDe("declarado")).toMatchObject({ clave: "de_memoria", clase: "neutro" });
    expect(marcaDe("extraido")).toMatchObject({ clave: "documento", texto: "de un documento, sin revisar", clase: "espera" });
    expect(marcaDe("sin_dato")).toMatchObject({ clave: "no_lo_sabe", texto: "no lo sabe", clase: "neutro" });
    // Sin fila: «falta», sin chip (se dibuja rayado).
    expect(marcaDe(null, false)).toMatchObject({ clave: "falta", texto: "falta", clase: null });
  });

  it("lo descartado es «falta»; lo extraído nunca es «comprobado»; lo que llegó sin rótulo no se da por comprobado", () => {
    expect(marcaDe("descartado").clave).toBe("falta");
    expect(marcaDe("extraido").clave).not.toBe("comprobado");
    expect(marcaDe(null).clave).toBe("de_memoria");
    expect(marcaDe("").clave).toBe("de_memoria");
  });
});

// ─────────────────────── filasVitales ───────────────────────

describe("filasVitales: los nueve, fila por fila", () => {
  const METRICAS: Metrica[] = [
    m("venta_mes", "2026-09", 41800, "contado"),
    m("venta_mes", "2026-08", 39900, "verificado"),
    m("venta_mes", "2026-06", 0, "contado"), // un cero contado sí es cero
    m("venta_mes", "2026-05", 50000, "descartado"), // no cuenta
    m("venta_mes", "epoca_dorada", 60000, "contado"), // no es la cifra de hoy
    m("utilidad_mes", "2026-09", null, "sin_dato"), // sinónimo de ganancia_mes
    m("gasto_fijo_mes", "actual", 8000, "contado"),
    m("caja_hoy", "actual", 3200, "extraido"),
    m("precio_producto_estrella", "actual", 80, "verificado"),
    m("deuda_propia", "actual", 15000, "contado"),
    m("merma_mes", "2026-09", 300, "contado"), // no es vital: no entra
  ];
  const filas = filasVitales(METRICAS, "2026-09");
  const de = (clave: string) => filas.find((f) => f.clave === clave)!;

  it("nueve filas, en el orden de VITALES", () => {
    expect(filas).toHaveLength(9);
    expect(filas.map((f) => f.clave)).toEqual(VITALES.map((v) => v.clave));
  });

  it("los mensuales llevan seis barras que terminan en el mes pasado; los demás, ninguna", () => {
    for (const f of filas) {
      if (f.mensual) expect(f.barras, f.clave).toHaveLength(MESES_BARRAS);
      else expect(f.barras, f.clave).toBeNull();
    }
    expect(filas.filter((f) => f.mensual).map((f) => f.clave)).toEqual(["venta_mes", "ganancia_mes", "gasto_fijo_mes"]);
    expect(de("venta_mes").barras!.map((b) => b.periodo)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  });

  it("un hueco es null (rayado), un cero contado es 0, lo descartado no aparece, lo no comprobado va en contorno", () => {
    const b = de("venta_mes").barras!;
    expect(b.map((x) => x.valor)).toEqual([null, null, 0, null, 39900, 41800]);
    expect(b.find((x) => x.periodo === "2026-08")!.dicho).toBe(false); // verificado: relleno
    expect(b.find((x) => x.periodo === "2026-09")!.dicho).toBe(true); // contado: contorno
    expect(b.filter((x) => x.valor == null).every((x) => !x.dicho)).toBe(true);
    // El gasto fijo es «de hoy», sin mes: sus seis meses van rayados, no se reparte en los meses.
    expect(de("gasto_fijo_mes").barras!.every((x) => x.valor == null)).toBe(true);
  });

  it("la cifra es la del mes más reciente con cifra, con su marca; el «no lo sé» y lo que falta se distinguen", () => {
    expect(de("venta_mes")).toMatchObject({ valor: 41800, periodo: "2026-09" });
    expect(de("venta_mes").marca.clave).toBe("de_memoria");
    expect(de("ganancia_mes")).toMatchObject({ valor: null, periodo: null });
    expect(de("ganancia_mes").marca.clave).toBe("no_lo_sabe");
    expect(de("caja_hoy").marca.clave).toBe("documento");
    expect(de("precio_producto_estrella").marca.clave).toBe("comprobado");
    for (const k of ["costo_producto_estrella", "conversion_de_cada_10", "deuda_clientes"]) {
      expect(de(k).marca.clave, k).toBe("falta");
      expect(de(k).valor, k).toBeNull();
    }
  });

  it("el conteo suma nueve y la barra segmentada nombra lo de memoria y lo del documento", () => {
    const c = conteoMarcas(filas);
    expect(c).toEqual({ comprobado: 1, de_memoria: 3, documento: 1, no_lo_sabe: 1, falta: 3 });
    const partes = partesMarcas(c);
    expect(partes.reduce((a, p) => a + p.n, 0)).toBe(9);
    expect(partes.map((p) => p.tipo)).toEqual(["s1", "s2", "s4", "s3"]);
    expect(partes[1]!.texto).toBe("de memoria o de un documento");
    expect(partesMarcas({ comprobado: 0, de_memoria: 2, documento: 0, no_lo_sabe: 0, falta: 7 })[1]!.texto).toBe("de memoria");
  });

  it("si hay un mes con cifra después del mes pasado, la tira termina en él; sin mes pasado ni meses, queda vacía", () => {
    const f = filasVitales([m("venta_mes", "2026-10", 9000, "contado")], "2026-09");
    expect(f[0]!.barras!.at(-1)).toMatchObject({ periodo: "2026-10", valor: 9000 });
    expect(filasVitales([], null).find((x) => x.clave === "venta_mes")!.barras).toEqual([]);
    expect(filasVitales([], "2026-09").every((x) => x.marca.clave === "falta")).toBe(true);
  });

  it("cada cifra con su unidad: soles con la moneda de la empresa, «de cada 10» sin soles", () => {
    expect(cifraVital(41800, "soles", porDefecto)).toBe("S/ 41,800");
    expect(cifraVital(149.5, "soles", porDefecto)).toBe("S/ 149.50");
    expect(cifraVital(3, "de_cada_10", porDefecto)).toBe("3 de cada 10");
    expect(cifraVital(41800, "soles", { ...porDefecto, pais: "MX", moneda: "MXN" })).toBe("$41,800");
  });
});

// ─────────────────────── La línea y las cifras ───────────────────────

describe("la línea de ventas y lo que sale de los números", () => {
  it("meses seguidos, con el hueco en null y un año como mucho", () => {
    const p = puntosDeVenta([m("venta_mes", "2026-07", 100, "contado"), m("venta_mes", "2026-09", 300, "extraido"), m("venta_mes", "2026-08", 1, "descartado")]);
    expect(p.map((x) => [x.periodo, x.valor])).toEqual([["2026-07", 100], ["2026-08", null], ["2026-09", 300]]);
    expect(p.at(-1)).toMatchObject({ corto: "set", largo: "Setiembre 2026", provisional: true });
    const largo = Array.from({ length: 20 }, (_, i) => m("venta_mes", sumarMeses("2025-01", i), 1000 + i, "contado"));
    expect(puntosDeVenta(largo)).toHaveLength(MAX_MESES_LINEA);
    expect(puntosDeVenta([])).toEqual([]);
  });

  it("la venta de arriba: meta, cambio contra el mes anterior; sin meta no se inventa una", () => {
    const ms = [m("venta_mes", "2026-09", 41800, "contado"), m("venta_mes", "2026-08", 38000, "verificado")];
    expect(ventaArriba(ms, 55000)).toMatchObject({ valor: 41800, mes: "setiembre de 2026", pctMeta: 76, cambioPct: 10, mesAnterior: "agosto" });
    expect(ventaArriba(ms, null)).toMatchObject({ pctMeta: null, meta: null });
    expect(ventaArriba([], 55000)).toBeNull();
    expect(metaDeFicha({ meta_venta_mensual: "55,000" })).toBe(55000);
    expect(metaDeFicha({ meta_venta_mensual: "0" })).toBeNull();
    expect(metaDeFicha(null)).toBeNull();
  });

  it("la referencia: el equilibrio de la empresa; si no hay, la mejor época; si tampoco, ninguna", () => {
    const conEquilibrio = [m("venta_mes", "2026-09", 40000, "contado"), m("costo_variable_mes", "2026-09", 20000, "contado"), m("gasto_fijo_mes", "2026-09", 8000, "contado")];
    const d = derivados(conEquilibrio);
    expect(referenciaDeLinea(d, { valor: 60000, provisional: false }, porDefecto)).toEqual({ valor: 16000, texto: "cubre gastos: S/ 16,000", de: "equilibrio" });
    const sinEquilibrio = derivados([m("venta_mes", "2026-09", 40000, "contado")]);
    const dorada = doradaDe([m("venta_mes", "epoca_dorada", 60000, "contado")]);
    expect(referenciaDeLinea(sinEquilibrio, dorada, porDefecto)).toMatchObject({ valor: 60000, de: "dorada" });
    expect(referenciaDeLinea(sinEquilibrio, null, porDefecto)).toBeNull();
    expect(doradaDe([m("venta_mes", "epoca_dorada", 60000, "descartado")])).toBeNull();
  });

  it("las cuatro cifras: sin números, ninguna inventada y cada una dice por qué", () => {
    const c = cifrasDerivadas(derivados([]), porDefecto);
    expect(c.map((x) => x.clave)).toEqual(["margen", "equilibrio", "dias", "sobre"]);
    for (const x of c) {
      expect(x.cifra, x.clave).toBeNull();
      expect(x.motivo, x.clave).toBeTruthy();
    }
  });

  it("las cuatro cifras con números, y la que se apoya en un documento sin revisar sale provisional", () => {
    const d = derivados([
      m("venta_mes", "2026-09", 40000, "contado"),
      m("ganancia_mes", "2026-09", 6000, "contado"),
      m("costo_variable_mes", "2026-09", 20000, "contado"),
      m("gasto_fijo_mes", "2026-09", 8000, "contado"),
      m("caja_hoy", "actual", 4000, "extraido"),
    ]);
    const [margen, equilibrio, dias, sobre] = cifrasDerivadas(d, porDefecto);
    expect(margen!.cifra).toMatchObject({ numero: "15", unidad: "%" });
    expect(equilibrio!.cifra).toMatchObject({ simbolo: "S/", numero: "16,000" });
    expect(dias!.cifra).toMatchObject({ numero: "15", unidad: "días" });
    expect(dias!.provisional).toBe(true);
    expect(margen!.provisional).toBe(false);
    expect(sobre!.cifra).toMatchObject({ signo: "", numero: "24,000", unidad: "por encima" });
  });
});

// ─────────────────────── Las fugas ───────────────────────

describe("fugas: «no aplica», «sin dato» y «no se sabe si aplica» no son lo mismo", () => {
  const ficha = (f: Partial<FichaNegocio>): FichaNegocio => ({ ...FICHA_VACIA, ...f }) as FichaNegocio;
  const tablero = (f: FichaNegocio, metricas: Metrica[] = []) => tableroRentabilidad({ lineas: [], costos: [], ficha: f, operaciones: [], metricas, config: porDefecto });

  it("módulo en «no»: no aplica; nadie lo dijo: no se sabe; encendido sin datos: sin dato con su motivo", () => {
    const f = ficha({ modulos: { moneda: false, credito: true }, credito: {}, inventario: {} });
    const [moneda, credito, inventario] = fugasDe(tablero(f, [m("venta_mes", "2026-09", 40000, "contado")]), f.modulos, porDefecto);
    expect(moneda).toMatchObject({ estado: "no_aplica", cifra: null });
    expect(credito).toMatchObject({ estado: "sin_dato", cifra: null });
    expect(credito!.nota).toMatch(/^Falta: de cada 10 ventas, cuántas son al crédito/);
    expect(inventario).toMatchObject({ estado: "sin_preguntar", cifra: null });
  });

  it("con datos, la cifra en rango y lo que la acompaña; sin ficha, «no se pudo leer»", () => {
    const f = ficha({
      modulos: { credito: true, inventario: true },
      credito: { de_cada_10: { valor: 3, estado: "contado" }, dias: { valor: 30, estado: "contado" }, incobrables_de_cada_10: { desde: 1, hasta: 2, estado: "estimado" } },
      inventario: { parado: { valor: 12000, estado: "contado" } },
    } as Partial<FichaNegocio>);
    const [, credito, inventario] = fugasDe(tablero(f, [m("venta_mes", "2026-09", 40000, "contado")]), f.modulos, porDefecto);
    expect(credito).toMatchObject({ estado: "valor", cifra: "entre S/ 1,200 y S/ 2,400" });
    expect(credito!.nota).toContain("En la calle hoy: S/ 12,000");
    expect(inventario).toMatchObject({ estado: "valor", cifra: "S/ 12,000" });
    expect(fugasDe(null, null, porDefecto).every((x) => x.estado === "no_leido")).toBe(true);
  });
});

// ─────────────────────── Producto y rentabilidad, en corto ───────────────────────

describe("resumenProductos: la rentabilidad en corto", () => {
  it("los tres que más dejan, al sol entero y en rango si se dijo en rango; los que restan no entran", () => {
    const p = (id: string, contribucion_mes: { bajo: number; alto: number } | null, cuadrante: string | null = null) => ({ id, nombre: `Producto ${id}`, contribucion_mes, cuadrante });
    const t = {
      productos: [p("a", { bajo: 900.4, alto: 900.4 }, "caballo"), p("b", { bajo: 2000, alto: 2600 }, "estrella"), p("c", { bajo: -300, alto: -300 }, "hueso"), p("d", null), p("e", { bajo: 100, alto: 100 }, "joya"), p("f", { bajo: 50, alto: 50 })],
      noventaDiez: { valor: { lineas: ["b", "a"], cuantas: 2, de: 5, pct_lineas: 0.4, pct_contribucion: 0.9312, restan: ["c"] } },
    } as unknown as Parameters<typeof resumenProductos>[0];
    const r = resumenProductos(t, porDefecto);
    expect(r).toMatchObject({ total: 6, conDatos: 5, noventa: { cuantas: 2, de: 5, pct: 93 } });
    expect(r.top).toEqual([
      { id: "b", nombre: "Producto b", deja: "entre S/ 2,000 y S/ 2,600", cuadrante: "Estrella" },
      { id: "a", nombre: "Producto a", deja: "S/ 900", cuadrante: "Caballo de trabajo" },
      { id: "e", nombre: "Producto e", deja: "S/ 100", cuadrante: "Joya escondida" },
    ]);
  });
});

// ─────────────────────── Lo que no cuadra ───────────────────────

describe("queNoCuadra: solo los pares que se contradicen", () => {
  it("las dos cifras del mismo mes, con quién la declaró y la diferencia", () => {
    const filas: MetricaGuardada[] = [
      { clave: "venta_mes", periodo: "2026-09", valor: 41800, estado: "contado", cifra_desplazada: { lado: "extraido", valor: 52000, nota: "ventas-setiembre.xlsx" } },
      { clave: "gasto_fijo_mes", periodo: "2026-09", valor: 8000, estado: "contado", cifra_desplazada: { lado: "extraido", valor: 8100 } },
    ];
    const n = queNoCuadra(emparejarDeclaradoExtraido(filas));
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ clave: "venta_mes", periodo: "Setiembre 2026", quien: "Declarado", declarado: "S/ 41,800", documento: "S/ 52,000", diferenciaPct: 24 });
  });
});

// ─────────────────────── La pantalla ───────────────────────

const METRICAS: Fila[] = [
  { company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 41800, estado: "contado" },
  { company_id: EMP, clave: "venta_mes", periodo: "2026-08", valor: 39900, estado: "verificado" },
  { company_id: EMP, clave: "venta_mes", periodo: "epoca_dorada", valor: 60000, estado: "contado" },
  { company_id: EMP, clave: "costo_variable_mes", periodo: "2026-09", valor: 22000, estado: "contado" },
  { company_id: EMP, clave: "gasto_fijo_mes", periodo: "2026-09", valor: 8000, estado: "contado" },
  { company_id: EMP, clave: "ganancia_mes", periodo: "2026-09", valor: null, estado: "sin_dato" },
  { company_id: EMP, clave: "caja_hoy", periodo: "actual", valor: 3200, estado: "extraido" },
  { company_id: EMP, clave: "precio_producto_estrella", periodo: "actual", valor: 80, estado: "verificado" },
  { company_id: EMP, clave: "deuda_propia", periodo: "actual", valor: 15000, estado: "contado" },
];

const JEAN: Fila = {
  id: "11111111-1111-4111-8111-000000000001",
  company_id: EMP,
  codigo: null,
  nombre: "Jean clásico azul",
  tipo: "producto",
  precio: 80,
  costo_variable_unitario: 37,
  unidades_periodo: null,
  periodo: null,
  origen: "declarado",
  decision: null,
  decision_motivo: null,
  modelo: "fabrica_y_vende",
  grupo: "Pantalones",
  componentes_costo: [{ nombre: "tela", valor: 22, estado: "contado" }, { nombre: "costura", valor: 15, estado: "estimado" }],
  unidades_mes: 120,
  estados: { precio: "contado", costo: "estimado", unidades: "estimado" },
  created_at: "2026-10-01T13:30:00.000Z",
};

function base(extra: Record<string, Fila[]> = {}, fallos: Record<string, { code: string; message: string }> = {}): BaseFalsa {
  const b = crearBaseFalsa(
    {
      companies: [{ id: EMP, nombre: "Jeans del Valle (ficticia)", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", ficha: { meta_venta_mensual: "55000" } }],
      company_metricas: METRICAS,
      lineas_producto: [JEAN],
      costos_mes: [],
      operaciones_moneda: [],
      ficha_negocio: [{ company_id: EMP, historia: {}, modulos: { moneda: false, credito: true }, totales: {}, moneda: {}, credito: {}, inventario: {} }],
      ...extra,
    },
    fallos
  );
  estado.base = b;
  return b;
}

async function pantalla(): Promise<string> {
  const { default: Numeros } = await import("@/app/(consultor)/empresa/[id]/numeros/page");
  const el = await Numeros({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(el!);
}

describe("consultora · /empresa/[id]/numeros", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T15:00:00.000Z"));
    await import("@/app/(consultor)/empresa/[id]/numeros/page");
  }, 180_000);
  afterAll(() => vi.useRealTimers());

  it("con dos meses: la venta arriba con su meta, la línea con el equilibrio de referencia y los nueve números", async () => {
    base();
    const h = await pantalla();
    expect(h).toContain('class="tablero"');
    expect(h).toContain("Ventas de setiembre de 2026");
    expect(h).toContain("S/ 41,800");
    expect(h).toContain("76 % de la meta");
    expect(h).toContain('aria-label="Ventas por mes. Usa las flechas para recorrer."');
    expect(h).toContain("cubre gastos: S/");
    expect(h).not.toContain("Hacen falta dos meses de ventas");
    // Los nueve, en tabla: nueve filas, con las cinco marcas.
    const cuerpo = h.slice(h.indexOf("<tbody>"), h.indexOf("</tbody>"));
    expect(cuerpo.match(/<tr>/g)).toHaveLength(9);
    for (const t of ["comprobado", "de memoria", "de un documento, sin revisar", "no lo sabe", "falta"]) expect(cuerpo).toContain(t);
    expect(h).toContain("6 de 9 respondidos");
    // La cifra que sale de un documento sin revisar lleva su rótulo junto a ella (días de aguante: la caja es extraída).
    expect(h).toContain("Provisional: sale de un documento que falta revisar.");
    expect(h).toContain("Cómo se calculó");
  });

  it("con un solo mes: el aviso en lugar de la línea; sin venta: «Todavía sin ventas contadas»", async () => {
    base({ company_metricas: [{ company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 41800, estado: "contado" }] });
    const h = await pantalla();
    expect(h).toContain("Hacen falta dos meses de ventas para dibujar la línea");
    expect(h).not.toContain("Ventas por mes. Usa las flechas");
    base({ company_metricas: [] });
    expect(await pantalla()).toContain("Todavía sin ventas contadas");
  });

  it("aparece el tablero de rentabilidad, con el enlace para editar lo que anotó la empresa", async () => {
    base();
    const h = await pantalla();
    expect(h).toContain('id="rentabilidad-titulo"');
    expect(h).toContain("Jean clásico azul");
    // En corto arriba (cuántos tienen con qué calcular y lo que más deja); lo completo, plegado.
    expect(h).toContain("1 de 1 producto tiene precio, costo y unidades al mes");
    expect(h).toContain("S/ 5,160");
    expect(h).toMatch(/<details[^>]*><summary[^>]*>Ver todo: por producto/);
    expect(h).toContain(`href="/empresa/${EMP}/producto"`);
    expect(h).toContain("Editar lo que anotó la empresa");
  });

  it("sin la tabla de líneas: lo dice con el nombre de la migración, y lo demás se pinta igual", async () => {
    base({}, { lineas_producto: { code: "42P01", message: 'relation "lineas_producto" does not exist' } });
    const h = await pantalla();
    expect(h).toContain("supabase/migracion-entrada-y-direccion.sql");
    expect(h).toContain("Los nueve números");
    expect(h).toContain("Fugas de dinero");
  });

  it("fugas: «no aplica» donde la empresa dijo que no, «sin dato» con su motivo donde aplica y falta algo", async () => {
    base();
    const h = await pantalla();
    const fugas = h.slice(h.indexOf('id="n-fugas"'), h.indexOf('id="n-cuadra"'));
    expect(fugas).toContain("Se queda en el cambio de moneda");
    expect(fugas).toContain('class="estado neutro">no aplica<');
    expect(fugas).toContain('class="sin-dato">sin dato<');
    expect(fugas).toContain("Falta: de cada 10 ventas, cuántas son al crédito o fiadas");
    expect(fugas).toContain("no se sabe si aplica");
  });

  it("lo que no cuadra: el par con sus dos cifras; sin pares, lo dice sin afirmar que todo cuadra", async () => {
    base({
      company_metricas: [
        ...METRICAS.filter((f) => !(f.clave === "venta_mes" && f.periodo === "2026-09")),
        { company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 41800, estado: "contado", cifra_desplazada: { lado: "extraido", valor: 52000 } },
      ],
    });
    const h = await pantalla();
    const bloque = h.slice(h.indexOf('id="n-cuadra"'));
    expect(bloque).toContain("Ventas del mes · Setiembre 2026");
    expect(bloque).toContain("S/ 52,000");
    expect(bloque).toContain(`href="/empresa/${EMP}/realidad"`);
    expect(bloque).toContain(`href="/empresa/${EMP}#incongruencias"`);
    base();
    const sin = await pantalla();
    expect(sin).toContain("Lo declarado y lo de los documentos cuadran, o todavía no hay con qué comparar.");
    expect(sin).toContain("No hay pares comparables todavía");
  });

  it("si no se pueden leer los números, lo dice: nunca «faltan» ni «sin ventas»", async () => {
    base({}, { company_metricas: { code: "57014", message: "canceling statement due to statement timeout" } });
    const h = await pantalla();
    expect(h).toContain("No se pudieron leer los números de la empresa");
    expect(h).not.toContain("Todavía sin ventas contadas");
    expect(h).not.toContain("respondidos");
    // El crédito sale de la venta del mes: sin los números leídos dice que no se leyó, no que falta la venta.
    const fugas = h.slice(h.indexOf('id="n-fugas"'), h.indexOf('id="n-cuadra"'));
    expect(fugas).toContain("sin la venta del mes no hay cuenta");
    expect(fugas).not.toContain("falta la venta del mes");
    // El tablero de rentabilidad avisa arriba de lo que no pudo leer.
    expect(h).toContain("No se pudo leer: los 9 números");
  });

  it("empresa recién creada: todo rayado, ningún «S/ 0» inventado, y la historia plegada", async () => {
    base({ company_metricas: [], lineas_producto: [], ficha_negocio: [] });
    const h = await pantalla();
    expect(h).not.toMatch(CERO_INVENTADO);
    expect(h).toContain("Todavía sin ventas contadas");
    expect(h).toContain("0 de 9 respondidos");
    expect((h.match(/class="sin-dato">sin dato</g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(h).toContain("Historia del negocio");
    expect(h).toMatch(/<details><summary[^>]*>.*Historia del negocio/);
    // Sin ficha guardada nadie dijo si aplica: rayado, no «no aplica».
    expect(h).not.toContain(">no aplica<");
  });
});

/**
 * EL VOCABULARIO DEL CÓDIGO CONTRA EL CANDADO DE LA BASE.
 *
 * Esta prueba nace de un fallo que costó diez días y cuatro documentos. La base de producción tenía
 * un check sobre `company_metricas.estado` que ningún SQL del repositorio declaraba, y que admitía
 * tres valores donde el código escribe cinco. El lector de documentos escribe «extraido»: cada número
 * que sacaba de un documento era rechazado, el trabajo moría entero y la fuente quedaba en «leyendo»
 * para siempre. Y el mensaje de error acusaba a otra migración, que sí estaba aplicada.
 *
 * Son dos listas de las mismas palabras en dos archivos distintos, y nada las ataba. Es el mismo
 * fallo que ya había aparecido el 20-10 con el estado del expediente documental: cuando se repite una
 * forma de romperse, la guarda deja de ser para un caso y pasa a ser para la clase.
 */
describe("los valores que el código escribe son los que la base admite", () => {
  const CHECK = readFileSync(path.join(__dirname, "..", "supabase", "migracion-estado-metrica.sql"), "utf8");

  it("cada estado de EstadoMetrica está en el check, y cada uno del check está en EstadoMetrica", () => {
    // Los cinco del código, escritos a mano: leerlos del mismo sitio que la migración haría que un
    // valor olvidado desapareciera de las dos listas a la vez y la prueba siguiera verde.
    const enElCodigo = ["contado", "verificado", "extraido", "descartado", "sin_dato"].sort();
    const lista = CHECK.match(/check \(estado in \(([^)]+)\)\)/);
    expect(lista, "no se pudo leer la lista de estados del check").not.toBeNull();
    const enLaBase = [...lista![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(enLaBase, "la base admite estados que el código no escribe, o al revés").toEqual(enElCodigo);
  });

  it("y «extraido» está entre ellos: es el que escribe el lector de documentos en cada número", () => {
    expect(CHECK).toMatch(/'extraido'/);
  });

  it("el check se reemplaza entero, porque un check no se amplía", () => {
    expect(CHECK).toMatch(/drop constraint if exists company_metricas_estado_check/);
  });

  it("el error del extractor ya no acusa a una migración concreta: la pista sale del mensaje de Postgres", () => {
    const EXTRAER = readFileSync(path.join(__dirname, "..", "src", "lib", "jobs", "handlers", "extraer.ts"), "utf8");
    // La pista fija mandó a buscar diez días al lugar equivocado, y con autoridad.
    expect(EXTRAER, "volvió la pista fija que acusaba a una migración inocente").not.toMatch(/PISTA_MIGRACION/);
    expect(EXTRAER).toMatch(/violates check constraint/);
  });
});
