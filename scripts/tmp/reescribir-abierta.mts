/** Reescribe en lenguaje llano la pregunta con jerga que quedó abierta en Jardín Renaser. */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: c } = await sb.from("companies").select("id").ilike("nombre", "%Jard%Renaser%").single();
const { data: filas } = await sb.from("interview_responses").select("id,pregunta, interview_sessions!inner(company_id)").eq("interview_sessions.company_id", c!.id).is("respuesta", null);
for (const f of filas ?? []) {
  if (/mecanismos|incentivos y retenci/i.test(String(f.pregunta))) {
    await sb.from("interview_responses").update({ pregunta: "¿Qué hace que tus terapeutas y tu personal se queden contigo y no se vayan a otro sitio? (Por ejemplo: el pago, los horarios, el trato, capacitaciones)" }).eq("id", f.id);
    console.log("reescrita:", f.id);
  }
}
console.log("abiertas revisadas:", (filas ?? []).length);
