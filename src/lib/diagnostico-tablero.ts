/**
 * EL TABLERO DE DIAGNÓSTICO DE UNA EMPRESA (16-10-2026). Puro: arma con lo ya leído, sin base ni reloj.
 *
 * Kelin: «un tablero de diagnóstico por empresa y para mí la vista también: cómo está en procesos, cómo está en
 * dependencia del dueño, cómo está en dinero, cómo es su resultado de diagnóstico, y si hay alguna incongruencia el
 * dueño debe tener la forma de corregir datos… nada que maree». Aquí se arma ese tablero dos veces: para la
 * consultora (portada de la empresa) y para el dueño (Tu diagnóstico), con los mismos cuatro bloques y palabras
 * distintas. Lo que lee la base vive en diagnostico-datos.ts; aquí solo se cuenta y se nombra.
 *
 * REGLAS
 *  - null = no se pudo leer, y se dice así. Nunca se pinta como «vacío» ni como cero.
 *  - Lo que falta se nombra («sin dato», «aún por calcular»): ningún «S/ 0» que nadie contó.
 *  - Para el dueño: sin dimensiones, sin pilares, sin «Lo que falta» y sin el detalle de cada cifra (son trabajo de
 *    la consultora); solo conteos, nunca juicios sobre él.
 */
import { NIVEL, type Nivel } from "./madurez";
import type { MapaEmpresa } from "./mapa-empresa";
import { DIMENSIONES_DEPENDENCIA, NOMBRE_DIMENSION, dimensionConTexto, type ConteoProcesos, type Dimension, type DimensionClave } from "./ficha-direccion";
import { derivados, radiografia, CLAVES_VITALES, normalizarMetrica, periodoEnPalabras, type Metrica } from "./metricas";
import { tableroRentabilidad, type CostoMes, type FichaNegocio, type OperacionMoneda } from "./rentabilidad";
import type { LineaProducto } from "./producto";
import { textoRango } from "./dato-oral";
import { moneda, porDefecto, type ConfigEmpresa } from "./formato";
import { puntajePilar, procesosEsperados, avanceProcesos } from "./rules/evidencia";
import { bibliotecaEsperada } from "./biblioteca";
import { HECHO, A_MEDIO } from "./mercado";
import type { HechosRuta } from "./ruta";
import type { Seccion, Solicitud } from "./secciones";
import type { MetricaGuardada } from "./rules/contradiccion-numerica";
import { abiertasDe, incongruenciasDe, lineaDeCorreccion, type HechosIncongruencia, type Incongruencia } from "./incongruencias";

// ─── El contrato ─────────────────────────────────────────────────────────────────────────────────

export type Para = "consultora" | "dueno";

export type BloqueProcesos = {
  esperados: number;
  dibujados: number;
  conResponsable: number;
  escritos: number;
  medidos: number;
  nivel: number | null;
  nombreNivel: string | null;
  lista: { id: string; nombre: string; nivel: number; nombreNivel: string; siguiente: string | null }[];
  falta: string | null;
};
export type BloqueDependencia = {
  procesos: { total: number; conDueno: number; decideSolo: number } | null;
  frase: string | null;
  seDetiene: string[];
  dimensiones: { clave: DimensionClave; nombre: string; estado: "revisada" | "propuesta" | "sin_dato" }[] | null /* null para el dueño */;
  falta: string | null;
};
export type BloqueDinero = {
  numeros: { conCifra: number; comprobados: number; noLoSabe: number; total: 9 };
  /**
   * `porConfirmar`: hay un dato abierto que no cuadra sobre esta misma cifra (lo que le quedó ese mes, la venta de ese
   * mes). Revisión del 16-10-2026: «te quedan S/ 3,000» salía como hecho justo encima de «esa cifra no cuadra».
   */
  quedaAlMes: { valor: number; periodo: string; provisional: boolean; porConfirmar: boolean } | null;
  venta: { valor: number; periodo: string; porConfirmar: boolean } | null;
  serie: { periodo: string; valor: number | null }[];
  equilibrio: number | null;
  equilibrioProvisional: boolean;
  /** Por qué no hay equilibrio de la empresa, en palabras del dueño. null si lo hay. */
  equilibrioMotivo: string | null;
  /** Venta del mes − equilibrio. Solo con el equilibrio de la empresa. */
  sobreEquilibrio: number | null;
  caja: number | null;
  diasAguante: number | null;
  teDeben: number | null;
  /** Lo que le quedó sobre lo que vendió, en %. */
  margen: number | null;
  /** Qué cifras se apoyan en algo leído de un documento sin revisar: van con ROTULO_CIFRA_PROVISIONAL al lado. */
  provisional: { margen: boolean; diasAguante: boolean };
  seEscapa: { que: string; texto: string }[];
  /** Si la empresa cobra en otra moneda o vende al crédito (si no, «se escapa» no aplica: no es un cero). null = no se pudo leer. */
  seEscapaAplica: boolean | null;
  /** Si falta el gasto fijo: sin él no hay «cuánto aguantas» ni equilibrio. */
  faltaGastoFijo: boolean;
  falta: string | null;
};
export type BloqueResultado = {
  publicado: boolean;
  restriccion: { titulo: string; monto: string | null; porCorroborar: boolean } | null;
  salud: number | null;
  pilares: { pilar: string; estado: string | null; puntaje: number | null; confirmadas: number; total: number }[] | null /* null para el dueño */;
  enTreintaDias: string[];
  falta: string | null;
};
export type ItemFalta = {
  clave: string;
  texto: string;
  porque: string;
  seccion: Seccion | null;
  /** La subruta de la consultora donde se ve («/numeros», «#incongruencias»); la pantalla le antepone su base. */
  href: string;
  pedido: { estado: "activa" | "completada"; desde: string } | null;
};
export type TableroDiagnostico = {
  para: Para;
  frase: string;
  monto: string | null;
  incongruencias: Incongruencia[];
  /** El rastro de lo corregido, una línea por cambio, lo más reciente primero. */
  cambios: string[];
  procesos: BloqueProcesos;
  dependencia: BloqueDependencia;
  dinero: BloqueDinero;
  resultado: BloqueResultado;
  loQueFalta: ItemFalta[] /* vacío para el dueño */;
  config: ConfigEmpresa;
};

