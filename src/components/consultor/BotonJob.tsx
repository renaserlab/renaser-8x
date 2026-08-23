"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Progreso } from "@/components/base/Progreso";

/** Botón que encola un trabajo y muestra su avance real. Nunca una rueda. */
export function BotonJob({ url, json, texto, secundario = false, confirmar, alTerminar }: { url: string; json?: unknown; texto: string; secundario?: boolean; confirmar?: string; alTerminar?: () => void }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        className={`boton ${secundario ? "boton--secundario" : ""}`}
        disabled={cargando}
        onClick={async () => {
          if (confirmar && !confirm(confirmar)) return;
          setError(null);
          setCargando(true);
          try {
            const r = await pedir<{ job_id?: string; jobs?: string[] }>(url, { json: json ?? {} });
            setJobs(r.jobs ?? (r.job_id ? [r.job_id] : []));
            if (!r.jobs && !r.job_id) {
              router.refresh();
              alTerminar?.();
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo.");
          } finally {
            setCargando(false);
          }
        }}
      >
        {texto}
      </button>
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {jobs.map((j) => (
        <Progreso
          key={j}
          jobId={j}
          alTerminar={() => {
            router.refresh();
            alTerminar?.();
          }}
        />
      ))}
    </div>
  );
}
