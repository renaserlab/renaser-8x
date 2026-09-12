/**
 * LOS EVENTOS DEL DÍA — la pieza que le faltaba a 8X para poder operar una empresa, no solo
 * diagnosticarla.
 *
 * Kelin lo pidió el 12-09-2026 para RENASER OS: «que actúe como un centro que me pueda reportar
 * tardanza, cumplimiento de metas, facturación, cómo están nuestros clientes, cómo organizamos
 * nuestros proyectos, por qué no están saliendo». Y dijo algo que decide el diseño: hoy **no
 * registran nada formalmente, está en la cabeza**. Así que aquí sí hay que ser el lugar donde se
 * anota — no hay sistema con el que integrarse.
 *
 * TRES DECISIONES QUE EVITAN CONSTRUIR UN ERP:
 *
 * 1. UNA sola tabla de eventos, no cinco módulos. El manual de RENASER (§13) manda reutilizar antes
 *    que construir: «Construir un módulo nuevo solo cuando la necesidad lo justifique».
 * 2. Los eventos NO son un universo paralelo: cada tipo declara a qué número de la empresa alimenta.
 *    Una factura anotada sube `venta_mes`, que ya es uno de los nueve vitales y ya tiene línea base,
 *    serie y comparación. Lo que se construye aquí es la CAPTURA; la medición ya existía.
 * 3. Anotar tiene que costar segundos. Cada tipo trae su pregunta hablada y solo los campos que de
 *    verdad necesita. Un formulario de doce casillas no se llena nunca, y un dato que no se anota no
 *    existe — que es exactamente la situación de hoy.
 */
import { VITALES } from "./metricas";

/** La ventana que se mira por defecto. Un solo sitio: la usan la pantalla y la ruta. */
export const DIAS_VENTANA = 30;

export type CampoEvento = "persona" | "monto" | "minutos" | "cliente" | "proyecto" | "puesto" | "nota";

export type DefCampo = { clave: CampoEvento; etiqueta: string; obligatorio: boolean };

export type TipoEvento = {
  clave: string;
  /** Cómo se le nombra a quien anota. Sin jerga. */
  nombre: string;
  /** La pregunta hablada, por si se anota dictando. */
  pregunta: string;
  campos: DefCampo[];
  /**
   * A qué número de la empresa alimenta este evento. Si es una clave de los nueve vitales, el
   * cierre del mes la suma ahí. `null` = no alimenta un número todavía: se cuenta y se reporta.
   */
  alimenta: string | null;
  /** Cómo se acumula en el periodo: sumando montos o contando ocurrencias. */
  acumula: "suma_monto" | "cuenta" | "suma_minutos";
  mejorSi: "sube" | "baja" | "neutro";
  familia: "personas" | "dinero" | "proyectos" | "calidad";
};

