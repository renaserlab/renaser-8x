/**
 * ACCESO: AUTENTICACIÓN Y PERTENENCIA (R18.1, R18.3) — con dobles.
 *
 * Aquí no hay base real: `supabaseAdmin()` es un doble que devuelve las filas que cada prueba
 * declara, y `perfilApi()` devuelve el perfil que la prueba quiere. Lo que se prueba es la lógica de
 * `protegido()`, `exigirAcceso`, `exigirPertenencia` y `empresaActiva`, no PostgREST ni RLS (eso lo
 * hace la prueba sobre Postgres embebido, de otro encargo).
 *
 * Lo que motivó esto (13-10-2026): `api.ts:63-67` devolvía 500 ante un acceso denegado y solo
 * auditaba las escrituras exitosas; `auth.ts:35` elegía en silencio la primera empresa de un usuario
 * con varias.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ memberships: [] as Fila[], users: [] as Fila[] }));

vi.mock("@/lib/supabase/admin", () => {
  // Encadenable y «thenable»: `await sb.from(t).select().eq().order()` resuelve con las filas que
  // pasan los .eq() recibidos; `.maybeSingle()` devuelve la primera o null.
  const consulta = (tabla: keyof typeof base) => {
    const filtros: [string, unknown][] = [];
    const datos = () => base[tabla].filter((f) => filtros.every(([k, v]) => f[k] === v));
    const q = {
      select: () => q, order: () => q, limit: () => q, in: () => q,
      eq: (k: string, v: unknown) => { filtros.push([k, v]); return q; },
      maybeSingle: async () => ({ data: datos()[0] ?? null, error: null }),
      then: (res: (v: { data: Fila[]; error: null }) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: datos(), error: null }).then(res, rej),
    };
    return q;
  };
  return { supabaseAdmin: () => ({ from: consulta }) };
});
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));

import { protegido, ok, exigirAcceso, exigirPertenencia, AccesoDenegado, NoAutenticado } from "@/lib/api";
import { perfilApi, elegirEmpresa, empresaActiva, resolverEmpresaActiva, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { registrarError } from "@/lib/errores";

const EMPRESA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPRESA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EMPRESA_AJENA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DUENO: Perfil = { id: "11111111-1111-4111-8111-111111111111", email: "dueno@ejemplo.test", nombre: "Dueño", rol: "cliente" };
const CONSULTORA: Perfil = { id: "22222222-2222-4222-8222-222222222222", email: "consultora@ejemplo.test", nombre: "Consultora", rol: "consultor" };

type Ctx = { params: Promise<{ id: string }> };
const peticion = (metodo = "POST", ruta = `/api/companies/${EMPRESA_A}/medicion`) => new Request(`http://8x.test${ruta}`, { method: metodo });
const contexto = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

/** Una ruta como las 57 reales: sesión por protegido(), pertenencia por exigirAcceso. */
const rutaConAcceso = protegido<Ctx>({}, async (perfil, _req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  return ok({ id });
});

beforeEach(() => {
  base.memberships = [];
  base.users = [];
  vi.mocked(perfilApi).mockReset();
  vi.mocked(registrar).mockClear();
  vi.mocked(registrarError).mockClear();
});

