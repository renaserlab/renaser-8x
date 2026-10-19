/**
 * ARMA EL ÚNICO ARCHIVO SQL QUE SE PEGA EN EL EDITOR DE SUPABASE PARA PASAR A PRODUCCIÓN.
 *
 * Une, en el orden de supabase/orden-aplicacion.json, las migraciones que producción todavía no tiene, dentro de
 * UNA transacción: o entran todas o no entra ninguna. Si lo pendiente amplía algún check (CHECKS_AMPLIADOS), al final
 * comprueba que de verdad quedó ampliado: si en producción el check viejo tenía otro nombre, seguiría vivo y más
 * estrecho, y el código nuevo fallaría al guardar un valor nuevo. El script lo detecta, dice cuál es y deshace todo.
 *
 * No incluye migracion-deriva-esquema.sql: esa describe lo que producción YA tiene.
 * No toca ninguna base: solo lee archivos y escribe uno. El ensayo sobre Postgres embebido está en
 * tests/sql/paso-a-produccion.test.ts.
 *
 * Uso: node --import=tsx scripts/produccion/armar-sql.ts <salida.sql>
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");

/**
 * Lo que producción ya tiene: el esquema base, las 15 migraciones anteriores a la rama del 13-10, la que solo
 * documenta, las 13 de la rama del 13-10 (aplicadas en producción el 15-10-2026), la del 16-10 que deja entrar
 * al cliente (aplicada el 16-10-2026; el archivo que se pegó es clientes/8x-ejecucion/produccion-2026-10-16.sql,
 * fuera del repositorio), la de la estrategia y la de RENASER OS.
 */
export const YA_EN_PRODUCCION: readonly string[] = [
  "schema.sql", "migracion-gobierno.sql", "migracion-circuito.sql", "migracion-mediciones.sql",
  "migracion-evidencia-indicadores.sql", "migracion-borrado.sql", "migracion-borrado-cascada.sql",
  "migracion-borrado-cascada2.sql", "migracion-sipoc-madurez.sql", "migracion-sop-materiales.sql",
  "migracion-eventos.sql", "migracion-eventos-ventana.sql", "migracion-torre.sql", "migracion-procedencia.sql",
  "migracion-huella-agentes.sql", "migracion-decisiones.sql", "migracion-deriva-esquema.sql",
  // Aplicadas en producción el 15-10-2026.
  "migracion-autoridad.sql", "migracion-claims-archivo.sql", "migracion-evidencia-dimensiones.sql",
  "migracion-entrada-y-direccion.sql", "migracion-jobs-cliente-lectura.sql", "migracion-plan-kpi-linea-base.sql",
  "migracion-excelencia-y-cartera.sql", "migracion-revision-revisada.sql", "migracion-cifra-desplazada.sql",
  "migracion-acciones-solo-por-la-api.sql", "migracion-procesos-importados.sql", "migracion-lineas-producto-cliente.sql",
  "migracion-vistas-cliente-solo-lectura.sql",
  // Aplicada en producción el 16-10-2026.
  "migracion-entrar-hoy.sql",
  // Ya estaba en producción el 19-10-2026, aunque este registro la seguía dando por pendiente. Se comprobó en la base:
  // las 3 tablas con RLS, las 2 funciones solo para el servidor, los 2 checks ampliados y el disparador de ediciones.
  "migracion-estrategia.sql",
  // Aplicada en producción el 19-10-2026 (CLI de Supabase, una sola transacción, después de un ensayo que se deshizo
  // a propósito). Comprobado: 16 tablas con RLS y sin permisos para el navegador, 7 funciones, pg_cron con sus 5 trabajos.
  "migracion-renaser-os.sql",
];

