import { protegido, ok, leerJSON } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encolar, PRIORIDAD } from "@/lib/jobs/queue";
import { suficienciaDeEmpresa } from "@/lib/bandeja";

type Ctx = { params: Promise<{ id: string }> };

/** body: { pilar?: string, forzar?: boolean } → un job por pilar (o el indicado). */
export const POST = protegido<Ctx>({ consultor: true, cupo: "ia" }, async (_p, req, ctx) => {
  const { id } = await ctx.params;
  const b = await leerJSON<{ pilar?: string; forzar?: boolean }>(req);
  // Condiciones de suficiencia (P1-04): se avisa; el consultor puede forzar.
  const suf = await suficienciaDeEmpresa(id);
  if (!suf.completo && !b.forzar) return ok({ jobs: [], bloqueado: true, motivos: suf.motivos, error: `Todavía no es suficiente: ${suf.motivos.join("; ")}. Puedes forzar el diagnóstico, pero saldrá DESCONOCIDO donde falte.` }, 409);
  const pilares = b.pilar ? [b.pilar] : ["personas", "procesos", "producto", "marketing"];
  const jobs = [];
  for (const pilar of pilares) {
    jobs.push(await encolar({ company_id: id, tipo: "diagnosticar", payload: { pilar, forzar: !!b.forzar }, prioridad: PRIORIDAD.diagnosticar }));
  }
  await supabaseAdmin().from("companies").update({ etapa: "diagnostico" }).eq("id", id).in("etapa", ["levantamiento", "contraste"]);
  return ok({ jobs: jobs.map((j) => j.id) });
});
