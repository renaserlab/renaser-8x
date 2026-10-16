/**
 * LA RUTA DE CADA EMPRESA: SUS ETAPAS, SUS COMPUERTAS Y CUÁNTO LLEVA (16-10-2026).
 *
 * Kelin: «arriba, la barra de proceso y avance con cada empresa». Una sola ruta (clientes/8x-plan/
 * ruta-sistema-alto-rendimiento.md), tres formas de recorrerla según el trabajo que compró la empresa:
 *
 *   estructurar                 diagnóstico (1–7, Compuerta 5) → estructurar (8–30, Compuerta 30)
 *   estructurar_y_sistematizar  … → sistematizar (31–60, Compuerta 60) → monitoreo (61–120, Compuerta 120)
 *   sistematizar_directo        diagnóstico (1–7) → ordenar y sistematizar por olas (8–30) → monitoreo (31–90)
 *
 * REGLAS QUE NO SE NEGOCIAN
 *  1. Se avanza con resultados medidos, nunca por calendario. Los días son máximos: si una etapa se pasa, se dice
 *     («Va N días más de lo previsto»), en gris, y nada se bloquea ni cambia de estado por la fecha.
 *  2. Una etapa queda «pasada» SOLO con el veredicto verde de la consultora (ruta_marcas `<etapa>.compuerta`). 8X
 *     sugiere un color; decide ella.
 *  3. Lo que 8X no pudo leer es «sin_medir», no «falta» ni «hecho». Se dibuja rayado, se nombra «no se pudo leer»,
 *     y una compuerta con algo sin medir nunca se sugiere en verde.
 *  4. Lo que 8X todavía no mide (las fugas con su cuenta, la prueba de ausencia…) es una MARCA de la consultora:
 *     sin marca es «falta».
 *  5. El dueño ve las etapas con sus nombres y el % de la que está en curso (`vistaDueno`): ni criterios, ni
 *     notas, ni veredictos. Eso es trabajo de la consultora (regla de Kelin del 27-09).
 *
 * Puro: recibe HECHOS ya leídos (src/lib/ruta-datos.ts los lee) y devuelve el avance. Sin base, sin red.
 */
import { TIPOS_TRABAJO } from "./negocio";

export { TIPOS_TRABAJO } from "./negocio";

export type TipoTrabajo = (typeof TIPOS_TRABAJO)[number];

export const TIPO_TRABAJO_TEXTO: Record<TipoTrabajo, { consultora: string; dueno: string }> = {
  estructurar: { consultora: "Estructurar: 1 semana de diagnóstico y plan + 3 de implementación medida", dueno: "Ordenar tu empresa" },
  estructurar_y_sistematizar: { consultora: "Estructurar y después sistematizar (hasta 120 días)", dueno: "Ordenar y sistematizar tu empresa" },
  sistematizar_directo: { consultora: "Sistematizar directo: diagnóstico y, en olas, ordenar y sistematizar (hasta 90 días)", dueno: "Ordenar y sistematizar tu empresa" },
};

export const esTipoTrabajo = (v: unknown): v is TipoTrabajo => (TIPOS_TRABAJO as readonly string[]).includes(String(v));

export const CLAVES_ETAPA = ["diagnostico", "estructurar", "ordenar_y_sistematizar", "sistematizar", "monitoreo"] as const;
export type ClaveEtapa = (typeof CLAVES_ETAPA)[number];
export type ClaveCompuerta = "c5" | "c30" | "c60" | "c90" | "c120";
export type EstadoCriterio = "hecho" | "falta" | "sin_medir" | "no_aplica";
export type DefCriterio = { clave: string; texto: string; fuente: "medido" | "marca" };
export type DefEtapa = {
  clave: ClaveEtapa;
  nombre: string;
  nombreDueno: string;
  desdeDia: number;
  hastaDia: number;
  compuerta: ClaveCompuerta;
  compuertaNombre: string;
  criterios: DefCriterio[];
};

export const esClaveEtapa = (v: unknown): v is ClaveEtapa => (CLAVES_ETAPA as readonly string[]).includes(String(v));

