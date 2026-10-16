/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LA LÍNEA BASE TIENE VERSIONES Y NINGUNA SE PISA (R14.1, R14.2).
 *
 * Tres congelaciones del punto de partida dejan tres filas (versiones 1, 2 y 3), una sola vigente, cada
 * una apuntando a la que reemplaza. Cada corte guarda la versión que estaba vigente cuando se midió y
 * NO cambia cuando después se vuelve a congelar: así una corrección posterior no altera comparaciones
 * históricas. Las actas de aceptación admiten varias por versión (no hay unique) y el cliente lee solo
 * las de su empresa; escribirlas es cosa del consultor o del servidor.
 *
 * Qué no prueba: PostgREST, Auth ni Storage. El rol y los claims los pone la prueba con set_config.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema, consultarComo } from "./aplicar";
import { NOTA_JURIDICA, aceptacionDelDueno, constanciaDeLaConsultora } from "@/lib/actas";
import { vecesAnotado, type MedicionAnotada } from "@/lib/mapa-empresa";

const U_A = "00000000-0000-4000-8000-0000000000a1"; // dueña de A
const U_B = "00000000-0000-4000-8000-0000000000b1"; // dueño de B
const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultor
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const EMP_C = "0000000c-0000-4000-8000-00000000000c"; // solo corrige su punto de partida, nunca mide un corte

type Fila = { id: string; tipo: string; numero: number; version: number; vigente: boolean; reemplaza_a: string | null; linea_base_id: string | null; hash_contenido: string | null; valores: Record<string, number> };

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

const congelar = (empresa: string, tipo: "linea_base" | "corte", valores: Record<string, number>) =>
  base()
    .query<Fila>(
      "select id, tipo, numero, version, vigente, reemplaza_a, linea_base_id, hash_contenido, valores from congelar_medicion($1, $2, $3::jsonb, '{}'::jsonb, null, $4)",
      [empresa, tipo, JSON.stringify(valores), U_C]
    )
    .then((r) => r.rows[0]);

const bases = () =>
  base()
    .query<Fila>("select id, tipo, numero, version, vigente, reemplaza_a, linea_base_id, hash_contenido, valores from mediciones where company_id = $1 and tipo = 'linea_base' order by version", [EMP_A])
    .then((r) => r.rows);

