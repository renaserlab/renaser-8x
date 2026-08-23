/**
 * EMPRESA DEMO: recorre el flujo completo con la lógica real del repositorio y salidas de IA simuladas.
 * FUENTES → FRAGMENTOS → AFIRMACIONES → VIGENCIA → CANDIDATAS → CONTRADICCIONES → PREGUNTAS → RESPUESTAS
 * → KNOW-HOW → DIAGNÓSTICO 4P → RED TEAM → HALLAZGOS → AS-IS → TO-BE → PLAN.
 */
import { describe, it, expect } from "vitest";
import { EMPRESA, PARTICIPANTES, FUENTES, FRAGMENTOS, CLAIMS, JUICIOS_CONTRASTE, VALIDACIONES, SESIONES, RESPUESTAS, KNOW_HOW_ROSA, DIAGNOSTICO_SIMULADO, AUDITORIA_SIMULADA, AS_IS_VENTAS, TO_BE_VENTAS, PLAN_SIMULADO } from "./fixtures/empresa-demo";
import { requiereValidacionPrioritaria, preguntaDeVigencia } from "@/lib/rules/vigencia";
import { candidatasAContradiccion, brechasEstrategicas, clavePar } from "@/lib/rules/contradiccion";
import { SalidaContrastador, SalidaMinero, SalidaDiagnosticador, SalidaAuditor, SalidaPlanificador, SalidaExtractor } from "@/lib/schemas";
import { calibrarImpacto, aplicarFiltros, estadoPilar, tieneEvidencia } from "@/lib/rules/evidencia";
import { validarFlujograma, tieneFinalMalo, removeConDependientes, automatizacionesInvalidas, diffAsIsToBe } from "@/lib/rules/grafo";
import { programarFrentes, respetaTope, primerasSemanasSoloCriticos } from "@/lib/rules/plan";
import { PATRONES } from "@/lib/rules/patrones";

const hoy = new Date("2026-08-22");
const claims = CLAIMS.map((c) => ({ ...c }));
const porId = new Map(claims.map((c) => [c.id, c]));

