"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { Progreso } from "@/components/base/Progreso";
import { fechaCorta } from "@/lib/textos";

export type ModeloAR = {
  el_rubro_en_su_mejor_version: string;
  estandares_de_servicio: { estandar: string; meta: string; origen: "practica_de_industria" | "norma_verificar_asesoria" }[];
  estructura_tipo: { puesto: string; mision: string }[];
  procesos_imprescindibles: { nombre: string; por_que: string; detalle_minimo: string; la_empresa_lo_tiene: "si" | "parcial" | "no" | "sin_dato" }[];
  numeros_de_clase_mundial: { nombre: string; como_se_mide: string; meta_referencia: string }[];
  normativa: { obligacion: string; detalle: string }[];
  las_tres_brechas_mayores: string[];
};

const TIENE: Record<string, { texto: string; color: string }> = {
  si: { texto: "lo tiene", color: "var(--confirmado)" },
  parcial: { texto: "a medias", color: "var(--caducado)" },
  no: { texto: "no lo tiene", color: "var(--contradicho)" },
  sin_dato: { texto: "sin dato", color: "var(--grafito)" },
};

/**
 * LA TERCERA VISTA (pedido de Kelin): ES → QUIERE → DEBE SER. Aquí la consultora declara cómo
 * quiere que sea la empresa, y el Investigador construye la vara del rubro: estándares, estructura
 * tipo, procesos imprescindibles con su detalle mínimo, números de clase mundial y normativa.
 * Referencia de industria, siempre separada de la evidencia de la empresa.
 */
