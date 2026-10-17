/**
 * LAS CUENTAS LAS HACE EL CÓDIGO, NO LA IA (spec-estrategia-8x.md §4).
 *
 * `calcularTodo` reúne, con los datos de la empresa y sin llamar a ningún modelo, todo lo que la estrategia necesita
 * saber en números: lo que deja cada producto y su cuadrante (rentabilidad.ts, tal cual), el 90/10, el punto de
 * equilibrio, el margen y los días de aguante (metricas.ts), las palancas sugeridas, el poder del uno, las fugas en tres
 * bolsas, la cuenta de duplicar y triplicar, «si seguimos igual» y la dependencia del dueño (descrita, nunca
 * puntuada). Cada cifra es un `Calculo` con fórmula, fuentes, supuestos y limitaciones; lo que no se puede calcular sale
 * nulo con su motivo y se pinta rayado, nunca cero.
 *
 * `refsDeCalculos` convierte todo eso en ids `C:…` con lo que valen, ya formateados con la moneda de la empresa: es lo
 * que el modelo cita (`{{C:poder.precio}}`), lo que el validador comprueba y lo que la pantalla pinta.
 *
 * Los cálculos se congelan junto con el paquete en cada versión de la estrategia: las dos lentes ven exactamente lo
 * mismo, y las proyecciones (proyeccion.ts) se rehacen sobre lo congelado. Todo es JSON (sin Map ni funciones).
 *
 * Puro: sin base, sin red, sin IA.
 */
import { escalarRango, type Rango } from "../dato-oral";
import type { Calculo } from "../finanzas";
import { derivados } from "../metricas";
import { tableroRentabilidad, palanca, CUADRANTE_TEXTO, type Cuadrante, type PedidoPalanca, type TableroRentabilidad } from "../rentabilidad";
import type { ConteoProcesos } from "../ficha-direccion";
import { porDefecto, type ConfigEmpresa } from "../formato";
import { configDeEmpresa, hoyEnZona, idsCortos, metricasQueEntran, type EntradasPaquete, type RefValor, type Unidad } from "./paquete";
import { cuenta, claseRefDeEstado, exacto, insumoDeVital, peorClase, refDeCuenta, refDeInsumo, type Cuenta, type Insumo } from "./cuentas";
import { insumosDelPoder, poderDelUno, type PoderDelUno } from "./poder-del-uno";
import { mapaDeFugas, type MapaDeFugas } from "./fugas";
import { COMO } from "./textos";
import { cuentaDelMultiplicador, razonDeMargen, type CuentaMultiplicador } from "./multiplicador";

export type { RefValor } from "./paquete";

export type Calculos = {
  version: 1;
  moneda: string;
  zona: string;
  hoy: string;
  tablero: TableroRentabilidad;
  /** Cada línea por su id corto: `L:<8>` → su id y su nombre. Lo usan las proyecciones para encontrar la línea. */
  lineas: { corto: string; id: string; nombre: string }[];
  insumos: { venta: Insumo; costo_directo: Insumo; gastos: Insumo; ganancia: Insumo; mc: Insumo };
  productos: Cuenta[];
  cuadrantes: { id: string; nombre: string; cuadrante: Cuadrante | null }[];
  noventa_diez: { id: "C:noventa_diez"; texto: string | null; calculo: TableroRentabilidad["noventaDiez"] };
  equilibrio: { unidades: Cuenta; soles: Cuenta };
  margen: Cuenta;
  dias_aguante: Cuenta;
  palancas: Cuenta[];
  poder: PoderDelUno;
  fugas: MapaDeFugas;
  multiplicador: CuentaMultiplicador;
  /** Se describe, no se puntúa: «participa en N de M procesos; en K decide solo». */
  dependencia: { id: "C:dependencia.procesos"; conteo: ConteoProcesos | null; motivo: string | null };
};

const NOMBRE_PEDIDO = (p: PedidoPalanca, nombre: string) =>
  p.tipo === "precio" ? `«${nombre}»: precio +${p.pct} %` : p.tipo === "parte" ? `«${nombre}»: «${p.parte}» ${p.pct} % más barato` : `«${nombre}»: vender ${p.pct} % más`;
const SUFIJO_PEDIDO = (p: PedidoPalanca) => (p.tipo === "precio" ? `precio${p.pct}` : p.tipo === "parte" ? `parte${p.pct}` : `volumen${p.pct}`);