const NOMBRE: Record<ClaveEtapa, { nombre: string; nombreDueno: string }> = {
  diagnostico: { nombre: "Diagnóstico y plan", nombreDueno: "Conocer tu empresa" },
  estructurar: { nombre: "Implementar la estructura", nombreDueno: "Ordenar" },
  ordenar_y_sistematizar: { nombre: "Ordenar y sistematizar, por olas", nombreDueno: "Ordenar y sistematizar" },
  sistematizar: { nombre: "Sistematizar", nombreDueno: "Sistematizar" },
  monitoreo: { nombre: "Monitoreo y ajuste", nombreDueno: "Acompañamiento" },
};

export const COMPUERTA_NOMBRE: Record<ClaveCompuerta, string> = {
  c5: "Compuerta 5 · La Firma",
  c30: "Compuerta 30",
  c60: "Compuerta 60",
  c90: "Compuerta 90",
  c120: "Compuerta 120",
};

const m = (clave: string, texto: string): DefCriterio => ({ clave, texto, fuente: "medido" });
const k = (clave: string, texto: string): DefCriterio => ({ clave, texto, fuente: "marca" });

/** Criterios v1, de la ruta (§3.4, §3.10, §5.7). Lo que 8X todavía no mide es una marca de la consultora. */
const CRITERIOS_DIAGNOSTICO: DefCriterio[] = [
  m("numeros", "Los 9 números"),
  m("productos", "Lo que vende"),
  m("costos", "Gastos del mes"),
  m("historia", "Historia del negocio"),
  m("pedidos", "Lo pedido al cliente"),
  m("linea_base", "Punto de partida"),
  k("fugas", "Fugas con su cuenta"),
  k("procesos_vitales", "Procesos vitales con responsable y respaldo"),
  m("plan", "Plan de 30 días aceptado"),
  m("indicadores", "Indicadores listos"),
  k("compromiso", "Compromiso del director"),
];

const CRITERIOS_ESTRUCTURAR: DefCriterio[] = [
  m("anotados", "Indicadores anotados"),
  m("revision", "Revisión semanal"),
  m("plan_cumplido", "Plan cumplido"),
  m("organigrama", "Organigrama y funciones"),
  k("procesos_medidos", "Procesos vitales escritos y medidos"),
  k("sin_dependencia", "Respaldo que ya lo hizo"),
  k("ausencia", "Prueba de ausencia de 1 día"),
  k("fugas_bajan", "Las dos fugas mayores bajan"),
];

const ESCRITOS = m("escritos", "Cada proceso dibujado, con su procedimiento escrito");
const CON_INDICADOR = m("con_indicador", "Cada proceso dibujado, con su indicador");

const CRITERIOS_SISTEMATIZAR: DefCriterio[] = [
  ESCRITOS,
  CON_INDICADOR,
  k("sistemas_en_uso", "Sistemas en uso"),
  k("equipo_formado", "Equipo formado"),
  k("primera_replica", "Primera réplica"),
];

const CRITERIOS_MONITOREO: DefCriterio[] = [
  m("cortes", "Corte de cada mes cerrado"),
  m("revision", "Revisión semanal"),
  k("fugas_cerradas", "Fugas cerradas"),
  k("sin_quien_dirige", "Funciona sin quien dirige"),
];

function etapa(clave: ClaveEtapa, desdeDia: number, hastaDia: number, compuerta: ClaveCompuerta, criterios: DefCriterio[]): DefEtapa {
  return { clave, ...NOMBRE[clave], desdeDia, hastaDia, compuerta, compuertaNombre: COMPUERTA_NOMBRE[compuerta], criterios };
}

/** Las etapas de un tipo de trabajo, en orden. Los días son máximos: informan, nunca bloquean. */
export function etapasDe(tipo: TipoTrabajo): DefEtapa[] {
  const diagnostico = etapa("diagnostico", 1, 7, "c5", CRITERIOS_DIAGNOSTICO);
  switch (tipo) {
    case "estructurar":
      return [diagnostico, etapa("estructurar", 8, 30, "c30", CRITERIOS_ESTRUCTURAR)];
    case "estructurar_y_sistematizar":
      return [
        diagnostico,
        etapa("estructurar", 8, 30, "c30", CRITERIOS_ESTRUCTURAR),
        etapa("sistematizar", 31, 60, "c60", CRITERIOS_SISTEMATIZAR),
        etapa("monitoreo", 61, 120, "c120", CRITERIOS_MONITOREO),
      ];
    case "sistematizar_directo":
      return [
        diagnostico,
        etapa("ordenar_y_sistematizar", 8, 30, "c30", [...CRITERIOS_ESTRUCTURAR, ESCRITOS, CON_INDICADOR]),
        etapa("monitoreo", 31, 90, "c90", CRITERIOS_MONITOREO),
      ];
  }
}

