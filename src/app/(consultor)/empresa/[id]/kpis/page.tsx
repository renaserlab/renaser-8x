import { supabaseAdmin } from "@/lib/supabase/admin";
import { Encabezado } from "@/components/base/Vacio";
import { desdeFila, completitud, listo, preparacion, alertas, avance, kpisDesdeVitales, zonaDe } from "@/lib/kpis";
import { leerHoraCierre } from "@/lib/negocio-datos";
import type { Metrica } from "@/lib/metricas";
import { TableroKpis, type KpiVista, type ValorHistoria } from "@/components/kpis/TableroKpis";
import { ResumenIndicadores } from "@/components/kpis/ResumenIndicadores";
import type { Participante, AccionDelPlan, LineaBase } from "@/components/kpis/FormularioKpi";

export const dynamic = "force-dynamic";

/**
 * INDICADORES DE LA EMPRESA, vista de la consultora. Lo que hace falta para dirigir con números y no
 * con sensaciones: los doce atributos de cada indicador, qué le falta, qué alerta, cuánto avanzó desde
 * su punto de partida, y la historia de valores. Ejecución y resultado en listas separadas.
 *
 * «Listo para contarse» es el que tiene los doce atributos y está clasificado; el que ya está definido y
 * solo espera su primer valor se cuenta aparte, y el resto está por terminar de definir.
 *
 * Todo lo que se calcula aquí es determinista (kpis.ts) y se calcula al pedir la página, con la hora de
 * la petición: por eso «dato viejo» cambia solo con el paso de los días.
 *
 * Revisión del 16-10-2026: Indicadores es una de las cinco vistas de la empresa (Kelin: «diagnóstico, números,
 * indicadores y el avance»). Arriba, la tarjeta con la línea del indicador de resultado y cuántos están listos
 * (ResumenIndicadores, la misma de Avance), con lo que esta página ya leía; debajo, en su hoja, el tablero de siempre.
 */
export default async function KpisPag({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const hoy = new Date();

  const [{ data: filas }, { data: participantes }, { data: acciones }, { data: mediciones }, { data: metricas }, { data: empresa }, { data: plan }, horaCierre] = await Promise.all([
    sb.from("indicadores").select("*").eq("company_id", id).order("created_at"),
    sb.from("participants").select("id,nombre,puesto,rol").eq("company_id", id).order("nombre"),
    sb.from("actions").select("id,accion,estado").eq("company_id", id).not("estado", "in", "(descartado,rechazado)").order("prioridad"),
    // Las versiones de la línea base: el punto de partida de un indicador puede referenciar una exacta.
    sb.from("mediciones").select("id,version,vigente,fecha,periodo_hasta,valores").eq("company_id", id).eq("tipo", "linea_base").order("version", { ascending: false }),
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", id).limit(300),
    // Un periodo cierra en el reloj de la empresa. Si la columna no existe o viene vacía, America/Lima.
    sb.from("companies").select("zona_horaria").eq("id", id).maybeSingle(),
    // El plan ENTERO, también lo descartado y lo rechazado: para decir «meta sin plan» hay que saber si la acción
    // que el indicador nombra sigue viva. La lista de arriba (sin descartadas) es la del selector del formulario.
    sb.from("actions").select("id,estado,indicador_id,accion,verificado_at").eq("company_id", id),
    // A qué hora cierra el negocio: lo diario de hoy se anota desde esa hora. Aparte, para que no arrastre a la zona.
    leerHoraCierre(id),
  ]);
  const zona = zonaDe((empresa as { zona_horaria?: unknown } | null)?.zona_horaria);

  const kpis: KpiVista[] = ((filas ?? []) as Record<string, unknown>[]).map(desdeFila).map((k) => ({
    ...k,
    completitud: completitud(k),
    listo: listo(k).ok,
    // Las alertas son de lo que se vigila: un propuesto o archivado no avisa de nada.
    // Con el plan a la vista: una acción que apunta al indicador (indicador_id) también es su plan.
    alertas: k.estado === "activo" ? alertas(k, hoy, plan ?? undefined) : [],
    avance: avance(k),
  }));

  const ids = kpis.map((k) => k.id);
  const { data: historiaRaw } = ids.length
    ? await sb.from("indicador_valores").select("indicador_id,periodo,valor,fuente,estado_validacion,created_at").in("indicador_id", ids).order("periodo", { ascending: false }).limit(600)
    : { data: [] as ValorHistoria[] };
  const historia: ValorHistoria[] = ((historiaRaw ?? []) as Record<string, unknown>[]).map((v) => ({
    indicador_id: String(v.indicador_id),
    periodo: String(v.periodo),
    valor: Number(v.valor),
    fuente: (v.fuente as string | null) ?? null,
    estado_validacion: String(v.estado_validacion ?? "declarado"),
    created_at: (v.created_at as string | null) ?? null,
  }));

  const existentes = new Set(kpis.map((k) => k.clave));
  const propuestas = kpisDesdeVitales(id, (metricas ?? []) as Metrica[]).filter((p) => !existentes.has(p.kpi.clave));

  const lineasBase: LineaBase[] = ((mediciones ?? []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    version: Number(m.version ?? 1),
    vigente: m.vigente !== false,
    fecha: String(m.fecha ?? ""),
    periodo_hasta: (m.periodo_hasta as string | null) ?? null,
    valores: (m.valores ?? {}) as Record<string, number | null>,
  }));

  const activos = kpis.filter((k) => k.estado === "activo");
  const listos = activos.filter((k) => k.listo).length;
  const esperan = activos.filter((k) => preparacion(k) === "espera_primer_valor").length;
  const porDefinir = activos.length - listos - esperan;

  return (
    <>
      <div className="tablero">
        <ResumenIndicadores
          activos={activos}
          valores={historia.map((v) => ({ indicador_id: v.indicador_id, periodo: v.periodo, valor: v.valor, estado_validacion: v.estado_validacion }))}
          hoy={hoy}
          zona={zona}
        />
      </div>
      <div className="hoja-suelta">
      <Encabezado
        titulo="Cada indicador"
        sub={
          <>
            {kpis.length === 0
              ? "Todavía no hay indicadores. Se crean aquí, con sus doce atributos, o se proponen desde las incidencias y desde los nueve números."
              : `${activos.length} activo(s): ${listos} listo(s) para contarse (con los doce atributos y clasificados), ${esperan} definido(s) que solo esperan su primer valor y ${porDefinir} por terminar de definir. Un indicador terminado no es un resultado: reportado ≠ verificado ≠ resultado observado.`}
          </>
        }
      />
      <TableroKpis
        companyId={id}
        kpis={kpis}
        historia={historia}
        participantes={(participantes ?? []) as Participante[]}
        acciones={(acciones ?? []) as AccionDelPlan[]}
        lineasBase={lineasBase}
        propuestas={propuestas}
        zona={zona}
        horaCierre={horaCierre}
      />
      </div>
    </>
  );
}