describe("protegido() · con dobles · las cuatro preguntas tienen su código", () => {
  it("sin sesión → 401 y nada en el rastro (no hay actor que registrar)", async () => {
    vi.mocked(perfilApi).mockResolvedValue(null);
    const res = await rutaConAcceso(peticion(), contexto(EMPRESA_A));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Tienes que entrar primero.");
    expect(registrar).not.toHaveBeenCalled();
    expect(registrarError).not.toHaveBeenCalled();
  });

  it("cliente sin membresía → 403 (no 500), mensaje claro y «denegado» en audit_log con motivo y empresa", async () => {
    vi.mocked(perfilApi).mockResolvedValue(DUENO);
    base.memberships = [{ user_id: DUENO.id, company_id: EMPRESA_B }];
    const res = await rutaConAcceso(peticion(), contexto(EMPRESA_A));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("No tienes acceso a esta empresa.");
    expect(registrar).toHaveBeenCalledTimes(1);
    const rastro = vi.mocked(registrar).mock.calls[0]![0];
    expect(rastro.accion).toBe("denegado");
    expect(rastro.actor).toEqual(DUENO);
    expect(rastro.detalle).toMatchObject({ motivo: "pertenencia", empresa: EMPRESA_A, metodo: "POST" });
    expect(rastro.ruta).toBe(`/api/companies/${EMPRESA_A}/medicion`);
    // Un acceso denegado es un hecho de seguridad, no un error del sistema.
    expect(registrarError).not.toHaveBeenCalled();
  });

  it("cliente con membresía → pasa, y la escritura exitosa se audita como siempre", async () => {
    vi.mocked(perfilApi).mockResolvedValue(DUENO);
    base.memberships = [{ user_id: DUENO.id, company_id: EMPRESA_A }];
    const res = await rutaConAcceso(peticion(), contexto(EMPRESA_A));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: EMPRESA_A });
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(registrar).mock.calls[0]![0].accion).toBe("crear");
  });

  it("la consultora entra a cualquier empresa sin membresía (pertenencia con atajo de consultor)", async () => {
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const res = await rutaConAcceso(peticion(), contexto(EMPRESA_A));
    expect(res.status).toBe(200);
  });

  it("ruta solo-consultor con un cliente → 403 y «denegado» con motivo rol", async () => {
    const soloConsultor = protegido<Ctx>({ consultor: true }, async () => ok({}));
    vi.mocked(perfilApi).mockResolvedValue(DUENO);
    const res = await soloConsultor(peticion(), contexto(EMPRESA_A));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Solo el consultor puede hacer esto.");
    expect(vi.mocked(registrar).mock.calls[0]![0]).toMatchObject({ accion: "denegado", detalle: { motivo: "rol" } });
  });

  it("un error cualquiera sigue siendo 500 y sigue yendo a error_log (no se rompió lo que había)", async () => {
    const rota = protegido<Ctx>({}, async () => { throw new Error("se cayó la base"); });
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await rota(peticion(), contexto(EMPRESA_A));
    silencio.mockRestore();
    expect(res.status).toBe(500);
    expect(registrarError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(registrarError).mock.calls[0]![0]).toMatchObject({ mensaje: "se cayó la base", actorId: CONSULTORA.id });
    expect(registrar).not.toHaveBeenCalled();
  });

  it("el mensaje del 403 sale redactado: un token de participante nunca viaja de vuelta", async () => {
    const conToken = protegido<Ctx>({}, async () => { throw new AccesoDenegado("Sin acceso a /participar/abcdefghijklmnopqrstuvwxyz0123456789AB", "pertenencia"); });
    vi.mocked(perfilApi).mockResolvedValue(DUENO);
    const res = await conToken(peticion(), contexto(EMPRESA_A));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Sin acceso a /participar/[token]");
  });

  it("NoAutenticado lanzado desde dentro del handler también es 401", async () => {
    const expulsa = protegido<Ctx>({}, async () => { throw new NoAutenticado("Tu sesión ya no vale."); });
    vi.mocked(perfilApi).mockResolvedValue(DUENO);
    const res = await expulsa(peticion(), contexto(EMPRESA_A));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Tu sesión ya no vale.");
  });
});

describe("exigirPertenencia · con dobles · sin atajo para nadie", () => {
  it("la consultora sin membresía es rechazada: elegir empresa activa es de la persona, no de la consultora", async () => {
    await expect(exigirPertenencia(CONSULTORA, EMPRESA_A)).rejects.toBeInstanceOf(AccesoDenegado);
  });
  it("el dueño con membresía pasa", async () => {
    base.memberships = [{ user_id: DUENO.id, company_id: EMPRESA_A }];
    await expect(exigirPertenencia(DUENO, EMPRESA_A)).resolves.toBeUndefined();
  });
  it("el error lleva el motivo y la empresa, para el rastro", async () => {
    const e = await exigirPertenencia(DUENO, EMPRESA_AJENA).catch((x) => x);
    expect(e).toBeInstanceOf(AccesoDenegado);
    expect(e.motivo).toBe("pertenencia");
    expect(e.companyId).toBe(EMPRESA_AJENA);
    expect(e.status).toBe(403);
  });
});

