import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase, type Categoria } from "@/lib/fin/calculos";
import { categoriaEnUso, destinoValido } from "@/lib/fin/caja";

type Ctx = { params: Promise<{ id: string }> };

const Esquema = z
  .object({
    nombre: z.string().trim().min(1).max(80),
    destino: z.enum(["venta", "costo_variable", "gasto_fijo", "ninguno"]),
    archivada: z.boolean(),
  })
  .partial();

async function categoria(companyId: string, id: string): Promise<Categoria | null> {
  const { data } = await supabaseAdmin().from("fin_categorias").select("id,nombre,tipo,destino,archivada,orden").eq("company_id", companyId).eq("id", id).maybeSingle();
  return (data as Categoria | null) ?? null;
}

/**
 * RENOMBRAR, CAMBIAR EL DESTINO O ARCHIVAR UNA CATEGORÍA. Cambiar el destino mueve lo ya registrado con ella al otro
 * número de «Tus números» en los meses ABIERTOS, en ese momento. Un mes cerrado conserva sus cifras: se recalcula si
 * alguien lo reabre (el disparador del cierre lo hace).
 */
export const PATCH = protegido<Ctx>({ entidad: "fin_categorias" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const cat = await categoria(c.companyId, id);
  if (!cat) return fallo("Esa categoría no es de tu empresa.", 404);
  if (b.destino !== undefined && !destinoValido(cat.tipo, b.destino)) {
    return fallo(cat.tipo === "ingreso" ? "Lo que entra es venta o no es venta: no puede ser costo ni gasto." : "Lo que sale no puede ser venta.");
  }
  const cambios: Record<string, unknown> = {};
  if (b.nombre !== undefined) cambios.nombre = b.nombre;
  if (b.destino !== undefined) cambios.destino = b.destino;
  if (b.archivada !== undefined) cambios.archivada = b.archivada;
  if (!Object.keys(cambios).length) return fallo("No hay nada que cambiar.");
  const { error } = await supabaseAdmin().from("fin_categorias").update(cambios).eq("id", id).eq("company_id", c.companyId);
  if (error) {
    if (error.code === "23505") return fallo("Ya tienes otra categoría con ese nombre.", 409);
    return fallo(mensajeDeLaBase(error), 409);
  }
  // Un cambio de destino tiene que verse ya en «Tus números»: se recalcula cada mes abierto que la usa.
  if (b.destino !== undefined && b.destino !== cat.destino) {
    const sb = supabaseAdmin();
    const [{ data: meses }, { data: cerrados }] = await Promise.all([
      sb.from("fin_movimientos").select("fecha").eq("company_id", c.companyId).eq("categoria_id", id),
      sb.from("fin_cierres").select("mes").eq("company_id", c.companyId).is("reabierto_at", null),
    ]);
    const cerrado = new Set((cerrados ?? []).map((x) => String(x.mes).slice(0, 7)));
    const abiertos = [...new Set((meses ?? []).map((m) => String(m.fecha).slice(0, 7)))].filter((m) => !cerrado.has(m));
    for (const mes of abiertos) {
      const { error: e } = await sb.rpc("fin_sincronizar_mes", { p_company: c.companyId, p_mes: `${mes}-01` });
      if (e) return fallo(mensajeDeLaBase(e, "La categoría cambió, pero no se pudieron recalcular sus números. Vuelve a intentarlo."), 500);
    }
  }
  return ok({ id });
});

/** BORRAR UNA CATEGORÍA: solo si nadie la usó. Si tiene movimientos, cobros o pagos, se archiva (y se dice). */
export const DELETE = protegido<Ctx>({ entidad: "fin_categorias" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const c = await exigirFinanzas(perfil, { escribir: true });
  const cat = await categoria(c.companyId, id);
  if (!cat) return fallo("Esa categoría no es de tu empresa.", 404);
  if (await categoriaEnUso(c.companyId, id)) {
    const { error } = await supabaseAdmin().from("fin_categorias").update({ archivada: true }).eq("id", id).eq("company_id", c.companyId);
    if (error) return fallo(mensajeDeLaBase(error), 409);
    return ok({ id, archivada: true });
  }
  const { error } = await supabaseAdmin().from("fin_categorias").delete().eq("id", id).eq("company_id", c.companyId);
  if (error) return fallo(mensajeDeLaBase(error), 409);
  return ok({ id, borrada: true });
});
