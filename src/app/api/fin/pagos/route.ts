import { z } from "zod";
import { protegido, ok, fallo, leerValidado, texto, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { categoriaDe, dia, moneda, monto } from "../cobros/_comun";

const Esquema = z.object({
  nombre: texto(120),
  monto,
  moneda,
  categoria_id: uuid,
  dia: z.number().int().min(1, "el día va del 1 al 31").max(31, "el día va del 1 al 31"),
  proximo_vencimiento: dia,
});

/**
 * NUEVO PAGO QUE SE REPITE (Finanzas · Pagos): alquiler, servicios, contador… con su día del mes y su primer
 * vencimiento. No mueve la caja: la mueve cada pago que se haga (fin_pagar_recurrente), que además avanza el vencimiento.
 */
export const POST = protegido({ entidad: "fin_pagos_recurrentes" }, async (perfil, req) => {
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  if (!(await categoriaDe(c.companyId, b.categoria_id, "egreso"))) return fallo("Elige una categoría de gasto de tu caja.", 400);
  const { data, error } = await supabaseAdmin()
    .from("fin_pagos_recurrentes")
    .insert({
      company_id: c.companyId,
      nombre: b.nombre,
      monto: b.monto,
      moneda: b.moneda,
      categoria_id: b.categoria_id,
      dia: b.dia,
      proximo_vencimiento: b.proximo_vencimiento,
    })
    .select("id")
    .single();
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id: data.id }, 201);
});
