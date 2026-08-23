"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { BotonGrabar } from "@/components/voz/BotonGrabar";

/**
 * "Así entendimos que funciona hoy" — el cliente confirma su realidad (fase 18)
 * y puede decir qué le gustaría que funcionara diferente (fase 19, deseo ≠ TO-BE).
 */
export function ConfirmarProceso({ processId, confirmacion, deseo }: { processId: string; confirmacion: string; deseo: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const mandar = async (accion?: "confirmado" | "corregir") => {
    setError(null);
    setEnviando(true);
    try {
      await pedir(`/api/processes/${processId}/confirmar`, { json: { accion, deseo: texto.trim() || undefined } });
      setTexto("");
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="panel p-5 mt-6 flex flex-col gap-4">
      <div>
        <h2 className="t-seccion" style={{ fontSize: 18 }}>Así entendimos que funciona hoy</h2>
        <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
          {confirmacion === "confirmado" ? "Confirmaste que este dibujo refleja la realidad. Si algo cambia, corrígelo cuando quieras." : "¿Este dibujo refleja cómo pasa de verdad? Si algo no es así, corrígelo arriba con tus manos y confirma al terminar."}
        </p>
      </div>
      {confirmacion !== "confirmado" && (
        <div className="flex flex-wrap gap-3">
          <button className="boton" disabled={enviando} onClick={() => mandar("confirmado")}>Está correcto</button>
          <button className="boton boton--secundario" disabled={enviando} onClick={() => mandar("corregir")}>Voy a corregirlo</button>
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--linea)", paddingTop: 16 }}>
        {deseo && !abierto && <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>Nos contaste que quisieras cambiar: “{deseo}”.</p>}
        {!abierto ? (
          <button className="boton boton--secundario" onClick={() => setAbierto(true)}>¿Hay algo que te gustaría que funcionara diferente?</button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>Cuéntalo con tus palabras: “quiero dejar de aprobar esto”, “quiero que el cliente espere menos”…</p>
            <BotonGrabar alTexto={(t) => setTexto((prev) => (prev ? prev + " " + t : t))} />
            <textarea className="campo" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Qué te gustaría cambiar" />
            <div className="flex gap-3">
              <button className="boton" disabled={enviando || !texto.trim()} onClick={() => mandar()}>Guardar</button>
              <button className="boton boton--secundario" onClick={() => setAbierto(false)}>Cancelar</button>
            </div>
          </div>
        )}
        {error && <p className="t-cuerpo mt-2" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      </div>
    </section>
  );
}
