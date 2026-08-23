import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** El consultor crea un hallazgo a mano. Exige evidencia: sin claim_ids no se crea. */
export const POST = protegido({ consultor: true }, async (perfil, req) => {
  const b = await leerJSON<{ company_id?: string; pilar?: string; titulo?: string; causa_raiz?: string; impacto?: string; veredicto?: string; recomendacion?: string; claim_ids?: string[]; claims_contrarios?: string[] }>(req);
  if (!b.company_id || !b.pilar || !b.titulo?.trim()) return fallo("Faltan empresa, pilar o título.");
  if (!b.claim_ids?.length) return fallo("Un hallazgo sin evidencia no se guarda. Elige al menos una definición que lo sustente.");
  const sb = supabaseAdmin();
  const { data: f, error } = await sb
    .from("findings")
    .insert({ company_id: b.company_id, pilar: b.pilar, titulo: b.titulo.trim(), causa_raiz: b.causa_raiz ?? null, impacto: b.impacto ?? "medio", veredicto: b.veredicto ?? null, recomendacion: b.recomendacion ?? null, origen: "consultor", estado_revision: "aprobado" })
    .select("id")
    .single();
  if (error) return fallo(error.message, 500);
  await sb.from("finding_evidence").insert([
    ...b.claim_ids.map((claim_id) => ({ finding_id: f.id, claim_id, relacion: "sustenta" })),
    ...(b.claims_contrarios ?? []).map((claim_id) => ({ finding_id: f.id, claim_id, relacion: "contradice" })),
  ]);
  await sb.from("corrections").insert({ finding_id: f.id, user_id: perfil.id, accion: "aprobado", comentario: "Creado por el consultor" });
  return ok({ id: f.id }, 201);
});
