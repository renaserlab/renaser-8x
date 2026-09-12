/**
 * LOS CONTRATOS DE LOS AGENTES — la ficha obligatoria del Manual de Agentes y Estándares de RENASER
 * (v1.2, sección 4), aplicada por el código y no solo escrita en un documento.
 *
 * El manual es explícito en AH01: «Herramientas y permisos aplicados por el entorno, ADEMÁS de las
 * instrucciones». Y en AH05: «Límites de costo, tiempo y reintentos configurados y probados». Un
 * límite que vive en el prompt no es un límite: es una sugerencia que el modelo puede ignorar.
 *
 * Por eso aquí cada agente declara su presupuesto, su tiempo máximo, sus reintentos, su condición
 * de éxito, cuándo para, cómo se recupera y quién responde por él — y `aplicarContrato()` lo
 * impone en cada llamada. Un agente sin contrato NO CORRE: la prueba `agentes.test.ts` falla si
 * alguien agrega uno sin ficha, que es la única forma de que esto no se degrade con el tiempo.
 *
 * LOS PRESUPUESTOS SALEN DE LA MEDICIÓN, NO DEL CRITERIO. Se fijaron sobre el consumo real
 * registrado en `token_usage` (1.168 ejecuciones al 2026-09-12) con margen para el caso peor. Donde
 * no hay medición todavía —nueve de los dieciséis nunca han corrido— se anota `medido: false` y el
 * presupuesto es el límite que ya usaba el código. Eso se corrige con datos, no con opinión.
 */

export type ClaveAgente =
  | "admision" | "arquitecto" | "auditor" | "constructor" | "contrastador" | "diagnosticador"
  | "entrevistador" | "estratega" | "extractor" | "medidor" | "minero" | "planificador"
  | "redactor" | "rediseno" | "sistematizador" | "sop";

/** Quién responde por el agente, según la sección 1 del manual. */
export type Responsable = "Producto" | "Tecnología" | "Validación" | "Dirección";

export type Contrato = {
  clave: ClaveAgente;
  version: string;
  proposito: string;
  disparador: string;
  /** Fuentes autorizadas: de dónde puede leer. Nada más. */
  fuentes: string[];
  entrada: string;
  /** Salida estructurada: el esquema Zod que valida su respuesta. */
  salida: string;
  acciones_prohibidas: string[];
  /** Quién aprueba lo que produce antes de que tenga efecto. */
  aprobador: "nadie" | "dueño" | "consultor";
  /** Presupuesto por ejecución, en tokens de salida. Es el tope duro de `maxTokens`. */
  presupuesto_tokens: number;
  tiempo_max_ms: number;
  /** El manual propone máximo dos para fallos transitorios y acciones seguras de repetir. */
  reintentos: 0 | 1 | 2;
  exito: string;
  parada: string;
  recuperacion: string;
  responsable: Responsable;
  /** ¿El presupuesto viene de consumo real medido o del límite heredado del código? */
  medido: boolean;
};

/** Lo que no se repite en cada ficha porque vale para todas. */
const SEGURO_DE_REPETIR = "Reintentar es seguro: no escribe nada hasta que su salida valida.";
const PARADA_COMUN = "Dos fallos seguidos, presupuesto agotado o salida que no valida dos veces.";

