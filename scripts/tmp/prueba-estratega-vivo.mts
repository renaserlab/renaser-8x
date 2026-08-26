/** Prueba viva del estratega (sin escribir en deliverables): mismo contexto que el handler, validación de honestidad. */
import { createClient } from "@supabase/supabase-js";
import { correrEstratega } from "../../src/lib/ai/agents/estratega";
import { detectarAnomalias, tablaResultadosComoTexto } from "../../src/lib/rules/anomalias";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: c } = await sb.from("companies").select("id,nombre,sector,ficha,modelo_operativo,etapa_negocio").ilike("nombre", "%Jard%Renaser%").single();
const [{ data: findings }, { data: metricas }, { data: sueno }, { data: parts }] = await Promise.all([
  sb.from("findings").select("titulo,causa_raiz,impacto,pilar,patron,recomendacion,filtros").eq("company_id", c!.id).neq("estado_revision", "rechazado").limit(40),
  sb.from("company_metricas").select("clave,periodo,valor,valor_texto,estado,nota").eq("company_id", c!.id).limit(80),
  sb.from("interview_responses").select("bloque,pregunta,respuesta, interview_sessions!inner(tipo,company_id)").eq("interview_sessions.company_id", c!.id).not("respuesta", "is", null).limit(80),
  sb.from("participants").select("nombre,puesto,rol").eq("company_id", c!.id),
]);
const ficha = (c!.ficha ?? {}) as Record<string, string>;
const contexto = [
  `EMPRESA: ${c!.nombre} · ${c!.sector ?? ""} · ${ficha.personas ?? "?"} personas · etapa ${c!.etapa_negocio ?? "?"}`,
  `FICHA: ${JSON.stringify(ficha)}`,
  `PERSONAS REALES (para responsables): ${(parts ?? []).map((p) => `${p.nombre} (${p.puesto ?? p.rol})`).join(", ") || "solo el dueño"}`,
  `HALLAZGOS (${findings?.length ?? 0}):\n${(findings ?? []).map((f) => `- [${f.impacto} · ${f.pilar}] ${f.titulo}. Causa: ${f.causa_raiz ?? ""}${f.recomendacion ? `. Rec: ${f.recomendacion}` : ""}`).join("\n")}`,
  `NÚMEROS (con estado):\n${tablaResultadosComoTexto((metricas ?? []) as never)}`,
  `ANOMALÍAS: ${JSON.stringify(detectarAnomalias((metricas ?? []) as never))}`,
  `LO QUE EL DUEÑO CONTÓ:\n${(sueno ?? []).slice(0, 60).map((s) => `- ${s.pregunta} → ${String(s.respuesta).slice(0, 200)}`).join("\n")}`,
].join("\n\n");
console.log(`contexto: ${contexto.length} caracteres, ${findings?.length} hallazgos`);
const t0 = Date.now();
const r = await correrEstratega(contexto);
const p = r.data;
console.log(`generado en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log("\nDESAFÍO:", p.desafio);
console.log("MANDATO éxito:", p.mandato.exito);
console.log("DECISIÓN: de", p.resumen.decision.de, "→ a", p.resumen.decision.a);
console.log("RENUNCIAS:", p.resumen.renuncias.join(" | "));
console.log("PENDIENTES:", p.resumen.pendientes.join(" | "));
console.log("TÍTULOS PROBLEMAS:", p.problemas.map((x) => x.titulo).join(" || "));
console.log("RADIOGRAFÍA:", p.radiografia.map((x) => `${x.indicador}=${x.base} [${x.fuente} · ${x.confianza}]`).join("\n  "));
console.log("ÚLTIMA OPCIÓN:", p.opciones[p.opciones.length - 1].nombre, "→", p.opciones[p.opciones.length - 1].impacto);
console.log("SUPUESTOS:", p.supuestos.map((s) => `${s.supuesto} [señal: ${s.senal}]`).join(" | "));
console.log("OPERATIVO decide:", p.operativo.decisiones.map((d) => `${d.decision}→${d.decide}`).join(" | "));
console.log("PORTAFOLIO:", p.portafolio.map((x) => `${x.decision}: ${x.iniciativa}`).join(" | "));
console.log("APRENDIZAJE:", p.gobierno.aprendizaje);
console.log("NOTA CONFIANZA:", p.nota_confianza);
const chk = {
  "no actuar presente": p.opciones.some((o) => /no actuar/i.test(o.nombre)),
  "canvas honesto (algún por_validar)": Object.values(p.canvas).some((v) => v.estado === "por_validar"),
  "máx 3 problemas": p.problemas.length <= 3,
  "sin jerga hueca ni promesas vacías": !/sinergia|holistic|clase mundial|brindamos calidad|atenci[oó]n personalizada|soluciones integrales/i.test(JSON.stringify(p)),
  "radiografía con fuente": p.radiografia.every((x) => x.fuente.length > 3),
  "portafolio con detener/probar": p.portafolio.some((x) => x.decision === "detener" || x.decision === "probar"),
};
for (const [k, v] of Object.entries(chk)) console.log(v ? "PASS" : "FAIL", "·", k);
