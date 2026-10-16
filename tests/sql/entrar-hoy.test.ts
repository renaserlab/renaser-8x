/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: LO QUE EL CLIENTE LLENA HOY (migracion-entrar-hoy.sql, 16-10-2026).
 *
 * Qué se comprueba, sobre TODO el esquema del repositorio:
 *  - la migración aplica dos veces seguidas y ninguna tabla queda sin RLS;
 *  - cada check rechaza lo que debe (modelo inventado o tres modelos, hora 25:00, monto y rango a la vez, «no lo sé»
 *    con monto, segunda solicitud activa de la misma sección, «de cada 10» = 11, segundo precio sin su tipo, unidades
 *    exactas y en rango a la vez, clave de marca mal formada) y deja pasar lo que debe;
 *  - RLS: cada dueño lee solo lo suyo en las cuatro tablas legibles y no escribe en ninguna; no lee ruta_marcas; no
 *    ve las solicitudes retiradas; la consultora todo; un anónimo, nada;
 *  - la vista lineas_producto_cliente tiene exactamente COLUMNAS_PARA_DUENO, sin la decisión, y no se escribe por ella;
 *  - borrar la empresa vacía las seis tablas en cascada.
 *
 * Límite: rol y claims los pone la prueba; no hay PostgREST. Que producción quede igual exige aplicar la migración.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema, consultarComo, dividirSentencias, CARPETA_SUPABASE, type Rol } from "./aplicar";
import { readFileSync } from "fs";
import { COLUMNAS_PARA_DUENO } from "@/lib/producto";

const U_A = "00000000-0000-4000-8000-0000000000a1";
const U_B = "00000000-0000-4000-8000-0000000000b1";
const U_C = "00000000-0000-4000-8000-0000000000c1";
const EMP_A = "0000000a-0000-4000-8000-00000000000a";
const EMP_B = "0000000b-0000-4000-8000-00000000000b";
const TABLAS = ["costos_mes", "ficha_negocio", "operaciones_moneda", "solicitudes_cliente", "ruta_marcas", "process_versiones"] as const;
const LEGIBLES = ["costos_mes", "ficha_negocio", "operaciones_moneda", "solicitudes_cliente", "process_versiones"] as const;
const MIGRACION = path.join(CARPETA_SUPABASE, "migracion-entrar-hoy.sql");

