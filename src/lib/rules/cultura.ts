/**
 * EL MARCO DE CULTURA — Competing Values Framework (Cameron & Quinn), dicho en castellano de dueño.
 *
 * Es el modelo con el que el mundo describe la cultura de una organización: cuatro maneras de ser
 * empresa que compiten entre sí, y ninguna es "la buena". Sirve para dos cosas que un manual de
 * cultura hecho de frases de póster no puede hacer:
 *
 *   1. NOMBRAR lo que la empresa YA es, con sus propias historias como prueba.
 *   2. Mostrar la TENSIÓN: hacia dónde dice el dueño que quiere ir y qué está premiando hoy sin
 *      darse cuenta. Ahí es donde una consultora sirve de verdad.
 *
 * EL CLIENTE NUNCA ESCUCHA "Competing Values", ni "clan", ni "adhocracia". Esas palabras viven aquí
 * adentro para el motor. Al dueño se le habla de cómo es su empresa.
 *
 * NADA SE DEDUCE DEL RUBRO. Un tipo de cultura solo se afirma si la empresa contó algo que lo
 * muestra. Sin historia, no hay afirmación: hay pregunta.
 */

export type ClaveCultura = "familia" | "creadora" | "competidora" | "ordenada";

export type TipoCultura = {
  clave: ClaveCultura;
  /** Como se le nombra al dueño. Sin jerga. */
  nombre: string;
  /** El nombre en el marco, para trazabilidad y para hablar con un cliente corporativo. */
  academico: string;
  /** Qué se ve en una empresa así. */
  comoSeVe: string;
  /** Lo que esa cultura hace bien. Ninguna es mala: cada una compra algo. */
  fuerza: string;
  /** Lo que esa misma cultura rompe cuando nadie la equilibra. Es lo que hay que vigilar. */
  riesgo: string;
  /** Qué pregunta hacer para ver si la empresa es así, en lenguaje oral. */
  pregunta: string;
};

export const CULTURAS: TipoCultura[] = [
  {
    clave: "familia",
    nombre: "De familia",
    academico: "Clan",
    comoSeVe: "La gente se queda años, se cubren entre ellos y el dueño conoce a las familias de su equipo",
    fuerza: "Lealtad y aguante: en la mala, el equipo no se va",
    riesgo: "Cuesta exigir y cuesta despedir. El que rinde poco se protege con el cariño, y el que rinde mucho se cansa de cargarlo",
    pregunta: "Cuando alguien de tu equipo tiene un problema personal fuerte, ¿qué pasa en tu empresa?",
  },
  {
    clave: "creadora",
    nombre: "Que se reinventa",
    academico: "Adhocracia",
    comoSeVe: "Se prueban cosas nuevas seguido, se cambia rápido y se tolera equivocarse si se aprendió",
    fuerza: "Se adapta antes que los demás y encuentra negocios que otros no ven",
    riesgo: "Se empieza mucho y se termina poco. Sin proceso escrito, cada cosa nueva depende otra vez del dueño",
    pregunta: "En el último año, ¿qué probaron que nunca habían hecho? ¿Qué pasó con eso?",
  },
  {
    clave: "competidora",
    nombre: "De resultados",
    academico: "Mercado",
    comoSeVe: "Se habla de metas y de números, se reconoce al que vende más y el ritmo lo marca el cliente",
    fuerza: "Empuja: la empresa crece porque alguien está midiendo y exigiendo",
    riesgo: "Se quema a la gente y se premia el número aunque el cliente quede mal atendido",
    pregunta: "¿A quién se le reconoce en tu empresa y por qué? ¿Cómo se entera el resto?",
  },
  {
    clave: "ordenada",
    nombre: "De orden",
    academico: "Jerarquía",
    comoSeVe: "Hay reglas, se pide permiso, cada cosa tiene su forma de hacerse y se cuida no equivocarse",
    fuerza: "Sale parejo: el cliente recibe lo mismo lo atienda quien lo atienda",
    riesgo: "Se vuelve lento y nadie decide sin preguntar. Lo nuevo cuesta el doble",
    pregunta: "Cuando hay que decidir algo fuera de lo común, ¿quién decide y cuánto se demora?",
  },
];

