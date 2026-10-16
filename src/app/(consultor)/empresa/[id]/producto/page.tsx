import { Encabezado, Vacio } from "@/components/base/Vacio";
import { Oferta } from "@/components/producto/Oferta";
import { ImportarLineas } from "@/components/producto/ImportarLineas";
import {
  listarLineas, evaluar, configDeEmpresa, capacidadDe, periodosDe, nombreDePeriodoLinea, periodoConPreposicion, esTablaAusente,
  DECISIONES, DECISION_TEXTO, SIN_PERIODO, type LineaProducto,
} from "@/lib/producto";
import { tableroRentabilidad, resumenMensualParaDueno, fugaCambiaria, vitalMasReciente, usaTablaNueva, FICHA_VACIA } from "@/lib/rentabilidad";
import { leerFichaNegocio, listarCostos, listarOperacionesMoneda, leerTrabajoEmpresa } from "@/lib/negocio-datos";
import { leer, metricasDe } from "@/components/negocio/datos";
import { TableroRentabilidad } from "@/components/negocio/TableroRentabilidad";
import { TablaProductos } from "@/components/negocio/TablaProductos";
import { CostosMes } from "@/components/negocio/CostosMes";
import { CobrosYMercaderia, type FugaLeida } from "@/components/negocio/CobrosYMercaderia";
import { pctDe, PCT_POR_DEFECTO } from "@/components/negocio/Palancas";

export const dynamic = "force-dynamic";

type Busqueda = Record<string, string | string[] | undefined>;

