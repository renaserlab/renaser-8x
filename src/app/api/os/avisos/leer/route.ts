import { z } from "zod";
import { protegido, ok, fallo, leerValidado, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";

const Esquema = z.object({ ids: z.array(uuid).max(200).optional(), todos: z.boolean().optional() });

/**
 * MARCAR AVISOS COMO LEÍDOS: unos por id o todos los que le tocan. Solo los que quien entra puede ver (los suyos y, si
 * es gestión, los de la gestión): el filtro es el mismo de avisosDe (src/lib/os/datos.ts).
 */
export const POST = protegido({ entidad: "os_avisos" }, async (perfil, req) => {
  const c = await exigirOS(perfil);
  const b = await leerValidado(req, Esquema);
  if (!b.todos && !b.ids?.length) return fallo("Di qué avisos marcar.");
  const filtro = [c.persona ? `persona_id.eq.${c.persona.id}` : null, c.gestion ? "para_gestion.eq.true" : null].filter(Boolean).join(",");
  if (!filtro) return ok({ leidos: 0 });
  let q = supabaseAdmin().from("os_avisos").update({ leido_at: new Date().toISOString() }).eq("company_id", c.companyId).is("leido_at", null).or(filtro);
  if (!b.todos) q = q.in("id", b.ids!);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return ok({ leidos: data?.length ?? 0 });
});
