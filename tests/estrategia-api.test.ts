/**
 * LAS RUTAS DE LA ESTRATEGIA (spec-estrategia-8x.md §5.3, §5.4, §7 y §9.3), con DOBLES: `supabaseAdmin()` es la base
 * en memoria de la estrategia (tests/fixtures/base-estrategia.ts), la sesión la pone la prueba y el modelo es un
 * proveedor falso que cuenta las llamadas. Ningún modelo real, ninguna base real. La empresa es la ficticia «Frutas del
 * Valle» (y el consultorio ficticio, casi sin datos) de tests/fixtures/estrategia-falsa.ts.
 *
 * Lo que se fija:
 *  - solo la consultora genera, lee, corrige, elige y aprueba: un dueño con «aprobar_plan» por defecto NO aprueba, y no
 *    lee la estrategia por la API;
 *  - generar: crea la versión y encola las dos lentes; antes de gastar, el mínimo (con el pedido para el dueño), el tope
 *    de la empresa, la que está en curso, el tope diario y el de «a la vez»; encolar que falla deja la versión
 *    descartada;
 *  - corregir: solo lo de CAMPOS_EDITABLES y solo en «lista» o «con_observaciones» (aprobada = 409 con su texto); cada
 *    cambio deja su fila con antes y después; la cifra de la consultora es aviso; lo que corrige pasa por el validador;
 *    resuelto lo último, vuelve a «lista»; dos pestañas a la vez no se pisan;
 *  - aprobar: exige el camino elegido y nada sin resolver; reemplaza a la aprobada anterior y congela en la biblioteca
 *    SOLO la página del dueño, sin `{{`;
 *  - «Actualizar números»: versión nueva sin llamar al modelo, con lo que escribió 8X y lo que corrigió la consultora,
 *    validada otra vez, con lo que respondió el dueño; no se ofrece con una en curso;
 *  - reintentar sobre el último trabajo de la etapa y guardar el nuevo; descartar libera el «una en curso»;
 *  - las preguntas: enviar activa «preguntas_estrategia» y las secciones con su nota agregada (recortada si pasa de su
 *    tope); `CuerpoActivar` no deja abrirla con una casilla; el dueño responde solo las enviadas de su empresa, con el
 *    dato dicho del dueño (nunca «comprobado»).
 * Lo que es Postgres (checks, RLS, funciones) está en tests/sql/estrategia.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { crearBaseEstrategia, proveedorFalso, type BaseEstrategia } from "./fixtures/base-estrategia";
import type { Fila } from "./fixtures/base-falsa";
import {
  entradasFrutas, entradasDental, HOY, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, RESPUESTAS_FRUTAS, ROJO_BUENO, ROJO_CON_CIFRAS,
} from "./fixtures/estrategia-falsa";
import type { EntradasPaquete, RespuestaEntrada } from "@/lib/estrategia/paquete";
import type { SalidaEquipoRojo } from "@/lib/estrategia/esquemas";

const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (original) => ({ ...(await original<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));
// 8X lee la empresa con leerEntradasPaquete: aquí le da las entradas ficticias (así las salidas falsas citan ids que
// existen) MÁS lo que el dueño respondió por la ruta, que vive en la base falsa: lo que responde llega a los números.
const entradas = vi.hoisted(() => ({ de: new Map<string, () => EntradasPaquete>() }));
vi.mock("@/lib/estrategia/paquete-datos", async (orig) => {
  const real = await orig<typeof import("@/lib/estrategia/paquete-datos")>();
  return { ...real, leerEntradasPaquete: async (id: string) => (entradas.de.get(id) ? entradas.de.get(id)!() : real.leerEntradasPaquete(id)) };
});

import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { usarProveedor } from "@/lib/ai";
import { TEXTO_SECCION_CERRADA } from "@/lib/secciones";
import { CuerpoActivar } from "@/lib/esquemas-negocio";
import { API, MOTOR, PREGUNTAS, pedidoPorMinimo } from "@/lib/estrategia/textos";
import { ESTRATEGIAS_A_LA_VEZ, ESTRATEGIAS_POR_DIA } from "@/lib/estrategia/motor";
import { CAMPOS_EDITABLES, esEditable } from "@/lib/estrategia/edicion";
import { notaConLineas, TOPE_NOTA } from "@/lib/estrategia/pedidos";
import { FORMATO_PARA_DUENO, textoDePagina, type ParaDueno } from "@/lib/estrategia/para-dueno";
import { palabrasQueElDuenoNoVe } from "@/lib/estrategia/validador";
import { claveIdempotente } from "@/lib/jobs/queue";

vi.setConfig({ testTimeout: 60_000 });

const { handleEstrategiaLente, handleEstrategiaRojo } = await import("@/lib/jobs/handlers/estrategia");

const FRUTAS = "0000000f-0000-4000-8000-00000000000f";
const DENTAL = "0000000d-0000-4000-8000-00000000000d";
const OTRA = "0000000e-0000-4000-8000-00000000000e";
const CONSULTORA: Perfil = { id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@prueba.local", nombre: "Consultora", rol: "consultor" };
const DUENO: Perfil = { id: "00000000-0000-4000-8000-0000000000a1", email: "dueno@prueba.local", nombre: "Dueño", rol: "cliente" };
const PARTICIPANTE: Perfil = { id: "00000000-0000-4000-8000-0000000000a2", email: "equipo@prueba.local", nombre: "Equipo", rol: "cliente" };
const DUENO_AJENO: Perfil = { id: "00000000-0000-4000-8000-0000000000a3", email: "otro@prueba.local", nombre: "Otro dueño", rol: "cliente" };

type Respuesta = { status: number; body: Fila };
type Manejador = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const GEN = "@/app/api/companies/[id]/estrategia/route";
const VER = "@/app/api/companies/[id]/estrategia/[eid]/route";
const APROBAR = "@/app/api/companies/[id]/estrategia/[eid]/aprobar/route";
const ACTUALIZAR = "@/app/api/companies/[id]/estrategia/[eid]/actualizar/route";
const REINTENTAR = "@/app/api/companies/[id]/estrategia/[eid]/reintentar/route";
const PREGUNTAS_RUTA = "@/app/api/companies/[id]/estrategia-preguntas/route";
const PREGUNTA = "@/app/api/companies/[id]/estrategia-preguntas/[pid]/route";

/** Llama a una ruta como lo haría Next: la petición y sus parámetros como promesa. */
async function llamar(modulo: string, metodo: "GET" | "POST" | "PATCH", params: Record<string, string>, cuerpo?: unknown, query = ""): Promise<Respuesta> {
  const m = (await import(/* @vite-ignore */ modulo)) as Record<string, Manejador>;
  const req = new Request(`http://8x.test/api/companies/${params.id}/estrategia${query}`, {
    method: metodo,
    ...(cuerpo !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : {}),
  });
  const res = await m[metodo]!(req, { params: Promise.resolve(params) });
  return { status: res.status, body: (await res.json()) as Fila };
}
const como = (p: Perfil) => vi.mocked(perfilApi).mockResolvedValue(p);

let base: BaseEstrategia;
/** La empresa ficticia, su dueño y una participante; y un dueño de otra empresa. */
function nuevaBase(extra: Record<string, Fila[]> = {}) {
  base = crearBaseEstrategia({
    companies: [
      { id: FRUTAS, nombre: "Frutas del Valle (ficticia)", zona_horaria: "America/Lima", tope_tokens: 2_000_000 },
      { id: DENTAL, nombre: "Consultorio ficticio", zona_horaria: "America/Lima", tope_tokens: 2_000_000 },
      { id: OTRA, nombre: "Otra empresa ficticia", zona_horaria: "America/Lima", tope_tokens: 2_000_000 },
    ],
    memberships: [
      { user_id: DUENO.id, company_id: FRUTAS, nivel: "dueno" },
      { user_id: PARTICIPANTE.id, company_id: FRUTAS, nivel: "participante" },
      { user_id: DUENO_AJENO.id, company_id: OTRA, nivel: "dueno" },
    ],
    ...extra,
  });
  estado.base = base;
  return base;
}
const filas = (t: string) => base.tablas[t] ?? [];
const versionN = (n: number) => filas("estrategias").find((v) => v.version === n)!;
const trabajos = (tipo?: string) => filas("jobs").filter((j) => !tipo || j.tipo === tipo);

