import { z } from "zod";
import { protegido, ok, fallo, leerValidado, texto } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { tareaTocable } from "@/lib/os/dia";
import { hoyEn } from "@/lib/os/calculos";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({
  tipo: z.enum(["prorroga", "aplazamiento"]),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "no es un día (AAAA-MM-DD)"),
  motivo: texto(500),
});

/**
 * REPROGRAMAR, SIEMPRE CON MOTIVO (como RenaserOs). Prórroga: se mueve la fecha límite. Aplazamiento: se mueve el día
 * en que se trabaja. Cada cambio queda en os_reprogramaciones con la fecha de antes, la nueva, el motivo y quién lo
 * hizo: tres prórrogas seguidas las ve el diagnóstico de las 6:00. No se reprograma hacia atrás ni una tarea completada.
 */
export const POST = protegido<Ctx>({ entidad: "os_reprogramaciones" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil);
  const t = await tareaTocable(c.companyId, id, c.persona, c.gestion);
  if (!t) return fallo("No encontramos esa tarea entre las tuyas.", 404);
  if (t.estado === "completada") return fallo("Esta tarea ya está completada.", 409);
  const b = await leerValidado(req, Esquema);
  if (b.fecha < hoyEn(c.zona)) return fallo("La nueva fecha no puede ser un día que ya pasó.");
  const campo = b.tipo === "prorroga" ? "fecha_limite" : "fecha_inicio";
  const antes = t[campo];
  if (antes === b.fecha) return fallo("Esa ya es la fecha de la tarea.");
  if (b.tipo === "aplazamiento" && t.fecha_limite && b.fecha > t.fecha_limite) {
    return fallo("No puedes aplazar el trabajo más allá de la fecha límite. Si hace falta, pide primero una prórroga.");
  }
  if (b.tipo === "prorroga" && t.fecha_inicio && b.fecha < t.fecha_inicio) return fallo("La fecha límite no puede ser antes del día en que se trabaja.");
  const sb = supabaseAdmin();
  const { error: e1 } = await sb
    .from("os_reprogramaciones")
    .insert({ company_id: c.companyId, tarea_id: t.id, tipo: b.tipo, antes, despues: b.fecha, motivo: b.motivo, por: perfil.id });
  if (e1) throw new Error(e1.message);
  const { error: e2 } = await sb.from("os_tareas").update({ [campo]: b.fecha, updated_at: new Date().toISOString() }).eq("id", t.id).eq("company_id", c.companyId);
  if (e2) throw new Error(e2.message);
  return ok({ id: t.id });
});
