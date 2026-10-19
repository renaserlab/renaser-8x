/**
 * «TUS NÚMEROS» ALIMENTADO POR LA CAJA (Finanzas, 19-10-2026). La caja escribe en company_metricas con origen 'caja'
 * (supabase/migracion-finanzas.sql; la base se prueba en tests/sql/finanzas.test.ts). Aquí, lo que se ve y lo que se
 * deja escribir:
 *  - lo que sale de la caja se rotula «de tu caja» (o «de tus cobros», «de tus pagos») con enlace a su pestaña;
 *  - «Tus ventas mes a mes» distingue los meses de la caja de los contados;
 *  - el formulario no ofrece escribir un (número, mes) que sale de la caja, y la ruta lo rechaza con 409 y la frase
 *    «sale de tu caja: corrígelo en Finanzas»;
 *  - para las contradicciones, lo de la caja es el lado declarado (no se cambió esa regla), con su rótulo propio;
 *  - la vista de la consultora dice «de su caja (Finanzas)» donde dice de dónde sale cada número.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AVISO_SALE_DE_CAJA,
  ORIGEN_CAJA,
  clavesDeCaja,
  deDondeSaleDeCaja,
  derivados,
  esDeCaja,
  etiquetaEstado,
  radiografia,
  serieDeVentas,
  type Metrica,
} from "@/lib/metricas";
import { MARCAS, MARCA_DE_CAJA, conteoMarcas, filasVitales, marcaDe, queNoCuadra, ventaArriba } from "@/lib/numeros-vista";
import { ROTULO_DE_CAJA, emparejarDeclaradoExtraido, ladoDeMetrica, rotuloDeDeclarado, type MetricaGuardada } from "@/lib/rules/contradiccion-numerica";

const raiz = path.join(__dirname, "..");
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

const caja = (clave: string, periodo: string, valor: number): Metrica => ({ clave, periodo, valor, estado: "contado", origen: "caja" });
const contado = (clave: string, periodo: string, valor: number): Metrica => ({ clave, periodo, valor, estado: "contado", origen: "declarado" });

/** Como la demo: junio a agosto contados de memoria; septiembre y octubre, de la caja. */
const METRICAS: Metrica[] = [
  contado("venta_mes", "2026-06", 39800),
  contado("venta_mes", "2026-07", 41500),
  contado("venta_mes", "2026-08", 43200),
  caja("venta_mes", "2026-09", 45900),
  caja("venta_mes", "2026-10", 48320),
  caja("costo_variable_mes", "2026-09", 24800),
  caja("gasto_fijo_mes", "2026-09", 11930),
  caja("ganancia_mes", "2026-09", 9170),
  caja("caja_hoy", "actual", 21600),
  caja("deuda_clientes", "actual", 6400),
  caja("deuda_propia", "actual", 3500),
  contado("precio_producto_estrella", "actual", 38),
];

describe("de dónde sale lo de la caja", () => {
  it("esDeCaja mira solo el origen", () => {
    expect(ORIGEN_CAJA).toBe("caja");
    expect(esDeCaja(caja("venta_mes", "2026-09", 1))).toBe(true);
    expect(esDeCaja(contado("venta_mes", "2026-09", 1))).toBe(false);
    expect(esDeCaja({ origen: null })).toBe(false);
    expect(esDeCaja(null)).toBe(false);
  });
  it("cada número dice de qué parte de Finanzas sale y adónde ir a corregirlo", () => {
    expect(deDondeSaleDeCaja("venta_mes")).toEqual({ texto: "de tu caja", href: "/os/finanzas" });
    expect(deDondeSaleDeCaja("caja_hoy")).toEqual({ texto: "de tu caja", href: "/os/finanzas" });
    expect(deDondeSaleDeCaja("deuda_clientes")).toEqual({ texto: "de tus cobros", href: "/os/finanzas/cobros" });
    expect(deDondeSaleDeCaja("deuda_propia")).toEqual({ texto: "de tus pagos", href: "/os/finanzas/pagos" });
  });
  it("clavesDeCaja: «clave|periodo» de lo que no se escribe a mano", () => {
    const k = clavesDeCaja(METRICAS);
    expect(k).toContain("venta_mes|2026-09");
    expect(k).toContain("caja_hoy|actual");
    expect(k).not.toContain("venta_mes|2026-08");
    expect(k).not.toContain("precio_producto_estrella|actual");
  });
  it("etiquetaEstado dice «de tu caja (Finanzas)»; sin origen, lo de siempre", () => {
    expect(etiquetaEstado("contado", "caja")).toBe("de tu caja (Finanzas)");
    expect(etiquetaEstado("contado")).toBe("contado de memoria");
    expect(etiquetaEstado("contado", "declarado")).toBe("contado de memoria");
  });
  it("la frase del formulario y de la ruta", () => {
    expect(AVISO_SALE_DE_CAJA).toBe("Sale de tu caja: corrígelo en Finanzas.");
  });
});

