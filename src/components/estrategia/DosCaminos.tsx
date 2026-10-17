import type { ReactNode } from "react";
import { contextoLimites, supuestoDeEfecto, type CaminoFinal, type JugadaFinal, type LetraCamino } from "@/lib/estrategia/armar";
import { CERO } from "@/lib/estrategia/cuentas";
import { limitesDe } from "@/lib/estrategia/supuestos";
import { conteoDeOrigen, nombreCamino, sinIds, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import { casosDelDueno } from "@/lib/estrategia/validador";
import { MESES } from "@/lib/temporadas";
import { CHIP_CONSULTORA, PANTALLA, TEXTO } from "@/lib/estrategia/textos";
import { Icono } from "@/components/base/Icono";
import { Cifra, T } from "./Texto";
import { idHtml } from "./Frase";
import { ElegirCamino } from "./ElegirYAprobar";
import { EditarSupuesto } from "./EditarSupuesto";

/**
 * LOS DOS CAMINOS LADO A LADO (spec-estrategia-8x.md §8.1, punto 3; revisión de producto del 17-10).
 *
 * Arriba, para elegir de un vistazo, la comparación: lo que deja cada uno a 90 días, la caja que libera de una vez,
 * cuántas veces la utilidad de hoy, qué pide, lo que hay que cuidar y en qué caso conviene. Debajo, la recomendación de
 * 8X a lo ancho (en la cabeza del A dejaba un hueco en el B). Después las dos tarjetas, con las mismas secciones en el
 * mismo orden, alineadas renglón por renglón: el nombre y la filosofía; lo que deja a 90 días, en grande, con la caja
 * que libera y de dónde sale contado en una línea (la lista, al tocar); las jugadas en el orden en que se juegan, con
 * su cifra; y los casos a tener en cuenta. En «Ver el detalle»: qué responde el mercado y qué hacemos si responde
 * distinto, qué abre cada jugada, los números a 14, 30 y 90 días, qué pide, qué anticipar, las señales y el punto de
 * decisión. Debajo de los dos, «Si seguimos igual». En un celular, uno debajo del otro, con «A · B» fijo para saltar.
 */

const iguales = (a: { bajo: number; alto: number } | null | undefined, b: { bajo: number; alto: number }) => !!a && a.bajo === b.bajo && a.alto === b.alto;
/** Un cero calculado (no un «sin dato»: eso es null). */
const esCero = (v: { bajo: number; alto: number } | null | undefined) => iguales(v, CERO);

/** «2026-12» → «diciembre de 2026». */
function mesEnPalabras(aaaamm: string): string {
  const [a, m] = aaaamm.split("-");
  const mes = MESES[Number(m) - 1]?.nombre;
  return mes ? `${mes.toLowerCase()} de ${a}` : aaaamm;
}

/** La cifra de una jugada en su renglón: lo que deja al mes, la caja de una vez, las horas, o por qué no tiene número. */
function CifraDeJugada({ x, c, j }: { x: VistaEstrategia; c: CaminoFinal; j: JugadaFinal }) {
  const pj = c.proyeccion.jugadas.find((p) => p.id === j.id)?.proyeccion;
  const donde = `fila-${c.letra}-${j.id}`;
  if (!j.efecto || !pj) {
    return <span className="jugada__sin">{j.efecto_retirado ? `${PANTALLA.sin_cuenta}: ${sinIds(j.efecto_retirado.motivo, x.e)}` : PANTALLA.sin_cuenta}</span>;
  }
  switch (pj.estado) {
    case "por_probar":
      return (
        <span className="jugada__por-probar">
          <span className="por-probar">{TEXTO.por_probar}</span>
          <small>
            {PANTALLA.falta_saber} {pj.por_probar.map((f) => sinIds(f.que_falta, x.e)).join("; ")}
          </small>
        </span>
      );
    case "habilitador":
      return <small className="jugada__abre">{x.refs.get(`R:${c.letra}.${j.id}.mes`)?.texto ?? ""}</small>;
    case "invalida":
      return (
        <span className="jugada__sin">
          {PANTALLA.no_se_calcula}: {sinIds(pj.invalida, x.e)}
        </span>
      );
    case "mueve_horas":
      return (
        <span className="jugada__cifra-valor">
          <Cifra x={x} id={`R:${c.letra}.${j.id}.mes`} donde={donde} />
        </span>
      );
    default: {
      const soloCaja = iguales(pj.utilidad_mes.valor, CERO) && !!pj.caja_una_vez.valor && !iguales(pj.caja_una_vez.valor, CERO);
      return (
        <span className="jugada__cifra-valor">
          <Cifra x={x} id={`R:${c.letra}.${j.id}.${soloCaja ? "caja" : "mes"}`} donde={donde} /> <small>{soloCaja ? PANTALLA.de_una_vez : PANTALLA.al_mes}</small>
        </span>
      );
    }
  }
}

/** «desde el día 7 · Rosa» (o «responsable por definir»). */
function meta(j: JugadaFinal): string {
  return [PANTALLA.desde_el_dia(j.desde_dia), j.responsable_encontrado ? j.responsable : PANTALLA.por_definir].join(" · ");
}

function Jugadas({ x, c }: { x: VistaEstrategia; c: CaminoFinal }) {
  return (
    <section className="camino__fila camino__jugadas" aria-label={`${PANTALLA.jugadas}: ${nombreCamino(c.letra)}`}>
      <h4 className="t-etiqueta">{PANTALLA.jugadas}</h4>
      <ol className="jugadas">
        {c.jugadas.map((j, i) => {
          const pj = c.proyeccion.jugadas.find((p) => p.id === j.id)?.proyeccion;
          const pregunta = pj?.estado === "por_probar" ? pj.por_probar.map((f) => f.pregunta).filter(Boolean)[0] : null;
          return (
            <li key={j.id} className="jugada" data-estado={pj?.estado ?? "sin_cuenta"}>
              <span className="jugada__n" aria-hidden="true">{i + 1}</span>
              <div className="jugada__cuerpo">
                <T x={x} p={`/caminos/${c.letra}/jugadas/${i}/que_se_mueve`} clase="jugada__que" />
                <small className="jugada__meta">{meta(j)}</small>
                {pregunta && (
                  <small className="jugada__pregunta">
                    {PANTALLA.se_destraba_con}: «{pregunta}»
                  </small>
                )}
              </div>
              <div className="jugada__cifra">
                <CifraDeJugada x={x} c={c} j={j} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** ¿Libera caja de una vez a los 90 días? (Un cero calculado no es caja.) */
const liberaCaja = (x: VistaEstrategia, l: LetraCamino) => {
  const v = x.refs.get(`R:${l}.caja.d90`)?.valor;
  return !!v && !esCero(v);
};

const CLASE_ORIGEN: Record<string, string> = { hecho: "ok", estimado: "espera", supuesto: "espera", sin_dato: "neutro" };
const CHIP_ORIGEN: Record<string, string> = { hecho: CHIP_CONSULTORA.hecho, estimado: CHIP_CONSULTORA.estimado, supuesto: CHIP_CONSULTORA.supuesto, sin_dato: CHIP_CONSULTORA.sin_dato };

/** De dónde sale lo que deja el camino: una línea con los conteos; la lista entera, al tocar (un popover nativo). */
function Origen({ c }: { c: CaminoFinal }) {
  const origen = c.proyeccion.jugadas.filter((j) => j.proyeccion.estado === "con_numero").flatMap((j) => j.proyeccion.origen);
  const { linea, lista } = conteoDeOrigen(origen);
  if (!linea) return null;
  const panel = idHtml(`origen-${c.letra}`);
  return (
    <p className="camino__origen">
      <span>{linea}</span>{" "}
      <button type="button" className="enlace-azul camino__origen-ver" popoverTarget={panel}>
        {PANTALLA.ver_origen}
      </button>
      <span id={panel} popover="auto" className="cifra-detalle" role="dialog" aria-label={PANTALLA.origen_titulo}>
        <span className="cifra-detalle__titulo">{PANTALLA.origen_titulo}</span>
        {lista.map((o) => (
          <span key={o.nombre} className="cifra-detalle__fila origen-fila">
            <span>{o.nombre}</span>
            <span className={`estado ${CLASE_ORIGEN[o.clase] ?? "neutro"}`}>{CHIP_ORIGEN[o.clase] ?? o.clase}</span>
          </span>
        ))}
        <button type="button" className="enlace-azul cifra-detalle__cerrar" popoverTarget={panel} popoverTargetAction="hide">
          {PANTALLA.cerrar}
        </button>
      </span>
    </p>
  );
}

/** Lo que deja el camino a 90 días, en grande y justo bajo su nombre, con la caja que libera de una vez. */
function A90({ x, c }: { x: VistaEstrategia; c: CaminoFinal }) {
  const p = c.proyeccion;
  const total = p.total.d90.ritmo.valor;
  return (
    <section className="camino__fila camino__a90" aria-label={`${PANTALLA.a_90}: ${nombreCamino(c.letra)}`}>
      <h4 className="t-etiqueta">{PANTALLA.a_90}</h4>
      {total ? (
        <p className="camino__a90-cifra">
          <Cifra x={x} id={`R:${c.letra}.total.d90`} donde={`a90-${c.letra}`} /> <span>{PANTALLA.mas_al_mes}</span>
        </p>
      ) : (
        <p className="sin-dato">{PANTALLA.sin_numero_90}</p>
      )}
      {liberaCaja(x, c.letra) && (
        <p className="camino__a90-caja">
          {PANTALLA.y_libera} <Cifra x={x} id={`R:${c.letra}.caja.d90`} donde={`caja90-${c.letra}`} /> {PANTALLA.de_caja_una_vez}
        </p>
      )}
      <Origen c={c} />
      {p.cuantas_por_probar > 0 && <p className="nota">{PANTALLA.por_probar_fuera(p.cuantas_por_probar)}</p>}
    </section>
  );
}

function Casos({ x, c }: { x: VistaEstrategia; c: CaminoFinal }) {
  return (
    <section className="camino__fila camino__casos" aria-label={`${PANTALLA.casos}: ${nombreCamino(c.letra)}`}>
      <h4 className="t-etiqueta">{PANTALLA.casos}</h4>
      <ul className="casos">
        {c.casos.map((_k, i) => (
          <li key={i} className="caso">
            <span className="caso__si">
              <span className="caso__rotulo">{PANTALLA.si_pasa}</span>
              <T x={x} p={`/caminos/${c.letra}/casos/${i}/caso`} />
            </span>
            <span className="caso__haremos">
              <span className="caso__rotulo">{PANTALLA.haremos}</span>
              <T x={x} p={`/caminos/${c.letra}/casos/${i}/solucion`} />
            </span>
            <small className="caso__senal">
              <span>{PANTALLA.lo_avisa}:</span> <T x={x} p={`/caminos/${c.letra}/casos/${i}/senal`} />
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Una fila «rótulo: texto» del detalle. */
function Fila({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="detalle-fila">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Detalle({ x, c }: { x: VistaEstrategia; c: CaminoFinal }) {
  const l = c.letra;
  const base = `/caminos/${l}`;
  const ctx = contextoLimites(x.refs);
  return (
    <details className="camino__fila camino__detalle plegado">
      <summary>
        <span>{PANTALLA.ver_detalle}</span>
        <Icono nombre="abajo" />
      </summary>
      <div className="camino__detalle-cuerpo">
        <h5 className="t-etiqueta">{PANTALLA.cada_jugada}</h5>
        {c.jugadas.map((j, i) => {
          const s = j.efecto ? supuestoDeEfecto(j.efecto) : null;
          const k = s ? x.e.supuestos.findIndex((y) => y.id === s.id) : -1;
          const sup = k >= 0 ? x.e.supuestos[k]! : null;
          const lim = sup ? limitesDe(sup.clave, ctx) : null;
          return (
            <div key={j.id} className="detalle-jugada">
              <p className="detalle-jugada__titulo">
                <b>{PANTALLA.jugada(i + 1)}</b>
              </p>
              <dl>
                <Fila rotulo={PANTALLA.por_que}>
                  <T x={x} p={`${base}/jugadas/${i}/por_que`} />
                </Fila>
                <Fila rotulo={PANTALLA.responde_el_mercado}>
                  <T x={x} p={`${base}/jugadas/${i}/respuesta_del_mercado`} />
                </Fila>
                {j.si_responde_distinto && (
                  <Fila rotulo={PANTALLA.si_responde_distinto}>
                    <T x={x} p={`${base}/jugadas/${i}/si_responde_distinto`} />
                  </Fila>
                )}
                <Fila rotulo={PANTALLA.que_abre}>
                  <T x={x} p={`${base}/jugadas/${i}/que_abre`} />
                </Fila>
                <Fila rotulo={PANTALLA.quien}>
                  <T x={x} p={`${base}/jugadas/${i}/responsable`} />
                </Fila>
                {sup && (
                  <Fila rotulo={PANTALLA.lo_que_se_supone}>
                    <span>{sup.que_se_supone}: </span>
                    <EditarSupuesto
                      companyId={x.companyId}
                      eid={x.v.id}
                      id={sup.id}
                      texto={x.refs.get(`S:${sup.id}`)?.texto ?? TEXTO.sin_dato}
                      bajo={sup.rango.bajo}
                      alto={sup.rango.alto}
                      unidad={UNIDAD[sup.unidad] ?? sup.unidad}
                      limites={lim?.ok ? [lim.limites[0], lim.limites[1]] : null}
                      editable={x.editable}
                      que={sup.que_se_supone}
                    />
                  </Fila>
                )}
              </dl>
            </div>
          );
        })}

        <h5 className="t-etiqueta">{PANTALLA.numeros}</h5>
        <div className="tabla-numeros" role="table" aria-label={PANTALLA.numeros}>
          <div role="row" className="tabla-numeros__cabeza">
            <span role="columnheader" />
            {[14, 30, 90].map((d) => (
              <span key={d} role="columnheader">{PANTALLA.dias(d)}</span>
            ))}
          </div>
          {(["ritmo", "acumulado", "caja"] as const)
            // Un camino que no libera caja de una vez no lleva esa fila: tres ceros no dicen nada.
            .filter((fila) => fila !== "caja" || (["d14", "d30", "d90"] as const).some((h) => !esCero(x.refs.get(`R:${l}.caja.${h}`)?.valor)))
            .map((fila) => (
              <div key={fila} role="row">
                <span role="rowheader">{PANTALLA.numeros_filas[fila]}</span>
                {(["d14", "d30", "d90"] as const).map((h) => {
                  const id = fila === "ritmo" ? `R:${l}.total.${h}` : fila === "acumulado" ? `R:${l}.total.acum.${h}` : `R:${l}.caja.${h}`;
                  return (
                    <span key={h} role="cell">
                      {/* Un cero calculado (ninguna jugada empezó todavía) se dice, no se pinta como dinero. */}
                      {esCero(x.refs.get(id)?.valor) ? <span className="t-dato tenue">{PANTALLA.aun_nada}</span> : <Cifra x={x} id={id} donde={`num-${l}-${fila}-${h}`} />}
                    </span>
                  );
                })}
              </div>
            ))}
        </div>

        {c.proyeccion.comparacion && <p className="nota">{sinIds(`${c.proyeccion.comparacion.charAt(0).toUpperCase()}${c.proyeccion.comparacion.slice(1)}.`, x.e)}</p>}

        <h5 className="t-etiqueta">{PANTALLA.que_pide}</h5>
        <dl>
          {(["dinero", "horas_del_dueno", "personas", "herramientas"] as const).map((k) => (
            <Fila key={k} rotulo={PANTALLA.pide[k] ?? k}>
              <T x={x} p={`${base}/que_pide/${k}`} />
            </Fila>
          ))}
        </dl>

        {c.anticipar.length > 0 && (
          <>
            <h5 className="t-etiqueta">{PANTALLA.anticipar}</h5>
            <ul className="detalle-lista">
              {c.anticipar.map((a, i) => (
                <li key={i}>
                  <b>{mesEnPalabras(a.cuando)}</b> <T x={x} p={`${base}/anticipar/${i}/evento`} />
                  <span className="detalle-lista__luego">
                    <T x={x} p={`${base}/anticipar/${i}/que_hacemos_antes`} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h5 className="t-etiqueta">{PANTALLA.senales}</h5>
        <ul className="detalle-lista">
          {c.senales_tempranas.map((s, i) => (
            <li key={i}>
              <T x={x} p={`${base}/senales_tempranas/${i}/senal`} />
              <small>
                <T x={x} p={`${base}/senales_tempranas/${i}/indicador`} /> · {PANTALLA.se_mira_el_dia(s.mirar_el_dia)}
              </small>
            </li>
          ))}
        </ul>

        <h5 className="t-etiqueta">{PANTALLA.punto_de_decision(c.punto_de_decision.dia)}</h5>
        <dl>
          <Fila rotulo={PANTALLA.que_mirar}>
            <T x={x} p={`${base}/punto_de_decision/que_mirar`} />
          </Fila>
          <Fila rotulo={PANTALLA.si_va_bien}>
            <T x={x} p={`${base}/punto_de_decision/si_va_bien`} />
          </Fila>
          <Fila rotulo={PANTALLA.si_no}>
            <T x={x} p={`${base}/punto_de_decision/si_no`} />
          </Fila>
        </dl>

        {c.casos.some((k) => k.por_que_puede_pasar) && (
          <>
            <h5 className="t-etiqueta">{PANTALLA.casos}</h5>
            <ul className="detalle-lista">
              {c.casos.map((_k, i) => (
                <li key={i}>
                  <T x={x} p={`${base}/casos/${i}/caso`} como="strong" />
                  <span className="detalle-lista__luego">
                    <span className="t-etiqueta">{PANTALLA.por_que_puede_pasar}:</span> <T x={x} p={`${base}/casos/${i}/por_que_puede_pasar`} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

/** En qué se mide un supuesto, en palabras. */
export const UNIDAD = PANTALLA.unidades_supuesto;

function Eleccion({ x, c }: { x: VistaEstrategia; c: CaminoFinal }) {
  const elegido = x.v.camino_elegido;
  const recomendado = x.e.recomendado.camino === c.letra;
  return (
    <div className="camino__fila camino__eleccion">
      {elegido === c.letra ? (
        <p className="camino__elegido">
          <span className="estado ok">{PANTALLA.elegido}</span>
          {x.v.motivo_eleccion && <span className="nota">{x.v.motivo_eleccion}</span>}
        </p>
      ) : x.editable ? (
        <ElegirCamino companyId={x.companyId} eid={x.v.id} letra={c.letra} nombre={nombreCamino(c.letra)} principal={!elegido && recomendado} />
      ) : null}
    </div>
  );
}

export function TarjetaCamino({ x, letra }: { x: VistaEstrategia; letra: LetraCamino }) {
  const c = x.e.caminos[letra];
  const recomendado = x.e.recomendado.camino === letra;
  return (
    <article id={`camino-${letra}`} className="tarjeta camino" data-recomendado={recomendado ? "" : undefined} data-elegido={x.v.camino_elegido === letra ? "" : undefined} aria-label={nombreCamino(letra)}>
      <header className="camino__fila camino__cabeza">
        <p className="camino__letras">
          <span className="camino__letra">{nombreCamino(letra)}</span>
          {recomendado && <span className="estado ok camino__recomendado">{PANTALLA.recomendado}</span>}
        </p>
        <T x={x} p={`/caminos/${letra}/nombre`} como="h3" clase="camino__nombre" />
        <T x={x} p={`/caminos/${letra}/filosofia`} como="p" clase="camino__filosofia" />
      </header>
      <A90 x={x} c={c} />
      <Jugadas x={x} c={c} />
      <Casos x={x} c={c} />
      <Detalle x={x} c={c} />
      <Eleccion x={x} c={c} />
    </article>
  );
}

/** Una cifra de la comparación, o lo que dice que no la hay (nunca un cero pintado como dinero). */
function CeldaCifra({ x, id, donde, sin }: { x: VistaEstrategia; id: string; donde: string; sin: string }) {
  const v = x.refs.get(id)?.valor;
  if (!v) return <span className="t-dato tenue">{sin}</span>;
  return <Cifra x={x} id={id} donde={donde} />;
}

/**
 * LOS DOS, LADO A LADO (revisión del 17-10): para elegir de un vistazo, antes de bajar a las jugadas. Las mismas filas
 * que la tabla de comparación de una estrategia hecha a mano: lo que deja, la caja, cuántas veces la de hoy, qué pide,
 * lo que hay que cuidar y en qué caso conviene.
 */
function Comparacion({ x }: { x: VistaEstrategia }) {
  const letras = ["a", "b"] as const;
  const fila = (clave: string, celda: (l: LetraCamino) => ReactNode) => (
    <div role="row" className="comparacion__fila">
      <span role="rowheader" className="comparacion__rotulo">{PANTALLA.comparacion_filas[clave]}</span>
      {letras.map((l) => (
        <span key={l} role="cell" className="comparacion__celda">
          {celda(l)}
        </span>
      ))}
    </div>
  );
  return (
    <div className="tarjeta comparacion" role="table" aria-label={PANTALLA.comparacion}>
      <div role="row" className="comparacion__fila comparacion__cabeza">
        <span role="columnheader" className="comparacion__rotulo">{PANTALLA.comparacion}</span>
        {letras.map((l) => (
          <span key={l} role="columnheader" className="comparacion__celda">
            <span className="camino__letra">{nombreCamino(l)}</span>
            {x.e.recomendado.camino === l && <span className="estado ok camino__recomendado">{PANTALLA.recomendado}</span>}
            <T x={x} p={`/caminos/${l}/nombre`} como="strong" clase="comparacion__nombre" />
          </span>
        ))}
      </div>
      {fila("mes", (l) => <CeldaCifra x={x} id={`R:${l}.total.d90`} donde={`cmp-mes-${l}`} sin={PANTALLA.sin_numero_90} />)}
      {fila("caja", (l) => (liberaCaja(x, l) ? <Cifra x={x} id={`R:${l}.caja.d90`} donde={`cmp-caja-${l}`} /> : <span className="t-dato tenue">{PANTALLA.no_libera_caja}</span>))}
      {fila("veces", (l) =>
        x.refs.get(`R:${l}.multiplo.d90`)?.valor ? (
          <>
            <Cifra x={x} id={`R:${l}.multiplo.d90`} donde={`cmp-veces-${l}`} /> <small>{PANTALLA.veces_la_de_hoy}</small>
          </>
        ) : (
          <CeldaCifra x={x} id={`R:${l}.utilidad.d90`} donde={`cmp-util-${l}`} sin={PANTALLA.sin_numero_90} />
        )
      )}
      {fila("pide", (l) => <T x={x} p={`/caminos/${l}/que_pide/dinero`} />)}
      {fila("cuidar", (l) => {
        const i = casosDelDueno(x.e.caminos[l])[0] ?? 0;
        return <T x={x} p={`/caminos/${l}/casos/${i}/caso`} />;
      })}
      {fila("conviene", (l) => <T x={x} p={`/caminos/${l}/conviene_si`} />)}
    </div>
  );
}

/** La recomendación de 8X, a lo ancho: por qué este y por qué no el otro. */
function Recomendacion({ x }: { x: VistaEstrategia }) {
  const l = x.e.recomendado.camino;
  return (
    <section className="tarjeta recomendacion" aria-label={PANTALLA.recomendacion}>
      <p className="recomendacion__cabeza">
        <span className="estado ok">{PANTALLA.recomendado}</span> <b>{nombreCamino(l)}</b> <T x={x} p={`/caminos/${l}/nombre`} />
      </p>
      <dl className="recomendacion__filas">
        <Fila rotulo={PANTALLA.por_que_este}>
          <T x={x} p="/recomendado/por_que" />
        </Fila>
        <Fila rotulo={PANTALLA.por_que_no_el_otro}>
          <T x={x} p="/recomendado/por_que_no_el_otro" />
        </Fila>
      </dl>
    </section>
  );
}

export function DosCaminos({ x }: { x: VistaEstrategia }) {
  const oportunidad = x.refs.get(x.e.si_seguimos_igual.oportunidad);
  return (
    <section className="a-lo-ancho dos-caminos" aria-labelledby="t-caminos">
      <div className="dos-caminos__cabeza">
        <div>
          <h2 id="t-caminos" className="t-seccion">{TEXTO.dos_caminos}</h2>
          <p className="sub">{PANTALLA.dos_caminos_sub}</p>
          {/* Con qué confianza, a la vista (antes vivía plegada en «Cómo se armó»). */}
          {x.e.nota_de_confianza && <p className="dos-caminos__confianza">{sinIds(x.e.nota_de_confianza, x.e)}</p>}
        </div>
      </div>
      {/* Hijo directo de la sección: así queda fijo arriba mientras se bajan las dos tarjetas en un celular. */}
      <nav className="selector-camino no-imprimir" aria-label={PANTALLA.ir_a_camino}>
        {(["a", "b"] as const).map((l) => (
          <a key={l} href={`#camino-${l}`} aria-label={nombreCamino(l)}>
            {l.toUpperCase()}
          </a>
        ))}
      </nav>
      <Comparacion x={x} />
      <Recomendacion x={x} />
      <div className="dos-caminos__tarjetas">
        <TarjetaCamino x={x} letra="a" />
        <TarjetaCamino x={x} letra="b" />
      </div>
      <p className="si-seguimos-igual">
        <span className="t-etiqueta">{TEXTO.si_seguimos_igual}</span>
        <span>
          {PANTALLA.si_seguimos_igual_1} <Cifra x={x} id={x.e.si_seguimos_igual.mes} donde="no-actuar" /> {PANTALLA.si_seguimos_igual_2}.
          {oportunidad?.valor ? (
            <>
              {" "}
              {PANTALLA.si_seguimos_igual_3} <Cifra x={x} id={x.e.si_seguimos_igual.oportunidad} donde="no-actuar-oportunidad" /> {PANTALLA.si_seguimos_igual_4}.
            </>
          ) : null}
        </span>
      </p>
    </section>
  );
}
