/**
 * EL GUION QUE SIEMBRA LOS PILOTOS NO ESCRIBE EN NINGÚN LADO QUE NO SEA DE PRUEBA, Y SIEMBRA LO MISMO QUE
 * LA APLICACIÓN DEJARÍA.
 *
 * El 13-10-2026 no existe un proyecto Supabase de prueba (hace falta la cuenta de Kelin), así que
 * scripts/pilotos/sembrar.mts no se ha corrido contra ninguna base. Lo que sí se puede probar sin base:
 *  1. que el candado (src/lib/entorno.ts) va antes de todo: sin ENTORNO, con producción o con un destino
 *     que no está en la lista, aborta con la clase correcta y la base falsa no recibe ni una lectura;
 *  2. que, con un destino de prueba autorizado, deja en la base falsa exactamente lo que dejaría la app:
 *     empresas admitidas, cuentas con su rol, membresías, personas, fuentes con archivo en Storage y la
 *     extracción encolada con la MISMA clave de idempotencia que usa POST /api/sources;
 *  3. que correrlo dos veces no duplica nada y que nunca borra.
 * La base falsa imita lo mínimo de PostgREST, Storage y Auth que el guion toca, incluido el trigger que
 * crea la fila de users al registrar una cuenta. Es un doble: no prueba PostgREST ni Auth reales.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import { pathToFileURL } from "url";
import { randomUUID } from "crypto";
import declaraciones from "../fixtures/pilotos/declaraciones.json";
import { claveIdempotente, PRIORIDAD } from "@/lib/jobs/queue";
import { MIME_EXCEL, MIME_PDF, MIME_WORD } from "@/lib/documentos";
import { PRODUCCION_REF } from "@/lib/entorno";

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const estado = vi.hoisted(() => ({ base: null as null | ReturnType<typeof crearBaseFalsa> }));
// El guion importa el cliente por ruta relativa y la cola por «../supabase/admin»: las dos resuelven a este
// mismo módulo, así que las dos reciben la base falsa.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));

// El guion es un .mts: tsc solo acepta importarlo como «.mjs» (y lo resuelve al .mts), mientras que vitest
// necesita la ruta real del archivo. La forma la da el tipo; el archivo, la ruta en tiempo de ejecución.
type Guion = typeof import("../../scripts/pilotos/sembrar.mjs");
const { sembrar, PILOTOS, CORREO_CONSULTOR, textoEntradaBreve }: Guion = await import(pathToFileURL(path.resolve(__dirname, "../../scripts/pilotos/sembrar.mts")).href);

/** Lo mínimo de PostgREST + Storage + Auth que usa el guion, en memoria, con registro de cada operación. */
function crearBaseFalsa() {
  const tablas: Record<string, Fila[]> = {};
  const operaciones: { tabla: string; op: string }[] = [];
  const subidas: { ruta: string; bytes: number; contentType: string | undefined }[] = [];
  // Ids con forma de uuid, como los da Postgres: rutaStorage() rechaza una carpeta que no lo sea.
  let seq = 0;
  class Consulta {
    private filtros: ((f: Fila) => boolean)[] = [];
    private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    private fila: Fila | null = null;
    private conflicto: string[] = [];
    private unico: "single" | "maybe" | null = null;
    constructor(private tabla: string) {}
    select() { return this; }
    insert(f: Fila) { this.op = "insert"; this.fila = f; return this; }
    update(p: Fila) { this.op = "update"; this.fila = p; return this; }
    upsert(f: Fila, o?: { onConflict?: string }) { this.op = "upsert"; this.fila = f; this.conflicto = (o?.onConflict ?? "id").split(","); return this; }
    delete() { this.op = "delete"; return this; }
    eq(c: string, v: unknown) { this.filtros.push((f) => f[c] === v); return this; }
    is(c: string, v: unknown) { this.filtros.push((f) => f[c] == v); return this; }
    in(c: string, vs: unknown[]) { this.filtros.push((f) => vs.includes(f[c])); return this; }
    contains(c: string, sub: Fila) { this.filtros.push((f) => Object.entries(sub).every(([k, v]) => JSON.stringify(f[c]?.[k]) === JSON.stringify(v))); return this; }
    order() { return this; }
    limit() { return this; }
    single() { this.unico = "single"; return this; }
    maybeSingle() { this.unico = "maybe"; return this; }
    then<A, B>(res: (v: Fila) => A, rej?: (e: unknown) => B) { return Promise.resolve().then(() => this.ejecutar()).then(res, rej); }
    private ejecutar(): Fila {
      operaciones.push({ tabla: this.tabla, op: this.op });
      const t = (tablas[this.tabla] ??= []);
      if (this.op === "insert") {
        const row = { ...this.fila };
        if (row.idempotency_key && t.some((x) => x.idempotency_key === row.idempotency_key)) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        seq++;
        row.id ??= randomUUID();
        if (this.tabla === "jobs") { row.estado ??= "pendiente"; row.created_at ??= `2026-10-13T10:00:${String(seq).padStart(2, "0")}Z`; }
        if (this.tabla === "companies") { row.etapa ??= "admision"; }
        t.push(row);
        return { data: this.unico ? row : [row], error: null };
      }
      if (this.op === "upsert") {
        const row = { ...this.fila };
        const ya = t.find((x) => this.conflicto.every((c) => x[c.trim()] === row[c.trim()]));
        if (ya) Object.assign(ya, row);
        else t.push(row);
        return { data: null, error: null };
      }
      const filas = t.filter((f) => this.filtros.every((fn) => fn(f)));
      if (this.op === "update") { for (const f of filas) Object.assign(f, this.fila); return { data: filas, error: null }; }
      if (this.op === "delete") { tablas[this.tabla] = t.filter((f) => !filas.includes(f)); return { data: null, error: null }; }
      if (this.unico === "single") return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: `se esperaba una fila y hay ${filas.length}` } };
      if (this.unico === "maybe") return { data: filas[0] ?? null, error: null };
      return { data: filas, error: null };
    }
  }
  return {
    tablas,
    operaciones,
    subidas,
    from: (t: string) => new Consulta(t),
    storage: {
      from: (bucket: string) => ({
        upload: async (ruta: string, cuerpo: Buffer, o?: { contentType?: string }) => {
          operaciones.push({ tabla: `storage:${bucket}`, op: "upload" });
          if (subidas.some((s) => s.ruta === ruta)) return { data: null, error: { message: "The resource already exists" } };
          subidas.push({ ruta, bytes: cuerpo.byteLength, contentType: o?.contentType });
          return { data: { path: ruta }, error: null };
        },
      }),
    },
    auth: {
      admin: {
        createUser: async (u: { email: string; password: string; user_metadata?: { nombre?: string } }) => {
          operaciones.push({ tabla: "auth.users", op: "createUser" });
          const users = (tablas.users ??= []);
          if (users.some((x) => x.email === u.email)) return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
          const id = randomUUID();
          // Lo que hace el trigger handle_new_user en la base real: la fila de users nace con rol cliente.
          users.push({ id, email: u.email, nombre: u.user_metadata?.nombre ?? u.email.split("@")[0], rol: "cliente" });
          return { data: { user: { id, email: u.email } }, error: null };
        },
      },
    },
  };
}

