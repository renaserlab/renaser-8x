import { z } from "zod";
import { protegido, ok, leerValidado, texto } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";

const Esquema = z.object({
  nombre: texto(120),
  puesto: z.string().trim().max(120).nullable().optional(),
  area: z.string().trim().max(120).nullable().optional(),
});

/** MI PERFIL: cada persona corrige su nombre, su puesto y su área. El rol y la capacidad los pone la gestión. */
export const PATCH = protegido({ entidad: "os_personas" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { persona: true });
  const b = await leerValidado(req, Esquema);
  const { error } = await supabaseAdmin()
    .from("os_personas")
    .update({ nombre: b.nombre, puesto: b.puesto || null, area: b.area || null })
    .eq("id", c.persona!.id)
    .eq("company_id", c.companyId);
  if (error) throw new Error(error.message);
  return ok({ id: c.persona!.id });
});
