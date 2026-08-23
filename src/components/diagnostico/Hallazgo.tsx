"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { MarcaEstado } from "@/components/base/MarcaEstado";
import { VerFuente } from "@/components/realidad/VerFuente";
import { MOTIVO_CORRECCION, VEREDICTO, PILAR, fechaCorta } from "@/lib/textos";

export type Evid = { claim_id: string; relacion: string; claims: { id: string; texto: string; estado?: string; fecha_afirmacion: string | null; source_id?: string; fragment_id?: string | null; sources: { nombre: string; tipo: string; fecha_origen: string | null } | null; participants: { nombre: string; rol: string | null; puesto: string | null } | null } };
export type HallazgoRow = { id: string; pilar: string; patron: string | null; titulo: string; causa_raiz: string | null; impacto: string | null; veredicto: string | null; recomendacion: string | null; filtros: (Record<string, { resultado: string; nota: string; respuestas?: string[] }> & { bloqueada?: boolean; tension?: string | null; preserva?: boolean; dimension?: string | null; fuerza_maxima?: string; fuentes_independientes?: number }) | null; auditoria: { sustentado: boolean; es_sintoma: boolean; observacion: string; culpa_persona_sin_auditar?: boolean; benchmark_como_hecho?: boolean } | null; origen: string; estado_revision: string; requiere_validacion?: boolean | null; motivo_validacion?: string | null; finding_evidence: Evid[] };

const COLOR_IMPACTO: Record<string, string> = { alto: "var(--contradicho)", medio: "var(--caducado)", bajo: "var(--grafito)" };
const FUERZA: Record<string, string> = { strong: "fuente fuerte", medium: "fuente media", weak: "fuente débil" };

function fuenteDe(c: Evid["claims"]) {
  if (c.participants) return `${c.participants.rol === "dueno" ? "el dueño" : c.participants.rol === "socio" ? "un socio" : c.participants.puesto ?? c.participants.rol} (entrevista)`;
  if (c.sources) return `${c.sources.nombre} (${c.sources.tipo})`;
  return "fuente";
}

