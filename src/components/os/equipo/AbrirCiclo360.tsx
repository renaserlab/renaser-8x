"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

/**
 * ABRIR EL CICLO 360 DEL MES para las personas elegidas. A cada una la evalúan ella misma, quien abre el ciclo como su
 * jefe y hasta dos compañeros con cuenta. Cada uno responde en «Mi perfil».
 */
export function AbrirCiclo360({ personas, ciclo }: { personas: { id: string; nombre: string; conCuenta: boolean }[]; ciclo: string }) {
  const { enviar, enviando, error } = useEnviar();
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [resultado, setResultado] = useState<string | null>(null);
  const alternar = (id: string) => setElegidas((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setResultado(null);
        if (await enviar("/api/os/evaluaciones/ciclo", "POST", { personas: elegidas })) {
          setResultado(`Ciclo ${ciclo} abierto para ${elegidas.length} ${elegidas.length === 1 ? "persona" : "personas"}.`);
          setElegidas([]);
        }
      }}
    >
      <fieldset className="flex flex-col gap-2" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-etiqueta" style={{ marginBottom: 8 }}>¿A quiénes evaluamos este mes?</legend>
        <div className="flex flex-wrap gap-2">
          {personas.map((p) => (
            <label key={p.id} className="os-pildora" style={{ gap: 8 }}>
              <input type="checkbox" checked={elegidas.includes(p.id)} onChange={() => alternar(p.id)} />
              {p.nombre}
              {!p.conCuenta && <span className="os-persona__sub">· sin cuenta</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button className="boton boton--chico" disabled={enviando || !elegidas.length}>{enviando ? "Abriendo…" : `Abrir el ciclo ${ciclo}`}</button>
        <button type="button" className="boton-enlace boton-enlace--tenue" onClick={() => setElegidas(personas.map((p) => p.id))}>Elegir a todos</button>
        {resultado && <p className="os-ok" role="status">{resultado}</p>}
        {error && <p className="os-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}
