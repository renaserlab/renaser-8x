import { VITALES, VITAL_POR_CLAVE, derivados, normalizarMetrica, CLAVES_VITALES, type Metrica, type Vital } from "./metricas";

/**
 * LA LÍNEA BASE Y LOS CORTES — cómo se responde "¿funcionó lo que hicimos?".
 *
 * Hasta hoy no se podía: el diagnóstico era una foto única y los cortes guardaban sus indicadores
 * como texto libre, sin conexión con los números. Una medición es una foto congelada de los nueve
 * vitales con su fecha; la primera es el "antes" y cada corte es un "después" que se compara contra
 * ella. Los derivados se congelan también, para que la historia siga siendo honesta aunque mañana
 * cambie la fórmula.
 *
 * DESDE EL 13-10-2026 LA LÍNEA BASE TIENE VERSIONES (sección 14). Volver a congelarla no borra la
 * anterior: queda con `vigente = false`, la nueva lleva `version + 1` y `reemplaza_a`. Cada corte
 * guarda `linea_base_id`, la versión EXACTA contra la que se midió, y esa es la única contra la que se
 * puede comparar: una corrección posterior del punto de partida no cambia en silencio lo que ya se dijo.
 * Además cada medición puede llevar su período (desde/hasta) y sus condiciones (temporada, cambios de
 * local, de precio…), porque comparar mayo contra una campaña navideña no es comparar.
 */

/** Un cambio de condiciones que afecta a la comparación: qué cambió, desde cuándo y qué se espera que haga. */
export type CambioCondicion = {
  que_cambio: string;
  /** Fecha YYYY-MM-DD desde la que rige el cambio. */
  desde: string;
  efecto_esperado: string;
  /** Claves de los números a los que afecta. Vacío o ausente = afecta a toda la comparación. */
  afecta?: string[];
  registrado_at?: string;
  registrado_por?: string | null;
};

export type Condiciones = {
  /** Nombre de la temporada del período medido («alta», «normal», «campaña escolar»…). */
  temporada?: string | null;
  cambios?: CambioCondicion[];
};

export type Medicion = {
  id: string;
  tipo: "linea_base" | "corte";
  numero: number;
  fecha: string;
  valores: Record<string, number | null>;
  derivados: Record<string, number | null>;
  nota: string | null;
  // Versionado (migracion-plan-kpi-linea-base.sql). Opcionales: las filas anteriores a la migración no los traen.
  version?: number | null;
  vigente?: boolean | null;
  reemplaza_a?: string | null;
  /** En un corte: la versión exacta de la línea base contra la que se midió. */
  linea_base_id?: string | null;
  motivo_version?: string | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
  condiciones?: Condiciones | null;
  hash_contenido?: string | null;
};

/** Las columnas de `mediciones` que la app lee desde el versionado. Si la migración no está aplicada, la consulta falla y se cae a las de siempre. */
export const COLUMNAS_MEDICION =
  "id,tipo,numero,fecha,valores,derivados,nota,version,vigente,reemplaza_a,linea_base_id,motivo_version,periodo_desde,periodo_hasta,condiciones,hash_contenido";
/** Las columnas anteriores al versionado (migracion-mediciones.sql), para una base sin la migración de 13-10. */
export const COLUMNAS_MEDICION_LEGADO = "id,tipo,numero,fecha,valores,derivados,nota";

export type Movimiento = {
  vital: Vital;
  antes: number | null;
  despues: number | null;
  /** Diferencia absoluta. null si falta cualquiera de los dos extremos. */
  delta: number | null;
  /** Variación porcentual. null si el punto de partida era cero: de cero no se calcula un porcentaje. */
  deltaPct: number | null;
  /** true mejoró, false empeoró, null no se puede juzgar (sin dato, es un número neutro, o es provisional). */
  mejoro: boolean | null;
  /**
   * true si alguno de los dos extremos era provisional al congelarse (leído de un documento y sin revisar).
   * Lo provisional nunca es conclusión: el movimiento se muestra, la frase lo dice, y no se juzga ni se atribuye.
   */
  provisional: boolean;
  /** Lo que se le dice al dueño, en su idioma. */
  frase: string;
};

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

