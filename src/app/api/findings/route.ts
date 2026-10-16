import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { claimComoEvidencia, SELECT_SOURCES_DE_CLAIM, type ClaimParaEvidencia } from "@/lib/db/queries";
import { releerEvidencia } from "@/lib/jobs/handlers/diagnostico";

/** Lo que lee quien escribe un hallazgo que nace provisional. No se exporta: un route.ts solo exporta sus manejadores. */
const AVISO_NACE_PROVISIONAL = "Queda guardado como provisional: lo que elegiste para sostenerlo todavía no está confirmado. Mientras siga así no entra al plan ni a los documentos del cliente. Deja de ser provisional cuando eso se confirme y el área se vuelva a leer.";

/**
 * El consultor crea un hallazgo a mano. Exige evidencia: sin claim_ids no se crea.
 *
 * R10.4: EL HALLAZGO DEL CONSULTOR TAMBIÉN LEE SU EVIDENCIA. Hasta el 13-10-2026 nacía aprobado sin mirar qué lo
 * sostenía: provisional quedaba en false (el valor por defecto de la columna) y la confianza vacía, aunque todo lo
 * elegido fueran papeles que nadie confirmó. Entraba al plan y al portal como conclusión por la puerta de quien lo
 * escribió. Ahora nace con la misma lectura que deja la ruta de revisión (releerEvidencia sobre claimComoEvidencia):
 * sin ninguna afirmación confirmada es provisional, con su confianza y su porqué. Aprobar no es confirmar, tampoco
 * cuando quien aprueba es quien escribe. El candado del área no lo alcanza: responde por su propia evidencia.
 *
 * Y NO NACE PROVISIONAL EN SILENCIO. Un hallazgo provisional no entra al plan, a los entregables ni a los indicadores:
 * quien lo escribe tiene que saberlo en el momento, no descubrirlo cuando falte en el plan. La respuesta lleva el
 * `aviso` con sus palabras (null si no es provisional). Lo que lo levanta es que se confirme lo que lo sostiene y que
 * el área se vuelva a leer: la relectura la encola sola el disparo automático (jobs/auto.ts) la próxima vez que corre
 * —tras una validación o un contraste—, y también la hace cualquier diagnóstico del área. El aviso no promete que sea
 * al instante: confirmar una extracción entera no pasa hoy por el disparo.
 */
export const POST = protegido({ consultor: true }, async (perfil, req) => {
  const b = await leerJSON<{ company_id?: string; pilar?: string; titulo?: string; causa_raiz?: string; impacto?: string; veredicto?: string; recomendacion?: string; claim_ids?: string[]; claims_contrarios?: string[] }>(req);
  if (!b.company_id || !b.pilar || !b.titulo?.trim()) return fallo("Faltan empresa, pilar o título.");
  if (!b.claim_ids?.length) return fallo("Un hallazgo sin evidencia no se guarda. Elige al menos una definición que lo sustente.");
  const sb = supabaseAdmin();

  // La evidencia elegida, con sus dimensiones, tal como está HOY y solo de ESTA empresa.
  const sustentan = [...new Set(b.claim_ids)];
  const { data: filas, error: errEvid } = await sb
    .from("claims")
    .select(`id,source_id,participant_id,estado,comprobacion,confianza,vigente_hasta, ${SELECT_SOURCES_DE_CLAIM}, participants(rol)`)
    .eq("company_id", b.company_id)
    .in("id", sustentan);
  // Si la evidencia no se puede leer, no se adivina: se dice y no se guarda a ciegas.
  if (errEvid) return fallo(`No se pudo leer la evidencia elegida, así que el hallazgo no se guarda a ciegas: ${errEvid.message}`, 500);
  const claims = (filas ?? []) as unknown as ClaimParaEvidencia[];
  if (claims.length < sustentan.length) return fallo("Alguna de las definiciones elegidas no existe en esta empresa. Un hallazgo solo se sostiene en lo que esa empresa dijo o mostró.");
  const lectura = releerEvidencia(claims.map(claimComoEvidencia), { origen: "consultor" });

  const impacto = b.impacto ?? "medio";
  const { data: f, error } = await sb
    .from("findings")
    // El impacto que propone el consultor es el potencial; la confianza va aparte, leída de la evidencia.
    .insert({ company_id: b.company_id, pilar: b.pilar, titulo: b.titulo.trim(), causa_raiz: b.causa_raiz ?? null, impacto, impacto_potencial: impacto, veredicto: b.veredicto ?? null, recomendacion: b.recomendacion ?? null, origen: "consultor", estado_revision: "aprobado", ...(lectura ?? {}) })
    .select("id")
    .single();
  if (error) return fallo(error.message, 500);
  const { error: errEnlace } = await sb.from("finding_evidence").insert([
    ...sustentan.map((claim_id) => ({ finding_id: f.id, claim_id, relacion: "sustenta" })),
    ...(b.claims_contrarios ?? []).filter((claim_id) => !sustentan.includes(claim_id)).map((claim_id) => ({ finding_id: f.id, claim_id, relacion: "contradice" })),
  ]);
  // Un hallazgo sin su evidencia enlazada no sirve y no puede pasar por guardado: se dice cuál quedó a medias.
  if (errEnlace) return fallo(`El hallazgo se creó, pero no se pudo enlazar su evidencia (${errEnlace.message}). Así no llega al plan ni al cliente: revísalo antes de seguir.`, 500);
  await sb.from("corrections").insert({ finding_id: f.id, user_id: perfil.id, accion: "aprobado", comentario: "Creado por el consultor" });
  return ok({ id: f.id, provisional: lectura?.provisional ?? null, confianza: lectura?.confianza ?? null, aviso: lectura?.provisional ? AVISO_NACE_PROVISIONAL : null }, 201);
});
