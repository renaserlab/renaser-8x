import { z } from "zod";
import { protegido, ok, fallo, leerValidado, texto } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { tareaTocable } from "@/lib/os/dia";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({
  causa: texto(500),
  depende_de: z.string().trim().max(200).nullable().optional(),
});

/**
 * MARCAR UN BLOQUEO: la tarea pasa a «bloqueada» y se abre un bloqueo con su causa y de quién depende. Si su cronómetro
 * corría, se detiene: el tiempo bloqueado no es tiempo de foco. A los 30 minutos, la regla de bloqueos avisa a la gestión.
 */
export const POST = protegido<Ctx>({ entidad: "os_bloqueos" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil);
  const t = await tareaTocable(c.companyId, id, c.persona, c.gestion);
  if (!t) return fallo("No encontramos esa tarea entre las tuyas.", 404);
  if (t.estado === "completada") return fallo("Esta tarea ya está completada.", 409);
  if (t.estado === "bloqueada") return fallo("Esta tarea ya está bloqueada.", 409);
  const b = await leerValidado(req, Esquema);
  const sb = supabaseAdmin();
  const ahora = new Date().toISOString();
  const { error } = await sb
    .from("os_bloqueos")
    .insert({ company_id: c.companyId, tarea_id: t.id, persona_id: t.persona_id, causa: b.causa, depende_de: b.depende_de || null });
  if (error) {
    if (error.code === "23505") return fallo("Esta tarea ya tiene un bloqueo abierto.", 409);
    throw new Error(error.message);
  }
  await sb.from("os_registros_tiempo").update({ fin: ahora }).eq("tarea_id", t.id).is("fin", null);
  await sb.from("os_tareas").update({ estado: "bloqueada", updated_at: ahora }).eq("id", t.id).eq("company_id", c.companyId);
  return ok({ id: t.id });
});

/** DESBLOQUEAR: se cierra el bloqueo con la hora de ahora y la tarea vuelve a «en curso» si ya tenía tiempo, o a «pendiente». */
export const DELETE = protegido<Ctx>({ entidad: "os_bloqueos" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil);
  const t = await tareaTocable(c.companyId, id, c.persona, c.gestion);
  if (!t) return fallo("No encontramos esa tarea entre las tuyas.", 404);
  const sb = supabaseAdmin();
  const ahora = new Date().toISOString();
  const { data: cerrados } = await sb.from("os_bloqueos").update({ hasta: ahora }).eq("tarea_id", t.id).eq("company_id", c.companyId).is("hasta", null).select("id");
  if (!cerrados?.length && t.estado !== "bloqueada") return fallo("Esta tarea no está bloqueada.", 409);
  const { count } = await sb.from("os_registros_tiempo").select("id", { count: "exact", head: true }).eq("tarea_id", t.id);
  await sb.from("os_tareas").update({ estado: count ? "en_curso" : "pendiente", updated_at: ahora }).eq("id", t.id).eq("company_id", c.companyId);
  return ok({ id: t.id });
});
