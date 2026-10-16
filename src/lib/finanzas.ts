/**
 * INTEGRIDAD FINANCIERA — las cuentas que sostienen cualquier recomendación.
 *
 * Decisión D5 (13-10-2026): el paquete anterior proponía «equilibrio = fijos / (utilidad / ventas)»
 * y daba 155.000 para Modas Lucero. Dirección lo rechazó: utilidad / ventas NO es la tasa de margen
 * de contribución, porque la utilidad ya tiene los fijos descontados. Dividir los fijos entre esa
 * razón los cuenta dos veces y produce un número que parece exacto y es falso.
 *
 * Este módulo es puro y determinista: no toca la base, no llama a la IA, no inventa. Reglas:
 *
 *  1. Cada cálculo devuelve `Calculo<T>`: valor o null con motivo, y SIEMPRE fórmula, periodo,
 *     fuentes, supuestos y limitaciones. Lo que no se puede explicar no se muestra.
 *  2. La falta de dato nunca es cero. Un costo que no se registró no es un costo de cero.
 *  3. Dos cifras solo se suman o comparan si comparten periodo y moneda y no se superponen:
 *     «total de ventas» + «ventas al contado» es contar lo mismo dos veces.
 *  4. Las palabras importan: facturar no es ingresar ni cobrar; costo no es gasto; la utilidad
 *     bruta no es la operativa ni la neta; el sueldo del dueño es un gasto y no «lo que queda»;
 *     un retiro o un aporte de capital no es resultado de nada.
 */

// ─── Taxonomía ──────────────────────────────────────────────────────────────────────────────────

export type Moneda = "PEN" | "USD";

/**
 * Facturación ≠ ingresos ≠ cobranza. Lo facturado es lo que se emitió; lo reconocido es lo que ya se
 * ganó (el servicio prestado, la mercadería entregada); lo cobrado es lo que entró a la caja. En
 * una tienda al contado coinciden; en un estudio jurídico que cobra «la segunda mitad al final»
 * se separan meses.
 */
export type Ingreso = {
  periodo: string;
  moneda?: Moneda;
  facturado: number | null;
  reconocido: number | null;
  cobrado: number | null;
};

/** Directo: se le puede atribuir a un producto o caso. Indirecto: lo sostiene todo a la vez. */
export type NaturalezaCosto = "directo" | "indirecto";
/** Fijo: se paga vendas o no. Variable: sube y baja con la venta. Semivariable: una parte de cada. */
export type ComportamientoCosto = "fijo" | "variable" | "semivariable";

export type Costo = {
  concepto: string;
  monto: number;
  periodo: string;
  naturaleza: NaturalezaCosto;
  comportamiento: ComportamientoCosto;
  /** true si es gasto de operar (alquiler, planilla administrativa); false si es costo de lo vendido. */
  es_gasto_operativo: boolean;
};

export type Resultado = {
  /** Ventas − costo de lo vendido. */
  utilidad_bruta: number | null;
  /** Bruta − gastos de operar (incluida la remuneración del propietario si se registró). */
  utilidad_operativa: number | null;
  /** Operativa + otros ingresos − otros egresos − impuestos. */
  utilidad_neta: number | null;
};

export type Caja = {
  fecha: string;
  saldo: number | null;
  /** Si el saldo suma efectivo y banco o solo uno de los dos. */
  incluye_banco: boolean;
};

/** El sueldo del dueño es un gasto del negocio. Si no se separa, la «utilidad» lo esconde. */
export type RemuneracionPropietario = {
  periodo: string;
  monto: number | null;
  /** true si ya viene dentro de los gastos operativos declarados (para no restarlo dos veces). */
  incluida_en_gastos: boolean;
};

export type TipoMovimientoPatrimonial = "retiro" | "distribucion" | "aporte" | "prestamo";

/** Dinero que entra o sale del negocio sin ser venta ni gasto. NUNCA entra en el resultado. */
export type MovimientoPatrimonial = {
  tipo: TipoMovimientoPatrimonial;
  monto: number;
  fecha: string;
  nota?: string;
};

// ─── El contrato de cada cálculo ─────────────────────────────────────────────────────────────────

