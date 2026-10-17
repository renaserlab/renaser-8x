/**
 * LAS CUENTAS LAS HACE EL CÓDIGO (src/lib/estrategia/{calculos,poder-del-uno,fugas,multiplicador,proyeccion,supuestos}.ts
 * · spec-estrategia-8x.md §4, §7.1 y §9.3).
 *
 * Con la empresa FICTICIA «Frutas del Valle» (tests/fixtures/estrategia-falsa.ts). Cada cifra esperada está hecha a mano
 * en su comentario, para que alguien sin el código la pueda rehacer:
 *   venta del mes V = 120.000 (dicho de memoria) · costo directo CD = 80.000 (leído de un documento, sin revisar)
 *   gastos del mes G = 30.000 a 31.000 (tabla de gastos) · lo que deja cada sol vendido mc = 37.500 ÷ 112.000
 *   crédito: 6 de cada 10 a 20 días, 1 de cada 10 no paga · inventario 15.000, parado 2.000 a 4.000
 *   respuestas: 500 interesados, ticket 400, 150 clientes, 7 de cada 10 vuelven, paga a 15 días, 20 horas a la semana,
 *   merma 3.000.
 */
import { describe, it, expect } from "vitest";
import { calcularTodo, refsDeCalculos, type Calculos } from "@/lib/estrategia/calculos";
import { armarPaquete, refsDelPaquete, type RefValor } from "@/lib/estrategia/paquete";
import { cuentaDelMultiplicador, ventaParaMultiplicar, multiploDe } from "@/lib/estrategia/multiplicador";
import { proyectarEfecto, proyectarCamino, refsDeProyeccion, claveDeRef, type ContextoProyeccion, type Efecto, type SupuestoCuenta } from "@/lib/estrategia/proyeccion";
import { CLAVES_SUPUESTO, CLAVE_DE_EFECTO, limitesDe, preguntaDe, esClaveDeCambio } from "@/lib/estrategia/supuestos";
import { textoDeOrigen, type Insumo } from "@/lib/estrategia/cuentas";
import { LIMITACION_SIN_INTERACCION } from "@/lib/estrategia/textos";
import { explicarCalculo } from "@/lib/finanzas";
import { MODELOS_NEGOCIO, MODELO } from "@/lib/negocio";
import type { Rango } from "@/lib/dato-oral";
import { entradasFrutas, entradasDental, HOY, L } from "./fixtures/estrategia-falsa";

const MC = 37500 / 112000;
const corto = (uuid: string) => uuid.replace(/-/g, "").slice(0, 8);
const cerca = (r: Rango | null | undefined, bajo: number, alto: number = bajo) => {
  expect(r, "no hay cifra").toBeTruthy();
  expect(r!.bajo).toBeCloseTo(bajo, 4);
  expect(r!.alto).toBeCloseTo(alto, 4);
};

const frutas = (): Calculos => calcularTodo(entradasFrutas(), HOY);
const palanca = (c: Calculos, clave: string) => c.poder.palancas.find((p) => p.clave === clave)!;

/** El contexto de una proyección: los ids del paquete y de los cálculos, y los supuestos de la jugada. */
function contexto(supuestos: SupuestoCuenta[], e = entradasFrutas()): ContextoProyeccion {
  const calculos = calcularTodo(e, HOY);
  const paquete = armarPaquete(e, HOY);
  const refs = new Map<string, RefValor>([...refsDelPaquete(paquete), ...refsDeCalculos(calculos)]);
  return { calculos, refs, supuestos, modelo: paquete.empresa.modelo_negocio[0] ?? null };
}
const S = (id: string, clave: string, bajo: number, alto: number = bajo): SupuestoCuenta => ({ id, clave, rango: { bajo, alto }, que_se_supone: "Cuánto cambia con la jugada" });

// ─── El poder del uno ────────────────────────────────────────────────────────────────────────────

