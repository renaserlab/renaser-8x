"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { TEXTO_NO_SE_PUDO_LEER, type AvanceRuta, type CriterioEvaluado, type EtapaEvaluada } from "@/lib/ruta";
import { TEXTO_VEREDICTO_SIN_MOTIVO } from "@/lib/esquemas-negocio";
import { mensajeDe } from "@/components/negocio/dato";

type Aviso = { tipo: "ok" | "error"; texto: string } | null;
type Veredicto = "verde" | "ambar" | "rojo";

const VEREDICTO: Record<Veredicto, string> = { verde: "Verde", ambar: "Ámbar", rojo: "Rojo" };
const COLOR_VEREDICTO: Record<Veredicto, string> = { verde: "var(--confirmado)", ambar: "var(--caducado)", rojo: "var(--contradicho)" };
const ESTADO_ETAPA: Record<EtapaEvaluada["estado"], string> = { pasada: "pasada", en_curso: "en curso", por_venir: "por venir" };
const SUGERIDO: Record<EtapaEvaluada["compuerta"]["sugerido"], string> = {
  verde: "8X sugiere verde",
  ambar: "8X sugiere ámbar",
  rojo: "8X sugiere rojo",
  no_se_pudo_leer: "8X no sugiere color: hay datos que no se pudieron leer",
};

/** Las letras de una nota (sin espacios ni signos): un veredicto se guarda con un motivo de verdad. */
const letras = (t: string) => (t.match(/\p{L}/gu) ?? []).length;

/** El estado de un criterio, en una palabra y con su marca visual. «No se pudo leer» va rayado, nunca como «falta». */
function EstadoCriterio({ c }: { c: CriterioEvaluado }) {
  if (c.estado === "sin_medir") return <span className="sin-dato">{TEXTO_NO_SE_PUDO_LEER}</span>;
  const texto = c.estado === "hecho" ? "hecho" : c.estado === "falta" ? "falta" : "no aplica";
  const clase = c.estado === "hecho" ? "ok" : c.estado === "falta" ? "espera" : "neutro";
  return <span className={`estado ${clase}`}>{texto}</span>;
}

/** Lo que la consultora ya marcó en un criterio de marca, leído de su estado (ruta.ts: «hecho» = cumple). */
function marcaDe(c: CriterioEvaluado): "cumple" | "no_cumple" | null {
  if (c.fuente !== "marca") return null;
  if (c.estado === "hecho") return "cumple";
  return c.detalle.startsWith("la consultora marcó que no cumple") ? "no_cumple" : null;
}

