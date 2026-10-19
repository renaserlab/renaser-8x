"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

/** Marcar como leído un aviso (o todos los que te tocan). */
export function MarcarLeido({ id, todos = false, titulo }: { id?: string; todos?: boolean; titulo?: string }) {
  const { enviar, enviando, error } = useEnviar();
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        className={todos ? "boton boton--secundario boton--chico" : "boton-enlace boton-enlace--tenue"}
        disabled={enviando}
        aria-label={todos ? "Marcar todos como leídos" : `Marcar como leído: ${titulo ?? "aviso"}`}
        onClick={() => void enviar("/api/os/avisos/leer", "POST", todos ? { todos: true } : { ids: [id] })}
      >
        {enviando ? "Marcando…" : todos ? "Marcar todos como leídos" : "Marcar leído"}
      </button>
      {error && <span className="os-error" role="alert">{error}</span>}
    </span>
  );
}

/** Encender o apagar una revisión automática en esta empresa. */
export function InterruptorRegla({ regla, nombre, activa }: { regla: string; nombre: string; activa: boolean }) {
  const { enviar, enviando, error } = useEnviar();
  const [on, setOn] = useState(activa);
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        className="os-interruptor"
        aria-checked={on}
        aria-label={`${on ? "Apagar" : "Encender"}: ${nombre}`}
        disabled={enviando}
        onClick={async () => {
          const nuevo = !on;
          setOn(nuevo);
          if (!(await enviar("/api/os/reglas", "PATCH", { regla, activa: nuevo }))) setOn(!nuevo);
        }}
      />
      {error && <span className="os-error" role="alert">{error}</span>}
    </span>
  );
}