/** Lo que el dueño respondió por la ruta, como lo leería leerEntradasPaquete de la base. */
const respondidasEnLaBase = (companyId: string): RespuestaEntrada[] =>
  filas("estrategia_preguntas")
    .filter((p) => p.company_id === companyId && p.estado === "respondida" && !RESPUESTAS_FRUTAS.some((r) => r.id === p.id))
    .map((p) => ({ id: String(p.id), clave: String(p.clave), texto: String(p.texto), unidad: p.unidad as RespuestaEntrada["unidad"], respuesta: (p.respuesta as RespuestaEntrada["respuesta"]) ?? null, respuesta_texto: (p.respuesta_texto as string | null) ?? null, respondida_at: (p.respondida_at as string | null) ?? null }));

/** El worker, en pequeño: toma el trabajo, corre su manejador y lo deja hecho (o de vuelta en la cola) con lo que devolvió. */
async function correr(job: Fila) {
  const h = job.tipo === "estrategia_lente" ? handleEstrategiaLente : handleEstrategiaRojo;
  job.estado = "corriendo";
  try {
    Object.assign(job, { estado: "hecho", resultado: await h({ id: String(job.id), company_id: String(job.company_id), payload: job.payload as Record<string, unknown> }) });
  } catch (error) {
    Object.assign(job, { estado: "pendiente", error: String((error as Error).message) });
  }
}
/** Corre la cola hasta que no quede nada pendiente de la estrategia (las lentes, la prueba y, si hace falta, la reparación). */
async function correrCola() {
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    const pendientes = trabajos().filter((j) => j.estado === "pendiente" && String(j.tipo).startsWith("estrategia_"));
    if (!pendientes.length) return;
    for (const j of pendientes) await correr(j);
  }
}

type Respuestas = Parameters<typeof proveedorFalso>[0];
const BUENAS: Respuestas = { lente_dinero: LENTE_DINERO_BUENA, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: ROJO_BUENO };

/** La consultora pide la estrategia de Frutas del Valle por la ruta y la cola la genera entera. */
async function generar(respuestas: Respuestas = BUENAS) {
  const p = proveedorFalso(respuestas);
  usarProveedor(p.proveedor);
  como(CONSULTORA);
  const r = await llamar(GEN, "POST", { id: FRUTAS }, {});
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  await correrCola();
  const v = filas("estrategias").find((x) => x.id === r.body.estrategia_id)!;
  return { ...p, v, eid: String(v.id) };
}

/** El equipo rojo bueno, con dos cosas más que faltan saber y que se piden en una sección (crédito y gastos). */
const ROJO_CON_SECCIONES: SalidaEquipoRojo = {
  ...structuredClone(ROJO_BUENO),
  faltan: [
    ...ROJO_BUENO.faltan,
    { clave: "credito.dias", por_que_importa: "Para saber cuánto tarda en volver el dinero del crédito", pregunta_si_otra: null, unidad_si_otra: null },
    { clave: "gastos_mes", por_que_importa: "Para contar bien lo que se va cada mes", pregunta_si_otra: null, unidad_si_otra: null },
  ],
};

beforeAll(async () => {
  await Promise.all([GEN, VER, APROBAR, ACTUALIZAR, REINTENTAR, PREGUNTAS_RUTA, PREGUNTA].map((m) => import(/* @vite-ignore */ m)));
}, 180_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOY);
  nuevaBase();
  entradas.de.clear();
  entradas.de.set(FRUTAS, () => entradasFrutas({ respuestas: [...RESPUESTAS_FRUTAS.map((r) => ({ ...r })), ...respondidasEnLaBase(FRUTAS)] }));
  entradas.de.set(DENTAL, () => entradasDental());
  vi.mocked(perfilApi).mockReset();
  vi.mocked(registrar).mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  usarProveedor(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Avanza el reloj: lo que pasa después (una respuesta del dueño) queda después de la versión. */
const despues = (minutos: number) => vi.setSystemTime(new Date(HOY.getTime() + minutos * 60_000));

// ─── Quién puede ─────────────────────────────────────────────────────────────────────────────────

describe("solo la consultora genera, lee, corrige, elige y aprueba", () => {
  it("el dueño —que tiene «aprobar_plan» por defecto— no genera, no lee, no corrige, no elige ni aprueba: 403 y nada cambia", async () => {
    const { eid } = await generar();
    const antes = JSON.stringify(filas("estrategias"));
    como(DUENO);
    expect((await llamar(GEN, "POST", { id: FRUTAS }, {})).status).toBe(403);
    expect((await llamar(GEN, "GET", { id: FRUTAS })).status).toBe(403);
    expect((await llamar(VER, "GET", { id: FRUTAS, eid })).status).toBe(403);
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } })).status).toBe(403);
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/lectura/0", texto: "Lo escribió el dueño" } })).status).toBe(403);
    expect((await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).status).toBe(403);
    expect((await llamar(ACTUALIZAR, "POST", { id: FRUTAS, eid }, {})).status).toBe(403);
    expect(JSON.stringify(filas("estrategias"))).toBe(antes);
    expect(filas("deliverables")).toHaveLength(0);
  });

  it("una consultora sin la autoridad de aprobar planes no aprueba (403); con ella, sí", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } })).status).toBe(200);
    base.tablas.users = [{ id: CONSULTORA.id, autoridad: ["aprobar_hallazgo"] }];
    const r = await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {});
    expect(r.status).toBe(403);
    expect(String(r.body.error)).toMatch(/^No tienes autoridad para aprobar o publicar el plan/);
    base.tablas.users = [];
    expect((await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).status).toBe(200);
  });

  it("en una base sin la migración de la estrategia, las rutas lo dicen en palabras (409), sin el error crudo", async () => {
    base.fallos.estrategias = { code: "42P01", message: 'relation "estrategias" does not exist' };
    como(CONSULTORA);
    expect(await llamar(GEN, "GET", { id: FRUTAS })).toMatchObject({ status: 409, body: { error: API.no_habilitada } });
    expect(await llamar(VER, "GET", { id: FRUTAS, eid: "00000000-0000-4000-8000-000000000999" })).toMatchObject({ status: 409, body: { error: API.no_habilitada } });
    expect(await llamar(GEN, "POST", { id: FRUTAS }, {})).toMatchObject({ status: 409, body: { error: API.no_habilitada } });
    expect(trabajos()).toHaveLength(0);
  });

  it("un id que no es de una versión de esta empresa: 404 con su texto", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    expect(await llamar(VER, "GET", { id: OTRA, eid })).toMatchObject({ status: 404, body: { error: API.version_no_existe } });
    expect(await llamar(VER, "GET", { id: FRUTAS, eid: "no-es-un-id" })).toMatchObject({ status: 404, body: { error: API.version_no_existe } });
  });
});

// ─── Generar ─────────────────────────────────────────────────────────────────────────────────────

