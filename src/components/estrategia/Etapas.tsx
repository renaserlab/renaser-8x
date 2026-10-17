"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import type { EstadoDeEtapas, Paso } from "@/lib/estrategia/datos";
import { MOTOR, PANTALLA } from "@/lib/estrategia/textos";
import { Icono } from "@/components/base/Icono";
import { ErrorDeAccion, useAccion } from "./Acciones";

/**
 * MIENTRAS SE GENERA (spec-estrategia-8x.md §5.4 y §8.1, punto 2).
 *
 * En palabras llanas: «Pensando el camino del dinero · Pensando el camino de la operación · Poniéndolos a prueba ·
 * Revisando cada cifra». En qué va cada etapa lo dice `estadoDeEtapas` en el servidor, con lo anotado en la versión Y
 * con el estado de su trabajo en la cola: un trabajo que murió sin avisar también se ve, y no deja la versión
 * «generando» para siempre. Esta pieza vuelve a preguntar cada pocos segundos (`?solo=etapas`) y, cuando termina,
 * vuelve a leer la página. Si una etapa falla: su motivo, «Reintentar esta etapa» y, aparte, «Descartar esta versión».
 * Lo que ya se pagó no se repite: una etapa guardada no vuelve a llamar al asistente.
 */

const CADA_MS = 5000;


export function Etapas({ companyId, eid, inicial }: { companyId: string; eid: string; inicial: EstadoDeEtapas }) {
  const router = useRouter();
  const [etapas, setEtapas] = useState(inicial);
  const reintentar = useAccion();
  const descartar = useAccion();
  const [seguro, setSeguro] = useState(false);
  const ruta = `/api/companies/${companyId}/estrategia/${eid}`;

  useEffect(() => {
    if (etapas.terminada) {
      router.refresh();
      return;
    }
    let vivo = true;
    const t = setInterval(async () => {
      try {
        const r = await pedir<{ etapas: EstadoDeEtapas }>(`${ruta}?solo=etapas`);
        if (vivo) setEtapas(r.etapas);
      } catch {
        // Un tropiezo de red no cambia lo que se ve: en el siguiente turno se vuelve a preguntar.
      }
    }, CADA_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [etapas.terminada, ruta, router]);

  const etapaDe = (p: Paso): "dinero" | "terreno" | "rojo" => (p.clave === "revision" ? "rojo" : p.clave);

  return (
    <div className="etapas">
      <ol className="etapas__lista" aria-live="polite">
        {etapas.pasos.map((p) => (
          <li key={p.clave} className="etapa" data-estado={p.estado}>
            <span className="etapa__marca" aria-hidden="true">{p.estado === "lista" ? <Icono nombre="hecho" /> : null}</span>
            <span className="etapa__texto">
              <b>{p.texto}</b>
              <small>
                {PANTALLA.estado_etapa[p.estado] ?? p.estado}
                {/* El motivo de lo que falló lo dice el aviso de abajo, una sola vez. */}
                {p.detalle && p.estado !== "lista" && !(p.estado === "fallida" && etapas.aviso) ? ` · ${p.detalle}` : ""}
              </small>
            </span>
            {p.estado === "fallida" && p.reintentable && (
              <button
                type="button"
                className="boton boton--secundario boton--chico"
                disabled={reintentar.trabajando}
                onClick={() => void reintentar.correr(() => pedir(`${ruta}/reintentar`, { method: "POST", json: { etapa: etapaDe(p) } }), () => setEtapas({ ...etapas, fallida: false, aviso: null, pasos: etapas.pasos.map((x) => (x.clave === p.clave ? { ...x, estado: "en_cola", detalle: null, reintentable: false } : x)) }))}
              >
                {reintentar.trabajando ? PANTALLA.reintentando : MOTOR.reintentar}
              </button>
            )}
          </li>
        ))}
      </ol>
      {etapas.aviso && (
        <p className="etapas__aviso" role="status">
          {etapas.aviso}
        </p>
      )}
      <ErrorDeAccion error={reintentar.error} />
      {etapas.fallida && (
        <p className="etapas__descartar">
          {!seguro ? (
            <button type="button" className="enlace-azul" onClick={() => setSeguro(true)}>
              {MOTOR.descartar}
            </button>
          ) : (
            <span className="elegir-camino__botones">
              <span className="t-dato">{PANTALLA.descartar_nota}</span>
              <button type="button" className="boton boton--peligro boton--chico" disabled={descartar.trabajando} onClick={() => void descartar.correr(() => pedir(ruta, { method: "POST", json: { descartar: true } }))}>
                {descartar.trabajando ? PANTALLA.descartando : PANTALLA.descartar_si}
              </button>
              <button type="button" className="boton boton--secundario boton--chico" onClick={() => setSeguro(false)}>
                {PANTALLA.atras}
              </button>
            </span>
          )}
          <ErrorDeAccion error={descartar.error} />
        </p>
      )}
    </div>
  );
}
