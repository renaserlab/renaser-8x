"use client";
import { useEffect, useState } from "react";
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
  // REVISAR EN GRANDE: al dictar, el texto no cabía en la caja de cinco líneas y quedaba cortado a
  // media frase. Sin poder releer lo que dijo, nadie corrige nada antes de mandarlo a dibujar.
  const [revisando, setRevisando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  const quitar = async (id: string) => {
    setError(null);
    try {
      await pedir(`/api/processes/${id}`, { method: "DELETE" });
      setBorrando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos quitarlo.");
      setBorrando(null);
    }
  };

  useEffect(() => {
    if (!revisando) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setRevisando(false);
    document.addEventListener("keydown", alTeclear);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = "";
    };
  }, [revisando]);

  // La caja crece con lo dictado en vez de quedarse en cinco líneas fijas, con tope para no
  // empujar el botón fuera de la pantalla del celular.
  const filas = Math.min(14, Math.max(5, Math.ceil(descripcion.length / 42)));

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
      // Al mandarlo a dibujar se vuelve a la vista normal: la ventana grande ya cumplió su función.
      setRevisando(false);
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
              // Al terminar de dictar se abre en grande: es el momento exacto de releer y corregir,
              // y en la caja pequeña la frase quedaba cortada a media palabra.
              setRevisando(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "No pudimos entender el audio.");
            } finally {
              setTranscribiendo(false);
            }
          }}
        />
        {transcribiendo && <p className="t-dato aparece" aria-live="polite" style={{ color: "var(--grafito)" }}>Escuchando tu audio…</p>}
        <textarea className="campo" rows={filas} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-label="Describe el proceso" placeholder={paraCliente ? "Un cliente escribe por WhatsApp, alguien le responde, se le pasa el precio…" : "El lead entra por WhatsApp, un asesor lo contacta…"} />
        {/* BORRAR EN UN TOQUE. En el celular, vaciar una caja larga es borrar letra por letra: la
            dueña de Qori Home se quedó atascada con un texto que no era suyo y no pudo seguir. */}
        {descripcion.trim() && (
          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              className="boton boton--secundario"
              style={{ minHeight: 38, fontSize: 14 }}
              onClick={() => setRevisando(true)}
            >
              Leerlo en grande
            </button>
            <button
              type="button"
              className="t-dato"
              style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--grafito)", padding: 0 }}
              onClick={() => { setDescripcion(""); setAudioOriginal(null); setError(null); }}
            >
              Borrar y empezar de nuevo
            </button>
            <span className="t-dato" style={{ color: "var(--grafito)" }}>Si grabas otra vez, se agrega a lo que ya hay.</span>
          </div>
        )}
        {error && (
          <p className="t-cuerpo" role="alert" style={{ color: "var(--contradicho)", border: "1px solid var(--contradicho)", borderRadius: "var(--radio)", padding: "10px 12px" }}>
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3 items-center">
          <button className="boton" onClick={generar} disabled={!descripcion.trim()}>Dibujarlo</button>
          {!paraCliente && <button className="boton boton--secundario" onClick={enBlanco}>Empezar en blanco</button>}
        </div>
        {!descripcion.trim() && <p className="t-dato" style={{ color: "var(--grafito)" }}>Primero cuéntanos el proceso — hablando o escribiendo — y nosotros lo dibujamos.</p>}
        <Progreso jobId={job} paraCliente={paraCliente} alTerminar={() => router.refresh()} />

        {/* LEERLO EN GRANDE. En el celular, revisar lo dictado dentro de una caja de cinco líneas es
            imposible: la frase queda cortada y nadie corrige lo que no puede leer. Se abre en el
            mismo panel que ya usa el resto del portal —hoja inferior, 82dvh, respetando la barra de
            inicio del iPhone— y al mandarlo a dibujar se cierra solo y vuelve la vista normal. */}
        {revisando && (
          <>
            <button type="button" className="telon" aria-label="Cerrar" onClick={() => setRevisando(false)} />
            <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label="Revisa lo que contaste">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="t-seccion">Revisa lo que contaste</h3>
                <button
                  type="button"
                  onClick={() => setRevisando(false)}
                  className="t-dato"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 4px", font: "inherit", color: "var(--grafito)" }}
                >
                  Cerrar
                </button>
              </div>
              <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>
                Corrige lo que haga falta — nombres, números, lo que se entendió mal. Con esto dibujamos tu proceso.
              </p>
              <textarea
                className="campo"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                aria-label="Lo que contaste"
                style={{ minHeight: "min(46dvh, 380px)", lineHeight: 1.55 }}
              />
              {error && (
                <p className="t-cuerpo mt-3" role="alert" style={{ color: "var(--contradicho)", border: "1px solid var(--contradicho)", borderRadius: "var(--radio)", padding: "10px 12px" }}>
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-3 items-center mt-4">
                <button className="boton" onClick={generar} disabled={!descripcion.trim()}>Dibujarlo</button>
                <button
                  type="button"
                  className="t-dato"
                  style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--grafito)", padding: 0 }}
                  onClick={() => { setDescripcion(""); setAudioOriginal(null); setError(null); setRevisando(false); }}
                >
                  Borrar y empezar de nuevo
                </button>
              </div>
            </aside>
          </>
        )}
      </section>

      <section>
        <h2 className="t-seccion mb-4">{paraCliente ? "Tus procesos" : "Procesos"}</h2>
        {asis.length === 0 ? (
          <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>{paraCliente ? VACIO.procesosCliente : VACIO.procesos}</p>
        ) : paraCliente ? (
          <div className="flex flex-col gap-3">
            {asis.map((p) => {
              // Un proceso de dos pasos salido de un audio que no se entendió no es un proceso: es
              // basura que se queda ahí para siempre. Se dice lo que es y se ofrece quitarlo.
              const vacio = p.nodos <= 2;
              return (
                <div key={p.id} className="panel p-4">
                  <Link href={`${base}/${p.id}`} className="flex items-center justify-between gap-3" style={{ textDecoration: "none" }}>
                    <span style={{ minWidth: 0 }}>
                      <span className="t-seccion" style={{ fontSize: 17 }}>{p.nombre}</span>
                      <span className="block t-dato mt-1" style={{ color: vacio ? "var(--caducado)" : "var(--grafito)" }}>
                        {vacio
                          ? "Quedó vacío: no llegamos a entender lo que contaste"
                          : `${p.nodos} pasos · ${p.origen === "generado_ia" ? "lo dibujamos con lo que contaste" : "dibujado a mano"}`}
                      </span>
                    </span>
                    <span className="t-dato" style={{ color: "var(--marca)", flex: "none", fontWeight: 600 }}>
                      {vacio ? "Verlo →" : "Verlo y comentarlo →"}
                    </span>
                  </Link>
                  {borrando === p.id ? (
                    <div className="flex gap-3 items-center flex-wrap mt-3" style={{ borderTop: "1px solid var(--linea)", paddingTop: 10 }}>
                      <span className="t-dato">¿Quitar «{p.nombre}»? No se puede deshacer.</span>
                      <button type="button" className="boton" style={{ minHeight: 34, fontSize: 13, background: "var(--contradicho)", borderColor: "var(--contradicho)" }} onClick={() => quitar(p.id)}>
                        Sí, quitarlo
                      </button>
                      <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)" }} onClick={() => setBorrando(null)}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="t-dato mt-2"
                      style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--grafito)", padding: 0 }}
                      onClick={() => setBorrando(p.id)}
                    >
                      Quitar este proceso
                    </button>
                  )}
                </div>
              );
            })}
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
