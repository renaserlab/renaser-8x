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
 * documenta, y las 13 de la rama del 13-10, aplicadas en producción el 15-10-2026.
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
];

/**
 * Checks que se amplían: tabla, un valor que ya admitía y uno nuevo que debe admitir. Los seis de la rama del
 * 13-10 ya se comprobaron al aplicarla en producción (15-10); lo pendiente hoy no amplía ninguno. Con la lista
 * vacía, el bloque de comprobación final no se escribe: un `values` vacío es un error de sintaxis.
 */
export const CHECKS_AMPLIADOS: readonly (readonly [string, string, string])[] = [];

/** Las tablas que crea lo pendiente: la última fila del archivo dice cuáles quedaron, cuántas y con RLS. */
export const TABLAS_NUEVAS: readonly string[] = ["costos_mes", "ficha_negocio", "operaciones_moneda", "solicitudes_cliente", "ruta_marcas", "process_versiones"];

/**
 * Las columnas que lo pendiente añade a tablas que ya existían (`tabla.columna`): la última fila dice cuáles quedaron
 * y cuántas. Tiene que ser exactamente cada `add column if not exists` de lo pendiente (lo comprueba
 * tests/sql/paso-a-produccion.test.ts).
 */
export const COLUMNAS_NUEVAS: readonly string[] = [
  "companies.modelo_negocio", "companies.tipo_trabajo", "companies.ruta_inicio", "companies.hora_cierre",
  "lineas_producto.modelo", "lineas_producto.grupo", "lineas_producto.canal", "lineas_producto.precio_segundo",
  "lineas_producto.segundo_precio_es", "lineas_producto.de_cada_10_segundo", "lineas_producto.componentes_costo",
  "lineas_producto.unidades_mes", "lineas_producto.unidades_mes_desde", "lineas_producto.unidades_mes_hasta",
  "lineas_producto.participacion_de_10", "lineas_producto.estados", "lineas_producto.datos_modelo", "lineas_producto.creada_por",
];

/** Lo que dice la cabecera del archivo: la verdad de lo que hoy está pendiente, no la de una tanda anterior. */
export const QUE_HACE: readonly string[] = [
  "QUÉ HACE: añade 6 tablas con RLS (costos_mes, ficha_negocio, operaciones_moneda, solicitudes_cliente, ruta_marcas,",
  "process_versiones: la copia de un proceso antes de volver a dibujarlo con un archivo),",
  "columnas en companies (modelo_negocio, tipo_trabajo, ruta_inicio, hora_cierre) y en lineas_producto (dos precios, costo",
  "por partes, cuánto se vende al mes, estado de cada dato), y rehace la vista lineas_producto_cliente con esas columnas.",
  "NO borra ni cambia ningún dato existente. El código que hoy está en producción sigue funcionando igual con esto aplicado.",
  "Se puede ejecutar dos veces sin daño.",
];

export function migracionesPendientes(): string[] {
  const orden = JSON.parse(readFileSync(path.join(RAIZ, "supabase", "orden-aplicacion.json"), "utf8")) as { archivos: { archivo: string }[] };
  return orden.archivos.map((a) => a.archivo).filter((a) => !YA_EN_PRODUCCION.includes(a));
}

export function armarSql(): string {
  const nuevas = migracionesPendientes();
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
  partes.push(
    [
      "",
      "",
      "commit;",
      "",
      "-- Comprobación: qué tablas y columnas nuevas quedaron (por nombre y cuántas) y cuántas tablas nuevas tienen RLS.",
      "select 'MIGRACIONES APLICADAS' as resultado, now() as cuando,",
      `       (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (${tablas})) as tablas_nuevas_de_${TABLAS_NUEVAS.length},`,
      `       (select string_agg(table_name, ', ' order by table_name) from information_schema.tables where table_schema = 'public' and table_name in (${tablas})) as tablas_nuevas,`,
      `       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname in (${tablas})) as tablas_con_rls_de_${TABLAS_NUEVAS.length},`,
      `       (select count(*) from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (values ${columnas})) as columnas_nuevas_de_${COLUMNAS_NUEVAS.length},`,
      `       (select string_agg(table_name || '.' || column_name, ', ' order by table_name, column_name) from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (values ${columnas})) as columnas_nuevas;`,
      "",
    ].join("\n")
  );
  return partes.join("");
}

// Solo al ejecutarlo como programa: importarlo desde una prueba no escribe nada.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const salida = process.argv[2];
  if (!salida) {
    console.error("Falta la ruta de salida. Uso: node --import=tsx scripts/produccion/armar-sql.ts <salida.sql>");
    process.exit(2);
  }
  const texto = armarSql();
  writeFileSync(salida, texto, "utf8");
  console.log(`${migracionesPendientes().length} migraciones · ${texto.split(String.fromCharCode(10)).length} líneas → ${salida}`);
  for (const a of migracionesPendientes()) console.log("  ·", a);
}
