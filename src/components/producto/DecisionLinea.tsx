"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import type { Decision, LineaProducto, Sugerencia } from "@/lib/producto";

export type OpcionDecision = { clave: Decision; texto: string };

/**
 * LA DECISIÓN SOBRE UNA LÍNEA LA FIJA LA CONSULTORA, CON SU MOTIVO. La evaluación solo dice lo que la
 * aritmética permite («revisar: contribución negativa», «sin datos para decidir»); nunca elige. Por eso
 * la lista arranca en «Sin decidir» y no en una opción marcada: nada se decide por omisión.
 */
export function DecisionLinea({
  companyId,
  linea,
  opciones,
  sugerencia,
  alCerrar,
}: {
  companyId: string;
  linea: Pick<LineaProducto, "id" | "nombre" | "decision" | "decision_motivo">;
  opciones: OpcionDecision[];
  sugerencia: Sugerencia | null;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | "">(linea.decision ?? "");
  const [motivo, setMotivo] = useState(linea.decision_motivo ?? "");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setError(null);
    if (!decision && !linea.decision) {
      alCerrar(); // no había decisión y sigue sin haberla: no hay nada que guardar
      return;
    }
    if (decision && !motivo.trim()) {
      setError("Escribe por qué: la decisión se guarda con su motivo.");
      return;
    }
    setTrabajando(true);
    try {
      await pedir(`/api/companies/${companyId}/producto/${linea.id}`, {
        method: "PATCH",
        json: decision ? { decision, decision_motivo: motivo.trim() } : { decision: null },
      });
      router.refresh();
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar la decisión.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="panel p-4" style={{ background: "var(--suave)" }}>
      <p className="t-dato" style={{ fontWeight: 600 }}>Decisión sobre «{linea.nombre}»</p>
      {sugerencia && (
        <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
          La cuenta dice: {sugerencia.texto}
          {sugerencia.falta.length > 0 ? ` (falta ${sugerencia.falta.join(", ")})` : ""}. Decidir es tuyo.
        </p>
      )}
      <div className="grid gap-3 mt-3 sm:grid-cols-[minmax(220px,1fr)_2fr]">
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Qué se hace con esta línea</span>
          <select className="campo" value={decision} onChange={(e) => setDecision(e.target.value as Decision | "")} aria-label={`Decisión sobre ${linea.nombre}`}>
            <option value="">Sin decidir</option>
            {opciones.map((o) => (
              <option key={o.clave} value={o.clave}>{o.texto}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Por qué</span>
          <input className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={600} disabled={!decision} aria-label={`Motivo de la decisión sobre ${linea.nombre}`} />
        </label>
      </div>
      {error && <p className="t-dato mt-2" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button type="button" className="boton" disabled={trabajando} onClick={guardar}>
          {trabajando ? "Guardando" : decision ? "Fijar la decisión" : linea.decision ? "Quitar la decisión" : "Dejar sin decidir"}
        </button>
        <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
