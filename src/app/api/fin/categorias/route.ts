import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { destinoValido } from "@/lib/fin/caja";

const Esquema = z.object({
  nombre: z.string().trim().min(1).max(80),
  tipo: z.enum(["ingreso", "egreso"]),
  destino: z.enum(["venta", "costo_variable", "gasto_fijo", "ninguno"]),
});

/**
 * CREAR UNA CATEGORÍA (Finanzas · Caja). Cada categoría dice a qué número de «Tus números» va lo que se registra con
 * ella: un ingreso es venta o nada; un egreso es costo variable, gasto fijo o nada.
 */
export const POST = protegido({ entidad: "fin_categorias" }, async (perfil, req) => {
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  if (!destinoValido(b.tipo, b.destino)) {
    return fallo(b.tipo === "ingreso" ? "Lo que entra es venta o no es venta: no puede ser costo ni gasto." : "Lo que sale no puede ser venta.");
  }
  const { data: ultima } = await supabaseAdmin().from("fin_categorias").select("orden").eq("company_id", c.companyId).eq("tipo", b.tipo).order("orden", { ascending: false }).limit(1);
  const { data, error } = await supabaseAdmin()
    .from("fin_categorias")
    .insert({ company_id: c.companyId, nombre: b.nombre, tipo: b.tipo, destino: b.destino, orden: (ultima?.[0]?.orden ?? 0) + 1 })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return fallo(`Ya tienes una categoría «${b.nombre}» de lo que ${b.tipo === "ingreso" ? "entra" : "sale"}.`, 409);
    return fallo(mensajeDeLaBase(error), 409);
  }
  return ok({ id: data.id }, 201);
});
