/**
 * Validación estructural de flujogramas. Capítulo 15 y 12.
 * NOTA DE AUDITORÍA: esta regla no existía en el código; se agrega para poder probar el modelo.
 * Todavía NO está conectada al guardado (PUT /api/processes/[id]) ni al ARQUITECTO. Ver RIESGOS (P1).
 */

export type NodoG = { id: string; tipo: "inicio" | "actividad" | "decision" | "espera" | "fin"; etiqueta: string; veredicto?: string | null; ejecutor?: string | null };
export type EdgeG = { de: string; a: string; etiqueta?: string | null };
export type Flujo = { nodos: NodoG[]; conexiones: EdgeG[] };

export type Problema = { codigo: string; nodo?: string; mensaje: string };

const FINAL_MALO = /perd|pierd|se va|abandon|cancel|rechaz|no compra|fall|devol|reclam/i;

export function validarFlujograma(f: Flujo): { valido: boolean; problemas: Problema[] } {
  const p: Problema[] = [];
  const ids = new Set(f.nodos.map((n) => n.id));
  const salidas = new Map<string, EdgeG[]>();
  const entradas = new Map<string, EdgeG[]>();
  for (const e of f.conexiones) {
    if (!ids.has(e.de) || !ids.has(e.a)) {
      p.push({ codigo: "conexion_huerfana", mensaje: `Conexión ${e.de}→${e.a} apunta a un nodo inexistente` });
      continue;
    }
    salidas.set(e.de, [...(salidas.get(e.de) ?? []), e]);
    entradas.set(e.a, [...(entradas.get(e.a) ?? []), e]);
  }
  const inicios = f.nodos.filter((n) => n.tipo === "inicio");
  const fines = f.nodos.filter((n) => n.tipo === "fin");
  if (inicios.length === 0) p.push({ codigo: "sin_inicio", mensaje: "No hay nodo de inicio" });
  if (fines.length === 0) p.push({ codigo: "sin_fin", mensaje: "No hay ningún nodo fin: el proceso no termina" });

  for (const n of f.nodos) {
    const out = salidas.get(n.id) ?? [];
    const inn = entradas.get(n.id) ?? [];
    if (n.tipo === "decision") {
      if (out.length < 2) p.push({ codigo: "decision_una_salida", nodo: n.id, mensaje: `La decisión "${n.etiqueta}" tiene ${out.length} salida(s); necesita al menos dos` });
      if (out.some((e) => !e.etiqueta)) p.push({ codigo: "salida_sin_etiqueta", nodo: n.id, mensaje: `Una salida de "${n.etiqueta}" no dice cuándo se toma` });
    }
    if (n.tipo !== "fin" && out.length === 0) p.push({ codigo: "camino_sin_fin", nodo: n.id, mensaje: `"${n.etiqueta}" no lleva a ningún lado` });
    if (n.tipo !== "inicio" && inn.length === 0) p.push({ codigo: "nodo_inalcanzable", nodo: n.id, mensaje: `"${n.etiqueta}" no es alcanzable desde el inicio` });
    if (n.tipo === "fin" && out.length > 0) p.push({ codigo: "fin_con_salida", nodo: n.id, mensaje: `El fin "${n.etiqueta}" tiene salidas` });
  }
  // Alcance desde inicio
  const visitados = new Set<string>();
  const cola = inicios.map((n) => n.id);
  while (cola.length) {
    const x = cola.pop()!;
    if (visitados.has(x)) continue;
    visitados.add(x);
    for (const e of salidas.get(x) ?? []) cola.push(e.a);
  }
  for (const n of f.nodos) if (!visitados.has(n.id) && n.tipo !== "inicio" && !p.some((q) => q.nodo === n.id && q.codigo === "nodo_inalcanzable")) p.push({ codigo: "nodo_inalcanzable", nodo: n.id, mensaje: `"${n.etiqueta}" no es alcanzable desde el inicio` });

  return { valido: p.length === 0, problemas: p };
}

/** Un flujograma donde todo termina bien no diagnostica nada. Capítulo 15.2. */
export function tieneFinalMalo(f: Flujo): boolean {
  return f.nodos.some((n) => n.tipo === "fin" && FINAL_MALO.test(n.etiqueta));
}

/** Un nodo `remove` con consumidores aguas abajo no se elimina sin revisar. Capítulo 12. */
export function removeConDependientes(f: Flujo): { nodo: string; dependientes: string[] }[] {
  const out: { nodo: string; dependientes: string[] }[] = [];
  for (const n of f.nodos.filter((x) => x.veredicto === "remove")) {
    const dep = f.conexiones.filter((e) => e.de === n.id).map((e) => e.a).filter((id) => f.nodos.find((x) => x.id === id)?.veredicto !== "remove");
    if (dep.length) out.push({ nodo: n.id, dependientes: dep });
  }
  return out;
}

/** Un paso `remove` nunca se automatiza; un paso sin definir tampoco. Capítulo 12. */
export function automatizacionesInvalidas(f: Flujo): NodoG[] {
  return f.nodos.filter((n) => (n.ejecutor === "ia" || n.ejecutor === "software") && (n.veredicto === "remove" || n.etiqueta.trim().startsWith("?")));
}

/** Relación AS-IS → TO-BE: lo que desaparece, lo que aparece, lo que se conserva (por etiqueta normalizada). */
export function diffAsIsToBe(asis: Flujo, tobe: Flujo) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const a = new Map(asis.nodos.map((n) => [norm(n.etiqueta), n]));
  const b = new Map(tobe.nodos.map((n) => [norm(n.etiqueta), n]));
  const eliminados = [...a.values()].filter((n) => !b.has(norm(n.etiqueta)));
  const creados = [...b.values()].filter((n) => !a.has(norm(n.etiqueta)));
  const conservados = [...b.values()].filter((n) => a.has(norm(n.etiqueta)));
  const removeNoEliminado = [...a.values()].filter((n) => n.veredicto === "remove" && b.has(norm(n.etiqueta)));
  const createSinMarca = creados.filter((n) => n.veredicto !== "create");
  return { eliminados, creados, conservados, removeNoEliminado, createSinMarca };
}
