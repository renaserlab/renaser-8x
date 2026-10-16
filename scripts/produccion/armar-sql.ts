/**
 * ARMA EL ÚNICO ARCHIVO SQL QUE SE PEGA EN EL EDITOR DE SUPABASE PARA PASAR A PRODUCCIÓN.
 *
 * Une, en el orden de supabase/orden-aplicacion.json, las migraciones que producción todavía no tiene, dentro de
 * UNA transacción: o entran todas o no entra ninguna. Al final comprueba que los checks que se ampliaron de verdad
 * quedaron ampliados: si en producción el check viejo tenía otro nombre, seguiría vivo y más estrecho, y el código
 * nuevo fallaría al guardar un valor nuevo. El script lo detecta, dice cuál es y deshace todo.
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

/** Lo que producción ya tiene: el esquema base, las 15 migraciones anteriores a esta rama y la que solo documenta. */
export const YA_EN_PRODUCCION: readonly string[] = [
  "schema.sql", "migracion-gobierno.sql", "migracion-circuito.sql", "migracion-mediciones.sql",
  "migracion-evidencia-indicadores.sql", "migracion-borrado.sql", "migracion-borrado-cascada.sql",
  "migracion-borrado-cascada2.sql", "migracion-sipoc-madurez.sql", "migracion-sop-materiales.sql",
  "migracion-eventos.sql", "migracion-eventos-ventana.sql", "migracion-torre.sql", "migracion-procedencia.sql",
  "migracion-huella-agentes.sql", "migracion-decisiones.sql", "migracion-deriva-esquema.sql",
];

/** Checks que se amplían: tabla, un valor que ya admitía y uno nuevo que debe admitir. */
export const CHECKS_AMPLIADOS: readonly (readonly [string, string, string])[] = [
  ["interview_sessions", "sueno_dueno", "entrada_breve"],
  ["actions", "descartado", "propuesto"],
  ["indicadores", "de_cada_10", "soles_por_hora"],
  ["indicadores", "mensual", "quincenal"],
  ["processes", "as_is", "sin_dibujar"],
  ["processes", "generado_ia", "importado"],
];

export const TABLAS_NUEVAS: readonly string[] = [
  "claims_archivo", "ficha_direccion", "lineas_producto", "actas_aceptacion", "accion_historial",
  "indicador_valores", "revisiones_semanales", "iniciativas", "iniciativa_historial",
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
      "-- QUÉ HACE: añade tablas y columnas; amplía checks; reemplaza la función congelar_medicion (ya no borra la",
      "-- línea base anterior); y retira permisos que dejaban a un dueño escribir directo en la base. NO borra ni cambia",
      "-- ningún dato existente. El código que hoy está en producción sigue funcionando igual con esto aplicado.",
      "-- Se puede ejecutar dos veces sin daño.",
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

  const valores = CHECKS_AMPLIADOS.map(([t, v, n]) => `      ('${t}', '${v}', '${n}')`).join(",\n");
  const tablas = TABLAS_NUEVAS.map((t) => `'${t}'`).join(",");
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
      "",
      "commit;",
      "",
      "select 'MIGRACIONES APLICADAS' as resultado, now() as cuando,",
      `       (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (${tablas})) as tablas_nuevas_de_${TABLAS_NUEVAS.length};`,
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
