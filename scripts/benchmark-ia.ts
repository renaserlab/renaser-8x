/**
 * FASE 8 — Primera prueba con IA real sobre la EMPRESA DEMO, comparada contra benchmark/esperado.json.
 * Requiere ANTHROPIC_API_KEY (o AI_PROVIDER=gemini + GEMINI_API_KEY). NO usa Supabase: corre los agentes en memoria sobre el fixture.
 *   node --env-file=.env.local --import=tsx scripts/benchmark-ia.ts
 * Registra: omisiones, falsos positivos, preguntas, causalidad, costo (tokens) y latencia. Escribe benchmark/ultimo-resultado.json.
 * Si no hay llave → BLOCKED_EXTERNAL (sale con código 2).
 */
import { writeFileSync, readFileSync } from "fs";
import path from "path";
import { CLAIMS, FUENTES, PARTICIPANTES, RESPUESTAS, AS_IS_VENTAS } from "../tests/fixtures/empresa-demo";
import { correrContrastador } from "../src/lib/ai/agents/contrastador";
import { correrDiagnosticador, correrAuditor } from "../src/lib/ai/agents/diagnosticador";
import { correrEntrevistador } from "../src/lib/ai/agents/entrevistador";
import { candidatasAContradiccion } from "../src/lib/rules/contradiccion";
import { calibrarImpacto, aplicarFiltros } from "../src/lib/rules/evidencia";
import { medir, aprueba, type Esperado } from "../src/lib/benchmark";
import { bancoComoTexto } from "../src/lib/rules/cobertura";

const conLlave = process.env.AI_PROVIDER === "gemini" ? !!process.env.GEMINI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
if (!conLlave) {
  console.error("BLOCKED_EXTERNAL: falta ANTHROPIC_API_KEY (o AI_PROVIDER=gemini + GEMINI_API_KEY)");
  process.exit(2);
}

const esperado = JSON.parse(readFileSync(path.resolve(__dirname, "../benchmark/esperado.json"), "utf8")) as Esperado;
const rolDe = (pid: string | null) => PARTICIPANTES.find((p) => p.id === pid)?.rol ?? null;
const fuenteDe = (c: (typeof CLAIMS)[number]) => {
  const s = FUENTES.find((f) => f.id === c.source_id)!;
  return c.participant_id ? `${rolDe(c.participant_id)} (entrevista)` : `${s.nombre} (${s.tipo})`;
};
const claimsTxt = (cs: typeof CLAIMS) => cs.map((c) => `[${c.id}] (${fuenteDe(c)}; fuente_id ${c.source_id}${c.participant_id ? `; persona ${c.participant_id}` : ""}; tipo ${c.tipo}; ${c.temporalidad}; ${c.participant_id ? "confirmado" : c.estado}; fecha ${c.fecha_afirmacion ?? "desconocida"}) ${c.texto}`).join("\n");

