"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

/**
 * «ASIGNAR»: ponerle trabajo para hoy a quien no tiene. Usa la misma ruta que crea las tareas de «Mi trabajo»
 * (/api/os/tareas, con persona_id): la tarea queda con su día de trabajo en hoy.
 */
export function AsignarTarea({ personaId, nombre, hoy }: { personaId: string; nombre: string; hoy: string }) {
  const { enviar, enviando, error } = useEnviar();
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [limite, setLimite] = useState(hoy);
  if (!abierto)
    return (
      <button type="button" className="boton-enlace" onClick={() => setAbierto(true)} aria-label={`Asignar una tarea a ${nombre}`}>
        Asignar
      </button>
    );
  return (
    <form
      className="os-form w-full"
      onSubmit={async (e) => {
        e.preventDefault();
        const listo = await enviar("/api/os/tareas", "POST", { persona_id: personaId, titulo, prioridad, fecha_inicio: hoy, fecha_limite: limite || null });
        if (listo) {
          setTitulo("");
          setAbierto(false);
        }
      }}
    >
      <label style={{ gridColumn: "1 / -1" }}>
        <span className="t-etiqueta">Tarea para {nombre}</span>
        <input className="campo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={300} required placeholder="Qué tiene que hacer hoy" />
      </label>
      <label>
        <span className="t-etiqueta">Prioridad</span>
        <select className="campo" value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
      </label>
      <label>
        <span className="t-etiqueta">Vence</span>
        <input type="date" className="campo" value={limite} min={hoy} onChange={(e) => setLimite(e.target.value)} />
      </label>
      <div className="os-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Asignando…" : "Asignar para hoy"}</button>
        <button type="button" className="boton-enlace boton-enlace--tenue" onClick={() => setAbierto(false)}>Cancelar</button>
        {error && <p className="os-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}
