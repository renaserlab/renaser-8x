"use client";
import { useState } from "react";
import { MIN_LETRAS } from "@/lib/iniciativas";

const letras = (t: string) => Array.from(t).filter((c) => c.toLowerCase() !== c.toUpperCase()).length;

/**
 * EL FORMULARIO DE UN PASO QUE PIDE EXPLICACIÓN. Descartar, cerrar y reanudar piden el porqué. Continuar,
 * ajustar y detener piden además qué se observó: una decisión sobre una apuesta se toma con evidencia. Si
 * la iniciativa no tiene indicador enlazado se puede anotar un valor observado; si lo tiene, el valor sale
 * del indicador y aquí no se escribe. La regla la aplica el servidor; esto solo evita el viaje cuando está
 * claro que falta algo.
 */
export function PasoConMotivo({ titulo, etiquetaMotivo, pideEvidencia, pideValor, textoBoton, peligro = false, onEnviar, onCancelar }: {
  titulo: string;
  etiquetaMotivo: string;
  pideEvidencia: boolean;
  pideValor: boolean;
  textoBoton: string;
  peligro?: boolean;
  onEnviar: (datos: { motivo: string; que_se_observo: string; valor_observado: string }) => Promise<void>;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [observado, setObservado] = useState("");
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = letras(motivo) >= MIN_LETRAS && (!pideEvidencia || letras(observado) >= MIN_LETRAS);

  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      await onEnviar({ motivo: motivo.trim(), que_se_observo: observado.trim(), valor_observado: valor.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2" style={{ borderLeft: `2px solid ${peligro ? "var(--contradicho)" : "var(--linea)"}`, paddingLeft: 12 }}>
      <p className="t-etiqueta">{titulo}</p>
      <textarea className="campo" rows={2} placeholder={`${etiquetaMotivo} (al menos ${MIN_LETRAS} letras)`} aria-label={etiquetaMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {pideEvidencia && (
        <textarea className="campo" rows={2} placeholder={`Qué se observó: el hecho o la cifra en que se apoya la decisión (al menos ${MIN_LETRAS} letras)`} aria-label="Qué se observó" value={observado} onChange={(e) => setObservado(e.target.value)} />
      )}
      {pideEvidencia && pideValor && (
        <div>
          <input className="campo" style={{ maxWidth: 260 }} inputMode="decimal" placeholder="Valor observado, si hay un número" aria-label="Valor observado" value={valor} onChange={(e) => setValor(e.target.value)} />
          <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12 }}>Si no hay número, déjalo vacío. Vacío no es cero: la decisión queda anotada como tomada sin dato.</p>
        </div>
      )}
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