export type Calculo<T> = {
  valor: T | null;
  /** La fórmula en palabras y símbolos, para que alguien sin el código la pueda rehacer a mano. */
  formula: string;
  periodo: string;
  /** Claves o ids de donde salieron los insumos. */
  fuentes: string[];
  supuestos: string[];
  limitaciones: string[];
  /** Presente solo cuando `valor` es null: por qué no se pudo calcular. */
  motivo_nulo?: string;
};

type Marco = { periodo?: string; fuentes?: string[] };

const SIN_PERIODO = "sin periodo declarado";

function nulo<T>(c: Omit<Calculo<T>, "valor" | "motivo_nulo">, motivo: string): Calculo<T> {
  return { ...c, valor: null, motivo_nulo: motivo };
}

/** Redondeo al sol entero, para mostrar. El cálculo conserva decimales. */
export function redondearSoles(n: number): number {
  return Math.round(n);
}

const esNumero = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// ─── Margen de contribución ──────────────────────────────────────────────────────────────────────

export const MOTIVO_SIN_COSTOS_VARIABLES =
  "sin costos variables no hay margen de contribución; la utilidad declarada no sirve de sustituto";

export type MargenContribucion = { monto: number; razon: number };

/**
 * MC = ventas − costos variables. Razón = MC / ventas. Es la única razón con la que se puede
 * calcular el punto de equilibrio. La utilidad sobre ventas (ganancia / ventas) NO sirve: la
 * utilidad ya tiene los fijos restados.
 */
export function margenContribucion(e: { ventas: number | null; costos_variables: number | null } & Marco): Calculo<MargenContribucion> {
  const base = {
    formula: "margen de contribución = ventas − costos variables; razón = margen de contribución / ventas",
    periodo: e.periodo ?? SIN_PERIODO,
    fuentes: e.fuentes ?? [],
    supuestos: ["Los costos variables son solo los que suben y bajan con la venta (mercadería, insumos, comisiones)."],
    limitaciones: [] as string[],
  };
  if (!esNumero(e.ventas)) return nulo(base, "sin ventas del periodo no hay margen de contribución");
  if (!esNumero(e.costos_variables)) return nulo(base, MOTIVO_SIN_COSTOS_VARIABLES);
  if (e.ventas <= 0) return nulo(base, "con ventas en cero no se puede calcular una razón");

  const monto = e.ventas - e.costos_variables;
  const razon = monto / e.ventas;
  if (razon <= 0) base.limitaciones.push("La razón es cero o negativa: cada venta cuesta más de lo que deja. Ningún volumen cubre los fijos.");
  return { ...base, valor: { monto, razon } };
}

export type LineaMezcla = { nombre: string; ventas: number; costo_variable: number | null };

export type MezclaPonderada = {
  razon: number;
  monto: number;
  ventas: number;
  detalle: { nombre: string; ventas: number; costo_variable: number; mc: number; razon: number; participacion: number }[];
};

/**
 * La razón de la EMPRESA cuando vende varias cosas con márgenes distintos: suma de MC / suma de
 * ventas. No es el promedio simple de las razones; la línea que más vende pesa más.
 * Si falta el costo variable de alguna línea, la razón de la mezcla no existe: una razón parcial
 * presentada como la de la empresa es justo el error que este módulo evita.
 */
export function margenContribucionPonderado(lineas: LineaMezcla[], marco: Marco = {}): Calculo<MezclaPonderada> {
  const base = {
    formula: "razón ponderada = Σ(ventas − costo variable) de cada línea / Σ ventas; participación = ventas de la línea / Σ ventas",
    periodo: marco.periodo ?? SIN_PERIODO,
    fuentes: marco.fuentes ?? lineas.map((l) => l.nombre),
    supuestos: ["Todas las líneas son del mismo periodo y moneda.", "La mezcla del periodo se mantiene: si cambia qué se vende, cambia la razón."],
    limitaciones: [] as string[],
  };
  if (lineas.length === 0) return nulo(base, "sin líneas no hay mezcla");
  const sinCosto = lineas.filter((l) => !esNumero(l.costo_variable));
  if (sinCosto.length > 0)
    return nulo(base, `${sinCosto.length} de ${lineas.length} líneas sin costo variable (${sinCosto.map((l) => l.nombre).join(", ")}): la razón de la mezcla no se puede calcular`);
  const ventas = lineas.reduce((s, l) => s + l.ventas, 0);
  if (ventas <= 0) return nulo(base, "la suma de ventas es cero: no hay mezcla que ponderar");

  const detalle = lineas.map((l) => {
    const mc = l.ventas - (l.costo_variable as number);
    return { nombre: l.nombre, ventas: l.ventas, costo_variable: l.costo_variable as number, mc, razon: l.ventas > 0 ? mc / l.ventas : 0, participacion: l.ventas / ventas };
  });
  const monto = detalle.reduce((s, d) => s + d.mc, 0);
  return { ...base, valor: { razon: monto / ventas, monto, ventas, detalle } };
}

