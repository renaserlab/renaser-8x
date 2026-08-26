/** Confirma el correo de todos los usuarios que quedaron sin confirmar (creados con la confirmación activada). */
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
const sinConfirmar = data.users.filter((u) => !u.email_confirmed_at);
for (const u of sinConfirmar) {
  const { error } = await admin.auth.admin.updateUserById(u.id, { email_confirm: true });
  console.log(error ? `ERROR ${u.email}: ${error.message}` : `confirmado: ${u.email}`);
}
console.log(`total sin confirmar: ${sinConfirmar.length} de ${data.users.length}`);
