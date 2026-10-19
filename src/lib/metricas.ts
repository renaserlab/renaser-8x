/**
 * EL VOCABULARIO DE LOS NÚMEROS — la pieza de la que cuelga todo lo demás.
 *
 * Auditoría del 30-08-2026: la Radiografía Mínima exige nueve números, pero nada en el código los
 * verificaba. El extractor inventaba claves libres (`ganancia_mes_western_union`) y el resultado fue
 * que una empresa tenía 18 números y solo 3 de los nueve vitales. Sin claves fijas no se puede cerrar la
 * radiografía, ni armar la serie por meses, ni congelar una línea base, ni comparar un corte.
 *
 * Aquí viven las claves canónicas, sus sinónimos y la cuenta de lo que falta.
 *
 * 13-10-2026 (D5): los derivados ya no inventan un punto de equilibrio. El de la empresa necesita
 * los costos variables del mes (`costo_variable_mes`, clave reconocida pero no vital); sin ellos
 * sale null con motivo, y la cifra del producto estrella se conserva rotulada como hipótesis.
 * Las claves que no son vitales ya no se descartan: se listan como «otros números de la empresa».
 */
import { MESES, nombreDePeriodo } from "./temporadas";
import { numeroEscrito } from "./numero-escrito";
import { margenContribucion, puntoEquilibrio, equilibrioPorProductoEstrella, comparables, type Calculo } from "./finanzas";

export type Vital = {
  clave: string;
  n: number;
  /** Cómo se le nombra al dueño. Nunca en jerga. */
  nombre: string;
  /**
   * La pregunta hablada, con su ancla: el episodio («el mes pasado», «hoy»), una sola cosa, sin cifras de ejemplo ni
   * listas dentro (revisión del 16-10-2026). La ve el dueño sobre su caja en Tus números.
   */
  pregunta: string;
  /**
   * Cuando el número es una PROPORCIÓN, no se pregunta: se piden dos conteos y 8X hace la cuenta. `pregunta` pide
   * cuántos hubo y `seguida`, cuántos de ellos. Preguntar «de cada diez, ¿cuántos…?» sembraba el marco: la respuesta
   * quedaba grabada en esa unidad aunque la persona hubiera dicho otra cosa.
   */
  seguida?: string;
  unidad: "soles" | "dias" | "personas" | "de_cada_10" | "numero";
  /** Si cambia mes a mes, se guarda con periodo YYYY-MM y forma serie. */
  mensual: boolean;
  /**
   * Hacia dónde es mejorar. Sin esto, bajar la deuda se leería como un retroceso y subir el gasto
   * fijo como un avance. "neutro" es para los que dependen del contexto: subir el precio puede ser
   * sanear el margen o espantar clientes, y eso no lo decide una flecha.
   */
  mejorSi: "sube" | "baja" | "neutro";
  /** Claves que la IA suele inventar para esto mismo. */
  sinonimos: string[];
};

export const VITALES: Vital[] = [
  {
    n: 1, clave: "venta_mes", nombre: "Ventas del mes", unidad: "soles", mensual: true, mejorSi: "sube",
    pregunta: "¿Cuánto vendió tu negocio el mes pasado, en total?",
    sinonimos: ["ventas_mes", "facturacion_mes", "ingresos_mes", "venta_mensual", "ventas_totales", "facturacion_mensual", "ingreso_mes", "venta_total_mes"],
  },
  {
    n: 2, clave: "ganancia_mes", nombre: "Lo que te quedó libre", unidad: "soles", mensual: true, mejorSi: "sube",
    pregunta: "De todo eso que vendiste, ¿cuánto te quedó libre después de pagar todo?",
    sinonimos: ["utilidad_mes", "margen_mes", "ganancia_neta_mes", "queda_libre_mes", "utilidad_mensual", "ganancia_mensual", "beneficio_mes"],
  },
  {
    n: 3, clave: "caja_hoy", nombre: "Dinero en caja hoy", unidad: "soles", mensual: false, mejorSi: "sube",
    pregunta: "Si abres la caja hoy y sumas lo que hay en efectivo y en el banco, ¿cuánto es?",
    sinonimos: ["efectivo_hoy", "caja_actual", "dinero_caja", "saldo_caja", "liquidez_hoy", "caja_banco", "efectivo_caja"],
  },
  {
    n: 4, clave: "gasto_fijo_mes", nombre: "Gastos fijos del mes", unidad: "soles", mensual: true, mejorSi: "baja",
    // Sin lista dentro: se queda corta y el dueño solo nombra lo que ve. Quien lo tiene por partes las anota una por
    // una en «Tus gastos del mes», y la suma la hace 8X.
    pregunta: "El mes pasado, sumando todo lo que pagas vendas o no vendas, ¿cuánto pagaste?",
    sinonimos: ["gasto_mes", "costo_fijo_mes", "gastos_fijos", "planilla_mes", "egresos_fijos", "gastos_mensuales", "costos_fijos_mes", "gasto_fijo"],
  },
  {
    n: 5, clave: "precio_producto_estrella", nombre: "Precio de lo que más vendes", unidad: "soles", mensual: false, mejorSi: "neutro",
    pregunta: "Lo que más vendes, ¿a cuánto lo vendiste la última vez?",
    sinonimos: ["precio_estrella", "precio_venta_principal", "precio_producto_principal", "precio_principal", "precio_venta"],
  },
  {
    n: 6, clave: "costo_producto_estrella", nombre: "Lo que te cuesta", unidad: "soles", mensual: false, mejorSi: "baja",
    pregunta: "Y eso mismo, ¿cuánto te cuesta hacerlo o comprarlo?",
    sinonimos: ["costo_estrella", "costo_producto_principal", "costo_unitario", "costo_principal", "costo_compra"],
  },
  {
    n: 7, clave: "conversion_de_cada_10", nombre: "De cada 10 interesados, cuántos compran", unidad: "de_cada_10", mensual: false, mejorSi: "sube",
    // Dos conteos del mismo día, no una proporción: la cuenta la hace 8X (deCadaDiez).
    pregunta: "El último día que abriste, ¿cuántas personas preguntaron por lo que vendes?",
    seguida: "De ellas, ¿cuántas compraron?",
    sinonimos: ["conversion_10", "cierre_de_cada_10", "compran_de_cada_10", "tasa_cierre", "conversion", "clientes_de_cada_10", "cierran_de_cada_10"],
  },
  {
    n: 8, clave: "deuda_clientes", nombre: "Lo que te deben", unidad: "soles", mensual: false, mejorSi: "baja",
    pregunta: "¿Cuánto dinero te deben tus clientes ahora mismo?",
    sinonimos: ["cuentas_por_cobrar", "por_cobrar", "deben_clientes", "cobranza_pendiente", "cxc", "cobrar_clientes"],
  },
  {
    n: 9, clave: "deuda_propia", nombre: "Lo que tú debes", unidad: "soles", mensual: false, mejorSi: "baja",
    pregunta: "Hoy, sumando a todos a quienes les debes, ¿cuánto debes tú?",
    sinonimos: ["deuda_proveedores", "cuentas_por_pagar", "prestamos", "deuda_banco", "por_pagar", "cxp", "deuda_total"],
  },
];

/**
 * CLAVES RECONOCIDAS PERO NO VITALES. Tienen nombre, pregunta y sinónimos como los vitales, pero no
 * cuentan en la radiografía de nueve: son lo que hace falta para un cálculo concreto. Hoy solo una:
 * los costos variables del mes, sin los cuales no hay punto de equilibrio de la empresa.
 */
export const RECONOCIDAS: Vital[] = [
  {
    n: 10, clave: "costo_variable_mes", nombre: "Costos variables del mes", unidad: "soles", mensual: true, mejorSi: "baja",
    pregunta: "De lo que vendiste el mes pasado, ¿cuánto te costó la mercadería o los insumos de eso mismo? Solo lo que sube y baja con la venta.",
    sinonimos: ["costos_variables_mes", "costo_variable", "costos_variables", "costo_variable_total", "costos_variables_totales", "costo_variable_mensual"],
  },
];

