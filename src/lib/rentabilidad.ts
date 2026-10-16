/**
 * CUÁNTO DEJA CADA COSA QUE SE VENDE, Y QUÉ HACER CON ESO (16-10-2026).
 *
 * Con lo que la empresa llena en su tabla (precio, costo por partes, cuánto vende en un mes normal) y en su ficha
 * (totales, moneda, crédito, inventario), 8X calcula con honestidad:
 *  - el margen por producto, en dinero y en porcentaje;
 *  - la matriz margen × volumen (Estrella, Caballo de trabajo, Joya escondida, Hueso), con los umbrales de la propia
 *    empresa y dichos en voz alta: no es la regla del 70 % de la ingeniería de menú;
 *  - el 90/10: qué pocas líneas dejan casi todo;
 *  - el punto de equilibrio en unidades con la mezcla de hoy;
 *  - las palancas («si subes el precio un 5 % y vendes lo mismo, deja S/ X más al mes»);
 *  - lo que se queda en el camino al cobrar en otra moneda, operación por operación;
 *  - el dinero en la calle por vender al crédito, y lo que se dijo del inventario.
 *
 * REGLAS QUE NO SE NEGOCIAN
 *  1. Nada se calcula con un «no lo sé». Lo que falta se nombra (`motivos`, `faltan`) y el resultado es null.
 *  2. Un rango se arrastra como rango (aritmética de intervalos, src/lib/dato-oral.ts); nunca se vuelve su promedio
 *     a escondidas. Donde una cuenta necesita un número (ordenar, umbrales, 90/10) se usa el centro y se dice.
 *  3. Todo resultado que sale de un rango o de un estimado lo dice en `supuestos`. Cada cálculo es un `Calculo<T>`
 *     de finanzas.ts: fórmula, supuestos y limitaciones, para explicarlo con `explicarCalculo`.
 *  4. Nunca se dice «vas a ganar»: se dice «si…, deja S/ X más al mes».
 *
 * Puro: sin base, sin red, sin IA.
 */
import { puntoEquilibrio, type Calculo } from "./finanzas";
import { moneda as enMoneda, porDefecto, type ConfigEmpresa } from "./formato";
import { normalizarMetrica, type Metrica } from "./metricas";
import { MODELO, type ModeloNegocio } from "./negocio";
import { mesesDePeriodo, nombreDePeriodoLinea, periodoValido, costoDesdePartes, type LineaProducto } from "./producto";
import {
  centro, esExacto, escalarRango, multiplicarRangos, peorEstado, rangoDe, restarRangos, sumarRangos, textoRango, estadoDatoDesdeMetrica,
  type DatoOral, type EstadoDato, type Rango,
} from "./dato-oral";
import {
  EsquemaCredito, EsquemaHistoria, EsquemaInventario, EsquemaModulos, EsquemaMoneda, EsquemaTotales, lecturaDatosModelo, cobraPorHora,
  type Credito, type Historia, type Inventario, type Modulos, type Moneda, type Totales,
} from "./esquemas-negocio";

// ─── Tipos ───────────────────────────────────────────────────────────────────────────────────────

export type CostoMes = { id: string; periodo: string; tipo: "fijo" | "comercializacion"; nombre: string; dato: DatoOral; nota: string | null };
export type FichaNegocio = { historia: Historia; modulos: Modulos; totales: Totales; moneda: Moneda; credito: Credito; inventario: Inventario };
export type OperacionMoneda = {
  id: string;
  fecha_venta: string | null;
  fecha_cobro: string | null;
  dias_cobro: number | null;
  moneda: string;
  monto: number;
  tc_cotizado: number | null;
  tc_cobro: number | null;
  recibido: number | null;
  comisiones: number | null;
  conversiones: 1 | 2 | null;
  estado: EstadoDato;
};

export type Cuadrante = "estrella" | "caballo" | "joya" | "hueso" | "en_el_borde";
export const CUADRANTE_TEXTO: Record<Cuadrante, { nombre: string; que_es: string }> = {
  estrella: { nombre: "Estrella", que_es: "deja mucho y se vende mucho" },
  caballo: { nombre: "Caballo de trabajo", que_es: "se vende mucho y deja poco" },
  joya: { nombre: "Joya escondida", que_es: "deja mucho y se vende poco" },
  hueso: { nombre: "Hueso", que_es: "deja poco y se vende poco" },
  en_el_borde: { nombre: "En el borde", que_es: "con lo que se sabe, cae a los dos lados del umbral" },
};

export type ProductoRentable = {
  id: string;
  nombre: string;
  grupo: string | null;
  modelo: ModeloNegocio | null;
  precio_efectivo: Rango | null;
  costo: Rango | null;
  costo_partes: { nombre: string; rango: Rango | null; estado: EstadoDato }[];
  margen_unitario: Rango | null;
  margen_pct: Rango | null;
  unidades_mes: Rango | null;
  fuente_unidades: "mes" | "periodo" | "de_cada_10" | null;
  contribucion_mes: Rango | null;
  cuadrante: Cuadrante | null;
  estados: { precio: EstadoDato | null; costo: EstadoDato | null; unidades: EstadoDato | null };
  motivos: string[];
};

export type PedidoPalanca = { tipo: "precio"; lineaId: string; pct: number } | { tipo: "parte"; lineaId: string; parte: string; pct: number } | { tipo: "volumen"; lineaId: string; pct: number };

export type FugaOperacion = {
  id: string;
  esperado: number | null;
  referencia: number | null;
  por_tipo_de_cambio: number | null;
  por_comisiones: number | null;
  por_conversion: number | null;
  /** Con `completa`, lo que se quedó en el camino; sin ella, lo que se sabe que se perdió COMO MÍNIMO (o null). */
  total: number | null;
  pct: number | null;
  /** true solo con lo que se esperaba Y lo que llegó a la cuenta: la única cuenta entera. */
  completa: boolean;
  motivos: string[];
};

export type TableroRentabilidad = {
  productos: ProductoRentable[];
  umbrales: { margen_unitario: number | null; unidades_mes: number | null; con_datos: number; de: number; regla: string };
  matriz: Record<Cuadrante, string[]> & { sin_dato: string[] };
  noventaDiez: Calculo<{ lineas: string[]; cuantas: number; de: number; pct_lineas: number; pct_contribucion: number; restan: string[] }>;
  fijos: { total: Rango | null; fuente: "costos_mes" | "vital" | null; filas: number; vital: number | null; diferencia_pct: number | null; solo_fijos: Rango | null; comercializacion: Rango | null };
  equilibrio: Calculo<{ unidades: Rango; por_producto: { id: string; unidades: Rango }[]; soles: number; vendes_hoy: Rango | null }>;
  palancasSugeridas: PedidoPalanca[];
  moneda: {
    operaciones: FugaOperacion[];
    /**
     * Suma SOLO las ventas con lo que se esperaba y lo que llegó a la cuenta. `al_menos`: lo que se sabe perdido en las
     * ventas sin lo que llegó (solo el tipo de cambio y el banco); va aparte, nunca dentro de `perdido`.
     */
    resumen: Calculo<{ esperado: number; recibido: number; perdido: number; pct: number; mes_estimado: Rango | null; al_menos: number | null }>;
  } | null;
  credito: Calculo<{ dinero_en_la_calle: Rango; perdida_mes: Rango | null }> | null;
  inventario: Calculo<{ dinero_parado: Rango | null; meses: Rango | null }> | null;
  faltan: string[];
};

