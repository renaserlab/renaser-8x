import { supabaseAdmin } from "@/lib/supabase/admin";
import { BotonJob } from "@/components/consultor/BotonJob";
import { BotonImprimir } from "@/components/base/BotonImprimir";
import type { SalidaPlanEstrategico } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const TEND: Record<string, string> = { sube: "▲ sube", baja: "▼ baja", estable: "— estable", sin_dato: "sin dato" };
const TEND_COLOR: Record<string, string> = { sube: "var(--confirmado)", baja: "var(--contradicho)", estable: "var(--grafito)", sin_dato: "var(--caducado)" };
const ESTADO_CANVAS: Record<string, { t: string; c: string }> = { comprobado: { t: "comprobado", c: "var(--confirmado)" }, por_validar: { t: "por validar", c: "var(--caducado)" }, contradicho: { t: "contradicho", c: "var(--contradicho)" } };

function Hoja({ n, titulo, children }: { n?: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="hoja-plan">
      <p className="t-etiqueta" style={{ color: "var(--marca)", marginBottom: 6 }}>{n ? `${String(n).padStart(2, "0")} · ` : ""}{titulo}</p>
      {children}
    </section>
  );
}
const Th = ({ c }: { c: string }) => <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--grafito)", borderBottom: "1.5px solid var(--tinta)" }}>{c}</th>;
const Td = ({ c, b }: { c: React.ReactNode; b?: boolean }) => <td style={{ padding: "9px 10px", borderBottom: "1px solid var(--linea)", fontWeight: b ? 600 : 400, verticalAlign: "top" }}>{c}</td>;

