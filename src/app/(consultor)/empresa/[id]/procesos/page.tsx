import { Encabezado } from "@/components/base/Vacio";
import { Icono } from "@/components/base/Icono";
import { ProcesosLista, NuevoProceso, type DetalleProceso } from "@/components/ProcesosLista";
import { ImportarProcesos } from "@/components/procesos/ImportarProcesos";
import { SubirProceso } from "@/components/procesos/SubirProceso";
import { ResumenProcesos } from "@/components/procesos/ResumenProcesos";
import { porDibujar } from "@/components/procesos/datos";
import { listarProcesos } from "@/lib/procesos";
import { mapaDe } from "@/lib/mapa-empresa";
import { conteoProcesos } from "@/lib/diagnostico-tablero";

export const dynamic = "force-dynamic";

/**
 * PROCESOS, en la vista Estructura (16-10-2026). Arriba, lo único que hay que leer: cuántos procesos están dibujados de
 * los que la empresa necesita y en qué nivel van (ResumenProcesos, la misma cuenta del bloque «Procesos» del
 * Diagnóstico). Si el mapa no se puede leer, el resumen lo dice y la lista abre igual.
 *
 * Debajo, en su hoja (revisión del 16-10-2026: era una pantalla de formulario, con la tabla apretada en 440 px, los
 * nombres partidos palabra por palabra, «sin dibujar» dos veces y tres formas de agregar apiladas):
 *  1. los procesos dibujados, una tarjeta por proceso a todo lo ancho —qué se hace (de dónde a dónde), área, quién
 *     responde, pasos y nivel— con «Ver el flujo», que es cómo se hace;
 *  2. lo que falta dibujar, una sola vez: lo subido con su archivo y lo que vino en la lista de la empresa;
 *  3. «Agregar procesos», plegado: contarlo para que la IA lo dibuje, subir su archivo o traer la lista entera.
 */
export default async function Procesos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [procesos, mapa] = await Promise.all([
    listarProcesos(id),
    mapaDe(id).catch((e: unknown) => {
      console.error("[procesos] no se pudo leer el mapa de la empresa", id, e);
      return null;
    }),
  ]);
  // Lo que la empresa trajo y nadie ha dibujado: no es un AS-IS, así que la lista de arriba no lo muestra. Lo que tiene
  // un archivo subido va con el estado de su archivo; lo que vino solo con su nombre (de una lista importada), con lo de
  // la lista. De los dos se abre para dibujarlo.
  const { conArchivo, sinArchivo, archivosLeidos } = await porDibujar(id, procesos);
  const base = `/empresa/${id}/procesos`;
  const detalle: Record<string, DetalleProceso> | undefined = mapa
    ? Object.fromEntries(
        mapa.procesos.map((p) => [p.id, { nivel: p.evaluacion.nivel as number, nombreNivel: p.evaluacion.nombre, responsable: p.responsable, inicio: p.inicio, resultado: p.resultado }])
      )
    : undefined;
  const pendientes = conArchivo.length + sinArchivo.length;
  return (
    <>
      <ResumenProcesos conteo={mapa ? conteoProcesos(mapa) : null} base={`/empresa/${id}`} />
      <div className="hoja-suelta">
        <Encabezado titulo="Procesos" sub="Qué se hace, quién responde y cómo se hace. Cada proceso abre su flujo: los finales malos son obligatorios, la fuga es lo que hay que ver." />
        <ProcesosLista companyId={id} procesos={procesos} base={base} detalle={detalle} />

        {(pendientes > 0 || !archivosLeidos) && (
          <section className="por-dibujar-seccion" aria-labelledby="t-por-dibujar">
            <h2 id="t-por-dibujar" className="t-seccion">Por dibujar{pendientes > 0 ? ` (${pendientes})` : ""}</h2>
            <SubirProceso companyId={id} base={base} porDibujar={conArchivo} archivosLeidos={archivosLeidos} parte="lista" />
            <ImportarProcesos companyId={id} enLista={sinArchivo} base={base} parte="lista" />
          </section>
        )}

        {/* Las tres formas de agregar, juntas y plegadas: dibujar sigue siendo lo primero. */}
        <details className="plegado agregar-procesos">
          <summary>
            <span>
              Agregar procesos
              <small>Contarlo y que la IA lo dibuje, subir su archivo o traer la lista entera</small>
            </span>
            <Icono nombre="abajo" />
          </summary>
          <div className="agregar-procesos__cuerpo">
            <NuevoProceso companyId={id} base={base} />
            <SubirProceso companyId={id} base={base} porDibujar={conArchivo} archivosLeidos={archivosLeidos} parte="formulario" />
            <ImportarProcesos companyId={id} enLista={sinArchivo} base={base} parte="formulario" />
          </div>
        </details>
      </div>
    </>
  );
}
