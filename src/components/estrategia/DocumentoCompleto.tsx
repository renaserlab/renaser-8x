import Link from "next/link";
import type { ReactNode } from "react";
import { fecha } from "@/lib/formato";
import { configDeCalculos } from "@/lib/estrategia/calculos";
import { textoEn } from "@/lib/estrategia/edicion";
import { CUADRANTES_FODA, type LetraCamino } from "@/lib/estrategia/armar";
import { BLOQUES_CANVAS } from "@/lib/estrategia/esquemas";
import { pintar } from "@/lib/estrategia/texto";
import { ESTADO_VERSION, caminoDeLente, esperanEnPalabras, nombreCamino, sinIds, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import { PANTALLA, TEXTO } from "@/lib/estrategia/textos";
import { BotonImprimir } from "@/components/base/BotonImprimir";
import { Frase } from "./Frase";

/**
 * LA ESTRATEGIA PARA IMPRIMIR (spec-estrategia-8x.md §8.4): el documento de hojas de antes no se pierde, pasa a ser la
 * vista para imprimir de la estrategia, para la consultora. Reusa la maqueta de hojas (`Hoja`, `Th`, `Td` y el CSS de
 * impresión, que vivían en la página «Plan estratégico») y arma: portada · lectura · gran apuesta · los dos caminos y
 * el elegido · FODA y cruces · canvas · árboles · oferta · fugas y 90/10 · qué medimos · supuestos y preguntas · nota
 * de confianza. «Descargar PDF (imprimir)» como siempre. Cada cifra con su origen entre paréntesis; ningún id.
 */

function Hoja({ n, titulo, children }: { n?: number; titulo: string; children: ReactNode }) {
  return (
    <section className="hoja-plan">
      <p className="t-etiqueta hoja-plan__rotulo">
        {n ? `${String(n).padStart(2, "0")} · ` : ""}
        {titulo}
      </p>
      {children}
    </section>
  );
}
const Th = ({ c }: { c: ReactNode }) => <th className="doc-th">{c}</th>;
const Td = ({ c, b }: { c: ReactNode; b?: boolean }) => <td className={b ? "doc-td doc-td--fuerte" : "doc-td"}>{c}</td>;

/** Un texto de la versión, pintado para el papel. */
function D({ x, p }: { x: VistaEstrategia; p: string }) {
  const t = textoEn(x.e, p);
  return t ? <Frase trozos={pintar(t, x.refs, "consultora")} id={`doc${p}`} modo="documento" /> : null;
}
/** Una cifra por su id, para el papel. */
function C({ x, id }: { x: VistaEstrategia; id: string | null | undefined }) {
  return id ? <Frase trozos={pintar(`{{${id}}}`, x.refs, "consultora")} id={`doc-${id}`} modo="documento" /> : null;
}

export function DocumentoCompleto({ x, empresa, volver }: { x: VistaEstrategia; empresa: string; volver: string }) {
  const e = x.e;
  const cfg = configDeCalculos(x.v.calculos);
  const letras: LetraCamino[] = ["a", "b"];
  const cu = e.anexos.cuentas;

  return (
    <>
      <div className="no-imprimir doc-barra">
        <Link href={volver} className="enlace-azul">
          {PANTALLA.volver}
        </Link>
        <BotonImprimir texto={PANTALLA.imprimir} />
      </div>
      <article className="doc-plan t-doc">
        <section className="hoja-plan doc-portada">
          <div>
            <p className="t-etiqueta doc-portada__marca">{PANTALLA.marca_documento}</p>
            <h2 className="doc-portada__titulo">
              {PANTALLA.titulo}
              <br />
              {empresa}
            </h2>
            <p className="doc-portada__apuesta">
              <D x={x} p="/gran_apuesta/frase" />
            </p>
          </div>
          <p className="doc-portada__pie">
            {PANTALLA.version(x.v.version)} · {fecha(x.v.created_at, cfg)} · {ESTADO_VERSION[x.v.estado].texto}
            {x.v.camino_elegido ? ` · ${PANTALLA.elegido}: ${nombreCamino(x.v.camino_elegido)}` : ""}
          </p>
        </section>

        <Hoja n={2} titulo={PANTALLA.lectura}>
          <table>
            <tbody>
              {e.lectura.map((_l, i) => (
                <tr key={i}>
                  <Td c={PANTALLA.rotulos_lectura[i] ?? ""} b />
                  <Td c={<D x={x} p={`/lectura/${i}`} />} />
                </tr>
              ))}
            </tbody>
          </table>
        </Hoja>

        <Hoja n={3} titulo={PANTALLA.gran_apuesta}>
          <div className="celda-caja">
            <p className="doc-destacado">
              <D x={x} p="/gran_apuesta/frase" />
            </p>
            <p>
              <D x={x} p="/gran_apuesta/por_que" />
            </p>
          </div>
        </Hoja>

        <Hoja n={4} titulo={TEXTO.dos_caminos}>
          <table>
            <thead>
              <tr>
                <Th c="" />
                {letras.map((l) => (
                  <Th key={l} c={`${nombreCamino(l)}${e.recomendado.camino === l ? ` · ${PANTALLA.recomendado}` : ""}${x.v.camino_elegido === l ? ` · ${PANTALLA.elegido}` : ""}`} />
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td c={PANTALLA.oferta_campos.nombre} b />
                {letras.map((l) => (
                  <Td key={l} c={<D x={x} p={`/caminos/${l}/nombre`} />} b />
                ))}
              </tr>
              <tr>
                <Td c={PANTALLA.por_que} b />
                {letras.map((l) => (
                  <Td key={l} c={<D x={x} p={`/caminos/${l}/filosofia`} />} />
                ))}
              </tr>
              <tr>
                <Td c={PANTALLA.jugadas} b />
                {letras.map((l) => (
                  <Td
                    key={l}
                    c={
                      <ol className="doc-lista">
                        {e.caminos[l].jugadas.map((j, i) => (
                          <li key={j.id}>
                            <D x={x} p={`/caminos/${l}/jugadas/${i}/que_se_mueve`} /> <small>({PANTALLA.desde_el_dia(j.desde_dia)})</small>
                            <br />
                            <small>
                              {PANTALLA.responde_el_mercado}: <D x={x} p={`/caminos/${l}/jugadas/${i}/respuesta_del_mercado`} />
                            </small>
                            {j.si_responde_distinto && (
                              <>
                                <br />
                                <small>
                                  {PANTALLA.si_responde_distinto}: <D x={x} p={`/caminos/${l}/jugadas/${i}/si_responde_distinto`} />
                                </small>
                              </>
                            )}
                          </li>
                        ))}
                      </ol>
                    }
                  />
                ))}
              </tr>
              <tr>
                <Td c={PANTALLA.comparacion_filas.conviene} b />
                {letras.map((l) => (
                  <Td key={l} c={<D x={x} p={`/caminos/${l}/conviene_si`} />} />
                ))}
              </tr>
              <tr>
                <Td c={PANTALLA.a_90} b />
                {letras.map((l) => (
                  <Td key={l} c={<C x={x} id={`R:${l}.total.d90`} />} />
                ))}
              </tr>
              <tr>
                <Td c={PANTALLA.que_pide} b />
                {letras.map((l) => (
                  <Td
                    key={l}
                    c={(["dinero", "horas_del_dueno", "personas", "herramientas"] as const).map((k) => (
                      <p key={k}>
                        <b>{PANTALLA.pide[k]}:</b> <D x={x} p={`/caminos/${l}/que_pide/${k}`} />
                      </p>
                    ))}
                  />
                ))}
              </tr>
              <tr>
                <Td c={PANTALLA.casos} b />
                {letras.map((l) => (
                  <Td
                    key={l}
                    c={e.caminos[l].casos.map((_k, i) => (
                      <p key={i}>
                        <b>{PANTALLA.si_pasa}:</b> <D x={x} p={`/caminos/${l}/casos/${i}/caso`} /> <b>→ {PANTALLA.haremos}:</b> <D x={x} p={`/caminos/${l}/casos/${i}/solucion`} />
                      </p>
                    ))}
                  />
                ))}
              </tr>
              <tr>
                <Td c={PANTALLA.punto_decision_titulo} b />
                {letras.map((l) => (
                  <Td
                    key={l}
                    c={
                      <>
                        <p>
                          <b>{PANTALLA.dias(e.caminos[l].punto_de_decision.dia)}:</b> <D x={x} p={`/caminos/${l}/punto_de_decision/que_mirar`} />
                        </p>
                        <p>
                          <b>{PANTALLA.si_no}:</b> <D x={x} p={`/caminos/${l}/punto_de_decision/si_no`} />
                        </p>
                      </>
                    }
                  />
                ))}
              </tr>
            </tbody>
          </table>
          <p className="doc-nota">
            <b>{TEXTO.si_seguimos_igual}:</b> {PANTALLA.si_seguimos_igual_1} <C x={x} id={e.si_seguimos_igual.mes} /> {PANTALLA.si_seguimos_igual_2}.
          </p>
          <div className="celda-caja">
            <p>
              <b>{PANTALLA.por_que_este}:</b> <D x={x} p="/recomendado/por_que" />
            </p>
            <p>
              <b>{PANTALLA.por_que_no_el_otro}:</b> <D x={x} p="/recomendado/por_que_no_el_otro" />
            </p>
          </div>
        </Hoja>

        <Hoja n={5} titulo={`${PANTALLA.foda} · ${PANTALLA.cruces}`}>
          <div className="doc-foda">
            {CUADRANTES_FODA.map((q) => (
              <div key={q}>
                <p className="t-etiqueta">{PANTALLA.cuadrantes[q]}</p>
                {e.foda[q].map((it, i) => (
                  <p key={it.de}>
                    <D x={x} p={`/foda/${q}/${i}/texto`} /> <small>({PANTALLA.de_camino(caminoDeLente(it.lente))})</small>
                  </p>
                ))}
              </div>
            ))}
          </div>
          <table>
            <thead>
              <tr>
                <Th c="" />
                <Th c={PANTALLA.cruces} />
                <Th c={PANTALLA.indicador} />
              </tr>
            </thead>
            <tbody>
              {e.tows.map((t, i) => (
                <tr key={t.de}>
                  <Td c={t.cuadrante} b />
                  <Td c={<D x={x} p={`/tows/${i}/estrategia`} />} />
                  <Td c={<D x={x} p={`/tows/${i}/indicador`} />} />
                </tr>
              ))}
            </tbody>
          </table>
        </Hoja>

        <Hoja n={6} titulo={PANTALLA.canvas}>
          <div className="doc-canvas">
            {BLOQUES_CANVAS.map((k) => (
              <div key={k}>
                <p className="t-etiqueta">
                  {PANTALLA.bloques_canvas[k]} · {PANTALLA.estado_canvas[e.anexos.terreno.canvas[k]?.estado ?? ""] ?? TEXTO.sin_dato}
                </p>
                <p>
                  <D x={x} p={`/anexos/terreno/canvas/${k}/texto`} />
                </p>
              </div>
            ))}
          </div>
        </Hoja>

        <Hoja n={7} titulo={`${PANTALLA.arbol_problemas} · ${PANTALLA.arbol_soluciones}`}>
          {e.anexos.terreno.arbol.problemas.map((pr, i) => (
            <div key={i} className="doc-arbol">
              <p>
                <b>
                  <D x={x} p={`/anexos/terreno/arbol/problemas/${i}/efecto`} />
                </b>
              </p>
              <ul className="doc-lista">
                {pr.causas.map((_c, j) => (
                  <li key={j}>
                    <D x={x} p={`/anexos/terreno/arbol/problemas/${i}/causas/${j}/causa`} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <table>
            <tbody>
              {e.anexos.terreno.arbol.soluciones.map((s, i) => (
                <tr key={i}>
                  <Td c={<D x={x} p={`/anexos/terreno/arbol/soluciones/${i}/causa`} />} />
                  <Td c={<D x={x} p={`/anexos/terreno/arbol/soluciones/${i}/medio`} />} b />
                  <Td c={`${PANTALLA.aterriza[s.aterriza_en] ?? ""}: ${textoEn(e, `/anexos/terreno/arbol/soluciones/${i}/que`) ?? ""}`} />
                </tr>
              ))}
            </tbody>
          </table>
        </Hoja>

        <Hoja n={8} titulo={PANTALLA.oferta}>
          <h2>
            <D x={x} p="/oferta/nombre" />
          </h2>
          <p>
            <b>{PANTALLA.oferta_campos.promesa}:</b> <D x={x} p="/oferta/promesa" />
          </p>
          <p>
            <b>{PANTALLA.oferta_campos.garantia}:</b> <D x={x} p="/oferta/garantia" />
          </p>
          <div className="celda-caja">
            <p>
              <D x={x} p="/oferta/oferta_escrita" />
            </p>
          </div>
        </Hoja>

        <Hoja n={9} titulo={PANTALLA.fugas}>
          <table>
            <tbody>
              {[...cu.fugas.caja, cu.fugas.total_caja, ...cu.fugas.oportunidad, ...cu.fugas.parado, cu.noventa_diez]
                .filter((id) => x.refs.has(id))
                .map((id) => (
                  <tr key={id}>
                    <Td c={x.refs.get(id)!.nombre} b />
                    <Td c={<C x={x} id={id} />} />
                  </tr>
                ))}
            </tbody>
          </table>
        </Hoja>

        <Hoja n={10} titulo={PANTALLA.medir}>
          <table>
            <thead>
              <tr>
                {PANTALLA.medir_columnas.slice(0, 4).map((c) => (
                  <Th key={c} c={c} />
                ))}
              </tr>
            </thead>
            <tbody>
              {e.medir_desde_el_dia_1.map((m, i) => (
                <tr key={i}>
                  <Td c={<D x={x} p={`/medir_desde_el_dia_1/${i}/nombre`} />} b />
                  <Td c={<D x={x} p={`/medir_desde_el_dia_1/${i}/como_se_mide`} />} />
                  <Td c={<D x={x} p={`/medir_desde_el_dia_1/${i}/quien_anota`} />} />
                  <Td c={PANTALLA.frecuencia[m.frecuencia] ?? m.frecuencia} />
                </tr>
              ))}
            </tbody>
          </table>
        </Hoja>

        <Hoja n={11} titulo={`${PANTALLA.supuestos} · ${PANTALLA.faltan}`}>
          <table>
            <tbody>
              {e.supuestos.map((s, i) => (
                <tr key={s.id}>
                  <Td c={<D x={x} p={`/supuestos/${i}/que_se_supone`} />} b />
                  <Td c={x.refs.get(`S:${s.id}`)?.texto ?? TEXTO.sin_dato} />
                  <Td c={esperanEnPalabras(s.usado_en, e).join(", ")} />
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="doc-lista">
            {e.destraban.map((d) => (
              <li key={d.id}>
                <b>{sinIds(d.que_falta, e)}</b>
                {d.pregunta ? ` — «${d.pregunta}»` : ""}
              </li>
            ))}
          </ul>
        </Hoja>

        <Hoja n={12} titulo={PANTALLA.confianza}>
          <div className="celda-caja">
            <p>{sinIds(e.nota_de_confianza, e)}</p>
          </div>
        </Hoja>
      </article>
    </>
  );
}