function comoTexto(v: Vital, n: number): string {
  if (v.unidad === "de_cada_10") return `${Math.round(n)} de cada 10`;
  if (v.unidad === "dias") return `${Math.round(n)} días`;
  return soles(n);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ES_DIA = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Una fecha YYYY-MM-DD en castellano, sin pasar por la zona horaria del servidor: `new Date("2026-05-01")`
 * es medianoche UTC y en Lima se imprime como 30 de abril. Las fechas de medición son días, no instantes.
 */
export function fechaDia(iso: string | null | undefined): string {
  const m = iso ? ES_DIA.exec(iso) : null;
  if (!m) return "sin fecha";
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return "sin fecha";
  return `${Number(m[3])} ${mes} ${m[1]}`;
}

/** Días desde la época para un YYYY-MM-DD, o null si no es una fecha. */
function diaNumero(iso: string | null | undefined): number | null {
  const m = iso ? ES_DIA.exec(iso) : null;
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.round(t / 86_400_000) : null;
}

/**
 * El número que se congela de cada vital, con el estado con el que llegó. Una sola elección para los
 * valores y para saber cuáles eran provisionales: si fueran dos, podrían no hablar de la misma fila.
 */
function elegidosActuales(metricas: Metrica[]): Record<string, { valor: number; estado: string | null }> {
  const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
  const salida: Record<string, { valor: number; estado: string | null }> = {};
  for (const clave of CLAVES_VITALES) {
    const candidatos = metricas
      .map((m) => ({ n: normalizarMetrica(m.clave, m.periodo), valor: m.valor, estado: m.estado ?? null }))
      // Un «descartado» no se congela aunque conserve un valor: lo excluye su estado, igual que en los
      // cálculos y en la radiografía. Antes entraba en la foto si quien lo descartó no lo había vaciado.
      .filter((c) => c.n.clave === clave && c.n.periodo !== "epoca_dorada" && c.valor != null && c.estado !== "descartado");
    // El mes más reciente manda; "actual" solo si no hay ningún mes fechado.
    const conMes = candidatos.filter((c) => ES_MES.test(c.n.periodo)).sort((a, b) => b.n.periodo.localeCompare(a.n.periodo));
    const elegido = conMes[0] ?? candidatos[0];
    if (elegido?.valor != null) salida[clave] = { valor: Number(elegido.valor), estado: elegido.estado };
  }
  return salida;
}

/** Toma los vitales de hoy tal como están en company_metricas, listos para congelar. Lo descartado no entra. */
export function valoresActuales(metricas: Metrica[]): Record<string, number | null> {
  const salida: Record<string, number | null> = {};
  for (const [clave, e] of Object.entries(elegidosActuales(metricas))) salida[clave] = e.valor;
  return salida;
}

/**
 * LO QUE ERA PROVISIONAL EN EL MOMENTO DE CONGELAR. Los vitales que se congelan con estado «extraído»
 * (leídos de un documento y sin conciliar) y las cifras calculadas que se apoyan en alguno. Lo extraído
 * nunca es verificado, y una foto congelada no puede olvidarlo: si no queda escrito EN la medición, mañana
 * el punto de partida muestra una cifra firme que nunca lo fue.
 */
export function provisionalesActuales(metricas: Metrica[]): string[] {
  const vitales = Object.entries(elegidosActuales(metricas)).filter(([, e]) => e.estado === "extraido").map(([clave]) => clave);
  const p = derivados(metricas).provisional;
  const cifras = (Object.keys(p) as (keyof typeof p)[]).filter((k) => p[k]);
  return [...vitales, ...cifras];
}

/**
 * Dónde queda escrito, dentro de la medición: en `derivados`, bajo esta clave, como texto con las claves
 * separadas por comas. Va ahí y no en una columna nueva porque `derivados` es lo único que las DOS rutas
 * que congelan (la de medición y la del corte del plan) mandan a la base sin pasar por nadie más, entra en
 * la huella de la medición y se copia tal cual al acta. Es texto y no una lista para que el reintento de un
 * corte siga reconociendo «los mismos números» al compararlos uno a uno.
 */
export const CLAVE_PROVISIONALES = "provisionales";

/** Las claves (vitales y cifras calculadas) que eran provisionales cuando se congeló esta medición. Sin marca, ninguna. */
export function provisionalesDe(m: Pick<Medicion, "derivados"> | null | undefined): string[] {
  const marca = (m?.derivados as Record<string, unknown> | null | undefined)?.[CLAVE_PROVISIONALES];
  const lista = typeof marca === "string" ? marca.split(",") : Array.isArray(marca) ? marca.map(String) : [];
  return lista.map((s) => s.trim()).filter(Boolean);
}

/** Los vitales provisionales de una medición, con el nombre que lee el dueño. Las cifras calculadas no se listan aquí. */
export function nombresProvisionales(m: Pick<Medicion, "derivados"> | null | undefined): string[] {
  return provisionalesDe(m).map((clave) => VITAL_POR_CLAVE.get(clave)?.nombre).filter((n): n is string => n != null);
}

/**
 * LA FRASE QUE ACOMPAÑA A UNA MEDICIÓN CON NÚMEROS PROVISIONALES, una sola para toda pantalla que diga
 * «fijado con N números» y para el acta. Nombra cada número con el nombre que lee el dueño y dice qué
 * consecuencia tiene. null si nada era provisional: entonces no se añade nada. `deQue` es cómo llama cada
 * pantalla a la medición («esa foto», «este punto de partida», «esta medición»).
 */
export function fraseProvisionales(m: Pick<Medicion, "derivados"> | null | undefined, deQue: string = "esa foto"): string | null {
  const nombres = nombresProvisionales(m);
  if (nombres.length === 0) return null;
  const uno = nombres.length === 1;
  return `${uno ? "Un número" : `${nombres.length} números`} de ${deQue} ${uno ? "es provisional" : "son provisionales"}: ${nombres.join(", ")}. ${uno ? "Sale" : "Salen"} de un documento que falta revisar; hasta entonces, lo que se compare con ${uno ? "él" : "ellos"} no se lee como resultado.`;
}

/**
 * Los derivados que se congelan junto a los valores.
 * Desde el 13-10-2026 (D5) `equilibrio` es el de la EMPRESA (null si no hay costos variables) y la
 * cifra del producto estrella se congela bajo su nombre verdadero. Las mediciones anteriores
 * conservan lo que significaba `equilibrio` cuando se congelaron: por eso se congela, para no
 * reescribir la historia.
 */
export function derivadosActuales(metricas: Metrica[]): Record<string, number | null> {
  const d = derivados(metricas);
  const cifras: Record<string, number | null> = {
    margen: d.margen,
    margenUnitario: d.margenUnitario,
    equilibrio: d.equilibrio,
    equilibrioProductoEstrella: d.equilibrioProductoEstrella,
    diasAguante: d.diasAguante,
  };
  // Si nada era provisional no se añade nada: las mediciones con números contados o verificados quedan
  // exactamente como antes. Si algo lo era, viaja con la foto (ver CLAVE_PROVISIONALES). El tipo declarado
  // sigue siendo el de las cifras; la marca es el único texto y se lee solo con `provisionalesDe`.
  const provisionales = provisionalesActuales(metricas);
  if (provisionales.length === 0) return cifras;
  return { ...cifras, [CLAVE_PROVISIONALES]: provisionales.join(", ") } as unknown as Record<string, number | null>;
}

// ---------------------------------------------------------------------------------------------
// VERSIONES DE LA LÍNEA BASE
// ---------------------------------------------------------------------------------------------

/** Lo mínimo de una medición para saber qué versión del punto de partida rige: sirve también a quien no leyó la fila entera. */
export type ConVersion = Pick<Medicion, "tipo" | "version" | "vigente">;

/** Las versiones de la línea base, la más nueva primero. Una fila sin `version` (anterior a la migración) cuenta como 1. */
export function versionesLineaBase<T extends ConVersion>(mediciones: readonly T[]): T[] {
  return mediciones.filter((m) => m.tipo === "linea_base").sort((a, b) => (b.version ?? 1) - (a.version ?? 1));
}

/**
 * El punto de partida que rige HOY. Con la migración aplicada es la única con `vigente = true`; sin
 * ella (filas sin la columna) solo puede haber una y es esa. Nunca se elige «la primera que aparezca».
 */
export function lineaBaseVigente<T extends ConVersion>(mediciones: readonly T[]): T | null {
  const bases = versionesLineaBase(mediciones);
  return bases.find((m) => m.vigente === true) ?? bases.find((m) => m.vigente == null) ?? null;
}

/**
 * Por qué un corte no tiene registrada la versión contra la que se midió. Son dos casos que no se pueden
 * confundir: «sin punto de partida al medir» (la función nueva lo congeló —trae `hash_contenido`— y en ese
 * momento no había ninguna línea base vigente: no hay contra qué comparar) y «anterior al versionado»
 * (sin huella: lo congeló la función vieja, que no guardaba la referencia porque recongelar borraba la anterior).
 */
export type SinVersion = "sin_punto_de_partida" | "anterior_al_versionado";

export type LineaBaseDelCorte = {
  base: Medicion | null;
  /** true cuando el corte guardó `linea_base_id` y esa versión existe. */
  registrada: boolean;
  /** Solo cuando no está registrada: por qué. */
  motivo?: SinVersion;
};

/**
 * La versión exacta contra la que se midió un corte. Si el corte guarda `linea_base_id`, es esa aunque
 * ya no esté vigente. Si no lo guarda, se distingue: un corte congelado SIN punto de partida vigente no
 * tiene base (compararlo con una fijada después sería inventar el «antes»); un corte anterior al
 * versionado cae a la vigente y se dice que no quedó registro, porque en ese tiempo recongelar borraba la anterior.
 */
export function lineaBaseDe(corte: Medicion | null, mediciones: readonly Medicion[]): LineaBaseDelCorte {
  if (!corte) return { base: null, registrada: false };
  if (corte.linea_base_id) {
    const exacta = mediciones.find((m) => m.id === corte.linea_base_id) ?? null;
    return { base: exacta, registrada: exacta != null };
  }
  if (corte.hash_contenido) return { base: null, registrada: false, motivo: "sin_punto_de_partida" };
  return { base: lineaBaseVigente(mediciones), registrada: false, motivo: "anterior_al_versionado" };
}

/** Lo que se le dice a quien mira un corte sin versión registrada, en el idioma de cada pantalla. */
export function textoSinVersion(motivo: SinVersion | undefined, para: "consultor" | "dueno"): string {
  if (motivo === "sin_punto_de_partida")
    return para === "consultor"
      ? "Este corte se congeló cuando no había punto de partida vigente: no hay contra qué compararlo. No se compara con una versión fijada después."
      : "Este corte se registró cuando todavía no había punto de partida, así que no se puede comparar. Los próximos sí se medirán contra tu punto de partida.";
  if (motivo === "anterior_al_versionado")
    return para === "consultor"
      ? "Este corte no guardó contra qué versión se midió (es anterior al versionado): se compara con la vigente y se dice."
      : "Este corte es anterior a que guardáramos las versiones del punto de partida: se compara con el punto de partida de hoy.";
  return "";
}

/** Se pidió comparar un corte contra una versión del punto de partida que no es la suya. */
export class VersionDistinta extends Error {
  constructor(
    readonly versionDelCorte: number | null,
    readonly versionPasada: number | null
  ) {
    super(
      versionDelCorte != null
        ? `Este corte se midió contra la versión ${versionDelCorte} del punto de partida, no contra la versión ${versionPasada ?? "?"}: comparar con otra cambiaría la historia.`
        : `Este corte se midió contra otra versión del punto de partida, no contra la versión ${versionPasada ?? "?"}: comparar con otra cambiaría la historia.`
    );
    this.name = "VersionDistinta";
  }
}

/**
 * Qué se movió entre dos mediciones. Solo devuelve los vitales que existen en alguna de las dos:
 * los que nunca se midieron no son un retroceso, son un vacío, y decirlo de otro modo sería mentir.
 *
 * Si el corte guarda contra qué versión se midió (`linea_base_id`), `base` tiene que ser ESA versión.
 * Pasarle otra lanza VersionDistinta: una corrección posterior del punto de partida no puede alterar
 * una comparación ya hecha. `versiones` sirve solo para nombrar la versión correcta en el mensaje.
 */
export function comparar(base: Medicion | null, corte: Medicion | null, versiones?: readonly Medicion[]): Movimiento[] {
  if (!base || !corte) return [];
  if (corte.linea_base_id && base.id !== corte.linea_base_id) {
    const correcta = versiones?.find((m) => m.id === corte.linea_base_id);
    throw new VersionDistinta(correcta?.version ?? null, base.version ?? null);
  }
  const salida: Movimiento[] = [];
  const provisionalesBase = new Set(provisionalesDe(base));
  const provisionalesCorte = new Set(provisionalesDe(corte));

  for (const vital of VITALES) {
    const antes = base.valores[vital.clave] ?? null;
    const despues = corte.valores[vital.clave] ?? null;
    if (antes == null && despues == null) continue;
    // Lo que se congeló como provisional (leído de un documento y sin revisar) sigue siéndolo en la comparación.
    const provAntes = antes != null && provisionalesBase.has(vital.clave);
    const provDespues = despues != null && provisionalesCorte.has(vital.clave);
    const provisional = provAntes || provDespues;

    const delta = antes != null && despues != null ? despues - antes : null;
    // De cero no sale un porcentaje: mostrar "infinito %" sería ruido, no información.
    const deltaPct = delta != null && antes != null && antes !== 0 ? (delta / Math.abs(antes)) * 100 : null;

    // Lo provisional nunca es conclusión: el movimiento se muestra, pero no se dice que mejoró ni que empeoró.
    let mejoro: boolean | null = null;
    if (delta != null && delta !== 0 && vital.mejorSi !== "neutro" && !provisional) mejoro = vital.mejorSi === "sube" ? delta > 0 : delta < 0;

    let frase: string;
    if (antes == null) frase = `Antes no lo sabíamos. Hoy: ${comoTexto(vital, despues!)}.`;
    else if (despues == null) frase = `Estaba en ${comoTexto(vital, antes)} y esta vez no se midió.`;
    else if (delta === 0) frase = `Sigue igual: ${comoTexto(vital, antes)}.`;
    else {
      const direccion = delta! > 0 ? "subió" : "bajó";
      const cuanto = vital.unidad === "de_cada_10" ? `${Math.abs(delta!).toFixed(0)}` : soles(Math.abs(delta!));
      frase = `${direccion} de ${comoTexto(vital, antes)} a ${comoTexto(vital, despues)} (${direccion === "subió" ? "+" : "−"}${cuanto}${deltaPct != null ? `, ${Math.abs(deltaPct).toFixed(0)}%` : ""}).`;
      frase = frase.charAt(0).toUpperCase() + frase.slice(1);
    }
    if (provisional) {
      const cual = provAntes && provDespues ? "los dos números salen de documentos" : provAntes ? "el número del punto de partida sale de un documento" : "el número de este corte sale de un documento";
      frase += ` Provisional: ${cual} que falta revisar.`;
    }

    salida.push({ vital, antes, despues, delta, deltaPct, mejoro, provisional, frase });
  }

  // Lo que se movió primero, y dentro de eso lo que empeoró antes que lo que mejoró: el dueño tiene
  // que ver lo que necesita atención sin buscarlo.
  return salida.sort((a, b) => {
    const peso = (m: Movimiento) => (m.mejoro === false ? 0 : m.mejoro === true ? 1 : 2);
    return peso(a) - peso(b) || Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0);
  });
}