describe("POST /estrategia · generar", () => {
  it("crea la versión, encola las dos lentes con su clave sin hora y guarda sus ids; deja rastro con la empresa", async () => {
    usarProveedor(proveedorFalso(BUENAS).proveedor);
    como(CONSULTORA);
    const r = await llamar(GEN, "POST", { id: FRUTAS }, {});
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ version: 1 });
    const v = filas("estrategias")[0]!;
    expect(v).toMatchObject({ id: r.body.estrategia_id, estado: "en_curso", pedida_por: CONSULTORA.id });
    const lentes = trabajos("estrategia_lente");
    expect(lentes).toHaveLength(2);
    expect(r.body.trabajos).toEqual(v.trabajos);
    for (const j of lentes) expect(j.idempotency_key).toBe(claveIdempotente(["estrategia-lente", String(v.id), (j.payload as { lente: string }).lente]));
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ companyId: FRUTAS, actor: CONSULTORA, accion: "crear", entidad: "estrategia", entidadId: v.id }));
    // El resumen dice en qué va y cuánto le queda del tope.
    const g = await llamar(GEN, "GET", { id: FRUTAS });
    expect(g.status).toBe(200);
    expect((g.body.en_curso as { id: string }).id).toBe(v.id);
    expect((g.body.consumo as { texto: string }).texto).toMatch(/^Esta empresa usó /);
  });

  it("sin el mínimo: 409 con la lista de lo que falta y el pedido que 8X le haría al dueño; no se crea nada", async () => {
    como(CONSULTORA);
    const r = await llamar(GEN, "POST", { id: DENTAL }, {});
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe("minimo");
    expect(r.body.faltan).toEqual(expect.arrayContaining([expect.stringMatching(/gastos ni ganancia/)]));
    expect(r.body.pedir_al_cliente).toEqual(pedidoPorMinimo(r.body.faltan as string[]));
    expect((r.body.pedir_al_cliente as { seccion: string; nota: string }).nota).toMatch(/^Para preparar tu plan nos falta saber tus gastos fijos/);
    expect(filas("estrategias")).toHaveLength(0);
    expect(trabajos()).toHaveLength(0);
  });

  it("el tope de por vida de la empresa se comprueba antes de crear nada", async () => {
    base.tablas.companies!.find((c) => c.id === FRUTAS)!.tope_tokens = 1_000_000;
    base.tablas.token_usage = [{ company_id: FRUTAS, tokens_entrada: 900_000, tokens_salida: 0 }];
    como(CONSULTORA);
    const r = await llamar(GEN, "POST", { id: FRUTAS }, {});
    expect(r).toMatchObject({ status: 409, body: { codigo: "tope_empresa" } });
    expect(String(r.body.error)).toContain("Sube el tope en la ficha de la empresa");
    expect(filas("estrategias")).toHaveLength(0);
  });

  it("con una en curso, 409 con en qué va", async () => {
    usarProveedor(proveedorFalso(BUENAS).proveedor);
    como(CONSULTORA);
    expect((await llamar(GEN, "POST", { id: FRUTAS }, {})).status).toBe(201);
    const r = await llamar(GEN, "POST", { id: FRUTAS }, {});
    expect(r).toMatchObject({ status: 409, body: { codigo: "en_curso", error: MOTOR.en_curso("los dos caminos") } });
    expect(filas("estrategias")).toHaveLength(1);
  });

  it(`el tope diario (${ESTRATEGIAS_POR_DIA}) y el de «a la vez» (${ESTRATEGIAS_A_LA_VEZ}) responden 429 con el número de su constante`, async () => {
    const hoy = new Date(HOY.getTime() - 60_000).toISOString();
    nuevaBase({ estrategias: Array.from({ length: ESTRATEGIAS_POR_DIA }, (_, i) => ({ id: `00000000-0000-4000-8000-0000000009${i}0`, company_id: FRUTAS, version: i + 1, estado: "lista", origen: "ia", created_at: hoy })) });
    como(CONSULTORA);
    expect(await llamar(GEN, "POST", { id: FRUTAS }, {})).toMatchObject({ status: 429, body: { codigo: "tope_diario", error: MOTOR.tope_diario(ESTRATEGIAS_POR_DIA) } });
    nuevaBase({ estrategias: Array.from({ length: ESTRATEGIAS_A_LA_VEZ }, (_, i) => ({ id: `00000000-0000-4000-8000-0000000008${i}0`, company_id: `otra-${i}`, version: 1, estado: "en_curso", origen: "ia", created_at: hoy })) });
    expect(await llamar(GEN, "POST", { id: FRUTAS }, {})).toMatchObject({ status: 429, body: { codigo: "a_la_vez", error: MOTOR.a_la_vez(ESTRATEGIAS_A_LA_VEZ) } });
  });

  it("si encolar falla después de crear la versión, la versión queda descartada y la respuesta lo dice", async () => {
    base.fallos.jobs = { code: "08006", message: "la cola no responde" };
    como(CONSULTORA);
    const r = await llamar(GEN, "POST", { id: FRUTAS }, {});
    expect(r).toMatchObject({ status: 503, body: { codigo: "no_se_puso_en_marcha" } });
    expect(String(r.body.error)).toContain("No se gastó ninguna consulta");
    expect(filas("estrategias")[0]).toMatchObject({ estado: "descartada" });
  });
});

// ─── Corregir y elegir ───────────────────────────────────────────────────────────────────────────

