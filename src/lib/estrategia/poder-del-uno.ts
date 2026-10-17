/**
 * EL PODER DEL UNO (spec-estrategia-8x.md §4.1).
 *
 * Cuánto mueve cada palanca si se aprieta una sola unidad: el precio un 1 %, el volumen un 1 %, el costo directo un
 * 1 % menos, los gastos un 1 % menos, un día menos de cobro, un día menos de inventario, un día más para pagar. Las
 * cuatro primeras mueven la utilidad DE CADA MES; las tres de días liberan caja UNA VEZ. Las dos cosas nunca se suman:
 * son dos totales distintos. El orden de las palancas por lo que mueven es lo que recibe quien piensa el camino del
 * dinero para elegir dónde apretar.
 *
 * Una palanca sin su dato es «sin dato», nunca cero: sin los días de pago al proveedor (una pregunta para el dueño) no
 * hay palanca de días de pago. Lo que el dueño debe (`deuda_propia`) no se usa: puede ser deuda con el banco.
 *
 * Puro: sin base, sin red, sin IA.
 */
import { escalarRango, multiplicarRangos, restarRangos, rangoDe, centro, type Rango } from "../dato-oral";
import type { Calculo } from "../finanzas";
import type { TableroRentabilidad } from "../rentabilidad";
import type { EntradasPaquete } from "./paquete";
import {
  cuenta, claseRefDeEstado, insumoDeVital, insumoDeRespuesta, insumoNulo, motivoDeFaltantes, peorClase, sumaDeExistentes, CERO,
  type Cuenta, type Insumo,
} from "./cuentas";

export type ClavePalancaUno = "precio" | "volumen" | "costo_directo" | "gastos" | "dias_cobro" | "dias_inventario" | "dias_pago";

export type InsumosPoder = {
  venta: Insumo;
  costo_directo: Insumo;
  gastos: Insumo;
  dias_cobro: Insumo;
  dias_inventario: Insumo;
  dias_pago: Insumo;
};

export type PalancaUno = Cuenta & { clave: ClavePalancaUno; mueve: "utilidad_mes" | "caja_una_vez" };

export type PoderDelUno = {
  insumos: InsumosPoder;
  palancas: PalancaUno[];
  /** Las claves de las palancas con cifra, de la que más mueve a la que menos: primero las de utilidad, aparte las de caja. */
  orden: { utilidad: ClavePalancaUno[]; caja: ClavePalancaUno[] };
  utilidad_juntas: Cuenta;
  caja_juntas: Cuenta;
};

const LINEAS_QUE_CUBREN = 0.8;

/**
 * Los insumos del poder del uno, cada uno con su fuente y su clase (§4.1):
 *  venta del mes (la más reciente, nunca la de la mejor época); costo directo (costo variable del mes; si no, la tabla
 *  de productos cuando cubre el 80 % de las líneas); gastos del mes (los del tablero, que suman fijos y de vender; sin
 *  filas, el gasto fijo de los nueve números); días de cobro (crédito: días × de cada 10 al crédito; si no, lo que te
 *  deben entre la venta de un día); días de inventario (dinero en mercadería entre el costo de un día; si no, meses ×
 *  30); días de pago (solo la respuesta del dueño).
 */
