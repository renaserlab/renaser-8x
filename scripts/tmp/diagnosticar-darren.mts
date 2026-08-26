/** SOLO LECTURA: estado de la cuenta de Darren y empresas RENASER existentes. */
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: lista } = await sb.auth.admin.listUsers({ perPage: 200 });
const d = lista.users.find((u) => u.email === "darrensupaoficial@gmail.com");
console.log("usuario:", d ? JSON.stringify({ id: d.id, confirmado: d.email_confirmed_at, creado: d.created_at, ultimo: d.last_sign_in_at }) : "NO EXISTE");
if (d) {
  const { data: m } = await sb.from("memberships").select("company_id, companies(nombre)").eq("user_id", d.id);
  console.log("membresías:", JSON.stringify(m));
  const { data: fila } = await sb.from("users").select("*").eq("id", d.id).maybeSingle();
  console.log("fila users:", JSON.stringify(fila));
}
const { data: empresas } = await sb.from("companies").select("id,nombre,created_at").or("nombre.ilike.%renaser%,nombre.ilike.%RENASER%");
console.log("empresas renaser:", JSON.stringify(empresas));
