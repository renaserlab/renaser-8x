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
export const POST = protegido<Ctx>({ cupo: "ia" }, async (perfil, req, ctx) => {
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
    // ORIGEN «consultor», NO «cliente». Decía «cliente» y era un error con consecuencia: el documento
    // que 8X acababa de escribir volvía a entrar como materia prima aportada por la empresa, y
    // quedaba firmado como si lo hubiera entregado la dueña. Dos cosas se rompían con eso: el
    // expediente dejaba de distinguir lo que la empresa ya tenía de lo que nosotros produjimos —que
    // es la frontera que gobierna qué se mide y qué se mejora—, y ante el cliente desaparecía la
    // prueba de nuestro trabajo. La columna ya admite «consultor» y hay filas con ese valor.
    .insert({ company_id: id, tipo: "documento", nombre: `${def.nombre} (construido contigo)`, fecha_origen: new Date().toISOString().slice(0, 10), contenido: texto, origen: "consultor", estado: "subido" })
    .select("id")
    .single();
  if (error) return fallo(error.message, 500);
  await sb.from("company_assets").upsert({ company_id: id, bloque: def.bloque, clave: b.clave, estado: "construido", borrador: texto, confirmado_at: new Date().toISOString(), source_id: s!.id, updated_at: new Date().toISOString() }, { onConflict: "company_id,clave" });
  await encolar({ company_id: id, tipo: "extraer", payload: { source_id: s!.id }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer", s!.id]) });
  return ok({ clave: b.clave, estado: "construido", source_id: s!.id });
});
