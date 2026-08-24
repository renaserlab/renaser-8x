"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

/** El amigo que llega con el enlace crea su empresa en 20 segundos y empieza. Sin consultor, sin manual. */
export function CrearEmpresa() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [sector, setSector] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await pedir("/api/portal/empresa", { json: { nombre, sector } });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear tu empresa.");
      setCargando(false);
    }
  };

  return (
    <form onSubmit={crear} className="flex flex-col gap-5 medida">
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">¿Cómo se llama tu empresa?</span>
        <input className="campo" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="El nombre con el que la conocen" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">¿A qué se dedica? (opcional)</span>
        <input className="campo" value={sector} onChange={(e) => setSector(e.target.value)} placeholder="restaurante, transporte, estudio contable…" />
      </label>
      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      <button className="boton" disabled={cargando || nombre.trim().length < 2}>
        {cargando ? "Un momento…" : "Empezar"}
      </button>
      <p className="t-dato" style={{ color: "var(--grafito)" }}>
        En 15–20 minutos tendrás tu primer diagnóstico. No necesitas documentos perfectos: puedes hablar, subir fotos o contarnos cómo lo haces.
      </p>
    </form>
  );
}
