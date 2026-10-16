/**
 * INDICADORES (KPI) Y SISTEMA DE DIRECCIÓN — lo que convierte un número suelto en un instrumento.
 *
 * Hasta el 13-10-2026 un indicador tenía nombre, cómo se mide, unidad, meta y frecuencia; nada más.
 * No decía de dónde sale el dato, quién lo cuenta, desde dónde se parte, cuándo hay que llegar, qué
 * tan comprobado está el último valor, a partir de qué cifra hay que preocuparse ni qué acción lo
 * persigue. Un indicador así se puede leer, pero no se puede dirigir con él (R13.1).
 *
 * Este módulo es puro y determinista: no toca la base, no llama a la IA, no inventa. Reglas que no
 * se negocian (instrucción de Dirección, sección 13):
 *
 *  1. La falta de dato NUNCA es cero. Un periodo sin dato se anota como «sin dato en <periodo>» y no
 *     produce fila en la historia de valores.
 *  2. Un indicador sin fuente o sin responsable no está listo: nadie lo va a contar.
 *  3. El avance se mide entre periodos equivalentes (mes contra mes, semana contra semana) y contra
 *     el punto de partida exacto que se registró; lo que se obtiene es el resultado OBSERVADO. Que se
 *     deba a la consultoría se decide aparte, con la verificación.
 *  4. Una meta con plazo y sin acción que la persiga es una alerta, no una meta.
 *  5. Ejecución (qué se hizo) y resultado (qué cambió en el negocio) son dos clases distintas de
 *     indicador y nunca se suman ni se confunden: cumplir tareas no es mejora financiera.
 *  6. Un periodo cierra en el reloj de la empresa (su zona horaria), no en UTC: a las 19:00 de Lima del
 *     último día del mes, el mes sigue abierto. UNA excepción, y solo para lo diario (16-10-2026): si la empresa
 *     dice a qué hora cierra el negocio (companies.hora_cierre), el valor de HOY se anota desde esa hora. Una
 *     tienda que cierra a las 19:00 ya sabe cuánto vendió hoy; pedirle que espere a medianoche era pedirle que lo
 *     anote mañana, de memoria. Sin hora de cierre, todo sigue como antes.
 *  7. Nada se archiva sin motivo: quien deja de vigilar un número dice por qué.
 *
 * Vocabulario: el cliente ve «indicador», «punto de partida», «meta» y «cómo se cuenta». Nunca «KPI»
 * ni «baseline». Las claves internas sí usan kpi/linea_base porque así se llaman en la base.
 */
import { comparables, type Moneda } from "./finanzas";
import { VITALES, normalizarMetrica, etiquetaEstado, PERIODO_DORADA, comoSeMide, type Metrica } from "./metricas";
import { MESES, nombreDePeriodo } from "./temporadas";
import { estadoCanonico, ESTADO_CONSULTOR, type Estado } from "./plan-reglas";

// ─── Vocabulario cerrado (coincide con los checks de migracion-plan-kpi-linea-base.sql) ───────────

export const UNIDADES = ["soles", "de_cada_10", "dias", "personas", "numero", "porcentaje", "horas", "unidades", "moneda", "soles_por_hora"] as const;
export type Unidad = (typeof UNIDADES)[number];