// ─── La ficha ────────────────────────────────────────────────────────────────────────────────────

export const FICHA_VACIA: Readonly<FichaNegocio> = Object.freeze({ historia: {}, modulos: {}, totales: {}, moneda: {}, credito: {}, inventario: {} });

type EsquemaBloque = {
  safeParse: (v: unknown) => { success: boolean; data?: unknown };
  shape: Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>;
};

/**
 * La ficha tal como viene de la base: cada bloque se valida por separado. Si un bloque no calza entero con su forma
 * (escrito a mano en la base, de una versión vieja, con una llave de más), se lee CAMPO POR CAMPO: lo que calza se
 * usa, lo que no se deja fuera —no se adivina— y se anota en el registro del servidor. Antes, una sola llave de más
 * dejaba vacío el bloque entero y sin aviso: la historia guardada desaparecía de la vista. Sin fila, todo vacío.
 */
export function fichaDesdeFila(f: Record<string, unknown> | null | undefined): FichaNegocio {
  const leer = <T>(bloque: string, esquema: EsquemaBloque, v: unknown): T => {
    const r = esquema.safeParse(v ?? {});
    if (r.success) return r.data as T;
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      console.warn(`[ficha] el bloque «${bloque}» no es un objeto: se deja vacío`);
      return {} as T;
    }
    const crudo = v as Record<string, unknown>;
    const salida: Record<string, unknown> = {};
    const fuera: string[] = [];
    for (const [k, campo] of Object.entries(esquema.shape)) {
      if (!(k in crudo)) continue;
      const rc = campo.safeParse(crudo[k]);
      if (rc.success) {
        if (rc.data !== undefined) salida[k] = rc.data;
      } else fuera.push(k);
    }
    const desconocidas = Object.keys(crudo).filter((k) => !(k in esquema.shape));
    console.warn(`[ficha] el bloque «${bloque}» no calzó entero con su forma: se leyó campo por campo`, { fuera, desconocidas });
    return salida as T;
  };
  return {
    historia: leer<Historia>("historia", EsquemaHistoria, f?.historia),
    modulos: leer<Modulos>("modulos", EsquemaModulos, f?.modulos),
    totales: leer<Totales>("totales", EsquemaTotales, f?.totales),
    moneda: leer<Moneda>("moneda", EsquemaMoneda, f?.moneda),
    credito: leer<Credito>("credito", EsquemaCredito, f?.credito),
    inventario: leer<Inventario>("inventario", EsquemaInventario, f?.inventario),
  };
}

// ─── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

const llaveGrupo = (g: string | null | undefined) => (g ?? "").trim().toLowerCase();
const plata = (cfg: ConfigEmpresa) => (n: number) => enMoneda(n, cfg, { decimales: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 });
const unidades = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1 });
const redondea = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const SIN_PERIODO = "un mes normal";

/** El total de un grupo para «de cada 10»: el del grupo si se dijo, si no el de toda la empresa (clave ""). */
function totalDeGrupo(f: FichaNegocio, grupo: string | null): { dato: DatoOral; de: "grupo" | "empresa" } | null {
  const grupos = f.totales.grupos ?? {};
  const k = llaveGrupo(grupo);
  for (const [nombre, dato] of Object.entries(grupos)) if (dato && llaveGrupo(nombre) === k && k !== "") return { dato, de: "grupo" };
  for (const [nombre, dato] of Object.entries(grupos)) if (dato && llaveGrupo(nombre) === "") return { dato, de: "empresa" };
  return null;
}

/** El número más reciente de una clave de los 9 (mes AAAA-MM más reciente; si no hay, el «actual»). Nunca la época dorada. */
export function vitalMasReciente(metricas: Metrica[], clave: string): { valor: number; periodo: string; estado: string | null } | null {
  const candidatas = metricas
    .map((m) => ({ n: normalizarMetrica(m.clave, m.periodo), m }))
    .filter(({ n, m }) => n.clave === clave && n.periodo !== "epoca_dorada" && m.valor != null && Number.isFinite(Number(m.valor)) && m.estado !== "descartado");
  if (!candidatas.length) return null;
  candidatas.sort((a, b) => {
    const pa = a.n.periodo === "actual" ? "" : a.n.periodo;
    const pb = b.n.periodo === "actual" ? "" : b.n.periodo;
    return pb.localeCompare(pa);
  });
  const { n, m } = candidatas[0]!;
  return { valor: Number(m.valor), periodo: n.periodo, estado: (m.estado as string | null | undefined) ?? null };
}

// ─── Por producto ────────────────────────────────────────────────────────────────────────────────

/**
 * Cuánto vende una línea en un mes normal, en este orden: lo que dijo al mes (exacto o rango); si no, lo del periodo
 * entre los meses del periodo (es un promedio, y se dice); si no, sus «de cada 10» por el total de su grupo (o de
 * toda la empresa) entre 10. La conversión de lo dicho por trimestre o por día la hace la pantalla al guardar.
 */
export function volumenMensual(l: LineaProducto, f: FichaNegocio): { rango: Rango | null; fuente: ProductoRentable["fuente_unidades"]; motivo: string | null } {
  if (l.unidades_mes != null) return { rango: { bajo: l.unidades_mes, alto: l.unidades_mes }, fuente: "mes", motivo: null };
  if (l.unidades_mes_desde != null && l.unidades_mes_hasta != null) {
    return { rango: { bajo: Math.min(l.unidades_mes_desde, l.unidades_mes_hasta), alto: Math.max(l.unidades_mes_desde, l.unidades_mes_hasta) }, fuente: "mes", motivo: null };
  }
  if (l.unidades_periodo != null && l.periodo && periodoValido(l.periodo)) {
    const meses = mesesDePeriodo(l.periodo) ?? 1;
    const v = l.unidades_periodo / meses;
    return { rango: { bajo: v, alto: v }, fuente: "periodo", motivo: meses > 1 ? `promedio de ${nombreDePeriodoLinea(l.periodo)} (${meses} meses)` : null };
  }
  // «De cada 10»: el número dicho o, si dijo un rango («3 o 4»), el rango; el rango se arrastra como rango.
  const parte: Rango | null = l.participacion_de_10 != null ? { bajo: l.participacion_de_10, alto: l.participacion_de_10 } : lecturaDatosModelo(l.datos_modelo).rangoDeCada10;
  if (parte) {
    const total = totalDeGrupo(f, l.grupo ?? null);
    const quien = l.grupo?.trim() ? `«${l.grupo.trim()}»` : "productos";
    const dijo = esExacto(parte) ? unidades(parte.bajo) : `${unidades(parte.bajo)} a ${unidades(parte.alto)}`;
    if (!total) return { rango: null, fuente: null, motivo: `falta: cuántos ${quien} vende en total en un mes normal (dijo ${dijo} de cada 10)` };
    const r = rangoDe(total.dato);
    if (!r) return { rango: null, fuente: null, motivo: `falta: cuántos ${total.de === "grupo" ? quien : "productos"} vende en total en un mes normal (está como «no lo sé»)` };
    // Total × parte ÷ 10, con los dos no negativos: el bajo con el bajo y el alto con el alto (÷10 al final, sin redondeos de 0,1).
    return { rango: { bajo: (r.bajo * parte.bajo) / 10, alto: (r.alto * parte.alto) / 10 }, fuente: "de_cada_10", motivo: null };
  }
  return { rango: null, fuente: null, motivo: "falta: cuánto vende en un mes normal" };
}

