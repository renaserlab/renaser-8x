/**
 * LO QUE LAS RUTAS DE «LO QUE EL CLIENTE LLENA HOY» VALIDAN, EN UN SOLO LUGAR (16-10-2026).
 *
 * Las rutas importan de aquí; las pantallas pueden validar con lo mismo antes de mandar. Cada número dicho es un
 * DatoOral (src/lib/dato-oral.ts): exacto, rango o «no lo sé», con su estado. Lo del dueño nunca trae «comprobado»:
 * eso lo marca la consultora con el documento delante. Todo es estricto: un campo que no está aquí no entra (el dueño
 * no puede mandar una decisión, un origen ni un código por la puerta de atrás).
 *
 * Puro: sin base, sin red. Sin nada de servidor: lo puede importar un componente de cliente.
 */
import { z } from "zod";
import { esquemaDatoOral, ESTADOS_DATO, formaDe, rangoDe, type DatoOral, type EstadoDato } from "./dato-oral";
import { MODELO, MODELOS_NEGOCIO, type ModeloNegocio } from "./negocio";
import { SECCIONES_QUE_ACTIVA_LA_CONSULTORA } from "./secciones";
import { TIPOS_TRABAJO, CLAVES_ETAPA } from "./ruta";

/** Texto con algo escrito, recortado y con tope. El mismo `texto` de src/lib/api.ts, sin traer el servidor. */
const texto = (max: number) => z.string().trim().min(1).max(max);
const monto = z.number().finite().min(0, "no puede ser negativo").max(1_000_000_000_000).nullable().optional();
const deCada10 = z.number().finite().min(0).max(10).nullable().optional();

const D = esquemaDatoOral();
const DDueno = esquemaDatoOral({ sinComprobado: true });
const D10 = esquemaDatoOral({ max: 10 });
const D10Dueno = esquemaDatoOral({ max: 10, sinComprobado: true });

const estadoDueno = z.enum(["estimado", "contado", "no_lo_se"]);
const estadoConsultora = z.enum(ESTADOS_DATO);

// ─── Las partes del costo ────────────────────────────────────────────────────────────────────────

/** El esquema de una parte, estricto con el nombre incluido. */
function esquemaParte(dueno: boolean) {
  const n = z.number().finite().min(0, "no puede ser negativo").max(1_000_000_000_000).nullable().optional();
  return z
    .object({ nombre: texto(60), valor: n, desde: n, hasta: n, estado: dueno ? estadoDueno : estadoConsultora })
    .strict()
    .superRefine((p, ctx) => {
      const forma = formaDe(p as DatoOral);
      if (forma === "mezclado") ctx.addIssue({ code: "custom", message: p.estado === "no_lo_se" ? "«No lo sé» va sin números." : "Un número o un rango, no los dos.", path: ["valor"] });
      if (forma === "rango" && (p.desde as number) > (p.hasta as number)) ctx.addIssue({ code: "custom", message: "El «desde» es mayor que el «hasta».", path: ["desde"] });
    });
}

/**
 * Una parte del costo: «tela», «costura»… Con su número, su rango, «no lo sé», o todavía sin número (se nombra
 * primero y se pone el monto después: «Copiar las partes del producto anterior» copia nombres, no montos). Lo que no
 * puede es tener dos formas a la vez. ComponenteCosto es el de la consultora; ComponenteCostoDueno, sin «comprobado».
 */
export const ComponenteCosto = esquemaParte(false);
export const ComponenteCostoDueno = esquemaParte(true);
export type ComponenteCosto = { nombre: string; valor?: number | null; desde?: number | null; hasta?: number | null; estado: EstadoDato };

// ─── Lo que vende, del lado del dueño ────────────────────────────────────────────────────────────

