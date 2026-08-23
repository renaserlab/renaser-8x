"use client";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

export type DatosNodo = {
  etiqueta: string;
  tipo: "inicio" | "actividad" | "decision" | "espera" | "fin";
  responsable?: string | null;
  ejecutor?: string | null;
  tiempo?: string | null;
  herramienta?: string | null;
  problema?: string | null;
  veredicto?: string | null;
  soloLectura?: boolean;
};
export type NodoRF = Node<DatosNodo, "inicio" | "actividad" | "decision" | "espera" | "fin">;

const COLOR_EJ: Record<string, string> = { humano: "var(--ej-humano)", software: "var(--ej-software)", ia: "var(--ej-ia)", hibrido: "var(--ej-hibrido)" };

function estiloVeredicto(v?: string | null): React.CSSProperties {
  if (v === "remove") return { textDecoration: "line-through", opacity: 0.55 };
  if (v === "create") return { outline: "2px solid var(--confirmado)", outlineOffset: 3 };
  if (v === "replace") return { borderStyle: "dashed" };
  return {};
}

const manijas = (
  <>
    <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: "var(--grafito)", border: "2px solid var(--papel)" }} />
    <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: "var(--tinta)", border: "2px solid var(--papel)" }} />
  </>
);

/** Círculo: qué dispara el proceso. */
export function NodoInicio({ data, selected }: NodeProps<NodoRF>) {
  return (
    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--tinta)", color: "var(--papel)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 500, textAlign: "center", padding: 4, boxShadow: selected ? "0 0 0 3px var(--marca)" : undefined, ...estiloVeredicto(data.veredicto) }} title={data.etiqueta}>
      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: "var(--tinta)", border: "2px solid var(--papel)" }} />
      <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{data.etiqueta}</span>
    </div>
  );
}

/** Rectángulo: alguien hace algo. El color del borde izquierdo es el ejecutor. */
export function NodoActividad({ data, selected }: NodeProps<NodoRF>) {
  const c = COLOR_EJ[data.ejecutor ?? "humano"] ?? COLOR_EJ.humano;
  return (
    <div style={{ width: 220, minHeight: 80, background: "#fff", border: `1px solid ${selected ? "var(--marca)" : "var(--linea)"}`, borderLeft: `6px solid ${c}`, borderRadius: "var(--radio)", padding: "10px 12px", boxShadow: selected ? "0 0 0 2px var(--marca)" : undefined, ...estiloVeredicto(data.veredicto) }}>
      {manijas}
      <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{data.etiqueta}</div>
      {(data.responsable || data.tiempo) && (
        <div style={{ fontSize: 12, color: "var(--grafito)", marginTop: 4 }}>
          {data.responsable}{data.responsable && data.tiempo ? " · " : ""}{data.tiempo}
        </div>
      )}
      {data.problema && <div style={{ fontSize: 12, color: "var(--contradicho)", marginTop: 4 }}>⚠ {data.problema}</div>}
    </div>
  );
}

/** Rombo: se bifurca el camino. */
export function NodoDecision({ data, selected }: NodeProps<NodoRF>) {
  return (
    <div style={{ width: 160, height: 96, position: "relative", ...estiloVeredicto(data.veredicto) }}>
      <svg width="160" height="96" viewBox="0 0 160 96" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <polygon points="80,2 158,48 80,94 2,48" fill="#fff" stroke={selected ? "var(--marca)" : "var(--tinta)"} strokeWidth={selected ? 2.5 : 1.5} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "0 28px", textAlign: "center", fontSize: 13, fontWeight: 500, lineHeight: 1.25 }}>{data.etiqueta}</div>
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: "var(--grafito)", border: "2px solid var(--papel)" }} />
      <Handle type="source" position={Position.Right} id="si" style={{ width: 10, height: 10, background: "var(--tinta)", border: "2px solid var(--papel)" }} />
      <Handle type="source" position={Position.Bottom} id="no" style={{ width: 10, height: 10, background: "var(--tinta)", border: "2px solid var(--papel)" }} />
    </div>
  );
}

/** Rectángulo punteado: el proceso se detiene esperando algo. */
export function NodoEspera({ data, selected }: NodeProps<NodoRF>) {
  return (
    <div style={{ width: 200, minHeight: 72, background: "var(--suave)", border: `1.5px dashed ${selected ? "var(--marca)" : "var(--grafito)"}`, borderRadius: "var(--radio)", padding: "10px 12px", ...estiloVeredicto(data.veredicto) }}>
      {manijas}
      <div style={{ fontSize: 14, fontWeight: 500 }}>{data.etiqueta}</div>
      {data.tiempo && <div style={{ fontSize: 12, color: "var(--grafito)", marginTop: 4 }}>espera {data.tiempo}</div>}
    </div>
  );
}

/** Círculo doble: dónde termina, incluidos los finales malos. */
export function NodoFin({ data, selected }: NodeProps<NodoRF>) {
  const malo = /perd|pierd|se va|abandon|cancel|rechaz|no compra|fall/i.test(data.etiqueta);
  const c = malo ? "var(--contradicho)" : "var(--tinta)";
  return (
    <div style={{ width: 64, height: 64, borderRadius: "50%", border: `2px solid ${c}`, display: "grid", placeItems: "center", padding: 3, boxShadow: selected ? "0 0 0 3px var(--marca)" : undefined, ...estiloVeredicto(data.veredicto) }} title={data.etiqueta}>
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: "var(--grafito)", border: "2px solid var(--papel)" }} />
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: c, color: "var(--papel)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 500, textAlign: "center", padding: 4 }}>
        <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{data.etiqueta}</span>
      </div>
    </div>
  );
}

export const TIPOS_NODO = { inicio: NodoInicio, actividad: NodoActividad, decision: NodoDecision, espera: NodoEspera, fin: NodoFin };

export function LeyendaEjecutor() {
  return (
    <div className="flex flex-wrap gap-4">
      {Object.entries({ humano: "Persona", software: "Software", ia: "Agente de IA", hibrido: "IA prepara, persona aprueba" }).map(([k, n]) => (
        <span key={k} className="t-dato flex items-center gap-2">
          <span style={{ width: 14, height: 14, background: COLOR_EJ[k], borderRadius: 2, display: "inline-block" }} aria-hidden="true" />
          {n}
        </span>
      ))}
    </div>
  );
}
