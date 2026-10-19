/**
 * LA VISTA «NÚMEROS» DE LA CONSULTORA (16-10-2026) — lo puro, sin base ni pantalla.
 *
 * Pedido de Kelin: «hace rato estaba simple y fácil: diagnóstico, qué hay en números, indicadores y el avance
 * progresivo». Esta es la vista de los números de UNA empresa: la venta mes a mes, los nueve números con de dónde
 * sale cada uno, lo que se calcula con ellos, la rentabilidad, lo que se escapa y lo que no cuadra.
 *
 * Aquí vive lo que se puede probar sin navegador (tests/numeros-empresa.test.ts):
 *  - `marcaDe`: cómo se sabe cada número, en cinco marcas y nada más;
 *  - `filasVitales`: una fila por vital, en el orden de VITALES, con seis barras para los mensuales;
 *  - `puntosDeVenta`, `ventaArriba`, `referenciaDeLinea`: la línea de ventas de arriba;
 *  - `cifrasDerivadas`: margen, equilibrio, días de aguante y venta frente al equilibrio, cada una con su cuenta;
 *  - `fugasDe`: el cambio de moneda, el crédito y la mercadería parada, que salen de `tableroRentabilidad`;
 *  - `queNoCuadra`: los pares declarado-documento que se contradicen.
 *
 * REGLAS QUE NO SE NEGOCIAN
 *  1. Rayado = sin dato, y nada más. Lo que falta se nombra; nunca se escribe un cero que nadie contó.
 *  2. Lo descartado al revisar un documento no cuenta, aunque conserve un valor: lo excluye su estado.
 *  3. Lo extraído de un documento nunca es «comprobado»: lleva su marca y, en las cuentas, el rótulo de provisional.
 *  4. «No se pudo leer» no es «no hay»: quien llama pasa null y la pantalla lo dice con esas palabras.
 *
 * Las fugas por bolsas NO se leen aquí: otra tarea está cambiando src/lib/perdida.ts. Las tres de esta vista salen
 * solo de `tableroRentabilidad` (moneda, crédito, mercadería), cada una por su lado y sin total.
 * TODO(perdida): cuando cierre src/lib/perdida.ts (hoy: `bolsasDeFugas(metricas, { moneda })` con las bolsas caja ·
 * horas · oportunidad, que nunca se suman entre sí), mostrar sus bolsas en la tarjeta de fugas de
 * src/app/(consultor)/empresa/[id]/numeros/page.tsx, sin volver a contar lo que nunca se cobra del crédito (perdida.ts
 * no lo mete en la caja para no contarlo dos veces).
 */
import { VITALES, PERIODO_DORADA, normalizarMetrica, serieDeVentas, periodoEnPalabras, type Derivados, type Metrica, type Vital } from "./metricas";
import { MESES, nombreDePeriodo } from "./temporadas";
import { moneda, numero, simboloMoneda, porDefecto, type ConfigEmpresa } from "./formato";
import { centro, textoRango } from "./dato-oral";
import type { Calculo } from "./finanzas";
import type { Modulos } from "./esquemas-negocio";
import { CUADRANTE_TEXTO, type TableroRentabilidad } from "./rentabilidad";
import { formatoCifra, rotuloDeDeclarado, ROTULO_DE_CAJA, type ParDeclaradoExtraido } from "./rules/contradiccion-numerica";

