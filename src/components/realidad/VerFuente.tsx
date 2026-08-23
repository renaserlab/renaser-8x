"use client";
import { useEffect, useState } from "react";
import { pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/textos";

type Datos = {
  fuente: { nombre: string; tipo: string; fecha_origen: string | null; contenido: string | null; mime: string | null };
  fragmento: { texto: string | null; pagina: number | null; seccion: string | null; celda: string | null; audio_desde: number | null } | null;
  url: string | null;
};

/** Clic en una fila abre la fuente original con el fragmento resaltado. Capítulo 14. */
export function VerFuente({ sourceId, fragmentId, cerrar }: { sourceId: string; fragmentId: string | null; cerrar: () => void }) {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    pedir<Datos>(`/api/sources/${sourceId}${fragmentId ? `?fragment=${fragmentId}` : ""}`).then(setD).catch((e) => setError(e.message));
  }, [sourceId, fragmentId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [cerrar]);

  const contenido = d?.fuente.contenido ?? "";
  const frag = d?.fragmento?.texto ?? "";
  const idx = frag ? contenido.indexOf(frag) : -1;

  return (
    <div role="dialog" aria-modal="true" aria-label="Fuente original" className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(20,23,26,0.35)" }} onClick={cerrar}>
      <aside className="h-full overflow-auto p-6 aparece" style={{ width: "min(640px, 100%)", background: "var(--papel)", borderLeft: "1px solid var(--linea)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="t-etiqueta">{d?.fuente.tipo ?? "fuente"} · {d ? fechaCorta(d.fuente.fecha_origen) : ""}</p>
            <h2 className="t-seccion mt-1">{d?.fuente.nombre ?? "Cargando"}</h2>
          </div>
          <button className="boton boton--secundario" onClick={cerrar} style={{ minHeight: 36 }}>Cerrar</button>
        </div>
        {error && <p style={{ color: "var(--contradicho)" }}>{error}</p>}
        {d?.fragmento && (
          <div className="panel p-4 mb-6" style={{ borderLeft: "3px solid var(--marca)" }}>
            <p className="t-etiqueta mb-2">
              Fragmento{d.fragmento.pagina ? ` · página ${d.fragmento.pagina}` : ""}{d.fragmento.seccion ? ` · ${d.fragmento.seccion}` : ""}{d.fragmento.celda ? ` · ${d.fragmento.celda}` : ""}{d.fragmento.audio_desde != null ? ` · minuto ${Math.floor(d.fragmento.audio_desde / 60)}:${String(d.fragmento.audio_desde % 60).padStart(2, "0")}` : ""}
            </p>
            <p className="t-doc">{d.fragmento.texto ?? "(sin texto)"}</p>
          </div>
        )}
        {d?.url && d.fuente.mime?.startsWith("image/") && <img src={d.url} alt={d.fuente.nombre} style={{ maxWidth: "100%", borderRadius: "var(--radio)", border: "1px solid var(--linea)" }} />}
        {d?.url && d.fuente.mime === "application/pdf" && <iframe src={d.url} title={d.fuente.nombre} style={{ width: "100%", height: "70vh", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }} />}
        {d?.url && d.fuente.mime?.startsWith("audio/") && <audio controls src={d.url} style={{ width: "100%" }} />}
        {contenido && (
          <pre className="t-doc mt-6" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-doc)" }}>
            {idx >= 0 ? (
              <>
                {contenido.slice(Math.max(0, idx - 600), idx)}
                <mark style={{ background: "#fff3b0" }}>{frag}</mark>
                {contenido.slice(idx + frag.length, idx + frag.length + 1200)}
              </>
            ) : (
              contenido.slice(0, 4000)
            )}
          </pre>
        )}
      </aside>
    </div>
  );
}
