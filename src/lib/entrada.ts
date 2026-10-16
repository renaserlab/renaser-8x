/**
 * LA ENTRADA BREVE: DOCE PREGUNTAS PARA ENTENDER EL NEGOCIO ANTES DE PEDIR NADA MÁS (R7.1 y parte de R6.1).
 *
 * Hasta el 13-10-2026 el dueño llegaba a una ficha de diez campos escritos y después a una conversación en
 * la que el modelo elegía la siguiente pregunta. Dirección pidió otra puerta: entre ocho y doce preguntas
 * fijas, en cuatro grupos (empresa y modelo de negocio · realidad actual y recursos · visión y vida deseada ·
 * historia, fortalezas y oportunidades), que se puedan responder hablando, escribiendo, subiendo un documento,
 * con un «más o menos» o con un «no lo sé»; que revisen lo que ya existe antes de preguntar; que se puedan
 * dejar a medias y retomar; y que terminen en una síntesis que el dueño corrige.
 *
 * Qué es determinista aquí: el plan (PLAN_ENTRADA), qué pregunta sigue (siguienteClave), qué ya sabíamos
 * (preguntasPendientes: lo sabido se CONFIRMA, no se vuelve a preguntar) y la síntesis (armarSintesis: las
 * palabras del dueño con su fuente, nunca una interpretación). El modelo solo extrae afirmaciones de las
 * respuestas, como en cualquier entrevista (jobs/handlers/extraer.ts). Un «no lo sé» no produce número
 * alguno: la falta de dato nunca es cero (debeExtraer).
 *
 * Tres reglas valen sea cual sea la forma de responder (un botón, lo escrito, lo dicho en un audio): un «no lo
 * sé» es «no lo sé» y no se extrae; un «sí» a una confirmación es una confirmación y tampoco; y cuando el
 * dueño responde con sus palabras a algo que ya sabíamos por otra fuente, al extractor va la pregunta del plan
 * y no lo que leímos del documento (tratoDeRespuesta, apartarLoSabido): el modelo no puede volver a declarar,
 * como dicho por el dueño, una cifra que salió de un Excel. Y la entrada tiene una sola puerta: la pantalla de
 * conversación de siempre no la puede responder (registrarRespuesta, en src/lib/entrevista.ts, la rechaza).
 *
 * Las filas viven en interview_sessions (tipo entrada_breve, plan, sintesis, sintesis_confirmada_at) e
 * interview_responses (clave_pregunta, certeza, sabida_por): supabase/migracion-entrada-y-direccion.sql.
 * Este archivo no crea clientes ni encola trabajos: todo lo que toca la base recibe `sb`, y por eso las
 * pruebas le pasan un cliente falso. Lo que además guarda audio y encola (responder, confirmar) vive en
 * src/lib/entrevista.ts, que reutiliza registrarRespuesta y pedirSiguiente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BLOQUES, type Bloque, type CoberturaSesion } from "./rules/cobertura";
import { configDe, moneda, numero, porDefecto, type ConfigEmpresa } from "./formato";

export type Sb = Pick<SupabaseClient, "from">;

export type Grupo = "a" | "b" | "c" | "d";
export type Certeza = "exacta" | "aproximada" | "no_lo_se";

/** Cómo se le nombra cada grupo al dueño. Nunca «pilares» ni «dimensiones». */
export const GRUPOS: Record<Grupo, string> = {
  a: "Tu negocio y lo que vendes",
  b: "Cómo está hoy",
  c: "Lo que quieres para ti y para el negocio",
  d: "Lo que ya funcionó y lo que falta aprovechar",
};
export const ORDEN_GRUPOS: Grupo[] = ["a", "b", "c", "d"];

export type PreguntaEntrada = {
  /** Clave estable: entrada.<nombre>. Va en interview_responses.clave_pregunta y en interview_sessions.plan. */
  clave: `entrada.${string}`;
  grupo: Grupo;
  /** Voz de entrevistador, tuteo, una sola pregunta. Lo que el dueño lee o escucha. */
  texto: string;
  /** Cómo se llama el asunto en la síntesis («Cuánto vendes y cuánto te queda»). */
  asunto: string;
  /** La clave de BLOQUES (rules/cobertura.ts) que contiene esta pregunta. Va en interview_responses.bloque. */
  bloque_banco: string;
  /** Preguntas del banco a las que equivale, textuales: si el dueño ya respondió una, esta se confirma. */
  equivale_a: string[];
  /** Qué dato o bloque de la ficha llena. Interno: el cliente nunca lo ve. */
  alimenta: string;
  /** Si un «más o menos» basta como respuesta. */
  acepta_aproximado: boolean;
};

export const PLAN_ENTRADA: PreguntaEntrada[] = [
  // UNA PREGUNTA, UNA COSA (revisión del 16-10-2026, sección 3a). Las doce piden el episodio («el mes pasado», «la
  // última vez») y no traen ejemplos, cifras ni listas: lo que va dentro de la pregunta se devuelve como respuesta.
  // Lo que antes se pedía junto (cuánto vendes Y cuánto te queda) se pide por partes, y la cuenta la hace 8X.
  // (a) empresa y modelo de negocio
  {
    clave: "entrada.negocio_hoy",
    grupo: "a",
    asunto: "Tu negocio hoy",
    texto: "Cuéntame tu negocio hoy: ¿a qué se dedica?",
    bloque_banco: "hoy",
    equivale_a: ["Cuéntame tu negocio hoy: ¿a qué se dedica?"],
    alimenta: "ficha: actividad (dónde y con cuánta gente, si la ficha ya trae el rubro: estadoDePregunta); clasificación del modelo (rules/matrices)",
    acepta_aproximado: false,
  },
  {
    clave: "entrada.que_vende_estrella",
    grupo: "a",
    asunto: "Qué vendes",
    texto: "¿Qué vendes? Dime los nombres, uno por uno.",
    bloque_banco: "hoy",
    equivale_a: ["¿Qué vendes? Dime los nombres, uno por uno."],
    alimenta: "lineas_producto; si ya los sabemos, cuál se vendió más veces el mes pasado. Lo que más deja no se pregunta: sale del precio y el costo",
    acepta_aproximado: false,
  },
  // (b) realidad actual y recursos
  {
    clave: "entrada.ventas_y_ganancia",
    grupo: "b",
    asunto: "Cuánto vendiste el mes pasado",
    texto: "El mes pasado, ¿cuánto vendiste en total?",
    bloque_banco: "hoy",
    equivale_a: ["El mes pasado, ¿cuánto vendiste en total?"],
    alimenta: "company_metricas: venta_mes del mes pasado (de memoria). Lo que queda no se pregunta aquí: es una cuenta, y la hace 8X con las partes",
    acepta_aproximado: true,
  },
  {
    clave: "entrada.principal_problema",
    grupo: "b",
    asunto: "Tu principal problema hoy",
    texto: "Hoy, ¿cuál es el principal problema de tu negocio, el que más te quita el sueño?",
    bloque_banco: "hoy",
    equivale_a: ["¿Qué es lo que más te preocupa del negocio hoy?"],
    alimenta: "ficha de dirección: decisiones pendientes y distancia",
    acepta_aproximado: false,
  },
  {
    clave: "entrada.que_se_detiene_sin_mi",
    grupo: "b",
    asunto: "Lo que espera cuando faltas",
    texto: "La última vez que faltaste al negocio, ¿qué se quedó esperando hasta que volviste?",
    bloque_banco: "dependencia",
    equivale_a: ["La última vez que faltaste al negocio, ¿qué se quedó esperando hasta que volviste?"],
    alimenta: "ficha de dirección: dependencia del propietario (descripción, no índice)",
    acepta_aproximado: false,
  },
  // (c) visión y vida deseada del propietario
  {
    clave: "entrada.vision_3_anios",
    grupo: "c",
    asunto: "Tu negocio dentro de tres años",
    texto: "Si dentro de tres años todo sale bien y yo visito tu negocio, ¿qué veo?",
    bloque_banco: "empresa_deseada",
    equivale_a: ["Si dentro de tres años todo sale bien y yo visito tu negocio, ¿qué veo?"],
    alimenta: "ficha de dirección: empresa deseada",
    acepta_aproximado: false,
  },
  {
    clave: "entrada.rol_futuro",
    grupo: "c",
    asunto: "Qué harás tú",
    texto: "Ese día, dentro de tres años, ¿qué haces tú en el negocio?",
    bloque_banco: "empresa_deseada",
    equivale_a: ["Ese día, dentro de tres años, ¿qué haces tú en el negocio?"],
    alimenta: "ficha de dirección: rol futuro del propietario",
    acepta_aproximado: false,
  },
  {
    clave: "entrada.dinero_tranquilo",
    grupo: "c",
    asunto: "Cuánto necesitas al mes para estar tranquilo",
    texto: "¿Cuánto tendría que quedarte al mes, libre, para estar tranquilo?",
    bloque_banco: "exito",
    equivale_a: ["¿Cuánto dinero tendría que quedarte al mes para estar tranquilo?"],
    alimenta: "ficha de dirección: resultado deseado (meta de ganancia mensual)",
    acepta_aproximado: true,
  },
  {
    clave: "entrada.no_sacrifica",
    grupo: "c",
    asunto: "Lo que no sacrificas",
    texto: "¿Qué no estás dispuesto a sacrificar por hacer crecer el negocio?",
    bloque_banco: "proposito",
    equivale_a: ["¿Qué no estás dispuesto a sacrificar por crecer?"],
    alimenta: "ficha de dirección: límites",
    acepta_aproximado: false,
  },
  // (d) historia, fortalezas y oportunidades
  {
    clave: "entrada.mejor_resultado_anterior",
    grupo: "d",
    asunto: "Tu mejor época",
    texto: "En el mejor mes de toda la historia de tu negocio, ¿cuánto vendiste?",
    bloque_banco: "epoca_dorada",
    equivale_a: ["En esa época, ¿cuánto vendías al mes?"],
    alimenta: "company_metricas: venta_mes en el periodo epoca_dorada",
    acepta_aproximado: true,
  },
  {
    clave: "entrada.que_funciona",
    grupo: "d",
    asunto: "Lo que funciona bien",
    texto: "¿Qué parte de tu negocio funciona especialmente bien, eso que no cambiarías?",
    bloque_banco: "hoy",
    equivale_a: ["¿Qué parte del negocio funciona especialmente bien?"],
    alimenta: "ficha de dirección: fortalezas",
    acepta_aproximado: false,
  },
  {
    clave: "entrada.recursos_desaprovechados",
    grupo: "d",
    asunto: "Lo que tienes y no usas",
    texto: "La semana pasada, ¿qué máquina o espacio del negocio no se usó?",
    bloque_banco: "recursos",
    equivale_a: ["La semana pasada, ¿qué máquina o espacio del negocio no se usó?"],
    // Es INTERNO: lo que la empresa tiene y no usa va al mapa de recursos, no a «oportunidades», que son de afuera.
    alimenta: "ficha de dirección: recursos sin usar (interno; no es una oportunidad)",
    acepta_aproximado: false,
  },
];

