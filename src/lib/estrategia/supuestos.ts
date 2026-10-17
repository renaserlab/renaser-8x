/**
 * EL CATÁLOGO DE LO QUE SE PUEDE SUPONER Y DE LO QUE SE PREGUNTA (spec-estrategia-8x.md §7.1).
 *
 * Dos clases que no se mezclan:
 *  - `estado_actual`: cuánto es algo HOY (interesados al mes, ticket, clientes que vuelven…). La IA nunca le pone
 *    número: lo anota en `faltan` y sale como pregunta para el dueño o como sección que se le abre. Es la regla 1 de
 *    honestidad de la ruta v1.2 (§3.5): una palanca solo suma con un dato propio de la empresa.
 *  - `cambio`: cuánto se mueve algo con una jugada. Es lo único que la IA puede suponer, y siempre dentro de los
 *    límites de aquí. Los límites son lo que es creíble en 90 días PARTIENDO DEL DATO DE HOY, no lo físicamente
 *    posible: nadie pasa de vender a cuatro de cada 10 a vender a diez, ni cierra toda una fuga, ni duplica el volumen
 *    en un trimestre. Con límites físicos, el modelo podía «duplicar la utilidad» con solo poner sus supuestos en el
 *    tope. La apuesta la elige la IA dentro de ellos y se rotula «por confirmar»; si su alto toca el tope, el validador
 *    lo avisa. Un cambio no se le pregunta al dueño: se comprueba haciendo la jugada y mirando su señal.
 *
 * LAS PREGUNTAS LAS ESCRIBE UNA PERSONA y no las reescribe la IA: así la calidad de lo que se pregunta no depende de una
 * corrida. Siguen la regla de las preguntas orales (memoria `principio-preguntas-orales` y tests/preguntas-sin-eco):
 * una cosa por pregunta, el episodio antes que el promedio («el mes pasado», «la última vez», «la semana pasada»),
 * anclas «de cada 10», ninguna cifra de ejemplo, «dinero» y no «plata». Lo que se pide por SECCIÓN (los nueve números
 * en «Tus números», la tabla de productos, los gastos, el crédito, el inventario) no trae pregunta aquí: se pregunta en
 * su pantalla de siempre, con la pregunta que ya vive allí (VITALES en metricas.ts, MODELO en negocio.ts). Aquí solo
 * vive lo que falta y la línea que se agrega a la nota de esa sección, dicha al dueño.
 *
 * Puro: sin base, sin red.
 */
import { VITALES, RECONOCIDAS } from "../metricas";
import { MODELO, type ModeloNegocio } from "../negocio";
import type { Seccion } from "../secciones";
import type { Rango } from "../dato-oral";
import type { Unidad } from "./paquete";

export type TipoSupuesto = "estado_actual" | "cambio";

/** Lo que hace falta para calcular un límite que depende de la empresa: el valor de hoy de un id del paquete o de los cálculos. */
export type ContextoLimites = { valor: (id: string) => Rango | null };

export type DefSupuesto = {
  clave: string;
  tipo: TipoSupuesto;
  unidad: Unidad;
  /** Qué es, como sustantivo y sin ids («los interesados al mes»): para decir de dónde sale una cifra. */
  nombre: string;
  /** Para la consultora y para la nota de la sección: qué falta, en una frase sin cifras. */
  que_falta: string;
  /** Lo mismo dicho al dueño, para la línea que se agrega a la nota de su sección («Para la estrategia: …»). */
  para_dueno?: string;
  /** Por qué importa para la estrategia, dicho a la consultora. */
  por_que_importa: string;
  /** Solo `estado_actual`: adónde va lo que falta. Una sección del portal o una pregunta suelta. */
  destino?: Seccion | "pregunta";
  /** Solo destino "pregunta": la pregunta oral, escrita por una persona. Las de una sección se hacen en su pantalla. */
  pregunta?: string | ((modelo: ModeloNegocio | null) => string);
  /** Solo `cambio`: entre qué valores puede moverse. Una función cuando el límite sale del dato de hoy. */
  limites?: readonly [number, number] | ((c: ContextoLimites) => readonly [number, number] | null);
  /** Solo `cambio`: el supuesto tiene que decir de qué dato de hoy parte (su `ancla`). */
  pide_ancla?: true;
  /** Solo `cambio`: el id del dato de hoy del que parte, cuando la clave lo pide. */
  ancla?: string;
  /** Solo `cambio`: hacia dónde está la ganancia. «abajo» cuando lo que se gana es que algo baje (un costo, un gasto). */
  gana_hacia?: "arriba" | "abajo";
};

