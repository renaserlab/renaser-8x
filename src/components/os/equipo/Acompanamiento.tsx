"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

/** PROGRAMAR una sesión de acompañamiento con alguien del equipo. */
export function NuevaSesion({ personas, minimo }: { personas: { id: string; nombre: string }[]; minimo: string }) {
  const { enviar, enviando, error } = useEnviar();
  const [persona, setPersona] = useState(personas[0]?.id ?? "");
  const [fecha, setFecha] = useState("");
  const [tema, setTema] = useState("");
  return (
    <form
      className="os-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await enviar("/api/os/acompanamientos", "POST", { persona_id: persona, fecha, tema })) {
          setTema("");
          setFecha("");
        }
      }}
    >
      <label>
        <span className="t-etiqueta">Con quién</span>
        <select className="campo" value={persona} onChange={(e) => setPersona(e.target.value)} required>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="t-etiqueta">Cuándo</span>
        <input className="campo" type="datetime-local" min={minimo} value={fecha} onChange={(e) => setFecha(e.target.value)} required />
      </label>
      <label style={{ gridColumn: "1 / -1" }}>
        <span className="t-etiqueta">Tema</span>
        <input className="campo" maxLength={300} value={tema} onChange={(e) => setTema(e.target.value)} required placeholder="Rutas y despacho, puntualidad…" />
      </label>
      <div className="os-form__acciones">
        <button className="boton boton--chico" disabled={enviando || !persona}>{enviando ? "Guardando…" : "Programar sesión"}</button>
        {error && <p className="os-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}

/** Una sesión: anotar los acuerdos y marcarla hecha (o devolverla a pendiente). */
export function Sesion({ id, acuerdos, hecho }: { id: string; acuerdos: string | null; hecho: boolean }) {
  const { enviar, enviando, error } = useEnviar();
  const [texto, setTexto] = useState(acuerdos ?? "");
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Acuerdos</span>
        <textarea className="campo" rows={2} maxLength={4000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué se acordó y para cuándo" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton boton--secundario boton--chico" disabled={enviando} onClick={() => void enviar(`/api/os/acompanamientos/${id}`, "PATCH", { acuerdos: texto || null })}>
          Guardar acuerdos
        </button>
        <button type="button" className="boton-enlace" disabled={enviando} onClick={() => void enviar(`/api/os/acompanamientos/${id}`, "PATCH", { hecho: !hecho, acuerdos: texto || null })}>
          {hecho ? "Volver a pendiente" : "Marcar hecha"}
        </button>
        {error && <span className="os-error" role="alert">{error}</span>}
      </div>
    </div>
  );
}