// ─── Punto de equilibrio ─────────────────────────────────────────────────────────────────────────

export const MOTIVO_SIN_RAZON_MC =
  "sin razón de margen de contribución no hay punto de equilibrio: hace falta el costo variable (de la empresa o de la mezcla). La utilidad sobre ventas no la reemplaza";

export type PuntoEquilibrio = {
  /** Venta mensual a la que se cubren los fijos. Con decimales. */
  soles: number;
  /** La misma cifra al sol entero, para mostrar. */
  soles_redondeado: number;
  /** Solo cuando hay precio y costo variable unitario: fijos / (precio − costo variable unitario). */
  unidades: number | null;
};

/**
 * Equilibrio en soles = costos fijos / razón de margen de contribución.
 * En unidades = costos fijos / (precio − costo variable unitario), si hay precio y costo unitario.
 * Con mezcla, la razón que entra aquí es la ponderada (margenContribucionPonderado).
 *
 * LA FÓRMULA Y LOS SUPUESTOS LOS LEE EL DUEÑO en «Cómo se calculó» (Tus números). Por eso no dicen «razón
 * de margen de contribución»: dicen lo que es, «lo que queda de cada sol vendido después de pagar lo que
 * cuesta lo vendido». Los motivos de «sin cifra» de aquí abajo no le llegan: metricas.ts pone los suyos.
 */
export function puntoEquilibrio(
  e: { costos_fijos: number | null; razon_mc: number | null; precio_unitario?: number | null; costo_variable_unitario?: number | null } & Marco
): Calculo<PuntoEquilibrio> {
  const base = {
    formula: "equilibrio (soles) = costos fijos / lo que queda de cada sol vendido después de pagar lo que cuesta lo vendido; equilibrio (unidades) = costos fijos / (precio − lo que cuesta cada unidad)",
    periodo: e.periodo ?? SIN_PERIODO,
    fuentes: e.fuentes ?? [],
    supuestos: [
      "Los costos fijos son del mismo periodo que las ventas y que lo que costó lo vendido.",
      "Lo que queda de cada sol vendido después de pagar lo que cuesta lo vendido se mantiene igual aunque se venda más o menos.",
      "La cifra en soles se redondea al sol entero para mostrar; el cálculo conserva decimales.",
    ],
    limitaciones: [] as string[],
  };
  if (!esNumero(e.costos_fijos)) return nulo(base, "sin costos fijos no hay punto de equilibrio");
  if (!esNumero(e.razon_mc)) return nulo(base, MOTIVO_SIN_RAZON_MC);
  if (e.razon_mc <= 0) return nulo(base, "la razón de margen de contribución es cero o negativa: ningún volumen de venta cubre los fijos");

  const soles = e.costos_fijos / e.razon_mc;
  let unidades: number | null = null;
  if (esNumero(e.precio_unitario) && esNumero(e.costo_variable_unitario)) {
    const mcUnitaria = e.precio_unitario - e.costo_variable_unitario;
    if (mcUnitaria > 0) unidades = e.costos_fijos / mcUnitaria;
    else base.limitaciones.push("El costo variable unitario iguala o supera al precio: no hay equilibrio en unidades.");
  } else {
    base.limitaciones.push("Sin precio y costo variable unitario no se calcula el equilibrio en unidades; solo en soles.");
  }
  return { ...base, valor: { soles, soles_redondeado: redondearSoles(soles), unidades } };
}

export const ROTULO_PRODUCTO_ESTRELLA = "hipótesis: toda la venta fuera ese producto";

export type EquilibrioProductoEstrella = { soles: number; soles_redondeado: number; unidades: number; razon_mc_producto: number };

