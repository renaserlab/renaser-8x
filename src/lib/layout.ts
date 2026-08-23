import dagre from "@dagrejs/dagre";

export type NodoLayout = { id: string; tipo: string };
export type EdgeLayout = { origen: string; destino: string };

export const TAMANO: Record<string, { w: number; h: number }> = {
  inicio: { w: 56, h: 56 },
  fin: { w: 64, h: 64 },
  decision: { w: 160, h: 96 },
  espera: { w: 200, h: 72 },
  actividad: { w: 220, h: 80 },
};

/** Posiciones (esquina superior izquierda) para nodos sin posición. Capítulo 15.5. */
export function autoLayout(nodos: NodoLayout[], edges: EdgeLayout[], direccion: "LR" | "TB" = "LR"): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direccion, nodesep: 48, ranksep: 96, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodos) {
    const t = TAMANO[n.tipo] ?? TAMANO.actividad;
    g.setNode(n.id, { width: t.w, height: t.h });
  }
  for (const e of edges) if (g.hasNode(e.origen) && g.hasNode(e.destino)) g.setEdge(e.origen, e.destino);
  dagre.layout(g);
  const out = new Map<string, { x: number; y: number }>();
  for (const n of nodos) {
    const p = g.node(n.id);
    const t = TAMANO[n.tipo] ?? TAMANO.actividad;
    out.set(n.id, { x: Math.round(p.x - t.w / 2), y: Math.round(p.y - t.h / 2) });
  }
  return out;
}
