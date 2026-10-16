/**
 * LA REVISIÓN SEMANAL: LAS SIETE PREGUNTAS DE DIRECCIÓN, CONTESTADAS CON LO QUE HAY EN LA BASE (sección 13, R13.2).
 *
 * Cada lunes la consultora y la empresa miran la semana que terminó (lunes a domingo) y contestan, en
 * orden: qué debía ocurrir, qué ocurrió, con qué evidencia, qué se desvió, por qué (la explicación la
 * escribe una persona), qué decisión hace falta y qué viene la semana próxima. Este módulo arma las
 * cinco respuestas que salen de los datos y deja en blanco las que son de la consultora.
 *
 * Reglas que no se negocian:
 *  1. UNA TAREA CUMPLIDA NO ES UN RESULTADO. Lo reportado y lo verificado es ejecución. Si no hay un corte
 *     posterior al punto de partida, la revisión dice «sin medición de resultado todavía»; nunca suma tareas
 *     hechas como si fueran mejora financiera.
 *  2. LA FALTA DE DATOS NO ES CERO. Un indicador sin valor en el periodo que cerró se anota como «sin dato»;
 *     no se produce un cero ni un «cumplido». Lo que no se puede juzgar todavía (una fecha que no llegó) se
 *     deja en `cumplido: null`, no en falso.
 *  3. CADA DESVÍO PROPONE LA DECISIÓN QUE EXIGE, con nombre y apellido: «reasignar responsable», «registrar
 *     el valor de setiembre», «reprogramar el plazo con motivo e implicación». La decisión tomada la escribe
 *     la consultora; lo derivado se muestra al lado, nunca se confunde con lo decidido.
 *  4. LO QUE ESCRIBIÓ UNA PERSONA NO SE PISA. `guardar` hace upsert por (company_id, semana) y conserva
 *     explicación, decisión y siguiente si ya tenían texto; lo derivado (las cuatro listas) se refresca.
 *  5. TODO ES DETERMINISTA. No hay IA: con la misma base y la misma fecha sale la misma revisión.
 *  6. LA REVISIÓN NO PONE PALABRAS EN BOCA DE NADIE. La propuesta del sistema se muestra aparte y solo pasa a
 *     ser decisión cuando la consultora la toma («Usar esta propuesta») o la escribe; guardar manda únicamente
 *     lo que ella editó (`cuerpoDeGuardado`, `aplicarEscrito`). Lo que hizo el sistema lo firma «El sistema», no
 *     una persona. Quién revisó y cuándo se guarda en `revisada_por` y `revisada_at`, no en `creada_por`. La
 *     primera marca manda: volver a marcar una semana ya revisada no cambia quién la revisó ni cuándo. En una base
 *     sin supabase/migracion-revision-revisada.sql la marca va donde iba antes (`creada_por`, sin fecha) y se dice.
 *  7. LOS DÍAS SON LOS DE LA EMPRESA. Un instante cae en el día que marca el reloj de la empresa (su
 *     `zona_horaria`, o America/Lima), no en el de UTC: «hoy», la semana por defecto, qué ocurrió dentro de la
 *     semana y si algo se reportó dentro del plazo se calculan así.
 *
 * La parte de arriba (`armar` y sus ayudas) es pura y se prueba sin base. `generar` lee con el cliente que
 * recibe y llama a `armar`; `guardar` escribe. El día hasta el que se juzga la semana es el menor entre hoy y
 * su domingo: una semana en curso no tiene retrasos por lo que aún no venció.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  accionVacia, estadoCanonico, ESTADO_CONSULTOR, ESTADO_CLIENTE, VERBO_PASADO, VERBO_PASADO_CLIENTE, EVENTOS,
  type AccionPlan, type Estado, type Evento,
} from "./plan-reglas";
import {
  desdeFila, alertas, finDePeriodo, periodoAnterior, periodoCerradoMasReciente, nombreDePeriodoKpi, textoValor, VALIDACION_TEXTO,
  metaSinPlan as metaSinPlanDe,
  type Kpi, type Frecuencia, type EstadoValidacion,
} from "./kpis";
import { lineaBaseVigente, fechaDia, COLUMNAS_MEDICION, COLUMNAS_MEDICION_LEGADO, type Medicion } from "./medicion";

// ───────────────────────── LA SEMANA ─────────────────────────

const RE_DIA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DIA_MS = 86_400_000;

const utcDe = (dia: string): Date => {
  const m = RE_DIA.exec(dia);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};

/** Un instante o un día → su día AAAA-MM-DD en UTC. Las fechas del plan son días, no instantes. */
export function diaDe(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? valor.toISOString().slice(0, 10) : null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  return m ? m[1]! : null;
}

// ───────────────────────── EL RELOJ DE LA EMPRESA ─────────────────────────

/** La zona con la que se cuentan los días cuando la empresa no dice la suya. */
export const ZONA_POR_DEFECTO = "America/Lima";

const FORMATEADORES = new Map<string, Intl.DateTimeFormat>();

/** El formateador de días de una zona, o null si Intl no la conoce. Se guarda: construirlo cuesta. */
function formateadorDe(zona: string): Intl.DateTimeFormat | null {
  const guardado = FORMATEADORES.get(zona);
  if (guardado) return guardado;
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" });
    FORMATEADORES.set(zona, f);
    return f;
  } catch {
    return null;
  }
}

/** ¿Es una zona horaria con nombre (America/Lima) que Intl acepta? */
export function zonaValida(zona: unknown): zona is string {
  return typeof zona === "string" && zona.trim().length > 0 && formateadorDe(zona) != null;
}

/**
 * El día de calendario (AAAA-MM-DD) en que cae un instante para quien vive en esa zona. Las 23:30 del domingo
 * en Lima ya son lunes en UTC: contar en UTC le cambia el día, y a veces la semana, a lo que hizo la empresa.
 * Una zona que Intl no conoce se cuenta con la de por defecto.
 */
