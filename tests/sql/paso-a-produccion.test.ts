/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: ENSAYO DEL PASO A PRODUCCIÓN.
 *
 * El archivo que se pega en el editor SQL de Supabase lo arma scripts/produccion/armar-sql.ts: las migraciones
 * que producción no tiene, en orden, dentro de una sola transacción. Aquí se ensaya sobre una base que se parece a
 * la producción de HOY: el esquema base, las migraciones anteriores a la rama del 13-10, las 13 de esa rama
 * (aplicadas en producción el 15-10-2026), la del 16-10 que deja entrar al cliente (aplicada el 16-10-2026) y datos
 * de una empresa en marcha (acciones, una línea base y un corte congelados, sesiones, procesos, indicadores, una línea
 * de producto con su decisión, un pedido de la consultora y un documento entregado).
 *
 * Qué se comprueba: que lo pendiente es solo migracion-estrategia.sql; que entra completo; que no cambia ni borra un
 * solo dato; que lo nuevo (las tres tablas, las dos funciones solo para el servidor, los dos checks con su valor
 * nuevo) pasa a admitirse; que se puede ejecutar dos veces; que los permisos que ya se cerraron siguen cerrados; y que
 * si la base real difiere de lo esperado (un check viejo con otro nombre, más estrecho) NO queda nada a medias.
 *
 * Con checks ampliados pendientes (CHECKS_AMPLIADOS), el archivo termina comprobando que de verdad admiten el valor
 * nuevo. Sin columnas nuevas (COLUMNAS_NUEVAS vacía), la fila final no las cuenta: un `values` vacío sería un error de
 * sintaxis después del commit.
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
import { armarSql, migracionesPendientes, YA_EN_PRODUCCION, TABLAS_NUEVAS, COLUMNAS_NUEVAS, CHECKS_AMPLIADOS, FUNCIONES_SOLO_SERVIDOR, QUE_HACE } from "../../scripts/produccion/armar-sql";

const U_A = "00000000-0000-4000-8000-0000000000a1";
const EMP = "0000000a-0000-4000-8000-00000000000a";
const PART = "000000a9-0000-4000-8000-0000000000a9";
const ACC_PEND = "000000ac-0000-4000-8000-0000000000a1";
const ACC_HECHA = "000000ac-0000-4000-8000-0000000000a2";
const HUELLA = "a".repeat(64);

/** Las 13 migraciones de la rama del 13-10, aplicadas en producción el 15-10-2026. */
const DEL_15_10 = [
  "migracion-autoridad.sql", "migracion-claims-archivo.sql", "migracion-evidencia-dimensiones.sql", "migracion-entrada-y-direccion.sql",
  "migracion-jobs-cliente-lectura.sql", "migracion-plan-kpi-linea-base.sql", "migracion-excelencia-y-cartera.sql", "migracion-revision-revisada.sql",
  "migracion-cifra-desplazada.sql", "migracion-acciones-solo-por-la-api.sql", "migracion-procesos-importados.sql", "migracion-lineas-producto-cliente.sql",
  "migracion-vistas-cliente-solo-lectura.sql",
];

/** La del 16-10 que deja entrar al cliente, aplicada en producción el 16-10-2026. */
const DEL_16_10 = ["migracion-entrar-hoy.sql"];

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
  // Lo del 16-10 ya en uso: un pedido de la consultora abierto y un documento entregado.
  await pg.query("insert into solicitudes_cliente (company_id, seccion, nota) values ($1, 'productos', 'Llena tus tres jeans más vendidos')", [EMP]);
  await pg.query("insert into deliverables (company_id, tipo, contenido, version) values ($1, 'plan_90', '{\"acciones\": []}'::jsonb, 1)", [EMP]);
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
  pedidos: (await pg.query("select seccion, nota, estado from solicitudes_cliente order by seccion")).rows,
  documentos: (await pg.query("select tipo, version, contenido, estado from deliverables order by tipo, version")).rows,
});