/** Lo que falta del precio, en palabras del dueño: el precio, o (cobrando por hora) cuántas horas lleva cada caso. */
function faltaDelPrecio(l: LineaProducto, unidad: string): string | null {
  const dm = lecturaDatosModelo(l.datos_modelo);
  const hayPrecio = l.precio != null || dm.rangoPrecio != null;
  if (!hayPrecio) return "el precio";
  if (cobraPorHora(l) && !(l.horas_por_unidad != null && l.horas_por_unidad > 0)) return `cuántas horas te lleva cada ${unidad}`;
  return null;
}

/** Lo que deja una línea, con lo que falta nombrado. El cuadrante lo pone tableroRentabilidad (necesita a las demás). */
export function productoRentable(l: LineaProducto, f: FichaNegocio, cfg: ConfigEmpresa = porDefecto): ProductoRentable {
  const motivos: string[] = [];
  const fmt = plata(cfg);
  const estadosLinea = l.estados ?? {};

  const dm = lecturaDatosModelo(l.datos_modelo);
  const unidad = l.modelo ? MODELO[l.modelo].unidad.singular : l.tipo === "servicio" ? "caso" : "unidad";

  // 1 · Precio. El número dicho o, si dijo un rango, el rango (la columna manda si tiene número). Cobrando por hora,
  //     el precio de un caso es precio por hora × horas que lleva un caso: sin las horas no hay precio de un caso, y
  //     restarle el costo de un caso al precio de UNA hora daría un margen falso.
  let base: Rango | null = l.precio != null ? { bajo: l.precio, alto: l.precio } : dm.rangoPrecio;
  if (!base) motivos.push("falta: el precio");
  const porHora = cobraPorHora(l);
  if (porHora) {
    const horas = l.horas_por_unidad;
    if (horas == null || !(horas > 0)) {
      motivos.push(`falta: cuántas horas lleva un ${unidad} (cobra por hora)`);
      base = null;
    } else if (base) base = escalarRango(base, horas);
  }

  // Con dos precios y «de cada 10» (número o rango), el promedio ponderado: (p × (10 − k) + segundo × k) / 10 es lineal
  // en p y en k por separado, así que sus extremos están en las esquinas. Sin el «de cada 10», el rango entre los dos.
  let precio_efectivo: Rango | null = null;
  if (base && (l.precio_segundo == null || porHora)) precio_efectivo = base;
  else if (base && l.precio_segundo != null) {
    const s = l.precio_segundo;
    const k: Rango | null = l.de_cada_10_segundo != null ? { bajo: l.de_cada_10_segundo, alto: l.de_cada_10_segundo } : dm.rangoDeCada10Segundo;
    if (k) {
      const esquinas = [base.bajo, base.alto].flatMap((p) => [k.bajo, k.alto].map((x) => (p * (10 - x) + s * x) / 10));
      precio_efectivo = { bajo: Math.min(...esquinas), alto: Math.max(...esquinas) };
    } else {
      precio_efectivo = { bajo: Math.min(base.bajo, s), alto: Math.max(base.alto, s) };
      motivos.push(`falta: de cada 10 ventas, cuántas van ${l.segundo_precio_es === "minimo" ? "al precio mínimo" : "por mayor"}`);
    }
  }

  // 2 · Costo: por partes (todas con número), o el costo por unidad dicho (número, o rango si dijo un rango).
  const partes = l.componentes_costo ?? [];
  const costo_partes = partes.map((p) => ({ nombre: p.nombre, rango: rangoDe(p), estado: p.estado }));
  let costo: Rango | null = null;
  let estadoCosto: EstadoDato | null = estadosLinea.costo ?? null;
  if (partes.length) {
    const c = costoDesdePartes(partes);
    costo = c.rango;
    estadoCosto = c.estado;
    if (!c.rango) motivos.push(c.conocido ? `costo de al menos ${fmt(c.conocido.bajo)}; falta: ${c.faltan.join(", ")}` : `falta: el costo de ${c.faltan.join(", ")}`);
  } else if (l.costo_variable_unitario != null) {
    costo = { bajo: l.costo_variable_unitario, alto: l.costo_variable_unitario };
  } else if (dm.rangoCosto) {
    costo = dm.rangoCosto;
  } else {
    motivos.push(`falta: lo que cuesta cada ${unidad}`);
  }

  // 3 · Volumen mensual.
  const vol = volumenMensual(l, f);
  if (vol.motivo) motivos.push(vol.motivo);
  let estadoUnidades: EstadoDato | null = estadosLinea.unidades ?? null;
  if (vol.fuente === "de_cada_10") {
    const total = totalDeGrupo(f, l.grupo ?? null);
    estadoUnidades = peorEstado([estadoUnidades, total?.dato.estado, "estimado"]);
  }

  const margen_unitario = precio_efectivo && costo ? restarRangos(precio_efectivo, costo) : null;
  let margen_pct: Rango | null = null;
  if (precio_efectivo && costo && precio_efectivo.bajo > 0) {
    // (p − c) / p = 1 − c / p: el peor caso es el costo alto con el precio bajo.
    margen_pct = { bajo: 1 - costo.alto / precio_efectivo.bajo, alto: 1 - costo.bajo / precio_efectivo.alto };
  }
  const contribucion_mes = margen_unitario && vol.rango ? multiplicarRangos(margen_unitario, vol.rango) : null;

  return {
    id: l.id,
    nombre: l.nombre,
    grupo: l.grupo?.trim() || null,
    modelo: l.modelo ?? null,
    precio_efectivo,
    costo,
    costo_partes,
    margen_unitario,
    margen_pct,
    unidades_mes: vol.rango,
    fuente_unidades: vol.rango ? vol.fuente : null,
    contribucion_mes,
    cuadrante: null,
    estados: { precio: precio_efectivo ? estadosLinea.precio ?? null : null, costo: costo ? estadoCosto : null, unidades: vol.rango ? estadoUnidades : null },
    motivos,
  };
}

// ─── El tablero de la consultora ─────────────────────────────────────────────────────────────────

const REGLA_UMBRALES =
  "Umbral de margen: el promedio ponderado por unidades de lo que deja cada unidad (Σ lo que deja al mes / Σ unidades, con los centros de los rangos). Umbral de volumen: el promedio simple de unidades al mes. Igual al umbral cuenta como alto. Son los números de esta empresa; no es la regla del 70 % de la ingeniería de menú.";

function clasificar(r: Rango, umbral: number): "alto" | "bajo" | "borde" {
  if (r.bajo >= umbral) return "alto";
  if (r.alto < umbral) return "bajo";
  return "borde";
}

function cuadranteDe(margen: Rango, volumen: Rango, um: number, uv: number): Cuadrante {
  const m = clasificar(margen, um);
  const v = clasificar(volumen, uv);
  if (m === "borde" || v === "borde") return "en_el_borde";
  if (m === "alto" && v === "alto") return "estrella";
  if (m === "bajo" && v === "alto") return "caballo";
  if (m === "alto" && v === "bajo") return "joya";
  return "hueso";
}

