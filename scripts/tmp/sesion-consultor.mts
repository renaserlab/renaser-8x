/** Genera la cookie de sesión del consultor de prueba para verificar producción en el navegador. */
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = "prueba-consultor-vista@renaser.test";
const pass = "Prueba-8x-2026!";
const { data: lista } = await admin.auth.admin.listUsers();
const u = lista.users.find((x) => x.email === email);
if (!u) throw new Error("usuario de prueba no existe");
await admin.auth.admin.updateUserById(u.id, { password: pass });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const { data, error } = await anon.auth.signInWithPassword({ email, password: pass });
if (error) throw error;
const ref = url.match(/https:\/\/(.+?)\.supabase/)![1];
const valor = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
console.log(JSON.stringify({ nombre: `sb-${ref}-auth-token`, valor }));
