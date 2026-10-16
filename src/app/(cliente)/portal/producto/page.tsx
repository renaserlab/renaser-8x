import Link from "next/link";
import { contextoPortal } from "@/lib/portal";
import { Vacio } from "@/components/base/Vacio";
import { listarLineas, evaluar, resumenParaDueno, configDeEmpresa, esTablaAusente, periodoConPreposicion, SIN_PERIODO, type LineaParaDueno, type LineaProducto } from "@/lib/producto";
import { resumenMensualParaDueno, usaTablaNueva, FICHA_VACIA } from "@/lib/rentabilidad";
import { leerFichaNegocio, leerTrabajoEmpresa } from "@/lib/negocio-datos";
import type { ConfigEmpresa } from "@/lib/formato";
import { pedidosDelDueno, seccionDe, puedeLlenar, leer, valorO } from "@/components/negocio/datos";
import { TablaProductos } from "@/components/negocio/TablaProductos";
import { ElegirModelo } from "@/components/negocio/ElegirModelo";
import { ListoParaConsultora } from "@/components/negocio/ListoParaConsultora";
import { ChipEstado } from "@/components/negocio/Marcas";

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

const Encabezado = () => (
  <>
    <p className="t-etiqueta">Tu oferta</p>
    <h1 className="t-titulo mt-2 mb-2">Lo que vendes</h1>
  </>
);