/**
 * Lo que metricas.ts calculaba y publicaba como «equilibrio»: fijos / margen del producto estrella.
 * Se conserva porque la cifra sirve para conversar, pero rotulada por lo que es: una hipótesis en
 * la que toda la venta del mes fuera de ese producto. No es el equilibrio de la empresa.
 */
export function equilibrioPorProductoEstrella(e: { costos_fijos: number | null; precio: number | null; costo_unitario: number | null } & Marco): Calculo<EquilibrioProductoEstrella> {
  const base = {
    formula: "equilibrio (hipótesis) = costos fijos / ((precio − costo unitario) / precio); unidades = costos fijos / (precio − costo unitario)",
    periodo: e.periodo ?? SIN_PERIODO,
    fuentes: e.fuentes ?? [],
    supuestos: [`${ROTULO_PRODUCTO_ESTRELLA.charAt(0).toUpperCase()}${ROTULO_PRODUCTO_ESTRELLA.slice(1)}.`, "El costo unitario declarado es el costo variable completo del producto."],
    limitaciones: ["No es el punto de equilibrio de la empresa: la mezcla real tiene otros márgenes. Para el de la empresa hacen falta los costos variables del mes."],
  };
  if (!esNumero(e.costos_fijos)) return nulo(base, "sin costos fijos no hay punto de equilibrio");
  if (!esNumero(e.precio) || !esNumero(e.costo_unitario)) return nulo(base, "sin precio y costo del producto estrella no hay hipótesis que calcular");
  if (e.precio <= 0) return nulo(base, "con precio en cero no hay margen del producto");
  const mcUnitaria = e.precio - e.costo_unitario;
  if (mcUnitaria <= 0) return nulo(base, "el producto estrella cuesta igual o más de lo que se vende: ningún volumen cubre los fijos");
  const razon = mcUnitaria / e.precio;
  const soles = e.costos_fijos / razon;
  return { ...base, valor: { soles, soles_redondeado: redondearSoles(soles), unidades: e.costos_fijos / mcUnitaria, razon_mc_producto: razon } };
}

// ─── Costeo por SKU ──────────────────────────────────────────────────────────────────────────────

export type Sku = { codigo: string; precio: number; costo_variable_unitario: number | null; unidades: number | null };

export type CosteoSku = {
  detalle: {
    codigo: string;
    precio: number;
    mc_unitaria: number | null;
    mc_total: number | null;
    ventas: number | null;
    participacion: number | null;
    /** Por qué una celda es null, en palabras. */
    motivo?: string;
  }[];
  /** Totales SOLO sobre los SKU que tienen costo y unidades. */
  total_ventas: number;
  total_mc: number;
  con_costo: number;
  sin_costo: number;
  sin_unidades: number;
  parcial: boolean;
  aviso: string | null;
};

/**
 * Por cada SKU: margen unitario, margen total y participación en la venta. Los totales se calculan
 * solo con los SKU completos, y se dice cuántos faltan: «40 de 120 sin costo: el total es parcial».
 * Un promedio inventado para rellenar los huecos sería peor que el hueco.
 */