describe("PATCH /estrategia/[eid] · corregir en el lugar", () => {
  it("un texto: cambia lo vigente y nunca lo que escribió 8X; deja la fila con antes, después y autor; la cifra de la consultora es aviso", async () => {
    const { eid, v } = await generar();
    const original = (v.salida as { caminos: { a: { jugadas: { por_que: string }[] } } }).caminos.a.jugadas[0]!.por_que;
    como(CONSULTORA);
    const nuevo = "Cada venta de «Fruta picada» resta unos S/ 900 al mes, según la libreta de Diego";
    const r = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/caminos/a/jugadas/0/por_que", texto: nuevo } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.estado).toBe("lista");
    const fila = filas("estrategias")[0]!;
    expect((fila.vigente as { caminos: { a: { jugadas: { por_que: string }[] } } }).caminos.a.jugadas[0]!.por_que).toBe(nuevo);
    expect((fila.salida as { caminos: { a: { jugadas: { por_que: string }[] } } }).caminos.a.jugadas[0]!.por_que).toBe(original);
    const validacion = r.body.validacion as { errores: unknown[]; avisos: { tipo: string; puntero: string }[] };
    expect(validacion.errores).toEqual([]);
    expect(validacion.avisos).toContainEqual(expect.objectContaining({ tipo: "cifra_de_la_consultora", puntero: "/caminos/a/jugadas/0/por_que" }));
    expect(filas("estrategia_ediciones")).toEqual([expect.objectContaining({ estrategia_id: eid, company_id: FRUTAS, puntero: "/caminos/a/jugadas/0/por_que", tipo: "texto", antes: original, despues: nuevo, autor: CONSULTORA.id })]);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ companyId: FRUTAS, accion: "editar", entidadId: eid }));
    // «Ver lo que escribió 8X»: volver a su texto también deja fila.
    const atras = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { restaurar: { puntero: "/caminos/a/jugadas/0/por_que" } });
    expect(atras.status).toBe(200);
    expect((filas("estrategias")[0]!.vigente as { caminos: { a: { jugadas: { por_que: string }[] } } }).caminos.a.jugadas[0]!.por_que).toBe(original);
    expect(filas("estrategia_ediciones").map((e) => e.tipo)).toEqual(["texto", "restaurar"]);
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { restaurar: { puntero: "/caminos/a/jugadas/0/por_que" } })).body.error).toBe(API.ya_es_lo_de_8x);
  });

  it("solo se corrige lo de CAMPOS_EDITABLES: lo que falta saber, lo que escribe el código o un efecto no (400), y nada queda en el rastro", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    for (const puntero of ["/faltan/0/por_que_importa", "/nota_de_confianza", "/caminos/a/jugadas/0/efecto", "/caminos/a/jugadas/9/que_se_mueve", "/lectura/7"]) {
      const r = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero, texto: "Un texto cualquiera" } });
      expect(r, puntero).toMatchObject({ status: 400, body: { error: API.no_editable } });
    }
    // Un puntero con otra forma ni llega a la acción.
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "caminos/a", texto: "Un texto" } })).status).toBe(400);
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { estado: "aprobada" })).status).toBe(400);
    expect(filas("estrategia_ediciones")).toHaveLength(0);
  });

  it("lo que corrige la consultora pasa por el validador: una palabra del método en la página del dueño la deja con observaciones; corregida, vuelve a «lista»", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    const mal = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/caminos/a/para_el_dueno/titulo", texto: "La lente del dinero" } });
    expect(mal.status).toBe(200);
    expect(mal.body.estado).toBe("con_observaciones");
    expect((mal.body.validacion as { errores: { tipo: string }[] }).errores).toContainEqual(expect.objectContaining({ tipo: "palabra_que_el_dueno_no_ve" }));
    const bien = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/caminos/a/para_el_dueno/titulo", texto: "Cobrar antes de crecer" } });
    expect(bien.body.estado).toBe("lista");
    expect(filas("estrategias")[0]!.estado).toBe("lista");
  });

  it("un responsable corregido: si es alguien de la empresa, el aviso se va; si no, queda su texto con el aviso", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    const fuera = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/victorias_14_dias/0/responsable", texto: "El nuevo cobrador" } });
    expect((fuera.body.validacion as { avisos: { tipo: string; puntero: string }[] }).avisos).toContainEqual(expect.objectContaining({ tipo: "responsable_no_encontrado", puntero: "/victorias_14_dias/0/responsable" }));
    const dentro = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/victorias_14_dias/0/responsable", texto: "Diego" } });
    expect((dentro.body.validacion as { avisos: { puntero: string }[] }).avisos.map((a) => a.puntero)).not.toContain("/victorias_14_dias/0/responsable");
    expect((filas("estrategias")[0]!.vigente as { victorias_14_dias: { responsable: string; responsable_encontrado: boolean }[] }).victorias_14_dias[0]).toMatchObject({ responsable: "Diego", responsable_encontrado: true });
  });

  it("el rango de una cifra por confirmar: dentro de su límite rehace los números del camino; fuera, no se guarda y dice el límite", async () => {
    const { eid, v } = await generar();
    const d90 = (e: unknown) => (e as { caminos: { a: { proyeccion: { total: { d90: { ritmo: { valor: { alto: number } | null } } } } } } }).caminos.a.proyeccion.total.d90.ritmo.valor?.alto;
    const antes = d90(v.vigente);
    como(CONSULTORA);
    const r = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { supuesto: { id: "SA1", bajo: 20, alto: 25 } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const vigente = filas("estrategias")[0]!.vigente as { supuestos: { id: string; rango: { bajo: number; alto: number } }[] };
    expect(vigente.supuestos.find((s) => s.id === "SA1")!.rango).toEqual({ bajo: 20, alto: 25 });
    expect(d90(vigente)).toBeGreaterThan(antes!);
    expect(filas("estrategia_ediciones").at(-1)).toMatchObject({ tipo: "supuesto", puntero: expect.stringMatching(/^\/supuestos\/\d+\/rango$/), antes: { bajo: 10, alto: 15 }, despues: { bajo: 20, alto: 25 } });
    const fuera = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { supuesto: { id: "SA1", bajo: 40, alto: 50 } });
    expect(fuera.status).toBe(400);
    expect(String(fuera.body.error)).toMatch(/^Ese rango no entra en las cuentas: .*va de -30 a 30/);
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { supuesto: { id: "SB9", bajo: 1, alto: 2 } })).body.error).toBe(API.supuesto_no_existe);
  });

  it("elegir el camino guarda la elección con su motivo y deja la fila «eleccion»", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    const r = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "b", motivo: "El dueño prefiere ordenar la compra primero" } });
    expect(r.body).toMatchObject({ camino_elegido: "b" });
    expect(filas("estrategias")[0]).toMatchObject({ camino_elegido: "b", motivo_eleccion: "El dueño prefiere ordenar la compra primero" });
    expect(filas("estrategia_ediciones")).toEqual([expect.objectContaining({ tipo: "eleccion", puntero: "/camino_elegido", antes: null, despues: { camino: "b", motivo: "El dueño prefiere ordenar la compra primero" } })]);
  });

  it("dos pestañas a la vez: la que llega con la versión vieja no pisa a la otra (409 con qué hacer)", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    // Otra pestaña guarda justo entre la lectura y la escritura de esta.
    const original = base.from;
    base.from = (tabla: string) => {
      const q = original(tabla);
      if (tabla === "estrategias") {
        const actualizar = q.update;
        q.update = (c: Fila) => {
          filas("estrategias")[0]!.updated_at = "2026-10-16T15:00:01.000Z";
          return actualizar(c);
        };
      }
      return q;
    };
    const r = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/lectura/0", texto: "Lo que escribió esta pestaña" } });
    base.from = original;
    expect(r).toMatchObject({ status: 409, body: { error: API.cambio_mientras_tanto } });
    expect((filas("estrategias")[0]!.vigente as { lectura: string[] }).lectura[0]).not.toBe("Lo que escribió esta pestaña");
    expect(filas("estrategia_ediciones")).toHaveLength(0);
  });

  it("una versión con observaciones: no se aprueba mientras quede algo; resuelto lo último, vuelve a «lista» y se aprueba", async () => {
    const { eid } = await generar({ lente_dinero: LENTE_DINERO_BUENA, lente_terreno: LENTE_TERRENO_BUENA, equipo_rojo: ROJO_CON_CIFRAS });
    const fila = filas("estrategias")[0]!;
    expect(fila.estado).toBe("con_observaciones");
    const quitado = (fila.vigente as { quitado: { puntero: string; resuelto: boolean }[] }).quitado;
    expect(quitado.length).toBeGreaterThan(0);
    como(CONSULTORA);
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } })).status).toBe(200);
    const pendientes = new Set(quitado.map((q) => q.puntero)).size;
    const no = await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {});
    expect(no).toMatchObject({ status: 409, body: { codigo: "por_resolver", error: API.por_resolver(pendientes) } });
    expect((no.body.pendientes as unknown[]).length).toBe(pendientes);
    // Uno se corrige a mano; los demás se aceptan como los dejó 8X.
    const [primero, ...resto] = [...new Set(quitado.map((q) => q.puntero))];
    expect(primero).toBe("/lectura/0");
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/lectura/0", texto: "Vende {{N:venta_mes}} al mes y, con las cuentas, le quedan {{C:mult.utilidad_hoy}}." } })).status).toBe(200);
    let ultimo: Respuesta | null = null;
    for (const p of resto) ultimo = await llamar(VER, "PATCH", { id: FRUTAS, eid }, { aceptar: { puntero: p } });
    expect(ultimo!.body.estado).toBe("lista");
    expect((await llamar(VER, "PATCH", { id: FRUTAS, eid }, { aceptar: { puntero: resto[0]! } })).body.error).toBe(API.nada_que_aceptar);
    expect(filas("estrategia_ediciones").filter((e) => e.tipo === "quitar")).toHaveLength(resto.length);
    expect((await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).status).toBe(200);
  });
});

// ─── Aprobar ─────────────────────────────────────────────────────────────────────────────────────

