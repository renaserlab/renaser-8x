import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { CamposProyecto, responsableValido } from "../_comun";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({ ...CamposProyecto, cerrado: z.boolean() }).partial();

/** EDITAR UN PROYECTO, CERRARLO O REABRIRLO. Cerrar no toca sus tareas: solo lo saca de la lista de lo que se persigue. */
export const PATCH = protegido<Ctx>({ entidad: "os_proyectos" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil, { gestion: true });
  const b = await leerValidado(req, Esquema);
  if (!(await responsableValido(c.companyId, b.responsable_id))) return fallo("Esa persona no es de tu equipo.", 404);
  const cambios: Record<string, unknown> = {};
  if (b.nombre !== undefined) cambios.nombre = b.nombre;
  if (b.descripcion !== undefined) cambios.descripcion = b.descripcion || null;
  if (b.responsable_id !== undefined) cambios.responsable_id = b.responsable_id;
  if (b.fecha_entrega !== undefined) cambios.fecha_entrega = b.fecha_entrega;
  if (b.cerrado !== undefined) cambios.cerrado_at = b.cerrado ? new Date().toISOString() : null;
  if (!Object.keys(cambios).length) return fallo("No hay nada que cambiar.");
  const { data, error } = await supabaseAdmin().from("os_proyectos").update(cambios).eq("id", id).eq("company_id", c.companyId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return fallo("Ese proyecto no es de tu empresa.", 404);
  return ok({ id });
});