/** El mejor mes de la historia no es un vital aparte: es `venta_mes` en el periodo `epoca_dorada`. */
export const PERIODO_DORADA = "epoca_dorada";
export const CLAVES_VITALES = new Set(VITALES.map((v) => v.clave));
export const CLAVES_RECONOCIDAS = new Set(RECONOCIDAS.map((v) => v.clave));
export const VITAL_POR_CLAVE = new Map(VITALES.map((v) => [v.clave, v]));
export const RECONOCIDA_POR_CLAVE = new Map(RECONOCIDAS.map((v) => [v.clave, v]));

/** Las dos cajas de un número que es una proporción: cuántos hubo (`total`) y cuántos de ellos (`parte`). */
export type ParteDeConteo = "total" | "parte";
/** La clave con que va en el formulario cada conteo: `conversion_de_cada_10:total`, `conversion_de_cada_10:parte`. */
export const claveDeConteo = (clave: string, parte: ParteDeConteo) => `${clave}:${parte}`;
/** La clave del número al que pertenece una caja, sea la suya o la de uno de sus conteos. */
const claveBase = (clave: string) => clave.split(":")[0]!;

/**
 * LA CUENTA LA HACE 8X. De los dos conteos (cuántas personas preguntaron, cuántas de ellas compraron) sale el «de
 * cada diez» con un decimal. Sin los dos, con cero personas o con más compras que personas, no hay cuenta: null,
 * nunca un cero.
 */
export function deCadaDiez(total: number | null | undefined, parte: number | null | undefined): number | null {
  if (total == null || parte == null || !Number.isFinite(total) || !Number.isFinite(parte)) return null;
  if (total <= 0 || parte < 0 || parte > total) return null;
  return Math.round((parte / total) * 100) / 10;
}

/** Cómo se mide un vital, dicho como se pregunta: la pregunta y, si es una proporción, la seguida y quién hace la cuenta. */
export function comoSeMide(v: Pick<Vital, "pregunta" | "seguida">): string {
  return v.seguida ? `${v.pregunta} ${v.seguida} La cuenta la hace 8X: los segundos entre los primeros, por diez.` : v.pregunta;
}

const PORSINONIMO = new Map<string, string>();
for (const v of [...VITALES, ...RECONOCIDAS]) {
  PORSINONIMO.set(v.clave, v.clave);
  for (const s of v.sinonimos) PORSINONIMO.set(s, v.clave);
}

/**
 * Lleva la clave que inventó la IA a la canónica. Sin esto, `utilidad_mes` y `ganancia_mes` son dos
 * números distintos para el sistema y ninguno completa la radiografía.
 */
export function normalizarClave(bruta: string): string {
  const limpia = bruta
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return PORSINONIMO.get(limpia) ?? limpia;
}

/** AAAA-MM de verdad: el mes tiene que existir. "2026-13" no es un mes. */
const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

export function normalizarPeriodo(bruto: string | null | undefined): string {
  const p = (bruto ?? "").trim();
  if (ES_MES.test(p)) return p;
  if (p === PERIODO_DORADA) return PERIODO_DORADA;
  return "actual";
}

/**
 * Clave y periodo juntos: `venta_epoca_dorada` guarda en venta_mes con periodo dorado.
 * `vital` marca si la clave es uno de los nueve. Las que no lo son PASAN igual, con la marca en
 * false: antes se perdían (la radiografía las descartaba) y con ellas se perdía lo específico de
 * cada empresa —la merma de una panadería, las citas perdidas de una clínica.
 */
export function normalizarMetrica(clave: string, periodo: string | null | undefined): { clave: string; periodo: string; vital: boolean } {
  const bruta = clave.toLowerCase().trim();
  if (bruta === "venta_epoca_dorada" || bruta === "mejor_mes_venta" || bruta === "venta_mejor_mes")
    return { clave: "venta_mes", periodo: PERIODO_DORADA, vital: true };
  const canonica = normalizarClave(clave);
  return { clave: canonica, periodo: normalizarPeriodo(periodo), vital: CLAVES_VITALES.has(canonica) };
}

/**
 * CÓMO LLEGÓ UN NÚMERO. Es lo que `company_metricas.estado` guarda y lo que decide cuánto vale:
 *  - `contado`: lo dijo el dueño de memoria (Tus números, la entrevista). Vale para conversar y calcular; no es prueba.
 *  - `verificado`: salió de un documento y alguien lo concilió. El único que un «contado» no puede pisar.
 *  - `extraido`: lo leyó el lector de documentos y nadie lo revisó todavía. Nunca se rotula verificado.
 *  - `descartado`: al revisar la extracción se desechó; el valor queda vacío y no entra en ningún cálculo
 *    ni en la radiografía, pero el rastro de que el documento lo traía se conserva. Lo excluye su
 *    ESTADO: si alguna vez quedara con valor, tampoco entra.
 *  - `sin_dato`: el dueño declaró que no lo sabe. Es un hallazgo, no un vacío: cuenta como respondido.
 */
export type EstadoMetrica = "contado" | "verificado" | "extraido" | "descartado" | "sin_dato";

/** Un número tal como está guardado. `estado` es uno de EstadoMetrica; se deja abierto porque llega de la base. */
export type Metrica = {
  clave: string;
  periodo: string;
  valor: number | null;
  estado?: EstadoMetrica | string | null;
  /** declarado / extraido / conciliado / calculado / caja. Quien no lo lee (select sin `origen`) lo deja sin poner. */
  origen?: string | null;
};

/**
 * FINANZAS (19-10-2026): la caja alimenta a «Tus números». Una cifra con origen 'caja' la escribió la base al registrar
 * movimientos, cobros o pagos en Finanzas (supabase/migracion-finanzas.sql): no se escribe a mano aquí, se corrige en
 * Finanzas. En el lado de las contradicciones es lo declarado por el dueño (su propio registro), no un documento.
 */
export const ORIGEN_CAJA = "caja";
export const esDeCaja = (m: { origen?: string | null } | null | undefined): boolean => m?.origen === ORIGEN_CAJA;

/** De qué parte de Finanzas sale cada número que llena la caja, y adónde se va a corregirlo. */
export function deDondeSaleDeCaja(clave: string): { texto: string; href: string } {
  if (clave === "deuda_clientes") return { texto: "de tus cobros", href: "/os/finanzas/cobros" };
  if (clave === "deuda_propia") return { texto: "de tus pagos", href: "/os/finanzas/pagos" };
  return { texto: "de tu caja", href: "/os/finanzas" };
}

/** La marca de lo que sale de la caja, al lado de la cifra: «de tu caja», «de tus cobros», «de tus pagos». */
export const AVISO_SALE_DE_CAJA = "Sale de tu caja: corrígelo en Finanzas.";

/** «clave|periodo» de cada cifra que sale de la caja: lo que el formulario de «Tus números» ya no ofrece escribir. */
export function clavesDeCaja(metricas: Metrica[]): string[] {
  return metricas.filter(esDeCaja).map((m) => `${m.clave}|${m.periodo}`);
}

/**
 * Cómo se le dice al dueño de dónde viene un número. «extraído» es lo que un lector de PDF/CSV sacó
 * de un documento y nadie concilió todavía: NO se rotula «verificado», aunque venga de un papel.
 * «descartado» es lo que la revisión desechó: se dice así, no «sin rotular».
 */
export function etiquetaEstado(estado: string | null | undefined, origen?: string | null): string {
  if (origen === ORIGEN_CAJA) return "de tu caja (Finanzas)";
  switch (estado) {
    case "contado": return "contado de memoria";
    case "verificado": return "verificado";
    case "extraido": return "extraído, pendiente de conciliar";
    case "descartado": return "descartado al revisar la extracción";
    case "sin_dato": return "sin dato";
    case null:
    case undefined:
    case "": return "sin rotular";
    default: return `sin rotular (${estado})`;
  }
}

/** Un número que no es de los nueve, tal como lo guardó la empresa, con su estado en palabras. */
export type OtroNumero = {
  clave: string;
  /** Nombre para el dueño si la clave es reconocida; si no, la clave con espacios. */
  nombre: string;
  periodo: string;
  valor: number | null;
  estado: string | null;
  etiquetaEstado: string;
  /** true si es una clave reconocida (p. ej. costo_variable_mes), false si es específica de la empresa. */
  reconocida: boolean;
  /** Solo si sale de la caja (Finanzas): no se escribe a mano. */
  deCaja?: true;
};