describe("POST /estrategia/[eid]/aprobar", () => {
  it("sin camino elegido no se aprueba", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    expect(await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { codigo: "falta_elegir", error: API.falta_elegir } });
  });

  it("aprueba: la página del dueño se congela con las cifras escritas, y la biblioteca guarda SOLO esa página", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } });
    const r = await llamar(APROBAR, "POST", { id: FRUTAS, eid }, { motivo: "Ataca la fuga más grande sin pedir dinero" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ estado: "aprobada", aviso: null });
    const v = filas("estrategias")[0]!;
    expect(v).toMatchObject({ estado: "aprobada", aprobada_por: CONSULTORA.id, camino_elegido: "a", motivo_eleccion: "Ataca la fuga más grande sin pedir dinero" });
    const pagina = v.para_dueno as ParaDueno;
    expect(pagina.formato).toBe(FORMATO_PARA_DUENO);
    expect(JSON.stringify(pagina)).not.toContain("{{");
    expect(palabrasQueElDuenoNoVe(textoDePagina(pagina))).toEqual([]);
    const [copia] = filas("deliverables");
    expect(copia).toMatchObject({ company_id: FRUTAS, tipo: "plan_estrategico", version: 1, id: r.body.entregable_id });
    expect(copia!.contenido).toEqual({ formato: FORMATO_PARA_DUENO, estrategia_id: eid, version: 1, para_dueno: pagina });
    expect(JSON.stringify(copia!.contenido)).not.toMatch(/\{\{|"vigente"|"calculos"|"caminos"/);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ companyId: FRUTAS, accion: "aprobar", entidadId: eid }));
    // Aprobada, ya no se corrige: el texto de §7.3.
    expect(await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/lectura/0", texto: "Otra lectura" } })).toMatchObject({ status: 409, body: { error: API.ya_la_ve_el_cliente } });
    expect(await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { error: API.ya_la_ve_el_cliente } });
  });

  it("si la copia de la biblioteca no se guarda, la aprobación vale y se dice", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } });
    base.fallos.deliverables = { code: "23514", message: 'new row violates check constraint "deliverables_tipo_check"' };
    const r = await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {});
    expect(r.status).toBe(200);
    expect(String(r.body.aviso)).toMatch(/^La estrategia quedó aprobada y tu cliente ya la ve, pero no se pudo guardar su copia/);
    expect(filas("estrategias")[0]!.estado).toBe("aprobada");
  });

  it("bloqueo optimista: si otra pestaña guarda una corrección mientras se aprueba, no se aprueba una página que ya no es la de lo vigente (409)", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } });
    const original = base.rpc;
    // Justo antes de aprobar, otra pestaña guarda: la fila ya no es la que se leyó.
    base.rpc = async (nombre: string, args: Record<string, unknown> = {}) => {
      if (nombre === "aprobar_estrategia") filas("estrategias")[0]!.updated_at = new Date(Date.now() + 60_000).toISOString();
      return original(nombre, args);
    };
    expect(await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { codigo: "cambio_mientras_tanto", error: API.cambio_mientras_tanto } });
    expect(filas("estrategias")[0]!.estado).toBe("lista");
    expect(filas("deliverables")).toHaveLength(0);
    // Con la página recargada (la fila como está ahora), sí.
    base.rpc = original;
    expect((await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).status).toBe(200);
  });
});

// ─── Actualizar números ──────────────────────────────────────────────────────────────────────────

describe("POST /estrategia/[eid]/actualizar · «Actualizar números», sin IA", () => {
  /** El dueño responde por la ruta una pregunta enviada. */
  async function responder(clave: string, cuerpo: unknown) {
    const p = filas("estrategia_preguntas").find((x) => x.clave === clave)!;
    como(CONSULTORA);
    expect((await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: [p.id] })).status).toBe(200);
    despues(30);
    como(DUENO);
    const r = await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(p.id) }, cuerpo);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    return p;
  }

  it("crea una versión nueva sin llamar al modelo: copia lo de 8X y lo corregido, vuelve a validar, trae lo que respondió el dueño y dice qué cambió", async () => {
    const { eid, llamadas } = await generar();
    expect(llamadas).toHaveLength(3);
    como(CONSULTORA);
    await llamar(VER, "PATCH", { id: FRUTAS, eid }, { texto: { puntero: "/lectura/3", texto: "La apuesta: cobrar a tiempo lo ya vendido y poner reglas al crédito." } });
    await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } });
    await responder("clientes_dormidos", { respuesta: { valor: 40, estado: "contado" } });
    como(CONSULTORA);
    const detalle = await llamar(VER, "GET", { id: FRUTAS, eid });
    expect(detalle.body.respuestas_nuevas).toBe(1);

    const r = await llamar(ACTUALIZAR, "POST", { id: FRUTAS, eid }, {});
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(llamadas).toHaveLength(3);
    const nueva = versionN(2);
    expect(nueva).toMatchObject({ id: r.body.estrategia_id, origen: "actualizacion", basada_en: eid, estado: "lista", etapa: "terminada", camino_elegido: "a" });
    expect((nueva.vigente as { lectura: string[] }).lectura[3]).toBe("La apuesta: cobrar a tiempo lo ya vendido y poner reglas al crédito.");
    expect((nueva.salida as { lectura: string[] }).lectura[3]).toBe((versionN(1).salida as { lectura: string[] }).lectura[3]);
    expect((nueva.paquete as { hechos: { id: string }[] }).hechos.map((h) => h.id)).toContain("Q:clientes_dormidos");
    expect((nueva.validacion as { errores: unknown[]; de: string })).toMatchObject({ errores: [], de: "final" });
    const d = r.body.diferencias as { respondidas: { id: string }[]; ya_no_falta: { id: string }[]; resumen: string[] };
    expect(d.respondidas.map((x) => x.id)).toEqual(["Q:clientes_dormidos"]);
    expect(d.ya_no_falta.map((x) => x.id)).toContain("X:clientes_dormidos");
    expect(d.resumen[0]).toBe("El dueño respondió una pregunta.");
    // La versión nueva dice sola qué cambió; la anterior sigue como estaba.
    const g = await llamar(VER, "GET", { id: FRUTAS, eid: String(nueva.id) });
    expect((g.body.que_cambio as { diferencias: { respondidas: unknown[] } }).diferencias.respondidas).toHaveLength(1);
    expect(versionN(1).estado).toBe("lista");
    // No cuenta para el tope diario: lo que se generó con el modelo sigue siendo una.
    expect(filas("estrategias").filter((x) => x.origen === "ia")).toHaveLength(1);
  });

  it("si nada cambió, no crea otra versión; con una generándose, no se ofrece", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    expect(await llamar(ACTUALIZAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { codigo: "sin_cambios", error: API.sin_cambios } });
    await responder("clientes_dormidos", { respuesta: { desde: 30, hasta: 50, estado: "estimado" } });
    usarProveedor(proveedorFalso(BUENAS).proveedor);
    como(CONSULTORA);
    expect((await llamar(GEN, "POST", { id: FRUTAS }, {})).status).toBe(201);
    expect(await llamar(ACTUALIZAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { codigo: "en_curso", error: API.espera_la_que_se_genera } });
    expect(filas("estrategias").filter((x) => x.origen === "actualizacion")).toHaveLength(0);
  });

  it("aprobar la versión nueva reemplaza a la aprobada: una sola aprobada, y el dueño veía la anterior hasta entonces", async () => {
    const { eid } = await generar();
    como(CONSULTORA);
    await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } });
    expect((await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).status).toBe(200);
    await responder("clientes_dormidos", { respuesta: { valor: 40, estado: "contado" } });
    como(CONSULTORA);
    const r = await llamar(ACTUALIZAR, "POST", { id: FRUTAS, eid }, {});
    expect(r.status).toBe(201);
    expect(versionN(1).estado).toBe("aprobada");
    expect((await llamar(APROBAR, "POST", { id: FRUTAS, eid: String(r.body.estrategia_id) }, {})).status).toBe(200);
    expect(filas("estrategias").map((v) => [v.version, v.estado])).toEqual([[1, "reemplazada"], [2, "aprobada"]]);
    expect(filas("deliverables").map((d) => d.version)).toEqual([1, 2]);
    expect(await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "b" } })).toMatchObject({ status: 409, body: { error: API.ya_la_vio_el_cliente } });
  });
});

// ─── Reintentar y descartar ──────────────────────────────────────────────────────────────────────

