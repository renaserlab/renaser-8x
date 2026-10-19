"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

export type TareaParaHoy = { id: string; titulo: string; etiqueta: string; tono: "hoy" | "antes"; marcada: boolean };

const ANIMOS = ["Muy bajo", "Bajo", "Normal", "Bien", "Muy bien"];

/**
 * ABRIR EL DÍA: ánimo, compromiso y en qué tareas se enfoca. Lo que viene de días anteriores llega sin marcar: es la
 * persona quien decide si hoy le toca. Al abrir, lo marcado que venía de antes pasa a ser trabajo de hoy.
 */
export function AbrirDia({ tareas, hora }: { tareas: TareaParaHoy[]; hora: string }) {
  const router = useRouter();
  const [animo, setAnimo] = useState<number | null>(null);
  const [compromiso, setCompromiso] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(tareas.filter((t) => t.marcada).map((t) => t.id)));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alternar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const abrir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animo) return setError("Elige cómo llegas hoy, del 1 al 5.");
    setEnviando(true);
    setError(null);
    try {
      await pedir("/api/os/apertura", { json: { animo, compromiso: compromiso.trim() || undefined, enfocar: [...marcadas] } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el día.");
      setEnviando(false);
    }
  };

  return (
    <form className="panel os-d-bloque" onSubmit={abrir} style={{ gap: 26 }}>
      <div className="os-d-campo">
        <h2 className="t-seccion" id="titulo-animo">1. ¿Cómo llegas hoy?</h2>
        <div className="os-d-animo" role="radiogroup" aria-labelledby="titulo-animo">
          {ANIMOS.map((et, i) => (
            <button key={et} type="button" role="radio" aria-checked={animo === i + 1} onClick={() => setAnimo(i + 1)}>
              <span className="os-d-animo__n">{i + 1}</span>
              <span className="os-d-animo__t">{et}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="os-d-campo">
        <span className="t-seccion">2. Tu compromiso de hoy</span>
        <textarea
          className="campo"
          rows={3}
          maxLength={500}
          value={compromiso}
          onChange={(e) => setCompromiso(e.target.value)}
          placeholder="Lo más importante que vas a sacar hoy…"
          style={{ minHeight: 96 }}
        />
      </label>
      <div className="os-d-campo">
        <h2 className="t-seccion">3. Tu trabajo para hoy</h2>
        <p className="t-dato os-d-tenue" style={{ margin: 0 }}>
          Tus tareas con fecha de hoy y las que quedaron pendientes de días anteriores. Marca en cuáles te enfocas.
        </p>
        {tareas.length ? (
          <div className="os-d-casillas">
            {tareas.map((t) => (
              <label key={t.id} className="os-d-casilla">
                <input type="checkbox" checked={marcadas.has(t.id)} onChange={() => alternar(t.id)} />
                <span className="os-d-casilla__texto">
                  <span className="os-d-casilla__titulo">{t.titulo}</span>
                  <span className={`os-d-chip ${t.tono === "hoy" ? "os-d-chip--acero" : "os-d-chip--espera"}`}>{t.etiqueta}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="aviso" style={{ margin: 0 }}>
            No tienes tareas para hoy ni pendientes de antes. Después de abrir, agrégalas en <a href="/os/mi-trabajo" className="enlace-azul">Mi trabajo</a>.
          </p>
        )}
      </div>
      {error && <p className="aviso aviso--error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="os-d-fila" style={{ paddingTop: 6, borderTop: "1px solid var(--linea)" }}>
        <button className="boton" disabled={enviando} style={{ minHeight: 52, fontSize: 16, paddingInline: 28 }}>
          {enviando ? "Abriendo…" : "Abrir mi día"}
        </button>
        <span className="t-dato os-d-tenue">Tu equipo verá que abriste a las {hora}.</span>
      </div>
    </form>
  );
}
