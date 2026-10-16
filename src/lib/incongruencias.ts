/**
 * LOS DATOS QUE NO CUADRAN (16-10-2026). Puro: sin base, sin red, sin reloj.
 *
 * Kelin: «si hay alguna incongruencia, el dueño debe tener la forma de corregir datos». Aquí se encuentran: dos
 * cifras de la misma empresa que deberían decir lo mismo y no lo dicen (lo que el dueño dijo frente a su tabla, a un
 * documento o a la cuenta), y las que no pueden ser (una ganancia mayor que la venta). Cada una sale con sus dos lados
 * a la vista, de dónde viene cada uno, cuánto difieren, qué tolerancia se le dio y por dónde se corrige. Ninguna se
 * resuelve sola salvo la de dos respuestas que se contradicen (se resuelve cuando la afirmación deja de estarlo).
 *
 * Reglas que no se negocian (las de src/lib/rules/contradiccion-numerica.ts):
 *  - 20 % de tolerancia si un lado es aproximado, un rango o un estimado; 5 % si los dos son exactos;
 *  - periodos distintos no se comparan; sin dato no hay par; una suma con un hueco no se suma;
 *  - un rango se compara por su extremo más cercano, nunca por un punto medio inventado.
 *
 * Quedan para después (y no se prometen en pantalla): la deuda total frente a la suma por cliente (no hay deudas por
 * cliente en la base: compararla con la estimación de la ficha de crédito sería inventar) y lo producido frente a lo
 * vendido más el stock (no hay producción ni stock en unidades). `REGLAS_DESPUES` las nombra para que nadie las crea
 * olvidadas.
 *
 * RESUELTA: una incongruencia está resuelta si hay una corrección con su id y la MISMA huella que hoy (la huella son
 * sus cifras). Si una cifra cambia después, la huella cambia y vuelve a abrirse.
 */
import {
  contradiccionesNumericas, declaracionDeMetrica, emparejarDeclaradoExtraido, formatoCifra, ladoDeMetrica, mencionaNumero, nombreDeClave, unidadDeClave,
  type ClaseTolerancia, type CifraDeclarada, type Declarante, type MetricaGuardada, type UnidadCifra,
} from "./rules/contradiccion-numerica";
import { tableroRentabilidad, type CostoMes, type FichaNegocio } from "./rentabilidad";
import type { LineaProducto } from "./producto";
import { esExacto, multiplicarRangos, sumarRangos, type Rango } from "./dato-oral";
import { lecturaDatosModelo } from "./esquemas-negocio";
import { moneda, porDefecto, type ConfigEmpresa } from "./formato";
import { claveAceptada, normalizarMetrica, PERIODO_DORADA } from "./metricas";
import { nombreDePeriodo } from "./temporadas";
import type { Seccion } from "./secciones";

// ─── El contrato ─────────────────────────────────────────────────────────────────────────────────

export type ReglaHoy =
  | "venta_vs_productos" | "declarado_vs_documento" | "ganancia_vs_cuenta" | "gasto_fijo_vs_tabla"
  | "de_cada_10" | "respuestas_contradichas" | "posible_eco" | "imposible";
export const REGLAS_DESPUES = ["deuda_vs_por_cliente", "producido_vs_vendido"] as const;

/** En qué orden se muestran: primero lo que no puede ser, al final lo que solo hay que confirmar. */
export const ORDEN_REGLAS: readonly ReglaHoy[] = [
  "imposible", "venta_vs_productos", "ganancia_vs_cuenta", "gasto_fijo_vs_tabla", "declarado_vs_documento", "de_cada_10", "posible_eco", "respuestas_contradichas",
];

export type Origen = "lo_dijiste" | "tu_tabla" | "documento" | "otra_fuente" | "cuenta";
/** De dónde sale cada lado, dicho al dueño. */
export const ORIGEN_DUENO: Record<Origen, string> = {
  lo_dijiste: "lo dijiste tú",
  tu_tabla: "sale de tu tabla",
  documento: "sale de un documento",
  otra_fuente: "otra fuente de tu empresa",
  cuenta: "sale de la cuenta",
};
/** Lo mismo, dicho a la consultora. */
export const ORIGEN_CONSULTORA: Record<Origen, string> = {
  lo_dijiste: "lo dijo el dueño",
  tu_tabla: "su tabla",
  documento: "un documento",
  otra_fuente: "otra persona de la empresa",
  cuenta: "la cuenta",
};

export type Lado = { valor: number | null; rango: Rango | null; texto: string; origen: Origen; detalle: string /* solo consultora */ };
export type Corrige =
  | { via: "numeros"; clave: string; periodo: string } // POST /api/portal/numeros
  | { via: "seccion"; seccion: Seccion; href: string } // la pantalla de esa sección (abierta)
  | { via: "validar"; claimId: string }; // /portal/validar
