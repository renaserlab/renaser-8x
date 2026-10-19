"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";

/** SUBIR UN ENTREGABLE: título, archivo y, si quiere, la tarea a la que corresponde. */
export function SubirEntregable({ tareas, maxMb }: { tareas: { id: string; titulo: string }[]; maxMb: number }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);

  const subir = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setEnviando(true);
    setError(null);
    try {
      await pedir("/api/os/entregables", { method: "POST", body: new FormData(form) });
      form.reset();
      setNombre(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="panel os-d-bloque" onSubmit={subir}>
      <h2 className="t-seccion" style={{ margin: 0 }}>Entregar un archivo</h2>
      <label className="os-d-campo">
        <span className="t-etiqueta">¿Qué entregas?</span>
        <input className="campo" name="titulo" required maxLength={200} placeholder="Cotización mayorista de Ferretería El Sol" />
      </label>
      <label className="os-d-campo">
        <span className="t-etiqueta">Tarea (opcional)</span>
        <select className="campo" name="tarea_id" defaultValue="">
          <option value="">Sin tarea</option>
          {tareas.map((t) => (
            <option key={t.id} value={t.id}>{t.titulo}</option>
          ))}
        </select>
      </label>
      <div className="os-d-campo">
        <span className="t-etiqueta" id="etiqueta-archivo">Archivo</span>
        <label className="archivo-boton boton boton--secundario" style={{ alignSelf: "flex-start" }}>
          <input
            type="file"
            name="archivo"
            required
            aria-labelledby="etiqueta-archivo"
            accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv,.zip"
            onChange={(e) => setNombre(e.target.files?.[0]?.name ?? null)}
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
          />
          Elegir archivo
        </label>
        <span className="t-dato os-d-tenue">{nombre ?? `PDF, Word, Excel, PowerPoint, foto, texto o zip. Hasta ${maxMb} MB.`}</span>
      </div>
      {error && <p className="aviso aviso--error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <button className="boton" disabled={enviando} style={{ alignSelf: "flex-start" }}>{enviando ? "Subiendo…" : "Entregar"}</button>
    </form>
  );
}

/** Borrar un entregable propio, con confirmación. */
export function BorrarEntregable({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      className="boton boton--peligro boton--chico"
      disabled={ocupado}
      aria-label={`Borrar ${titulo}`}
      onClick={async () => {
        if (!window.confirm(`¿Borrar «${titulo}»? No se puede deshacer.`)) return;
        setOcupado(true);
        try {
          await pedir(`/api/os/entregables/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          window.alert(e instanceof Error ? e.message : "No se pudo borrar.");
          setOcupado(false);
        }
      }}
    >
      Borrar
    </button>
  );
}
