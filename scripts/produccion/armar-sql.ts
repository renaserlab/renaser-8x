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
 * fuera del repositorio), las cuatro del 18-10, RENASER OS y Finanzas del 19-10, y las tres del 28-10.
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
  // Aplicadas en producción el 18-10-2026 por la consultora, pegadas en el editor SQL. Comprobado
  // contra la base: las tres tablas existen (estrategias, seleccion_procesos, expediente_documental).
  "migracion-estrategia.sql", "migracion-seleccion-procesos.sql", "migracion-expediente-documental.sql",
  // Aplicada en producción el 18-10-2026, también pegada en el editor SQL, y esta lista no se
  // actualizó ese día: quedó contándose como pendiente durante dos días. Comprobado contra la base
  // el 20-10-2026, las cuatro cosas que crea están: la tabla `contrato_entregables`, la columna
  // `expediente_documental.activo_clave`, las tres columnas de estado de `org_puestos` y
  // `companies.proxima_sesion` con su enlace.
  //
  // La lección es del tipo que se repite: una lista que se mantiene a mano se desincroniza el día
  // que alguien aplica algo con prisa. Mientras siga a mano, se comprueba contra la base antes de
  // creerle.
  "migracion-correcciones-auditoria.sql",
  // Aplicadas en producción el 19-10-2026 con el CLI de Supabase, cada una en una sola transacción y
  // después de un ensayo que se deshizo a propósito. Comprobado: RENASER OS dejó 16 tablas con RLS y
  // sin permisos para el navegador, 7 funciones y pg_cron con sus 5 trabajos; Finanzas, 8 tablas con
  // RLS, 12 funciones solo del servidor, el check de company_metricas.origen admitiendo 'caja', el
  // disparador «la caja manda» y las 124 cifras de antes sin cambios.
  "migracion-renaser-os.sql", "migracion-finanzas.sql",
  // Aplicadas en producción el 28-10-2026, las tres en un solo archivo pegado en el editor SQL: todo
  // o nada. La última fila del archivo lo dijo, y se volvió a comprobar a mano contra la base: el
  // check del expediente admite «insumo»; el de company_metricas.estado lista los cinco valores que
  // el código escribe (contado, verificado, extraido, descartado, sin_dato), y no los tres de antes,
  // que era el candado que ningún SQL de este repositorio declaraba; y están las cuatro columnas de
  // procedencia de la estrategia con sus dos índices únicos.
  "migracion-insumo.sql", "migracion-estado-metrica.sql", "migracion-estrategia-al-plan.sql",
];

/**
 * LO QUE DESCRIBE LA PRÓXIMA TANDA. Hoy no hay nada pendiente —producción tiene las 40 migraciones de
 * supabase/orden-aplicacion.json—, así que todas estas listas están vacías. Cuando nazca una migración nueva, se
 * llenan con lo suyo y tests/sql/paso-a-produccion.test.ts vuelve a ensayarla. Los ensayos completos de las tandas
 * anteriores están en el historial del repositorio: la estrategia y RENASER OS en el commit 4fdb45b, Finanzas en el
 * b6b55a7, y las tres del 28-10 en el commit que pasó esto a producción. Se escribe la nueva a partir de esos.
 *
 * - CHECKS_AMPLIADOS: tabla, un valor que ya admitía y uno nuevo que debe admitir; el archivo comprueba al final que
 *   de verdad los admita (con la lista vacía ese bloque no se escribe: un `values` vacío es un error de sintaxis).
 * - TABLAS_NUEVAS: la última fila del archivo dice cuáles quedaron, cuántas y con RLS.
 * - COLUMNAS_NUEVAS: exactamente cada `add column if not exists` de lo pendiente (`tabla.columna`).
 * - FUNCIONES_SOLO_SERVIDOR: las que solo debe ejecutar service_role (una que el navegador pudiera ejecutar saltaría
 *   las reglas de la aplicación). Las de los disparadores no van: no se llaman, las dispara la base.
 * - QUE_HACE: la cabecera del archivo, con la verdad de lo que está pendiente hoy y no la de una tanda anterior.
 */
