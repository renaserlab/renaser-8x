"use client";
import type { DatosNodo } from "./nodos";
import { EJECUTOR, EJECUTOR_CLIENTE, VEREDICTO, TIPO_NODO } from "@/lib/textos";

/** Responsable · rol · ejecutor (pinta el nodo) · herramienta · tiempo · espera · entrada · salida · evidencia · estándar · problema · veredicto. Capítulo 15.3 y 1.13. */
export function PanelPropiedades({ datos, cambiar, eliminar, soloLectura = false, paraCliente = false, avisos = [] }: { datos: DatosNodo; cambiar: (d: Partial<DatosNodo>) => void; eliminar: () => void; soloLectura?: boolean; paraCliente?: boolean; avisos?: string[] }) {
  const campo = (k: keyof DatosNodo, etiqueta: string, placeholder = "") => (
    <label className="flex flex-col gap-1" key={String(k)}>
      <span className="t-etiqueta">{etiqueta}</span>
      <input className="campo" value={(datos[k] as string) ?? ""} placeholder={placeholder} disabled={soloLectura} onChange={(e) => cambiar({ [k]: e.target.value })} />
    </label>
  );
  const ejecutores = paraCliente ? EJECUTOR_CLIENTE : EJECUTOR;
  return (
    <aside className="panel p-4 flex flex-col gap-4" style={{ width: 300, maxHeight: "70vh", overflow: "auto" }}>
      <div className="t-etiqueta">{TIPO_NODO[datos.tipo]}</div>
      {avisos.length > 0 && (
        <ul className="t-dato flex flex-col gap-1" style={{ color: "var(--caducado)" }}>
          {avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Nombre</span>
        <input className="campo" value={datos.etiqueta} disabled={soloLectura} onChange={(e) => cambiar({ etiqueta: e.target.value })} />
      </label>
      {datos.tipo === "actividad" && (
        <>
          {campo("responsable", "Responsable (quién, no qué área)", "Asesor comercial")}
          {!paraCliente && campo("rol", "Rol / área", "ventas")}
          <label className="flex flex-col gap-1">
            <span className="t-etiqueta">Quién lo ejecuta</span>
            <select className="campo" value={datos.ejecutor ?? "humano"} disabled={soloLectura} onChange={(e) => cambiar({ ejecutor: e.target.value })}>
              {Object.entries(ejecutores).map(([v, n]) => (
                <option key={v} value={v}>{n}</option>
              ))}
            </select>
          </label>
          {campo("herramienta", "Herramienta", "WhatsApp, Excel…")}
          {campo("entrada", paraCliente ? "Qué necesita para empezar" : "Entrada", "pedido del cliente")}
          {campo("salida", paraCliente ? "Qué entrega" : "Salida", "pedido armado")}
          {!paraCliente && campo("evidencia", "Evidencia de que se hizo", "foto, registro, mensaje")}
          {!paraCliente && campo("estandar", "Estándar de calidad", "sin reclamos, en menos de 24 h")}
        </>
      )}
      {(datos.tipo === "actividad" || datos.tipo === "espera") && campo("tiempo", "Tiempo real", "2 días, 15 min…")}
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Comentario</span>
        <textarea className="campo" style={{ minHeight: 60 }} value={datos.comentario ?? ""} placeholder="lo que haya que saber de este paso" disabled={soloLectura} onChange={(e) => cambiar({ comentario: e.target.value })} />
      </label>
      {datos.tipo === "espera" && campo("espera", "A qué se espera", "aprobación del dueño")}
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">{paraCliente ? "Qué se traba aquí" : "Problema"}</span>
        <textarea className="campo" rows={2} value={datos.problema ?? ""} disabled={soloLectura} onChange={(e) => cambiar({ problema: e.target.value })} />
      </label>
      {!paraCliente && (
        <label className="flex flex-col gap-1">
          <span className="t-etiqueta">Veredicto</span>
          <select className="campo" value={datos.veredicto ?? ""} disabled={soloLectura} onChange={(e) => cambiar({ veredicto: e.target.value || null })}>
            <option value="">—</option>
            {Object.entries(VEREDICTO).map(([v, n]) => (
              <option key={v} value={v}>{n}</option>
            ))}
          </select>
        </label>
      )}
      {!soloLectura && <button className="boton boton--peligro" onClick={eliminar}>Eliminar nodo</button>}
    </aside>
  );
}