describe("§4.1 · el poder del uno: siete palancas, cada una con y sin su dato", () => {
  it("las cuatro de utilidad al mes y las tres de caja de una vez, con sus fórmulas", () => {
    const c = frutas();
    cerca(palanca(c, "precio").calculo.valor, 1200); // 120.000 × 0,01
    cerca(palanca(c, "volumen").calculo.valor, 400); // (120.000 − 80.000) × 0,01
    cerca(palanca(c, "costo_directo").calculo.valor, 800); // 80.000 × 0,01
    cerca(palanca(c, "gastos").calculo.valor, 300, 310); // (30.000 a 31.000) × 0,01
    cerca(palanca(c, "dias_cobro").calculo.valor, 4000); // 120.000 ÷ 30 (días de cobro de hoy: 20 × 6/10 = 12)
    cerca(palanca(c, "dias_inventario").calculo.valor, 80000 / 30); // costo directo ÷ 30 (hoy: 15.000 × 30 ÷ 80.000 = 5,6 días)
    cerca(palanca(c, "dias_pago").calculo.valor, 80000 / 30); // costo directo ÷ 30 (hoy: 15 días, lo respondió el dueño)
    cerca(c.poder.insumos.dias_cobro.valor, 12);
    cerca(c.poder.insumos.dias_inventario.valor, 15000 * 30 / 80000);
    cerca(c.poder.insumos.dias_pago.valor, 15);
    expect(palanca(c, "precio").mueve).toBe("utilidad_mes");
    expect(palanca(c, "dias_cobro").mueve).toBe("caja_una_vez");
    expect(palanca(c, "dias_pago").calculo.supuestos.join(" ")).toContain("Las compras del mes son");
  });

  it("utilidad al mes y caja de una vez nunca se suman: son dos totales distintos", () => {
    const c = frutas();
    cerca(c.poder.utilidad_juntas.calculo.valor, 2700, 2710); // 1.200 + 400 + 800 + (300 a 310)
    cerca(c.poder.caja_juntas.calculo.valor, 4000 + 2 * (80000 / 30));
    expect(c.poder.utilidad_juntas.calculo.fuentes).not.toContain("Un día menos de cobro");
    expect(c.poder.caja_juntas.calculo.fuentes).not.toContain("Precio +1 %");
  });

  it("el orden por lo que mueven: primero las de utilidad, aparte las de caja", () => {
    const c = frutas();
    expect(c.poder.orden.utilidad).toEqual(["precio", "costo_directo", "volumen", "gastos"]);
    expect(c.poder.orden.caja).toEqual(["dias_cobro", "dias_inventario", "dias_pago"]);
  });

  it("días de pago sin respuesta del dueño es sin dato; lo que el dueño debe no se usa", () => {
    const e = entradasFrutas();
    e.respuestas = e.respuestas.filter((r) => r.clave !== "dias_pago_proveedor");
    const c = calcularTodo(e, HOY);
    expect(palanca(c, "dias_pago").calculo.valor).toBeNull();
    expect(palanca(c, "dias_pago").clase).toBe("sin_dato");
    expect(c.poder.caja_juntas.calculo.limitaciones.join(" ")).toContain("un día más para pagar");
    // Cambiar lo que debe la empresa no mueve ninguna palanca.
    const e2 = entradasFrutas();
    e2.metricas = e2.metricas.map((m) => (m.clave === "deuda_propia" ? { ...m, valor: 999999 } : m));
    expect(calcularTodo(e2, HOY).poder).toEqual(frutas().poder);
  });

  it("sin costo variable del mes, el costo directo sale de la tabla si cubre 8 de cada 10 líneas; si no, sin dato", () => {
    const e = entradasFrutas();
    e.metricas = e.metricas.filter((m) => m.clave !== "costo_variable_mes");
    // 4 de 5 líneas con costo y unidades: 6×5.000 + 3×8.000 + 7×2.000 + 13×500 = 74.500
    const c = calcularTodo(e, HOY);
    cerca(c.poder.insumos.costo_directo.valor, 74500);
    expect(c.poder.insumos.costo_directo.fuente).toContain("4 de 5 líneas");
    e.lineas = e.lineas.map((l) => (l.id === L.picada ? { ...l, unidades_mes: null } : l));
    const sin = calcularTodo(e, HOY);
    expect(sin.poder.insumos.costo_directo.valor).toBeNull();
    expect(palanca(sin, "volumen").calculo.valor).toBeNull();
    expect(palanca(sin, "volumen").calculo.motivo_nulo).toContain("el costo directo del mes");
  });

  it("sin datos del crédito, los días de cobro salen de lo que te deben, rotulado; si no vende al crédito, no hay días que bajar", () => {
    const e = entradasFrutas();
    e.ficha_negocio = { ...e.ficha_negocio, credito: {} };
    const c = calcularTodo(e, HOY);
    cerca(c.poder.insumos.dias_cobro.valor, (45000 * 30) / 120000); // 11,25 días
    expect(c.poder.insumos.dias_cobro.fuente).toContain("calculado con lo que te deben");
    const contado = entradasFrutas();
    contado.ficha_negocio = { ...contado.ficha_negocio, modulos: { ...contado.ficha_negocio.modulos, credito: false } };
    const cc = calcularTodo(contado, HOY);
    expect(palanca(cc, "dias_cobro").calculo.valor).toBeNull();
    expect(palanca(cc, "dias_cobro").calculo.motivo_nulo).toBe("hoy ya cobra al contado: no hay días de cobro que bajar");
  });

  it("sin el valor de lo guardado, los días de inventario salen de los meses × 30", () => {
    const e = entradasFrutas();
    e.ficha_negocio = { ...e.ficha_negocio, inventario: { meses: { valor: 2, estado: "estimado" } } };
    cerca(calcularTodo(e, HOY).poder.insumos.dias_inventario.valor, 60);
  });

  it("la clase de cada palanca es la de su insumo más débil, y explicarCalculo la puede contar", () => {
    const c = frutas();
    expect(palanca(c, "precio").clase).toBe("estimado"); // la venta es de memoria
    expect(palanca(c, "costo_directo").clase).toBe("hecho"); // leído de un documento
    expect(palanca(c, "costo_directo").provisional).toBe(true); // …que falta revisar
    expect(explicarCalculo(palanca(c, "precio").calculo).map((x) => x.etiqueta)).toEqual(expect.arrayContaining(["Cómo se calcula", "De dónde salen los números"]));
  });
});

// ─── Las fugas ───────────────────────────────────────────────────────────────────────────────────