export const CONTRATOS: Record<ClaveAgente, Contrato> = {
  admision: {
    clave: "admision", version: "1.0",
    proposito: "Decidir si una empresa que se registra puede ser atendida, y con qué advertencias.",
    disparador: "Alta de empresa con su ficha de admisión.",
    fuentes: ["ficha de admisión"],
    entrada: "Ficha de admisión completa.", salida: "SalidaAdmision",
    acciones_prohibidas: ["Rechazar por el rubro", "Inventar requisitos legales"],
    aprobador: "consultor",
    presupuesto_tokens: 800, tiempo_max_ms: 60_000, reintentos: 2,
    exito: "Veredicto con motivo citando la ficha.", parada: PARADA_COMUN,
    recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: false,
  },
  arquitecto: {
    clave: "arquitecto", version: "1.0",
    proposito: "Dibujar el proceso REAL que describe la persona, con sus tiempos y sus huecos honestos.",
    disparador: "El dueño cuenta un proceso por texto o voz.",
    fuentes: ["descripción del proceso"],
    entrada: "Descripción en lenguaje natural, posiblemente transcrita.", salida: "SalidaArquitecto",
    acciones_prohibidas: ["Inventar pasos, responsables, tiempos o herramientas", "Omitir los finales malos"],
    aprobador: "dueño",
    // Medido: máximo 4.872 tokens en 37 ejecuciones; salida máxima 3.158.
    presupuesto_tokens: 4000, tiempo_max_ms: 120_000, reintentos: 2,
    exito: "Flujograma con todo camino terminado en un nodo fin y toda decisión con dos salidas.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: true,
  },
  auditor: {
    clave: "auditor", version: "1.0",
    proposito: "Revisar el diagnóstico contra su evidencia antes de que lo vea el dueño.",
    disparador: "Diagnóstico terminado de un pilar.",
    fuentes: ["hallazgos", "afirmaciones", "evidencia citada"],
    entrada: "Hallazgos con sus citas.", salida: "SalidaAuditor",
    acciones_prohibidas: ["Aprobar un hallazgo sin evidencia", "Corregir el hallazgo en la misma pasada"],
    aprobador: "nadie",
    // Medido: máximo 11.711 en 48 ejecuciones; salida máxima 752 (audita, no redacta).
    presupuesto_tokens: 4000, tiempo_max_ms: 120_000, reintentos: 2,
    exito: "Cada hallazgo queda aprobado o devuelto con el motivo.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Validación", medido: true,
  },
  constructor: {
    clave: "constructor", version: "1.0",
    proposito: "Redactar un documento empresarial con lo que la empresa ya mostró, nunca con plantilla.",
    disparador: "El dueño pide construir un activo de su matriz.",
    fuentes: ["afirmaciones confirmadas", "personas y puestos", "procesos", "know-how", "entrevistas", "activos que compone"],
    entrada: "Clave del activo y, si las hay, respuestas a huecos previos.", salida: "SalidaConstructor",
    acciones_prohibidas: ["Inventar nombres, cargos, cifras o valores", "Repreguntar lo que ya está en el material"],
    aprobador: "dueño",
    presupuesto_tokens: 4000, tiempo_max_ms: 120_000, reintentos: 2,
    exito: "Borrador en el lenguaje de la empresa, con los huecos marcados como preguntas.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: false,
  },
  contrastador: {
    clave: "contrastador", version: "1.0",
    proposito: "Cruzar una afirmación nueva contra lo ya dicho y detectar contradicciones vigentes.",
    disparador: "Afirmación extraída de una fuente.",
    fuentes: ["afirmaciones de la empresa"],
    entrada: "La afirmación nueva y las comparables.", salida: "SalidaContrastador",
    acciones_prohibidas: ["Declarar contradicción entre datos de fechas distintas sin decirlo"],
    aprobador: "nadie",
    // Medido: 899 ejecuciones, máximo 1.723. Es el agente que más corre: su presupuesto es el que más pesa.
    presupuesto_tokens: 600, tiempo_max_ms: 90_000, reintentos: 2,
    exito: "Relación clasificada con las dos afirmaciones citadas.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Tecnología", medido: true,
  },
  diagnosticador: {
    clave: "diagnosticador", version: "1.0",
    proposito: "Encontrar los hallazgos de un pilar, cada uno anclado en la evidencia que lo prueba.",
    disparador: "La evidencia del pilar crece a un nuevo nivel.",
    fuentes: ["afirmaciones confirmadas", "procesos", "know-how", "métricas"],
    entrada: "Pilar y toda su evidencia.", salida: "SalidaDiagnosticador",
    acciones_prohibidas: ["Presentar un benchmark como hecho de la empresa", "Hallazgo sin evidencia citada"],
    aprobador: "consultor",
    // Medido: máximo 16.976 en 50 ejecuciones. Es el más caro del sistema.
    presupuesto_tokens: 8000, tiempo_max_ms: 180_000, reintentos: 2,
    exito: "Hallazgos con causa, costo posible y evidencia citada.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: true,
  },
  entrevistador: {
    clave: "entrevistador", version: "1.0",
    proposito: "Hacer LA siguiente pregunta: la de mayor valor, respondible hablando por alguien que no escribe.",
    disparador: "El dueño entra a la conversación o responde.",
    fuentes: ["respuestas previas", "afirmaciones", "ficha", "matrices del modelo de negocio"],
    entrada: "Sesión y lo ya respondido.", salida: "SalidaEntrevistador",
    acciones_prohibidas: ["Repetir una pregunta ya respondida", "Preguntar dos cosas a la vez", "Usar jerga de consultoría"],
    aprobador: "nadie",
    // Medido: máximo 10.195 de entrada en 27 ejecuciones, pero salida máxima 316: lee mucho, escribe poco.
    presupuesto_tokens: 1200, tiempo_max_ms: 60_000, reintentos: 2,
    exito: "Una sola pregunta nueva, en lenguaje oral.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: true,
  },
  estratega: {
    clave: "estratega", version: "1.0",
    proposito: "Redactar el plan estratégico con el estándar de una firma top, todo salido de la evidencia.",
    disparador: "El consultor pide el plan estratégico.",
    fuentes: ["diagnóstico aprobado", "métricas", "procesos", "afirmaciones confirmadas"],
    entrada: "Toda la evidencia de la empresa.", salida: "SalidaEstratega",
    acciones_prohibidas: ["Rellenar una sección sin evidencia", "Omitir la opción de no actuar"],
    aprobador: "consultor",
    presupuesto_tokens: 9000, tiempo_max_ms: 240_000, reintentos: 1,
    exito: "Las secciones con evidencia escritas y las demás marcadas por_validar.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Dirección", medido: false,
  },
  extractor: {
    clave: "extractor", version: "1.0",
    proposito: "Sacar de una fuente las afirmaciones verificables, con su fecha y su temporalidad.",
    disparador: "Fuente subida o respuesta guardada.",
    fuentes: ["la fuente en cuestión"],
    entrada: "Contenido de la fuente.", salida: "SalidaExtractor",
    acciones_prohibidas: ["Afirmar lo que la fuente no dice", "Perder la fecha de la afirmación"],
    aprobador: "nadie",
    // Medido: máximo 4.515 en 101 ejecuciones. El límite de 12.000 que traía era diez veces lo necesario.
    presupuesto_tokens: 6000, tiempo_max_ms: 120_000, reintentos: 2,
    exito: "Afirmaciones con texto, tipo, temporalidad y fecha.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Tecnología", medido: true,
  },
  medidor: {
    clave: "medidor", version: "1.0",
    proposito: "Proponer, desde las incidencias que se repiten, como máximo seis números que el dueño pueda contar.",
    disparador: "El consultor pide indicadores.",
    fuentes: ["incidencias levantadas", "procesos"],
    entrada: "Las incidencias de la empresa.", salida: "SalidaMedidor",
    acciones_prohibidas: ["Proponer un indicador que nadie pueda contar", "Darlo por activo sin que el dueño lo elija"],
    aprobador: "dueño",
    presupuesto_tokens: 1600, tiempo_max_ms: 90_000, reintentos: 2,
    exito: "Indicadores propuestos con cómo se miden y dónde se ven.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: false,
  },
  minero: {
    clave: "minero", version: "1.0",
    proposito: "Minar el saber práctico de cada puesto: la señal, la situación y la regla que nadie escribió.",
    disparador: "Entrevista de know-how terminada.",
    fuentes: ["respuestas de la persona en su puesto"],
    entrada: "Respuestas de la entrevista.", salida: "SalidaMinero",
    acciones_prohibidas: ["Atribuir a una persona algo que no dijo"],
    aprobador: "nadie",
    presupuesto_tokens: 4000, tiempo_max_ms: 120_000, reintentos: 2,
    exito: "Reglas prácticas con su situación y su señal.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: false,
  },
  planificador: {
    clave: "planificador", version: "1.0",
    proposito: "Armar el plan de 90 días con acciones que alguien concreto pueda empezar el lunes.",
    disparador: "Diagnóstico aprobado.",
    fuentes: ["hallazgos aprobados", "personas", "procesos"],
    entrada: "Hallazgos y quién hay para ejecutarlos.", salida: "SalidaPlanificador",
    acciones_prohibidas: ["Acción sin responsable", "Acción que la empresa no tiene gente para hacer"],
    aprobador: "consultor",
    presupuesto_tokens: 5000, tiempo_max_ms: 180_000, reintentos: 2,
    exito: "Acciones con responsable, fecha y cómo se comprueba.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: false,
  },
  redactor: {
    clave: "redactor", version: "1.0",
    proposito: "Redactar el informe que el dueño lee, en sus palabras y sin jerga de consultoría.",
    disparador: "El consultor publica resultados.",
    fuentes: ["diagnóstico aprobado", "plan", "métricas"],
    entrada: "Lo aprobado para publicar.", salida: "SalidaRedactor",
    acciones_prohibidas: ["Nombrar autores, metodologías ni referentes", "Afirmar lo no aprobado"],
    aprobador: "consultor",
    presupuesto_tokens: 8000, tiempo_max_ms: 180_000, reintentos: 2,
    exito: "Informe legible sin una sola palabra de jerga.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: false,
  },
  rediseno: {
    clave: "rediseno", version: "1.0",
    proposito: "Proponer el proceso mejorado conservando lo que sirve, con el porqué de cada cambio.",
    disparador: "El consultor pide el TO-BE de un proceso.",
    fuentes: ["proceso AS-IS", "hallazgos que lo tocan", "know-how de los puestos"],
    entrada: "Proceso actual con sus veredictos.", salida: "SalidaToBe",
    acciones_prohibidas: ["Crear un paso sin justificación", "Automatizar un paso sin regla clara"],
    aprobador: "consultor",
    // Medido una sola vez: 7.834 tokens.
    presupuesto_tokens: 5000, tiempo_max_ms: 180_000, reintentos: 2,
    exito: "TO-BE con un cambio justificado por cada nodo que no se conserva.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: true,
  },
  sistematizador: {
    clave: "sistematizador", version: "1.0",
    proposito: "Mejorar el documento que el dueño ya confirmó, con criterio de consultor y anclado en hallazgos.",
    disparador: "Documento declarado y confirmado.",
    fuentes: ["el documento declarado", "estándares del pilar", "hallazgos", "know-how", "ficha"],
    entrada: "Documento confirmado.", salida: "SalidaSistematizador",
    acciones_prohibidas: ["Proponer un cambio sin anclarlo en un estándar o un hallazgo", "Reemplazarlo por una plantilla"],
    aprobador: "dueño",
    presupuesto_tokens: 4000, tiempo_max_ms: 120_000, reintentos: 2,
    exito: "Propuesta que parte del documento real, con máximo seis cambios justificados.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: false,
  },
  sop: {
    clave: "sop", version: "1.1",
    proposito: "Redactar el procedimiento paso a paso que se imprime y se pega en la pared.",
    disparador: "El consultor pide el SOP de un proceso.",
    fuentes: ["el proceso", "know-how de los puestos involucrados"],
    entrada: "Proceso con sus nodos y el know-how relacionado.", salida: "SalidaSop",
    acciones_prohibidas: ["Inventar pasos que el proceso no tiene", "Poner «el equipo» como responsable"],
    aprobador: "consultor",
    presupuesto_tokens: 4000, tiempo_max_ms: 180_000, reintentos: 2,
    exito: "Pasos con el CÓMO detallado, su estándar, su tiempo y su error común.",
    parada: PARADA_COMUN, recuperacion: SEGURO_DE_REPETIR, responsable: "Producto", medido: false,
  },
};

