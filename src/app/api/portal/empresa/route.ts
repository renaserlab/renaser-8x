import { protegido, ok, fallo, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaDelCliente } from "@/lib/auth";
import { clasificarModelo, etapaDe } from "@/lib/rules/matrices";
import { encolar, PRIORIDAD, claveIdempotente } from "@/lib/jobs/queue";

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
    const { data: sesiones } = await sb
      .from("interview_sessions")
      .insert([
        { company_id: c!.id, participant_id: dueno.id, tipo: "sueno_dueno" },
        { company_id: c!.id, participant_id: dueno.id, tipo: "empresa_dueno" },
      ])
      .select("id,tipo");
    // ARRANQUE EN CALIENTE: la primera pregunta se genera AHORA, mientras la persona todavía está
    // mirando su portal recién creado — al abrir Conversar la espera lista, no un spinner.
    const primera = (sesiones ?? []).find((s) => s.tipo === "sueno_dueno");
    if (primera) {
      await encolar({ company_id: c!.id, tipo: "entrevista_siguiente", payload: { session_id: primera.id }, prioridad: PRIORIDAD.entrevista, idempotency_key: claveIdempotente(["siguiente", primera.id, "arranque"]) });
    }
  }
  return ok({ company_id: c!.id }, 201);
});

/**
 * CORREGIR MIS DATOS (pedido de Kelin: "imagina que me equivoqué al poner nombres — todo debe ser
 * fácil de corregir"): el dueño edita el nombre y su ficha; el sector y la clasificación se recalculan.
 */
export const PATCH = protegido({}, async (perfil, req) => {
  const companyId = await empresaDelCliente(perfil.id);
  if (!companyId) return fallo("Todavía no tienes empresa.", 404);
  const b = await leerJSON<{ nombre?: string; ficha?: Ficha }>(req);
  const sb = supabaseAdmin();
  const { data: actual } = await sb.from("companies").select("ficha,nombre").eq("id", companyId).single();
  const fichaNueva = { ...((actual?.ficha as Record<string, string>) ?? {}), ...(limpiarFicha(b.ficha) ?? {}) };
  const nombre = (b.nombre ?? "").trim();
  const cambios: Record<string, unknown> = { ficha: fichaNueva };
  if (nombre.length >= 2) cambios.nombre = nombre.slice(0, 120);
  if (fichaNueva.actividad) cambios.sector = fichaNueva.actividad.slice(0, 120);
  const modelos = clasificarModelo([fichaNueva.actividad, fichaNueva.productos, fichaNueva.canales]);
  if (modelos.length) cambios.modelo_operativo = modelos;
  if (fichaNueva.antiguedad) cambios.etapa_negocio = etapaDe(parseFloat(fichaNueva.antiguedad.replace(",", ".")));
  const { error } = await sb.from("companies").update(cambios).eq("id", companyId);
  if (error) return fallo(error.message, 500);
  return ok({ company_id: companyId, actualizada: true });
});
