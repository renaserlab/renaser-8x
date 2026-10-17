"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import { Icono } from "@/components/base/Icono";
import { PANTALLA } from "@/lib/estrategia/textos";
import { ErrorDeAccion, useAccion } from "./Acciones";

/**
 * CORREGIR UNA CIFRA POR CONFIRMAR (spec-estrategia-8x.md §8.1, punto 4): el rango de un supuesto de cambio —cuánto se
 * mueve algo con una jugada— en dos cajas, desde y hasta. Al guardar, 8X rehace los números de los dos caminos. Un
 * rango fuera de su límite, al revés o de una clave que no es de cambio no se guarda: la ruta dice por qué.
 */

type Props = {
  companyId: string;
  eid: string;
  /** El supuesto (viaja solo hasta la ruta; en pantalla nunca se ve). */
  id: string;
  /** El rango de hoy, ya escrito («entre 4 y 7 de cada 10»). */
  texto: string;
  bajo: number;
  alto: number;
  /** En qué se mide, en palabras («de cada 10», «%», «días»). */
  unidad: string;
  /** Entre qué valores puede ir, si se sabe. */
  limites: [number, number] | null;
  editable: boolean;
  /** Lo que se supone, para el nombre de las cajas. */
  que: string;
};

const numero = (t: string): number | null => {
  const n = Number(t.replace(",", ".").trim());
  return t.trim() && Number.isFinite(n) ? n : null;
};

export function EditarSupuesto({ companyId, eid, id, texto, bajo, alto, unidad, limites, editable, que }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(String(bajo));
  const [hasta, setHasta] = useState(String(alto));
  const { trabajando, error, setError, correr } = useAccion();

  const guardar = async () => {
    const b = numero(desde);
    const a = numero(hasta);
    if (b == null || a == null) return setError(PANTALLA.supuesto_dos);
    if (b > a) return setError(PANTALLA.supuesto_orden);
    if (b === bajo && a === alto) return setAbierto(false);
    const r = await correr(() => pedir(`/api/companies/${companyId}/estrategia/${eid}`, { method: "PATCH", json: { supuesto: { id, bajo: b, alto: a } } }));
    if (r) setAbierto(false);
  };

  if (!abierto) {
    return (
      <span className="supuesto-rango">
        <b>{texto}</b>
        {editable && (
          <button type="button" className="lapiz no-imprimir" aria-label={`${PANTALLA.corregir_rango}: ${que}`} title={PANTALLA.corregir_rango} onClick={() => setAbierto(true)}>
            <Icono nombre="lapiz" />
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="supuesto-editar">
      <span className="supuesto-editar__cajas">
        <input className="campo" inputMode="decimal" aria-label={`${PANTALLA.supuesto_desde} (${unidad}): ${que}`} value={desde} onChange={(ev) => setDesde(ev.target.value)} disabled={trabajando} />
        <span aria-hidden="true">{PANTALLA.supuesto_a}</span>
        <input className="campo" inputMode="decimal" aria-label={`${PANTALLA.supuesto_hasta} (${unidad}): ${que}`} value={hasta} onChange={(ev) => setHasta(ev.target.value)} disabled={trabajando} />
        <span className="t-dato">{unidad}</span>
      </span>
      {limites && <small className="nota-accion">{PANTALLA.supuesto_puede(limites[0], limites[1])}</small>}
      <span className="supuesto-editar__botones">
        <button type="button" className="boton boton--chico" disabled={trabajando} onClick={() => void guardar()}>
          {trabajando ? PANTALLA.rehaciendo : PANTALLA.guardar}
        </button>
        <button
          type="button"
          className="boton boton--secundario boton--chico"
          disabled={trabajando}
          onClick={() => {
            setDesde(String(bajo));
            setHasta(String(alto));
            setError(null);
            setAbierto(false);
          }}
        >
          {PANTALLA.cancelar}
        </button>
      </span>
      <ErrorDeAccion error={error} />
    </span>
  );
}