/** ¿Lo que deja este producto sale de algún dato a ojo (estimado, rango o «de cada 10»)? */
function esAOjo(p: ProductoRentable): boolean {
  if ([p.precio_efectivo, p.costo, p.unidades_mes].some((r) => r && !esExacto(r))) return true;
  return p.estados.precio === "estimado" || p.estados.costo === "estimado" || p.estados.unidades === "estimado" || p.fuente_unidades === "de_cada_10";
}

/** Si algún dato del cálculo es un rango o un estimado, se dice. */
function supuestosDeDatos(ps: ProductoRentable[]): string[] {
  const s: string[] = [];
  const conRango = ps.some((p) => [p.precio_efectivo, p.costo, p.unidades_mes].some((r) => r && !esExacto(r)));
  if (conRango) s.push("Algunos datos se dieron como rango: donde hace falta un solo número se usa el centro del rango.");
  const estimados = ps.some((p) => p.estados.precio === "estimado" || p.estados.costo === "estimado" || p.estados.unidades === "estimado" || p.fuente_unidades === "de_cada_10");
  if (estimados) s.push("Hay datos calculados a ojo (estimados): el resultado vale como estimado.");
  return s;
}

type EntradaTablero = { lineas: LineaProducto[]; costos: CostoMes[]; ficha: FichaNegocio; operaciones: OperacionMoneda[]; metricas: Metrica[]; config: ConfigEmpresa; periodo?: string };

export function tableroRentabilidad(e: EntradaTablero): TableroRentabilidad {
  const cfg = e.config ?? porDefecto;
  const fmt = plata(cfg);
  const faltan: string[] = [];
  const productos = e.lineas.map((l) => productoRentable(l, e.ficha, cfg));
  const conDatos = productos.filter((p) => p.margen_unitario && p.unidades_mes && p.contribucion_mes);

  // ── Umbrales y matriz
  const matriz: TableroRentabilidad["matriz"] = { estrella: [], caballo: [], joya: [], hueso: [], en_el_borde: [], sin_dato: [] };
  const sumaUnidades = conDatos.reduce((s, p) => s + centro(p.unidades_mes!), 0);
  const sumaContrib = conDatos.reduce((s, p) => s + centro(p.contribucion_mes!), 0);
  let umbralMargen: number | null = null;
  let umbralVolumen: number | null = null;
  if (conDatos.length >= 3 && sumaUnidades > 0) {
    umbralMargen = sumaContrib / sumaUnidades;
    umbralVolumen = sumaUnidades / conDatos.length;
    for (const p of conDatos) {
      p.cuadrante = cuadranteDe(p.margen_unitario!, p.unidades_mes!, umbralMargen, umbralVolumen);
      matriz[p.cuadrante].push(p.id);
    }
  } else if (productos.length) {
    faltan.push(conDatos.length < 3 ? "con menos de 3 productos con datos no hay con qué comparar" : "ningún producto tiene unidades al mes: no hay matriz");
  }
  for (const p of productos) if (!conDatos.includes(p)) matriz.sin_dato.push(p.id);
  if (matriz.sin_dato.length && productos.length) faltan.push(`${matriz.sin_dato.length} de ${productos.length} productos sin precio, costo o cuánto se vende al mes`);

  // ── 90/10
  const supuestos = supuestosDeDatos(conDatos);
  const baseNoventa = {
    formula: "se ordenan las líneas por lo que dejan al mes (precio − costo) × unidades, de mayor a menor, y se toma el menor grupo que llega al 90 % de lo que dejan todas las que dejan algo",
    periodo: SIN_PERIODO,
    fuentes: ["lineas_producto"],
    supuestos: [...supuestos],
    limitaciones: [] as string[],
  };
  if (conDatos.length < productos.length && conDatos.length) baseNoventa.limitaciones.push(`Entre las ${conDatos.length} líneas con datos completos, de ${productos.length}.`);
  const positivas = conDatos.filter((p) => centro(p.contribucion_mes!) > 0).sort((a, b) => centro(b.contribucion_mes!) - centro(a.contribucion_mes!));
  const restan = conDatos.filter((p) => centro(p.contribucion_mes!) < 0).map((p) => p.id);
  if (restan.length) baseNoventa.limitaciones.push(`${restan.length} línea(s) restan: cuestan más de lo que dejan; van aparte.`);
  let noventaDiez: TableroRentabilidad["noventaDiez"];
  if (!positivas.length) {
    noventaDiez = { ...baseNoventa, valor: null, motivo_nulo: conDatos.length ? "ninguna línea con datos deja algo al mes" : "ninguna línea tiene precio, costo y cuánto se vende al mes" };
  } else {
    const total = positivas.reduce((s, p) => s + centro(p.contribucion_mes!), 0);
    const grupo: string[] = [];
    let acumulado = 0;
    for (const p of positivas) {
      grupo.push(p.id);
      acumulado += centro(p.contribucion_mes!);
      if (acumulado >= 0.9 * total - 1e-9) break;
    }
    noventaDiez = {
      ...baseNoventa,
      valor: { lineas: grupo, cuantas: grupo.length, de: conDatos.length, pct_lineas: redondea(grupo.length / conDatos.length), pct_contribucion: redondea(acumulado / total), restan },
    };
  }

  // ── Fijos del mes
  const periodo = e.periodo ?? "mes_tipico";
  const filas = e.costos.filter((c) => c.periodo === periodo);
  const rangosDe = (tipo: CostoMes["tipo"]) => filas.filter((c) => c.tipo === tipo).map((c) => rangoDe(c.dato));
  const soloFijos = filas.some((c) => c.tipo === "fijo") ? sumarRangos(rangosDe("fijo")) : null;
  const comercializacion = filas.some((c) => c.tipo === "comercializacion") ? sumarRangos(rangosDe("comercializacion")) : null;
  const vital = vitalMasReciente(e.metricas, "gasto_fijo_mes");
  let fijosTotal: Rango | null = null;
  let fuenteFijos: TableroRentabilidad["fijos"]["fuente"] = null;
  // Los gastos anotados con «no lo sé»: el motivo del equilibrio los nombra, en vez de decir que no hay gastos.
  const sinNumero = filas.filter((c) => !rangoDe(c.dato)).map((c) => c.nombre);
  if (filas.length) {
    fijosTotal = sumarRangos(filas.map((c) => rangoDe(c.dato)));
    fuenteFijos = "costos_mes";
    if (sinNumero.length) faltan.push(`gastos del mes sin monto («no lo sé»): ${sinNumero.join(", ")}; sin ellos no hay total de gastos`);
  } else if (vital) {
    fijosTotal = { bajo: vital.valor, alto: vital.valor };
    fuenteFijos = "vital";
  } else {
    faltan.push("faltan los gastos del mes (ni en la tabla de gastos ni en los 9 números)");
  }
  let diferencia_pct: number | null = null;
  if (filas.length && vital && soloFijos && vital.valor > 0) {
    diferencia_pct = redondea(((centro(soloFijos) - vital.valor) / vital.valor) * 100, 1);
    if (Math.abs(diferencia_pct) > 10) faltan.push(`los gastos fijos de la tabla (${textoRango(soloFijos, fmt)}) y los de los 9 números (${fmt(vital.valor)}) difieren ${Math.abs(diferencia_pct)} %: se informa, no se elige`);
  }
  const fijos: TableroRentabilidad["fijos"] = { total: fijosTotal, fuente: fuenteFijos, filas: filas.length, vital: vital?.valor ?? null, diferencia_pct, solo_fijos: soloFijos, comercializacion };

  // ── Equilibrio
  const equilibrio = calcularEquilibrio(conDatos, productos.length, fijos, supuestos, fmt, sinNumero);

  // ── Palancas sugeridas: las 3 de más volumen, precio +5 % y su parte más cara −10 %.
  const palancasSugeridas: PedidoPalanca[] = [];
  for (const p of [...conDatos].sort((a, b) => centro(b.unidades_mes!) - centro(a.unidades_mes!)).slice(0, 3)) {
    palancasSugeridas.push({ tipo: "precio", lineaId: p.id, pct: 5 });
    const cara = p.costo_partes.filter((c) => c.rango).sort((a, b) => centro(b.rango!) - centro(a.rango!))[0];
    if (cara) palancasSugeridas.push({ tipo: "parte", lineaId: p.id, parte: cara.nombre, pct: 10 });
  }

  // ── Moneda, crédito, inventario
  const monedaActiva = e.ficha.modulos.moneda === true || e.operaciones.length > 0;
  const moneda = monedaActiva ? resumenMoneda(e.operaciones, e.ficha, fmt) : null;
  const creditoActivo = e.ficha.modulos.credito === true || Object.keys(e.ficha.credito ?? {}).length > 0;
  const credito = creditoActivo ? calcularCredito(e.ficha.credito, e.metricas, fmt) : null;
  const inventarioActivo = e.ficha.modulos.inventario === true || Object.keys(e.ficha.inventario ?? {}).length > 0;
  const inventario = inventarioActivo ? calcularInventario(e.ficha.inventario) : null;

  return {
    productos,
    umbrales: { margen_unitario: umbralMargen, unidades_mes: umbralVolumen, con_datos: conDatos.length, de: productos.length, regla: REGLA_UMBRALES },
    matriz,
    noventaDiez,
    fijos,
    equilibrio,
    palancasSugeridas,
    moneda,
    credito,
    inventario,
    faltan,
  };
}

