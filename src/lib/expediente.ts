/**
 * EL EXPEDIENTE DOCUMENTAL: la memoria de lo que cada empresa YA tiene.
 *
 * POR QUÉ EXISTE. El 18-10-2026 entramos a la primera empresa cliente y el sistema no sabía que existían su MOF, su
 * Reglamento Interno, siete procedimientos de personal, su FODA, su plan estratégico ni su
 * organigrama. Estaban en Drive desde agosto. Hubo que encontrarlos con un navegador, a mano.
 *
 * Ese es el cuello de botella de 8X, y no es que falten funciones: es que el sistema PRODUCE y no
 * RECIBE. Todo lo que genera queda adentro; nada de lo que ya existe entra. El mandato dice lo
 * contrario — reutilizar primero, crear solo lo que falte — y hasta hoy el código decía otra cosa.
 *
 * LA REGLA QUE LO ORDENA TODO (Kelin, 18-10-2026): lo que el cliente entrega es MATERIA PRIMA, no
 * producto terminado. Entra al expediente como base, se mide contra la vara de su tipo, y sale
 * como versión mejorada. El expediente no es un archivador: es la puerta de entrada al trabajo.
 *
 * APROBACIÓN NO ES VIGENCIA. Son dos cosas distintas y el sistema tiene que conservarlas separadas:
 *   · La APROBACIÓN es una decisión: alguien con autoridad dijo que sí, y queda quién y cuándo.
 *   · La VIGENCIA es un estado institucional: desde cuándo ese documento RIGE la forma de trabajar.
 * Un documento puede estar aprobado el lunes y entrar en vigor el día 1 del mes siguiente. Y puede
 * estar vigente aunque quien lo aprobó ya no esté en la empresa. Juntarlos en un solo campo borra
 * la diferencia entre «lo decidimos» y «esto manda hoy».
 */

/**
 * El camino de un documento. Recibido → Borrador → Revisión → Aprobado → Vigente, y de ahí a
 * Sustituido o Archivado. No se salta pasos: un documento que aparece «vigente» sin haber pasado
 * por aprobado es exactamente lo que hace que el cliente vea como oficial algo que nadie firmó.
 */
export const ESTADOS = {
  recibido: {
    clave: "recibido",
    nombre: "Recibido",
    que_significa: "Llegó al expediente y todavía no se ha leído ni medido contra su vara.",
    lo_ve_el_cliente: false,
  },
  borrador: {
    clave: "borrador",
    nombre: "Borrador",
    que_significa: "Alguien lo está escribiendo o mejorando. Puede ser nuestro o del cliente.",
    lo_ve_el_cliente: false,
  },
  en_revision: {
    clave: "en_revision",
    nombre: "En revisión",
    que_significa: "Está medido contra su vara y espera la decisión de quien aprueba.",
    lo_ve_el_cliente: false,
  },
  aprobado: {
    clave: "aprobado",
    nombre: "Aprobado, pendiente de vigencia",
    que_significa: "Quien tiene autoridad dijo que sí. Todavía no rige: falta la fecha desde la que manda.",
    lo_ve_el_cliente: false,
  },
  vigente: {
    clave: "vigente",
    nombre: "Vigente",
    que_significa: "Rige la forma de trabajar. Es la fuente oficial: de aquí sale todo lo demás.",
    lo_ve_el_cliente: true,
  },
  sustituido: {
    clave: "sustituido",
    nombre: "Sustituido",
    que_significa: "Otra versión lo reemplazó. Se conserva: sin historial no se puede saber qué cambió ni por qué.",
    lo_ve_el_cliente: false,
  },
  archivado: {
    clave: "archivado",
    nombre: "Archivado",
    que_significa: "Ya no aplica y nada lo reemplaza. Se conserva por trazabilidad.",
    lo_ve_el_cliente: false,
  },
  /**
   * INSUMO NO ESTÁ EN EL CAMINO DE ARRIBA, Y ESA ES LA IDEA.
   *
   * Lo descubrió el revisor midiendo la biblioteca del primer cliente el 19-10-2026: devolvió que
   * cuatro de los documentos no eran documentos. Los llamó por su nombre —«borrador fragmentado de
   * guía operativa y apuntes», «listado informal de funciones», «transcripción de entrevista sobre
   * prácticas laborales»—. Eso es lo que la dueña contó y lo que el personal dictó: materia prima
   * en estado puro.
   *
   * Hasta entonces el expediente solo sabía decir «medido» o «sin medir», así que una transcripción
   * de entrevista se contaba como un entregable que falló su vara. Es injusto con el documento,
   * ensucia el tablero y —lo peor— hace que el activo parezca cubierto por algo que no lo cubre.
   *
   * Un insumo no se mide, no cuenta como entregable y no tapa ningún activo. Pero tampoco se
   * esconde: quien vaya a construir ese activo tiene que saber que existe, porque ahí está lo que
   * la empresa de verdad hace.
   */
  insumo: {
    clave: "insumo",
    nombre: "Insumo",
    que_significa:
      "No es un entregable: es material que la empresa aportó —una transcripción, unos apuntes, un listado informal—. No se mide contra ninguna vara porque ninguna vara mide esto, y se lee antes de escribir el documento que sí corresponde.",
    // El cliente no lo ve en su lista de documentos: esa lista es la de lo que RIGE, y un insumo no
    // rige nada. Verlo ahí le haría creer que la transcripción de su propia entrevista es un
    // documento oficial de su empresa.
    lo_ve_el_cliente: false,
  },
} as const;