describe("§4.2 · las fugas en tres bolsas que no se suman", () => {
  const c = frutas();
  const fuga = (clave: string) => [...c.fugas.caja.fugas, ...c.fugas.horas.fugas, ...c.fugas.oportunidad.fugas].find((f) => f.clave === clave)!;

  it("caja: crédito que no se cobra, productos que restan y la merma contada; los descuentos sin respuesta no suman", () => {
    cerca(fuga("credito_incobrable").calculo.valor, 7200); // 120.000 × 6/10 × 1/10
    cerca(fuga("productos_que_restan").calculo.valor, 500); // la fruta picada: (12 − 13) × 500
    cerca(fuga("merma").calculo.valor, 3000);
    expect(fuga("descuentos").calculo.valor).toBeNull();
    expect(fuga("descuentos").faltan).toEqual(["descuentos_mes"]);
    cerca(c.fugas.caja.total.calculo.valor, 10700);
    expect(c.fugas.caja.total.calculo.limitaciones.join(" ")).toContain("descuentos");
  });

  it("las fugas vitales: el menor grupo de la caja que llega al 90 %", () => {
    // 7.200 + 3.000 = 10.200 ≥ 90 % de 10.700 (9.630); con 7.200 solo no llega.
    expect(c.fugas.caja.vitales.claves).toEqual(["credito_incobrable", "merma"]);
    cerca(c.fugas.caja.vitales.calculo.valor, 10200);
  });

  it("horas: en horas al mes; en dinero solo con lo que anotó la consultora que cuesta reemplazarlo", () => {
    cerca(fuga("horas_dueno").calculo.valor, 20 * 4.33);
    expect(fuga("horas_dueno").unidad).toBe("horas_mes");
    expect(c.fugas.horas.fugas.some((f) => f.unidad === "soles")).toBe(false);
    const conPrecio = calcularTodo(entradasFrutas({ costo_reemplazo_hora: { valor: 25, estado: "contado" } }), HOY);
    const soles = conPrecio.fugas.horas.fugas.find((f) => f.clave === "horas_dueno_soles")!;
    cerca(soles.calculo.valor, 20 * 4.33 * 25);
    // La bolsa de horas suma horas, nunca horas con dinero.
    cerca(conPrecio.fugas.horas.total.calculo.valor, 20 * 4.33);
  });

  it("oportunidad: por cada UNO más de cada 10 que compre (nunca todos los que no compran) y la mejor época", () => {
    cerca(fuga("uno_mas_de_cada_10").calculo.valor, 500 * (1 / 10) * 400 * MC); // ≈ 6.696
    // No «todos los que no compran»: con 4 de cada 10 que compran, los otros 6 darían seis veces más.
    expect(fuga("uno_mas_de_cada_10").calculo.valor!.alto).toBeLessThan(500 * (6 / 10) * 400 * MC);
    cerca(fuga("mejor_epoca").calculo.valor, (160000 - 120000) * MC); // ya lo vendiste antes
    expect(fuga("mejor_epoca").calculo.supuestos.join(" ")).toContain("Ya lo vendiste antes");
    cerca(c.fugas.oportunidad.total.calculo.valor, 500 * 0.1 * 400 * MC + 40000 * MC);
  });

  it("no hay ningún total entre bolsas, y el dinero parado nunca entra en la caja", () => {
    expect(Object.keys(c.fugas).sort()).toEqual(["caja", "horas", "no_actuar", "oportunidad", "parado", "revisado"]);
    const parado = Object.fromEntries(c.fugas.parado.map((p) => [p.clave, p.calculo.valor]));
    cerca(parado.deuda_clientes, 45000);
    cerca(parado.mercaderia, 2000, 4000);
    cerca(c.fugas.caja.total.calculo.valor, 10700);
  });

  it("«vendido y no cobrado» es dinero parado, y solo cuando lo que te deben no se sabe", () => {
    expect(c.fugas.parado.some((p) => p.clave === "vendido_no_cobrado")).toBe(false);
    const e = entradasFrutas();
    e.metricas = [...e.metricas.filter((m) => m.clave !== "deuda_clientes"), { id: "m-cob", clave: "cobrado_mes", periodo: "2026-09", valor: 100000, estado: "contado" }];
    const sinDeuda = calcularTodo(e, HOY);
    cerca(sinDeuda.fugas.parado.find((p) => p.clave === "vendido_no_cobrado")!.calculo.valor, 20000);
    expect(sinDeuda.fugas.caja.fugas.some((f) => f.clave === "vendido_no_cobrado")).toBe(false);
    cerca(sinDeuda.fugas.caja.total.calculo.valor, 10700);
  });

  it("si seguimos igual: lo que se va de la caja al mes, y aparte lo que no entra", () => {
    cerca(c.fugas.no_actuar.mes.calculo.valor, 10700);
    expect(c.fugas.no_actuar.mes.id).toBe("C:no_actuar.mes");
    cerca(c.fugas.no_actuar.oportunidad.calculo.valor, c.fugas.oportunidad.total.calculo.valor!.bajo);
  });

  it("sin dato no hay fuga: la empresa casi vacía tiene las bolsas sin cifra, nunca en cero", () => {
    const d = calcularTodo(entradasDental(), HOY);
    expect(d.fugas.caja.total.calculo.valor).toBeNull();
    expect(d.fugas.caja.total.calculo.motivo_nulo).toBe("ninguna fuga de esta bolsa tiene cifra todavía");
    expect(d.fugas.no_actuar.mes.calculo.valor).toBeNull();
    expect(d.fugas.oportunidad.fugas.find((f) => f.clave === "uno_mas_de_cada_10")!.faltan).toEqual(["interesados_mes", "ticket_promedio", "costo_variable_mes"]);
  });
});

// ─── Duplicar y triplicar ────────────────────────────────────────────────────────────────────────

