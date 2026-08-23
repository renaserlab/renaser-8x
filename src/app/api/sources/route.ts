import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";

const MAX_MB = 30;

function tipoDesdeMime(mime: string, nombre: string): "documento" | "foto" | "audio" | "dato" {
  if (mime.startsWith("image/")) return "foto";
  if (mime.startsWith("audio/") || /\.(ogg|opus|m4a|mp3|wav|webm)$/i.test(nombre)) return "audio";
  if (mime.includes("csv") || mime.includes("spreadsheet") || mime.includes("excel") || /\.(csv|xlsx?)$/i.test(nombre)) return "dato";
  return "documento";
}

/** multipart: company_id, archivo (File) | texto, nombre?, fecha_origen?, tipo? */
export const POST = protegido({}, async (perfil, req) => {
  const form = await req.formData();
  const companyId = String(form.get("company_id") ?? "");
  if (!companyId) return fallo("Falta la empresa.");
  await exigirAcceso(perfil, companyId);
  const sb = supabaseAdmin();
  const origen = perfil.rol === "consultor" ? "consultor" : "cliente";
  const fecha = String(form.get("fecha_origen") ?? "") || null;
  const archivo = form.get("archivo");
  const texto = String(form.get("texto") ?? "").trim();
  let nombre = String(form.get("nombre") ?? "").trim();

  let row: { id: string } | null = null;
  if (archivo instanceof File) {
    if (archivo.size > MAX_MB * 1024 * 1024) return fallo(`El archivo pesa más de ${MAX_MB} MB. Divídelo o súbelo como fotos.`);
    const mime = archivo.type || "application/octet-stream";
    const tipo = (String(form.get("tipo") ?? "") || tipoDesdeMime(mime, archivo.name)) as "documento" | "foto" | "audio" | "dato";
    if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mime === "application/msword") {
      return fallo("No pudimos leer ese Word. Expórtalo a PDF y súbelo de nuevo.");
    }
    if (tipo === "dato" && !mime.includes("csv") && !mime.startsWith("text/")) {
      return fallo("No pudimos leer ese Excel. Guárdalo como CSV (Archivo → Guardar como → CSV) y súbelo de nuevo.");
    }
    nombre = nombre || archivo.name;
    const path = `${companyId}/${Date.now()}-${archivo.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error: e1 } = await sb.storage.from("fuentes").upload(path, archivo, { contentType: mime, upsert: false });
    if (e1) return fallo(`No pudimos guardar el archivo: ${e1.message}`, 500);
    const { data, error } = await sb.from("sources").insert({ company_id: companyId, tipo, nombre, fecha_origen: fecha, storage_path: path, mime, origen }).select("id").single();
    if (error) return fallo(error.message, 500);
    row = data;
  } else if (texto) {
    const tipo = (String(form.get("tipo") ?? "") || "observacion") as string;
    nombre = nombre || `Nota del ${new Date().toLocaleDateString("es-PE")}`;
    const { data, error } = await sb.from("sources").insert({ company_id: companyId, tipo, nombre, fecha_origen: fecha ?? new Date().toISOString().slice(0, 10), contenido: texto, mime: "text/plain", origen }).select("id").single();
    if (error) return fallo(error.message, 500);
    row = data;
  } else {
    return fallo("Sube un archivo o escribe un texto.");
  }

  const job = await encolar({ company_id: companyId, tipo: "extraer", payload: { source_id: row!.id }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer-raiz", row!.id]) });
  if ((await sb.from("companies").select("etapa").eq("id", companyId).single()).data?.etapa === "admision") {
    await sb.from("companies").update({ etapa: "levantamiento" }).eq("id", companyId);
  }
  return ok({ source_id: row!.id, job_id: job.id }, 201);
});