export type Veredicto = {
  mejoraron: number;
  empeoraron: number;
  sinCambio: number;
  /** Cuánto más (o menos) dinero deja el negocio al mes que en la línea base. */
  gananciaDelta: number | null;
  /** El titular, en una frase. Sin adornos y sin prometer causalidad que no podemos probar. */
  titular: string;
  dias: number | null;
  /** Los números que se movieron con algún dato provisional (nombre para el dueño). No cuentan como mejora ni como caída. */
  provisionales: string[];
};

/** El resumen de un corte contra la línea base. Es lo primero que ve el dueño. */
export function veredicto(base: Medicion | null, corte: Medicion | null, movimientos: Movimiento[]): Veredicto {
  const mejoraron = movimientos.filter((m) => m.mejoro === true).length;
  const empeoraron = movimientos.filter((m) => m.mejoro === false).length;
  const sinCambio = movimientos.filter((m) => m.delta === 0).length;

  const g = movimientos.find((m) => m.vital.clave === "ganancia_mes");
  const gananciaDelta = g?.delta ?? null;

  const dias = base && corte ? Math.round((new Date(corte.fecha).getTime() - new Date(base.fecha).getTime()) / 86_400_000) : null;

  // Un número que solo está en una de las dos mediciones no se movió ni se quedó igual: no hay dato. Si
  // ninguno está en las dos, no hay nada en común, y «el negocio está parejo» sería convertir la falta de dato en un empate.
  const enComun = movimientos.filter((m) => m.delta != null).length;

  // LO PROVISIONAL NUNCA ES CONCLUSIÓN. Un número que se movió con algún dato leído de un documento sin revisar
  // no cuenta como mejora ni como caída (`comparar` ya lo deja sin juzgar), y el titular no lo da por firme.
  const provisionales = movimientos.filter((m) => m.provisional && m.delta != null && m.delta !== 0).map((m) => m.vital.nombre);
  const aparte =
    provisionales.length > 0
      ? ` Aparte, ${provisionales.length === 1 ? "1 número se movió" : `${provisionales.length} números se movieron`} con datos que falta revisar: no ${provisionales.length === 1 ? "cuenta" : "cuentan"} todavía.`
      : "";

  let titular: string;
  if (!base || !corte) titular = "Todavía no hay con qué comparar.";
  else if (enComun === 0) titular = "No se midió ningún número en común: no se puede decir si mejoró o no.";
  else if (gananciaDelta != null && gananciaDelta !== 0 && g?.provisional)
    titular = `Con números que falta revisar, el negocio dejaría ${soles(Math.abs(gananciaDelta))} ${gananciaDelta > 0 ? "más" : "menos"} al mes que cuando empezamos. Es provisional: todavía no es un resultado.`;
  else if (gananciaDelta != null && gananciaDelta > 0)
    titular = `El negocio deja ${soles(gananciaDelta)} más al mes que cuando empezamos.`;
  else if (gananciaDelta != null && gananciaDelta < 0)
    titular = `El negocio deja ${soles(Math.abs(gananciaDelta))} menos al mes que cuando empezamos.`;
  else if (mejoraron > empeoraron) titular = `Mejoraron ${mejoraron} de ${movimientos.length} números.${aparte}`;
  else if (empeoraron > mejoraron) titular = `Empeoraron ${empeoraron} de ${movimientos.length} números.${aparte}`;
  else if (provisionales.length > 0) titular = "Lo que se movió sale de documentos que falta revisar: todavía no se puede decir si el negocio mejoró.";
  else titular = "El negocio está parejo respecto al punto de partida.";

  return { mejoraron, empeoraron, sinCambio, gananciaDelta, titular, dias, provisionales };
}

/** Nombre corto de una medición para mostrarla. */
export function nombreMedicion(m: Medicion): string {
  return m.tipo === "linea_base" ? "Punto de partida" : `Corte ${m.numero}`;
}

