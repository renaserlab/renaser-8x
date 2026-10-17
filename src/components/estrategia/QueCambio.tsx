import type { Detalle } from "@/lib/estrategia/acciones";
import { sinIds, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import type { ResumenVersion } from "@/lib/estrategia/datos";
import { PANTALLA } from "@/lib/estrategia/textos";
import { BotonGenerar } from "./Acciones";

/**
 * QUÉ CAMBIÓ (spec-estrategia-8x.md §7.3): en una versión que salió de «Actualizar números», arriba y solo —no es un
 * botón más—, lo que cambió frente a la versión en que se basa: los hechos que entraron, salieron o cambiaron de valor o
 * de clase, las preguntas que respondió el dueño y los números de cada camino que se movieron. Solo si conviene volver
 * a pensarla (el recomendado dejó de ser el que más da, una jugada perdió su número, entró un dato sobre lo que la
 * frena), debajo y en pequeño: «Conviene volver a pensarla: … Regenerar».
 */
export function QueCambio({ x, detalle, versiones, puedeRegenerar }: { x: VistaEstrategia; detalle: Pick<Detalle, "que_cambio">; versiones: ResumenVersion[]; puedeRegenerar: boolean }) {
  const q = detalle.que_cambio;
  if (!q) return null;
  const base = versiones.find((v) => v.id === x.v.basada_en)?.version ?? null;
  const lineas = q.diferencias.resumen.map((t) => sinIds(t, x.e)).filter(Boolean);
  return (
    <section className="tarjeta a-lo-ancho que-cambio" aria-labelledby="t-que-cambio">
      <details className="plegado" open={lineas.length <= 4 || undefined}>
        <summary>
          <span>
            <span id="t-que-cambio" className="grupo__titulo">{PANTALLA.que_cambio(base)}</span>
            <small className="grupo__sub">{PANTALLA.cambios(lineas.length)}</small>
          </span>
        </summary>
        {lineas.length ? (
          <ul className="detalle-lista">
            {lineas.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="nota">{PANTALLA.que_cambio_nada}</p>
        )}
      </details>
      {q.regenerar.conviene && (
        <p className="nota que-cambio__regenerar">
          {PANTALLA.conviene(q.regenerar.motivos.join("; "))}{" "}
          {puedeRegenerar && <BotonGenerar companyId={x.companyId} texto={PANTALLA.regenerar} nota={PANTALLA.regenerar_nota} secundario />}
        </p>
      )}
    </section>
  );
}
