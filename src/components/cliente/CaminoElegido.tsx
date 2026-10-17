import { Fragment } from "react";
import Link from "next/link";
import type { FraseDueno, ParaDueno, TrozoDueno } from "@/lib/estrategia/para-dueno";
import { CHIP_DUENO, PARA_DUENO, PORTAL } from "@/lib/estrategia/textos";
import { diaDelCamino } from "@/lib/estrategia/dueno";

/*
CONTRATO DE DIRECCIÓN — el camino que elegimos, en la página del dueño (spec-estrategia-8x.md §8.2)
THESIS: en una mirada, qué vamos a hacer con su empresa y por qué; debajo, los pasos con desde cuándo y quién, lo que
  esperamos ver —en rango y con «si»—, cómo sabremos que funciona y qué haremos si pasa algo. Nada más.
OWN-WORLD: la hoja blanca del portal con los bloques del tablero de Diagnóstico: título en Manrope, bloques con borde
  fino, la cifra grande en Manrope, el chip de estado al lado. Nada que maree.
FINISH: lo que se pinta es lo que se congeló al aprobar (para_dueno), con las cifras ya escritas: sin ids, sin el otro
  camino, sin palabras del método. Un número que todavía no se puede calcular no es un hueco rayado: se dice que lo
  calculamos. El origen de cada cifra va con ella («estimado», «por confirmar», «lo que nos dijiste»).
Sirve igual en «Tu plan», en la vista previa de la consultora antes de aprobar y en la copia de la biblioteca: no lee
nada ni guarda estado (se puede montar dentro de un componente de cliente).
*/

type Props = {
  p: ParaDueno;
  /** Cuándo se aprobó: el día 1 del camino. Sin ella (la vista previa, la biblioteca), los días se dicen «día N». */
  desde?: string | null;
  zona?: string;
  /**
   * Las preguntas enviadas al dueño que siguen sin responder, si su pedido está abierto (por defecto, sí) y dónde se
   * responden. La línea «Tienes N preguntas… Responder» sale solo con preguntas por responder y el pedido abierto: la
   * lista de pedidos ya vive en «Lo que te pidió tu consultora», y no se ofrece lo que la ruta rechazaría. Sin esto (la
   * vista previa, la biblioteca), no hay línea.
   */
  preguntas?: { sin_responder: number; abierta?: boolean; href: string } | null;
  /** 1: el camino es el título de la página («Tu plan»). 2: va dentro de otra página (la vista previa, la biblioteca). */
  nivel?: 1 | 2;
};

/** El color del chip sale del origen: lo que dijo el dueño en verde; lo estimado y lo que falta confirmar, en ámbar. */
function claseChip(chip: string): "ok" | "espera" | "neutro" {
  if (chip === CHIP_DUENO.hecho) return "ok";
  if (chip === CHIP_DUENO.estimado || chip === CHIP_DUENO.supuesto) return "espera";
  return "neutro";
}

/**
 * Un monto («S/ 41,800», «US$ 1,200», «USD 900») no se parte al cortar la línea; un rango («entre S/ X y S/ Y») sí puede
 * bajar entre sus dos montos. En un celular, «S/» quedaba al final de un renglón y la cifra en el siguiente.
 */
const MONTO = /((?:[A-Z]{0,3}[/$€£¥₡₲]|[A-Z]{3})\s?\d[\d.,]*)/u;
function Monto({ texto }: { texto: string }) {
  // split con un grupo: las piezas impares son los montos.
  return <>{texto.split(MONTO).map((p, i) => (i % 2 === 1 ? <span key={i} className="monto-dueno">{p}</span> : p))}</>;
}

/** Una frase con sus cifras: cada cifra lleva su origen al lado, en pequeño. */
function Frase({ f }: { f: FraseDueno | null | undefined }) {
  return (
    <>
      {(f ?? []).map((x: TrozoDueno, i) =>
        x.t === "cifra" ? (
          <span key={i} className="cifra-dueno">
            <b>
              <Monto texto={x.texto} />
            </b>{" "}
            <span className="cifra-dueno__origen">({x.chip})</span>
          </span>
        ) : x.t === "falta" ? (
          <em key={i} className="falta-dueno">{x.texto}</em>
        ) : (
          <Fragment key={i}>{x.texto}</Fragment>
        )
      )}
    </>
  );
}

/**
 * Lo que esperamos ver: cuándo, arriba y en pequeño; la cifra sola en su línea grande, con su origen como marca de
 * estado; y la frase con su «si», al pie (revisión del 17-10: la cifra de 26 px metida en la frase la partía mal).
 */
function Esperado({ f }: { f: FraseDueno }) {
  const k = f.findIndex((x) => x.t === "cifra");
  if (k < 0) {
    return (
      <p className="camino-elegido__esperado esperado__pie">
        <Frase f={f} />
      </p>
    );
  }
  const cifra = f[k] as Extract<TrozoDueno, { t: "cifra" }>;
  const cuando = f.slice(0, k).map((x) => x.texto).join("").replace(/[\s:,]+$/, "");
  const pie = f.slice(k + 1).map((x) => x.texto).join("").trim();
  return (
    <div className="camino-elegido__esperado">
      {cuando && <p className="esperado__cuando">{cuando}</p>}
      <p className="esperado__cifra">
        <b className="cifra">
          <Monto texto={cifra.texto} />
        </b>{" "}
        <span className={`estado ${claseChip(cifra.chip)}`}>{cifra.chip}</span>
      </p>
      {pie && <p className="esperado__pie">{pie}</p>}
    </div>
  );
}

const vacia = (f: FraseDueno | null | undefined) => !f || !f.some((x) => x.texto.trim());