describe("las cuentas no cambian: lo de la caja es un número más", () => {
  it("serieDeVentas marca los meses de la caja y deja los contados sin marca", () => {
    const s = serieDeVentas(METRICAS);
    expect(s.map((m) => [m.periodo, m.deCaja === true])).toEqual([
      ["2026-10", true],
      ["2026-09", true],
      ["2026-08", false],
      ["2026-07", false],
      ["2026-06", false],
    ]);
    expect(s.every((m) => m.provisional === false)).toBe(true);
  });
  it("la radiografía cuenta lo de la caja como respondido, y lo que no es de los nueve lleva su rótulo", () => {
    const r = radiografia(METRICAS);
    expect(r.faltan.map((v) => v.clave).sort()).toEqual(["conversion_de_cada_10", "costo_producto_estrella"]);
    const cv = r.otros.find((o) => o.clave === "costo_variable_mes");
    expect(cv).toMatchObject({ deCaja: true, etiquetaEstado: "de tu caja (Finanzas)" });
  });
  it("derivados usa la caja como cualquier cifra contada, y la fuente lo dice", () => {
    const d = derivados(METRICAS);
    expect(d.margen).not.toBeNull();
    expect(d.provisional.margen).toBe(false);
    expect(JSON.stringify(d.detalle.margen)).toMatch(/de tu caja \(Finanzas\)/);
  });
});

describe("la consultora ve «de su caja»", () => {
  it("marcaDe: lo de la caja cuenta como sin comprobar (de memoria) pero se dice de dónde salió", () => {
    expect(marcaDe("contado", true, "caja")).toBe(MARCA_DE_CAJA);
    expect(MARCA_DE_CAJA).toMatchObject({ clave: "de_memoria", texto: "de su caja (Finanzas)", clase: "neutro" });
    expect(marcaDe("verificado", true, "caja")).toBe(MARCAS.comprobado);
    expect(marcaDe("descartado", true, "caja")).toBe(MARCAS.falta);
    expect(marcaDe("contado")).toBe(MARCAS.de_memoria);
  });
  it("filasVitales: las filas de la caja llevan su marca y la barra sigue sumando nueve", () => {
    const filas = filasVitales(METRICAS, "2026-09");
    const de = (k: string) => filas.find((f) => f.clave === k)!;
    expect(de("venta_mes").marca).toBe(MARCA_DE_CAJA);
    expect(de("deuda_clientes").marca).toBe(MARCA_DE_CAJA);
    expect(de("precio_producto_estrella").marca).toBe(MARCAS.de_memoria);
    const c = conteoMarcas(filas);
    expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(9);
    expect(c.de_memoria).toBe(7);
  });
  it("ventaArriba dice si la venta del último mes salió de la caja", () => {
    expect(ventaArriba(METRICAS, null)).toMatchObject({ periodo: "2026-10", deCaja: true });
    expect(ventaArriba([contado("venta_mes", "2026-08", 43200)], null)).toMatchObject({ deCaja: false });
  });
});

describe("contradicciones: la caja es el lado declarado (la regla no cambió)", () => {
  const filaCaja: MetricaGuardada = { clave: "venta_mes", periodo: "2026-09", valor: 45900, estado: "contado", origen: "caja" };
  it("ladoDeMetrica: una cifra de la caja es «declarado»", () => {
    expect(ladoDeMetrica(filaCaja)).toBe("declarado");
  });
  it("frente a un documento del mismo mes que no cuadra, la contradicción dice «De su caja (Finanzas)»", () => {
    const pares = emparejarDeclaradoExtraido([
      { ...filaCaja, cifra_desplazada: { lado: "extraido", valor: 60000, nota: "ventas-setiembre.xlsx" } },
    ]);
    expect(pares).toHaveLength(1);
    expect(pares[0]!.veredicto.tipo).toBe("CONTRADICCION");
    expect(pares[0]!.veredicto.declarado.fuente).toBe("lo que registró en su caja (Finanzas)");
    const [n] = queNoCuadra(pares);
    expect(n).toMatchObject({ quien: ROTULO_DE_CAJA, declarado: "S/ 45,900", documento: "S/ 60,000" });
    expect(ROTULO_DE_CAJA).not.toBe(rotuloDeDeclarado(null));
  });
});