export type Radiografia = {
  /** Cuántos de los nueve están respondidos (con número o declarados sin dato). */
  listos: number;
  total: number;
  /** Los que aún nadie preguntó o nadie respondió. */
  faltan: Vital[];
  /** Los que la empresa dijo no saber: eso es un hallazgo, no un vacío. */
  sinDato: Vital[];
  completa: boolean;
  /** Meses distintos con venta registrada: sin al menos tres no hay tendencia posible. */
  mesesConVenta: number;
  hayEpocaDorada: boolean;
  /** Los números que no son de los nueve. No cuentan para cerrar la radiografía, pero no se pierden. */
  otros: OtroNumero[];
  /**
   * Cuáles de las cifras calculadas con estos mismos números son PROVISIONALES (se apoyan en algo leído
   * de un documento y sin revisar). Es `derivados(...).provisional`, tal cual. Viaja con la radiografía
   * porque la tarjeta de «Mi empresa» recibe la radiografía y dos cifras sueltas: así el rótulo llega
   * junto a la cifra sin depender de que cada pantalla que la monte se acuerde de pasarlo.
   */
  cifrasProvisionales: Derivados["provisional"];
};

/**
 * ¿Qué le falta a esta empresa para tener la radiografía cerrada? Es lo que el dueño ve en su
 * pantalla y lo que la consultora ve por cada cliente.
 */
export function radiografia(metricas: Metrica[]): Radiografia {
  const conValor = new Set<string>();
  const declaradoSinDato = new Set<string>();
  const mesesVenta = new Set<string>();
  const otros: OtroNumero[] = [];
  let dorada = false;

  for (const m of metricas) {
    const { clave, periodo, vital } = normalizarMetrica(m.clave, m.periodo);
    if (!vital) {
      // Antes: `continue`. Lo específico de cada empresa se conserva y se muestra aparte.
      const reconocida = RECONOCIDA_POR_CLAVE.get(clave);
      otros.push({
        clave, periodo, valor: m.valor, estado: m.estado ?? null,
        nombre: reconocida?.nombre ?? clave.replace(/_/g, " "),
        etiquetaEstado: etiquetaEstado(m.estado, m.origen),
        reconocida: reconocida != null,
        ...(esDeCaja(m) ? { deCaja: true as const } : {}),
      });
      continue;
    }
    // Un descartado no cuenta aunque conserve un valor: lo excluye su estado.
    if (m.valor != null && m.estado !== "descartado") {
      conValor.add(clave);
      if (clave === "venta_mes" && ES_MES.test(periodo)) mesesVenta.add(periodo);
      if (clave === "venta_mes" && periodo === PERIODO_DORADA) dorada = true;
    } else if (m.estado === "sin_dato") {
      declaradoSinDato.add(clave);
    }
  }

  const faltan = VITALES.filter((v) => !conValor.has(v.clave) && !declaradoSinDato.has(v.clave));
  // Un "no lo sé" que después se respondió con un número ya no es un "no lo sé": si no, el mismo
  // vital se contaba dos veces y la radiografía llegaba a decir 10 de 9.
  const sinDato = VITALES.filter((v) => declaradoSinDato.has(v.clave) && !conValor.has(v.clave));
  return {
    listos: conValor.size + sinDato.length,
    total: VITALES.length,
    faltan,
    sinDato,
    completa: faltan.length === 0,
    mesesConVenta: mesesVenta.size,
    hayEpocaDorada: dorada,
    otros: otros.sort((a, b) => a.clave.localeCompare(b.clave) || b.periodo.localeCompare(a.periodo)),
    cifrasProvisionales: derivados(metricas).provisional,
  };
}

/** El número elegido para un cálculo, con de dónde salió: sin esto no hay fuentes que mostrar. */
type Elegido = { clave: string; periodo: string; valor: number; estado: string | null; origen?: string | null };

export type Derivados = {
  /** Utilidad declarada sobre ventas, en %. NO es margen de contribución: no sirve para el equilibrio. */
  margen: number | null;
  /** (precio − costo) / precio del producto estrella, en %. */
  margenUnitario: number | null;
  /**
   * Punto de equilibrio DE LA EMPRESA: fijos / razón de margen de contribución. Necesita costo_variable_mes
   * (mayor que cero y del mismo mes que las ventas) y gastos fijos mayores que cero, de ese mes o
   * declarados como los de hoy.
   */
  equilibrio: number | null;
  /** Lo que antes se publicaba como «equilibrio»: hipótesis en la que toda la venta fuera el producto estrella. */
  equilibrioProductoEstrella: number | null;
  diasAguante: number | null;
  /** Venta del mes − equilibrio de la empresa. Solo contra el de la empresa: contra la hipótesis sería mezclar. */
  sobreEquilibrio: number | null;
  /** Cada cifra con su fórmula, periodo, fuentes, supuestos y limitaciones, para el detalle desplegable. */
  detalle: {
    margen: Calculo<number>;
    margenUnitario: Calculo<number>;
    equilibrio: Calculo<number>;
    equilibrioProductoEstrella: Calculo<number>;
    diasAguante: Calculo<number>;
  };
  /**
   * Qué cifras se apoyan en algún número «extraído» (leído de un documento y sin conciliar). Lo
   * extraído nunca es verificado, así que esas cifras son PROVISIONALES: la pantalla que las muestre
   * tiene que decirlo junto a la cifra, no solo dentro de «Cómo se calculó». Sin cifra, false.
   */
  provisional: {
    margen: boolean;
    margenUnitario: boolean;
    equilibrio: boolean;
    equilibrioProductoEstrella: boolean;
    diasAguante: boolean;
  };
};

/** La frase que ve el empresario cuando no hay equilibrio de empresa. Sin jerga. */
export const MOTIVO_EQUILIBRIO_SIN_COSTO_VARIABLE =
  "Para saber desde qué venta cubres tus costos necesitamos tus costos variables del mes: lo que te costó la mercadería o los insumos de lo que vendiste.";

/**
 * Un cero en costos variables de un negocio que vende es casi siempre «no lo sé», no un dato. Si
 * entrara en la división daría razón 1 y «equilibrio = fijos», una cifra exacta y falsa. Se trata
 * como sin dato y se dice.
 */
export const LIMITACION_COSTO_VARIABLE_CERO =
  "En costos variables, un cero se trata como sin dato: un negocio que vende casi siempre paga mercadería, insumos o comisiones. Si no lo sabes, márcalo como «no lo sé»; si de verdad es cero, confírmalo con la consultora.";

/**
 * El motivo que acompaña a esa limitación. Son dos frases distintas a propósito: el motivo dice qué
 * pasó y qué hace falta; la limitación, cómo se trata el cero. Iguales, el detalle «Cómo se calculó»
 * repetía el mismo párrafo dos veces.
 */
export const MOTIVO_EQUILIBRIO_COSTO_VARIABLE_CERO =
  "Tus costos variables del mes están anotados en cero. Para saber desde qué venta cubres tus costos necesitamos lo que te costó la mercadería o los insumos de lo que vendiste.";

/**
 * Lo mismo con los gastos fijos: un cero daría «equilibrio S/0» y «estás S/40.000 por encima», una
 * buena noticia exacta y falsa. Se trata como sin dato, igual que en «cuánto aguantas».
 */
export const LIMITACION_GASTO_FIJO_CERO =
  "En gastos fijos, un cero se trata como sin dato: casi ningún negocio funciona sin pagar algo fijo cada mes. Si de verdad no pagas nada fijo, confírmalo con la consultora.";

export const MOTIVO_EQUILIBRIO_GASTO_FIJO_CERO =
  "Tus gastos fijos del mes están anotados en cero. Para saber desde qué venta cubres tus costos necesitamos lo que pagas sí o sí cada mes: sueldos, alquiler y servicios.";

/** Con gastos fijos en cero tampoco hay «cuánto aguantas» ni hipótesis del producto estrella. */
const MOTIVO_GASTO_FIJO_CERO = "con gastos fijos en cero no hay cuenta que hacer";

