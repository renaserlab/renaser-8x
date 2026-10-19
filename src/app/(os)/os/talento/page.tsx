import Link from "next/link";
import { contextoGestionOS, NOMBRE_ROL } from "@/lib/os/acceso";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hoyEn, sumarDias, iniciales } from "@/lib/os/calculos";
import { personasDeLaEmpresa, tareasDe } from "@/lib/os/datos";
import { armarMonitoreo, DIAS_INACTIVO } from "@/lib/os/talento";
import { cicloDe, promedios, DIMENSIONES_360, NOMBRE_RELACION, type Puntajes } from "@/lib/os/evaluaciones";
import { horaEn, localEn } from "@/lib/os/equipo";
import { FormPersona, ActivarPersona } from "@/components/os/equipo/FormPersona";
import { FormLegajo, type Legajo } from "@/components/os/equipo/FormLegajo";
import { NuevaSesion, Sesion } from "@/components/os/equipo/Acompanamiento";
import { AbrirCiclo360 } from "@/components/os/equipo/AbrirCiclo360";

export const dynamic = "force-dynamic";

type Pestana = "monitoreo" | "personas" | "legajos" | "acompanamiento" | "360";

const PESTANAS: [Pestana, string, boolean][] = [
  ["monitoreo", "Monitoreo", false],
  ["personas", "Personas", true],
  ["legajos", "Legajos", true],
  ["acompanamiento", "Acompañamiento", true],
  ["360", "Evaluaciones 360", true],
];

type Evaluacion = { id: string; ciclo: string; evaluado_id: string; evaluador_id: string; relacion: keyof typeof NOMBRE_RELACION; puntajes: Puntajes | null; respondida_at: string | null };
type SesionFila = { id: string; persona_id: string; fecha: string; tema: string; acuerdos: string | null; hecho: boolean };

/**
 * EQUIPO Y TALENTO (RENASER OS, 19-10-2026). Monitoreo de los últimos 30 días para toda la gestión; el alta y la edición
 * del personal, los legajos, el acompañamiento y las evaluaciones 360, para quien lleva el talento (dueño, gerente,
 * RR.HH. y la consultora). Operaciones ve solo el monitoreo.
 */