/** Un parámetro repetido en la dirección (?horas=1&horas=2) llega como lista: vale el primero. */
const uno = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * PRODUCTO Y RENTABILIDAD, vista de la consultora (R9.3 y 16-10-2026).
 *
 * Arriba, el tablero de rentabilidad con lo que la empresa llenó: cuánto deja cada producto, la matriz margen ×
 * volumen, el 90/10, el punto de equilibrio, las palancas, lo que se queda en el camino al cobrar en otra moneda, y
 * el crédito y la mercadería si aplican. Debajo, lo que respondió la empresa con el estado de cada dato (aquí se puede
 * marcar «Comprobado»). Al final, lo de siempre: la vista por periodo con la decisión de cada línea y la importación.
 *
 * Toda lectura nueva va por separado: si una tabla del 16-10 todavía no existe o falla, se dice arriba qué no se pudo
 * leer y lo demás sigue. La de las líneas no: sin ella no hay pantalla (y lo dice con el nombre de la migración).
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

  const [config, ficha, costos, operaciones, metricas, trabajo] = await Promise.all([
    configDeEmpresa(id),
    leer("la ficha del negocio", () => leerFichaNegocio(id)),
    leer("los gastos del mes", () => listarCostos(id)),
    leer("las ventas en otra moneda", () => listarOperacionesMoneda(id)),
    metricasDe(id),
    leer("cómo gana dinero la empresa", () => leerTrabajoEmpresa(id)),
  ]);
  const noLeido = [
    !ficha.ok ? (ficha.falta ? "la ficha del negocio (falta aplicar supabase/migracion-entrar-hoy.sql)" : "la ficha del negocio") : null,
    !costos.ok ? (costos.falta ? "los gastos del mes (falta aplicar supabase/migracion-entrar-hoy.sql)" : "los gastos del mes") : null,
    !operaciones.ok ? (operaciones.falta ? "las ventas en otra moneda (falta aplicar supabase/migracion-entrar-hoy.sql)" : "las ventas en otra moneda") : null,
    !metricas.ok ? "los 9 números" : null,
  ].filter((x): x is string => x !== null);

  const fichaNegocio = ficha.ok ? ficha.valor : { ...FICHA_VACIA };
  const ops = operaciones.ok ? operaciones.valor : [];
  const tablero = tableroRentabilidad({
    lineas,
    costos: costos.ok ? costos.valor : [],
    ficha: fichaNegocio,
    operaciones: ops,
    metricas: metricas.ok ? metricas.valor : [],
    config,
  });
  const deja = Object.fromEntries(resumenMensualParaDueno(lineas, fichaNegocio, config).lineas.map((l) => [l.id, l.deja]));
  const fugas: Record<string, FugaLeida> = Object.fromEntries(
    ops.map((o) => {
      const f = fugaCambiaria(o);
      return [o.id, { esperado: f.esperado, total: f.total, motivos: f.motivos }];
    })
  );
  const pct = {
    precio: pctDe(busqueda.p_precio, PCT_POR_DEFECTO.precio),
    parte: pctDe(busqueda.p_parte, PCT_POR_DEFECTO.parte),
    volumen: pctDe(busqueda.p_volumen, PCT_POR_DEFECTO.volumen),
  };
  const conservar = Object.fromEntries(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  const modelos = trabajo.ok ? trabajo.valor.modelo_negocio : [];

  // Lo de siempre: la vista por periodo, con la evaluación y la decisión.
  const periodos = periodosDe(lineas);
  const periodo = sp.periodo && periodos.includes(sp.periodo) ? sp.periodo : null;
  const capacidad = capacidadDe(sp);
  const evaluacion = evaluar(lineas, { periodo, capacidad, config });
  const hayServicios = lineas.some((l) => l.tipo === "servicio");
  const decisiones = DECISIONES.map((clave) => ({ clave, texto: DECISION_TEXTO[clave] }));
  // Con la tabla nueva llena, la vista por periodo es la de antes: va cerrada, para que sus «sin dato» (no anotó el
  // periodo) no se lean como si contradijeran al tablero de arriba, que mide un mes.
  const vistaAnterior = usaTablaNueva(lineas);

  const porPeriodo = (
    <>
      <p className="t-titulo mt-4 mb-2" style={{ fontSize: 22 }}>Lo que vende la empresa</p>
      <p className="t-cuerpo mb-6" style={{ color: "var(--grafito)" }}>
        Cada producto o servicio con su precio, lo que cuesta y lo vendido en su periodo. La evaluación es una cuenta; la decisión la fijas tú, con su motivo.
      </p>

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

  return (
    <>
      <Encabezado
        titulo="Producto y rentabilidad"
        sub="Cuánto deja cada cosa que vende la empresa, cuáles la sostienen y cuánto tiene que vender para cubrir el mes. Todo sale de lo que la empresa anotó; lo que falta se dice."
      />

      <TableroRentabilidad t={tablero} config={config} noLeido={noLeido} operaciones={ops} pct={pct} conservar={conservar} />

      <section className="mt-12 flex flex-col gap-4" aria-labelledby="lo-que-anoto">
        <div>
          <h2 id="lo-que-anoto" className="t-seccion">Lo que anotó la empresa</h2>
          <p className="t-dato mt-1" style={{ color: "var(--grafito)" }}>
            Las mismas preguntas que ve el dueño, con el estado de cada dato. Aquí puedes corregir y marcar «Comprobado con un documento» cuando lo tengas delante.
            {modelos.length === 0 && " Elige en el Panorama (La ruta) cómo gana dinero la empresa: así las preguntas se adaptan a su negocio."}
          </p>
        </div>
        <TablaProductos companyId={id} modo="consultora" lineas={lineas} modelos={modelos} totales={fichaNegocio.totales} editable usuarioId={null} config={config} deja={deja} />
      </section>

      <section className="mt-12 flex flex-col gap-4" aria-labelledby="gastos-empresa">
        <h2 id="gastos-empresa" className="t-seccion">Gastos del mes</h2>
        {costos.ok ? (
          <CostosMes
            companyId={id}
            modo="consultora"
            costos={costos.valor}
            editable
            usuarioId={null}
            config={config}
            vital={metricas.ok ? vitalMasReciente(metricas.valor, "gasto_fijo_mes")?.valor ?? null : null}
          />
        ) : (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>No se pudieron leer los gastos del mes{costos.falta ? ": falta aplicar supabase/migracion-entrar-hoy.sql" : ""}.</p>
        )}
      </section>

      <section className="mt-12 flex flex-col gap-4" aria-labelledby="cobros-empresa">
        <h2 id="cobros-empresa" className="t-seccion">Cobros y mercadería</h2>
        {ficha.ok ? (
          <CobrosYMercaderia
            companyId={id}
            modo="consultora"
            modulos={fichaNegocio.modulos}
            moneda={fichaNegocio.moneda}
            credito={fichaNegocio.credito}
            inventario={fichaNegocio.inventario}
            operaciones={ops}
            fugas={fugas}
            puede={{ modulos: true, moneda: true, credito: true, inventario: true }}
            config={config}
            usuarioId={null}
          />
        ) : (
          <p className="t-dato" style={{ color: "var(--grafito)" }}>No se pudo leer la ficha del negocio{ficha.falta ? ": falta aplicar supabase/migracion-entrar-hoy.sql" : ""}.</p>
        )}
      </section>

      <section className="mt-12" aria-labelledby="por-periodo">
        {vistaAnterior ? (
          // Abierta si se llegó con «Ver» (periodo o capacidad en la dirección): si no, el filtro se cerraría al usarlo.
          <details open={Boolean(sp.periodo || sp.personas || sp.horas)}>
            <summary style={{ cursor: "pointer" }}>
              <h2 id="por-periodo" className="t-seccion" style={{ display: "inline" }}>Por periodo y decisión</h2>
            </summary>
            <p className="t-dato mt-2 mb-4" style={{ color: "var(--grafito)" }}>
              Vista anterior, con la decisión que fijas tú: solo lee lo anotado con su periodo y con cifra exacta. Lo que la empresa llenó por mes o en rango está en el tablero de arriba; un «sin dato» de aquí no lo contradice.
            </p>
            {porPeriodo}
          </details>
        ) : (
          <>
            <h2 id="por-periodo" className="t-seccion">Por periodo y decisión</h2>
            {porPeriodo}
          </>
        )}
      </section>
    </>
  );
}
