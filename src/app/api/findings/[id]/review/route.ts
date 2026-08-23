import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/**
 * body: { accion: 'aprobado'|'corregido'|'rechazado', motivo?, comentario?, texto_corregido?, cambios?, levantar_validacion? }
 * Tres acciones y siempre un motivo. Cada una escribe en corrections.
 * 1.11: un hallazgo con `requiere_validacion` no se aprueba sin declarar (en el comentario) la evidencia adicional que lo sostiene.
 */
export const POST = protegido<Ctx>({ consultor: true }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ accion?: "aprobado" | "corregido" | "rechazado"; motivo?: string; comentario?: string; texto_corregido?: string; cambios?: Record<string, unknown>; levantar_validacion?: boolean }>(req);
  if (!b.accion) return fallo("Falta la acción");
  if (b.accion !== "aprobado" && !b.motivo) return fallo("Corregir o rechazar exige un motivo: es lo que enseña al sistema.");
  const sb = supabaseAdmin();
  const { data: f } = await sb.from("findings").select("id,requiere_validacion").eq("id", id).single();
  if (!f) return fallo("Hallazgo no encontrado", 404);
  const cambios: Record<string, unknown> = { estado_revision: b.accion };
  if (b.accion === "corregido" && b.cambios) {
    for (const k of ["titulo", "causa_raiz", "recomendacion", "impacto", "veredicto"]) if (b.cambios[k] !== undefined) cambios[k] = b.cambios[k];
  }
  if (f.requiere_validacion && b.accion !== "rechazado") {
    const bajaImpacto = b.accion === "corregido" && b.cambios?.impacto && b.cambios.impacto !== "alto";
    if (!b.levantar_validacion && !bajaImpacto) return fallo("Este hallazgo necesita validación: una sola opinión no sostiene un hallazgo crítico. Escribe en el comentario qué otra fuente lo sostiene y marca 'Validar y aprobar', baja el impacto, o recházalo.");
    if (b.levantar_validacion && !b.comentario?.trim()) return fallo("Para validar, escribe qué evidencia adicional lo sostiene.");
    cambios.requiere_validacion = false;
    cambios.motivo_validacion = null;
  }
  const { error } = await sb.from("findings").update(cambios).eq("id", id);
  if (error) return fallo(error.message, 500);
  await sb.from("corrections").insert({ finding_id: id, user_id: perfil.id, accion: b.accion, motivo: b.motivo ?? null, comentario: b.levantar_validacion ? `[validación levantada] ${b.comentario ?? ""}` : b.comentario ?? null, texto_corregido: b.texto_corregido ?? (b.cambios ? JSON.stringify(b.cambios) : null) });
  return ok({ id, estado_revision: b.accion });
});
