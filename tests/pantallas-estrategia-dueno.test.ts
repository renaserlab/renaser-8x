/**
 * EL DUEÑO Y SU ESTRATEGIA (spec-estrategia-8x.md §7.3, §7.4, §8.2 y §9.3 · tramo 7), RENDERIZADO A HTML EN NODE.
 *
 * Lo que se fija:
 *  - «Tu plan» con un camino aprobado lo pinta arriba de todo: el título, por qué, los pasos con desde cuándo y quién,
 *    qué esperamos ver en rango y con «si» (con su origen), cómo sabremos y, como mucho, dos casos con lo que haremos.
 *    Sin el otro camino, sin ids, sin palabras del método, sin rayado y sin un «S/ 0» inventado;
 *  - sin camino aprobado, «Tu plan» es la de hoy (el mismo HTML que ve quien no lee la estrategia), y a la base solo se
 *    le pide la versión aprobada de SU empresa, con cuatro columnas; a una persona del equipo, nada;
 *  - una sola línea con las preguntas por responder, y solo si su pedido está abierto;
 *  - «Unas preguntas para afinar tu plan» (/portal/plan/preguntas): las enviadas de su empresa, una por tarjeta, con la
 *    caja de siempre o texto y «No lo sé»; abajo, plegado, lo ya respondido; «Listo, ya respondí» cuando no falta
 *    ninguna; vacía, con su texto; ni las propuestas, ni el porqué de la consultora, ni las de otra empresa;
 *  - la página vive dentro de «Tu plan» (sin destino nuevo) y en la fila sale solo con su pedido abierto.
 *
 * Cómo se prueba, para no llamar verificado a lo que no lo está: `supabaseAdmin()` es la base en memoria de
 * tests/fixtures/base-falsa.ts; la sesión y el contexto del portal los pone la prueba; la página del dueño sale del
 * armado de verdad (vistaParaDueno) con la empresa FICTICIA «Frutas del Valle» y las salidas falsas del modelo
 * (tests/fixtures/estrategia-falsa.ts). Lo que pasa al tocar (guardar al salir de la tarjeta, dictar, «Listo») no se
 * ejecuta aquí: la ruta que guarda está probada en tests/estrategia-api.test.ts. Nadie abrió esto en un navegador.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type BaseFalsa, type ErrorFalso, type Fila } from "./fixtures/base-falsa";
import { entradasFrutas, HOY, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, ROJO_BUENO } from "./fixtures/estrategia-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown, ruta: "/portal/plan", acciones: [] as unknown[] }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), perfilApi: vi.fn(), puedeAcceder: vi.fn(async () => true) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), redirect: () => {}, usePathname: () => estado.ruta }));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));
// El plan de cada semana tiene sus propias pruebas (tests/plan-intervencion.test.ts): aquí solo se mira dónde va.
vi.mock("@/lib/plan-intervencion", async (original) => ({ ...(await original<typeof import("@/lib/plan-intervencion")>()), cargarPlan: vi.fn(async () => ({ acciones: estado.acciones })) }));
vi.mock("@/components/cliente/PlanCliente", async () => {
  const { createElement: ce } = await import("react");
  return { PlanCliente: (p: { acciones: unknown[] }) => ce("div", { "data-plan-cliente": String(p.acciones.length) }) };
});

import { armarPaquete } from "@/lib/estrategia/paquete";
import { calcularTodo } from "@/lib/estrategia/calculos";
import { armarEstrategia, refsDeEstrategia } from "@/lib/estrategia/armar";
import { textoDePagina, vistaParaDueno, type ParaDueno } from "@/lib/estrategia/para-dueno";
import { palabrasQueElDuenoNoVe } from "@/lib/estrategia/validador";
import { CHIP_DUENO, PARA_DUENO, PORTAL, PREGUNTAS } from "@/lib/estrategia/textos";
import { COLUMNAS_PREGUNTA_DUENO } from "@/lib/estrategia/preguntas";
import { COLUMNAS_CAMINO_DUENO, esParaDueno } from "@/lib/estrategia/portal";
import { cuerpoDeRespuesta, diaDelCamino, faltanPorResponder, preguntaDesdeFila, respuestaEnTexto, type PreguntaDueno } from "@/lib/estrategia/dueno";
import { SECCION, pantallasSinPedido, PANTALLA_SOLO_CON_PEDIDO } from "@/lib/secciones";
import { porDefecto } from "@/lib/formato";

vi.setConfig({ testTimeout: 30_000 });

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Frutas del Valle (ficticia)
const OTRA = "0000000b-0000-4000-8000-00000000000b";
const DUENA = { id: "00000000-0000-4000-8000-0000000000a1", rol: "cliente", nombre: "Dueña" };
const PARTICIPANTE = { id: "00000000-0000-4000-8000-0000000000a2", rol: "cliente", nombre: "Equipo" };
const CONSULTORA = { id: "00000000-0000-4000-8000-0000000000c1", rol: "consultor", nombre: "Consultora" };
const APROBADA_AT = "2026-10-17T15:00:00.000Z";

/** Un id interno escrito en pantalla: «C:poder.precio», «SA2», «J3», «R:a.total.d90». */
const UN_ID = /\b(?:[NLGBKFPDQTZXCSR]:[A-Za-z0-9_]|S[ABR]\d|J\d\b)/;
/** Un cero en dinero que nadie dijo: «S/ 0» seguido de algo que no es un decimal. */
const CERO_INVENTADO = /S\/\s0(?![.,]?\d)/;
/** Lo que el dueño nunca lee: palabras del método y de la base (la misma barrera de tests/pantallas-entrar-hoy.test.ts). */
const PROHIBIDAS = /contribuci[oó]n|costo variable|\bSKU\b|matriz|\bKPI\b|claim|extra[ií]do|decisi[oó]n|INTERNO|\bIA\b/i;

