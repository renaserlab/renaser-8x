"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { BotonEscuchar } from "@/components/voz/BotonEscuchar";
import { TIPO_SESION } from "@/lib/textos";

export type CoberturaEntrevista = { porcentaje: number; areas: { clave: string; nombre: string; cubierta: boolean }[] };

export type EstadoEntrevista = {
  activa: { id: string; tipo: string; estado: string } | null;
  abierta: { id: string; pregunta: string; bloque: string | null } | null;
  respondidas: number;
  cobertura?: CoberturaEntrevista | null;
  progreso: string | null;
  pendienteTranscripcion?: boolean;
  terminado?: boolean;
};

/**
 * Una pregunta por pantalla. Hablando o escribiendo. Nunca se guarda lo dicho sin que la persona lo vea.
 * Capítulo 19. Se usa en el portal, en el enlace de participante y en el panel del consultor.
 */
export function Entrevista({ cargar, responder, transcribir, titulo, transcriptor = false }: { cargar: () => Promise<EstadoEntrevista>; responder: (datos: { response_id: string; session_id: string; texto?: string; audio?: Blob }) => Promise<void>; transcribir?: (audio: Blob) => Promise<string>; titulo?: string; transcriptor?: boolean }) {
  const [estado, setEstado] = useState<EstadoEntrevista | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [audioListo, setAudioListo] = useState<Blob | null>(null);
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
      await responder({ response_id: estado.abierta.id, session_id: estado.activa.id, texto: audio ? undefined : cuerpo, audio: audio ?? audioListo ?? undefined });
      setTexto("");
      setAudioListo(null);
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
        <p className="t-cuerpo mt-2" style={{ color: "var(--grafito)" }}>Con lo que nos contaste ya comprendimos lo que necesitábamos. Si aparece algo más, te avisamos por aquí.</p>
      </div>
    );

  const cob = estado.cobertura ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <span className="t-etiqueta">{titulo ?? TIPO_SESION[estado.activa.tipo] ?? "Conversación"}</span>
          {cob && <span className="t-dato" style={{ color: "var(--grafito)" }}>{cob.porcentaje >= 100 ? "Comprendido" : cob.porcentaje >= 70 ? "Ya comprendimos casi todo" : `Comprendido ${cob.porcentaje}%`}</span>}
        </div>
        {cob && cob.areas.length > 0 && (
          <div aria-hidden="true" style={{ display: "flex", gap: 3 }}>
            {cob.areas.map((a) => (
              <span key={a.clave} title={a.nombre} style={{ flex: 1, height: 3, borderRadius: 2, background: a.cubierta ? "var(--marca)" : "var(--linea)", transition: "background var(--dur)" }} />
            ))}
          </div>
        )}
      </div>

      {estado.abierta ? (
        <div className="aparece flex flex-col gap-6" key={estado.abierta.id}>
          <p className="t-seccion medida" style={{ fontSize: 24, lineHeight: 1.35 }}>{estado.abierta.pregunta}</p>
          <div className="flex flex-wrap gap-3">
            <BotonEscuchar texto={estado.abierta.pregunta} />
          </div>
          <BotonGrabar
            alTexto={(t) => setTexto((prev) => (prev ? prev + " " + t : t))}
            alAudio={
              transcriptor && transcribir
                ? async (b) => {
                    // Audio real → transcripción → la persona LEE el texto y confirma antes de guardar.
                    setTranscribiendo(true);
                    setError(null);
                    try {
                      const t = await transcribir(b);
                      setTexto(t);
                      setAudioListo(b);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "No pudimos entender el audio. Intenta de nuevo o escribe.");
                    } finally {
                      setTranscribiendo(false);
                    }
                  }
                : undefined
            }
          />
          {transcribiendo && (
            <p className="t-cuerpo aparece" aria-live="polite" style={{ color: "var(--grafito)" }}>Escuchando tu respuesta…</p>
          )}
          <label className="flex flex-col gap-2">
            <span className="t-etiqueta">O escribe tu respuesta</span>
            <textarea className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder="" aria-label="Tu respuesta" />
          </label>
          {texto.trim() && (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>
              {audioListo ? "Esto fue lo que entendimos de tu audio. Corrige lo que quieras y guarda." : "Esto es lo que vamos a guardar. Si quieres cambiar algo, edítalo arriba."}
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
