/** Vincula a Darren como dueño en la empresa Renaser (la que va a llenar) y muestra el estado. */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const DARREN = "7ea018ec-96e1-44c1-902c-e349eb620428";
const RENASER = "59732f45-bd8c-493b-87ae-6851e6080a2d";
const { data: emp } = await sb.from("companies").select("id,nombre,ficha,etapa,estado_admision").eq("id", RENASER).single();
console.log("empresa Renaser:", JSON.stringify(emp));
const { data: parts } = await sb.from("participants").select("id,nombre,rol,user_id").eq("company_id", RENASER);
console.log("participantes:", JSON.stringify(parts));
const { data: mExist } = await sb.from("memberships").select("*").eq("user_id", DARREN).eq("company_id", RENASER).maybeSingle();
if (!mExist) {
  const { error } = await sb.from("memberships").insert({ user_id: DARREN, company_id: RENASER, nivel: "dueno" });
  console.log(error ? `ERROR membresía: ${error.message}` : "membresía creada: Darren → Renaser (dueño)");
} else console.log("ya tenía membresía en Renaser");
