import { protegido, ok, fallo, leerJSON, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";
import { BLOQUES_ACTIVOS } from "@/lib/activos";

type Ctx = { params: Promise<{ id: string }> };

const DEFS = new Map(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => [`${b.clave}.${a.clave}`, { ...a, bloque: b.clave }])));

/**
 * El dueño confirma el borrador construido (posiblemente corregido por él).
 * body: { clave, borrador } → el activo pasa a "construido" y se vuelve FUENTE válida
 * (documento construido con el dueño → extracción → evidencia como cualquier otra).
 */
export const POST = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerJSON<{ clave?: string; borrador?: string }>(req);
  const def = b.clave ? DEFS.get(b.clave) : undefined;
  if (!def) return fallo("Activo desconocido.");
  const texto = (b.borrador ?? "").trim();
  if (texto.length < 20) return fallo("El borrador está vacío o demasiado corto.");
  const sb = supabaseAdmin();
  const { data: s, error } = await sb
    .from("sources")
    .insert({ company_id: id, tipo: "documento", nombre: `${def.nombre} (construido contigo)`, fecha_origen: new Date().toISOString().slice(0, 10), contenido: texto, origen: "cliente", estado: "subido" })
    .select("id")
    .single();
  if (error) return fallo(error.message, 500);
  await sb.from("company_assets").upsert({ company_id: id, bloque: def.bloque, clave: b.clave, estado: "construido", borrador: texto, confirmado_at: new Date().toISOString(), source_id: s!.id, updated_at: new Date().toISOString() }, { onConflict: "company_id,clave" });
  await encolar({ company_id: id, tipo: "extraer", payload: { source_id: s!.id }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer", s!.id]) });
  return ok({ clave: b.clave, estado: "construido", source_id: s!.id });
});
