import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { EsquemaPuntajes } from "@/lib/os/evaluaciones";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({
  puntajes: EsquemaPuntajes,
  comentario: z.string().trim().max(2000).optional(),
});

/**
 * RESPONDER UNA EVALUACIÓN 360 que le toca a quien entra (es su evaluador). Una sola vez: lo respondido no se cambia,
 * para que el ciclo compare respuestas dadas con el mismo criterio. El ciclo y a quién se pide lo arma RR.HH. en Talento.
 */
export const POST = protegido<Ctx>({ entidad: "os_evaluaciones" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil, { persona: true });
  const b = await leerValidado(req, Esquema);
  const sb = supabaseAdmin();
  const { data: ev } = await sb.from("os_evaluaciones").select("id,evaluador_id,respondida_at").eq("id", id).eq("company_id", c.companyId).maybeSingle();
  if (!ev || ev.evaluador_id !== c.persona!.id) return fallo("Esa evaluación no te toca a ti.", 404);
  if (ev.respondida_at) return fallo("Ya respondiste esta evaluación.", 409);
  const { error } = await sb
    .from("os_evaluaciones")
    .update({ puntajes: b.puntajes, comentario: b.comentario || null, respondida_at: new Date().toISOString() })
    .eq("id", ev.id)
    .is("respondida_at", null);
  if (error) throw new Error(error.message);
  return ok({ id: ev.id });
});
