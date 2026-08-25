"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { transcribirAudio } from "@/lib/transcribir-cliente";
import { Progreso } from "@/components/base/Progreso";
import { VACIO } from "@/lib/textos";

export type ProcesoResumen = { id: string; nombre: string; area: string | null; version: string; origen: string; padre_id: string | null; nodos: number; tiene_tobe: boolean; tiene_sop: boolean };

/** Lista de procesos + crear uno nuevo: describiéndolo (la IA dibuja) o en blanco (tú dibujas). */
export function ProcesosLista({ companyId, procesos, base, paraCliente = false }: { companyId: string; procesos: ProcesoResumen[]; base: string; paraCliente?: boolean }) {
  const router = useRouter();
  const [descripcion, setDescripcion] = useState("");
  const [audioOriginal, setAudioOriginal] = useState<Blob | null>(null);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [job, setJob] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generar = async () => {
    setError(null);
    try {
      const r = await pedir<{ job_id: string; process_id: string }>("/api/processes/generate", { json: { company_id: companyId, descripcion, nombre } });
      if (audioOriginal && r.process_id) {
        const form = new FormData();
        form.set("company_id", companyId);
        form.set("archivo", new File([audioOriginal], "proceso.webm", { type: audioOriginal.type || "audio/webm" }));
        form.set("nombre", `Audio original — ${nombre.trim() || "proceso contado"}`);
        form.set("process_id", r.process_id);
        fetch("/api/sources", { method: "POST", body: form }).catch(() => {});
      }
      setJob(r.job_id);
      setDescripcion("");
      setAudioOriginal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    }
  };
  const enBlanco = async () => {
    // Crea un proceso vacío vía generate con process_id nulo no aplica: se crea con un nodo inicial por PUT.
    const r = await pedir<{ job_id: string; process_id: string }>("/api/processes/generate", { json: { company_id: companyId, descripcion: "(vacío)", nombre: nombre || "Proceso nuevo" } }).catch(() => null);
    if (r?.process_id) router.push(`${base}/${r.process_id}`);
  };

  const asis = procesos.filter((p) => p.version === "as_is");

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
      <section className="flex flex-col gap-4">
        <h2 className="t-seccion">{paraCliente ? "Cuéntanos un proceso" : "Nuevo proceso"}</h2>
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          {paraCliente ? "Por ejemplo: cómo entra un cliente hasta que paga. Cuéntalo como se lo contarías a alguien nuevo, con lo que se traba y lo que se pierde." : "Describe el proceso real, no el ideal. La IA devuelve nodos y conexiones editables."}
        </p>
        <input className="campo" placeholder="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre del proceso" />
        <BotonGrabar
          alTexto={(t) => setDescripcion((p) => (p ? p + " " + t : t))}
          alAudio={async (b) => {
            setTranscribiendo(true);
            setError(null);
            try {
              const t = await transcribirAudio(b);
              setDescripcion((p) => (p ? p + " " + t : t));
              setAudioOriginal(b); // el audio original se conserva junto al proceso
            } catch (e) {
              setError(e instanceof Error ? e.message : "No pudimos entender el audio.");
            } finally {
              setTranscribiendo(false);
            }
          }}
        />
        {transcribiendo && <p className="t-dato aparece" aria-live="polite" style={{ color: "var(--grafito)" }}>Escuchando tu audio…</p>}
        <textarea className="campo" rows={5} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-label="Describe el proceso" placeholder={paraCliente ? "Un cliente escribe por WhatsApp, alguien le responde, se le pasa el precio…" : "El lead entra por WhatsApp, un asesor lo contacta…"} />
        {error && <p className="t-dato" style={{ color: "var(--contradicho)" }}>{error}</p>}
        <div className="flex flex-wrap gap-3 items-center">
          <button className="boton" onClick={generar} disabled={!descripcion.trim()}>Dibujarlo</button>
          {!paraCliente && <button className="boton boton--secundario" onClick={enBlanco}>Empezar en blanco</button>}
        </div>
        {!descripcion.trim() && <p className="t-dato" style={{ color: "var(--grafito)" }}>Primero cuéntanos el proceso — hablando o escribiendo — y nosotros lo dibujamos.</p>}
        <Progreso jobId={job} paraCliente={paraCliente} alTerminar={() => router.refresh()} />
      </section>

      <section>
        <h2 className="t-seccion mb-4">{paraCliente ? "Tus procesos" : "Procesos"}</h2>
        {asis.length === 0 ? (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>{VACIO.procesos}</p>
        ) : paraCliente ? (
          <div className="flex flex-col gap-3">
            {asis.map((p) => (
              <Link key={p.id} href={`${base}/${p.id}`} className="panel p-4 flex items-center justify-between gap-3">
                <span style={{ minWidth: 0 }}>
                  <span className="t-seccion" style={{ fontSize: 17 }}>{p.nombre}</span>
                  <span className="block t-dato mt-1" style={{ color: "var(--grafito)" }}>
                    {p.nodos} paso{p.nodos === 1 ? "" : "s"} · {p.origen === "generado_ia" ? "lo dibujamos con lo que contaste" : "dibujado a mano"}
                  </span>
                </span>
                <span className="t-dato" style={{ color: "var(--marca)", flex: "none", fontWeight: 600 }}>Verlo y comentarlo →</span>
              </Link>
            ))}
          </div>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Proceso</th>
                <th>Área</th>
                <th>Pasos</th>
                {!paraCliente && <th>TO-BE</th>}
                {!paraCliente && <th>SOP</th>}
              </tr>
            </thead>
            <tbody>
              {asis.map((p) => (
                <tr key={p.id}>
                  <td className="t-dato">
                    <Link href={`${base}/${p.id}`}>{p.nombre}</Link>
                    <div className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{p.origen === "generado_ia" ? (paraCliente ? "lo dibujamos con lo que contaste" : "dibujado por IA") : "dibujado a mano"}</div>
                  </td>
                  <td>{p.area ?? "—"}</td>
                  <td className="t-dato">{p.nodos}</td>
                  {!paraCliente && <td>{p.tiene_tobe ? <span style={{ color: "var(--confirmado)" }}>sí</span> : "—"}</td>}
                  {!paraCliente && <td>{p.tiene_sop ? <span style={{ color: "var(--confirmado)" }}>sí</span> : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
