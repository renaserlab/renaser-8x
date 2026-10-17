"use client";
import { useState } from "react";
import { pedir } from "@/lib/cliente";
import type { DatoOral } from "@/lib/dato-oral";
import { porDefecto, type ConfigEmpresa } from "@/lib/formato";
import { cuerpoDeRespuesta, faltanPorResponder, formatoDeUnidad, maximoDe, preguntaDesdeFila, respuestaEnTexto, type PreguntaDueno } from "@/lib/estrategia/dueno";
import { PORTAL } from "@/lib/estrategia/textos";
import { CampoDato } from "@/components/negocio/CampoDato";
import { ListoParaConsultora } from "@/components/negocio/ListoParaConsultora";
import { leerCaja, mensajeDe } from "@/components/negocio/dato";
import { BotonGrabar } from "@/components/voz/BotonGrabar";
import { Icono } from "@/components/base/Icono";

/*
CONTRATO DE DIRECCIÓN — unas preguntas para afinar tu plan (spec-estrategia-8x.md §7.3)
THESIS: una pregunta por tarjeta, con una caja que acepta lo que se dice («unos 40», «de 30 a 50», «No lo sé») o el
  texto de una pregunta abierta, y el micrófono para dictar. Se guarda al salir de cada tarjeta; al final, una sola
  acción: «Listo, ya respondí».
STORY: «Me preguntan lo que no saben de mi negocio; respondo lo que sé, digo lo que no sé, y le aviso a mi consultora».
FINISH: un «No lo sé» es una respuesta y cuenta; vaciar la caja no lo es y no se guarda. Lo que no se pudo guardar se
  dice en la tarjeta, nunca en silencio. Lo ya respondido queda abajo, plegado, y se corrige mientras el pedido siga
  abierto. Ninguna caja trae una cifra de ejemplo.
*/

type Props = {
  companyId: string;
  /** Las enviadas y las respondidas de su empresa, en el orden en que se propusieron. */
  preguntas: PreguntaDueno[];
  config?: ConfigEmpresa;
  /** El pedido «Unas preguntas para afinar tu plan»: el abierto (si lo hay) y cuándo avisó la última vez. */
  pedido: { solicitudId: string | null; completadaAt: string | null };
  /** Dueño o líder (puede), o la consultora mirando «como el empresario» (ve sin responder). */
  quien: { puede: boolean; comoConsultora: boolean };
};

type Guardado = { tipo: "guardando" } | { tipo: "guardado" } | { tipo: "aviso"; texto: string } | { tipo: "error"; texto: string };

function Tarjeta({ p, rotulo, editable, config, guardado, alResponder, alAvisar }: {
  p: PreguntaDueno;
  rotulo: string | null;
  editable: boolean;
  config: ConfigEmpresa;
  guardado: Guardado | undefined;
  alResponder: (r: { dato?: DatoOral | null; texto?: string | null }) => void;
  alAvisar: (texto: string) => void;
}) {
  const [borrador, setBorrador] = useState(p.respuesta_texto ?? "");
  const respondida = p.estado === "respondida";
  const leida = respuestaEnTexto(p, config);
  const max = maximoDe(p.unidad);
  const esNoLoSe = p.unidad === "texto" ? p.respuesta_texto === PORTAL.no_lo_se : p.respuesta?.estado === "no_lo_se";

  const guardarTexto = (t: string) => {
    if (!t.trim()) {
      if (!respondida) alAvisar(PORTAL.vacio);
      return;
    }
    if (t.trim() !== (p.respuesta_texto ?? "")) alResponder({ texto: t });
  };

  return (
    <li className="pregunta-tarjeta" data-respondida={respondida ? "" : undefined}>
      <div className="pregunta-tarjeta__cabeza">
        {rotulo && <span className="pregunta-tarjeta__numero">{rotulo}</span>}
        {guardado?.tipo === "guardando" ? (
          <span className="estado neutro" role="status">{PORTAL.guardando}</span>
        ) : guardado?.tipo === "guardado" ? (
          <span className="estado ok" role="status">{PORTAL.guardado}</span>
        ) : respondida ? (
          <span className="estado ok">{PORTAL.respondida}</span>
        ) : (
          <span className="estado neutro">{PORTAL.sin_responder}</span>
        )}
      </div>
      <p className="pregunta-tarjeta__texto">{p.texto}</p>

      {!editable ? (
        <p className="pregunta-tarjeta__respuesta">{leida ? <><span className="t-etiqueta">{PORTAL.tu_respuesta}: </span><b>{leida}</b></> : <span className="pregunta-tarjeta__aviso">{PORTAL.sin_responder}</span>}</p>
      ) : p.unidad === "texto" ? (
        <>
          <textarea
            aria-label={p.texto}
            className="campo"
            rows={3}
            maxLength={1000}
            value={borrador}
            placeholder={PORTAL.escribe}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={() => guardarTexto(borrador)}
          />
          <div className="pregunta-tarjeta__acciones">
            <BotonGrabar
              grande={false}
              alTexto={(t) => {
                const nuevo = borrador.trim() ? `${borrador.trim()} ${t}` : t;
                setBorrador(nuevo);
                guardarTexto(nuevo);
              }}
            />
            <button
              type="button"
              className="boton boton--secundario"
              aria-pressed={esNoLoSe}
              onClick={() => {
                setBorrador(PORTAL.no_lo_se);
                if (!esNoLoSe) alResponder({ texto: PORTAL.no_lo_se });
              }}
            >
              {PORTAL.no_lo_se}
            </button>
          </div>
        </>
      ) : (
        <>
          <CampoDato
            etiqueta={p.texto}
            conEtiqueta={false}
            valor={p.respuesta}
            modo="dueno"
            formato={formatoDeUnidad(p.unidad, config)}
            max={max}
            alGuardar={(d) => (d ? alResponder({ dato: d }) : alAvisar(PORTAL.vacio))}
          />
          <div className="pregunta-tarjeta__acciones">
            <BotonGrabar
              grande={false}
              alTexto={(t) => {
                const r = leerCaja(t, p.respuesta, { max });
                if (r.tipo === "ok") alResponder({ dato: r.dato });
                else alAvisar(PORTAL.dictado_no_entendido(t));
              }}
            />
          </div>
        </>
      )}

      {guardado?.tipo === "aviso" && <p className="pregunta-tarjeta__aviso" role="status">{guardado.texto}</p>}
      {guardado?.tipo === "error" && <p className="pregunta-tarjeta__error" role="alert">{guardado.texto}</p>}
    </li>
  );
}