/** Las claves de marca que existen: '<etapa>.<criterio de marca>' en alguno de los tres tipos. */
export function clavesDeMarca(): Set<string> {
  const claves = new Set<string>();
  for (const t of TIPOS_TRABAJO) for (const e of etapasDe(t)) for (const c of e.criterios) if (c.fuente === "marca") claves.add(`${e.clave}.${c.clave}`);
  return claves;
}

/** ¿Es una clave de marca de criterio que la consultora puede poner? ('diagnostico.fugas' sí; 'diagnostico.numeros', medido, no). */
export const esClaveDeMarca = (clave: string): boolean => clavesDeMarca().has(clave);

export type Marca = { valor: "cumple" | "no_cumple" | "verde" | "ambar" | "rojo"; nota: string | null; marcado_at: string | null };

export type HechosRuta = {
  tipo: TipoTrabajo | null;
  inicio: string | null;
  zona: string;
  numeros: { conCifra: number; comprobados: number; venta: boolean; gastoFijo: boolean } | null;
  lineaBase: { vigente: boolean } | null;
  productos: { lineas: number; completas: number } | null;
  costos: { conMonto: number } | null;
  /** De 5. Un «no lo sé» cuenta como respondida. */
  historia: { respondidas: number } | null;
  pedidos: { activadas: number; completadas: number; abiertas: number } | null;
  planAceptado: boolean | null;
  indicadores: { activos: number; listos: number; conValorReciente: number } | null;
  revisiones: { esperadas: number; revisadas: number } | null;
  /**
   * Las acciones aprobadas del plan; las que cuentan para «plan cumplido» (las que ya vencieron Y las que ya se
   * verificaron, aunque no hayan vencido); y de esas, las verificadas a tiempo. Por resultados, no por calendario.
   */
  plan: { aprobadas: number; consideradas: number; verificadasATiempo: number } | null;
  organigrama: { puestos: number; documentoConfirmado: boolean } | null;
  procesos: { dibujados: number; conSop: number; conIndicador: number } | null;
  cortes: { mesesCerrados: number; congelados: number } | null;
  /** Clave '<etapa>.<criterio>' o '<etapa>.compuerta'. */
  marcas: Record<string, Marca>;
};

export type CriterioEvaluado = { clave: string; texto: string; fuente: "medido" | "marca"; estado: EstadoCriterio; detalle: string };
export type EtapaEvaluada = {
  clave: ClaveEtapa;
  nombre: string;
  nombreDueno: string;
  desdeDia: number;
  hastaDia: number;
  criterios: CriterioEvaluado[];
  hechos: number;
  medibles: number;
  sinMedir: number;
  /** null si medibles = 0. Nunca se pinta «0 %» por un null: se dice «sin medir». */
  pct: number | null;
  compuerta: { clave: ClaveCompuerta; nombre: string; veredicto: "verde" | "ambar" | "rojo" | null; sugerido: "verde" | "ambar" | "rojo" | "no_se_pudo_leer" };
  estado: "pasada" | "en_curso" | "por_venir";
};
export type AvanceRuta = {
  tipo: TipoTrabajo | null;
  inicio: string | null;
  dia: number | null;
  etapas: EtapaEvaluada[];
  actual: ClaveEtapa | null;
  aviso: string | null;
  faltaParaLaCompuerta: CriterioEvaluado[];
};
export type AvanceDueno = {
  etapas: { clave: ClaveEtapa; nombre: string; estado: EtapaEvaluada["estado"]; pct: number | null }[];
  actual: ClaveEtapa | null;
  dia: number | null;
  hastaDia: number | null;
};

export const TEXTO_NO_SE_PUDO_LEER = "no se pudo leer";
export const AVISO_SIN_TIPO = "Falta elegir el tipo de trabajo";
export const AVISO_SIN_INICIO = "Falta la fecha de inicio de la ruta";