export const TIPOS_EVENTO: TipoEvento[] = [
  // PERSONAS — lo que Kelin pidió primero: «que me pueda reportar tardanza».
  {
    clave: "tardanza", nombre: "Alguien llegó tarde", familia: "personas",
    pregunta: "¿Quién llegó tarde y cuántos minutos?",
    campos: [
      { clave: "persona", etiqueta: "Quién", obligatorio: true },
      { clave: "minutos", etiqueta: "Cuántos minutos", obligatorio: true },
      { clave: "nota", etiqueta: "Por qué (si lo dijo)", obligatorio: false },
    ],
    alimenta: null, acumula: "suma_minutos", mejorSi: "baja",
  },
  {
    clave: "ausencia", nombre: "Alguien no vino", familia: "personas",
    pregunta: "¿Quién no vino, y avisó o no?",
    campos: [
      { clave: "persona", etiqueta: "Quién", obligatorio: true },
      { clave: "nota", etiqueta: "Avisó o no, y por qué", obligatorio: false },
    ],
    alimenta: null, acumula: "cuenta", mejorSi: "baja",
  },
  {
    clave: "necesidad_persona", nombre: "Falta alguien para un puesto", familia: "personas",
    pregunta: "¿Qué puesto hace falta, y qué se está quedando sin hacer por eso?",
    campos: [
      { clave: "puesto", etiqueta: "Qué puesto", obligatorio: true },
      { clave: "nota", etiqueta: "Qué se queda sin hacer", obligatorio: true },
    ],
    alimenta: null, acumula: "cuenta", mejorSi: "baja",
  },

  // DINERO — alimenta los vitales que ya existen, no números nuevos.
  {
    clave: "factura_emitida", nombre: "Se facturó a un cliente", familia: "dinero",
    pregunta: "¿A quién le facturaste y cuánto?",
    campos: [
      { clave: "monto", etiqueta: "Cuánto (S/)", obligatorio: true },
      { clave: "cliente", etiqueta: "A quién", obligatorio: true },
      { clave: "nota", etiqueta: "Por qué concepto", obligatorio: false },
    ],
    alimenta: "venta_mes", acumula: "suma_monto", mejorSi: "sube",
  },
  {
    clave: "cobro_recibido", nombre: "Entró un cobro", familia: "dinero",
    pregunta: "¿Cuánto entró y de quién?",
    campos: [
      { clave: "monto", etiqueta: "Cuánto (S/)", obligatorio: true },
      { clave: "cliente", etiqueta: "De quién", obligatorio: true },
    ],
    alimenta: null, acumula: "suma_monto", mejorSi: "sube",
  },
  {
    clave: "gasto_pagado", nombre: "Se pagó un gasto", familia: "dinero",
    pregunta: "¿Cuánto se pagó y de qué?",
    campos: [
      { clave: "monto", etiqueta: "Cuánto (S/)", obligatorio: true },
      { clave: "nota", etiqueta: "De qué", obligatorio: true },
    ],
    alimenta: null, acumula: "suma_monto", mejorSi: "baja",
  },

  // PROYECTOS — «cómo organizamos nuestros proyectos, por qué no están saliendo».
  {
    clave: "hito_proyecto", nombre: "Se logró algo en un proyecto", familia: "proyectos",
    pregunta: "¿En qué proyecto, y qué quedó terminado?",
    campos: [
      { clave: "proyecto", etiqueta: "Qué proyecto", obligatorio: true },
      { clave: "nota", etiqueta: "Qué quedó terminado", obligatorio: true },
    ],
    alimenta: null, acumula: "cuenta", mejorSi: "sube",
  },
  {
    clave: "proyecto_trabado", nombre: "Un proyecto se trabó", familia: "proyectos",
    pregunta: "¿Qué proyecto se trabó, y qué lo está trabando?",
    campos: [
      { clave: "proyecto", etiqueta: "Qué proyecto", obligatorio: true },
      { clave: "nota", etiqueta: "Qué lo traba", obligatorio: true },
      { clave: "persona", etiqueta: "De quién depende destrabarlo", obligatorio: false },
    ],
    alimenta: null, acumula: "cuenta", mejorSi: "baja",
  },

  // CALIDAD — lo que se repite es de donde el medidor ya saca indicadores.
  {
    clave: "incidencia", nombre: "Algo salió mal", familia: "calidad",
    pregunta: "¿Qué salió mal, y a quién afectó?",
    campos: [
      { clave: "nota", etiqueta: "Qué pasó", obligatorio: true },
      { clave: "cliente", etiqueta: "A qué cliente afectó", obligatorio: false },
      { clave: "persona", etiqueta: "Quién lo detectó", obligatorio: false },
    ],
    alimenta: null, acumula: "cuenta", mejorSi: "baja",
  },
];

export const TIPO_EVENTO = new Map(TIPOS_EVENTO.map((t) => [t.clave, t]));
export const CLAVES_EVENTO = TIPOS_EVENTO.map((t) => t.clave);
export const esTipoEvento = (c: string) => TIPO_EVENTO.has(c);

