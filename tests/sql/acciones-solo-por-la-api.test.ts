/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: EL DUEÑO NO SE VERIFICA A SÍ MISMO POR LA PUERTA DE ATRÁS.
 *
 * schema.sql traía la política `cliente_actions_upd`: cualquier miembro de la empresa podía actualizar
 * CUALQUIER columna de sus acciones hablando directo con la base, sin pasar por la aplicación. Un
 * verificador lo reprodujo el 13-10-2026: como dueño dejó una acción en «verificado», con fecha de
 * verificación y marcada como prioridad, sin prueba, sin autoridad y sin historial. La regla del plan
 * (reportado no es verificado; límite de frentes; quién decidió qué) vive en src/lib/plan-intervencion.ts
 * y esa política la dejaba sin efecto.
 *
 * supabase/migracion-acciones-solo-por-la-api.sql retira la política y el permiso de escritura del rol del
 * navegador. Aquí se prueba el antes y el después sobre el mismo motor, y que leer sigue funcionando.
 *
 * Límite: el rol y los claims los pone la prueba (no un JWT verificado por Auth) y no hay PostgREST. Lo
 * que aquí se rechaza, se rechaza en Postgres; que el proyecto real quede igual exige aplicar la migración.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema, consultarComo, crearBase, aplicarArchivo, leerOrden, CARPETA_SUPABASE, RUTA_ENTORNO } from "./aplicar";

const U_A = "00000000-0000-4000-8000-0000000000a1";
const U_B = "00000000-0000-4000-8000-0000000000b1";
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const ACC_A = "000000ac-0000-4000-8000-0000000000a1";
const MIGRACION = "migracion-acciones-solo-por-la-api.sql";

async function sembrar(pg: PGlite) {
  await pg.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', $2::jsonb), ($3, 'dueno-b@prueba.local', $4::jsonb)",
    [U_A, JSON.stringify({ nombre: "Dueña A" }), U_B, JSON.stringify({ nombre: "Dueño B" })]
  );
  await pg.query("insert into companies (id, nombre) values ($1, 'Empresa A'), ($2, 'Empresa B')", [EMP_A, EMP_B]);
  await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [U_A, EMP_A, U_B, EMP_B]);
  await pg.query("insert into actions (id, company_id, accion, estado) values ($1, $2, 'Tabla de costos', 'reportado')", [ACC_A, EMP_A]);
}

const estadoDe = async (pg: PGlite) =>
  (await pg.query<{ estado: string; verificado_at: string | null; es_prioridad: boolean }>("select estado, verificado_at, es_prioridad from actions where id = $1", [ACC_A])).rows[0]!;

describe("Postgres embebido (PGlite), no Supabase: antes de la migración, la puerta de atrás existía", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    // Todo el esquema MENOS la migración que cierra la puerta: así se demuestra que el hueco era real.
    pg = await crearBase();
    await aplicarArchivo(pg, RUTA_ENTORNO);
    for (const e of leerOrden()) {
      if (e.archivo === MIGRACION) continue;
      await aplicarArchivo(pg, path.join(CARPETA_SUPABASE, e.archivo), e.archivo);
    }
    await sembrar(pg);
  }, 180_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("la dueña dejaba su propia acción en «verificado» y como prioridad, sin pasar por la aplicación", async () => {
    await consultarComo(pg!, "authenticated", U_A, "update actions set estado = 'verificado', verificado_at = now(), es_prioridad = true where id = $1", [ACC_A]);
    const a = await estadoDe(pg!);
    expect(a.estado).toBe("verificado");
    expect(a.verificado_at).not.toBeNull();
    expect(a.es_prioridad).toBe(true);
  });
});

describe("Postgres embebido (PGlite), no Supabase: con la migración, las acciones solo cambian por la aplicación", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    pg = (await baseConEsquema()).pg;
    await sembrar(pg);
  }, 180_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("la dueña ya no puede actualizar su acción hablando directo con la base", async () => {
    await expect(
      consultarComo(pg!, "authenticated", U_A, "update actions set estado = 'verificado', verificado_at = now(), es_prioridad = true where id = $1", [ACC_A])
    ).rejects.toThrow(/permission denied/);
    const a = await estadoDe(pg!);
    expect(a).toMatchObject({ estado: "reportado", verificado_at: null, es_prioridad: false });
  });

  it("tampoco puede crear ni borrar acciones, ni escribirse un historial a su favor", async () => {
    await expect(consultarComo(pg!, "authenticated", U_A, "insert into actions (company_id, accion, estado) values ($1, 'Colada', 'verificado')", [EMP_A])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "delete from actions where id = $1", [ACC_A])).rejects.toThrow(/permission denied/);
    await expect(
      consultarComo(pg!, "authenticated", U_A, "insert into accion_historial (action_id, accion, motivo) values ($1, 'verificar', 'me lo apruebo yo')", [ACC_A])
    ).rejects.toThrow(/permission denied/);
  });

  it("leer sigue igual: la dueña ve su acción y el dueño de otra empresa no la ve", async () => {
    const suyas = await consultarComo<{ id: string }>(pg!, "authenticated", U_A, "select id from actions");
    expect(suyas.map((r) => r.id)).toEqual([ACC_A]);
    const ajenas = await consultarComo<{ id: string }>(pg!, "authenticated", U_B, "select id from actions");
    expect(ajenas).toEqual([]);
  });

  it("la credencial del servidor (la que usa la aplicación) sigue pudiendo escribir", async () => {
    await consultarComo(pg!, "service_role", null, "update actions set estado = 'verificado', verificado_at = now() where id = $1", [ACC_A]);
    expect((await estadoDe(pg!)).estado).toBe("verificado");
  });
});
