/** Anota, resume y borra contra la base real. Uso: node --env-file=.env.local --import=tsx scripts/prueba-eventos.mts */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { resumen, aporteAVitales, type Evento } from "../src/lib/eventos";

const sb = supabaseAdmin();
const { data: c } = await sb.from("companies").select("id,nombre").ilike("nombre", "%Qori%").limit(1).single();
const { data: persona } = await sb.from("participants").select("id,nombre").eq("company_id", c!.id).limit(1).single();
console.log(`Empresa: ${c!.nombre} · persona de prueba: ${persona?.nombre ?? "(ninguna)"}`);

const aMeter = [
  { tipo: "tardanza", minutos: 15, persona_id: persona?.id ?? null, datos: { nota: "tráfico" } },
  { tipo: "tardanza", minutos: 8, persona_id: persona?.id ?? null, datos: {} },
  { tipo: "factura_emitida", monto: 2400, datos: { cliente: "Cliente de prueba" } },
  { tipo: "factura_emitida", monto: 1100, datos: { cliente: "Otro de prueba" } },
  { tipo: "proyecto_trabado", datos: { proyecto: "Prueba", nota: "falta aprobación del dueño" } },
];
const { data: metidos, error } = await sb.from("eventos").insert(aMeter.map((e) => ({ ...e, company_id: c!.id }))).select("id,tipo,fecha,monto,minutos,persona_id,datos");
if (error) { console.error("ERROR al anotar:", error.message); process.exit(1); }
console.log(`\nAnotados: ${metidos!.length}`);

const evs = metidos as unknown as Evento[];
console.log("\nRESUMEN:");
for (const l of resumen(evs)) console.log(`  ${l.nombre.padEnd(32)} ${String(l.total).padStart(6)} ${l.unidad.padEnd(8)} (${l.veces} anotaciones, mejor si ${l.mejorSi})`);
console.log("\nAPORTE A LOS NUMEROS VITALES:", aporteAVitales(evs));

// Se limpia: era una prueba, no datos de Rosi.
await sb.from("eventos").delete().in("id", metidos!.map((m) => m.id));
const { count } = await sb.from("eventos").select("id", { count: "exact", head: true }).eq("company_id", c!.id);
console.log(`\nBorrados. Quedan ${count ?? 0} eventos reales en ${c!.nombre}.`);

// Y el mismo camino por el RPC que usan la pantalla y la ruta (ventana calculada en Postgres).
const { data: otra } = await sb.from("eventos").insert({ company_id: c!.id, tipo: "incidencia", datos: { nota: "prueba del RPC" } }).select("id").single();
const { data: porRpc, error: eRpc } = await sb.rpc("eventos_recientes", { p_company: c!.id, p_dias: 30 });
console.log(eRpc ? `ERROR en el RPC: ${eRpc.message}` : `RPC devuelve ${(porRpc ?? []).length} evento(s) de los ultimos 30 dias`);
const { data: viejo } = await sb.from("eventos").insert({ company_id: c!.id, tipo: "incidencia", fecha: "2024-01-01", datos: { nota: "fuera de ventana" } }).select("id").single();
const { data: porRpc2 } = await sb.rpc("eventos_recientes", { p_company: c!.id, p_dias: 30 });
console.log(`Con uno de 2024 anotado, el RPC sigue devolviendo ${(porRpc2 ?? []).length}: la ventana recorta de verdad`);
await sb.from("eventos").delete().in("id", [otra!.id, viejo!.id]);
const { count: final } = await sb.from("eventos").select("id", { count: "exact", head: true }).eq("company_id", c!.id);
console.log(`Limpio: ${final ?? 0} eventos reales.`);
