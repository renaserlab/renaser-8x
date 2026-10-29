import { protegido, ok, fallo, exigirAcceso, leerValidado, texto } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";
import { CLAVES_VARA } from "@/lib/metodo/varas";
import { puedePasar, queLeFaltaParaVigencia, estadoDelActivo, type DocDelActivo, type Estado, type Origen } from "@/lib/expediente";

type Ctx = { params: Promise<{ id: string }> };

/**
 * EL EXPEDIENTE DOCUMENTAL de una empresa: lo que YA tiene, con su estado real.
 *
 * Lo que el cliente entrega es materia prima. Entra aquí, se mide contra la vara de su tipo y sale
 * una propuesta de mejora. Nada se sustituye en automático: la consultora decide.
 */

/** GET: el expediente completo, con el estado de cada entregable del contrato. */
export const GET = protegido<Ctx>({ consultor: true }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();

  const [{ data: docs }, { data: revisiones }, { data: entregables, error: errContrato }] = await Promise.all([
    sb
      .from("expediente_documental")
      .select("id,nombre,clave_vara,entregable,activo_clave,origen,estado,version,aprobado_at,vigente_desde,drive_id,updated_at")
      .eq("company_id", id)
      .order("updated_at", { ascending: false }),
    sb
      .from("revision_documental")
      .select("documento_id,veredicto,exigencias_total,exigencias_cumple,created_at")
      .eq("company_id", id)
      .order("created_at", { ascending: false }),
    // EL CONTRATO DE ESTA EMPRESA, no el de otra. Hasta la auditoría del 18-10-2026 esto era una
    // constante del código con el contrato de la primera empresa cliente, y la ruta la devolvía para cualquier
    // empresa: las cinco de la base veían el mismo tablero.
    sb
      .from("contrato_entregables")
      .select("clausula,clave,nombre,clave_vara,tipo,orden")
      .eq("company_id", id)
      .order("orden"),
  ]);
  if (errContrato) return fallo(`No se pudo leer el contrato de esta empresa: ${errContrato.message}`, 500);

  // La última revisión de cada documento: las anteriores se conservan para comparar antes y después.
  const ultima = new Map<string, NonNullable<typeof revisiones>[number]>();
  for (const r of revisiones ?? []) if (!ultima.has(r.documento_id)) ultima.set(r.documento_id, r);

  // El tablero del contrato: qué se prometió, qué existe y qué falta — sin tener que revisarlo a mano.
  const porEntregable = new Map<string, NonNullable<typeof docs>[number][]>();
  for (const d of docs ?? []) {
    if (!d.entregable) continue;
    porEntregable.set(d.entregable, [...(porEntregable.get(d.entregable) ?? []), d]);
  }

  const contrato = (entregables ?? []).map((e) => {
    const suyos = porEntregable.get(e.clave) ?? [];
    const vigente = suyos.find((d) => d.estado === "vigente");
    return {
      ...e,
      estado: vigente ? "vigente" : suyos.length ? "hay_base" : "no_existe",
      documentos: suyos.length,
      vigente_desde: vigente?.vigente_desde ?? null,
    };
  });

  // El estado de cada activo SALE de sus documentos, no se escribe aparte. Es la corrección del
  // defecto que encontró la auditoría: company_assets decía «construido» para nueve documentos que
  // la primera empresa cliente ya tenía, porque los dos registros se escribían por separado y nadie los cruzaba.
  const porActivo = new Map<string, DocDelActivo[]>();
  for (const d of docs ?? []) {
    if (!d.activo_clave) continue;
    porActivo.set(d.activo_clave, [
      ...(porActivo.get(d.activo_clave) ?? []),
      { estado: d.estado as Estado, origen: d.origen as Origen, revisado_contra_vara: ultima.has(d.id) },
    ]);
  }
  const activos = [...porActivo.entries()].map(([clave, suyos]) => ({ clave, ...estadoDelActivo(suyos) }));

  return ok({
    documentos: (docs ?? []).map((d) => ({ ...d, ultima_revision: ultima.get(d.id) ?? null })),
    contrato,
    activos,
    resumen: {
      total: (docs ?? []).length,
      vigentes: (docs ?? []).filter((d) => d.estado === "vigente").length,
      sin_revisar: (docs ?? []).filter((d) => !ultima.has(d.id)).length,
      entregables_sin_nada: contrato.filter((c) => c.estado === "no_existe").length,
      // Un contrato sin filas no es un contrato cumplido: es un contrato que nadie cargó. Se dice,
      // en vez de devolver un tablero vacío que se lee como «no falta nada».
      contrato_cargado: contrato.length > 0,
    },
  });
});

