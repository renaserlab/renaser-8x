import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({ motivo: z.string().trim().min(10, "al menos diez caracteres").max(300) });

/** ANULAR EL SALDO INICIAL, con un motivo escrito: lo anulado no se borra ni se reanula, se anota otro. */
export const PATCH = protegido<Ctx>({ entidad: "fin_saldos_iniciales" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const { data, error } = await supabaseAdmin()
    .from("fin_saldos_iniciales")
    .update({ anulado_at: new Date().toISOString(), motivo_anulacion: b.motivo })
    .eq("id", id)
    .eq("company_id", c.companyId)
    .is("anulado_at", null)
    .select("id");
  if (error) return fallo(mensajeDeLaBase(error), 409);
  if (!data?.length) return fallo("Ese saldo inicial no existe o ya está anulado.", 404);
  return ok({ id });
});