// ─── El día de la ruta, en el reloj de la empresa ────────────────────────────────────────────────

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})/;

/** El día de calendario (AAAA-MM-DD) que vive la empresa en ese instante. Zona desconocida → America/Lima. */
function diaEnZona(instante: Date, zona: string): string {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" });
  }
  const p = Object.fromEntries(f.formatToParts(instante).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const diasEntre = (desde: string, hasta: string): number => {
  const a = RE_FECHA.exec(desde)!;
  const b = RE_FECHA.exec(hasta)!;
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86_400_000);
};

/**
 * Día 1 = ruta_inicio, en el reloj de la empresa: a las 21:00 de Lima del día 1 ya es el día 2 en UTC, y la empresa
 * sigue en su día 1. Antes del inicio da 0 o menos (la ruta todavía no empieza). Sin inicio, null.
 */
export function diaDeRuta(inicio: string | null, hoy: Date, zona: string): number | null {
  if (!inicio || !RE_FECHA.test(inicio)) return null;
  return diasEntre(inicio.slice(0, 10), diaEnZona(hoy, zona)) + 1;
}

// ─── Los criterios ───────────────────────────────────────────────────────────────────────────────

type Juicio = { estado: EstadoCriterio; detalle: string };
const sinMedir = (que: string): Juicio => ({ estado: "sin_medir", detalle: `${TEXTO_NO_SE_PUDO_LEER}: ${que}` });
const juicio = (hecho: boolean, detalle: string): Juicio => ({ estado: hecho ? "hecho" : "falta", detalle });
const pctDe = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);