const existe = async (pg: PGlite, tabla: string) => (await pg.query<{ t: string | null }>("select to_regclass($1)::text as t", [`public.${tabla}`])).rows[0]!.t !== null;
const columna = async (pg: PGlite, tabla: string, col: string) => (await pg.query("select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2", [tabla, col])).rows.length > 0;
/** El código de Postgres con que falla una sentencia, o null si pasó. */
const codigoDe = async (p: Promise<unknown>): Promise<string | null> => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
/** La definición de un check por su nombre (null si no existe): dice qué valores admite hoy. */
const definicionCheck = async (pg: PGlite, tabla: string, nombre: string) =>
  (await pg.query<{ d: string }>("select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = ('public.' || $1)::regclass and conname = $2", [tabla, nombre])).rows[0]?.d ?? null;
const funcionesNuevas = async (pg: PGlite) =>
  (await pg.query<{ n: number }>("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('estrategia_lente_lista', 'aprobar_estrategia')")).rows[0]!.n;

const SECCIONES_DE_ANTES = ["productos", "costos", "historia", "moneda", "credito", "inventario", "corroborar_diagnostico", "datos_faltantes", "subir_organigrama", "subir_manuales", "subir_procesos"];
const TIPOS_DE_ANTES = ["informe_realidad", "diagnostico_4p", "mapa_as_is", "mapa_to_be", "manual_procesos", "plan_90", "mapa_automatizacion"];

