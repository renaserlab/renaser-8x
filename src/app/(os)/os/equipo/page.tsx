import Link from "next/link";
import { contextoGestionOS, NOMBRE_ROL } from "@/lib/os/acceso";
import { NOMBRE_ESTADO_PERSONA, textoDuracion, type EstadoPersona } from "@/lib/os/calculos";
import { leerEquipo, horaEn, localEn } from "@/lib/os/equipo";
import { Refresco } from "@/components/os/equipo/Refresco";
import { Avisarle } from "@/components/os/equipo/Avisarle";
import { CerrarCronometro } from "@/components/os/equipo/CerrarCronometro";
import { AsignarTarea } from "@/components/os/equipo/AsignarTarea";

export const dynamic = "force-dynamic";

const FILTROS: [EstadoPersona | "todos", string][] = [
  ["todos", "Todos"],
  ["activo", "Activos"],
  ["bloqueado", "Bloqueados"],
  ["sin_senal", "Sin señal"],
  ["en_pausa", "En pausa"],
  ["no_abrio", "No abrieron"],
];

/**
 * EQUIPO EN VIVO (RENASER OS, 19-10-2026). La «Torre de control» de RenaserOs con otro nombre (8X ya tiene una torre:
 * la de los agentes de IA). Quién abrió el día, quién está en foco, bloqueado o sin señal, los cronómetros olvidados,
 * quién no tiene trabajo puesto para hoy, el ánimo y la capacidad del día. Solo la gestión. Se refresca solo.
 */
