"use client";
import { useRef, useState, type ReactNode } from "react";
import { pedir } from "@/lib/cliente";
import type { Trozo } from "@/lib/estrategia/texto";
import { deEditable, traeCifras, type Marca } from "@/lib/estrategia/marcas";
import { Icono } from "@/components/base/Icono";
import { PANTALLA } from "@/lib/estrategia/textos";
import { Frase, idHtml } from "./Frase";
import { ErrorDeAccion, useAccion } from "./Acciones";

/**
 * CORREGIR UN TEXTO EN EL LUGAR (spec-estrategia-8x.md §8.1, punto 4).
 *
 * Un lápiz junto al texto, solo en versiones «lista» o «con observaciones». Se corrige en el mismo sitio y se guarda al
 * salir de la caja (Escape cancela). En la caja, cada cifra de 8X se ve entre ⟦ ⟧ con su valor: se puede mover o
 * borrar, no cambiar; lo que la consultora escriba con sus dedos queda como su cifra, con el chip «Escrito por la
 * consultora». Corregido, el texto dice «Editado por ti» y deja ver lo que escribió 8X (que nunca se borra: vive en lo
 * que 8X guardó al generar) y volver a ello.
 *
 * Lo pinta el servidor (`trozos`, ya sin ids); aquí solo se edita y se guarda. Cada cambio es una fila en el rastro de
 * correcciones (la ruta la deja) y vuelve a pasar por el validador.
 */

type Props = {
  companyId: string;
  eid: string;
  puntero: string;
  /** El texto pintado (lo que se ve). */
  trozos: Trozo[];
  /** Lo que escribió 8X, pintado, si la consultora lo corrigió. */
  original: Trozo[] | null;
  editable: boolean;
  /** El texto en la caja de corregir, con las cifras de 8X entre ⟦ ⟧, y qué id hay detrás de cada una. */
  visible: string;
  marcas: Marca[];
  /** El lugar de este texto, en palabras («Camino A, jugada 2: por qué»): el nombre de la caja y del lápiz. */
  lugar: string;
  /** La etiqueta que envuelve el texto. */
  como?: "span" | "p" | "h2" | "h3" | "h4" | "strong";
  clase?: string;
  /** Una caja grande (la oferta escrita, una lectura). */
  largo?: boolean;
  /** Si el mismo texto sale dos veces en la página (lo que hay que resolver), lo distingue: los paneles no se repiten. */
  donde?: string;
};

/** El contenedor del texto: en línea (span) o en bloque (div), para que el HTML sea válido donde vaya. */
function Caja({ enLinea, clase, editado, children }: { enLinea: boolean; clase: string; editado: boolean; children: ReactNode }) {
  return enLinea ? (
    <span className={clase} data-editado={editado ? "" : undefined}>
      {children}
    </span>
  ) : (
    <div className={clase} data-editado={editado ? "" : undefined}>
      {children}
    </div>
  );
}

export function TextoEditable({ companyId, eid, puntero, trozos, original, editable, visible, marcas, lugar, como: Etiqueta = "span", clase, largo = false, donde = "" }: Props) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(visible);
  const { trabajando, error, setError, correr } = useAccion();
  // Escape cancela: si la caja pierde el foco al cerrarse, no se guarda lo que se estaba escribiendo.
  const cancelado = useRef(false);
  const ruta = `/api/companies/${companyId}/estrategia/${eid}`;

  const guardar = async () => {
    if (cancelado.current) return;
    const nuevo = deEditable(valor.trim(), marcas);
    if (nuevo === deEditable(visible.trim(), marcas)) {
      setEditando(false);
      return;
    }
    const r = await correr(() => pedir(ruta, { method: "PATCH", json: { texto: { puntero, texto: nuevo } } }));
    if (r) setEditando(false);
  };

  const volver = () => void correr(() => pedir(ruta, { method: "PATCH", json: { restaurar: { puntero } } }));

  const enLinea = Etiqueta === "span" || Etiqueta === "strong";
  const panel = `${idHtml(`${donde}${puntero}`)}-8x`;

  return (
    <Caja enLinea={enLinea} clase={`editable${enLinea ? " editable--linea" : ""}${clase ? ` ${clase}` : ""}`} editado={!!original}>
      {editando ? (
        <span className="editable__caja">
          <textarea
            className="campo"
            aria-label={`${PANTALLA.corregir}: ${lugar}`}
            value={valor}
            rows={largo ? 7 : Math.min(6, Math.max(2, Math.ceil(valor.length / 70)))}
            autoFocus
            disabled={trabajando}
            onChange={(ev) => setValor(ev.target.value)}
            onBlur={() => void guardar()}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") {
                ev.preventDefault();
                cancelado.current = true;
                setValor(visible);
                setError(null);
                setEditando(false);
              }
            }}
          />
          {traeCifras(valor) && <small className="nota-accion">{PANTALLA.ayuda_cifras}</small>}
          {trabajando && (
            <small className="nota-accion" role="status">
              {PANTALLA.guardando}
            </small>
          )}
          <ErrorDeAccion error={error} />
        </span>
      ) : (
        <Etiqueta className="editable__texto">
          <Frase trozos={trozos} id={`${donde}${puntero}`} />
        </Etiqueta>
      )}
      {editable && !editando && (
        <button
          type="button"
          className="lapiz no-imprimir"
          aria-label={`${PANTALLA.corregir}: ${lugar}`}
          title={PANTALLA.corregir}
          onClick={() => {
            cancelado.current = false;
            setValor(visible);
            setEditando(true);
          }}
        >
          <Icono nombre="lapiz" />
        </button>
      )}
      {original && !editando && (
        <span className="editable__original no-imprimir">
          <button type="button" className="editable__marca" popoverTarget={panel}>
            {PANTALLA.editado_por_ti}
          </button>
          <span id={panel} popover="auto" className="cifra-detalle" role="dialog" aria-label={PANTALLA.lo_que_escribio_8x}>
            <span className="cifra-detalle__titulo">{PANTALLA.lo_que_escribio_8x}</span>
            <span className="cifra-detalle__fila">
              <Frase trozos={original} id={`${donde}${puntero}-8x`} />
            </span>
            {editable && (
              <button type="button" className="boton boton--secundario boton--chico" disabled={trabajando} onClick={volver}>
                {PANTALLA.volver_a_8x}
              </button>
            )}
            <ErrorDeAccion error={error} />
            <button type="button" className="enlace-azul cifra-detalle__cerrar" popoverTarget={panel} popoverTargetAction="hide">
              {PANTALLA.cerrar}
            </button>
          </span>
        </span>
      )}
    </Caja>
  );
}