/** Lo que entra a los puntajes por área: lo mismo que contaba el Panorama, movido sin cambiar la cuenta. */
export type EntradaPuntajes = {
  diagnosticos: { pilar: string; estado: string }[];
  claims: { pilar: string | null; estado: string }[];
  /** Hallazgos vigentes (no rechazados). */
  hallazgos: { pilar: string; impacto: string | null; requiere_validacion: boolean | null; filtros: unknown }[];
  /** Procesos «as_is», con si el dueño los confirmó. */
  procesos: { confirmacion: string | null }[];
  activos: { clave: string; estado: string | null }[];
  personas: number | null;
};

export type HechosDependencia = {
  /** De la ficha de dirección si ya lo trae; si no, contado con los procesos de hoy. null = no se pudo leer. */
  conteo: ConteoProcesos | null;
  /** Consultora: las del borrador (o de la acordada). Dueño: null, nunca. */
  dimensiones: Record<DimensionClave, Dimension> | null;
  /** Lo que el dueño dijo que se detiene sin él. Al dueño, solo lo de la ficha acordada. */
  seDetiene: string[];
};

export type HechosResultado = {
  puntajes: EntradaPuntajes | null;
  restricciones: { titulo: string; monto: string | null; porCorroborar: boolean }[] | null;
  /** Dueño: la regla de Inicio (empresaHoy). Consultora: si hay algún área diagnosticada. null = no se pudo leer. */
  publicado: boolean | null;
  /** Hasta 3 acciones en marcha del plan. */
  enMarcha: string[] | null;
};

export type HechosNegocio = { lineas: LineaProducto[]; costos: CostoMes[]; ficha: FichaNegocio; operaciones: OperacionMoneda[] };

/** Todo lo que el tablero necesita, ya leído. Cada campo null = no se pudo leer (nunca «vacío»). */
export type HechosDiagnostico = {
  para: Para;
  config: ConfigEmpresa;
  admitida: boolean | null;
  procesos: Omit<BloqueProcesos, "falta"> | null;
  dependencia: HechosDependencia | null;
  metricas: MetricaGuardada[] | null;
  negocio: HechosNegocio | null;
  incongruencias: HechosIncongruencia | null;
  resultado: HechosResultado | null;
  ruta: Pick<HechosRuta, "productos" | "costos" | "historia" | "organigrama"> | null;
  solicitudes: Solicitud[] | null;
  /** Afirmaciones contradichas o sin verificar con prioridad de validación. */
  porConfirmar: number | null;
};

// ─── Procesos ────────────────────────────────────────────────────────────────────────────────────

