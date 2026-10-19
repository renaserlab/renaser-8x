import { z } from "zod";
import { protegido, ok, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS, exigirPersonaDeLaEmpresa } from "@/lib/os/acceso";

type Ctx = { params: Promise<{ id: string }> };

const corto = z.string().trim().max(200).nullable().optional();
const Esquema = z.object({
  ingreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "no es un día").nullable().optional(),
  contrato: corto,
  telefono: corto,
  documento: corto,
  notas: z.string().trim().max(4000).nullable().optional(),
});

/** EL LEGAJO DE UNA PERSONA (Equipo y talento): una sola ficha por persona, que se crea al guardarla por primera vez. */
export const PUT = protegido<Ctx>({ entidad: "os_legajos" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirOS(perfil, { talento: true });
  const p = await exigirPersonaDeLaEmpresa(c, id);
  const b = await leerValidado(req, Esquema);
  const { error } = await supabaseAdmin()
    .from("os_legajos")
    .upsert({
      persona_id: p.id,
      company_id: c.companyId,
      ingreso: b.ingreso || null,
      contrato: b.contrato || null,
      telefono: b.telefono || null,
      documento: b.documento || null,
      notas: b.notas || null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
  return ok({ persona_id: p.id });
});
