import { protegido, ok, leerValidado, exigirAcceso, uuid, texto } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

/** body: { company_id, descripcion, process_id? } → ARQUITECTO (prioridad 2). Si no hay process_id crea un proceso "dibujando". */
export const POST = protegido({ cupo: "ia" }, async (perfil, req) => {
  // El tope de 8000 no es capricho: es texto que se le manda al modelo y se paga por carácter.
  const b = await leerValidado(req, z.object({
    company_id: uuid,
    descripcion: texto(8000),
    process_id: uuid.optional(),
    nombre: texto(120).optional(),
  }));
  await exigirAcceso(perfil, b.company_id);
  const sb = supabaseAdmin();
  let processId = b.process_id;
  if (!processId) {
    const { data } = await sb.from("processes").insert({ company_id: b.company_id, nombre: b.nombre || "Proceso nuevo", origen: "generado_ia" }).select("id").single();
    processId = data?.id;
  }
  const job = await encolar({ company_id: b.company_id, tipo: "generar_proceso", payload: { descripcion: b.descripcion, process_id: processId }, prioridad: PRIORIDAD.proceso_voz });
  return ok({ job_id: job.id, process_id: processId });
});
