/** Crea el participante de Darren (socio) en Renaser, enlazado a su cuenta. */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DARREN = "7ea018ec-96e1-44c1-902c-e349eb620428";
const RENASER = "59732f45-bd8c-493b-87ae-6851e6080a2d";
const { data: ya } = await sb.from("participants").select("id").eq("company_id", RENASER).eq("user_id", DARREN).maybeSingle();
if (ya) { console.log("ya existe participante"); process.exit(0); }
const { error } = await sb.from("participants").insert({ company_id: RENASER, nombre: "Darren Supa", rol: "socio", user_id: DARREN });
console.log(error ? `ERROR: ${error.message}` : "participante creado: Darren Supa (socio) en Renaser");
