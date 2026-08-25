/** Reproduce el tablero con los datos REALES de Jardín Renaser: ¿truena o qué devuelve? */
import { createClient } from "@supabase/supabase-js";
import { tableroEmpresario } from "../../src/lib/tablero";
import { empresaHoy } from "../../src/lib/hoy";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: c } = await sb.from("companies").select("id,nombre,ficha").ilike("nombre", "%Jard%Renaser%").single();
if (!c) throw new Error("no encontrada");
console.log("empresa:", c.nombre, "· ficha:", JSON.stringify(c.ficha));
const { data: m } = await sb.from("memberships").select("user_id,nivel").eq("company_id", c.id);
console.log("membresías:", JSON.stringify(m));
try {
  const t = await tableroEmpresario(c.id);
  console.log("TABLERO OK:", JSON.stringify({ pregunta: t.preguntaAbierta?.slice(0, 60), comprension: t.comprension, kpis: t.kpis, serie: t.serieVentas.length, dorada: t.epocaDorada, biblioteca: t.biblioteca }, null, 1));
} catch (e) {
  console.log("TABLERO ERROR:", (e as Error).message, (e as Error).stack?.split("\n")[1]);
}
try {
  const h = await empresaHoy(c.id);
  console.log("HOY OK: nivel", h.nivel, "· restriccion:", h.restriccion?.titulo?.slice(0, 60) ?? "(ninguna)");
} catch (e) {
  console.log("HOY ERROR:", (e as Error).message);
}
