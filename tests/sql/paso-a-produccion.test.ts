/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: ENSAYO DEL PASO A PRODUCCIÓN.
 *
 * El archivo que se pega en el editor SQL de Supabase lo arma scripts/produccion/armar-sql.ts: las migraciones
 * que producción no tiene, en orden, dentro de una sola transacción. Aquí se ensaya sobre una base que se parece a
 * la producción de HOY: el esquema base, las migraciones anteriores a la rama del 13-10, las 13 de esa rama
 * (aplicadas en producción el 15-10-2026) y datos de una empresa en marcha (acciones, una línea base y un corte
 * congelados, sesiones, procesos, indicadores, una línea de producto con su decisión).
 *
 * Qué se comprueba: que lo pendiente es solo migracion-entrar-hoy.sql; que entra completo; que no cambia ni borra un
 * solo dato; que lo nuevo (las cinco tablas, las columnas de empresa y de producto) pasa a admitirse; que se puede
 * ejecutar dos veces; que los permisos que ya se cerraron siguen cerrados; y que si la base real difiere de lo
 * esperado (una tabla con el mismo nombre y otra forma) NO queda nada a medias.
 *
 * Sin checks ampliados pendientes (CHECKS_AMPLIADOS vacía), el bloque de comprobación final no se escribe: un
 * `values` vacío sería un error de sintaxis y el archivo entero fallaría.
 *
 * Límite, dicho sin rodeos: esto es Postgres embebido con el esquema que el repositorio describe. La
 * producción real puede diferir en lo que el repositorio no describe (políticas, nombres de restricciones).
 * Para eso está la transacción única: si algo no calza, no se aplica nada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, aplicarArchivo, leerOrden, consultarComo, CARPETA_SUPABASE, RUTA_ENTORNO } from "./aplicar";
import { readFileSync } from "fs";
import { armarSql, migracionesPendientes, YA_EN_PRODUCCION, TABLAS_NUEVAS, COLUMNAS_NUEVAS, CHECKS_AMPLIADOS, QUE_HACE } from "../../scripts/produccion/armar-sql";

const U_A = "00000000-0000-4000-8000-0000000000a1";
const EMP = "0000000a-0000-4000-8000-00000000000a";
const PART = "000000a9-0000-4000-8000-0000000000a9";
const ACC_PEND = "000000ac-0000-4000-8000-0000000000a1";
const ACC_HECHA = "000000ac-0000-4000-8000-0000000000a2";

/** Las 13 migraciones de la rama del 13-10, aplicadas en producción el 15-10-2026. */
const DEL_15_10 = [
  "migracion-autoridad.sql", "migracion-claims-archivo.sql", "migracion-evidencia-dimensiones.sql", "migracion-entrada-y-direccion.sql",
  "migracion-jobs-cliente-lectura.sql", "migracion-plan-kpi-linea-base.sql", "migracion-excelencia-y-cartera.sql", "migracion-revision-revisada.sql",
  "migracion-cifra-desplazada.sql", "migracion-acciones-solo-por-la-api.sql", "migracion-procesos-importados.sql", "migracion-lineas-producto-cliente.sql",
  "migracion-vistas-cliente-solo-lectura.sql",
];

/** La producción de hoy, según el repositorio: lo que ya está aplicado, con datos de una empresa en marcha. */
async function produccionDeHoy(): Promise<PGlite> {
  const pg = await crearBase();
  await aplicarArchivo(pg, RUTA_ENTORNO);
  for (const e of leerOrden()) {
    if (!YA_EN_PRODUCCION.includes(e.archivo)) continue;
    await aplicarArchivo(pg, path.join(CARPETA_SUPABASE, e.archivo), e.archivo);
  }
  await pg.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena@prueba.local', $2::jsonb)", [U_A, JSON.stringify({ nombre: "Dueña" })]);
  await pg.query("insert into companies (id, nombre) values ($1, 'Empresa de ensayo')", [EMP]);
  await pg.query("insert into memberships (user_id, company_id) values ($1, $2)", [U_A, EMP]);
  await pg.query("insert into participants (id, company_id, nombre, rol, user_id) values ($1, $2, 'Dueña', 'dueno', $3)", [PART, EMP, U_A]);
  await pg.query("insert into actions (id, company_id, accion, estado) values ($1, $3, 'Tabla de costos', 'pendiente'), ($2, $3, 'Cierre de caja diario', 'hecho')", [ACC_PEND, ACC_HECHA, EMP]);
  await pg.query("insert into indicadores (company_id, clave, nombre, como_se_mide, unidad, frecuencia) values ($1, 'quejas_mes', 'Quejas al mes', 'contar las quejas del cuaderno', 'numero', 'mensual')", [EMP]);
  await pg.query("insert into interview_sessions (company_id, participant_id, tipo) values ($1, $2, 'entrada_breve')", [EMP, PART]);
  await pg.query("insert into processes (company_id, nombre, version, origen) values ($1, 'Venta en mostrador', 'as_is', 'dibujado'), ($1, 'Reposición', 'sin_dibujar', 'importado')", [EMP]);
  await pg.query("insert into lineas_producto (company_id, codigo, nombre, tipo, precio, costo_variable_unitario, decision, decision_motivo) values ($1, 'J-01', 'Jean clásico', 'producto', 80, 45, 'mejorar', 'interno')", [EMP]);
  await pg.query("select congelar_medicion($1, 'linea_base', '{\"venta_mes\": 80000}'::jsonb, '{}'::jsonb, null, null)", [EMP]);
  await pg.query("select congelar_medicion($1, 'corte', '{\"venta_mes\": 84000}'::jsonb, '{}'::jsonb, null, null)", [EMP]);
  return pg;
}

