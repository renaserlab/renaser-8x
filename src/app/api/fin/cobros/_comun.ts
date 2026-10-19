/**
 * FINANZAS · LO COMÚN A LAS RUTAS DE COBROS Y DE PAGOS QUE SE REPITEN (19-10-2026). Los esquemas de lo que llega del
 * navegador y las comprobaciones de pertenencia: las funciones de la base (fin_registrar_pago_cobro, fin_pagar_recurrente…)
 * no saben quién llama, así que antes de pasarles un id se comprueba aquí que es de la empresa de la sesión.
 */
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { NUMERO_DE_DESTINO, type Destino, type TipoMovimiento } from "@/lib/fin/calculos";

export const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "no es un día (AAAA-MM-DD)");
export const moneda = z.enum(["PEN", "USD"]);
/** Un monto en soles o dólares: mayor que cero y con céntimos como mucho (la base exige lo mismo). */
export const monto = z
  .number({ message: "el monto tiene que ser un número" })
  .positive("tiene que ser mayor que cero")
  .max(9_999_999_999, "es demasiado grande")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "admite como mucho dos decimales (céntimos)");
export const motivo = z.string().trim().min(10, "escribe el motivo (al menos diez caracteres)").max(500);

type Categoria = { id: string; nombre: string; tipo: TipoMovimiento; destino: Destino; archivada: boolean };

/** La categoría, si es de esta empresa, del tipo pedido y no está archivada. */
export async function categoriaDe(companyId: string, id: string, tipo: TipoMovimiento): Promise<Categoria | null> {
  const { data } = await supabaseAdmin().from("fin_categorias").select("id,nombre,tipo,destino,archivada").eq("id", id).eq("company_id", companyId).maybeSingle();
  const c = data as Categoria | null;
  return c && c.tipo === tipo && !c.archivada ? c : null;
}

/** Cualquier categoría de la empresa por su id (para decir a qué número fue un movimiento, aunque esté archivada). */
export async function nombreYDestino(companyId: string, id: string): Promise<{ nombre: string; numero: string } | null> {
  const { data } = await supabaseAdmin().from("fin_categorias").select("nombre,destino").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!data) return null;
  return { nombre: data.nombre as string, numero: NUMERO_DE_DESTINO[data.destino as Destino] };
}

/** «Entró solo a tu caja como «Venta al por mayor» → Ventas del mes.» (o «Salió…»). */
export function avisoDeCaja(tipo: TipoMovimiento, cat: { nombre: string; numero: string } | null): string {
  const verbo = tipo === "ingreso" ? "Entró solo a tu caja" : "Salió solo de tu caja";
  if (!cat) return `${verbo}.`;
  return cat.numero === "No es venta ni gasto"
    ? `${verbo} como «${cat.nombre}» (no cuenta como venta ni como gasto en «Tus números»).`
    : `${verbo} como «${cat.nombre}» → ${cat.numero} en «Tus números».`;
}
