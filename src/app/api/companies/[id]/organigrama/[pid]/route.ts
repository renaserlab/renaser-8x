import { protegido, ok, fallo, leerValidado, texto } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { tieneCiclo, type Puesto } from "@/lib/rules/organigrama";

type Ctx = { params: Promise<{ id: string; pid: string }> };

const cambios = z.object({
  nombre: texto(80).optional(),
  mision: texto(300).optional().nullable(),
  decide: texto(300).optional().nullable(),
  persona: texto(80).optional().nullable(),
  respaldo: texto(80).optional().nullable(),
  reporta_a: z.string().uuid().optional().nullable(),
  por_que: texto(400).optional().nullable(),
});

/** PATCH: editar un puesto. Un cambio de jefe que arme un ciclo se rechaza ANTES de guardar. */
export const PATCH = protegido<Ctx>({ consultor: true }, async (_p, req, ctx) => {
  const { id, pid } = await ctx.params;
  const b = await leerValidado(req, cambios);
  const sb = supabaseAdmin();
  const { data: todos } = await sb.from("org_puestos").select("id,reporta_a").eq("company_id", id);
  if (!(todos ?? []).some((x) => x.id === pid)) return fallo("Puesto no encontrado", 404);
  if (b.reporta_a !== undefined) {
    if (b.reporta_a === pid) return fallo("Un puesto no puede reportarse a sí mismo");
    const simulados = (todos ?? []).map((x) => ({ ...x, nombre: "", reporta_a: x.id === pid ? b.reporta_a : x.reporta_a })) as Puesto[];
    if (tieneCiclo(simulados)) return fallo("Ese cambio arma un ciclo de reporte: alguien terminaría reportándose a sí mismo.");
  }
  const { error } = await sb.from("org_puestos").update({ ...b, updated_at: new Date().toISOString() }).eq("id", pid);
  if (error) return fallo(error.message, 500);
  return ok({ id: pid });
});

export const DELETE = protegido<Ctx>({ consultor: true }, async (_p, _req, ctx) => {
  const { id, pid } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("org_puestos").select("id").eq("id", pid).eq("company_id", id).maybeSingle();
  if (!p) return fallo("Puesto no encontrado", 404);
  // Los que le reportaban quedan sin jefe (SET NULL): el estudio lo señalará — nada se rompe en silencio.
  const { error } = await sb.from("org_puestos").delete().eq("id", pid);
  if (error) return fallo(error.message, 500);
  return ok({ eliminado: true });
});