const foto = async (pg: PGlite) => ({
  empresas: (await pg.query("select id, nombre from companies order by id")).rows,
  acciones: (await pg.query<{ id: string; estado: string }>("select id, estado from actions order by id")).rows,
  mediciones: (await pg.query<{ tipo: string; numero: number; valores: unknown; version: number; vigente: boolean }>("select tipo, numero, valores, version, vigente from mediciones order by tipo, numero")).rows,
  sesiones: (await pg.query<{ tipo: string }>("select tipo from interview_sessions order by tipo")).rows,
  procesos: (await pg.query<{ nombre: string; version: string; origen: string }>("select nombre, version, origen from processes order by nombre")).rows,
  indicadores: (await pg.query<{ clave: string; unidad: string; frecuencia: string }>("select clave, unidad, frecuencia from indicadores")).rows,
  lineas: (await pg.query("select codigo, nombre, tipo, precio, costo_variable_unitario, decision, decision_motivo from lineas_producto order by codigo")).rows,
});

const existe = async (pg: PGlite, tabla: string) => (await pg.query<{ t: string | null }>("select to_regclass($1)::text as t", [`public.${tabla}`])).rows[0]!.t !== null;
const columna = async (pg: PGlite, tabla: string, col: string) => (await pg.query("select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2", [tabla, col])).rows.length > 0;

describe("Postgres embebido (PGlite), no Supabase: el archivo de producción", () => {
  it("las 13 del 15-10 ya cuentan como aplicadas: lo único pendiente es migracion-entrar-hoy.sql", () => {
    for (const a of DEL_15_10) expect(YA_EN_PRODUCCION, a).toContain(a);
    const pendientes = migracionesPendientes();
    expect(pendientes).toEqual(["migracion-entrar-hoy.sql"]);
    const sql = armarSql();
    expect(sql).toContain("· migracion-entrar-hoy.sql");
    for (const a of DEL_15_10) expect(sql, a).not.toContain(`· ${a}`);
    // Una sola transacción: un begin al principio y un commit al final.
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(sql.indexOf("\nbegin;")).toBeLessThan(sql.indexOf("· migracion-entrar-hoy.sql"));
    expect(sql.indexOf("· migracion-entrar-hoy.sql")).toBeLessThan(sql.indexOf("\ncommit;"));
  });

  it("sin checks ampliados pendientes no escribe el bloque de comprobación (un values vacío sería un error de sintaxis)", () => {
    expect(CHECKS_AMPLIADOS).toEqual([]);
    const sql = armarSql();
    expect(sql).not.toContain("COMPROBACIÓN FINAL");
    expect(sql).not.toMatch(/^do \$\$/m);
    expect(sql).not.toMatch(/select \* from \(values\s*\)/);
    // La fila final sigue ahí, y cuenta las seis tablas nuevas.
    expect(TABLAS_NUEVAS).toEqual(["costos_mes", "ficha_negocio", "operaciones_moneda", "solicitudes_cliente", "ruta_marcas", "process_versiones"]);
    expect(sql).toContain("'MIGRACIONES APLICADAS'");
    expect(sql).toContain("tablas_nuevas_de_6");
  });

  it("la fila final nombra cada columna que añade lo pendiente: ni una de más ni una de menos", () => {
    const anadidas = migracionesPendientes().flatMap((a) =>
      [...readFileSync(path.join(CARPETA_SUPABASE, a), "utf8").replace(/--.*$/gm, "").matchAll(/alter\s+table\s+([a-z_]+)\s+add\s+column\s+if\s+not\s+exists\s+([a-z_0-9]+)/gi)].map((m) => `${m[1]}.${m[2]}`)
    );
    expect([...COLUMNAS_NUEVAS].sort()).toEqual(anadidas.sort());
    const sql = armarSql();
    expect(sql).toContain(`columnas_nuevas_de_${COLUMNAS_NUEVAS.length}`);
    expect(sql).toContain(`tablas_con_rls_de_${TABLAS_NUEVAS.length}`);
  });

  it("la cabecera dice la verdad de lo que hay hoy: seis tablas con RLS, columnas nuevas, la vista rehecha y que no borra datos", () => {
    const sql = armarSql();
    const cabecera = sql.slice(0, sql.indexOf("begin;"));
    for (const linea of QUE_HACE) expect(cabecera).toContain(linea);
    expect(cabecera).toMatch(/6 tablas con RLS/);
    expect(cabecera).toMatch(/lineas_producto_cliente/);
    expect(cabecera).toMatch(/NO borra ni cambia ningún dato/);
    // Lo que decía la tanda anterior ya no se dice: hoy no se reemplaza ninguna función ni se amplía ningún check.
    expect(cabecera).not.toMatch(/congelar_medicion|amplía checks/);
  });

  it("no borra ni vacía ninguna tabla, y no toca un solo dato existente", () => {
    const sql = armarSql().replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdrop\s+column\b/i);
    const fueraDeFunciones = sql.replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(fueraDeFunciones).not.toMatch(/\bdelete\s+from\b/i);
    expect(fueraDeFunciones).not.toMatch(/\bupdate\s+\w+\s+set\b/i);
  });
});

