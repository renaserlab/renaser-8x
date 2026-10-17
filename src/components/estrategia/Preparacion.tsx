import Link from "next/link";
import type { DatosPantalla } from "@/lib/estrategia/pantalla-datos";
import { MOTOR, PANTALLA } from "@/lib/estrategia/textos";
import { Segmentos } from "@/components/tablero/Piezas";
import { PedirAlCliente } from "@/components/diagnostico/PedirAlCliente";
import { BotonGenerar } from "./Acciones";

/**
 * SIN ESTRATEGIA TODAVÍA (spec-estrategia-8x.md §3.6 y §8.1, punto 1).
 *
 * Antes de gastar una sola consulta, la consultora ve con qué se haría: cuántos hechos, estimados del dueño,
 * percepciones y sin dato tiene la empresa (los cuatro chips de §3.1), lo que falta del mínimo, lo que esta base
 * todavía no tiene y cuánto le queda de su tope. Y UN solo botón: «Generar la estrategia» o, si no alcanza,
 * «Pedírselo al cliente» (abre «Los números que faltan» con la nota que escribe el código). Si lo que falta es el
 * diagnóstico, no hay nada que pedirle al dueño: se va a los hallazgos.
 */
export function Preparacion({ d }: { d: Extract<DatosPantalla, { tipo: "preparacion" }> }) {
  const { prep, empresa } = d;
  const c = prep.conteo;
  const accion = (() => {
    if (prep.lectura_fallida || prep.tope) return null;
    if (prep.faltan.length) {
      if (prep.pedir) return <PedirAlCliente companyId={empresa.id} seccion={prep.pedir.seccion} nota={prep.pedir.nota} pedido={prep.pedido} zona={empresa.zona} />;
      return (
        <Link href={`/empresa/${empresa.id}/diagnostico`} className="boton boton--secundario">
          {PANTALLA.ir_a_hallazgos}
        </Link>
      );
    }
    return <BotonGenerar companyId={empresa.id} texto={MOTOR.generar} nota={MOTOR.generar_nota} />;
  })();

  return (
    <section className="tarjeta a-lo-ancho preparacion" aria-labelledby="t-preparacion">
      <div className="cabeza">
        <div>
          <h2 id="t-preparacion">{PANTALLA.prep_titulo}</h2>
          <p className="sub">{PANTALLA.prep_sub}</p>
        </div>
      </div>

      {prep.lectura_fallida ? (
        <p className="aviso-suave" role="alert">
          {PANTALLA.no_se_pudo_leer} {prep.lectura_fallida}
        </p>
      ) : (
        c && (
          <div className="preparacion__datos">
            <p className="t-etiqueta">{PANTALLA.con_que}</p>
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
          </div>
        )
      )}

      {prep.no_habilitadas.length > 0 && (
        <p className="nota">
          {prep.no_habilitadas.join(", ")}: {PANTALLA.no_habilitado}.
        </p>
      )}

      {prep.faltan.length > 0 && (
        <div className="preparacion__falta">
          <p className="t-etiqueta">{PANTALLA.falta_minimo}</p>
          <ul className="detalle-lista">
            {prep.faltan.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {prep.pedido?.estado === "activa" && <p className="nota">{PANTALLA.pedido_activo}</p>}
        </div>
      )}

      {prep.consumo && <p className="nota">{prep.consumo.texto}</p>}
      {prep.tope && (
        <p className="aviso-suave" role="status">
          {prep.tope}
        </p>
      )}
      {d.versiones.some((v) => v.estado === "descartada") && <p className="nota">{PANTALLA.descartadas(d.versiones.filter((v) => v.estado === "descartada").length)}</p>}

      {accion && <div className="preparacion__accion">{accion}</div>}
    </section>
  );
}
