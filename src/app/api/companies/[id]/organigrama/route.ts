import { protegido, ok, fallo, leerValidado, exigirAcceso, texto } from "@/lib/api";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { estudioOrganigrama, type Puesto } from "@/lib/rules/organigrama";

type Ctx = { params: Promise<{ id: string }> };

/** GET: los puestos + el estudio (las reglas del porqué). */
export const GET = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const { data } = await supabaseAdmin().from("org_puestos").select("*").eq("company_id", id).order("orden").order("created_at");
  const puestos = (data ?? []) as Puesto[];
  return ok({ puestos, estudio: estudioOrganigrama(puestos) });
});

const cuerpoPuesto = z.object({
  nombre: texto(80),
  mision: texto(300).optional().nullable(),
  decide: texto(300).optional().nullable(),
  persona: texto(80).optional().nullable(),
  respaldo: texto(80).optional().nullable(),
  reporta_a: z.string().uuid().optional().nullable(),
  por_que: texto(400).optional().nullable(),
});

/** POST: crear un puesto. body: { nombre, mision?, decide?, persona?, respaldo?, reporta_a?, por_que? } */
export const POST = protegido<Ctx>({ consultor: true }, async (_p, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerValidado(req, cuerpoPuesto);
  const sb = supabaseAdmin();
  if (b.reporta_a) {
    const { data: jefe } = await sb.from("org_puestos").select("id").eq("id", b.reporta_a).eq("company_id", id).maybeSingle();
    if (!jefe) return fallo("El puesto al que reporta no existe en esta empresa");
  }
  const { data, error } = await sb.from("org_puestos").insert({ company_id: id, ...b }).select("*").single();
  if (error) return fallo(error.message, 500);
  return ok({ puesto: data });
});
