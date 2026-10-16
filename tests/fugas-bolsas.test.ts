/**
 * LAS FUGAS EN TRES BOLSAS QUE NUNCA SE SUMAN (src/lib/perdida.ts, pieza 3 del plan del 16-10-2026).
 *
 * La tarjeta vieja del dueño, «En riesgo al mes», sumaba lo vendido y no cobrado con la distancia a su mejor época. Lo
 * segundo es lo que podría vender, no dinero que se escapa: con una mejor época muy arriba, el dueño leía decenas de
 * miles «en riesgo» que nunca tuvo. Aquí se fija:
 *  1. La caja y la oportunidad no se suman nunca (y lo que te deben, que es dinero parado, no entra en la cifra del mes).
 *  2. Sin dato no aparece cifra: ni «S/ 0» ni un monto inventado.
 *  3. El texto que lee el dueño sobre la oportunidad no usa palabras de alarma ni el color de alarma.
 *
 * Todas las cifras son de una empresa FICTICIA (nunca datos de un cliente real: regla del commit 70a3701).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import * as perdida from "@/lib/perdida";
import { BOLSA, BOLSAS, bolsasDeFugas, cifraDeBolsa, cifraDeFuga, montoDeBolsa, resumenDelInforme, tarjetaDelDueno, type Fugas, type MonedaLeida } from "@/lib/perdida";
import { fugaDeMoneda, FICHA_VACIA, type OperacionMoneda } from "@/lib/rentabilidad";
import type { Metrica } from "@/lib/rules/anomalias";

const leer = (rel: string) => readFileSync(path.join(__dirname, "..", rel), "utf8");
const m = (clave: string, periodo: string, valor: number | null, estado = "contado"): Metrica => ({ clave, periodo, valor, estado });

/** Taller ficticio: en julio vendió 25,000 y cobró 18,000; en su mejor época vendía 45,000; le deben 12,000. */
const TALLER: Metrica[] = [
  m("venta_mes", "2026-06", 24000),
  m("venta_mes", "2026-07", 25000),
  m("cobrado_mes", "2026-07", 18000),
  m("venta_mes", "epoca_dorada", 45000),
  m("deuda_clientes", "actual", 12000),
];

/** Una venta cobrada en dólares (ficticia): se esperaban 3,800 y llegaron 3,700 a la cuenta. */
const OPERACION: OperacionMoneda = {
  id: "op1", fecha_venta: "2026-07-02", fecha_cobro: "2026-07-20", dias_cobro: 18, moneda: "USD", monto: 1000,
  tc_cotizado: 3.8, tc_cobro: 3.75, recibido: 3700, comisiones: 20, conversiones: 1, estado: "contado",
};
/** Con cuántas cobró el mes pasado y de cuánto fue la última, hay estimado del mes: 2 × 1,000 × 3.8 × 0.0263 = 199.88. */
const monedaConMes = (): MonedaLeida =>
  fugaDeMoneda([OPERACION], { ...FICHA_VACIA, modulos: { moneda: true }, moneda: { operaciones_mes: { valor: 2, estado: "contado" }, monto_tipico: { valor: 1000, estado: "contado" } } })!;
const monedaSinMes = (): MonedaLeida => fugaDeMoneda([OPERACION], { ...FICHA_VACIA, modulos: { moneda: true } })!;

/** Todo lo que el dueño puede leer de una cuenta de fugas, junto (tarjeta, informe y detalle). */
function textosDelDueno(f: Fugas): string[] {
  const t = tarjetaDelDueno(f);
  const r = resumenDelInforme(f);
  return [
    t.titulo, t.sub, t.enVez?.texto ?? "", t.aparte ?? "", t.oportunidad ?? "",
    ...(r.caja ?? []), ...(r.oportunidad ?? []),
    ...BOLSAS.flatMap((b) => [
      BOLSA[b].titulo, BOLSA[b].que_es, BOLSA[b].sin_dato, cifraDeBolsa(f[b]) ?? "",
      ...f[b].fugas.flatMap((x) => [x.concepto, x.base, cifraDeFuga(x)]), ...f[b].revisado, ...f[b].faltan,
    ]),
  ].filter(Boolean);
}