export default async function EquipoEnVivo({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const c = await contextoGestionOS();
  const sp = await searchParams;
  const ahora = new Date();
  const e = await leerEquipo(c, ahora);
  const filtro = (FILTROS.find(([k]) => k === sp.estado)?.[0] ?? "todos") as EstadoPersona | "todos";
  const filas = filtro === "todos" ? e.filas : e.filas.filter((f) => f.estado === filtro);
  const faltan = e.filas.filter((f) => f.estado === "no_abrio").map((f) => f.persona.nombre.split(" ")[0]);
  const bloqueado = e.filas.find((f) => f.estado === "bloqueado");
  const sinSenal = e.filas.find((f) => f.estado === "sin_senal");
  const hoyLargo = new Intl.DateTimeFormat("es-PE", { timeZone: c.zona, weekday: "long", day: "numeric", month: "long" }).format(ahora);
  const maximo = localEn(ahora, c.zona);

  return (
    <div className="tablero os-tablero">
      <Refresco segundos={20} />
      <header className="os-cabeza">
        <div className="os-cabeza__textos">
          <p className="t-etiqueta">Mi equipo · {hoyLargo} · {horaEn(ahora, c.zona)}</p>
          <h1 className="t-titulo">Equipo en vivo</h1>
        </div>
        <span className="os-envivo">En vivo · se actualiza solo</span>
      </header>

      {e.total === 0 ? (
        <div className="vacio">
          <p className="vacio__texto">
            {e.sinCuenta.length
              ? `Nadie de tu equipo entró todavía a 8X. ${e.sinCuenta.map((p) => p.nombre.split(" ")[0]).join(", ")} tiene${e.sinCuenta.length === 1 ? "" : "n"} ficha: que cree${e.sinCuenta.length === 1 ? "" : "n"} su cuenta con su correo en «Crear cuenta».`
              : "Todavía no hay nadie en tu equipo. Agrega a tu personal en «Equipo y talento» y cada uno entra con su correo."}
          </p>
          <Link className="boton" href="/os/talento?pestana=personas">{e.sinCuenta.length ? "Ver a mi equipo" : "Agregar a mi equipo"}</Link>
        </div>
      ) : (
        <>
          <div className="os-kpis">
            <div className="os-kpi">
              <span className="os-kpi__rotulo">Abrieron el día</span>
              <span className="os-kpi__cifra">{e.abrieron} <small>de {e.total}</small></span>
              <span className="os-kpi__sub">{faltan.length ? `Falta${faltan.length === 1 ? "" : "n"} ${faltan.slice(0, 3).join(", ")}${faltan.length > 3 ? "…" : ""}` : "Abrieron todos"}</span>
            </div>
            <div className="os-kpi">
              <span className="os-kpi__rotulo">Activos ahora</span>
              <span className="os-kpi__cifra os-cifra--bien">{e.activos}</span>
              <span className="os-kpi__sub">Con un cronómetro de foco corriendo</span>
            </div>
            <div className="os-kpi">
              <span className="os-kpi__rotulo">Bloqueados</span>
              <span className={`os-kpi__cifra${e.bloqueados ? " os-cifra--mal" : ""}`}>{e.bloqueados}</span>
              <span className="os-kpi__sub">{bloqueado ? bloqueado.persona.nombre.split(" ")[0] : "Nadie trabado"}</span>
            </div>
            <div className="os-kpi">
              <span className="os-kpi__rotulo">Sin señal</span>
              <span className={`os-kpi__cifra${e.sinSenal ? " os-cifra--atento" : ""}`}>{e.sinSenal}</span>
              <span className="os-kpi__sub">{sinSenal ? `${sinSenal.persona.nombre.split(" ")[0]}, sin moverse hace más de una hora` : "Todos con movimiento"}</span>
            </div>
            <div className="os-kpi os-kpi--noche">
              <span className="os-kpi__rotulo">Utilización a esta hora</span>
              <span className="os-kpi__cifra">{e.utilizacion == null ? "—" : `${e.utilizacion}%`}</span>
              <span className="os-kpi__sub">{e.capacidadMin ? `de ${textoDuracion(e.capacidadMin)} de capacidad hoy` : "Nadie abrió el día todavía"}</span>
            </div>
          </div>

          <div className="os-dos">
            <section className="os-tarjeta" aria-label="El equipo ahora">
              <nav className="os-filtros" aria-label="Filtrar por estado">
                {FILTROS.map(([k, nombre]) => {
                  const n = k === "todos" ? e.filas.length : e.filas.filter((f) => f.estado === k).length;
                  if (k !== "todos" && k !== filtro && n === 0) return null;
                  return (
                    <Link key={k} className="os-pildora" href={k === "todos" ? "/os/equipo" : `/os/equipo?estado=${k}`} aria-current={filtro === k ? "page" : undefined} scroll={false}>
                      {nombre} · {n}
                    </Link>
                  );
                })}
              </nav>
              {filas.length === 0 ? (
                <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Nadie en este estado ahora mismo.</p>
              ) : (
                <div className="os-tabla-caja">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Persona</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Ahora</th>
                        <th scope="col">Hoy</th>
                        <th scope="col"><span className="sr-only">Acción</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.persona.id}>
                          <td>
                            <span className="os-persona">
                              <span className="os-avatar" aria-hidden="true">{f.iniciales}</span>
                              <span className="os-persona__textos">
                                <span className="os-persona__nombre">{f.persona.nombre}</span>
                                <span className="os-persona__sub">{f.persona.puesto || NOMBRE_ROL[f.persona.rol]}</span>
                              </span>
                            </span>
                          </td>
                          <td><span className={`os-chip os-chip--${f.estado}`}>{NOMBRE_ESTADO_PERSONA[f.estado]}</span></td>
                          <td style={{ minWidth: 180, maxWidth: 260 }}>{f.ahora}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <span style={{ display: "block", fontWeight: 600, color: f.abrioA ? undefined : "var(--contradicho)" }}>
                              {f.abrioA ? `Abrió ${f.abrioA}${f.animo ? ` · ánimo ${f.animo}` : ""}` : "No abrió"}
                            </span>
                            <span className="os-persona__sub">
                              {f.tareasHoy ? `${f.tareasHoy} ${f.tareasHoy === 1 ? "tarea" : "tareas"}` : "Sin tareas"}
                              {f.minutosHoy > 0 ? ` · ${textoDuracion(f.minutosHoy)} registradas` : ""}
                            </span>
                          </td>
                          <td>{(f.estado === "sin_senal" || f.estado === "no_abrio") && f.persona.user_id && <Avisarle personaId={f.persona.id} nombre={f.persona.nombre} chico />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <aside aria-label="Lo que pide atención">
              {e.sinCuenta.length > 0 && (
                <section className="os-tarjeta">
                  <h2 className="t-seccion">Todavía no entran</h2>
                  <p className="t-dato" style={{ color: "var(--grafito)" }}>No cuentan en «abrieron el día» hasta que creen su cuenta en 8X con su correo.</p>
                  {e.sinCuenta.map((p) => (
                    <span key={p.id} className="os-linea">
                      {p.nombre}{p.puesto ? ` · ${p.puesto}` : ""}
                      <small>{p.email ? `Que cree su cuenta con ${p.email}` : "Sin correo: agrégaselo en «Equipo y talento»"}</small>
                    </span>
                  ))}
                </section>
              )}
              <section className="os-tarjeta">
                <h2 className="t-seccion">Cronómetros olvidados</h2>
                {e.olvidados.length === 0 ? (
                  <p className="t-dato" style={{ color: "var(--grafito)" }}>Ninguno: nadie tiene un cronómetro corriendo hace más de 10 horas.</p>
                ) : (
                  e.olvidados.map((o) => (
                    <div key={o.registroId} className="flex flex-col gap-3">
                      <div className="os-alerta">
                        <strong>{o.nombre}</strong>
                        <span>Corre desde {new Intl.DateTimeFormat("es-PE", { timeZone: c.zona, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(o.inicio))} · {textoDuracion(Math.round((ahora.getTime() - new Date(o.inicio).getTime()) / 60000))} en «{o.tarea}».</span>
                      </div>
                      <Avisarle personaId={o.personaId} nombre={o.nombre} />
                      <CerrarCronometro registroId={o.registroId} nombre={o.nombre} sugerido={localEn(new Date(new Date(o.inicio).getTime() + 60 * 60000), c.zona)} minimo={localEn(o.inicio, c.zona)} maximo={maximo} />
                    </div>
                  ))
                )}
              </section>
              <section className="os-tarjeta">
                <h2 className="t-seccion">Sin trabajo puesto para hoy</h2>
                {e.sinTrabajo.length === 0 ? (
                  <p className="t-dato" style={{ color: "var(--grafito)" }}>Todos tienen tareas para hoy.</p>
                ) : (
                  e.sinTrabajo.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-3" style={{ borderTop: "1px solid var(--linea)", paddingTop: 10 }}>
                      <span className="t-dato" style={{ flex: 1 }}><b>{p.nombre}</b>{p.puesto ? ` · ${p.puesto}` : ""}</span>
                      <AsignarTarea personaId={p.id} nombre={p.nombre.split(" ")[0]!} hoy={e.hoy} />
                    </div>
                  ))
                )}
              </section>
              <section className="os-tarjeta">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="t-seccion">Ánimo del equipo hoy</h2>
                  <span className="cifra-media">{e.animo.promedio == null ? "—" : String(e.animo.promedio).replace(".", ",")}<span className="t-dato" style={{ color: "var(--grafito)" }}> / 5</span></span>
                </div>
                <div className="os-animo" role="img" aria-label={`Respuestas por nivel de ánimo: ${e.animo.conteo.map((n, i) => `${i + 1}: ${n}`).join(", ")}`}>
                  {e.animo.conteo.map((n, i) => (
                    <div className="os-animo__col" key={i}>
                      <span className="os-animo__barra" data-vacia={n ? undefined : ""} style={{ height: n ? Math.min(86, 18 + n * 22) : 4 }} />
                      <span className="os-animo__n">{i + 1}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="os-tarjeta">
                <h2 className="t-seccion">Capacidad del día</h2>
                <div className="os-barra os-barra--gruesa" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, e.utilizacion ?? 0)}%` }} />
                </div>
                <span className="t-dato">
                  {e.capacidadMin
                    ? `${textoDuracion(e.minutosHoy)} registradas de ${textoDuracion(e.capacidadMin)} disponibles · ${textoDuracion(Math.max(0, e.capacidadMin - e.minutosHoy))} libres`
                    : "La capacidad cuenta desde que cada persona abre su día."}
                </span>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