const CLAVE_FALSA = "clave-de-servicio-falsa-que-no-debe-imprimirse";
const DESTINO = "pruebaxyz";
const ENV_PRUEBA = { ENTORNO: "prueba", DESTINOS_PRUEBA: DESTINO, NEXT_PUBLIC_SUPABASE_URL: `https://${DESTINO}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: CLAVE_FALSA };

beforeEach(() => {
  estado.base = crearBaseFalsa();
});

describe("el candado va antes de todo", () => {
  it("sin ENTORNO: aborta como «ambiguo» y la base no recibe ni una lectura", async () => {
    await expect(sembrar({ env: { NEXT_PUBLIC_SUPABASE_URL: `https://${DESTINO}.supabase.co` } })).rejects.toMatchObject({ name: "DestinoNoAutorizado", clase: "ambiguo", contexto: "script" });
    expect(estado.base!.operaciones).toEqual([]);
    expect(estado.base!.subidas).toEqual([]);
  });

  it("ENTORNO=prueba pero la URL es la de producción: aborta como «produccion» aunque esté en la lista", async () => {
    const env = { ENTORNO: "prueba", DESTINOS_PRUEBA: `${DESTINO},${PRODUCCION_REF}`, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCCION_REF}.supabase.co` };
    await expect(sembrar({ env })).rejects.toMatchObject({ clase: "produccion" });
    expect(estado.base!.operaciones).toEqual([]);
  });

  it("destino que no está en DESTINOS_PRUEBA: aborta como «desconocido»", async () => {
    const env = { ENTORNO: "prueba", DESTINOS_PRUEBA: "otro", NEXT_PUBLIC_SUPABASE_URL: `https://${DESTINO}.supabase.co` };
    await expect(sembrar({ env })).rejects.toMatchObject({ clase: "desconocido" });
    expect(estado.base!.operaciones).toEqual([]);
  });

  it("el mensaje del candado dice qué variable corregir, en palabras", async () => {
    const e = await sembrar({ env: {} }).then(() => null, (x: unknown) => x as Error);
    expect(e).toBeInstanceOf(Error);
    expect(e?.message).toMatch(/Falta ENTORNO/);
    expect(e?.message).toMatch(/no se escribe nada/);
  });
});