// ─── La página del dueño, armada de verdad con la empresa ficticia ───────────────────────────────

function camino(letra: "a" | "b" = "a") {
  const entradas = entradasFrutas();
  const paquete = armarPaquete(entradas, HOY);
  const calculos = calcularTodo(entradas, HOY);
  const estrategia = armarEstrategia({ paquete, calculos, lenteDinero: structuredClone(LENTE_DINERO_BUENA), lenteTerreno: structuredClone(LENTE_TERRENO_BUENA), rojo: structuredClone(ROJO_BUENO) });
  return { p: vistaParaDueno(estrategia, letra, refsDeEstrategia(estrategia, paquete, calculos)), estrategia };
}
const A = camino("a");
const B = camino("b");

/** El texto que se lee, sin etiquetas ni espacios de más. */
const texto = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const estrategiaFila = (companyId: string, para_dueno: unknown, extra: Fila = {}): Fila => ({
  id: `e-${companyId.slice(-2)}-${String(extra.version ?? 1)}`,
  company_id: companyId,
  version: 1,
  estado: "aprobada",
  camino_elegido: "a",
  para_dueno,
  aprobada_at: APROBADA_AT,
  // Lo que el dueño nunca debe recibir: si llegara, la prueba lo vería en el HTML.
  vigente: { lectura: ["INTERNO de la consultora"] },
  calculos: { interno: true },
  ...extra,
});

const pregunta = (n: number, estadoP: string, unidad: string, textoP: string, extra: Fila = {}): Fila => ({
  id: `11111111-2222-4333-8444-${String(n).padStart(12, "0")}`,
  company_id: EMP,
  estrategia_id: "e-0a-1",
  clave: `clave_${n}`,
  texto: textoP,
  por_que: "POR QUE INTERNO para la consultora",
  unidad,
  estado: estadoP,
  espera: [{ version: 1, camino: "a", jugada: "J2" }],
  respuesta: null,
  respuesta_texto: null,
  respondida_at: null,
  created_at: `2026-10-17T1${n}:00:00.000Z`,
  ...extra,
});

const solicitud = (estadoS: "activa" | "completada" | "retirada", companyId = EMP): Fila => ({
  id: `s-preguntas-${estadoS}-${companyId.slice(-2)}`,
  company_id: companyId,
  seccion: "preguntas_estrategia",
  nota: PREGUNTAS.nota(2),
  estado: estadoS,
  activada_at: "2026-10-17T13:00:00.000Z",
  completada_at: estadoS === "completada" ? "2026-10-17T18:00:00.000Z" : null,
  retirada_at: estadoS === "retirada" ? "2026-10-17T18:00:00.000Z" : null,
  activada_por: CONSULTORA.id,
});

