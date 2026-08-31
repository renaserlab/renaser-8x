import { supabaseAdmin } from "./supabase/admin";

/**
 * BORRAR UNA EMPRESA SIN QUE POSTGRES SE PLANTE.
 *
 * El 30-08-2026 Kelin no pudo eliminar Jardín Renaser: «violates foreign key constraint
 * interview_responses_origen_claim_id_fkey». Al borrar la empresa, sus definiciones se van en
 * cascada, pero otras filas apuntan a ellas SIN acción de borrado y bloquean todo. No es una sola:
 * hay diez referencias así en el esquema, y cuál salta depende del orden en que Postgres decida
 * cascadear — o sea, del azar y de qué datos tenga esa empresa.
 *
 * Lo correcto sería arreglar esas claves foráneas (SET NULL), pero eso es DDL y el token de
 * administración caducó. Esto lo resuelve desde la aplicación y sirve igual: se sueltan los enlaces
 * que se pueden soltar y se borran los hijos en orden antes de tocar la empresa. Cuando se pueda
 * hacer el DDL, esta función seguirá siendo correcta — solo dejará de ser imprescindible.
 */
export async function prepararBorradoEmpresa(companyId: string): Promise<void> {
  const sb = supabaseAdmin();

  const [{ data: sesiones }, { data: claims }, { data: findings }] = await Promise.all([
    sb.from("interview_sessions").select("id").eq("company_id", companyId),
    sb.from("claims").select("id").eq("company_id", companyId),
    sb.from("findings").select("id").eq("company_id", companyId),
  ]);
  const idsSesion = (sesiones ?? []).map((s) => s.id as string);
  const idsClaim = (claims ?? []).map((c) => c.id as string);
  const idsFinding = (findings ?? []).map((f) => f.id as string);

  // 1. Soltar los enlaces que admiten quedar en null. Es lo que desbloquea la cascada.
  //    En lotes de 200: una empresa trabajada tiene cientos de respuestas y de definiciones.
  const enLotes = async <T>(ids: T[], fn: (lote: T[]) => PromiseLike<unknown>) => {
    for (let i = 0; i < ids.length; i += 200) await fn(ids.slice(i, i + 200));
  };

  if (idsClaim.length) {
    // La respuesta de entrevista que nació de una definición (el bloqueo que vio Kelin).
    if (idsSesion.length)
      await enLotes(idsSesion, (lote) => sb.from("interview_responses").update({ origen_claim_id: null }).in("session_id", lote));
    // Una definición que contradice a otra de la misma empresa.
    await enLotes(idsClaim, (lote) => sb.from("claims").update({ contradice_a: null }).in("id", lote));
  }
  if (idsFinding.length) {
    await enLotes(idsFinding, (lote) => sb.from("actions").update({ finding_id: null }).in("finding_id", lote));
    await enLotes(idsFinding, (lote) => sb.from("corrections").update({ finding_id: null }).in("finding_id", lote));
  }
  // El documento en construcción que apunta a la fuente de la que salió, y el proceso TO-BE que
  // apunta a su AS-IS.
  await sb.from("company_assets").update({ source_id: null }).eq("company_id", companyId);
  await sb.from("processes").update({ padre_id: null }).eq("company_id", companyId);

  // 2. Borrar los hijos en orden, de la hoja a la raíz. Así no se depende de en qué orden decida
  //    Postgres cascadear, que es justo lo que hacía que el fallo apareciera solo a veces.
  if (idsSesion.length) await enLotes(idsSesion, (lote) => sb.from("interview_responses").delete().in("session_id", lote));
  await sb.from("interview_sessions").delete().eq("company_id", companyId);
  if (idsFinding.length) await enLotes(idsFinding, (lote) => sb.from("finding_evidence").delete().in("finding_id", lote));
  await sb.from("findings").delete().eq("company_id", companyId);
  await sb.from("claim_relations").delete().eq("company_id", companyId);
  await sb.from("claims").delete().eq("company_id", companyId);
  await sb.from("sources").delete().eq("company_id", companyId);
  await sb.from("participants").delete().eq("company_id", companyId);
}