export const CLAVES_PLAN: string[] = PLAN_ENTRADA.map((p) => p.clave);
export const PLAN_POR_CLAVE = new Map(PLAN_ENTRADA.map((p) => [p.clave as string, p]));

/** Las respuestas que no escribe el dueño: las ponen los botones. Son texto, nunca un número. */
export const TEXTO_NO_LO_SE = "No lo sé.";
export const TEXTO_CONFIRMA = "Sí, es así.";
export const TEXTO_DOCUMENTO = "Lo respondo con el documento que subí.";
export const SABIDA_POR_DOCUMENTO = "un documento que subiste en la entrada";

/** Así empieza la pregunta de una fila que es corrección del dueño a su propia respuesta, hecha en la síntesis. */
export const PREFIJO_CORRECCION = "Corrección a «";

/**
 * Con qué pregunta termina una confirmación. Si la pregunta abierta termina así, un «sí» basta y la pantalla
 * ofrece el botón; si termina de otro modo (falta una parte del dato), hay que responder con palabras.
 */
export const CIERRES_CONFIRMACION = ["¿Es así?", "¿Es así hoy?", "¿Sigue siendo así?"] as const;

const PISTA_MIGRACION = "¿falta aplicar supabase/migracion-entrada-y-direccion.sql? Va ANTES que este código";

/**
 * Las columnas que este archivo lee de cada tabla. Están juntas y exportadas para que la prueba sobre Postgres
 * embebido (tests/entrada.test.ts) compruebe que todas existen en el esquema aplicado: si alguien renombra
 * una, falla la prueba y no la pantalla del dueño.
 */
export const COLUMNAS = {
  interview_sessions: "id,company_id,participant_id,estado,plan,sintesis,sintesis_confirmada_at",
  interview_responses: "id,clave_pregunta,pregunta,respuesta,certeza,sabida_por,orden,respondido_at,respuesta_audio_path,bloque,created_at",
  companies: "ficha,pais,moneda,idioma,zona_horaria",
  company_metricas: "clave,periodo,valor,estado,source_id,response_id",
  sources: "id,nombre,tipo,origen",
  lineas_producto: "nombre,source_id",
  claims: "response_id",
} as const;

