"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

export type DatosPersona = {
  id?: string;
  nombre: string;
  email: string | null;
  puesto: string | null;
  area: string | null;
  rol: string;
  capacidad_min: number;
  activo?: boolean;
};

const ROLES: [string, string][] = [
  ["persona", "Colaborador"],
  ["operaciones", "Operaciones"],
  ["talento", "RR.HH."],
  ["gerente", "Gerente"],
  ["dueno", "Dueño"],
];

/**
 * ALTA O EDICIÓN DE UNA PERSONA DEL EQUIPO. El correo es con el que la persona creará su cuenta en /registro: con él
 * queda enlazada sola. La capacidad se pide en horas por día. El rol de dueño solo aparece para quien es dueño.
 */
export function FormPersona({ inicial, puedeDueno, alGuardar }: { inicial?: DatosPersona; puedeDueno: boolean; alGuardar?: () => void }) {
  const { enviar, enviando, error } = useEnviar();
  const [d, setD] = useState({
    nombre: inicial?.nombre ?? "",
    email: inicial?.email ?? "",
    puesto: inicial?.puesto ?? "",
    area: inicial?.area ?? "",
    rol: inicial?.rol ?? "persona",
    horas: String((inicial?.capacidad_min ?? 480) / 60),
  });
  const [listo, setListo] = useState(false);
  const roles = ROLES.filter(([k]) => k !== "dueno" || puedeDueno || inicial?.rol === "dueno");
  const campo = (k: keyof typeof d) => ({ value: d[k], onChange: (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value }) });
  return (
    <form
      className="os-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const cuerpo = { nombre: d.nombre, email: d.email.trim() || null, puesto: d.puesto || null, area: d.area || null, rol: d.rol, capacidad_horas: Number(d.horas) || 0 };
        const ok = inicial?.id ? await enviar(`/api/os/personas/${inicial.id}`, "PATCH", cuerpo) : await enviar("/api/os/personas", "POST", cuerpo);
        if (ok) {
          setListo(true);
          if (!inicial?.id) setD({ nombre: "", email: "", puesto: "", area: "", rol: "persona", horas: "8" });
          alGuardar?.();
        }
      }}
    >
      <label>
        <span className="t-etiqueta">Nombre</span>
        <input className="campo" required maxLength={120} {...campo("nombre")} />
      </label>
      <label>
        <span className="t-etiqueta">Correo</span>
        <input className="campo" type="email" maxLength={200} placeholder="nombre@gmail.com" {...campo("email")} />
      </label>
      <label>
        <span className="t-etiqueta">Puesto</span>
        <input className="campo" maxLength={120} placeholder="Ventas, almacén…" {...campo("puesto")} />
      </label>
      <label>
        <span className="t-etiqueta">Área</span>
        <input className="campo" maxLength={120} {...campo("area")} />
      </label>
      <label>
        <span className="t-etiqueta">Rol en el equipo</span>
        <select className="campo" {...campo("rol")} disabled={inicial?.rol === "dueno" && !puedeDueno}>
          {roles.map(([k, n]) => (
            <option key={k} value={k}>{n}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="t-etiqueta">Horas de trabajo por día</span>
        <input className="campo" type="number" min={0} max={24} step={0.5} {...campo("horas")} />
      </label>
      <div className="os-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Guardando…" : inicial?.id ? "Guardar cambios" : "Agregar al equipo"}</button>
        {listo && !error && <p className="os-ok" role="status">{inicial?.id ? "Guardado." : "Listo. Dile que cree su cuenta en 8X con ese correo."}</p>}
        {error && <p className="os-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}

/** Desactivar (deja de entrar y de contar en el equipo; su historia queda) o reactivar. */
export function ActivarPersona({ id, nombre, activo }: { id: string; nombre: string; activo: boolean }) {
  const { enviar, enviando, error } = useEnviar();
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        className={activo ? "boton-enlace boton-enlace--peligro" : "boton-enlace"}
        disabled={enviando}
        onClick={() => {
          if (activo && !window.confirm(`¿Desactivar a ${nombre}? Dejará de entrar a 8X; su historia se queda.`)) return;
          void enviar(`/api/os/personas/${id}`, "PATCH", { activo: !activo });
        }}
      >
        {activo ? "Desactivar" : "Reactivar"}
      </button>
      {error && <span className="os-error" role="alert">{error}</span>}
    </span>
  );
}
