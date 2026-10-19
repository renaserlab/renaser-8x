import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { RE_MES } from "@/lib/fin/caja";

const Esquema = z.object({
  mes: z.string().regex(RE_MES, "mes AAAA-MM"),
  tipo_cambio: z.number().positive().max(100).optional().nullable(),
  fuente: z.string().trim().max(120).optional().nullable(),
});

/**
 * CERRAR UN MES (Finanzas · Caja). Lo decide la base (fin_cerrar_mes): solo un mes que ya terminó, en el reloj de la
 * empresa; si tuvo dólares, con su tipo de cambio y de dónde salió. Al cerrarse, sus dólares entran en soles a
 * «Tus números» y el mes deja de moverse. Si se niega, su mensaje llega tal cual.
 */
export const POST = protegido({ entidad: "fin_cierres" }, async (perfil, req) => {
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const { data, error } = await supabaseAdmin().rpc("fin_cerrar_mes", {
    p_company: c.companyId,
    p_mes: `${b.mes}-01`,
    p_tipo_cambio: b.tipo_cambio ?? null,
    p_fuente: b.fuente?.trim() || null,
    p_por: perfil.id,
  });
  if (error) return fallo(mensajeDeLaBase(error, "No se pudo cerrar el mes."), 409);
  return ok({ id: data }, 201);
});
