/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LAS VISTAS DEL CLIENTE SON PARA LEER.
 *
 * schema.sql crea `participants_cliente` y `claims_cliente` y solo retira los permisos a `public` y `anon`.
 * En Supabase los privilegios por defecto dan todo sobre lo nuevo también a `authenticated`, y una vista de
 * una sola tabla es actualizable: un dueño con su sesión podía escribir en `participants` a través de la
 * vista, saltándose RLS. supabase/migracion-vistas-cliente-solo-lectura.sql lo cierra.
 *
 * Límite: rol y claims los pone la prueba; no hay PostgREST. Que el proyecto real quede igual exige
 * aplicar la migración.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema, consultarComo } from "./aplicar";

const U_A = "00000000-0000-4000-8000-0000000000a1";
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const PART_A = "000000a9-0000-4000-8000-0000000000a9";

describe("Postgres embebido (PGlite), no Supabase: el dueño lee su gente por la vista y no escribe por ella", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    pg = (await baseConEsquema()).pg;
    await pg.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', $2::jsonb)", [U_A, JSON.stringify({ nombre: "Dueña A" })]);
    await pg.query("insert into companies (id, nombre) values ($1, 'Empresa A')", [EMP_A]);
    await pg.query("insert into memberships (user_id, company_id) values ($1, $2)", [U_A, EMP_A]);
    await pg.query("insert into participants (id, company_id, nombre, puesto, rol) values ($1, $2, 'Rosa Mamani', 'Caja', 'empleado')", [PART_A, EMP_A]);
  }, 180_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("leer funciona: la dueña ve a su gente por la vista", async () => {
    const filas = await consultarComo<{ nombre: string }>(pg!, "authenticated", U_A, "select nombre from participants_cliente");
    expect(filas).toEqual([{ nombre: "Rosa Mamani" }]);
  });

  it("escribir no: ni cambiar, ni añadir, ni borrar a través de la vista", async () => {
    await expect(consultarComo(pg!, "authenticated", U_A, "update participants_cliente set rol = 'dueno' where id = $1", [PART_A])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "insert into participants_cliente (company_id, nombre) values ($1, 'Colado')", [EMP_A])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "delete from participants_cliente where id = $1", [PART_A])).rejects.toThrow(/permission denied/);
    const sigue = await pg!.query<{ rol: string }>("select rol from participants where id = $1", [PART_A]);
    expect(sigue.rows[0]!.rol).toBe("empleado");
  });

  it("tampoco por la vista de afirmaciones", async () => {
    await expect(consultarComo(pg!, "authenticated", U_A, "delete from claims_cliente")).rejects.toThrow(/permission denied|cannot delete from view/);
  });
});