export const FRECUENCIAS = ["diaria", "semanal", "quincenal", "mensual", "trimestral"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

export const TIPOS_INDICADOR = ["ejecucion", "resultado"] as const;
export type TipoIndicador = (typeof TIPOS_INDICADOR)[number];

/** Lo que puede decir el indicador de su último valor. `sin_dato` solo vive en el indicador: la historia no guarda huecos. */
export const ESTADOS_VALIDACION = ["declarado", "extraido", "conciliado", "verificado", "sin_dato"] as const;
export type EstadoValidacion = (typeof ESTADOS_VALIDACION)[number];
export const ESTADOS_VALIDACION_VALOR = ["declarado", "extraido", "conciliado", "verificado"] as const;
export type EstadoValidacionValor = (typeof ESTADOS_VALIDACION_VALOR)[number];

export const SENTIDOS_UMBRAL = ["por_debajo", "por_encima"] as const;
export type SentidoUmbral = (typeof SENTIDOS_UMBRAL)[number];

export type MejorSi = "sube" | "baja" | "neutro";
export type EstadoKpi = "propuesto" | "activo" | "archivado";

/** Unidades que exigen decir la moneda: un «120» en soles no es lo mismo que en dólares. */
export const UNIDADES_MONETARIAS: ReadonlySet<Unidad> = new Set<Unidad>(["soles", "moneda", "soles_por_hora"]);

export const UNIDAD_TEXTO: Record<Unidad, string> = {
  soles: "soles",
  de_cada_10: "de cada 10",
  dias: "días",
  personas: "personas",
  numero: "cantidad",
  porcentaje: "porcentaje",
  horas: "horas",
  unidades: "unidades",
  moneda: "dinero (otra moneda)",
  soles_por_hora: "soles por hora",
};

export const FRECUENCIA_TEXTO: Record<Frecuencia, string> = {
  diaria: "cada día",
  semanal: "cada semana",
  quincenal: "cada quincena",
  mensual: "cada mes",
  trimestral: "cada trimestre",
};

export const TIPO_TEXTO: Record<TipoIndicador, string> = {
  ejecucion: "de ejecución: qué se hizo",
  resultado: "de resultado: qué cambió en el negocio",
};

/** Cómo se le dice al dueño qué tan comprobado está un valor. Un número de un documento no es «verificado». */
export const VALIDACION_TEXTO: Record<EstadoValidacion, string> = {
  declarado: "lo declaró la empresa",
  extraido: "sacado de un documento, sin conciliar",
  conciliado: "conciliado con los documentos",
  verificado: "verificado",
  sin_dato: "sin dato",
};

/** Junto a un valor: lo más reciente que se anotó fue un «sin dato», de ese mismo periodo o de uno posterior. Cierto en los dos casos. */
export const TEXTO_SIN_DATO_DESPUES = "lo último que se anotó fue «sin dato»";
/** Junto a un valor: el «sin dato» fue de ESE MISMO periodo. El número que se ve es el que había, y la historia lo conserva. */
export const TEXTO_SIN_DATO_MISMO_PERIODO = "de este mismo periodo se anotó después «sin dato»";

/**
 * Qué decir junto al último valor. «sin_dato» no califica al número que se ve (ese sigue siendo el último que
 * hubo): dice que lo más reciente que se anotó fue un «sin dato». «30 · setiembre · sin dato» confundía.
 *
 * El indicador NO guarda de qué periodo fue ese «sin dato» (no hay columna para eso). Antes se decía «después
 * se anotó un periodo sin dato», y era falso cuando el hueco se anotó sobre el MISMO periodo del valor. Solo
 * en un caso se puede asegurar que fue el mismo: cuando el periodo del valor es el último que cerró en el
 * reloj de la empresa, porque uno posterior todavía no se puede anotar y `registrarValor` no refleja ni los
 * anteriores ni los de otra clase de periodo. Para eso hace falta `reloj` (la zona de la empresa). Sin reloj,
 * o si ya cerró otro periodo, se dice lo que es cierto en los dos casos.
 */
export function textoValidacion(
  k: { estado_validacion: EstadoValidacion | null; valor_actual: number | null; valor_actual_periodo?: string | null; frecuencia?: Frecuencia },
  reloj?: { zona: string; hoy?: Date; horaCierre?: string | null }
): string {
  if (!k.estado_validacion) return "sin rotular";
  if (k.estado_validacion === "sin_dato" && k.valor_actual != null) {
    const mismo =
      !!reloj && !!k.frecuencia && !!k.valor_actual_periodo &&
      periodoCerradoMasReciente(k.frecuencia, reloj.hoy ?? new Date(), zonaDe(reloj.zona), reloj.horaCierre) === k.valor_actual_periodo;
    return mismo ? TEXTO_SIN_DATO_MISMO_PERIODO : TEXTO_SIN_DATO_DESPUES;
  }
  return VALIDACION_TEXTO[k.estado_validacion];
}

// ─── El indicador con sus doce atributos ─────────────────────────────────────────────────────────

export type Kpi = {
  id: string;
  company_id: string;
  clave: string;
  nombre: string;
  como_se_mide: string;
  mejor_si: MejorSi;
  origen: "incidencia" | "accion" | "manual";
  origen_texto: string | null;
  estado: EstadoKpi;
  created_at?: string | null;
  /** 1 · Qué mide, en una frase. */
  definicion: string | null;
  /** 2 · Cómo se calcula o se cuenta, para que alguien lo rehaga a mano. */
  formula: string | null;
  /** 3 · Unidad y, si es dinero, moneda. */
  unidad: Unidad;
  moneda: string | null;
  /** 4 · De dónde sale el dato (cuaderno de caja, Excel, sistema). */
  fuente: string | null;
  /** 5 · Quién lo cuenta: una persona identificada, no texto libre. */
  responsable_participant_id: string | null;
  /** 6 · Cada cuánto se registra. */
  frecuencia: Frecuencia;
  /** 7 · Punto de partida, su periodo y la versión exacta de la línea base de la que salió. */
  linea_base_valor: number | null;
  linea_base_periodo: string | null;
  linea_base_medicion_id: string | null;
  /** 8 · Meta (número o en palabras) y plazo. */
  meta_valor: number | null;
  meta_texto: string | null;
  meta_plazo: string | null;
  /** 9 · Último valor, su periodo y cuándo se registró. Solo entran con dato (registrarValor). */
  valor_actual: number | null;
  valor_actual_periodo: string | null;
  valor_actual_at: string | null;
  /** 10 · Qué tan comprobado está el último valor; «sin_dato» si el último periodo no tuvo dato. */
  estado_validacion: EstadoValidacion | null;
  /** 11 · A partir de qué cifra hay que preocuparse, y en qué sentido. */
  umbral_alerta: number | null;
  umbral_sentido: SentidoUmbral | null;
  /** 12 · Qué acción del plan lo persigue, o qué decisión dispara cruzar el umbral. */
  accion_asociada_id: string | null;
  decision_asociada: string | null;
  /** Ejecución o resultado. Sin esto, cumplir tareas se confunde con mejorar. */
  tipo_indicador: TipoIndicador | null;
};

/** Lo que hace falta para crear uno: todo menos lo que pone la base. */
export type NuevoKpi = Omit<Kpi, "id" | "created_at">;

const numeroONull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const textoONull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** De una fila de `indicadores` (numéricos pueden venir como texto) a un Kpi tipado. Lo desconocido cae a lo seguro. */
export function desdeFila(f: Record<string, unknown>): Kpi {
  const unidad = (UNIDADES as readonly string[]).includes(String(f.unidad)) ? (f.unidad as Unidad) : "numero";
  const frecuencia = (FRECUENCIAS as readonly string[]).includes(String(f.frecuencia)) ? (f.frecuencia as Frecuencia) : "mensual";
  return {
    id: String(f.id),
    company_id: String(f.company_id),
    clave: String(f.clave ?? ""),
    nombre: String(f.nombre ?? ""),
    como_se_mide: String(f.como_se_mide ?? ""),
    mejor_si: (["sube", "baja", "neutro"].includes(String(f.mejor_si)) ? f.mejor_si : "neutro") as MejorSi,
    origen: (["incidencia", "accion", "manual"].includes(String(f.origen)) ? f.origen : "manual") as Kpi["origen"],
    origen_texto: textoONull(f.origen_texto),
    estado: (["propuesto", "activo", "archivado"].includes(String(f.estado)) ? f.estado : "propuesto") as EstadoKpi,
    created_at: textoONull(f.created_at),
    definicion: textoONull(f.definicion),
    formula: textoONull(f.formula),
    unidad,
    moneda: textoONull(f.moneda),
    fuente: textoONull(f.fuente),
    responsable_participant_id: textoONull(f.responsable_participant_id),
    frecuencia,
    linea_base_valor: numeroONull(f.linea_base_valor),
    linea_base_periodo: textoONull(f.linea_base_periodo),
    linea_base_medicion_id: textoONull(f.linea_base_medicion_id),
    meta_valor: numeroONull(f.meta_valor),
    meta_texto: textoONull(f.meta_texto),
    meta_plazo: textoONull(f.meta_plazo),
    valor_actual: numeroONull(f.valor_actual),
    valor_actual_periodo: textoONull(f.valor_actual_periodo),
    valor_actual_at: textoONull(f.valor_actual_at),
    estado_validacion: (ESTADOS_VALIDACION as readonly string[]).includes(String(f.estado_validacion)) ? (f.estado_validacion as EstadoValidacion) : null,
    umbral_alerta: numeroONull(f.umbral_alerta),
    umbral_sentido: (SENTIDOS_UMBRAL as readonly string[]).includes(String(f.umbral_sentido)) ? (f.umbral_sentido as SentidoUmbral) : null,
    accion_asociada_id: textoONull(f.accion_asociada_id),
    decision_asociada: textoONull(f.decision_asociada),
    tipo_indicador: (TIPOS_INDICADOR as readonly string[]).includes(String(f.tipo_indicador)) ? (f.tipo_indicador as TipoIndicador) : null,
  };
}

// ─── Completitud: qué le falta para ser un instrumento ───────────────────────────────────────────

/**
 * Los doce atributos de Dirección, en su orden. `tipo_indicador` NO es uno de ellos: es la clasificación
 * (ejecución o resultado) y se muestra aparte. Contarlo hacía que el tablero dijera «de 13» y el resto, doce.
 */
export const ATRIBUTOS = [
  "definicion", "formula", "unidad", "fuente", "responsable", "frecuencia",
  "linea_base", "meta", "valor_actual", "estado_validacion", "umbral", "asociacion",
] as const;
export type Atributo = (typeof ATRIBUTOS)[number];

/** Cómo se llama cada atributo delante del consultor. El cliente no ve esta lista. */
export const ATRIBUTO_TEXTO: Record<Atributo, string> = {
  definicion: "qué mide",
  formula: "cómo se calcula",
  unidad: "unidad (y moneda si es dinero)",
  fuente: "de dónde sale el dato",
  responsable: "quién lo cuenta",
  frecuencia: "cada cuánto",
  linea_base: "punto de partida y su periodo",
  meta: "meta y plazo",
  valor_actual: "último valor y su periodo",
  estado_validacion: "qué tan comprobado está",
  umbral: "umbral de alerta y sentido",
  asociacion: "acción o decisión asociada",
};

/** Sin estos no se puede ni empezar a contar: nadie sabe qué, de dónde, quién ni cada cuánto. */
export const IMPRESCINDIBLES: readonly Atributo[] = ["definicion", "unidad", "fuente", "responsable", "frecuencia"];

/** Los dos que no se definen: aparecen solos al registrar el primer valor. */
export const ATRIBUTOS_DE_REGISTRO: readonly Atributo[] = ["valor_actual", "estado_validacion"];

export type Faltante = { atributo: Atributo; etiqueta: string; por_que: string };

const hayTexto = (s: string | null | undefined): boolean => typeof s === "string" && s.trim().length > 0;

/** Los atributos que faltan, en el orden de la lista de Dirección. Vacío = los doce están. */
export function completitud(k: Kpi): Faltante[] {
  const faltan: Faltante[] = [];
  const falta = (atributo: Atributo, por_que: string) => faltan.push({ atributo, etiqueta: ATRIBUTO_TEXTO[atributo], por_que });

  if (!hayTexto(k.definicion)) falta("definicion", "sin una frase que diga qué mide, cada quien entiende otra cosa");
  if (!hayTexto(k.formula)) falta("formula", "sin la cuenta escrita nadie puede rehacer el número");
  if (!(UNIDADES as readonly string[]).includes(k.unidad)) falta("unidad", "la unidad no es una de las conocidas");
  else if (UNIDADES_MONETARIAS.has(k.unidad) && !hayTexto(k.moneda)) falta("unidad", "es dinero y no dice en qué moneda");
  if (!hayTexto(k.fuente)) falta("fuente", "sin fuente, el dato no se puede ir a buscar");
  if (!hayTexto(k.responsable_participant_id)) falta("responsable", "sin una persona identificada, nadie lo cuenta");
  if (!(FRECUENCIAS as readonly string[]).includes(k.frecuencia)) falta("frecuencia", "la frecuencia no es una de las conocidas");
  if (k.linea_base_valor == null || !hayTexto(k.linea_base_periodo)) falta("linea_base", "sin punto de partida fechado no se sabe si mejoró");
  if (!(k.meta_valor != null || hayTexto(k.meta_texto)) || !hayTexto(k.meta_plazo)) falta("meta", "una meta sin plazo es un deseo");
  if (k.valor_actual == null || !hayTexto(k.valor_actual_periodo)) {
    falta("valor_actual", k.estado_validacion === "sin_dato" ? "el último periodo quedó sin dato" : "todavía no se registró ningún valor");
  }
  if (!k.estado_validacion) falta("estado_validacion", "no dice si el valor lo declaró alguien, salió de un documento o se verificó");
  if (k.umbral_alerta == null || !k.umbral_sentido) falta("umbral", "sin umbral, nada avisa cuando hay que decidir");
  if (!hayTexto(k.accion_asociada_id) && !hayTexto(k.decision_asociada)) falta("asociacion", "un indicador que no mueve ninguna acción ni decisión es un adorno");
  return faltan;
}

/**
 * ¿Está listo para contarse? Solo cuando no le falta ninguno de los doce atributos y además está
 * clasificado. Antes bastaban fuente, responsable y frecuencia, y el tablero llamaba «listo» a un
 * indicador sin meta ni umbral: con eso se anota un número, pero no se dirige con él.
 */
export function listo(k: Kpi): { ok: boolean; faltan: Faltante[] } {
  const faltan = completitud(k);
  return { ok: faltan.length === 0 && !!k.tipo_indicador, faltan };
}

export type Preparacion = "por_definir" | "espera_primer_valor" | "listo";

/**
 * En qué punto está un indicador. Distingue lo que falta DEFINIR de lo que solo falta REGISTRAR: a uno
 * recién definido le faltan el último valor y su validación, y decirle «no está listo para contarse»
 * sería decir que no se puede contar porque todavía no se contó.
 */
export function preparacion(k: Kpi): Preparacion {
  const faltan = completitud(k);
  if (faltan.length === 0 && k.tipo_indicador) return "listo";
  const soloRegistro = !!k.tipo_indicador && faltan.every((f) => ATRIBUTOS_DE_REGISTRO.includes(f.atributo));
  return soloRegistro ? "espera_primer_valor" : "por_definir";
}

export const PREPARACION_TEXTO: Record<Preparacion, string> = {
  por_definir: "no está listo para contarse",
  espera_primer_valor: "definido; solo le falta su primer valor",
  listo: "listo para contarse",
};

// ─── Archivar: nada sin motivo ───────────────────────────────────────────────────────────────────

export const MIN_LETRAS_MOTIVO = 8;

/** Cuántas letras tiene un texto. Puntos, números y espacios no explican nada: no cuentan. */
export function letrasDe(texto: string | null | undefined): number {
  if (typeof texto !== "string") return 0;
  return Array.from(texto).filter((c) => c.toLowerCase() !== c.toUpperCase()).length;
}

/** ¿El motivo dice algo? Al menos ocho letras: «no» o «ok» no le sirven a quien lo lea en seis meses. */
export const motivoSuficiente = (motivo: string | null | undefined): boolean => letrasDe(motivo) >= MIN_LETRAS_MOTIVO;

export const TEXTO_FALTA_MOTIVO = `Di por qué en una frase (al menos ${MIN_LETRAS_MOTIVO} letras). Sin motivo, el indicador no se archiva.`;

/** Ejecución y resultado nunca se mezclan en una misma lista. Lo sin clasificar se muestra aparte, no se adivina. */
export function separarPorTipo<T extends Pick<Kpi, "tipo_indicador">>(kpis: T[]): { ejecucion: T[]; resultado: T[]; sin_clasificar: T[] } {
  return {
    ejecucion: kpis.filter((k) => k.tipo_indicador === "ejecucion"),
    resultado: kpis.filter((k) => k.tipo_indicador === "resultado"),
    sin_clasificar: kpis.filter((k) => !k.tipo_indicador),
  };
}

// ─── Periodos: la frecuencia decide la forma ─────────────────────────────────────────────────────

export type Granularidad = "dia" | "semana" | "quincena" | "mes" | "trimestre";

export const GRANULARIDAD_DE: Record<Frecuencia, Granularidad> = {
  diaria: "dia",
  semanal: "semana",
  quincenal: "quincena",
  mensual: "mes",
  trimestral: "trimestre",
};

/** La forma que se escribe para cada frecuencia, para decírselo a quien se equivoque. */
export const FORMA_PERIODO: Record<Granularidad, string> = {
  dia: "AAAA-MM-DD (un día)",
  semana: "AAAA-Sss (semana del año, por ejemplo 2026-S41)",
  quincena: "AAAA-MM-Q1 o AAAA-MM-Q2 (primera o segunda quincena del mes)",
  mes: "AAAA-MM (un mes)",
  trimestre: "AAAA-T1 a AAAA-T4 (un trimestre)",
};

const RE_DIA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RE_SEMANA = /^(\d{4})-S(0[1-9]|[1-4]\d|5[0-3])$/;
const RE_QUINCENA = /^(\d{4})-(0[1-9]|1[0-2])-Q([12])$/;
const RE_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const RE_TRIMESTRE = /^(\d{4})-T([1-4])$/;

const dos = (n: number) => String(n).padStart(2, "0");
const utc = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d));

