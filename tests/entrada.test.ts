/**
 * LA ENTRADA BREVE: DOCE PREGUNTAS FIJAS, LO SABIDO SE CONFIRMA Y «NO LO SÉ» NUNCA ES CERO (R7.1, parte de R6.1).
 *
 * Hasta el 13-10-2026 el dueño llenaba una ficha de diez campos escritos y luego conversaba con un modelo
 * que elegía la siguiente pregunta. Dirección pidió una puerta distinta: entre ocho y doce preguntas fijas,
 * en cuatro grupos; texto, voz, documentos, aproximaciones y «no lo sé»; revisar lo existente antes de
 * preguntar; guardar y retomar; y una síntesis que el dueño corrige. Aquí se prueba que eso es lo que hace
 * el código, y no lo que dice un comentario.
 *
 * Cómo se prueba. El plan y las reglas son puros (src/lib/entrada.ts). Lo que toca la base se prueba CON
 * DOBLES: un PostgREST en memoria que filtra, inserta y actualiza, y que rechaza una columna que no existe.
 * No es Supabase ni Postgres: prueba el orden, las reglas y qué se encola. Al final, sobre POSTGRES EMBEBIDO
 * (PGlite, tampoco es Supabase), se comprueba que las columnas que el código lee y escribe existen de verdad
 * en el esquema aplicado y que la base rechaza lo que debe. El modelo no se llama en ninguna prueba: en la
 * entrada breve no decide nada, y aquí se afirma que ni se le consulta.
 *
 * Las pantallas se pintan en el servidor con `renderToStaticMarkup` y la base falsa: eso prueba qué se dibuja
 * en cada estado, no que alguien las haya abierto en un navegador ni que los botones respondan al toque.
 *
 * Lo que NO prueba este archivo, para que nadie lo lea de más: PostgREST nunca se ejecuta (el filtro embebido
 * `interview_sessions!inner` con que se leen las respuestas anteriores lo imita el doble); el extractor no se
 * llama (se afirma qué fila y con qué pregunta se le encola, no qué devuelve el modelo); y «revisar lo que ya
 * existe» cubre ficha, números, lo que vende y conversaciones anteriores, no las afirmaciones sueltas que
 * salieron de un documento.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PGlite } from "@electric-sql/pglite";

type Fila = Record<string, unknown>;
type Operacion = "select" | "insert" | "update";

const h = vi.hoisted(() => {
  // Lo que la base pone sola al insertar, y las columnas que existen (schema.sql + migracion-entrada-y-direccion.sql).
  const DEFECTOS: Record<string, Fila> = {
    interview_sessions: { estado: "pendiente", plan: null, sintesis: null, sintesis_confirmada_at: null, bloques_cubiertos: [] },
    interview_responses: { bloque: null, pilar: null, origen_claim_id: null, respuesta: null, respuesta_audio_path: null, orden: null, respondido_at: null, certeza: null, sabida_por: null, clave_pregunta: null },
  };
  const COLUMNAS_REALES: Record<string, string[]> = {
    interview_sessions: ["id", "company_id", "participant_id", "tipo", "estado", "created_at", "bloques_cubiertos", "plan", "sintesis", "sintesis_confirmada_at"],
    interview_responses: ["id", "session_id", "bloque", "pilar", "pregunta", "origen_claim_id", "respuesta", "respuesta_audio_path", "orden", "created_at", "respondido_at", "certeza", "sabida_por", "clave_pregunta"],
  };
  const estado = {
    /** Lo que devuelve contextoPortal() en las pantallas pintadas: quién mira y qué empresa. */
    portal: { u: { id: "", rol: "cliente" as "cliente" | "consultor", email: null as string | null, nombre: null as string | null }, companyId: null as string | null },
    tablas: {} as Record<string, Fila[]>,
    escrituras: [] as { tabla: string; op: Operacion; datos: Fila }[],
    trabajos: [] as { tipo: string; company_id: string; payload: Fila }[],
    subidas: [] as string[],
    /** Lo que «escucha» el transcriptor falso en el audio guardado. */
    transcripcion: "",
    fallar: {} as Record<string, { op: Operacion; mensaje: string } | undefined>,
    seq: 0,
  };
  type Resultado = { data: Fila[] | null; error: { message: string } | null; count: number | null };

  /** `interview_sessions.company_id` sobre una respuesta se resuelve por su sesión, como el !inner de PostgREST. */
  const valor = (tabla: string, f: Fila, clave: string): unknown => {
    if (!clave.includes(".")) return f[clave];
    const [otra, col] = clave.split(".");
    if (tabla === "interview_responses" && otra === "interview_sessions") {
      return (estado.tablas.interview_sessions ?? []).find((s) => s.id === f.session_id)?.[col];
    }
    return undefined;
  };

  const consulta = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = [];
    let modo: Operacion = "select";
    let cuerpo: Fila = {};
    const insertadas: Fila[] = [];
    let errorPropio: string | null = null;
    let orden: { clave: string; asc: boolean } | null = null;
    let tope: number | null = null;
    let conSesion = false;
    let soloConteo = false;

    const desconocidas = (datos: Fila) => (COLUMNAS_REALES[tabla] ? Object.keys(datos).filter((k) => !COLUMNAS_REALES[tabla].includes(k)) : []);
    const filas = () => (estado.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
    const ejecutar = (): Resultado => {
      const fallo = estado.fallar[tabla];
      if (fallo && fallo.op === modo) return { data: null, error: { message: fallo.mensaje }, count: null };
      if (errorPropio) return { data: null, error: { message: errorPropio }, count: null };
      if (modo === "insert") return { data: insertadas, error: null, count: null };
      if (modo === "update") {
        const objetivo = filas();
        for (const f of objetivo) Object.assign(f, cuerpo);
        estado.escrituras.push({ tabla, op: "update", datos: { ...cuerpo, _ids: objetivo.map((f) => f.id) } });
        return { data: objetivo, error: null, count: null };
      }
      let d = filas();
      if (orden) {
        const { clave, asc } = orden;
        d = d.slice().sort((a, b) => (String(a[clave] ?? "") < String(b[clave] ?? "") ? -1 : String(a[clave] ?? "") > String(b[clave] ?? "") ? 1 : 0) * (asc ? 1 : -1));
        if (clave === "orden") d = d.slice().sort((a, b) => (Number(a.orden ?? 0) - Number(b.orden ?? 0)) * (asc ? 1 : -1));
      }
      if (tope !== null) d = d.slice(0, tope);
      if (conSesion) d = d.map((f) => ({ ...f, interview_sessions: (estado.tablas.interview_sessions ?? []).find((s) => s.id === f.session_id) ?? null }));
      return { data: soloConteo ? null : d, error: null, count: d.length };
    };

    const q = {
      select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
        conSesion = Boolean(cols?.includes("interview_sessions"));
        soloConteo = Boolean(opts?.head);
        return q;
      },
      eq: (k: string, v: unknown) => { filtros.push((f) => valor(tabla, f, k) === v); return q; },
      neq: (k: string, v: unknown) => { filtros.push((f) => valor(tabla, f, k) !== v); return q; },
      in: (k: string, vs: unknown[]) => { filtros.push((f) => vs.includes(valor(tabla, f, k))); return q; },
      is: (k: string, v: unknown) => { filtros.push((f) => (v === null ? valor(tabla, f, k) == null : valor(tabla, f, k) === v)); return q; },
      not: (k: string, _op: string, v: unknown) => { filtros.push((f) => (v === null ? valor(tabla, f, k) != null : valor(tabla, f, k) !== v)); return q; },
      contains: (k: string, v: Fila) => { filtros.push((f) => Object.entries(v).every(([a, b]) => (f[k] as Fila | undefined)?.[a] === b)); return q; },
      order: (clave: string, opts?: { ascending?: boolean }) => { orden = { clave, asc: opts?.ascending ?? true }; return q; },
      limit: (n: number) => { tope = n; return q; },
      update: (datos: Fila) => {
        modo = "update";
        cuerpo = datos;
        const malas = desconocidas(datos);
        if (malas.length) errorPropio = `Could not find the '${malas[0]}' column of '${tabla}'`;
        return q;
      },
      insert: (datos: Fila | Fila[]) => {
        modo = "insert";
        const fallo = estado.fallar[tabla];
        if (fallo && fallo.op === "insert") return q;
        for (const d of Array.isArray(datos) ? datos : [datos]) {
          const malas = desconocidas(d);
          if (malas.length) { errorPropio = `Could not find the '${malas[0]}' column of '${tabla}'`; return q; }
          estado.seq += 1;
          const fila = {
            id: `00000000-0000-4000-8000-${String(estado.seq).padStart(12, "0")}`,
            created_at: new Date(Date.UTC(2026, 9, 13, 12, 0, estado.seq)).toISOString(),
            ...(DEFECTOS[tabla] ?? {}),
            ...d,
          };
          (estado.tablas[tabla] ??= []).push(fila);
          insertadas.push(fila);
          estado.escrituras.push({ tabla, op: "insert", datos: fila });
        }
        return q;
      },
      maybeSingle: async () => { const r = ejecutar(); return { data: r.error ? null : (r.data?.[0] ?? null), error: r.error }; },
      single: async () => { const r = ejecutar(); const d = r.data?.[0] ?? null; return { data: d, error: r.error ?? (d ? null : { message: "no hay fila" }) }; },
      then: (res: (v: Resultado) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };

  const cliente = {
    from: consulta,
    storage: {
      from: () => ({
        upload: async (ruta: string) => { estado.subidas.push(ruta); return { data: { path: ruta }, error: null }; },
        download: async () => ({ data: new Blob(["audio"], { type: "audio/webm" }), error: null }),
      }),
    },
  };
  return { estado, cliente };
});

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => h.cliente }));
vi.mock("@/lib/jobs/queue", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/jobs/queue")>();
  return {
    ...real,
    encolar: async (j: { tipo: string; company_id: string; payload: Fila }) => {
      h.estado.trabajos.push({ tipo: j.tipo, company_id: j.company_id, payload: j.payload });
      return { id: `job-${h.estado.trabajos.length}`, duplicado: false };
    },
    progreso: async () => {},
  };
});
// El transcriptor: devuelve lo que la prueba le diga. Lo demás de @/lib/ai queda como es.
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  ai: () => ({ puedeTranscribir: () => true, transcribe: async () => ({ texto: h.estado.transcripcion }) }),
}));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => h.estado.portal }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), redirect: () => {} }));
// En la entrada breve el modelo no decide la siguiente pregunta. Si alguien lo llama, la prueba lo delata.
vi.mock("@/lib/ai/agents/entrevistador", () => ({
  correrEntrevistador: vi.fn(async () => {
    throw new Error("el entrevistador no debe llamarse en la entrada breve");
  }),
}));

import {
  PLAN_ENTRADA, CLAVES_PLAN, PLAN_POR_CLAVE, GRUPOS, COLUMNAS, CIERRES_CONFIRMACION, TEXTO_NO_LO_SE, TEXTO_CONFIRMA, TEXTO_DOCUMENTO, ROTULO_SINTESIS, ReglaEntrada,
  bloqueDelBanco, mismaPregunta, planDe, siguienteClave, progresoEntrada, preguntaAbiertaDe, coberturaEntrada, debeExtraer, esSoloNoLoSe, esSoloSi, esConfirmacion, montoDe,
  conocidoVacio, estadoDePregunta, preguntasPendientes, abrirSiguientePregunta, estadoEntrada, entradaDeUsuario, sesionEntradaDeEmpresa, filasDeSesion,
  armarSintesis, sintesis, fraseDe, afirmacionDe, tratoDeRespuesta, preguntaParaExtraer, mostradasDe, sintesisCompleta, personasDichas, anotarEnFicha,
  type Sb, type FilaEntrada, type Conocido,
} from "@/lib/entrada";
import { iniciarEntrada, responderEntrada, confirmarEntrada, registrarRespuesta, pedirSiguiente, estadoSesion, ENTRADA_POR_SU_PUERTA } from "@/lib/entrevista";
import { handleEntrevistaSiguiente, handleTranscribirRespuesta } from "@/lib/jobs/handlers/entrevista";
import { correrEntrevistador } from "@/lib/ai/agents/entrevistador";
import { accionDeEntrada, entradaDesde, RUTA_ENTRADA } from "@/lib/tablero";
import { BLOQUES, coberturaSesion } from "@/lib/rules/cobertura";
import { moneda, porDefecto } from "@/lib/formato";
import { EntradaBreve } from "@/components/cliente/EntradaBreve";
import { CrearEmpresa } from "@/components/cliente/CrearEmpresa";
import PaginaEntrada from "@/app/(cliente)/portal/entrada/page";
import { baseConEsquema } from "./sql/aplicar";

const sb = h.cliente as unknown as Sb;
const EMP = "0000000a-0000-4000-8000-00000000000a";
const OTRA = "0000000b-0000-4000-8000-00000000000b";
const DUENA = "11111111-1111-4111-8111-111111111111";
const EMPLEADO = "33333333-3333-4333-8333-333333333333";
const PART = "000000a1-0000-4000-8000-0000000000a1";
const EXCEL = "000000f1-0000-4000-8000-0000000000f1";
const PERFIL = { id: DUENA, nombre: "Rosa Mamani" };

/** Una empresa sintética recién creada: su dueña con cuenta, su participante y nada más. */
function sembrar(ficha: Record<string, string> = {}) {
  h.estado.tablas = {
    companies: [{ id: EMP, nombre: "Tienda de ropa (sintética)", ficha, pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" }],
    memberships: [
      { user_id: DUENA, company_id: EMP, nivel: "dueno" },
      { user_id: EMPLEADO, company_id: EMP, nivel: "participante" },
    ],
    participants: [{ id: PART, company_id: EMP, user_id: DUENA, nombre: "Rosa Mamani", rol: "dueno", created_at: "2026-10-13T11:00:00.000Z" }],
    interview_sessions: [],
    interview_responses: [],
    company_metricas: [],
    sources: [],
    lineas_producto: [],
    claims: [],
    jobs: [],
  };
  h.estado.escrituras = [];
  h.estado.trabajos = [];
  h.estado.subidas = [];
  h.estado.transcripcion = "";
  h.estado.fallar = {};
  h.estado.seq = 0;
}

const tabla = (nombre: string) => h.estado.tablas[nombre] ?? [];
const trabajosDe = (tipo: string) => h.estado.trabajos.filter((t) => t.tipo === tipo);
const sesionDe = async () => (await sesionEntradaDeEmpresa(EMP, sb))!;
const abierta = async () => (await estadoEntrada((await sesionDe()).id, sb)).abierta!;

/** Responde la pregunta abierta con texto y devuelve la clave que respondió. */
async function responder(texto: string, extra: { aproximado?: boolean } = {}): Promise<string> {
  const s = await sesionDe();
  const p = await abierta();
  await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", texto, ...extra });
  return p.clave;
}

/** Responde todo lo que falte, con un texto distinto por pregunta. */
async function responderTodo() {
  for (let i = 0; i < CLAVES_PLAN.length + 2; i++) {
    const e = await estadoEntrada((await sesionDe()).id, sb);
    if (!e.abierta) return;
    await responder(`Respuesta de la dueña a la pregunta ${e.abierta.n}, con sus palabras.`);
  }
}

async function rechazo(fn: () => Promise<unknown>): Promise<ReglaEntrada> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ReglaEntrada) return e;
    throw e;
  }
  throw new Error("se esperaba una regla incumplida y no hubo ninguna");
}

