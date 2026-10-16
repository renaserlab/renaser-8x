/**
 * CÓMO GANA DINERO UN NEGOCIO: el vocabulario con el que se le pregunta (16-10-2026).
 *
 * La tabla de lo que vende no puede preguntarle lo mismo a un taller de jeans que a un estudio de abogados: uno
 * vende pantalones y el otro casos. Seis modelos, y cada uno trae sus palabras: qué es «uno» (una unidad, un caso,
 * un proyecto, una operación, un plato), cómo se pregunta el precio, el costo y el volumen, y cómo se convierte lo
 * que la persona dice a «al mes».
 *
 * Reglas (memoria `principio-preguntas-orales` y revisión del 16-10): una cosa por pregunta; se pide el episodio
 * («el mes pasado», «la última vez»), nunca «en un mes normal» ni un promedio; registro formal y cálido. Ninguna
 * pregunta ni caja trae una cifra o una lista de ejemplo que la persona pueda repetir: el `placeholder` de las partes
 * del costo es una pista neutra (memoria `nada-se-inventa-nada-confunde`; prueba `tests/preguntas-sin-eco.test.ts`).
 *
 * Puro: sin base, sin red.
 */

export const MODELOS_NEGOCIO = ["fabrica_y_vende", "compra_y_revende", "vende_horas_o_casos", "vende_proyectos", "intermedia_comision", "prepara_y_sirve"] as const;
export type ModeloNegocio = (typeof MODELOS_NEGOCIO)[number];

export type DefModelo = {
  clave: ModeloNegocio;
  /** Lo que el dueño elige: «Fabrico y vendo». */
  paraDueno: string;
  /** Qué es «uno»: unidad, caso, proyecto, operación, plato. */
  unidad: { singular: string; plural: string };
  preguntaPrecio: string;
  /**
   * Donde se puede cobrar por hora (vende_horas_o_casos): la pregunta del precio por hora. Con «cobro por hora»
   * (datos_modelo.por_hora) el precio de un caso es precio × horas que lleva un caso; sin las horas no hay margen.
   * El costo y el volumen se preguntan SIEMPRE por caso: así precio y costo hablan de lo mismo.
   */
  preguntaPrecioPorHora?: string;
  /** La pregunta del segundo precio (por mayor o mínimo), donde aplica; null donde no. */
  preguntaSegundoPrecio: string | null;
  preguntaCosto: string;
  /** La pista de la caja del nombre de una parte del costo. Neutra: sin ejemplos ni cifras, y nunca se escribe como valor. */
  placeholderPartes: string;
  preguntaVolumen: string;
  /** Cómo convertir lo que dice a «al mes». "mes" directo; "trimestre" ÷3; "dia" × dias_al_mes de ficha_negocio.totales. */
  volumenSeDicePor: "mes" | "trimestre" | "dia";
  tipoLinea: "producto" | "servicio";
};

const SEGUNDO_PRECIO = "¿Lo vendes también a otro precio?";
/** La pista neutra de la caja del nombre de una parte del costo. */
const NOMBRE_PARTE = "Nombre de la parte";