describe("Postgres embebido (PGlite), no Supabase: el archivo de producción", () => {
  it("las 13 del 15-10 y la del 16-10 ya cuentan como aplicadas: lo único pendiente es migracion-estrategia.sql", () => {
    for (const a of [...DEL_15_10, ...DEL_16_10]) expect(YA_EN_PRODUCCION, a).toContain(a);
    const pendientes = migracionesPendientes();
    expect(pendientes).toEqual(["migracion-estrategia.sql"]);
    const sql = armarSql();
    expect(sql).toContain("· migracion-estrategia.sql");
    for (const a of [...DEL_15_10, ...DEL_16_10]) expect(sql, a).not.toContain(`· ${a}`);
    // Una sola transacción: un begin al principio y un commit al final.
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(sql.indexOf("\nbegin;")).toBeLessThan(sql.indexOf("· migracion-estrategia.sql"));
    expect(sql.indexOf("· migracion-estrategia.sql")).toBeLessThan(sql.indexOf("\ncommit;"));
    // La salida de emergencia no viaja en el archivo: se aplica aparte y solo si hay que deshacer.
    expect(sql).not.toContain("_retirada");
  });

  it("los dos checks que se amplían se comprueban al final, dentro de la misma transacción", () => {
    expect(CHECKS_AMPLIADOS).toEqual([
      ["solicitudes_cliente", "productos", "preguntas_estrategia"],
      ["deliverables", "plan_90", "plan_estrategico"],
    ]);
    const sql = armarSql();
    expect(sql).toContain("COMPROBACIÓN FINAL");
    expect(sql).toMatch(/^do \$\$/m);
    for (const [t, v, n] of CHECKS_AMPLIADOS) expect(sql).toContain(`('${t}', '${v}', '${n}')`);
    expect(sql.indexOf("· migracion-estrategia.sql")).toBeLessThan(sql.indexOf("COMPROBACIÓN FINAL"));
    expect(sql.indexOf("COMPROBACIÓN FINAL")).toBeLessThan(sql.indexOf("\ncommit;"));
  });

  it("la fila final cuenta las tres tablas nuevas, cuántas tienen RLS y las dos funciones que solo ejecuta el servidor", () => {
    expect(TABLAS_NUEVAS).toEqual(["estrategias", "estrategia_ediciones", "estrategia_preguntas"]);
    expect(FUNCIONES_SOLO_SERVIDOR).toEqual(["estrategia_lente_lista", "aprobar_estrategia"]);
    const sql = armarSql();
    expect(sql).toContain("'MIGRACIONES APLICADAS'");
    expect(sql).toContain("tablas_nuevas_de_3");
    expect(sql).toContain("tablas_con_rls_de_3");
    expect(sql).toContain("funciones_solo_servidor_de_2");
  });

  it("FUNCIONES_SOLO_SERVIDOR es exactamente cada función nueva de lo pendiente (las de disparador no cuentan), y cada una lleva su revoke", () => {
    const texto = migracionesPendientes()
      .map((a) => readFileSync(path.join(CARPETA_SUPABASE, a), "utf8"))
      .join("\n")
      .replace(/--.*$/gm, "");
    const creadas = [...texto.matchAll(/create\s+or\s+replace\s+function\s+([a-z_]+)\s*\([^)]*\)\s*returns\s+(\w+)/gi)]
      .filter((m) => m[2]!.toLowerCase() !== "trigger")
      .map((m) => m[1]!);
    expect([...creadas].sort()).toEqual([...FUNCIONES_SOLO_SERVIDOR].sort());
    for (const f of FUNCIONES_SOLO_SERVIDOR) {
      expect(texto, f).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${f}\\([^)]*\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i"));
      expect(texto, f).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${f}\\([^)]*\\)\\s+to\\s+service_role`, "i"));
    }
  });

  it("la fila final nombra cada columna que añade lo pendiente: ni una de más ni una de menos (hoy, ninguna, y no escribe un values vacío)", () => {
    const anadidas = migracionesPendientes().flatMap((a) =>
      [...readFileSync(path.join(CARPETA_SUPABASE, a), "utf8").replace(/--.*$/gm, "").matchAll(/alter\s+table\s+([a-z_]+)\s+add\s+column\s+if\s+not\s+exists\s+([a-z_0-9]+)/gi)].map((m) => `${m[1]}.${m[2]}`)
    );
    expect([...COLUMNAS_NUEVAS].sort()).toEqual(anadidas.sort());
    const sql = armarSql();
    if (COLUMNAS_NUEVAS.length) {
      expect(sql).toContain(`columnas_nuevas_de_${COLUMNAS_NUEVAS.length}`);
    } else {
      expect(sql).not.toContain("columnas_nuevas_de_");
      expect(sql).not.toMatch(/in \(values\s*\)/);
    }
    // Ni un `in ()` vacío en la fila final: llegaría después del commit.
    expect(sql).not.toMatch(/in \(\s*\)/);
  });

  it("la cabecera dice la verdad de lo que hay hoy: tres tablas con RLS, dos funciones, dos checks, que no borra datos y cómo deshacerlo", () => {
    const sql = armarSql();
    const cabecera = sql.slice(0, sql.indexOf("begin;"));
    for (const linea of QUE_HACE) expect(cabecera).toContain(linea);
    expect(cabecera).toMatch(/3 tablas con RLS/);
    expect(cabecera).toMatch(/estrategia_lente_lista/);
    expect(cabecera).toMatch(/preguntas_estrategia/);
    expect(cabecera).toMatch(/plan_estrategico/);
    expect(cabecera).toMatch(/NO borra ni cambia ningún dato/);
    expect(cabecera).toMatch(/supabase\/revertir\/migracion-estrategia\.sql/);
    // Lo que decía la tanda anterior (la del 16-10, ya aplicada) ya no se dice.
    expect(cabecera).not.toMatch(/costos_mes|lineas_producto_cliente|congelar_medicion/);
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
    for (const t of TABLAS_NUEVAS) expect(await existe(pg!, t), t).toBe(false);
    expect(await funcionesNuevas(pg!)).toBe(0);
    expect(await codigoDe(pg!.query("insert into solicitudes_cliente (company_id, seccion) values ($1, 'preguntas_estrategia')", [EMP]))).toBe("23514");
    expect(await codigoDe(pg!.query("insert into deliverables (company_id, tipo) values ($1, 'plan_estrategico')", [EMP]))).toBe("23514");
    // Y lo del 15-10 y lo del 16-10 sí está: por eso no se vuelve a mandar.
    expect(await existe(pg!, "solicitudes_cliente")).toBe(true);
    expect(await columna(pg!, "companies", "tipo_trabajo")).toBe(true);
    expect(await columna(pg!, "users", "autoridad")).toBe(true);
  });

  it("entra completo de una vez y lo dice", async () => {
    const resultados = await pg!.exec(armarSql());
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("MIGRACIONES APLICADAS");
    expect(Number(ultima[`tablas_nuevas_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
    // Y dice cuáles: las tres tablas por nombre, todas con RLS, y las dos funciones solo para el servidor.
    expect(ultima.tablas_nuevas).toBe([...TABLAS_NUEVAS].sort().join(", "));
    expect(Number(ultima[`tablas_con_rls_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
    expect(Number(ultima[`funciones_solo_servidor_de_${FUNCIONES_SOLO_SERVIDOR.length}`])).toBe(FUNCIONES_SOLO_SERVIDOR.length);
    expect(ultima).not.toHaveProperty("columnas_nuevas");
  }, 240_000);

  it("no cambió ni borró un solo dato de los que había", async () => {
    expect(await foto(pg!)).toEqual(antes);
  });

  it("los dos checks admiten su valor nuevo y conservan todos los de antes (ninguno se quitó)", async () => {
    const seccion = await definicionCheck(pg!, "solicitudes_cliente", "solicitudes_cliente_seccion_check");
    for (const v of [...SECCIONES_DE_ANTES, "preguntas_estrategia"]) expect(seccion, v).toContain(`'${v}'`);
    const tipo = await definicionCheck(pg!, "deliverables", "deliverables_tipo_check");
    for (const v of [...TIPOS_DE_ANTES, "plan_estrategico"]) expect(tipo, v).toContain(`'${v}'`);
    // Lo inventado sigue fuera.
    expect(await codigoDe(pg!.query("insert into solicitudes_cliente (company_id, seccion) values ($1, 'estrategia')", [EMP]))).toBe("23514");
    expect(await codigoDe(pg!.query("insert into deliverables (company_id, tipo) values ($1, 'plan_inventado')", [EMP]))).toBe("23514");
  });

  it("los valores nuevos ya se admiten y el servidor coordina con sus funciones (y se deshace, para que las pruebas siguientes comparen con la foto)", async () => {
    await pg!.query("insert into solicitudes_cliente (company_id, seccion, nota) values ($1, 'preguntas_estrategia', 'Unas preguntas para afinar tu plan')", [EMP]);
    await pg!.query("insert into deliverables (company_id, tipo, contenido, version) values ($1, 'plan_estrategico', '{\"formato\": \"estrategia_dueno_v1\"}'::jsonb, 1)", [EMP]);
    const { rows } = await pg!.query<{ id: string }>(
      "insert into estrategias (company_id, version, paquete, paquete_huella, calculos) values ($1, 1, '{}'::jsonb, $2, '{}'::jsonb) returning id",
      [EMP, HUELLA]
    );
    const id = rows[0]!.id;
    await pg!.query(
      "insert into estrategia_preguntas (company_id, estrategia_id, clave, texto, unidad, estado, enviada_at) values ($1, $2, 'clientes_dormidos', '¿Cuántos clientes te compraron alguna vez y este año no han vuelto?', 'personas', 'enviada', now())",
      [EMP, id]
    );
    // La dueña no lee nada de esto directo: su pregunta y su camino se los da la aplicación (que le esconde lo que es de
    // la consultora: por qué se pregunta, qué espera, quién la envió).
    expect(await consultarComo<{ clave: string }>(pg!, "authenticated", U_A, "select clave from estrategia_preguntas")).toEqual([]);
    expect(await consultarComo(pg!, "authenticated", U_A, "select id from estrategias")).toEqual([]);
    // El servidor guarda cada lente y sabe cuándo están las dos.
    const lente = async (cual: string) =>
      (await consultarComo<{ lista: boolean }>(pg!, "service_role", null, "select estrategia_lente_lista($1, $2, '{}'::jsonb) as lista", [id, cual]))[0]!.lista;
    expect(await lente("dinero")).toBe(false);
    expect(await lente("terreno")).toBe(true);
    for (const t of TABLAS_NUEVAS) await pg!.query(`delete from ${t} where company_id = $1`, [EMP]);
    await pg!.query("delete from solicitudes_cliente where company_id = $1 and seccion = 'preguntas_estrategia'", [EMP]);
    await pg!.query("delete from deliverables where company_id = $1 and tipo = 'plan_estrategico'", [EMP]);
    expect(await foto(pg!)).toEqual(antes);
  });

  it("se puede ejecutar por segunda vez: no falla y los datos siguen igual", async () => {
    const resultados = await pg!.exec(armarSql());
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("MIGRACIONES APLICADAS");
    expect(Number(ultima[`tablas_nuevas_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
    expect(Number(ultima[`funciones_solo_servidor_de_${FUNCIONES_SOLO_SERVIDOR.length}`])).toBe(FUNCIONES_SOLO_SERVIDOR.length);
    expect(await foto(pg!)).toEqual(antes);
  }, 240_000);

  it("la línea base que ya existía sigue como versión 1 vigente, y volver a fijarla no borra la anterior", async () => {
    const base = await pg!.query<{ version: number; vigente: boolean }>("select version, vigente from mediciones where company_id = $1 and tipo = 'linea_base'", [EMP]);
    expect(base.rows).toEqual([{ version: 1, vigente: true }]);
    await pg!.query("select congelar_medicion($1, 'linea_base', '{\"venta_mes\": 82000}'::jsonb, '{}'::jsonb, null, null)", [EMP]);
    const bases = await pg!.query<{ version: number; vigente: boolean }>("select version, vigente from mediciones where company_id = $1 and tipo = 'linea_base' order by version", [EMP]);
    expect(bases.rows).toEqual([{ version: 1, vigente: false }, { version: 2, vigente: true }]);
  });

  it("los huecos de permisos que se cerraron siguen cerrados; y la dueña no escribe en las tablas nuevas ni ejecuta sus funciones", async () => {
    await expect(consultarComo(pg!, "authenticated", U_A, "update actions set estado = 'verificado' where id = $1", [ACC_HECHA])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "update participants_cliente set rol = 'socio' where id = $1", [PART])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "insert into solicitudes_cliente (company_id, seccion) values ($1, 'preguntas_estrategia')", [EMP])).rejects.toThrow(/row-level security/);
    await expect(consultarComo(pg!, "authenticated", U_A, "update lineas_producto_cliente set precio = 0")).rejects.toThrow(/permission denied/);
    await expect(
      consultarComo(pg!, "authenticated", U_A, "insert into estrategias (company_id, version, paquete, paquete_huella, calculos) values ($1, 1, '{}'::jsonb, $2, '{}'::jsonb)", [EMP, HUELLA])
    ).rejects.toThrow(/permission denied/);
    await expect(
      consultarComo(pg!, "authenticated", U_A, "insert into estrategia_preguntas (company_id, clave, texto, estado) values ($1, 'ticket_promedio', 'Cuando un cliente te compra, ¿cuánto gasta normalmente?', 'enviada')", [EMP])
    ).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "select aprobar_estrategia(gen_random_uuid(), $1, '{}'::jsonb, null)", [U_A])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "select estrategia_lente_lista(gen_random_uuid(), 'dinero', '{}'::jsonb)")).rejects.toThrow(/permission denied/);
    // Leer sigue funcionando.
    expect(await consultarComo<{ id: string }>(pg!, "authenticated", U_A, "select id from actions order by id")).toHaveLength(2);
    expect(await consultarComo(pg!, "authenticated", U_A, "select nombre, componentes_costo from lineas_producto_cliente")).toHaveLength(1);
    expect(await consultarComo(pg!, "authenticated", U_A, "select seccion from solicitudes_cliente")).toHaveLength(1);
  });
});

