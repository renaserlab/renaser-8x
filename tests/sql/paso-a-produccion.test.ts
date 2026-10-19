/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: ENSAYO DEL PASO A PRODUCCIÓN · FINANZAS (19-10-2026).
 *
 * El archivo que se pega en el editor SQL de Supabase (o se pasa con la CLI) lo arma scripts/produccion/armar-sql.ts:
 * las migraciones que producción no tiene, en orden, dentro de una sola transacción. Aquí se ensaya sobre una base que
 * se parece a la producción de HOY: todo lo que el registro da por aplicado (YA_EN_PRODUCCION, con la estrategia y
 * RENASER OS desde el 19-10-2026) y datos de una empresa en marcha (acciones, una línea base y un corte congelados,
 * sesiones, procesos, indicadores, una línea de producto, un pedido de la consultora, un documento entregado, sus
 * números en «Tus números» —contados, leídos de un documento y conciliados— y su equipo en RENASER OS).
 *
 * Lo pendiente es una sola migración: supabase/migracion-finanzas.sql. Qué se comprueba: que entra completa de una vez
 * y lo dice; que no cambia ni borra un solo dato (tampoco en company_metricas, que gana un disparador); que el check
 * ampliado (company_metricas.origen admite 'caja') se comprueba al final, dentro de la misma transacción; que la caja
 * alimenta a «Tus números» sin pisar lo que ya había; que se puede ejecutar dos veces; que el navegador no lee ni
 * ejecuta nada de lo nuevo; y que si la base real difiere (un check viejo con otro nombre, más estrecho) NO queda nada
 * a medias.
 *
 * La regla de cuando no quede nada pendiente («nada pendiente ⇒ armarSql lo dice») se ensaya también, con un orden
 * simulado en que Finanzas ya está en producción: cuando lo esté de verdad, su archivo pasa a YA_EN_PRODUCCION, las
 * listas de armar-sql.ts vuelven a vaciarse y esta prueba vuelve a la de «nada pendiente» (commit de Finanzas).
 *
 * Límite, dicho sin rodeos: esto es Postgres embebido con el esquema que el repositorio describe. La producción real
 * puede diferir en lo que el repositorio no describe (políticas, nombres de restricciones). Para eso está la
 * transacción única: si algo no calza, no se aplica nada.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, aplicarArchivo, leerOrden, consultarComo, CARPETA_SUPABASE, RUTA_ENTORNO } from "./aplicar";
import { readFileSync } from "fs";
import {
  armarSql, archivosDelOrden, migracionesPendientes, YA_EN_PRODUCCION, TABLAS_NUEVAS, COLUMNAS_NUEVAS, CHECKS_AMPLIADOS,
  FUNCIONES_SOLO_SERVIDOR, QUE_HACE, NADA_PENDIENTE,
} from "../../scripts/produccion/armar-sql";

const U_A = "00000000-0000-4000-8000-0000000000a1";
const EMP = "0000000a-0000-4000-8000-00000000000a";
const PART = "000000a9-0000-4000-8000-0000000000a9";
const ACC_PEND = "000000ac-0000-4000-8000-0000000000a1";
const ACC_HECHA = "000000ac-0000-4000-8000-0000000000a2";
const PERSONA = "000000b1-0000-4000-8000-0000000000b1";

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