/** Una regla de la entrada que no se cumple: la ruta la devuelve con su mensaje y su código, sin 500. */
export class ReglaEntrada extends Error {
  constructor(
    mensaje: string,
    readonly status: 400 | 403 | 404 | 409 = 400
  ) {
    super(mensaje);
    this.name = "ReglaEntrada";
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Puro: el banco, la igualdad de preguntas, el orden del plan, el progreso, qué se extrae y qué no.
// ---------------------------------------------------------------------------------------------------------------

/** El bloque del banco (de cualquier tipo de sesión) con esa clave, o null si no existe. */
export function bloqueDelBanco(clave: string): Bloque | null {
  for (const bloques of Object.values(BLOQUES)) {
    const b = bloques.find((x) => x.clave === clave);
    if (b) return b;
  }
  return null;
}

const palabras = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((w) => w.length > 3);

/**
 * Dos preguntas son «la misma» si comparten la mayoría de sus palabras significativas. Es la regla de
 * `preguntaRepetida` (jobs/handlers/entrevista.ts) repetida aquí para no arrastrar al worker a esta capa.
 */
/** La misma pregunta de verdad: las mismas palabras significativas, en cualquier orden. Sin umbral. */
export function preguntaIdentica(a: string, b: string): boolean {
  const A = [...new Set(palabras(a))].sort().join(" ");
  const B = [...new Set(palabras(b))].sort().join(" ");
  return A.length > 0 && A === B;
}

export function mismaPregunta(a: string, b: string): boolean {
  const A = new Set(palabras(a));
  const B = new Set(palabras(b));
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size) >= 0.6;
}

export type FilaEntrada = {
  id: string;
  clave_pregunta: string | null;
  pregunta: string;
  respuesta: string | null;
  certeza: Certeza | null;
  sabida_por: string | null;
  orden: number | null;
  respondido_at: string | null;
  respuesta_audio_path?: string | null;
  bloque?: string | null;
  created_at?: string | null;
};

const porOrden = (a: Pick<FilaEntrada, "orden">, b: Pick<FilaEntrada, "orden">) => (a.orden ?? 0) - (b.orden ?? 0);

/** El plan guardado en la sesión, o el plan vigente si no hay ninguno; solo claves que existen. */
export function planDe(plan: unknown): string[] {
  const lista = Array.isArray(plan) ? plan.filter((c): c is string => typeof c === "string" && PLAN_POR_CLAVE.has(c)) : [];
  return lista.length ? lista : CLAVES_PLAN;
}

/** ¿Esta fila es una corrección hecha en la síntesis, y no la respuesta original? */
export function esCorreccion(f: Pick<FilaEntrada, "pregunta">): boolean {
  return f.pregunta.startsWith(PREFIJO_CORRECCION);
}

/** ¿La pregunta se responde con un «sí»? Solo las confirmaciones completas terminan con uno de los cierres. */
export function esConfirmacion(pregunta: string): boolean {
  const t = pregunta.trim();
  return CIERRES_CONFIRMACION.some((c) => t.endsWith(c));
}

/**
 * La pregunta abierta de la sesión: la primera fila sin respuesta, por orden, de una clave del plan que
 * todavía no tiene respuesta. Una fila abierta de una clave ya respondida es el sobrante de dos aperturas
 * simultáneas (dos pestañas, la ruta y el worker a la vez): se ignora, no se le vuelve a preguntar al dueño.
 */
export function preguntaAbiertaDe<T extends Pick<FilaEntrada, "clave_pregunta" | "respuesta" | "orden">>(plan: string[], filas: T[]): T | null {
  const respondidas = new Set(filas.filter((f) => f.respuesta !== null).map((f) => f.clave_pregunta));
  const abiertas = filas.filter((f) => f.respuesta === null && !!f.clave_pregunta && plan.includes(f.clave_pregunta) && !respondidas.has(f.clave_pregunta));
  return abiertas.sort(porOrden)[0] ?? null;
}

/** La primera clave del plan que no tiene fila (abierta o respondida). En orden: el plan manda, no el modelo. */
export function siguienteClave(plan: string[], filas: Pick<FilaEntrada, "clave_pregunta">[]): string | null {
  const hechas = new Set(filas.map((f) => f.clave_pregunta).filter(Boolean));
  return plan.find((c) => !hechas.has(c)) ?? null;
}

/** «n de 12»: claves del plan con al menos una respuesta. Una pregunta abierta no cuenta. */
export function progresoEntrada(plan: string[], filas: Pick<FilaEntrada, "clave_pregunta" | "respuesta">[]): { respondidas: number; total: number } {
  const respondidas = new Set(filas.filter((f) => f.respuesta !== null && f.clave_pregunta && plan.includes(f.clave_pregunta)).map((f) => f.clave_pregunta));
  return { respondidas: respondidas.size, total: plan.length };
}

/**
 * La cobertura de una sesión de entrada con la forma que usa cualquier entrevista (rules/cobertura.ts): el
 * porcentaje es «respondidas de doce» y las áreas son los cuatro grupos, cada uno cubierto cuando todas sus
 * preguntas tienen respuesta. Así la pantalla general de conversación no muestra un número sin sentido.
 */
export function coberturaEntrada(plan: string[], filas: Pick<FilaEntrada, "clave_pregunta" | "respuesta">[]): CoberturaSesion {
  const { respondidas, total } = progresoEntrada(plan, filas);
  const hechas = new Set(filas.filter((f) => f.respuesta !== null).map((f) => f.clave_pregunta));
  const areas: CoberturaSesion["areas"] = [];
  for (const g of ORDEN_GRUPOS) {
    const claves = plan.filter((c) => PLAN_POR_CLAVE.get(c)?.grupo === g);
    if (claves.length) areas.push({ clave: g, nombre: GRUPOS[g], cubierta: claves.every((c) => hechas.has(c)) });
  }
  return { porcentaje: total ? Math.round((respondidas / total) * 100) : 100, areas };
}

/**
 * ¿Se manda esta respuesta al extractor? Un «no lo sé» no: no hay nada que extraer y el modelo podría
 * inventar un cero. Las confirmaciones y el «lo respondo con un documento» tampoco (extraer = false): lo
 * que dicen ya está en otra parte. Todo lo demás, sí: el modelo extrae, igual que en cualquier entrevista.
 */
export function debeExtraer(certeza: Certeza | null | undefined, extraer = true): boolean {
  if (certeza === "no_lo_se") return false;
  return extraer;
}

/** Minúsculas, sin tildes ni signos: para comparar lo que alguien escribió o dijo con una frase hecha. */
const llano = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const MULETILLA = "(?:pues|mmm+|eh+|uy|ay|bueno|mira|eso|la verdad(?: es)?(?: que)?|sinceramente|no|ahorita|ahora|todavia|aun)";
const NO_LO_SE = new RegExp(
  `^(?:${MULETILLA} )*(?:no (?:lo )?se|no (?:lo )?sabria(?: decir(?:te|lo|telo)?)?|ni idea|no tengo (?:ni )?(?:la menor )?idea|no (?:lo )?tengo claro)(?: (?:la verdad|todavia|aun|ahora|ahorita|bien|exactamente|con exactitud|de memoria|pues|sinceramente))*$`
);

/**
 * ¿La respuesta —escrita, o dicha y pasada a texto— es solo un «no sé»? Entonces vale lo mismo que tocar el
 * botón: certeza no_lo_se y nada al extractor. Cuenta dicho como se dice hablando («No, no lo sé», «la verdad,
 * ni idea», «no lo sé todavía»). «No sé, serán unos 40 mil» no lo es: ahí hay un dato y se trata como respuesta.
 */
export function esSoloNoLoSe(texto: string): boolean {
  return NO_LO_SE.test(llano(texto));
}

const SI = "(?:si|asi es|es asi|asi mismo|correcto|es correcto|exacto|exactamente|efectivamente|eso es|cierto|es cierto|es verdad|claro|claro que si|ok|okey|esta bien|esta correcto|sigue siendo asi|sigue igual|tal cual)";
const SOLO_SI = new RegExp(`^(?:(?:pues|mmm+|eh+|bueno|mira) )*${SI}(?: (?:${SI}|pues|senor|senora|senorita))*$`);

/**
 * ¿La respuesta es solo un «sí»? («Sí», «así es», «sí, correcto»). Ante una confirmación vale lo mismo que tocar
 * «Sí, es así». «Sí, pero ahora vendo menos» no lo es: ahí hay algo más y se trata como respuesta.
 */
export function esSoloSi(texto: string): boolean {
  return SOLO_SI.test(llano(texto));
}

/** Qué fue lo que el dueño respondió: que no lo sabe, que lo que ya sabíamos es así, o algo con sus palabras. */
export type Trato = "no_lo_se" | "confirma" | "palabras";

/**
 * Lo que el dueño escribe o dice se mira igual que si hubiera tocado el botón. Pura. Un «sí» solo cuenta como
 * confirmación cuando la pregunta lo era («…¿Es así?»): ante cualquier otra pregunta, «sí» son palabras.
 */
export function tratoDeRespuesta(fila: Pick<FilaEntrada, "pregunta" | "sabida_por">, texto: string): Trato {
  if (esSoloNoLoSe(texto)) return "no_lo_se";
  if (fila.sabida_por && esConfirmacion(fila.pregunta) && esSoloSi(texto)) return "confirma";
  return "palabras";
}

/**
 * La pregunta que acompaña a las palabras del dueño cuando van al extractor. Si la que se le mostró traía algo
 * que ya sabíamos por otra fuente («Por tu archivo entendimos que vendes unos 80.000…»), es la del plan: sin
 * cifras ni nombres que el dueño no dijo. Null si la pregunta mostrada ya era la del plan o no traía nada sabido.
 */
export function preguntaParaExtraer(fila: Pick<FilaEntrada, "pregunta" | "sabida_por" | "clave_pregunta">): string | null {
  if (!fila.sabida_por || !fila.clave_pregunta) return null;
  const item = PLAN_POR_CLAVE.get(fila.clave_pregunta);
  return item && item.texto !== fila.pregunta ? item.texto : null;
}

const NUMERO_DICHO: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20 };
const CUANTOS = `(\\d{1,3}|${Object.keys(NUMERO_DICHO).join("|")})`;
const MAS_O_MENOS = "(?:como |unos |unas |aproximadamente |mas o menos |casi )?";
const GENTE = "(?:personas?|trabajador(?:es|as?)?|emplead[oa]s?|colaborador(?:es|as?)?|ayudantes?)";
// Lo que sigue a la cantidad y dice que NO es la gente que trabaja, o que la cuenta no terminó ahí («somos cuatro y mi esposa»).
const NO_ES_GENTE = "(?! (?:y|socios|socias|hermanos|hermanas|locales|tiendas|sedes|sucursales|puestos|dias|horas|turnos|anos|meses|semanas|veces|mil|millones)\\b)";
const FORMAS_DE_DECIR_CUANTOS = [
  new RegExp(`\\bsomos ${MAS_O_MENOS}${CUANTOS}\\b${NO_ES_GENTE}`),
  new RegExp(`\\b(?:trabajamos|trabajan) ${MAS_O_MENOS}${CUANTOS}\\b${NO_ES_GENTE}`),
  new RegExp(`\\b(?:con|tengo|tenemos|hay|son) ${MAS_O_MENOS}${CUANTOS} ${GENTE}\\b`),
  // «treinta y dos empleados» no son dos: una cantidad que viene detrás de una «y» no se toma suelta.
  new RegExp(`(?<!\\by )\\b${CUANTOS} (?!personas?\\b)${GENTE}\\b`),
];
const TRABAJA_SOLA = /\byo sol[oa]\b|\bsol[oa] yo\b|\b(?:trabajo|atiendo|estoy) sola\b/;

/**
 * Cuánta gente trabaja en el negocio, si la respuesta lo dice SIN ambigüedad: una sola cantidad en todo el
 * texto y dicha de una forma que solo puede ser eso («somos cuatro», «con 8 personas», «12 trabajadores», «yo
 * sola»). Pura y en código: el modelo no interviene. Ante la duda —dos cantidades, «somos tres hermanos»,
 * «atiendo a 200 personas»— devuelve null: un dato que falta no se rellena adivinando.
 */
export function personasDichas(texto: string): number | null {
  const t = llano(texto);
  const cantidades = t.match(new RegExp(`\\b${CUANTOS}\\b`, "g")) ?? [];
  if (!cantidades.length) return TRABAJA_SOLA.test(t) ? 1 : null;
  if (cantidades.length > 1) return null;
  for (const forma of FORMAS_DE_DECIR_CUANTOS) {
    const m = t.match(forma);
    if (!m) continue;
    const n = NUMERO_DICHO[m[1]] ?? Number(m[1]);
    return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
  }
  return null;
}

export function recorte(texto: string, max = 180): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * Un monto con la moneda que la empresa declaró (src/lib/formato.ts). Si la moneda declarada no vale, se
 * escribe el número solo: una pregunta no se cae por una configuración mal puesta.
 */
export function montoDe(valor: number, cfg: ConfigEmpresa = porDefecto): string {
  try {
    return moneda(Math.round(valor), cfg);
  } catch {
    return numero(Math.round(valor), porDefecto);
  }
}

