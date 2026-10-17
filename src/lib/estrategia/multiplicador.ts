/**
 * DUPLICAR Y TRIPLICAR LA UTILIDAD: LA CUENTA DE FRENTE (spec-estrategia-8x.md §4.3; ruta v1.2 §3.5, generalizada).
 *
 * Con la venta del mes V, la razón de margen de contribución mc (lo que deja cada sol vendido después de pagar lo que
 * cuesta lo vendido) y los gastos del mes F:
 *   utilidad de hoy  U₀ = V·mc − F
 *   k = F ÷ (V·mc)                   (qué parte de lo que deja la venta se va en gastos)
 *   para multiplicar la utilidad por m con el mismo margen y los mismos gastos hay que vender V × (m − (m − 1)·k):
 *   ×2 pide 2 − k veces la venta de hoy; ×3 pide 3 − 2k.
 * Con k ≥ 1 (U₀ ≤ 0) no hay cuenta que hacer: el doble de cero sigue siendo cero. La meta pasa a ser el punto de
 * equilibrio (F ÷ mc). Con rangos se decide por el peor caso: si con lo que se sabe la utilidad de hoy podría ser cero o
 * negativa, primero el equilibrio, y se dice.
 *
 * Si el dueño declaró lo que le queda libre y difiere de U₀ más de un 10 %, se informan las dos y no se elige: el
 * múltiplo se calcula con U₀, que sale de las mismas cuentas que las jugadas.
 *
 * Puro: sin base, sin red, sin IA.
 */
import { centro, multiplicarRangos, restarRangos, type Rango } from "../dato-oral";
import type { TableroRentabilidad } from "../rentabilidad";
import { cuenta, motivoDeFaltantes, peorClase, claseRefDeEstado, type Cuenta, type Insumo } from "./cuentas";

export type EstadoMultiplicador = "multiplicar" | "equilibrio_primero" | "sin_cuenta";

export type CuentaMultiplicador = {
  /** La razón de margen de contribución con la que se hizo todo. */
  mc: Insumo;
  k: Cuenta;
  utilidad_hoy: Cuenta;
  venta_x2: Cuenta;
  venta_x3: Cuenta;
  venta_equilibrio: Cuenta;
  /** Lo que el dueño dijo que le queda libre, si lo dijo. Se muestra al lado; nunca se mezcla con U₀. */
  ganancia_declarada: Cuenta | null;
  /** Cuánto difiere lo declarado de U₀, en % del centro de U₀; null sin las dos. */
  diferencia_declarada_pct: number | null;
  estado: EstadoMultiplicador;
};

const LINEAS_QUE_CUBREN = 0.8;

/** Cuántas veces la venta de hoy hay que vender para multiplicar la utilidad por m con el mismo margen y los mismos gastos. */
export function ventaParaMultiplicar(m: number, k: number): number {
  return m - (m - 1) * k;
}

/**
 * La razón de margen de contribución: la de la tabla de productos (lo que deja cada línea sobre lo que vende, pesado
 * por lo que vende cada una) o, sin tabla, 1 − costo directo ÷ venta. Un rango de lo que deja entre un rango de lo que
 * vende ensancharía de mentira: se pesa por el centro, como el equilibrio de rentabilidad.ts.
 */
