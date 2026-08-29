import { supabaseAdmin } from "./supabase/admin";

export type Documento = {
  id: string; tipo: string; version: number; estado: "borrador" | "vigente" | "obsoleto";
  publicado: boolean; publicado_at: string | null;
  aprobado_at: string | null; aprobado_nombre: string | null; motivo_cambio: string | null;
  created_at: string;
};

export const NOMBRE_TIPO: Record<string, string> = {
  informe_realidad: "Informe de la realidad",
  diagnostico_4p: "Diagnóstico por áreas",
  mapa_as_is: "Mapa de cómo trabajan hoy",
  mapa_to_be: "Mapa de cómo deberían trabajar",
  manual_procesos: "Manual de procesos",
  plan_90: "Plan de 90 días",
  mapa_automatizacion: "Mapa de automatización",
  plan_estrategico: "Plan estratégico",
};

export const ESTADO_DOC: Record<string, { texto: string; color: string }> = {
  borrador: { texto: "Borrador", color: "var(--caducado)" },
  vigente: { texto: "Vigente", color: "var(--confirmado)" },
  obsoleto: { texto: "Reemplazado", color: "var(--grafito)" },
};

/**
 * CONTROL DOCUMENTAL (ISO 9001 cláusula 7.5, hallazgo de la auditoría del 29-08-2026).
 * Antes `version` era un número suelto: no había historial, ni quién aprobó, ni obsoletos. El
 * aplicativo estaba por exigirle a sus clientes un control que él mismo no tenía.
 */
export async function documentosDe(companyId: string): Promise<Documento[]> {
  const { data } = await supabaseAdmin()
    .from("deliverables")
    .select("id,tipo,version,estado,publicado,publicado_at,aprobado_at,aprobado_nombre,motivo_cambio,created_at")
    .eq("company_id", companyId)
    .order("tipo")
    .order("created_at", { ascending: false });
  return (data ?? []) as Documento[];
}

/** Agrupa por tipo: el vigente arriba, las versiones anteriores debajo. */
export function porTipo(docs: Documento[]) {
  const mapa = new Map<string, { vigente: Documento | null; historial: Documento[] }>();
  for (const d of docs) {
    const g = mapa.get(d.tipo) ?? { vigente: null, historial: [] };
    if (d.estado === "vigente" && !g.vigente) g.vigente = d;
    else g.historial.push(d);
    mapa.set(d.tipo, g);
  }
  return [...mapa.entries()].map(([tipo, g]) => ({ tipo, nombre: NOMBRE_TIPO[tipo] ?? tipo, ...g }));
}

/** Aprobar sube la versión y deja obsoleta la anterior, en una sola transacción de la base. */
export async function aprobarDocumento(id: string, porId: string, nombre: string, motivo: string) {
  const { data, error } = await supabaseAdmin().rpc("aprobar_documento", {
    p_id: id, p_por: porId, p_nombre: nombre, p_motivo: motivo || "Primera aprobación",
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as { id: string; version: number; estado: string };
}