/** Lo que se añade a toda cifra que usa un número leído de un documento y todavía sin conciliar. */
export const LIMITACION_NUMERO_EXTRAIDO =
  "Se apoya en al menos un número leído de un documento que nadie ha conciliado todavía: la cifra es provisional hasta que se revise.";

/**
 * EL RÓTULO QUE VA JUNTO A LA CIFRA, en palabras del dueño. La limitación de arriba vive dentro de «Cómo se
 * calculó», que está plegado: una cifra provisional que solo lo dice ahí se lee como firme. Toda pantalla que
 * pinte una cifra con `provisional` en true pone este rótulo al lado, a la vista.
 */
export const ROTULO_CIFRA_PROVISIONAL = "provisional: sale de un documento que falta revisar";

/**
 * EL DUEÑO YA DIJO «NO LO SÉ». Es lo que se le repite, y nada más: antes, con un cero guardado en el mes y
 * el «no lo sé» guardado aparte, esta cuenta le pedía «márcalo como no lo sé» mientras, en la misma página,
 * Tus números le decía «Nos dijiste que no lo sabes». Un monto de verdad manda sobre las dos cosas; el
 * orden es el mismo que el de `costoVariableDeclarado`.
 */
export const MOTIVO_EQUILIBRIO_COSTO_VARIABLE_NO_SABE =
  "Nos dijiste que no sabes cuánto te cuesta lo que vendes. Para saber desde qué venta cubres tus costos hace falta ese número: lo que te costó la mercadería o los insumos de lo que vendiste en el mes.";

/** Montos dentro de una frase para el dueño. */
const enSoles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/**
 * "2026-08" → "agosto de 2026"; "actual" → "el mes actual". Para los motivos que lee el dueño:
 * nunca un código. (nombreDePeriodo da la forma de título, «Agosto 2026», para rótulos.)
 */
export function periodoEnPalabras(periodo: string): string {
  const m = /^([0-9]{4})-([0-9]{2})$/.exec(periodo);
  if (m) {
    const mes = MESES.find((x) => x.clave === m[2]);
    return mes ? `${mes.nombre.toLowerCase()} de ${m[1]}` : periodo;
  }
  if (periodo === PERIODO_DORADA) return "su mejor época";
  return "el mes actual";
}

/** «de agosto de 2026», «del mes actual»: la preposición bien puesta para meterlo en una frase. */
const dePeriodo = (periodo: string) => {
  const p = periodoEnPalabras(periodo);
  return p.startsWith("el ") ? `del ${p.slice(3)}` : `de ${p}`;
};

/** Había además un cero anotado: se dice que no se usa, sin volver a pedirle que marque lo que ya marcó. */
const limitacionCeroConNoSabe = (periodo: string) =>
  `Hay además un cero anotado en costos variables ${dePeriodo(periodo)}: no entra en ninguna cuenta. Vale lo que nos dijiste, que no lo sabes.`;

/** Los gastos fijos declarados «de hoy» sirven para un mes fechado, pero se dice que no son los de ese mes. */
const limitacionFijosDeHoy = (periodoVenta: string) =>
  `Los gastos fijos son los declarados como los del mes actual, no los ${dePeriodo(periodoVenta)} en particular; si entonces eran otros, la cifra cambia.`;

/**
 * Lo que se puede CALCULAR una vez que hay números. Sin los insumos devuelve null, y se dice.
 *
 * Regla D5: el equilibrio de la empresa sale de los costos variables del mes, no del margen del
 * producto estrella ni de la utilidad sobre ventas. Con los nueve vitales de hoy no hay costos
 * variables, así que `equilibrio` es null con motivo y la cifra del producto estrella se conserva
 * bajo su nombre verdadero.
 */
