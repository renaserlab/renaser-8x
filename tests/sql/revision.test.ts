/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: UNA REVISIÓN POR SEMANA Y POR EMPRESA, Y CADA DUEÑO LEE LA SUYA.
 *
 * migracion-plan-kpi-linea-base.sql crea `revisiones_semanales` con unique (company_id, semana): una semana se
 * revisa una vez y lo que se vuelve a guardar es un upsert, no una segunda fila. Aquí se comprueba sobre una base
 * vacía lo que la base promete por sí sola: la segunda fila para la misma empresa y semana no entra; la misma
 * semana para otra empresa sí; las cuatro listas nacen vacías (`[]`, no null); el dueño de A lee la revisión de A
 * y ninguna de B, el consultor y la service role leen todas, un anónimo ninguna; y el dueño no escribe: la
 * revisión la guarda el servidor con la service role, a pedido de la consultora.
 *
 * migracion-revision-revisada.sql (remate V, 13-10-2026) añade `revisada_por` y `revisada_at`: quién marcó la
 * semana como revisada y cuándo, que hasta entonces se escribía en `creada_por`. Aquí se comprueba que las dos
 * columnas aplican sobre la base vacía con su tipo y su clave foránea, que una fila con `creada_por` NO nace
 * revisada, que la marca se guarda y se lee, que el dueño la lee y no la escribe, que el archivo se puede aplicar
 * dos veces, y —en una segunda base que ya tenía filas del esquema anterior— que lo que estaba marcado conserva a
 * su revisora, sin fecha inventada, y que volver a aplicar no marca nada nuevo.
 *
 * Cierre del remate V: mientras la migración no esté aplicada, «Marcar revisada» sigue escribiendo la marca en
 * `creada_por` (src/lib/revision-semanal.ts, `guardar`). El código decide que está ante ese esquema por el error
 * que da Postgres al pedirle las columnas nuevas. Aquí se comprueba con Postgres de verdad que ese error es el que
 * el código reconoce (42703, nombrando la columna), que otro fallo no se confunde con él, y que la marca escrita
 * así es la que la migración lleva después a `revisada_por`.
 *
 * Qué no prueba: PostgREST, Auth ni que producción tenga la migración aplicada. Lo de src/lib/revision-semanal.ts
 * se prueba sin base en tests/revision-semanal.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import path from "path";
import { aplicarArchivo, aplicarTodo, baseConEsquema, consultarComo, crearBase, ordenSin, CARPETA_SUPABASE } from "./aplicar";
import { faltanColumnasDeRevisada } from "@/lib/revision-semanal";

const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña de A
const U_B = "00000000-0000-4000-8000-0000000000b1"; // dueño de B
const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultora
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const SEMANA = "2026-10-05";
const MIGRACION = "migracion-revision-revisada.sql";
const RUTA_MIGRACION = path.join(CARPETA_SUPABASE, MIGRACION);

let pg: PGlite | undefined;
let fallo: unknown;
let aplicados: string[] = [];

beforeAll(async () => {
  try {
    const creada = await baseConEsquema();
    pg = creada.pg;
    aplicados = creada.aplicados.map((a) => a.archivo);
    await pg.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', $2::jsonb), ($3, 'dueno-b@prueba.local', $4::jsonb), ($5, 'consultora@prueba.local', $6::jsonb)",
      [U_A, JSON.stringify({ nombre: "Dueña A" }), U_B, JSON.stringify({ nombre: "Dueño B" }), U_C, JSON.stringify({ nombre: "Consultora" })]
    );
    await pg.query("update users set rol = 'consultor' where id = $1", [U_C]);
    await pg.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)'), ($2, 'Estudio jurídico (sintético)')", [EMP_A, EMP_B]);
    await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [U_A, EMP_A, U_B, EMP_B]);
    await pg.query(
      `insert into revisiones_semanales (company_id, semana, desvios, explicacion, creada_por) values
         ($1, $3, $4::jsonb, 'Feria del 8: nadie estuvo en tienda.', $5),
         ($2, $3, '[]'::jsonb, null, null)`,
      [EMP_A, EMP_B, SEMANA, JSON.stringify([{ tipo: "retraso", clase: "accion", id: "a1", titulo: "Cotizar sin el dueño", detalle: "Vencía el 7 oct", decision_propuesta: "Reprogramar el plazo", enlace: "/empresa/x/plan#accion-a1" }]), U_C]
    );
  } catch (e) {
    fallo = e;
  }
}, 180_000);

