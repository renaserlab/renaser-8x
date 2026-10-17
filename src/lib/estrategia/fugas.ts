/**
 * LAS FUGAS EN TRES BOLSAS QUE NO SE SUMAN, EL DINERO PARADO Y «SI SEGUIMOS IGUAL» (spec-estrategia-8x.md §4.2).
 *
 *  - CAJA (dinero al mes que se va): crédito que no se cobra, lo que se queda en el cambio, productos que restan, y la
 *    merma y los descuentos sin autorización solo si el dueño los contó.
 *  - HORAS (horas al mes del dueño en tareas que otro haría): en dinero SOLO si la consultora anotó cuánto cuesta por
 *    hora reemplazarlo; si no, en horas.
 *  - OPORTUNIDAD (dinero al mes que no entra): por cada uno más de cada 10 interesados que compre (no «todos los que no
 *    compran»: suponer que se convierten los diez infla la cifra), y la distancia con la mejor época, «ya lo vendiste
 *    antes».
 * Las bolsas no se suman entre sí, y el DINERO PARADO (lo que te deben, la mercadería que no se mueve) no es mensual:
 * nunca entra en la caja. «Vendido y no cobrado» no es una fuga del mes: es cobranza atrasada, el mismo dinero que ya
 * cuenta lo que te deben; se muestra como dinero parado solo si lo que te deben no se sabe.
 *
 * FUGAS VITALES: el menor grupo de fugas de caja que suma el 90 % de la bolsa (la regla 90/10 de la ruta).
 * Sin dato no hay fuga: una fuga que se sabe calcular pero le falta su dato queda sin cifra, con lo que falta, y no suma.
 *
 * Puro: sin base, sin red, sin IA.
 */
import { centro, escalarRango, multiplicarRangos, rangoDe, restarRangos, type Rango } from "../dato-oral";
import type { Calculo } from "../finanzas";
import { bolsasDeFugas } from "../perdida";
import type { TableroRentabilidad } from "../rentabilidad";
import type { EntradasPaquete, Unidad } from "./paquete";
import {
  cuenta, claseRefDeEstado, exacto, insumoDeDato, insumoDeRespuesta, insumoDeVital, motivoDeFaltantes, peorClase, sumaDeExistentes,
  type Cuenta, type Insumo,
} from "./cuentas";

export type BolsaFuga = "caja" | "horas" | "oportunidad";

export type Fuga = Cuenta & {
  clave: string;
  bolsa: BolsaFuga;
  /** Las claves del catálogo (supuestos.ts) que faltan para que esta fuga tenga cifra. */
  faltan: string[];
};

export type Parado = Cuenta & { clave: string; faltan: string[] };

export type MapaDeFugas = {
  caja: { fugas: Fuga[]; total: Cuenta; vitales: Cuenta & { claves: string[] } };
  horas: { fugas: Fuga[]; total: Cuenta };
  oportunidad: { fugas: Fuga[]; total: Cuenta };
  parado: Parado[];
  /** Si seguimos igual: lo que se va de la caja cada mes, y aparte lo que no entra. */
  no_actuar: { mes: Cuenta; oportunidad: Cuenta };
  /** Lo que se miró y no es una fuga, en palabras («ninguna línea con datos resta»). Sin cifra: no es un cero. */
  revisado: string[];
};

const HORAS_POR_SEMANA_AL_MES = 4.33;

/** Una cifra de fuga nunca baja de cero: si con lo que se sabe no se pierde nada, no es una fuga. */
const piso = (r: Rango): Rango => ({ bajo: Math.max(0, r.bajo), alto: Math.max(0, r.alto) });

type Entrada = { e: EntradasPaquete; t: TableroRentabilidad; venta: Insumo; mc: Insumo };

