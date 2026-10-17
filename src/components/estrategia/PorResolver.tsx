import { esEditable, textoEn } from "@/lib/estrategia/edicion";
import { limitesDe } from "@/lib/estrategia/supuestos";
import { contextoLimites } from "@/lib/estrategia/armar";
import { textoPintado } from "@/lib/estrategia/texto";
import { sinIds, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import { PANTALLA, TEXTO } from "@/lib/estrategia/textos";
import { T } from "./Texto";
import { AceptarQuitado } from "./Acciones";
import { EditarSupuesto } from "./EditarSupuesto";
import { UNIDAD } from "./DosCaminos";

/**
 * LO QUE FALTA RESOLVER ANTES DE APROBAR (spec-estrategia-8x.md §5.4 y §6.3).
 *
 * Cada error del validador y cada cosa que 8X quitó con marca, una vez por lugar, con el lugar en palabras («Camino A,
 * jugada 2: por qué») y qué hacer ahí mismo: corregir el texto, corregir el rango de la cifra por confirmar, o aceptar
 * que se quite. Resuelto lo último, la versión vuelve a «lista» y se puede aprobar. Está a la vista (no plegado): el
 * botón de aprobar lleva hasta aquí.
 */
export function PorResolver({ x }: { x: VistaEstrategia }) {
  if (!x.editable || !x.pendientes.length) return null;
  const ctx = contextoLimites(x.refs);
  return (
    <section id="por-resolver" className="tarjeta a-lo-ancho por-resolver" aria-labelledby="t-por-resolver">
      <div className="cabeza">
        <div>
          <h2 id="t-por-resolver">{PANTALLA.por_resolver(x.pendientes.length)}</h2>
          <p className="sub">{PANTALLA.por_resolver_sub}</p>
        </div>
      </div>
      <ul className="por-resolver__lista">
        {x.pendientes.map((p) => {
          const quitados = x.e.quitado.filter((q) => q.puntero === p.puntero && !q.resuelto);
          const sup = /^\/supuestos\/(\d+)(?:\/(?:ancla|rango))?$/.exec(p.puntero);
          const s = sup ? x.e.supuestos[Number(sup[1])] : null;
          const lim = s ? limitesDe(s.clave, ctx) : null;
          const texto = esEditable(p.puntero) ? textoEn(x.e, p.puntero) : null;
          return (
            <li key={p.puntero} className="por-resolver__item">
              <p className="por-resolver__lugar">
                <b>{p.lugar}</b>
              </p>
              <p className="por-resolver__que">{p.texto}</p>
              {quitados.map((q, i) => (
                <p key={i} className="por-resolver__quitado">
                  <span className="t-etiqueta">{PANTALLA.quito}:</span> «{sinIds(q.quitado.includes("{{") ? textoPintado(q.quitado, x.refs, "consultora") : q.quitado, x.e) || TEXTO.sin_dato}»
                </p>
              ))}
              {texto != null && <T x={x} p={p.puntero} clase="por-resolver__texto" donde="resolver" />}
              {s && (
                <p className="por-resolver__supuesto">
                  <span>{s.que_se_supone}: </span>
                  <EditarSupuesto
                    companyId={x.companyId}
                    eid={x.v.id}
                    id={s.id}
                    texto={x.refs.get(`S:${s.id}`)?.texto ?? TEXTO.sin_dato}
                    bajo={s.rango.bajo}
                    alto={s.rango.alto}
                    unidad={UNIDAD[s.unidad] ?? s.unidad}
                    limites={lim?.ok ? [lim.limites[0], lim.limites[1]] : null}
                    editable={x.editable}
                    que={s.que_se_supone}
                  />
                </p>
              )}
              {quitados.length > 0 && (
                <div className="por-resolver__acciones">
                  <AceptarQuitado companyId={x.companyId} eid={x.v.id} puntero={p.puntero} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
