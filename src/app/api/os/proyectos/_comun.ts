import { z } from "zod";
import { texto, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const CamposProyecto = {
  nombre: texto(160),
  descripcion: z.string().trim().max(2000).nullable().optional(),
  responsable_id: uuid.nullable().optional(),
  fecha_entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "no es un día").nullable().optional(),
};

/** El responsable, si viene, tiene que ser del equipo de la misma empresa. */
export async function responsableValido(companyId: string, personaId: string | null | undefined): Promise<boolean> {
  if (!personaId) return true;
  const { data } = await supabaseAdmin().from("os_personas").select("id").eq("id", personaId).eq("company_id", companyId).maybeSingle();
  return !!data;
}