export function diaEnZona(instante: Date | string | null | undefined, zona: string = ZONA_POR_DEFECTO): string | null {
  if (!instante) return null;
  const d = instante instanceof Date ? instante : new Date(instante);
  if (!Number.isFinite(d.getTime())) return null;
  const f = (zonaValida(zona) ? formateadorDe(zona) : null) ?? formateadorDe(ZONA_POR_DEFECTO);
  if (!f) return d.toISOString().slice(0, 10);
  const partes = f.formatToParts(d);
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${de("year")}-${de("month")}-${de("day")}`;
}

/** Un día ya es un día (vence_at, fecha_inicio); un instante (reportado_at, created_at) cae en el día de la empresa. */
function diaLocal(valor: string | Date | null | undefined, zona: string): string | null {
  if (!valor) return null;
  if (typeof valor === "string" && RE_DIA.test(valor)) return valor;
  return diaEnZona(valor, zona) ?? diaDe(valor);
}

export function sumarDias(dia: string, n: number): string {
  const d = utcDe(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ¿Es un día válido (AAAA-MM-DD) y cae en lunes? La semana se nombra por su lunes y solo por él. */
export function esLunes(dia: string | null | undefined): dia is string {
  if (!dia || !RE_DIA.test(dia)) return false;
  const d = utcDe(dia);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === dia && d.getUTCDay() === 1;
}

/** El lunes de la semana que contiene la fecha. Un domingo pertenece a la semana que empezó seis días antes. */
export function lunesDe(fecha: string | Date = new Date()): string {
  const dia = diaDe(fecha);
  if (!dia) throw new Error(`«${String(fecha)}» no es una fecha: la semana se pide por su lunes, AAAA-MM-DD.`);
  const d = utcDe(dia);
  const desfase = (d.getUTCDay() + 6) % 7; // lunes 0 … domingo 6
  return sumarDias(dia, -desfase);
}

export type RangoSemana = { desde: string; hasta: string; hastaExclusivo: string };

/** Lunes a domingo, y el lunes siguiente como límite abierto para comparar instantes. */
export function rangoSemana(lunes: string): RangoSemana {
  if (!esLunes(lunes)) throw new Error(`«${lunes}» no es un lunes: la semana se nombra por su lunes.`);
  return { desde: lunes, hasta: sumarDias(lunes, 6), hastaExclusivo: sumarDias(lunes, 7) };
}

/** «Semana del 5 al 11 de octubre de 2026», para no mostrarle un código a nadie. */
export function nombreDeSemana(lunes: string): string {
  const { desde, hasta } = rangoSemana(lunes);
  return `Semana del ${fechaDia(desde)} al ${fechaDia(hasta)}`;
}

/** El lunes de la semana que está corriendo para la empresa, con su reloj. Es la que ve el dueño en «Esta semana». */
export function semanaEnCurso(ahora: Date = new Date(), zona: string = ZONA_POR_DEFECTO): string {
  return lunesDe(diaEnZona(ahora, zona) ?? ahora);
}

/**
 * La semana que la consultora abre si no pide otra: LA QUE TERMINÓ. La revisión se hace el lunes y mira la
 * semana anterior; la que acaba de empezar todavía no tiene nada que juzgar. El lunes a las 00:30 de Lima ya es
 * la semana nueva (y se revisa la que cerró el domingo); el domingo a las 23:30 de Lima todavía no.
 */
export function semanaPorDefecto(ahora: Date = new Date(), zona: string = ZONA_POR_DEFECTO): string {
  return sumarDias(semanaEnCurso(ahora, zona), -7);
}

// ───────────────────────── LO QUE SE GUARDA ─────────────────────────

export type Clase = "accion" | "indicador";

export type TipoEsperado = "accion_empieza" | "accion_vence" | "indicador_valor";

/** Algo que la semana pedía: una acción que empezaba o vencía, un indicador cuyo periodo cerró. */
export type Esperado = {
  tipo: TipoEsperado;
  clase: Clase;
  id: string;
  titulo: string;
  /** El día de la semana al que corresponde (inicio o vencimiento). Para un indicador, null. */
  fecha: string | null;
  /** Indicador: los periodos que cerraron en la semana y pedían un valor. */
  periodos?: string[];
  /** Indicador: de esos periodos, cuáles tienen valor registrado (en cualquier momento). Lo que no está es «sin dato», no cero. */
  periodos_con_valor?: string[];
  responsable: string | null;
  responsable_puesto: string | null;
  estado: Estado | null;
  /** true ocurrió; false no ocurrió y ya pasó el día; null todavía no se puede juzgar (el día no llegó). */
  cumplido: boolean | null;
  /**
   * Acción ya reportada o verificada: si lo fue dentro del plazo, con retraso, sin fecha comprometida o sin fecha
   * de reporte. El plazo juzga el VENCIMIENTO, así que va en la fila «vence». La fila «empieza» solo lo lleva
   * cuando dice «sin_fecha_comprometida» (no hay fila «vence» que lo diga): un reporte tardío no vuelve tardío
   * el arranque.
   */
  plazo?: TipoPlazo;
  /** Cuando el plazo es «con_retraso»: cuántos días después del vencimiento se reportó. Solo en la fila «vence». */
  dias_retraso?: number;
  detalle: string;
};

export const TIPOS_PLAZO = ["dentro_del_plazo", "con_retraso", "sin_fecha_comprometida", "sin_fecha_de_reporte"] as const;
export type TipoPlazo = (typeof TIPOS_PLAZO)[number];

/**
 * Cómo quedó una acción hecha frente a su fecha. `segun` dice qué fecha se pudo comparar: la del reporte (la que
 * cuenta: ese día la empresa la dio por terminada) o, si no quedó, la de la verificación.
 */
export type Plazo =
  | { tipo: "dentro_del_plazo"; vence: string; dia: string; segun: "reporte" | "verificacion" }
  | { tipo: "con_retraso"; vence: string; dia: string; dias: number }
  | { tipo: "sin_fecha_comprometida"; dia: string | null }
  | { tipo: "sin_fecha_de_reporte"; vence: string; verificada: string | null };

export type TipoOcurrido = "transicion" | "valor";

export type Ocurrido = {
  tipo: TipoOcurrido;
  clase: Clase;
  id: string;
  titulo: string;
  /** Instante (ISO) en que se registró. */
  fecha: string;
  /** Como lo lee la consultora. */
  texto: string;
  /** Como lo lee el dueño: sin jerga, con los verbos de sus estados. */
  texto_cliente: string;
  evento?: Evento;
  actor_rol?: string | null;
};

export type EvidenciaRevision = {
  id: string;
  action_id: string;
  accion: string;
  tipo: string;
  nombre: string | null;
  nota: string | null;
  fecha: string | null;
};

export const TIPOS_DESVIO = ["retraso", "datos_desactualizados", "sin_responsable", "metas_sin_plan", "verificaciones_pendientes"] as const;
export type TipoDesvio = (typeof TIPOS_DESVIO)[number];

/** Cómo se llama cada desvío delante de la consultora. */
export const DESVIO_TEXTO: Record<TipoDesvio, string> = {
  retraso: "Retraso",
  datos_desactualizados: "Dato viejo",
  sin_responsable: "Sin responsable",
  metas_sin_plan: "Meta sin plan",
  verificaciones_pendientes: "Verificación pendiente",
};

export type Desvio = {
  tipo: TipoDesvio;
  clase: Clase;
  id: string;
  titulo: string;
  detalle: string;
  /** La decisión que este desvío exige. Propuesta derivada, no tomada. */
  decision_propuesta: string;
  /** A dónde ir para decidir: la acción en el plan o el indicador en su tablero. */
  enlace: string;
};

export type EstadoResultado = "sin_punto_de_partida" | "sin_medicion_todavia" | "con_corte";

export type ResultadoRevision = {
  estado: EstadoResultado;
  /** Lo que se le dice a la consultora. */
  texto: string;
  /** Lo que se le dice al dueño. */
  texto_cliente: string;
  corte?: { id: string; numero: number; fecha: string; version_base: number | null };
};

export type Revision = {
  company_id: string;
  /** El lunes de la semana revisada. */
  semana: string;
  desde: string;
  hasta: string;
  /** El día hasta el que se juzga: el domingo, o hoy si la semana está en curso. */
  referencia: string;
  // 1 · Qué debía ocurrir
  que_debia_ocurrir: Esperado[];
  // 2 · Qué ocurrió
  que_ocurrio: Ocurrido[];
  // 3 · Evidencia
  evidencia: EvidenciaRevision[];
  // 4 · Desvíos
  desvios: Desvio[];
  // 5 · Explicación: la escribe la consultora; vacía hasta entonces.
  explicacion: string | null;
  // 6 · Decisión: la propuesta sale de los desvíos; la tomada la escribe la consultora.
  decision_propuesta: string;
  decision_necesaria: string | null;
  // 7 · Siguiente: lo que la semana próxima pide; la consultora puede completarlo.
  siguiente_propuesto: Esperado[];
  siguiente_texto: string;
  siguiente: string | null;
  /** Lo que la revisión puede decir del resultado empresarial. Nunca lo deduce de las tareas. */
  resultado: ResultadoRevision;
  /** Quién guardó la fila por primera vez. NO dice quién la revisó: eso es `revisada_por`. */
  creada_por: string | null;
  /** Quién la marcó como revisada; null mientras nadie la haya marcado. */
  revisada_por: string | null;
  /** Cuándo se marcó (instante ISO). Null si no está marcada, o si la marca es anterior a que se guardara la fecha. */
  revisada_at: string | null;
  revisada: boolean;
  /** La zona horaria con la que se contaron los días de esta revisión. */
  zona: string;
  /** true cuando la empresa no tiene plan ni indicadores: no hay nada que revisar y se dice. */
  vacia: boolean;
};

export const TEXTO_SIN_MEDICION = "Sin medición de resultado todavía";

// ───────────────────────── LA ENTRADA DE `armar` ─────────────────────────

export type FilaHistorialSemana = {
  id?: string;
  action_id: string;
  accion: string;
  motivo: string | null;
  implica?: string | null;
  actor_rol: string | null;
  created_at: string;
};

export type FilaValorSemana = {
  indicador_id: string;
  periodo: string;
  valor: number;
  fuente?: string | null;
  estado_validacion?: string | null;
  created_at: string | null;
};

export type FilaEvidenciaSemana = { id: string; action_id: string | null; tipo: string; nombre: string | null; nota: string | null; created_at: string | null };

export type ParticipanteBreve = { id: string; nombre: string; puesto?: string | null };

/**
 * Lo que hay guardado para la semana. `revisada_at` y `revisada_por` vienen `undefined` cuando la fila se leyó de
 * una base sin supabase/migracion-revision-revisada.sql: en ese esquema la única marca de «revisada» era
 * `creada_por`, y así se lee. Con las columnas (aunque estén en null) mandan ellas.
 */
export type TextosGuardados = {
  explicacion: string | null;
  decision_necesaria: string | null;
  siguiente: string | null;
  creada_por: string | null;
  revisada_at?: string | null;
  revisada_por?: string | null;
} | null;

export type Entrada = {
  companyId: string;
  acciones: AccionPlan[];
  /** Solo las filas de la semana; `armar` vuelve a filtrar por fecha por si vienen de más. */
  historial: FilaHistorialSemana[];
  indicadores: Kpi[];
  /** TODOS los valores de los indicadores de la empresa: hacen falta para saber si un periodo tiene dato. */
  valores: FilaValorSemana[];
  evidencias: FilaEvidenciaSemana[];
  participantes: ParticipanteBreve[];
  mediciones: Medicion[];
  textos?: TextosGuardados;
  /** La zona horaria de la empresa (`companies.zona_horaria`). Sin ella, o si no es válida, America/Lima. */
  zona?: string | null;
};

// ───────────────────────── AYUDAS ─────────────────────────

const hayTexto = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const enRango = (dia: string | null, desde: string, hasta: string) => dia != null && dia >= desde && dia <= hasta;
/** ¿El instante cae dentro de la semana, contando los días con el reloj de la empresa? */
const enSemanaInstante = (iso: string | null | undefined, r: RangoSemana, zona: string) => {
  const dia = diaLocal(iso ?? null, zona);
  return dia != null && dia >= r.desde && dia < r.hastaExclusivo;
};

/** Estados en los que una acción está en manos de alguien y se le puede exigir: lo aprobado y lo que sigue hasta reportar. */
export const ESTADOS_EN_MARCHA: readonly Estado[] = ["aprobado", "en_ejecucion", "bloqueado"];
/** Lo que ya no cuenta como pendiente de hacer: reportado o verificado. */
const ESTADOS_HECHOS: readonly Estado[] = ["reportado", "verificado"];
/** Lo que ya no está sobre la mesa y no entra en «qué debía ocurrir». */
const ESTADOS_FUERA: readonly Estado[] = ["rechazado", "pospuesto"];

export const QUIEN: Record<string, string> = { consultor: "La consultora", cliente: "La empresa", sistema: "El planificador" };
/** Para el dueño. Lo que hizo el sistema lo firma el sistema: atribuírselo a la consultora es ponerle un acto que no hizo. */
export const QUIEN_CLIENTE: Record<string, string> = { consultor: "La consultora", cliente: "Tu equipo", sistema: "El sistema" };

export const DIAS_PARA_VERIFICAR = 7;

/**
 * Los periodos de una frecuencia que CERRARON dentro de la semana: su primer instante «después» cae entre el
 * lunes (incluido) y el lunes siguiente (excluido). Para un indicador semanal es la semana anterior, que cerró
 * el domingo; para uno mensual, el mes que terminó si el día 1 cayó en esta semana; para uno diario, siete días.
 * Nunca el periodo en curso: lo que no terminó no se puede anotar.
 */
export function periodosQueCierranEn(frecuencia: Frecuencia, semana: string): string[] {
  const r = rangoSemana(semana);
  const domingo = utcDe(r.hasta);
  const salida: string[] = [];
  let p: string | null = periodoCerradoMasReciente(frecuencia, domingo);
  let vueltas = 0;
  while (p && vueltas < 40) {
    vueltas += 1;
    const fin = finDePeriodo(p);
    if (!fin) break;
    const finDia = fin.toISOString().slice(0, 10);
    if (finDia < r.desde) break;
    if (finDia < r.hastaExclusivo) salida.unshift(p);
    p = periodoAnterior(p);
  }
  return salida;
}

const diasEntre = (desde: string, hasta: string): number => Math.round((utcDe(hasta).getTime() - utcDe(desde).getTime()) / DIA_MS);

/**
 * ¿La acción hecha se reportó dentro del plazo? Se COMPARAN FECHAS; que esté reportada no dice que fue a tiempo.
 * Cuenta el día del reporte (con el reloj de la empresa) contra el día de vencimiento. Sin vencimiento no hay
 * plazo que cumplir ni que incumplir: «sin fecha comprometida». Sin fecha de reporte solo se puede afirmar algo
 * si la verificación fue antes de vencer; si fue después, no se sabe cuándo se reportó y no se acusa un retraso.
 */
export function plazoDe(a: Pick<AccionPlan, "vence_at" | "reportado_at" | "verificado_at">, zona: string = ZONA_POR_DEFECTO): Plazo {
  const vence = diaDe(a.vence_at);
  const reportada = diaLocal(a.reportado_at, zona);
  const verificada = diaLocal(a.verificado_at ?? null, zona);
  if (!vence) return { tipo: "sin_fecha_comprometida", dia: reportada ?? verificada };
  if (reportada) {
    const dias = diasEntre(vence, reportada);
    return dias > 0 ? { tipo: "con_retraso", vence, dia: reportada, dias } : { tipo: "dentro_del_plazo", vence, dia: reportada, segun: "reporte" };
  }
  if (verificada && verificada <= vence) return { tipo: "dentro_del_plazo", vence, dia: verificada, segun: "verificacion" };
  return { tipo: "sin_fecha_de_reporte", vence, verificada };
}

/** El plazo en palabras, para ir detrás del estado: «Reportada dentro del plazo: se reportó el 6 oct 2026 y vencía el 9 oct 2026». */
export function textoPlazo(p: Plazo): string {
  switch (p.tipo) {
    case "dentro_del_plazo":
      return `dentro del plazo: se ${p.segun === "reporte" ? "reportó" : "verificó"} el ${fechaDia(p.dia)} y vencía el ${fechaDia(p.vence)}`;
    case "con_retraso":
      return `con retraso de ${p.dias} día${p.dias === 1 ? "" : "s"}: se reportó el ${fechaDia(p.dia)} y vencía el ${fechaDia(p.vence)}`;
    case "sin_fecha_comprometida":
      return `sin fecha comprometida${p.dia ? ` (quedó hecha el ${fechaDia(p.dia)})` : ""}`;
    case "sin_fecha_de_reporte":
      return p.verificada
        ? `sin fecha de reporte registrada: se verificó el ${fechaDia(p.verificada)}, después del vencimiento (${fechaDia(p.vence)}), y no se puede decir si se reportó a tiempo`
        : `sin fecha de reporte registrada: no se puede decir si fue dentro del plazo (vencía el ${fechaDia(p.vence)})`;
  }
}

/** Por qué una meta se queda sin plan: nadie la persigue, o la única acción ligada ya no está sobre la mesa. */
export type MetaSinPlan = { motivo: "sin_accion" } | { motivo: "accion_fuera"; accion: AccionPlan; estado: Estado };

/**
 * ¿Este indicador tiene meta con plazo y ninguna acción que la persiga? El vínculo vive en DOS sitios y nada los
 * sincroniza: el indicador apunta a su acción (`accion_asociada_id`) y la acción apunta a su indicador
 * (`indicador_id`). Basta uno de los dos sentidos para que haya plan. Una acción rechazada o pospuesta no persigue
 * nada, la apunte quien la apunte. Sin meta o sin plazo no hay «meta sin plan»: no hay fecha que incumplir.
 * La regla vive en kpis.ts (`metaSinPlan`), que es también la que usan las alertas del tablero: una sola, para que
 * la revisión y el tablero no digan cosas distintas del mismo indicador.
 */
export function metaSinPlan(k: Kpi, acciones: readonly AccionPlan[]): MetaSinPlan | null {
  return metaSinPlanDe(k, acciones);
}

const enlaceAccion = (companyId: string, id: string) => `/empresa/${companyId}/plan#accion-${id}`;
const enlaceIndicador = (companyId: string, id: string) => `/empresa/${companyId}/kpis#indicador-${id}`;

function esEvento(x: string): x is Evento {
  return (EVENTOS as readonly string[]).includes(x);
}

function esValidacion(x: unknown): x is EstadoValidacion {
  return typeof x === "string" && x in VALIDACION_TEXTO;
}

// ───────────────────────── ARMAR: LA REGLA, PURA ─────────────────────────

/**
 * Arma la revisión de la semana a partir de lo leído. No toca la base. `hoy` decide hasta qué día se juzga:
 * una semana pasada se juzga entera (hasta su domingo); la semana en curso, hasta hoy. «Hoy» y el día de cada
 * instante (un reporte, un movimiento, un valor) son los del reloj de la empresa, no los de UTC.
 */
export function armar(e: Entrada, semana: string, hoy: Date = new Date()): Revision {
  const r = rangoSemana(semana);
  const zona = zonaValida(e.zona) ? e.zona : ZONA_POR_DEFECTO;
  const hoyDia = diaEnZona(hoy, zona) ?? r.hasta;
  const referencia = hoyDia < r.hasta ? hoyDia : r.hasta;
  // Para las alertas de los indicadores: el instante hasta el que se juzga.
  const instante = hoyDia <= r.hasta ? hoy : new Date(`${r.hasta}T23:59:59.999Z`);

  const nombreDe = new Map(e.participantes.map((p) => [p.id, p.nombre]));
  const puestoDe = new Map(e.participantes.map((p) => [p.id, p.puesto ?? null]));
  const responsableDe = (id: string | null) => (id ? nombreDe.get(id) ?? null : null);
  const puestoResponsable = (id: string | null) => (id ? puestoDe.get(id) ?? null : null);
  const tituloAccion = new Map(e.acciones.map((a) => [a.id, a.accion]));
  const indicadorPorId = new Map(e.indicadores.map((k) => [k.id, k]));
  const activos = e.indicadores.filter((k) => k.estado === "activo");
  const conValor = new Set(e.valores.map((v) => `${v.indicador_id}|${v.periodo}`));

  // ── 1 · QUÉ DEBÍA OCURRIR ───────────────────────────────────────────────────────
  const que_debia_ocurrir: Esperado[] = [];
  for (const a of e.acciones) {
    const estado = estadoCanonico(a);
    if (ESTADOS_FUERA.includes(estado)) continue;
    const inicio = diaDe(a.fecha_inicio);
    const vence = diaDe(a.vence_at);
    const base = {
      clase: "accion" as const, id: a.id, titulo: a.accion, estado,
      responsable: responsableDe(a.responsable_participant_id), responsable_puesto: puestoResponsable(a.responsable_participant_id),
    };
    // Reportada o verificada no es «a tiempo»: se compara el día del reporte con el del vencimiento y se dice cuál fue.
    const hecha = ESTADOS_HECHOS.includes(estado);
    const plazo = hecha ? plazoDe(a, zona) : null;
    const delPlazo = plazo ? { plazo: plazo.tipo, ...(plazo.tipo === "con_retraso" ? { dias_retraso: plazo.dias } : {}) } : {};
    // El plazo juzga el vencimiento, no el arranque: «con retraso» fue el reporte frente a la fecha comprometida, y
    // eso lo lleva la fila «vence». La fila «empieza» solo anota que no hay fecha comprometida, porque entonces no
    // hay otra fila que lo diga. Su detalle sí cuenta cómo terminó la acción, con las dos fechas a la vista.
    const delInicio = plazo?.tipo === "sin_fecha_comprometida" ? { plazo: plazo.tipo } : {};
    if (enRango(inicio, r.desde, r.hasta)) {
      const empezo = estado === "en_ejecucion" || estado === "bloqueado" || hecha;
      const cumplido = empezo ? true : referencia >= inicio! ? false : null;
      que_debia_ocurrir.push({
        ...base, tipo: "accion_empieza", fecha: inicio,
        cumplido, ...delInicio,
        detalle:
          cumplido === true
            ? plazo
              ? `Empezó y ya está ${ESTADO_CONSULTOR[estado].toLowerCase()} ${textoPlazo(plazo)}.`
              : `Empezó (${ESTADO_CONSULTOR[estado].toLowerCase()}).`
            : cumplido === false
              ? `Debía empezar el ${fechaDia(inicio)} y sigue ${ESTADO_CONSULTOR[estado].toLowerCase()}.`
              : `Empieza el ${fechaDia(inicio)}.`,
      });
    }
    if (enRango(vence, r.desde, r.hasta)) {
      const cumplido = hecha ? true : referencia >= vence! ? false : null;
      que_debia_ocurrir.push({
        ...base, tipo: "accion_vence", fecha: vence,
        cumplido, ...delPlazo,
        detalle: plazo ? `${ESTADO_CONSULTOR[estado]} ${textoPlazo(plazo)}.` : cumplido === false ? `Vencía el ${fechaDia(vence)} y está ${ESTADO_CONSULTOR[estado].toLowerCase()}.` : `Vence el ${fechaDia(vence)}.`,
      });
    }
  }
  for (const k of activos) {
    const periodos = periodosQueCierranEn(k.frecuencia, semana);
    if (!periodos.length) continue;
    const periodos_con_valor = periodos.filter((p) => conValor.has(`${k.id}|${p}`));
    const sinDato = periodos.filter((p) => !conValor.has(`${k.id}|${p}`));
    // Un periodo que cerró se puede anotar desde que cerró; si la revisión es de una semana en curso y el
    // cierre aún no llegó, no se juzga.
    const cerroYa = periodos.every((p) => (finDePeriodo(p)?.toISOString().slice(0, 10) ?? r.hasta) <= referencia);
    const cumplido = sinDato.length === 0 ? true : cerroYa ? false : null;
    que_debia_ocurrir.push({
      tipo: "indicador_valor", clase: "indicador", id: k.id, titulo: k.nombre, fecha: null,
      periodos, periodos_con_valor,
      responsable: responsableDe(k.responsable_participant_id), responsable_puesto: puestoResponsable(k.responsable_participant_id),
      estado: null, cumplido,
      detalle:
        periodos.length === 1
          ? cumplido === true
            ? `Valor de ${nombreDePeriodoKpi(periodos[0]!)} registrado.`
            : `Sin dato en ${nombreDePeriodoKpi(periodos[0]!)}${cumplido === null ? " (el periodo cierra con la semana)" : ""}. No es cero: falta anotarlo.`
          : `${periodos_con_valor.length} de ${periodos.length} días con valor; ${sinDato.length} sin dato (no es cero).`,
    });
  }

  // ── 2 · QUÉ OCURRIÓ ─────────────────────────────────────────────────────────────
  const que_ocurrio: Ocurrido[] = [];
  for (const h of e.historial) {
    if (!enSemanaInstante(h.created_at, r, zona)) continue;
    const titulo = tituloAccion.get(h.action_id) ?? "una acción";
    const evento = esEvento(h.accion) ? h.accion : null;
    const verbo = evento ? VERBO_PASADO[evento] : h.accion;
    const verboCliente = evento ? VERBO_PASADO_CLIENTE[evento] : h.accion;
    const quien = QUIEN[h.actor_rol ?? ""] ?? "Alguien";
    const quienCliente = QUIEN_CLIENTE[h.actor_rol ?? ""] ?? "Alguien";
    const motivo = hayTexto(h.motivo) ? `: ${h.motivo.trim()}` : "";
    que_ocurrio.push({
      tipo: "transicion", clase: "accion", id: h.action_id, titulo, fecha: h.created_at,
      texto: `${quien} ${verbo} «${titulo}»${motivo}`,
      texto_cliente: `${quienCliente} ${verboCliente} «${titulo}»${evento === "comentar" ? motivo : ""}`,
      evento: evento ?? undefined, actor_rol: h.actor_rol,
    });
  }
  for (const v of e.valores) {
    if (!enSemanaInstante(v.created_at, r, zona)) continue;
    const k = indicadorPorId.get(v.indicador_id);
    if (!k) continue;
    const validacion = esValidacion(v.estado_validacion) ? VALIDACION_TEXTO[v.estado_validacion] : VALIDACION_TEXTO.declarado;
    const valor = textoValor(k.unidad, Number(v.valor), k.moneda);
    que_ocurrio.push({
      tipo: "valor", clase: "indicador", id: k.id, titulo: k.nombre, fecha: v.created_at!,
      texto: `«${k.nombre}»: ${valor} para ${nombreDePeriodoKpi(v.periodo)} (${validacion})`,
      texto_cliente: `Se anotó «${k.nombre}»: ${valor} para ${nombreDePeriodoKpi(v.periodo)}`,
    });
  }
  que_ocurrio.sort((a, b) => a.fecha.localeCompare(b.fecha));

  // ── 3 · EVIDENCIA ───────────────────────────────────────────────────────────────
  const referidas = new Set<string>([
    ...que_debia_ocurrir.filter((x) => x.clase === "accion").map((x) => x.id),
    ...que_ocurrio.filter((x) => x.clase === "accion").map((x) => x.id),
  ]);
  const evidencia: EvidenciaRevision[] = e.evidencias
    .filter((ev) => ev.action_id && referidas.has(ev.action_id))
    .map((ev) => ({ id: ev.id, action_id: ev.action_id!, accion: tituloAccion.get(ev.action_id!) ?? "una acción", tipo: ev.tipo, nombre: ev.nombre, nota: ev.nota, fecha: ev.created_at }))
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  const pruebasDe = new Map<string, number>();
  for (const ev of e.evidencias) if (ev.action_id) pruebasDe.set(ev.action_id, (pruebasDe.get(ev.action_id) ?? 0) + 1);

  // ── 4 · DESVÍOS, cada uno con la decisión que exige ─────────────────────────────
  const desvios: Desvio[] = [];
  // Retrasos: vencidas al día de referencia y sin reportar ni verificar.
  for (const a of e.acciones) {
    const estado = estadoCanonico(a);
    const vence = diaDe(a.vence_at);
    if (!ESTADOS_EN_MARCHA.includes(estado) || !vence || !(vence < referencia)) continue;
    const dias = diasEntre(vence, referencia);
    const quien = responsableDe(a.responsable_participant_id);
    desvios.push({
      tipo: "retraso", clase: "accion", id: a.id, titulo: a.accion,
      detalle: `Vencía el ${fechaDia(vence)} (hace ${dias} día${dias === 1 ? "" : "s"}) y sigue ${ESTADO_CONSULTOR[estado].toLowerCase()}${estado === "bloqueado" && hayTexto(a.bloqueo) ? `: ${a.bloqueo.trim()}` : ""}.`,
      decision_propuesta: `Reprogramar el plazo de «${a.accion}» (con motivo y qué implica) o pedir el reporte ${quien ? `a ${quien}` : "a quien la tenga a cargo"} esta semana.`,
      enlace: enlaceAccion(e.companyId, a.id),
    });
  }
  // Datos desactualizados: lo dice la alerta del indicador, con el límite de su frecuencia.
  for (const k of activos) {
    const vieja = alertas(k, instante).find((x) => x.tipo === "desactualizado");
    if (!vieja) continue;
    // Qué periodo había cerrado lo dice el reloj de la EMPRESA. `referencia` ya es un día de ese reloj (hoy en su
    // zona, o el domingo de la semana), así que se lee como día de calendario. Antes se pasaba el instante sin
    // zona y se leía en UTC: el 30 de setiembre a las 21:00 de Lima se proponía registrar setiembre, que no había
    // cerrado y que la ruta de valores rechaza.
    const periodo = periodoCerradoMasReciente(k.frecuencia, utcDe(referencia));
    const quien = responsableDe(k.responsable_participant_id);
    desvios.push({
      tipo: "datos_desactualizados", clase: "indicador", id: k.id, titulo: k.nombre,
      detalle: vieja.texto,
      decision_propuesta: `Registrar el valor de ${nombreDePeriodoKpi(periodo)} de «${k.nombre}»${quien ? ` (lo cuenta ${quien})` : " y decir quién lo cuenta"}; si no hay dato, anotarlo como sin dato, no como cero.`,
      enlace: enlaceIndicador(e.companyId, k.id),
    });
  }
  // Sin responsable: una acción en marcha que no es de nadie identificado.
  for (const a of e.acciones) {
    const estado = estadoCanonico(a);
    if (!ESTADOS_EN_MARCHA.includes(estado) || a.responsable_participant_id) continue;
    desvios.push({
      tipo: "sin_responsable", clase: "accion", id: a.id, titulo: a.accion,
      detalle: `Está ${ESTADO_CONSULTOR[estado].toLowerCase()} y no tiene a una persona del equipo a cargo${hayTexto(a.responsable) ? ` («${a.responsable.trim()}» es un nombre suelto, no una persona registrada)` : ""}.`,
      decision_propuesta: `Asignar «${a.accion}» a una persona del equipo (reasignar responsable).`,
      enlace: enlaceAccion(e.companyId, a.id),
    });
  }
  // Metas sin plan: meta con plazo y ninguna acción que la persiga, mirando el vínculo en sus dos sentidos.
  for (const k of activos) {
    const sinPlan = metaSinPlan(k, e.acciones);
    if (!sinPlan) continue;
    const meta = k.meta_valor != null ? textoValor(k.unidad, k.meta_valor, k.moneda) : k.meta_texto ?? "";
    desvios.push({
      tipo: "metas_sin_plan", clase: "indicador", id: k.id, titulo: k.nombre,
      detalle:
        sinPlan.motivo === "sin_accion"
          ? `Tiene meta con plazo (${fechaDia(k.meta_plazo)}) y ninguna acción del plan que la persiga.`
          : `Tiene meta con plazo (${fechaDia(k.meta_plazo)}) y la única acción ligada, «${sinPlan.accion.accion}», está ${ESTADO_CONSULTOR[sinPlan.estado].toLowerCase()}: hoy nadie la persigue.`,
      decision_propuesta: `Ligar una acción del plan a «${k.nombre}» (meta ${meta} para el ${fechaDia(k.meta_plazo)}) o quitar el plazo: una meta sin plan es un deseo.`,
      enlace: enlaceIndicador(e.companyId, k.id),
    });
  }
  // Verificaciones pendientes: reportadas hace más de siete días y nadie las comprobó.
  for (const a of e.acciones) {
    if (estadoCanonico(a) !== "reportado") continue;
    const reporte = diaLocal(a.reportado_at, zona) ?? diaLocal(a.updated_at ?? null, zona);
    const dias = reporte ? diasEntre(reporte, referencia) : null;
    if (dias != null && dias <= DIAS_PARA_VERIFICAR) continue;
    const pruebas = pruebasDe.get(a.id) ?? 0;
    desvios.push({
      tipo: "verificaciones_pendientes", clase: "accion", id: a.id, titulo: a.accion,
      detalle: dias != null ? `Reportada hace ${dias} días (${fechaDia(reporte)}) y sin verificar; ${pruebas} prueba${pruebas === 1 ? "" : "s"}.` : `Reportada sin fecha registrada y sin verificar; ${pruebas} prueba${pruebas === 1 ? "" : "s"}.`,
      decision_propuesta: `Verificar «${a.accion}» con su prueba o devolverla a ejecución diciendo qué falta. Verificada no es resultado: eso se lee en el corte.`,
      enlace: enlaceAccion(e.companyId, a.id),
    });
  }

  // ── 7 · SIGUIENTE: lo que la semana próxima pide ─────────────────────────────────
  const prox = rangoSemana(r.hastaExclusivo);
  const siguiente_propuesto: Esperado[] = [];
  for (const a of e.acciones) {
    const estado = estadoCanonico(a);
    if (ESTADOS_FUERA.includes(estado) || estado === "verificado") continue;
    const inicio = diaDe(a.fecha_inicio);
    const vence = diaDe(a.vence_at);
    const base = {
      clase: "accion" as const, id: a.id, titulo: a.accion, estado, cumplido: null,
      responsable: responsableDe(a.responsable_participant_id), responsable_puesto: puestoResponsable(a.responsable_participant_id),
    };
    if (enRango(inicio, prox.desde, prox.hasta)) siguiente_propuesto.push({ ...base, tipo: "accion_empieza", fecha: inicio, detalle: `Empieza el ${fechaDia(inicio)}.` });
    if (enRango(vence, prox.desde, prox.hasta) && !ESTADOS_HECHOS.includes(estado)) siguiente_propuesto.push({ ...base, tipo: "accion_vence", fecha: vence, detalle: `Vence el ${fechaDia(vence)}.` });
  }
  siguiente_propuesto.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));

  const vacia = e.acciones.length === 0 && e.indicadores.length === 0;

  // Quién revisó y cuándo. Una fila leída sin las columnas nuevas viene del esquema anterior, donde la única
  // marca era `creada_por`; con las columnas presentes mandan ellas, aunque estén en null.
  const t = e.textos ?? null;
  const esquemaAnterior = t != null && t.revisada_at === undefined && t.revisada_por === undefined;
  const revisada_por = esquemaAnterior ? t.creada_por ?? null : t?.revisada_por ?? null;
  const revisada_at = esquemaAnterior ? null : t?.revisada_at ?? null;

  return {
    company_id: e.companyId,
    semana,
    desde: r.desde,
    hasta: r.hasta,
    referencia,
    que_debia_ocurrir,
    que_ocurrio,
    evidencia,
    desvios,
    explicacion: hayTexto(e.textos?.explicacion) ? e.textos!.explicacion : null,
    decision_propuesta: textoDecisiones(desvios, vacia),
    decision_necesaria: hayTexto(e.textos?.decision_necesaria) ? e.textos!.decision_necesaria : null,
    siguiente_propuesto,
    siguiente_texto: textoSiguiente(siguiente_propuesto, prox.desde),
    siguiente: hayTexto(e.textos?.siguiente) ? e.textos!.siguiente : null,
    resultado: resultadoDe(e.mediciones),
    creada_por: t?.creada_por ?? null,
    revisada_por,
    revisada_at,
    revisada: Boolean(revisada_at || revisada_por),
    zona,
    vacia,
  };
}

