/**
 * REENCOLAR CON CABEZA.
 *
 * El reintento de un trabajo (POST /api/jobs/[id]) BORRABA el original y encolaba otro con la misma
 * clave, sin mirar si entre medias ya había corrido —y terminado bien— otro trabajo con la misma
 * petición. Perdía la constancia del fallo y podía pagar dos veces el mismo resultado. Estas pruebas
 * corren `reencolarSeguro` y `encolar` contra una base FALSA en memoria que reproduce lo que importa
 * de Postgres: la unicidad de `idempotency_key` (error 23505) y los filtros que usa la cola.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const estado = vi.hoisted(() => ({ base: null as null | ReturnType<typeof crearBaseFalsa> }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
// La capa de autenticación se aparta: aquí se prueba lo que la ruta HACE con la base, no quién puede llamarla.
vi.mock("@/lib/api", () => ({
  protegido: (_opts: unknown, fn: unknown) => fn,
  ok: (data: unknown, status = 200) => ({ status, body: data }),
  fallo: (mensaje: string, status = 400) => ({ status, body: { error: mensaje } }),
  exigirAcceso: async () => {},
}));

/** Lo mínimo de PostgREST que usa la cola, en memoria. Las consultas se resuelven al hacer `await`. */
function crearBaseFalsa(inicial: Record<string, Fila[]> = {}) {
  const tablas: Record<string, Fila[]> = inicial;
  const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];
  /** Tablas cuyo `insert` falla: para probar qué hace el código cuando la base dice no. */
  const insertsQueFallan = new Set<string>();
  let seq = 0;
  class Consulta {
    private filtros: ((f: Fila) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "delete" = "select";
    private fila: Fila | null = null;
    private patch: Fila | null = null;
    private contar = false;
    private soloConteo = false;
    private orden: { col: string; asc: boolean } | null = null;
    private tope: number | null = null;
    private unico: "single" | "maybe" | null = null;
    constructor(private tabla: string) {}
    select(_c?: string, o?: { count?: string; head?: boolean }) { this.contar = o?.count === "exact"; this.soloConteo = !!o?.head; return this; }
    insert(f: Fila) { this.op = "insert"; this.fila = f; return this; }
    update(p: Fila) { this.op = "update"; this.patch = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq(c: string, v: unknown) { this.filtros.push((f) => f[c] === v); return this; }
    neq(c: string, v: unknown) { this.filtros.push((f) => f[c] !== v); return this; }
    gt(c: string, v: string) { this.filtros.push((f) => String(f[c]) > v); return this; }
    lt(c: string, v: string) { this.filtros.push((f) => String(f[c]) < v); return this; }
    is(c: string, v: unknown) { this.filtros.push((f) => f[c] == v); return this; }
    in(c: string, vs: unknown[]) { this.filtros.push((f) => vs.includes(f[c])); return this; }
    like(c: string, p: string) { const pre = p.replace(/%$/, ""); this.filtros.push((f) => typeof f[c] === "string" && f[c].startsWith(pre)); return this; }
    not(c: string, _op: string, v: unknown) { this.filtros.push((f) => f[c] != v); return this; }
    contains(c: string, sub: Fila) { this.filtros.push((f) => Object.entries(sub).every(([k, v]) => JSON.stringify(f[c]?.[k]) === JSON.stringify(v))); return this; }
    order(c: string, o?: { ascending?: boolean }) { this.orden = { col: c, asc: o?.ascending !== false }; return this; }
    limit(n: number) { this.tope = n; return this; }
    single() { this.unico = "single"; return this; }
    maybeSingle() { this.unico = "maybe"; return this; }
    then<A, B>(res: (v: Fila) => A, rej?: (e: unknown) => B) { return Promise.resolve().then(() => this.ejecutar()).then(res, rej); }
    private ejecutar(): Fila {
      const t = (tablas[this.tabla] ??= []);
      if (this.op === "insert") {
        if (insertsQueFallan.has(this.tabla)) return { data: null, error: { code: "XX000", message: `insert en ${this.tabla} rechazado a propósito` } };
        const row = { ...this.fila };
        // `idempotency_key text unique`: Postgres responde 23505 y la cola debe devolver el existente.
        if (row.idempotency_key && t.some((x) => x.idempotency_key === row.idempotency_key)) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        seq++;
        row.id ??= `${this.tabla}-${seq}`;
        row.created_at ??= `2026-10-13T10:00:${String(seq).padStart(2, "0")}Z`;
        row.estado ??= "pendiente";
        row.intentos ??= 0;
        t.push(row);
        return { data: this.unico ? row : [row], error: null };
      }
      let filas = t.filter((f) => this.filtros.every((fn) => fn(f)));
      if (this.op === "update") { for (const f of filas) Object.assign(f, this.patch); return { data: filas, error: null }; }
      if (this.op === "delete") { tablas[this.tabla] = t.filter((f) => !filas.includes(f)); return { data: null, error: null }; }
      if (this.orden) { const { col, asc } = this.orden; filas = [...filas].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1)); }
      if (this.tope != null) filas = filas.slice(0, this.tope);
      if (this.contar) return { data: this.soloConteo ? null : filas, count: filas.length, error: null };
      if (this.unico === "single") return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: `se esperaba una fila y hay ${filas.length}` } };
      if (this.unico === "maybe") return { data: filas[0] ?? null, error: null };
      return { data: filas, error: null };
    }
  }
  return {
    tablas,
    rpcs,
    insertsQueFallan,
    from: (t: string) => new Consulta(t),
    rpc: async (nombre: string, args: Record<string, unknown>) => { rpcs.push({ nombre, args }); return { data: nombre === "circuito_abierto" ? false : true, error: null }; },
  };
}