export function insumosDelPoder(e: EntradasPaquete, t: TableroRentabilidad): InsumosPoder {
  const venta = insumoDeVital(e.metricas, "venta_mes", "la venta del mes", "soles");

  // Costo directo del mes.
  let costo_directo = insumoDeVital(e.metricas, "costo_variable_mes", "el costo directo del mes", "soles", { ceroEsSinDato: true });
  if (costo_directo.valor) {
    costo_directo = { ...costo_directo, id: "C:poder.costo_directo_hoy" };
    if (venta.periodo && costo_directo.periodo && venta.periodo !== costo_directo.periodo) {
      costo_directo.limitaciones = [...(costo_directo.limitaciones ?? []), "La venta y el costo directo son de meses distintos: la cuenta es orientativa hasta tenerlos del mismo mes."];
    }
  } else {
    const conDatos = t.productos.filter((p) => p.costo && p.unidades_mes);
    if (t.productos.length && conDatos.length >= LINEAS_QUE_CUBREN * t.productos.length) {
      const suma = conDatos.reduce<Rango>((s, p) => {
        const r = multiplicarRangos(p.costo!, p.unidades_mes!);
        return { bajo: s.bajo + r.bajo, alto: s.alto + r.alto };
      }, { bajo: 0, alto: 0 });
      costo_directo = {
        id: "C:poder.costo_directo_hoy",
        nombre: "el costo directo del mes",
        valor: suma,
        unidad: "soles",
        clase: peorClase(conDatos.flatMap((p) => [claseRefDeEstado(p.estados.costo), claseRefDeEstado(p.estados.unidades)])),
        fuente: `la tabla de productos: costo × unidades de ${conDatos.length} de ${t.productos.length} líneas`,
        ...(conDatos.length < t.productos.length ? { limitaciones: [`Sale de ${conDatos.length} de ${t.productos.length} líneas de la tabla de productos.`] } : {}),
      };
    } else {
      costo_directo = insumoNulo("C:poder.costo_directo_hoy", "el costo directo del mes", "soles", "falta el costo directo del mes: ni el costo variable de los nueve números ni la tabla de productos con al menos 8 de cada 10 líneas completas");
    }
  }

  // Gastos del mes: los del tablero (fijos y de vender), o el gasto fijo de los nueve números.
  let gastos: Insumo;
  if (t.fijos.total) {
    if (t.fijos.fuente === "vital") {
      gastos = { ...insumoDeVital(e.metricas, "gasto_fijo_mes", "los gastos del mes", "soles", { ceroEsSinDato: true }), id: "C:poder.gastos_hoy" };
    } else {
      const filas = e.costos.filter((c) => c.periodo === "mes_tipico");
      gastos = {
        id: "C:poder.gastos_hoy",
        nombre: "los gastos del mes",
        valor: t.fijos.total,
        unidad: "soles",
        clase: peorClase(filas.map((c) => claseRefDeEstado(c.dato.estado))),
        fuente: `la tabla de gastos del mes (${filas.length} ${filas.length === 1 ? "fila" : "filas"}, fijos y de vender)`,
        ...(t.fijos.diferencia_pct != null && Math.abs(t.fijos.diferencia_pct) > 10 ? { limitaciones: [`Los gastos fijos de la tabla y los de los nueve números difieren ${Math.abs(t.fijos.diferencia_pct)} %: se informa, no se elige.`] } : {}),
      };
    }
  } else {
    gastos = insumoNulo("C:poder.gastos_hoy", "los gastos del mes", "soles", t.faltan.find((f) => f.includes("gastos")) ?? "faltan los gastos del mes");
  }

  // Días de cobro.
  const fn = e.ficha_negocio;
  let dias_cobro: Insumo;
  const kCredito = rangoDe(fn.credito.de_cada_10);
  const diasCredito = rangoDe(fn.credito.dias);
  const deuda = insumoDeVital(e.metricas, "deuda_clientes", "lo que le deben sus clientes", "soles");
  if (fn.modulos.credito === false) {
    dias_cobro = { id: "C:poder.dias_cobro_hoy", nombre: "los días de cobro de hoy", valor: CERO, unidad: "dias", clase: "estimado", fuente: "no vende al crédito ni fía (lo dijo el dueño)" };
  } else if (kCredito && diasCredito && fn.credito.de_cada_10?.estado !== "no_lo_se" && fn.credito.dias?.estado !== "no_lo_se") {
    dias_cobro = {
      id: "C:poder.dias_cobro_hoy",
      nombre: "los días de cobro de hoy",
      valor: multiplicarRangos(diasCredito, escalarRango(kCredito, 1 / 10)),
      unidad: "dias",
      clase: peorClase([claseRefDeEstado(fn.credito.dias?.estado), claseRefDeEstado(fn.credito.de_cada_10?.estado)]),
      fuente: "días que tardan en pagar × de cada 10 ventas al crédito",
    };
  } else if (deuda.valor && venta.valor && venta.valor.bajo > 0) {
    dias_cobro = {
      id: "C:poder.dias_cobro_hoy",
      nombre: "los días de cobro de hoy",
      valor: { bajo: (deuda.valor.bajo * 30) / venta.valor.alto, alto: (deuda.valor.alto * 30) / venta.valor.bajo },
      unidad: "dias",
      clase: peorClase([deuda.clase, venta.clase]),
      fuente: "calculado con lo que te deben: lo que te deben entre lo que vendes en un día",
    };
  } else {
    dias_cobro = insumoNulo("C:poder.dias_cobro_hoy", "los días de cobro de hoy", "dias", "faltan los días y las ventas al crédito, o lo que le deben sus clientes");
  }

  // Días de inventario.
  let dias_inventario: Insumo;
  const valorInventario = rangoDe(fn.inventario.valor);
  const meses = rangoDe(fn.inventario.meses);
  if (fn.modulos.inventario === false) {
    dias_inventario = { id: "C:poder.dias_inventario_hoy", nombre: "los días de inventario de hoy", valor: CERO, unidad: "dias", clase: "estimado", fuente: "no guarda mercadería ni materiales (lo dijo el dueño)" };
  } else if (valorInventario && fn.inventario.valor?.estado !== "no_lo_se" && costo_directo.valor && costo_directo.valor.bajo > 0) {
    dias_inventario = {
      id: "C:poder.dias_inventario_hoy",
      nombre: "los días de inventario de hoy",
      valor: { bajo: (valorInventario.bajo * 30) / costo_directo.valor.alto, alto: (valorInventario.alto * 30) / costo_directo.valor.bajo },
      unidad: "dias",
      clase: peorClase([claseRefDeEstado(fn.inventario.valor?.estado), costo_directo.clase]),
      fuente: "dinero en mercadería entre el costo directo de un día",
    };
  } else if (meses && fn.inventario.meses?.estado !== "no_lo_se") {
    dias_inventario = { id: "C:poder.dias_inventario_hoy", nombre: "los días de inventario de hoy", valor: escalarRango(meses, 30), unidad: "dias", clase: claseRefDeEstado(fn.inventario.meses?.estado), fuente: "meses que alcanza lo guardado × 30" };
  } else {
    dias_inventario = insumoNulo("C:poder.dias_inventario_hoy", "los días de inventario de hoy", "dias", "falta cuánto dinero hay en mercadería o para cuántos meses alcanza");
  }

  // Días de pago: solo lo que respondió el dueño. Lo que debe no se usa (puede ser deuda con el banco).
  const pago = insumoDeRespuesta(e.respuestas, "dias_pago_proveedor", "los días que paga a su proveedor", "dias");
  const dias_pago: Insumo = { ...pago, id: "C:poder.dias_pago_hoy", nombre: "los días de pago de hoy" };

  return { venta, costo_directo, gastos, dias_cobro, dias_inventario, dias_pago };
}

