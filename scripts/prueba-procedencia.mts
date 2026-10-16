/**
 * Comprueba que la procedencia se registra SOLA al correr un trabajo real.
 * Uso: node --env-file=.env.local --import=tsx scripts/prueba-procedencia.mts
 * Crea su propia empresa y fuente, y borra todo al final. No toca datos de clientes.
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { conTrabajo, anotarFuentes } from "../src/lib/jobs/contexto";
import { encolar, PRIORIDAD } from "../src/lib/jobs/queue";
import { ejecucion } from "../src/lib/torre";

const sb = supabaseAdmin();
const { data: emp } = await sb.from("companies").insert({ nombre: "PRUEBA PROCEDENCIA (borrar)", sector: "prueba" }).select("id").single();
const cid = emp!.id;
try {
  const { data: fuente } = await sb.from("sources").insert({
    company_id: cid, tipo: "documento", nombre: "Manual de procedimientos (prueba)",
    fecha_origen: "2026-09-27", contenido: "Contenido de prueba.", mime: "text/plain", origen: "consultor",
  }).select("id").single();

  const { data: padre } = await sb.from("jobs").insert({ company_id: cid, tipo: "extraer", payload: { source_id: fuente!.id }, prioridad: 5, idempotency_key: `proc-${cid}` }).select("id").single();

  // Se simula lo que hace el worker: correr el manejador CON el trabajo como contexto.
  await conTrabajo({ jobId: padre!.id, companyId: cid, tipo: "extraer" }, async () => {
    await anotarFuentes([fuente!.id]);
    await anotarFuentes([fuente!.id]); // repetida a proposito: no debe duplicarse
    await encolar({ company_id: cid, tipo: "contrastar", payload: { claim_id: "x" }, prioridad: 5, idempotency_key: `proc-hijo-${cid}` });
  });

  const d = await ejecucion(padre!.id);
  console.log("FUENTES REGISTRADAS:", d!.fuentes.length, "·", d!.fuentes.map((f) => `${f.nombre} (v${f.version})`).join(", "));
  console.log("SIN DUPLICAR:", d!.fuentes.length === 1 ? "correcto" : "FALLO: se duplico");
  console.log("CADENA:", d!.cadena.map((c) => `${c.direccion} ${c.tipo} [${c.estado}]`).join(" | ") || "(vacia)");
  console.log("ANTERIOR AL REGISTRO:", d!.anteriorAlRegistro ? "si (mal: deberia ser no)" : "no (correcto)");
  console.log("HUECOS DECLARADOS:", d!.noRegistrado.length);
  for (const h of d!.noRegistrado) console.log("   ·", h.slice(0, 92));

  // Y una ejecucion ANTIGUA de verdad, para ver que el hueco historico se distingue.
  const { data: vieja } = await sb.from("jobs").select("id").eq("estado", "hecho").lt("created_at", "2026-09-01").limit(1).maybeSingle();
  if (vieja) {
    const v = await ejecucion(vieja.id);
    console.log(`\nUNA EJECUCION DE AGOSTO: anteriorAlRegistro=${v!.anteriorAlRegistro} · fuentes=${v!.fuentes.length} · cadena=${v!.cadena.length}`);
    console.log("   dice:", v!.noRegistrado.find((x) => x.includes("anterior"))?.slice(0, 100) ?? "(no lo distingue)");
  }
} finally {
  await sb.from("jobs").delete().eq("company_id", cid);
  await sb.from("sources").delete().eq("company_id", cid);
  await sb.from("companies").delete().eq("id", cid);
  console.log("\nLimpio: empresa de prueba borrada.");
}