export function derivados(metricas: Metrica[]): Derivados {
  // Un «descartado» no entra en ningún cálculo aunque conserve un valor: lo excluye su estado, no la
  // suerte de que quien lo descartó también lo haya vaciado.
  const candidatosDe = (clave: string) =>
    metricas
      .map((m) => ({ n: normalizarMetrica(m.clave, m.periodo), valor: m.valor, estado: m.estado ?? null, origen: m.origen ?? null }))
      .filter((c) => c.n.clave === clave && c.n.periodo !== PERIODO_DORADA && c.valor != null && c.estado !== "descartado")
      .map((c): Elegido => ({ clave, periodo: c.n.periodo, valor: Number(c.valor), estado: c.estado, origen: c.origen }));

  /** El mes más reciente manda; "actual" solo si no hay ningún mes fechado. */
  const masReciente = (candidatos: Elegido[]): Elegido | null => {
    const conMes = candidatos.filter((c) => ES_MES.test(c.periodo)).sort((a, b) => b.periodo.localeCompare(a.periodo));
    return conMes[0] ?? candidatos[0] ?? null;
  };

  /** Si se pide un periodo y existe, ese; si no, el más reciente. */
  const v = (clave: string, periodoPreferido?: string): Elegido | null => {
    const candidatos = candidatosDe(clave);
    if (periodoPreferido) {
      const exacto = candidatos.find((c) => c.periodo === periodoPreferido);
      if (exacto) return exacto;
    }
    return masReciente(candidatos);
  };

  const nombreDe = (clave: string) => VITAL_POR_CLAVE.get(clave)?.nombre ?? RECONOCIDA_POR_CLAVE.get(clave)?.nombre ?? clave.replace(/_/g, " ");
  const fuente = (e: Elegido) => `${nombreDe(e.clave)} · ${nombreDePeriodo(e.periodo)} · ${etiquetaEstado(e.estado, e.origen)}`;
  const fuentes = (...es: (Elegido | null)[]) => es.filter((e): e is Elegido => e != null).map(fuente);
  const periodoDe = (...es: (Elegido | null)[]) => {
    const ps = [...new Set(es.filter((e): e is Elegido => e != null).map((e) => nombreDePeriodo(e.periodo)))];
    return ps.length === 0 ? "sin periodo" : ps.join(" y ");
  };
  const avisoPeriodos = (...es: (Elegido | null)[]) => {
    const ps = new Set(es.filter((e): e is Elegido => e != null).map((e) => e.periodo));
    return ps.size > 1 ? ["Los números vienen de periodos distintos; la cifra es orientativa hasta que se registren del mismo mes."] : [];
  };
  /**
   * LO EXTRAÍDO NUNCA ES VERIFICADO. Una cifra con algún insumo leído de un documento y sin conciliar
   * sale con la limitación escrita y marcada como provisional. Sin cifra no hay nada que rotular.
   */
  const rotular = (calculo: Calculo<number>, ...es: (Elegido | null)[]): { calculo: Calculo<number>; provisional: boolean } => {
    const provisional = calculo.valor != null && es.some((e) => e?.estado === "extraido");
    return { calculo: provisional ? { ...calculo, limitaciones: [...calculo.limitaciones, LIMITACION_NUMERO_EXTRAIDO] } : calculo, provisional };
  };

  const venta = v("venta_mes");
  const ganancia = v("ganancia_mes", venta?.periodo);
  const costoVariable = v("costo_variable_mes", venta?.periodo);
  // «NO LO SÉ» DECLARADO en costos variables y ningún monto de verdad en ningún mes: manda sobre un cero.
  const costoVariableNoSabe =
    metricas.some((m) => normalizarMetrica(m.clave, m.periodo).clave === "costo_variable_mes" && m.estado === "sin_dato" && m.valor == null) &&
    !candidatosDe("costo_variable_mes").some((c) => c.valor > 0);
  // LOS FIJOS DE HOY: los del mes más reciente. Son los de «cuánto aguantas» y los de la hipótesis
  // del producto estrella, que no se cruzan con las ventas de ningún mes. Siguen como estaban: una
  // línea base ya congelada no puede cambiar de cifra porque el equilibrio se volvió más exigente.
  const fijos = v("gasto_fijo_mes");
  // LOS FIJOS QUE ENTRAN EN EL EQUILIBRIO: los del mismo mes que las ventas; si no hay, los declarados
  // como los de hoy («actual», que es como los pone el dueño en Tus números); y si tampoco, el mes
  // más reciente, que el equilibrio rechazará con motivo. Antes el mes más reciente entraba en la
  // división aunque fuera otro, sin aviso.
  // UN CERO EN GASTOS FIJOS NO ES UN DATO: no le gana a un monto de verdad. Antes un cero anotado en
  // el mes de la venta le ganaba a los 12.000 «de hoy» y el equilibrio salía S/0, sin aviso. Solo si
  // no hay ningún monto se elige el cero, y entonces el equilibrio lo rechaza con su motivo.
  const candidatosFijos = candidatosDe("gasto_fijo_mes");
  const fijosConMonto = candidatosFijos.filter((c) => c.valor > 0);
  const fijosEquilibrio = !venta
    ? fijos
    : fijosConMonto.find((c) => c.periodo === venta.periodo) ?? fijosConMonto.find((c) => c.periodo === "actual") ?? masReciente(fijosConMonto) ?? fijos;
  /** Había un cero anotado justo en el mes de la venta y se usó otro monto: se dice, no se calla. */
  const ceroDelMesOmitido =
    venta != null && fijosEquilibrio != null && fijosEquilibrio.valor > 0 && candidatosFijos.some((c) => c.periodo === venta.periodo && c.valor <= 0);
  const precio = v("precio_producto_estrella");
  const costo = v("costo_producto_estrella");
  const caja = v("caja_hoy");

  // MARGEN DECLARADO: lo que el dueño dice que le queda de cada 100. Útil para conversar, inútil
  // para el equilibrio: la utilidad ya tiene los fijos descontados.
  const margen: Calculo<number> = (() => {
    const base = {
      formula: "margen declarado = lo que te quedó libre / ventas del mes × 100",
      periodo: periodoDe(venta, ganancia),
      fuentes: fuentes(venta, ganancia),
      supuestos: ["«Lo que te quedó libre» es la utilidad después de pagar todo, tal como la declaró la empresa."],
      limitaciones: ["Ya tiene descontados los gastos fijos: no es lo que queda de cada sol vendido después de pagar lo que cuesta lo vendido, así que no sirve para calcular desde qué venta se cubren los costos.", ...avisoPeriodos(venta, ganancia)],
    };
    if (!venta || !ganancia) return { ...base, valor: null, motivo_nulo: "faltan las ventas del mes o lo que quedó libre" };
    if (venta.valor <= 0) return { ...base, valor: null, motivo_nulo: "con ventas en cero no se calcula un porcentaje" };
    return { ...base, valor: (ganancia.valor / venta.valor) * 100 };
  })();

  const margenUnitario: Calculo<number> = (() => {
    const base = {
      formula: "margen del producto estrella = (precio − costo) / precio × 100",
      periodo: periodoDe(precio, costo),
      fuentes: fuentes(precio, costo),
      supuestos: ["El costo declarado es todo lo que cuesta hacer o comprar una unidad."],
      limitaciones: ["Es el margen de UN producto, no el de la empresa."],
    };
    if (!precio || !costo) return { ...base, valor: null, motivo_nulo: "faltan el precio o el costo de lo que más vendes" };
    if (precio.valor <= 0) return { ...base, valor: null, motivo_nulo: "con precio en cero no hay margen" };
    return { ...base, valor: ((precio.valor - costo.valor) / precio.valor) * 100 };
  })();

  // EQUILIBRIO DE LA EMPRESA: fijos / razón de margen de contribución. La razón solo existe con
  // ventas y costos variables del MISMO mes; los fijos tienen que ser de ese mes o los declarados
  // como los de hoy; un cero en costos variables no es un dato. Cada «no» va con su motivo en
  // palabras del dueño: meses con nombre, nunca códigos.
  const equilibrio: Calculo<number> = (() => {
    // Dentro de este cálculo «fijos» son los del equilibrio, no los de hoy.
    const fijos = fijosEquilibrio;
    const marco = { periodo: periodoDe(venta, costoVariable, fijos), fuentes: fuentes(venta, costoVariable, fijos) };
    // El esqueleto del cálculo (fórmula, periodo, fuentes, supuestos) aunque no haya cifra.
    const esqueleto = puntoEquilibrio({ costos_fijos: null, razon_mc: null, ...marco });
    const sinCifra = (motivo: string, limitaciones: string[] = []): Calculo<number> => ({ ...esqueleto, limitaciones, valor: null, motivo_nulo: motivo });

    // (b) Un cero en costos variables se trata como sin dato, y se dice en el motivo y en las limitaciones.
    const costoVariableEnCero = costoVariable != null && costoVariable.valor <= 0;
    const cv = costoVariableEnCero ? null : costoVariable;

    if (!venta) return sinCifra("Para saber desde qué venta cubres tus costos necesitamos tus ventas del mes.");
    // Con ventas en cero no hay proporción que sacar. Se dice así, no con la frase de la fórmula.
    if (venta.valor <= 0) {
      return sinCifra(`Tus ventas ${dePeriodo(venta.periodo)} están anotadas en cero: hace falta un mes con ventas para saber desde qué venta cubres tus costos.`);
    }
    if (!cv) {
      // Un solo mensaje: si ya dijo «no lo sé», se le dice eso, y el cero (si lo hay) se nombra sin volver a pedirle nada.
      if (costoVariableNoSabe) return sinCifra(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_NO_SABE, costoVariableEnCero && costoVariable ? [limitacionCeroConNoSabe(costoVariable.periodo)] : []);
      return costoVariableEnCero ? sinCifra(MOTIVO_EQUILIBRIO_COSTO_VARIABLE_CERO, [LIMITACION_COSTO_VARIABLE_CERO]) : sinCifra(MOTIVO_EQUILIBRIO_SIN_COSTO_VARIABLE);
    }
    if (!fijos) return sinCifra("Para saber desde qué venta cubres tus costos necesitamos tus gastos fijos del mes.");
    // Fijos en cero: sin dato, igual que en «cuánto aguantas». Nunca «equilibrio S/0».
    if (fijos.valor <= 0) return sinCifra(MOTIVO_EQUILIBRIO_GASTO_FIJO_CERO, [LIMITACION_GASTO_FIJO_CERO]);

    // D5: ventas y costos variables del mismo mes, o no hay razón.
    const c = comparables(
      { clave: "venta_mes", valor: venta.valor, periodo: venta.periodo },
      { clave: "costo_variable_mes", valor: cv.valor, periodo: cv.periodo }
    );
    if (!c.ok) {
      return sinCifra(
        venta.periodo !== cv.periodo
          ? `Las ventas son ${dePeriodo(venta.periodo)} y los costos variables ${dePeriodo(cv.periodo)}: hace falta registrarlos del mismo mes.`
          : "Las ventas y los costos variables que hay no se pueden juntar en una misma cuenta."
      );
    }
    // (a) Los fijos: del mismo mes que las ventas, o los declarados como los de hoy. De otro mes no entran en la división.
    const fijosDeHoy = fijos.periodo === "actual" && venta.periodo !== "actual";
    if (fijos.periodo !== venta.periodo && fijos.periodo !== "actual") {
      return sinCifra(
        `Las ventas son ${dePeriodo(venta.periodo)} y los gastos fijos ${dePeriodo(fijos.periodo)}: hace falta registrarlos del mismo mes, o anotar los gastos fijos como los del mes actual.`
      );
    }

    // Lo que cuesta lo vendido iguala o supera la venta: ningún volumen cubre los fijos. El dueño lo
    // puede provocar desde Tus números (casi siempre por contar ahí el alquiler o los sueldos), así
    // que se le dice con sus palabras y con la salida, no con la frase de la fórmula.
    if (cv.valor >= venta.valor) {
      return sinCifra(
        `Lo que te cuesta lo que vendes (${enSoles(cv.valor)}) es igual o mayor que lo que vendiste ${dePeriodo(venta.periodo)} (${enSoles(venta.valor)}): así, vender más no alcanza para cubrir tus gastos fijos. Revisa que en ese costo no hayas contado algo que se paga igual vendas o no, como el alquiler o los sueldos.`
      );
    }

    const mc = margenContribucion({ ventas: venta.valor, costos_variables: cv.valor, ...marco });
    const pe = puntoEquilibrio({ costos_fijos: fijos.valor, razon_mc: mc.valor?.razon ?? null, ...marco });
    const limitaciones = [
      ...pe.limitaciones.filter((l) => !l.startsWith("Sin precio")),
      ...(fijosDeHoy ? [limitacionFijosDeHoy(venta.periodo)] : []),
      ...(ceroDelMesOmitido ? [`Los gastos fijos ${dePeriodo(venta.periodo)} están anotados en cero y no se usaron. ${LIMITACION_GASTO_FIJO_CERO}`] : []),
    ];
    // Los casos sin cifra ya salieron arriba, cada uno con su frase. Si aun así no hay valor, no se
    // le pasa al dueño el motivo técnico de la fórmula.
    if (pe.valor == null) return { ...pe, limitaciones, valor: null, motivo_nulo: "Con los números que hay no se puede hacer esta cuenta." };
    return { ...pe, limitaciones, valor: pe.valor.soles };
  })();

  // LA HIPÓTESIS DEL PRODUCTO ESTRELLA: lo que antes se publicaba como equilibrio. Se conserva con
  // su nombre verdadero para no perder la cifra ni volver a confundirla con la de la empresa.
  const equilibrioProductoEstrella: Calculo<number> = (() => {
    // Con fijos en cero la hipótesis daría «necesitarías vender S/0»: sin dato, como en «cuánto aguantas».
    const fijosEnCero = fijos != null && fijos.valor <= 0;
    const pe = equilibrioPorProductoEstrella({
      costos_fijos: fijosEnCero ? null : fijos?.valor ?? null, precio: precio?.valor ?? null, costo_unitario: costo?.valor ?? null,
      periodo: periodoDe(fijos, precio, costo), fuentes: fuentes(fijos, precio, costo),
    });
    const limitaciones = [...pe.limitaciones, ...avisoPeriodos(fijos, precio, costo)];
    if (fijosEnCero) return { ...pe, limitaciones, valor: null, motivo_nulo: MOTIVO_GASTO_FIJO_CERO };
    return { ...pe, limitaciones, valor: pe.valor?.soles ?? null };
  })();

  const diasAguante: Calculo<number> = (() => {
    const base = {
      formula: "días de aguante = dinero en caja hoy / gastos fijos del mes × 30",
      periodo: periodoDe(caja, fijos),
      fuentes: fuentes(caja, fijos),
      supuestos: ["Mañana no entra nada y los fijos se pagan igual.", "Un mes son 30 días."],
      limitaciones: ["No descuenta lo que se debe ni suma lo que deben: es caja contra fijos, nada más."],
    };
    if (!caja || !fijos) return { ...base, valor: null, motivo_nulo: "faltan la caja de hoy o los gastos fijos del mes" };
    if (fijos.valor <= 0) return { ...base, valor: null, motivo_nulo: MOTIVO_GASTO_FIJO_CERO };
    return { ...base, valor: (caja.valor / fijos.valor) * 30 };
  })();

  // Cada cifra con los números que de verdad usó: si alguno es extraído, sale rotulada.
  const r = {
    margen: rotular(margen, venta, ganancia),
    margenUnitario: rotular(margenUnitario, precio, costo),
    equilibrio: rotular(equilibrio, venta, costoVariable, fijosEquilibrio),
    equilibrioProductoEstrella: rotular(equilibrioProductoEstrella, fijos, precio, costo),
    diasAguante: rotular(diasAguante, caja, fijos),
  };

  return {
    margen: margen.valor,
    margenUnitario: margenUnitario.valor,
    equilibrio: equilibrio.valor,
    equilibrioProductoEstrella: equilibrioProductoEstrella.valor,
    diasAguante: diasAguante.valor,
    sobreEquilibrio: venta && equilibrio.valor != null ? venta.valor - equilibrio.valor : null,
    detalle: {
      margen: r.margen.calculo,
      margenUnitario: r.margenUnitario.calculo,
      equilibrio: r.equilibrio.calculo,
      equilibrioProductoEstrella: r.equilibrioProductoEstrella.calculo,
      diasAguante: r.diasAguante.calculo,
    },
    provisional: {
      margen: r.margen.provisional,
      margenUnitario: r.margenUnitario.provisional,
      equilibrio: r.equilibrio.provisional,
      equilibrioProductoEstrella: r.equilibrioProductoEstrella.provisional,
      diasAguante: r.diasAguante.provisional,
    },
  };
}