/** Nombre con la versión: «Punto de partida · versión 2». Un corte no tiene versión, tiene número. */
export function nombreVersion(m: Medicion): string {
  return m.tipo === "linea_base" ? `Punto de partida · versión ${m.version ?? 1}` : `Corte ${m.numero}`;
}

/** El período que cubre una medición, en una frase, o que no quedó registrado. */
export function textoPeriodo(m: Pick<Medicion, "periodo_desde" | "periodo_hasta">): string {
  if (!m.periodo_desde || !m.periodo_hasta) return "período sin registrar";
  return `del ${fechaDia(m.periodo_desde)} al ${fechaDia(m.periodo_hasta)}`;
}

// ---------------------------------------------------------------------------------------------
// PERÍODOS EQUIVALENTES
// ---------------------------------------------------------------------------------------------

export type Equivalencia = {
  veredicto: "equivalentes" | "no_equivalentes" | "sin_periodo";
  /** Atajo: veredicto === "equivalentes". */
  equivalentes: boolean;
  diasA: number | null;
  diasB: number | null;
  motivo: string;
  /** Lo que no impide comparar pero hay que decir: temporadas distintas, cambios de condiciones. */
  avisos: string[];
  /**
   * Las dos temporadas cuando AMBAS están registradas y no son la misma (a = la primera medición, b = la
   * segunda). null si coinciden o si falta alguna: de una temporada sin registrar no se deduce nada.
   * Va como dato y no solo como aviso porque rebaja la atribución: ver `atribucion`.
   */
  temporadas: { a: string; b: string } | null;
  /**
   * Por qué no hay «antes y después» aunque los dos períodos duren lo mismo: son el mismo período, o el de
   * la segunda medición no es posterior al de la primera. null si el orden vale o si falta algún período.
   * Cuando no es null el veredicto es «no_equivalentes»: la comparación no es un resultado.
   */
  orden: OrdenDePeriodos;
};

export type OrdenDePeriodos = "mismo_periodo" | "no_posterior" | null;
type ConPeriodo = Pick<Medicion, "periodo_desde" | "periodo_hasta">;

/**
 * ¿El período de `b` viene DESPUÉS del de `a`? Durar lo mismo no basta: un corte con el mismo período que
 * el punto de partida (pasa con dos toques a «son del mes pasado» en el mismo mes) dura igual y no mide
 * ningún después. «mismo_periodo»: mismas fechas. «no_posterior»: `b` empieza el mismo día que `a` o antes.
 * null: `b` empieza después, o falta algún período (de lo que falta no se deduce nada).
 */
export function ordenDePeriodos(a: ConPeriodo, b: ConPeriodo): OrdenDePeriodos {
  if (diasDePeriodo(a) == null || diasDePeriodo(b) == null) return null;
  const dA = diaNumero(a.periodo_desde)!;
  const dB = diaNumero(b.periodo_desde)!;
  if (dA === dB && diaNumero(a.periodo_hasta) === diaNumero(b.periodo_hasta)) return "mismo_periodo";
  return dB <= dA ? "no_posterior" : null;
}

/** Días que cubre el período de una medición (ambos extremos incluidos), o null si no está registrado o está al revés. */
export function diasDePeriodo(m: Pick<Medicion, "periodo_desde" | "periodo_hasta">): number | null {
  const d = diaNumero(m.periodo_desde);
  const h = diaNumero(m.periodo_hasta);
  if (d == null || h == null || h < d) return null;
  return h - d + 1;
}

/** Tolerancia de longitud entre dos períodos para considerarlos equivalentes: ±10 %. */
export const TOLERANCIA_PERIODO = 0.1;

/** ¿Dos duraciones en días valen como el mismo tiempo? La única vara, para el veredicto y para avisar antes de congelar. */
export function duracionesEquivalentes(diasA: number, diasB: number): boolean {
  const mayor = Math.max(diasA, diasB);
  return mayor > 0 && Math.abs(diasA - diasB) / mayor <= TOLERANCIA_PERIODO;
}

/**
 * ¿Se pueden comparar estas dos mediciones? Un corte de 90 días contra un punto de partida de 30 no
 * dice «triplicó las ventas», dice que midió tres veces más tiempo. Misma longitud en días (±10 %) y,
 * aparte, los avisos: temporadas distintas según `condiciones.temporada` y cambios registrados.
 * Sin períodos no hay veredicto: la falta de dato no se convierte en «sí, comparables».
 *
 * Y ADEMÁS TIENE QUE HABER UN ANTES Y UN DESPUÉS (`a` es la primera medición, `b` la segunda). Hasta el
 * 13-10-2026 solo se miraba la duración: un corte con el MISMO período que el punto de partida, o con uno
 * anterior, salía «equivalentes» y se leía como resultado. Ahora es «no_equivalentes» con su motivo y `orden`.
 */
