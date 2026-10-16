/**
 * LO QUE VENDE LA EMPRESA (R9.3): las líneas de producto o servicio, lo que cada una deja y la decisión.
 *
 * La tabla `lineas_producto` (migracion-entrada-y-direccion.sql) guarda por línea: código, nombre, tipo
 * (producto o servicio), a quién sirve, qué necesidad cubre, qué promete, precio, costo variable por
 * unidad, unidades (o casos) del periodo, horas por unidad (servicios), periodo, origen del dato y la
 * decisión de la consultora con su motivo.
 *
 * Este módulo tiene dos mitades. La pura —evaluar, sugerir, leer un Excel, armar la vista previa de una
 * importación y el resumen para el dueño— no toca la base ni llama a la IA y es la que prueban los
 * tests. La otra lee y escribe la tabla con la service role, como procesos.ts.
 *
 * Reglas que no se negocian:
 *  1. La falta de dato nunca es cero: una celda vacía del Excel llega como null y se queda null.
 *  2. Los totales, la participación y la carga de horas contra la capacidad salen de finanzas.ts
 *     (costeoPorSku, costeoPorServicio). Por línea se aplica la misma fórmula (precio − costo; × unidades)
 *     porque costeoPorSku no devuelve detalle cuando ninguna línea está completa; donde finanzas.ts sí
 *     da el detalle, se usa el suyo, y una prueba comprueba que las dos cuentas coinciden.
 *  3. Dos líneas solo se suman si son del mismo periodo. La que es de otro periodo se muestra con sus
 *     propias cuentas y no entra en el total ni en la participación.
 *  4. La sugerencia es determinista y solo existe con datos completos; sin datos dice «sin datos para
 *     decidir». Nunca propone conservar, ampliar ni retirar: eso lo fija la consultora, con motivo.
 *  5. El dueño ve sus líneas, lo que prometen y lo que dejan en sus palabras; ninguna decisión, porque
 *     la tabla no distingue una decisión acordada con él de una que la consultora todavía está pensando.
 */
import { costeoPorSku, costeoPorServicio, type Calculo, type CosteoSku, type CosteoServicio, type Capacidad } from "./finanzas";
import { moneda as enMoneda, configDe, porDefecto, type ConfigEmpresa } from "./formato";
import { leerExcel, type Hoja, type ValorCelda } from "./documentos/excel";
import { supabaseAdmin } from "./supabase/admin";

// ─── Vocabulario cerrado (coincide con los checks de la migración) ──────────────────────────────────

export const TIPOS_LINEA = ["producto", "servicio"] as const;
export type TipoLinea = (typeof TIPOS_LINEA)[number];

export const DECISIONES = ["conservar", "mejorar", "ampliar", "reposicionar", "retirar"] as const;
export type Decision = (typeof DECISIONES)[number];

/** Cómo se le dice cada decisión a la consultora. El dueño no ve decisiones hasta que se acuerdan. */
export const DECISION_TEXTO: Record<Decision, string> = {
  conservar: "Conservar como está",
  mejorar: "Mejorar: precio, costo o cómo se entrega",
  ampliar: "Ampliar: vender más de esto",
  reposicionar: "Cambiar a quién o cómo se vende",
  retirar: "Retirar de la oferta",
};

export const ORIGENES_LINEA = ["declarado", "extraido", "conciliado"] as const;
export type OrigenLinea = (typeof ORIGENES_LINEA)[number];