// ─── TUS NÚMEROS: de lo que el dueño escribe a las filas que se guardan ─────────────────────────
//
// Estas funciones viven aquí, y no dentro de la pantalla y de la ruta, para poder probar el recorrido
// entero —formulario → filas → derivados— sin navegador ni base. La pantalla (MisNumeros) y la ruta
// (/api/portal/numeros) usan exactamente estas; no hay una segunda copia de la regla.

/**
 * Acepta «8 mil», «8,500», «28.000», «S/. 8500». El dueño escribe como habla. La lectura es la única del
 * sistema (numero-escrito.ts): antes esta copia guardaba «28.000» como 28. Aquí lo que no se entiende y los
 * negativos quedan como «sin dato» (null); la pantalla avisa aparte con `lecturaDeCampo` cuando el texto no es un
 * número o lleva signo menos.
 */
export function aNumero(t: string): number | null {
  const n = numeroEscrito(t);
  return typeof n === "number" ? n : null;
}

/** Cómo se leyó lo que hay en una caja: nada escrito, un número, un número con signo menos, o algo que no se entiende. */
export type LecturaDeCampo = "vacio" | "numero" | "negativo" | "invalido";

/**
 * VACÍO NO ES LO MISMO QUE MAL ESCRITO. `aNumero` devuelve null en los dos casos, y eso sirve para armar las
 * filas pero no para la pantalla: un «8.5oo» desaparecía al guardar sin que nadie dijera nada. Esta es la
 * lectura que usa la pantalla para avisar bajo la caja.
 *
 * UN NEGATIVO TAMPOCO ES «NO ENTENDIMOS». «-2000» está bien escrito: es un número con signo menos. Antes caía
 * en «invalido», y al dueño que perdió plata y lo escribía así se le respondía «No entendimos este número;
 * escríbelo como 8500…» sin dejarle guardar nada. Es «numero» solo lo que `aNumero` de verdad guardaría.
 */
export function lecturaDeCampo(texto: string | null | undefined): LecturaDeCampo {
  if (typeof numeroEscrito(texto) === "number") return "numero";
  const conSigno = numeroEscrito(texto, { negativo: true });
  return conSigno === null ? "vacio" : conSigno === "invalido" ? "invalido" : "negativo";
}

/** Lo que se le dice al dueño bajo la caja, con tres formas de escribirlo que sí se entienden. */
export const AVISO_NUMERO_NO_ENTENDIDO = "No entendimos este número; escríbelo como 8500, 8,500 u 8 mil.";
/** Una venta, una deuda o la caja con signo menos: se entiende, pero ahí no cabe. Se dice eso, no «no entendimos». */
export const AVISO_NUMERO_NEGATIVO = "Este número no puede ser negativo: escríbelo sin el signo menos.";
/**
 * «Lo que te quedó libre» con signo menos es una PÉRDIDA, no un error de dedo. Hoy la ruta que guarda Tus
 * números no admite montos negativos, así que no se guarda; se le dice sin rodeos qué pasa y qué hacer, y no
 * se le impide guardar lo demás. Callarlo, o pedirle que lo escriba «como 8500», sería esconder el hallazgo.
 */
export const AVISO_PERDIDA =
  "Si ese mes perdiste plata, todavía no tenemos dónde anotar una pérdida: este número no se va a guardar. Cuéntaselo a la consultora, que es un dato importante. Lo demás que escribiste se guarda igual.";
/** La única caja donde un signo menos tiene sentido: una utilidad puede ser negativa; una venta, no. */
export const CLAVE_QUE_PUEDE_SER_PERDIDA = "ganancia_mes";
/** Un monto en «mejor mes» o «peor mes» sin mes elegido no tiene dónde guardarse. */
export const AVISO_FALTA_EL_MES = "Elige el mes de este monto: sin el mes no tenemos dónde guardarlo.";

/** Cómo se llama cada caja de Tus números al revisar: la misma forma en la pantalla y en la prueba. */
export const campoDeValor = (clave: string) => `valor:${clave}`;
export const campoDeMes = (periodo: string) => `mes:${periodo}`;

