/**
 * EL MOTOR DE LA ESTRATEGIA (spec-estrategia-8x.md §5 y §9.3), con la BASE FALSA y un PROVEEDOR FALSO que cuenta las
 * llamadas: ningún modelo real, ninguna base real. La empresa es la ficticia «Frutas del Valle» (y el consultorio
 * ficticio, casi sin datos) de tests/fixtures/estrategia-falsa.ts.
 *
 * Lo que se fija:
 *  - leer la empresa: tabla ausente sin romper, lectura crítica que lanza;
 *  - pedir la estrategia: crea la versión con lo congelado, encola dos lentes con su clave sin hora y guarda sus ids;
 *    y antes de gastar, el mínimo, el tope de la empresa, la que está en curso, el tope diario y el de «a la vez»;
 *  - las lentes: cada una guarda su columna; las dos a la vez encolan UN equipo rojo; una lente reintentada con su
 *    columna llena no llama al modelo; el contexto de cada una no trae la otra; las llamadas son largas y con su
 *    agente; una que no valida no encola nada, no vuelve a la cola y deja guardarse a la otra;
 *  - el equipo rojo: tres llamadas en el caso normal y cuatro con reparación; con cifras sin origen, una sola
 *    reparación y, si persiste, lo quita con marca y deja «con_observaciones»;
 *  - en qué va: una etapa cuyo trabajo murió sin anotar nada se ve fallida.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usarProveedor, AIProviderPausedError } from "@/lib/ai";
import { AIRateLimitError, AIValidationError } from "@/lib/ai/provider";
import { claveIdempotente, PRIORIDAD } from "@/lib/jobs/queue";
import { PREFIJO_PAUSA } from "@/lib/jobs/reglas";
import { armarPaquete } from "@/lib/estrategia/paquete";
import { PRESUPUESTO_TOKENS } from "@/lib/estrategia/esquemas";
import { TEXTO_PARTE_NO_HABILITADA, MOTOR } from "@/lib/estrategia/textos";
import { ESTRATEGIAS_POR_DIA, ESTRATEGIAS_A_LA_VEZ, TOKENS_POR_ESTRATEGIA, materialLente } from "@/lib/estrategia/motor";
import { estadoDeEtapas, type TrabajoEtapa } from "@/lib/estrategia/datos";
import { inicioDelDia } from "@/lib/estrategia/generar";
import { INSTRUCCION_REPARACION } from "@/lib/ai/agents/equipo-rojo";
import { crearBaseEstrategia, proveedorFalso, sembrarEmpresa, type BaseEstrategia } from "./fixtures/base-estrategia";
import type { Fila } from "./fixtures/base-falsa";
import {
  entradasFrutas, entradasDental, HOY, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, LENTE_SUPONE_HOY, ROJO_BUENO, ROJO_CON_CIFRAS, ROJO_GENERICO, ROJO_TIMIDO,
} from "./fixtures/estrategia-falsa";
import type { EntradasPaquete } from "@/lib/estrategia/paquete";

const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
// El motor lee la empresa con leerEntradasPaquete; las pruebas del pipeline le dan las entradas ficticias tal cual (así
// las salidas falsas citan ids que existen), y las de lectura usan la función de verdad contra la base falsa.
const entradas = vi.hoisted(() => ({ de: new Map<string, () => EntradasPaquete>() }));
vi.mock("@/lib/estrategia/paquete-datos", async (orig) => {
  const real = await orig<typeof import("@/lib/estrategia/paquete-datos")>();
  return { ...real, leerEntradasPaquete: async (id: string) => (entradas.de.get(id) ? entradas.de.get(id)!() : real.leerEntradasPaquete(id)) };
});

const { pedirEstrategia } = await import("@/lib/estrategia/generar");
const { handleEstrategiaLente, handleEstrategiaRojo } = await import("@/lib/jobs/handlers/estrategia");
const { leerEntradasPaquete, ErrorLecturaCritica } = await vi.importActual<typeof import("@/lib/estrategia/paquete-datos")>("@/lib/estrategia/paquete-datos");

const FRUTAS = "emp-frutas";
const DENTAL = "emp-dental";

let base: BaseEstrategia;
function nuevaBase(inicial: Record<string, Fila[]> = {}) {
  base = crearBaseEstrategia(inicial);
  estado.base = base;
  return base;
}

beforeEach(() => {
  nuevaBase();
  entradas.de.clear();
  entradas.de.set(FRUTAS, () => entradasFrutas());
  entradas.de.set(DENTAL, () => entradasDental());
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  usarProveedor(null);
  vi.restoreAllMocks();
});

const filas = (t: string) => base.tablas[t] ?? [];
const version = () => filas("estrategias")[0]!;
const trabajos = (tipo?: string) => filas("jobs").filter((j) => !tipo || j.tipo === tipo);

/** El worker, en pequeño: toma el trabajo, corre su manejador y lo deja hecho (o fallido) con lo que devolvió. */
async function correr(job: Fila): Promise<{ resultado?: unknown; error?: unknown }> {
  const h = job.tipo === "estrategia_lente" ? handleEstrategiaLente : handleEstrategiaRojo;
  job.estado = "corriendo";
  try {
    const resultado = await h({ id: String(job.id), company_id: String(job.company_id), payload: job.payload as Record<string, unknown> });
    Object.assign(job, { estado: "hecho", resultado });
    return { resultado };
  } catch (error) {
    Object.assign(job, { estado: "pendiente", error: String((error as Error).message) });
    return { error };
  }
}
const pendientes = (tipo: string) => trabajos(tipo).filter((j) => j.estado == null || j.estado === "pendiente");
async function correrTodos(tipo: string) {
  for (const j of pendientes(tipo)) await correr(j);
}

