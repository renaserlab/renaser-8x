/**
 * LO PROVISIONAL SE VE, SE RECALCULA Y NO ALIMENTA DECISIONES (R10.4, remate del 13-10-2026).
 *
 * Cuatro reparos del verificador, cada uno con su prueba:
 *  (b) El candado de 5 confirmadas corría ANTES de mirar los provisionales: un pilar con 2 confirmadas y 40 afirmaciones
 *      de documentos nunca se diagnosticaba. Ahora tiene dos puertas: confirmadas + provisionales ≥ 5 abre el MODO
 *      PROVISIONAL (todo hallazgo nace provisional con confianza baja; el pilar sigue «desconocido»: no hay conclusión).
 *  (c) provisional nunca se recalculaba: el dueño confirmaba, el consultor aprobaba, y el rótulo seguía. Ahora aprobar o
 *      corregir relee la evidencia y recalcula con las mismas reglas que el diagnóstico.
 *  (d) modelo, organigrama, activos y procesos leían findings sin excluir provisional: lo provisional dimensionaba el
 *      modelo, entraba al estudio de organigrama, dictaba cómo trabajar un documento y rediseñaba procesos.
 *  (a) hoy.ts calculaba porConfirmar y ninguna página lo pintaba.
 *
 * Y dos cosas que el remate dejó a la vista al cerrarlos:
 *  - Aprobar no es confirmar. Si al aprobar bastara la evidencia propia del hallazgo, la segunda puerta del candado sería
 *    un atajo: un pilar con 2 confirmadas daría conclusiones con solo aprobarlas. El candado del pilar vale también al
 *    releer (releerEvidencia): un hallazgo de la IA sigue provisional hasta que el pilar llega a 5 confirmadas.
 *  - Lo ya revisado también se relee. El rediagnóstico recreaba los pendientes y dejaba los aprobados con el rótulo del
 *    día en que se revisaron: el dueño confirmaba después y su portal seguía diciendo «por confirmar».
 *
 * Aquí no hay base real ni modelo: `supabaseAdmin()` es una base falsa en memoria que reproduce lo que importa de
 * PostgREST (filtros, insert/upsert/delete, conteos), y el DIAGNOSTICADOR y el AUDITOR son dobles que devuelven lo que
 * cada prueba declara. Lo que se prueba es la lógica del manejador y de la ruta, no PostgREST ni Gemini.
 *
 * Las dos páginas del portal (Mi empresa hoy y el informe) se renderizan de verdad en servidor sobre esa misma base
 * falsa, con el `empresaHoy` real: lo que se afirma es el HTML que recibe el empresario, no solo que el texto esté en
 * el archivo. No es un navegador: no prueba estilos, ni el plegado, ni la sesión.
 *
 * Tercera vuelta (reparos del verificador sobre el remate):
 *  - NO TODO LO PROVISIONAL LO ES POR LO MISMO. Un hallazgo aprobado de la IA cuya evidencia el dueño ya confirmó sigue
 *    provisional si del área se sabe poco. A ese dueño se le decía «sale de documentos que nadie confirmó» y debajo «lo
 *    que tú nos contaste»: origen falso y nada que confirmar. Cada punto lleva su motivo y cada motivo su texto.
 *  - El resumen del pilar en modo provisional llegaba al empresario con la cuenta interna («2 de 5 afirmaciones
 *    confirmadas») y con la lectura del modelo, y de ahí al modelo de alto rendimiento. Ahora es una frase fija.
 *  - Lo ya revisado también se relee cuando el pilar queda desconocido.
 *  - Las pruebas hacían el primer import dentro de la prueba y en la corrida completa se les agotaban los 5 s: los
 *    módulos se cargan una vez, antes, con tiempo de sobra.
 *
 * Cierre Z2 (lo provisional, de punta a punta):
 *  - El disparo automático (jobs/auto.ts) abre las dos puertas del candado con la misma regla que el manejador.
 *  - El plan, los entregables, «Lo que encontramos» y los indicadores ya no leen lo provisional (ni aprobado).
 *  - El porqué de cada punto sale de su evidencia real (cuántas confirmadas, cuántas por confirmar); un hallazgo de la
 *    IA en un área sin el mínimo no es conclusión aunque su columna lo diga; «de tu parte no hay nada pendiente» no se
 *    dice con una contradicción abierta en el área; una fortaleza provisional se ve, rotulada «por confirmar».
 *  - El resumen de un pilar desconocido es una frase de dueño, y el hallazgo que escribe la consultora lee su evidencia.
 *
 * Cierre Z2, segunda vuelta (dos reparos del verificador sobre el cierre):
 *  - El hallazgo que la consultora escribe sobre papeles sin confirmar nace provisional y nada lo levantaba: solo se
 *    releían los de la IA. Ahora cada trabajo de diagnóstico relee también los suyos, por su propia evidencia.
 *  - Mi empresa hoy lee el candado en vivo; el plan, los entregables y los indicadores leen la columna. Si la evidencia
 *    cambiaba sin que tocara un diagnóstico (el área bajó del mínimo, una contradicción abierta, el mismo nivel de
 *    información), la columna se quedaba con el rótulo de ayer. El disparo automático lo detecta con la regla del
 *    manejador y encola un trabajo que solo relee (sin modelo); la relectura va antes de cualquier salida, también la
 *    de la contradicción abierta, y un área que ya no llega al mínimo deja escrito que no tiene conclusión.
 *
 * Cierre Z2, tercera vuelta (un reparo del verificador, y otro que queda fuera de la lista de este remate):
 *  - Un pendiente de la IA en un área con sus cinco confirmadas, nacido provisional sobre papeles que el dueño confirmó
 *    después, no lo releía nadie: seRelee lo dejaba pasar solo en un área corta y rotulosDesfasados no lo contaba.
 *    Seguía fuera del plan estratégico y de los indicadores hasta que el área sumara confirmadas para otro
 *    diagnóstico, y el dueño leía «falta volver a revisarlo» sin plazo. Ahora todo trabajo que no llama al modelo relee
 *    los pendientes de la IA (nadie los recrea en él), y el disparo los cuenta siempre.
 *  - Queda anotado como pendiente (it.todo): confirmar una extracción no pasa por el disparo automático. La ruta
 *    /api/sources/[id]/consolidar no está en la lista de este remate.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import type { MotivoPorConfirmar } from "@/lib/hoy";

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const estado = vi.hoisted(() => ({
  base: null as null | ReturnType<typeof crearBaseFalsa>,
  claims: [] as Fila[],
  diagnosticador: vi.fn(),
  auditor: vi.fn(),
  investigador: vi.fn(),
  planificador: vi.fn(),
  estratega: vi.fn(),
  medidor: vi.fn(),
  encolados: [] as Fila[],
  // Claves que la cola ya tiene hechas: encolar con una de ellas no crea trabajo y responde `duplicado`, como la real.
  clavesHechas: [] as string[],
}));

// CARGA EN FRÍO FUERA DE LAS PRUEBAS. El primer import del manejador, de la ruta y de las dos páginas transforma medio
// repositorio; en la corrida completa, con todos los archivos compitiendo, eso solo ya pasaba de los 5 s y la prueba que
// lo hacía fallaba por tiempo, no por lo que afirma. Se cargan aquí una vez; los `await import` de cada prueba ya los
// encuentran en memoria. El margen por prueba también se amplía: es una red, no lo que las hace pasar.
vi.setConfig({ testTimeout: 30_000 });
let RESUMEN_MODO_PROVISIONAL = "";
let RESUMEN_SIN_INFORMACION = "";
beforeAll(async () => {
  ({ RESUMEN_MODO_PROVISIONAL, RESUMEN_SIN_INFORMACION } = await import("@/lib/jobs/handlers/diagnostico"));
  await import("@/lib/jobs/handlers/modelo");
  await import("@/lib/jobs/auto");
  await import("@/lib/jobs/handlers/plan");
  await import("@/lib/jobs/handlers/indicadores");
  await import("@/app/api/findings/route");
  await import("@/app/api/findings/[id]/review/route");
  await import("@/lib/hoy");
  await import("@/app/(cliente)/portal/hoy/page");
  await import("@/app/(cliente)/portal/informe/page");
}, 180_000);

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/jobs/queue", () => ({
  progreso: vi.fn(async () => {}),
  encolar: vi.fn(async (j: Fila) => {
    if (j.idempotency_key && estado.clavesHechas.includes(j.idempotency_key)) return { id: "job-de-antes", duplicado: true };
    estado.encolados.push(j);
    return { id: `job-${estado.encolados.length}`, duplicado: false };
  }),
  PRIORIDAD: { diagnosticar: 7 },
  claveIdempotente: (partes: unknown[]) => partes.join("|"),
}));
vi.mock("@/lib/jobs/contexto", () => ({ anotarFuentesDeClaims: async () => {} }));
vi.mock("@/lib/jobs/handlers/entrevista", () => ({ preguntaRepetida: () => false }));
vi.mock("@/lib/ai/agents/diagnosticador", () => ({
  correrDiagnosticador: (ctx: string) => estado.diagnosticador(ctx),
  correrAuditor: (ctx: string) => estado.auditor(ctx),
}));
vi.mock("@/lib/ai/agents/investigador", () => ({ correrInvestigador: (ctx: string) => estado.investigador(ctx) }));
// Los tres agentes que deciden con hallazgos (plan de 45 días, plan estratégico, indicadores): dobles que guardan el
// contexto que recibieron, para afirmar qué hallazgos les llegan.
vi.mock("@/lib/ai/agents/planificador", () => ({ correrPlanificador: (ctx: string) => estado.planificador(ctx), correrRedactor: vi.fn(), correrAdmision: vi.fn() }));
vi.mock("@/lib/ai/agents/estratega", () => ({ correrEstratega: (ctx: string) => estado.estratega(ctx) }));
vi.mock("@/lib/ai/agents/medidor", () => ({ correrMedidor: (ctx: string) => estado.medidor(ctx) }));
// claimsDeEmpresa se dobla (devuelve las afirmaciones que la prueba declara); el resto del módulo es el real:
// claimComoEvidencia y SELECT_SOURCES_DE_CLAIM son justamente lo que se quiere ejercitar.
vi.mock("@/lib/db/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/queries")>()),
  claimsDeEmpresa: async () => estado.claims,
  registrarLlamada: async () => {},
}));
// La capa de autenticación se aparta en la ruta: aquí se prueba lo que la ruta HACE con la base, no quién puede llamarla.
vi.mock("@/lib/api", () => ({
  protegido: (_opts: unknown, fn: unknown) => fn,
  ok: (data: unknown, status = 200) => ({ status, body: data }),
  fallo: (mensaje: string, status = 400) => ({ status, body: { error: mensaje } }),
  leerJSON: async (req: Request) => { try { return await req.json(); } catch { return {}; } },
}));
vi.mock("@/lib/autoridad", () => ({ exigirAutoridad: async () => {} }));
// Para renderizar las páginas del portal: la sesión, el rastro y el logo se apartan (no hay navegador ni Storage), y los
// componentes de cliente que no tocan lo provisional se reemplazan por nada. La tarjeta de hallazgo deja una marca con el
// id, para poder afirmar QUÉ hallazgos se pintan como conclusión.
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => ({ companyId: "c1", empresa: { nombre: "Tienda de prueba" }, queFalta: null }) }));
vi.mock("@/lib/auditoria", () => ({ rastroDeEmpresa: async () => [], registrar: async () => {} }));
vi.mock("@/lib/auth", () => ({ usuarioActual: async () => null }));
vi.mock("@/lib/logo", () => ({ urlDeLogo: async () => null }));
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return { default: ({ href, children, className }: { href: string; children?: unknown; className?: string }) => createElement("a", { href, className }, children as never) };
});
vi.mock("@/components/cliente/TarjetaHallazgo", async () => {
  const { createElement } = await import("react");
  return { TarjetaHallazgo: ({ h }: { h: { id: string; titulo: string } }) => createElement("article", { "data-conclusion": h.id }, h.titulo) };
});
vi.mock("@/components/base/VerMasLateral", () => ({ VerMasLateral: () => null }));
vi.mock("@/components/cliente/MapaMental", () => ({ MapaMental: () => null }));
vi.mock("@/components/cliente/DatosEmpresa", () => ({ DatosEmpresa: () => null }));
vi.mock("@/components/cliente/DeclararEquipo", () => ({ DeclararEquipo: () => null }));
vi.mock("@/components/cliente/TarjetaNumeros", () => ({ TarjetaNumeros: () => null }));
vi.mock("@/components/base/BotonImprimir", () => ({ BotonImprimir: () => null }));

/** Lo mínimo de PostgREST que usan el manejador y la ruta, en memoria. Las consultas se resuelven al hacer `await`. */
function crearBaseFalsa(inicial: Record<string, Fila[]> = {}, fallar: Record<string, string> = {}) {
  const tablas: Record<string, Fila[]> = inicial;
  let seq = 0;
  class Consulta {
    private filtros: ((f: Fila) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    private filas: Fila[] = [];
    private patch: Fila | null = null;
    private onConflict: string[] | null = null;
    private contar = false;
    private soloConteo = false;
    private tope: number | null = null;
    private unico: "single" | "maybe" | null = null;
    constructor(private tabla: string) {}
    select(_c?: string, o?: { count?: string; head?: boolean }) { this.contar = o?.count === "exact"; this.soloConteo = !!o?.head; return this; }
    insert(f: Fila | Fila[]) { this.op = "insert"; this.filas = Array.isArray(f) ? f : [f]; return this; }
    upsert(f: Fila | Fila[], o?: { onConflict?: string }) { this.op = "upsert"; this.filas = Array.isArray(f) ? f : [f]; this.onConflict = o?.onConflict?.split(",") ?? null; return this; }
    update(p: Fila) { this.op = "update"; this.patch = p; return this; }
    delete() { this.op = "delete"; return this; }
    // Las columnas con punto son filtros sobre tablas anidadas (interview_sessions.company_id): aquí no se modelan.
    private col(c: string, fn: (f: Fila) => boolean) { if (!c.includes(".")) this.filtros.push(fn); return this; }
    eq(c: string, v: unknown) { return this.col(c, (f) => f[c] === v); }
    neq(c: string, v: unknown) { return this.col(c, (f) => f[c] !== v); }
    is(c: string, v: unknown) { return this.col(c, (f) => f[c] == v); }
    in(c: string, vs: unknown[]) { return this.col(c, (f) => vs.includes(f[c])); }
    not(c: string, _op: string, v: unknown) { return this.col(c, (f) => f[c] != v); }
    // El único `or` que se modela es el que excluye lo provisional (deja pasar null y false); cualquier otro no filtra.
    or(expr?: string) { return expr === "provisional.is.null,provisional.eq.false" ? this.col("provisional", (f) => f.provisional == null || f.provisional === false) : this; }
    contains() { return this; }
    filter() { return this; }
    order() { return this; }
    range() { return this; }
    limit(n: number) { this.tope = n; return this; }
    single() { this.unico = "single"; return this; }
    maybeSingle() { this.unico = "maybe"; return this; }
    then<A, B>(res: (v: Fila) => A, rej?: (e: unknown) => B) { return Promise.resolve().then(() => this.ejecutar()).then(res, rej); }
    private ejecutar(): Fila {
      // `fallar` = { "tabla:operación": mensaje }: esa operación devuelve error, como PostgREST cuando la base no responde.
      const averia = fallar[`${this.tabla}:${this.op}`];
      if (averia) return { data: null, count: null, error: { message: averia } };
      const t = (tablas[this.tabla] ??= []);
      if (this.op === "insert" || this.op === "upsert") {
        const salida: Fila[] = [];
        for (const f of this.filas) {
          const existente = this.op === "upsert" && this.onConflict ? t.find((x) => this.onConflict!.every((k) => x[k] === f[k])) : undefined;
          if (existente) { Object.assign(existente, f); salida.push(existente); continue; }
          seq++;
          const row = { id: `${this.tabla}-${seq}`, ...f };
          t.push(row);
          salida.push(row);
        }
        return { data: this.unico ? salida[0] : salida, error: null };
      }
      let filas = t.filter((f) => this.filtros.every((fn) => fn(f)));
      if (this.op === "update") { for (const f of filas) Object.assign(f, this.patch); return { data: filas, error: null }; }
      if (this.op === "delete") { tablas[this.tabla] = t.filter((f) => !filas.includes(f)); return { data: null, error: null }; }
      if (this.tope != null) filas = filas.slice(0, this.tope);
      if (this.contar) return { data: this.soloConteo ? null : filas, count: filas.length, error: null };
      if (this.unico === "single") return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: `se esperaba una fila y hay ${filas.length}` } };
      if (this.unico === "maybe") return { data: filas[0] ?? null, error: null };
      return { data: filas, error: null };
    }
  }
  return { tablas, from: (t: string) => new Consulta(t) };
}

const EMPRESA = "c1";
const PASA = { resultado: "pasa", nota: "" };
const FILTROS = { proposito: PASA, sabiduria: PASA, excelencia: PASA };

/** Afirmación confirmada en entrevista con el dueño (una voz: la persona). */
const confirmada = (id: string): Fila => ({ id, company_id: EMPRESA, source_id: "ent-dueno", participant_id: "dueno", estado: "confirmado", pilar: "personas", texto: `confirmada ${id}`, tipo: "otro", temporalidad: "actual", fecha_afirmacion: null, sources: { nombre: "Entrevista", tipo: "entrevista", fecha_origen: null, origen: "consultor" }, participants: { nombre: "D", rol: "dueno", puesto: null } });
/** Afirmación de un documento que nadie confirmó: entra como evidencia provisional. */
const deDocumento = (id: string, autor = `autor-${id}`): Fila => ({ id, company_id: EMPRESA, source_id: `doc-${id}`, participant_id: null, estado: "sin_verificar", pilar: "personas", texto: `documento ${id}`, tipo: "otro", temporalidad: "actual", fecha_afirmacion: null, sources: { nombre: `Doc ${id}`, tipo: "documento", fecha_origen: null, origen: "cliente", autor, periodo_desde: null, periodo_hasta: null, fidelidad_extraccion: "alta" }, participants: null });

const hallazgo = (titulo: string, claim_ids: string[], extra: Fila = {}): Fila => ({ titulo, patron: null, dimension: "liderazgo", causa_raiz: `causa de ${titulo}`, impacto: "alto", veredicto: "improve", recomendacion: `qué hacer con ${titulo}`, costo_posible: null, claim_ids, claims_contrarios: [], filtros: FILTROS, ...extra });
const respuestaModelo = (data: Fila) => ({ data, tokens_entrada: 0, tokens_salida: 0, modelo: "doble", latencia_ms: 0 });

/** Lo que la ruta de revisión cuenta en `claims` para saber si el pilar llegó al mínimo: n afirmaciones confirmadas del pilar. */
const confirmadasDelPilar = (n: number, pilar = "personas"): Fila[] => Array.from({ length: n }, (_, i) => ({ id: `k${i + 1}`, company_id: EMPRESA, estado: "confirmado", pilar }));

const baseVacia = () => crearBaseFalsa({ diagnoses: [], findings: [], finding_evidence: [], know_how: [], interview_responses: [], interview_sessions: [], participants: [], companies: [{ id: EMPRESA, nombre: "Tienda de prueba", sector: "retail", modelo_operativo: null, etapa_negocio: null }], company_metricas: [], conocimiento_base: [], jobs: [] });

describe("(b) el candado de suficiencia tiene dos puertas: la regla pura", () => {
  it("5 confirmadas → normal; 2 confirmadas + 4 provisionales → provisional; 2 + 1 → desconocido; 0 + 5 → provisional", async () => {
    const { puertaDelCandado } = await import("@/lib/jobs/handlers/diagnostico");
    expect(puertaDelCandado(5, 0)).toBe("normal");
    expect(puertaDelCandado(2, 4)).toBe("provisional");
    expect(puertaDelCandado(2, 1)).toBe("desconocido");
    expect(puertaDelCandado(0, 5)).toBe("provisional");
    expect(puertaDelCandado(4, 0)).toBe("desconocido");
  });

  it("qué cuenta como papel sin confirmar es una sola regla, exportada: documento, foto, dato y lo visto; nunca una entrevista ni algo ya confirmado", async () => {
    const { esProvisionalDeDocumento } = await import("@/lib/jobs/handlers/diagnostico");
    for (const tipo of ["documento", "foto", "dato", "observacion"]) expect(esProvisionalDeDocumento({ estado: "sin_verificar", sources: { tipo } }), tipo).toBe(true);
    expect(esProvisionalDeDocumento({ estado: "sin_verificar", sources: { tipo: "entrevista" } })).toBe(false);
    expect(esProvisionalDeDocumento({ estado: "sin_verificar", sources: null })).toBe(false);
    expect(esProvisionalDeDocumento({ estado: "confirmado", sources: { tipo: "documento" } })).toBe(false);
  });

});