describe("1. la caja y la oportunidad no se suman nunca", () => {
  it("la cifra del dueño es SOLO la caja del mes: 7,000, no 27,000 (caja + mejor época) ni 19,000 (con lo que le deben)", () => {
    const f = bolsasDeFugas(TALLER);
    expect(f.caja.alMes).toEqual({ desde: 7000, hasta: 7000 });
    expect(f.oportunidad.alMes).toEqual({ desde: 20000, hasta: 20000 });
    const t = tarjetaDelDueno(f);
    expect(t.cifra).toEqual({ desde: 7000, hasta: 7000 });
    expect(t.cifra).toBe(f.caja.alMes);
    // Lo que le deben va en la caja, pero aparte de la cifra del mes: es dinero parado.
    expect(f.caja.fugas.find((x) => x.concepto === "Te deben tus clientes")).toMatchObject({ monto: 12000, mensual: false });
    expect(t.aparte).toBe("Te deben tus clientes: S/ 12,000");
    // Y la oportunidad va en su propia línea, con su propia cifra.
    expect(t.oportunidad).toBe("Lo que podrías vender: S/ 20,000 más al mes, si vuelves a vender como en tu mejor época.");
    // Ningún texto muestra la suma de las bolsas.
    for (const x of textosDelDueno(f)) expect(x, x).not.toMatch(/27,000|39,000|19,000/);
  });

  it("no hay ningún total entre bolsas: ni en lo que devuelve el cálculo ni en lo que exporta el módulo", () => {
    const f = bolsasDeFugas(TALLER);
    expect(Object.keys(f).sort()).toEqual(["caja", "horas", "oportunidad"]);
    for (const b of BOLSAS) {
      expect(Object.keys(f[b]).sort()).toEqual(["alMes", "bolsa", "faltan", "fugas", "revisado"]);
      // Cada bolsa lleva solo sus fugas, y su cifra del mes es la suma de las suyas de cada mes.
      for (const x of f[b].fugas) expect(x.bolsa).toBe(b);
      const propias = f[b].fugas.filter((x) => x.mensual);
      if (propias.length) expect(f[b].alMes!.desde).toBe(propias.reduce((s, x) => s + x.monto, 0));
    }
    expect(Object.keys(perdida)).not.toContain("proyeccionPerdida");
    expect(JSON.stringify(f)).not.toContain("total");
  });

  it("con cualquier combinación de números, la cifra de la caja nunca lleva la distancia a la mejor época", () => {
    for (const venta of [5000, 20000, 60000])
      for (const cobrado of [0, venta / 2, venta, venta * 1.1])
        for (const mejor of [venta, venta * 1.2, venta * 2, venta * 10]) {
          const f = bolsasDeFugas([m("venta_mes", "2026-08", venta), m("cobrado_mes", "2026-08", cobrado), m("venta_mes", "epoca_dorada", mejor)]);
          const t = tarjetaDelDueno(f);
          const noCobrado = Math.max(0, venta - cobrado);
          expect(t.cifra?.desde ?? null, `venta ${venta}, cobrado ${cobrado}, mejor ${mejor}`).toBe(noCobrado > 0 ? noCobrado : null);
          if (mejor > venta * 1.25) expect(f.oportunidad.alMes!.desde).toBe(mejor - venta);
          else expect(f.oportunidad.alMes).toBeNull();
        }
  });

  it("lo que se queda en el camino al cobrar en otra moneda entra en la caja (y solo en la caja)", () => {
    const f = bolsasDeFugas(TALLER, { moneda: monedaConMes() });
    const cambio = f.caja.fugas.find((x) => x.concepto === "Se quedó en el camino al cobrar en otra moneda")!;
    expect(cambio.mensual).toBe(true);
    expect(cambio.monto).toBeCloseTo(199.88, 2);
    expect(cambio.base).toContain("se quedó S/ 100 en el camino");
    expect(f.caja.alMes!.desde).toBeCloseTo(7199.88, 2);
    expect(f.oportunidad.alMes).toEqual({ desde: 20000, hasta: 20000 });
    expect(tarjetaDelDueno(f).cifra!.desde).toBeCloseTo(7199.88, 2);
    // Sin cuántas cobró el mes pasado, lo perdido en esas ventas va aparte (no es del mes) y se dice qué falta.
    const sinMes = bolsasDeFugas(TALLER, { moneda: monedaSinMes() });
    expect(sinMes.caja.alMes).toEqual({ desde: 7000, hasta: 7000 });
    expect(tarjetaDelDueno(sinMes).aparte).toBe("Te deben tus clientes: S/ 12,000 · Se quedó en el camino al cobrar en otra moneda: S/ 100");
    expect(sinMes.caja.faltan).toContain("cuántas ventas cobraste en otra moneda el mes pasado y de cuánto fue la última");
  });

  it("el informe dice cada bolsa en su frase: la caja y, aparte, lo que podría vender", () => {
    const r = resumenDelInforme(bolsasDeFugas(TALLER));
    expect(r.caja!.join("")).toBe("Según los números que la empresa contó, se le están yendo del orden de S/ 7,000 al mes.");
    expect(r.oportunidad!.join("")).toBe("Aparte, y sin sumarlo a lo anterior, podría vender del orden de S/ 20,000 más al mes si vuelve a vender como en su mejor época.");
  });

  it("ninguna pantalla vuelve a usar el total viejo ni la palabra «en riesgo» para las fugas", () => {
    for (const rel of ["src/app/(cliente)/portal/page.tsx", "src/app/(cliente)/portal/hoy/page.tsx", "src/app/(cliente)/portal/informe/page.tsx"]) {
      // Sin comentarios: los que cuentan cómo era antes pueden nombrar la tarjeta vieja.
      const src = leer(rel).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
      expect(src, rel).not.toMatch(/totalMensual|proyeccionPerdida/);
      expect(src, rel).not.toContain("En riesgo al mes");
      expect(src, rel).not.toContain("dinero en riesgo");
      expect(src, rel).toContain("bolsasDeFugas(");
    }
    // La cifra grande de la tarjeta es la de la caja.
    expect(leer("src/app/(cliente)/portal/page.tsx")).toContain("{yendo.cifra ? (");
  });
});

