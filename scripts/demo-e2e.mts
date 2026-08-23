/**
 * EMPRESA DEMO de extremo a extremo con SUPABASE REAL + GEMINI REAL (fase de deploy).
 * Siembra la empresa demo (fuentes, participantes, sesiones, respuestas), deja que el pipeline real
 * (worker: extraer → contrastar → minar → diagnosticar → consolidar → arquitecto → to-be → plan → entregables)
 * haga TODO el trabajo con el modelo real, valida como lo haría el dueño, y audita el resultado contra
 * benchmark/esperado.json. Requiere el worker corriendo (npm run worker) y credenciales en .env.local.
 * Borra su propia empresa al final SOLO si se pasa --limpiar.
 *   node --env-file=.env.local --import=tsx scripts/demo-e2e.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { medir, type Esperado, type HallazgoObtenido } from "../src/lib/benchmark";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const esperado = JSON.parse(readFileSync(path.resolve(__dirname, "../benchmark/esperado.json"), "utf8")) as Esperado;
const NOMBRE = "EMPRESA DEMO E2E (Frutas del Valle SAC)";

async function esperarCola(companyId: string, etiqueta: string, maxMin = 30) {
  const t0 = Date.now();
  let quietas = 0;
  for (;;) {
    const { data } = await sb.from("jobs").select("id,tipo,estado").eq("company_id", companyId).in("estado", ["pendiente", "corriendo"]);
    if (!data?.length) {
      quietas++;
      if (quietas >= 3) return; // 3 lecturas seguidas sin trabajo: la cadena terminó (los jobs encadenan jobs)
    } else quietas = 0;
    if (Date.now() - t0 > maxMin * 60_000) throw new Error(`${etiqueta}: la cola no terminó en ${maxMin} min: ${JSON.stringify(data?.slice(0, 5))}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
}
async function encolar(companyId: string, tipo: string, payload: Record<string, unknown>, prioridad: number, clave: string) {
  const { error } = await sb.from("jobs").insert({ company_id: companyId, tipo, payload, prioridad, idempotency_key: clave });
  if (error && !error.message.includes("duplicate")) throw new Error(`encolar ${tipo}: ${error.message}`);
}

async function main() {
  // 0. Empresa limpia
  await sb.from("companies").delete().eq("nombre", NOMBRE);
  const { data: co, error: e0 } = await sb.from("companies").insert({ nombre: NOMBRE, sector: "distribución de alimentos" }).select("id").single();
  if (e0) throw new Error(e0.message);
  const cid = co!.id as string;
  console.log("empresa:", cid);

  // 1. FUENTES → extracción real (las fotos entran transcritas: sin OCR propio en V1)
  const fuentes = [
    { nombre: "Plan estratégico 2022", tipo: "documento", fecha_origen: "2022-03-15", origen: "cliente", contenido: "PLAN ESTRATÉGICO 2022 — Frutas del Valle SAC\n\nVISIÓN (página 3): Ser el distribuidor de fruta líder en Lima y provincias para 2026.\n\nMETAS COMERCIALES (página 7): Alcanzar S/ 5 millones de facturación anual.\n\nCLIENTE OBJETIVO (página 9): Cadenas de restaurantes con más de 5 locales." },
    { nombre: "Organigrama (transcripción de la foto de la pared)", tipo: "documento", fecha_origen: null, origen: "cliente", contenido: "ORGANIGRAMA VIGENTE EN LA PARED\n\nGerente general: Julio.\nJefe de Ventas: aprueba descuentos y condiciones de pago.\nCompras: selección y compra de fruta.\nReparto: entrega a restaurantes." },
    { nombre: "Lista de precios (transcripción de foto)", tipo: "documento", fecha_origen: "2025-11-01", origen: "cliente", contenido: "LISTA DE PRECIOS VIGENTE\n\nPalta Hass: S/ 9.50 el kilo." },
    { nombre: "pedidos_2026.csv (resumen de datos)", tipo: "dato", fecha_origen: "2026-08-01", origen: "consultor", contenido: "seccion,celda,dato\npedidos,reclamo!G2:G1340,38% de los pedidos de julio tienen reclamo por fruta pasada\npedidos,origen!C2:C1340,92% de clientes nuevos 2026 con origen = referido chef Ramos\npedidos,cliente!B,81% de la facturación proviene de restaurantes independientes de 1 local" },
  ];
  for (const f of fuentes) {
    const { data: s, error } = await sb.from("sources").insert({ company_id: cid, ...f, estado: "subido" }).select("id").single();
    if (error) throw new Error(error.message);
    await encolar(cid, "extraer", { source_id: s!.id }, 3, `e2e-extraer-${s!.id}`);
  }

  // 2. PARTICIPANTES + SESIONES + RESPUESTAS (dueño y equipo) → extracción y minería reales
  const personas = [
    { clave: "dueno", nombre: "Julio Valle", puesto: "Gerente general", rol: "dueno" },
    { clave: "diego", nombre: "Diego Torres", puesto: "Jefe de Ventas", rol: "lider" },
    { clave: "rosa", nombre: "Rosa Quispe", puesto: "Compradora", rol: "empleado" },
    { clave: "pamela", nombre: "Pamela Ruiz", puesto: "Asesora de ventas", rol: "empleado" },
    { clave: "luis", nombre: "Luis Mamani", puesto: "Chofer", rol: "empleado" },
  ] as const;
  const pid: Record<string, string> = {};
  for (const p of personas) {
    const { data } = await sb.from("participants").insert({ company_id: cid, nombre: p.nombre, puesto: p.puesto, rol: p.rol, token_hash: `e2e-${p.clave}-${cid}`, token_expira_at: new Date(Date.now() + 86400e3).toISOString() }).select("id").single();
    pid[p.clave] = data!.id;
  }
  const sesiones = [
    { clave: "ses-dueno-sueno", p: "dueno", tipo: "sueno_dueno" },
    { clave: "ses-dueno-empresa", p: "dueno", tipo: "empresa_dueno" },
    { clave: "ses-diego", p: "diego", tipo: "lider" },
    { clave: "ses-rosa-kh", p: "rosa", tipo: "know_how" },
    { clave: "ses-pamela", p: "pamela", tipo: "personal" },
    { clave: "ses-luis", p: "luis", tipo: "personal" },
  ] as const;
  const sid: Record<string, string> = {};
  for (const s of sesiones) {
    const { data } = await sb.from("interview_sessions").insert({ company_id: cid, participant_id: pid[s.p], tipo: s.tipo }).select("id").single();
    sid[s.clave] = data!.id;
  }
  const respuestas = [
    { ses: "ses-dueno-sueno", bloque: "vida_deseada", orden: 2, pregunta: "Imagina un martes normal dentro de tres años. ¿Dónde estás y qué ya no haces?", respuesta: "Ya no quiero provincias. Quiero ser el mejor de Lima y trabajar 30 horas, no 70." },
    { ses: "ses-dueno-empresa", bloque: "hoy", orden: 4, pregunta: "¿Qué área funciona especialmente bien?", respuesta: "Ventas funciona bien, Diego lo tiene controlado." },
    { ses: "ses-dueno-empresa", bloque: "validacion", orden: 5, pregunta: "Encontré dos metas distintas. ¿Cuál refleja la dirección actual?", respuesta: "La meta real es USD 3 millones, ya no 5 millones de soles." },
    { ses: "ses-diego", bloque: "personas", orden: 3, pregunta: "¿Puedes decidir un descuento sin pedir permiso?", respuesta: "Todo descuento lo tengo que consultar con Julio, aunque sea de 2%." },
    { ses: "ses-pamela", bloque: "trabajo_real", orden: 2, pregunta: "¿Dónde se traba tu trabajo?", respuesta: "Cuando Julio está de viaje los pedidos con descuento se quedan parados dos o tres días." },
    { ses: "ses-rosa-kh", bloque: "know_how", orden: 4, pregunta: "¿Qué señal ves antes de que aparezca el problema?", respuesta: "Cuando la palta tiene esta pequeña textura, en dos días está perfecta. Cuando no estoy, compran por precio y llega pasada." },
    { ses: "ses-luis", bloque: "trabajo_real", orden: 3, pregunta: "¿Qué se rehace más de una vez?", respuesta: "Los martes reparto fruta que ya está blanda; los restaurantes me la devuelven en la puerta." },
  ];
  for (const r of respuestas) {
    const { data } = await sb.from("interview_responses").insert({ company_id: cid, session_id: sid[r.ses], bloque: r.bloque, orden: r.orden, pregunta: r.pregunta, respuesta: r.respuesta, respondida_at: new Date().toISOString() }).select("id").single();
    await encolar(cid, "extraer", { response_id: data!.id }, 3, `e2e-extraer-resp-${data!.id}`);
  }
  await encolar(cid, "minar_know_how", { session_id: sid["ses-rosa-kh"] }, 3, `e2e-minar-${sid["ses-rosa-kh"]}`);

  // 3. PROCESO AS-IS dictado (el ARQUITECTO real lo dibuja)
  await encolar(cid, "generar_proceso", { descripcion: "Proceso de ventas y reparto: El restaurante pide por WhatsApp. Pamela arma el pedido. Si el pedido pide descuento, se espera a que Julio lo apruebe (cuando viaja, dos o tres días); si no, sigue directo. Compras arma la fruta. Luis reparte. Si el restaurante acepta la fruta, el pedido se cobra (fin bueno). Si no la acepta, la fruta se devuelve y el pedido se pierde (fin malo, pasa los martes)." }, 2, `e2e-proceso-${cid}`);

  console.log("esperando extracción + contraste + minería + arquitecto…");
  await esperarCola(cid, "extracción");

  // 4. VALIDACIÓN DEL DUEÑO (los tres botones, como en el portal)
  const validaciones: { busca: string; respuesta: "si" | "ya_no" | "nunca" }[] = [
    { busca: "%5 millones%", respuesta: "ya_no" },
    { busca: "%líder%provincias%", respuesta: "ya_no" },
    { busca: "%cadenas%5 locales%", respuesta: "nunca" },
    { busca: "%Jefe de Ventas%aprueba%", respuesta: "ya_no" },
    { busca: "%9.50%", respuesta: "si" },
  ];
  for (const v of validaciones) {
    const { data: cs } = await sb.from("claims").select("id,texto,estado,contradice_a").eq("company_id", cid).ilike("texto", v.busca);
    for (const c of cs ?? []) {
      const estado = v.respuesta === "si" ? "confirmado" : v.respuesta === "ya_no" ? "caducado" : "contradicho";
      await sb.from("claims").update({ estado, validado_at: new Date().toISOString(), prioridad_validacion: false }).eq("id", c.id);
      console.log("validado:", v.respuesta, "→", c.texto.slice(0, 70));
    }
  }
  // Lo que el equipo afirmó en entrevista queda confirmado (regla del sistema); el resto de claims de documentos sin contradicción se confirma como haría el consultor en revisión.
  await sb.from("claims").update({ estado: "confirmado" }).eq("company_id", cid).eq("estado", "sin_verificar").not("participant_id", "is", null);
  await sb.from("claims").update({ estado: "confirmado" }).eq("company_id", cid).eq("estado", "sin_verificar");

  // 5. DIAGNÓSTICO 4P real (forzar: quedan claims 'contradicho' que el dueño respondió 'nunca' — resueltos pero no vigentes)
  for (const pilar of ["personas", "procesos", "producto", "marketing"]) {
    await encolar(cid, "diagnosticar", { pilar, forzar: true }, 5, `e2e-diag-${pilar}-${cid}`);
  }
  console.log("esperando diagnóstico + auditor + consolidación…");
  await esperarCola(cid, "diagnóstico");

  // 6. TO-BE del proceso + PLAN + ENTREGABLES reales
  const { data: procs } = await sb.from("processes").select("id,nombre").eq("company_id", cid).eq("version", "as_is");
  for (const p of procs ?? []) await encolar(cid, "generar_tobe", { process_id: p.id }, 5, `e2e-tobe-${p.id}`);
  await esperarCola(cid, "to-be");
  await encolar(cid, "planificar", {}, 5, `e2e-plan-${cid}`);
  await esperarCola(cid, "plan");
  await encolar(cid, "redactar_entregables", {}, 7, `e2e-entregables-${cid}`);
  console.log("esperando entregables…");
  await esperarCola(cid, "entregables");

  // 7. AUDITORÍA DEL RESULTADO
  const { data: claims } = await sb.from("claims").select("id,texto,estado,pilar,participant_id").eq("company_id", cid);
  const { data: rels } = await sb.from("claim_relations").select("claim_id,related_id,tipo").eq("company_id", cid).eq("tipo", "contradicts");
  const texto = (id: string) => claims?.find((c) => c.id === id)?.texto ?? "";
  const parCon = (a: string, b: string) => (rels ?? []).some((r) => (texto(r.claim_id).includes(a) && texto(r.related_id).includes(b)) || (texto(r.claim_id).includes(b) && texto(r.related_id).includes(a)));
  const contradiccionesReales = { metas: parCon("5 millones", "3 millones") || parCon("5 millones", "USD 3"), cliente: parCon("cadenas", "81%") || parCon("5 locales", "1 local"), descuentos: parCon("aprueba descuentos", "consultar") || parCon("Jefe de Ventas", "Julio") };

  const { data: fnd } = await sb.from("findings").select("titulo,causa_raiz,pilar,patron,impacto,veredicto,requiere_validacion,filtros, finding_evidence(claim_id,relacion)").eq("company_id", cid).eq("origen", "ia");
  const visibles = (fnd ?? []).filter((f) => !f.requiere_validacion);
  const obtenidos: HallazgoObtenido[] = visibles.map((f) => ({ titulo: f.titulo, causa_raiz: f.causa_raiz, pilar: f.pilar, patron: f.patron, impacto: f.impacto, preserva: f.veredicto === "keep" || !!(f.filtros as { preserva?: boolean } | null)?.preserva, claim_ids: ((f.finding_evidence as { claim_id: string; relacion: string }[]) ?? []).filter((e) => e.relacion === "sustenta").map((e) => e.claim_id) }));
  const m = medir({ ...esperado, contradicciones: [], preguntas_minimas: [] }, obtenidos, [], []);

  const { data: kh } = await sb.from("know_how").select("puesto,senal,regla_practica").eq("company_id", cid);
  const { data: tobe } = await sb.from("processes").select("id,nombre").eq("company_id", cid).eq("version", "to_be");
  const { data: acts } = await sb.from("actions").select("accion,semana_inicio,semana_cierre,prioridad").eq("company_id", cid).eq("fase", "implementacion").order("prioridad");
  const porSemana: Record<number, number> = {};
  for (const a of acts ?? []) for (let s = a.semana_inicio; s <= a.semana_cierre; s++) porSemana[s] = (porSemana[s] ?? 0) + 1;
  const maxFrentes = Math.max(0, ...Object.values(porSemana));
  const { data: docs } = await sb.from("deliverables").select("tipo,version").eq("company_id", cid);
  const destruyeFortaleza = (acts ?? []).some((a) => /reemplazar a rosa|despedir/i.test(a.accion));

  const resumen = {
    empresa: cid,
    claims: { total: claims?.length ?? 0, confirmados: claims?.filter((c) => c.estado === "confirmado").length ?? 0, caducados: claims?.filter((c) => c.estado === "caducado").length ?? 0, contradichos: claims?.filter((c) => c.estado === "contradicho").length ?? 0 },
    contradicciones_reales: contradiccionesReales,
    metricas_hallazgos: m,
    know_how_rosa: (kh ?? []).some((k) => /textura/i.test(`${k.senal} ${k.regla_practica}`)),
    as_is: (procs ?? []).length,
    to_be: (tobe ?? []).length,
    plan: { acciones: acts?.length ?? 0, max_frentes_por_semana: maxFrentes, primera: acts?.[0]?.accion?.slice(0, 90) ?? null },
    entregables: (docs ?? []).map((d) => d.tipo),
    destruye_fortaleza: destruyeFortaleza,
    pass:
      contradiccionesReales.metas && contradiccionesReales.cliente && contradiccionesReales.descuentos &&
      m.cobertura >= 0.85 && m.falsos_positivos === 0 && m.preservacion === 1 &&
      (kh ?? []).length > 0 && (tobe ?? []).length > 0 && (acts?.length ?? 0) > 0 && maxFrentes <= 3 && (docs?.length ?? 0) >= 5 && !destruyeFortaleza,
  };
  writeFileSync(path.resolve(__dirname, "../benchmark/demo-e2e-resultado.json"), JSON.stringify({ fecha: new Date().toISOString(), ...resumen, hallazgos: obtenidos }, null, 2));
  console.log(JSON.stringify(resumen, null, 2));
  if (process.argv.includes("--limpiar")) {
    await sb.from("companies").delete().eq("id", cid);
    console.log("empresa demo borrada");
  }
  process.exit(resumen.pass ? 0 : 1);
}

main().catch((e) => {
  console.error("demo-e2e falló:", e?.message ?? e);
  process.exit(1);
});
