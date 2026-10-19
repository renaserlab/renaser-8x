import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * ANULAR EL ÚLTIMO PAGO HECHO de algo que se repite: se lleva su egreso de la caja y devuelve el vencimiento a ese
 * ciclo (fin_anular_pago_hecho). Solo el último: con uno posterior, la base lo rechaza y lo dice.
 */
export const DELETE = protegido<Ctx>({ entidad: "fin_pagos_hechos" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const sb = supabaseAdmin();
  const { data: hecho } = await sb.from("fin_pagos_hechos").select("id").eq("id", id).eq("company_id", c.companyId).maybeSingle();
  if (!hecho) return fallo("Ese pago no es de tu empresa.", 404);
  const { error } = await sb.rpc("fin_anular_pago_hecho", { p_hecho: id });
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id });
});