/**
 * LO CREÍBLE EN 90 DÍAS (revisión del 17-10). Con límites físicos —convertir diez de cada 10, cerrar toda la fuga, vender
 * el doble— el modelo podía «duplicar la utilidad» con solo poner sus supuestos en el tope, y el dueño leía «S/ X más al
 * mes» armado con eso. Estos topes salen del dato de hoy: lo que una jugada bien hecha mueve en un trimestre.
 */
export const LIMITE_90_DIAS = {
  /** Cuántos más de cada 10 pueden comprar o volver, sobre los de hoy. */
  mas_de_cada_10: 3,
  /** Cuánto más volumen, en porcentaje. */
  volumen_pct: 50,
  /** Cuánto de una fuga, o de la mercadería parada, se cierra o se libera, de cada 10. */
  cierre_de_cada_10: 7,
} as const;

const unidadVital = (u: string): Unidad => (u === "soles" || u === "dias" || u === "personas" || u === "de_cada_10" ? u : "texto");

/** Los nueve números y el costo variable del mes, dichos a la consultora (su nombre para el dueño vive en VITALES). */
const FALTA_NUMERO: Record<string, string> = {
  venta_mes: "la venta del mes",
  ganancia_mes: "lo que le quedó libre en el mes",
  caja_hoy: "el dinero en caja hoy",
  gasto_fijo_mes: "los gastos fijos del mes",
  precio_producto_estrella: "el precio de lo que más vende",
  costo_producto_estrella: "el costo de lo que más vende",
  conversion_de_cada_10: "de cada 10 interesados, cuántos compran",
  deuda_clientes: "lo que le deben sus clientes",
  deuda_propia: "lo que debe la empresa",
  costo_variable_mes: "el costo variable del mes",
};

/** Cómo se le nombra un número al dueño cuando el nombre de «Tus números» trae una palabra que él no ve (spec-entrar-hoy.md §0.9). */
const PARA_DUENO_NUMERO: Record<string, string> = {
  costo_variable_mes: "lo que te costó la mercadería o los insumos de lo que vendiste el mes pasado",
};

const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * Los nueve números y el costo variable del mes. Se preguntan en «Tus números» (sección datos_faltantes) con la
 * pregunta de VITALES: aquí no se copia ninguna pregunta, solo lo que falta y su nombre para el dueño.
 */
function deLosNumeros(): Record<string, DefSupuesto> {
  const salida: Record<string, DefSupuesto> = {};
  for (const v of [...VITALES, ...RECONOCIDAS]) {
    salida[v.clave] = {
      clave: v.clave,
      tipo: "estado_actual",
      unidad: unidadVital(v.unidad),
      nombre: FALTA_NUMERO[v.clave] ?? minuscula(v.nombre),
      que_falta: FALTA_NUMERO[v.clave] ?? minuscula(v.nombre),
      para_dueno: PARA_DUENO_NUMERO[v.clave] ?? minuscula(v.nombre),
      por_que_importa: "es uno de los números con que 8X hace las cuentas de la estrategia",
      destino: "datos_faltantes",
    };
  }
  return salida;
}

// «¿Cuántas unidades más…?» suena raro dicho al dueño: donde el modelo cuenta «unidades», se pregunta por pedidos.
const unidadesDe = (modelo: ModeloNegocio | null) => (!modelo ? "clientes" : MODELO[modelo].unidad.plural === "unidades" ? "pedidos" : MODELO[modelo].unidad.plural);
/** «cuántas unidades», «cuántas operaciones», «cuántos casos»: el interrogativo concuerda con la unidad del modelo. */
const cuantosDe = (plural: string) => (/(?:dades|ciones|as)$/.test(plural) ? "cuántas" : "cuántos");