export type RevisionDeNumeros = {
  /** Las cajas con algo escrito que no es un número: `valor:<clave>`, `mes:<AAAA-MM>`, `mejor`, `peor`. */
  invalidos: string[];
  /** Las cajas con un número bien escrito pero con signo menos, donde un negativo no cabe. Mismos nombres. */
  negativos: string[];
  /** «mejor» o «peor» con un monto bien escrito pero sin mes elegido. */
  sinMes: ("mejor" | "peor")[];
  /** «Lo que te quedó libre» con signo menos: una pérdida. Se avisa bajo su caja y NO detiene el guardado. */
  perdida: boolean;
  /** true cuando se puede guardar: nada mal escrito, ningún negativo fuera de lugar y nada sin su mes. */
  listo: boolean;
};

/**
 * LO QUE HAY QUE CORREGIR ANTES DE GUARDAR. Pura: recibe lo tecleado y dice qué cajas no se entienden. Una
 * caja vacía no es un error (es «sin dato»); una marcada «No lo sé» tampoco se revisa (está vacía y apagada).
 * Mientras `listo` sea false la pantalla no guarda: lo que el dueño escribió no puede perderse en silencio.
 *
 * Un número con signo menos se trata aparte de lo mal escrito: en cualquier caja es un negativo fuera de lugar
 * (se corrige antes de guardar), salvo en «Lo que te quedó libre», donde es una pérdida: se avisa con su
 * propia frase y no detiene lo demás.
 */
export function revisarNumerosEscritos(f: Pick<FormularioNumeros, "valores" | "meses" | "mejor" | "peor"> & { sinDato?: string[] }): RevisionDeNumeros {
  const invalidos: string[] = [];
  const negativos: string[] = [];
  const sinMes: ("mejor" | "peor")[] = [];
  let perdida = false;
  const noSabe = new Set(f.sinDato ?? []);
  for (const [clave, texto] of Object.entries(f.valores)) {
    if (noSabe.has(claveBase(clave))) continue;
    const lectura = lecturaDeCampo(texto);
    if (lectura === "invalido") invalidos.push(campoDeValor(clave));
    else if (lectura === "negativo" && clave === CLAVE_QUE_PUEDE_SER_PERDIDA) perdida = true;
    else if (lectura === "negativo") negativos.push(campoDeValor(clave));
  }
  for (const [periodo, texto] of Object.entries(f.meses)) {
    const lectura = lecturaDeCampo(texto);
    if (lectura === "invalido") invalidos.push(campoDeMes(periodo));
    else if (lectura === "negativo") negativos.push(campoDeMes(periodo));
  }
  for (const [id, p] of [["mejor", f.mejor], ["peor", f.peor]] as const) {
    const lectura = lecturaDeCampo(p.monto);
    if (lectura === "invalido") invalidos.push(id);
    else if (lectura === "negativo") negativos.push(id);
    else if (lectura === "numero" && !ES_MES.test(p.periodo)) sinMes.push(id);
  }
  // Los dos conteos de una proporción: con uno solo, o con más compras que personas, la cuenta no sale. Se marca la
  // caja que hay que tocar y la pantalla dice por qué (AVISO_CONTEO); lo mal escrito ya quedó marcado arriba.
  for (const v of VITALES) {
    if (!v.seguida || noSabe.has(v.clave)) continue;
    const total = f.valores[claveDeConteo(v.clave, "total")] ?? "";
    const parte = f.valores[claveDeConteo(v.clave, "parte")] ?? "";
    const lt = lecturaDeCampo(total);
    const lp = lecturaDeCampo(parte);
    if (lt === "numero" && lp === "numero" && deCadaDiez(aNumero(total), aNumero(parte)) == null) invalidos.push(campoDeValor(claveDeConteo(v.clave, "parte")));
    else if (lt === "numero" && lp === "vacio") invalidos.push(campoDeValor(claveDeConteo(v.clave, "parte")));
    else if (lt === "vacio" && lp === "numero") invalidos.push(campoDeValor(claveDeConteo(v.clave, "total")));
  }
  return { invalidos, negativos, sinMes, perdida, listo: invalidos.length === 0 && negativos.length === 0 && sinMes.length === 0 };
}

/** ¿Esta caja es uno de los dos conteos de una proporción? Si está bien escrita, su aviso es AVISO_CONTEO. */
export const esCampoDeConteo = (campo: string) => /^valor:[a-z0-9_]+:(?:total|parte)$/.test(campo);
/** Lo que se dice bajo un conteo que no deja hacer la cuenta. Sin cifras de muestra. */
export const AVISO_CONTEO =
  "Para hacer la cuenta hacen falta las dos cifras, y las que compraron no pueden ser más que las que preguntaron. Si no lo sabes, marca «No lo sé».";

/** Lo que hay escrito en la pantalla Tus números en el momento de guardar. Todo texto, tal como se tecleó. */
export type FormularioNumeros = {
  /** Cada pregunta contestada: clave → lo que escribió (los nueve y las reconocidas). */
  valores: Record<string, string>;
  /** Ventas escritas para un mes con nombre: AAAA-MM → lo que escribió. */
  meses: Record<string, string>;
  mejor: { periodo: string; monto: string };
  peor: { periodo: string; monto: string };
  /** Las claves marcadas «No lo sé». */
  sinDato: string[];
  /** El último mes cerrado (AAAA-MM): el «mes pasado» por el que se pregunta. null si no hay cuál ofrecer. */
  mesPasado: string | null;
  /** Los meses que ya tienen venta guardada. */
  mesesConVenta: string[];
};

/** Un mes con nombre y lo que se sabe de él. */
export type MesDeNumeros = { periodo: string; venta: number | null; ganancia?: number | null; gasto_fijo?: number | null; costo_variable?: number | null };

/** Lo que viaja a /api/portal/numeros (sin las temporadas, que no son números). */
export type CuerpoNumeros = {
  /** Lo que no tiene mes: se guarda como «de hoy». */
  vitales?: Record<string, number | null>;
  meses?: MesDeNumeros[];
  epoca_dorada?: number | null;
  sin_dato?: string[];
};

/**
 * LO QUE EL DUEÑO ESCRIBIÓ, LISTO PARA ENVIAR. La regla que importa: las preguntas que hablan «del mes
 * pasado» se guardan en ESE mes, no como «de hoy». Antes la venta contestada en «Lo que falta» iba a
 * «hoy» y los costos variables al mes pasado: nunca coincidían, y el equilibrio salía sin cifra
 * aunque el dueño hubiera dado los dos números en la misma pantalla.
 *
 *  - Ventas («¿cuánto vendió tu negocio el mes pasado?»): al mes pasado. Si además escribió ese mes
 *    con su nombre en «Tu año en tres preguntas», manda lo escrito ahí.
 *  - Lo que quedó libre («de todo eso que vendiste…»): va con su venta. Al mes pasado si ese mes
 *    tiene venta, guardada o en este mismo envío; si no, queda «de hoy» como siempre, para no
 *    separarlo de la venta que ya existe.
 *  - Costos variables: siempre al mes pasado, que es el mes por el que se pregunta.
 *  - Lo demás (caja, deudas, precio, gastos fijos…) no tiene mes: es lo de hoy.
 *
 * Sin mes pasado que ofrecer, todo queda «de hoy» y sigue coincidiendo entre sí.
 */
