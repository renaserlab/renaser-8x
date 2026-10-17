/**
 * EL PAQUETE DE HECHOS DE UNA EMPRESA (spec-estrategia-8x.md §3).
 *
 * Antes de que ningún modelo piense una estrategia, el código separa lo que se sabe de lo que se cree. Cada fila de la
 * empresa entra en UNA clase, por una sola tabla de reglas (§3.2), y se dice de dónde salió:
 *  - `hecho`: contado, visto o con registro (un documento, un dato operativo, lo que vio la consultora, lo que el
 *    dueño tiene anotado o contó). Lo leído de un documento sin revisar es hecho `provisional`.
 *  - `estimado`: una cifra que el dueño dio de memoria o a ojo.
 *  - `percepcion`: una opinión o descripción de una sola voz, sin registro detrás.
 *  - `sin_dato`: se preguntó y no se sabe, o nadie lo preguntó todavía. Nunca es cero.
 * Y aparte, lo que no es un hecho: las conclusiones del diagnóstico (revisadas o hipótesis), los deseos del dueño, lo
 * contradicho y el contexto (calendario comercial y referencia del rubro, que nunca es evidencia de la empresa).
 *
 * El texto de cada hecho lo escribe el código desde la fila, nunca la IA. Los ids son estables (§3.4): salen de
 * claves y de los primeros caracteres del uuid, no de la hora, para poder comparar versiones y rehacer números.
 *
 * Toda clave del catálogo (supuestos.ts) que es «cuánto es algo hoy» y no tiene dato queda en `sin_dato` con su id
 * `X:<clave>`: así la IA puede nombrarla sin inventarle un valor, y su pregunta sale sola.
 *
 * Nada se recorta en silencio: lo que no entra (por tope de lectura, por tamaño del texto o porque no es un dato) queda
 * en `recortes` con su conteo y su criterio.
 *
 * Puro salvo la huella (sha256 de Node): sin base, sin red, sin IA. La lectura vive en paquete-datos.ts (servidor).
 */
import { createHash } from "crypto";
import { canonico } from "../jobs/queue";
import { estadoDatoDesdeMetrica, rangoDe, textoRango, esExacto, type DatoOral, type EstadoDato, type Rango } from "../dato-oral";
import { normalizarMetrica, periodoEnPalabras, VITAL_POR_CLAVE, RECONOCIDA_POR_CLAVE, PERIODO_DORADA, type Metrica } from "../metricas";
import { MESES } from "../temporadas";
import { moneda as enMoneda, numero as enNumero, esMonedaValida, porDefecto, type ConfigEmpresa } from "../formato";
import { modelosDe, MODELO, type ModeloNegocio } from "../negocio";
import { esTipoTrabajo, type TipoTrabajo } from "../ruta";
import { productoRentable, type CostoMes, type FichaNegocio, type OperacionMoneda } from "../rentabilidad";
import type { LineaProducto } from "../producto";
import {
  etiquetaDe, esPropuestaSinRevisar, formatoDeEmpresa, CAMPOS_DIMENSION, DIMENSIONES_DEPENDENCIA,
  type BloqueFicha, type Ficha, type Item,
} from "../ficha-direccion";
import { CLAVES_SUPUESTO } from "./supuestos";
import {
  COMO, QUIEN, QUIEN_DESCONOCIDO, SOBRE_DEPENDENCIA, FALTA_PARA_GENERAR, CRITERIO_RECORTE, CRITERIO_TOPE_LECTURA,
  CRITERIO_CUENTAS_FICHA, CRITERIO_NUMERO_REPETIDO,
} from "./textos";

// ─── Tipos ───────────────────────────────────────────────────────────────────────────────────────

export type ClaseHecho = "hecho" | "estimado" | "percepcion";
/**
 * La unidad de un dato o de una cuenta. «soles» quiere decir la moneda de la empresa (el nombre viene de la
 * especificación). «pct» solo en supuestos de cambio: al dueño nunca se le pregunta en porcentaje. «veces» es un
 * múltiplo (la utilidad por dos); «razon», una proporción sin unidad (la k del multiplicador).
 */
export type Unidad =
  | "soles" | "de_cada_10" | "dias" | "meses" | "unidades_mes" | "veces_mes" | "horas_semana" | "horas_mes" | "personas"
  | "pct" | "veces" | "razon" | "texto";
export type Eslabon = "atraer" | "vender" | "abastecer" | "entregar" | "cobrar" | "cuidar_caja" | "retener" | "gobernar";
export type Pilar = "personas" | "procesos" | "producto" | "marketing" | "transversal";

export type Hecho = {
  id: string;
  clase: ClaseHecho;
  /** Leído de un documento que nadie revisó todavía. */
  provisional?: true;
  /** Una percepción que el dueño confirmó (sigue sin registro detrás). */
  confirmada?: true;
  /** Lo escribe el código desde la fila, nunca la IA. */
  texto: string;
  valor?: Rango | null;
  unidad?: Unidad;
  fecha: string | null;
  fuente: { tabla: string; id: string | null; como: string };
  pilar?: Pilar | null;
  eslabon?: Eslabon | null;
};

export type SinDato = {
  id: string;
  que_falta: string;
  por_que_importa: string;
  /** Una clave de CLAVES_SUPUESTO (supuestos.ts). */
  clave: string;
  /** Se preguntó y la respuesta fue «no lo sé»: no es lo mismo que «nadie lo preguntó». */
  dijo_no_lo_se?: true;
};

export type Conclusion = { id: string; titulo: string; causa: string | null; impacto: "alto" | "medio" | "bajo" | null; revisada: boolean; refs: string[]; pilar: string | null };

export type Paquete = {
  version: 1;
  empresa: {
    sector: string | null;
    /** parseInt de companies.ficha.personas; si no se lee, null. */
    personas: number | null;
    modelo_negocio: ModeloNegocio[];
    tipo_trabajo: TipoTrabajo | null;
    moneda: string;
    zona: string;
    /** AAAA-MM-DD en la zona horaria de la empresa. */
    hoy: string;
  };
  hechos: Hecho[];
  conclusiones: Conclusion[];
  deseos: { id: string; texto: string; fuente: string }[];
  contradicciones: { id: string; texto: string; versus: string | null }[];
  sin_dato: SinDato[];
  contexto: { calendario: { id: string; mes: string; nota: string }[]; referencia: { id: string; texto: string }[] };
  /** Para los responsables reales de cada jugada. Sin clientes ni consultoras. */
  personas: { id: string; nombre: string; puesto: string | null }[];
  /** Lo que vende, por su id corto (`L:<8>`): para que una jugada nombre una línea y la pantalla diga su nombre. */
  lineas: { id: string; nombre: string; modelo: ModeloNegocio | null }[];
  recortes: { grupo: string; incluidos: number; total: number; criterio: string }[];
  lecturas_fallidas: { tabla: string; motivo: string }[];
  conteo: Record<ClaseHecho | "sin_dato" | "hipotesis" | "deseo", number>;
};

/** La clase de una cifra que se pinta: la más débil de sus insumos. */
export type ClaseRef = "hecho" | "estimado" | "supuesto" | "sin_dato";

/**
 * Lo que vale un id (del paquete, de los cálculos, de un supuesto o de una proyección) para pintarlo y validarlo.
 * `texto` ya viene formateado con la moneda de la empresa. Con `valor` null y `motivo_nulo`, es «sin dato» y se pinta
 * rayado; con `valor` null, unidad «texto» y sin motivo, es una descripción (un hecho en palabras, un conteo).
 */
export type RefValor = {
  valor: Rango | null;
  unidad: Unidad;
  texto: string;
  clase: ClaseRef;
  formula: string;
  /** Qué es, en palabras de consultora («Venta del mes», «Precio +1 %»). Nunca un id. */
  nombre: string;
  motivo_nulo?: string;
  provisional?: true;
};

// ─── Lo que entra ────────────────────────────────────────────────────────────────────────────────

