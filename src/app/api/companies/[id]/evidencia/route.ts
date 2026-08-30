import { protegido, ok, fallo, exigirAcceso, leerValidado } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { reconocerPorBytes, nombreSeguro, MAX_EVIDENCIA_BYTES } from "@/lib/archivos";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 60;

/**
 * LA PRUEBA DE QUE SE HIZO. Las acciones del plan traían escrito qué evidencia haría falta
 * ("listas de chequeo firmadas por lote despachado") pero no guardaban nada, y las nueve acciones
 * que existían estaban todas en pendiente. Sin prueba, "se implementó" es una afirmación, no un
 * hecho verificado. Una foto del celular basta: eso es lo que un dueño puede dar de verdad.
 */
export const POST = protegido<Ctx>({ cupo: "subida" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);

  const form = await req.formData();
  const accionId = (form.get("action_id") as string | null)?.trim() || null;
  const assetClave = (form.get("asset_clave") as string | null)?.trim() || null;
  const nota = ((form.get("nota") as string | null) ?? "").trim().slice(0, 600);
  const archivo = form.get("archivo");

  if (!accionId && !assetClave) return fallo("Falta decir qué se está probando.");

  const sb = supabaseAdmin();
  // La acción tiene que ser de ESTA empresa: si no, cualquiera con una empresa propia podría colgar
  // evidencia en el plan de otra.
  if (accionId) {
    const { data: a } = await sb.from("actions").select("company_id").eq("id", accionId).maybeSingle();
    if (!a || a.company_id !== id) return fallo("Esa acción no es de esta empresa.", 404);
  }

  // Solo una nota, sin archivo: vale como evidencia menor y se marca como tal.
  if (!(archivo instanceof File)) {
    if (!nota) return fallo("Sube una foto o un archivo, o escribe al menos una nota de lo que se hizo.");
    const { data, error } = await sb.from("evidencias").insert({
      company_id: id, action_id: accionId, asset_clave: assetClave, tipo: "nota", nota, subido_por: perfil.id,
    }).select("id,tipo,nota,created_at").single();
    if (error) return fallo(error.message, 500);
    void registrar({ companyId: id, actor: perfil, accion: "crear", entidad: "evidencia", entidadId: data.id, detalle: { tipo: "nota" }, ruta: "/api/companies/evidencia", ip: ipDe(req) });
    return ok({ evidencia: data }, 201);
  }

  if (archivo.size === 0) return fallo("El archivo llegó vacío. Intenta de nuevo.");
  if (archivo.size > MAX_EVIDENCIA_BYTES) return fallo("La foto o el archivo debe pesar menos de 8 MB.");

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const firma = reconocerPorBytes(bytes);
  if (!firma) return fallo("Sube una foto (PNG, JPG, WebP o HEIC) o un PDF.");

  const nombre = nombreSeguro(archivo.name || `evidencia.${firma.ext}`);
  const ruta = `${id}/evidencias/${Date.now()}-${nombre}`;
  const { error: subida } = await sb.storage.from("fuentes").upload(ruta, bytes, { contentType: firma.mime, upsert: false });
  if (subida) return fallo("No pudimos guardar el archivo. Intenta de nuevo.", 500);

  const { data, error } = await sb.from("evidencias").insert({
    company_id: id, action_id: accionId, asset_clave: assetClave,
    tipo: firma.familia === "foto" ? "foto" : "archivo",
    ruta, nombre, mime: firma.mime, bytes: archivo.size, nota: nota || null, subido_por: perfil.id,
  }).select("id,tipo,nombre,nota,created_at").single();
  if (error) return fallo(error.message, 500);

  void registrar({
    companyId: id, actor: perfil, accion: "crear", entidad: "evidencia", entidadId: data.id,
    detalle: { tipo: data.tipo, mime: firma.mime, bytes: archivo.size, accion: accionId, documento: assetClave },
    ruta: "/api/companies/evidencia", ip: ipDe(req),
  });
  return ok({ evidencia: data }, 201);
});

/** Marcar una acción como verificada: solo con evidencia encima. */
export const PATCH = protegido<Ctx>({}, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const b = await leerValidado(req, z.object({ action_id: z.string().uuid(), nota: z.string().trim().max(400).optional() }));
  const sb = supabaseAdmin();

  const { data: a } = await sb.from("actions").select("company_id").eq("id", b.action_id).maybeSingle();
  if (!a || a.company_id !== id) return fallo("Esa acción no es de esta empresa.", 404);

  const { count } = await sb.from("evidencias").select("id", { count: "exact", head: true }).eq("action_id", b.action_id);
  if ((count ?? 0) === 0) return fallo("Antes de darla por verificada, sube al menos una prueba de que se hizo.", 400);

  await sb.from("actions").update({
    estado: "hecho", verificado_at: new Date().toISOString(), verificado_por: perfil.id, verificado_nota: b.nota ?? null,
  }).eq("id", b.action_id);

  void registrar({ companyId: id, actor: perfil, accion: "aprobar", entidad: "accion_verificada", entidadId: b.action_id, detalle: { pruebas: count }, ruta: "/api/companies/evidencia", ip: ipDe(req) });
  return ok({ verificada: true, pruebas: count });
});
