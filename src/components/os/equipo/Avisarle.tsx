"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

/** «Avisarle»: un aviso para esa persona, que lo verá con contador en su menú. */
export function Avisarle({ personaId, nombre, chico = false }: { personaId: string; nombre: string; chico?: boolean }) {
  const { enviar, enviando, error } = useEnviar();
  const [hecho, setHecho] = useState(false);
  if (hecho) return <span className="t-dato" role="status" style={{ color: "var(--confirmado)" }}>Avisado</span>;
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        className={chico ? "boton boton--secundario boton--chico" : "boton"}
        disabled={enviando}
        aria-label={`Avisarle a ${nombre}`}
        onClick={async () => setHecho(await enviar("/api/os/equipo/avisar", "POST", { persona_id: personaId }))}
      >
        {enviando ? "Avisando…" : "Avisarle"}
      </button>
      {error && <span className="os-error" role="alert">{error}</span>}
    </span>
  );
}