describe("2. sin dato no aparece cifra", () => {
  it("sin números: ninguna bolsa tiene cifra y la tarjeta lo dice rayado, sin «S/ 0»", () => {
    const f = bolsasDeFugas([]);
    for (const b of BOLSAS) {
      expect(f[b].alMes).toBeNull();
      expect(f[b].fugas).toEqual([]);
      expect(cifraDeBolsa(f[b])).toBeNull();
      expect(montoDeBolsa(f[b])).toBeNull();
      expect(f[b].faltan.length).toBeGreaterThan(0);
    }
    const t = tarjetaDelDueno(f);
    expect(t.cifra).toBeNull();
    expect(t.enVez).toEqual({ texto: "Sin dato al mes: faltan números", rayado: true });
    expect(t.aparte).toBeNull();
    expect(t.oportunidad).toBeNull();
    expect(resumenDelInforme(f)).toEqual({ caja: null, oportunidad: null });
    for (const x of textosDelDueno(f)) expect(x, x).not.toMatch(/S\/\s?0\b|\d/);
  });

  it("si no le deben nada, no aparece «Te deben S/ 0»", () => {
    const f = bolsasDeFugas([m("deuda_clientes", "actual", 0)]);
    expect(f.caja.fugas).toEqual([]);
    expect(f.caja.faltan).not.toContain("cuánto te deben tus clientes");
    for (const x of textosDelDueno(f)) expect(x, x).not.toMatch(/S\/\s?0\b/);
  });

  it("si cobró todo lo que vendió, se dice en palabras y sin cifra (no es un «S/ 0» ni un «sin dato»)", () => {
    const f = bolsasDeFugas([m("venta_mes", "2026-07", 25000), m("cobrado_mes", "2026-07", 25000)]);
    expect(f.caja.alMes).toBeNull();
    expect(f.caja.revisado).toEqual(["en julio cobraste todo lo que vendiste"]);
    const t = tarjetaDelDueno(f);
    expect(t.cifra).toBeNull();
    expect(t.enVez).toEqual({ texto: "Con lo que contaste, no vemos dinero que se te vaya cada mes", rayado: false });
    for (const x of textosDelDueno(f)) expect(x, x).not.toMatch(/S\/\s?0\b/);
  });

  it("si solo se revisó la otra moneda y falta lo vendido frente a lo cobrado, la tarjeta dice sin dato (no «no se te va nada»)", () => {
    // Venta ficticia en dólares en la que llegó justo lo esperado: 1,000 × 3.8 = 3,800 a la cuenta.
    const sinPerdida = fugaDeMoneda([{ ...OPERACION, recibido: 3800, comisiones: 0 }], { ...FICHA_VACIA, modulos: { moneda: true } })!;
    const f = bolsasDeFugas([m("venta_mes", "2026-07", 25000)], { moneda: sinPerdida });
    expect(f.caja.revisado).toEqual(["en tus ventas en otra moneda te llegó lo que esperabas"]);
    expect(f.caja.faltan).toContain("lo que vendiste y lo que cobraste en un mismo mes");
    expect(tarjetaDelDueno(f).enVez).toEqual({ texto: "Sin dato al mes: faltan números", rayado: true });
  });

  it("con la mejor época pero sin la venta del último mes, no hay distancia que calcular: se dice qué falta", () => {
    const f = bolsasDeFugas([m("venta_mes", "epoca_dorada", 45000)]);
    expect(f.oportunidad.alMes).toBeNull();
    expect(f.oportunidad.faltan).toEqual(["cuánto vendiste el último mes"]);
    expect(tarjetaDelDueno(f).oportunidad).toBeNull();
  });

  it("las horas no tienen todavía ningún dato que las cuente: sin dato, dicho, y nunca una cifra", () => {
    const f = bolsasDeFugas(TALLER, { moneda: monedaConMes() });
    expect(f.horas.fugas).toEqual([]);
    expect(f.horas.alMes).toBeNull();
    expect(f.horas.faltan).toEqual(["cuántas horas a la semana haces tú lo que otra persona podría hacer"]);
  });

  it("un número descartado por la consultora no se usa, y una moneda que no se pudo leer se dice en lo que falta", () => {
    const f = bolsasDeFugas([m("venta_mes", "2026-07", 25000), m("cobrado_mes", "2026-07", 1000, "descartado")], { moneda: "no_leido" });
    expect(f.caja.alMes).toBeNull();
    expect(f.caja.faltan).toContain("lo que vendiste y lo que cobraste en un mismo mes");
    expect(f.caja.faltan).toContain("tus ventas en otra moneda (no se pudieron leer)");
  });
});

