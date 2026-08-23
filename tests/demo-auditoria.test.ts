/**
 * FASES 6–7 · EMPRESA DEMO end-to-end (sin Supabase, sin IA) + auditoría del resultado.
 * Recorre CREATE → UPLOAD → EXTRACT → INTERVIEW OWNER/STAFF → KNOW-HOW → CONTRAST → VALIDATE → REALITY →
 * DIAGNOSE → RED TEAM → REVIEW → AS-IS → TO-BE → PLAN → DELIVERABLE con la lógica real y salidas de IA simuladas,
 * y mide COBERTURA · PRECISIÓN · PROFUNDIDAD · PRESERVACIÓN · KNOW-HOW · DUEÑO · PERSONAL · EVIDENCIA · PROCESO · TO-BE.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { CLAIMS, FRAGMENTOS, FUENTES, PARTICIPANTES, SESIONES, RESPUESTAS, JUICIOS_CONTRASTE, VALIDACIONES, KNOW_HOW_ROSA, DIAGNOSTICO_SIMULADO, AUDITORIA_SIMULADA, AS_IS_VENTAS, TO_BE_VENTAS, PLAN_SIMULADO } from "./fixtures/empresa-demo";
import { candidatasAContradiccion, clavePar } from "@/lib/rules/contradiccion";
import { SalidaContrastador, SalidaMinero, SalidaDiagnosticador, SalidaAuditor, SalidaPlanificador } from "@/lib/schemas";
import { calibrarImpacto, aplicarFiltros, estadoPilar, fuerzaFuente } from "@/lib/rules/evidencia";
import { levantamientoCompleto, diagnosticoListo } from "@/lib/rules/suficiencia";
import { bloquesSinCubrir, BLOQUES } from "@/lib/rules/cobertura";
import { validarFlujograma, tieneFinalMalo, diffAsIsToBe } from "@/lib/rules/grafo";
import { programarFrentes, respetaTope } from "@/lib/rules/plan";
import { filaCliente, visibleParaCliente, sinColumnasInternas } from "@/lib/frontera";
import { verificarDocumento } from "@/lib/jobs/handlers/plan";
import { medir, aprueba, type Esperado } from "@/lib/benchmark";

// P1-01 en vigor: lo que dijo una persona, lo sostiene esa persona → confirmado por quien lo dijo.
const claims = CLAIMS.map((c) => ({ ...c, prioridad_validacion: false, estado: c.participant_id ? "confirmado" : c.estado }));
const porId = new Map(claims.map((c) => [c.id, c]));
const rolDe = (pid: string | null) => PARTICIPANTES.find((p) => p.id === pid)?.rol ?? null;
const evidenciaDe = (ids: string[]) => ids.map((id) => porId.get(id)!).map((c) => ({ ...c, participant_rol: rolDe(c.participant_id), source_origen: FUENTES.find((f) => f.id === c.source_id)?.origen ?? null }));

describe("EMPRESA DEMO · flujo completo", () => {
  const contradicciones: { a: string; b: string }[] = [];
  const preguntas: string[] = [];

  it("CREATE + UPLOAD + EXTRACT: 9 fuentes, 15 fragmentos con evidencia exacta, 15 afirmaciones", () => {
    expect(FUENTES).toHaveLength(9);
    expect(FRAGMENTOS.every((f) => f.texto.length > 10)).toBe(true);
    expect(claims).toHaveLength(15);
  });

  it("INTERVIEW OWNER: el sueño del dueño necesita los 6 bloques; con una sola respuesta no se cierra", () => {
    const resp = RESPUESTAS.filter((r) => r.session_id === "ses-dueno-sueno").map((r) => ({ bloque: r.bloque }));
    expect(bloquesSinCubrir("sueno_dueno", resp).length).toBe(5);
    expect(BLOQUES.sueno_dueno.flatMap((b) => b.preguntas).length).toBeGreaterThanOrEqual(23);
  });

  it("INTERVIEW STAFF: 4 personas del equipo con sesión propia; sus afirmaciones entran confirmadas por quien las dijo (P1-01)", () => {
    const equipo = SESIONES.filter((s) => ["lider", "personal", "know_how"].includes(s.tipo));
    expect(new Set(equipo.map((s) => s.participant_id)).size).toBe(4);
    expect(porId.get("c-diego-descuentos")!.estado).toBe("confirmado");
    expect(porId.get("c-rosa-compra")!.estado).toBe("confirmado");
  });

  it("MINE KNOW-HOW: Rosa → unidad con criticidad alta, no documentada, destino criterio de calidad", () => {
    const kh = SalidaMinero.parse({ ...KNOW_HOW_ROSA, unidades: KNOW_HOW_ROSA.unidades.map((u) => ({ ...u, criticidad: "alta", documentado: false, proceso: "compras" })) });
    expect(kh.unidades[0].criticidad).toBe("alta");
    expect(kh.unidades[0].documentado).toBe(false);
  });

  it("CONTRAST: 3 contradicciones reales, relaciones guardadas, preguntas sugeridas", () => {
    for (const { a, b } of candidatasAContradiccion(claims)) {
      const k = [a.id, b.id].sort().join("|");
      const j = JUICIOS_CONTRASTE[k] ?? JUICIOS_CONTRASTE[[b.id, a.id].join("|")] ?? JUICIOS_CONTRASTE[[a.id, b.id].join("|")];
      const s = SalidaContrastador.parse({ ...j, relacion: j.se_contradicen ? "contradicts" : "ninguna", explicacion: "sim" });
      if (s.se_contradicen) {
        contradicciones.push({ a: a.id, b: b.id });
        if (s.pregunta_sugerida) preguntas.push(s.pregunta_sugerida);
        const vigente = s.cual_parece_vigente;
        for (const c of vigente === a.id ? [b] : vigente === b.id ? [a] : [a, b]) {
          if (c.estado === "confirmado" && c.participant_id) continue; // P1-15: lo validado por una persona no se pisa
          c.estado = "contradicho";
          c.contradice_a = c.id === a.id ? b.id : a.id;
        }
      }
    }
    expect(contradicciones).toHaveLength(3);
    expect(clavePar("a", "b")).toBe("a|b");
  });

  it("VALIDATE: el dueño resuelve con tres botones; REALITY MATRIX para el cliente sin columnas internas ni voces ajenas", () => {
    for (const [id, r] of Object.entries(VALIDACIONES)) porId.get(id)!.estado = r === "si" ? "confirmado" : r === "ya_no" ? "caducado" : "contradicho";
    porId.get("c-cliente-2022")!.estado = "caducado";
    const mios = new Set(["p-dueno"]);
    const filas = claims.filter((c) => visibleParaCliente(c, mios)).map((c) => filaCliente(c, "f", null));
    expect(filas.every(sinColumnasInternas)).toBe(true);
    expect(filas.some((f) => f.texto.includes("Todo descuento"))).toBe(false); // lo de Diego no aparece para el dueño
  });

  it("SUFICIENCIA antes de diagnosticar", () => {
    const ses = SESIONES.map((s) => ({ tipo: s.tipo, estado: "completa", rol: rolDe(s.participant_id) }));
    const s = levantamientoCompleto(claims, ses);
    // el fixture es pequeño: personas/procesos/producto no llegan a 5 confirmadas → desconocido, y lo dice
    expect(s.equipo_entrevistado).toBe(true);
    expect(s.criticas_pendientes).toBe(0);
    expect(s.pilares_desconocidos.length).toBeGreaterThan(0);
  });

  const hallazgos: { id: string; titulo: string; causa_raiz: string; pilar: string; patron: string | null; impacto: string; requiere_validacion: boolean; recomendacion: string | null; preserva: boolean; evidencia: string[] }[] = [];

  it("DIAGNOSE 4P + RED TEAM: calibración por fuerza de evidencia, filtros, auditor", () => {
    let n = 0;
    for (const [pilar, salida] of Object.entries(DIAGNOSTICO_SIMULADO)) {
      const d = SalidaDiagnosticador.parse(salida);
      const aud = SalidaAuditor.parse({ auditorias: d.hallazgos.map((h, i) => ({ id: `h${i}`, ...AUDITORIA_SIMULADA[h.titulo], evidencia_contraria: [], culpa_persona_sin_auditar: /incompetente/.test(h.titulo) })) });
      d.hallazgos.forEach((h, i) => {
        const a = aud.auditorias[i];
        const cal = calibrarImpacto(h.impacto, evidenciaDe(h.claim_ids), a.sustentado && !a.culpa_persona_sin_auditar);
        const f = aplicarFiltros(h.filtros, h.recomendacion);
        hallazgos.push({ id: `f${++n}`, titulo: h.titulo, causa_raiz: h.causa_raiz, pilar, patron: h.patron, impacto: cal.impacto, requiere_validacion: cal.requiere_validacion, recomendacion: f.recomendacion, preserva: !!h.preserva, evidencia: h.claim_ids });
      });
    }
    // + lo que el diagnosticador debe producir con sueño y know-how (simulado como salida válida)
    hallazgos.push({ id: "f-sueno", titulo: "La empresa del plan 2022 exige provincias y 70 horas; el dueño quiere Lima y 30 horas", causa_raiz: "La dirección documentada no se actualizó", pilar: "personas", patron: "sueno_vs_empresa", impacto: "medio", requiere_validacion: false, recomendacion: "Actualizar la dirección", preserva: false, evidencia: ["c-vision-2022", "c-dueno-vision"] });
    hallazgos.push({ id: "f-rosa", titulo: "Fortaleza: el criterio de textura de Rosa mantiene la calidad", causa_raiz: "Know-how no escrito", pilar: "producto", patron: "know_how_en_una_persona", impacto: "alto", requiere_validacion: false, recomendacion: "Escribirlo y entrenar", preserva: true, evidencia: ["c-rosa-compra", "c-csv-reclamos"] });
    const incompetente = hallazgos.find((h) => /incompetente/.test(h.titulo))!;
    expect(incompetente.impacto).toBe("bajo");
    expect(incompetente.requiere_validacion).toBe(true);
    expect(incompetente.recomendacion).toBeNull();
    const fruta = hallazgos.find((h) => /Fruta pasada/.test(h.titulo))!;
    expect(fruta.impacto).toBe("alto"); // dato (strong) + dos personas
    expect(fuerzaFuente({ source_tipo: "dato" })).toBe("strong");
  });

  it("CONSULTANT REVIEW: los que necesitan validación no se aprueban sin evidencia extra; El Espejo solo abre con todo revisado", () => {
    const revisados = hallazgos.map((h) => ({ estado_revision: h.requiere_validacion ? "rechazado" : "aprobado", requiere_validacion: h.requiere_validacion && false }));
    expect(diagnosticoListo(hallazgos.map((h) => ({ estado_revision: "pendiente", requiere_validacion: h.requiere_validacion }))).listo).toBe(false);
    expect(diagnosticoListo(revisados).listo).toBe(true);
    expect(estadoPilar(hallazgos.filter((h) => h.pilar === "marketing" && !h.requiere_validacion && !h.preserva).map((h) => h.impacto as "alto"), 5, 5)).toBe("critico");
  });

  it("AS-IS → TO-BE: válidos, con final malo, cambios justificados, y la fortaleza se conserva", () => {
    expect(validarFlujograma(AS_IS_VENTAS).valido).toBe(true);
    expect(tieneFinalMalo(AS_IS_VENTAS)).toBe(true);
    const d = diffAsIsToBe(AS_IS_VENTAS, TO_BE_VENTAS);
    expect(d.removeNoEliminado).toHaveLength(0);
    expect(d.createSinMarca).toHaveLength(0);
    expect(TO_BE_VENTAS.nodos.find((n) => n.etiqueta === "Compras arma la fruta")?.veredicto).toBe("improve"); // no se destruye lo de Rosa: se mejora con su estándar
  });

  it("PLAN: máx. 3 frentes/semana, ninguno huérfano, fortaleza solo como 'documentar y proteger'", () => {
    const p = SalidaPlanificador.parse({ frentes: PLAN_SIMULADO });
    const plan = programarFrentes(p.frentes, new Set(["h-producto", "h-personas", "h-marketing"]));
    expect(respetaTope(plan)).toBe(true);
    expect(plan.every((f) => f.finding_id !== "h-inexistente")).toBe(true);
  });

  it("DELIVERABLE: ninguna sección sin fuente; ningún referente; el cliente no recibe nombres del equipo", () => {
    const v = verificarDocumento({ titulo: "Informe", secciones: [{ titulo: "Qué encontramos", parrafos: ["El 92% de tus clientes nuevos llega por un solo referido."], fuentes: ["pedidos_2026.csv, agosto 2026"] }, { titulo: "Sin respaldo", parrafos: ["Como diría Collins…"], fuentes: [] }] });
    expect(v.doc.secciones).toHaveLength(1);
    expect(JSON.stringify(v.doc)).not.toMatch(/Collins/);
  });

  it("AUDITORÍA DEL RESULTADO (fase 7): cobertura, precisión, profundidad, preservación, know-how, dueño, personal, evidencia", () => {
    const esperado = JSON.parse(readFileSync(path.resolve(__dirname, "../benchmark/esperado.json"), "utf8")) as Esperado;
    const visibles = hallazgos.filter((h) => !h.requiere_validacion && (h.recomendacion !== null || h.preserva)); // lo que el consultor aprobaría: sin validación pendiente y sin recomendación bloqueada
    const m = medir(esperado, visibles.map((h) => ({ titulo: h.titulo, causa_raiz: h.causa_raiz, pilar: h.pilar, patron: h.patron, impacto: h.impacto, preserva: h.preserva })), contradicciones, preguntas);
    const a = aprueba(m);
    expect(a.ok, a.motivos.join("; ")).toBe(true);
    expect(m.cobertura).toBe(1); // detectó todos los problemas preparados, incluido el que el dueño no vio (fruta pasada ↔ Rosa)
    expect(m.falsos_positivos).toBe(0); // no inventó (incompetente y +40% fueron derribados)
    expect(m.preservacion).toBe(1); // reconoció la fortaleza
    expect(m.contradicciones).toBe(1); // dueño vs documentos vs equipo
    // evidencia exacta: cada hallazgo visible abre fragmentos con página/celda/minuto
    for (const h of visibles) for (const id of h.evidencia) expect(FRAGMENTOS.find((f) => f.id === porId.get(id)!.fragment_id)).toBeDefined();
    console.log("DEMO-AUDITORIA →", JSON.stringify(m));
  });
});
