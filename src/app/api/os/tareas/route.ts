import { z } from "zod";
import { protegido, ok, fallo, leerValidado, texto, uuid, AccesoDenegado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS, exigirPersonaDeLaEmpresa } from "@/lib/os/acceso";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "no es un día (AAAA-MM-DD)");

const EsquemaTareaNueva = z.object({
  titulo: texto(300),
  prioridad: z.enum(["alta", "media", "baja"]).optional(),
  fecha_inicio: dia.nullable().optional(),
  fecha_limite: dia.nullable().optional(),
  proyecto_id: uuid.nullable().optional(),
  descripcion: z.string().trim().max(2000).nullable().optional(),
  persona_id: uuid.optional(),
});

/**
 * CREAR UNA TAREA (RENASER OS, 19-10-2026). Sin `persona_id`, la tarea es de quien la crea. Con `persona_id` de otra
 * persona, solo la gestión de la empresa puede asignarla (así la usa «Equipo en vivo» para poner trabajo a quien no
 * tiene). El proyecto, si viene, tiene que ser de la misma empresa. Contrato compartido: { id } de vuelta.
 */
export const POST = protegido({ entidad: "os_tareas" }, async (perfil, req) => {
  const c = await exigirOS(perfil);
  const b = await leerValidado(req, EsquemaTareaNueva);
  const sb = supabaseAdmin();
  let personaId = c.persona?.id ?? null;
  if (b.persona_id && b.persona_id !== personaId) personaId = (await exigirPersonaDeLaEmpresa(c, b.persona_id)).id;
  if (!personaId) throw new AccesoDenegado("Elige a quién le toca la tarea.", "rol", c.companyId);
  if (b.fecha_inicio && b.fecha_limite && b.fecha_limite < b.fecha_inicio) return fallo("La fecha límite no puede ser antes del día en que se trabaja.");
  if (b.proyecto_id) {
    const { data: pr } = await sb.from("os_proyectos").select("id").eq("id", b.proyecto_id).eq("company_id", c.companyId).maybeSingle();
    if (!pr) return fallo("Ese proyecto no es de tu empresa.", 404);
  }
  const { data, error } = await sb
    .from("os_tareas")
    .insert({
      company_id: c.companyId,
      persona_id: personaId,
      titulo: b.titulo,
      prioridad: b.prioridad ?? "media",
      fecha_inicio: b.fecha_inicio ?? null,
      fecha_limite: b.fecha_limite ?? null,
      proyecto_id: b.proyecto_id ?? null,
      descripcion: b.descripcion || null,
      creada_por: perfil.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return ok({ id: data.id }, 201);
});
