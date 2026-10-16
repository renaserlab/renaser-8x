/**
 * LAS FUGAS DE LA EMPRESA, EN TRES BOLSAS QUE NUNCA SE SUMAN (pieza 3 del plan del 16-10-2026). Todo sale SOLO de
 * los números que la empresa contó o mostró, y cada cifra dice de dónde sale.
 *
 *  - CAJA: el dinero que se escapa hoy. Lo vendido y no cobrado, lo que te deben tus clientes y lo que se queda en el
 *    camino al cobrar en otra moneda (fugaDeMoneda, src/lib/rentabilidad.ts). Es lo único que el dueño ve como «Se te
 *    está yendo», y lo único con color de alarma.
 *  - HORAS: el tiempo del dueño en lo que otra persona podría hacer. Hoy ningún dato lo cuenta, así que la bolsa dice
 *    «sin dato» hasta que exista esa medición.
 *  - OPORTUNIDAD: lo que se podría vender (la distancia a la mejor época). No es dinero que se va: es dinero que no
 *    entró. Va aparte, con otra palabra y sin color de alarma.
 *
 * POR QUÉ NO SE SUMAN. La tarjeta vieja («En riesgo al mes») juntaba lo vendido y no cobrado con la distancia a la
 * mejor época: a un dueño cuya mejor época quedó muy arriba le mostraba decenas de miles al mes «en riesgo» que nunca
 * tuvo. Y las horas no son soles. Por eso este módulo no devuelve ningún total entre bolsas: cada una suma solo lo
 * suyo, y solo lo de cada mes (lo que te deben es dinero parado: va en la caja, pero nunca dentro de su cifra del mes).
 *
 * LO QUE LA CAJA TODAVÍA NO MIDE: los gastos que no rinden (ningún dato los marca hoy) y lo que nunca se cobra de lo
 * vendido al crédito (rentabilidad.ts lo estima, pero es una parte de lo vendido y no cobrado: sumarlo lo contaría dos
 * veces).
 *
 * Regla sagrada: la máquina nunca inventa un monto. Sin dato, la bolsa dice sin dato (`alMes` null), jamás «S/ 0». Que
 * algo se midió y no se va nada se dice aparte (`revisado`), en palabras y sin cifra.
 */
import type { Metrica } from "./rules/anomalias";
import type { TableroRentabilidad } from "./rentabilidad";
import { moneda } from "./formato";

export type Bolsa = "caja" | "horas" | "oportunidad";
/** El orden en que se muestran: primero lo que se va, después el tiempo, al final lo que se podría ganar. */
export const BOLSAS: readonly Bolsa[] = ["caja", "horas", "oportunidad"];

/** Una fuga, con de dónde sale la cifra. `hasta` solo cuando la cifra es un rango (un estimado). */
export type Fuga = { bolsa: Bolsa; concepto: string; monto: number; hasta: number | null; base: string; mensual: boolean };

export type BolsaDeFugas = {
  bolsa: Bolsa;
  fugas: Fuga[];
  /** Lo de cada mes, sumado SOLO dentro de esta bolsa. null = sin dato: ninguna fuga de cada mes con cifra. */
  alMes: { desde: number; hasta: number } | null;
  /** Lo que se midió y no deja nada cada mes, en palabras del dueño. Sin cifra: no es un «S/ 0». */
  revisado: string[];
  /** Lo que falta para medir esta bolsa, en palabras del dueño. */
  faltan: string[];
};

/** Las tres bolsas, cada una con lo suyo. A propósito, sin ningún total entre ellas. */
export type Fugas = Record<Bolsa, BolsaDeFugas>;

/** Lo que devuelve fugaDeMoneda (rentabilidad.ts) cuando la empresa cobra en otra moneda. */
export type MonedaLeida = NonNullable<TableroRentabilidad["moneda"]>;

