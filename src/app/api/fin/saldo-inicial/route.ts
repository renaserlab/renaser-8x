import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase, textoMonto } from "@/lib/fin/calculos";
import { hoyEn } from "@/lib/os/calculos";
import { dia, moneda } from "../movimientos/_comun";

const Esquema = z.object({
  moneda,
  monto: z.number().min(0, "no puede ser negativo").max(9_999_999_999.99).refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, "como mucho dos decimales"),
  fecha: dia,
});

/**
 * EL SALDO INICIAL DE LA CAJA (Finanzas · Caja): cuánto había el día que se empezó a usar Finanzas, en una moneda. Sin
 * él, «dinero en caja hoy» no se puede saber. Se anota lo que había, no lo que habrá: nunca con fecha futura. Uno vigente
 * por moneda; para cambiarlo se anula con un motivo y se anota otro.
 */
export const POST = protegido({ entidad: "fin_saldos_iniciales" }, async (perfil, req) => {
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  if (b.fecha > hoyEn(c.zona)) return fallo("El saldo inicial no puede tener fecha futura: se anota lo que había, no lo que habrá.");
  const { data: vigente } = await supabaseAdmin().from("fin_saldos_iniciales").select("id,monto").eq("company_id", c.companyId).eq("moneda", b.moneda).is("anulado_at", null).maybeSingle();
  if (vigente) return fallo(`Ya hay un saldo inicial en ${b.moneda === "USD" ? "dólares" : "soles"} (${textoMonto(vigente.monto, b.moneda)}). Para cambiarlo, anúlalo primero con un motivo.`, 409);
  const { data, error } = await supabaseAdmin()
    .from("fin_saldos_iniciales")
    .insert({ company_id: c.companyId, moneda: b.moneda, monto: b.monto, fecha: b.fecha, registrado_por: perfil.id })
    .select("id")
    .single();
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id: data.id }, 201);
});
