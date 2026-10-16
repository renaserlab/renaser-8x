import { ESTADO_CONSULTOR, esEstado, etiquetaDeCampo, momentoCorto, type FilaHistorialLeida } from "@/lib/iniciativas";

const estado = (e: string | null) => (e && esEstado(e) ? ESTADO_CONSULTOR[e] : e ?? "");

function ver(v: unknown): string {
  if (v == null || v === "") return "vacío";
  if (Array.isArray(v)) return `${v.length} elemento(s)`;
  return String(v).slice(0, 90);
}

/** Qué pasó en esta fila, en una frase: se propuso, cambió de estado, o se tocó la ficha sin cambiar de estado. */
function quePaso(h: FilaHistorialLeida): string {
  if (h.de_estado == null) return "propuso la iniciativa";
  if (h.de_estado !== h.a_estado) return `la pasó de «${estado(h.de_estado)}» a «${estado(h.a_estado)}»`;
  return h.evidencia && "fuente_aportada" in h.evidencia ? "registró una fuente aportada" : "cambió la ficha";
}

/**
 * QUIÉN DECIDIÓ QUÉ, POR QUÉ Y CON QUÉ EVIDENCIA. Es la lectura de `iniciativa_historial`, lo más
 * reciente arriba. De una decisión se muestra qué se observó y qué decían los criterios en ese momento; si
 * se decidió distinto de lo que decía el criterio, o sin dato, se dice con esas palabras.
 */
export function HistorialIniciativa({ historial, zona }: { historial: FilaHistorialLeida[]; zona: string }) {
  if (!historial.length) return <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin historial todavía.</p>;
  return (
    <ol className="flex flex-col gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {[...historial].reverse().map((h) => {
        const e: Record<string, unknown> = h.evidencia ?? {};
        const observado = typeof e.que_se_observo === "string" ? e.que_se_observo : null;
        const evaluacion = typeof e.evaluacion === "string" ? e.evaluacion : null;
        const cambios = (e.cambios ?? null) as Record<string, { antes?: unknown; despues?: unknown }> | null;
        const fuente = (e.fuente_aportada ?? null) as { nombre?: string; quien_la_aporto?: string; fecha?: string; que_dice?: string } | null;
        const ajenos = Array.isArray(e.no_la_impide) ? (e.no_la_impide as unknown[]).length : 0;
        const esDecision = observado !== null;
        const mismoEstado = h.de_estado === h.a_estado;
        return (
          <li key={h.id} className="t-dato" style={{ borderLeft: "2px solid var(--linea)", paddingLeft: 10 }}>
            <span style={{ color: "var(--grafito)" }}>{momentoCorto(h.created_at, zona)} · </span>
            <strong>{h.actor_nombre ?? "La consultora"}</strong> {quePaso(h)}
            {h.motivo && !(mismoEstado && fuente) && h.de_estado != null && (
              <p style={{ margin: "2px 0 0" }}><span className="t-etiqueta">POR QUÉ</span> {h.motivo}</p>
            )}
            {esDecision && <p style={{ margin: "2px 0 0" }}><span className="t-etiqueta">QUÉ SE OBSERVÓ</span> {observado}</p>}
            {esDecision && evaluacion && (
              <p style={{ margin: "2px 0 0", color: "var(--grafito)" }}><span className="t-etiqueta">LOS CRITERIOS</span> {evaluacion}</p>
            )}
            {esDecision && e.coincide_con_el_criterio === false && (
              <p style={{ margin: "2px 0 0", color: "var(--caducado)" }}>Se decidió distinto de lo que decía el criterio.</p>
            )}
            {esDecision && e.valor_indicador == null && (
              <p style={{ margin: "2px 0 0", color: "var(--caducado)" }}>Se decidió sin dato del indicador, con lo observado.</p>
            )}
            {fuente && (
              <p style={{ margin: "2px 0 0" }}>
                {fuente.nombre} · {fuente.quien_la_aporto} · {fuente.fecha}: <span style={{ color: "var(--grafito)" }}>{fuente.que_dice}</span>
              </p>
            )}
            {cambios && Object.entries(cambios).map(([k, v]) => (
              <p key={k} style={{ margin: "2px 0 0", color: "var(--grafito)" }}>{etiquetaDeCampo(k)}: {ver(v?.antes)} → {ver(v?.despues)}</p>
            ))}
            {ajenos > 0 && (
              <p style={{ margin: "2px 0 0", color: "var(--grafito)" }}>
                Al aprobar, al levantamiento le {ajenos === 1 ? "faltaba 1 cosa ajena" : `faltaban ${ajenos} cosas ajenas`} a esta iniciativa: no la {ajenos === 1 ? "impidió" : "impidieron"}.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