const enMayuscula = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const enMinuscula = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** «pan», «pan y torta», «pan, torta y café»: una lista como se dice hablando. */
export function enumerar(cosas: string[]): string {
  if (cosas.length <= 1) return cosas[0] ?? "";
  return `${cosas.slice(0, -1).join(", ")} y ${cosas[cosas.length - 1]}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Lo que ya sabíamos: se confirma, no se pregunta de nuevo.
// ---------------------------------------------------------------------------------------------------------------

export type MetricaConocida = { clave: string; periodo: string; valor: number | string | null; estado: string | null; source_id: string | null; response_id: string | null };
export type FuenteConocida = { nombre: string; tipo: string | null; origen: string | null };
export type RespuestaPrevia = { id: string; pregunta: string; respuesta: string; bloque: string | null; certeza: Certeza | null; tipo_sesion: string };
export type LineaConocida = { nombre: string; source_id: string | null };

export type Conocido = {
  /** La ficha que la empresa llenó al crearse (companies.ficha). */
  ficha: Record<string, string>;
  /** País, moneda, idioma y zona horaria que la empresa declaró; Perú donde falte. */
  config: ConfigEmpresa;
  /** Números con valor. Un número sin valor no es un cero: no entra. */
  metricas: MetricaConocida[];
  /** Documentos, fotos y notas que la empresa entregó, por id. */
  fuentes: Map<string, FuenteConocida>;
  /** Lo que vende, si ya salió de un documento o lo cargó la consultora (lineas_producto). */
  lineas: LineaConocida[];
  /** Respuestas ya dadas por la empresa en otras sesiones (no en la entrada). */
  respuestas: RespuestaPrevia[];
  /** Respuestas que produjeron al menos una afirmación confirmada. */
  conClaim: Set<string>;
};

/** Nada sabido todavía. Sirve de base a las pruebas y a una empresa recién creada. */
export function conocidoVacio(parcial: Partial<Conocido> = {}): Conocido {
  return { ficha: {}, config: { ...porDefecto }, metricas: [], fuentes: new Map(), lineas: [], respuestas: [], conClaim: new Set(), ...parcial };
}

const conValor = (v: unknown) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/** Reúne lo que la empresa ya contó o mostró: ficha, números con valor, documentos leídos, lo que vende, respuestas y afirmaciones confirmadas. */
export async function conocimientoPrevio(companyId: string, sb: Sb): Promise<Conocido> {
  const [{ data: emp }, { data: met }, { data: src }, { data: lin }, { data: resp }, { data: cl }] = await Promise.all([
    sb.from("companies").select(COLUMNAS.companies).eq("id", companyId).maybeSingle(),
    sb.from("company_metricas").select(COLUMNAS.company_metricas).eq("company_id", companyId),
    sb.from("sources").select(COLUMNAS.sources).eq("company_id", companyId),
    sb.from("lineas_producto").select(COLUMNAS.lineas_producto).eq("company_id", companyId).order("created_at").limit(6),
    sb.from("interview_responses").select("id,pregunta,respuesta,bloque,certeza, interview_sessions!inner(tipo,company_id)").eq("interview_sessions.company_id", companyId).not("respuesta", "is", null),
    sb.from("claims").select(COLUMNAS.claims).eq("company_id", companyId).eq("estado", "confirmado").not("response_id", "is", null),
  ]);
  const empresa = (emp ?? null) as ({ ficha?: Record<string, string> | null } & Partial<Record<keyof ConfigEmpresa, unknown>>) | null;
  const fuentes = new Map<string, FuenteConocida>();
  for (const s of (src ?? []) as { id: string; nombre: string; tipo: string | null; origen: string | null }[]) {
    fuentes.set(s.id, { nombre: s.nombre, tipo: s.tipo, origen: s.origen ?? null });
  }
  const respuestas: RespuestaPrevia[] = ((resp ?? []) as Record<string, unknown>[])
    .map((r) => {
      const ses = r.interview_sessions as { tipo: string } | { tipo: string }[] | null;
      const tipo = Array.isArray(ses) ? ses[0]?.tipo : ses?.tipo;
      return {
        id: String(r.id),
        pregunta: String(r.pregunta ?? ""),
        respuesta: String(r.respuesta ?? ""),
        bloque: (r.bloque as string | null) ?? null,
        certeza: (r.certeza as Certeza | null) ?? null,
        tipo_sesion: tipo ?? "",
      };
    })
    .filter((r) => r.tipo_sesion !== "entrada_breve" && r.respuesta.trim());
  return {
    ficha: (empresa?.ficha ?? {}) as Record<string, string>,
    config: configDe(empresa),
    metricas: ((met ?? []) as MetricaConocida[]).filter((m) => conValor(m.valor)),
    fuentes,
    lineas: ((lin ?? []) as LineaConocida[]).filter((l) => typeof l.nombre === "string" && l.nombre.trim()),
    respuestas,
    conClaim: new Set(((cl ?? []) as { response_id: string | null }[]).map((c) => c.response_id).filter((x): x is string => !!x)),
  };
}

export type EstadoPregunta = {
  clave: string;
  estado: "pendiente" | "sabida";
  /** Lo que se le pregunta al dueño: la pregunta del plan, o la confirmación de lo que ya sabíamos. */
  texto: string;
  /** Por qué ya lo sabíamos («tu archivo «ventas.xlsx»»). Null si está pendiente. */
  sabida_por: string | null;
  /** true si un «sí» basta; false si a lo sabido le falta una parte y hay que responderla con palabras. */
  basta_confirmar: boolean;
};

const ES_MES = /^\d{4}-\d{2}$/;
const NO_LO_SABE = /^\s*no\s+(lo\s+)?s[eé]\b/i;

/** Cómo se le nombra al dueño el lugar de donde salió un dato. */
function nombreDeFuente(sourceId: string | null, c: Conocido): string | null {
  const f = sourceId ? c.fuentes.get(sourceId) : null;
  if (!f) return null;
  if (f.origen === "consultor") return `el archivo «${f.nombre}» que cargó tu consultor`;
  if (f.tipo === "foto") return `tu foto «${f.nombre}»`;
  if (f.tipo === "audio") return `tu nota de voz «${f.nombre}»`;
  return `tu archivo «${f.nombre}»`;
}

function fuenteDeMetrica(m: MetricaConocida, c: Conocido): string {
  return nombreDeFuente(m.source_id, c) ?? (m.response_id ? "lo que ya nos contaste" : "los números que registraste");
}

/**
 * El número más reciente de esa clave, sin contar la mejor época. Solo vale uno mayor que cero: un cero
 * guardado no se le lee al dueño como «vendes cero»; se le pregunta.
 */
function ultimaMetrica(c: Conocido, clave: string): MetricaConocida | null {
  const filas = c.metricas.filter((m) => m.clave === clave && m.periodo !== "epoca_dorada" && Number(m.valor) > 0);
  if (!filas.length) return null;
  const meses = filas.filter((m) => ES_MES.test(m.periodo)).sort((a, b) => b.periodo.localeCompare(a.periodo));
  return meses[0] ?? filas[0];
}

/** Una respuesta anterior a una pregunta equivalente, si la hubo y dijo algo (no un «no sé»). */
function respuestaEquivalente(item: PreguntaEntrada, c: Conocido): RespuestaPrevia | null {
  const candidatas = [item.texto, ...item.equivale_a];
  return (
    c.respuestas.find((r) => {
      if (r.certeza === "no_lo_se" || NO_LO_SABE.test(r.respuesta)) return false;
      // Solo la MISMA pregunta (mismas palabras significativas), no una parecida: con el 60 % de coincidencia una
      // respuesta sobre el rol de hoy se le mostraba al dueño como si fuera su rol futuro (sonda del verificador).
      if (!candidatas.some((q) => preguntaIdentica(q, r.pregunta))) return false;
      return c.conClaim.has(r.id) || r.respuesta.trim().length >= 40;
    }) ?? null
  );
}

/**
 * Cuando ya sabemos qué vende: la pregunta que sigue, por el episodio y no por la opinión sobre el margen. Empieza
 * con «¿» a propósito: la síntesis separa lo sabido de la pregunta quitando la última «¿…?» (afirmacionDe).
 */
export const CUAL_SE_VENDIO_MAS = "¿Cuál de esos vendiste más veces el mes pasado?";

/**
 * Regla por pregunta, en código. Lo sabido vuelve como una afirmación con su fuente y UNA pregunta al final:
 * «¿Es así?» cuando lo sabemos entero, o la pregunta por la parte que falta cuando lo sabemos a medias. Lo
 * que la ficha dice a medias no se ignora ni se vuelve a pedir: se trae a la pregunta.
 */
export function estadoDePregunta(item: PreguntaEntrada, c: Conocido): EstadoPregunta {
  const pendiente = (texto = item.texto): EstadoPregunta => ({ clave: item.clave, estado: "pendiente", texto, sabida_por: null, basta_confirmar: false });
  const sabida = (afirmacion: string, por: string, cierre: string = CIERRES_CONFIRMACION[0]): EstadoPregunta => {
    const texto = `${afirmacion} ${cierre}`;
    return { clave: item.clave, estado: "sabida", texto, sabida_por: por, basta_confirmar: esConfirmacion(texto) };
  };
  const f = c.ficha;

  if (item.clave === "entrada.negocio_hoy" && f.actividad) {
    const personas = f.personas ? `con ${f.personas} persona${f.personas.trim() === "1" ? "" : "s"}` : null;
    const partes = [`tu negocio es ${f.actividad}`, f.ciudad ? `en ${f.ciudad}` : null, personas].filter(Boolean).join(", ");
    if (f.ciudad && f.personas) return sabida(`Al crear tu empresa nos dijiste que ${partes}.`, "lo que escribiste al crear tu empresa", CIERRES_CONFIRMACION[1]);
    // Sabemos el rubro (y quizá la ciudad): no se piden otra vez. Se pregunta lo que falta, una sola cosa: primero
    // con cuánta gente (de ahí sale `personas` para la ficha) y, si eso ya está, dónde atiende.
    const falta = f.personas ? "Hoy, ¿dónde atiendes a tus clientes?" : "Hoy, ¿con cuánta gente trabajas?";
    return pendiente(`Al crear tu empresa nos dijiste que ${partes}. ${falta}`);
  }

  if (item.clave === "entrada.ventas_y_ganancia") {
    const venta = ultimaMetrica(c, "venta_mes");
    if (venta) {
      const porVenta = fuenteDeMetrica(venta, c);
      const ganancia = ultimaMetrica(c, "ganancia_mes");
      const base = `Por ${porVenta} entendimos que vendes unos ${montoDe(Number(venta.valor), c.config)} al mes`;
      // Lo que queda no se pregunta de memoria: es una cuenta y la hace 8X con las partes (revisión del 16-10, 3a).
      if (!ganancia) return sabida(`${base}.`, porVenta);
      const porGanancia = fuenteDeMetrica(ganancia, c);
      const queda = `te quedan unos ${montoDe(Number(ganancia.valor), c.config)}`;
      return porGanancia === porVenta ? sabida(`${base} y que ${queda}.`, porVenta) : sabida(`${base} y, por ${porGanancia}, que ${queda}.`, `${porVenta} y ${porGanancia}`);
    }
  }

  if (item.clave === "entrada.mejor_resultado_anterior") {
    const dorada = c.metricas.find((m) => m.clave === "venta_mes" && m.periodo === "epoca_dorada" && Number(m.valor) > 0);
    if (dorada) {
      const por = fuenteDeMetrica(dorada, c);
      return sabida(`Por ${por} sabemos que en tu mejor época vendías unos ${montoDe(Number(dorada.valor), c.config)} al mes.`, por);
    }
  }

  const previa = respuestaEquivalente(item, c);
  if (previa) return sabida(`Antes nos contaste: «${recorte(previa.respuesta, 160)}».`, "una conversación anterior contigo", CIERRES_CONFIRMACION[2]);

  if (item.clave === "entrada.que_vende_estrella") {
    // Lo que vende ya lo sabemos: se pregunta la siguiente cosa, una sola. Lo que más deja no se pregunta: sale del
    // precio y del costo de cada uno.
    if (f.productos) return pendiente(`Al crear tu empresa pusiste que vendes ${f.productos}. ${CUAL_SE_VENDIO_MAS}`);
    if (c.lineas.length) {
      const por = nombreDeFuente(c.lineas[0].source_id, c) ?? "lo que ya tenemos de tu empresa";
      const nombres = enumerar(c.lineas.slice(0, 4).map((l) => l.nombre.trim()));
      const mas = c.lineas.length > 4 ? ", entre otras cosas" : "";
      // Lo que vende ya lo sabíamos por otra fuente: se dice con su origen, y a un «sí» le faltaría el resto.
      return sabida(`Por ${por} vimos que vendes ${nombres}${mas}.`, por, CUAL_SE_VENDIO_MAS);
    }
  }
  return pendiente();
}

/** Para cada pregunta del plan: pendiente, o sabida con su fuente y su texto de confirmación. */
export async function preguntasPendientes(companyId: string, sb: Sb, conocido?: Conocido): Promise<EstadoPregunta[]> {
  const c = conocido ?? (await conocimientoPrevio(companyId, sb));
  return PLAN_ENTRADA.map((item) => estadoDePregunta(item, c));
}

// ---------------------------------------------------------------------------------------------------------------
// La sesión: de quién es, crearla, abrir la siguiente pregunta, cerrarla con la síntesis.
// ---------------------------------------------------------------------------------------------------------------

export type SesionEntrada = {
  id: string;
  company_id: string;
  participant_id: string;
  estado: string;
  plan: unknown;
  /** Con la sesión cerrada, la síntesis armada. Antes de cerrar puede traer solo `mostradas` (SintesisEnCurso). */
  sintesis: Sintesis | null;
  sintesis_confirmada_at: string | null;
};

const COLS_SESION = COLUMNAS.interview_sessions;
const COLS_FILA = COLUMNAS.interview_responses;
const ROLES_DUENO = ["dueno", "socio"];

/** El participante de esta cuenta en la empresa, solo para mirar: no enlaza ni crea nada. */
export async function participanteDe(companyId: string, userId: string, sb: Sb): Promise<string | null> {
  const { data } = await sb.from("participants").select("id").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  return data ? String((data as { id: string }).id) : null;
}

/** El participante del dueño para esta cuenta: el suyo, el dueño sin cuenta que se enlaza, o uno nuevo. */
export async function asegurarParticipante(companyId: string, perfil: { id: string; nombre: string | null }, sb: Sb): Promise<string> {
  const propio = await participanteDe(companyId, perfil.id, sb);
  if (propio) return propio;
  const { data: libre } = await sb.from("participants").select("id").eq("company_id", companyId).in("rol", ROLES_DUENO).is("user_id", null).order("created_at").limit(1).maybeSingle();
  if (libre) {
    const id = String((libre as { id: string }).id);
    const { error } = await sb.from("participants").update({ user_id: perfil.id }).eq("id", id);
    if (error) throw new Error(`No pudimos enlazar tu cuenta con tu empresa: ${error.message}`);
    return id;
  }
  const { data: nuevo, error } = await sb
    .from("participants")
    .insert({ company_id: companyId, nombre: perfil.nombre ?? "Dueño", puesto: "Dueño", rol: "dueno", user_id: perfil.id })
    .select("id")
    .single();
  if (error || !nuevo) throw new Error(`No pudimos registrar al dueño de la empresa: ${error?.message ?? "sin fila"}`);
  return String((nuevo as { id: string }).id);
}

/** ¿Esta cuenta es dueña de la empresa? La entrada la responde el dueño, no cualquier persona con acceso. */
export async function esDueno(companyId: string, userId: string, sb: Sb): Promise<boolean> {
  const { data, error } = await sb.from("memberships").select("nivel").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`No se pudo comprobar tu participación en la empresa: ${error.message}`);
  return (data as { nivel?: string } | null)?.nivel === "dueno";
}

/**
 * La entrada de la empresa: una sola, la primera que se creó. Si la migración no está aplicada la consulta
 * falla y aquí se dice, en vez de devolver «no hay entrada» y crear otra encima.
 */
export async function sesionEntradaDeEmpresa(companyId: string, sb: Sb): Promise<SesionEntrada | null> {
  const { data, error } = await sb.from("interview_sessions").select(COLS_SESION).eq("company_id", companyId).eq("tipo", "entrada_breve").order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(`No se pudo leer la entrada de la empresa (${PISTA_MIGRACION}): ${error.message}`);
  return (data as SesionEntrada | null) ?? null;
}

/** La sesión de entrada de la empresa: la que hay, o una nueva con el plan vigente y este participante. Idempotente. */
export async function asegurarSesionEntrada(companyId: string, participantId: string, sb: Sb): Promise<SesionEntrada> {
  const existente = await sesionEntradaDeEmpresa(companyId, sb);
  if (existente) return existente;
  const { data, error } = await sb
    .from("interview_sessions")
    .insert({ company_id: companyId, participant_id: participantId, tipo: "entrada_breve", plan: CLAVES_PLAN })
    .select(COLS_SESION)
    .single();
  if (error || !data) throw new Error(`No se pudo crear la entrada (${PISTA_MIGRACION}): ${error?.message ?? "sin fila"}`);
  return data as SesionEntrada;
}

export async function filasDeSesion(sessionId: string, sb: Sb): Promise<FilaEntrada[]> {
  const { data, error } = await sb.from("interview_responses").select(COLS_FILA).eq("session_id", sessionId).order("orden");
  if (error) throw new Error(`No se pudieron leer las respuestas de la entrada (${PISTA_MIGRACION}): ${error.message}`);
  return ((data ?? []) as FilaEntrada[]).slice().sort(porOrden);
}

async function leerSesion(sessionId: string, sb: Sb): Promise<SesionEntrada> {
  const { data, error } = await sb.from("interview_sessions").select(COLS_SESION).eq("id", sessionId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la entrada (${PISTA_MIGRACION}): ${error.message}`);
  if (!data) throw new Error("Sesión no encontrada");
  return data as SesionEntrada;
}