const T1 = "2026-09-28T10:00:00Z", T2 = "2026-09-28T12:00:00Z", T3 = "2026-09-29T09:00:00Z";
const fallido = (id: string, extra: Fila = {}): Fila => ({ id, company_id: "c1", tipo: "diagnosticar", payload: { pilar: "procesos" }, prioridad: 7, estado: "fallido", intentos: 3, max_intentos: 3, error: "Gemini 402: prepayment credits depleted", created_at: T1, idempotency_key: `k-${id}`, origen_job_id: null, ...extra });

describe("reencolarSeguro", () => {
  beforeEach(() => {
    estado.base = crearBaseFalsa({ jobs: [] });
  });

  it("NO reencola si después ya corrió y terminó bien la misma petición (aunque el payload venga con otro orden de claves)", async () => {
    const { reencolarSeguro } = await import("@/lib/jobs/queue");
    estado.base!.tablas.jobs.push(fallido("j1", { payload: { pilar: "procesos", forzar: true } }), fallido("j2", { estado: "hecho", error: null, created_at: T2, payload: { forzar: true, pilar: "procesos" } }));
    const r = await reencolarSeguro("j1");
    expect(r).toEqual({ reencolado: false, motivo: "Ya hay una ejecución posterior que terminó bien con la misma petición.", job_id: "j2", job_posterior_id: "j2" });
    expect(estado.base!.tablas.jobs).toHaveLength(2);
  });

  it("un trabajo posterior ANTERIOR en el tiempo, o con otro payload, o fallido, no cuenta como «ya hecho»", async () => {
    const { reencolarSeguro } = await import("@/lib/jobs/queue");
    estado.base!.tablas.jobs.push(
      fallido("j1", { created_at: T2 }),
      fallido("antes", { estado: "hecho", error: null, created_at: T1 }), // terminó bien, pero ANTES del fallo
      fallido("otro", { estado: "hecho", error: null, created_at: T3, payload: { pilar: "personas" } }), // otra petición
      fallido("mal", { created_at: T3 }) // posterior pero fallido
    );
    const r = await reencolarSeguro("j1");
    expect(r.reencolado).toBe(true);
    expect(estado.base!.tablas.jobs).toHaveLength(5);
  });

  it("reencola conservando el original: el nuevo lo referencia y el original anota a qué dio paso", async () => {
    const { reencolarSeguro } = await import("@/lib/jobs/queue");
    estado.base!.tablas.jobs.push(fallido("j1"));
    const r = await reencolarSeguro("j1");
    expect(r.reencolado).toBe(true);
    expect(r.motivo).toBeNull();
    const original = estado.base!.tablas.jobs.find((j) => j.id === "j1")!;
    const nuevo = estado.base!.tablas.jobs.find((j) => j.id === r.job_id)!;
    expect(original).toMatchObject({ estado: "fallido", error: "Gemini 402: prepayment credits depleted", progreso: `Reencolado como trabajo ${nuevo.id}` });
    expect(nuevo).toMatchObject({ estado: "pendiente", intentos: 0, tipo: "diagnosticar", company_id: "c1", prioridad: 7, payload: { pilar: "procesos" }, origen_job_id: "j1" });
    expect(nuevo.idempotency_key).not.toBe(original.idempotency_key);
  });

  it("reencolar dos veces el mismo trabajo no crea dos: la segunda vez lo dice", async () => {
    const { reencolarSeguro } = await import("@/lib/jobs/queue");
    estado.base!.tablas.jobs.push(fallido("j1"));
    const a = await reencolarSeguro("j1");
    const b = await reencolarSeguro("j1");
    expect(a.reencolado).toBe(true);
    expect(b).toEqual({ reencolado: false, motivo: "Este trabajo ya fue reencolado antes.", job_id: a.job_id, job_posterior_id: a.job_id });
    expect(estado.base!.tablas.jobs).toHaveLength(2);
  });

  it("un trabajo pendiente o corriendo no se reencola; uno inexistente se dice", async () => {
    const { reencolarSeguro } = await import("@/lib/jobs/queue");
    estado.base!.tablas.jobs.push(fallido("p", { estado: "pendiente", error: null }), fallido("c", { estado: "corriendo", error: null }));
    expect((await reencolarSeguro("p")).reencolado).toBe(false);
    expect((await reencolarSeguro("c")).reencolado).toBe(false);
    expect((await reencolarSeguro("nada"))).toMatchObject({ reencolado: false, motivo: "El trabajo no existe." });
    expect(estado.base!.tablas.jobs).toHaveLength(2);
  });

  it("la ruta POST /api/jobs/[id] usa reencolarSeguro y ya no borra el trabajo (afirmado sobre el código)", () => {
    const ruta = readFileSync(path.resolve(__dirname, "../src/app/api/jobs/[id]/route.ts"), "utf8");
    expect(ruta).toContain("reencolarSeguro(id)");
    expect(ruta).not.toMatch(/from\("jobs"\)\.delete\(\)/);
  });
});

