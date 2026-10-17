"use client";
import { useRef, useState } from "react";
import { pedir } from "@/lib/cliente";
import { Icono } from "@/components/base/Icono";
import { PANTALLA } from "@/lib/estrategia/textos";
import { ErrorDeAccion, useAccion } from "./Acciones";

/**
 * LO QUE FALTA SABER, HECHO PREGUNTAS PARA EL DUEÑO (spec-estrategia-8x.md §7.2 y §8.1).
 *
 * Una franja a la vista, no plegada (es una acción), que separa las preguntas que destraban un número —con las jugadas
 * que esperan— de las que son para afinar (revisión del 17-10: «harían falta para los números» exageraba cuando
 * ninguna destrababa nada). Al abrirla, primero las que destraban, cada una con su porqué y lo que destraba; la consultora la retoca (su texto pasa por las mismas
 * reglas que las del catálogo: una sola pregunta, corta, sin cifras ni jerga) o la quita. Después, UN toque: «Enviar las
 * N preguntas a [empresa]», con la confirmación de todo lo que se le abrirá al dueño. Lo ya enviado no se repite.
 */

export type PreguntaParaRevisar = { id: string; texto: string; por_que: string | null; esperan: string[] };

type Props = {
  companyId: string;
  estrategiaId: string;
  empresa: string;
  propuestas: PreguntaParaRevisar[];
  /** Cuántas ya enviadas esperan respuesta del dueño. */
  enviadas: number;
  /** «Se le abrirá al dueño: 3 preguntas y «Tus ventas al crédito o fiadas».» */
  resumen: string;
};

function Pregunta({ companyId, p }: { companyId: string; p: PreguntaParaRevisar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(p.texto);
  const { trabajando, error, setError, correr } = useAccion();
  const cancelado = useRef(false);
  const ruta = `/api/companies/${companyId}/estrategia-preguntas/${p.id}`;
  const guardar = async () => {
    if (cancelado.current || texto.trim() === p.texto.trim()) return setEditando(false);
    const r = await correr(() => pedir(ruta, { method: "PATCH", json: { texto: texto.trim() } }));
    if (r) setEditando(false);
  };
  return (
    <li className="pregunta-propuesta">
      {editando ? (
        <textarea
          className="campo"
          rows={2}
          maxLength={200}
          aria-label={PANTALLA.corregir_pregunta}
          value={texto}
          autoFocus
          disabled={trabajando}
          onChange={(ev) => setTexto(ev.target.value)}
          onBlur={() => void guardar()}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") {
              cancelado.current = true;
              setTexto(p.texto);
              setError(null);
              setEditando(false);
            }
          }}
        />
      ) : (
        <span className="pregunta-propuesta__texto">
          <b>{p.texto}</b>
          <button
            type="button"
            className="lapiz"
            aria-label={PANTALLA.corregir_pregunta}
            title={PANTALLA.corregir}
            onClick={() => {
              cancelado.current = false;
              setEditando(true);
            }}
          >
            <Icono nombre="lapiz" />
          </button>
        </span>
      )}
      <span className={`estado ${p.esperan.length ? "espera" : "neutro"} pregunta-propuesta__tipo`}>{p.esperan.length ? PANTALLA.destraba : PANTALLA.para_afinar}</span>
      {p.por_que && <small>{p.por_que}</small>}
      {p.esperan.length > 0 && <small>{PANTALLA.esperan}: {p.esperan.join(" · ")}</small>}
      <span className="pregunta-propuesta__acciones">
        <button type="button" className="enlace-azul" disabled={trabajando} onClick={() => void correr(() => pedir(ruta, { method: "PATCH", json: { retirar: true } }))}>
          {PANTALLA.quitar_pregunta}
        </button>
      </span>
      <ErrorDeAccion error={error} />
    </li>
  );
}

export function RevisarPreguntas({ companyId, estrategiaId, empresa, propuestas, enviadas, resumen }: Props) {
  const [confirmar, setConfirmar] = useState(false);
  const { trabajando, error, correr } = useAccion();
  const n = propuestas.length;
  // Primero las que destraban un número; después las que son para afinar.
  const ordenadas = [...propuestas].sort((a, b) => Number(b.esperan.length > 0) - Number(a.esperan.length > 0));
  const destraban = propuestas.filter((p) => p.esperan.length > 0).length;
  const donde = [...new Set(propuestas.flatMap((p) => p.esperan))];
  const dondeTexto = donde.slice(0, 3).join(" · ") + (donde.length > 3 ? " · …" : "");
  const enviar = () => void correr(() => pedir(`/api/companies/${companyId}/estrategia-preguntas`, { method: "POST", json: { enviar: propuestas.map((p) => p.id), estrategia_id: estrategiaId } }));

  if (!n) {
    return enviadas ? (
      <p className="franja-accion franja-accion--tenue" role="status">
        {PANTALLA.enviadas_esperan(enviadas)}
      </p>
    ) : null;
  }
  return (
    <details className="franja-accion" id="preguntas">
      <summary>
        <span>
          {PANTALLA.hay_preguntas(destraban, n - destraban, dondeTexto)}
          {enviadas > 0 && <small> {PANTALLA.ya_enviadas(enviadas)}</small>}
        </span>
        <span className="franja-accion__boton">{PANTALLA.revisar_y_enviar}</span>
      </summary>
      <ul className="preguntas-propuestas">
        {ordenadas.map((p) => (
          <Pregunta key={p.id} companyId={companyId} p={p} />
        ))}
      </ul>
      <div className="preguntas-propuestas__enviar">
        {!confirmar ? (
          <button type="button" className="boton" onClick={() => setConfirmar(true)}>
            {PANTALLA.enviar_a(n, empresa)}
          </button>
        ) : (
          <span className="aprobar__confirmar" role="group" aria-label={PANTALLA.confirmar_envio}>
            <span className="t-dato">{resumen}</span>
            <span className="elegir-camino__botones">
              <button type="button" className="boton" disabled={trabajando} onClick={enviar}>
                {trabajando ? PANTALLA.enviando : PANTALLA.enviar_si(n)}
              </button>
              <button type="button" className="boton boton--secundario" disabled={trabajando} onClick={() => setConfirmar(false)}>
                {PANTALLA.atras}
              </button>
            </span>
          </span>
        )}
        <ErrorDeAccion error={error} />
      </div>
    </details>
  );
}