describe("Postgres embebido (PGlite), no Supabase: migracion-entrar-hoy.sql", () => {
  let pg: PGlite | undefined;
  const db = () => {
    if (!pg) throw new Error("no hay base: beforeAll no la creó");
    return pg;
  };
  /** El código de Postgres con que falla una sentencia, o null si pasó. */
  const codigo = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await db().query(sql, params);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
  };
  const codigoComo = async (rol: Rol, sub: string | null, sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await consultarComo(db(), rol, sub, sql, params);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
  };
  const cuenta = async (rol: Rol, sub: string | null, tabla: string): Promise<number> =>
    (await consultarComo<{ n: number }>(db(), rol, sub, `select count(*)::int as n from ${tabla}`))[0]!.n;

  beforeAll(async () => {
    pg = (await baseConEsquema()).pg;
    await pg.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', '{}'::jsonb), ($2, 'dueno-b@prueba.local', '{}'::jsonb), ($3, 'consultora@prueba.local', '{}'::jsonb)",
      [U_A, U_B, U_C]
    );
    await pg.query("update users set rol = 'consultor' where id = $1", [U_C]);
    await pg.query("insert into companies (id, nombre) values ($1, 'Jeans Ficticios A'), ($2, 'Boutique Ficticia B')", [EMP_A, EMP_B]);
    await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [U_A, EMP_A, U_B, EMP_B]);
    for (const emp of [EMP_A, EMP_B]) {
      await pg.query("insert into costos_mes (company_id, tipo, nombre, monto, estado) values ($1, 'fijo', 'Alquiler', 1800, 'contado')", [emp]);
      await pg.query("insert into ficha_negocio (company_id, historia) values ($1, '{\"anio_inicio\": {\"valor\": 2015, \"estado\": \"contado\"}}'::jsonb)", [emp]);
      await pg.query("insert into operaciones_moneda (company_id, moneda, monto, tc_cotizado) values ($1, 'CLP', 1000000, 0.0041)", [emp]);
      await pg.query("insert into solicitudes_cliente (company_id, seccion) values ($1, 'productos')", [emp]);
      await pg.query("insert into solicitudes_cliente (company_id, seccion, estado, retirada_at) values ($1, 'historia', 'retirada', now())", [emp]);
      await pg.query("insert into ruta_marcas (company_id, clave, valor, nota) values ($1, 'diagnostico.compuerta', 'ambar', 'falta la línea base')", [emp]);
      await pg.query("insert into lineas_producto (company_id, nombre, tipo, precio, decision, decision_motivo) values ($1, 'Pantalón Cargo', 'producto', 80, 'mejorar', 'interno')", [emp]);
      const { rows: proc } = await pg.query<{ id: string }>("insert into processes (company_id, nombre) values ($1, 'Atención de pedidos') returning id", [emp]);
      await pg.query("insert into process_versiones (company_id, process_id, motivo, contenido) values ($1, $2, 'antes de volver a dibujarlo con pedidos.pdf', '{\"nodos\": [], \"conexiones\": []}'::jsonb)", [emp, proc[0]!.id]);
    }
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("se puede aplicar dos veces más sobre la base ya migrada, sin fallar", async () => {
    for (let vez = 0; vez < 2; vez++) for (const s of dividirSentencias(readFileSync(MIGRACION, "utf8"))) await db().exec(s);
    for (const t of TABLAS) expect((await db().query<{ t: string | null }>("select to_regclass($1)::text as t", [`public.${t}`])).rows[0]!.t, t).toBe(t);
  });

  it("ninguna tabla de public queda sin RLS, y las seis nuevas la tienen", async () => {
    const { rows } = await db().query<{ relname: string; relrowsecurity: boolean }>(
      "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'"
    );
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
    for (const t of TABLAS) expect(rows.find((r) => r.relname === t)?.relrowsecurity, t).toBe(true);
  });

  it("los checks de la empresa: uno o dos modelos conocidos, la hora de cierre en HH:MM", async () => {
    expect(await codigo("update companies set modelo_negocio = array['fabrica_y_vende','compra_y_revende'] where id = $1", [EMP_A])).toBeNull();
    expect(await codigo("update companies set modelo_negocio = array['fabrica_y_vende','compra_y_revende','prepara_y_sirve'] where id = $1", [EMP_A])).toBe("23514");
    expect(await codigo("update companies set modelo_negocio = array['minero'] where id = $1", [EMP_A])).toBe("23514");
    expect(await codigo("update companies set modelo_negocio = array[]::text[] where id = $1", [EMP_A])).toBe("23514");
    expect(await codigo("update companies set hora_cierre = '25:00' where id = $1", [EMP_A])).toBe("23514");
    expect(await codigo("update companies set hora_cierre = '7pm' where id = $1", [EMP_A])).toBe("23514");
    expect(await codigo("update companies set hora_cierre = '19:00', tipo_trabajo = 'estructurar', ruta_inicio = '2026-10-19' where id = $1", [EMP_A])).toBeNull();
    expect(await codigo("update companies set tipo_trabajo = 'consultoria' where id = $1", [EMP_A])).toBe("23514");
  });

  it("los checks de lo que vende: dos precios con su tipo, de cada 10 hasta 10, un volumen exacto o un rango", async () => {
    const linea = async (cols: string, vals: string) => codigo(`insert into lineas_producto (company_id, nombre, tipo, ${cols}) values ($1, 'X', 'producto', ${vals})`, [EMP_A]);
    expect(await linea("precio, precio_segundo, segundo_precio_es, de_cada_10_segundo", "80, 60, 'por_mayor', 3")).toBeNull();
    expect(await linea("precio, precio_segundo", "80, 60")).toBe("23514");
    expect(await linea("segundo_precio_es", "'minimo'")).toBe("23514");
    expect(await linea("precio_segundo, segundo_precio_es, de_cada_10_segundo", "60, 'por_mayor', 11")).toBe("23514");
    expect(await linea("unidades_mes, unidades_mes_desde, unidades_mes_hasta", "100, 80, 120")).toBe("23514");
    expect(await linea("unidades_mes_desde", "80")).toBe("23514");
    expect(await linea("unidades_mes_desde, unidades_mes_hasta", "120, 80")).toBe("23514");
    expect(await linea("unidades_mes_desde, unidades_mes_hasta", "80, 120")).toBeNull();
    expect(await linea("modelo", "'minero'")).toBe("23514");
    expect(await linea("componentes_costo", "'{\"tela\": 18}'::jsonb")).toBe("23514");
    expect(await linea("componentes_costo, estados", "'[{\"nombre\":\"tela\",\"valor\":18,\"estado\":\"contado\"}]'::jsonb, '{\"costo\":\"contado\"}'::jsonb")).toBeNull();
    expect(await linea("participacion_de_10", "11")).toBe("23514");
  });

  it("los checks de gastos, moneda, solicitudes y marcas", async () => {
    // Gastos: monto o rango, no los dos; «no lo sé» sin números; periodo mes típico o AAAA-MM; sin tipo variable.
    expect(await codigo("insert into costos_mes (company_id, tipo, nombre, monto, monto_desde, monto_hasta) values ($1, 'fijo', 'Luz', 300, 200, 400)", [EMP_A])).toBe("23514");
    expect(await codigo("insert into costos_mes (company_id, tipo, nombre, monto, estado) values ($1, 'fijo', 'Luz', 300, 'no_lo_se')", [EMP_A])).toBe("23514");
    expect(await codigo("insert into costos_mes (company_id, tipo, nombre, estado) values ($1, 'fijo', 'Luz', 'no_lo_se')", [EMP_A])).toBeNull();
    expect(await codigo("insert into costos_mes (company_id, tipo, nombre, monto) values ($1, 'variable', 'Tela', 300)", [EMP_A])).toBe("23514");
    expect(await codigo("insert into costos_mes (company_id, periodo, tipo, nombre, monto) values ($1, '2026-13', 'fijo', 'Luz', 300)", [EMP_A])).toBe("23514");
    expect(await codigo("insert into costos_mes (company_id, tipo, nombre, monto_desde, monto_hasta) values ($1, 'comercializacion', 'Publicidad', 400, 600)", [EMP_A])).toBeNull();
    // Moneda: código de tres letras, monto positivo, cobro no antes de la venta.
    expect(await codigo("insert into operaciones_moneda (company_id, moneda, monto) values ($1, 'clp', 100)", [EMP_A])).toBe("23514");
    expect(await codigo("insert into operaciones_moneda (company_id, moneda, monto) values ($1, 'CLP', 0)", [EMP_A])).toBe("23514");
    expect(await codigo("insert into operaciones_moneda (company_id, moneda, monto, fecha_venta, fecha_cobro) values ($1, 'CLP', 100, '2026-10-10', '2026-10-01')", [EMP_A])).toBe("23514");
    // Una sola solicitud activa por sección; completada y activa pueden convivir.
    expect(await codigo("insert into solicitudes_cliente (company_id, seccion) values ($1, 'productos')", [EMP_A])).toBe("23505");
    expect(await codigo("insert into solicitudes_cliente (company_id, seccion, estado) values ($1, 'productos', 'completada')", [EMP_A])).toBeNull();
    expect(await codigo("insert into solicitudes_cliente (company_id, seccion) values ($1, 'contabilidad')", [EMP_A])).toBe("23514");
    // Marcas: clave '<etapa>.<criterio>', una por clave y empresa.
    expect(await codigo("insert into ruta_marcas (company_id, clave, valor) values ($1, 'diagnostico', 'verde')", [EMP_A])).toBe("23514");
    expect(await codigo("insert into ruta_marcas (company_id, clave, valor) values ($1, 'Diagnostico.Fugas', 'cumple')", [EMP_A])).toBe("23514");
    expect(await codigo("insert into ruta_marcas (company_id, clave, valor) values ($1, 'diagnostico.compuerta', 'verde')", [EMP_A])).toBe("23505");
    expect(await codigo("insert into ruta_marcas (company_id, clave, valor) values ($1, 'diagnostico.fugas', 'quizas')", [EMP_A])).toBe("23514");
    // La ficha: cada bloque es un objeto, y hay una sola por empresa.
    expect(await codigo("insert into ficha_negocio (company_id, historia) values ($1, '[]'::jsonb)", [EMP_A])).toBe("23514");
    expect(await codigo("insert into ficha_negocio (company_id) values ($1)", [EMP_A])).toBe("23505");
  });

  it("RLS · cada dueño lee solo lo suyo en las cinco tablas legibles; ruta_marcas no la lee nadie más que la consultora", async () => {
    for (const t of LEGIBLES) {
      const propias = await consultarComo<{ company_id: string }>(db(), "authenticated", U_B, `select company_id from ${t}`);
      expect(propias.length, t).toBeGreaterThan(0);
      expect(propias.every((f) => f.company_id === EMP_B), t).toBe(true);
    }
    expect(await cuenta("authenticated", U_A, "ruta_marcas")).toBe(0);
    expect(await cuenta("authenticated", U_B, "ruta_marcas")).toBe(0);
    expect(await cuenta("authenticated", U_C, "ruta_marcas")).toBe(2);
  });

  it("RLS · el dueño no ve las solicitudes retiradas; la consultora sí", async () => {
    const delDueno = await consultarComo<{ estado: string }>(db(), "authenticated", U_B, "select estado from solicitudes_cliente");
    expect(delDueno.map((f) => f.estado)).toEqual(["activa"]);
    expect(await cuenta("authenticated", U_C, "solicitudes_cliente")).toBeGreaterThanOrEqual(4);
  });

  it("RLS · el dueño no escribe en ninguna de las seis: ni insertar, ni cambiar, ni borrar", async () => {
    expect(await codigoComo("authenticated", U_B, "insert into costos_mes (company_id, tipo, nombre, monto) values ($1, 'fijo', 'Mío', 1)", [EMP_B])).toBe("42501");
    expect(await codigoComo("authenticated", U_B, "insert into ficha_negocio (company_id) values ($1)", ["0000000c-0000-4000-8000-00000000000c"])).not.toBeNull();
    expect(await codigoComo("authenticated", U_B, "insert into operaciones_moneda (company_id, moneda, monto) values ($1, 'CLP', 1)", [EMP_B])).toBe("42501");
    expect(await codigoComo("authenticated", U_B, "insert into solicitudes_cliente (company_id, seccion) values ($1, 'costos')", [EMP_B])).toBe("42501");
    expect(await codigoComo("authenticated", U_B, "insert into ruta_marcas (company_id, clave, valor) values ($1, 'diagnostico.fugas', 'cumple')", [EMP_B])).toBe("42501");
    // La copia de un proceso la escribe la aplicación, nunca el dueño: ni para «volver atrás» por su cuenta.
    expect(await codigoComo("authenticated", U_B, "insert into process_versiones (company_id, process_id, motivo, contenido) select company_id, id, 'mía', '{}'::jsonb from processes where company_id = $1", [EMP_B])).toBe("42501");
    for (const t of TABLAS) {
      const tocadas = await consultarComo(db(), "authenticated", U_B, `update ${t} set company_id = company_id where company_id = $1 returning company_id`, [EMP_B]);
      expect(tocadas, `update ${t}`).toEqual([]);
      const borradas = await consultarComo(db(), "authenticated", U_B, `delete from ${t} where company_id = $1 returning company_id`, [EMP_B]);
      expect(borradas, `delete ${t}`).toEqual([]);
    }
    expect((await db().query<{ n: number }>("select count(*)::int as n from solicitudes_cliente where company_id = $1 and estado = 'activa'", [EMP_B])).rows[0]!.n).toBe(1);
  });

  it("RLS · la consultora lee y escribe todo; un anónimo no lee nada", async () => {
    for (const t of TABLAS) expect(await cuenta("authenticated", U_C, t), t).toBeGreaterThan(0);
    expect(await codigoComo("authenticated", U_C, "insert into ruta_marcas (company_id, clave, valor, nota) values ($1, 'diagnostico.fugas', 'cumple', 'con su cuenta')", [EMP_B])).toBeNull();
    for (const t of TABLAS) expect(await cuenta("anon", null, t), t).toBe(0);
    expect(await codigoComo("anon", null, "select * from lineas_producto_cliente")).toBe("42501");
  });

  it("la vista del dueño tiene exactamente COLUMNAS_PARA_DUENO, sin la decisión, y no se escribe por ella", async () => {
    const { rows } = await db().query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'lineas_producto_cliente'");
    expect(rows.map((r) => r.column_name).sort()).toEqual(COLUMNAS_PARA_DUENO.split(",").sort());
    expect(rows).toHaveLength(31);
    expect(rows.map((r) => r.column_name)).not.toContain("decision");
    expect(await codigoComo("authenticated", U_A, "select decision from lineas_producto_cliente")).toBe("42703");
    const propias = await consultarComo<{ company_id: string }>(db(), "authenticated", U_A, "select company_id from lineas_producto_cliente");
    expect(propias.length).toBeGreaterThan(0);
    expect(propias.every((f) => f.company_id === EMP_A)).toBe(true);
    expect(await codigoComo("authenticated", U_A, "update lineas_producto_cliente set precio = 1")).toBe("42501");
    expect(await codigoComo("authenticated", U_A, "insert into lineas_producto_cliente (company_id, nombre, tipo) values ($1, 'Mía', 'producto')", [EMP_A])).toBe("42501");
    expect(await codigoComo("authenticated", U_A, "delete from lineas_producto_cliente")).toBe("42501");
  });

  it("borrar la empresa vacía las seis tablas en cascada (y no toca las de la otra)", async () => {
    await db().query("delete from companies where id = $1", [EMP_A]);
    for (const t of TABLAS) {
      const r = await db().query<{ a: number; b: number }>(`select count(*) filter (where company_id = $1)::int as a, count(*) filter (where company_id = $2)::int as b from ${t}`, [EMP_A, EMP_B]);
      expect(r.rows[0]!.a, t).toBe(0);
      expect(r.rows[0]!.b, t).toBeGreaterThan(0);
    }
  });
});