describe("§4.3 · duplicar y triplicar: V × (m − (m − 1)·k)", () => {
  const insumo = (id: string, valor: number | null, unidad: Insumo["unidad"] = "soles"): Insumo => ({ id, nombre: id, valor: valor == null ? null : { bajo: valor, alto: valor }, unidad, clase: "hecho", fuente: "prueba" });
  const cuenta = (gastos: number, ganancia: number | null = null) => cuentaDelMultiplicador({ venta: insumo("V", 100000), mc: insumo("mc", 0.4, "razon"), gastos: insumo("F", gastos), ganancia: insumo("G", ganancia) });

  it("con k en 0; 0,5 y 0,75: ×2 pide 2 − k, ×3 pide 3 − 2k", () => {
    expect([0, 0.5, 0.75].map((k) => ventaParaMultiplicar(2, k))).toEqual([2, 1.5, 1.25]);
    expect([0, 0.5, 0.75].map((k) => ventaParaMultiplicar(3, k))).toEqual([3, 2, 1.5]);
    // V = 100.000, mc = 0,4 (deja 40.000): con gastos 0, 20.000 y 30.000, k = 0; 0,5; 0,75.
    const k0 = cuenta(0);
    cerca(k0.k.calculo.valor, 0);
    cerca(k0.venta_x2.calculo.valor, 200000);
    cerca(k0.venta_x3.calculo.valor, 300000);
    const k05 = cuenta(20000);
    cerca(k05.utilidad_hoy.calculo.valor, 20000);
    cerca(k05.venta_x2.calculo.valor, 150000);
    cerca(k05.venta_x3.calculo.valor, 200000);
    const k075 = cuenta(30000);
    cerca(k075.venta_x2.calculo.valor, 125000);
    cerca(k075.venta_x3.calculo.valor, 150000);
    expect(k075.estado).toBe("multiplicar");
  });

  it("con k ≥ 1 (utilidad de hoy en cero o menos) no hay cuenta: primero el punto de equilibrio", () => {
    for (const gastos of [40000, 50000]) {
      const m = cuenta(gastos);
      expect(m.estado).toBe("equilibrio_primero");
      expect(m.venta_x2.calculo.valor).toBeNull();
      expect(m.venta_x2.calculo.motivo_nulo).toContain("primero hay que pasar el punto de equilibrio");
      cerca(m.venta_equilibrio.calculo.valor, gastos / 0.4);
    }
  });

  it("con lo de Frutas del Valle, en rango", () => {
    const m = frutas().multiplicador;
    const deja = 120000 * MC; // ≈ 40.179
    cerca(m.utilidad_hoy.calculo.valor, deja - 31000, deja - 30000);
    cerca(m.k.calculo.valor, 30000 / deja, 31000 / deja);
    cerca(m.venta_x2.calculo.valor, 120000 * (2 - 31000 / deja), 120000 * (2 - 30000 / deja));
    cerca(m.venta_x3.calculo.valor, 120000 * (3 - (2 * 31000) / deja), 120000 * (3 - (2 * 30000) / deja));
    expect(m.diferencia_declarada_pct).toBeLessThan(10);
    expect(m.utilidad_hoy.calculo.limitaciones.join(" ")).not.toContain("difieren");
  });

  it("si lo que el dueño dice que le queda difiere más de 10 %, se informan las dos y el múltiplo usa la de las cuentas", () => {
    const e = entradasFrutas();
    e.metricas = e.metricas.map((m) => (m.clave === "ganancia_mes" ? { ...m, valor: 15000 } : m));
    const m = calcularTodo(e, HOY).multiplicador;
    expect(m.diferencia_declarada_pct).toBeGreaterThan(10);
    expect(m.utilidad_hoy.calculo.limitaciones.join(" ")).toContain("Se informan las dos y no se elige");
    cerca(m.ganancia_declarada!.calculo.valor, 15000);
    expect(m.venta_x2.calculo.valor).toEqual(frutas().multiplicador.venta_x2.calculo.valor);
  });

  it("sin insumos no hay cuenta, y se dice qué falta", () => {
    const d = calcularTodo(entradasDental(), HOY).multiplicador;
    expect(d.estado).toBe("sin_cuenta");
    expect(d.utilidad_hoy.calculo.motivo_nulo).toBe("faltan lo que deja cada sol vendido y los gastos del mes");
  });

  it("el múltiplo de la utilidad: las cuatro esquinas, y sin utilidad positiva no hay múltiplo", () => {
    expect(multiploDe({ bajo: 10000, alto: 20000 }, { bajo: 5000, alto: 10000 })).toEqual({ bajo: 1.25, alto: 2 });
    expect(multiploDe({ bajo: -1000, alto: 5000 }, { bajo: 1000, alto: 2000 })).toBeNull();
  });
});

// ─── La proyección de cada jugada ────────────────────────────────────────────────────────────────