/** La decisión que la semana exige, derivada de los desvíos, en una lista que la consultora puede corregir. */
export function textoDecisiones(desvios: readonly Desvio[], vacia = false): string {
  if (vacia) return "Todavía no hay plan ni indicadores que revisar: la primera decisión es aprobar una acción o activar un indicador.";
  if (!desvios.length) return "Sin desvíos detectados en lo registrado: no hay decisión pendiente que salga de los datos.";
  return desvios.map((d) => `· ${d.decision_propuesta}`).join("\n");
}

/** Lo que la semana próxima pide, en líneas cortas. */
export function textoSiguiente(proximas: readonly Esperado[], lunesProximo: string): string {
  if (!proximas.length) return `Sin acciones con fecha en la ${nombreDeSemana(lunesProximo).toLowerCase()}.`;
  return proximas
    .map((p) => `· ${p.tipo === "accion_empieza" ? "Empieza" : "Vence"} «${p.titulo}»${p.responsable ? ` (${p.responsable})` : " (sin responsable)"} el ${fechaDia(p.fecha)}.`)
    .join("\n");
}

/**
 * Lo que la revisión puede decir del RESULTADO empresarial: nada que salga de las tareas. Si no hay punto de
 * partida, no hay contra qué medir; si no hay corte posterior, «sin medición de resultado todavía»; si lo hay,
 * se remite al corte, donde se compara contra la versión exacta. Aquí no se calcula ninguna mejora.
 */