export const CLAVES_AGENTE = Object.keys(CONTRATOS) as ClaveAgente[];

export const esAgenteConocido = (clave: string): clave is ClaveAgente => clave in CONTRATOS;

/** Un agente sin contrato no corre. No es una validación: es la puerta. */
export class AgenteSinContrato extends Error {
  constructor(clave: string) {
    super(`El agente "${clave}" no tiene ficha en CONTRATOS. El manual de RENASER (sección 4) la exige antes de activarlo.`);
    this.name = "AgenteSinContrato";
  }
}

export type LimitesAplicados = { maxTokens: number; tiempo_max_ms: number; reintentos: number; version: string };

/**
 * Impone el contrato sobre lo que pidió quien llama. El presupuesto del contrato MANDA: si una
 * llamada pide más, se recorta. Así un cambio de prompt no puede encarecer un agente por descuido,
 * que es exactamente lo que AH05 quiere evitar.
 */
export function aplicarContrato(clave: string | undefined, maxTokensPedido?: number): LimitesAplicados | null {
  if (clave == null) return null; // llamadas sin agente (transcripción, pruebas) no pasan por aquí
  if (!esAgenteConocido(clave)) throw new AgenteSinContrato(clave);
  const c = CONTRATOS[clave];
  return {
    maxTokens: Math.min(maxTokensPedido ?? c.presupuesto_tokens, c.presupuesto_tokens),
    tiempo_max_ms: c.tiempo_max_ms,
    reintentos: c.reintentos,
    version: c.version,
  };
}