/** POST: registra un documento en el expediente y encola su revisión contra la vara. */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(
    req,
    z.object({
      nombre: texto(300),
      clave_vara: z.enum(CLAVES_VARA as [string, ...string[]]),
      entregable: z.string().max(60).optional(),
      // Qué parte de la empresa cubre este documento (clave de BLOQUES_ACTIVOS). De aquí sale el
      // estado del activo, y es lo que impide que se vuelva a construir lo que ya existe.
      activo_clave: z.string().max(60).optional(),
      origen: z.enum(["cliente", "consultora", "plantilla_adaptada"]).default("cliente"),
      contenido: z.string().max(400_000).optional(),
      source_id: z.string().uuid().optional(),
      drive_id: z.string().max(200).optional(),
      version: z.string().max(40).optional(),
      revisar: z.boolean().default(true),
    })
  );

  if (!b.contenido && !b.source_id) {
    return fallo("Hace falta el texto del documento o la fuente de la que sale: sin texto no se puede medir contra la vara.", 400);
  }

  const sb = supabaseAdmin();
  const { data: doc, error } = await sb
    .from("expediente_documental")
    .insert({
      company_id: id,
      nombre: b.nombre.trim(),
      clave_vara: b.clave_vara,
      entregable: b.entregable ?? null,
      activo_clave: b.activo_clave ?? null,
      origen: b.origen,
      estado: "recibido",
      contenido: b.contenido ?? null,
      source_id: b.source_id ?? null,
      drive_id: b.drive_id ?? null,
      version: b.version ?? null,
    })
    .select("id")
    .single();
  if (error) return fallo(error.message, 500);

  if (!b.revisar) return ok({ documento_id: doc.id, revision: "no pedida" });

  const job = await encolar({
    company_id: id,
    tipo: "revisar_documento",
    payload: { documento_id: doc.id },
    prioridad: PRIORIDAD.diagnosticar,
    idempotency_key: claveIdempotente(["revisar", doc.id]),
  });
  return ok({ documento_id: doc.id, job_id: job.id });
});

/**
 * PATCH: mueve un documento por la máquina de estados.
 *
 * Aprobar y declarar vigente son dos cosas distintas y se piden por separado: la aprobación es la
 * decisión, la vigencia es la fecha desde la que ese documento manda.
 */
export const PATCH = protegido<Ctx>({ consultor: true }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(
    req,
    z.object({
      documento_id: z.string().uuid(),
      a: z.enum(["borrador", "en_revision", "aprobado", "vigente", "sustituido", "archivado"]),
      vigente_desde: z.string().max(10).optional(),
      sustituye_a: z.string().uuid().optional(),
      nota: texto(1200).optional(),
    })
  );
  const sb = supabaseAdmin();

  const { data: doc } = await sb
    .from("expediente_documental")
    .select("id,estado,entregable,aprobado_por,aprobado_at,vigente_desde")
    .eq("id", b.documento_id)
    .eq("company_id", id)
    .maybeSingle();
  if (!doc) return fallo("El documento no está en el expediente de esta empresa.", 404);

  if (!puedePasar(doc.estado as Estado, b.a)) {
    return fallo(`Desde «${doc.estado}» no se puede pasar a «${b.a}». Un documento que nadie aprobó no puede quedar vigente.`, 409);
  }

  const ahora = new Date().toISOString();
  const cambios: Record<string, unknown> = { estado: b.a, updated_at: ahora, nota_consultora: b.nota?.trim() ?? null };

  if (b.a === "aprobado") {
    cambios.aprobado_por = perfil.id;
    cambios.aprobado_at = ahora;
  }

  if (b.a === "vigente") {
    const { count } = await sb
      .from("revision_documental")
      .select("id", { count: "exact", head: true })
      .eq("documento_id", b.documento_id);
    const falta = queLeFaltaParaVigencia({
      estado: doc.estado as Estado,
      aprobado_por: doc.aprobado_por,
      aprobado_at: doc.aprobado_at,
      vigente_desde: b.vigente_desde ?? doc.vigente_desde,
      revisado_contra_vara: (count ?? 0) > 0,
    });
    if (falta.length) return fallo(falta.join(" "), 409);
    cambios.vigente_desde = b.vigente_desde ?? doc.vigente_desde;
    if (b.sustituye_a) cambios.sustituye_a = b.sustituye_a;

    // Un solo vigente por entregable: dos dejarían al consultor y al cliente en reglas distintas.
    if (doc.entregable) {
      await sb
        .from("expediente_documental")
        .update({ estado: "sustituido", updated_at: ahora })
        .eq("company_id", id)
        .eq("entregable", doc.entregable)
        .eq("estado", "vigente");
    }
  }

  const { error } = await sb.from("expediente_documental").update(cambios).eq("id", b.documento_id);
  if (error) return fallo(error.message, 500);
  return ok({ estado: b.a, ...(b.a === "vigente" ? { rige_desde: cambios.vigente_desde } : {}) });
});
