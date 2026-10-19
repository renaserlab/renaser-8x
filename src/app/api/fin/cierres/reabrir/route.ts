import { z } from "zod";
import { protegido, ok, fallo, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirFinanzas } from "@/lib/fin/acceso";
import { mensajeDeLaBase } from "@/lib/fin/calculos";
import { RE_MES } from "@/lib/fin/caja";

const Esquema = z.object({
  mes: z.string().regex(RE_MES, "mes AAAA-MM"),
  motivo: z.string().trim().min(10, "al menos diez caracteres").max(400),
});

/**
 * REABRIR UN MES CERRADO, con un motivo escrito (fin_reabrir_mes). El cierre no se borra: queda marcado con quién,
 * cuándo y por qué. Reabierto, sus dólares vuelven a quedar fuera de «Tus números» hasta el próximo cierre.
 */
export const POST = protegido({ entidad: "fin_cierres" }, async (perfil, req) => {
  const c = await exigirFinanzas(perfil, { escribir: true });
  const b = await leerValidado(req, Esquema);
  const { error } = await supabaseAdmin().rpc("fin_reabrir_mes", { p_company: c.companyId, p_mes: `${b.mes}-01`, p_motivo: b.motivo, p_por: perfil.id });
  if (error) return fallo(mensajeDeLaBase(error, "No se pudo reabrir el mes."), 409);
  return ok({ mes: b.mes });
});
