import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { CamposMovimiento, categoriaDeLaEmpresa } from "../_comun";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z.object(CamposMovimiento).partial();

async function movimientoDeLaEmpresa(companyId: string, id: string) {
  const { data } = await supabaseAdmin().from("fin_movimientos").select("id,tipo,categoria_id,origen").eq("company_id", companyId).eq("id", id).maybeSingle();
  return data as { id: string; tipo: "ingreso" | "egreso"; categoria_id: string; origen: "manual" | "cobro" | "pago" } | null;
}

/**
 * CORREGIR UN MOVIMIENTO. Uno manual se corrige entero; uno que entró o salió solo (por un cobro o un pago que se
 * repite) solo admite su detalle: su fecha, su importe y su moneda los manda ese pago (y la base lo impide igual).
 */
export const PATCH = protegido<Ctx>({ entidad: "fin_movimientos" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const mov = await movimientoDeLaEmpresa(c.companyId, id);
  if (!mov) return fallo("Ese movimiento no es de tu empresa.", 404);
  const cambios: Record<string, unknown> = {};
  if (mov.origen !== "manual") {
    const otros = Object.keys(b).filter((k) => k !== "detalle");
    if (otros.length) return fallo("Este movimiento entró solo desde un pago: aquí solo se corrige su detalle. Lo demás se corrige en el pago.", 409);
  } else {
    const tipo = b.tipo ?? mov.tipo;
    const categoriaId = b.categoria_id ?? mov.categoria_id;
    if (b.tipo !== undefined || b.categoria_id !== undefined) {
      const cat = await categoriaDeLaEmpresa(c.companyId, categoriaId);
      if (!cat) return fallo("Esa categoría no es de tu empresa.", 404);
      if (cat.tipo !== tipo) return fallo("La categoría no corresponde: elige una de lo que " + (tipo === "ingreso" ? "entra." : "sale."));
      if (b.categoria_id !== undefined && b.categoria_id !== mov.categoria_id && cat.archivada) return fallo("Esa categoría está archivada.");
    }
    for (const k of ["fecha", "tipo", "categoria_id", "monto", "moneda"] as const) if (b[k] !== undefined) cambios[k] = b[k];
  }
  if (b.detalle !== undefined) cambios.detalle = b.detalle?.trim() || null;
  if (!Object.keys(cambios).length) return fallo("No hay nada que cambiar.");
  cambios.updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin().from("fin_movimientos").update(cambios).eq("id", id).eq("company_id", c.companyId);
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id });
});

/** BORRAR UN MOVIMIENTO MANUAL. Uno automático se retira anulando su pago en Cobros o en Pagos. */
export const DELETE = protegido<Ctx>({ entidad: "fin_movimientos" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const mov = await movimientoDeLaEmpresa(c.companyId, id);
  if (!mov) return fallo("Ese movimiento no es de tu empresa.", 404);
  if (mov.origen !== "manual") {
    return fallo(mov.origen === "cobro" ? "Este ingreso entró solo desde un cobro: se retira anulando ese pago en Cobros." : "Este gasto salió solo por un pago que se repite: se retira anulando ese pago en Pagos.", 409);
  }
  const { error } = await supabaseAdmin().from("fin_movimientos").delete().eq("id", id).eq("company_id", c.companyId);
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id });
});
