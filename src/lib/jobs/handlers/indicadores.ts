import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrMedidor } from "@/lib/ai/agents/medidor";
import { comoDato } from "@/lib/rules/patrones";
import { normalizarClave } from "@/lib/metricas";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/**
 * INCIDENCIAS → NÚMEROS QUE SE VIGILAN. En el catálogo estaba escrito que "las incidencias son la
 * mina de KPIs" y no había una sola línea que las extrajera: lo que se repetía se quedaba en un
 * párrafo. Aquí ese párrafo se vuelve indicadores concretos que se miden en cada corte.
 *
 * Los indicadores nacen PROPUESTOS: el dueño decide cuáles adopta. Un número que él no eligió no lo
 * va a contar, y un indicador que nadie cuenta es peor que ninguno — aparenta control sin darlo.
 */
export async function handleProponerIndicadores(job: Job) {
  const sb = supabaseAdmin();

  const [{ data: activos }, { data: acciones }, { data: hallazgos }, { data: yaExisten }] = await Promise.all([
    sb.from("company_assets").select("clave,borrador,nota").eq("company_id", job.company_id).in("clave", ["procesos.incidencias", "procesos.controles", "procesos.procedimientos"]),
    sb.from("actions").select("accion,kpi").eq("company_id", job.company_id).not("kpi", "is", null).limit(20),
    sb.from("findings").select("titulo,causa_raiz,costo_posible").eq("company_id", job.company_id).eq("impacto", "alto").limit(12),
    sb.from("indicadores").select("clave").eq("company_id", job.company_id),
  ]);

  const incidencias = (activos ?? []).map((a) => `[${a.clave}]\n${a.borrador ?? a.nota ?? ""}`).filter((t) => t.trim().length > 30);
  const kpisDelPlan = (acciones ?? []).map((a) => `- ${a.accion} → se mediría con: ${a.kpi}`);
  const criticos = (hallazgos ?? []).map((h) => `- ${h.titulo}. Causa: ${h.causa_raiz ?? "sin dato"}. Cuesta: ${h.costo_posible ?? "sin dato"}`);

  // Sin material no se inventa: es preferible no proponer nada a proponer los típicos del rubro.
  if (incidencias.length === 0 && kpisDelPlan.length === 0 && criticos.length === 0)
    return { indicadores: 0, motivo: "todavía no hay incidencias ni hallazgos de los que salgan números" };

  const contexto = comoDato(
    "LO QUE LA EMPRESA CONTO",
    [
      incidencias.length ? `LO QUE SALE MAL SEGUIDO, contado por la empresa:\n${incidencias.join("\n\n")}` : "",
      criticos.length ? `HALLAZGOS CRÍTICOS del diagnóstico:\n${criticos.join("\n")}` : "",
      kpisDelPlan.length ? `LO QUE EL PLAN YA DIJO QUE HABRÍA QUE MEDIR:\n${kpisDelPlan.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
  );

  const r = await correrMedidor(contexto);
  const propuestos = r.data.indicadores ?? [];
  const existentes = new Set((yaExisten ?? []).map((x) => x.clave as string));

  let creados = 0;
  for (const i of propuestos) {
    const clave = normalizarClave(i.clave);
    // No se pisa un indicador que el dueño ya adoptó ni se duplica uno propuesto antes.
    if (!clave || existentes.has(clave)) continue;
    const { error } = await sb.from("indicadores").insert({
      company_id: job.company_id,
      clave,
      nombre: i.nombre,
      como_se_mide: i.como_se_mide,
      unidad: i.unidad,
      mejor_si: i.mejor_si,
      meta_valor: i.meta_valor,
      meta_texto: i.meta_texto,
      frecuencia: i.frecuencia,
      origen: "incidencia",
      origen_texto: i.origen_texto,
      estado: "propuesto",
    });
    if (!error) {
      existentes.add(clave);
      creados++;
    }
  }

  return { indicadores: creados, propuestos: propuestos.length };
}
