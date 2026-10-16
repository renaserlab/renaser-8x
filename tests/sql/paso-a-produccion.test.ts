/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: ENSAYO DEL PASO A PRODUCCIÓN.
 *
 * El archivo que se pega en el editor SQL de Supabase lo arma scripts/produccion/armar-sql.ts: las migraciones
 * que producción no tiene, en orden, dentro de una sola transacción, con una comprobación final. Aquí se ensaya
 * sobre una base que se parece a la producción de HOY: el esquema base, las migraciones anteriores a esta rama
 * y datos con los valores viejos (acciones «pendiente» y «hecho», una línea base congelada con la función
 * antigua, sesiones, procesos, indicadores).
 *
 * Qué se comprueba: que entra completo; que no cambia ni borra un solo dato; que los valores nuevos pasan a
 * admitirse; que se puede ejecutar dos veces; que cierra los dos huecos de permisos; y que si la base real
 * difiere de lo esperado (un check viejo con otro nombre) NO queda nada a medias.
 *
 * Límite, dicho sin rodeos: esto es Postgres embebido con el esquema que el repositorio describe. La
 * producción real puede diferir en lo que el repositorio no describe (políticas, nombres de restricciones).
 * Para eso están la transacción única y la comprobación final: si algo no calza, no se aplica nada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, aplicarArchivo, leerOrden, consultarComo, CARPETA_SUPABASE, RUTA_ENTORNO } from "./aplicar";
import { armarSql, migracionesPendientes, YA_EN_PRODUCCION, TABLAS_NUEVAS } from "../../scripts/produccion/armar-sql";

const U_A = "00000000-0000-4000-8000-0000000000a1";
const EMP = "0000000a-0000-4000-8000-00000000000a";
const PART = "000000a9-0000-4000-8000-0000000000a9";
const ACC_PEND = "000000ac-0000-4000-8000-0000000000a1";
const ACC_HECHA = "000000ac-0000-4000-8000-0000000000a2";

/** La producción de hoy, según el repositorio: lo que ya está aplicado, con datos de valores antiguos. */
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
  await pg.query("insert into interview_sessions (company_id, participant_id, tipo) values ($1, $2, 'sueno_dueno')", [EMP, PART]);
  await pg.query("insert into processes (company_id, nombre, version, origen) values ($1, 'Venta en mostrador', 'as_is', 'dibujado')", [EMP]);
  // La línea base y un corte, congelados con la función ANTIGUA (la que borraba al recongelar).
  await pg.query("select congelar_medicion($1, 'linea_base', '{\"venta_mes\": 80000}'::jsonb, '{}'::jsonb, null, null)", [EMP]);
  await pg.query("select congelar_medicion($1, 'corte', '{\"venta_mes\": 84000}'::jsonb, '{}'::jsonb, null, null)", [EMP]);
  return pg;
}

const foto = async (pg: PGlite) => ({
  empresas: (await pg.query<{ n: number }>("select count(*)::int as n from companies")).rows[0]!.n,
  acciones: (await pg.query<{ id: string; estado: string }>("select id, estado from actions order by id")).rows,
  mediciones: (await pg.query<{ tipo: string; numero: number; valores: unknown }>("select tipo, numero, valores from mediciones order by tipo, numero")).rows,
  sesiones: (await pg.query<{ tipo: string }>("select tipo from interview_sessions order by tipo")).rows,
  procesos: (await pg.query<{ nombre: string; version: string; origen: string }>("select nombre, version, origen from processes")).rows,
  indicadores: (await pg.query<{ clave: string; unidad: string; frecuencia: string }>("select clave, unidad, frecuencia from indicadores")).rows,
});