export type Estado = keyof typeof ESTADOS;

/** A qué estado puede pasar cada estado. Lo que no esté aquí, no pasa. */
export const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  // Un recibido pasa a insumo el día que alguien lo abre y ve que no es un entregable sino la
  // transcripción de una reunión. Es la corrección más barata del expediente y la que más limpia.
  recibido: ["borrador", "en_revision", "insumo", "archivado"],
  borrador: ["en_revision", "archivado"],
  // También a insumo: darse cuenta de que lo que llegó no es un entregable sino una transcripción
  // pasa justamente cuando alguien se sienta a revisarlo. Es el momento en que se descubre.
  en_revision: ["aprobado", "borrador", "insumo", "archivado"],
  // Aprobado puede volver a revisión: alguien aprobó y después apareció una contradicción.
  aprobado: ["vigente", "en_revision", "archivado"],
  vigente: ["sustituido", "archivado"],
  sustituido: ["archivado"],
  archivado: [],
  // Vuelve a «recibido» si se marcó mal: lo que parecía apuntes resultó ser el procedimiento
  // bueno. No pasa a borrador ni a revisión: el documento que salga de un insumo es una fila
  // nueva, no este mismo cambiado de nombre.
  insumo: ["recibido", "archivado"],
};

export function puedePasar(de: Estado, a: Estado): boolean {
  return (TRANSICIONES[de] as readonly string[]).includes(a);
}

/** De dónde salió el documento. Importa para la propiedad intelectual y para saber qué mejorar. */
export const ORIGENES = {
  cliente: "Lo tenía la empresa antes de que entráramos. Es materia prima: entra, se mide y se mejora.",
  consultora: "Lo produjo RENASER para esta empresa, con su información.",
  plantilla_adaptada: "Salió de una plantilla maestra de 8X adaptada con la información real de esta empresa.",
} as const;
export type Origen = keyof typeof ORIGENES;

/**
 * Un entregable del contrato de UNA empresa. Vive en `contrato_entregables`, una fila por
 * entregable y por empresa.
 *
 * Por qué es una tabla y no una constante: hasta la auditoría del 18-10-2026 esta lista era una
 * constante del código con el contrato de un cliente, y la ruta del expediente la aplicaba a
 * CUALQUIER empresa — las cinco de la base veían el tablero del contrato de la primera empresa cliente. El
 * requisito es el contrario y está dicho así: cada empresa se rige por su contrato y su alcance.
 */
export type Entregable = {
  clausula: string;
  clave: string;
  nombre: string;
  /** La vara con que se medirá cuando llegue. Sin vara no se puede medir. */
  clave_vara: string;
  /** Lo que el contrato promete y no es un documento se entrega con evidencia, no con un archivo. */
  tipo: "documento" | "auditoria" | "capacitacion" | "acompanamiento";
  orden: number;
};