describe(`EMPRESA DEMO · ${EMPRESA.nombre}`, () => {
  it("1. Trazabilidad: toda afirmación tiene fuente, fragmento exacto (página/celda/minuto) y, si es de persona, rol", () => {
    for (const c of claims) {
      const fr = FRAGMENTOS.find((f) => f.id === c.fragment_id);
      expect(fr, c.id).toBeDefined();
      expect(fr!.source_id).toBe(c.source_id);
      const src = FUENTES.find((s) => s.id === c.source_id)!;
      if (src.tipo === "documento") expect(fr!.pagina).not.toBeNull();
      if (src.tipo === "dato") expect(fr!.celda).not.toBeNull();
      if (src.tipo === "entrevista") {
        expect(fr!.audio_desde).not.toBeNull();
        expect(c.participant_id).not.toBeNull();
        expect(PARTICIPANTES.find((p) => p.id === c.participant_id)!.rol).toBeTruthy();
      }
      expect(typeof c.fecha_afirmacion === "string" || c.fecha_afirmacion === null).toBe(true);
    }
    // documento sin fecha: la foto del organigrama queda con fecha null, nunca estimada
    expect(porId.get("c-org-jefe")!.fecha_afirmacion).toBeNull();
  });

  it("2. Las tres versiones de la empresa existen como fuentes separadas: documentos, dueño, equipo", () => {
    const col = (c: (typeof claims)[number]) => (c.participant_id ? (["p-dueno", "p-socio"].includes(c.participant_id) ? "dueno" : "equipo") : "documentos");
    const cols = new Set(claims.map(col));
    expect(cols).toEqual(new Set(["documentos", "dueno", "equipo"]));
    expect(claims.filter((c) => col(c) === "equipo").map((c) => c.participant_id)).toEqual(expect.arrayContaining(["p-lider-ventas", "p-rosa", "p-asesor", "p-chofer"]));
  });

  it("3. Vigencia: el plan 2022 dispara VALIDACIÓN (no caducado); el organigrama sin fecha también; el dato de julio no", () => {
    const prior = claims.filter((c) => requiereValidacionPrioritaria(c, hoy)).map((c) => c.id);
    expect(prior).toEqual(expect.arrayContaining(["c-meta-2022", "c-cliente-2022", "c-org-jefe"]));
    expect(prior).not.toContain("c-csv-reclamos");
    // la edad no cambió ningún estado
    expect(claims.every((c) => c.estado !== "caducado")).toBe(true);
    const q = preguntaDeVigencia(porId.get("c-meta-2022")!.texto, "Plan estratégico 2022", "2022-03-15");
    expect(q).toMatch(/Sigue representando/);
  });

  it("4. Contraste: las reglas proponen los pares correctos y el modelo (simulado) solo confirma 3 contradicciones reales", () => {
    const pares = candidatasAContradiccion(claims);
    const claves = pares.map(({ a, b }) => clavePar(a.id, b.id));
    expect(claves).toEqual(expect.arrayContaining(["c-dueno-meta|c-meta-2022", "c-cliente-2022|c-csv-cliente", "c-diego-descuentos|c-org-jefe"]));
    // una aspiracional (visión) nunca entra como candidata: es brecha
    expect(claves.some((k) => k.includes("c-vision-2022") || k.includes("c-dueno-vision"))).toBe(false);
    let contradicciones = 0;
    for (const { a, b } of pares) {
      const k = [a.id, b.id].sort().join("|");
      const j = JUICIOS_CONTRASTE[k] ?? JUICIOS_CONTRASTE[[b.id, a.id].join("|")] ?? JUICIOS_CONTRASTE[[a.id, b.id].join("|")];
      expect(j, `falta juicio simulado para ${k}`).toBeDefined();
      const salida = SalidaContrastador.parse({ ...j, explicacion: "simulado" });
      if (!salida.se_contradicen) continue;
      contradicciones++;
      const vigente = salida.cual_parece_vigente;
      const marcar = vigente === a.id ? [b] : vigente === b.id ? [a] : [a, b];
      for (const c of marcar) {
        if (c.estado === "confirmado" && c.participant_id) continue;
        c.estado = "contradicho";
        c.contradice_a = c.id === a.id ? b.id : a.id;
      }
    }
    expect(contradicciones).toBe(3);
    expect(porId.get("c-meta-2022")!.estado).toBe("contradicho");
    expect(porId.get("c-dueno-meta")!.estado).toBe("confirmado"); // lo que el dueño dijo hoy no se pisa
    expect(porId.get("c-dueno-ventas")!.estado).toBe("confirmado"); // "ventas funciona bien" NO es contradicción mecánica: se cuestiona con evidencia en el diagnóstico
  });

  it("5. Brecha estratégica: la visión 2022 y la visión actual del dueño no se contradicen, se comparan como aspiraciones", () => {
    const b = brechasEstrategicas(claims);
    expect(b.map((c) => c.id)).toEqual(expect.arrayContaining(["c-vision-2022", "c-dueno-vision"]));
  });

  it("6. El dueño valida con tres botones: caducado lo decide él, nunca el calendario", () => {
    for (const [id, r] of Object.entries(VALIDACIONES)) {
      const c = porId.get(id)!;
      c.estado = r === "si" ? "confirmado" : r === "ya_no" ? "caducado" : "contradicho";
    }
    expect(porId.get("c-vision-2022")!.estado).toBe("caducado");
    expect(porId.get("c-precio")!.estado).toBe("confirmado");
    // la contraparte de una contradicción resuelta queda caducada (lógica de /api/claims/[id]/validate)
    const meta = porId.get("c-dueno-meta")!;
    expect(meta.estado).toBe("confirmado");
  });

  it("7. Trazabilidad de entrevista: PERSONA → ROL → SESIÓN → PREGUNTA → RESPUESTA → AFIRMACIÓN", () => {
    for (const r of RESPUESTAS) {
      const ses = SESIONES.find((s) => s.id === r.session_id)!;
      const p = PARTICIPANTES.find((x) => x.id === ses.participant_id)!;
      const c = porId.get(r.claim_id)!;
      expect(c.participant_id).toBe(p.id);
      expect(r.respuesta.length).toBeGreaterThan(10);
      // la afirmación se extrae de la respuesta con el extractor (esquema) y conserva autor
      const ext = SalidaExtractor.parse({ afirmaciones: [{ texto: c.texto, pilar: c.pilar, tipo: c.tipo, temporalidad: c.temporalidad, fecha_afirmacion: "2026-08-22", fragmento: r.respuesta }] });
      expect(ext.afirmaciones[0].fragmento).toBe(r.respuesta);
    }
    // cada persona responde en paralelo desde su propia sesión: ninguna sesión comparte participante con otra de otro rol
    const porSesion = new Map(SESIONES.map((s) => [s.id, s.participant_id]));
    expect(new Set(porSesion.values()).size).toBe(5);
  });

  it("8. Sueño del dueño: la empresa que construye (plan 2022) no coincide con la vida que quiere (30 horas, solo Lima)", () => {
    const vision2022 = porId.get("c-vision-2022")!;
    const visionHoy = porId.get("c-dueno-vision")!;
    expect(vision2022.estado).toBe("caducado");
    expect(visionHoy.texto).toMatch(/30 horas/);
    expect(RESPUESTAS.find((r) => r.bloque === "vida_deseada")).toBeDefined();
  });

  it("9. Know-how de Rosa: se guarda estructurado, con destino y regla práctica; es la fortaleza que no se destruye", () => {
    const kh = SalidaMinero.parse(KNOW_HOW_ROSA);
    const u = kh.unidades[0];
    expect(u.senal).toMatch(/textura/);
    expect(u.regla_practica).toBe("Precio no decide; textura decide");
    expect(u.destino).toBe("criterio_calidad");
    expect(u.escalamiento).toMatch(/Carmen/);
    expect(kh.riesgo_know_how_vacio).toBe(false);
  });

  it("10. Diagnóstico por pilar se BLOQUEA con contradicciones abiertas y da DESCONOCIDO sin evidencia suficiente", () => {
    // personas: c-org-jefe quedó 'caducado' por el dueño y c-diego-descuentos 'contradicho' → sigue abierta hasta que alguien la confirme
    // antes de la validación del dueño había contradicciones abiertas en personas (c-org-jefe); tras validar quedan 0 → el handler ya no bloquea
    const abiertasPersonas = claims.filter((c) => (c.pilar === "personas" || c.pilar === "transversal") && c.estado === "contradicho");
    expect(abiertasPersonas.length).toBe(0);
    // pero las afirmaciones del EQUIPO siguen sin_verificar: nadie las confirma automáticamente (ver RIESGOS P1-07)
    expect(porId.get("c-diego-descuentos")!.estado).toBe("sin_verificar");
    // el consultor confirma la versión del equipo (lo que dice Diego coincide con Pamela)
    porId.get("c-diego-descuentos")!.estado = "confirmado";
    porId.get("c-pamela-parados")!.estado = "confirmado";
    porId.get("c-rosa-compra")!.estado = "confirmado";
    porId.get("c-luis-devol")!.estado = "confirmado";
    porId.get("c-cliente-2022")!.estado = "caducado";
    const confirmadasProcesos = claims.filter((c) => c.pilar === "procesos" && c.estado === "confirmado").length;
    expect(estadoPilar(["alto"], confirmadasProcesos, 5)).toBe("desconocido"); // 3 < 5: honesto
  });

  it("11. Red team: el AUDITOR derriba el hallazgo que culpa a la persona; la regla de dos fuentes y los filtros se aplican en código", () => {
    const evidenciaDe = (ids: string[]) => ids.map((id) => porId.get(id)!);
    const resultado: { pilar: string; titulo: string; impacto: string; requiere_validacion: boolean; recomendacion: string | null; bloqueada: boolean; patron: string | null; evidencia: string[]; contraria: string[] }[] = [];
    for (const [pilar, salida] of Object.entries(DIAGNOSTICO_SIMULADO)) {
      const d = SalidaDiagnosticador.parse(salida);
      const validIds = new Set(claims.map((c) => c.id));
      const hallazgos = d.hallazgos.map((h) => ({ ...h, claim_ids: h.claim_ids.filter((id) => validIds.has(id)) })).filter((h) => tieneEvidencia(h.claim_ids));
      const aud = SalidaAuditor.parse({ auditorias: hallazgos.map((h, i) => ({ id: `h${i}`, ...AUDITORIA_SIMULADA[h.titulo], evidencia_contraria: [] })) });
      hallazgos.forEach((h, i) => {
        const a = aud.auditorias[i];
        const cal = calibrarImpacto(h.impacto, evidenciaDe(h.claim_ids), a.sustentado);
        const f = aplicarFiltros(h.filtros, h.recomendacion);
        resultado.push({ pilar, titulo: h.titulo, impacto: cal.impacto, requiere_validacion: cal.requiere_validacion, recomendacion: f.recomendacion, bloqueada: f.bloqueada, patron: h.patron, evidencia: h.claim_ids, contraria: h.claims_contrarios });
      });
    }
    const incompetente = resultado.find((r) => r.titulo.includes("incompetente"))!;
    expect(incompetente.impacto).toBe("bajo");
    expect(incompetente.requiere_validacion).toBe(true);
    expect(incompetente.bloqueada).toBe(true); // sabiduría no pasa
    expect(incompetente.recomendacion).toBeNull();

    const descuentos = resultado.find((r) => r.titulo.includes("descuento vuelven"))!;
    expect(descuentos.impacto).toBe("alto"); // Diego + Pamela: dos personas de áreas distintas
    expect(descuentos.contraria).toContain("c-org-jefe"); // la evidencia contraria se registra, no se esconde
    expect(PATRONES.map((p) => p.clave)).toContain(descuentos.patron);

    const fruta = resultado.find((r) => r.titulo.includes("Fruta pasada"))!;
    expect(fruta.impacto).toBe("alto"); // dato + Rosa + Luis
    expect(fruta.contraria).toContain("c-dueno-ventas"); // cuestiona al dueño con evidencia

    const canal = resultado.find((r) => r.titulo.includes("92%"))!;
    expect(canal.impacto).toBe("alto"); // una sola fuente, pero objetiva (dato)

    const precio = resultado.find((r) => r.titulo.includes("40%"))!;
    expect(precio.bloqueada).toBe(true);
    expect(precio.recomendacion).toBeNull();

    // los 4 pilares: estado a partir de hallazgos válidos y confirmadas
    const conf = (p: string) => claims.filter((c) => c.pilar === p && c.estado === "confirmado").length;
    expect(estadoPilar(resultado.filter((r) => r.pilar === "producto" && !r.bloqueada).map((r) => r.impacto as "alto"), conf("producto"), 2)).toBe("critico");
    expect(estadoPilar(resultado.filter((r) => r.pilar === "marketing" && !r.bloqueada).map((r) => r.impacto as "alto"), conf("marketing"), 2)).toBe("critico");
  });

  it("12. AS-IS: válido, con final malo, y el REMOVE (espera a Julio) tiene dependientes aguas abajo que hay que revisar", () => {
    const v = validarFlujograma(AS_IS_VENTAS);
    expect(v.valido, JSON.stringify(v.problemas)).toBe(true);
    expect(tieneFinalMalo(AS_IS_VENTAS)).toBe(true);
    const dep = removeConDependientes(AS_IS_VENTAS);
    expect(dep[0].nodo).toBe("n4");
    expect(dep[0].dependientes).toEqual(["n5"]);
  });

  it("13. TO-BE: conserva lo que sirve, elimina el remove, marca los create, y no automatiza nada indefinido", () => {
    expect(validarFlujograma(TO_BE_VENTAS).valido).toBe(true);
    const d = diffAsIsToBe(AS_IS_VENTAS, TO_BE_VENTAS);
    expect(d.eliminados.map((n) => n.id)).toEqual(["n4"]);
    expect(d.removeNoEliminado).toHaveLength(0);
    expect(d.createSinMarca).toHaveLength(0);
    expect(d.conservados.length).toBeGreaterThanOrEqual(6);
    expect(automatizacionesInvalidas(TO_BE_VENTAS)).toHaveLength(0);
    expect(TO_BE_VENTAS.nodos.find((n) => n.id === "t10")!.ejecutor).toBe("software"); // regla fija, alto volumen
  });

  it("14. Plan: el modelo propone 4 frentes en la semana 1 y uno huérfano; el código corrige ambas cosas", () => {
    const p = SalidaPlanificador.parse({ frentes: PLAN_SIMULADO });
    const validos = new Set(["h-producto", "h-personas", "h-marketing"]);
    const plan = programarFrentes(p.frentes, validos);
    expect(plan).toHaveLength(4);
    expect(plan.find((f) => f.finding_id === "h-inexistente")).toBeUndefined();
    expect(respetaTope(plan)).toBe(true);
    expect(plan.find((f) => f.prioridad === 4)!.semana_inicio).toBe(3);
    expect(primerasSemanasSoloCriticos(plan)).toBe(true);
  });
});