describe("encolar con la clave por defecto", () => {
  beforeEach(() => {
    estado.base = crearBaseFalsa({ jobs: [] });
  });

  it("la misma petición dos veces es UN trabajo: la segunda recibe el existente como duplicado, no un error", async () => {
    const { encolar } = await import("@/lib/jobs/queue");
    const a = await encolar({ company_id: "c1", tipo: "diagnosticar", payload: { pilar: "procesos", forzar: false }, prioridad: 7 });
    const b = await encolar({ company_id: "c1", tipo: "diagnosticar", payload: { forzar: false, pilar: "procesos" }, prioridad: 7 });
    expect(a.duplicado).toBe(false);
    expect(b).toEqual({ id: a.id, duplicado: true });
    expect(estado.base!.tablas.jobs).toHaveLength(1);
  });

  it("otra empresa u otro payload sí son otro trabajo", async () => {
    const { encolar } = await import("@/lib/jobs/queue");
    await encolar({ company_id: "c1", tipo: "diagnosticar", payload: { pilar: "procesos" }, prioridad: 7 });
    await encolar({ company_id: "c2", tipo: "diagnosticar", payload: { pilar: "procesos" }, prioridad: 7 });
    await encolar({ company_id: "c1", tipo: "diagnosticar", payload: { pilar: "personas" }, prioridad: 7 });
    expect(estado.base!.tablas.jobs).toHaveLength(3);
  });

  /**
   * UNA PETICIÓN IGUAL NO ES UNA PETICIÓN ETERNA. Con la clave determinista a secas, un diagnóstico
   * ya «hecho» bloqueaba para siempre el siguiente diagnóstico de la misma empresa (hasta cambiar la
   * versión del prompt): no se podía re-diagnosticar tras subir fuentes ni regenerar un procedimiento.
   */
  it("tras un trabajo HECHO, la misma petición abre la ronda siguiente (trabajo nuevo); tras uno PENDIENTE, devuelve ese", async () => {
    const { encolar } = await import("@/lib/jobs/queue");
    const peticion = { company_id: "c1", tipo: "diagnosticar" as const, payload: { pilar: "procesos" }, prioridad: 7 };
    const a = await encolar(peticion);
    expect((await encolar(peticion)).id).toBe(a.id); // pendiente: el mismo
    estado.base!.tablas.jobs.find((j) => j.id === a.id)!.estado = "hecho";
    const b = await encolar(peticion);
    expect(b.duplicado).toBe(false);
    expect(b.id).not.toBe(a.id); // hecho: ronda nueva
    expect((await encolar(peticion))).toEqual({ id: b.id, duplicado: true }); // la ronda nueva, pendiente, absorbe la repetición
    estado.base!.tablas.jobs.find((j) => j.id === b.id)!.estado = "hecho";
    const c = await encolar(peticion);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(estado.base!.tablas.jobs).toHaveLength(3);
    // Las tres claves son distintas y ninguna depende de la hora: son la huella y el número de ronda.
    expect(new Set(estado.base!.tablas.jobs.map((j) => j.idempotency_key)).size).toBe(3);
  });

  it("tras un trabajo FALLIDO también se abre ronda nueva: volver a pedirlo es volver a intentarlo", async () => {
    const { encolar } = await import("@/lib/jobs/queue");
    const peticion = { company_id: "c1", tipo: "planificar" as const, payload: {}, prioridad: 7 };
    const a = await encolar(peticion);
    estado.base!.tablas.jobs.find((j) => j.id === a.id)!.estado = "fallido";
    const b = await encolar(peticion);
    expect(b.duplicado).toBe(false);
    expect(b.id).not.toBe(a.id);
  });

  it("con clave EXPLÍCITA no hay rondas: un tramo de extracción ya hecho sigue «ya hecho» aunque se vuelva a pedir", async () => {
    const { encolar, claveIdempotente } = await import("@/lib/jobs/queue");
    const tramo = { company_id: "c1", tipo: "extraer" as const, payload: { source_id: "s1", chunk_index: 0 }, prioridad: 5, idempotency_key: claveIdempotente(["extraer", "s1", 0]) };
    const a = await encolar(tramo);
    estado.base!.tablas.jobs.find((j) => j.id === a.id)!.estado = "hecho";
    expect(await encolar(tramo)).toEqual({ id: a.id, duplicado: true });
    expect(estado.base!.tablas.jobs).toHaveLength(1);
  });

  it("sin empresa (company_id nulo) la ronda se cuenta entre los trabajos sin empresa, no entre todos", async () => {
    const { encolar, rondaDe } = await import("@/lib/jobs/queue");
    const a = await encolar({ company_id: null, tipo: "evaluar", payload: { q: 1 }, prioridad: 9 });
    estado.base!.tablas.jobs.find((j) => j.id === a.id)!.estado = "hecho";
    estado.base!.tablas.jobs.push({ id: "otra-empresa", tipo: "evaluar", company_id: "c9", payload: { q: 1 }, estado: "hecho", idempotency_key: "k-otra" });
    expect(await rondaDe("evaluar", null, { q: 1 })).toBe(1);
    const b = await encolar({ company_id: null, tipo: "evaluar", payload: { q: 1 }, prioridad: 9 });
    expect(b.duplicado).toBe(false);
  });
});

