import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const { data } = await supabaseAdmin().from("companies").select("id,nombre,sector,etapa,estado_admision,fase_actual,created_at").eq("id", id).single();
  return data ? ok(data) : fallo("Empresa no encontrada", 404);
});

export const PATCH = protegido<Ctx>({ consultor: true }, async (_p, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<Record<string, unknown>>(req);
  const permitidos = ["nombre", "sector", "etapa", "estado_admision", "motivo_rechazo", "fase_actual", "tope_tokens", "admision"];
  const cambios = Object.fromEntries(Object.entries(b).filter(([k]) => permitidos.includes(k)));
  const { data, error } = await supabaseAdmin().from("companies").update(cambios).eq("id", id).select("*").single();
  if (error) return fallo(error.message, 500);
  return ok(data);
});

export const DELETE = protegido<Ctx>({ consultor: true }, async (_p, _req, ctx) => {
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin().from("companies").delete().eq("id", id);
  if (error) return fallo(error.message, 500);
  return ok({ eliminada: true });
});