/** Un rango dicho («62 a 66», «3 o 4»): los dos extremos, el primero no mayor que el segundo. */
function esquemaRango(max: number) {
  const n = z.number().finite().min(0, "no puede ser negativo").max(max);
  return z
    .object({ desde: n, hasta: n })
    .strict()
    .refine((r) => r.desde <= r.hasta, { message: "El «desde» es mayor que el «hasta».", path: ["desde"] });
}

/**
 * Lo que la pantalla deja escrito para rehacer la cuenta: lo dicho por trimestre o por día, el ticket y la comisión, si
 * cobra por hora, y los RANGOS que el dueño dijo en vez de un número («62 a 66», «3 o 4 de cada 10»). Un rango vive
 * aquí con su columna en null: nunca se guarda su centro como si fuera lo dicho. Si la columna tiene número, manda la
 * columna (es lo más nuevo que escribió alguien); el rango solo se lee con la columna vacía (lecturaDatosModelo).
 */
export const DatosModelo = z
  .object({
    ticket: monto,
    comision_pct: z.number().finite().min(0).max(100).nullable().optional(),
    dicho: z.object({ valor: monto, desde: monto, hasta: monto }).strict().nullable().optional(),
    por: z.enum(["trimestre", "dia"]).nullable().optional(),
    por_hora: z.boolean().nullable().optional(),
    rango_precio: esquemaRango(1_000_000_000_000).nullable().optional(),
    rango_costo: esquemaRango(1_000_000_000_000).nullable().optional(),
    rango_de_cada_10: esquemaRango(10).nullable().optional(),
    rango_de_cada_10_segundo: esquemaRango(10).nullable().optional(),
  })
  .strict();

/** Qué claves de datos_modelo son de cada grupo de datos de una línea (para no tocar lo que la consultora comprobó). */
export const CLAVES_DATOS_MODELO_DEL_GRUPO: Record<"precio" | "costo" | "unidades", readonly string[]> = {
  precio: ["ticket", "comision_pct", "por_hora", "rango_precio", "rango_de_cada_10_segundo"],
  costo: ["rango_costo"],
  unidades: ["dicho", "por", "rango_de_cada_10"],
};

/** Lo que datos_modelo dice, leído con cuidado: lo que no tiene la forma esperada no se usa. Puro. */
export type LecturaDatosModelo = {
  porHora: boolean;
  rangoPrecio: { bajo: number; alto: number } | null;
  rangoCosto: { bajo: number; alto: number } | null;
  rangoDeCada10: { bajo: number; alto: number } | null;
  rangoDeCada10Segundo: { bajo: number; alto: number } | null;
};

/**
 * ¿Esta línea cobra por hora? Solo si lo dijo (datos_modelo.por_hora) Y su modelo lo admite (cobra por hora o por
 * caso; sin modelo, un servicio): una marca vieja en un producto no convierte su precio.
 */
export function cobraPorHora(l: { modelo?: ModeloNegocio | null; tipo?: string | null; datos_modelo?: Record<string, unknown> | null }): boolean {
  if (l.datos_modelo?.por_hora !== true) return false;
  return l.modelo ? !!MODELO[l.modelo].preguntaPrecioPorHora : l.tipo === "servicio";
}

export function lecturaDatosModelo(dm: Record<string, unknown> | null | undefined): LecturaDatosModelo {
  const rango = (v: unknown, max: number): { bajo: number; alto: number } | null => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { desde, hasta } = v as { desde?: unknown; hasta?: unknown };
    if (typeof desde !== "number" || typeof hasta !== "number" || !Number.isFinite(desde) || !Number.isFinite(hasta)) return null;
    if (desde < 0 || hasta > max || desde > hasta) return null;
    return { bajo: desde, alto: hasta };
  };
  const x = dm ?? {};
  return {
    porHora: x.por_hora === true,
    rangoPrecio: rango(x.rango_precio, 1_000_000_000_000),
    rangoCosto: rango(x.rango_costo, 1_000_000_000_000),
    rangoDeCada10: rango(x.rango_de_cada_10, 10),
    rangoDeCada10Segundo: rango(x.rango_de_cada_10_segundo, 10),
  };
}

