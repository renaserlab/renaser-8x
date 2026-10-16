import { contextoPortal } from "@/lib/portal";
import { Vacio } from "@/components/base/Vacio";
import { listarLineas, evaluar, resumenParaDueno, configDeEmpresa, esTablaAusente, periodoConPreposicion, SIN_PERIODO, type LineaParaDueno, type LineaProducto } from "@/lib/producto";

export const dynamic = "force-dynamic";

/** Una línea tal como la lee el dueño: qué es, qué promete, a quién, y lo que deja o lo que falta para saberlo. */
function Linea({ l }: { l: LineaParaDueno }) {
  return (
    <li>
      <p className="t-seccion" style={{ fontSize: 17 }}>{l.nombre}</p>
      {l.promesa && <p className="t-cuerpo mt-1">Lo que le prometes al cliente: {l.promesa}</p>}
      {l.cliente && <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>Para: {l.cliente}</p>}
      <p className="t-dato mt-1" style={{ color: l.conDatos ? "var(--tinta)" : "var(--grafito)" }}>{l.deja}</p>
    </li>
  );
}

/**
 * «LO QUE VENDES» — la pantalla del dueño. Sus productos y servicios, lo que promete con cada uno y lo
 * que le deja, con sus palabras. Lo que falta se dice una vez y no se estima. Aquí no aparece ninguna
 * decisión sobre sus líneas (conservar, retirar…): eso se conversa y se acuerda con él, no se le muestra
 * a medio pensar. Tampoco hay términos de método: «deja», «cuesta», «vendiste».
 */
export default async function LoQueVendes() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;

  const encabezado = (
    <>
      <p className="t-etiqueta">Tu oferta</p>
      <h1 className="t-titulo mt-2 mb-2">Lo que vendes</h1>
    </>
  );

  let lineas: LineaProducto[];
  try {
    // Sin la decisión ni su motivo: se filtra en la consulta, no al pintar.
    lineas = await listarLineas(c.companyId, { paraDueno: true });
  } catch (e) {
    if (!esTablaAusente(e)) throw e;
    return (
      <>
        {encabezado}
        <Vacio texto="Todavía no podemos mostrarte esta parte: la estamos terminando de preparar. No falta nada de tu lado." />
      </>
    );
  }

  if (lineas.length === 0) {
    return (
      <>
        {encabezado}
        <Vacio
          texto="Todavía no hemos anotado lo que vendes. Cuando nos cuentes qué vendes y a qué precio, o nos pases tu lista de precios, lo verás aquí con lo que te deja cada cosa."
          accion="Contarlo ahora"
          href="/portal/conversacion"
        />
      </>
    );
  }

  const config = await configDeEmpresa(c.companyId);
  const evaluacion = evaluar(lineas, { config });
  const resumen = resumenParaDueno(lineas, evaluacion, config);
  const conNumeros = resumen.lineas.filter((l) => l.conDatos);
  const sinNumeros = resumen.lineas.filter((l) => !l.conDatos);
  const tituloDejanMas =
    resumen.dejanMas.criterio === "por_unidad"
      ? "Lo que más te deja por cada venta"
      : evaluacion.periodo === SIN_PERIODO
        ? "Lo que más te dejó"
        : `Lo que más te dejó ${periodoConPreposicion(evaluacion.periodo, "en")}`;

  return (
    <>
      {encabezado}
      <p className="t-cuerpo medida mb-7" style={{ color: "var(--grafito)" }}>
        Tus productos y servicios, lo que le prometes al cliente con cada uno y lo que te deja. «Lo que te deja» es lo que cobras menos lo que te cuesta cada unidad: todavía no descuenta el alquiler, los sueldos ni los demás gastos del mes.
      </p>

      {resumen.dejanMas.lineas.length > 0 && (
        <section className="mb-8">
          <h2 className="t-seccion mb-2">{tituloDejanMas}</h2>
          <ol className="flex flex-col gap-1" style={{ paddingLeft: 20, listStyle: "decimal" }}>
            {resumen.dejanMas.lineas.map((l) => (
              <li key={l.nombre} className="t-cuerpo">{l.texto}</li>
            ))}
          </ol>
          {resumen.dejanMas.nota && <p className="t-dato mt-2 medida" style={{ color: "var(--grafito)" }}>{resumen.dejanMas.nota}</p>}
        </section>
      )}

      <section>
        <h2 className="t-seccion mb-2">Tus productos y servicios</h2>
        {conNumeros.length > 0 && (
          <ul className="lista-editorial medida">
            {conNumeros.map((l, i) => (
              <Linea key={`${l.nombre}-${i}`} l={l} />
            ))}
          </ul>
        )}
        {sinNumeros.length > 0 &&
          (conNumeros.length === 0 ? (
            <ul className="lista-editorial medida">
              {sinNumeros.map((l, i) => (
                <Linea key={`${l.nombre}-${i}`} l={l} />
              ))}
            </ul>
          ) : (
            <details className="mt-4">
              <summary className="t-dato" style={{ cursor: "pointer", color: "var(--marca)" }}>
                Ver {sinNumeros.length === 1 ? "el que todavía no tiene sus números" : `los ${sinNumeros.length} que todavía no tienen sus números`}
              </summary>
              <ul className="lista-editorial medida mt-3">
                {sinNumeros.map((l, i) => (
                  <Linea key={`${l.nombre}-${i}`} l={l} />
                ))}
              </ul>
            </details>
          ))}
      </section>

      {resumen.faltan && (
        <p className="t-cuerpo medida mt-8" style={{ color: "var(--grafito)" }}>{resumen.faltan}</p>
      )}
    </>
  );
}
