/**
 * LA PROYECCIÓN DE CADA JUGADA Y DE CADA CAMINO (spec-estrategia-8x.md §4.4).
 *
 * Cada jugada trae un EFECTO estructurado que solo nombra palancas, ids y supuestos; la cuenta la hace el código:
 *
 *   precio_linea, costo_parte, volumen_linea → palanca() de rentabilidad.ts, con el bajo y con el alto del supuesto
 *   precio_general  → venta del mes × pct (si se vende lo mismo)
 *   conversion      → interesados × (nuevo − actual) ÷ 10 × ticket × lo que deja cada sol vendido
 *   recompra        → clientes × (de cada 10 que vuelven: nuevo − actual) ÷ 10 × veces al mes × ticket × lo que deja
 *                     cada sol (solo lo que se SUMA, no la recompra que ya existe)
 *   cierre_fuga     → fuga × de cada 10 que se cierra ÷ 10
 *   gasto_fijo      → − gastos del mes × pct
 *   dias_cobro      → caja una vez: (venta del mes ÷ 30) × días menos
 *   inventario_liberado → caja una vez: mercadería parada × de cada 10 ÷ 10
 *   habilitador     → nada: dice qué jugada abre
 *
 * LA REGLA DE HONESTIDAD (ruta v1.2 §3.5, regla 1): si un insumo del ESTADO ACTUAL (los interesados, el ticket, los
 * clientes que vuelven, la fuga, los datos de la línea) es «sin dato», la jugada no tiene número: queda «por probar:
 * falta [la pregunta]» y no se suma al camino. Solo los supuestos de CAMBIO vienen de la IA, siempre dentro del límite
 * del catálogo (eso lo comprueba el validador).
 *
 * SIN INTERACCIÓN: las jugadas de un camino se suman como si no se tocaran, y se dice.
 *
 * HORIZONTES: cada jugada empieza a dar el día `desde_dia`. Al día h lleva dado utilidad_mes × max(0, h − desde_dia) ÷ 30
 * y su ritmo al mes desde ese día es utilidad_mes. Se calculan los días 14, 30 y 90: ritmo al mes, acumulado y caja
 * liberada, por jugada y por camino, y el camino se compara con la cuenta del multiplicador y con «si seguimos igual».
 * Cada número lleva su origen en palabras, sin ids.
 *
 * Puro: sin base, sin red, sin IA.
 */
import { escalarRango, multiplicarRangos, restarRangos, type Rango } from "../dato-oral";
import type { Calculo } from "../finanzas";
import { palanca, type PedidoPalanca } from "../rentabilidad";
import type { ModeloNegocio } from "../negocio";
import { CLAVES_SUPUESTO, preguntaDe } from "./supuestos";
import { configDeCalculos, type Calculos } from "./calculos";
import { textoDeValor, type ClaseRef, type RefValor } from "./paquete";
import { peorClase, textoDeOrigen, sumaDeExistentes, CERO } from "./cuentas";
import { multiploDe } from "./multiplicador";
import { LIMITACION_SIN_INTERACCION, LIMITACION_NO_ES_PROMESA } from "./textos";

// ─── Tipos ───────────────────────────────────────────────────────────────────────────────────────

/** El efecto de una jugada. El esquema Zod de esquemas.ts (tramo 2) tiene que coincidir con este tipo. */
export type Efecto =
  | { tipo: "precio_linea"; linea: string; pct: string }
  | { tipo: "costo_parte"; linea: string; parte: string; pct: string }
  | { tipo: "volumen_linea"; linea: string; pct: string }
  | { tipo: "precio_general"; pct: string }
  | { tipo: "conversion"; interesados: string; de_cada_10_nuevo: string }
  | { tipo: "recompra"; clientes: string; de_cada_10: string; veces_mes: string | null }
  | { tipo: "cierre_fuga"; fuga: string; de_cada_10: string }
  | { tipo: "gasto_fijo"; pct: string }
  | { tipo: "dias_cobro"; menos_dias: string }
  | { tipo: "inventario_liberado"; de_cada_10: string }
  | { tipo: "habilitador"; abre: string };

/** Lo que hace falta de un supuesto de cambio para hacer la cuenta. */
export type SupuestoCuenta = { id: string; clave: string; rango: Rango; que_se_supone: string };

export type ContextoProyeccion = {
  calculos: Calculos;
  /** Los ids del paquete (refsDelPaquete) y de los cálculos (refsDeCalculos), juntos. */
  refs: Map<string, RefValor>;
  supuestos: SupuestoCuenta[];
  /** Para escribir la pregunta de capacidad con la unidad del negocio. */
  modelo?: ModeloNegocio | null;
};

