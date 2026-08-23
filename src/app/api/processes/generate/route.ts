import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

/** body: { company_id, descripcion, process_id? } → ARQUITECTO (prioridad 2). Si no hay process_id crea un proceso "dibujando". */
export const POST = protegido({}, async (perfil, req) => {
  const b = await leerJSON<{ company_id?: string; descripcion?: string; process_id?: string; nombre?: string }>(req);
  if (!b.company_id || !b.descripcion?.trim()) return fallo("Describe el proceso primero.");
  await exigirAcceso(perfil, b.company_id);
  const sb = supabaseAdmin();
  let processId = b.process_id;
  if (!processId) {
    const { data } = await sb.from("processes").insert({ company_id: b.company_id, nombre: b.nombre?.trim() || "Proceso nuevo", origen: "generado_ia" }).select("id").single();
    processId = data?.id;
  }
  const job = await encolar({ company_id: b.company_id, tipo: "generar_proceso", payload: { descripcion: b.descripcion.trim(), process_id: processId }, prioridad: PRIORIDAD.proceso_voz });
  return ok({ job_id: job.id, process_id: processId });
});