/** Σ de rangos de una lista de productos ya filtrados con datos. */
const sumaDe = (ps: ProductoRentable[], campo: "contribucion_mes" | "unidades_mes"): Rango => ps.reduce((s, p) => ({ bajo: s.bajo + p[campo]!.bajo, alto: s.alto + p[campo]!.alto }), { bajo: 0, alto: 0 });

/**
 * Lo que deja en promedio cada unidad de la mezcla: el promedio de lo que deja cada producto, pesado por cuántas vende
 * (el centro de su rango). El rango de lo que deja cada uno se conserva. Con unidades exactas es Σ lo que deja al mes /
 * Σ unidades. Dividir un rango de lo que deja al mes entre un rango de unidades lo ensancharía de mentira: esas dos
 * cosas se mueven juntas. `cambio` aplica una palanca: más (o menos) por unidad, o más unidades de una línea.
 */
function margenDeLaMezcla(ps: ProductoRentable[], cambio?: { id: string; masPorUnidad?: Rango; factorUnidades?: number }): Rango | null {
  let peso = 0;
  let bajo = 0;
  let alto = 0;
  for (const p of ps) {
    const esta = cambio?.id === p.id;
    const w = centro(p.unidades_mes!) * (esta && cambio?.factorUnidades ? cambio.factorUnidades : 1);
    const m = esta && cambio?.masPorUnidad ? { bajo: p.margen_unitario!.bajo + cambio.masPorUnidad.bajo, alto: p.margen_unitario!.alto + cambio.masPorUnidad.alto } : p.margen_unitario!;
    peso += w;
    bajo += w * m.bajo;
    alto += w * m.alto;
  }
  return peso > 0 ? { bajo: bajo / peso, alto: alto / peso } : null;
}

/** Unidades para cubrir los fijos con un margen por unidad (rango). null si el margen puede ser cero o negativo. */
function unidadesParaCubrir(fijos: Rango, margenPorUnidad: Rango): Rango | null {
  if (margenPorUnidad.bajo <= 0) return null;
  return { bajo: fijos.bajo / margenPorUnidad.alto, alto: fijos.alto / margenPorUnidad.bajo };
}

function calcularEquilibrio(
  conDatos: ProductoRentable[],
  totalLineas: number,
  fijos: TableroRentabilidad["fijos"],
  supuestos: string[],
  fmt: (n: number) => string,
  gastosSinMonto: string[] = []
): TableroRentabilidad["equilibrio"] {
  const base = {
    formula:
      "unidades de equilibrio = gastos del mes / (Σ lo que deja cada producto al mes / Σ unidades al mes), con la mezcla de hoy; por producto, según su parte de las unidades; en dinero, gastos del mes / (Σ lo que deja al mes / Σ ventas al mes)",
    periodo: SIN_PERIODO,
    fuentes: ["lineas_producto", fijos.fuente === "vital" ? "company_metricas · gasto_fijo_mes (de tus 9 números)" : "costos_mes"],
    supuestos: ["La mezcla de hoy se mantiene: si cambia qué se vende, cambia el punto de equilibrio.", ...supuestos],
    limitaciones: [] as string[],
  };
  if (fijos.fuente === "vital") base.supuestos.push("Los gastos del mes salen de tus 9 números (gasto fijo), no de la tabla de gastos.");
  if (totalLineas && conDatos.length < 0.8 * totalLineas) base.limitaciones.push(`Solo ${conDatos.length} de ${totalLineas} productos tienen precio, costo y cuánto se vende al mes: el punto de equilibrio sale de esos.`);
  if (fijos.diferencia_pct != null && Math.abs(fijos.diferencia_pct) > 10) base.limitaciones.push(`Los gastos fijos de la tabla y los de los 9 números difieren ${Math.abs(fijos.diferencia_pct)} %.`);
  if (!fijos.total) {
    // Hay gastos anotados, pero alguno quedó en «no lo sé»: se dice cuál falta, no que no hay gastos.
    if (gastosSinMonto.length) {
      const nombres = gastosSinMonto.map((n) => `«${n}»`).join(", ");
      const motivo = gastosSinMonto.length === 1 ? `falta el monto de ${nombres} en los gastos del mes` : `faltan los montos de ${nombres} en los gastos del mes`;
      return { ...base, valor: null, motivo_nulo: `${motivo}: sin ${gastosSinMonto.length === 1 ? "él" : "ellos"} no hay total de gastos ni punto de equilibrio` };
    }
    const pe = puntoEquilibrio({ costos_fijos: null, razon_mc: null });
    return { ...base, valor: null, motivo_nulo: pe.motivo_nulo };
  }
  if (!conDatos.length) return { ...base, valor: null, motivo_nulo: "ningún producto tiene precio, costo y cuánto se vende al mes: no hay mezcla con que calcular" };
  const sumaC = sumaDe(conDatos, "contribucion_mes");
  const sumaU = sumaDe(conDatos, "unidades_mes");
  const ventasC = conDatos.reduce((s, p) => s + centro(p.precio_efectivo!) * centro(p.unidades_mes!), 0);
  const razon = ventasC > 0 ? centro(sumaC) / ventasC : null;
  const pe = puntoEquilibrio({ costos_fijos: centro(fijos.total), razon_mc: razon, periodo: SIN_PERIODO });
  if (!pe.valor) return { ...base, valor: null, motivo_nulo: pe.motivo_nulo };
  const margenPorUnidad = margenDeLaMezcla(conDatos) ?? { bajo: 0, alto: 0 };
  const u = unidadesParaCubrir(fijos.total, margenPorUnidad);
  if (!u) {
    return { ...base, valor: null, motivo_nulo: `con los rangos que se dieron, lo que deja cada unidad de la mezcla podría ser cero o negativo (${textoRango(margenPorUnidad, fmt)}): no hay un punto de equilibrio que decir` };
  }
  const totalU = centro(sumaU);
  const por_producto = conDatos.map((p) => ({ id: p.id, unidades: escalarRango(u, totalU > 0 ? centro(p.unidades_mes!) / totalU : 0) }));
  return { ...base, valor: { unidades: u, por_producto, soles: pe.valor.soles, vendes_hoy: sumaU } };
}