export type EstadoJugada = "con_numero" | "por_probar" | "habilitador" | "mueve_horas" | "invalida";
export type FaltaParaProbar = { id: string; clave: string; que_falta: string; pregunta: string | null };

export type ProyeccionJugada = {
  estado: EstadoJugada;
  /** Utilidad de más cada mes una vez que la jugada da. Con estado distinto de con_numero, null con su motivo. */
  utilidad_mes: Calculo<Rango>;
  /** Caja que se libera una vez. */
  caja_una_vez: Calculo<Rango>;
  /** Solo las jugadas que cierran la fuga de horas: horas al mes que se le liberan al dueño. */
  horas_mes: Rango | null;
  /** Lo que falta saber para que la jugada tenga número (y su pregunta, si se pregunta suelta). */
  por_probar: FaltaParaProbar[];
  /** Por qué la jugada no se puede calcular aunque tuviera datos (un id que no existe, un supuesto donde va un dato…). */
  invalida: string | null;
  /** Solo habilitador: la jugada que abre. */
  abre: string | null;
  origen: { nombre: string; clase: ClaseRef }[];
  clase: ClaseRef;
  texto_origen: string;
};

export const HORIZONTES = [14, 30, 90] as const;
export type Horizonte = (typeof HORIZONTES)[number];
export type ClaveHorizonte = `d${Horizonte}`;
const CLAVES_HORIZONTE: readonly ClaveHorizonte[] = ["d14", "d30", "d90"];
/** Lo mismo para los tres horizontes, con el tipo exacto. */
const porHorizonte = <T>(f: (h: ClaveHorizonte) => T): Record<ClaveHorizonte, T> => ({ d14: f("d14"), d30: f("d30"), d90: f("d90") });
const diaDe = (h: ClaveHorizonte): number => Number(h.slice(1));

export type JugadaParaProyectar = { id: string; efecto: Efecto; desde_dia: number };

export type ProyeccionCamino = {
  prefijo: "a" | "b";
  jugadas: {
    id: string;
    desde_dia: number;
    proyeccion: ProyeccionJugada;
    /** null cuando la jugada no tiene número: no es cero, no se suma. */
    por_horizonte: Record<ClaveHorizonte, { ritmo: Rango | null; acumulado: Rango | null; caja: Rango | null }>;
  }[];
  total: Record<ClaveHorizonte, { ritmo: Calculo<Rango>; acumulado: Calculo<Rango>; caja: Calculo<Rango> }>;
  /** La utilidad al mes en cada horizonte: la de hoy (de las cuentas) más el ritmo del camino. */
  utilidad: Record<ClaveHorizonte, Calculo<Rango>>;
  /** Cuántas veces la utilidad de hoy. null con motivo si la de hoy podría ser cero o negativa. */
  multiplo: Record<ClaveHorizonte, Calculo<Rango>>;
  clase: ClaseRef;
  texto_origen: string;
  /** «a 90 días, la utilidad pasaría de … a entre … y …: ×a a ×b», y lo que se pierde si seguimos igual. */
  comparacion: string;
  limitaciones: string[];
  cuantas_por_probar: number;
};

// ─── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

const PERIODO = "al mes, desde el día en que la jugada empieza a dar";

function nulo(formula: string, motivo: string, extra: { supuestos?: string[]; limitaciones?: string[] } = {}): Calculo<Rango> {
  return { valor: null, formula, periodo: PERIODO, fuentes: [], supuestos: extra.supuestos ?? [], limitaciones: extra.limitaciones ?? [], motivo_nulo: motivo };
}
function con(valor: Rango, formula: string, fuentes: string[], extra: { supuestos?: string[]; limitaciones?: string[] } = {}): Calculo<Rango> {
  return { valor, formula, periodo: PERIODO, fuentes, supuestos: extra.supuestos ?? [], limitaciones: [LIMITACION_NO_ES_PROMESA, ...(extra.limitaciones ?? [])] };
}

/** La clave del catálogo que hay detrás de un id de dato: «X:linea.precio@ab12cd34» → «linea.precio». */
export function claveDeRef(id: string): string {
  return id.replace(/^[A-Z]:/, "").replace(/@.*$/, "");
}

