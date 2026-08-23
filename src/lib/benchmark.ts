/**
 * Benchmark del sistema (fase 12). Set congelado en /benchmark/esperado.json; métricas puras.
 * Cada cambio de prompt se evalúa contra esto; nada se aprueba porque "suena mejor".
 */

export type HallazgoEsperado = { clave: string; patron?: string | null; pilar: string; palabras: string[]; impacto?: "alto" | "medio" | "bajo"; preserva?: boolean; causa_palabras?: string[] };
export type HallazgoObtenido = { titulo: string; causa_raiz?: string | null; pilar: string; patron?: string | null; impacto?: string | null; preserva?: boolean; claim_ids?: string[] };
export type ContradiccionEsperada = { a: string; b: string };
export type PreguntaEsperada = { clave: string; palabras: string[] };

export type Esperado = {
  hallazgos: HallazgoEsperado[];
  contradicciones: ContradiccionEsperada[];
  preguntas_minimas: PreguntaEsperada[];
  fortalezas: string[]; // claves de hallazgos que deben venir con preserva
  falsos_positivos_prohibidos: string[][]; // listas de palabras: si un hallazgo las contiene, es invento
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const contiene = (texto: string, palabras: string[]) => palabras.every((p) => norm(texto).includes(norm(p)));

export function emparejar(esperado: HallazgoEsperado, obtenidos: HallazgoObtenido[]): HallazgoObtenido | null {
  return obtenidos.find((o) => (o.patron && esperado.patron && o.patron === esperado.patron) || contiene(`${o.titulo} ${o.causa_raiz ?? ""}`, esperado.palabras)) ?? null;
}

export type Metricas = {
  cobertura: number; // esperados encontrados / esperados
  precision: number; // obtenidos que corresponden a algo esperado / obtenidos
  falsos_positivos: number;
  causa_raiz: number; // de los encontrados, cuántos llegan a la causa esperada
  preservacion: number; // fortalezas reconocidas / fortalezas esperadas
  contradicciones: number; // esperadas detectadas / esperadas
  preguntas: number; // preguntas mínimas formuladas / esperadas
  omisiones: string[];
  inventados: string[];
};

export function medir(esperado: Esperado, obtenidos: HallazgoObtenido[], contradiccionesDetectadas: { a: string; b: string }[], preguntasFormuladas: string[]): Metricas {
  const encontrados = esperado.hallazgos.map((e) => ({ e, o: emparejar(e, obtenidos) }));
  const omisiones = encontrados.filter((x) => !x.o).map((x) => x.e.clave);
  const emparejados = new Set(encontrados.filter((x) => x.o).map((x) => x.o!));
  const inventados = obtenidos.filter((o) => !emparejados.has(o) && esperado.falsos_positivos_prohibidos.some((pal) => contiene(`${o.titulo} ${o.causa_raiz ?? ""}`, pal))).map((o) => o.titulo);
  const noEsperados = obtenidos.filter((o) => !emparejados.has(o)).length;
  const conCausa = encontrados.filter((x) => x.o && (!x.e.causa_palabras || contiene(x.o.causa_raiz ?? "", x.e.causa_palabras))).length;
  const fort = esperado.fortalezas.map((clave) => encontrados.find((x) => x.e.clave === clave)?.o).filter((o) => o && o.preserva).length;
  const contr = esperado.contradicciones.filter((c) => contradiccionesDetectadas.some((d) => (d.a === c.a && d.b === c.b) || (d.a === c.b && d.b === c.a))).length;
  const preg = esperado.preguntas_minimas.filter((p) => preguntasFormuladas.some((q) => contiene(q, p.palabras))).length;
  const div = (a: number, b: number) => (b ? +(a / b).toFixed(3) : 0);
  return {
    cobertura: div(encontrados.length - omisiones.length, esperado.hallazgos.length),
    precision: div(obtenidos.length - noEsperados, obtenidos.length),
    falsos_positivos: inventados.length,
    causa_raiz: div(conCausa, encontrados.length - omisiones.length),
    preservacion: div(fort, esperado.fortalezas.length),
    contradicciones: div(contr, esperado.contradicciones.length),
    preguntas: div(preg, esperado.preguntas_minimas.length),
    omisiones,
    inventados,
  };
}

/** Umbrales de aprobación de un cambio de prompt (capítulo 39: N1 precisión > 80 %; N3 cobertura > 85 %). */
export const UMBRALES = { cobertura: 0.85, precision: 0.8, falsos_positivos: 0, causa_raiz: 0.7, preservacion: 1, contradicciones: 1 };

export function aprueba(m: Metricas): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (m.cobertura < UMBRALES.cobertura) motivos.push(`cobertura ${m.cobertura} < ${UMBRALES.cobertura}: omite ${m.omisiones.join(", ")}`);
  if (m.precision < UMBRALES.precision) motivos.push(`precisión ${m.precision} < ${UMBRALES.precision}`);
  if (m.falsos_positivos > UMBRALES.falsos_positivos) motivos.push(`falsos positivos: ${m.inventados.join(" | ")}`);
  if (m.causa_raiz < UMBRALES.causa_raiz) motivos.push(`causa raíz ${m.causa_raiz} < ${UMBRALES.causa_raiz}`);
  if (m.preservacion < UMBRALES.preservacion) motivos.push(`no reconoció todas las fortalezas`);
  if (m.contradicciones < UMBRALES.contradicciones) motivos.push(`no detectó todas las contradicciones`);
  return { ok: motivos.length === 0, motivos };
}
