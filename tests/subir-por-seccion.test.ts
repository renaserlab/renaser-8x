/**
 * SUBIR EN CADA PARTE (16-10-2026): organigrama, manuales y procesos, cada uno donde corresponde.
 *
 * Kelin: «después debe poder subir sus archivos en cada parte que corresponde: si tiene organigrama, manuales; si está
 * dibujando procesos, subir sus archivos allí, importarlo y dibujarlo para mejorarlo».
 *
 * Lo que se fija:
 *  - crear un proceso «sin dibujar» para colgarle su archivo: el dueño o un líder, nunca un participante; un nombre
 *    repetido no duplica; sin la migración, 409 sin crear nada;
 *  - dibujarlo con el archivo: fuente ajena 403, sin leer 409, sin texto 409, recorte a 8.000 avisado, encolado con la
 *    prioridad de dibujar un proceso, y lo ya dibujado no se pisa sin confirmar;
 *  - el trabajo de dibujo sobre un «sin dibujar» deja UN proceso, no dos;
 *  - importar la lista: el cliente solo con «subir_procesos» abierta;
 *  - la franja «Lo que subió la empresa» del Organigrama lista solo lo de esa empresa, con su estado;
 *  - las pantallas: lo subido por dibujar con su estado, el importador solo con la sección abierta, sin «IA» para el
 *    dueño.
 *
 * Cómo se prueba, para no llamar verificado a lo que no lo está: `supabaseAdmin()` es la base en memoria de
 * tests/fixtures/base-falsa.ts (no Supabase, no PostgREST, sin disparadores: que el primer paso pase el proceso a AS-IS
 * lo prueba PGlite en tests/procesos-importar.test.ts); la sesión la pone la prueba; el modelo que dibuja es un doble.
 * Las pantallas se renderizan a HTML en Node: nadie las abrió en un navegador, y subir un archivo, mandar a dibujar o
 * abrir el panel del archivo no se ejecutan aquí. Las empresas son FICTICIAS.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type BaseFalsa, type Fila } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  perfilApi: vi.fn(),
  // Pertenencia de verdad, sobre la base en memoria: la consultora entra a todas; el cliente, a las suyas.
  puedeAcceder: vi.fn(async (perfil: { id: string; rol: string }, companyId: string) => {
    if (perfil.rol === "consultor") return true;
    const b = estado.base as BaseFalsa;
    return (b.tablas.memberships ?? []).some((m) => m.user_id === perfil.id && m.company_id === companyId);
  }),
}));
vi.mock("@/lib/auditoria", async (original) => ({ ...(await original<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/portal/procesos",
  redirect: () => {},
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));
// El lienzo (React Flow) y el estudio del organigrama no son de este encargo: se reemplazan por una marca para mirar
// solo lo que se construyó aquí alrededor de ellos.
vi.mock("@/components/canvas/Canvas", () => ({ Canvas: () => createElement("div", { "data-lienzo": "si" }) }));
vi.mock("@/components/consultor/Organigrama", () => ({ Organigrama: () => createElement("div", { "data-organigrama": "si" }) }));
// El modelo que dibuja es un doble: devuelve un flujo fijo. Lo que se prueba es dónde se guarda, no cómo dibuja.
vi.mock("@/lib/ai/agents/arquitecto", () => ({
  correrArquitecto: vi.fn(async () => ({
    data: {
      nombre: "Lo que puso el modelo",
      nodos: [
        { id: "a", tipo: "inicio", etiqueta: "Llega el pedido" },
        { id: "b", tipo: "actividad", etiqueta: "Se arma el pedido" },
        { id: "c", tipo: "fin", etiqueta: "Pedido entregado" },
      ],
      conexiones: [{ de: "a", a: "b" }, { de: "b", a: "c" }],
    },
    tokens_entrada: 1,
    tokens_salida: 1,
    modelo: "doble",
    latencia_ms: 1,
  })),
  correrToBe: vi.fn(),
  correrSop: vi.fn(),
}));
vi.mock("@/lib/db/queries", async (original) => ({ ...(await original<typeof import("@/lib/db/queries")>()), registrarLlamada: vi.fn(async () => {}) }));

import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { PRIORIDAD } from "@/lib/jobs/queue";
import { TEXTO_SECCION_CERRADA } from "@/lib/secciones";
import { MAX_TEXTO_DIBUJO, TEXTOS_DIBUJO, armarDescripcion, estadoSubida, loQueYaSeSabia, normalizarNombre, rotuloSubida, textoDeFuente } from "@/components/procesos/subidas";

vi.setConfig({ testTimeout: 30_000 });

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Pedidos del Sol (ficticia)
const OTRA = "0000000b-0000-4000-8000-00000000000b"; // Otra empresa (ficticia)
const CONSULTORA: Perfil = { id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@prueba.local", nombre: "Consultora", rol: "consultor" };
const DUENA: Perfil = { id: "00000000-0000-4000-8000-0000000000a1", email: "duena@prueba.local", nombre: "Dueña", rol: "cliente" };
const LIDER: Perfil = { id: "00000000-0000-4000-8000-0000000000a3", email: "lider@prueba.local", nombre: "Líder", rol: "cliente" };
const PARTICIPANTE: Perfil = { id: "00000000-0000-4000-8000-0000000000a2", email: "equipo@prueba.local", nombre: "Equipo", rol: "cliente" };
const AJENA: Perfil = { id: "00000000-0000-4000-8000-0000000000b1", email: "ajena@prueba.local", nombre: "Dueña de otra", rol: "cliente" };

const P1 = "11111111-1111-4111-8111-000000000001"; // sin dibujar, con su archivo
const P2 = "11111111-1111-4111-8111-000000000002"; // sin dibujar, de la lista, sin archivo
const P3 = "11111111-1111-4111-8111-000000000003"; // de otra empresa
const PT = "11111111-1111-4111-8111-000000000004"; // un TO-BE
const S1 = "22222222-2222-4222-8222-000000000001"; // el archivo de P1
const S2 = "22222222-2222-4222-8222-000000000002"; // un archivo de otro proceso de la empresa
const S3 = "22222222-2222-4222-8222-000000000003"; // un archivo de otra empresa
const S_ORG = "22222222-2222-4222-8222-000000000010";
const S_ORG_OTRA = "22222222-2222-4222-8222-000000000011";

const proceso = (id: string, extra: Fila = {}): Fila => ({
  id,
  company_id: EMP,
  nombre: "Atención de pedidos",
  area: null,
  version: "sin_dibujar",
  origen: "importado",
  padre_id: null,
  confirmacion: "borrador",
  descripcion_original: null,
  created_at: "2026-10-16T13:00:00.000Z",
  ...extra,
});
const fuente = (id: string, extra: Fila = {}): Fila => ({
  id,
  company_id: EMP,
  process_id: P1,
  nombre: "pedidos-cuaderno.pdf",
  tipo: "documento",
  estado: "leido",
  revision: "pendiente",
  origen: "cliente",
  contenido: "Llega el pedido por WhatsApp. Rosa lo anota en el cuaderno. Se arma y se entrega.",
  created_at: "2026-10-16T14:00:00.000Z",
  ...extra,
});

/** Una empresa con su dueña, una líder y una participante, y otra empresa con su dueña; más lo que se le pase. */
function base(extra: Record<string, Fila[]> = {}): BaseFalsa {
  const b = crearBaseFalsa({
    companies: [
      { id: EMP, nombre: "Pedidos del Sol (ficticia)", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" },
      { id: OTRA, nombre: "Otra (ficticia)", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" },
    ],
    memberships: [
      { user_id: DUENA.id, company_id: EMP, nivel: "dueno" },
      { user_id: LIDER.id, company_id: EMP, nivel: "lider" },
      { user_id: PARTICIPANTE.id, company_id: EMP, nivel: "participante" },
      { user_id: AJENA.id, company_id: OTRA, nivel: "dueno" },
    ],
    ...extra,
  });
  estado.base = b;
  return b;
}
const solicitud = (seccion: string, extra: Fila = {}): Fila => ({
  id: `33333333-3333-4333-8333-${seccion.length.toString().padStart(12, "0")}`,
  company_id: EMP,
  seccion,
  nota: null,
  estado: "activa",
  activada_at: "2026-10-16T13:00:00.000Z",
  completada_at: null,
  retirada_at: null,
  activada_por: CONSULTORA.id,
  ...extra,
});

const como = (p: Perfil) => vi.mocked(perfilApi).mockResolvedValue(p);
type Respuesta = { status: number; body: Record<string, unknown> };
type Manejador = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

async function crear(cuerpo: unknown, empresa = EMP): Promise<Respuesta> {
  const { POST } = await import("@/app/api/companies/[id]/procesos/route");
  const res = await (POST as unknown as Manejador)(
    new Request(`http://8x.test/api/companies/${empresa}/procesos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }),
    { params: Promise.resolve({ id: empresa }) }
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function dibujar(processId: string, cuerpo: unknown): Promise<Respuesta> {
  const { POST } = await import("@/app/api/processes/[id]/dibujar/route");
  const res = await (POST as unknown as Manejador)(
    new Request(`http://8x.test/api/processes/${processId}/dibujar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }),
    { params: Promise.resolve({ id: processId }) }
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const CSV = "Proceso;Área;Responsable\nApertura de caja;Tienda;Rosa\nCompra de mercadería;Compras;Gerente\n";
async function importar(modo: "vista_previa" | "confirmar", empresa = EMP): Promise<Respuesta> {
  const { POST } = await import("@/app/api/companies/[id]/procesos/importar/route");
  const form = new FormData();
  form.set("archivo", new File([CSV], "procesos.csv", { type: "text/csv" }));
  form.set("modo", modo);
  const res = await (POST as unknown as Manejador)(new Request(`http://8x.test/api/companies/${empresa}/procesos/importar`, { method: "POST", body: form }), { params: Promise.resolve({ id: empresa }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const insertsEn = (b: BaseFalsa, tabla: string) => b.pedidos.filter((p) => p.tabla === tabla && (p.op === "insert" || p.op === "upsert"));
const denegado = () => vi.mocked(registrar).mock.calls.some(([e]) => e.accion === "denegado");

beforeAll(async () => {
  delete process.env.WORKER_DRAIN_SECRET; // encolar no despierta a nadie por la red
  await Promise.all([
    import("@/app/api/companies/[id]/procesos/route"),
    import("@/app/api/processes/[id]/dibujar/route"),
    import("@/app/api/companies/[id]/procesos/importar/route"),
    import("@/app/(cliente)/portal/procesos/page"),
    import("@/app/(cliente)/portal/procesos/[p]/page"),
    import("@/app/(consultor)/empresa/[id]/procesos/page"),
    import("@/app/(consultor)/empresa/[id]/organigrama/page"),
    import("@/lib/jobs/handlers/procesos"),
  ]);
}, 180_000);

beforeEach(() => {
  vi.mocked(perfilApi).mockReset();
  vi.mocked(registrar).mockClear();
});

// ─────────────────────── Lo puro ───────────────────────

describe("subidas.ts · los estados de un archivo y el texto que se dibuja", () => {
  it("subido mientras se lee; por revisar solo un documento o una tabla pendiente; listo lo demás; error se dice", () => {
    expect(estadoSubida({ tipo: "documento", estado: "subido", revision: null })).toBe("subido");
    expect(estadoSubida({ tipo: "foto", estado: "leyendo", revision: null })).toBe("subido");
    expect(estadoSubida({ tipo: "documento", estado: "leido", revision: "pendiente" })).toBe("por_revisar");
    expect(estadoSubida({ tipo: "dato", estado: "leido", revision: "pendiente" })).toBe("por_revisar");
    expect(estadoSubida({ tipo: "documento", estado: "leido", revision: "consolidada" })).toBe("listo");
    expect(estadoSubida({ tipo: "foto", estado: "leido", revision: null })).toBe("listo"); // una foto no pasa por revisión
    expect(estadoSubida({ tipo: "documento", estado: "error", revision: "pendiente" })).toBe("no_se_pudo");
    // Para dibujar, al dueño le importa si ya se puede: leído = listo para dibujar, esté o no revisado.
    expect(rotuloSubida("por_revisar", "dueno", "dibujar").texto).toBe("Leído: listo para dibujar");
    expect(rotuloSubida("subido", "dueno", "dibujar").texto).toBe("Subido: lo estamos leyendo");
    expect(rotuloSubida("por_revisar", "consultora", "documento")).toEqual({ texto: "Por revisar", clase: "espera" });
    expect(rotuloSubida("no_se_pudo", "dueno").clase).toBe("alto");
  });

  it("el texto de la fuente: su contenido, o los fragmentos por página y minuto, sin repetir; vacío si no hay", () => {
    expect(textoDeFuente("  Hola  ", [{ texto: "otra cosa", pagina: 1 }])).toBe("Hola");
    expect(textoDeFuente(null, [{ texto: "B", pagina: 2 }, { texto: "C", pagina: null }, { texto: "A", pagina: 1 }, { texto: "A", pagina: 1 }, { texto: "  ", pagina: 3 }])).toBe("A\nB\nC");
    expect(textoDeFuente("", [])).toBe("");
    expect(textoDeFuente(null, [{ texto: null, pagina: 1 }])).toBe("");
  });

  it("la descripción nunca pasa de 8.000 letras, lleva lo que ya se sabía y no anida una descripción armada antes", () => {
    const corta = armarDescripcion({ nombre: "Atención de pedidos", previa: "De la lista: se atiende por WhatsApp", archivo: "a.pdf", texto: "Paso uno. Paso dos." });
    expect(corta.recortado).toBe(false);
    expect(corta.descripcion).toBe("Proceso: «Atención de pedidos».\n\nLo que ya se sabía de este proceso:\nDe la lista: se atiende por WhatsApp\n\nLo que dice el archivo «a.pdf»:\nPaso uno. Paso dos.");
    expect(loQueYaSeSabia(corta.descripcion)).toBe("De la lista: se atiende por WhatsApp");
    const otraVez = armarDescripcion({ nombre: "Atención de pedidos", previa: corta.descripcion, archivo: "b.pdf", texto: "Nuevo" });
    expect(otraVez.descripcion.match(/Lo que ya se sabía/g)).toHaveLength(1);
    expect(otraVez.descripcion).not.toContain("Paso uno"); // el archivo anterior no se arrastra
    const larga = armarDescripcion({ nombre: "X", archivo: "c.docx", texto: "a".repeat(9000) });
    expect(larga.recortado).toBe(true);
    expect(larga.descripcion.length).toBe(MAX_TEXTO_DIBUJO);
    expect(larga.letrasArchivo).toBe(9000);
    expect(normalizarNombre("  Atención_de   PEDIDOS ")).toBe("atencion de pedidos");
  });
});

// ─────────────────────── Crear sin dibujar ───────────────────────

describe("POST /api/companies/[id]/procesos · crear el proceso sin dibujar para colgarle su archivo", () => {
  it("la dueña lo crea: sin dibujar, importado, en borrador, sin fuentes en la fila; y queda en el rastro", async () => {
    const b = base();
    como(DUENA);
    const r = await crear({ nombre: "Atención de pedidos" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ existia: false, version: "sin_dibujar" });
    expect(b.tablas.processes).toHaveLength(1);
    expect(b.tablas.processes![0]).toMatchObject({ id: r.body.process_id, company_id: EMP, nombre: "Atención de pedidos", version: "sin_dibujar", origen: "importado", confirmacion: "borrador", fuentes_usadas: [] });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ companyId: EMP, accion: "crear", entidad: "processes", detalle: expect.objectContaining({ por: "cliente", version: "sin_dibujar" }) }));
  });

  it("una líder y la consultora también; una participante no (403, nada escrito); alguien de otra empresa tampoco", async () => {
    let b = base();
    como(LIDER);
    expect((await crear({ nombre: "Cierre de caja" })).status).toBe(201);
    como(CONSULTORA);
    expect((await crear({ nombre: "Compras" })).status).toBe(201);
    expect(b.tablas.processes).toHaveLength(2);

    b = base();
    como(PARTICIPANTE);
    const p = await crear({ nombre: "Atención de pedidos" });
    expect(p).toMatchObject({ status: 403, body: { error: TEXTOS_DIBUJO.soloDuenoOLider } });
    como(AJENA);
    expect((await crear({ nombre: "Atención de pedidos" })).status).toBe(403);
    expect(insertsEn(b, "processes")).toEqual([]);
    expect(denegado()).toBe(true);
  });

  it("un nombre que ya existe (sin mayúsculas ni tildes) no se duplica: devuelve ese proceso; un TO-BE con ese nombre no cuenta", async () => {
    const b = base({ processes: [proceso(P1, { nombre: "Atención de Pedidos", version: "as_is", origen: "dibujado" }), proceso(PT, { nombre: "Cierre de caja", version: "to_be", padre_id: P2 })] });
    como(DUENA);
    const r = await crear({ nombre: "atencion de pedidos" });
    expect(r).toMatchObject({ status: 200, body: { process_id: P1, existia: true, version: "as_is" } });
    expect(insertsEn(b, "processes")).toEqual([]);
    const t = await crear({ nombre: "Cierre de caja" });
    expect(t).toMatchObject({ status: 201, body: { existia: false } });
  });

  it("sin la migración (la base rechaza «sin dibujar» con 23514): 409 sin crear nada; la consultora lee qué falta, el dueño no ve nombres de archivos", async () => {
    const b = base();
    const from = b.from;
    estado.base = {
      ...b,
      from: (tabla: string) => {
        const q = from(tabla);
        if (tabla === "processes") (q as unknown as Record<string, unknown>).insert = () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23514", message: "violates check constraint" } }) }) });
        return q;
      },
    };
    como(CONSULTORA);
    const c = await crear({ nombre: "Atención de pedidos" });
    expect(c.status).toBe(409);
    expect(c.body.error).toContain("falta aplicar supabase/migracion-procesos-importados.sql");
    como(DUENA);
    const d = await crear({ nombre: "Atención de pedidos" });
    expect(d.status).toBe(409);
    expect(String(d.body.error)).not.toMatch(/supabase|migraci/);
    expect(b.tablas.processes ?? []).toEqual([]);
  });

  it("sin nombre o con un nombre de párrafo: 400, nada escrito", async () => {
    const b = base();
    como(DUENA);
    expect((await crear({})).status).toBe(400);
    expect((await crear({ nombre: "x".repeat(121) })).status).toBe(400);
    expect(insertsEn(b, "processes")).toEqual([]);
  });
});

// ─────────────────────── Dibujar con el archivo ───────────────────────

describe("POST /api/processes/[id]/dibujar · dibujarlo con lo que se subió", () => {
  const conProcesos = (extra: Record<string, Fila[]> = {}) =>
    base({
      processes: [proceso(P1), proceso(P2, { nombre: "Compras" }), proceso(P3, { company_id: OTRA, nombre: "Ajeno" }), proceso(PT, { version: "to_be", padre_id: P1 })],
      sources: [fuente(S1), fuente(S2, { process_id: P2, nombre: "compras.pdf" }), fuente(S3, { company_id: OTRA, process_id: P3, nombre: "ajeno.pdf" })],
      ...extra,
    });

  it("encola el dibujo de ESE proceso con la prioridad de dibujar un proceso, y responde el trabajo", async () => {
    const b = conProcesos();
    como(DUENA);
    const r = await dibujar(P1, { source_id: S1 });
    expect(r).toMatchObject({ status: 200, body: { recortado: false } });
    expect(r.body.aviso).toBeUndefined();
    const jobs = b.tablas.jobs ?? [];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: r.body.job_id, company_id: EMP, tipo: "generar_proceso", prioridad: PRIORIDAD.proceso_voz });
    const payload = jobs[0].payload as { descripcion: string; process_id: string };
    expect(payload.process_id).toBe(P1);
    expect(payload.descripcion).toBe("Proceso: «Atención de pedidos».\n\nLo que dice el archivo «pedidos-cuaderno.pdf»:\nLlega el pedido por WhatsApp. Rosa lo anota en el cuaderno. Se arma y se entrega.");
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ companyId: EMP, entidadId: P1, detalle: expect.objectContaining({ que: "dibujar_desde_archivo", source_id: S1 }) }));
  });

  it("una fuente de otro proceso o de otra empresa: 403, queda como acceso denegado y no se encola nada", async () => {
    const b = conProcesos();
    como(DUENA);
    expect(await dibujar(P1, { source_id: S2 })).toMatchObject({ status: 403, body: { error: TEXTOS_DIBUJO.ajeno } });
    como(CONSULTORA);
    expect(await dibujar(P1, { source_id: S3 })).toMatchObject({ status: 403, body: { error: TEXTOS_DIBUJO.ajeno } });
    expect(await dibujar(P1, { source_id: "22222222-2222-4222-8222-0000000000ff" })).toMatchObject({ status: 403 });
    expect(denegado()).toBe(true);
    expect(b.tablas.jobs ?? []).toEqual([]);
  });

  it("un proceso de otra empresa no se dibuja desde aquí (403); una participante tampoco; un TO-BE, 409", async () => {
    const b = conProcesos();
    como(DUENA);
    expect((await dibujar(P3, { source_id: S3 })).status).toBe(403);
    como(PARTICIPANTE);
    expect(await dibujar(P1, { source_id: S1 })).toMatchObject({ status: 403, body: { error: TEXTOS_DIBUJO.soloDuenoOLider } });
    como(CONSULTORA);
    expect(await dibujar(PT, { source_id: S1 })).toMatchObject({ status: 409, body: { error: TEXTOS_DIBUJO.rediseno } });
    expect(await dibujar("11111111-1111-4111-8111-0000000000ff", { source_id: S1 })).toMatchObject({ status: 404 });
    expect(b.tablas.jobs ?? []).toEqual([]);
  });

  it("sin terminar de leerse: 409 «Todavía estamos leyendo el archivo…»; si la lectura falló, 409 con qué hacer", async () => {
    for (const e of ["subido", "leyendo"]) {
      const b = conProcesos({ sources: [fuente(S1, { estado: e })] });
      como(DUENA);
      expect(await dibujar(P1, { source_id: S1 })).toMatchObject({ status: 409, body: { error: "Todavía estamos leyendo el archivo. Vuelve en un momento." } });
      expect(b.tablas.jobs ?? []).toEqual([]);
    }
    conProcesos({ sources: [fuente(S1, { estado: "error" })] });
    expect(await dibujar(P1, { source_id: S1 })).toMatchObject({ status: 409, body: { error: TEXTOS_DIBUJO.noSeLeyo } });
  });

  it("sin texto (una foto sin letras): 409 «Este archivo no trae texto que podamos leer…»; con fragmentos, se dibuja con ellos en orden", async () => {
    let b = conProcesos({ sources: [fuente(S1, { tipo: "foto", contenido: null, nombre: "pizarra.jpg" })], source_fragments: [{ id: "f0", source_id: S1, pagina: 1, texto: "   " }] });
    como(DUENA);
    expect(await dibujar(P1, { source_id: S1 })).toMatchObject({ status: 409, body: { error: "Este archivo no trae texto que podamos leer. Cuéntalo con tu voz y lo dibujamos." } });
    expect(b.tablas.jobs ?? []).toEqual([]);

    b = conProcesos({
      sources: [fuente(S1, { contenido: null })],
      source_fragments: [
        { id: "f1", source_id: S1, pagina: 2, texto: "Se arma y se entrega." },
        { id: "f2", source_id: S1, pagina: 1, texto: "Llega el pedido." },
        { id: "f3", source_id: S2, pagina: 1, texto: "DE OTRA FUENTE" },
      ],
    });
    const r = await dibujar(P1, { source_id: S1 });
    expect(r.status).toBe(200);
    const d = (b.tablas.jobs![0].payload as { descripcion: string }).descripcion;
    expect(d.endsWith("Llega el pedido.\nSe arma y se entrega.")).toBe(true);
    expect(d).not.toContain("DE OTRA FUENTE");
  });

  it("más de 8.000 letras: se recorta a 8.000 y la respuesta lo dice; lo que ya se sabía del proceso va delante", async () => {
    const b = conProcesos({ processes: [proceso(P1, { descripcion_original: "De la lista: la atiende Rosa" })], sources: [fuente(S1, { contenido: "x".repeat(12_000) })] });
    como(DUENA);
    const r = await dibujar(P1, { source_id: S1 });
    expect(r.status).toBe(200);
    expect(r.body.recortado).toBe(true);
    expect(String(r.body.aviso)).toMatch(/^El archivo es largo: lo dibujamos con las primeras .+ letras de 12.000\. Lo que quedó fuera lo puedes agregar a mano en el dibujo\.$/);
    const d = (b.tablas.jobs![0].payload as { descripcion: string }).descripcion;
    expect(d.length).toBe(MAX_TEXTO_DIBUJO);
    expect(d).toContain("Lo que ya se sabía de este proceso:\nDe la lista: la atiende Rosa");
  });

  it("ya dibujado: sin confirmar, 409 y nada encolado; con «reemplazar» y «subir_procesos» abierta, se guarda una copia y se encola", async () => {
    const b = conProcesos({
      processes: [proceso(P1, { version: "as_is", confirmacion: "por_confirmar", objetivo: "Que el pedido llegue completo" })],
      process_nodes: [{ id: "n1", process_id: P1, tipo: "inicio", etiqueta: "Empieza" }],
      process_edges: [{ id: "e1", process_id: P1, origen: "n1", destino: "n1" }],
      solicitudes_cliente: [solicitud("subir_procesos")],
    });
    como(DUENA);
    expect(await dibujar(P1, { source_id: S1 })).toMatchObject({ status: 409, body: { error: TEXTOS_DIBUJO.yaDibujado } });
    expect(b.tablas.jobs ?? []).toEqual([]);
    expect((await dibujar(P1, { source_id: S1, reemplazar: true })).status).toBe(200);
    expect(b.tablas.jobs).toHaveLength(1);
    // La copia de cómo estaba, ANTES de que el trabajo borre los pasos: la ficha, los pasos y las conexiones.
    const copias = b.tablas.process_versiones ?? [];
    expect(copias).toHaveLength(1);
    expect(copias[0]).toMatchObject({ company_id: EMP, process_id: P1, motivo: "antes de volver a dibujarlo con «pedidos-cuaderno.pdf»", creado_por: DUENA.id });
    const contenido = copias[0]!.contenido as { proceso: Fila; nodos: Fila[]; conexiones: Fila[] };
    expect(contenido.proceso).toMatchObject({ id: P1, objetivo: "Que el pedido llegue completo", confirmacion: "por_confirmar" });
    expect(contenido.nodos.map((n) => n.etiqueta)).toEqual(["Empieza"]);
    expect(contenido.conexiones).toHaveLength(1);
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ detalle: expect.objectContaining({ reemplaza: true, copia_anterior: copias[0]!.id }) }));
  });

  it("reemplazar desde la empresa: sin «subir_procesos» abierta, 403; nunca sobre un proceso confirmado, ni con su TO-BE o su SOP (409); nada encolado ni copiado", async () => {
    const dibujado = { process_nodes: [{ id: "n1", process_id: P1, tipo: "inicio", etiqueta: "Empieza" }] };
    // Sin la sección abierta: es la misma puerta que importar la lista.
    let b = conProcesos({ processes: [proceso(P1, { version: "as_is" })], ...dibujado });
    como(DUENA);
    expect(await dibujar(P1, { source_id: S1, reemplazar: true })).toMatchObject({ status: 403, body: { error: TEXTO_SECCION_CERRADA } });
    expect(b.tablas.jobs ?? []).toEqual([]);
    // Confirmado por quien lo vive: no lo pisa un archivo.
    b = conProcesos({ processes: [proceso(P1, { version: "as_is", confirmacion: "confirmado" })], ...dibujado, solicitudes_cliente: [solicitud("subir_procesos")] });
    expect(await dibujar(P1, { source_id: S1, reemplazar: true })).toMatchObject({ status: 409, body: { error: TEXTOS_DIBUJO.confirmado } });
    // Con su rediseño (TO-BE) o su procedimiento escrito (SOP): es trabajo de la consultora.
    b = conProcesos({ processes: [proceso(P1, { version: "as_is" }), proceso(PT, { version: "to_be", padre_id: P1 })], ...dibujado, solicitudes_cliente: [solicitud("subir_procesos")] });
    expect(await dibujar(P1, { source_id: S1, reemplazar: true })).toMatchObject({ status: 409, body: { error: TEXTOS_DIBUJO.conTrabajo } });
    b = conProcesos({ processes: [proceso(P1, { version: "as_is" })], ...dibujado, sops: [{ id: "sop1", process_id: P1 }], solicitudes_cliente: [solicitud("subir_procesos")] });
    como(LIDER);
    expect(await dibujar(P1, { source_id: S1, reemplazar: true })).toMatchObject({ status: 409, body: { error: TEXTOS_DIBUJO.conTrabajo } });
    expect(b.tablas.jobs ?? []).toEqual([]);
    expect(b.tablas.process_versiones ?? []).toEqual([]);
    // La consultora sí, aun confirmado y con su SOP; y también se guarda la copia antes.
    b = conProcesos({ processes: [proceso(P1, { version: "as_is", confirmacion: "confirmado" })], ...dibujado, sops: [{ id: "sop1", process_id: P1 }] });
    como(CONSULTORA);
    expect((await dibujar(P1, { source_id: S1, reemplazar: true })).status).toBe(200);
    expect(b.tablas.process_versiones).toHaveLength(1);
    expect(b.tablas.jobs).toHaveLength(1);
  });

  it("si la copia no se puede guardar (la tabla todavía no existe), no se vuelve a dibujar: 409 y nada encolado", async () => {
    const b = conProcesos({ processes: [proceso(P1, { version: "as_is" })], process_nodes: [{ id: "n1", process_id: P1, tipo: "inicio", etiqueta: "Empieza" }] });
    b.fallos.process_versiones = { code: "42P01", message: "relation \"process_versiones\" does not exist" };
    como(CONSULTORA);
    expect(await dibujar(P1, { source_id: S1, reemplazar: true })).toMatchObject({ status: 409, body: { error: TEXTOS_DIBUJO.sinCopia } });
    expect(b.tablas.jobs ?? []).toEqual([]);
  });
});

