/** Genera el Plan Estratégico de Jardín Renaser con el estratega real y valida su honestidad. */
import { createClient } from "@supabase/supabase-js";
import { handlePlanEstrategico } from "../../src/lib/jobs/handlers/plan";
import type { SalidaPlanEstrategico } from "../../src/lib/schemas";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: c } = await sb.from("companies").select("id").ilike("nombre", "%Jard%Renaser%").single();
const t0 = Date.now();
const r = await handlePlanEstrategico({ id: "job-plan-est", company_id: c!.id, payload: {} });
console.log(`generado en ${((Date.now() - t0) / 1000).toFixed(0)}s ·`, JSON.stringify(r));
const { data: d } = await sb.from("deliverables").select("contenido").eq("company_id", c!.id).eq("tipo", "plan_estrategico").order("version", { ascending: false }).limit(1).single();
const p = d!.contenido as SalidaPlanEstrategico;
console.log("\nDESAFÍO:", p.desafio);
console.log("DECISIÓN: Pasar de", p.resumen.decision.de, "→", p.resumen.decision.a, "mediante", p.resumen.decision.mediante);
console.log("RENUNCIAS:", p.resumen.renuncias.join(" | "));
console.log("PROBLEMAS:", p.problemas.map((x) => x.titulo).join(" | "));
console.log("CUELLO:", p.cuello);
console.log("CANVAS estados:", Object.entries(p.canvas).map(([k, v]) => `${k}:${(v as { estado: string }).estado}`).join(" "));
console.log("RADIOGRAFÍA:", p.radiografia.map((x) => `${x.indicador}=${x.base}`).join(" | "));
console.log("PRIORIDADES resp:", p.prioridades.map((x) => x.responsable).join(" | "));
console.log("NOTA CONFIANZA:", p.nota_confianza);
const chk = {
  "máx 3 problemas": p.problemas.length <= 3,
  "renuncias reales (3)": p.resumen.renuncias.length === 3,
  "canvas con por_validar (honesto)": Object.values(p.canvas).some((v) => (v as { estado: string }).estado === "por_validar"),
  "sin jerga hueca": !/sinergia|hol[íi]stico de clase mundial|world.class/i.test(JSON.stringify(p)),
  "nota de confianza sustantiva": p.nota_confianza.length > 80,
};
for (const [k, v] of Object.entries(chk)) console.log(v ? "PASS" : "FAIL", "·", k);
