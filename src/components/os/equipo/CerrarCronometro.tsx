"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

/** Cerrar un cronómetro olvidado a la hora que de verdad terminó (en el reloj de la empresa). */
export function CerrarCronometro({ registroId, nombre, sugerido, minimo, maximo }: { registroId: string; nombre: string; sugerido: string; minimo: string; maximo: string }) {
  const { enviar, enviando, error } = useEnviar();
  const [fin, setFin] = useState(sugerido);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await enviar(`/api/os/equipo/cronometro/${registroId}/cerrar`, "POST", { fin });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Terminó a las</span>
        <input type="datetime-local" className="campo campo--auto" value={fin} min={minimo} max={maximo} onChange={(e) => setFin(e.target.value)} required />
      </label>
      <button className="boton boton--secundario" disabled={enviando} aria-label={`Cerrar el cronómetro de ${nombre}`}>
        {enviando ? "Cerrando…" : "Cerrarlo"}
      </button>
      {error && <p className="os-error w-full" role="alert">{error}</p>}
    </form>
  );
}
