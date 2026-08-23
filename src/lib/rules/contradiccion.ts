/**
 * Candidatas a contradicción y brechas estratégicas. Capítulo 8.1. Sin IA.
 * El modelo solo juzga los pares que estas reglas proponen.
 */

export type ClaimC = {
  id: string;
  texto: string;
  tipo: string | null;
  temporalidad: string | null;
  estado: string;
  source_id: string;
  participant_id: string | null;
  contradice_a: string | null;
};

export type Par = { a: ClaimC; b: ClaimC };

function clavePar(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Mismo tipo, ambas actuales, distinta fuente o autor, ninguna ya resuelta → candidatas. */
export function candidatasAContradiccion(claims: ClaimC[], yaJuzgadas: Set<string> = new Set()): Par[] {
  const porTipo = new Map<string, ClaimC[]>();
  for (const c of claims) {
    if (!c.tipo || c.tipo === "otro") continue;
    if (c.temporalidad !== "actual") continue;
    if (c.estado === "caducado") continue;
    const l = porTipo.get(c.tipo) ?? [];
    l.push(c);
    porTipo.set(c.tipo, l);
  }
  const pares: Par[] = [];
  for (const lista of porTipo.values()) {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i], b = lista[j];
        const distintaFuente = a.source_id !== b.source_id || (a.participant_id ?? "") !== (b.participant_id ?? "");
        if (!distintaFuente) continue;
        if (a.contradice_a === b.id || b.contradice_a === a.id) continue;
        const k = clavePar(a.id, b.id);
        if (yaJuzgadas.has(k)) continue;
        pares.push({ a, b });
      }
    }
  }
  // tope por corrida para no disparar cientos de llamadas
  return pares.slice(0, 60);
}

/** `aspiracional` sin ninguna `actual` del mismo tipo → brecha estratégica (no es contradicción). */
export function brechasEstrategicas(claims: ClaimC[]): ClaimC[] {
  const tiposActuales = new Set(claims.filter((c) => c.temporalidad === "actual").map((c) => c.tipo));
  return claims.filter((c) => c.temporalidad === "aspiracional" && c.tipo && !tiposActuales.has(c.tipo));
}

export { clavePar };
