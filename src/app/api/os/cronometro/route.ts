import { z } from "zod";
import { protegido, ok, fallo, leerValidado, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { cronometroDe, COLUMNAS_REGISTRO } from "@/lib/os/datos";
import { tareaTocable } from "@/lib/os/dia";
import { hoyEn, type RegistroTiempo } from "@/lib/os/calculos";
import { diaEnZona } from "@/lib/revision-semanal";

const Esquema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("iniciar"), tarea_id: uuid }),
  z.object({ accion: z.literal("pausar") }),
  z.object({ accion: z.literal("nota"), nota: z.string().trim().min(1).max(500) }),
  z.object({ accion: z.literal("terminar"), tarea_id: uuid.optional() }),
]);

/**
 * EL CRONÓMETRO DE FOCO (RENASER OS, 19-10-2026). Es de cada persona: la consultora y la gestión no lo mueven por otro.
 * Cada tramo es una fila de os_registros_tiempo.
 *  - iniciar: cierra el tramo que corría (una sola tarea a la vez; la base lo exige) y abre uno en la tarea elegida, que
 *    pasa a «en curso». Reanudar después de una pausa es iniciar la misma tarea.
 *  - pausar: cierra el tramo que corre.
 *  - nota: la «nota de tiempo» va al tramo que corre; si está en pausa, al último tramo de hoy.
 *  - terminar: cierra el tramo y completa la tarea.
 */
export const POST = protegido({ entidad: "os_registros_tiempo" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { persona: true });
  const persona = c.persona!;
  const b = await leerValidado(req, Esquema);
  const sb = supabaseAdmin();
  const ahora = new Date().toISOString();
  const corriendo = await cronometroDe(persona.id);

  if (b.accion === "iniciar") {
    const t = await tareaTocable(c.companyId, b.tarea_id, persona, false);
    if (!t || t.persona_id !== persona.id) return fallo("Solo puedes enfocarte en tus propias tareas.", 404);
    if (t.estado === "completada") return fallo("Esta tarea ya está completada.", 409);
    if (t.estado === "bloqueada") return fallo("Esta tarea está bloqueada. Desbloquéala para trabajar en ella.", 409);
    if (corriendo?.tarea_id === t.id) return ok({ id: corriendo.id });
    if (corriendo) await sb.from("os_registros_tiempo").update({ fin: ahora }).eq("id", corriendo.id);
    const { data, error } = await sb
      .from("os_registros_tiempo")
      .insert({ company_id: c.companyId, tarea_id: t.id, persona_id: persona.id, inicio: ahora })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return fallo("Ya tienes un cronómetro corriendo. Recarga la página.", 409);
      throw new Error(error.message);
    }
    if (t.estado !== "en_curso") await sb.from("os_tareas").update({ estado: "en_curso", updated_at: ahora }).eq("id", t.id);
    return ok({ id: data.id }, 201);
  }

  if (b.accion === "pausar") {
    if (!corriendo) return fallo("No tienes un cronómetro corriendo.", 409);
    await sb.from("os_registros_tiempo").update({ fin: ahora }).eq("id", corriendo.id);
    return ok({ id: corriendo.id });
  }

  if (b.accion === "nota") {
    let tramo: RegistroTiempo | null = corriendo;
    if (!tramo) {
      const { data } = await sb.from("os_registros_tiempo").select(COLUMNAS_REGISTRO).eq("persona_id", persona.id).order("inicio", { ascending: false }).limit(1).maybeSingle();
      const ultimo = data as RegistroTiempo | null;
      tramo = ultimo && diaEnZona(ultimo.inicio, c.zona) === hoyEn(c.zona) ? ultimo : null;
    }
    if (!tramo) return fallo("Hoy todavía no registraste tiempo. Inicia el foco en una tarea y luego anota.", 409);
    const nota = tramo.nota ? `${tramo.nota} · ${b.nota}` : b.nota;
    await sb.from("os_registros_tiempo").update({ nota: nota.slice(0, 2000) }).eq("id", tramo.id);
    return ok({ id: tramo.id });
  }

  // terminar
  const tareaId = b.tarea_id ?? corriendo?.tarea_id;
  if (!tareaId) return fallo("¿Qué tarea terminaste? Elige una.", 400);
  const t = await tareaTocable(c.companyId, tareaId, persona, false);
  if (!t || t.persona_id !== persona.id) return fallo("Solo puedes terminar tus propias tareas.", 404);
  if (t.estado === "bloqueada") return fallo("Esta tarea está bloqueada. Desbloquéala primero.", 409);
  await sb.from("os_registros_tiempo").update({ fin: ahora }).eq("tarea_id", t.id).is("fin", null);
  if (t.estado !== "completada") await sb.from("os_tareas").update({ estado: "completada", completada_at: ahora, updated_at: ahora }).eq("id", t.id);
  return ok({ id: t.id });
});