/**
 * EL CONTRATO DEL PRIMER CLIENTE, como semilla — no como la lista de nadie más.
 *
 * Esto NO lo lee la aplicación: lo usa una sola vez el script que siembra `contrato_entregables`
 * para esta empresa. El contrato dice «de manera enunciativa mas no limitativa», así que es lo
 * nombrado, no el techo. Los tres últimos no son documentos: una auditoría se entrega con sus
 * hallazgos y una capacitación con su evidencia de asistencia, y el tablero no puede exigirles un
 * documento vigente que nunca va a existir.
 */
export const CONTRATO_SEMILLA = [
  { clausula: "2.1", clave: "analisis_organizacional", nombre: "Análisis del contexto organizacional", clave_vara: "estrategia", tipo: "documento", orden: 1 },
  { clausula: "2.1", clave: "foda", nombre: "Matriz FODA", clave_vara: "estrategia", tipo: "documento", orden: 2 },
  { clausula: "2.1", clave: "plan_estrategico", nombre: "Plan estratégico organizacional", clave_vara: "estrategia", tipo: "documento", orden: 3 },
  { clausula: "2.1", clave: "estructura_y_roles", nombre: "Diseño de la estructura organizacional y roles", clave_vara: "mof", tipo: "documento", orden: 4 },
  { clausula: "2.2", clave: "mof", nombre: "Manual de Organización y Funciones", clave_vara: "mof", tipo: "documento", orden: 5 },
  { clausula: "2.2", clave: "manual_procesos", nombre: "Manual de Procesos", clave_vara: "procesos", tipo: "documento", orden: 6 },
  { clausula: "2.2", clave: "organigrama", nombre: "Organigrama institucional", clave_vara: "mof", tipo: "documento", orden: 7 },
  { clausula: "2.2", clave: "manual_atencion", nombre: "Manual de Atención al Cliente", clave_vara: "atencion", tipo: "documento", orden: 8 },
  { clausula: "2.2", clave: "manual_seleccion", nombre: "Manual de Selección y Reclutamiento", clave_vara: "seleccion", tipo: "documento", orden: 9 },
  { clausula: "2.2", clave: "reglamento_interno", nombre: "Reglamento Interno de Trabajo", clave_vara: "reglamento", tipo: "documento", orden: 10 },
  { clausula: "2.2", clave: "doc_estandares", nombre: "Documentación alineada a estándares internos", clave_vara: "procesos", tipo: "documento", orden: 11 },
  { clausula: "2.3", clave: "auditoria_diagnostico", nombre: "Auditoría de diagnóstico, con hallazgos", clave_vara: "estrategia", tipo: "auditoria", orden: 12 },
  { clausula: "2.3", clave: "auditoria_interna", nombre: "Auditoría interna, con hallazgos", clave_vara: "estrategia", tipo: "auditoria", orden: 13 },
  { clausula: "2.4", clave: "capacitacion_general", nombre: "Capacitación general sobre los manuales", clave_vara: "atencion", tipo: "capacitacion", orden: 14 },
  { clausula: "2.5", clave: "acompanamiento_induccion", nombre: "Acompañamiento en inducción", clave_vara: "seleccion", tipo: "acompanamiento", orden: 15 },
  { clausula: "2.6", clave: "lineamientos_seguridad", nombre: "Lineamientos de seguridad organizacional", clave_vara: "procesos", tipo: "documento", orden: 16 },
] as const satisfies readonly Entregable[];

/** En qué está cada entregable. Lo que se le muestra a la consultora de un vistazo. */
export const ESTADO_ENTREGABLE = {
  no_existe: "No hay nada. Hay que crearlo desde la plantilla maestra y la información de la empresa.",
  hay_base: "Existe material aprovechable, pero no es producto terminado: hay que mejorarlo contra su vara.",
  en_mejora: "Se está produciendo la versión mejorada.",
  entregado: "Se entregó al cliente y espera su aprobación.",
  vigente: "Aprobado y rigiendo. De aquí sale el resto.",
} as const;
export type EstadoEntregable = keyof typeof ESTADO_ENTREGABLE;

/**
 * Un documento vigente MANDA sobre lo que se produzca después. Esta es la regla que evita que
 * volvamos a redactar el propósito y los valores desde cero cuando ya hay un manual aprobado.
 */
export function rigeSobreLoNuevo(estado: Estado): boolean {
  return estado === "vigente";
}

/**
 * ¿Puede el cliente ver este documento? Solo lo vigente. Un borrador nuestro en manos del cliente
 * adelanta una conversación que no le toca tener todavía — regla de Kelin del 27-09-2026.
 */