// ─── La zona horaria: un periodo cierra en el reloj de la empresa ────────────────────────────────

/** La zona de una empresa que no dice ninguna (es el valor por defecto de companies.zona_horaria). */
export const ZONA_POR_DEFECTO = "America/Lima";

/**
 * Reloj de calendario puro. Es lo que rige cuando NO se pasa zona: la fecha recibida ya es un día de
 * calendario codificado como medianoche UTC (así llama la revisión semanal), no un instante. Quien pasa
 * un instante («ahora») pasa siempre la zona de la empresa, con `zonaDe(companies.zona_horaria)`.
 */
export const ZONA_CALENDARIO = "UTC";

const relojes = new Map<string, Intl.DateTimeFormat>();
function relojDe(zona: string): Intl.DateTimeFormat | null {
  const ya = relojes.get(zona);
  if (ya) return ya;
  try {
    const nuevo = new Intl.DateTimeFormat("en-US", { timeZone: zona, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    relojes.set(zona, nuevo);
    return nuevo;
  } catch {
    return null; // zona que no existe
  }
}

/** La zona de la empresa tal como viene de la base; vacía o inventada cae a America/Lima, nunca a UTC. */
export function zonaDe(valor: unknown): string {
  const z = typeof valor === "string" ? valor.trim() : "";
  return z && relojDe(z) ? z : ZONA_POR_DEFECTO;
}

type Reloj = { a: number; m: number; d: number; h: number; min: number; s: number };

/** Lo que marca el reloj de la zona en ese instante (mes de 1 a 12). */
function relojEn(instante: Date, zona: string): Reloj {
  if (zona === ZONA_CALENDARIO) {
    return { a: instante.getUTCFullYear(), m: instante.getUTCMonth() + 1, d: instante.getUTCDate(), h: instante.getUTCHours(), min: instante.getUTCMinutes(), s: instante.getUTCSeconds() };
  }
  const p: Record<string, number> = {};
  for (const parte of (relojDe(zona) ?? relojDe(ZONA_POR_DEFECTO)!).formatToParts(instante)) {
    if (parte.type !== "literal") p[parte.type] = Number(parte.value);
  }
  return { a: p.year!, m: p.month!, d: p.day!, h: p.hour! % 24, min: p.minute!, s: p.second! };
}

/** El día de calendario (AAAA-MM-DD) que vive la empresa en ese instante. */
export function diaEnZona(instante: Date, zona: string = ZONA_POR_DEFECTO): string {
  const r = relojEn(instante, zona);
  return `${r.a}-${dos(r.m)}-${dos(r.d)}`;
}

/**
 * El instante en que empieza un día en la zona. Si ese día no tiene 00:00 porque el reloj salta por un
 * cambio de hora (pasa en Santiago), es el primer instante del día.
 */
function inicioDeDiaEn(a: number, m0: number, d: number, zona: string): Date {
  const comoUtc = Date.UTC(a, m0, d);
  if (zona === ZONA_CALENDARIO) return new Date(comoUtc);
  const desfase = (t: number) => {
    const r = relojEn(new Date(t), zona);
    return Date.UTC(r.a, r.m - 1, r.d, r.h, r.min, r.s) - t;
  };
  const t1 = comoUtc - desfase(comoUtc);
  if (t1 + desfase(t1) === comoUtc) return new Date(t1);
  const t2 = comoUtc - desfase(t1);
  if (t2 + desfase(t2) === comoUtc) return new Date(t2);
  return new Date(Math.max(t1, t2));
}

/**
 * El instante en que el reloj de la zona marca HH:MM de ese día. Mismo método que inicioDeDiaEn: si esa hora no
 * existe ese día porque el reloj salta, es el primer instante después del salto.
 */
function instanteEnZona(a: number, m0: number, d: number, h: number, min: number, zona: string): Date {
  const comoUtc = Date.UTC(a, m0, d, h, min);
  if (zona === ZONA_CALENDARIO) return new Date(comoUtc);
  const desfase = (t: number) => {
    const r = relojEn(new Date(t), zona);
    return Date.UTC(r.a, r.m - 1, r.d, r.h, r.min, r.s) - t;
  };
  const t1 = comoUtc - desfase(comoUtc);
  if (t1 + desfase(t1) === comoUtc) return new Date(t1);
  const t2 = comoUtc - desfase(t1);
  if (t2 + desfase(t2) === comoUtc) return new Date(t2);
  return new Date(Math.max(t1, t2));
}

// ─── La hora de cierre: el valor de hoy de un indicador diario ───────────────────────────────────

const RE_HORA = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

/** companies.hora_cierre tal como viene: «HH:MM» de 00:00 a 23:59, o null. Lo demás no es una hora y vale null. */
export function horaCierreValida(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 5);
  return RE_HORA.test(t) ? t : null;
}

const minutosDe = (hora: string): number => {
  const [, h, m] = RE_HORA.exec(hora)!;
  return +h * 60 + +m;
};

/** Semana ISO de una fecha (la semana empieza el lunes; la 1 es la que contiene el primer jueves). */
export function semanaISO(fecha: Date): { anio: number; semana: number } {
  const d = utc(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = utc(d.getUTCFullYear(), 0, 1);
  return { anio: d.getUTCFullYear(), semana: Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7) };
}

/** El lunes de una semana ISO. */
export function lunesDeSemanaISO(anio: number, semana: number): Date {
  const cuatroEnero = utc(anio, 0, 4);
  const dia = cuatroEnero.getUTCDay() || 7;
  const lunesSemana1 = utc(anio, 0, 4 - (dia - 1));
  return utc(lunesSemana1.getUTCFullYear(), lunesSemana1.getUTCMonth(), lunesSemana1.getUTCDate() + (semana - 1) * 7);
}

/** Qué clase de periodo es, por su forma. null si no tiene ninguna conocida («actual», «hoy», texto libre). */
export function granularidad(periodo: string | null | undefined): Granularidad | null {
  const p = (periodo ?? "").trim();
  if (RE_DIA.test(p)) {
    const [, a, m, d] = RE_DIA.exec(p)!;
    const f = utc(+a, +m - 1, +d);
    return f.getUTCMonth() === +m - 1 && f.getUTCDate() === +d ? "dia" : null; // 2026-02-30 no es un día
  }
  if (RE_SEMANA.test(p)) {
    const [, a, s] = RE_SEMANA.exec(p)!;
    // La semana 53 solo existe en los años que la tienen.
    return +s === 53 && semanaISO(utc(+a, 11, 28)).semana !== 53 ? null : "semana";
  }
  if (RE_QUINCENA.test(p)) return "quincena";
  if (RE_MES.test(p)) return "mes";
  if (RE_TRIMESTRE.test(p)) return "trimestre";
  return null;
}

/** ¿Este periodo tiene la forma que exige la frecuencia del indicador? Un valor semanal no entra en un indicador mensual. */
export function periodoValido(periodo: string, frecuencia: Frecuencia): boolean {
  return granularidad(periodo) === GRANULARIDAD_DE[frecuencia];
}

/**
 * El primer instante DESPUÉS del periodo. Un periodo está cerrado cuando ese instante ya pasó. Con la zona
 * de la empresa es el instante real: setiembre termina en Lima el 1 de octubre a las 05:00 UTC, no a las
 * 00:00. Sin zona devuelve el día siguiente como día de calendario (medianoche UTC).
 *
 * `horaCierre` (companies.hora_cierre) cambia SOLO los días: el día P se puede anotar desde el inicio del día P
 * en la zona más HH:MM, y eso es lo que se devuelve. Las semanas, quincenas, meses y trimestres no cambian.
 */
export function finDePeriodo(periodo: string, zona: string = ZONA_CALENDARIO, horaCierre?: string | null): Date | null {
  const hora = horaCierreValida(horaCierre);
  if (hora && granularidad(periodo) === "dia") {
    const [, a, m, d] = RE_DIA.exec(periodo.trim())!;
    const minutos = minutosDe(hora);
    return instanteEnZona(+a, +m - 1, +d, Math.floor(minutos / 60), minutos % 60, zona);
  }
  const dia = diaSiguienteAlPeriodo(periodo);
  return dia ? inicioDeDiaEn(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), zona) : null;
}