export const CLAVES_SUPUESTO: Record<string, DefSupuesto> = {
  ...deLosNumeros(),

  // ── Lo que vende: se pregunta en la tabla de productos, con las palabras de su modelo de negocio (negocio.ts).
  "linea.precio": {
    clave: "linea.precio", tipo: "estado_actual", unidad: "soles", destino: "productos",
    nombre: "el precio de lo que vende",
    que_falta: "el precio de lo que vende", para_dueno: "el precio de lo que vendes",
    por_que_importa: "sin el precio no se sabe cuánto deja cada venta",
  },
  "linea.costo": {
    clave: "linea.costo", tipo: "estado_actual", unidad: "soles", destino: "productos",
    nombre: "el costo de lo que vende",
    que_falta: "lo que le cuesta cada cosa que vende", para_dueno: "lo que te cuesta cada cosa que vendes",
    por_que_importa: "sin el costo no hay margen ni punto de equilibrio",
  },
  "linea.unidades_mes": {
    clave: "linea.unidades_mes", tipo: "estado_actual", unidad: "unidades_mes", destino: "productos",
    nombre: "lo que vende al mes",
    que_falta: "cuánto vende al mes de cada cosa", para_dueno: "cuánto vendiste el mes pasado de cada cosa",
    por_que_importa: "sin el volumen no se sabe qué deja más al mes",
  },

  // ── Secciones del portal: se preguntan en su pantalla; aquí, la línea que se agrega a su nota.
  gastos_mes: {
    clave: "gastos_mes", tipo: "estado_actual", unidad: "soles", destino: "costos",
    nombre: "los gastos del mes",
    que_falta: "los gastos del mes, uno por uno", para_dueno: "tus gastos del mes, uno por uno",
    por_que_importa: "sin los gastos no hay utilidad que multiplicar",
  },
  "credito.de_cada_10": {
    clave: "credito.de_cada_10", tipo: "estado_actual", unidad: "de_cada_10", destino: "credito",
    nombre: "las ventas al crédito de cada 10",
    que_falta: "de cada 10 ventas, cuántas son al crédito o fiadas", para_dueno: "de cada 10 ventas, cuántas son al crédito o fiadas",
    por_que_importa: "dice cuánto dinero se queda en la calle",
  },
  "credito.dias": {
    clave: "credito.dias", tipo: "estado_actual", unidad: "dias", destino: "credito",
    nombre: "los días que tardan en pagarle al crédito",
    que_falta: "los días que tardan en pagarle los clientes al crédito", para_dueno: "los días que tardan en pagarte los clientes al crédito",
    por_que_importa: "con eso se calcula cuánta caja se libera cobrando antes",
  },
  "credito.incobrables_de_cada_10": {
    clave: "credito.incobrables_de_cada_10", tipo: "estado_actual", unidad: "de_cada_10", destino: "credito",
    nombre: "los que nunca pagan de cada 10",
    que_falta: "de cada 10 que le deben, cuántos nunca pagan", para_dueno: "de cada 10 que te deben, cuántos nunca pagan",
    por_que_importa: "es la fuga de caja del crédito",
  },
  "inventario.valor": {
    clave: "inventario.valor", tipo: "estado_actual", unidad: "soles", destino: "inventario",
    nombre: "el dinero en mercadería guardada",
    que_falta: "cuánto dinero tiene en mercadería guardada", para_dueno: "cuánto dinero tienes en mercadería guardada",
    por_que_importa: "con eso se calculan los días de inventario",
  },
  "inventario.meses": {
    clave: "inventario.meses", tipo: "estado_actual", unidad: "meses", destino: "inventario",
    nombre: "los meses que alcanza lo guardado",
    que_falta: "para cuántos meses de venta le alcanza lo guardado", para_dueno: "para cuántos meses de venta te alcanza lo guardado",
    por_que_importa: "con eso se calculan los días de inventario",
  },
  "inventario.parado": {
    clave: "inventario.parado", tipo: "estado_actual", unidad: "soles", destino: "inventario",
    nombre: "la mercadería que no se mueve",
    que_falta: "cuánto dinero hay en mercadería que no se mueve", para_dueno: "cuánto dinero tienes en mercadería que no se mueve",
    por_que_importa: "es dinero parado que se puede liberar",
  },

  // ── Preguntas sueltas para el dueño. Una cosa por pregunta, con su episodio, sin cifra de ejemplo.
  interesados_mes: {
    clave: "interesados_mes", tipo: "estado_actual", unidad: "unidades_mes", destino: "pregunta",
    nombre: "los interesados al mes",
    que_falta: "cuántas personas preguntan precio o piden información al mes", por_que_importa: "sin los interesados no se puede contar cuánto deja vender a uno más de cada 10",
    pregunta: "El mes pasado, ¿cuántas personas te preguntaron precio o te pidieron información?",
  },
  clientes_activos_mes: {
    clave: "clientes_activos_mes", tipo: "estado_actual", unidad: "personas", destino: "pregunta",
    nombre: "los clientes del mes",
    que_falta: "a cuántos clientes distintos les vendió el mes pasado", por_que_importa: "es la base de toda jugada de recompra",
    pregunta: "El mes pasado, ¿a cuántos clientes distintos les vendiste?",
  },
  clientes_que_vuelven_de_cada_10: {
    clave: "clientes_que_vuelven_de_cada_10", tipo: "estado_actual", unidad: "de_cada_10", destino: "pregunta",
    nombre: "de cada 10 clientes, los que vuelven",
    que_falta: "de cada 10 clientes, cuántos vuelven a comprar", por_que_importa: "es el punto de partida de toda jugada de recompra",
    pregunta: "De cada 10 clientes que te compran, ¿cuántos vuelven a comprarte?",
  },
  clientes_dormidos: {
    clave: "clientes_dormidos", tipo: "estado_actual", unidad: "personas", destino: "pregunta",
    nombre: "los clientes que no volvieron este año",
    que_falta: "cuántos clientes compraron alguna vez y este año no volvieron", por_que_importa: "son clientes que ya confiaron y se pueden recuperar",
    // Desde un episodio (el año pasado), no desde «alguna vez» (revisión del 17-10).
    pregunta: "Piensa en los clientes que te compraron el año pasado, ¿cuántos no han vuelto a comprarte este año?",
  },
  ticket_promedio: {
    clave: "ticket_promedio", tipo: "estado_actual", unidad: "soles", destino: "pregunta",
    nombre: "lo que gasta un cliente en una compra",
    que_falta: "cuánto gasta un cliente en una compra", por_que_importa: "sin el ticket no se puede contar cuánto deja un cliente más",
    pregunta: "La última vez que un cliente te compró, ¿cuánto gastó en esa compra?",
  },
  dias_pago_proveedor: {
    clave: "dias_pago_proveedor", tipo: "estado_actual", unidad: "dias", destino: "pregunta",
    nombre: "los días en que paga a su proveedor",
    que_falta: "a cuántos días le paga a su proveedor principal", por_que_importa: "sin eso no se sabe cuánta caja da pagar unos días después",
    pregunta: "La última vez que le compraste a tu proveedor principal, ¿cuántos días después le pagaste?",
  },
  horas_dueno_semana: {
    clave: "horas_dueno_semana", tipo: "estado_actual", unidad: "horas_semana", destino: "pregunta",
    nombre: "las horas del dueño en el negocio",
    que_falta: "cuántas horas trabaja el dueño en el negocio a la semana", por_que_importa: "dice cuánto del negocio pasa por él",
    pregunta: "La semana pasada, ¿cuántas horas trabajaste en el negocio?",
  },
  horas_dueno_operacion_semana: {
    clave: "horas_dueno_operacion_semana", tipo: "estado_actual", unidad: "horas_semana", destino: "pregunta",
    nombre: "las horas del dueño en tareas que otro haría",
    que_falta: "cuántas horas se le van al dueño en tareas que otra persona podría hacer", por_que_importa: "es la bolsa de horas: el tiempo del dueño que se puede liberar",
    // Sin «de esas horas»: cada pregunta va en su tarjeta y puede llegar sola.
    pregunta: "La semana pasada, ¿cuántas horas se te fueron en tareas que otra persona del negocio podría hacer?",
  },
  capacidad_extra_mes: {
    clave: "capacidad_extra_mes", tipo: "estado_actual", unidad: "unidades_mes", destino: "pregunta",
    nombre: "lo que podría atender de más sin contratar",
    que_falta: "cuánto más podría atender sin contratar a nadie", por_que_importa: "dice si vender más choca con lo que hoy se puede atender",
    pregunta: (m) => `El mes pasado, sin contratar a nadie, ¿${cuantosDe(unidadesDe(m))} ${unidadesDe(m)} más habrías podido atender?`,
  },
  inversion_disponible_mes: {
    clave: "inversion_disponible_mes", tipo: "estado_actual", unidad: "soles", destino: "pregunta",
    nombre: "el dinero que podría poner al mes para crecer",
    que_falta: "cuánto dinero podría poner al mes para crecer sin pasar apuros", por_que_importa: "un camino que pide más dinero del que hay no se puede caminar",
    pregunta: "El mes pasado, ¿cuánto dinero te quedó que podrías haber puesto en hacer crecer el negocio sin pasar apuros?",
  },
  merma_mes: {
    clave: "merma_mes", tipo: "estado_actual", unidad: "soles", destino: "pregunta",
    nombre: "la merma del mes",
    que_falta: "cuánto se perdió el mes pasado en mercadería dañada o vencida", por_que_importa: "es una fuga de caja que solo el dueño puede contar",
    pregunta: "El mes pasado, ¿cuánto se perdió en mercadería dañada o vencida?",
  },
  descuentos_mes: {
    clave: "descuentos_mes", tipo: "estado_actual", unidad: "soles", destino: "pregunta",
    nombre: "los descuentos sin autorización del mes",
    que_falta: "cuánto se dio el mes pasado en descuentos que el dueño no autorizó", por_que_importa: "es una fuga de caja que solo el dueño puede contar",
    pregunta: "El mes pasado, ¿cuánto se dio en descuentos que tú no autorizaste?",
  },
  otra: {
    clave: "otra", tipo: "estado_actual", unidad: "texto", destino: "pregunta",
    nombre: "lo que pidió la estrategia",
    que_falta: "algo que el catálogo no nombra", por_que_importa: "lo pidió la estrategia con su propia pregunta, revisada antes de enviarse",
  },

  // ── Cuánto se mueve algo con una jugada. Lo único que la IA supone; los límites son físicos.
  "precio.pct": {
    clave: "precio.pct", tipo: "cambio", unidad: "pct", limites: [-30, 30],
    nombre: "cuánto cambia el precio",
    que_falta: "cuánto cambia el precio", por_que_importa: "es la palanca que más mueve la utilidad si se vende lo mismo",
  },
  "costo_parte.pct": {
    clave: "costo_parte.pct", tipo: "cambio", unidad: "pct", limites: [-50, 0], gana_hacia: "abajo",
    nombre: "cuánto baja una parte del costo",
    que_falta: "cuánto baja una parte del costo", por_que_importa: "cada parte que baja deja más por unidad",
  },
  "volumen.pct": {
    clave: "volumen.pct", tipo: "cambio", unidad: "pct", limites: [0, LIMITE_90_DIAS.volumen_pct],
    nombre: "cuánto más se vende",
    que_falta: "cuánto más se vende", por_que_importa: "vender más solo suma si lo que se vende deja",
  },
  "gasto_fijo.pct": {
    clave: "gasto_fijo.pct", tipo: "cambio", unidad: "pct", limites: [-50, 20], gana_hacia: "abajo",
    nombre: "cuánto cambian los gastos",
    que_falta: "cuánto cambian los gastos del mes", por_que_importa: "cada gasto que baja es utilidad",
  },
  "conversion.de_cada_10_nuevo": {
    clave: "conversion.de_cada_10_nuevo", tipo: "cambio", unidad: "de_cada_10", pide_ancla: true, ancla: "N:conversion_de_cada_10",
    nombre: "cuántos de cada 10 interesados comprarían",
    que_falta: "de cada 10 interesados, cuántos comprarían con la jugada", por_que_importa: "es la conversión a la que apunta la jugada",
    limites: (c) => {
      const hoy = c.valor("N:conversion_de_cada_10");
      return hoy ? [hoy.bajo, Math.min(10, hoy.alto + LIMITE_90_DIAS.mas_de_cada_10)] : null;
    },
  },
  "recompra.de_cada_10_nuevo": {
    clave: "recompra.de_cada_10_nuevo", tipo: "cambio", unidad: "de_cada_10", pide_ancla: true, ancla: "Q:clientes_que_vuelven_de_cada_10",
    nombre: "cuántos de cada 10 clientes volverían",
    que_falta: "de cada 10 clientes, cuántos volverían con la jugada", por_que_importa: "es la recompra a la que apunta la jugada",
    limites: (c) => {
      const hoy = c.valor("Q:clientes_que_vuelven_de_cada_10");
      return hoy ? [hoy.bajo, Math.min(10, hoy.alto + LIMITE_90_DIAS.mas_de_cada_10)] : null;
    },
  },
  "cierre_fuga.de_cada_10": {
    clave: "cierre_fuga.de_cada_10", tipo: "cambio", unidad: "de_cada_10", limites: [0, LIMITE_90_DIAS.cierre_de_cada_10],
    nombre: "cuánto de la fuga se cierra",
    que_falta: "de cada 10 de la fuga, cuánto se cierra", por_que_importa: "dice cuánto de la fuga vuelve a la caja",
  },
  "dias_cobro.menos_dias": {
    clave: "dias_cobro.menos_dias", tipo: "cambio", unidad: "dias",
    nombre: "cuántos días antes se cobra",
    que_falta: "cuántos días antes se cobra", por_que_importa: "cada día que se cobra antes es caja que se libera una vez",
    limites: (c) => {
      const hoy = c.valor("C:poder.dias_cobro_hoy");
      return hoy ? [0, hoy.alto] : null;
    },
  },
  "inventario.de_cada_10": {
    clave: "inventario.de_cada_10", tipo: "cambio", unidad: "de_cada_10", limites: [0, LIMITE_90_DIAS.cierre_de_cada_10],
    nombre: "cuánto de la mercadería parada se libera",
    que_falta: "de cada 10 de la mercadería parada, cuánto se libera", por_que_importa: "es dinero parado que vuelve a la caja una vez",
  },
};