describe("(b) el disparo automático (jobs/auto.ts) abre las dos puertas con la misma regla que el manejador", () => {
  const afirmaciones = (n: number, estadoClaim: string, tipo: string, pilar = "personas"): Fila[] => Array.from({ length: n }, () => ({ company_id: EMPRESA, pilar, estado: estadoClaim, sources: { tipo } }));
  const disparar = async (claims: Fila[], jobs: Fila[] = [], fallar: Record<string, string> = {}) => {
    estado.base = crearBaseFalsa({ claims, jobs, error_log: [] }, fallar);
    estado.encolados = [];
    const { dispararDiagnosticoSiListo } = await import("@/lib/jobs/auto");
    return dispararDiagnosticoSiListo(EMPRESA);
  };

  it("2 confirmadas + 4 papeles sin confirmar → encola el diagnóstico del pilar sin que nadie lo pida", async () => {
    expect(await disparar([...afirmaciones(2, "confirmado", "entrevista"), ...afirmaciones(4, "sin_verificar", "documento")])).toEqual(["personas"]);
    expect(estado.encolados).toHaveLength(1);
    expect(estado.encolados[0]).toMatchObject({ company_id: EMPRESA, tipo: "diagnosticar", payload: { pilar: "personas" } });
    // No lleva `forzar`: el manejador decide la puerta con su propia cuenta, que es la misma.
    expect(estado.encolados[0].payload).toEqual({ pilar: "personas" });
  });

  it("lo que no abre ninguna puerta no se encola: 2 + 1 papel; 2 + 4 de entrevista sin verificar; 4 confirmadas y nada más", async () => {
    expect(await disparar([...afirmaciones(2, "confirmado", "entrevista"), ...afirmaciones(1, "sin_verificar", "documento")])).toEqual([]);
    expect(await disparar([...afirmaciones(2, "confirmado", "entrevista"), ...afirmaciones(4, "sin_verificar", "entrevista")])).toEqual([]);
    expect(await disparar(afirmaciones(4, "confirmado", "entrevista"))).toEqual([]);
    expect(estado.encolados).toHaveLength(0);
  });

  it("cuenta como el manejador: foto, dato y lo visto en una visita son papeles; las transversales valen para cada pilar", async () => {
    expect(await disparar([...afirmaciones(1, "confirmado", "entrevista", "producto"), ...afirmaciones(2, "sin_verificar", "foto", "producto"), ...afirmaciones(1, "sin_verificar", "dato", "producto"), ...afirmaciones(1, "sin_verificar", "observacion", "producto")])).toEqual(["producto"]);
    expect(await disparar([...afirmaciones(2, "confirmado", "entrevista", "transversal"), ...afirmaciones(3, "sin_verificar", "documento", "transversal")])).toEqual(["personas", "procesos", "producto", "marketing"]);
  });

  it("5 confirmadas → la puerta normal, con la clave de siempre; en modo provisional la clave es otra y cambia cuando crece la evidencia", async () => {
    await disparar(afirmaciones(5, "confirmado", "entrevista"));
    expect(estado.encolados[0].idempotency_key).toBe("auto-diag|c1|personas|1");
    const clave = async (confirmadas: number, papeles: number) => {
      await disparar([...afirmaciones(confirmadas, "confirmado", "entrevista"), ...afirmaciones(papeles, "sin_verificar", "documento")]);
      return estado.encolados[0].idempotency_key as string;
    };
    const base = await clave(2, 4);
    expect(base).toBe("auto-diag|c1|personas|provisional|0|0");
    // Un papel más no vuelve a diagnosticar; diez más, sí; una confirmada que cambia de nivel, también.
    expect(await clave(2, 5)).toBe(base);
    expect(await clave(2, 14)).not.toBe(base);
    expect(await clave(3, 4)).not.toBe(base);
  });

  it("con una contradicción abierta espera a la persona, y si el pilar ya está en cola no apila otro", async () => {
    expect(await disparar([...afirmaciones(2, "confirmado", "entrevista"), ...afirmaciones(4, "sin_verificar", "documento"), ...afirmaciones(1, "contradicho", "entrevista")])).toEqual([]);
    const enCola = [{ company_id: EMPRESA, tipo: "diagnosticar", estado: "pendiente", payload: { pilar: "personas" } }];
    expect(await disparar([...afirmaciones(2, "confirmado", "entrevista"), ...afirmaciones(4, "sin_verificar", "documento")], enCola)).toEqual([]);
    expect(estado.encolados).toHaveLength(0);
  });

  it("si las afirmaciones no se pueden leer no se calla: nada se encola y queda escrito en el registro de errores", async () => {
    expect(await disparar(afirmaciones(9, "confirmado", "entrevista"), [], { "claims:select": "la base no responde" })).toEqual([]);
    expect(estado.encolados).toHaveLength(0);
    expect(estado.base!.tablas.error_log).toHaveLength(1);
    expect(estado.base!.tablas.error_log[0]).toMatchObject({ ruta: "jobs/auto", company_id: EMPRESA, detalle: "la base no responde" });
    expect(estado.base!.tablas.error_log[0].mensaje).toContain("ningún diagnóstico se disparó solo");
  });

  it("afirmado sobre el código: no cuenta por su cuenta, usa las dos funciones del manejador", () => {
    const src = readFileSync(path.resolve(__dirname, "..", "src/lib/jobs/auto.ts"), "utf8");
    expect(src).toContain('import { puertaDelCandado, esProvisionalDeDocumento, seRelee, releerEvidencia } from "./handlers/diagnostico"');
    // Tampoco decide por su cuenta qué rótulo quedó desfasado: pregunta qué se relee y qué rótulo toca al manejador.
    // Los pendientes de la IA cuentan siempre: el trabajo que se encola solo relee y no recrea ninguno.
    expect(src).toContain("seRelee(f, true)");
    expect(src).not.toContain("seRelee(f, pilarCorto)");
    expect(src).toContain("releerEvidencia(sustento, { origen: f.origen, confirmadasDelPilar })");
    expect(src).toContain("puertaDelCandado(confirmadas, papeles)");
    expect(src).toContain("del.filter(esProvisionalDeDocumento)");
    expect(src).not.toContain("MIN_CONFIRMADAS_POR_PILAR");
  });
});

describe("cierre · el disparo automático no deja lo guardado con el rótulo de ayer (jobs/auto.ts)", () => {
  const af = (id: string, estadoClaim: string, tipo = "entrevista", extra: Fila = {}): Fila => ({ id, company_id: EMPRESA, pilar: "personas", estado: estadoClaim, vigente_hasta: null, sources: { tipo }, ...extra });
  const confirmadasDeHoy = (n: number): Fila[] => Array.from({ length: n }, (_, i) => af(`c${i + 1}`, "confirmado"));
  /** Hallazgo guardado tal como lo lee el disparo: con el estado de HOY de cada afirmación que lo sostiene. */
  const guardado = (id: string, sustento: Fila[], extra: Fila = {}): Fila => ({ id, company_id: EMPRESA, pilar: "personas", origen: "ia", estado_revision: "aprobado", provisional: false, confianza: 0.55, finding_evidence: sustento.map((claims) => ({ claim_id: claims.id, relacion: "sustenta", claims })), ...extra });
  const tarjeta = (estadoPilar: string): Fila => ({ company_id: EMPRESA, pilar: "personas", estado: estadoPilar });
  const disparar = async (tablas: { claims: Fila[]; findings?: Fila[]; diagnoses?: Fila[]; jobs?: Fila[] }, fallar: Record<string, string> = {}) => {
    estado.base = crearBaseFalsa({ jobs: [], findings: [], diagnoses: [], error_log: [], ...tablas }, fallar);
    estado.encolados = [];
    const { dispararDiagnosticoSiListo } = await import("@/lib/jobs/auto");
    return dispararDiagnosticoSiListo(EMPRESA);
  };
  const RELECTURA = { company_id: EMPRESA, tipo: "diagnosticar", payload: { pilar: "personas", solo_releer: true } };

  beforeEach(() => { estado.clavesHechas = []; });
  afterEach(() => { estado.clavesHechas = []; });

  it("el área bajó de 5 confirmadas después de diagnosticarse → se encola una relectura (sin modelo), no un diagnóstico", async () => {
    const cuatro = confirmadasDeHoy(4);
    // Lo aprobado sigue guardado como conclusión y la tarjeta del área conserva su estado de cuando tenía cinco.
    expect(await disparar({ claims: cuatro, findings: [guardado("f-era-conclusion", [cuatro[0]])], diagnoses: [tarjeta("critico")] })).toEqual([]);
    expect(estado.encolados).toHaveLength(1);
    expect(estado.encolados[0]).toMatchObject(RELECTURA);
    // Sin clave propia: viva, es un solo trabajo; terminada, la cola abre la ronda siguiente. Con una clave fija por
    // nivel, un área que bajara dos veces al mismo número se quedaría sin releer la segunda.
    expect(estado.encolados[0]).not.toHaveProperty("idempotency_key");
  });

  it("cada causa basta sola: la tarjeta que aún dice una conclusión, o un pendiente de la IA guardado como conclusión; y si todo dice lo de hoy, nada", async () => {
    const cuatro = confirmadasDeHoy(4);
    await disparar({ claims: cuatro, diagnoses: [tarjeta("mejorable")] });
    expect(estado.encolados, "solo la tarjeta").toEqual([expect.objectContaining(RELECTURA)]);
    await disparar({ claims: cuatro, findings: [guardado("f-pendiente", [cuatro[0]], { estado_revision: "pendiente", confianza: null })] });
    expect(estado.encolados, "solo el pendiente").toEqual([expect.objectContaining(RELECTURA)]);
    await disparar({ claims: cuatro, findings: [guardado("f-al-dia", [cuatro[0]], { provisional: true }), guardado("f-pendiente-al-dia", [cuatro[1]], { estado_revision: "pendiente", provisional: true })], diagnoses: [tarjeta("desconocido")] });
    expect(estado.encolados, "todo al día").toHaveLength(0);
    // Con sus cinco confirmadas, una tarjeta con conclusión y un hallazgo con su evidencia confirmada están al día.
    estado.clavesHechas = ["auto-diag|c1|personas|1"];
    const cinco = confirmadasDeHoy(5);
    await disparar({ claims: cinco, findings: [guardado("f-conclusion", [cinco[0]])], diagnoses: [tarjeta("critico")] });
    expect(estado.encolados, "área con su mínimo").toHaveLength(0);
  });

  it("no encola lo que el manejador no relee: sin esa regla común la relectura se pediría sin fin", async () => {
    const cuatro = confirmadasDeHoy(4);
    await disparar({ claims: cuatro, findings: [
      // Aprobado antes de que existieran las columnas: sin lectura, una máquina no le cambia el rótulo.
      guardado("f-sin-lectura", [cuatro[0]], { confianza: null }),
      // Sin nada que lo sostenga no hay con qué releer.
      guardado("f-sin-sustento", []),
      guardado("f-solo-contraria", [], { finding_evidence: [{ claim_id: "c1", relacion: "contradice", claims: cuatro[0] }] }),
      guardado("f-rechazado", [cuatro[0]], { estado_revision: "rechazado" }),
      // Lo de la consultora responde por su evidencia, que está confirmada: el candado del área no lo alcanza.
      guardado("f-consultora", [cuatro[0]], { origen: "consultor" }),
      guardado("f-consultora-pendiente", [cuatro[0]], { origen: "consultor", estado_revision: "pendiente" }),
      guardado("f-otra-area", [cuatro[0]], { pilar: "area-que-no-existe" }),
    ] });
    expect(estado.encolados).toHaveLength(0);
  });

  it("la consultora escribió sobre un papel sin confirmar y el dueño lo confirmó después: aunque ese nivel ya se diagnosticó, se encola la relectura que le levanta el rótulo", async () => {
    const papel = af("d1", "confirmado", "documento");
    const claims = [...confirmadasDeHoy(6), papel];
    const hallazgoDeLaConsultora = guardado("f-consultora", [papel], { origen: "consultor", provisional: true, confianza: 0.2 });
    // 7 confirmadas: nivel 2, y la cola ya tiene hecho el diagnóstico de ese nivel. No corre ningún diagnóstico.
    estado.clavesHechas = ["auto-diag|c1|personas|2"];
    await disparar({ claims, findings: [hallazgoDeLaConsultora] });
    expect(estado.encolados).toEqual([expect.objectContaining(RELECTURA)]);
    // Si el diagnóstico de ese nivel sí se encola, basta él: al correr relee. No se apila una relectura al lado.
    estado.clavesHechas = [];
    expect(await disparar({ claims, findings: [hallazgoDeLaConsultora] })).toEqual(["personas"]);
    expect(estado.encolados.map((j) => j.payload)).toEqual([{ pilar: "personas" }]);
    // Y mientras el papel siga sin confirmar, el rótulo es el de hoy: nada que releer.
    estado.clavesHechas = ["auto-diag|c1|personas|2"];
    const sinConfirmar = af("d1", "sin_verificar", "documento");
    await disparar({ claims: [...confirmadasDeHoy(6), sinConfirmar], findings: [guardado("f-consultora", [sinConfirmar], { origen: "consultor", provisional: true, confianza: 0.2 })] });
    expect(estado.encolados).toHaveLength(0);
    // Una confirmada que ya venció no sostiene una conclusión: mismo criterio que el manejador (vigente_hasta).
    const vencido = af("d1", "confirmado", "documento", { vigente_hasta: "2020-01-01" });
    await disparar({ claims: [...confirmadasDeHoy(6), vencido], findings: [guardado("f-consultora", [vencido], { origen: "consultor", provisional: true, confianza: 0.2 })] });
    expect(estado.encolados).toHaveLength(0);
  });

  it("un pendiente de la IA en un área con su mínimo, nacido sobre un papel que el dueño confirmó después: aunque ese nivel ya se diagnosticó, se encola la relectura", async () => {
    const papel = af("d1", "confirmado", "documento");
    const claims = [...confirmadasDeHoy(6), papel];
    const pendienteDeLaIA = (sustento: Fila, extra: Fila = {}) => guardado("f-pendiente", [sustento], { estado_revision: "pendiente", provisional: true, confianza: 0.2, ...extra });
    // 7 confirmadas: nivel 2, y la cola ya tiene hecho el diagnóstico de ese nivel. Nadie va a recrear ese pendiente.
    estado.clavesHechas = ["auto-diag|c1|personas|2"];
    await disparar({ claims, findings: [pendienteDeLaIA(papel)] });
    expect(estado.encolados).toEqual([expect.objectContaining(RELECTURA)]);
    // Si el diagnóstico de ese nivel sí se encola, basta él: al correr borra y recrea los pendientes.
    estado.clavesHechas = [];
    expect(await disparar({ claims, findings: [pendienteDeLaIA(papel)] })).toEqual(["personas"]);
    expect(estado.encolados.map((j) => j.payload)).toEqual([{ pilar: "personas" }]);
    // Mientras el papel siga sin confirmar, el rótulo es el de hoy: nada que releer.
    estado.clavesHechas = ["auto-diag|c1|personas|2"];
    const sinConfirmar = af("d1", "sin_verificar", "documento");
    await disparar({ claims: [...confirmadasDeHoy(6), sinConfirmar], findings: [pendienteDeLaIA(sinConfirmar)] });
    expect(estado.encolados).toHaveLength(0);
    // Y al revés: guardado como conclusión, y lo que lo sostenía ya no está confirmado.
    await disparar({ claims: [...confirmadasDeHoy(6), sinConfirmar], findings: [pendienteDeLaIA(sinConfirmar, { provisional: false, confianza: 0.55 })] });
    expect(estado.encolados).toEqual([expect.objectContaining(RELECTURA)]);
    // Con una contradicción abierta en el área tampoco se queda sin releer: el diagnóstico espera, la relectura no.
    expect(await disparar({ claims: [...claims, af("x1", "contradicho")], findings: [pendienteDeLaIA(papel)] })).toEqual([]);
    expect(estado.encolados).toEqual([expect.objectContaining(RELECTURA)]);
  });

  it("la regla pura: el pendiente de la IA se relee en todo trabajo que no lo recrea, y rotulosDesfasados lo cuenta también con el área en su mínimo", async () => {
    const { seRelee } = await import("@/lib/jobs/handlers/diagnostico");
    const { rotulosDesfasados } = await import("@/lib/jobs/auto");
    const pendiente = { pilar: "personas", origen: "ia", estado_revision: "pendiente", confianza: 0.2 };
    expect(seRelee(pendiente, true)).toBe(true);
    // Cuando el trabajo diagnostica, los pendientes se borran y se recrean: no se releen.
    expect(seRelee(pendiente, false)).toBe(false);
    expect(seRelee({ ...pendiente, origen: "consultor" }, true)).toBe(false);
    const sostenidoPor = (estadoClaim: string) => [{ relacion: "sustenta", claims: { estado: estadoClaim } }];
    // El caso del verificador: área con 7 confirmadas, pendiente provisional, su papel ya confirmado. Antes daba 0.
    expect(rotulosDesfasados([{ ...pendiente, provisional: true, finding_evidence: sostenidoPor("confirmado") }], 7)).toBe(1);
    expect(rotulosDesfasados([{ ...pendiente, provisional: true, finding_evidence: sostenidoPor("sin_verificar") }], 7)).toBe(0);
    expect(rotulosDesfasados([{ ...pendiente, provisional: false, finding_evidence: sostenidoPor("sin_verificar") }], 7)).toBe(1);
    expect(rotulosDesfasados([{ ...pendiente, provisional: false, finding_evidence: sostenidoPor("confirmado") }], 7)).toBe(0);
    // En un área corta el candado sigue valiendo: su papel confirmado no lo vuelve conclusión.
    expect(rotulosDesfasados([{ ...pendiente, provisional: true, finding_evidence: sostenidoPor("confirmado") }], 4)).toBe(0);
    // Lo que no tiene con qué releerse no cuenta.
    expect(rotulosDesfasados([{ ...pendiente, provisional: true, finding_evidence: [] }], 7)).toBe(0);
  });

  // FUERA DE LA LISTA DE ESTE REMATE (src/app/api/sources/[id]/consolidar/route.ts). Confirmar una extracción es el
  // camino normal de los papeles y hoy no llama a dispararDiagnosticoSiListo: lo que afirman las pruebas de este bloque
  // ocurre en el siguiente evento que sí pasa por el disparo (validar una afirmación, un contraste), no al confirmar.
  it.todo("confirmar una extracción (POST /api/sources/[id]/consolidar) llama a dispararDiagnosticoSiListo: el área se vuelve a leer en el momento, sin esperar a otro evento");

  it("con una contradicción abierta no hay diagnóstico, pero lo guardado sí se relee: el dueño confirmó lo que sostenía un hallazgo aprobado", async () => {
    const papel = af("d1", "confirmado", "documento");
    expect(await disparar({ claims: [...confirmadasDeHoy(5), papel, af("x1", "contradicho")], findings: [guardado("f-aprobado", [papel], { provisional: true, confianza: 0.2 })] })).toEqual([]);
    expect(estado.encolados).toEqual([expect.objectContaining(RELECTURA)]);
  });

  it("no apila: con cualquier trabajo del área en cola no encola otra relectura; y una relectura en cola no frena el diagnóstico que toca", async () => {
    const cuatro = confirmadasDeHoy(4);
    const enCola = (payload: Fila): Fila[] => [{ company_id: EMPRESA, tipo: "diagnosticar", estado: "pendiente", payload }];
    for (const payload of [{ pilar: "personas", solo_releer: true }, { pilar: "personas" }]) {
      await disparar({ claims: cuatro, diagnoses: [tarjeta("critico")], jobs: enCola(payload) });
      expect(estado.encolados, JSON.stringify(payload)).toHaveLength(0);
    }
    expect(await disparar({ claims: confirmadasDeHoy(5), jobs: enCola({ pilar: "personas", solo_releer: true }) })).toEqual(["personas"]);
    expect(estado.encolados.map((j) => j.payload)).toEqual([{ pilar: "personas" }]);
  });

  it("si lo guardado no se puede leer no se calla, y los diagnósticos siguen su curso", async () => {
    // Área con su mínimo: el diagnóstico se dispara igual; lo que no se pudo saber queda escrito.
    expect(await disparar({ claims: confirmadasDeHoy(5) }, { "findings:select": "la base no responde" })).toEqual(["personas"]);
    expect(estado.encolados.map((j) => j.payload)).toEqual([{ pilar: "personas" }]);
    expect(estado.base!.tablas.error_log).toHaveLength(1);
    expect(estado.base!.tablas.error_log[0]).toMatchObject({ ruta: "jobs/auto", company_id: EMPRESA, detalle: "la base no responde" });
    expect(estado.base!.tablas.error_log[0].mensaje).toContain("ninguna relectura se disparó sola");
    // Área corta con la tarjeta vieja, y la tarjeta no se puede leer: no se adivina que está al día ni que no.
    await disparar({ claims: confirmadasDeHoy(4), diagnoses: [tarjeta("critico")] }, { "diagnoses:select": "sin permiso" });
    expect(estado.encolados).toHaveLength(0);
    expect(estado.base!.tablas.error_log[0]).toMatchObject({ detalle: "sin permiso" });
  });

  describe("de punta a punta con el manejador: lo que la relectura deja escrito es lo que el disparo compara", () => {
    beforeEach(() => {
      estado.diagnosticador.mockReset();
      estado.auditor.mockReset();
    });
    const sustenta = (c: Fila): Fila => ({ claim_id: c.id, relacion: "sustenta", claims: c });
    const fila = (id: string) => estado.base!.tablas.findings.find((x) => x.id === id)!;

    it("área que bajó del mínimo: una relectura la pone al día y la siguiente vez no se encola nada (no hay bucle)", async () => {
      const claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4")];
      const comun = { company_id: EMPRESA, pilar: "personas", origen: "ia", requiere_validacion: false, provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas", auditoria: { sustentado: true } };
      estado.claims = claims;
      estado.base = crearBaseFalsa({
        ...baseVacia().tablas, claims, error_log: [],
        diagnoses: [{ company_id: EMPRESA, pilar: "personas", estado: "critico", resumen: "Lectura del modelo de cuando había cinco." }],
        findings: [
          { ...comun, id: "f-aprobado", titulo: "Aprobado", estado_revision: "aprobado", finding_evidence: [sustenta(claims[0])] },
          { ...comun, id: "f-pendiente", titulo: "Pendiente", estado_revision: "pendiente", finding_evidence: [sustenta(claims[1])] },
        ],
      });
      estado.encolados = [];
      const { dispararDiagnosticoSiListo } = await import("@/lib/jobs/auto");
      const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
      expect(await dispararDiagnosticoSiListo(EMPRESA)).toEqual([]);
      expect(estado.encolados).toHaveLength(1);
      // Mientras la relectura espera en la cola, el plan y «Lo que encontramos» ya no lo dan por conclusión: la frontera
      // lee el candado del área con los hechos de hoy, aunque la columna todavía diga provisional = false.
      const { hallazgosAprobadosConEvidencia } = await import("@/lib/db/queries");
      expect(fila("f-aprobado").provisional).toBe(false);
      expect(await hallazgosAprobadosConEvidencia(EMPRESA)).toHaveLength(0);
      const r = await handleDiagnosticar({ id: "jr1", company_id: EMPRESA, payload: estado.encolados[0].payload });
      expect(r).toEqual({ estado: "desconocido", confirmadas: 4, afirmaciones_provisionales: 0, revisados_releidos: 1, revisados_cambiados: 1, pendientes_pasados_a_provisional: 1 });
      expect(estado.diagnosticador).not.toHaveBeenCalled();
      for (const id of ["f-aprobado", "f-pendiente"]) expect(fila(id), id).toMatchObject({ provisional: true });
      expect(estado.base!.tablas.diagnoses[0]).toMatchObject({ estado: "desconocido", resumen: RESUMEN_SIN_INFORMACION });
      // Con la columna ya al día, tampoco lo leen los que solo miran la columna (el plan estratégico, los indicadores).
      expect(await hallazgosAprobadosConEvidencia(EMPRESA)).toHaveLength(0);
      estado.encolados = [];
      expect(await dispararDiagnosticoSiListo(EMPRESA)).toEqual([]);
      expect(estado.encolados).toHaveLength(0);
    });

    it("el hallazgo de la consultora sobre un papel que el dueño confirmó después: la relectura le levanta el rótulo sin llamar al modelo, y vuelve a contar para el plan", async () => {
      const papel: Fila = { ...deDocumento("d1"), estado: "confirmado" };
      const claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), confirmada("c5"), confirmada("c6"), papel];
      estado.claims = claims;
      estado.base = crearBaseFalsa({
        ...baseVacia().tablas, claims, error_log: [],
        findings: [{ id: "f-consultora", company_id: EMPRESA, pilar: "personas", origen: "consultor", estado_revision: "aprobado", requiere_validacion: false, titulo: "Nadie cuenta la caja", impacto: "alto", provisional: true, confianza: 0.2, confianza_motivo: "se apoya en 1 afirmación de documento no confirmada; ningún hecho comprobado contra datos; una sola fuente", auditoria: null, finding_evidence: [sustenta(papel)] }],
      });
      estado.encolados = [];
      // El diagnóstico de este nivel (7 confirmadas) ya se hizo: el disparo no puede contar con que otro corra.
      estado.clavesHechas = ["auto-diag|c1|personas|2"];
      const { dispararDiagnosticoSiListo } = await import("@/lib/jobs/auto");
      const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
      const { hallazgosAprobadosConEvidencia } = await import("@/lib/db/queries");
      expect(await hallazgosAprobadosConEvidencia(EMPRESA)).toHaveLength(0);
      await dispararDiagnosticoSiListo(EMPRESA);
      expect(estado.encolados).toHaveLength(1);
      expect(estado.encolados[0].payload).toEqual({ pilar: "personas", solo_releer: true });
      const r = await handleDiagnosticar({ id: "jr2", company_id: EMPRESA, payload: estado.encolados[0].payload });
      expect(r).toEqual({ estado: "releido", pilar: "personas", confirmadas: 7, revisados_releidos: 1, revisados_cambiados: 1 });
      expect(estado.diagnosticador).not.toHaveBeenCalled();
      expect(fila("f-consultora")).toMatchObject({ estado_revision: "aprobado", provisional: false });
      expect(fila("f-consultora").confianza).toBeGreaterThan(0.2);
      expect((await hallazgosAprobadosConEvidencia(EMPRESA)).map((f) => f.id)).toEqual(["f-consultora"]);
      estado.encolados = [];
      await dispararDiagnosticoSiListo(EMPRESA);
      expect(estado.encolados).toHaveLength(0);
    });

    it("el pendiente de la IA de un área con su mínimo, cuyo papel el dueño confirmó después: la relectura le levanta el rótulo sin modelo y sin recrearlo; el dueño deja de leer «falta volver a revisarlo» y los indicadores ya lo leen", async () => {
      const papel: Fila = { ...deDocumento("d1"), estado: "confirmado" };
      const claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), confirmada("c5"), confirmada("c6"), papel];
      const tarjetaVigente = { company_id: EMPRESA, pilar: "personas", estado: "mejorable", resumen: "La conclusión vigente." };
      estado.claims = claims;
      estado.base = crearBaseFalsa({
        ...baseVacia().tablas, claims, error_log: [],
        diagnoses: [{ ...tarjetaVigente }],
        findings: [{ id: "f-pendiente", company_id: EMPRESA, pilar: "personas", origen: "ia", estado_revision: "pendiente", requiere_validacion: false, titulo: "Nadie cuenta la caja", causa_raiz: "No hay arqueo diario", impacto: "alto", impacto_potencial: "alto", veredicto: "improve", recomendacion: "Arqueo al cierre", filtros: {}, patron: null, provisional: true, confianza: 0.2, confianza_motivo: "se apoya en 1 afirmación de documento no confirmada; ningún hecho comprobado contra datos; una sola fuente", auditoria: { sustentado: true }, finding_evidence: [sustenta(papel)] }],
      });
      estado.encolados = [];
      estado.medidor.mockReset();
      estado.medidor.mockResolvedValue(respuestaModelo({ indicadores: [] }));
      // El diagnóstico de este nivel (7 confirmadas) ya se hizo: nadie va a recrear ese pendiente.
      estado.clavesHechas = ["auto-diag|c1|personas|2"];
      const { dispararDiagnosticoSiListo } = await import("@/lib/jobs/auto");
      const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
      const { handleProponerIndicadores } = await import("@/lib/jobs/handlers/indicadores");
      const { empresaHoy } = await import("@/lib/hoy");
      // ANTES: el dueño lo lee como algo que falta volver a revisar, y los indicadores no lo ven.
      const antes = await empresaHoy(EMPRESA);
      expect(antes.porConfirmar.map((p) => [p.id, p.motivo])).toEqual([["f-pendiente", "pendiente_de_releer"]]);
      expect(antes.porConfirmar[0].porQue).toContain("Falta volver a revisarlo");
      expect(antes.noVes).toHaveLength(0);
      expect(await handleProponerIndicadores({ id: "ji-antes", company_id: EMPRESA, payload: {} })).toMatchObject({ indicadores: 0, motivo: "todavía no hay incidencias ni hallazgos de los que salgan números" });
      expect(estado.medidor).not.toHaveBeenCalled();
      // El disparo lo detecta y encola un trabajo que solo relee (el diagnóstico de ese nivel ya estaba hecho).
      await dispararDiagnosticoSiListo(EMPRESA);
      expect(estado.encolados.map((j) => j.payload)).toEqual([{ pilar: "personas", solo_releer: true }]);
      const r = await handleDiagnosticar({ id: "jr3", company_id: EMPRESA, payload: estado.encolados[0].payload });
      expect(r).toEqual({ estado: "releido", pilar: "personas", confirmadas: 7, revisados_releidos: 0, revisados_cambiados: 0, pendientes_que_dejan_de_ser_provisionales: 1 });
      expect(estado.diagnosticador).not.toHaveBeenCalled();
      expect(estado.auditor).not.toHaveBeenCalled();
      // Es el mismo hallazgo, todavía pendiente de revisión: solo cambió lo que dice de su certeza.
      expect(estado.base!.tablas.findings).toHaveLength(1);
      expect(fila("f-pendiente")).toMatchObject({ estado_revision: "pendiente", titulo: "Nadie cuenta la caja", provisional: false });
      expect(fila("f-pendiente").confianza).toBeGreaterThan(0.2);
      expect(fila("f-pendiente").confianza_motivo).toContain("las 1 afirmaciones están confirmadas");
      expect(estado.base!.tablas.diagnoses).toEqual([tarjetaVigente]);
      // DESPUÉS: en Mi empresa hoy es una conclusión y ya no hay nada «por revisar de nuevo»; los indicadores lo leen.
      const despues = await empresaHoy(EMPRESA);
      expect(despues.porConfirmar).toHaveLength(0);
      expect(despues.noVes.map((h) => h.id)).toEqual(["f-pendiente"]);
      await handleProponerIndicadores({ id: "ji-despues", company_id: EMPRESA, payload: {} });
      expect(estado.medidor).toHaveBeenCalledTimes(1);
      expect(estado.medidor.mock.calls[0][0] as string).toContain("Nadie cuenta la caja");
      // Y no hay bucle: lo que la relectura dejó escrito es lo que el disparo compara.
      estado.encolados = [];
      await dispararDiagnosticoSiListo(EMPRESA);
      expect(estado.encolados).toHaveLength(0);
    });
  });
});

