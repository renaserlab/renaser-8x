import { Encabezado, Vacio } from "@/components/base/Vacio";
import { Oferta } from "@/components/producto/Oferta";
import { ImportarLineas } from "@/components/producto/ImportarLineas";
import {
  listarLineas, evaluar, configDeEmpresa, capacidadDe, periodosDe, nombreDePeriodoLinea, periodoConPreposicion, esTablaAusente,
  DECISIONES, DECISION_TEXTO, SIN_PERIODO, type LineaProducto,
} from "@/lib/producto";

export const dynamic = "force-dynamic";

type Busqueda = Record<string, string | string[] | undefined>;

/** Un parámetro repetido en la dirección (?horas=1&horas=2) llega como lista: vale el primero. */
const uno = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * LO QUE VENDE LA EMPRESA, vista de la consultora (R9.3). Cada producto o servicio con su precio, lo que
 * cuesta y lo vendido; al lado, lo que la cuenta dice (ingreso, lo que deja, parte de la venta, horas) y
 * la decisión, que fija la consultora con su motivo. La cuenta es determinista y se rehace al abrir la
 * página: no hay nada guardado que pueda quedar viejo. Lo que falta se dice; nunca se rellena con cero.
 *
 * El periodo y la capacidad del equipo viajan en la dirección (?periodo=&personas=&horas=): la capacidad
 * no tiene dónde guardarse todavía, así que se escribe cada vez que se quiere ver el uso de las horas.
 */
export default async function Producto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Busqueda> }) {
  const { id } = await params;
  const busqueda = await searchParams;
  const sp = { periodo: uno(busqueda.periodo), personas: uno(busqueda.personas), horas: uno(busqueda.horas) };

  let lineas: LineaProducto[];
  try {
    lineas = await listarLineas(id);
  } catch (e) {
    if (!esTablaAusente(e)) throw e;
    return (
      <>
        <Encabezado titulo="Lo que vende la empresa" />
        <Vacio texto="Esta base todavía no tiene la tabla de líneas de producto: falta aplicar supabase/migracion-entrada-y-direccion.sql. Hasta entonces aquí no se puede guardar ni mostrar nada; no es que la empresa no venda nada." />
      </>
    );
  }

  const config = await configDeEmpresa(id);
  const periodos = periodosDe(lineas);
  const periodo = sp.periodo && periodos.includes(sp.periodo) ? sp.periodo : null;
  const capacidad = capacidadDe(sp);
  const evaluacion = evaluar(lineas, { periodo, capacidad, config });
  const hayServicios = lineas.some((l) => l.tipo === "servicio");
  const decisiones = DECISIONES.map((clave) => ({ clave, texto: DECISION_TEXTO[clave] }));

  return (
    <>
      <Encabezado
        titulo="Lo que vende la empresa"
        sub="Cada producto o servicio con su precio, lo que cuesta y lo vendido. La evaluación es una cuenta; la decisión la fijas tú, con su motivo."
      />

      {(periodos.length > 1 || hayServicios) && (
        <form method="get" className="flex flex-wrap items-end gap-3 mb-8 no-imprimir">
          {periodos.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="t-etiqueta">Periodo que se evalúa</span>
              <select className="campo" name="periodo" defaultValue={evaluacion.periodo} aria-label="Periodo que se evalúa">
                {periodos.map((p) => (
                  <option key={p} value={p}>{nombreDePeriodoLinea(p)}</option>
                ))}
              </select>
            </label>
          )}
          {hayServicios && (
            <>
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">Personas que atienden los servicios</span>
                <input className="campo" style={{ maxWidth: 200 }} name="personas" type="number" min="0" step="any" defaultValue={sp.personas ?? ""} aria-label="Personas que atienden los servicios" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-etiqueta">Horas al mes de cada una</span>
                <input className="campo" style={{ maxWidth: 200 }} name="horas" type="number" min="0" step="any" defaultValue={sp.horas ?? ""} aria-label="Horas al mes de cada persona" />
              </label>
            </>
          )}
          <button type="submit" className="boton boton--secundario">Ver</button>
        </form>
      )}

      {lineas.length === 0 && (
        <div className="mb-8">
          <Vacio texto="Todavía no hay productos ni servicios anotados. Añade el primero a mano o importa la lista de precios de la empresa desde un Excel." />
        </div>
      )}

      <Oferta companyId={id} lineas={lineas} evaluacion={evaluacion} dePeriodo={evaluacion.periodo === SIN_PERIODO ? null : periodoConPreposicion(evaluacion.periodo, "de")} config={config} decisiones={decisiones} />

      <div className="mt-10">
        <ImportarLineas companyId={id} />
      </div>
    </>
  );
}