export function resultadoDe(mediciones: readonly Medicion[]): ResultadoRevision {
  const base = lineaBaseVigente(mediciones);
  if (!base) {
    return {
      estado: "sin_punto_de_partida",
      texto: "Sin punto de partida fijado: no hay contra qué medir el resultado. Las acciones cumplidas son ejecución, no mejora.",
      texto_cliente: "Todavía no hay un punto de partida fijado. Lo que se hizo esta semana es trabajo cumplido; si tu negocio mejoró se verá cuando haya números para comparar.",
    };
  }
  const cortes = mediciones
    .filter((m) => m.tipo === "corte" && (m.linea_base_id === base.id || (!m.linea_base_id && m.fecha >= base.fecha)))
    .sort((a, b) => b.numero - a.numero);
  const ultimo = cortes[0];
  if (!ultimo) {
    return {
      estado: "sin_medicion_todavia",
      texto: `${TEXTO_SIN_MEDICION}: no hay un corte posterior al punto de partida (versión ${base.version ?? 1}, del ${fechaDia(base.fecha)}). Lo reportado y lo verificado es ejecución; si el negocio mejoró se verá en el próximo corte, no aquí.`,
      texto_cliente: `${TEXTO_SIN_MEDICION}. Lo que se hizo es trabajo cumplido; si tu negocio mejoró se verá en el próximo corte, comparado con tu punto de partida.`,
    };
  }
  const version = mediciones.find((m) => m.id === ultimo.linea_base_id)?.version ?? (ultimo.linea_base_id ? null : base.version ?? 1);
  return {
    estado: "con_corte",
    texto: `Último corte: n.º ${ultimo.numero} del ${fechaDia(ultimo.fecha)}${version != null ? `, medido contra la versión ${version} del punto de partida` : ""}. El resultado observado se lee allí, no en las tareas cumplidas; que se deba a la consultoría se decide aparte.`,
    texto_cliente: `El último corte fue el ${fechaDia(ultimo.fecha)}. Cómo le fue a tu negocio se lee en Resultados, comparado con tu punto de partida; las tareas cumplidas no se suman como mejora.`,
    corte: { id: ultimo.id, numero: ultimo.numero, fecha: ultimo.fecha, version_base: version ?? null },
  };
}