function base(extra: Record<string, Fila[]> = {}, fallos: Record<string, ErrorFalso> = {}): BaseFalsa {
  const b = crearBaseFalsa(
    {
      companies: [
        { id: EMP, nombre: "Frutas del Valle (ficticia)", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", ficha: {} },
        { id: OTRA, nombre: "Otra (ficticia)", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", ficha: {} },
      ],
      memberships: [
        { user_id: DUENA.id, company_id: EMP, nivel: "dueno" },
        { user_id: PARTICIPANTE.id, company_id: EMP, nivel: "participante" },
      ],
      company_assets: [],
      checkpoints: [],
      ...extra,
    },
    fallos
  );
  estado.base = b;
  estado.acciones = [];
  return b;
}
const como = (u: typeof DUENA) => (estado.portal = { companyId: EMP, queFalta: "", u });

/** Las veces que la página le pidió algo a una tabla, con qué columnas y con qué filtros. */
const lecturasDe = (b: BaseFalsa, tabla: string) => b.pedidos.filter((p) => p.tabla === tabla && p.op === "select");

async function plan(): Promise<string> {
  const { default: Plan } = await import("@/app/(cliente)/portal/plan/page");
  return renderToStaticMarkup(await Plan());
}
async function preguntas(): Promise<string> {
  const { default: Preguntas } = await import("@/app/(cliente)/portal/plan/preguntas/page");
  return renderToStaticMarkup(await Preguntas());
}

beforeAll(async () => {
  await Promise.all([
    import("@/app/(cliente)/portal/plan/page"),
    import("@/app/(cliente)/portal/plan/preguntas/page"),
    import("@/components/cliente/CaminoElegido"),
    import("@/components/cliente/EnEstaSeccion"),
  ]);
}, 180_000);

// ─────────────────────────── El camino que elegimos (CaminoElegido) ───────────────────────────

describe("CaminoElegido · la página del dueño, tal como se congeló al aprobar", () => {
  async function pintar(props: Partial<Parameters<typeof import("@/components/cliente/CaminoElegido").CaminoElegido>[0]> = {}) {
    const { CaminoElegido } = await import("@/components/cliente/CaminoElegido");
    return renderToStaticMarkup(createElement(CaminoElegido, { p: A.p, ...props }));
  }

  it("arriba, solo el camino y por qué; después los pasos, qué esperamos ver, cómo sabremos y si pasa esto", async () => {
    const html = await pintar({ desde: APROBADA_AT, zona: "America/Lima" });
    const t = texto(html);
    expect(html).toMatch(/<h1 id="t-camino"[^>]*>Cobrar antes de crecer<\/h1>/);
    expect(t).toContain(PARA_DUENO.titulo);
    expect(t).toContain("te deben S/ 45,000");
    // Las cuatro partes, en este orden: lo que se lee de arriba abajo.
    const orden = [PARA_DUENO.pasos, PARA_DUENO.esperamos, PARA_DUENO.como_sabremos, PARA_DUENO.si_pasa].map((x) => t.indexOf(x));
    expect(orden.every((i) => i > 0)).toBe(true);
    expect([...orden].sort((x, y) => x - y)).toEqual(orden);
    // Los pasos: uno por jugada, numerados, con desde cuándo (en días del calendario) y quién.
    expect(html.match(/<li><span class="pasos-camino__numero"/g) ?? []).toHaveLength(A.p.pasos.length);
    // En el orden en que se juegan (por su día de inicio).
    expect(A.p.pasos.map((x) => x.desde_dia)).toEqual([7, 7, 14, 14, 30]);
    expect(A.p.pasos[2]).toMatchObject({ desde_dia: 14, quien: "Marta" });
    // Día 1 = el día de la aprobación (17-10): el día 14 cae el 30 de octubre.
    expect(t).toContain(`${PORTAL.desde_el("30 de octubre")} · ${PORTAL.a_cargo_de("Marta")}`);
    // Como mucho dos casos, con calma y con lo que haremos.
    expect(html.match(/class="casos-camino__si"/g) ?? []).toHaveLength(2);
    expect(t).toContain(PORTAL.haremos);
  });

  it("qué esperamos ver: cuándo, la cifra sola en su línea grande con su origen, y el «si» al pie; la caja que se libera, aparte", async () => {
    const html = await pintar();
    const t = texto(html);
    expect(t).toContain(`${PARA_DUENO.desde_los(30).replace(/[:\s]+$/, "")} entre S/ 6,000 y S/ 9,200 ${CHIP_DUENO.supuesto} ${PARA_DUENO.mas_al_mes.trim()}`);
    expect(html).toMatch(/<p class="esperado__cifra"><b class="cifra">entre <span class="monto-dueno">S\/ 6,000<\/span> y <span class="monto-dueno">S\/ 9,200<\/span><\/b>/);
    expect(html).toMatch(/<p class="esperado__pie">más al mes, si se cumple lo que estimamos\.<\/p>/);
    // La caja que libera cobrar antes, a la vista del dueño (no escondida en un paso).
    expect(t).toContain(`${PARA_DUENO.caja_1.trim()} entre S/ 16,000 y S/ 32,000 (${CHIP_DUENO.supuesto}) ${PARA_DUENO.caja_2.trim()}`);
    expect(html).toContain(`<span class="estado espera">${CHIP_DUENO.supuesto}</span>`);
  });

  it("sin ids, sin «{{», sin palabras del método, sin el otro camino, sin rayado y sin un «S/ 0»", async () => {
    const html = await pintar({ desde: APROBADA_AT });
    const t = texto(html);
    expect(html).not.toContain("{{");
    expect(t).not.toMatch(UN_ID);
    expect(palabrasQueElDuenoNoVe(t)).toEqual([]);
    expect(t).not.toMatch(PROHIBIDAS);
    expect(t).not.toContain(B.p.titulo.map((x) => x.texto).join(""));
    expect(t).not.toContain(A.estrategia.caminos.b.nombre);
    expect(html).not.toMatch(/sin-dato|rayado|sin dato/);
    expect(t).not.toMatch(CERO_INVENTADO);
  });

  it("sin la fecha de aprobación (la vista previa, la biblioteca), los días se dicen «día N»; dentro de otra página, es un h2", async () => {
    const html = await pintar({ nivel: 2 });
    expect(texto(html)).toContain(PORTAL.desde_el_dia(14));
    expect(html).toMatch(/<h2 id="t-camino"/);
    expect(html).not.toMatch(/<h1/);
    expect(html).toMatch(/<h3 id="t-camino-pasos"/);
  });

  it("una sola línea con las preguntas por responder, solo con su pedido abierto; sin ellas, ninguna", async () => {
    const href = SECCION.preguntas_estrategia.href;
    const con = await pintar({ preguntas: { sin_responder: 2, abierta: true, href } });
    expect(texto(con)).toContain(PORTAL.preguntas_pendientes(2));
    expect(con).toContain(`href="${href}"`);
    expect(con.match(/camino-elegido__preguntas/g) ?? []).toHaveLength(1);
    expect(texto(await pintar({ preguntas: { sin_responder: 1, abierta: true, href } }))).toContain(PORTAL.preguntas_pendientes(1));
    for (const sin of [{ sin_responder: 0, abierta: true, href }, { sin_responder: 3, abierta: false, href }, null]) {
      expect(await pintar({ preguntas: sin })).not.toContain("camino-elegido__preguntas");
    }
  });

  it("si los números esperan respuestas, se dice; ya respondidas, no se le pide lo que ya hizo; cerradas, lo que falta de verdad", async () => {
    const p: ParaDueno = { ...A.p, esperamos: { d30: null, d90: null, falta: PARA_DUENO.falta_responder } };
    const href = SECCION.preguntas_estrategia.href;
    const { CaminoElegido } = await import("@/components/cliente/CaminoElegido");
    const pinta = (preguntas: Parameters<typeof CaminoElegido>[0]["preguntas"]) => texto(renderToStaticMarkup(createElement(CaminoElegido, { p, preguntas })));
    expect(pinta({ sin_responder: 2, abierta: true, href })).toContain(PARA_DUENO.falta_responder);
    expect(pinta({ sin_responder: 0, abierta: true, href })).toContain(PORTAL.ya_respondiste_numeros);
    expect(pinta({ sin_responder: 2, abierta: false, href })).toContain(PARA_DUENO.falta_datos);
    // Sin saber de las preguntas (la vista previa de la consultora), queda lo que se congeló.
    expect(pinta(null)).toContain(PARA_DUENO.falta_responder);
    // Y nunca un hueco rayado en «Qué esperamos ver».
    expect(renderToStaticMarkup(createElement(CaminoElegido, { p }))).not.toMatch(/sin-dato|rayado/);
  });

  it("lo que viene vacío no deja bloques vacíos", async () => {
    const p: ParaDueno = { ...A.p, como_sabremos: [], casos: [], te_pedimos: [] };
    const { CaminoElegido } = await import("@/components/cliente/CaminoElegido");
    const t = texto(renderToStaticMarkup(createElement(CaminoElegido, { p })));
    expect(t).not.toContain(PARA_DUENO.como_sabremos);
    expect(t).not.toContain(PARA_DUENO.si_pasa);
    expect(t).not.toContain(PARA_DUENO.te_pedimos);
    expect(t).toContain(PARA_DUENO.pasos);
  });
});

// ─────────────────────────── «Tu plan» (/portal/plan) ───────────────────────────

describe("dueño · /portal/plan con su camino", () => {
  it("con un camino aprobado: arriba de todo, con la línea de las preguntas; debajo, el plan de cada semana", async () => {
    const b = base({
      estrategias: [estrategiaFila(EMP, A.p), estrategiaFila(OTRA, B.p), estrategiaFila(EMP, B.p, { version: 2, estado: "lista", aprobada_at: null })],
      solicitudes_cliente: [solicitud("activa")],
      estrategia_preguntas: [pregunta(1, "enviada", "soles", "¿Cuánto vendiste el mes pasado?"), pregunta(2, "enviada", "dias", "¿A cuántos días te pagan?"), pregunta(3, "respondida", "texto", "¿Qué te frena?"), pregunta(4, "propuesta", "texto", "¿Propuesta sin enviar?"), { ...pregunta(5, "enviada", "texto", "¿De la otra empresa?"), company_id: OTRA }],
    });
    como(DUENA);
    const html = await plan();
    const t = texto(html);
    expect(html).toMatch(/<h1 id="t-camino"[^>]*>Cobrar antes de crecer<\/h1>/);
    expect(t).not.toContain("Ganar por el punto de la fruta");
    expect(t).not.toContain("INTERNO");
    expect(t).not.toContain("Tu plan se está armando");
    // Las dos enviadas de su empresa: ni la propuesta, ni la respondida, ni la de la otra empresa.
    expect(t).toContain(PORTAL.preguntas_pendientes(2));
    expect(html).toContain(`href="${SECCION.preguntas_estrategia.href}"`);
    // Debajo del camino, el plan de cada semana: todavía sin acciones, se dice qué viene.
    expect(html).toMatch(/<section class="plan-semanas"/);
    expect(t).toContain(PORTAL.sin_acciones);
    expect(html.indexOf("camino-elegido")).toBeLessThan(html.indexOf("plan-semanas"));
    // A la base, solo la aprobada de SU empresa y solo cuatro columnas.
    const lecturas = lecturasDe(b, "estrategias");
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]!.columnas).toBe(COLUMNAS_CAMINO_DUENO);
    expect(lecturas[0]!.filtros).toEqual(expect.arrayContaining([["eq", "company_id", EMP], ["eq", "estado", "aprobada"]]));
    expect(b.pedidos.some((p) => p.tabla === "estrategia_ediciones")).toBe(false);
  });

  it("con acciones aprobadas, el plan de cada semana va debajo del camino con su título", async () => {
    base({ estrategias: [estrategiaFila(EMP, A.p)] });
    estado.acciones = [{ id: "a1", estado_canonico: "aprobado" }, { id: "a2", estado_canonico: "verificado" }];
    como(DUENA);
    const html = await plan();
    expect(html).toMatch(/<h2 id="t-semanas" class="t-seccion mb-2">1 acción en marcha<\/h2>/);
    expect(html).toContain('data-plan-cliente="2"');
    expect(html.indexOf("camino-elegido")).toBeLessThan(html.indexOf("data-plan-cliente"));
    // Sin preguntas enviadas, no hay línea.
    expect(html).not.toContain("camino-elegido__preguntas");
  });

  it("con su pedido cerrado, no se le ofrece «Responder» aunque queden preguntas enviadas", async () => {
    base({ estrategias: [estrategiaFila(EMP, A.p)], solicitudes_cliente: [solicitud("completada")], estrategia_preguntas: [pregunta(1, "enviada", "soles", "¿Cuánto vendiste el mes pasado?")] });
    como(DUENA);
    expect(await plan()).not.toContain("camino-elegido__preguntas");
  });

  it("sin camino aprobado, la página es la de hoy: el mismo HTML que ve quien no lee la estrategia", async () => {
    base({ estrategias: [estrategiaFila(EMP, A.p, { estado: "lista", aprobada_at: null }), estrategiaFila(OTRA, B.p)] });
    como(PARTICIPANTE);
    const deHoy = await plan();
    expect(texto(deHoy)).toContain("Tu plan se está armando");
    como(DUENA);
    const html = await plan();
    expect(html).toBe(deHoy);
    expect(html).not.toContain("camino-elegido");
  });

  it("una persona del equipo no ve el camino, y a la base ni se le pide", async () => {
    const b = base({ estrategias: [estrategiaFila(EMP, A.p)], solicitudes_cliente: [solicitud("activa")], estrategia_preguntas: [pregunta(1, "enviada", "soles", "¿Cuánto vendiste el mes pasado?")] });
    como(PARTICIPANTE);
    const html = await plan();
    expect(html).not.toContain("camino-elegido");
    expect(texto(html)).toContain("Tu plan se está armando");
    expect(lecturasDe(b, "estrategias")).toHaveLength(0);
    expect(lecturasDe(b, "estrategia_preguntas")).toHaveLength(0);
  });

  it("la consultora que mira «como el empresario» ve lo mismo que el dueño", async () => {
    base({ estrategias: [estrategiaFila(EMP, A.p)] });
    como(CONSULTORA);
    expect(await plan()).toMatch(/<h1 id="t-camino"[^>]*>Cobrar antes de crecer<\/h1>/);
  });

  it("sin la migración de la estrategia, la de hoy sin aviso; si la lectura falla, se dice; un plan de otra versión de 8X, también", async () => {
    base({}, { estrategias: { code: "42P01", message: "relation \"estrategias\" does not exist" }, estrategia_preguntas: { code: "42P01", message: "no existe" } });
    como(PARTICIPANTE);
    const deHoy = await plan();
    como(DUENA);
    expect(await plan()).toBe(deHoy);

    base({}, { estrategias: { code: "XX000", message: "se cayó la conexión" } });
    const caida = texto(await plan());
    expect(caida).toContain(PORTAL.no_se_pudo_camino);
    expect(caida).not.toContain("se cayó la conexión");
    expect(caida).toContain("Tu plan se está armando");

    base({ estrategias: [estrategiaFila(EMP, { secciones: [{ titulo: "INTERNO de un plan viejo" }] })] });
    const vieja = texto(await plan());
    expect(vieja).toContain(PARA_DUENO.plan_anterior);
    expect(vieja).not.toContain("INTERNO");
  });

  it("solo lo que se congeló con la forma de esta versión se pinta (esParaDueno)", () => {
    expect(esParaDueno(A.p)).toBe(true);
    expect(esParaDueno(JSON.parse(JSON.stringify(B.p)))).toBe(true);
    expect(esParaDueno({ ...A.p, formato: "otro" })).toBe(false);
    expect(esParaDueno({ ...A.p, pasos: [{ que: "texto suelto" }] })).toBe(false);
    expect(esParaDueno({ ...A.p, titulo: [{ t: "cifra", texto: "S/ 1" }] })).toBe(false);
    expect(esParaDueno(null)).toBe(false);
  });
});