export function ResponderPreguntas({ companyId, preguntas, config = porDefecto, pedido, quien }: Props) {
  // Las que estaban por responder al entrar se quedan arriba, aunque se respondan: así se corrigen sin perderlas de vista.
  const [porResponder] = useState(() => new Set(preguntas.filter((p) => p.estado === "enviada").map((p) => p.id)));
  const [filas, setFilas] = useState(preguntas);
  const [guardados, setGuardados] = useState<Record<string, Guardado>>({});
  const editable = quien.puede && !quien.comoConsultora && !!pedido.solicitudId;

  const marcar = (id: string, g: Guardado) => setGuardados((x) => ({ ...x, [id]: g }));
  const responder = async (p: PreguntaDueno, r: { dato?: DatoOral | null; texto?: string | null }) => {
    const cuerpo = cuerpoDeRespuesta(p.unidad, r);
    if (!cuerpo) return marcar(p.id, { tipo: "aviso", texto: PORTAL.vacio });
    marcar(p.id, { tipo: "guardando" });
    try {
      const res = await pedir<{ pregunta?: Record<string, unknown> }>(`/api/companies/${companyId}/estrategia-preguntas/${p.id}`, { method: "PATCH", json: cuerpo });
      const nueva = res.pregunta ? preguntaDesdeFila(res.pregunta) : null;
      setFilas((fs) =>
        fs.map((f) =>
          f.id !== p.id
            ? f
            : nueva ?? { ...f, estado: "respondida", respuesta: "respuesta" in cuerpo ? cuerpo.respuesta : null, respuesta_texto: "respuesta_texto" in cuerpo ? cuerpo.respuesta_texto : f.respuesta_texto }
        )
      );
      marcar(p.id, { tipo: "guardado" });
    } catch (e) {
      marcar(p.id, { tipo: "error", texto: PORTAL.no_se_guardo(mensajeDe(e)) });
    }
  };

  const arriba = filas.filter((p) => porResponder.has(p.id));
  const abajo = filas.filter((p) => !porResponder.has(p.id));
  const faltan = faltanPorResponder(arriba);
  const tarjeta = (p: PreguntaDueno, rotulo: string | null) => (
    <Tarjeta
      key={p.id}
      p={p}
      rotulo={rotulo}
      editable={editable}
      config={config}
      guardado={guardados[p.id]}
      alResponder={(r) => void responder(p, r)}
      alAvisar={(texto) => marcar(p.id, { tipo: "aviso", texto })}
    />
  );

  return (
    <>
      {!pedido.solicitudId && !quien.comoConsultora && faltan > 0 && <p className="t-cuerpo medida mb-6" role="status">{PORTAL.preguntas_cerradas}</p>}
      {quien.comoConsultora && <p className="t-dato medida mb-6" style={{ color: "var(--grafito)" }}>{PORTAL.como_consultora}</p>}

      {arriba.length > 0 && <ol className="preguntas-dueno">{arriba.map((p, i) => tarjeta(p, PORTAL.pregunta_de(i + 1, arriba.length)))}</ol>}

      {abajo.length > 0 && (
        <details className="plegado preguntas-dueno__respondidas" open={!arriba.length || undefined}>
          <summary>
            {PORTAL.ya_respondiste(abajo.length)}
            <Icono nombre="abajo" />
          </summary>
          <ul className="preguntas-dueno">{abajo.map((p) => tarjeta(p, null))}</ul>
        </details>
      )}

      {editable && faltan > 0 ? (
        <p className="preguntas-dueno__pie" role="status">{PORTAL.te_faltan(faltan)}</p>
      ) : (
        <ListoParaConsultora
          companyId={companyId}
          solicitudId={pedido.solicitudId}
          completadaAt={pedido.completadaAt}
          puede={quien.puede}
          comoConsultora={quien.comoConsultora}
          zona={config.zona_horaria}
          boton={PORTAL.listo}
        />
      )}
    </>
  );
}