// ─────────────────────── El trabajo de dibujo ───────────────────────

describe("generar_proceso sobre un proceso «sin dibujar» · con dobles", () => {
  it("guardarFlujograma con process_id dibuja EN ese proceso: sigue habiendo uno, con sus pasos", async () => {
    const b = base({ processes: [proceso(P1)] });
    const { guardarFlujograma } = await import("@/lib/jobs/handlers/procesos");
    const r = await guardarFlujograma(EMP, { nombre: "Otro nombre", nodos: [{ id: "a", tipo: "inicio", etiqueta: "Empieza" }, { id: "b", tipo: "fin", etiqueta: "Termina" }], conexiones: [{ de: "a", a: "b" }] }, { version: "as_is", origen: "generado_ia", process_id: P1 });
    expect(r.processId).toBe(P1);
    expect(b.tablas.processes).toHaveLength(1);
    expect(insertsEn(b, "processes")).toEqual([]);
    expect(b.tablas.process_nodes!.map((n) => n.process_id)).toEqual([P1, P1]);
    expect(b.tablas.process_edges).toHaveLength(1);
  });

  it("el trabajo entero (handleGenerarProceso) con lo que encoló la ruta: un proceso, su nombre se respeta y lo que ya se sabía queda guardado", async () => {
    const b = base({ processes: [proceso(P1, { descripcion_original: "De la lista: la atiende Rosa" })], sources: [fuente(S1)] });
    como(DUENA);
    const r = await dibujar(P1, { source_id: S1 });
    const job = b.tablas.jobs!.find((j) => j.id === r.body.job_id)!;
    const { handleGenerarProceso } = await import("@/lib/jobs/handlers/procesos");
    const hecho = await handleGenerarProceso({ id: String(job.id), company_id: EMP, payload: job.payload as Record<string, unknown> });
    expect(hecho).toMatchObject({ process_id: P1, nodos: 3 });
    expect(b.tablas.processes).toHaveLength(1);
    expect(b.tablas.processes![0]).toMatchObject({ id: P1, nombre: "Atención de pedidos", confirmacion: "por_confirmar" });
    // La descripción original que guarda el trabajo es la que armó la ruta: conserva lo que decía la lista.
    expect(String(b.tablas.processes![0].descripcion_original)).toContain("De la lista: la atiende Rosa");
    expect(b.tablas.process_nodes!.every((n) => n.process_id === P1)).toBe(true);
  });
});

