import { z } from "zod";
import { protegido, ok, leerValidado, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS, exigirPersonaDeLaEmpresa } from "@/lib/os/acceso";

const Esquema = z.object({ persona_id: uuid, texto: z.string().trim().max(300).optional() });

/**
 * «AVISARLE» (Equipo en vivo): la gestión le deja un aviso a una persona, que lo ve con contador en su menú. Va con la
 * regla «inactividad» porque nace de ver a alguien quieto o con el cronómetro olvidado; la clave lleva la hora para
 * que dos avisos seguidos no se pisen.
 */
export const POST = protegido({ entidad: "os_avisos" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { gestion: true });
  const b = await leerValidado(req, Esquema);
  const p = await exigirPersonaDeLaEmpresa(c, b.persona_id);
  const quien = c.persona?.nombre ?? "Tu consultora";
  const { error } = await supabaseAdmin().from("os_avisos").insert({
    company_id: c.companyId,
    persona_id: p.id,
    regla: "inactividad",
    titulo: `${quien} te busca`,
    detalle: b.texto || "Revisa tu cronómetro y tu trabajo de hoy: no se ve movimiento hace un rato.",
    enlace: "/os/mi-trabajo",
    clave: `manual:${p.id}:${Date.now()}`,
  });
  if (error) throw new Error(error.message);
  return ok({ avisado: p.nombre }, 201);
});
