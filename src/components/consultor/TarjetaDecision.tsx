"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { pedir } from "@/lib/cliente";
import { ACCION, ACCIONES, CAMPOS_CORREGIBLES, type Decision, type Intervencion, type Accion, type CampoCorregible } from "@/lib/decisiones";
import type { Derivados } from "@/lib/metricas";
import { explicarCalculo, type Calculo } from "@/lib/finanzas";

/**
 * LA TARJETA DE DECISIÓN (manual §16). Cabe en una pantalla a propósito: el manual prohíbe entregar
 * informes de diez páginas para decidir, y también ocultar el contexto necesario. El equilibrio es
 * evidencia citada, alternativas comparadas y una recomendación con su porqué.
 *
 * MODIFICAR NO PISA LO PROPUESTO. Cuando Kelin corrige, lo que el sistema proponía se guarda en el
 * historial. Sin eso no se puede responder después la pregunta que importa: ¿la corrección produjo
 * mejor resultado? El manual pide medirlo, no suponer que la IA o el humano tenía razón.
 */

const ETIQUETA_CAMPO: Record<CampoCorregible, string> = {
  recomendacion: "La recomendación",
  recomendacion_por_que: "Por qué la recomienda",
  impacto_esperado: "Impacto esperado",
  que_pasa_si_se_aprueba: "Qué pasará si se aprueba",
};

/** El sello de cada estado de una decisión (.estado del sistema). */
const SELLO_ESTADO: Record<string, "ok" | "espera" | "alto" | "neutro"> = {
  pendiente: "espera",
  aprobada: "ok",
  modificada: "neutro",
  objetada: "espera",
  rechazada: "alto",
  pospuesta: "neutro",
  pide_evidencia: "espera",
};

const fecha = (iso: string) => iso.slice(0, 16).replace("T", " ");
const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

