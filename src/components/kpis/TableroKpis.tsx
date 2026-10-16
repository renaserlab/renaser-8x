"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import {
  ATRIBUTOS, IMPRESCINDIBLES, FRECUENCIA_TEXTO, TIPO_TEXTO, VALIDACION_TEXTO, PREPARACION_TEXTO, MIN_LETRAS_MOTIVO, TEXTO_FALTA_MOTIVO,
  nombreDePeriodoKpi, textoValor, textoValidacion, separarPorTipo, preparacion, motivoSuficiente,
  type Kpi, type Faltante, type Alerta, type Avance, type PropuestaKpi,
} from "@/lib/kpis";
import { FormularioKpi, type Participante, type AccionDelPlan, type LineaBase } from "./FormularioKpi";
import { RegistrarValor } from "./RegistrarValor";

export type KpiVista = Kpi & { completitud: Faltante[]; listo: boolean; alertas: Alerta[]; avance: Avance };
export type ValorHistoria = { indicador_id: string; periodo: string; valor: number; fuente: string | null; estado_validacion: string; created_at: string | null };

const COLOR_ALERTA: Record<Alerta["tipo"], string> = {
  umbral: "var(--contradicho)",
  desactualizado: "var(--caducado)",
  sin_linea_base: "var(--grafito)",
  meta_sin_plan: "var(--marca)",
};

const ALERTA_TEXTO: Record<Alerta["tipo"], string> = {
  umbral: "umbral cruzado",
  desactualizado: "dato viejo",
  sin_linea_base: "sin punto de partida",
  meta_sin_plan: "meta sin plan",
};

const ESTADO_TEXTO: Record<Kpi["estado"], string> = { propuesto: "propuesto", activo: "activo", archivado: "archivado" };

type Contexto = {
  companyId: string;
  participantes: Participante[];
  acciones: AccionDelPlan[];
  lineasBase: LineaBase[];
  historia: ValorHistoria[];
  /** Zona horaria de la empresa: decide qué periodo ya cerró al registrar un valor. */
  zona: string;
  horaCierre?: string | null;
  alError: (m: string | null) => void;
};

type Abierto = "nada" | "registrar" | "ajustar" | "historia";