describe("Postgres embebido (PGlite), no Supabase: tres congelaciones → versiones 1, 2 y 3, una vigente", () => {
  let v1: Fila, v2: Fila, v3: Fila, corte1: Fila, corte2: Fila, corte3: Fila;

  it("la primera es la versión 1, vigente, sin reemplazar a nadie", async () => {
    v1 = await congelar(EMP_A, "linea_base", { venta_mes: 40000, ganancia_mes: 4000 });
    expect(v1).toMatchObject({ tipo: "linea_base", numero: 0, version: 1, vigente: true, reemplaza_a: null, linea_base_id: null });
    expect(v1.hash_contenido).toMatch(/^[0-9a-f]{32}$/);
  });

  it("el corte 1 referencia la versión 1, la vigente en ese momento", async () => {
    corte1 = await congelar(EMP_A, "corte", { venta_mes: 42000, ganancia_mes: 4500 });
    expect(corte1).toMatchObject({ tipo: "corte", numero: 1, linea_base_id: v1.id });
  });

  it("la segunda congelación conserva la primera: versión 2 vigente, versión 1 reemplazada, y el motivo se guarda aparte", async () => {
    v2 = await congelar(EMP_A, "linea_base", { venta_mes: 41000, ganancia_mes: 3800, costo_fijo_mes: 12000 });
    // La función no recibe el motivo: lo guarda la ruta, SOLO en esa columna (igual que aquí).
    await base().query("update mediciones set motivo_version = $1 where id = $2", ["costos completos tras conciliar con el banco", v2.id]);
    corte2 = await congelar(EMP_A, "corte", { venta_mes: 43000, ganancia_mes: 4800 });
    const todas = await bases();
    expect(todas.map((b) => [b.version, b.vigente])).toEqual([[1, false], [2, true]]);
    expect(todas[1].reemplaza_a).toBe(v1.id);
    expect(corte2.linea_base_id).toBe(v2.id);
  });

  it("la tercera deja versiones 1, 2 y 3 con una sola vigente y la cadena de reemplazos completa", async () => {
    v3 = await congelar(EMP_A, "linea_base", { venta_mes: 40000, ganancia_mes: 4000 });
    corte3 = await congelar(EMP_A, "corte", { venta_mes: 44000, ganancia_mes: 5000 });
    const todas = await bases();
    expect(todas.map((b) => b.version)).toEqual([1, 2, 3]);
    expect(todas.filter((b) => b.vigente).map((b) => b.version)).toEqual([3]);
    expect(todas.map((b) => b.reemplaza_a)).toEqual([null, v1.id, v2.id]);
    expect(corte3.linea_base_id).toBe(v3.id);
    const motivo = await base().query<{ motivo_version: string | null }>("select motivo_version from mediciones where id = $1", [v2.id]);
    expect(motivo.rows[0].motivo_version).toBe("costos completos tras conciliar con el banco");
  });

  it("cada corte sigue apuntando a la versión con la que se midió: recongelar no los mueve a la nueva", async () => {
    const r = await base().query<{ numero: number; linea_base_id: string }>("select numero, linea_base_id from mediciones where company_id = $1 and tipo = 'corte' order by numero", [EMP_A]);
    expect(r.rows).toEqual([
      { numero: 1, linea_base_id: v1.id },
      { numero: 2, linea_base_id: v2.id },
      { numero: 3, linea_base_id: v3.id },
    ]);
  });

  it("los valores de la versión 1 son los mismos de cuando se congeló: nada los actualizó", async () => {
    const r = await base().query<{ valores: Record<string, number>; derivados: Record<string, number> }>("select valores, derivados from mediciones where id = $1", [v1.id]);
    expect(r.rows[0].valores).toEqual({ venta_mes: 40000, ganancia_mes: 4000 });
    expect(r.rows[0].derivados).toEqual({});
  });

  it("la huella es del contenido: la versión 3 congeló lo mismo que la 1 y comparte huella; la 2, distinta", async () => {
    expect(v3.hash_contenido).toBe(v1.hash_contenido);
    expect(v2.hash_contenido).not.toBe(v1.hash_contenido);
  });

  it("no puede haber dos puntos de partida vigentes a la vez: el índice parcial lo impide aunque se intente a mano", async () => {
    await expect(
      base().query("insert into mediciones (company_id, tipo, numero, valores, version, vigente) values ($1, 'linea_base', 0, '{}'::jsonb, 9, true)", [EMP_A])
    ).rejects.toThrow(/mediciones_una_base_vigente|duplicate key/);
    // Una reemplazada sí puede convivir: es historial.
    const n = await base().query<{ n: number }>("select count(*)::int as n from mediciones where company_id = $1 and tipo = 'linea_base'", [EMP_A]);
    expect(n.rows[0].n).toBe(3);
  });

  it("un corte sin punto de partida (otra empresa) nace con linea_base_id null: no se inventa referencia", async () => {
    const c = await congelar(EMP_B, "corte", { venta_mes: 9000 });
    expect(c.linea_base_id).toBeNull();
  });

  it("corregir el punto de partida no infla las anotaciones: con las filas reales, 3 versiones y 3 cortes son 4; 3 versiones sin corte son 1", async () => {
    // Lo que lee la radiografía (src/lib/mapa-empresa.ts) y la regla que le aplica, sobre las filas que dejó la función de base.
    const filas = async (empresa: string) => (await base().query<MedicionAnotada>("select tipo, valores, version, vigente from mediciones where company_id = $1", [empresa])).rows;
    // EMP_A tiene tres versiones (una vigente) y tres cortes: contando todas las filas saldrían 6.
    const deA = await filas(EMP_A);
    expect(deA).toHaveLength(6);
    expect(vecesAnotado(deA).get("venta_mes")).toBe(4);
    // Una empresa que corrigió tres veces su punto de partida y nunca midió un corte: una anotación, no tres.
    await base().query("insert into companies (id, nombre) values ($1, 'Panadería (sintética)')", [EMP_C]);
    for (const venta of [30000, 31000, 30500]) await congelar(EMP_C, "linea_base", { venta_mes: venta });
    const deC = await filas(EMP_C);
    expect(deC.map((f) => f.vigente).filter(Boolean)).toHaveLength(1);
    expect(deC).toHaveLength(3);
    expect(vecesAnotado(deC).get("venta_mes")).toBe(1);
  });
});