/** Qué clave de cambio corresponde a cada tipo de efecto de una jugada (§4.4). El habilitador no mueve nada. */
export const CLAVE_DE_EFECTO = {
  precio_linea: "precio.pct",
  precio_general: "precio.pct",
  costo_parte: "costo_parte.pct",
  volumen_linea: "volumen.pct",
  gasto_fijo: "gasto_fijo.pct",
  conversion: "conversion.de_cada_10_nuevo",
  recompra: "recompra.de_cada_10_nuevo",
  cierre_fuga: "cierre_fuga.de_cada_10",
  dias_cobro: "dias_cobro.menos_dias",
  inventario_liberado: "inventario.de_cada_10",
  habilitador: null,
} as const;

export const esClaveDeCambio = (clave: string): boolean => CLAVES_SUPUESTO[clave]?.tipo === "cambio";
export const esClaveDeEstadoActual = (clave: string): boolean => CLAVES_SUPUESTO[clave]?.tipo === "estado_actual";

/**
 * Los límites de una clave para ESTA empresa. Una clave de estado actual no acepta rango de la IA (`no_es_cambio`);
 * una clave que no existe tampoco. Un límite que sale del dato de hoy y ese dato falta no se inventa: `sin_ancla`.
 */
export function limitesDe(
  clave: string,
  c: ContextoLimites
): { ok: true; limites: readonly [number, number] } | { ok: false; motivo: "desconocida" | "no_es_cambio" | "sin_ancla"; texto: string } {
  const def = CLAVES_SUPUESTO[clave];
  if (!def) return { ok: false, motivo: "desconocida", texto: `la clave «${clave}» no está en el catálogo` };
  if (def.tipo !== "cambio" || !def.limites) return { ok: false, motivo: "no_es_cambio", texto: `«${def.que_falta}» es cuánto es algo hoy: no se supone, se pregunta` };
  const l = typeof def.limites === "function" ? def.limites(c) : def.limites;
  if (!l) return { ok: false, motivo: "sin_ancla", texto: `sin el dato de hoy no hay desde dónde medir «${def.que_falta}»` };
  return { ok: true, limites: l };
}

/** La pregunta oral de una clave de estado actual, con la unidad del modelo de negocio. null si se pregunta en una sección. */
export function preguntaDe(clave: string, modelo: ModeloNegocio | null = null): string | null {
  const def = CLAVES_SUPUESTO[clave];
  if (!def || def.tipo !== "estado_actual" || !def.pregunta) return null;
  return typeof def.pregunta === "function" ? def.pregunta(modelo) : def.pregunta;
}