describe("3. el texto del dueño no usa palabras de alarma para la oportunidad", () => {
  const ALARMA = /riesgo|p[eé]rdid|pierd|fuga|escap|yendo|\bse van?\b|alarma|peligro|brecha|urgente|cuidado|problema|preocup/i;

  /** Todo lo que el dueño lee de la bolsa de oportunidad, en todos los casos que la llenan o la dejan sin dato. */
  function textosDeOportunidad(f: Fugas): string[] {
    const t = tarjetaDelDueno(f);
    const r = resumenDelInforme(f);
    const o = f.oportunidad;
    return [
      BOLSA.oportunidad.titulo, BOLSA.oportunidad.que_es, BOLSA.oportunidad.sin_dato,
      t.oportunidad ?? "", ...(r.oportunidad ?? []), cifraDeBolsa(o) ?? "",
      ...o.fugas.flatMap((x) => [x.concepto, x.base, cifraDeFuga(x)]), ...o.revisado, ...o.faltan,
    ].filter(Boolean);
  }

  it("ni en la tarjeta, ni en el informe, ni en el detalle, ni cuando está cerca o por encima de su mejor época", () => {
    const casos = [
      TALLER,
      [m("venta_mes", "2026-07", 40000), m("venta_mes", "epoca_dorada", 45000)],
      [m("venta_mes", "2026-07", 50000), m("venta_mes", "epoca_dorada", 45000)],
      [m("venta_mes", "epoca_dorada", 45000)],
      [],
    ];
    let leidos = 0;
    for (const c of casos)
      for (const x of textosDeOportunidad(bolsasDeFugas(c))) {
        expect(x, x).not.toMatch(ALARMA);
        leidos++;
      }
    expect(leidos).toBeGreaterThan(15);
  });

  it("la regla sí atrapa el texto de la caja (que es la que alarma): la prueba no pasa por vacía", () => {
    expect(BOLSA.caja.titulo).toMatch(ALARMA);
    expect(resumenDelInforme(bolsasDeFugas(TALLER)).caja!.join("")).toMatch(ALARMA);
  });

  it("y sin color de alarma: el rojo solo va con la caja, en la tarjeta del inicio y en el detalle", () => {
    const portada = leer("src/app/(cliente)/portal/page.tsx");
    const lineaOportunidad = portada.split("\n").find((l) => l.includes("{yendo.oportunidad}"))!;
    expect(lineaOportunidad).toBeDefined();
    expect(lineaOportunidad).not.toContain("contradicho");
    const detalle = leer("src/components/cliente/BolsasDeFugas.tsx");
    // Un solo rojo, y dentro de la rama de la caja.
    expect(detalle.match(/var\(--contradicho\)/g)).toHaveLength(1);
    expect(detalle).toMatch(/b === "caja" \? \(\s*<p className="num-grande" style=\{\{ color: "var\(--contradicho\)" \}\}>/);
    const informe = leer("src/app/(cliente)/portal/informe/page.tsx");
    expect(informe).toContain("{resumenFugas.oportunidad[0]}<strong>{resumenFugas.oportunidad[1]}</strong>");
  });
});