/** Los campos que la migración del 16-10 le agrega a una línea. La consultora los recibe todos, «comprobado» incluido. */
export function camposLineaNuevos(dueno: boolean) {
  const estado = dueno ? estadoDueno : estadoConsultora;
  return {
    modelo: z.enum(MODELOS_NEGOCIO).nullable().optional(),
    grupo: texto(60).nullable().optional(),
    canal: texto(120).nullable().optional(),
    precio_segundo: monto,
    segundo_precio_es: z.enum(["por_mayor", "minimo"]).nullable().optional(),
    de_cada_10_segundo: deCada10,
    componentes_costo: z.array(dueno ? ComponenteCostoDueno : ComponenteCosto).max(20, "como mucho 20 partes").optional(),
    unidades_mes: monto,
    unidades_mes_desde: monto,
    unidades_mes_hasta: monto,
    participacion_de_10: deCada10,
    estados: z.object({ precio: estado.optional(), costo: estado.optional(), unidades: estado.optional() }).strict().optional(),
    datos_modelo: DatosModelo.nullable().optional(),
  };
}

function camposLinea(dueno: boolean) {
  return {
    nombre: texto(160),
    tipo: z.enum(["producto", "servicio"]).optional(),
    precio: monto,
    costo_variable_unitario: monto,
    horas_por_unidad: monto,
    ...camposLineaNuevos(dueno),
  };
}

type FormaLinea = {
  componentes_costo?: unknown[];
  costo_variable_unitario?: number | null;
  unidades_mes?: number | null;
  unidades_mes_desde?: number | null;
  unidades_mes_hasta?: number | null;
  precio_segundo?: number | null;
  segundo_precio_es?: string | null;
};

/** Las reglas de forma de una línea, sobre lo que viene en el cuerpo. Las de sentido (con la fila previa) las revisa revisarLinea. */
function reglasLinea(b: FormaLinea, ctx: z.RefinementCtx) {
  if (b.componentes_costo?.length && b.costo_variable_unitario != null) {
    ctx.addIssue({ code: "custom", message: "Con las partes del costo, el costo total lo calcula 8X: no se manda aparte.", path: ["costo_variable_unitario"] });
  }
  if (b.unidades_mes != null && (b.unidades_mes_desde != null || b.unidades_mes_hasta != null)) {
    ctx.addIssue({ code: "custom", message: "Cuánto vendes: un número o un rango, no los dos.", path: ["unidades_mes"] });
  }
  // Un rango viaja con sus dos extremos; si en un cambio llega uno solo, lo revisa revisarLinea con la fila previa.
  if (b.unidades_mes_desde !== undefined && b.unidades_mes_hasta !== undefined && (b.unidades_mes_desde == null) !== (b.unidades_mes_hasta == null)) {
    ctx.addIssue({ code: "custom", message: "Un rango necesita sus dos extremos.", path: ["unidades_mes_desde"] });
  }
  if (b.unidades_mes_desde != null && b.unidades_mes_hasta != null && b.unidades_mes_desde > b.unidades_mes_hasta) {
    ctx.addIssue({ code: "custom", message: "El «desde» es mayor que el «hasta».", path: ["unidades_mes_desde"] });
  }
}

const ObjetoLineaDueno = z.object(camposLinea(true)).strict();
/** Lo que el dueño manda para crear una línea. Sin código, decisión, motivo, origen, fuente, periodo ni unidades del periodo. */
export const CuerpoLineaDueno = ObjetoLineaDueno.superRefine(reglasLinea);
/** Lo que el dueño manda para cambiar una línea: lo mismo, todo opcional. */
export const CambiosLineaDueno = ObjetoLineaDueno.partial().superRefine(reglasLinea);
export type DatosLineaDueno = z.infer<typeof ObjetoLineaDueno>;

