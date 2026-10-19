import { z } from "zod";
import { protegido, ok, fallo, leerValidado, texto, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { tareaTocable } from "@/lib/os/dia";
import { diaEnZona } from "@/lib/revision-semanal";
import { hoyEn } from "@/lib/os/calculos";

type Ctx = { params: Promise<{ id: string }> };

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "no es un día (AAAA-MM-DD)");

const EsquemaCambio = z
  .object({
    titulo: texto(300),
    descripcion: z.string().trim().max(2000).nullable(),
    prioridad: z.enum(["alta", "media", "baja"]),
    proyecto_id: uuid.nullable(),
    fecha_inicio: dia.nullable(),
    fecha_limite: dia.nullable(),
    // «bloqueada» no se pone aquí: se entra y se sale por /bloqueo, que deja la causa.
    estado: z.enum(["pendiente", "en_curso", "en_revision", "completada"]),
  })
  .partial();

/**
 * CAMBIAR UNA TAREA (cambios parciales). La puede cambiar su dueña o la gestión.
 *  - UNA FECHA YA PUESTA NO SE MUEVE AQUÍ si la tarea es de un día anterior: eso es una prórroga o un aplazamiento, y
 *    va por /reprogramar, que guarda el motivo. El mismo día en que se creó sí se corrige (fue un error al escribirla).
 *  - Completar pone la hora de completada y, si su cronómetro corría, lo detiene. Reabrirla la borra.
 *  - Una tarea bloqueada primero se desbloquea: así el bloqueo queda cerrado con su hora.
 */
export const PATCH = protegido<Ctx>({ entidad: "os_tareas" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil);
  const t = await tareaTocable(c.companyId, id, c.persona, c.gestion);
  if (!t) return fallo("No encontramos esa tarea entre las tuyas.", 404);
  const b = await leerValidado(req, EsquemaCambio);
  const sb = supabaseAdmin();
  const hoy = hoyEn(c.zona);
  const deHoy = diaEnZona(t.created_at, c.zona) === hoy;

  for (const campo of ["fecha_inicio", "fecha_limite"] as const) {
    if (b[campo] === undefined || b[campo] === t[campo] || t[campo] == null || deHoy) continue;
    return fallo("Esa fecha ya estaba puesta. Para moverla usa «Reprogramar»: así queda el motivo.", 409);
  }
  const inicio = b.fecha_inicio !== undefined ? b.fecha_inicio : t.fecha_inicio;
  const limite = b.fecha_limite !== undefined ? b.fecha_limite : t.fecha_limite;
  if (inicio && limite && limite < inicio) return fallo("La fecha límite no puede ser antes del día en que se trabaja.");
  if (b.proyecto_id) {
    const { data: pr } = await sb.from("os_proyectos").select("id").eq("id", b.proyecto_id).eq("company_id", c.companyId).maybeSingle();
    if (!pr) return fallo("Ese proyecto no es de tu empresa.", 404);
  }
  if (b.estado && t.estado === "bloqueada") return fallo("La tarea está bloqueada. Primero desbloquéala.", 409);

  const cambios: Record<string, unknown> = { ...b, updated_at: new Date().toISOString() };
  if (b.descripcion !== undefined) cambios.descripcion = b.descripcion || null;
  if (b.estado === "completada" && t.estado !== "completada") {
    cambios.completada_at = new Date().toISOString();
    await sb.from("os_registros_tiempo").update({ fin: new Date().toISOString() }).eq("tarea_id", t.id).is("fin", null);
  } else if (b.estado && b.estado !== "completada" && t.estado === "completada") {
    cambios.completada_at = null;
  }
  const { error } = await sb.from("os_tareas").update(cambios).eq("id", t.id).eq("company_id", c.companyId);
  if (error) throw new Error(error.message);
  return ok({ id: t.id });
});

/** BORRAR UNA TAREA mal creada: solo si todavía no tiene tiempo registrado (lo trabajado no se borra). */
export const DELETE = protegido<Ctx>({ entidad: "os_tareas" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil);
  const t = await tareaTocable(c.companyId, id, c.persona, c.gestion);
  if (!t) return fallo("No encontramos esa tarea entre las tuyas.", 404);
  const sb = supabaseAdmin();
  const { count } = await sb.from("os_registros_tiempo").select("id", { count: "exact", head: true }).eq("tarea_id", t.id);
  if (count) return fallo("Esta tarea ya tiene tiempo registrado y no se borra. Puedes completarla o reprogramarla.", 409);
  const { error } = await sb.from("os_tareas").delete().eq("id", t.id).eq("company_id", c.companyId);
  if (error) throw new Error(error.message);
  return ok({ id: t.id });
});
