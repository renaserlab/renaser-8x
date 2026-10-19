import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Categoria } from "@/lib/fin/calculos";

/** Lo que se pide al registrar o corregir un movimiento a mano (la empresa nunca viene del navegador). */
export const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD").refine((s) => !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime()), "no es una fecha");
export const monto = z
  .number()
  .positive("tiene que ser mayor que cero")
  .max(9_999_999_999.99)
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "como mucho dos decimales (céntimos)");
export const moneda = z.enum(["PEN", "USD"]);

export const CamposMovimiento = {
  fecha: dia,
  tipo: z.enum(["ingreso", "egreso"]),
  categoria_id: z.string().uuid(),
  monto,
  moneda,
  detalle: z.string().trim().max(300).optional().nullable(),
};

/** La categoría, si es de esta empresa (si no, null: la ruta responde 404 sin decir de quién es). */
export async function categoriaDeLaEmpresa(companyId: string, id: string): Promise<Categoria | null> {
  const { data } = await supabaseAdmin().from("fin_categorias").select("id,nombre,tipo,destino,archivada,orden").eq("company_id", companyId).eq("id", id).maybeSingle();
  return (data as Categoria | null) ?? null;
}