/** Pide la estrategia de Frutas del Valle con el proveedor que se le dé. */
async function pedir(respuestas: Parameters<typeof proveedorFalso>[0] = { lente_dinero: LENTE_DINERO_BUENA, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: ROJO_BUENO }) {
  const p = proveedorFalso(respuestas);
  usarProveedor(p.proveedor);
  const r = await pedirEstrategia({ companyId: FRUTAS, pedidaPor: "consultora-1", ahora: HOY });
  if (!r.ok) throw new Error(`no se pudo pedir: ${r.texto}`);
  return { ...p, r };
}

// ─── Leer la empresa ─────────────────────────────────────────────────────────────────────────────

describe("§3.3 · leer la empresa desde la base", () => {
  it("las filas de la base dan el mismo paquete que las entradas (números, lo que vende, gastos, ficha, procesos, respuestas)", async () => {
    nuevaBase(sembrarEmpresa(entradasFrutas(), FRUTAS));
    const leidas = await leerEntradasPaquete(FRUTAS);
    expect(leidas.lecturas_fallidas).toEqual([]);
    const deBase = armarPaquete(leidas, HOY);
    const esperado = armarPaquete(entradasFrutas(), HOY);
    const de = (p: typeof deBase, prefijos: RegExp) => p.hechos.filter((h) => prefijos.test(h.id)).map((h) => ({ id: h.id, clase: h.clase, valor: h.valor ?? null }));
    expect(de(deBase, /^[NLGBPQD]:/)).toEqual(de(esperado, /^[NLGBPQD]:/));
    expect(deBase.hechos.filter((h) => h.id.startsWith("K:")).length).toBe(esperado.hechos.filter((h) => h.id.startsWith("K:")).length);
    expect(deBase.contradicciones.map((c) => c.id)).toEqual(esperado.contradicciones.map((c) => c.id));
    // Cuántas afirmaciones hay en total se cuenta en la base: el paquete dice cuántas no entraron por el tope.
    expect(leidas.totales?.claims).toBe(entradasFrutas().claims.length);
  });

  it("los hallazgos de la IA en un área con pocas confirmadas no entran como conclusión (el candado se lee en la base)", async () => {
    nuevaBase(sembrarEmpresa(entradasFrutas(), FRUTAS));
    const leidas = await leerEntradasPaquete(FRUTAS);
    expect(leidas.findings.find((f) => f.titulo === "El criterio de compra vive en una sola persona")).toBeUndefined();
    expect(leidas.findings.find((f) => f.titulo.startsWith("TITULO-rechazado"))).toBeUndefined();
  });

  it("una tabla de otra construcción que todavía no existe no rompe nada: queda nombrada y sus datos salen sin dato", async () => {
    nuevaBase(sembrarEmpresa(entradasFrutas(), FRUTAS));
    base.fallos.ficha_negocio = { code: "42P01", message: 'relation "ficha_negocio" does not exist' };
    base.fallos.estrategia_preguntas = { code: "PGRST205", message: "Could not find the table" };
    const leidas = await leerEntradasPaquete(FRUTAS);
    expect(leidas.lecturas_fallidas).toEqual(expect.arrayContaining([{ tabla: "ficha_negocio", motivo: TEXTO_PARTE_NO_HABILITADA }, { tabla: "estrategia_preguntas", motivo: TEXTO_PARTE_NO_HABILITADA }]));
    expect(leidas.respuestas).toEqual([]);
    const p = armarPaquete(leidas, HOY);
    expect(p.sin_dato.some((s) => s.id === "X:credito.dias")).toBe(true);
    expect(p.lecturas_fallidas.map((l) => l.tabla)).toContain("ficha_negocio");
  });

  it("una lectura crítica que falla lanza con la tabla y el motivo: no se genera nada", async () => {
    nuevaBase(sembrarEmpresa(entradasFrutas(), FRUTAS));
    base.fallos.claims = { code: "57014", message: "canceling statement due to statement timeout" };
    await expect(leerEntradasPaquete(FRUTAS)).rejects.toBeInstanceOf(ErrorLecturaCritica);
    await expect(leerEntradasPaquete(FRUTAS)).rejects.toMatchObject({ tabla: "claims" });
  });
});

