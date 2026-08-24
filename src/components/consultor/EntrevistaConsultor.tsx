"use client";
import { transcribirAudio } from "@/lib/transcribir-cliente";
import { useCallback } from "react";
import { Entrevista, type EstadoEntrevista } from "@/components/Entrevista";
import { pedir } from "@/lib/cliente";

type Est = { sesion: { id: string; tipo: string; estado: string } | null; abierta: { id: string; pregunta: string; bloque: string | null } | null; respondidas: { id: string; pregunta: string; respuesta: string }[]; job: { progreso: string | null } | null; pendienteTranscripcion: boolean };

/** El consultor conduce una sesión (o la responde en nombre del cliente, p. ej. en una reunión). */
export function EntrevistaConsultor({ companyId, sessionId, transcriptor = false }: { companyId: string; sessionId: string; transcriptor?: boolean }) {
  const cargar = useCallback(async (): Promise<EstadoEntrevista> => {
    const e = await pedir<Est>(`/api/companies/${companyId}/interview/next`, { json: { session_id: sessionId } });
    return { activa: e.sesion, abierta: e.abierta, respondidas: e.respondidas.length, progreso: e.job?.progreso ?? null, pendienteTranscripcion: e.pendienteTranscripcion, terminado: e.sesion?.estado === "completa" };
  }, [companyId, sessionId]);

  const responder = async (d: { response_id: string; session_id: string; texto?: string; audio?: Blob }) => {
    const form = new FormData();
    form.set("response_id", d.response_id);
    if (d.audio) form.set("audio", d.audio, "respuesta.webm");
    else form.set("texto", d.texto ?? "");
    const r = await fetch(`/api/interviews/${d.session_id}/answer`, { method: "POST", body: form });
    if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "No se pudo guardar.");
  };

  return <Entrevista cargar={cargar} responder={responder} transcriptor={transcriptor} transcribir={transcribirAudio} />;
}