/** El detalle desplegable de una cifra: cómo se calcula, periodo, fuentes, supuestos y limitaciones. */
function DetalleCalculo({ calculo }: { calculo: Calculo<unknown> }) {
  return (
    <details className="detalle-calculo">
      <summary>Cómo se calculó</summary>
      <dl>
        {explicarCalculo(calculo).map((l) => (
          <div key={l.etiqueta}>
            <dt>{l.etiqueta}</dt>
            <dd>{l.texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/**
 * Una cifra derivada en la tarjeta: valor o el motivo de que no haya, y siempre su detalle.
 * LO EXTRAÍDO NUNCA ES VERIFICADO: si la cifra se apoya en un número leído de un documento y sin
 * conciliar, se dice JUNTO a la cifra. Antes el rótulo solo estaba dentro de «Cómo se calculó» y la
 * cifra se leía como firme justo donde se decide.
 */
function CifraDerivada({ titulo, valor, calculo, provisional }: { titulo: string; valor: string | null; calculo: Calculo<unknown>; provisional?: boolean }) {
  return (
    <div>
      <div className="t-etiqueta">{titulo}</div>
      <div className="t-dato" style={{ fontVariantNumeric: "tabular-nums" }}>{valor ?? "—"}</div>
      {valor != null && provisional && (
        <div className="apunte texto-espera" role="status">
          Provisional: usa un número leído de un documento que nadie ha conciliado todavía.
        </div>
      )}
      {valor == null && calculo.motivo_nulo && <div className="apunte texto-espera">{calculo.motivo_nulo}</div>}
      <DetalleCalculo calculo={calculo} />
    </div>
  );
}

export function TarjetaDecision({
  decision: d,
  historial,
  falta,
  numeros,
  avisoNumeros,
}: {
  decision: Decision;
  historial: Intervencion[];
  falta: string[];
  /** Los derivados de la empresa (metricas.derivados). Opcional: sin ellos la tarjeta no muestra cifras. */
  numeros?: Derivados | null;
  /** Por qué no hay cifras cuando debería haberlas (la lectura falló). Sin esto la sección desaparecía sin decir nada. */
  avisoNumeros?: string | null;
}) {
  const router = useRouter();
  const [accion, setAccion] = useState<Accion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [correcciones, setCorrecciones] = useState<Partial<Record<CampoCorregible, string>>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async () => {
    if (!accion) return;
    setEnviando(true);
    setError(null);
    try {
      await pedir(`/api/decisiones/${d.id}`, { json: { accion, motivo, correcciones: accion === "modificar" ? correcciones : undefined } });
      setAccion(null);
      setMotivo("");
      setCorrecciones({});
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <article className="panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="t-seccion">{d.titulo}</h2>
          <span className={`estado ${SELLO_ESTADO[d.estado] ?? "neutro"}`}>{d.estado.replace("_", " ")}</span>
        </div>
        <p className="t-cuerpo" style={{ marginTop: 6 }}>
          <span className="t-etiqueta">POR QUÉ AHORA</span> · {d.por_que_ahora}
        </p>

        {/* LO QUE FALTA PARA PODER DECIDIR. Va arriba: una tarjeta sin evidencia no es una decisión. */}
        {falta.length > 0 && (
          <div className="aviso aviso--pide" style={{ marginTop: 14 }}>
            <p className="t-rotulo" style={{ color: "var(--caducado)" }}>ESTA DECISIÓN NO ESTÁ LISTA PARA DECIDIRSE</p>
            <ul className="lista-editorial" style={{ marginTop: 6 }}>
              {falta.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <section style={{ marginTop: 16 }}>
          <h3 className="t-etiqueta">EVIDENCIA ({d.evidencia.length})</h3>
          {d.evidencia.length === 0 ? (
            <p className="t-dato" style={{ color: "var(--caducado)" }}>Ninguna citada.</p>
          ) : (
            <ul className="lista-editorial">
              {d.evidencia.map((e, i) => (
                <li key={i}>
                  <span className="t-dato" style={{ color: "var(--grafito)" }}>[{e.tipo}]</span> {e.texto}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* LOS NÚMEROS DETRÁS (D5). El equilibrio que se muestra es el de la EMPRESA; si no existe
            se dice por qué, y la cifra del producto estrella va con su rótulo de hipótesis. Nunca
            se presenta la una como la otra. */}
        {numeros && (
          <section style={{ marginTop: 14 }}>
            <h3 className="t-etiqueta">LOS NÚMEROS DETRÁS</h3>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", marginTop: 6 }}>
              <CifraDerivada
                titulo="Desde qué venta cubre sus costos"
                valor={numeros.equilibrio != null ? `${soles(numeros.equilibrio)} al mes` : null}
                calculo={numeros.detalle.equilibrio}
                provisional={numeros.provisional.equilibrio}
              />
              <CifraDerivada
                titulo="Si toda la venta fuera el producto estrella (hipótesis)"
                valor={numeros.equilibrioProductoEstrella != null ? `${soles(numeros.equilibrioProductoEstrella)} al mes` : null}
                calculo={numeros.detalle.equilibrioProductoEstrella}
                provisional={numeros.provisional.equilibrioProductoEstrella}
              />
              <CifraDerivada
                titulo="De cada 100 soles le quedan (declarado)"
                valor={numeros.margen != null ? `${numeros.margen.toFixed(0)}` : null}
                calculo={numeros.detalle.margen}
                provisional={numeros.provisional.margen}
              />
              <CifraDerivada
                titulo="Días que aguanta sin vender"
                valor={numeros.diasAguante != null ? `${Math.round(numeros.diasAguante)} días` : null}
                calculo={numeros.detalle.diasAguante}
                provisional={numeros.provisional.diasAguante}
              />
            </div>
          </section>
        )}

        {!numeros && avisoNumeros && (
          <section style={{ marginTop: 14 }}>
            <h3 className="t-etiqueta">LOS NÚMEROS DETRÁS</h3>
            <p className="t-dato" style={{ color: "var(--caducado)" }} role="status">{avisoNumeros}</p>
          </section>
        )}

        {d.faltantes.length > 0 && (
          <section style={{ marginTop: 14 }}>
            <h3 className="t-etiqueta">LO QUE NO SE SABE Y CAMBIARÍA ESTO</h3>
            <ul className="lista-editorial">
              {d.faltantes.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </section>
        )}

        {d.supuestos.length > 0 && (
          <section style={{ marginTop: 14 }}>
            <h3 className="t-etiqueta">SUPUESTOS</h3>
            <ul className="lista-editorial">
              {d.supuestos.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        )}

        <section style={{ marginTop: 16 }}>
          <h3 className="t-etiqueta">ALTERNATIVAS ({d.alternativas.length})</h3>
          {d.alternativas.length < 2 && (
            <p className="t-dato" style={{ color: "var(--caducado)" }}>Sin comparación no hay decisión, hay aceptación.</p>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", marginTop: 8 }}>
            {d.alternativas.map((a) => {
              const recomendada = d.recomendacion === a.clave;
              return (
                <div key={a.clave} className={recomendada ? "panel p-5 alternativa alternativa--recomendada" : "panel p-5 alternativa"}>
                  <p className="t-etiqueta" style={{ color: recomendada ? "var(--marca)" : "var(--grafito)" }}>
                    {a.clave.toUpperCase()}{recomendada ? " · RECOMENDADA" : ""}
                  </p>
                  <p className="titulo-tarjeta" style={{ marginTop: 2 }}>{a.titulo}</p>
                  <p className="t-cuerpo" style={{ marginTop: 4 }}>{a.que_implica}</p>
                  <dl className="grid gap-1 t-dato" style={{ gridTemplateColumns: "auto 1fr", marginTop: 8 }}>
                    {([["Impacto", a.impacto], ["Costo", a.costo], ["Velocidad", a.velocidad], ["Riesgo", a.riesgo], ["Reversible", a.reversibilidad]] as const).map(
                      ([k, v]) =>
                        v ? (
                          <div key={k} style={{ display: "contents" }}>
                            <dt className="t-etiqueta">{k}</dt>
                            <dd className="t-dato">{v}</dd>
                          </div>
                        ) : null
                    )}
                  </dl>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ marginTop: 16 }}>
          <h3 className="t-etiqueta">LO QUE RECOMIENDA EL SISTEMA</h3>
          <p className="t-cuerpo">{d.recomendacion_por_que ?? "Sin recomendación."}</p>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: 10 }}>
            <div>
              <div className="t-etiqueta">Impacto esperado</div>
              <div className="t-dato">{d.impacto_esperado ?? "—"}</div>
            </div>
            <div>
              <div className="t-etiqueta">Confianza</div>
              <div className="t-dato">
                {d.confianza ?? "no declarada"}
                {d.confianza_por_que ? <span style={{ color: "var(--grafito)" }}> · {d.confianza_por_que}</span> : null}
              </div>
            </div>
            <div>
              <div className="t-etiqueta">Si se aprueba</div>
              <div className="t-dato">{d.que_pasa_si_se_aprueba ?? "—"}</div>
            </div>
            <div>
              <div className="t-etiqueta">Quién la produjo</div>
              <div className="t-dato">
                {d.origen === "agente" ? `${d.agente ?? "agente"}${d.agente_version ? ` v${d.agente_version}` : ""}` : "la consultora"}
              </div>
            </div>
          </div>
          {d.riesgos.length > 0 && (
            <>
              <h3 className="t-etiqueta" style={{ marginTop: 12 }}>RIESGOS</h3>
              <ul className="lista-editorial">
                {d.riesgos.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* LAS SEIS ACCIONES DEL MANUAL. */}
        <section className="no-imprimir" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--linea)" }}>
          <h3 className="t-etiqueta mb-2">TU DECISIÓN</h3>
          <div className="flex flex-wrap gap-2">
            {ACCIONES.map((a) => (
              <button key={a} type="button" className={`boton ${accion === a ? "" : "boton--secundario"}`} onClick={() => setAccion(accion === a ? null : a)}>
                {ACCION[a].verbo}
              </button>
            ))}
          </div>

          {accion && (
            <div className="aparece" style={{ marginTop: 14 }}>
              <p className="t-dato" style={{ color: "var(--grafito)" }}>{ACCION[accion].explica}</p>

              {accion === "modificar" && (
                <div className="flex flex-col gap-3" style={{ marginTop: 12 }}>
                  {CAMPOS_CORREGIBLES.map((c) => (
                    <label key={c}>
                      <span className="t-etiqueta">{ETIQUETA_CAMPO[c]}</span>
                      <textarea
                        className="campo"
                        rows={2}
                        aria-label={ETIQUETA_CAMPO[c]}
                        placeholder={(d as unknown as Record<string, string | null>)[c] ?? "sin valor"}
                        value={correcciones[c] ?? ""}
                        onChange={(e) => setCorrecciones((v) => ({ ...v, [c]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <p className="t-dato" style={{ color: "var(--grafito)" }}>
                    Lo que dejes vacío se conserva como está. Lo que propuso el sistema queda guardado en el historial.
                  </p>
                </div>
              )}

              <label style={{ display: "block", marginTop: 12 }}>
                <span className="t-etiqueta">Por qué {ACCION[accion].verbo.toLowerCase()}</span>
                <textarea
                  className="campo"
                  rows={3}
                  aria-label="Motivo de tu decisión"
                  placeholder="El motivo es lo que sirve después, cuando haya que entender por qué se decidió así."
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>

              <div className="flex items-center gap-3" style={{ marginTop: 12 }}>
                <button className="boton" onClick={enviar} disabled={enviando || motivo.trim().length < 8}>
                  {enviando ? "Registrando…" : `${ACCION[accion].verbo} y registrar`}
                </button>
                {motivo.trim().length < 8 && <span className="t-dato" style={{ color: "var(--grafito)" }}>Falta el motivo</span>}
                {error && <span className="t-dato" style={{ color: "var(--contradicho)" }}>{error}</span>}
              </div>
            </div>
          )}
        </section>
      </article>

      {/* EL HISTORIAL: qué proponía el sistema y qué decidió ella, sin que uno pise al otro. */}
      <section style={{ marginTop: 24 }}>
        <h2 className="t-seccion mb-2">Historial de intervenciones ({historial.length})</h2>
        {historial.length === 0 ? (
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>Nadie ha intervenido todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {historial.map((h) => (
              <article key={h.id} className="panel p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <strong>{ACCION[h.accion]?.verbo ?? h.accion}</strong>
                  <span className="t-dato" style={{ color: "var(--grafito)" }}>
                    {h.actor_rol ?? "—"} · {fecha(h.created_at)}
                  </span>
                </div>
                <p className="t-cuerpo" style={{ marginTop: 4 }}>{h.motivo}</p>
                {h.despues && (
                  <details style={{ marginTop: 8 }}>
                    <summary className="plegado-enlace plegado-enlace--tenue">Qué cambió respecto a lo que proponía el sistema</summary>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 8 }}>
                      {Object.keys(h.despues).map((k) => (
                        <div key={k} style={{ display: "contents" }}>
                          <div>
                            <div className="t-etiqueta">El sistema proponía</div>
                            <div className="t-dato" style={{ color: "var(--grafito)" }}>{String(h.antes?.[k] ?? "—")}</div>
                          </div>
                          <div>
                            <div className="t-etiqueta">Kelin puso</div>
                            <div className="t-dato">{String(h.despues?.[k] ?? "—")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <p className="t-dato" style={{ marginTop: 8, color: h.resultado ? "var(--confirmado)" : "var(--grafito)" }}>
                  {h.resultado
                    ? `Resultado posterior: ${h.resultado} (${h.resultado_at ? fecha(h.resultado_at) : "—"})`
                    : "Resultado posterior: pendiente de observación. Nadie puede afirmar hoy si fue acertada."}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
