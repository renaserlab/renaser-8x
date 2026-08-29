import { supabaseAdmin } from "./supabase/admin";
import { redactarToken } from "./tokens";

/**
 * REGISTRO DE ERRORES (hallazgo medio de la auditoría del 29-08-2026): antes los fallos morían
 * en la consola de Vercel y solo te enterabas porque el cliente llamaba. Ahora quedan en la base
 * y el consultor los ve en su panel. Nunca lanza.
 */
export async function registrarError(e: {
  ruta?: string | null; metodo?: string | null; mensaje: string; detalle?: string | null;
  actorId?: string | null; companyId?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin().from("error_log").insert({
      ruta: e.ruta ?? null,
      metodo: e.metodo ?? null,
      mensaje: redactarToken(e.mensaje).slice(0, 500),
      detalle: e.detalle ? redactarToken(e.detalle).slice(0, 4000) : null,
      actor_id: e.actorId ?? null,
      company_id: e.companyId ?? null,
    });
  } catch {
    // Ni siquiera el registro de errores puede romper la respuesta.
  }
}

export type ErrorRegistrado = { id: number; ruta: string | null; metodo: string | null; mensaje: string; detalle: string | null; created_at: string };

export async function erroresRecientes(limite = 50): Promise<ErrorRegistrado[]> {
  const { data } = await supabaseAdmin().from("error_log").select("id,ruta,metodo,mensaje,detalle,created_at").order("created_at", { ascending: false }).limit(limite);
  return (data ?? []) as ErrorRegistrado[];
}

/** Conteos de las últimas 24 horas. Vive en el servidor: el reloj no se toca durante el render. */
export async function pulso24h(): Promise<{ errores: number; movimientos: number }> {
  const sb = supabaseAdmin();
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: errores }, { count: movimientos }] = await Promise.all([
    sb.from("error_log").select("id", { count: "exact", head: true }).gte("created_at", desde),
    sb.from("audit_log").select("id", { count: "exact", head: true }).gte("created_at", desde),
  ]);
  return { errores: errores ?? 0, movimientos: movimientos ?? 0 };
}
