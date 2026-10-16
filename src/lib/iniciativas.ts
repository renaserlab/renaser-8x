/**
 * EXCELENCIA, SERVICIO Y ACELERACIÓN COMO CAPACIDADES (Nivel 2, sección 15 de la instrucción de Dirección).
 *
 * El Nivel 2 no es «más indicadores». Es una lista corta de apuestas: cada una dice qué se cree que va a
 * pasar, en qué se apoya, qué pide, hasta cuándo se prueba, cómo se sabrá si funcionó y qué tiene que
 * verse para continuar, ajustar o detener. A eso se le llama aquí INICIATIVA. Lo que no tiene esas piezas
 * es una idea, y una idea no se aprueba.
 *
 * Reglas que este módulo pone en código, sin IA y sin base (se prueban en tests/iniciativas.test.ts):
 *
 *  1. PARA APROBAR HACE FALTA TODO: hipótesis, medida de éxito, al menos una evidencia o una fuente
 *     aportada, recursos, plazo, los tres criterios y una persona responsable. `completitud` dice qué falta.
 *  2. LA TABLA DE ESTADOS ES CERRADA. propuesta → aprobada | cerrada; aprobada → en_curso; en_curso →
 *     continuar | ajustar | detener; ajustar → en_curso; continuar → en_curso | cerrada; detener → cerrada.
 *     Lo que no está en la tabla no se puede hacer, y el error dice qué sí se puede.
 *  3. CADA PASO DEJA UNA FILA DE HISTORIAL con quién, de qué estado a cuál, por qué y con qué evidencia.
 *  4. APROBAR Y DECIDIR PIDEN AUTORIDAD. La regla dice cuál («aprobar_plan»); quien escribe en la base
 *     la exige con `exigirAutoridad` antes de escribir (api/companies/[id]/iniciativas/_datos.ts).
 *  5. SIN DATO NO HAY VEREDICTO. `evaluarCriterios` solo dice qué criterio se cumple cuando hay un valor
 *     del indicador. Sin valor devuelve «sin dato para evaluar» y nada más. Cero es un dato; vacío no.
 *     Y UN CRITERIO SOLO SE COMPARA CON UN DATO DE SU MISMA UNIDAD: «al menos 70 %» no dice nada de un
 *     «7 de cada 10». Si la unidad escrita en el criterio no es la del indicador, lo evalúa una persona.
 *  6. NO SE BLOQUEA UNA APUESTA ESTRATÉGICA POR PAPELES AJENOS. `pertinencia` solo pide lo que la propia
 *     iniciativa necesita (su evidencia o su fuente). Lo demás que falte en el levantamiento se nombra
 *     como «no la impide» y no se usa para frenar nada.
 *  7. NO SE INVENTA MERCADO NI COMPETIDORES. Cuando no hay investigación externa valen las fuentes que
 *     alguien aportó, con nombre, quién, fecha y qué dicen. Y si la iniciativa es de mercado y competencia
 *     y no tiene ninguna, es obligatorio dejar escrito qué quedó pendiente de investigar.
 *
 * Este archivo no importa nada del servidor: lo usan también los componentes del navegador.
 */
import type { AccionAutoridad } from "./autoridad";
import { numeroEscrito } from "./numero-escrito";
import { VALIDACION_TEXTO, diaEnZona, finDePeriodo, letrasDe, nombreDePeriodoKpi, textoValor, type EstadoValidacion, type Unidad } from "./kpis";

// ───────────────────────── LOS QUINCE DOMINIOS ─────────────────────────

/** Encabezados del tablero. Son un orden de lectura, no una clasificación del método. */
export const BLOQUES = {
  mercado: "Mercado y propuesta",
  comercial: "Crecimiento comercial",
  servicio: "Servicio y calidad",
  capacidad: "Capacidad para crecer",
} as const;
export type Bloque = keyof typeof BLOQUES;

export type DefDominio = {
  /** Coincide con el check de `iniciativas.dominio` (migracion-excelencia-y-cartera.sql). */
  clave: string;
  /** Cómo se le dice al empresario. */
  nombre: string;
  /** Cómo lo nombra el método, para la consultora. */
  tecnico: string;
  /** La pregunta que una iniciativa de este dominio ayuda a responder. */
  pregunta: string;
  bloque: Bloque;
};

export const DOMINIOS = [
  { clave: "mercado_y_competencia", nombre: "Lo que pasa afuera", tecnico: "Investigación de mercado y competencia", pregunta: "¿Quién más ofrece lo mismo, a qué precio, y qué está cambiando en lo que la gente compra?", bloque: "mercado" },
  { clave: "clientes_prioritarios", nombre: "Los clientes que más convienen", tecnico: "Clientes prioritarios", pregunta: "¿A qué clientes conviene dedicarles más tiempo y a cuáles menos?", bloque: "mercado" },
  { clave: "posicionamiento_y_diferenciacion", nombre: "Por qué nos eligen", tecnico: "Posicionamiento y diferenciación", pregunta: "¿Por qué un cliente nos elige a nosotros y no a otro?", bloque: "mercado" },
  { clave: "propuesta_de_alto_valor", nombre: "Lo que ofrecemos y por qué vale", tecnico: "Propuesta de alto valor", pregunta: "¿Qué le resolvemos al cliente que valga lo que cobramos?", bloque: "mercado" },
  { clave: "portafolio_y_precios", nombre: "Qué vendemos y a qué precio", tecnico: "Portafolio y precios", pregunta: "¿Qué productos o servicios conviene mantener, mejorar o retirar, y a qué precio?", bloque: "mercado" },
  { clave: "adquisicion", nombre: "Cómo llegan clientes nuevos", tecnico: "Adquisición", pregunta: "¿De dónde vienen los clientes nuevos y cuánto cuesta traer uno?", bloque: "comercial" },
  { clave: "conversion", nombre: "Cuántos interesados terminan comprando", tecnico: "Conversión", pregunta: "De cada 10 que preguntan, ¿cuántos compran, y por qué los demás no?", bloque: "comercial" },
  { clave: "retencion", nombre: "Cuántos clientes vuelven", tecnico: "Retención", pregunta: "De cada 10 clientes, ¿cuántos vuelven a comprar, y por qué se van los que no?", bloque: "comercial" },
  { clave: "expansion", nombre: "Crecer con lo que ya funciona", tecnico: "Expansión", pregunta: "¿Qué más puede comprarnos quien ya nos compra, y a qué otros clientes o lugares podemos llegar con lo que ya funciona?", bloque: "comercial" },
  { clave: "experiencia_y_promesa_de_servicio", nombre: "Lo que prometemos y cómo lo vive el cliente", tecnico: "Experiencia y promesa de servicio", pregunta: "¿Qué le prometemos al cliente y qué tan seguido lo cumplimos?", bloque: "servicio" },
  { clave: "estandares_de_calidad", nombre: "Qué es «bien hecho» aquí", tecnico: "Estándares de calidad", pregunta: "¿Qué significa «bien hecho», quién lo comprueba y qué pasa cuando no se cumple?", bloque: "servicio" },
  { clave: "liderazgo_y_capacidades", nombre: "Quién dirige y qué sabe hacer el equipo", tecnico: "Liderazgo y capacidades", pregunta: "¿Qué tiene que saber hacer el equipo, y quién lo dirige, para sostener lo que queremos lograr?", bloque: "servicio" },
  { clave: "escenarios_de_crecimiento", nombre: "Qué pasa si crecemos poco, lo esperado o mucho", tecnico: "Escenarios de crecimiento", pregunta: "Si crecemos poco, lo esperado o mucho, ¿qué pasa con las ventas, los costos y la caja?", bloque: "capacidad" },
  { clave: "capacidad_operativa_y_financiera", nombre: "Hasta dónde aguanta la empresa", tecnico: "Capacidad operativa y financiera", pregunta: "¿Cuánto más podemos vender con la gente, el equipo y la caja de hoy antes de que algo se rompa?", bloque: "capacidad" },
  { clave: "riesgos_de_expansion", nombre: "Qué puede salir mal al crecer", tecnico: "Riesgos de expansión", pregunta: "¿Qué puede salir mal si crecemos, cuánto costaría y cómo nos daríamos cuenta a tiempo?", bloque: "capacidad" },
] as const satisfies readonly DefDominio[];

export type Dominio = (typeof DOMINIOS)[number]["clave"];
export const CLAVES_DOMINIO = DOMINIOS.map((d) => d.clave) as [Dominio, ...Dominio[]];
export const DOMINIO_MERCADO: Dominio = "mercado_y_competencia";

const POR_CLAVE = new Map<string, DefDominio>(DOMINIOS.map((d) => [d.clave, d]));

export function esDominio(x: unknown): x is Dominio {
  return typeof x === "string" && POR_CLAVE.has(x);
}

/** La definición de un dominio; null si la clave no es una de las quince. */
export function dominioDe(clave: string | null | undefined): DefDominio | null {
  return (clave && POR_CLAVE.get(clave)) || null;
}

// ───────────────────────── ESTADOS Y TABLA DE TRANSICIONES ─────────────────────────

export const ESTADOS = ["propuesta", "aprobada", "en_curso", "continuar", "ajustar", "detener", "cerrada"] as const;
export type Estado = (typeof ESTADOS)[number];

export const DECISIONES = ["continuar", "ajustar", "detener"] as const;
export type Decision = (typeof DECISIONES)[number];

export function esEstado(x: unknown): x is Estado {
  return typeof x === "string" && (ESTADOS as readonly string[]).includes(x);
}
const esDecision = (x: Estado): x is Decision => (DECISIONES as readonly string[]).includes(x);

/** LA TABLA. Lo que no está aquí no se puede hacer. */
export const TRANSICIONES: Record<Estado, readonly Estado[]> = {
  propuesta: ["aprobada", "cerrada"],
  aprobada: ["en_curso"],
  en_curso: ["continuar", "ajustar", "detener"],
  ajustar: ["en_curso"],
  continuar: ["en_curso", "cerrada"],
  detener: ["cerrada"],
  cerrada: [],
};

