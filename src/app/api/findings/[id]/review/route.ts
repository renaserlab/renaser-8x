import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/** body: { accion: 'aprobado'|'corregido'|'rechazado', motivo?, comentario?, texto_corregido?, cambios?: {titulo,causa_raiz,recomendacion,impacto} }
 *  Tres acciones y siempre un motivo. Cada una escribe en corrections. */
export const POST = protegido<Ctx>({ consultor: true }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ accion?: "aprobado" | "corregido" | "rechazado"; motivo?: string; comentario?: string; texto_corregido?: string; cambios?: Record<string, unknown> }>(req);
  if (!b.accion) return fallo("Falta la acción");
  if (b.accion !== "aprobado" && !b.motivo) return fallo("Corregir o rechazar exige un motivo: es lo que enseña al sistema.");
  const sb = supabaseAdmin();
  const cambios: Record<string, unknown> = { estado_revision: b.accion };
  if (b.accion === "corregido" && b.cambios) {
    for (const k of ["titulo", "causa_raiz", "recomendacion", "impacto", "veredicto"]) if (b.cambios[k] !== undefined) cambios[k] = b.cambios[k];
  }
  const { error } = await sb.from("findings").update(cambios).eq("id", id);
  if (error) return fallo(error.message, 500);
  await sb.from("corrections").insert({ finding_id: id, user_id: perfil.id, accion: b.accion, motivo: b.motivo ?? null, comentario: b.comentario ?? null, texto_corregido: b.texto_corregido ?? (b.cambios ? JSON.stringify(b.cambios) : null) });
  return ok({ id, estado_revision: b.accion });
});
