"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { DIMENSIONES_360, type Dimension360 } from "@/lib/os/evaluaciones";

/** MI FICHA: nombre, puesto y área. El rol lo pone la gestión. */
export function EditarPerfil({ nombre, puesto, area }: { nombre: string; puesto: string | null; area: string | null }) {
  const router = useRouter();
  const [d, setD] = useState({ nombre, puesto: puesto ?? "", area: area ?? "" });
  const [estado, setEstado] = useState<"quieto" | "guardando" | "listo">("quieto");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="os-d-campos"
      onSubmit={async (e) => {
        e.preventDefault();
        setEstado("guardando");
        setError(null);
        try {
          await pedir("/api/os/perfil", { method: "PATCH", json: { nombre: d.nombre.trim(), puesto: d.puesto.trim() || null, area: d.area.trim() || null } });
          setEstado("listo");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo guardar.");
          setEstado("quieto");
        }
      }}
    >
      <label className="os-d-campo">
        <span className="t-etiqueta">Tu nombre</span>
        <input className="campo" required maxLength={120} value={d.nombre} onChange={(e) => { setD({ ...d, nombre: e.target.value }); setEstado("quieto"); }} />
      </label>
      <div className="os-d-campos os-d-campos--dos">
        <label className="os-d-campo">
          <span className="t-etiqueta">Tu puesto</span>
          <input className="campo" maxLength={120} value={d.puesto} onChange={(e) => { setD({ ...d, puesto: e.target.value }); setEstado("quieto"); }} placeholder="Vendedora" />
        </label>
        <label className="os-d-campo">
          <span className="t-etiqueta">Tu área</span>
          <input className="campo" maxLength={120} value={d.area} onChange={(e) => { setD({ ...d, area: e.target.value }); setEstado("quieto"); }} placeholder="Ventas" />
        </label>
      </div>
      {error && <p className="aviso aviso--error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div className="os-d-fila">
        <button className="boton" disabled={estado === "guardando"}>{estado === "guardando" ? "Guardando…" : "Guardar"}</button>
        {estado === "listo" && <span className="t-dato" role="status">Guardado.</span>}
      </div>
    </form>
  );
}

/** RESPONDER UNA 360: las cinco dimensiones del 1 al 5 y un comentario. Una vez enviada, no se cambia. */
export function Responder360({ id, evaluado, relacion }: { id: string; evaluado: string; relacion: string }) {
  const router = useRouter();
  const [puntajes, setPuntajes] = useState<Partial<Record<Dimension360, number>>>({});
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completos = DIMENSIONES_360.every(([k]) => puntajes[k]);

  return (
    <form
      className="os-d-formulario"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!completos) return setError("Puntúa las cinco dimensiones antes de enviar.");
        setEnviando(true);
        setError(null);
        try {
          await pedir(`/api/os/evaluaciones/${id}`, { json: { puntajes, comentario: comentario.trim() || undefined } });
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo enviar.");
          setEnviando(false);
        }
      }}
    >
      <div>
        <h3 className="t-seccion" style={{ margin: 0, fontSize: 16 }}>{evaluado}</h3>
        <span className="t-dato os-d-tenue">{relacion} · 1 es muy por debajo de lo esperado; 5, muy por encima.</span>
      </div>
      {DIMENSIONES_360.map(([k, nombre, ayuda]) => (
        <div key={k} className="os-d-dimension">
          <fieldset>
            <legend>
              {nombre} <span className="t-dato os-d-tenue" style={{ fontWeight: 400 }}>· {ayuda}</span>
            </legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n}>
                <input type="radio" name={`${id}-${k}`} value={n} checked={puntajes[k] === n} onChange={() => setPuntajes((p) => ({ ...p, [k]: n }))} />
                <span>{n}</span>
              </label>
            ))}
          </fieldset>
        </div>
      ))}
      <label className="os-d-campo">
        <span className="t-etiqueta">Comentario (opcional)</span>
        <textarea className="campo" rows={2} maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Lo que más aporta y lo que podría mejorar." style={{ minHeight: 72 }} />
      </label>
      {error && <p className="aviso aviso--error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <button className="boton" disabled={enviando} style={{ alignSelf: "flex-start" }}>{enviando ? "Enviando…" : "Enviar evaluación"}</button>
    </form>
  );
}
