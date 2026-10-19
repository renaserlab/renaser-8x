import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { hoyEn } from "@/lib/os/calculos";
import { puedeCerrarDia, HORA_CIERRE_DIA } from "@/lib/os/dia";

const Esquema = z.object({
  hecho: z.string().trim().min(1).max(1500),
  pendiente: z.string().trim().max(1500).optional(),
});

/**
 * CERRAR EL DÍA: lo que se terminó y lo que quedó pendiente (y por qué). Desde las 17:00 de la empresa, una vez por día.
 * Si el cronómetro sigue corriendo, se detiene: el día se cerró.
 */
export const POST = protegido({ entidad: "os_cierres" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { persona: true });
  const persona = c.persona!;
  if (!puedeCerrarDia(new Date(), c.zona)) return fallo(`El cierre del día se abre a las ${HORA_CIERRE_DIA}:00.`, 409);
  const b = await leerValidado(req, Esquema);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("os_cierres")
    .insert({ company_id: c.companyId, persona_id: persona.id, fecha: hoyEn(c.zona), hecho: b.hecho, pendiente: b.pendiente || null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return fallo("Ya cerraste tu día hoy.", 409);
    throw new Error(error.message);
  }
  await sb.from("os_registros_tiempo").update({ fin: new Date().toISOString() }).eq("persona_id", persona.id).is("fin", null);
  return ok({ id: data.id }, 201);
});