describe("reintentar una etapa y descartar una versión", () => {
  it("reintentar: la lente que no validó vuelve a la cola (una sola vez aunque se pulse dos veces) y la prueba corre después", async () => {
    const { AIValidationError } = await import("@/lib/ai/provider");
    let vez = 0;
    const p = proveedorFalso({
      lente_dinero: LENTE_DINERO_BUENA,
      lente_terreno: () => {
        if (++vez === 1) throw new AIValidationError("La salida del modelo no validó contra el esquema (lente_terreno): camino.jugadas: Too small", "{}");
        return LENTE_TERRENO_BUENA;
      },
      equipo_rojo: ROJO_BUENO,
    });
    usarProveedor(p.proveedor);
    como(CONSULTORA);
    const g = await llamar(GEN, "POST", { id: FRUTAS }, {});
    await correrCola();
    const eid = String(g.body.estrategia_id);
    const original = String((filas("estrategias")[0]!.trabajos as Record<string, string>).terreno);
    const etapas = await llamar(VER, "GET", { id: FRUTAS, eid }, undefined, "?solo=etapas");
    expect((etapas.body.etapas as { fallida: boolean; aviso: string }).fallida).toBe(true);
    expect((etapas.body.etapas as { aviso: string }).aviso).toMatch(/^El camino del dinero está listo; el camino de la operación no salió/);
    expect(trabajos("estrategia_rojo")).toHaveLength(0);

    const r = await llamar(REINTENTAR, "POST", { id: FRUTAS, eid }, { etapa: "terreno" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const nuevo = (filas("estrategias")[0]!.trabajos as Record<string, string>).terreno;
    expect(nuevo).not.toBe(original);
    expect(trabajos("estrategia_lente").map((j) => j.id)).toEqual(expect.arrayContaining([original, nuevo]));
    expect(trabajos().find((j) => j.id === nuevo)).toMatchObject({ origen_job_id: original, payload: { estrategia_id: eid, lente: "terreno" } });
    // Pulsar otra vez antes de que corra: la etapa ya no está fallida.
    expect(await llamar(REINTENTAR, "POST", { id: FRUTAS, eid }, { etapa: "terreno" })).toMatchObject({ status: 409, body: { codigo: "no_fallo" } });
    expect(trabajos("estrategia_lente")).toHaveLength(3);
    await correrCola();
    expect(filas("estrategias")[0]).toMatchObject({ estado: "lista" });
    // La lente del dinero no se volvió a pagar: tres lentes pedidas… dos de terreno y una de dinero, y una prueba.
    expect(p.llamadas.map((l) => l.agente).sort()).toEqual(["equipo_rojo", "lente_dinero", "lente_terreno", "lente_terreno"]);
  });

  it("si las dos lentes quedaron y nadie puso en marcha la prueba, reintentar la pone en marcha (con su clave de siempre)", async () => {
    usarProveedor(proveedorFalso(BUENAS).proveedor);
    como(CONSULTORA);
    const g = await llamar(GEN, "POST", { id: FRUTAS }, {});
    const eid = String(g.body.estrategia_id);
    for (const j of trabajos("estrategia_lente")) await correr(j);
    // Murió justo después de guardar las dos lentes: no hay prueba en la cola ni anotada.
    base.tablas.jobs = trabajos().filter((j) => j.tipo !== "estrategia_rojo");
    const v = filas("estrategias")[0]!;
    v.trabajos = { dinero: (v.trabajos as Record<string, string>).dinero, terreno: (v.trabajos as Record<string, string>).terreno };
    const r = await llamar(REINTENTAR, "POST", { id: FRUTAS, eid }, {});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [rojo] = trabajos("estrategia_rojo");
    expect(rojo!.idempotency_key).toBe(claveIdempotente(["estrategia-rojo", eid, "1"]));
    expect((filas("estrategias")[0]!.trabajos as Record<string, string>).rojo).toBe(rojo!.id);
  });

  it("una etapa que no falló o una versión que ya no se genera no se reintentan; mientras se genera, no se corrige, no se aprueba ni se actualiza", async () => {
    usarProveedor(proveedorFalso(BUENAS).proveedor);
    como(CONSULTORA);
    const g = await llamar(GEN, "POST", { id: FRUTAS }, {});
    const eid = String(g.body.estrategia_id);
    expect(await llamar(REINTENTAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { codigo: "nada_que_reintentar", error: API.nada_que_reintentar } });
    expect(await llamar(REINTENTAR, "POST", { id: FRUTAS, eid }, { etapa: "rojo" })).toMatchObject({ status: 409, body: { error: API.etapa_no_fallo("la prueba de los dos caminos") } });
    // Mientras se genera tampoco se corrige ni se aprueba.
    expect(await llamar(VER, "PATCH", { id: FRUTAS, eid }, { elegir: { camino: "a" } })).toMatchObject({ status: 409, body: { error: API.generandose } });
    expect(await llamar(APROBAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { error: API.generandose } });
    expect(await llamar(ACTUALIZAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { error: API.sin_numeros } });
    await correrCola();
    expect(await llamar(REINTENTAR, "POST", { id: FRUTAS, eid }, {})).toMatchObject({ status: 409, body: { error: API.no_se_genera } });
  });

  it("descartar una en curso libera el «una en curso» (se puede pedir otra); lo pagado queda en la fila; una lista no se descarta", async () => {
    usarProveedor(proveedorFalso(BUENAS).proveedor);
    como(CONSULTORA);
    const g = await llamar(GEN, "POST", { id: FRUTAS }, {});
    const eid = String(g.body.estrategia_id);
    await correr(trabajos("estrategia_lente")[0]!);
    expect((await llamar(VER, "POST", { id: FRUTAS, eid }, { descartar: true })).status).toBe(200);
    expect(filas("estrategias")[0]).toMatchObject({ estado: "descartada" });
    expect(filas("estrategias")[0]!.lente_dinero ?? filas("estrategias")[0]!.lente_terreno).toBeTruthy();
    // La lente que quedaba en la cola ya no hace nada: la versión no está en curso.
    await correrCola();
    expect(filas("estrategias")[0]!.estado).toBe("descartada");
    const otra = await llamar(GEN, "POST", { id: FRUTAS }, {});
    expect(otra.status).toBe(201);
    expect(otra.body.version).toBe(2);
    await correrCola();
    expect(await llamar(VER, "POST", { id: FRUTAS, eid: String(otra.body.estrategia_id) }, { descartar: true })).toMatchObject({ status: 409, body: { error: API.solo_se_descarta_en_curso } });
    expect((await llamar(VER, "POST", { id: FRUTAS, eid }, { descartar: false })).status).toBe(400);
  });
});

// ─── Las preguntas para el dueño ─────────────────────────────────────────────────────────────────

describe("las preguntas: la consultora las envía con un toque", () => {
  it("antes de enviar, la consultora ve las propuestas con su porqué y lo que se le abrirá al dueño", async () => {
    await generar({ ...BUENAS, equipo_rojo: ROJO_CON_SECCIONES });
    como(CONSULTORA);
    const r = await llamar(PREGUNTAS_RUTA, "GET", { id: FRUTAS });
    expect(r.status).toBe(200);
    const propuestas = (r.body.preguntas as Fila[]).filter((p) => p.estado === "propuesta");
    expect(propuestas.length).toBeGreaterThanOrEqual(4);
    for (const p of propuestas) expect(p.por_que).toBeTruthy();
    const porAbrir = r.body.por_abrir as { secciones: { seccion: string; nombre: string; lineas: string[] }[]; resumen: string };
    expect(porAbrir.secciones.map((s) => s.seccion).sort()).toEqual(["costos", "credito"]);
    expect(porAbrir.resumen).toBe(PREGUNTAS.resumen_envio(propuestas.length, porAbrir.secciones.map((s) => s.nombre)));
    expect(porAbrir.resumen).toMatch(/^Se le abrirá al dueño: \d+ preguntas, .*«Tus ventas al crédito o fiadas»/);
  });

  it("enviar: las preguntas pasan a enviadas, se activa «preguntas_estrategia» con su cuenta y se abren las secciones con su línea; volver a enviar no repite nada", async () => {
    const { eid } = await generar({ ...BUENAS, equipo_rojo: ROJO_CON_SECCIONES });
    const ids = filas("estrategia_preguntas").filter((p) => p.estado === "propuesta").map((p) => String(p.id));
    como(CONSULTORA);
    const r = await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: ids, estrategia_id: eid });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ enviadas: ids.length, ya_enviadas: 0, sin_responder: ids.length });
    expect(filas("estrategia_preguntas").filter((p) => ids.includes(String(p.id))).every((p) => p.estado === "enviada" && p.enviada_por === CONSULTORA.id && p.enviada_at)).toBe(true);
    const pedidos = filas("solicitudes_cliente").filter((s) => s.estado === "activa");
    expect(pedidos.map((s) => s.seccion).sort()).toEqual(["costos", "credito", "preguntas_estrategia"]);
    expect(pedidos.find((s) => s.seccion === "preguntas_estrategia")).toMatchObject({ nota: PREGUNTAS.nota(ids.length), activada_por: CONSULTORA.id });
    expect(String(pedidos.find((s) => s.seccion === "credito")!.nota)).toMatch(/^Para la estrategia: /);
    expect(r.body.resumen).toBe(PREGUNTAS.resumen_envio(ids.length, (r.body.secciones as { nombre: string }[]).map((s) => s.nombre)));
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ companyId: FRUTAS, accion: "publicar", entidad: "estrategia_pregunta" }));

    const otra = await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: ids, estrategia_id: eid });
    expect(otra.body).toMatchObject({ enviadas: 0, ya_enviadas: ids.length });
    expect(filas("solicitudes_cliente")).toHaveLength(3);
    expect(filas("solicitudes_cliente").find((s) => s.seccion === "credito")!.nota).toBe(pedidos.find((s) => s.seccion === "credito")!.nota);
  });

  it("la línea de la estrategia se agrega DEBAJO de la nota de la consultora, nunca la pisa, y la nota no pasa de su tope", async () => {
    const larga = `Revisa con Marta las facturas de septiembre. ${"Hay que mirar cada cliente con calma. ".repeat(14)}`.slice(0, 540).trimEnd();
    nuevaBase({ solicitudes_cliente: [{ id: "00000000-0000-4000-8000-0000000005c1", company_id: FRUTAS, seccion: "credito", nota: larga, estado: "activa", activada_at: HOY.toISOString() }] });
    const { eid } = await generar({ ...BUENAS, equipo_rojo: ROJO_CON_SECCIONES });
    como(CONSULTORA);
    const r = await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: [], estrategia_id: eid, secciones: ["credito"] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const credito = filas("solicitudes_cliente").filter((s) => s.seccion === "credito");
    expect(credito).toHaveLength(1);
    const nota = String(credito[0]!.nota);
    expect(nota.startsWith(larga)).toBe(true);
    expect(nota.length).toBeLessThanOrEqual(TOPE_NOTA);
    expect(nota.split("\n").at(-1)).toBe(PREGUNTAS.y_mas(1));
    expect((r.body.secciones as { no_cupieron: string[] }[])[0]!.no_cupieron).toHaveLength(1);
    // Sin preguntas elegidas no se activa el pedido de las preguntas.
    expect(filas("solicitudes_cliente").some((s) => s.seccion === "preguntas_estrategia")).toBe(false);
  });

  it("no se envía lo que no es de la empresa, lo respondido ni lo retirado; sin nada que enviar, 400", async () => {
    await generar();
    const [p] = filas("estrategia_preguntas").filter((x) => x.estado === "propuesta");
    como(CONSULTORA);
    expect(await llamar(PREGUNTAS_RUTA, "POST", { id: OTRA }, { enviar: [p!.id] })).toMatchObject({ status: 404, body: { error: PREGUNTAS.no_es_de_la_empresa } });
    p!.estado = "retirada";
    expect(await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: [p!.id] })).toMatchObject({ status: 409, body: { error: PREGUNTAS.ya_no_se_envia("retirada") } });
    nuevaBase();
    expect(await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: [] })).toMatchObject({ status: 400, body: { error: PREGUNTAS.nada_que_enviar } });
    expect((await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: ["no-es-un-id"] })).status).toBe(400);
  });

  it("«preguntas_estrategia» no se abre con una casilla de «Activar para el cliente»: CuerpoActivar la rechaza", () => {
    expect(CuerpoActivar.safeParse({ secciones: [{ seccion: "preguntas_estrategia" }] }).success).toBe(false);
    expect(CuerpoActivar.safeParse({ secciones: [{ seccion: "credito" }] }).success).toBe(true);
  });

  it("la consultora retoca una propuesta (con las reglas de una buena pregunta) y retira; si retira la última enviada, el pedido del dueño se retira", async () => {
    await generar();
    const [a, b] = filas("estrategia_preguntas").filter((x) => x.estado === "propuesta");
    como(CONSULTORA);
    const doble = await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(a!.id) }, { texto: "¿Cuántos clientes dejaron de comprarte y cuánto te compraban?" });
    expect(doble.status).toBe(400);
    expect(String(doble.body.error)).toMatch(/^Esa pregunta no se puede hacer así: .*(?:une dos preguntas|más de una pregunta)/);
    const conCifra = await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(a!.id) }, { texto: "¿Te dejaron de comprar unos 20 clientes este año?" });
    expect(String(conCifra.body.error)).toMatch(/trae una cifra/);
    const bien = await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(a!.id) }, { texto: "¿Cuántos clientes te compraron el año pasado y este año no han vuelto?" });
    expect(bien.status, JSON.stringify(bien.body)).toBe(200);
    expect(a!.texto).toBe("¿Cuántos clientes te compraron el año pasado y este año no han vuelto?");

    expect((await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: [a!.id] })).status).toBe(200);
    expect(await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(a!.id) }, { texto: "¿Cuántos clientes no han vuelto este año?" })).toMatchObject({ status: 409, body: { error: PREGUNTAS.solo_propuesta_se_retoca } });
    expect((await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(b!.id) }, { retirar: true })).status).toBe(200);
    expect(b!.estado).toBe("retirada");
    expect(filas("solicitudes_cliente").find((s) => s.seccion === "preguntas_estrategia")!.estado).toBe("activa");
    const r = await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(a!.id) }, { retirar: true });
    expect(r.body).toMatchObject({ sin_responder: 0 });
    expect(filas("solicitudes_cliente").find((s) => s.seccion === "preguntas_estrategia")!.estado).toBe("retirada");
    expect(await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(a!.id) }, { retirar: true })).toMatchObject({ status: 409, body: { error: PREGUNTAS.ya_retirada } });
  });
});

