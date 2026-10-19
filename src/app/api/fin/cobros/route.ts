import { z } from "zod";
import { protegido, ok, fallo, leerValidado, texto, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { categoriaDe, dia, moneda, monto } from "./_comun";

const Esquema = z
  .object({
    cliente: texto(160),
    concepto: z.string().trim().max(300).nullable().optional(),
    total: monto,
    moneda,
    emitido: dia,
    vence: dia,
    categoria_id: uuid,
  })
  .refine((b) => b.vence >= b.emitido, { message: "El cobro no puede vencer antes de emitirse: revisa las dos fechas.", path: ["vence"] });

/**
 * NUEVO COBRO (Finanzas · Cobros): lo que un cliente te debe, con cuándo vence y con qué categoría de ingreso entrarán
 * sus pagos a la caja. El cobro no mueve la caja: la mueve cada pago que se registre (fin_registrar_pago_cobro).
 */
export const POST = protegido({ entidad: "fin_cobros" }, async (perfil, req) => {
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  if (!(await categoriaDe(c.companyId, b.categoria_id, "ingreso"))) return fallo("Elige una categoría de ingreso de tu caja.", 400);
  const { data, error } = await supabaseAdmin()
    .from("fin_cobros")
    .insert({
      company_id: c.companyId,
      cliente: b.cliente,
      concepto: b.concepto || null,
      total: b.total,
      moneda: b.moneda,
      emitido: b.emitido,
      vence: b.vence,
      categoria_id: b.categoria_id,
      creado_por: perfil.id,
    })
    .select("id")
    .single();
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id: data.id }, 201);
});
