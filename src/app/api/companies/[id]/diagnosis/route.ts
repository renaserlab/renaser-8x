import { protegido, ok, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hallazgosAprobadosConEvidencia } from "@/lib/db/queries";

type Ctx = { params: Promise<{ id: string }> };

/** Diagnóstico 4P: consulta, no IA. El cliente solo recibe hallazgos aprobados con evidencia (frontera). */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  const { data: diag } = await sb.from("diagnoses").select("*").eq("company_id", id);
  if (perfil.rol === "consultor") {
    const { data: hallazgos } = await sb
      .from("findings")
      .select("*, finding_evidence(claim_id, relacion, claims(id,texto,estado,fecha_afirmacion,sources(nombre,tipo,fecha_origen),participants(nombre,rol,puesto)))")
      .eq("company_id", id)
      .order("created_at", { ascending: false });
    // Regla estructural: sin evidencia no se muestra.
    return ok({ diagnosticos: diag ?? [], hallazgos: (hallazgos ?? []).filter((h) => (h.finding_evidence ?? []).some((e: { relacion: string }) => e.relacion === "sustenta")) });
  }
  return ok({ diagnosticos: (diag ?? []).map((d) => ({ pilar: d.pilar, estado: d.estado })), hallazgos: await hallazgosAprobadosConEvidencia(id) });
});