const UNO = 0.01;

/** Las siete palancas, cada una con su fórmula y su clase. */
export function poderDelUno(i: InsumosPoder): PoderDelUno {
  const V = i.venta;
  const CD = i.costo_directo;
  const G = i.gastos;
  const periodo = V.fuente && V.valor ? V.fuente.split(",")[0]! : "un mes";
  const palancas: PalancaUno[] = [];
  const agregar = (clave: ClavePalancaUno, mueve: PalancaUno["mueve"], nombre: string, insumos: Insumo[], formula: string, valor: (() => Rango) | null, motivo?: string, supuestos: string[] = []) => {
    const faltan = insumos.filter((x) => !x.valor);
    const c = cuenta(`C:poder.${clave}`, nombre, "soles", insumos, { formula, periodo, supuestos }, faltan.length || !valor ? null : valor(), faltan.length ? motivoDeFaltantes(insumos) : motivo);
    palancas.push({ ...c, clave, mueve });
  };
  agregar("precio", "utilidad_mes", "Precio +1 %", [V], "utilidad de más al mes = venta del mes × 0,01", () => escalarRango(V.valor!, UNO), undefined, ["Si se vende la misma cantidad que hoy."]);
  agregar("volumen", "utilidad_mes", "Volumen +1 %", [V, CD], "utilidad de más al mes = (venta del mes − costo directo del mes) × 0,01", () => escalarRango(restarRangos(V.valor!, CD.valor!), UNO), undefined, ["Si el precio y la mezcla de lo que se vende siguen iguales."]);
  agregar("costo_directo", "utilidad_mes", "Costo directo −1 %", [CD], "utilidad de más al mes = costo directo del mes × 0,01", () => escalarRango(CD.valor!, UNO));
  agregar("gastos", "utilidad_mes", "Gastos −1 %", [G], "utilidad de más al mes = gastos del mes × 0,01", () => escalarRango(G.valor!, UNO));

  // Las de días: liberan caja una vez, y solo si se sabe cuántos días hay hoy (no se baja lo que no se conoce).
  const diaMenos = (clave: ClavePalancaUno, nombre: string, base: Insumo, dias: Insumo, formula: string, sinDias: string, supuestos: string[] = []) => {
    if (dias.valor && dias.valor.alto < 1 && clave !== "dias_pago") {
      const c = cuenta(`C:poder.${clave}`, nombre, "soles", [base, dias], { formula, periodo: "una vez" }, null, sinDias);
      palancas.push({ ...c, clave, mueve: "caja_una_vez" });
      return;
    }
    agregar(clave, "caja_una_vez", nombre, [base, dias], formula, () => escalarRango(base.valor!, 1 / 30), undefined, supuestos);
    const ultima = palancas[palancas.length - 1]!;
    ultima.calculo.periodo = "una vez";
  };
  diaMenos("dias_cobro", "Un día menos de cobro", V, i.dias_cobro, "caja que se libera una vez = venta del mes ÷ 30", "hoy ya cobra al contado: no hay días de cobro que bajar");
  diaMenos("dias_inventario", "Un día menos de inventario", CD, i.dias_inventario, "caja que se libera una vez = costo directo del mes ÷ 30", "hoy no guarda mercadería: no hay días de inventario que bajar");
  diaMenos("dias_pago", "Un día más para pagar", CD, i.dias_pago, "caja que se libera una vez = costo directo del mes ÷ 30", "", ["Las compras del mes son, más o menos, el costo directo del mes."]);

  const deUtilidad = palancas.filter((p) => p.mueve === "utilidad_mes");
  const deCaja = palancas.filter((p) => p.mueve === "caja_una_vez");
  const ordenar = (ps: PalancaUno[]) => ps.filter((p) => p.calculo.valor).sort((a, b) => centro(b.calculo.valor!) - centro(a.calculo.valor!) || a.clave.localeCompare(b.clave)).map((p) => p.clave);

  const juntas = (id: string, nombre: string, ps: PalancaUno[], formula: string, periodoJuntas: string): Cuenta => {
    const conCifra = ps.filter((p) => p.calculo.valor);
    const sin = ps.filter((p) => !p.calculo.valor);
    const valor = sumaDeExistentes(conCifra.map((p) => p.calculo.valor));
    const base: Calculo<Rango> = {
      valor,
      formula,
      periodo: periodoJuntas,
      fuentes: conCifra.map((p) => p.nombre),
      supuestos: ["Si cada palanca se mueve una unidad a la vez y no se cruzan entre sí."],
      limitaciones: sin.length ? [`Sin ${sin.map((p) => p.nombre.toLowerCase()).join(", ")}: les falta su dato.`] : [],
      ...(valor ? {} : { motivo_nulo: "ninguna palanca tiene su dato" }),
    };
    return {
      id,
      nombre,
      unidad: "soles",
      clase: valor ? peorClase(conCifra.map((p) => p.clase)) : "sin_dato",
      calculo: base,
      origen: conCifra.flatMap((p) => p.origen),
    };
  };

  return {
    insumos: i,
    palancas,
    orden: { utilidad: ordenar(deUtilidad), caja: ordenar(deCaja) },
    utilidad_juntas: juntas("C:poder.utilidad_juntas", "Las cuatro palancas de utilidad juntas", deUtilidad, "suma de lo que mueve cada palanca de utilidad, una unidad cada una", periodo),
    caja_juntas: juntas("C:poder.caja_juntas", "Las tres palancas de caja juntas", deCaja, "suma de la caja que libera cada palanca de días, un día cada una", "una vez"),
  };
}