describe("§4.4 · cada tipo de efecto, con rangos", () => {
  const palta = `L:${corto(L.palta)}`;
  const mango = `L:${corto(L.mango)}`;
  const util = (efecto: Efecto, sup: SupuestoCuenta[]) => proyectarEfecto(efecto, contexto(sup));

  it("precio de una línea: palanca() con el bajo y con el alto del supuesto (y al revés si baja)", () => {
    const p = util({ tipo: "precio_linea", linea: palta, pct: "S:SA1" }, [S("S:SA1", "precio.pct", 3, 5)]);
    expect(p.estado).toBe("con_numero");
    cerca(p.utilidad_mes.valor, 1500, 2500); // 10 × (3 % a 5 %) × 5.000
    cerca(p.caja_una_vez.valor, 0);
    cerca(util({ tipo: "precio_linea", linea: `${palta}.precio`, pct: "S:SA1" }, [S("S:SA1", "precio.pct", -5, -3)]).utilidad_mes.valor, -2500, -1500);
  });

  it("una parte del costo que baja; una parte que no existe no se calcula", () => {
    cerca(util({ tipo: "costo_parte", linea: palta, parte: "compra", pct: "S:SA1" }, [S("S:SA1", "costo_parte.pct", -10, -5)]).utilidad_mes.valor, 1375, 2750); // 5,5 × (5 % a 10 %) × 5.000
    const mal = util({ tipo: "costo_parte", linea: palta, parte: "empaque", pct: "S:SA1" }, [S("S:SA1", "costo_parte.pct", -10)]);
    expect(mal.estado).toBe("invalida");
    expect(mal.invalida).toContain("«empaque»");
  });

  it("volumen de una línea y precio general", () => {
    cerca(util({ tipo: "volumen_linea", linea: mango, pct: "S:SA1" }, [S("S:SA1", "volumen.pct", 10, 20)]).utilidad_mes.valor, 1600, 3200); // 2 × 8.000 × (10 % a 20 %)
    cerca(util({ tipo: "precio_general", pct: "S:SA1" }, [S("S:SA1", "precio.pct", 2, 4)]).utilidad_mes.valor, 2400, 4800); // 120.000 × (2 % a 4 %)
  });

  it("conversión: interesados × (nuevo − actual) ÷ 10 × ticket × lo que deja cada sol", () => {
    const p = util({ tipo: "conversion", interesados: "Q:interesados_mes", de_cada_10_nuevo: "S:SA2" }, [S("S:SA2", "conversion.de_cada_10_nuevo", 5, 6)]);
    cerca(p.utilidad_mes.valor, 500 * 0.1 * 400 * MC, 500 * 0.2 * 400 * MC);
    // El origen se dice con los nombres del catálogo, sin ids ni la pregunta entera.
    expect(p.texto_origen).toBe("sale de los interesados al mes, hecho; de cada 10 interesados, cuántos compran, estimado del dueño; lo que gasta un cliente en una compra, estimado del dueño; lo que deja cada sol vendido, estimado del dueño; y de cuánto cambia con la jugada, por confirmar");
  });

  it("recompra: solo lo que se SUMA; sin veces al mes, una sola compra, y se dice", () => {
    const p = util({ tipo: "recompra", clientes: "Q:clientes_activos_mes", de_cada_10: "S:SA3", veces_mes: null }, [S("S:SA3", "recompra.de_cada_10_nuevo", 8, 9)]);
    cerca(p.utilidad_mes.valor, 150 * 0.1 * 1 * 400 * MC, 150 * 0.2 * 400 * MC);
    expect(p.utilidad_mes.supuestos.join(" ")).toContain("se cuenta una sola compra");
    // Si de cada 10 que vuelven sigue en 7, no se suma nada: la recompra que ya existe no es de la jugada.
    cerca(util({ tipo: "recompra", clientes: "Q:clientes_activos_mes", de_cada_10: "S:SA3", veces_mes: null }, [S("S:SA3", "recompra.de_cada_10_nuevo", 7)]).utilidad_mes.valor, 0);
  });

  it("cerrar una fuga: fuga × de cada 10 ÷ 10; la de horas libera horas, no dinero; el dinero parado no es una fuga", () => {
    cerca(util({ tipo: "cierre_fuga", fuga: "C:fuga.credito_incobrable", de_cada_10: "S:SA1" }, [S("S:SA1", "cierre_fuga.de_cada_10", 3, 5)]).utilidad_mes.valor, 2160, 3600);
    const horas = util({ tipo: "cierre_fuga", fuga: "C:fuga.horas_dueno", de_cada_10: "S:SA1" }, [S("S:SA1", "cierre_fuga.de_cada_10", 5)]);
    expect(horas.estado).toBe("mueve_horas");
    cerca(horas.horas_mes, 20 * 4.33 * 0.5);
    expect(util({ tipo: "cierre_fuga", fuga: "C:parado.deuda_clientes", de_cada_10: "S:SA1" }, [S("S:SA1", "cierre_fuga.de_cada_10", 5)]).estado).toBe("invalida");
    expect(util({ tipo: "cierre_fuga", fuga: "C:fuga.inventada", de_cada_10: "S:SA1" }, [S("S:SA1", "cierre_fuga.de_cada_10", 5)]).estado).toBe("invalida");
  });

  it("gastos: si bajan, la utilidad sube", () => {
    cerca(util({ tipo: "gasto_fijo", pct: "S:SA1" }, [S("S:SA1", "gasto_fijo.pct", -10, -5)]).utilidad_mes.valor, 1500, 3100); // (30.000 a 31.000) × (5 % a 10 %)
  });

  it("días de cobro e inventario liberan caja una vez y no mueven la utilidad del mes", () => {
    const cobro = util({ tipo: "dias_cobro", menos_dias: "S:SA1" }, [S("S:SA1", "dias_cobro.menos_dias", 3, 5)]);
    cerca(cobro.caja_una_vez.valor, 12000, 20000); // 120.000 ÷ 30 × (3 a 5)
    cerca(cobro.utilidad_mes.valor, 0);
    cerca(util({ tipo: "inventario_liberado", de_cada_10: "S:SA1" }, [S("S:SA1", "inventario.de_cada_10", 5)]).caja_una_vez.valor, 1000, 2000);
  });

  it("una habilitadora no tiene número: dice qué jugada abre", () => {
    const h = util({ tipo: "habilitador", abre: "J2" }, []);
    expect(h).toMatchObject({ estado: "habilitador", abre: "J2" });
    expect(h.utilidad_mes.valor).toBeNull();
  });

  it("un insumo del estado actual sin dato deja la jugada «por probar», sin número y con la pregunta que la destraba", () => {
    const p = proyectarEfecto({ tipo: "conversion", interesados: "X:interesados_mes", de_cada_10_nuevo: "S:SB1" }, contexto([S("S:SB1", "conversion.de_cada_10_nuevo", 5)], entradasDental()));
    expect(p.estado).toBe("por_probar");
    expect(p.utilidad_mes.valor).toBeNull();
    expect(p.utilidad_mes.motivo_nulo).toMatch(/^por probar: falta /);
    expect(p.por_probar.map((f) => f.clave)).toEqual(["interesados_mes", "conversion_de_cada_10", "ticket_promedio", "costo_variable_mes"]);
    expect(p.por_probar[0]!.pregunta).toBe("El mes pasado, ¿cuántas personas te preguntaron precio o te pidieron información?");
    // Una línea sin costo también queda por probar, con su pregunta de sección (sin pregunta suelta).
    const uva = proyectarEfecto({ tipo: "precio_linea", linea: `L:${corto(L.uva)}`, pct: "S:SA1" }, contexto([S("S:SA1", "precio.pct", 5)]));
    expect(uva.estado).toBe("por_probar");
    expect(uva.por_probar).toEqual([expect.objectContaining({ id: `X:linea.costo@${corto(L.uva)}`, clave: "linea.costo", pregunta: null })]);
  });

  it("un supuesto donde va el dato de hoy no se calcula: lo de hoy no se supone", () => {
    const p = util({ tipo: "conversion", interesados: "S:SA9", de_cada_10_nuevo: "S:SA2" }, [S("S:SA2", "conversion.de_cada_10_nuevo", 5), S("S:SA9", "precio.pct", 1)]);
    expect(p.estado).toBe("invalida");
    expect(p.invalida).toContain("lo de hoy no se supone");
  });

  it("claveDeRef: del id del dato a su clave del catálogo", () => {
    expect(claveDeRef("X:linea.precio@ab12cd34")).toBe("linea.precio");
    expect(claveDeRef("Q:ticket_promedio")).toBe("ticket_promedio");
    expect(claveDeRef("N:venta_mes@epoca_dorada")).toBe("venta_mes");
  });
});