// ─────────────────────────── «Unas preguntas para afinar tu plan» (/portal/plan/preguntas) ───────────────────────────

describe("dueño · /portal/plan/preguntas", () => {
  const ENVIADAS = [
    pregunta(1, "enviada", "soles", "Cuando un cliente te compra, ¿cuánto gasta en esa compra?"),
    pregunta(2, "enviada", "de_cada_10", "De cada 10 clientes que te compran, ¿cuántos vuelven a comprarte?"),
    pregunta(3, "enviada", "texto", "¿Qué haría falta para que tu equipo cobre sin ti?"),
  ];
  const RESPONDIDA = pregunta(6, "respondida", "dias", "¿A cuántos días le pagas a tu proveedor principal?", { respuesta: { valor: 45, estado: "contado" }, respondida_at: "2026-10-17T16:00:00.000Z" });
  const OCULTAS = [
    pregunta(7, "propuesta", "texto", "¿Pregunta propuesta que la consultora todavía revisa?"),
    pregunta(8, "retirada", "texto", "¿Pregunta que la consultora retiró?"),
    { ...pregunta(9, "enviada", "texto", "¿Pregunta de la otra empresa?"), company_id: OTRA },
  ];

  it("las enviadas de su empresa, una por tarjeta, con su caja; lo respondido, plegado abajo; nada de lo que es de la consultora", async () => {
    const b = base({ solicitudes_cliente: [solicitud("activa")], estrategia_preguntas: [...ENVIADAS, RESPONDIDA, ...OCULTAS] });
    como(DUENA);
    const html = await preguntas();
    const t = texto(html);
    expect(html).toMatch(/<h1[^>]*>Unas preguntas para afinar tu plan<\/h1>/);
    expect(t).toContain(PORTAL.preguntas_intro);
    // Tres tarjetas por responder, numeradas; sus textos tal cual.
    expect(html.match(/<li class="pregunta-tarjeta"/g) ?? []).toHaveLength(4);
    for (let i = 1; i <= 3; i++) expect(t).toContain(PORTAL.pregunta_de(i, 3));
    for (const p of ENVIADAS) expect(t).toContain(String(p.texto));
    // La de dinero y la de «de cada 10», con la caja que acepta lo que se dice y «No lo sé»; la abierta, con texto.
    expect(html).toContain(`aria-label="${ENVIADAS[0]!.texto}"`);
    expect(html).toMatch(/<textarea aria-label="¿Qué haría falta para que tu equipo cobre sin ti\?"/);
    // Tres por responder y la respondida, que se corrige mientras el pedido siga abierto.
    expect(html.match(/>No lo sé</g) ?? []).toHaveLength(4);
    // Lo ya respondido, abajo y plegado, con su respuesta escrita como se lee.
    expect(html).toMatch(/<details class="plegado preguntas-dueno__respondidas"><summary>Ya respondiste \(1\)/);
    // Con el pedido abierto se corrige en su caja, prellenada con lo que dijo (la pregunta ya dice que son días).
    expect(html).toMatch(/aria-label="¿A cuántos días le pagas a tu proveedor principal\?"[^>]*value="45"|value="45"[^>]*aria-label="¿A cuántos días le pagas/);
    expect(t).toContain("Entendimos: 45");
    // Faltan tres: todavía no hay «Listo».
    expect(t).toContain(PORTAL.te_faltan(3));
    expect(t).not.toContain(PORTAL.listo);
    // Nada de la consultora ni de otra empresa.
    for (const p of OCULTAS) expect(t).not.toContain(String(p.texto));
    expect(t).not.toContain("POR QUE INTERNO");
    expect(html).not.toMatch(/clave_\d|J2/);
    expect(t).not.toMatch(PROHIBIDAS);
    // A la base, con las columnas del dueño y solo las enviadas o respondidas de su empresa.
    const lecturas = lecturasDe(b, "estrategia_preguntas");
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0]!.columnas).toBe(COLUMNAS_PREGUNTA_DUENO);
    expect(lecturas[0]!.filtros).toEqual(expect.arrayContaining([["eq", "company_id", EMP], ["in", "estado", ["enviada", "respondida"]]]));
  });

  it("respondidas todas, con el pedido abierto: «Listo, ya respondí»", async () => {
    base({
      solicitudes_cliente: [solicitud("activa")],
      estrategia_preguntas: [RESPONDIDA, pregunta(2, "respondida", "de_cada_10", "De cada 10 clientes que te compran, ¿cuántos vuelven a comprarte?", { respuesta: { estado: "no_lo_se" } })],
    });
    como(DUENA);
    const html = await preguntas();
    const t = texto(html);
    expect(t).toContain(PORTAL.listo);
    expect(t).toContain("No lo sé");
    // Sin nada por responder, lo respondido se ve abierto: es todo lo que hay.
    expect(html).toMatch(/<details class="plegado preguntas-dueno__respondidas" open="">/);
  });

  it("con el pedido ya avisado: se lee lo respondido, sin cajas, y cuándo se le avisó", async () => {
    base({ solicitudes_cliente: [solicitud("completada")], estrategia_preguntas: [RESPONDIDA] });
    como(DUENA);
    const html = await preguntas();
    expect(html).not.toMatch(/<input|<textarea/);
    expect(texto(html)).toContain("Se lo hiciste saber a tu consultora el 17 de octubre");
    expect(texto(html)).toContain(`${PORTAL.tu_respuesta}: 45 días`);
  });

  it("si su consultora cerró las preguntas, se dice, y no hay cajas", async () => {
    base({ solicitudes_cliente: [solicitud("retirada")], estrategia_preguntas: [ENVIADAS[0]!] });
    como(DUENA);
    const html = await preguntas();
    expect(texto(html)).toContain(PORTAL.preguntas_cerradas);
    expect(html).not.toMatch(/<input|<textarea/);
  });

  it("vacía, con su texto; sin la migración, que se está preparando", async () => {
    base({ solicitudes_cliente: [solicitud("activa")] });
    como(DUENA);
    expect(texto(await preguntas())).toContain(PORTAL.preguntas_vacia);
    base({}, { estrategia_preguntas: { code: "42P01", message: "no existe" } });
    expect(texto(await preguntas())).toContain(PORTAL.preguntas_sin_preparar);
  });

  it("una persona del equipo no las lee: son de quien dirige, y a la base ni se le piden", async () => {
    const b = base({ solicitudes_cliente: [solicitud("activa")], estrategia_preguntas: ENVIADAS });
    como(PARTICIPANTE);
    const t = texto(await preguntas());
    expect(t).toContain(PREGUNTAS.solo_quien_dirige);
    for (const p of ENVIADAS) expect(t).not.toContain(String(p.texto));
    expect(lecturasDe(b, "estrategia_preguntas")).toHaveLength(0);
  });

  it("la consultora que mira «como el empresario» las ve sin cajas: no responde por él", async () => {
    base({ solicitudes_cliente: [solicitud("activa")], estrategia_preguntas: ENVIADAS });
    como(CONSULTORA);
    const html = await preguntas();
    expect(texto(html)).toContain(PORTAL.como_consultora);
    expect(html).not.toMatch(/<input|<textarea/);
    expect(texto(html)).toContain(String(ENVIADAS[0]!.texto));
  });
});