export type LineaProducto = {
  id: string;
  company_id: string;
  codigo: string | null;
  nombre: string;
  tipo: TipoLinea;
  cliente_objetivo: string | null;
  necesidad: string | null;
  promesa: string | null;
  precio: number | null;
  costo_variable_unitario: number | null;
  /** Unidades vendidas (producto) o casos atendidos (servicio) en el periodo. */
  unidades_periodo: number | null;
  /** Solo servicios: horas que consume una unidad. */
  horas_por_unidad: number | null;
  periodo: string | null;
  origen: OrigenLinea | null;
  source_id: string | null;
  decision: Decision | null;
  decision_motivo: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Los campos que la consultora puede escribir. Lo que no venga no se toca; null borra a propósito. */
export type DatosLinea = Partial<Omit<LineaProducto, "id" | "company_id" | "created_at" | "updated_at">>;

const esNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Un número tal como llega de PostgREST (numeric → texto) o de una celda. Vacío es null, no cero; un
 * texto que no es número también es null, y quien lo recibe lo dice. Acepta «1,250.50» y «1250,50».
 */
export function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  const texto = String(v).trim().replace(/^S\/\s*/i, "");
  if (!texto) return null;
  // Si hay coma y punto, el último que aparece es el decimal; si solo hay coma, es decimal salvo que
  // separe miles de a tres («1,250» → 1250; «12,5» → 12.5).
  let limpio = texto;
  if (texto.includes(",") && texto.includes(".")) {
    limpio = texto.lastIndexOf(",") > texto.lastIndexOf(".") ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  } else if (texto.includes(",")) {
    limpio = /^\d{1,3}(,\d{3})+$/.test(texto) ? texto.replace(/,/g, "") : texto.replace(",", ".");
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

const textoONull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

/** Una fila de la tabla, con los numéricos convertidos. Lo que no se reconoce queda null, nunca inventado. */
export function desdeFila(f: Record<string, unknown>): LineaProducto {
  const tipo = f.tipo === "servicio" ? "servicio" : "producto";
  const decision = (DECISIONES as readonly string[]).includes(String(f.decision)) ? (f.decision as Decision) : null;
  const origen = (ORIGENES_LINEA as readonly string[]).includes(String(f.origen)) ? (f.origen as OrigenLinea) : null;
  return {
    id: String(f.id),
    company_id: String(f.company_id),
    codigo: textoONull(f.codigo),
    nombre: String(f.nombre ?? "").trim() || "(sin nombre)",
    tipo,
    cliente_objetivo: textoONull(f.cliente_objetivo),
    necesidad: textoONull(f.necesidad),
    promesa: textoONull(f.promesa),
    precio: numero(f.precio),
    costo_variable_unitario: numero(f.costo_variable_unitario),
    unidades_periodo: numero(f.unidades_periodo),
    horas_por_unidad: numero(f.horas_por_unidad),
    periodo: textoONull(f.periodo),
    origen,
    source_id: textoONull(f.source_id),
    decision,
    decision_motivo: textoONull(f.decision_motivo),
    created_at: textoONull(f.created_at),
    updated_at: textoONull(f.updated_at),
  };
}

// ─── El periodo de una línea ─────────────────────────────────────────────────────────────────────────

export const SIN_PERIODO = "sin periodo declarado";

/**
 * Las formas de periodo que admite una línea: un año, un mes, un trimestre o un semestre. OJO: aquí
 * «S» es semestre (2026-S1, 2026-S2), como dice la migración; en kpis.ts «S» es semana (2026-S41).
 * Una semana no es un periodo de venta de una línea y no se admite: así las dos lecturas no se cruzan.
 */
const RE_PERIODO = /^(\d{4})(?:-(0[1-9]|1[0-2])|-T([1-4])|-S([12]))?$/;
export const FORMA_PERIODO = "2026 (un año), 2026-09 (un mes), 2026-T3 (un trimestre) o 2026-S1 (un semestre)";

export function periodoValido(p: string): boolean {
  return RE_PERIODO.test(p.trim());
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-09» → «septiembre de 2026». Para que ninguna pantalla le muestre un código a nadie. */
export function nombreDePeriodoLinea(p: string | null | undefined): string {
  const crudo = (p ?? "").trim();
  const m = RE_PERIODO.exec(crudo);
  if (!m) return crudo || SIN_PERIODO;
  const [, anio, mes, trimestre, semestre] = m;
  if (mes) return `${MESES[Number(mes) - 1]} de ${anio}`;
  if (trimestre) return `trimestre ${trimestre} de ${anio}`;
  if (semestre) return `${semestre === "1" ? "primer" : "segundo"} semestre de ${anio}`;
  return `año ${anio}`;
}

/**
 * El periodo con su preposición, para meterlo en una frase: «de septiembre de 2026» y «en septiembre de
 * 2026», pero «del primer semestre de 2026» y «en el primer semestre de 2026». Un mes va sin artículo;
 * un año, un trimestre o un semestre lo llevan.
 */
export function periodoConPreposicion(p: string | null | undefined, preposicion: "de" | "en"): string {
  const m = RE_PERIODO.exec((p ?? "").trim());
  const nombre = nombreDePeriodoLinea(p);
  if (!m || m[2]) return `${preposicion} ${nombre}`;
  return preposicion === "de" ? `del ${nombre}` : `en el ${nombre}`;
}

/** Cuántos meses cubre el periodo: lo necesita la capacidad (personas × horas al mes × meses). */
export function mesesDePeriodo(p: string | null | undefined): number | null {
  const m = RE_PERIODO.exec((p ?? "").trim());
  if (!m) return null;
  if (m[2]) return 1;
  if (m[3]) return 3;
  if (m[4]) return 6;
  return 12;
}

/**
 * El periodo que se evalúa cuando nadie lo pide: el que más líneas comparten, contando «sin periodo
 * declarado» como uno más. Así una sola línea con periodo no deja fuera a las otras ciento diecinueve.
 * En el empate gana un periodo declarado, y entre declarados el más reciente.
 */
export function periodoDe(lineas: Pick<LineaProducto, "periodo">[]): string {
  const cuenta = new Map<string, number>();
  for (const l of lineas) {
    const p = l.periodo?.trim() || SIN_PERIODO;
    cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  }
  if (!cuenta.size) return SIN_PERIODO;
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || Number(a[0] === SIN_PERIODO) - Number(b[0] === SIN_PERIODO) || b[0].localeCompare(a[0]))[0][0];
}

/** Los periodos que aparecen en las líneas, del más reciente al más antiguo; «sin periodo declarado» al final. */
export function periodosDe(lineas: Pick<LineaProducto, "periodo">[]): string[] {
  const vistos = new Set(lineas.map((l) => l.periodo?.trim() || SIN_PERIODO));
  const declarados = [...vistos].filter((p) => p !== SIN_PERIODO).sort((a, b) => b.localeCompare(a));
  return vistos.has(SIN_PERIODO) ? [...declarados, SIN_PERIODO] : declarados;
}

// ─── Evaluar: lo que deja cada línea, con la aritmética de finanzas.ts ───────────────────────────────

export type ClaveSugerencia = "sin_datos" | "sin_ventas" | "contribucion_negativa" | "contribucion_cero" | "con_datos";

/**
 * Lo que la aritmética permite decir antes de que la consultora decida. Nunca es una decisión del
 * catálogo (conservar, retirar…): es «revisar» o «sin datos», con lo que falta nombrado.
 */
export type Sugerencia = { clave: ClaveSugerencia; texto: string; falta: string[] };

export type EvaluacionLinea = {
  id: string;
  codigo: string | null;
  nombre: string;
  tipo: TipoLinea;
  periodo: string | null;
  /** false cuando la línea es de otro periodo que el evaluado: se muestra, pero no suma ni participa. */
  en_periodo: boolean;
  precio: number | null;
  costo_variable_unitario: number | null;
  unidades: number | null;
  /** precio × unidades. */
  ingreso: number | null;
  /** precio − costo variable unitario. */
  contribucion_unitaria: number | null;
  /** contribución unitaria × unidades. */
  contribucion: number | null;
  /** ingreso de la línea / Σ ingresos de las líneas del periodo con unidades (de costeoPorSku). */
  participacion: number | null;
  /** Solo servicios: horas por unidad × casos. */
  horas: number | null;
  ingreso_por_hora: number | null;
  /** Por qué una celda es null, en palabras. */
  motivos: string[];
  sugerencia: Sugerencia;
  decision: Decision | null;
  decision_motivo: string | null;
};

export type Evaluacion = {
  periodo: string;
  lineas: EvaluacionLinea[];
  totales: {
    /** Solo sobre las líneas del periodo con precio, costo y unidades. null con aviso si ninguna está completa. */
    ingreso: number | null;
    contribucion: number | null;
    completas: number;
    /** Cuántas líneas son del periodo evaluado. */
    de: number;
    fuera_de_periodo: number;
    parcial: boolean;
    aviso: string | null;
  };
  horas: {
    /** Σ horas de los servicios del periodo; null si alguno no las tiene. */
    total: number | null;
    /** personas × horas al mes × meses, si se declaró la capacidad. */
    disponibles: number | null;
    utilizacion_pct: number | null;
    motivo: string | null;
  };
  /** Los cálculos de finanzas.ts tal cual, con fórmula, supuestos y limitaciones, para explicarlos en pantalla. */
  calculos: { sku: Calculo<CosteoSku> | null; servicio: Calculo<CosteoServicio> | null };
};

export type OpcionesEvaluar = {
  /** El periodo a evaluar. Si no viene, el que más líneas comparten (periodoDe). */
  periodo?: string | null;
  /** Personas y horas al mes disponibles para los servicios. Sin esto no hay utilización. */
  capacidad?: Capacidad | null;
  /** País y moneda de la empresa, para escribir los montos de la sugerencia. Perú si no se dice. */
  config?: ConfigEmpresa;
};

/**
 * La capacidad del equipo para los servicios, tal como llega en la dirección de la página o de la
 * consulta: ?personas=2&horas=160. Si falta alguno de los dos, o no son números mayores que cero, no
 * hay capacidad: la utilización queda sin calcular, que es distinto de calcularla con un supuesto.
 */
export function capacidadDe(parametros: { personas?: string | null; horas?: string | null }): Capacidad | null {
  if (!parametros.personas?.trim() || !parametros.horas?.trim()) return null;
  const personas = Number(parametros.personas);
  const horas = Number(parametros.horas);
  if (!Number.isFinite(personas) || !Number.isFinite(horas) || personas <= 0 || horas <= 0) return null;
  if (personas > 10_000 || horas > 744) return null; // un mes no tiene más de 744 horas
  return { personas, horas_mes_por_persona: horas };
}

export const TEXTO_SIN_DATOS = "sin datos para decidir";

/** Un monto en la moneda de la empresa; con céntimos solo cuando los tiene (un margen de 5.30 no es «5»). */
function monto(n: number, cfg: ConfigEmpresa): string {
  return enMoneda(n, cfg, { decimales: Number.isInteger(n) ? 0 : 2 });
}

/** La sugerencia determinista de UNA línea. Con cualquier dato faltante, no hay sugerencia: hay lista de lo que falta. */
export function sugerir(l: Pick<LineaProducto, "tipo" | "precio" | "costo_variable_unitario" | "unidades_periodo">, cfg: ConfigEmpresa = porDefecto): Sugerencia {
  const unidad = l.tipo === "servicio" ? "caso" : "unidad";
  const falta: string[] = [];
  if (!esNumero(l.precio)) falta.push("precio");
  if (!esNumero(l.costo_variable_unitario)) falta.push(`costo variable por ${unidad}`);
  if (!esNumero(l.unidades_periodo)) falta.push(l.tipo === "servicio" ? "casos atendidos en el periodo" : "unidades vendidas en el periodo");
  if (falta.length) return { clave: "sin_datos", texto: TEXTO_SIN_DATOS, falta };
  const unitaria = (l.precio as number) - (l.costo_variable_unitario as number);
  const unidades = l.unidades_periodo as number;
  if (unidades === 0) return { clave: "sin_ventas", texto: "revisar: sin ventas en el periodo", falta: [] };
  if (unitaria < 0) return { clave: "contribucion_negativa", texto: `revisar: contribución negativa (cada ${unidad} cuesta ${monto(-unitaria, cfg)} más de lo que se cobra)`, falta: [] };
  if (unitaria === 0) return { clave: "contribucion_cero", texto: `revisar: no deja nada por ${unidad}`, falta: [] };
  return {
    clave: "con_datos",
    texto: `con datos completos: deja ${monto(unitaria, cfg)} por ${unidad} y ${monto(unitaria * unidades, cfg)} en el periodo; la decisión la fija la consultora`,
    falta: [],
  };
}

/**
 * Una etiqueta legible y única por línea. costeoPorSku y costeoPorServicio identifican cada fila por un
 * texto; dos líneas sin código y con el mismo nombre no pueden pisarse en el detalle.
 */
function etiquetas(lineas: Pick<LineaProducto, "id" | "codigo" | "nombre">[]): Map<string, string> {
  const usadas = new Map<string, number>();
  const salida = new Map<string, string>();
  for (const l of lineas) {
    const base = l.codigo?.trim() ? `${l.codigo.trim()} · ${l.nombre}` : l.nombre;
    const n = (usadas.get(base) ?? 0) + 1;
    usadas.set(base, n);
    salida.set(l.id, n === 1 ? base : `${base} (${n})`);
  }
  return salida;
}

/**
 * La evaluación de las líneas de una empresa para UN periodo. Productos y servicios pasan por
 * costeoPorSku para contribución, participación y totales (un servicio es un «SKU» cuya unidad es el
 * caso: la aritmética es la misma). Los servicios pasan además por costeoPorServicio cuando se declara
 * la capacidad (personas × horas al mes); sin capacidad se cuentan las horas y la utilización queda
 * null con motivo, porque no hay con qué compararla.
 *
 * Acepta el periodo suelto —evaluar(lineas, "2026-09")— o las opciones completas.
 */
export function evaluar(lineas: LineaProducto[], opciones: OpcionesEvaluar | string = {}): Evaluacion {
  const opc: OpcionesEvaluar = typeof opciones === "string" ? { periodo: opciones } : opciones;
  const cfg = opc.config ?? porDefecto;
  const periodo = opc.periodo?.trim() || periodoDe(lineas);
  const esDelPeriodo = (l: Pick<LineaProducto, "periodo">) => (l.periodo?.trim() || SIN_PERIODO) === periodo;
  const delPeriodo = lineas.filter(esDelPeriodo);
  const etiqueta = etiquetas(lineas);
  /** «de septiembre de 2026», o «de las líneas sin periodo declarado» cuando se evalúan las que no dicen de cuándo son. */
  const deEsteGrupo = periodo === SIN_PERIODO ? "de las líneas sin periodo declarado" : periodoConPreposicion(periodo, "de");
  const deDonde = (cuantas: number, que: string) => [`lineas_producto · ${cuantas} ${que}${periodo === SIN_PERIODO ? ", sin periodo declarado" : ` ${deEsteGrupo}`}`];

  const conPrecio = delPeriodo.filter((l) => esNumero(l.precio));
  const sku = conPrecio.length
    ? costeoPorSku(
        conPrecio.map((l) => ({ codigo: etiqueta.get(l.id) as string, precio: l.precio as number, costo_variable_unitario: l.costo_variable_unitario, unidades: l.unidades_periodo })),
        { periodo, fuentes: deDonde(conPrecio.length, "línea(s) con precio") }
      )
    : null;
  const detalleSku = new Map((sku?.valor?.detalle ?? []).map((d) => [d.codigo, d]));

  const serviciosCosteables = delPeriodo.filter((l) => l.tipo === "servicio" && esNumero(l.precio) && esNumero(l.unidades_periodo));
  const capacidad: Capacidad | null = opc.capacidad ? { ...opc.capacidad, meses: opc.capacidad.meses ?? mesesDePeriodo(periodo) ?? 1 } : null;
  const costeoServicio =
    capacidad && serviciosCosteables.length
      ? costeoPorServicio(
          serviciosCosteables.map((l) => ({ nombre: etiqueta.get(l.id) as string, tarifa: l.precio as number, horas_por_caso: l.horas_por_unidad, casos: l.unidades_periodo as number, costo_hora: null })),
          capacidad,
          { periodo, fuentes: deDonde(serviciosCosteables.length, "servicio(s) con precio y casos") }
        )
      : null;
  const detalleServicio = new Map((costeoServicio?.valor?.detalle ?? []).map((d) => [d.nombre, d]));

  const evaluadas: EvaluacionLinea[] = lineas.map((l) => {
    const dentro = esDelPeriodo(l);
    const precio = l.precio;
    const costo = l.costo_variable_unitario;
    const unidades = l.unidades_periodo;
    const servicio = l.tipo === "servicio";
    const motivos: string[] = [];
    if (!dentro) motivos.push(`es de otro periodo (${nombreDePeriodoLinea(l.periodo)}): no entra en el total ni en la participación ${deEsteGrupo}`);
    if (!esNumero(precio)) motivos.push("sin precio");
    if (!esNumero(costo)) motivos.push(`sin costo variable por ${servicio ? "caso" : "unidad"}`);
    if (!esNumero(unidades)) motivos.push(servicio ? "sin casos del periodo" : "sin unidades del periodo");

    // Donde finanzas.ts dio el detalle se usa el suyo; si no (ninguna línea completa, o la línea es de
    // otro periodo), la misma fórmula sobre esta sola línea.
    const d = dentro ? detalleSku.get(etiqueta.get(l.id) as string) : undefined;
    const ingreso = d ? d.ventas : esNumero(precio) && esNumero(unidades) ? precio * unidades : null;
    const contribucion_unitaria = d ? d.mc_unitaria : esNumero(precio) && esNumero(costo) ? precio - costo : null;
    const contribucion = d ? d.mc_total : contribucion_unitaria != null && esNumero(unidades) ? contribucion_unitaria * unidades : null;
    const participacion = d?.participacion ?? null;

    let horas: number | null = null;
    let ingreso_por_hora: number | null = null;
    if (servicio) {
      const s = dentro ? detalleServicio.get(etiqueta.get(l.id) as string) : undefined;
      if (s) {
        horas = s.horas;
        ingreso_por_hora = s.ingreso_por_hora;
      } else if (esNumero(l.horas_por_unidad) && esNumero(unidades)) {
        horas = l.horas_por_unidad * unidades;
        if (horas > 0 && ingreso != null) ingreso_por_hora = ingreso / horas;
      }
      if (!esNumero(l.horas_por_unidad)) motivos.push("sin horas por caso: no se sabe cuánto tiempo se lleva");
      else if (horas != null && horas <= 0) motivos.push("horas en cero");
    }

    return {
      id: l.id,
      codigo: l.codigo,
      nombre: l.nombre,
      tipo: l.tipo,
      periodo: l.periodo,
      en_periodo: dentro,
      precio,
      costo_variable_unitario: costo,
      unidades,
      ingreso,
      contribucion_unitaria,
      contribucion,
      participacion,
      horas,
      ingreso_por_hora,
      motivos,
      sugerencia: sugerir(l, cfg),
      decision: l.decision,
      decision_motivo: l.decision_motivo,
    };
  });

  const dentro = evaluadas.filter((e) => e.en_periodo);
  const fuera = evaluadas.length - dentro.length;
  const completas = dentro.filter((e) => e.contribucion != null).length;
  const sinCosto = dentro.filter((e) => !esNumero(e.costo_variable_unitario)).length;
  const sinUnidades = dentro.filter((e) => !esNumero(e.unidades)).length;
  const sinPrecio = dentro.filter((e) => !esNumero(e.precio)).length;
  const partes: string[] = [];
  if (!dentro.length) {
    if (lineas.length) partes.push(`${periodo === SIN_PERIODO ? "ninguna línea está sin periodo declarado" : `ninguna línea es ${deEsteGrupo}`}: no hay total que calcular`);
  } else if (completas === 0) {
    const quienes = dentro.length === 1 ? "la única línea no tiene" : `ninguna de las ${dentro.length} líneas tiene`;
    partes.push(`${quienes} precio, costo y unidades a la vez (${sinPrecio} sin precio, ${sinCosto} sin costo, ${sinUnidades} sin unidades): no hay total que calcular`);
  } else if (completas < dentro.length) {
    partes.push(`${dentro.length - completas} de ${dentro.length} líneas sin precio, costo o unidades: el total es parcial`);
  }
  if (fuera > 0 && dentro.length) partes.push(`${fuera} línea(s) de otro periodo no entran en el total`);
  const totales: Evaluacion["totales"] = {
    ingreso: sku?.valor ? sku.valor.total_ventas : null,
    contribucion: sku?.valor ? sku.valor.total_mc : null,
    completas,
    de: dentro.length,
    fuera_de_periodo: fuera,
    parcial: completas < dentro.length,
    aviso: partes.length ? partes.join("; ") : null,
  };

  const servicios = dentro.filter((e) => e.tipo === "servicio");
  const sinHoras = servicios.filter((e) => e.horas == null);
  const fueraDelCosteo = servicios.length - serviciosCosteables.length;
  let motivoHoras: string | null = null;
  if (servicios.length) {
    if (sinHoras.length) motivoHoras = `Horas no registradas en: ${sinHoras.map((e) => e.nombre).join(", ")}. La carga total no se puede sumar ni comparar con la capacidad.`;
    else if (!capacidad) motivoHoras = "Sin capacidad declarada (personas × horas al mes) no se calcula la utilización.";
    else if (!costeoServicio?.valor) motivoHoras = costeoServicio?.motivo_nulo ?? "Ningún servicio tiene precio y casos: no hay carga que comparar con la capacidad.";
    else {
      const notas = [...costeoServicio.limitaciones];
      if (fueraDelCosteo > 0) notas.push(`${fueraDelCosteo} servicio(s) sin precio o sin casos no entran en la utilización.`);
      motivoHoras = notas.length ? notas.join(" ") : null;
    }
  }
  const horas: Evaluacion["horas"] = {
    total: servicios.length && sinHoras.length === 0 ? servicios.reduce((s, e) => s + (e.horas as number), 0) : null,
    disponibles: capacidad ? capacidad.personas * capacidad.horas_mes_por_persona * (capacidad.meses ?? 1) : null,
    utilizacion_pct: costeoServicio?.valor?.utilizacion_pct ?? null,
    motivo: motivoHoras,
  };

  return { periodo, lineas: evaluadas, totales, horas, calculos: { sku, servicio: costeoServicio } };
}

// ─── Lo que se puede guardar: las reglas que no son de forma sino de sentido ─────────────────────────

/**
 * Revisa cómo QUEDARÍA una línea (la previa con los cambios encima) y devuelve por qué no se puede
 * guardar, o null. La usan la ruta que crea y la que edita, para que digan lo mismo.
 */
export function revisarLinea(l: Pick<LineaProducto, "tipo" | "horas_por_unidad" | "decision" | "decision_motivo" | "periodo">): string | null {
  if (l.decision && !l.decision_motivo?.trim()) return "Di por qué: la decisión se guarda con su motivo.";
  if (!l.decision && l.decision_motivo?.trim()) return "Hay un motivo sin decisión: elige la decisión o quita el motivo.";
  if (l.horas_por_unidad != null && l.tipo !== "servicio") return "Las horas por unidad son de un servicio; en un producto no aplican.";
  if (l.periodo && !periodoValido(l.periodo)) return `El periodo se escribe así: ${FORMA_PERIODO}.`;
  return null;
}

// ─── Lo que ve el dueño: sus líneas, lo que prometen y lo que dejan, en sus palabras ───────────────────

export type LineaParaDueno = {
  nombre: string;
  tipo: TipoLinea;
  promesa: string | null;
  cliente: string | null;
  /** «Te deja S/ 51 por unidad.» o «Todavía no sabemos cuánto te deja: falta…» — nunca un cero inventado. */
  deja: string;
  conDatos: boolean;
};

export type ResumenParaDueno = {
  /** El periodo evaluado, con nombre («septiembre de 2026»). */
  periodo: string;
  lineas: LineaParaDueno[];
  /** Las tres que más dejan, solo entre las que tienen datos; por total del periodo o, si falta lo vendido, por unidad. */
  dejanMas: { criterio: "en_el_periodo" | "por_unidad" | null; lineas: { nombre: string; texto: string }[]; nota: string | null };
  /** Qué falta para completar la foto, dicho una sola vez. */
  faltan: string | null;
};

/**
 * Lo que deja una línea, dicho para quien la vende. Sin «contribución» ni «costo variable».
 * `faltaSoloAqui`: cuando a TODAS les falta lo vendido se dice una vez abajo (`faltan`) y no ochenta veces,
 * una por línea; cuando solo le falta a esta, se dice aquí.
 */
function dejaEnPalabras(e: EvaluacionLinea, cfg: ConfigEmpresa, faltaSoloAqui: boolean): string {
  const servicio = e.tipo === "servicio";
  const unidad = servicio ? "caso" : "unidad";
  const u = e.contribucion_unitaria;
  if (u == null) {
    const falta = [
      esNumero(e.precio) ? null : "el precio",
      esNumero(e.costo_variable_unitario) ? null : servicio ? "lo que te cuesta atender cada caso" : "lo que te cuesta cada unidad",
    ].filter((x): x is string => x !== null);
    return `Todavía no sabemos cuánto te deja: falta ${falta.join(" y ")}.`;
  }
  if (u < 0) return `Hoy cada ${unidad} te cuesta ${monto(-u, cfg)} más de lo que cobras.`;
  if (u === 0) return "Hoy no te deja nada: cobras lo mismo que te cuesta.";
  const base = `Te deja ${monto(u, cfg)} por ${unidad}.`;
  if (e.contribucion == null) return faltaSoloAqui ? `${base} Falta saber ${servicio ? "cuántos casos atendiste" : "cuánto vendiste"} para decirte cuánto dejó en total.` : base;
  // «En septiembre de 2026», «En el primer semestre de 2026»; sin periodo declarado no se nombra ninguno.
  const enPeriodo = e.periodo && periodoValido(e.periodo) ? periodoConPreposicion(e.periodo, "en").replace(/^e/, "E") : null;
  if (e.unidades === 0) return `${base} ${enPeriodo ? `${enPeriodo} no` : "No"} tenemos ${servicio ? "ningún caso atendido" : "ninguna venta"} anotad${servicio ? "o" : "a"}.`;
  return `${base} ${enPeriodo ?? "Con lo vendido que tenemos anotado,"} dejó ${monto(e.contribucion, cfg)}.`;
}

/**
 * El resumen para el portal. Sin decisiones: la tabla no distingue una decisión acordada de una en
 * borrador, así que ninguna se le muestra al dueño. La promesa y el cliente salen de la fila; lo que
 * deja, de la evaluación. Lo que falta se dice una vez y sin estimarlo.
 */
export function resumenParaDueno(lineas: LineaProducto[], ev: Evaluacion, cfg: ConfigEmpresa = porDefecto): ResumenParaDueno {
  const porId = new Map(lineas.map((l) => [l.id, l]));
  const dentro = ev.lineas.filter((e) => e.en_periodo);
  const algunaConTotal = ev.lineas.some((e) => e.contribucion != null);
  const filas: LineaParaDueno[] = ev.lineas.map((e) => ({
    nombre: e.nombre,
    tipo: e.tipo,
    promesa: porId.get(e.id)?.promesa ?? null,
    cliente: porId.get(e.id)?.cliente_objetivo ?? null,
    deja: dejaEnPalabras(e, cfg, algunaConTotal),
    conDatos: e.contribucion_unitaria != null,
  }));

  const conTotal = dentro.filter((e) => e.contribucion != null && e.contribucion > 0).sort((a, b) => (b.contribucion as number) - (a.contribucion as number));
  const conUnitaria = dentro.filter((e) => e.contribucion_unitaria != null && e.contribucion_unitaria > 0).sort((a, b) => (b.contribucion_unitaria as number) - (a.contribucion_unitaria as number));
  let dejanMas: ResumenParaDueno["dejanMas"] = { criterio: null, lineas: [], nota: null };
  if (conTotal.length) {
    const completas = dentro.filter((e) => e.contribucion != null).length;
    dejanMas = {
      criterio: "en_el_periodo",
      lineas: conTotal.slice(0, 3).map((e) => ({ nombre: e.nombre, texto: `${e.nombre}: ${monto(e.contribucion as number, cfg)}` })),
      nota: completas < dentro.length ? `Solo entre ${completas} de ${dentro.length}: los demás todavía no tienen precio, costo y cantidad vendida.` : null,
    };
  } else if (conUnitaria.length) {
    const conDatos = dentro.filter((e) => e.contribucion_unitaria != null).length;
    dejanMas = {
      criterio: "por_unidad",
      lineas: conUnitaria.slice(0, 3).map((e) => ({ nombre: e.nombre, texto: `${e.nombre}: ${monto(e.contribucion_unitaria as number, cfg)} por ${e.tipo === "servicio" ? "caso" : "unidad"}` })),
      nota: `Por cada venta, no en total: falta saber cuánto se vendió de cada uno.${conDatos < dentro.length ? ` Y solo entre ${conDatos} de ${dentro.length}: los demás todavía no tienen precio y costo.` : ""}`,
    };
  }

  const incompletas = dentro.filter((e) => e.contribucion == null);
  let faltan: string | null = null;
  if (incompletas.length) {
    const que = [
      incompletas.some((e) => !esNumero(e.precio)) ? "el precio" : null,
      incompletas.some((e) => !esNumero(e.costo_variable_unitario)) ? "lo que te cuesta cada uno" : null,
      incompletas.some((e) => !esNumero(e.unidades)) ? "cuánto vendiste de cada uno" : null,
    ].filter((x): x is string => x !== null);
    const cuantos = incompletas.length === dentro.length ? (dentro.length === 1 ? "De lo que vendes" : `De ninguno de tus ${dentro.length} productos o servicios`) : `De ${incompletas.length} de tus ${dentro.length} productos o servicios`;
    const verbo = incompletas.length === dentro.length && dentro.length > 1 ? "sabemos todavía" : "todavía no sabemos";
    faltan = `${cuantos} ${verbo} cuánto deja en total: falta ${que.join(", ").replace(/, ([^,]*)$/, " y $1")}. No lo calculamos a ojo. Si lo tienes en un cuaderno o en un Excel, pásaselo a tu consultora.`;
  }

  return { periodo: nombreDePeriodoLinea(ev.periodo), lineas: filas, dejanMas, faltan };
}

// ─── Importar desde un Excel: columnas tolerantes, vacíos que se quedan vacíos ───────────────────────

/**
 * Qué columna del archivo alimenta cada campo. Encabezados en minúsculas, sin tildes ni guiones bajos.
 * «stock» y «cantidad» a secas NO están en unidades a propósito: lo que hay en el almacén no es lo que
 * se vendió, y tomar uno por otro inventaría una venta.
 */
export const SINONIMOS_COLUMNAS: Record<"codigo" | "nombre" | "tipo" | "precio" | "costo" | "unidades" | "horas", string[]> = {
  codigo: ["codigo", "cod", "sku", "referencia", "ref", "clave"],
  nombre: ["nombre", "descripcion", "producto", "servicio", "articulo", "linea", "detalle", "item"],
  tipo: ["tipo", "clase"],
  precio: ["precio", "precio venta", "precio de venta", "precio unitario", "pvp", "tarifa", "honorario", "honorario pactado"],
  costo: ["costo", "costo unitario", "costo variable", "costo variable unitario", "cvu", "costo por unidad"],
  unidades: ["unidades", "unidades vendidas", "cantidad vendida", "vendidas", "casos", "casos atendidos"],
  horas: ["horas", "horas por unidad", "horas por caso", "horas estimadas", "horas unidad"],
};

/** «Precio_Venta» → «precio venta»; «Código» → «codigo». Para comparar encabezados escritos de cualquier manera. */
export function normalizarEncabezado(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();
}

export type ColumnasReconocidas = Record<keyof typeof SINONIMOS_COLUMNAS, { indice: number; encabezado: string } | null>;

/** Qué columna de la hoja corresponde a cada campo, por sinónimos; null si ninguna. La primera coincidencia gana. */
export function reconocerColumnas(encabezados: string[]): ColumnasReconocidas {
  const normalizados = encabezados.map(normalizarEncabezado);
  const salida = {} as ColumnasReconocidas;
  const usados = new Set<number>();
  for (const campo of Object.keys(SINONIMOS_COLUMNAS) as (keyof typeof SINONIMOS_COLUMNAS)[]) {
    let hallado: { indice: number; encabezado: string } | null = null;
    for (const sinonimo of SINONIMOS_COLUMNAS[campo]) {
      const i = normalizados.findIndex((n, idx) => n === sinonimo && !usados.has(idx));
      if (i >= 0) {
        hallado = { indice: i, encabezado: encabezados[i] };
        break;
      }
    }
    if (hallado) usados.add(hallado.indice);
    salida[campo] = hallado;
  }
  return salida;
}

export type FilaImportada = {
  /** Número de fila en el Excel, para citarla. */
  fila: number;
  codigo: string | null;
  nombre: string;
  tipo: TipoLinea;
  precio: number | null;
  costo_variable_unitario: number | null;
  unidades_periodo: number | null;
  horas_por_unidad: number | null;
  /** Lo que la lectura quiere decir de esta fila: «precio no numérico («consultar»): se dejó vacío». */
  avisos: string[];
};

export type LecturaLineas = {
  hoja: string;
  columnas: ColumnasReconocidas;
  /** Campos sin columna en el archivo: se importan vacíos y se dice. */
  faltantes: string[];
  filas: FilaImportada[];
  /** Filas que no se importan: sin código ni nombre, una fila de total, o lo que la lectura del Excel apartó como resumen. */
  omitidas: { fila: number; motivo: string }[];
};

const celda = (f: { celdas: { valor: ValorCelda }[] }, i: number | undefined): ValorCelda => (i == null ? null : f.celdas[i]?.valor ?? null);

/** El rótulo de una fila de suma, sin nada más: «Total», «TOTALES», «Total general», «Subtotal», «Total del mes». */
const RE_SOLO_TOTAL = /^(sub ?)?total(es)?( (general|final|del (mes|periodo|ano)|de la hoja))? ?:?$/;
/** Un texto que empieza por «Total» seguido de algo más: puede ser una suma («Total unidades») o un artículo («Total Look pack x3»). */
const RE_EMPIEZA_TOTAL = /^total(es)?( |$)/;

/**
 * Lee UNA hoja como líneas. Hace falta al menos la columna de nombre o la de código; sin eso no es una
 * lista de lo que se vende. Las celdas vacías llegan como null y así se quedan: un costo que no está no
 * es un costo de cero. Un texto donde se esperaba un número se deja vacío y se avisa, con la celda.
 * Si la hoja no dice de qué tipo es cada fila, vale lo que diga quien importa (`tipoPorDefecto`).
 */
export function lineasDesdeHoja(hoja: Hoja, opciones: { tipoPorDefecto?: TipoLinea } = {}): LecturaLineas {
  const tipoBase: TipoLinea = opciones.tipoPorDefecto ?? "producto";
  const columnas = reconocerColumnas(hoja.encabezados);
  const faltantes = (Object.keys(columnas) as (keyof ColumnasReconocidas)[]).filter((c) => !columnas[c]);
  const filas: FilaImportada[] = [];
  const omitidas: { fila: number; motivo: string }[] = [];
  if (!columnas.nombre && !columnas.codigo) return { hoja: hoja.nombre, columnas, faltantes, filas, omitidas };

  const num = (f: Hoja["filas"][number], campo: "precio" | "costo" | "unidades" | "horas", avisos: string[]): number | null => {
    const col = columnas[campo];
    if (!col) return null;
    const v = celda(f, col.indice);
    if (v === null) return null;
    const n = numero(v);
    if (n === null) avisos.push(`${campo} no numérico («${String(v)}» en ${f.celdas[col.indice]?.ref ?? "?"}): se dejó vacío`);
    else if (n < 0) {
      avisos.push(`${campo} negativo (${String(v)} en ${f.celdas[col.indice]?.ref ?? "?"}): se dejó vacío`);
      return null;
    }
    return n;
  };

  for (const f of hoja.filas) {
    const avisos: string[] = [];
    const codigo = textoONull(celda(f, columnas.codigo?.indice));
    const nombreCrudo = textoONull(celda(f, columnas.nombre?.indice));
    if (!codigo && !nombreCrudo) {
      omitidas.push({ fila: f.numero, motivo: "sin código ni nombre" });
      continue;
    }
    // Una fila de total no es un artículo. Se reconoce por su texto y por lo que NO trae:
    //  · el rótulo solo («Total», «Totales», «Total general», «Subtotal») es una suma, traiga lo que traiga;
    //  · un nombre que EMPIEZA por «Total» («Total Look pack x3») es un artículo si la fila trae su código o
    //    su precio; sin ninguno de los dos es el rótulo de una suma («Total unidades»).
    // Antes bastaba con empezar por «Total» y un artículo con ese nombre se perdía sin más aviso que el de omitida.
    const rotuloNombre = normalizarEncabezado(nombreCrudo ?? "");
    const rotuloCodigo = normalizarEncabezado(codigo ?? "");
    const codigoPropio = !!codigo && !RE_EMPIEZA_TOTAL.test(rotuloCodigo);
    const traePrecio = celda(f, columnas.precio?.indice) !== null;
    const empiezaPorTotal = RE_EMPIEZA_TOTAL.test(rotuloNombre) || RE_EMPIEZA_TOTAL.test(rotuloCodigo);
    if (RE_SOLO_TOTAL.test(rotuloNombre) || RE_SOLO_TOTAL.test(rotuloCodigo) || (empiezaPorTotal && !codigoPropio && !traePrecio)) {
      omitidas.push({ fila: f.numero, motivo: `es una fila de total («${nombreCrudo ?? codigo}»), no una línea` });
      continue;
    }
    if (empiezaPorTotal) avisos.push("el nombre empieza por «Total»: se toma como un artículo porque la fila trae código o precio; si era una fila de suma, quítala del archivo");
    const nombre = nombreCrudo ?? (codigo as string);
    if (!nombreCrudo) avisos.push("sin nombre: se usa el código como nombre");
    const tipoCrudo = normalizarEncabezado(String(celda(f, columnas.tipo?.indice) ?? ""));
    const tipo: TipoLinea = /servicio|caso|honorario/.test(tipoCrudo) ? "servicio" : /producto|articulo|mercaderia/.test(tipoCrudo) ? "producto" : tipoBase;
    const horas = num(f, "horas", avisos);
    if (horas != null && tipo !== "servicio") avisos.push("trae horas pero es un producto: las horas no se importan");
    filas.push({
      fila: f.numero,
      codigo: codigo ? codigo.slice(0, 60) : null,
      nombre: nombre.slice(0, 160),
      tipo,
      precio: num(f, "precio", avisos),
      costo_variable_unitario: num(f, "costo", avisos),
      unidades_periodo: num(f, "unidades", avisos),
      horas_por_unidad: tipo === "servicio" ? horas : null,
      avisos,
    });
  }
  // Las filas que la lectura del Excel ya apartó como total o resumen (documentos/excel.ts · esFilaDeResumen)
  // no llegan en `hoja.filas`. Tampoco se pierden en silencio: se listan como omitidas, con su rótulo, para
  // que quien importa las vea antes de confirmar y, si era un artículo, lo arregle en el archivo.
  for (const f of hoja.resumen ?? []) {
    const rotulo = f.celdas.map((c) => c.valor).find((v): v is string => typeof v === "string" && v.trim() !== "");
    omitidas.push({ fila: f.numero, motivo: `la lectura del Excel la apartó como fila de total o resumen${rotulo ? ` («${rotulo.trim()}»)` : ""}: no se importa como línea` });
  }
  omitidas.sort((a, b) => a.fila - b.fila);
  return { hoja: hoja.nombre, columnas, faltantes, filas, omitidas };
}

/**
 * De un libro entero: la hoja pedida o, si no se pide, la primera cuyo encabezado tenga nombre o código.
 * Devuelve también los nombres de todas las hojas para que la pantalla deje elegir otra.
 */
export async function lineasDesdeExcel(
  entrada: Buffer | ArrayBuffer | Uint8Array,
  hojaPedida?: string | null,
  opciones: { tipoPorDefecto?: TipoLinea } = {}
): Promise<{ lectura: LecturaLineas | null; hojas: string[]; fidelidad: "alta" | "media"; motivo: string | null }> {
  const excel = await leerExcel(entrada);
  const hojas = excel.hojas.map((h) => h.nombre);
  const candidatas = hojaPedida ? excel.hojas.filter((h) => h.nombre === hojaPedida) : excel.hojas;
  for (const h of candidatas) {
    if (!h.filas.length) continue;
    const cols = reconocerColumnas(h.encabezados);
    if (cols.nombre || cols.codigo) return { lectura: lineasDesdeHoja(h, opciones), hojas, fidelidad: excel.fidelidad, motivo: null };
  }
  return {
    lectura: null,
    hojas,
    fidelidad: excel.fidelidad,
    motivo: hojaPedida
      ? `La hoja «${hojaPedida}» no tiene una columna de nombre ni de código en su encabezado.`
      : `Ninguna hoja tiene una columna de nombre ni de código (se aceptan: ${[...SINONIMOS_COLUMNAS.nombre, ...SINONIMOS_COLUMNAS.codigo].join(", ")}).`,
  };
}

export type VistaPreviaLineas = {
  nuevas: FilaImportada[];
  /** Ya existe una línea con ese código: se actualiza con lo que trae el archivo; lo vacío no borra lo que hay. */
  actualizan: (FilaImportada & { id: string })[];
  omitidas: { fila: number; nombre: string | null; motivo: string }[];
};

/** «Blusa modelo 1» y «blusa  modelo 1» son la misma línea. */
const llave = (s: string) => normalizarEncabezado(s);

/**
 * Qué pasaría si se confirma: cuáles filas crean una línea, cuáles actualizan una existente (mismo
 * código) y cuáles se omiten (repetidas en el archivo, o sin código y con un nombre que ya existe). Se
 * calcula ANTES de escribir y se le muestra a la consultora; confirmar vuelve a calcularlo igual.
 */
export function vistaPreviaLineas(filas: FilaImportada[], existentes: Pick<LineaProducto, "id" | "codigo" | "nombre">[], omitidasDeLectura: { fila: number; motivo: string }[] = []): VistaPreviaLineas {
  const porCodigo = new Map(existentes.filter((e) => e.codigo).map((e) => [llave(e.codigo as string), e]));
  const porNombre = new Map(existentes.map((e) => [llave(e.nombre), e]));
  const vistosCodigo = new Map<string, number>();
  const vistosNombre = new Map<string, number>();
  const nuevas: FilaImportada[] = [];
  const actualizan: (FilaImportada & { id: string })[] = [];
  const omitidas: VistaPreviaLineas["omitidas"] = omitidasDeLectura.map((o) => ({ ...o, nombre: null }));

  for (const f of filas) {
    const kc = f.codigo ? llave(f.codigo) : null;
    const kn = llave(f.nombre);
    if (kc && vistosCodigo.has(kc)) {
      omitidas.push({ fila: f.fila, nombre: f.nombre, motivo: `código «${f.codigo}» repetido en el archivo (ya está en la fila ${vistosCodigo.get(kc)})` });
      continue;
    }
    if (!kc && vistosNombre.has(kn)) {
      omitidas.push({ fila: f.fila, nombre: f.nombre, motivo: `nombre repetido en el archivo (ya está en la fila ${vistosNombre.get(kn)})` });
      continue;
    }
    if (kc) vistosCodigo.set(kc, f.fila);
    vistosNombre.set(kn, f.fila);
    const existente = kc ? porCodigo.get(kc) : null;
    if (existente) {
      actualizan.push({ ...f, id: existente.id });
      continue;
    }
    if (!kc && porNombre.has(kn)) {
      omitidas.push({ fila: f.fila, nombre: f.nombre, motivo: "ya existe una línea con ese nombre y la fila no trae código para distinguirla" });
      continue;
    }
    nuevas.push(f);
  }
  return { nuevas, actualizan, omitidas };
}

// ─── La base: leer y escribir lineas_producto ───────────────────────────────────────────────────────

/** Error con el código de Postgres a la vista, para que la ruta responda 409 en el duplicado y 500 en lo demás. */
export class ErrorDeLinea extends Error {
  constructor(mensaje: string, readonly codigo: string | null = null) {
    super(mensaje);
    this.name = "ErrorDeLinea";
  }
}

const COLUMNAS = "id,company_id,codigo,nombre,tipo,cliente_objetivo,necesidad,promesa,precio,costo_variable_unitario,unidades_periodo,horas_por_unidad,periodo,origen,source_id,decision,decision_motivo,created_at,updated_at";

/**
 * Lo mismo sin la decisión ni su motivo: lo que se le pide a la base cuando quien mira es el dueño. Se
 * filtra en la consulta, no al pintar: lo que la consultora todavía está pensando no viaja a su pantalla.
 *
 * OJO: esto protege lo que sale por ESTA aplicación. La política `lineas_producto_cliente` de la tabla
 * (migracion-entrada-y-direccion.sql:82) deja leer la fila entera a un dueño que consulte la base con su
 * propia sesión, por fuera de la app. Lo cierra una vista con estas mismas columnas, pedida en una
 * migración aparte; por eso la lista se exporta: la prueba comprueba que la vista y esta lista coinciden.
 */
export const COLUMNAS_PARA_DUENO = COLUMNAS.split(",").filter((c) => c !== "decision" && c !== "decision_motivo").join(",");

/** PostgREST corta cada respuesta en 1.000 filas. Se pide de a tramos hasta agotar, con un tope que no se alcanza por accidente. */
const TRAMO = 1000;
const MAX_TRAMOS = 20;

/**
 * Todas las líneas de la empresa. Se leen por tramos: una empresa con 1.500 artículos recibiría solo los
 * primeros 1.000 sin decir nada, y la importación siguiente creería que los otros 500 son nuevos.
 */
export async function listarLineas(companyId: string, opciones: { paraDueno?: boolean } = {}): Promise<LineaProducto[]> {
  const columnas = opciones.paraDueno ? COLUMNAS_PARA_DUENO : COLUMNAS;
  const filas: Record<string, unknown>[] = [];
  for (let tramo = 0; tramo < MAX_TRAMOS; tramo++) {
    // Las importadas comparten created_at: el código y el id desempatan para que el orden sea el mismo en cada tramo.
    const { data, error } = await supabaseAdmin()
      .from("lineas_producto")
      .select(columnas)
      .eq("company_id", companyId)
      .order("created_at")
      .order("codigo")
      .order("id")
      .range(tramo * TRAMO, tramo * TRAMO + TRAMO - 1);
    if (error) throw new ErrorDeLinea(error.message, error.code ?? null);
    const pagina = (data ?? []) as unknown as Record<string, unknown>[];
    filas.push(...pagina);
    if (pagina.length < TRAMO) return filas.map(desdeFila);
  }
  throw new ErrorDeLinea(`La empresa tiene más de ${MAX_TRAMOS * TRAMO} líneas: no se muestran a medias. Hay que dividir el catálogo.`, "demasiadas");
}

/**
 * ¿El fallo es que la tabla todavía no existe en esta base? Pasa mientras migracion-entrada-y-direccion.sql
 * no esté aplicada: Postgres responde 42P01 y PostgREST, PGRST205. La pantalla lo dice con esas palabras
 * en vez de mostrar una lista vacía, que se leería como «esta empresa no vende nada».
 */
export function esTablaAusente(e: unknown): boolean {
  return e instanceof ErrorDeLinea && (e.codigo === "42P01" || e.codigo === "PGRST205");
}

/** Una línea de ESTA empresa, o null. El id solo no basta: la empresa va siempre en la consulta. */
export async function leerLinea(companyId: string, id: string): Promise<LineaProducto | null> {
  const { data, error } = await supabaseAdmin().from("lineas_producto").select(COLUMNAS).eq("id", id).eq("company_id", companyId).maybeSingle();
  if (error) throw new ErrorDeLinea(error.message, error.code ?? null);
  return data ? desdeFila(data as Record<string, unknown>) : null;
}

/**
 * País y moneda de la empresa para escribir los montos. Si las columnas todavía no existen (migración
 * sin aplicar) o la lectura falla, rige Perú, que es lo que la app mostraba hasta hoy.
 */
export async function configDeEmpresa(companyId: string): Promise<ConfigEmpresa> {
  try {
    const { data, error } = await supabaseAdmin().from("companies").select("pais,moneda,idioma,zona_horaria").eq("id", companyId).maybeSingle();
    return error ? { ...porDefecto } : configDe(data as Record<string, unknown> | null);
  } catch {
    return { ...porDefecto };
  }
}

function filaParaGuardar(d: DatosLinea): Record<string, unknown> {
  const fila: Record<string, unknown> = {};
  const campos: (keyof DatosLinea)[] = ["codigo", "nombre", "tipo", "cliente_objetivo", "necesidad", "promesa", "precio", "costo_variable_unitario", "unidades_periodo", "horas_por_unidad", "periodo", "origen", "source_id", "decision", "decision_motivo"];
  for (const c of campos) if (d[c] !== undefined) fila[c] = d[c];
  return fila;
}

const mensajeDe = (error: { code?: string | null; message: string }, codigo: string | null | undefined) =>
  error.code === "23505" ? `Ya hay una línea con el código «${codigo ?? ""}» en esta empresa.` : error.message;

export async function crearLinea(companyId: string, datos: DatosLinea & { nombre: string; tipo: TipoLinea }): Promise<LineaProducto> {
  const { data, error } = await supabaseAdmin().from("lineas_producto").insert({ company_id: companyId, ...filaParaGuardar(datos) }).select(COLUMNAS).single();
  if (error) throw new ErrorDeLinea(mensajeDe(error, datos.codigo), error.code ?? null);
  return desdeFila(data as Record<string, unknown>);
}

export async function editarLinea(companyId: string, id: string, datos: DatosLinea): Promise<LineaProducto> {
  const { data, error } = await supabaseAdmin()
    .from("lineas_producto")
    .update({ ...filaParaGuardar(datos), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .select(COLUMNAS)
    .maybeSingle();
  if (error) throw new ErrorDeLinea(mensajeDe(error, datos.codigo), error.code ?? null);
  if (!data) throw new ErrorDeLinea("Esa línea no es de esta empresa.", "no_encontrada");
  return desdeFila(data as Record<string, unknown>);
}

/** Cuántas actualizaciones viajan juntas: suficiente para no tardar minutos, poco para no saturar la base. */
const TANDA = 20;

/**
 * Escribe lo que la vista previa dijo que iba a pasar: inserta las nuevas tal cual (vacíos como null) y
 * actualiza las existentes solo con los campos que el archivo trae con valor. Origen «extraido»: salió de
 * un documento y nadie lo ha conciliado todavía. Vale también para la que se actualiza: si el archivo le
 * cambió un número, deja de ser «conciliado» o «declarado», porque ese número ya no es el que alguien
 * concilió o declaró. La fila que no trae ningún número no cambia de origen ni de periodo: no hay nada
 * nuevo que fechar. La decisión de una línea existente no se toca nunca.
 */
export async function importarLineas(companyId: string, vista: VistaPreviaLineas, origen: { periodo?: string | null; source_id?: string | null }): Promise<{ creadas: number; actualizadas: number }> {
  const sb = supabaseAdmin();
  let creadas = 0;
  if (vista.nuevas.length) {
    const filas = vista.nuevas.map((f) => ({
      company_id: companyId,
      codigo: f.codigo,
      nombre: f.nombre,
      tipo: f.tipo,
      precio: f.precio,
      costo_variable_unitario: f.costo_variable_unitario,
      unidades_periodo: f.unidades_periodo,
      horas_por_unidad: f.horas_por_unidad,
      periodo: origen.periodo ?? null,
      origen: "extraido",
      source_id: origen.source_id ?? null,
    }));
    const { error } = await sb.from("lineas_producto").insert(filas);
    if (error) throw new ErrorDeLinea(error.message, error.code ?? null);
    creadas = filas.length;
  }
  let actualizadas = 0;
  for (let i = 0; i < vista.actualizan.length; i += TANDA) {
    const tanda = vista.actualizan.slice(i, i + TANDA);
    const resultados = await Promise.all(
      tanda.map((f) => {
        const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (f.precio != null) cambios.precio = f.precio;
        if (f.costo_variable_unitario != null) cambios.costo_variable_unitario = f.costo_variable_unitario;
        if (f.unidades_periodo != null) cambios.unidades_periodo = f.unidades_periodo;
        if (f.horas_por_unidad != null) cambios.horas_por_unidad = f.horas_por_unidad;
        const traeValor = f.precio != null || f.costo_variable_unitario != null || f.unidades_periodo != null || f.horas_por_unidad != null;
        if (traeValor) {
          cambios.origen = "extraido";
          if (origen.source_id) cambios.source_id = origen.source_id;
          if (origen.periodo) cambios.periodo = origen.periodo;
        }
        return sb.from("lineas_producto").update(cambios).eq("id", f.id).eq("company_id", companyId);
      })
    );
    const fallo = resultados.find((r) => r.error);
    if (fallo?.error) throw new ErrorDeLinea(`Se actualizaron ${actualizadas} líneas y la siguiente tanda falló: ${fallo.error.message}`, fallo.error.code ?? null);
    actualizadas += tanda.length;
  }
  return { creadas, actualizadas };
}
