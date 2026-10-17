import type { Rango } from "@/lib/dato-oral";
import type { Calculo } from "@/lib/finanzas";
import type { ClaseRef } from "@/lib/estrategia/paquete";
import { textoDeValor } from "@/lib/estrategia/paquete";
import { configDeCalculos } from "@/lib/estrategia/calculos";
import { CUADRANTES_FODA } from "@/lib/estrategia/armar";
import { BLOQUES_CANVAS } from "@/lib/estrategia/esquemas";
import { chipConsultora, textoPintado, type Trozo } from "@/lib/estrategia/texto";
import { caminoDeLente, sinIds, textoDeFodaSeguro, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import { CHIP_CONSULTORA, PANTALLA, TEXTO } from "@/lib/estrategia/textos";
import { Frase } from "./Frase";
import { Cifra, T } from "./Texto";
import { Grupo } from "./Grupos";

/**
 * EL ANÁLISIS (spec-estrategia-8x.md §8.1, punto 3, segundo grupo plegado): cómo lo ve cada camino, la restricción,
 * el FODA y los cruces con su impacto calculado y «cómo se calculó», el canvas de nueve bloques con su estado, los
 * árboles de problemas y de soluciones, el terreno propio, la oferta, las fugas y el 90/10, el poder del uno, duplicar
 * y triplicar, lo que deja cada producto y la dependencia del dueño. Todas las cifras salen de las cuentas del código
 * (con su chip); el modelo no escribió ninguna.
 */

const CLASE_CANVAS: Record<string, string> = { comprobado: "ok", por_validar: "espera", contradicho: "alto" };

/** Un impacto calculado por el código como cifra pintable, con su fórmula y qué tan firme es. */
function trozoDeCalculo(c: Calculo<Rango>, clase: ClaseRef, unidad: "soles", cfg: ReturnType<typeof configDeCalculos>): Trozo {
  if (!c.valor) return { t: "cifra", texto: TEXTO.sin_dato, chip: CHIP_CONSULTORA.sin_dato, clase: "sin_dato", rayado: true, detalle: [{ etiqueta: PANTALLA.por_que_sin_cifra, texto: sinIds(c.motivo_nulo ?? PANTALLA.faltan_datos) }] };
  return {
    t: "cifra",
    texto: textoDeValor(c.valor, unidad, cfg, { redondear: true }),
    chip: chipConsultora("C:", { clase }),
    clase,
    rayado: false,
    detalle: [
      { etiqueta: PANTALLA.como_se_calcula, texto: c.formula },
      { etiqueta: PANTALLA.periodo, texto: c.periodo },
    ],
  };
}

/** Una lista de cuentas del código por sus ids: el nombre y la cifra con su chip. Las que no existen no se muestran. */
function Cuentas({ x, ids, donde }: { x: VistaEstrategia; ids: readonly string[]; donde: string }) {
  const hay = ids.filter((id) => x.refs.has(id));
  if (!hay.length) return <p className="sin-dato">{TEXTO.sin_dato}</p>;
  return (
    <ul className="cuentas">
      {hay.map((id) => (
        <li key={id} className="cuenta">
          <span className="cuenta__nombre">{x.refs.get(id)!.nombre}</span>
          <span className="cuenta__valor">
            <Cifra x={x} id={id} donde={donde} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Bloque({ titulo, children, ancho = false }: { titulo: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <section className={`analisis__bloque${ancho ? " analisis__bloque--ancho" : ""}`} aria-label={titulo}>
      <h3 className="analisis__titulo">{titulo}</h3>
      {children}
    </section>
  );
}

export function Analisis({ x }: { x: VistaEstrategia }) {
  const e = x.e;
  const an = e.anexos;
  const cfg = configDeCalculos(x.v.calculos);
  const lentes = { dinero: x.v.lente_dinero, terreno: x.v.lente_terreno };
  const cu = an.cuentas;
  return (
    <Grupo id="analisis" titulo={PANTALLA.grupo_analisis} sub={PANTALLA.grupo_analisis_sub}>
      <div className="analisis">
        <Bloque titulo={PANTALLA.como_lo_ve(TEXTO.camino_del_dinero)}>
          <T x={x} p="/anexos/dinero/lectura" como="p" />
          <h4 className="t-etiqueta">{PANTALLA.modelo_de_dinero}</h4>
          <T x={x} p="/anexos/dinero/modelo_de_dinero/como_entra_hoy" como="p" />
          {an.dinero.modelo_de_dinero.que_falta.length > 0 && (
            <>
              <h4 className="t-etiqueta">{PANTALLA.le_falta}</h4>
              <ul className="detalle-lista">
                {an.dinero.modelo_de_dinero.que_falta.map((_q, i) => (
                  <li key={i}>
                    <T x={x} p={`/anexos/dinero/modelo_de_dinero/que_falta/${i}`} />
                  </li>
                ))}
              </ul>
            </>
          )}
          <h4 className="t-etiqueta">{PANTALLA.la_caja}</h4>
          <T x={x} p="/anexos/dinero/caja" como="p" />
        </Bloque>

        <Bloque titulo={PANTALLA.como_lo_ve(TEXTO.camino_de_la_operacion)}>
          <T x={x} p="/anexos/terreno/lectura" como="p" />
          <h4 className="t-etiqueta">{PANTALLA.restriccion}</h4>
          <T x={x} p="/anexos/terreno/restriccion/cual" como="p" clase="analisis__destacado" />
          <p className="t-etiqueta">{PANTALLA.por_que_manda}</p>
          <T x={x} p="/anexos/terreno/restriccion/por_que_manda" como="p" />
          <dl className="analisis__filas">
            {(["personas", "procesos", "producto"] as const).map((k) => (
              <div key={k} className="detalle-fila">
                <dt>{PANTALLA[k]}</dt>
                <dd>
                  <T x={x} p={`/anexos/terreno/${k}`} />
                </dd>
              </div>
            ))}
            <div className="detalle-fila">
              <dt>{PANTALLA.dependencia}</dt>
              <dd>
                <T x={x} p="/anexos/terreno/dependencia_del_dueno" />
              </dd>
            </div>
            <div className="detalle-fila">
              <dt>{PANTALLA.tiempo_del_dueno}</dt>
              <dd>
                <T x={x} p="/anexos/terreno/tiempo_del_dueno" />
              </dd>
            </div>
          </dl>
        </Bloque>

        <Bloque titulo={PANTALLA.foda} ancho>
          <div className="foda">
            {CUADRANTES_FODA.map((q) => (
              <div key={q} className="foda__cuadrante" data-cuadrante={q}>
                <h4>{PANTALLA.cuadrantes[q]}</h4>
                {e.foda[q].length ? (
                  <ul>
                    {e.foda[q].map((it, i) => (
                      <li key={it.de}>
                        <T x={x} p={`/foda/${q}/${i}/texto`} />
                        <small>
                          {PANTALLA.de_camino(caminoDeLente(it.lente))}
                          {(q === "o" || q === "a") && it.sin_fuente_externa && <span className="estado espera">{PANTALLA.falta_investigar}</span>}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sin-dato">{TEXTO.sin_dato}</p>
                )}
              </div>
            ))}
          </div>
        </Bloque>

        <Bloque titulo={PANTALLA.cruces} ancho>
          <ul className="cruces">
            {e.tows.map((t, i) => {
              const cruza = t.cruza.map((id) => textoDeFodaSeguro(id, e, lentes, x.refs)).filter((s): s is string => !!s).map((s) => textoPintado(s, x.refs, "consultora"));
              const im = t.impacto;
              const caja = !!im.caja_una_vez.valor && !(im.caja_una_vez.valor.bajo === 0 && im.caja_una_vez.valor.alto === 0);
              return (
                <li key={t.de} className="cruce">
                  <p className="cruce__cabeza">
                    <span className="estado neutro">{t.cuadrante}</span>
                    <small>{PANTALLA.de_camino(caminoDeLente(t.lente))}</small>
                  </p>
                  <T x={x} p={`/tows/${i}/estrategia`} como="p" clase="cruce__estrategia" />
                  {cruza.length > 0 && (
                    <p className="nota">
                      {PANTALLA.cruza}: {cruza.map((c) => `“${c}”`).join(` ${PANTALLA.con} `)}
                    </p>
                  )}
                  <div className="cruce__impacto">
                    <span className="t-etiqueta">{PANTALLA.impacto}</span>{" "}
                    {im.estado === "con_numero" ? (
                      <>
                        <Frase trozos={[trozoDeCalculo(caja ? im.caja_una_vez : im.utilidad_mes, im.clase, "soles", cfg)]} id={`cruce-${i}`} /> <small>{caja ? PANTALLA.de_una_vez : PANTALLA.al_mes}</small>
                      </>
                    ) : im.estado === "por_probar" ? (
                      <>
                        <span className="por-probar">{TEXTO.por_probar}</span> <small>{PANTALLA.falta_saber} {im.por_probar.map((f) => sinIds(f.que_falta, e)).join("; ")}</small>
                      </>
                    ) : im.estado === "sin_efecto" ? (
                      <span className="t-dato">
                        {PANTALLA.sin_cuenta_pregunta} <T x={x} p={`/tows/${i}/pregunta_si_no_hay_cuenta`} />
                      </span>
                    ) : (
                      <span className="t-dato">{sinIds(im.utilidad_mes.motivo_nulo, e)}</span>
                    )}
                    {im.texto_origen && (
                      <small className="cruce__origen">
                        {PANTALLA.como_se_calculo}: {sinIds(im.texto_origen, e)}
                      </small>
                    )}
                  </div>
                  <dl className="analisis__filas">
                    <div className="detalle-fila">
                      <dt>{PANTALLA.recursos}</dt>
                      <dd>
                        <T x={x} p={`/tows/${i}/recursos`} />
                      </dd>
                    </div>
                    <div className="detalle-fila">
                      <dt>{PANTALLA.cambio_de_estructura}</dt>
                      <dd>
                        <T x={x} p={`/tows/${i}/cambio_de_estructura`} />
                      </dd>
                    </div>
                    <div className="detalle-fila">
                      <dt>{PANTALLA.indicador}</dt>
                      <dd>
                        <T x={x} p={`/tows/${i}/indicador`} /> <small>{PANTALLA.plazo(t.plazo_dias)}</small>
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        </Bloque>

        <Bloque titulo={PANTALLA.canvas} ancho>
          <div className="canvas-bloques">
            {BLOQUES_CANVAS.map((k) => {
              const b = an.terreno.canvas[k];
              return (
                <div key={k} className="canvas-bloque">
                  <p className="canvas-bloque__nombre">
                    <span>{PANTALLA.bloques_canvas[k] ?? k}</span>
                    {b && <span className={`estado ${CLASE_CANVAS[b.estado] ?? "neutro"}`}>{PANTALLA.estado_canvas[b.estado] ?? b.estado}</span>}
                  </p>
                  {b ? <T x={x} p={`/anexos/terreno/canvas/${k}/texto`} /> : <span className="sin-dato">{TEXTO.sin_dato}</span>}
                </div>
              );
            })}
          </div>
        </Bloque>

        <Bloque titulo={PANTALLA.arbol_problemas}>
          <ul className="arbol">
            {an.terreno.arbol.problemas.map((pr, i) => (
              <li key={i}>
                <T x={x} p={`/anexos/terreno/arbol/problemas/${i}/efecto`} clase="arbol__efecto" />
                <span className="t-etiqueta">{PANTALLA.causas}</span>
                <ul>
                  {pr.causas.map((_c, j) => (
                    <li key={j}>
                      <T x={x} p={`/anexos/terreno/arbol/problemas/${i}/causas/${j}/causa`} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo={PANTALLA.arbol_soluciones}>
          <ul className="arbol">
            {an.terreno.arbol.soluciones.map((so, i) => (
              <li key={i}>
                <T x={x} p={`/anexos/terreno/arbol/soluciones/${i}/medio`} clase="arbol__efecto" />
                <small>
                  <T x={x} p={`/anexos/terreno/arbol/soluciones/${i}/causa`} /> → {PANTALLA.aterriza[so.aterriza_en] ?? ""}: <T x={x} p={`/anexos/terreno/arbol/soluciones/${i}/que`} />
                </small>
              </li>
            ))}
          </ul>
        </Bloque>

        <Bloque titulo={PANTALLA.terreno}>
          <dl className="analisis__filas">
            {(["eliminar", "reducir", "incrementar", "crear"] as const).map((k) => (
              <div key={k} className="detalle-fila">
                <dt>{PANTALLA.terreno_filas[k]}</dt>
                <dd>
                  {an.terreno.terreno[k].length ? (
                    an.terreno.terreno[k].map((_t, i) => <T key={i} x={x} p={`/anexos/terreno/terreno/${k}/${i}`} clase="terreno__item" />)
                  ) : (
                    <span className="sin-dato">{TEXTO.sin_dato}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="t-etiqueta">{PANTALLA.donde_ganar}</p>
          <T x={x} p="/anexos/terreno/terreno/donde_ganar_sin_pelear" como="p" />
        </Bloque>

        <Bloque titulo={PANTALLA.oferta} ancho>
          <dl className="analisis__filas">
            <div className="detalle-fila">
              <dt>{PANTALLA.oferta_campos.para_quien}</dt>
              <dd>
                <T x={x} p="/oferta/para_quien" />
              </dd>
            </div>
            {(["resultado_sonado", "probabilidad_percibida", "tiempo", "esfuerzo"] as const).map((k) => (
              <div key={k} className="detalle-fila">
                <dt>{PANTALLA.oferta_terminos[k]}</dt>
                <dd>
                  <T x={x} p={`/oferta/${k}/texto`} />
                </dd>
              </div>
            ))}
            {(["nombre", "promesa", "garantia", "urgencia_real"] as const).map((k) => (
              <div key={k} className="detalle-fila">
                <dt>{PANTALLA.oferta_campos[k]}</dt>
                <dd>
                  <T x={x} p={`/oferta/${k}`} />
                </dd>
              </div>
            ))}
            {e.oferta.bonos.length > 0 && (
              <div className="detalle-fila">
                <dt>{PANTALLA.bonos}</dt>
                <dd>
                  {e.oferta.bonos.map((_b, i) => (
                    <T key={i} x={x} p={`/oferta/bonos/${i}`} clase="terreno__item" />
                  ))}
                </dd>
              </div>
            )}
            <div className="detalle-fila">
              <dt>{PANTALLA.oferta_campos.precio}</dt>
              <dd>{e.oferta.precio ? <Cifra x={x} id={e.oferta.precio} donde="oferta-precio" /> : <span className="sin-dato">{TEXTO.sin_dato}</span>}</dd>
            </div>
          </dl>
          <p className="t-etiqueta">{PANTALLA.oferta_escrita}</p>
          <blockquote className="oferta-escrita">
            <T x={x} p="/oferta/oferta_escrita" como="p" largo />
          </blockquote>
        </Bloque>

        <Bloque titulo={PANTALLA.fugas}>
          <h4 className="t-etiqueta">{PANTALLA.fugas_bolsas.caja}</h4>
          <Cuentas x={x} ids={cu.fugas.caja} donde="fugas-caja" />
          <Cuentas x={x} ids={[cu.fugas.total_caja, cu.fugas.vitales]} donde="fugas-total" />
          <h4 className="t-etiqueta">{PANTALLA.fugas_bolsas.horas}</h4>
          <Cuentas x={x} ids={cu.fugas.horas} donde="fugas-horas" />
          <h4 className="t-etiqueta">{PANTALLA.fugas_bolsas.oportunidad}</h4>
          <Cuentas x={x} ids={cu.fugas.oportunidad} donde="fugas-oport" />
          <h4 className="t-etiqueta">{PANTALLA.fugas_bolsas.parado}</h4>
          <Cuentas x={x} ids={cu.fugas.parado} donde="fugas-parado" />
          <Cuentas x={x} ids={[cu.noventa_diez]} donde="noventa-diez" />
        </Bloque>

        <Bloque titulo={PANTALLA.poder}>
          <h4 className="t-etiqueta">{PANTALLA.poder_utilidad}</h4>
          <Cuentas x={x} ids={cu.poder.utilidad} donde="poder-u" />
          <h4 className="t-etiqueta">{PANTALLA.poder_caja}</h4>
          <Cuentas x={x} ids={cu.poder.caja} donde="poder-c" />
          <h4 className="t-etiqueta">{PANTALLA.poder_juntas}</h4>
          <Cuentas x={x} ids={[cu.poder.utilidad_juntas, cu.poder.caja_juntas]} donde="poder-j" />
        </Bloque>

        <Bloque titulo={PANTALLA.multiplicador}>
          <Cuentas x={x} ids={cu.multiplicador} donde="mult" />
          {e.por_que_no_llega && (
            <>
              <p className="t-etiqueta">{PANTALLA.por_que_no_llega}</p>
              <T x={x} p="/por_que_no_llega" como="p" />
            </>
          )}
          <h4 className="t-etiqueta">{PANTALLA.equilibrio}</h4>
          <Cuentas x={x} ids={cu.equilibrio} donde="equilibrio" />
        </Bloque>

        <Bloque titulo={PANTALLA.productos}>
          <Cuentas x={x} ids={cu.productos.filter((id) => id.endsWith(".deja_mes") || id.endsWith(".margen_pct"))} donde="productos" />
          <h4 className="t-etiqueta">{PANTALLA.dependencia}</h4>
          <p>
            <Cifra x={x} id={cu.dependencia} donde="dependencia" />
          </p>
        </Bloque>
      </div>
    </Grupo>
  );
}
