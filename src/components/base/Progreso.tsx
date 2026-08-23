"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Job = { id: string; estado: string; progreso: string | null; error: string | null };

/** Progreso real, nunca una rueda. Lee jobs.progreso por Realtime (con respaldo por sondeo). Capítulo 29.2. */
export function Progreso({ jobId, alTerminar, paraCliente = false }: { jobId: string | null; alTerminar?: (j: Job) => void; paraCliente?: boolean }) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let vivo = true;
    const sb = supabaseBrowser();
    const leer = async () => {
      const r = await fetch(`/api/jobs/${jobId}`);
      if (!r.ok || !vivo) return;
      const j = (await r.json()) as Job;
      setJob(j);
      if (j.estado === "hecho" || j.estado === "fallido") alTerminar?.(j);
    };
    leer();
    const canal = sb
      .channel(`job-${jobId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` }, (p) => {
        const j = p.new as Job;
        setJob(j);
        if (j.estado === "hecho" || j.estado === "fallido") alTerminar?.(j);
      })
      .subscribe();
    const t = setInterval(() => {
      setJob((j) => {
        if (!j || j.estado === "pendiente" || j.estado === "corriendo") leer();
        return j;
      });
    }, 4000);
    return () => {
      vivo = false;
      clearInterval(t);
      sb.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  if (!jobId || !job) return null;
  if (job.estado === "hecho") return null;
  if (job.estado === "fallido")
    return (
      <p className="t-dato aparece" style={{ color: "var(--contradicho)" }} role="status">
        {paraCliente ? "Algo no salió bien. Tu consultor ya lo sabe." : `Falló: ${job.error ?? "sin detalle"}`}
      </p>
    );
  return (
    <p className="t-dato aparece" style={{ color: "var(--grafito)" }} role="status" aria-live="polite">
      {job.progreso ?? (job.estado === "pendiente" ? "En cola" : "Trabajando")}
      <span aria-hidden="true"> …</span>
    </p>
  );
}
