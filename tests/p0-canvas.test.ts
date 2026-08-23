import { describe, it, expect } from "vitest";
import { CanvasMemoria, validarEntrada, ErrorIntegridad, type NodoEntrada } from "@/lib/canvas-guardar";

const P = "proc-1";
const nodo = (o: Partial<NodoEntrada> & { tipo: string; etiqueta: string }): NodoEntrada => ({ pos_x: 0, pos_y: 0, ...o });

function base() {
  const db = new CanvasMemoria(P);
  const mapa = db.guardar([nodo({ _tmp: "a", tipo: "inicio", etiqueta: "Entra" }), nodo({ _tmp: "b", tipo: "fin", etiqueta: "Sale" })], [{ origen: "a", destino: "b" }]);
  return { db, A: mapa.a, B: mapa.b };
}

describe("P0-05 · guardado del canvas: tmp → uuid, integridad, todo o nada", () => {
  it("dos nodos existentes se actualizan sin cambiar de id y la conexión se conserva", () => {
    const { db, A, B } = base();
    db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra (editado)", pos_x: 10, pos_y: 20 }), nodo({ id: B, tipo: "fin", etiqueta: "Sale" })], [{ origen: A, destino: B }]);
    expect(db.nodos.map((n) => n.id).sort()).toEqual([A, B].sort());
    expect(db.nodos.find((n) => n.id === A)!.etiqueta).toBe("Entra (editado)");
    expect(db.edges).toHaveLength(1);
  });
  it("nodo nuevo conectado a uno existente: la conexión NO se pierde (el bug original)", () => {
    const { db, A, B } = base();
    const mapa = db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra" }), nodo({ id: B, tipo: "fin", etiqueta: "Sale" }), nodo({ _tmp: "tmp-7", tipo: "actividad", etiqueta: "Nueva" })], [{ origen: A, destino: "tmp-7" }, { origen: "tmp-7", destino: B }]);
    expect(mapa["tmp-7"]).toMatch(/^0000/);
    expect(db.edges).toHaveLength(2);
    expect(db.edges.every((e) => db.nodos.some((n) => n.id === e.origen) && db.nodos.some((n) => n.id === e.destino))).toBe(true);
  });
  it("dos nodos nuevos conectados entre sí", () => {
    const { db, A } = base();
    db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra" }), nodo({ _tmp: "x", tipo: "actividad", etiqueta: "X" }), nodo({ _tmp: "y", tipo: "fin", etiqueta: "Y" })], [{ origen: A, destino: "x" }, { origen: "x", destino: "y" }]);
    expect(db.edges).toHaveLength(2);
    expect(db.nodos).toHaveLength(3); // B fue eliminado porque no vino en la lista
  });
  it("decisión nueva con dos salidas etiquetadas", () => {
    const { db, A, B } = base();
    db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra" }), nodo({ id: B, tipo: "fin", etiqueta: "Sale" }), nodo({ _tmp: "d", tipo: "decision", etiqueta: "¿Pagó?" }), nodo({ _tmp: "p", tipo: "fin", etiqueta: "Perdido" })], [{ origen: A, destino: "d" }, { origen: "d", destino: B, etiqueta: "sí" }, { origen: "d", destino: "p", etiqueta: "no" }]);
    const dId = db.nodos.find((n) => n.etiqueta === "¿Pagó?")!.id;
    expect(db.edges.filter((e) => e.origen === dId).map((e) => e.etiqueta).sort()).toEqual(["no", "sí"]);
  });
  it("eliminación de nodo: desaparece él y sus conexiones", () => {
    const { db, A } = base();
    db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra" })], []);
    expect(db.nodos).toHaveLength(1);
    expect(db.edges).toHaveLength(0);
  });
  it("eliminación de una conexión conservando los nodos", () => {
    const { db, A, B } = base();
    db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra" }), nodo({ id: B, tipo: "fin", etiqueta: "Sale" })], []);
    expect(db.nodos).toHaveLength(2);
    expect(db.edges).toHaveLength(0);
  });
  it("actualización de posiciones persiste", () => {
    const { db, A, B } = base();
    db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra", pos_x: 300, pos_y: 40 }), nodo({ id: B, tipo: "fin", etiqueta: "Sale", pos_x: 600, pos_y: 40 })], [{ origen: A, destino: B }]);
    expect(db.nodos.find((n) => n.id === A)!.pos_x).toBe(300);
    expect(db.nodos.find((n) => n.id === B)!.pos_x).toBe(600);
  });
  it("conexión a un id inexistente → ErrorIntegridad y NADA cambia (rollback)", () => {
    const { db, A, B } = base();
    const antes = JSON.stringify({ n: db.nodos, e: db.edges });
    expect(() => db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra" }), nodo({ id: B, tipo: "fin", etiqueta: "Sale" }), nodo({ _tmp: "n", tipo: "actividad", etiqueta: "N" })], [{ origen: A, destino: "fantasma" }])).toThrow(ErrorIntegridad);
    expect(JSON.stringify({ n: db.nodos, e: db.edges })).toBe(antes);
  });
  it("fallo intermedio al insertar conexiones → rollback completo, ni el nodo nuevo queda", () => {
    const db = new CanvasMemoria(P, "insert_edge");
    expect(() => db.guardar([nodo({ _tmp: "a", tipo: "inicio", etiqueta: "A" }), nodo({ _tmp: "b", tipo: "fin", etiqueta: "B" })], [{ origen: "a", destino: "b" }])).toThrow();
    expect(db.nodos).toHaveLength(0);
    expect(db.edges).toHaveLength(0);
  });
  it("ningún id temporal queda almacenado", () => {
    const { db } = base();
    expect(db.nodos.every((n) => !n.id.startsWith("tmp") && n.id.length > 20)).toBe(true);
    expect(db.edges.every((e) => !e.origen.startsWith("tmp") && !e.destino.startsWith("tmp"))).toBe(true);
  });
  it("ninguna conexión desaparece en una ronda de edición compleja (5 nuevos, 2 existentes, 7 conexiones)", () => {
    const { db, A, B } = base();
    const nuevos = ["n1", "n2", "n3", "n4", "n5"].map((t) => nodo({ _tmp: t, tipo: "actividad", etiqueta: t }));
    const edges = [{ origen: A, destino: "n1" }, { origen: "n1", destino: "n2" }, { origen: "n2", destino: "n3" }, { origen: "n3", destino: "n4" }, { origen: "n4", destino: "n5" }, { origen: "n5", destino: B }, { origen: "n2", destino: "n5" }];
    db.guardar([nodo({ id: A, tipo: "inicio", etiqueta: "Entra" }), nodo({ id: B, tipo: "fin", etiqueta: "Sale" }), ...nuevos], edges);
    expect(db.edges).toHaveLength(7);
  });
  it("validación previa en el servidor: tipo inválido, nodo nuevo sin _tmp, conexión a desconocido", () => {
    const errores = validarEntrada([nodo({ tipo: "tarea", etiqueta: "x", _tmp: "t" }), { tipo: "fin", etiqueta: "y", pos_x: 0, pos_y: 0 }], [{ origen: "t", destino: "zzz" }], new Set());
    expect(errores.join("\n")).toMatch(/tipo inválido/);
    expect(errores.join("\n")).toMatch(/sin _tmp/);
    expect(errores.join("\n")).toMatch(/desconocido: zzz/);
  });
  it("canvas manipulado: un id existente de OTRO proceso no se actualiza, se trata como nodo nuevo del proceso actual", () => {
    const db = new CanvasMemoria("proc-2");
    db.nodos.push({ id: "ajeno", process_id: "proc-1", tipo: "fin", etiqueta: "De otro proceso", responsable: null, ejecutor: null, tiempo: null, herramienta: null, problema: null, veredicto: null, pos_x: 0, pos_y: 0 });
    db.guardar([nodo({ id: "ajeno", _tmp: "ajeno", tipo: "inicio", etiqueta: "Intruso" })], []);
    expect(db.nodos.find((n) => n.id === "ajeno")!.etiqueta).toBe("De otro proceso"); // intacto
    expect(db.nodos.filter((n) => n.process_id === "proc-2")).toHaveLength(1);
  });
});