export type SiguienteAbierta = { abierta: FilaEntrada | null; cerrada: boolean; motivo: string | null };

/**
 * Abre la siguiente pregunta del plan, o cierra la sesión con su síntesis si ya no queda ninguna. Lo decide el
 * plan, no el modelo; y es idempotente: si ya hay una pregunta abierta, la devuelve y no inserta nada. Lo
 * llaman `pedirSiguiente` (en la misma petición, para que el dueño no espere a la cola) y el worker (rama
 * entrada_breve de jobs/handlers/entrevista.ts, cuando termina de transcribir un audio).
 */
export async function abrirSiguientePregunta(sessionId: string, sb: Sb): Promise<SiguienteAbierta> {
  const sesion = await leerSesion(sessionId, sb);
  const plan = planDe(sesion.plan);
  const filas = await filasDeSesion(sessionId, sb);
  const yaAbierta = preguntaAbiertaDe(plan, filas);
  if (yaAbierta) return { abierta: yaAbierta, cerrada: false, motivo: "ya hay pregunta abierta" };

  const clave = siguienteClave(plan, filas);
  if (!clave) {
    if (sesion.estado !== "completa") {
      const { error } = await sb.from("interview_sessions").update({ estado: "completa", sintesis: armarSintesis(filas, plan, {}, mostradasDe(sesion.sintesis)) }).eq("id", sessionId);
      if (error) throw new Error(`No se pudo cerrar la entrada con su síntesis (${PISTA_MIGRACION}): ${error.message}`);
    }
    return { abierta: null, cerrada: true, motivo: null };
  }

  const item = PLAN_POR_CLAVE.get(clave)!;
  const est = estadoDePregunta(item, await conocimientoPrevio(sesion.company_id, sb));
  const orden = filas.reduce((m, f) => Math.max(m, f.orden ?? 0), 0) + 1;
  const { data: nueva, error } = await sb
    .from("interview_responses")
    .insert({ session_id: sessionId, bloque: item.bloque_banco, pregunta: est.texto, clave_pregunta: clave, sabida_por: est.sabida_por, orden })
    .select(COLS_FILA)
    .single();
  if (error || !nueva) {
    // Otra petición pudo abrirla en el mismo instante: si ya está, es esa; si no, el fallo se dice.
    const otra = preguntaAbiertaDe(plan, await filasDeSesion(sessionId, sb));
    if (otra) return { abierta: otra, cerrada: false, motivo: "ya hay pregunta abierta" };
    throw new Error(`No se pudo abrir la siguiente pregunta de la entrada (${PISTA_MIGRACION}): ${error?.message ?? "sin fila"}`);
  }
  if (sesion.estado === "pendiente") {
    const { error: eEstado } = await sb.from("interview_sessions").update({ estado: "en_curso" }).eq("id", sessionId);
    if (eEstado) throw new Error(`No se pudo marcar la entrada como empezada: ${eEstado.message}`);
  }
  return { abierta: nueva as FilaEntrada, cerrada: false, motivo: null };
}