/** Cómo se le dice a cada estado a la consultora. */
export const ESTADO_CONSULTOR: Record<Estado, string> = {
  propuesta: "Propuesta",
  aprobada: "Aprobada",
  en_curso: "En curso",
  continuar: "Se decidió continuar",
  ajustar: "Se decidió ajustar",
  detener: "Se decidió detener",
  cerrada: "Cerrada",
};

/**
 * Lo que el dueño ve en «Lo que estamos probando»: lo aprobado y lo que está en curso. «Continuar» y
 * «ajustar» son decisiones tomadas sobre algo que sigue en curso, así que para él siguen en curso: si
 * desaparecieran en el momento de decidir, la apuesta se le perdería de vista justo cuando se revisa.
 * Las propuestas, lo detenido y lo cerrado no se le muestran aquí.
 */
export const ESTADOS_VISIBLES_CLIENTE: readonly Estado[] = ["aprobada", "en_curso", "continuar", "ajustar"];

export const ESTADO_CLIENTE: Partial<Record<Estado, string>> = {
  aprobada: "Aprobada, por empezar",
  en_curso: "En curso",
  continuar: "En curso: se revisó y sigue",
  ajustar: "En curso: se está ajustando",
};

export function visibleParaCliente(estado: string): boolean {
  return (ESTADOS_VISIBLES_CLIENTE as readonly string[]).includes(estado);
}

/** El botón de cada paso, para la consultora. */
export function verboDe(de: Estado, a: Estado): string {
  if (a === "aprobada") return "Aprobar";
  if (a === "cerrada") return de === "propuesta" ? "Descartar" : "Cerrar";
  if (a === "en_curso") return de === "aprobada" ? "Empezar" : de === "ajustar" ? "Reanudar con el ajuste" : "Seguir midiendo";
  return a === "continuar" ? "Continuar" : a === "ajustar" ? "Ajustar" : "Detener";
}

// ───────────────────────── LA INICIATIVA ─────────────────────────

/** Una fuente que alguien de la empresa o la consultora puso sobre la mesa cuando no hubo investigación externa. */
export type FuenteAportada = { nombre: string; quien_la_aporto: string; fecha: string; que_dice: string };

