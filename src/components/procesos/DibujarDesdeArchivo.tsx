"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Progreso } from "@/components/base/Progreso";

type Props = {
  processId: string;
  sourceId: string;
  nombreArchivo: string;
  /** El proceso ya tiene pasos: dibujarlo otra vez los reemplaza, y eso se confirma antes. */
  yaDibujado: boolean;
  paraCliente?: boolean;
};

/**
 * «DIBUJARLO CON LO QUE SUBISTE» (16-10-2026). Manda el archivo ya leído a dibujar (POST /api/processes/[id]/dibujar),
 * muestra el avance real del trabajo (Progreso, nunca una rueda) y, al terminar, recarga la página: el lienzo de arriba
 * toma el dibujo nuevo y desde ahí se corrige como siempre.
 *
 * Si el proceso ya está dibujado, el botón dice que lo vuelve a dibujar y pide confirmación: lo dibujado se reemplaza.
 * Todo fallo se dice con las palabras de la ruta (todavía leyéndose, sin texto, archivo ajeno…).
 */
export function DibujarDesdeArchivo({ processId, sourceId, nombreArchivo, yaDibujado, paraCliente = false }: Props) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [job, setJob] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const dibujar = async () => {
    setEnviando(true);
    setError(null);
    setAviso(null);
    setListo(false);
    try {
      const r = await pedir<{ job_id: string; aviso?: string }>(`/api/processes/${processId}/dibujar`, { json: { source_id: sourceId, ...(yaDibujado ? { reemplazar: true } : {}) } });
      setJob(r.job_id);
      setAviso(r.aviso ?? null);
      setConfirmando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos mandarlo a dibujar. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {!job && !confirmando && (
        <div>
          <button
            type="button"
            className={yaDibujado ? "boton boton--secundario" : "boton"}
            disabled={enviando}
            onClick={() => (yaDibujado ? setConfirmando(true) : void dibujar())}
            aria-label={`${yaDibujado ? "Volver a dibujarlo" : "Dibujarlo"} con «${nombreArchivo}»`}
          >
            {enviando ? "Mandándolo a dibujar…" : yaDibujado ? "Volver a dibujarlo con este archivo" : "Dibujarlo con lo que subiste"}
          </button>
        </div>
      )}
      {confirmando && !job && (
        <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Confirmar que se vuelve a dibujar">
          <span className="t-dato">Lo que está dibujado se reemplaza por lo que leamos de «{nombreArchivo}». ¿Seguimos?</span>
          <button type="button" className="boton" disabled={enviando} onClick={() => void dibujar()}>
            {enviando ? "Mandándolo a dibujar…" : "Sí, volver a dibujarlo"}
          </button>
          <button type="button" className="boton boton--secundario" disabled={enviando} onClick={() => setConfirmando(false)}>
            No
          </button>
        </div>
      )}
      {aviso && (
        <p className="t-dato" role="status" style={{ color: "var(--caducado)" }}>
          {aviso}
        </p>
      )}
      <Progreso
        jobId={job}
        paraCliente={paraCliente}
        alTerminar={(j) => {
          if (j.estado === "hecho") {
            setListo(true);
            setJob(null);
          }
          router.refresh();
        }}
      />
      {listo && (
        <p className="t-dato" role="status" style={{ color: "var(--confirmado)" }}>
          Listo: ya está dibujado. {paraCliente ? "Corrígelo en el dibujo y guarda." : "Revísalo en el lienzo y guarda."}
        </p>
      )}
      {error && (
        <p className="t-dato" role="alert" style={{ color: "var(--contradicho)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
