import { fecha } from "@/lib/formato";
import { configDeCalculos } from "@/lib/estrategia/calculos";
import { nombreCamino, type VistaEstrategia } from "@/lib/estrategia/pantalla";
import { PANTALLA } from "@/lib/estrategia/textos";
import { CaminoElegido } from "@/components/cliente/CaminoElegido";
import { Icono } from "@/components/base/Icono";
import { T } from "./Texto";
import { AprobarEstrategia } from "./ElegirYAprobar";

/**
 * APROBAR, VIENDO LO QUE VERÁ EL CLIENTE (spec-estrategia-8x.md §8.1, punto 3, y §8.2).
 *
 * Elegido un camino, la tarjeta muestra la página del dueño tal como la verá en su «Plan» —la misma pieza que él lee,
 * CaminoElegido, con lo que `vistaParaDueno` congelaría hoy—, avisa si se corrigieron jugadas de ese camino y no lo que
 * él leerá, deja corregir sus textos ahí mismo y, debajo, «Aprobar la estrategia». Si queda algo por resolver, el botón
 * dice cuántas cosas y lleva a ellas. Una versión aprobada (o reemplazada) muestra la página que se congeló.
 */
export function Aprobacion({ x }: { x: VistaEstrategia }) {
  const { v } = x;
  const cfg = configDeCalculos(v.calculos);
  const zona = cfg.zona_horaria;

  if (v.estado === "aprobada" || v.estado === "reemplazada") {
    return (
      <section className="tarjeta a-lo-ancho aprobacion" aria-labelledby="t-aprobacion">
        <div className="cabeza">
          <div>
            <h2 id="t-aprobacion">{v.estado === "aprobada" ? PANTALLA.aprobada(fecha(v.aprobada_at, cfg)) : PANTALLA.reemplazada}</h2>
            {v.camino_elegido && <p className="sub">{PANTALLA.elegido}: {nombreCamino(v.camino_elegido)}</p>}
          </div>
        </div>
        {x.congelada && (
          <div className="aprobacion__vista">
            <CaminoElegido p={x.congelada} desde={v.aprobada_at} zona={zona} nivel={2} />
          </div>
        )}
      </section>
    );
  }

  const l = v.camino_elegido;
  if (!l) {
    return (
      <p className="franja-accion franja-accion--tenue a-lo-ancho" role="status">
        {PANTALLA.elige_para_aprobar}
      </p>
    );
  }
  const c = x.e.caminos[l];
  const base = `/caminos/${l}/para_el_dueno`;
  return (
    <section className="tarjeta a-lo-ancho aprobacion" aria-labelledby="t-aprobacion">
      <div className="cabeza">
        <div>
          <h2 id="t-aprobacion">{PANTALLA.asi_lo_vera}</h2>
          <p className="sub">{PANTALLA.asi_lo_vera_sub}</p>
        </div>
      </div>
      {x.duenoSinRevisar && (
        <p className="aviso-suave" role="status">
          {PANTALLA.dueno_sin_revisar}
        </p>
      )}
      {x.paraDueno?.ok ? (
        <div className="aprobacion__vista">
          <CaminoElegido p={x.paraDueno.p} zona={zona} nivel={2} />
        </div>
      ) : x.paraDueno ? (
        <div className="aviso-suave" role="alert">
          <p>{PANTALLA.no_se_aprueba_asi}</p>
          <ul>
            {x.paraDueno.problemas.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {x.editable && (
        <details className="plegado aprobacion__corregir" open={x.duenoSinRevisar || !x.paraDueno?.ok || undefined}>
          <summary>
            <span>{PANTALLA.corregir_dueno}</span>
            <Icono nombre="abajo" />
          </summary>
          <div className="aprobacion__textos">
            <T x={x} p={`${base}/titulo`} como="p" clase="aprobacion__texto" />
            <T x={x} p={`${base}/por_que`} como="p" clase="aprobacion__texto" />
            <ol>
              {c.para_el_dueno.pasos.map((_p, i) => (
                <li key={i}>
                  <T x={x} p={`${base}/pasos/${i}`} />
                </li>
              ))}
            </ol>
            {c.para_el_dueno.te_pedimos.length > 0 && (
              <ul>
                {c.para_el_dueno.te_pedimos.map((_p, i) => (
                  <li key={i}>
                    <T x={x} p={`${base}/te_pedimos/${i}`} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
      {x.editable && (
        <div className="aprobacion__accion">
          {x.pendientes.length ? (
            <a href="#por-resolver" className="boton boton--secundario">
              {PANTALLA.ir_a_resolver(x.pendientes.length)}
            </a>
          ) : x.paraDueno?.ok ? (
            <AprobarEstrategia companyId={x.companyId} eid={v.id} />
          ) : null}
        </div>
      )}
    </section>
  );
}
