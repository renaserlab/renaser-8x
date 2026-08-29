import { protegido, ok, fallo } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaDelCliente } from "@/lib/auth";
import { registrar, ipDe } from "@/lib/auditoria";

export const maxDuration = 30;

/**
 * LOGO DE LA EMPRESA. Sale impreso en el informe y en los documentos que el dueño descarga.
 *
 * Auditoría del 29-08-2026: antes se aceptaba cualquier cosa que el navegador DIJERA que era una
 * imagen, SVG incluido (un SVG puede llevar script dentro). Ahora la lista es cerrada y el tipo se
 * comprueba leyendo los primeros bytes del archivo, que el navegador no puede falsear.
 */
const FIRMAS: { tipo: string; ext: string; prueba: (b: Uint8Array) => boolean }[] = [
  { tipo: "image/png", ext: "png", prueba: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { tipo: "image/jpeg", ext: "jpg", prueba: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { tipo: "image/webp", ext: "webp", prueba: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
];

/** Un año menos un día: la URL se vuelve a firmar sola en cada carga del informe. */
export const VIGENCIA_LOGO = 60 * 60 * 24 * 364;

export const POST = protegido({ cupo: "subida" }, async (perfil, req) => {
  const companyId = await empresaDelCliente(perfil.id);
  if (!companyId) return fallo("Todavía no tienes empresa.", 404);

  const form = await req.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return fallo("Falta el archivo.");
  if (archivo.size > 2 * 1024 * 1024) return fallo("El logo debe pesar menos de 2 MB.");

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const firma = FIRMAS.find((f) => f.prueba(bytes));
  if (!firma) return fallo("El logo debe ser una imagen PNG, JPG o WebP.");

  const sb = supabaseAdmin();
  const ruta = `${companyId}/logo.${firma.ext}`;
  const { error } = await sb.storage.from("fuentes").upload(ruta, bytes, { contentType: firma.tipo, upsert: true });
  if (error) return fallo("No pudimos guardar el logo. Intenta de nuevo.", 500);

  const { data: firmada } = await sb.storage.from("fuentes").createSignedUrl(ruta, VIGENCIA_LOGO);
  if (!firmada?.signedUrl) return fallo("No pudimos preparar el logo.", 500);

  const { data: empresa } = await sb.from("companies").select("ficha").eq("id", companyId).single();
  // Se guarda TAMBIÉN la ruta: la URL firmada caduca, la ruta no. Así el logo se puede volver a
  // firmar cuando haga falta en vez de romperse en silencio dentro de un año.
  const ficha = { ...((empresa?.ficha ?? {}) as Record<string, string>), logo_url: firmada.signedUrl, logo_ruta: ruta };
  await sb.from("companies").update({ ficha }).eq("id", companyId);

  void registrar({ companyId, actor: perfil, accion: "editar", entidad: "logo", detalle: { tipo: firma.tipo, bytes: archivo.size }, ruta: "/api/portal/logo", ip: ipDe(req) });
  return ok({ url: firmada.signedUrl });
});