/** ¿Ya se dijo quién responde? Nivel 2 lo exige; en nivel 1, si lo que falta no lo nombra, ya se dijo. */
const tieneResponsable = (nivel: number, siguiente: string | null) => nivel >= 2 || (nivel === 1 && !/quién responde/.test(siguiente ?? ""));

/**
 * Cuántos procesos espera su tamaño, cuántos están dibujados (nivel 1 o más: un proceso con menos de dos pasos no está
 * dibujado), con responsable, escritos (nivel 3+) y medidos (nivel 4+). Lo usa también la vista Estructura.
 */
export function conteoProcesos(mapa: MapaEmpresa | null): Omit<BloqueProcesos, "falta"> {
  if (!mapa) return { esperados: 0, dibujados: 0, conResponsable: 0, escritos: 0, medidos: 0, nivel: null, nombreNivel: null, lista: [] };
  const lista = mapa.procesos.map((p) => ({ id: p.id, nombre: p.nombre, nivel: p.evaluacion.nivel as number, nombreNivel: p.evaluacion.nombre, siguiente: p.evaluacion.siguiente }));
  const dibujados = lista.filter((p) => p.nivel >= 1);
  const esperados = Math.max(mapa.empresa.esperados, dibujados.length);
  const hayAlgo = esperados > 0 || lista.length > 0;
  return {
    esperados,
    dibujados: dibujados.length,
    conResponsable: lista.filter((p) => tieneResponsable(p.nivel, p.siguiente)).length,
    escritos: lista.filter((p) => p.nivel >= 3).length,
    medidos: lista.filter((p) => p.nivel >= 4).length,
    nivel: hayAlgo ? mapa.empresa.nivel : null,
    nombreNivel: hayAlgo ? mapa.empresa.nombre : null,
    lista: [...lista].sort((a, b) => b.nivel - a.nivel || a.nombre.localeCompare(b.nombre)),
  };
}

/** El nombre de un nivel 0–5. */
export const nombreDeNivel = (n: number) => NIVEL.get(Math.max(0, Math.min(5, Math.floor(n))) as Nivel)?.nombre ?? "";

function bloqueProcesos(p: HechosDiagnostico["procesos"], para: Para): BloqueProcesos {
  if (!p) return { ...conteoProcesos(null), falta: "No se pudo leer el mapa de procesos" };
  let falta: string | null = null;
  if (p.dibujados === 0) falta = para === "dueno" ? "Todavía no dibujamos tus procesos" : "Todavía no hay procesos dibujados";
  else if (p.dibujados < p.esperados) falta = `${p.esperados - p.dibujados} por dibujar`;
  return { ...p, falta };
}

// ─── Dependencia ─────────────────────────────────────────────────────────────────────────────────

/**
 * LA DEPENDENCIA SE CUENTA SOBRE LOS MISMOS PROCESOS QUE «TUS PROCESOS» (revisión del 16-10-2026). El conteo de la ficha
 * se congela al acordarla y contaba todo proceso «as_is», también los de menos de dos pasos; el bloque de procesos
 * cuenta solo los dibujados (nivel 1 o más). Lado a lado decían «4 de 21 dibujados» y «hemos dibujado 5». Si los
 * nombres del conteo están todos en el mapa de hoy, se cuenta sobre los dibujados; si no (la ficha se acordó con otros
 * nombres), se deja el conteo como está: no se inventa una cuenta que no se puede rehacer.
 */
export function dependenciaSobreDibujados(c: ConteoProcesos, p: Omit<BloqueProcesos, "falta"> | null): ConteoProcesos {
  if (!p || !p.lista.length || c.total === 0) return c;
  if (c.nombres_con_dueno.length !== c.con_dueno || c.nombres_decide_solo.length !== c.decide_solo) return c;
  const todos = new Set(p.lista.map((x) => x.nombre));
  if (![...c.nombres_con_dueno, ...c.nombres_decide_solo].every((n) => todos.has(n))) return c;
  const dibujados = new Set(p.lista.filter((x) => x.nivel >= 1).map((x) => x.nombre));
  if (!dibujados.size) return c;
  const con = c.nombres_con_dueno.filter((n) => dibujados.has(n));
  const solo = c.nombres_decide_solo.filter((n) => dibujados.has(n));
  return { ...c, total: dibujados.size, con_dueno: con.length, decide_solo: solo.length, nombres_con_dueno: con, nombres_decide_solo: solo };
}

