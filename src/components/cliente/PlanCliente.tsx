"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { fechaCorta } from "@/lib/textos";
import { ESTADO_CLIENTE, type AccionConContexto, type Estado } from "@/lib/plan-reglas";
import { SubirPrueba } from "@/components/plan/SubirPrueba";
import { Decidir } from "@/components/plan/Decidir";
import { HistorialAccion } from "@/components/plan/HistorialAccion";

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

/**
 * «TU PLAN», VISTO POR EL DUEÑO. Solo lo aprobado y lo que sigue de ahí. Cada acción dice quién, para
 * cuándo y qué se espera. «Ya lo hice» pide una prueba (foto, archivo o nota) y la deja en «Enviado para
 * revisar»: nunca en comprobada, eso lo hace la consultora. Nada de jerga: indicador, punto de partida.
 */
export function PlanCliente({ companyId, acciones }: { companyId: string; acciones: AccionConContexto[] }) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [trabando, setTrabando] = useState<string | null>(null);
  const [comentario, setComentario] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const transicion = async (id: string, json: Record<string, unknown>) => {
    setError(null);
    try {
      await pedir(`/api/actions/${id}/transicion`, { json });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
      throw e;
    }
  };

  const comentar = async (id: string) => {
    const texto = (comentario[id] ?? "").trim();
    if (!texto) return;
    setError(null);
    try {
      await pedir(`/api/actions/${id}/comentario`, { json: { texto } });
      setComentario((c) => ({ ...c, [id]: "" }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar el comentario.");
    }
  };

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
      {acciones.map((a) => {
        const e = a.estado_canonico;
        const vencida = a.vence_at && a.vence_at < hoy && (e === "aprobado" || e === "en_ejecucion" || e === "bloqueado");
        const puedeReportar = e === "aprobado" || e === "en_ejecucion";
        return (
          <article key={a.id} className="panel p-4 flex flex-col gap-3" style={{ borderTop: `2.5px solid ${COLOR[e]}` }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="t-dato" style={{ color: COLOR[e] }}>{ESTADO_CLIENTE[e]}</span>
              <span className="t-dato" style={{ color: vencida ? "var(--contradicho)" : "var(--grafito)" }}>{a.vence_at ? `${vencida ? "Venció el" : "Para el"} ${fechaCorta(a.vence_at)}` : "Sin fecha todavía"}</span>
            </div>
            <p className="t-cuerpo">{a.accion}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="t-etiqueta">Quién</div>
                <p className="t-dato">{a.responsable_nombre ?? a.responsable ?? "Por definir con la consultora"}</p>
              </div>
              <div>
                <div className="t-etiqueta">Qué se espera</div>
                <p className="t-dato">{a.resultado_esperado ?? a.criterio_aceptacion ?? a.evidencia ?? "Lo acordado con la consultora"}</p>
              </div>
            </div>
            {a.criterio_aceptacion && a.resultado_esperado && (
              <p className="t-dato" style={{ color: "var(--grafito)" }}>Se da por hecha cuando: {a.criterio_aceptacion}</p>
            )}

            {e === "bloqueado" && (
              <div style={{ borderLeft: "2px solid var(--contradicho)", paddingLeft: 10 }}>
                <p className="t-dato" style={{ color: "var(--contradicho)" }}>Trabada: {a.bloqueo ?? "sin detalle"}. La consultora ya lo ve.</p>
                <button type="button" className="boton boton--secundario mt-2" style={{ minHeight: 34, fontSize: 13 }} onClick={() => transicion(a.id, { evento: "desbloquear" }).catch(() => {})}>Ya se destrabó</button>
              </div>
            )}
            {e === "reportado" && <p className="t-dato" style={{ color: "var(--caducado)" }}>Enviado para revisar. La consultora comprobará la prueba y te avisa aquí si falta algo.</p>}
            {e === "verificado" && (
              <p className="t-dato" style={{ color: "var(--confirmado)" }}>
                Comprobada{a.verificado_at ? ` el ${fechaCorta(a.verificado_at)}` : ""}. Que esté hecha no significa que el negocio ya mejoró: eso se ve en el siguiente corte contra tu punto de partida.
              </p>
            )}

            {puedeReportar && subiendo !== a.id && trabando !== a.id && (
              <div className="flex gap-3 flex-wrap items-center">
                <button type="button" className="boton" onClick={() => setSubiendo(a.id)}>Ya lo hice</button>
                <button type="button" className="t-dato" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", color: "var(--grafito)", textDecoration: "underline" }} onClick={() => setTrabando(a.id)}>
                  Estoy trabado
                </button>
              </div>
            )}
            {subiendo === a.id && (
              <SubirPrueba
                companyId={companyId}
                actionId={a.id}
                titulo="¿Qué hiciste?"
                onCancelar={() => setSubiendo(null)}
                onSubida={async (p) => {
                  setSubiendo(null);
                  await transicion(a.id, { evento: "reportar", evidencia_id: p.id }).catch(() => {});
                }}
              />
            )}
            {trabando === a.id && (
              <Decidir titulo="¿Qué te traba?" pideImplica={false} etiquetaMotivo="Qué falta o qué lo impide" textoBoton="Avisar que está trabada" onEnviar={(m) => transicion(a.id, { evento: "bloquear", motivo: m }).then(() => setTrabando(null))} onCancelar={() => setTrabando(null)} />
            )}

            <details>
              <summary className="t-etiqueta" style={{ cursor: "pointer" }}>Comentarios</summary>
              <div className="flex flex-col gap-2 mt-2">
                <HistorialAccion historial={a.historial} modo="cliente" />
                <div className="flex gap-2">
                  <input className="campo" placeholder="Escribe a la consultora" aria-label="Comentario" value={comentario[a.id] ?? ""} onChange={(ev) => setComentario((c) => ({ ...c, [a.id]: ev.target.value }))} />
                  <button type="button" className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }} disabled={!(comentario[a.id] ?? "").trim()} onClick={() => comentar(a.id)}>Enviar</button>
                </div>
              </div>
            </details>
          </article>
        );
      })}
    </div>
  );
}
