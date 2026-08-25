import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";
import { BLOQUES_ACTIVOS } from "@/lib/activos";

type Ctx = { params: Promise<{ id: string }> };

const CLAVES = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));

/**
 * Capa 3 · Sistematización: del documento declarado a la versión trabajada.
 * POST { clave, comentario? } → encola el SISTEMATIZADOR (cada cambio con su porqué anclado en estándar o hallazgo).
 * POST { clave, accion: "confirmar" } → el dueño acepta la propuesta ("así lo queremos"); el declarado se conserva.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerJSON<{ clave?: string; comentario?: string; accion?: string }>(req);
  if (!b.clave || !CLAVES.has(b.clave)) return fallo("Activo desconocido.");
  const sb = supabaseAdmin();
  const { data: activo } = await sb.from("company_assets").select("estado,borrador,propuesta_estado").eq("company_id", id).eq("clave", b.clave).maybeSingle();

  if (b.accion === "confirmar") {
    if (activo?.propuesta_estado !== "lista") return fallo("No hay una propuesta lista que confirmar.");
    const { error } = await sb.from("company_assets").update({ propuesta_estado: "confirmada", updated_at: new Date().toISOString() }).eq("company_id", id).eq("clave", b.clave);
    if (error) return fallo(error.message, 500);
    return ok({ clave: b.clave, propuesta_estado: "confirmada" });
  }

  if (!activo?.borrador || !["construido", "en_uso"].includes(activo.estado ?? "")) return fallo("Primero hay que construir y confirmar el documento.");
  await sb.from("company_assets").update({ propuesta_estado: "trabajando", updated_at: new Date().toISOString() }).eq("company_id", id).eq("clave", b.clave);
  const job = await encolar({ company_id: id, tipo: "sistematizar_activo", payload: { clave: b.clave, comentario: (b.comentario ?? "").trim().slice(0, 600) || undefined }, prioridad: PRIORIDAD.proceso_voz, idempotency_key: claveIdempotente(["sistematizar", id, b.clave, Date.now()]) });
  return ok({ job_id: job.id });
});
