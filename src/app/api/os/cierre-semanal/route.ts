import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { hoyEn, lunesDe } from "@/lib/os/calculos";
import { puedeCerrarSemana } from "@/lib/os/dia";

const Esquema = z.object({
  logros: z.string().trim().min(1).max(1500),
  trabas: z.string().trim().max(1500).optional(),
  compromiso: z.string().trim().max(1500).optional(),
});

/**
 * CIERRE SEMANAL: logros, trabas y el compromiso para la semana siguiente. De viernes a domingo, uno por semana (la
 * semana se nombra por su lunes). La regla de cierre semanal recuerda el viernes y el sábado a quien no lo hizo.
 */
export const POST = protegido({ entidad: "os_cierres_semanales" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { persona: true });
  const hoy = hoyEn(c.zona);
  if (!puedeCerrarSemana(hoy)) return fallo("El cierre de la semana se hace de viernes a domingo.", 409);
  const b = await leerValidado(req, Esquema);
  const { data, error } = await supabaseAdmin()
    .from("os_cierres_semanales")
    .insert({ company_id: c.companyId, persona_id: c.persona!.id, semana: lunesDe(hoy), logros: b.logros, trabas: b.trabas || null, compromiso: b.compromiso || null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return fallo("Ya cerraste esta semana.", 409);
    throw new Error(error.message);
  }
  return ok({ id: data.id }, 201);
});
