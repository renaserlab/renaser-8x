import type { VistaEstrategia } from "@/lib/estrategia/pantalla";
import { PANTALLA } from "@/lib/estrategia/textos";
import { T } from "./Texto";

/**
 * ARRIBA, SOLO DOS COSAS (spec-estrategia-8x.md §8.1, punto 3): la lectura en cinco líneas, cada una con su rótulo
 * pequeño —dónde está, qué la frena, cuánto cuesta seguir igual, la apuesta, cómo sabremos—, y la gran apuesta en
 * grande, con sus cifras pintadas. Es lo que se lee en diez segundos; todo lo demás va debajo. En un celular, la gran
 * apuesta va primero: debajo de las cinco líneas quedaba fuera de la primera pantalla (revisión del 17-10).
 */
export function LecturaYApuesta({ x }: { x: VistaEstrategia }) {
  const e = x.e;
  return (
    <div className="a-lo-ancho arriba-estrategia">
      <section className="tarjeta lectura-tarjeta" aria-labelledby="t-lectura">
        <h2 id="t-lectura" className="t-etiqueta lectura-tarjeta__titulo">{PANTALLA.lectura}</h2>
        <dl className="lectura-lineas">
          {e.lectura.map((_l, i) => (
            <div key={i} className="lectura-lineas__fila">
              <dt>{PANTALLA.rotulos_lectura[i] ?? `${i + 1}`}</dt>
              <dd>
                <T x={x} p={`/lectura/${i}`} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="tarjeta apuesta-tarjeta" aria-label={PANTALLA.gran_apuesta}>
        <p className="t-etiqueta apuesta-tarjeta__rotulo">
          {PANTALLA.gran_apuesta} · {PANTALLA.apuesta_de[e.gran_apuesta.camino] ?? ""}
        </p>
        <T x={x} p="/gran_apuesta/frase" como="h2" clase="apuesta-tarjeta__frase" />
        <T x={x} p="/gran_apuesta/por_que" como="p" clase="apuesta-tarjeta__porque" />
      </section>
    </div>
  );
}