// ─── Gastos del mes ──────────────────────────────────────────────────────────────────────────────

const periodoCosto = z.union([z.literal("mes_tipico"), z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, "el mes se escribe AAAA-MM")]);

function camposCosto(dueno: boolean) {
  return {
    periodo: periodoCosto.optional(),
    tipo: z.enum(["fijo", "comercializacion"]),
    nombre: texto(120),
    dato: dueno ? DDueno : D,
    nota: texto(600).nullable().optional(),
    orden: z.number().int().min(0).max(10_000).optional(),
  };
}
export const CuerpoCosto = z.object(camposCosto(false)).strict();
export const CuerpoCostoDueno = z.object(camposCosto(true)).strict();
export const CambiosCosto = CuerpoCosto.partial();
export const CambiosCostoDueno = CuerpoCostoDueno.partial();

/** Un DatoOral a las columnas de costos_mes: monto, o desde-hasta, o nada con «no lo sé». */
export function columnasDeDato(d: DatoOral): { monto: number | null; monto_desde: number | null; monto_hasta: number | null; estado: EstadoDato } {
  const forma = formaDe(d);
  if (forma === "exacto") return { monto: d.valor as number, monto_desde: null, monto_hasta: null, estado: d.estado };
  if (forma === "rango") {
    const r = rangoDe(d)!;
    return { monto: null, monto_desde: r.bajo, monto_hasta: r.alto, estado: d.estado };
  }
  return { monto: null, monto_desde: null, monto_hasta: null, estado: d.estado };
}

// ─── Lo que la empresa responde una vez ──────────────────────────────────────────────────────────

const iso = z.string().regex(/^[A-Z]{3}$/, "la moneda se escribe con su código de tres letras (USD, CLP…)");

function bloques(dueno: boolean) {
  const d = dueno ? DDueno : D;
  const d10 = dueno ? D10Dueno : D10;
  const estado = dueno ? estadoDueno : estadoConsultora;
  const anioActual = new Date().getFullYear();
  return {
    historia: z
      .object({
        anio_inicio: z.object({ valor: z.number().int().min(1900).max(anioActual).nullable(), estado }).strict().nullable().optional(),
        /** Al mes, en el primer año. */
        venta_inicial: d.nullable().optional(),
        mejor_epoca: z
          .object({ cuando: texto(120).nullable().optional(), venta_mes: d.nullable().optional(), que_pasaba: texto(1000).nullable().optional(), no_lo_se: z.boolean().optional() })
          .strict()
          .nullable()
          .optional(),
        bajada: z.object({ no_bajo: z.boolean(), cuando: texto(120).nullable().optional(), que_cambio: texto(1000).nullable().optional() }).strict().nullable().optional(),
        hoy_distinto: z.object({ texto: texto(1000).nullable().optional(), no_lo_se: z.boolean().optional() }).strict().nullable().optional(),
      })
      .strict(),
    modulos: z.object({ moneda: z.boolean().nullable().optional(), credito: z.boolean().nullable().optional(), inventario: z.boolean().nullable().optional() }).strict(),
    totales: z
      .object({
        /** «De cada 10»: cuánto se vende en total en un mes normal, por grupo. La clave "" es toda la empresa. null quita el grupo. */
        grupos: z
          .record(z.string().trim().max(60), d.nullable())
          .refine((g) => Object.keys(g).length <= 30, "como mucho 30 grupos")
          .optional(),
        dias_al_mes: d.nullable().optional(),
      })
      .strict(),
    moneda: z
      .object({
        vende_en: z.array(iso).max(3).nullable().optional(),
        costos_en: iso.nullable().optional(),
        dias_cobro: d.nullable().optional(),
        conversiones: z.union([z.literal(1), z.literal(2), z.literal("no_lo_se")]).nullable().optional(),
        operaciones_mes: d.nullable().optional(),
        /** En la moneda de la venta. */
        monto_tipico: d.nullable().optional(),
        como_cobra: texto(300).nullable().optional(),
      })
      .strict(),
    credito: z.object({ de_cada_10: d10.nullable().optional(), dias: d.nullable().optional(), incobrables_de_cada_10: d10.nullable().optional() }).strict(),
    inventario: z.object({ valor: d.nullable().optional(), meses: d.nullable().optional(), parado: d.nullable().optional() }).strict(),
  };
}

