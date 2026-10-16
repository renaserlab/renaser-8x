"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Progreso } from "@/components/base/Progreso";

export function AccionesFuente({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2 justify-end">
      <Progreso jobId={job} alTerminar={() => router.refresh()} />
      {mensaje && <span className="t-dato" role="status" style={{ color: "var(--grafito)" }}>{mensaje}</span>}
      <button
        className="boton boton--secundario"
        style={{ minHeight: 36 }}
        onClick={async () => {
          const r = await pedir<{ job_id: string; mensaje?: string }>(`/api/sources/${sourceId}/extract`, { method: "POST" });
          setMensaje(r.mensaje ?? null);
          setJob(r.job_id);
        }}
      >
        Volver a leer
      </button>
      <button
        className="boton boton--peligro"
        style={{ minHeight: 36 }}
        onClick={async () => {
          if (!confirm("¿Eliminar esta fuente y todas sus definiciones?")) return;
          await pedir(`/api/sources/${sourceId}/extract`, { method: "DELETE" });
          router.refresh();
        }}
      >
        Eliminar
      </button>
    </div>
  );
}

export function ReintentarJob({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Progreso jobId={nuevo} alTerminar={() => router.refresh()} />
      {aviso && <span className="t-dato" role="status">{aviso}</span>}
      <button
        className="boton boton--secundario"
        style={{ minHeight: 36 }}
        onClick={async () => {
          const r = await pedir<{ job_id: string | null; reencolado: boolean; motivo: string | null }>(`/api/jobs/${jobId}`, { method: "POST" });
          if (!r.reencolado) {
            setAviso(r.motivo ?? "No hacía falta reintentar: ya hubo una ejecución posterior correcta.");
            return;
          }
          setNuevo(r.job_id);
          router.refresh();
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