/** El primer día de calendario que ya no pertenece al periodo (codificado como medianoche UTC). */
function diaSiguienteAlPeriodo(periodo: string): Date | null {
  const g = granularidad(periodo);
  if (!g) return null;
  if (g === "dia") {
    const [, a, m, d] = RE_DIA.exec(periodo)!;
    return utc(+a, +m - 1, +d + 1);
  }
  if (g === "semana") {
    const [, a, s] = RE_SEMANA.exec(periodo)!;
    const lunes = lunesDeSemanaISO(+a, +s);
    return utc(lunes.getUTCFullYear(), lunes.getUTCMonth(), lunes.getUTCDate() + 7);
  }
  if (g === "quincena") {
    const [, a, m, q] = RE_QUINCENA.exec(periodo)!;
    return q === "1" ? utc(+a, +m - 1, 16) : utc(+a, +m, 1);
  }
  if (g === "mes") {
    const [, a, m] = RE_MES.exec(periodo)!;
    return utc(+a, +m, 1);
  }
  const [, a, t] = RE_TRIMESTRE.exec(periodo)!;
  return utc(+a, +t * 3, 1);
}

/**
 * ¿`periodo` termina ANTES que `otro`? Se ordena por el calendario, no por cómo se escriben: dentro de una
 * misma clase de periodo da lo mismo que el orden alfabético, pero si al indicador le cambiaron la frecuencia
 * «2026-S30» (una semana de julio) y «2026-09» no se pueden comparar letra a letra. Si alguno de los dos no
 * tiene forma conocida no hay orden que dar: false.
 */
export function terminaAntes(periodo: string | null | undefined, otro: string | null | undefined): boolean {
  const a = diaSiguienteAlPeriodo((periodo ?? "").trim());
  const b = diaSiguienteAlPeriodo((otro ?? "").trim());
  return !!a && !!b && a.getTime() < b.getTime();
}

/**
 * El periodo cerrado más reciente para una frecuencia. Nunca el que está en curso: no se anota lo que no
 * terminó. Qué día es «hoy» lo dice el reloj de la zona: el 30 de setiembre a las 19:00 de Lima ya es 1 de
 * octubre en UTC, y setiembre todavía no cerró. Sin zona, `hoy` se lee como día de calendario.
 */
