"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/textos";
import {
  ESTADO_CONSULTOR, TRANSICIONES, VERBO, NOTA_VERIFICADA_NO_ES_RESULTADO, ERROR_SIN_EVIDENCIA, limiteFrentes,
  type PlanCargado, type AccionConContexto, type Estado, type Evento,
} from "@/lib/plan-reglas";
import { FichaAccion } from "./FichaAccion";
import { Decidir } from "./Decidir";
import { HistorialAccion } from "./HistorialAccion";
import { SubirPrueba } from "./SubirPrueba";

const ORDEN: Estado[] = ["propuesto", "aprobado", "en_ejecucion", "bloqueado", "reportado", "verificado", "pospuesto", "rechazado"];

const COLOR: Record<Estado, string> = {
  propuesto: "var(--grafito)",
  aprobado: "var(--marca)",
  en_ejecucion: "var(--marca)",
  reportado: "var(--caducado)",
  verificado: "var(--confirmado)",
  rechazado: "var(--contradicho)",
  pospuesto: "var(--grafito)",
  bloqueado: "var(--contradicho)",
};

/** Qué botón pide qué: motivo, motivo e implicación, o nada. Modificar va por la ficha; comentar tiene su caja. */
const PIDE: Partial<Record<Evento, { titulo: string; implica: boolean; peligro?: boolean; boton: string }>> = {
  rechazar: { titulo: "Rechazar: no se hace. Queda el motivo para no volver a proponerla igual.", implica: true, peligro: true, boton: "Rechazar" },
  posponer: { titulo: "Posponer: no ahora. No es un no.", implica: true, boton: "Posponer" },
  bloquear: { titulo: "¿Qué la bloquea?", implica: false, boton: "Marcar bloqueada" },
  rechazar_verificacion: { titulo: "Devolver a ejecución: qué falta para darla por hecha.", implica: false, peligro: true, boton: "Devolver" },
  escalar: { titulo: "Escalar: qué necesita decisión de más arriba.", implica: false, boton: "Escalar" },
  proponer: { titulo: "Volver a proponer: por qué vuelve a estar sobre la mesa.", implica: false, boton: "Volver a proponer" },
  verificar: { titulo: "Verificar: nota de lo que se comprobó (opcional).", implica: false, boton: "Verificar" },
};

const ETIQUETA_BOTON: Partial<Record<Evento, string>> = { aprobar: "Aprobar", iniciar: "Iniciar", reportar: "Reportar", desbloquear: "Desbloquear" };

/**
 * EL PLAN VISTO POR LA CONSULTORA: tabla por estado, ficha de 14 campos, y las decisiones con su motivo.
 * El botón Aprobar está gris mientras falte algo (y dice qué) o mientras el límite de frentes esté lleno
 * (y dice cuáles). Verificar exige prueba: reportado no es verificado.
 */
