import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { exigirAutoridad } from "@/lib/autoridad";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";
import { claimComoEvidencia, SELECT_SOURCES_DE_CLAIM, type ClaimParaEvidencia } from "@/lib/db/queries";
import { releerEvidencia, type AuditoriaGuardada } from "@/lib/jobs/handlers/diagnostico";

type Ctx = { params: Promise<{ id: string }> };

/**
 * body: { accion: 'aprobado'|'corregido'|'rechazado', motivo?, comentario?, texto_corregido?, cambios?, levantar_validacion? }
 * Tres acciones y siempre un motivo. Cada una escribe en corrections.
 * 1.11: un hallazgo con `requiere_validacion` no se aprueba sin declarar (en el comentario) la evidencia adicional que lo sostiene.
 *
 * R10.4: aprobar o corregir RELEE provisional y confianza con la evidencia de ese momento (rechazar no: lo rechazado no se
 * mide). Hasta el 13-10-2026 nacían con el diagnóstico y nunca cambiaban: el dueño confirmaba las afirmaciones, el consultor
 * aprobaba, y el hallazgo seguía rotulado «provisional». La regla es una sola y vive junto al diagnóstico (releerEvidencia):
 * las mismas reglas de evidencia (confianzaDeHallazgo) y la misma traducción (claimComoEvidencia), así el número no salta por
 * quién lo calcula. Y aprobar no es confirmar: en un pilar que aún no llega al mínimo de afirmaciones confirmadas, un hallazgo
 * de la IA sigue provisional aunque se apruebe; lo que lo levanta es que el dueño confirme, no la firma del consultor.
 */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  // Ser consultor abre la puerta; aprobar, corregir o rechazar un hallazgo exige además la autoridad.
  await exigirAutoridad(perfil, "aprobar_hallazgo");
  const b = await leerJSON<{ accion?: "aprobado" | "corregido" | "rechazado"; motivo?: string; comentario?: string; texto_corregido?: string; cambios?: Record<string, unknown>; levantar_validacion?: boolean }>(req);
  if (!b.accion) return fallo("Falta la acción");
  if (b.accion !== "aprobado" && !b.motivo) return fallo("Corregir o rechazar exige un motivo: es lo que enseña al sistema.");
  const sb = supabaseAdmin();
  const { data: f } = await sb.from("findings").select("id,requiere_validacion,company_id,pilar,auditoria,origen").eq("id", id).single();
  if (!f) return fallo("Hallazgo no encontrado", 404);
  const cambios: Record<string, unknown> = { estado_revision: b.accion };
  if (b.accion === "corregido" && b.cambios) {
    for (const k of ["titulo", "causa_raiz", "recomendacion", "impacto", "veredicto"]) if (b.cambios[k] !== undefined) cambios[k] = b.cambios[k];
  }
  if (b.accion === "aprobado" || b.accion === "corregido") {
    // La evidencia que lo sustenta, con sus dimensiones, tal como está HOY (el dueño pudo confirmar afirmaciones desde el diagnóstico).
    const { data: evid, error: errEvid } = await sb
      .from("finding_evidence")
      .select(`relacion, claims(id,source_id,participant_id,estado,comprobacion,confianza,vigente_hasta, ${SELECT_SOURCES_DE_CLAIM}, participants(rol))`)
      .eq("finding_id", id)
      .eq("relacion", "sustenta");
    // Si la evidencia no se puede leer, no se adivina: se dice y no se aprueba a ciegas.
    if (errEvid) return fallo(`No se pudo releer la evidencia del hallazgo, así que no se aprueba a ciegas: ${errEvid.message}`, 500);
    const claims = (evid ?? []).map((e) => e.claims as unknown as ClaimParaEvidencia | null).filter((c): c is ClaimParaEvidencia => !!c);
    // El candado del pilar también vale al aprobar (solo para lo que nació de la IA y pasó por él): cuántas afirmaciones
    // confirmadas tiene HOY el pilar, contadas como las cuenta el diagnóstico (las del pilar y las transversales).
    let confirmadasDelPilar: number | null = null;
    if (claims.length > 0 && f.origen === "ia" && f.pilar && f.company_id) {
      const { count, error: errPilar } = await sb.from("claims").select("id", { count: "exact", head: true }).eq("company_id", f.company_id).eq("estado", "confirmado").in("pilar", [f.pilar, "transversal"]);
      if (errPilar) return fallo(`No se pudo contar las afirmaciones confirmadas del pilar, así que no se aprueba a ciegas: ${errPilar.message}`, 500);
      confirmadasDelPilar = count ?? null;
    }
    // Sin evidencia enlazada no hay con qué releer: null, y no se toca (la falta de dato no es cero).
    const lectura = releerEvidencia(claims.map(claimComoEvidencia), { auditoria: (f.auditoria ?? null) as AuditoriaGuardada, origen: f.origen ?? null, confirmadasDelPilar });
    if (lectura) Object.assign(cambios, lectura);
  }
  if (f.requiere_validacion && b.accion !== "rechazado") {
    const bajaImpacto = b.accion === "corregido" && b.cambios?.impacto && b.cambios.impacto !== "alto";
    if (!b.levantar_validacion && !bajaImpacto) return fallo("Este hallazgo necesita validación: una sola opinión no sostiene un hallazgo crítico. Escribe en el comentario qué otra fuente lo sostiene y marca 'Validar y aprobar', baja el impacto, o recházalo.");
    if (b.levantar_validacion && !b.comentario?.trim()) return fallo("Para validar, escribe qué evidencia adicional lo sostiene.");
    cambios.requiere_validacion = false;
    cambios.motivo_validacion = null;
  }
  const { error } = await sb.from("findings").update(cambios).eq("id", id);
  if (error) return fallo(error.message, 500);
  await sb.from("corrections").insert({ finding_id: id, user_id: perfil.id, accion: b.accion, motivo: b.motivo ?? null, comentario: b.levantar_validacion ? `[validación levantada] ${b.comentario ?? ""}` : b.comentario ?? null, texto_corregido: b.texto_corregido ?? (b.cambios ? JSON.stringify(b.cambios) : null) });
  // El criterio del consultor mueve el tablero: al revisar, el pilar se re-diagnostica con la foto
  // fresca (antes el estado del pilar quedaba congelado en el día que corrió, revisara lo que revisara).
  if (f.pilar && f.company_id) {
    const { data: enCola } = await sb.from("jobs").select("id").eq("company_id", f.company_id).eq("tipo", "diagnosticar").eq("estado", "pendiente").filter("payload->>pilar", "eq", f.pilar).limit(1);
    if (!enCola?.length) {
      await encolar({ company_id: f.company_id, tipo: "diagnosticar", payload: { pilar: f.pilar }, prioridad: PRIORIDAD.diagnosticar, idempotency_key: claveIdempotente(["revision-diag", f.company_id, f.pilar, id, b.accion]) }).catch(() => {});
    }
  }
  return ok({ id, estado_revision: b.accion, provisional: (cambios.provisional as boolean | undefined) ?? null, confianza: (cambios.confianza as number | undefined) ?? null });
});
