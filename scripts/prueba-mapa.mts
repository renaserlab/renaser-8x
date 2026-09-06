/** Radiografía de una empresa real, en consola. Uso: node --env-file=.env.local --import=tsx scripts/prueba-mapa.mts [nombre] */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { mapaDe } from "../src/lib/mapa-empresa";

const buscado = (process.argv[2] ?? "").toLowerCase();
const { data: empresas } = await supabaseAdmin().from("companies").select("id,nombre").order("created_at");
const objetivo = (empresas ?? []).find((e) => !buscado || e.nombre.toLowerCase().includes(buscado));
if (!objetivo) { console.error("No hay empresas."); process.exit(1); }

const m = await mapaDe(objetivo.id);
if (!m) { console.error("Sin mapa."); process.exit(1); }

console.log(`\n=== ${objetivo.nombre} ===`);
console.log(`NIVEL ${m.empresa.nivel} de 5 (${m.empresa.nombre}) · ${m.empresa.mapeados} procesos mapeados de ${m.empresa.esperados} esperados\n`);
console.log("RASGOS:", m.perfil.rasgos.map((r) => r.nombre).join(" · ") || "(ninguno)");
console.log("PERSONAS:", m.perfil.personas, "· SEDES:", m.perfil.sedes);
console.log(`\nDOCUMENTOS (${m.documentos.filter((d) => d.estado === "listo").length} listos de ${m.documentos.length}):`);
for (const d of m.documentos) console.log(`  [${d.estado.padEnd(9)}] p${d.prioridad}  ${d.nombre}`);
console.log("\nPROCESOS MAPEADOS:");
for (const p of m.procesos) console.log(`  nivel ${p.evaluacion.nivel}  ${p.nombre}\n      falta: ${p.evaluacion.siguiente ?? "nada"}`);
console.log("\nPARTES CON ALGO PENDIENTE:");
for (const parte of m.partes.filter((x) => x.faltan.length)) console.log(`  ${parte.nombre}: falta contar ${parte.faltan.map((f) => f.nombre).join(", ")}`);
console.log(`\nPOR PREGUNTAR: ${m.matriz.porAveriguar.length} rasgos sin datos`);
console.log(`\nDOS NÚMEROS: empresa ${m.empresa.nivel} (${m.empresa.nombre}) · lo mapeado ${m.empresa.nivelMapeados} (${m.empresa.nombreMapeados})`);
