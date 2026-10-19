import { z } from "zod";
import { protegido, ok, leerValidado } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";

const Esquema = z.object({ regla: z.enum(["inactividad", "bloqueos", "plan", "cierre_semanal", "diagnostico"]), activa: z.boolean() });

/**
 * ENCENDER O APAGAR UNA REVISIÓN AUTOMÁTICA en esta empresa (Avisos). La base sigue corriendo la regla para todas las
 * empresas; con `activa` en falso, simplemente no genera avisos aquí (os_regla_activa).
 */
export const PATCH = protegido({ entidad: "os_reglas" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { gestion: true });
  const b = await leerValidado(req, Esquema);
  const { error } = await supabaseAdmin().from("os_reglas").upsert({ company_id: c.companyId, regla: b.regla, activa: b.activa }, { onConflict: "company_id,regla" });
  if (error) throw new Error(error.message);
  return ok({ regla: b.regla, activa: b.activa });
});
