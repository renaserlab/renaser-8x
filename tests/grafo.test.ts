import { describe, it, expect } from "vitest";
import { validarFlujograma, tieneFinalMalo, removeConDependientes, automatizacionesInvalidas, diffAsIsToBe, type Flujo } from "@/lib/rules/grafo";
import { autoLayout } from "@/lib/layout";

const ventas: Flujo = {
  nodos: [
    { id: "n1", tipo: "inicio", etiqueta: "Lead entra por WhatsApp" },
    { id: "n2", tipo: "actividad", etiqueta: "Asesor contacta", ejecutor: "humano" },
    { id: "n3", tipo: "decision", etiqueta: "¿Respondió?" },
    { id: "n4", tipo: "actividad", etiqueta: "Se agenda reunión", ejecutor: "humano" },
    { id: "n5", tipo: "fin", etiqueta: "Cliente cierra" },
    { id: "n6", tipo: "fin", etiqueta: "Lead perdido" },
  ],
  conexiones: [
    { de: "n1", a: "n2" },
    { de: "n2", a: "n3" },
    { de: "n3", a: "n4", etiqueta: "sí" },
    { de: "n3", a: "n6", etiqueta: "no" },
    { de: "n4", a: "n5" },
  ],
};

describe("validación de flujogramas (regla nueva, aún no conectada al guardado)", () => {
  it("un proceso bien formado es válido y tiene final malo", () => {
    expect(validarFlujograma(ventas).valido).toBe(true);
    expect(tieneFinalMalo(ventas)).toBe(true);
  });
  it("decisión con una sola salida = inválida", () => {
    const f: Flujo = { ...ventas, conexiones: ventas.conexiones.filter((e) => !(e.de === "n3" && e.a === "n6")) };
    const r = validarFlujograma(f);
    expect(r.valido).toBe(false);
    expect(r.problemas.map((p) => p.codigo)).toContain("decision_una_salida");
  });
  it("salida de decisión sin etiqueta = inválida", () => {
    const f: Flujo = { ...ventas, conexiones: ventas.conexiones.map((e) => (e.de === "n3" ? { ...e, etiqueta: null } : e)) };
    expect(validarFlujograma(f).problemas.map((p) => p.codigo)).toContain("salida_sin_etiqueta");
  });
  it("proceso sin final = inválido; camino que no termina = inválido", () => {
    const f: Flujo = { nodos: [{ id: "a", tipo: "inicio", etiqueta: "x" }, { id: "b", tipo: "actividad", etiqueta: "y" }], conexiones: [{ de: "a", a: "b" }] };
    const r = validarFlujograma(f);
    expect(r.problemas.map((p) => p.codigo)).toEqual(expect.arrayContaining(["sin_fin", "camino_sin_fin"]));
  });
  it("nodo inalcanzable y conexión huérfana", () => {
    const f: Flujo = { ...ventas, nodos: [...ventas.nodos, { id: "z", tipo: "actividad", etiqueta: "isla" }], conexiones: [...ventas.conexiones, { de: "z", a: "n5" }, { de: "n5", a: "nope" }] };
    const codigos = validarFlujograma(f).problemas.map((p) => p.codigo);
    expect(codigos).toContain("nodo_inalcanzable");
    expect(codigos).toContain("conexion_huerfana");
  });
  it("un flujograma donde todo termina bien no tiene final malo", () => {
    const f: Flujo = { ...ventas, nodos: ventas.nodos.map((n) => (n.id === "n6" ? { ...n, etiqueta: "Se archiva" } : n)) };
    expect(tieneFinalMalo(f)).toBe(false);
  });
  it("REMOVE con consumidores aguas abajo se detecta", () => {
    const f: Flujo = { ...ventas, nodos: ventas.nodos.map((n) => (n.id === "n2" ? { ...n, veredicto: "remove" } : n)) };
    const dep = removeConDependientes(f);
    expect(dep).toHaveLength(1);
    expect(dep[0].dependientes).toContain("n3");
  });
  it("un paso remove o indefinido ('?') nunca se automatiza", () => {
    const f: Flujo = { ...ventas, nodos: ventas.nodos.map((n) => (n.id === "n2" ? { ...n, veredicto: "remove", ejecutor: "ia" } : n.id === "n4" ? { ...n, etiqueta: "? Algo", ejecutor: "software" } : n)) };
    expect(automatizacionesInvalidas(f).map((n) => n.id).sort()).toEqual(["n2", "n4"]);
  });
  it("AS-IS → TO-BE: lo eliminado, lo creado, lo conservado; create sin marca se detecta", () => {
    const asis: Flujo = { ...ventas, nodos: ventas.nodos.map((n) => (n.id === "n2" ? { ...n, veredicto: "remove" } : { ...n, veredicto: "keep" })) };
    const tobe: Flujo = {
      nodos: [
        { id: "t1", tipo: "inicio", etiqueta: "Lead entra por WhatsApp", veredicto: "keep" },
        { id: "t2", tipo: "actividad", etiqueta: "Bot responde en 5 minutos", veredicto: "create", ejecutor: "ia" },
        { id: "t3", tipo: "decision", etiqueta: "¿Respondió?", veredicto: "keep" },
        { id: "t4", tipo: "actividad", etiqueta: "Se agenda reunión", veredicto: "keep" },
        { id: "t5", tipo: "fin", etiqueta: "Cliente cierra", veredicto: "keep" },
        { id: "t6", tipo: "fin", etiqueta: "Lead perdido", veredicto: "keep" },
        { id: "t7", tipo: "actividad", etiqueta: "Seguimiento a 48h", ejecutor: "hibrido" },
      ],
      conexiones: [{ de: "t1", a: "t2" }, { de: "t2", a: "t3" }, { de: "t3", a: "t4", etiqueta: "sí" }, { de: "t3", a: "t7", etiqueta: "no" }, { de: "t7", a: "t6" }, { de: "t4", a: "t5" }],
    };
    const d = diffAsIsToBe(asis, tobe);
    expect(d.eliminados.map((n) => n.id)).toEqual(["n2"]);
    expect(d.creados.map((n) => n.id).sort()).toEqual(["t2", "t7"]);
    expect(d.removeNoEliminado).toHaveLength(0);
    expect(d.createSinMarca.map((n) => n.id)).toEqual(["t7"]);
    expect(validarFlujograma(tobe).valido).toBe(true);
  });
  it("auto-layout: todos los nodos reciben posición distinta y no negativa", () => {
    const pos = autoLayout(ventas.nodos, ventas.conexiones.map((e) => ({ origen: e.de, destino: e.a })));
    expect(pos.size).toBe(6);
    const claves = new Set([...pos.values()].map((p) => `${p.x},${p.y}`));
    expect(claves.size).toBe(6);
    expect([...pos.values()].every((p) => p.x >= 0 && p.y >= 0)).toBe(true);
  });
});
