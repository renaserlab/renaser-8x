import { VITALES, VITAL_POR_CLAVE, derivados, normalizarMetrica, CLAVES_VITALES, type Metrica, type Vital } from "./metricas";

/**
 * LA LÍNEA BASE Y LOS CORTES — cómo se responde "¿funcionó lo que hicimos?".
 *
 * Hasta hoy no se podía: el diagnóstico era una foto única y los cortes guardaban sus indicadores
 * como texto libre, sin conexión con los números. Una medición es una foto congelada de los nueve
 * vitales con su fecha; la primera es el "antes" y cada corte es un "después" que se compara contra
 * ella. Los derivados se congelan también, para que la historia siga siendo honesta aunque mañana
 * cambie la fórmula.
 */
export type Medicion = {
  id: string;
  tipo: "linea_base" | "corte";
  numero: number;
  fecha: string;
  valores: Record<string, number | null>;
  derivados: Record<string, number | null>;
  nota: string | null;
};

export type Movimiento = {
  vital: Vital;
  antes: number | null;
  despues: number | null;
  /** Diferencia absoluta. null si falta cualquiera de los dos extremos. */
  delta: number | null;
  /** Variación porcentual. null si el punto de partida era cero: de cero no se calcula un porcentaje. */
  deltaPct: number | null;
  /** true mejoró, false empeoró, null no se puede juzgar (sin dato, o es un número neutro). */
  mejoro: boolean | null;
  /** Lo que se le dice al dueño, en su idioma. */
  frase: string;
};

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

function comoTexto(v: Vital, n: number): string {
  if (v.unidad === "de_cada_10") return `${Math.round(n)} de cada 10`;
  if (v.unidad === "dias") return `${Math.round(n)} días`;
  return soles(n);
}

/** Toma los vitales de hoy tal como están en company_metricas, listos para congelar. */
export function valoresActuales(metricas: Metrica[]): Record<string, number | null> {
  const ES_MES = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
  const salida: Record<string, number | null> = {};
  for (const clave of CLAVES_VITALES) {
    const candidatos = metricas
      .map((m) => ({ n: normalizarMetrica(m.clave, m.periodo), valor: m.valor }))
      .filter((c) => c.n.clave === clave && c.n.periodo !== "epoca_dorada" && c.valor != null);
    // El mes más reciente manda; "actual" solo si no hay ningún mes fechado.
    const conMes = candidatos.filter((c) => ES_MES.test(c.n.periodo)).sort((a, b) => b.n.periodo.localeCompare(a.n.periodo));
    const elegido = (conMes[0] ?? candidatos[0])?.valor;
    if (elegido != null) salida[clave] = Number(elegido);
  }
  return salida;
}

/** Los derivados que se congelan junto a los valores. */
export function derivadosActuales(metricas: Metrica[]): Record<string, number | null> {
  const d = derivados(metricas);
  return { margen: d.margen, margenUnitario: d.margenUnitario, equilibrio: d.equilibrio, diasAguante: d.diasAguante };
}

/**
 * Qué se movió entre dos mediciones. Solo devuelve los vitales que existen en alguna de las dos:
 * los que nunca se midieron no son un retroceso, son un vacío, y decirlo de otro modo sería mentir.
 */
export function comparar(base: Medicion | null, corte: Medicion | null): Movimiento[] {
  if (!base || !corte) return [];
  const salida: Movimiento[] = [];

  for (const vital of VITALES) {
    const antes = base.valores[vital.clave] ?? null;
    const despues = corte.valores[vital.clave] ?? null;
    if (antes == null && despues == null) continue;

    const delta = antes != null && despues != null ? despues - antes : null;
    // De cero no sale un porcentaje: mostrar "infinito %" sería ruido, no información.
    const deltaPct = delta != null && antes != null && antes !== 0 ? (delta / Math.abs(antes)) * 100 : null;

    let mejoro: boolean | null = null;
    if (delta != null && delta !== 0 && vital.mejorSi !== "neutro") mejoro = vital.mejorSi === "sube" ? delta > 0 : delta < 0;

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

    salida.push({ vital, antes, despues, delta, deltaPct, mejoro, frase });
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
};

/** El resumen de un corte contra la línea base. Es lo primero que ve el dueño. */
export function veredicto(base: Medicion | null, corte: Medicion | null, movimientos: Movimiento[]): Veredicto {
  const mejoraron = movimientos.filter((m) => m.mejoro === true).length;
  const empeoraron = movimientos.filter((m) => m.mejoro === false).length;
  const sinCambio = movimientos.filter((m) => m.delta === 0).length;

  const g = movimientos.find((m) => m.vital.clave === "ganancia_mes");
  const gananciaDelta = g?.delta ?? null;

  const dias = base && corte ? Math.round((new Date(corte.fecha).getTime() - new Date(base.fecha).getTime()) / 86_400_000) : null;

  let titular: string;
  if (!base || !corte) titular = "Todavía no hay con qué comparar.";
  else if (movimientos.length === 0) titular = "No se midió ningún número en común: no se puede decir si mejoró o no.";
  else if (gananciaDelta != null && gananciaDelta > 0)
    titular = `El negocio deja ${soles(gananciaDelta)} más al mes que cuando empezamos.`;
  else if (gananciaDelta != null && gananciaDelta < 0)
    titular = `El negocio deja ${soles(Math.abs(gananciaDelta))} menos al mes que cuando empezamos.`;
  else if (mejoraron > empeoraron) titular = `Mejoraron ${mejoraron} de ${movimientos.length} números.`;
  else if (empeoraron > mejoraron) titular = `Empeoraron ${empeoraron} de ${movimientos.length} números.`;
  else titular = "El negocio está parejo respecto al punto de partida.";

  return { mejoraron, empeoraron, sinCambio, gananciaDelta, titular, dias };
}

/** Nombre corto de una medición para mostrarla. */
export function nombreMedicion(m: Medicion): string {
  return m.tipo === "linea_base" ? "Punto de partida" : `Corte ${m.numero}`;
}

export { VITAL_POR_CLAVE };