export const MODELO: Record<ModeloNegocio, DefModelo> = {
  fabrica_y_vende: {
    clave: "fabrica_y_vende",
    paraDueno: "Fabrico y vendo",
    unidad: { singular: "unidad", plural: "unidades" },
    preguntaPrecio: "¿A cuánto lo vendiste la última vez?",
    preguntaSegundoPrecio: SEGUNDO_PRECIO,
    preguntaCosto: "¿Cuánto te cuesta hacer uno? Ve parte por parte.",
    placeholderPartes: NOMBRE_PARTE,
    preguntaVolumen: "El mes pasado, ¿cuántos vendiste?",
    volumenSeDicePor: "mes",
    tipoLinea: "producto",
  },
  compra_y_revende: {
    clave: "compra_y_revende",
    paraDueno: "Compro y revendo",
    unidad: { singular: "unidad", plural: "unidades" },
    preguntaPrecio: "¿A cuánto lo vendiste la última vez?",
    preguntaSegundoPrecio: SEGUNDO_PRECIO,
    preguntaCosto: "¿Cuánto te cuesta tenerlo en tu tienda? Ve parte por parte.",
    placeholderPartes: NOMBRE_PARTE,
    preguntaVolumen: "El mes pasado, ¿cuántos vendiste?",
    volumenSeDicePor: "mes",
    tipoLinea: "producto",
  },
  vende_horas_o_casos: {
    clave: "vende_horas_o_casos",
    paraDueno: "Cobro por hora o por caso",
    unidad: { singular: "caso", plural: "casos" },
    preguntaPrecio: "¿Cuánto cobraste por el último caso?",
    preguntaPrecioPorHora: "¿Cuánto cobraste por hora la última vez?",
    preguntaSegundoPrecio: null,
    preguntaCosto: "¿Cuánto te cuesta atender un caso? Ve parte por parte.",
    placeholderPartes: NOMBRE_PARTE,
    preguntaVolumen: "El mes pasado, ¿cuántos casos atendiste?",
    volumenSeDicePor: "mes",
    tipoLinea: "servicio",
  },
  vende_proyectos: {
    clave: "vende_proyectos",
    paraDueno: "Vendo proyectos",
    unidad: { singular: "proyecto", plural: "proyectos" },
    preguntaPrecio: "¿Cuánto cobraste por el último proyecto?",
    preguntaSegundoPrecio: null,
    preguntaCosto: "¿Cuánto te costó hacer el último proyecto? Ve parte por parte.",
    placeholderPartes: NOMBRE_PARTE,
    preguntaVolumen: "En los últimos tres meses, ¿cuántos proyectos cerraste?",
    volumenSeDicePor: "trimestre",
    tipoLinea: "servicio",
  },
  intermedia_comision: {
    clave: "intermedia_comision",
    paraDueno: "Intermedio y cobro comisión",
    unidad: { singular: "operación", plural: "operaciones" },
    preguntaPrecio: "En tu última operación, ¿cuánto te quedó?",
    preguntaSegundoPrecio: null,
    preguntaCosto: "¿Cuánto gastas en cada operación? Ve parte por parte.",
    placeholderPartes: "Nombre del gasto",
    preguntaVolumen: "El mes pasado, ¿cuántas operaciones cerraste?",
    volumenSeDicePor: "mes",
    tipoLinea: "servicio",
  },
  prepara_y_sirve: {
    clave: "prepara_y_sirve",
    paraDueno: "Preparo y sirvo",
    unidad: { singular: "plato", plural: "platos" },
    preguntaPrecio: "¿A cuánto lo vendiste la última vez?",
    preguntaSegundoPrecio: null,
    preguntaCosto: "¿Cuánto te cuesta preparar uno? Ve ingrediente por ingrediente.",
    placeholderPartes: "Nombre del ingrediente",
    preguntaVolumen: "El último día que abriste, ¿cuántos vendiste?",
    volumenSeDicePor: "dia",
    tipoLinea: "producto",
  },
};

export const esModeloNegocio = (v: unknown): v is ModeloNegocio => (MODELOS_NEGOCIO as readonly string[]).includes(String(v));

/** Lo que guarda companies.modelo_negocio, limpio: solo modelos conocidos, sin repetir, uno o dos. Vacío si nada sirve. */
export function modelosDe(v: unknown): ModeloNegocio[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(esModeloNegocio))].slice(0, 2);
}

/**
 * Sugerencia desde companies.modelo_operativo (rules/matrices.ts): produccion → fabrica_y_vende; retail →
 * compra_y_revende; restaurante → prepara_y_sirve; citas o profesional → vende_horas_o_casos; los demás no sugieren
 * nada. Solo sugiere: decide la consultora. Como mucho dos, en el orden en que aparecen.
 */
export function sugerirModeloNegocio(modeloOperativo: string[] | null | undefined): ModeloNegocio[] {
  const mapa: Record<string, ModeloNegocio> = {
    produccion: "fabrica_y_vende",
    retail: "compra_y_revende",
    restaurante: "prepara_y_sirve",
    citas: "vende_horas_o_casos",
    profesional: "vende_horas_o_casos",
  };
  const salida: ModeloNegocio[] = [];
  for (const m of modeloOperativo ?? []) {
    const s = mapa[String(m).trim().toLowerCase()];
    if (s && !salida.includes(s)) salida.push(s);
  }
  return salida.slice(0, 2);
}

/** Qué trabajo compró la empresa. Se re-exporta desde ruta.ts, que define sus etapas. */
export const TIPOS_TRABAJO = ["estructurar", "sistematizar_directo", "estructurar_y_sistematizar"] as const;
