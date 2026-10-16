/**
 * El ciclo completo de una decisión, contra la base real, con datos SINTÉTICOS.
 * Crea su propia empresa y la borra al terminar. No toca datos de clientes.
 * Uso: node --env-file=.env.local --import=tsx scripts/prueba-decisiones.mts
 */
import { supabaseAdmin } from "../src/lib/supabase/admin";
import { verDecision, decidir, anotarResultado, balanceDeCorrecciones } from "../src/lib/decisiones";

const sb = supabaseAdmin();
const { data: emp } = await sb.from("companies").insert({ nombre: "PRUEBA DECISIONES (borrar)", sector: "sintetico" }).select("id").single();
const cid = emp!.id;

try {
  // 1 · Una decisión INCOMPLETA: el sistema debe decir que no está lista para decidirse.
  const { data: floja } = await sb
    .from("decisiones")
    .insert({
      company_id: cid,
      titulo: "Contratar a alguien de cobranzas",
      por_que_ahora: "Se acumulan facturas sin cobrar.",
      evidencia: [],
      alternativas: [],
      origen: "agente",
      agente: "planificador",
    })
    .select("id")
    .single();
  const d0 = await verDecision(floja!.id);
  console.log(`DECISION INCOMPLETA · le faltan ${d0!.falta.length} cosas:`);
  for (const f of d0!.falta) console.log("   ·", f);

  // 2 · Una decisión COMPLETA, como debe producirlas un agente.
  const { data: buena } = await sb
    .from("decisiones")
    .insert({
      company_id: cid,
      titulo: "Quién custodia el efectivo de la caja principal",
      por_que_ahora: "La misma persona cuenta y autoriza: cualquier descuadre queda sin segundo par de ojos.",
      evidencia: [
        { tipo: "hallazgo", id: null, texto: "El proceso de cierre no tiene segundo revisor (nodo sin responsable)." },
        { tipo: "afirmacion", id: null, texto: "La supervisora declara que autoriza el tipo de cambio y entrega el efectivo." },
      ],
      faltantes: ["No se sabe cuántos descuadres hubo el último trimestre."],
      supuestos: ["Que el volumen de caja justifica separar funciones."],
      alternativas: [
        { clave: "a", titulo: "Separar custodia y autorización entre dos puestos existentes", que_implica: "Reasignar, sin contratar.", impacto: "alto", costo: "ninguno", velocidad: "1 semana", riesgo: "bajo", reversibilidad: "total" },
        { clave: "b", titulo: "Contratar un puesto de control", que_implica: "Un sueldo más.", impacto: "alto", costo: "S/ 1,800 al mes", velocidad: "1 mes", riesgo: "medio", reversibilidad: "costosa" },
      ],
      recomendacion: "a",
      recomendacion_por_que: "Se resuelve con la gente que ya está; contratar antes de agotar la capacidad actual es prematuro.",
      impacto_esperado: "Ningún descuadre queda sin un segundo par de ojos.",
      riesgos: ["Si la persona designada falta, el control se cae."],
      confianza: "media",
      confianza_por_que: "Falta el dato de descuadres del trimestre.",
      que_pasa_si_se_aprueba: "Se cambia el proceso de cierre y se actualiza el manual de funciones.",
      origen: "agente",
      agente: "organizador",
      agente_version: "1.1",
    })
    .select("id")
    .single();
  const d1 = await verDecision(buena!.id);
  console.log(`\nDECISION COMPLETA · lista para decidirse: ${d1!.falta.length === 0 ? "si" : "no"}`);

  // 3 · La consultora MODIFICA. Lo que proponía el sistema no se pierde.
  const r = await decidir({
    decisionId: buena!.id,
    accion: "modificar",
    motivo: "La opción A es correcta, pero el impacto está mal dicho: lo que se gana no es control, es que la caja no dependa de una sola persona.",
    correcciones: { impacto_esperado: "Que la caja funcione sin depender de una sola persona." },
    actorId: null,
    actorRol: "consultor",
  });
  console.log(`MODIFICADA · estado ahora: ${r.estado}`);

  const d2 = await verDecision(buena!.id);
  const h = d2!.historial[0];
  console.log(`  el sistema proponia : "${h.antes?.impacto_esperado}"`);
  console.log(`  la consultora puso  : "${h.despues?.impacto_esperado}"`);
  console.log(`  ambos conservados   : ${h.antes && h.despues ? "si" : "NO"}`);
  console.log(`  resultado posterior : ${h.resultado ?? "pendiente de observacion (correcto: nadie lo sabe hoy)"}`);

  // 4 · Meses después se anota qué pasó. Eso es lo que permite evaluar si corregir sirvió.
  await anotarResultado(h.id, "Se separaron las funciones. Los descuadres se detectan el mismo dia; antes se detectaban al cierre de mes.");
  const d3 = await verDecision(buena!.id);
  console.log(`  tras anotar         : ${d3!.historial[0].resultado?.slice(0, 62)}...`);

  // 5 · Modificar sin cambiar nada debe rechazarse: eso es aprobar con otro nombre.
  try {
    await decidir({ decisionId: buena!.id, accion: "modificar", motivo: "sin cambiar nada de nada", actorId: null, actorRol: "consultor" });
    console.log("\nFALLO: permitio modificar sin cambiar nada");
  } catch (e) {
    console.log(`\nMODIFICAR SIN CAMBIOS · rechazado: "${(e as Error).message}"`);
  }

  const b = await balanceDeCorrecciones();
  console.log(`\nBALANCE: ${b.total} intervenciones · ${b.conResultado} con resultado observado · ${b.sinResultado} sin observar`);
} finally {
  await sb.from("decisiones").delete().eq("company_id", cid);
  await sb.from("companies").delete().eq("id", cid);
  console.log("\nLimpio: empresa sintetica borrada.");
}