export function costeoPorSku(skus: Sku[], marco: Marco = {}): Calculo<CosteoSku> {
  const base = {
    formula: "mc unitaria = precio − costo variable unitario; mc total = mc unitaria × unidades; participación = (precio × unidades) / Σ(precio × unidades de los SKU con unidades)",
    periodo: marco.periodo ?? SIN_PERIODO,
    fuentes: marco.fuentes ?? [],
    supuestos: ["El costo variable unitario incluye todo lo que varía con cada unidad vendida."],
    limitaciones: [] as string[],
  };
  if (skus.length === 0) return nulo(base, "sin SKU no hay costeo");
  const conUnidades = skus.filter((s) => esNumero(s.unidades));
  const ventasTotales = conUnidades.reduce((s, k) => s + k.precio * (k.unidades as number), 0);

  const detalle = skus.map((s) => {
    const tieneCosto = esNumero(s.costo_variable_unitario);
    const tieneUnidades = esNumero(s.unidades);
    const mc_unitaria = tieneCosto ? s.precio - (s.costo_variable_unitario as number) : null;
    const ventas = tieneUnidades ? s.precio * (s.unidades as number) : null;
    const mc_total = mc_unitaria != null && tieneUnidades ? mc_unitaria * (s.unidades as number) : null;
    const participacion = ventas != null && ventasTotales > 0 ? ventas / ventasTotales : null;
    const motivos: string[] = [];
    if (!tieneCosto) motivos.push("sin costo unitario");
    if (!tieneUnidades) motivos.push("sin unidades vendidas");
    return { codigo: s.codigo, precio: s.precio, mc_unitaria, mc_total, ventas, participacion, ...(motivos.length ? { motivo: motivos.join("; ") } : {}) };
  });

  const completos = detalle.filter((d) => d.mc_total != null);
  const sin_costo = skus.filter((s) => !esNumero(s.costo_variable_unitario)).length;
  const sin_unidades = skus.filter((s) => !esNumero(s.unidades)).length;
  if (completos.length === 0) return nulo(base, `ningún SKU tiene costo y unidades a la vez (${sin_costo} sin costo, ${sin_unidades} sin unidades): no hay total que calcular`);

  const parcial = completos.length < skus.length;
  const aviso = parcial
    ? `${skus.length - completos.length} de ${skus.length} sin costo o sin unidades: el total es parcial`
    : null;
  if (aviso) base.limitaciones.push(aviso);
  return {
    ...base,
    valor: {
      detalle,
      total_ventas: completos.reduce((s, d) => s + (d.ventas as number), 0),
      total_mc: completos.reduce((s, d) => s + (d.mc_total as number), 0),
      con_costo: skus.length - sin_costo,
      sin_costo,
      sin_unidades,
      parcial,
      aviso,
    },
  };
}

// ─── Costeo por servicio ─────────────────────────────────────────────────────────────────────────

export type Servicio = { nombre: string; tarifa: number; horas_por_caso: number | null; casos: number; costo_hora: number | null };
export type Capacidad = { personas: number; horas_mes_por_persona: number; /** Cuántos meses cubre el periodo analizado. 1 si no se dice. */ meses?: number };

export type CosteoServicio = {
  detalle: {
    nombre: string;
    ingreso: number;
    horas: number | null;
    ingreso_por_hora: number | null;
    mc_por_hora: number | null;
    motivo?: string;
  }[];
  ingreso_total: number;
  /** Suma de horas de los servicios que las tienen registradas. */
  horas_requeridas: number | null;
  horas_disponibles: number;
  /** horas requeridas / horas disponibles × 100. null si falta alguna hora. */
  utilizacion_pct: number | null;
  servicios_sin_horas: string[];
};

/**
 * Para un estudio o un taller: cuánto ingresa cada servicio, cuántas horas se lleva y cuánto deja
 * por hora. Horas no registradas → margen por hora null con motivo. Ese null es un resultado válido
 * y se dice: «rentabilidad por servicio desconocida» es un hallazgo, no un fallo.
 */
