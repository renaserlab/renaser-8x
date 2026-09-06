/** TEMPORAL: crea un consultor de prueba y devuelve su cookie, para revisar una pantalla en el navegador. */
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../src/lib/supabase/admin";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ref = url.split("//")[1].split(".")[0];
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const EMAIL = `qa.pantalla.${Date.now()}@gmail.com`;
const PASS = "Qa-8x-2026!";
const { data, error } = await anon.auth.signUp({ email: EMAIL, password: PASS, options: { data: { nombre: "QA Pantalla" } } });
if (error || !data.session) { console.error(error?.message ?? "sin sesión"); process.exit(1); }
await supabaseAdmin().from("users").update({ rol: "consultor" }).eq("id", data.user!.id);
const { data: qori } = await supabaseAdmin().from("companies").select("id,nombre").ilike("nombre", "%Qori%").limit(1).single();
console.log("USER_ID=" + data.user!.id);
console.log("COMPANY_ID=" + qori?.id);
console.log("COOKIE=sb-" + ref + "-auth-token=base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url"));
