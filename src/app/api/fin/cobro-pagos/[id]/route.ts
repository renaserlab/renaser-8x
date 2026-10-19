import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";

type Ctx = { params: Promise<{ id: string }> };

/**
 * ANULAR UN PAGO DE UN COBRO: se lleva su ingreso de la caja y lo que te deben vuelve a subir (fin_anular_pago_cobro).
 * Si el mes del pago está cerrado, la base lo impide y lo dice.
 */
export const DELETE = protegido<Ctx>({ entidad: "fin_cobro_pagos" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const sb = supabaseAdmin();
  const { data: pago } = await sb.from("fin_cobro_pagos").select("id").eq("id", id).eq("company_id", c.companyId).maybeSingle();
  if (!pago) return fallo("Ese pago no es de tu empresa.", 404);
  const { error } = await sb.rpc("fin_anular_pago_cobro", { p_pago: id });
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id });
});