export const CHECKS_AMPLIADOS: readonly (readonly [string, string, string])[] = [];
export const TABLAS_NUEVAS: readonly string[] = [];
export const COLUMNAS_NUEVAS: readonly string[] = [];
export const FUNCIONES_SOLO_SERVIDOR: readonly string[] = [];
export const QUE_HACE: readonly string[] = [];

/** Lo que se dice cuando no hay nada que pasar a producción: mejor eso que un archivo vacío que alguien pegue. */
export const NADA_PENDIENTE = "No hay migraciones pendientes: producción ya tiene todo lo de supabase/orden-aplicacion.json.";

/** Los archivos de supabase/orden-aplicacion.json, en su orden. */
export function archivosDelOrden(): string[] {
  const orden = JSON.parse(readFileSync(path.join(RAIZ, "supabase", "orden-aplicacion.json"), "utf8")) as { archivos: { archivo: string }[] };
  return orden.archivos.map((a) => a.archivo);
}

/**
 * Lo que producción todavía no tiene, en el orden de aplicación. `orden` es para ensayar otro orden (la prueba simula
 * uno en que ya todo está en producción, para comprobar que entonces se dice NADA_PENDIENTE); por defecto, el real.
 */
export function migracionesPendientes(orden: readonly string[] = archivosDelOrden()): string[] {
  return orden.filter((a) => !YA_EN_PRODUCCION.includes(a));
}

export function armarSql(nuevas: readonly string[] = migracionesPendientes()): string {
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
  const campos: string[] = ["'MIGRACIONES APLICADAS' as resultado", "now() as cuando"];
  // El bloque de las tablas estaba escrito siempre, aunque la tanda no creara ninguna: con la lista
  // vacía salía `table_name in ()`, que es un error de sintaxis, y llegaba DESPUÉS del commit —
  // cuando ya no se puede deshacer nada—. El de las columnas sí estaba guardado desde el principio;
  // este no, y nadie lo vio porque hasta hoy toda tanda había creado al menos una tabla. Es el
  // mismo cuidado que ya tenía el bloque de los checks: una lista vacía no escribe nada.
  if (TABLAS_NUEVAS.length) {
    campos.push(
      `(select count(*) from information_schema.tables where table_schema = 'public' and table_name in (${tablas})) as tablas_nuevas_de_${TABLAS_NUEVAS.length}`,
      `(select string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema = 'public' and table_name in (${tablas})) as tablas_nuevas`,
      `(select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname in (${tablas})) as tablas_con_rls_de_${TABLAS_NUEVAS.length}`
    );
  }
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
  // El comentario de la fila final promete solo lo que la fila de verdad trae. La frase de las tablas
  // se escribía SIEMPRE, igual que el bloque que las contaba: con la lista vacía, el archivo anunciaba
  // «qué tablas nuevas quedaron y cuántas tienen RLS» y después no decía ni una palabra de tablas.
  // No rompe nada —es un comentario—, pero es una línea que miente en el archivo que alguien está a
  // punto de pegar en producción, y aquí lo que el archivo dice es lo único que su lector tiene.
  const promesas = [
    TABLAS_NUEVAS.length ? "qué tablas nuevas quedaron (por nombre y cuántas) y cuántas tienen RLS" : "",
    COLUMNAS_NUEVAS.length ? "qué columnas nuevas quedaron (por nombre y cuántas)" : "",
    FUNCIONES_SOLO_SERVIDOR.length ? "cuántas funciones nuevas ejecuta solo el servidor" : "",
  ].filter(Boolean);
  const comprobacion = promesas.length
    ? `-- Comprobación: ${promesas.join("; ")}.`
    : "-- Comprobación: que el archivo llegó hasta el final. Esta tanda no crea tablas, columnas ni funciones que contar.";
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