const B = bloques(false);
const BDueno = bloques(true);
export const EsquemaHistoria = B.historia;
export const EsquemaModulos = B.modulos;
export const EsquemaTotales = B.totales;
export const EsquemaMoneda = B.moneda;
export const EsquemaCredito = B.credito;
export const EsquemaInventario = B.inventario;
export const EsquemasBloqueDueno = BDueno;

export type Historia = z.infer<typeof EsquemaHistoria>;
export type Modulos = z.infer<typeof EsquemaModulos>;
export type Totales = z.infer<typeof EsquemaTotales>;
export type Moneda = z.infer<typeof EsquemaMoneda>;
export type Credito = z.infer<typeof EsquemaCredito>;
export type Inventario = z.infer<typeof EsquemaInventario>;

export const BLOQUES_FICHA = ["historia", "modulos", "totales", "moneda", "credito", "inventario"] as const;
export type BloqueFicha = (typeof BLOQUES_FICHA)[number];

/** PATCH /negocio: un bloque y lo que cambia de él (se mezcla con lo que había), o los modelos del negocio. */
function cuerpoNegocio(dueno: boolean) {
  const b = dueno ? BDueno : B;
  return z.discriminatedUnion("bloque", [
    z.object({ bloque: z.literal("historia"), datos: b.historia }).strict(),
    z.object({ bloque: z.literal("modulos"), datos: b.modulos }).strict(),
    z.object({ bloque: z.literal("totales"), datos: b.totales }).strict(),
    z.object({ bloque: z.literal("moneda"), datos: b.moneda }).strict(),
    z.object({ bloque: z.literal("credito"), datos: b.credito }).strict(),
    z.object({ bloque: z.literal("inventario"), datos: b.inventario }).strict(),
    z.object({ bloque: z.literal("modelo_negocio"), datos: z.array(z.enum(MODELOS_NEGOCIO)).min(1).max(2) }).strict(),
  ]);
}
export const CuerpoNegocio = cuerpoNegocio(false);
export const CuerpoNegocioDueno = cuerpoNegocio(true);
export type PedidoNegocio = z.infer<typeof CuerpoNegocio>;

/** Cuántas de las cinco preguntas de la historia están respondidas. Un «no lo sé» (o «no ha bajado») cuenta. */
export function respondidasDeHistoria(h: Historia | null | undefined): number {
  if (!h) return 0;
  let n = 0;
  const datoRespondido = (d: Partial<DatoOral> | null | undefined) => !!d && (rangoDe(d) != null || d.estado === "no_lo_se");
  if (h.anio_inicio && (h.anio_inicio.valor != null || h.anio_inicio.estado === "no_lo_se")) n++;
  if (datoRespondido(h.venta_inicial)) n++;
  const me = h.mejor_epoca;
  if (me && (me.no_lo_se || !!me.cuando || !!me.que_pasaba || datoRespondido(me.venta_mes))) n++;
  const b = h.bajada;
  if (b && (b.no_bajo || !!b.cuando || !!b.que_cambio)) n++;
  const hd = h.hoy_distinto;
  if (hd && (hd.no_lo_se || !!hd.texto)) n++;
  return n;
}

// ─── Ventas en otra moneda ───────────────────────────────────────────────────────────────────────

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "la fecha se escribe AAAA-MM-DD");