/** EL PLAN ESTRATÉGICO — 15 secciones, estándar de firma top. Imprimir = el PDF. */
export default async function PlanEstrategico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: c }, { data: docs }] = await Promise.all([
    sb.from("companies").select("nombre,sector").eq("id", id).single(),
    sb.from("deliverables").select("contenido,version,created_at").eq("company_id", id).eq("tipo", "plan_estrategico").order("version", { ascending: false }).limit(1),
  ]);
  const doc = docs?.[0];
  const p = doc?.contenido as SalidaPlanEstrategico | undefined;

  return (
    <>
      <style>{`
        .doc-plan { max-width: 880px; margin: 0 auto; font-size: 15px; }
        .hoja-plan { padding: 34px 0; border-bottom: 1px solid var(--linea); }
        .hoja-plan h2 { font-family: var(--font-doc); font-size: 26px; font-weight: 700; margin: 0 0 14px; letter-spacing: -0.01em; }
        .hoja-plan table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .celda-caja { border: 1.5px solid var(--tinta); padding: 14px 16px; }
        @media print {
          .hoja-plan { page-break-after: always; border-bottom: none; padding: 0 0 20px; }
          .doc-plan { font-size: 12.5pt; max-width: none; }
          @page { margin: 16mm; }
        }
      `}</style>

      <div className="no-imprimir flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="t-seccion">Plan estratégico</h1>
        <div className="flex gap-3 items-center">
          {p && <BotonImprimir texto="Descargar PDF (imprimir)" />}
          <BotonJob url={`/api/companies/${id}/plan-estrategico`} texto={p ? "Re-redactar con lo último" : "Redactar el plan estratégico"} secundario={!!p} />
        </div>
      </div>

      {!p ? (
        <p className="t-cuerpo medida" style={{ color: "var(--grafito)" }}>
          Aún no se redacta. Necesita el diagnóstico corrido: el estratega escribe SOLO con la evidencia de la empresa
          y marca lo no probado como «por validar». Pulsa el botón y recarga en un par de minutos.
        </p>
      ) : (
        <article className="doc-plan t-doc">
          {/* 1 · PORTADA */}
          <section className="hoja-plan" style={{ minHeight: 420, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <p className="t-etiqueta" style={{ letterSpacing: "0.16em" }}>RENASER · CONSULTORÍA EMPRESARIAL</p>
              <h2 style={{ fontSize: "clamp(34px, 5vw, 48px)", marginTop: 60 }}>Plan estratégico<br />{c?.nombre}</h2>
              <p className="t-cuerpo" style={{ color: "var(--grafito)", maxWidth: "56ch", marginTop: 10 }}>{p.desafio}</p>
            </div>
            <div className="flex flex-wrap gap-8" style={{ fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--grafito)" }}>
              <span>Periodo: <strong style={{ color: "var(--tinta)" }}>{p.periodo}</strong></span>
              <span>Versión {doc?.version} · {String(doc?.created_at).slice(0, 10)}</span>
            </div>
          </section>

          {/* 2 · RESUMEN EJECUTIVO */}
          <Hoja n={2} titulo="Resumen ejecutivo">
            <div className="celda-caja" style={{ borderWidth: 2 }}>
              <p className="t-etiqueta mb-1">Decisión estratégica</p>
              <p style={{ fontSize: 19, fontWeight: 600 }}>Pasar de {p.resumen.decision.de} a {p.resumen.decision.a} mediante {p.resumen.decision.mediante}.</p>
            </div>
            <div className="grid sm:grid-cols-3" style={{ marginTop: -1.5 }}>
              {[["Realidad", p.resumen.realidad], ["Ambición", p.resumen.ambicion], ["Brecha principal", p.resumen.brecha]].map(([t, v]) => (
                <div key={t} className="celda-caja" style={{ marginTop: 0 }}><p className="t-etiqueta mb-1">{t}</p><p style={{ fontSize: 14.5 }}>{v}</p></div>
              ))}
            </div>
            <div className="grid sm:grid-cols-2" style={{ marginTop: -1.5 }}>
              <div className="celda-caja"><p className="t-etiqueta mb-1">3 apuestas</p>{p.resumen.apuestas.map((a, i) => <p key={i} style={{ fontSize: 14.5 }}>{i + 1}. {a}</p>)}</div>
              <div className="celda-caja"><p className="t-etiqueta mb-1">3 renuncias</p>{p.resumen.renuncias.map((a, i) => <p key={i} style={{ fontSize: 14.5 }}>{i + 1}. {a}</p>)}</div>
            </div>
            <div className="celda-caja" style={{ marginTop: -1.5 }}>
              <p className="t-etiqueta mb-1">Resultados</p>
              <p style={{ fontSize: 14.5 }}><strong>90 días:</strong> {p.resumen.resultados.d90} · <strong>1 año:</strong> {p.resumen.resultados.a1} · <strong>3 años:</strong> {p.resumen.resultados.a3}</p>
            </div>
            {p.resumen.pendientes.length > 0 && (
              <div className="celda-caja" style={{ marginTop: -1.5, borderWidth: 2 }}>
                <p className="t-etiqueta mb-1" style={{ color: "var(--contradicho)" }}>Decisiones pendientes del dueño</p>
                {p.resumen.pendientes.map((x, i) => <p key={i} style={{ fontSize: 14.5 }}>{i + 1}. {x}</p>)}
              </div>
            )}
          </Hoja>

          {/* 3 · MANDATO */}
          <Hoja n={3} titulo="Mandato estratégico">
            <h2>Qué debe resolver este plan</h2>
            <table><tbody>
              {([["Qué lo originó", p.mandato.origen], ["Problema a resolver", p.mandato.problema], ["Qué cubre", p.mandato.alcance], ["Qué queda fuera", p.mandato.fuera], ["Restricciones", p.mandato.restricciones], ["Así se reconoce el éxito", p.mandato.exito]] as [string, string][]).map(([t, v]) => (
                <tr key={t}><Td c={t} b /><Td c={v} /></tr>
              ))}
            </tbody></table>
          </Hoja>

          {/* 4 · RADIOGRAFÍA */}
          <Hoja n={4} titulo="Radiografía empresarial">
            <h2>Los signos vitales de esta empresa</h2>
            <table><thead><tr><Th c="Indicador" /><Th c="Línea base" /><Th c="Tendencia" /><Th c="Meta" /><Th c="Fuente" /><Th c="Confianza" /></tr></thead>
              <tbody>{p.radiografia.map((r, i) => (
                <tr key={i}><Td c={r.indicador} b /><Td c={r.base} /><Td c={<span style={{ color: TEND_COLOR[r.tendencia] }}>{TEND[r.tendencia]}</span>} /><Td c={r.meta} /><Td c={<span style={{ fontSize: 12.5, color: "var(--grafito)" }}>{r.fuente}</span>} /><Td c={<span style={{ color: r.confianza === "alta" ? "var(--confirmado)" : r.confianza === "media" ? "var(--caducado)" : "var(--contradicho)", fontWeight: 600 }}>{r.confianza}</span>} /></tr>
              ))}</tbody></table>
          </Hoja>

          {/* 5 · DIAGNÓSTICO */}
          <Hoja n={5} titulo="Diagnóstico principal">
            <h2>Tres problemas, no veinte</h2>
            {p.problemas.map((pr, i) => (
              <div key={i} style={{ marginBottom: 20, paddingLeft: 16, borderLeft: "3px solid var(--contradicho)" }}>
                <p style={{ fontWeight: 700, fontSize: 17 }}>{i + 1}. {pr.titulo}</p>
                <p style={{ fontSize: 14.5 }}><strong>Costo:</strong> {pr.costo}</p>
                <p style={{ fontSize: 13.5, color: "var(--grafito)" }}>Evidencia: {pr.evidencias.join(" · ")}</p>
                <p style={{ fontSize: 13.5, color: "var(--grafito)" }}>Causas: {pr.causas.join(" → ")}</p>
              </div>
            ))}
            <div className="celda-caja" style={{ background: "var(--suave)", border: "none" }}>
              <p className="t-etiqueta mb-1">El cuello de botella central</p>
              <p style={{ fontWeight: 600 }}>{p.cuello}</p>
            </div>
          </Hoja>

          {/* 6 · FODA */}
          <Hoja n={6} titulo="FODA estratégico">
            <h2>Con evidencia e implicación</h2>
            <div className="grid sm:grid-cols-2" style={{ gap: 14 }}>
              {([["Fortalezas", p.foda.fortalezas, "var(--confirmado)"], ["Debilidades", p.foda.debilidades, "var(--contradicho)"], ["Oportunidades", p.foda.oportunidades, "var(--marca)"], ["Amenazas", p.foda.amenazas, "var(--caducado)"]] as [string, typeof p.foda.fortalezas, string][]).map(([t, lista, color]) => (
                <div key={t} style={{ borderTop: `3px solid ${color}`, paddingTop: 8 }}>
                  <p className="t-etiqueta mb-2">{t}</p>
                  {lista.map((f, i) => (
                    <p key={i} style={{ fontSize: 13.5, marginBottom: 8 }}><strong>{f.punto}.</strong> <span style={{ color: "var(--grafito)" }}>{f.evidencia} → {f.implicacion}</span></p>
                  ))}
                </div>
              ))}
            </div>
            <p className="t-etiqueta mt-4 mb-2">Decisiones cruzadas</p>
            <p style={{ fontSize: 14 }}><strong>FO:</strong> {p.foda.cruces.fo} · <strong>DO:</strong> {p.foda.cruces.do} · <strong>FA:</strong> {p.foda.cruces.fa} · <strong>DA:</strong> {p.foda.cruces.da}</p>
          </Hoja>

          {/* 7 · CLIENTE */}
          <Hoja n={7} titulo="Cliente, propuesta y rentabilidad">
            <h2>{p.cliente.prioritario}</h2>
            <p><strong>El problema costoso que necesita resolver:</strong> {p.cliente.problema}</p>
            <p style={{ marginTop: 8 }}><strong>Criterios de compra:</strong> {p.cliente.criterios.join(" · ")}</p>
            <p><strong>Por qué abandona:</strong> {p.cliente.abandono.join(" · ")}</p>
            <p><strong>Rentabilidad por tipo de cliente:</strong> {p.cliente.rentable}</p>
            <div className="celda-caja mt-4" style={{ background: "var(--suave)", border: "none" }}>
              <p className="t-etiqueta mb-1">Propuesta de valor</p>
              <p style={{ fontWeight: 600, fontSize: 16 }}>{p.cliente.propuesta}</p>
              <p style={{ fontSize: 13, color: "var(--grafito)", marginTop: 6 }}>Evidencia de relevancia: {p.cliente.evidencia}</p>
            </div>
          </Hoja>

          {/* 8 · LEAN CANVAS */}
          <Hoja n={8} titulo="Lean Canvas">
            <h2>El modelo, con su estado de prueba</h2>
            <div className="grid sm:grid-cols-3" style={{ gap: 1, background: "var(--linea)", border: "1px solid var(--linea)" }}>
              {([["Segmentos", p.canvas.segmentos], ["Problemas", p.canvas.problemas], ["Propuesta de valor", p.canvas.propuesta], ["Solución", p.canvas.solucion], ["Canales", p.canvas.canales], ["Ingresos", p.canvas.ingresos], ["Costos", p.canvas.costos], ["Métricas", p.canvas.metricas], ["Ventaja difícil de copiar", p.canvas.ventaja]] as [string, typeof p.canvas.segmentos][]).map(([t, e]) => (
                <div key={t} style={{ background: "var(--papel)", padding: "12px 14px" }}>
                  <p className="t-etiqueta" style={{ fontSize: 11 }}>{t}</p>
                  <p style={{ fontSize: 13.5, margin: "4px 0 6px" }}>{e.texto}</p>
                  <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_CANVAS[e.estado].c, textTransform: "uppercase", letterSpacing: "0.04em" }}>{ESTADO_CANVAS[e.estado].t}</span>
                </div>
              ))}
            </div>
          </Hoja>

          {/* 9 · ELECCIONES */}
          <Hoja n={9} titulo="Elecciones estratégicas — la página más importante">
            <h2>Elegir es renunciar</h2>
            <table><tbody>
              {([["Aspiración", p.elecciones.aspiracion], ["Dónde jugar", p.elecciones.donde], ["Cómo ganar", p.elecciones.como], ["Capacidades", p.elecciones.capacidades], ["Sistemas", p.elecciones.sistemas], ["Renuncias", p.elecciones.renuncias]] as [string, string][]).map(([t, v]) => (
                <tr key={t}><Td c={t} b /><Td c={v} /></tr>
              ))}
            </tbody></table>
          </Hoja>

          {/* 10 · OPCIONES */}
          <Hoja n={10} titulo="Opciones evaluadas">
            <h2>Los caminos comparados — incluido no actuar</h2>
            <table><thead><tr><Th c="Criterio" />{p.opciones.map((o) => <Th key={o.nombre} c={o.nombre + (o.recomendada ? " · RECOMENDADA" : "")} />)}</tr></thead>
              <tbody>
                {(["impacto", "inversion", "tiempo", "riesgo", "reversibilidad", "capacidad"] as const).map((k) => (
                  <tr key={k}><Td c={{ impacto: "Impacto", inversion: "Inversión", tiempo: "Tiempo", riesgo: "Riesgo", reversibilidad: "Reversibilidad", capacidad: "Capacidad requerida" }[k]} b />{p.opciones.map((o) => <Td key={o.nombre} c={o[k]} />)}</tr>
                ))}
              </tbody></table>
          </Hoja>

          {/* 11 · SUPUESTOS */}
          <Hoja n={11} titulo="Supuestos críticos y señales">
            <h2>Qué tiene que ser cierto para que este plan funcione</h2>
            <table><thead><tr><Th c="Supuesto" /><Th c="Señal temprana si se cae" /><Th c="Marcha atrás" /></tr></thead>
              <tbody>{p.supuestos.map((s, i) => (
                <tr key={i}><Td c={s.supuesto} b /><Td c={s.senal} /><Td c={<span style={{ color: s.reversible ? "var(--confirmado)" : "var(--contradicho)", fontWeight: 600 }}>{s.reversible ? "reversible" : "difícil retorno"}</span>} /></tr>
              ))}</tbody></table>
          </Hoja>

          {/* 12 · MAPA */}
          <Hoja n={12} titulo="Mapa estratégico">
            <h2>{p.mapa.length} objetivos conectados</h2>
            <div className="grid sm:grid-cols-2" style={{ gap: 10 }}>
              {p.mapa.map((o) => (
                <div key={o.n} style={{ border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: "10px 14px" }}>
                  <span className="t-etiqueta" style={{ fontSize: 11 }}>{String(o.n).padStart(2, "0")} · {o.area}</span>
                  <p style={{ fontSize: 14.5, fontWeight: 550 }}>{o.objetivo}</p>
                </div>
              ))}
            </div>
          </Hoja>

          {/* 13 · PRIORIDADES */}
          <Hoja n={13} titulo="Prioridades estratégicas">
            <h2>Máximo cinco</h2>
            <table><thead><tr><Th c="Resultado buscado" /><Th c="Responsable" /><Th c="KPI" /><Th c="Meta" /><Th c="Fecha" /></tr></thead>
              <tbody>{p.prioridades.map((x, i) => <tr key={i}><Td c={x.resultado} b /><Td c={x.responsable} /><Td c={x.kpi} /><Td c={x.meta} /><Td c={x.fecha} /></tr>)}</tbody></table>
          </Hoja>

          {/* 14 · MODELO OPERATIVO */}
          <Hoja n={14} titulo="Modelo operativo">
            <h2>Cómo la estrategia se vuelve trabajo de lunes</h2>
            <p style={{ maxWidth: "62ch" }}>{p.operativo.como}</p>
            <p className="t-etiqueta mt-4 mb-2">Capacidades que la empresa debe dominar</p>
            <div className="flex flex-wrap" style={{ gap: 8 }}>
              {p.operativo.capacidades.map((cp, i) => <span key={i} style={{ border: "1px solid var(--tinta)", borderRadius: "var(--radio)", padding: "6px 14px", fontSize: 13.5, fontWeight: 550 }}>{cp}</span>)}
            </div>
            <p className="t-etiqueta mt-5 mb-2">Quién decide qué</p>
            <table><thead><tr><Th c="Decisión crítica" /><Th c="Decide" /><Th c="Ejecuta" /></tr></thead>
              <tbody>{p.operativo.decisiones.map((d, i) => <tr key={i}><Td c={d.decision} b /><Td c={d.decide} /><Td c={d.ejecuta} /></tr>)}</tbody></table>
          </Hoja>

          {/* 15 · PORTAFOLIO */}
          <Hoja n={15} titulo="Portafolio y asignación de recursos">
            <h2>La estrategia también se escribe con los recursos</h2>
            <table><thead><tr><Th c="Iniciativa" /><Th c="Decisión" /><Th c="Recursos" /><Th c="Responsable" /></tr></thead>
              <tbody>{p.portafolio.map((x, i) => (
                <tr key={i}><Td c={x.iniciativa} b /><Td c={<span style={{ fontWeight: 700, textTransform: "uppercase", fontSize: 12, letterSpacing: "0.04em", color: { acelerar: "var(--confirmado)", mantener: "var(--grafito)", probar: "var(--caducado)", detener: "var(--contradicho)" }[x.decision] }}>{x.decision}</span>} /><Td c={x.recursos} /><Td c={x.responsable} /></tr>
              ))}</tbody></table>
          </Hoja>

          {/* 16 · ROADMAP */}
          <Hoja n={16} titulo="Roadmap">
            <h2>Hitos, no cientos de tareas</h2>
            {([["Primeros 90 días", p.roadmap.d90], ["Primer año", p.roadmap.a1], ["Tres años", p.roadmap.a3]] as [string, typeof p.roadmap.d90][]).map(([t, hitos]) => (
              <div key={t} style={{ marginBottom: 16 }}>
                <p className="t-etiqueta mb-2">{t}</p>
                {hitos.map((h, i) => <p key={i} style={{ fontSize: 14.5, paddingLeft: 16, borderLeft: "2px solid var(--marca)", marginBottom: 6 }}><strong>{h.hito}</strong> — {h.resultado}</p>)}
              </div>
            ))}
          </Hoja>

          {/* 17 · TABLERO */}
          <Hoja n={17} titulo="Tablero estratégico">
            <h2>{p.tablero.length} indicadores — no más</h2>
            <table><thead><tr><Th c="Objetivo" /><Th c="Indicador" /><Th c="Tipo" /><Th c="Base" /><Th c="Meta" /><Th c="Responsable" /><Th c="Frecuencia" /></tr></thead>
              <tbody>{p.tablero.map((x, i) => <tr key={i}><Td c={x.objetivo} /><Td c={x.indicador} b /><Td c={<span style={{ fontSize: 12, color: "var(--grafito)" }}>{x.tipo}</span>} /><Td c={x.base} /><Td c={x.meta} /><Td c={x.responsable} /><Td c={x.frecuencia} /></tr>)}</tbody></table>
          </Hoja>

          {/* 18 · RIESGOS */}
          <Hoja n={18} titulo="Riesgos y criterios de corrección">
            <h2>Con señal temprana y respuesta</h2>
            <table><thead><tr><Th c="Riesgo" /><Th c="Señal temprana" /><Th c="Impacto" /><Th c="Respuesta" /><Th c="Responsable" /></tr></thead>
              <tbody>{p.riesgos.map((x, i) => <tr key={i}><Td c={x.riesgo} b /><Td c={x.senal} /><Td c={x.impacto} /><Td c={x.respuesta} /><Td c={x.responsable} /></tr>)}</tbody></table>
          </Hoja>

          {/* 19 · GOBIERNO Y APRENDIZAJE */}
          <Hoja n={19} titulo="Gobierno y aprendizaje">
            <h2>El plan es una agenda viva, no un archivo</h2>
            <table><tbody>
              <tr><Td c="Semanal" b /><Td c={p.gobierno.semanal} /></tr>
              <tr><Td c="Mensual" b /><Td c={p.gobierno.mensual} /></tr>
              <tr><Td c="Trimestral" b /><Td c={p.gobierno.trimestral} /></tr>
              <tr><Td c="Anual" b /><Td c={p.gobierno.anual} /></tr>
            </tbody></table>
            <div className="celda-caja mt-4" style={{ background: "var(--suave)", border: "none" }}>
              <p className="t-etiqueta mb-1">Qué se aprende y qué haría cambiar el plan</p>
              <p style={{ fontSize: 14 }}>{p.gobierno.aprendizaje}</p>
            </div>
            <div className="celda-caja mt-6" style={{ background: "var(--suave)", border: "none" }}>
              <p className="t-etiqueta mb-1">Nota de confianza — con qué evidencia se hizo este plan</p>
              <p style={{ fontSize: 14 }}>{p.nota_confianza}</p>
            </div>
          </Hoja>
        </article>
      )}
    </>
  );
}
