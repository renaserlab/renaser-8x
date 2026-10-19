import { z } from "zod";
import { protegido, ok, fallo, leerValidado, texto, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { categoriaDe, monto, motivo } from "../../cobros/_comun";

type Ctx = { params: Promise<{ id: string }> };

const Editar = z
  .object({
    nombre: texto(120),
    monto,
    categoria_id: uuid,
    dia: z.number().int().min(1, "el día va del 1 al 31").max(31, "el día va del 1 al 31"),
  })
  .partial();
const Baja = z.object({ baja: z.literal(true), motivo });

/**
 * EDITAR UN PAGO QUE SE REPITE (nombre, monto, categoría, día) O DARLO DE BAJA con su motivo. El próximo vencimiento no
 * se mueve a mano: avanza al pagar. Cambiar el día cuenta desde el próximo ciclo. Uno dado de baja ya no se edita.
 */
export const PATCH = protegido<Ctx>({ entidad: "fin_pagos_recurrentes" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const crudo = (await req.clone().json().catch(() => null)) as { baja?: unknown } | null;
  const sb = supabaseAdmin();
  const { data: pago } = await sb.from("fin_pagos_recurrentes").select("id,activo").eq("id", id).eq("company_id", c.companyId).maybeSingle();
  if (!pago) return fallo("Ese pago no es de tu empresa.", 404);
  if (!pago.activo) return fallo("Ese pago está dado de baja y ya no se edita. Si vuelve, regístralo como nuevo.", 409);

  let cambios: Record<string, unknown>;
  if (crudo?.baja !== undefined) {
    const b = await leerValidado(req, Baja);
    cambios = { activo: false, motivo_baja: b.motivo };
  } else {
    const b = await leerValidado(req, Editar);
    if (b.categoria_id && !(await categoriaDe(c.companyId, b.categoria_id, "egreso"))) return fallo("Elige una categoría de gasto de tu caja.", 400);
    cambios = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
    if (!Object.keys(cambios).length) return fallo("No hay nada que cambiar.");
  }
  const { error } = await sb.from("fin_pagos_recurrentes").update(cambios).eq("id", id).eq("company_id", c.companyId);
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id });
});
