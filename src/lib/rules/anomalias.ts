/**
 * Sistema Adaptativo v2 — reglas de anomalía sobre las métricas contadas.
 * Todo cálculo sale de datos que la empresa dijo o mostró: el sistema NUNCA inventa un número.
 * La ausencia de dato es un hallazgo (restricción de información), nunca una falta del dueño.
 */

export type Metrica = { clave: string; periodo: string; valor: number | null; valor_texto?: string | null; estado: string; nota?: string | null };
export type Senal = { regla: string; titulo: string; detalle: string };

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/** Serie mensual de una clave, ordenada por periodo (YYYY-MM). */
function serie(metricas: Metrica[], clave: string): { periodo: string; valor: number }[] {
  return metricas
    .filter((m) => m.clave === clave && m.valor != null && /^\d{4}-\d{2}$/.test(m.periodo))
    .map((m) => ({ periodo: m.periodo, valor: Number(m.valor) }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
}

function unica(metricas: Metrica[], clave: string, periodo?: string): Metrica | undefined {
  return metricas.find((m) => m.clave === clave && (periodo ? m.periodo === periodo : true) && m.valor != null);
}

/**
 * Aplica las reglas de anomalía computables sobre las métricas.
 * Devuelve señales con el dato citado — listas para el contexto del diagnosticador y del entrevistador.
 */
export function detectarAnomalias(metricas: Metrica[]): Senal[] {
  const s: Senal[] = [];
  const ventas = serie(metricas, "venta_mes");
  const cobrados = serie(metricas, "cobrado_mes");
  const ganancias = serie(metricas, "ganancia_mes");

  // Regla 3 — ganancia sube o se mantiene, caja baja: lo vendido no se cobra.
  for (const v of ventas) {
    const c = cobrados.find((x) => x.periodo === v.periodo);
    if (c && v.valor > 0 && c.valor < v.valor * 0.85) {
      s.push({
        regla: "caja",
        titulo: "Se vende más de lo que se cobra",
        detalle: `En ${v.periodo} vendió ${soles(v.valor)} pero cobró ${soles(c.valor)} (${Math.round((1 - c.valor / v.valor) * 100)}% quedó sin cobrar). Investigar cobranza, fiados y plazos antes que ventas.`,
      });
      break; // una señal por patrón basta; el detalle mensual vive en la tabla
    }
  }

  // Volatilidad — el mejor mes dobla al peor: estacionalidad, campañas o dependencia de alguien.
  if (ventas.length >= 3) {
    const max = ventas.reduce((a, b) => (b.valor > a.valor ? b : a));
    const min = ventas.reduce((a, b) => (b.valor < a.valor ? b : a));
    if (min.valor > 0 && max.valor >= min.valor * 2) {
      s.push({
        regla: "volatilidad",
        titulo: "Ventas muy dispares entre meses",
        detalle: `El mejor mes (${max.periodo}: ${soles(max.valor)}) más que dobló al peor (${min.periodo}: ${soles(min.valor)}). Preguntar qué pasó distinto en cada uno: campaña, temporada, una persona, un cliente grande.`,
      });
    }
  }

  // Tendencia — los últimos meses caen sostenidamente.
  if (ventas.length >= 4) {
    const ult = ventas.slice(-3);
    if (ult.every((v, i) => i === 0 || v.valor < ult[i - 1].valor) && ventas[ventas.length - 1].valor < ventas[0].valor * 0.8) {
      s.push({ regla: "tendencia", titulo: "La venta viene cayendo", detalle: `Tres meses seguidos a la baja (${ult.map((v) => `${v.periodo}: ${soles(v.valor)}`).join(" → ")}). Buscar el quiebre: qué cambió o qué se dejó de hacer.` });
    }
  }

  // Margen — queda muy poco después de pagar todo.
  for (const g of ganancias.slice(-1)) {
    const v = ventas.find((x) => x.periodo === g.periodo);
    if (v && v.valor > 0 && g.valor >= 0 && g.valor < v.valor * 0.05) {
      s.push({ regla: "margen", titulo: "Queda muy poco de lo que se vende", detalle: `En ${g.periodo} vendió ${soles(v.valor)} y quedaron ${soles(g.valor)} (${Math.round((g.valor / v.valor) * 100)}%). Investigar precio, costos, fiados perdidos y mezcla de productos.` });
    }
  }

  // Regla 9 — el pasado supera al presente: arqueología del pico.
  const dorada = unica(metricas, "venta_mes", "epoca_dorada") ?? unica(metricas, "venta_epoca_dorada");
  if (dorada?.valor != null && ventas.length) {
    const actual = ventas[ventas.length - 1];
    if (Number(dorada.valor) > actual.valor * 1.25) {
      s.push({
        regla: "epoca_dorada",
        titulo: "Antes vendía más que hoy",
        detalle: `En su mejor época vendía ${soles(Number(dorada.valor))} al mes${dorada.valor_texto ? ` (${dorada.valor_texto})` : ""}; hoy ${soles(actual.valor)}. La receta ya existió: reconstruir qué se hacía entonces, qué se dejó de hacer y qué clientes de esa época nadie volvió a buscar. Toda hipótesis de "falta marketing nuevo" queda en sospecha hasta revisar lo probado que se abandonó.`,
      });
    }
  }

  // Regla 10 — sin dato en punto crítico: la falta de registro ES el hallazgo.
  const sinDato = metricas.filter((m) => m.estado === "sin_dato");
  for (const m of sinDato.slice(0, 4)) {
    s.push({ regla: "sin_registro", titulo: `No hay dónde ver: ${m.clave.replace(/_/g, " ")}`, detalle: `${m.nota ?? "La empresa no pudo responderlo y no existe registro donde verificarlo."} Restricción de información: proponer el registro mínimo como parte del plan. Nunca es una falta del dueño.`.trim() });
  }

  return s;
}

/** Resumen de la tabla de resultados para el contexto de los agentes: qué meses hay y qué falta. */
export function tablaResultadosComoTexto(metricas: Metrica[]): string {
  const meses = [...new Set(metricas.filter((m) => /^\d{4}-\d{2}$/.test(m.periodo)).map((m) => m.periodo))].sort();
  if (!meses.length) return "(sin meses contados todavía — la tabla de 6 meses se llena conversando, un mes por pregunta, empezando por el más reciente)";
  const fila = (p: string) => {
    const v = (c: string) => {
      const m = metricas.find((x) => x.clave === c && x.periodo === p);
      return m?.valor != null ? `${soles(Number(m.valor))} [${m.estado}]` : "—";
    };
    return `- ${p}: vendido ${v("venta_mes")} · cobrado ${v("cobrado_mes")} · quedó ${v("ganancia_mes")}`;
  };
  const dorada = metricas.find((m) => (m.clave === "venta_mes" && m.periodo === "epoca_dorada") || m.clave === "venta_epoca_dorada");
  return [
    ...meses.map(fila),
    dorada?.valor != null ? `- época dorada: vendía ${soles(Number(dorada.valor))} al mes${dorada.valor_texto ? ` (${dorada.valor_texto})` : ""}` : null,
    `Faltan por contar: los meses sin dato de los últimos 6. Pregunta UNO a la vez, el más reciente primero, con anclas de calendario.`,
  ].filter(Boolean).join("\n");
}