// ─── Palancas ────────────────────────────────────────────────────────────────────────────────────

/**
 * «Si vendes lo mismo»: cuánto más deja al mes subir el precio, bajar una parte del costo o vender más de una línea.
 * Precio +x %: Δ = precio × x × unidades, y cuánto volumen se puede perder sin perder dinero = 1 − margen viejo /
 * margen nuevo. Parte −y %: Δ = parte × y × unidades. Volumen +z %: Δ = margen × unidades × z. Nunca «vas a ganar».
 */
export function palanca(
  t: TableroRentabilidad,
  p: PedidoPalanca
): Calculo<{ delta_mes: Rango; nuevo_margen_unitario: Rango; volumen_que_se_puede_perder_pct: number | null; nuevo_equilibrio_unidades: Rango | null }> {
  const prod = t.productos.find((x) => x.id === p.lineaId);
  const que = p.tipo === "precio" ? `el precio sube ${p.pct} %` : p.tipo === "parte" ? `«${p.parte}» cuesta ${p.pct} % menos` : `se vende ${p.pct} % más`;
  const base = {
    formula:
      p.tipo === "precio"
        ? "lo que deja de más al mes = precio × % de subida × unidades al mes; volumen que se puede perder sin perder dinero = 1 − lo que dejaba cada unidad / lo que deja ahora"
        : p.tipo === "parte"
          ? "lo que deja de más al mes = costo de la parte × % de baja × unidades al mes"
          : "lo que deja de más al mes = lo que deja cada unidad × unidades al mes × % de aumento",
    periodo: SIN_PERIODO,
    fuentes: prod ? [`lineas_producto · ${prod.nombre}`] : [],
    supuestos: [p.tipo === "volumen" ? `Si ${que} y lo demás sigue igual.` : `Si ${que} y vendes la misma cantidad que hoy.`],
    limitaciones: ["Es una cuenta, no una promesa: dice cuánto deja SI pasa, no que vaya a pasar."],
  };
  if (!prod) return { ...base, valor: null, motivo_nulo: "esa línea no está en el tablero" };
  if (!prod.margen_unitario || !prod.unidades_mes || !prod.precio_efectivo) return { ...base, valor: null, motivo_nulo: `«${prod.nombre}» no tiene precio, costo y cuánto se vende al mes: ${prod.motivos.join("; ") || "faltan datos"}` };
  if (!Number.isFinite(p.pct) || p.pct <= 0) return { ...base, valor: null, motivo_nulo: "el porcentaje tiene que ser mayor que cero" };
  const supuestosDato = supuestosDeDatos([prod]);
  base.supuestos.push(...supuestosDato);

  let deltaUnit: Rango;
  let delta_mes: Rango;
  let nuevo_margen_unitario: Rango;
  let volumen_que_se_puede_perder_pct: number | null = null;
  if (p.tipo === "precio") {
    deltaUnit = escalarRango(prod.precio_efectivo, p.pct / 100);
    delta_mes = multiplicarRangos(deltaUnit, prod.unidades_mes);
    nuevo_margen_unitario = { bajo: prod.margen_unitario.bajo + deltaUnit.bajo, alto: prod.margen_unitario.alto + deltaUnit.alto };
    const viejo = centro(prod.margen_unitario);
    const nuevo = centro(nuevo_margen_unitario);
    if (viejo > 0 && nuevo > 0) volumen_que_se_puede_perder_pct = redondea((1 - viejo / nuevo) * 100, 1);
    else base.limitaciones.push("Hoy esta línea no deja nada por unidad: no hay volumen que «se pueda perder» sin perder dinero que calcular.");
  } else if (p.tipo === "parte") {
    const parte = prod.costo_partes.find((c) => c.nombre.trim().toLowerCase() === p.parte.trim().toLowerCase());
    if (!parte) return { ...base, valor: null, motivo_nulo: `«${prod.nombre}» no tiene una parte del costo llamada «${p.parte}»` };
    if (!parte.rango) return { ...base, valor: null, motivo_nulo: `«${p.parte}» no tiene costo («no lo sé» o vacío)` };
    deltaUnit = escalarRango(parte.rango, p.pct / 100);
    delta_mes = multiplicarRangos(deltaUnit, prod.unidades_mes);
    nuevo_margen_unitario = { bajo: prod.margen_unitario.bajo + deltaUnit.bajo, alto: prod.margen_unitario.alto + deltaUnit.alto };
  } else {
    delta_mes = multiplicarRangos(prod.margen_unitario, escalarRango(prod.unidades_mes, p.pct / 100));
    nuevo_margen_unitario = prod.margen_unitario;
  }

  // El equilibrio con la mezcla nueva: misma cuenta que el tablero, con esta línea cambiada.
  let nuevo_equilibrio_unidades: Rango | null = null;
  const conDatos = t.productos.filter((x) => x.margen_unitario && x.unidades_mes && x.contribucion_mes);
  if (t.fijos.total && conDatos.length) {
    const masPorUnidad = p.tipo === "volumen" ? undefined : { bajo: nuevo_margen_unitario.bajo - prod.margen_unitario.bajo, alto: nuevo_margen_unitario.alto - prod.margen_unitario.alto };
    const margen = margenDeLaMezcla(conDatos, { id: prod.id, masPorUnidad, factorUnidades: p.tipo === "volumen" ? 1 + p.pct / 100 : undefined });
    if (margen) nuevo_equilibrio_unidades = unidadesParaCubrir(t.fijos.total, margen);
  }
  return { ...base, valor: { delta_mes, nuevo_margen_unitario, volumen_que_se_puede_perder_pct, nuevo_equilibrio_unidades } };
}

// ─── Moneda extranjera ───────────────────────────────────────────────────────────────────────────

/**
 * Lo que se quedó en el camino en UNA venta cobrada en otra moneda. Esperado = monto × tipo de cambio con el que se
 * puso el precio; referencia = monto × tipo de cambio del día del cobro. Lo que se pierde por el tipo de cambio es
 * esperado − referencia; con lo que llegó a la cuenta, la conversión (diferencial del cambio, incluye la doble
 * conversión) es referencia − recibido − comisiones, y el total es esperado − recibido.
 */