// ─────────────────────────── Lo que la pantalla manda y cómo lee ───────────────────────────

describe("las piezas de la pantalla de preguntas (src/lib/estrategia/dueno.ts)", () => {
  const p = (extra: Partial<PreguntaDueno>): PreguntaDueno => ({ id: "x", texto: "¿Algo?", unidad: "texto", estado: "enviada", respuesta: null, respuesta_texto: null, respondida_at: null, ...extra });

  it("una fila se lee como pregunta del dueño solo si está enviada o respondida; lo que no se entiende no es respuesta", () => {
    expect(preguntaDesdeFila({ id: "a", texto: "¿Algo?", unidad: "dias", estado: "propuesta" })).toBeNull();
    expect(preguntaDesdeFila({ id: "a", texto: "¿Algo?", unidad: "dias", estado: "retirada" })).toBeNull();
    expect(preguntaDesdeFila({ id: "a", texto: "  ", unidad: "dias", estado: "enviada" })).toBeNull();
    expect(preguntaDesdeFila({ id: "a", texto: "¿Algo?", unidad: "rara", estado: "enviada" })?.unidad).toBe("texto");
    expect(preguntaDesdeFila({ id: "a", texto: "¿Algo?", unidad: "dias", estado: "respondida", respuesta: { valor: 3, desde: 1, hasta: 2, estado: "contado" } })?.respuesta).toBeNull();
    expect(preguntaDesdeFila({ id: "a", texto: "¿Algo?", unidad: "dias", estado: "respondida", respuesta: { desde: 30, hasta: 45, estado: "estimado" } })?.respuesta).toEqual({ desde: 30, hasta: 45, estado: "estimado" });
  });

  it("la respuesta se escribe con su unidad; un «no lo sé» se dice; lo que no se respondió no se escribe", () => {
    expect(respuestaEnTexto(p({ unidad: "soles", respuesta: { valor: 4000, estado: "estimado" } }), porDefecto)).toBe("S/ 4,000");
    expect(respuestaEnTexto(p({ unidad: "soles", respuesta: { desde: 3000, hasta: 5000, estado: "estimado" } }), porDefecto)).toBe("entre S/ 3,000 y S/ 5,000");
    expect(respuestaEnTexto(p({ unidad: "de_cada_10", respuesta: { desde: 3, hasta: 4, estado: "estimado" } }))).toBe("entre 3 y 4 de cada 10");
    expect(respuestaEnTexto(p({ unidad: "dias", respuesta: { valor: 1, estado: "contado" } }))).toBe("1 día");
    expect(respuestaEnTexto(p({ unidad: "veces_mes", respuesta: { valor: 2, estado: "contado" } }))).toBe("2 veces al mes");
    expect(respuestaEnTexto(p({ unidad: "horas_semana", respuesta: { valor: 50, estado: "estimado" } }))).toBe("50 horas a la semana");
    expect(respuestaEnTexto(p({ unidad: "dias", respuesta: { estado: "no_lo_se" } }))).toBe("No lo sé");
    expect(respuestaEnTexto(p({ unidad: "texto", respuesta_texto: "Que alguien más firme" }))).toBe("Que alguien más firme");
    expect(respuestaEnTexto(p({ unidad: "dias" }))).toBeNull();
  });

  it("lo que se manda a la ruta: un dato dicho para un número, texto para una pregunta abierta; vacío no se manda", () => {
    expect(cuerpoDeRespuesta("dias", { dato: { valor: 30, estado: "contado" } })).toEqual({ respuesta: { valor: 30, estado: "contado" } });
    expect(cuerpoDeRespuesta("dias", { dato: null })).toBeNull();
    expect(cuerpoDeRespuesta("texto", { texto: "  Que firme otra persona " })).toEqual({ respuesta_texto: "Que firme otra persona" });
    expect(cuerpoDeRespuesta("texto", { texto: "   " })).toBeNull();
    expect(faltanPorResponder([p({}), p({ estado: "respondida" }), p({})])).toBe(2);
  });

  it("el día N del camino es un día del calendario, contado desde la aprobación (día 1) en la zona de la empresa", () => {
    expect(diaDelCamino(APROBADA_AT, 1, "America/Lima")).toBe("17 de octubre");
    expect(diaDelCamino(APROBADA_AT, 14, "America/Lima")).toBe("30 de octubre");
    expect(diaDelCamino(APROBADA_AT, 90, "America/Lima")).toBe("14 de enero");
    // Aprobada a las 23:30 de Lima (ya 18 en UTC): sigue siendo el 17 en la empresa.
    expect(diaDelCamino("2026-10-18T04:30:00.000Z", 1, "America/Lima")).toBe("17 de octubre");
    expect(diaDelCamino(null, 14)).toBeNull();
    expect(diaDelCamino("no es fecha", 14)).toBeNull();
  });
});