// ─── Pedir la estrategia ─────────────────────────────────────────────────────────────────────────

describe("§5.3 · pedir la estrategia crea la versión y encola las dos lentes", () => {
  it("la versión nace en curso, con el paquete y los cálculos congelados; dos lentes en la cola y sus ids en trabajos", async () => {
    const { r, llamadas } = await pedir();
    expect(r).toMatchObject({ ok: true, version: 1 });
    const v = version();
    expect(v).toMatchObject({ company_id: FRUTAS, estado: "en_curso", etapa: "lentes", origen: "ia", pedida_por: "consultora-1" });
    expect(v.paquete_huella).toMatch(/^[0-9a-f]{64}$/);
    expect((v.paquete as { hechos: unknown[] }).hechos.length).toBeGreaterThan(15);
    expect((v.calculos as { version: number }).version).toBe(1);
    const lentes = trabajos("estrategia_lente");
    expect(lentes.map((j) => (j.payload as { lente: string }).lente).sort()).toEqual(["dinero", "terreno"]);
    for (const j of lentes) {
      expect(j.prioridad).toBe(PRIORIDAD.estrategia);
      expect(j.idempotency_key).toBe(claveIdempotente(["estrategia-lente", v.id as string, (j.payload as { lente: string }).lente]));
    }
    expect(v.trabajos).toEqual({ dinero: lentes.find((j) => (j.payload as { lente: string }).lente === "dinero")!.id, terreno: lentes.find((j) => (j.payload as { lente: string }).lente === "terreno")!.id });
    // Pedir no llama al modelo: eso lo hacen los trabajos.
    expect(llamadas).toHaveLength(0);
  });

  it("los recortes del texto que verá el modelo quedan dichos en el paquete congelado", async () => {
    await pedir();
    const recortes = (version().paquete as { recortes: { grupo: string; incluidos: number; total: number }[] }).recortes;
    expect(recortes.find((x) => x.grupo === "afirmaciones")).toMatchObject({ total: 640 });
  });

  it("sin el mínimo, 409 con la lista de lo que falta, y no se crea nada", async () => {
    usarProveedor(proveedorFalso({}).proveedor);
    const r = await pedirEstrategia({ companyId: DENTAL, pedidaPor: null, ahora: HOY });
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "minimo" });
    expect(r.ok ? [] : r.faltan).toEqual(expect.arrayContaining([expect.stringMatching(/gastos ni ganancia/)]));
    expect(filas("estrategias")).toHaveLength(0);
    expect(trabajos()).toHaveLength(0);
  });

  it("el tope de por vida de la empresa se comprueba antes de crear nada", async () => {
    nuevaBase({ companies: [{ id: FRUTAS, tope_tokens: 1_000_000 }], token_usage: [{ company_id: FRUTAS, tokens_entrada: 900_000, tokens_salida: 0 }] });
    const r = await pedirEstrategia({ companyId: FRUTAS, pedidaPor: null, ahora: HOY });
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "tope_empresa" });
    expect(r.ok ? "" : r.texto).toBe(MOTOR.tope_empresa(900_000, 1_000_000, TOKENS_POR_ESTRATEGIA));
    expect(r.ok ? "" : r.texto).toContain("Sube el tope en la ficha de la empresa");
    expect(filas("estrategias")).toHaveLength(0);
  });

  it("con una en curso, 409 y dice en qué va", async () => {
    nuevaBase({ estrategias: [{ id: "previa", company_id: FRUTAS, version: 1, estado: "en_curso", etapa: "equipo_rojo", origen: "ia", created_at: HOY.toISOString() }] });
    const r = await pedirEstrategia({ companyId: FRUTAS, pedidaPor: null, ahora: HOY });
    expect(r).toMatchObject({ ok: false, status: 409, codigo: "en_curso" });
    expect(r.ok ? "" : r.texto).toBe(MOTOR.en_curso("la prueba de los dos caminos"));
  });

  it(`el tope diario: con ${ESTRATEGIAS_POR_DIA} de hoy, 429 con el número de la constante`, async () => {
    const hoy = new Date(HOY.getTime() - 60_000).toISOString();
    nuevaBase({ estrategias: Array.from({ length: ESTRATEGIAS_POR_DIA }, (_, i) => ({ id: `v${i}`, company_id: FRUTAS, version: i + 1, estado: "lista", origen: "ia", created_at: hoy })) });
    const r = await pedirEstrategia({ companyId: FRUTAS, pedidaPor: null, ahora: HOY });
    expect(r).toMatchObject({ ok: false, status: 429, codigo: "tope_diario", texto: MOTOR.tope_diario(ESTRATEGIAS_POR_DIA) });
  });

  it("las de ayer y las que vienen de «Actualizar números» no cuentan para el tope diario", async () => {
    const ayer = new Date(new Date(inicioDelDia(HOY, "America/Lima")).getTime() - 60_000).toISOString();
    const hoy = HOY.toISOString();
    nuevaBase({
      estrategias: [
        ...Array.from({ length: ESTRATEGIAS_POR_DIA }, (_, i) => ({ id: `ayer${i}`, company_id: FRUTAS, version: i + 1, estado: "lista", origen: "ia", created_at: ayer })),
        { id: "act", company_id: FRUTAS, version: 9, estado: "lista", origen: "actualizacion", created_at: hoy },
      ],
    });
    usarProveedor(proveedorFalso({}).proveedor);
    const r = await pedirEstrategia({ companyId: FRUTAS, pedidaPor: null, ahora: HOY });
    expect(r).toMatchObject({ ok: true, version: 10 });
  });

  it(`a lo sumo ${ESTRATEGIAS_A_LA_VEZ} generándose en todo 8X: la siguiente recibe 429`, async () => {
    const reciente = new Date(HOY.getTime() - 5 * 60_000).toISOString();
    nuevaBase({ estrategias: Array.from({ length: ESTRATEGIAS_A_LA_VEZ }, (_, i) => ({ id: `otra${i}`, company_id: `otra-${i}`, version: 1, estado: "en_curso", origen: "ia", created_at: reciente })) });
    const r = await pedirEstrategia({ companyId: FRUTAS, pedidaPor: null, ahora: HOY });
    expect(r).toMatchObject({ ok: false, status: 429, codigo: "a_la_vez", texto: MOTOR.a_la_vez(ESTRATEGIAS_A_LA_VEZ) });
  });

  it("si encolar falla después de crear la versión, la versión queda descartada con el motivo: nunca una en curso sin trabajos", async () => {
    base.fallos.jobs = { code: "08006", message: "la cola no responde" };
    const r = await pedirEstrategia({ companyId: FRUTAS, pedidaPor: null, ahora: HOY });
    expect(r).toMatchObject({ ok: false, codigo: "no_se_puso_en_marcha" });
    expect(r.ok ? "" : r.texto).toContain("No se gastó ninguna consulta");
    expect(version()).toMatchObject({ estado: "descartada" });
    expect((version().errores as { etapa: string; motivo: string }[])[0]).toMatchObject({ etapa: "poner_en_marcha", motivo: "la cola no responde" });
  });
});

