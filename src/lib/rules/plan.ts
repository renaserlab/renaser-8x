/** Regla del plan: máximo 3 frentes abiertos en cualquier semana. Capítulo 13. Sin IA. */

export type Frente = { prioridad: number; semana_inicio: number; semana_cierre: number; finding_id: string };
export const SEMANAS = 7;
export const MAX_ABIERTOS = 3;

/** Programa los frentes respetando el tope; corre hacia adelante los que no caben. Conserva orden por prioridad. */
export function programarFrentes<T extends Frente>(frentes: T[], validos?: Set<string>): (T & { semana_inicio: number; semana_cierre: number })[] {
  const abiertos = Array(SEMANAS + 1).fill(0);
  const lista = [...frentes].filter((f) => !validos || validos.has(f.finding_id)).sort((a, b) => a.prioridad - b.prioridad);
  const out: (T & { semana_inicio: number; semana_cierre: number })[] = [];
  for (const f of lista) {
    let s = Math.max(1, f.semana_inicio);
    const dur = Math.max(0, f.semana_cierre - f.semana_inicio);
    while (s <= SEMANAS) {
      let cabe = true;
      for (let w = s; w <= Math.min(s + dur, SEMANAS); w++) if (abiertos[w] >= MAX_ABIERTOS) cabe = false;
      if (cabe) break;
      s++;
    }
    if (s > SEMANAS) s = SEMANAS; // no cabe: queda en la última semana y se verá en la alerta
    const c = Math.min(s + dur, SEMANAS);
    for (let w = s; w <= c; w++) abiertos[w]++;
    out.push({ ...f, semana_inicio: s, semana_cierre: c });
  }
  return out;
}

export function abiertosPorSemana(frentes: { semana_inicio: number; semana_cierre: number }[]): number[] {
  const a = Array(SEMANAS + 1).fill(0);
  for (const f of frentes) for (let w = f.semana_inicio; w <= f.semana_cierre; w++) if (w >= 1 && w <= SEMANAS) a[w]++;
  return a.slice(1);
}

export function respetaTope(frentes: { semana_inicio: number; semana_cierre: number }[]): boolean {
  return abiertosPorSemana(frentes).every((n) => n <= MAX_ABIERTOS);
}

/** Las dos primeras semanas solo llevan restricciones críticas. */
export function primerasSemanasSoloCriticos(frentes: { semana_inicio: number; impacto: string }[]): boolean {
  return frentes.filter((f) => f.semana_inicio <= 2).every((f) => f.impacto === "alto");
}
