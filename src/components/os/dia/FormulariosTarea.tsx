"use client";
import { useState } from "react";

export type DatosTarea = {
  titulo: string;
  prioridad: "alta" | "media" | "baja";
  fecha_inicio: string | null;
  fecha_limite: string | null;
  proyecto_id: string | null;
  descripcion: string | null;
};

/**
 * CREAR O EDITAR UNA TAREA. Al editar, una fecha que ya estaba puesta desde un día anterior no se cambia aquí (se
 * reprograma con motivo): el campo queda bloqueado y lo dice.
 */
export function FormTarea({
  inicial,
  fijas,
  proyectos,
  hoy,
  ocupado,
  onGuardar,
  onCancelar,
}: {
  inicial?: DatosTarea;
  fijas?: { inicio: boolean; limite: boolean };
  proyectos: { id: string; nombre: string }[];
  hoy: string;
  ocupado: boolean;
  onGuardar: (d: DatosTarea) => void;
  onCancelar: () => void;
}) {
  const [d, setD] = useState<DatosTarea>(
    inicial ?? { titulo: "", prioridad: "media", fecha_inicio: hoy, fecha_limite: null, proyecto_id: null, descripcion: null }
  );
  const poner = <K extends keyof DatosTarea>(k: K, v: DatosTarea[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="os-d-formulario"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ ...d, titulo: d.titulo.trim(), descripcion: d.descripcion?.trim() || null });
      }}
    >
      <h3 className="t-seccion" style={{ margin: 0, fontSize: 16 }}>{inicial ? "Editar la tarea" : "Nueva tarea"}</h3>
      <label className="os-d-campo">
        <span className="t-etiqueta">¿Qué hay que hacer?</span>
        <input className="campo" required maxLength={300} value={d.titulo} onChange={(e) => poner("titulo", e.target.value)} placeholder="Llamar a los clientes con pedidos atrasados" />
      </label>
      <div className="os-d-campos os-d-campos--dos">
        <label className="os-d-campo">
          <span className="t-etiqueta">Prioridad</span>
          <select className="campo" value={d.prioridad} onChange={(e) => poner("prioridad", e.target.value as DatosTarea["prioridad"])}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </label>
        <label className="os-d-campo">
          <span className="t-etiqueta">Proyecto</span>
          <select className="campo" value={d.proyecto_id ?? ""} onChange={(e) => poner("proyecto_id", e.target.value || null)}>
            <option value="">Sin proyecto</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </label>
        <label className="os-d-campo">
          <span className="t-etiqueta">Día en que la trabajas</span>
          <input
            className="campo"
            type="date"
            value={d.fecha_inicio ?? ""}
            disabled={fijas?.inicio}
            onChange={(e) => poner("fecha_inicio", e.target.value || null)}
          />
        </label>
        <label className="os-d-campo">
          <span className="t-etiqueta">Fecha límite</span>
          <input
            className="campo"
            type="date"
            value={d.fecha_limite ?? ""}
            min={d.fecha_inicio ?? undefined}
            disabled={fijas?.limite}
            onChange={(e) => poner("fecha_limite", e.target.value || null)}
          />
        </label>
      </div>
      {(fijas?.inicio || fijas?.limite) && <p className="ayuda-campo" style={{ margin: 0 }}>Las fechas ya puestas se mueven con «Reprogramar», que guarda el motivo.</p>}
      <label className="os-d-campo">
        <span className="t-etiqueta">Detalle (opcional)</span>
        <textarea className="campo" rows={2} maxLength={2000} value={d.descripcion ?? ""} onChange={(e) => poner("descripcion", e.target.value)} style={{ minHeight: 72 }} />
      </label>
      <div className="os-d-fila">
        <button className="boton" disabled={ocupado}>{ocupado ? "Guardando…" : inicial ? "Guardar cambios" : "Crear tarea"}</button>
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

/** REPROGRAMAR CON MOTIVO: prórroga (la fecha límite) o aplazamiento (el día en que se trabaja). */
export function FormReprogramar({
  hoy,
  limite,
  textoLimite,
  textoInicio,
  ocupado,
  onGuardar,
  onCancelar,
}: {
  hoy: string;
  limite: string | null;
  textoLimite: string;
  textoInicio: string;
  ocupado: boolean;
  onGuardar: (d: { tipo: "prorroga" | "aplazamiento"; fecha: string; motivo: string }) => void;
  onCancelar: () => void;
}) {
  const [tipo, setTipo] = useState<"prorroga" | "aplazamiento">(limite ? "prorroga" : "aplazamiento");
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  return (
    <form
      className="os-d-formulario"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ tipo, fecha, motivo: motivo.trim() });
      }}
    >
      <h3 className="t-seccion" style={{ margin: 0, fontSize: 16 }}>Reprogramar</h3>
      <div className="os-d-fila" role="group" aria-label="Qué se mueve">
        <button type="button" className="boton boton--secundario boton--chico" aria-pressed={tipo === "prorroga"} onClick={() => setTipo("prorroga")}>
          Prórroga (fecha límite)
        </button>
        <button type="button" className="boton boton--secundario boton--chico" aria-pressed={tipo === "aplazamiento"} onClick={() => setTipo("aplazamiento")}>
          Aplazar (día de trabajo)
        </button>
      </div>
      <p className="ayuda-campo" style={{ margin: 0 }}>
        {tipo === "prorroga" ? `Vence: ${limite ? textoLimite : "sin fecha límite"}.` : `Se trabaja: ${textoInicio}.`}
      </p>
      <label className="os-d-campo">
        <span className="t-etiqueta">Nueva fecha</span>
        <input className="campo" type="date" required min={hoy} max={tipo === "aplazamiento" ? (limite ?? undefined) : undefined} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="os-d-campo">
        <span className="t-etiqueta">¿Por qué se mueve?</span>
        <input className="campo" required maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="El cliente cambió las cantidades del pedido." />
      </label>
      <div className="os-d-fila">
        <button className="boton" disabled={ocupado}>{ocupado ? "Guardando…" : "Reprogramar"}</button>
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

/** MARCAR UN BLOQUEO: la causa y de quién depende. */
export function FormBloqueo({ ocupado, onGuardar, onCancelar }: { ocupado: boolean; onGuardar: (d: { causa: string; depende_de: string | null }) => void; onCancelar: () => void }) {
  const [causa, setCausa] = useState("");
  const [depende, setDepende] = useState("");
  return (
    <form
      className="os-d-formulario"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ causa: causa.trim(), depende_de: depende.trim() || null });
      }}
    >
      <h3 className="t-seccion" style={{ margin: 0, fontSize: 16 }}>Marcar bloqueo</h3>
      <label className="os-d-campo">
        <span className="t-etiqueta">¿Qué te frena?</span>
        <input className="campo" required maxLength={500} value={causa} onChange={(e) => setCausa(e.target.value)} placeholder="Falta el reporte de movimientos del banco." />
      </label>
      <label className="os-d-campo">
        <span className="t-etiqueta">¿De quién depende? (opcional)</span>
        <input className="campo" maxLength={200} value={depende} onChange={(e) => setDepende(e.target.value)} placeholder="Luis Huamán · Contabilidad" />
      </label>
      <p className="ayuda-campo" style={{ margin: 0 }}>Si sigue bloqueada en 30 minutos, se avisa a la gestión.</p>
      <div className="os-d-fila">
        <button className="boton" disabled={ocupado}>{ocupado ? "Guardando…" : "Marcar bloqueo"}</button>
        <button type="button" className="boton boton--secundario" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