export type EmpresaEntrada = {
  sector: string | null;
  /** companies.ficha (de ahí sale `personas`). */
  ficha: Record<string, unknown> | null;
  modelo_negocio: unknown;
  tipo_trabajo: unknown;
  pais?: string | null;
  moneda?: string | null;
  zona_horaria?: string | null;
};
export type MetricaEntrada = Metrica & { id?: string | null; updated_at?: string | null };
export type AfirmacionEntrada = {
  id: string;
  texto: string;
  pilar: string | null;
  tipo: string | null;
  temporalidad: string | null;
  estado: string | null;
  comprobacion?: string | null;
  fecha_afirmacion?: string | null;
  created_at?: string | null;
  contradice_a?: string | null;
  explicacion_contradiccion?: string | null;
  fuente: { tipo: string | null; origen: string | null; revision?: string | null; fidelidad_extraccion?: string | null; fecha_origen?: string | null } | null;
  persona: { rol: string | null; puesto: string | null } | null;
};
export type HallazgoEntrada = {
  id: string;
  titulo: string;
  causa_raiz: string | null;
  impacto: string | null;
  pilar: string | null;
  estado_revision: string | null;
  /** null = anterior a la columna: no es provisional (la misma regla que SIN_PROVISIONALES de db/queries.ts). */
  provisional: boolean | null;
  origen?: string | null;
  created_at?: string | null;
  claim_ids: string[];
};
export type ProcesoEntrada = { id: string; nombre: string; area?: string | null; confirmacion?: string | null };
export type ParticipanteEntrada = { id: string; nombre: string; puesto: string | null; rol: string | null };
/** Una respuesta del dueño a una pregunta de estrategia (estrategia_preguntas respondida). */
export type RespuestaEntrada = { id: string; clave: string; texto: string; unidad: Unidad; respuesta: DatoOral | null; respuesta_texto: string | null; respondida_at: string | null };

/**
 * Las filas tipadas que devuelve leerEntradasPaquete (paquete-datos.ts). Los hallazgos llegan YA pasados por
 * `soloConclusionesDeHoy` (db/queries.ts): el candado del área se lee con los hechos de hoy, en la base. Una tabla que
 * no se pudo leer sin ser crítica llega vacía y nombrada en `lecturas_fallidas`.
 */
export type EntradasPaquete = {
  empresa: EmpresaEntrada;
  metricas: MetricaEntrada[];
  lineas: LineaProducto[];
  costos: CostoMes[];
  ficha_negocio: FichaNegocio;
  operaciones: OperacionMoneda[];
  claims: AfirmacionEntrada[];
  findings: HallazgoEntrada[];
  /** La ficha de dirección vigente: la acordada y, si no hay, el borrador. */
  ficha_direccion: Ficha | null;
  procesos: ProcesoEntrada[];
  participantes: ParticipanteEntrada[];
  respuestas: RespuestaEntrada[];
  /** El modelo de alto rendimiento del rubro, en frases con su clave: contexto, nunca dato de la empresa. */
  referencia: { clave: string; texto: string }[];
  /** Lo que la consultora anotó que cuesta por hora reemplazar al dueño (un dato suyo, no una suposición). */
  costo_reemplazo_hora?: DatoOral | null;
  /** Cuántas filas hay en total, cuando la lectura tiene tope: para decir cuántas no entraron. */
  totales?: Partial<Record<"claims" | "findings" | "procesos", number>>;
  lecturas_fallidas: { tabla: string; motivo: string }[];
};

// ─── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

/** El tope del texto del paquete: unos 12.000 tokens (§3.5). */
export const TOPE_PAQUETE = 48_000;

/** La configuración de formato de la empresa. Una moneda que no se puede escribir no tumba el paquete: rige la de Perú. */
export function configDeEmpresa(e: EmpresaEntrada): ConfigEmpresa {
  const cfg = formatoDeEmpresa({ pais: e.pais ?? null, moneda: e.moneda ?? null, zona_horaria: e.zona_horaria ?? null, idioma: "es" });
  return esMonedaValida(cfg.moneda) ? cfg : { ...cfg, moneda: porDefecto.moneda };
}

/** El día de hoy (AAAA-MM-DD) en la zona horaria de la empresa. */
export function hoyEnZona(hoy: Date, zona: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(hoy);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: porDefecto.zona_horaria, year: "numeric", month: "2-digit", day: "2-digit" }).format(hoy);
  }
}

/** Un monto de la moneda de la empresa, entero desde cien y con céntimos por debajo. */
export function plata(cfg: ConfigEmpresa): (n: number) => string {
  return (n: number) => enMoneda(n, cfg, { decimales: Math.abs(n) >= 100 || Number.isInteger(n) ? 0 : 2 });
}

const SUFIJO: Partial<Record<Unidad, [string, string]>> = {
  de_cada_10: [" de cada 10", " de cada 10"],
  dias: [" día", " días"],
  meses: [" mes", " meses"],
  unidades_mes: [" al mes", " al mes"],
  veces_mes: [" vez al mes", " veces al mes"],
  horas_semana: [" hora a la semana", " horas a la semana"],
  horas_mes: [" hora al mes", " horas al mes"],
  pct: [" %", " %"],
};

/**
 * Cómo se escribe un valor según su unidad, con los separadores de la empresa: «S/ 4,000», «entre 10 y 12 días»,
 * «×1.5». La unidad va una sola vez al final del rango. Sin valor, «sin dato» (nunca cero).
 */
export function textoDeValor(r: Rango | null, unidad: Unidad, cfg: ConfigEmpresa, opciones: { redondear?: boolean } = {}): string {
  if (!r) return "sin dato";
  // Las cuentas con décimos dejan restos de coma flotante: se limpian antes de escribir.
  const limpio = (x: number) => Math.round(x * 1e6) / 1e6;
  // SIN PRECISIÓN FALSA (revisión del 17-10): «S/ 9,179» o «×1.66» sobre cifras que salen de estimados dicen más de lo
  // que se sabe. Redondeado, un monto va a dos cifras significativas (desde cien) y las veces, a un decimal.
  const dos = (x: number) => (Math.abs(x) >= 100 ? Number(x.toPrecision(2)) : x);
  const b = opciones.redondear && unidad === "soles" ? dos(limpio(r.bajo)) : limpio(r.bajo);
  const a = opciones.redondear && unidad === "soles" ? dos(limpio(r.alto)) : limpio(r.alto);
  if (opciones.redondear && unidad === "veces") return textoRango({ bajo: Math.round(b * 10) / 10, alto: Math.round(a * 10) / 10 }, (x) => `×${enNumero(x, cfg, { decimales: Number.isInteger(x) ? 0 : 1 })}`);
  // Los decimales que hacen falta, hasta `max` (desde cien, ninguno): «5.6», «1.5», nunca «1.50».
  const num = (x: number, max = 1) => {
    const tope = Math.abs(x) >= 100 ? 0 : max;
    const r = Math.round(x * 10 ** tope) / 10 ** tope;
    return enNumero(r, cfg, { decimales: (String(r).split(".")[1] ?? "").length });
  };
  if (unidad === "soles") return textoRango({ bajo: b, alto: a }, plata(cfg));
  if (unidad === "veces") return textoRango({ bajo: b, alto: a }, (x) => `×${num(x, 2)}`);
  const sufijo = SUFIJO[unidad];
  if (!sufijo) return textoRango({ bajo: b, alto: a }, (x) => num(x, 2));
  const nb = num(b);
  const na = num(a);
  if (nb === na) return `${nb}${b === 1 ? sufijo[0] : sufijo[1]}`;
  return `entre ${nb} y ${na}${sufijo[1]}`;
}

/** Lo que el Ref de esquemas.ts admite en un id. */
const LIMPIO = /[^A-Za-z0-9_.:@-]/g;
const limpiar = (s: string) => s.replace(LIMPIO, "_");