// ─── Las lentes ──────────────────────────────────────────────────────────────────────────────────

describe("§5.3 · las dos lentes", () => {
  it("cada lente guarda su columna con sus ids locales; con las dos, se proyectan los caminos y se encola UN equipo rojo", async () => {
    const { llamadas } = await pedir();
    await correrTodos("estrategia_lente");
    const v = version();
    expect((v.lente_dinero as { ids: Record<string, string> }).ids["A.J1"]).toBe(LENTE_DINERO_BUENA.camino.jugadas[0]!.que_se_mueve);
    expect((v.lente_terreno as { ids: Record<string, string> }).ids["B.F1"]).toBe(LENTE_TERRENO_BUENA.foda.f[0]!.texto);
    expect(v.etapa).toBe("equipo_rojo");
    expect(Object.keys(v.proyecciones_lentes as object).sort()).toEqual(["a", "b"]);
    const rojos = trabajos("estrategia_rojo");
    expect(rojos).toHaveLength(1);
    expect(rojos[0]!.idempotency_key).toBe(claveIdempotente(["estrategia-rojo", v.id as string, "1"]));
    expect((v.trabajos as Record<string, string>).rojo).toBe(rojos[0]!.id);
    expect(llamadas.map((l) => l.agente).sort()).toEqual(["lente_dinero", "lente_terreno"]);
  });

  it("las dos a la vez encolan un solo equipo rojo", async () => {
    await pedir();
    await Promise.all(pendientes("estrategia_lente").map(correr));
    expect(trabajos("estrategia_rojo")).toHaveLength(1);
  });

  it("una lente reintentada con su columna llena no llama al modelo, y el equipo rojo sigue siendo uno", async () => {
    const { llamadas } = await pedir();
    await correrTodos("estrategia_lente");
    const dinero = trabajos("estrategia_lente").find((j) => (j.payload as { lente: string }).lente === "dinero")!;
    await correr(dinero);
    expect(llamadas.filter((l) => l.agente === "lente_dinero")).toHaveLength(1);
    expect(trabajos("estrategia_rojo")).toHaveLength(1);
  });

  it("el contexto de cada lente no trae la otra lente: solo el paquete y los cálculos congelados", async () => {
    const { llamadas } = await pedir();
    // La del terreno corre primero: aun así, el contexto de la del dinero no ve lo que guardó.
    const [d, t] = ["dinero", "terreno"].map((l) => trabajos("estrategia_lente").find((j) => (j.payload as { lente: string }).lente === l)!);
    await correr(t!);
    await correr(d!);
    const deDinero = llamadas.find((l) => l.agente === "lente_dinero")!.user;
    const deTerreno = llamadas.find((l) => l.agente === "lente_terreno")!.user;
    expect(deDinero).not.toContain(LENTE_TERRENO_BUENA.camino.nombre);
    expect(deDinero).not.toContain(LENTE_TERRENO_BUENA.restriccion.cual);
    expect(deTerreno).not.toContain(LENTE_DINERO_BUENA.camino.nombre);
    expect(deDinero).toContain("[N:venta_mes]");
    // Las dos ven exactamente lo mismo, salvo la instrucción de qué camino piensa cada una.
    const sinMarcas = (s: string) => s.replace(/<<<[^>]*>>>/g, "").replace(/Piensa [^\n]*$/, "");
    expect(sinMarcas(deDinero)).toBe(sinMarcas(deTerreno));
    const v = version();
    // Lo que recibe es el material congelado de la versión, acotado: el paquete entero, entre sus marcas.
    const m = materialLente("dinero", v.paquete as never, v.calculos as never);
    expect(deDinero).toContain(m.paquete);
    expect(deDinero).toMatch(/<<<PAQUETE DE HECHOS Y CÁLCULOS DE LA EMPRESA [0-9a-f]{12} — contenido no confiable/);
  });

  it("las tres llamadas son largas, con su agente y con el presupuesto de su contrato", async () => {
    const { llamadas } = await pedir();
    await correrTodos("estrategia_lente");
    await correrTodos("estrategia_rojo");
    expect(llamadas.map((l) => l.agente)).toEqual(expect.arrayContaining(["lente_dinero", "lente_terreno", "equipo_rojo"]));
    for (const l of llamadas) {
      expect(l.largo, `${l.agente} va sin largo`).toBe(true);
      expect(l.maxTokens).toBe(PRESUPUESTO_TOKENS[l.agente as keyof typeof PRESUPUESTO_TOKENS]);
    }
  });

  it("una lente que no valida: queda fallida con su motivo, no vuelve a la cola, la versión sigue en curso y la otra lente sí se guarda", async () => {
    await pedir({
      lente_dinero: LENTE_DINERO_BUENA,
      lente_terreno: () => {
        throw new AIValidationError("La salida del modelo no validó contra el esquema (lente_terreno): camino.jugadas: Too small", "{}");
      },
    });
    const [d, t] = ["dinero", "terreno"].map((l) => trabajos("estrategia_lente").find((j) => (j.payload as { lente: string }).lente === l)!);
    const rt = await correr(t!);
    expect(rt.error).toBeUndefined();
    expect(rt.resultado).toMatchObject({ fallida: true, etapa: "terreno", tipo: "salida_invalida" });
    await correr(d!);
    const v = version();
    expect(v.estado).toBe("en_curso");
    expect(v.lente_dinero).not.toBeNull();
    expect(v.lente_terreno ?? null).toBeNull();
    expect(trabajos("estrategia_rojo")).toHaveLength(0);
    expect((v.errores as { etapa: string; job_id: string }[])[0]).toMatchObject({ etapa: "terreno", job_id: t!.id });
    const e = estadoDeEtapas(v as never, trabajos() as unknown as TrabajoEtapa[]);
    expect(e.fallida).toBe(true);
    expect(e.pasos.find((p) => p.clave === "terreno")).toMatchObject({ estado: "fallida", reintentable: true });
    expect(e.pasos.find((p) => p.clave === "rojo")).toMatchObject({ estado: "esperando" });
    expect(e.aviso).toMatch(/^El camino del dinero está listo; el camino de la operación no salió: /);
  });

  it("una salida cortada por tamaño dice «cortada por tamaño»: es un error del esquema, no del modelo", async () => {
    await pedir({ lente_dinero: () => { throw new AIValidationError("no validó", "[finishReason=MAX_TOKENS] {\"lectura\":"); }, lente_terreno: LENTE_TERRENO_BUENA });
    const d = trabajos("estrategia_lente").find((j) => (j.payload as { lente: string }).lente === "dinero")!;
    const r = await correr(d);
    expect(r.resultado).toMatchObject({ fallida: true, tipo: "cortada", motivo: MOTOR.cortada });
  });

  it("sin crédito (402) la lente no se marca fallida: se relanza para que la cola espere sin gastar intentos", async () => {
    await pedir({ lente_dinero: () => { throw new AIProviderPausedError("Gemini 402: prepayment credits depleted"); }, lente_terreno: LENTE_TERRENO_BUENA });
    const d = trabajos("estrategia_lente").find((j) => (j.payload as { lente: string }).lente === "dinero")!;
    const r = await correr(d);
    expect(r.error).toBeInstanceOf(AIProviderPausedError);
    expect(version().errores).toEqual([]);
  });

  it("la cuota del día agotada se anota y no se relanza (relanzada, el worker gastaría más)", async () => {
    await pedir({ lente_dinero: () => { throw new AIRateLimitError('Gemini 429: {"quotaId":"GenerateRequestsPerDayPerProjectPerModel"}'); }, lente_terreno: LENTE_TERRENO_BUENA });
    const d = trabajos("estrategia_lente").find((j) => (j.payload as { lente: string }).lente === "dinero")!;
    const r = await correr(d);
    expect(r.error).toBeUndefined();
    expect(r.resultado).toMatchObject({ fallida: true, tipo: "cuota_del_dia", motivo: MOTOR.cuota_del_dia });
  });

  it("un 429 por ventana (sin PerDay) sí se relanza: lo reintenta el worker con espera", async () => {
    await pedir({ lente_dinero: () => { throw new AIRateLimitError("Gemini 429: retry in 3s"); }, lente_terreno: LENTE_TERRENO_BUENA });
    const d = trabajos("estrategia_lente").find((j) => (j.payload as { lente: string }).lente === "dinero")!;
    expect((await correr(d)).error).toBeInstanceOf(AIRateLimitError);
  });

  it("si la función de la base que coordina las lentes falla, lo pagado no se pierde: la lente se guarda igual y el equipo rojo sigue siendo uno", async () => {
    const { llamadas } = await pedir();
    const original = base.rpc;
    base.rpc = async (nombre: string, args: Record<string, unknown> = {}) =>
      nombre === "estrategia_lente_lista" ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.estrategia_lente_lista" } } : original(nombre, args);
    await correrTodos("estrategia_lente");
    expect(version().lente_dinero).not.toBeNull();
    expect(version().lente_terreno).not.toBeNull();
    expect(trabajos("estrategia_rojo")).toHaveLength(1);
    expect(llamadas).toHaveLength(2);
  });

  it("una versión descartada no se toca: la lente no llama al modelo ni guarda nada", async () => {
    const { llamadas } = await pedir();
    version().estado = "descartada";
    await correrTodos("estrategia_lente");
    expect(llamadas).toHaveLength(0);
    expect(version().lente_dinero ?? null).toBeNull();
  });
});