// ─────────────────────── Importar la lista ───────────────────────

describe("POST /api/companies/[id]/procesos/importar · el cliente, solo con «subir_procesos» abierta", () => {
  it("la dueña sin la sección abierta: 403 con el texto de sección cerrada, el intento en el rastro y nada escrito", async () => {
    const b = base({ solicitudes_cliente: [solicitud("subir_procesos", { estado: "retirada" }), solicitud("productos")] });
    como(DUENA);
    expect(await importar("confirmar")).toMatchObject({ status: 403, body: { error: TEXTO_SECCION_CERRADA } });
    expect(insertsEn(b, "processes")).toEqual([]);
    expect(denegado()).toBe(true);
  });

  it("con la sección abierta: la dueña ve qué entra y lo crea, sin dibujar; una participante no, aunque esté abierta", async () => {
    const b = base({ solicitudes_cliente: [solicitud("subir_procesos")] });
    como(DUENA);
    const vista = await importar("vista_previa");
    expect(vista.status).toBe(200);
    expect((vista.body.nuevos as Fila[]).map((p) => p.nombre)).toEqual(["Apertura de caja", "Compra de mercadería"]);
    expect(insertsEn(b, "processes")).toEqual([]);
    const hecho = await importar("confirmar");
    expect(hecho).toMatchObject({ status: 201, body: { creados: 2, version: "sin_dibujar", origen: "importado" } });
    expect(b.tablas.processes!.every((p) => p.version === "sin_dibujar" && p.company_id === EMP)).toBe(true);

    como(PARTICIPANTE);
    expect(await importar("confirmar")).toMatchObject({ status: 403, body: { error: TEXTO_SECCION_CERRADA } });
    expect(b.tablas.processes).toHaveLength(2);
  });

  it("la consultora importa siempre, sin pedido abierto", async () => {
    base();
    como(CONSULTORA);
    expect((await importar("vista_previa")).status).toBe(200);
  });
});

