/** ¿Qué está viviendo Kelin AHORA? Últimas preguntas creadas en toda la base, con empresa y hora. */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await sb
  .from("interview_responses")
  .select("pregunta,respuesta,bloque,created_at, interview_sessions!inner(tipo, companies!inner(nombre))")
  .order("created_at", { ascending: false })
  .limit(20);
for (const f of data ?? []) {
  const s = f.interview_sessions as unknown as { tipo: string; companies: { nombre: string } };
  console.log(`${String(f.created_at).slice(5, 16)} · ${s.companies.nombre.slice(0, 22)} · ${s.tipo} · ${f.respuesta ? "resp" : "ABIERTA"} · ${String(f.pregunta).slice(0, 95)}`);
}