/** Lo mismo, dicho al dueño, sin repetir el total (ya lo dice «Tus procesos» al lado). Solo cuenta: no califica. */
export function textoDependenciaDueno(c: ConteoProcesos): string | null {
  if (!c.total) return null;
  if (!c.con_dueno) return "En ninguno figuras tú como la persona que hace el trabajo.";
  const decide = c.decide_solo ? ` y en ${c.decide_solo} eres la única persona que decide` : "";
  return `Estás en ${c.con_dueno} ${c.con_dueno === 1 ? "proceso" : "procesos"}${decide}.`;
}

function bloqueDependencia(d: HechosDependencia | null, para: Para, procesos: Omit<BloqueProcesos, "falta"> | null = null): BloqueDependencia {
  if (!d) return { procesos: null, frase: null, seDetiene: [], dimensiones: para === "dueno" ? null : [], falta: "No se pudo leer en cuántos procesos participa el dueño" };
  const c = d.conteo ? dependenciaSobreDibujados(d.conteo, procesos) : null;
  const dimensiones =
    para === "dueno"
      ? null
      : DIMENSIONES_DEPENDENCIA.map((clave) => {
          const dim = d.dimensiones?.[clave];
          const revisada = !!dim && (dim.origen === "consultor" || !!dim.revisado_por);
          const estado = !dimensionConTexto(dim) ? ("sin_dato" as const) : revisada ? ("revisada" as const) : ("propuesta" as const);
          return { clave, nombre: NOMBRE_DIMENSION[clave], estado };
        });
  if (!c) return { procesos: null, frase: null, seDetiene: d.seDetiene, dimensiones, falta: "No se pudo leer en cuántos procesos participa el dueño" };
  const falta = c.total === 0 ? (para === "dueno" ? "Cuando dibujemos tus procesos, aquí verás en cuántos participas tú" : "Hacen falta procesos dibujados para contar") : null;
  return {
    procesos: { total: c.total, conDueno: c.con_dueno, decideSolo: c.decide_solo },
    frase: para === "dueno" ? textoDependenciaDueno(c) : c.total ? c.texto.charAt(0).toUpperCase() + c.texto.slice(1) : null,
    seDetiene: d.seDetiene,
    dimensiones,
    falta,
  };
}

// ─── Dinero ──────────────────────────────────────────────────────────────────────────────────────

const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** numeric de Postgres llega como texto; una cadena vacía no es cero. */
function aNumero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Las filas guardadas como las leen radiografia y derivados (valor numérico, periodo con su forma). */
export function comoMetricas(m: MetricaGuardada[]): Metrica[] {
  return m.map((x) => ({ clave: x.clave, periodo: x.periodo ?? "actual", valor: aNumero(x.valor), estado: x.estado ?? null }));
}

