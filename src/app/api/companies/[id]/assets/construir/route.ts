import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";
import { BLOQUES_ACTIVOS } from "@/lib/activos";

type Ctx = { params: Promise<{ id: string }> };

const CLAVES = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));

/**
 * "No lo tengo" → lo construimos contigo (bloqueador 3).
 * body: { clave, respuestas?: [{pregunta, respuesta}] } → encola el CONSTRUCTOR (usa todo lo ya sabido,
 * pregunta solo huecos, genera borrador). El dueño luego confirma en /assets/confirmar.
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerJSON<{ clave?: string; respuestas?: { pregunta: string; respuesta: string }[] }>(req);
  if (!b.clave || !CLAVES.has(b.clave)) return fallo("Activo desconocido.");
  const sb = supabaseAdmin();
  await sb.from("company_assets").upsert({ company_id: id, bloque: b.clave.split(".")[0], clave: b.clave, estado: "construyendo", updated_at: new Date().toISOString() }, { onConflict: "company_id,clave" });
  const job = await encolar({ company_id: id, tipo: "construir_activo", payload: { clave: b.clave, respuestas: (b.respuestas ?? []).slice(0, 5) }, prioridad: PRIORIDAD.proceso_voz, idempotency_key: claveIdempotente(["construir", id, b.clave, Date.now()]) });
  return ok({ job_id: job.id });
});