/** Un Calculo<number> de metricas.ts como cuenta de la estrategia (rango exacto). */
function deNumero(id: string, nombre: string, unidad: Unidad, c: Calculo<number>, insumos: Insumo[], escala = 1): Cuenta {
  const valor = c.valor == null ? null : exacto(c.valor * escala);
  return {
    id,
    nombre,
    unidad,
    clase: valor ? peorClase(insumos.map((i) => i.clase)) : "sin_dato",
    calculo: { ...c, valor },
    origen: insumos.map((i) => ({ nombre: i.nombre, clase: i.clase })),
  };
}

export function calcularTodo(e: EntradasPaquete, hoy: Date): Calculos {
  const cfg = configDeEmpresa(e.empresa);
  const metricas = metricasQueEntran(e.metricas);
  const t = tableroRentabilidad({ lineas: e.lineas, costos: e.costos, ficha: e.ficha_negocio, operaciones: e.operaciones, metricas, config: cfg });
  const cortos = idsCortos(e.lineas.map((l) => l.id));
  const L = (id: string) => cortos.get(id) ?? id.slice(0, 8);

  // ── Insumos comunes.
  const ip = insumosDelPoder(e, t);
  const venta = ip.venta;
  const ganancia = insumoDeVital(e.metricas, "ganancia_mes", "lo que el dueño dijo que le queda libre", "soles");
  const mc = razonDeMargen(t, venta, ip.costo_directo);

  // ── Por producto: margen, margen en %, lo que deja al mes y su cuadrante.
  const productos: Cuenta[] = [];
  const cuadrantes: Calculos["cuadrantes"] = [];
  for (const p of t.productos) {
    const l = L(p.id);
    const clasePrecio = claseRefDeEstado(p.estados.precio);
    const claseCosto = claseRefDeEstado(p.estados.costo);
    const claseUnidades = claseRefDeEstado(p.estados.unidades);
    const insumo = (nombre: string, valor: Rango | null, clase: ReturnType<typeof claseRefDeEstado>, unidad: Unidad): Insumo => ({ id: `L:${l}`, nombre, valor, unidad, clase: valor ? clase : "sin_dato", fuente: "la tabla de productos" });
    const precio = insumo(`el precio de «${p.nombre}»`, p.precio_efectivo, clasePrecio, "soles");
    const costo = insumo(`el costo de «${p.nombre}»`, p.costo, claseCosto, "soles");
    const unidades = insumo(`lo que se vende al mes de «${p.nombre}»`, p.unidades_mes, claseUnidades, "unidades_mes");
    const motivo = p.motivos.join("; ") || "faltan datos";
    productos.push(cuenta(`C:producto.${l}.margen`, `Lo que deja cada unidad de «${p.nombre}»`, "soles", [precio, costo], { formula: "precio − costo de una unidad", periodo: "hoy" }, p.margen_unitario, motivo));
    productos.push(cuenta(`C:producto.${l}.margen_pct`, `Lo que deja «${p.nombre}» de cada 100 que cobra`, "pct", [precio, costo], { formula: "(precio − costo) ÷ precio × 100", periodo: "hoy" }, p.margen_pct ? escalarRango(p.margen_pct, 100) : null, motivo));
    productos.push(cuenta(`C:producto.${l}.deja_mes`, `Lo que deja «${p.nombre}» al mes`, "soles", [precio, costo, unidades], { formula: "(precio − costo) × unidades al mes", periodo: "un mes normal" }, p.contribucion_mes, motivo));
    cuadrantes.push({ id: `C:producto.${l}.cuadrante`, nombre: p.nombre, cuadrante: p.cuadrante });
  }

  // ── 90/10.
  const nd = t.noventaDiez;
  const nombreDe = (id: string) => t.productos.find((p) => p.id === id)?.nombre ?? id;
  const noventa_diez: Calculos["noventa_diez"] = {
    id: "C:noventa_diez",
    texto: nd.valor ? `${nd.valor.cuantas} de ${nd.valor.de} líneas dejan el ${Math.round(nd.valor.pct_contribucion * 100)} % de lo que dejan todas: ${nd.valor.lineas.map((id) => `«${nombreDe(id)}»`).join(", ")}` : null,
    calculo: nd,
  };

  // ── Punto de equilibrio: el del tablero (unidades y dinero) o, sin tabla, el de los nueve números (solo dinero).
  const claseTabla = peorClase([...t.productos.filter((p) => p.contribucion_mes).flatMap((p) => [claseRefDeEstado(p.estados.precio), claseRefDeEstado(p.estados.costo), claseRefDeEstado(p.estados.unidades)]), ip.gastos.clase]);
  const eq = t.equilibrio;
  const d = derivados(metricas);
  const insumoTabla: Insumo = { id: "C:equilibrio", nombre: "la mezcla de la tabla de productos y los gastos del mes", valor: null, unidad: "soles", clase: claseTabla, fuente: "la tabla de productos y la de gastos" };
  let equilibrio: Calculos["equilibrio"];
  if (eq.valor) {
    const i = { ...insumoTabla, valor: exacto(eq.valor.soles) };
    equilibrio = {
      unidades: cuenta("C:equilibrio.unidades", "El punto de equilibrio en unidades al mes", "unidades_mes", [i], { formula: eq.formula, periodo: eq.periodo, supuestos: eq.supuestos, limitaciones: eq.limitaciones }, eq.valor.unidades),
      soles: cuenta("C:equilibrio.soles", "El punto de equilibrio en venta al mes", "soles", [i], { formula: eq.formula, periodo: eq.periodo, supuestos: eq.supuestos, limitaciones: eq.limitaciones }, exacto(eq.valor.soles)),
    };
  } else {
    const deNueve = d.detalle.equilibrio;
    const insumosNueve = [venta, insumoDeVital(e.metricas, "costo_variable_mes", "el costo variable del mes", "soles", { ceroEsSinDato: true }), insumoDeVital(e.metricas, "gasto_fijo_mes", "el gasto fijo del mes", "soles", { ceroEsSinDato: true })];
    equilibrio = {
      unidades: cuenta("C:equilibrio.unidades", "El punto de equilibrio en unidades al mes", "unidades_mes", [insumoTabla], { formula: eq.formula, periodo: eq.periodo, supuestos: eq.supuestos, limitaciones: eq.limitaciones }, null, eq.motivo_nulo ?? "sin la tabla de productos no hay equilibrio en unidades"),
      soles: deNumero("C:equilibrio.soles", "El punto de equilibrio en venta al mes", "soles", deNueve.valor != null ? deNueve : { ...deNueve, motivo_nulo: deNueve.motivo_nulo ?? eq.motivo_nulo }, insumosNueve),
    };
  }

  // ── Margen declarado y días de aguante (metricas.ts).
  const margen = deNumero("C:margen", "Lo que le queda libre de cada 100 vendidos, según lo que dijo", "pct", d.detalle.margen, [venta, ganancia]);
  const dias_aguante = deNumero("C:dias_aguante", "Los días que aguanta la caja sin vender", "dias", d.detalle.diasAguante, [insumoDeVital(e.metricas, "caja_hoy", "la caja de hoy", "soles"), insumoDeVital(e.metricas, "gasto_fijo_mes", "el gasto fijo del mes", "soles")]);

  // ── Palancas sugeridas del tablero (precio +5 %, su parte más cara −10 %) y vender 10 % más de las mismas líneas.
  const pedidos: PedidoPalanca[] = [...t.palancasSugeridas];
  for (const id of [...new Set(t.palancasSugeridas.map((p) => p.lineaId))]) pedidos.push({ tipo: "volumen", lineaId: id, pct: 10 });
  const palancas: Cuenta[] = pedidos.map((p) => {
    const prod = t.productos.find((x) => x.id === p.lineaId)!;
    const c = palanca(t, p);
    const insumos: Insumo[] = [{ id: `L:${L(p.lineaId)}`, nombre: `los datos de «${prod.nombre}»`, valor: prod.contribucion_mes, unidad: "soles", clase: peorClase([claseRefDeEstado(prod.estados.precio), claseRefDeEstado(prod.estados.costo), claseRefDeEstado(prod.estados.unidades)]), fuente: "la tabla de productos" }];
    return cuenta(`C:palanca.${L(p.lineaId)}.${SUFIJO_PEDIDO(p)}`, NOMBRE_PEDIDO(p, prod.nombre), "soles", insumos, { formula: c.formula, periodo: c.periodo, supuestos: c.supuestos, limitaciones: c.limitaciones }, c.valor?.delta_mes ?? null, c.motivo_nulo);
  });

  // ── Poder del uno, fugas y multiplicador.
  const poder = poderDelUno(ip);
  const fugas = mapaDeFugas({ e: { ...e, metricas }, t, venta, mc });
  const multiplicador = cuentaDelMultiplicador({ venta, mc, gastos: ip.gastos, ganancia });

  // ── Dependencia del dueño: el conteo de la ficha de dirección, tal cual.
  const conteo = e.ficha_direccion?.dependencia?.procesos ?? null;
  const dependencia: Calculos["dependencia"] = {
    id: "C:dependencia.procesos",
    conteo,
    motivo: conteo ? null : "sin ficha de dirección no se contó en cuántos procesos participa el dueño",
  };

  return {
    version: 1,
    moneda: cfg.moneda,
    zona: cfg.zona_horaria,
    hoy: hoyEnZona(hoy, cfg.zona_horaria),
    tablero: t,
    lineas: e.lineas.map((l) => ({ corto: `L:${L(l.id)}`, id: l.id, nombre: l.nombre })),
    insumos: { venta, costo_directo: ip.costo_directo, gastos: ip.gastos, ganancia, mc },
    productos,
    cuadrantes,
    noventa_diez,
    equilibrio,
    margen,
    dias_aguante,
    palancas,
    poder,
    fugas,
    multiplicador,
    dependencia,
  };
}