describe("empresa activa · la regla pura (elegirEmpresa)", () => {
  it("sin empresas → null, sin_empresa", () => {
    expect(elegirEmpresa([], null)).toEqual({ companyId: null, empresas: [], estado: "sin_empresa" });
  });
  it("una sola → esa, con o sin cookie, aunque la cookie apunte a otra: idéntico al comportamiento de siempre", () => {
    expect(elegirEmpresa([EMPRESA_A], null).companyId).toBe(EMPRESA_A);
    expect(elegirEmpresa([EMPRESA_A], EMPRESA_AJENA)).toMatchObject({ companyId: EMPRESA_A, estado: "unica" });
  });
  it("varias + cookie válida → la de la cookie", () => {
    expect(elegirEmpresa([EMPRESA_A, EMPRESA_B], EMPRESA_B)).toMatchObject({ companyId: EMPRESA_B, estado: "elegida" });
  });
  it("varias + cookie ajena → null: una cookie no da acceso a nada que la membresía no dé", () => {
    expect(elegirEmpresa([EMPRESA_A, EMPRESA_B], EMPRESA_AJENA)).toMatchObject({ companyId: null, estado: "ambigua" });
  });
  it("varias sin cookie → null y ambigua: el portal pregunta, no adivina", () => {
    expect(elegirEmpresa([EMPRESA_A, EMPRESA_B], null)).toMatchObject({ companyId: null, estado: "ambigua", empresas: [EMPRESA_A, EMPRESA_B] });
    expect(elegirEmpresa([EMPRESA_A, EMPRESA_B], "").companyId).toBeNull();
  });
});

describe("empresaActiva(userId) · con dobles · lee las membresías de verdad", () => {
  it("una membresía → esa", async () => {
    base.memberships = [{ user_id: DUENO.id, company_id: EMPRESA_A }];
    expect(await empresaActiva(DUENO.id, null)).toBe(EMPRESA_A);
  });
  it("varias + cookie válida → la de la cookie", async () => {
    base.memberships = [{ user_id: DUENO.id, company_id: EMPRESA_A }, { user_id: DUENO.id, company_id: EMPRESA_B }];
    expect(await empresaActiva(DUENO.id, EMPRESA_B)).toBe(EMPRESA_B);
  });
  it("varias + cookie de una empresa ajena → null (rechaza)", async () => {
    base.memberships = [{ user_id: DUENO.id, company_id: EMPRESA_A }, { user_id: DUENO.id, company_id: EMPRESA_B }, { user_id: CONSULTORA.id, company_id: EMPRESA_AJENA }];
    expect(await empresaActiva(DUENO.id, EMPRESA_AJENA)).toBeNull();
  });
  it("varias sin cookie → null, y el resolver dice «ambigua» con la lista para preguntar", async () => {
    base.memberships = [{ user_id: DUENO.id, company_id: EMPRESA_A }, { user_id: DUENO.id, company_id: EMPRESA_B }];
    expect(await empresaActiva(DUENO.id, null)).toBeNull();
    expect(await resolverEmpresaActiva(DUENO.id, null)).toEqual({ companyId: null, empresas: [EMPRESA_A, EMPRESA_B], estado: "ambigua" });
  });
  it("solo cuenta las membresías de ESE usuario", async () => {
    base.memberships = [{ user_id: CONSULTORA.id, company_id: EMPRESA_AJENA }];
    expect(await resolverEmpresaActiva(DUENO.id, null)).toMatchObject({ companyId: null, estado: "sin_empresa" });
  });
});
