import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { textoFechaCorta } from "@/lib/fin/cobros";
import { avisoDeCaja, dia, monto, nombreYDestino } from "../../../cobros/_comun";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({ monto, fecha: dia });

/**
 * PAGAR ALGO QUE SE REPITE. Una sola operación en la base (fin_pagar_recurrente): el egreso en la caja, el registro del
 * ciclo pagado y el próximo vencimiento, juntos o nada. La base rechaza una fecha futura, un ciclo ya pagado o un mes
 * cerrado, con su motivo. Responde qué pasó en la caja y cuándo vence el siguiente.
 */
export const POST = protegido<Ctx>({ entidad: "fin_pagos_hechos" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const sb = supabaseAdmin();
  const { data: pago } = await sb.from("fin_pagos_recurrentes").select("id,categoria_id").eq("id", id).eq("company_id", c.companyId).maybeSingle();
  if (!pago) return fallo("Ese pago no es de tu empresa.", 404);
  const { data, error } = await sb.rpc("fin_pagar_recurrente", { p_pago: id, p_monto: b.monto, p_fecha: b.fecha, p_por: perfil.id });
  if (error) return fallo(mensajeDeLaBase(error), 409);
  const { data: luego } = await sb.from("fin_pagos_recurrentes").select("proximo_vencimiento").eq("id", id).maybeSingle();
  const caja = avisoDeCaja("egreso", await nombreYDestino(c.companyId, pago.categoria_id as string));
  const siguiente = luego?.proximo_vencimiento ? ` El próximo vence el ${textoFechaCorta(luego.proximo_vencimiento as string)}.` : "";
  return ok({ id: data as string, aviso: caja + siguiente }, 201);
});
