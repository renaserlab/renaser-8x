"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { fechaDia } from "@/lib/medicion";
import { ESTADO_CONSULTOR } from "@/lib/plan-reglas";
import { nombreDePeriodoKpi } from "@/lib/kpis";
import {
  DESVIO_TEXTO, nombreDeSemana, sumarDias, diaEnZona, escritoDe, camposEditados, cuerpoDeGuardado, conPropuesta,
  type Revision, type Esperado, type Desvio, type TipoDesvio, type Escrito, type CampoEscrito,
} from "@/lib/revision-semanal";

const COLOR_DESVIO: Record<TipoDesvio, string> = {
  retraso: "var(--contradicho)",
  datos_desactualizados: "var(--caducado)",
  sin_responsable: "var(--contradicho)",
  metas_sin_plan: "var(--marca)",
  verificaciones_pendientes: "var(--caducado)",
};

const MARCA: Record<"si" | "tarde" | "no" | "aun", { texto: string; color: string }> = {
  si: { texto: "ocurrió", color: "var(--confirmado)" },
  tarde: { texto: "ocurrió con retraso", color: "var(--caducado)" },
  no: { texto: "no ocurrió", color: "var(--contradicho)" },
  aun: { texto: "todavía no se juzga", color: "var(--grafito)" },
};

/**
 * Hecha no es «a tiempo»: si se reportó después de vencer, la marca lo dice. Lo dice en la fila que vencía: lo
 * tardío fue el reporte frente a la fecha comprometida, no el arranque, y la fila «Empieza» no lo hereda.
 */
function marcaDe(x: Esperado) {
  if (x.cumplido === true) return x.tipo === "accion_vence" && x.plazo === "con_retraso" ? MARCA.tarde : MARCA.si;
  return x.cumplido === false ? MARCA.no : MARCA.aun;
}

const NOMBRE_CAMPO: Record<CampoEscrito, string> = { explicacion: "la explicación", decision_necesaria: "la decisión", siguiente: "qué sigue" };

