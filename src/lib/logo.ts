import { supabaseAdmin } from "./supabase/admin";
import { VIGENCIA_LOGO } from "@/app/api/portal/logo/route";

/**
 * La URL firmada del logo caduca. Como guardamos también su ruta, aquí se vuelve a firmar al
 * vuelo: el logo del informe no se rompe solo dentro de un año (hallazgo bajo de la auditoría).
 */
export async function urlDeLogo(ficha: Record<string, string>): Promise<string | null> {
  if (!ficha.logo_ruta) return ficha.logo_url ?? null;
  const { data } = await supabaseAdmin().storage.from("fuentes").createSignedUrl(ficha.logo_ruta, VIGENCIA_LOGO);
  return data?.signedUrl ?? ficha.logo_url ?? null;
}