const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** El periodo AAAA-MM de `p` más `k` meses (k puede ser negativo). */
export function sumarMeses(p: string, k: number): string {
  const total = Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1 + k;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Un valor de la base (numeric llega como texto) a número; vacío, nulo o no numérico → null. */
const aNumero = (v: unknown): number | null => {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ─── Cómo se sabe cada número ────────────────────────────────────────────────────────────────────

export type ClaveMarca = "comprobado" | "de_memoria" | "documento" | "no_lo_sabe" | "falta";
/** `clase` es la del chip `.estado` (ok · neutro · espera); null = no hay chip: se dibuja rayado (`.sin-dato`). */
export type MarcaNumero = { clave: ClaveMarca; texto: string; clase: "ok" | "neutro" | "espera" | null };

/**
 * LO QUE SALE DE SU CAJA (Finanzas, 19-10-2026). No es una sexta marca: cuenta con «de memoria» en la barra (nadie lo
 * comprobó con un documento), pero la fila dice de dónde salió. La registró el dueño en su caja, no la recordó.
 */
export const MARCA_DE_CAJA: MarcaNumero = Object.freeze({ clave: "de_memoria", texto: "de su caja (Finanzas)", clase: "neutro" });

export const MARCAS: Readonly<Record<ClaveMarca, MarcaNumero>> = Object.freeze({
  comprobado: { clave: "comprobado", texto: "comprobado", clase: "ok" },
  de_memoria: { clave: "de_memoria", texto: "de memoria", clase: "neutro" },
  documento: { clave: "documento", texto: "de un documento, sin revisar", clase: "espera" },
  no_lo_sabe: { clave: "no_lo_sabe", texto: "no lo sabe", clase: "neutro" },
  falta: { clave: "falta", texto: "falta", clase: null },
});

/**
 * La marca de un número por su estado guardado. `hayFila` en false (nadie lo preguntó o nadie respondió) es «falta».
 *  - verificado → comprobado: alguien lo concilió con un documento delante;
 *  - contado o declarado → de memoria. Lo que llegó sin rótulo (filas de antes de los estados) también: nadie lo
 *    comprobó y no salió de un documento;
 *  - extraido → de un documento, sin revisar (nunca «comprobado»);
 *  - sin_dato → no lo sabe: es un hallazgo, no un vacío;
 *  - descartado → falta: su valor no cuenta, como en la radiografía.
 */
export function marcaDe(estado: string | null | undefined, hayFila = true, origen?: string | null): MarcaNumero {
  if (!hayFila || estado === "descartado") return MARCAS.falta;
  if (origen === "caja" && estado !== "verificado") return MARCA_DE_CAJA;
  switch (estado) {
    case "verificado":
      return MARCAS.comprobado;
    case "extraido":
      return MARCAS.documento;
    case "sin_dato":
      return MARCAS.no_lo_sabe;
    default:
      return MARCAS.de_memoria;
  }
}

// ─── Los nueve, fila por fila ────────────────────────────────────────────────────────────────────

/** Cuántos meses lleva la tira de barritas de un vital mensual. */
export const MESES_BARRAS = 6;

/** Una barrita: el mes, su valor (null = sin dato, se dibuja rayada) y si es dicho sin comprobar (solo contorno). */
export type BarraMes = { periodo: string; valor: number | null; dicho: boolean };

export type FilaVital = {
  clave: string;
  n: number;
  nombre: string;
  unidad: Vital["unidad"];
  mensual: boolean;
  /** La cifra que se muestra: la del mes más reciente con cifra (o la «de hoy» si no hay ningún mes). null = no hay. */
  valor: number | null;
  /** El periodo de esa cifra, normalizado (AAAA-MM o «actual»). null si no hay cifra. */
  periodo: string | null;
  marca: MarcaNumero;
  /** Solo los mensuales: MESES_BARRAS meses seguidos. Los demás, null. */
  barras: BarraMes[] | null;
};

type Guardado = { periodo: string; valor: number | null; estado: string | null; origen?: string | null };

/** El mes más reciente manda; «actual» (lo de hoy) solo si no hay ningún mes fechado. Igual que `derivados`. */
function masReciente(lista: Guardado[]): Guardado | null {
  const conMes = lista.filter((g) => ES_MES.test(g.periodo)).sort((a, b) => b.periodo.localeCompare(a.periodo));
  return conMes[0] ?? lista.find((g) => g.periodo === "actual") ?? lista[0] ?? null;
}

/**
 * LOS NUEVE NÚMEROS, UNO POR FILA, en el orden de VITALES. La cuenta de respondidos es la misma de `radiografia`: con
 * cifra (sin descartar) o declarado «no lo sé». La mejor época no es la cifra de hoy y no entra.
 *
 * Las barritas de los mensuales (ventas, lo que quedó libre, gastos fijos) son los seis meses que terminan en el
 * último mes cerrado (`mesPasado`, AAAA-MM, en la zona de la empresa) o en el último mes con cifra si es posterior. Un
 * mes sin cifra es null (rayado), nunca un cero; un cero contado es cero. Lo que no está comprobado va en contorno.
 * Sin `mesPasado` ni ningún mes con cifra no hay dónde terminar la tira: queda vacía.
 */
export function filasVitales(metricas: Metrica[], mesPasado: string | null): FilaVital[] {
  const porClave = new Map<string, Guardado[]>();
  for (const m of metricas) {
    const { clave, periodo, vital } = normalizarMetrica(m.clave, m.periodo);
    if (!vital || periodo === PERIODO_DORADA) continue;
    const estado = m.estado == null ? null : String(m.estado);
    if (estado === "descartado") continue;
    porClave.set(clave, [...(porClave.get(clave) ?? []), { periodo, valor: aNumero(m.valor), estado, origen: m.origen ?? null }]);
  }
  const finPedido = mesPasado && ES_MES.test(mesPasado) ? mesPasado : null;

  return VITALES.map((v): FilaVital => {
    const guardados = porClave.get(v.clave) ?? [];
    const conCifra = guardados.filter((g) => g.valor != null);
    const elegida = masReciente(conCifra);
    const marca = elegida ? marcaDe(elegida.estado, true, elegida.origen) : guardados.some((g) => g.estado === "sin_dato") ? MARCAS.no_lo_sabe : MARCAS.falta;

    let barras: BarraMes[] | null = null;
    if (v.mensual) {
      const ultimoConCifra = conCifra.filter((g) => ES_MES.test(g.periodo)).map((g) => g.periodo).sort().at(-1) ?? null;
      const fin = [finPedido, ultimoConCifra].filter((p): p is string => p != null).sort().at(-1) ?? null;
      barras = fin
        ? Array.from({ length: MESES_BARRAS }, (_, i) => {
            const periodo = sumarMeses(fin, i - (MESES_BARRAS - 1));
            const g = conCifra.find((x) => x.periodo === periodo);
            return { periodo, valor: g?.valor ?? null, dicho: g != null && g.estado !== "verificado" };
          })
        : [];
    }
    return {
      clave: v.clave,
      n: v.n,
      nombre: v.nombre,
      unidad: v.unidad,
      mensual: v.mensual,
      valor: elegida?.valor ?? null,
      periodo: elegida?.periodo ?? null,
      marca,
      barras,
    };
  });
}

export type ConteoMarcas = Record<ClaveMarca, number>;

export function conteoMarcas(filas: FilaVital[]): ConteoMarcas {
  const c: ConteoMarcas = { comprobado: 0, de_memoria: 0, documento: 0, no_lo_sabe: 0, falta: 0 };
  for (const f of filas) c[f.marca.clave]++;
  return c;
}

export type ParteSegmento = { n: number; texto: string; tipo: "s1" | "s2" | "s3" | "s4" };

/**
 * La barra segmentada de arriba de la tarjeta: comprobados (oscuro), sin comprobar (gris), no lo sabe (gris claro) y
 * faltan (rayado). Lo de memoria y lo de un documento sin revisar van en el mismo tramo porque ninguno está comprobado;
 * el rótulo dice cuál de los dos es (o los dos), y la marca de cada fila los distingue.
 */
export function partesMarcas(c: ConteoMarcas, deCaja = 0): ParteSegmento[] {
  const sinComprobar = c.de_memoria + c.documento;
  // FINANZAS (19-10-2026): lo de su caja cuenta en «de memoria» (nadie lo comprobó con un documento), pero el rótulo
  // lo nombra aparte: «7 de memoria» cuando seis salen de su caja diría algo que no es.
  const memoria = c.de_memoria - deCaja;
  const texto =
    deCaja > 0
      ? [memoria > 0 ? "de memoria" : null, "de su caja", c.documento > 0 ? "de un documento" : null]
          .filter((x): x is string => x != null)
          .reduce((acc, x, i, todos) => (i === 0 ? x : `${acc}${i === todos.length - 1 ? " o " : ", "}${x}`), "")
      : c.documento === 0 ? "de memoria" : c.de_memoria === 0 ? "de un documento, sin revisar" : "de memoria o de un documento";
  return [
    { n: c.comprobado, texto: c.comprobado === 1 ? "comprobado" : "comprobados", tipo: "s1" },
    { n: sinComprobar, texto, tipo: "s2" },
    { n: c.no_lo_sabe, texto: "no lo sabe", tipo: "s4" },
    { n: c.falta, texto: c.falta === 1 ? "falta" : "faltan", tipo: "s3" },
  ];
}

/** Montos con decimales solo si los tienen (un precio de 149.50 conserva sus céntimos). */
const plata = (cfg: ConfigEmpresa) => (n: number) => moneda(n, cfg, { decimales: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 });

/** La cifra de un vital con su unidad: «S/ 41,800», «3 de cada 10», «45 días». Nunca soles para lo que no es dinero. */
export function cifraVital(valor: number, unidad: Vital["unidad"], cfg: ConfigEmpresa = porDefecto): string {
  switch (unidad) {
    case "soles":
      return plata(cfg)(valor);
    case "de_cada_10":
      return `${numero(valor, cfg)} de cada 10`;
    case "dias":
      return `${numero(valor, cfg, { decimales: 0 })} ${valor === 1 ? "día" : "días"}`;
    case "personas":
      return `${numero(valor, cfg, { decimales: 0 })} ${valor === 1 ? "persona" : "personas"}`;
    default:
      return numero(valor, cfg);
  }
}

/** «Setiembre 2026», «Hoy». */
export const nombrePeriodo = (p: string | null): string => (p ? nombreDePeriodo(p) : "");

/**
 * Un monto partido para la cifra grande: el símbolo va chico al lado («S/» + «41,800»). Si la moneda se escribe con el
 * símbolo detrás o con signo delante, va entera en `numero` y `simbolo` es null.
 */
export function partesMoneda(valor: number, cfg: ConfigEmpresa = porDefecto): { simbolo: string | null; numero: string } {
  const texto = moneda(valor, cfg);
  const simbolo = simboloMoneda(cfg);
  return texto.startsWith(simbolo) ? { simbolo, numero: texto.slice(simbolo.length).trim() } : { simbolo: null, numero: texto };
}

// ─── La línea de ventas de arriba ────────────────────────────────────────────────────────────────

/** Cuántos meses dibuja la línea como mucho: un año. */
export const MAX_MESES_LINEA = 12;

/** Un punto de la línea (la forma de PuntoLinea de GraficoLinea, con el mes y si es provisional). */
export type PuntoMes = { periodo: string; corto: string; largo: string; valor: number | null; provisional: boolean };

const MES_CORTO = (p: string) => (MESES[Number(p.slice(5, 7)) - 1]?.corto ?? p).toLowerCase();

/**
 * Los meses seguidos entre el primero y el último con venta (los últimos MAX_MESES_LINEA). Un mes del medio sin venta
 * contada es null: la línea se corta y ese tramo va rayado. Sin lo descartado; lo extraído entra con su marca.
 */
export function puntosDeVenta(metricas: Metrica[], max = MAX_MESES_LINEA): PuntoMes[] {
  const serie = serieDeVentas(metricas);
  if (!serie.length) return [];
  const ultimo = serie[0]!.periodo;
  const primero = serie[serie.length - 1]!.periodo;
  const desde = [primero, sumarMeses(ultimo, -(max - 1))].sort().at(-1)!;
  const puntos: PuntoMes[] = [];
  for (let p = desde; p <= ultimo; p = sumarMeses(p, 1)) {
    const m = serie.find((s) => s.periodo === p);
    puntos.push({ periodo: p, corto: MES_CORTO(p), largo: nombreDePeriodo(p), valor: m?.valor ?? null, provisional: m?.provisional ?? false });
  }
  return puntos;
}

export type VentaArriba = {
  valor: number;
  periodo: string;
  provisional: boolean;
  /** «setiembre de 2026». */
  mes: string;
  meta: number | null;
  /** Venta / meta × 100, redondeado. null sin meta. */
  pctMeta: number | null;
  /** Contra el mes inmediatamente anterior, si tiene venta. null si no hay con qué comparar. */
  cambioPct: number | null;
  mesAnterior: string | null;
  /** La suman los movimientos de su caja en Finanzas (origen 'caja'). */
  deCaja: boolean;
};

/** La meta mensual de la ficha de la empresa: «55000», 55000 o «55,000». Nada, cero o texto que no es cifra → null. */
export function metaDeFicha(ficha: unknown): number | null {
  const crudo = ficha && typeof ficha === "object" ? (ficha as Record<string, unknown>).meta_venta_mensual : null;
  const n = aNumero(typeof crudo === "string" ? crudo.replace(/[,\s]/g, "") : crudo);
  return n != null && n > 0 ? n : null;
}

/** La venta del último mes con venta, su meta y el cambio contra el mes anterior. null si no hay venta con mes. */
export function ventaArriba(metricas: Metrica[], meta: number | null): VentaArriba | null {
  const serie = serieDeVentas(metricas);
  const v = serie[0];
  if (!v) return null;
  const antes = serie.find((s) => s.periodo === sumarMeses(v.periodo, -1)) ?? null;
  return {
    valor: v.valor,
    periodo: v.periodo,
    provisional: v.provisional,
    mes: periodoEnPalabras(v.periodo),
    meta: meta != null && meta > 0 ? meta : null,
    pctMeta: meta != null && meta > 0 ? Math.round((100 * v.valor) / meta) : null,
    cambioPct: antes && antes.valor > 0 ? Math.round((100 * (v.valor - antes.valor)) / antes.valor) : null,
    mesAnterior: antes ? periodoEnPalabras(antes.periodo).replace(/ de \d{4}$/, "") : null,
    deCaja: v.deCaja === true,
  };
}

/** La venta de su mejor época (venta_mes en «epoca_dorada»), sin lo descartado. */
export function doradaDe(metricas: Metrica[]): { valor: number; provisional: boolean } | null {
  const m = metricas.find((x) => {
    const n = normalizarMetrica(x.clave, x.periodo);
    return n.clave === "venta_mes" && n.periodo === PERIODO_DORADA && aNumero(x.valor) != null && x.estado !== "descartado";
  });
  return m ? { valor: aNumero(m.valor)!, provisional: m.estado === "extraido" } : null;
}

/**
 * La raya de referencia de la línea: el equilibrio de la empresa; si no hay, su mejor época. Ninguna de las dos se
 * inventa: sin las dos, no hay raya.
 */
export function referenciaDeLinea(
  d: Pick<Derivados, "equilibrio" | "provisional">,
  dorada: { valor: number; provisional: boolean } | null,
  cfg: ConfigEmpresa = porDefecto
): { valor: number; texto: string; de: "equilibrio" | "dorada" } | null {
  if (d.equilibrio != null && d.equilibrio > 0) {
    return { valor: d.equilibrio, texto: `cubre gastos: ${moneda(d.equilibrio, cfg)}${d.provisional.equilibrio ? " (provisional)" : ""}`, de: "equilibrio" };
  }
  if (dorada && dorada.valor > 0) return { valor: dorada.valor, texto: `mejor época: ${moneda(dorada.valor, cfg)}${dorada.provisional ? " (provisional)" : ""}`, de: "dorada" };
  return null;
}

// ─── Lo que se calcula con los números ───────────────────────────────────────────────────────────

export type ClaveDerivada = "margen" | "equilibrio" | "dias" | "sobre";

export type CifraDerivada = {
  clave: ClaveDerivada;
  titulo: string;
  sub: string;
  /** La cifra partida para `.grande`. null = sin dato (se dibuja rayado y va `motivo`). */
  cifra: { signo: string; simbolo: string | null; numero: string; unidad: string | null } | null;
  /** Por qué no hay cifra, con las palabras de `derivados`. */
  motivo: string | null;
  provisional: boolean;
  calculo: Calculo<number>;
};

/** Primera letra en mayúscula: los motivos de `derivados` y de `rentabilidad` a veces empiezan en minúscula. */
export const conMayuscula = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Las cuatro cifras que salen de los números, en este orden: margen, punto de equilibrio, días de aguante y venta
 * frente al equilibrio. Cada una con su cuenta (`calculo`, para «Cómo se calculó») y su rótulo de provisional. La de
 * «frente al equilibrio» usa la cuenta del equilibrio: sale de él.
 */
export function cifrasDerivadas(d: Derivados, cfg: ConfigEmpresa = porDefecto): CifraDerivada[] {
  const enMoneda = (v: number, unidad: string | null = null): CifraDerivada["cifra"] => ({ signo: Math.round(v) < 0 ? "−" : "", ...partesMoneda(Math.abs(v), cfg), unidad });
  const motivo = (c: Calculo<number>) => (c.valor == null ? conMayuscula(c.motivo_nulo ?? "Con los números que hay no se puede hacer esta cuenta.") : null);
  const margen = d.margen != null ? Math.round(d.margen) : null;
  return [
    {
      clave: "margen",
      titulo: "Margen",
      sub: "Lo que queda libre de cada 100 vendidos",
      cifra: margen != null ? { signo: margen < 0 ? "−" : "", simbolo: null, numero: numero(Math.abs(margen), cfg, { decimales: 0 }), unidad: "%" } : null,
      motivo: motivo(d.detalle.margen),
      provisional: d.provisional.margen,
      calculo: d.detalle.margen,
    },
    {
      clave: "equilibrio",
      titulo: "Punto de equilibrio",
      sub: "La venta que cubre los gastos, según los nueve números",
      cifra: d.equilibrio != null ? enMoneda(d.equilibrio) : null,
      motivo: motivo(d.detalle.equilibrio),
      provisional: d.provisional.equilibrio,
      calculo: d.detalle.equilibrio,
    },
    {
      clave: "dias",
      titulo: "Días de aguante",
      sub: "Con la caja de hoy, si no entra nada",
      cifra: d.diasAguante != null ? { signo: "", simbolo: null, numero: numero(Math.round(d.diasAguante), cfg, { decimales: 0 }), unidad: Math.round(d.diasAguante) === 1 ? "día" : "días" } : null,
      motivo: motivo(d.detalle.diasAguante),
      provisional: d.provisional.diasAguante,
      calculo: d.detalle.diasAguante,
    },
    {
      clave: "sobre",
      titulo: "Frente al equilibrio",
      sub: "La venta del último mes menos el equilibrio",
      cifra: d.sobreEquilibrio != null ? enMoneda(d.sobreEquilibrio, d.sobreEquilibrio >= 0 ? "por encima" : "por debajo") : null,
      motivo: d.sobreEquilibrio != null ? null : motivo(d.detalle.equilibrio) ?? "Hacen falta las ventas del mes para compararlas con el equilibrio.",
      provisional: d.provisional.equilibrio,
      calculo: d.detalle.equilibrio,
    },
  ];
}

// ─── Lo que se escapa ────────────────────────────────────────────────────────────────────────────

export type ClaveFuga = "moneda" | "credito" | "inventario";

/**
 * Una fuga, lista para pintar:
 *  - `no_aplica`: la empresa dijo que ese bloque no es suyo (módulo en «no»). Chip neutro, sin rayado.
 *  - `sin_preguntar`: nadie dijo todavía si aplica. Es un dato que falta: rayado.
 *  - `sin_dato`: aplica, pero falta algo para la cifra: rayado y qué falta.
 *  - `no_leido`: no se pudo leer lo que hace falta. No es «no hay».
 *  - `valor`: la cifra (rango si se dijo en rango), con su nota.
 */
export type Fuga = {
  clave: ClaveFuga;
  titulo: string;
  estado: "no_aplica" | "sin_preguntar" | "sin_dato" | "no_leido" | "valor";
  cifra: string | null;
  nota: string | null;
  calculo: Calculo<unknown> | null;
};

const TITULO_FUGA: Record<ClaveFuga, string> = {
  moneda: "Se queda en el cambio de moneda",
  credito: "Lo que no se cobra del crédito",
  inventario: "Dinero parado en mercadería",
};

const NO_APLICA: Record<ClaveFuga, string> = {
  moneda: "La empresa no cobra en otra moneda.",
  credito: "La empresa no vende al crédito.",
  inventario: "La empresa no guarda mercadería.",
};

const SIN_PREGUNTAR: Record<ClaveFuga, string> = {
  moneda: "Todavía no se sabe si cobra en otra moneda: se marca en Cobros y mercadería.",
  credito: "Todavía no se sabe si vende al crédito: se marca en Cobros y mercadería.",
  inventario: "Todavía no se sabe si guarda mercadería: se marca en Cobros y mercadería.",
};

/**
 * LAS TRES FUGAS QUE YA CALCULA `tableroRentabilidad`: lo que se queda al cobrar en otra moneda (estimado del mes), lo
 * que no se cobra del crédito (pérdida al mes) y el dinero parado en mercadería. Cuando un bloque viene null del
 * tablero, el módulo de la ficha dice si es «no aplica» (false) o si nadie lo ha dicho todavía (sin valor).
 *
 * `t` null: no se pudo leer la ficha. `operacionesLeidas` en false: las ventas en otra moneda no se pudieron leer, y
 * eso no se disfraza de «no hay operaciones». `metricasLeidas` en false: los nueve números no se pudieron leer, y el
 * crédito (que sale de la venta del mes) no dice «falta la venta».
 */
export function fugasDe(
  t: Pick<TableroRentabilidad, "moneda" | "credito" | "inventario"> | null,
  modulos: Modulos | null,
  cfg: ConfigEmpresa = porDefecto,
  operacionesLeidas = true,
  metricasLeidas = true
): Fuga[] {
  // Al sol entero: lo que se escapa al mes no se lee en céntimos.
  const fmt = (n: number) => moneda(n, cfg);
  const base = (clave: ClaveFuga) => ({ clave, titulo: TITULO_FUGA[clave] });
  if (!t) return (["moneda", "credito", "inventario"] as const).map((k) => ({ ...base(k), estado: "no_leido", cifra: null, nota: "No se pudo leer la ficha del negocio: vuelve a cargar la página.", calculo: null }));
  const apagado = (clave: ClaveFuga): Fuga =>
    modulos?.[clave] === false
      ? { ...base(clave), estado: "no_aplica", cifra: null, nota: NO_APLICA[clave], calculo: null }
      : { ...base(clave), estado: "sin_preguntar", cifra: null, nota: SIN_PREGUNTAR[clave], calculo: null };

  const moneda_: Fuga = (() => {
    if (!t.moneda) return operacionesLeidas ? apagado("moneda") : { ...base("moneda"), estado: "no_leido", cifra: null, nota: "No se pudieron leer las ventas en otra moneda.", calculo: null };
    const r = t.moneda.resumen;
    if (!operacionesLeidas) return { ...base("moneda"), estado: "no_leido", cifra: null, nota: "No se pudieron leer las ventas en otra moneda.", calculo: r };
    if (!r.valor) return { ...base("moneda"), estado: "sin_dato", cifra: null, nota: conMayuscula(r.motivo_nulo ?? "Faltan ventas en otra moneda con lo que llegó a la cuenta."), calculo: r };
    const enLoAnotado = `En lo anotado se quedaron ${fmt(r.valor.perdido)} (${numero(Math.round(r.valor.pct * 1000) / 10, cfg)} %).`;
    if (!r.valor.mes_estimado) {
      return { ...base("moneda"), estado: "sin_dato", cifra: null, nota: `${enLoAnotado} Falta cuántas ventas en otra moneda hay al mes y de cuánto es cada una para estimar el mes.`, calculo: r };
    }
    return { ...base("moneda"), estado: "valor", cifra: textoRango(r.valor.mes_estimado, fmt), nota: `al mes, estimado. ${enLoAnotado}`, calculo: r };
  })();

  const credito: Fuga = (() => {
    const c = t.credito;
    if (!c) return apagado("credito");
    // La pérdida del crédito sale de la venta del mes: sin los números leídos, no es que falte, es que no se leyó.
    if (!c.valor && !metricasLeidas) return { ...base("credito"), estado: "no_leido", cifra: null, nota: "No se pudieron leer los números de la empresa: sin la venta del mes no hay cuenta.", calculo: null };
    if (!c.valor) return { ...base("credito"), estado: "sin_dato", cifra: null, nota: conMayuscula(c.motivo_nulo ?? "Faltan datos del crédito."), calculo: c };
    const calle = `En la calle hoy: ${textoRango(c.valor.dinero_en_la_calle, fmt)}.`;
    if (!c.valor.perdida_mes) return { ...base("credito"), estado: "sin_dato", cifra: null, nota: `Falta: de cada 10 que deben, cuántos nunca pagan. ${calle}`, calculo: c };
    return { ...base("credito"), estado: "valor", cifra: textoRango(c.valor.perdida_mes, fmt), nota: `al mes. ${calle}`, calculo: c };
  })();

  const inventario: Fuga = (() => {
    const i = t.inventario;
    if (!i) return apagado("inventario");
    if (!i.valor) return { ...base("inventario"), estado: "sin_dato", cifra: null, nota: conMayuscula(i.motivo_nulo ?? "Faltan datos de la mercadería."), calculo: i };
    const meses = i.valor.meses ? `Lo guardado alcanza para ${textoRango(i.valor.meses, (n) => `${numero(n, cfg)} ${n === 1 ? "mes" : "meses"}`)} de venta.` : null;
    if (!i.valor.dinero_parado) return { ...base("inventario"), estado: "sin_dato", cifra: null, nota: ["Falta cuánto dinero en mercadería no se mueve hace más de tres meses.", meses].filter(Boolean).join(" "), calculo: i };
    return { ...base("inventario"), estado: "valor", cifra: textoRango(i.valor.dinero_parado, fmt), nota: ["sin moverse hace más de tres meses.", meses].filter(Boolean).join(" "), calculo: i };
  })();

  return [moneda_, credito, inventario];
}

// ─── Producto y rentabilidad, en corto ───────────────────────────────────────────────────────────

export type ResumenProductos = {
  total: number;
  /** Con precio, costo y cuánto se vende al mes: los únicos con «cuánto deja al mes». */
  conDatos: number;
  /** Los que más dejan al mes (como mucho tres), con su cuadrante si lo hay. Solo los que dejan algo. */
  top: { id: string; nombre: string; deja: string; cuadrante: string | null }[];
  /** El 90/10: cuántos de los que tienen datos dejan casi todo. null sin cifra. */
  noventa: { cuantas: number; de: number; pct: number } | null;
};

/**
 * LA RENTABILIDAD EN CORTO, para que la tarjeta no ocupe la pantalla entera: cuántos productos tienen con qué calcular,
 * los tres que más dejan al mes y el 90/10. Lo completo (por producto, margen × volumen, palancas, cobros) va plegado
 * debajo, tal cual lo pinta TableroRentabilidad. Al sol entero; un rango se queda rango.
 */
export function resumenProductos(t: Pick<TableroRentabilidad, "productos" | "noventaDiez">, cfg: ConfigEmpresa = porDefecto): ResumenProductos {
  const fmt = (n: number) => moneda(n, cfg);
  const conDatos = t.productos.filter((p) => p.contribucion_mes != null);
  const top = conDatos
    .filter((p) => centro(p.contribucion_mes!) > 0)
    .sort((a, b) => centro(b.contribucion_mes!) - centro(a.contribucion_mes!))
    .slice(0, 3)
    .map((p) => ({ id: p.id, nombre: p.nombre, deja: textoRango(p.contribucion_mes, fmt), cuadrante: p.cuadrante ? CUADRANTE_TEXTO[p.cuadrante].nombre : null }));
  const nd = t.noventaDiez.valor;
  return {
    total: t.productos.length,
    conDatos: conDatos.length,
    top,
    noventa: nd ? { cuantas: nd.cuantas, de: nd.de, pct: Math.round(nd.pct_contribucion * 100) } : null,
  };
}

// ─── Lo que no cuadra ────────────────────────────────────────────────────────────────────────────

export type ParQueNoCuadra = {
  clave: string;
  nombre: string;
  /** «Setiembre 2026». Los pares que se contradicen son siempre del mismo periodo. */
  periodo: string;
  /** Quién lo declaró, si consta: «Declarado por el dueño»; si no, «Declarado». */
  quien: string;
  declarado: string;
  documento: string;
  /** De dónde salió la del documento, como la anotó quien lo leyó. */
  fuente: string;
  diferenciaPct: number | null;
  tolerancia: number;
};

/** Solo los pares que se contradicen, con las dos cifras escritas en su unidad. Lo que cuadra o no se comparó no entra. */
export function queNoCuadra(pares: ParDeclaradoExtraido[]): ParQueNoCuadra[] {
  return pares
    .filter((p) => p.veredicto.tipo === "CONTRADICCION")
    .map((p) => {
      const cifra = (n: number) => formatoCifra(n, p.unidad);
      const d = p.declaracion;
      return {
        clave: p.clave,
        nombre: p.nombre,
        periodo: nombreDePeriodo(p.periodo),
        quien: p.declarado.origen === "caja" ? ROTULO_DE_CAJA : rotuloDeDeclarado(p.declarante),
        declarado: d.clase === "rango" ? `entre ${cifra(d.desde)} y ${cifra(d.hasta)}` : cifra(d.valor),
        documento: cifra(p.veredicto.extraido.valor),
        fuente: p.veredicto.extraido.fuente,
        diferenciaPct: p.veredicto.diferencia_pct == null ? null : Math.round(p.veredicto.diferencia_pct),
        tolerancia: p.veredicto.tolerancia_pct,
      };
    });
}
