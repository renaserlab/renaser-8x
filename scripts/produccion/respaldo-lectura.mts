/**
 * RESPALDO DE LECTURA ANTES DE TOCAR PRODUCCIÓN. SOLO LEE.
 *
 * Copia a disco, tabla por tabla, las filas de la base tal como están ahora. No sustituye a la copia de
 * seguridad de Supabase (no trae la estructura ni los archivos de Storage): es una segunda red, hecha con el
 * cliente de solo lectura, para poder comparar o recuperar un dato a mano si hiciera falta.
 *
 * Las migraciones del paso a producción no borran ni cambian datos; aun así, antes de un cambio de estructura
 * sobre una base que usan clientes, se guarda una foto.
 *
 * Uso: node --env-file=.env.local --import=tsx scripts/produccion/respaldo-lectura.mts <carpeta-de-salida>
 * La carpeta debe estar fuera del repositorio versionado (p. ej. clientes/…, que git ignora): son datos de clientes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabaseSoloLectura } from "../../src/lib/supabase/admin";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const salida = process.argv[2];
if (!salida) {
  console.error("Falta la carpeta de salida.");
  process.exit(2);
}
mkdirSync(salida, { recursive: true });

// Las tablas son las que la propia base declara (foto del 13-10-2026). Las vistas se saltan: son derivadas.
const esquema = JSON.parse(readFileSync(path.join(RAIZ, "tests/fixtures/esquema-produccion-2026-10-13.json"), "utf8")) as { definitions: Record<string, unknown> };
const VISTAS = new Set(["claims_cliente", "participants_cliente", "company_stats"]);
const tablas = Object.keys(esquema.definitions).filter((t) => !VISTAS.has(t)).sort();

const sb = supabaseSoloLectura();
const TANDA = 1000;
const resumen: { tabla: string; filas: number | null; error?: string }[] = [];

for (const tabla of tablas) {
  const filas: unknown[] = [];
  let error: string | undefined;
  for (let desde = 0; ; desde += TANDA) {
    const { data, error: e } = await sb.from(tabla).select("*").range(desde, desde + TANDA - 1);
    if (e) {
      error = e.message;
      break;
    }
    filas.push(...(data ?? []));
    if (!data || data.length < TANDA) break;
  }
  if (error) {
    resumen.push({ tabla, filas: null, error });
    console.log(`  ${tabla.padEnd(28)} NO SE PUDO LEER: ${error}`);
    continue;
  }
  writeFileSync(path.join(salida, `${tabla}.json`), JSON.stringify(filas), "utf8");
  resumen.push({ tabla, filas: filas.length });
  console.log(`  ${tabla.padEnd(28)} ${String(filas.length).padStart(6)} filas`);
}

writeFileSync(path.join(salida, "_resumen.json"), JSON.stringify({ tomado: new Date().toISOString(), tablas: resumen }, null, 1), "utf8");
const total = resumen.reduce((s, r) => s + (r.filas ?? 0), 0);
const fallidas = resumen.filter((r) => r.filas === null);
console.log(`\n${tablas.length} tablas · ${total} filas · ${fallidas.length} sin leer${fallidas.length ? ": " + fallidas.map((f) => f.tabla).join(", ") : ""}`);