describe("Postgres embebido (PGlite), no Supabase: el archivo de producción", () => {
  it("lleva las 13 migraciones que faltan, en orden, y no lleva las que producción ya tiene", () => {
    const pendientes = migracionesPendientes();
    expect(pendientes).toHaveLength(13);
    expect(pendientes).not.toContain("schema.sql");
    expect(pendientes).not.toContain("migracion-deriva-esquema.sql");
    const sql = armarSql();
    const posiciones = pendientes.map((a) => sql.indexOf(`· ${a}`));
    expect(posiciones.every((p) => p > 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
    // Una sola transacción: un begin al principio y un commit al final, después de la comprobación.
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(sql.indexOf("COMPROBACIÓN FINAL")).toBeLessThan(sql.indexOf("\ncommit;"));
  });

  it("no borra ni vacía ninguna tabla, y no toca un solo dato existente", () => {
    const sql = armarSql().replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdrop\s+column\b/i);
    // Los únicos update/delete viven DENTRO de funciones (congelar_medicion marca la versión anterior; el
    // disparador pasa un proceso a dibujado): ninguno se ejecuta al aplicar el archivo.
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

  it("antes de aplicar: la base de hoy NO admite lo nuevo (el ensayo parte de donde está producción)", async () => {
    await expect(pg!.query("insert into interview_sessions (company_id, participant_id, tipo) values ($1, $2, 'entrada_breve')", [EMP, PART])).rejects.toThrow(/check/i);
    expect((await pg!.query<{ t: string | null }>("select to_regclass('public.ficha_direccion')::text as t")).rows[0]!.t).toBeNull();
  });

  it("entra completo de una vez y lo dice", async () => {
    const resultados = await pg!.exec(armarSql());
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("MIGRACIONES APLICADAS");
    expect(Number(ultima[`tablas_nuevas_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
  }, 240_000);

  it("no cambió ni borró un solo dato de los que había", async () => {
    expect(await foto(pg!)).toEqual(antes);
  });

  it("la línea base que ya existía queda como versión 1 vigente", async () => {
    const base = await pg!.query<{ version: number; vigente: boolean }>("select version, vigente from mediciones where company_id = $1 and tipo = 'linea_base'", [EMP]);
    expect(base.rows).toEqual([{ version: 1, vigente: true }]);
  });

  it("los valores nuevos ya se admiten", async () => {
    await pg!.query("insert into interview_sessions (company_id, participant_id, tipo) values ($1, $2, 'entrada_breve')", [EMP, PART]);
    await pg!.query("update actions set estado = 'propuesto' where id = $1", [ACC_PEND]);
    await pg!.query("update indicadores set unidad = 'horas', frecuencia = 'quincenal' where company_id = $1", [EMP]);
    await pg!.query("insert into processes (company_id, nombre, version, origen) values ($1, 'Reposición', 'sin_dibujar', 'importado')", [EMP]);
    // Se devuelve lo cambiado a como estaba, para que las pruebas siguientes comparen con la foto inicial.
    await pg!.query("delete from interview_sessions where tipo = 'entrada_breve'");
    await pg!.query("update actions set estado = 'pendiente' where id = $1", [ACC_PEND]);
    await pg!.query("update indicadores set unidad = 'numero', frecuencia = 'mensual' where company_id = $1", [EMP]);
    await pg!.query("delete from processes where version = 'sin_dibujar'");
  });

  it("se puede ejecutar por segunda vez: no falla y los datos siguen igual", async () => {
    const resultados = await pg!.exec(armarSql());
    expect((resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>).resultado).toBe("MIGRACIONES APLICADAS");
    expect(await foto(pg!)).toEqual(antes);
  }, 240_000);

  it("volver a fijar el punto de partida ya no borra el anterior", async () => {
    await pg!.query("select congelar_medicion($1, 'linea_base', '{\"venta_mes\": 82000}'::jsonb, '{}'::jsonb, null, null)", [EMP]);
    const bases = await pg!.query<{ version: number; vigente: boolean }>("select version, vigente from mediciones where company_id = $1 and tipo = 'linea_base' order by version", [EMP]);
    expect(bases.rows).toEqual([{ version: 1, vigente: false }, { version: 2, vigente: true }]);
  });

  it("los dos huecos de permisos quedan cerrados: la dueña no escribe directo en acciones ni en su gente", async () => {
    await expect(consultarComo(pg!, "authenticated", U_A, "update actions set estado = 'verificado' where id = $1", [ACC_HECHA])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "update participants_cliente set rol = 'socio' where id = $1", [PART])).rejects.toThrow(/permission denied/);
    // Leer sigue funcionando.
    expect(await consultarComo<{ id: string }>(pg!, "authenticated", U_A, "select id from actions order by id")).toHaveLength(2);
  });
});

describe("Postgres embebido (PGlite), no Supabase: si la base real difiere, no queda nada a medias", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    pg = await produccionDeHoy();
    // Una producción donde el check de tipo de sesión tiene OTRO nombre: `drop constraint if exists` no lo
    // encontraría y quedaría vivo, más estrecho que el nuevo.
    await pg.exec("alter table interview_sessions drop constraint interview_sessions_tipo_check");
    await pg.exec("alter table interview_sessions add constraint sesiones_tipo_antiguo check (tipo in ('sueno_dueno','empresa_dueno','lider','personal','know_how','validacion'))");
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("se detiene, dice qué check estorba y no deja aplicada ni una sola de las 13 migraciones", async () => {
    await expect(pg!.exec(armarSql())).rejects.toThrow(/sesiones_tipo_antiguo/);
    await pg!.exec("rollback");
    for (const tabla of TABLAS_NUEVAS) {
      const r = await pg!.query<{ t: string | null }>("select to_regclass($1)::text as t", [`public.${tabla}`]);
      expect(r.rows[0]!.t, tabla).toBeNull();
    }
    const columna = await pg!.query("select 1 from information_schema.columns where table_name = 'users' and column_name = 'autoridad'");
    expect(columna.rows).toHaveLength(0);
    // Y los permisos tampoco cambiaron: la política que se iba a retirar sigue ahí.
    const politica = await pg!.query("select 1 from pg_policies where tablename = 'actions' and policyname = 'cliente_actions_upd'");
    expect(politica.rows).toHaveLength(1);
  }, 240_000);
});
