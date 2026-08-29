import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "./queue";
import { MIN_CONFIRMADAS_POR_PILAR } from "@/lib/rules/suficiencia";

/**
 * Autonomía del producto: si un pilar ya tiene suficiencia (>= mínimo de confirmadas) y ninguna
 * contradicción abierta, el diagnóstico se dispara solo (idempotente por nivel de información:
 * al crecer la evidencia se vuelve a diagnosticar). Así el empresario recibe "Mi empresa hoy"
 * sin que un consultor tenga que operar la herramienta.
 */
export async function dispararDiagnosticoSiListo(companyId: string): Promise<string[]> {
  const sb = supabaseAdmin();
  const [{ data: claims }, { data: pendientes }] = await Promise.all([
    sb.from("claims").select("pilar,estado").eq("company_id", companyId),
    // COLAPSO DE DUPLICADOS: si un pilar ya tiene diagnóstico EN COLA, no se apila otro — el
    // pendiente leerá la evidencia más fresca cuando corra. (Caso real: una empresa respondiendo
    // cada minuto apilaba 3 diagnósticos del mismo pilar más rápido de lo que se procesaban.)
    sb.from("jobs").select("payload").eq("company_id", companyId).eq("tipo", "diagnosticar").eq("estado", "pendiente"),
  ]);
  const yaEnCola = new Set((pendientes ?? []).map((j) => (j.payload as { pilar?: string })?.pilar).filter(Boolean));
  const disparados: string[] = [];
  for (const pilar of ["personas", "procesos", "producto", "marketing"]) {
    if (yaEnCola.has(pilar)) continue;
    const del = (claims ?? []).filter((c) => c.pilar === pilar || c.pilar === "transversal");
    const confirmadas = del.filter((c) => c.estado === "confirmado").length;
    const abiertas = del.filter((c) => c.estado === "contradicho").length;
    if (confirmadas < MIN_CONFIRMADAS_POR_PILAR || abiertas > 0) continue;
    // Idempotencia por "nivel" de evidencia: cada ~3 confirmadas nuevas amerita una mirada fresca.
    const nivel = Math.floor(confirmadas / 3);
    await encolar({ company_id: companyId, tipo: "diagnosticar", payload: { pilar }, prioridad: PRIORIDAD.diagnosticar, idempotency_key: claveIdempotente(["auto-diag", companyId, pilar, nivel]) }).catch(() => {});
    disparados.push(pilar);
  }
  return disparados;
}