// ───────────────────────── ABAJO: LO QUE TOCA LA BASE ─────────────────────────

function comoAccion(fila: Record<string, unknown>, companyId: string): AccionPlan {
  const a = accionVacia({ ...(fila as Partial<AccionPlan>), id: String(fila.id), company_id: companyId, accion: String(fila.accion ?? "") });
  a.evidencia_ids = Array.isArray(a.evidencia_ids) ? a.evidencia_ids : [];
  a.depende_de = Array.isArray(a.depende_de) ? a.depende_de : [];
  a.es_prioridad = Boolean(a.es_prioridad);
  return a;
}

type Lector = Pick<SupabaseClient, "from">;

/** Las mediciones con sus columnas de versión; si la migración no está aplicada, las de siempre. */
async function leerMediciones(sb: Lector, companyId: string): Promise<Medicion[]> {
  const conVersion = await sb.from("mediciones").select(COLUMNAS_MEDICION).eq("company_id", companyId).order("fecha", { ascending: true });
  if (!conVersion.error) return (conVersion.data ?? []) as unknown as Medicion[];
  const legado = await sb.from("mediciones").select(COLUMNAS_MEDICION_LEGADO).eq("company_id", companyId).order("fecha", { ascending: true });
  if (legado.error) throw new Error(`No se pudieron leer las mediciones: ${legado.error.message}`);
  return (legado.data ?? []) as unknown as Medicion[];
}