/**
 * REEXTRAER ARCHIVA ANTES DE BORRAR. La ruta borraba las afirmaciones previas de la fuente y, si la
 * nueva lectura fallaba, la fuente quedaba con menos de lo que tenía. Ahora cada versión anterior va a
 * `claims_archivo` ANTES del borrado; y si archivar falla, no se borra nada. Base falsa: lo que se prueba
 * es el orden y la condición, no PostgREST.
 */
describe("POST /api/sources/[id]/extract: archiva las afirmaciones previas antes de borrarlas", () => {
  const perfil = { id: "u1", rol: "consultor" } as const;
  const llamar = async (id: string) => {
    const { POST } = await import("@/app/api/sources/[id]/extract/route");
    const handler = POST as unknown as (p: typeof perfil, req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<{ status: number; body: Record<string, unknown> }>;
    return handler(perfil, new Request("http://prueba.local/api/sources/s1/extract", { method: "POST" }), { params: Promise.resolve({ id }) });
  };
  const semilla = () => ({
    sources: [{ id: "s1", company_id: "c1", tipo: "documento", origen: "consultor" }],
    claims: [{ id: "k1", source_id: "s1", texto: "La caja cierra a las 8" }, { id: "k2", source_id: "s1", texto: "Dos turnos" }, { id: "k-otra", source_id: "s2", texto: "De otra fuente" }],
    source_fragments: [{ id: "f1", source_id: "s1" }],
    claims_archivo: [{ id: "arch-1", source_id: "s1", company_id: "c1", version: 1, claims: [], motivo: "reextraccion" }],
    jobs: [{ id: "j-viejo", tipo: "extraer", company_id: "c1", payload: { source_id: "s1" }, estado: "hecho", idempotency_key: "k-viejo" }],
  });

  beforeEach(() => {
    estado.base = crearBaseFalsa(semilla());
  });

  it("archiva las previas como la versión siguiente, LUEGO borra claims y fragmentos de esa fuente, y encola la re-extracción", async () => {
    const r = await llamar("s1");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version_archivada: 2, afirmaciones_archivadas: 2 });
    const archivo = estado.base!.tablas.claims_archivo.find((a) => a.version === 2)!;
    expect(archivo).toMatchObject({ source_id: "s1", company_id: "c1", motivo: "reextraccion", archivado_por: "u1" });
    expect(archivo.claims.map((c: Fila) => c.id).sort()).toEqual(["k1", "k2"]);
    // Se borró solo lo de ESTA fuente; la otra sigue intacta.
    expect(estado.base!.tablas.claims.map((c) => c.id)).toEqual(["k-otra"]);
    expect(estado.base!.tablas.source_fragments).toHaveLength(0);
    // El trabajo viejo de extracción se retira y el nuevo lleva una clave con significado (la versión), no la hora.
    const nuevos = estado.base!.tablas.jobs.filter((j) => j.id !== "j-viejo");
    expect(estado.base!.tablas.jobs.find((j) => j.id === "j-viejo")).toBeUndefined();
    expect(nuevos).toHaveLength(1);
    expect(nuevos[0]).toMatchObject({ tipo: "extraer", company_id: "c1", payload: { source_id: "s1" }, estado: "pendiente" });
    expect(r.body.job_id).toBe(nuevos[0].id);
  });

  it("si archivar FALLA, no se borra nada y la respuesta lo dice", async () => {
    estado.base!.insertsQueFallan.add("claims_archivo");
    const r = await llamar("s1");
    expect(r.status).toBe(500);
    expect(String((r.body as { error: string }).error)).toMatch(/No se archivaron las afirmaciones previas, así que no se borra nada/);
    expect(estado.base!.tablas.claims).toHaveLength(3);
    expect(estado.base!.tablas.source_fragments).toHaveLength(1);
    expect(estado.base!.tablas.jobs.map((j) => j.id)).toEqual(["j-viejo"]);
  });

  it("una fuente sin afirmaciones previas no archiva nada (versión nula) pero sí reextrae", async () => {
    estado.base = crearBaseFalsa({ ...semilla(), claims: [], claims_archivo: [] });
    const r = await llamar("s1");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version_archivada: null, afirmaciones_archivadas: 0 });
    expect(estado.base!.tablas.claims_archivo ?? []).toHaveLength(0);
  });
});

