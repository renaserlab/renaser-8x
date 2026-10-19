import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { CamposProyecto, responsableValido } from "./_comun";

const Esquema = z.object(CamposProyecto);

/** CREAR UN PROYECTO (Proyectos y objetivo). Su avance lo darán sus tareas, no se escribe a mano. */
export const POST = protegido({ entidad: "os_proyectos" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { gestion: true });
  const b = await leerValidado(req, Esquema);
  if (!(await responsableValido(c.companyId, b.responsable_id))) return fallo("Esa persona no es de tu equipo.", 404);
  const { data, error } = await supabaseAdmin()
    .from("os_proyectos")
    .insert({
      company_id: c.companyId,
      nombre: b.nombre,
      descripcion: b.descripcion || null,
      responsable_id: b.responsable_id ?? null,
      fecha_entrega: b.fecha_entrega ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return ok({ id: data.id }, 201);
});
