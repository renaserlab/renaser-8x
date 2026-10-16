"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";

/**
 * ASIGNAR LA CARTERA DE UNA EMPRESA (consultor): quién la lleva, qué nivel y qué alcance se contrató y cuál es la
 * próxima decisión de Dirección. Guarda solo lo que cambió. Las cajas nacen con lo que ya está guardado y nada
 * más: no hay textos de ejemplo dentro. Si el servidor rechaza el cambio (por ejemplo, porque cambiar al
 * consultor exige autoridad para administrar), el motivo se muestra tal cual.
 */

export type Asignacion = {
  consultor_responsable_id: string | null;
  nivel_contratado: string | null;
  alcance_contratado: string | null;
  proxima_decision: string | null;
  proxima_decision_fecha: string | null;
};

export type Opcion = { valor: string; nombre: string };

export const ERROR_FECHA_SIN_DECISION = "Escribe la próxima decisión antes de ponerle fecha.";
export const NOTA_AUTORIDAD = "Cambiar al consultor responsable exige autoridad para administrar personas.";

const vacioANulo = (s: string | null): string | null => (s && s.trim() ? s.trim() : null);

/** Lo que cambió respecto a lo guardado, listo para enviar. Un texto en blanco es «sin valor», no una cadena vacía. */
export function cambiosDeAsignacion(guardada: Asignacion, escrita: Asignacion): Partial<Asignacion> {
  const cambios: Partial<Asignacion> = {};
  for (const campo of Object.keys(guardada) as (keyof Asignacion)[]) {
    const antes = vacioANulo(guardada[campo]);
    const ahora = vacioANulo(escrita[campo]);
    if (antes !== ahora) cambios[campo] = ahora;
  }
  return cambios;
}

/** Lo que impide guardar antes de preguntarle al servidor; null si se puede enviar. */
export function errorDeAsignacion(escrita: Asignacion): string | null {
  if (vacioANulo(escrita.proxima_decision_fecha) && !vacioANulo(escrita.proxima_decision)) return ERROR_FECHA_SIN_DECISION;
  return null;
}

/** Las opciones de un selector, con la guardada aunque ya no esté en la lista: el selector no la cambia solo. */
function conLaGuardada(opciones: readonly Opcion[], guardada: string | null, rotulo: string): Opcion[] {
  if (!guardada || opciones.some((o) => o.valor === guardada)) return [...opciones];
  return [...opciones, { valor: guardada, nombre: rotulo }];
}

export function AsignarCartera({
  companyId,
  empresa,
  guardada,
  consultores,
  niveles,
  motivoDeshabilitado,
}: {
  companyId: string;
  empresa: string;
  guardada: Asignacion;
  consultores: readonly Opcion[];
  niveles: readonly Opcion[];
  /** Por qué no se puede asignar en esta base (migración sin aplicar). Con texto, el formulario no se pinta. */
  motivoDeshabilitado?: string | null;
}) {
  const [escrita, setEscrita] = useState<Asignacion>(guardada);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (motivoDeshabilitado) {
    return <p className="t-dato" style={{ color: "var(--caducado)" }}>{motivoDeshabilitado}</p>;
  }

  const cambios = cambiosDeAsignacion(guardada, escrita);
  const hayCambios = Object.keys(cambios).length > 0;
  const poner = (campo: keyof Asignacion, valor: string) => {
    setEscrita((previa) => ({ ...previa, [campo]: valor === "" ? null : valor }));
    setError(null);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const impedimento = errorDeAsignacion(escrita);
    if (impedimento) {
      setError(impedimento);
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/cartera`, { method: "PATCH", json: cambios });
      // Recarga completa, como en el resto de la casa: la fila, la carga por consultor y el orden cambian a la vez.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar la asignación.");
      setOcupado(false);
    }
  };

  const opcionesConsultor = conLaGuardada(consultores, guardada.consultor_responsable_id, "Consultor no encontrado");
  const opcionesNivel = conLaGuardada(niveles, guardada.nivel_contratado, "Valor no reconocido");

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Consultor responsable</span>
        <select aria-label={`Consultor responsable de ${empresa}`} className="campo" value={escrita.consultor_responsable_id ?? ""} onChange={(e) => poner("consultor_responsable_id", e.target.value)}>
          <option value="">Sin asignar</option>
          {opcionesConsultor.map((o) => (
            <option key={o.valor} value={o.valor}>{o.nombre}</option>
          ))}
        </select>
        <span className="t-dato" style={{ color: "var(--grafito)" }}>{NOTA_AUTORIDAD}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Nivel contratado</span>
        <select aria-label={`Nivel contratado de ${empresa}`} className="campo" value={escrita.nivel_contratado ?? ""} onChange={(e) => poner("nivel_contratado", e.target.value)}>
          <option value="">Sin definir</option>
          {opcionesNivel.map((o) => (
            <option key={o.valor} value={o.valor}>{o.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Alcance contratado</span>
        <textarea aria-label={`Alcance contratado de ${empresa}`} className="campo" style={{ minHeight: 88 }} maxLength={2000} value={escrita.alcance_contratado ?? ""} onChange={(e) => poner("alcance_contratado", e.target.value)} />
        <span className="t-dato" style={{ color: "var(--grafito)" }}>Qué se le vendió a esta empresa, en una o dos frases.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Próxima decisión de Dirección</span>
        <input aria-label={`Próxima decisión sobre ${empresa}`} type="text" className="campo" maxLength={500} value={escrita.proxima_decision ?? ""} onChange={(e) => poner("proxima_decision", e.target.value)} />
        <span className="t-dato" style={{ color: "var(--grafito)" }}>Si la dejas en blanco, la cartera muestra la que se deduce del plan, la revisión semanal y los cortes.</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="t-etiqueta">Fecha de esa decisión</span>
        <input aria-label={`Fecha de la próxima decisión sobre ${empresa}`} type="date" className="campo" value={escrita.proxima_decision_fecha ?? ""} onChange={(e) => poner("proxima_decision_fecha", e.target.value)} />
      </label>
      {error && (
        <p className="t-dato" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>
      )}
      <div>
        <button type="submit" className="boton" disabled={ocupado || !hayCambios}>
          {ocupado ? "Guardando" : "Guardar asignación"}
        </button>
      </div>
    </form>
  );
}