describe("fallidosPorPausa: los que se perdieron por crédito y aún no se han reencolado", () => {
  beforeEach(() => {
    estado.base = crearBaseFalsa({ jobs: [] });
  });

  it("reconoce ambos prefijos, excluye otros fallos y excluye los que ya tienen reencolado", async () => {
    const { fallidosPorPausa } = await import("@/lib/jobs/queue");
    estado.base!.tablas.jobs.push(
      fallido("a"),
      fallido("b", { error: "Proveedor en pausa (sin crédito) desde 13/10/2026, 09:05", created_at: T2 }),
      fallido("c", { error: "Tope de tokens de la empresa superado." }),
      fallido("d", { created_at: T1 }),
      fallido("d-bis", { estado: "pendiente", error: null, created_at: T3, origen_job_id: "d" }), // d ya fue reencolado
      fallido("e", { estado: "pendiente", error: "Proveedor en pausa (sin crédito) desde ayer" }) // pendiente, no fallido
    );
    const r = await fallidosPorPausa();
    expect(r.filas.map((f) => f.id).sort()).toEqual(["a", "b"]);
    expect(r.tope).toBe(500);
  });
});

describe("la torre: fuentes atascadas (regla pura)", () => {
  it("una fuente en «leyendo» más de 24 h sin trabajo vivo reciente está atascada; con trabajo vivo, no", async () => {
    const { clasificarAtascadas } = await import("@/lib/torre");
    const ahora = new Date("2026-10-13T12:00:00Z");
    const fuentes = [
      { id: "funciones", nombre: "Funciones de caja (documento de ejemplo)", company_id: "empresa-a", created_at: "2026-09-27T15:00:00Z" },
      { id: "reciente", nombre: "Subida hace 2 h", company_id: "empresa-a", created_at: "2026-10-13T10:00:00Z" },
      { id: "en-cola", nombre: "Vieja pero reencolada hace 1 h", company_id: "empresa-a", created_at: "2026-09-01T00:00:00Z" },
      { id: "cola-vieja", nombre: "Pendiente desde hace 3 días", company_id: "empresa-a", created_at: "2026-09-01T00:00:00Z" },
    ];
    const trabajos = [
      { source_id: "funciones", estado: "fallido", created_at: "2026-09-28T08:00:00Z" },
      { source_id: "en-cola", estado: "pendiente", created_at: "2026-10-13T11:00:00Z" },
      { source_id: "cola-vieja", estado: "pendiente", created_at: "2026-10-10T11:00:00Z" },
    ];
    const r = clasificarAtascadas(fuentes, trabajos, ahora);
    expect(r.map((f) => f.id)).toEqual(["funciones", "cola-vieja"]);
    // Las horas se cuentan desde el ÚLTIMO intento de extracción, no desde la subida.
    expect(r[0]).toMatchObject({ horas: 15 * 24 + 4, desde: "2026-09-28T08:00:00Z", companyId: "empresa-a" });
  });
});
