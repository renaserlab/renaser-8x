/** Reproduce el flujo completo del registro→datos→crear empresa contra PRODUCCIÓN. */
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const EMAIL = `prueba.flujo.${Date.now()}@gmail.com`;
const PASS = "Prueba-Flujo-2026!";
const { error: e0 } = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true, user_metadata: { nombre: "Flujo Prueba" } });
if (e0) throw e0;
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const { data: s, error: e1 } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASS });
if (e1) throw e1;
const ref = url.match(/https:\/\/(.+?)\.supabase/)![1];
const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
const t0 = Date.now();
const r = await fetch("https://8x-renaser-s-projects.vercel.app/api/portal/empresa", {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ nombre: "RENASER PRUEBA FLUJO", ficha: { actividad: "consultoría empresarial", personas: "5", antiguedad: "8" } }),
});
console.log("status:", r.status, `· ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const creada = JSON.parse(await r.text()) as { company_id: string };
console.log("empresa:", creada.company_id);

// El paso donde "no carga": la primera pregunta de la conversación.
const { data: ses } = await admin.from("interview_sessions").select("id,tipo,estado").eq("company_id", creada.company_id);
console.log("sesiones:", JSON.stringify(ses));
const sesionId = ses?.[0]?.id;
const p = await fetch(`https://8x-renaser-s-projects.vercel.app/api/companies/${creada.company_id}/interview/next`, {
  method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ session_id: sesionId }),
});
console.log("POST next:", p.status, (await p.text()).slice(0, 180));
for (let i = 0; i < 12; i++) {
  const t1 = Date.now();
  const q = await fetch(`https://8x-renaser-s-projects.vercel.app/api/companies/${creada.company_id}/interview/next?session_id=${sesionId}`, { headers: { cookie } });
  const txt = (await q.text()).slice(0, 260);
  console.log(`pregunta intento ${i + 1}: ${q.status} · ${((Date.now() - t1) / 1000).toFixed(1)}s · ${txt}`);
  if (txt.includes('"texto"')) break;
  await new Promise((r2) => setTimeout(r2, 6000));
}
const { data: jobs } = await admin.from("jobs").select("tipo,estado,error,intentos").eq("company_id", creada.company_id).order("created_at", { ascending: false }).limit(5);
console.log("jobs:", JSON.stringify(jobs));
