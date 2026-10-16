/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LAS INICIATIVAS EN EL ESQUEMA REAL.
 *
 * migracion-excelencia-y-cartera.sql crea `iniciativas` e `iniciativa_historial`. Aquí se comprueba sobre
 * una base vacía, con todo el SQL del repositorio aplicado:
 *  · que el check de dominio admite los quince de src/lib/iniciativas.ts y rechaza cualquier otro;
 *  · que el check de estado admite los siete y rechaza uno inventado;
 *  · que hipótesis, medida de éxito y título son obligatorios, y que el indicador, el responsable y la
 *    empresa son claves foráneas de verdad;
 *  · que lo que DECIDE la regla pura (proponer, aprobar, empezar, decidir) se escribe tal cual, con sus
 *    mismas columnas y su misma fila de historial, y el esquema real lo acepta;
 *  · que el dueño de una empresa NO ve las propuestas, ni las iniciativas de otra empresa, ni el historial,
 *    y que no puede escribir (RLS). Una propuesta empieza a verla cuando se aprueba;
 *  · que la marca de versión (`updated_at`) sirve de candado tal como la base la entrega en JSON, y que el
 *    filtro de hallazgos que sustentan (revisados y no provisionales) existe en el esquema y filtra.
 *
 * Qué no prueba: PostgREST, Auth ni las lecturas de api/companies/[id]/iniciativas/_datos.ts, que usan la
 * service role (eso va con dobles en tests/iniciativas.test.ts). Aquí los claims del JWT los pone la prueba.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema, consultarComo } from "./aplicar";
import { CLAVES_DOMINIO, ESTADOS, ESTADOS_VISIBLES_CLIENTE, desdeFila, nueva, transicion, completitud, type Actor, type Iniciativa, type ResultadoTransicion } from "@/lib/iniciativas";

const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña de A
const U_B = "00000000-0000-4000-8000-0000000000b1"; // dueño de B
const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultora
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const PART_A = "000000a1-0000-4000-8000-0000000000a1";
const IND_A = "000000d1-0000-4000-8000-0000000000d1";
const FUENTE_A = "000000e1-0000-4000-8000-0000000000e1";
const CONSULTORA: Actor = { id: U_C, rol: "consultor" };
const AHORA = new Date("2026-10-13T15:00:00Z");

let pg: PGlite | undefined;
let fallo: unknown;

beforeAll(async () => {
  try {
    pg = (await baseConEsquema()).pg;
    await pg.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', $2::jsonb), ($3, 'dueno-b@prueba.local', $4::jsonb), ($5, 'consultora@prueba.local', $6::jsonb)",
      [U_A, JSON.stringify({ nombre: "Dueña A" }), U_B, JSON.stringify({ nombre: "Dueño B" }), U_C, JSON.stringify({ nombre: "Consultora" })]
    );
    await pg.query("update users set rol = 'consultor' where id = $1", [U_C]);
    await pg.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)'), ($2, 'Estudio jurídico (sintético)')", [EMP_A, EMP_B]);
    await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [U_A, EMP_A, U_B, EMP_B]);
    await pg.query("insert into participants (id, company_id, nombre, puesto, rol) values ($1, $2, 'Rosa Mamani', 'Encargada de tienda', 'lider')", [PART_A, EMP_A]);
    await pg.query("insert into indicadores (id, company_id, clave, nombre, como_se_mide) values ($1, $2, 'clientes_que_vuelven', 'Clientes que vuelven', 'De cada 10 llamados, cuántos compran otra vez')", [IND_A, EMP_A]);
    await pg.query("insert into sources (id, company_id, tipo, nombre, estado) values ($1, $2, 'documento', 'Registro de clientes 2026 (sintético)', 'leido')", [FUENTE_A, EMP_A]);
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