describe("§4.4 · el camino: horizontes de 14, 30 y 90 días, sin interacción y comparado", () => {
  // Una jugada de 3.000 al mes exactos: precio general +2,5 % sobre 120.000.
  const tres = (id: string, desde: number) => ({ id, efecto: { tipo: "precio_general", pct: "S:SA1" } as Efecto, desde_dia: desde });
  const ctx = () => contexto([S("S:SA1", "precio.pct", 2.5)]);

  it("desde el día 1, 14 y 60: ritmo al mes y acumulado = utilidad × (h − desde) ÷ 30", () => {
    const pc = proyectarCamino("a", [tres("J1", 1), tres("J2", 14), tres("J3", 60)], ctx());
    const [j1, j2, j3] = pc.jugadas;
    cerca(j1!.por_horizonte.d14.ritmo, 3000);
    cerca(j1!.por_horizonte.d14.acumulado, 1300); // 3.000 × 13 ÷ 30
    cerca(j1!.por_horizonte.d90.acumulado, 8900);
    cerca(j2!.por_horizonte.d14.ritmo, 3000);
    cerca(j2!.por_horizonte.d14.acumulado, 0);
    cerca(j2!.por_horizonte.d30.acumulado, 1600);
    cerca(j3!.por_horizonte.d30.ritmo, 0);
    cerca(j3!.por_horizonte.d90.ritmo, 3000);
    cerca(j3!.por_horizonte.d90.acumulado, 3000);
    cerca(pc.total.d14.ritmo.valor, 6000);
    cerca(pc.total.d90.ritmo.valor, 9000);
    cerca(pc.total.d90.acumulado.valor, 8900 + 7600 + 3000);
  });

  it("lo que está por probar no se suma, se dice, y el camino lleva la limitación «sin interacción»", () => {
    const pc = proyectarCamino("b", [
      tres("J1", 7),
      { id: "J2", efecto: { tipo: "precio_linea", linea: `L:${corto(L.uva)}`, pct: "S:SA1" }, desde_dia: 7 },
      { id: "J3", efecto: { tipo: "habilitador", abre: "J1" }, desde_dia: 1 },
      { id: "J4", efecto: { tipo: "dias_cobro", menos_dias: "S:SA2" }, desde_dia: 10 },
    ], contexto([S("S:SA1", "precio.pct", 2.5), S("S:SA2", "dias_cobro.menos_dias", 3, 5)]));
    expect(pc.cuantas_por_probar).toBe(1);
    expect(pc.jugadas[1]!.por_horizonte.d90.ritmo).toBeNull();
    cerca(pc.total.d90.ritmo.valor, 3000);
    cerca(pc.total.d14.caja.valor, 12000, 20000);
    expect(pc.limitaciones).toContain(LIMITACION_SIN_INTERACCION);
    expect(pc.limitaciones.join(" ")).toContain("1 jugada está por probar");
    expect(pc.total.d90.ritmo.limitaciones).toContain(LIMITACION_SIN_INTERACCION);
  });

  it("se compara con la utilidad de hoy (×a a ×b) y con «si seguimos igual»", () => {
    const pc = proyectarCamino("a", [tres("J1", 1)], ctx());
    const u0 = frutas().multiplicador.utilidad_hoy.calculo.valor!;
    cerca(pc.utilidad.d90.valor, u0.bajo + 3000, u0.alto + 3000);
    cerca(pc.multiplo.d90.valor, (u0.alto + 3000) / u0.alto, (u0.bajo + 3000) / u0.bajo);
    expect(pc.comparacion).toMatch(/^a 90 días, la utilidad pasaría de entre S\/ [\d,]+ y S\/ [\d,]+ a entre S\/ [\d,]+ y S\/ [\d,]+ al mes \((?:de )?×1\.\d(?: a ×1\.\d)?\); si seguimos igual, se siguen yendo S\/ 11,000 de la caja cada mes$/);
    expect(pc.texto_origen).toBe("sale de la venta del mes, estimado del dueño; y de cuánto cambia con la jugada, por confirmar");
  });

  it("con la utilidad de hoy en cero o menos, no hay múltiplo: se compara con el equilibrio", () => {
    const e = entradasFrutas();
    e.costos = e.costos.map((x) => (x.nombre === "Sueldos" ? { ...x, dato: { valor: 40000, estado: "contado" as const } } : x));
    const pc = proyectarCamino("a", [tres("J1", 1)], contexto([S("S:SA1", "precio.pct", 2.5)], e));
    expect(pc.multiplo.d90.valor).toBeNull();
    expect(pc.multiplo.d90.motivo_nulo).toContain("se compara con el punto de equilibrio");
    expect(calcularTodo(e, HOY).multiplicador.estado).toBe("equilibrio_primero");
  });

  it("ningún número del camino sin jugadas con número: sin dato, nunca cero", () => {
    const pc = proyectarCamino("a", [{ id: "J1", efecto: { tipo: "habilitador", abre: "J2" }, desde_dia: 1 }], ctx());
    expect(pc.total.d90.ritmo.valor).toBeNull();
    expect(pc.total.d90.ritmo.motivo_nulo).toBe("ninguna jugada del camino tiene número todavía");
    expect(pc.clase).toBe("sin_dato");
  });

  it("los ids R: de un camino, con su motivo cuando no hay número", () => {
    const pc = proyectarCamino("a", [tres("J1", 1), { id: "J2", efecto: { tipo: "precio_linea", linea: `L:${corto(L.uva)}`, pct: "S:SA1" }, desde_dia: 7 }, { id: "J3", efecto: { tipo: "habilitador", abre: "J1" }, desde_dia: 1 }], ctx());
    const refs = refsDeProyeccion(pc, frutas());
    // La venta es un estimado y la subida un supuesto: la cifra vale lo que su insumo más débil, «por confirmar».
    expect(refs.get("R:a.J1.mes")).toMatchObject({ valor: { bajo: 3000, alto: 3000 }, texto: "S/ 3,000", clase: "supuesto" });
    expect(refs.get("R:a.J2.mes")).toMatchObject({ valor: null, clase: "sin_dato", texto: "sin dato" });
    expect(refs.get("R:a.J2.mes")!.motivo_nulo).toMatch(/^por probar: falta /);
    expect(refs.get("R:a.J3.mes")).toMatchObject({ unidad: "texto", texto: "no mueve dinero por sí misma: abre J1" });
    expect(refs.get("R:a.total.d90")!.valor).toEqual({ bajo: 3000, alto: 3000 });
    expect(refs.get("R:a.multiplo.d90")!.unidad).toBe("veces");
    expect(refs.get("R:a.multiplo.d90")!.valor!.alto).toBeGreaterThan(1);
    for (const id of refs.keys()) expect(id).toMatch(/^R:[A-Za-z0-9_.:@-]{1,80}$/);
  });
});

