"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { diaCorto, type FuenteAportada } from "@/lib/iniciativas";

const VACIA = { nombre: "", quien: "", fecha: "", que_dice: "" };

/**
 * LAS FUENTES QUE ALGUIEN APORTÓ. Cuando no hay investigación externa, lo que sustenta una iniciativa es
 * lo que alguien puso sobre la mesa: una lista de precios, una conversación con un proveedor, un registro.
 * Cada una con nombre, quién la aportó, de cuándo es y qué dice. Aquí no se escribe lo que «se sabe» del
 * mercado: se escribe de dónde sale. Las cuatro piezas son obligatorias y las exige el servidor.
 */
export function FuentesAportadas({ companyId, iniciativaId, fuentes, admite, hoy, onGuardado }: {
  companyId: string;
  iniciativaId: string;
  fuentes: FuenteAportada[];
  /** false cuando la iniciativa está detenida o cerrada: ya no recibe fuentes. */
  admite: boolean;
  hoy: string;
  onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(VACIA);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = f.nombre.trim() && f.quien.trim() && f.fecha && f.que_dice.trim();

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/iniciativas/${iniciativaId}`, { method: "PATCH", json: { fuente_aportada: f } });
      setF(VACIA);
      setAbierto(false);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la fuente.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {fuentes.length === 0 ? (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>Ninguna fuente aportada todavía.</p>
      ) : (
        <ul className="flex flex-col gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {fuentes.map((x) => (
            <li key={`${x.nombre}|${x.quien_la_aporto}|${x.fecha}`} className="t-dato" style={{ borderLeft: "2px solid var(--linea)", paddingLeft: 10 }}>
              <strong>{x.nombre}</strong>
              <span style={{ color: "var(--grafito)" }}> · la aportó {x.quien_la_aporto || "(no consta quién)"} · {diaCorto(x.fecha)}</span>
              <p style={{ margin: "2px 0 0" }}>{x.que_dice}</p>
            </li>
          ))}
        </ul>
      )}
      {admite && !abierto && (
        <div>
          <button type="button" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }} onClick={() => setAbierto(true)}>Registrar una fuente aportada</button>
        </div>
      )}
      {admite && abierto && (
        <div className="grid gap-2 md:grid-cols-2" style={{ borderLeft: "2px solid var(--linea)", paddingLeft: 12 }}>
          <input className="campo" aria-label="Nombre de la fuente" placeholder="Qué es: documento, lista, conversación, registro" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          <input className="campo" aria-label="Quién la aportó" placeholder="Quién la aportó" value={f.quien} onChange={(e) => setF({ ...f, quien: e.target.value })} />
          <input className="campo" type="date" aria-label="Fecha de la fuente" max={hoy} style={{ maxWidth: 190 }} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          <textarea className="campo" rows={2} aria-label="Qué dice la fuente" placeholder="Qué dice, en una frase" style={{ gridColumn: "1 / -1" }} value={f.que_dice} onChange={(e) => setF({ ...f, que_dice: e.target.value })} />
          <div className="flex gap-2 flex-wrap items-center" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }} disabled={!listo || guardando} onClick={guardar}>
              {guardando ? "Guardando" : "Guardar fuente"}
            </button>
            <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={() => { setAbierto(false); setError(null); }} disabled={guardando}>
              Cancelar
            </button>
          </div>
          {error && <p className="t-dato" style={{ color: "var(--contradicho)", gridColumn: "1 / -1" }} role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