export function razonDeMargen(t: TableroRentabilidad, venta: Insumo, costoDirecto: Insumo): Insumo {
  const conDatos = t.productos.filter((p) => p.margen_pct && p.precio_efectivo && p.unidades_mes);
  let peso = 0;
  let bajo = 0;
  let alto = 0;
  for (const p of conDatos) {
    const w = centro(p.precio_efectivo!) * centro(p.unidades_mes!);
    peso += w;
    bajo += w * p.margen_pct!.bajo;
    alto += w * p.margen_pct!.alto;
  }
  if (peso > 0) {
    return {
      id: "C:mult.margen",
      nombre: "lo que deja cada sol vendido",
      valor: { bajo: bajo / peso, alto: alto / peso },
      unidad: "razon",
      clase: peorClase(conDatos.flatMap((p) => [claseRefDeEstado(p.estados.precio), claseRefDeEstado(p.estados.costo), claseRefDeEstado(p.estados.unidades)])),
      fuente: `la tabla de productos: ${conDatos.length} de ${t.productos.length} líneas, pesadas por lo que vende cada una`,
      ...(conDatos.length < LINEAS_QUE_CUBREN * t.productos.length ? { limitaciones: [`Lo que deja cada sol vendido sale de ${conDatos.length} de ${t.productos.length} líneas: las demás no tienen precio, costo y cuánto se vende al mes.`] } : {}),
    };
  }
  if (venta.valor && costoDirecto.valor && venta.valor.bajo > 0) {
    return {
      id: "C:mult.margen",
      nombre: "lo que deja cada sol vendido",
      valor: { bajo: 1 - costoDirecto.valor.alto / venta.valor.bajo, alto: 1 - costoDirecto.valor.bajo / venta.valor.alto },
      unidad: "razon",
      clase: peorClase([venta.clase, costoDirecto.clase]),
      fuente: "1 − costo directo del mes ÷ venta del mes",
      ...(costoDirecto.limitaciones ? { limitaciones: costoDirecto.limitaciones } : {}),
    };
  }
  return { id: "C:mult.margen", nombre: "lo que deja cada sol vendido", valor: null, unidad: "razon", clase: "sin_dato", fuente: "sin dato", motivo_nulo: "falta la tabla de productos con precio, costo y cuánto se vende, o el costo directo del mes" };
}

/** Utilidad nueva ÷ utilidad de hoy, en el peor y el mejor caso (las cuatro esquinas). null si U₀ podría ser cero o negativa. */
export function multiploDe(u0: Rango, extra: Rango): Rango | null {
  if (!(u0.bajo > 0)) return null;
  const esquinas = [u0.bajo, u0.alto].flatMap((u) => [extra.bajo, extra.alto].map((r) => (u + r) / u));
  return { bajo: Math.min(...esquinas), alto: Math.max(...esquinas) };
}