describe("las preguntas: el dueño responde solo las enviadas de su empresa", () => {
  async function enviadas() {
    await generar();
    const todas = filas("estrategia_preguntas").filter((x) => x.estado === "propuesta");
    const [enviada, propuesta] = todas;
    como(CONSULTORA);
    expect((await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: [enviada!.id] })).status).toBe(200);
    return { enviada: enviada!, propuesta: propuesta!, otra: todas.find((p) => String(p.clave).startsWith("otra."))! };
  }

  it("el dueño ve solo lo enviado y lo respondido, sin lo que es de la consultora; no lee la estrategia por la API", async () => {
    const { enviada } = await enviadas();
    como(DUENO);
    const r = await llamar(PREGUNTAS_RUTA, "GET", { id: FRUTAS });
    expect(r.status).toBe(200);
    expect((r.body.preguntas as Fila[]).map((p) => p.id)).toEqual([enviada.id]);
    expect((r.body.preguntas as Fila[])[0]).not.toHaveProperty("por_que");
    expect((r.body.preguntas as Fila[])[0]).not.toHaveProperty("espera");
    expect(r.body.por_abrir).toBeUndefined();
    const consulta = base.pedidos.filter((p) => p.tabla === "estrategia_preguntas" && p.op === "select").pop()!;
    expect(consulta.columnas).not.toMatch(/por_que|espera|clave/);
    expect(consulta.filtros).toContainEqual(["in", "estado", ["enviada", "respondida"]]);
    expect((await llamar(GEN, "GET", { id: FRUTAS })).status).toBe(403);
  });

  it("responde con el dato dicho del dueño: número, rango o «No lo sé»; «comprobado» no; puede corregirlo mientras su pedido siga abierto", async () => {
    const { enviada } = await enviadas();
    como(DUENO);
    const pid = String(enviada.id);
    expect((await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid }, { respuesta: { valor: 40, estado: "comprobado" } })).status).toBe(400);
    expect(await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid }, {})).toMatchObject({ status: 400 });
    expect((await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid }, { respuesta: { valor: -3, estado: "contado" } })).body.error).toMatch(/no puede ser negativo/);
    const r = await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid }, { respuesta: { desde: 30, hasta: 50, estado: "estimado" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(enviada).toMatchObject({ estado: "respondida", respuesta: { desde: 30, hasta: 50, estado: "estimado" }, respondida_por: DUENO.id });
    expect(r.body).toMatchObject({ sin_responder: 0 });
    expect((await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid }, { respuesta: { estado: "no_lo_se" } })).status).toBe(200);
    expect(enviada.respuesta).toEqual({ estado: "no_lo_se" });
    // «Listo, ya respondí» cierra su pedido: después ya no escribe.
    filas("solicitudes_cliente").find((s) => s.seccion === "preguntas_estrategia")!.estado = "completada";
    expect(await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid }, { respuesta: { valor: 10, estado: "contado" } })).toMatchObject({ status: 403, body: { error: TEXTO_SECCION_CERRADA } });
  });

  it("una «otra» que pide un número lleva su unidad (casilla de número); una de texto se responde con texto; una propuesta no existe para el dueño (404)", async () => {
    const r0 = await enviadas();
    // La del ejemplo pide un conteo: se responde con su casilla de número y entra en las cuentas.
    expect(r0.otra.unidad).toBe("unidades_mes");
    // Una «otra» sin unidad (la que no pide un número) se responde con texto.
    r0.otra.unidad = "texto";
    como(CONSULTORA);
    await llamar(PREGUNTAS_RUTA, "POST", { id: FRUTAS }, { enviar: [r0.otra.id] });
    como(DUENO);
    expect(await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(r0.otra.id) }, { respuesta: { valor: 3, estado: "contado" } })).toMatchObject({ status: 400, body: { error: PREGUNTAS.falta_texto } });
    expect((await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(r0.otra.id) }, { respuesta_texto: "Unas tres o cuatro cajas, casi siempre de mango" })).status).toBe(200);
    expect(r0.otra).toMatchObject({ estado: "respondida", respuesta: null, respuesta_texto: "Unas tres o cuatro cajas, casi siempre de mango" });
    const propuesta = filas("estrategia_preguntas").find((p) => p.estado === "propuesta")!;
    expect(await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(propuesta.id) }, { respuesta: { valor: 2, estado: "contado" } })).toMatchObject({ status: 404, body: { error: PREGUNTAS.no_esta_para_ti } });
    expect(propuesta.estado).toBe("propuesta");
  });

  it("ni una participante sin rol de dueño ni el dueño de otra empresa responden (403)", async () => {
    const { enviada } = await enviadas();
    como(PARTICIPANTE);
    expect((await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(enviada.id) }, { respuesta: { valor: 4, estado: "contado" } })).status).toBe(403);
    expect(await llamar(PREGUNTAS_RUTA, "GET", { id: FRUTAS })).toMatchObject({ status: 403, body: { error: PREGUNTAS.solo_quien_dirige } });
    como(DUENO_AJENO);
    expect((await llamar(PREGUNTA, "PATCH", { id: FRUTAS, pid: String(enviada.id) }, { respuesta: { valor: 4, estado: "contado" } })).status).toBe(403);
    expect((await llamar(PREGUNTAS_RUTA, "GET", { id: FRUTAS })).status).toBe(403);
    // Desde su propia empresa tampoco llega a una pregunta ajena: no es suya.
    base.tablas.solicitudes_cliente!.push({ id: "00000000-0000-4000-8000-0000000005c9", company_id: OTRA, seccion: "preguntas_estrategia", estado: "activa", nota: null });
    expect(await llamar(PREGUNTA, "PATCH", { id: OTRA, pid: String(enviada.id) }, { respuesta: { valor: 4, estado: "contado" } })).toMatchObject({ status: 404, body: { error: PREGUNTAS.no_esta_para_ti } });
    expect(enviada.estado).toBe("enviada");
  });
});

