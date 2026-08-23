/**
 * Reglas mecánicas de vigencia. Capítulo 8.1. Sin IA.
 * La edad NUNCA caduca nada por sí sola: solo dispara prioridad de validación.
 */

export type ClaimMin = {
  id: string;
  tipo: string | null;
  temporalidad: string | null;
  estado: string;
  fecha_afirmacion: string | null;
  source_tipo?: string | null;
  created_at?: string;
};

/** Vida útil orientativa por tipo, en meses. null = casi nunca caduca. */
export const VIDA_UTIL_MESES: Record<string, number | null> = {
  precio: 3,
  canal: 6,
  kpi: 6,
  meta: 12,
  cliente: 12,
  proceso: 18,
  rol: 18,
  producto: 18,
  politica: 36,
  vision: 60,
  proposito: null,
  otro: 24,
};

/** Fuentes que deberían traer fecha: documento, foto de documento, dato. Una entrevista tiene la fecha de hoy. */
export const FUENTES_FECHABLES = new Set(["documento", "foto", "dato"]);

export const TIPOS_CRITICOS = ["vision", "proposito", "proceso", "cliente", "precio", "rol"];

export function mesesDesde(fechaISO: string, hoy = new Date()): number {
  const f = new Date(fechaISO);
  return (hoy.getFullYear() - f.getFullYear()) * 12 + (hoy.getMonth() - f.getMonth());
}

/** ¿Debe pedirse validación prioritaria? (no cambia el estado) */
export function requiereValidacionPrioritaria(c: ClaimMin, hoy = new Date()): boolean {
  if (c.estado !== "sin_verificar") return false;
  // Fecha nula y fuente tipo documento → validación prioritaria
  if (!c.fecha_afirmacion && FUENTES_FECHABLES.has(c.source_tipo ?? "")) return true;
  if (!c.fecha_afirmacion || !c.tipo) return false;
  // BUG corregido en auditoría: `null ?? 24` convertía "nunca caduca" en 24 meses.
  const vida = c.tipo in VIDA_UTIL_MESES ? VIDA_UTIL_MESES[c.tipo] : 24;
  if (vida === null) return false;
  return mesesDesde(c.fecha_afirmacion, hoy) > vida;
}

/** Texto de la pregunta de validación que genera una afirmación antigua. Capítulo 7.6. */
export function preguntaDeVigencia(texto: string, fuente: string, fecha: string | null): string {
  const cuando = fecha ? `, de ${new Date(fecha).toLocaleDateString("es-PE", { month: "long", year: "numeric" })}` : "";
  return `Encontré esto en ${fuente}${cuando}: "${texto}". ¿Sigue representando lo que quieres construir hoy?`;
}
