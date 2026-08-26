/** Corre el handler real (genera + GUARDA) para Jardín Renaser. */
import { createClient } from "@supabase/supabase-js";
import { handlePlanEstrategico } from "../../src/lib/jobs/handlers/plan";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: c } = await sb.from("companies").select("id").ilike("nombre", "%Jard%Renaser%").single();
const t0 = Date.now();
const r = await handlePlanEstrategico({ id: "job-manual-plan", company_id: c!.id, payload: {} });
console.log(`OK en ${((Date.now() - t0) / 1000).toFixed(0)}s →`, JSON.stringify(r));
const { data: d } = await sb.from("deliverables").select("version,created_at").eq("company_id", c!.id).eq("tipo", "plan_estrategico").order("version", { ascending: false }).limit(1);
console.log("guardado:", JSON.stringify(d));