describe("la pantalla y la ruta", () => {
  const pagina = leer("src/app/(cliente)/portal/numeros/page.tsx");
  const formulario = leer("src/components/cliente/MisNumeros.tsx");
  const ruta = leer("src/app/api/portal/numeros/route.ts");
  const consultora = leer("src/app/(consultor)/empresa/[id]/numeros/page.tsx");

  it("«Tus números» lee el origen, avisa de los meses de la caja y lleva a Finanzas", () => {
    expect(pagina).toMatch(/select\("clave,periodo,valor,estado,origen"\)/);
    expect(pagina).toMatch(/salen" : "sale"|"sale" : "salen"/);
    expect(pagina).toContain("de tu caja.</b>");
    expect(pagina).toMatch(/href="\/os\/finanzas">Ir a Finanzas</);
    expect(pagina).toContain("deCaja={clavesDeCaja(deCaja)}");
  });
  it("«Tus ventas mes a mes» tiene leyenda: De tu caja · Lo contaste", () => {
    expect(pagina).toMatch(/<i className="caja" \/>De tu caja/);
    expect(pagina).toMatch(/<i className="contado" \/>Lo contaste/);
  });
  it("el formulario no ofrece escribir lo de la caja: lo dice y lleva a corregirlo", () => {
    expect(formulario).toMatch(/esDeCaja\("venta_mes", mesPasado\.periodo\)/);
    expect(formulario).toMatch(/esDeCaja\("costo_variable_mes", mesPasado\.periodo\)/);
    expect(formulario).toMatch(/esDeCaja\("venta_mes", m\.periodo\) \?\s*\(\s*<option[^>]*disabled/);
    expect(formulario).toContain("corrígelo en Finanzas");
  });
  it("la ruta no toca una fila de la caja y responde 409 con la frase", () => {
    expect(ruta).toMatch(/existentes\.some\(\(p\) => p\.origen === ORIGEN_CAJA\)/);
    expect(ruta).toMatch(/motivo: "caja"/);
    expect(ruta).toContain("AVISO_SALE_DE_CAJA");
    expect(ruta).toMatch(/verificados\.length > 0 \|\| deCaja\.length > 0[\s\S]{0,1200}status: 409/);
  });
  it("la vista de la consultora pasa el origen a las cuentas", () => {
    expect(consultora).toMatch(/origen: f\.origen \?\? null/);
    expect(consultora).toContain("De su caja (Finanzas)");
  });
  it("los estilos de lo de la caja viven en fin-numeros.css, sin oro", () => {
    const css = leer("src/design/fin-numeros.css");
    for (const clase of [".fin-de-caja", ".fin-aviso-caja", ".fin-leyenda", ".fin-meses-origen", ".fin-sale-de-caja"]) expect(css).toContain(clase);
    expect(css).not.toMatch(/var\(--(champan|champan-claro|oro)\)/);
  });
});

describe("la barra de los nueve, en la vista de la consultora", () => {
  it("nombra lo de su caja aparte de lo de memoria; sin caja, dice lo de siempre", async () => {
    const { partesMarcas } = await import("@/lib/numeros-vista");
    const c = { comprobado: 0, de_memoria: 7, documento: 0, no_lo_sabe: 0, falta: 2 };
    expect(partesMarcas(c, 6)[1]).toMatchObject({ n: 7, texto: "de memoria o de su caja" });
    expect(partesMarcas({ ...c, de_memoria: 6 }, 6)[1]!.texto).toBe("de su caja");
    expect(partesMarcas({ ...c, documento: 1 }, 6)[1]!.texto).toBe("de memoria, de su caja o de un documento");
    expect(partesMarcas(c)[1]!.texto).toBe("de memoria");
  });
});
