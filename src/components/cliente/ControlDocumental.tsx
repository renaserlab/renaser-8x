"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { ESTADO_DOC, type Documento } from "@/lib/documental";
import { fechaCorta } from "@/lib/textos";

type Grupo = { tipo: string; nombre: string; vigente: Documento | null; historial: Documento[] };

const Sello = ({ estado }: { estado: string }) => {
  const e = ESTADO_DOC[estado] ?? ESTADO_DOC.borrador!;
  return (
    <span className="t-dato" style={{ flex: "none", fontSize: 11.5, fontWeight: 700, color: e.color, border: `1px solid ${e.color}`, borderRadius: "var(--radio)", padding: "1px 9px" }}>
      {e.texto}
    </span>
  );
};

/**
 * CONTROL DOCUMENTAL (ISO 9001 cláusula 7.5 — hallazgo de la auditoría del 29-08-2026).
 * Cada documento tiene versión, estado y quién lo aprobó. Al aprobar uno nuevo, el anterior queda
 * marcado como reemplazado en vez de desaparecer: eso es lo que un auditor viene a ver.
 */
export function ControlDocumental({ companyId, grupos }: { companyId: string; grupos: Grupo[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aprobar = async (id: string) => {
    setTrabajando(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/deliverables/aprobar`, { method: "POST", json: { deliverable_id: id, motivo } });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos aprobarlo.");
      setTrabajando(false);
    }
  };

  if (!grupos.length)
    return <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Todavía no hay documentos. Aparecerán aquí conforme los vayamos construyendo contigo.</p>;

  return (
    <ul className="flex flex-col gap-3">
      {grupos.map((g) => {
        const doc = g.vigente ?? g.historial[0] ?? null;
        if (!doc) return null;
        return (
          <li key={g.tipo} className="panel p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div style={{ minWidth: 0 }}>
                <p className="t-cuerpo" style={{ fontWeight: 600 }}>{g.nombre}</p>
                <p className="t-dato" style={{ color: "var(--grafito)" }}>
                  Versión {doc.version}.0
                  {doc.aprobado_at ? ` · Aprobado por ${doc.aprobado_nombre ?? "el dueño"} el ${fechaCorta(doc.aprobado_at)}` : " · Sin aprobar"}
                </p>
              </div>
              <Sello estado={doc.estado} />
            </div>

            {doc.estado !== "vigente" && (
              <div className="mt-3" style={{ borderTop: "1px solid var(--linea)", paddingTop: 12 }}>
                {abierto === doc.id ? (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="t-etiqueta">¿Qué cambió respecto de la versión anterior?</span>
                      <input className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="p. ej. se agregó el cierre de caja diario" />
                    </label>
                    {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
                    <div className="flex gap-2 flex-wrap">
                      <button type="button" className="boton" disabled={trabajando} onClick={() => aprobar(doc.id)} style={{ minHeight: 38, fontSize: 14 }}>
                        {trabajando ? "Aprobando" : "Confirmar aprobación"}
                      </button>
                      <button type="button" className="boton boton--secundario" onClick={() => setAbierto(null)} style={{ minHeight: 38, fontSize: 14 }}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="t-dato mb-2" style={{ color: "var(--grafito)" }}>
                      Al aprobarlo queda como la versión que manda en tu empresa, y la anterior pasa a reemplazada.
                    </p>
                    <button type="button" className="boton boton--secundario" onClick={() => { setAbierto(doc.id); setMotivo(""); }} style={{ minHeight: 38, fontSize: 14 }}>
                      Aprobar esta versión
                    </button>
                  </>
                )}
              </div>
            )}

            {g.historial.length > 0 && g.vigente && (
              <details className="mt-3">
                <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>Versiones anteriores ({g.historial.length})</summary>
                <ul className="lista-editorial mt-2">
                  {g.historial.map((h) => (
                    <li key={h.id} style={{ padding: "7px 0" }}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="t-dato">
                          Versión {h.version}.0
                          {h.motivo_cambio && <span style={{ color: "var(--grafito)" }}> — {h.motivo_cambio}</span>}
                        </span>
                        <span className="t-dato" style={{ flex: "none", color: "var(--grafito)" }}>{fechaCorta(h.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
