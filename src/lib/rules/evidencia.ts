/**
 * Reglas de evidencia para hallazgos. Capítulo 11 y 1.11. Sin IA.
 * Fuerza de fuente: STRONG / MEDIUM / WEAK. Un hallazgo ALTO exige dos fuentes independientes o una STRONG.
 * Si no alcanza → NEEDS_VALIDATION (columna findings.requiere_validacion).
 */

export type ClaimEvidencia = {
  id: string;
  source_id: string;
  participant_id: string | null;
  estado: string;
  source_tipo?: string | null; // 'documento' | 'foto' | 'audio' | 'entrevista' | 'dato' | 'observacion'
  source_origen?: string | null; // 'cliente' | 'consultor'
  participant_rol?: string | null;
};

export type Impacto = "alto" | "medio" | "bajo";
export type Fuerza = "strong" | "medium" | "weak";
export type ResultadoFiltro = { resultado: "pasa" | "no_pasa"; nota: string };
export type Filtros = { proposito: ResultadoFiltro; sabiduria: ResultadoFiltro; excelencia: ResultadoFiltro };

/**
 * Fuerza de una fuente:
 *  strong — dato operativo/transaccional; observación directa del consultor (gemba).
 *  medium — documento o foto de documento vigente; entrevista del dueño o de un líder.
 *  weak   — nota/observación escrita por el cliente sobre sí mismo; entrevista de una sola persona de primera línea sin respaldo; fuente sin fecha.
 */
export function fuerzaFuente(c: Pick<ClaimEvidencia, "source_tipo" | "source_origen" | "participant_rol">): Fuerza {
  if (c.source_tipo === "dato") return "strong";
  if (c.source_tipo === "observacion") return c.source_origen === "consultor" ? "strong" : "weak";
  if (c.source_tipo === "documento" || c.source_tipo === "foto") return "medium";
  if (c.source_tipo === "entrevista" || c.source_tipo === "audio") return c.participant_rol === "empleado" || !c.participant_rol ? "weak" : "medium";
  return "weak";
}

/** Identidad de fuente independiente: una persona distinta o un documento distinto. */
export function fuentesIndependientes(claims: ClaimEvidencia[]): number {
  return new Set(claims.map((c) => c.participant_id ?? c.source_id)).size;
}

export function tieneFuenteObjetiva(claims: ClaimEvidencia[]): boolean {
  return claims.some((c) => fuerzaFuente(c) === "strong");
}

export type Calibracion = { impacto: Impacto; requiere_validacion: boolean; motivo: string | null; fuerza_maxima: Fuerza; fuentes: number };

/**
 * Impacto permitido según la evidencia. ALTO exige ≥2 fuentes independientes o una STRONG; si no, baja a medio y NEEDS_VALIDATION.
 * Si el AUDITOR no lo sustenta, baja a bajo y NEEDS_VALIDATION. Evidencia caducada no sostiene nada.
 */
export function calibrarImpacto(impactoPropuesto: Impacto, evidencia: ClaimEvidencia[], auditorSustenta: boolean | null): Calibracion {
  const sustento = evidencia.filter((c) => c.estado !== "caducado");
  const indep = fuentesIndependientes(sustento);
  const fuerzas = sustento.map(fuerzaFuente);
  const fuerza_maxima: Fuerza = fuerzas.includes("strong") ? "strong" : fuerzas.includes("medium") ? "medium" : "weak";
  if (auditorSustenta === false) return { impacto: "bajo", requiere_validacion: true, motivo: "El auditor no lo sustenta", fuerza_maxima, fuentes: indep };
  if (sustento.length === 0) return { impacto: "bajo", requiere_validacion: true, motivo: "Sin evidencia vigente", fuerza_maxima, fuentes: 0 };
  if (impactoPropuesto === "alto") {
    if (indep < 2 && fuerza_maxima !== "strong") return { impacto: "medio", requiere_validacion: true, motivo: `Impacto alto con ${indep} fuente(s) y ninguna fuerte`, fuerza_maxima, fuentes: indep };
  }
  return { impacto: impactoPropuesto, requiere_validacion: false, motivo: null, fuerza_maxima, fuentes: indep };
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

export type HallazgoPuntaje = { impacto: string | null; preserva?: boolean; requiere_validacion?: boolean | null };

/**
 * Puntaje 0-100 del pilar, calculado de sus hallazgos vigentes (no rechazados) — no una etiqueta disfrazada.
 * Antes sólido/mejorable/crítico se traducían a 85/60/35 fijos y toda empresa "mejorable" salía 60: un
 * número que parecía medido y no medía nada. Ahora cada hallazgo pesa: alto -20, medio -10, bajo -4;
 * a la mitad si aún espera validación (incierto no es invisible). Cada fortaleza suma 3.
 * Base 90 (sólido no es perfecto), piso 10, techo 95.
 *
 * Y el techo CRECE con la evidencia confirmada: un pilar del que casi no sabemos nada no tiene
 * derecho a lucir alto — con pocas confirmaciones se han encontrado pocos problemas porque casi
 * no se ha mirado, no porque esté bien. En el mínimo para diagnosticar (5) el techo es 65;
 * desde 11 confirmadas el techo pleno de 95. Ojo de Kelin: "¿86? es imposible si casi no tienen nada".
 */
export function puntajePilar(hallazgos: HallazgoPuntaje[], confirmadas?: number): number {
  let p = 90;
  for (const h of hallazgos) {
    if (h.preserva) {
      p += 3;
      continue;
    }
    const peso = h.impacto === "alto" ? 20 : h.impacto === "medio" ? 10 : 4;
    p -= h.requiere_validacion ? peso / 2 : peso;
  }
  const techo = confirmadas == null ? 95 : Math.min(95, 40 + 5 * confirmadas);
  return Math.round(Math.max(10, Math.min(techo, p)));
}
