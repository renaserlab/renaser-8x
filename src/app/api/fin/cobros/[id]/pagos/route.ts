import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { avisoDeCaja, dia, monto, nombreYDestino } from "../../_comun";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({ monto, fecha: dia, medio: z.string().trim().max(40).nullable().optional() });

/**
 * REGISTRAR UN PAGO DE UN COBRO. Es una sola operación en la base (fin_registrar_pago_cobro): el pago y su ingreso en la
 * caja entran juntos o no entra ninguno, y la base rechaza cobrar de más, una fecha futura, una anterior a la emisión o
 * un mes cerrado, con su motivo escrito. Responde con lo que pasó en la caja, para decírselo al dueño.
 */
export const POST = protegido<Ctx>({ entidad: "fin_cobro_pagos" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const sb = supabaseAdmin();
  const { data: cobro } = await sb.from("fin_cobros").select("id,categoria_id").eq("id", id).eq("company_id", c.companyId).maybeSingle();
  if (!cobro) return fallo("Ese cobro no es de tu empresa.", 404);
  const { data, error } = await sb.rpc("fin_registrar_pago_cobro", { p_cobro: id, p_monto: b.monto, p_fecha: b.fecha, p_medio: b.medio || null, p_por: perfil.id });
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id: data as string, aviso: avisoDeCaja("ingreso", await nombreYDestino(c.companyId, cobro.categoria_id as string)) }, 201);
});
