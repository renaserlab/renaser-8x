import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

const CAMPOS = ["responsable", "objetivo", "inicio", "resultado", "tiempo", "herramientas", "sale_mal", "como_bien"] as const;

/** La ficha del proceso (bloqueador 4): PATCH con lista blanca de campos. El cliente completa solo huecos. */
export const PATCH = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("processes").select("id,company_id").eq("id", id).single();
  if (!p) return fallo("No encontramos ese proceso", 404);
  await exigirAcceso(perfil, p.company_id);
  const b = await leerJSON<Record<string, unknown>>(req);
  const cambios: Record<string, string | null> = {};
  for (const k of CAMPOS) if (k in b) cambios[k] = String(b[k] ?? "").trim().slice(0, 500) || null;
  if (!Object.keys(cambios).length) return fallo("Nada que guardar.");
  const { error } = await sb.from("processes").update(cambios).eq("id", id);
  if (error) return fallo(error.message, 500);
  return ok({ id, ...cambios });
});

export const POST = PATCH;