describe("releerEvidencia · la regla pura que comparten la revisión y el rediagnóstico", () => {
  const ev = (id: string, estadoClaim: string, autor: string) => ({ id, source_id: `s-${id}`, participant_id: null, estado: estadoClaim, source_tipo: "documento", source_autor: autor });
  const HOY = "2026-10-13";

  it("sin evidencia no hay con qué releer: null (la falta de dato no es cero)", async () => {
    const { releerEvidencia } = await import("@/lib/jobs/handlers/diagnostico");
    expect(releerEvidencia([], { origen: "ia", confirmadasDelPilar: 9 })).toBeNull();
  });

  it("pilar con el mínimo de confirmadas: decide la evidencia propia, igual que confianzaDeHallazgo", async () => {
    const { releerEvidencia } = await import("@/lib/jobs/handlers/diagnostico");
    const { confianzaDeHallazgo } = await import("@/lib/rules/evidencia");
    const evidencia = [ev("a", "confirmado", "Rosa"), ev("b", "confirmado", "Contador")];
    const esperado = confianzaDeHallazgo(evidencia, HOY);
    expect(releerEvidencia(evidencia, { origen: "ia", confirmadasDelPilar: 5, hoy: HOY })).toEqual({ provisional: false, confianza: esperado.confianza, confianza_motivo: esperado.motivo });
    expect(releerEvidencia([ev("a", "sin_verificar", "Rosa")], { origen: "ia", confirmadasDelPilar: 5, hoy: HOY })).toMatchObject({ provisional: true, confianza: 0.2 });
  });

  it("pilar por debajo del mínimo: un hallazgo de la IA sigue provisional aunque TODA su evidencia esté confirmada, con confianza bajo el tope y el porqué", async () => {
    const { releerEvidencia, TOPE_CONFIANZA_MODO_PROVISIONAL } = await import("@/lib/jobs/handlers/diagnostico");
    const r = releerEvidencia([ev("a", "confirmado", "Rosa"), ev("b", "confirmado", "Contador")], { origen: "ia", confirmadasDelPilar: 2, hoy: HOY })!;
    expect(r.provisional).toBe(true);
    expect(r.confianza).toBe(TOPE_CONFIANZA_MODO_PROVISIONAL);
    expect(r.confianza_motivo).toContain("las 2 afirmaciones están confirmadas");
    expect(r.confianza_motivo).toContain("el pilar tiene 2 afirmaciones confirmadas de las 5 que exige una conclusión: todo el diagnóstico es provisional");
    // Con una sola confirmada en el pilar el texto concuerda en singular.
    expect(releerEvidencia([ev("a", "confirmado", "Rosa")], { origen: "ia", confirmadasDelPilar: 1, hoy: HOY })!.confianza_motivo).toContain("el pilar tiene 1 afirmación confirmada de las 5");
  });

  it("el candado del pilar no alcanza a lo que escribió el consultor, ni se supone cuando no se sabe cuántas confirmadas hay", async () => {
    const { releerEvidencia } = await import("@/lib/jobs/handlers/diagnostico");
    const evidencia = [ev("a", "confirmado", "Rosa")];
    expect(releerEvidencia(evidencia, { origen: "consultor", confirmadasDelPilar: 0, hoy: HOY })!.provisional).toBe(false);
    expect(releerEvidencia(evidencia, { origen: "ia", confirmadasDelPilar: null, hoy: HOY })!.provisional).toBe(false);
    expect(releerEvidencia(evidencia, { origen: "ia", hoy: HOY })!.provisional).toBe(false);
  });

  it("si el auditor no lo sustentó, releer no levanta ese techo; y en un pilar corto pesan los dos", async () => {
    const { releerEvidencia } = await import("@/lib/jobs/handlers/diagnostico");
    const evidencia = [ev("a", "confirmado", "Rosa"), ev("b", "confirmado", "Contador")];
    const r = releerEvidencia(evidencia, { auditoria: { sustentado: false }, origen: "ia", confirmadasDelPilar: 8, hoy: HOY })!;
    expect(r).toMatchObject({ provisional: false, confianza: 0.25 });
    expect(r.confianza_motivo).toContain("el auditor no lo sustenta");
    const corto = releerEvidencia(evidencia, { auditoria: { sustentado: true, benchmark_como_hecho: true }, origen: "ia", confirmadasDelPilar: 3, hoy: HOY })!;
    expect(corto).toMatchObject({ provisional: true, confianza: 0.25 });
    expect(corto.confianza_motivo).toMatch(/el auditor no lo sustenta; el pilar tiene 3 afirmaciones confirmadas/);
  });

  it("conModoProvisional nunca sube la confianza: una lectura ya más baja que el tope se queda como está", async () => {
    const { conModoProvisional } = await import("@/lib/jobs/handlers/diagnostico");
    expect(conModoProvisional({ provisional: false, confianza: 0.9, confianza_motivo: "m" }, 4)).toMatchObject({ provisional: true, confianza: 0.4 });
    expect(conModoProvisional({ provisional: true, confianza: 0.2, confianza_motivo: "m" }, 0)).toMatchObject({ provisional: true, confianza: 0.2 });
  });
});

describe("(b) handleDiagnosticar · con dobles · el pilar se diagnostica en modo provisional o se queda desconocido", () => {
  beforeEach(() => {
    estado.base = baseVacia();
    estado.encolados = [];
    estado.diagnosticador.mockReset();
    estado.auditor.mockReset();
    estado.auditor.mockResolvedValue(respuestaModelo({ auditorias: [] }));
  });

  it("2 confirmadas + 4 de documentos → se diagnostica, y TODOS los hallazgos nacen provisional=true con confianza baja, incluso el que cita una confirmada", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), deDocumento("d1"), deDocumento("d2"), deDocumento("d3"), deDocumento("d4")];
    estado.diagnosticador.mockResolvedValue(respuestaModelo({
      hallazgos: [hallazgo("Solo papeles", ["d1", "d2"]), hallazgo("Papel y dueño", ["c1", "d3"])],
      preguntas_pendientes: [], dimensiones_sin_evidencia: [], resumen_pilar: "Nadie decide sin el dueño.",
    }));
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j1", company_id: EMPRESA, payload: { pilar: "personas" } });

    expect(estado.diagnosticador).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ estado: "desconocido", modo_provisional: true, confirmadas: 2, hallazgos: 2, provisionales: 2, afirmaciones_provisionales: 4 });
    const findings = estado.base!.tablas.findings;
    expect(findings).toHaveLength(2);
    for (const f of findings) {
      expect(f.provisional).toBe(true);
      expect(f.confianza).toBeLessThan(0.5);
      expect(f.confianza_motivo).toContain("2 afirmaciones confirmadas de las 5 que exige una conclusión: todo el diagnóstico es provisional");
      expect(f.impacto_potencial).toBe("alto");
    }
    // El que cita una confirmada tendría provisional=false por su propia evidencia; el modo del pilar manda.
    const conDueno = findings.find((f) => f.titulo === "Papel y dueño")!;
    expect(conDueno.provisional).toBe(true);
    // Dos documentos de autores distintos bastan para el impacto alto, no para la conclusión: por corroborar, nunca crítico.
    const soloPapeles = findings.find((f) => f.titulo === "Solo papeles")!;
    expect(soloPapeles.impacto).toBe("alto");
    expect(soloPapeles.requiere_validacion).toBe(false);
    // El pilar NO concluye: desconocido. Lo que se guarda como resumen es SOLO la frase fija, en palabras de dueño: esa
    // columna la lee el empresario y entra al modelo de alto rendimiento. Ni la lectura del modelo, ni la cuenta interna.
    const diag = estado.base!.tablas.diagnoses.find((d) => d.pilar === "personas")!;
    expect(diag.estado).toBe("desconocido");
    expect(diag.resumen).toBe(RESUMEN_MODO_PROVISIONAL);
    expect(diag.resumen).toBe("Todavía no hay una conclusión sobre esta área: hay poca información confirmada y parte de lo que vimos sale de documentos que falta confirmar.");
    expect(diag.resumen).not.toContain("Nadie decide sin el dueño.");
    expect(diag.resumen).not.toMatch(/\d|afirmaci|definici|pilar|provisional/i);
    // La lectura del modelo no se pierde: viaja aparte, en el resultado del trabajo, para la consultora.
    expect(r).toMatchObject({ lectura_provisional_del_modelo: "Nadie decide sin el dueño." });
    // La evidencia queda enlazada (de ahí vuelve el consultor al papel).
    expect(estado.base!.tablas.finding_evidence.map((e) => e.claim_id).sort()).toEqual(["c1", "d1", "d2", "d3"]);
  });

  it("2 confirmadas + 1 de documento → desconocido como hoy: ni una llamada al modelo, ni un hallazgo", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), deDocumento("d1")];
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j2", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toEqual({ estado: "desconocido", confirmadas: 2, afirmaciones_provisionales: 1, revisados_releidos: 0, revisados_cambiados: 0 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    expect(estado.base!.tablas.findings).toHaveLength(0);
    // El resumen que lee el empresario es una frase de dueño: ni la cuenta interna ni palabras de la casa.
    const diag = estado.base!.tablas.diagnoses[0];
    expect(diag).toMatchObject({ pilar: "personas", estado: "desconocido", resumen: RESUMEN_SIN_INFORMACION });
    expect(diag.resumen).toBe("Todavía no hay una conclusión sobre esta área: nos falta información para darla.");
    expect(diag.resumen).not.toMatch(/\d|afirmaci|definici|pilar|levantar|provisional|personas/i);
  });

  it("una afirmación de entrevista sin verificar NO cuenta como provisional para abrir la puerta: su camino es la validación con el dueño", async () => {
    const entrevistaSinVerificar = (id: string): Fila => ({ ...confirmada(id), estado: "sin_verificar" });
    estado.claims = [confirmada("c1"), confirmada("c2"), entrevistaSinVerificar("e1"), entrevistaSinVerificar("e2"), entrevistaSinVerificar("e3")];
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j3", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toMatchObject({ estado: "desconocido", afirmaciones_provisionales: 0 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
  });

  it("5 confirmadas → puerta normal: cada hallazgo decide su provisionalidad por su propia evidencia", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), confirmada("c5"), deDocumento("d1")];
    estado.diagnosticador.mockResolvedValue(respuestaModelo({
      hallazgos: [hallazgo("Confirmado", ["c1", "c2"], { impacto: "medio" }), hallazgo("Solo un papel", ["d1"], { impacto: "medio" })],
      preguntas_pendientes: [], dimensiones_sin_evidencia: [], resumen_pilar: "Lectura normal.",
    }));
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j4", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toMatchObject({ modo_provisional: false, confirmadas: 5, hallazgos: 2, provisionales: 1 });
    const porTitulo = Object.fromEntries(estado.base!.tablas.findings.map((f) => [f.titulo, f]));
    expect(porTitulo["Confirmado"].provisional).toBe(false);
    expect(porTitulo["Confirmado"].confianza_motivo).not.toContain("todo el diagnóstico es provisional");
    expect(porTitulo["Solo un papel"].provisional).toBe(true);
    // Solo el hallazgo confirmado decide el estado del pilar (medio → mejorable); el provisional no cuenta.
    // Con el mínimo de confirmadas el resumen sí es la lectura del modelo, y no hay nada que llevar aparte.
    expect(estado.base!.tablas.diagnoses[0]).toMatchObject({ estado: "mejorable", resumen: "Lectura normal." });
    expect(r).not.toHaveProperty("lectura_provisional_del_modelo");
  });

  it("modo provisional sin lectura del modelo: el resumen sigue siendo la frase fija y aparte viaja null, no un texto inventado", async () => {
    estado.claims = [confirmada("c1"), deDocumento("d1"), deDocumento("d2"), deDocumento("d3"), deDocumento("d4")];
    estado.diagnosticador.mockResolvedValue(respuestaModelo({ hallazgos: [], preguntas_pendientes: [], dimensiones_sin_evidencia: [] }));
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j5", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toMatchObject({ modo_provisional: true, lectura_provisional_del_modelo: null });
    expect(estado.base!.tablas.diagnoses[0]).toMatchObject({ estado: "desconocido", resumen: RESUMEN_MODO_PROVISIONAL });
  });
});