export type Eleccion = "izquierda" | "derecha" | "otra" | "no_lo_se";
export type Incongruencia = {
  /** `${regla}:${clave ?? "-"}:${periodo ?? "-"}`, estable entre lecturas. */
  id: string;
  regla: ReglaHoy;
  clave: string | null;
  periodo: string | null;
  titulo: string;
  tituloDueno: string;
  /** El lado que se pregunta. Eco, imposible y «de cada 10» tienen uno solo. */
  izquierda: Lado;
  derecha: Lado | null;
  diferenciaPct: number | null;
  toleranciaPct: number | null;
  /** Qué botones se ofrecen: un lado en rango no se puede «elegir». */
  opciones: Eleccion[];
  corrige: Corrige;
  huella: string;
  resuelta: { at: string; eleccion: Eleccion; quien: string | null; linea: string } | null;
};
export type Correccion = {
  id: string;
  /** El id de la incongruencia corregida. */
  incongruencia: string;
  huella: string;
  eleccion: Eleccion;
  antes: unknown;
  despues: number | "no_lo_se" | null;
  motivo: string | null;
  at: string;
  quien: string | null;
};
export type ClaimContradicha = {
  id: string;
  texto: string;
  contradice_a: string | null;
  deDueno: boolean;
  fuente: string;
  /** Si no viene, se toma como contradicha. Las que solo son el otro lado de una contradicción traen su estado. */
  estado?: string | null;
};
export type HechosIncongruencia = {
  metricas: MetricaGuardada[];
  lineas: LineaProducto[];
  costos: CostoMes[];
  ficha: FichaNegocio;
  config: ConfigEmpresa;
  claimsContradichas: ClaimContradicha[];
  /** id de la respuesta de entrevista → la pregunta que se le hizo. */
  preguntaDeRespuesta: ReadonlyMap<string, string>;
  /** id de la respuesta de entrevista → quién la dio. */
  declarantes: ReadonlyMap<string, Declarante | null>;
  correcciones: Correccion[];
  /** AAAA-MM del último mes cerrado, en la zona de la empresa. */
  mesPasado: string | null;
};

// ─── Huella e id ─────────────────────────────────────────────────────────────────────────────────

const conDosDecimales = (n: number) => String(Math.round(n * 100) / 100);
const parteDeHuella = (n: number | null | undefined) => (n === undefined ? "~" : n === null || !Number.isFinite(n) ? "null" : conDosDecimales(n));

/**
 * La huella de una incongruencia: su regla, su número, su periodo y sus dos cifras. `b` undefined = no tiene lado
 * derecho; null = lo tiene, sin cifra única (un rango o un texto). D la calcula con las cifras que quedan DESPUÉS de
 * corregir; aquí, con las de hoy: si coinciden, la corrección sigue valiendo.
 */
export function huellaDe(regla: string, clave: string | null, periodo: string | null, a: number | null, b: number | null | undefined): string {
  return [regla, clave ?? "-", periodo ?? "-", parteDeHuella(a), parteDeHuella(b)].join("|");
}

export const idDe = (regla: ReglaHoy, clave: string | null, periodo: string | null) => `${regla}:${clave ?? "-"}:${periodo ?? "-"}`;

/** El número y el periodo de un id de incongruencia («ganancia_vs_cuenta:ganancia_mes:2026-09»). */
export function partesDeId(id: string): { regla: string; clave: string | null; periodo: string | null } {
  const [regla = "", clave = "-", periodo = "-"] = id.split(":");
  return { regla, clave: clave === "-" ? null : clave, periodo: periodo === "-" ? null : periodo };
}

// ─── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