export function CaminoElegido({ p, desde = null, zona, preguntas = null, nivel = 1 }: Props) {
  const T = nivel === 1 ? "h1" : "h2";
  const H = nivel === 1 ? "h2" : "h3";
  const pasos = (p.pasos ?? []).filter((x) => !vacia(x.que));
  const tePedimos = (p.te_pedimos ?? []).filter((x) => !vacia(x));
  const sabremos = (p.como_sabremos ?? []).filter((x) => !vacia(x.senal));
  const casos = (p.casos ?? []).filter((x) => !vacia(x.si_pasa) && !vacia(x.haremos));
  const esperados = [p.esperamos?.d30, p.esperamos?.d90].filter((f): f is FraseDueno => !vacia(f));
  const abierta = preguntas?.abierta !== false;
  const pendientes = preguntas && abierta && preguntas.sin_responder > 0 ? preguntas : null;
  // «Respondas las preguntas de abajo» se congeló al aprobar. Si ya no queda ninguna por responder, no se le pide lo que
  // ya hizo; si su consultora cerró las preguntas, abajo no hay ninguna: se dice lo que de verdad falta.
  const congelada = p.esperamos?.falta ?? null;
  const falta =
    congelada === PARA_DUENO.falta_responder && preguntas
      ? preguntas.sin_responder === 0
        ? PORTAL.ya_respondiste_numeros
        : abierta
          ? congelada
          : PARA_DUENO.falta_datos
      : congelada;
  const cuando = (n: number | null, conFecha: (d: string) => string, sinFecha: (n: number) => string) => {
    if (n == null) return null;
    const d = diaDelCamino(desde, n, zona);
    return d ? conFecha(d) : sinFecha(n);
  };

  return (
    <section className="camino-elegido" aria-labelledby="t-camino">
      <header className="camino-elegido__cabeza">
        <p className="t-etiqueta">{PARA_DUENO.titulo}</p>
        <T id="t-camino" className="t-hero camino-elegido__titulo">
          <Frase f={p.titulo} />
        </T>
        {!vacia(p.por_que) && (
          <p className="camino-elegido__por-que">
            <Frase f={p.por_que} />
          </p>
        )}
      </header>

      {/* En escritorio, dos columnas: a la izquierda los pasos; a la derecha, lo que esperamos ver, la línea de las
          preguntas («respondas las preguntas de abajo») y cómo sabremos. Debajo, a lo ancho, los casos. En un celular,
          una sola columna en el mismo orden en que se lee. */}
      <div className={`camino-elegido__rejilla${pasos.length ? "" : " camino-elegido__rejilla--sola"}`}>
        {pasos.length > 0 && (
          <section className="camino-elegido__bloque" aria-labelledby="t-camino-pasos">
            <H id="t-camino-pasos">{PARA_DUENO.pasos}</H>
            <ol className="pasos-camino">
              {pasos.map((x, i) => {
                const dia = cuando(x.desde_dia, PORTAL.desde_el, PORTAL.desde_el_dia);
                const meta = [dia, x.quien ? PORTAL.a_cargo_de(x.quien) : null].filter(Boolean).join(" · ");
                return (
                  <li key={i}>
                    <span className="pasos-camino__numero" aria-hidden="true">{i + 1}</span>
                    <div>
                      <p className="pasos-camino__que">
                        <Frase f={x.que} />
                      </p>
                      {meta && <p className="pasos-camino__cuando">{meta}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {tePedimos.length > 0 && (
              <div className="camino-elegido__pedimos">
                <p className="t-etiqueta">{PARA_DUENO.te_pedimos}</p>
                <ul>
                  {tePedimos.map((f, i) => (
                    <li key={i}>
                      <Frase f={f} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <div className="camino-elegido__columna">
          {(esperados.length > 0 || falta) && (
            <section className="camino-elegido__bloque" aria-labelledby="t-camino-esperamos">
              <H id="t-camino-esperamos">{PARA_DUENO.esperamos}</H>
              {esperados.map((f, i) => (
                <Esperado key={i} f={f} />
              ))}
              {esperados.length > 0 && !vacia(p.esperamos?.caja) && (
                <p className="esperado__caja">
                  <Frase f={p.esperamos!.caja} />
                </p>
              )}
              {!esperados.length && falta && <p className="camino-elegido__falta">{falta}</p>}
            </section>
          )}

          {pendientes && (
            <p className="camino-elegido__preguntas no-imprimir" role="status">
              <span>{PORTAL.preguntas_pendientes(pendientes.sin_responder)}</span>
              <Link href={pendientes.href}>{PORTAL.responder}</Link>
            </p>
          )}

          {sabremos.length > 0 && (
            <section className="camino-elegido__bloque" aria-labelledby="t-camino-sabremos">
              <H id="t-camino-sabremos">{PARA_DUENO.como_sabremos}</H>
              <ul className="senales-camino">
                {sabremos.map((s, i) => (
                  <li key={i}>
                    <p className="senales-camino__que">
                      <Frase f={s.senal} />
                    </p>
                    <p className="senales-camino__cuando">{cuando(s.dia, PORTAL.lo_miramos_el, PORTAL.lo_miramos_el_dia)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {casos.length > 0 && (
        <section className="camino-elegido__bloque" aria-labelledby="t-camino-casos">
          <H id="t-camino-casos">{PARA_DUENO.si_pasa}</H>
          <ul className="casos-camino">
            {casos.map((c, i) => (
              <li key={i}>
                <p className="casos-camino__si">
                  <span className="casos-camino__rotulo">{PORTAL.si_pasa}</span> <Frase f={c.si_pasa} />
                </p>
                <p className="casos-camino__haremos">
                  <span className="casos-camino__rotulo">{PORTAL.haremos}</span> <Frase f={c.haremos} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
