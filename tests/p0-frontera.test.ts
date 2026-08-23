import { describe, it, expect } from "vitest";
import { filaCliente, visibleParaCliente, sinColumnasInternas, COLUMNAS_INTERNAS_CLAIM, type ClaimInterno } from "@/lib/frontera";

const interno: ClaimInterno = {
  id: "c1", texto: "Ser líder nacional para 2025", estado: "contradicho", participant_id: null, fecha_afirmacion: "2023-05-01", prioridad_validacion: true,
  contradice_a: "c2", pilar: "marketing", tipo: "vision", temporalidad: "aspiracional", explicacion_contradiccion: "El dueño dijo lo contrario", pregunta_sugerida: "¿Cuál vale?", validado_por: null, source_id: "s1", fragment_id: "f1",
};

describe("P0-02 · frontera de columnas hacia el cliente", () => {
  it("la fila del cliente no contiene ninguna columna interna, aunque el objeto de origen las traiga todas", () => {
    const fila = filaCliente(interno, "Plan estratégico (documento, mayo 2023)", "documento", { texto: "Queremos Lima", fuente: "el dueño" });
    expect(sinColumnasInternas(fila)).toBe(true);
    for (const k of COLUMNAS_INTERNAS_CLAIM) expect(k in fila).toBe(false);
    expect(Object.keys(fila).sort()).toEqual(["contradiccion", "fecha", "fuente", "fuente_tipo", "id", "opciones", "pregunta", "requiere_validacion", "texto"]);
  });
  it("traduce el estado a una pregunta y a tres opciones, sin exponer 'contradicho'", () => {
    const fila = filaCliente(interno, "f", "documento");
    expect(fila.pregunta).toMatch(/dos versiones/);
    expect(fila.opciones).toEqual(["si", "ya_no", "nunca"]);
    expect(JSON.stringify(fila)).not.toMatch(/contradicho|marketing|aspiracional|pregunta_sugerida/);
  });
  it("un claim sin_verificar con prioridad → requiere validación; uno confirmado → no", () => {
    expect(filaCliente({ ...interno, estado: "sin_verificar" }, "f", null).requiere_validacion).toBe(true);
    expect(filaCliente({ ...interno, estado: "confirmado", prioridad_validacion: false }, "f", null).requiere_validacion).toBe(false);
  });
  it("lo que dijo otra persona (empleado) no es visible para el dueño; lo propio y lo documental sí", () => {
    const mios = new Set(["p-dueno"]);
    expect(visibleParaCliente({ ...interno, participant_id: "p-rosa" }, mios)).toBe(false);
    expect(visibleParaCliente({ ...interno, participant_id: "p-dueno" }, mios)).toBe(true);
    expect(visibleParaCliente({ ...interno, participant_id: null }, mios)).toBe(true);
  });
  it("la contraparte de una contradicción llega solo como texto+fuente, nunca como id interno", () => {
    const fila = filaCliente(interno, "f", "documento", { texto: "Queremos Lima", fuente: "el dueño" });
    expect(fila.contradiccion).toEqual({ texto: "Queremos Lima", fuente: "el dueño" });
    expect("contradice_a" in fila).toBe(false);
  });
});