/** El periodo AAAA-MM de `p` más `k` meses. */
function sumarMeses(p: string, k: number): string {
  const total = Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1 + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Lo más reciente de una clave con cifra (un mes con nombre manda; «hoy» solo si no hay ninguno). */
function masReciente(metricas: Metrica[], clave: string): { valor: number; periodo: string; estado: string | null } | null {
  const c = metricas
    .map((m) => ({ n: normalizarMetrica(m.clave, m.periodo), m }))
    .filter(({ n, m }) => n.clave === clave && n.periodo !== "epoca_dorada" && m.valor != null && m.estado !== "descartado");
  if (!c.length) return null;
  c.sort((a, b) => (b.n.periodo === "actual" ? "" : b.n.periodo).localeCompare(a.n.periodo === "actual" ? "" : a.n.periodo));
  return { valor: Number(c[0]!.m.valor), periodo: c[0]!.n.periodo, estado: (c[0]!.m.estado as string | null | undefined) ?? null };
}

/** Las ventas mes a mes, del primero al último con venta: un mes sin venta contada queda como hueco, no como cero. */
export function serieDeMeses(metricas: Metrica[]): { periodo: string; valor: number | null }[] {
  const porMes = new Map<string, number>();
  for (const m of metricas) {
    const n = normalizarMetrica(m.clave, m.periodo);
    if (n.clave !== "venta_mes" || !ES_MES.test(n.periodo) || m.valor == null || m.estado === "descartado") continue;
    porMes.set(n.periodo, Number(m.valor));
  }
  const meses = [...porMes.keys()].sort();
  if (!meses.length) return [];
  const desde = meses.length > 12 ? meses[meses.length - 12]! : meses[0]!;
  const salida: { periodo: string; valor: number | null }[] = [];
  for (let p = desde; p <= meses[meses.length - 1]!; p = sumarMeses(p, 1)) salida.push({ periodo: p, valor: porMes.get(p) ?? null });
  return salida;
}

/** ¿Hay un dato abierto que no cuadra sobre esta cifra? Una incongruencia sin periodo vale para cualquiera. */
function enDuda(abiertas: Incongruencia[], clave: string, periodo: string): boolean {
  return abiertas.some((i) => i.clave === clave && (i.periodo == null || i.periodo === periodo));
}

function bloqueDinero(h: HechosDiagnostico, abiertas: Incongruencia[] = []): BloqueDinero {
  const vacio: BloqueDinero = {
    numeros: { conCifra: 0, comprobados: 0, noLoSabe: 0, total: 9 }, quedaAlMes: null, venta: null, serie: [], equilibrio: null, equilibrioProvisional: false,
    equilibrioMotivo: null, sobreEquilibrio: null, caja: null, diasAguante: null, teDeben: null, margen: null, provisional: { margen: false, diasAguante: false },
    seEscapa: [], seEscapaAplica: null, faltaGastoFijo: false, falta: "No se pudieron leer los números de la empresa",
  };
  if (!h.metricas) return vacio;
  const metricas = comoMetricas(h.metricas);
  const r = radiografia(metricas);
  const d = derivados(metricas);
  const conCifra = new Set<string>();
  const comprobados = new Set<string>();
  for (const m of metricas) {
    const n = normalizarMetrica(m.clave, m.periodo);
    if (!CLAVES_VITALES.has(n.clave) || m.valor == null || m.estado === "descartado") continue;
    conCifra.add(n.clave);
    if (m.estado === "verificado") comprobados.add(n.clave);
  }
  const ganancia = masReciente(metricas, "ganancia_mes");
  const venta = masReciente(metricas, "venta_mes");
  const caja = masReciente(metricas, "caja_hoy");
  const teDeben = masReciente(metricas, "deuda_clientes");
  const gastoFijo = masReciente(metricas, "gasto_fijo_mes");

  // Lo que se escapa: el cambio de moneda y lo que no se cobra del crédito, solo si el módulo está encendido y hay cifra.
  const seEscapa: { que: string; texto: string }[] = [];
  let seEscapaAplica: boolean | null = null;
  if (h.negocio) {
    const t = tableroRentabilidad({ lineas: [], costos: [], ficha: h.negocio.ficha, operaciones: h.negocio.operaciones, metricas, config: h.config });
    seEscapaAplica = t.moneda != null || t.credito != null;
    const plata = (n: number) => escribirMoneda(n, h.config);
    const mes = t.moneda?.resumen.valor?.mes_estimado ?? null;
    if (mes && mes.alto > 0) seEscapa.push({ que: "moneda", texto: `${textoRango(mes, plata)} al mes en el cambio de moneda` });
    const credito = t.credito?.valor?.perdida_mes ?? null;
    if (credito && credito.alto > 0) seEscapa.push({ que: "credito", texto: `${textoRango(credito, plata)} al mes que no se cobra del crédito` });
  }

  const sinVenta = conCifra.size === 0 && r.sinDato.length === 0;
  return {
    numeros: { conCifra: conCifra.size, comprobados: comprobados.size, noLoSabe: r.sinDato.length, total: 9 },
    quedaAlMes: ganancia
      ? { valor: ganancia.valor, periodo: ganancia.periodo, provisional: ganancia.estado === "extraido", porConfirmar: enDuda(abiertas, "ganancia_mes", ganancia.periodo) }
      : null,
    venta: venta ? { valor: venta.valor, periodo: venta.periodo, porConfirmar: enDuda(abiertas, "venta_mes", venta.periodo) } : null,
    serie: serieDeMeses(metricas),
    equilibrio: d.equilibrio,
    equilibrioProvisional: d.provisional.equilibrio,
    equilibrioMotivo: d.equilibrio == null ? d.detalle.equilibrio.motivo_nulo ?? null : null,
    sobreEquilibrio: d.sobreEquilibrio,
    caja: caja?.valor ?? null,
    diasAguante: d.diasAguante,
    teDeben: teDeben?.valor ?? null,
    margen: d.margen,
    provisional: { margen: d.provisional.margen, diasAguante: d.provisional.diasAguante },
    seEscapa,
    seEscapaAplica,
    faltaGastoFijo: !gastoFijo || gastoFijo.valor <= 0,
    falta: sinVenta ? (h.para === "dueno" ? "Todavía no nos contaste tus números" : "Todavía no hay ninguno de los 9 números") : r.faltan.length ? `Faltan ${r.faltan.length} de los 9 números` : null,
  };
}

/** Un monto en la moneda de la empresa; si su configuración no se entiende, en soles. */
function escribirMoneda(n: number, config: ConfigEmpresa): string {
  try {
    return moneda(n, config);
  } catch {
    return moneda(n, porDefecto);
  }
}

// ─── Resultado ───────────────────────────────────────────────────────────────────────────────────

const PILARES = ["personas", "procesos", "producto", "marketing"] as const;

/**
 * El puntaje de cada área, la misma cuenta que hacía el Panorama: lo que se SABE (techo por afirmaciones confirmadas),
 * lo que se VIO (hallazgos vigentes) y lo CONSTRUIDO de lo que su tamaño exige (biblioteca y, en procesos, dibujados y
 * confirmados). Un área sin diagnóstico no tiene puntaje: «—», nunca cero.
 */
export function puntajesPorPilar(e: EntradaPuntajes): BloqueResultado["pilares"] {
  const conteo: Record<string, { total: number; confirmadas: number }> = {};
  for (const cl of e.claims) {
    const k = cl.pilar ?? "transversal";
    conteo[k] = conteo[k] ?? { total: 0, confirmadas: 0 };
    conteo[k].total++;
    if (cl.estado === "confirmado") conteo[k].confirmadas++;
  }
  const dibujados = e.procesos.length;
  const confirmadosDueno = e.procesos.filter((x) => x.confirmacion === "confirmado").length;
  const estadoDoc = new Map(e.activos.map((a) => [a.clave, a.estado ?? ""]));
  const avanceDocs = (p: string): number | null => {
    const esperadas = bibliotecaEsperada(e.personas).filter((c) => c.startsWith(`${p}.`));
    if (!esperadas.length) return null; // a este tamaño no se le exige nada aquí: no se castiga.
    const puntos = esperadas.reduce((a, c) => a + (HECHO.has(estadoDoc.get(c) ?? "") ? 1 : A_MEDIO.has(estadoDoc.get(c) ?? "") ? 0.5 : 0), 0);
    return Math.round((100 * puntos) / esperadas.length);
  };
  const puntajeDe = (p: string) => {
    const docs = avanceDocs(p);
    const construccion =
      p === "procesos" ? Math.round((avanceProcesos(dibujados, confirmadosDueno, procesosEsperados(e.personas)) + (docs ?? 0)) / (docs == null ? 1 : 2)) : docs;
    return puntajePilar(
      e.hallazgos.filter((h) => h.pilar === p).map((h) => ({ impacto: h.impacto, requiere_validacion: h.requiere_validacion, preserva: !!(h.filtros as { preserva?: boolean } | null)?.preserva })),
      conteo[p]?.confirmadas ?? 0,
      construccion
    );
  };
  return PILARES.map((p) => {
    const d = e.diagnosticos.find((x) => x.pilar === p);
    const n = conteo[p] ?? { total: 0, confirmadas: 0 };
    return { pilar: p, estado: d?.estado ?? null, puntaje: d && d.estado !== "desconocido" ? puntajeDe(p) : null, confirmadas: n.confirmadas, total: n.total };
  });
}

/** La salud con evidencia: el promedio de los puntajes de las áreas diagnosticadas. Sin ninguna, null. */
export function saludDe(pilares: NonNullable<BloqueResultado["pilares"]>): number | null {
  const con = pilares.filter((p) => p.puntaje != null).map((p) => p.puntaje as number);
  return con.length ? Math.round(con.reduce((a, b) => a + b, 0) / con.length) : null;
}

function bloqueResultado(r: HechosResultado | null, para: Para): BloqueResultado {
  if (!r) return { publicado: false, restriccion: null, salud: null, pilares: para === "dueno" ? null : [], enTreintaDias: [], falta: "No se pudo leer el diagnóstico" };
  const pilares = para === "dueno" || !r.puntajes ? null : puntajesPorPilar(r.puntajes);
  const diagnosticado = !!pilares && pilares.some((p) => p.puntaje != null);
  const publicado = para === "dueno" ? r.publicado === true : r.publicado ?? diagnosticado;
  // La restricción: primero la crítica con evidencia; si no hay, la grave por corroborar. Al dueño, solo publicada.
  const lista = [...(r.restricciones ?? [])].sort((a, b) => Number(a.porCorroborar) - Number(b.porCorroborar));
  const restriccion = para === "dueno" && !publicado ? null : lista[0] ?? null;
  let falta: string | null = null;
  if (para === "dueno") falta = publicado ? null : "Tu consultora está terminando tu diagnóstico";
  else if (!r.puntajes) falta = "No se pudieron leer las áreas del diagnóstico";
  else if (!diagnosticado) falta = "Corre el diagnóstico en Hallazgos";
  return {
    publicado,
    restriccion,
    salud: pilares ? saludDe(pilares) : null,
    pilares: para === "dueno" ? null : pilares ?? [],
    enTreintaDias: (r.enMarcha ?? []).slice(0, 3),
    falta,
  };
}

// ─── Lo que falta levantar o validar ─────────────────────────────────────────────────────────────

/** El pedido de una sección: el activo, o el último completado. */
function pedidoDe(solicitudes: Solicitud[] | null, seccion: Seccion | null): ItemFalta["pedido"] {
  if (!solicitudes || !seccion) return null;
  const deEsta = solicitudes.filter((s) => s.seccion === seccion);
  const activa = deEsta.find((s) => s.estado === "activa");
  if (activa) return { estado: "activa", desde: activa.activada_at };
  const completada = deEsta.filter((s) => s.estado === "completada" && s.completada_at).sort((a, b) => String(b.completada_at).localeCompare(String(a.completada_at)))[0];
  return completada ? { estado: "completada", desde: completada.completada_at as string } : null;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const enLista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * LO QUE FALTA, EN ORDEN FIJO: entra el primero que aplique hasta llenar `max` (5). Lo que no se pudo leer no entra:
 * no se le pide al cliente lo que quizá ya dio. Para el dueño, nada: esta lista es trabajo de la consultora.
 */
export function loQueFalta(h: HechosDiagnostico, max = 5): ItemFalta[] {
  if (h.para === "dueno") return [];
  const items: Omit<ItemFalta, "pedido">[] = [];
  const pon = (i: Omit<ItemFalta, "pedido">) => items.push(i);

  const abiertas = h.incongruencias ? abiertasDe(incongruenciasDe(h.incongruencias)).length : 0;
  if (abiertas > 0)
    pon({ clave: "incongruencias", texto: `${plural(abiertas, "dato no cuadra", "datos no cuadran")}`, porque: "El dueño los corrige en un minuto desde Tu diagnóstico.", seccion: "corroborar_diagnostico", href: "#incongruencias" });

  if (h.metricas) {
    const r = radiografia(comoMetricas(h.metricas));
    if (r.faltan.length > 0) {
      const nombres = r.faltan.slice(0, 3).map((v) => v.nombre.toLowerCase());
      pon({ clave: "numeros", texto: `Faltan ${r.faltan.length} de los 9 números`, porque: `Entre ellos: ${enLista(nombres)}${r.faltan.length > 3 ? "…" : "."}`, seccion: "datos_faltantes", href: "/numeros" });
    }
  }

  const ruta = h.ruta;
  if (ruta?.productos) {
    const { lineas, completas } = ruta.productos;
    if (lineas === 0) pon({ clave: "productos", texto: "Falta la tabla de lo que vende", porque: "Sin precio, costo y cuánto se vende de cada cosa no hay margen por producto.", seccion: "productos", href: "/producto" });
    else if (completas < lineas)
      pon({ clave: "productos", texto: `${lineas - completas} de ${plural(lineas, "producto", "productos")} sin datos completos`, porque: "Les falta el precio, el costo o cuánto se vende en un mes normal.", seccion: "productos", href: "/producto" });
  }
  if (ruta?.costos && ruta.costos.conMonto === 0)
    pon({ clave: "costos", texto: "Faltan los gastos del mes", porque: "Sin lo que paga sí o sí cada mes no hay punto de equilibrio con su tabla.", seccion: "costos", href: "/producto" });
  if (ruta?.historia && ruta.historia.respondidas < 5)
    pon({ clave: "historia", texto: `Historia del negocio: ${ruta.historia.respondidas} de 5 respuestas`, porque: "Su mejor época y cuándo empezó a bajar: el punto de comparación de todo lo demás.", seccion: "historia", href: "/numeros" });

  if (h.procesos && h.procesos.dibujados < h.procesos.esperados)
    pon({
      clave: "procesos",
      texto: `${h.procesos.dibujados} de ${plural(h.procesos.esperados, "proceso dibujado", "procesos dibujados")}`,
      porque: `Una empresa de su tamaño necesita al menos ${h.procesos.esperados} para no depender de la memoria de nadie.`,
      seccion: "subir_procesos",
      href: "/procesos",
    });
  if (ruta?.organigrama && ruta.organigrama.puestos === 0 && !ruta.organigrama.documentoConfirmado)
    pon({ clave: "organigrama", texto: "Falta el organigrama", porque: "Sin puestos no se ve quién responde por qué.", seccion: "subir_organigrama", href: "/organigrama" });

  if (h.porConfirmar != null && h.porConfirmar > 0)
    pon({ clave: "por_confirmar", texto: `${plural(h.porConfirmar, "punto por confirmar", "puntos por confirmar")}`, porque: "Afirmaciones contradichas o marcadas para validar con el dueño.", seccion: "corroborar_diagnostico", href: "/afirmaciones?estado=contradicho" });

  const puntajes = h.resultado?.puntajes;
  if (puntajes) {
    const flacos = puntajesPorPilar(puntajes)!.filter((p) => p.confirmadas < 5);
    if (flacos.length)
      pon({
        clave: "evidencia",
        texto: `Poca evidencia en ${enLista(flacos.map((p) => NOMBRE_PILAR_CORTO[p.pilar] ?? p.pilar))}`,
        porque: "Menos de 5 afirmaciones confirmadas: el diagnóstico de esa área pisa débil. Preguntar en la entrevista.",
        seccion: null,
        href: "/entrevista",
      });
  }

  return items.slice(0, max).map((i) => ({ ...i, pedido: pedidoDe(h.solicitudes, i.seccion) }));
}

const NOMBRE_PILAR_CORTO: Record<string, string> = { personas: "personas", procesos: "procesos", producto: "producto", marketing: "marketing" };

// ─── Todo junto ──────────────────────────────────────────────────────────────────────────────────

/**
 * «Tu empresa hoy vende S/ 41,800 al mes (setiembre de 2026), te quedan S/ 3,200 y participas en 3 de 5 procesos.»
 * Una cifra que no cuadra no entra en la frase: se dice abajo, en «Datos para corregir», y no arriba como un hecho.
 */
function fraseDelDueno(dinero: BloqueDinero, dep: BloqueDependencia, config: ConfigEmpresa): string {
  const partes: string[] = [];
  if (dinero.venta && !dinero.venta.porConfirmar) partes.push(`vende ${escribirMoneda(dinero.venta.valor, config)} al mes${ES_MES.test(dinero.venta.periodo) ? ` (${periodoEnPalabras(dinero.venta.periodo)})` : ""}`);
  if (dinero.quedaAlMes && !dinero.quedaAlMes.porConfirmar) partes.push(`te quedan ${escribirMoneda(dinero.quedaAlMes.valor, config)}`);
  if (dep.procesos && dep.procesos.total > 0) partes.push(`participas en ${dep.procesos.conDueno} de ${plural(dep.procesos.total, "proceso", "procesos")}`);
  if (!partes.length) return "Todavía estamos reuniendo lo que hace falta para leer tu empresa.";
  return `Tu empresa hoy ${enLista(partes)}.`;
}

export function armarDiagnostico(h: HechosDiagnostico, para: Para): TableroDiagnostico {
  const config = h.config ?? porDefecto;
  const hechos: HechosDiagnostico = { ...h, para };
  const todas = h.incongruencias ? incongruenciasDe(h.incongruencias) : [];
  // Al dueño no le llega el detalle de trabajo de cada cifra (de qué documento, con qué fórmula).
  const incongruencias = para === "dueno" ? todas.map((i) => ({ ...i, izquierda: { ...i.izquierda, detalle: "" }, derecha: i.derecha ? { ...i.derecha, detalle: "" } : null })) : todas;
  const cambios = h.incongruencias
    ? [...h.incongruencias.correcciones].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map((c) => lineaDeCorreccion(c, config))
    : [];

  const procesos = bloqueProcesos(h.procesos, para);
  const dependencia = bloqueDependencia(h.dependencia, para, h.procesos);
  const dinero = bloqueDinero(hechos, abiertasDe(todas));
  const resultado = bloqueResultado(h.resultado, para);

  let frase: string;
  let monto: string | null = null;
  if (para === "dueno") frase = fraseDelDueno(dinero, dependencia, config);
  else if (resultado.restriccion) {
    frase = resultado.restriccion.titulo;
    monto = resultado.restriccion.monto;
  } else frase = "Todavía no hay una restricción con evidencia";

  return {
    para,
    frase,
    monto,
    incongruencias,
    cambios,
    procesos,
    dependencia,
    dinero,
    resultado,
    loQueFalta: loQueFalta(hechos),
    config,
  };
}
