import { randomUUID } from "crypto";
import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { exigirOS } from "@/lib/os/acceso";
import { validarEntregable } from "@/lib/os/dia";

const BUCKET = "os-entregables";

/**
 * SUBIR UN ENTREGABLE (multipart: titulo, archivo, tarea_id?). El archivo va al bucket privado os-entregables, en
 * <empresa>/<persona>/<uuid>-<nombre>: la ruta la arma el servidor, nunca el navegador. Si la fila no se pudo guardar,
 * el archivo se borra para no dejar huérfanos. La tarea, si viene, tiene que ser de quien sube.
 */
export const POST = protegido({ entidad: "os_entregables", cupo: "subida" }, async (perfil, req) => {
  const c = await exigirOS(perfil, { persona: true });
  const persona = c.persona!;
  const form = await req.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return fallo("Elige el archivo que vas a entregar.");
  const titulo = String(form.get("titulo") ?? "").trim().slice(0, 200) || archivo.name.slice(0, 200);
  const tareaId = String(form.get("tarea_id") ?? "").trim() || null;
  const v = validarEntregable({ nombre: archivo.name, bytes: archivo.size });
  if (!v.ok) return fallo(v.error);
  const sb = supabaseAdmin();
  if (tareaId) {
    const { data: t } = await sb.from("os_tareas").select("id").eq("id", tareaId).eq("company_id", c.companyId).eq("persona_id", persona.id).maybeSingle();
    if (!t) return fallo("Esa tarea no es tuya.", 404);
  }
  const ruta = `${c.companyId}/${persona.id}/${randomUUID()}-${v.nombre}`;
  const { error: e1 } = await sb.storage.from(BUCKET).upload(ruta, archivo, { contentType: v.mime, upsert: false });
  if (e1) throw new Error(e1.message);
  const { data, error } = await sb
    .from("os_entregables")
    .insert({ company_id: c.companyId, persona_id: persona.id, tarea_id: tareaId, titulo, ruta, mime: v.mime, tamano: archivo.size })
    .select("id")
    .single();
  if (error) {
    await sb.storage.from(BUCKET).remove([ruta]);
    throw new Error(error.message);
  }
  return ok({ id: data.id }, 201);
});