export default async function Talento({ searchParams }: { searchParams: Promise<{ pestana?: string; persona?: string; ciclo?: string }> }) {
  const c = await contextoGestionOS();
  const sp = await searchParams;
  const visibles = PESTANAS.filter(([, , soloTalento]) => !soloTalento || c.talento);
  const pestana = (visibles.find(([k]) => k === sp.pestana)?.[0] ?? "monitoreo") as Pestana;
  const sb = supabaseAdmin();
  const ahora = new Date();
  const hoy = hoyEn(c.zona, ahora);
  const hace90 = sumarDias(hoy, -90);

  const todas = await personasDeLaEmpresa(c.companyId, { soloActivas: false });
  const activas = todas.filter((p) => p.activo);
  const nombreDe = new Map(todas.map((p) => [p.id, p.nombre]));
  const ciclo = sp.ciclo && /^\d{4}-\d{2}$/.test(sp.ciclo) ? sp.ciclo : cicloDe(hoy);

  const [tareas, registros, aperturas, sesiones, evaluaciones, ciclosRaw] = await Promise.all([
    tareasDe(c.companyId),
    sb.from("os_registros_tiempo").select("persona_id,inicio,fin").eq("company_id", c.companyId).gte("inicio", `${hace90}T00:00:00Z`),
    sb.from("os_aperturas").select("persona_id,created_at").eq("company_id", c.companyId).gte("fecha", hace90),
    c.talento ? sb.from("os_acompanamientos").select("id,persona_id,fecha,tema,acuerdos,hecho").eq("company_id", c.companyId).order("fecha", { ascending: false }).limit(60) : Promise.resolve({ data: [] }),
    c.talento ? sb.from("os_evaluaciones").select("id,ciclo,evaluado_id,evaluador_id,relacion,puntajes,respondida_at").eq("company_id", c.companyId).eq("ciclo", ciclo) : Promise.resolve({ data: [] }),
    c.talento ? sb.from("os_evaluaciones").select("ciclo").eq("company_id", c.companyId) : Promise.resolve({ data: [] }),
  ]);
  const movimientos = [
    ...((registros.data ?? []) as { persona_id: string; inicio: string; fin: string | null }[]).map((r) => ({ persona_id: r.persona_id, cuando: r.fin ?? r.inicio })),
    ...((aperturas.data ?? []) as { persona_id: string; created_at: string }[]).map((a) => ({ persona_id: a.persona_id, cuando: a.created_at })),
    ...tareas.map((t) => ({ persona_id: t.persona_id, cuando: t.updated_at })),
  ];
  const monitoreo = armarMonitoreo(activas, tareas, movimientos, hoy, c.zona, ahora);
  const inactivas = monitoreo.filter((m) => m.inactiva);
  const lista = (sesiones.data ?? []) as SesionFila[];
  const proxima = [...lista].filter((s) => !s.hecho && new Date(s.fecha) >= ahora).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const evals = (evaluaciones.data ?? []) as Evaluacion[];
  const evaluados = [...new Set(evals.map((e) => e.evaluado_id))];
  const completos = evaluados.filter((id) => evals.filter((e) => e.evaluado_id === id).every((e) => e.respondida_at)).length;
  const ciclos = [...new Set(((ciclosRaw.data ?? []) as { ciclo: string }[]).map((x) => x.ciclo).concat(cicloDe(hoy)))].sort().reverse();
  const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-PE", { timeZone: c.zona, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const textoUltima = (iso: string | null) => {
    if (!iso) return "Nada en 90 días";
    const dia = localEn(iso, c.zona).slice(0, 10);
    if (dia === hoy) return `Hoy, ${horaEn(iso, c.zona)}`;
    if (dia === sumarDias(hoy, -1)) return "Ayer";
    const dias = Math.round((ahora.getTime() - new Date(iso).getTime()) / 86400000);
    return `Hace ${dias} días`;
  };
  const personaSel = activas.find((p) => p.id === sp.persona) ?? todas.find((p) => p.id === sp.persona) ?? activas[0] ?? null;
  const { data: legajo } = pestana === "legajos" && personaSel ? await sb.from("os_legajos").select("ingreso,contrato,telefono,documento,notas").eq("persona_id", personaSel.id).eq("company_id", c.companyId).maybeSingle() : { data: null };
  const puedeDueno = c.rol === "dueno" || c.rol === "consultor";

  return (
    <div className="tablero os-tablero">
      <header className="os-cabeza">
        <div className="os-cabeza__textos">
          <p className="t-etiqueta">Mi equipo · últimos {DIAS_INACTIVO} días</p>
          <h1 className="t-titulo">Equipo y talento</h1>
        </div>
      </header>
      <nav className="os-pestanas" aria-label="Secciones de talento">
        {visibles.map(([k, nombre]) => (
          <Link key={k} className="os-pestana" href={`/os/talento?pestana=${k}`} aria-current={pestana === k ? "page" : undefined}>
            {nombre}
          </Link>
        ))}
      </nav>

      <div className="os-dos">
        <section className="os-tarjeta">
          {pestana === "monitoreo" && (
            <>
              <h2 className="t-seccion">Cumplimiento por persona</h2>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>Tareas terminadas a tiempo sobre las que vencían en los últimos {DIAS_INACTIVO} días. Sin tareas que vencieran, no hay porcentaje.</p>
              {monitoreo.length === 0 ? (
                <p className="t-cuerpo">Todavía no hay nadie en tu equipo.</p>
              ) : (
                <div className="os-tabla-caja">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Persona</th>
                        <th scope="col">Cumplimiento</th>
                        <th scope="col">A tiempo</th>
                        <th scope="col">Atrasadas</th>
                        <th scope="col">Última actividad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitoreo.map((m) => {
                        const color = m.pct == null ? "var(--grafito)" : m.pct >= 85 ? "var(--confirmado)" : m.pct >= 70 ? "var(--acero-fuerte)" : "var(--caducado)";
                        return (
                          <tr key={m.persona.id}>
                            <td>
                              <span className="os-persona__textos">
                                <span className="os-persona__nombre">{m.persona.nombre}</span>
                                <span className="os-persona__sub">{m.persona.puesto || NOMBRE_ROL[m.persona.rol]}{m.persona.user_id ? "" : " · sin cuenta"}</span>
                              </span>
                            </td>
                            <td style={{ minWidth: 150 }}>
                              <span className="flex items-center gap-3">
                                <span className="os-barra" aria-hidden="true"><span style={{ width: `${m.pct ?? 0}%`, background: color }} /></span>
                                <b style={{ color, minWidth: 44, textAlign: "right" }}>{m.pct == null ? "—" : `${m.pct}%`}</b>
                              </span>
                            </td>
                            <td>{m.aTiempo}</td>
                            <td>{m.atrasadas}</td>
                            <td style={{ whiteSpace: "nowrap", color: m.inactiva ? "var(--contradicho)" : undefined, fontWeight: 600 }}>{textoUltima(m.ultima)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {pestana === "personas" && (
            <>
              <h2 className="t-seccion">Agregar a alguien del equipo</h2>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>
                La persona entra creando su cuenta en 8X (en «Crear cuenta») con el mismo correo que pongas aquí: queda enlazada sola. Si ya tenía cuenta, se enlaza de una vez.
              </p>
              <FormPersona puedeDueno={puedeDueno} />
              <hr className="separador" />
              <h2 className="t-seccion">Tu equipo · {activas.length} {activas.length === 1 ? "persona" : "personas"}</h2>
              <div className="flex flex-col gap-3">
                {todas.map((p) => (
                  <details key={p.id} className="os-plegable" style={{ borderTop: "1px solid var(--linea)", paddingTop: 12 }}>
                    <summary style={{ width: "100%", justifyContent: "space-between", gap: 12, color: "var(--tinta)" }}>
                      <span className="os-persona">
                        <span className="os-avatar" aria-hidden="true">{iniciales(p.nombre)}</span>
                        <span className="os-persona__textos">
                          <span className="os-persona__nombre">{p.nombre}{!p.activo && " · desactivada"}</span>
                          <span className="os-persona__sub">
                            {NOMBRE_ROL[p.rol]}{p.puesto ? ` · ${p.puesto}` : ""} · {p.user_id ? "con cuenta" : p.email ? `sin cuenta todavía (${p.email})` : "sin correo"}
                          </span>
                        </span>
                      </span>
                      <span className="t-dato" style={{ color: "var(--acero-fuerte)" }}>Editar</span>
                    </summary>
                    <div className="flex flex-col gap-3">
                      <FormPersona inicial={p} puedeDueno={puedeDueno} />
                      {p.id !== c.persona?.id && <ActivarPersona id={p.id} nombre={p.nombre} activo={p.activo} />}
                    </div>
                  </details>
                ))}
              </div>
            </>
          )}

          {pestana === "legajos" && (
            <>
              <h2 className="t-seccion">Legajos</h2>
              <nav className="os-filtros" aria-label="Elegir persona">
                {activas.map((p) => (
                  <Link key={p.id} className="os-pildora" href={`/os/talento?pestana=legajos&persona=${p.id}`} aria-current={personaSel?.id === p.id ? "page" : undefined} scroll={false}>
                    {p.nombre}
                  </Link>
                ))}
              </nav>
              {personaSel ? (
                <>
                  <div className="os-persona">
                    <span className="os-avatar" aria-hidden="true">{iniciales(personaSel.nombre)}</span>
                    <span className="os-persona__textos">
                      <span className="os-persona__nombre">{personaSel.nombre}</span>
                      <span className="os-persona__sub">{NOMBRE_ROL[personaSel.rol]}{personaSel.puesto ? ` · ${personaSel.puesto}` : ""}{personaSel.email ? ` · ${personaSel.email}` : ""}</span>
                    </span>
                  </div>
                  <FormLegajo key={personaSel.id} personaId={personaSel.id} inicial={legajo as Legajo | null} />
                </>
              ) : (
                <p className="t-cuerpo">Agrega primero a tu equipo en «Personas».</p>
              )}
            </>
          )}

          {pestana === "acompanamiento" && (
            <>
              <h2 className="t-seccion">Programar una sesión</h2>
              {activas.length ? <NuevaSesion personas={activas.map((p) => ({ id: p.id, nombre: p.nombre }))} minimo={localEn(ahora, c.zona)} /> : <p className="t-cuerpo">Agrega primero a tu equipo.</p>}
              <hr className="separador" />
              <h2 className="t-seccion">Sesiones</h2>
              {lista.length === 0 && <p className="t-dato" style={{ color: "var(--grafito)" }}>Todavía no hay sesiones.</p>}
              {lista.map((s) => (
                <div key={s.id} className="pozo pozo--chico flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <b>{nombreDe.get(s.persona_id) ?? "—"}</b>
                    <span className="t-dato" style={{ color: "var(--grafito)" }}>{fechaHora(s.fecha)}</span>
                    <span className={`os-chip os-chip--${s.hecho ? "activo" : "en_pausa"}`}>{s.hecho ? "Hecha" : "Pendiente"}</span>
                  </div>
                  <span className="t-dato">Tema: {s.tema}</span>
                  <Sesion id={s.id} acuerdos={s.acuerdos} hecho={s.hecho} />
                </div>
              ))}
            </>
          )}

          {pestana === "360" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="t-seccion">Evaluaciones 360 · ciclo {ciclo}</h2>
                {ciclos.length > 1 && (
                  <nav className="os-filtros" aria-label="Otros ciclos">
                    {ciclos.map((k) => (
                      <Link key={k} className="os-pildora" href={`/os/talento?pestana=360&ciclo=${k}`} aria-current={k === ciclo ? "page" : undefined} scroll={false}>{k}</Link>
                    ))}
                  </nav>
                )}
              </div>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>
                Cada persona se evalúa a sí misma, la evalúa su jefe y dos compañeros. Cada uno responde en «Mi perfil», del 1 al 5 en cinco dimensiones.
              </p>
              {ciclo === cicloDe(hoy) && <AbrirCiclo360 ciclo={ciclo} personas={activas.map((p) => ({ id: p.id, nombre: p.nombre, conCuenta: !!p.user_id }))} />}
              <hr className="separador" />
              {evaluados.length === 0 ? (
                <p className="t-dato" style={{ color: "var(--grafito)" }}>No hay evaluaciones en este ciclo.</p>
              ) : (
                evaluados.map((id) => {
                  const suyas = evals.filter((e) => e.evaluado_id === id);
                  const dadas = suyas.filter((e) => e.respondida_at);
                  const prom = promedios(dadas.map((e) => e.puntajes));
                  return (
                    <div key={id} className="pozo pozo--chico flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <b style={{ minWidth: 150 }}>{nombreDe.get(id) ?? "—"}</b>
                        <span className="os-barra" aria-hidden="true"><span style={{ width: `${(dadas.length * 100) / suyas.length}%`, background: dadas.length === suyas.length ? "var(--confirmado)" : "var(--acero)" }} /></span>
                        <span className="t-dato">{dadas.length} de {suyas.length} respuestas</span>
                      </div>
                      <span className="t-dato" style={{ color: "var(--grafito)" }}>
                        {suyas.map((e) => `${NOMBRE_RELACION[e.relacion]}${e.relacion === "auto" ? "" : ` (${nombreDe.get(e.evaluador_id) ?? "—"})`}: ${e.respondida_at ? "respondió" : "pendiente"}`).join(" · ")}
                      </span>
                      {dadas.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {DIMENSIONES_360.map(([k, nombre]) => (
                            <span key={k} className="t-dato">{nombre}: <b>{prom[k] == null ? "—" : String(prom[k]).replace(".", ",")}</b></span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </section>

        <aside aria-label="Lo que pide atención">
          <section className="os-tarjeta">
            <h2 className="t-seccion">Inactivos hace más de {DIAS_INACTIVO} días</h2>
            {inactivas.length === 0 ? (
              <p className="t-dato" style={{ color: "var(--grafito)" }}>Nadie: todo el equipo se movió en el último mes.</p>
            ) : (
              inactivas.map((m) => (
                <div key={m.persona.id} className="flex flex-col gap-2">
                  <div className="os-alerta os-alerta--roja">
                    <strong>{m.persona.nombre}{m.persona.puesto ? ` · ${m.persona.puesto}` : ""}</strong>
                    <span>{m.ultima ? `Sin actividad desde hace ${Math.round((ahora.getTime() - new Date(m.ultima).getTime()) / 86400000)} días.` : "Sin actividad registrada."} ¿Sigue en la empresa?</span>
                  </div>
                  {c.talento && (
                    <div className="flex flex-wrap gap-3">
                      <Link className="boton boton--chico" href={`/os/talento?pestana=legajos&persona=${m.persona.id}`}>Abrir legajo</Link>
                      <Link className="boton boton--secundario boton--chico" href="/os/talento?pestana=personas">Darle de baja</Link>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
          {c.talento && (
            <section className="os-tarjeta">
              <h2 className="t-seccion">360 del ciclo {ciclo}</h2>
              {evaluados.length ? (
                <>
                  <span className="t-dato">{completos} de {evaluados.length} {evaluados.length === 1 ? "persona" : "personas"} con su evaluación completa.</span>
                  <div className="os-barra os-barra--gruesa" aria-hidden="true"><span style={{ width: `${(completos * 100) / evaluados.length}%` }} /></div>
                </>
              ) : (
                <span className="t-dato" style={{ color: "var(--grafito)" }}>Sin ciclo abierto este mes.</span>
              )}
            </section>
          )}
          {c.talento && proxima && (
            <section className="os-tarjeta os-tarjeta--noche">
              <span className="t-rotulo">Próximo acompañamiento</span>
              <h2 className="t-seccion">{nombreDe.get(proxima.persona_id)} · {fechaHora(proxima.fecha)}</h2>
              <span className="t-dato">Tema: {proxima.tema}</span>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
