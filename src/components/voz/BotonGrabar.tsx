"use client";
import { useRef, useState } from "react";
import { useEsCliente } from "@/lib/hooks";

type SR = { start: () => void; stop: () => void; abort: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

function obtenerReconocimiento(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * La voz es el canal principal. Capítulo 19.2.
 * Usa el reconocimiento del navegador (sin llave) y muestra lo entendido para que la persona confirme.
 * Si el navegador no lo soporta, graba audio (MediaRecorder) y lo entrega como Blob para transcribir en el servidor.
 */
export function BotonGrabar({ alTexto, alAudio, grande = true }: { alTexto: (t: string) => void; alAudio?: (b: Blob) => void; grande?: boolean }) {
  const [grabando, setGrabando] = useState(false);
  const [parcial, setParcial] = useState("");
  const esCliente = useEsCliente();
  const soporte: "voz" | "audio" | "ninguno" = !esCliente ? "ninguno" : obtenerReconocimiento() ? "voz" : navigator.mediaDevices && typeof MediaRecorder !== "undefined" ? "audio" : "ninguno";
  const rec = useRef<SR | null>(null);
  const mr = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const acumulado = useRef("");

  const empezarVoz = () => {
    const Ctor = obtenerReconocimiento();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "es-PE";
    r.continuous = true;
    r.interimResults = true;
    acumulado.current = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) acumulado.current += res[0].transcript + " ";
        else interim += res[0].transcript;
      }
      setParcial((acumulado.current + interim).trim());
    };
    r.onend = () => {
      setGrabando(false);
      const t = acumulado.current.trim();
      if (t) alTexto(t);
      setParcial("");
    };
    r.onerror = () => setGrabando(false);
    rec.current = r;
    r.start();
    setGrabando(true);
  };

  const empezarAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(stream);
      trozos.current = [];
      m.ondataavailable = (e) => trozos.current.push(e.data);
      m.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(trozos.current, { type: m.mimeType || "audio/webm" });
        setGrabando(false);
        alAudio?.(blob);
      };
      mr.current = m;
      m.start();
      setGrabando(true);
    } catch {
      setGrabando(false);
    }
  };

  const alternar = () => {
    if (grabando) {
      rec.current?.stop();
      mr.current?.stop();
      return;
    }
    if (soporte === "voz") empezarVoz();
    else if (soporte === "audio" && alAudio) empezarAudio();
  };

  if (soporte === "ninguno" || (soporte === "audio" && !alAudio)) return null;

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={alternar} className={`boton ${grande ? "boton--grande" : ""}`} aria-pressed={grabando} style={grabando ? { background: "var(--contradicho)", borderColor: "var(--contradicho)" } : undefined}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
          <rect x="7" y="2" width="6" height="10" rx="3" />
          <path d="M4 9a6 6 0 0 0 12 0h-1.5a4.5 4.5 0 0 1-9 0H4zM9.25 15h1.5v3h-1.5z" />
        </svg>
        {grabando ? "Detener y usar lo dicho" : "Responder hablando"}
      </button>
      {grabando && (
        <p className="t-cuerpo aparece" aria-live="polite" style={{ color: "var(--grafito)", minHeight: 26 }}>
          {parcial || "Te escucho…"}
        </p>
      )}
    </div>
  );
}