export function periodoCerradoMasReciente(frecuencia: Frecuencia, hoy: Date = new Date(), zona: string = ZONA_CALENDARIO, horaCierre?: string | null): string {
  const reloj = relojEn(hoy, zona);
  const a = reloj.a;
  const m = reloj.m - 1;
  const d = reloj.d;
  switch (frecuencia) {
    case "diaria": {
      // Con hora de cierre, desde esa hora el día de hoy ya se puede anotar.
      const hora = horaCierreValida(horaCierre);
      if (hora && reloj.h * 60 + reloj.min >= minutosDe(hora)) return `${a}-${dos(m + 1)}-${dos(d)}`;
      const ayer = utc(a, m, d - 1);
      return `${ayer.getUTCFullYear()}-${dos(ayer.getUTCMonth() + 1)}-${dos(ayer.getUTCDate())}`;
    }
    case "semanal": {
      const haceUnaSemana = utc(a, m, d - 7);
      const s = semanaISO(haceUnaSemana);
      return `${s.anio}-S${dos(s.semana)}`;
    }
    case "quincenal": {
      if (d >= 16) return `${a}-${dos(m + 1)}-Q1`;
      const prev = utc(a, m - 1, 1);
      return `${prev.getUTCFullYear()}-${dos(prev.getUTCMonth() + 1)}-Q2`;
    }
    case "mensual": {
      const prev = utc(a, m - 1, 1);
      return `${prev.getUTCFullYear()}-${dos(prev.getUTCMonth() + 1)}`;
    }
    case "trimestral": {
      const trimestreActual = Math.floor(m / 3) + 1;
      return trimestreActual === 1 ? `${a - 1}-T4` : `${a}-T${trimestreActual - 1}`;
    }
  }
}