// ---------------------------------------------------------------------------------------------------------------
// La síntesis: lo que entendimos, con la fuente de cada frase, para que el dueño diga «está bien» o «no es así».
// ---------------------------------------------------------------------------------------------------------------

export type MarcaFrase = "esta_bien" | "no_es_asi";
export type FraseSintesis = {
  clave: string;
  grupo: Grupo;
  asunto: string;
  /** Frase corta: las palabras del dueño entre comillas, o la confirmación tal como se le planteó. */
  texto: string;
  /** De dónde sale la frase. Nunca vacía. */
  fuente: string;
  certeza: Certeza | null;
  marca?: MarcaFrase;
  /** Lo que el dueño escribió al marcar «no es así». */
  correccion?: string | null;
  /** Un dato que tomamos de su respuesta para la ficha de la empresa, dicho al dueño para que lo confirme o lo corrija. */
  entendido?: string;
  /** Ese mismo dato, tal como se anota en companies.ficha al confirmar (solo si la ficha no lo tenía). */
  dato?: { campo: "personas"; valor: string };
};
export type Sintesis = {
  generada_at: string;
  /** Lo que es esta síntesis: declaraciones del dueño, no una lectura nuestra. */
  rotulo: string;
  grupos: { grupo: Grupo; nombre: string; frases: FraseSintesis[] }[];
  /**
   * Por clave, la pregunta tal como se le mostró al dueño cuando traía algo que ya sabíamos y él respondió con
   * sus palabras. En la fila queda la pregunta del plan, que es la que lee el extractor (apartarLoSabido).
   */
  mostradas?: Record<string, string>;
};

/**
 * Lo que hay en interview_sessions.sintesis ANTES de cerrar la sesión: todavía no hay frases, solo lo que se le
 * fue mostrando al dueño. Por eso nadie lee `grupos` sin pasar por sintesisCompleta().
 */
export type SintesisEnCurso = Pick<Sintesis, "mostradas">;

export function mostradasDe(sintesis: unknown): Record<string, string> {
  const m = (sintesis as { mostradas?: unknown } | null)?.mostradas;
  if (!m || typeof m !== "object") return {};
  return Object.fromEntries(Object.entries(m as Record<string, unknown>).filter((par): par is [string, string] => typeof par[1] === "string"));
}

/** La síntesis ya armada (con sus frases), o null si la sesión todavía guarda solo lo mostrado. */
export function sintesisCompleta(sintesis: unknown): Sintesis | null {
  return sintesis && typeof sintesis === "object" && Array.isArray((sintesis as { grupos?: unknown }).grupos) ? (sintesis as Sintesis) : null;
}

/**
 * Antes de mandar al extractor las palabras del dueño sobre algo que ya sabíamos, se aparta lo sabido: la
 * pregunta tal como se le mostró (con la cifra del documento y su fuente) queda guardada en la sesión para la
 * síntesis, y se devuelve la pregunta del plan para que sea esa la que quede en la fila. Si no hay nada que
 * apartar devuelve null. Si no se puede guardar, falla: no se cambia la pregunta sin dejar dicho cuál era.
 */
export async function apartarLoSabido(sessionId: string, fila: Pick<FilaEntrada, "pregunta" | "sabida_por" | "clave_pregunta">, sb: Sb): Promise<string | null> {
  const delPlan = preguntaParaExtraer(fila);
  if (!delPlan || !fila.clave_pregunta) return null;
  const { data, error } = await sb.from("interview_sessions").select("sintesis").eq("id", sessionId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la entrada (${PISTA_MIGRACION}): ${error.message}`);
  const actual = (data as { sintesis?: unknown } | null)?.sintesis;
  const nueva = { ...(actual && typeof actual === "object" ? actual : {}), mostradas: { ...mostradasDe(actual), [fila.clave_pregunta]: fila.pregunta } };
  const { error: eGuardar } = await sb.from("interview_sessions").update({ sintesis: nueva }).eq("id", sessionId);
  if (eGuardar) throw new Error(`No se pudo guardar lo que ya sabíamos de esta pregunta (${PISTA_MIGRACION}): ${eGuardar.message}`);
  return delPlan;
}

/**
 * Lo que el dueño DIJO en un audio, ya pasado a texto, se trata igual que lo que escribe o toca. Lo llama el
 * worker al terminar de transcribir (rama entrada_breve de jobs/handlers/entrevista.ts). Deja la fila como
 * corresponde y devuelve si va al extractor: un «no lo sé» y un «sí» a una confirmación no van.
 */
export async function asentarLoDicho(responseId: string, texto: string, sb: Sb): Promise<{ trato: Trato; extraer: boolean }> {
  const { data, error } = await sb.from("interview_responses").select(`session_id,${COLS_FILA}`).eq("id", responseId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la respuesta de la entrada (${PISTA_MIGRACION}): ${error.message}`);
  if (!data) throw new Error("Respuesta no encontrada");
  const fila = data as unknown as FilaEntrada & { session_id: string };
  const trato = tratoDeRespuesta(fila, texto);
  let cambios: Record<string, unknown> | null = null;
  if (trato === "no_lo_se") cambios = { respuesta: TEXTO_NO_LO_SE, certeza: "no_lo_se" };
  else if (trato === "confirma") cambios = { respuesta: TEXTO_CONFIRMA, certeza: "exacta" };
  else {
    const delPlan = await apartarLoSabido(fila.session_id, fila, sb);
    if (delPlan) cambios = { pregunta: delPlan };
  }
  if (cambios) {
    const { error: eGuardar } = await sb.from("interview_responses").update(cambios).eq("id", responseId);
    if (eGuardar) throw new Error(`No se pudo dejar la respuesta hablada como corresponde (${PISTA_MIGRACION}): ${eGuardar.message}`);
  }
  return { trato, extraer: trato === "palabras" };
}

export const ROTULO_SINTESIS = "Esto es lo que nos contaste, con tus palabras. No es una interpretación: marca lo que esté bien y corrige lo que no.";

