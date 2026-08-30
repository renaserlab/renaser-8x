/**
 * EL VOCABULARIO DE LOS NÚMEROS — la pieza de la que cuelga todo lo demás.
 *
 * Auditoría del 30-08-2026: la Radiografía Mínima exige nueve números, pero nada en el código los
 * verificaba. El extractor inventaba claves libres (`ganancia_mes_western_union`) y el resultado fue
 * que Qori tenía 18 números y solo 3 de los nueve vitales. Sin claves fijas no se puede cerrar la
 * radiografía, ni armar la serie por meses, ni congelar una línea base, ni comparar un corte.
 *
 * Aquí viven las claves canónicas, sus sinónimos y la cuenta de lo que falta.
 */

export type Vital = {
  clave: string;
  n: number;
  /** Cómo se le nombra al dueño. Nunca en jerga. */
  nombre: string;
  /** La pregunta hablada, con su ancla. La usa el entrevistador y la ve el dueño. */
  pregunta: string;
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
    pregunta: "¿Cuánto pagas al mes sí o sí, vendas o no vendas? Sueldos, alquiler y servicios juntos.",
    sinonimos: ["gasto_mes", "costo_fijo_mes", "gastos_fijos", "planilla_mes", "egresos_fijos", "gastos_mensuales", "costos_fijos_mes", "gasto_fijo"],
  },
  {
    n: 5, clave: "precio_producto_estrella", nombre: "Precio de lo que más vendes", unidad: "soles", mensual: false, mejorSi: "neutro",
    pregunta: "Lo que más vendes, ¿a cuánto lo vendes?",
    sinonimos: ["precio_estrella", "precio_venta_principal", "precio_producto_principal", "precio_principal", "precio_venta"],
  },
  {
    n: 6, clave: "costo_producto_estrella", nombre: "Lo que te cuesta", unidad: "soles", mensual: false, mejorSi: "baja",
    pregunta: "Y eso mismo, ¿cuánto te cuesta hacerlo o comprarlo?",
    sinonimos: ["costo_estrella", "costo_producto_principal", "costo_unitario", "costo_principal", "costo_compra"],
  },
  {
    n: 7, clave: "conversion_de_cada_10", nombre: "De cada 10 interesados, cuántos compran", unidad: "de_cada_10", mensual: false, mejorSi: "sube",
    pregunta: "De cada 10 personas que preguntan por tu producto, ¿cuántas terminan pagando?",
    sinonimos: ["conversion_10", "cierre_de_cada_10", "compran_de_cada_10", "tasa_cierre", "conversion", "clientes_de_cada_10", "cierran_de_cada_10"],
  },
  {
    n: 8, clave: "deuda_clientes", nombre: "Lo que te deben", unidad: "soles", mensual: false, mejorSi: "baja",
    pregunta: "¿Cuánto dinero te deben tus clientes ahora mismo?",
    sinonimos: ["cuentas_por_cobrar", "por_cobrar", "deben_clientes", "cobranza_pendiente", "cxc", "cobrar_clientes"],
  },
  {
    n: 9, clave: "deuda_propia", nombre: "Lo que tú debes", unidad: "soles", mensual: false, mejorSi: "baja",
    pregunta: "¿Y cuánto debes tú? Proveedores, banco o préstamos, todo junto.",
    sinonimos: ["deuda_proveedores", "cuentas_por_pagar", "prestamos", "deuda_banco", "por_pagar", "cxp", "deuda_total"],
  },
];

/** El mejor mes de la historia no es un vital aparte: es `venta_mes` en el periodo `epoca_dorada`. */
export const PERIODO_DORADA = "epoca_dorada";
export const CLAVES_VITALES = new Set(VITALES.map((v) => v.clave));
export const VITAL_POR_CLAVE = new Map(VITALES.map((v) => [v.clave, v]));

const PORSINONIMO = new Map<string, string>();
for (const v of VITALES) {
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

/** Clave y periodo juntos: `venta_epoca_dorada` guarda en venta_mes con periodo dorado. */
export function normalizarMetrica(clave: string, periodo: string | null | undefined): { clave: string; periodo: string } {
  const bruta = clave.toLowerCase().trim();
  if (bruta === "venta_epoca_dorada" || bruta === "mejor_mes_venta" || bruta === "venta_mejor_mes")
    return { clave: "venta_mes", periodo: PERIODO_DORADA };
  return { clave: normalizarClave(clave), periodo: normalizarPeriodo(periodo) };
}

export type Metrica = { clave: string; periodo: string; valor: number | null; estado?: string | null };

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
};

/**
 * ¿Qué le falta a esta empresa para tener la radiografía cerrada? Es lo que el dueño ve en su
 * pantalla y lo que la consultora ve por cada cliente.
 */
export function radiografia(metricas: Metrica[]): Radiografia {
  const conValor = new Set<string>();
  const declaradoSinDato = new Set<string>();
  const mesesVenta = new Set<string>();
  let dorada = false;

  for (const m of metricas) {
    const { clave, periodo } = normalizarMetrica(m.clave, m.periodo);
    if (!CLAVES_VITALES.has(clave)) continue;
    if (m.valor != null) {
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
  };
}

/** Lo que se puede CALCULAR una vez que hay números. Sin los insumos devuelve null, y se dice. */
export function derivados(metricas: Metrica[]) {
  const v = (clave: string) => {
    const candidatos = metricas
      .map((m) => ({ n: normalizarMetrica(m.clave, m.periodo), valor: m.valor }))
      .filter((c) => c.n.clave === clave && c.n.periodo !== PERIODO_DORADA && c.valor != null);
    // El mes más reciente manda; "actual" solo si no hay ningún mes fechado.
    const conMes = candidatos.filter((c) => ES_MES.test(c.n.periodo)).sort((a, b) => b.n.periodo.localeCompare(a.n.periodo));
    return (conMes[0] ?? candidatos[0])?.valor ?? null;
  };

  const venta = v("venta_mes");
  const ganancia = v("ganancia_mes");
  const fijos = v("gasto_fijo_mes");
  const precio = v("precio_producto_estrella");
  const costo = v("costo_producto_estrella");
  const caja = v("caja_hoy");

  const margen = venta != null && ganancia != null && venta > 0 ? (ganancia / venta) * 100 : null;
  const margenUnitario = precio != null && costo != null && precio > 0 ? ((precio - costo) / precio) * 100 : null;
  // Punto de equilibrio: cuánto tiene que vender para no perder. Va con el margen del producto que
  // más vende, no con un promedio: vender más de algo que deja poco no salva a nadie.
  const equilibrio = fijos != null && margenUnitario != null && margenUnitario > 0 ? fijos / (margenUnitario / 100) : null;
  const diasAguante = caja != null && fijos != null && fijos > 0 ? (caja / fijos) * 30 : null;

  return {
    margen,
    margenUnitario,
    equilibrio,
    diasAguante,
    /** Cuánto vende por encima (o por debajo) de lo que necesita para no perder. */
    sobreEquilibrio: venta != null && equilibrio != null ? venta - equilibrio : null,
  };
}
