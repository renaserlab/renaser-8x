// Ingesta de la Base Maestra al RAG: tabla conocimiento_base, troceada por sección con su eje.
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const q = async (query) => {
  const r = await fetch("https://api.supabase.com/v1/projects/otqfqafstrohugvgbkmd/database/query", { method: "POST", headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  return { status: r.status, body: await r.json() };
};

// 1. Tabla
console.log("DDL:", (await q(`
create table if not exists conocimiento_base (
  id uuid primary key default gen_random_uuid(),
  fuente text not null,
  seccion text not null,
  ejes text[] not null default '{}',
  contenido text not null,
  orden int not null,
  version text not null default 'agosto-2026',
  created_at timestamptz not null default now()
);
alter table conocimiento_base enable row level security;
delete from conocimiento_base where fuente = 'base-maestra-renaser';
`)).status);

// 2. Trocear por secciones
const lineas = readFileSync("scripts/tmp/base-maestra.txt", "utf8").split("\n");
const esTitulo = (l) => /^(\d\.\s|Motor \d ·|Metodolog[íi]a empresarial|Doce principios|Contrato de razonamiento|Conductas prohibidas|Unidad m[íi]nima|Proceso de diagn[óo]stico|Escala de madurez|Reglas adaptativas|Sistema de decisi[óo]n|Formato obligatorio|Videoteca completa|La s[íi]ntesis RENASER|Los 11 referentes|C[óo]mo usar este|Mapa del sistema|Fundamento transversal|Por qu[ée] quedan fuera|Distribuci[óo]n autoral|C[óo]mo se conectan)/.test(l.trim());
const EJES = (t) => {
  const s = t.toLowerCase();
  if (/motor 1|producto/.test(s) && /motor|producto/.test(s) && s.includes("producto")) return ["producto"];
  if (s.startsWith("motor 2") || s.includes("procesos")) return ["procesos"];
  if (s.startsWith("motor 3") || s.includes("personal") || s.includes("personas")) return ["personas"];
  if (s.startsWith("motor 4") || s.includes("marketing")) return ["marketing"];
  if (s.startsWith("motor 5") || s.includes("servicio")) return ["producto", "procesos"];
  if (s.startsWith("motor 6") || s.includes("excelencia") || s.includes("cultura")) return ["personas", "procesos"];
  if (s.startsWith("1.") || s.includes("productividad")) return ["transversal", "personas"];
  return ["transversal"];
};

const secciones = [];
let actual = { titulo: "Portada y uso del documento", cuerpo: [] };
for (const l of lineas) {
  if (esTitulo(l) && actual.cuerpo.length) {
    secciones.push(actual);
    actual = { titulo: l.trim().slice(0, 140), cuerpo: [] };
  } else if (esTitulo(l) && !actual.cuerpo.length) {
    actual.titulo = l.trim().slice(0, 140);
  } else {
    actual.cuerpo.push(l);
  }
}
secciones.push(actual);
console.log("secciones:", secciones.length);

// 3. Insertar (REST con service role)
const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
const filas = secciones.map((s, i) => ({ fuente: "base-maestra-renaser", seccion: s.titulo, ejes: EJES(s.titulo), contenido: s.cuerpo.join("\n").trim().slice(0, 24000), orden: i }));
const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/conocimiento_base`, { method: "POST", headers: h, body: JSON.stringify(filas) });
console.log("insert:", r.status, r.ok ? `${filas.length} secciones` : (await r.text()).slice(0, 200));
for (const f of filas) console.log(` · [${f.ejes.join(",")}] ${f.seccion.slice(0, 70)} (${f.contenido.length} ch)`);