/** Lo que company_metricas.origen admitía antes de Finanzas (migracion-evidencia-dimensiones.sql). */
const ORIGENES_DE_ANTES = ["declarado", "extraido", "conciliado", "calculado"];

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
  await pg.query("insert into solicitudes_cliente (company_id, seccion, nota) values ($1, 'productos', 'Llena tus tres jeans más vendidos')", [EMP]);
  await pg.query("insert into deliverables (company_id, tipo, contenido, version) values ($1, 'plan_90', '{\"acciones\": []}'::jsonb, 1)", [EMP]);
  // «Tus números» en uso: lo que la dueña contó, lo leído de un documento (con el par al lado), lo conciliado y una
  // fila de antes de los orígenes. La migración añade un disparador a esta tabla: ninguna de estas filas puede moverse.
  await pg.query(
    `insert into company_metricas (company_id, clave, periodo, valor, estado, origen, nota, cifra_desplazada) values
      ($1, 'venta_mes', '2026-09', 45900, 'contado', 'declarado', null, '{"lado": "extraido", "valor": 47000}'::jsonb),
      ($1, 'venta_mes', '2026-08', 43200, 'extraido', 'extraido', 'ventas-agosto.xlsx', null),
      ($1, 'gasto_fijo_mes', '2026-08', 11900, 'verificado', 'conciliado', null, null),
      ($1, 'caja_hoy', 'actual', 20000, 'contado', 'declarado', null, null),
      ($1, 'precio_producto_estrella', 'actual', 80, 'contado', null, null, null)`,
    [EMP]
  );
  // RENASER OS en uso (aplicado el 19-10-2026): la dueña y una tarea.
  await pg.query("insert into os_personas (id, company_id, user_id, email, nombre, rol) values ($1, $2, $3, 'duena@prueba.local', 'Dueña', 'dueno')", [PERSONA, EMP, U_A]);
  await pg.query("insert into os_tareas (company_id, persona_id, titulo) values ($1, $2, 'Contar la caja del viernes')", [EMP, PERSONA]);
  return pg;
}

const foto = async (pg: PGlite) => ({
  empresas: (await pg.query("select id, nombre from companies order by id")).rows,
  acciones: (await pg.query("select id, estado from actions order by id")).rows,
  mediciones: (await pg.query("select tipo, numero, valores, version, vigente from mediciones order by tipo, numero")).rows,
  sesiones: (await pg.query("select tipo from interview_sessions order by tipo")).rows,
  procesos: (await pg.query("select nombre, version, origen from processes order by nombre")).rows,
  indicadores: (await pg.query("select clave, unidad, frecuencia from indicadores")).rows,
  lineas: (await pg.query("select codigo, nombre, tipo, precio, costo_variable_unitario, decision, decision_motivo from lineas_producto order by codigo")).rows,
  pedidos: (await pg.query("select seccion, nota, estado from solicitudes_cliente order by seccion")).rows,
  documentos: (await pg.query("select tipo, version, contenido, estado from deliverables order by tipo, version")).rows,
  // Con id y updated_at: una fila que se tocara (aunque quedara con el mismo valor) también se ve.
  numeros: (await pg.query("select id, clave, periodo, valor, valor_texto, estado, origen, nota, cifra_desplazada, updated_at from company_metricas order by clave, periodo")).rows,
  personas: (await pg.query("select id, nombre, rol, activo from os_personas order by id")).rows,
  tareas: (await pg.query("select titulo, estado from os_tareas order by titulo")).rows,
});

const existe = async (pg: PGlite, tabla: string) => (await pg.query<{ t: string | null }>("select to_regclass($1)::text as t", [`public.${tabla}`])).rows[0]!.t !== null;
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
  (await pg.query<{ n: number }>("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'fin\\_%'")).rows[0]!.n;
const disparadorDeLaCaja = async (pg: PGlite) =>
  (await pg.query("select 1 from pg_trigger where tgname = 'company_metricas_la_caja_manda' and tgrelid = 'public.company_metricas'::regclass")).rows.length > 0;
/** Una fila con origen 'caja': antes de Finanzas el check la rechaza; después, la admite. */
const conOrigenCaja = (pg: PGlite) =>
  pg.query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen) values ($1, 'venta_mes', '2027-01', 1, 'contado', 'caja')", [EMP]);

/** El texto de lo pendiente, sin comentarios. */
const textoPendiente = () =>
  migracionesPendientes()
    .map((a) => readFileSync(path.join(CARPETA_SUPABASE, a), "utf8"))
    .join("\n")
    .replace(/--.*$/gm, "");

