import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { BLOQUES_ACTIVOS } from "@/lib/activos";

type Ctx = { params: Promise<{ id: string }> };

const CLAVES = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));

/** Inventario de activos: GET estados · POST { clave, estado, nota? } (upsert). La ausencia no es defecto: es señal. */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const { data } = await supabaseAdmin().from("company_assets").select("bloque,clave,estado,nota,source_id,borrador,faltantes").eq("company_id", id);
  return ok({ activos: data ?? [] });
});

export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerJSON<{ clave?: string; estado?: string; nota?: string }>(req);
  if (!b.clave || !CLAVES.has(b.clave)) return fallo("Activo desconocido.");
  if (!["lo_tengo", "incompleto", "no_lo_tengo", "no_se"].includes(b.estado ?? "")) return fallo("Estado inválido.");
  const bloque = b.clave.split(".")[0];
  const { error } = await supabaseAdmin()
    .from("company_assets")
    .upsert({ company_id: id, bloque, clave: b.clave, estado: b.estado, nota: b.nota?.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "company_id,clave" });
  if (error) return fallo(error.message, 500);
  return ok({ clave: b.clave, estado: b.estado });
});
