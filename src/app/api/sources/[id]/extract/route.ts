import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";
import { NOTA_LECTURA_ANTERIOR, numeroYaDecidido } from "@/lib/documentos/fidelidad";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Re-encola la extracción de una fuente (por ejemplo, tras un fallo).
 *
 * LAS AFIRMACIONES ANTERIORES NO SE TIRAN: SE ARCHIVAN. Esta ruta borraba los claims previos antes de
 * volver a leer, así que una re-extracción que saliera peor (o que fallara) dejaba la fuente con menos
 * de lo que tenía, sin rastro de lo perdido. Ahora cada versión anterior queda en `claims_archivo`
 * (migración `supabase/migracion-claims-archivo.sql`) con su número de versión y el motivo, y la
 * respuesta dice qué versión se archivó. Si archivar falla, NO se borra nada: mejor no reextraer que
 * perder trabajo en silencio.
 *
 * LOS NÚMEROS LEÍDOS TAMBIÉN SE ARCHIVAN (cierre del 13-10-2026). La lectura anterior dejó números en la empresa
 * (`company_metricas` con esta fuente y origen «extraido») y la nueva los iba a pisar sin dejar rastro de lo que
 * decían. Ahora van al mismo archivo que las afirmaciones, en el mismo bloque y antes de que nada cambie; cada
 * uno lleva `archivo_de: "company_metricas"` para que nadie lo tome por una afirmación.
 *  - No se borran: una fila puede guardar al lado la cifra que declaró el dueño (`cifra_desplazada`) y borrarla se
 *    la llevaría. La nueva lectura reescribe los que vuelva a traer.
 *  - Los que aún nadie decidió quedan marcados en su nota («De la lectura anterior…»). Si la nueva lectura los
 *    trae, la marca desaparece con la reescritura; si no, se queda, y quien revisa sabe que esa cifra no salió de
 *    la lectura que tiene delante.
 *  - Los que el consultor YA CONCILIÓ no se tocan, ni aquí ni en el archivo, y la respuesta lo dice con su cuenta.
 *
 * Y LA FUENTE SALE DE REVISIÓN. Una fuente «pendiente» o «consolidada» que se vuelve a leer deja de estarlo
 * (`revision` vacío) hasta que la nueva lectura termine y la ponga otra vez pendiente. Antes seguía «por revisar»
 * mientras se leía, con el panel de revisión abierto sobre una lectura que ya no existía.
 *
 * El orden importa: archivar, marcar, sacar de revisión y solo entonces borrar. Si algo de lo primero falla, la
 * ruta responde con la causa y las afirmaciones siguen donde estaban.
 */
