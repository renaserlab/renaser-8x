import { supabaseAdmin } from "./supabase/admin";
import type { Perfil } from "./auth";

export type Accion = "ver" | "crear" | "editar" | "eliminar" | "publicar" | "aprobar" | "descargar" | "entrar" | "salir";

type Entrada = {
  companyId?: string | null;
  actor?: Perfil | null;
  accion: Accion;
  entidad?: string | null;
  entidadId?: string | null;
  detalle?: Record<string, unknown>;
  ruta?: string | null;
  ip?: string | null;
};

/**
 * EL RASTRO: quién hizo qué, cuándo y sobre qué empresa. Hallazgo crítico de la auditoría del
 * 29-08-2026: sin esto nadie podía responder "¿quién vio o cambió los datos de mi empresa?".
 * Nunca lanza: un fallo al registrar no puede tumbar la operación del usuario.
 */
export async function registrar(e: Entrada): Promise<void> {
  try {
    await supabaseAdmin().from("audit_log").insert({
      company_id: e.companyId ?? null,
      actor_id: e.actor?.id ?? null,
      actor_rol: e.actor?.rol ?? null,
      accion: e.accion,
      entidad: e.entidad ?? null,
      entidad_id: e.entidadId ?? null,
      detalle: e.detalle ?? {},
      ruta: e.ruta ?? null,
      ip: e.ip ?? null,
    });
  } catch {
    // El rastro es importante, pero jamás más importante que la operación del dueño.
  }
}

/** La IP real detrás del proxy de Vercel, sin quedarnos con la cadena entera. */
export function ipDe(req: Request): string | null {
  const h = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  return h ? h.split(",")[0]!.trim().slice(0, 45) : null;
}

/** POST crea, PATCH/PUT editan, DELETE elimina. GET se registra solo donde importa (informes). */
export function accionDeMetodo(metodo: string): Accion | null {
  if (metodo === "POST") return "crear";
  if (metodo === "PATCH" || metodo === "PUT") return "editar";
  if (metodo === "DELETE") return "eliminar";
  return null;
}

export type Rastro = {
  id: number; accion: string; entidad: string | null; ruta: string | null;
  actor_rol: string | null; created_at: string; detalle: Record<string, unknown>;
  actor?: { nombre: string | null; email: string | null } | null;
};

/** El historial de una empresa, para que el dueño y el consultor lo vean. */
export async function rastroDeEmpresa(companyId: string, limite = 100): Promise<Rastro[]> {
  const { data } = await supabaseAdmin()
    .from("audit_log")
    .select("id,accion,entidad,ruta,actor_rol,created_at,detalle,actor:users!audit_log_actor_id_fkey(nombre,email)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limite);
  return (data ?? []) as unknown as Rastro[];
}
