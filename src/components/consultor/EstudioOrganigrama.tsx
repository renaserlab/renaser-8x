"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Progreso } from "@/components/base/Progreso";
import { fechaCorta } from "@/lib/textos";

export type EstudioIA = {
  lo_que_quiere: string;
  como_esta_hoy: string;
  puestos_por_construir: { nombre: string; mision: string; decide: string; por_que: string; cuando: "ahora" | "tres_meses" | "al_crecer" }[];
  riesgos_de_la_estructura: string[];
  orden_de_construccion: string;
};

const CUANDO: Record<string, { texto: string; color: string }> = {
  ahora: { texto: "Construir AHORA", color: "var(--contradicho)" },
  tres_meses: { texto: "Próximos 3 meses", color: "var(--caducado)" },
  al_crecer: { texto: "Al crecer", color: "var(--grafito)" },
};

/**
 * EL ESTUDIO DEL MOTOR (pedido de Kelin): qué quiere lograr esta empresa y qué estructura necesita
 * construir. Cada puesto propuesto se siembra en el organigrama con un clic — nace VACANTE, con su
 * misión, su decisión y su porqué ya escritos, y la Gerencia le pone nombre.
 */
export function EstudioOrganigrama({ companyId, estudio, fecha }: { companyId: string; estudio: EstudioIA | null; fecha: string | null }) {
  const router = useRouter();
  const [job, setJob] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [sembrados, setSembrados] = useState<Set<string>>(new Set());
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

  const sembrarPuesto = async (p: EstudioIA["puestos_por_construir"][number]) => {
    setOcupado(p.nombre);
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/organigrama`, { json: { nombre: p.nombre, mision: p.mision, decide: p.decide, por_que: p.por_que } });
      setSembrados((s) => new Set(s).add(p.nombre));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h2 className="t-seccion">El estudio: qué quiere y qué necesita construir</h2>
        <span className="no-imprimir flex items-center gap-3">
          {fecha && <span className="t-dato" style={{ color: "var(--grafito)" }}>estudiado el {fechaCorta(fecha)}</span>}
          <button className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }} onClick={generar} disabled={ocupado === "generar" || !!job}>
            {ocupado === "generar" ? "Encolando…" : estudio ? "Actualizar estudio" : "Generar estudio con lo levantado"}
          </button>
        </span>
      </div>
      <Progreso jobId={job} alTerminar={() => { setJob(null); router.refresh(); }} />
      {error && <p className="t-cuerpo mb-3" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}

      {!estudio ? (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          El motor lee el sueño del dueño, la ficha, la gente, los hallazgos y los procesos — y devuelve el estudio: a dónde quiere llegar esta empresa y qué puestos le faltan para lograrlo, con su porqué. Nada es inventado: cada puesto propuesto cita la evidencia que lo pide.
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

          {estudio.puestos_por_construir.length > 0 && (
            <div>
              <p className="t-etiqueta mb-3" style={{ color: "var(--marca)" }}>LA ESTRUCTURA QUE NECESITA CONSTRUIR</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {estudio.puestos_por_construir.map((p) => (
                  <article key={p.nombre} className="panel p-4" style={{ borderTop: `2.5px solid ${CUANDO[p.cuando]?.color ?? "var(--grafito)"}` }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="t-seccion" style={{ fontSize: 15 }}>{p.nombre}</p>
                      <span className="t-etiqueta" style={{ color: CUANDO[p.cuando]?.color }}>{CUANDO[p.cuando]?.texto}</span>
                    </div>
                    <p className="t-dato mt-2" style={{ color: "var(--grafito)" }}>{p.mision}</p>
                    <p className="t-dato mt-1" style={{ color: "var(--marca)" }}>Decide: {p.decide}</p>
                    <p className="t-dato mt-2">{p.por_que}</p>
                    <div className="no-imprimir mt-3">
                      {sembrados.has(p.nombre) ? (
                        <span className="t-dato" style={{ color: "var(--confirmado)", fontWeight: 600 }}>Agregado al organigrama como vacante — ponle nombre arriba.</span>
                      ) : (
                        <button className="boton boton--secundario" style={{ minHeight: 36, fontSize: 13.5 }} disabled={ocupado === p.nombre} onClick={() => sembrarPuesto(p)}>
                          {ocupado === p.nombre ? "Agregando…" : "Agregar al organigrama"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {estudio.riesgos_de_la_estructura.length > 0 && (
              <div className="panel p-5">
                <p className="t-etiqueta mb-2" style={{ color: "var(--contradicho)" }}>SI NO SE CONSTRUYE</p>
                <ul className="flex flex-col gap-2">
                  {estudio.riesgos_de_la_estructura.map((r, i) => (
                    <li key={i} className="t-dato">{r}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="panel p-5">
              <p className="t-etiqueta mb-2">EN QUÉ ORDEN</p>
              <p className="t-cuerpo">{estudio.orden_de_construccion}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