/** La configuración de formato con la que se escriben las cifras de unos cálculos ya congelados. */
export const configDeCalculos = (c: Pick<Calculos, "moneda" | "zona">): ConfigEmpresa => ({ ...porDefecto, moneda: c.moneda, zona_horaria: c.zona });

/** Cada id `C:…` con lo que vale, formateado con la moneda de la empresa. */
export function refsDeCalculos(c: Calculos): Map<string, RefValor> {
  const cfg = configDeCalculos(c);
  const refs = new Map<string, RefValor>();
  const poner = (x: Cuenta) => refs.set(x.id, refDeCuenta(x, cfg));
  const texto = (id: string, nombre: string, valor: string | null, motivo: string | null, clase: RefValor["clase"] = "hecho") =>
    refs.set(id, valor ? { valor: null, unidad: "texto", texto: valor, clase, formula: nombre, nombre } : { valor: null, unidad: "texto", texto: "sin dato", clase: "sin_dato", formula: nombre, nombre, motivo_nulo: motivo ?? "faltan datos" });

  c.productos.forEach(poner);
  for (const q of c.cuadrantes) texto(q.id, `Cuadrante de «${q.nombre}»`, q.cuadrante ? `${CUADRANTE_TEXTO[q.cuadrante].nombre}: ${CUADRANTE_TEXTO[q.cuadrante].que_es}` : null, "con menos de tres productos con datos no hay con qué comparar", "estimado");
  texto(c.noventa_diez.id, "Las pocas líneas que dejan casi todo (90/10)", c.noventa_diez.texto, c.noventa_diez.calculo.motivo_nulo ?? null, "estimado");
  poner(c.equilibrio.unidades);
  poner(c.equilibrio.soles);
  poner(c.margen);
  poner(c.dias_aguante);
  c.palancas.forEach(poner);

  for (const p of c.poder.palancas) poner(p);
  poner(c.poder.utilidad_juntas);
  poner(c.poder.caja_juntas);
  for (const i of Object.values(c.poder.insumos)) if (i.id.startsWith("C:")) refs.set(i.id, refDeInsumo(i, cfg));

  for (const f of [...c.fugas.caja.fugas, ...c.fugas.horas.fugas, ...c.fugas.oportunidad.fugas]) poner(f);
  poner(c.fugas.caja.total);
  poner(c.fugas.caja.vitales);
  poner(c.fugas.horas.total);
  poner(c.fugas.oportunidad.total);
  c.fugas.parado.forEach(poner);
  poner(c.fugas.no_actuar.mes);
  poner(c.fugas.no_actuar.oportunidad);

  const m = c.multiplicador;
  refs.set(m.mc.id, refDeInsumo(m.mc, cfg));
  [m.k, m.utilidad_hoy, m.venta_x2, m.venta_x3, m.venta_equilibrio].forEach(poner);
  if (m.ganancia_declarada) poner(m.ganancia_declarada);

  const dep = c.dependencia.conteo?.texto ?? null;
  refs.set(
    c.dependencia.id,
    dep
      ? { valor: null, unidad: "texto", texto: dep, clase: "hecho", formula: COMO.procesos_dibujados, nombre: "Cuánto del trabajo pasa por el dueño" }
      : { valor: null, unidad: "texto", texto: "sin dato", clase: "sin_dato", formula: COMO.procesos_dibujados, nombre: "Cuánto del trabajo pasa por el dueño", motivo_nulo: c.dependencia.motivo ?? "faltan datos" }
  );
  return refs;
}