// ─── El equipo rojo ──────────────────────────────────────────────────────────────────────────────

describe("§5.3 · el equipo rojo y el cierre", () => {
  it("el caso normal: tres llamadas, la versión queda «lista» con salida y vigente iguales, la lista de control y las preguntas propuestas", async () => {
    const { llamadas } = await pedir();
    await correrTodos("estrategia_lente");
    await correrTodos("estrategia_rojo");
    expect(llamadas).toHaveLength(3);
    const v = version();
    expect(v).toMatchObject({ estado: "lista", etapa: "terminada" });
    expect(v.salida).toEqual(v.vigente);
    expect((v.validacion as { errores: unknown[] }).errores).toEqual([]);
    const items = (v.calidad as { items: { clave: string; cumple: boolean }[] }).items;
    expect(items).toHaveLength(19);
    expect(items.filter((i) => !i.cumple).map((i) => i.clave)).toEqual([]);
    // Lo que falta saber se volvió preguntas propuestas, sin que nadie las escriba; lo ya respondido no se repregunta.
    const preguntas = filas("estrategia_preguntas").filter((p) => p.estado === "propuesta");
    const claves = preguntas.map((p) => String(p.clave));
    expect(claves).toEqual(expect.arrayContaining(["clientes_dormidos", "inversion_disponible_mes", "capacidad_extra_mes", "descuentos_mes"]));
    expect(claves.some((c) => /^otra\.[0-9a-f]{8}$/.test(c))).toBe(true);
    expect(claves).not.toContain("interesados_mes");
    for (const p of preguntas) expect(p).toMatchObject({ company_id: FRUTAS, estrategia_id: v.id });
    expect(trabajos("estrategia_rojo")).toHaveLength(1);
  });

  it("una pregunta que ya está abierta no se duplica: se le suman las jugadas que esperan", async () => {
    nuevaBase({ estrategia_preguntas: [{ id: "abierta", company_id: FRUTAS, clave: "clientes_dormidos", texto: "¿Cuántos clientes te compraron alguna vez y este año no han vuelto?", estado: "enviada", espera: [{ version: 0, camino: "a", jugada: "J9" }] }] });
    await pedir();
    await correrTodos("estrategia_lente");
    await correrTodos("estrategia_rojo");
    expect(filas("estrategia_preguntas").filter((p) => p.clave === "clientes_dormidos")).toHaveLength(1);
  });

  it("con cifras sin origen: una sola reparación (cuatro llamadas) y, si persisten, se quitan con marca y la versión queda «con_observaciones»", async () => {
    const { llamadas } = await pedir({ lente_dinero: LENTE_DINERO_BUENA, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: ROJO_CON_CIFRAS });
    await correrTodos("estrategia_lente");
    await correrTodos("estrategia_rojo");
    expect(version().etapa).toBe("reparacion");
    const rep = trabajos("estrategia_rojo").find((j) => (j.payload as { reparar?: boolean }).reparar);
    expect(rep?.idempotency_key).toBe(claveIdempotente(["estrategia-rojo", version().id as string, "2"]));
    expect((version().trabajos as Record<string, string>).rojo).toBe(rep!.id);
    await correrTodos("estrategia_rojo");
    expect(llamadas).toHaveLength(4);
    // La reparación recibió la instrucción, su salida anterior y lo que se rechazó.
    const reparacion = llamadas[3]!.user;
    expect(reparacion).toContain(INSTRUCCION_REPARACION);
    expect(reparacion).toContain("cifra_sin_origen");
    expect(reparacion).toContain("/lectura/0");
    const v = version();
    expect(v).toMatchObject({ estado: "con_observaciones", etapa: "terminada" });
    const salida = v.salida as { quitado: { puntero: string; resuelto: boolean; motivo: string }[]; lectura: string[] };
    expect(salida.quitado.length).toBeGreaterThan(0);
    expect(salida.quitado.every((q) => !q.resuelto)).toBe(true);
    expect(salida.quitado.map((q) => q.puntero)).toEqual(expect.arrayContaining(["/lectura/0", "/lectura/2", "/lectura/4"]));
    expect(salida.lectura.join(" ")).not.toMatch(/\d{2,}|dos mil soles|duplicar/);
    // Nunca se encola una segunda reparación.
    expect(trabajos("estrategia_rojo")).toHaveLength(2);
  });

  it("si la reparación lo arregla, la versión queda «lista»: cuatro llamadas", async () => {
    const { llamadas } = await pedir({ lente_dinero: LENTE_DINERO_BUENA, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: (_p, n) => (n === 1 ? ROJO_CON_CIFRAS : ROJO_BUENO) });
    await correrTodos("estrategia_lente");
    await correrTodos("estrategia_rojo");
    await correrTodos("estrategia_rojo");
    expect(llamadas).toHaveLength(4);
    expect(version()).toMatchObject({ estado: "lista", etapa: "terminada" });
  });

  it("si la reparación no valida, no se pierde lo pagado: se cierra con la primera salida, quitando lo inválido con marca", async () => {
    await pedir({
      lente_dinero: LENTE_DINERO_BUENA,
      lente_terreno: LENTE_TERRENO_BUENA,
      equipo_rojo: (_p, n) => {
        if (n === 1) return ROJO_CON_CIFRAS;
        throw new AIValidationError("no validó", "{}");
      },
    });
    await correrTodos("estrategia_lente");
    await correrTodos("estrategia_rojo");
    await correrTodos("estrategia_rojo");
    expect(version()).toMatchObject({ estado: "con_observaciones", etapa: "terminada" });
  });

  it("la salida tímida y la genérica pasan por el motor y la lista de control las marca: el veredicto es del código", async () => {
    for (const [rojo, fallan] of [[ROJO_TIMIDO, ["ambicion", "mueve_dinero", "sale_a_ganar"]], [ROJO_GENERICO, ["de_esta_empresa", "sin_frases_de_relleno", "cuelga_de_lo_que_importa"]]] as const) {
      nuevaBase();
      await pedir({ lente_dinero: LENTE_DINERO_BUENA, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: rojo });
      await correrTodos("estrategia_lente");
      await correrTodos("estrategia_rojo");
      const items = (version().calidad as { items: { clave: string; cumple: boolean }[] }).items;
      expect(items.filter((i) => !i.cumple).map((i) => i.clave)).toEqual([...fallan]);
    }
  });

  it("la lente que supone cuánto es algo hoy: la reparación no puede arreglarlo (es de la lente) y 8X deja el supuesto fuera de las cuentas, con marca", async () => {
    const { llamadas } = await pedir({ lente_dinero: LENTE_SUPONE_HOY, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: ROJO_BUENO });
    await correrTodos("estrategia_lente");
    await correrTodos("estrategia_rojo");
    await correrTodos("estrategia_rojo");
    expect(llamadas).toHaveLength(4);
    const v = version();
    expect(v.estado).toBe("con_observaciones");
    const salida = v.salida as { supuestos: { id: string; retirado?: string }[]; quitado: { tipo: string }[] };
    expect(salida.supuestos.find((s) => s.id === "SA5")?.retirado).toBeTruthy();
    expect(salida.quitado.map((q) => q.tipo)).toEqual(expect.arrayContaining(["supuesto_de_estado_actual", "referencia_como_dato"]));
  });

  it("el equipo rojo reintentado con su salida guardada no vuelve a llamar al modelo", async () => {
    const { llamadas } = await pedir();
    await correrTodos("estrategia_lente");
    const rojo = trabajos("estrategia_rojo")[0]!;
    // Murió después de pagar la llamada y guardarla, antes de cerrar.
    version().equipo_rojo = { primera: structuredClone(ROJO_BUENO), reparacion: null };
    await correr(rojo);
    expect(llamadas.filter((l) => l.agente === "equipo_rojo")).toHaveLength(0);
    expect(version().estado).toBe("lista");
  });

  it("un equipo rojo que no valida queda fallido; las lentes quedan guardadas y la versión sigue en curso", async () => {
    await pedir({ lente_dinero: LENTE_DINERO_BUENA, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: () => { throw new AIValidationError("no validó", "{}"); } });
    await correrTodos("estrategia_lente");
    const r = await correr(trabajos("estrategia_rojo")[0]!);
    expect(r.resultado).toMatchObject({ fallida: true, etapa: "rojo" });
    const v = version();
    expect(v.estado).toBe("en_curso");
    expect(v.lente_dinero).not.toBeNull();
    expect(v.lente_terreno).not.toBeNull();
    expect(estadoDeEtapas(v as never, trabajos() as unknown as TrabajoEtapa[]).pasos.find((p) => p.clave === "rojo")).toMatchObject({ estado: "fallida", reintentable: true });
  });
});

