import { createClient } from "@supabase/supabase-js";
import { generarToken, hashToken, expiracionPorDefecto, MAX_USOS_TOKEN } from "../../src/lib/tokens";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const URL_PUB = "https://8x-renaser-s-projects.vercel.app";
await sb.from("companies").delete().eq("nombre", "PRUEBA INACTIVIDAD 8X");
const { data: co } = await sb.from("companies").insert({ nombre: "PRUEBA INACTIVIDAD 8X", sector: "pruebas" }).select("id").single();
const token = generarToken();
const { data: p } = await sb.from("participants").insert({ company_id: co!.id, nombre: "Inactividad", puesto: "Vendedor", rol: "empleado", token_hash: hashToken(token), token_expira_at: expiracionPorDefecto(), token_usos: 0, token_max_usos: MAX_USOS_TOKEN, token_canjeado_at: null }).select("id").single();
await sb.from("interview_sessions").insert([{ company_id: co!.id, participant_id: p!.id, tipo: "personal" }]);
console.log(new Date().toISOString(), "listo; 8 minutos de inactividad, CERO node worker en la máquina");
await new Promise((r) => setTimeout(r, 8 * 60_000));
const t0 = Date.now();
const canje = await fetch(`${URL_PUB}/api/participar/canjear`, { method: "POST", headers: { "x-participante-token": token } });
const js = (await canje.json()) as { token_sesion?: string };
if (!js.token_sesion) throw new Error("canje falló");
await fetch(`${URL_PUB}/api/participar`, { headers: { "x-participante-token": js.token_sesion } });
console.log(new Date().toISOString(), "acción pública hecha → esperando a la nube…");
let creado = false, hecho = false, msCrear = 0, msHecho = 0;
for (let i = 0; i < 60; i++) {
  const { data: j } = await sb.from("jobs").select("estado").eq("company_id", co!.id);
  if (j?.length && !creado) { creado = true; msCrear = Date.now() - t0; }
  if (j?.some((x) => x.estado === "hecho")) { hecho = true; msHecho = Date.now() - t0; break; }
  if (j?.some((x) => x.estado === "fallido")) throw new Error("job fallido");
  await new Promise((r) => setTimeout(r, 3000));
}
const { data: rq } = await sb.from("interview_responses").select("pregunta, interview_sessions!inner(company_id)").eq("interview_sessions.company_id", co!.id).limit(1);
console.log(JSON.stringify({ job_en_cola_ms: msCrear, procesado_ms: msHecho, pregunta_generada: !!rq?.length, pass: creado && hecho }, null, 1));
await sb.from("companies").delete().eq("id", co!.id);
process.exit(creado && hecho ? 0 : 1);
