import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { motivo } from "../_comun";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object({ anular: z.literal(true), motivo });

/**
 * ANULAR UN COBRO, con su motivo escrito. Solo uno sin pagos: si ya entró dinero de él, ese dinero está en la caja, y
 * anular el cobro dejaría pagos huérfanos. Primero se anulan sus pagos (cada uno se lleva su ingreso de la caja).
 */
export const PATCH = protegido<Ctx>({ entidad: "fin_cobros" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const sb = supabaseAdmin();
  const { data: cobro } = await sb.from("fin_cobros").select("id,anulado_at").eq("id", id).eq("company_id", c.companyId).maybeSingle();
  if (!cobro) return fallo("Ese cobro no es de tu empresa.", 404);
  if (cobro.anulado_at) return fallo("Ese cobro ya está anulado.", 409);
  const { count } = await sb.from("fin_cobro_pagos").select("id", { count: "exact", head: true }).eq("cobro_id", id).eq("company_id", c.companyId);
  if ((count ?? 0) > 0) return fallo("Este cobro ya tiene pagos. Anula primero sus pagos (cada uno se lleva su ingreso de la caja) y después el cobro.", 409);
  const { error } = await sb.from("fin_cobros").update({ anulado_at: new Date().toISOString(), motivo_anulacion: b.motivo }).eq("id", id).eq("company_id", c.companyId);
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id });
});
