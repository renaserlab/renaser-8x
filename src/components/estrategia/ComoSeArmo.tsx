import { CLAVES_SUPUESTO, limitesDe } from "@/lib/estrategia/supuestos";
import { contextoLimites, posicionDe } from "@/lib/estrategia/armar";
import { textoDeRecortes } from "@/lib/estrategia/paquete";
import { textoPintado } from "@/lib/estrategia/texto";
import { caminoDeLente, esperanEnPalabras, idsCitados, lugarDe, nombreCamino, sinIds, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import { CHIP_CONSULTORA, ETAPA, PANTALLA, TEXTO } from "@/lib/estrategia/textos";
import { Segmentos } from "@/components/tablero/Piezas";
import { T } from "./Texto";
import { Grupo } from "./Grupos";
import { EditarSupuesto } from "./EditarSupuesto";
import { UNIDAD } from "./DosCaminos";

/**
 * CÓMO SE ARMÓ (spec-estrategia-8x.md §8.1, punto 3, tercer grupo plegado): con qué confianza y con qué datos (los
 * cuatro chips de §3.1, lo que no entró por tamaño y lo que esta base no tiene), los datos que cita, lo que 8X quitó o
 * no pudo comprobar, los avisos, la lista de control —el único veredicto, el del código—, lo que se le objetó a cada
 * camino, las cifras por confirmar (con su rango, que se corrige) y lo que falta saber.
 */

const CLASE_HECHO: Record<string, string> = { hecho: "ok", estimado: "espera", percepcion: "neutro" };
/** «2026-10-12» → «12/10/2026», dentro de cualquier texto. */
const fechaLegible = (t: string) => t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$3/$2/$1");
const MAX_CITADOS = 30;

/** De dónde sale un supuesto: de qué camino o de la prueba de los dos. */
const origenDe = (o: "dinero" | "terreno" | "equipo_rojo") => (o === "equipo_rojo" ? ETAPA.rojo.nombre : caminoDeLente(o));

export function ComoSeArmo({ x }: { x: VistaEstrategia }) {
  const e = x.e;
  const p = x.v.paquete;
  const c = p.conteo;
  const recortes = textoDeRecortes(p.recortes);
  const citados = idsCitados(e);
  const hechos = p.hechos.filter((h) => citados.has(h.id));
  const ctx = contextoLimites(x.refs);
  const tabla = (t: string) => PANTALLA.tablas[t] ?? PANTALLA.una_parte;

  return (
    <Grupo id="como-se-armo" titulo={PANTALLA.grupo_armo} sub={PANTALLA.grupo_armo_sub}>
      <div className="armo">
        <section className="armo__bloque" aria-label={PANTALLA.confianza}>
          <h3 className="analisis__titulo">{PANTALLA.confianza}</h3>
          <p>{sinIds(e.nota_de_confianza, e)}</p>
        </section>

        <section className="armo__bloque" aria-label={PANTALLA.datos}>
          <h3 className="analisis__titulo">{PANTALLA.datos}</h3>
          <Segmentos
            etiqueta={`${c.hecho} ${PANTALLA.clase(c.hecho, "hecho")}, ${c.estimado} ${PANTALLA.clase(c.estimado, "estimado")}, ${c.percepcion} ${PANTALLA.clase(c.percepcion, "percepcion")}, ${c.sin_dato} ${PANTALLA.clase(c.sin_dato, "sin_dato")}`}
            partes={[
              { n: c.hecho, texto: PANTALLA.clase(c.hecho, "hecho"), tipo: "s1" },
              { n: c.estimado, texto: PANTALLA.clase(c.estimado, "estimado"), tipo: "s2" },
              { n: c.percepcion, texto: PANTALLA.clase(c.percepcion, "percepcion"), tipo: "s4" },
              { n: c.sin_dato, texto: PANTALLA.clase(c.sin_dato, "sin_dato"), tipo: "s3" },
            ]}
          />
          <p className="nota">
            {c.hipotesis} {PANTALLA.clase(c.hipotesis, "hipotesis")} · {c.deseo} {PANTALLA.clase(c.deseo, "deseo")}
          </p>
          {recortes && <p className="nota">{sinIds(recortes, e)}</p>}
          {p.lecturas_fallidas.length > 0 && (
            <ul className="detalle-lista">
              {p.lecturas_fallidas.map((l, i) => (
                <li key={i}>
                  <b>{tabla(l.tabla)}</b>: {sinIds(l.motivo, e)}
                </li>
              ))}
            </ul>
          )}
          {hechos.length > 0 && (
            <>
              <h4 className="t-etiqueta">{PANTALLA.datos_que_cita}</h4>
              <ul className="hechos">
                {hechos.slice(0, MAX_CITADOS).map((h) => (
                  <li key={h.id} className="hecho">
                    <span className={`estado ${CLASE_HECHO[h.clase] ?? "neutro"}`}>{h.clase === "hecho" ? CHIP_CONSULTORA.hecho : h.clase === "estimado" ? CHIP_CONSULTORA.estimado : CHIP_CONSULTORA.percepcion}</span>
                    {h.provisional && <span className="estado espera">{CHIP_CONSULTORA.provisional}</span>}
                    <span className="hecho__texto">{sinIds(h.texto, e)}</span>
                    <small>
                      {/* La fecha, una sola vez y como se lee aquí (no «2026-10-12 · 2026-10-12»). */}
                      {fechaLegible(sinIds(h.fuente.como, e))}
                      {h.fecha && !h.fuente.como.includes(h.fecha) ? ` · ${fechaLegible(h.fecha)}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
              {hechos.length > MAX_CITADOS && <p className="nota">{PANTALLA.y_mas(hechos.length - MAX_CITADOS)}</p>}
            </>
          )}
        </section>

        <section className="armo__bloque" aria-label={PANTALLA.quitado}>
          <h3 className="analisis__titulo">{PANTALLA.quitado}</h3>
          {e.quitado.length || x.revision.validacion.avisos.length ? (
            <ul className="detalle-lista">
              {e.quitado.map((q, i) => (
                <li key={`q-${i}`}>
                  <b>{lugarDe(q.puntero, e)}</b> <span className={`estado ${q.resuelto ? "ok" : "alto"}`}>{q.resuelto ? PANTALLA.resuelto : PANTALLA.sin_resolver}</span>
                  <span className="detalle-lista__luego">{sinIds(q.motivo, e)}</span>
                  {q.quitado && <small>«{sinIds(q.quitado.includes("{{") ? textoPintado(q.quitado, x.refs, "consultora") : q.quitado, e)}»</small>}
                </li>
              ))}
              {x.revision.validacion.avisos.map((a, i) => (
                <li key={`a-${i}`}>
                  <b>{lugarDe(a.puntero, e)}</b> <span className="estado espera">{PANTALLA.avisos}</span>
                  <span className="detalle-lista__luego">{sinIds(a.texto, e)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nota">{PANTALLA.nada_quitado}</p>
          )}
        </section>

        <section className="armo__bloque armo__bloque--ancho" aria-label={PANTALLA.control}>
          <h3 className="analisis__titulo">{PANTALLA.control}</h3>
          <ul className="control">
            {x.revision.calidad.map((r) => (
              <li key={r.clave} className="control__item" data-cumple={r.cumple ? "" : undefined}>
                <span className={`estado ${r.cumple ? "ok" : "alto"}`}>{r.cumple ? PANTALLA.cumple : PANTALLA.no_cumple}</span>
                <span className="control__cuerpo">
                  <b>{r.nombre}</b>
                  <small>{r.exige}</small>
                  {r.detalle.map((d, i) => (
                    <small key={i} className="control__detalle">
                      {sinIds(d, e)}
                    </small>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="armo__bloque armo__bloque--ancho" aria-label={PANTALLA.objeciones}>
          <h3 className="analisis__titulo">{PANTALLA.objeciones}</h3>
          <ul className="detalle-lista">
            {e.objeciones.map((o, i) => (
              <li key={i}>
                <b>{PANTALLA.objecion_de[o.a] ?? ""}</b> <span className={`estado ${o.gravedad === "cambia_el_camino" ? "alto" : "neutro"}`}>{PANTALLA.gravedad[o.gravedad]}</span>
                <span className="detalle-lista__luego">
                  <T x={x} p={`/objeciones/${i}/objecion`} />
                </span>
                <small>
                  {PANTALLA.arreglo}: <T x={x} p={`/objeciones/${i}/arreglo`} />
                </small>
              </li>
            ))}
          </ul>
          {(["a", "b"] as const).some((l) => e.caminos[l].cambiadas.length) && (
            <>
              <h4 className="t-etiqueta">{PANTALLA.cambiadas}</h4>
              <ul className="detalle-lista">
                {(["a", "b"] as const).flatMap((l) =>
                  e.caminos[l].cambiadas.map((k, i) => (
                    <li key={`${l}-${i}`}>
                      <b>{nombreCamino(l)}</b> {sinIds(textoPintado(k.jugada.que_se_mueve, x.refs, "consultora"), e)}{" "}
                      <small>· {k.motivo === "quitada" ? PANTALLA.quitada : PANTALLA.reemplazada_por(k.por ? posicionDe(e.caminos[l], k.por) : null)}</small>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </section>

        <section id="supuestos" className="armo__bloque armo__bloque--ancho" aria-label={PANTALLA.supuestos}>
          <h3 className="analisis__titulo">{PANTALLA.supuestos}</h3>
          <p className="nota">{PANTALLA.supuestos_sub}</p>
          {e.supuestos.length ? (
            <ul className="supuestos">
              {e.supuestos.map((s, i) => {
                const lim = limitesDe(s.clave, ctx);
                const usado = esperanEnPalabras(s.usado_en, e);
                return (
                  <li key={s.id} className="supuesto" data-fuera={s.retirado ? "" : undefined}>
                    <T x={x} p={`/supuestos/${i}/que_se_supone`} clase="supuesto__que" />
                    <EditarSupuesto
                      companyId={x.companyId}
                      eid={x.v.id}
                      id={s.id}
                      texto={x.refs.get(`S:${s.id}`)?.texto ?? TEXTO.sin_dato}
                      bajo={s.rango.bajo}
                      alto={s.rango.alto}
                      unidad={UNIDAD[s.unidad] ?? s.unidad}
                      limites={lim.ok ? [lim.limites[0], lim.limites[1]] : null}
                      editable={x.editable}
                      que={s.que_se_supone}
                    />
                    <small>
                      <T x={x} p={`/supuestos/${i}/por_que`} />
                    </small>
                    <small>
                      {PANTALLA.de_camino(origenDe(s.origen))}
                      {usado.length ? ` · ${PANTALLA.usado_en}: ${usado.join(", ")}` : ""}
                    </small>
                    {s.retirado && (
                      <small>
                        <span className="estado alto">{PANTALLA.fuera_de_cuentas}</span> {sinIds(s.retirado, e)}
                      </small>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="sin-dato">{TEXTO.sin_dato}</p>
          )}
        </section>

        <section className="armo__bloque armo__bloque--ancho" aria-label={PANTALLA.faltan}>
          <h3 className="analisis__titulo">{PANTALLA.faltan}</h3>
          <ul className="detalle-lista">
            {e.destraban.map((d) => (
              <li key={d.id}>
                <b>{sinIds(d.que_falta, e)}</b>
                {d.pregunta && <span className="detalle-lista__luego">«{d.pregunta}»</span>}
                {d.esperan.length > 0 && (
                  <small>
                    {PANTALLA.esperan}: {esperanEnPalabras(d.esperan, e).join(", ")}
                  </small>
                )}
              </li>
            ))}
            {e.faltan
              .filter((f) => !e.destraban.some((d) => d.clave === f.clave))
              .map((f, i) => (
                <li key={`f-${i}`}>
                  <b>{f.clave === "otra" ? f.pregunta_si_otra ?? TEXTO.sin_dato : sinIds(CLAVES_SUPUESTO[f.clave]?.que_falta ?? f.clave, e)}</b>
                  <span className="detalle-lista__luego">{sinIds(f.por_que_importa, e)}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </Grupo>
  );
}
