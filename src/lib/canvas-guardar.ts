/**
 * Persistencia del canvas (P0-05). Algoritmo de referencia, idéntico al de la función SQL `guardar_proceso`:
 *  1. recibir nodos/edges; 2. upsert de nodos; 3. mapa tmp→uuid; 4. sustituir ids en TODOS los edges;
 *  5. validar integridad; 6. persistir edges; 7. todo o nada.
 * Esta implementación en memoria se usa en los tests; en producción la ejecuta Postgres dentro de una transacción.
 */

export type NodoEntrada = { id?: string; _tmp?: string; tipo: string; etiqueta: string; responsable?: string | null; ejecutor?: string | null; tiempo?: string | null; herramienta?: string | null; problema?: string | null; veredicto?: string | null; pos_x: number; pos_y: number };
export type EdgeEntrada = { origen: string; destino: string; etiqueta?: string | null };
export type NodoDB = { id: string; process_id: string; tipo: string; etiqueta: string; responsable: string | null; ejecutor: string | null; tiempo: string | null; herramienta: string | null; problema: string | null; veredicto: string | null; pos_x: number; pos_y: number };
export type EdgeDB = { id: string; process_id: string; origen: string; destino: string; etiqueta: string | null };

export class ErrorIntegridad extends Error {
  constructor(public detalle: string) {
    super(`conexion_invalida: ${detalle}`);
  }
}

export const TIPOS = new Set(["inicio", "actividad", "decision", "espera", "fin"]);

/** Validación previa en el servidor (antes de tocar la base): tipos válidos y referencias resolubles. */
export function validarEntrada(nodos: NodoEntrada[], edges: EdgeEntrada[], existentes: Set<string>): string[] {
  const errores: string[] = [];
  const claves = new Set<string>();
  for (const n of nodos) {
    if (!TIPOS.has(n.tipo)) errores.push(`tipo inválido: ${n.tipo}`);
    const k = n.id && existentes.has(n.id) ? n.id : n._tmp ?? n.id;
    if (!k) errores.push("nodo nuevo sin _tmp");
    else claves.add(k);
  }
  for (const e of edges) {
    if (!claves.has(e.origen)) errores.push(`conexión desde nodo desconocido: ${e.origen}`);
    if (!claves.has(e.destino)) errores.push(`conexión hacia nodo desconocido: ${e.destino}`);
  }
  return errores;
}

/** Base en memoria con semántica transaccional: `guardar` aplica todo o nada. */
export class CanvasMemoria {
  nodos: NodoDB[] = [];
  edges: EdgeDB[] = [];
  private seq = 0;
  constructor(public processId: string, public fallarEn?: "insert_edge" | "delete_nodo") {}

  uuid() {
    return `00000000-0000-4000-8000-${String(++this.seq).padStart(12, "0")}`;
  }

  guardar(nodosIn: NodoEntrada[], edgesIn: EdgeEntrada[]): Record<string, string> {
    // Trabajamos sobre copias; solo al final se "commitea".
    const nodos = this.nodos.map((n) => ({ ...n }));
    const edges: EdgeDB[] = [];
    const mapa: Record<string, string> = {};
    const conservados = new Set<string>();

    for (const n of nodosIn) {
      const existe = n.id && nodos.find((x) => x.id === n.id && x.process_id === this.processId);
      let id: string;
      if (existe) {
        Object.assign(existe, { tipo: n.tipo, etiqueta: n.etiqueta || "…", responsable: n.responsable ?? null, ejecutor: n.ejecutor ?? null, tiempo: n.tiempo ?? null, herramienta: n.herramienta ?? null, problema: n.problema ?? null, veredicto: n.veredicto || null, pos_x: n.pos_x ?? 0, pos_y: n.pos_y ?? 0 });
        id = existe.id;
      } else {
        id = this.uuid();
        nodos.push({ id, process_id: this.processId, tipo: n.tipo, etiqueta: n.etiqueta || "…", responsable: n.responsable ?? null, ejecutor: n.ejecutor ?? null, tiempo: n.tiempo ?? null, herramienta: n.herramienta ?? null, problema: n.problema ?? null, veredicto: n.veredicto || null, pos_x: n.pos_x ?? 0, pos_y: n.pos_y ?? 0 });
      }
      conservados.add(id);
      mapa[n._tmp ?? n.id ?? id] = id;
    }
    if (this.fallarEn === "delete_nodo") throw new Error("fallo simulado en delete");
    const nodosFinal = nodos.filter((n) => n.process_id !== this.processId || conservados.has(n.id));

    for (const e of edgesIn) {
      const o = mapa[e.origen], d = mapa[e.destino];
      if (!o || !d) throw new ErrorIntegridad(`${e.origen} -> ${e.destino}`);
      if (this.fallarEn === "insert_edge") throw new Error("fallo simulado en insert edge");
      edges.push({ id: this.uuid(), process_id: this.processId, origen: o, destino: d, etiqueta: e.etiqueta ?? null });
    }
    // commit
    this.nodos = nodosFinal;
    this.edges = [...this.edges.filter((e) => e.process_id !== this.processId), ...edges];
    return mapa;
  }
}