// ─────────────────────────── Dentro de «Tu plan», sin destino nuevo ───────────────────────────

describe("las preguntas viven dentro de «Tu plan» y salen en su fila solo con su pedido abierto", () => {
  it("la sección lleva a su página, que existe, y solo el envío de preguntas la abre (no hay casilla)", async () => {
    expect(SECCION.preguntas_estrategia.href).toBe("/portal/plan/preguntas");
    expect(PANTALLA_SOLO_CON_PEDIDO).toEqual({ "/portal/plan/preguntas": "preguntas_estrategia" });
    const { SECCIONES_QUE_ACTIVA_LA_CONSULTORA } = await import("@/lib/secciones");
    expect(SECCIONES_QUE_ACTIVA_LA_CONSULTORA).not.toContain("preguntas_estrategia");
  });

  it("pantallasSinPedido: sin su pedido abierto se esconde; abierto, no; sin saber qué está abierto, no se esconde nada", () => {
    expect(pantallasSinPedido([])).toEqual(["/portal/plan/preguntas"]);
    expect(pantallasSinPedido(["costos", "productos"])).toEqual(["/portal/plan/preguntas"]);
    expect(pantallasSinPedido(["preguntas_estrategia"])).toEqual([]);
    expect(pantallasSinPedido(null)).toEqual([]);
  });

  it("en la fila de «Tu plan», «Preguntas para tu plan» va primero; oculta, no sale salvo en su propia pantalla", async () => {
    const { EnEstaSeccion } = await import("@/components/cliente/EnEstaSeccion");
    estado.ruta = "/portal/plan";
    const abierta = renderToStaticMarkup(createElement(EnEstaSeccion, {}));
    expect(abierta).toMatch(/<nav[^>]*><a [^>]*href="\/portal\/plan\/preguntas"[^>]*>Preguntas para tu plan<\/a>/);
    const oculta = renderToStaticMarkup(createElement(EnEstaSeccion, { ocultar: ["/portal/plan/preguntas"] }));
    expect(oculta).not.toContain("/portal/plan/preguntas");
    expect(oculta).toContain('href="/portal/semana"');
    estado.ruta = "/portal/plan/preguntas";
    const enElla = renderToStaticMarkup(createElement(EnEstaSeccion, { ocultar: ["/portal/plan/preguntas"] }));
    expect(enElla.match(/<a [^>]*href="\/portal\/plan\/preguntas"[^>]*>/)?.[0]).toContain('aria-current="page"');
    estado.ruta = "/portal/plan";
  });

  it("ningún texto de estas pantallas usa palabras del método ni trae una cifra de ejemplo", () => {
    const muestras = Object.values(PORTAL).map((v) => (typeof v === "function" ? (v as (x: never) => string)(2 as never) : v));
    for (const t of muestras) {
      expect(palabrasQueElDuenoNoVe(t), t).toEqual([]);
      expect(t, t).not.toMatch(PROHIBIDAS);
      expect(t, t).not.toMatch(/por ejemplo|\bplata\b/i);
    }
    // La página entera del dueño, armada de verdad, tampoco.
    expect(palabrasQueElDuenoNoVe(textoDePagina(A.p))).toEqual([]);
  });
});
