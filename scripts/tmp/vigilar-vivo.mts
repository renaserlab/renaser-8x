/** Snapshot de la actividad en vivo: qué llena Darren, respuestas recientes, salud de la cola. */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DARREN = "32e3dd7e-3e0b-492e-bf16-566fc7fd48c7";
const { data: m } = await sb.from("memberships").select("company_id, companies(nombre)").eq("user_id", DARREN);
console.log("empresas de darren:", JSON.stringify(m));
const hace30 = new Date(Date.now() - 30 * 60_000).toISOString();
const { data: resp } = await sb
  .from("interview_responses")
  .select("session_id,pregunta,respuesta,respondido_at, interview_sessions!inner(company_id,tipo)")
  .gte("respondido_at", hace30)
  .order("respondido_at", { ascending: false })
  .limit(8);
console.log("respuestas últimos 30 min:", (resp ?? []).length);
for (const r of resp ?? []) console.log(` · [${(r.interview_sessions as unknown as { tipo: string }).tipo}] ${r.pregunta?.slice(0, 80)} → ${String(r.respuesta).slice(0, 60)}`);
const { data: jobs } = await sb.from("jobs").select("tipo,estado,error,intentos,created_at,company_id").order("created_at", { ascending: false }).limit(12);
console.log("cola:", JSON.stringify((jobs ?? []).map((j) => ({ t: j.tipo, e: j.estado, err: j.error?.slice(0, 60) ?? null, seg: Math.round((Date.now() - new Date(j.created_at).getTime()) / 1000) }))));