describe("con destino autorizado, siembra sobre dobles lo que la aplicación dejaría", () => {
  const lineas: string[] = [];
  const correr = () => sembrar({ env: ENV_PRUEBA, clave: "Clave-de-prueba-2026", log: (l) => lineas.push(l) });

  it("dos empresas admitidas y en levantamiento, con el nombre y el sector de declaraciones.json", async () => {
    const r = await correr();
    expect(r.destino).toBe(DESTINO);
    const companies = estado.base!.tablas.companies;
    expect(companies.map((c) => c.nombre)).toEqual([declaraciones.modas_lucero.empresa, declaraciones.estudio_vargas.empresa]);
    expect(companies.map((c) => c.sector)).toEqual([declaraciones.modas_lucero.sector, declaraciones.estudio_vargas.sector]);
    expect(companies.every((c) => c.estado_admision === "admitida" && c.etapa === "levantamiento")).toBe(true);
    expect(r.empresas.map((e) => e.nueva)).toEqual([true, true]);
  });

  it("tres cuentas (dos dueños cliente, un consultor) y dos membresías de dueño; el consultor no necesita membresía", async () => {
    await correr();
    const users = estado.base!.tablas.users;
    expect(users).toHaveLength(3);
    expect(users.find((u) => u.email === CORREO_CONSULTOR)?.rol).toBe("consultor");
    for (const p of PILOTOS) expect(users.find((u) => u.email === p.correo_duenio)?.rol).toBe("cliente");
    const memberships = estado.base!.tablas.memberships;
    expect(memberships).toHaveLength(2);
    expect(memberships.every((m) => m.nivel === "dueno")).toBe(true);
    expect(memberships.some((m) => m.user_id === users.find((u) => u.email === CORREO_CONSULTOR)?.id)).toBe(false);
  });

  it("las personas de cada empresa salen de los documentos: 4 en Lucero, 3 en Vargas; el dueño ligado a su cuenta", async () => {
    await correr();
    const participants = estado.base!.tablas.participants;
    expect(participants).toHaveLength(7);
    const lucero = estado.base!.tablas.companies[0].id;
    const deLucero = participants.filter((p) => p.company_id === lucero);
    expect(deLucero.map((p) => p.nombre)).toEqual(["Lucero Quintana", "Rosa Mamani", "Carmen Huamán", "Jorge Ccahuana"]);
    expect(deLucero[0].user_id).toBeTruthy();
    expect(deLucero.slice(1).every((p) => p.user_id === null)).toBe(true);
    expect(participants.find((p) => p.nombre === "Dr. Vargas")?.rol).toBe("socio");
  });

  it("seis archivos en Storage bajo la carpeta de su empresa, con el MIME que decide validarArchivo", async () => {
    await correr();
    const subidas = estado.base!.subidas;
    expect(subidas).toHaveLength(6);
    const ids = estado.base!.tablas.companies.map((c) => c.id);
    for (const s of subidas) {
      expect(ids.some((id) => s.ruta.startsWith(`${id}/`))).toBe(true);
      expect(s.bytes).toBeGreaterThan(1000);
    }
    expect(subidas.map((s) => s.contentType).sort()).toEqual([MIME_EXCEL, MIME_EXCEL, MIME_PDF, MIME_PDF, MIME_WORD, MIME_WORD].sort());
  });

  it("ocho fuentes del cliente: Word y PDF como documento, Excel como dato, y la entrada breve como observación con las palabras del dueño", async () => {
    await correr();
    const sources = estado.base!.tablas.sources;
    expect(sources).toHaveLength(8);
    expect(sources.every((s) => s.origen === "cliente")).toBe(true);
    const porMime = (m: string) => sources.filter((s) => s.mime === m);
    expect(porMime(MIME_WORD).every((s) => s.tipo === "documento")).toBe(true);
    expect(porMime(MIME_PDF).every((s) => s.tipo === "documento")).toBe(true);
    expect(porMime(MIME_EXCEL).every((s) => s.tipo === "dato")).toBe(true);
    const textos = porMime("text/plain");
    expect(textos).toHaveLength(2);
    expect(textos.every((s) => s.tipo === "observacion" && !s.storage_path && typeof s.contenido === "string")).toBe(true);
    expect(textos[0].contenido).toBe(textoEntradaBreve(declaraciones.modas_lucero.empresa, "la dueña", declaraciones.modas_lucero.entrada_breve));
    expect(textos[0].contenido).toMatch(/stock_declarado: Tengo como 40,000 en mercadería\./);
    expect(textos[1].contenido).toMatch(/ganancia_mes: No lo sé\./);
    expect(textos[1].contenido).toMatch(/meta_venta_mes: \(no respondió\)/);
  });

  it("las dimensiones de evidencia solo se llenan cuando el documento las dice: autor y periodo, o null", async () => {
    await correr();
    const sources = estado.base!.tablas.sources;
    const excelLucero = sources.find((s) => s.nombre === "Ventas, gastos e inventario abril–septiembre 2026")!;
    expect(excelLucero).toMatchObject({ periodo_desde: "2026-04-01", periodo_hasta: "2026-09-30", autor: null, fecha_origen: "2026-09-30" });
    const procedimiento = sources.find((s) => s.nombre === "Procedimiento de seguimiento de casos (borrador)")!;
    expect(procedimiento).toMatchObject({ fecha_origen: null, autor: null, periodo_desde: null, periodo_hasta: null });
    const tarifario = sources.find((s) => s.nombre === "Tarifario de honorarios 2025")!;
    expect(tarifario).toMatchObject({ periodo_desde: "2025-01-01", periodo_hasta: "2025-12-31", autor: "Estudio Vargas & Asociados" });
  });

  it("una extracción por fuente, con la MISMA clave de idempotencia que POST /api/sources y la prioridad de extraer", async () => {
    const r = await correr();
    const jobs = estado.base!.tablas.jobs;
    expect(jobs).toHaveLength(8);
    for (const j of jobs) {
      expect(j.tipo).toBe("extraer");
      expect(j.prioridad).toBe(PRIORIDAD.extraer);
      expect(j.idempotency_key).toBe(claveIdempotente(["extraer-raiz", j.payload.source_id]));
      expect(j.estado).toBe("pendiente");
    }
    const ids = new Set(estado.base!.tablas.sources.map((s) => s.id));
    expect(jobs.every((j) => ids.has(j.payload.source_id))).toBe(true);
    expect(r.empresas.flatMap((e) => e.fuentes).every((f) => !f.trabajo_repetido && f.nueva)).toBe(true);
  });

  it("volver a sembrar no duplica nada: mismas filas, mismas subidas, y los trabajos vuelven como repetidos", async () => {
    await correr();
    const antes = Object.fromEntries(Object.entries(estado.base!.tablas).map(([t, filas]) => [t, filas.length]));
    const r2 = await correr();
    const despues = Object.fromEntries(Object.entries(estado.base!.tablas).map(([t, filas]) => [t, filas.length]));
    expect(despues).toEqual(antes);
    expect(estado.base!.subidas).toHaveLength(6);
    expect(r2.empresas.every((e) => !e.nueva)).toBe(true);
    expect(r2.empresas.flatMap((e) => e.fuentes).every((f) => f.trabajo_repetido && !f.nueva)).toBe(true);
    expect(r2.consultor.nuevo).toBe(false);
  });

  it("nunca borra, solo toca las tablas que dice, y no imprime la clave de servicio", async () => {
    await correr();
    const ops = estado.base!.operaciones;
    expect(ops.some((o) => o.op === "delete")).toBe(false);
    expect(new Set(ops.map((o) => o.tabla))).toEqual(new Set(["users", "auth.users", "companies", "memberships", "participants", "sources", "storage:fuentes", "jobs"]));
    expect(lineas.length).toBeGreaterThan(0);
    expect(lineas.join("\n")).not.toContain(CLAVE_FALSA);
    expect(lineas.join("\n")).not.toContain("Clave-de-prueba-2026");
  });

  it("si una cuenta ya existe en Auth pero no en users, lo dice con el siguiente paso en vez de seguir a medias", async () => {
    // El caso raro: Auth conoce el correo (createUser lo rechaza) pero la fila de users no está.
    estado.base!.auth.admin.createUser = async () => ({ data: { user: null }, error: { message: "A user with this email address has already been registered" } });
    await expect(correr()).rejects.toThrow(/ya existe en Auth pero no en users/);
    expect(estado.base!.tablas.companies ?? []).toHaveLength(0); // se detuvo antes de crear empresas
  });
});