afterAll(async () => {
  await pg?.close();
});

function base(): PGlite {
  if (fallo) throw fallo;
  if (!pg) throw new Error("no hay base: beforeAll no la creó");
  return pg;
}

/** Ejecuta esperando un rechazo; devuelve el mensaje de Postgres para afirmarlo. */
async function rechaza(sql: string, params: unknown[]): Promise<string> {
  try {
    await base().query(sql, params);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}

describe("Postgres embebido (PGlite), no Supabase: una revisión por empresa y semana", () => {
  it("la segunda fila para la misma empresa y la misma semana no entra: volver a guardar es un upsert, no otra fila", async () => {
    const m = await rechaza("insert into revisiones_semanales (company_id, semana) values ($1, $2)", [EMP_A, SEMANA]);
    expect(m).toMatch(/duplicate key|unique/i);
    const n = await base().query<{ n: number }>("select count(*)::int as n from revisiones_semanales where company_id = $1 and semana = $2", [EMP_A, SEMANA]);
    expect(n.rows[0]!.n).toBe(1);
  });

  it("la misma semana para otra empresa, y otra semana para la misma empresa, sí entran", async () => {
    await base().query("insert into revisiones_semanales (company_id, semana) values ($1, '2026-09-28')", [EMP_A]);
    const semanas = await base().query<{ semana: string }>("select semana::text from revisiones_semanales where company_id = $1 order by semana", [EMP_A]);
    expect(semanas.rows.map((f) => f.semana)).toEqual(["2026-09-28", SEMANA]);
  });

  it("las cuatro listas nacen como listas vacías, nunca null, y los textos de la consultora en blanco", async () => {
    const r = await base().query<{ que_debia_ocurrir: unknown; que_ocurrio: unknown; evidencia: unknown; desvios: unknown; explicacion: string | null; decision_necesaria: string | null; siguiente: string | null; creada_por: string | null }>(
      "select que_debia_ocurrir, que_ocurrio, evidencia, desvios, explicacion, decision_necesaria, siguiente, creada_por from revisiones_semanales where company_id = $1 and semana = $2",
      [EMP_B, SEMANA]
    );
    expect(r.rows[0]).toEqual({ que_debia_ocurrir: [], que_ocurrio: [], evidencia: [], desvios: [], explicacion: null, decision_necesaria: null, siguiente: null, creada_por: null });
  });

  it("los desvíos se guardan y se leen tal cual, con su decisión propuesta y su enlace", async () => {
    const r = await base().query<{ desvios: { tipo: string; decision_propuesta: string; enlace: string }[] }>("select desvios from revisiones_semanales where company_id = $1 and semana = $2", [EMP_A, SEMANA]);
    expect(r.rows[0]!.desvios).toHaveLength(1);
    expect(r.rows[0]!.desvios[0]).toMatchObject({ tipo: "retraso", decision_propuesta: "Reprogramar el plazo", enlace: "/empresa/x/plan#accion-a1" });
  });

  it("quien creó la fila tiene que existir en users: un id inventado no entra", async () => {
    expect(await rechaza("insert into revisiones_semanales (company_id, semana, creada_por) values ($1, '2026-09-21', '00000000-0000-4000-8000-00000000dead')", [EMP_A])).toMatch(/foreign key/i);
  });

  it("una revisión no vive sin su empresa: borrar la empresa se la lleva (cascade)", async () => {
    const EMP_C = "0000000c-0000-4000-8000-00000000000c";
    await base().query("insert into companies (id, nombre) values ($1, 'Efímera')", [EMP_C]);
    await base().query("insert into revisiones_semanales (company_id, semana) values ($1, $2)", [EMP_C, SEMANA]);
    await base().query("delete from companies where id = $1", [EMP_C]);
    const n = await base().query<{ n: number }>("select count(*)::int as n from revisiones_semanales where company_id = $1", [EMP_C]);
    expect(n.rows[0]!.n).toBe(0);
  });
});

describe("Postgres embebido (PGlite), no Supabase: cada dueño lee la revisión de su empresa y de ninguna otra", () => {
  const empresasQueVe = async (sub: string | null, rol: "authenticated" | "anon" | "service_role" = "authenticated") =>
    (await consultarComo<{ company_id: string }>(base(), rol, sub, "select distinct company_id from revisiones_semanales order by company_id")).map((f) => f.company_id);

  it("la dueña de A ve solo las de A, con la explicación que escribió la consultora", async () => {
    expect(await empresasQueVe(U_A)).toEqual([EMP_A]);
    const r = await consultarComo<{ explicacion: string | null }>(base(), "authenticated", U_A, "select explicacion from revisiones_semanales where semana = $1", [SEMANA]);
    expect(r.map((f) => f.explicacion)).toEqual(["Feria del 8: nadie estuvo en tienda."]);
  });

  it("el dueño de B ve solo la de B", async () => {
    expect(await empresasQueVe(U_B)).toEqual([EMP_B]);
  });

  it("la consultora y la service role ven todas; un anónimo, ninguna", async () => {
    expect(await empresasQueVe(U_C)).toEqual([EMP_A, EMP_B]);
    expect(await empresasQueVe(null, "service_role")).toEqual([EMP_A, EMP_B]);
    expect(await empresasQueVe(null, "anon")).toEqual([]);
  });

  it("la dueña NO escribe ni edita la revisión: la guarda el servidor con la service role a pedido de la consultora", async () => {
    let mensaje = "";
    try {
      await consultarComo(base(), "authenticated", U_A, "insert into revisiones_semanales (company_id, semana) values ($1, '2026-09-14')", [EMP_A]);
    } catch (e) {
      mensaje = e instanceof Error ? e.message : String(e);
    }
    expect(mensaje).toMatch(/row-level security|permission denied/i);
    // Un update que no pasa la política no toca ninguna fila: la explicación sigue siendo la de la consultora.
    await consultarComo(base(), "authenticated", U_A, "update revisiones_semanales set explicacion = 'la cambio yo' where company_id = $1", [EMP_A]);
    const r = await base().query<{ explicacion: string }>("select explicacion from revisiones_semanales where company_id = $1 and semana = $2", [EMP_A, SEMANA]);
    expect(r.rows[0]!.explicacion).toBe("Feria del 8: nadie estuvo en tienda.");
  });
});

describe("Postgres embebido (PGlite), no Supabase: quién revisó la semana y cuándo (migracion-revision-revisada.sql)", () => {
  type Marca = { creada_por: string | null; revisada_por: string | null; revisada_at: string | null };
  const marcaDe = async (empresa: string, semana: string = SEMANA) =>
    (await base().query<Marca>("select creada_por, revisada_por, revisada_at::text from revisiones_semanales where company_id = $1 and semana = $2", [empresa, semana])).rows[0]!;

  it("la migración está en el orden de aplicación, después de la que crea la tabla, y aplicó", () => {
    base();
    expect(aplicados).toContain(MIGRACION);
    expect(aplicados.indexOf(MIGRACION)).toBeGreaterThan(aplicados.indexOf("migracion-plan-kpi-linea-base.sql"));
  });

  it("las dos columnas nuevas existen con su tipo y admiten null: una semana sin marcar es una semana sin marcar", async () => {
    const r = await base().query<{ column_name: string; data_type: string; is_nullable: string }>(
      "select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'revisiones_semanales' and column_name in ('revisada_at', 'revisada_por') order by column_name"
    );
    expect(r.rows).toEqual([
      { column_name: "revisada_at", data_type: "timestamp with time zone", is_nullable: "YES" },
      { column_name: "revisada_por", data_type: "uuid", is_nullable: "YES" },
    ]);
  });

  it("revisada_por apunta a users: quien revisó tiene que existir, y un id inventado no entra", async () => {
    const fk = await base().query<{ destino: string }>(
      `select c.confrelid::regclass::text as destino
         from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.conrelid = 'revisiones_semanales'::regclass and c.contype = 'f' and a.attname = 'revisada_por'`
    );
    expect(fk.rows.map((f) => f.destino)).toEqual(["users"]);
    const m = await rechaza("update revisiones_semanales set revisada_por = '00000000-0000-4000-8000-00000000dead' where company_id = $1 and semana = $2", [EMP_A, SEMANA]);
    expect(m).toMatch(/foreign key/i);
    expect((await marcaDe(EMP_A)).revisada_por).toBeNull();
  });

  it("una fila con creada_por NO nace revisada: quien la creó no es quien la revisó", async () => {
    expect(await marcaDe(EMP_A)).toEqual({ creada_por: U_C, revisada_por: null, revisada_at: null });
    expect(await marcaDe(EMP_B)).toEqual({ creada_por: null, revisada_por: null, revisada_at: null });
  });

  it("marcar revisada guarda quién y cuándo, y no toca quién creó la fila", async () => {
    await base().query("update revisiones_semanales set revisada_por = $1, revisada_at = '2026-10-13T15:00:00Z' where company_id = $2 and semana = $3", [U_C, EMP_B, SEMANA]);
    const r = await base().query<{ creada_por: string | null; revisada_por: string | null; cuando: string }>(
      "select creada_por, revisada_por, to_char(revisada_at at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') as cuando from revisiones_semanales where company_id = $1 and semana = $2",
      [EMP_B, SEMANA]
    );
    expect(r.rows[0]).toEqual({ creada_por: null, revisada_por: U_C, cuando: "2026-10-13 10:00" });
  });

  it("el dueño lee quién revisó su semana y cuándo, pero no puede marcarla él", async () => {
    const lee = await consultarComo<{ revisada_por: string | null }>(base(), "authenticated", U_B, "select revisada_por from revisiones_semanales where semana = $1", [SEMANA]);
    expect(lee).toEqual([{ revisada_por: U_C }]);
    await consultarComo(base(), "authenticated", U_A, "update revisiones_semanales set revisada_por = $1, revisada_at = now() where company_id = $2", [U_A, EMP_A]);
    expect(await marcaDe(EMP_A)).toEqual({ creada_por: U_C, revisada_por: null, revisada_at: null });
  });

  it("el archivo se puede aplicar otra vez: no falla, no borra la marca y no convierte creada_por en una revisión", async () => {
    const antesA = await marcaDe(EMP_A);
    const antesB = await marcaDe(EMP_B);
    await aplicarArchivo(base(), RUTA_MIGRACION);
    expect(await marcaDe(EMP_A)).toEqual(antesA);
    expect(await marcaDe(EMP_B)).toEqual(antesB);
    expect(antesA.revisada_por).toBeNull();
    expect(antesB.revisada_por).toBe(U_C);
  });
});

describe("Postgres embebido (PGlite), no Supabase: una base que ya tenía revisiones del esquema anterior", () => {
  let vieja: PGlite | undefined;
  let falloVieja: unknown;
  const marcas = async () =>
    (await vieja!.query<{ company_id: string; semana: string; creada_por: string | null; revisada_por: string | null; revisada_at: string | null }>(
      "select company_id::text, semana::text, creada_por::text, revisada_por::text, revisada_at::text from revisiones_semanales order by company_id, semana"
    )).rows;

  beforeAll(async () => {
    try {
      vieja = await crearBase();
      // Todo el esquema MENOS esta migración: así estaba la base el día antes.
      await aplicarTodo(vieja, { orden: ordenSin([MIGRACION]) });
      await vieja.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'consultora@prueba.local', $2::jsonb)", [U_C, JSON.stringify({ nombre: "Consultora" })]);
      await vieja.query("update users set rol = 'consultor' where id = $1", [U_C]);
      await vieja.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)'), ($2, 'Estudio jurídico (sintético)')", [EMP_A, EMP_B]);
      // En ese esquema «Marcar revisada» escribía creada_por: A está marcada, B solo guardada.
      await vieja.query(
        "insert into revisiones_semanales (company_id, semana, explicacion, creada_por) values ($1, $3, 'Feria del 8: nadie estuvo en tienda.', $4), ($2, $3, null, null)",
        [EMP_A, EMP_B, SEMANA, U_C]
      );
    } catch (e) {
      falloVieja = e;
    }
  }, 180_000);

  afterAll(async () => {
    await vieja?.close();
  });

  /** El error de Postgres al ejecutar, con su código, o null si no falló. */
  const errorDe = async (sql: string, params: unknown[] = []): Promise<{ code?: string; message: string } | null> => {
    try {
      await vieja!.query(sql, params);
    } catch (e) {
      return { code: (e as { code?: string }).code, message: e instanceof Error ? e.message : String(e) };
    }
    return null;
  };

  it("sin la migración, pedir las columnas nuevas falla con 42703 nombrando la columna: es lo que el código reconoce para marcar como antes, y otro fallo no se confunde con él", async () => {
    if (falloVieja) throw falloVieja;
    // La misma lista de columnas que pide el código, calificadas con la tabla como las pide PostgREST.
    const falta = await errorDe(
      "select revisiones_semanales.id, revisiones_semanales.explicacion, revisiones_semanales.creada_por, revisiones_semanales.revisada_at, revisiones_semanales.revisada_por from revisiones_semanales where company_id = $1 and semana = $2",
      [EMP_A, SEMANA]
    );
    expect(falta?.code).toBe("42703");
    expect(falta?.message).toMatch(/revisada_at/);
    expect(faltanColumnasDeRevisada(falta!)).toBe(true);
    // Las columnas de siempre sí se leen: la pantalla no se cae por la migración pendiente.
    expect(await errorDe("select id, explicacion, decision_necesaria, siguiente, creada_por from revisiones_semanales where company_id = $1 and semana = $2", [EMP_A, SEMANA])).toBeNull();
    // Una tabla que no existe es otro fallo (42P01): no se toma por «falta la migración de revisada».
    const otro = await errorDe("select id from tabla_que_no_existe");
    expect(otro?.code).toBe("42P01");
    expect(faltanColumnasDeRevisada(otro!)).toBe(false);
  });

  it("sin la migración, la marca se escribe como antes: creada_por acepta a quien revisa, y escribir revisada_por se rechaza sin tocar la fila", async () => {
    if (falloVieja) throw falloVieja;
    const EMP_D = "0000000d-0000-4000-8000-00000000000d";
    await vieja!.query("insert into companies (id, nombre) values ($1, 'Ferretería (sintética)')", [EMP_D]);
    // Guardar un texto sin marcar: la fila nace sin marca.
    await vieja!.query("insert into revisiones_semanales (company_id, semana, explicacion, creada_por) values ($1, $2, 'Semana corta.', null)", [EMP_D, SEMANA]);
    // Lo que NO debe intentar el código en este esquema: la base lo rechaza y la fila queda como estaba.
    const rechazo = await errorDe("update revisiones_semanales set revisada_por = $1, revisada_at = now() where company_id = $2 and semana = $3", [U_C, EMP_D, SEMANA]);
    expect(rechazo?.code).toBe("42703");
    // Lo que sí hace: marcar en creada_por, como antes de la migración.
    await vieja!.query("update revisiones_semanales set creada_por = $1 where company_id = $2 and semana = $3", [U_C, EMP_D, SEMANA]);
    const fila = await vieja!.query<{ creada_por: string | null; explicacion: string }>("select creada_por::text, explicacion from revisiones_semanales where company_id = $1 and semana = $2", [EMP_D, SEMANA]);
    expect(fila.rows[0]).toEqual({ creada_por: U_C, explicacion: "Semana corta." });
    // Se retira para que las pruebas que siguen cuenten solo las dos empresas de siempre; que la migración lleva
    // una marca así a revisada_por lo comprueba la prueba siguiente con la fila de la empresa A.
    await vieja!.query("delete from companies where id = $1", [EMP_D]);
  });

  it("antes de la migración las columnas no existen; al aplicarla, lo que estaba marcado conserva a su revisora y queda sin fecha, y lo que no, sin marca", async () => {
    if (falloVieja) throw falloVieja;
    const antes = await vieja!.query<{ n: number }>("select count(*)::int as n from information_schema.columns where table_name = 'revisiones_semanales' and column_name in ('revisada_at', 'revisada_por')");
    expect(antes.rows[0]!.n).toBe(0);
    await aplicarArchivo(vieja!, RUTA_MIGRACION);
    expect(await marcas()).toEqual([
      { company_id: EMP_A, semana: SEMANA, creada_por: U_C, revisada_por: U_C, revisada_at: null },
      { company_id: EMP_B, semana: SEMANA, creada_por: null, revisada_por: null, revisada_at: null },
    ]);
    const explicacion = await vieja!.query<{ explicacion: string }>("select explicacion from revisiones_semanales where company_id = $1", [EMP_A]);
    expect(explicacion.rows[0]!.explicacion).toBe("Feria del 8: nadie estuvo en tienda.");
  });

  it("volver a aplicarla no marca lo que se guardó después: creada_por ya no significa «revisada»", async () => {
    if (falloVieja) throw falloVieja;
    await vieja!.query("insert into revisiones_semanales (company_id, semana, creada_por) values ($1, '2026-10-12', $2)", [EMP_A, U_C]);
    await aplicarArchivo(vieja!, RUTA_MIGRACION);
    expect(await marcas()).toEqual([
      { company_id: EMP_A, semana: SEMANA, creada_por: U_C, revisada_por: U_C, revisada_at: null },
      { company_id: EMP_A, semana: "2026-10-12", creada_por: U_C, revisada_por: null, revisada_at: null },
      { company_id: EMP_B, semana: SEMANA, creada_por: null, revisada_por: null, revisada_at: null },
    ]);
  });
});