export function cuerpoDeNumeros(f: FormularioNumeros): { vitales: Record<string, number>; meses: MesDeNumeros[]; sin_dato: string[] } {
  const vitales: Record<string, number> = {};
  const filas: MesDeNumeros[] = [];
  const filaDe = (periodo: string): MesDeNumeros => {
    let fila = filas.find((x) => x.periodo === periodo);
    if (!fila) {
      fila = { periodo, venta: null };
      filas.push(fila);
    }
    return fila;
  };
  const escrito = (clave: string) => aNumero(f.valores[clave] ?? "");
  const mesPasado = f.mesPasado && ES_MES.test(f.mesPasado) ? f.mesPasado : null;

  // 1. Las ventas, cada una en su mes. Lo escrito para un mes con su nombre manda sobre lo demás.
  for (const [periodo, texto] of Object.entries(f.meses)) {
    const n = aNumero(texto);
    if (n != null && ES_MES.test(periodo)) filaDe(periodo).venta = n;
  }
  const ventaDelMesPasado = escrito("venta_mes");
  if (mesPasado && ventaDelMesPasado != null) {
    const fila = filaDe(mesPasado);
    if (fila.venta == null) fila.venta = ventaDelMesPasado;
  }
  for (const p of [f.mejor, f.peor]) {
    const n = aNumero(p.monto);
    if (n == null || !ES_MES.test(p.periodo)) continue;
    const fila = filaDe(p.periodo);
    if (fila.venta == null) fila.venta = n;
  }
  const hayVentaDelMesPasado =
    mesPasado != null && (f.mesesConVenta.includes(mesPasado) || filas.some((x) => x.periodo === mesPasado && x.venta != null));

  // 2. El resto de lo contestado. Las cajas de un conteo no viajan solas: se convierten en su número (paso 3).
  for (const clave of Object.keys(f.valores)) {
    if (clave.includes(":")) continue;
    const n = escrito(clave);
    if (n == null) continue;
    if (clave === "venta_mes" && mesPasado) continue; // ya quedó en su mes
    if (clave === "ganancia_mes" && mesPasado && hayVentaDelMesPasado) filaDe(mesPasado).ganancia = n;
    else if (clave === "costo_variable_mes" && mesPasado) filaDe(mesPasado).costo_variable = n;
    else vitales[clave] = n;
  }

  // 3. Lo que es una proporción se contó en dos cajas: la cuenta la hace 8X, aquí. Con «No lo sé» no se calcula nada.
  const noSabe = new Set(f.sinDato);
  for (const v of VITALES) {
    if (!v.seguida || noSabe.has(v.clave)) continue;
    const n = deCadaDiez(escrito(claveDeConteo(v.clave, "total")), escrito(claveDeConteo(v.clave, "parte")));
    if (n != null) vitales[v.clave] = n;
  }

  return {
    vitales,
    meses: filas.filter((x) => x.venta != null || x.ganancia != null || x.costo_variable != null),
    sin_dato: [...f.sinDato],
  };
}

/** Una fila de company_metricas tal como la escribe el dueño: contada de memoria o declarada «no lo sé». */
export type FilaNumero = { clave: string; periodo: string; valor: number | null; estado: "contado" | "sin_dato" };

/** Los nueve y las reconocidas entran; cualquier otra clave se ignora sin guardar. */
export const claveAceptada = (clave: string) => CLAVES_VITALES.has(clave) || CLAVES_RECONOCIDAS.has(clave);

/**
 * LO QUE LLEGÓ A LA RUTA, CONVERTIDO EN FILAS. Todo lo que entra por aquí es «contado» (lo dice de
 * memoria), nunca «verificado». Un «no lo sé» se guarda sin valor: es un hallazgo, no un cero.
 */
export function filasDeNumeros(b: CuerpoNumeros): FilaNumero[] {
  const filas: FilaNumero[] = [];

  for (const [claveBruta, valor] of Object.entries(b.vitales ?? {})) {
    const { clave, periodo } = normalizarMetrica(claveBruta, "actual");
    if (!claveAceptada(clave) || valor == null) continue;
    filas.push({ clave, periodo, valor, estado: "contado" });
  }

  for (const m of b.meses ?? []) {
    if (m.venta != null) filas.push({ clave: "venta_mes", periodo: m.periodo, valor: m.venta, estado: "contado" });
    if (m.ganancia != null) filas.push({ clave: "ganancia_mes", periodo: m.periodo, valor: m.ganancia, estado: "contado" });
    if (m.gasto_fijo != null) filas.push({ clave: "gasto_fijo_mes", periodo: m.periodo, valor: m.gasto_fijo, estado: "contado" });
    if (m.costo_variable != null) filas.push({ clave: "costo_variable_mes", periodo: m.periodo, valor: m.costo_variable, estado: "contado" });
  }

  if (b.epoca_dorada != null) filas.push({ clave: "venta_mes", periodo: PERIODO_DORADA, valor: b.epoca_dorada, estado: "contado" });

  for (const claveBruta of b.sin_dato ?? []) {
    const { clave } = normalizarMetrica(claveBruta, "actual");
    if (claveAceptada(clave)) filas.push({ clave, periodo: "actual", valor: null, estado: "sin_dato" });
  }
  return filas;
}

/**
 * Un mes de «Tus ventas mes a mes». `provisional`: la cifra salió de un documento y nadie la revisó todavía. `deCaja`
 * (solo cuando lo es): la suman los movimientos de ese mes en Finanzas.
 */
export type MesDeVenta = { periodo: string; valor: number; provisional: boolean; deCaja?: true };

/**
 * LAS VENTAS MES A MES QUE VE EL DUEÑO, la más reciente primero. La lista se pinta bajo «Lo que ya nos
 * contaste», y no filtraba por estado: una venta leída de un documento salía como contada por él, y una
 * «descartada» que conservara su valor salía igual. Lo descartado no se muestra (lo excluye su estado, como
 * en los cálculos y en la radiografía); lo extraído se muestra con su marca, para rotularlo junto a la cifra.
 */
export function serieDeVentas(metricas: Metrica[]): MesDeVenta[] {
  return metricas
    .filter((m) => m.clave === "venta_mes" && m.valor != null && m.estado !== "descartado" && ES_MES.test(m.periodo))
    .map((m): MesDeVenta => ({ periodo: m.periodo, valor: Number(m.valor), provisional: m.estado === "extraido", ...(esDeCaja(m) ? { deCaja: true as const } : {}) }))
    .sort((a, b) => b.periodo.localeCompare(a.periodo));
}

/**
 * LOS VITALES QUE NADIE «CONTÓ»: todo lo que hay de ellos salió de un documento sin revisar. Cuentan para la
 * radiografía, pero bajo «Lo que ya nos contaste» llevan su rótulo: no los dijo el dueño ni los revisó nadie.
 * Si además hay un valor contado o verificado, no entran aquí.
 */
export function vitalesSoloDeDocumento(metricas: Metrica[]): string[] {
  const estados = new Map<string, Set<string>>();
  for (const m of metricas) {
    const { clave, vital } = normalizarMetrica(m.clave, m.periodo);
    if (!vital || m.valor == null || m.estado === "descartado") continue;
    const vistos = estados.get(clave) ?? new Set<string>();
    vistos.add(String(m.estado ?? ""));
    estados.set(clave, vistos);
  }
  return VITALES.filter((v) => {
    const vistos = estados.get(v.clave);
    return vistos != null && vistos.size === 1 && vistos.has("extraido");
  }).map((v) => v.clave);
}

/**
 * QUÉ SE LE DICE AL DUEÑO DE LOS COSTOS VARIABLES QUE YA DIO. Por orden:
 *  1. Un monto de verdad (mayor que cero): el del mes pasado si existe; si no, el más reciente.
 *  2. Un «no lo sé» declarado. Manda sobre un cero: antes, con un cero guardado se le pedía marcar
 *     «No lo sé», lo marcaba, y al recargar el aviso del cero seguía ahí porque el cero del mes no se
 *     había ido. Un cero se trata como «no lo sé», así que si ya lo dijo, ya está dicho.
 *  3. Un cero, para avisarle de que no entra en ninguna cuenta.
 * Lo descartado al revisar una extracción no es algo que el dueño «ya contó».
 */
export function costoVariableDeclarado(otros: OtroNumero[], mesPasado: string | null): OtroNumero | null {
  const suyos = otros.filter((o) => o.clave === "costo_variable_mes" && o.estado !== "descartado");
  /** El mes con nombre más reciente; «de hoy» solo si no hay ninguno. */
  const masReciente = (lista: OtroNumero[]) =>
    lista.filter((o) => ES_MES.test(o.periodo)).sort((a, b) => b.periodo.localeCompare(a.periodo))[0] ?? lista[0] ?? null;
  const conMonto = suyos.filter((o) => o.valor != null && o.valor > 0);
  return (
    conMonto.find((o) => o.periodo === mesPasado) ??
    masReciente(conMonto) ??
    suyos.find((o) => o.estado === "sin_dato") ??
    masReciente(suyos.filter((o) => o.valor != null))
  );
}