export function cuentaDelMultiplicador(x: { venta: Insumo; mc: Insumo; gastos: Insumo; ganancia: Insumo }): CuentaMultiplicador {
  const { venta: V, mc, gastos: F, ganancia } = x;
  const insumos = [V, mc, F];
  const faltan = insumos.filter((i) => !i.valor);
  const periodo = V.periodo ?? "un mes";
  const marco = (formula: string, limitaciones: string[] = []) => ({ formula, periodo, limitaciones, supuestos: ["Con el mismo margen y los mismos gastos de hoy."] });

  const declarada = ganancia.valor ? cuenta("C:mult.ganancia_declarada", "Lo que el dueño dijo que le queda libre al mes", "soles", [ganancia], { formula: "lo declarado, tal cual", periodo: ganancia.periodo ?? periodo }, ganancia.valor) : null;

  if (faltan.length) {
    const motivo = motivoDeFaltantes(insumos);
    const nula = (id: string, nombre: string, unidad: "soles" | "razon", formula: string) => cuenta(id, nombre, unidad, insumos, marco(formula), null, motivo);
    return {
      mc,
      k: nula("C:mult.k", "Qué parte de lo que deja la venta se va en gastos (k)", "razon", "k = gastos del mes ÷ (venta del mes × lo que deja cada sol vendido)"),
      utilidad_hoy: nula("C:mult.utilidad_hoy", "La utilidad de hoy, con las cuentas", "soles", "utilidad de hoy = venta del mes × lo que deja cada sol vendido − gastos del mes"),
      venta_x2: nula("C:mult.venta_x2", "La venta al mes para duplicar la utilidad", "soles", "venta para ×2 = venta del mes × (2 − k)"),
      venta_x3: nula("C:mult.venta_x3", "La venta al mes para triplicar la utilidad", "soles", "venta para ×3 = venta del mes × (3 − 2k)"),
      venta_equilibrio: nula("C:mult.venta_equilibrio", "La venta al mes del punto de equilibrio", "soles", "venta de equilibrio = gastos del mes ÷ lo que deja cada sol vendido"),
      ganancia_declarada: declarada,
      diferencia_declarada_pct: null,
      estado: "sin_cuenta",
    };
  }

  const v = V.valor!;
  const m = mc.valor!;
  const f = F.valor!;
  const deja = multiplicarRangos(v, m); // lo que deja la venta del mes, antes de gastos
  const u0 = restarRangos(deja, f);
  const limitesU0: string[] = [];
  let diferencia: number | null = null;
  if (ganancia.valor) {
    const c = centro(u0);
    if (c !== 0) {
      diferencia = Math.round((Math.abs(centro(ganancia.valor) - c) / Math.abs(c)) * 1000) / 10;
      if (diferencia > 10) limitesU0.push(`El dueño dijo que le queda libre otra cifra: difieren ${diferencia} %. Se informan las dos y no se elige; el múltiplo se calcula con la utilidad de las cuentas, que sale de lo mismo que las jugadas.`);
    }
  }
  const utilidad_hoy = cuenta("C:mult.utilidad_hoy", "La utilidad de hoy, con las cuentas", "soles", insumos, marco("utilidad de hoy = venta del mes × lo que deja cada sol vendido − gastos del mes", limitesU0), u0);

  const k = deja.bajo > 0
    ? cuenta("C:mult.k", "Qué parte de lo que deja la venta se va en gastos (k)", "razon", insumos, marco("k = gastos del mes ÷ (venta del mes × lo que deja cada sol vendido)"), { bajo: f.bajo / deja.alto, alto: f.alto / deja.bajo })
    : cuenta("C:mult.k", "Qué parte de lo que deja la venta se va en gastos (k)", "razon", insumos, marco("k = gastos del mes ÷ (venta del mes × lo que deja cada sol vendido)"), null, "con lo que se sabe, lo que deja la venta podría ser cero o negativo: no hay k que calcular");

  const venta_equilibrio = m.bajo > 0
    ? cuenta("C:mult.venta_equilibrio", "La venta al mes del punto de equilibrio", "soles", [mc, F], marco("venta de equilibrio = gastos del mes ÷ lo que deja cada sol vendido"), { bajo: f.bajo / m.alto, alto: f.alto / m.bajo })
    : cuenta("C:mult.venta_equilibrio", "La venta al mes del punto de equilibrio", "soles", [mc, F], marco("venta de equilibrio = gastos del mes ÷ lo que deja cada sol vendido"), null, "con lo que se sabe, cada venta podría no dejar nada: vender más no alcanza el equilibrio");

  const estado: EstadoMultiplicador = k.calculo.valor && k.calculo.valor.alto < 1 ? "multiplicar" : "equilibrio_primero";
  const motivoEquilibrio = "con lo que se sabe, la utilidad de hoy podría ser cero o negativa: primero hay que pasar el punto de equilibrio";
  const paraVeces = (mult: 2 | 3): Cuenta => {
    const id = mult === 2 ? "C:mult.venta_x2" : "C:mult.venta_x3";
    const nombre = mult === 2 ? "La venta al mes para duplicar la utilidad" : "La venta al mes para triplicar la utilidad";
    const formula = mult === 2 ? "venta para ×2 = venta del mes × (2 − k)" : "venta para ×3 = venta del mes × (3 − 2k)";
    if (estado !== "multiplicar") return cuenta(id, nombre, "soles", insumos, marco(formula), null, motivoEquilibrio);
    const kv = k.calculo.valor!;
    const factor = { bajo: ventaParaMultiplicar(mult, kv.alto), alto: ventaParaMultiplicar(mult, kv.bajo) };
    return cuenta(id, nombre, "soles", insumos, marco(formula), multiplicarRangos(v, factor));
  };

  return {
    mc,
    k,
    utilidad_hoy,
    venta_x2: paraVeces(2),
    venta_x3: paraVeces(3),
    venta_equilibrio,
    ganancia_declarada: declarada,
    diferencia_declarada_pct: diferencia,
    estado,
  };
}
