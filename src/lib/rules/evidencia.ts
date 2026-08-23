/**
 * Reglas de evidencia para hallazgos. Capítulo 11. Sin IA.
 * Extraídas del handler de diagnóstico para poder probarlas.
 */

export type ClaimEvidencia = {
  id: string;
  source_id: string;
  participant_id: string | null;
  estado: string;
  source_tipo?: string | null; // 'documento' | 'foto' | 'audio' | 'entrevista' | 'dato' | 'observacion'
};

export type Impacto = "alto" | "medio" | "bajo";
export type ResultadoFiltro = { resultado: "pasa" | "no_pasa"; nota: string };
export type Filtros = { proposito: ResultadoFiltro; sabiduria: ResultadoFiltro; excelencia: ResultadoFiltro };

/** Fuentes fuertes y objetivas: datos operativos u observación directa. Una nota de seguimiento NO lo es. */
export const FUENTES_OBJETIVAS = new Set(["dato"]);

/** Identidad de fuente independiente: una persona distinta o un documento distinto. */
export function fuentesIndependientes(claims: ClaimEvidencia[]): number {
  return new Set(claims.map((c) => c.participant_id ?? c.source_id)).size;
}

export function tieneFuenteObjetiva(claims: ClaimEvidencia[]): boolean {
  return claims.some((c) => FUENTES_OBJETIVAS.has(c.source_tipo ?? ""));
}

/**
 * Impacto permitido según la evidencia. Un hallazgo ALTO exige dos fuentes independientes o una objetiva.
 * Si no alcanza, baja a medio y se marca `requiere_validacion`.
 * Si el auditor no lo sustenta, baja a bajo y también requiere validación.
 */
export function calibrarImpacto(impactoPropuesto: Impacto, evidencia: ClaimEvidencia[], auditorSustenta: boolean | null): { impacto: Impacto; requiere_validacion: boolean; motivo: string | null } {
  if (auditorSustenta === false) return { impacto: "bajo", requiere_validacion: true, motivo: "El auditor no lo sustenta" };
  const sustento = evidencia.filter((c) => c.estado !== "caducado");
  if (impactoPropuesto === "alto") {
    const indep = fuentesIndependientes(sustento);
    if (indep < 2 && !tieneFuenteObjetiva(sustento)) {
      return { impacto: "medio", requiere_validacion: true, motivo: `Impacto alto con ${indep} fuente(s) y ninguna objetiva` };
    }
  }
  return { impacto: impactoPropuesto, requiere_validacion: false, motivo: null };
}

/** Un hallazgo sin evidencia que lo sustente no existe. */
export function tieneEvidencia(claimIds: string[]): boolean {
  return claimIds.length > 0;
}

/** Los tres filtros: uno reprobado bloquea la recomendación y deja en su lugar la tensión encontrada. */
export function aplicarFiltros(filtros: Filtros, recomendacion: string | null): { bloqueada: boolean; recomendacion: string | null; tension: string | null; reprobados: string[] } {
  const reprobados = (["proposito", "sabiduria", "excelencia"] as const).filter((k) => filtros[k]?.resultado === "no_pasa");
  if (reprobados.length) return { bloqueada: true, recomendacion: null, tension: recomendacion, reprobados };
  return { bloqueada: false, recomendacion, tension: null, reprobados: [] };
}

/** Estado del pilar a partir de los impactos de sus hallazgos válidos. */
export function estadoPilar(impactos: Impacto[], confirmadas: number, minConfirmadas: number): "solido" | "mejorable" | "critico" | "desconocido" {
  if (confirmadas < minConfirmadas) return "desconocido";
  if (impactos.includes("alto")) return "critico";
  if (impactos.includes("medio")) return "mejorable";
  return "solido";
}