export function loVeElCliente(estado: Estado): boolean {
  return ESTADOS[estado].lo_ve_el_cliente;
}

/**
 * Qué le falta a un documento para poder declararse vigente. Devuelve la lista de lo que impide
 * el paso; vacía significa que puede pasar. Aprobar sin firma, o declarar vigente sin fecha desde
 * la que rige, son las dos formas de que algo aparezca como oficial sin serlo.
 */
export function queLeFaltaParaVigencia(d: {
  estado: Estado;
  aprobado_por?: string | null;
  aprobado_at?: string | null;
  vigente_desde?: string | null;
  revisado_contra_vara?: boolean | null;
}): string[] {
  const falta: string[] = [];
  if (!puedePasar(d.estado, "vigente")) {
    falta.push(`Desde «${ESTADOS[d.estado].nombre}» no se puede pasar a vigente: primero tiene que estar aprobado.`);
  }
  if (!d.aprobado_por) falta.push("Falta quién lo aprobó: una aprobación sin nombre no es una aprobación.");
  if (!d.aprobado_at) falta.push("Falta cuándo se aprobó.");
  if (!d.vigente_desde) falta.push("Falta desde cuándo rige. La aprobación es la decisión; la vigencia es la fecha en que manda.");
  if (!d.revisado_contra_vara) {
    falta.push("Todavía no se midió contra la vara de su tipo. Lo que el cliente entrega es materia prima: entra, se mide y se mejora.");
  }
  return falta;
}


/**
 * EL ESTADO DE UN ACTIVO SE DERIVA DE SU EXPEDIENTE, NO SE ESCRIBE APARTE.
 *
 * POR QUÉ EXISTE. La auditoría del 18-10-2026 encontró que había DOS expedientes y que ninguno
 * sabía del otro: `company_assets` marcaba como «construido» y confirmado nueve documentos de
 * la primera empresa cliente —funciones, selección, reglamento, organigrama, evaluación, inducción— que la empresa
 * YA TENÍA en su Drive desde agosto. El sistema registró como obra propia lo que la clienta ya
 * había pagado por tener, y después volvió a producir encima.
 *
 * La corrección no es otra columna: es dejar de escribir dos veces la misma verdad. El activo no
 * declara su estado; su estado SALE de los documentos del expediente que lo cubren.
 */
export type DocDelActivo = {
  estado: Estado;
  origen: Origen;
  /** Si pasó por su vara. Un documento del cliente sin medir es materia prima sin examinar. */
  revisado_contra_vara: boolean;
};

export const ESTADOS_ACTIVO_DERIVADO = {
  no_hay_nada: "No hay ningún documento que cubra esto. Se produce desde la plantilla maestra con los datos de la empresa.",
  lo_tiene_sin_medir: "La empresa ya entregó un documento para esto y todavía no se midió contra su vara.",
  lo_tiene_medido: "La empresa ya tiene un documento medido: lo que toca es mejorarlo, no reescribirlo.",
  en_mejora: "Ya hay una versión nuestra en curso para esto.",
  vigente: "Hay un documento vigente que lo cubre. Es la fuente oficial: de aquí sale lo demás.",
} as const;
export type EstadoActivoDerivado = keyof typeof ESTADOS_ACTIVO_DERIVADO;

/**
 * Qué pasa con un activo, mirando los documentos del expediente que lo cubren. El orden de las
 * preguntas es el orden de la autoridad: lo vigente manda sobre lo medido, lo medido sobre lo que
 * está sin medir, y lo del cliente sobre lo nuestro en curso.
 */
export function estadoDelActivo(docs: readonly DocDelActivo[]): {
  estado: EstadoActivoDerivado;
  que_significa: string;
  /** Qué documentos del cliente están esperando que alguien los mida. */
  sin_medir: number;
  /**
   * Material que la empresa aportó y que no es un entregable. No cambia el estado del activo —no
   * lo cubre ni lo deja pendiente de medir—, pero se cuenta aparte para que quien vaya a construir
   * sepa que existe. Un insumo que no se ve se lee como que no hay nada, y lo hay.
   */
  insumos: number;
} {
  const vivos = docs.filter((d) => d.estado !== "archivado" && d.estado !== "sustituido" && d.estado !== "insumo");
  const insumos = docs.filter((d) => d.estado === "insumo").length;
  const sinMedir = vivos.filter((d) => d.origen === "cliente" && !d.revisado_contra_vara).length;

  const estado: EstadoActivoDerivado = vivos.some((d) => d.estado === "vigente")
    ? "vigente"
    : sinMedir > 0
      ? "lo_tiene_sin_medir"
      : vivos.some((d) => d.origen === "cliente")
        ? "lo_tiene_medido"
        : vivos.length > 0
          ? "en_mejora"
          : "no_hay_nada";

  return { estado, que_significa: ESTADOS_ACTIVO_DERIVADO[estado], sin_medir: sinMedir, insumos };
}

