/**
 * ¿El medidor saca números ÚTILES de lo que una empresa real contó? Corre el manejador contra una
 * empresa que ya tiene hallazgos y acciones, muestra lo que propone y lo borra al terminar.
 *
 * node --env-file=.env.local --import=tsx scripts/prueba-indicadores.mts
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { handleProponerIndicadores } from "../src/lib/jobs/handlers/indicadores";

const sb = supabaseAdmin();

// La que tenga más material: hallazgos críticos y acciones con indicador escrito.
const { data: candidatas } = await sb.from("actions").select("company_id, companies(nombre)").not("kpi", "is", null).limit(50);
const conteo = new Map<string, { nombre: string; n: number }>();
for (const a of candidatas ?? []) {
  const id = a.company_id as string;
  const nombre = (a.companies as unknown as { nombre: string } | null)?.nombre ?? "?";
  const p = conteo.get(id) ?? { nombre, n: 0 };
  p.n++;
  conteo.set(id, p);
}
const elegida = [...conteo.entries()].sort((a, b) => b[1].n - a[1].n)[0];
if (!elegida) {
  console.log("Ninguna empresa tiene acciones con indicador todavía: no hay de qué sacar números.");
  process.exit(0);
}
const [companyId, info] = elegida;
console.log(`\n═════ MEDIDOR · ${info.nombre} (${info.n} acciones con indicador) ═════\n`);

// Se limpia lo que hubiera de una corrida anterior para que el resultado sea el de hoy.
await sb.from("indicadores").delete().eq("company_id", companyId);

const t = Date.now();
const r = (await handleProponerIndicadores({ id: "prueba", company_id: companyId, payload: {} })) as { indicadores: number; propuestos?: number; motivo?: string };
console.log(`Propuso ${r.indicadores} indicador(es) en ${((Date.now() - t) / 1000).toFixed(1)}s${r.motivo ? ` · ${r.motivo}` : ""}\n`);

const { data: puestos } = await sb.from("indicadores").select("*").eq("company_id", companyId).order("created_at");
let fallos = 0;
const paso = (ok: boolean, texto: string) => { if (!ok) fallos++; console.log(`  ${ok ? "PASS " : "FALLA"} · ${texto}`); };

for (const i of puestos ?? []) {
  console.log(`\n  ▸ ${i.nombre}  [${i.clave}]`);
  console.log(`    Cómo se mide: ${i.como_se_mide}`);
  console.log(`    ${i.frecuencia} · mejor si ${i.mejor_si} · ${i.meta_texto ?? (i.meta_valor != null ? `meta ${i.meta_valor}` : "sin meta")}`);
  if (i.origen_texto) console.log(`    Sale de: ${i.origen_texto}`);
}
console.log("");

const todos = puestos ?? [];
paso(todos.length > 0 && todos.length <= 6, `propone entre 1 y 6 indicadores (fueron ${todos.length})`);
paso(todos.every((i) => i.estado === "propuesto"), "todos nacen propuestos: el dueño decide cuáles adopta");
paso(todos.every((i) => /^[a-z0-9_]+$/.test(i.clave)), "las claves son snake_case, listas para vivir junto a las métricas");
paso(todos.every((i) => !/\bKPI\b|\btasa\b|\bratio\b/i.test(i.nombre)), "ningún nombre usa jerga (KPI, tasa, ratio)");
paso(todos.every((i) => i.como_se_mide.length > 15), "todos explican cómo se miden, no solo qué miden");
paso(new Set(todos.map((i) => i.clave)).size === todos.length, "no hay dos indicadores con la misma clave");
paso(todos.every((i) => ["diaria", "semanal", "mensual"].includes(i.frecuencia)), "la frecuencia es una que el negocio puede sostener");

await sb.from("indicadores").delete().eq("company_id", companyId);
console.log(`\n${fallos === 0 ? "TODO VERDE" : `${fallos} FALLO(S)`} · indicadores de prueba borrados\n`);
process.exit(fallos === 0 ? 0 : 1);
