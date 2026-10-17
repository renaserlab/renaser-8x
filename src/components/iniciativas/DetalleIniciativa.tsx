"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import {
  TRANSICIONES, diaCorto, momentoCorto, verboDe,
  type Estado, type EvidenciaDisponible, type IndicadorBreve, type IniciativaConContexto, type PersonaDeLaEmpresa,
} from "@/lib/iniciativas";
import { FichaIniciativa } from "./FichaIniciativa";
import { FuentesAportadas } from "./FuentesAportadas";
import { HistorialIniciativa } from "./HistorialIniciativa";
import { PasoConMotivo } from "./PasoConMotivo";

type Formulario = { titulo: string; etiquetaMotivo: string; evidencia: boolean; peligro?: boolean };

/** Qué pasos piden explicación antes de darse. Los que no están aquí se dan con un clic. */
function formularioDe(de: Estado, a: Estado): Formulario | null {
  if (a === "continuar") return { titulo: "Continuar: sigue como va. Di por qué y qué se observó.", etiquetaMotivo: "Por qué se continúa", evidencia: true };
  if (a === "ajustar") return { titulo: "Ajustar: se cambia algo y se sigue. Di qué se va a cambiar y qué se observó.", etiquetaMotivo: "Qué se va a cambiar y por qué", evidencia: true };
  if (a === "detener") return { titulo: "Detener: se deja de hacer. Di por qué y qué se observó.", etiquetaMotivo: "Por qué se detiene", evidencia: true, peligro: true };
  if (a === "cerrada" && de === "propuesta") return { titulo: "Descartar: no se hará. Queda el motivo para no volver a proponerla igual.", etiquetaMotivo: "Por qué se descarta", evidencia: false, peligro: true };
  if (a === "cerrada" && de === "continuar") return { titulo: "Cerrar: di cómo terminó.", etiquetaMotivo: "Cómo terminó", evidencia: false };
  if (a === "en_curso" && de === "ajustar") return { titulo: "Reanudar: di qué se ajustó.", etiquetaMotivo: "Qué se ajustó", evidencia: false };
  return null;
}

const QUE = { continuar: "Continuar si", ajustar: "Ajustar si", detener: "Detener si" } as const;

/**
 * UNA INICIATIVA ABIERTA: sus pasos, lo que le falta, lo que dicen sus criterios, su ficha, sus fuentes y
 * su historial. El botón Aprobar está apagado mientras falte algo, y dice qué. Continuar, ajustar y
 * detener abren un formulario que pide el porqué y lo observado. Lo que dicen los criterios es una lectura
 * del dato disponible: sin dato no hay veredicto, y la decisión la toma una persona.
 */
