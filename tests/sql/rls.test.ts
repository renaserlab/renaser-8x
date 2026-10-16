/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LAS POLÍTICAS RLS FILTRAN DE VERDAD.
 *
 * Dos empresas, dos dueños, un consultor. Cada consulta corre como lo haría PostgREST para ese usuario:
 * `set local role authenticated` y `request.jwt.claims` con su `sub`. Lo que debe verse: cada dueño solo
 * su empresa; el consultor y la service role, todo; un anónimo, nada.
 *
 * Fidelidad y límite. El rol y los claims los pone la prueba con set_config, no un JWT verificado por
 * Auth: se prueba la política, no la autenticación. Sin PostgREST tampoco se prueba la capa HTTP. Lo que
 * aquí filtra, filtra en Postgres; que Supabase lo exponga igual es otra prueba
 * (tests/supabase/integracion.test.ts, que exige un proyecto aislado).
 *
 * HALLAZGO DOCUMENTADO, NO ARREGLADO. Las 13 páginas del portal del cliente (src/app/(cliente)/portal/**)
 * leen TODO con supabaseAdmin (service role) y aplican la frontera en código (api.ts, auth.ts): ninguna
 * política bloquea lo que esas páginas necesitan porque no pasan por RLS. RLS es la segunda cerca, no la
 * puerta. La excepción es Realtime, que sí pasa por RLS: Progreso.tsx (que el portal monta en
 * portal/documentos a través de Subir paraCliente) se suscribe desde el navegador a postgres_changes
 * sobre `jobs`, y `jobs` no tiene política de cliente (schema.sql: «sin política de cliente →
 * invisibles»). Para el dueño esa suscripción nunca recibe nada; lo que de verdad le muestra el avance
 * es el sondeo de respaldo a /api/jobs/[id] cada 4 s (Progreso.tsx:31-36). No está roto, pero el canal
 * «en vivo» del cliente es letra muerta. Lo mismo le pasaría a MatrizRealidad.tsx sobre `claims` si
 * algún día se montara en el portal (hoy es solo de la consultora). Si una pantalla del cliente leyera
 * `claims` con su sesión, recibiría cero filas a propósito (P0-02: debe usar la vista claims_cliente).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema, consultarComo, type Rol } from "./aplicar";

// Identificadores fijos: la prueba es reproducible y los mensajes se leen igual cada vez.
const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña de A
const U_B = "00000000-0000-4000-8000-0000000000b1"; // dueño de B
const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultor
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const SRC_A = "000000aa-0000-4000-8000-0000000000aa";
const SRC_B = "000000bb-0000-4000-8000-0000000000bb";

let pg: PGlite | undefined;
let fallo: unknown;

beforeAll(async () => {
  try {
    pg = (await baseConEsquema()).pg;
    // Tres cuentas en auth.users: el disparador handle_new_user crea su perfil en public.users.
    await pg.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', $2::jsonb), ($3, 'dueno-b@prueba.local', $4::jsonb), ($5, 'consultora@prueba.local', $6::jsonb)",
      [U_A, JSON.stringify({ nombre: "Dueña A" }), U_B, JSON.stringify({ nombre: "Dueño B" }), U_C, JSON.stringify({ nombre: "Consultora" })]
    );
    await pg.query("update users set rol = 'consultor' where id = $1", [U_C]);
    await pg.query("insert into companies (id, nombre) values ($1, 'Empresa A'), ($2, 'Empresa B')", [EMP_A, EMP_B]);
    await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [U_A, EMP_A, U_B, EMP_B]);
    await pg.query(
      "insert into sources (id, company_id, tipo, nombre, origen) values ($1, $2, 'documento', 'Manual A', 'cliente'), ($3, $4, 'documento', 'Manual B', 'cliente')",
      [SRC_A, EMP_A, SRC_B, EMP_B]
    );
    await pg.query(
      "insert into claims (company_id, source_id, texto) values ($1, $2, 'Afirmación de A'), ($3, $4, 'Afirmación de B')",
      [EMP_A, SRC_A, EMP_B, SRC_B]
    );
    // Un hallazgo aprobado y uno pendiente por empresa: el cliente solo debe ver el aprobado.
    await pg.query(
      `insert into findings (company_id, pilar, titulo, estado_revision) values
         ($1, 'procesos', 'Hallazgo A aprobado', 'aprobado'), ($1, 'procesos', 'Hallazgo A pendiente', 'pendiente'),
         ($2, 'procesos', 'Hallazgo B aprobado', 'aprobado'), ($2, 'procesos', 'Hallazgo B pendiente', 'pendiente')`,
      [EMP_A, EMP_B]
    );
  } catch (e) {
    fallo = e;
  }
}, 180_000);

afterAll(async () => {
  await pg?.close();
});

/** La base aplicada; si aplicar falló, el error se relanza aquí para que cada caso lo diga completo. */
function base(): PGlite {
  if (fallo) throw fallo;
  if (!pg) throw new Error("no hay base: beforeAll no la creó");
  return pg;
}

type Fila = { id?: string; company_id?: string; titulo?: string; texto?: string };

/** Lo que ve un usuario (o rol) en cada una de las cuatro tablas que la prueba vigila. */
async function loQueVe(rol: Rol, sub: string | null) {
  const q = (sql: string) => consultarComo<Fila>(base(), rol, sub, sql);
  return {
    companies: (await q("select id from companies order by id")).map((f) => f.id),
    sources: (await q("select company_id from sources order by company_id")).map((f) => f.company_id),
    findings: (await q("select titulo from findings order by titulo")).map((f) => f.titulo),
    claims: (await q("select texto from claims order by texto")).map((f) => f.texto),
  };
}

describe("Postgres embebido (PGlite), no Supabase: dos empresas, dos dueños, y cada uno ve solo lo suyo", () => {
  it("el disparador de auth.users creó los perfiles en public.users, como clientes", async () => {
    const r = await base().query<{ id: string; rol: string; nombre: string }>("select id, rol, nombre from users where id in ($1, $2) order by id", [U_A, U_B]);
    expect(r.rows).toEqual([
      { id: U_A, rol: "cliente", nombre: "Dueña A" },
      { id: U_B, rol: "cliente", nombre: "Dueño B" },
    ]);
  });

  it("la dueña de A ve solo A: su empresa, sus fuentes y solo los hallazgos aprobados o corregidos", async () => {
    expect(await loQueVe("authenticated", U_A)).toEqual({
      companies: [EMP_A],
      sources: [EMP_A],
      findings: ["Hallazgo A aprobado"],
      claims: [],
    });
  });

  it("el dueño de B ve solo B", async () => {
    expect(await loQueVe("authenticated", U_B)).toEqual({
      companies: [EMP_B],
      sources: [EMP_B],
      findings: ["Hallazgo B aprobado"],
      claims: [],
    });
  });

  it("ningún dueño lee claims directamente (P0-02); la vista claims_cliente le da solo lo suyo y sin columnas internas", async () => {
    const vista = await consultarComo<Record<string, unknown>>(base(), "authenticated", U_A, "select * from claims_cliente");
    expect(vista).toHaveLength(1);
    expect(vista[0].texto).toBe("Afirmación de A");
    expect(Object.keys(vista[0]).sort()).toEqual(["company_id", "fecha_afirmacion", "fuente_nombre", "fuente_tipo", "id", "opciones", "pregunta", "requiere_validacion", "texto"]);
  });

  it("el consultor ve las dos empresas y todos los hallazgos, también los pendientes", async () => {
    const ve = await loQueVe("authenticated", U_C);
    expect(ve.companies).toEqual([EMP_A, EMP_B]);
    expect(ve.findings).toHaveLength(4);
    expect(ve.claims).toHaveLength(2);
  });

  it("la service role lo ve todo (salta RLS, como el worker y las rutas de servidor)", async () => {
    expect(await loQueVe("service_role", null)).toEqual({
      companies: [EMP_A, EMP_B],
      sources: [EMP_A, EMP_B],
      findings: ["Hallazgo A aprobado", "Hallazgo A pendiente", "Hallazgo B aprobado", "Hallazgo B pendiente"],
      claims: ["Afirmación de A", "Afirmación de B"],
    });
  });

  it("un anónimo no ve nada", async () => {
    expect(await loQueVe("anon", null)).toEqual({ companies: [], sources: [], findings: [], claims: [] });
  });

  it("una sesión sin membresía no ve ninguna empresa", async () => {
    const ve = await loQueVe("authenticated", "00000000-0000-4000-8000-00000000ffff");
    expect(ve).toEqual({ companies: [], sources: [], findings: [], claims: [] });
  });
});

describe("Postgres embebido (PGlite), no Supabase: lo que el dueño puede y no puede escribir", () => {
  it("no puede crear una empresa ni un hallazgo: no hay política de escritura para el cliente", async () => {
    await expect(consultarComo(base(), "authenticated", U_A, "insert into companies (nombre) values ('Colada')")).rejects.toThrow(/row-level security/);
    await expect(
      consultarComo(base(), "authenticated", U_A, "insert into findings (company_id, pilar, titulo) values ($1, 'procesos', 'Colado')", [EMP_A])
    ).rejects.toThrow(/row-level security/);
  });

  it("puede subir una fuente propia (origen cliente) a su empresa, pero no firmarla como consultor ni meterla en otra empresa", async () => {
    await consultarComo(base(), "authenticated", U_A, "insert into sources (company_id, tipo, nombre, origen) values ($1, 'foto', 'Foto A', 'cliente')", [EMP_A]);
    await expect(
      consultarComo(base(), "authenticated", U_A, "insert into sources (company_id, tipo, nombre, origen) values ($1, 'foto', 'Falsa', 'consultor')", [EMP_A])
    ).rejects.toThrow(/row-level security/);
    await expect(
      consultarComo(base(), "authenticated", U_A, "insert into sources (company_id, tipo, nombre, origen) values ($1, 'foto', 'Ajena', 'cliente')", [EMP_B])
    ).rejects.toThrow(/row-level security/);

    const r = await base().query<{ n: number }>("select count(*)::int as n from sources where company_id = $1", [EMP_A]);
    expect(r.rows[0].n).toBe(2);
  });
});