export function periodosEquivalentes(a: Medicion, b: Medicion): Equivalencia {
  const diasA = diasDePeriodo(a);
  const diasB = diasDePeriodo(b);
  const avisos: string[] = [];

  const tA = a.condiciones?.temporada?.trim();
  const tB = b.condiciones?.temporada?.trim();
  const temporadas = tA && tB && tA.toLowerCase() !== tB.toLowerCase() ? { a: tA, b: tB } : null;
  if (temporadas) avisos.push(`Cruzan temporadas distintas: «${tA}» frente a «${tB}». La diferencia puede ser de calendario, no de gestión.`);

  const cambios = [...(a.condiciones?.cambios ?? []), ...(b.condiciones?.cambios ?? [])];
  const vistos = new Set<string>();
  for (const c of cambios) {
    const k = `${c.que_cambio}|${c.desde}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    avisos.push(`Cambió «${c.que_cambio}» desde el ${fechaDia(c.desde)}: ${c.efecto_esperado}`);
  }

  if (diasA == null || diasB == null) {
    const quien = diasA == null && diasB == null ? "ninguna de las dos mediciones" : diasA == null ? nombreVersion(a) : nombreVersion(b);
    return { veredicto: "sin_periodo", equivalentes: false, diasA, diasB, motivo: `No se puede saber si los períodos son equivalentes: ${quien} no tiene período registrado.`, avisos, temporadas, orden: null };
  }
  const orden = ordenDePeriodos(a, b);
  if (orden === "mismo_periodo") {
    return { veredicto: "no_equivalentes", equivalentes: false, diasA, diasB, motivo: `Son el mismo período (${textoPeriodo(a)}): no hay antes y después. La comparación no es un resultado.`, avisos, temporadas, orden };
  }
  if (orden === "no_posterior") {
    return {
      veredicto: "no_equivalentes", equivalentes: false, diasA, diasB,
      motivo: `El período de ${nombreVersion(b)} (${textoPeriodo(b)}) no es posterior al de ${nombreVersion(a)} (${textoPeriodo(a)}): no hay antes y después. La comparación no es un resultado.`,
      avisos, temporadas, orden,
    };
  }
  if (!duracionesEquivalentes(diasA, diasB)) {
    return { veredicto: "no_equivalentes", equivalentes: false, diasA, diasB, motivo: `Períodos no equivalentes: ${diasA} días frente a ${diasB}. La comparación directa no vale.`, avisos, temporadas, orden: null };
  }
  // `b` empieza después de que empiece `a`, pero antes de que `a` termine: hay días que están en las dos fotos.
  const finA = diaNumero(a.periodo_hasta)!;
  if (diaNumero(b.periodo_desde)! <= finA) {
    avisos.push(`Los dos períodos se pisan: hay días que están en las dos mediciones (${textoPeriodo(a)} y ${textoPeriodo(b)}). Parte de lo que se cuenta como «después» ya estaba en el «antes».`);
  }
  return { veredicto: "equivalentes", equivalentes: true, diasA, diasB, motivo: `Períodos equivalentes: ${diasA} y ${diasB} días.`, avisos, temporadas, orden: null };
}

// ---------------------------------------------------------------------------------------------
// CONDICIONES
// ---------------------------------------------------------------------------------------------

/**
 * Añade un cambio de condiciones a una medición SIN pisar los anteriores. Es pura: devuelve las
 * condiciones nuevas; quien las guarde actualiza solo la columna `condiciones`, nunca valores ni derivados.
 * Un cambio sin qué, sin desde o sin efecto esperado no es un registro: es una nota suelta, y se rechaza.
 */
export function registrarCondicion(
  medicion: Pick<Medicion, "condiciones">,
  cambio: { que_cambio: string; desde: string; efecto_esperado: string; afecta?: string[]; registrado_por?: string | null },
  ahora: Date = new Date()
): Condiciones {
  const que = cambio.que_cambio?.trim() ?? "";
  const efecto = cambio.efecto_esperado?.trim() ?? "";
  if (que.length < 3) throw new Error("Di qué cambió (al menos tres letras): «local nuevo», «subió el precio», «campaña escolar».");
  if (diaNumero(cambio.desde) == null) throw new Error("Falta desde cuándo rige el cambio, como fecha (AAAA-MM-DD).");
  if (efecto.length < 3) throw new Error("Di qué efecto esperas del cambio sobre los números: así después se sabe si fue eso o fue el trabajo.");
  const previas = medicion.condiciones ?? {};
  const afecta = (cambio.afecta ?? []).map((s) => s.trim()).filter(Boolean);
  const nuevo: CambioCondicion = {
    que_cambio: que,
    desde: cambio.desde.slice(0, 10),
    efecto_esperado: efecto,
    ...(afecta.length ? { afecta } : {}),
    registrado_at: ahora.toISOString(),
    registrado_por: cambio.registrado_por ?? null,
  };
  return { ...previas, cambios: [...(previas.cambios ?? []), nuevo] };
}

// ---------------------------------------------------------------------------------------------
// OBSERVADO FRENTE A ATRIBUIBLE
// ---------------------------------------------------------------------------------------------

/** Una acción del plan ligada (o no) a un número: lo mínimo para decidir si un resultado se le puede atribuir. */
export type AccionLigada = {
  id: string;
  accion: string;
  estado: string;
  /** Clave del vital o indicador al que apunta (vía indicadores.clave). null = no está ligada a ningún número. */
  clave: string | null;
  /** Cuándo se verificó (fecha o instante ISO). Sin fecha no se puede decir que fue antes del corte. */
  fecha_verificacion?: string | null;
};

export type Atribuible = "si" | "parcial" | "no";

export type Atribucion = {
  clave: string;
  nombre: string;
  /** Lo que se vio, en palabras del dueño. Es un hecho; lo de abajo es el juicio. */
  observado: string;
  delta: number | null;
  mejoro: boolean | null;
  /** true si el movimiento se apoya en algún dato provisional: se muestra, no se juzga y no se atribuye. */
  provisional: boolean;
  atribuible: Atribuible;
  motivo: string;
  acciones_verificadas: string[];
};

const ESTADOS_REPORTADO = new Set(["reportado", "hecho"]);

/** Un día ISO (el «desde» de un cambio de condiciones) reducido a su número de día. */
function diaDe(iso: string | null | undefined): number | null {
  return diaNumero(iso ?? null);
}

/**
 * EL DÍA EN QUE SE VERIFICÓ UNA ACCIÓN, EN EL CALENDARIO DE LA EMPRESA (AAAA-MM-DD). La verificación se guarda
 * como instante, en UTC, y el período medido termina en un DÍA local. Cortar el instante por sus diez primeras
 * letras daba el día de UTC: una acción verificada el 31 de agosto a las 8 de la noche en Lima (1 de setiembre,
 * 01:00 UTC) caía «después del período» y no se atribuía. Un día suelto ya es un día: se deja como está. Lo que
 * no es fecha devuelve null (sin fecha no se puede decir que fue antes de nada).
 */
export function diaDeVerificacion(iso: string | null | undefined, zona: string = "America/Lima"): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const instante = new Date(iso);
  // Un texto que empieza por un día pero que `Date` no sabe leer: se toma ese día, que es lo que había antes.
  if (Number.isNaN(instante.getTime())) return ES_DIA.test(iso) ? iso.slice(0, 10) : null;
  try {
    return diaEnZona(instante, zona);
  } catch {
    // Una zona que el servidor no conoce no puede tumbar la lectura: se cae a la de la casa.
    return diaEnZona(instante);
  }
}

/**
 * HASTA CUÁNDO CUENTA ALGO PARA EXPLICAR UN CORTE: el último día del período MEDIDO. El corte se puede
 * congelar semanas después de que termine el mes que mide; una acción verificada en ese hueco no explica
 * los números de ese mes. Hasta el 13-10-2026 se comparaba con `fecha` (el día de congelar). Sin período
 * registrado se cae a esa fecha, que es lo único que hay (y entonces nada se atribuye de todos modos).
 */
function limiteDeCorte(corte: Pick<Medicion, "fecha" | "periodo_desde" | "periodo_hasta">): { dia: number | null; porPeriodo: boolean } {
  const fin = diasDePeriodo(corte) != null ? diaNumero(corte.periodo_hasta) : null;
  return fin != null ? { dia: fin, porPeriodo: true } : { dia: diaNumero(corte.fecha), porPeriodo: false };
}

/** Los cambios de condiciones registrados que tocan a un número y regían ya al terminar lo medido. */
function cambiosQueExplican(condiciones: Condiciones | null | undefined, clave: string, diaCorte: number | null): CambioCondicion[] {
  return (condiciones?.cambios ?? []).filter((c) => {
    const d = diaDe(c.desde);
    const aTiempo = d == null || diaCorte == null || d <= diaCorte;
    const leToca = !c.afecta?.length || c.afecta.includes(clave);
    return aTiempo && leToca;
  });
}

/**
 * Observado no es atribuible. Un número se movió (observado); que se haya movido POR lo que hizo la
 * consultoría solo se puede decir si (1) hay una acción VERIFICADA —no reportada, no «hecha»— ligada a
 * ese número y verificada antes de que termine el período medido (`limiteDeCorte`), y (2) ninguna condición
 * registrada (temporada, local nuevo, precio) lo explica. Un número provisional tampoco se atribuye: lo
 * que sale de un documento sin revisar se observa, no se concluye. Con acción verificada y condición que lo explica, es «parcial». En todos los demás
 * casos es «observado, no atribuible», con el motivo escrito. Sin dato, no hay resultado de ningún signo.
 *
 * `equivalencia` es el veredicto de períodos de ESTA comparación. Si dice «no equivalentes», ninguna
 * diferencia se adjudica a nada, ni con acción verificada: puede ser de calendario, y una pantalla que
 * dice arriba «no comparable» no puede decir abajo «se debe al trabajo». Lo mismo si dice «sin período»:
 * no saber qué tiempo cubre cada medición no es saber que cubren el mismo, y la falta de dato no se
 * convierte en «sí». Y si las dos temporadas están registradas y son distintas («normal» frente a «campaña
 * navideña»), el calendario es otra explicación posible: como máximo «parcial», nunca «si».
 *
 * `zona` es la zona horaria de la empresa: el día de cada verificación se toma en SU calendario
 * (`diaDeVerificacion`), porque el período medido termina en un día de allí, no en uno de UTC.
 */
export function atribucion(p: {
  corte: Medicion;
  movimientos: Movimiento[];
  acciones: readonly AccionLigada[];
  condiciones?: Condiciones | null;
  equivalencia?: (Pick<Equivalencia, "veredicto" | "diasA" | "diasB"> & Partial<Pick<Equivalencia, "temporadas" | "orden">>) | null;
  zona?: string;
}): Atribucion[] {
  const diaVerificada = (a: AccionLigada) => diaDeVerificacion(a.fecha_verificacion, p.zona);
  const { dia: diaCorte, porPeriodo } = limiteDeCorte(p.corte);
  const finPeriodo = porPeriodo ? fechaDia(p.corte.periodo_hasta) : null;
  const antesDe = porPeriodo ? "antes de que terminara el período medido" : "antes del corte";
  const salida: Atribucion[] = [];
  const temporadas = p.equivalencia?.temporadas ?? null;

  for (const m of p.movimientos) {
    const clave = m.vital.clave;
    const nombre = m.vital.nombre;
    const comun = { clave, nombre, observado: m.frase, delta: m.delta, mejoro: m.mejoro, provisional: m.provisional === true };
    const ligadas = p.acciones.filter((a) => a.clave === clave);
    const verificadas = ligadas.filter((a) => a.estado === "verificado" && (() => { const d = diaNumero(diaVerificada(a)); return d != null && diaCorte != null && d <= diaCorte; })());
    const verificadasTarde = ligadas.filter((a) => a.estado === "verificado" && !verificadas.includes(a));
    const reportadas = ligadas.filter((a) => ESTADOS_REPORTADO.has(a.estado));
    const explican = cambiosQueExplican(p.condiciones, clave, diaCorte);
    const nombres = verificadas.map((a) => a.accion);

    if (m.delta == null) {
      const falta = m.antes == null ? "no se midió en el punto de partida" : "no se midió en este corte";
      salida.push({ ...comun, atribuible: "no", motivo: `Sin dato para comparar: ${falta}. Sin dato no hay resultado, ni bueno ni malo.`, acciones_verificadas: nombres });
      continue;
    }
    if (m.delta === 0) {
      salida.push({ ...comun, atribuible: "no", motivo: "No hubo cambio: no hay nada que atribuir.", acciones_verificadas: nombres });
      continue;
    }
    if (p.equivalencia?.veredicto === "no_equivalentes" && p.equivalencia.orden) {
      const porque = p.equivalencia.orden === "mismo_periodo" ? "el corte y el punto de partida son del mismo período" : "el período del corte no es posterior al del punto de partida";
      salida.push({ ...comun, atribuible: "no", motivo: `Observado, no atribuible: ${porque}. No hay antes y después, así que la diferencia no se adjudica a ninguna acción.`, acciones_verificadas: nombres });
      continue;
    }
    if (p.equivalencia?.veredicto === "no_equivalentes") {
      salida.push({
        ...comun,
        atribuible: "no",
        motivo: `Observado, no atribuible: el corte y el punto de partida no miden el mismo tiempo (${p.equivalencia.diasB} días frente a ${p.equivalencia.diasA}). La diferencia puede ser de calendario, así que no se adjudica a ninguna acción.`,
        acciones_verificadas: nombres,
      });
      continue;
    }
    if (p.equivalencia?.veredicto === "sin_periodo") {
      const hay = verificadas[0] ? ` Hay una acción verificada («${verificadas[0].accion}»), pero sin ese dato el cambio no se le adjudica.` : "";
      salida.push({
        ...comun,
        atribuible: "no",
        motivo: `Observado, no atribuible: falta registrar qué fechas cubre cada medición, así que no se sabe si el corte y el punto de partida miden el mismo tiempo.${hay}`,
        acciones_verificadas: nombres,
      });
      continue;
    }
    if (m.provisional) {
      const hay = verificadas[0] ? ` Hay una acción verificada («${verificadas[0].accion}»), pero mientras el dato sea provisional el cambio no se le adjudica.` : "";
      salida.push({
        ...comun,
        atribuible: "no",
        motivo: `Observado, no atribuible todavía: el número sale de un documento que falta revisar, y lo provisional no es un resultado.${hay}`,
        acciones_verificadas: nombres,
      });
      continue;
    }
    if (verificadas.length === 0) {
      const partes = [`Observado, no atribuible: ninguna acción verificada ligada a «${nombre}» ${antesDe}`];
      if (reportadas.length) partes.push(`hay ${reportadas.length} acción(es) reportada(s) sin verificar, y reportado no es verificado`);
      if (verificadasTarde.length)
        partes.push(
          porPeriodo
            ? `hay ${verificadasTarde.length} acción(es) verificada(s) después del período medido (terminó el ${finPeriodo}) o sin fecha de verificación: lo que se verificó después no explica los números de ese período`
            : `hay ${verificadasTarde.length} acción(es) verificada(s) después del corte o sin fecha de verificación`
        );
      if (explican.length) partes.push(`además cambió «${explican[0]!.que_cambio}» desde el ${fechaDia(explican[0]!.desde)}`);
      if (temporadas) partes.push(`además el punto de partida es de temporada «${temporadas.a}» y el corte de «${temporadas.b}»`);
      salida.push({ ...comun, atribuible: "no", motivo: `${partes.join("; ")}.`, acciones_verificadas: nombres });
      continue;
    }
    const primera = verificadas[0]!;
    const cuando = primera.fecha_verificacion ? ` el ${fechaDia(diaVerificada(primera))}` : "";
    if (explican.length || temporadas) {
      const c = explican[0];
      const otras: string[] = [];
      if (c) otras.push(`también cambió «${c.que_cambio}» desde el ${fechaDia(c.desde)} (${c.efecto_esperado})`);
      if (temporadas) otras.push(`${c ? "y además " : ""}el punto de partida es de temporada «${temporadas.a}» y el corte de «${temporadas.b}», así que parte de la diferencia puede ser de calendario`);
      salida.push({
        ...comun,
        atribuible: "parcial",
        motivo: `Hay acción verificada («${primera.accion}»${cuando}) pero ${otras.join(" ")}: el resultado no se puede atribuir por completo a la consultoría.`,
        acciones_verificadas: nombres,
      });
      continue;
    }
    salida.push({
      ...comun,
      atribuible: "si",
      motivo: `Acción verificada «${primera.accion}»${cuando}, ${antesDe}, y ninguna condición registrada explica el cambio.`,
      acciones_verificadas: nombres,
    });
  }
  return salida;
}

/** Cuántos números quedaron en cada caso, para el titular honesto. */
export function resumenAtribucion(atribs: readonly Atribucion[]): { si: number; parcial: number; no: number; conDato: number } {
  return {
    si: atribs.filter((a) => a.atribuible === "si").length,
    parcial: atribs.filter((a) => a.atribuible === "parcial").length,
    no: atribs.filter((a) => a.atribuible === "no").length,
    conDato: atribs.filter((a) => a.delta != null).length,
  };
}

/**
 * Resuelve a qué número apunta cada acción: por `indicador_id` → indicadores.clave. Una acción con
 * «kpi» en texto libre no se liga a nada: el texto no es una clave y adivinarlo sería inventar.
 */
export function ligarAcciones(
  acciones: readonly { id: string; accion: string; estado: string; indicador_id?: string | null; fecha_verificacion?: string | null }[],
  indicadores: readonly { id: string; clave: string }[]
): AccionLigada[] {
  const clavePor = new Map(indicadores.map((i) => [i.id, i.clave]));
  return acciones.map((a) => ({ id: a.id, accion: a.accion, estado: a.estado, clave: a.indicador_id ? (clavePor.get(a.indicador_id) ?? null) : null, fecha_verificacion: a.fecha_verificacion ?? null }));
}

/**
 * La cuenta que cuadra: de los números QUE SE MOVIERON, cuántos se atribuyen, cuántos en parte y cuántos
 * solo se observaron; aparte los que siguen igual y los que no tienen dato. `resumenAtribucion.no` mezcla
 * los tres últimos, y una frase «de 2 números, 1 se debe al trabajo y 2 solo se observaron» no suma.
 */
export function cuentaAtribucion(atribs: readonly Atribucion[]): { movidos: number; si: number; parcial: number; observados: number; sinCambio: number; sinDato: number } {
  const movidos = atribs.filter((a) => a.delta != null && a.delta !== 0);
  return {
    movidos: movidos.length,
    si: movidos.filter((a) => a.atribuible === "si").length,
    parcial: movidos.filter((a) => a.atribuible === "parcial").length,
    observados: movidos.filter((a) => a.atribuible === "no").length,
    sinCambio: atribs.filter((a) => a.delta === 0).length,
    sinDato: atribs.filter((a) => a.delta == null).length,
  };
}

/** Las condiciones de la base y del corte, juntas: un cambio registrado en cualquiera de las dos afecta a la comparación. */
export function condicionesDe(base: Medicion | null, corte: Medicion | null): Condiciones {
  return { temporada: corte?.condiciones?.temporada ?? null, cambios: [...(base?.condiciones?.cambios ?? []), ...(corte?.condiciones?.cambios ?? [])] };
}

// ---------------------------------------------------------------------------------------------
// LA LECTURA DE UN CORTE PARA EL DUEÑO: UNA SOLA, PARA «TUS NÚMEROS» Y PARA «TUS RESULTADOS»
// ---------------------------------------------------------------------------------------------

export type TonoAtribucion = "atribuible" | "parcial" | "neutro";

/** Cómo se le dice al dueño cada atribución. El color lo pone la pantalla; la frase es una sola. */
export function etiquetaAtribucion(a: Pick<Atribucion, "delta" | "atribuible">): { etiqueta: string; tono: TonoAtribucion } {
  if (a.delta == null) return { etiqueta: "Sin dato para comparar", tono: "neutro" };
  if (a.delta === 0) return { etiqueta: "Sin cambio", tono: "neutro" };
  if (a.atribuible === "si") return { etiqueta: "Se debe al trabajo que hicimos", tono: "atribuible" };
  if (a.atribuible === "parcial") return { etiqueta: "En parte por el trabajo, en parte por otra cosa", tono: "parcial" };
  return { etiqueta: "Lo vimos, pero no podemos decir que fue por el trabajo", tono: "neutro" };
}

export type LecturaCorte = {
  /** La versión exacta del punto de partida contra la que se midió este corte. null = no hay contra qué. */
  base: Medicion | null;
  /** true cuando el corte guardó contra qué versión se midió. */
  registrada: boolean;
  /** Lo que hay que decir cuando el corte se compara pero no guardó su versión. */
  avisoVersion: string | null;
  /** Por qué este corte no se puede comparar en absoluto (sin punto de partida al medir, otra versión). null = se compara. */
  noComparable: string | null;
  movimientos: Movimiento[];
  veredicto: Veredicto;
  equivalencia: Equivalencia | null;
  /**
   * Lo primero que se lee. Si los períodos no son equivalentes, si falta el período de alguna de las dos
   * mediciones o si no hay contra qué comparar, lo dice AQUÍ y dice por qué: la reserva no va en letra chica.
   */
  titular: string;
  /** El veredicto de períodos en su idioma, con los avisos de temporada y de cambios registrados. */
  periodos: { veredicto: Equivalencia["veredicto"]; texto: string } | null;
  atribuciones: Atribucion[];
  cuenta: ReturnType<typeof cuentaAtribucion>;
  /** Qué parte de lo que se movió se puede atribuir al trabajo, en una o dos frases. null = nada se movió o no hay comparación. */
  lecturaAtribucion: string | null;
  /**
   * true SOLO cuando los períodos están registrados y son equivalentes. false en todo lo demás (no comparable,
   * períodos no equivalentes o sin registrar): lo de abajo no es un resultado y la pantalla no pinta
   * «mejoraron / empeoraron». Que falte el período no es que los períodos coincidan.
   */
  esResultado: boolean;
};

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * TODO LO QUE SE DICE DE UN CORTE, CALCULADO EN UN SOLO SITIO. Hasta el 13-10-2026 «Tus números» mostraba
 * «El negocio deja S/X más al mes…» con los mismos datos con los que «Tus resultados» avisaba de que los
 * períodos no eran comparables y de que nada era atribuible, y el panel del consultor titulaba «2 mejoraron»
 * mientras el dueño leía «no se puede comparar». Tres pantallas con la misma medición no pueden decir tres
 * cosas: las tres llaman a esta función. `para` solo cambia la voz (titular y avisos de versión): «tu punto
 * de partida» para el dueño, «el punto de partida» para el consultor. La decisión es la misma.
 *
 * Cuatro reglas: el corte se compara SOLO con su versión del punto de partida (`lineaBaseDe`); si los
 * períodos no son equivalentes el titular lo dice con los días de cada uno y nada se atribuye; si falta el
 * período de alguna de las dos mediciones tampoco es un resultado —el titular dice qué falta y nada se
 * atribuye, porque no saber si miden el mismo tiempo no es saber que sí—; y la única frase causal («se puede
 * atribuir al trabajo») sale cuando `atribucion` dio «si», es decir, con períodos equivalentes, acción
 * verificada antes del corte y ninguna condición ni temporada registrada que lo explique. Observado nunca es causa.
 */
export function lecturaDeCorte(p: { corte: Medicion; mediciones: readonly Medicion[]; acciones: readonly AccionLigada[]; para?: "dueno" | "consultor"; /** Zona horaria de la empresa: en su calendario se decide si una acción se verificó dentro del período. Sin ella, la de la casa. */ zona?: string }): LecturaCorte {
  const para = p.para ?? "dueno";
  const pp = para === "dueno" ? "tu punto de partida" : "el punto de partida";
  const { base, registrada, motivo: sinVersion } = lineaBaseDe(p.corte, p.mediciones);
  let movimientos: Movimiento[] = [];
  let noComparable: string | null = null;
  try {
    movimientos = comparar(base, p.corte, p.mediciones);
  } catch (e) {
    noComparable = e instanceof Error ? e.message : String(e);
  }
  // Sin base no hay comparación: se dice por qué, y no se pinta un veredicto vacío como si fuera un resultado.
  if (!base && !noComparable) noComparable = textoSinVersion(sinVersion, para) || "Este corte no tiene punto de partida contra el que compararse.";

  const v = veredicto(base, p.corte, movimientos);
  const equivalencia = base && !noComparable ? periodosEquivalentes(base, p.corte) : null;
  const condiciones = condicionesDe(base, p.corte);
  const atribuciones = noComparable ? [] : atribucion({ corte: p.corte, movimientos, acciones: p.acciones, condiciones, equivalencia, zona: p.zona });
  const cuenta = cuentaAtribucion(atribuciones);
  const noEquivalentes = equivalencia?.veredicto === "no_equivalentes";
  const sinPeriodo = equivalencia?.veredicto === "sin_periodo";

  let titular = v.titular;
  if (noComparable) titular = noComparable;
  else if (equivalencia && noEquivalentes && equivalencia.orden === "mismo_periodo")
    titular = `Este corte y ${pp} son del mismo período (${textoPeriodo(p.corte)}): no hay antes y después, así que no se puede decir si el negocio mejoró.`;
  else if (equivalencia && noEquivalentes && equivalencia.orden === "no_posterior" && base)
    titular = `Los números de este corte (${textoPeriodo(p.corte)}) no son posteriores a los de ${pp} (${textoPeriodo(base)}): no hay antes y después, así que no se puede decir si el negocio mejoró.`;
  else if (equivalencia && noEquivalentes)
    titular = `Este corte no se puede comparar tal cual con ${pp}: cubre ${equivalencia.diasB} días y ${pp}, ${equivalencia.diasA}.`;
  else if (equivalencia && sinPeriodo && movimientos.some((m) => m.delta != null)) {
    // «El negocio deja S/X más al mes» es un veredicto, y sin saber qué tiempo cubre cada medición no lo hay.
    // Si no hubo ningún número en común se deja el titular de siempre, que ya dice que no se puede decir nada.
    const sinBase = equivalencia.diasA == null;
    const sinCorte = equivalencia.diasB == null;
    titular =
      para === "dueno"
        ? `Todavía no podemos decirte si el negocio mejoró: falta anotar de qué fechas son los números de ${sinBase && sinCorte ? "tu punto de partida y los de este corte" : sinBase ? "tu punto de partida" : "este corte"}.`
        : `Todavía no se puede decir si el negocio mejoró: falta registrar el período ${sinBase && sinCorte ? "del punto de partida y el de este corte" : sinBase ? "del punto de partida" : "de este corte"}.`;
  }

  let periodos: LecturaCorte["periodos"] = null;
  if (equivalencia) {
    const propio =
      equivalencia.veredicto === "equivalentes"
        ? `Períodos comparables: ${equivalencia.diasA} y ${equivalencia.diasB} días.`
        : equivalencia.veredicto === "no_equivalentes" && equivalencia.orden
          ? "Los números se muestran, pero no son un antes y un después. Para comparar hace falta un corte con fechas posteriores a las del punto de partida."
        : equivalencia.veredicto === "no_equivalentes"
          ? "Los números se muestran, pero la diferencia puede ser de calendario, no de gestión."
          : "No sabemos si los períodos son comparables: faltan las fechas de lo medido. Tómalo como orientación, no como veredicto.";
    periodos = { veredicto: equivalencia.veredicto, texto: [propio, ...equivalencia.avisos].join(" ") };
  }

  let lecturaAtribucion: string | null = null;
  if (!noComparable && noEquivalentes && equivalencia?.orden && cuenta.movidos > 0) {
    lecturaAtribucion = "Mientras el corte no sea de fechas posteriores a las del punto de partida, lo que se movió queda como observado: no se le atribuye al trabajo ni a ninguna otra cosa.";
  } else if (!noComparable && noEquivalentes && cuenta.movidos > 0) {
    lecturaAtribucion = "Mientras el corte y tu punto de partida no midan el mismo tiempo, lo que se movió queda como observado: no se le atribuye al trabajo ni a ninguna otra cosa.";
  } else if (!noComparable && sinPeriodo && cuenta.movidos > 0) {
    lecturaAtribucion = "Mientras no sepamos qué fechas cubre cada medición, lo que se movió queda como observado: no se le atribuye al trabajo ni a ninguna otra cosa.";
  } else if (!noComparable && cuenta.movidos > 0) {
    const partes: string[] = [];
    // El titular habla de dinero cuando lo que te queda se movió: de ESE número se dice primero si es atribuible.
    const g = atribuciones.find((a) => a.clave === "ganancia_mes");
    if (g && g.delta != null && g.delta !== 0) {
      // «En parte a otra cosa» nombra cuál: un cambio registrado en el negocio, la temporada, o las dos.
      const porCambio = cambiosQueExplican(condiciones, "ganancia_mes", limiteDeCorte(p.corte).dia).length > 0;
      const t = equivalencia?.temporadas ?? null;
      const otraCosa = `${porCambio ? " que cambió en el negocio" : ""}${t ? `${porCambio ? "; además," : ":"} la temporada no es la misma («${t.a}» en tu punto de partida, «${t.b}» en este corte)` : ""}`;
      partes.push(
        g.provisional
          ? "Ese cambio en lo que te queda sale de un documento que falta revisar: lo vimos, pero todavía no es un resultado ni se le atribuye a nada."
          : g.atribuible === "si"
          ? "Ese cambio en lo que te queda se puede atribuir al trabajo que hicimos: hay una acción comprobada que apuntaba a ese número y nada más de lo registrado lo explica."
          : g.atribuible === "parcial"
            ? `Ese cambio en lo que te queda se debe en parte al trabajo que hicimos y en parte a otra cosa${otraCosa}.`
            : "Ese cambio en lo que te queda lo vimos en tus números, pero no podemos decir que fue por el trabajo que hicimos."
      );
    }
    partes.push(
      `De ${cuenta.movidos} ${plural(cuenta.movidos, "número que se movió", "números que se movieron")}, ${cuenta.si} se ${plural(cuenta.si, "debe", "deben")} al trabajo que hicimos, ${cuenta.parcial} en parte y ${cuenta.observados} solo se ${plural(cuenta.observados, "observó", "observaron")}.`
    );
    lecturaAtribucion = partes.join(" ");
  }

  return {
    base,
    registrada,
    avisoVersion: base && !registrada && !noComparable ? textoSinVersion(sinVersion, para) || null : null,
    noComparable,
    movimientos,
    veredicto: v,
    equivalencia,
    titular,
    periodos,
    atribuciones,
    cuenta,
    lecturaAtribucion,
    esResultado: !noComparable && equivalencia?.veredicto === "equivalentes",
  };
}

// ---------------------------------------------------------------------------------------------
// EL PERÍODO QUE SE PIDE AL CONGELAR
// ---------------------------------------------------------------------------------------------

/** El día de calendario (YYYY-MM-DD) de un instante en una zona horaria. El servidor no vive en Lima. */
export function diaEnZona(ahora: Date = new Date(), zona: string = "America/Lima"): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora);
  const de = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${de("year")}-${de("month")}-${de("day")}`;
}

/** El mes cerrado anterior a un día (YYYY-MM-DD), de su primer día al último. null si no es una fecha. */
export function mesCerradoAnterior(dia: string | null | undefined): { desde: string; hasta: string } | null {
  const m = dia ? ES_DIA.exec(dia) : null;
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]); // 1 a 12
  if (mes < 1 || mes > 12) return null;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { desde: iso(Date.UTC(anio, mes - 2, 1)), hasta: iso(Date.UTC(anio, mes - 1, 0)) };
}