/** Une los extremos de dos rangos (el del bajo y el del alto del supuesto). */
const unir = (a: Rango, b: Rango): Rango => ({ bajo: Math.min(a.bajo, a.alto, b.bajo, b.alto), alto: Math.max(a.bajo, a.alto, b.bajo, b.alto) });

type Dato = { ok: true; valor: Rango; clase: ClaseRef; nombre: string } | { ok: false; falta: FaltaParaProbar } | { ok: false; invalida: string };

/** Un dato de HOY por su id. Un supuesto ahí es un error: lo de hoy no se supone. Sin valor, por probar. */
function datoDeHoy(id: string, ctx: ContextoProyeccion): Dato {
  if (id.startsWith("S:")) return { ok: false, invalida: `«${id}» es un supuesto donde va el dato de hoy: lo de hoy no se supone, se pregunta` };
  const r = ctx.refs.get(id);
  if (r?.valor) return { ok: true, valor: r.valor, clase: r.clase, nombre: r.nombre.charAt(0).toLowerCase() + r.nombre.slice(1) };
  const clave = claveDeRef(id);
  const def = CLAVES_SUPUESTO[clave];
  if (r || (/^[XNQ]:/.test(id) && def)) {
    return { ok: false, falta: { id: id.startsWith("X:") ? id : `X:${clave}`, clave: def ? clave : "otra", que_falta: def?.que_falta ?? r?.nombre ?? clave, pregunta: def ? preguntaDe(clave, ctx.modelo ?? null) : null } };
  }
  return { ok: false, invalida: `«${id}» no existe en el paquete ni en los cálculos` };
}

/** Una clave del catálogo que falta, como entrada de «por probar». */
function falta(clave: string, ctx: ContextoProyeccion, id = `X:${clave}`): FaltaParaProbar {
  return { id, clave, que_falta: CLAVES_SUPUESTO[clave]?.que_falta ?? clave, pregunta: preguntaDe(clave, ctx.modelo ?? null) };
}

function armar(
  estado: EstadoJugada,
  partes: { utilidad?: Calculo<Rango>; caja?: Calculo<Rango>; horas?: Rango | null; por_probar?: FaltaParaProbar[]; invalida?: string | null; abre?: string | null; origen?: { nombre: string; clase: ClaseRef }[] }
): ProyeccionJugada {
  const origen = partes.origen ?? [];
  const motivo = estado === "por_probar"
    ? `por probar: falta ${(partes.por_probar ?? []).map((f) => f.que_falta).join("; ")}`
    : estado === "invalida" ? `no se puede calcular: ${partes.invalida}` : estado === "habilitador" ? `no mueve dinero por sí misma: abre ${partes.abre}` : "libera horas del dueño, no dinero";
  const vacio = (formula: string) => nulo(formula, motivo);
  return {
    estado,
    utilidad_mes: partes.utilidad ?? vacio("utilidad de más al mes"),
    caja_una_vez: partes.caja ?? vacio("caja que se libera una vez"),
    horas_mes: partes.horas ?? null,
    por_probar: partes.por_probar ?? [],
    invalida: partes.invalida ?? null,
    abre: partes.abre ?? null,
    origen,
    clase: estado === "con_numero" ? peorClase(origen.map((o) => o.clase)) : estado === "por_probar" ? "sin_dato" : peorClase(origen.map((o) => o.clase)),
    texto_origen: textoDeOrigen(origen),
  };
}

const conSoloUtilidad = (u: Calculo<Rango>, origen: { nombre: string; clase: ClaseRef }[]) =>
  armar("con_numero", { utilidad: u, caja: con(CERO, "esta jugada no libera caja de una vez: mueve la utilidad del mes", []), origen });
const conSoloCaja = (c: Calculo<Rango>, origen: { nombre: string; clase: ClaseRef }[]) =>
  armar("con_numero", { utilidad: con(CERO, "esta jugada no mueve la utilidad del mes: libera caja una vez", []), caja: { ...c, periodo: "una vez, desde el día en que la jugada empieza a dar" }, origen });

// ─── Una jugada ──────────────────────────────────────────────────────────────────────────────────