/** numeric de Postgres llega como texto; una cadena vacía no es cero. */
function aNumero(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

/** Una cifra con su unidad, en la moneda de la empresa si es dinero. */
function cifraDe(config: ConfigEmpresa) {
  return (n: number, unidad: UnidadCifra = "soles"): string => {
    if (unidad !== "soles") return formatoCifra(n, unidad);
    try {
      return moneda(n, config);
    } catch {
      return formatoCifra(n, unidad);
    }
  };
}

const textoDeRango = (r: Rango, escribir: (n: number) => string) => (esExacto(r) ? escribir(r.bajo) : `entre ${escribir(r.bajo)} y ${escribir(r.alto)}`);

/** El punto de cada rango más cercano al otro. Si se tocan, el mismo punto: coinciden. */
export function masCercanos(a: Rango, b: Rango): [number, number] {
  if (a.alto < b.bajo) return [a.alto, b.bajo];
  if (b.alto < a.bajo) return [a.bajo, b.alto];
  const punto = Math.max(a.bajo, b.bajo);
  return [punto, punto];
}

/** Las filas que valen: con clave y periodo canónicos, sin las descartadas. */
type Fila = MetricaGuardada & { clave: string; periodo: string; n: number | null };
function filasDe(metricas: MetricaGuardada[]): Fila[] {
  return metricas
    .filter((m) => m.estado !== "descartado")
    .map((m) => {
      const { clave, periodo } = normalizarMetrica(m.clave, m.periodo);
      return { ...m, clave, periodo, n: m.estado === "sin_dato" ? null : aNumero(m.valor) };
    });
}

/** De dónde sale una cifra guardada: lo dijo el dueño, otra persona de la empresa o un documento. */
function origenDe(f: Pick<MetricaGuardada, "estado" | "origen" | "response_id">, declarantes: ReadonlyMap<string, Declarante | null>): Origen {
  if (f.estado === "extraido" || f.estado === "verificado" || f.origen === "extraido") return "documento";
  const quien = f.response_id ? (declarantes.get(f.response_id) ?? null) : null;
  return quien === "equipo" || quien === "socio" ? "otra_fuente" : "lo_dijiste";
}

/** «de setiembre 2026», «de hoy». */
const delPeriodo = (p: string) => (ES_MES.test(p) ? `de ${nombreDePeriodo(p).toLowerCase()}` : p === PERIODO_DORADA ? "de su mejor época" : "de hoy");

/** El lado de una cifra guardada, con su texto y su detalle para la consultora. */
function ladoDeCifra(f: Fila, decl: CifraDeclarada, origen: Origen, escribir: (n: number) => string, detalle: string): Lado {
  if (decl.clase === "rango") {
    const rango = { bajo: decl.desde, alto: decl.hasta };
    return { valor: null, rango, texto: textoDeRango(rango, escribir), origen, detalle };
  }
  const valor = decl.valor ?? f.n;
  return { valor, rango: null, texto: valor == null ? "sin dato" : `${decl.clase === "aproximada" ? "unos " : ""}${escribir(valor)}`, origen, detalle };
}

type Borrador = Omit<Incongruencia, "id" | "huella" | "resuelta">;

/** Todas las opciones para dos lados; un lado en rango (o sin cifra) no se puede elegir. */
function opcionesDe(izq: Lado, der: Lado | null): Eleccion[] {
  const o: Eleccion[] = [];
  if (izq.valor != null && !izq.rango) o.push("izquierda");
  if (der && der.valor != null && !der.rango) o.push("derecha");
  return [...o, "otra", "no_lo_se"];
}

// ─── Las reglas ──────────────────────────────────────────────────────────────────────────────────

/** 1 · La venta declarada del mes pasado frente a precio × unidades de su tabla, solo si TODAS las líneas tienen los dos. */
function ventaVsProductos(h: HechosIncongruencia, filas: Fila[], escribir: (n: number) => string): Borrador[] {
  if (!h.mesPasado || !h.lineas.length) return [];
  // Lo declarado y también lo ya comprobado: una venta comprobada que no cuadra con la tabla dice que la tabla está mal.
  const venta = filas.find((f) => f.clave === "venta_mes" && f.periodo === h.mesPasado && f.estado !== "sin_dato" && (f.n != null || !!f.valor_texto?.trim()));
  if (!venta) return [];
  const decl = declaracionDeMetrica(venta);
  if (decl.clase === "desconocida") return [];
  const t = tableroRentabilidad({ lineas: h.lineas, costos: [], ficha: h.ficha, operaciones: [], metricas: [], config: h.config });
  if (t.productos.some((p) => !p.precio_efectivo || !p.unidades_mes)) return [];
  const suma = sumarRangos(t.productos.map((p) => multiplicarRangos(p.precio_efectivo!, p.unidades_mes!)));
  if (!suma) return [];
  const aOjo = !esExacto(suma) || t.productos.some((p) => p.estados.precio === "estimado" || p.estados.unidades === "estimado" || p.fuente_unidades === "de_cada_10");

  const dicho: Rango = decl.clase === "rango" ? { bajo: decl.desde, alto: decl.hasta } : { bajo: decl.valor, alto: decl.valor };
  const [d, s] = masCercanos(dicho, suma);
  const clase: ClaseTolerancia = decl.clase === "exacta" && !aOjo ? "exacta" : "aproximada";
  const v = contradiccionesNumericas(
    { concepto: "venta del mes", valor: d, periodo: h.mesPasado, fuente: "lo declarado", rotulo: "declarado" },
    { concepto: "venta del mes", valor: s, periodo: h.mesPasado, fuente: "la tabla de productos", rotulo: "extraido" },
    { clase }
  );
  if (v.tipo !== "CONTRADICCION") return [];
  const izquierda = ladoDeCifra(venta, decl, origenDe(venta, h.declarantes), escribir, `ventas del mes ${delPeriodo(h.mesPasado)}, como está anotado en sus números`);
  const derecha: Lado = {
    valor: esExacto(suma) ? suma.bajo : null,
    rango: esExacto(suma) ? null : suma,
    texto: textoDeRango(suma, escribir),
    origen: "tu_tabla",
    detalle: `precio × unidades de un mes normal, sumado en ${t.productos.length} ${t.productos.length === 1 ? "producto" : "productos"}${aOjo ? " (con datos a ojo)" : ""}`,
  };
  const mes = nombreDePeriodo(h.mesPasado).toLowerCase();
  return [{
    regla: "venta_vs_productos", clave: "venta_mes", periodo: h.mesPasado,
    titulo: `Venta declarada de ${mes} frente a precio × unidades de la tabla`,
    tituloDueno: `Tu venta de ${mes} no cuadra con lo que anotaste de lo que vendes`,
    izquierda, derecha, diferenciaPct: v.diferencia_pct, toleranciaPct: v.tolerancia_pct,
    opciones: opcionesDe(izquierda, derecha),
    corrige: { via: "numeros", clave: "venta_mes", periodo: h.mesPasado },
  }];
}

/** 2 · Lo declarado frente a lo que muestra un documento (banco, SUNAT, Yape u otro), en cualquiera de sus números. */
function declaradoVsDocumento(h: HechosIncongruencia, escribir: (n: number, u?: UnidadCifra) => string): Borrador[] {
  return emparejarDeclaradoExtraido(h.metricas, { declarantes: h.declarantes })
    .filter((p) => p.veredicto.tipo === "CONTRADICCION" && claveAceptada(p.clave) && p.periodo === p.periodo_extraido)
    .map((p) => {
      const enSuUnidad = (n: number) => escribir(n, p.unidad);
      const origen: Origen = p.declarante === "equipo" || p.declarante === "socio" ? "otra_fuente" : "lo_dijiste";
      const decl = p.declaracion;
      const izquierda: Lado =
        decl.clase === "rango"
          ? { valor: null, rango: { bajo: decl.desde, alto: decl.hasta }, texto: textoDeRango({ bajo: decl.desde, alto: decl.hasta }, enSuUnidad), origen, detalle: p.veredicto.declarado.fuente }
          : { valor: decl.valor, rango: null, texto: `${decl.clase === "aproximada" ? "unos " : ""}${enSuUnidad(decl.valor)}`, origen, detalle: p.veredicto.declarado.fuente };
      const derecha: Lado = {
        valor: p.veredicto.extraido.valor, rango: null, texto: enSuUnidad(p.veredicto.extraido.valor), origen: "documento",
        detalle: `${p.veredicto.extraido.fuente}${p.extraido_al_lado ? " (guardada al lado: ya no figura en la revisión de su fuente)" : ""}`,
      };
      return {
        regla: "declarado_vs_documento" as const, clave: p.clave, periodo: p.periodo,
        titulo: `${p.nombre} ${delPeriodo(p.periodo)}: lo declarado no cuadra con el documento`,
        tituloDueno: `«${p.nombre}» ${delPeriodo(p.periodo)}: ${origen === "lo_dijiste" ? "lo que nos dijiste" : "lo que nos dijeron"} no cuadra con tu documento`,
        izquierda, derecha, diferenciaPct: p.veredicto.diferencia_pct, toleranciaPct: p.veredicto.tolerancia_pct,
        opciones: opcionesDe(izquierda, derecha),
        corrige: { via: "numeros" as const, clave: p.clave, periodo: p.periodo },
      };
    });
}

/** Una cifra guardada que se puede usar en una cuenta: con número y sin «no lo sé». */
const conNumero = (filas: Fila[], clave: string, periodo: string) => filas.find((f) => f.clave === clave && f.periodo === periodo && f.n != null) ?? null;

/** 10 · Lo que no puede ser: una ganancia mayor que la venta del mismo mes, y una caja negativa. */
function imposibles(h: HechosIncongruencia, filas: Fila[], escribir: (n: number) => string): Borrador[] {
  const salida: Borrador[] = [];
  const meses = [...new Set(filas.filter((f) => f.clave === "ganancia_mes" && ES_MES.test(f.periodo)).map((f) => f.periodo))].sort().reverse();
  for (const p of meses) {
    const g = conNumero(filas, "ganancia_mes", p);
    const v = conNumero(filas, "venta_mes", p);
    if (!g || !v || g.n! <= v.n!) continue;
    const mes = nombreDePeriodo(p).toLowerCase();
    salida.push({
      regla: "imposible", clave: "ganancia_mes", periodo: p,
      titulo: `Ganancia mayor que la venta en ${mes}`,
      tituloDueno: `En ${mes}, lo que te quedó figura como más de lo que vendiste`,
      izquierda: { valor: g.n, rango: null, texto: escribir(g.n!), origen: origenDe(g, h.declarantes), detalle: `la venta de ese mes figura en ${escribir(v.n!)}` },
      derecha: null, diferenciaPct: null, toleranciaPct: null,
      opciones: ["otra", "no_lo_se"],
      corrige: { via: "numeros", clave: "ganancia_mes", periodo: p },
    });
  }
  const cajas = filas.filter((f) => f.clave === "caja_hoy" && f.n != null).sort((a, b) => (ES_MES.test(b.periodo) ? b.periodo : "9999").localeCompare(ES_MES.test(a.periodo) ? a.periodo : "9999"));
  const caja = cajas[0];
  if (caja && caja.n! < 0) {
    salida.push({
      regla: "imposible", clave: "caja_hoy", periodo: caja.periodo,
      titulo: "Dinero en caja anotado en negativo",
      tituloDueno: "Tu dinero en caja figura en negativo",
      izquierda: { valor: caja.n, rango: null, texto: escribir(caja.n!), origen: origenDe(caja, h.declarantes), detalle: "la caja es lo que hay en efectivo y en el banco: no puede ser menos que cero" },
      derecha: null, diferenciaPct: null, toleranciaPct: null,
      opciones: ["otra", "no_lo_se"],
      corrige: { via: "numeros", clave: "caja_hoy", periodo: caja.periodo },
    });
  }
  return salida;
}

/**
 * 3 · Lo que le quedó frente a venta − mercadería − gasto fijo, del MISMO mes (el gasto fijo de ese mes o el de hoy),
 * los cuatro con número. Se mira el mes más reciente que tiene los cuatro: es el que usa el diagnóstico; los meses
 * viejos son historia. Un cero en mercadería o en gasto fijo se trata como sin dato (regla de la casa). Si en ese mes
 * la ganancia ya es mayor que la venta, lo dice «imposible» y aquí no se repite.
 */
function gananciaVsCuenta(h: HechosIncongruencia, filas: Fila[], escribir: (n: number) => string, yaImposibles: Set<string>): Borrador[] {
  const meses = [...new Set(filas.filter((f) => f.clave === "ganancia_mes" && ES_MES.test(f.periodo)).map((f) => f.periodo))].sort().reverse();
  for (const p of meses) {
    const g = conNumero(filas, "ganancia_mes", p);
    const v = conNumero(filas, "venta_mes", p);
    const cv = conNumero(filas, "costo_variable_mes", p);
    const gfDelMes = conNumero(filas, "gasto_fijo_mes", p);
    const gf = gfDelMes && gfDelMes.n! > 0 ? gfDelMes : conNumero(filas, "gasto_fijo_mes", "actual");
    if (!g || !v || !cv || !gf || cv.n! <= 0 || gf.n! <= 0) continue;
    if (yaImposibles.has(p)) return [];
    const cuenta = v.n! - cv.n! - gf.n!;
    const decls = [g, v, cv, gf].map((f) => declaracionDeMetrica(f));
    const clase: ClaseTolerancia = decls.every((d) => d.clase === "exacta") ? "exacta" : "aproximada";
    const ver = contradiccionesNumericas(
      { concepto: "lo que quedó", valor: g.n!, periodo: p, fuente: "lo declarado", rotulo: "declarado" },
      { concepto: "lo que quedó", valor: cuenta, periodo: p, fuente: "la cuenta", rotulo: "extraido" },
      { clase }
    );
    if (ver.tipo !== "CONTRADICCION") return [];
    const mes = nombreDePeriodo(p).toLowerCase();
    const izquierda: Lado = { valor: g.n, rango: null, texto: `${decls[0]!.clase === "aproximada" ? "unos " : ""}${escribir(g.n!)}`, origen: origenDe(g, h.declarantes), detalle: `lo que le quedó libre en ${mes}, como está anotado` };
    const derecha: Lado = {
      valor: cuenta, rango: null, texto: escribir(cuenta), origen: "cuenta",
      detalle: `venta ${escribir(v.n!)} − mercadería ${escribir(cv.n!)} − gasto fijo ${escribir(gf.n!)}${gf.periodo === p ? "" : " (el de hoy)"}`,
    };
    return [{
      regla: "ganancia_vs_cuenta", clave: "ganancia_mes", periodo: p,
      titulo: `Ganancia de ${mes} frente a venta − mercadería − gasto fijo`,
      tituloDueno: `Lo que te quedó en ${mes} no cuadra con la cuenta de tus números`,
      izquierda, derecha, diferenciaPct: ver.diferencia_pct, toleranciaPct: ver.tolerancia_pct,
      opciones: opcionesDe(izquierda, derecha),
      corrige: { via: "numeros", clave: "ganancia_mes", periodo: p },
    }];
  }
  return [];
}

/** 4 · El gasto fijo de los 9 números frente a la suma de los gastos fijos de su tabla. Una suma con un hueco no se suma. */
function gastoFijoVsTabla(h: HechosIncongruencia, filas: Fila[], escribir: (n: number) => string): Borrador[] {
  const metricas = filas.map((f) => ({ clave: f.clave, periodo: f.periodo, valor: f.n, estado: f.estado ?? null }));
  const t = tableroRentabilidad({ lineas: [], costos: h.costos, ficha: h.ficha, operaciones: [], metricas, config: h.config });
  const tabla = t.fijos.solo_fijos;
  if (!tabla || t.fijos.vital == null || t.fijos.vital <= 0) return [];
  // La fila exacta del vital que usó la cuenta: el mes más reciente; «hoy» solo si no hay ninguno.
  const delVital = filas
    .filter((f) => f.clave === "gasto_fijo_mes" && f.periodo !== PERIODO_DORADA && f.n != null)
    .sort((a, b) => (b.periodo === "actual" ? "" : b.periodo).localeCompare(a.periodo === "actual" ? "" : a.periodo))[0];
  if (!delVital) return [];
  const decl = declaracionDeMetrica(delVital);
  const aOjo = !esExacto(tabla) || h.costos.some((c) => c.tipo === "fijo" && c.periodo === "mes_tipico" && c.dato.estado === "estimado");
  const clase: ClaseTolerancia = decl.clase === "exacta" && !aOjo ? "exacta" : "aproximada";
  const [d, s] = masCercanos({ bajo: delVital.n!, alto: delVital.n! }, tabla);
  const v = contradiccionesNumericas(
    { concepto: "gasto fijo", valor: d, periodo: "mes", fuente: "lo declarado", rotulo: "declarado" },
    { concepto: "gasto fijo", valor: s, periodo: "mes", fuente: "la tabla de gastos", rotulo: "extraido" },
    { clase }
  );
  if (v.tipo !== "CONTRADICCION") return [];
  const filasFijas = h.costos.filter((c) => c.tipo === "fijo" && c.periodo === "mes_tipico").length;
  const izquierda: Lado = { valor: delVital.n, rango: null, texto: `${decl.clase === "aproximada" ? "unos " : ""}${escribir(delVital.n!)}`, origen: origenDe(delVital, h.declarantes), detalle: `gasto fijo ${delPeriodo(delVital.periodo)}, de sus 9 números` };
  const derecha: Lado = {
    valor: esExacto(tabla) ? tabla.bajo : null, rango: esExacto(tabla) ? null : tabla, texto: textoDeRango(tabla, escribir), origen: "tu_tabla",
    detalle: `suma de ${filasFijas} ${filasFijas === 1 ? "gasto fijo" : "gastos fijos"} de su tabla de gastos del mes`,
  };
  return [{
    regla: "gasto_fijo_vs_tabla", clave: "gasto_fijo_mes", periodo: delVital.periodo,
    titulo: "Gasto fijo declarado frente a la suma de la tabla de gastos",
    tituloDueno: "Lo que pagas sí o sí cada mes no cuadra con la suma de tu tabla de gastos",
    izquierda, derecha, diferenciaPct: v.diferencia_pct, toleranciaPct: v.tolerancia_pct,
    opciones: opcionesDe(izquierda, derecha),
    corrige: { via: "numeros", clave: "gasto_fijo_mes", periodo: delVital.periodo },
  }];
}

/**
 * 6 · Las partes «de cada 10» de un grupo que no suman 10. Por grupo, porque el «de cada 10» se dice dentro de su grupo
 * («de cada 10 pantalones»). Salta si todas las líneas del grupo tienen su parte y el rango sumado no contiene 10, o si
 * con huecos ya pasa de 10.
 */
function deCada10(h: HechosIncongruencia): Borrador[] {
  const grupos = new Map<string, { nombre: string | null; partes: (Rango | null)[] }>();
  for (const l of h.lineas) {
    const k = (l.grupo ?? "").trim().toLowerCase().replace(/:/g, " ");
    const parte: Rango | null = l.participacion_de_10 != null ? { bajo: l.participacion_de_10, alto: l.participacion_de_10 } : lecturaDatosModelo(l.datos_modelo).rangoDeCada10;
    const g = grupos.get(k) ?? { nombre: l.grupo?.trim() || null, partes: [] };
    g.partes.push(parte);
    grupos.set(k, g);
  }
  const salida: Borrador[] = [];
  for (const [k, g] of grupos) {
    const dichas = g.partes.filter((p): p is Rango => p != null);
    if (!dichas.length) continue;
    const suma = dichas.reduce((s, r) => ({ bajo: s.bajo + r.bajo, alto: s.alto + r.alto }), { bajo: 0, alto: 0 });
    const completo = dichas.length === g.partes.length;
    const salta = completo ? !(suma.bajo <= 10 && 10 <= suma.alto) : suma.bajo > 10;
    if (!salta) continue;
    const enDiez = (n: number) => String(Math.round(n * 10) / 10);
    const cuanto = esExacto(suma) ? enDiez(suma.bajo) : `entre ${enDiez(suma.bajo)} y ${enDiez(suma.alto)}`;
    const de = g.nombre ? `de «${g.nombre}»` : "de lo que vendes";
    salida.push({
      regla: "de_cada_10", clave: k || null, periodo: null,
      titulo: `«De cada 10» ${de}: las partes suman ${cuanto}${completo ? "" : " y faltan líneas por decir"}`,
      tituloDueno: `Las partes «de cada 10» ${de} suman ${cuanto}, y deberían sumar 10`,
      izquierda: { valor: esExacto(suma) ? suma.bajo : null, rango: esExacto(suma) ? null : suma, texto: `suman ${cuanto} de 10`, origen: "tu_tabla", detalle: `${dichas.length} de ${g.partes.length} ${g.partes.length === 1 ? "línea" : "líneas"} del grupo con su parte` },
      derecha: null, diferenciaPct: null, toleranciaPct: null,
      opciones: [],
      corrige: { via: "seccion", seccion: "productos", href: "/portal/producto" },
    });
  }
  return salida;
}

/** 8 · Dos respuestas que se contradicen, una vez por par (como /portal/validar). Se resuelve sola en Confirmar. */
function respuestasContradichas(h: HechosIncongruencia): Borrador[] {
  const porId = new Map(h.claimsContradichas.map((c) => [c.id, c]));
  const vistos = new Set<string>();
  const salida: Borrador[] = [];
  for (const c of h.claimsContradichas) {
    if ((c.estado ?? "contradicho") !== "contradicho" || !c.contradice_a) continue;
    const otra = porId.get(c.contradice_a);
    if (!otra) continue;
    const par = [c.id, otra.id].sort().join("|");
    if (vistos.has(par)) continue;
    vistos.add(par);
    // A la izquierda, lo que dijo el dueño si alguno es suyo: es lo que se le pregunta.
    const [a, b] = !c.deDueno && otra.deDueno ? [otra, c] : [c, otra];
    const lado = (x: ClaimContradicha): Lado => ({ valor: null, rango: null, texto: x.texto, origen: x.deDueno ? "lo_dijiste" : "otra_fuente", detalle: x.fuente });
    salida.push({
      regla: "respuestas_contradichas", clave: par, periodo: null,
      titulo: "Dos respuestas se contradicen",
      tituloDueno: "Dos cosas que nos contaron no coinciden",
      izquierda: lado(a), derecha: lado(b), diferenciaPct: null, toleranciaPct: null,
      opciones: [],
      corrige: { via: "validar", claimId: a.id },
    });
  }
  return salida;
}

/**
 * 9 · Posible eco: una cifra que el dueño dio en la entrevista cuando la pregunta ya la mencionaba. Puede ser suya o
 * puede ser el ejemplo de la pregunta repetido. Se le pregunta a él. «De cada 10» no entra: su pregunta siempre dice 10.
 */
function posiblesEcos(h: HechosIncongruencia, filas: Fila[], escribir: (n: number, u?: UnidadCifra) => string): Borrador[] {
  const salida: Borrador[] = [];
  for (const f of filas) {
    if (!f.response_id || f.n == null || ladoDeMetrica(f) !== "declarado" || !claveAceptada(f.clave)) continue;
    const unidad = unidadDeClave(f.clave);
    if (unidad === "de_cada_10") continue;
    const pregunta = h.preguntaDeRespuesta.get(f.response_id);
    if (!pregunta || !mencionaNumero(pregunta, f.n)) continue;
    const nombre = nombreDeClave(f.clave);
    salida.push({
      regla: "posible_eco", clave: f.clave, periodo: f.periodo,
      titulo: `Posible eco en «${nombre}»: la pregunta ya traía esa cifra`,
      tituloDueno: `Confírmanos «${nombre}» ${delPeriodo(f.periodo)}: queremos estar seguros de que es tu número`,
      izquierda: { valor: f.n, rango: null, texto: escribir(f.n, unidad), origen: origenDe(f, h.declarantes), detalle: `la pregunta decía: «${pregunta.slice(0, 160)}${pregunta.length > 160 ? "…" : ""}»` },
      derecha: null, diferenciaPct: null, toleranciaPct: null,
      opciones: ["izquierda", "otra", "no_lo_se"],
      corrige: { via: "numeros", clave: f.clave, periodo: f.periodo },
    });
  }
  return salida;
}

// ─── Todas juntas ────────────────────────────────────────────────────────────────────────────────

/** Las incongruencias de hoy: abiertas primero (en el orden de ORDEN_REGLAS), después las resueltas. */
export function incongruenciasDe(h: HechosIncongruencia): Incongruencia[] {
  const config = h.config ?? porDefecto;
  const escribir = cifraDe(config);
  const filas = filasDe(h.metricas);
  const imposiblesHoy = imposibles(h, filas, escribir);
  const mesesImposibles = new Set(imposiblesHoy.filter((i) => i.clave === "ganancia_mes" && i.periodo).map((i) => i.periodo as string));
  const borradores: Borrador[] = [
    ...imposiblesHoy,
    ...ventaVsProductos(h, filas, escribir),
    ...gananciaVsCuenta(h, filas, escribir, mesesImposibles),
    ...gastoFijoVsTabla(h, filas, escribir),
    ...declaradoVsDocumento(h, escribir),
    ...deCada10(h),
    ...posiblesEcos(h, filas, escribir),
    ...respuestasContradichas(h),
  ];
  const todas: Incongruencia[] = borradores.map((b) => {
    const id = idDe(b.regla, b.clave, b.periodo);
    const huella = huellaDe(b.regla, b.clave, b.periodo, b.izquierda.valor, b.derecha ? b.derecha.valor : undefined);
    const correccion = h.correcciones
      .filter((c) => c.incongruencia === id && c.huella === huella)
      .sort((a, b2) => b2.at.localeCompare(a.at))[0];
    return {
      ...b, id, huella,
      resuelta: correccion ? { at: correccion.at, eleccion: correccion.eleccion, quien: correccion.quien, linea: lineaDeCorreccion(correccion, config) } : null,
    };
  });
  // Un mismo id no sale dos veces (dos filas del mismo número en el mismo periodo no deberían existir; si existen, una basta).
  const unicas = [...new Map(todas.map((i) => [i.id, i])).values()];
  const orden = (i: Incongruencia) => ORDEN_REGLAS.indexOf(i.regla);
  return unicas.sort((a, b) => Number(!!a.resuelta) - Number(!!b.resuelta) || orden(a) - orden(b));
}

export const abiertasDe = (l: Incongruencia[]): Incongruencia[] => l.filter((i) => !i.resuelta);

// ─── El rastro de una corrección, en una línea ─────────────────────────────────────────────────────

/** El número de un lado guardado en `antes`, venga como número o como lado entero. */
function numeroDe(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "valor" in v) return numeroDe((v as { valor: unknown }).valor);
  return null;
}