describe("Postgres embebido (PGlite), no Supabase: actas_aceptacion — varias por versión, y el cliente lee solo las suyas", () => {
  let vigenteA: string;
  let vigenteB: string;

  it("el servidor guarda dos actas sobre la misma versión (dueña y consultora): no hay unique por versión", async () => {
    vigenteA = (await base().query<{ id: string }>("select id from mediciones where company_id = $1 and tipo = 'linea_base' and vigente", [EMP_A])).rows[0].id;
    vigenteB = (await congelar(EMP_B, "linea_base", { venta_mes: 9000, ganancia_mes: 900 })).id;
    await base().query(
      `insert into actas_aceptacion (company_id, tipo, referencia_id, version, contenido, hash_contenido, aceptado_por, aceptado_nombre, aceptado_rol)
       values ($1, 'linea_base', $2, 3, '{"venta_mes":40000}'::jsonb, 'h1', $3, 'Dueña A', 'dueno'),
              ($1, 'linea_base', $2, 3, '{"venta_mes":40000}'::jsonb, 'h1', $4, 'Consultora', 'consultor'),
              ($5, 'linea_base', $6, 1, '{"venta_mes":9000}'::jsonb, 'h2', $7, 'Dueño B', 'dueno')`,
      [EMP_A, vigenteA, U_A, U_C, EMP_B, vigenteB, U_B]
    );
    const n = await base().query<{ n: number }>("select count(*)::int as n from actas_aceptacion where referencia_id = $1 and version = 3", [vigenteA]);
    expect(n.rows[0].n).toBe(2);
  });

  it("la nota jurídica nace con la fila y dice lo mismo que el código", async () => {
    const r = await base().query<{ nota_juridica: string }>("select nota_juridica from actas_aceptacion where company_id = $1 limit 1", [EMP_A]);
    expect(r.rows[0].nota_juridica).toBe(NOTA_JURIDICA);
  });

  it("la dueña de A ve solo las actas de A; el dueño de B, solo la de B; un anónimo, ninguna", async () => {
    const deA = await consultarComo<{ aceptado_nombre: string }>(base(), "authenticated", U_A, "select aceptado_nombre from actas_aceptacion order by aceptado_nombre");
    expect(deA.map((f) => f.aceptado_nombre)).toEqual(["Consultora", "Dueña A"]);
    const deB = await consultarComo<{ aceptado_nombre: string }>(base(), "authenticated", U_B, "select aceptado_nombre from actas_aceptacion");
    expect(deB.map((f) => f.aceptado_nombre)).toEqual(["Dueño B"]);
    expect(await consultarComo(base(), "anon", null, "select id from actas_aceptacion")).toEqual([]);
  });

  it("la dueña también lee solo las mediciones de su empresa, con sus columnas de versión", async () => {
    const r = await consultarComo<{ company_id: string; version: number; vigente: boolean }>(base(), "authenticated", U_A, "select company_id, version, vigente from mediciones where tipo = 'linea_base' order by version");
    expect(r.map((f) => f.company_id)).toEqual([EMP_A, EMP_A, EMP_A]);
    expect(r.map((f) => f.vigente)).toEqual([false, false, true]);
  });

  it("el cliente no escribe actas desde su sesión (no hay política de escritura); el consultor sí", async () => {
    await expect(
      consultarComo(base(), "authenticated", U_A, "insert into actas_aceptacion (company_id, tipo, referencia_id, version, contenido, hash_contenido) values ($1, 'linea_base', $2, 3, '{}'::jsonb, 'h')", [EMP_A, vigenteA])
    ).rejects.toThrow(/row-level security/);
    await consultarComo(base(), "authenticated", U_C, "insert into actas_aceptacion (company_id, tipo, referencia_id, version, contenido, hash_contenido, aceptado_por, aceptado_rol) values ($1, 'corte', $2, 1, '{}'::jsonb, 'h3', $3, 'consultor')", [EMP_B, vigenteB, U_C]);
    const n = await base().query<{ n: number }>("select count(*)::int as n from actas_aceptacion where company_id = $1", [EMP_B]);
    expect(n.rows[0].n).toBe(2);
  });

  it("el tipo de acta tiene candado: «contrato» no entra", async () => {
    await expect(
      base().query("insert into actas_aceptacion (company_id, tipo, referencia_id, contenido, hash_contenido) values ($1, 'contrato', $2, '{}'::jsonb, 'h')", [EMP_A, vigenteA])
    ).rejects.toThrow(/check/i);
  });

  it("con las filas reales: la aceptación es la de la dueña y la de la consultora es constancia; una versión con solo constancia NO está aceptada", async () => {
    type ActaLeida = { referencia_id: string; aceptado_rol: string | null; aceptado_nombre: string | null; aceptado_at: string };
    // La fecha como la entrega la API (ISO): la regla elige la más reciente por instante, no por orden de llegada.
    const leer = async () =>
      (await base().query<ActaLeida>(
        `select referencia_id, aceptado_rol, aceptado_nombre, to_char(aceptado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as aceptado_at
           from actas_aceptacion where company_id = $1 order by aceptado_rol`,
        [EMP_A]
      )).rows;
    const actas = await leer();
    // La consultora va primero en la lista (orden por rol): antes bastaba eso para dar el punto de partida por aceptado.
    expect(actas[0].aceptado_rol).toBe("consultor");
    expect(aceptacionDelDueno(actas, vigenteA)?.aceptado_nombre).toBe("Dueña A");
    expect(constanciaDeLaConsultora(actas, vigenteA)?.aceptado_nombre).toBe("Consultora");

    const anterior = (await base().query<{ id: string }>("select id from mediciones where company_id = $1 and tipo = 'linea_base' and version = 2", [EMP_A])).rows[0].id;
    await base().query(
      `insert into actas_aceptacion (company_id, tipo, referencia_id, version, contenido, hash_contenido, aceptado_por, aceptado_nombre, aceptado_rol)
       values ($1, 'linea_base', $2, 2, '{}'::jsonb, 'h4', $3, 'Consultora', 'consultor')`,
      [EMP_A, anterior, U_C]
    );
    const despues = await leer();
    expect(aceptacionDelDueno(despues, anterior), "la consultora dejó constancia; la dueña aún no aceptó esa versión").toBeNull();
    expect(constanciaDeLaConsultora(despues, anterior)?.aceptado_nombre).toBe("Consultora");
  });
});