describe("Postgres embebido (PGlite), no Supabase: ensayo sobre la producción de hoy", () => {
  let pg: PGlite | undefined;
  let antes: Awaited<ReturnType<typeof foto>>;

  beforeAll(async () => {
    pg = await produccionDeHoy();
    antes = await foto(pg);
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("antes de aplicar: la base de hoy NO tiene lo nuevo (el ensayo parte de donde está producción)", async () => {
    expect(await existe(pg!, "solicitudes_cliente")).toBe(false);
    expect(await existe(pg!, "costos_mes")).toBe(false);
    expect(await columna(pg!, "companies", "tipo_trabajo")).toBe(false);
    expect(await columna(pg!, "lineas_producto", "componentes_costo")).toBe(false);
    // Y lo del 15-10 sí está: por eso no se vuelve a mandar.
    expect(await existe(pg!, "lineas_producto")).toBe(true);
    expect(await columna(pg!, "users", "autoridad")).toBe(true);
  });

  it("entra completo de una vez y lo dice", async () => {
    const resultados = await pg!.exec(armarSql());
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("MIGRACIONES APLICADAS");
    expect(Number(ultima[`tablas_nuevas_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
    // Y dice cuáles: las seis tablas por nombre, todas con RLS, y cada columna nueva por nombre.
    expect(ultima.tablas_nuevas).toBe([...TABLAS_NUEVAS].sort().join(", "));
    expect(Number(ultima[`tablas_con_rls_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
    expect(Number(ultima[`columnas_nuevas_de_${COLUMNAS_NUEVAS.length}`])).toBe(COLUMNAS_NUEVAS.length);
    expect(String(ultima.columnas_nuevas).split(", ").sort()).toEqual([...COLUMNAS_NUEVAS].sort());
  }, 240_000);

  it("no cambió ni borró un solo dato de los que había", async () => {
    expect(await foto(pg!)).toEqual(antes);
  });

  it("la línea de producto que ya existía queda igual y estrena sus columnas vacías, no en cero", async () => {
    const { rows } = await pg!.query<Record<string, unknown>>("select componentes_costo, estados, unidades_mes, precio_segundo, creada_por from lineas_producto where codigo = 'J-01'");
    expect(rows).toEqual([{ componentes_costo: [], estados: {}, unidades_mes: null, precio_segundo: null, creada_por: null }]);
  });

  it("los valores nuevos ya se admiten (y se deshacen, para que las pruebas siguientes comparen con la foto)", async () => {
    await pg!.query("update companies set modelo_negocio = array['fabrica_y_vende'], tipo_trabajo = 'estructurar', ruta_inicio = '2026-10-19', hora_cierre = '19:00' where id = $1", [EMP]);
    await pg!.query("insert into costos_mes (company_id, tipo, nombre, monto_desde, monto_hasta) values ($1, 'fijo', 'Alquiler', 1500, 1800)", [EMP]);
    await pg!.query("insert into ficha_negocio (company_id, modulos) values ($1, '{\"moneda\": true}'::jsonb)", [EMP]);
    await pg!.query("insert into operaciones_moneda (company_id, moneda, monto, tc_cotizado, recibido) values ($1, 'CLP', 1000000, 0.0041, 3950)", [EMP]);
    await pg!.query("insert into solicitudes_cliente (company_id, seccion, nota) values ($1, 'productos', 'Llena tus tres jeans más vendidos')", [EMP]);
    await pg!.query("insert into ruta_marcas (company_id, clave, valor, nota) values ($1, 'diagnostico.compuerta', 'ambar', 'falta el punto de partida comprobado')", [EMP]);
    await pg!.query("update lineas_producto set componentes_costo = '[{\"nombre\":\"tela\",\"valor\":18,\"estado\":\"contado\"}]'::jsonb, unidades_mes_desde = 80, unidades_mes_hasta = 120 where codigo = 'J-01'");
    // La dueña lee su pedido por RLS.
    expect(await consultarComo<{ seccion: string }>(pg!, "authenticated", U_A, "select seccion from solicitudes_cliente")).toEqual([{ seccion: "productos" }]);
    for (const t of TABLAS_NUEVAS) await pg!.query(`delete from ${t} where company_id = $1`, [EMP]);
    await pg!.query("update companies set modelo_negocio = null, tipo_trabajo = null, ruta_inicio = null, hora_cierre = null where id = $1", [EMP]);
    await pg!.query("update lineas_producto set componentes_costo = '[]'::jsonb, unidades_mes_desde = null, unidades_mes_hasta = null where codigo = 'J-01'");
  });

  it("se puede ejecutar por segunda vez: no falla y los datos siguen igual", async () => {
    const resultados = await pg!.exec(armarSql());
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("MIGRACIONES APLICADAS");
    expect(Number(ultima[`columnas_nuevas_de_${COLUMNAS_NUEVAS.length}`])).toBe(COLUMNAS_NUEVAS.length);
    expect(await foto(pg!)).toEqual(antes);
  }, 240_000);

  it("la línea base que ya existía sigue como versión 1 vigente, y volver a fijarla no borra la anterior", async () => {
    const base = await pg!.query<{ version: number; vigente: boolean }>("select version, vigente from mediciones where company_id = $1 and tipo = 'linea_base'", [EMP]);
    expect(base.rows).toEqual([{ version: 1, vigente: true }]);
    await pg!.query("select congelar_medicion($1, 'linea_base', '{\"venta_mes\": 82000}'::jsonb, '{}'::jsonb, null, null)", [EMP]);
    const bases = await pg!.query<{ version: number; vigente: boolean }>("select version, vigente from mediciones where company_id = $1 and tipo = 'linea_base' order by version", [EMP]);
    expect(bases.rows).toEqual([{ version: 1, vigente: false }, { version: 2, vigente: true }]);
  });

  it("los huecos de permisos que se cerraron el 15-10 siguen cerrados; y la dueña no escribe en las tablas nuevas", async () => {
    await expect(consultarComo(pg!, "authenticated", U_A, "update actions set estado = 'verificado' where id = $1", [ACC_HECHA])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "update participants_cliente set rol = 'socio' where id = $1", [PART])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "insert into solicitudes_cliente (company_id, seccion) values ($1, 'costos')", [EMP])).rejects.toThrow(/row-level security/);
    await expect(consultarComo(pg!, "authenticated", U_A, "update lineas_producto_cliente set precio = 0")).rejects.toThrow(/permission denied/);
    // Leer sigue funcionando.
    expect(await consultarComo<{ id: string }>(pg!, "authenticated", U_A, "select id from actions order by id")).toHaveLength(2);
    expect(await consultarComo(pg!, "authenticated", U_A, "select nombre, componentes_costo from lineas_producto_cliente")).toHaveLength(1);
  });
});

describe("Postgres embebido (PGlite), no Supabase: si la base real difiere, no queda nada a medias", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    pg = await produccionDeHoy();
    // Una producción donde alguien ya creó a mano una tabla costos_mes con otra forma: `create table if not exists`
    // la deja como está y el índice sobre company_id no se puede crear. Todo el archivo tiene que deshacerse.
    await pg.exec("create table costos_mes (id int)");
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("se detiene y no deja aplicada ninguna tabla nueva ni columna nueva", async () => {
    await expect(pg!.exec(armarSql())).rejects.toThrow(/company_id/);
    await pg!.exec("rollback");
    for (const tabla of TABLAS_NUEVAS.filter((t) => t !== "costos_mes")) expect(await existe(pg!, tabla), tabla).toBe(false);
    // La costos_mes que había sigue con su forma: nadie la tocó.
    expect((await pg!.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'costos_mes'")).rows.map((r) => r.column_name)).toEqual(["id"]);
    for (const [tabla, col] of [["companies", "tipo_trabajo"], ["companies", "hora_cierre"], ["companies", "modelo_negocio"], ["lineas_producto", "componentes_costo"], ["lineas_producto", "creada_por"]] as const) {
      expect(await columna(pg!, tabla, col), `${tabla}.${col}`).toBe(false);
    }
    // Y la vista del dueño sigue siendo la de antes, sin las columnas nuevas.
    expect(await columna(pg!, "lineas_producto_cliente", "componentes_costo")).toBe(false);
    expect(await columna(pg!, "lineas_producto_cliente", "precio")).toBe(true);
  }, 240_000);
});