async function rechaza(sql: string, params: unknown[]): Promise<string> {
  try {
    await base().query(sql, params);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}

/** Inserta exactamente la fila que devolvió la regla pura: las mismas columnas, con el tipo que la tabla pide. */
async function insertar(fila: Record<string, unknown>): Promise<string> {
  const columnas = Object.keys(fila);
  const valor = (c: string) => (c === "fuentes_aportadas" ? JSON.stringify(fila[c]) : c === "evidencia_ids" ? `{${(fila[c] as string[]).join(",")}}` : fila[c]);
  const marca = (c: string, n: number) => (c === "fuentes_aportadas" ? `$${n}::jsonb` : c === "evidencia_ids" ? `$${n}::uuid[]` : `$${n}`);
  const r = await base().query<{ id: string }>(
    `insert into iniciativas (${columnas.join(", ")}) values (${columnas.map((c, n) => marca(c, n + 1)).join(", ")}) returning id`,
    columnas.map(valor)
  );
  return r.rows[0]!.id;
}

/** Escribe en SQL exactamente lo que devolvió `transicion`: las columnas de `cambios` y la fila de historial. */
async function escribir(r: Extract<ResultadoTransicion, { ok: true }>): Promise<void> {
  const columnas = Object.keys(r.cambios);
  await base().query(`update iniciativas set ${columnas.map((c, n) => `${c} = $${n + 2}`).join(", ")} where id = $1`, [r.historial.iniciativa_id, ...columnas.map((c) => r.cambios[c])]);
  await base().query("insert into iniciativa_historial (iniciativa_id, de_estado, a_estado, motivo, evidencia, actor_id) values ($1, $2, $3, $4, $5::jsonb, $6)", [
    r.historial.iniciativa_id, r.historial.de_estado, r.historial.a_estado, r.historial.motivo, r.historial.evidencia ? JSON.stringify(r.historial.evidencia) : null, r.historial.actor_id,
  ]);
}

async function leer(id: string): Promise<Iniciativa> {
  const r = await base().query<Record<string, unknown>>("select *, plazo_inicio::text as plazo_inicio, plazo_fin::text as plazo_fin from iniciativas where id = $1", [id]);
  return desdeFila(r.rows[0]!);
}

const minima = (empresa: string, titulo: string) => [empresa, titulo, "Si hacemos esto pasa aquello", "Un número que cualquiera puede contar"];
const SQL_MINIMA = "insert into iniciativas (company_id, dominio, titulo, hipotesis, medida_exito, estado) values ($1, $5, $2, $3, $4, $6)";

describe("Postgres embebido (PGlite), no Supabase: los checks de dominio y de estado", () => {
  it("el check de dominio admite los quince de la regla y rechaza cualquier otro", async () => {
    expect(CLAVES_DOMINIO).toHaveLength(15);
    for (const d of CLAVES_DOMINIO) await base().query(SQL_MINIMA, [...minima(EMP_B, `dominio ${d}`), d, "propuesta"]);
    const n = await base().query<{ n: number }>("select count(distinct dominio)::int as n from iniciativas where company_id = $1 and titulo like 'dominio %'", [EMP_B]);
    expect(n.rows[0]!.n).toBe(15);
    for (const inventado of ["ventas", "marketing", "Retencion", "", "retencion "]) {
      expect(await rechaza(SQL_MINIMA, [...minima(EMP_B, "x"), inventado, "propuesta"]), `dominio «${inventado}»`).toMatch(/check/i);
    }
  });

  it("el check de estado admite los siete y rechaza uno inventado", async () => {
    expect([...ESTADOS]).toHaveLength(7);
    for (const e of ESTADOS) await base().query(SQL_MINIMA, [...minima(EMP_B, `estado ${e}`), "retencion", e]);
    const n = await base().query<{ n: number }>("select count(distinct estado)::int as n from iniciativas where company_id = $1 and titulo like 'estado %'", [EMP_B]);
    expect(n.rows[0]!.n).toBe(7);
    for (const inventado of ["terminada", "aprobado", "pendiente", "en curso", ""]) {
      expect(await rechaza(SQL_MINIMA, [...minima(EMP_B, "x"), "retencion", inventado]), `estado «${inventado}»`).toMatch(/check/i);
    }
    expect(await rechaza("update iniciativas set estado = 'hecha' where company_id = $1", [EMP_B])).toMatch(/check/i);
  });

  it("sin decir el estado nace propuesta, con listas vacías y sin decisión", async () => {
    const r = await base().query<{ estado: string; evidencias: number; fuentes: string; decision_at: string | null }>(
      "insert into iniciativas (company_id, dominio, titulo, hipotesis, medida_exito) values ($1, 'conversion', 'por defecto', 'h de prueba', 'm de prueba') returning estado, cardinality(evidencia_ids) as evidencias, fuentes_aportadas::text as fuentes, decision_at",
      [EMP_B]
    );
    expect(r.rows[0]).toEqual({ estado: "propuesta", evidencias: 0, fuentes: "[]", decision_at: null });
  });

  it("título, hipótesis y medida de éxito son obligatorios", async () => {
    expect(await rechaza("insert into iniciativas (company_id, dominio, hipotesis, medida_exito) values ($1, 'retencion', 'h', 'm')", [EMP_A])).toMatch(/null value|not-null/i);
    expect(await rechaza("insert into iniciativas (company_id, dominio, titulo, medida_exito) values ($1, 'retencion', 't', 'm')", [EMP_A])).toMatch(/null value|not-null/i);
    expect(await rechaza("insert into iniciativas (company_id, dominio, titulo, hipotesis) values ($1, 'retencion', 't', 'h')", [EMP_A])).toMatch(/null value|not-null/i);
  });

  it("la empresa, el indicador y el responsable tienen que existir", async () => {
    const NADIE = "00000000-0000-4000-8000-00000000dead";
    expect(await rechaza(SQL_MINIMA, [...minima(NADIE, "x"), "retencion", "propuesta"])).toMatch(/foreign key/i);
    expect(await rechaza("insert into iniciativas (company_id, dominio, titulo, hipotesis, medida_exito, indicador_id) values ($1, 'retencion', 't', 'h', 'm', $2)", [EMP_A, NADIE])).toMatch(/foreign key/i);
    expect(await rechaza("insert into iniciativas (company_id, dominio, titulo, hipotesis, medida_exito, responsable_participant_id) values ($1, 'retencion', 't', 'h', 'm', $2)", [EMP_A, NADIE])).toMatch(/foreign key/i);
    expect(await rechaza("insert into iniciativa_historial (iniciativa_id, a_estado) values ($1, 'aprobada')", [NADIE])).toMatch(/foreign key/i);
  });
});

describe("Postgres embebido (PGlite), no Supabase: lo que decide la regla se escribe tal cual en el esquema real", () => {
  let id = "";

  it("proponer: la fila que arma `nueva` entra con todas sus columnas, también las fuentes aportadas y las evidencias", async () => {
    const r = nueva(
      EMP_A,
      {
        dominio: "mercado_y_competencia", titulo: "Subir S/ 3 el polo básico", hipotesis: "El polo básico aguanta S/ 3 más sin perder ventas porque las tres tiendas de la cuadra ya lo venden más caro",
        medida_exito: "Unidades vendidas por semana", evidencia_ids: [FUENTE_A], recursos: "Cambiar las etiquetas: una tarde de una persona", plazo_fin: "2026-11-30", indicador_id: IND_A,
        criterio_continuar: "al menos 40", criterio_ajustar: "entre 30 y 39", criterio_detener: "menos de 30", responsable_participant_id: PART_A,
        fuente_aportada: { nombre: "Lista de precios de tres tiendas de la cuadra", quien: "Rosa, encargada de tienda", fecha: "2026-09-20", que_dice: "Las tres venden el polo básico entre S/ 25 y S/ 32" },
      },
      CONSULTORA,
      "2026-10-13"
    );
    if (!r.ok) throw new Error(r.error);
    id = await insertar(r.fila);
    await base().query("insert into iniciativa_historial (iniciativa_id, de_estado, a_estado, motivo, actor_id) values ($1, $2, $3, $4, $5)", [id, r.historial.de_estado, r.historial.a_estado, r.historial.motivo, r.historial.actor_id]);

    const i = await leer(id);
    expect(i).toMatchObject({ estado: "propuesta", dominio: "mercado_y_competencia", creada_por: U_C, evidencia_ids: [FUENTE_A], indicador_id: IND_A, responsable_participant_id: PART_A, plazo_fin: "2026-11-30", plazo_inicio: null });
    expect(i.fuentes_aportadas).toEqual([{ nombre: "Lista de precios de tres tiendas de la cuadra", quien_la_aporto: "Rosa, encargada de tienda", fecha: "2026-09-20", que_dice: "Las tres venden el polo básico entre S/ 25 y S/ 32" }]);
    expect(completitud(i), "leída de la base, la ficha sigue completa").toEqual([]);
  });

  it("aprobar, empezar y decidir: cada paso cambia la fila y deja su fila de historial, sin pisar las anteriores", async () => {
    const aprobar = transicion(await leer(id), "aprobada", CONSULTORA, null, null, { ahora: AHORA });
    if (!aprobar.ok) throw new Error(aprobar.error);
    await escribir(aprobar);
    expect(await leer(id)).toMatchObject({ estado: "aprobada", decision_por: U_C });

    const empezar = transicion(await leer(id), "en_curso", CONSULTORA, null, null, { ahora: AHORA, zona: "America/Lima" });
    if (!empezar.ok) throw new Error(empezar.error);
    await escribir(empezar);
    expect(await leer(id)).toMatchObject({ estado: "en_curso", plazo_inicio: "2026-10-13" });

    const decidir = transicion(await leer(id), "ajustar", CONSULTORA, "Las ventas bajaron más de lo previsto", { que_se_observo: "En cuatro semanas se vendieron 34 polos por semana en promedio", valor_indicador: 34, periodo: "2026-11" }, { ahora: AHORA });
    if (!decidir.ok) throw new Error(decidir.error);
    await escribir(decidir);
    expect(await leer(id)).toMatchObject({ estado: "ajustar", decision_motivo: "Las ventas bajaron más de lo previsto" });

    const h = await base().query<{ de_estado: string | null; a_estado: string; motivo: string | null; evidencia: Record<string, unknown> | null; actor_id: string }>(
      "select de_estado, a_estado, motivo, evidencia, actor_id from iniciativa_historial where iniciativa_id = $1 order by created_at, id",
      [id]
    );
    expect(h.rows.map((x) => `${x.de_estado ?? "—"}→${x.a_estado}`).sort()).toEqual(["aprobada→en_curso", "en_curso→ajustar", "propuesta→aprobada", "—→propuesta"]);
    const decision = h.rows.find((x) => x.a_estado === "ajustar")!;
    expect(decision.actor_id).toBe(U_C);
    expect(decision.evidencia).toMatchObject({ que_se_observo: "En cuatro semanas se vendieron 34 polos por semana en promedio", valor_indicador: 34, criterio_que_se_cumple: "ajustar", coincide_con_el_criterio: true });
  });

  it("la versión leída protege la escritura: con la marca tal como la base la entrega en JSON se escribe; con una vieja, no", async () => {
    const x = await base().query<{ id: string; v: string }>(
      "insert into iniciativas (company_id, dominio, titulo, hipotesis, medida_exito) values ($1, 'adquisicion', 'Versión leída', 'h', 'm') returning id, to_json(updated_at)#>>'{}' as v",
      [EMP_A]
    );
    const { id: nuevaId, v: leida } = x.rows[0]!;
    // La marca nace de now(), con microsegundos, y viaja como texto JSON: se devuelve igual y tiene que coincidir.
    const SQL = "update iniciativas set titulo = $4, updated_at = $3 where id = $1 and estado = 'propuesta' and updated_at = $2 returning id";
    const primera = await base().query(SQL, [nuevaId, leida, AHORA.toISOString(), "Primera edición"]);
    expect(primera.rows, "con la versión que se leyó, se escribe").toHaveLength(1);
    const pisada = await base().query(SQL, [nuevaId, leida, new Date("2026-10-13T15:00:01Z").toISOString(), "Edición sobre una versión vieja"]);
    expect(pisada.rows, "con la versión vieja no toca ninguna fila").toEqual([]);
    // La marca que escribe la aplicación (milisegundos, en ISO) también sirve de versión para la escritura siguiente.
    const segunda = await base().query(SQL, [nuevaId, AHORA.toISOString(), new Date("2026-10-13T15:00:02Z").toISOString(), "Segunda edición"]);
    expect(segunda.rows).toHaveLength(1);
    expect((await leer(nuevaId)).titulo).toBe("Segunda edición");
    await base().query("delete from iniciativas where id = $1", [nuevaId]);
  });

  it("los hallazgos que sustentan: revisados por una persona y no provisionales (la columna existe y el filtro los separa)", async () => {
    const EMP_H = "0000000d-0000-4000-8000-00000000000d";
    await base().query("insert into companies (id, nombre) values ($1, 'Empresa de hallazgos (sintética)')", [EMP_H]);
    await base().query(
      `insert into findings (company_id, pilar, titulo, estado_revision, provisional) values
        ($1, 'p', 'aprobado', 'aprobado', false), ($1, 'p', 'corregido sin marca', 'corregido', null), ($1, 'p', 'aprobado provisional', 'aprobado', true),
        ($1, 'p', 'pendiente', 'pendiente', false), ($1, 'p', 'rechazado', 'rechazado', false)`,
      [EMP_H]
    );
    await base().query("insert into findings (company_id, pilar, titulo) values ($1, 'p', 'recién salido de la IA')", [EMP_H]);
    // Es el filtro de leerEvidencias (_datos.ts) dicho en SQL: in (aprobado, corregido) y (provisional nulo o falso).
    const r = await base().query<{ titulo: string }>(
      "select titulo from findings where company_id = $1 and estado_revision in ('aprobado','corregido') and (provisional is null or provisional = false) order by titulo",
      [EMP_H]
    );
    expect(r.rows.map((x) => x.titulo)).toEqual(["aprobado", "corregido sin marca"]);
    const nace = await base().query<{ estado_revision: string; provisional: boolean | null }>("select estado_revision, provisional from findings where company_id = $1 and titulo = 'recién salido de la IA'", [EMP_H]);
    expect(nace.rows[0], "un hallazgo nace pendiente: no sustenta nada hasta que una persona lo revisa").toEqual({ estado_revision: "pendiente", provisional: false });
    await base().query("delete from companies where id = $1", [EMP_H]);
  });

  it("borrar la iniciativa se lleva su historial; borrar la empresa se lleva sus iniciativas (cascada, sobre una empresa de prueba aparte)", async () => {
    const EMP_X = "0000000c-0000-4000-8000-00000000000c";
    await base().query("insert into companies (id, nombre) values ($1, 'Empresa desechable (sintética)')", [EMP_X]);
    const x = await base().query<{ id: string }>("insert into iniciativas (company_id, dominio, titulo, hipotesis, medida_exito) values ($1, 'adquisicion', 't', 'h', 'm') returning id", [EMP_X]);
    await base().query("insert into iniciativa_historial (iniciativa_id, a_estado) values ($1, 'propuesta')", [x.rows[0]!.id]);
    await base().query("delete from companies where id = $1", [EMP_X]);
    const n = await base().query<{ a: number; b: number }>("select (select count(*)::int from iniciativas where company_id = $1) as a, (select count(*)::int from iniciativa_historial where iniciativa_id = $2) as b", [EMP_X, x.rows[0]!.id]);
    expect(n.rows[0]).toEqual({ a: 0, b: 0 });
  });
});

describe("Postgres embebido (PGlite), no Supabase: el dueño no ve propuestas ni lo ajeno (RLS)", () => {
  const PROPUESTA_A = "000000aa-0000-4000-8000-00000000aaa1";
  const EN_CURSO_A = "000000aa-0000-4000-8000-00000000aaa2";
  const APROBADA_B = "000000bb-0000-4000-8000-00000000bbb1";
  const SQL_CON_ID = "insert into iniciativas (id, company_id, dominio, titulo, hipotesis, medida_exito, estado) values ($1, $2, 'retencion', $3, 'h de prueba', 'm de prueba', $4)";

  it("preparación: una empresa limpia de las filas de los checks, una propuesta y una en curso en A, una aprobada en B", async () => {
    await base().query("delete from iniciativas where company_id = $1 and (titulo like 'dominio %' or titulo like 'estado %' or titulo = 'por defecto')", [EMP_B]);
    await base().query("delete from iniciativas where company_id = $1", [EMP_A]);
    await base().query(SQL_CON_ID, [PROPUESTA_A, EMP_A, "Propuesta que la dueña no ve", "propuesta"]);
    await base().query(SQL_CON_ID, [EN_CURSO_A, EMP_A, "Apuesta en curso de A", "en_curso"]);
    await base().query(SQL_CON_ID, [APROBADA_B, EMP_B, "Apuesta aprobada de B", "aprobada"]);
    await base().query("insert into iniciativa_historial (iniciativa_id, de_estado, a_estado, motivo, actor_id) values ($1, 'aprobada', 'en_curso', 'motivo interno', $2)", [EN_CURSO_A, U_C]);
  });

  it("la dueña de A ve su iniciativa en curso; no ve la propuesta ni nada de B", async () => {
    const a = await consultarComo<{ id: string; estado: string }>(base(), "authenticated", U_A, "select id, estado from iniciativas order by titulo");
    expect(a).toEqual([{ id: EN_CURSO_A, estado: "en_curso" }]);
    const directa = await consultarComo(base(), "authenticated", U_A, "select id from iniciativas where id = $1", [PROPUESTA_A]);
    expect(directa, "ni pidiéndola por su identificador").toEqual([]);
    const b = await consultarComo<{ id: string }>(base(), "authenticated", U_B, "select id from iniciativas");
    expect(b).toEqual([{ id: APROBADA_B }]);
  });

  it("de los siete estados, la base solo le esconde al dueño las propuestas; lo detenido y lo cerrado lo filtra la consulta de la aplicación", async () => {
    for (const e of ESTADOS) await base().query("insert into iniciativas (company_id, dominio, titulo, hipotesis, medida_exito, estado) values ($1, 'conversion', $2, 'h de prueba', 'm de prueba', $3)", [EMP_A, `rls ${e}`, e]);
    const vistos = await consultarComo<{ estado: string }>(base(), "authenticated", U_A, "select estado from iniciativas where titulo like 'rls %' order by estado");
    expect(vistos.map((v) => v.estado)).toEqual(ESTADOS.filter((e) => e !== "propuesta").sort());
    // La pantalla del dueño pide menos que lo que la política deja pasar: solo lo aprobado y lo que está en curso.
    const dePantalla = await consultarComo<{ estado: string }>(base(), "authenticated", U_A, "select estado from iniciativas where titulo like 'rls %' and estado = any($1::text[]) order by estado", [`{${ESTADOS_VISIBLES_CLIENTE.join(",")}}`]);
    expect(dePantalla.map((v) => v.estado)).toEqual([...ESTADOS_VISIBLES_CLIENTE].sort());
    expect(dePantalla.map((v) => v.estado)).not.toContain("propuesta");
  });

  it("una propuesta empieza a verla cuando se aprueba", async () => {
    await base().query("update iniciativas set estado = 'aprobada' where id = $1", [PROPUESTA_A]);
    const a = await consultarComo<{ id: string }>(base(), "authenticated", U_A, "select id from iniciativas where id = $1", [PROPUESTA_A]);
    expect(a).toEqual([{ id: PROPUESTA_A }]);
    await base().query("update iniciativas set estado = 'propuesta' where id = $1", [PROPUESTA_A]);
    expect(await consultarComo(base(), "authenticated", U_A, "select id from iniciativas where id = $1", [PROPUESTA_A])).toEqual([]);
  });

  it("el dueño no escribe: no propone, no aprueba su propia propuesta ni cambia lo que ve", async () => {
    await expect(
      consultarComo(base(), "authenticated", U_A, "insert into iniciativas (company_id, dominio, titulo, hipotesis, medida_exito, estado) values ($1, 'retencion', 'colada', 'h', 'm', 'aprobada')", [EMP_A])
    ).rejects.toThrow(/row-level security|permission denied/);
    const aprobarse = await consultarComo(base(), "authenticated", U_A, "update iniciativas set estado = 'aprobada' where id = $1 returning id", [PROPUESTA_A]);
    expect(aprobarse, "no ve la propuesta, así que no hay fila que cambiar").toEqual([]);
    const cambiar = await consultarComo(base(), "authenticated", U_A, "update iniciativas set titulo = 'cambiada por la dueña' where id = $1 returning id", [EN_CURSO_A]);
    expect(cambiar).toEqual([]);
    const borrar = await consultarComo(base(), "authenticated", U_A, "delete from iniciativas where id = $1 returning id", [EN_CURSO_A]);
    expect(borrar).toEqual([]);
    const r = await base().query<{ estado: string; titulo: string }>("select estado, titulo from iniciativas where id in ($1, $2) order by titulo", [PROPUESTA_A, EN_CURSO_A]);
    expect(r.rows).toEqual([{ estado: "en_curso", titulo: "Apuesta en curso de A" }, { estado: "propuesta", titulo: "Propuesta que la dueña no ve" }]);
  });

  it("el historial de decisiones es de la consultora: el dueño no lo lee ni lo escribe", async () => {
    expect(await consultarComo(base(), "authenticated", U_A, "select id from iniciativa_historial")).toEqual([]);
    await expect(
      consultarComo(base(), "authenticated", U_A, "insert into iniciativa_historial (iniciativa_id, a_estado, motivo) values ($1, 'continuar', 'colado')", [EN_CURSO_A])
    ).rejects.toThrow(/row-level security|permission denied/);
  });

  it("la consultora y la service role ven todo, propuestas incluidas; sin sesión no se ve nada", async () => {
    const total = (await base().query<{ n: number }>("select count(*)::int as n from iniciativas")).rows[0]!.n;
    const propuestas = (await base().query<{ n: number }>("select count(*)::int as n from iniciativas where estado = 'propuesta'")).rows[0]!.n;
    expect(propuestas).toBeGreaterThanOrEqual(2);
    const c = await consultarComo<{ n: number; p: number }>(base(), "authenticated", U_C, "select count(*)::int as n, count(*) filter (where estado = 'propuesta')::int as p from iniciativas");
    expect(c[0]).toEqual({ n: total, p: propuestas });
    const s = await consultarComo<{ n: number }>(base(), "service_role", null, "select count(*)::int as n from iniciativas");
    expect(s[0]!.n).toBe(total);
    const anon = await consultarComo<{ n: number }>(base(), "anon", null, "select count(*)::int as n from iniciativas");
    expect(anon[0]!.n).toBe(0);
    const h = await consultarComo<{ n: number }>(base(), "authenticated", U_C, "select count(*)::int as n from iniciativa_historial");
    expect(h[0]!.n).toBeGreaterThanOrEqual(1);
  });
});