/**
 * La zona horaria de la empresa (`companies.zona_horaria`). Si la columna no existe, viene vacía o no es una zona
 * que Intl conozca, America/Lima: es la regla de la casa, no un fallo que haya que esconder.
 */
export async function zonaDeEmpresa(companyId: string, sb: Lector): Promise<string> {
  const { data, error } = await sb.from("companies").select("zona_horaria").eq("id", companyId).maybeSingle();
  if (error) return ZONA_POR_DEFECTO;
  const zona = (data as { zona_horaria?: unknown } | null)?.zona_horaria;
  return zonaValida(zona) ? zona : ZONA_POR_DEFECTO;
}

const COLUMNAS_GUARDADA_LEGADO = "id,explicacion,decision_necesaria,siguiente,creada_por";
const COLUMNAS_GUARDADA = `${COLUMNAS_GUARDADA_LEGADO},revisada_at,revisada_por`;

type FilaGuardada = NonNullable<TextosGuardados> & { id: string };

/**
 * ¿El error de la base dice que a `revisiones_semanales` le faltan las columnas de la migración? Postgres lo dice
 * con 42703 («column … does not exist») y PostgREST con PGRST204 cuando la columna no está en su caché.
 */
export function faltanColumnasDeRevisada(error: { message?: string | null; code?: string | null }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /revisada_(at|por)/.test(error.message ?? "");
}

/**
 * La fila guardada de la semana, con quién la revisó y cuándo. Si a la base le falta
 * supabase/migracion-revision-revisada.sql se lee sin esas dos columnas: la pantalla no se cae por una migración
 * pendiente, y `conRevisada: false` avisa a `guardar` de que la marca va donde iba antes (`creada_por`).
 * Solo se lee así cuando el error dice que faltan esas columnas. Cualquier otro fallo se lanza: tratar una base
 * al día como la anterior escribiría la marca donde ya nadie la lee.
 */
async function leerGuardada(sb: Lector, companyId: string, semana: string): Promise<{ fila: FilaGuardada | null; conRevisada: boolean }> {
  const completa = await sb.from("revisiones_semanales").select(COLUMNAS_GUARDADA).eq("company_id", companyId).eq("semana", semana).maybeSingle();
  if (!completa.error) return { fila: (completa.data as unknown as FilaGuardada | null) ?? null, conRevisada: true };
  if (!faltanColumnasDeRevisada(completa.error)) throw new Error(`No se pudo leer la revisión guardada: ${completa.error.message}`);
  const legado = await sb.from("revisiones_semanales").select(COLUMNAS_GUARDADA_LEGADO).eq("company_id", companyId).eq("semana", semana).maybeSingle();
  if (legado.error) throw new Error(`No se pudo leer la revisión guardada: ${legado.error.message}`);
  return { fila: (legado.data as unknown as FilaGuardada | null) ?? null, conRevisada: false };
}

/**
 * Lee todo lo que la semana necesita y arma la revisión. No escribe. Si el plan o el historial no se pueden
 * leer, falla en voz alta: una revisión que dijera «no ocurrió nada» porque no pudo leer sería mentira.
 * `zona` es la de la empresa; si no se pasa, se lee de `companies`.
 */