/** Lo de siempre (antes del 16-10): lo que deja cada línea por periodo, con sus palabras. */
function VistaPorPeriodo({ lineas, config }: { lineas: LineaProducto[]; config: ConfigEmpresa }) {
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
      <Encabezado />
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

/**
 * «LO QUE VENDES» — la pantalla del dueño. Sus productos y servicios y lo que le deja cada uno, con sus palabras.
 *
 * Desde el 16-10-2026 tiene tres caras:
 *  - Con la sección «productos» abierta por su consultora: primero, si nadie lo dijo, cómo gana dinero el negocio;
 *    después la tabla para llenar (precio, lo que cuesta por partes, cuánto vendió el mes pasado), prellenada con
 *    lo que ya hay, y al final «Listo, ya lo llené».
 *  - Cerrada y con datos de la tabla nueva: lo que deja cada cosa al mes, para leer.
 *  - Cerrada y sin datos nuevos: exactamente lo de antes (lo que deja por periodo).
 * Nunca aparece una decisión sobre sus líneas ni términos de método: «deja», «cuesta», «vendes».
 */
export default async function LoQueVendes() {
  const c = await contextoPortal();
  if (!c.companyId) return <p className="t-cuerpo medida">{c.queFalta}</p>;
  const companyId = c.companyId;

  let lineas: LineaProducto[];
  try {
    // Sin la decisión ni su motivo: se filtra en la consulta, no al pintar.
    lineas = await listarLineas(companyId, { paraDueno: true });
  } catch (e) {
    if (!esTablaAusente(e)) throw e;
    return (
      <>
        <Encabezado />
        <Vacio texto="Todavía no podemos mostrarte esta parte: la estamos terminando de preparar. No falta nada de tu lado." />
      </>
    );
  }

  const pedidos = await pedidosDelDueno(companyId);
  const { activa, completada } = seccionDe(pedidos.ok ? pedidos.valor : null, "productos");

  if (!activa && !usaTablaNueva(lineas)) {
    if (lineas.length === 0) {
      return (
        <>
          <Encabezado />
          <Vacio
            texto="Todavía no hemos anotado lo que vendes. Cuando nos cuentes qué vendes y a qué precio, o nos pases tu lista de precios, lo verás aquí con lo que te deja cada cosa."
            accion="Contarlo ahora"
            href="/portal/conversacion"
          />
        </>
      );
    }
    return <VistaPorPeriodo lineas={lineas} config={await configDeEmpresa(companyId)} />;
  }

  const u = (c as { u?: { id: string; rol: string } }).u;
  const [quien, ficha, trabajo, config] = await Promise.all([
    puedeLlenar(u, companyId),
    leer("la ficha del negocio", () => leerFichaNegocio(companyId)),
    leer("cómo gana dinero la empresa", () => leerTrabajoEmpresa(companyId)),
    configDeEmpresa(companyId),
  ]);
  const fichaNegocio = valorO(ficha, { ...FICHA_VACIA });
  const modelos = trabajo.ok ? trabajo.valor.modelo_negocio : [];
  const editable = !!activa && quien.puede;
  const resumen = resumenMensualParaDueno(lineas, fichaNegocio, config);
  const deja = Object.fromEntries(resumen.lineas.map((l) => [l.id, l.deja]));
  const eligiendoModelo = editable && modelos.length === 0 && trabajo.ok;
  // «Listo, ya lo llené» solo cuando hay algo que avisar: no mientras elige cómo gana dinero ni con la tabla vacía.
  const nadaQueAvisar = !!activa && (eligiendoModelo || lineas.length === 0);
  // Cerrada: lo que más deja va arriba; abajo, solo lo demás (antes se repetían los mismos montos en las dos listas).
  const enLoQueMasDeja = new Set(resumen.dejanMas.map((d) => d.id));
  const loDemas = resumen.lineas.filter((l) => !enLoQueMasDeja.has(l.id));

  return (
    <>
      <Encabezado />
      {activa ? (
        <div className="medida mb-6 flex flex-col gap-2">
          <p className="t-cuerpo" style={{ color: "var(--grafito)" }}>
            Anota cada cosa que vendes: a cuánto la vendiste la última vez, cuánto te cuesta y cuántas vendiste el mes pasado. Si no sabes un número, escribe uno aproximado o pulsa «No lo sé»: también sirve. Se guarda solo al pasar a otro producto.
          </p>
          {activa.nota && <p className="t-cuerpo">Tu consultora te dice: «{activa.nota}»</p>}
        </div>
      ) : (
        <p className="t-cuerpo medida mb-6" style={{ color: "var(--grafito)" }}>
          Lo que te deja cada cosa al mes: lo que cobras menos lo que te cuesta, por lo que vendes. Todavía no descuenta el alquiler, los sueldos ni los demás gastos del mes.
        </p>
      )}

      {eligiendoModelo ? (
        <ElegirModelo companyId={companyId} />
      ) : activa ? (
        <>
          {!trabajo.ok && <p className="t-dato medida mb-4" style={{ color: "var(--grafito)" }}>No pudimos leer cómo gana dinero tu negocio: las preguntas salen en su forma general.</p>}
          {!quien.puede && <p className="t-dato medida mb-4" style={{ color: "var(--grafito)" }}>Esto lo llena el dueño de la empresa o quien él designe. Tú puedes verlo.</p>}
          <TablaProductos
            companyId={companyId}
            modo="dueno"
            lineas={lineas}
            modelos={modelos}
            totales={fichaNegocio.totales}
            editable={editable}
            usuarioId={u?.id ?? null}
            config={config}
            deja={deja}
          />
          {/* Los módulos se encienden con una pregunta: con esta sección abierta, el dueño ya puede contestarlas. */}
          {editable && (
            <section className="panel p-5 mt-8 medida" style={{ background: "var(--suave)" }}>
              <h2 className="t-seccion" style={{ fontSize: 17 }}>Tres preguntas más, de sí o no</h2>
              <p className="t-cuerpo mt-2">Sobre cómo te pagan, si fías y si guardas mercadería. Si alguna respuesta es sí, se abren unas pocas preguntas más.</p>
              <Link href="/portal/cobros" className="boton boton--secundario mt-4" style={{ display: "inline-flex" }}>Responderlas</Link>
            </section>
          )}
        </>
      ) : (
        <>
          {resumen.dejanMas.length > 0 && (
            <section className="mb-8">
              <h2 className="t-seccion mb-2">Lo que más te deja al mes</h2>
              <ol className="flex flex-col gap-1" style={{ paddingLeft: 20, listStyle: "decimal" }}>
                {resumen.dejanMas.map((l) => (
                  <li key={l.id} className="t-cuerpo">
                    {l.texto} {l.aOjo && <ChipEstado estado="estimado" />}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {loDemas.length > 0 && (
            <section>
              <h2 className="t-seccion mb-2">{resumen.dejanMas.length > 0 ? "Lo demás que vendes" : "Tus productos y servicios"}</h2>
              <ul className="lista-editorial medida">
                {loDemas.map((l) => (
                  <li key={l.id}>
                    <p className="t-seccion" style={{ fontSize: 17 }}>{l.nombre}</p>
                    <p className="t-dato mt-1" style={{ color: l.conDatos ? "var(--tinta)" : "var(--grafito)" }}>
                      {l.deja} {l.aOjo && <ChipEstado estado="estimado" />}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {resumen.faltan && <p className="t-cuerpo medida mt-8" style={{ color: "var(--grafito)" }}>{resumen.faltan}</p>}
        </>
      )}

      {!nadaQueAvisar && (
        <ListoParaConsultora companyId={companyId} solicitudId={activa?.id ?? null} completadaAt={completada?.completada_at ?? null} puede={quien.puede} comoConsultora={quien.comoConsultora} zona={config.zona_horaria} />
      )}
    </>
  );
}
