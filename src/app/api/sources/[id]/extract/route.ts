import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";

type Ctx = { params: Promise<{ id: string }> };

/** Re-encola la extracción de una fuente (por ejemplo, tras un fallo). */
export const POST = protegido<Ctx>({ cupo: "subida" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("sources").select("id,company_id,tipo,origen").eq("id", id).single();
  if (!s) return fallo("Fuente no encontrada", 404);
  await exigirAcceso(perfil, s.company_id);
  if (perfil.rol !== "consultor" && (s.tipo === "entrevista" || s.origen !== "cliente")) return fallo("Fuente no encontrada", 404);
  await sb.from("claims").delete().eq("source_id", id);
  await sb.from("source_fragments").delete().eq("source_id", id);
  await sb.from("jobs").delete().eq("tipo", "extraer").contains("payload", { source_id: id });
  const job = await encolar({ company_id: s.company_id, tipo: "extraer", payload: { source_id: id }, prioridad: PRIORIDAD.extraer });
  return ok({ job_id: job.id });
});

/** P1-22: el cliente solo borra fuentes propias (origen cliente) que no sean entrevistas. El consultor, cualquiera. */
export const DELETE = protegido<Ctx>({ cupo: "subida" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("sources").select("id,company_id,storage_path,tipo,origen").eq("id", id).single();
  if (!s) return fallo("Fuente no encontrada", 404);
  await exigirAcceso(perfil, s.company_id);
  if (perfil.rol !== "consultor" && (s.tipo === "entrevista" || s.origen !== "cliente")) return fallo("Fuente no encontrada", 404);
  if (s.storage_path) await sb.storage.from("fuentes").remove([s.storage_path]);
  await sb.from("sources").delete().eq("id", id);
  return ok({ eliminada: true });
});
