/**
 * EL PASO A PRODUCCIÓN, CUANDO NO QUEDA NADA PENDIENTE (19-10-2026).
 *
 * El archivo que se pega en el editor SQL de Supabase lo arma scripts/produccion/armar-sql.ts: las migraciones que
 * producción no tiene, en orden, dentro de una sola transacción. Hasta el 19-10-2026 esta prueba ensayaba la tanda de
 * la estrategia y RENASER OS sobre una base parecida a la producción de ese día: que entraba completa, que no tocaba un
 * dato, que se podía ejecutar dos veces, que los permisos cerrados seguían cerrados y que un check viejo más estrecho
 * lo detenía todo. Ese ensayo está en el historial (commit 4fdb45b): cuando nazca una migración nueva, se llenan las
 * listas de armar-sql.ts con lo suyo y se vuelve a escribir aquí su ensayo, a partir de aquel.
 *
 * Hoy producción tiene todo, comprobado en la base real el 19-10-2026: la estrategia ya estaba (el registro la daba por
 * pendiente sin estarlo) y RENASER OS se aplicó ese día. Lo que vale siempre, y se comprueba aquí:
 *  - nada pendiente quiere decir nada pendiente: el registro cubre todo el orden y no nombra archivos que no existen;
 *  - sin nada pendiente, el script lo dice en vez de escribir un archivo vacío que alguien pegue;
 *  - las listas de la próxima tanda nacen vacías (una lista vieja haría que la fila final contara tablas que ya estaban);
 *  - la base que describe el registro (Postgres embebido, no Supabase) tiene lo que se dice que producción tiene.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, aplicarArchivo, leerOrden, consultarComo, CARPETA_SUPABASE, RUTA_ENTORNO } from "./aplicar";
import {
  armarSql, migracionesPendientes, YA_EN_PRODUCCION, TABLAS_NUEVAS, COLUMNAS_NUEVAS, CHECKS_AMPLIADOS, FUNCIONES_SOLO_SERVIDOR, QUE_HACE, NADA_PENDIENTE,
} from "../../scripts/produccion/armar-sql";

/** Las 13 migraciones de la rama del 13-10, aplicadas en producción el 15-10-2026. */
const DEL_15_10 = [
  "migracion-autoridad.sql", "migracion-claims-archivo.sql", "migracion-evidencia-dimensiones.sql", "migracion-entrada-y-direccion.sql",
  "migracion-jobs-cliente-lectura.sql", "migracion-plan-kpi-linea-base.sql", "migracion-excelencia-y-cartera.sql", "migracion-revision-revisada.sql",
  "migracion-cifra-desplazada.sql", "migracion-acciones-solo-por-la-api.sql", "migracion-procesos-importados.sql", "migracion-lineas-producto-cliente.sql",
  "migracion-vistas-cliente-solo-lectura.sql",
];

/** La del 16-10 que deja entrar al cliente, y las dos que el 19-10-2026 se comprobaron en la base real. */
const DEL_16_10 = ["migracion-entrar-hoy.sql"];
const DEL_19_10 = ["migracion-estrategia.sql", "migracion-renaser-os.sql"];

const U_A = "00000000-0000-4000-8000-0000000000a1";

describe("el archivo de producción: hoy no hay nada pendiente", () => {
  it("lo del 15-10, el 16-10 y el 19-10 cuenta como aplicado, y el registro cubre todo el orden", () => {
    for (const a of [...DEL_15_10, ...DEL_16_10, ...DEL_19_10]) expect(YA_EN_PRODUCCION, a).toContain(a);
    expect(migracionesPendientes()).toEqual([]);
  });

  it("el registro no nombra archivos que no están en el orden (un nombre mal escrito daría por aplicada una migración que no existe)", () => {
    const orden = leerOrden().map((e) => e.archivo);
    for (const a of YA_EN_PRODUCCION) expect(orden, a).toContain(a);
    expect(new Set(YA_EN_PRODUCCION).size, "sin repetidos").toBe(YA_EN_PRODUCCION.length);
  });

  it("sin nada pendiente, armarSql lo dice en vez de escribir un archivo vacío", () => {
    expect(() => armarSql()).toThrow(NADA_PENDIENTE);
  });

  it("las listas de la próxima tanda nacen vacías", () => {
    expect(CHECKS_AMPLIADOS).toEqual([]);
    expect(TABLAS_NUEVAS).toEqual([]);
    expect(COLUMNAS_NUEVAS).toEqual([]);
    expect(FUNCIONES_SOLO_SERVIDOR).toEqual([]);
    expect(QUE_HACE).toEqual([]);
  });
});

describe("Postgres embebido (PGlite), no Supabase: la base que describe el registro", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    pg = await crearBase();
    await aplicarArchivo(pg, RUTA_ENTORNO);
    for (const e of leerOrden()) {
      if (!YA_EN_PRODUCCION.includes(e.archivo)) continue;
      await aplicarArchivo(pg, path.join(CARPETA_SUPABASE, e.archivo), e.archivo);
    }
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("tiene la estrategia y RENASER OS, con RLS en todas sus tablas", async () => {
    const { rows } = await pg!.query<{ relname: string; rls: boolean }>(
      "select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and (c.relname like 'os\\_%' or c.relname like 'estrategia%') order by 1"
    );
    expect(rows.filter((r) => r.relname.startsWith("os_"))).toHaveLength(16);
    expect(rows.filter((r) => r.relname.startsWith("estrategia"))).toHaveLength(3);
    for (const r of rows) expect(r.rls, r.relname).toBe(true);
  });

  it("el navegador no lee las tablas de RENASER OS ni ejecuta las funciones de servidor", async () => {
    await expect(consultarComo(pg!, "authenticated", U_A, "select id from os_tareas")).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "select os_regla_bloqueos()")).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "select aprobar_estrategia(gen_random_uuid(), $1, '{}'::jsonb, null)", [U_A])).rejects.toThrow(/permission denied/);
  });
});