/**
 * Qué le falta a un período para poder congelar una medición con él, en palabras de quien lo escribe.
 * null = está completo. Sin período una medición no se puede comparar como resultado (ver `lecturaDeCorte`),
 * así que las pantallas lo piden ANTES de congelar: después ya no hay dónde anotarlo sin tocar la medición.
 */
export function faltaEnPeriodo(desde: string | null | undefined, hasta: string | null | undefined, hoy?: string | null): string | null {
  if (!desde || !hasta) return "Faltan las fechas: desde qué día y hasta qué día son estos números.";
  if (diaNumero(desde) == null || diaNumero(hasta) == null) return "Alguna de las dos fechas no es una fecha.";
  if (desde.slice(0, 10) > hasta.slice(0, 10)) return "Las fechas están al revés: la primera es posterior a la segunda.";
  if (hoy && hasta.slice(0, 10) > hoy.slice(0, 10)) return "El período termina en un día que todavía no llega: los números son de días que ya pasaron.";
  return null;
}

/**
 * Lo que «Tus números» le manda a la ruta de medición al congelar: el tipo y el período, entero. null
 * mientras al período le falte algo: sin sus fechas no se congela nada desde esa pantalla.
 */
export function pedidoDeMedicion(
  tipo: "linea_base" | "corte",
  desde: string | null | undefined,
  hasta: string | null | undefined,
  hoy?: string | null
): { tipo: "linea_base" | "corte"; periodo_desde: string; periodo_hasta: string } | null {
  if (!desde || !hasta || faltaEnPeriodo(desde, hasta, hoy)) return null;
  return { tipo, periodo_desde: desde.slice(0, 10), periodo_hasta: hasta.slice(0, 10) };
}

/**
 * EL PERÍODO QUE VIAJA CON UN CORTE REGISTRADO DESDE EL PLAN (el camino de la consultora, /close). Tres casos:
 * sin ninguna fecha → {} (un corte sin números no mide nada: se puede guardar, y la ruta avisa si congeló
 * números sin período); con las dos fechas y en orden → el período entero; a medias, al revés o en el futuro
 * → null, y no se manda nada. Hasta el 13-10-2026 este camino no mandaba período nunca.
 */
export function periodoDeCorte(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  hoy?: string | null
): { periodo_desde: string; periodo_hasta: string } | Record<string, never> | null {
  if (!desde && !hasta) return {};
  if (!desde || !hasta || faltaEnPeriodo(desde, hasta, hoy)) return null;
  return { periodo_desde: desde.slice(0, 10), periodo_hasta: hasta.slice(0, 10) };
}

export { VITAL_POR_CLAVE };