export function fugaCambiaria(o: OperacionMoneda): FugaOperacion {
  const motivos: string[] = [];
  const esperado = o.tc_cotizado != null ? o.monto * o.tc_cotizado : null;
  const referencia = o.tc_cobro != null ? o.monto * o.tc_cobro : null;
  if (esperado == null) motivos.push("falta el tipo de cambio con el que se puso el precio");
  const por_tipo_de_cambio = esperado != null && referencia != null ? esperado - referencia : null;
  const por_comisiones = o.comisiones;
  let por_conversion: number | null = null;
  let total: number | null = null;
  if (o.recibido != null) {
    if (referencia != null) {
      por_conversion = referencia - o.recibido - (o.comisiones ?? 0);
      if (o.comisiones == null) motivos.push("no se separó lo que cobró el banco: va junto con el costo del cambio");
    } else {
      motivos.push("sin el tipo de cambio del día del cobro no se separa cuánto fue por el cambio y cuánto por la conversión");
    }
    total = esperado != null ? esperado - o.recibido : null;
  } else {
    if (por_tipo_de_cambio != null) {
      total = por_tipo_de_cambio + (o.comisiones ?? 0);
      motivos.push("sin saber cuánto llegó, falta el costo del cambio");
      if (o.comisiones == null) motivos.push("y falta lo que cobró el banco");
    } else if (esperado != null) {
      motivos.push("falta el tipo de cambio del día del cobro o cuánto llegó a la cuenta");
    }
  }
  if (o.conversiones === 2) motivos.push("pasó por dos conversiones (a dólares y de dólares a la moneda local)");
  return {
    id: o.id,
    esperado,
    referencia,
    por_tipo_de_cambio,
    por_comisiones,
    por_conversion,
    total,
    pct: total != null && esperado != null && esperado > 0 ? redondea(total / esperado) : null,
    completa: esperado != null && o.recibido != null,
    motivos,
  };
}

/**
 * El resumen de las ventas en otra moneda. Entran en la suma SOLO las ventas con la cuenta entera (lo que se esperaba
 * y lo que llegó a la cuenta): lo recibido es lo que se anotó, nunca «esperado − perdido». Una venta sin lo que llegó
 * deja un piso (el tipo de cambio y el banco) que va aparte, como `al_menos`, y se dice en las limitaciones: sumarla
 * como si fuera la cuenta entera inventaba un «recibido» y achicaba la fuga.
 */
function resumenMoneda(operaciones: OperacionMoneda[], f: FichaNegocio, fmt: (n: number) => string): NonNullable<TableroRentabilidad["moneda"]> {
  const fugas = operaciones.map(fugaCambiaria);
  const completas = operaciones.map((o, i) => ({ o, x: fugas[i]! })).filter(({ x }) => x.completa);
  const pisos = fugas.filter((x) => !x.completa && x.esperado != null && x.total != null);
  const al_menos = pisos.length ? pisos.reduce((s, x) => s + (x.total as number), 0) : null;
  const base = {
    formula: "por operación: esperado = monto × tipo de cambio con que se puso el precio; lo que se quedó en el camino = esperado − lo que llegó a la cuenta. En el resumen, la suma de las operaciones con lo que se esperaba y lo que llegó a la cuenta",
    periodo: "las operaciones anotadas",
    fuentes: [`operaciones_moneda · ${operaciones.length} operación(es)`],
    supuestos: [] as string[],
    limitaciones: [] as string[],
  };
  if (completas.length < operaciones.length) base.limitaciones.push(`${operaciones.length - completas.length} de ${operaciones.length} operaciones sin la cuenta completa: no entran en la suma.`);
  if (pisos.length) {
    const banco = pisos.some((x) => x.por_comisiones != null) ? " y lo que cobró el banco" : "";
    base.limitaciones.push(`${pisos.length} ${pisos.length === 1 ? "venta" : "ventas"} sin lo que llegó a la cuenta: allí se perdió al menos ${fmt(al_menos as number)} (solo el tipo de cambio${banco}; falta el costo del cambio).`);
  }
  if (operaciones.some((o) => o.estado === "estimado")) base.supuestos.push("Hay operaciones anotadas a ojo (estimadas).");
  if (!completas.length) {
    const motivo = !operaciones.length
      ? "no hay operaciones anotadas"
      : al_menos != null
        ? `ninguna venta tiene lo que llegó a la cuenta; en ${pisos.length} se perdió al menos ${fmt(al_menos)}`
        : "ninguna operación tiene la cuenta completa";
    return { operaciones: fugas, resumen: { ...base, valor: null, motivo_nulo: motivo } };
  }
  const esperado = completas.reduce((s, { x }) => s + (x.esperado as number), 0);
  const recibido = completas.reduce((s, { o }) => s + (o.recibido as number), 0);
  const perdido = esperado - recibido;
  const pct = esperado > 0 ? redondea(perdido / esperado) : 0;
  // Estimado del mes: solo si la ficha dice cuántas operaciones hay al mes y de cuánto suele ser cada una.
  let mes_estimado: Rango | null = null;
  const ops = rangoDe(f.moneda.operaciones_mes);
  const tipico = rangoDe(f.moneda.monto_tipico);
  const tcs = operaciones.filter((o) => o.tc_cotizado != null).map((o) => o.tc_cotizado as number);
  if (ops && tipico && tcs.length) {
    const tc = tcs.reduce((s, x) => s + x, 0) / tcs.length;
    mes_estimado = escalarRango(multiplicarRangos(ops, tipico), tc * pct);
    base.supuestos.push(`El estimado del mes es un estimado: operaciones al mes × monto típico × tipo de cambio promedio (${redondea(tc, 4)}) × lo que se pierde en promedio (${redondea(pct * 100, 1)} %).`);
  } else {
    base.limitaciones.push("Sin cuántas operaciones hay al mes y de cuánto suele ser cada una, no hay estimado del mes.");
  }
  return { operaciones: fugas, resumen: { ...base, valor: { esperado, recibido, perdido, pct, mes_estimado, al_menos } } };
}

// ─── Crédito e inventario ────────────────────────────────────────────────────────────────────────

