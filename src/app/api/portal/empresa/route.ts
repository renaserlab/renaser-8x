import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaDelCliente } from "@/lib/auth";
import { clasificarModelo, etapaDe } from "@/lib/rules/matrices";

type Ficha = { actividad?: string; antiguedad?: string; personas?: string; locales?: string; cliente_tipo?: string; venta_mensual?: string; documentacion?: string; productos?: string; canales?: string; ciudad?: string; whatsapp?: string };

const limpiarFicha = (f: Ficha | undefined): Record<string, string> | null => {
  if (!f) return null;
  const out: Record<string, string> = {};
  // ciudad y whatsapp: la información BASE de la persona (contacto y territorio) — sin esto el
  // diagnóstico flota sin dueño ni lugar, y RENASER no puede escribirle.
  for (const k of ["actividad", "antiguedad", "personas", "locales", "cliente_tipo", "venta_mensual", "documentacion", "productos", "canales", "ciudad", "whatsapp"] as const) {
    const v = (f[k] ?? "").toString().trim().slice(0, 300);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
};

/**
 * Alta autoservicio (bloqueador 6): el amigo que recibe el enlace crea SU empresa sin consultor.
 * body: { nombre, sector?, ficha? } → empresa (+ ficha de enrutamiento + clasificación por modelo operativo)
 * + membresía de dueño + participante dueño + sesiones de conversación.
 * Solo para usuarios cliente sin empresa (una empresa por cuenta en V1).
 */
export const POST = protegido({}, async (perfil, req) => {
  if (perfil.rol === "consultor") return fallo("Como consultor, crea empresas desde tu bandeja.");
  const existente = await empresaDelCliente(perfil.id);
  if (existente) return fallo("Ya tienes una empresa en 8X.");
  const b = await leerJSON<{ nombre?: string; sector?: string; ficha?: Ficha }>(req);
  const nombre = (b.nombre ?? "").trim();
  if (nombre.length < 2) return fallo("Cuéntanos el nombre de tu empresa.");
  const sb = supabaseAdmin();
  // IDEMPOTENTE: si esta cuenta ya tiene su empresa, se devuelve esa — un doble envío (o una pantalla
  // que no avanzó y se reintentó) jamás vuelve a crear otra empresa (caso real: 3 duplicadas en un registro).
  const { data: yaTiene } = await sb.from("memberships").select("company_id").eq("user_id", perfil.id).order("company_id").limit(1).maybeSingle();
  if (yaTiene) return ok({ company_id: yaTiene.company_id, existente: true }, 200);
  const ficha = limpiarFicha(b.ficha);
  const sector = (b.sector ?? "").trim().slice(0, 120) || ficha?.actividad?.slice(0, 120) || null;
  const modelos = clasificarModelo([sector, ficha?.actividad, ficha?.productos, ficha?.canales]);
  const anios = ficha?.antiguedad ? parseFloat(ficha.antiguedad.replace(",", ".")) : null;
  const { data: c, error } = await sb
    .from("companies")
    // Autoservicio SIN puertas: la empresa nace admitida y en levantamiento — nadie espera a un consultor para empezar.
    .insert({ nombre: nombre.slice(0, 120), sector, ficha, modelo_operativo: modelos.length ? modelos : null, etapa_negocio: etapaDe(anios), estado_admision: "admitida", etapa: "levantamiento" })
    .select("id")
    .single();
  if (error) return fallo(error.message, 500);
  await sb.from("memberships").upsert({ user_id: perfil.id, company_id: c!.id, nivel: "dueno" });
  const { data: dueno } = await sb.from("participants").insert({ company_id: c!.id, nombre: perfil.nombre ?? "Dueño", puesto: "Dueño", rol: "dueno", user_id: perfil.id }).select("id").single();
  if (dueno) {
    await sb.from("interview_sessions").insert([
      { company_id: c!.id, participant_id: dueno.id, tipo: "sueno_dueno" },
      { company_id: c!.id, participant_id: dueno.id, tipo: "empresa_dueno" },
    ]);
  }
  return ok({ company_id: c!.id }, 201);
});
