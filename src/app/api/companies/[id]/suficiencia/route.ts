import { protegido, ok, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { suficienciaDeEmpresa } from "@/lib/bandeja";
import { diagnosticoListo, cabeEnUnDia } from "@/lib/rules/suficiencia";

type Ctx = { params: Promise<{ id: string }> };

/** Condiciones de suficiencia (13, 15, P1-04): para el consultor. El cliente solo recibe "qué falta ahora". */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  const lev = await suficienciaDeEmpresa(id);
  if (perfil.rol !== "consultor") return ok({ levantamiento_completo: lev.completo });
  const [{ data: fs }, { count: personas }, { count: fuentes }, { count: procesos }] = await Promise.all([
    sb.from("findings").select("estado_revision,requiere_validacion").eq("company_id", id),
    sb.from("participants").select("id", { count: "exact", head: true }).eq("company_id", id),
    sb.from("sources").select("id", { count: "exact", head: true }).eq("company_id", id),
    sb.from("processes").select("id", { count: "exact", head: true }).eq("company_id", id).eq("version", "as_is"),
  ]);
  return ok({ levantamiento: lev, diagnostico: diagnosticoListo(fs ?? []), modo_intensivo: cabeEnUnDia({ personas: personas ?? 0, sedes: 1, fuentes: fuentes ?? 0, procesos_estimados: procesos ?? 0, bloque_agendado: true }) });
});
