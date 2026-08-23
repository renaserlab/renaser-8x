/**
 * Fase 13: 30 empresas simultáneas + recuperación. Simulación determinista de la cola con la semántica real de
 * take_job/recover/heartbeat/worker. No mide Postgres ni la red: mide la lógica de planificación y recuperación.
 */
import { describe, it, expect } from "vitest";
import { ColaSimulada, CONFIG_DEFAULT } from "@/lib/jobs/simulador";
import { PRIORIDAD } from "@/lib/jobs/queue";

/** 30 empresas × (3 documentos de 4 tramos + 6 entrevistas con 8 preguntas + 1 contraste + 4 diagnósticos + 2 procesos) */
function dataset(cola: ColaSimulada, empresas = 30, semilla = 7) {
  let r = semilla;
  const rnd = () => ((r = (r * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let e = 0; e < empresas; e++) {
    const c = `emp-${e}`;
    for (let d = 0; d < 3; d++) for (let t = 0; t < 4; t++) cola.encolar({ company_id: c, tipo: "extraer", prioridad: PRIORIDAD.extraer, duracion_ms: 20_000 + rnd() * 40_000, idempotency_key: `${c}-doc${d}-t${t}` });
    // las preguntas llegan una tras otra: cada persona responde cada ~60 s (así ocurre en la realidad, no todas a la vez)
    for (let s = 0; s < 6; s++) for (let q = 0; q < 8; q++) cola.encolar({ company_id: c, tipo: "entrevista_siguiente", prioridad: PRIORIDAD.entrevista, duracion_ms: 3_000 + rnd() * 2_000, created_at: q * 90_000 + s * 7_000 + e * 500, idempotency_key: `${c}-ses${s}-q${q}` });
    cola.encolar({ company_id: c, tipo: "contrastar", prioridad: PRIORIDAD.contrastar, duracion_ms: 30_000, idempotency_key: `${c}-contrast` });
    for (const p of ["personas", "procesos", "producto", "marketing"]) cola.encolar({ company_id: c, tipo: "diagnosticar", prioridad: PRIORIDAD.diagnosticar, duracion_ms: 60_000, idempotency_key: `${c}-diag-${p}` });
    for (let p = 0; p < 2; p++) cola.encolar({ company_id: c, tipo: "generar_proceso", prioridad: PRIORIDAD.proceso_voz, duracion_ms: 8_000, idempotency_key: `${c}-proc${p}` });
  }
}

describe("13 · 30 empresas simultáneas", () => {
  // 30 empresas con 6 personas respondiendo a la vez exige ~18 llamadas simultáneas al proveedor: 3 workers × 6.
  const cola = new ColaSimulada({ ...CONFIG_DEFAULT, workers: 3, max_global: 18 });
  dataset(cola);
  const total = cola.jobs.length;
  const res = cola.correr({ max_ms: 4 * 3600_000 });
  const m = cola.metricas();

  it(`todos los trabajos terminan (${total}) sin pérdida ni mezcla`, () => {
    expect(res.pendientes).toBe(0);
    expect(m.hechos + m.fallidos).toBe(total);
    expect(m.fallidos).toBe(0);
    // ningún job cambió de empresa
    expect(cola.jobs.every((j) => j.idempotency_key.startsWith(j.company_id))).toBe(true);
  });
  it("13.2 prioridad: una pregunta de entrevista nunca espera detrás de los documentos de otra empresa (p95 de espera interactiva < 2 min)", () => {
    const interactivos = cola.jobs.filter((j) => j.prioridad < 5 && j.estado === "hecho").map((j) => j.espera_ms ?? 0).sort((a, b) => a - b);
    const p95 = interactivos[Math.floor(interactivos.length * 0.95)];
    expect(p95).toBeLessThan(120_000);
  });
  it("13.1 fairness: ninguna empresa tiene más de 2 trabajos pesados corriendo a la vez (propiedad de take_job)", () => {
    // reconstrucción: en cada toma, los pesados corriendo por empresa ≤ 2 — lo garantiza takeJob; comprobamos por construcción con una cola pequeña
    const c2 = new ColaSimulada({ ...CONFIG_DEFAULT, workers: 1, concurrencia_por_worker: 10, max_global: 10 });
    for (let i = 0; i < 8; i++) c2.encolar({ company_id: "A", tipo: "extraer", prioridad: 5, duracion_ms: 60_000, idempotency_key: `A${i}` });
    for (let i = 0; i < 2; i++) c2.encolar({ company_id: "B", tipo: "extraer", prioridad: 5, duracion_ms: 60_000, idempotency_key: `B${i}` });
    const tomados: string[] = [];
    for (let i = 0; i < 10; i++) { const j = c2.takeJob(); if (j) tomados.push(j.company_id); }
    expect(tomados.filter((x) => x === "A")).toHaveLength(2);
    expect(tomados.filter((x) => x === "B")).toHaveLength(2);
  });
  it("tope global: nunca hay más de max_global corriendo aunque haya más workers × concurrencia", () => {
    const c3 = new ColaSimulada({ ...CONFIG_DEFAULT, workers: 5, concurrencia_por_worker: 6, max_global: 12 });
    for (let i = 0; i < 100; i++) c3.encolar({ company_id: `e${i % 30}`, tipo: "extraer", prioridad: 5, duracion_ms: 60_000, idempotency_key: `g${i}` });
    let max = 0;
    for (let i = 0; i < 60; i++) { const j = c3.takeJob(); if (!j) break; max = Math.max(max, c3.corriendo().length); }
    expect(max).toBeLessThanOrEqual(12);
  });
  it("métricas: profundidad, espera, latencia, reintentos, costo (registradas en el reporte)", () => {
    expect(m.reintentos).toBe(0);
    expect(m.espera_p95).toBeGreaterThan(0);
    expect(m.costo_usd).toBeGreaterThan(0);
    console.log("CARGA-30 →", JSON.stringify({ tiempo_min: Math.round(res.tiempo_ms / 60_000), ...m }, null, 0));
  });
});

describe("13.3 · recovery: nada se pierde", () => {
  it("worker muerto: sus trabajos vencen el lease, vuelven a pendiente y los termina el otro worker", () => {
    const cola = new ColaSimulada({ ...CONFIG_DEFAULT, workers: 2, lease_ms: 2 * 60_000 });
    for (let i = 0; i < 20; i++) cola.encolar({ company_id: `e${i % 3}`, tipo: "extraer", prioridad: 5, duracion_ms: 30_000, idempotency_key: `w${i}` });
    const r = cola.correr({ max_ms: 60 * 60_000, matarWorkerEn: 10_000 });
    expect(r.pendientes).toBe(0);
    expect(cola.metricas().fallidos).toBe(0);
    expect(cola.eventos.some((e) => e.startsWith("worker 0 murió"))).toBe(true);
    expect(cola.eventos.some((e) => e.startsWith("barrido:"))).toBe(true);
  });
  it("rate limit transitorio: reintento con backoff dentro del mismo intento; el trabajo termina", () => {
    const cola = new ColaSimulada(CONFIG_DEFAULT);
    cola.encolar({ company_id: "e", tipo: "extraer", prioridad: 5, duracion_ms: 10_000, falla: "rate_limit", fallas_restantes: 2, idempotency_key: "rl" });
    cola.correr({ max_ms: 600_000 });
    const j = cola.jobs[0];
    expect(j.estado).toBe("hecho");
    expect(j.intentos).toBe(1);
    expect((j.latencia_ms ?? 0) >= 10_000 + 1000 + 4000).toBe(true);
  });
  it("proveedor caído persistente: 3 intentos y fallido visible, no desaparece", () => {
    const cola = new ColaSimulada({ ...CONFIG_DEFAULT, barrido_ms: 1000 });
    cola.encolar({ company_id: "e", tipo: "diagnosticar", prioridad: 7, duracion_ms: 10_000, falla: "proveedor_caido", fallas_restantes: 99, idempotency_key: "down" });
    cola.correr({ max_ms: 3600_000 });
    const j = cola.jobs[0];
    expect(j.estado).toBe("fallido");
    expect(j.intentos).toBe(3);
    expect(j.error).toBe("proveedor_caido");
  });
  it("salida JSON inválida y archivo ilegible: fallan el intento, reintentan, y si persiste quedan fallidos con el error", () => {
    const cola = new ColaSimulada({ ...CONFIG_DEFAULT, barrido_ms: 1000 });
    cola.encolar({ company_id: "e", tipo: "extraer", prioridad: 5, duracion_ms: 5_000, falla: "json_invalido", fallas_restantes: 1, idempotency_key: "json" });
    cola.encolar({ company_id: "e", tipo: "extraer", prioridad: 5, duracion_ms: 5_000, falla: "archivo_ilegible", fallas_restantes: 99, idempotency_key: "file" });
    cola.correr({ max_ms: 3600_000 });
    expect(cola.jobs[0].estado).toBe("hecho");
    expect(cola.jobs[0].intentos).toBe(2);
    expect(cola.jobs[1].estado).toBe("fallido");
    expect(cola.jobs[1].error).toBe("archivo_ilegible");
  });
  it("timeout: el lease vence, el barrido lo devuelve, y el heartbeat evita que un trabajo largo pero vivo se duplique", () => {
    const cola = new ColaSimulada({ ...CONFIG_DEFAULT, workers: 1, lease_ms: 2 * 60_000 });
    cola.encolar({ company_id: "e", tipo: "extraer", prioridad: 5, duracion_ms: 8 * 60_000, idempotency_key: "largo" });
    cola.correr({ max_ms: 20 * 60_000 });
    expect(cola.jobs[0].estado).toBe("hecho");
    expect(cola.jobs[0].intentos).toBe(1); // nunca se duplicó gracias al heartbeat
  });
  it("job duplicado: la clave idempotente lo ignora", () => {
    const cola = new ColaSimulada(CONFIG_DEFAULT);
    expect(cola.encolar({ company_id: "e", tipo: "extraer", prioridad: 5, duracion_ms: 1, idempotency_key: "dup" })).not.toBeNull();
    expect(cola.encolar({ company_id: "e", tipo: "extraer", prioridad: 5, duracion_ms: 1, idempotency_key: "dup" })).toBeNull();
    expect(cola.jobs).toHaveLength(1);
  });
  it("navegador cerrado: el trabajo ya estaba en la cola; termina igual y el resultado espera en la base", () => {
    const cola = new ColaSimulada(CONFIG_DEFAULT);
    cola.encolar({ company_id: "e", tipo: "entrevista_siguiente", prioridad: 1, duracion_ms: 3000, idempotency_key: "nav" });
    cola.correr({ max_ms: 60_000 });
    expect(cola.jobs[0].estado).toBe("hecho");
  });
});