/**
 * LO QUE DESCRIBE LA PRÓXIMA TANDA. Hoy no hay nada pendiente, así que todas estas listas están vacías. Cuando nazca
 * una migración nueva, se llenan con lo suyo y tests/sql/paso-a-produccion.test.ts vuelve a ensayarla. La tanda
 * anterior (estrategia y RENASER OS), con su ensayo completo, está en el historial del repositorio, commit 4fdb45b.
 *
 * - CHECKS_AMPLIADOS: tabla, un valor que ya admitía y uno nuevo que debe admitir; el archivo comprueba al final que
 *   de verdad los admita (con la lista vacía ese bloque no se escribe: un `values` vacío es un error de sintaxis).
 * - TABLAS_NUEVAS: la última fila del archivo dice cuáles quedaron, cuántas y con RLS.
 * - COLUMNAS_NUEVAS: exactamente cada `add column if not exists` de lo pendiente (`tabla.columna`).
 * - FUNCIONES_SOLO_SERVIDOR: las que solo debe ejecutar service_role (una que el navegador pudiera ejecutar saltaría
 *   las reglas de la aplicación).
 * - QUE_HACE: la cabecera del archivo, con la verdad de lo que está pendiente hoy y no la de una tanda anterior.
 */
export const CHECKS_AMPLIADOS: readonly (readonly [string, string, string])[] = [];
export const TABLAS_NUEVAS: readonly string[] = [];
export const COLUMNAS_NUEVAS: readonly string[] = [];
export const FUNCIONES_SOLO_SERVIDOR: readonly string[] = [];
export const QUE_HACE: readonly string[] = [];

/** Lo que se dice cuando no hay nada que pasar a producción: mejor eso que un archivo vacío que alguien pegue. */
export const NADA_PENDIENTE = "No hay migraciones pendientes: producción ya tiene todo lo de supabase/orden-aplicacion.json.";

export function migracionesPendientes(): string[] {
  const orden = JSON.parse(readFileSync(path.join(RAIZ, "supabase", "orden-aplicacion.json"), "utf8")) as { archivos: { archivo: string }[] };
  return orden.archivos.map((a) => a.archivo).filter((a) => !YA_EN_PRODUCCION.includes(a));
}