export function PlanConsultor({ companyId, plan }: { companyId: string; plan: PlanCargado }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [decidiendo, setDecidiendo] = useState<{ id: string; evento: Evento } | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [comentario, setComentario] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const grupos = ORDEN.map((e) => ({ estado: e, acciones: plan.acciones.filter((a) => a.estado_canonico === e) })).filter((g) => g.acciones.length);
  const otras = plan.acciones.map((a) => ({ id: a.id, accion: a.accion }));

  const enviar = async (a: AccionConContexto, evento: Evento, motivo?: string, implica?: string) => {
    setOcupado(true);
    setError(null);
    try {
      await pedir(`/api/actions/${a.id}/transicion`, { json: { evento, motivo: motivo || undefined, implica: implica || undefined } });
      setDecidiendo(null);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo.";
      setError(msg);
      throw new Error(msg);
    } finally {
      setOcupado(false);
    }
  };

  const comentar = async (a: AccionConContexto) => {
    const texto = (comentario[a.id] ?? "").trim();
    if (!texto) return;
    setError(null);
    try {
      await pedir(`/api/actions/${a.id}/comentario`, { json: { texto } });
      setComentario((c) => ({ ...c, [a.id]: "" }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo comentar.");
    }
  };

  const botones = (a: AccionConContexto) => {
    const eventos = (Object.keys(TRANSICIONES[a.estado_canonico]) as Evento[]).filter((e) => e !== "comentar" && e !== "modificar");
    const frentes = limiteFrentes(plan.acciones, plan.limiteFrentes, a);
    const pide = decidiendo?.id === a.id ? PIDE[decidiendo.evento] : undefined;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          {eventos.map((e) => {
            if (e === "aprobar") {
              const bloqueado = a.falta.length > 0 || !frentes.ok;
              return (
                <button key={e} type="button" className="boton" style={bloqueado ? { background: "var(--linea)", color: "var(--grafito)", borderColor: "var(--linea)", cursor: "not-allowed" } : undefined} disabled={bloqueado || ocupado} title={a.falta.length ? `Falta: ${a.falta.join("; ")}` : !frentes.ok ? frentes.error : undefined} onClick={() => enviar(a, "aprobar").catch(() => {})}>
                  Aprobar
                </button>
              );
            }
            if (e === "verificar") {
              const sinPrueba = a.pruebas === 0;
              return (
                <button key={e} type="button" className="boton boton--secundario" disabled={sinPrueba || ocupado} title={sinPrueba ? ERROR_SIN_EVIDENCIA : undefined} style={sinPrueba ? { color: "var(--grafito)", cursor: "not-allowed" } : { borderColor: "var(--confirmado)", color: "var(--confirmado)" }} onClick={() => setDecidiendo({ id: a.id, evento: e })}>
                  Verificar{sinPrueba ? " (falta evidencia)" : ` (${a.pruebas} prueba${a.pruebas === 1 ? "" : "s"})`}
                </button>
              );
            }
            if (e === "reportar") {
              return (
                <button key={e} type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => (a.pruebas ? enviar(a, "reportar").catch(() => {}) : setSubiendo(a.id))}>
                  Reportar{a.pruebas ? "" : " (subir prueba)"}
                </button>
              );
            }
            const def = PIDE[e];
            if (def) {
              return (
                <button key={e} type="button" className={`boton ${def.peligro ? "boton--peligro" : "boton--secundario"}`} disabled={ocupado} onClick={() => setDecidiendo({ id: a.id, evento: e })}>
                  {def.boton}
                </button>
              );
            }
            return (
              <button key={e} type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => enviar(a, e).catch(() => {})}>
                {ETIQUETA_BOTON[e] ?? VERBO[e]}
              </button>
            );
          })}
        </div>
        {a.estado_canonico === "propuesto" && a.falta.length > 0 && (
          <div style={{ borderLeft: "2px solid var(--caducado)", paddingLeft: 10 }}>
            <p className="t-etiqueta" style={{ color: "var(--caducado)" }}>PARA APROBARLA FALTA</p>
            <ul className="lista-editorial">
              {a.falta.map((f) => <li key={f} className="t-dato">· {f}</li>)}
            </ul>
          </div>
        )}
        {a.estado_canonico === "propuesto" && a.falta.length === 0 && !frentes.ok && (
          <p className="t-dato" style={{ color: "var(--contradicho)" }}>{frentes.error}</p>
        )}
        {a.estado_canonico === "reportado" && a.pruebas === 0 && <p className="t-dato" style={{ color: "var(--contradicho)" }}>{ERROR_SIN_EVIDENCIA}. Pide una foto, un archivo o una nota antes de verificar.</p>}
        {a.estado_canonico === "verificado" && <p className="t-dato" style={{ color: "var(--grafito)" }}>{NOTA_VERIFICADA_NO_ES_RESULTADO}</p>}
        {a.estado_canonico === "bloqueado" && a.bloqueo && <p className="t-dato" style={{ color: "var(--contradicho)" }}>Bloqueo: {a.bloqueo}{a.bloqueado_at ? ` (desde ${fechaCorta(a.bloqueado_at)})` : ""}</p>}
        {a.escalado_at && <p className="t-dato" style={{ color: "var(--caducado)" }}>Escalada el {fechaCorta(a.escalado_at)}.</p>}
        {decidiendo?.id === a.id && pide && (
          <Decidir
            titulo={pide.titulo}
            pideImplica={pide.implica}
            peligro={pide.peligro}
            textoBoton={pide.boton}
            etiquetaMotivo={decidiendo.evento === "verificar" ? "Qué se comprobó" : "Por qué"}
            onEnviar={(m, i) => enviar(a, decidiendo.evento, m, i)}
            onCancelar={() => setDecidiendo(null)}
          />
        )}
        {subiendo === a.id && (
          <SubirPrueba companyId={companyId} actionId={a.id} onCancelar={() => setSubiendo(null)} onSubida={async (p) => { setSubiendo(null); await pedir(`/api/actions/${a.id}/transicion`, { json: { evento: "reportar", evidencia_id: p.id } }); router.refresh(); }} />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="panel p-4 flex flex-wrap gap-6 items-baseline">
        <div>
          <div className="t-etiqueta">Frentes abiertos</div>
          <div className="t-seccion" style={{ color: plan.abiertas.length >= plan.limiteFrentes ? "var(--contradicho)" : undefined }}>{plan.abiertas.length} de {plan.limiteFrentes}</div>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="t-etiqueta">Cuáles</div>
          <p className="t-dato">{plan.abiertas.length ? plan.abiertas.map((a) => a.accion).join(" · ") : "Ninguna prioridad aprobada todavía."}</p>
        </div>
        <div>
          <div className="t-etiqueta">Punto de partida</div>
          <p className="t-dato">{plan.lineaBaseVigente ? `Versión ${plan.lineaBaseVigente.version} (vigente)` : "La empresa aún no tiene línea base: las acciones se aprueban sin referencia"}</p>
        </div>
      </div>

      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}

      {grupos.map((g) => (
        <section key={g.estado}>
          <h2 className="t-seccion mb-2" style={{ color: COLOR[g.estado] }}>{ESTADO_CONSULTOR[g.estado]}{g.estado === "reportado" ? " · pendiente de comprobar" : ""} <span className="t-dato" style={{ color: "var(--grafito)" }}>({g.acciones.length})</span></h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Acción</th>
                <th>Responsable</th>
                <th>Vence</th>
                <th>Prioridad</th>
                <th>Pruebas</th>
                <th>Listo para aprobar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {g.acciones.map((a) => {
                const vencida = a.vence_at && a.vence_at < new Date().toISOString().slice(0, 10) && !["verificado", "rechazado", "pospuesto"].includes(a.estado_canonico);
                return (
                  <Fragment key={a.id}>
                    {/* El id es el ancla de los enlaces de la revisión semanal (/plan#accion-…): aterrizan en esta fila. */}
                    <tr id={`accion-${a.id}`}>
                      <td className="t-cuerpo">{a.accion}{a.finding_titulo && <div className="t-dato" style={{ color: "var(--grafito)" }}>Hallazgo: {a.finding_titulo}</div>}</td>
                      <td className="t-dato">{a.responsable_nombre ?? <span style={{ color: "var(--caducado)" }}>{a.responsable ? `${a.responsable} (sin identificar)` : "Sin responsable"}</span>}</td>
                      <td className="t-dato" style={{ color: vencida ? "var(--contradicho)" : undefined }}>{fechaCorta(a.vence_at)}</td>
                      <td className="t-dato">{a.es_prioridad ? "Sí" : "No"}</td>
                      <td className="t-dato">{a.pruebas}</td>
                      <td className="t-dato">{a.estado_canonico === "propuesto" ? (a.falta.length ? <span style={{ color: "var(--caducado)" }}>Faltan {a.falta.length}</span> : <span style={{ color: "var(--confirmado)" }}>Sí</span>) : "—"}</td>
                      <td>
                        <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--marca)", textDecoration: "underline" }} onClick={() => setAbierta(abierta === a.id ? null : a.id)}>
                          {abierta === a.id ? "Cerrar" : "Ficha"}
                        </button>
                      </td>
                    </tr>
                    {abierta === a.id && (
                      <tr>
                        <td colSpan={7}>
                          <div className="panel p-4 flex flex-col gap-4" style={{ background: "var(--suave)" }}>
                            {botones(a)}
                            <FichaAccion accion={a} participantes={plan.participantes} indicadores={plan.indicadores} lineasBase={plan.lineasBase} otras={otras} onGuardado={() => router.refresh()} />
                            <div>
                              <div className="t-etiqueta mb-1">Comentar</div>
                              <div className="flex gap-2">
                                <input className="campo" placeholder="Para la empresa o para el historial" aria-label="Comentario" value={comentario[a.id] ?? ""} onChange={(e) => setComentario((c) => ({ ...c, [a.id]: e.target.value }))} />
                                <button type="button" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }} disabled={!(comentario[a.id] ?? "").trim()} onClick={() => comentar(a)}>Enviar</button>
                              </div>
                            </div>
                            <div>
                              <div className="t-etiqueta mb-1">Historial: quién decidió qué, por qué y qué implica</div>
                              <HistorialAccion historial={a.historial} modo="consultor" />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