/** El periodo inmediatamente anterior, de la misma clase. */
export function periodoAnterior(periodo: string): string | null {
  const g = granularidad(periodo);
  if (!g) return null;
  if (g === "dia") {
    const [, a, m, d] = RE_DIA.exec(periodo)!;
    const f = utc(+a, +m - 1, +d - 1);
    return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`;
  }
  if (g === "semana") {
    const [, a, s] = RE_SEMANA.exec(periodo)!;
    const lunes = lunesDeSemanaISO(+a, +s);
    const w = semanaISO(utc(lunes.getUTCFullYear(), lunes.getUTCMonth(), lunes.getUTCDate() - 7));
    return `${w.anio}-S${dos(w.semana)}`;
  }
  if (g === "quincena") {
    const [, a, m, q] = RE_QUINCENA.exec(periodo)!;
    if (q === "2") return `${a}-${m}-Q1`;
    const prev = utc(+a, +m - 2, 1);
    return `${prev.getUTCFullYear()}-${dos(prev.getUTCMonth() + 1)}-Q2`;
  }
  if (g === "mes") {
    const [, a, m] = RE_MES.exec(periodo)!;
    const prev = utc(+a, +m - 2, 1);
    return `${prev.getUTCFullYear()}-${dos(prev.getUTCMonth() + 1)}`;
  }
  const [, a, t] = RE_TRIMESTRE.exec(periodo)!;
  return +t === 1 ? `${+a - 1}-T4` : `${a}-T${+t - 1}`;
}

/** Los últimos N periodos cerrados, del más reciente al más antiguo: lo que se le ofrece elegir a quien registra. */
export function periodosRecientes(frecuencia: Frecuencia, cantidad = 6, hoy: Date = new Date(), zona: string = ZONA_CALENDARIO, horaCierre?: string | null): string[] {
  const salida: string[] = [];
  let p: string | null = periodoCerradoMasReciente(frecuencia, hoy, zona, horaCierre);
  while (p && salida.length < cantidad) {
    salida.push(p);
    p = periodoAnterior(p);
  }
  return salida;
}

/** «2026-09» → «Setiembre 2026»; «2026-S41» → «Semana 41 de 2026». Para que ninguna pantalla muestre un código al dueño. */
export function nombreDePeriodoKpi(periodo: string | null | undefined): string {
  const p = (periodo ?? "").trim();
  const g = granularidad(p);
  if (g === "mes") return nombreDePeriodo(p);
  if (g === "dia") {
    const [, a, m, d] = RE_DIA.exec(p)!;
    return `${+d} de ${MESES[+m - 1]!.nombre.toLowerCase()} de ${a}`;
  }
  if (g === "semana") {
    const [, a, s] = RE_SEMANA.exec(p)!;
    return `Semana ${+s} de ${a}`;
  }
  if (g === "quincena") {
    const [, a, m, q] = RE_QUINCENA.exec(p)!;
    return `${q === "1" ? "Primera" : "Segunda"} quincena de ${MESES[+m - 1]!.nombre.toLowerCase()} ${a}`;
  }
  if (g === "trimestre") {
    const [, a, t] = RE_TRIMESTRE.exec(p)!;
    return `Trimestre ${t} de ${a}`;
  }
  return p ? nombreDePeriodo(p) : "sin periodo";
}

// ─── Mostrar un valor ────────────────────────────────────────────────────────────────────────────

const conDecimales = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** El valor en el idioma del dueño: «S/ 12.500», «7 de cada 10», «12 días». Nunca el código de la unidad. */
export function textoValor(unidad: Unidad, valor: number, moneda?: string | null): string {
  switch (unidad) {
    case "soles": return `S/ ${conDecimales(valor)}`;
    case "moneda": return `${moneda ?? ""} ${conDecimales(valor)}`.trim();
    case "soles_por_hora": return `S/ ${conDecimales(valor)} por hora`;
    case "de_cada_10": return `${conDecimales(valor)} de cada 10`;
    case "porcentaje": return `${conDecimales(valor)} %`;
    case "dias": return `${conDecimales(valor)} ${valor === 1 ? "día" : "días"}`;
    case "personas": return `${conDecimales(valor)} ${valor === 1 ? "persona" : "personas"}`;
    case "horas": return `${conDecimales(valor)} ${valor === 1 ? "hora" : "horas"}`;
    case "unidades": return `${conDecimales(valor)} ${valor === 1 ? "unidad" : "unidades"}`;
    default: return conDecimales(valor);
  }
}

// ─── Registrar un valor: la falta de dato no es cero ─────────────────────────────────────────────

export type DatoRegistro = {
  periodo: string;
  /** null = este periodo no tiene dato. No se guarda 0 ni se inventa nada. */
  valor: number | null;
  fuente?: string | null;
  estado_validacion?: EstadoValidacionValor | null;
  nota?: string | null;
};

export type FilaValor = {
  indicador_id: string;
  periodo: string;
  valor: number;
  fuente: string | null;
  estado_validacion: EstadoValidacionValor;
  nota: string | null;
};

export type RegistroValor =
  | { ok: false; motivo: string }
  | {
      ok: true;
      /** true cuando el periodo quedó sin dato: no hay fila que insertar. */
      sin_dato: true;
      insertar: null;
      /**
       * Vacío cuando el «sin dato» es de un periodo anterior al del valor actual, o de otra clase de periodo
       * (al indicador le cambiaron la frecuencia): no degrada lo que ya se sabe.
       */
      actualizar: { estado_validacion?: "sin_dato" };
      /** true si el periodo termina antes que el del valor actual. */
      es_periodo_anterior: boolean;
      texto: string;
    }
  | {
      ok: true;
      sin_dato: false;
      insertar: FilaValor;
      /** Vacío cuando el valor es de un periodo anterior al actual: la historia se completa sin mover «hoy». */
      actualizar: Partial<Pick<Kpi, "valor_actual" | "valor_actual_periodo" | "valor_actual_at" | "estado_validacion">>;
      /** true si el periodo termina antes que el del valor actual. */
      es_periodo_anterior: boolean;
      texto: string;
    };

export const TEXTO_SIN_DATO = (periodo: string) => `sin dato en ${nombreDePeriodoKpi(periodo)}`;

/** Lo que se le dice a quien quiere anotar el valor de hoy antes de la hora de cierre del negocio. */
export const textoHoySeAnotaDesde = (hora: string) => `Hoy se anota desde las ${hora}, cuando cierra el negocio.`;

/**
 * Qué hay que escribir para registrar un valor. No toca la base: devuelve la fila a insertar en
 * `indicador_valores` y los campos a actualizar en `indicadores`, o el motivo por el que no se puede.
 *
 * Con `valor: null` NO se inserta nada: la historia de valores no guarda huecos ni ceros fingidos. El
 * indicador queda en `estado_validacion = 'sin_dato'` y el texto dice «sin dato en <periodo>»; salvo que
 * el periodo sea ANTERIOR al del valor actual: un hueco de julio no degrada un setiembre ya conciliado.
 * Tampoco lo degrada un hueco de OTRA clase de periodo (al indicador le cambiaron la frecuencia): una semana
 * sin dato no desmiente un mes ya comprobado. Y si el hueco es del MISMO periodo que el valor actual, se
 * refleja, pero el texto lo dice con sus palabras: ese periodo ya tenía un valor y la historia lo conserva.
 *
 * `hoy` es un instante y `zona` la de la empresa: el periodo cierra en su reloj, no en UTC. `horaCierre` (solo para lo
 * diario): el día de hoy se puede anotar desde esa hora; antes, se dice desde qué hora.
 */
export function registrarValor(
  k: Pick<Kpi, "id" | "frecuencia" | "fuente" | "valor_actual_periodo">,
  dato: DatoRegistro,
  hoy: Date = new Date(),
  zona: string = ZONA_POR_DEFECTO,
  horaCierre?: string | null
): RegistroValor {
  const periodo = (dato.periodo ?? "").trim();
  if (!periodoValido(periodo, k.frecuencia)) {
    return { ok: false, motivo: `Este indicador se registra ${FRECUENCIA_TEXTO[k.frecuencia]}: el periodo se escribe ${FORMA_PERIODO[GRANULARIDAD_DE[k.frecuencia]]}.` };
  }
  const hora = horaCierreValida(horaCierre);
  const fin = finDePeriodo(periodo, zonaDe(zona), hora);
  if (fin && fin.getTime() > hoy.getTime()) {
    if (hora && granularidad(periodo) === "dia" && periodo === diaEnZona(hoy, zonaDe(zona))) {
      return { ok: false, motivo: textoHoySeAnotaDesde(hora) };
    }
    return { ok: false, motivo: `${nombreDePeriodoKpi(periodo)} todavía no terminó: se registra cuando cierre.` };
  }

  // Lo que llega de un periodo que terminó ANTES que el del valor actual completa la historia pero no pisa
  // el «hoy», traiga dato o no. Se ordena por cuándo termina cada uno (`terminaAntes`), no letra a letra: con
  // un cambio de frecuencia, «2026-S30» (julio) no es «posterior» a «2026-09» por más que se escriba después.
  const actual = (k.valor_actual_periodo ?? "").trim();
  const claseActual = granularidad(actual);
  const esAnterior = terminaAntes(periodo, actual);

  if (dato.valor == null) {
    // Un hueco de otra clase de periodo que el valor actual (al indicador le cambiaron la frecuencia) tampoco
    // lo toca, termine antes o después: una semana sin dato no desmiente un mes ya comprobado. Cuando llegue
    // un valor con la frecuencia nueva, ese sí pasa a ser el actual.
    const deOtraClase = claseActual != null && claseActual !== granularidad(periodo);
    if (esAnterior || deOtraClase) {
      return {
        ok: true, sin_dato: true, insertar: null, actualizar: {}, es_periodo_anterior: esAnterior,
        texto: `Se anotó ${TEXTO_SIN_DATO(periodo)}; el valor actual sigue siendo el de ${nombreDePeriodoKpi(actual)}.`,
      };
    }
    // Sobre el MISMO periodo del valor actual: se refleja (lo último anotado es que no hay dato), pero ese
    // periodo ya tenía un número y decir solo «sin dato en setiembre» lo escondía. El número no se borra.
    const texto = actual !== "" && periodo === actual
      ? `Se anotó ${TEXTO_SIN_DATO(periodo)}. Ese periodo ya tenía un valor: no se borra, sigue en la historia.`
      : TEXTO_SIN_DATO(periodo);
    return { ok: true, sin_dato: true, insertar: null, actualizar: { estado_validacion: "sin_dato" }, es_periodo_anterior: false, texto };
  }
  if (typeof dato.valor !== "number" || !Number.isFinite(dato.valor)) {
    return { ok: false, motivo: "El valor tiene que ser un número. Si no hay dato, déjalo vacío: no pongas cero." };
  }
  const estado_validacion = dato.estado_validacion ?? "declarado";
  if (!(ESTADOS_VALIDACION_VALOR as readonly string[]).includes(estado_validacion)) {
    return { ok: false, motivo: "El estado de validación no es uno de los conocidos." };
  }

  const insertar: FilaValor = {
    indicador_id: k.id,
    periodo,
    valor: dato.valor,
    fuente: hayTexto(dato.fuente) ? dato.fuente!.trim() : k.fuente ?? null,
    estado_validacion,
    nota: hayTexto(dato.nota) ? dato.nota!.trim() : null,
  };

  if (esAnterior) {
    return {
      ok: true, sin_dato: false, insertar, actualizar: {}, es_periodo_anterior: true,
      texto: `Se guardó ${nombreDePeriodoKpi(periodo)}; el valor actual sigue siendo el de ${nombreDePeriodoKpi(actual)}.`,
    };
  }
  return {
    ok: true, sin_dato: false, insertar, es_periodo_anterior: false,
    actualizar: { valor_actual: dato.valor, valor_actual_periodo: periodo, valor_actual_at: hoy.toISOString(), estado_validacion },
    texto: `Registrado para ${nombreDePeriodoKpi(periodo)} (${VALIDACION_TEXTO[estado_validacion]}).`,
  };
}

// ─── Alertas ─────────────────────────────────────────────────────────────────────────────────────

export type TipoAlerta = "umbral" | "desactualizado" | "sin_linea_base" | "meta_sin_plan";
export type Alerta = { tipo: TipoAlerta; texto: string };

/** Cuántos días puede tener el último valor antes de considerarse viejo, según la frecuencia. */
export const LIMITE_DIAS: Record<Frecuencia, number> = { diaria: 2, semanal: 10, quincenal: 20, mensual: 40, trimestral: 100 };

const DIA_MS = 86_400_000;

// ─── Meta sin plan: el vínculo entre indicador y acción se mira en sus dos sentidos ──────────────

/** Lo mínimo de una acción del plan para saber si persigue la meta de un indicador. */
export type AccionQuePersigue = { id: string; estado: string; indicador_id?: string | null; verificado_at?: string | null; accion?: string | null };

/** Por qué una meta se queda sin plan: nadie la persigue, o la única acción ligada ya no está sobre la mesa. */
export type MetaSinPlan<A extends AccionQuePersigue = AccionQuePersigue> = { motivo: "sin_accion" } | { motivo: "accion_fuera"; accion: A; estado: Estado };

/** Lo que ya no está sobre la mesa: una acción rechazada o pospuesta no persigue nada. */
const ESTADOS_FUERA_DEL_PLAN: readonly Estado[] = ["rechazado", "pospuesto"];

/**
 * ¿Este indicador tiene meta con plazo y ninguna acción que la persiga? El vínculo vive en DOS sitios y nada los
 * sincroniza: el indicador apunta a su acción (`accion_asociada_id`) y la acción apunta a su indicador
 * (`indicador_id`). Basta uno de los dos sentidos para que haya plan. Una acción rechazada o pospuesta no persigue
 * nada, la apunte quien la apunte. Sin meta o sin plazo no hay «meta sin plan»: no hay fecha que incumplir.
 * Es la única regla: la usan la revisión semanal y las alertas del tablero, para que no digan cosas distintas.
 */
export function metaSinPlan<A extends AccionQuePersigue>(
  k: Pick<Kpi, "id" | "meta_valor" | "meta_texto" | "meta_plazo" | "accion_asociada_id">,
  acciones: readonly A[]
): MetaSinPlan<A> | null {
  const hayMeta = k.meta_valor != null || hayTexto(k.meta_texto);
  if (!hayMeta || !hayTexto(k.meta_plazo)) return null;
  const sobreLaMesa = (a: A) => !ESTADOS_FUERA_DEL_PLAN.includes(estadoCanonico(a));
  // Sentido 1: una acción del plan dice que se mide con este indicador.
  if (acciones.some((a) => a.indicador_id === k.id && sobreLaMesa(a))) return null;
  // Sentido 2: el indicador dice qué acción lo mueve.
  if (!hayTexto(k.accion_asociada_id)) return { motivo: "sin_accion" };
  const asociada = acciones.find((a) => a.id === k.accion_asociada_id);
  // Si la acción asociada no está entre las leídas no se puede juzgar su estado: no se acusa.
  if (!asociada || sobreLaMesa(asociada)) return null;
  return { motivo: "accion_fuera", accion: asociada, estado: estadoCanonico(asociada) };
}

/**
 * Todas las alertas de un indicador, en orden de urgencia.
 *
 * `acciones` son las acciones del plan de la empresa (todas, también las rechazadas y pospuestas). Con ellas
 * delante, «meta sin plan» mira el vínculo en sus dos sentidos, igual que la revisión semanal: una acción que
 * dice medirse con este indicador (`indicador_id`) ya es un plan, aunque el indicador no la nombre. Sin ellas
 * solo se puede mirar lo que dice el indicador, y el texto dice eso y nada más: hasta el 13-10-2026 afirmaba
 * «ninguna acción del plan que la persiga» sin haber mirado el plan.
 */
export function alertas(k: Kpi, hoy: Date = new Date(), acciones?: readonly AccionQuePersigue[]): Alerta[] {
  const salida: Alerta[] = [];

  if (k.umbral_alerta != null && k.umbral_sentido && k.valor_actual != null) {
    const cruzado = k.umbral_sentido === "por_debajo" ? k.valor_actual < k.umbral_alerta : k.valor_actual > k.umbral_alerta;
    if (cruzado) {
      salida.push({
        tipo: "umbral",
        texto: `${textoValor(k.unidad, k.valor_actual, k.moneda)} está ${k.umbral_sentido === "por_debajo" ? "por debajo" : "por encima"} del umbral de ${textoValor(k.unidad, k.umbral_alerta, k.moneda)}${k.decision_asociada ? `: ${k.decision_asociada}` : "."}`,
      });
    }
  }

  const limite = LIMITE_DIAS[k.frecuencia];
  if (!k.valor_actual_at) {
    salida.push({ tipo: "desactualizado", texto: k.estado_validacion === "sin_dato" ? "El último periodo quedó sin dato y nunca hubo un valor." : "Todavía no tiene ningún valor registrado." });
  } else {
    const at = new Date(k.valor_actual_at).getTime();
    const edadDias = Number.isFinite(at) ? (hoy.getTime() - at) / DIA_MS : Infinity;
    if (edadDias > limite) {
      const dias = Math.floor(edadDias);
      salida.push({
        tipo: "desactualizado",
        // Con un valor a la vista no se dice «el último periodo quedó sin dato»: el hueco pudo anotarse sobre
        // el mismo periodo de ese valor (ver `textoValidacion`). Se dice lo que es cierto en los dos casos.
        texto: `El último valor tiene ${dias} días; para un indicador ${FRECUENCIA_TEXTO[k.frecuencia]} se admite hasta ${limite}.${k.estado_validacion === "sin_dato" ? " Lo último que se anotó fue «sin dato»." : ""}`,
      });
    }
  }

  if (k.linea_base_valor == null || !hayTexto(k.linea_base_periodo)) {
    salida.push({ tipo: "sin_linea_base", texto: "Sin punto de partida no se puede saber si mejoró." });
  }

  if (acciones) {
    const sinPlan = metaSinPlan(k, acciones);
    if (sinPlan?.motivo === "sin_accion") {
      salida.push({ tipo: "meta_sin_plan", texto: `Tiene meta con plazo (${k.meta_plazo}) y ninguna acción del plan que la persiga.` });
    } else if (sinPlan) {
      const nombre = (sinPlan.accion.accion ?? "").trim();
      const cual = nombre ? `, «${nombre}»,` : "";
      salida.push({ tipo: "meta_sin_plan", texto: `Tiene meta con plazo (${k.meta_plazo}) y la única acción ligada${cual} está ${ESTADO_CONSULTOR[sinPlan.estado].toLowerCase()}: hoy nadie la persigue.` });
    }
  } else {
    // Sin el plan delante solo se sabe lo que dice el indicador. No se afirma que nadie la persiga: puede haber
    // una acción que apunte a este indicador y aquí no se ve.
    const hayMeta = k.meta_valor != null || hayTexto(k.meta_texto);
    if (hayMeta && hayTexto(k.meta_plazo) && !hayTexto(k.accion_asociada_id)) {
      salida.push({ tipo: "meta_sin_plan", texto: `Tiene meta con plazo (${k.meta_plazo}) y el indicador no nombra ninguna acción del plan que la persiga.` });
    }
  }
  return salida;
}

/** La alerta más urgente, o null si no hay ninguna. `acciones`: ver `alertas`. */
export function alerta(k: Kpi, hoy: Date = new Date(), acciones?: readonly AccionQuePersigue[]): Alerta | null {
  return alertas(k, hoy, acciones)[0] ?? null;
}

// ─── Avance: punto de partida → hoy → meta ───────────────────────────────────────────────────────

export type Avance = {
  desde_linea_base: {
    delta: number;
    /** Variación porcentual. null si se partió de cero. */
    pct: number | null;
    /** true mejoró, false empeoró, null no se puede juzgar (sin cambio o indicador neutro). */
    mejoro: boolean | null;
  } | null;
  hacia_meta: {
    /** Porcentaje del camino recorrido entre el punto de partida y la meta. Puede ser negativo o pasar de 100. */
    pct: number;
    /** Lo que falta para la meta, con signo hacia ella. */
    falta: number;
    plazo: string | null;
  } | null;
  /** Siempre presente: cuando no hay avance, dice por qué. */
  lectura: string;
  /** Lo que mide es lo que se observó. Que se deba a la consultoría se decide aparte. */
  atribucion: "observado";
};

/**
 * Cuánto se movió el indicador desde su punto de partida y cuánto le falta para la meta. Solo si el
 * punto de partida y el valor actual son de periodos equivalentes (reutiliza `comparables` de
 * finanzas.ts sobre la clase de periodo y la moneda). Mes contra semana, o dos valores del mismo
 * periodo, no es avance: la lectura lo dice.
 */
export function avance(k: Kpi): Avance {
  const sin = (lectura: string): Avance => ({ desde_linea_base: null, hacia_meta: null, lectura, atribucion: "observado" });

  if (k.linea_base_valor == null || !hayTexto(k.linea_base_periodo)) return sin("Sin punto de partida fechado no hay avance que medir.");
  if (k.valor_actual == null || !hayTexto(k.valor_actual_periodo)) {
    return sin(k.estado_validacion === "sin_dato" ? "El último periodo quedó sin dato: no hay con qué comparar el punto de partida." : "Todavía no hay un valor actual que comparar con el punto de partida.");
  }
  const gBase = granularidad(k.linea_base_periodo);
  const gActual = granularidad(k.valor_actual_periodo);
  if (!gBase) return sin(`El punto de partida tiene un periodo sin forma conocida («${k.linea_base_periodo}»): no se puede comparar.`);
  if (!gActual) return sin(`El valor actual tiene un periodo sin forma conocida («${k.valor_actual_periodo}»): no se puede comparar.`);
  if (k.linea_base_periodo === k.valor_actual_periodo) return sin(`El valor actual es del mismo periodo que el punto de partida (${nombreDePeriodoKpi(k.linea_base_periodo)}): todavía no hay un después.`);

  const moneda = (k.moneda ?? undefined) as Moneda | undefined;
  const c = comparables(
    { clave: "punto_de_partida", valor: k.linea_base_valor, periodo: gBase, moneda },
    { clave: "valor_actual", valor: k.valor_actual, periodo: gActual, moneda }
  );
  if (!c.ok) return sin(`El punto de partida (${nombreDePeriodoKpi(k.linea_base_periodo)}) y el valor actual (${nombreDePeriodoKpi(k.valor_actual_periodo)}) no son periodos equivalentes: ${c.motivo.replace("periodos distintos", "clases de periodo distintas")}.`);

  const delta = k.valor_actual - k.linea_base_valor;
  const pct = k.linea_base_valor !== 0 ? (delta / Math.abs(k.linea_base_valor)) * 100 : null;
  const mejoro = delta === 0 || k.mejor_si === "neutro" ? null : k.mejor_si === "sube" ? delta > 0 : delta < 0;

  let hacia_meta: Avance["hacia_meta"] = null;
  if (k.meta_valor != null && k.meta_valor !== k.linea_base_valor) {
    const recorrido = k.meta_valor - k.linea_base_valor;
    hacia_meta = { pct: (delta / recorrido) * 100, falta: k.meta_valor - k.valor_actual, plazo: k.meta_plazo };
  }

  const v = (n: number) => textoValor(k.unidad, n, k.moneda);
  const juicio = mejoro === true ? "mejoró" : mejoro === false ? "empeoró" : delta === 0 ? "no cambió" : "cambió";
  const cuanto = delta === 0 ? "" : ` ${v(Math.abs(delta))}${pct != null ? ` (${Math.abs(pct).toFixed(0)} %)` : ""}`;
  const meta = hacia_meta
    ? ` Lleva ${hacia_meta.pct.toFixed(0)} % del camino a la meta de ${v(k.meta_valor!)}${k.meta_plazo ? ` para ${k.meta_plazo}` : ""}.`
    : k.meta_valor != null
      ? " La meta es igual al punto de partida: no hay camino que medir."
      : " Sin meta numérica no se mide el camino recorrido.";
  const lectura =
    `Partió en ${v(k.linea_base_valor)} (${nombreDePeriodoKpi(k.linea_base_periodo)}); hoy ${v(k.valor_actual)} (${nombreDePeriodoKpi(k.valor_actual_periodo)}): ${juicio}${cuanto}.${meta}` +
    " Es el resultado observado; que se deba a la consultoría se decide aparte, con la verificación.";

  return { desde_linea_base: { delta, pct, mejoro }, hacia_meta, lectura, atribucion: "observado" };
}

// ─── Propuestas: desde los nueve vitales y desde el medidor ──────────────────────────────────────

export type PropuestaKpi = {
  kpi: NuevoKpi;
  /** El último número que tiene la empresa para este vital. Se muestra; NO se registra como valor actual. */
  referencia: { valor: number; periodo: string; estado: string | null; etiqueta: string };
  rotulo: "propuesto";
};

const RE_MES_SIMPLE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/**
 * Propone (no crea) indicadores DE RESULTADO a partir de los nueve vitales que tienen valor. Cada uno
 * sale rotulado «propuesto»; el consultor decide cuál adopta y completa fuente, responsable y meta.
 * El valor de referencia se muestra para que se vea de dónde viene, pero no se escribe como valor
 * actual ni como punto de partida: eso se registra con dato y con fecha.
 */
export function kpisDesdeVitales(companyId: string, metricas: Metrica[]): PropuestaKpi[] {
  const salida: PropuestaKpi[] = [];
  for (const vital of VITALES) {
    const candidatos = metricas
      .map((m) => ({ n: normalizarMetrica(m.clave, m.periodo), valor: m.valor, estado: m.estado ?? null }))
      .filter((c) => c.n.clave === vital.clave && c.n.periodo !== PERIODO_DORADA && c.valor != null);
    if (candidatos.length === 0) continue;
    const conMes = candidatos.filter((c) => RE_MES_SIMPLE.test(c.n.periodo)).sort((a, b) => b.n.periodo.localeCompare(a.n.periodo));
    const elegido = conMes[0] ?? candidatos[0]!;
    const esDinero = vital.unidad === "soles";
    salida.push({
      rotulo: "propuesto",
      referencia: { valor: Number(elegido.valor), periodo: elegido.n.periodo, estado: elegido.estado, etiqueta: etiquetaEstado(elegido.estado) },
      kpi: {
        company_id: companyId,
        clave: vital.clave,
        nombre: vital.nombre,
        // La conversión se pregunta en dos conteos: «cómo se mide» lleva los dos y quién hace la cuenta.
        como_se_mide: comoSeMide(vital),
        mejor_si: vital.mejorSi,
        origen: "manual",
        origen_texto: `Uno de los nueve números de la empresa (n.º ${vital.n}).`,
        estado: "propuesto",
        definicion: `${vital.nombre}, tal como lo declara la empresa en sus números.`,
        formula: `Sin cálculo: es el número declarado para el periodo (clave ${vital.clave} en los números de la empresa).`,
        unidad: vital.unidad,
        moneda: esDinero ? "PEN" : null,
        fuente: `Los números de la empresa (Tus números); hoy ${etiquetaEstado(elegido.estado)}.`,
        responsable_participant_id: null,
        frecuencia: "mensual",
        linea_base_valor: null,
        linea_base_periodo: null,
        linea_base_medicion_id: null,
        meta_valor: null,
        meta_texto: null,
        meta_plazo: null,
        valor_actual: null,
        valor_actual_periodo: null,
        valor_actual_at: null,
        estado_validacion: null,
        umbral_alerta: null,
        umbral_sentido: null,
        accion_asociada_id: null,
        decision_asociada: null,
        tipo_indicador: "resultado",
      },
    });
  }
  return salida;
}

/** Lo que el medidor devuelve hoy (SalidaMedidor). No se toca el esquema: se completa a partir de esto. */
export type IndicadorMedidor = { clave: string; nombre: string; como_se_mide: string; unidad: string; origen_texto?: string | null };

const RE_FUENTE =
  /\b(?:el|la|los|las|del|de la|de los|de las|en el|en la|en los|en las|desde el|desde la|con el|con la)\s+((?:[a-záéíóúñ]+\s){0,2}?(?:cuaderno|libreta|caja|excel|hoja|sistema|whatsapp|boleta|factura|registro|agenda|kardex|inventario|planilla|ticket|comprobante|recibo|formulario|lista|aplicativo|app|correo|calendario|bitácora|bitacora|archivo)[a-záéíóúñ]*(?:\s(?:de|del|de la)\s[a-záéíóúñ]+){0,2})/i;

const RE_EJECUCION = /\b(cumpli|realiza|hech[oa]s?\b|entregad|capacitaci|reuni[oó]n|visitas?\b|llamadas?\b|publicad|enviad|revisad|actualizad|completad|implementad|documentad|tareas?\b|checklist)/i;

/**
 * Lo que la IA propone se completa de forma determinista y rotulada como propuesta: definición y
 * fórmula salen de sus propias palabras; la fuente se SUGIERE solo si la frase nombra de dónde sale
 * el dato (si no, queda vacía y la completitud lo dirá); el tipo se infiere por el vocabulario y el
 * consultor lo corrige. Nunca se rellena valor actual ni punto de partida: esos se registran con dato.
 */
export function propuestaDesdeMedidor(i: IndicadorMedidor): { definicion: string; formula: string; fuente: string | null; tipo_indicador: TipoIndicador } {
  const definicion = i.origen_texto?.trim() ? `${i.nombre.trim()}. Avisa si vuelve lo que la empresa contó: ${i.origen_texto.trim()}` : i.nombre.trim();
  const unidad = (UNIDADES as readonly string[]).includes(i.unidad) ? UNIDAD_TEXTO[i.unidad as Unidad] : i.unidad;
  const formula = `Propuesta: ${i.como_se_mide.trim().replace(/\.$/, "")}. Resultado en ${unidad}.`;
  const m = RE_FUENTE.exec(i.como_se_mide);
  const fuente = m ? `Sugerida, por confirmar: ${m[1]!.trim()}` : null;
  const tipo_indicador: TipoIndicador = RE_EJECUCION.test(`${i.clave} ${i.nombre} ${i.como_se_mide}`) ? "ejecucion" : "resultado";
  return { definicion, formula, fuente, tipo_indicador };
}
