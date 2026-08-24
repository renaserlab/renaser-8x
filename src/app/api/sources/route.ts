import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";
import { validarArchivo, rutaStorage } from "@/lib/archivos";
import { hayTranscriptor } from "@/lib/ai";

const TIPOS_TEXTO = new Set(["documento", "observacion", "dato"]);

/** multipart: company_id, archivo (File) | texto, nombre?, fecha_origen?, tipo?  ·  14.2: MIME, extensión, tamaño, nombre y ruta validados en código. */
export const POST = protegido({}, async (perfil, req) => {
  const form = await req.formData();
  const companyId = String(form.get("company_id") ?? "");
  if (!companyId) return fallo("Falta la empresa.");
  await exigirAcceso(perfil, companyId);
  const sb = supabaseAdmin();
  const origen = perfil.rol === "consultor" ? "consultor" : "cliente";
  const fecha = String(form.get("fecha_origen") ?? "") || null;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fallo("La fecha no es válida.");
  const archivo = form.get("archivo");
  const processId = String(form.get("process_id") ?? "") || null;
  const processNodeId = String(form.get("process_node_id") ?? "") || null;
  if (processId) {
    const { data: pr } = await sb.from("processes").select("company_id").eq("id", processId).maybeSingle();
    if (!pr || pr.company_id !== companyId) return fallo("Ese proceso no es de esta empresa.", 404);
  }
  const texto = String(form.get("texto") ?? "").trim();
  let nombre = String(form.get("nombre") ?? "").trim().slice(0, 160);

  let row: { id: string } | null = null;
  if (archivo instanceof File) {
    const v = validarArchivo({ nombre: archivo.name, mime: archivo.type, bytes: archivo.size });
    if (!v.ok) return fallo(v.error);
    if (v.tipo === "audio" && !hayTranscriptor()) return fallo("Por ahora no podemos escuchar audios. Escribe lo que dice la nota o usa el micrófono del navegador.");
    nombre = nombre || v.nombre;
    const path = rutaStorage(companyId, v.nombre);
    const { error: e1 } = await sb.storage.from("fuentes").upload(path, archivo, { contentType: v.mime, upsert: false });
    if (e1) return fallo(`No pudimos guardar el archivo: ${e1.message}`, 500);
    const { data, error } = await sb.from("sources").insert({ company_id: companyId, tipo: v.tipo, nombre, fecha_origen: fecha, storage_path: path, mime: v.mime, origen, process_id: processId, process_node_id: processNodeId }).select("id").single();
    if (error) return fallo(error.message, 500);
    row = data;
  } else if (texto) {
    if (texto.length > 200_000) return fallo("El texto es demasiado largo. Súbelo como archivo.");
    const tipoPedido = String(form.get("tipo") ?? "");
    const tipo = TIPOS_TEXTO.has(tipoPedido) ? tipoPedido : "observacion";
    nombre = nombre || `Nota del ${new Date().toLocaleDateString("es-PE")}`;
    const { data, error } = await sb.from("sources").insert({ company_id: companyId, tipo, nombre, fecha_origen: fecha ?? new Date().toISOString().slice(0, 10), contenido: texto, mime: "text/plain", origen }).select("id").single();
    if (error) return fallo(error.message, 500);
    row = data;
  } else {
    return fallo("Sube un archivo o escribe un texto.");
  }

  const job = await encolar({ company_id: companyId, tipo: "extraer", payload: { source_id: row!.id }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer-raiz", row!.id]) });
  await sb.from("companies").update({ etapa: "levantamiento" }).eq("id", companyId).eq("etapa", "admision");
  return ok({ source_id: row!.id, job_id: job.id }, 201);
});
