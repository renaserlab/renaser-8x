"use client";
import { useEffect, useState } from "react";
import { useEsCliente } from "@/lib/hooks";

/** Toda pregunta se puede escuchar. Usa la síntesis del navegador (sin llave). Capítulo 19.2. */
export function BotonEscuchar({ texto }: { texto: string }) {
  const [hablando, setHablando] = useState(false);
  const esCliente = useEsCliente();
  const soporta = esCliente && "speechSynthesis" in window;
  useEffect(() => () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
  if (!soporta) return null;
  const alternar = () => {
    if (hablando) {
      window.speechSynthesis.cancel();
      setHablando(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-PE";
    const voz = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
    if (voz) u.voice = voz;
    u.rate = 0.95;
    u.onend = () => setHablando(false);
    setHablando(true);
    window.speechSynthesis.speak(u);
  };
  return (
    <button type="button" onClick={alternar} className="boton boton--secundario" aria-pressed={hablando} aria-label={hablando ? "Detener lectura" : "Escuchar la pregunta"}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
        {hablando ? <rect x="4" y="4" width="10" height="10" rx="1" /> : <path d="M5 3v12l9-6z" />}
      </svg>
      {hablando ? "Detener" : "Escuchar"}
    </button>
  );
}