const fila = (extra: Partial<FilaEntrada>): FilaEntrada => ({ id: "f", clave_pregunta: null, pregunta: "", respuesta: null, certeza: null, sabida_por: null, orden: 1, respondido_at: null, ...extra });
const sinAcentos = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const SRC = path.resolve(__dirname, "../src");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

beforeEach(() => {
  sembrar();
  vi.mocked(correrEntrevistador).mockClear();
});

// ---------------------------------------------------------------------------------------------------------------

describe("el plan: entre 8 y 12 preguntas fijas, en cuatro grupos", () => {
  it("tiene entre 8 y 12 preguntas, con claves únicas que empiezan por «entrada.»", () => {
    expect(PLAN_ENTRADA.length).toBeGreaterThanOrEqual(8);
    expect(PLAN_ENTRADA.length).toBeLessThanOrEqual(12);
    expect(new Set(CLAVES_PLAN).size).toBe(PLAN_ENTRADA.length);
    for (const p of PLAN_ENTRADA) expect(p.clave).toMatch(/^entrada\.[a-z0-9_]+$/);
  });

  it("cubre los cuatro grupos que pidió Dirección, y el plan los recorre en orden a, b, c, d", () => {
    for (const g of ["a", "b", "c", "d"] as const) expect(PLAN_ENTRADA.filter((p) => p.grupo === g).length, `grupo ${g}`).toBeGreaterThanOrEqual(2);
    const recorrido = PLAN_ENTRADA.map((p) => p.grupo).join("");
    expect(recorrido).toBe([...recorrido].sort().join(""));
  });

  it("cubre los doce contenidos obligatorios, cada uno con su clave y en su grupo", () => {
    const OBLIGATORIOS: [string, string, "a" | "b" | "c" | "d", RegExp][] = [
      ["el negocio hoy", "entrada.negocio_hoy", "a", /tu negocio hoy/i],
      // Desde el 16-10-2026 cada contenido se pide en una sola cosa y por el episodio (revisión, sección 3a).
      ["qué vende", "entrada.que_vende_estrella", "a", /^¿Qué vendes\? Dime los nombres, uno por uno\.$/],
      ["ventas del mes pasado", "entrada.ventas_y_ganancia", "b", /^El mes pasado, ¿cuánto vendiste en total\?$/],
      ["principal problema", "entrada.principal_problema", "b", /principal problema/i],
      ["qué se queda esperando sin el dueño", "entrada.que_se_detiene_sin_mi", "b", /última vez que faltaste.*se quedó esperando/i],
      ["visión a tres años", "entrada.vision_3_anios", "c", /tres años/i],
      ["rol futuro", "entrada.rol_futuro", "c", /qué haces tú en el negocio/i],
      ["dinero para estar tranquilo", "entrada.dinero_tranquilo", "c", /para estar tranquilo/i],
      ["qué no sacrifica", "entrada.no_sacrifica", "c", /sacrificar/i],
      ["mejor resultado anterior", "entrada.mejor_resultado_anterior", "d", /mejor mes de toda la historia/i],
      ["qué funciona bien", "entrada.que_funciona", "d", /funciona especialmente bien/i],
      ["recursos desaprovechados", "entrada.recursos_desaprovechados", "d", /semana pasada.*no se usó/i],
    ];
    expect(OBLIGATORIOS.length).toBe(12);
    for (const [que, clave, grupo, dice] of OBLIGATORIOS) {
      const p = PLAN_POR_CLAVE.get(clave);
      expect(p, `falta «${que}» (${clave})`).toBeDefined();
      expect(p!.grupo, que).toBe(grupo);
      expect(p!.texto, que).toMatch(dice);
    }
    // Y no hay ninguna pregunta fuera de esas doce: el plan no creció a escondidas.
    expect([...CLAVES_PLAN].sort()).toEqual(OBLIGATORIOS.map((o) => o[1]).sort());
  });

  it("las ventas aceptan un «más o menos»; las preguntas de relato no lo ofrecen", () => {
    expect(PLAN_POR_CLAVE.get("entrada.ventas_y_ganancia")!.acepta_aproximado).toBe(true);
    // El «más o menos» lo ofrece la pantalla con su botón («Es aproximado»), no la pregunta: dentro de la
    // pregunta invitaba al promedio, y lo que se pide es el mes pasado.
    expect(PLAN_POR_CLAVE.get("entrada.ventas_y_ganancia")!.texto).not.toMatch(/más o menos/);
    expect(PLAN_ENTRADA.filter((p) => p.acepta_aproximado).map((p) => p.clave).sort()).toEqual(["entrada.dinero_tranquilo", "entrada.mejor_resultado_anterior", "entrada.ventas_y_ganancia"]);
  });

  // Lo que esto comprueba es que cada ítem lleva UN signo de pregunta. Desde el 16-10-2026 además pide un solo dato
  // («¿qué vendes, a quién y qué te deja más?» se volvió «¿Qué vendes?», y lo que más deja sale del precio y el
  // costo): lo vigila tests/preguntas-sin-eco.test.ts, junto con el resto de los bancos.
  it("cada ítem lleva un solo signo de pregunta, en tuteo y sin palabras de la metodología", () => {
    const JERGA = /pilar|claim|matriz|hallazgo|diagn[oó]stico|kpi|indicador|metodolog|levantamiento|\bIA\b/i;
    for (const p of PLAN_ENTRADA) {
      expect((p.texto.match(/\?/g) ?? []).length, `${p.clave} hace más de una pregunta`).toBe(1);
      expect((p.texto.match(/¿/g) ?? []).length, p.clave).toBe(1);
      expect(p.texto, `${p.clave} trata de usted`).not.toMatch(/\busted\b|\bsu negocio\b|\bcuénteme\b/i);
      expect(p.texto, `${p.clave} usa jerga`).not.toMatch(JERGA);
      expect(p.asunto, `${p.clave} usa jerga en el asunto`).not.toMatch(JERGA);
      expect(p.alimenta.length, `${p.clave} no dice qué llena`).toBeGreaterThan(10);
    }
    for (const nombre of Object.values(GRUPOS)) expect(nombre).not.toMatch(JERGA);
  });

  it("cada pregunta cita el bloque del banco que la contiene; ninguna repite literalmente otra del banco fuera de ese bloque", () => {
    const banco = Object.values(BLOQUES).flat();
    for (const p of PLAN_ENTRADA) {
      const bloque = bloqueDelBanco(p.bloque_banco);
      expect(bloque, `${p.clave} cita un bloque que no existe: ${p.bloque_banco}`).not.toBeNull();
      expect(p.equivale_a.length, `${p.clave} no dice a qué pregunta del banco equivale`).toBeGreaterThan(0);
      // Sus equivalentes están en el banco, literales, dentro del bloque que cita.
      for (const e of p.equivale_a) expect(bloque!.preguntas, `${p.clave}: «${e}» no está en el bloque ${p.bloque_banco}`).toContain(e);
      // Y si su texto coincide letra por letra con una pregunta del banco, es de ESE bloque.
      for (const b of banco) {
        if (b.preguntas.some((q) => sinAcentos(q) === sinAcentos(p.texto))) expect(b.clave, `${p.clave} copia una pregunta del bloque ${b.clave}`).toBe(p.bloque_banco);
      }
    }
  });

  it("el bloque nuevo (recursos) vive en su propio tipo de sesión: ninguna entrevista que ya existía pierde cobertura", () => {
    expect(BLOQUES.entrada_breve.map((b) => b.clave)).toEqual(["recursos"]);
    expect(BLOQUES.empresa_dueno.some((b) => b.clave === "recursos")).toBe(false);
    const todos = BLOQUES.empresa_dueno.map((b) => ({ bloque: b.clave }));
    expect(coberturaSesion("empresa_dueno", todos).porcentaje).toBe(100);
  });

  it("el plan guardado en la sesión manda; uno vacío o con claves inventadas cae al plan vigente", () => {
    expect(planDe(["entrada.negocio_hoy", "entrada.no_sacrifica"])).toEqual(["entrada.negocio_hoy", "entrada.no_sacrifica"]);
    expect(planDe(null)).toEqual(CLAVES_PLAN);
    expect(planDe(["inventada", 7])).toEqual(CLAVES_PLAN);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("el orden y el avance son del plan, no del modelo (puro)", () => {
  it("la siguiente clave es la primera del plan sin fila; con las doce, no hay siguiente", () => {
    expect(siguienteClave(CLAVES_PLAN, [])).toBe(CLAVES_PLAN[0]);
    expect(siguienteClave(CLAVES_PLAN, [{ clave_pregunta: CLAVES_PLAN[0] }, { clave_pregunta: CLAVES_PLAN[1] }])).toBe(CLAVES_PLAN[2]);
    expect(siguienteClave(CLAVES_PLAN, CLAVES_PLAN.map((c) => ({ clave_pregunta: c })))).toBeNull();
  });

  it("«n de 12» cuenta preguntas con respuesta: la abierta no cuenta y una corrección no suma dos", () => {
    const filas = [
      { clave_pregunta: CLAVES_PLAN[0], respuesta: "algo" },
      { clave_pregunta: CLAVES_PLAN[0], respuesta: "corregido" },
      { clave_pregunta: CLAVES_PLAN[1], respuesta: null },
    ];
    expect(progresoEntrada(CLAVES_PLAN, filas)).toEqual({ respondidas: 1, total: 12 });
  });

  it("la pregunta abierta es una sola: un duplicado de una clave ya respondida se ignora", () => {
    const filas = [
      fila({ id: "1", clave_pregunta: CLAVES_PLAN[0], respuesta: "ya respondí", orden: 1 }),
      fila({ id: "2", clave_pregunta: CLAVES_PLAN[0], respuesta: null, orden: 2 }),
      fila({ id: "3", clave_pregunta: CLAVES_PLAN[1], respuesta: null, orden: 3 }),
      fila({ id: "4", clave_pregunta: null, respuesta: null, orden: 0 }),
    ];
    expect(preguntaAbiertaDe(CLAVES_PLAN, filas)?.id).toBe("3");
    expect(preguntaAbiertaDe(CLAVES_PLAN, filas.slice(0, 2))).toBeNull();
  });

  it("la cobertura de la entrada son sus cuatro grupos y «respondidas de doce»", () => {
    const dosDeA = PLAN_ENTRADA.filter((p) => p.grupo === "a").map((p) => ({ clave_pregunta: p.clave, respuesta: "x" }));
    const c = coberturaEntrada(CLAVES_PLAN, dosDeA);
    expect(c.porcentaje).toBe(Math.round((dosDeA.length / 12) * 100));
    expect(c.areas.map((a) => a.nombre)).toEqual(Object.values(GRUPOS));
    expect(c.areas.map((a) => a.cubierta)).toEqual([true, false, false, false]);
  });

  it("dos preguntas son la misma si comparten sus palabras de peso; dos temas distintos no", () => {
    expect(mismaPregunta("¿Qué no estás dispuesto a sacrificar por crecer?", "¿Qué no estás dispuesto a sacrificar por hacer crecer el negocio?")).toBe(true);
    expect(mismaPregunta("¿Cuánto te deben tus clientes hoy?", "¿Qué parte del negocio funciona especialmente bien?")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("lo que ya sabíamos se confirma, no se vuelve a preguntar (regla pura)", () => {
  const VENTAS = PLAN_POR_CLAVE.get("entrada.ventas_y_ganancia")!;
  const conExcel = (extra: Partial<Conocido> = {}): Conocido =>
    conocidoVacio({ fuentes: new Map([[EXCEL, { nombre: "ventas-2026.xlsx", tipo: "dato", origen: "cliente" }]]), ...extra });
  const venta = (valor: number | null, extra: Fila = {}) => ({ clave: "venta_mes", periodo: "2026-09", valor, estado: "extraido", source_id: EXCEL, response_id: null, ...extra });

  it("sin nada sabido, las doce están pendientes con el texto del plan", () => {
    for (const p of PLAN_ENTRADA) expect(estadoDePregunta(p, conocidoVacio())).toEqual({ clave: p.clave, estado: "pendiente", texto: p.texto, sabida_por: null, basta_confirmar: false });
  });

  it("con venta y ganancia leídas de un Excel, se confirma con el archivo nombrado y basta un «sí»", () => {
    const c = conExcel({ metricas: [venta(80000), { ...venta(12000), clave: "ganancia_mes" }] });
    const e = estadoDePregunta(VENTAS, c);
    expect(e.estado).toBe("sabida");
    expect(e.sabida_por).toBe("tu archivo «ventas-2026.xlsx»");
    expect(e.texto).toBe(`Por tu archivo «ventas-2026.xlsx» entendimos que vendes unos ${moneda(80000, porDefecto)} al mes y que te quedan unos ${moneda(12000, porDefecto)}. ¿Es así?`);
    expect(e.basta_confirmar).toBe(true);
  });

  it("con la venta sabida y la ganancia no, la venta se confirma: lo que queda no se pide de memoria", () => {
    // Desde el 16-10-2026 lo que queda es una cuenta que hace 8X con las partes (revisión, sección 3a, pregunta 2).
    const e = estadoDePregunta(VENTAS, conExcel({ metricas: [venta(80000)] }));
    expect(e.estado).toBe("sabida");
    expect(e.texto).toBe(`Por tu archivo «ventas-2026.xlsx» entendimos que vendes unos ${moneda(80000, porDefecto)} al mes. ¿Es así?`);
    expect(e.texto).not.toMatch(/te queda/i);
    expect(e.basta_confirmar).toBe(true);
  });

  it("la falta de dato no es cero: un número sin valor, o un cero guardado, no se le lee al dueño como sabido", () => {
    expect(estadoDePregunta(VENTAS, conExcel({ metricas: [venta(0)] })).estado).toBe("pendiente");
    expect(estadoDePregunta(VENTAS, conExcel({ metricas: [venta(0)] })).texto).not.toMatch(/S\/ 0|vendes unos 0/);
  });

  it("el más reciente manda, la mejor época no se confunde con el mes normal, y cada fuente se nombra como es", () => {
    const c = conExcel({
      metricas: [
        venta(60000, { periodo: "2026-07" }),
        venta(80000, { periodo: "2026-09" }),
        venta(150000, { periodo: "epoca_dorada", source_id: null, response_id: "r1" }),
      ],
    });
    expect(estadoDePregunta(VENTAS, c).texto).toContain("S/ 80,000");
    const dorada = estadoDePregunta(PLAN_POR_CLAVE.get("entrada.mejor_resultado_anterior")!, c);
    expect(dorada.estado).toBe("sabida");
    expect(dorada.sabida_por).toBe("lo que ya nos contaste");
    expect(dorada.texto).toBe("Por lo que ya nos contaste sabemos que en tu mejor época vendías unos S/ 150,000 al mes. ¿Es así?");
    const delConsultor = conocidoVacio({ fuentes: new Map([[EXCEL, { nombre: "cierre.xlsx", tipo: "dato", origen: "consultor" }]]), metricas: [venta(80000)] });
    expect(estadoDePregunta(VENTAS, delConsultor).sabida_por).toBe("el archivo «cierre.xlsx» que cargó tu consultor");
    const aMano = conocidoVacio({ metricas: [venta(80000, { source_id: null })] });
    expect(estadoDePregunta(VENTAS, aMano).sabida_por).toBe("los números que registraste");
  });

  it("el monto sale en la moneda que la empresa declaró; una moneda mal puesta no tumba la pregunta", () => {
    const mx = { pais: "MX", moneda: "MXN", idioma: "es", zona_horaria: "America/Mexico_City" };
    expect(estadoDePregunta(VENTAS, conExcel({ config: mx, metricas: [venta(80000)] })).texto).toContain(moneda(80000, mx));
    expect(montoDe(80000, { ...porDefecto, moneda: "soles" })).toBe("80,000");
  });

  it("lo que se dijo al crear la empresa no se pide otra vez: completo se confirma, a medias se trae a la pregunta", () => {
    const NEGOCIO = PLAN_POR_CLAVE.get("entrada.negocio_hoy")!;
    const completa = estadoDePregunta(NEGOCIO, conocidoVacio({ ficha: { actividad: "ferretería", ciudad: "Arequipa", personas: "8" } }));
    expect(completa).toMatchObject({ estado: "sabida", sabida_por: "lo que escribiste al crear tu empresa", basta_confirmar: true });
    expect(completa.texto).toBe("Al crear tu empresa nos dijiste que tu negocio es ferretería, en Arequipa, con 8 personas. ¿Es así hoy?");
    // El registro de hoy pide solo nombre, rubro y ciudad: la primera pregunta no puede ser un «¿es así?» de lo recién escrito.
    const aMedias = estadoDePregunta(NEGOCIO, conocidoVacio({ ficha: { actividad: "ferretería", ciudad: "Arequipa" } }));
    expect(aMedias.estado).toBe("pendiente");
    expect(aMedias.texto).toContain("tu negocio es ferretería, en Arequipa");
    expect(aMedias.texto).toMatch(/con cuánta gente trabajas\?$/);
    expect(aMedias.texto, "no vuelve a pedir dónde").not.toMatch(/dónde/);
  });

  it("lo que vende, si ya salió de un documento, se trae a la pregunta con su archivo", () => {
    const VENDE = PLAN_POR_CLAVE.get("entrada.que_vende_estrella")!;
    const c = conExcel({ lineas: [{ nombre: "Polos", source_id: EXCEL }, { nombre: "Casacas", source_id: EXCEL }, { nombre: "Jeans", source_id: EXCEL }] });
    const e = estadoDePregunta(VENDE, c);
    // Es algo que ya sabíamos por otra fuente: va con su origen. Y un «sí» no responde cuál se vendió más.
    expect(e).toMatchObject({ estado: "sabida", sabida_por: "tu archivo «ventas-2026.xlsx»", basta_confirmar: false });
    expect(e.texto).toBe("Por tu archivo «ventas-2026.xlsx» vimos que vendes Polos, Casacas y Jeans. ¿Cuál de esos vendiste más veces el mes pasado?");
  });

  it("una respuesta anterior a la misma pregunta se confirma; un «no sé» anterior no cuenta como sabido", () => {
    const SACRIFICA = PLAN_POR_CLAVE.get("entrada.no_sacrifica")!;
    const previa = { id: "r1", pregunta: "¿Qué no estás dispuesto a sacrificar por crecer?", bloque: "proposito", certeza: null, tipo_sesion: "empresa_dueno" };
    const dijo = conocidoVacio({ respuestas: [{ ...previa, respuesta: "Los domingos con mis hijos, eso no lo negocio por nada del mundo." }] });
    const e = estadoDePregunta(SACRIFICA, dijo);
    expect(e).toMatchObject({ estado: "sabida", sabida_por: "una conversación anterior contigo", basta_confirmar: true });
    expect(e.texto).toBe("Antes nos contaste: «Los domingos con mis hijos, eso no lo negocio por nada del mundo.». ¿Sigue siendo así?");
    expect(estadoDePregunta(SACRIFICA, conocidoVacio({ respuestas: [{ ...previa, respuesta: "No sé" }] })).estado).toBe("pendiente");
    // Corta y sin afirmación confirmada: no alcanza. Corta pero con afirmación confirmada: sí.
    expect(estadoDePregunta(SACRIFICA, conocidoVacio({ respuestas: [{ ...previa, respuesta: "Mi familia" }] })).estado).toBe("pendiente");
    expect(estadoDePregunta(SACRIFICA, conocidoVacio({ respuestas: [{ ...previa, respuesta: "Mi familia" }], conClaim: new Set(["r1"]) })).estado).toBe("sabida");
  });

  it("toda confirmación o pregunta armada termina en UNA sola pregunta", () => {
    const c = conExcel({
      ficha: { actividad: "ferretería", ciudad: "Arequipa", personas: "8", productos: "herramientas" },
      metricas: [venta(80000), { ...venta(12000), clave: "ganancia_mes" }, venta(150000, { periodo: "epoca_dorada" })],
    });
    for (const p of PLAN_ENTRADA) {
      const e = estadoDePregunta(p, c);
      expect((e.texto.match(/\?/g) ?? []).length, `${p.clave}: «${e.texto}»`).toBe(1);
      if (e.estado === "sabida") expect(e.sabida_por, p.clave).toBeTruthy();
      expect(e.basta_confirmar).toBe(e.estado === "sabida" && esConfirmacion(e.texto));
    }
    for (const cierre of CIERRES_CONFIRMACION) expect(esConfirmacion(`Algo que entendimos. ${cierre}`)).toBe(true);
    expect(esConfirmacion("¿Cuánto de eso te queda después de pagar todo?")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("preguntasPendientes revisa la base antes de preguntar (con dobles)", () => {
  const ventas = (lista: Awaited<ReturnType<typeof preguntasPendientes>>) => lista.find((e) => e.clave === "entrada.ventas_y_ganancia")!;

  it("sin métrica venta_mes, la venta está pendiente", async () => {
    const lista = await preguntasPendientes(EMP, sb);
    expect(lista.map((e) => e.clave)).toEqual(CLAVES_PLAN);
    expect(ventas(lista)).toMatchObject({ estado: "pendiente", sabida_por: null });
  });

  it("con una métrica venta_mes con valor, la venta está sabida y dice de dónde", async () => {
    tabla("sources").push({ id: EXCEL, company_id: EMP, nombre: "ventas-2026.xlsx", tipo: "dato", origen: "cliente", created_at: "2026-10-12T10:00:00.000Z" });
    tabla("company_metricas").push({ company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 80000, estado: "extraido", source_id: EXCEL, response_id: null });
    const v = ventas(await preguntasPendientes(EMP, sb));
    expect(v.estado).toBe("sabida");
    expect(v.sabida_por).toBe("tu archivo «ventas-2026.xlsx»");
    expect(v.texto).toContain("Por tu archivo «ventas-2026.xlsx» entendimos que vendes unos S/ 80,000 al mes");
  });

  it("una métrica sin valor («sin dato») no la vuelve sabida, y la de otra empresa tampoco", async () => {
    tabla("company_metricas").push({ company_id: EMP, clave: "venta_mes", periodo: "actual", valor: null, estado: "sin_dato", source_id: null, response_id: null });
    tabla("company_metricas").push({ company_id: OTRA, clave: "venta_mes", periodo: "2026-09", valor: 99000, estado: "contado", source_id: null, response_id: null });
    expect(ventas(await preguntasPendientes(EMP, sb)).estado).toBe("pendiente");
  });

  it("lo respondido en otra conversación cuenta; lo respondido en la propia entrada no se cita como «antes»", async () => {
    tabla("interview_sessions").push({ id: "ses-vieja", company_id: EMP, participant_id: PART, tipo: "empresa_dueno", estado: "en_curso" });
    tabla("interview_sessions").push({ id: "ses-entrada", company_id: EMP, participant_id: PART, tipo: "entrada_breve", estado: "en_curso", plan: CLAVES_PLAN });
    const larga = "Funciona muy bien la atención en el mostrador: la gente vuelve por Carmen.";
    tabla("interview_responses").push({ id: "r-vieja", session_id: "ses-vieja", pregunta: "¿Qué parte del negocio funciona especialmente bien?", respuesta: larga, bloque: "hoy", certeza: null });
    tabla("interview_responses").push({ id: "r-entrada", session_id: "ses-entrada", pregunta: PLAN_POR_CLAVE.get("entrada.principal_problema")!.texto, respuesta: "Que no alcanza la plata a fin de mes, eso me quita el sueño.", bloque: "hoy", certeza: "exacta", clave_pregunta: "entrada.principal_problema" });
    const lista = await preguntasPendientes(EMP, sb);
    expect(lista.find((e) => e.clave === "entrada.que_funciona")).toMatchObject({ estado: "sabida", sabida_por: "una conversación anterior contigo" });
    expect(lista.find((e) => e.clave === "entrada.principal_problema")!.estado).toBe("pendiente");
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("la sesión: se crea al empezar, una por empresa, con el plan y la dueña (con dobles)", () => {
  it("empezar crea una sesión entrada_breve con plan = claves del plan y el participante de la dueña, y abre la primera pregunta", async () => {
    const sesion = await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    expect(tabla("interview_sessions")).toHaveLength(1);
    expect(tabla("interview_sessions")[0]).toMatchObject({ company_id: EMP, participant_id: PART, tipo: "entrada_breve", plan: CLAVES_PLAN, estado: "en_curso" });
    const filas = await filasDeSesion(sesion.id, sb);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ clave_pregunta: CLAVES_PLAN[0], pregunta: PLAN_ENTRADA[0].texto, bloque: PLAN_ENTRADA[0].bloque_banco, respuesta: null, orden: 1 });
  });

  it("empezar dos veces no crea dos sesiones ni dos preguntas", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    expect(tabla("interview_sessions")).toHaveLength(1);
    expect(tabla("interview_responses")).toHaveLength(1);
    expect(tabla("participants"), "no duplica a la dueña").toHaveLength(1);
  });

  it("abrir la siguiente pregunta no encola nada ni llama al modelo: la decide el plan en la misma petición", async () => {
    const sesion = await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    const r = await pedirSiguiente(sesion.id, EMP);
    expect(r).toMatchObject({ plan: true, duplicado: true, cerrada: false });
    expect(trabajosDe("entrevista_siguiente")).toEqual([]);
    expect(correrEntrevistador).not.toHaveBeenCalled();
  });

  it("si la pregunta no se puede abrir, se dice; y si otra petición la abrió en el mismo instante, se usa esa y no se duplica", async () => {
    const sesion = await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("Vendo ropa en Gamarra, somos cuatro.");
    // Se quita la segunda pregunta para volver a pedirla con la inserción fallando.
    h.estado.tablas.interview_responses = tabla("interview_responses").filter((f) => f.respuesta !== null);
    h.estado.fallar.interview_responses = { op: "insert", mensaje: "duplicate key value violates unique constraint" };
    await expect(abrirSiguientePregunta(sesion.id, sb)).rejects.toThrow(/No se pudo abrir la siguiente pregunta.*duplicate key/);
    // Ahora la otra petición sí llegó a insertarla: la nuestra falla al insertar, la encuentra y devuelve esa.
    h.estado.fallar = {};
    const deLaOtra = (await abrirSiguientePregunta(sesion.id, sb)).abierta!;
    h.estado.fallar.interview_responses = { op: "insert", mensaje: "duplicate key value violates unique constraint" };
    const r = await abrirSiguientePregunta(sesion.id, sb);
    expect(r).toMatchObject({ cerrada: false, motivo: "ya hay pregunta abierta" });
    expect(r.abierta?.id).toBe(deLaOtra.id);
    expect(tabla("interview_responses")).toHaveLength(2);
  });

  it("si la base no tiene las columnas de la entrada, se dice con la migración que falta; no se crea otra sesión encima", async () => {
    h.estado.fallar.interview_sessions = { op: "select", mensaje: "column interview_sessions.plan does not exist" };
    await expect(iniciarEntrada({ company_id: EMP, perfil: PERFIL })).rejects.toThrow(/migracion-entrada-y-direccion\.sql/);
    expect(tabla("interview_sessions")).toEqual([]);
  });

  it("quién puede responder: la dueña sí; el consultor mira; quien no es dueño, tampoco responde", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    expect(await entradaDeUsuario(EMP, { id: DUENA, rol: "cliente" }, sb)).toMatchObject({ puedeResponder: true, motivoSoloLectura: null });
    const consultor = await entradaDeUsuario(EMP, { id: "22222222-2222-4222-8222-222222222222", rol: "consultor" }, sb);
    expect(consultor.puedeResponder).toBe(false);
    expect(consultor.estado.abierta?.clave, "el consultor ve por dónde va").toBe(CLAVES_PLAN[0]);
    const empleado = await entradaDeUsuario(EMP, { id: EMPLEADO, rol: "cliente" }, sb);
    expect(empleado).toMatchObject({ puedeResponder: false, motivoSoloLectura: "Estas preguntas las responde el dueño o la dueña de la empresa." });
    // Leer el estado no escribe nada: ni enlaza participantes ni crea sesiones.
    const antes = h.estado.escrituras.length;
    await entradaDeUsuario(OTRA, { id: DUENA, rol: "cliente" }, sb);
    expect(h.estado.escrituras.length).toBe(antes);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("responder: una a la vez, en el orden del plan, y se puede retomar (con dobles)", () => {
  beforeEach(async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
  });

  it("cada respuesta guarda su certeza y su clave, va al extractor, y abre la que sigue en el plan", async () => {
    const s = await sesionDe();
    const primera = await abierta();
    expect(primera).toMatchObject({ n: 1, clave: CLAVES_PLAN[0], grupo: "a", sabida_por: null, basta_confirmar: false });
    await responder("Vendo ropa en Gamarra, somos cuatro.");
    const filas = await filasDeSesion(s.id, sb);
    expect(filas[0]).toMatchObject({ clave_pregunta: CLAVES_PLAN[0], respuesta: "Vendo ropa en Gamarra, somos cuatro.", certeza: "exacta" });
    expect(filas[0].respondido_at).toBeTruthy();
    expect(trabajosDe("extraer")).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: filas[0].id } }]);
    expect(trabajosDe("entrevista_siguiente"), "la siguiente no pasa por la cola").toEqual([]);
    expect(filas[1]).toMatchObject({ clave_pregunta: CLAVES_PLAN[1], respuesta: null, orden: 2 });
    expect((await estadoEntrada(s.id, sb)).progreso).toEqual({ respondidas: 1, total: 12 });
  });

  it("«Es aproximado» guarda la respuesta como aproximada, y también se extrae", async () => {
    await responder("uno");
    await responder("dos");
    const clave = await responder("Como 40 mil, más o menos", { aproximado: true });
    expect(clave).toBe("entrada.ventas_y_ganancia");
    const f = tabla("interview_responses").find((x) => x.clave_pregunta === clave)!;
    expect(f.certeza).toBe("aproximada");
    expect(trabajosDe("extraer").map((t) => t.payload.response_id)).toContain(f.id);
  });

  it("las doce se sirven en el orden exacto del plan, y con las doce la sesión queda completa con su síntesis", async () => {
    const servidas: string[] = [];
    for (let i = 0; i < 12; i++) {
      const p = await abierta();
      expect(p.n).toBe(i + 1);
      servidas.push(p.clave);
      await responder(`Respuesta número ${i + 1} de la dueña.`);
    }
    expect(servidas).toEqual(CLAVES_PLAN);
    const s = await sesionDe();
    expect(s.estado).toBe("completa");
    expect(s.sintesis_confirmada_at).toBeNull();
    const e = await estadoEntrada(s.id, sb);
    expect(e.abierta).toBeNull();
    expect(e.progreso).toEqual({ respondidas: 12, total: 12 });
    expect(e.sintesis!.grupos.flatMap((g) => g.frases).map((f) => f.clave)).toEqual(CLAVES_PLAN);
    expect(tabla("interview_responses"), "ni una pregunta de más").toHaveLength(12);
    expect(correrEntrevistador).not.toHaveBeenCalled();
  });

  it("se puede cerrar a medias y retomar: al volver, la pregunta abierta es la sexta y lo respondido sigue ahí", async () => {
    for (let i = 0; i < 5; i++) await responder(`Respuesta ${i + 1}.`);
    // «Volver otro día» es leer el estado de nuevo desde la base: no hay nada en memoria que retomar.
    const vista = await entradaDeUsuario(EMP, { id: DUENA, rol: "cliente" }, sb);
    expect(vista.estado.sesion?.estado).toBe("en_curso");
    expect(vista.estado.progreso).toEqual({ respondidas: 5, total: 12 });
    expect(vista.estado.abierta).toMatchObject({ n: 6, clave: CLAVES_PLAN[5] });
    expect(vista.estado.sintesis, "a medias no hay síntesis todavía").toBeNull();
    // Y «empezar» otra vez no reinicia nada.
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    expect((await abierta()).n).toBe(6);
    expect(tabla("interview_responses")).toHaveLength(6);
  });

  it("solo se responde la pregunta abierta, y una sola vez", async () => {
    const s = await sesionDe();
    const primera = await abierta();
    await responder("Primera respuesta.");
    const repetida = await rechazo(() => responderEntrada({ session_id: s.id, company_id: EMP, response_id: primera.id, modo: "texto", texto: "Otra cosa" }));
    expect(repetida.status).toBe(409);
    expect(repetida.message).toMatch(/ya tiene respuesta/);
    const ajena = await rechazo(() => responderEntrada({ session_id: s.id, company_id: EMP, response_id: "no-existe", modo: "texto", texto: "x" }));
    expect(ajena.status).toBe(404);
    const vacia = await rechazo(async () => responderEntrada({ session_id: s.id, company_id: EMP, response_id: (await abierta()).id, modo: "texto", texto: "   " }));
    expect(vacia.message).toMatch(/No lo sé/);
    expect(tabla("interview_responses").find((f) => f.id === primera.id)!.respuesta).toBe("Primera respuesta.");
  });

  it("si la respuesta no se pudo guardar, falla con mensaje y no se encola nada ni se avanza", async () => {
    const s = await sesionDe();
    const p = await abierta();
    h.estado.fallar.interview_responses = { op: "update", mensaje: "conexión perdida" };
    await expect(responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", texto: "Mi respuesta" })).rejects.toThrow("No pudimos guardar tu respuesta. Intenta de nuevo.");
    h.estado.fallar = {};
    expect(trabajosDe("extraer")).toEqual([]);
    expect((await abierta()).id).toBe(p.id);
  });

  it("la pantalla general de conversación mide la entrada por su plan, no por bloques del banco", async () => {
    for (let i = 0; i < 5; i++) await responder(`Respuesta ${i + 1}.`);
    const e = await estadoSesion((await sesionDe()).id);
    expect(e.cobertura?.porcentaje).toBe(42);
    expect(e.cobertura?.areas.map((a) => a.cubierta)).toEqual([true, true, false, false]);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("«no lo sé» es una respuesta completa y no produce ningún número (con dobles)", () => {
  beforeEach(async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("uno");
    await responder("dos");
  });

  it("la regla pura: un «no lo sé» nunca se extrae, aunque alguien lo pida", () => {
    expect(debeExtraer("no_lo_se")).toBe(false);
    expect(debeExtraer("no_lo_se", true)).toBe(false);
    expect(debeExtraer("exacta")).toBe(true);
    expect(debeExtraer("aproximada")).toBe(true);
    expect(debeExtraer("exacta", false)).toBe(false);
    expect(debeExtraer(undefined)).toBe(true);
  });

  it("el botón «No lo sé» en la pregunta de ventas: respuesta con certeza no_lo_se, ninguna métrica y ningún cero", async () => {
    const s = await sesionDe();
    const p = await abierta();
    expect(p.clave).toBe("entrada.ventas_y_ganancia");
    const extraccionesAntes = trabajosDe("extraer").length;
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "no_lo_se" });

    const f = tabla("interview_responses").find((x) => x.id === p.id)!;
    expect(f).toMatchObject({ respuesta: TEXTO_NO_LO_SE, certeza: "no_lo_se" });
    expect(String(f.respuesta), "la respuesta guardada no trae ningún número").not.toMatch(/\d/);
    // Nada fue al extractor por esta respuesta: el modelo no tiene de dónde inventar un cero.
    expect(trabajosDe("extraer")).toHaveLength(extraccionesAntes);
    expect(trabajosDe("extraer").some((t) => t.payload.response_id === p.id)).toBe(false);
    // Y nadie escribió en los números de la empresa: ni una fila, ni un cero, ni un «sin dato».
    expect(tabla("company_metricas")).toEqual([]);
    expect(h.estado.escrituras.filter((e) => e.tabla === "company_metricas")).toEqual([]);
    // La entrada sigue: se abrió la siguiente pregunta.
    expect((await abierta()).clave).toBe(CLAVES_PLAN[3]);
    // Y la venta sigue sin saberse: mañana se puede volver a preguntar.
    expect((await preguntasPendientes(EMP, sb)).find((e) => e.clave === "entrada.ventas_y_ganancia")!.estado).toBe("pendiente");
  });

  it("escribir solo «no sé» vale lo mismo que el botón; «no sé, serán unos 40 mil» es una respuesta con dato", async () => {
    expect(esSoloNoLoSe("no sé")).toBe(true);
    expect(esSoloNoLoSe("  No lo sé.  ")).toBe(true);
    expect(esSoloNoLoSe("No se")).toBe(true);
    expect(esSoloNoLoSe("No sé, serán unos 40 mil")).toBe(false);
    expect(esSoloNoLoSe("No sé cuánto, pero el local es propio")).toBe(false);
    // Dicho como se dice hablando, y como lo devuelve un transcriptor: con comas, muletillas y un «todavía».
    for (const dicho of ["No, no lo sé.", "La verdad, no lo sé", "Mmm… no sé todavía", "Ni idea", "No tengo idea, la verdad", "Eso no lo sé", "No sabría decirte"]) expect(esSoloNoLoSe(dicho), dicho).toBe(true);
    for (const dicho of ["No lo sé con exactitud, pero unos 30 mil", "No", "No vendo a crédito", "Sé que son como 40 mil"]) expect(esSoloNoLoSe(dicho), dicho).toBe(false);

    const p = await abierta();
    const antes = trabajosDe("extraer").length;
    await responder("no sé");
    expect(tabla("interview_responses").find((x) => x.id === p.id)).toMatchObject({ respuesta: TEXTO_NO_LO_SE, certeza: "no_lo_se" });
    expect(trabajosDe("extraer")).toHaveLength(antes);

    const q = await abierta();
    await responder("No sé, serán unos 40 mil");
    expect(tabla("interview_responses").find((x) => x.id === q.id)).toMatchObject({ respuesta: "No sé, serán unos 40 mil", certeza: "exacta" });
    expect(trabajosDe("extraer").some((t) => t.payload.response_id === q.id)).toBe(true);
  });

  it("en la síntesis, el «no lo sé» se dice como tal, con su fuente, y sin número en su lugar", async () => {
    const s = await sesionDe();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: (await abierta()).id, modo: "no_lo_se" });
    const frase = armarSintesis(await filasDeSesion(s.id, sb)).grupos.flatMap((g) => g.frases).find((f) => f.clave === "entrada.ventas_y_ganancia")!;
    expect(frase.certeza).toBe("no_lo_se");
    expect(frase.texto).toBe("Dijiste que todavía no lo sabes: cuánto vendiste el mes pasado.");
    expect(frase.texto).not.toMatch(/\d/);
    expect(frase.fuente).toBe("Lo dijiste tú en la entrada (pregunta 3). No pusimos ningún número en su lugar.");
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("confirmar lo sabido y responder con un documento (con dobles)", () => {
  /** La empresa ya subió su Excel y de ahí salieron la venta y la ganancia. */
  async function conExcelLeido(conGanancia = true) {
    tabla("sources").push({ id: EXCEL, company_id: EMP, nombre: "ventas-2026.xlsx", tipo: "dato", origen: "cliente", created_at: "2026-10-12T10:00:00.000Z" });
    tabla("company_metricas").push({ company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 80000, estado: "extraido", origen: "extraido", source_id: EXCEL, response_id: null });
    if (conGanancia) tabla("company_metricas").push({ company_id: EMP, clave: "ganancia_mes", periodo: "2026-09", valor: 12000, estado: "extraido", origen: "extraido", source_id: EXCEL, response_id: null });
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("uno");
    await responder("dos");
  }

  it("la pregunta de ventas llega como confirmación con el archivo nombrado, y «Sí, es así» no crea otro número encima", async () => {
    await conExcelLeido();
    const s = await sesionDe();
    const p = await abierta();
    expect(p).toMatchObject({ clave: "entrada.ventas_y_ganancia", sabida_por: "tu archivo «ventas-2026.xlsx»", basta_confirmar: true });
    expect(p.pregunta).toBe("Por tu archivo «ventas-2026.xlsx» entendimos que vendes unos S/ 80,000 al mes y que te quedan unos S/ 12,000. ¿Es así?");
    const metricasAntes = JSON.stringify(tabla("company_metricas"));
    const extraccionesAntes = trabajosDe("extraer").length;
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "confirma" });

    expect(tabla("interview_responses").find((x) => x.id === p.id)).toMatchObject({ respuesta: TEXTO_CONFIRMA, certeza: "exacta", sabida_por: "tu archivo «ventas-2026.xlsx»" });
    expect(trabajosDe("extraer"), "una confirmación no va al extractor").toHaveLength(extraccionesAntes);
    expect(JSON.stringify(tabla("company_metricas")), "el número sigue siendo el del Excel, con su origen").toBe(metricasAntes);
    const frase = armarSintesis(await filasDeSesion(s.id, sb)).grupos.flatMap((g) => g.frases).find((f) => f.clave === p.clave)!;
    expect(frase.texto).toBe("Por tu archivo «ventas-2026.xlsx» entendimos que vendes unos S/ 80,000 al mes y que te quedan unos S/ 12,000.");
    expect(frase.fuente).toBe("Tu archivo «ventas-2026.xlsx», confirmado por ti en la entrada (pregunta 3).");
  });

  it("si no es así, la dueña lo dice con sus palabras y eso sí va al extractor", async () => {
    await conExcelLeido();
    const p = await abierta();
    const mostrada = p.pregunta;
    expect(mostrada).toContain("S/ 80,000");
    await responder("No, ese Excel es del año pasado. Ahora vendo como 60 mil.");
    const guardada = tabla("interview_responses").find((x) => x.id === p.id)!;
    expect(guardada).toMatchObject({ certeza: "exacta", sabida_por: "tu archivo «ventas-2026.xlsx»" });
    expect(trabajosDe("extraer").some((t) => t.payload.response_id === p.id)).toBe(true);
    // Lo que lee el extractor es PREGUNTA + RESPUESTA de esa fila (handlers/extraer.ts). La pregunta que quedó
    // es la del plan: las cifras del Excel no viajan al lado de las palabras de la dueña.
    expect(guardada.pregunta).toBe(PLAN_POR_CLAVE.get(p.clave)!.texto);
    expect(`${guardada.pregunta} ${guardada.respuesta}`).not.toMatch(/80,000|12,000|ventas-2026/);
    // Y lo que se le mostró no se pierde: queda en la sesión para la síntesis.
    expect(mostradasDe((await sesionDe()).sintesis)).toEqual({ [p.clave]: mostrada });
    expect(sintesisCompleta((await sesionDe()).sintesis), "antes de cerrar todavía no hay frases").toBeNull();
    const frase = fraseDe(PLAN_POR_CLAVE.get(p.clave)!, (await filasDeSesion((await sesionDe()).id, sb)).find((f) => f.id === p.id)!, 3);
    expect(frase.fuente).toBe("Tus palabras en la entrada (pregunta 3), al revisar lo que entendimos por tu archivo «ventas-2026.xlsx».");
  });

  it("si a lo sabido le falta una parte, un «sí» no basta: se rechaza y hay que responder lo que falta", async () => {
    // Lo que vende ya salió del Excel; falta cuál se vendió más. Desde el 16-10-2026 la venta sola se confirma (lo
    // que queda lo calcula 8X), así que el caso «sabido a medias» es este.
    tabla("sources").push({ id: EXCEL, company_id: EMP, nombre: "ventas-2026.xlsx", tipo: "dato", origen: "cliente", created_at: "2026-10-12T10:00:00.000Z" });
    for (const nombre of ["Polos", "Casacas"]) tabla("lineas_producto").push({ company_id: EMP, nombre, source_id: EXCEL, created_at: "2026-10-12T10:00:00.000Z" });
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("uno");
    const s = await sesionDe();
    const p = await abierta();
    expect(p.clave).toBe("entrada.que_vende_estrella");
    expect(p.basta_confirmar).toBe(false);
    expect(p.pregunta).toMatch(/¿Cuál de esos vendiste más veces el mes pasado\?$/);
    const r = await rechazo(() => responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "confirma" }));
    expect(r.message).toBe("Esta pregunta necesita tu respuesta con palabras.");
    await responder("Los polos, de lejos");
    // En la fila, junto a sus palabras, queda la pregunta del plan: lo leído del Excel no va al extractor.
    const guardada = tabla("interview_responses").find((x) => x.id === p.id)!;
    expect(guardada.pregunta).toBe(PLAN_POR_CLAVE.get(p.clave)!.texto);
    expect(String(guardada.pregunta)).not.toContain("ventas-2026");
    const frase = (await sintesis(s.id, sb)).grupos.flatMap((g) => g.frases).find((f) => f.clave === p.clave)!;
    expect(frase.texto).toBe("Por tu archivo «ventas-2026.xlsx» vimos que vendes Polos y Casacas. Sobre lo que faltaba dijiste: «Los polos, de lejos»");
    expect(frase.fuente).toBe("Tu archivo «ventas-2026.xlsx» y tus palabras en la entrada (pregunta 2).");
    // Si lo mostrado se hubiera perdido, la frase no lo reconstruye ni lo inventa: cita la fuente y sus palabras.
    const sinLoMostrado = armarSintesis(await filasDeSesion(s.id, sb)).grupos.flatMap((g) => g.frases).find((f) => f.clave === p.clave)!;
    expect(sinLoMostrado.texto).toBe("«Los polos, de lejos»");
    expect(sinLoMostrado.fuente).toBe("Tus palabras en la entrada (pregunta 2), al revisar lo que entendimos por tu archivo «ventas-2026.xlsx».");
  });

  it("una pregunta que no era confirmación no acepta un «sí» colado", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    const s = await sesionDe();
    const r = await rechazo(async () => responderEntrada({ session_id: s.id, company_id: EMP, response_id: (await abierta()).id, modo: "confirma" }));
    expect(r.status).toBe(400);
    expect(tabla("interview_responses")[0].respuesta).toBeNull();
  });

  it("«subir un documento en vez de responder»: sin archivo subido no se acepta; con archivo, queda dicho cuál y no se da nada por sabido", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    const s = await sesionDe();
    const p = await abierta();
    const sinArchivo = await rechazo(() => responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "documento" }));
    expect(sinArchivo.status).toBe(409);
    expect(sinArchivo.message).toMatch(/Todavía no vemos ningún archivo tuyo/);
    expect(tabla("interview_responses")[0].respuesta).toBeNull();

    // Una fuente de tipo entrevista no es un archivo suyo; una del consultor, tampoco.
    tabla("sources").push({ id: "s-ent", company_id: EMP, nombre: "Entrevista · Dueño", tipo: "entrevista", origen: "cliente", created_at: "2026-10-13T12:10:00.000Z" });
    tabla("sources").push({ id: "s-con", company_id: EMP, nombre: "nota-de-campo.docx", tipo: "documento", origen: "consultor", created_at: "2026-10-13T12:11:00.000Z" });
    await rechazo(() => responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "documento" }));

    // Un archivo suyo que ya estaba ANTES de abrirse la pregunta (un PDF del año pasado) no la responde.
    tabla("sources").push({ id: "s-antiguo", company_id: EMP, nombre: "balance-2025.pdf", tipo: "documento", origen: "cliente", created_at: "2025-03-02T09:00:00.000Z" });
    expect(Date.parse(String(tabla("interview_responses")[0].created_at))).toBeGreaterThan(Date.parse("2025-03-02T09:00:00.000Z"));
    const viejo = await rechazo(() => responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "documento" }));
    expect(viejo.status).toBe(409);
    expect(viejo.message).toMatch(/subido para esta pregunta/);
    expect(tabla("interview_responses")[0], "la pregunta sigue abierta, sin fuente apuntada").toMatchObject({ respuesta: null, sabida_por: null });

    tabla("sources").push({ id: "s-viejo", company_id: EMP, nombre: "precios-2025.pdf", tipo: "documento", origen: "cliente", created_at: "2026-10-13T12:12:00.000Z" });
    tabla("sources").push({ id: "s-nuevo", company_id: EMP, nombre: "mi-negocio.docx", tipo: "documento", origen: "cliente", created_at: "2026-10-13T12:20:00.000Z" });
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "documento" });
    const f = tabla("interview_responses").find((x) => x.id === p.id)!;
    expect(f).toMatchObject({ respuesta: TEXTO_DOCUMENTO, sabida_por: "tu archivo «mi-negocio.docx»", certeza: null });
    expect(trabajosDe("extraer"), "el documento se lee por su propio camino, no como respuesta").toEqual([]);
    const frase = armarSintesis(await filasDeSesion(s.id, sb)).grupos.flatMap((g) => g.frases)[0];
    expect(frase.texto).toBe("Lo respondes con tu archivo «mi-negocio.docx».");
    expect(frase.fuente).toMatch(/^Tu archivo «mi-negocio\.docx»: lo leemos y te mostramos lo que saquemos/);
    expect(frase.fuente).toContain("no damos nada por sabido");
    expect((await abierta()).n, "y la entrada sigue").toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("responder hablando: el audio se guarda y la siguiente pregunta la abre el plan en el worker (con dobles)", () => {
  beforeEach(async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
  });

  it("un audio sin texto queda guardado con su certeza y en espera: no se abre la siguiente hasta tener el texto", async () => {
    const s = await sesionDe();
    const p = await abierta();
    const r = await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", audio: new Blob(["audio de la dueña"]), mime: "audio/webm", aproximado: true });
    expect(r.modo).toBe("audio");
    expect(h.estado.subidas).toEqual([`${EMP}/respuestas/${p.id}.webm`]);
    expect(tabla("interview_responses")[0]).toMatchObject({ respuesta: null, respuesta_audio_path: `${EMP}/respuestas/${p.id}.webm`, certeza: "aproximada" });
    expect(trabajosDe("transcribir_respuesta")).toEqual([{ tipo: "transcribir_respuesta", company_id: EMP, payload: { response_id: p.id } }]);
    expect(tabla("interview_responses")).toHaveLength(1);
    const e = await estadoEntrada(s.id, sb);
    expect(e.pendienteTranscripcion).toBe(true);
    expect(e.progreso.respondidas).toBe(0);
  });

  it("cuando el worker tiene el texto, la rama entrada_breve abre la que sigue del plan sin consultar al modelo", async () => {
    const s = await sesionDe();
    const p = await abierta();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", audio: new Blob(["audio"]), mime: "audio/webm" });
    // Lo que hace handleTranscribirRespuesta al terminar: pone el texto y encola «entrevista_siguiente».
    Object.assign(tabla("interview_responses")[0], { respuesta: "Vendo ropa en Gamarra, somos cuatro.", respondido_at: "2026-10-13T12:05:00.000Z" });
    const r = await handleEntrevistaSiguiente({ id: "job-1", company_id: EMP, payload: { session_id: s.id } });
    expect(r).toMatchObject({ generadas: 1, origen: "plan", cerrada: false });
    expect((await abierta()).clave).toBe(CLAVES_PLAN[1]);
    expect(correrEntrevistador).not.toHaveBeenCalled();
    // Repetir el trabajo no abre otra: ya hay una abierta.
    const otra = await handleEntrevistaSiguiente({ id: "job-2", company_id: EMP, payload: { session_id: s.id } });
    expect(otra).toMatchObject({ generadas: 0, motivo: "ya hay pregunta abierta" });
    expect(tabla("interview_responses")).toHaveLength(2);
  });

  it("un audio que solo dice «no lo sé» queda como el botón: certeza no_lo_se, nada al extractor, y la entrada sigue", async () => {
    const s = await sesionDe();
    const p = await abierta();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", audio: new Blob(["audio"]), mime: "audio/webm" });
    h.estado.trabajos = [];
    h.estado.transcripcion = "No lo sé.";
    await handleTranscribirRespuesta({ id: "job-t", company_id: EMP, payload: { response_id: p.id } });
    expect(tabla("interview_responses")[0]).toMatchObject({ respuesta: TEXTO_NO_LO_SE, certeza: "no_lo_se" });
    expect(trabajosDe("extraer")).toEqual([]);
    expect(trabajosDe("entrevista_siguiente")).toEqual([{ tipo: "entrevista_siguiente", company_id: EMP, payload: { session_id: s.id } }]);
    expect(tabla("company_metricas")).toEqual([]);
  });

  it("un audio con contenido se extrae como siempre; y en otra entrevista un «no sé» hablado no cambia de trato", async () => {
    const s = await sesionDe();
    const p = await abierta();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", audio: new Blob(["audio"]), mime: "audio/webm" });
    h.estado.trabajos = [];
    h.estado.transcripcion = "Vendo ropa en Gamarra, somos cuatro.";
    await handleTranscribirRespuesta({ id: "job-t", company_id: EMP, payload: { response_id: p.id } });
    expect(tabla("interview_responses")[0]).toMatchObject({ respuesta: "Vendo ropa en Gamarra, somos cuatro.", certeza: "exacta" });
    expect(trabajosDe("extraer")).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: p.id } }]);

    tabla("interview_sessions").push({ id: "ses-vieja", company_id: EMP, participant_id: PART, tipo: "empresa_dueno", estado: "en_curso" });
    tabla("interview_responses").push({ id: "r-vieja", session_id: "ses-vieja", pregunta: "¿Cuánto te deben tus clientes hoy, y desde cuándo?", respuesta: null, respuesta_audio_path: "x/respuestas/r-vieja.webm", bloque: "hoy", orden: 1 });
    h.estado.trabajos = [];
    h.estado.escrituras = [];
    h.estado.transcripcion = "No sé";
    await handleTranscribirRespuesta({ id: "job-v", company_id: EMP, payload: { response_id: "r-vieja" } });
    expect(tabla("interview_responses").find((f) => f.id === "r-vieja")).toMatchObject({ respuesta: "No sé" });
    expect(h.estado.escrituras.some((e) => "certeza" in e.datos), "fuera de la entrada no se escribe la certeza").toBe(false);
    expect(trabajosDe("extraer")).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: "r-vieja" } }]);
  });

  it("con las doce respondidas, la misma rama cierra la sesión con su síntesis y tampoco llama al modelo", async () => {
    await responderTodo();
    h.estado.tablas.interview_sessions[0].estado = "en_curso";
    h.estado.tablas.interview_sessions[0].sintesis = null;
    const r = await handleEntrevistaSiguiente({ id: "job-3", company_id: EMP, payload: { session_id: (await sesionDe()).id } });
    expect(r).toMatchObject({ generadas: 0, origen: "plan", cerrada: true });
    expect((await sesionDe()).estado).toBe("completa");
    expect((await sesionDe()).sintesis).not.toBeNull();
    expect(correrEntrevistador).not.toHaveBeenCalled();
  });

  it("audio con el texto que la dueña leyó y confirmó: se guarda el texto, el audio queda de respaldo y se sigue", async () => {
    const s = await sesionDe();
    const p = await abierta();
    const r = await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", texto: "Vendo ropa en Gamarra.", audio: new Blob(["audio"]), mime: "audio/webm" });
    expect(r.modo).toBe("texto");
    expect(tabla("interview_responses")[0]).toMatchObject({ respuesta: "Vendo ropa en Gamarra.", certeza: "exacta", respuesta_audio_path: `${EMP}/respuestas/${p.id}.webm` });
    expect(trabajosDe("transcribir_respuesta")).toEqual([]);
    expect((await abierta()).n).toBe(2);
  });

  it("registrarRespuesta sin certeza (cualquier otra entrevista) no escribe ninguna columna de la entrada y sigue encolando la siguiente", async () => {
    tabla("interview_sessions").push({ id: "ses-vieja", company_id: EMP, participant_id: PART, tipo: "empresa_dueno", estado: "en_curso" });
    tabla("interview_responses").push({ id: "r-vieja", session_id: "ses-vieja", pregunta: "¿Qué vendes y a quién?", respuesta: null, bloque: "hoy", orden: 1 });
    h.estado.escrituras = [];
    h.estado.trabajos = [];
    await registrarRespuesta({ session_id: "ses-vieja", company_id: EMP, response_id: "r-vieja", texto: "Ropa, a señoras." });
    const escrito = h.estado.escrituras.find((e) => e.tabla === "interview_responses")!.datos;
    expect(Object.keys(escrito).sort()).toEqual(["_ids", "respondido_at", "respuesta"]);
    expect(h.estado.trabajos.map((t) => t.tipo).sort()).toEqual(["entrevista_siguiente", "extraer"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("la síntesis: lo que entendimos, frase por frase y con su fuente (con dobles)", () => {
  beforeEach(async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
  });

  it("cada frase cita su fuente, va en su grupo, y lleva las palabras de la dueña entre comillas", async () => {
    await responderTodo();
    const s = await sintesis((await sesionDe()).id, sb);
    expect(s.rotulo).toBe(ROTULO_SINTESIS);
    expect(s.rotulo, "se rotula como declaración, no como interpretación").toMatch(/No es una interpretación/);
    expect(s.grupos.map((g) => g.nombre)).toEqual(Object.values(GRUPOS));
    const frases = s.grupos.flatMap((g) => g.frases);
    expect(frases).toHaveLength(12);
    for (const [i, f] of frases.entries()) {
      expect(f.fuente.trim().length, `${f.clave} no cita fuente`).toBeGreaterThan(10);
      expect(f.fuente, f.clave).toBe(`Tus palabras en la entrada (pregunta ${i + 1}).`);
      expect(f.texto, f.clave).toBe(`«Respuesta de la dueña a la pregunta ${i + 1}, con sus palabras.»`);
      expect(f.grupo).toBe(PLAN_ENTRADA[i].grupo);
      expect(f.asunto).toBe(PLAN_ENTRADA[i].asunto);
    }
    for (const g of s.grupos) expect(g.frases.every((f) => f.grupo === g.grupo)).toBe(true);
  });

  it("una frase larga se recorta; una pregunta sin responder no tiene frase (no se inventa)", () => {
    const larga = "palabra ".repeat(80);
    const s = armarSintesis([fila({ clave_pregunta: CLAVES_PLAN[0], pregunta: PLAN_ENTRADA[0].texto, respuesta: larga, certeza: "exacta" }), fila({ id: "g", clave_pregunta: CLAVES_PLAN[1], pregunta: PLAN_ENTRADA[1].texto, respuesta: null, orden: 2 })]);
    const frases = s.grupos.flatMap((g) => g.frases);
    expect(frases).toHaveLength(1);
    expect(frases[0].texto.length).toBeLessThanOrEqual(202);
    expect(frases[0].texto.endsWith("…»")).toBe(true);
    expect(afirmacionDe("Por tu archivo entendimos que vendes 80,000 al mes. ¿Es así?")).toBe("Por tu archivo entendimos que vendes 80,000 al mes.");
  });

  it("no se puede confirmar a medias", async () => {
    await responder("uno");
    const r = await rechazo(async () => confirmarEntrada({ session_id: (await sesionDe()).id, company_id: EMP, correcciones: [] }));
    expect(r.status).toBe(409);
    expect((await sesionDe()).sintesis_confirmada_at).toBeNull();
  });

  it("confirmar sin correcciones marca todo «está bien» y guarda la fecha", async () => {
    await responderTodo();
    const antes = trabajosDe("extraer").length;
    const r = await confirmarEntrada({ session_id: (await sesionDe()).id, company_id: EMP, correcciones: [] });
    expect(r.ya_confirmada).toBe(false);
    const s = await sesionDe();
    expect(s.sintesis_confirmada_at).toBeTruthy();
    expect(s.sintesis!.grupos.flatMap((g) => g.frases).map((f) => f.marca)).toEqual(Array(12).fill("esta_bien"));
    expect(trabajosDe("extraer")).toHaveLength(antes);
    expect(tabla("interview_responses")).toHaveLength(12);
  });

  it("«no es así» con su corrección: se guarda como respuesta nueva, va al extractor, y la frase conserva lo dicho antes y lo corregido", async () => {
    await responderTodo();
    const s0 = await sesionDe();
    const antes = trabajosDe("extraer").length;
    const r = await confirmarEntrada({ session_id: s0.id, company_id: EMP, correcciones: [{ clave: "entrada.no_sacrifica", texto: "  Los domingos con mi familia.  " }] });
    expect(r.correcciones_ids).toHaveLength(1);
    const nueva = tabla("interview_responses").find((f) => f.id === r.correcciones_ids[0])!;
    expect(nueva).toMatchObject({ clave_pregunta: "entrada.no_sacrifica", respuesta: "Los domingos con mi familia.", certeza: "exacta", orden: 13 });
    expect(String(nueva.pregunta)).toBe(`Corrección a «${PLAN_POR_CLAVE.get("entrada.no_sacrifica")!.texto}»`);
    expect(trabajosDe("extraer").slice(antes)).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: nueva.id } }]);

    const frases = (await sesionDe()).sintesis!.grupos.flatMap((g) => g.frases);
    const corregida = frases.find((f) => f.clave === "entrada.no_sacrifica")!;
    expect(corregida).toMatchObject({ marca: "no_es_asi", correccion: "Los domingos con mi familia.", texto: "«Respuesta de la dueña a la pregunta 9, con sus palabras.»" });
    expect(frases.filter((f) => f.marca === "esta_bien")).toHaveLength(11);
    // El avance sigue siendo 12 de 12: una corrección no es una pregunta más.
    expect((await estadoEntrada(s0.id, sb)).progreso).toEqual({ respondidas: 12, total: 12 });
  });

  it("confirmar dos veces no repite nada; y una vez confirmada ya no se responde", async () => {
    await responderTodo();
    const s = await sesionDe();
    await confirmarEntrada({ session_id: s.id, company_id: EMP, correcciones: [{ clave: "entrada.no_sacrifica", texto: "Mi familia." }] });
    const filas = tabla("interview_responses").length;
    const trabajos = h.estado.trabajos.length;
    const otra = await confirmarEntrada({ session_id: s.id, company_id: EMP, correcciones: [{ clave: "entrada.no_sacrifica", texto: "Otra cosa." }] });
    expect(otra.ya_confirmada).toBe(true);
    expect(tabla("interview_responses")).toHaveLength(filas);
    expect(h.estado.trabajos).toHaveLength(trabajos);
    const tarde = await rechazo(() => responderEntrada({ session_id: s.id, company_id: EMP, response_id: String(tabla("interview_responses")[0].id), modo: "texto", texto: "x" }));
    expect(tarde.status).toBe(409);
  });

  it("una corrección de una pregunta que no es del plan, repetida o vacía se rechaza y no confirma nada", async () => {
    await responderTodo();
    const id = (await sesionDe()).id;
    const inventada = await rechazo(() => confirmarEntrada({ session_id: id, company_id: EMP, correcciones: [{ clave: "entrada.inventada", texto: "x" }] }));
    expect(inventada.status).toBe(400);
    await rechazo(() => confirmarEntrada({ session_id: id, company_id: EMP, correcciones: [{ clave: CLAVES_PLAN[0], texto: "a" }, { clave: CLAVES_PLAN[0], texto: "b" }] }));
    const vacia = await rechazo(() => confirmarEntrada({ session_id: id, company_id: EMP, correcciones: [{ clave: CLAVES_PLAN[0], texto: "   " }] }));
    expect(vacia.message).toMatch(/Escribe cómo es/);
    expect((await sesionDe()).sintesis_confirmada_at).toBeNull();
    expect(tabla("interview_responses")).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("la siguiente acción del portal apunta a la entrada mientras no esté confirmada (puro)", () => {
  it("sin entrada (empresas que ya estaban en marcha) o con la entrada confirmada, el portal sigue su camino de siempre", () => {
    expect(accionDeEntrada(null)).toBeNull();
    expect(accionDeEntrada({ estado: "confirmada", respondidas: 12, total: 12 })).toBeNull();
  });

  it("sin empezar, a medias y por confirmar: siempre lleva a /portal/entrada, con el paso que toca", () => {
    expect(RUTA_ENTRADA).toBe("/portal/entrada");
    expect(accionDeEntrada({ estado: "sin_empezar", respondidas: 0, total: 12 })).toMatchObject({ href: "/portal/entrada", accion: "Empezar" });
    expect(accionDeEntrada({ estado: "en_curso", respondidas: 5, total: 12 })).toMatchObject({ href: "/portal/entrada", accion: "Continuar", texto: "Vas en la pregunta 6 de 12." });
    // Recién registrada: la primera pregunta ya está abierta pero no hay nada respondido. Es «Empezar», no «Continuar».
    expect(accionDeEntrada({ estado: "en_curso", respondidas: 0, total: 12 })).toMatchObject({ href: "/portal/entrada", accion: "Empezar", texto: "Empecemos por conocer tu negocio." });
    expect(accionDeEntrada({ estado: "por_confirmar", respondidas: 12, total: 12 })).toMatchObject({ href: "/portal/entrada", accion: "Revisar y confirmar" });
  });

  it("el estado sale de la sesión y sus filas", () => {
    const sesion = { estado: "en_curso", plan: CLAVES_PLAN, sintesis_confirmada_at: null };
    const filas = (n: number) => CLAVES_PLAN.slice(0, n).map((c, i) => ({ clave_pregunta: c, respuesta: "x", orden: i + 1 }));
    expect(entradaDesde({ ...sesion, estado: "pendiente" }, [])).toEqual({ estado: "sin_empezar", respondidas: 0, total: 12 });
    expect(entradaDesde(sesion, [{ clave_pregunta: CLAVES_PLAN[0], respuesta: null, orden: 1 }])).toEqual({ estado: "en_curso", respondidas: 0, total: 12 });
    expect(entradaDesde(sesion, filas(5))).toEqual({ estado: "en_curso", respondidas: 5, total: 12 });
    expect(entradaDesde({ ...sesion, estado: "completa" }, filas(12))).toEqual({ estado: "por_confirmar", respondidas: 12, total: 12 });
    expect(entradaDesde({ ...sesion, estado: "completa", sintesis_confirmada_at: "2026-10-13T13:00:00Z" }, filas(12))).toEqual({ estado: "confirmada", respondidas: 12, total: 12 });
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("las pantallas y la ruta usan la regla (lectura del código, sin abrir el navegador)", () => {
  it("la ruta declara su cupo, exige que responda el dueño y delega en las funciones probadas arriba", () => {
    const ruta = leer("app/api/companies/[id]/entrada/route.ts");
    expect(ruta).toMatch(/protegido<Ctx>\(\{ cupo: "ia", entidad: "entrada" \}/);
    expect(ruta).toMatch(/exigirAcceso\(perfil, id\)/);
    expect(ruta).toMatch(/if \(!vista\.puedeResponder\) throw new AccesoDenegado\(/);
    for (const fn of ["iniciarEntrada(", "responderEntrada(", "confirmarEntrada("]) expect(ruta).toContain(fn);
    expect(ruta, "una regla incumplida no es un 500").toMatch(/if \(e instanceof ReglaEntrada\) return fallo\(e\.message, e\.status\)/);
  });

  it("en el worker, la rama entrada_breve está antes de armar contexto y de llamar al entrevistador", () => {
    const worker = leer("lib/jobs/handlers/entrevista.ts");
    const rama = worker.indexOf('if (ses.tipo === "entrada_breve")');
    expect(rama).toBeGreaterThan(0);
    expect(rama).toBeLessThan(worker.indexOf("correrEntrevistador(contexto)"));
    expect(worker.slice(rama, rama + 200)).toContain("abrirSiguientePregunta(sessionId, sb)");
  });

  it("el registro pide tres cosas, abre la entrada y lleva a ella", () => {
    const crear = leer("components/cliente/CrearEmpresa.tsx");
    expect((crear.match(/<input /g) ?? []).length, "nombre, rubro y ciudad").toBe(3);
    expect(crear).not.toMatch(/<select|<textarea/);
    expect(crear).toContain('pedir<{ company_id: string }>("/api/portal/empresa", { json: { nombre, ficha: { actividad, ciudad } } })');
    expect(crear).toContain('json: { accion: "iniciar" }');
    expect(crear).toContain('"/portal/entrada"');
    for (const viejo of ["whatsapp", "antiguedad", "venta_mensual", "documentacion", "cliente_tipo", "canales"]) expect(crear, `el registro todavía pide ${viejo}`).not.toContain(viejo);
  });

  it("la portada del portal pone la entrada sin confirmar por delante de todo lo demás", () => {
    const portada = leer("app/(cliente)/portal/page.tsx");
    expect(portada).toContain("const deEntrada = accionDeEntrada(t.entrada);");
    expect(portada).toContain("const lectura = deEntrada ?? lecturaDeSiempre;");
    const tablero = leer("lib/tablero.ts");
    expect(tablero, "la pregunta abierta de la entrada no se ofrece como «tu conversación a mitad»").toContain('.neq("interview_sessions.tipo", "entrada_breve")');
  });

  it("la pantalla de la entrada ofrece hablar, escribir, «No lo sé», «Es aproximado» y subir un documento, sin jerga", () => {
    const pantalla = leer("components/cliente/EntradaBreve.tsx");
    for (const pieza of ["<BotonGrabar", "<BotonEscuchar", "<textarea", "No lo sé", "Es aproximado", "Subir un documento en vez de responder", "<Subir companyId={companyId} paraCliente", "Sí, es así", "Está bien", "No es así"]) {
      expect(pantalla, `falta «${pieza}»`).toContain(pieza);
    }
    expect(pantalla).toMatch(/Pregunta \$\{actual\} de \$\{total\}/);
    expect(pantalla, "no se promete una duración que nadie midió").not.toMatch(/\d+\s*minutos/);
    const visible = pantalla.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    expect(visible).not.toMatch(/pilar|claim|matriz|hallazgo|\bIA\b|inteligencia artificial|s[ií]ntesis<|metodolog/i);
    const pagina = leer("app/(cliente)/portal/entrada/page.tsx");
    expect(pagina).toContain("<Encabezado");
    expect(pagina).toContain("entradaDeUsuario(c.companyId, c.u, supabaseAdmin())");
  });

  it("la entrada es una puerta nueva: las anteriores siguen en su sitio", () => {
    for (const rel of ["app/(cliente)/portal/conversacion/page.tsx", "app/(consultor)/empresas/nueva/page.tsx", "components/cliente/ConversacionCliente.tsx", "app/registro/page.tsx"]) {
      expect(existsSync(path.join(SRC, rel)), `${rel} ya no existe`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("las pantallas, pintadas en el servidor con la base falsa (no en un navegador)", () => {
  const pintar = async (puedeResponder = true, motivo: string | null = null) => {
    const inicial = await estadoEntrada((await sesionDe()).id, sb);
    return renderToStaticMarkup(createElement(EntradaBreve, { companyId: EMP, inicial, puedeResponder, motivoSoloLectura: motivo, transcriptor: false }));
  };
  const comoDuena = () => {
    h.estado.portal = { u: { id: DUENA, rol: "cliente", email: null, nombre: "Rosa Mamani" }, companyId: EMP };
  };

  it("la primera pregunta: «Pregunta 1 de 12», su grupo, la caja para escribir y las tres salidas (no lo sé, documento, guardar)", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    const html = await pintar();
    expect(html).toContain("Pregunta 1 de 12");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain(GRUPOS.a);
    expect(html).toContain("Cuéntame tu negocio hoy: ¿a qué se dedica?");
    expect(html).toContain('aria-label="Tu respuesta"');
    for (const boton of ["Guardar y seguir", "No lo sé", "Subir un documento en vez de responder"]) expect(html, boton).toContain(`>${boton}</button>`);
    // En una pregunta de relato no se ofrece «Es aproximado», y sin nada sabido no hay «Sí, es así».
    expect(html).not.toContain("Es aproximado");
    expect(html).not.toContain("Sí, es así");
  });

  it("la pregunta de ventas ofrece «Es aproximado»; si ya lo sabíamos, dice de dónde y ofrece «Sí, es así»", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("uno");
    await responder("dos");
    const sinSaber = await pintar();
    expect(sinSaber).toContain("Pregunta 3 de 12");
    expect(sinSaber).toContain(">Es aproximado</button>");
    expect(sinSaber).not.toContain("Sí, es así");

    sembrar();
    tabla("sources").push({ id: EXCEL, company_id: EMP, nombre: "ventas-2026.xlsx", tipo: "dato", origen: "cliente", created_at: "2026-10-12T10:00:00.000Z" });
    tabla("company_metricas").push({ company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 80000, estado: "extraido", source_id: EXCEL, response_id: null });
    tabla("company_metricas").push({ company_id: EMP, clave: "ganancia_mes", periodo: "2026-09", valor: 12000, estado: "extraido", source_id: EXCEL, response_id: null });
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("uno");
    await responder("dos");
    const sabida = await pintar();
    expect(sabida).toContain("entendimos que vendes unos S/ 80,000 al mes y que te quedan unos S/ 12,000. ¿Es así?");
    expect(sabida).toContain("Esto no te lo preguntamos de cero: lo vimos en tu archivo «ventas-2026.xlsx».");
    expect(sabida).toContain(">Sí, es así</button>");
    expect(sabida).toContain("Si no es así, cuéntanos cómo es");
  });

  it("quien solo mira ve por dónde va y por qué no puede responder, sin ningún botón de respuesta", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    const html = await pintar(false, "Estás mirando. Las respuestas las da el dueño desde su cuenta.");
    expect(html).toContain("Estás mirando. Las respuestas las da el dueño desde su cuenta.");
    expect(html).toContain("Cuéntame tu negocio hoy");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<textarea");
  });

  it("al terminar: «Lo que entendimos» por grupos, cada frase con su fuente y sus dos botones, y el botón de confirmar", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responderTodo();
    const html = await pintar();
    expect(html).toContain("12 de 12 respondidas");
    expect(html).toContain("Lo que entendimos");
    expect(html).toContain("No es una interpretación");
    for (const nombre of Object.values(GRUPOS)) expect(html).toContain(nombre);
    expect((html.match(/Tus palabras en la entrada \(pregunta \d+\)\./g) ?? []).length).toBe(12);
    expect((html.match(/>Está bien<\/button>/g) ?? []).length).toBe(12);
    expect((html.match(/>No es así<\/button>/g) ?? []).length).toBe(12);
    expect(html).toContain(">Confirmo: así es</button>");
    expect(html, "todavía no hay nada que decir de «listo»").not.toContain("Ir al inicio");
  });

  it("confirmada: se ve lo corregido y lo dado por bueno, ya no se edita, y hay un siguiente paso", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responderTodo();
    await confirmarEntrada({ session_id: (await sesionDe()).id, company_id: EMP, correcciones: [{ clave: "entrada.no_sacrifica", texto: "Los domingos con mi familia." }] });
    const html = await pintar();
    expect(html).toContain("Esto es lo que nos contaste y diste por bueno.");
    expect(html).toContain("<strong>Lo corregiste:</strong> «Los domingos con mi familia.»");
    expect((html.match(/Lo diste por bueno\./g) ?? []).length).toBe(11);
    expect(html).not.toContain("<button");
    expect(html).toContain('href="/portal"');
    expect(html).toContain("Ir al inicio");
  });

  it("la página del portal: sin empresa invita a crearla; con empresa pinta el encabezado y la entrada donde va", async () => {
    h.estado.portal = { u: { id: DUENA, rol: "cliente", email: null, nombre: "Rosa Mamani" }, companyId: null };
    expect(renderToStaticMarkup(await PaginaEntrada())).toContain("Primero cuéntanos cómo se llama tu negocio");

    comoDuena();
    const sinEmpezar = renderToStaticMarkup(await PaginaEntrada());
    expect(sinEmpezar).toContain("Cuéntanos tu negocio");
    expect(sinEmpezar).toContain("12 preguntas, una a la vez.");
    expect(sinEmpezar).toContain(">Empezar</button>");

    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    for (let i = 0; i < 4; i++) await responder(`Respuesta ${i + 1}.`);
    expect(renderToStaticMarkup(await PaginaEntrada()), "al volver, sigue en la quinta").toContain("Pregunta 5 de 12");

    h.estado.portal = { u: { id: "22222222-2222-4222-8222-222222222222", rol: "consultor", email: null, nombre: "Consultora" }, companyId: EMP };
    const mirando = renderToStaticMarkup(await PaginaEntrada());
    expect(mirando).toContain("Estás mirando. Las respuestas las da el dueño desde su cuenta.");
    expect(mirando).not.toContain("<button");
  });

  it("si la base no tiene lo que la entrada necesita, la página lo dice en vez de caerse", async () => {
    comoDuena();
    h.estado.fallar.interview_sessions = { op: "select", mensaje: "column interview_sessions.plan does not exist" };
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToStaticMarkup(await PaginaEntrada());
    expect(html).toContain("Estas preguntas todavía no están disponibles para tu empresa.");
    expect(silencio, "y la causa queda en el registro del servidor").toHaveBeenCalledWith(expect.stringContaining("migracion-entrada-y-direccion.sql"));
    silencio.mockRestore();
  });

  it("el registro pintado: tres cajas con su etiqueta y nada más que escribir", () => {
    const html = renderToStaticMarkup(createElement(CrearEmpresa));
    expect((html.match(/<input/g) ?? []).length).toBe(3);
    for (const etiqueta of ["¿Cómo se llama tu negocio?", "¿A qué se dedica? Dilo con tus palabras", "¿En qué ciudad está?"]) expect(html).toContain(etiqueta);
    expect(html).toContain("Crear y empezar");
    expect(html).not.toMatch(/<select|<textarea/);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("lo escrito o dicho vale lo mismo que el botón: «no lo sé» y «sí» no van al extractor (con dobles)", () => {
  /** La empresa ya subió su Excel: la pregunta de ventas llega como confirmación con sus cifras. */
  async function hastaLaConfirmacion() {
    tabla("sources").push({ id: EXCEL, company_id: EMP, nombre: "ventas-2026.xlsx", tipo: "dato", origen: "cliente", created_at: "2026-10-12T10:00:00.000Z" });
    tabla("company_metricas").push({ company_id: EMP, clave: "venta_mes", periodo: "2026-09", valor: 80000, estado: "extraido", origen: "extraido", source_id: EXCEL, response_id: null });
    tabla("company_metricas").push({ company_id: EMP, clave: "ganancia_mes", periodo: "2026-09", valor: 12000, estado: "extraido", origen: "extraido", source_id: EXCEL, response_id: null });
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("uno");
    await responder("dos");
    const p = await abierta();
    expect(p).toMatchObject({ clave: "entrada.ventas_y_ganancia", basta_confirmar: true });
    return p;
  }
  const filaDe = (id: string) => tabla("interview_responses").find((x) => x.id === id)!;
  const fueAlExtractor = (id: string) => trabajosDe("extraer").some((t) => t.payload.response_id === id);

  it("las reglas puras: qué es un «sí», y cuándo cuenta como confirmación", () => {
    for (const dicho of ["Sí", "si", "Sí, así es.", "Sí, es así", "Así es", "Correcto", "Sí, correcto", "Exacto", "Claro que sí", "Está bien", "Sí, sigue igual"]) expect(esSoloSi(dicho), dicho).toBe(true);
    for (const dicho of ["Sí, pero ahora vendo menos", "Así es, 80 mil", "No", "Sí vendo, pero poco", "Más o menos"]) expect(esSoloSi(dicho), dicho).toBe(false);
    const confirmacion = { pregunta: "Por tu archivo entendimos que vendes unos S/ 80,000 al mes. ¿Es así?", sabida_por: "tu archivo «ventas.xlsx»" };
    const delPlan = { pregunta: PLAN_ENTRADA[0].texto, sabida_por: null };
    const aMedias = { pregunta: "Por tu archivo entendimos que vendes unos S/ 80,000 al mes. ¿Cuánto de eso te queda después de pagar todo?", sabida_por: "tu archivo «ventas.xlsx»" };
    expect(tratoDeRespuesta(confirmacion, "Sí, así es")).toBe("confirma");
    expect(tratoDeRespuesta(confirmacion, "No lo sé")).toBe("no_lo_se");
    expect(tratoDeRespuesta(confirmacion, "No, ahora vendo 60 mil")).toBe("palabras");
    // Ante una pregunta que no era confirmación, «sí» son palabras: no confirma nada.
    expect(tratoDeRespuesta(delPlan, "Sí")).toBe("palabras");
    expect(tratoDeRespuesta(aMedias, "Sí")).toBe("palabras");
    // La pregunta que va al extractor: la del plan cuando la mostrada traía algo sabido; si no, no cambia nada.
    expect(preguntaParaExtraer({ ...confirmacion, clave_pregunta: "entrada.ventas_y_ganancia" })).toBe(PLAN_POR_CLAVE.get("entrada.ventas_y_ganancia")!.texto);
    expect(preguntaParaExtraer({ ...aMedias, clave_pregunta: "entrada.ventas_y_ganancia" })).toBe(PLAN_POR_CLAVE.get("entrada.ventas_y_ganancia")!.texto);
    expect(preguntaParaExtraer({ ...delPlan, clave_pregunta: CLAVES_PLAN[0] })).toBeNull();
    expect(preguntaParaExtraer({ pregunta: "Al crear tu empresa nos dijiste que tu negocio es ferretería. Cuéntame…", sabida_por: null, clave_pregunta: CLAVES_PLAN[0] })).toBeNull();
  });

  it("«No lo sé.» con su audio (lo que manda la pantalla cuando hay transcriptor) es un «no lo sé»: certeza no_lo_se, nada al extractor, y el audio se conserva", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("uno");
    await responder("dos");
    const s = await sesionDe();
    const p = await abierta();
    expect(p.clave).toBe("entrada.ventas_y_ganancia");
    h.estado.trabajos = [];
    const r = await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", texto: "No lo sé.", audio: new Blob(["audio"]), mime: "audio/webm" });
    expect(r.modo).toBe("texto");
    expect(filaDe(p.id)).toMatchObject({ respuesta: TEXTO_NO_LO_SE, certeza: "no_lo_se", respuesta_audio_path: `${EMP}/respuestas/${p.id}.webm` });
    expect(h.estado.trabajos, "ni extraer ni transcribir: ya se sabe qué dijo").toEqual([]);
    expect(tabla("company_metricas")).toEqual([]);
    expect((await abierta()).clave).toBe(CLAVES_PLAN[3]);
    // Marcado como aproximado y todo: «no lo sé» no es una cifra aproximada.
    const q = await abierta();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: q.id, modo: "texto", texto: "No, no lo sé", aproximado: true, audio: new Blob(["audio"]) });
    expect(filaDe(q.id)).toMatchObject({ respuesta: TEXTO_NO_LO_SE, certeza: "no_lo_se" });
    expect(h.estado.trabajos).toEqual([]);
  });

  it("un «sí» ESCRITO ante una confirmación es una confirmación: no va al extractor y el número sigue siendo el del Excel", async () => {
    const p = await hastaLaConfirmacion();
    const s = await sesionDe();
    const metricasAntes = JSON.stringify(tabla("company_metricas"));
    h.estado.trabajos = [];
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", texto: "Sí, así es" });
    expect(filaDe(p.id)).toMatchObject({ respuesta: TEXTO_CONFIRMA, certeza: "exacta", sabida_por: "tu archivo «ventas-2026.xlsx»" });
    expect(fueAlExtractor(p.id), "el «sí» no viaja al extractor junto a las cifras del documento").toBe(false);
    expect(h.estado.trabajos).toEqual([]);
    expect(JSON.stringify(tabla("company_metricas"))).toBe(metricasAntes);
    const frase = (await sintesis(s.id, sb)).grupos.flatMap((g) => g.frases).find((f) => f.clave === p.clave)!;
    expect(frase.fuente).toBe("Tu archivo «ventas-2026.xlsx», confirmado por ti en la entrada (pregunta 3).");
  });

  it("un «sí» DICHO y leído (audio + texto) también confirma; el audio queda guardado", async () => {
    const p = await hastaLaConfirmacion();
    const s = await sesionDe();
    h.estado.trabajos = [];
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", texto: "Sí, correcto.", audio: new Blob(["audio"]), mime: "audio/webm" });
    expect(filaDe(p.id)).toMatchObject({ respuesta: TEXTO_CONFIRMA, certeza: "exacta", respuesta_audio_path: `${EMP}/respuestas/${p.id}.webm` });
    expect(h.estado.trabajos).toEqual([]);
  });

  it("un «sí» en un audio sin texto: el worker lo pasa a texto y lo deja como confirmación, sin extraer", async () => {
    const p = await hastaLaConfirmacion();
    const s = await sesionDe();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", audio: new Blob(["audio"]), mime: "audio/webm" });
    const metricasAntes = JSON.stringify(tabla("company_metricas"));
    h.estado.trabajos = [];
    h.estado.transcripcion = "Sí, así es.";
    await handleTranscribirRespuesta({ id: "job-t", company_id: EMP, payload: { response_id: p.id } });
    expect(filaDe(p.id)).toMatchObject({ respuesta: TEXTO_CONFIRMA, certeza: "exacta" });
    expect(String(filaDe(p.id).pregunta), "la confirmación queda tal como se le mostró").toContain("S/ 80,000");
    expect(trabajosDe("extraer")).toEqual([]);
    expect(trabajosDe("entrevista_siguiente")).toHaveLength(1);
    expect(JSON.stringify(tabla("company_metricas"))).toBe(metricasAntes);
  });

  it("palabras dichas en un audio ante una confirmación: el worker deja en la fila la pregunta del plan y recién entonces extrae", async () => {
    const p = await hastaLaConfirmacion();
    const s = await sesionDe();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", audio: new Blob(["audio"]), mime: "audio/webm" });
    h.estado.trabajos = [];
    h.estado.transcripcion = "No, ese Excel es viejo. Ahora vendo como 60 mil.";
    await handleTranscribirRespuesta({ id: "job-t", company_id: EMP, payload: { response_id: p.id } });
    const f = filaDe(p.id);
    expect(f).toMatchObject({ respuesta: "No, ese Excel es viejo. Ahora vendo como 60 mil.", pregunta: PLAN_POR_CLAVE.get(p.clave)!.texto, sabida_por: "tu archivo «ventas-2026.xlsx»" });
    expect(`${f.pregunta} ${f.respuesta}`).not.toMatch(/80,000|12,000/);
    expect(trabajosDe("extraer")).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: p.id } }]);
    expect(mostradasDe((await sesionDe()).sintesis)[p.clave]).toBe(p.pregunta);
    // Repetir el trabajo (un reintento) no pisa lo mostrado con la pregunta del plan.
    await handleTranscribirRespuesta({ id: "job-t2", company_id: EMP, payload: { response_id: p.id } });
    expect(mostradasDe((await sesionDe()).sintesis)[p.clave]).toBe(p.pregunta);
    const frase = (await sintesis(s.id, sb)).grupos.flatMap((g) => g.frases).find((x) => x.clave === p.clave)!;
    expect(frase.fuente).toBe("Tus palabras en la entrada (pregunta 3), al revisar lo que entendimos por tu archivo «ventas-2026.xlsx».");
  });

  it("si no se puede guardar lo que se le mostró, la respuesta no se guarda ni se extrae: no se cambia la pregunta a ciegas", async () => {
    const p = await hastaLaConfirmacion();
    const s = await sesionDe();
    h.estado.trabajos = [];
    h.estado.fallar.interview_sessions = { op: "update", mensaje: "conexión perdida" };
    await expect(responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", texto: "No, vendo 60 mil." })).rejects.toThrow(/No se pudo guardar lo que ya sabíamos/);
    h.estado.fallar = {};
    expect(filaDe(p.id)).toMatchObject({ respuesta: null, pregunta: p.pregunta });
    expect(h.estado.trabajos).toEqual([]);
  });

  it("al cerrar y al confirmar, la síntesis conserva lo mostrado; y la corrección de algo confirmado viaja con la pregunta del plan", async () => {
    const p = await hastaLaConfirmacion();
    const s = await sesionDe();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "confirma" });
    await responderTodo();
    h.estado.trabajos = [];
    const r = await confirmarEntrada({ session_id: s.id, company_id: EMP, correcciones: [{ clave: p.clave, texto: "Ya no: ahora vendo como 60 mil al mes." }] });
    const correccion = filaDe(r.correcciones_ids[0]);
    expect(String(correccion.pregunta)).toBe(`Corrección a «${PLAN_POR_CLAVE.get(p.clave)!.texto}»`);
    expect(`${correccion.pregunta} ${correccion.respuesta}`, "las cifras del Excel no van al extractor con la corrección").not.toMatch(/80,000|12,000/);
    expect(trabajosDe("extraer")).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: correccion.id } }]);
    const frase = r.sintesis.grupos.flatMap((g) => g.frases).find((f) => f.clave === p.clave)!;
    expect(frase).toMatchObject({ marca: "no_es_asi", correccion: "Ya no: ahora vendo como 60 mil al mes.", texto: "Por tu archivo «ventas-2026.xlsx» entendimos que vendes unos S/ 80,000 al mes y que te quedan unos S/ 12,000." });
  });

  it("una corrección que es un «no lo sé» queda con esa certeza y NO va al extractor; las demás sí", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responderTodo();
    const s = await sesionDe();
    h.estado.trabajos = [];
    const r = await confirmarEntrada({
      session_id: s.id,
      company_id: EMP,
      correcciones: [
        { clave: "entrada.ventas_y_ganancia", texto: "No lo sé" },
        { clave: "entrada.no_sacrifica", texto: "Los domingos con mi familia." },
      ],
    });
    expect(r.correcciones_ids).toHaveLength(2);
    const noSabe = tabla("interview_responses").find((f) => f.clave_pregunta === "entrada.ventas_y_ganancia" && String(f.pregunta).startsWith("Corrección a «"))!;
    expect(noSabe).toMatchObject({ respuesta: TEXTO_NO_LO_SE, certeza: "no_lo_se" });
    const otra = tabla("interview_responses").find((f) => f.clave_pregunta === "entrada.no_sacrifica" && String(f.pregunta).startsWith("Corrección a «"))!;
    expect(r.a_extraer).toEqual([otra.id]);
    expect(trabajosDe("extraer")).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: otra.id } }]);
    expect(tabla("company_metricas")).toEqual([]);
    const frase = r.sintesis.grupos.flatMap((g) => g.frases).find((f) => f.clave === "entrada.ventas_y_ganancia")!;
    expect(frase).toMatchObject({ marca: "no_es_asi", correccion: TEXTO_NO_LO_SE });
  });

  it("si un primer envío guardó la corrección y se cortó antes de confirmarla, el segundo no la duplica y sí la manda a extraer", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responderTodo();
    const s = await sesionDe();
    const correcciones = [{ clave: "entrada.no_sacrifica", texto: "Los domingos con mi familia." }];
    h.estado.trabajos = [];
    h.estado.fallar.interview_sessions = { op: "update", mensaje: "conexión perdida" };
    await expect(confirmarEntrada({ session_id: s.id, company_id: EMP, correcciones })).rejects.toThrow(/No se pudo guardar tu confirmación/);
    h.estado.fallar = {};
    expect(tabla("interview_responses")).toHaveLength(13);
    expect(h.estado.trabajos, "el primer envío no llegó a encolar").toEqual([]);
    const r = await confirmarEntrada({ session_id: s.id, company_id: EMP, correcciones });
    expect(tabla("interview_responses"), "no se duplica").toHaveLength(13);
    expect(r.correcciones_ids).toEqual([]);
    expect(trabajosDe("extraer")).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: r.a_extraer[0] } }]);
    expect((await sesionDe()).sintesis_confirmada_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("la entrada tiene una sola puerta: la pantalla de conversación de siempre no la puede responder (con dobles)", () => {
  // La sesión de la entrada es una entrevista más: hoy también sale en /portal/conversacion y en el panel del
  // consultor, que responden por /api/interviews/[sesion]/answer, y en el acceso por enlace. Los tres guardan
  // por registrarRespuesta: sin certeza, sin la regla del «no lo sé», y dejando responder al consultor.
  beforeEach(async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("uno");
    await responder("dos");
    h.estado.trabajos = [];
    h.estado.escrituras = [];
    h.estado.subidas = [];
  });

  it("la ruta vieja y el acceso por enlace guardan por registrarRespuesta, y ahí la entrada se rechaza antes de guardar nada", () => {
    expect(leer("app/api/interviews/[sesion]/answer/route.ts")).toMatch(/await registrarRespuesta\(\{/);
    expect(leer("lib/participar.ts")).toMatch(/await registrarRespuesta\(\{/);
    const entrevista = leer("lib/entrevista.ts");
    const desde = entrevista.indexOf("export async function registrarRespuesta(");
    const cuerpo = entrevista.slice(desde, entrevista.indexOf("async function guardarRespuesta("));
    const rechazoDeEntrada = cuerpo.indexOf('if (ses?.tipo === "entrada_breve") throw new ReglaEntrada(ENTRADA_POR_SU_PUERTA, 409);');
    expect(rechazoDeEntrada).toBeGreaterThan(0);
    expect(rechazoDeEntrada, "el rechazo va antes de guardar").toBeLessThan(cuerpo.indexOf("return guardarRespuesta(opts)"));
  });

  it("una respuesta escrita por esa puerta se rechaza diciendo dónde se responde: no se guarda, no se encola, la pregunta sigue abierta", async () => {
    const s = await sesionDe();
    const p = await abierta();
    const r = await rechazo(() => registrarRespuesta({ session_id: s.id, company_id: EMP, response_id: p.id, texto: "Como 40 mil al mes y me quedan unos 8 mil." }));
    expect(r.status).toBe(409);
    expect(r.message).toBe(ENTRADA_POR_SU_PUERTA);
    expect(r.message).toContain("«Cuéntanos tu negocio»");
    expect(h.estado.escrituras).toEqual([]);
    expect(h.estado.trabajos).toEqual([]);
    expect((await abierta()).id).toBe(p.id);
  });

  it("un «no lo sé» o un audio por esa puerta tampoco entran: ni certeza equivocada, ni audio guardado, ni extractor", async () => {
    const s = await sesionDe();
    await rechazo(() => registrarRespuesta({ session_id: s.id, company_id: EMP, texto: "No lo sé" }));
    await rechazo(() => registrarRespuesta({ session_id: s.id, company_id: EMP, audio: new Blob(["audio"]), mime: "audio/webm" }));
    expect(h.estado.escrituras).toEqual([]);
    expect(h.estado.subidas).toEqual([]);
    expect(h.estado.trabajos).toEqual([]);
    expect(tabla("company_metricas")).toEqual([]);
  });

  it("si no se puede leer qué sesión es, no se guarda nada: la entrada no se cuela por un fallo de lectura", async () => {
    const s = await sesionDe();
    h.estado.fallar.interview_sessions = { op: "select", mensaje: "conexión perdida" };
    await expect(registrarRespuesta({ session_id: s.id, company_id: EMP, texto: "Como 40 mil." })).rejects.toThrow("No pudimos guardar tu respuesta. Intenta de nuevo.");
    h.estado.fallar = {};
    expect(h.estado.escrituras).toEqual([]);
    expect(h.estado.trabajos).toEqual([]);
  });

  it("por su puerta sí: la misma pregunta se responde con su certeza y su clave", async () => {
    const s = await sesionDe();
    const p = await abierta();
    await responderEntrada({ session_id: s.id, company_id: EMP, response_id: p.id, modo: "texto", texto: "Como 40 mil al mes y me quedan unos 8 mil." });
    expect(tabla("interview_responses").find((x) => x.id === p.id)).toMatchObject({ clave_pregunta: "entrada.ventas_y_ganancia", certeza: "exacta" });
    expect(h.estado.trabajos).toEqual([{ tipo: "extraer", company_id: EMP, payload: { response_id: p.id } }]);
  });

  it("las demás entrevistas siguen entrando por registrarRespuesta como siempre", async () => {
    tabla("interview_sessions").push({ id: "ses-vieja", company_id: EMP, participant_id: PART, tipo: "empresa_dueno", estado: "en_curso" });
    tabla("interview_responses").push({ id: "r-vieja", session_id: "ses-vieja", pregunta: "¿Qué vendes y a quién?", respuesta: null, bloque: "hoy", orden: 1 });
    expect(await registrarRespuesta({ session_id: "ses-vieja", company_id: EMP, response_id: "r-vieja", texto: "Ropa, a señoras." })).toEqual({ response_id: "r-vieja", modo: "texto" });
    expect(h.estado.trabajos.map((t) => t.tipo).sort()).toEqual(["entrevista_siguiente", "extraer"]);
  });

  it.todo("FUERA DE ALCANCE DE ESTE ENCARGO: /portal/conversacion, el panel del consultor y «qué falta» (src/lib/portal.ts) todavía LISTAN la sesión entrada_breve, con su tipo sin traducir; el cambio pedido es filtrarla ahí y nombrarla en src/lib/textos.ts");
});

// ---------------------------------------------------------------------------------------------------------------

describe("lo que la entrada deja en la ficha de la empresa: cuánta gente trabaja, solo si se dijo claro y el dueño lo confirmó", () => {
  it("cuánta gente, leído en código y sin adivinar (puro)", () => {
    const CLARO: [string, number][] = [
      ["Vendo ropa en Gamarra, somos cuatro.", 4],
      ["Tengo una ferretería en Arequipa y trabajo con 8 personas", 8],
      ["Es un estudio contable, tenemos 12 trabajadores", 12],
      ["Somos como diez en el taller", 10],
      ["Una bodega en Surco. Trabajo sola.", 1],
      ["Yo solo, vendo por internet", 1],
    ];
    for (const [dicho, n] of CLARO) expect(personasDichas(dicho), dicho).toBe(n);
    const DUDOSO = [
      "Somos cuatro en tienda y dos en almacén", // dos cantidades: no se suma ni se elige
      "Tengo 2 locales y somos 8", // dos cantidades
      "Somos tres hermanos", // socios, no se sabe cuántos trabajan
      "Atiendo a 200 personas al día", // clientes
      "Trabajamos seis días a la semana", // días
      "Vendo unos 40 mil al mes", // dinero
      "Somos una empresa familiar", // sin cantidad
      "Trabajo solo los sábados", // «solo» no es «sola»
      "Tengo treinta y dos empleados", // no son dos
      "Somos cuatro y mi esposa", // la cuenta no terminó en cuatro
      "Somos veinticinco", // fuera de lo que se lee con seguridad: no se adivina
      "",
    ];
    // Una cantidad de dinero dicha en palabras no estorba: la única cantidad «de gente» es la que cuenta.
    expect(personasDichas("Vendo como cuarenta mil al mes, somos cuatro")).toBe(4);
    for (const dicho of DUDOSO) expect(personasDichas(dicho), dicho).toBeNull();
  });

  it("anotar en la ficha nunca pisa lo que ya estaba escrito (con dobles)", async () => {
    tabla("companies")[0].ficha = { actividad: "ferretería", personas: "8" };
    expect(await anotarEnFicha(EMP, { personas: "4" }, sb)).toEqual({});
    expect(tabla("companies")[0].ficha).toEqual({ actividad: "ferretería", personas: "8" });
    tabla("companies")[0].ficha = { actividad: "ferretería" };
    expect(await anotarEnFicha(EMP, { personas: "4" }, sb)).toEqual({ personas: "4" });
    expect(tabla("companies")[0].ficha).toEqual({ actividad: "ferretería", personas: "4" });
  });

  it("dicho claro: la síntesis lo dice a la vista y, al confirmar, queda en la ficha (con dobles)", async () => {
    sembrar({ actividad: "venta de ropa", ciudad: "Lima" });
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("Atiendo el puesto y compro la mercadería. Somos cuatro.");
    await responderTodo();
    const s = await sesionDe();
    const frase = (await estadoEntrada(s.id, sb)).sintesis!.grupos[0].frases[0];
    expect(frase.clave).toBe("entrada.negocio_hoy");
    expect(frase.dato).toEqual({ campo: "personas", valor: "4" });
    expect(frase.entendido).toBe("De ahí tomamos que en tu negocio trabajan 4 personas, contándote a ti.");
    expect(tabla("companies")[0].ficha, "antes de confirmar no se escribe nada").toEqual({ actividad: "venta de ropa", ciudad: "Lima" });
    const html = renderToStaticMarkup(createElement(EntradaBreve, { companyId: EMP, inicial: await estadoEntrada(s.id, sb), puedeResponder: true, transcriptor: false }));
    expect(html).toContain("De ahí tomamos que en tu negocio trabajan 4 personas, contándote a ti. Si no es así, márcalo abajo y dinos cuántas son.");

    const r = await confirmarEntrada({ session_id: s.id, company_id: EMP, correcciones: [] });
    expect(r.ficha).toEqual({ personas: "4" });
    expect(tabla("companies")[0].ficha).toEqual({ actividad: "venta de ropa", ciudad: "Lima", personas: "4" });
    // Confirmada, el dato sigue a la vista pero ya no se invita a corregirlo.
    const despues = renderToStaticMarkup(createElement(EntradaBreve, { companyId: EMP, inicial: await estadoEntrada(s.id, sb), puedeResponder: true, transcriptor: false }));
    expect(despues).toContain("De ahí tomamos que en tu negocio trabajan 4 personas, contándote a ti.");
    expect(despues).not.toContain("márcalo abajo");
  });

  it("si el dueño lo corrige, vale lo corregido; y si no se dijo claro, la ficha queda como estaba (con dobles)", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("Vendo ropa en Gamarra, somos cuatro.");
    await responderTodo();
    const r = await confirmarEntrada({ session_id: (await sesionDe()).id, company_id: EMP, correcciones: [{ clave: "entrada.negocio_hoy", texto: "Con la chica nueva ya somos 5." }] });
    expect(r.ficha).toEqual({ personas: "5" });
    expect(tabla("companies")[0].ficha).toEqual({ personas: "5" });

    sembrar();
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("Vendo ropa con mi esposa y dos chicos que ayudan los sábados.");
    await responderTodo();
    const sinDato = (await estadoEntrada((await sesionDe()).id, sb)).sintesis!.grupos[0].frases[0];
    expect(sinDato.dato).toBeUndefined();
    expect(sinDato.entendido).toBeUndefined();
    const r2 = await confirmarEntrada({ session_id: (await sesionDe()).id, company_id: EMP, correcciones: [] });
    expect(r2.ficha).toEqual({});
    expect(tabla("companies")[0].ficha).toEqual({});
    expect(h.estado.escrituras.filter((e) => e.tabla === "companies")).toEqual([]);
  });

  it("si no se puede anotar en la ficha, la confirmación no se da por hecha: se dice y se puede reintentar (con dobles)", async () => {
    await iniciarEntrada({ company_id: EMP, perfil: PERFIL });
    await responder("Vendo ropa en Gamarra, somos cuatro.");
    await responderTodo();
    const s = await sesionDe();
    h.estado.fallar.companies = { op: "update", mensaje: "conexión perdida" };
    await expect(confirmarEntrada({ session_id: s.id, company_id: EMP, correcciones: [] })).rejects.toThrow(/No se pudo anotar en la ficha/);
    expect((await sesionDe()).sintesis_confirmada_at).toBeNull();
    h.estado.fallar = {};
    expect((await confirmarEntrada({ session_id: s.id, company_id: EMP, correcciones: [] })).ficha).toEqual({ personas: "4" });
    expect((await sesionDe()).sintesis_confirmada_at).toBeTruthy();
  });

  it("el registro dice en su propio archivo qué dejó de llegar a la ficha, sin volver a pedirlo", () => {
    const crear = leer("components/cliente/CrearEmpresa.tsx");
    expect(crear).toContain("QUÉ DEJÓ DE LLEGAR A LA FICHA DE LA EMPRESA");
    expect(crear).toContain("NADA los");
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("Postgres embebido (PGlite), no Supabase: el esquema tiene lo que la entrada lee y escribe", () => {
  const U = "00000000-0000-4000-8000-0000000000a1";
  const E = "0000000a-0000-4000-8000-00000000000a";
  const P = "000000a1-0000-4000-8000-0000000000a1";
  const S = "000000e1-0000-4000-8000-0000000000e1";
  let pg: PGlite | undefined;
  let fallo: unknown;

  beforeAll(async () => {
    try {
      pg = (await baseConEsquema()).pg;
      await pg.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena@prueba.local', $2::jsonb)", [U, JSON.stringify({ nombre: "Dueña sintética" })]);
      await pg.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)')", [E]);
      await pg.query("insert into participants (id, company_id, nombre, rol, user_id) values ($1, $2, 'Dueña sintética', 'dueno', $3)", [P, E, U]);
    } catch (e) {
      fallo = e;
    }
  }, 180_000);

  afterAll(async () => {
    await pg?.close();
  });

  const base = (): PGlite => {
    if (fallo) throw fallo;
    if (!pg) throw new Error("no hay base: beforeAll no la creó");
    return pg;
  };
  const rechaza = async (sql: string, params: unknown[]): Promise<string> => {
    try {
      await base().query(sql, params);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    return "";
  };

  it("todas las columnas que src/lib/entrada.ts lee existen en el esquema aplicado", async () => {
    for (const [tablaSql, columnas] of Object.entries(COLUMNAS)) {
      const r = await base().query(`select ${columnas} from ${tablaSql} limit 0`);
      expect(r.fields.map((f) => f.name), tablaSql).toEqual(columnas.split(","));
    }
    // Y las que ordena o filtra sin seleccionarlas.
    await base().query("select created_at, company_id from lineas_producto limit 0");
    await base().query("select estado, company_id from claims limit 0");
    await base().query("select nivel from memberships limit 0");
  });

  it("una sesión entrada_breve guarda su plan, y una respuesta guarda certeza, clave y de dónde lo sabíamos", async () => {
    await base().query("insert into interview_sessions (id, company_id, participant_id, tipo, plan) values ($1, $2, $3, 'entrada_breve', $4::jsonb)", [S, E, P, JSON.stringify(CLAVES_PLAN)]);
    const ses = await base().query<{ estado: string; plan: string[]; sintesis: unknown; sintesis_confirmada_at: string | null }>(`select ${COLUMNAS.interview_sessions} from interview_sessions where id = $1`, [S]);
    expect(ses.rows[0]).toMatchObject({ estado: "pendiente", plan: CLAVES_PLAN, sintesis: null, sintesis_confirmada_at: null });
    await base().query("insert into interview_responses (session_id, bloque, pregunta, clave_pregunta, sabida_por, orden, respuesta, certeza) values ($1, 'hoy', $2, $3, $4, 3, $5, 'no_lo_se')", [S, PLAN_POR_CLAVE.get("entrada.ventas_y_ganancia")!.texto, "entrada.ventas_y_ganancia", null, TEXTO_NO_LO_SE]);
    const fila3 = await base().query<{ certeza: string; clave_pregunta: string; respuesta: string }>("select certeza, clave_pregunta, respuesta from interview_responses where session_id = $1", [S]);
    expect(fila3.rows).toEqual([{ certeza: "no_lo_se", clave_pregunta: "entrada.ventas_y_ganancia", respuesta: TEXTO_NO_LO_SE }]);
    // Un «no lo sé» guardado no pone nada en los números de la empresa: la tabla sigue vacía.
    const numeros = await base().query<{ n: number }>("select count(*)::int as n from company_metricas where company_id = $1", [E]);
    expect(numeros.rows[0].n).toBe(0);
  });

  it("la base rechaza una certeza inventada y un tipo de sesión inventado", async () => {
    expect(await rechaza("insert into interview_responses (session_id, pregunta, certeza) values ($1, 'x', 'cero')", [S])).toMatch(/certeza/);
    expect(await rechaza("insert into interview_sessions (company_id, participant_id, tipo) values ($1, $2, 'entrada_larga')", [E, P])).toMatch(/tipo/);
  });

  it("la síntesis confirmada cabe en la sesión tal como la arma el código", async () => {
    const s = armarSintesis([fila({ clave_pregunta: CLAVES_PLAN[0], pregunta: PLAN_ENTRADA[0].texto, respuesta: "Vendo ropa.", certeza: "exacta" })], CLAVES_PLAN, { [CLAVES_PLAN[0]]: "esta_bien" });
    await base().query("update interview_sessions set estado = 'completa', sintesis = $2::jsonb, sintesis_confirmada_at = now() where id = $1", [S, JSON.stringify(s)]);
    const r = await base().query<{ sintesis: typeof s; sintesis_confirmada_at: string | null }>("select sintesis, sintesis_confirmada_at from interview_sessions where id = $1", [S]);
    expect(r.rows[0].sintesis.grupos[0].frases[0]).toMatchObject({ clave: CLAVES_PLAN[0], marca: "esta_bien", fuente: "Tus palabras en la entrada (pregunta 1)." });
    expect(r.rows[0].sintesis_confirmada_at).not.toBeNull();
  });
});