export function costeoPorServicio(servicios: Servicio[], capacidad: Capacidad, marco: Marco = {}): Calculo<CosteoServicio> {
  const meses = capacidad.meses ?? 1;
  const base = {
    formula:
      "ingreso = tarifa × casos; horas = horas por caso × casos; ingreso por hora = ingreso / horas; mc por hora = (ingreso − costo por hora × horas) / horas; utilización = Σ horas / (personas × horas al mes × meses) × 100",
    periodo: marco.periodo ?? SIN_PERIODO,
    fuentes: marco.fuentes ?? servicios.map((s) => s.nombre),
    supuestos: [
      `Capacidad: ${capacidad.personas} persona(s) × ${capacidad.horas_mes_por_persona} h al mes × ${meses} mes(es).`,
      "Los casos y la capacidad se refieren al mismo periodo; si los casos son de un semestre, `meses` debe ser 6.",
    ],
    limitaciones: [] as string[],
  };
  if (servicios.length === 0) return nulo(base, "sin servicios no hay costeo");
  const horas_disponibles = capacidad.personas * capacidad.horas_mes_por_persona * meses;
  if (horas_disponibles <= 0) return nulo(base, "la capacidad declarada es cero: no hay con qué comparar las horas");

  const detalle = servicios.map((s) => {
    const ingreso = s.tarifa * s.casos;
    const horas = esNumero(s.horas_por_caso) ? s.horas_por_caso * s.casos : null;
    const motivos: string[] = [];
    let ingreso_por_hora: number | null = null;
    let mc_por_hora: number | null = null;
    if (horas == null) motivos.push("horas no registradas");
    else if (horas <= 0) motivos.push("horas en cero");
    else {
      ingreso_por_hora = ingreso / horas;
      if (esNumero(s.costo_hora)) mc_por_hora = (ingreso - s.costo_hora * horas) / horas;
      else motivos.push("costo por hora no registrado");
    }
    return { nombre: s.nombre, ingreso, horas, ingreso_por_hora, mc_por_hora, ...(motivos.length ? { motivo: motivos.join("; ") } : {}) };
  });

  const sinHoras = detalle.filter((d) => d.horas == null).map((d) => d.nombre);
  const horas_requeridas = sinHoras.length === 0 ? detalle.reduce((s, d) => s + (d.horas as number), 0) : null;
  if (sinHoras.length > 0) base.limitaciones.push(`Horas no registradas en: ${sinHoras.join(", ")}. La utilización de capacidad no se puede calcular.`);
  const utilizacion_pct = horas_requeridas != null ? (horas_requeridas / horas_disponibles) * 100 : null;
  if (utilizacion_pct != null && utilizacion_pct > 100)
    base.limitaciones.push("Las horas requeridas superan la capacidad: la estimación de horas por caso o la carga declarada no cuadran. Se pregunta, no se concluye.");

  return {
    ...base,
    valor: { detalle, ingreso_total: detalle.reduce((s, d) => s + d.ingreso, 0), horas_requeridas, horas_disponibles, utilizacion_pct, servicios_sin_horas: sinHoras },
  };
}

// ─── Estado de resultados ────────────────────────────────────────────────────────────────────────

export type EstadoDeResultados = Resultado & {
  remuneracion_propietario_considerada: boolean;
  /** Por qué un renglón es null, en palabras. */
  motivos: Partial<Record<keyof Resultado, string>>;
};

export const NOTA_SIN_REMUNERACION =
  "No se registró la remuneración del propietario. En una microempresa la utilidad declarada suele incluir su sueldo: la utilidad operativa está sobreestimada en ese monto.";

/**
 * Bruta = ventas − costo de ventas. Operativa = bruta − gastos operativos − remuneración del
 * propietario (gasto explícito). Neta = operativa + otros − impuestos.
 * Los movimientos patrimoniales (retiros, aportes, préstamos) se reciben para dejar constancia de
 * que NO entran: no son ingreso ni gasto.
 */
export function estadoDeResultados(
  e: {
    ventas: number | null;
    costo_ventas: number | null;
    gastos_operativos: number | null;
    /** Otros ingresos (+) o egresos (−) fuera de la operación. null = no se sabe, que no es cero. */
    otros?: number | null;
    impuestos?: number | null;
    remuneracion_propietario?: number | null;
    movimientos_patrimoniales?: MovimientoPatrimonial[];
  } & Marco
): Calculo<EstadoDeResultados> {
  const base = {
    formula: "utilidad bruta = ventas − costo de ventas; utilidad operativa = bruta − gastos operativos − remuneración del propietario; utilidad neta = operativa + otros − impuestos",
    periodo: e.periodo ?? SIN_PERIODO,
    fuentes: e.fuentes ?? [],
    supuestos: ["La remuneración del propietario NO está dentro de los gastos operativos declarados; por eso se resta aparte."],
    limitaciones: [] as string[],
  };
  const movs = e.movimientos_patrimoniales ?? [];
  if (movs.length > 0) {
    const total = movs.reduce((s, m) => s + m.monto, 0);
    base.supuestos.push(`Quedan fuera ${movs.length} movimiento(s) patrimonial(es) por S/ ${redondearSoles(total)} (${movs.map((m) => m.tipo).join(", ")}): no son ingreso ni gasto.`);
  }
  if (!esNumero(e.ventas)) return nulo(base, "sin ventas no hay estado de resultados");

  const motivos: EstadoDeResultados["motivos"] = {};
  const utilidad_bruta = esNumero(e.costo_ventas) ? e.ventas - e.costo_ventas : null;
  if (utilidad_bruta == null) motivos.utilidad_bruta = "costo de ventas no registrado";

  const conRemuneracion = esNumero(e.remuneracion_propietario);
  if (!conRemuneracion) base.limitaciones.push(NOTA_SIN_REMUNERACION);
  let utilidad_operativa: number | null = null;
  if (utilidad_bruta == null) motivos.utilidad_operativa = "sin utilidad bruta no hay operativa";
  else if (!esNumero(e.gastos_operativos)) motivos.utilidad_operativa = "gastos operativos no registrados";
  else utilidad_operativa = utilidad_bruta - e.gastos_operativos - (conRemuneracion ? (e.remuneracion_propietario as number) : 0);

  let utilidad_neta: number | null = null;
  if (utilidad_operativa == null) motivos.utilidad_neta = "sin utilidad operativa no hay neta";
  else if (!esNumero(e.otros)) motivos.utilidad_neta = "otros ingresos y egresos no registrados (no se asumen en cero)";
  else if (!esNumero(e.impuestos)) motivos.utilidad_neta = "impuestos no registrados (no se asumen en cero)";
  else utilidad_neta = utilidad_operativa + e.otros - e.impuestos;

  return { ...base, valor: { utilidad_bruta, utilidad_operativa, utilidad_neta, remuneracion_propietario_considerada: conRemuneracion, motivos } };
}

