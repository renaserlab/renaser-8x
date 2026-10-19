import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { CamposMovimiento, categoriaDeLaEmpresa } from "./_comun";

const Esquema = z.object(CamposMovimiento);

/**
 * REGISTRAR UN MOVIMIENTO EN LA CAJA (Finanzas · Caja). Siempre manual: lo que entra o sale por un cobro o un pago que se
 * repite lo pone la base al registrar ese pago. Si el mes está cerrado, la base se niega y su mensaje llega tal cual.
 * Al guardarse, un disparador recalcula las cifras del mes en «Tus números».
 */
export const POST = protegido({ entidad: "fin_movimientos" }, async (perfil, req) => {
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const cat = await categoriaDeLaEmpresa(c.companyId, b.categoria_id);
  if (!cat) return fallo("Esa categoría no es de tu empresa.", 404);
  if (cat.tipo !== b.tipo) return fallo(cat.tipo === "ingreso" ? "Esa categoría es de lo que entra, no de lo que sale." : "Esa categoría es de lo que sale, no de lo que entra.");
  if (cat.archivada) return fallo("Esa categoría está archivada. Elige otra o vuelve a activarla.");
  const { data, error } = await supabaseAdmin()
    .from("fin_movimientos")
    .insert({
      company_id: c.companyId,
      fecha: b.fecha,
      tipo: b.tipo,
      categoria_id: b.categoria_id,
      monto: b.monto,
      moneda: b.moneda,
      detalle: b.detalle?.trim() || null,
      origen: "manual",
      registrado_por: perfil.id,
    })
    .select("id")
    .single();
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id: data.id }, 201);
});