const MEDIDOS: Record<string, (h: HechosRuta) => Juicio> = {
  numeros: (h) => {
    if (!h.numeros) return sinMedir("los 9 números");
    const n = h.numeros;
    const faltan = [n.venta ? null : "la venta del mes", n.gastoFijo ? null : "el gasto fijo"].filter(Boolean);
    return juicio(n.conCifra >= 5 && n.venta && n.gastoFijo, `${n.conCifra} de 9 con cifra${faltan.length ? `; falta ${faltan.join(" y ")}` : ""} (se piden 5, con la venta y el gasto fijo)`);
  },
  productos: (h) => {
    if (!h.productos) return sinMedir("lo que vende");
    const { lineas, completas } = h.productos;
    if (lineas === 0) return juicio(false, "todavía no hay ningún producto o servicio anotado");
    return juicio(completas / lineas >= 0.8, `${completas} de ${lineas} con precio, costo y cuánto vende al mes (se pide el 80 %)`);
  },
  costos: (h) => {
    if (h.costos && h.costos.conMonto >= 1) return juicio(true, `${h.costos.conMonto} gasto(s) del mes con monto`);
    if (h.numeros?.gastoFijo) return juicio(true, "el gasto fijo está en los 9 números");
    if (!h.costos) return sinMedir("los gastos del mes");
    return juicio(false, "ningún gasto del mes con monto, y el gasto fijo no está en los 9 números");
  },
  historia: (h) => {
    if (!h.historia) return sinMedir("la historia del negocio");
    return juicio(h.historia.respondidas >= 5, `${h.historia.respondidas} de 5 preguntas respondidas (un «no lo sé» cuenta)`);
  },
  pedidos: (h) => {
    if (!h.pedidos) return sinMedir("lo pedido al cliente");
    const p = h.pedidos;
    if (p.activadas === 0) return { estado: "no_aplica", detalle: "no se le ha pedido nada al cliente" };
    return juicio(p.abiertas === 0 && p.completadas >= p.activadas, `${p.completadas} de ${p.activadas} pedidos completados${p.abiertas ? `; ${p.abiertas} abierto(s)` : ""}`);
  },
  linea_base: (h) => {
    if (!h.lineaBase) return sinMedir("el punto de partida");
    if (!h.numeros) return sinMedir("cuántos números están comprobados");
    const det = `${h.lineaBase.vigente ? "punto de partida congelado" : "sin punto de partida congelado"}; ${h.numeros.comprobados} número(s) comprobado(s) (se piden 3)`;
    return juicio(h.lineaBase.vigente && h.numeros.comprobados >= 3, det);
  },
  plan: (h) => {
    if (h.planAceptado == null) return sinMedir("el acta del plan");
    return juicio(h.planAceptado, h.planAceptado ? "el plan tiene su acta de aceptación" : "el plan todavía no tiene acta de aceptación");
  },
  indicadores: (h) => {
    if (!h.indicadores) return sinMedir("los indicadores");
    const { activos, listos } = h.indicadores;
    if (activos === 0) return juicio(false, "no hay indicadores activos");
    return juicio(listos === activos, `${listos} de ${activos} activos con fuente, responsable, punto de partida, meta y umbral`);
  },
  anotados: (h) => {
    if (!h.indicadores) return sinMedir("los indicadores");
    const { activos, conValorReciente } = h.indicadores;
    if (activos === 0) return juicio(false, "no hay indicadores activos");
    return juicio(conValorReciente / activos >= 0.8, `${conValorReciente} de ${activos} activos con un valor en los últimos 14 días (se pide el 80 %)`);
  },
  revision: (h) => {
    if (!h.revisiones) return sinMedir("las revisiones semanales");
    const { esperadas, revisadas } = h.revisiones;
    return juicio(revisadas >= esperadas - 1, `${revisadas} de ${esperadas} semanas revisadas desde el día 8`);
  },
  plan_cumplido: (h) => {
    if (!h.plan) return sinMedir("el plan");
    const { aprobadas, consideradas, verificadasATiempo } = h.plan;
    if (aprobadas === 0) return juicio(false, "el plan no tiene acciones aprobadas");
    // Ninguna verificada y ninguna vencida: no hay resultado todavía. Es «falta» por resultados, no por una fecha.
    if (consideradas === 0) return juicio(false, `${aprobadas} ${aprobadas === 1 ? "acción aprobada" : "acciones aprobadas"}; ninguna verificada todavía`);
    return juicio(
      verificadasATiempo / consideradas >= 0.7,
      `${verificadasATiempo} de ${consideradas} acciones verificadas a tiempo, contando las que ya vencieron y las que ya se verificaron (${pctDe(verificadasATiempo, consideradas)} %; se pide el 70 %)`
    );
  },
  organigrama: (h) => {
    if (!h.organigrama) return sinMedir("el organigrama");
    const { puestos, documentoConfirmado } = h.organigrama;
    return juicio(puestos >= 2 && documentoConfirmado, `${puestos} puesto(s); ${documentoConfirmado ? "organigrama o funciones confirmados" : "organigrama y funciones sin confirmar"}`);
  },
  escritos: (h) => {
    if (!h.procesos) return sinMedir("los procesos");
    const { dibujados, conSop } = h.procesos;
    if (dibujados === 0) return juicio(false, "no hay procesos dibujados");
    return juicio(conSop === dibujados, `${conSop} de ${dibujados} procesos dibujados con su procedimiento escrito`);
  },
  con_indicador: (h) => {
    if (!h.procesos) return sinMedir("los procesos");
    const { dibujados, conIndicador } = h.procesos;
    if (dibujados === 0) return juicio(false, "no hay procesos dibujados");
    return juicio(conIndicador === dibujados, `${conIndicador} de ${dibujados} procesos dibujados con su indicador`);
  },
  cortes: (h) => {
    if (!h.cortes) return sinMedir("los cortes");
    const { mesesCerrados, congelados } = h.cortes;
    return juicio(congelados >= mesesCerrados, `${congelados} corte(s) congelado(s) de ${mesesCerrados} mes(es) cerrado(s) en esta etapa`);
  },
};

function evaluarCriterio(e: DefEtapa, c: DefCriterio, h: HechosRuta): CriterioEvaluado {
  let j: Juicio;
  if (c.fuente === "marca") {
    const marca = h.marcas[`${e.clave}.${c.clave}`];
    if (marca?.valor === "cumple") j = { estado: "hecho", detalle: marca.nota ? `la consultora marcó que cumple: ${marca.nota}` : "la consultora marcó que cumple" };
    else if (marca?.valor === "no_cumple") j = { estado: "falta", detalle: marca.nota ? `la consultora marcó que no cumple: ${marca.nota}` : "la consultora marcó que no cumple" };
    else j = { estado: "falta", detalle: "la consultora todavía no lo marca" };
  } else {
    const medir = MEDIDOS[c.clave];
    j = medir ? medir(h) : sinMedir(c.texto);
  }
  return { clave: c.clave, texto: c.texto, fuente: c.fuente, ...j };
}