/**
 * Ids cortos de una familia (K, F, P, L, G): los primeros 8 caracteres del uuid; los que chocan en la misma empresa se
 * alargan a 12 (y, si aún chocan, al id entero). Estables entre armados: salen del id, no del orden ni de la hora.
 */
export function idsCortos(ids: string[]): Map<string, string> {
  const base = new Map(ids.map((id) => [id, limpiar(id.replace(/-/g, ""))]));
  const largo = (n: number) => {
    const cuenta = new Map<string, number>();
    for (const b of base.values()) cuenta.set(b.slice(0, n), (cuenta.get(b.slice(0, n)) ?? 0) + 1);
    return cuenta;
  };
  const de8 = largo(8);
  const de12 = largo(12);
  const salida = new Map<string, string>();
  for (const [id, b] of base) {
    if ((de8.get(b.slice(0, 8)) ?? 0) <= 1) salida.set(id, b.slice(0, 8));
    else if ((de12.get(b.slice(0, 12)) ?? 0) <= 1) salida.set(id, b.slice(0, 12));
    else salida.set(id, b);
  }
  return salida;
}

/** EstadoDato → clase (§3.2): comprobado o contado es hecho, estimado es estimado, «no lo sé» es sin dato. */
export function claseDeEstadoDato(e: EstadoDato | null | undefined): ClaseHecho | "sin_dato" {
  if (e === "comprobado" || e === "contado") return "hecho";
  if (e === "no_lo_se") return "sin_dato";
  return "estimado";
}
const comoDeEstadoDato = (e: EstadoDato | null | undefined) => (e === "comprobado" ? COMO.dato_comprobado : e === "contado" ? COMO.dato_contado : COMO.dato_estimado);

const fechaCorta = (s: string | null | undefined): string | null => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

const PILARES: readonly Pilar[] = ["personas", "procesos", "producto", "marketing", "transversal"];
const pilarDe = (p: string | null | undefined): Pilar | null => (PILARES as readonly string[]).includes(String(p)) ? (p as Pilar) : null;

const quienDijo = (persona: AfirmacionEntrada["persona"]): string => {
  const quien = (persona?.rol && QUIEN[persona.rol]) || QUIEN_DESCONOCIDO;
  const puesto = persona?.puesto?.trim();
  return puesto && persona?.rol !== "dueno" ? `${quien} (${puesto})` : quien;
};

const ESLABON_VITAL: Record<string, Eslabon> = {
  venta_mes: "vender", ganancia_mes: "cuidar_caja", caja_hoy: "cuidar_caja", gasto_fijo_mes: "cuidar_caja",
  precio_producto_estrella: "vender", costo_producto_estrella: "abastecer", conversion_de_cada_10: "vender",
  deuda_clientes: "cobrar", deuda_propia: "cuidar_caja", costo_variable_mes: "abastecer",
};

const unidadDeVital = (clave: string): Unidad => {
  const u = (VITAL_POR_CLAVE.get(clave) ?? RECONOCIDA_POR_CLAVE.get(clave))?.unidad;
  return u === "soles" || u === "dias" || u === "personas" || u === "de_cada_10" ? u : "texto";
};
/** El nombre de un número dicho a la consultora («La venta del mes»), no al dueño («Ventas del mes» en su voz). */
const nombreDeNumero = (clave: string) => {
  const def = CLAVES_SUPUESTO[clave];
  if (def?.destino === "datos_faltantes") return def.que_falta.charAt(0).toUpperCase() + def.que_falta.slice(1);
  return (VITAL_POR_CLAVE.get(clave) ?? RECONOCIDA_POR_CLAVE.get(clave))?.nombre ?? clave.replace(/_/g, " ");
};

const ES_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Los números que entran: los que tienen un estado que se sabe leer. Sin estado no se sabe de dónde salen. */
export function metricasQueEntran(metricas: MetricaEntrada[]): MetricaEntrada[] {
  return metricas.filter((m) => estadoDatoDesdeMetrica(m.estado ?? null) !== null);
}

// ─── Armar ───────────────────────────────────────────────────────────────────────────────────────

/** Una cuenta de lo que no se incluye, para `recortes`. */
type Recorte = Paquete["recortes"][number];

