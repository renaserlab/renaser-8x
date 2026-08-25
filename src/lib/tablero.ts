/**
 * El tablero del empresario (maqueta aprobada): todo lo que muestra sale de datos contados o
 * verificados de SU empresa. Regla: ningún número decorativo — si el dato no existe, la tarjeta
 * no se muestra o pide el dato.
 */
import { supabaseAdmin } from "./supabase/admin";
import { coberturaSesion } from "./rules/cobertura";
import { bibliotecaEsperada } from "./biblioteca";

export type PuntoVenta = { periodo: string; valor: number; estado: string };
export type Tablero = {
  preguntaAbierta: string | null;
  comprension: number; // 0-100
  kpis: { venta: { valor: number; periodo: string; estado: string } | null; ganancia: { valor: number; periodo: string } | null; deuda: number | null };
  serieVentas: PuntoVenta[];
  epocaDorada: number | null;
  biblioteca: { listos: number; total: number; personas: number | null };
};

const LISTOS = ["lo_tengo", "incompleto", "contado", "construido", "borrador_generado", "construyendo", "en_uso"];

export async function tableroEmpresario(companyId: string): Promise<Tablero> {
  const sb = supabaseAdmin();
  const [{ data: metricas }, { data: sesiones }, { data: activos }, { data: empresa }, { data: abiertas }] = await Promise.all([
    sb.from("company_metricas").select("clave,periodo,valor,estado").eq("company_id", companyId).limit(80),
    sb.from("interview_sessions").select("id,tipo,bloques_cubiertos, participants!inner(rol)").eq("company_id", companyId).in("tipo", ["sueno_dueno", "empresa_dueno"]).in("participants.rol", ["dueno", "socio"]),
    sb.from("company_assets").select("clave,estado").eq("company_id", companyId),
    sb.from("companies").select("ficha").eq("id", companyId).single(),
    sb
      .from("interview_responses")
      .select("pregunta,orden, interview_sessions!inner(company_id)")
      .eq("interview_sessions.company_id", companyId)
      .is("respuesta", null)
      .order("orden")
      .limit(1),
  ]);

  // Comprensión: promedio de la cobertura de las sesiones del dueño y del levantamiento por áreas.
  let cobSesiones = 0;
  if (sesiones?.length) {
    const { data: resp } = await sb.from("interview_responses").select("bloque,session_id").not("respuesta", "is", null).in("session_id", sesiones.map((s) => s.id));
    cobSesiones =
      sesiones.reduce((acc, s) => {
        const propias = (resp ?? []).filter((r) => r.session_id === s.id).map((r) => ({ bloque: r.bloque }));
        return acc + coberturaSesion(s.tipo, propias, ((s as { bloques_cubiertos?: string[] | null }).bloques_cubiertos ?? []) as string[]).porcentaje;
      }, 0) / sesiones.length;
  }
  const ficha = (empresa?.ficha ?? null) as Record<string, string> | null;
  const personas = ficha?.personas ? parseInt(ficha.personas, 10) : null;
  const esperadas = bibliotecaEsperada(personas);
  const listos = esperadas.filter((c) => LISTOS.includes((activos ?? []).find((a) => a.clave === c)?.estado ?? "")).length;
  const docsPct = esperadas.length ? (listos / esperadas.length) * 100 : 0;
  const comprension = Math.round(cobSesiones * 0.65 + docsPct * 0.35);

  const meses = (metricas ?? [])
    .filter((m) => m.clave === "venta_mes" && m.valor != null && /^\d{4}-\d{2}$/.test(m.periodo))
    .map((m) => ({ periodo: m.periodo, valor: Number(m.valor), estado: m.estado }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .slice(-6);
  const ultimo = meses[meses.length - 1] ?? null;
  const ganancia = (metricas ?? []).filter((m) => m.clave === "ganancia_mes" && m.valor != null && /^\d{4}-\d{2}$/.test(m.periodo)).sort((a, b) => a.periodo.localeCompare(b.periodo)).pop();
  const deuda = (metricas ?? []).find((m) => m.clave === "deuda_clientes" && m.valor != null);
  const dorada = (metricas ?? []).find((m) => (m.clave === "venta_epoca_dorada" || (m.clave === "venta_mes" && m.periodo === "epoca_dorada")) && m.valor != null);

  return {
    preguntaAbierta: abiertas?.[0]?.pregunta ? String(abiertas[0].pregunta) : null,
    comprension: Math.max(0, Math.min(100, comprension)),
    kpis: {
      venta: ultimo ? { valor: ultimo.valor, periodo: ultimo.periodo, estado: ultimo.estado } : null,
      ganancia: ganancia ? { valor: Number(ganancia.valor), periodo: ganancia.periodo } : null,
      deuda: deuda ? Number(deuda.valor) : null,
    },
    serieVentas: meses,
    epocaDorada: dorada ? Number(dorada.valor) : null,
    biblioteca: { listos, total: esperadas.length, personas },
  };
}
