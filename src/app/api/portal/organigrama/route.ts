import { protegido, ok, fallo, leerValidado, texto } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { empresaDelCliente } from "@/lib/auth";

/**
 * EL CLIENTE DECLARA SU ESTRUCTURA (pedido de Kelin): cuántos puestos tiene, quién hace qué y
 * quién le responde a quién — desde SU cuenta, con sus palabras. Es la materia prima del estudio
 * de organigrama. origen: 'cliente' — el consultor y el motor saben que esto lo dijo la empresa.
 */
export const GET = protegido({}, async (perfil) => {
  const companyId = await empresaDelCliente(perfil.id);
  if (!companyId) return fallo("Aún no tienes una empresa", 404);
  const { data } = await supabaseAdmin().from("org_puestos").select("id,nombre,mision,persona,reporta_a,origen").eq("company_id", companyId).order("orden").order("created_at");
  return ok({ puestos: data ?? [] });
});

const cuerpo = z.object({
  id: z.string().uuid().optional(),
  nombre: texto(80),
  persona: texto(80).optional().nullable(),
  mision: texto(300).optional().nullable(),
  reporta_a: z.string().uuid().optional().nullable(),
  eliminar: z.boolean().optional(),
});

/** POST: crea, corrige o quita un puesto declarado. El cliente solo toca lo suyo (origen cliente). */
export const POST = protegido({}, async (perfil, req) => {
  const companyId = await empresaDelCliente(perfil.id);
  if (!companyId) return fallo("Aún no tienes una empresa", 404);
  const b = await leerValidado(req, cuerpo);
  const sb = supabaseAdmin();

  if (b.id) {
    const { data: mio } = await sb.from("org_puestos").select("id,origen").eq("id", b.id).eq("company_id", companyId).maybeSingle();
    if (!mio) return fallo("Ese puesto no existe", 404);
    if (mio.origen !== "cliente") return fallo("Ese puesto lo maneja tu consultor: pídele el cambio y lo verá contigo.");
    if (b.eliminar) {
      const { error } = await sb.from("org_puestos").delete().eq("id", b.id);
      if (error) return fallo(error.message, 500);
      return ok({ eliminado: true });
    }
    const { error } = await sb.from("org_puestos").update({ nombre: b.nombre, persona: b.persona ?? null, mision: b.mision ?? null, reporta_a: b.reporta_a ?? null, updated_at: new Date().toISOString() }).eq("id", b.id);
    if (error) return fallo(error.message, 500);
    return ok({ id: b.id });
  }

  if (b.reporta_a) {
    const { data: jefe } = await sb.from("org_puestos").select("id").eq("id", b.reporta_a).eq("company_id", companyId).maybeSingle();
    if (!jefe) return fallo("El puesto al que responde no existe");
  }
  const { data, error } = await sb.from("org_puestos").insert({ company_id: companyId, nombre: b.nombre, persona: b.persona ?? null, mision: b.mision ?? null, reporta_a: b.reporta_a ?? null, origen: "cliente" }).select("id").single();
  if (error) return fallo(error.message, 500);
  return ok({ id: data.id });
});
