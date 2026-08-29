import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaDelCliente } from "@/lib/auth";

export const maxDuration = 30;

/**
 * LOGO DE LA EMPRESA: se guarda en el bucket publico y su URL vive en la ficha (sin migracion).
 * Sale impreso en el informe y en los documentos que el dueno descarga.
 */
export const POST = protegido({}, async (perfil, req) => {
  const companyId = await empresaDelCliente(perfil.id);
  if (!companyId) return fallo("Todavia no tienes empresa.", 404);
  const form = await req.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return fallo("Falta el archivo.");
  if (archivo.size > 2 * 1024 * 1024) return fallo("El logo debe pesar menos de 2 MB.");
  if (!/^image\//.test(archivo.type)) return fallo("El logo debe ser una imagen (PNG, JPG o SVG).");

  const sb = supabaseAdmin();
  const ext = (archivo.name.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
  const ruta = `${companyId}/logo.${ext}`;
  const { error } = await sb.storage.from("fuentes").upload(ruta, archivo, { contentType: archivo.type, upsert: true });
  if (error) return fallo("No pudimos guardar el logo. Intenta de nuevo.", 500);

  const { data: firmada } = await sb.storage.from("fuentes").createSignedUrl(ruta, 60 * 60 * 24 * 365);
  const url = firmada?.signedUrl;
  if (!url) return fallo("No pudimos preparar el logo.", 500);

  const { data: empresa } = await sb.from("companies").select("ficha").eq("id", companyId).single();
  const ficha = { ...((empresa?.ficha ?? {}) as Record<string, string>), logo_url: url };
  await sb.from("companies").update({ ficha }).eq("id", companyId);
  return ok({ url });
});
