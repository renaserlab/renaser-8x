"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Progreso } from "@/components/base/Progreso";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { CARGA_PORTAL } from "@/lib/textos";

/** Sube lo que tengas: documento, foto del cuaderno, nota de voz o un texto dictado. Capítulo 19.3. */
export function Subir({ companyId, paraCliente = false, transcriptor = false }: { companyId: string; paraCliente?: boolean; transcriptor?: boolean }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<{ id: string; nombre: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const enviar = async (form: FormData, etiqueta: string) => {
    setError(null);
    setSubiendo(true);
    form.set("company_id", companyId);
    if (fecha) form.set("fecha_origen", fecha);
    try {
      const r = await fetch("/api/sources", { method: "POST", body: form });
      const j = (await r.json()) as { job_id?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? "No pudimos subir eso.");
      setJobs((l) => [{ id: j.job_id!, nombre: etiqueta }, ...l]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos subir eso.");
    } finally {
      setSubiendo(false);
    }
  };

  const archivos = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      const form = new FormData();
      form.set("archivo", f);
      if (nombre) form.set("nombre", nombre);
      await enviar(form, f.name);
    }
    if (input.current) input.current.value = "";
  };

  const mandarTexto = async () => {
    const form = new FormData();
    form.set("texto", texto);
    form.set("nombre", nombre || "Nota");
    await enviar(form, nombre || "Nota");
    setTexto("");
  };

  const mandarAudio = async (blob: Blob) => {
    const form = new FormData();
    form.set("archivo", new File([blob], `nota-${Date.now()}.webm`, { type: blob.type || "audio/webm" }));
    form.set("tipo", "audio");
    form.set("nombre", nombre || "Nota de voz");
    await enviar(form, "Nota de voz");
  };

  return (
    <div className="flex flex-col gap-6">
      {paraCliente && <p className="t-cuerpo medida">{CARGA_PORTAL}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">Cómo se llama (opcional)</span>
          <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Plan estratégico, lista de precios…" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-etiqueta">De cuándo es (si lo sabes)</span>
          <input className="campo" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <input ref={input} type="file" multiple accept={transcriptor ? ".pdf,.txt,.md,.csv,image/*,audio/*,.ogg,.opus,.m4a,.mp3" : ".pdf,.txt,.md,.csv,image/*"} className="sr-only" id="archivo" onChange={(e) => archivos(e.target.files)} />
        <label htmlFor="archivo" className="boton boton--grande" style={{ cursor: "pointer" }}>
          {subiendo ? "Subiendo" : paraCliente ? "Subir archivo o foto" : "Subir documento, foto, audio o CSV"}
        </label>
        <p className="t-dato" style={{ color: "var(--grafito)" }}>PDF, foto, {transcriptor ? "nota de voz (también las de WhatsApp), " : ""}texto o CSV. Hasta 30 MB. Un Word: expórtalo a PDF. Un Excel: guárdalo como CSV.</p>
      </div>

      <BotonGrabar alTexto={(t) => setTexto((p) => (p ? p + " " + t : t))} alAudio={transcriptor ? mandarAudio : undefined} />

      <label className="flex flex-col gap-2">
        <span className="t-etiqueta">{paraCliente ? "O cuéntanos por escrito" : "O pega un texto (transcripción, nota, respuesta dada en reunión)"}</span>
        <textarea className="campo" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label={paraCliente ? "Cuéntanos por escrito" : "Texto"} />
      </label>
      <button className="boton boton--secundario" disabled={!texto.trim() || subiendo} onClick={mandarTexto}>
        Guardar texto
      </button>

      {error && <p className="t-cuerpo" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}

      {jobs.length > 0 && (
        <div className="flex flex-col gap-2">
          {jobs.map((j) => (
            <div key={j.id} className="flex items-baseline gap-3">
              <span className="t-dato">{j.nombre}</span>
              <Progreso jobId={j.id} paraCliente={paraCliente} alTerminar={() => router.refresh()} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