export function proyectarEfecto(efecto: Efecto, ctx: ContextoProyeccion): ProyeccionJugada {
  const c = ctx.calculos;
  const t = c.tablero;
  const sup = (id: string) => ctx.supuestos.find((s) => s.id === id) ?? null;
  const origenSup = (s: SupuestoCuenta) => ({ nombre: s.que_se_supone.charAt(0).toLowerCase() + s.que_se_supone.slice(1), clase: "supuesto" as const });
  const invalida = (motivo: string) => armar("invalida", { invalida: motivo });
  const porProbar = (fs: FaltaParaProbar[], origen: { nombre: string; clase: ClaseRef }[] = []) => armar("por_probar", { por_probar: fs, origen });

  if (efecto.tipo === "habilitador") return armar("habilitador", { abre: efecto.abre });

  // ── Las tres de una línea: palanca() de rentabilidad.ts con el bajo y con el alto del supuesto.
  if (efecto.tipo === "precio_linea" || efecto.tipo === "costo_parte" || efecto.tipo === "volumen_linea") {
    const m = /^L:([A-Za-z0-9_]+)/.exec(efecto.linea);
    const linea = m ? c.lineas.find((l) => l.corto === `L:${m[1]}`) : undefined;
    if (!linea) return invalida(`«${efecto.linea}» no es una línea de lo que vende la empresa`);
    const s = sup(efecto.pct);
    if (!s) return invalida(`el supuesto «${efecto.pct}» no existe`);
    const prod = t.productos.find((p) => p.id === linea.id);
    if (!prod) return invalida(`«${linea.nombre}» no está en el tablero`);
    const corto = linea.corto.slice(2);
    const faltan: FaltaParaProbar[] = [];
    if (!prod.precio_efectivo) faltan.push(falta("linea.precio", ctx, `X:linea.precio@${corto}`));
    if (!prod.costo) faltan.push(falta("linea.costo", ctx, `X:linea.costo@${corto}`));
    if (!prod.unidades_mes) faltan.push(falta("linea.unidades_mes", ctx, `X:linea.unidades_mes@${corto}`));
    const claseLinea = peorClase(["precio", "costo", "unidades"].map((k): ClaseRef => ctx.refs.get(`${linea.corto}.${k}`)?.clase ?? "estimado"));
    const origenLinea = { nombre: `los datos de «${linea.nombre}»`, clase: claseLinea };
    if (faltan.length) return porProbar(faltan.map((f) => ({ ...f, que_falta: `${f.que_falta}: «${linea.nombre}»` })), [origenLinea, origenSup(s)]);
    const tipo: PedidoPalanca["tipo"] = efecto.tipo === "precio_linea" ? "precio" : efecto.tipo === "costo_parte" ? "parte" : "volumen";
    const delta = (p: number): Rango | string => {
      if (p === 0) return CERO;
      const magnitud = Math.abs(p);
      const pedido: PedidoPalanca = tipo === "parte" && efecto.tipo === "costo_parte" ? { tipo, lineaId: prod.id, parte: efecto.parte, pct: magnitud } : { tipo: tipo as "precio" | "volumen", lineaId: prod.id, pct: magnitud };
      const r = palanca(t, pedido);
      if (!r.valor) return r.motivo_nulo ?? "faltan datos";
      // precio y volumen suman cuando el supuesto es positivo; en una parte del costo, cuando es negativo (el costo baja).
      const suma = tipo === "parte" ? p < 0 : p > 0;
      return suma ? r.valor.delta_mes : escalarRango(r.valor.delta_mes, -1);
    };
    const a = delta(s.rango.bajo);
    const b = delta(s.rango.alto);
    if (typeof a === "string" || typeof b === "string") {
      const motivo = (typeof a === "string" ? a : b) as string;
      if (/no tiene una parte del costo llamada/.test(motivo)) return invalida(motivo);
      return porProbar([{ ...falta("linea.costo", ctx, `X:linea.costo@${corto}`), que_falta: `${CLAVES_SUPUESTO["linea.costo"]!.que_falta}: «${linea.nombre}» (${motivo})` }], [origenLinea, origenSup(s)]);
    }
    const formula = tipo === "precio" ? "precio × % que sube × unidades al mes (si se vende lo mismo)" : tipo === "parte" ? "costo de la parte × % que baja × unidades al mes" : "lo que deja cada unidad × unidades al mes × % que sube";
    return conSoloUtilidad(con(unir(a, b), formula, [linea.nombre, s.que_se_supone]), [origenLinea, origenSup(s)]);
  }

  // ── El resto, con los insumos de la empresa.
  const s = sup(
    efecto.tipo === "precio_general" || efecto.tipo === "gasto_fijo" ? efecto.pct
      : efecto.tipo === "conversion" ? efecto.de_cada_10_nuevo
      : efecto.tipo === "dias_cobro" ? efecto.menos_dias
      : efecto.de_cada_10
  );
  if (!s) return invalida("el supuesto de la jugada no existe");
  const V = c.insumos.venta;
  const mc = c.insumos.mc;
  const deInsumo = (i: { nombre: string; clase: ClaseRef }) => ({ nombre: i.nombre, clase: i.clase });

  if (efecto.tipo === "precio_general") {
    if (!V.valor) return porProbar([falta("venta_mes", ctx)], [origenSup(s)]);
    const u = multiplicarRangos(V.valor, { bajo: s.rango.bajo / 100, alto: s.rango.alto / 100 });
    return conSoloUtilidad(con(u, "venta del mes × % que sube el precio (si se vende lo mismo)", [V.nombre, s.que_se_supone]), [deInsumo(V), origenSup(s)]);
  }

  if (efecto.tipo === "gasto_fijo") {
    const G = c.insumos.gastos;
    if (!G.valor) return porProbar([falta("gastos_mes", ctx)], [origenSup(s)]);
    const u = multiplicarRangos(G.valor, { bajo: -s.rango.alto / 100, alto: -s.rango.bajo / 100 });
    return conSoloUtilidad(con(u, "− gastos del mes × % que cambian (si bajan, la utilidad sube)", [G.nombre, s.que_se_supone]), [deInsumo(G), origenSup(s)]);
  }

  if (efecto.tipo === "dias_cobro") {
    const dc = c.poder.insumos.dias_cobro;
    const faltan = [...(V.valor ? [] : [falta("venta_mes", ctx)]), ...(dc.valor ? [] : [falta("credito.dias", ctx), falta("credito.de_cada_10", ctx)])];
    if (faltan.length) return porProbar(faltan, [origenSup(s)]);
    const caja = multiplicarRangos(escalarRango(V.valor!, 1 / 30), s.rango);
    return conSoloCaja(con(caja, "(venta del mes ÷ 30) × días que se cobra antes", [V.nombre, dc.nombre, s.que_se_supone]), [deInsumo(V), deInsumo(dc), origenSup(s)]);
  }

  if (efecto.tipo === "inventario_liberado") {
    const parado = c.fugas.parado.find((p) => p.clave === "mercaderia");
    if (!parado?.calculo.valor) return porProbar([falta("inventario.parado", ctx)], [origenSup(s)]);
    const caja = multiplicarRangos(parado.calculo.valor, { bajo: s.rango.bajo / 10, alto: s.rango.alto / 10 });
    return conSoloCaja(con(caja, "mercadería parada × de cada 10 que se libera ÷ 10", [parado.nombre, s.que_se_supone]), [{ nombre: "la mercadería que no se mueve", clase: parado.clase }, origenSup(s)]);
  }

  if (efecto.tipo === "cierre_fuga") {
    if (efecto.fuga.startsWith("C:parado.")) return invalida(`«${efecto.fuga}» es dinero parado, no una fuga del mes: se libera con cobrar antes o con liberar mercadería`);
    const f = [...c.fugas.caja.fugas, ...c.fugas.horas.fugas, ...c.fugas.oportunidad.fugas].find((x) => x.id === efecto.fuga);
    if (!f) return invalida(`«${efecto.fuga}» no es una fuga que 8X haya calculado`);
    const origenFuga = { nombre: f.nombre.charAt(0).toLowerCase() + f.nombre.slice(1), clase: f.clase };
    if (!f.calculo.valor) return porProbar(f.faltan.length ? f.faltan.map((k) => falta(k, ctx)) : [{ id: `X:${f.clave}`, clave: "otra", que_falta: f.calculo.motivo_nulo ?? f.nombre, pregunta: null }], [origenFuga, origenSup(s)]);
    const parte = multiplicarRangos(f.calculo.valor, { bajo: s.rango.bajo / 10, alto: s.rango.alto / 10 });
    if (f.unidad === "horas_mes") return armar("mueve_horas", { horas: parte, origen: [origenFuga, origenSup(s)] });
    return conSoloUtilidad(con(parte, "fuga del mes × de cada 10 que se cierra ÷ 10", [f.nombre, s.que_se_supone]), [origenFuga, origenSup(s)]);
  }

  // ── Conversión y recompra: el estado de hoy son DATOS (nunca un supuesto) y solo se cuenta lo que se suma.
  const ticket = datoDeHoy("Q:ticket_promedio", ctx);
  const faltan: FaltaParaProbar[] = [];
  const origen: { nombre: string; clase: ClaseRef }[] = [];
  const usar = (d: Dato): Rango | null => {
    if (d.ok) {
      origen.push({ nombre: d.nombre, clase: d.clase });
      return d.valor;
    }
    if ("falta" in d) faltan.push(d.falta);
    return null;
  };
  const errores: string[] = [];
  const revisar = (d: Dato) => {
    if (!d.ok && "invalida" in d) errores.push(d.invalida);
    return d;
  };

  if (efecto.tipo === "conversion") {
    const interesados = usar(revisar(datoDeHoy(efecto.interesados, ctx)));
    const actual = usar(revisar(datoDeHoy("N:conversion_de_cada_10", ctx)));
    const tk = usar(revisar(ticket));
    if (errores.length) return invalida(errores.join("; "));
    if (!mc.valor) faltan.push(falta("costo_variable_mes", ctx));
    else origen.push(deInsumo(mc));
    origen.push(origenSup(s));
    if (faltan.length || !interesados || !actual || !tk) return porProbar(faltan, origen);
    const diff = escalarRango(restarRangos(s.rango, actual), 1 / 10);
    const u = multiplicarRangos(multiplicarRangos(multiplicarRangos(interesados, diff), tk), mc.valor!);
    return conSoloUtilidad(con(u, "interesados al mes × (de cada 10 que comprarían − de cada 10 que compran hoy) ÷ 10 × lo que gasta un cliente × lo que deja cada sol vendido", origen.map((o) => o.nombre)), origen);
  }

  // recompra
  const clientes = usar(revisar(datoDeHoy(efecto.clientes, ctx)));
  const actual = usar(revisar(datoDeHoy("Q:clientes_que_vuelven_de_cada_10", ctx)));
  let veces: Rango | null = { bajo: 1, alto: 1 };
  const supuestos: string[] = [];
  if (efecto.veces_mes) veces = usar(revisar(datoDeHoy(efecto.veces_mes, ctx)));
  else supuestos.push("Sin saber cuántas veces compra al mes quien vuelve, se cuenta una sola compra: lo mínimo que quiere decir volver.");
  const tk = usar(revisar(ticket));
  if (errores.length) return invalida(errores.join("; "));
  if (!mc.valor) faltan.push(falta("costo_variable_mes", ctx));
  else origen.push(deInsumo(mc));
  origen.push(origenSup(s));
  if (faltan.length || !clientes || !actual || !veces || !tk) return porProbar(faltan, origen);
  const diff = escalarRango(restarRangos(s.rango, actual), 1 / 10);
  const u = multiplicarRangos(multiplicarRangos(multiplicarRangos(multiplicarRangos(clientes, diff), veces), tk), mc.valor!);
  return conSoloUtilidad(con(u, "clientes × (de cada 10 que volverían − de cada 10 que vuelven hoy) ÷ 10 × veces al mes × lo que gasta un cliente × lo que deja cada sol vendido (solo lo que se suma)", origen.map((o) => o.nombre), { supuestos }), origen);
}

