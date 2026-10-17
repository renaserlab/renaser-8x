"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { PANTALLA } from "@/lib/estrategia/textos";
import { ErrorDeAccion, useAccion } from "./Acciones";

/**
 * ELEGIR UN CAMINO Y APROBAR LA ESTRATEGIA (spec-estrategia-8x.md §8.1, punto 3).
 *
 *  - «Elegir este camino», con el motivo si se quiere decir (queda en el rastro y en la versión).
 *  - «Aprobar la estrategia»: la ruta exige el rol de consultora Y la autoridad de aprobar planes (el dueño también la
 *    tiene por defecto; sola, le dejaría aprobar su propia estrategia). La página del dueño está a la vista justo
 *    encima del botón, tal como la verá: lo que no se aprueba, él no lo ve. Aprobar pide confirmar: desde ese momento
 *    el cliente la ve en su página «Plan».
 */

const ruta = (companyId: string, eid: string) => `/api/companies/${companyId}/estrategia/${eid}`;

export function ElegirCamino({ companyId, eid, letra, nombre, principal }: { companyId: string; eid: string; letra: "a" | "b"; nombre: string; principal: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { trabajando, error, correr } = useAccion();
  const elegir = () => void correr(() => pedir(ruta(companyId, eid), { method: "PATCH", json: { elegir: { camino: letra, motivo: motivo.trim() || null } } }));

  if (!abierto) {
    return (
      <button type="button" className={`boton${principal ? "" : " boton--secundario"} elegir-camino`} onClick={() => setAbierto(true)}>
        {PANTALLA.elegir_camino}
      </button>
    );
  }
  return (
    <div className="elegir-camino__form">
      <label className="t-etiqueta" htmlFor={`motivo-${letra}`}>
        {PANTALLA.motivo_eleccion}
      </label>
      <textarea id={`motivo-${letra}`} className="campo" rows={2} maxLength={600} aria-label={PANTALLA.motivo_eleccion} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} disabled={trabajando} />
      <span className="elegir-camino__botones">
        <button type="button" className="boton" disabled={trabajando} onClick={elegir}>
          {trabajando ? PANTALLA.guardando : PANTALLA.elegir(nombre)}
        </button>
        <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={() => setAbierto(false)}>
          {PANTALLA.cancelar}
        </button>
      </span>
      <ErrorDeAccion error={error} />
    </div>
  );
}

export function AprobarEstrategia({ companyId, eid }: { companyId: string; eid: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const { trabajando, error, correr, router } = useAccion();
  const aprobar = () =>
    void correr(
      () => pedir<{ aviso: string | null }>(`${ruta(companyId, eid)}/aprobar`, { method: "POST", json: {} }),
      (r) => {
        setAviso(r.aviso ?? null);
        setConfirmar(false);
        router.refresh();
      }
    );

  if (!confirmar) {
    return (
      <span className="accion-con-nota">
        <button type="button" className="boton aprobar" onClick={() => setConfirmar(true)}>
          {PANTALLA.aprobar}
        </button>
        {aviso && <small className="nota-accion" role="status">{aviso}</small>}
      </span>
    );
  }
  return (
    <span className="aprobar__confirmar" role="group" aria-label={PANTALLA.confirmar_aprobacion}>
      <span className="t-dato">{PANTALLA.aprobar_confirmar}</span>
      <span className="elegir-camino__botones">
        <button type="button" className="boton" disabled={trabajando} onClick={aprobar}>
          {trabajando ? PANTALLA.aprobando : PANTALLA.aprobar_si}
        </button>
        <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={() => setConfirmar(false)}>
          {PANTALLA.atras}
        </button>
      </span>
      <ErrorDeAccion error={error} />
    </span>
  );
}