/** «17-10» en la zona de la empresa. */
function diaMesDe(iso: string, zona: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sin fecha";
  const f = (z: string) => new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", timeZone: z }).format(d).replace(/\//g, "-");
  try {
    return f(zona);
  } catch {
    return f("America/Lima");
  }
}

/**
 * La línea del rastro: «17-10 · Rosa cambió «Ventas del mes» (setiembre 2026) de S/ 40,000 a «no lo sé»». La cifra de
 * antes es la del lado que se preguntaba (el izquierdo); la de después, la que quedó.
 */
export function lineaDeCorreccion(c: Correccion, config: ConfigEmpresa = porDefecto): string {
  const { clave, periodo } = partesDeId(c.incongruencia);
  const unidad = clave ? unidadDeClave(clave) : "soles";
  const escribir = cifraDe(config);
  const nombre = clave && claveAceptada(clave) ? `«${nombreDeClave(clave)}»${periodo && ES_MES.test(periodo) ? ` (${nombreDePeriodo(periodo).toLowerCase()})` : ""}` : "un dato";
  const antes = c.antes && typeof c.antes === "object" ? numeroDe((c.antes as { izquierda?: unknown }).izquierda) : numeroDe(c.antes);
  const de = antes == null ? "" : ` de ${escribir(antes, unidad)}`;
  const despues = c.despues === "no_lo_se" || (c.eleccion === "no_lo_se" && c.despues == null) ? "«no lo sé»" : typeof c.despues === "number" ? escribir(c.despues, unidad) : "sin dato";
  const quien = c.quien?.trim() || null;
  const fecha = diaMesDe(c.at, config.zona_horaria);
  if (c.eleccion === "izquierda" && typeof c.despues === "number" && (antes == null || antes === c.despues)) {
    return `${fecha} · ${quien ? `${quien} confirmó` : "se confirmó"} ${nombre}: ${despues}`;
  }
  return `${fecha} · ${quien ? `${quien} cambió` : "se cambió"} ${nombre}${de} a ${despues}`;
}