// ─── Comparabilidad ──────────────────────────────────────────────────────────────────────────────

export type Cifra = {
  clave: string;
  valor: number;
  periodo: string;
  moneda?: Moneda;
  /** Claves de las partes que esta cifra ya contiene (un total declara sus componentes). */
  incluye?: string[];
};

/**
 * Dos cifras solo se suman o se comparan si comparten periodo y moneda y no se superponen.
 * La superposición se detecta por declaración (`incluye`) y, a falta de ella, por el nombre:
 * `total_ventas` o `ventas_total` contiene a cualquier `ventas_*`. Se dice cuál regla aplicó.
 */
export function comparables(a: Cifra, b: Cifra): { ok: boolean; motivo: string } {
  if (a.periodo !== b.periodo) return { ok: false, motivo: `periodos distintos (${a.periodo} y ${b.periodo})` };
  const ma = a.moneda ?? "PEN";
  const mb = b.moneda ?? "PEN";
  if (ma !== mb) return { ok: false, motivo: `monedas distintas (${ma} y ${mb})` };
  if (a.clave === b.clave) return { ok: false, motivo: `es la misma cifra (${a.clave}) dos veces: sumarla la duplica` };
  if (a.incluye?.includes(b.clave)) return { ok: false, motivo: `${a.clave} ya contiene a ${b.clave}` };
  if (b.incluye?.includes(a.clave)) return { ok: false, motivo: `${b.clave} ya contiene a ${a.clave}` };
  const raizTotal = (clave: string) => /^total_(.+)$/.exec(clave)?.[1] ?? /^(.+)_total$/.exec(clave)?.[1] ?? null;
  for (const [t, p] of [[a, b], [b, a]] as const) {
    const raiz = raizTotal(t.clave);
    if (raiz && (p.clave === raiz || p.clave.startsWith(`${raiz}_`))) return { ok: false, motivo: `${t.clave} es un total que, por su nombre, contiene a ${p.clave}` };
  }
  return { ok: true, motivo: "mismo periodo, misma moneda y sin superposición" };
}

// ─── Para mostrarlo ──────────────────────────────────────────────────────────────────────────────

/** Las líneas del detalle desplegable que acompaña a cada cifra en pantalla. Sin jerga nueva. */
export function explicarCalculo(c: Calculo<unknown>): { etiqueta: string; texto: string }[] {
  const lineas: { etiqueta: string; texto: string }[] = [];
  if (c.valor == null && c.motivo_nulo) lineas.push({ etiqueta: "Por qué no hay cifra", texto: c.motivo_nulo });
  lineas.push({ etiqueta: "Cómo se calcula", texto: c.formula });
  lineas.push({ etiqueta: "Periodo", texto: c.periodo });
  lineas.push({ etiqueta: "De dónde salen los números", texto: c.fuentes.length ? c.fuentes.join("; ") : "sin fuentes registradas" });
  if (c.supuestos.length) lineas.push({ etiqueta: "Lo que se asume", texto: c.supuestos.join(" ") });
  if (c.limitaciones.length) lineas.push({ etiqueta: "Lo que no dice", texto: c.limitaciones.join(" ") });
  return lineas;
}
