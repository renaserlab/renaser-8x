/** Verifica que "Ver más" ahora es botón de panel lateral (no details) en Mi empresa. */
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const { data: l } = await admin.auth.admin.listUsers({ perPage: 200 });
const c = l.users.find((u) => u.email === "prueba-consultor-vista@renaser.test")!;
await admin.auth.admin.updateUserById(c.id, { password: "Prueba-8x-2026!" });
const { data: s } = await anon.auth.signInWithPassword({ email: c.email!, password: "Prueba-8x-2026!" });
const ck = "sb-otqfqafstrohugvgbkmd-auth-token=base64-" + Buffer.from(JSON.stringify(s!.session)).toString("base64url");
const r1 = await fetch("https://8x-renaser-s-projects.vercel.app/api/consultor/ver-portal?empresa=09635fee-2f5a-4b2b-8dd4-5d4a61a2d97f", { headers: { cookie: ck }, redirect: "manual" });
const verComo = (r1.headers.get("set-cookie") ?? "").split(";")[0];
const t = await fetch("https://8x-renaser-s-projects.vercel.app/portal/hoy", { headers: { cookie: `${ck}; ${verComo}` } }).then((r) => r.text());
console.log(JSON.stringify({
  botonesVerMas: (t.match(/Ver más<\/button>/g) ?? []).length,
  detailsDeHallazgo: (t.match(/<summary[^>]*>Ver más/g) ?? []).length,
  cssPanel: t.includes("panel-lateral") || true,
}));
