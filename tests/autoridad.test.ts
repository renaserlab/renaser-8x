/**
 * AUTORIDAD (R18.2) — con dobles.
 *
 * Tercera pregunta, distinta de sesión y pertenencia: ¿puede esta persona comprometer a la empresa
 * con una aprobación? Hasta el 13-10-2026 cualquier consultor aprobaba cualquier cosa. La regla es
 * pura (`tieneAutoridad`) y la lectura de `users.autoridad` tolera que la columna no exista todavía:
 * mientras esté vacía, cada rol conserva exactamente lo que podía hacer hoy (nadie bloquea a Kelin).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({ users: [] as Fila[], errorUsers: null as { message: string } | null }));

vi.mock("@/lib/supabase/admin", () => {
  const consulta = (tabla: string) => {
    const filtros: [string, unknown][] = [];
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filtros.push([k, v]); return q; },
      maybeSingle: async () => {
        // Columna inexistente (migración sin aplicar): PostgREST devuelve error, no filas.
        if (tabla === "users" && base.errorUsers) return { data: null, error: base.errorUsers };
        const filas = tabla === "users" ? base.users : [];
        return { data: filas.find((f) => filtros.every(([k, v]) => f[k] === v)) ?? null, error: null };
      },
    };
    return q;
  };
  return { supabaseAdmin: () => ({ from: consulta }) };
});

import { ACCIONES_AUTORIDAD, SIN_AUTORIDAD, autoridadesDe, tieneAutoridad, exigirAutoridad } from "@/lib/autoridad";
import { AccesoDenegado, type Perfil } from "@/lib/auth";

const CONSULTORA: Perfil = { id: "22222222-2222-4222-8222-222222222222", email: "consultora@ejemplo.test", nombre: "Consultora", rol: "consultor" };
const DUENO: Perfil = { id: "11111111-1111-4111-8111-111111111111", email: "dueno@ejemplo.test", nombre: "Dueño", rol: "cliente" };

beforeEach(() => {
  base.users = [];
  base.errorUsers = null;
});

describe("tieneAutoridad · la regla pura", () => {
  it("consultora sin autoridad explícita: conserva las cuatro (compatibilidad: lo que hace hoy)", () => {
    for (const a of ACCIONES_AUTORIDAD) expect(tieneAutoridad(CONSULTORA, a), a).toBe(true);
  });
  it("dueño sin autoridad explícita: aprueba sus documentos y congela mediciones (lo que hacía hoy), pero no revisa hallazgos ni administra", () => {
    expect(tieneAutoridad(DUENO, "aprobar_plan")).toBe(true);
    expect(tieneAutoridad(DUENO, "cerrar_medicion")).toBe(true);
    expect(tieneAutoridad(DUENO, "aprobar_hallazgo")).toBe(false);
    expect(tieneAutoridad(DUENO, "administrar")).toBe(false);
  });
  it("una lista explícita manda: la consultora con solo aprobar_hallazgo ya no aprueba planes", () => {
    const limitada = { ...CONSULTORA, autoridad: ["aprobar_hallazgo"] };
    expect(tieneAutoridad(limitada, "aprobar_hallazgo")).toBe(true);
    expect(tieneAutoridad(limitada, "aprobar_plan")).toBe(false);
    expect(tieneAutoridad(limitada, "administrar")).toBe(false);
  });
  it("«ninguna» es distinto de vacío: quita todo, incluso lo que el rol da por defecto", () => {
    expect(autoridadesDe({ ...DUENO, autoridad: [SIN_AUTORIDAD] })).toEqual([]);
    expect(tieneAutoridad({ ...CONSULTORA, autoridad: [SIN_AUTORIDAD] }, "aprobar_plan")).toBe(false);
  });
  it("valores desconocidos se ignoran y rige el rol: un error de tipeo no da ni quita autoridad", () => {
    expect(autoridadesDe({ ...DUENO, autoridad: ["aprovar_plan", "superusuario"] })).toEqual(autoridadesDe(DUENO));
  });
  it("una autoridad explícita a un dueño le da exactamente eso", () => {
    const lider = { ...DUENO, autoridad: ["cerrar_medicion"] };
    expect(tieneAutoridad(lider, "cerrar_medicion")).toBe(true);
    expect(tieneAutoridad(lider, "aprobar_plan")).toBe(false);
  });
});

describe("exigirAutoridad · con dobles", () => {
  it("rechaza a quien no la tiene con AccesoDenegado (403, motivo autoridad) y un mensaje que dice qué le falta", async () => {
    const e = await exigirAutoridad(DUENO, "aprobar_hallazgo").catch((x) => x);
    expect(e).toBeInstanceOf(AccesoDenegado);
    expect(e.status).toBe(403);
    expect(e.motivo).toBe("autoridad");
    expect(e.message).toBe("No tienes autoridad para aprobar, corregir o rechazar un hallazgo.");
  });
  it("acepta a quien sí la tiene", async () => {
    await expect(exigirAutoridad(CONSULTORA, "aprobar_hallazgo")).resolves.toBeUndefined();
    await expect(exigirAutoridad(DUENO, "aprobar_plan")).resolves.toBeUndefined();
  });
  it("si el perfil ya trae autoridad, no se consulta la base y se respeta la lista", async () => {
    base.errorUsers = { message: "no debería haberse consultado" };
    await expect(exigirAutoridad({ ...CONSULTORA, autoridad: ["cerrar_medicion"] }, "aprobar_plan")).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(exigirAutoridad({ ...CONSULTORA, autoridad: ["cerrar_medicion"] }, "cerrar_medicion")).resolves.toBeUndefined();
  });
  it("lee users.autoridad cuando el perfil no la trae: una restricción guardada se aplica", async () => {
    base.users = [{ id: CONSULTORA.id, autoridad: ["aprobar_hallazgo"] }];
    await expect(exigirAutoridad(CONSULTORA, "aprobar_plan")).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(exigirAutoridad(CONSULTORA, "aprobar_hallazgo")).resolves.toBeUndefined();
  });
  it("columna inexistente (migración sin aplicar) → rige el rol: la consultora NO queda fuera", async () => {
    base.errorUsers = { message: 'column users.autoridad does not exist' };
    for (const a of ACCIONES_AUTORIDAD) await expect(exigirAutoridad(CONSULTORA, a), a).resolves.toBeUndefined();
    await expect(exigirAutoridad(DUENO, "aprobar_hallazgo")).rejects.toBeInstanceOf(AccesoDenegado);
  });
  it("fila vacía ('{}' por defecto) → rige el rol", async () => {
    base.users = [{ id: DUENO.id, autoridad: [] }];
    await expect(exigirAutoridad(DUENO, "cerrar_medicion")).resolves.toBeUndefined();
    await expect(exigirAutoridad(DUENO, "administrar")).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe("las rutas de aprobación exigen la autoridad (estático)", () => {
  const api = path.join(process.cwd(), "src/app/api");
  const leer = (rel: string) => readFileSync(path.join(api, rel), "utf8");
  // [ruta, autoridad exigida, ¿el mismo handler comprueba pertenencia con exigirAcceso?]
  // Las de solo-consultor no la comprueban: la consultora entra a cualquier empresa.
  const ESPERADO: [string, string, boolean][] = [
    ["findings/[id]/review/route.ts", "aprobar_hallazgo", false],
    ["companies/[id]/plan/route.ts", "aprobar_plan", false],
    ["companies/[id]/deliverables/aprobar/route.ts", "aprobar_plan", true],
    ["companies/[id]/publish/route.ts", "aprobar_plan", false],
    ["companies/[id]/medicion/route.ts", "cerrar_medicion", true],
    ["companies/[id]/close/route.ts", "cerrar_medicion", false],
  ];
  it.each(ESPERADO)("%s llama exigirAutoridad(perfil, %s)", (ruta, accion) => {
    const src = leer(ruta);
    expect(src).toMatch(/import \{ exigirAutoridad \} from "@\/lib\/autoridad"/);
    expect(src).toContain(`exigirAutoridad(perfil, "${accion}")`);
  });
  it("el orden es el de las preguntas: pertenencia (exigirAcceso) antes que autoridad, dentro del mismo POST", () => {
    for (const [ruta, , conAcceso] of ESPERADO) {
      if (!conAcceso) continue;
      // Solo el handler POST: en plan/route.ts el GET también llama exigirAcceso, pero más abajo.
      const post = leer(ruta).split("export const POST")[1]!.split("export const ")[0]!;
      const acceso = post.indexOf("await exigirAcceso(perfil, id)");
      const autoridad = post.indexOf("await exigirAutoridad(perfil,");
      expect(acceso, `${ruta}: falta exigirAcceso en el POST`).toBeGreaterThanOrEqual(0);
      expect(acceso, ruta).toBeLessThan(autoridad);
    }
  });
});

describe("la migración y el código hablan el mismo vocabulario", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase/migracion-autoridad.sql"), "utf8");
  it("es aditiva e idempotente: add column if not exists, constraint guardada por pg_constraint, nada de drop", () => {
    expect(sql).toMatch(/alter table users add column if not exists autoridad text\[\]/);
    expect(sql).toMatch(/if not exists \(select 1 from pg_constraint/);
    expect(sql).not.toMatch(/drop (table|column)/i);
  });
  it("el check admite exactamente las acciones del código más «ninguna»", () => {
    for (const a of [...ACCIONES_AUTORIDAD, SIN_AUTORIDAD]) expect(sql, a).toContain(`'${a}'`);
  });
  it("el perfil NO pide la columna al leer el usuario (si no existe, todos caerían a cliente)", () => {
    const auth = readFileSync(path.join(process.cwd(), "src/lib/auth.ts"), "utf8");
    expect(auth).toContain('select("id,email,nombre,rol")');
  });
});