function Criterio({ companyId, etapa, c, alGuardado }: { companyId: string; etapa: EtapaEvaluada; c: CriterioEvaluado; alGuardado: () => void }) {
  const [nota, setNota] = useState("");
  const marcado = marcaDe(c);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const marcar = async (valor: "cumple" | "no_cumple") => {
    setTrabajando(true);
    setAviso(null);
    try {
      // Sin nota escrita no se manda nota: la que ya tenía la marca se conserva (antes se borraba al volver a marcar).
      const conNota = nota.trim() ? { nota: nota.trim().slice(0, 600) } : {};
      await pedir(`/api/companies/${companyId}/ruta`, { method: "PATCH", json: { marca: { clave: `${etapa.clave}.${c.clave}`, valor, ...conNota } } });
      setAviso({ tipo: "ok", texto: "Marcado" });
      alGuardado();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <li className="flex flex-col gap-2" style={{ borderTop: "1px solid var(--linea)", padding: "10px 0" }}>
      <div className="flex flex-wrap items-center gap-2">
        <EstadoCriterio c={c} />
        <span className="t-dato" style={{ fontWeight: 600 }}>{c.texto}</span>
        <span className="t-dato" style={{ color: "var(--grafito)", fontSize: 12.5 }}>{c.fuente === "medido" ? "lo mide 8X" : "lo marcas tú"}</span>
      </div>
      {c.detalle && <p className="t-dato" style={{ color: "var(--grafito)" }}>{c.detalle}</p>}
      {c.fuente === "marca" && (
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label={`Nota sobre ${c.texto}`} className="campo" style={{ flex: "1 1 220px" }} maxLength={600} value={nota} placeholder="Por qué, en una frase (opcional)" onChange={(e) => setNota(e.target.value)} />
          <button type="button" className="boton boton--secundario" style={{ fontSize: 14 }} aria-pressed={marcado === "cumple"} disabled={trabajando} onClick={() => void marcar("cumple")}>Cumple</button>
          <button type="button" className="boton boton--secundario" style={{ fontSize: 14 }} aria-pressed={marcado === "no_cumple"} disabled={trabajando} onClick={() => void marcar("no_cumple")}>No cumple</button>
        </div>
      )}
      {aviso && <p className="t-dato" role={aviso.tipo === "error" ? "alert" : "status"} style={{ color: aviso.tipo === "error" ? "var(--contradicho)" : "var(--confirmado)" }}>{aviso.texto}</p>}
    </li>
  );
}

function VeredictoEtapa({ companyId, etapa, alGuardado }: { companyId: string; etapa: EtapaEvaluada; alGuardado: () => void }) {
  const [valor, setValor] = useState<Veredicto | null>(etapa.compuerta.veredicto);
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const guardar = async () => {
    if (!valor) {
      setAviso({ tipo: "error", texto: "Elige verde, ámbar o rojo." });
      return;
    }
    if (letras(nota) < 3) {
      setAviso({ tipo: "error", texto: TEXTO_VEREDICTO_SIN_MOTIVO });
      return;
    }
    setTrabajando(true);
    setAviso(null);
    try {
      await pedir(`/api/companies/${companyId}/ruta`, { method: "PATCH", json: { veredicto: { etapa: etapa.clave, valor, nota: nota.trim().slice(0, 600) } } });
      setAviso({ tipo: "ok", texto: valor === "verde" ? "Guardado: la etapa queda pasada y sigue la siguiente." : "Guardado." });
      setNota("");
      alGuardado();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeDe(e) });
    } finally {
      setTrabajando(false);
    }
  };
  return (
    <div className="panel p-4 flex flex-col gap-3" style={{ background: "var(--suave)" }}>
      <p className="t-dato">
        <b>{etapa.compuerta.nombre}</b> · {SUGERIDO[etapa.compuerta.sugerido]}
        {etapa.compuerta.veredicto && (
          <>
            {" "}· tu veredicto: <b style={{ color: COLOR_VEREDICTO[etapa.compuerta.veredicto] }}>{VEREDICTO[etapa.compuerta.veredicto]}</b>
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Veredicto de ${etapa.compuerta.nombre}`}>
        {(Object.keys(VEREDICTO) as Veredicto[]).map((v) => (
          <button key={v} type="button" className={valor === v ? "boton" : "boton boton--secundario"} style={{ fontSize: 14 }} aria-pressed={valor === v} onClick={() => setValor(v)}>
            {VEREDICTO[v]}
          </button>
        ))}
      </div>
      <textarea aria-label="Por qué ese veredicto" className="campo" rows={2} maxLength={600} value={nota} placeholder="Por qué, en una frase: el veredicto se guarda con su motivo" onChange={(e) => setNota(e.target.value)} />
      <div>
        <button type="button" className="boton" disabled={trabajando} onClick={() => void guardar()}>{trabajando ? "Guardando…" : "Guardar el veredicto"}</button>
      </div>
      {aviso && <p className="t-dato" role={aviso.tipo === "error" ? "alert" : "status"} style={{ color: aviso.tipo === "error" ? "var(--contradicho)" : "var(--confirmado)" }}>{aviso.texto}</p>}
    </div>
  );
}

/**
 * LAS COMPUERTAS DE LA RUTA (para la consultora). Por etapa: lo que 8X mide, con su detalle; lo que 8X no mide y
 * marcas tú («Cumple» / «No cumple», con nota); y el veredicto de la compuerta —verde, ámbar o rojo, siempre con su
 * motivo—, con el color que sugiere 8X al lado. Una etapa queda pasada solo con tu verde. Lo que no se pudo leer va
 * rayado y nombrado: 8X nunca sugiere verde con algo sin leer.
 */
export function MarcarCompuerta({ companyId, avance }: { companyId: string; avance: AvanceRuta | null }) {
  const router = useRouter();
  if (!avance) return <p className="t-dato" style={{ color: "var(--grafito)" }}>La ruta todavía no está habilitada en esta base.</p>;
  if (!avance.tipo) return <p className="t-dato" style={{ color: "var(--grafito)" }}>Elige el tipo de trabajo para ver sus etapas y sus compuertas.</p>;
  const refrescar = () => router.refresh();
  return (
    <div className="flex flex-col gap-3">
      {avance.aviso && <p className="t-dato" style={{ color: "var(--grafito)" }}>{avance.aviso}.</p>}
      {avance.etapas.map((e) => (
        // Cerradas: lo que falta de la etapa en curso ya está arriba, en la barra de avance. Se abre la que se trabaja.
        <details key={e.clave} className="panel p-4">
          <summary className="flex flex-wrap items-center gap-2" style={{ cursor: "pointer", minHeight: 44 }}>
            <span className="t-seccion" style={{ fontSize: 16 }}>{e.nombre}</span>
            <span className={`estado ${e.estado === "pasada" ? "ok" : e.estado === "en_curso" ? "espera" : "neutro"}`}>{ESTADO_ETAPA[e.estado]}</span>
            <span className="t-dato" style={{ color: "var(--grafito)" }}>
              {/* Una etapa por venir no tiene avance que decir: sus criterios con «0 de 0» no son trabajo hecho. */}
              {e.estado === "por_venir" ? "" : `${e.pct == null ? "sin medir" : `${e.pct} %`} · `}días {e.desdeDia} a {e.hastaDia}
              {e.sinMedir > 0 ? ` · ${e.sinMedir} sin leer` : ""}
            </span>
          </summary>
          <ul className="mt-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {e.criterios.map((c) => (
              <Criterio key={c.clave} companyId={companyId} etapa={e} c={c} alGuardado={refrescar} />
            ))}
          </ul>
          <div className="mt-3">
            <VeredictoEtapa companyId={companyId} etapa={e} alGuardado={refrescar} />
          </div>
        </details>
      ))}
    </div>
  );
}
