/** Limpieza puntual: borra preguntas ABIERTAS (sin respuesta) que repiten una ya respondida o a otra abierta. */
import { createClient } from "@supabase/supabase-js";
import { preguntaRepetida } from "../../src/lib/jobs/handlers/entrevista";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: c } = await sb.from("companies").select("id,nombre").ilike("nombre", "%Jard%Renaser%").single();
if (!c) throw new Error("empresa no encontrada");
const { data: filas } = await sb.from("interview_responses").select("id,pregunta,respuesta,orden, interview_sessions!inner(company_id,tipo)").eq("interview_sessions.company_id", c.id).order("orden");
const respondidas = (filas ?? []).filter((f) => f.respuesta).map((f) => String(f.pregunta));
const abiertas = (filas ?? []).filter((f) => !f.respuesta);
const conservadas: string[] = [];
let borradas = 0;
for (const a of abiertas) {
  if (preguntaRepetida(String(a.pregunta), [...respondidas, ...conservadas])) {
    await sb.from("interview_responses").delete().eq("id", a.id);
    borradas++;
    console.log("borrada:", String(a.pregunta).slice(0, 90));
  } else conservadas.push(String(a.pregunta));
}
console.log(`${c.nombre}: ${borradas} repetidas borradas, ${conservadas.length} abiertas conservadas`);
