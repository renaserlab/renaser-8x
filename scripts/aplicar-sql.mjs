/**
 * Aplica un archivo .sql al proyecto de Supabase vía Management API.
 * Uso: node --env-file=.env.local scripts/aplicar-sql.mjs supabase/migracion-gobierno.sql
 */
import { readFileSync } from "node:fs";

const ruta = process.argv[2];
if (!ruta) { console.error("Falta la ruta del .sql"); process.exit(1); }
const token = process.env.SUPABASE_ACCESS_TOKEN;
const proyecto = process.env.SUPABASE_PROJECT_REF ?? "otqfqafstrohugvgbkmd";
if (!token) { console.error("Falta SUPABASE_ACCESS_TOKEN en .env.local"); process.exit(1); }

const query = readFileSync(ruta, "utf8");
const r = await fetch(`https://api.supabase.com/v1/projects/${proyecto}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const texto = await r.text();
console.log(r.ok ? `OK ${ruta}` : `ERROR ${r.status}`);
console.log(texto.slice(0, 800));
process.exit(r.ok ? 0 : 1);
