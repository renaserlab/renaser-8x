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
 * documenta, las 13 de la rama del 13-10 (aplicadas en producción el 15-10-2026) y la del 16-10 que deja entrar
 * al cliente (aplicada el 16-10-2026; el archivo que se pegó es clientes/8x-ejecucion/produccion-2026-10-16.sql,
 * fuera del repositorio).
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
];

/**
 * Checks que se amplían: tabla, un valor que ya admitía y uno nuevo que debe admitir. Los seis de la rama del
 * 13-10 ya se comprobaron al aplicarla en producción (15-10). Lo pendiente hoy (migracion-estrategia.sql) amplía dos:
 * el bloque de comprobación final mira que de verdad admitan el valor nuevo. Con la lista vacía ese bloque no se
 * escribe: un `values` vacío es un error de sintaxis.
 */
export const CHECKS_AMPLIADOS: readonly (readonly [string, string, string])[] = [
  ["solicitudes_cliente", "productos", "preguntas_estrategia"],
  ["deliverables", "plan_90", "plan_estrategico"],
];

/** Las tablas que crea lo pendiente: la última fila del archivo dice cuáles quedaron, cuántas y con RLS. */
export const TABLAS_NUEVAS: readonly string[] = ["estrategias", "estrategia_ediciones", "estrategia_preguntas"];

/**
 * Las columnas que lo pendiente añade a tablas que ya existían (`tabla.columna`): la última fila dice cuáles quedaron
 * y cuántas. Tiene que ser exactamente cada `add column if not exists` de lo pendiente (lo comprueba
 * tests/sql/paso-a-produccion.test.ts). Hoy ninguna: con la lista vacía, la fila final no las cuenta (un `values`
 * vacío sería un error de sintaxis).
 */
export const COLUMNAS_NUEVAS: readonly string[] = [];

/**
 * Las funciones que crea lo pendiente y que solo debe poder ejecutar el servidor (service_role): la fila final dice
 * cuántas quedaron así. Una que el navegador pudiera ejecutar saltaría las reglas de la aplicación.
 */
export const FUNCIONES_SOLO_SERVIDOR: readonly string[] = ["estrategia_lente_lista", "aprobar_estrategia"];

/** Lo que dice la cabecera del archivo: la verdad de lo que hoy está pendiente, no la de una tanda anterior. */
export const QUE_HACE: readonly string[] = [
  "QUÉ HACE: añade 3 tablas con RLS para la estrategia que 8X genera sola (estrategias: una fila por versión;",
  "estrategia_ediciones: el rastro de lo que corrige la consultora, que no se cambia; estrategia_preguntas: lo que falta",
  "saber, convertido en preguntas para el dueño), 2 funciones que solo ejecuta el servidor (estrategia_lente_lista y",
  "aprobar_estrategia), y amplía 2 checks agregando un valor a cada uno: solicitudes_cliente.seccion admite",
  "preguntas_estrategia y deliverables.tipo admite plan_estrategico. Desde el navegador nadie escribe en las 3 tablas (la",
  "consultora solo las lee; el dueño, nada): todo pasa por la aplicación. Aprobar compara la hora de la fila (bloqueo optimista).",
  "NO borra ni cambia ningún dato existente. El código que hoy está en producción sigue funcionando igual con esto aplicado.",
  "Se puede ejecutar dos veces sin daño. Para deshacerlo sin perder filas: supabase/revertir/migracion-estrategia.sql.",
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
  const texto = armarSql();
  writeFileSync(salida, texto, "utf8");
  console.log(`${migracionesPendientes().length} migraciones · ${texto.split(String.fromCharCode(10)).length} líneas → ${salida}`);
  for (const a of migracionesPendientes()) console.log("  ·", a);
}