export const FAMILIAS: { clave: TipoEvento["familia"]; nombre: string }[] = [
  { clave: "personas", nombre: "El equipo" },
  { clave: "dinero", nombre: "El dinero" },
  { clave: "proyectos", nombre: "Los proyectos" },
  { clave: "calidad", nombre: "Lo que salió mal" },
];

/** Un evento ya guardado. `datos` trae solo los campos que su tipo declara. */
export type Evento = {
  id: string;
  tipo: string;
  fecha: string; // YYYY-MM-DD
  monto: number | null;
  minutos: number | null;
  persona_id: string | null;
  datos: Record<string, string> | null;
};

export type LineaResumen = {
  tipo: string;
  nombre: string;
  familia: TipoEvento["familia"];
  /** Cuántas veces pasó. */
  veces: number;
  /** El acumulado según su forma de acumular: soles, minutos o la misma cuenta. */
  total: number;
  unidad: "soles" | "minutos" | "veces";
  mejorSi: "sube" | "baja" | "neutro";
};

const UNIDAD: Record<TipoEvento["acumula"], LineaResumen["unidad"]> = {
  suma_monto: "soles",
  suma_minutos: "minutos",
  cuenta: "veces",
};

/**
 * El resumen de un periodo. SOLO aparecen los tipos que de verdad ocurrieron: un tablero lleno de
 * ceros hace creer que se midió lo que nadie anotó. Si una semana no se registró ninguna tardanza,
 * eso no significa que nadie llegó tarde — significa que nadie lo anotó, y esas dos cosas no se
 * pueden mostrar igual.
 */
export function resumen(eventos: Evento[]): LineaResumen[] {
  const por = new Map<string, LineaResumen>();
  for (const e of eventos) {
    const def = TIPO_EVENTO.get(e.tipo);
    if (!def) continue; // un tipo desconocido no se cuenta en ninguna parte
    const linea =
      por.get(e.tipo) ??
      { tipo: def.clave, nombre: def.nombre, familia: def.familia, veces: 0, total: 0, unidad: UNIDAD[def.acumula], mejorSi: def.mejorSi };
    linea.veces += 1;
    if (def.acumula === "suma_monto") linea.total += e.monto ?? 0;
    else if (def.acumula === "suma_minutos") linea.total += e.minutos ?? 0;
    else linea.total += 1;
    por.set(e.tipo, linea);
  }
  const orden = FAMILIAS.map((f) => f.clave);
  return [...por.values()].sort((a, b) => orden.indexOf(a.familia) - orden.indexOf(b.familia) || b.veces - a.veces);
}

const CLAVES_VITAL = new Set(VITALES.map((v) => v.clave));

/**
 * Lo que los eventos de un mes aportan a los números vitales de la empresa. Es el puente entre
 * anotar el día y la medición que ya existía: las facturas del mes SON la venta del mes.
 *
 * Devuelve solo lo que se puede sostener con eventos anotados. Nada se completa por estimación.
 */
export function aporteAVitales(eventos: Evento[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const e of eventos) {
    const def = TIPO_EVENTO.get(e.tipo);
    if (!def?.alimenta || !CLAVES_VITAL.has(def.alimenta)) continue;
    if (def.acumula !== "suma_monto") continue;
    acc[def.alimenta] = (acc[def.alimenta] ?? 0) + (e.monto ?? 0);
  }
  return acc;
}

/** Los campos obligatorios que falten, en palabras. Vacío = el evento se puede guardar. */
export function faltantes(tipo: string, datos: Record<string, unknown>): string[] {
  const def = TIPO_EVENTO.get(tipo);
  if (!def) return ["Ese tipo de anotación no existe"];
  return def.campos
    .filter((c) => c.obligatorio)
    .filter((c) => {
      const v = datos[c.clave];
      return v == null || String(v).trim() === "";
    })
    .map((c) => c.etiqueta);
}
