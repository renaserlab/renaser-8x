"use client";
import { useCallback, useState } from "react";
import { Entrevista, type EstadoEntrevista } from "@/components/Entrevista";
import { pedir } from "@/lib/cliente";
import { TIPO_SESION } from "@/lib/textos";

type Ses = { id: string; tipo: string; estado: string };
type Est = { sesion: Ses | null; abierta: { id: string; pregunta: string; bloque: string | null } | null; respondidas: { id: string }[]; job: { progreso: string | null } | null; pendienteTranscripcion: boolean };

/** La conversación del dueño: sus sesiones, una a la vez. */
export function ConversacionCliente({ companyId, sesiones }: { companyId: string; sesiones: Ses[] }) {
  const pendientes = sesiones.filter((s) => s.estado !== "completa");
  const [activa, setActiva] = useState<Ses | null>(pendientes[0] ?? null);

  const cargar = useCallback(async (): Promise<EstadoEntrevista> => {
    if (!activa) return { activa: null, abierta: null, respondidas: 0, progreso: null, terminado: true };
    const e = await pedir<Est>(`/api/companies/${companyId}/interview/next`, { json: { session_id: activa.id } });
    const terminado = e.sesion?.estado === "completa";
    return { activa: e.sesion, abierta: e.abierta, respondidas: e.respondidas.length, progreso: e.job?.progreso ?? null, pendienteTranscripcion: e.pendienteTranscripcion, terminado };
  }, [companyId, activa]);

  const responder = async (d: { response_id: string; session_id: string; texto?: string; audio?: Blob }) => {
    const form = new FormData();
    form.set("response_id", d.response_id);
    if (d.audio) form.set("audio", d.audio, "respuesta.webm");
    else form.set("texto", d.texto ?? "");
    const r = await fetch(`/api/interviews/${d.session_id}/answer`, { method: "POST", body: form });
    if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "No pudimos guardar tu respuesta.");
  };

  if (!activa)
    return (
      <div className="panel p-6">
        <p className="t-seccion">Ya conversamos todo lo necesario por ahora.</p>
        <p className="t-cuerpo mt-2" style={{ color: "var(--grafito)" }}>Si tu consultor necesita algo más, aparecerá aquí.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {pendientes.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {pendientes.map((s) => (
            <button key={s.id} className={`boton ${s.id === activa.id ? "" : "boton--secundario"}`} style={{ minHeight: 40 }} onClick={() => setActiva(s)}>
              {TIPO_SESION[s.tipo] ?? s.tipo}
            </button>
          ))}
        </div>
      )}
      <Entrevista key={activa.id} cargar={cargar} responder={responder} titulo={TIPO_SESION[activa.tipo]} />
    </div>
  );
}
