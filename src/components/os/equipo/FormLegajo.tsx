"use client";
import { useState } from "react";
import { useEnviar } from "./enviar";

export type Legajo = { ingreso: string | null; contrato: string | null; telefono: string | null; documento: string | null; notas: string | null };

/** EL LEGAJO de una persona: ingreso, contrato, contacto, documento y notas de RR.HH. */
export function FormLegajo({ personaId, inicial }: { personaId: string; inicial: Legajo | null }) {
  const { enviar, enviando, error } = useEnviar();
  const [l, setL] = useState({
    ingreso: inicial?.ingreso ?? "",
    contrato: inicial?.contrato ?? "",
    telefono: inicial?.telefono ?? "",
    documento: inicial?.documento ?? "",
    notas: inicial?.notas ?? "",
  });
  const [listo, setListo] = useState(false);
  const campo = (k: keyof typeof l) => ({ value: l[k], onChange: (e: { target: { value: string } }) => { setListo(false); setL({ ...l, [k]: e.target.value }); } });
  return (
    <form
      className="os-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setListo(await enviar(`/api/os/legajos/${personaId}`, "PUT", {
          ingreso: l.ingreso || null,
          contrato: l.contrato || null,
          telefono: l.telefono || null,
          documento: l.documento || null,
          notas: l.notas || null,
        }));
      }}
    >
      <label>
        <span className="t-etiqueta">Fecha de ingreso</span>
        <input className="campo" type="date" {...campo("ingreso")} />
      </label>
      <label>
        <span className="t-etiqueta">Contrato</span>
        <input className="campo" maxLength={200} placeholder="Plazo indeterminado, por obra…" {...campo("contrato")} />
      </label>
      <label>
        <span className="t-etiqueta">Teléfono</span>
        <input className="campo" type="tel" maxLength={200} {...campo("telefono")} />
      </label>
      <label>
        <span className="t-etiqueta">Documento (DNI, CE)</span>
        <input className="campo" maxLength={200} {...campo("documento")} />
      </label>
      <label style={{ gridColumn: "1 / -1" }}>
        <span className="t-etiqueta">Notas de RR.HH.</span>
        <textarea className="campo" rows={4} maxLength={4000} {...campo("notas")} />
      </label>
      <div className="os-form__acciones">
        <button className="boton boton--chico" disabled={enviando}>{enviando ? "Guardando…" : "Guardar legajo"}</button>
        {listo && <p className="os-ok" role="status">Legajo guardado.</p>}
        {error && <p className="os-error" role="alert">{error}</p>}
      </div>
    </form>
  );
}
