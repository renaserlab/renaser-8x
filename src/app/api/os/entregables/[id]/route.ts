import { NextResponse } from "next/server";
import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";

type Ctx = { params: Promise<{ id: string }> };

const BUCKET = "os-entregables";

async function entregable(companyId: string, id: string) {
  const { data } = await supabaseAdmin().from("os_entregables").select("id,persona_id,ruta,titulo").eq("id", id).eq("company_id", companyId).maybeSingle();
  return data as { id: string; persona_id: string; ruta: string; titulo: string } | null;
}

/** DESCARGAR: enlace firmado de un minuto. Lo descarga quien lo subió o la gestión de la empresa (y la consultora). */
export const GET = protegido<Ctx>({ entidad: "os_entregables" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil);
  const e = await entregable(c.companyId, id);
  if (!e || (e.persona_id !== c.persona?.id && !c.gestion)) return fallo("No encontramos ese entregable.", 404);
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(e.ruta, 60, { download: true });
  if (error || !data?.signedUrl) return fallo("No pudimos preparar la descarga. Intenta de nuevo.", 502);
  return NextResponse.redirect(data.signedUrl);
});

/** BORRAR: solo el propio. Se borra el archivo y su fila. */
export const DELETE = protegido<Ctx>({ entidad: "os_entregables" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil, { persona: true });
  const e = await entregable(c.companyId, id);
  if (!e || e.persona_id !== c.persona!.id) return fallo("Solo puedes borrar tus propios entregables.", 404);
  const sb = supabaseAdmin();
  await sb.storage.from(BUCKET).remove([e.ruta]);
  const { error } = await sb.from("os_entregables").delete().eq("id", e.id).eq("company_id", c.companyId);
  if (error) throw new Error(error.message);
  return ok({ id: e.id });
});
