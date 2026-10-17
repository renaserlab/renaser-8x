"use client";
import { useState } from "react";

/**
 * EL FORMULARIO DE UNA DECISIÓN SOBRE UNA ACCIÓN: por qué y, cuando hace falta, qué implica. Rechazar,
 * posponer y modificar exigen las dos cosas (sección 12: quién, por qué, qué implica); bloquear, escalar,
 * devolver y volver a proponer exigen el porqué. La regla la aplica el servidor; esto solo evita el viaje
 * cuando está claro que falta algo.
 */
export function Decidir({ titulo, pideImplica, etiquetaMotivo = "Por qué", etiquetaImplica = "Qué implica (plazo, recursos, otra acción)", textoBoton, peligro = false, onEnviar, onCancelar }: {
  titulo: string;
  pideImplica: boolean;
  etiquetaMotivo?: string;
  etiquetaImplica?: string;
  textoBoton: string;
  peligro?: boolean;
  onEnviar: (motivo: string, implica: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [implica, setImplica] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = motivo.trim().length >= 8 && (!pideImplica || implica.trim().length > 0);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await onEnviar(motivo.trim(), implica.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2" style={{ borderLeft: `1px solid ${peligro ? "var(--contradicho)" : "var(--linea)"}`, paddingLeft: 12 }}>
      <p className="t-etiqueta">{titulo}</p>
      <textarea className="campo" rows={2} placeholder={`${etiquetaMotivo} (al menos 8 letras)`} aria-label={etiquetaMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {pideImplica && <textarea className="campo" rows={2} placeholder={etiquetaImplica} aria-label={etiquetaImplica} value={implica} onChange={(e) => setImplica(e.target.value)} />}
      <div className="flex gap-2 flex-wrap items-center">
        <button type="button" className={`boton ${peligro ? "boton--peligro" : "boton--secundario"}`} style={{ minHeight: 34, fontSize: 13 }} disabled={!listo || enviando} onClick={enviar}>
          {enviando ? "Guardando" : textoBoton}
        </button>
        <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
      </div>
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}