/**
 * ¿SE PUEDE CONSTRUIR ESTE ACTIVO DESDE CERO?
 *
 * Esta es la función que hace imposible el error que Kelin señaló el 18-10-2026 y que yo mismo
 * cometí el mismo día: escribí un Manual de Selección para la primera empresa cliente sin ver que su procedimiento
 * APO-REC-01 ya existía en su Drive. Su regla fue «no generar documentos sin revisar las versiones
 * anteriores», y una regla que depende de que alguien se acuerde no es una regla: es una
 * esperanza. Aquí la impone el código, y por eso la ruta de construir no construye sin preguntarle.
 *
 * Devuelve `null` cuando se puede construir. Cuando no, devuelve la razón, escrita para que la
 * lea la consultora y sepa qué hacer en vez de qué no hacer.
 */
export function porQueNoSeConstruye(docs: readonly DocDelActivo[]): string | null {
  const { estado, sin_medir } = estadoDelActivo(docs);

  if (estado === "vigente") {
    return (
      "Esta empresa ya tiene un documento VIGENTE que cubre esto, y lo vigente manda sobre lo que se " +
      "produzca después. Lo que corresponde es sustituirlo con una versión mejorada —que nace de él, no de cero— " +
      "o declararlo sustituido primero si de verdad ya no aplica."
    );
  }

  if (estado === "lo_tiene_sin_medir") {
    const cuantos = sin_medir === 1 ? "un documento" : `${sin_medir} documentos`;
    return (
      `La empresa ya entregó ${cuantos} para esto y todavía no se midió contra su vara. Lo que el cliente ` +
      "entrega es materia prima, no basura: se mide primero y se mejora desde ahí. Escribirlo de nuevo " +
      "sería cobrarle por algo que ya tenía."
    );
  }

  if (estado === "en_mejora") {
    return "Ya hay una versión nuestra en curso para esto. Dos borradores del mismo documento acaban en dos verdades.";
  }

  // `lo_tiene_medido` SÍ construye: la mejora es justamente el trabajo, y nace del documento medido.
  return null;
}

/**
 * QUÉ HAY QUE LEER ANTES DE ESCRIBIR, AUNQUE NO IMPIDA ESCRIBIR.
 *
 * Un insumo no bloquea la construcción —no es un entregable y no cubre nada—, pero sería absurdo
 * escribir el instructivo de un puesto sin leer antes la transcripción en que esa misma persona
 * contó cómo hace su trabajo. Ahí está lo que la empresa de verdad hace, que es la línea base
 * contra la que después se mide si mejoró.
 *
 * Va aparte de `porQueNoSeConstruye` a propósito: una cosa es «no construyas» y otra «construye,
 * y empieza por leer esto». Mezclarlas convertiría un aviso útil en un bloqueo más, y el bloqueo
 * que se puede ignorar sin consecuencia es el que enseña a ignorar todos los demás.
 *
 * Devuelve `null` cuando no hay nada aportado que leer.
 */
export function queLeerAntesDeConstruir(docs: readonly DocDelActivo[]): string | null {
  const { insumos } = estadoDelActivo(docs);
  if (!insumos) return null;
  return insumos === 1
    ? "Hay un material aportado por la empresa para esto —apuntes, una transcripción o un listado informal—. No es un entregable y no impide construir, pero ahí está escrito lo que hoy se hace de verdad: se lee antes, o el documento nuevo va a describir una empresa que no existe."
    : `Hay ${insumos} materiales aportados por la empresa para esto —apuntes, transcripciones o listados informales—. No son entregables y no impiden construir, pero ahí está escrito lo que hoy se hace de verdad: se leen antes, o el documento nuevo va a describir una empresa que no existe.`;
}