export async function generar(companyId: string, semana: string, sb: Lector, hoy: Date = new Date(), zona?: string): Promise<Revision> {
  const r = rangoSemana(semana);
  // El historial se pide con un día de margen a cada lado: la semana de la empresa no empieza a medianoche de
  // UTC. `armar` decide qué entra, contando cada instante con el reloj de la empresa.
  const desdeISO = `${sumarDias(r.desde, -1)}T00:00:00.000Z`;
  const hastaISO = `${sumarDias(r.hastaExclusivo, 1)}T00:00:00.000Z`;

  const [acciones, participantes, indicadores, evidencias, mediciones, guardada, zonaEmpresa] = await Promise.all([
    sb.from("actions").select("*").eq("company_id", companyId),
    sb.from("participants").select("id,nombre,puesto").eq("company_id", companyId),
    sb.from("indicadores").select("*").eq("company_id", companyId),
    sb.from("evidencias").select("id,action_id,tipo,nombre,nota,created_at").eq("company_id", companyId).not("action_id", "is", null),
    leerMediciones(sb, companyId),
    leerGuardada(sb, companyId, semana),
    zonaValida(zona) ? Promise.resolve(zona) : zonaDeEmpresa(companyId, sb),
  ]);
  if (acciones.error) throw new Error(`No se pudo leer el plan: ${acciones.error.message}`);
  if (indicadores.error) throw new Error(`No se pudieron leer los indicadores: ${indicadores.error.message}`);
  if (participantes.error) throw new Error(`No se pudieron leer las personas del equipo: ${participantes.error.message}`);
  if (evidencias.error) throw new Error(`No se pudieron leer las evidencias: ${evidencias.error.message}`);

  const filasAcciones = (acciones.data ?? []) as Record<string, unknown>[];
  const idsAcciones = filasAcciones.map((a) => String(a.id));
  const kpis = ((indicadores.data ?? []) as Record<string, unknown>[]).map(desdeFila);
  const idsKpis = kpis.map((k) => k.id);

  const [historial, valores] = await Promise.all([
    idsAcciones.length
      ? sb.from("accion_historial").select("id,action_id,accion,motivo,implica,actor_rol,created_at").in("action_id", idsAcciones).gte("created_at", desdeISO).lt("created_at", hastaISO).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    idsKpis.length
      ? sb.from("indicador_valores").select("indicador_id,periodo,valor,fuente,estado_validacion,created_at").in("indicador_id", idsKpis).order("periodo", { ascending: false }).limit(2000)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  if (historial.error) throw new Error(`No se pudo leer el historial: ${historial.error.message}`);
  if (valores.error) throw new Error(`No se pudieron leer los valores de los indicadores: ${valores.error.message}`);

  return armar(
    {
      companyId,
      acciones: filasAcciones.map((f) => comoAccion(f, companyId)),
      historial: ((historial.data ?? []) as Record<string, unknown>[]).map((h) => ({
        id: h.id != null ? String(h.id) : undefined,
        action_id: String(h.action_id),
        accion: String(h.accion),
        motivo: (h.motivo as string | null) ?? null,
        implica: (h.implica as string | null) ?? null,
        actor_rol: (h.actor_rol as string | null) ?? null,
        created_at: String(h.created_at),
      })),
      indicadores: kpis,
      valores: ((valores.data ?? []) as Record<string, unknown>[]).map((v) => ({
        indicador_id: String(v.indicador_id),
        periodo: String(v.periodo),
        valor: Number(v.valor),
        fuente: (v.fuente as string | null) ?? null,
        estado_validacion: (v.estado_validacion as string | null) ?? null,
        created_at: (v.created_at as string | null) ?? null,
      })),
      evidencias: ((evidencias.data ?? []) as Record<string, unknown>[]).map((ev) => ({
        id: String(ev.id),
        action_id: (ev.action_id as string | null) ?? null,
        tipo: String(ev.tipo ?? "nota"),
        nombre: (ev.nombre as string | null) ?? null,
        nota: (ev.nota as string | null) ?? null,
        created_at: (ev.created_at as string | null) ?? null,
      })),
      participantes: ((participantes.data ?? []) as Record<string, unknown>[]).map((p) => ({ id: String(p.id), nombre: String(p.nombre ?? ""), puesto: (p.puesto as string | null) ?? null })),
      mediciones,
      textos: guardada.fila,
      zona: zonaEmpresa,
    },
    semana,
    hoy
  );
}

/**
 * Lo que `guardar` devuelve: qué fila quedó y si nació ahora. `marca_sin_fecha` viene cuando la semana se marcó
 * como revisada en una base sin supabase/migracion-revision-revisada.sql: quedó quién, no cuándo.
 */
export type Guardado = { id: string; creada: boolean; marca_sin_fecha?: true };

/** Texto nuevo si lo hay; si no, el que había; si no, null. Así nada que escribió una persona se pisa con un vacío. */
function conservar(nuevo: string | null | undefined, viejo: string | null | undefined): string | null {
  if (hayTexto(nuevo)) return nuevo.trim();
  if (hayTexto(viejo)) return viejo;
  return null;
}

/** Los tres textos que escribe la consultora. */
export const CAMPOS_ESCRITOS = ["explicacion", "decision_necesaria", "siguiente"] as const;
export type CampoEscrito = (typeof CAMPOS_ESCRITOS)[number];

export type OpcionesGuardar = {
  /**
   * Campos que la consultora dejó en blanco A PROPÓSITO (borró su propio texto). Solo así un vacío reemplaza a lo
   * guardado; un vacío que llega porque nadie tocó el campo nunca pisa nada.
   */
  vaciar?: readonly CampoEscrito[];
};

/** Lo que se le dice a la consultora cuando la marca tuvo que guardarse como antes de la migración. */
export const AVISO_MARCA_SIN_FECHA =
  "Semana marcada como revisada. Quedó guardado quién la revisó, pero no la fecha: a la base le falta la migración supabase/migracion-revision-revisada.sql.";
/** Lo que se le dice cuando pide marcar una semana que ya estaba marcada. */
export const AVISO_YA_REVISADA =
  "Esta semana ya estaba marcada como revisada: se conserva quién la revisó primero y cuándo. Lo que escribiste sí se guardó.";

/**
 * Upsert por (company_id, semana). Las cuatro listas derivadas se refrescan siempre; explicación, decisión y
 * siguiente solo se escriben si traen texto, y si no, se conserva lo que ya había (salvo lo que la consultora
 * vació a propósito, `opciones.vaciar`). Quién revisó y cuándo va en `revisada_por` y `revisada_at`; `creada_por`
 * es quien guardó la fila por primera vez. LA PRIMERA MARCA MANDA: si la fila ya está marcada, se conserva.
 *
 * Si a la base le faltan esas columnas (migración pendiente) «Marcar revisada» SIGUE FUNCIONANDO como antes de la
 * migración: la marca se escribe en `creada_por`, sin fecha, y se devuelve `marca_sin_fecha` para decirlo. Cuando la
 * migración se aplique copiará esa marca a `revisada_por`. Si la escritura falla, se lanza: no hay «guardada» a medias.
 */
export async function guardar(r: Revision, sb: Lector, opciones: OpcionesGuardar = {}): Promise<Guardado> {
  const { fila: previa, conRevisada } = await leerGuardada(sb, r.company_id, r.semana);
  const vaciar = new Set<CampoEscrito>(opciones.vaciar ?? []);
  const texto = (campo: CampoEscrito) => (vaciar.has(campo) ? null : conservar(r[campo], previa?.[campo]));

  const fila: Record<string, unknown> = {
    company_id: r.company_id,
    semana: r.semana,
    que_debia_ocurrir: r.que_debia_ocurrir,
    que_ocurrio: r.que_ocurrio,
    evidencia: r.evidencia,
    desvios: r.desvios,
    explicacion: texto("explicacion"),
    decision_necesaria: texto("decision_necesaria"),
    siguiente: texto("siguiente"),
  };
  let marcaSinFecha = false;
  if (conRevisada) {
    fila.creada_por = r.creada_por ?? previa?.creada_por ?? null;
    // La primera marca manda: lo que ya dice la fila sobre quién revisó y cuándo no se reemplaza.
    const yaMarcada = Boolean(previa?.revisada_at || previa?.revisada_por);
    fila.revisada_at = yaMarcada ? previa?.revisada_at ?? null : r.revisada_at ?? null;
    fila.revisada_por = yaMarcada ? previa?.revisada_por ?? null : r.revisada_por ?? null;
  } else {
    // Esquema anterior: allí `creada_por` ES la marca de «revisada». Guardar un texto no la enciende; marcar sí, y
    // queda quien marcó. Una fila leída sin las columnas nunca trae fecha, así que una fecha aquí es una marca de ahora.
    marcaSinFecha = Boolean(r.revisada_at && r.revisada_por) && !previa?.creada_por;
    fila.creada_por = previa?.creada_por ?? (marcaSinFecha ? r.revisada_por : null);
  }
  const conMarca = marcaSinFecha ? { marca_sin_fecha: true as const } : {};

  if (previa) {
    const { error } = await sb.from("revisiones_semanales").update(fila).eq("id", previa.id);
    if (error) throw new Error(`No se pudo guardar la revisión: ${error.message}`);
    return { id: previa.id, creada: false, ...conMarca };
  }
  const { data, error } = await sb.from("revisiones_semanales").insert(fila).select("id").single();
  if (error || !data) throw new Error(`No se pudo guardar la revisión: ${error?.message ?? "la base no devolvió la fila"}`);
  return { id: String((data as { id: string }).id), creada: true, ...conMarca };
}

// ───────────────────────── LO QUE ESCRIBE LA CONSULTORA, Y NADA MÁS ─────────────────────────

/** Los tres textos tal como están en las cajas de la pantalla. */
export type Escrito = Record<CampoEscrito, string>;

/**
 * Con qué nacen las cajas: con lo que la consultora YA escribió para esa semana, o vacías. Nunca con la propuesta
 * del sistema: una caja que nace rellena se guarda como si alguien la hubiera decidido.
 */
export function escritoDe(r: Pick<Revision, CampoEscrito>): Escrito {
  return { explicacion: r.explicacion ?? "", decision_necesaria: r.decision_necesaria ?? "", siguiente: r.siguiente ?? "" };
}

/** Lo que viaja al servidor al guardar. Un campo ausente es un campo que nadie tocó. */
export type CuerpoRevision = { semana?: string; explicacion?: string | null; decision_necesaria?: string | null; siguiente?: string | null; marcar_revisada?: boolean };

/** Qué campos cambió la consultora respecto de lo guardado (sin contar espacios al borde). */
export function camposEditados(guardado: Escrito, escrito: Escrito): CampoEscrito[] {
  return CAMPOS_ESCRITOS.filter((c) => escrito[c].trim() !== guardado[c].trim());
}

/**
 * El cuerpo de «Guardar»: la semana y SOLO los campos que la consultora editó. Guardar la explicación no manda
 * la decisión ni el siguiente; una caja que ella vació viaja vacía, porque borrar su texto también es editar.
 */
export function cuerpoDeGuardado(semana: string, guardado: Escrito, escrito: Escrito, marcar = false): CuerpoRevision & { semana: string } {
  const cuerpo: CuerpoRevision & { semana: string } = { semana };
  for (const campo of camposEditados(guardado, escrito)) cuerpo[campo] = escrito[campo].trim();
  if (marcar) cuerpo.marcar_revisada = true;
  return cuerpo;
}

/**
 * «Usar esta propuesta»: la consultora toma la propuesta del sistema y la pone en su caja. Si la caja está en
 * blanco, queda la propuesta; si ya tenía texto, la propuesta se añade debajo (nada de lo que escribió se borra);
 * si ya la contenía, no se repite.
 */
export function conPropuesta(actual: string, propuesta: string): string {
  const p = propuesta.trim();
  if (!p) return actual;
  if (!actual.trim()) return p;
  if (actual.includes(p)) return actual;
  return `${actual.trimEnd()}\n${p}`;
}

export const ERROR_SIN_EXPLICACION = "Para marcar la semana como revisada escribe la explicación: qué pasó y por qué. Sin eso la revisión es una lista, no una revisión.";

/**
 * ¿La semana ya terminó PARA LA EMPRESA? Termina cuando en su reloj ya es el lunes siguiente: el domingo a las
 * 23:30 de Lima todavía no (aunque en UTC sea lunes); el lunes a las 00:30 de Lima, sí. Una semana futura no terminó.
 */
export function semanaTerminada(semana: string, ahora: Date = new Date(), zona: string = ZONA_POR_DEFECTO): boolean {
  const hoy = diaEnZona(ahora, zonaValida(zona) ? zona : ZONA_POR_DEFECTO);
  return hoy != null && hoy >= rangoSemana(semana).hastaExclusivo;
}

/**
 * Lo que se responde al querer marcar como revisada una semana que no terminó. La marca dice «esta semana se
 * miró entera» y no se puede corregir después (la primera marca manda): por eso no se pone antes de tiempo.
 * Dice desde qué día se podrá, y que los textos sí se guardan.
 */
export function errorSemanaSinTerminar(semana: string, ahora: Date = new Date(), zona: string = ZONA_POR_DEFECTO): string {
  const r = rangoSemana(semana);
  const hoy = diaEnZona(ahora, zonaValida(zona) ? zona : ZONA_POR_DEFECTO) ?? r.desde;
  const nombre = nombreDeSemana(semana).toLowerCase();
  const que = hoy < r.desde ? `La ${nombre} todavía no empezó` : `La ${nombre} todavía no terminó`;
  return `${que}: se podrá marcar como revisada desde el ${fechaDia(r.hastaExclusivo)}. Lo que escribas sí se guarda con «Guardar»; la marca espera a que la semana cierre.`;
}

export const ERROR_REVISADA_SIN_EXPLICACION = "Esta semana ya está marcada como revisada: su explicación se puede corregir, no dejar en blanco.";

/** Qué pasó con la marca de «revisada»: se puso ahora, ya estaba y se conservó, o nadie pidió marcar (null). */
export type MarcaAplicada = "nueva" | "conservada" | null;

/**
 * `conflicto` viene cuando lo que se pidió está bien formado pero choca con el estado de la semana (todavía no
 * terminó): la ruta lo responde como 409. Sin él, el error es del cuerpo que llegó (400).
 */
export type Aplicado = { ok: true; revision: Revision; vaciar: CampoEscrito[]; marca: MarcaAplicada } | { ok: false; error: string; conflicto?: true };

/**
 * Pone en la revisión lo que la consultora mandó, y nada más. Un campo que no viene no se tocó: queda lo guardado,
 * NUNCA la propuesta del sistema. Uno que viene con texto es lo que ella escribió; uno que viene vacío lo vació
 * ella. `marcar_revisada` exige explicación y deja quién revisó y cuándo en `revisada_por` y `revisada_at`;
 * `creada_por` es quien guarda la fila por primera vez. Si la semana YA estaba revisada, la marca no se toca
 * (`marca: "conservada"`): volver a pulsar no reemplaza a quien la revisó primero ni su fecha. No toca la base ni
 * cambia la revisión que recibe.
 *
 * SOLO SE MARCA UNA SEMANA QUE TERMINÓ, contada con el reloj de la empresa (`r.zona`). Hasta el 13-10-2026 se
 * podía marcar la semana en curso, o una futura, y esa marca ya no se podía corregir. Pedirlo devuelve
 * `conflicto` y no aplica nada: tampoco los textos que vinieran en el mismo cuerpo, que se guardan sin la marca.
 */
export function aplicarEscrito(r: Revision, cuerpo: CuerpoRevision, quien: string, ahora: Date = new Date()): Aplicado {
  if (cuerpo.marcar_revisada && !semanaTerminada(r.semana, ahora, r.zona)) {
    return { ok: false, error: errorSemanaSinTerminar(r.semana, ahora, r.zona), conflicto: true };
  }
  const revision: Revision = { ...r };
  const vaciar: CampoEscrito[] = [];
  for (const campo of CAMPOS_ESCRITOS) {
    const valor = cuerpo[campo];
    if (valor === undefined) continue;
    if (hayTexto(valor)) revision[campo] = valor.trim();
    else {
      revision[campo] = null;
      vaciar.push(campo);
    }
  }
  if (cuerpo.marcar_revisada && !revision.explicacion) return { ok: false, error: ERROR_SIN_EXPLICACION };
  if (revision.revisada && vaciar.includes("explicacion")) return { ok: false, error: ERROR_REVISADA_SIN_EXPLICACION };
  revision.creada_por = revision.creada_por ?? quien;
  let marca: MarcaAplicada = null;
  if (cuerpo.marcar_revisada) {
    if (revision.revisada) marca = "conservada";
    else {
      revision.revisada_at = ahora.toISOString();
      revision.revisada_por = quien;
      revision.revisada = true;
      marca = "nueva";
    }
  }
  return { ok: true, revision, vaciar, marca };
}

// ───────────────────────── PARA EL DUEÑO ─────────────────────────

export type SemanaCliente = {
  semana: string;
  nombre: string;
  /** Qué se esperaba de ti y de tu equipo. */
  esperado: string[];
  /** Qué se hizo. */
  hecho: string[];
  /** Qué falta, sin culpa. */
  falta: string[];
  resultado: string;
  /** Lo que la consultora escribió para esta semana, si lo hizo. */
  explicacion: string | null;
  siguiente: string | null;
  vacia: boolean;
};

/** Lo que el dueño ve de su plan: lo aprobado y lo que sigue de ahí (igual que en «Tu plan»). */
const VISIBLES_CLIENTE: readonly Estado[] = ["aprobado", "en_ejecucion", "reportado", "verificado", "bloqueado"];
const EVENTOS_CLIENTE: readonly Evento[] = ["iniciar", "reportar", "verificar", "bloquear", "desbloquear", "rechazar_verificacion", "aprobar"];

/**
 * La misma revisión, en frases cortas y sin jerga para el dueño: qué se esperaba de él y de su equipo, qué se
 * hizo y qué falta. Lo que es conversación de la consultora (responsables sin asignar, metas sin plan,
 * verificaciones que le tocan a ella) no se le echa encima a la empresa.
 */
export function paraCliente(r: Revision): SemanaCliente {
  const esperado: string[] = [];
  const falta: string[] = [];
  for (const x of r.que_debia_ocurrir) {
    if (x.clase === "accion") {
      if (!x.estado || !VISIBLES_CLIENTE.includes(x.estado)) continue;
      const quien = x.responsable ? ` (${x.responsable})` : "";
      esperado.push(x.tipo === "accion_empieza" ? `Empezar «${x.titulo}»${quien} el ${fechaDia(x.fecha)}.` : `Terminar «${x.titulo}»${quien} para el ${fechaDia(x.fecha)}.`);
      if (x.cumplido === false) {
        falta.push(
          x.estado === "bloqueado"
            ? `«${x.titulo}» está trabada; la consultora ya lo ve.`
            : x.tipo === "accion_empieza"
              ? `«${x.titulo}» todavía no empezó; estaba previsto para el ${fechaDia(x.fecha)}.`
              : `«${x.titulo}» sigue pendiente; vencía el ${fechaDia(x.fecha)}. Cuando la termines, pulsa «Ya lo hice» y sube una prueba.`
        );
      }
    } else {
      const periodos = (x.periodos ?? []).map(nombreDePeriodoKpi);
      esperado.push(periodos.length === 1 ? `Anotar «${x.titulo}» de ${periodos[0]}.` : `Anotar «${x.titulo}» cada día (${periodos.length} días).`);
      if (x.cumplido === false) {
        const sinDato = (x.periodos ?? []).filter((p) => !(x.periodos_con_valor ?? []).includes(p)).map(nombreDePeriodoKpi);
        falta.push(`Falta anotar «${x.titulo}» de ${sinDato.join(", ")}. Si no tienes el dato, se anota como sin dato, no como cero.`);
      }
    }
  }
  const hecho = r.que_ocurrio
    .filter((o) => o.tipo === "valor" || (o.evento && EVENTOS_CLIENTE.includes(o.evento)))
    .map((o) => `${o.texto_cliente}.`);
  // Lo que está trabado se dice aunque no venciera esta semana: es lo que la empresa necesita destrabar.
  for (const d of r.desvios) {
    if (d.tipo !== "retraso") continue;
    if (falta.some((f) => f.includes(`«${d.titulo}»`))) continue;
    falta.push(`«${d.titulo}» sigue pendiente desde antes de esta semana. Si está trabada, avísalo en Tu plan.`);
  }
  return {
    semana: r.semana,
    nombre: nombreDeSemana(r.semana),
    esperado,
    hecho,
    falta,
    resultado: r.resultado.texto_cliente,
    explicacion: r.explicacion,
    siguiente: r.siguiente,
    vacia: r.vacia,
  };
}

/** Para las pantallas: el estado de una acción con las palabras de cada lado. */
export const ESTADO_TEXTO = { consultor: ESTADO_CONSULTOR, cliente: ESTADO_CLIENTE } as const;