/** De «Por tu archivo entendimos que vendes 80,000 al mes. ¿Es así?» queda «Por tu archivo entendimos que vendes 80,000 al mes.». */
export function afirmacionDe(confirmacion: string): string {
  return confirmacion.replace(/\s*¿[^?¿]*\?\s*$/, "").trim();
}

/**
 * La frase de una pregunta respondida. `n` es su número en el plan, de 1 a 12. `mostrada` es la pregunta tal
 * como la vio el dueño, cuando en la fila quedó la del plan porque respondió con sus palabras a algo sabido.
 */
export function fraseDe(item: PreguntaEntrada, fila: FilaEntrada, n: number, mostrada?: string): FraseSintesis {
  const base = { clave: item.clave, grupo: item.grupo, asunto: item.asunto, certeza: fila.certeza ?? null };
  const r = (fila.respuesta ?? "").trim();
  const vista = mostrada ?? fila.pregunta;
  if (fila.certeza === "no_lo_se" || r === TEXTO_NO_LO_SE) {
    return { ...base, texto: `Dijiste que todavía no lo sabes: ${enMinuscula(item.asunto)}.`, fuente: `Lo dijiste tú en la entrada (pregunta ${n}). No pusimos ningún número en su lugar.` };
  }
  if (r === TEXTO_DOCUMENTO) {
    const de = fila.sabida_por ?? SABIDA_POR_DOCUMENTO;
    return { ...base, texto: `Lo respondes con ${de}.`, fuente: `${enMayuscula(de)}: lo leemos y te mostramos lo que saquemos para que lo confirmes. Hasta entonces no damos nada por sabido.` };
  }
  if (r === TEXTO_CONFIRMA && fila.sabida_por) {
    return { ...base, texto: afirmacionDe(vista), fuente: `${enMayuscula(fila.sabida_por)}, confirmado por ti en la entrada (pregunta ${n}).` };
  }
  const cita = `«${recorte(r, 200)}»`;
  const aproximada = fila.certeza === "aproximada" ? ", dadas como aproximadas" : "";
  // Si de lo mostrado solo queda la pregunta del plan, no se reconstruye lo que decía: se cita la fuente y nada más.
  if (fila.sabida_por && (esConfirmacion(vista) || vista === item.texto)) {
    return { ...base, texto: cita, fuente: `Tus palabras en la entrada (pregunta ${n})${aproximada}, al revisar lo que entendimos por ${fila.sabida_por}.` };
  }
  if (fila.sabida_por) {
    return { ...base, texto: `${afirmacionDe(vista)} Sobre lo que faltaba dijiste: ${cita}`, fuente: `${enMayuscula(fila.sabida_por)} y tus palabras en la entrada (pregunta ${n})${aproximada}.` };
  }
  return { ...base, texto: cita, fuente: `Tus palabras en la entrada (pregunta ${n})${aproximada}.` };
}

/**
 * Arma la síntesis. Pura. De cada pregunta toma su respuesta original (la última, si hubo más de una) y, si el
 * dueño la corrigió, la corrección va aparte y la frase queda marcada «no es así»: se ve qué dijo primero y
 * qué dijo después, y ninguna de las dos cosas se pierde.
 */
export function armarSintesis(filas: FilaEntrada[], plan: string[] = CLAVES_PLAN, marcas: Record<string, MarcaFrase> = {}, mostradas: Record<string, string> = {}): Sintesis {
  const grupos: Sintesis["grupos"] = ORDEN_GRUPOS.map((g) => ({ grupo: g, nombre: GRUPOS[g], frases: [] }));
  plan.forEach((clave, i) => {
    const item = PLAN_POR_CLAVE.get(clave);
    if (!item) return;
    const respondidas = filas.filter((f) => f.clave_pregunta === clave && f.respuesta !== null).sort(porOrden);
    const originales = respondidas.filter((f) => !esCorreccion(f));
    const correcciones = respondidas.filter(esCorreccion);
    const original = originales[originales.length - 1];
    if (!original) return;
    const frase = fraseDe(item, original, i + 1, mostradas[clave]);
    const correccion = correcciones[correcciones.length - 1];
    if (correccion) {
      frase.marca = "no_es_asi";
      frase.correccion = (correccion.respuesta ?? "").trim();
    } else if (marcas[clave]) {
      frase.marca = marcas[clave];
    }
    if (clave === CLAVE_CUANTA_GENTE) {
      // Lo último que dijo con sus palabras: la corrección si la hubo, y si no su respuesta.
      const personas = personasDichas(palabrasDe(correccion ?? original));
      if (personas !== null) {
        frase.dato = { campo: "personas", valor: String(personas) };
        frase.entendido = `De ahí tomamos que en tu negocio ${personas === 1 ? "trabaja 1 persona" : `trabajan ${personas} personas`}, contándote a ti.`;
      }
    }
    grupos.find((g) => g.grupo === item.grupo)!.frases.push(frase);
  });
  return { generada_at: new Date().toISOString(), rotulo: ROTULO_SINTESIS, grupos, ...(Object.keys(mostradas).length ? { mostradas } : {}) };
}

/** La pregunta del plan que pide «con cuánta gente»: de su respuesta se toma `personas` para la ficha de la empresa. */
export const CLAVE_CUANTA_GENTE = "entrada.negocio_hoy";

const TEXTOS_DE_BOTON = new Set([TEXTO_NO_LO_SE, TEXTO_CONFIRMA, TEXTO_DOCUMENTO]);

/** Lo que el dueño dijo con sus palabras en esa fila; vacío si fue un botón o un «no lo sé». */
function palabrasDe(f: Pick<FilaEntrada, "respuesta" | "certeza">): string {
  const r = (f.respuesta ?? "").trim();
  return f.certeza === "no_lo_se" || TEXTOS_DE_BOTON.has(r) ? "" : r;
}

/**
 * Anota en la ficha de la empresa (companies.ficha) lo que el dueño confirmó, SOLO donde la ficha estaba
 * vacía: nunca pisa lo que alguien ya escribió. Devuelve lo que anotó.
 */