// ─────────────────────── Las pantallas ───────────────────────

/** Lo que el dueño nunca lee en su portal. */
const PROHIBIDAS_DUENO = /\bIA\b|inteligencia artificial|extra[ií]do|\bclaim/;

describe("dueño · /portal/procesos · subir, lo subido por dibujar, y la lista solo con la sección abierta", () => {
  const conTodo = (extra: Record<string, Fila[]> = {}) =>
    base({
      processes: [proceso(P1), proceso(P2, { nombre: "Compras de la lista" }), proceso(P3, { company_id: OTRA, nombre: "Proceso de otra empresa" })],
      sources: [fuente(S1, { revision: null, tipo: "foto", nombre: "cuaderno-pedidos.jpg" }), fuente(S3, { company_id: OTRA, process_id: P3, nombre: "ajeno.pdf" })],
      ...extra,
    });

  it("sin pedido: subir un proceso, lo subido por dibujar con su estado; ni la lista sin archivo ni el importador ni «Listo, ya lo llené»", async () => {
    conTodo();
    estado.portal = { companyId: EMP, queFalta: "", u: DUENA };
    const { default: Pagina } = await import("@/app/(cliente)/portal/procesos/page");
    const html = renderToStaticMarkup(await Pagina());
    expect(html).toContain("Subir un proceso que ya tienes");
    expect(html).toContain("Lo que subiste, por dibujar (1)");
    expect(html).toContain("Atención de pedidos");
    expect(html).toContain("cuaderno-pedidos.jpg");
    expect(html).toContain("Leído: listo para dibujar");
    expect(html).toContain(`href="/portal/procesos/${P1}"`);
    expect(html).not.toContain("Compras de la lista");
    expect(html).not.toContain("¿Tienes la lista de tus procesos en un Excel?");
    expect(html).not.toContain("Listo, ya lo llené");
    expect(html).not.toContain("Proceso de otra empresa");
    expect(html).not.toContain("ajeno.pdf");
    expect(html).not.toMatch(PROHIBIDAS_DUENO);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*aria-label="Archivo del proceso"/);
  });

  it("con «subir_procesos» abierta: la nota de la consultora, el importador con la lista sin archivo, y «Listo, ya lo llené»", async () => {
    conTodo({ solicitudes_cliente: [solicitud("subir_procesos", { nota: "Sube el de pedidos y el de compras" })] });
    estado.portal = { companyId: EMP, queFalta: "", u: DUENA };
    const { default: Pagina } = await import("@/app/(cliente)/portal/procesos/page");
    const html = renderToStaticMarkup(await Pagina());
    expect(html).toContain("Tu consultora te pidió tus procesos");
    expect(html).toContain("«Sube el de pedidos y el de compras»");
    expect(html).toContain("¿Tienes la lista de tus procesos en un Excel?");
    expect(html).toContain("De tu lista, por dibujar (1)");
    expect(html).toContain("Compras de la lista");
    expect(html).toContain("Listo, ya lo llené");
    expect(html).not.toMatch(PROHIBIDAS_DUENO);
  });

  it("una participante ve sus procesos, pero no sube ni importa por la empresa", async () => {
    conTodo({ solicitudes_cliente: [solicitud("subir_procesos")] });
    estado.portal = { companyId: EMP, queFalta: "", u: PARTICIPANTE };
    const { default: Pagina } = await import("@/app/(cliente)/portal/procesos/page");
    const html = renderToStaticMarkup(await Pagina());
    expect(html).toContain("Así funciona tu empresa, dibujada");
    expect(html).not.toContain("Subir un proceso que ya tienes");
    expect(html).not.toContain("¿Tienes la lista de tus procesos en un Excel?");
    expect(html).not.toContain("Listo, ya lo llené");
  });
});

