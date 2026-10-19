import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { instanteEn, registroDeLaEmpresa } from "@/lib/os/equipo";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({ fin: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "no es una fecha y hora") });

/**
 * CERRAR UN CRONÓMETRO OLVIDADO (Equipo en vivo, 19-10-2026). La gestión elige a qué hora terminó de verdad (la que
 * dice la persona, o su último movimiento): esa hora, en el reloj de la empresa, tiene que caer entre el inicio del
 * tramo y ahora. Solo se cierra un tramo que sigue corriendo; uno ya cerrado no se reescribe desde aquí.
 */
export const POST = protegido<Ctx>({ entidad: "os_registros_tiempo" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil, { gestion: true });
  const b = await leerValidado(req, Esquema);
  const r = await registroDeLaEmpresa(c.companyId, id);
  if (!r) return fallo("Ese cronómetro no es de tu empresa.", 404);
  if (r.fin) return fallo("Ese cronómetro ya estaba cerrado.", 409);
  const fin = instanteEn(b.fin, c.zona);
  if (!fin) return fallo("Revisa la hora de fin.");
  if (fin.getTime() < new Date(r.inicio).getTime()) return fallo("La hora de fin no puede ser antes de que empezara.");
  if (fin.getTime() > Date.now()) return fallo("La hora de fin no puede estar en el futuro.");
  const { error } = await supabaseAdmin()
    .from("os_registros_tiempo")
    .update({ fin: fin.toISOString(), nota: "Cerrado por la gestión: el cronómetro había quedado corriendo." })
    .eq("id", r.id)
    .is("fin", null);
  if (error) throw new Error(error.message);
  return ok({ id: r.id, fin: fin.toISOString() });
});