// ─── Lo puro de las rutas ────────────────────────────────────────────────────────────────────────

describe("lo puro: qué se corrige, la nota de la sección y el pedido del mínimo", () => {
  it("CAMPOS_EDITABLES son los textos de la estrategia menos lo que falta saber", () => {
    expect(CAMPOS_EDITABLES.some((p) => p.startsWith("/faltan/"))).toBe(false);
    expect(esEditable("/caminos/a/jugadas/2/que_se_mueve")).toBe(true);
    expect(esEditable("/anexos/terreno/canvas/segmentos/texto")).toBe(true);
    expect(esEditable("/caminos/b/para_el_dueno/pasos/0")).toBe(true);
    expect(esEditable("/faltan/0/pregunta_si_otra")).toBe(false);
    expect(esEditable("/nota_de_confianza")).toBe(false);
    expect(esEditable("/caminos/a/jugadas/2/efecto/pct")).toBe(false);
    expect(esEditable("/caminos/a/proyeccion")).toBe(false);
  });

  it("notaConLineas agrega sin pisar, sin repetir, con el cierre que cuenta lo que no cupo, y nunca pasa del tope", () => {
    expect(notaConLineas(null, ["Para la estrategia: a", "Para la estrategia: a"])).toEqual({ nota: "Para la estrategia: a", agregadas: ["Para la estrategia: a"], no_cupieron: [] });
    expect(notaConLineas("Lo de la consultora", ["Para la estrategia: a"]).nota).toBe("Lo de la consultora\nPara la estrategia: a");
    expect(notaConLineas("Lo de la consultora\nPara la estrategia: a", ["Para la estrategia: a"])).toEqual({ nota: "Lo de la consultora\nPara la estrategia: a", agregadas: [], no_cupieron: [] });
    const previa = "x".repeat(540);
    const r = notaConLineas(previa, ["Para la estrategia: " + "y".repeat(30), "Para la estrategia: " + "z".repeat(30)]);
    expect(r.nota!.startsWith(previa)).toBe(true);
    expect(r.nota!.length).toBeLessThanOrEqual(TOPE_NOTA);
    expect(r.no_cupieron).toHaveLength(2);
    expect(r.nota!.endsWith(PREGUNTAS.y_mas(2))).toBe(true);
    // El cierre de un envío anterior lo escribió 8X: se rehace, no se acumula.
    const dos = ["Para la estrategia: " + "y".repeat(30), "Para la estrategia: " + "z".repeat(30)];
    const otra = notaConLineas(r.nota, dos);
    expect(otra.nota!.match(/cosas? más que verás al entrar/g)).toHaveLength(1);
    expect(otra.nota).toBe(r.nota);
    // Si ahora se manda una sola, cabe entera: entra y el cierre viejo se va.
    expect(notaConLineas(r.nota, [dos[0]!])).toMatchObject({ nota: `${previa}\n${dos[0]}`, agregadas: [dos[0]], no_cupieron: [] });
    // Si ni el cierre cabe, la nota queda como estaba.
    const llena = "w".repeat(TOPE_NOTA);
    expect(notaConLineas(llena, ["Para la estrategia: algo"])).toEqual({ nota: llena, agregadas: [], no_cupieron: ["Para la estrategia: algo"] });
  });

  it("el pedido del mínimo pide solo lo que el dueño puede dar", () => {
    expect(pedidoPorMinimo([])).toBeNull();
    expect(pedidoPorMinimo(["Sin diagnóstico no hay de dónde partir: hace falta al menos un hallazgo, o quince hechos y percepciones."])).toBeNull();
    const p = pedidoPorMinimo(["Sin la venta del mes no hay base para ningún número.", "Sin gastos ni ganancia no hay utilidad que duplicar."]);
    expect(p).toEqual({ seccion: "datos_faltantes", nota: "Para preparar tu plan nos falta saber cuánto vendiste el mes pasado y tus gastos fijos del mes, o lo que te quedó libre." });
    expect(palabrasQueElDuenoNoVe(p!.nota)).toEqual([]);
  });
});
