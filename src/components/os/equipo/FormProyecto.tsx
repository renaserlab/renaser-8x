"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

type Inicial = { id: string; nombre: string; descripcion: string | null; responsable_id: string | null; fecha_entrega: string | null; cerrado_at: string | null };

/** CREAR o EDITAR un proyecto: nombre, responsable, entrega y para qué es. Su avance lo darán sus tareas. */
export function FormProyecto({ personas, inicial }: { personas: { id: string; nombre: string }[]; inicial?: Inicial }) {
  const { enviar, enviando, error } = useEnviar();
  const [p, setP] = useState({
    nombre: inicial?.nombre ?? "",
    descripcion: inicial?.descripcion ?? "",
    responsable_id: inicial?.responsable_id ?? "",
    fecha_entrega: inicial?.fecha_entrega ?? "",
  });
  const [listo, setListo] = useState(false);
  const campo = (k: keyof typeof p) => ({ value: p[k], onChange: (e: { target: { value: string } }) => { setListo(false); setP({ ...p, [k]: e.target.value }); } });
  return (
    <form
      className="os-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const cuerpo = { nombre: p.nombre, descripcion: p.descripcion || null, responsable_id: p.responsable_id || null, fecha_entrega: p.fecha_entrega || null };
        const ok = inicial ? await enviar(`/api/os/proyectos/${inicial.id}`, "PATCH", cuerpo) : await enviar("/api/os/proyectos", "POST", cuerpo);
        if (ok) {
          setListo(true);
          if (!inicial) setP({ nombre: "", descripcion: "", responsable_id: "", fecha_entrega: "" });
        }
      }}
    >
      <label>
        <span className="t-etiqueta">Proyecto</span>
        <input className="campo" required maxLength={160} placeholder="Mayoristas Q4" {...campo("nombre")} />
      </label>
      <label>
        <span className="t-etiqueta">Responsable</span>
        <select className="campo" {...campo("responsable_id")}>
          <option value="">Sin responsable</option>
          {personas.map((x) => (
            <option key={x.id} value={x.id}>{x.nombre}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="t-etiqueta">Entrega</span>
        <input className="campo" type="date" {...campo("fecha_entrega")} />
      </label>
      <label style={{ gridColumn: "1 / -1" }}>
        <span className="t-etiqueta">Para qué es</span>
        <textarea className="campo" rows={2} maxLength={2000} {...campo("descripcion")} />
      </label>
      <div className="os-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Guardando…" : inicial ? "Guardar cambios" : "Crear proyecto"}</button>
        {inicial && (
          <button type="button" className="boton-enlace" disabled={enviando} onClick={() => void enviar(`/api/os/proyectos/${inicial.id}`, "PATCH", { cerrado: !inicial.cerrado_at })}>
            {inicial.cerrado_at ? "Reabrir proyecto" : "Cerrar proyecto"}
          </button>
        )}
        {listo && !error && <p className="os-ok" role="status">Guardado.</p>}
        {error && <p className="os-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}