async function main() {
  const t0 = Date.now();
  let tokens = 0;
  const registro: Record<string, unknown> = { fecha: new Date().toISOString(), version_prompt: process.env.VERSION_PROMPT ?? "v4.1" };

  // 1. Contraste real
  const contradicciones: { a: string; b: string }[] = [];
  const preguntas: string[] = [];
  for (const { a, b } of candidatasAContradiccion(CLAIMS)) {
    const ca = CLAIMS.find((c) => c.id === a.id)!, cb = CLAIMS.find((c) => c.id === b.id)!;
    const r = await correrContrastador({ id: ca.id, texto: ca.texto, fuente: fuenteDe(ca), fecha: ca.fecha_afirmacion, temporalidad: ca.temporalidad }, { id: cb.id, texto: cb.texto, fuente: fuenteDe(cb), fecha: cb.fecha_afirmacion, temporalidad: cb.temporalidad });
    tokens += r.tokens_entrada + r.tokens_salida;
    if (r.data.se_contradicen) contradicciones.push({ a: a.id, b: b.id });
    if (r.data.pregunta_sugerida) preguntas.push(r.data.pregunta_sugerida);
  }
  registro.contradicciones_detectadas = contradicciones;

  // 2. Entrevistador: una pregunta de sueño del dueño con bloques sin cubrir
  const e = await correrEntrevistador([`TIPO DE SESIÓN: sueno_dueno`, `PARTICIPANTE: puesto: Gerente general · rol: dueno`, `BLOQUES SIN CUBRIR (5): [empresa_deseada] Empresa deseada, [vida_deseada] Vida deseada, [rol] Rol, [exito] Éxito, [verdad_dificil] Verdad difícil`, `PREGUNTAS YA RESPONDIDAS POR ESTA PERSONA (1):\n- [origen] ¿Por qué empezaste? → Porque quería independencia.`, `RESPUESTAS DE OTRAS SESIONES (0)`, `AFIRMACIONES POR VALIDAR O CONTRADICHAS (0)`, `PILARES CON INFORMACIÓN INSUFICIENTE: ninguno`, `BANCO:\n${bancoComoTexto("sueno_dueno")}`].join("\n\n"));
  tokens += e.tokens_entrada + e.tokens_salida;
  registro.pregunta_sueno = e.data;

  // 3. Diagnóstico por pilar + auditor, con calibración y filtros en código
  const porPilar: Record<string, unknown>[] = [];
  registro.por_pilar = porPilar;
  const obtenidos: { titulo: string; causa_raiz: string; pilar: string; patron: string | null; impacto: string; preserva: boolean; claim_ids: string[] }[] = [];
  const sueno = RESPUESTAS.filter((r) => r.session_id === "ses-dueno-sueno").map((r) => `- [${r.bloque}] ${r.pregunta} → ${r.respuesta}`).join("\n");
  for (const pilar of ["personas", "procesos", "producto", "marketing"]) {
    const delPilar = CLAIMS.filter((c) => c.pilar === pilar || c.pilar === "transversal");
    const del = [...delPilar, ...CLAIMS.filter((c) => c.participant_id === "p-rosa" && !delPilar.includes(c))]; // + afirmaciones de la persona del know-how (como el worker)
    const ctx = [`EMPRESA: Frutas del Valle SAC · sector: distribución de alimentos`, `PILAR: ${pilar}`, `AFIRMACIONES (${del.length}):`, claimsTxt(del), `PROCESOS:`, pilar === "procesos" ? JSON.stringify(AS_IS_VENTAS) : "(sin procesos dibujados)", `KNOW-HOW MINADO (1):\n- Rosa (Compradora) [alta, no documentado]: compra de palta · señal: textura de la cáscara · regla: precio no decide, textura decide · afirmaciones de esta persona: ${CLAIMS.filter((c) => c.participant_id === "p-rosa").map((c) => c.id).join(", ")}`, `SUEÑO DEL DUEÑO:\n${sueno}`].join("\n\n");
    const d = await correrDiagnosticador(ctx);
    tokens += d.tokens_entrada + d.tokens_salida;
    porPilar.push({ pilar, modelo: d.modelo, latencia_ms: d.latencia_ms, hallazgos: d.data.hallazgos.map((h) => ({ titulo: h.titulo, patron: h.patron, impacto: h.impacto, claim_ids: h.claim_ids, preserva: !!h.preserva, causa_raiz: h.causa_raiz })) });
    const validos = d.data.hallazgos.filter((h) => h.claim_ids.some((id) => CLAIMS.some((c) => c.id === id)));
    const a = await correrAuditor([`HALLAZGOS:`, JSON.stringify(validos.map((h, i) => ({ id: `h${i}`, titulo: h.titulo, causa_raiz: h.causa_raiz, impacto: h.impacto, preserva: !!h.preserva, veredicto: h.veredicto ?? null, claim_ids: h.claim_ids }))), `TODAS LAS AFIRMACIONES:`, claimsTxt(CLAIMS)].join("\n\n"));
    tokens += a.tokens_entrada + a.tokens_salida;
    validos.forEach((h, i) => {
      const au = a.data.auditorias.find((x) => x.id === `h${i}`);
      if (au?.duplicado_de) return; // el worker descarta duplicados marcados por el auditor (diagnostico.ts)
      const ev = h.claim_ids.map((id) => CLAIMS.find((c) => c.id === id)!).filter(Boolean).map((c) => ({ id: c.id, source_id: c.source_id, participant_id: c.participant_id, estado: c.participant_id ? "confirmado" : c.estado, source_tipo: c.source_tipo, participant_rol: rolDe(c.participant_id), source_origen: FUENTES.find((f) => f.id === c.source_id)?.origen ?? null }));
      const cal = calibrarImpacto(h.impacto, ev, au ? au.sustentado && !au.culpa_persona_sin_auditar && !au.benchmark_como_hecho : null);
      const f = aplicarFiltros(h.filtros, h.recomendacion);
      if (!cal.requiere_validacion && (f.recomendacion !== null || h.preserva)) obtenidos.push({ titulo: h.titulo, causa_raiz: h.causa_raiz, pilar, patron: h.patron, impacto: cal.impacto, preserva: !!h.preserva, claim_ids: h.claim_ids });
    });
  }
  // Consolidación cross-pilar idéntica a handleConsolidar: misma evidencia exacta, o mismo patrón con
  // evidencia subconjunto (misma naturaleza problema/fortaleza) → queda el más evidenciado.
  const esDuplicado = (h: (typeof obtenidos)[number]) =>
    obtenidos.some((g) => g !== h && g.preserva === h.preserva && (
      (h.claim_ids.slice().sort().join("|") === g.claim_ids.slice().sort().join("|") && obtenidos.indexOf(g) < obtenidos.indexOf(h)) ||
      (((h.patron !== null && h.patron === g.patron) || (h.preserva && g.preserva)) && h.claim_ids.length < g.claim_ids.length && h.claim_ids.every((id) => g.claim_ids.includes(id)))
    ));
  const consolidados = obtenidos.filter((h) => !esDuplicado(h));
  registro.consolidados = { antes: obtenidos.length, despues: consolidados.length };
  const m = medir(esperado, consolidados, contradicciones, preguntas);
  const a = aprueba(m);
  Object.assign(registro, { metricas: m, aprueba: a, hallazgos_visibles: obtenidos, tokens, costo_usd_estimado: +((tokens / 1_000_000) * 6).toFixed(2), latencia_total_s: Math.round((Date.now() - t0) / 1000) });
  writeFileSync(path.resolve(__dirname, "../benchmark/ultimo-resultado.json"), JSON.stringify(registro, null, 2));
  console.log(JSON.stringify({ metricas: m, aprueba: a, tokens, latencia_s: registro.latencia_total_s }, null, 2));
  process.exit(a.ok ? 0 : 1);
}

main().catch((e) => {
  console.error("benchmark falló:", e?.message ?? e);
  if (typeof e?.raw === "string") {
    writeFileSync(path.resolve(__dirname, "../benchmark/ultimo-error.txt"), e.raw);
    console.error("salida cruda completa en benchmark/ultimo-error.txt (primeros 800 chars): " + e.raw.slice(0, 800));
  }
  process.exit(1);
});
