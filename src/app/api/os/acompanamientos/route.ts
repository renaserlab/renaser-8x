import { z } from "zod";
import { protegido, ok, fallo, leerValidado, texto, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS, exigirPersonaDeLaEmpresa } from "@/lib/os/acceso";
import { instanteEn } from "@/lib/os/equipo";

const Esquema = z.object({
  persona_id: uuid,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "no es una fecha y hora"),
  tema: texto(300),
});

/** PROGRAMAR UNA SESIÓN DE ACOMPAÑAMIENTO (Equipo y talento). La fecha llega en el reloj de la empresa. */
export const POST = protegido({ entidad: "os_acompanamientos" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { talento: true });
  const b = await leerValidado(req, Esquema);
  const p = await exigirPersonaDeLaEmpresa(c, b.persona_id);
  const fecha = instanteEn(b.fecha, c.zona);
  if (!fecha) return fallo("Revisa la fecha y la hora.");
  const { data, error } = await supabaseAdmin()
    .from("os_acompanamientos")
    .insert({ company_id: c.companyId, persona_id: p.id, fecha: fecha.toISOString(), tema: b.tema, por: perfil.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return ok({ id: data.id }, 201);
});
