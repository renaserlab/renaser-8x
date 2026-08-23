"use client";
import type { DatosNodo } from "./nodos";
import { EJECUTOR, VEREDICTO, TIPO_NODO } from "@/lib/textos";

/** Responsable (quién, no qué área) · Ejecutor (pinta el nodo) · Tiempo real · Herramienta · Problema · Veredicto. Capítulo 15.3. */
export function PanelPropiedades({ datos, cambiar, eliminar, soloLectura = false, paraCliente = false }: { datos: DatosNodo; cambiar: (d: Partial<DatosNodo>) => void; eliminar: () => void; soloLectura?: boolean; paraCliente?: boolean }) {
  const campo = (k: keyof DatosNodo, etiqueta: string, placeholder = "") => (
    <label className="flex flex-col gap-1">
      <span className="t-etiqueta">{etiqueta}</span>
      <input className="campo" value={(datos[k] as string) ?? ""} placeholder={placeholder} disabled={soloLectura} onChange={(e) => cambiar({ [k]: e.target.value })} />
    </label>
  );
  return (
    <aside className="panel p-4 flex flex-col gap-4" style={{ width: 300 }}>
      <div className="t-etiqueta">{TIPO_NODO[datos.tipo]}</div>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Nombre</span>
        <input className="campo" value={datos.etiqueta} disabled={soloLectura} onChange={(e) => cambiar({ etiqueta: e.target.value })} />
      </label>
      {datos.tipo === "actividad" && (
        <>
          {campo("responsable", "Responsable (quién, no qué área)", "Asesor comercial")}
          <label className="flex flex-col gap-1">
            <span className="t-etiqueta">Quién lo ejecuta</span>
            <select className="campo" value={datos.ejecutor ?? "humano"} disabled={soloLectura} onChange={(e) => cambiar({ ejecutor: e.target.value })}>
              {Object.entries(EJECUTOR).map(([v, n]) => (
                <option key={v} value={v}>{n}</option>
              ))}
            </select>
          </label>
          {campo("herramienta", "Herramienta", "WhatsApp, Excel…")}
        </>
      )}
      {(datos.tipo === "actividad" || datos.tipo === "espera") && campo("tiempo", "Tiempo real", "2 días, 15 min…")}
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
      {!soloLectura && (
        <button className="boton boton--peligro" onClick={eliminar}>Eliminar nodo</button>
      )}
    </aside>
  );
}
