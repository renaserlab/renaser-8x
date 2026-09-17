import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

/**
 * SEMILLA: el primer borrador del organigrama sale de lo REAL — los participantes ya levantados
 * (nombre y puesto) — sin una gota de IA. La Gerencia a la cabeza, el resto reportándole,
 * y el consultor reordena con criterio. Solo corre si el organigrama está vacío.
 */
export const POST = protegido<Ctx>({ consultor: true }, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const sb = supabaseAdmin();
  const { count } = await sb.from("org_puestos").select("id", { count: "exact", head: true }).eq("company_id", id);
  if ((count ?? 0) > 0) return fallo("El organigrama ya tiene puestos: la semilla solo siembra en vacío.");
  const { data: parts } = await sb.from("participants").select("nombre,puesto,rol").eq("company_id", id).order("created_at");

  const { data: cima, error: e1 } = await sb.from("org_puestos").insert({
    company_id: id,
    nombre: "Gerencia General",
    mision: "Dirigir el negocio sin operarlo: fijar el rumbo, aprobar los estándares y desarrollar a los encargados.",
    decide: "Todo lo que quede fuera de la matriz de autorización",
    persona: (parts ?? []).find((p) => p.rol === "dueno")?.nombre ?? null,
    orden: 0,
  }).select("id").single();
  if (e1) return fallo(e1.message, 500);

  const resto = (parts ?? []).filter((p) => p.rol !== "dueno");
  let orden = 1;
  const vistos = new Set<string>();
  for (const p of resto) {
    const nombrePuesto = (p.puesto?.trim() || (p.rol === "socio" ? "Socio" : "Puesto por definir")).slice(0, 80);
    const clave = `${nombrePuesto.toLowerCase()}|${p.nombre.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    await sb.from("org_puestos").insert({ company_id: id, nombre: nombrePuesto, persona: p.nombre, reporta_a: cima.id, orden: orden++ });
  }
  return ok({ sembrados: orden });
});