function calcularCredito(c: Credito, metricas: Metrica[], fmt: (n: number) => string): NonNullable<TableroRentabilidad["credito"]> {
  const venta = vitalMasReciente(metricas, "venta_mes");
  const base = {
    formula: "dinero en la calle = venta del mes × (de cada 10 ventas, cuántas al crédito ÷ 10) × (días que tardan en pagar ÷ 30); pérdida al mes = venta del mes × (al crédito ÷ 10) × (de cada 10 que deben, cuántos no pagan ÷ 10)",
    periodo: venta ? venta.periodo : SIN_PERIODO,
    fuentes: venta ? [`company_metricas · venta_mes ${venta.periodo} (de tus 9 números)`] : [],
    supuestos: [] as string[],
    limitaciones: [] as string[],
  };
  const k = rangoDe(c.de_cada_10);
  const dias = rangoDe(c.dias);
  if (!venta) return { ...base, valor: null, motivo_nulo: "falta la venta del mes (de tus 9 números)" };
  if (!k) return { ...base, valor: null, motivo_nulo: "falta: de cada 10 ventas, cuántas son al crédito o fiadas" };
  if (!dias) return { ...base, valor: null, motivo_nulo: "falta: en cuántos días te pagan" };
  const v: Rango = { bajo: venta.valor, alto: venta.valor };
  const alCredito = multiplicarRangos(v, escalarRango(k, 1 / 10));
  const dinero_en_la_calle = multiplicarRangos(alCredito, escalarRango(dias, 1 / 30));
  const inc = rangoDe(c.incobrables_de_cada_10);
  const perdida_mes = inc ? multiplicarRangos(alCredito, escalarRango(inc, 1 / 10)) : null;
  if (!inc) base.limitaciones.push("Sin «de cada 10 que te deben, cuántos nunca pagan», no hay pérdida al mes que calcular.");
  if ([c.de_cada_10, c.dias, c.incobrables_de_cada_10].some((d) => d && d.estado === "estimado") || !esExacto(k) || !esExacto(dias)) base.supuestos.push("Sale de datos dichos a ojo o en rango: vale como estimado.");
  const estadoVenta = estadoDatoDesdeMetrica(venta.estado);
  if (estadoVenta === "estimado") base.supuestos.push(`La venta del mes (${fmt(venta.valor)}) es la que dijiste de memoria.`);
  return { ...base, valor: { dinero_en_la_calle, perdida_mes } };
}

function calcularInventario(i: Inventario): NonNullable<TableroRentabilidad["inventario"]> {
  const base = {
    formula: "se devuelve lo dicho: el dinero en mercadería que no se mueve hace más de tres meses y para cuántos meses de venta alcanza lo guardado",
    periodo: "hoy",
    fuentes: ["ficha_negocio · inventario"],
    supuestos: [] as string[],
    limitaciones: ["No se calcula un costo de oportunidad: no se inventa a qué tasa rendiría ese dinero."],
  };
  const parado = rangoDe(i.parado);
  const meses = rangoDe(i.meses);
  if (!parado && !meses) return { ...base, valor: null, motivo_nulo: "falta cuánto dinero no se mueve y para cuántos meses alcanza" };
  if ([i.parado, i.meses, i.valor].some((d) => d && d.estado === "estimado")) base.supuestos.push("Lo dicho es a ojo: vale como estimado.");
  return { ...base, valor: { dinero_parado: parado, meses } };
}

// ─── Para el portal del dueño ────────────────────────────────────────────────────────────────────

/**
 * Lo que deja cada producto al mes, en palabras del dueño (sin «contribución», «costo variable», «SKU» ni «matriz»).
 * Lo que falta se dice una sola vez abajo, sin calcularlo a ojo, y con las palabras de la pregunta que lo pide («el mes
 * pasado», nunca «un mes normal»: revisión del 16-10).
 */
export function resumenMensualParaDueno(lineas: LineaProducto[], f: FichaNegocio, cfg: ConfigEmpresa = porDefecto): {
  /** aOjo: lo que deja sale de algún dato a ojo (estimado, rango o «de cada 10»); el dueño lo ve marcado. */
  lineas: { id: string; nombre: string; deja: string; conDatos: boolean; aOjo: boolean }[];
  dejanMas: { id: string; nombre: string; texto: string; aOjo: boolean }[];
  faltan: string | null;
} {
  const fmt = plata(cfg);
  const ps = lineas.map((l) => ({ l, p: productoRentable(l, f, cfg) }));
  const salida = ps.map(({ l, p }) => {
    const unidad = l.modelo ? MODELO[l.modelo].unidad.singular : l.tipo === "servicio" ? "caso" : "unidad";
    let deja: string;
    if (p.contribucion_mes) {
      deja = p.contribucion_mes.alto < 0 ? `Al mes te cuesta ${textoRango(escalarRango(p.contribucion_mes, -1), fmt)} más de lo que cobras.` : `Al mes te deja ${textoRango(p.contribucion_mes, fmt)}.`;
    } else if (p.margen_unitario) {
      deja = p.margen_unitario.alto < 0 ? `Hoy cada ${unidad} te cuesta ${textoRango(escalarRango(p.margen_unitario, -1), fmt)} más de lo que cobras.` : `Te deja ${textoRango(p.margen_unitario, fmt)} por ${unidad}. Falta saber cuántos vendiste el mes pasado.`;
    } else {
      const falta = [p.precio_efectivo ? null : faltaDelPrecio(l, unidad) ?? "el precio", p.costo ? null : `lo que te cuesta cada ${unidad}`].filter((x): x is string => x !== null);
      deja = `Todavía no sabemos cuánto te deja: falta ${falta.join(" y ")}.`;
    }
    return { id: l.id, nombre: l.nombre, deja, conDatos: p.contribucion_mes != null, aOjo: p.contribucion_mes != null && esAOjo(p) };
  });
  const dejanMas = ps
    .filter(({ p }) => p.contribucion_mes && centro(p.contribucion_mes) > 0)
    .sort((a, b) => centro(b.p.contribucion_mes!) - centro(a.p.contribucion_mes!))
    .slice(0, 3)
    .map(({ l, p }) => ({ id: l.id, nombre: p.nombre, texto: `${p.nombre}: ${textoRango(p.contribucion_mes, fmt)} al mes`, aOjo: esAOjo(p) }));
  const incompletas = ps.filter(({ p }) => !p.contribucion_mes);
  let faltan: string | null = null;
  if (incompletas.length && ps.length) {
    const sinPrecio = incompletas.filter(({ p }) => !p.precio_efectivo).map(({ l }) => faltaDelPrecio(l, "caso") ?? "el precio");
    const que = [
      sinPrecio.includes("el precio") ? "el precio" : null,
      sinPrecio.some((x) => x !== "el precio") ? "cuántas horas te lleva cada caso" : null,
      incompletas.some(({ p }) => !p.costo) ? "lo que te cuesta" : null,
      incompletas.some(({ p }) => !p.unidades_mes) ? "cuántos vendiste el mes pasado" : null,
    ].filter((x): x is string => x !== null);
    const cuantos = incompletas.length === ps.length ? (ps.length === 1 ? "De lo que vendes" : `De ninguno de tus ${ps.length} productos o servicios`) : `De ${incompletas.length} de tus ${ps.length} productos o servicios`;
    const verbo = incompletas.length === ps.length && ps.length > 1 ? "sabemos todavía" : "todavía no sabemos";
    faltan = `${cuantos} ${verbo} cuánto te deja en un mes: falta ${que.join(", ").replace(/, ([^,]*)$/, " y $1")}. No lo calculamos a ojo.`;
  }
  return { lineas: salida, dejanMas, faltan };
}

/** true si alguna línea ya tiene datos del formato nuevo (unidades al mes, rango, «de cada 10», partes del costo o segundo precio). */
export function usaTablaNueva(lineas: LineaProducto[]): boolean {
  return lineas.some((l) => {
    if (l.unidades_mes != null || l.unidades_mes_desde != null || l.participacion_de_10 != null || (l.componentes_costo?.length ?? 0) > 0 || l.precio_segundo != null) return true;
    const dm = lecturaDatosModelo(l.datos_modelo);
    return cobraPorHora(l) || !!(dm.rangoPrecio || dm.rangoCosto || dm.rangoDeCada10 || dm.rangoDeCada10Segundo);
  });
}