describe("handleDiagnosticar · con dobles · lo ya revisado relee su evidencia en cada rediagnóstico", () => {
  const sinHallazgos = () => respuestaModelo({ hallazgos: [], preguntas_pendientes: [], dimensiones_sin_evidencia: [], resumen_pilar: null });
  /** Hallazgo ya revisado, tal como lo devuelve la consulta anidada: con su evidencia dentro. */
  const revisado = (id: string, claim_ids: string[], extra: Fila = {}): Fila => ({
    id, company_id: EMPRESA, pilar: "personas", origen: "ia", estado_revision: "aprobado", requiere_validacion: false, titulo: `Revisado ${id}`,
    provisional: true, confianza: 0.2, confianza_motivo: "se apoya en 1 afirmación de documento no confirmada; ningún hecho comprobado contra datos; una sola fuente",
    auditoria: { sustentado: true }, finding_evidence: claim_ids.map((claim_id) => ({ claim_id, relacion: "sustenta" })), ...extra,
  });
  /** La afirmación de documento que el dueño ya confirmó. */
  const documentoConfirmado = (id: string): Fila => ({ ...deDocumento(id), estado: "confirmado" });

  beforeEach(() => {
    estado.base = baseVacia();
    estado.encolados = [];
    estado.diagnosticador.mockReset();
    estado.auditor.mockReset();
    estado.diagnosticador.mockResolvedValue(sinHallazgos());
    estado.auditor.mockResolvedValue(respuestaModelo({ auditorias: [] }));
  });

  it("el dueño confirmó después de la aprobación → al rediagnosticar el hallazgo aprobado deja de ser provisional y su confianza sube", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), documentoConfirmado("d1")];
    estado.base!.tablas.findings.push(revisado("f-aprobado", ["d1"]));
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j10", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toMatchObject({ modo_provisional: false, confirmadas: 5, revisados_releidos: 1, revisados_cambiados: 1 });
    expect(r).not.toHaveProperty("revisados_error");
    const f = estado.base!.tablas.findings.find((x) => x.id === "f-aprobado")!;
    expect(f).toMatchObject({ estado_revision: "aprobado", provisional: false });
    expect(f.confianza).toBeGreaterThan(0.2);
    expect(f.confianza_motivo).toContain("afirmaciones están confirmadas");
  });

  it("y al revés: si lo que lo sostenía ya no está confirmado, vuelve a ser provisional (lo extraído nunca es verificado)", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), confirmada("c5"), deDocumento("d1")];
    estado.base!.tablas.findings.push(revisado("f-caido", ["d1"], { estado_revision: "corregido", provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas" }));
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    await handleDiagnosticar({ id: "j11", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(estado.base!.tablas.findings.find((x) => x.id === "f-caido")).toMatchObject({ estado_revision: "corregido", provisional: true, confianza: 0.2 });
  });

  it("pilar en modo provisional: un hallazgo aprobado de la IA también queda provisional, aunque cite una confirmada", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), deDocumento("d1"), deDocumento("d2"), deDocumento("d3")];
    estado.base!.tablas.findings.push(revisado("f-pilar-corto", ["c1"], { provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas" }));
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j12", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toMatchObject({ modo_provisional: true, revisados_releidos: 1, revisados_cambiados: 1 });
    const f = estado.base!.tablas.findings.find((x) => x.id === "f-pilar-corto")!;
    expect(f.provisional).toBe(true);
    expect(f.confianza).toBeLessThanOrEqual(0.4);
    expect(f.confianza_motivo).toContain("el pilar tiene 2 afirmaciones confirmadas de las 5 que exige una conclusión");
  });

  it("no toca lo que no le corresponde: lo rechazado, lo de otro pilar, lo que no tiene evidencia y lo que ya dice lo mismo", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), documentoConfirmado("d1")];
    const yaAlDia = revisado("f-al-dia", ["d1"]);
    const intactos = [
      revisado("f-rechazado", ["d1"], { estado_revision: "rechazado" }),
      revisado("f-otro-pilar", ["d1"], { pilar: "producto" }),
      revisado("f-sin-evidencia", []),
      revisado("f-evidencia-borrada", ["ya-no-existe"]),
      revisado("f-solo-contraria", [], { finding_evidence: [{ claim_id: "d1", relacion: "contradice" }] }),
    ];
    // Aprobado antes de que existieran estas columnas: sin confianza escrita y con el provisional = false que pone la base
    // por defecto. Su evidencia no está confirmada, pero una máquina no le cambia el rótulo a lo que una persona aprobó sin él.
    const anterior = revisado("f-anterior-a-la-migracion", ["x-sin-confirmar"], { provisional: false, confianza: null, confianza_motivo: null });
    estado.claims.push(deDocumento("x-sin-confirmar"));
    estado.base!.tablas.findings.push(anterior);
    estado.base!.tablas.findings.push(yaAlDia, ...intactos);
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    // Primera pasada: solo f-al-dia tiene con qué releerse, y cambia.
    const r1 = await handleDiagnosticar({ id: "j13", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r1).toMatchObject({ revisados_releidos: 1, revisados_cambiados: 1 });
    for (const f of intactos) expect(estado.base!.tablas.findings.find((x) => x.id === f.id), f.id).toMatchObject({ provisional: true, confianza: 0.2 });
    expect(estado.base!.tablas.findings.find((x) => x.id === "f-anterior-a-la-migracion")).toMatchObject({ provisional: false, confianza: null, confianza_motivo: null });
    // Segunda pasada sin nada nuevo: se relee, no se escribe.
    const r2 = await handleDiagnosticar({ id: "j14", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r2).toMatchObject({ revisados_releidos: 1, revisados_cambiados: 0 });
  });

  it("lo que escribió la consultora también se relee, por su propia evidencia y sin el candado del área", async () => {
    // Área con 3 confirmadas (dos del dueño y el papel que acaba de confirmar) y un papel más sin confirmar: desconocida.
    estado.claims = [confirmada("c1"), confirmada("c2"), documentoConfirmado("d1"), deDocumento("d2")];
    estado.base!.tablas.findings.push(
      // Nació provisional sobre un papel que el dueño ya confirmó: deja de serlo, aunque del área se sepa poco.
      revisado("f-consultora", ["d1"], { origen: "consultor", auditoria: null }),
      // Y al revés: lo que la sostenía ya no está confirmado.
      revisado("f-consultora-caido", ["d2"], { origen: "consultor", auditoria: null, estado_revision: "corregido", provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas" }),
      // Escrito antes de que su hallazgo leyera la evidencia: sin lectura, una máquina no le pone rótulo.
      revisado("f-consultora-sin-lectura", ["d2"], { origen: "consultor", auditoria: null, provisional: false, confianza: null, confianza_motivo: null }),
      // El de la IA con la misma evidencia confirmada sigue provisional: a ese sí lo alcanza el candado del área.
      revisado("f-ia", ["d1"]),
    );
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j17", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toEqual({ estado: "desconocido", confirmadas: 3, afirmaciones_provisionales: 1, revisados_releidos: 3, revisados_cambiados: 3 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    const fila = (id: string) => estado.base!.tablas.findings.find((x) => x.id === id)!;
    expect(fila("f-consultora")).toMatchObject({ estado_revision: "aprobado", provisional: false });
    expect(fila("f-consultora").confianza).toBeGreaterThan(0.2);
    expect(fila("f-consultora").confianza_motivo).toContain("las 1 afirmaciones están confirmadas");
    expect(fila("f-consultora").confianza_motivo).not.toContain("todo el diagnóstico es provisional");
    expect(fila("f-consultora-caido")).toMatchObject({ estado_revision: "corregido", provisional: true, confianza: 0.2 });
    expect(fila("f-consultora-sin-lectura")).toMatchObject({ provisional: false, confianza: null, confianza_motivo: null });
    expect(fila("f-ia").provisional).toBe(true);
    expect(fila("f-ia").confianza_motivo).toContain("el pilar tiene 3 afirmaciones confirmadas de las 5 que exige una conclusión");
    // Segunda pasada sin nada nuevo: se relee, no se escribe.
    expect(await handleDiagnosticar({ id: "j17b", company_id: EMPRESA, payload: { pilar: "personas" } })).toMatchObject({ revisados_releidos: 3, revisados_cambiados: 0 });
  });

  it("con una contradicción abierta espera a la persona, pero antes relee: lo que el dueño ya confirmó deja de ser provisional", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), confirmada("c5"), documentoConfirmado("d1"), { ...confirmada("x1"), estado: "contradicho" }];
    estado.base!.tablas.findings.push(
      revisado("f-aprobado", ["d1"]),
      revisado("f-consultora", ["d1"], { origen: "consultor", auditoria: null }),
      // El pendiente de la IA también: mientras el área espera nadie lo va a recrear, y lo que lo sostiene ya está confirmado.
      revisado("f-pendiente", ["d1"], { estado_revision: "pendiente" }),
    );
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j18", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toEqual({ estado: "esperando_validacion", contradicciones_abiertas: 1, pilar: "personas", revisados_releidos: 2, revisados_cambiados: 2, pendientes_que_dejan_de_ser_provisionales: 1 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    const fila = (id: string) => estado.base!.tablas.findings.find((x) => x.id === id)!;
    expect(fila("f-aprobado").provisional).toBe(false);
    expect(fila("f-consultora").provisional).toBe(false);
    expect(fila("f-pendiente")).toMatchObject({ estado_revision: "pendiente", provisional: false });
    expect(fila("f-pendiente").confianza).toBeGreaterThan(0.2);
    // El área tiene su mínimo: su tarjeta no se toca mientras espera.
    expect(estado.base!.tablas.diagnoses).toHaveLength(0);
  });

  it("área que bajó del mínimo con una contradicción abierta: lo guardado deja de pasar por conclusión y la tarjeta ya no dice la de antes", async () => {
    const contradicha: Fila = { ...confirmada("x1"), estado: "contradicho" };
    const eraConclusion = (id: string, extra: Fila = {}) => revisado(id, ["c1"], { provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas", ...extra });
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    // 4 confirmadas, un papel y un punto por aclarar: abriría la segunda puerta, pero espera.
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), deDocumento("d1"), contradicha];
    estado.base!.tablas.diagnoses.push({ company_id: EMPRESA, pilar: "personas", estado: "critico", resumen: "Lectura del modelo de cuando había cinco." });
    estado.base!.tablas.findings.push(eraConclusion("f-aprobado"), eraConclusion("f-pendiente", { estado_revision: "pendiente" }));
    const conPapel = await handleDiagnosticar({ id: "j19", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(conPapel).toEqual({ estado: "esperando_validacion", contradicciones_abiertas: 1, pilar: "personas", revisados_releidos: 1, revisados_cambiados: 1, pendientes_pasados_a_provisional: 1 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    for (const f of estado.base!.tablas.findings) {
      expect(f.provisional, f.id).toBe(true);
      expect(f.confianza_motivo, f.id).toContain("el pilar tiene 4 afirmaciones confirmadas de las 5 que exige una conclusión");
    }
    expect(estado.base!.tablas.diagnoses).toEqual([{ company_id: EMPRESA, pilar: "personas", estado: "desconocido", resumen: RESUMEN_MODO_PROVISIONAL }]);
    // Sin el papel ni con la segunda puerta llega: el resultado dice las dos cosas, que falta información y que hay un punto por aclarar.
    estado.base = baseVacia();
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), contradicha];
    estado.base!.tablas.diagnoses.push({ company_id: EMPRESA, pilar: "personas", estado: "critico", resumen: "Lectura del modelo de cuando había cinco." });
    estado.base!.tablas.findings.push(eraConclusion("f-aprobado"));
    const sinPapel = await handleDiagnosticar({ id: "j19b", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(sinPapel).toEqual({ estado: "desconocido", confirmadas: 4, afirmaciones_provisionales: 0, contradicciones_abiertas: 1, revisados_releidos: 1, revisados_cambiados: 1 });
    expect(estado.base!.tablas.findings[0].provisional).toBe(true);
    expect(estado.base!.tablas.diagnoses).toEqual([{ company_id: EMPRESA, pilar: "personas", estado: "desconocido", resumen: RESUMEN_SIN_INFORMACION }]);
  });

  it("solo releer: relee lo revisado y los pendientes de la IA sin llamar al modelo, sin recrear nada y sin tocar la tarjeta de un área que sí puede concluir", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), documentoConfirmado("d1"), deDocumento("d2")];
    estado.base!.tablas.diagnoses.push({ company_id: EMPRESA, pilar: "personas", estado: "mejorable", resumen: "La conclusión vigente." });
    estado.base!.tablas.findings.push(
      revisado("f-aprobado", ["d1"]),
      // El pendiente de la IA cuyo papel el dueño ya confirmó: en este trabajo nadie lo va a recrear, así que se relee.
      revisado("f-pendiente", ["d1"], { estado_revision: "pendiente" }),
      // El que sigue sobre un papel sin confirmar ya dice lo de hoy: no se escribe.
      revisado("f-pendiente-sin-confirmar", ["d2"], { estado_revision: "pendiente" }),
      // Un pendiente que no es de la IA no se relee.
      revisado("f-pendiente-de-la-consultora", ["d1"], { estado_revision: "pendiente", origen: "consultor", auditoria: null }),
    );
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j20", company_id: EMPRESA, payload: { pilar: "personas", solo_releer: true } });
    expect(r).toEqual({ estado: "releido", pilar: "personas", confirmadas: 5, revisados_releidos: 1, revisados_cambiados: 1, pendientes_que_dejan_de_ser_provisionales: 1 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    expect(estado.auditor).not.toHaveBeenCalled();
    const fila = (id: string) => estado.base!.tablas.findings.find((x) => x.id === id)!;
    expect(fila("f-aprobado").provisional).toBe(false);
    // Es el mismo hallazgo pendiente (no se borró ni se recreó): solo cambió lo que dice de su certeza.
    expect(estado.base!.tablas.findings).toHaveLength(4);
    expect(fila("f-pendiente")).toMatchObject({ estado_revision: "pendiente", titulo: "Revisado f-pendiente", provisional: false });
    expect(fila("f-pendiente").confianza).toBeGreaterThan(0.2);
    expect(fila("f-pendiente").confianza_motivo).toContain("las 1 afirmaciones están confirmadas");
    expect(fila("f-pendiente-sin-confirmar")).toMatchObject({ estado_revision: "pendiente", provisional: true, confianza: 0.2 });
    expect(fila("f-pendiente-de-la-consultora")).toMatchObject({ estado_revision: "pendiente", provisional: true, confianza: 0.2 });
    expect(estado.base!.tablas.diagnoses).toEqual([{ company_id: EMPRESA, pilar: "personas", estado: "mejorable", resumen: "La conclusión vigente." }]);
    // No es un diagnóstico: no dispara la consolidación.
    expect(estado.encolados).toHaveLength(0);
    // Segunda pasada sin nada nuevo: se relee, no se escribe, y el resultado no anuncia cambios que no hubo.
    expect(await handleDiagnosticar({ id: "j20b", company_id: EMPRESA, payload: { pilar: "personas", solo_releer: true } })).toEqual({ estado: "releido", pilar: "personas", confirmadas: 5, revisados_releidos: 1, revisados_cambiados: 0 });
  });

  it("los pendientes de la IA de un área con su mínimo responden por su evidencia de hoy en los dos sentidos, y el resultado dice qué pasó con cada rótulo", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), confirmada("c5"), documentoConfirmado("d1"), deDocumento("d2")];
    const eraConclusion = { provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas" };
    estado.base!.tablas.findings.push(
      // Nació como conclusión y lo que lo sostenía ya no está confirmado: vuelve a ser provisional (lo extraído nunca es verificado).
      revisado("f-caido", ["d2"], { estado_revision: "pendiente", ...eraConclusion }),
      // Nació provisional y el dueño confirmó su papel: deja de serlo.
      revisado("f-levantado", ["d1"], { estado_revision: "pendiente" }),
      // Ya era conclusión con la mitad confirmada; se confirmó la otra mitad: el rótulo no cambia, la confianza sí.
      revisado("f-mas-confirmado", ["c1", "d1"], { estado_revision: "pendiente", provisional: false, confianza: 0.45, confianza_motivo: "1 de 2 afirmaciones confirmadas" }),
    );
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j25", company_id: EMPRESA, payload: { pilar: "personas", solo_releer: true } });
    expect(r).toEqual({ estado: "releido", pilar: "personas", confirmadas: 6, revisados_releidos: 0, revisados_cambiados: 0, pendientes_pasados_a_provisional: 1, pendientes_que_dejan_de_ser_provisionales: 1, pendientes_con_otra_confianza: 1 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    const fila = (id: string) => estado.base!.tablas.findings.find((x) => x.id === id)!;
    expect(fila("f-caido")).toMatchObject({ estado_revision: "pendiente", provisional: true, confianza: 0.2 });
    // Un área con su mínimo no le pone el porqué del candado: responde por lo suyo.
    expect(fila("f-caido").confianza_motivo).not.toContain("todo el diagnóstico es provisional");
    expect(fila("f-levantado")).toMatchObject({ estado_revision: "pendiente", provisional: false });
    expect(fila("f-mas-confirmado")).toMatchObject({ estado_revision: "pendiente", provisional: false });
    expect(fila("f-mas-confirmado").confianza).toBeGreaterThan(0.45);
    expect(fila("f-mas-confirmado").confianza_motivo).toContain("las 2 afirmaciones están confirmadas");
  });

  it("solo releer en un área que no llega al mínimo: los pendientes de la IA dejan de pasar por conclusión y la tarjeta lo dice, sin modelo", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), deDocumento("d1"), deDocumento("d2"), deDocumento("d3")];
    estado.base!.tablas.diagnoses.push({ company_id: EMPRESA, pilar: "personas", estado: "critico", resumen: "Lectura del modelo de cuando había cinco." });
    estado.base!.tablas.findings.push(revisado("f-pendiente", ["c1"], { estado_revision: "pendiente", provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas" }));
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j21", company_id: EMPRESA, payload: { pilar: "personas", solo_releer: true } });
    expect(r).toEqual({ estado: "releido", pilar: "personas", confirmadas: 2, revisados_releidos: 0, revisados_cambiados: 0, pendientes_pasados_a_provisional: 1 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    expect(estado.base!.tablas.findings[0]).toMatchObject({ estado_revision: "pendiente", provisional: true });
    expect(estado.base!.tablas.diagnoses).toEqual([{ company_id: EMPRESA, pilar: "personas", estado: "desconocido", resumen: RESUMEN_MODO_PROVISIONAL }]);
  });

  it("si la tarjeta del área no se puede reescribir, el resultado lo dice", async () => {
    estado.base = crearBaseFalsa({ ...baseVacia().tablas }, { "diagnoses:upsert": "sin permiso de escritura" });
    estado.claims = [confirmada("c1"), confirmada("c2")];
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    expect(await handleDiagnosticar({ id: "j22", company_id: EMPRESA, payload: { pilar: "personas" } })).toEqual({ estado: "desconocido", confirmadas: 2, afirmaciones_provisionales: 0, revisados_releidos: 0, revisados_cambiados: 0, diagnostico_error: "sin permiso de escritura" });
  });

  it("una relectura en cola no frena la consolidación; un diagnóstico de otro pilar en cola, sí", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), confirmada("c5")];
    estado.base!.tablas.jobs.push({ id: "otro", company_id: EMPRESA, tipo: "diagnosticar", estado: "pendiente", payload: { pilar: "producto", solo_releer: true } });
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    await handleDiagnosticar({ id: "j23", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(estado.encolados.map((j) => j.tipo)).toEqual(["consolidar"]);
    estado.encolados = [];
    estado.base!.tablas.jobs[0].payload = { pilar: "producto" };
    await handleDiagnosticar({ id: "j24", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(estado.encolados).toHaveLength(0);
  });

  it("la misma falta de información, el mismo rótulo: con 4 confirmadas, lo aprobado deja de pasar por conclusión haya un papel (modo provisional) o ninguno (desconocido)", async () => {
    const eraConclusion = () => revisado("f-era-conclusion", ["c1"], { provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas" });
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    // 4 confirmadas y ningún papel: el pilar queda desconocido, sin llamar al modelo, y aun así lo aprobado se relee.
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4")];
    estado.base!.tablas.findings.push(eraConclusion());
    const sinPapel = await handleDiagnosticar({ id: "j15", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(sinPapel).toEqual({ estado: "desconocido", confirmadas: 4, afirmaciones_provisionales: 0, revisados_releidos: 1, revisados_cambiados: 1 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    const desconocido = { ...estado.base!.tablas.findings[0] };
    expect(desconocido).toMatchObject({ estado_revision: "aprobado", provisional: true, confianza: 0.4 });
    expect(desconocido.confianza_motivo).toContain("el pilar tiene 4 afirmaciones confirmadas de las 5 que exige una conclusión");
    // 4 confirmadas y un papel: modo provisional. El hallazgo aprobado termina exactamente igual.
    estado.base = baseVacia();
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), deDocumento("d1")];
    estado.base!.tablas.findings.push(eraConclusion());
    const conPapel = await handleDiagnosticar({ id: "j15b", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(conPapel).toMatchObject({ estado: "desconocido", modo_provisional: true, revisados_releidos: 1, revisados_cambiados: 1 });
    expect(estado.base!.tablas.findings[0]).toMatchObject({ provisional: desconocido.provisional, confianza: desconocido.confianza, confianza_motivo: desconocido.confianza_motivo });
  });

  it("pilar desconocido: si lo revisado no se puede leer, tampoco aquí se calla", async () => {
    estado.base = crearBaseFalsa({ ...baseVacia().tablas, findings: [revisado("f-ilegible", ["c1"])] }, { "findings:select": "la base no responde" });
    estado.claims = [confirmada("c1"), confirmada("c2")];
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j15c", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toEqual({ estado: "desconocido", confirmadas: 2, afirmaciones_provisionales: 0, revisados_releidos: 0, revisados_cambiados: 0, revisados_error: "la base no responde" });
    expect(estado.base!.tablas.findings[0]).toMatchObject({ provisional: true, confianza: 0.2 });
  });

  it("si los hallazgos revisados no se pueden leer, el diagnóstico sigue y el resultado lo dice (nada falla en silencio)", async () => {
    estado.base = crearBaseFalsa({ ...baseVacia().tablas, findings: [revisado("f-ilegible", ["d1"])] }, { "findings:select": "la base no responde" });
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), documentoConfirmado("d1")];
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "j16", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toMatchObject({ estado: "solido", revisados_releidos: 0, revisados_cambiados: 0, revisados_error: "la base no responde" });
    expect(estado.base!.tablas.findings[0]).toMatchObject({ provisional: true, confianza: 0.2 });
  });
});

describe("(c) POST /api/findings/[id]/review · con dobles · aprobar o corregir relee provisional y confianza con la evidencia de HOY", () => {
  const perfil = { id: "u-consultora", rol: "consultor" } as const;
  const llamar = async (id: string, body: Fila) => {
    const { POST } = await import("@/app/api/findings/[id]/review/route");
    const handler = POST as unknown as (p: typeof perfil, req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<{ status: number; body: Fila }>;
    return handler(perfil, new Request(`http://prueba.local/api/findings/${id}/review`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id }) });
  };
  const claimAnidado = (id: string, estadoClaim: string, autor = "Rosa"): Fila => ({ id, source_id: `doc-${id}`, participant_id: null, estado: estadoClaim, comprobacion: null, confianza: null, vigente_hasta: null, sources: { nombre: `Doc ${id}`, tipo: "documento", fecha_origen: null, origen: "cliente", autor, periodo_desde: null, periodo_hasta: null, fidelidad_extraccion: "alta" }, participants: null });
  const hallazgoProvisional = (id: string, extra: Fila = {}): Fila => ({ id, company_id: EMPRESA, pilar: "personas", origen: "ia", titulo: "De un papel", requiere_validacion: false, estado_revision: "pendiente", provisional: true, confianza: 0.2, confianza_motivo: "se apoya en 1 afirmación de documento no confirmada; ningún hecho comprobado contra datos; una sola fuente", impacto_potencial: "alto", auditoria: { sustentado: true, es_sintoma: false, observacion: "" }, ...extra });

  beforeEach(() => {
    estado.encolados = [];
  });

  it("el dueño confirmó la afirmación desde el diagnóstico (y el pilar ya tiene sus 5 confirmadas) → al aprobar, provisional pasa a false y la confianza sube", async () => {
    estado.base = crearBaseFalsa({ findings: [hallazgoProvisional("f1")], finding_evidence: [{ finding_id: "f1", claim_id: "d1", relacion: "sustenta", claims: claimAnidado("d1", "confirmado") }], claims: confirmadasDelPilar(5), corrections: [], jobs: [] });
    const r = await llamar("f1", { accion: "aprobado" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: "f1", estado_revision: "aprobado", provisional: false });
    const f = estado.base!.tablas.findings[0];
    expect(f).toMatchObject({ estado_revision: "aprobado", provisional: false });
    expect(f.confianza).toBeGreaterThan(0.2);
    expect(f.confianza_motivo).toContain("afirmaciones están confirmadas");
    // La corrección queda y el pilar se re-diagnostica con la foto fresca, como siempre.
    expect(estado.base!.tablas.corrections).toHaveLength(1);
    expect(estado.encolados[0]).toMatchObject({ tipo: "diagnosticar", payload: { pilar: "personas" } });
  });

  it("si nadie confirmó nada, aprobar NO lo convierte en conclusión: provisional sigue en true (aprobar no es confirmar)", async () => {
    estado.base = crearBaseFalsa({ findings: [hallazgoProvisional("f2")], finding_evidence: [{ finding_id: "f2", claim_id: "d1", relacion: "sustenta", claims: claimAnidado("d1", "sin_verificar") }], claims: confirmadasDelPilar(7), corrections: [], jobs: [] });
    const r = await llamar("f2", { accion: "aprobado" });
    expect(r.status).toBe(200);
    expect(estado.base!.tablas.findings[0]).toMatchObject({ estado_revision: "aprobado", provisional: true, confianza: 0.2 });
  });

  it("corregir también recalcula; la evidencia que CONTRADICE no cuenta como sustento", async () => {
    estado.base = crearBaseFalsa({
      findings: [hallazgoProvisional("f3")],
      finding_evidence: [
        { finding_id: "f3", claim_id: "d1", relacion: "sustenta", claims: claimAnidado("d1", "confirmado", "Rosa") },
        { finding_id: "f3", claim_id: "d2", relacion: "sustenta", claims: claimAnidado("d2", "confirmado", "Contador") },
        { finding_id: "f3", claim_id: "x1", relacion: "contradice", claims: claimAnidado("x1", "confirmado", "Otro") },
      ],
      // El mínimo se cuenta como en el diagnóstico: las del pilar y las transversales (3 + 2 = 5); las de otro pilar no.
      claims: [...confirmadasDelPilar(3), ...confirmadasDelPilar(2, "transversal").map((c, i) => ({ ...c, id: `t${i}` })), ...confirmadasDelPilar(9, "producto").map((c, i) => ({ ...c, id: `p${i}` }))],
      corrections: [], jobs: [],
    });
    const r = await llamar("f3", { accion: "corregido", motivo: "impacto_sobredimensionado", cambios: { impacto: "medio" } });
    expect(r.status).toBe(200);
    const f = estado.base!.tablas.findings[0];
    expect(f).toMatchObject({ estado_revision: "corregido", impacto: "medio", provisional: false });
    expect(f.confianza_motivo).toContain("2 fuentes independientes");
    expect(f.confianza_motivo).toContain("las 2 afirmaciones están confirmadas");
  });

  it("rechazar no mide nada: provisional y confianza quedan como estaban", async () => {
    estado.base = crearBaseFalsa({ findings: [hallazgoProvisional("f4")], finding_evidence: [{ finding_id: "f4", claim_id: "d1", relacion: "sustenta", claims: claimAnidado("d1", "confirmado") }], corrections: [], jobs: [] });
    const r = await llamar("f4", { accion: "rechazado", motivo: "no_es_asi" });
    expect(r.status).toBe(200);
    expect(estado.base!.tablas.findings[0]).toMatchObject({ estado_revision: "rechazado", provisional: true, confianza: 0.2 });
  });

  it("un hallazgo escrito a mano por el consultor (sin evidencia enlazada) no tiene con qué recalcularse: no se toca (la falta de dato no es cero)", async () => {
    estado.base = crearBaseFalsa({ findings: [hallazgoProvisional("f5", { origen: "consultor", provisional: false, confianza: null, confianza_motivo: null, auditoria: null })], finding_evidence: [], corrections: [], jobs: [] });
    const r = await llamar("f5", { accion: "aprobado" });
    expect(r.status).toBe(200);
    expect(estado.base!.tablas.findings[0]).toMatchObject({ estado_revision: "aprobado", provisional: false, confianza: null });
    expect(r.body).toMatchObject({ provisional: null, confianza: null });
  });

  it("si el auditor no lo sustentó, aprobar no levanta ese techo: confianza ≤ 0,25 y el motivo lo dice", async () => {
    estado.base = crearBaseFalsa({ findings: [hallazgoProvisional("f6", { auditoria: { sustentado: false, es_sintoma: false, observacion: "sin fenómeno" } })], finding_evidence: [{ finding_id: "f6", claim_id: "d1", relacion: "sustenta", claims: claimAnidado("d1", "confirmado") }], claims: confirmadasDelPilar(5), corrections: [], jobs: [] });
    const r = await llamar("f6", { accion: "aprobado" });
    expect(r.status).toBe(200);
    const f = estado.base!.tablas.findings[0];
    expect(f.provisional).toBe(false);
    expect(f.confianza).toBeLessThanOrEqual(0.25);
    expect(f.confianza_motivo).toContain("el auditor no lo sustenta");
  });

  it("aprobar no es confirmar: en un pilar con 2 confirmadas, el hallazgo de la IA sigue provisional aunque su evidencia esté confirmada", async () => {
    estado.base = crearBaseFalsa({
      findings: [hallazgoProvisional("f7")],
      finding_evidence: [{ finding_id: "f7", claim_id: "d1", relacion: "sustenta", claims: claimAnidado("d1", "confirmado", "Rosa") }, { finding_id: "f7", claim_id: "d2", relacion: "sustenta", claims: claimAnidado("d2", "confirmado", "Contador") }],
      // Solo cuentan las 2 confirmadas de ESTE pilar y ESTA empresa. Cada grupo de distractores bastaría por sí solo para
      // llegar a 5 si la cuenta se saltara su filtro: las de otro pilar, las sin verificar y las de otra empresa.
      claims: [
        ...confirmadasDelPilar(2),
        ...confirmadasDelPilar(9, "producto").map((c, i) => ({ ...c, id: `p${i}` })),
        ...confirmadasDelPilar(3).map((c, i) => ({ ...c, id: `s${i}`, estado: "sin_verificar" })),
        ...confirmadasDelPilar(3).map((c, i) => ({ ...c, id: `o${i}`, company_id: "otra-empresa" })),
      ],
      corrections: [], jobs: [],
    });
    const r = await llamar("f7", { accion: "aprobado" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado_revision: "aprobado", provisional: true });
    const f = estado.base!.tablas.findings[0];
    expect(f).toMatchObject({ estado_revision: "aprobado", provisional: true });
    expect(f.confianza).toBeLessThanOrEqual(0.4);
    expect(f.confianza_motivo).toContain("el pilar tiene 2 afirmaciones confirmadas de las 5 que exige una conclusión: todo el diagnóstico es provisional");
  });

  it("lo que escribió el consultor responde por su propia evidencia: el candado del pilar no lo alcanza", async () => {
    estado.base = crearBaseFalsa({ findings: [hallazgoProvisional("f8", { origen: "consultor" })], finding_evidence: [{ finding_id: "f8", claim_id: "d1", relacion: "sustenta", claims: claimAnidado("d1", "confirmado") }], claims: confirmadasDelPilar(1), corrections: [], jobs: [] });
    const r = await llamar("f8", { accion: "corregido", motivo: "redaccion", cambios: { titulo: "Dicho mejor" } });
    expect(r.status).toBe(200);
    const f = estado.base!.tablas.findings[0];
    expect(f).toMatchObject({ titulo: "Dicho mejor", provisional: false });
    expect(f.confianza_motivo).not.toContain("todo el diagnóstico es provisional");
  });

  it("si no se puede contar las confirmadas del pilar, no se aprueba a ciegas: 500 con el motivo y el hallazgo intacto", async () => {
    estado.base = crearBaseFalsa({ findings: [hallazgoProvisional("f9")], finding_evidence: [{ finding_id: "f9", claim_id: "d1", relacion: "sustenta", claims: claimAnidado("d1", "confirmado") }], claims: confirmadasDelPilar(5), corrections: [], jobs: [] }, { "claims:select": "la base no responde" });
    const r = await llamar("f9", { accion: "aprobado" });
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("no se aprueba a ciegas");
    expect(r.body.error).toContain("la base no responde");
    expect(estado.base!.tablas.findings[0]).toMatchObject({ estado_revision: "pendiente", provisional: true, confianza: 0.2 });
    expect(estado.base!.tablas.corrections).toHaveLength(0);
  });

  it("si la evidencia no se puede releer, tampoco: 500 y nada cambia", async () => {
    estado.base = crearBaseFalsa({ findings: [hallazgoProvisional("f10")], finding_evidence: [], claims: confirmadasDelPilar(5), corrections: [], jobs: [] }, { "finding_evidence:select": "columna inexistente" });
    const r = await llamar("f10", { accion: "aprobado" });
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("No se pudo releer la evidencia del hallazgo");
    expect(estado.base!.tablas.findings[0]).toMatchObject({ estado_revision: "pendiente", provisional: true });
  });
});

/**
 * Las lecturas de `findings` de un archivo: la cadena de filtros que sigue a `from("findings")` hasta el fin de esa línea.
 * En los manejadores cada consulta vive en una sola línea (dentro de un Promise.all), así que la línea ES la consulta;
 * el lector por bloques de limite-cliente-consultora se traga las líneas vecinas del array y aquí no sirve.
 */
function lecturasDeFindings(src: string): string[] {
  return src.split("\n").filter((l) => l.includes('from("findings")')).map((l) => l.slice(l.indexOf('from("findings")')));
}
const leer = (rel: string) => readFileSync(path.resolve(__dirname, "..", rel), "utf8");
const FILTRO_PROVISIONAL = /\.or\("provisional\.is\.null,provisional\.eq\.false"\)/;

describe("(d) los manejadores que leen findings para decidir excluyen lo provisional (afirmado sobre el código)", () => {
  it.each([
    "src/lib/jobs/handlers/modelo.ts",
    "src/lib/jobs/handlers/organigrama.ts",
    "src/lib/jobs/handlers/activos.ts",
    "src/lib/jobs/handlers/procesos.ts",
    // Cierre Z2: el plan estratégico y los indicadores también deciden con hallazgos.
    "src/lib/jobs/handlers/plan.ts",
    "src/lib/jobs/handlers/indicadores.ts",
  ])("%s filtra provisional en cada lectura de findings", (ruta) => {
    const lecturas = lecturasDeFindings(leer(ruta)).filter((l) => /\.select\(/.test(l));
    expect(lecturas.length, `${ruta} debería leer findings al menos una vez`).toBeGreaterThan(0);
    for (const l of lecturas) {
      expect(l, `${ruta} lee findings sin excluir provisional: un hallazgo que nadie confirmó estaría dimensionando una decisión`).toMatch(FILTRO_PROVISIONAL);
    }
  });

  it("el filtro deja pasar las filas anteriores a la migración (provisional null) y las no provisionales, y excluye las provisionales", () => {
    // Semántica PostgREST de `or("provisional.is.null,provisional.eq.false")`, reproducida para dejar escrito qué se pide.
    const pasa = (f: { provisional?: boolean | null }) => f.provisional == null || f.provisional === false;
    expect(pasa({})).toBe(true);
    expect(pasa({ provisional: null })).toBe(true);
    expect(pasa({ provisional: false })).toBe(true);
    expect(pasa({ provisional: true })).toBe(false);
  });
});

describe("(a) y (e) el portal, renderizado en servidor sobre una base falsa · lo provisional se ve y no pasa por conclusión", () => {
  /** La evidencia de un hallazgo tal como la trae la consulta anidada de hoy.ts. */
  /** Una afirmación sacada de un papel (o, con otro `tipo`, de una visita): sin confirmar salvo que se diga. */
  const evDoc = (nombre: string, texto = `visto en ${nombre}`, tipo = "documento", estadoClaim = "sin_verificar"): Fila => ({ relacion: "sustenta", claims: { texto, estado: estadoClaim, fecha_afirmacion: null, sources: { nombre, tipo }, participants: null } });
  /** Algo que contó el dueño: confirmado salvo que se diga. */
  const evDueno = (texto: string, estadoClaim = "confirmado"): Fila => ({ relacion: "sustenta", claims: { texto, estado: estadoClaim, fecha_afirmacion: null, sources: { nombre: "Entrevista", tipo: "entrevista" }, participants: { rol: "dueno", puesto: null } } });
  const fila = (id: string, titulo: string, extra: Fila = {}): Fila => ({
    id, company_id: EMPRESA, titulo, causa_raiz: `causa de ${titulo}`, impacto: "alto", pilar: "personas", patron: null, veredicto: "improve", recomendacion: `RECOMENDACION-${id}`, origen: "ia",
    requiere_validacion: false, estado_revision: "pendiente", filtros: {}, impacto_potencial: "alto", confianza: 0.7, provisional: false, finding_evidence: [evDueno(`dicho por el dueño sobre ${titulo}`)], ...extra,
  });
  /** n afirmaciones confirmadas de un área, como las lee hoy.ts para saber cuánto se sabe de ella. */
  const confirmadasDeArea = (n: number, pilar = "personas"): Fila[] => Array.from({ length: n }, (_, i) => ({ id: `conf-${pilar}-${i}`, company_id: EMPRESA, texto: `confirmada ${pilar} ${i}`, estado: "confirmado", pilar, fecha_afirmacion: null, contradice_a: null, explicacion_contradiccion: null, prioridad_validacion: false, sources: { nombre: "Entrevista", tipo: "entrevista" }, participants: { rol: "dueno", puesto: null } }));
  // EL CASO DEL VERIFICADOR: hallazgo de la IA ya aprobado, cuya única evidencia la contó el dueño y está confirmada.
  // Sigue provisional solo porque de su área se sabe poco (el candado del pilar). No salió de ningún documento.
  const AREA_CORTA = fila("f-area", "El dueño aprueba cada compra", { provisional: true, confianza: 0.4, estado_revision: "aprobado", finding_evidence: [evDueno("yo apruebo cada compra")] });
  const POR_QUE_AREA = "Lo que lo sostiene ya está confirmado, pero de esta área todavía hay poca información confirmada: cuando sepamos más, se vuelve conclusión o se descarta.";
  // Una conclusión vive en un área que puede concluir: «procesos» tiene siempre sus 5 confirmadas en la base del portal.
  const CONCLUSION = fila("f-conclusion", "Todo pasa por el dueño", { pilar: "procesos" });
  const GRAVE = fila("f-grave", "Hay mercadería sin costo registrado", { provisional: true, confianza: 0.35, impacto_potencial: "alto", finding_evidence: [evDoc("Inventario 2026.xlsx"), evDoc("Cierre de caja setiembre.docx")] });
  const LEVE = fila("f-leve", "El manual no dice quién abre la tienda", { provisional: true, confianza: 0.2, impacto: "medio", impacto_potencial: "medio", estado_revision: "aprobado", finding_evidence: [evDoc("Manual de tienda.docx")] });
  const NO_SE_VEN = [
    fila("f-pide-validacion", "PROVISIONAL QUE PIDE VALIDACION", { provisional: true, confianza: 0.2, requiere_validacion: true, finding_evidence: [evDoc("Otro.docx")] }),
    fila("f-rechazado", "PROVISIONAL RECHAZADO", { provisional: true, confianza: 0.2, estado_revision: "rechazado", finding_evidence: [evDoc("Otro.docx")] }),
  ];
  // Una fortaleza que nadie confirmó: hasta el cierre no se veía en ningún lado; ahora se ve, rotulada «por confirmar».
  const FORTALEZA_PROVISIONAL = fila("f-fortaleza", "Fortaleza: Atienden rápido en caja", { provisional: true, confianza: 0.2, veredicto: "keep", finding_evidence: [evDoc("Otro.docx")] });
  // El resumen del pilar es el que deja hoy el diagnóstico en modo provisional (se lee al armar la base, ya cargado).
  // «procesos» tiene siempre 5 confirmadas: es el área de las conclusiones de estas pruebas. `afirmaciones` son las
  // demás que cada prueba declara (confirmadas de otra área, una contradicción abierta).
  const basePortal = (findings: Fila[], afirmaciones: Fila[] = [], diagnoses?: Fila[]) => crearBaseFalsa({
    companies: [{ id: EMPRESA, nombre: "Tienda de prueba", sector: "retail", ficha: {} }],
    claims: [{ id: "k1", company_id: EMPRESA, texto: "afirmación", estado: "sin_verificar", pilar: "personas", fecha_afirmacion: null, contradice_a: null, explicacion_contradiccion: null, prioridad_validacion: false, sources: { nombre: "Inventario 2026.xlsx", tipo: "documento" }, participants: null }, ...confirmadasDeArea(5, "procesos"), ...afirmaciones],
    diagnoses: diagnoses ?? [{ company_id: EMPRESA, pilar: "personas", estado: "desconocido", resumen: RESUMEN_MODO_PROVISIONAL }],
    findings, processes: [], know_how: [], sources: [], actions: [], company_metricas: [], company_assets: [], interview_sessions: [], interview_responses: [], org_puestos: [],
  });
  const pintarHoy = async () => renderToStaticMarkup(await (await import("@/app/(cliente)/portal/hoy/page")).default());
  const pintarInforme = async () => renderToStaticMarkup(await (await import("@/app/(cliente)/portal/informe/page")).default());
  /** El trozo de HTML de una sección plegable (del <details> a su cierre), buscada por su título. */
  const seccionPlegable = (html: string, titulo: string) => {
    const i = html.indexOf(titulo);
    if (i < 0) return null;
    const desde = html.lastIndexOf("<details", i);
    return html.slice(desde, html.indexOf("</details>", i));
  };
  const seccionPorConfirmar = (html: string) => seccionPlegable(html, "Lo que vimos en tus documentos y falta confirmar");
  const seccionSinConcluir = (html: string) => seccionPlegable(html, "Lo que todavía no damos por conclusión");

  it("empresaHoy · cada punto que todavía no es conclusión lleva su motivo, leído de los hechos de hoy, y un origen cierto", async () => {
    const { empresaHoy, POR_QUE_NO_ES_CONCLUSION, ROTULO_POR_CONFIRMAR, esDeDocumentos } = await import("@/lib/hoy");
    const provisional = (id: string, titulo: string, extra: Fila) => fila(id, titulo, { provisional: true, confianza: 0.4, impacto_potencial: "medio", ...extra });
    estado.base = basePortal([
      CONCLUSION,
      provisional("f-papeles", "Solo de papeles", { finding_evidence: [evDoc("Inventario 2026.xlsx"), evDoc("Cuaderno.jpg", "foto del cuaderno", "foto"), evDoc("Ventas.csv", "tabla", "dato")] }),
      AREA_CORTA,
      // Misma evidencia confirmada, pero el área ya tiene sus 5: el rótulo quedó viejo, no hay nada que confirmar ni que contar.
      provisional("f-releer", "Área con información suficiente", { pilar: "producto", estado_revision: "aprobado", finding_evidence: [evDueno("vendo tres líneas")] }),
      // Lo que escribió el consultor no pasa por el candado del área: en un área corta tampoco es «poca información».
      provisional("f-consultor", "Escrito por el consultor", { origen: "consultor", estado_revision: "aprobado", finding_evidence: [evDueno("lo dijo el dueño")] }),
      // Nadie lo confirmó, y no salió de un documento: algo dicho que quedó en duda, una visita, un papel junto a una voz.
      provisional("f-en-duda", "Dicho y puesto en duda", { finding_evidence: [evDueno("dije una cosa y el registro otra", "contradicho")] }),
      provisional("f-visita", "Visto en una visita", { finding_evidence: [evDoc("Visita a tienda", "se vio en la visita", "observacion")] }),
      provisional("f-mixto", "Papel y equipo", { finding_evidence: [evDoc("Manual de tienda.docx"), { relacion: "sustenta", claims: { texto: "lo dijo la vendedora", estado: "caducado", fecha_afirmacion: null, sources: { nombre: "Entrevista", tipo: "entrevista" }, participants: { rol: "empleado", puesto: "Vendedora" } } }] }),
      provisional("f-sin-rastro", "Sin rastro de su fuente", { finding_evidence: [] }),
      // La evidencia que CONTRADICE no cuenta: su única afirmación que sustenta es un papel sin confirmar.
      provisional("f-contraria", "Con evidencia contraria confirmada", { finding_evidence: [evDoc("Otro.docx"), { ...evDueno("eso no es así"), relacion: "contradice" }] }),
    ], [...confirmadasDeArea(2, "personas"), ...confirmadasDeArea(5, "producto")]);
    const hoy = await empresaHoy(EMPRESA);
    expect(Object.fromEntries(hoy.porConfirmar.map((p) => [p.id, [p.motivo, p.deDonde]]))).toEqual({
      "f-papeles": ["documentos_sin_confirmar", "Lo vimos en: Inventario 2026.xlsx, Cuaderno.jpg, Ventas.csv."],
      "f-area": ["area_con_poca_informacion", "Sale de: lo que tú nos contaste."],
      "f-releer": ["pendiente_de_releer", "Sale de: lo que tú nos contaste."],
      "f-consultor": ["pendiente_de_releer", "Sale de: lo que tú nos contaste."],
      "f-en-duda": ["sin_confirmar", "Sale de: lo que tú nos contaste."],
      "f-visita": ["sin_confirmar", "Sale de: Visita a tienda."],
      "f-mixto": ["sin_confirmar", "Sale de: Manual de tienda.docx, Vendedora (conversación)."],
      "f-sin-rastro": ["sin_confirmar", "No quedó a la vista de dónde salió."],
      "f-contraria": ["documentos_sin_confirmar", "Lo vimos en: Otro.docx."],
    });
    // Ninguno pasa por conclusión, sea cual sea su motivo; y solo de los que salen de papeles se dice «lo vimos en».
    expect(hoy.noVes.map((h) => h.id)).toEqual(["f-conclusion"]);
    expect(hoy.tentativo.map((t) => t.problema)).toEqual(["Todo pasa por el dueño"]);
    expect(hoy.porConfirmar.filter(esDeDocumentos).map((p) => p.id).sort()).toEqual(["f-contraria", "f-papeles"]);
    for (const p of hoy.porConfirmar) expect(p.deDonde.startsWith("Lo vimos en"), p.id).toBe(esDeDocumentos(p));
    expect(hoy.stats.porConfirmar).toBe(9);
    // Cada motivo tiene su texto y su rótulo, y el de «poca información del área» no le pide al dueño confirmar nada.
    expect(POR_QUE_NO_ES_CONCLUSION.area_con_poca_informacion).toBe(POR_QUE_AREA);
    expect(POR_QUE_NO_ES_CONCLUSION.area_con_poca_informacion).not.toMatch(/documento/i);
    expect(POR_QUE_NO_ES_CONCLUSION.pendiente_de_releer).not.toMatch(/documento/i);
    expect(ROTULO_POR_CONFIRMAR.area_con_poca_informacion).not.toBe(ROTULO_POR_CONFIRMAR.documentos_sin_confirmar);
    expect(new Set(Object.values(POR_QUE_NO_ES_CONCLUSION)).size).toBe(4);
  });

  it("empresaHoy · cuánto se sabe de un área se cuenta como en el diagnóstico: sus confirmadas y las transversales; al llegar al mínimo ya no es «poca información»", async () => {
    const { empresaHoy } = await import("@/lib/hoy");
    estado.base = basePortal([AREA_CORTA], [...confirmadasDeArea(3, "personas"), ...confirmadasDeArea(1, "transversal"), ...confirmadasDeArea(9, "producto")]);
    expect((await empresaHoy(EMPRESA)).porConfirmar[0]).toMatchObject({ id: "f-area", motivo: "area_con_poca_informacion" });
    estado.base = basePortal([AREA_CORTA], [...confirmadasDeArea(3, "personas"), ...confirmadasDeArea(2, "transversal")]);
    expect((await empresaHoy(EMPRESA)).porConfirmar[0]).toMatchObject({ id: "f-area", motivo: "pendiente_de_releer" });
  });

  it("Mi empresa hoy · el caso del verificador: aprobado, área con 2 confirmadas, evidencia solo del dueño ya confirmada → ni «sale de documentos» ni «lo vimos en», y nada que confirmar", async () => {
    estado.base = basePortal([AREA_CORTA], confirmadasDeArea(2));
    const html = await pintarHoy();
    // La sección de documentos no existe: no hay nada visto en documentos.
    expect(seccionPorConfirmar(html)).toBeNull();
    expect(html).not.toContain("salen de documentos que aún nadie confirmó");
    expect(html).not.toContain("Lo vimos en");
    expect(html).not.toContain("en tus documentos, por confirmar.");
    // Va en su propia sección, con su porqué y de dónde sale de verdad.
    const seccion = seccionSinConcluir(html)!;
    expect(seccion).toContain("Lo que todavía no damos por conclusión · 1");
    expect(seccion).toContain("No son conclusiones todavía. En cada punto te decimos por qué.");
    expect(seccion).toContain("El dueño aprueba cada compra");
    expect(seccion).toContain(POR_QUE_AREA);
    expect(seccion).toContain("Sale de: lo que tú nos contaste.");
    expect(seccion).not.toContain("· por confirmar");
    expect(html).toContain("1 punto que todavía no damos por conclusión.");
    // Sería grave (impacto potencial alto, confianza baja): llega abierta y avisa, pero de algo ya confirmado no se dice
    // «si se confirma».
    expect(seccion.startsWith('<details open="">')).toBe(true);
    expect(seccion).toContain("Hay algo que sería grave si resulta ser así: revísalo con tu consultor.");
    expect(seccion).toContain("Tu equipo · falta conocer más el área · grave si resulta ser así");
    expect(html).not.toContain("si se confirma");
    // Y sigue sin ser conclusión: ni tarjeta de hallazgo ni recomendación.
    expect(html).not.toContain("data-conclusion=");
    expect(html).not.toContain("RECOMENDACION-f-area");
  });

  it("Mi empresa hoy · con las dos clases a la vez, cada una va en su sección con su cuenta y ninguna hereda el texto de la otra", async () => {
    estado.base = basePortal([CONCLUSION, LEVE, GRAVE, AREA_CORTA], confirmadasDeArea(2));
    const html = await pintarHoy();
    const documentos = seccionPorConfirmar(html)!;
    const otros = seccionSinConcluir(html)!;
    expect(documentos).toContain("Lo que vimos en tus documentos y falta confirmar · 2");
    expect(documentos).not.toContain("El dueño aprueba cada compra");
    expect(documentos).not.toContain("lo que tú nos contaste");
    expect(otros).toContain("Lo que todavía no damos por conclusión · 1");
    expect(otros).toContain("El dueño aprueba cada compra");
    expect(otros).not.toContain("salen de documentos");
    expect(otros).not.toContain("Lo vimos en");
    // Cada sección avisa de lo grave con sus palabras.
    expect(documentos.startsWith('<details open="">')).toBe(true);
    expect(documentos).toContain("Hay algo grave si se confirma: revísalo con tu consultor.");
    expect(otros.startsWith('<details open="">')).toBe(true);
    expect(otros).not.toContain("si se confirma");
    expect(html).toContain("2 cosas vistas en tus documentos, por confirmar. · 1 punto que todavía no damos por conclusión.");
    expect([...html.matchAll(/data-conclusion="([^"]+)"/g)].map((m) => m[1])).toEqual(["f-conclusion"]);
    // Sin nada grave, la segunda sección llega plegada y sin aviso; con dos puntos, el contador concuerda en plural.
    const tranquilo = (id: string, titulo: string) => fila(id, titulo, { provisional: true, confianza: 0.4, impacto_potencial: "medio", estado_revision: "aprobado", finding_evidence: [evDueno(`dicho sobre ${titulo}`)] });
    estado.base = basePortal([tranquilo("f-t1", "Las compras no tienen día fijo"), tranquilo("f-t2", "Nadie reemplaza al dueño en caja")], confirmadasDeArea(2));
    const sinGrave = await pintarHoy();
    expect(seccionSinConcluir(sinGrave)!.startsWith("<details>")).toBe(true);
    expect(sinGrave).not.toContain("sería grave");
    expect(sinGrave).toContain("2 puntos que todavía no damos por conclusión.");
  });

  it("Mi empresa hoy: la sección plegable lista lo por confirmar con su texto y su fuente, avisa de lo grave y llega abierta", async () => {
    estado.base = basePortal([CONCLUSION, LEVE, GRAVE, ...NO_SE_VEN]);
    const html = await pintarHoy();
    const seccion = seccionPorConfirmar(html)!;
    expect(seccion).toContain("Lo que vimos en tus documentos y falta confirmar · 2");
    expect(seccion.startsWith('<details open="">')).toBe(true);
    expect(seccion).toContain("Hay algo grave si se confirma: revísalo con tu consultor.");
    expect(seccion).toContain("No son conclusiones: salen de documentos que aún nadie confirmó.");
    // Cada ítem con su texto y su fuente; lo grave va primero.
    expect(seccion).toContain("Hay mercadería sin costo registrado");
    expect(seccion).toContain("Lo vimos en: Inventario 2026.xlsx, Cierre de caja setiembre.docx.");
    expect(seccion).toContain("El manual no dice quién abre la tienda");
    expect(seccion).toContain("Lo vimos en: Manual de tienda.docx.");
    expect(seccion.indexOf("Hay mercadería sin costo registrado")).toBeLessThan(seccion.indexOf("El manual no dice quién abre la tienda"));
    expect(seccion).toContain("por confirmar · grave si se confirma");
    // El contador, junto al de por validar.
    expect(html).toContain("2 cosas vistas en tus documentos, por confirmar.");
    // Lo provisional NO se pinta como conclusión: la única tarjeta de hallazgo es la confirmada, y ninguna recomendación provisional sale.
    expect([...html.matchAll(/data-conclusion="([^"]+)"/g)].map((m) => m[1])).toEqual(["f-conclusion"]);
    expect(html).not.toContain("RECOMENDACION-f-grave");
    expect(html).not.toContain("RECOMENDACION-f-leve");
    // Y lo que no debe verse no se ve: lo que pide validación del consultor, lo rechazado y una fortaleza sin confirmar.
    for (const f of NO_SE_VEN) expect(html, f.id).not.toContain(f.titulo);
  });

  it("Mi empresa hoy: sin nada grave la sección llega plegada y sin aviso; con una sola cosa, el contador concuerda en singular", async () => {
    estado.base = basePortal([CONCLUSION, LEVE]);
    const html = await pintarHoy();
    const seccion = seccionPorConfirmar(html)!;
    expect(seccion).toContain("Lo que vimos en tus documentos y falta confirmar · 1");
    expect(seccion.startsWith("<details>")).toBe(true);
    expect(html).not.toContain("Hay algo grave si se confirma");
    expect(html).toContain("1 cosa vista en tus documentos, por confirmar.");
  });

  it("Mi empresa hoy: sin provisionales no hay sección ni contador; y con SOLO provisionales la página no dice «no tenemos con qué mirar»", async () => {
    estado.base = basePortal([CONCLUSION]);
    const sin = await pintarHoy();
    expect(seccionPorConfirmar(sin)).toBeNull();
    expect(sin).not.toContain("por confirmar.");
    estado.base = basePortal([GRAVE]);
    const solo = await pintarHoy();
    expect(seccionPorConfirmar(solo)).toContain("Hay mercadería sin costo registrado");
    expect(solo).not.toContain("Lo que más está frenando el siguiente nivel");
    expect(solo).not.toContain("data-conclusion=");
    expect(solo).not.toContain("Todavía no tenemos con qué mirar tu empresa");
    // El pilar sigue sin conclusión, y la página lo dice con la frase fija: sin la cuenta interna ni palabras de la casa.
    expect(solo).toContain("Información insuficiente");
    expect(solo).toContain(RESUMEN_MODO_PROVISIONAL);
    expect(solo).not.toMatch(/afirmaciones confirmadas|Lectura provisional/);
  });

  it("Informe: lo por confirmar se imprime aparte, rotulado «Provisional: pendiente de corroborar», y no cuenta como hallazgo ni entra en «por dónde empezar»", async () => {
    estado.base = basePortal([CONCLUSION, LEVE, GRAVE, ...NO_SE_VEN]);
    const html = await pintarInforme();
    // Un hallazgo confirmado es UN hallazgo: ni los provisionales lo engordan, ni se cuenta dos veces por ser además
    // «lo que más frena» (el informe lo imprimía y contaba doble; la prueba de render lo destapó).
    // El número concuerda con su nombre: «1 hallazgo (1 crítico)», no «1 hallazgos (1 críticos)».
    expect(html).toContain("Se encontraron <strong>1 hallazgo</strong> (1 crítico) y <strong>0 fortalezas</strong> que conviene proteger.");
    expect(html.split("Todo pasa por el dueño</h3>").length - 1).toBe(1);
    expect(html).toContain("<strong>2 señales provisionales</strong>, vistas en documentos que nadie confirmó: se listan aparte y no cuentan como hallazgos.");
    const aparte = html.indexOf("Lo que vimos en los documentos y falta confirmar");
    expect(aparte).toBeGreaterThan(0);
    // Los títulos provisionales aparecen UNA vez, y es dentro de la sección aparte (después de los hallazgos).
    for (const titulo of ["Hay mercadería sin costo registrado", "El manual no dice quién abre la tienda"]) {
      expect(html.split(titulo).length - 1, titulo).toBe(1);
      expect(html.indexOf(titulo), titulo).toBeGreaterThan(aparte);
    }
    expect(html.indexOf("Todo pasa por el dueño")).toBeLessThan(aparte);
    expect(html.split("Provisional: pendiente de corroborar").length - 1).toBe(2);
    expect(html.split("Grave si se confirma").length - 1).toBe(1);
    expect(html).toContain("No son conclusiones: salen de documentos que aún nadie confirmó.");
    // «Por dónde empezar» solo trae el primer movimiento de la conclusión.
    expect(html).toContain("RECOMENDACION-f-conclusion");
    expect(html).not.toContain("RECOMENDACION-f-grave");
    expect(html).not.toContain("RECOMENDACION-f-leve");
    for (const f of NO_SE_VEN) expect(html, f.id).not.toContain(f.titulo);
  });

  it("Informe: sin provisionales no aparece ni la sección ni el rótulo", async () => {
    estado.base = basePortal([CONCLUSION]);
    const html = await pintarInforme();
    expect(html).not.toContain("Lo que vimos en los documentos y falta confirmar");
    expect(html).not.toContain("Lo que todavía no se da por conclusión");
    expect(html).not.toContain("Provisional: pendiente de corroborar");
    expect(html).not.toContain("señales provisionales");
    expect(html).not.toContain("Además hay");
  });

  it("Informe: los números del resumen concuerdan en singular y en plural", async () => {
    estado.base = basePortal([CONCLUSION, fila("f-otra", "Nadie cuenta la caja", { impacto: "medio", pilar: "procesos" }), fila("f-fuerte", "Fortaleza: Los clientes vuelven", { veredicto: "keep", pilar: "procesos" }), LEVE]);
    const html = await pintarInforme();
    expect(html).toContain("Se encontraron <strong>2 hallazgos</strong> (1 crítico) y <strong>1 fortaleza</strong> que conviene proteger.");
    expect(html).toContain("Además hay <strong>1 señal provisional</strong>, vista en documentos que nadie confirmó: se lista aparte y no cuenta como hallazgo.");
  });

  it("Informe · el caso del verificador: lo confirmado de un área con poca información se imprime aparte con su porqué, y nunca como salido de documentos", async () => {
    estado.base = basePortal([CONCLUSION, AREA_CORTA], confirmadasDeArea(2));
    const html = await pintarInforme();
    expect(html).not.toContain("Lo que vimos en los documentos y falta confirmar");
    expect(html).not.toMatch(/documentos que (aún )?nadie confirmó/);
    expect(html).not.toContain("Lo vimos en");
    const aparte = html.indexOf("Lo que todavía no se da por conclusión");
    expect(aparte).toBeGreaterThan(0);
    expect(html).toContain("No son conclusiones todavía: cada punto dice por qué.");
    expect(html.split("El dueño aprueba cada compra").length - 1).toBe(1);
    expect(html.indexOf("El dueño aprueba cada compra")).toBeGreaterThan(aparte);
    expect(html).toContain(POR_QUE_AREA);
    expect(html).toContain("Tu equipo · Sale de: lo que tú nos contaste.");
    // Todo lo que lo sostiene ya está confirmado: no se le pone «pendiente de corroborar» encima de «ya está confirmado».
    expect(html).not.toContain("Provisional: pendiente de corroborar");
    expect(html.split("Todavía no es conclusión: falta conocer más el área").length - 1).toBe(1);
    expect(html).toContain("Grave si resulta ser así");
    expect(html).not.toContain("Grave si se confirma");
    // No cuenta como hallazgo ni entra en «por dónde empezar»; el resumen lo nombra por lo que es.
    expect(html).toContain("Se encontraron <strong>1 hallazgo</strong> (1 crítico)");
    // Sin señales de documentos no hay una primera razón: no se dice «por otra razón».
    expect(html).toContain("Además hay <strong>1 punto</strong> que todavía no es conclusión: se lista aparte y no cuenta como hallazgo.");
    expect(html).not.toContain("por otra razón");
    expect(html).not.toContain("RECOMENDACION-f-area");
  });

  it("Informe: con las dos clases, cada una en su sección y el resumen las cuenta por separado", async () => {
    estado.base = basePortal([CONCLUSION, LEVE, GRAVE, AREA_CORTA, fila("f-area-2", "Solo el dueño conoce a los proveedores", { provisional: true, confianza: 0.4, estado_revision: "corregido", finding_evidence: [evDueno("yo trato con los proveedores")] })], confirmadasDeArea(2));
    const html = await pintarInforme();
    expect(html).toContain("Además hay <strong>2 señales provisionales</strong>, vistas en documentos que nadie confirmó, y <strong>2 puntos</strong> que todavía no son conclusión por otra razón: se listan aparte y no cuentan como hallazgos.");
    const documentos = html.indexOf("Lo que vimos en los documentos y falta confirmar");
    const otros = html.indexOf("Lo que todavía no se da por conclusión");
    expect(documentos).toBeGreaterThan(0);
    expect(otros).toBeGreaterThan(documentos);
    for (const titulo of ["Hay mercadería sin costo registrado", "El manual no dice quién abre la tienda"]) {
      expect(html.indexOf(titulo), titulo).toBeGreaterThan(documentos);
      expect(html.indexOf(titulo), titulo).toBeLessThan(otros);
    }
    for (const titulo of ["El dueño aprueba cada compra", "Solo el dueño conoce a los proveedores"]) expect(html.indexOf(titulo), titulo).toBeGreaterThan(otros);
    // «Pendiente de corroborar» solo en los dos que salen de papeles sin confirmar; los otros dos dicen su razón.
    expect(html.split("Provisional: pendiente de corroborar").length - 1).toBe(2);
    expect(html.split("Todavía no es conclusión: falta conocer más el área").length - 1).toBe(2);
  });

  it("el porqué sale de la evidencia real: con 1 afirmación confirmada y 3 papeles sin confirmar nunca se dice «ya está confirmado»", async () => {
    const { empresaHoy } = await import("@/lib/hoy");
    const MIXTO = fila("f-mixto-area", "Las compras dependen de una sola persona", { provisional: true, confianza: 0.4, impacto_potencial: "medio", estado_revision: "aprobado", finding_evidence: [evDueno("yo hago todas las compras"), evDoc("Compras enero.xlsx"), evDoc("Compras febrero.xlsx"), evDoc("Proveedores.docx")] });
    const CUENTA = "De 4 cosas que lo sostienen, 1 está confirmada y 3 siguen por confirmar";
    // Área con poca información: es el caso del pilar diagnosticado en modo provisional.
    estado.base = basePortal([MIXTO], confirmadasDeArea(2));
    const corta = (await empresaHoy(EMPRESA)).porConfirmar[0];
    expect(corta).toMatchObject({ id: "f-mixto-area", motivo: "area_con_poca_informacion", sustento: { confirmadas: 1, porConfirmar: 3 }, contradiccionAbierta: false });
    expect(corta.porQue).toBe(`${CUENTA}. Además, de esta área todavía hay poca información confirmada: cuando sepamos más, se vuelve conclusión o se descarta.`);
    const hoyHtml = await pintarHoy();
    expect(hoyHtml).toContain(corta.porQue);
    expect(hoyHtml).not.toContain("ya está confirmado");
    const informe = await pintarInforme();
    expect(informe).toContain(corta.porQue);
    expect(informe).not.toContain("ya está confirmado");
    // Algo de lo que lo sostiene sigue sin confirmar: aquí «pendiente de corroborar» sí es cierto.
    expect(informe.split("Provisional: pendiente de corroborar").length - 1).toBe(1);
    // Con el área completa el rótulo quedó viejo, pero tampoco entonces se dice que todo está confirmado ni que no hay nada pendiente.
    estado.base = basePortal([MIXTO], confirmadasDeArea(5));
    const completa = (await empresaHoy(EMPRESA)).porConfirmar[0];
    expect(completa.motivo).toBe("pendiente_de_releer");
    expect(completa.porQue).toBe(`${CUENTA}. Falta volver a revisarlo para darlo por conclusión.`);
    expect(await pintarHoy()).not.toContain("nada pendiente");
  });

  it("porQueNoEsConclusion · la regla pura: la cuenta concuerda, y «ya está confirmado» solo se dice cuando todo lo está", async () => {
    const { porQueNoEsConclusion, POR_QUE_NO_ES_CONCLUSION } = await import("@/lib/hoy");
    const de = (motivo: MotivoPorConfirmar, confirmadas: number, porConfirmar: number, contradiccionAbierta = false) => porQueNoEsConclusion({ motivo, sustento: { confirmadas, porConfirmar }, contradiccionAbierta });
    // El caso limpio de cada motivo conserva su texto.
    expect(de("documentos_sin_confirmar", 0, 3)).toBe(POR_QUE_NO_ES_CONCLUSION.documentos_sin_confirmar);
    expect(de("sin_confirmar", 0, 0)).toBe(POR_QUE_NO_ES_CONCLUSION.sin_confirmar);
    expect(de("area_con_poca_informacion", 2, 0)).toBe(POR_QUE_NO_ES_CONCLUSION.area_con_poca_informacion);
    expect(de("pendiente_de_releer", 1, 0)).toBe(POR_QUE_NO_ES_CONCLUSION.pendiente_de_releer);
    // La cuenta concuerda en singular y en plural.
    expect(de("pendiente_de_releer", 2, 1)).toBe("De 3 cosas que lo sostienen, 2 están confirmadas y 1 sigue por confirmar. Falta volver a revisarlo para darlo por conclusión.");
    const AREAS: MotivoPorConfirmar[] = ["area_con_poca_informacion", "pendiente_de_releer"];
    for (const m of AREAS) for (const [c, p] of [[1, 1], [1, 3], [4, 2]]) {
      expect(de(m, c, p), `${m} ${c}+${p}`).not.toContain("ya está confirmado");
      expect(de(m, c, p), `${m} ${c}+${p}`).not.toContain("nada pendiente");
    }
    // Con una contradicción abierta en el área, nunca «de tu parte no hay nada pendiente».
    expect(de("pendiente_de_releer", 1, 0, true)).toBe("Lo que lo sostiene ya está confirmado. Falta volver a revisarlo para darlo por conclusión, y eso espera a que se aclare un punto de esta área donde dos fuentes dicen cosas distintas.");
    expect(de("area_con_poca_informacion", 1, 0, true)).toBe(`${POR_QUE_NO_ES_CONCLUSION.area_con_poca_informacion} Y hay un punto de esta área donde dos fuentes dicen cosas distintas: falta aclararlo.`);
    for (const m of AREAS) for (const [c, p] of [[1, 0], [1, 3]]) expect(de(m, c, p, true), `${m} ${c}+${p}`).not.toContain("nada pendiente");
  });

  it("«de tu parte no hay nada pendiente» no se dice con una contradicción abierta en el área: aclararla es justo lo pendiente", async () => {
    const { empresaHoy } = await import("@/lib/hoy");
    const RELEER = fila("f-releer", "Vendemos tres líneas y una sola deja margen", { pilar: "producto", provisional: true, confianza: 0.4, impacto_potencial: "medio", estado_revision: "aprobado", finding_evidence: [evDueno("vendo tres líneas")] });
    const contradicha = (pilar: string): Fila => ({ id: `contra-${pilar}`, company_id: EMPRESA, texto: `dos fuentes distintas en ${pilar}`, estado: "contradicho", pilar, fecha_afirmacion: null, contradice_a: null, explicacion_contradiccion: null, prioridad_validacion: true, sources: { nombre: "Entrevista", tipo: "entrevista" }, participants: { rol: "dueno", puesto: null } });
    const ESPERA = "Lo que lo sostiene ya está confirmado. Falta volver a revisarlo para darlo por conclusión, y eso espera a que se aclare un punto de esta área donde dos fuentes dicen cosas distintas.";
    // Sin contradicciones: el rótulo quedó viejo y de verdad no hay nada que el dueño tenga que hacer.
    estado.base = basePortal([RELEER], confirmadasDeArea(5, "producto"));
    const limpio = (await empresaHoy(EMPRESA)).porConfirmar[0];
    expect(limpio).toMatchObject({ motivo: "pendiente_de_releer", contradiccionAbierta: false });
    expect(limpio.porQue).toContain("de tu parte no hay nada pendiente");
    // Una contradicción de OTRA área no le toca.
    estado.base = basePortal([RELEER], [...confirmadasDeArea(5, "producto"), contradicha("marketing")]);
    expect((await empresaHoy(EMPRESA)).porConfirmar[0]).toMatchObject({ contradiccionAbierta: false });
    // En su área, o transversal (cuenta para todas): el diagnóstico espera a que se aclare, y eso le toca al dueño.
    for (const pilar of ["producto", "transversal"]) {
      estado.base = basePortal([RELEER], [...confirmadasDeArea(5, "producto"), contradicha(pilar)]);
      const p = (await empresaHoy(EMPRESA)).porConfirmar[0];
      expect(p, pilar).toMatchObject({ motivo: "pendiente_de_releer", contradiccionAbierta: true });
      expect(p.porQue, pilar).toBe(ESPERA);
      const hoyHtml = await pintarHoy();
      expect(hoyHtml, pilar).toContain(ESPERA);
      expect(hoyHtml, pilar).not.toContain("nada pendiente");
      expect(await pintarInforme(), pilar).not.toContain("nada pendiente");
    }
    // También si la contradicción está en lo mismo que lo sostiene, sea del área que sea.
    const CON_DUDA = fila("f-duda", "Vendemos cinco líneas según el registro", { pilar: "producto", provisional: true, confianza: 0.4, impacto_potencial: "medio", estado_revision: "aprobado", finding_evidence: [evDueno("vendo tres líneas"), evDueno("el registro dice cinco", "contradicho")] });
    estado.base = basePortal([CON_DUDA], confirmadasDeArea(5, "producto"));
    const duda = (await empresaHoy(EMPRESA)).porConfirmar[0];
    expect(duda).toMatchObject({ motivo: "pendiente_de_releer", contradiccionAbierta: true, sustento: { confirmadas: 1, porConfirmar: 1 } });
    expect(duda.porQue).not.toContain("nada pendiente");
    expect(duda.porQue).not.toContain("ya está confirmado");
  });

  it("un hallazgo de la IA en un área con menos información confirmada que la mínima no se pinta como conclusión, aunque su columna diga provisional = false", async () => {
    const { empresaHoy } = await import("@/lib/hoy");
    // Un pendiente nacido cuando el área tenía sus confirmadas (o antes del candado): la columna dice que es conclusión.
    const VIEJO = fila("f-viejo", "Nadie decide sin el dueño", { provisional: false, confianza: 0.7, estado_revision: "pendiente" });
    // Lo que escribió el consultor responde por su propia evidencia: el candado del área no lo alcanza.
    const DEL_CONSULTOR = fila("f-del-consultor", "El dueño firma cada cheque", { provisional: false, confianza: 0.7, origen: "consultor", estado_revision: "aprobado" });
    estado.base = basePortal([VIEJO, DEL_CONSULTOR], confirmadasDeArea(2));
    const hoy = await empresaHoy(EMPRESA);
    expect(hoy.noVes.map((h) => h.id)).toEqual(["f-del-consultor"]);
    expect(hoy.porConfirmar.map((p) => [p.id, p.motivo])).toEqual([["f-viejo", "area_con_poca_informacion"]]);
    expect(hoy.tentativo.map((t) => t.problema)).toEqual(["El dueño firma cada cheque"]);
    const html = await pintarHoy();
    expect([...html.matchAll(/data-conclusion="([^"]+)"/g)].map((m) => m[1])).toEqual(["f-del-consultor"]);
    expect(html).not.toContain("RECOMENDACION-f-viejo");
    expect(seccionSinConcluir(html)).toContain("Nadie decide sin el dueño");
    const informe = await pintarInforme();
    expect(informe).toContain("Se encontraron <strong>1 hallazgo</strong> (1 crítico)");
    expect(informe).not.toContain("RECOMENDACION-f-viejo");
    // Cuando el área llega a su mínimo, vuelve a ser la conclusión que su columna dice.
    estado.base = basePortal([VIEJO], confirmadasDeArea(5));
    const completa = await empresaHoy(EMPRESA);
    expect(completa.noVes.map((h) => h.id)).toEqual(["f-viejo"]);
    expect(completa.porConfirmar).toEqual([]);
  });

  it("una fortaleza provisional se ve, rotulada «por confirmar»: ni entre las fortalezas, ni como tarjeta de hallazgo, ni en el plan", async () => {
    const { empresaHoy } = await import("@/lib/hoy");
    estado.base = basePortal([CONCLUSION, FORTALEZA_PROVISIONAL]);
    const hoy = await empresaHoy(EMPRESA);
    expect(hoy.fortalezas).toEqual([]);
    expect(hoy.fortalezasPorConfirmar).toHaveLength(1);
    // Sin el prefijo de la casa, con su origen cierto, y nunca «grave si se confirma»: que resulte cierta es buena noticia.
    expect(hoy.fortalezasPorConfirmar[0]).toMatchObject({ id: "f-fortaleza", titulo: "Atienden rápido en caja", motivo: "documentos_sin_confirmar", graveSiSeConfirma: false, deDonde: "Lo vimos en: Otro.docx." });
    expect(hoy.porConfirmar).toEqual([]);
    expect(hoy.stats).toMatchObject({ porConfirmar: 0, fortalezasPorConfirmar: 1 });
    expect(hoy.tentativo.map((t) => t.problema)).toEqual(["Todo pasa por el dueño"]);
    const html = await pintarHoy();
    const seccion = seccionPlegable(html, "Fortalezas por confirmar")!;
    expect(seccion).toContain("Fortalezas por confirmar · 1");
    expect(seccion.startsWith("<details>")).toBe(true);
    expect(seccion).toContain("Atienden rápido en caja");
    expect(seccion).toContain("Tu equipo · por confirmar");
    expect(seccion).toContain("Sale de documentos que aún nadie confirmó.");
    expect(seccion).toContain("Lo vimos en: Otro.docx.");
    expect(seccion).not.toMatch(/grave/i);
    expect(html).not.toContain("Lo que no debes romper");
    expect(html).not.toContain("RECOMENDACION-f-fortaleza");
    expect([...html.matchAll(/data-conclusion="([^"]+)"/g)].map((m) => m[1])).toEqual(["f-conclusion"]);
    // El informe la imprime aparte y no la cuenta entre las fortalezas.
    const informe = await pintarInforme();
    expect(informe).toContain("<strong>0 fortalezas</strong> que conviene proteger.");
    expect(informe).toContain("Fortalezas por confirmar");
    expect(informe).toContain("Atienden rápido en caja");
    expect(informe).not.toContain("Fortalezas que no se deben romper");
    expect(informe).not.toContain("RECOMENDACION-f-fortaleza");
    // Y una fortaleza de la IA en un área sin el mínimo tampoco pasa por fortaleza cierta.
    estado.base = basePortal([fila("f-fuerte-corta", "Fortaleza: El equipo se queda", { veredicto: "keep" })], confirmadasDeArea(2));
    const corta = await empresaHoy(EMPRESA);
    expect(corta.fortalezas).toEqual([]);
    expect(corta.fortalezasPorConfirmar.map((p) => [p.id, p.motivo])).toEqual([["f-fuerte-corta", "area_con_poca_informacion"]]);
  });

  it("el resumen de un área sin conclusión: la cuenta interna y la jerga guardadas antes no llegan al dueño; las frases fijas sí", async () => {
    const { empresaHoy } = await import("@/lib/hoy");
    const VIEJO = "Solo 2 definiciones confirmadas sobre personas. No hay información suficiente para diagnosticar: hay que levantar más.";
    const diag = (resumen: string | null, estadoPilar = "desconocido"): Fila[] => [{ company_id: EMPRESA, pilar: "personas", estado: estadoPilar, resumen }];
    const resumenDePersonas = async () => (await empresaHoy(EMPRESA)).pilares.find((p) => p.pilar === "personas")!.resumen;
    estado.base = basePortal([GRAVE], [], diag(VIEJO));
    expect(await resumenDePersonas()).toBeNull();
    expect(await pintarHoy()).not.toMatch(/definiciones confirmadas|levantar más/);
    const informe = await pintarInforme();
    expect(informe).not.toMatch(/definiciones confirmadas|levantar más/);
    expect(informe).toContain("Falta información para una conclusión responsable.");
    // La lectura del modelo sobre papeles sin confirmar, guardada antes del remate, tampoco.
    estado.base = basePortal([GRAVE], [], diag("Lectura provisional, pendiente de confirmar: nadie decide sin el dueño."));
    expect(await resumenDePersonas()).toBeNull();
    // Las dos frases fijas del diagnóstico sí llegan, tal cual.
    for (const frase of [RESUMEN_MODO_PROVISIONAL, RESUMEN_SIN_INFORMACION]) {
      estado.base = basePortal([GRAVE], [], diag(frase));
      expect(await resumenDePersonas()).toBe(frase);
      expect(await pintarHoy()).toContain(frase);
    }
    // Y un área que sí tiene conclusión conserva su lectura.
    estado.base = basePortal([GRAVE], [], diag("Lectura con conclusión del área.", "mejorable"));
    expect(await resumenDePersonas()).toBe("Lectura con conclusión del área.");
    expect(RESUMEN_SIN_INFORMACION).not.toMatch(/\d|afirmaci|definici|pilar|levantar|provisional/i);
  });
});

describe("modelo de alto rendimiento · con dobles · el resumen de un pilar sin conclusión no dimensiona nada", () => {
  it("al investigador le llega el estado de cada pilar, y el resumen solo de los que tienen conclusión", async () => {
    estado.base = crearBaseFalsa({
      companies: [{ id: EMPRESA, nombre: "Tienda de prueba", sector: "retail", etapa_negocio: null, ficha: {}, aspiracion: null }],
      diagnoses: [
        { company_id: EMPRESA, pilar: "personas", estado: "desconocido", resumen: RESUMEN_MODO_PROVISIONAL },
        // Un resumen guardado antes de este remate: la lectura del modelo sobre papeles que nadie confirmó.
        { company_id: EMPRESA, pilar: "producto", estado: "desconocido", resumen: "LECTURA-VIEJA-DEL-MODELO sobre papeles sin confirmar" },
        { company_id: EMPRESA, pilar: "procesos", estado: "mejorable", resumen: "LECTURA-CON-CONCLUSION" },
        { company_id: EMPRESA, pilar: "marketing", estado: "solido", resumen: null },
      ],
      processes: [], org_puestos: [], findings: [], modelo_alto_rendimiento: [], modelo_versiones: [],
    });
    estado.investigador.mockReset();
    estado.investigador.mockResolvedValue(respuestaModelo({ procesos_imprescindibles: [], las_tres_brechas_mayores: [] }));
    const { handleModeloAltoRendimiento } = await import("@/lib/jobs/handlers/modelo");
    await handleModeloAltoRendimiento({ id: "jm1", company_id: EMPRESA, payload: {} });
    expect(estado.investigador).toHaveBeenCalledTimes(1);
    const contexto = estado.investigador.mock.calls[0][0] as string;
    expect(contexto).toMatch(/- personas: desconocido(\n|$)/);
    expect(contexto).toMatch(/- producto: desconocido(\n|$)/);
    expect(contexto).not.toContain(RESUMEN_MODO_PROVISIONAL);
    expect(contexto).not.toContain("LECTURA-VIEJA-DEL-MODELO");
    expect(contexto).toContain("- procesos: mejorable — LECTURA-CON-CONCLUSION");
    expect(contexto).toMatch(/- marketing: solido(\n|$)/);
    expect(estado.base!.tablas.modelo_versiones).toHaveLength(1);
  });
});

describe("(a) y (e) el portal pinta lo provisional como lo que es (afirmado sobre el código)", () => {
  it("portal/hoy muestra la sección plegable de por confirmar, su advertencia, el aviso de gravedad y el contador", () => {
    const src = leer("src/app/(cliente)/portal/hoy/page.tsx");
    expect(src).toContain('titulo="Lo que vimos en tus documentos y falta confirmar"');
    expect(src).toContain("{titulo} · {items.length}");
    expect(src).toContain("No son conclusiones: salen de documentos que aún nadie confirmó");
    expect(src).toContain("Hay algo grave si se confirma: revísalo con tu consultor.");
    expect(src).toMatch(/<details open=\{hayGrave\}>/);
    // Cada ítem con su texto y su fuente.
    expect(src).toContain("{p.titulo}");
    expect(src).toContain("{p.deDonde}");
    // El contador, junto al de por validar: solo cuenta como «visto en tus documentos» lo que salió de ellos.
    expect(src).toContain("hoy.stats.porConfirmar > 0");
    expect(src).toContain("vista{deDocumentos.length === 1 ? \"\" : \"s\"} en tus documentos, por confirmar.");
    expect(src).toContain("const deDocumentos = hoy.porConfirmar.filter(esDeDocumentos)");
    // Lo que no es conclusión por otra razón va en su propia sección, con el porqué de cada punto.
    expect(src).toContain('titulo="Lo que todavía no damos por conclusión"');
    expect(src).toContain("items={sinConcluir}");
    // El porqué lo arma hoy.ts con la evidencia real de cada punto; la página solo lo pinta.
    expect(src).toContain("{p.porQue}");
    expect(src).not.toContain("POR_QUE_NO_ES_CONCLUSION");
    // Y la fortaleza que todavía no es conclusión tiene su sección.
    expect(src).toContain('titulo="Fortalezas por confirmar"');
    expect(src).toContain("items={hoy.fortalezasPorConfirmar}");
  });

  it("el informe rotula «Provisional: pendiente de corroborar» y lista lo por confirmar aparte, sin contarlo como hallazgo", () => {
    const src = leer("src/app/(cliente)/portal/informe/page.tsx");
    expect(src).toContain('const ROTULO_PROVISIONAL = "Provisional: pendiente de corroborar"');
    expect(src).toMatch(/h\.provisional && <Rotulo texto=\{ROTULO_PROVISIONAL\}/);
    expect(src).toContain("Lo que vimos en los documentos y falta confirmar");
    expect(src).toContain("se listan aparte y no cuentan como hallazgos");
    expect(src).toContain("Lo que todavía no se da por conclusión");
    expect(src).toContain("{p.porQue}");
    expect(src).not.toContain("POR_QUE_NO_ES_CONCLUSION");
    // El rótulo de cada punto sale de su evidencia, y «por otra razón» solo se dice si hubo una primera.
    expect(src).toContain("<Rotulo texto={rotuloDe(p)}");
    expect(src).toContain('{deDocumentos.length > 0 ? " por otra razón" : ""}');
    expect(src).toContain("items: hoy.fortalezasPorConfirmar");
  });

  it("hoy.ts sigue apartando lo provisional de las conclusiones y lo expone en porConfirmar y en cada hallazgo", () => {
    const src = leer("src/lib/hoy.ts");
    // Conclusión = ni provisional ni de la IA en un área sin el mínimo: una sola regla (noEsConclusion) para las dos listas.
    expect(src).toContain("const noEsConclusion = (f: FilaHallazgo) => !!f.provisional || areaCorta(f);");
    expect(src).toMatch(/\.filter\(\(f\) => !f\.requiere_validacion && !noEsConclusion\(f\)\)/);
    expect(src).toContain("(findings ?? []).filter((f) => !f.requiere_validacion && noEsConclusion(f))");
    expect(src).toContain("provisional: noEsConclusion(f)");
    expect(src).toContain("porConfirmar,");
    expect(src).toContain("fortalezasPorConfirmar,");
  });

  it("diagnostico.ts no vuelve a escribir la lectura del modelo ni la cuenta interna en el resumen de un pilar provisional; modelo.ts no lee el resumen de un pilar desconocido", () => {
    const diag = leer("src/lib/jobs/handlers/diagnostico.ts");
    expect(diag).toContain("const resumen = modoProvisional ? RESUMEN_MODO_PROVISIONAL : d.data.resumen_pilar ?? null;");
    expect(diag).not.toContain("Lectura provisional, pendiente de confirmar");
    expect(leer("src/lib/jobs/handlers/modelo.ts")).toContain('d.resumen && d.estado !== "desconocido"');
  });
});

describe("(f) la consulta de afirmaciones trae las dimensiones de la fuente y el diagnóstico ya no las lee aparte", () => {
  it("claimsDeEmpresa pide autor, período y fidelidad de la fuente; ClaimRow declara comprobacion, confianza y vigente_hasta", () => {
    const src = leer("src/lib/db/queries.ts");
    expect(src).toContain('sources(nombre,tipo,fecha_origen,origen,autor,periodo_desde,periodo_hasta,fidelidad_extraccion)');
    expect(src).toMatch(/comprobacion\?: string \| null/);
    expect(src).toMatch(/confianza\?: number \| null/);
    expect(src).toMatch(/vigente_hasta\?: string \| null/);
  });
  it("diagnostico.ts no vuelve a consultar sources por su cuenta", () => {
    const src = leer("src/lib/jobs/handlers/diagnostico.ts");
    expect(src).not.toMatch(/from\("sources"\)/);
    expect(src).toContain("claimComoEvidencia");
  });
  it("la ruta de revisión usa la misma cadena de columnas y la misma traducción que el diagnóstico", () => {
    const src = leer("src/app/api/findings/[id]/review/route.ts");
    expect(src).toContain("SELECT_SOURCES_DE_CLAIM");
    expect(src).toContain("claimComoEvidencia");
    // La regla es una sola y vive junto al diagnóstico; por dentro son las funciones de rules/evidencia.ts.
    expect(src).toContain("releerEvidencia");
    expect(src).not.toMatch(/function recalcularEvidencia/);
    const diag = leer("src/lib/jobs/handlers/diagnostico.ts");
    expect(diag).toMatch(/export function releerEvidencia/);
    expect(diag).toContain("confianzaDeHallazgo(evidencia, o.hoy)");
  });
});

describe("(d) cierre · lo provisional no alimenta el plan, los entregables ni los indicadores", () => {
  const sustento = (claim_id = "c1"): Fila => ({ claim_id, relacion: "sustenta", claims: { id: claim_id, texto: `dicho ${claim_id}`, fecha_afirmacion: null, source_id: "s1", fragment_id: null, sources: { nombre: "Entrevista", tipo: "entrevista", fecha_origen: null }, participants: null } });
  const aprobado = (id: string, extra: Fila = {}): Fila => ({ id, company_id: EMPRESA, pilar: "personas", patron: null, titulo: `TITULO-${id}`, causa_raiz: `causa de ${id}`, impacto: "alto", recomendacion: `rec ${id}`, filtros: {}, origen: "ia", estado_revision: "aprobado", requiere_validacion: false, provisional: false, finding_evidence: [sustento()], ...extra });
  // El área tiene sus cinco confirmadas: lo que estas pruebas afirman es lo provisional, no el candado del área (ese tiene la suya).
  const baseDecisiones = (findings: Fila[], fallar: Record<string, string> = {}, claims: Fila[] = confirmadasDelPilar(5)) => crearBaseFalsa({ companies: [{ id: EMPRESA, nombre: "Tienda de prueba", sector: "retail", ficha: {}, modelo_operativo: null, etapa_negocio: null }], findings, claims, company_metricas: [], interview_responses: [], company_assets: [], participants: [], deliverables: [], processes: [], actions: [], indicadores: [] }, fallar);
  const trabajo = (id: string) => ({ id, company_id: EMPRESA, payload: {} });

  it("afirmado sobre el código: hallazgosAprobadosConEvidencia excluye lo provisional, y los indicadores tampoco leen lo rechazado ni una columna que no existe", () => {
    const queries = leer("src/lib/db/queries.ts");
    expect(queries).toContain('export const SIN_PROVISIONALES = "provisional.is.null,provisional.eq.false";');
    const cuerpo = queries.slice(queries.indexOf("export async function hallazgosAprobadosConEvidencia"), queries.indexOf("export async function refrescarStats"));
    expect(cuerpo).toContain(".or(SIN_PROVISIONALES)");
    // Y el candado del área, con los hechos de hoy y la misma cuenta que la ruta de revisión: una sola función.
    expect(cuerpo).toContain("await soloConclusionesDeHoy(companyId, conSustento)");
    const candado = queries.slice(queries.indexOf("export async function soloConclusionesDeHoy"), queries.indexOf("export async function hallazgosAprobadosConEvidencia"));
    expect(candado).toContain('.eq("estado", "confirmado").in("pilar", [pilar, "transversal"])');
    expect(candado).toContain("count < MIN_CONFIRMADAS_POR_PILAR");
    expect(candado).toContain('f.origen === "ia"');
    const [lectura] = lecturasDeFindings(leer("src/lib/jobs/handlers/indicadores.ts"));
    expect(lectura).toContain('.neq("estado_revision", "rechazado")');
    // `costo_posible` vive dentro de filtros: pedirlo como columna hacía fallar la consulta entera sin avisar.
    expect(lectura).toContain('.select("titulo,causa_raiz,filtros,pilar,origen")');
    expect(lectura).not.toContain("costo_posible");
    // Las dos lecturas que no pasan por la frontera (el plan estratégico y los indicadores) también leen el candado de hoy.
    expect(leer("src/lib/jobs/handlers/indicadores.ts")).toContain("await soloConclusionesDeHoy(job.company_id, hallazgosLeidos ?? [])");
    expect(leer("src/lib/jobs/handlers/plan.ts")).toContain("await soloConclusionesDeHoy(job.company_id, hallazgosLeidos ?? [])");
    // Las tres decisiones que salen de esa lista siguen pasando por ella.
    const plan = leer("src/lib/jobs/handlers/plan.ts");
    expect(plan.split("await hallazgosAprobadosConEvidencia(job.company_id)").length - 1).toBe(2);
    expect(leer("src/app/(cliente)/portal/resultados/page.tsx")).toContain("await hallazgosAprobadosConEvidencia(c.companyId)");
  });

  it("hallazgosAprobadosConEvidencia: un aprobado provisional no entra (aprobar no es confirmar); el anterior a la columna sí", async () => {
    const { hallazgosAprobadosConEvidencia } = await import("@/lib/db/queries");
    estado.base = baseDecisiones([
      aprobado("f-conclusion"),
      aprobado("f-provisional", { provisional: true }),
      aprobado("f-corregido-provisional", { provisional: true, estado_revision: "corregido" }),
      aprobado("f-anterior", { provisional: null, estado_revision: "corregido" }),
      aprobado("f-pendiente", { estado_revision: "pendiente" }),
      aprobado("f-pide-validacion", { requiere_validacion: true }),
      aprobado("f-sin-evidencia", { finding_evidence: [] }),
    ]);
    expect((await hallazgosAprobadosConEvidencia(EMPRESA)).map((h) => h.id).sort()).toEqual(["f-anterior", "f-conclusion"]);
  });

  it("si los hallazgos aprobados no se pueden leer, no se devuelve una lista vacía que se lea como «no hay»: se lanza con el motivo", async () => {
    const { hallazgosAprobadosConEvidencia } = await import("@/lib/db/queries");
    estado.base = baseDecisiones([aprobado("f-conclusion")], { "findings:select": "la base no responde" });
    await expect(hallazgosAprobadosConEvidencia(EMPRESA)).rejects.toThrow("No se pudo leer los hallazgos aprobados: la base no responde");
    // Y si no se puede contar lo confirmado del área, tampoco se supone que alcanza.
    estado.base = baseDecisiones([aprobado("f-conclusion")], { "claims:select": "la base no responde" });
    await expect(hallazgosAprobadosConEvidencia(EMPRESA)).rejects.toThrow("No se pudo contar las afirmaciones confirmadas de personas, así que no se sabe si sus hallazgos son conclusión: la base no responde");
  });

  it("el candado del área se lee con los hechos de hoy, como en Mi empresa hoy: aunque la columna diga provisional = false, lo de la IA en un área sin el mínimo no sale como conclusión", async () => {
    const { hallazgosAprobadosConEvidencia } = await import("@/lib/db/queries");
    const guardados = () => [
      aprobado("f-ia-personas"),
      aprobado("f-ia-producto", { pilar: "producto" }),
      // Lo que escribió la consultora responde por su propia evidencia: el candado del área no lo alcanza.
      aprobado("f-consultora-personas", { origen: "consultor" }),
    ];
    // Personas bajó a 4 confirmadas (la columna todavía no lo sabe); producto llega a 5 con una transversal.
    estado.base = baseDecisiones(guardados(), {}, [...confirmadasDelPilar(4), ...confirmadasDelPilar(4, "producto"), { id: "t1", company_id: EMPRESA, estado: "confirmado", pilar: "transversal" }]);
    // 4 de personas + 1 transversal = 5: la cuenta es la del diagnóstico, y con ella personas sí llega.
    expect((await hallazgosAprobadosConEvidencia(EMPRESA)).map((h) => h.id).sort()).toEqual(["f-consultora-personas", "f-ia-personas", "f-ia-producto"]);
    // Sin la transversal ninguna de las dos áreas llega: de la IA no sale nada, lo de la consultora sí.
    estado.base = baseDecisiones(guardados(), {}, [...confirmadasDelPilar(4), ...confirmadasDelPilar(4, "producto")]);
    expect((await hallazgosAprobadosConEvidencia(EMPRESA)).map((h) => h.id)).toEqual(["f-consultora-personas"]);
    // Las de otra empresa y las que no están confirmadas no cuentan.
    estado.base = baseDecisiones(guardados(), {}, [...confirmadasDelPilar(4), { id: "ajena", company_id: "otra-empresa", estado: "confirmado", pilar: "personas" }, { id: "sv", company_id: EMPRESA, estado: "sin_verificar", pilar: "personas" }, ...confirmadasDelPilar(5, "producto")]);
    expect((await hallazgosAprobadosConEvidencia(EMPRESA)).map((h) => h.id).sort()).toEqual(["f-consultora-personas", "f-ia-producto"]);
    // Y el plan de 45 días no se arma sobre lo que hoy no es conclusión.
    estado.planificador.mockReset();
    estado.base = baseDecisiones([aprobado("f-ia-personas")], {}, confirmadasDelPilar(4));
    const { handlePlanificar } = await import("@/lib/jobs/handlers/plan");
    await expect(handlePlanificar(trabajo("jp0"))).rejects.toThrow("No hay hallazgos aprobados");
    expect(estado.planificador).not.toHaveBeenCalled();
  });

  it("el plan estratégico y los indicadores tampoco leen lo de la IA de un área que hoy no llega al mínimo, ni aprobado ni pendiente; lo de la consultora sí", async () => {
    const guardados = () => [
      aprobado("f-ia-aprobado"),
      aprobado("f-ia-pendiente", { estado_revision: "pendiente" }),
      aprobado("f-consultora", { origen: "consultor" }),
      aprobado("f-ia-producto", { pilar: "producto" }),
    ];
    // Personas bajó a 4 confirmadas; producto tiene sus 5.
    const claims = [...confirmadasDelPilar(4), ...confirmadasDelPilar(5, "producto")];
    estado.estratega.mockReset();
    estado.estratega.mockResolvedValue(respuestaModelo({ prioridades: [] }));
    estado.base = baseDecisiones(guardados(), {}, claims);
    const { handlePlanEstrategico } = await import("@/lib/jobs/handlers/plan");
    await handlePlanEstrategico(trabajo("je3"));
    const alEstratega = estado.estratega.mock.calls[0][0] as string;
    expect(alEstratega).toContain("HALLAZGOS (2)");
    expect(alEstratega).toContain("TITULO-f-consultora");
    expect(alEstratega).toContain("TITULO-f-ia-producto");
    expect(alEstratega).not.toContain("TITULO-f-ia-aprobado");
    expect(alEstratega).not.toContain("TITULO-f-ia-pendiente");
    estado.medidor.mockReset();
    estado.medidor.mockResolvedValue(respuestaModelo({ indicadores: [] }));
    estado.base = baseDecisiones(guardados(), {}, claims);
    const { handleProponerIndicadores } = await import("@/lib/jobs/handlers/indicadores");
    await handleProponerIndicadores(trabajo("ji3"));
    const alMedidor = estado.medidor.mock.calls[0][0] as string;
    expect(alMedidor).toContain("TITULO-f-consultora");
    expect(alMedidor).toContain("TITULO-f-ia-producto");
    expect(alMedidor).not.toContain("TITULO-f-ia-aprobado");
    expect(alMedidor).not.toContain("TITULO-f-ia-pendiente");
    // Con solo lo de un área corta no hay con qué redactar, y si la cuenta no se puede hacer no se supone que alcanza.
    estado.estratega.mockClear();
    estado.base = baseDecisiones([aprobado("f-ia-aprobado")], {}, confirmadasDelPilar(4));
    await expect(handlePlanEstrategico(trabajo("je4"))).rejects.toThrow("Todavía no hay hallazgos");
    estado.base = baseDecisiones([aprobado("f-ia-aprobado")], { "claims:select": "la base no responde" });
    await expect(handlePlanEstrategico(trabajo("je5"))).rejects.toThrow("No se pudo contar las afirmaciones confirmadas de personas");
    await expect(handleProponerIndicadores(trabajo("ji4"))).rejects.toThrow("No se pudo contar las afirmaciones confirmadas de personas");
    expect(estado.estratega).not.toHaveBeenCalled();
  });

  it("handlePlanificar: si todo lo aprobado es provisional no hay con qué planificar; el planificador no se llama y no nace ninguna acción", async () => {
    estado.planificador.mockReset();
    estado.base = baseDecisiones([aprobado("f-provisional", { provisional: true }), aprobado("f-otro-provisional", { provisional: true, estado_revision: "corregido" })]);
    const { handlePlanificar } = await import("@/lib/jobs/handlers/plan");
    await expect(handlePlanificar(trabajo("jp1"))).rejects.toThrow("No hay hallazgos aprobados");
    expect(estado.planificador).not.toHaveBeenCalled();
    expect(estado.base!.tablas.actions).toHaveLength(0);
  });

  it("handlePlanEstrategico: al estratega le llegan las conclusiones y nunca lo provisional; con solo provisionales no se redacta", async () => {
    estado.estratega.mockReset();
    estado.estratega.mockResolvedValue(respuestaModelo({ prioridades: [] }));
    estado.base = baseDecisiones([aprobado("f-conclusion"), aprobado("f-provisional", { provisional: true }), aprobado("f-pendiente-provisional", { provisional: true, estado_revision: "pendiente" }), aprobado("f-anterior", { provisional: null })]);
    const { handlePlanEstrategico } = await import("@/lib/jobs/handlers/plan");
    await handlePlanEstrategico(trabajo("je1"));
    expect(estado.estratega).toHaveBeenCalledTimes(1);
    const contexto = estado.estratega.mock.calls[0][0] as string;
    expect(contexto).toContain("HALLAZGOS (2)");
    expect(contexto).toContain("TITULO-f-conclusion");
    expect(contexto).toContain("TITULO-f-anterior");
    expect(contexto).not.toContain("TITULO-f-provisional");
    expect(contexto).not.toContain("TITULO-f-pendiente-provisional");
    expect(estado.base!.tablas.deliverables).toHaveLength(1);
    estado.estratega.mockClear();
    estado.base = baseDecisiones([aprobado("f-provisional", { provisional: true })]);
    await expect(handlePlanEstrategico(trabajo("je2"))).rejects.toThrow("Todavía no hay hallazgos");
    expect(estado.estratega).not.toHaveBeenCalled();
    expect(estado.base!.tablas.deliverables).toHaveLength(0);
  });

  it("handleProponerIndicadores: al medidor no le llega lo provisional ni lo rechazado, y el costo posible sale de donde vive", async () => {
    estado.medidor.mockReset();
    estado.medidor.mockResolvedValue(respuestaModelo({ indicadores: [] }));
    estado.base = baseDecisiones([
      aprobado("f-conclusion", { filtros: { costo_posible: "S/ 500 al mes" } }),
      aprobado("f-provisional", { provisional: true }),
      aprobado("f-rechazado", { estado_revision: "rechazado" }),
      aprobado("f-medio", { impacto: "medio" }),
    ]);
    const { handleProponerIndicadores } = await import("@/lib/jobs/handlers/indicadores");
    expect(await handleProponerIndicadores(trabajo("ji1"))).toEqual({ indicadores: 0, propuestos: 0 });
    const contexto = estado.medidor.mock.calls[0][0] as string;
    expect(contexto).toContain("- TITULO-f-conclusion. Causa: causa de f-conclusion. Cuesta: S/ 500 al mes");
    expect(contexto).not.toContain("TITULO-f-provisional");
    expect(contexto).not.toContain("TITULO-f-rechazado");
    expect(contexto).not.toContain("TITULO-f-medio");
    // Con solo provisionales no hay material: no se llama al medidor ni se propone «lo típico del rubro».
    estado.medidor.mockClear();
    estado.base = baseDecisiones([aprobado("f-provisional", { provisional: true })]);
    expect(await handleProponerIndicadores(trabajo("ji2"))).toEqual({ indicadores: 0, motivo: "todavía no hay incidencias ni hallazgos de los que salgan números" });
    expect(estado.medidor).not.toHaveBeenCalled();
  });
});

describe("handleDiagnosticar · con dobles · pilar desconocido: el pendiente de la IA no se queda como conclusión", () => {
  const pendiente = (id: string, claim_ids: string[], extra: Fila = {}): Fila => ({
    id, company_id: EMPRESA, pilar: "personas", origen: "ia", estado_revision: "pendiente", requiere_validacion: false, titulo: `Pendiente ${id}`,
    provisional: false, confianza: 0.55, confianza_motivo: "las 1 afirmaciones están confirmadas", auditoria: { sustentado: true },
    finding_evidence: claim_ids.map((claim_id) => ({ claim_id, relacion: "sustenta" })), ...extra,
  });
  const fila = (id: string) => estado.base!.tablas.findings.find((x) => x.id === id)!;

  beforeEach(() => {
    estado.base = baseVacia();
    estado.encolados = [];
    estado.diagnosticador.mockReset();
    estado.auditor.mockReset();
    estado.diagnosticador.mockResolvedValue(respuestaModelo({ hallazgos: [], preguntas_pendientes: [], dimensiones_sin_evidencia: [], resumen_pilar: null }));
    estado.auditor.mockResolvedValue(respuestaModelo({ auditorias: [] }));
  });

  it("2 confirmadas y ningún papel: los pendientes de la IA pasan a provisional con el porqué del candado, sin llamar al modelo", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2")];
    estado.base!.tablas.findings.push(
      pendiente("f-pendiente", ["c1"]),
      // Nacido antes de que existieran estas columnas: a un pendiente no lo aprobó nadie, así que también se relee.
      pendiente("f-pendiente-sin-lectura", ["c2"], { confianza: null, confianza_motivo: null }),
      // Lo que no le corresponde: lo escrito por el consultor, lo de otro pilar, lo rechazado y lo que no tiene evidencia.
      pendiente("f-del-consultor", ["c1"], { origen: "consultor" }),
      pendiente("f-otro-pilar", ["c1"], { pilar: "producto" }),
      pendiente("f-rechazado", ["c1"], { estado_revision: "rechazado" }),
      pendiente("f-sin-evidencia", []),
    );
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "jd1", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toEqual({ estado: "desconocido", confirmadas: 2, afirmaciones_provisionales: 0, revisados_releidos: 0, revisados_cambiados: 0, pendientes_pasados_a_provisional: 2 });
    expect(estado.diagnosticador).not.toHaveBeenCalled();
    for (const id of ["f-pendiente", "f-pendiente-sin-lectura"]) {
      const f = fila(id);
      expect(f, id).toMatchObject({ estado_revision: "pendiente", provisional: true });
      expect(f.confianza, id).toBeLessThanOrEqual(0.4);
      expect(f.confianza_motivo, id).toContain("el pilar tiene 2 afirmaciones confirmadas de las 5 que exige una conclusión: todo el diagnóstico es provisional");
    }
    for (const id of ["f-del-consultor", "f-otro-pilar", "f-rechazado", "f-sin-evidencia"]) expect(fila(id), id).toMatchObject({ provisional: false, confianza: 0.55 });
    // Segunda pasada sin nada nuevo: se relee, no se escribe, y el resultado no anuncia cambios que no hubo.
    const r2 = await handleDiagnosticar({ id: "jd2", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r2).toEqual({ estado: "desconocido", confirmadas: 2, afirmaciones_provisionales: 0, revisados_releidos: 0, revisados_cambiados: 0 });
  });

  it("cuando el pilar sí se diagnostica, los pendientes no se releen: se borran y se recrean con su rótulo del día", async () => {
    estado.claims = [confirmada("c1"), confirmada("c2"), confirmada("c3"), confirmada("c4"), confirmada("c5")];
    estado.base!.tablas.findings.push(pendiente("f-pendiente", ["c1"]));
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "jd3", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toMatchObject({ modo_provisional: false, revisados_releidos: 0, revisados_cambiados: 0 });
    expect(r).not.toHaveProperty("pendientes_pasados_a_provisional");
    expect(estado.base!.tablas.findings).toHaveLength(0);
  });

  it("si un pendiente no se puede reescribir, el resultado lo dice", async () => {
    estado.base = crearBaseFalsa({ ...baseVacia().tablas, findings: [pendiente("f-pendiente", ["c1"])] }, { "findings:update": "sin permiso de escritura" });
    estado.claims = [confirmada("c1"), confirmada("c2")];
    const { handleDiagnosticar } = await import("@/lib/jobs/handlers/diagnostico");
    const r = await handleDiagnosticar({ id: "jd4", company_id: EMPRESA, payload: { pilar: "personas" } });
    expect(r).toEqual({ estado: "desconocido", confirmadas: 2, afirmaciones_provisionales: 0, revisados_releidos: 0, revisados_cambiados: 0, revisados_error: "sin permiso de escritura" });
  });
});

describe("POST /api/findings · con dobles · el hallazgo que escribe la consultora nace leyendo su evidencia", () => {
  const perfil = { id: "u-consultora", rol: "consultor" } as const;
  const crear = async (body: Fila) => {
    const { POST } = await import("@/app/api/findings/route");
    const handler = POST as unknown as (p: typeof perfil, req: Request) => Promise<{ status: number; body: Fila }>;
    return handler(perfil, new Request("http://prueba.local/api/findings", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  };
  const afirmacion = (id: string, estadoClaim: string, extra: Fila = {}): Fila => ({ id, company_id: EMPRESA, source_id: `doc-${id}`, participant_id: null, estado: estadoClaim, comprobacion: null, confianza: null, vigente_hasta: null, sources: { nombre: `Doc ${id}`, tipo: "documento", fecha_origen: null, origen: "cliente", autor: `autor-${id}`, periodo_desde: null, periodo_hasta: null, fidelidad_extraccion: "alta" }, participants: null, ...extra });
  const baseRuta = (claims: Fila[], fallar: Record<string, string> = {}) => crearBaseFalsa({ claims, findings: [], finding_evidence: [], corrections: [] }, fallar);
  const cuerpo = (claim_ids: string[], extra: Fila = {}): Fila => ({ company_id: EMPRESA, pilar: "personas", titulo: "  Nadie cuenta la caja  ", impacto: "alto", claim_ids, ...extra });

  it("solo papeles que nadie confirmó → nace aprobado pero provisional, con confianza baja y su porqué; el impacto potencial va aparte", async () => {
    estado.base = baseRuta([afirmacion("d1", "sin_verificar"), afirmacion("d2", "sin_verificar")]);
    const r = await crear(cuerpo(["d1", "d2"]));
    expect(r.status).toBe(201);
    const f = estado.base!.tablas.findings[0];
    expect(f).toMatchObject({ titulo: "Nadie cuenta la caja", origen: "consultor", estado_revision: "aprobado", provisional: true, impacto: "alto", impacto_potencial: "alto" });
    expect(f.confianza).toBeLessThan(0.5);
    expect(f.confianza_motivo).toMatch(/no confirmada/);
    // No nace provisional en silencio: la respuesta se lo dice a quien lo escribe, con lo que implica y qué lo levanta.
    expect(r.body).toEqual({ id: f.id, provisional: true, confianza: f.confianza, aviso: expect.stringContaining("no entra al plan ni a los documentos del cliente") });
    expect(r.body.aviso).toContain("Deja de ser provisional cuando eso se confirme y el área se vuelva a leer.");
    expect(estado.base!.tablas.finding_evidence.map((e) => [e.finding_id, e.claim_id, e.relacion])).toEqual([[f.id, "d1", "sustenta"], [f.id, "d2", "sustenta"]]);
    expect(estado.base!.tablas.corrections).toHaveLength(1);
  });

  it("con su evidencia confirmada → no es provisional, y la lectura es la misma que deja la ruta de revisión (releerEvidencia)", async () => {
    const claims = [afirmacion("d1", "confirmado"), afirmacion("d2", "confirmado")];
    estado.base = baseRuta(claims);
    const r = await crear(cuerpo(["d1", "d2"]));
    expect(r.status).toBe(201);
    const { releerEvidencia } = await import("@/lib/jobs/handlers/diagnostico");
    const { claimComoEvidencia } = await import("@/lib/db/queries");
    const esperado = releerEvidencia(claims.map((c) => claimComoEvidencia(c as never)), { origen: "consultor" })!;
    expect(esperado.provisional).toBe(false);
    expect(r.body).toMatchObject({ provisional: false, aviso: null });
    expect(estado.base!.tablas.findings[0]).toMatchObject(esperado);
    expect(estado.base!.tablas.findings[0].confianza_motivo).toContain("las 2 afirmaciones están confirmadas");
    // El candado del área no alcanza a lo que escribe la consultora: no se le añade el motivo del pilar.
    expect(estado.base!.tablas.findings[0].confianza_motivo).not.toContain("todo el diagnóstico es provisional");
  });

  it("una definición de otra empresa, o que no existe, no sostiene nada: 400 y no se guarda", async () => {
    estado.base = baseRuta([afirmacion("d1", "confirmado"), afirmacion("ajena", "confirmado", { company_id: "otra-empresa" })]);
    for (const ids of [["d1", "ajena"], ["d1", "no-existe"]]) {
      const r = await crear(cuerpo(ids));
      expect(r.status, ids.join()).toBe(400);
      expect(r.body.error, ids.join()).toContain("no existe en esta empresa");
    }
    expect(estado.base!.tablas.findings).toHaveLength(0);
    expect(estado.base!.tablas.finding_evidence).toHaveLength(0);
  });

  it("si la evidencia no se puede leer no se guarda a ciegas, y si no se puede enlazar no pasa por guardado: 500 con el motivo", async () => {
    estado.base = baseRuta([afirmacion("d1", "confirmado")], { "claims:select": "la base no responde" });
    const sinLeer = await crear(cuerpo(["d1"]));
    expect(sinLeer.status).toBe(500);
    expect(sinLeer.body.error).toContain("no se guarda a ciegas: la base no responde");
    expect(estado.base!.tablas.findings).toHaveLength(0);
    estado.base = baseRuta([afirmacion("d1", "confirmado")], { "finding_evidence:insert": "clave repetida" });
    const sinEnlace = await crear(cuerpo(["d1"]));
    expect(sinEnlace.status).toBe(500);
    expect(sinEnlace.body.error).toContain("no se pudo enlazar su evidencia (clave repetida)");
    expect(estado.base!.tablas.corrections).toHaveLength(0);
  });

  it("sigue exigiendo evidencia, y no enlaza dos veces la misma: ni repetida, ni a la vez como sustento y como contraria", async () => {
    estado.base = baseRuta([afirmacion("d1", "confirmado"), afirmacion("x1", "confirmado")]);
    const sin = await crear(cuerpo([]));
    expect(sin.status).toBe(400);
    expect(sin.body.error).toContain("Un hallazgo sin evidencia no se guarda");
    const r = await crear(cuerpo(["d1", "d1"], { claims_contrarios: ["d1", "x1"] }));
    expect(r.status).toBe(201);
    expect(estado.base!.tablas.finding_evidence.map((e) => [e.claim_id, e.relacion])).toEqual([["d1", "sustenta"], ["x1", "contradice"]]);
  });
});
