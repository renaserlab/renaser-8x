"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { transcribirAudio } from "@/lib/transcribir-cliente";
import { Progreso } from "@/components/base/Progreso";
import { MenuAcciones } from "@/components/base/MenuAcciones";
import { VACIO } from "@/lib/textos";

export type ProcesoResumen = { id: string; nombre: string; area: string | null; version: string; origen: string; padre_id: string | null; nodos: number; tiene_tobe: boolean; tiene_sop: boolean };

/**
 * Lo que la consultora ya sabe de cada proceso por el mapa de la empresa (mapaDe): su nivel, quién responde y de dónde
 * a dónde va. Opcional: si el mapa no se pudo leer, la tarjeta dice lo que la lista trae y nada más.
 */
export type DetalleProceso = { nivel: number; nombreNivel: string; responsable?: string | null; inicio?: string | null; resultado?: string | null };

/** El color del nivel: 3 o más (escrito) en verde, 1–2 neutro, 0 en ámbar. */
const claseNivel = (n: number) => (n >= 3 ? "ok" : n >= 1 ? "neutro" : "espera");

/**
 * CONTAR UN PROCESO Y QUE LA IA LO DIBUJE (o empezar en blanco). Es el mismo formulario para el dueño («Cuéntanos un
 * proceso») y para la consultora («Nuevo proceso»); la consultora lo abre desde «Agregar procesos», plegado.
 */
export function NuevoProceso({ companyId, base, paraCliente = false }: { companyId: string; base: string; paraCliente?: boolean }) {
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

  return (
    <section className="flex flex-col gap-4">
      <h2 className="t-seccion">{paraCliente ? "Cuéntanos un proceso" : "Contar un proceso y que la IA lo dibuje"}</h2>
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
      <textarea className="campo" rows={filas} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-label="Describe el proceso" placeholder={paraCliente ? "Cuéntalo con tus palabras, paso a paso" : "Cuéntalo paso a paso, como pasa de verdad"} />
      {/* BORRAR EN UN TOQUE. En el celular, vaciar una caja larga es borrar letra por letra: una dueña se quedó
          atascada con un texto que no era suyo y no pudo seguir. */}
      {descripcion.trim() && (
        <div className="flex flex-wrap gap-3 items-center">
          <button type="button" className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }} onClick={() => setRevisando(true)}>
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
  );
}

/** Confirmar un borrado donde se decide: bajo el nombre del proceso, nunca en una celda estrecha. */
function ConfirmarQuitar({ p, eliminando, alQuitar, alCancelar }: { p: ProcesoResumen; eliminando: boolean; alQuitar: () => void; alCancelar: () => void }) {
  return (
    <div className="proceso-tarjeta__confirmar" role="group" aria-label={`Quitar «${p.nombre}»`}>
      <span className="t-dato">¿Quitar «{p.nombre}»?{p.tiene_tobe || p.tiene_sop ? " Se borra también su TO-BE y su manual." : ""} No se puede deshacer.</span>
      <button type="button" className="boton" style={{ minHeight: 40, fontSize: 13.5, background: "var(--contradicho)", borderColor: "var(--contradicho)" }} disabled={eliminando} onClick={alQuitar}>
        {eliminando ? "Quitando…" : "Sí, quitarlo"}
      </button>
      <button type="button" className="boton boton--secundario" style={{ minHeight: 40, fontSize: 13.5 }} disabled={eliminando} onClick={alCancelar}>
        No
      </button>
    </div>
  );
}

/**
 * LOS PROCESOS DE LA EMPRESA.
 *  - El dueño (paraCliente): «Cuéntanos un proceso» a la izquierda y sus procesos a la derecha, cada uno con «Verlo».
 *  - La consultora (revisión del 16-10-2026): una tarjeta por proceso a todo lo ancho —nombre, de dónde a dónde va,
 *    área, quién responde, pasos, nivel y su TO-BE o manual— con «Ver el flujo». Sin formulario aquí: agregar procesos
 *    vive plegado en la página (las tres formas juntas). Lo importado sin dibujar lo lista el importador, una sola vez.
 * En las dos, «Quitar» va en el menú de cada tarjeta (los tres puntos), no subrayado al lado de «Verlo».
 */
