"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Progreso } from "@/components/base/Progreso";

/**
 * Reencola en lote los trabajos perdidos por falta de crédito. El botón dice CUÁNTOS son antes de
 * hacer nada, y pide confirmación: reencolar es gastar crédito, y nadie gasta sin saber cuánto.
 */
export function BotonReencolarPausados({ cuantos }: { cuantos: number }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  if (cuantos === 0) return <p className="t-dato" style={{ color: "var(--grafito)", margin: 0 }}>No hay trabajos perdidos por falta de crédito pendientes de reencolar.</p>;
  return (
    <div className="flex flex-col gap-2">
      <button
        className="boton"
        disabled={cargando}
        onClick={async () => {
          if (!confirm(`Se van a reencolar ${cuantos} trabajo(s) que fallaron por falta de crédito. Los originales se conservan como constancia; no se repite lo que otro trabajo ya hizo bien. ¿Continuar?`)) return;
          setError(null);
          setCargando(true);
          try {
            const r = await pedir<{ candidatos: number; reencolados: number; omitidos: { id: string; motivo: string | null }[] }>("/api/torre/reencolar-pausados", { method: "POST", json: {} });
            setResultado(`${r.reencolados} de ${r.candidatos} reencolados${r.omitidos.length ? `; ${r.omitidos.length} omitidos (${[...new Set(r.omitidos.map((o) => o.motivo ?? "sin motivo"))].join(" · ")})` : ""}.`);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo.");
          } finally {
            setCargando(false);
          }
        }}
      >
        Reencolar {cuantos} trabajo(s) perdidos por crédito
      </button>
      {resultado && <p className="t-dato" role="status">{resultado}</p>}
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
    </div>
  );
}

/** Vuelve a pedir la extracción de una fuente atascada. Usa la ruta existente, que archiva lo anterior antes de releer. */
export function BotonReintentarExtraccion({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2 justify-end">
      <Progreso jobId={job} alTerminar={() => router.refresh()} />
      {error && <p className="t-dato" style={{ color: "var(--contradicho)", margin: 0 }} role="alert">{error}</p>}
      <button
        className="boton boton--secundario boton--chico"
        onClick={async () => {
          setError(null);
          try {
            const r = await pedir<{ job_id: string }>(`/api/sources/${sourceId}/extract`, { method: "POST" });
            setJob(r.job_id);
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo.");
          }
        }}
      >
        Reintentar extracción
      </button>
    </div>
  );
}
