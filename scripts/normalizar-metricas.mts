/**
 * NORMALIZACIÓN RETROACTIVA de los números ya guardados (30-08-2026).
 *
 * Los números que entraron antes del vocabulario canónico están con las claves que se inventaron en
 * su momento (`utilidad_mes`, `gasto_mes`, `venta_epoca_dorada`). Sin esto, Qori seguiría marcando
 * 2 de 9 aunque el número exista con otro nombre. Usa EXACTAMENTE la misma función que usa la
 * aplicación: una sola fuente de verdad para el mapeo.
 *
 * Uso:
 *   node --env-file=.env.local --import=tsx scripts/normalizar-metricas.mts          (solo informa)
 *   node --env-file=.env.local --import=tsx scripts/normalizar-metricas.mts --aplicar
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { normalizarMetrica, radiografia, CLAVES_VITALES, type Metrica } from "../src/lib/metricas";

const aplicar = process.argv.includes("--aplicar");
const sb = supabaseAdmin();

type Fila = { id: string; company_id: string; clave: string; periodo: string; valor: number | null; estado: string | null; updated_at: string | null };

const { data, error } = await sb.from("company_metricas").select("id,company_id,clave,periodo,valor,estado,updated_at").limit(5000);
if (error) throw new Error(error.message);
const filas = (data ?? []) as Fila[];

const { data: empresas } = await sb.from("companies").select("id,nombre");
const nombrePor = new Map((empresas ?? []).map((e) => [e.id as string, e.nombre as string]));

// Un dato verificado siempre gana; a igualdad, el más reciente.
const peso = (f: Fila) => (f.estado === "verificado" ? 2 : f.estado === "contado" ? 1 : 0);

const cambios: { fila: Fila; clave: string; periodo: string }[] = [];
const duplicados: Fila[] = [];
const ganador = new Map<string, Fila>();

for (const f of filas) {
  const n = normalizarMetrica(f.clave, f.periodo);
  if (n.clave !== f.clave || n.periodo !== f.periodo) cambios.push({ fila: f, clave: n.clave, periodo: n.periodo });
  if (!CLAVES_VITALES.has(n.clave)) continue;
  const llave = `${f.company_id}|${n.clave}|${n.periodo}`;
  const actual = ganador.get(llave);
  if (!actual) { ganador.set(llave, f); continue; }
  const mejor = peso(f) > peso(actual) || (peso(f) === peso(actual) && (f.updated_at ?? "") > (actual.updated_at ?? "")) ? f : actual;
  duplicados.push(mejor === f ? actual : f);
  ganador.set(llave, mejor);
}

console.log(`Filas revisadas: ${filas.length}`);
console.log(`Claves a normalizar: ${cambios.length}`);
for (const c of cambios.slice(0, 25))
  console.log(`  ${nombrePor.get(c.fila.company_id) ?? "?"}: ${c.fila.clave}/${c.fila.periodo} → ${c.clave}/${c.periodo}`);
if (cambios.length > 25) console.log(`  … y ${cambios.length - 25} más`);
console.log(`Duplicados que quedarían tras normalizar (se elimina el más débil): ${duplicados.length}`);

// Antes y después, por empresa: lo que de verdad importa.
const porEmpresa = new Map<string, Metrica[]>();
for (const f of filas) {
  const l = porEmpresa.get(f.company_id) ?? [];
  l.push({ clave: f.clave, periodo: f.periodo, valor: f.valor, estado: f.estado });
  porEmpresa.set(f.company_id, l);
}
console.log("\nRadiografía por empresa (antes → después):");
for (const [id, ms] of porEmpresa) {
  const antes = ms.filter((x) => CLAVES_VITALES.has(x.clave) && x.periodo !== "epoca_dorada").length;
  const despues = radiografia(ms);
  console.log(`  ${(nombrePor.get(id) ?? id).padEnd(38)} ${String(antes).padStart(2)} → ${despues.listos}/9 · ${despues.mesesConVenta} mes(es) de venta`);
}

if (!aplicar) {
  console.log("\nSolo informe. Para escribir de verdad: --aplicar");
  process.exit(0);
}

const aBorrar = new Set(duplicados.map((d) => d.id));
let normalizadas = 0;
for (const c of cambios) {
  if (aBorrar.has(c.fila.id)) continue;
  const { error: e } = await sb.from("company_metricas").update({ clave: c.clave, periodo: c.periodo }).eq("id", c.fila.id);
  if (e) console.log(`  fallo en ${c.fila.id}: ${e.message}`);
  else normalizadas++;
}
if (aBorrar.size) await sb.from("company_metricas").delete().in("id", [...aBorrar]);
console.log(`\nNormalizadas: ${normalizadas} · Duplicados eliminados: ${aBorrar.size}`);
