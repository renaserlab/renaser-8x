/** Inspección del híbrido en bandeja y panorama (producción). */
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const { data: l } = await admin.auth.admin.listUsers({ perPage: 200 });
const c = l.users.find((u) => u.email === "prueba-consultor-vista@renaser.test")!;
await admin.auth.admin.updateUserById(c.id, { password: "Prueba-8x-2026!" });
const { data: s } = await anon.auth.signInWithPassword({ email: c.email!, password: "Prueba-8x-2026!" });
const ck = "sb-otqfqafstrohugvgbkmd-auth-token=base64-" + Buffer.from(JSON.stringify(s!.session)).toString("base64url");
const [b, p] = await Promise.all([
  fetch("https://8x-renaser-s-projects.vercel.app/bandeja", { headers: { cookie: ck } }).then((r) => r.text()),
  fetch("https://8x-renaser-s-projects.vercel.app/empresa/09635fee-2f5a-4b2b-8dd4-5d4a61a2d97f", { headers: { cookie: ck } }).then((r) => r.text()),
]);
console.log(JSON.stringify({
  bandeja: {
    tuDia: b.includes("Tu día"),
    instrumentos: b.includes("empresas a tu cargo") && b.includes("pendientes hoy") && b.includes("críticos"),
    voz: b.includes("Atenderlo ahora"),
  },
  panorama: {
    franja: p.includes("salud con evidencia") || p.includes("salud sin diagnóstico"),
    ventas: p.includes("ventas sin dato") || p.includes("ventas ·"),
    porRevisar: p.includes("hallazgos por revisar") || p.includes("bandeja al día"),
    sinTarjetasKpi: !p.includes("Salud empresarial</p>"),
  },
}, null, 1));