/** Cada pregunta de la revisión es una sección numerada: el orden es parte del método. */
function Pregunta({ n, titulo, nota, children }: { n: number; titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <div className="flex items-baseline gap-3">
        <span className="num-grande" style={{ fontSize: 22, color: "var(--marca)", lineHeight: 1 }}>{n}</span>
        <h2 className="t-seccion">{titulo}</h2>
      </div>
      {nota && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FilaEsperado({ x, companyId }: { x: Esperado; companyId: string }) {
  const m = marcaDe(x);
  const enlace = x.clase === "accion" ? `/empresa/${companyId}/plan#accion-${x.id}` : `/empresa/${companyId}/kpis#indicador-${x.id}`;
  return (
    <li className="t-dato flex flex-wrap items-baseline gap-2" style={{ borderLeft: `2px solid ${m.color}`, paddingLeft: 10 }}>
      <span style={{ color: m.color, minWidth: 110 }}>{m.texto}</span>
      <span>
        {x.tipo === "accion_empieza" ? "Empieza" : x.tipo === "accion_vence" ? "Vence" : "Anotar"} <Link href={enlace}>«{x.titulo}»</Link>
        {x.responsable ? ` · ${x.responsable}` : x.clase === "accion" ? " · sin responsable" : ""}
        {x.estado ? ` · ${ESTADO_CONSULTOR[x.estado].toLowerCase()}` : ""}
      </span>
      <span style={{ color: "var(--grafito)" }}>{x.detalle}</span>
    </li>
  );
}

function FilaDesvio({ d }: { d: Desvio }) {
  return (
    <li className="panel p-3" style={{ borderLeft: `3px solid ${COLOR_DESVIO[d.tipo]}` }}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="t-etiqueta" style={{ color: COLOR_DESVIO[d.tipo] }}>{DESVIO_TEXTO[d.tipo]}</span>
        <Link href={d.enlace} className="t-dato" style={{ fontWeight: 600 }}>«{d.titulo}»</Link>
      </div>
      <p className="t-dato mt-1">{d.detalle}</p>
      <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
        <span className="t-etiqueta">DECISIÓN PROPUESTA</span> {d.decision_propuesta}
      </p>
    </li>
  );
}

/**
 * LO QUE PROPONE EL SISTEMA, APARTE DE LO QUE DECIDE LA CONSULTORA. Se lee como sugerencia y solo entra en su
 * caja si ella pulsa «Usar esta propuesta». Mientras no lo haga, no es de nadie y no se guarda.
 */
function Propuesta({ etiqueta, usable, yaEnLaCaja, alUsar, children }: { etiqueta: string; usable: boolean; yaEnLaCaja: boolean; alUsar: () => void; children: React.ReactNode }) {
  return (
    <div className="p-3 mb-3" style={{ background: "var(--suave)", borderLeft: "3px solid var(--grafito)" }}>
      <p className="t-etiqueta" style={{ color: "var(--grafito)" }}>{etiqueta}</p>
      <div className="t-dato mt-1" style={{ color: "var(--grafito)" }}>{children}</div>
      {usable && (
        <button
          type="button"
          className="boton boton--secundario mt-2 no-imprimir"
          style={{ minHeight: 34, fontSize: 13 }}
          disabled={yaEnLaCaja}
          title={yaEnLaCaja ? "Ya está en tu caja." : "La copia a tu caja para que la corrijas. No se guarda hasta que pulses Guardar."}
          onClick={alUsar}
        >
          Usar esta propuesta
        </button>
      )}
    </div>
  );
}

type Props = {
  companyId: string;
  revision: Revision;
  /** Nombre de quien la marcó como revisada, si se pudo leer. */
  revisadaPor: string | null;
  /** El día en que se marcó, ya escrito para leer; null si no quedó la fecha. */
  revisadaEl: string | null;
  /** El lunes de la semana que terminó: la que se abre por defecto. */
  semanaQueTermino: string;
  /** El lunes de la semana que está corriendo para la empresa. */
  semanaEnCurso: string;
};

/**
 * LA REVISIÓN SEMANAL VISTA POR LA CONSULTORA: las siete preguntas en orden, el selector de semana, cada desvío
 * con su enlace y su decisión propuesta, y los tres textos que le toca escribir.
 *
 * LAS CAJAS NO PONEN PALABRAS EN BOCA DE NADIE. Nacen con lo que la consultora ya escribió para esa semana, o
 * vacías; la propuesta del sistema se muestra aparte y solo entra con «Usar esta propuesta». «Guardar» manda
 * únicamente los campos que ella editó: guardar la explicación no escribe ninguna decisión. «Marcar revisada»
 * exige la explicación y se ofrece solo mientras nadie la haya marcado: la primera marca se conserva, y en una
 * semana ya revisada «Guardar» corrige los textos sin cambiar quién la revisó. Lo derivado se recalcula al abrir
 * la página; lo escrito se guarda y no se pisa.
 *
 * SOLO SE MARCA UNA SEMANA QUE TERMINÓ. En la semana que corre (o en una futura) el botón no se ofrece: se dice
 * desde qué día se podrá. La ruta responde 409 si alguien lo pide igual. «Guardar» sigue ahí: los textos se
 * pueden ir escribiendo durante la semana.
 */
export function RevisionSemanal({ companyId, revision, revisadaPor, revisadaEl, semanaQueTermino, semanaEnCurso }: Props) {
  const router = useRouter();
  // Lo guardado y lo que hay en las cajas: la diferencia entre los dos es lo único que viaja al guardar.
  const [guardado, setGuardado] = useState<Escrito>(() => escritoDe(revision));
  const [escrito, setEscrito] = useState<Escrito>(() => escritoDe(revision));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const editar = (campo: CampoEscrito, valor: string) => setEscrito((e) => ({ ...e, [campo]: valor }));
  const editados = camposEditados(guardado, escrito);

  const anterior = sumarDias(revision.semana, -7);
  const posterior = sumarDias(revision.semana, 7);
  const base = `/empresa/${companyId}/revision`;
  const diaDeInstante = (iso: string | null) => fechaDia(diaEnZona(iso, revision.zona));

  const enviar = async (marcar: boolean) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    const enviado = escrito;
    try {
      const res = await pedir<{ revision: Revision; aviso?: string | null }>(`/api/companies/${companyId}/revision`, {
        json: cuerpoDeGuardado(revision.semana, guardado, escrito, marcar),
      });
      // Las cajas quedan con lo que de verdad está guardado, no con lo que se creyó mandar. Lo que la consultora
      // siguió escribiendo mientras se guardaba no se pisa: sigue en su caja, como cambio sin guardar.
      const ahora = escritoDe(res.revision);
      setGuardado(ahora);
      setEscrito((actual) => ({
        explicacion: actual.explicacion === enviado.explicacion ? ahora.explicacion : actual.explicacion,
        decision_necesaria: actual.decision_necesaria === enviado.decision_necesaria ? ahora.decision_necesaria : actual.decision_necesaria,
        siguiente: actual.siguiente === enviado.siguiente ? ahora.siguiente : actual.siguiente,
      }));
      // Si el servidor tiene algo que decir de la marca (ya estaba puesta, o quedó sin fecha), eso es lo que se lee.
      setAviso(res.aviso ?? (marcar ? "Semana marcada como revisada." : editados.length ? "Guardado." : "No cambiaste ningún texto: se guardó la foto de la semana tal como está hoy."));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  };

  // La semana que corre para la empresa (y cualquiera posterior) todavía no terminó: no se marca como revisada.
  const terminada = revision.semana < semanaEnCurso;
  const noOcurrio = revision.que_debia_ocurrir.filter((x) => x.cumplido === false).length;
  const hayDesvios = revision.desvios.length > 0;
  const hayProximas = revision.siguiente_propuesto.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de semana */}
      <nav className="flex flex-wrap items-center gap-3 no-imprimir" aria-label="Semana">
        <Link href={`${base}?semana=${anterior}`} className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }}>← Semana anterior</Link>
        <span className="t-dato" style={{ fontWeight: 600 }}>{nombreDeSemana(revision.semana)}</span>
        {posterior <= semanaEnCurso && (
          <Link href={`${base}?semana=${posterior}`} className="boton boton--secundario" style={{ minHeight: 34, fontSize: 13 }}>Semana siguiente →</Link>
        )}
        {revision.semana !== semanaQueTermino && <Link href={base} className="t-dato" style={{ color: "var(--grafito)", textDecoration: "underline" }}>Volver a la semana que terminó</Link>}
        <span className="t-dato" style={{ color: "var(--grafito)", marginLeft: "auto" }}>
          {revision.revisada ? `Revisada${revisadaPor ? ` por ${revisadaPor}` : ""}${revisadaEl ? ` el ${revisadaEl}` : ""}` : `Se juzga hasta el ${fechaDia(revision.referencia)}`}
        </span>
      </nav>

      {revision.semana >= semanaEnCurso && (
        <p className="t-dato panel p-3" style={{ borderLeft: "3px solid var(--caducado)", color: "var(--grafito)" }}>
          Esta semana todavía no terminó: lo que aún no vence no se juzga. La que toca revisar es la que terminó.
        </p>
      )}

      {/* Lo que la revisión puede decir del resultado: nunca sale de las tareas */}
      <p className="t-dato panel p-3" style={{ borderLeft: "3px solid var(--marca)", color: "var(--grafito)" }}>
        <span className="t-etiqueta">RESULTADO EMPRESARIAL</span> {revision.resultado.texto}
      </p>

      {revision.vacia && (
        <p className="t-cuerpo panel p-4" style={{ background: "var(--suave)" }}>
          Esta empresa todavía no tiene acciones ni indicadores: no hay semana que revisar. Aprueba una acción en el plan o activa un indicador y la revisión se arma sola.
        </p>
      )}

      <Pregunta n={1} titulo="¿Qué debía ocurrir?" nota="Acciones que empezaban o vencían esta semana e indicadores cuyo periodo cerró. Lo que no tiene dato es «sin dato», no cero. De lo ya hecho se dice si fue dentro del plazo, con retraso o sin fecha comprometida.">
        {revision.que_debia_ocurrir.length === 0 ? (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>Nada con fecha esta semana.</p>
        ) : (
          <ul className="lista-editorial flex flex-col gap-2">
            {revision.que_debia_ocurrir.map((x) => <FilaEsperado key={`${x.tipo}-${x.id}`} x={x} companyId={companyId} />)}
          </ul>
        )}
        {noOcurrio > 0 && <p className="t-dato mt-2" style={{ color: "var(--contradicho)" }}>{noOcurrio} de {revision.que_debia_ocurrir.length} no ocurrió al día de referencia.</p>}
      </Pregunta>

      <Pregunta n={2} titulo="¿Qué ocurrió?" nota="Decisiones y movimientos del plan registrados en la semana, y valores anotados. Una acción terminada no es un resultado.">
        {revision.que_ocurrio.length === 0 ? (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>No quedó registrado ningún movimiento ni valor esta semana.</p>
        ) : (
          <ul className="lista-editorial flex flex-col gap-1">
            {revision.que_ocurrio.map((o, i) => (
              <li key={`${o.tipo}-${o.id}-${i}`} className="t-dato">
                <span style={{ color: "var(--grafito)" }}>{diaDeInstante(o.fecha)} · </span>{o.texto}
              </li>
            ))}
          </ul>
        )}
      </Pregunta>

      <Pregunta n={3} titulo="¿Con qué evidencia?" nota="Pruebas ligadas a las acciones de esta semana. Reportado sin prueba no es verificado.">
        {revision.evidencia.length === 0 ? (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin pruebas ligadas a las acciones de la semana.</p>
        ) : (
          <ul className="lista-editorial flex flex-col gap-1">
            {revision.evidencia.map((ev) => (
              <li key={ev.id} className="t-dato">
                <span style={{ color: "var(--grafito)" }}>{diaDeInstante(ev.fecha)} · </span>{ev.tipo}{ev.nombre ? ` «${ev.nombre}»` : ""} para «{ev.accion}»{ev.nota ? ` — ${ev.nota}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Pregunta>

      <Pregunta n={4} titulo="¿Qué se desvió?" nota="Retrasos, datos viejos, acciones sin responsable, metas sin plan y verificaciones pendientes. Cada uno dice qué decisión exige.">
        {!hayDesvios ? (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin desvíos detectados en lo registrado.</p>
        ) : (
          <ul className="flex flex-col gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {revision.desvios.map((d) => <FilaDesvio key={`${d.tipo}-${d.id}`} d={d} />)}
          </ul>
        )}
      </Pregunta>

      <Pregunta n={5} titulo="¿Por qué?" nota="La explicación la escribe la consultora. Hasta entonces queda en blanco: el sistema no inventa causas.">
        <textarea className="campo" rows={4} value={escrito.explicacion} onChange={(e) => editar("explicacion", e.target.value)} placeholder="Qué pasó y por qué, con lo que se sabe. Si no se sabe, decirlo." aria-label="Explicación" style={{ width: "100%" }} />
      </Pregunta>

      <Pregunta n={6} titulo="¿Qué decisión hace falta?" nota="Arriba, lo que el sistema propone a partir de los desvíos. Abajo, tu decisión: queda en blanco hasta que la escribas o tomes la propuesta. Lo que no está en tu caja no se guarda como decisión.">
        <Propuesta
          etiqueta="PROPUESTA DEL SISTEMA · NO ES UNA DECISIÓN TOMADA"
          usable={hayDesvios}
          yaEnLaCaja={escrito.decision_necesaria.includes(revision.decision_propuesta.trim())}
          alUsar={() => editar("decision_necesaria", conPropuesta(escrito.decision_necesaria, revision.decision_propuesta))}
        >
          <p style={{ whiteSpace: "pre-wrap" }}>{revision.decision_propuesta}</p>
        </Propuesta>
        <label className="t-etiqueta" htmlFor="revision-decision">TU DECISIÓN</label>
        <textarea id="revision-decision" aria-label="Tu decisión" className="campo mt-1" rows={4} value={escrito.decision_necesaria} onChange={(e) => editar("decision_necesaria", e.target.value)} placeholder="La decisión que tomas tú. En blanco, no hay decisión registrada para esta semana." style={{ width: "100%" }} />
      </Pregunta>

      <Pregunta n={7} titulo="¿Qué sigue?" nota={`Arriba, lo que el plan pide para la ${nombreDeSemana(posterior).toLowerCase()}. Abajo, lo que tú dejas dicho: en blanco hasta que lo escribas o tomes la propuesta.`}>
        <Propuesta
          etiqueta="LO QUE PIDE EL PLAN · PROPUESTA DEL SISTEMA"
          usable={hayProximas}
          yaEnLaCaja={escrito.siguiente.includes(revision.siguiente_texto.trim())}
          alUsar={() => editar("siguiente", conPropuesta(escrito.siguiente, revision.siguiente_texto))}
        >
          {hayProximas ? (
            <ul className="lista-editorial flex flex-col gap-1">
              {revision.siguiente_propuesto.map((x) => (
                <li key={`${x.tipo}-${x.id}`}>
                  {x.tipo === "accion_empieza" ? "Empieza" : "Vence"} <Link href={`/empresa/${companyId}/plan#accion-${x.id}`}>«{x.titulo}»</Link>{x.responsable ? ` · ${x.responsable}` : " · sin responsable"} · {x.fecha ? fechaDia(x.fecha) : ""}
                  {x.periodos?.length ? ` · ${x.periodos.map(nombreDePeriodoKpi).join(", ")}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>{revision.siguiente_texto}</p>
          )}
        </Propuesta>
        <label className="t-etiqueta" htmlFor="revision-siguiente">LO QUE DEJAS DICHO</label>
        <textarea id="revision-siguiente" aria-label="Lo que dejas dicho para la semana que viene" className="campo mt-1" rows={3} value={escrito.siguiente} onChange={(e) => editar("siguiente", e.target.value)} placeholder="Lo que acuerdas para la semana que viene. La empresa lo lee en «Esta semana»." style={{ width: "100%" }} />
      </Pregunta>

      <div className="flex flex-wrap items-center gap-3 no-imprimir">
        <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => enviar(false)}>Guardar</button>
        {revision.revisada ? (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>
            Ya está marcada como revisada{revisadaPor ? ` por ${revisadaPor}` : ""}: esa marca se conserva. «Guardar» corrige los textos.
          </p>
        ) : !terminada ? (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>
            Se podrá marcar como revisada desde el {fechaDia(posterior)}, cuando la semana termine. «Guardar» sí guarda lo que escribas.
          </p>
        ) : (
          <button type="button" className="boton" disabled={ocupado || !escrito.explicacion.trim()} title={!escrito.explicacion.trim() ? "Escribe la explicación antes de marcarla revisada." : undefined} onClick={() => enviar(true)}>
            Marcar revisada
          </button>
        )}
        {editados.length > 0 && !ocupado && <p className="t-dato" style={{ color: "var(--grafito)" }}>Sin guardar: {editados.map((c) => NOMBRE_CAMPO[c]).join(", ")}.</p>}
        {error && <p className="t-dato" style={{ color: "var(--contradicho)" }} role="alert">{error}</p>}
        {aviso && <p className="t-dato" style={{ color: "var(--confirmado)" }} role="status">{aviso}</p>}
      </div>
    </div>
  );
}