// ─── Los cálculos reunidos ───────────────────────────────────────────────────────────────────────

describe("§4 · calcularTodo y sus ids C:", () => {
  const c = frutas();
  const refs = refsDeCalculos(c);

  it("por producto: margen, margen de cada 100, lo que deja al mes y su cuadrante (rentabilidad.ts tal cual)", () => {
    const p = corto(L.palta);
    expect(refs.get(`C:producto.${p}.margen`)).toMatchObject({ valor: { bajo: 4, alto: 4 }, texto: "S/ 4" });
    expect(refs.get(`C:producto.${p}.margen_pct`)!.texto).toBe("40 %");
    expect(refs.get(`C:producto.${p}.deja_mes`)!.texto).toBe("S/ 20,000");
    expect(refs.get(`C:producto.${p}.cuadrante`)!.texto).toMatch(/^Estrella/);
    expect(refs.get(`C:producto.${corto(L.uva)}.deja_mes`)).toMatchObject({ valor: null, clase: "sin_dato", texto: "sin dato" });
  });

  it("90/10, equilibrio, margen, días de aguante y palancas sugeridas", () => {
    expect(refs.get("C:noventa_diez")!.texto).toBe("2 de 4 líneas dejan el 95 % de lo que dejan todas: «Palta», «Mango»");
    expect(refs.get("C:equilibrio.soles")!.valor!.bajo).toBeCloseTo(30500 / MC, 0);
    expect(refs.get("C:equilibrio.unidades")!.unidad).toBe("unidades_mes");
    expect(refs.get("C:margen")!.valor!.bajo).toBeCloseTo((10000 / 120000) * 100, 4);
    expect(refs.get("C:dias_aguante")!.texto).toBe("30 días"); // 30.000 de caja ÷ 30.000 de gasto fijo × 30
    expect(refs.get(`C:palanca.${corto(L.mango)}.precio5`)!.texto).toBe("S/ 2,000"); // 5 × 5 % × 8.000
    expect(refs.get(`C:palanca.${corto(L.palta)}.parte10`)!.valor!.bajo).toBeCloseTo(5.5 * 0.1 * 5000, 4); // «compra», la parte más cara
    expect(refs.get(`C:palanca.${corto(L.mango)}.volumen10`)!.texto).toBe("S/ 1,600");
  });

  it("la dependencia del dueño se describe, no se puntúa", () => {
    expect(refs.get("C:dependencia.procesos")).toMatchObject({ unidad: "texto", texto: "participa en 3 de 4 procesos del mapa; en 2 de ellos es el único que decide" });
    expect(refs.get("C:dependencia.procesos")!.texto).not.toMatch(/%/);
    const d = refsDeCalculos(calcularTodo(entradasDental(), HOY)).get("C:dependencia.procesos")!;
    expect(d).toMatchObject({ clase: "sin_dato", texto: "sin dato" });
  });

  it("cada id C: es un Calculo con fórmula; lo que no se calcula es «sin dato» con motivo, nunca «S/ 0»", () => {
    const d = refsDeCalculos(calcularTodo(entradasDental(), HOY));
    for (const [id, r] of [...refs, ...d]) {
      expect(r.formula.length, id).toBeGreaterThan(3);
      if (r.valor == null && r.unidad !== "texto") {
        expect(r.texto, id).toBe("sin dato");
        expect(r.motivo_nulo, id).toBeTruthy();
      }
      expect(r.texto, id).not.toMatch(/^S\/ 0$/);
    }
    for (const id of ["C:poder.precio", "C:poder.utilidad_juntas", "C:poder.caja_juntas", "C:fuga.credito_incobrable", "C:fugas.caja.total", "C:fugas.caja.vitales", "C:fugas.oportunidad.total", "C:parado.deuda_clientes", "C:no_actuar.mes", "C:no_actuar.oportunidad", "C:mult.k", "C:mult.utilidad_hoy", "C:mult.venta_x2", "C:mult.venta_x3", "C:mult.venta_equilibrio", "C:mult.margen", "C:poder.dias_cobro_hoy"]) {
      expect(refs.has(id), id).toBe(true);
    }
  });

  it("los cálculos son JSON: se congelan tal cual en la versión de la estrategia", () => {
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("el origen de una cifra se dice en palabras, sin ids", () => {
    expect(textoDeOrigen([{ nombre: "la venta del mes", clase: "estimado" }, { nombre: "cuánto sube el precio", clase: "supuesto" }])).toBe("sale de la venta del mes, estimado del dueño; y de cuánto sube el precio, por confirmar");
    expect(textoDeOrigen([])).toBe("");
  });
});

// ─── El catálogo ─────────────────────────────────────────────────────────────────────────────────

describe("§7.1 · el catálogo: cuánto es hoy se pregunta; cuánto cambia se supone dentro de su límite", () => {
  const defs = Object.values(CLAVES_SUPUESTO);

  it("toda clave de cambio tiene límites; ninguna de estado actual acepta rango de la IA", () => {
    const ctx = { valor: () => ({ bajo: 4, alto: 4 }) };
    for (const d of defs) {
      if (d.tipo === "cambio") {
        expect(d.limites, d.clave).toBeTruthy();
        expect(limitesDe(d.clave, ctx).ok, d.clave).toBe(true);
      } else {
        expect(d.limites, d.clave).toBeUndefined();
        expect(limitesDe(d.clave, ctx)).toMatchObject({ ok: false, motivo: "no_es_cambio" });
      }
    }
    expect(limitesDe("inventada", ctx)).toMatchObject({ ok: false, motivo: "desconocida" });
  });

  it("los límites son lo creíble en 90 días y salen del dato de hoy; sin ese dato no se inventan", () => {
    expect(limitesDe("precio.pct", { valor: () => null })).toEqual({ ok: true, limites: [-30, 30] });
    expect(limitesDe("costo_parte.pct", { valor: () => null })).toEqual({ ok: true, limites: [-50, 0] });
    const hoy = (id: string) => (id === "N:conversion_de_cada_10" ? { bajo: 3, alto: 4 } : id === "C:poder.dias_cobro_hoy" ? { bajo: 12, alto: 12 } : null);
    // Hasta tres más de cada 10 sobre los de hoy, nunca diez de cada 10 de un golpe.
    expect(limitesDe("conversion.de_cada_10_nuevo", { valor: hoy })).toEqual({ ok: true, limites: [3, 7] });
    expect(limitesDe("conversion.de_cada_10_nuevo", { valor: () => ({ bajo: 8, alto: 8 }) })).toEqual({ ok: true, limites: [8, 10] });
    // Cerrar una fuga o liberar lo parado: hasta 7 de cada 10; vender más: hasta la mitad más.
    expect(limitesDe("cierre_fuga.de_cada_10", { valor: () => null })).toEqual({ ok: true, limites: [0, 7] });
    expect(limitesDe("inventario.de_cada_10", { valor: () => null })).toEqual({ ok: true, limites: [0, 7] });
    expect(limitesDe("volumen.pct", { valor: () => null })).toEqual({ ok: true, limites: [0, 50] });
    expect(limitesDe("dias_cobro.menos_dias", { valor: hoy })).toEqual({ ok: true, limites: [0, 12] });
    expect(limitesDe("recompra.de_cada_10_nuevo", { valor: hoy })).toMatchObject({ ok: false, motivo: "sin_ancla" });
    expect(CLAVES_SUPUESTO["conversion.de_cada_10_nuevo"]).toMatchObject({ pide_ancla: true, ancla: "N:conversion_de_cada_10" });
    expect(CLAVES_SUPUESTO["recompra.de_cada_10_nuevo"]).toMatchObject({ pide_ancla: true, ancla: "Q:clientes_que_vuelven_de_cada_10" });
  });

  it("cada tipo de efecto apunta a una clave de cambio (el habilitador, a ninguna)", () => {
    for (const [tipo, clave] of Object.entries(CLAVE_DE_EFECTO)) {
      if (tipo === "habilitador") expect(clave).toBeNull();
      else expect(esClaveDeCambio(clave as string), tipo).toBe(true);
    }
  });

  it("las preguntas sueltas son orales: una sola pregunta, el episodio, sin cifra de ejemplo, sin jerga, cortas", () => {
    const preguntas = defs.filter((d) => d.destino === "pregunta" && d.clave !== "otra").flatMap((d) => MODELOS_NEGOCIO.map((m) => [d.clave, preguntaDe(d.clave, m)!] as const));
    expect(preguntas.length).toBeGreaterThan(0);
    for (const [clave, p] of preguntas) {
      expect(p, clave).toBeTruthy();
      expect((p.match(/¿/g) ?? []).length, `${clave}: un solo «¿»`).toBe(1);
      expect((p.match(/\?/g) ?? []).length, `${clave}: un solo «?»`).toBe(1);
      expect(p.replace(/de cada 10/gi, ""), `${clave}: sin cifras`).not.toMatch(/\d/);
      expect(p, `${clave}: sin promedios ni ejemplos`).not.toMatch(/mes normal|semana normal|más o menos|suele|promedio|por ejemplo|ej\.|plata|porcentaje|tasa|KPI|indicador/i);
      expect(p.split(/\s+/).length, `${clave}: corta`).toBeLessThanOrEqual(30);
    }
  });

  it("la de capacidad usa la unidad de cada modelo, con el interrogativo que concuerda; sin modelo, «clientes»", () => {
    for (const m of MODELOS_NEGOCIO) expect(preguntaDe("capacidad_extra_mes", m)).toMatch(new RegExp(`¿cuánt[oa]s ${MODELO[m].unidad.plural === "unidades" ? "pedidos" : MODELO[m].unidad.plural} más`));
    // «¿cuántas unidades más…?» suena raro al dueño: donde se cuentan unidades, se pregunta por pedidos.
    expect(preguntaDe("capacidad_extra_mes", "compra_y_revende")).toContain("¿cuántos pedidos más");
    expect(preguntaDe("capacidad_extra_mes", "intermedia_comision")).toContain("¿cuántas operaciones más");
    expect(preguntaDe("capacidad_extra_mes", "vende_horas_o_casos")).toContain("¿cuántos casos más");
    expect(preguntaDe("capacidad_extra_mes")).toContain("¿cuántos clientes más");
  });

  it("lo que se pide por sección no trae pregunta suelta: se pregunta en su pantalla, y la nota se dice al dueño", () => {
    for (const d of defs.filter((x) => x.tipo === "estado_actual" && x.destino !== "pregunta")) {
      expect(preguntaDe(d.clave), d.clave).toBeNull();
      expect(d.para_dueno, d.clave).toBeTruthy();
      expect(d.para_dueno!.replace(/de cada 10/g, ""), d.clave).not.toMatch(/\d/);
    }
  });
});