describe("Postgres embebido (PGlite), no Supabase: si la base real difiere, no queda nada a medias", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    pg = await produccionDeHoy();
    // Una producción donde alguien puso a mano otro check sobre deliverables.tipo, con otro nombre y sin
    // plan_estrategico: la migración reemplaza deliverables_tipo_check, pero el viejo sigue vivo y más estrecho, y
    // guardar la copia de una estrategia aprobada fallaría. El bloque final lo detecta y todo el archivo se deshace.
    await pg.exec(`alter table deliverables add constraint deliverables_tipo_viejo check (tipo in (${TIPOS_DE_ANTES.map((t) => `'${t}'`).join(",")}))`);
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("se detiene, nombra el check que estorba y no deja aplicada ninguna tabla, función ni check nuevo", async () => {
    await expect(pg!.exec(armarSql())).rejects.toThrow(/deliverables_tipo_viejo/);
    await pg!.exec("rollback");
    for (const tabla of TABLAS_NUEVAS) expect(await existe(pg!, tabla), tabla).toBe(false);
    expect(await funcionesNuevas(pg!)).toBe(0);
    // Los dos checks siguen como estaban: ninguno admite el valor nuevo.
    expect(await definicionCheck(pg!, "solicitudes_cliente", "solicitudes_cliente_seccion_check")).not.toContain("preguntas_estrategia");
    expect(await definicionCheck(pg!, "deliverables", "deliverables_tipo_check")).not.toContain("plan_estrategico");
    expect(await definicionCheck(pg!, "deliverables", "deliverables_tipo_viejo")).not.toBeNull();
    expect(await codigoDe(pg!.query("insert into solicitudes_cliente (company_id, seccion) values ($1, 'preguntas_estrategia')", [EMP]))).toBe("23514");
  }, 240_000);
});
