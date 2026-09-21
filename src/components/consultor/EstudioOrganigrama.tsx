"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Progreso } from "@/components/base/Progreso";
import { fechaCorta } from "@/lib/textos";

type PuestoPropuesto = { nombre: string; mision: string; decide: string; por_que: string; cuando: "ahora" | "tres_meses" | "al_crecer" };
type Opcion = { nombre: string; logica: string; puestos: PuestoPropuesto[]; ventajas: string[]; desventajas: string[]; conviene_si: string };
export type EstudioIA = {
  lo_que_quiere: string;
  como_esta_hoy: string;
  opcion_a: Opcion;
  opcion_b: Opcion;
  recomendacion: { opcion: "a" | "b"; por_que: string };
  faltantes: { que_falta: string; por_que_importa: string; pregunta_sugerida: string }[];
  riesgos_de_la_estructura: string[];
};

const CUANDO: Record<string, string> = { ahora: "ahora", tres_meses: "en 3 meses", al_crecer: "al crecer" };

/**
 * EL ESTUDIO v2 (pedido de Kelin): dos opciones de estructura con ventajas y desventajas, la
 * recomendación del motor, ADOPTAR una con un clic (siembra sus puestos como vacantes), y las
 * OBSERVACIONES de levantamiento — lo que falta saber, con la pregunta lista para hacerla.
 */