// ─── En qué va ───────────────────────────────────────────────────────────────────────────────────

describe("§5.4 · estadoDeEtapas ve lo que el manejador no alcanzó a anotar", () => {
  const enCurso = (extra: Record<string, unknown> = {}) => ({ estado: "en_curso" as const, etapa: "lentes" as const, errores: [], trabajos: { dinero: "j-d", terreno: "j-t" }, lente_dinero: null, lente_terreno: null, salida: null, ...extra });
  const job = (id: string, estado: string, extra: Partial<TrabajoEtapa> = {}): TrabajoEtapa => ({ id, estado, error: null, progreso: null, resultado: null, ...extra });

  it("un trabajo fallido sin nada en errores (tres intentos, el tope de la empresa) es una etapa fallida con su error", () => {
    const e = estadoDeEtapas(enCurso(), [job("j-d", "fallido", { error: "Tope de tokens de la empresa superado. Sube el tope en la ficha de la empresa y reintenta." }), job("j-t", "corriendo")]);
    expect(e.pasos[0]).toMatchObject({ clave: "dinero", estado: "fallida", reintentable: true });
    expect(e.pasos[0]!.detalle).toBe(MOTOR.etapa_no_termino("el camino del dinero", "Tope de tokens de la empresa superado. Sube el tope en la ficha de la empresa y reintenta."));
    expect(e.pasos[1]).toMatchObject({ clave: "terreno", estado: "corriendo" });
    expect(e.fallida).toBe(true);
  });

  it("un trabajo devuelto por falta de crédito está en pausa, no fallido", () => {
    const e = estadoDeEtapas(enCurso(), [job("j-d", "pendiente", { error: `${PREFIJO_PAUSA} (sin crédito) desde 16/10/2026, 10:00` }), job("j-t", "pendiente")]);
    expect(e.pasos[0]).toMatchObject({ estado: "en_pausa", detalle: MOTOR.en_pausa });
    expect(e.fallida).toBe(false);
  });

  it("un trabajo «hecho» sin su resultado guardado se ve fallido, y la falla anotada en el resultado del trabajo también", () => {
    const e = estadoDeEtapas(enCurso(), [job("j-d", "hecho"), job("j-t", "hecho", { resultado: { fallida: true, motivo: MOTOR.cortada } })]);
    expect(e.pasos[0]).toMatchObject({ estado: "fallida", detalle: MOTOR.sin_resultado });
    expect(e.pasos[1]).toMatchObject({ estado: "fallida", detalle: MOTOR.cortada });
  });

  it("una falla anotada de un intento anterior no cuenta si la etapa ya tiene un trabajo nuevo", () => {
    const e = estadoDeEtapas(enCurso({ errores: [{ etapa: "dinero", tipo: "cortada", motivo: MOTOR.cortada, job_id: "j-viejo", at: "" }] }), [job("j-d", "corriendo"), job("j-t", "corriendo")]);
    expect(e.pasos[0]).toMatchObject({ estado: "corriendo" });
  });

  it("con las dos lentes listas, sus trabajos hechos y ninguna prueba en marcha, la prueba se puede reintentar", () => {
    const e = estadoDeEtapas(enCurso({ lente_dinero: {}, lente_terreno: {}, etapa: "equipo_rojo" }), [job("j-d", "hecho"), job("j-t", "hecho")]);
    expect(e.pasos.find((p) => p.clave === "rojo")).toMatchObject({ estado: "fallida", reintentable: true, detalle: MOTOR.rojo_sin_lanzar });
  });

  it("en la reparación, la prueba está lista y lo que corre es la revisión de cada cifra", () => {
    const e = estadoDeEtapas(enCurso({ lente_dinero: {}, lente_terreno: {}, etapa: "reparacion", trabajos: { dinero: "j-d", terreno: "j-t", rojo: "j-r2" } }), [job("j-d", "hecho"), job("j-t", "hecho"), job("j-r2", "corriendo")]);
    expect(e.pasos.map((p) => [p.clave, p.estado])).toEqual([["dinero", "lista"], ["terreno", "lista"], ["rojo", "lista"], ["revision", "corriendo"]]);
  });

  it("una versión terminada tiene todo listo", () => {
    const e = estadoDeEtapas({ ...enCurso(), estado: "lista", etapa: "terminada" }, []);
    expect(e.pasos.every((p) => p.estado === "lista")).toBe(true);
    expect(e.terminada).toBe(true);
  });
});