export function mapaDeFugas({ e, t, venta, mc }: Entrada): MapaDeFugas {
  const fn = e.ficha_negocio;
  const revisado: string[] = [];
  const caja: Fuga[] = [];
  const horas: Fuga[] = [];
  const oportunidad: Fuga[] = [];
  const fuga = (bolsa: BolsaFuga, clave: string, nombre: string, unidad: Unidad, insumos: Insumo[], formula: string, valor: Rango | null, faltan: string[], extra: { supuestos?: string[]; limitaciones?: string[]; motivo?: string } = {}): Fuga => {
    const c = cuenta(`C:fuga.${clave}`, nombre, unidad, insumos, { formula, periodo: "al mes", supuestos: extra.supuestos, limitaciones: extra.limitaciones }, valor, valor ? undefined : extra.motivo ?? motivoDeFaltantes(insumos));
    return { ...c, clave, bolsa, faltan: valor ? [] : faltan };
  };

  // ── CAJA ───────────────────────────────────────────────────────────────────────────────────────
  // 1. Crédito que no se cobra (rentabilidad.ts: venta × al crédito ÷ 10 × incobrables ÷ 10).
  if (fn.modulos.credito === false) revisado.push("no vende al crédito: no hay crédito que no se cobre");
  else {
    const p = t.credito?.valor?.perdida_mes ?? null;
    const insumos = [venta, insumoDeDato("B:credito.de_cada_10", "las ventas al crédito de cada 10", "de_cada_10", fn.credito.de_cada_10, "ficha del negocio"), insumoDeDato("B:credito.incobrables_de_cada_10", "los que nunca pagan de cada 10", "de_cada_10", fn.credito.incobrables_de_cada_10, "ficha del negocio")];
    // La cuenta del tablero pide también los días (calcularCredito de rentabilidad.ts): se nombran los cuatro insumos.
    const sabe = (d: { estado?: string } | null | undefined) => !!d && d.estado !== "no_lo_se" && !!rangoDe(d as never);
    const faltan = [
      ...(venta.valor ? [] : ["venta_mes"]),
      ...(sabe(fn.credito.de_cada_10) ? [] : ["credito.de_cada_10"]),
      ...(sabe(fn.credito.dias) ? [] : ["credito.dias"]),
      ...(sabe(fn.credito.incobrables_de_cada_10) ? [] : ["credito.incobrables_de_cada_10"]),
    ];
    if (p && piso(p).alto > 0) caja.push(fuga("caja", "credito_incobrable", "Crédito que no se cobra", "soles", insumos, t.credito!.formula, piso(p), []));
    else if (p) revisado.push("de lo que se vende al crédito, todo se cobra");
    else caja.push(fuga("caja", "credito_incobrable", "Crédito que no se cobra", "soles", insumos, "venta del mes × (al crédito de cada 10 ÷ 10) × (los que nunca pagan de cada 10 ÷ 10)", null, faltan, { motivo: t.credito?.motivo_nulo ?? motivoDeFaltantes(insumos) }));
  }

  // 2. Lo que se queda en el cambio al cobrar en otra moneda (solo si cobra en otra moneda).
  if (t.moneda) {
    const r = t.moneda.resumen;
    const m = r.valor?.mes_estimado ?? null;
    const insumo: Insumo = {
      id: "B:moneda.operaciones",
      nombre: "las ventas cobradas en otra moneda",
      valor: m,
      unidad: "soles",
      clase: e.operaciones.length && e.operaciones.every((o) => o.estado === "contado" || o.estado === "comprobado") ? "hecho" : "estimado",
      fuente: `${e.operaciones.length} ${e.operaciones.length === 1 ? "venta anotada" : "ventas anotadas"} y lo que dijo de cuántas cobra al mes`,
    };
    if (m && piso(m).alto > 0) caja.push(fuga("caja", "cambio", "Lo que se queda en el cambio", "soles", [insumo], r.formula, piso(m), [], { limitaciones: r.limitaciones, supuestos: r.supuestos }));
    else if (m) revisado.push("en las ventas en otra moneda llega lo que se esperaba");
    else {
      const motivo = r.valor ? "falta cuántas ventas cobra al mes en otra moneda y de cuánto suele ser cada una" : r.motivo_nulo ?? "falta la cuenta de lo que se pierde en el cambio";
      caja.push(fuga("caja", "cambio", "Lo que se queda en el cambio", "soles", [{ ...insumo, valor: null, clase: "sin_dato", motivo_nulo: motivo }], r.formula, null, [], { motivo }));
    }
  }

  // 3. Productos que cuestan más de lo que dejan.
  const restan = t.productos.filter((p) => p.contribucion_mes && centro(p.contribucion_mes) < 0);
  if (restan.length) {
    const suma = sumaDeExistentes(restan.map((p) => escalarRango(p.contribucion_mes!, -1)))!;
    const insumo: Insumo = {
      id: "C:fuga.productos_que_restan",
      nombre: `${restan.length === 1 ? "la línea que resta" : "las líneas que restan"} (${restan.map((p) => `«${p.nombre}»`).join(", ")})`,
      valor: suma,
      unidad: "soles",
      clase: peorClase(restan.flatMap((p) => [claseRefDeEstado(p.estados.precio), claseRefDeEstado(p.estados.costo), claseRefDeEstado(p.estados.unidades)])),
      fuente: "la tabla de productos",
    };
    caja.push(fuga("caja", "productos_que_restan", "Productos que cuestan más de lo que dejan", "soles", [insumo], "Σ de lo que pierde al mes cada línea que cuesta más de lo que se cobra", piso(suma), []));
  } else if (t.productos.some((p) => p.contribucion_mes)) revisado.push("ninguna línea con datos cuesta más de lo que deja");

  // 4 y 5. Merma y descuentos sin autorización: solo si el dueño los contó.
  for (const [clave, nombre, que] of [["merma_mes", "merma", "Mercadería dañada o vencida"], ["descuentos_mes", "descuentos", "Descuentos que el dueño no autorizó"]] as const) {
    const i = insumoDeRespuesta(e.respuestas, clave, clave === "merma_mes" ? "la merma del mes" : "los descuentos sin autorización del mes", "soles");
    if (i.valor && piso(i.valor).alto > 0) caja.push(fuga("caja", nombre, que, "soles", [i], "lo que contó el dueño del mes pasado", piso(i.valor), []));
    else if (i.valor) revisado.push(clave === "merma_mes" ? "el mes pasado no se perdió mercadería" : "el mes pasado no hubo descuentos sin autorización");
    else caja.push(fuga("caja", nombre, que, "soles", [i], "lo que contó el dueño del mes pasado", null, [clave]));
  }

  // ── HORAS ──────────────────────────────────────────────────────────────────────────────────────
  const hs = insumoDeRespuesta(e.respuestas, "horas_dueno_operacion_semana", "las horas del dueño en tareas que otro haría", "horas_semana");
  const horasMes = hs.valor ? escalarRango(hs.valor, HORAS_POR_SEMANA_AL_MES) : null;
  horas.push(fuga("horas", "horas_dueno", "Horas del dueño en tareas que otro haría", "horas_mes", [hs], `horas a la semana × ${String(HORAS_POR_SEMANA_AL_MES).replace(".", ",")}`, horasMes, ["horas_dueno_operacion_semana"]));
  const reemplazo = insumoDeDato("C:fuga.costo_reemplazo_hora", "lo que cuesta por hora reemplazar al dueño", "soles", e.costo_reemplazo_hora ?? null, "lo anotó la consultora");
  if (horasMes && reemplazo.valor) {
    horas.push(fuga("horas", "horas_dueno_soles", "Horas del dueño en tareas que otro haría, en dinero", "soles", [hs, reemplazo], "horas al mes × lo que cuesta por hora reemplazarlo", multiplicarRangos(horasMes, reemplazo.valor), []));
  }

  // ── OPORTUNIDAD ────────────────────────────────────────────────────────────────────────────────
  const interesados = insumoDeRespuesta(e.respuestas, "interesados_mes", "los interesados al mes", "unidades_mes");
  const ticket = insumoDeRespuesta(e.respuestas, "ticket_promedio", "lo que gasta un cliente en una compra", "soles");
  const unoMas = interesados.valor && ticket.valor && mc.valor ? multiplicarRangos(multiplicarRangos(escalarRango(interesados.valor, 1 / 10), ticket.valor), mc.valor) : null;
  const faltanUnoMas = [...(interesados.valor ? [] : ["interesados_mes"]), ...(ticket.valor ? [] : ["ticket_promedio"]), ...(mc.valor ? [] : ["costo_variable_mes"])];
  oportunidad.push(fuga("oportunidad", "uno_mas_de_cada_10", "Que compre uno más de cada 10 interesados", "soles", [interesados, ticket, mc], "interesados al mes × 1 de cada 10 × lo que gasta un cliente × lo que deja cada sol vendido", unoMas, faltanUnoMas, { supuestos: ["Por cada uno más de cada 10 que compre; no todos los que hoy no compran."] }));

  const dorada = insumoDeVital(e.metricas, "venta_mes", "la venta de la mejor época", "soles", { mejorEpoca: true });
  const doradaFicha = dorada.valor ? dorada : insumoDeDato("B:historia.mejor_epoca", "la venta de la mejor época", "soles", fn.historia.mejor_epoca?.venta_mes, "historia del negocio");
  if (doradaFicha.valor && venta.valor && mc.valor) {
    const distancia = restarRangos(doradaFicha.valor, venta.valor);
    if (piso(distancia).alto > 0) oportunidad.push(fuga("oportunidad", "mejor_epoca", "Volver a vender como en la mejor época", "soles", [doradaFicha, venta, mc], "(venta de la mejor época − venta del mes) × lo que deja cada sol vendido", multiplicarRangos(piso(distancia), mc.valor), [], { supuestos: ["Ya lo vendiste antes: el negocio demostró que puede."] }));
    else revisado.push("hoy vende tanto como en su mejor época, o más");
  } else {
    const faltan = [...(doradaFicha.valor && venta.valor ? [] : ["venta_mes"]), ...(mc.valor ? [] : ["costo_variable_mes"])];
    oportunidad.push(fuga("oportunidad", "mejor_epoca", "Volver a vender como en la mejor época", "soles", [doradaFicha, venta, mc], "(venta de la mejor época − venta del mes) × lo que deja cada sol vendido", null, [...new Set(faltan)]));
  }

  // ── DINERO PARADO (no es mensual: nunca entra en la caja) ──────────────────────────────────────
  const parado: Parado[] = [];
  const deuda = insumoDeVital(e.metricas, "deuda_clientes", "lo que le deben sus clientes", "soles");
  const conParado = (clave: string, nombre: string, insumos: Insumo[], formula: string, valor: Rango | null, faltan: string[]): Parado => {
    const c = cuenta(`C:parado.${clave}`, nombre, "soles", insumos, { formula, periodo: "hoy" }, valor, valor ? undefined : motivoDeFaltantes(insumos));
    return { ...c, clave, faltan: valor ? [] : faltan };
  };
  parado.push(conParado("deuda_clientes", "Lo que le deben sus clientes", [deuda], "lo que dijo que le deben hoy", deuda.valor, ["deuda_clientes"]));
  if (fn.modulos.inventario !== false) {
    const merc = insumoDeDato("B:inventario.parado", "la mercadería que no se mueve", "soles", fn.inventario.parado, "ficha del negocio");
    parado.push(conParado("mercaderia", "Mercadería que no se mueve", [merc], "el dinero en mercadería que no se mueve hace más de tres meses, como lo dijo", merc.valor, ["inventario.parado"]));
  }
  if (!deuda.valor) {
    const vnc = bolsasDeFugas(e.metricas.map((m) => ({ clave: m.clave, periodo: m.periodo, valor: m.valor, estado: m.estado ?? "" }))).caja.fugas.find((f) => f.concepto === "Vendido y no cobrado");
    if (vnc) {
      const i: Insumo = { id: "N:cobrado_mes", nombre: "lo vendido y no cobrado del mes", valor: exacto(vnc.monto), unidad: "soles", clase: "estimado", fuente: vnc.base };
      parado.push(conParado("vendido_no_cobrado", "Vendido y no cobrado", [i], "venta del mes − lo cobrado del mismo mes (es cobranza atrasada: se muestra solo porque falta lo que le deben)", exacto(vnc.monto), []));
    }
  }

  // ── TOTALES DE CADA BOLSA (nunca entre bolsas) ─────────────────────────────────────────────────
  const total = (bolsa: BolsaFuga, fugas: Fuga[], unidad: Unidad): Cuenta => {
    const con = fugas.filter((f) => f.calculo.valor);
    const valor = sumaDeExistentes(con.map((f) => f.calculo.valor));
    const sin = fugas.filter((f) => !f.calculo.valor);
    const calculo: Calculo<Rango> = {
      valor,
      formula: "suma de las fugas de esta bolsa que tienen cifra; nunca se suma con otra bolsa",
      periodo: "al mes",
      fuentes: con.map((f) => f.nombre),
      supuestos: [],
      limitaciones: sin.length ? [`Sin cifra todavía: ${sin.map((f) => f.nombre.toLowerCase()).join("; ")}.`] : [],
      ...(valor ? {} : { motivo_nulo: "ninguna fuga de esta bolsa tiene cifra todavía" }),
    };
    return { id: `C:fugas.${bolsa}.total`, nombre: bolsa === "caja" ? "Lo que se va de la caja al mes" : bolsa === "horas" ? "Las horas del dueño que se van al mes" : "Lo que no entra al mes", unidad, clase: valor ? peorClase(con.map((f) => f.clase)) : "sin_dato", calculo, origen: con.flatMap((f) => f.origen) };
  };
  const totalCaja = total("caja", caja, "soles");

  // Fugas vitales: el menor grupo de fugas de caja que suma el 90 % de la bolsa.
  const ordenadas = caja.filter((f) => f.calculo.valor).sort((a, b) => centro(b.calculo.valor!) - centro(a.calculo.valor!) || a.clave.localeCompare(b.clave));
  const sumaCentro = ordenadas.reduce((s, f) => s + centro(f.calculo.valor!), 0);
  const vitalesLista: Fuga[] = [];
  let acumulado = 0;
  for (const f of ordenadas) {
    if (sumaCentro > 0 && acumulado >= 0.9 * sumaCentro - 1e-9) break;
    vitalesLista.push(f);
    acumulado += centro(f.calculo.valor!);
  }
  const valorVitales = sumaDeExistentes(vitalesLista.map((f) => f.calculo.valor));
  const vitales = {
    id: "C:fugas.caja.vitales",
    nombre: "Las fugas vitales de la caja (el menor grupo que suma el 90 %)",
    unidad: "soles" as const,
    clase: valorVitales ? peorClase(vitalesLista.map((f) => f.clase)) : ("sin_dato" as const),
    calculo: {
      valor: valorVitales,
      formula: "se ordenan las fugas de caja de mayor a menor y se toma el menor grupo que llega al 90 % de la bolsa",
      periodo: "al mes",
      fuentes: vitalesLista.map((f) => f.nombre),
      supuestos: [],
      limitaciones: [],
      ...(valorVitales ? {} : { motivo_nulo: "ninguna fuga de caja tiene cifra todavía" }),
    },
    origen: vitalesLista.flatMap((f) => f.origen),
    claves: vitalesLista.map((f) => f.clave),
  };

  const totalOportunidad = total("oportunidad", oportunidad, "soles");
  const noActuar = (id: string, nombre: string, base: Cuenta): Cuenta => ({ ...base, id, nombre, calculo: { ...base.calculo, formula: `si seguimos igual: ${base.calculo.formula}` } });

  return {
    caja: { fugas: caja, total: totalCaja, vitales },
    horas: { fugas: horas, total: total("horas", horas.filter((f) => f.unidad === "horas_mes"), "horas_mes") },
    oportunidad: { fugas: oportunidad, total: totalOportunidad },
    parado,
    no_actuar: {
      mes: noActuar("C:no_actuar.mes", "Lo que se sigue yendo de la caja cada mes si seguimos igual", totalCaja),
      oportunidad: noActuar("C:no_actuar.oportunidad", "Lo que sigue sin entrar cada mes si seguimos igual", totalOportunidad),
    },
    revisado,
  };
}
