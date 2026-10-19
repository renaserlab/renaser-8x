import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { esLunes } from "@/lib/revision-semanal";

const Esquema = z.object({
  semana: z.string().refine((s) => esLunes(s), "la semana se nombra por su lunes"),
  texto: z.string().trim().min(1).max(300).optional(),
  meta: z.number().int().positive().nullable().optional(),
  logrado: z.number().int().min(0).optional(),
});

/**
 * EL OBJETIVO DE LA SEMANA (Proyectos y objetivo). Uno por empresa y por semana: fijarlo, cambiarlo o subir lo logrado.
 * La primera vez hace falta el texto; después cada campo se puede tocar solo.
 */
export const PUT = protegido({ entidad: "os_objetivos" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { gestion: true });
  const b = await leerValidado(req, Esquema);
  const sb = supabaseAdmin();
  const { data: ya } = await sb.from("os_objetivos").select("id").eq("company_id", c.companyId).eq("semana", b.semana).maybeSingle();
  const ahora = new Date().toISOString();
  if (!ya) {
    if (!b.texto) return fallo("Escribe el objetivo de la semana.");
    const { error } = await sb.from("os_objetivos").insert({
      company_id: c.companyId,
      semana: b.semana,
      texto: b.texto,
      meta: b.meta ?? null,
      logrado: b.logrado ?? 0,
      fijado_por: perfil.id,
    });
    if (error) throw new Error(error.message);
    return ok({ semana: b.semana }, 201);
  }
  const cambios: Record<string, unknown> = { updated_at: ahora };
  if (b.texto !== undefined) cambios.texto = b.texto;
  if (b.meta !== undefined) cambios.meta = b.meta;
  if (b.logrado !== undefined) cambios.logrado = b.logrado;
  const { error } = await sb.from("os_objetivos").update(cambios).eq("id", ya.id);
  if (error) throw new Error(error.message);
  return ok({ semana: b.semana });
});