export const POST = protegido<Ctx>({ cupo: "subida" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("sources").select("id,company_id,tipo,origen").eq("id", id).single();
  if (!s) return fallo("Fuente no encontrada", 404);
  await exigirAcceso(perfil, s.company_id);
  if (perfil.rol !== "consultor" && (s.tipo === "entrevista" || s.origen !== "cliente")) return fallo("Fuente no encontrada", 404);

  const { data: previas, error: eLeer } = await sb.from("claims").select("*").eq("source_id", id);
  if (eLeer) return fallo(`No se pudieron leer las afirmaciones previas: ${eLeer.message}`, 500);
  const { data: ultima, error: eVersion } = await sb.from("claims_archivo").select("version").eq("source_id", id).order("version", { ascending: false }).limit(1).maybeSingle();
  if (eVersion) return fallo(`No se pudo consultar el archivo de afirmaciones (¿falta aplicar supabase/migracion-claims-archivo.sql?): ${eVersion.message}`, 500);
  const version = Number(ultima?.version ?? 0) + 1;

  // Los números que la lectura anterior dejó en la empresa. Se leen enteros (con lo que cada fila guarde al lado)
  // y se separan aquí: los leídos se archivan; los que el consultor ya concilió solo se cuentan.
  const { data: numerosDeLaFuente, error: eNumeros } = await sb.from("company_metricas").select("*").eq("company_id", s.company_id).eq("source_id", id);
  if (eNumeros) return fallo(`No se pudieron leer los números que dejó la lectura anterior, así que no se borra nada: ${eNumeros.message}`, 500);
  const numeros = (numerosDeLaFuente ?? []) as NumeroDeLaFuente[];
  const extraidos = numeros.filter((m) => m.origen === "extraido");
  const conciliados = numeros.filter((m) => m.origen === "conciliado").length;

  let versionArchivada: number | null = null;
  if ((previas ?? []).length || extraidos.length) {
    const bloque = [...(previas ?? []), ...extraidos.map((m) => ({ archivo_de: "company_metricas", ...m }))];
    const { error: eArch } = await sb.from("claims_archivo").insert({ source_id: id, company_id: s.company_id, version, claims: bloque, motivo: "reextraccion", archivado_por: perfil.id });
    if (eArch) return fallo(`No se archivaron las afirmaciones previas, así que no se borra nada (tampoco se tocaron los números leídos): ${eArch.message}`, 500);
    versionArchivada = version;
  }

  // Ya archivados, los números sin decidir se marcan como de la lectura anterior. Los descartados son una decisión
  // del consultor y se dejan como están; el filtro por origen evita tocar uno que se concilió mientras tanto.
  for (const m of extraidos) {
    const nota = String(m.nota ?? "");
    if (numeroYaDecidido(m) || nota.startsWith(NOTA_LECTURA_ANTERIOR)) continue;
    const { error: eMarca } = await sb
      .from("company_metricas")
      .update({ nota: `${NOTA_LECTURA_ANTERIOR} (archivada como versión ${version}): la nueva lectura todavía no trajo este número.${nota ? ` ${nota}` : ""}` })
      .eq("id", m.id)
      .eq("origen", "extraido");
    if (eMarca) return fallo(`No se pudo marcar un número de la lectura anterior, así que no se borra nada: ${eMarca.message}`, 500);
  }

  // Fuera de revisión hasta que la nueva lectura termine: lo que se va a revisar todavía no existe.
  const { error: eRevision } = await sb.from("sources").update({ revision: null }).eq("id", id);
  if (eRevision) return fallo(`No se pudo sacar la fuente de revisión, así que no se borra nada (¿falta aplicar supabase/migracion-evidencia-dimensiones.sql?): ${eRevision.message}`, 500);

  await sb.from("claims").delete().eq("source_id", id);
  await sb.from("source_fragments").delete().eq("source_id", id);
  // Los trabajos de extracción anteriores se retiran para que las claves de sus tramos (`extraer`,
  // fuente, índice) vuelvan a estar libres: sin esto, la re-extracción encontraría cada tramo «ya hecho».
  await sb.from("jobs").delete().eq("tipo", "extraer").contains("payload", { source_id: id });
  // La clave es «la re-extracción número N de esta fuente»: determinista y con significado, no la hora.
  const job = await encolar({ company_id: s.company_id, tipo: "extraer", payload: { source_id: id }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer-raiz", id, "reextraccion", version]) });
  const afirmaciones = (previas ?? []).length;
  const partes = [
    versionArchivada === null
      ? "No había afirmaciones ni números leídos que archivar."
      : `Se archivaron ${afirmaciones} afirmación(es) y ${extraidos.length} número(s) leído(s) como versión ${versionArchivada}.`,
    "La fuente salió de revisión hasta que termine la nueva lectura.",
    conciliados ? `${conciliados} número(s) que ya habías conciliado no se tocaron: siguen como los dejaste.` : null,
  ];
  return ok({
    job_id: job.id,
    version_archivada: versionArchivada,
    afirmaciones_archivadas: afirmaciones,
    numeros_archivados: extraidos.length,
    numeros_conciliados_intactos: conciliados,
    mensaje: partes.filter(Boolean).join(" "),
  });
});

/** Lo que hace falta de una fila de company_metricas para decidir qué se archiva y qué se marca. El archivo guarda la fila entera. */
type NumeroDeLaFuente = { id: string; origen?: string | null; estado?: string | null; valor?: number | null; nota?: string | null };

/** P1-22: el cliente solo borra fuentes propias (origen cliente) que no sean entrevistas. El consultor, cualquiera. */
export const DELETE = protegido<Ctx>({ cupo: "subida" }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("sources").select("id,company_id,storage_path,tipo,origen").eq("id", id).single();
  if (!s) return fallo("Fuente no encontrada", 404);
  await exigirAcceso(perfil, s.company_id);
  if (perfil.rol !== "consultor" && (s.tipo === "entrevista" || s.origen !== "cliente")) return fallo("Fuente no encontrada", 404);
  if (s.storage_path) await sb.storage.from("fuentes").remove([s.storage_path]);
  await sb.from("sources").delete().eq("id", id);
  return ok({ eliminada: true });
});
