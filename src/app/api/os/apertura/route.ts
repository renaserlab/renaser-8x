import { z } from "zod";
import { protegido, ok, fallo, leerValidado, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { hoyEn } from "@/lib/os/calculos";

const Esquema = z.object({
  animo: z.number().int().min(1).max(5),
  compromiso: z.string().trim().max(500).optional(),
  enfocar: z.array(uuid).max(100).optional(),
});

/**
 * ABRIR EL DÍA (apertura RENASER): ánimo del 1 al 5, el compromiso del día y en qué tareas se enfoca. Una apertura por
 * persona y por día. Las tareas marcadas que venían de días anteriores pasan a tener hoy como día de trabajo: así quedan
 * como «trabajo puesto para hoy» (lo que ve la gestión en Equipo en vivo). Las que ya eran de hoy no se tocan.
 */
export const POST = protegido({ entidad: "os_aperturas" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { persona: true });
  const persona = c.persona!;
  const b = await leerValidado(req, Esquema);
  const hoy = hoyEn(c.zona);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("os_aperturas")
    .insert({ company_id: c.companyId, persona_id: persona.id, fecha: hoy, animo: b.animo, compromiso: b.compromiso || null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return fallo("Ya abriste tu día hoy.", 409);
    throw new Error(error.message);
  }
  if (b.enfocar?.length) {
    await sb
      .from("os_tareas")
      .update({ fecha_inicio: hoy, updated_at: new Date().toISOString() })
      .eq("company_id", c.companyId)
      .eq("persona_id", persona.id)
      .in("id", b.enfocar)
      .neq("estado", "completada")
      .or(`fecha_inicio.is.null,fecha_inicio.lt.${hoy}`);
  }
  return ok({ id: data.id }, 201);
});
