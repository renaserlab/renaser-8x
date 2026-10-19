import { z } from "zod";
import { protegido, ok, fallo, leerValidado, AccesoDenegado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS, exigirPersonaDeLaEmpresa } from "@/lib/os/acceso";
import { CamposPersona, cuentaDelCorreo, mensajeDuplicado } from "../_comun";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({ ...CamposPersona, activo: z.boolean() }).partial();

/**
 * EDITAR, DESACTIVAR O REACTIVAR A ALGUIEN DEL EQUIPO. Desactivar no borra nada: la persona deja de entrar a RENASER OS
 * y de contar en el equipo, y su historia queda. Nadie se desactiva a sí mismo, y el rol de dueño solo lo da o lo
 * quita el dueño (o la consultora).
 */
export const PATCH = protegido<Ctx>({ entidad: "os_personas" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil, { talento: true });
  const p = await exigirPersonaDeLaEmpresa(c, id);
  const b = await leerValidado(req, Esquema);
  const tocaDueno = b.rol !== undefined && (b.rol === "dueno") !== (p.rol === "dueno");
  if (tocaDueno && c.rol !== "dueno" && c.rol !== "consultor") throw new AccesoDenegado("Solo el dueño puede dar o quitar el rol de dueño.", "rol", c.companyId);
  if (b.activo === false && p.id === c.persona?.id) return fallo("No puedes desactivarte a ti mismo.");
  const cambios: Record<string, unknown> = {};
  if (b.nombre !== undefined) cambios.nombre = b.nombre;
  if (b.email !== undefined) cambios.email = b.email || null;
  if (b.puesto !== undefined) cambios.puesto = b.puesto || null;
  if (b.area !== undefined) cambios.area = b.area || null;
  if (b.rol !== undefined) cambios.rol = b.rol;
  if (b.capacidad_horas !== undefined) cambios.capacidad_min = Math.round(b.capacidad_horas * 60);
  if (b.activo !== undefined) cambios.activo = b.activo;
  if (b.email && !p.user_id) {
    const cuenta = await cuentaDelCorreo(b.email);
    if (cuenta) cambios.user_id = cuenta;
  }
  if (!Object.keys(cambios).length) return fallo("No hay nada que cambiar.");
  const { error } = await supabaseAdmin().from("os_personas").update(cambios).eq("id", p.id).eq("company_id", c.companyId);
  if (error) {
    const m = mensajeDuplicado(error);
    if (m) return fallo(m, 409);
    throw new Error(error.message);
  }
  return ok({ id: p.id });
});