/** Una fila del tablero. Lleva su propio estado: abrir la historia de una no cierra el registro de otra. */
function FilaKpi({ k, ctx }: { k: KpiVista; ctx: Contexto }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<Abierto>("nada");
  const responsable = k.responsable_participant_id ? ctx.participantes.find((p) => p.id === k.responsable_participant_id) : null;
  const accion = k.accion_asociada_id ? ctx.acciones.find((a) => a.id === k.accion_asociada_id) : null;
  const serie = ctx.historia.filter((v) => v.indicador_id === k.id).sort((a, b) => b.periodo.localeCompare(a.periodo));
  // Doce atributos, los de Dirección. La clasificación (ejecución o resultado) no es uno de ellos: va aparte.
  const completos = ATRIBUTOS.length - k.completitud.length;
  const etapa = preparacion(k);
  const alternar = (que: Abierto) => setAbierto((prev) => (prev === que ? "nada" : que));

  const cambiarEstado = async (estado: Kpi["estado"]) => {
    ctx.alError(null);
    let motivo = "";
    if (estado === "archivado") {
      const respuesta = prompt(`¿Por qué se archiva? Queda en el rastro (al menos ${MIN_LETRAS_MOTIVO} letras).`);
      if (respuesta === null) return; // se arrepintió: no se archiva
      if (!motivoSuficiente(respuesta)) {
        ctx.alError(TEXTO_FALTA_MOTIVO);
        return;
      }
      motivo = respuesta.trim();
    }
    try {
      await pedir(`/api/companies/${ctx.companyId}/kpis/${k.id}`, { method: "PATCH", json: { estado, ...(motivo ? { motivo } : {}) } });
      router.refresh();
    } catch (e) {
      ctx.alError(e instanceof Error ? e.message : "No se pudo.");
    }
  };

  const boton = { minHeight: 32, fontSize: 13 } as const;

  return (
    <li id={`indicador-${k.id}`} className="panel p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="t-cuerpo" style={{ fontWeight: 600 }}>{k.nombre}</p>
            <span className="t-etiqueta">{ESTADO_TEXTO[k.estado]}</span>
            <span className="t-etiqueta" style={{ textTransform: "none", letterSpacing: 0 }}>{k.clave}</span>
          </div>
          {k.definicion && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{k.definicion}</p>}
          {k.formula && <p className="t-dato mt-1" style={{ color: "var(--grafito)", fontSize: 12.5 }}>Cómo se calcula: {k.formula}</p>}
          <p className="t-dato mt-2" style={{ color: "var(--grafito)", fontSize: 12.5 }}>
            {FRECUENCIA_TEXTO[k.frecuencia]} · fuente: {k.fuente ?? <span style={{ color: "var(--contradicho)" }}>sin fuente</span>} · lo cuenta:{" "}
            {responsable ? `${responsable.nombre}${responsable.puesto ? ` (${responsable.puesto})` : ""}` : <span style={{ color: "var(--contradicho)" }}>nadie todavía</span>}
          </p>
        </div>
        <div style={{ textAlign: "right", flex: "none" }}>
          {k.valor_actual != null && k.valor_actual_periodo ? (
            <>
              <p style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{textoValor(k.unidad, k.valor_actual, k.moneda)}</p>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>
                {nombreDePeriodoKpi(k.valor_actual_periodo)} · {textoValidacion(k, { zona: ctx.zona, horaCierre: ctx.horaCierre })}
              </p>
            </>
          ) : (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>{k.estado_validacion === "sin_dato" ? "último periodo sin dato" : "sin valor registrado"}</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 mt-3 sm:grid-cols-3">
        <div>
          <div className="t-etiqueta">Punto de partida</div>
          <div className="t-dato">{k.linea_base_valor != null && k.linea_base_periodo ? `${textoValor(k.unidad, k.linea_base_valor, k.moneda)} · ${nombreDePeriodoKpi(k.linea_base_periodo)}` : "—"}</div>
          {k.linea_base_medicion_id && <div className="t-dato" style={{ fontSize: 12, color: "var(--grafito)" }}>de una versión exacta de la línea base</div>}
        </div>
        <div>
          <div className="t-etiqueta">Meta y plazo</div>
          <div className="t-dato">{k.meta_valor != null ? textoValor(k.unidad, k.meta_valor, k.moneda) : k.meta_texto ?? "—"}{k.meta_plazo ? ` · para ${k.meta_plazo}` : ""}</div>
          {k.meta_texto && k.meta_valor != null && <div className="t-dato" style={{ fontSize: 12, color: "var(--grafito)" }}>{k.meta_texto}</div>}
        </div>
        <div>
          <div className="t-etiqueta">Umbral y decisión</div>
          <div className="t-dato">{k.umbral_alerta != null && k.umbral_sentido ? `${k.umbral_sentido === "por_debajo" ? "si cae por debajo de" : "si pasa de"} ${textoValor(k.unidad, k.umbral_alerta, k.moneda)}` : "—"}</div>
          {(k.decision_asociada || accion) && <div className="t-dato" style={{ fontSize: 12, color: "var(--grafito)" }}>{accion ? `acción: ${accion.accion.slice(0, 70)}` : k.decision_asociada}</div>}
        </div>
      </div>

      {k.alertas.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1" aria-label="Alertas">
          {k.alertas.map((a) => (
            <li key={a.tipo} className="t-dato" style={{ color: COLOR_ALERTA[a.tipo] }}>
              <span className="t-etiqueta" style={{ color: "inherit" }}>{ALERTA_TEXTO[a.tipo]}</span> · {a.texto}
            </li>
          ))}
        </ul>
      )}

      <p className="t-dato mt-3" style={{ color: "var(--grafito)", fontSize: 12.5 }}>{k.avance.lectura}</p>

      <p className="t-dato mt-2" style={{ fontSize: 12.5, color: k.tipo_indicador ? "var(--grafito)" : "var(--contradicho)" }}>
        {k.tipo_indicador
          ? `Indicador ${TIPO_TEXTO[k.tipo_indicador]}.`
          : "Sin clasificar: falta decir si es de ejecución o de resultado. Hasta entonces, hacer tareas se confunde con mejorar."}
      </p>

      <details className="mt-2">
        <summary className="t-dato" style={{ cursor: "pointer", color: etapa === "listo" ? "var(--confirmado)" : "var(--caducado)" }}>
          {completos} de {ATRIBUTOS.length} atributos · {PREPARACION_TEXTO[etapa]}{k.completitud.length === 0 && !k.tipo_indicador ? ": falta clasificarlo" : ""}
        </summary>
        {k.completitud.length > 0 && (
          <ul className="mt-1" style={{ paddingLeft: 16 }}>
            {k.completitud.map((f) => (
              <li key={f.atributo} className="t-dato" style={{ fontSize: 12.5 }}>
                <strong style={IMPRESCINDIBLES.includes(f.atributo) ? { color: "var(--contradicho)" } : undefined}>{f.etiqueta}</strong>: {f.por_que}
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="flex gap-2 mt-3 flex-wrap">
        <button type="button" className="boton boton--secundario" style={boton} onClick={() => alternar("ajustar")}>Ajustar</button>
        {k.estado !== "archivado" && <button type="button" className="boton" style={boton} onClick={() => alternar("registrar")}>Registrar valor</button>}
        <button type="button" className="boton boton--secundario" style={boton} onClick={() => alternar("historia")}>Historia ({serie.length})</button>
        {k.estado === "propuesto" && <button type="button" className="boton boton--secundario" style={boton} onClick={() => cambiarEstado("activo")}>Activar</button>}
        {k.estado !== "archivado" && <button type="button" className="boton boton--secundario" style={boton} onClick={() => cambiarEstado("archivado")}>Archivar</button>}
        {k.estado === "archivado" && <button type="button" className="boton boton--secundario" style={boton} onClick={() => cambiarEstado("activo")}>Reactivar</button>}
      </div>

      {abierto === "registrar" && <RegistrarValor companyId={ctx.companyId} kpi={k} modo="consultor" zona={ctx.zona} horaCierre={ctx.horaCierre} alCerrar={() => setAbierto("nada")} />}
      {abierto === "ajustar" && (
        <FormularioKpi companyId={ctx.companyId} kpiId={k.id} inicial={k} participantes={ctx.participantes} acciones={ctx.acciones} lineasBase={ctx.lineasBase} zona={ctx.zona} horaCierre={ctx.horaCierre} alCerrar={() => setAbierto("nada")} />
      )}
      {abierto === "historia" && (
        <div className="mt-3">
          {serie.length === 0 ? (
            <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin valores registrados. Los periodos sin dato no aparecen aquí: no son cero.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr><th>Periodo</th><th>Valor</th><th>Qué tan comprobado</th><th>De dónde</th></tr>
              </thead>
              <tbody>
                {serie.map((v) => (
                  <tr key={v.periodo}>
                    <td className="t-dato">{nombreDePeriodoKpi(v.periodo)}</td>
                    <td className="t-dato">{textoValor(k.unidad, v.valor, k.moneda)}</td>
                    <td className="t-dato">{VALIDACION_TEXTO[v.estado_validacion as keyof typeof VALIDACION_TEXTO] ?? v.estado_validacion}</td>
                    <td className="t-dato" style={{ color: "var(--grafito)" }}>{v.fuente ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

function Grupo({ titulo, sub, lista, ctx }: { titulo: string; sub: string; lista: KpiVista[]; ctx: Contexto }) {
  return (
    <section className="mb-8">
      <h2 className="t-seccion mb-1">{titulo} ({lista.length})</h2>
      <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>{sub}</p>
      {lista.length === 0 ? (
        <p className="t-dato" style={{ color: "var(--grafito)" }}>Ninguno todavía.</p>
      ) : (
        <ul className="flex flex-col gap-3">{lista.map((k) => <FilaKpi key={k.id} k={k} ctx={ctx} />)}</ul>
      )}
    </section>
  );
}

/**
 * EL TABLERO DE INDICADORES DE LA CONSULTORA. Resultado y ejecución van en listas separadas, porque
 * cumplir tareas no es mejorar el negocio. Cada fila dice cuántos de los doce atributos tiene (y
 * cuáles faltan), su clasificación aparte, qué alerta, cuál es su último valor y qué tan comprobado está,
 * y cuánto avanzó desde su punto de partida. «Listo para contarse» solo se dice de uno al que no le falta
 * nada. Cada fila lleva `id="indicador-<id>"`: es a donde apuntan los enlaces de la revisión semanal.
 * Lo propuesto desde los nueve números se crea con un clic, siempre «propuesto».
 */
export function TableroKpis({
  companyId, kpis, historia, participantes, acciones, lineasBase, propuestas, zona, horaCierre,
}: {
  companyId: string;
  /** Zona horaria de la empresa (companies.zona_horaria). */
  zona: string;
  /** companies.hora_cierre: lo diario de hoy se anota desde esa hora. */
  horaCierre?: string | null;
  kpis: KpiVista[];
  historia: ValorHistoria[];
  participantes: Participante[];
  acciones: AccionDelPlan[];
  lineasBase: LineaBase[];
  propuestas: PropuestaKpi[];
}) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState(false);
  const [creandoPropuesta, setCreandoPropuesta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grupos = separarPorTipo(kpis);
  const conAlerta = kpis.filter((k) => k.alertas.length > 0);
  const ctx: Contexto = { companyId, participantes, acciones, lineasBase, historia, zona, horaCierre, alError: setError };

  const crearPropuesta = async (p: PropuestaKpi) => {
    setError(null);
    setCreandoPropuesta(p.kpi.clave);
    try {
      // company_id lo pone la ruta a partir de la URL; el resto viaja tal cual, rotulado propuesto y sin valor.
      const cuerpo: Record<string, unknown> = { ...p.kpi };
      delete cuerpo.company_id;
      await pedir(`/api/companies/${companyId}/kpis`, { method: "POST", json: cuerpo });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear.");
    } finally {
      setCreandoPropuesta(null);
    }
  };

  return (
    <>
      {error && <p className="t-cuerpo mb-3" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}

      {conAlerta.length > 0 && (
        <section className="panel p-4 mb-6" style={{ borderColor: "var(--caducado)" }}>
          <h2 className="t-seccion">{conAlerta.length} indicador(es) con alerta</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {conAlerta.map((k) => (
              <li key={k.id} className="t-dato">
                <strong>{k.nombre}</strong>: <span style={{ color: COLOR_ALERTA[k.alertas[0]!.tipo] }}>{k.alertas[0]!.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        <button type="button" className="boton" onClick={() => setNuevo((v) => !v)}>Nuevo indicador</button>
      </div>
      {nuevo && <FormularioKpi companyId={companyId} participantes={participantes} acciones={acciones} lineasBase={lineasBase} zona={zona} horaCierre={horaCierre} alCerrar={() => setNuevo(false)} />}

      <Grupo titulo="De resultado" sub={`Qué cambió en el negocio. Indicador ${TIPO_TEXTO.resultado}.`} lista={grupos.resultado} ctx={ctx} />
      <Grupo titulo="De ejecución" sub={`Qué se hizo. Indicador ${TIPO_TEXTO.ejecucion}. Cumplirlos no es mejora financiera: eso lo dicen los de resultado.`} lista={grupos.ejecucion} ctx={ctx} />
      {grupos.sin_clasificar.length > 0 && (
        <Grupo titulo="Sin clasificar" sub="Falta decir si son de ejecución o de resultado. Hasta entonces no se suman a ninguna lista." lista={grupos.sin_clasificar} ctx={ctx} />
      )}

      {propuestas.length > 0 && (
        <section className="mb-8">
          <h2 className="t-seccion mb-1">Propuestos desde los nueve números ({propuestas.length})</h2>
          <p className="t-dato mb-3" style={{ color: "var(--grafito)" }}>
            Indicadores de resultado que salen de los números que la empresa ya tiene. Se crean «propuestos» y sin valor: el valor de referencia se muestra, no se registra.
          </p>
          <ul className="flex flex-col gap-2">
            {propuestas.map((p) => (
              <li key={p.kpi.clave} className="panel p-3 flex items-center justify-between gap-3 flex-wrap">
                <div style={{ minWidth: 0 }}>
                  <p className="t-dato" style={{ fontWeight: 600 }}>{p.kpi.nombre} <span className="t-etiqueta">{p.rotulo}</span></p>
                  <p className="t-dato" style={{ color: "var(--grafito)", fontSize: 12.5 }}>
                    Referencia: {textoValor(p.kpi.unidad, p.referencia.valor, p.kpi.moneda)} · {nombreDePeriodoKpi(p.referencia.periodo)} · {p.referencia.etiqueta}
                  </p>
                </div>
                <button type="button" className="boton boton--secundario" style={{ minHeight: 32, fontSize: 13 }} disabled={creandoPropuesta === p.kpi.clave} onClick={() => crearPropuesta(p)}>
                  {creandoPropuesta === p.kpi.clave ? "Creando" : "Crear como propuesto"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
