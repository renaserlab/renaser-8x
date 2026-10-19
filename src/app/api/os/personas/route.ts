import { z } from "zod";
import { protegido, ok, fallo, leerValidado, AccesoDenegado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { CamposPersona, cuentaDelCorreo, mensajeDuplicado } from "./_comun";

const Esquema = z.object(CamposPersona);

/**
 * DAR DE ALTA A UNA PERSONA DEL EQUIPO (Equipo y talento, 19-10-2026). Lo hace quien lleva el talento (dueño, gerente,
 * RR.HH. o la consultora). La persona entra creando su cuenta en /registro con ese mismo correo: queda enlazada sola
 * (aceptarInvitaciones). Si ya tenía cuenta, se enlaza aquí mismo. El rol de dueño solo lo da el dueño (o la consultora).
 */
export const POST = protegido({ entidad: "os_personas" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { talento: true });
  const b = await leerValidado(req, Esquema);
  if (b.rol === "dueno" && c.rol !== "dueno" && c.rol !== "consultor") throw new AccesoDenegado("Solo el dueño puede dar el rol de dueño.", "rol", c.companyId);
  const userId = await cuentaDelCorreo(b.email);
  const { data, error } = await supabaseAdmin()
    .from("os_personas")
    .insert({
      company_id: c.companyId,
      nombre: b.nombre,
      email: b.email || null,
      puesto: b.puesto || null,
      area: b.area || null,
      rol: b.rol,
      capacidad_min: Math.round((b.capacidad_horas ?? 8) * 60),
      user_id: userId,
    })
    .select("id")
    .single();
  if (error) {
    const m = mensajeDuplicado(error);
    if (m) return fallo(m, 409);
    throw new Error(error.message);
  }
  return ok({ id: data.id, enlazada: !!userId }, 201);
});
