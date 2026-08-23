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
  const { data: claims } = await sb.from("claims").select("pilar,estado").eq("company_id", companyId);
  const disparados: string[] = [];
  for (const pilar of ["personas", "procesos", "producto", "marketing"]) {
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