export type Iniciativa = {
  id: string;
  company_id: string;
  dominio: Dominio;
  titulo: string;
  /** Qué creemos que pasará y por qué. */
  hipotesis: string;
  /** Afirmaciones, fuentes o hallazgos de la empresa que la sustentan. */
  evidencia_ids: string[];
  fuentes_aportadas: FuenteAportada[];
  /** Lo que no se pudo investigar y queda dicho. */
  pendiente_investigacion: string | null;
  recursos: string | null;
  plazo_inicio: string | null;
  plazo_fin: string | null;
  /** Cómo sabremos que funcionó: un indicador o un hecho observable. */
  medida_exito: string;
  indicador_id: string | null;
  criterio_continuar: string | null;
  criterio_ajustar: string | null;
  criterio_detener: string | null;
  estado: Estado;
  decision_at: string | null;
  decision_por: string | null;
  decision_motivo: string | null;
  responsable_participant_id: string | null;
  creada_por: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const textoONull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const hay = (v: string | null | undefined): v is string => typeof v === "string" && v.trim().length > 0;

/** Una fuente aportada leída de la base: solo se acepta si trae nombre y qué dice. */
function fuenteDesde(x: unknown): FuenteAportada | null {
  if (!x || typeof x !== "object") return null;
  const f = x as Record<string, unknown>;
  const nombre = textoONull(f.nombre);
  const que_dice = textoONull(f.que_dice);
  if (!nombre || !que_dice) return null;
  return { nombre, quien_la_aporto: textoONull(f.quien_la_aporto) ?? "", fecha: textoONull(f.fecha) ?? "", que_dice };
}

/** Una iniciativa vacía con lo que se le pase encima. Para pruebas y para armar una nueva. */
export function iniciativaVacia(parcial: Partial<Iniciativa> = {}): Iniciativa {
  return {
    id: "", company_id: "", dominio: "clientes_prioritarios", titulo: "", hipotesis: "", evidencia_ids: [], fuentes_aportadas: [],
    pendiente_investigacion: null, recursos: null, plazo_inicio: null, plazo_fin: null, medida_exito: "", indicador_id: null,
    criterio_continuar: null, criterio_ajustar: null, criterio_detener: null, estado: "propuesta", decision_at: null, decision_por: null,
    decision_motivo: null, responsable_participant_id: null, creada_por: null,
    ...parcial,
  };
}

/** De una fila de `iniciativas` a una iniciativa tipada. Un estado desconocido se lee como propuesta: es lo único que el dueño no ve. */
export function desdeFila(f: Record<string, unknown>): Iniciativa {
  return {
    id: String(f.id ?? ""),
    company_id: String(f.company_id ?? ""),
    dominio: String(f.dominio ?? "") as Dominio,
    titulo: String(f.titulo ?? ""),
    hipotesis: String(f.hipotesis ?? ""),
    evidencia_ids: Array.isArray(f.evidencia_ids) ? f.evidencia_ids.filter((x): x is string => typeof x === "string") : [],
    fuentes_aportadas: Array.isArray(f.fuentes_aportadas) ? f.fuentes_aportadas.map(fuenteDesde).filter((x): x is FuenteAportada => x !== null) : [],
    pendiente_investigacion: textoONull(f.pendiente_investigacion),
    recursos: textoONull(f.recursos),
    plazo_inicio: textoONull(f.plazo_inicio),
    plazo_fin: textoONull(f.plazo_fin),
    medida_exito: String(f.medida_exito ?? ""),
    indicador_id: textoONull(f.indicador_id),
    criterio_continuar: textoONull(f.criterio_continuar),
    criterio_ajustar: textoONull(f.criterio_ajustar),
    criterio_detener: textoONull(f.criterio_detener),
    estado: esEstado(f.estado) ? f.estado : "propuesta",
    decision_at: textoONull(f.decision_at),
    decision_por: textoONull(f.decision_por),
    decision_motivo: textoONull(f.decision_motivo),
    responsable_participant_id: textoONull(f.responsable_participant_id),
    creada_por: textoONull(f.creada_por),
    created_at: textoONull(f.created_at),
    updated_at: textoONull(f.updated_at),
  };
}

// ───────────────────────── COMPLETITUD: QUÉ LE FALTA PARA APROBARSE ─────────────────────────

export const CAMPOS_COMPLETITUD = [
  "hipotesis", "medida_exito", "evidencia", "recursos", "plazo", "criterio_continuar", "criterio_ajustar", "criterio_detener", "responsable", "pendiente_investigacion",
] as const;
export type CampoCompletitud = (typeof CAMPOS_COMPLETITUD)[number];

export type Faltante = { campo: CampoCompletitud; etiqueta: string; por_que: string };

/** Una frase de una palabra no es una hipótesis ni un criterio: al menos ocho letras. */
export const MIN_LETRAS = 8;
const dice = (v: string | null | undefined): boolean => letrasDe(v) >= MIN_LETRAS;
/** Un criterio puede ser una frase o una cifra: «≥ 40» no tiene letras y es un criterio perfectamente claro. */
const criterioDice = (v: string | null | undefined): boolean => dice(v) || leerCriterio(v) !== null;

export const TEXTO_PENDIENTE_MERCADO =
  "Es de mercado y competencia y no tiene ninguna fuente aportada: hay que dejar escrito qué no se pudo investigar. No se inventa mercado ni competidores.";

const esFechaISO = (s: string | null | undefined): s is string => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** ¿Le hace falta dejar dicho qué quedó sin investigar? Solo mercado y competencia sin ninguna fuente aportada. */
export function exigePendienteDeInvestigacion(i: Pick<Iniciativa, "dominio" | "fuentes_aportadas">): boolean {
  return i.dominio === DOMINIO_MERCADO && i.fuentes_aportadas.length === 0;
}

/**
 * Lo que falta para poder aprobarla, en el orden en que se llena la ficha. Lista vacía = lista para
 * aprobar. No mira el levantamiento: eso es `pertinencia`.
 */
export function completitud(i: Iniciativa): Faltante[] {
  const f: Faltante[] = [];
  if (!dice(i.hipotesis)) f.push({ campo: "hipotesis", etiqueta: "Hipótesis", por_que: "Qué creemos que va a pasar y por qué. Sin hipótesis no hay nada que probar." });
  if (!dice(i.medida_exito)) f.push({ campo: "medida_exito", etiqueta: "Medida de éxito", por_que: "Cómo sabremos que funcionó: un indicador o un hecho que se pueda observar." });
  if (i.evidencia_ids.length === 0 && i.fuentes_aportadas.length === 0) {
    f.push({ campo: "evidencia", etiqueta: "Evidencia o fuente aportada", por_que: "Al menos una evidencia de la empresa o una fuente aportada que sustente la hipótesis." });
  }
  if (!hay(i.recursos)) f.push({ campo: "recursos", etiqueta: "Recursos", por_que: "Qué personas, cuánto tiempo y cuánto dinero pide." });
  if (!esFechaISO(i.plazo_fin)) {
    f.push({ campo: "plazo", etiqueta: "Plazo", por_que: "Hasta cuándo se prueba. Sin fecha de cierre no hay momento de decidir." });
  } else if (esFechaISO(i.plazo_inicio) && i.plazo_inicio > i.plazo_fin) {
    f.push({ campo: "plazo", etiqueta: "Plazo", por_que: "La fecha de cierre es anterior a la de inicio." });
  }
  if (!criterioDice(i.criterio_continuar)) f.push({ campo: "criterio_continuar", etiqueta: "Criterio para continuar", por_que: "Qué tiene que verse para seguir igual." });
  if (!criterioDice(i.criterio_ajustar)) f.push({ campo: "criterio_ajustar", etiqueta: "Criterio para ajustar", por_que: "Qué tiene que verse para cambiar algo y seguir." });
  if (!criterioDice(i.criterio_detener)) f.push({ campo: "criterio_detener", etiqueta: "Criterio para detener", por_que: "Qué tiene que verse para parar. Sin este criterio una prueba no se detiene nunca." });
  if (!hay(i.responsable_participant_id)) f.push({ campo: "responsable", etiqueta: "Responsable", por_que: "Una persona identificada de la empresa, no un área." });
  if (exigePendienteDeInvestigacion(i) && !dice(i.pendiente_investigacion)) {
    f.push({ campo: "pendiente_investigacion", etiqueta: "Pendiente de investigar", por_que: TEXTO_PENDIENTE_MERCADO });
  }
  return f;
}

/** Cuántas piezas de la ficha están y cuántas son, para decirlo en una línea. */
export function avanceDeFicha(i: Iniciativa): { completas: number; total: number } {
  const total = CAMPOS_COMPLETITUD.length - (exigePendienteDeInvestigacion(i) ? 0 : 1);
  const faltan = new Set(completitud(i).map((x) => x.campo)).size;
  return { completas: total - faltan, total };
}

// ───────────────────────── PERTINENCIA: QUÉ PIDE Y QUÉ NO LA IMPIDE ─────────────────────────

/** Algo que al levantamiento de la empresa todavía le falta. `id` solo si es una fuente, afirmación o hallazgo concreto. */
export type FaltanteLevantamiento = { que: string; id?: string | null };
export type Levantamiento = { faltantes?: readonly (string | FaltanteLevantamiento)[] } | null | undefined;

export type Pertinencia = {
  /** true cuando la iniciativa tiene lo que ELLA necesita. Lo ajeno nunca lo pone en false. */
  puede_avanzar: boolean;
  /** Lo que la propia iniciativa necesita y no tiene. */
  pide: string[];
  /** Evidencia citada que todavía falta, cuando la hipótesis igual tiene otro sustento. */
  avisos: string[];
  /** Lo que falta en el levantamiento y no tiene que ver con esta iniciativa. Se nombra; no frena. */
  no_la_impide: string[];
  texto: string;
};

/**
 * ¿Tiene esta iniciativa lo que necesita para avanzar? Solo se mira su propio sustento: su evidencia,
 * sus fuentes aportadas y, si es de mercado sin fuentes, lo que quedó pendiente de investigar. Que a la
 * empresa le falten manuales, flujogramas u otros documentos operativos NO la bloquea: esos faltantes se
 * devuelven en `no_la_impide` para que se vean, y nada más.
 */
export function pertinencia(i: Pick<Iniciativa, "dominio" | "evidencia_ids" | "fuentes_aportadas" | "pendiente_investigacion">, levantamiento?: Levantamiento): Pertinencia {
  const faltantes: FaltanteLevantamiento[] = (levantamiento?.faltantes ?? []).map((x) => (typeof x === "string" ? { que: x } : x)).filter((x) => hay(x.que));
  const citadas = new Set(i.evidencia_ids);
  const propias = faltantes.filter((x) => x.id && citadas.has(x.id));
  const ajenas = faltantes.filter((x) => !(x.id && citadas.has(x.id)));

  const pide: string[] = [];
  const avisos: string[] = [];
  const disponibles = i.evidencia_ids.length - new Set(propias.map((x) => x.id)).size;
  if (i.evidencia_ids.length === 0 && i.fuentes_aportadas.length === 0) {
    pide.push("Al menos una evidencia de la empresa o una fuente aportada que sustente la hipótesis.");
  } else if (disponibles <= 0 && i.fuentes_aportadas.length === 0 && propias.length > 0) {
    pide.push(`La evidencia que esta iniciativa cita todavía falta: ${propias.map((x) => x.que).join("; ")}.`);
  } else {
    for (const x of propias) avisos.push(`Cita una evidencia que todavía falta: ${x.que}.`);
  }
  if (exigePendienteDeInvestigacion(i) && !dice(i.pendiente_investigacion)) pide.push(TEXTO_PENDIENTE_MERCADO);

  const no_la_impide = ajenas.map((x) => x.que);
  const cola = no_la_impide.length ? ` Al levantamiento le ${no_la_impide.length === 1 ? "falta 1 cosa que no tiene" : `faltan ${no_la_impide.length} cosas que no tienen`} que ver con esta iniciativa: no la ${no_la_impide.length === 1 ? "impide" : "impiden"}.` : "";
  const texto = (pide.length ? `Para avanzar necesita: ${pide.join(" ")}` : "Tiene el sustento que necesita.") + cola;
  return { puede_avanzar: pide.length === 0, pide, avisos, no_la_impide, texto };
}

// ───────────────────────── FUENTES APORTADAS ─────────────────────────

export type NuevaFuente = { nombre: string; quien: string; fecha: string; que_dice: string };

export type ResultadoFuente<T> = { ok: true; iniciativa: T; fuente: FuenteAportada } | { ok: false; error: string };

/**
 * Registra una fuente que alguien aportó. No toca la base: devuelve la iniciativa con la fuente añadida.
 * Las cuatro piezas son obligatorias: sin nombre no se puede volver a encontrar, sin quién no se sabe a
 * quién preguntar, sin fecha no se sabe si sigue vigente y sin «qué dice» no sustenta nada.
 */
export function registrarFuenteAportada<T extends Pick<Iniciativa, "fuentes_aportadas">>(iniciativa: T, fuente: NuevaFuente, hoy?: string): ResultadoFuente<T> {
  const nombre = (fuente?.nombre ?? "").trim();
  const quien = (fuente?.quien ?? "").trim();
  const fecha = (fuente?.fecha ?? "").trim();
  const que_dice = (fuente?.que_dice ?? "").trim();
  if (letrasDe(nombre) < 3) return { ok: false, error: "Ponle nombre a la fuente: qué documento, lista, conversación o registro es." };
  if (letrasDe(quien) < 2) return { ok: false, error: "Di quién la aportó." };
  if (!esFechaISO(fecha)) return { ok: false, error: "Pon la fecha de la fuente (AAAA-MM-DD). Sin fecha no se sabe si sigue vigente." };
  if (hoy && esFechaISO(hoy) && fecha > hoy) return { ok: false, error: "La fecha de la fuente no puede ser futura." };
  if (!dice(que_dice)) return { ok: false, error: "Escribe qué dice la fuente, en una frase. Un nombre solo no sustenta nada." };
  const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  if (iniciativa.fuentes_aportadas.some((f) => igual(f.nombre, nombre) && igual(f.quien_la_aporto, quien) && f.fecha === fecha)) {
    return { ok: false, error: "Esa fuente ya está registrada en esta iniciativa." };
  }
  const nueva: FuenteAportada = { nombre, quien_la_aporto: quien, fecha, que_dice };
  return { ok: true, fuente: nueva, iniciativa: { ...iniciativa, fuentes_aportadas: [...iniciativa.fuentes_aportadas, nueva] } };
}

// ───────────────────────── LEER UN CRITERIO ESCRITO ─────────────────────────

export type Operador = "mayor_igual" | "mayor" | "menor_igual" | "menor" | "igual" | "entre";
export type Condicion = { op: Operador; a: number; b?: number };
/**
 * La unidad que un criterio trae escrita junto a su cifra: «70 %», «7 de cada 10», «S/ 8,000», «12 días».
 * «otra» es una escala que ningún indicador usa («3 de cada 5»): no se compara con ningún dato.
 */
export type UnidadEscrita = "porcentaje" | "de_cada_10" | "soles" | "dolares" | "moneda" | "dias" | "horas" | "personas" | "unidades" | "otra";
/**
 * Varias condiciones en un mismo criterio: «todas» si van unidas por «y», «alguna» si van unidas por «o».
 * `unidad` es la que el criterio dice; null cuando no dice ninguna y se entiende que habla en la del dato.
 */
export type CriterioLeido = { modo: "todas" | "alguna"; condiciones: Condicion[]; unidad: UnidadEscrita | null };

const N = String.raw`(?:s\/\.?\s*|us\$\s*|\$\s*)?\d+(?:[.,]\d+)*(?:\s*(?:millones|mill[oó]n|mil|k)\b)?(?:\s*%)?`;
const NO_ES_RANGO = String.raw`(?<!m[aá]s |menos |partir |antes |despu[eé]s |m[aá]ximo |m[ií]nimo |encima |debajo |arriba |abajo )`;
/** «más de», «hasta» o «desde» cuentan como palabra entera, no como el final de otra. */
const SIN_LETRA_ANTES = String.raw`(?<![\p{L}])`;
const PATRONES: { op: Operador; re: RegExp }[] = [
  { op: "entre", re: new RegExp(String.raw`(?:\bentre|${NO_ES_RANGO}\bde)\s+(${N})\s+(?:y|a)\s+(${N})`, "g") },
  { op: "mayor_igual", re: new RegExp(String.raw`(${N})\s+(?:(?:o|a)\s+m[aá]s(?!\s+del?(?![\p{L}]))|para\s+arriba|en\s+adelante)(?![\p{L}])`, "gu") },
  { op: "menor_igual", re: new RegExp(String.raw`(${N})\s+(?:o\s+menos(?!\s+del?(?![\p{L}]))|para\s+abajo)(?![\p{L}])`, "gu") },
  { op: "mayor_igual", re: new RegExp(String.raw`${SIN_LETRA_ANTES}(?:al\s+menos|como\s+m[ií]nimo|m[ií]nimo(?:\s+de)?|no\s+menos\s+de|a\s+partir\s+de|desde|mayor\s+o\s+igual\s+(?:a|que)|igual\s+o\s+(?:mayor|superior)\s+(?:a|que)|>=|≥)\s*(${N})`, "gu") },
  { op: "menor_igual", re: new RegExp(String.raw`${SIN_LETRA_ANTES}(?:como\s+m[aá]ximo|m[aá]ximo(?:\s+de)?|no\s+m[aá]s\s+de|a\s+lo\s+m[aá]s|a\s+lo\s+sumo|hasta|menor\s+o\s+igual\s+(?:a|que)|igual\s+o\s+(?:menor|inferior)\s+(?:a|que)|<=|≤)\s*(${N})`, "gu") },
  { op: "mayor", re: new RegExp(String.raw`${SIN_LETRA_ANTES}(?:m[aá]s\s+del?|mayor\s+(?:a|que)|por\s+encima\s+del?|encima\s+del?|arriba\s+del?|superior\s+al?|supera(?:\s+(?:los|las|el|la))?|>)\s*(${N})`, "gu") },
  { op: "menor", re: new RegExp(String.raw`${SIN_LETRA_ANTES}(?:menos\s+del?|menor\s+(?:a|que)|por\s+debajo\s+del?|debajo\s+del?|abajo\s+del?|inferior\s+al?|no\s+llega\s+a(?:l|\s+(?:los|las))?|no\s+alcanza(?:\s+(?:los|las|el|la))?|<)\s*(${N})`, "gu") },
  { op: "igual", re: new RegExp(String.raw`${SIN_LETRA_ANTES}(?:igual\s+a|exactamente|=)\s*(${N})`, "gu") },
];

/** Un número seguido de esto habla de tiempo, de veces o de una fecha, no del valor del indicador. */
const NO_ES_EL_VALOR = /^\s*(?:mes(?:es)?|semanas?|años?|veces|vez|trimestres?|quincenas?|per[ií]odos?|de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|sep?tiembre|octubre|noviembre|diciembre))(?![\p{L}])/u;
const UNE_Y = /(?:^|[^\p{L}])(?:y|e|pero|adem[aá]s)(?:[^\p{L}]|$)/u;
const UNE_O = /(?:^|[^\p{L}])(?:o|u)(?:[^\p{L}]|$)/u;