// ─── Un camino ───────────────────────────────────────────────────────────────────────────────────

export function proyectarCamino(prefijo: "a" | "b", jugadas: JugadaParaProyectar[], ctx: ContextoProyeccion): ProyeccionCamino {
  const cfg = configDeCalculos(ctx.calculos);
  const proyectadas = jugadas.map((j) => {
    const p = proyectarEfecto(j.efecto, ctx);
    const desde = Math.max(1, Math.min(90, Math.round(j.desde_dia)));
    const conNumero = p.estado === "con_numero";
    const por_horizonte = porHorizonte((clave) => {
      const h = diaDe(clave);
      const activo = h >= desde;
      return {
        ritmo: conNumero ? (activo ? p.utilidad_mes.valor! : CERO) : null,
        acumulado: conNumero ? escalarRango(p.utilidad_mes.valor!, Math.max(0, h - desde) / 30) : null,
        caja: conNumero ? (activo ? p.caja_una_vez.valor! : CERO) : null,
      };
    });
    return { id: j.id, desde_dia: desde, proyeccion: p, por_horizonte };
  });

  const conNumero = proyectadas.filter((j) => j.proyeccion.estado === "con_numero");
  const porProbar = proyectadas.filter((j) => j.proyeccion.estado === "por_probar");
  const limitaciones = [LIMITACION_SIN_INTERACCION, LIMITACION_NO_ES_PROMESA];
  if (porProbar.length) limitaciones.push(`${porProbar.length} ${porProbar.length === 1 ? "jugada está" : "jugadas están"} por probar: no entran en la suma hasta tener su dato.`);
  const origen = conNumero.flatMap((j) => j.proyeccion.origen);
  const clase: ClaseRef = conNumero.length ? peorClase(origen.map((o) => o.clase)) : "sin_dato";
  const fuentes = conNumero.map((j) => j.id);
  const sumar = (h: ClaveHorizonte, campo: "ritmo" | "acumulado" | "caja", formula: string, periodo: string): Calculo<Rango> => {
    const valor = sumaDeExistentes(conNumero.map((j) => j.por_horizonte[h][campo]));
    return valor
      ? { valor, formula, periodo, fuentes, supuestos: [], limitaciones }
      : { valor: null, formula, periodo, fuentes, supuestos: [], limitaciones, motivo_nulo: "ninguna jugada del camino tiene número todavía" };
  };
  const total = porHorizonte((h) => ({
    ritmo: sumar(h, "ritmo", "suma de lo que deja de más al mes cada jugada que ya empezó a dar", `al día ${diaDe(h)}`),
    acumulado: sumar(h, "acumulado", "suma de lo que lleva dado cada jugada: utilidad al mes × días desde que empezó ÷ 30", `hasta el día ${diaDe(h)}`),
    caja: sumar(h, "caja", "suma de la caja que liberó cada jugada que ya empezó", `hasta el día ${diaDe(h)}`),
  }));

  const u0 = ctx.calculos.multiplicador.utilidad_hoy.calculo.valor;
  const utilidad = porHorizonte((h): Calculo<Rango> => {
    const r = total[h].ritmo.valor;
    const formula = "utilidad de hoy (de las cuentas) + lo que deja de más al mes el camino";
    if (u0 && r) return { valor: { bajo: u0.bajo + r.bajo, alto: u0.alto + r.alto }, formula, periodo: `al mes, al día ${diaDe(h)}`, fuentes: ["la utilidad de hoy", ...fuentes], supuestos: [], limitaciones };
    const motivo = !u0 ? ctx.calculos.multiplicador.utilidad_hoy.calculo.motivo_nulo ?? "falta la utilidad de hoy" : "ninguna jugada del camino tiene número todavía";
    return { valor: null, formula, periodo: `al día ${diaDe(h)}`, fuentes: [], supuestos: [], limitaciones, motivo_nulo: motivo };
  });
  const multiplo = porHorizonte((h): Calculo<Rango> => {
    const r = total[h].ritmo.valor;
    const formula = "(utilidad de hoy + lo que deja de más el camino) ÷ utilidad de hoy";
    const m = u0 && r ? multiploDe(u0, r) : null;
    if (m) return { valor: m, formula, periodo: `al día ${diaDe(h)}`, fuentes: ["la utilidad de hoy", ...fuentes], supuestos: [], limitaciones };
    const motivo = !u0 ? "falta la utilidad de hoy" : !r ? "ninguna jugada del camino tiene número todavía" : "con lo que se sabe, la utilidad de hoy podría ser cero o negativa: el camino se compara con el punto de equilibrio";
    return { valor: null, formula, periodo: `al día ${diaDe(h)}`, fuentes: [], supuestos: [], limitaciones, motivo_nulo: motivo };
  });

  // La comparación, en una frase: contra la cuenta del multiplicador y contra seguir igual.
  const partes: string[] = [];
  const u90 = utilidad.d90.valor;
  const m90 = multiplo.d90.valor;
  const soles = (r: Rango) => textoDeValor(r, "soles", cfg, { redondear: true });
  if (u0 && u90) partes.push(`a 90 días, la utilidad pasaría de ${soles(u0)} a ${soles(u90)} al mes${m90 ? ` (${textoDeValor(m90, "veces", cfg, { redondear: true }).replace(/^entre /, "de ").replace(" y ", " a ")})` : ""}`);
  else if (total.d90.ritmo.valor) partes.push(`a 90 días, el camino dejaría ${soles(total.d90.ritmo.valor)} más al mes`);
  const noActuar = ctx.calculos.fugas.no_actuar.mes.calculo.valor;
  if (noActuar) partes.push(`si seguimos igual, se siguen yendo ${soles(noActuar)} de la caja cada mes`);

  return {
    prefijo,
    jugadas: proyectadas,
    total,
    utilidad,
    multiplo,
    clase,
    texto_origen: textoDeOrigen(origen),
    comparacion: partes.join("; "),
    limitaciones,
    cuantas_por_probar: porProbar.length,
  };
}

