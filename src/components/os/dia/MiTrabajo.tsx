"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { textoReloj, NOMBRE_PRIORIDAD, type EstadoTarea, type TareaOS } from "@/lib/os/calculos";
import { FormBloqueo, FormReprogramar, FormTarea, type DatosTarea } from "./FormulariosTarea";

export type TareaVista = TareaOS & {
  estadoVisible: EstadoTarea | "vencida";
  nombreEstado: string;
  proyecto: string | null;
  minutos: number;
  hoy: boolean;
  semana: boolean;
  textoFecha: string;
  textoInicio: string;
  tarde: boolean;
  creadaHoy: boolean;
  bloqueo: { causa: string; depende_de: string | null; desde: string; desdeDia: string } | null;
  historial: { texto: string; motivo: string }[];
  tramos: { id: string; cuando: string; duracion: string; nota: string | null }[];
};

/** El cronómetro que corre (inicio) o la tarea en pausa (inicio null). */
export type Foco = { tarea_id: string; titulo: string; inicio: string | null; pausa: boolean };

type Filtro = "hoy" | "semana" | "todas";
type Modo = "ver" | "nueva" | "editar" | "reprogramar" | "bloqueo";

const TONO: Record<EstadoTarea | "vencida", string> = {
  pendiente: "",
  en_curso: "os-d-chip--acero",
  en_revision: "os-d-chip--contorno",
  completada: "os-d-chip--ok",
  bloqueada: "os-d-chip--alto",
  vencida: "os-d-chip--espera",
};

/**
 * MI TRABAJO, del lado del navegador: filtra, elige una tarea y pide los cambios a /api/os/…; después de cada cambio la
 * página se vuelve a leer del servidor (router.refresh), que es quien sabe la hora de la empresa.
 */