describe("dueño · la ficha de un proceso subido · su archivo, su estado y «Dibujarlo con lo que subiste»", () => {
  const ficha = async () => {
    const { default: Pagina } = await import("@/app/(cliente)/portal/procesos/[p]/page");
    return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ p: P1 }) }));
  };
  const conFuente = (f: Fila) => {
    base({ processes: [proceso(P1)], sources: [f, fuente(S3, { company_id: OTRA, process_id: P1, nombre: "ajeno.pdf" })] });
    estado.portal = { companyId: EMP, queFalta: "", u: DUENA };
  };

  it("leído: arriba del lienzo, con el botón para dibujarlo; nada de otra empresa aunque apunte al mismo proceso", async () => {
    conFuente(fuente(S1));
    const html = await ficha();
    expect(html).toContain("Este proceso todavía no está dibujado");
    expect(html).toContain("Leído: listo para dibujar");
    expect(html).toContain(">Dibujarlo con lo que subiste</button>");
    expect(html.indexOf(">Dibujarlo con lo que subiste</button>")).toBeLessThan(html.indexOf('data-lienzo="si"'));
    expect(html).not.toContain("ajeno.pdf");
    expect(html).not.toMatch(PROHIBIDAS_DUENO);
  });

  it("leyéndose: «Subido: lo estamos leyendo» y que vuelva en un momento, sin botón; si falló, qué hacer", async () => {
    conFuente(fuente(S1, { estado: "leyendo" }));
    let html = await ficha();
    expect(html).toContain("Subido: lo estamos leyendo");
    expect(html).toContain("Vuelve en un momento");
    expect(html).not.toContain(">Dibujarlo con lo que subiste</button>");
    conFuente(fuente(S1, { estado: "error" }));
    html = await ficha();
    expect(html).toContain("No pudimos leerlo");
    expect(html).toContain("Súbelo otra vez");
    expect(html).not.toContain(">Dibujarlo con lo que subiste</button>");
  });

  it("un proceso de otra empresa no se abre", async () => {
    base({ processes: [proceso(P3, { company_id: OTRA })] });
    estado.portal = { companyId: EMP, queFalta: "", u: DUENA };
    const { default: Pagina } = await import("@/app/(cliente)/portal/procesos/[p]/page");
    await expect(Pagina({ params: Promise.resolve({ p: P3 }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("consultora · Procesos y Organigrama · lo que subió la empresa", () => {
  it("Procesos: lo subido por dibujar con su estado en «Subir un proceso»; lo que vino solo con nombre, en el importador", async () => {
    base({ processes: [proceso(P1), proceso(P2, { nombre: "Compras de la lista" })], sources: [fuente(S1)] });
    const { default: Pagina } = await import("@/app/(consultor)/empresa/[id]/procesos/page");
    const html = renderToStaticMarkup(await Pagina({ params: Promise.resolve({ id: EMP }) }));
    expect(html).toContain("Subir un proceso que la empresa ya tiene");
    expect(html).toContain("Subidos, por dibujar (1)");
    expect(html).toContain("Leído · por revisar en Fuentes");
    expect(html).toContain("De la lista de la empresa, sin dibujar (1)");
    expect(html).toContain("Compras de la lista");
    expect(html).not.toContain("No pudimos leer cuáles procesos tienen archivo");
  });

  const organigrama = async () => {
    const { default: Pagina } = await import("@/app/(consultor)/empresa/[id]/organigrama/page");
    return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ id: EMP }) }));
  };

  it("la franja lista solo lo de esa empresa: su archivo, cómo llegó, su estado y el pedido; nunca el de otra", async () => {
    base({
      company_assets: [
        { company_id: EMP, bloque: "personas", clave: "personas.organigrama", estado: "lo_tengo", source_id: S_ORG, updated_at: "2026-10-16T15:00:00.000Z" },
        { company_id: OTRA, bloque: "personas", clave: "personas.organigrama", estado: "lo_tengo", source_id: S_ORG_OTRA, updated_at: "2026-10-16T15:00:00.000Z" },
      ],
      sources: [
        fuente(S_ORG, { process_id: null, nombre: "organigrama-sol.jpg", tipo: "foto", revision: null }),
        fuente(S_ORG_OTRA, { company_id: OTRA, process_id: null, nombre: "organigrama-otra.pdf" }),
      ],
      solicitudes_cliente: [solicitud("subir_organigrama")],
    });
    const html = await organigrama();
    expect(html).toContain("Lo que subió la empresa");
    expect(html).toContain("organigrama-sol.jpg");
    expect(html).toContain("foto · lo subió la empresa");
    expect(html).toContain(">Listo<");
    expect(html).toContain("Se lo pediste el 16 de octubre. Todavía no avisa que terminó.");
    expect(html).toContain(`href="/empresa/${EMP}/fuentes"`);
    expect(html).not.toContain("organigrama-otra.pdf");
    expect(html).toContain('data-organigrama="si"');
  });

  it("un activo que apunta a un archivo de otra empresa no lo muestra; sin archivo se dice qué marcó la empresa; un documento leído espera revisión", async () => {
    base({
      company_assets: [{ company_id: EMP, bloque: "personas", clave: "personas.organigrama", estado: "lo_tengo", source_id: S_ORG_OTRA }],
      sources: [fuente(S_ORG_OTRA, { company_id: OTRA, process_id: null, nombre: "organigrama-otra.pdf" })],
    });
    let html = await organigrama();
    expect(html).not.toContain("organigrama-otra.pdf");
    expect(html).toContain("Dijo que lo tiene, pero no subió ningún archivo.");

    base();
    html = await organigrama();
    expect(html).toContain("La empresa todavía no subió su organigrama.");

    base({
      company_assets: [{ company_id: EMP, bloque: "personas", clave: "personas.organigrama", estado: "lo_tengo", source_id: S_ORG }],
      sources: [fuente(S_ORG, { process_id: null, nombre: "organigrama.pdf" })],
    });
    html = await organigrama();
    expect(html).toContain(">Por revisar<");
    expect(html).toContain("espera tu revisión en Fuentes");
  });

  it("si la lectura falla, se dice; no se pinta «todavía no subió»", async () => {
    const b = crearBaseFalsa({ companies: [{ id: EMP, nombre: "Pedidos del Sol (ficticia)" }] }, { company_assets: { code: "XX000", message: "se cayó" } });
    estado.base = b;
    const html = await organigrama();
    expect(html).toContain("No pudimos leer lo que subió la empresa.");
    expect(html).not.toContain("todavía no subió");
  });
});