export function ProcesosLista({
  companyId,
  procesos,
  base,
  paraCliente = false,
  detalle,
}: {
  companyId: string;
  procesos: ProcesoResumen[];
  base: string;
  paraCliente?: boolean;
  /** Por id: nivel, responsable, inicio y resultado (del mapa de la empresa). Solo la consultora. */
  detalle?: Record<string, DetalleProceso>;
}) {
  const router = useRouter();
  const [borrando, setBorrando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quitar = async (id: string) => {
    setError(null);
    setEliminando(true);
    try {
      await pedir(`/api/processes/${id}`, { method: "DELETE" });
      setBorrando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos quitarlo.");
      setBorrando(null);
    } finally {
      setEliminando(false);
    }
  };

  const asis = procesos.filter((p) => p.version === "as_is");
  // El texto del vacío depende de quién mira: «Empezar en blanco» es solo de la consultora.
  const vacio = paraCliente ? VACIO.procesosCliente : VACIO.procesos;
  const avisoError = error && (
    <p className="t-cuerpo" role="alert" style={{ color: "var(--contradicho)", border: "1px solid var(--contradicho)", borderRadius: "var(--radio)", padding: "10px 12px" }}>
      {error}
    </p>
  );

  if (!paraCliente) {
    return (
      <section className="flex flex-col gap-3" aria-labelledby="t-procesos-lista">
        <h2 id="t-procesos-lista" className="t-seccion">
          Procesos dibujados{asis.length > 0 ? ` (${asis.length})` : ""}
        </h2>
        {avisoError}
        {asis.length === 0 ? (
          <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>{vacio}</p>
        ) : (
          <ul className="procesos-tarjetas">
            {asis.map((p) => {
              const d = detalle?.[p.id];
              const recorrido = d?.inicio?.trim() && d?.resultado?.trim() ? `De «${d.inicio.trim()}» a «${d.resultado.trim()}»` : null;
              const datos = [
                p.area ?? "Sin área",
                d ? (d.responsable?.trim() ? `responde ${d.responsable.trim()}` : "sin responsable") : null,
                `${p.nodos} ${p.nodos === 1 ? "paso" : "pasos"}`,
                p.origen === "generado_ia" ? "dibujado por IA" : p.origen === "importado" ? "de la lista de la empresa" : "dibujado a mano",
              ].filter(Boolean);
              return (
                <li key={p.id} className="proceso-tarjeta">
                  <div className="proceso-tarjeta__cuerpo">
                    <Link href={`${base}/${p.id}`} className="proceso-tarjeta__nombre">{p.nombre}</Link>
                    {recorrido && <p className="proceso-tarjeta__recorrido">{recorrido}</p>}
                    <p className="proceso-tarjeta__datos">{datos.join(" · ")}</p>
                  </div>
                  <div className="proceso-tarjeta__estado">
                    {d && <span className={`estado ${claseNivel(d.nivel)}`}>Nivel {d.nivel} · {d.nombreNivel}</span>}
                    {p.tiene_tobe && <span className="estado ok">TO-BE</span>}
                    {p.tiene_sop && <span className="estado ok">Manual</span>}
                  </div>
                  <div className="proceso-tarjeta__acciones">
                    <Link href={`${base}/${p.id}`} className="boton boton--secundario">Ver el flujo</Link>
                    <MenuAcciones etiqueta={`Más acciones de «${p.nombre}»`}>
                      <button type="button" data-peligro="" onClick={() => setBorrando(p.id)}>Quitar este proceso</button>
                    </MenuAcciones>
                  </div>
                  {borrando === p.id && <ConfirmarQuitar p={p} eliminando={eliminando} alQuitar={() => quitar(p.id)} alCancelar={() => setBorrando(null)} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
      <NuevoProceso companyId={companyId} base={base} paraCliente />

      <section>
        <h2 className="t-seccion mb-4">Tus procesos</h2>
        {avisoError}
        {asis.length === 0 ? (
          <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>{vacio}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {asis.map((p) => {
              // Un proceso de dos pasos salido de un audio que no se entendió no es un proceso: es
              // basura que se queda ahí para siempre. Se dice lo que es y se ofrece quitarlo.
              const vacio = p.nodos <= 2;
              return (
                <div key={p.id} className="panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`${base}/${p.id}`} className="flex items-center justify-between gap-3" style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
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
                    <MenuAcciones etiqueta={`Más acciones de «${p.nombre}»`}>
                      <button type="button" data-peligro="" onClick={() => setBorrando(p.id)}>Quitar este proceso</button>
                    </MenuAcciones>
                  </div>
                  {borrando === p.id && <ConfirmarQuitar p={p} eliminando={eliminando} alQuitar={() => quitar(p.id)} alCancelar={() => setBorrando(null)} />}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