describe("Postgres embebido (PGlite), no Supabase: el archivo de producción", () => {
  it("lo del 15-10, el 16-10 y el 19-10 cuenta como aplicado: lo pendiente es solo Finanzas", () => {
    for (const a of [...DEL_15_10, ...DEL_16_10, ...DEL_19_10]) expect(YA_EN_PRODUCCION, a).toContain(a);
    expect(migracionesPendientes()).toEqual(["migracion-finanzas.sql"]);
    const sql = armarSql();
    expect(sql).toContain("-- 1 de 1 · migracion-finanzas.sql");
    for (const a of YA_EN_PRODUCCION) expect(sql, a).not.toContain(`· ${a}`);
    // Una sola transacción: un begin al principio y un commit al final.
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(sql.indexOf("\nbegin;")).toBeLessThan(sql.indexOf("· migracion-finanzas.sql"));
    expect(sql.indexOf("· migracion-finanzas.sql")).toBeLessThan(sql.indexOf("\ncommit;"));
    // La salida de emergencia no viaja en el archivo: se aplica aparte y solo si hay que deshacer.
    expect(sql.slice(sql.indexOf("begin;"))).not.toContain("_retirada");
  });

  it("el registro no nombra archivos que no están en el orden (un nombre mal escrito daría por aplicada una migración que no existe)", () => {
    const orden = leerOrden().map((e) => e.archivo);
    expect(archivosDelOrden()).toEqual(orden);
    for (const a of YA_EN_PRODUCCION) expect(orden, a).toContain(a);
    expect(new Set(YA_EN_PRODUCCION).size, "sin repetidos").toBe(YA_EN_PRODUCCION.length);
  });

  it("nada pendiente ⇒ armarSql lo dice (orden simulado en que Finanzas ya está en producción), y el programa no escribe nada", () => {
    const yaTodo = archivosDelOrden().filter((a) => a !== "migracion-finanzas.sql");
    expect(migracionesPendientes(yaTodo)).toEqual([]);
    expect(() => armarSql(migracionesPendientes(yaTodo))).toThrow(NADA_PENDIENTE);
    expect(() => armarSql([])).toThrow(NADA_PENDIENTE);
    const programa = readFileSync(path.join(__dirname, "../../scripts/produccion/armar-sql.ts"), "utf8");
    expect(programa).toMatch(/if \(!migracionesPendientes\(\)\.length\) \{\s*console\.log\(NADA_PENDIENTE\);\s*process\.exit\(0\);/);
  });

  it("el check que se amplía (company_metricas.origen admite 'caja') se comprueba al final, dentro de la misma transacción", () => {
    expect(CHECKS_AMPLIADOS).toEqual([["company_metricas", "calculado", "caja"]]);
    const sql = armarSql();
    expect(sql).toContain("COMPROBACIÓN FINAL");
    expect(sql).toMatch(/^do \$\$/m);
    expect(sql).toContain("('company_metricas', 'calculado', 'caja')");
    expect(sql.indexOf("· migracion-finanzas.sql")).toBeLessThan(sql.indexOf("COMPROBACIÓN FINAL"));
    expect(sql.indexOf("COMPROBACIÓN FINAL")).toBeLessThan(sql.indexOf("\ncommit;"));
    // Y es de verdad lo que hace la migración: quita el check por su nombre y lo vuelve a poner con 'caja'.
    const texto = textoPendiente();
    expect(texto).toMatch(/alter table company_metricas drop constraint if exists company_metricas_origen_check;/);
    expect(texto).toMatch(/check \(origen in \('declarado','extraido','conciliado','calculado','caja'\)\)/);
  });

  it("TABLAS_NUEVAS es exactamente cada tabla que crea lo pendiente: las 8 fin_*, y la fila final cuenta cuántas quedaron con RLS", () => {
    const creadas = [...textoPendiente().matchAll(/create\s+table\s+if\s+not\s+exists\s+([a-z_]+)/gi)].map((m) => m[1]!);
    expect([...creadas].sort()).toEqual([...TABLAS_NUEVAS].sort());
    expect(TABLAS_NUEVAS).toHaveLength(8);
    expect(TABLAS_NUEVAS.every((t) => t.startsWith("fin_"))).toBe(true);
    const sql = armarSql();
    expect(sql).toContain("'MIGRACIONES APLICADAS'");
    expect(sql).toContain("tablas_nuevas_de_8");
    expect(sql).toContain("tablas_con_rls_de_8");
    expect(sql).toContain("funciones_solo_servidor_de_12");
  });

  it("FUNCIONES_SOLO_SERVIDOR es exactamente cada función nueva de lo pendiente (las de disparador no cuentan), y cada una lleva su revoke", () => {
    const texto = textoPendiente();
    const creadas = [...texto.matchAll(/create\s+or\s+replace\s+function\s+([a-z_]+)\s*\([^)]*\)\s*returns\s+(\w+)/gi)]
      .filter((m) => m[2]!.toLowerCase() !== "trigger")
      .map((m) => m[1]!);
    expect([...creadas].sort()).toEqual([...FUNCIONES_SOLO_SERVIDOR].sort());
    expect(FUNCIONES_SOLO_SERVIDOR).toHaveLength(12);
    for (const f of FUNCIONES_SOLO_SERVIDOR) {
      expect(texto, f).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${f}\\([^)]*\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, "i"));
      expect(texto, f).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${f}\\([^)]*\\)\\s+to\\s+service_role`, "i"));
    }
  });

  it("la fila final nombra cada columna que añade lo pendiente: hoy ninguna, y no escribe un values vacío", () => {
    const anadidas = [...textoPendiente().matchAll(/alter\s+table\s+([a-z_]+)\s+add\s+column\s+if\s+not\s+exists\s+([a-z_0-9]+)/gi)].map((m) => `${m[1]}.${m[2]}`);
    expect([...COLUMNAS_NUEVAS].sort()).toEqual(anadidas.sort());
    expect(COLUMNAS_NUEVAS).toEqual([]);
    const sql = armarSql();
    expect(sql).not.toContain("columnas_nuevas_de_");
    expect(sql).not.toMatch(/in \(values\s*\)/);
    // Ni un `in ()` vacío en la fila final: llegaría después del commit.
    expect(sql).not.toMatch(/in \(\s*\)/);
  });

  it("la cabecera dice la verdad de lo que hay hoy: 8 tablas, 12 funciones, el check, los disparadores, que la caja manda y cómo deshacerlo", () => {
    const sql = armarSql();
    const cabecera = sql.slice(0, sql.indexOf("begin;"));
    expect(QUE_HACE.length).toBeGreaterThan(0);
    for (const linea of QUE_HACE) expect(cabecera).toContain(linea);
    expect(cabecera).toMatch(/8 tablas con RLS/);
    expect(cabecera).toMatch(/12 funciones que solo ejecuta el servidor/);
    expect(cabecera).toMatch(/company_metricas\.origen con 'caja'/);
    expect(cabecera).toMatch(/disparadores escriben en\s*\n-- company_metricas/);
    expect(cabecera).toMatch(/company_metricas_la_caja_manda/);
    expect(cabecera).toMatch(/la caja mande/);
    expect(cabecera).toMatch(/No cambia ningún dato existente/);
    expect(cabecera).toMatch(/supabase\/revertir\/migracion-finanzas\.sql/);
    // Lo que decía la tanda anterior (estrategia y RENASER OS, ya aplicada) ya no se dice.
    expect(cabecera).not.toMatch(/estrategia_lente_lista|plan_estrategico|os_regla|pg_cron/);
  });

  it("no borra ni vacía ninguna tabla, y fuera de las funciones no toca un solo dato", () => {
    const sql = armarSql().replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdrop\s+column\b/i);
    const fueraDeFunciones = sql.replace(/\$\$[\s\S]*?\$\$/g, "");
    expect(fueraDeFunciones).not.toMatch(/\bdelete\s+from\b/i);
    expect(fueraDeFunciones).not.toMatch(/\bupdate\s+\w+\s+set\b/i);
    expect(fueraDeFunciones).not.toMatch(/\binsert\s+into\b/i);
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

  it("antes de aplicar: la base de hoy NO tiene Finanzas (el ensayo parte de donde está producción)", async () => {
    for (const t of TABLAS_NUEVAS) expect(await existe(pg!, t), t).toBe(false);
    expect(await funcionesNuevas(pg!)).toBe(0);
    expect(await disparadorDeLaCaja(pg!)).toBe(false);
    expect(await codigoDe(conOrigenCaja(pg!))).toBe("23514");
    // Y lo de antes sí está: por eso no se vuelve a mandar.
    for (const t of ["os_personas", "os_tareas", "estrategias", "solicitudes_cliente", "company_metricas"]) expect(await existe(pg!, t), t).toBe(true);
  });

  it("entra completo de una vez y lo dice", async () => {
    const resultados = await pg!.exec(armarSql());
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("MIGRACIONES APLICADAS");
    expect(Number(ultima[`tablas_nuevas_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
    expect(ultima.tablas_nuevas).toBe([...TABLAS_NUEVAS].sort().join(", "));
    expect(Number(ultima[`tablas_con_rls_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
    expect(Number(ultima[`funciones_solo_servidor_de_${FUNCIONES_SOLO_SERVIDOR.length}`])).toBe(FUNCIONES_SOLO_SERVIDOR.length);
    expect(ultima).not.toHaveProperty("columnas_nuevas");
    expect(await disparadorDeLaCaja(pg!)).toBe(true);
  }, 240_000);

  it("no cambió ni borró un solo dato de los que había (tampoco en «Tus números», que gana un disparador)", async () => {
    expect(await foto(pg!)).toEqual(antes);
  });

  it("el check ampliado admite 'caja' y conserva todos los de antes; lo inventado sigue fuera", async () => {
    const d = await definicionCheck(pg!, "company_metricas", "company_metricas_origen_check");
    for (const v of [...ORIGENES_DE_ANTES, "caja"]) expect(d, v).toContain(`'${v}'`);
    expect(await codigoDe(pg!.query("insert into company_metricas (company_id, clave, periodo, valor, estado, origen) values ($1, 'venta_mes', '2027-02', 1, 'contado', 'inventado')", [EMP]))).toBe("23514");
  });

  it("la caja alimenta a «Tus números» sin pisar lo que había (y se deshace, para que lo que sigue compare con la foto)", async () => {
    const comoServidor = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => consultarComo<T>(pg!, "service_role", null, sql, p);
    await comoServidor("select fin_asegurar_categorias($1)", [EMP]);
    const [venta] = await comoServidor<{ id: string }>("select id from fin_categorias where company_id = $1 and nombre = 'Venta en tienda'", [EMP]);
    await pg!.query("insert into fin_movimientos (company_id, fecha, tipo, categoria_id, monto) values ($1, '2026-11-03', 'ingreso', $2, 1500)", [EMP, venta!.id]);
    const { rows } = await pg!.query<{ clave: string; valor: string; origen: string }>(
      "select clave, valor::text, origen from company_metricas where company_id = $1 and periodo = '2026-11' order by clave",
      [EMP]
    );
    expect(rows).toEqual([
      { clave: "costo_variable_mes", valor: "0.00", origen: "caja" },
      { clave: "ganancia_mes", valor: "1500.00", origen: "caja" },
      { clave: "gasto_fijo_mes", valor: "0.00", origen: "caja" },
      { clave: "venta_mes", valor: "1500.00", origen: "caja" },
    ]);
    // Lo de otros meses no se movió.
    expect((await foto(pg!)).numeros.filter((n) => (n as { periodo: string }).periodo !== "2026-11")).toEqual(antes.numeros);
    // Sin movimientos, el mes deja de salir de la caja; sin categorías, la empresa vuelve a como estaba.
    await pg!.query("delete from fin_movimientos where company_id = $1", [EMP]);
    await pg!.query("delete from fin_categorias where company_id = $1", [EMP]);
    expect(await foto(pg!)).toEqual(antes);
  });

  it("se puede ejecutar por segunda vez: no falla y los datos siguen igual", async () => {
    const resultados = await pg!.exec(armarSql());
    const ultima = resultados[resultados.length - 1]!.rows[0] as Record<string, unknown>;
    expect(ultima.resultado).toBe("MIGRACIONES APLICADAS");
    expect(Number(ultima[`tablas_nuevas_de_${TABLAS_NUEVAS.length}`])).toBe(TABLAS_NUEVAS.length);
    expect(Number(ultima[`funciones_solo_servidor_de_${FUNCIONES_SOLO_SERVIDOR.length}`])).toBe(FUNCIONES_SOLO_SERVIDOR.length);
    expect(await foto(pg!)).toEqual(antes);
    // Un solo disparador de la caja, no dos.
    expect((await pg!.query("select 1 from pg_trigger where tgname = 'company_metricas_la_caja_manda'")).rows).toHaveLength(1);
  }, 240_000);

  it("el navegador no lee ni escribe Finanzas ni ejecuta sus funciones; lo de antes sigue como estaba", async () => {
    for (const t of TABLAS_NUEVAS) {
      await expect(consultarComo(pg!, "authenticated", U_A, `select * from ${t}`), t).rejects.toThrow(/permission denied/);
      await expect(consultarComo(pg!, "anon", null, `select * from ${t}`), t).rejects.toThrow(/permission denied/);
    }
    await expect(consultarComo(pg!, "authenticated", U_A, "select fin_asegurar_categorias($1)", [EMP])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "select fin_cerrar_mes($1, '2026-09-01', null, null, $2)", [EMP, U_A])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "anon", null, "select fin_registrar_pago_cobro(gen_random_uuid(), 1, '2026-10-01', 'efectivo', null)")).rejects.toThrow(/permission denied/);
    // Los huecos que ya se cerraron siguen cerrados, y leer lo suyo sigue funcionando.
    await expect(consultarComo(pg!, "authenticated", U_A, "update actions set estado = 'verificado' where id = $1", [ACC_HECHA])).rejects.toThrow(/permission denied/);
    await expect(consultarComo(pg!, "authenticated", U_A, "select id from os_tareas")).rejects.toThrow(/permission denied/);
    expect(await consultarComo(pg!, "authenticated", U_A, "select id from actions order by id")).toHaveLength(2);
  });
});

describe("Postgres embebido (PGlite), no Supabase: si la base real difiere, no queda nada a medias", () => {
  let pg: PGlite | undefined;

  beforeAll(async () => {
    pg = await produccionDeHoy();
    // Una producción donde alguien puso a mano otro check sobre company_metricas.origen, con otro nombre y sin 'caja':
    // la migración reemplaza company_metricas_origen_check, pero el viejo sigue vivo y más estrecho, y la caja no
    // podría escribir ni un número. El bloque final lo detecta y todo el archivo se deshace.
    await pg.exec(`alter table company_metricas add constraint company_metricas_origen_viejo check (origen in (${ORIGENES_DE_ANTES.map((o) => `'${o}'`).join(",")}))`);
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("se detiene, nombra el check que estorba y no deja aplicada ninguna tabla, función, disparador ni check nuevo", async () => {
    await expect(pg!.exec(armarSql())).rejects.toThrow(/company_metricas_origen_viejo/);
    await pg!.exec("rollback");
    for (const tabla of TABLAS_NUEVAS) expect(await existe(pg!, tabla), tabla).toBe(false);
    expect(await funcionesNuevas(pg!)).toBe(0);
    expect(await disparadorDeLaCaja(pg!)).toBe(false);
    expect(await definicionCheck(pg!, "company_metricas", "company_metricas_origen_check")).not.toContain("'caja'");
    expect(await definicionCheck(pg!, "company_metricas", "company_metricas_origen_viejo")).not.toBeNull();
    expect(await codigoDe(conOrigenCaja(pg!))).toBe("23514");
  }, 240_000);
});
