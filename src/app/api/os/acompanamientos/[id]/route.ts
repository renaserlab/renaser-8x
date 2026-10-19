import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({ acuerdos: z.string().trim().max(4000).nullable().optional(), hecho: z.boolean().optional() });

/** ANOTAR LOS ACUERDOS DE UNA SESIÓN Y MARCARLA HECHA (o devolverla a pendiente). */
export const PATCH = protegido<Ctx>({ entidad: "os_acompanamientos" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil, { talento: true });
  const b = await leerValidado(req, Esquema);
  const cambios: Record<string, unknown> = {};
  if (b.acuerdos !== undefined) cambios.acuerdos = b.acuerdos || null;
  if (b.hecho !== undefined) cambios.hecho = b.hecho;
  if (!Object.keys(cambios).length) return fallo("No hay nada que cambiar.");
  const { data, error } = await supabaseAdmin().from("os_acompanamientos").update(cambios).eq("id", id).eq("company_id", c.companyId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return fallo("Esa sesión no es de tu empresa.", 404);
  return ok({ id });
});
