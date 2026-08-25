/**
 * Prueba runtime del Sistema Adaptativo v2 sobre la Cevichería Prueba V2:
 * 1) genera la primera pregunta de empresa_dueno (contexto con ficha + matriz restaurante + tabla vacía)
 * 2) responde con números ("el mes pasado vendí como 25 mil…") → extractor → company_metricas
 * 3) verifica que las métricas quedaron con estado y que el motor de anomalías dispara la señal de caja
 * Ejecutar: node --env-file=.env.local --import=tsx scripts/tmp/prueba-adaptativo.mts
 */
import { createClient } from "@supabase/supabase-js";
import { handleEntrevistaSiguiente } from "../../src/lib/jobs/handlers/entrevista";
import { handleExtraer } from "../../src/lib/jobs/handlers/extraer";
import { detectarAnomalias } from "../../src/lib/rules/anomalias";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: c } = await sb.from("companies").select("id").eq("nombre", "Cevichería Prueba V2").single();
if (!c) throw new Error("empresa no encontrada");
const { data: ses } = await sb.from("interview_sessions").select("id").eq("company_id", c.id).eq("tipo", "empresa_dueno").single();
if (!ses) throw new Error("sesión no encontrada");

// 1) primera pregunta con el contexto nuevo
const r1 = await handleEntrevistaSiguiente({ id: "job-prueba-1", company_id: c.id, payload: { session_id: ses.id } });
console.log("PASO 1 · generadas:", JSON.stringify(r1));
const { data: preg } = await sb.from("interview_responses").select("id,pregunta,bloque").eq("session_id", ses.id).is("respuesta", null).order("orden").limit(1);
if (!preg?.length) throw new Error("no se generó pregunta");
console.log("PREGUNTA:", `[${preg[0].bloque}]`, preg[0].pregunta);

// 2) el dueño responde con números (mes pasado + fiados) → extraer
await sb.from("interview_responses").update({ respuesta: "El mes pasado vendimos como 25 mil soles, pero de eso solo cobramos unos 18 mil porque el resto quedó fiado a los caseros. Después de pagar todo me habrán quedado unos 3 mil. Antes, en 2023, vendíamos como 45 mil al mes, era otra época.", respondido_at: new Date().toISOString() }).eq("id", preg[0].id);
const r2 = await handleExtraer({ id: "job-prueba-2", company_id: c.id, payload: { response_id: preg[0].id } });
console.log("PASO 2 · extraídas:", JSON.stringify(r2));

// 3) métricas y anomalías
const { data: met } = await sb.from("company_metricas").select("clave,periodo,valor,valor_texto,estado").eq("company_id", c.id);
console.log("MÉTRICAS:", JSON.stringify(met, null, 1));
const senales = detectarAnomalias((met ?? []) as never);
console.log("SEÑALES:", JSON.stringify(senales.map((s) => `[${s.regla}] ${s.titulo}`), null, 1));

// 4) segunda pregunta: ¿el entrevistador ve la tabla y pide el mes que falta?
const r3 = await handleEntrevistaSiguiente({ id: "job-prueba-3", company_id: c.id, payload: { session_id: ses.id } });
const { data: preg2 } = await sb.from("interview_responses").select("pregunta,bloque").eq("session_id", ses.id).is("respuesta", null).order("orden").limit(3);
console.log("PASO 4 · siguientes:", JSON.stringify(r3), JSON.stringify(preg2?.map((p) => `[${p.bloque}] ${p.pregunta}`), null, 1));