/** Anatomía: hallazgo · evidencia · causa raíz · impacto · veredicto · recomendación. Revisión: aprobar / corregir / rechazar con motivo. */
export function Hallazgo({ h, modo }: { h: HallazgoRow; modo: "consultor" | "cliente" }) {
  const router = useRouter();
  const [abrir, setAbrir] = useState<{ s: string; f: string | null } | null>(null);
  const [modoCorregir, setModoCorregir] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [comentario, setComentario] = useState("");
  const [cambios, setCambios] = useState({ titulo: h.titulo, causa_raiz: h.causa_raiz ?? "", recomendacion: h.recomendacion ?? "", impacto: h.impacto ?? "medio" });
  const [error, setError] = useState<string | null>(null);

  const revisar = async (accion: "aprobado" | "corregido" | "rechazado", opts?: { levantar_validacion?: boolean }) => {
    setError(null);
    try {
      await pedir(`/api/findings/${h.id}/review`, { json: { accion, motivo: motivo || undefined, comentario: comentario || undefined, cambios: accion === "corregido" ? cambios : undefined, levantar_validacion: opts?.levantar_validacion } });
      setModoCorregir(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    }
  };

  const sustenta = h.finding_evidence.filter((e) => e.relacion === "sustenta");
  const contradice = h.finding_evidence.filter((e) => e.relacion === "contradice");
  const esCliente = modo === "cliente";
  const preserva = !!h.filtros?.preserva;
  const necesitaValidacion = !!h.requiere_validacion;

  return (
    <article className="panel p-5 aparece" style={{ borderLeft: `4px solid ${preserva ? "var(--confirmado)" : COLOR_IMPACTO[h.impacto ?? "bajo"]}` }}>
      <div className="flex flex-wrap items-baseline gap-3 mb-2">
        {preserva ? <span className="t-etiqueta" style={{ color: "var(--confirmado)" }}>fortaleza · se conserva</span> : <span className="t-etiqueta" style={{ color: COLOR_IMPACTO[h.impacto ?? "bajo"] }}>impacto {h.impacto}</span>}
        {!esCliente && <span className="t-etiqueta">{PILAR[h.pilar]}{h.filtros?.dimension ? ` · ${h.filtros.dimension}` : ""}</span>}
        {!esCliente && h.patron && <span className="t-etiqueta">{h.patron.replace(/_/g, " ")}</span>}
        {!esCliente && <span className="t-etiqueta" style={{ color: h.estado_revision === "aprobado" || h.estado_revision === "corregido" ? "var(--confirmado)" : h.estado_revision === "rechazado" ? "var(--contradicho)" : "var(--caducado)" }}>{h.estado_revision}</span>}
        {!esCliente && necesitaValidacion && <span className="t-etiqueta" style={{ color: "var(--contradicho)" }}>necesita validación</span>}
        {!esCliente && h.filtros?.fuerza_maxima && <span className="t-etiqueta">{FUERZA[h.filtros.fuerza_maxima] ?? h.filtros.fuerza_maxima} · {h.filtros.fuentes_independientes ?? 0} fuente(s)</span>}
        {!esCliente && h.origen === "consultor" && <span className="t-etiqueta">creado por el consultor</span>}
      </div>
      {!esCliente && necesitaValidacion && h.motivo_validacion && <p className="t-dato mb-2" style={{ color: "var(--contradicho)" }}>{h.motivo_validacion}. No llega al cliente hasta que se valide con otra fuente o se baje el impacto.</p>}

      {modoCorregir ? (
        <div className="flex flex-col gap-3">
          <input className="campo" value={cambios.titulo} onChange={(e) => setCambios({ ...cambios, titulo: e.target.value })} aria-label="Título" />
          <textarea className="campo" rows={2} value={cambios.causa_raiz} onChange={(e) => setCambios({ ...cambios, causa_raiz: e.target.value })} aria-label="Causa raíz" />
          <textarea className="campo" rows={2} value={cambios.recomendacion} onChange={(e) => setCambios({ ...cambios, recomendacion: e.target.value })} aria-label="Recomendación" />
          <select className="campo" style={{ width: "auto" }} value={cambios.impacto} onChange={(e) => setCambios({ ...cambios, impacto: e.target.value })} aria-label="Impacto">
            <option value="alto">alto</option><option value="medio">medio</option><option value="bajo">bajo</option>
          </select>
        </div>
      ) : (
        <>
          <h3 className="t-seccion">{h.titulo}</h3>
          {h.causa_raiz && <p className="t-cuerpo mt-2"><span className="t-etiqueta">{esCliente ? "Por qué pasa" : "Causa raíz"}</span><br />{h.causa_raiz}</p>}
          {h.recomendacion ? (
            <p className="t-cuerpo mt-2"><span className="t-etiqueta">{esCliente ? "Qué hacer" : "Recomendación"}{h.veredicto ? ` · ${VEREDICTO[h.veredicto]}` : ""}</span><br />{h.recomendacion}</p>
          ) : h.filtros?.bloqueada ? (
            <p className="t-cuerpo mt-2" style={{ color: "var(--caducado)" }}><span className="t-etiqueta">{esCliente ? "Una tensión que hay que decidir" : "Tensión (recomendación bloqueada por un filtro)"}</span><br />{h.filtros.tension}</p>
          ) : null}
        </>
      )}

      <div className="mt-4">
        <p className="t-etiqueta mb-2">{esCliente ? "En qué nos basamos" : "Evidencia"} ({sustenta.length})</p>
        <ul className="flex flex-col gap-2">
          {sustenta.map((e) => (
            <li key={e.claim_id} className="flex flex-wrap items-baseline gap-2">
              {!esCliente && e.claims.estado && <MarcaEstado estado={e.claims.estado} />}
              <button className="text-left t-cuerpo" style={{ font: "inherit" }} onClick={() => e.claims.source_id && setAbrir({ s: e.claims.source_id, f: e.claims.fragment_id ?? null })}>
                “{e.claims.texto}”
              </button>
              <span className="t-dato" style={{ color: "var(--grafito)" }}>— {fuenteDe(e.claims)}, {fechaCorta(e.claims.fecha_afirmacion)}</span>
            </li>
          ))}
        </ul>
        {contradice.length > 0 && (
          <>
            <p className="t-etiqueta mt-3 mb-2" style={{ color: "var(--contradicho)" }}>{esCliente ? "Lo que dice lo contrario" : "Evidencia contraria"} ({contradice.length})</p>
            <ul className="flex flex-col gap-2">
              {contradice.map((e) => (
                <li key={e.claim_id} className="t-cuerpo">“{e.claims.texto}” <span className="t-dato" style={{ color: "var(--grafito)" }}>— {fuenteDe(e.claims)}</span></li>
              ))}
            </ul>
          </>
        )}
      </div>

      {!esCliente && h.filtros && (
        <div className="mt-4 flex flex-col gap-1">
          {(["proposito", "sabiduria", "excelencia"] as const).map((f) => {
            const v = h.filtros?.[f] as { resultado: string; nota: string; respuestas?: string[] } | undefined;
            if (!v) return null;
            return (
              <div key={f} className="t-dato" style={{ color: v.resultado === "pasa" ? "var(--confirmado)" : "var(--contradicho)" }}>
                {f}: {v.resultado === "pasa" ? "pasa" : "no pasa"} — <span style={{ color: "var(--grafito)" }}>{v.nota}</span>
                {v.respuestas?.length ? <span style={{ color: "var(--grafito)" }}> · {v.respuestas.join(" · ")}</span> : null}
              </div>
            );
          })}
        </div>
      )}
      {!esCliente && h.auditoria && (
        <p className="t-dato mt-3" style={{ color: h.auditoria.sustentado ? "var(--grafito)" : "var(--contradicho)" }}>
          Auditor: {h.auditoria.sustentado ? "sustentado" : "NO sustentado"}{h.auditoria.es_sintoma ? " · es síntoma, no causa" : ""}{h.auditoria.culpa_persona_sin_auditar ? " · culpa a una persona sin auditar" : ""}{h.auditoria.benchmark_como_hecho ? " · usa un benchmark como hecho" : ""} — {h.auditoria.observacion}
        </p>
      )}

      {!esCliente && (
        <div className="mt-5 flex flex-col gap-3 no-imprimir">
          <div className="flex flex-wrap gap-3 items-center">
            <select className="campo" style={{ width: "auto" }} value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo">
              <option value="">Motivo (obligatorio para corregir o rechazar)</option>
              {Object.entries(MOTIVO_CORRECCION).map(([v, n]) => (
                <option key={v} value={v}>{n}</option>
              ))}
            </select>
            <input className="campo" style={{ flex: 1, minWidth: 200 }} placeholder="Comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} aria-label="Comentario" />
          </div>
          {error && <p className="t-dato" style={{ color: "var(--contradicho)" }}>{error}</p>}
          <div className="flex flex-wrap gap-2">
            {modoCorregir ? (
              <>
                <button className="boton" onClick={() => revisar("corregido")} disabled={!motivo}>Guardar corrección</button>
                <button className="boton boton--secundario" onClick={() => setModoCorregir(false)}>Cancelar</button>
              </>
            ) : (
              <>
                {necesitaValidacion ? (
                  <button className="boton" onClick={() => revisar("aprobado", { levantar_validacion: true })} disabled={!comentario.trim()} title="Escribe en el comentario qué evidencia adicional lo sostiene">Validar y aprobar</button>
                ) : (
                  <button className="boton" onClick={() => revisar("aprobado")}>Aprobar</button>
                )}
                <button className="boton boton--secundario" onClick={() => setModoCorregir(true)}>Corregir</button>
                <button className="boton boton--peligro" onClick={() => revisar("rechazado")} disabled={!motivo}>Rechazar</button>
              </>
            )}
          </div>
          {necesitaValidacion && !modoCorregir && <p className="t-dato" style={{ color: "var(--grafito)" }}>Para validar, escribe en el comentario qué otra fuente lo sostiene. Sin eso, el botón queda apagado.</p>}
        </div>
      )}
      {abrir && <VerFuente sourceId={abrir.s} fragmentId={abrir.f} cerrar={() => setAbrir(null)} />}
    </article>
  );
}
