import { z } from "zod";
import { protegido, ok, fallo, leerValidado, uuid } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { hoyEn } from "@/lib/os/calculos";
import { cicloDe } from "@/lib/os/evaluaciones";
import { personasDeLaEmpresa } from "@/lib/os/datos";
import { asignaciones360 } from "@/lib/os/talento";

const Esquema = z.object({ personas: z.array(uuid).min(1, "elige al menos una persona").max(100) });

/**
 * ABRIR UN CICLO 360 DEL MES para las personas elegidas (Equipo y talento, 19-10-2026). A cada una la evalúan: ella
 * misma, quien abre el ciclo como su jefe (si tiene ficha) y hasta dos compañeros al azar con cuenta (sin cuenta no
 * podrían responder). Volver a abrirlo no duplica: la tabla no admite dos veces el mismo evaluador sobre el mismo
 * evaluado en un ciclo, y lo que ya existía se deja como estaba. Responder se hace en «Mi perfil».
 */
export const POST = protegido({ entidad: "os_evaluaciones" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { talento: true });
  const b = await leerValidado(req, Esquema);
  const equipo = await personasDeLaEmpresa(c.companyId);
  const ids = new Set(equipo.map((p) => p.id));
  const evaluados = [...new Set(b.personas)];
  if (evaluados.some((id) => !ids.has(id))) return fallo("Alguna de esas personas no es de tu equipo.", 404);
  const conCuenta = equipo.filter((p) => p.user_id).map((p) => p.id);
  const ciclo = cicloDe(hoyEn(c.zona));
  const filas = asignaciones360(evaluados, conCuenta, c.persona?.id ?? null).map((a) => ({ ...a, company_id: c.companyId, ciclo }));
  const { data, error } = await supabaseAdmin()
    .from("os_evaluaciones")
    .upsert(filas, { onConflict: "ciclo,evaluado_id,evaluador_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return ok({ ciclo, nuevas: data?.length ?? 0, pedidas: filas.length }, 201);
});