export const CULTURA = new Map(CULTURAS.map((c) => [c.clave, c]));

/**
 * LAS DOS TENSIONES del marco, que es lo que lo hace útil y no una lista de cuatro cajas:
 * una empresa se para en algún punto entre mirar adentro o afuera, y entre soltar o controlar.
 */
export const TENSIONES = [
  { eje: "Mirar adentro o mirar afuera", adentro: ["familia", "ordenada"], afuera: ["creadora", "competidora"], porque: "Una empresa que solo mira adentro se vuelve cómoda; una que solo mira afuera se desgasta" },
  { eje: "Soltar o controlar", soltar: ["familia", "creadora"], controlar: ["competidora", "ordenada"], porque: "Sin control no escala; con solo control, no se mueve" },
] as const;

/**
 * Señales para reconocer una cultura en lo que la empresa CONTÓ. Con límites de palabra, para que
 * «se celebra» no se enganche dentro de otra palabra y para que «meta» no salte en «metalmecánica».
 */
const P = "(?:^|[^a-záéíóúñü])";
const S = "(?:[^a-záéíóúñü]|$)";
const frase = (...alternativas: string[]) => new RegExp(`${P}(?:${alternativas.join("|")})${S}`, "i");

const SENALES: Record<ClaveCultura, RegExp> = {
  familia: frase("como familia", "somos familia", "años conmigo", "anos conmigo", "se cubren", "nos apoyamos", "confianza", "lealtad", "casi familia"),
  creadora: frase("probamos", "probar", "innovar", "nuevo servicio", "nos reinventamos", "experimentar", "cambiamos rapido", "cambiamos rápido"),
  competidora: frase("meta", "metas", "comision", "comisión", "comisiones", "el que mas vende", "el que más vende", "ranking", "premio por ventas", "bono"),
  ordenada: frase("protocolo", "protocolos", "reglamento", "hay que pedir permiso", "autorizacion", "autorización", "manual", "procedimiento", "checklist"),
};

export type LecturaCultura = {
  /** Los tipos que la empresa mostró con algo concreto. Puede haber más de uno: es lo normal. */
  presentes: TipoCultura[];
  /** Los que no se pueden afirmar ni descartar: van como pregunta, no como conclusión. */
  porPreguntar: TipoCultura[];
};

/**
 * Lee la cultura de lo que la empresa dijo. Si no dijo nada que lo muestre, NO se inventa un tipo:
 * una empresa sin historias contadas no tiene «cultura de familia» porque el rubro lo sugiera.
 */
export function leerCultura(textos: (string | null | undefined)[]): LecturaCultura {
  const corpus = textos.filter(Boolean).join(" \n ");
  const presentes: TipoCultura[] = [];
  const porPreguntar: TipoCultura[] = [];
  for (const c of CULTURAS) (SENALES[c.clave].test(corpus) ? presentes : porPreguntar).push(c);
  return { presentes, porPreguntar };
}

/** El marco como contexto para los agentes. El cliente no lee esto nunca. */
export function culturaComoTexto(): string {
  return [
    "MARCO DE CULTURA (interno, jamas se nombra al cliente):",
    ...CULTURAS.map((c) => `- ${c.nombre} (${c.academico}): se ve como «${c.comoSeVe}». Fuerza: ${c.fuerza}. Riesgo: ${c.riesgo}.`),
    "Ninguna es la buena. Casi toda empresa es una mezcla, y lo valioso es la TENSION: lo que el dueno",
    "dice que quiere ser contra lo que hoy premia sin darse cuenta. Eso solo se afirma con la historia",
    "que la empresa conto; sin historia no es un hallazgo, es una pregunta.",
  ].join("\n");
}
