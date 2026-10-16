import { fechaCorta } from "@/lib/textos";
import { ESTADO_CONSULTOR, ESTADO_CLIENTE, VERBO_PASADO, VERBO_PASADO_CLIENTE, type HistorialFila, type Estado } from "@/lib/plan-reglas";

const QUIEN: Record<string, string> = { consultor: "La consultora", cliente: "La empresa", sistema: "El planificador" };

/** Los campos que un cambio de ficha deja en antes/despues, sin el estado, con nombre de persona. */
function cambios(h: HistorialFila): string[] {
  if (h.accion !== "modificar" || !h.despues) return [];
  return Object.keys(h.despues)
    .filter((k) => k !== "estado")
    .map((k) => {
      const antes = h.antes?.[k];
      const despues = h.despues?.[k];
      const ver = (v: unknown) => (v == null || v === "" ? "vacío" : Array.isArray(v) ? `${v.length} elemento(s)` : String(v).slice(0, 80));
      return `${k.replace(/_/g, " ")}: ${ver(antes)} → ${ver(despues)}`;
    });
}

/**
 * QUIÉN DECIDIÓ QUÉ, POR QUÉ Y QUÉ IMPLICA. Es la lectura de `accion_historial`. Para el dueño se muestra
 * solo lo que le atañe (comentarios, devoluciones, verificación) y con sus palabras: los verbos salen de
 * VERBO_PASADO_CLIENTE, que habla igual que sus estados («envió para revisar», «comprobó»).
 */
export function HistorialAccion({ historial, modo }: { historial: HistorialFila[]; modo: "consultor" | "cliente" }) {
  const etiquetas = modo === "cliente" ? ESTADO_CLIENTE : ESTADO_CONSULTOR;
  const verbos = modo === "cliente" ? VERBO_PASADO_CLIENTE : VERBO_PASADO;
  const filas = modo === "cliente" ? historial.filter((h) => ["comentar", "rechazar_verificacion", "verificar", "aprobar", "reportar", "bloquear", "desbloquear"].includes(h.accion)) : historial;
  if (!filas.length) return <p className="t-dato" style={{ color: "var(--grafito)" }}>{modo === "cliente" ? "Todavía no hay comentarios." : "Sin historial todavía."}</p>;
  return (
    <ol className="lista-editorial flex flex-col gap-2">
      {[...filas].reverse().map((h) => {
        const quien = h.actor_nombre ?? QUIEN[h.actor_rol ?? ""] ?? "Alguien";
        const estadoDespues = (h.despues as { estado?: Estado } | null)?.estado;
        const estadoAntes = (h.antes as { estado?: Estado } | null)?.estado;
        const cambioEstado = estadoAntes && estadoDespues && estadoAntes !== estadoDespues;
        return (
          <li key={h.id} className="t-dato" style={{ borderLeft: "2px solid var(--linea)", paddingLeft: 10 }}>
            <span style={{ color: "var(--grafito)" }}>{fechaCorta(h.created_at)} · </span>
            <strong>{quien}</strong> {verbos[h.accion] ?? h.accion}
            {cambioEstado && modo === "consultor" && <span style={{ color: "var(--grafito)" }}> ({etiquetas[estadoAntes]} → {etiquetas[estadoDespues]})</span>}
            {h.motivo && <p style={{ margin: "2px 0 0" }}>{h.accion === "comentar" ? h.motivo : <><span className="t-etiqueta">{h.accion === "verificar" ? "NOTA" : "POR QUÉ"}</span> {h.motivo}</>}</p>}
            {h.implica && <p style={{ margin: "2px 0 0" }}><span className="t-etiqueta">QUÉ IMPLICA</span> {h.implica}</p>}
            {modo === "consultor" && cambios(h).map((c) => <p key={c} style={{ margin: "2px 0 0", color: "var(--grafito)" }}>{c}</p>)}
          </li>
        );
      })}
    </ol>
  );
}