export function DetalleIniciativa({ companyId, iniciativa: i, participantes, indicadores, evidencias, hoy, zona, onCambio }: {
  companyId: string;
  iniciativa: IniciativaConContexto;
  participantes: PersonaDeLaEmpresa[];
  indicadores: IndicadorBreve[];
  evidencias: EvidenciaDisponible[];
  hoy: string;
  zona: string;
  onCambio: (aviso?: string | null) => void;
}) {
  const [paso, setPaso] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pasos = TRANSICIONES[i.estado];
  const listaParaAprobar = i.falta.length === 0 && i.pertinencia.puede_avanzar;
  const porQueNo = i.falta.length ? `Falta: ${i.falta.map((f) => f.etiqueta.toLowerCase()).join(", ")}` : i.pertinencia.pide.join(" ");
  const enMarcha = i.estado === "aprobada" || i.estado === "en_curso" || i.estado === "continuar" || i.estado === "ajustar";
  const ev = i.evaluacion;

  const dar = async (a: Estado, datos: { motivo?: string; que_se_observo?: string; valor_observado?: string } = {}) => {
    setOcupado(true);
    setError(null);
    try {
      const r = await pedir<{ aviso: string | null }>(`/api/companies/${companyId}/iniciativas/${i.id}/transicion`, {
        json: { a_estado: a, motivo: datos.motivo || undefined, que_se_observo: datos.que_se_observo || undefined, valor_observado: datos.valor_observado || undefined },
      });
      setPaso(null);
      onCambio(r.aviso);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo.";
      setError(msg);
      throw new Error(msg);
    } finally {
      setOcupado(false);
    }
  };

  const formulario = paso ? formularioDe(i.estado, paso) : null;

  return (
    <div className="panel p-4 flex flex-col gap-4" style={{ background: "var(--suave)" }}>
      <div className="flex flex-col gap-2">
        {pasos.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {pasos.map((a) => {
              if (a === "aprobada") {
                return (
                  <button key={a} type="button" className="boton" style={listaParaAprobar ? undefined : { background: "var(--linea)", color: "var(--grafito)", borderColor: "var(--linea)", cursor: "not-allowed" }} disabled={!listaParaAprobar || ocupado} title={listaParaAprobar ? undefined : porQueNo} onClick={() => dar(a).catch(() => {})}>
                    Aprobar
                  </button>
                );
              }
              const f = formularioDe(i.estado, a);
              return (
                <button key={a} type="button" className={`boton ${f?.peligro ? "boton--peligro" : "boton--secundario"}`} disabled={ocupado} onClick={() => (f ? setPaso(a) : dar(a).catch(() => {}))}>
                  {verboDe(i.estado, a)}
                </button>
              );
            })}
          </div>
        )}
        {i.estado === "propuesta" && i.falta.length > 0 && (
          <div style={{ borderLeft: "1px solid var(--caducado)", paddingLeft: 10 }}>
            <p className="t-etiqueta" style={{ color: "var(--caducado)" }}>PARA APROBARLA FALTA</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {i.falta.map((f) => <li key={f.campo} className="t-dato">· <strong>{f.etiqueta}.</strong> <span style={{ color: "var(--grafito)" }}>{f.por_que}</span></li>)}
            </ul>
          </div>
        )}
        {i.estado === "propuesta" && i.falta.length === 0 && !i.pertinencia.puede_avanzar && (
          <p className="t-dato" style={{ color: "var(--contradicho)" }}>{i.pertinencia.pide.join(" ")}</p>
        )}
        {i.estado === "propuesta" && listaParaAprobar && (
          <p className="t-dato" style={{ color: "var(--confirmado)" }}>La ficha está completa: se puede aprobar. Al aprobarla, el dueño la ve en su portal.</p>
        )}
        {i.pertinencia.avisos.map((a) => <p key={a} className="t-dato" style={{ color: "var(--caducado)" }}>{a}</p>)}
        {i.pertinencia.no_la_impide.length > 0 && (
          <details>
            <summary className="t-dato" style={{ cursor: "pointer", color: "var(--grafito)" }}>
              Al levantamiento le {i.pertinencia.no_la_impide.length === 1 ? "falta 1 cosa que no tiene" : `faltan ${i.pertinencia.no_la_impide.length} cosas que no tienen`} que ver con esta iniciativa: no la {i.pertinencia.no_la_impide.length === 1 ? "impide" : "impiden"}.
            </summary>
            <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
              {i.pertinencia.no_la_impide.map((x) => <li key={x} className="t-dato" style={{ color: "var(--grafito)" }}>· {x}</li>)}
            </ul>
          </details>
        )}
        {i.toca_decidir && <p className="t-dato" style={{ color: "var(--contradicho)" }}>El plazo se cumplió el {diaCorto(i.plazo_fin)}: toca decidir si continúa, se ajusta o se detiene.</p>}
        {i.decision_at && i.estado !== "propuesta" && (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>
            Última decisión registrada el {momentoCorto(i.decision_at, zona)}{i.decision_motivo ? `: ${i.decision_motivo}` : "."}
          </p>
        )}
        {formulario && paso && (
          <PasoConMotivo
            titulo={formulario.titulo}
            etiquetaMotivo={formulario.etiquetaMotivo}
            pideEvidencia={formulario.evidencia}
            pideValor={!i.indicador_id}
            textoBoton={verboDe(i.estado, paso)}
            peligro={formulario.peligro}
            onEnviar={(datos) => dar(paso, datos)}
            onCancelar={() => setPaso(null)}
          />
        )}
        {error && !formulario && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      </div>

      {enMarcha && (
        <div>
          <div className="t-etiqueta mb-1">Qué dicen los criterios con el dato disponible</div>
          <p className="t-dato" style={{ color: ev.hay_dato ? undefined : "var(--caducado)" }}>
            {ev.hay_dato ? ev.texto : `Sin dato para evaluar. ${ev.valor.por_que_no ?? ""}`}
          </p>
          {ev.hay_dato && ev.valor.calidad && ev.valor.calidad !== "verificado" && ev.valor.calidad !== "conciliado" && (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>El valor todavía no está comprobado: {ev.valor.calidad === "extraido" ? "salió de un documento sin conciliar" : "lo declaró la empresa"}.</p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
            {ev.criterios.map((c) => (
              <li key={c.decision} className="t-dato" style={{ color: "var(--grafito)" }}>
                <span className="t-etiqueta">{QUE[c.decision]}</span> {c.texto ?? "sin escribir"}
                {c.texto ? ` (${c.se_lee_como})` : ""}
                {c.cumple === true && <strong style={{ color: "var(--tinta)" }}> · se cumple</strong>}
                {c.cumple === false && " · no se cumple"}
              </li>
            ))}
          </ul>
          <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12 }}>Es una lectura del dato, no una decisión. Decidir continuar, ajustar o detener lo hace una persona, con su porqué.</p>
        </div>
      )}

      <FichaIniciativa key={`${i.id}:${i.estado}`} companyId={companyId} iniciativa={i} participantes={participantes} indicadores={indicadores} evidencias={evidencias} onGuardado={() => onCambio()} />

      <div>
        <div className="t-etiqueta mb-1">Fuentes aportadas: lo que alguien puso sobre la mesa, con quién, cuándo y qué dice</div>
        <FuentesAportadas companyId={companyId} iniciativaId={i.id} fuentes={i.fuentes_aportadas} admite={i.estado !== "detener" && i.estado !== "cerrada"} hoy={hoy} onGuardado={() => onCambio()} />
      </div>

      <div>
        <div className="t-etiqueta mb-1">Historial: quién decidió qué, por qué y con qué evidencia</div>
        <HistorialIniciativa historial={i.historial} zona={zona} />
      </div>
    </div>
  );
}