export function EstudioOrganigrama({ companyId, estudio, fecha, versiones }: { companyId: string; estudio: EstudioIA | null; fecha: string | null; versiones: string[] }) {
  const router = useRouter();
  const [job, setJob] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [adoptada, setAdoptada] = useState<"a" | "b" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generar = async () => {
    setError(null);
    setOcupado("generar");
    try {
      const r = await pedir<{ job_id: string }>(`/api/companies/${companyId}/organigrama/estudio`, { json: {} });
      setJob(r.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    } finally {
      setOcupado(null);
    }
  };

  const adoptar = async (cual: "a" | "b") => {
    if (!estudio) return;
    setOcupado(`adoptar-${cual}`);
    setError(null);
    try {
      const op = cual === "a" ? estudio.opcion_a : estudio.opcion_b;
      for (const p of op.puestos) {
        await pedir(`/api/companies/${companyId}/organigrama`, { json: { nombre: p.nombre, mision: p.mision, decide: p.decide, por_que: p.por_que } });
      }
      setAdoptada(cual);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo adoptar.");
    } finally {
      setOcupado(null);
    }
  };

  const TarjetaOpcion = ({ cual, op }: { cual: "a" | "b"; op: Opcion }) => {
    const recomendada = estudio?.recomendacion.opcion === cual;
    return (
      <article className="panel p-5" style={{ borderTop: `2.5px solid ${recomendada ? "var(--marca)" : "var(--linea)"}` }}>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <p className="t-etiqueta" style={{ color: recomendada ? "var(--marca)" : "var(--grafito)" }}>OPCIÓN {cual.toUpperCase()}{recomendada ? " · RECOMENDADA" : ""}</p>
          <span className="t-dato" style={{ color: "var(--grafito)" }}>{op.puestos.length} puestos</span>
        </div>
        <h3 className="t-seccion mt-1" style={{ fontSize: 17 }}>{op.nombre}</h3>
        <p className="t-cuerpo mt-2">{op.logica}</p>
        <div className="mt-3 flex flex-col gap-1">
          {op.puestos.map((p) => (
            <p key={p.nombre} className="t-dato"><b>{p.nombre}</b> <span style={{ color: "var(--grafito)" }}>· {p.mision} · {CUANDO[p.cuando]}</span></p>
          ))}
        </div>
        <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <p className="t-etiqueta mb-1" style={{ color: "var(--confirmado)" }}>A FAVOR</p>
            {op.ventajas.map((v, i) => <p key={i} className="t-dato">– {v}</p>)}
          </div>
          <div>
            <p className="t-etiqueta mb-1" style={{ color: "var(--contradicho)" }}>EN CONTRA</p>
            {op.desventajas.map((v, i) => <p key={i} className="t-dato">– {v}</p>)}
          </div>
        </div>
        <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}><b>Conviene si:</b> {op.conviene_si}</p>
        <div className="no-imprimir mt-4">
          {adoptada === cual ? (
            <p className="t-dato" style={{ color: "var(--confirmado)", fontWeight: 600 }}>Adoptada: sus puestos ya están arriba como vacantes — ponles nombre.</p>
          ) : (
            <button className="boton boton--secundario" disabled={!!ocupado} onClick={() => adoptar(cual)}>
              {ocupado === `adoptar-${cual}` ? "Sembrando puestos…" : "Adoptar esta estructura"}
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h2 className="t-seccion">El estudio: dos caminos para llegar a lo que quiere</h2>
        <span className="no-imprimir flex items-center gap-3 flex-wrap">
          {fecha && <span className="t-dato" style={{ color: "var(--grafito)" }}>vigente del {fechaCorta(fecha)}{versiones.length > 1 ? ` · ${versiones.length} versiones` : ""}</span>}
          <button className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }} onClick={generar} disabled={ocupado === "generar" || !!job}>
            {ocupado === "generar" ? "Encolando…" : estudio ? "Nueva versión del estudio" : "Generar el estudio"}
          </button>
        </span>
      </div>
      <Progreso jobId={job} alTerminar={() => { setJob(null); router.refresh(); }} />
      {error && <p className="t-cuerpo mb-3" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}

      {!estudio ? (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          El motor lee lo que el cliente declaró de su equipo, su meta, sus hallazgos y sus procesos — y devuelve dos opciones de estructura con ventajas y desventajas, una recomendación, y la lista de lo que falta levantar. Nada es inventado.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <p className="t-etiqueta mb-2" style={{ color: "var(--marca)" }}>QUÉ QUIERE LOGRAR</p>
              <p className="t-cuerpo">{estudio.lo_que_quiere}</p>
            </div>
            <div className="panel p-5">
              <p className="t-etiqueta mb-2">CÓMO ESTÁ HOY</p>
              <p className="t-cuerpo">{estudio.como_esta_hoy}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TarjetaOpcion cual="a" op={estudio.opcion_a} />
            <TarjetaOpcion cual="b" op={estudio.opcion_b} />
          </div>
          <p className="t-cuerpo medida"><b>La recomendación del estudio:</b> {estudio.recomendacion.por_que}</p>

          {/* LAS OBSERVACIONES DE LEVANTAMIENTO: el trabajo de la consultora, con la pregunta lista. */}
          {estudio.faltantes.length > 0 && (
            <div className="panel p-5" style={{ borderTop: "2.5px solid var(--caducado)" }}>
              <p className="t-etiqueta mb-3" style={{ color: "var(--caducado)" }}>INFORMACIÓN POR LEVANTAR — {estudio.faltantes.length} OBSERVACIÓN(ES) PARA TI</p>
              <div className="flex flex-col gap-3">
                {estudio.faltantes.map((f, i) => (
                  <div key={i} style={{ borderBottom: i < estudio.faltantes.length - 1 ? "1px solid var(--linea)" : "none", paddingBottom: 10 }}>
                    <p className="t-dato" style={{ fontWeight: 600 }}>{f.que_falta}</p>
                    <p className="t-dato" style={{ color: "var(--grafito)" }}>{f.por_que_importa}</p>
                    <p className="t-dato mt-1" style={{ color: "var(--marca)" }}>Pregunta lista: «{f.pregunta_sugerida}»</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {estudio.riesgos_de_la_estructura.length > 0 && (
            <div className="panel p-5">
              <p className="t-etiqueta mb-2" style={{ color: "var(--contradicho)" }}>SI SE QUEDA COMO ESTÁ</p>
              <ul className="flex flex-col gap-2">
                {estudio.riesgos_de_la_estructura.map((r, i) => (
                  <li key={i} className="t-dato">{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