function camposOperacion(dueno: boolean) {
  return {
    fecha_venta: fecha.nullable().optional(),
    fecha_cobro: fecha.nullable().optional(),
    dias_cobro: z.number().int().min(0).max(730).nullable().optional(),
    moneda: iso,
    monto: z.number().finite().positive("tiene que ser mayor que cero").max(1_000_000_000_000),
    tc_cotizado: z.number().finite().positive().max(1_000_000).nullable().optional(),
    tc_cobro: z.number().finite().positive().max(1_000_000).nullable().optional(),
    recibido: monto,
    comisiones: monto,
    conversiones: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
    estado: (dueno ? z.enum(["estimado", "contado"]) : z.enum(["estimado", "contado", "comprobado"])).optional(),
    source_id: z.string().uuid().nullable().optional(),
    nota: texto(600).nullable().optional(),
  };
}

const reglasOperacion = (o: { fecha_venta?: string | null; fecha_cobro?: string | null }, ctx: z.RefinementCtx) => {
  if (o.fecha_venta && o.fecha_cobro && o.fecha_cobro < o.fecha_venta) ctx.addIssue({ code: "custom", message: "Te cobraron antes de venderlo: revisa las fechas.", path: ["fecha_cobro"] });
};
const ObjetoOperacion = z.object(camposOperacion(false)).strict();
const ObjetoOperacionDueno = z.object(camposOperacion(true)).strict();
export const CuerpoOperacionMoneda = ObjetoOperacion.superRefine(reglasOperacion);
export const CuerpoOperacionMonedaDueno = ObjetoOperacionDueno.superRefine(reglasOperacion);
export const CambiosOperacionMoneda = ObjetoOperacion.partial().superRefine(reglasOperacion);
export const CambiosOperacionMonedaDueno = ObjetoOperacionDueno.partial().superRefine(reglasOperacion);

/** Los días entre la venta y el cobro, si vienen las dos fechas. Si no, null: no se adivinan. */
export function diasEntreFechas(venta: string | null | undefined, cobro: string | null | undefined): number | null {
  if (!venta || !cobro) return null;
  const a = Date.parse(`${venta}T00:00:00Z`);
  const b = Date.parse(`${cobro}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

// ─── La ruta, del lado de la consultora ──────────────────────────────────────────────────────────

export const CuerpoRuta = z
  .object({
    tipo_trabajo: z.enum(TIPOS_TRABAJO).nullable().optional(),
    ruta_inicio: fecha.nullable().optional(),
    hora_cierre: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "la hora se escribe HH:MM (19:00)").nullable().optional(),
    modelo_negocio: z.array(z.enum(MODELOS_NEGOCIO)).min(1).max(2).nullable().optional(),
    marca: z.object({ clave: z.string().regex(/^[a-z_0-9]+\.[a-z_0-9]+$/), valor: z.enum(["cumple", "no_cumple"]), nota: texto(600).nullable().optional() }).strict().optional(),
    veredicto: z.object({ etapa: z.enum(CLAVES_ETAPA), valor: z.enum(["verde", "ambar", "rojo"]), nota: z.string().trim().max(600).nullable().optional() }).strict().optional(),
  })
  .strict();

export const TEXTO_VEREDICTO_SIN_MOTIVO = "Di por qué en una frase: el veredicto se guarda con su motivo.";

// ─── Activar para el cliente ─────────────────────────────────────────────────────────────────────

/** Solo las que se activan con una casilla: «preguntas_estrategia» la abre el envío de las preguntas (secciones.ts). */
export const CuerpoActivar = z
  .object({ secciones: z.array(z.object({ seccion: z.enum(SECCIONES_QUE_ACTIVA_LA_CONSULTORA), nota: texto(600).nullable().optional() }).strict()).min(1).max(SECCIONES_QUE_ACTIVA_LA_CONSULTORA.length) })
  .strict();

export const CuerpoSolicitud = z.object({ estado: z.enum(["completada", "retirada"]) }).strict();