export async function anotarEnFicha(companyId: string, datos: Record<string, string>, sb: Sb): Promise<Record<string, string>> {
  const { data, error } = await sb.from("companies").select("ficha").eq("id", companyId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la ficha de la empresa: ${error.message}`);
  if (!data) return {};
  const ficha = ((data as { ficha?: Record<string, string> | null }).ficha ?? {}) as Record<string, string>;
  const nuevos = Object.fromEntries(Object.entries(datos).filter(([campo, valor]) => valor.trim() && !String(ficha[campo] ?? "").trim()));
  if (!Object.keys(nuevos).length) return {};
  const { error: eGuardar } = await sb.from("companies").update({ ficha: { ...ficha, ...nuevos } }).eq("id", companyId);
  if (eGuardar) throw new Error(`No se pudo anotar en la ficha de la empresa lo que confirmaste: ${eGuardar.message}`);
  return nuevos;
}

/** «Lo que entendimos» de una sesión, en frases cortas por grupo y con la fuente de cada una. */
export async function sintesis(sessionId: string, sb: Sb): Promise<Sintesis> {
  const sesion = await leerSesion(sessionId, sb);
  return armarSintesis(await filasDeSesion(sessionId, sb), planDe(sesion.plan), {}, mostradasDe(sesion.sintesis));
}

export type Correccion = { clave: string; texto: string };

export type CorreccionGuardada = {
  id: string;
  /** false si ya estaba guardada de un envío anterior: no se insertó otra vez. */
  nueva: boolean;
  /** false si la corrección es un «no lo sé»: de ahí no sale ningún número. */
  extraer: boolean;
};

/**
 * Las correcciones del dueño entran como respuestas nuevas a la misma pregunta: el extractor las lee como
 * cualquier respuesta, salvo que la corrección sea un «no lo sé», que queda con esa certeza y no se extrae.
 * La pregunta que las acompaña es la del plan, nunca la confirmación que se le mostró: lo que leímos de un
 * documento no viaja al extractor al lado de las palabras del dueño. Si la misma corrección ya está guardada
 * (un segundo envío) no se duplica, pero se devuelve igual: si el primer envío se cortó antes de encolarla,
 * el segundo la encola.
 */
export async function registrarCorrecciones(sessionId: string, correcciones: Correccion[], sb: Sb): Promise<CorreccionGuardada[]> {
  const filas = await filasDeSesion(sessionId, sb);
  let orden = filas.reduce((m, f) => Math.max(m, f.orden ?? 0), 0);
  const guardadas: CorreccionGuardada[] = [];
  for (const c of correcciones) {
    const item = PLAN_POR_CLAVE.get(c.clave);
    const escrito = c.texto.trim().slice(0, 4000);
    if (!item || !escrito) continue;
    const certeza: Certeza = esSoloNoLoSe(escrito) ? "no_lo_se" : "exacta";
    const texto = certeza === "no_lo_se" ? TEXTO_NO_LO_SE : escrito;
    const extraer = debeExtraer(certeza);
    const ultimaCorreccion = filas.filter((f) => f.clave_pregunta === c.clave && f.respuesta !== null && esCorreccion(f)).pop();
    if (ultimaCorreccion && (ultimaCorreccion.respuesta ?? "").trim() === texto) {
      guardadas.push({ id: ultimaCorreccion.id, nueva: false, extraer });
      continue;
    }
    const { data, error } = await sb
      .from("interview_responses")
      .insert({
        session_id: sessionId,
        bloque: item.bloque_banco,
        pregunta: `${PREFIJO_CORRECCION}${item.texto}»`,
        clave_pregunta: c.clave,
        certeza,
        respuesta: texto,
        respondido_at: new Date().toISOString(),
        orden: ++orden,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`No se pudo guardar tu corrección (${PISTA_MIGRACION}): ${error?.message ?? "sin fila"}`);
    guardadas.push({ id: String((data as { id: string }).id), nueva: true, extraer });
  }
  return guardadas;
}

export type Confirmacion = {
  sintesis: Sintesis;
  /** Las filas de corrección que se insertaron en este envío. */
  correcciones_ids: string[];
  /** Las correcciones que van al extractor: todas menos las que son un «no lo sé». */
  a_extraer: string[];
  /** Lo que se anotó en la ficha de la empresa (vacío si no había nada que anotar o la ficha ya lo tenía). */
  ficha: Record<string, string>;
  ya_confirmada: boolean;
};

/**
 * El dueño confirma la síntesis. Lo que no corrige queda marcado «está bien»; lo que corrige entra como
 * respuesta nueva y queda marcado «no es así» con su corrección. Solo se puede confirmar con las doce
 * respondidas, y una sola vez: confirmar de nuevo devuelve lo ya confirmado sin tocar nada.
 */
export async function confirmarSintesis(sessionId: string, correcciones: Correccion[], sb: Sb): Promise<Confirmacion> {
  const sesion = await leerSesion(sessionId, sb);
  const plan = planDe(sesion.plan);
  const yaHecha = sesion.sintesis_confirmada_at ? sintesisCompleta(sesion.sintesis) : null;
  if (yaHecha) return { sintesis: yaHecha, correcciones_ids: [], a_extraer: [], ficha: {}, ya_confirmada: true };

  const antes = await filasDeSesion(sessionId, sb);
  const avance = progresoEntrada(plan, antes);
  if (preguntaAbiertaDe(plan, antes) || avance.respondidas < avance.total) throw new ReglaEntrada("Termina las preguntas antes de confirmar.", 409);
  const claves = correcciones.map((c) => c.clave);
  if (claves.some((k) => !plan.includes(k)) || new Set(claves).size !== claves.length) throw new ReglaEntrada("Hay una corrección repetida o que no corresponde a tu entrada.");
  if (correcciones.some((c) => !c.texto.trim())) throw new ReglaEntrada("Escribe cómo es en lo que marcaste «No es así», o vuelve a marcarlo como «Está bien».");

  const guardadas = await registrarCorrecciones(sessionId, correcciones, sb);
  const marcas: Record<string, MarcaFrase> = Object.fromEntries(plan.map((k) => [k, "esta_bien" as const]));
  const s = armarSintesis(await filasDeSesion(sessionId, sb), plan, marcas, mostradasDe(sesion.sintesis));
  // Lo que el dueño acaba de dar por bueno y la ficha de la empresa no tenía, se anota ahí. Va ANTES de marcar
  // la confirmación: si no se puede anotar, se dice y el dueño vuelve a confirmar; nada queda a medias en silencio.
  const datos = Object.fromEntries(s.grupos.flatMap((g) => g.frases).flatMap((f) => (f.dato ? [[f.dato.campo, f.dato.valor] as const] : [])));
  const ficha = Object.keys(datos).length ? await anotarEnFicha(sesion.company_id, datos, sb) : {};
  const { error } = await sb.from("interview_sessions").update({ estado: "completa", sintesis: s, sintesis_confirmada_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw new Error(`No se pudo guardar tu confirmación (${PISTA_MIGRACION}): ${error.message}`);
  return {
    sintesis: s,
    correcciones_ids: guardadas.filter((g) => g.nueva).map((g) => g.id),
    a_extraer: guardadas.filter((g) => g.extraer).map((g) => g.id),
    ficha,
    ya_confirmada: false,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// El estado que ve la pantalla.
// ---------------------------------------------------------------------------------------------------------------

export type PreguntaAbierta = {
  id: string;
  clave: string;
  /** Número de la pregunta en el plan, de 1 a 12. */
  n: number;
  grupo: Grupo;
  asunto: string;
  pregunta: string;
  /** Si ya lo sabíamos por algo, de dónde. */
  sabida_por: string | null;
  /** true si un «sí» basta: la pantalla ofrece «Sí, es así». */
  basta_confirmar: boolean;
  acepta_aproximado: boolean;
};

export type EstadoEntrada = {
  sesion: { id: string; estado: string; sintesis_confirmada_at: string | null } | null;
  progreso: { respondidas: number; total: number };
  abierta: PreguntaAbierta | null;
  /** Hay un audio guardado que todavía se está convirtiendo a texto. */
  pendienteTranscripcion: boolean;
  sintesis: Sintesis | null;
  grupos: Record<Grupo, string>;
};

export const ESTADO_SIN_SESION: EstadoEntrada = {
  sesion: null,
  progreso: { respondidas: 0, total: CLAVES_PLAN.length },
  abierta: null,
  pendienteTranscripcion: false,
  sintesis: null,
  grupos: GRUPOS,
};

export async function estadoEntrada(sessionId: string, sb: Sb): Promise<EstadoEntrada> {
  const { data: ses } = await sb.from("interview_sessions").select(COLS_SESION).eq("id", sessionId).maybeSingle();
  if (!ses) return ESTADO_SIN_SESION;
  const sesion = ses as SesionEntrada;
  const filas = await filasDeSesion(sessionId, sb);
  const plan = planDe(sesion.plan);
  const abiertaFila = preguntaAbiertaDe(plan, filas);
  const item = abiertaFila?.clave_pregunta ? PLAN_POR_CLAVE.get(abiertaFila.clave_pregunta) : undefined;
  const abierta: PreguntaAbierta | null =
    abiertaFila && item
      ? {
          id: abiertaFila.id,
          clave: item.clave,
          n: plan.indexOf(item.clave) + 1,
          grupo: item.grupo,
          asunto: item.asunto,
          pregunta: abiertaFila.pregunta,
          sabida_por: abiertaFila.sabida_por ?? null,
          basta_confirmar: !!abiertaFila.sabida_por && esConfirmacion(abiertaFila.pregunta),
          acepta_aproximado: item.acepta_aproximado,
        }
      : null;
  return {
    sesion: { id: sesion.id, estado: sesion.estado, sintesis_confirmada_at: sesion.sintesis_confirmada_at ?? null },
    progreso: progresoEntrada(plan, filas),
    abierta,
    pendienteTranscripcion: !!(abiertaFila && abiertaFila.respuesta_audio_path),
    sintesis: sesion.estado === "completa" ? (sintesisCompleta(sesion.sintesis) ?? armarSintesis(filas, plan, {}, mostradasDe(sesion.sintesis))) : null,
    grupos: GRUPOS,
  };
}

export type EntradaDeUsuario = {
  estado: EstadoEntrada;
  /** Solo quien es dueño de la empresa y lleva esta entrada puede responderla. */
  puedeResponder: boolean;
  /** Por qué no puede, dicho al que mira. Null si puede. */
  motivoSoloLectura: string | null;
};

/**
 * La entrada tal como la ve esta cuenta. No escribe nada. El consultor (modo «ver como el empresario») mira;
 * una persona de la empresa que no es dueña, también; y si otro dueño ya la empezó, se ve pero no se pisa.
 */
export async function entradaDeUsuario(companyId: string, perfil: { id: string; rol: "consultor" | "cliente" }, sb: Sb): Promise<EntradaDeUsuario> {
  const sesion = await sesionEntradaDeEmpresa(companyId, sb);
  const estado = sesion ? await estadoEntrada(sesion.id, sb) : ESTADO_SIN_SESION;
  if (perfil.rol === "consultor") return { estado, puedeResponder: false, motivoSoloLectura: "Estás mirando. Las respuestas las da el dueño desde su cuenta." };
  if (!(await esDueno(companyId, perfil.id, sb))) return { estado, puedeResponder: false, motivoSoloLectura: "Estas preguntas las responde el dueño o la dueña de la empresa." };
  if (sesion) {
    const propio = await participanteDe(companyId, perfil.id, sb);
    if (propio !== sesion.participant_id) return { estado, puedeResponder: false, motivoSoloLectura: "Otra persona de tu empresa ya empezó estas preguntas. Aquí ves cómo van." };
  }
  return { estado, puedeResponder: true, motivoSoloLectura: null };
}