export function armarSql(): string {
  const nuevas = migracionesPendientes();
  if (!nuevas.length) throw new Error(NADA_PENDIENTE);
  const raya = "-- " + "─".repeat(100);
  const partes: string[] = [];
  partes.push(
    [
      "-- " + "═".repeat(100),
      "-- 8X · PASO A PRODUCCIÓN · BASE DE DATOS",
      "-- Generado por scripts/produccion/armar-sql.ts a partir de supabase/orden-aplicacion.json. No editar a mano.",
      "--",
      "-- CÓMO SE USA: pegar TODO este archivo en Supabase → SQL Editor → Run. Corre como una sola transacción:",
      "-- si cualquier paso falla, no queda nada aplicado y el editor muestra el motivo.",
      "-- Si termina bien, la última fila dice «MIGRACIONES APLICADAS».",
      "--",
      ...QUE_HACE.map((l) => `-- ${l}`),
      "-- " + "═".repeat(100),
      "",
      "begin;",
      "",
      "-- Si algo espera demasiado por un bloqueo (alguien usando el sistema en ese instante), se detiene en vez de colgarse.",
      "set local lock_timeout = '20s';",
      "",
    ].join("\n")
  );

  nuevas.forEach((archivo, i) => {
    const cuerpo = readFileSync(path.join(RAIZ, "supabase", archivo), "utf8").trimEnd();
    partes.push(["", raya, `-- ${i + 1} de ${nuevas.length} · ${archivo}`, raya, cuerpo, ""].join("\n"));
  });

  const tablas = TABLAS_NUEVAS.map((t) => `'${t}'`).join(",");
  const columnas = COLUMNAS_NUEVAS.map((c) => {
    const [t, col] = c.split(".");
    return `('${t}','${col}')`;
  }).join(",");
  // La comprobación de los checks ampliados solo se escribe si hay alguno: con la lista vacía, `values` quedaría
  // vacío y el archivo entero fallaría por sintaxis. El begin, el commit y la fila final se quedan siempre.
  if (CHECKS_AMPLIADOS.length) {
    const valores = CHECKS_AMPLIADOS.map(([t, v, n]) => `      ('${t}', '${v}', '${n}')`).join(",\n");
    partes.push(
      [
        "",
        raya,
        "-- COMPROBACIÓN FINAL · los checks ampliados quedaron ampliados de verdad",
        "-- Si en esta base un check viejo tenía otro nombre, sigue vivo y más estrecho que el nuevo. Aquí se detecta,",
        "-- se dice cuál es y se deshace todo.",
        raya,
        "do $$",
        "declare",
        "  par record;",
        "  sobrante text;",
        "begin",
        "  for par in",
        "    select * from (values",
        valores,
        "    ) as t(tabla, valor_viejo, valor_nuevo)",
        "  loop",
        "    select string_agg(conname, ', ') into sobrante",
        "      from pg_constraint",
        "     where conrelid = ('public.' || par.tabla)::regclass",
        "       and contype = 'c'",
        "       and pg_get_constraintdef(oid) like '%' || quote_literal(par.valor_viejo) || '%'",
        "       and pg_get_constraintdef(oid) not like '%' || quote_literal(par.valor_nuevo) || '%';",
        "    if sobrante is not null then",
        "      raise exception 'La tabla % conserva un check antiguo (%) que no admite «%». No se aplicó nada. Hay que quitar ese check a mano y volver a ejecutar.', par.tabla, sobrante, par.valor_nuevo;",
        "    end if;",
        "  end loop;",
        "end $$;",
      ].join("\n")
    );
  }
  // La fila final cuenta solo lo que lo pendiente trae: una lista vacía no se escribe (`in ()` o `values` vacíos
  // son errores de sintaxis y llegarían después del commit, cuando ya no se puede deshacer nada).
  const campos: string[] = [
    "'MIGRACIONES APLICADAS' as resultado",
    "now() as cuando",
    `(select count(*) from information_schema.tables where table_schema = 'public' and table_name in (${tablas})) as tablas_nuevas_de_${TABLAS_NUEVAS.length}`,
    `(select string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema = 'public' and table_name in (${tablas})) as tablas_nuevas`,
    `(select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname in (${tablas})) as tablas_con_rls_de_${TABLAS_NUEVAS.length}`,
  ];
  if (COLUMNAS_NUEVAS.length) {
    campos.push(
      `(select count(*) from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (values ${columnas})) as columnas_nuevas_de_${COLUMNAS_NUEVAS.length}`,
      `(select string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name) from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (values ${columnas})) as columnas_nuevas`
    );
  }
  if (FUNCIONES_SOLO_SERVIDOR.length) {
    const funciones = FUNCIONES_SOLO_SERVIDOR.map((f) => `'${f}'`).join(",");
    campos.push(
      `(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${funciones})` +
        ` and has_function_privilege('service_role', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')` +
        ` and not has_function_privilege('anon', p.oid, 'execute')) as funciones_solo_servidor_de_${FUNCIONES_SOLO_SERVIDOR.length}`
    );
  }
  const comprobacion =
    "-- Comprobación: qué tablas nuevas quedaron (por nombre y cuántas) y cuántas tienen RLS" +
    (COLUMNAS_NUEVAS.length ? "; qué columnas nuevas quedaron (por nombre y cuántas)" : "") +
    (FUNCIONES_SOLO_SERVIDOR.length ? "; cuántas funciones nuevas ejecuta solo el servidor" : "") +
    ".";
  partes.push(["", "", "commit;", "", comprobacion, `select ${campos.join(",\n       ")};`, ""].join("\n"));
  return partes.join("");
}

// Solo al ejecutarlo como programa: importarlo desde una prueba no escribe nada.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const salida = process.argv[2];
  if (!salida) {
    console.error("Falta la ruta de salida. Uso: node --import=tsx scripts/produccion/armar-sql.ts <salida.sql>");
    process.exit(2);
  }
  if (!migracionesPendientes().length) {
    console.log(NADA_PENDIENTE);
    process.exit(0);
  }
  const texto = armarSql();
  writeFileSync(salida, texto, "utf8");
  console.log(`${migracionesPendientes().length} migraciones · ${texto.split(String.fromCharCode(10)).length} líneas → ${salida}`);
  for (const a of migracionesPendientes()) console.log("  ·", a);
}
