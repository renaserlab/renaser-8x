"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
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
export function Entrevista({ cargar, responder, transcribir, titulo, transcriptor = false }: { cargar: () => Promise<EstadoEntrevista>; responder: (datos: { response_id: string; session_id: string; texto?: string; audio?: Blob }) => Promise<void>; transcribir?: (audio: Blob, segundos?: number) => Promise<string>; titulo?: string; transcriptor?: boolean }) {
  const [estado, setEstado] = useState<EstadoEntrevista | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [audioListo, setAudioListo] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // La espera se siente viva: se ve el trabajo, no el silencio (auditoría anti-aburrimiento).
  const FRASES_ESPERA = ["Cruzando tu respuesta con todo lo que ya sabemos", "Buscando qué es lo más valioso que preguntarte ahora", "Revisando que no te preguntemos nada dos veces", "Preparando la siguiente pregunta"];
  const [fraseEspera, setFraseEspera] = useState(0);
  useEffect(() => {
    if (!esperando) return;
    const t = setInterval(() => setFraseEspera((f) => (f + 1) % FRASES_ESPERA.length), 3500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esperando]);

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
    <MotionConfig reducedMotion="user">
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <span className="t-etiqueta">{titulo ?? TIPO_SESION[estado.activa.tipo] ?? "Conversación"}</span>
          {cob && <span className="t-dato" style={{ color: "var(--grafito)" }}>{cob.porcentaje >= 100 ? "Comprendido" : cob.porcentaje >= 70 ? "Ya comprendimos casi todo" : `Comprendido ${cob.porcentaje}%`}</span>}
        </div>
        {cob && cob.areas.length > 0 && (
          // LA RUTA DE LA CONVERSACIÓN como diagrama (pedido de Kelin): estaciones que se llenan
          // al avanzar — verde lo comprendido, azul donde estás. El gráfico ES el avance.
          <div aria-label="Ruta de la conversación">
            <div className="flex items-center" style={{ paddingTop: 4 }}>
              {cob.areas.map((a, i) => {
                const idxActual = cob.areas.findIndex((x) => !x.cubierta);
                const actual = i === idxActual;
                return (
                  <span key={a.clave} className="flex items-center" style={{ flex: i === cob.areas.length - 1 ? "none" : 1, minWidth: 0 }}>
                    <span
                      title={a.nombre}
                      style={{
                        width: actual ? 16 : 13, height: actual ? 16 : 13, borderRadius: "50%", flex: "none",
                        background: a.cubierta ? "var(--confirmado)" : actual ? "var(--marca)" : "var(--papel)",
                        border: `2px solid ${a.cubierta ? "var(--confirmado)" : actual ? "var(--marca)" : "var(--linea)"}`,
                        transition: "all var(--dur)",
                      }}
                    />
                    {i < cob.areas.length - 1 && (
                      <span style={{ height: 2, flex: 1, background: a.cubierta ? "var(--confirmado)" : "var(--linea)", transition: "background var(--dur)" }} />
                    )}
                  </span>
                );
              })}
            </div>
            <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 12, marginTop: 6 }}>
              {(() => {
                const actual = cob.areas.find((a) => !a.cubierta);
                const hechas = cob.areas.filter((a) => a.cubierta).length;
                return actual ? `${hechas} de ${cob.areas.length} · ahora: ${actual.nombre}` : "Ruta completa";
              })()}
            </p>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {estado.abierta ? (
        <motion.div className="flex flex-col gap-6" key={estado.abierta.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: "easeOut" }}>
          <p className="t-hero medida" style={{ fontSize: "clamp(24px, 4.5vw, 30px)" }}>{estado.abierta.pregunta}</p>
          <div className="flex flex-wrap gap-3">
            <BotonEscuchar texto={estado.abierta.pregunta} />
          </div>
          <BotonGrabar
            alTexto={(t) => setTexto((prev) => (prev ? prev + " " + t : t))}
            alAudio={
              transcriptor && transcribir
                ? async (b, segundos) => {
                    // Audio real → transcripción → la persona LEE el texto y confirma antes de guardar.
                    setTranscribiendo(true);
                    setError(null);
                    try {
                      const t = await transcribir(b, segundos);
                      setTexto(t);
                      setAudioListo(b);
                    } catch {
                      // JAMÁS se pierde lo hablado: si la transcripción en vivo falla (audio largo,
                      // servidor saturado), el audio queda listo para guardarse igual — lo
                      // transcribimos nosotros en segundo plano (caso real: 5 minutos de Darren).
                      setAudioListo(b);
                      setError("El audio quedó grabado, pero tardamos en convertirlo a texto. Guárdalo con el botón de abajo y nosotros lo escuchamos — no tienes que repetir nada.");
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
            <textarea className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder="Con tus palabras, como se lo contarías a alguien" aria-label="Tu respuesta" />
            {/* BORRAR EN UN TOQUE: en el celular vaciar una caja larga es borrar letra por letra. */}
            {texto.trim() && (
              <button
                type="button"
                className="t-dato"
                style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--grafito)", padding: 0, alignSelf: "flex-start" }}
                onClick={() => { setTexto(""); setAudioListo(null); setError(null); }}
              >
                Borrar y empezar de nuevo
              </button>
            )}
          </label>
          {texto.trim() && audioListo && (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>Esto entendimos de tu audio — corrige lo que quieras y guarda.</p>
          )}
          {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
          {audioListo && !texto.trim() ? (
            <button className="boton boton--grande" disabled={enviando} onClick={() => enviar(undefined, audioListo)}>
              {enviando ? "Guardando tu audio" : "Guardar mi audio (lo escuchamos nosotros)"}
            </button>
          ) : (
            <button className="boton boton--grande" disabled={enviando || !texto.trim()} onClick={() => enviar()}>
              {enviando ? "Guardando" : "Guardar respuesta"}
            </button>
          )}
        </motion.div>
      ) : (
        <motion.p className="t-cuerpo" key="esperando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} style={{ color: "var(--grafito)" }} aria-live="polite">
          {estado.pendienteTranscripcion ? "Escuchando tu respuesta" : estado.progreso ?? FRASES_ESPERA[fraseEspera]}
          <span aria-hidden="true"> …</span>
        </motion.p>
      )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
