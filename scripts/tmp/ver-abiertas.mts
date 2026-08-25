/** Diagnóstico del bug: preguntas de Jardín Renaser (abiertas y últimas 25), con sesión, bloque y hora. */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: c } = await sb.from("companies").select("id").ilike("nombre", "%Jard%Renaser%").single();
const { data: filas } = await sb
  .from("interview_responses")
  .select("id,pregunta,respuesta,bloque,orden,created_at, interview_sessions!inner(tipo,company_id)")
  .eq("interview_sessions.company_id", c!.id)
  .order("created_at", { ascending: false })
  .limit(25);
for (const f of filas ?? []) {
  const s = f.interview_sessions as unknown as { tipo: string };
  console.log(`${f.respuesta ? "  resp" : "ABIERTA"} · ${s.tipo} · [${f.bloque}] · ${String(f.created_at).slice(5, 16)} · ${String(f.pregunta).slice(0, 110)}`);
}
