import { supabaseAdmin } from "@/lib/supabase/admin";
import { correrInvestigador } from "@/lib/ai/agents/investigador";
import { comoDato } from "@/lib/rules/patrones";

type Job = { id: string; company_id: string; payload: Record<string, unknown> };

/**
 * LA TERCERA VISTA (pedido de Kelin): el modelo de alto rendimiento del rubro de ESTA empresa.
 * El Investigador recibe la ficha real (rubro, tamaño, aspiración, diagnóstico, procesos que ya
 * tiene) y devuelve la vara: estándares, estructura tipo, procesos imprescindibles con su detalle
 * mínimo, números de clase mundial, normativa (sin cifras inventadas) y las brechas mayores.
 */
export async function handleModeloAltoRendimiento(job: Job) {
  const sb = supabaseAdmin();
  const [{ data: c }, { data: diag }, { data: procesos }, { data: puestos }, { data: hallazgos }] = await Promise.all([
    sb.from("companies").select("nombre,sector,etapa_negocio,ficha,aspiracion").eq("id", job.company_id).single(),
    sb.from("diagnoses").select("pilar,estado,resumen").eq("company_id", job.company_id),
    sb.from("processes").select("nombre,confirmacion").eq("company_id", job.company_id).eq("version", "as_is"),
    sb.from("org_puestos").select("nombre,persona").eq("company_id", job.company_id),
    sb.from("findings").select("titulo,impacto").eq("company_id", job.company_id).neq("estado_revision", "rechazado").eq("impacto", "alto").limit(8),
  ]);
  if (!c) throw new Error("empresa no encontrada");
  const ficha = (c.ficha ?? {}) as Record<string, string>;

  const contexto = comoDato(
    "LA EMPRESA (para dimensionar el modelo — no es evidencia del rubro)",
    [
      `${c.nombre} · rubro: ${c.sector ?? "sin definir"} · etapa: ${c.etapa_negocio ?? "sin definir"}`,
      `Tamaño: ${ficha.personas ?? "?"} personas, ${ficha.locales ?? "?"} local(es), ${ficha.antiguedad ?? "?"} años. Venta mensual declarada: ${ficha.venta_mensual ?? "sin dato"}. Ciudad: ${ficha.ciudad ?? "?"}.`,
      c.aspiracion ? `CÓMO QUIERE QUE SEA (declarado por la consultoría/gerencia): ${c.aspiracion}` : "ASPIRACIÓN: aún no declarada.",
      (diag ?? []).length ? `DIAGNÓSTICO POR PILAR:\n${(diag ?? []).map((d) => `- ${d.pilar}: ${d.estado}${d.resumen ? ` — ${d.resumen}` : ""}`).join("\n")}` : "",
      (procesos ?? []).length ? `PROCESOS QUE YA TIENE LEVANTADOS (${(procesos ?? []).length}):\n${(procesos ?? []).map((p) => `- ${p.nombre} (${p.confirmacion === "confirmado" ? "confirmado" : "por confirmar"})`).join("\n")}` : "PROCESOS: ninguno levantado.",
      (puestos ?? []).length ? `PUESTOS ACTUALES: ${(puestos ?? []).map((p) => p.nombre).join(", ")}` : "",
      (hallazgos ?? []).length ? `HALLAZGOS CRÍTICOS: ${(hallazgos ?? []).map((h) => h.titulo).join(" · ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
  );

  const r = await correrInvestigador(contexto);
  const { error } = await sb.from("modelo_alto_rendimiento").upsert(
    { company_id: job.company_id, contenido: r.data, updated_at: new Date().toISOString() },
    { onConflict: "company_id" }
  );
  if (error) throw new Error(error.message);
  const { error: eV } = await sb.from("modelo_versiones").insert({ company_id: job.company_id, contenido: r.data });
  if (eV) throw new Error(eV.message);
  return { procesos_imprescindibles: r.data.procesos_imprescindibles.length, brechas: r.data.las_tres_brechas_mayores.length };
}