export function MiTrabajo({
  tareas,
  proyectos,
  foco,
  hoy,
  fecha,
  registradoHoy,
  capacidad,
  elegidaInicial,
}: {
  tareas: TareaVista[];
  proyectos: { id: string; nombre: string }[];
  foco: Foco | null;
  hoy: string;
  fecha: string;
  registradoHoy: string;
  capacidad: string;
  elegidaInicial: string | null;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("hoy");
  const [elegida, setElegida] = useState<string | null>(elegidaInicial);
  const [modo, setModo] = useState<Modo>(tareas.length ? "ver" : "nueva");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const correr = async (fn: () => Promise<unknown>, despues: Modo = "ver") => {
    setOcupado(true);
    setError(null);
    try {
      await fn();
      setModo(despues);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo hacer.");
    } finally {
      setOcupado(false);
    }
  };
  const cronometro = (json: Record<string, unknown>) => correr(() => pedir("/api/os/cronometro", { json }));

  const cuenta = { hoy: tareas.filter((t) => t.hoy).length, semana: tareas.filter((t) => t.semana).length, todas: tareas.length };
  const lista = tareas.filter((t) => (filtro === "todas" ? true : filtro === "hoy" ? t.hoy : t.semana));
  const sel = tareas.find((t) => t.id === elegida) ?? null;

  const crear = (d: DatosTarea) =>
    correr(async () => {
      const r = await pedir<{ id: string }>("/api/os/tareas", { json: d });
      setElegida(r.id);
    });

  return (
    <>
      <header className="os-d-cabeza">
        <div className="os-d-cabeza__texto">
          <span className="t-rotulo">Mi día · {fecha}</span>
          <h1 className="t-titulo" style={{ margin: 0 }}>Mi trabajo</h1>
        </div>
        <button className="boton" onClick={() => { setModo("nueva"); setError(null); }}>
          Nueva tarea
        </button>
      </header>

      {foco && (
        <BarraFoco
          key={`${foco.tarea_id}-${foco.inicio ?? "pausa"}`}
          foco={foco}
          registradoHoy={registradoHoy}
          capacidad={capacidad}
          ocupado={ocupado}
          onPausar={() => cronometro({ accion: "pausar" })}
          onReanudar={() => cronometro({ accion: "iniciar", tarea_id: foco.tarea_id })}
          onNota={(nota) => cronometro({ accion: "nota", nota })}
          onTerminar={() => cronometro({ accion: "terminar", tarea_id: foco.tarea_id })}
        />
      )}
      {error && <p className="aviso aviso--error" role="alert" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="os-d-rejilla">
        <section className="os-d-rejilla__principal" aria-label="Tus tareas" style={{ gap: 0 }}>
          <div className="os-d-filtros" role="tablist" aria-label="Qué tareas ver">
            {(["hoy", "semana", "todas"] as const).map((f) => (
              <button key={f} role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)}>
                {{ hoy: "Hoy", semana: "Esta semana", todas: "Todas" }[f]} · {cuenta[f]}
              </button>
            ))}
          </div>
          {lista.length ? (
            <div className="os-d-tareas">
              {lista.map((t) => (
                <button
                  key={t.id}
                  className="os-d-tarea"
                  aria-pressed={t.id === elegida}
                  data-hecha={t.estado === "completada" ? "si" : undefined}
                  onClick={() => {
                    setElegida(t.id);
                    setModo("ver");
                    setError(null);
                    // En celular el detalle queda debajo de la lista: se baja hasta él.
                    if (window.matchMedia("(max-width: 760px)").matches) document.getElementById("detalle-tarea")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span className="os-d-tarea__titulo">{t.titulo}</span>
                    <span className="os-d-tarea__sub">
                      {[t.proyecto, t.historial.length ? `reprogramada ${t.historial.length} ${t.historial.length === 1 ? "vez" : "veces"}` : null, t.minutos ? `${Math.floor(t.minutos / 60) ? `${Math.floor(t.minutos / 60)} h ` : ""}${t.minutos % 60} min` : null]
                        .filter(Boolean)
                        .join(" · ") || `Se trabaja: ${t.textoInicio.toLowerCase()}`}
                    </span>
                  </span>
                  <span className="os-d-tarea__lado">
                    <span className={`os-d-chip ${TONO[t.estadoVisible]}`}>{t.nombreEstado}</span>
                    <span className={`os-d-prioridad os-d-prioridad--${t.prioridad}`}>{NOMBRE_PRIORIDAD[t.prioridad]}</span>
                    <span className="os-d-tarea__fecha" data-tarde={t.tarde ? "si" : undefined}>{t.textoFecha}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="t-cuerpo os-d-tenue" style={{ marginTop: 16 }}>
              {filtro === "hoy" ? "No tienes tareas para hoy." : filtro === "semana" ? "No tienes tareas esta semana." : "Todavía no tienes tareas."} Crea una con «Nueva tarea».
            </p>
          )}
        </section>

        <aside id="detalle-tarea" className="os-d-rejilla__lado os-d-detalle" aria-label="Detalle de la tarea">
          {modo === "nueva" && (
            <FormTarea proyectos={proyectos} hoy={hoy} ocupado={ocupado} onGuardar={crear} onCancelar={() => setModo("ver")} />
          )}
          {modo !== "nueva" && sel && (
            <Detalle
              t={sel}
              modo={modo}
              hoy={hoy}
              proyectos={proyectos}
              corre={!!foco && !foco.pausa && foco.tarea_id === sel.id}
              ocupado={ocupado}
              setModo={(m) => { setModo(m); setError(null); }}
              correr={correr}
              cronometro={cronometro}
            />
          )}
          {modo !== "nueva" && !sel && <p className="t-cuerpo os-d-tenue">Elige una tarea para ver su detalle.</p>}
        </aside>
      </div>
    </>
  );
}

function Detalle({
  t,
  modo,
  hoy,
  proyectos,
  corre,
  ocupado,
  setModo,
  correr,
  cronometro,
}: {
  t: TareaVista;
  modo: Modo;
  hoy: string;
  proyectos: { id: string; nombre: string }[];
  corre: boolean;
  ocupado: boolean;
  setModo: (m: Modo) => void;
  correr: (fn: () => Promise<unknown>, despues?: Modo) => Promise<void>;
  cronometro: (json: Record<string, unknown>) => Promise<void>;
}) {
  const url = `/api/os/tareas/${t.id}`;
  const cambiar = (json: Record<string, unknown>) => correr(() => pedir(url, { method: "PATCH", json }));
  const hecha = t.estado === "completada";
  const bloqueada = t.estado === "bloqueada";

  if (modo === "editar") {
    return (
      <FormTarea
        inicial={{ titulo: t.titulo, prioridad: t.prioridad, fecha_inicio: t.fecha_inicio, fecha_limite: t.fecha_limite, proyecto_id: t.proyecto_id, descripcion: t.descripcion }}
        fijas={{ inicio: !!t.fecha_inicio && !t.creadaHoy, limite: !!t.fecha_limite && !t.creadaHoy }}
        proyectos={proyectos}
        hoy={hoy}
        ocupado={ocupado}
        onGuardar={(d) => {
          const json: Record<string, unknown> = { titulo: d.titulo, prioridad: d.prioridad, proyecto_id: d.proyecto_id, descripcion: d.descripcion };
          if (!t.fecha_inicio || t.creadaHoy) json.fecha_inicio = d.fecha_inicio;
          if (!t.fecha_limite || t.creadaHoy) json.fecha_limite = d.fecha_limite;
          return cambiar(json);
        }}
        onCancelar={() => setModo("ver")}
      />
    );
  }
  if (modo === "reprogramar") {
    return (
      <FormReprogramar
        hoy={hoy}
        limite={t.fecha_limite}
        textoLimite={t.textoFecha.toLowerCase()}
        textoInicio={t.textoInicio.toLowerCase()}
        ocupado={ocupado}
        onGuardar={(d) => correr(() => pedir(`${url}/reprogramar`, { json: d }))}
        onCancelar={() => setModo("ver")}
      />
    );
  }
  if (modo === "bloqueo") {
    return <FormBloqueo ocupado={ocupado} onGuardar={(d) => correr(() => pedir(`${url}/bloqueo`, { json: d }))} onCancelar={() => setModo("ver")} />;
  }

  return (
    <section className="panel os-d-bloque" style={{ gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {t.proyecto && <span className="t-rotulo">Proyecto · {t.proyecto}</span>}
        <h2>{t.titulo}</h2>
        <div className="os-d-fila">
          <span className={`os-d-chip ${TONO[t.estadoVisible]}`}>{t.nombreEstado}</span>
          <span className="t-dato">
            Prioridad {NOMBRE_PRIORIDAD[t.prioridad].toLowerCase()} · se trabaja {t.textoInicio.toLowerCase()} · vence {t.textoFecha.toLowerCase()}
          </span>
        </div>
        {t.descripcion && <p className="t-dato os-d-tenue" style={{ margin: 0, whiteSpace: "pre-line" }}>{t.descripcion}</p>}
      </div>

      {!hecha && (
        <div className="os-d-fila">
          {!bloqueada && !corre && (
            <button className="boton" disabled={ocupado} onClick={() => cronometro({ accion: "iniciar", tarea_id: t.id })}>
              {t.minutos ? "Seguir con el foco" : "Iniciar foco"}
            </button>
          )}
          {!bloqueada && corre && (
            <button className="boton" disabled={ocupado} onClick={() => cronometro({ accion: "pausar" })}>Pausar foco</button>
          )}
          {!bloqueada && t.estado !== "en_revision" && (
            <button className="boton boton--secundario" disabled={ocupado} onClick={() => cambiar({ estado: "en_revision" })}>Pasar a revisión</button>
          )}
          {!bloqueada && (
            <button className="boton boton--secundario" disabled={ocupado} onClick={() => cronometro({ accion: "terminar", tarea_id: t.id })}>Completar</button>
          )}
          <button className="boton boton--secundario" disabled={ocupado} onClick={() => setModo("reprogramar")}>Reprogramar</button>
          {bloqueada ? (
            <button className="boton boton--secundario" disabled={ocupado} onClick={() => correr(() => pedir(`${url}/bloqueo`, { method: "DELETE" }))}>Desbloquear</button>
          ) : (
            <button className="boton boton--peligro" disabled={ocupado} onClick={() => setModo("bloqueo")}>Marcar bloqueo</button>
          )}
          <button className="boton boton--terciario" disabled={ocupado} onClick={() => setModo("editar")}>Editar</button>
        </div>
      )}
      {hecha && (
        <div className="os-d-fila">
          <span className="t-dato">Completada.</span>
          <button className="boton boton--secundario boton--chico" disabled={ocupado} onClick={() => cambiar({ estado: "pendiente" })}>Reabrir</button>
        </div>
      )}

      {t.bloqueo && (
        <div className="os-d-bloqueo" role="status">
          <span className="t-rotulo" style={{ color: "inherit" }}>Bloqueada desde {t.bloqueo.desdeDia ? `${t.bloqueo.desdeDia.toLowerCase()}, ` : "las "}{t.bloqueo.desde}</span>
          <span style={{ fontWeight: 600 }}>{t.bloqueo.causa}</span>
          {t.bloqueo.depende_de && <span className="t-dato">Depende de {t.bloqueo.depende_de}</span>}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 className="t-etiqueta" style={{ margin: 0, color: "var(--tinta)" }}>Prórrogas y aplazamientos</h3>
        {t.historial.length ? (
          <div className="os-d-historial">
            {t.historial.map((h, i) => (
              <div key={i} className="os-d-historial__item">
                <span style={{ fontWeight: 600 }}>{h.texto}</span>
                <span className="os-d-tenue">{h.motivo}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="t-dato os-d-tenue" style={{ margin: 0 }}>Sin cambios de fecha.</p>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 className="t-etiqueta" style={{ margin: 0, color: "var(--tinta)" }}>Registro de tiempo</h3>
        {t.tramos.length ? (
          t.tramos.map((r) => (
            <div key={r.id} className="os-d-tramo">
              <span style={{ fontWeight: 600 }}>{r.cuando}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.duracion}</span>
              {r.nota && <span className="os-d-tramo__nota">{r.nota}</span>}
            </div>
          ))
        ) : (
          <p className="t-dato os-d-tenue" style={{ margin: 0 }}>Todavía sin tiempo registrado.</p>
        )}
      </div>
    </section>
  );
}

/** La barra noche del cronómetro: el reloj avanza en el navegador desde el inicio que dio el servidor. */
function BarraFoco({
  foco,
  registradoHoy,
  capacidad,
  ocupado,
  onPausar,
  onReanudar,
  onNota,
  onTerminar,
}: {
  foco: Foco;
  registradoHoy: string;
  capacidad: string;
  ocupado: boolean;
  onPausar: () => void;
  onReanudar: () => void;
  onNota: (nota: string) => void;
  onTerminar: () => void;
}) {
  const [ahora, setAhora] = useState<number | null>(null);
  const [anotando, setAnotando] = useState(false);
  const [nota, setNota] = useState("");
  useEffect(() => {
    if (foco.pausa) return;
    const primero = setTimeout(() => setAhora(Date.now()), 0);
    const i = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      clearTimeout(primero);
      clearInterval(i);
    };
  }, [foco.pausa]);
  const segundos = foco.inicio && ahora ? (ahora - Date.parse(foco.inicio)) / 1000 : null;

  return (
    <section className="os-d-foco" aria-label="Cronómetro de foco" data-pausa={foco.pausa ? "si" : undefined}>
      <div className="os-d-foco__texto">
        <span className="os-d-foco__estado os-d-rotulo-oro">{foco.pausa ? "En pausa" : "En foco"}</span>
        <span className="os-d-foco__tarea">{foco.titulo}</span>
        <span className="t-dato">Hoy llevas {registradoHoy === "—" ? "0 min" : registradoHoy} registradas de {capacidad} de capacidad.</span>
      </div>
      {!foco.pausa && (
        <span className="os-d-foco__reloj" role="timer" aria-live="off">
          {segundos == null ? "··:··:··" : textoReloj(segundos)}
        </span>
      )}
      <div className="os-d-foco__botones">
        {foco.pausa ? (
          <button className="boton boton--luna" disabled={ocupado} onClick={onReanudar}>Reanudar</button>
        ) : (
          <button className="boton boton--luna" disabled={ocupado} onClick={onPausar}>Pausar</button>
        )}
        <button className="boton boton--secundario" disabled={ocupado} aria-expanded={anotando} onClick={() => setAnotando((a) => !a)}>Nota de tiempo</button>
        <button className="boton boton--secundario" disabled={ocupado} onClick={onTerminar}>Terminar</button>
      </div>
      {anotando && (
        <form
          className="os-d-foco__nota"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nota.trim()) return;
            onNota(nota.trim());
            setNota("");
            setAnotando(false);
          }}
        >
          <label className="sr-only" htmlFor="nota-tiempo">Nota de tiempo</label>
          <input id="nota-tiempo" aria-label="Nota de tiempo" className="campo" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué hiciste en este rato" autoFocus />
          <button className="boton boton--luna" disabled={ocupado}>Guardar nota</button>
        </form>
      )}
    </section>
  );
}