/** Cómo se le nombra cada bolsa al dueño. La oportunidad, sin ninguna palabra de alarma. */
export const BOLSA: Record<Bolsa, { titulo: string; que_es: string; sin_dato: string }> = {
  caja: {
    titulo: "Se te está yendo",
    que_es: "Dinero que sale o que no entra, según tus números.",
    sin_dato: "Sin dato al mes: faltan números",
  },
  horas: {
    titulo: "Tu tiempo",
    que_es: "Las horas tuyas en lo que otra persona podría hacer.",
    sin_dato: "Sin dato todavía",
  },
  oportunidad: {
    titulo: "Lo que podrías vender",
    que_es: "Lo que tu negocio ya demostró que puede vender. Es una cuenta aparte, que no se suma a las otras.",
    sin_dato: "Sin dato",
  },
};

const MES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (p: string) => MES[Number(p.slice(5, 7))] ?? p;
const ES_MES = /^\d{4}-\d{2}$/;
const PERIODO_DORADA = "epoca_dorada";

/** Un número que sirve: con valor, finito y no descartado por la consultora. */
const vale = (m: Metrica) => m.valor != null && Number.isFinite(Number(m.valor)) && m.estado !== "descartado";

const vacia = (bolsa: Bolsa): BolsaDeFugas => ({ bolsa, fugas: [], alMes: null, revisado: [], faltan: [] });

/** Lo que falta para la cuenta central de la caja de cada mes. Sin ella, nada autoriza a decir «no se te va nada». */
const FALTA_VENDIDO_Y_COBRADO = "lo que vendiste y lo que cobraste en un mismo mes";

/** Suma lo de cada mes de UNA bolsa. Sin ninguna fuga de cada mes, null: sin dato, nunca cero. */
function cerrar(b: BolsaDeFugas): BolsaDeFugas {
  const delMes = b.fugas.filter((f) => f.mensual);
  if (delMes.length)
    b.alMes = {
      desde: delMes.reduce((s, f) => s + f.monto, 0),
      hasta: delMes.reduce((s, f) => s + (f.hasta ?? f.monto), 0),
    };
  return b;
}

/**
 * Las fugas de la empresa en sus tres bolsas. `moneda`: lo de fugaDeMoneda (rentabilidad.ts); null si la empresa no
 * cobra en otra moneda; "no_leido" si no se pudo leer (la caja lo dice en lo que falta, no lo calla). Sin el campo,
 * no se mira.
 */