export function DebeSer({ companyId, sueno, aspiracion, modelo, fecha }: { companyId: string; sueno: string | null; aspiracion: string | null; modelo: ModeloAR | null; fecha: string | null }) {
  const router = useRouter();
  const [texto, setTexto] = useState(aspiracion ?? "");
  const [editando, setEditando] = useState(!aspiracion);
  const [job, setJob] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guardarAspiracion = async () => {
    if (!texto.trim()) return;
    setOcupado("aspiracion");
    setError(null);
    try {
      await pedir(`/api/companies/${companyId}/modelo`, { method: "PATCH", json: { aspiracion: texto.trim() } });
      setEditando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(null);
    }
  };

  const generar = async () => {
    setOcupado("generar");
    setError(null);
    try {
      const r = await pedir<{ job_id: string }>(`/api/companies/${companyId}/modelo`, { json: {} });
      setJob(r.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <>
      {/* LOS DOS PRIMEROS LENTES: lo que el dueño sueña y lo que la consultoría declara. */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className="panel p-5">
          <p className="t-etiqueta mb-2">LO QUE EL DUEÑO QUIERE (de su propia voz)</p>
          <p className="t-cuerpo">{sueno ?? "Aún no declara su meta en la conversación — es el primer dato por levantar."}</p>
        </div>
        <div className="panel p-5" style={{ borderTop: "2.5px solid var(--marca)" }}>
          <p className="t-etiqueta mb-2" style={{ color: "var(--marca)" }}>CÓMO QUEREMOS QUE SEA (tu declaración de diseño)</p>
          {editando ? (
            <div className="flex flex-col gap-3">
              <textarea className="campo" rows={4} aria-label="Cómo queremos que sea" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="La ambición dirigida: «una casa de cambio con estándar de entidad financiera: atención A1 en 3 minutos, caja impecable, cumplimiento al día, y el dueño fuera de la operación en 12 meses»" />
              <div className="flex gap-3">
                <button className="boton" onClick={guardarAspiracion} disabled={ocupado === "aspiracion" || !texto.trim()}>{ocupado === "aspiracion" ? "Guardando…" : "Guardar"}</button>
                {aspiracion && <button className="boton boton--secundario" onClick={() => { setTexto(aspiracion); setEditando(false); }}>Cancelar</button>}
              </div>
            </div>
          ) : (
            <>
              <p className="t-cuerpo">{aspiracion}</p>
              <button type="button" className="t-dato mt-2 no-imprimir" style={{ background: "none", border: "none", cursor: "pointer", font: "inherit", textDecoration: "underline", color: "var(--marca)", padding: 0 }} onClick={() => setEditando(true)}>Corregir</button>
            </>
          )}
        </div>
      </div>

      {/* EL TERCER LENTE: la vara del rubro. */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
        <h2 className="t-seccion">El modelo de alto rendimiento del rubro</h2>
        <span className="no-imprimir flex items-center gap-3">
          {fecha && <span className="t-dato" style={{ color: "var(--grafito)" }}>vigente del {fechaCorta(fecha)}</span>}
          <button className="boton boton--secundario" style={{ minHeight: 38, fontSize: 14 }} onClick={generar} disabled={ocupado === "generar" || !!job}>
            {ocupado === "generar" ? "Encolando…" : modelo ? "Nueva versión del modelo" : "Investigar el rubro"}
          </button>
        </span>
      </div>
      <Progreso jobId={job} alTerminar={() => { setJob(null); router.refresh(); }} />
      {error && <p className="t-cuerpo mb-3" role="alert" style={{ color: "var(--contradicho)" }}>{error}</p>}

      {!modelo ? (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          El Investigador construye la vara: cómo opera este mismo negocio en manos de los mejores — estándares de servicio, estructura tipo, los procesos imprescindibles con su detalle mínimo, los números de clase mundial y la normativa (sin cifras inventadas: lo legal se cierra con asesoría). Contra esa vara se diseña toda la empresa.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <p className="t-cuerpo medida">{modelo.el_rubro_en_su_mejor_version}</p>

          <div className="panel p-5" style={{ borderTop: "2.5px solid var(--contradicho)" }}>
            <p className="t-etiqueta mb-2" style={{ color: "var(--contradicho)" }}>LAS BRECHAS MAYORES DE ESTA EMPRESA FRENTE AL MODELO</p>
            {modelo.las_tres_brechas_mayores.map((b, i) => <p key={i} className="t-cuerpo mt-1">{i + 1}. {b}</p>)}
          </div>

          <div>
            <p className="t-etiqueta mb-2" style={{ color: "var(--marca)" }}>LOS PROCESOS IMPRESCINDIBLES DEL RUBRO — Y SI ESTA EMPRESA LOS TIENE</p>
            <table className="tabla">
              <thead><tr><th>Proceso</th><th>Qué protege o produce</th><th>Detalle mínimo para ser estándar</th><th>Aquí</th></tr></thead>
              <tbody>
                {modelo.procesos_imprescindibles.map((p) => (
                  <tr key={p.nombre}>
                    <td className="t-dato" style={{ fontWeight: 600 }}>{p.nombre}</td>
                    <td className="t-dato" style={{ color: "var(--grafito)" }}>{p.por_que}</td>
                    <td className="t-dato" style={{ color: "var(--grafito)" }}>{p.detalle_minimo}</td>
                    <td className="t-dato" style={{ color: TIENE[p.la_empresa_lo_tiene].color, whiteSpace: "nowrap" }}>{TIENE[p.la_empresa_lo_tiene].texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <p className="t-etiqueta mb-2">ESTÁNDARES DE SERVICIO DEL RUBRO</p>
              {modelo.estandares_de_servicio.map((e, i) => (
                <p key={i} className="t-dato mt-1"><b>{e.estandar}</b> — {e.meta} <span style={{ color: e.origen === "norma_verificar_asesoria" ? "var(--caducado)" : "var(--grafito)" }}>({e.origen === "norma_verificar_asesoria" ? "norma: verificar con asesoría" : "práctica de industria"})</span></p>
              ))}
            </div>
            <div className="panel p-5">
              <p className="t-etiqueta mb-2">NÚMEROS DE CLASE MUNDIAL</p>
              {modelo.numeros_de_clase_mundial.map((n, i) => (
                <p key={i} className="t-dato mt-1"><b>{n.nombre}</b>: {n.meta_referencia} <span style={{ color: "var(--grafito)" }}>— {n.como_se_mide}</span></p>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-5">
              <p className="t-etiqueta mb-2">LA ESTRUCTURA TIPO DEL RUBRO A ESTE TAMAÑO</p>
              {modelo.estructura_tipo.map((p, i) => (
                <p key={i} className="t-dato mt-1"><b>{p.puesto}</b> <span style={{ color: "var(--grafito)" }}>— {p.mision}</span></p>
              ))}
              <p className="t-dato mt-3" style={{ color: "var(--grafito)" }}>El diseño fino vive en la pestaña Organigrama: el estudio de dos opciones usa esta vara.</p>
            </div>
            <div className="panel p-5">
              <p className="t-etiqueta mb-2" style={{ color: "var(--caducado)" }}>NORMATIVA DEL RUBRO — SIEMPRE CON ASESORÍA</p>
              {modelo.normativa.map((n, i) => (
                <p key={i} className="t-dato mt-1"><b>{n.obligacion}</b> <span style={{ color: "var(--grafito)" }}>— {n.detalle}</span></p>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