/** Lo que va pegado a una cifra y dice en qué está. Delante, la moneda; detrás, el porcentaje, la moneda o lo que se cuenta. */
const UNIDAD_DELANTE: [RegExp, UnidadEscrita][] = [[/^us\$/, "dolares"], [/^s\//, "soles"], [/^\$/, "moneda"]];
const UNIDAD_DETRAS: [RegExp, UnidadEscrita][] = [
  [/^\s*%/, "porcentaje"],
  [/^\s*(?:soles|sol|pen)(?![\p{L}])/u, "soles"],
  [/^\s*(?:d[oó]lares|usd)(?![\p{L}])/u, "dolares"],
  [/^\s*d[ií]as?(?![\p{L}])/u, "dias"],
  [/^\s*horas?(?![\p{L}])/u, "horas"],
  [/^\s*personas?(?![\p{L}])/u, "personas"],
  [/^\s*unidad(?:es)?(?![\p{L}])/u, "unidades"],
];
const unidadDelante = (cifra: string): UnidadEscrita | null => UNIDAD_DELANTE.find(([re]) => re.test(cifra.trim()))?.[1] ?? null;
const unidadDetras = (loQueSigue: string): UnidadEscrita | null => UNIDAD_DETRAS.find(([re]) => re.test(loQueSigue))?.[1] ?? null;

const DINERO: readonly UnidadEscrita[] = ["soles", "dolares", "moneda"];
/** Lo que un indicador de «cantidad» puede estar contando. */
const DE_CONTAR: readonly UnidadEscrita[] = ["personas", "unidades"];
const NOMBRE_UNIDAD: Record<UnidadEscrita, string> = {
  porcentaje: "porcentaje", de_cada_10: "de cada 10", soles: "soles", dolares: "dólares", moneda: "dinero", dias: "días", horas: "horas", personas: "personas", unidades: "unidades", otra: "otra escala",
};

/**
 * La unidad de un indicador dicha con las palabras de un criterio. null = una cantidad sin más («numero»);
 * undefined = una unidad que no se reconoce (no se sabe en qué está).
 */
export function unidadDeIndicador(unidad: string | null | undefined, moneda?: string | null): UnidadEscrita | null | undefined {
  switch (unidad) {
    case "soles": case "soles_por_hora": return "soles";
    case "moneda": {
      const m = (moneda ?? "").trim().toUpperCase();
      return m === "PEN" ? "soles" : m === "USD" ? "dolares" : "moneda";
    }
    case "de_cada_10": case "porcentaje": case "dias": case "horas": case "personas": case "unidades": return unidad;
    case "numero": return null;
    default: return undefined;
  }
}

/** La unidad con que alguien tecleó un valor suelto («70 %», «S/ 500»). undefined si no dijo ninguna: no se sabe en qué está. */
export function unidadDeLoEscrito(texto: string | null | undefined): UnidadEscrita | undefined {
  const t = (texto ?? "").toLowerCase().replace(/ /g, " ").trim().replace(/^[-−]\s*/, "");
  return unidadDelante(t) ?? unidadDetras(t.replace(/^[\d.,\s]*(?:(?:millones|mill[oó]n|mil|k)(?![\p{L}]))?/u, "")) ?? undefined;
}

/**
 * ¿Se puede comparar un criterio con un dato? Un criterio que no dice unidad habla en la del dato. Uno que
 * la dice solo se compara con un dato de esa misma unidad: «al menos 70 %» no dice nada de un «7 de cada 10».
 * `delDato`: undefined = no se sabe en qué está (un número escrito a mano, sin unidad); null = una cantidad
 * sin más, que solo admite criterios que cuentan personas o unidades. Dinero con dinero vale si la moneda
 * coincide o si alguno de los dos no la dice.
 */
export function mismaUnidad(delCriterio: UnidadEscrita | null, delDato: UnidadEscrita | null | undefined): boolean {
  if (delCriterio === null) return true;
  if (delCriterio === "otra") return false;
  if (delDato === undefined) return true;
  if (delDato === null) return DE_CONTAR.includes(delCriterio);
  if (DINERO.includes(delCriterio) && DINERO.includes(delDato)) return delCriterio === "moneda" || delDato === "moneda" || delCriterio === delDato;
  return delCriterio === delDato;
}

/**
 * Lee un criterio escrito como «al menos 7 de cada 10», «menos de 5», «entre 5 y 7» o «S/ 8,000 o más».
 * Devuelve null cuando está escrito en palabras, cuando el número habla de otra cosa (meses, veces, una
 * fecha), cuando trae varias condiciones que no se sabe si van juntas o cuando mezcla dos unidades: en
 * esos casos lo evalúa una persona. Prefiere no leer a leer mal. La unidad que el criterio dice se
 * conserva (`unidad`): sin ella «al menos 70 %» se compararía, mal, con un «7 de cada 10».
 */
export function leerCriterio(texto: string | null | undefined): CriterioLeido | null {
  if (!hay(texto)) return null;
  // «por ciento» se vuelve «%» sin mover nada de sitio: lo que sigue cuenta posiciones sobre este texto.
  const original = texto.toLowerCase().replace(/ /g, " ").replace(/\s*por\s+ciento(?![\p{L}])/gu, (m) => "%".padEnd(m.length));
  // «de cada 10» es la unidad, no un segundo número: se tapa para que no se lea como condición.
  let resto = original.replace(/\s+de\s+cada\s+\d+/g, (m) => " ".repeat(m.length));
  const halladas: { desde: number; hasta: number; c: Condicion }[] = [];
  const unidades = new Set<UnidadEscrita>();
  let ilegible = false;

  for (const { op, re } of PATRONES) {
    re.lastIndex = 0;
    resto = resto.replace(re, (todo: string, ...grupos: unknown[]) => {
      const desde = grupos[op === "entre" ? 2 : 1] as number;
      const hasta = desde + todo.length;
      const a = numeroEscrito(grupos[0] as string);
      const b = op === "entre" ? numeroEscrito(grupos[1] as string) : null;
      for (const cifra of op === "entre" ? [grupos[0] as string, grupos[1] as string] : [grupos[0] as string]) {
        const u = unidadDelante(cifra) ?? (/%\s*$/.test(cifra) ? "porcentaje" : null);
        if (u) unidades.add(u);
      }
      // Lo que sigue a la cifra se mira en el texto sin tapar: en «3 de cada 10 personas» la unidad es «de cada 10».
      const detras = unidadDetras(original.slice(hasta));
      if (detras) unidades.add(detras);
      if (typeof a !== "number" || (op === "entre" && typeof b !== "number") || NO_ES_EL_VALOR.test(resto.slice(hasta))) {
        ilegible = true;
      } else if (op === "entre") {
        halladas.push({ desde, hasta, c: { op, a: Math.min(a, b as number), b: Math.max(a, b as number) } });
      } else {
        halladas.push({ desde, hasta, c: { op, a } });
      }
      return " ".repeat(todo.length);
    });
  }
  for (const m of original.matchAll(/\sde\s+cada\s+(\d+)/g)) unidades.add(m[1] === "10" ? "de_cada_10" : "otra");
  // Dos unidades en un mismo criterio («más de 5 % y menos de 3 de cada 10») no se comparan con un solo dato.
  if (ilegible || halladas.length === 0 || unidades.size > 1) return null;
  const unidad = [...unidades][0] ?? null;
  halladas.sort((x, y) => x.desde - y.desde);
  if (halladas.length === 1) return { modo: "todas", condiciones: [halladas[0]!.c], unidad };

  let modo: CriterioLeido["modo"] | null = null;
  for (let k = 1; k < halladas.length; k++) {
    const entre = original.slice(halladas[k - 1]!.hasta, halladas[k]!.desde);
    const y = UNE_Y.test(entre);
    const o = UNE_O.test(entre);
    if (y === o) return null;
    const este = y ? "todas" : "alguna";
    if (modo && modo !== este) return null;
    modo = este;
  }
  return { modo: modo ?? "todas", condiciones: halladas.map((h) => h.c), unidad };
}

const comoNumero = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** La cifra con su unidad, como se le dice a una persona: «70 %», «7 de cada 10», «S/ 8,000», «12 días». */
function cifraCon(n: number, u: UnidadEscrita | null): string {
  const t = comoNumero(n);
  switch (u) {
    case "porcentaje": return `${t} %`;
    case "de_cada_10": return `${t} de cada 10`;
    case "soles": return `S/ ${t}`;
    case "dolares": return `US$ ${t}`;
    case "moneda": return `$ ${t}`;
    case "dias": return `${t} ${n === 1 ? "día" : "días"}`;
    case "horas": return `${t} ${n === 1 ? "hora" : "horas"}`;
    case "personas": return `${t} ${n === 1 ? "persona" : "personas"}`;
    case "unidades": return `${t} ${n === 1 ? "unidad" : "unidades"}`;
    default: return t;
  }
}

function textoCondicion(c: Condicion, u: UnidadEscrita | null = null): string {
  const v = (n: number) => cifraCon(n, u);
  switch (c.op) {
    case "mayor_igual": return `${v(c.a)} o más`;
    case "mayor": return `más de ${v(c.a)}`;
    case "menor_igual": return `${v(c.a)} o menos`;
    case "menor": return `menos de ${v(c.a)}`;
    case "igual": return `exactamente ${v(c.a)}`;
    // La moneda va delante de cada cifra («entre S/ 5,000 y S/ 8,000»); lo demás, una vez al final («entre 1 y 2 de cada 10»).
    case "entre": return `entre ${u && DINERO.includes(u) ? v(c.a) : comoNumero(c.a)} y ${v(c.b ?? c.a)}`;
  }
}

const enPalabras = (l: CriterioLeido, u: UnidadEscrita | null = l.unidad): string => l.condiciones.map((c) => textoCondicion(c, u)).join(l.modo === "todas" ? " y " : " o ");

export const TEXTO_EN_PALABRAS = "está escrito en palabras: lo evalúa una persona";
export const TEXTO_SIN_CRITERIO = "sin escribir";

/**
 * Cómo entendió el sistema un criterio, con su unidad. Se muestra junto al campo para que quien lo escribe
 * vea la lectura y la corrija. Si se le pasa la unidad del dato y no es la del criterio, lo dice: ese
 * criterio no se compara, lo evalúa una persona.
 */
export function comoSeLee(texto: string | null | undefined, delDato?: UnidadEscrita | null): string {
  if (!hay(texto)) return TEXTO_SIN_CRITERIO;
  const l = leerCriterio(texto);
  if (!l) return TEXTO_EN_PALABRAS;
  const leido = `se lee como: ${enPalabras(l)}`;
  const u = l.unidad;
  if (u === "otra") return `${leido}, en una escala que no es «de cada 10»: lo evalúa una persona`;
  if (u === null || mismaUnidad(u, delDato)) return leido;
  return `${leido}; el dato se mide en «${delDato ? NOMBRE_UNIDAD[delDato] : "cantidad"}», no en «${NOMBRE_UNIDAD[u]}»: lo evalúa una persona`;
}

/**
 * Un criterio como lo lee el dueño. Si está escrito con signos («≥ 40») y se pudo leer, va en palabras
 * («40 o más», con la unidad del dato si el criterio no dice ninguna); si no, tal como se escribió.
 */
export function criterioParaElDueno(texto: string | null | undefined, delDato?: UnidadEscrita | null): string | null {
  if (!hay(texto)) return null;
  if (!/[<>=≤≥]/.test(texto)) return texto.trim();
  const l = leerCriterio(texto);
  return !l || l.unidad === "otra" ? texto.trim() : enPalabras(l, l.unidad ?? delDato ?? null);
}

function cumpleCondicion(c: Condicion, v: number): boolean {
  switch (c.op) {
    case "mayor_igual": return v >= c.a;
    case "mayor": return v > c.a;
    case "menor_igual": return v <= c.a;
    case "menor": return v < c.a;
    case "igual": return v === c.a;
    case "entre": return v >= c.a && v <= (c.b ?? c.a);
  }
}

// ───────────────────────── EVALUAR LOS CRITERIOS: SIN DATO NO HAY VEREDICTO ─────────────────────────

export const SIN_DATO_PARA_EVALUAR = "sin dato para evaluar";

export type LecturaCriterio = {
  decision: Decision;
  texto: string | null;
  /** Cómo se entendió: «se lee como: 7 de cada 10 o más», «está escrito en palabras…», «sin escribir», o que está en otra unidad que el dato. */
  se_lee_como: string;
  /** true o false solo si hubo dato Y el criterio se pudo leer como número en la unidad del dato; null en cualquier otro caso. */
  cumple: boolean | null;
};

export type Evaluacion = {
  hay_dato: boolean;
  /** El criterio que se cumple, solo si es exactamente uno. Nunca hay veredicto sin dato. */
  veredicto: Decision | null;
  cumplen: Decision[];
  /** Los que no se comparan con el dato: vacíos, escritos en palabras o en otra unidad. Los evalúa una persona. */
  no_evaluables: Decision[];
  /** De esos, los que sí se leyeron como número pero dicen una unidad que no es la del dato. */
  de_otra_unidad: Decision[];
  criterios: LecturaCriterio[];
  texto: string;
};

const NOMBRE_DECISION: Record<Decision, string> = { continuar: "continuar", ajustar: "ajustar", detener: "detener" };

/**
 * Qué criterio se cumple con el valor del indicador. SOLO decide si hay valor: con `null`, `undefined` o
 * algo que no es un número devuelve «sin dato para evaluar», sin veredicto y sin marcar ningún criterio
 * como cumplido o incumplido. Cero es un dato. Si se cumplen dos a la vez, o ninguno, tampoco hay
 * veredicto: se dice qué pasó y decide una persona. `comoSeDice` es el valor en palabras del dueño
 * («6 de cada 10, setiembre de 2026»); si no se pasa, se escribe el número.
 *
 * `unidadDelDato` es en qué está ese valor (la unidad del indicador). Un criterio que dice otra unidad NO
 * se compara: ni se cumple ni se incumple, lo evalúa una persona. Sin esto, «al menos 70 %» y «menos de
 * 40 %» frente a un «7 de cada 10» daban «se cumple el criterio de detener»: un veredicto falso.
 */
export function evaluarCriterios(
  i: Pick<Iniciativa, "criterio_continuar" | "criterio_ajustar" | "criterio_detener">,
  valorIndicador: number | null | undefined,
  opciones: { comoSeDice?: string | null; unidadDelDato?: UnidadEscrita | null } = {}
): Evaluacion {
  const textos: Record<Decision, string | null> = { continuar: i.criterio_continuar, ajustar: i.criterio_ajustar, detener: i.criterio_detener };
  const hayDato = typeof valorIndicador === "number" && Number.isFinite(valorIndicador);
  const leidos: Record<Decision, CriterioLeido | null> = { continuar: leerCriterio(textos.continuar), ajustar: leerCriterio(textos.ajustar), detener: leerCriterio(textos.detener) };
  const seCumple = (l: CriterioLeido, v: number) => (l.modo === "todas" ? l.condiciones.every((c) => cumpleCondicion(c, v)) : l.condiciones.some((c) => cumpleCondicion(c, v)));
  /** Se leyó como número Y habla en la unidad del dato. Solo esos se comparan. */
  const comparable = (d: Decision): boolean => {
    const l = leidos[d];
    return l !== null && mismaUnidad(l.unidad, opciones.unidadDelDato);
  };
  const criterios: LecturaCriterio[] = DECISIONES.map((decision) => {
    const leido = leidos[decision];
    return {
      decision,
      texto: textoONull(textos[decision]),
      se_lee_como: comoSeLee(textos[decision], opciones.unidadDelDato),
      cumple: hayDato && leido && comparable(decision) ? seCumple(leido, valorIndicador as number) : null,
    };
  });
  const ilegibles = DECISIONES.filter((d) => leidos[d] === null);
  const de_otra_unidad = DECISIONES.filter((d) => leidos[d] !== null && !comparable(d));
  const no_evaluables = DECISIONES.filter((d) => !comparable(d));
  const comun = { no_evaluables, de_otra_unidad, criterios };

  if (!hayDato) return { hay_dato: false, veredicto: null, cumplen: [], ...comun, texto: SIN_DATO_PARA_EVALUAR };

  const cumplen = criterios.filter((c) => c.cumple === true).map((c) => c.decision);
  const valor = hay(opciones.comoSeDice) ? opciones.comoSeDice.trim() : comoNumero(valorIndicador as number);
  const frase = (ds: Decision[], uno: string, varios: string): string =>
    ds.length === 0 ? "" : ds.length === 1 ? ` El criterio de ${NOMBRE_DECISION[ds[0]!]} ${uno}: lo evalúa una persona.` : ` Los criterios de ${ds.map((d) => NOMBRE_DECISION[d]).join(" y de ")} ${varios}: los evalúa una persona.`;
  const aparte = frase(ilegibles, "no se puede leer como número", "no se pueden leer como número") + frase(de_otra_unidad, "está en otra unidad que el dato", "están en otra unidad que el dato");

  if (no_evaluables.length === DECISIONES.length) {
    const texto = de_otra_unidad.length === 0
      ? `Hay dato (${valor}), pero los tres criterios están escritos en palabras: los evalúa una persona.`
      : de_otra_unidad.length === DECISIONES.length
        ? `Hay dato (${valor}), pero los tres criterios están en otra unidad que el dato: los evalúa una persona.`
        : `Hay dato (${valor}), pero ningún criterio se puede comparar con él.${aparte}`;
    return { hay_dato: true, veredicto: null, cumplen: [], ...comun, texto };
  }
  if (cumplen.length === 1) {
    return { hay_dato: true, veredicto: cumplen[0]!, cumplen, ...comun, texto: `Con ${valor} se cumple el criterio de ${NOMBRE_DECISION[cumplen[0]!]}.${aparte}` };
  }
  if (cumplen.length > 1) {
    return { hay_dato: true, veredicto: null, cumplen, ...comun, texto: `Con ${valor} se cumplen a la vez los criterios de ${cumplen.map((d) => NOMBRE_DECISION[d]).join(" y de ")}: están escritos de forma que se pisan. Decide una persona, y conviene corregirlos.${aparte}` };
  }
  return { hay_dato: true, veredicto: null, cumplen: [], ...comun, texto: `Con ${valor} no se cumple ninguno de los criterios que se pueden comparar con él.${aparte || " Hay un hueco entre ellos: conviene corregirlos."}` };
}

// ───────────────────────── EL VALOR CON EL QUE SE EVALÚA ─────────────────────────

/** Lo que hace falta saber del indicador enlazado. Sale de una fila de `indicadores`. */
export type IndicadorDeIniciativa = {
  id: string;
  nombre: string;
  unidad: Unidad;
  moneda?: string | null;
  valor_actual: number | null;
  valor_actual_periodo: string | null;
  estado_validacion: EstadoValidacion | null;
};

export type ValorParaEvaluar = {
  /** null = no hay dato que sirva para evaluar esta iniciativa. */
  valor: number | null;
  periodo: string | null;
  calidad: EstadoValidacion | null;
  /** El valor dicho como lo lee el dueño; null si no hay. */
  como_se_dice: string | null;
  /** Por qué no hay dato, cuando no lo hay. */
  por_que_no: string | null;
  /** En qué está el indicador enlazado, aunque todavía no tenga valor: null = una cantidad sin más; undefined = no hay indicador. */
  unidad: UnidadEscrita | null | undefined;
};

const sinValor = (por_que_no: string, unidad?: UnidadEscrita | null): ValorParaEvaluar => ({ valor: null, periodo: null, calidad: null, como_se_dice: null, por_que_no, unidad });

/**
 * El valor del indicador que sirve para evaluar la iniciativa, o por qué no hay. Un valor de antes de que
 * la iniciativa empezara no dice nada de ella, y un indicador cuyo último registro fue «sin dato» tampoco:
 * en los dos casos se devuelve «sin dato», no el número viejo.
 */
export function valorParaEvaluar(i: Pick<Iniciativa, "indicador_id" | "plazo_inicio">, k: IndicadorDeIniciativa | null | undefined): ValorParaEvaluar {
  if (!i.indicador_id || !k) return sinValor("La iniciativa no tiene un indicador enlazado: su medida de éxito la comprueba una persona.");
  const unidad = unidadDeIndicador(k.unidad, k.moneda);
  if (k.valor_actual == null) return sinValor(`El indicador «${k.nombre}» todavía no tiene ningún valor registrado.`, unidad);
  if (k.estado_validacion === "sin_dato") return sinValor(`Lo último que se anotó en «${k.nombre}» fue «sin dato».`, unidad);
  if (!esFechaISO(i.plazo_inicio)) return sinValor("La iniciativa todavía no tiene fecha de inicio: no hay nada que evaluar.", unidad);
  const fin = k.valor_actual_periodo ? finDePeriodo(k.valor_actual_periodo) : null;
  if (!fin) return sinValor(`El último valor de «${k.nombre}» no dice de qué periodo es.`, unidad);
  if (fin.getTime() <= new Date(`${i.plazo_inicio}T00:00:00Z`).getTime()) {
    return sinValor(`El último valor de «${k.nombre}» es de ${nombreDePeriodoKpi(k.valor_actual_periodo)}, anterior al inicio de la iniciativa: todavía no dice nada de ella.`, unidad);
  }
  return {
    valor: k.valor_actual,
    periodo: k.valor_actual_periodo,
    calidad: k.estado_validacion,
    como_se_dice: `${textoValor(k.unidad, k.valor_actual, k.moneda)} (${nombreDePeriodoKpi(k.valor_actual_periodo)})`,
    por_que_no: null,
    unidad,
  };
}

/** Las dos cosas juntas: el valor que sirve (o por qué no hay) y lo que dicen los criterios con él. */
export function evaluarConIndicador(i: Pick<Iniciativa, "indicador_id" | "plazo_inicio" | "criterio_continuar" | "criterio_ajustar" | "criterio_detener">, k: IndicadorDeIniciativa | null | undefined): Evaluacion & { valor: ValorParaEvaluar } {
  const valor = valorParaEvaluar(i, k);
  return { ...evaluarCriterios(i, valor.valor, { comoSeDice: valor.como_se_dice, unidadDelDato: valor.unidad }), valor };
}

// ───────────────────────── TRANSICIONES ─────────────────────────

export type Rol = "consultor" | "cliente" | "sistema";
export type Actor = { id: string | null; rol: Rol };

/** Lo que se observó al decidir continuar, ajustar o detener. */
export type EvidenciaDecision = {
  que_se_observo?: string | null;
  /** El valor del indicador con el que se decide. null o ausente = se decide sin dato del indicador, y queda dicho. */
  valor_indicador?: number | null;
  periodo?: string | null;
  /** El valor dicho en palabras, para el historial. */
  como_se_dice?: string | null;
  /** En qué está ese valor (la unidad del indicador). Ausente = no se sabe: un número escrito a mano sin unidad. */
  unidad?: UnidadEscrita | null;
  evidencia_ids?: string[];
};

export type Contexto = { ahora?: Date; zona?: string; levantamiento?: Levantamiento };

export type FilaHistorial = {
  iniciativa_id: string;
  /** null solo en la fila que anota que la iniciativa se propuso. */
  de_estado: Estado | null;
  a_estado: Estado;
  motivo: string | null;
  evidencia: Record<string, unknown> | null;
  actor_id: string | null;
};

export type ResultadoTransicion =
  | { ok: false; error: string; faltan?: Faltante[] }
  | {
      ok: true;
      estado: Estado;
      /** La autoridad que quien escribe debe exigir ANTES de escribir; null si el paso no la pide. */
      autoridad: AccionAutoridad | null;
      cambios: Record<string, unknown>;
      historial: FilaHistorial;
      /** Algo que la consultora debe saber y que no impide el paso (por ejemplo, decidir distinto de lo que dice el criterio). */
      aviso: string | null;
    };

/** Aprobar compromete a la empresa con una apuesta; continuar, ajustar o detener es volver a decidir sobre ella. */
export function autoridadNecesaria(aEstado: Estado): AccionAutoridad | null {
  return aEstado === "aprobada" || esDecision(aEstado) ? "aprobar_plan" : null;
}

export const ERROR_SOLO_CONSULTORA = "Las decisiones sobre una iniciativa las registra la consultora.";
export const ERROR_SIN_MOTIVO = `Di por qué en una frase (al menos ${MIN_LETRAS} letras).`;
export const ERROR_SIN_EVIDENCIA = "Continuar, ajustar o detener se decide con evidencia: escribe qué se observó.";

/**
 * UN PASO EN LA TABLA. No toca la base: devuelve qué columnas cambian y la fila de historial, o el error.
 *  · aprobar exige la ficha completa (`completitud`) y que su propia evidencia esté disponible
 *    (`pertinencia`, si se pasa el levantamiento); pide la autoridad «aprobar_plan».
 *  · continuar, ajustar y detener exigen motivo y evidencia de lo observado, y piden la misma autoridad.
 *    Si hay valor del indicador se anota qué criterio se cumplía; si la decisión es otra, queda dicho.
 *  · descartar una propuesta, cerrar algo que se había decidido continuar y reanudar tras un ajuste
 *    exigen motivo.
 *  · empezar pone la fecha de inicio si no la tenía.
 */
export function transicion(
  iniciativa: Iniciativa,
  aEstado: Estado,
  actor: Actor,
  motivo?: string | null,
  evidencia?: EvidenciaDecision | null,
  contexto: Contexto = {}
): ResultadoTransicion {
  const de = iniciativa.estado;
  if (!esEstado(de)) return { ok: false, error: "La iniciativa tiene un estado que no se reconoce." };
  if (!esEstado(aEstado)) return { ok: false, error: "Ese estado no existe." };
  const permitidos = TRANSICIONES[de];
  if (!permitidos.includes(aEstado)) {
    const salida = permitidos.length ? `Desde aquí solo se puede: ${permitidos.map((e) => verboDe(de, e).toLowerCase()).join(", ")}.` : "Ya no admite más pasos.";
    return { ok: false, error: `Una iniciativa en «${ESTADO_CONSULTOR[de]}» no puede pasar a «${ESTADO_CONSULTOR[aEstado]}». ${salida}` };
  }
  if (actor.rol !== "consultor") return { ok: false, error: ERROR_SOLO_CONSULTORA };

  const ahora = contexto.ahora ?? new Date();
  const sello = ahora.toISOString();
  const porQue = hay(motivo) ? motivo.trim() : null;
  const cambios: Record<string, unknown> = { estado: aEstado, updated_at: sello };
  const decide = () => Object.assign(cambios, { decision_at: sello, decision_por: actor.id, decision_motivo: porQue });
  let detalle: Record<string, unknown> | null = null;
  let aviso: string | null = null;

  if (aEstado === "aprobada") {
    const faltan = completitud(iniciativa);
    if (faltan.length) return { ok: false, error: `No se puede aprobar todavía. Falta: ${faltan.map((f) => f.etiqueta.toLowerCase()).join(", ")}.`, faltan };
    const p = pertinencia(iniciativa, contexto.levantamiento);
    if (!p.puede_avanzar) return { ok: false, error: `No se puede aprobar todavía. ${p.pide.join(" ")}` };
    if (p.avisos.length) aviso = p.avisos.join(" ");
    detalle = { ficha_completa: true, evidencias: iniciativa.evidencia_ids.length, fuentes_aportadas: iniciativa.fuentes_aportadas.length, no_la_impide: p.no_la_impide };
    decide();
  } else if (esDecision(aEstado)) {
    if (!dice(porQue)) return { ok: false, error: ERROR_SIN_MOTIVO };
    const observado = (evidencia?.que_se_observo ?? "").trim();
    if (!dice(observado)) return { ok: false, error: ERROR_SIN_EVIDENCIA };
    const e = evaluarCriterios(iniciativa, evidencia?.valor_indicador, { comoSeDice: evidencia?.como_se_dice, unidadDelDato: evidencia?.unidad });
    if (e.veredicto && e.veredicto !== aEstado) {
      aviso = `Se decide ${NOMBRE_DECISION[aEstado]}, y con el dato disponible el criterio que se cumple es el de ${NOMBRE_DECISION[e.veredicto]}. Queda anotado en el historial.`;
    } else if (!e.hay_dato) {
      aviso = "Se decide sin dato del indicador: la decisión se apoya solo en lo observado. Queda anotado en el historial.";
    }
    detalle = {
      que_se_observo: observado,
      valor_indicador: e.hay_dato ? (evidencia?.valor_indicador as number) : null,
      periodo: e.hay_dato ? evidencia?.periodo ?? null : null,
      evidencia_ids: evidencia?.evidencia_ids ?? [],
      evaluacion: e.texto,
      criterio_que_se_cumple: e.veredicto,
      coincide_con_el_criterio: e.veredicto ? e.veredicto === aEstado : null,
    };
    decide();
  } else if (aEstado === "cerrada") {
    if (de !== "detener" && !dice(porQue)) {
      return { ok: false, error: de === "propuesta" ? `Para descartar una propuesta di por qué (al menos ${MIN_LETRAS} letras): así no se vuelve a proponer igual.` : `Para cerrarla di cómo terminó (al menos ${MIN_LETRAS} letras).` };
    }
    if (de !== "detener") decide();
  } else if (aEstado === "en_curso") {
    if (de === "ajustar" && !dice(porQue)) return { ok: false, error: `Antes de reanudar di qué se ajustó (al menos ${MIN_LETRAS} letras).` };
    if (de === "aprobada" && !esFechaISO(iniciativa.plazo_inicio)) cambios.plazo_inicio = diaEnZona(ahora, contexto.zona);
  }

  return {
    ok: true,
    estado: aEstado,
    autoridad: autoridadNecesaria(aEstado),
    cambios,
    historial: { iniciativa_id: iniciativa.id, de_estado: de, a_estado: aEstado, motivo: porQue, evidencia: detalle, actor_id: actor.id },
    aviso,
  };
}

// ───────────────────────── CREAR Y EDITAR LA FICHA ─────────────────────────

/** Los campos de la ficha que se escriben a mano. El estado, la decisión y las fuentes aportadas tienen su propio camino. */
export const CAMPOS_EDITABLES = [
  "dominio", "titulo", "hipotesis", "evidencia_ids", "pendiente_investigacion", "recursos", "plazo_inicio", "plazo_fin", "medida_exito",
  "indicador_id", "criterio_continuar", "criterio_ajustar", "criterio_detener", "responsable_participant_id",
] as const;
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];
export type CambiosFicha = Partial<Pick<Iniciativa, CampoEditable>>;

const OBLIGATORIOS_SIEMPRE: readonly CampoEditable[] = ["titulo", "hipotesis", "medida_exito"];
const ETIQUETA_CAMPO: Record<CampoEditable, string> = {
  dominio: "Dominio", titulo: "Título", hipotesis: "Hipótesis", evidencia_ids: "Evidencias", pendiente_investigacion: "Pendiente de investigar",
  recursos: "Recursos", plazo_inicio: "Inicio", plazo_fin: "Cierre", medida_exito: "Medida de éxito", indicador_id: "Indicador",
  criterio_continuar: "Criterio para continuar", criterio_ajustar: "Criterio para ajustar", criterio_detener: "Criterio para detener",
  responsable_participant_id: "Responsable",
};
export const etiquetaDeCampo = (campo: string): string => (ETIQUETA_CAMPO as Record<string, string>)[campo] ?? campo.replace(/_/g, " ");

/** Lo escrito a mano, limpio: textos recortados, vacío como null, y solo campos editables. */
function limpiar(cambios: Record<string, unknown>): CambiosFicha {
  const fuera: Record<string, unknown> = {};
  for (const k of CAMPOS_EDITABLES) {
    if (!(k in cambios) || cambios[k] === undefined) continue;
    const v = cambios[k];
    if (k === "evidencia_ids") fuera[k] = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
    else if (OBLIGATORIOS_SIEMPRE.includes(k) || k === "dominio") fuera[k] = typeof v === "string" ? v.trim() : "";
    else fuera[k] = textoONull(v);
  }
  return fuera as CambiosFicha;
}

/** Lo que una ficha no puede tener nunca, esté en el estado que esté. null si está bien. */
function errorDeForma(i: Iniciativa): string | null {
  if (!esDominio(i.dominio)) return "Ese dominio no es uno de los quince.";
  if (letrasDe(i.titulo) < 3) return "Ponle un título que se entienda solo.";
  if (!dice(i.hipotesis)) return `Escribe la hipótesis: qué creemos que va a pasar y por qué (al menos ${MIN_LETRAS} letras).`;
  if (!dice(i.medida_exito)) return `Escribe la medida de éxito: cómo sabremos que funcionó (al menos ${MIN_LETRAS} letras).`;
  for (const k of ["plazo_inicio", "plazo_fin"] as const) if (i[k] != null && !esFechaISO(i[k])) return `La fecha de ${k === "plazo_inicio" ? "inicio" : "cierre"} se escribe AAAA-MM-DD.`;
  if (esFechaISO(i.plazo_inicio) && esFechaISO(i.plazo_fin) && i.plazo_inicio > i.plazo_fin) return "La fecha de cierre es anterior a la de inicio.";
  if (exigePendienteDeInvestigacion(i) && !dice(i.pendiente_investigacion)) return TEXTO_PENDIENTE_MERCADO;
  return null;
}

export type DatosNueva = Record<string, unknown> & { fuente_aportada?: NuevaFuente | null };

export type ResultadoNueva = { ok: true; fila: Record<string, unknown>; historial: Omit<FilaHistorial, "iniciativa_id"> } | { ok: false; error: string };

/**
 * Una iniciativa nueva, siempre como propuesta. Exige lo mínimo para que sea una iniciativa y no un
 * título: dominio, título, hipótesis y medida de éxito. Y si es de mercado y competencia, una fuente
 * aportada o lo que queda pendiente de investigar. Lo demás se completa después y `completitud` lo pide
 * antes de aprobar.
 */
export function nueva(companyId: string, datos: DatosNueva, actor: Actor, hoy?: string): ResultadoNueva {
  if (actor.rol !== "consultor") return { ok: false, error: "Una iniciativa la propone la consultora." };
  if (!esDominio(datos.dominio)) return { ok: false, error: "Ese dominio no es uno de los quince." };
  let i = iniciativaVacia({ ...limpiar(datos), company_id: companyId, estado: "propuesta", creada_por: actor.id });
  if (datos.fuente_aportada) {
    const r = registrarFuenteAportada(i, datos.fuente_aportada, hoy);
    if (!r.ok) return r;
    i = r.iniciativa;
  }
  const error = errorDeForma(i);
  if (error) return { ok: false, error };
  const fila: Record<string, unknown> = { company_id: companyId, estado: "propuesta", creada_por: actor.id, fuentes_aportadas: i.fuentes_aportadas };
  for (const k of CAMPOS_EDITABLES) fila[k] = i[k];
  return { ok: true, fila, historial: { de_estado: null, a_estado: "propuesta", motivo: "Se propuso la iniciativa", evidencia: null, actor_id: actor.id } };
}

export type ResultadoEdicion =
  | { ok: false; error: string; faltan?: Faltante[] }
  | { ok: true; sin_cambios: true }
  | { ok: true; sin_cambios: false; autoridad: AccionAutoridad | null; cambios: Record<string, unknown>; historial: FilaHistorial; iniciativa: Iniciativa };

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * La ficha se edita. Mientras es propuesta, se completa sin más y queda rastro de qué cambió. Una vez
 * aprobada, cambiarla es volver a decidir: pide motivo, pide la autoridad de aprobar y no puede quedar
 * incompleta. Lo detenido y lo cerrado ya no se edita: el historial es lo que queda.
 */
export function editar(iniciativa: Iniciativa, cambiosCrudos: Record<string, unknown>, actor: Actor, motivo?: string | null, ahora: Date = new Date()): ResultadoEdicion {
  if (actor.rol !== "consultor") return { ok: false, error: "La ficha de una iniciativa la edita la consultora." };
  if (iniciativa.estado === "detener" || iniciativa.estado === "cerrada") return { ok: false, error: "Una iniciativa detenida o cerrada ya no se edita. Si la idea vuelve, se propone una nueva." };
  const limpios = limpiar(cambiosCrudos) as Record<string, unknown>;
  const distintos = Object.fromEntries(Object.entries(limpios).filter(([k, v]) => !igual((iniciativa as Record<string, unknown>)[k], v)));
  if (!Object.keys(distintos).length) return { ok: true, sin_cambios: true };

  const despues: Iniciativa = { ...iniciativa, ...(distintos as CambiosFicha) };
  const error = errorDeForma(despues);
  if (error) return { ok: false, error };

  const decidida = iniciativa.estado !== "propuesta";
  const porQue = hay(motivo) ? motivo.trim() : null;
  if (decidida) {
    if (!dice(porQue)) return { ok: false, error: `Esta iniciativa ya está aprobada: para cambiarla di por qué (al menos ${MIN_LETRAS} letras). Queda en el historial.` };
    const faltan = completitud(despues);
    if (faltan.length) return { ok: false, error: `Una iniciativa aprobada no puede quedar incompleta. Faltaría: ${faltan.map((f) => f.etiqueta.toLowerCase()).join(", ")}.`, faltan };
  }
  const antes = Object.fromEntries(Object.keys(distintos).map((k) => [k, (iniciativa as Record<string, unknown>)[k] ?? null]));
  return {
    ok: true,
    sin_cambios: false,
    autoridad: decidida ? "aprobar_plan" : null,
    cambios: { ...distintos, updated_at: ahora.toISOString() },
    historial: {
      iniciativa_id: iniciativa.id, de_estado: iniciativa.estado, a_estado: iniciativa.estado,
      motivo: porQue ?? "Se completó la ficha", evidencia: { cambios: Object.fromEntries(Object.keys(distintos).map((k) => [k, { antes: antes[k], despues: distintos[k] ?? null }])) }, actor_id: actor.id,
    },
    iniciativa: despues,
  };
}

/** Añadir una fuente aportada con su fila de historial. Sumar sustento no es volver a decidir: no pide motivo ni autoridad. */
export function agregarFuente(iniciativa: Iniciativa, fuente: NuevaFuente, actor: Actor, hoy?: string, ahora: Date = new Date()): { ok: false; error: string } | { ok: true; cambios: Record<string, unknown>; historial: FilaHistorial; iniciativa: Iniciativa } {
  if (actor.rol !== "consultor") return { ok: false, error: "Las fuentes aportadas las registra la consultora." };
  if (iniciativa.estado === "detener" || iniciativa.estado === "cerrada") return { ok: false, error: "Una iniciativa detenida o cerrada ya no recibe fuentes." };
  const r = registrarFuenteAportada(iniciativa, fuente, hoy);
  if (!r.ok) return r;
  return {
    ok: true,
    iniciativa: r.iniciativa,
    cambios: { fuentes_aportadas: r.iniciativa.fuentes_aportadas, updated_at: ahora.toISOString() },
    historial: { iniciativa_id: iniciativa.id, de_estado: iniciativa.estado, a_estado: iniciativa.estado, motivo: `Se registró una fuente aportada: ${r.fuente.nombre}`, evidencia: { fuente_aportada: r.fuente }, actor_id: actor.id },
  };
}

// ───────────────────────── LECTURAS PARA LAS PANTALLAS ─────────────────────────

/** Una regla incumplida, para que la ruta la devuelva como 400 con su mensaje. */
export class ReglaDeIniciativa extends Error {
  constructor(mensaje: string, public readonly faltan?: Faltante[]) {
    super(mensaje);
    this.name = "ReglaDeIniciativa";
  }
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"] as const;

/**
 * Una fecha de calendario (AAAA-MM-DD) dicha en corto: «30 nov 2026». Se lee como día, no como instante,
 * y se arma a mano: así el navegador no la corre un día y sale idéntica en el servidor y en el navegador.
 */
export function diaCorto(iso: string | null | undefined): string {
  if (!esFechaISO(iso)) return "sin fecha";
  const [a, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`;
}

/** El plazo en una frase: «del 1 sept 2026 al 30 nov 2026», «hasta el 30 nov 2026» o «sin plazo todavía». */
export function plazoEnPalabras(inicio: string | null | undefined, fin: string | null | undefined): string {
  if (!esFechaISO(fin)) return esFechaISO(inicio) ? `desde el ${diaCorto(inicio)}, sin fecha de cierre` : "sin plazo todavía";
  return esFechaISO(inicio) ? `del ${diaCorto(inicio)} al ${diaCorto(fin)}` : `hasta el ${diaCorto(fin)}`;
}

/** Un instante dicho como el día que vivía la empresa (su zona; si no se reconoce, la de por defecto). Sale igual en el servidor y en el navegador. */
export function momentoCorto(iso: string | null | undefined, zona: string): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "sin fecha";
  return diaCorto(diaEnZona(d, zona));
}

/** El plazo se cumplió y sigue aprobada o en curso: toca decidir. */
export function tocaDecidir(i: Pick<Iniciativa, "estado" | "plazo_fin">, hoy: string): boolean {
  return (i.estado === "aprobada" || i.estado === "en_curso") && esFechaISO(i.plazo_fin) && i.plazo_fin < hoy;
}

/** Los quince dominios en su orden, cada uno con sus iniciativas (también los vacíos: un dominio sin apuestas es información). */
export function porDominio<T extends Pick<Iniciativa, "dominio">>(iniciativas: readonly T[]): { dominio: DefDominio; iniciativas: T[] }[] {
  return DOMINIOS.map((dominio) => ({ dominio, iniciativas: iniciativas.filter((i) => i.dominio === dominio.clave) }));
}

/** Lo que viaja al portal del dueño. Ni el motivo de las decisiones, ni los recursos, ni quién aportó cada fuente, ni identificadores internos. */
export type IniciativaCliente = {
  id: string;
  tema: string;
  pregunta: string;
  titulo: string;
  que_creemos: string;
  como_sabremos: string;
  plazo_inicio: string | null;
  plazo_fin: string | null;
  estado: string;
  seguimos_si: string | null;
  ajustamos_si: string | null;
  paramos_si: string | null;
  falta_averiguar: string | null;
  en_que_nos_basamos: string[];
  responsable_puesto: string | null;
  /** El último valor del indicador en palabras y de dónde sale (declarado, de un documento, conciliado, verificado), o por qué todavía no hay. */
  como_va: string;
};

export const CLAVES_INTERNAS = ["decision_motivo", "decision_por", "decision_at", "recursos", "evidencia_ids", "fuentes_aportadas", "creada_por", "responsable_participant_id", "indicador_id", "company_id"] as const;

/**
 * La fila del dueño. Devuelve null si el estado no es de los que él ve: aunque alguien le pase una
 * propuesta por error, de aquí no sale.
 */
export function filaCliente(i: Iniciativa, extra: { indicador?: IndicadorDeIniciativa | null; responsable_puesto?: string | null } = {}): IniciativaCliente | null {
  if (!visibleParaCliente(i.estado)) return null;
  const d = dominioDe(i.dominio);
  const v = valorParaEvaluar(i, extra.indicador);
  // De dónde sale el número se dice siempre junto a él, con las mismas palabras que el resto del portal.
  const deDondeSale = v.calidad ? `Este dato: ${VALIDACION_TEXTO[v.calidad]}.` : "No está anotado de dónde salió este dato.";
  return {
    id: i.id,
    tema: d?.nombre ?? "",
    pregunta: d?.pregunta ?? "",
    titulo: i.titulo,
    que_creemos: i.hipotesis,
    como_sabremos: i.medida_exito,
    plazo_inicio: i.plazo_inicio,
    plazo_fin: i.plazo_fin,
    estado: ESTADO_CLIENTE[i.estado] ?? "En curso",
    seguimos_si: criterioParaElDueno(i.criterio_continuar, v.unidad),
    ajustamos_si: criterioParaElDueno(i.criterio_ajustar, v.unidad),
    paramos_si: criterioParaElDueno(i.criterio_detener, v.unidad),
    falta_averiguar: i.pendiente_investigacion,
    en_que_nos_basamos: i.fuentes_aportadas.map((f) => f.nombre),
    responsable_puesto: extra.responsable_puesto ?? null,
    como_va: v.como_se_dice ? `Hoy va en ${v.como_se_dice}. ${deDondeSale}` : i.indicador_id ? "Todavía no hay un dato que sirva para saber cómo va." : "Se comprueba mirando lo que pasa, no con un número.",
  };
}

// ───────────────────────── LA INICIATIVA CON LO QUE LA PANTALLA DE LA CONSULTORA NECESITA ─────────────────────────

export type FilaHistorialLeida = {
  id: string;
  iniciativa_id: string;
  de_estado: string | null;
  a_estado: string;
  motivo: string | null;
  evidencia: Record<string, unknown> | null;
  actor_id: string | null;
  actor_nombre: string | null;
  created_at: string | null;
};

export type ClaseEvidencia = "hallazgo" | "fuente" | "afirmacion";
export const CLASE_EVIDENCIA: Record<ClaseEvidencia, string> = { hallazgo: "Hallazgos del diagnóstico", fuente: "Fuentes de la empresa", afirmacion: "Afirmaciones confirmadas" };

/** Una evidencia de la empresa que se puede citar. `falta` dice por qué todavía no sirve de sustento (sin leer, contradicha, rechazada); null si sirve. */
export type EvidenciaDisponible = { id: string; clase: ClaseEvidencia; texto: string; falta: string | null };

export type PersonaDeLaEmpresa = { id: string; nombre: string; puesto?: string | null; rol?: string | null };
export type IndicadorBreve = { id: string; nombre: string; unidad: string | null; moneda?: string | null };

export type IniciativaConContexto = Iniciativa & {
  /** Lo que falta para aprobarla. */
  falta: Faltante[];
  avance: { completas: number; total: number };
  pertinencia: Pertinencia;
  evaluacion: Evaluacion & { valor: ValorParaEvaluar };
  /** El plazo se cumplió y nadie ha decidido. */
  toca_decidir: boolean;
  responsable_nombre: string | null;
  indicador_nombre: string | null;
  historial: FilaHistorialLeida[];
};

/** Lo que la pantalla muestra de una iniciativa, calculado de una vez y con la fecha de la petición. */
export function conContexto(
  i: Iniciativa,
  c: { hoy: string; indicador?: IndicadorDeIniciativa | null; levantamiento?: Levantamiento; responsable_nombre?: string | null; historial?: FilaHistorialLeida[] }
): IniciativaConContexto {
  return {
    ...i,
    falta: completitud(i),
    avance: avanceDeFicha(i),
    pertinencia: pertinencia(i, c.levantamiento),
    evaluacion: evaluarConIndicador(i, c.indicador),
    toca_decidir: tocaDecidir(i, c.hoy),
    responsable_nombre: c.responsable_nombre ?? null,
    indicador_nombre: c.indicador?.nombre ?? null,
    historial: c.historial ?? [],
  };
}

/** Lo que carga la pantalla de la consultora. `disponible: false` cuando la base todavía no tiene las tablas: se dice, no se finge un tablero vacío. */
export type Tablero =
  | { disponible: false; motivo: string }
  | {
      disponible: true;
      /** El día de calendario que vive la empresa al pedir la pantalla, y su zona horaria. */
      hoy: string;
      zona: string;
      iniciativas: IniciativaConContexto[];
      participantes: PersonaDeLaEmpresa[];
      indicadores: IndicadorBreve[];
      evidencias: EvidenciaDisponible[];
    };

export const SIN_MIGRACION_INICIATIVAS =
  "Esta base todavía no tiene las tablas de iniciativas (falta aplicar supabase/migracion-excelencia-y-cartera.sql). Hasta entonces no se puede proponer ni decidir nada aquí.";