export function armarPaquete(e: EntradasPaquete, hoy: Date): Paquete {
  const cfg = configDeEmpresa(e.empresa);
  const fmt = plata(cfg);
  const dia = hoyEnZona(hoy, cfg.zona_horaria);
  const modelos = modelosDe(e.empresa.modelo_negocio);

  const hechos: Hecho[] = [];
  const sinDato = new Map<string, SinDato>();
  const deseos: Paquete["deseos"] = [];
  const contradicciones: Paquete["contradicciones"] = [];
  const conclusiones: Conclusion[] = [];
  const recortes: Recorte[] = [];
  const conDato = new Set<string>(); // claves del catálogo que ya tienen un dato

  const faltaClave = (clave: string, id: string, extra: Partial<SinDato> = {}) => {
    const def = CLAVES_SUPUESTO[clave];
    const previo = sinDato.get(id);
    sinDato.set(id, {
      id,
      clave,
      que_falta: extra.que_falta ?? def?.que_falta ?? clave,
      por_que_importa: extra.por_que_importa ?? def?.por_que_importa ?? "",
      ...(extra.dijo_no_lo_se || previo?.dijo_no_lo_se ? { dijo_no_lo_se: true as const } : {}),
    });
  };

  // ── 1 · Los números (company_metricas). La equivalencia de estados es SOLO estadoDatoDesdeMetrica.
  const metricas = metricasQueEntran(e.metricas);
  const sinRotular = e.metricas.length - metricas.length;
  if (sinRotular > 0) recortes.push({ grupo: "números sin estado o descartados", incluidos: 0, total: sinRotular, criterio: "sin un estado que se sepa leer no se sabe de dónde salen: no entran en ninguna cuenta" });
  const porClave = new Map<string, { m: MetricaEntrada; periodo: string }[]>();
  for (const m of metricas) {
    const n = normalizarMetrica(m.clave, m.periodo);
    const lista = porClave.get(n.clave) ?? [];
    lista.push({ m, periodo: n.periodo });
    porClave.set(n.clave, lista);
  }
  for (const [clave, filas] of porClave) {
    // El más reciente (mes AAAA-MM más nuevo; si no hay, «actual») lleva el id corto; la mejor época y los demás, su periodo.
    const conValorOrden = [...filas].filter((f) => f.periodo !== PERIODO_DORADA).sort((a, b) => (ES_MES.test(b.periodo) ? b.periodo : "").localeCompare(ES_MES.test(a.periodo) ? a.periodo : ""));
    const masReciente = conValorOrden.find((f) => f.m.valor != null && Number.isFinite(Number(f.m.valor))) ?? conValorOrden[0] ?? null;
    const vistos = new Set<string>();
    for (const f of filas) {
      const id = f === masReciente ? `N:${clave}` : `N:${clave}@${f.periodo}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      const estado = estadoDatoDesdeMetrica(f.m.estado ?? null);
      const valor = f.m.valor != null && Number.isFinite(Number(f.m.valor)) ? Number(f.m.valor) : null;
      if (estado === "no_lo_se" || valor == null) {
        if (f === masReciente && CLAVES_SUPUESTO[clave]) faltaClave(clave, `X:${clave}`, { dijo_no_lo_se: estado === "no_lo_se" ? true : undefined });
        continue;
      }
      if (f === masReciente) conDato.add(clave);
      const unidad = unidadDeVital(clave);
      const extraido = f.m.estado === "extraido";
      hechos.push({
        id: limpiar(id),
        clase: estado === "estimado" ? "estimado" : "hecho",
        ...(extraido ? { provisional: true as const } : {}),
        texto: `${nombreDeNumero(clave)}${f.periodo === "actual" ? "" : ` (${periodoEnPalabras(f.periodo)})`}: ${textoDeValor({ bajo: valor, alto: valor }, unidad, cfg)}`,
        valor: { bajo: valor, alto: valor },
        unidad,
        fecha: fechaCorta(f.m.updated_at),
        fuente: { tabla: "company_metricas", id: f.m.id ?? null, como: f.m.estado === "verificado" ? COMO.metrica_verificado : extraido ? COMO.metrica_extraido : COMO.metrica_contado },
        eslabon: ESLABON_VITAL[clave] ?? null,
      });
    }
  }

  // ── 2 · Lo que vende (lineas_producto), campo por campo, con lo que calcula rentabilidad.ts.
  const cortosL = idsCortos(e.lineas.map((l) => l.id));
  for (const l of e.lineas) {
    const p = productoRentable(l, e.ficha_negocio, cfg);
    const L = cortosL.get(l.id)!;
    const unidad = l.modelo ? MODELO[l.modelo].unidad : l.tipo === "servicio" ? { singular: "caso", plural: "casos" } : { singular: "unidad", plural: "unidades" };
    const porOrigen = (): { clase: ClaseHecho; como: string; provisional?: true } =>
      l.origen === "conciliado" ? { clase: "hecho", como: COMO.dato_comprobado } : l.origen === "extraido" ? { clase: "hecho", como: COMO.metrica_extraido, provisional: true } : { clase: "estimado", como: COMO.dato_estimado };
    const campos: { campo: "precio" | "costo" | "unidades"; clave: string; valor: Rango | null; estado: EstadoDato | null; unidad: Unidad; texto: string }[] = [
      { campo: "precio", clave: "linea.precio", valor: p.precio_efectivo, estado: p.estados.precio ?? l.estados?.precio ?? null, unidad: "soles", texto: `Precio de «${l.nombre}»` },
      { campo: "costo", clave: "linea.costo", valor: p.costo, estado: p.estados.costo ?? l.estados?.costo ?? null, unidad: "soles", texto: `Lo que cuesta cada ${unidad.singular} de «${l.nombre}»` },
      { campo: "unidades", clave: "linea.unidades_mes", valor: p.unidades_mes, estado: p.estados.unidades ?? l.estados?.unidades ?? null, unidad: "unidades_mes", texto: `Lo que vende de «${l.nombre}» (${unidad.plural})` },
    ];
    for (const c of campos) {
      if (!c.valor || c.estado === "no_lo_se") {
        faltaClave(c.clave, `X:${c.clave}@${L}`, { que_falta: `${CLAVES_SUPUESTO[c.clave]!.que_falta}: «${l.nombre}»`, dijo_no_lo_se: c.estado === "no_lo_se" ? true : undefined });
        continue;
      }
      conDato.add(c.clave);
      const o = c.estado ? { clase: claseDeEstadoDato(c.estado) as ClaseHecho, como: comoDeEstadoDato(c.estado) } : porOrigen();
      const aOjo = !esExacto(c.valor) && o.clase === "hecho" ? { clase: "estimado" as const, como: COMO.dato_estimado } : null;
      hechos.push({
        id: `L:${L}.${c.campo}`,
        clase: aOjo?.clase ?? o.clase,
        ...("provisional" in o && o.provisional ? { provisional: true as const } : {}),
        texto: `${c.texto}: ${textoDeValor(c.valor, c.unidad, cfg)}`,
        valor: c.valor,
        unidad: c.unidad,
        fecha: fechaCorta(l.updated_at),
        fuente: { tabla: "lineas_producto", id: l.id, como: aOjo?.como ?? o.como },
        pilar: "producto",
        eslabon: c.campo === "costo" ? "abastecer" : "vender",
      });
    }
  }

  // ── 3 · Los gastos del mes (costos_mes).
  const cortosG = idsCortos(e.costos.map((c) => c.id));
  for (const c of e.costos) {
    const G = cortosG.get(c.id)!;
    const r = rangoDe(c.dato);
    const tipo = c.tipo === "comercializacion" ? "Gasto de vender" : "Gasto fijo";
    const periodo = c.periodo === "mes_tipico" ? "" : ` (${periodoEnPalabras(c.periodo)})`;
    if (!r || c.dato.estado === "no_lo_se") {
      faltaClave("gastos_mes", `X:gastos_mes@${G}`, { que_falta: `el monto del gasto «${c.nombre}»`, dijo_no_lo_se: c.dato.estado === "no_lo_se" ? true : undefined });
      continue;
    }
    conDato.add("gastos_mes");
    const clase = claseDeEstadoDato(c.dato.estado) as ClaseHecho;
    hechos.push({
      id: `G:${G}`,
      clase: !esExacto(r) && clase === "hecho" ? "estimado" : clase,
      texto: `${tipo} «${c.nombre}»${periodo}: ${textoRango(r, fmt)} al mes`,
      valor: r,
      unidad: "soles",
      fecha: null,
      fuente: { tabla: "costos_mes", id: c.id, como: comoDeEstadoDato(c.dato.estado) },
      eslabon: "cuidar_caja",
    });
  }
  if (conDato.has("gasto_fijo_mes")) conDato.add("gastos_mes");

  // ── 4 · La ficha del negocio: crédito, inventario, moneda, totales e historia.
  const fn = e.ficha_negocio;
  const datoFicha = (id: string, clave: string | null, dato: Partial<DatoOral> | null | undefined, unidad: Unidad, texto: string, eslabon: Eslabon | null) => {
    if (!dato) {
      if (clave) faltaClave(clave, `X:${clave}`);
      return;
    }
    const r = rangoDe(dato);
    if (!r || dato.estado === "no_lo_se") {
      if (clave) faltaClave(clave, `X:${clave}`, { dijo_no_lo_se: dato.estado === "no_lo_se" ? true : undefined });
      return;
    }
    if (clave) conDato.add(clave);
    const clase = claseDeEstadoDato(dato.estado) as ClaseHecho;
    hechos.push({
      id,
      clase: !esExacto(r) && clase === "hecho" ? "estimado" : clase,
      texto: `${texto}: ${textoDeValor(r, unidad, cfg)}`,
      valor: r,
      unidad,
      fecha: null,
      fuente: { tabla: "ficha_negocio", id: null, como: comoDeEstadoDato(dato.estado) },
      eslabon,
    });
  };
  const fraseDelDueno = (id: string, texto: string | null | undefined, rotulo: string, eslabon: Eslabon | null) => {
    const t = texto?.trim();
    if (!t) return;
    hechos.push({ id, clase: "percepcion", texto: `${rotulo}: ${t}`, fecha: null, fuente: { tabla: "ficha_negocio", id: null, como: `lo dijo ${QUIEN.dueno}` }, eslabon });
  };
  if (fn.modulos.credito === false) {
    hechos.push({ id: "B:credito.no_vende", clase: "percepcion", texto: "No vende al crédito ni fía", fecha: null, fuente: { tabla: "ficha_negocio", id: null, como: `lo dijo ${QUIEN.dueno}` }, eslabon: "cobrar" });
  } else {
    datoFicha("B:credito.de_cada_10", "credito.de_cada_10", fn.credito.de_cada_10, "de_cada_10", "Ventas al crédito o fiadas", "cobrar");
    datoFicha("B:credito.dias", "credito.dias", fn.credito.dias, "dias", "Días que tardan en pagar las ventas al crédito", "cobrar");
    datoFicha("B:credito.incobrables_de_cada_10", "credito.incobrables_de_cada_10", fn.credito.incobrables_de_cada_10, "de_cada_10", "De los que deben, los que nunca pagan", "cobrar");
  }
  if (fn.modulos.inventario === false) {
    hechos.push({ id: "B:inventario.no_guarda", clase: "percepcion", texto: "No guarda mercadería ni materiales", fecha: null, fuente: { tabla: "ficha_negocio", id: null, como: `lo dijo ${QUIEN.dueno}` }, eslabon: "abastecer" });
  } else {
    datoFicha("B:inventario.valor", "inventario.valor", fn.inventario.valor, "soles", "Dinero en mercadería guardada", "abastecer");
    datoFicha("B:inventario.meses", "inventario.meses", fn.inventario.meses, "meses", "Meses de venta que alcanza lo guardado", "abastecer");
    datoFicha("B:inventario.parado", "inventario.parado", fn.inventario.parado, "soles", "Dinero en mercadería que no se mueve", "cuidar_caja");
  }
  if (fn.modulos.moneda === true || e.operaciones.length) {
    datoFicha("B:moneda.dias_cobro", null, fn.moneda.dias_cobro, "dias", "Días que tarda en cobrar una venta en otra moneda", "cobrar");
    datoFicha("B:moneda.operaciones_mes", null, fn.moneda.operaciones_mes, "unidades_mes", "Ventas cobradas en otra moneda en un mes", "cobrar");
    datoFicha("B:moneda.monto_tipico", null, fn.moneda.monto_tipico, "texto", "Monto de la última venta en otra moneda (en su moneda)", "cobrar");
    if (e.operaciones.length) {
      const estados = e.operaciones.map((o) => o.estado);
      const clase: ClaseHecho = estados.every((s) => s === "comprobado" || s === "contado") ? "hecho" : "estimado";
      hechos.push({
        id: "B:moneda.operaciones",
        clase,
        texto: `${e.operaciones.length} ${e.operaciones.length === 1 ? "venta cobrada" : "ventas cobradas"} en otra moneda, anotadas una por una`,
        valor: { bajo: e.operaciones.length, alto: e.operaciones.length },
        unidad: "texto",
        fecha: null,
        fuente: { tabla: "operaciones_moneda", id: null, como: COMO.operaciones_moneda },
        eslabon: "cobrar",
      });
    }
  }
  for (const [grupo, dato] of Object.entries(fn.totales.grupos ?? {})) {
    if (!dato) continue;
    const nombre = grupo.trim() ? `del grupo «${grupo.trim()}»` : "de toda la empresa";
    // El nombre del grupo lo escribe el dueño: se corta para que el id quepa en lo que el modelo puede citar (esquemas.ts, Ref).
    datoFicha(`B:totales.grupo.${limpiar(grupo.trim().toLowerCase()).slice(0, 40) || "empresa"}`, null, dato, "unidades_mes", `Lo que vende en total al mes ${nombre}`, "vender");
  }
  datoFicha("B:totales.dias_al_mes", null, fn.totales.dias_al_mes, "texto", "Días que abre al mes", "entregar");
  datoFicha("B:historia.venta_inicial", null, fn.historia.venta_inicial, "soles", "Venta al mes en el primer año", "vender");
  datoFicha("B:historia.mejor_epoca", null, fn.historia.mejor_epoca?.venta_mes, "soles", "Venta al mes en su mejor época", "vender");
  fraseDelDueno("B:historia.que_pasaba", fn.historia.mejor_epoca?.que_pasaba, "Qué pasaba en su mejor época", "vender");
  fraseDelDueno("B:historia.que_cambio", fn.historia.bajada?.que_cambio, "Qué cambió cuando bajó la venta", "vender");
  fraseDelDueno("B:historia.hoy_distinto", fn.historia.hoy_distinto?.texto, "Qué es distinto hoy", null);

  // ── 5 · Las afirmaciones (claims), por la tabla del §3.2, en orden: gana la primera que se cumple.
  const cortosK = idsCortos(e.claims.map((c) => c.id));
  const idK = (id: string) => `K:${cortosK.get(id)}`;
  const textoDeClaim = new Map(e.claims.map((c) => [c.id, c.texto]));
  for (const c of e.claims) {
    const id = idK(c.id);
    const quien = quienDijo(c.persona);
    const fecha = fechaCorta(c.fecha_afirmacion) ?? fechaCorta(c.fuente?.fecha_origen) ?? fechaCorta(c.created_at);
    const base = { id, texto: c.texto.trim(), fecha, pilar: pilarDe(c.pilar) };
    const tipoFuente = c.fuente?.tipo ?? null;
    const esCifra = c.tipo === "kpi" || c.tipo === "precio";
    if (c.estado === "contradicho" || c.estado === "caducado" || c.comprobacion === "refutado") {
      const otro = c.contradice_a ? textoDeClaim.get(c.contradice_a) ?? null : null;
      contradicciones.push({ id, texto: base.texto, versus: otro ?? c.explicacion_contradiccion?.trim() ?? null });
    } else if (c.temporalidad === "aspiracional") {
      deseos.push({ id, texto: base.texto, fuente: `lo dijo ${quien}` });
    } else if (c.comprobacion === "comprobado_con_dato" || c.comprobacion === "comprobado_por_consultor") {
      hechos.push({ ...base, clase: "hecho", fuente: { tabla: "claims", id: c.id, como: COMO.claim_comprobado } });
    } else if (tipoFuente === "dato") {
      hechos.push({ ...base, clase: "hecho", fuente: { tabla: "claims", id: c.id, como: COMO.claim_registro } });
    } else if (tipoFuente === "observacion" && c.fuente?.origen === "consultor") {
      hechos.push({ ...base, clase: "hecho", fuente: { tabla: "claims", id: c.id, como: COMO.claim_vio_consultora } });
    } else if (tipoFuente === "documento" || tipoFuente === "foto") {
      const provisional = c.fuente?.revision === "pendiente" || c.fuente?.fidelidad_extraccion === "baja";
      const deCuando = fechaCorta(c.fuente?.fecha_origen);
      hechos.push({ ...base, clase: "hecho", ...(provisional ? { provisional: true as const } : {}), fuente: { tabla: "claims", id: c.id, como: deCuando ? `${COMO.claim_documento}, del ${deCuando}` : COMO.claim_documento } });
    } else if ((tipoFuente === "entrevista" || tipoFuente === "audio") && esCifra) {
      hechos.push({ ...base, clase: "estimado", fuente: { tabla: "claims", id: c.id, como: `lo dijo ${quien} en la entrevista` } });
    } else if (c.estado === "confirmado") {
      const confirmo = c.persona?.rol === "dueno" ? `lo dijo ${quien} y lo confirmó` : `lo dijo ${quien} y lo confirmó ${QUIEN.dueno}`;
      hechos.push({ ...base, clase: esCifra ? "estimado" : "percepcion", ...(esCifra ? {} : { confirmada: true as const }), fuente: { tabla: "claims", id: c.id, como: confirmo } });
    } else {
      hechos.push({ ...base, clase: "percepcion", fuente: { tabla: "claims", id: c.id, como: `lo dijo ${quien}` } });
    }
  }
  if (e.totales?.claims != null && e.totales.claims > e.claims.length) recortes.push({ grupo: "afirmaciones", incluidos: e.claims.length, total: e.totales.claims, criterio: CRITERIO_TOPE_LECTURA });

  // ── 6 · Los hallazgos (findings). Lo provisional y lo rechazado nunca entran.
  const cortosF = idsCortos(e.findings.map((f) => f.id));
  for (const f of e.findings) {
    if (f.provisional === true) continue;
    const revisada = f.estado_revision === "aprobado" || f.estado_revision === "corregido";
    if (!revisada && f.estado_revision !== "pendiente") continue;
    const impacto = f.impacto === "alto" || f.impacto === "medio" || f.impacto === "bajo" ? f.impacto : null;
    conclusiones.push({
      id: `F:${cortosF.get(f.id)}`,
      titulo: f.titulo.trim(),
      causa: f.causa_raiz?.trim() || null,
      impacto,
      revisada,
      refs: f.claim_ids.filter((c) => cortosK.has(c)).map(idK).sort(),
      pilar: f.pilar ?? null,
    });
  }
  if (e.totales?.findings != null && e.totales.findings > e.findings.length) recortes.push({ grupo: "hallazgos", incluidos: e.findings.length, total: e.totales.findings, criterio: CRITERIO_TOPE_LECTURA });

  // ── 7 · La ficha de dirección vigente. Lo que el asistente propuso y nadie revisó no entra.
  const fd = e.ficha_direccion;
  let cuentasFicha = 0;
  let numerosRepetidos = 0;
  if (fd) {
    const DESEO: readonly BloqueFicha[] = ["proposito", "empresa_deseada", "resultados_deseados", "rol_futuro", "tiempo", "limites"];
    const deItem = (bloque: string, i: Item) => {
      if (i.descartado || esPropuestaSinRevisar(i) || i.aviso || i.interno) return;
      const id = limpiar(`D:${i.id}`);
      const texto = (i.texto ?? "").trim();
      if (!texto) return;
      // Una cuenta de la ficha la rehace 8X con sus fuentes; un número de hoy que sale de los nueve ya está arriba.
      if (i.calculo) {
        cuentasFicha++;
        return;
      }
      if (i.momento === "deseado") {
        deseos.push({ id, texto, fuente: etiquetaDe(i) });
        return;
      }
      if (i.momento === "hoy") {
        if ((i.fuentes ?? []).some((f) => f.startsWith("metrica:"))) {
          numerosRepetidos++;
          return;
        }
        hechos.push({ id, clase: "estimado", texto, fecha: fechaCorta(i.fecha), fuente: { tabla: "ficha_direccion", id: i.id, como: COMO.consultora_anoto } });
        return;
      }
      // Bloques de deseo → deseo; los de percepción (fortalezas, clientes, distancia, decisiones) y lo que el dueño dijo
      // sobre su dependencia → percepción, con la etiqueta de la ficha (distingue documento, consultora y cálculo).
      if ((DESEO as readonly string[]).includes(bloque)) deseos.push({ id, texto, fuente: etiquetaDe(i) });
      else hechos.push({ id, clase: "percepcion", texto, fecha: fechaCorta(i.fecha), fuente: { tabla: "ficha_direccion", id: i.id, como: etiquetaDe(i) } });
    };
    for (const [bloque, items] of Object.entries(fd.bloques ?? {})) for (const i of items ?? []) deItem(bloque, i);
    for (const i of fd.dependencia?.declaraciones ?? []) deItem("dependencia", i);
    for (const dim of DIMENSIONES_DEPENDENCIA) {
      const d = fd.dependencia?.dimensiones?.[dim];
      if (!d) continue;
      if (d.origen === "director" && !d.revisado_por) continue;
      for (const campo of CAMPOS_DIMENSION) {
        const t = d[campo]?.trim();
        if (!t) continue;
        const quien = d.origen === "consultor" ? COMO.consultora_anoto : `lo dijo ${QUIEN.dueno}`;
        hechos.push({ id: `D:dependencia.${dim}.${campo}`, clase: "percepcion", texto: t, fecha: null, fuente: { tabla: "ficha_direccion", id: null, como: `${quien} ${SOBRE_DEPENDENCIA[campo]}` }, eslabon: "gobernar" });
      }
    }
  }
  if (cuentasFicha) recortes.push({ grupo: "cuentas de la ficha de dirección", incluidos: 0, total: cuentasFicha, criterio: CRITERIO_CUENTAS_FICHA });
  if (numerosRepetidos) recortes.push({ grupo: "números de hoy de la ficha de dirección", incluidos: 0, total: numerosRepetidos, criterio: CRITERIO_NUMERO_REPETIDO });

  // ── 8 · Los procesos dibujados.
  const cortosP = idsCortos(e.procesos.map((p) => p.id));
  for (const p of e.procesos) {
    const confirmado = p.confirmacion === "confirmado";
    hechos.push({
      id: `P:${cortosP.get(p.id)}`,
      clase: confirmado ? "hecho" : "percepcion",
      texto: `Proceso «${p.nombre.trim()}»${p.area?.trim() ? ` (área: ${p.area.trim()})` : ""}`,
      fecha: null,
      fuente: { tabla: "processes", id: p.id, como: confirmado ? "proceso confirmado" : "proceso dibujado, sin confirmar" },
      pilar: "procesos",
    });
  }
  if (e.totales?.procesos != null && e.totales.procesos > e.procesos.length) recortes.push({ grupo: "procesos", incluidos: e.procesos.length, total: e.totales.procesos, criterio: CRITERIO_TOPE_LECTURA });

  // ── 9 · Lo que el dueño respondió a las preguntas de la estrategia. Una respuesta por clave: la última (si la misma
  //    clave tiene dos, salían dos «Q:» iguales en un orden que cambiaba, y con él la huella).
  const ultimas = new Map<string, RespuestaEntrada>();
  for (const r of [...e.respuestas].sort((a, b) => String(b.respondida_at ?? "").localeCompare(String(a.respondida_at ?? "")) || String(a.id).localeCompare(String(b.id)))) {
    if (!ultimas.has(r.clave)) ultimas.set(r.clave, r);
  }
  for (const r of [...ultimas.values()].sort((a, b) => a.clave.localeCompare(b.clave))) {
    const id = limpiar(`Q:${r.clave}`);
    const fecha = fechaCorta(r.respondida_at);
    const como = fecha ? `${COMO.respondio_el_dueno} el ${fecha}` : COMO.respondio_el_dueno;
    const valor = r.respuesta ? rangoDe(r.respuesta) : null;
    if (r.respuesta && r.respuesta.estado === "no_lo_se") {
      faltaClave(r.clave, `X:${r.clave}`, { dijo_no_lo_se: true });
      continue;
    }
    if (valor) {
      const clase = claseDeEstadoDato(r.respuesta!.estado) as ClaseHecho;
      conDato.add(r.clave);
      hechos.push({ id, clase: !esExacto(valor) && clase === "hecho" ? "estimado" : clase, texto: `${r.texto.trim()} → ${textoDeValor(valor, r.unidad, cfg)}`, valor, unidad: r.unidad, fecha, fuente: { tabla: "estrategia_preguntas", id: r.id, como } });
    } else if (r.respuesta_texto?.trim()) {
      conDato.add(r.clave);
      hechos.push({ id, clase: "percepcion", texto: `${r.texto.trim()} → ${r.respuesta_texto.trim()}`, fecha, fuente: { tabla: "estrategia_preguntas", id: r.id, como } });
    }
  }

  // ── 10 · Lo que nadie respondió todavía: toda clave «cuánto es hoy» del catálogo sin dato.
  for (const def of Object.values(CLAVES_SUPUESTO)) {
    if (def.tipo !== "estado_actual" || def.clave === "otra" || conDato.has(def.clave)) continue;
    if (def.clave.startsWith("linea.") && e.lineas.length) continue; // ya se nombró línea por línea
    if (def.clave.startsWith("credito.") && fn.modulos.credito === false) continue;
    if (def.clave.startsWith("inventario.") && fn.modulos.inventario === false) continue;
    if (def.clave === "gastos_mes" && [...sinDato.keys()].some((k) => k.startsWith("X:gastos_mes@"))) continue;
    if (!sinDato.has(`X:${def.clave}`)) faltaClave(def.clave, `X:${def.clave}`);
  }

  // ── 11 · El contexto: los tres meses que siguen (calendario) y la referencia del rubro.
  const [anio, mes] = dia.split("-").map(Number) as [number, number];
  const calendario = [1, 2, 3].map((k) => {
    const m0 = (mes - 1 + k) % 12;
    const a = anio + Math.floor((mes - 1 + k) / 12);
    const def = MESES[m0]!;
    return { id: `T:${a}-${def.clave}`, mes: `${def.nombre} ${a}`, nota: def.nota };
  });
  const referencia = e.referencia.filter((r) => r.texto?.trim()).map((r) => ({ id: limpiar(`Z:${r.clave}`), texto: r.texto.trim() }));

  // ── Personas reales para los responsables.
  const personas = e.participantes
    .filter((p) => p.rol !== "cliente" && p.rol !== "consultor" && p.nombre?.trim())
    .map((p) => ({ id: p.id, nombre: p.nombre.trim(), puesto: p.puesto?.trim() || null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id));

  const porId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  const hechosOrdenados = porId(hechos);
  const conclusionesOrdenadas = porId(conclusiones);
  const sinDatoOrdenado = porId([...sinDato.values()]);
  const personasFicha = Number.parseInt(String(e.empresa.ficha?.personas ?? ""), 10);

  return {
    version: 1,
    empresa: {
      sector: e.empresa.sector?.trim() || null,
      personas: Number.isFinite(personasFicha) && personasFicha > 0 ? personasFicha : null,
      modelo_negocio: modelos,
      tipo_trabajo: esTipoTrabajo(e.empresa.tipo_trabajo) ? e.empresa.tipo_trabajo : null,
      moneda: cfg.moneda,
      zona: cfg.zona_horaria,
      hoy: dia,
    },
    hechos: hechosOrdenados,
    conclusiones: conclusionesOrdenadas,
    deseos: porId(deseos),
    contradicciones: porId(contradicciones),
    sin_dato: sinDatoOrdenado,
    contexto: { calendario, referencia: porId(referencia) },
    personas,
    lineas: porId(e.lineas.map((l) => ({ id: `L:${cortosL.get(l.id)}`, nombre: l.nombre.trim(), modelo: l.modelo ?? null }))),
    recortes,
    lecturas_fallidas: [...e.lecturas_fallidas],
    conteo: {
      hecho: hechosOrdenados.filter((h) => h.clase === "hecho").length,
      estimado: hechosOrdenados.filter((h) => h.clase === "estimado").length,
      percepcion: hechosOrdenados.filter((h) => h.clase === "percepcion").length,
      sin_dato: sinDatoOrdenado.length,
      hipotesis: conclusionesOrdenadas.filter((c) => !c.revisada).length,
      deseo: deseos.length,
    },
  };
}

// ─── La huella y el mínimo ───────────────────────────────────────────────────────────────────────

/**
 * La huella del paquete: sha256 de su forma canónica, sin lo que cambia con el día aunque la empresa no cambie (`hoy`,
 * el calendario) ni lo que depende de cómo se leyó (recortes, lecturas fallidas). Mismas filas, misma huella.
 */
export function huellaPaquete(p: Paquete): string {
  const estable = {
    ...p,
    empresa: { ...p.empresa, hoy: undefined },
    contexto: { ...p.contexto, calendario: undefined },
    recortes: undefined,
    lecturas_fallidas: undefined,
  };
  return createHash("sha256").update(canonico(estable), "utf8").digest("hex");
}

/** Qué falta para poder generar (§3.6), en palabras de consultora. Vacío = se puede generar. */
export function minimoParaEstrategia(p: Paquete): string[] {
  const conValor = (id: string) => p.hechos.some((h) => h.id === id && h.valor != null);
  const faltan: string[] = [];
  if (!conValor("N:venta_mes")) faltan.push(FALTA_PARA_GENERAR.venta);
  const hayGastos = conValor("N:gasto_fijo_mes") || conValor("N:ganancia_mes") || p.hechos.some((h) => h.id.startsWith("G:") && h.valor != null);
  if (!hayGastos) faltan.push(FALTA_PARA_GENERAR.gastos);
  if (!p.conclusiones.length && p.hechos.length < 15) faltan.push(FALTA_PARA_GENERAR.diagnostico);
  return faltan;
}

// ─── Lo que vale cada id del paquete ─────────────────────────────────────────────────────────────

const CLASE_REF: Record<ClaseHecho, ClaseRef> = { hecho: "hecho", estimado: "estimado", percepcion: "estimado" };

/** Qué es un hecho, como sustantivo y sin ids: el nombre del catálogo para los números y las respuestas; si no, su rótulo. */
function nombreDeRef(h: Hecho): string {
  const clave = h.id.replace(/^[NQ]:/, "").replace(/@.*$/, "");
  if ((h.id.startsWith("N:") || h.id.startsWith("Q:")) && CLAVES_SUPUESTO[clave]) {
    const periodo = /@(.+)$/.exec(h.id)?.[1];
    return `${CLAVES_SUPUESTO[clave]!.nombre}${periodo ? ` (${periodoEnPalabras(periodo)})` : ""}`;
  }
  return h.texto.split(":")[0]!.trim();
}

/**
 * Cada id del paquete con lo que vale: los datos con su cifra; los hechos en palabras, conclusiones, deseos y contexto
 * como texto; lo que falta, «sin dato» con su motivo. Es lo que el validador usa para saber si un id existe.
 */
export function refsDelPaquete(p: Paquete): Map<string, RefValor> {
  const cfg: ConfigEmpresa = { ...porDefecto, moneda: p.empresa.moneda, zona_horaria: p.empresa.zona };
  const refs = new Map<string, RefValor>();
  for (const h of p.hechos) {
    const unidad = h.valor ? h.unidad ?? "texto" : "texto";
    refs.set(h.id, {
      valor: h.valor ?? null,
      unidad,
      texto: h.valor ? textoDeValor(h.valor, unidad, cfg) : h.texto,
      clase: CLASE_REF[h.clase],
      formula: `dato de la empresa: ${h.fuente.como}`,
      nombre: nombreDeRef(h),
      ...(h.provisional ? { provisional: true as const } : {}),
    });
  }
  for (const s of p.sin_dato) {
    refs.set(s.id, { valor: null, unidad: CLAVES_SUPUESTO[s.clave]?.unidad ?? "texto", texto: "sin dato", clase: "sin_dato", formula: "falta el dato", nombre: CLAVES_SUPUESTO[s.clave]?.nombre ?? s.que_falta, motivo_nulo: s.dijo_no_lo_se ? `el dueño dijo que no lo sabe: ${s.que_falta}` : `falta: ${s.que_falta}` });
  }
  const comoTexto = (id: string, texto: string, nombre: string, clase: ClaseRef = "estimado") => refs.set(id, { valor: null, unidad: "texto", texto, clase, formula: nombre, nombre });
  for (const l of p.lineas) comoTexto(l.id, l.nombre, "línea de lo que vende", "hecho");
  for (const c of p.conclusiones) comoTexto(c.id, c.titulo, c.revisada ? COMO.hallazgo_revisado : COMO.hallazgo_sin_revisar);
  for (const d of p.deseos) comoTexto(d.id, d.texto, d.fuente);
  for (const c of p.contradicciones) comoTexto(c.id, c.texto, "contradicho");
  for (const t of p.contexto.calendario) comoTexto(t.id, `${t.mes}: ${t.nota}`, COMO.calendario);
  for (const z of p.contexto.referencia) comoTexto(z.id, z.texto, COMO.referencia);
  return refs;
}

// ─── El paquete como texto para el modelo ────────────────────────────────────────────────────────

const NOMBRE_CLASE: Record<ClaseHecho, string> = { hecho: "hecho", estimado: "estimado", percepcion: "percepción" };
const NOMBRE_CLASE_REF: Record<ClaseRef, string> = { hecho: "sale de hechos", estimado: "sale de estimados", supuesto: "sale de supuestos", sin_dato: "sin dato" };

const esFuga = (id: string) => /^C:(fuga\.|fugas\.|parado\.|no_actuar\.)/.test(id);
const DATOS_DE_NEGOCIO = /^(L|G|B):/;

/** Primero lo confirmado (no provisional, percepción confirmada) y lo más reciente; a igualdad, por id. */
function ordenDeConfianza(a: Hecho, b: Hecho): number {
  const peso = (h: Hecho) => (h.provisional ? 1 : 0) - (h.confirmada ? 1 : 0);
  return peso(a) - peso(b) || (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.id.localeCompare(b.id);
}

const lineaHecho = (h: Hecho) => {
  const partes = [NOMBRE_CLASE[h.clase] + (h.provisional ? " provisional" : "") + (h.confirmada ? " confirmada" : ""), h.fuente.como, h.fecha, h.pilar].filter(Boolean);
  return `[${h.id}] (${partes.join(" · ")}) ${h.texto}`;
};

/**
 * El paquete en texto, una línea por elemento, con su id, su clase, de dónde salió, su fecha y su pilar. Si no cabe en
 * el tope, se recorta por grupos en este orden de prioridad: cálculos → números → productos y gastos → fugas → lo que
 * falta saber → conclusiones revisadas → personas → hechos → estimados → percepciones confirmadas → hipótesis →
 * contradicciones → percepciones sin verificar → deseos → contexto (§3.5). Cada recorte queda dicho.
 */
export function paqueteComoTexto(p: Paquete, refs: Map<string, RefValor>, tope = TOPE_PAQUETE): { texto: string; recortes: Paquete["recortes"] } {
  const calc = [...refs.entries()].filter(([id]) => id.startsWith("C:")).sort(([a], [b]) => a.localeCompare(b));
  const lineaRef = ([id, r]: [string, RefValor]) => `[${id}] (cálculo · ${r.motivo_nulo ? "sin dato" : NOMBRE_CLASE_REF[r.clase]}) ${r.nombre}: ${r.motivo_nulo ? `sin dato (${r.motivo_nulo})` : r.texto}`;
  const hechosDe = (filtro: (h: Hecho) => boolean) => p.hechos.filter(filtro).sort(ordenDeConfianza).map(lineaHecho);
  const otros = (h: Hecho) => !h.id.startsWith("N:") && !DATOS_DE_NEGOCIO.test(h.id);

  const grupos: { nombre: string; titulo: string; lineas: string[] }[] = [
    { nombre: "cálculos", titulo: "CÁLCULOS DE 8X (los hizo el código)", lineas: calc.filter(([id]) => !esFuga(id)).map(lineaRef) },
    { nombre: "números", titulo: "LOS NÚMEROS DE LA EMPRESA", lineas: hechosDe((h) => h.id.startsWith("N:")) },
    { nombre: "productos y gastos", titulo: "LO QUE VENDE, SUS GASTOS Y SU FICHA DE NEGOCIO", lineas: hechosDe((h) => DATOS_DE_NEGOCIO.test(h.id)) },
    { nombre: "fugas", titulo: "FUGAS, DINERO PARADO Y SI SEGUIMOS IGUAL (cálculos)", lineas: calc.filter(([id]) => esFuga(id)).map(lineaRef) },
    { nombre: "lo que falta saber", titulo: "LO QUE FALTA SABER (no se supone: se pregunta)", lineas: p.sin_dato.map((s) => `[${s.id}] (sin dato${s.dijo_no_lo_se ? " · el dueño dijo que no lo sabe" : ""}) ${s.que_falta}: ${s.por_que_importa}`) },
    { nombre: "conclusiones revisadas", titulo: "CONCLUSIONES REVISADAS POR LA CONSULTORA", lineas: p.conclusiones.filter((c) => c.revisada).map((c) => `[${c.id}] (conclusión revisada${c.impacto ? ` · impacto ${c.impacto}` : ""}${c.pilar ? ` · ${c.pilar}` : ""}) ${c.titulo}${c.causa ? `. Causa: ${c.causa}` : ""}${c.refs.length ? `. Se apoya en: ${c.refs.join(", ")}` : ""}`) },
    { nombre: "personas", titulo: "PERSONAS DE LA EMPRESA (para los responsables)", lineas: p.personas.map((x) => `- ${x.nombre}${x.puesto ? ` (${x.puesto})` : ""}`) },
    { nombre: "hechos", titulo: "HECHOS", lineas: hechosDe((h) => otros(h) && h.clase === "hecho") },
    { nombre: "estimados", titulo: "ESTIMADOS DEL DUEÑO", lineas: hechosDe((h) => otros(h) && h.clase === "estimado") },
    { nombre: "percepciones confirmadas", titulo: "PERCEPCIONES CONFIRMADAS POR EL DUEÑO", lineas: hechosDe((h) => otros(h) && h.clase === "percepcion" && !!h.confirmada) },
    { nombre: "hipótesis", titulo: "HIPÓTESIS (hallazgos sin revisar)", lineas: p.conclusiones.filter((c) => !c.revisada).map((c) => `[${c.id}] (hipótesis${c.impacto ? ` · impacto ${c.impacto}` : ""}${c.pilar ? ` · ${c.pilar}` : ""}) ${c.titulo}${c.causa ? `. Causa: ${c.causa}` : ""}${c.refs.length ? `. Se apoya en: ${c.refs.join(", ")}` : ""}`) },
    { nombre: "contradicciones", titulo: "LO CONTRADICHO O CADUCADO (no es un hecho)", lineas: p.contradicciones.map((c) => `[${c.id}] (contradicho) ${c.texto}${c.versus ? ` — choca con: ${c.versus}` : ""}`) },
    { nombre: "percepciones sin verificar", titulo: "PERCEPCIONES SIN VERIFICAR", lineas: hechosDe((h) => otros(h) && h.clase === "percepcion" && !h.confirmada) },
    { nombre: "deseos", titulo: "LO QUE QUIERE EL DUEÑO (deseos, no hechos)", lineas: p.deseos.map((d) => `[${d.id}] (deseo · ${d.fuente}) ${d.texto}`) },
    {
      nombre: "contexto",
      titulo: "CONTEXTO (nunca es dato de la empresa)",
      lineas: [
        ...p.contexto.calendario.map((t) => `[${t.id}] (contexto · ${COMO.calendario}) ${t.mes}: ${t.nota}`),
        ...p.contexto.referencia.map((z) => `[${z.id}] (contexto · ${COMO.referencia}) ${z.texto}`),
      ],
    },
  ];

  const e = p.empresa;
  const cabecera = [
    `EMPRESA · rubro: ${e.sector ?? "sin dato"} · personas: ${e.personas ?? "sin dato"} · cómo gana dinero: ${e.modelo_negocio.length ? e.modelo_negocio.map((m) => MODELO[m].paraDueno).join(" y ") : "sin dato"} · moneda: ${e.moneda} · hoy: ${e.hoy}`,
    `CONTEO · hechos: ${p.conteo.hecho} · estimados: ${p.conteo.estimado} · percepciones: ${p.conteo.percepcion} · sin dato: ${p.conteo.sin_dato} · hipótesis: ${p.conteo.hipotesis} · deseos: ${p.conteo.deseo}`,
    ...(p.lecturas_fallidas.length ? [`NO HABILITADO EN ESTA BASE (sus datos salen como sin dato): ${p.lecturas_fallidas.map((l) => `${l.tabla} (${l.motivo})`).join("; ")}`] : []),
  ].join("\n");

  const salida: string[] = [cabecera];
  let usado = cabecera.length;
  let lleno = false;
  const nuevos: Paquete["recortes"] = [];
  for (const g of grupos) {
    if (!g.lineas.length) continue;
    let incluidos = 0;
    if (!lleno) {
      const titulo = `\n\n${g.titulo}`;
      if (usado + titulo.length + 1 + (g.lineas[0]?.length ?? 0) <= tope) {
        salida.push(titulo);
        usado += titulo.length;
        for (const l of g.lineas) {
          if (usado + 1 + l.length > tope) {
            lleno = true;
            break;
          }
          salida.push(`\n${l}`);
          usado += 1 + l.length;
          incluidos++;
        }
      } else lleno = true;
    }
    if (incluidos < g.lineas.length) nuevos.push({ grupo: g.nombre, incluidos, total: g.lineas.length, criterio: CRITERIO_RECORTE });
  }
  return { texto: salida.join(""), recortes: [...p.recortes, ...nuevos] };
}

/** «De 412 afirmaciones, 8X usó 140…»: el recorte más grande en una frase, para la pantalla. Sin recortes, null. */
export function textoDeRecortes(recortes: Paquete["recortes"]): string | null {
  const reales = recortes.filter((r) => r.total > r.incluidos);
  if (!reales.length) return null;
  return reales.map((r) => `8X usó ${r.incluidos} de ${r.total} (${r.grupo}): ${r.criterio}.`).join(" ");
}
