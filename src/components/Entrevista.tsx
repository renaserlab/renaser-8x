"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { BotonEscuchar } from "@/components/voz/BotonEscuchar";
import { TIPO_SESION } from "@/lib/textos";

export type EstadoEntrevista = {
  activa: { id: string; tipo: string; estado: string } | null;
  abierta: { id: string; pregunta: string; bloque: string | null } | null;
  respondidas: number;
  progreso: string | null;
  pendienteTranscripcion?: boolean;
  terminado?: boolean;
};

/**
 * Una pregunta por pantalla. Hablando o escribiendo. Nunca se guarda lo dicho sin que la persona lo vea.
 * Capítulo 19. Se usa en el portal, en el enlace de participante y en el panel del consultor.
 */
export function Entrevista({ cargar, responder, titulo, transcriptor = false }: { cargar: () => Promise<EstadoEntrevista>; responder: (datos: { response_id: string; session_id: string; texto?: string; audio?: Blob }) => Promise<void>; titulo?: string; transcriptor?: boolean }) {
  const [estado, setEstado] = useState<EstadoEntrevista | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const e = await cargar();
      setEstado(e);
      setEsperando(!e.abierta && !!e.activa && !e.terminado);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la conversación.");
    }
  }, [cargar]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refrescar();
  }, [refrescar]);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (esperando) timer.current = setInterval(refrescar, 2500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [esperando, refrescar]);

  const enviar = async (t?: string, audio?: Blob) => {
    if (!estado?.abierta || !estado.activa) return;
    const cuerpo = (t ?? texto).trim();
    if (!cuerpo && !audio) return;
    setEnviando(true);
    setError(null);
    try {
      await responder({ response_id: estado.abierta.id, session_id: estado.activa.id, texto: audio ? undefined : cuerpo, audio });
      setTexto("");
      setEstado((e) => (e ? { ...e, abierta: null, respondidas: e.respondidas + 1 } : e));
      setEsperando(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar tu respuesta. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  if (error && !estado) return <p className="t-cuerpo" style={{ color: "var(--contradicho)" }}>{error}</p>;
  if (!estado) return <p className="t-dato" style={{ color: "var(--grafito)" }}>Cargando la conversación</p>;

  if (!estado.activa || estado.terminado)
    return (
      <div className="panel p-6 aparece">
        <p className="t-seccion">Listo. Gracias por tu tiempo.</p>
        <p className="t-cuerpo mt-2" style={{ color: "var(--grafito)" }}>Respondiste {estado.respondidas} preguntas. Con eso ya podemos trabajar.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="t-etiqueta">{titulo ?? TIPO_SESION[estado.activa.tipo] ?? "Conversación"}</span>
        <span className="t-dato" style={{ color: "var(--grafito)" }}>{estado.respondidas} respondidas</span>
      </div>

      {estado.abierta ? (
        <div className="aparece flex flex-col gap-6" key={estado.abierta.id}>
          <p className="t-seccion medida" style={{ fontSize: 24, lineHeight: 1.35 }}>{estado.abierta.pregunta}</p>
          <div className="flex flex-wrap gap-3">
            <BotonEscuchar texto={estado.abierta.pregunta} />
          </div>
          <BotonGrabar alTexto={(t) => setTexto((prev) => (prev ? prev + " " + t : t))} alAudio={transcriptor ? (b) => enviar(undefined, b) : undefined} />
          <label className="flex flex-col gap-2">
            <span className="t-etiqueta">O escribe tu respuesta</span>
            <textarea className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder="" aria-label="Tu respuesta" />
          </label>
          {texto.trim() && (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>
              Esto es lo que vamos a guardar. Si quieres cambiar algo, edítalo arriba.
            </p>
          )}
          {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
          <button className="boton boton--grande" disabled={enviando || !texto.trim()} onClick={() => enviar()}>
            {enviando ? "Guardando" : "Guardar respuesta"}
          </button>
        </div>
      ) : (
        <p className="t-cuerpo aparece" style={{ color: "var(--grafito)" }} aria-live="polite">
          {estado.pendienteTranscripcion ? "Escuchando tu respuesta" : estado.progreso ?? "Preparando la siguiente pregunta"}
          <span aria-hidden="true"> …</span>
        </p>
      )}
    </div>
  );
}
