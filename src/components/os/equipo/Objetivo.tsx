"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

/**
 * EL OBJETIVO DE LA SEMANA, editable desde su tarjeta noche: fijarlo (texto y meta), cambiarlo, o subir cuánto va
 * logrado. Sin objetivo todavía, la tarjeta es el formulario.
 */
export function EditarObjetivo({ semana, texto, meta }: { semana: string; texto: string | null; meta: number | null }) {
  const { enviar, enviando, error } = useEnviar();
  const [editando, setEditando] = useState(!texto);
  const [t, setT] = useState(texto ?? "");
  const [m, setM] = useState(meta ? String(meta) : "");
  if (!editando)
    return (
      <button type="button" className="boton boton--luna boton--chico" onClick={() => setEditando(true)}>
        Cambiar objetivo
      </button>
    );
  return (
    <form
      className="os-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await enviar("/api/os/objetivo", "PUT", { semana, texto: t, meta: m ? Number(m) : null })) setEditando(false);
      }}
    >
      <label style={{ gridColumn: "1 / -1" }}>
        <span className="t-etiqueta" style={{ color: "var(--luna-tenue)" }}>Objetivo de la semana</span>
        <input className="campo" value={t} onChange={(e) => setT(e.target.value)} maxLength={300} required placeholder="Cerrar 12 pedidos mayoristas" />
      </label>
      <label>
        <span className="t-etiqueta" style={{ color: "var(--luna-tenue)" }}>Meta (un número, si se puede contar)</span>
        <input className="campo" type="number" min={1} value={m} onChange={(e) => setM(e.target.value)} />
      </label>
      <div className="os-form__acciones">
        <button className="boton boton--luna boton--chico" disabled={enviando}>{enviando ? "Guardando…" : texto ? "Guardar objetivo" : "Fijar el objetivo"}</button>
        {texto && <button type="button" className="boton-enlace" style={{ color: "var(--luna)" }} onClick={() => setEditando(false)}>Cancelar</button>}
        {error && <p className="os-error" role="alert" style={{ color: "#f3b0a8" }}>{error}</p>}
      </div>
    </form>
  );
}

/** Subir o bajar lo logrado (de uno en uno, como se cuentan los pedidos). */
export function Logrado({ semana, logrado, meta }: { semana: string; logrado: number; meta: number | null }) {
  const { enviar, enviando, error } = useEnviar();
  const poner = (n: number) => void enviar("/api/os/objetivo", "PUT", { semana, logrado: Math.max(0, n) });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="boton-redondo" style={{ background: "var(--noche-alta)", color: "var(--luna)" }} aria-label="Uno menos" disabled={enviando || logrado <= 0} onClick={() => poner(logrado - 1)}>−</button>
      <button type="button" className="boton-redondo" style={{ background: "var(--noche-alta)", color: "var(--luna)" }} aria-label="Uno más" disabled={enviando || (meta != null && logrado >= meta * 3)} onClick={() => poner(logrado + 1)}>+</button>
      <span className="t-dato">Actualizar lo logrado</span>
      {error && <span className="os-error" role="alert" style={{ color: "#f3b0a8" }}>{error}</span>}
    </div>
  );
}