// ─── Los ids R: de un camino ─────────────────────────────────────────────────────────────────────

/**
 * Cada número de un camino con su id: `R:a.J2.mes` (lo que deja la jugada al mes), `R:a.J2.caja`, `R:a.J2.d14` (su
 * ritmo al día 14), `R:a.J2.acum.d90`, `R:a.total.d90` (lo que deja de más el camino al mes, al día 90),
 * `R:a.total.acum.d90`, `R:a.caja.d90`, `R:a.utilidad.d90`, `R:a.multiplo.d90`. Una jugada sin número se pinta con su
 * motivo («por probar: falta…»), nunca como cero.
 */
export function refsDeProyeccion(pc: ProyeccionCamino, calculos: Pick<Calculos, "moneda" | "zona">): Map<string, RefValor> {
  const cfg = configDeCalculos(calculos);
  const refs = new Map<string, RefValor>();
  const p = `R:${pc.prefijo}`;
  const poner = (id: string, nombre: string, calculo: Calculo<Rango>, clase: ClaseRef, unidad: RefValor["unidad"] = "soles") =>
    refs.set(id, {
      valor: calculo.valor,
      unidad,
      // Una proyección nunca es un hecho exacto: se escribe redondeada (sin «S/ 9,179» ni «×1.66»).
      texto: textoDeValor(calculo.valor, unidad, cfg, { redondear: true }),
      clase: calculo.valor ? clase : "sin_dato",
      formula: calculo.formula,
      nombre,
      ...(calculo.valor ? {} : { motivo_nulo: calculo.motivo_nulo ?? "sin dato" }),
    });
  for (const j of pc.jugadas) {
    const pj = j.proyeccion;
    if (pj.estado === "habilitador") {
      refs.set(`${p}.${j.id}.mes`, { valor: null, unidad: "texto", texto: `no mueve dinero por sí misma: abre ${pj.abre}`, clase: "hecho", formula: "jugada que abre otra", nombre: `Jugada ${j.id}` });
      continue;
    }
    if (pj.estado === "mueve_horas") {
      refs.set(`${p}.${j.id}.mes`, { valor: pj.horas_mes, unidad: "horas_mes", texto: textoDeValor(pj.horas_mes, "horas_mes", cfg), clase: pj.clase, formula: "horas del dueño que se liberan al mes", nombre: `Jugada ${j.id}` });
      continue;
    }
    poner(`${p}.${j.id}.mes`, `Lo que deja la jugada ${j.id} al mes`, pj.utilidad_mes, pj.clase);
    poner(`${p}.${j.id}.caja`, `La caja que libera la jugada ${j.id}`, pj.caja_una_vez, pj.clase);
    for (const h of CLAVES_HORIZONTE) {
      const x = j.por_horizonte[h];
      const motivo = pj.utilidad_mes.motivo_nulo ?? "sin dato";
      const calc = (v: Rango | null, formula: string): Calculo<Rango> => (v ? { valor: v, formula, periodo: h, fuentes: [], supuestos: [], limitaciones: [] } : { valor: null, formula, periodo: h, fuentes: [], supuestos: [], limitaciones: [], motivo_nulo: motivo });
      poner(`${p}.${j.id}.${h}`, `Lo que deja la jugada ${j.id} al mes, al día ${h.slice(1)}`, calc(x.ritmo, "ritmo al mes desde que empieza a dar"), pj.clase);
      poner(`${p}.${j.id}.acum.${h}`, `Lo que lleva dado la jugada ${j.id} al día ${h.slice(1)}`, calc(x.acumulado, "utilidad al mes × días desde que empezó ÷ 30"), pj.clase);
    }
  }
  for (const h of CLAVES_HORIZONTE) {
    poner(`${p}.total.${h}`, `Lo que deja de más el camino al mes, al día ${h.slice(1)}`, pc.total[h].ritmo, pc.clase);
    poner(`${p}.total.acum.${h}`, `Lo que lleva dado el camino al día ${h.slice(1)}`, pc.total[h].acumulado, pc.clase);
    poner(`${p}.caja.${h}`, `La caja que liberó el camino al día ${h.slice(1)}`, pc.total[h].caja, pc.clase);
    poner(`${p}.utilidad.${h}`, `La utilidad al mes con el camino, al día ${h.slice(1)}`, pc.utilidad[h], pc.clase);
    poner(`${p}.multiplo.${h}`, `Cuántas veces la utilidad de hoy, al día ${h.slice(1)}`, pc.multiplo[h], pc.clase, "veces");
  }
  return refs;
}