export function bolsasDeFugas(metricas: Metrica[], opciones: { moneda?: MonedaLeida | null | "no_leido" } = {}): Fugas {
  const serie = (clave: string) =>
    metricas
      .filter((m) => m.clave === clave && vale(m) && ES_MES.test(m.periodo))
      .map((m) => ({ periodo: m.periodo, valor: Number(m.valor) }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  /** El más reciente de una clave: el mes AAAA-MM más nuevo y, si no hay, el «actual». Nunca la mejor época. */
  const masReciente = (clave: string) => {
    const orden = (p: string) => (ES_MES.test(p) ? p : "");
    const c = metricas.filter((m) => m.clave === clave && vale(m) && m.periodo !== PERIODO_DORADA).sort((a, b) => orden(b.periodo).localeCompare(orden(a.periodo)));
    return c[0] ? Number(c[0].valor) : null;
  };
  const ventas = serie("venta_mes");

  // ── CAJA ─────────────────────────────────────────────────────────────────────────────────────
  const caja = vacia("caja");

  // 1. Lo vendido que no se cobró: el mes más reciente que tiene las dos cifras.
  const cobros = serie("cobrado_mes");
  const mes = [...ventas].reverse().find((v) => cobros.some((c) => c.periodo === v.periodo));
  if (!mes) caja.faltan.push(FALTA_VENDIDO_Y_COBRADO);
  else {
    const cobrado = cobros.find((c) => c.periodo === mes.periodo)!.valor;
    if (cobrado < mes.valor)
      caja.fugas.push({
        bolsa: "caja",
        concepto: "Vendido y no cobrado",
        monto: mes.valor - cobrado,
        hasta: null,
        base: `en ${nombreMes(mes.periodo)} vendiste ${moneda(mes.valor)} y cobraste ${moneda(cobrado)}`,
        mensual: true,
      });
    else caja.revisado.push(`en ${nombreMes(mes.periodo)} cobraste todo lo que vendiste`);
  }

  // 2. Lo que te deben tus clientes: dinero parado, no de cada mes. Si no te deben nada, no hay fuga que mostrar.
  const deuda = masReciente("deuda_clientes");
  if (deuda == null) caja.faltan.push("cuánto te deben tus clientes");
  else if (deuda > 0)
    caja.fugas.push({ bolsa: "caja", concepto: "Te deben tus clientes", monto: deuda, hasta: null, base: "según lo que contaste, dinero tuyo que aún no entra", mensual: false });

  // 3. Lo que se queda en el camino al cobrar en otra moneda: solo las ventas con la cuenta entera (lo esperado y lo
  //    que llegó a la cuenta). De cada mes solo si la empresa dijo cuántas cobró el mes pasado y de cuánto fue la última.
  const mon = opciones.moneda;
  if (mon === "no_leido") caja.faltan.push("tus ventas en otra moneda (no se pudieron leer)");
  else if (mon) {
    const r = mon.resumen.valor;
    if (!r) caja.faltan.push(mon.operaciones.length ? "cuánto llegó a tu cuenta en tus ventas en otra moneda" : "tus ventas cobradas en otra moneda");
    else if (r.perdido <= 0) caja.revisado.push("en tus ventas en otra moneda te llegó lo que esperabas");
    else {
      const n = mon.operaciones.filter((o) => o.completa).length;
      const enElCamino = `en ${n === 1 ? "una venta cobrada" : `${n} ventas cobradas`} en otra moneda se quedó ${moneda(r.perdido)} en el camino, entre el tipo de cambio y el banco`;
      const m = r.mes_estimado;
      if (m && m.alto > 0) {
        const desde = Math.max(0, m.bajo);
        caja.fugas.push({
          bolsa: "caja",
          concepto: "Se quedó en el camino al cobrar en otra moneda",
          monto: desde,
          hasta: m.alto !== desde ? m.alto : null,
          base: `${enElCamino}; al mes, con cuántas cobraste en otra moneda el mes pasado y de cuánto fue la última`,
          mensual: true,
        });
      } else {
        caja.fugas.push({ bolsa: "caja", concepto: "Se quedó en el camino al cobrar en otra moneda", monto: r.perdido, hasta: null, base: enElCamino, mensual: false });
        caja.faltan.push("cuántas ventas cobraste en otra moneda el mes pasado y de cuánto fue la última");
      }
    }
  }

  // ── HORAS ────────────────────────────────────────────────────────────────────────────────────
  // Ningún dato cuenta hoy las horas del dueño en lo que otro podría hacer: sin dato, dicho.
  const horas = vacia("horas");
  horas.faltan.push("cuántas horas a la semana haces tú lo que otra persona podría hacer");

  // ── OPORTUNIDAD ──────────────────────────────────────────────────────────────────────────────
  // La distancia a la mejor época, solo si vendía bastante más (más de un 25 %): lo que el negocio ya demostró que
  // puede vender. No es dinero que se va y nunca entra en la caja.
  const oportunidad = vacia("oportunidad");
  const dorada = metricas.find((m) => (m.clave === "venta_epoca_dorada" || (m.clave === "venta_mes" && m.periodo === PERIODO_DORADA)) && vale(m));
  const actual = ventas[ventas.length - 1];
  if (!dorada) oportunidad.faltan.push("cuánto vendías al mes en tu mejor época");
  if (!actual) oportunidad.faltan.push("cuánto vendiste el último mes");
  if (dorada && actual) {
    const mejor = Number(dorada.valor);
    if (mejor > actual.valor * 1.25)
      oportunidad.fugas.push({
        bolsa: "oportunidad",
        concepto: "Volver a vender como en tu mejor época",
        monto: mejor - actual.valor,
        hasta: null,
        base: `en tu mejor época vendías ${moneda(mejor)} al mes; en ${nombreMes(actual.periodo)}, ${moneda(actual.valor)}`,
        mensual: true,
      });
    else
      oportunidad.revisado.push(
        mejor > actual.valor ? `en ${nombreMes(actual.periodo)} vendiste cerca de lo de tu mejor época` : `en ${nombreMes(actual.periodo)} vendiste tanto como en tu mejor época, o más`
      );
  }

  return { caja: cerrar(caja), horas: cerrar(horas), oportunidad: cerrar(oportunidad) };
}

// ─── Cómo se dice ────────────────────────────────────────────────────────────────────────────────

const monto = (desde: number, hasta: number | null) =>
  hasta != null && Math.round(hasta) !== Math.round(desde) ? `${moneda(desde)} a ${moneda(hasta)}` : moneda(desde);

/** Cómo se dice «cada mes» en cada bolsa: lo que podrías vender es «más» de lo que vendes hoy. */
export const porMes = (bolsa: Bolsa) => (bolsa === "oportunidad" ? "más al mes" : "al mes");

/** La cifra de una fuga: «S/ 7,000 al mes», «S/ 12,000» (dinero parado) o «S/ 20,000 más al mes» (la oportunidad). */
export function cifraDeFuga(f: Fuga): string {
  const t = monto(f.monto, f.hasta);
  return f.mensual ? `${t} ${porMes(f.bolsa)}` : t;
}

/** El monto de cada mes de una bolsa («S/ 7,000», o «S/ 300 a S/ 450» si es un estimado), o null si no hay dato. */
export function montoDeBolsa(b: BolsaDeFugas): string | null {
  return b.alMes ? monto(b.alMes.desde, b.alMes.hasta) : null;
}

/** Lo de cada mes de una bolsa, o null si no hay dato (la pantalla lo dice rayado: jamás «S/ 0»). */
export function cifraDeBolsa(b: BolsaDeFugas): string | null {
  const t = montoDeBolsa(b);
  return t ? `${t} ${porMes(b.bolsa)}` : null;
}

export type TarjetaDelDueno = {
  titulo: string;
  sub: string;
  /** SOLO la caja de cada mes. La oportunidad nunca entra aquí. */
  cifra: { desde: number; hasta: number } | null;
  /** Sin cifra, lo que se dice en su lugar: rayado si falta el dato; sin rayar si se midió y no se va nada. */
  enVez: { texto: string; rayado: boolean } | null;
  /** Lo de la caja que no es de cada mes (lo que te deben): aparte, sin sumarse a la cifra. */
  aparte: string | null;
  /** La oportunidad, con otra palabra y sin color de alarma. */
  oportunidad: string | null;
};

/** La tarjeta del inicio del dueño: la caja como «Se te está yendo» y, aparte, lo que podría vender. */
export function tarjetaDelDueno(f: Fugas): TarjetaDelDueno {
  const caja = f.caja;
  const op = f.oportunidad.alMes;
  const parado = caja.fugas.filter((x) => !x.mensual).map((x) => `${x.concepto}: ${cifraDeFuga(x)}`);
  return {
    titulo: BOLSA.caja.titulo,
    sub: "Dinero que sale o no entra, según tus números",
    cifra: caja.alMes,
    // «No vemos dinero que se vaya» solo si se pudo comparar lo vendido con lo cobrado: que en otra moneda llegara lo
    // esperado no basta para decirlo si falta la cuenta central (sería un «S/ 0» dicho con palabras).
    enVez: caja.alMes
      ? null
      : caja.revisado.length && !caja.faltan.includes(FALTA_VENDIDO_Y_COBRADO)
        ? { texto: "Con lo que contaste, no vemos dinero que se te vaya cada mes", rayado: false }
        : { texto: BOLSA.caja.sin_dato, rayado: true },
    aparte: parado.length ? parado.join(" · ") : null,
    oportunidad: op ? `${BOLSA.oportunidad.titulo}: ${monto(op.desde, op.hasta)} más al mes, si vuelves a vender como en tu mejor época.` : null,
  };
}

/**
 * Las frases del resumen del informe (en tercera persona), cada bolsa en la suya: [antes, cifra, después], para que
 * la página resalte la cifra. La de la caja va con color de alarma; la de la oportunidad, no.
 */
export function resumenDelInforme(f: Fugas): { caja: [string, string, string] | null; oportunidad: [string, string, string] | null } {
  const caja = cifraDeBolsa(f.caja);
  const op = cifraDeBolsa(f.oportunidad);
  return {
    caja: caja ? ["Según los números que la empresa contó, se le están yendo del orden de ", caja, "."] : null,
    oportunidad: op ? ["Aparte, y sin sumarlo a lo anterior, podría vender del orden de ", op, " si vuelve a vender como en su mejor época."] : null,
  };
}