/** El color que 8X sugiere para una compuerta. Lo que no pudo leer nunca sale en verde. */
function sugerir(criterios: CriterioEvaluado[], pct: number | null): EtapaEvaluada["compuerta"]["sugerido"] {
  if (pct == null || criterios.some((c) => c.estado === "sin_medir")) return "no_se_pudo_leer";
  const medibles = criterios.filter((c) => c.estado !== "no_aplica");
  if (medibles.every((c) => c.estado === "hecho")) return "verde";
  return pct >= 75 ? "ambar" : "rojo";
}

const veredictoDe = (marca: Marca | undefined): "verde" | "ambar" | "rojo" | null =>
  marca && (marca.valor === "verde" || marca.valor === "ambar" || marca.valor === "rojo") ? marca.valor : null;

/**
 * El avance de la ruta. Una etapa es «pasada» solo con el veredicto verde de la consultora y si las anteriores
 * también lo son; la primera que no lo es está «en curso» y las demás «por venir». El día no cambia ningún estado:
 * solo produce el aviso de que la etapa va más larga de lo previsto.
 */
export function avanceRuta(h: HechosRuta, hoy: Date): AvanceRuta {
  const dia = diaDeRuta(h.inicio, hoy, h.zona);
  if (!h.tipo) return { tipo: null, inicio: h.inicio, dia, etapas: [], actual: null, aviso: AVISO_SIN_TIPO, faltaParaLaCompuerta: [] };

  let anteriorPasada = true;
  let actual: ClaveEtapa | null = null;
  const etapas: EtapaEvaluada[] = etapasDe(h.tipo).map((e) => {
    const criterios = e.criterios.map((c) => evaluarCriterio(e, c, h));
    const medibles = criterios.filter((c) => c.estado !== "no_aplica").length;
    const hechos = criterios.filter((c) => c.estado === "hecho").length;
    const sinMedirN = criterios.filter((c) => c.estado === "sin_medir").length;
    const pct = medibles ? Math.round((100 * hechos) / medibles) : null;
    const veredicto = veredictoDe(h.marcas[`${e.clave}.compuerta`]);
    let estado: EtapaEvaluada["estado"];
    if (anteriorPasada && veredicto === "verde") estado = "pasada";
    else if (anteriorPasada) {
      estado = "en_curso";
      actual = e.clave;
      anteriorPasada = false;
    } else estado = "por_venir";
    return {
      clave: e.clave, nombre: e.nombre, nombreDueno: e.nombreDueno, desdeDia: e.desdeDia, hastaDia: e.hastaDia,
      criterios, hechos, medibles, sinMedir: sinMedirN, pct,
      compuerta: { clave: e.compuerta, nombre: e.compuertaNombre, veredicto, sugerido: sugerir(criterios, pct) },
      estado,
    };
  });

  const enCurso = etapas.find((e) => e.estado === "en_curso") ?? null;
  let aviso: string | null = null;
  if (!h.inicio) aviso = AVISO_SIN_INICIO;
  else if (enCurso && dia != null && dia > enCurso.hastaDia) {
    const n = dia - enCurso.hastaDia;
    aviso = `Va ${n} ${n === 1 ? "día" : "días"} más de lo previsto para esta etapa`;
  }
  return {
    tipo: h.tipo,
    inicio: h.inicio,
    dia,
    etapas,
    actual,
    aviso,
    faltaParaLaCompuerta: enCurso ? enCurso.criterios.filter((c) => c.estado === "falta" || c.estado === "sin_medir") : [],
  };
}

/** Lo que ve el dueño: las etapas con su nombre, su estado y el %; sin criterios, sin notas, sin veredictos. */
export function vistaDueno(a: AvanceRuta): AvanceDueno {
  const enCurso = a.etapas.find((e) => e.clave === a.actual) ?? null;
  return {
    etapas: a.etapas.map((e) => ({ clave: e.clave, nombre: e.nombreDueno, estado: e.estado, pct: e.pct })),
    actual: a.actual,
    dia: a.dia,
    hastaDia: enCurso ? enCurso.hastaDia : null,
  };
}
