import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** body: { estado?, nota?, responsable?, kpi?, semana_cierre? } — el cliente solo puede cambiar estado y nota. */
export const PATCH = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: a } = await sb.from("actions").select("id,company_id").eq("id", id).single();
  if (!a) return fallo("Frente no encontrado", 404);
  await exigirAcceso(perfil, a.company_id);
  const b = await leerJSON<Record<string, unknown>>(req);
  const permitidos = perfil.rol === "consultor" ? ["estado", "nota", "responsable", "kpi", "semana_inicio", "semana_cierre", "accion", "evidencia", "vence_at", "fase"] : ["estado", "nota"];
  const cambios = Object.fromEntries(Object.entries(b).filter(([k]) => permitidos.includes(k)));
  cambios.updated_at = new Date().toISOString();
  const { data, error } = await sb.from("actions").update(cambios).eq("id", id).select("*").single();
  if (error) return fallo(error.message, 500);
  return ok(data);
});
