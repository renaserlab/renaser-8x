/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: ¿APLICA TODO EL SQL DEL REPOSITORIO SOBRE UNA BASE VACÍA?
 *
 * Hasta hoy la única forma de saberlo era pegar cada archivo en el editor SQL de producción. Esta prueba
 * lo hace en una base en memoria, en el orden de supabase/orden-aplicacion.json. Si algo no aplica, la
 * prueba FALLA con archivo, sentencia y mensaje de Postgres: eso es deriva real entre lo que el repo dice
 * y lo que una base puede ejecutar, y hay que reportarla, no esconderla.
 *
 * Límites, rotulados: no prueba PostgREST, Auth ni Storage. Lo mínimo que Supabase da por hecho (roles,
 * auth.uid(), storage.foldername(), la publicación de realtime) lo imita tests/sql/_entorno-supabase.sql.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { existsSync } from "fs";
import path from "path";
import { aplicarTodo, archivosSqlDe, baseConEsquema, CARPETA_SUPABASE, dividirSentencias, leerOrden, type Resultado } from "./aplicar";

describe("Postgres embebido (PGlite), no Supabase: el orden de aplicación cubre todo el SQL del repo", () => {
  const orden = leerOrden();

  it("todo archivo .sql de supabase/ está en el orden (uno fuera de la lista es uno sin verificar)", () => {
    const enOrden = new Set(orden.map((e) => e.archivo));
    const fuera = archivosSqlDe().filter((a) => !enOrden.has(a));
    expect(fuera, `archivos SQL sin entrada en orden-aplicacion.json: ${fuera.join(", ")}`).toEqual([]);
  });

  it("todo archivo del orden existe, salvo los marcados como opcionales", () => {
    const faltan = orden.filter((e) => !e.opcional && !existsSync(path.join(CARPETA_SUPABASE, e.archivo))).map((e) => e.archivo);
    expect(faltan).toEqual([]);
  });

  it("schema.sql va primero y cada archivo del que otro depende aparece antes", () => {
    expect(orden[0].archivo).toBe("schema.sql");
    const vistos = new Set<string>();
    for (const e of orden) {
      for (const d of e.depende_de ?? []) {
        // Una dependencia que no es un archivo (una tabla que nadie crea) se documenta en el JSON; no se ordena.
        if (!d.endsWith(".sql")) continue;
        expect(vistos.has(d), `${e.archivo} depende de ${d}, que va después o no está en el orden`).toBe(true);
      }
      vistos.add(e.archivo);
    }
  });
});

describe("Postgres embebido (PGlite), no Supabase: el divisor de sentencias", () => {
  it("no parte un bloque $$ con punto y coma dentro, ni una cadena, ni un comentario", () => {
    const sql = [
      "create function f() returns int language plpgsql as $$ begin return 1; end $$;",
      "select 'a;b'; -- fin; de línea",
      "/* ; */ select 2;",
    ].join("\n");
    expect(dividirSentencias(sql)).toHaveLength(3);
  });

  it("respeta una etiqueta de dólar ($cuerpo$) y la comilla doblada dentro de una cadena", () => {
    const sql = "create function g() returns text as $cuerpo$ select 'x;y' $cuerpo$ language sql;\nselect 'it''s; fine';";
    expect(dividirSentencias(sql)).toHaveLength(2);
  });

  it("un $ suelto no abre bloque: la sentencia se parte y Postgres dirá dónde está el error", () => {
    const sql = "create function f() returns int as $ begin return 1; end $;";
    expect(dividirSentencias(sql).length).toBeGreaterThan(1);
  });

  it("ignora trozos que son solo comentarios", () => {
    expect(dividirSentencias("-- solo comentario\n\n/* otro */")).toEqual([]);
  });
});

describe("Postgres embebido (PGlite), no Supabase: todo el SQL del repo aplica sobre una base vacía", () => {
  let pg: PGlite | undefined;
  let resultado: Resultado | undefined;
  let fallo: unknown;

  beforeAll(async () => {
    try {
      const r = await baseConEsquema();
      pg = r.pg;
      resultado = r;
      for (const a of r.avisos) console.warn(`[orden-aplicacion] ${a.archivo}: ${a.motivo}`);
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

  it("el stub y todos los archivos del orden aplican sin error (si falla, el mensaje dice archivo, sentencia y causa)", () => {
    base();
    const archivos = resultado?.aplicados.map((a) => a.archivo) ?? [];
    expect(archivos[0]).toBe("_entorno-supabase.sql");
    expect(archivos).toContain("schema.sql");
    expect(archivos).toContain("migracion-decisiones.sql");
  });

  it("existen las funciones que el código llama por RPC", async () => {
    const esperadas = [
      "take_job", "heartbeat_jobs", "recover_stale_jobs", "refresh_company_stats", "guardar_proceso",
      "es_consultor", "mis_empresas", "archivos_de_empresa", "handle_new_user",
      "consumir_cupo", "limpiar_rate_limits", "aprobar_documento",
      "circuito_fallo", "circuito_exito", "circuito_abierto",
      "congelar_medicion", "eventos_recientes",
      "torre_por_agente", "torre_totales", "tokens_de_empresa", "cadena_de_trabajo", "marcar_agente",
    ];
    const r = await base().query<{ proname: string }>(
      "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'"
    );
    const tiene = new Set(r.rows.map((x) => x.proname));
    expect(esperadas.filter((f) => !tiene.has(f)), "funciones que el código llama y la base no tiene").toEqual([]);
  });

  it("hay al menos las 41 tablas que el repo crea y las dos vistas seguras del cliente", async () => {
    const t = await base().query<{ n: number }>("select count(*)::int as n from pg_tables where schemaname = 'public'");
    expect(t.rows[0].n).toBeGreaterThanOrEqual(41);
    const v = await base().query<{ viewname: string }>("select viewname from pg_views where schemaname = 'public'");
    expect(v.rows.map((x) => x.viewname)).toEqual(expect.arrayContaining(["claims_cliente", "participants_cliente"]));
  });

  it("toda tabla de public tiene RLS activada (una tabla sin RLS queda abierta a PostgREST para cualquier sesión)", async () => {
    const r = await base().query<{ relname: string }>(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1"
    );
    expect(r.rows.map((x) => x.relname), "tablas sin RLS").toEqual([]);
  });

  it("volver a aplicar todo sobre la misma base no falla: schema.sql:3 promete que es idempotente", async () => {
    const r = await aplicarTodo(base());
    expect(r.aplicados.length).toBeGreaterThan(1);
  }, 180_000);
});
