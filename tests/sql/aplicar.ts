/**
 * POSTGRES EMBEBIDO (PGlite), NO SUPABASE: APLICA EL SQL DEL REPOSITORIO SOBRE UNA BASE VACÍA.
 *
 * Por qué existe. En esta máquina no hay Docker ni CLI de Supabase (decisión D1) y el único proyecto
 * Supabase a mano es producción, donde las pruebas no pueden escribir. PGlite es Postgres compilado a
 * WebAssembly: arranca en memoria en unos segundos y se tira al terminar. Con él se responden tres
 * preguntas que hasta hoy nadie podía responder sin tocar producción: ¿aplica todo el SQL del repo sobre
 * una base vacía?, ¿las funciones hacen lo que dicen?, ¿las políticas RLS filtran de verdad?
 *
 * Qué NO prueba. PostgREST, Auth (GoTrue), Storage API ni Realtime: eso es Supabase, no Postgres. Lo que
 * aquí pasa no garantiza que pase en Supabase; lo que aquí falla, falla seguro en Postgres.
 *
 * Cómo funciona. Una instancia por archivo de prueba (en su beforeAll). Primero el stub con lo mínimo del
 * entorno Supabase (_entorno-supabase.sql), después los archivos de supabase/orden-aplicacion.json en ese
 * orden. Cada archivo se divide en sentencias respetando bloques $$…$$, cadenas y comentarios, y se
 * ejecuta sentencia por sentencia: cuando una falla, el error dice archivo, índice, las primeras 200
 * letras de la sentencia y el mensaje de Postgres. Nada falla en silencio.
 */
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

export const CARPETA_SUPABASE = path.resolve(__dirname, "../../supabase");
export const RUTA_ENTORNO = path.resolve(__dirname, "_entorno-supabase.sql");
export const NOMBRE_ORDEN = "orden-aplicacion.json";

export type EntradaOrden = { archivo: string; depende_de?: string[]; opcional?: boolean; por_que?: string };
export type Aplicado = { archivo: string; sentencias: number };
export type Aviso = { archivo: string; motivo: string };
export type Resultado = { aplicados: Aplicado[]; avisos: Aviso[] };
export type Rol = "anon" | "authenticated" | "service_role";

/** Un fallo al aplicar: quién, dónde y por qué, en un solo mensaje que se puede pegar en un informe. */
export class ErrorDeAplicacion extends Error {
  constructor(
    readonly archivo: string,
    readonly indice: number,
    readonly sentencia: string,
    readonly causa: string
  ) {
    super(`${archivo} · sentencia ${indice} · «${resumen(sentencia)}» → ${causa}`);
    this.name = "ErrorDeAplicacion";
  }
}

function resumen(sentencia: string): string {
  const plano = sentencia.replace(/\s+/g, " ").trim();
  return plano.length > 200 ? `${plano.slice(0, 200)}…` : plano;
}

/** Índice justo después de `cierre` buscando desde `desde`; si no aparece, el final del texto. */
function finDe(sql: string, cierre: string, desde: number): number {
  const k = sql.indexOf(cierre, desde);
  return k === -1 ? sql.length : k + cierre.length;
}

/** Un trozo que solo tiene comentarios no es una sentencia: no se manda a la base. */
function soloComentarios(trozo: string): boolean {
  return trozo.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim() === "";
}

/**
 * Divide un archivo SQL en sentencias. El punto y coma separa, salvo dentro de un bloque con dólar
 * ($$ … $$ o $etiqueta$ … $etiqueta$), una cadena '…' (con '' como escape), un identificador "…" o un
 * comentario (-- o /* *\/). Un `$` suelto NO abre bloque, porque para Postgres tampoco: se deja pasar
 * tal cual y será Postgres quien lo rechace, señalando la sentencia exacta.
 */
export function dividirSentencias(sql: string): string[] {
  const sentencias: string[] = [];
  let actual = "";
  let i = 0;
  const n = sql.length;

  const cerrar = () => {
    const s = actual.trim();
    if (s && !soloComentarios(s)) sentencias.push(s);
    actual = "";
  };

  while (i < n) {
    const c = sql[i];
    const par = sql.slice(i, i + 2);

    if (par === "--") {
      const fin = finDe(sql, "\n", i);
      actual += sql.slice(i, fin);
      i = fin;
      continue;
    }
    if (par === "/*") {
      const fin = finDe(sql, "*/", i + 2);
      actual += sql.slice(i, fin);
      i = fin;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      const fin = Math.min(n, j + 1);
      actual += sql.slice(i, fin);
      i = fin;
      continue;
    }
    if (c === '"') {
      const fin = finDe(sql, '"', i + 1);
      actual += sql.slice(i, fin);
      i = fin;
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const etiqueta = m[0];
        const fin = finDe(sql, etiqueta, i + etiqueta.length);
        actual += sql.slice(i, fin);
        i = fin;
        continue;
      }
    }
    if (c === ";") {
      cerrar();
      i++;
      continue;
    }
    actual += c;
    i++;
  }
  cerrar();
  return sentencias;
}

/** El orden de aplicación, validado: una entrada sin "archivo" es un error del JSON, no una sorpresa después. */
export function leerOrden(carpeta: string = CARPETA_SUPABASE): EntradaOrden[] {
  const ruta = path.join(carpeta, NOMBRE_ORDEN);
  const crudo = JSON.parse(readFileSync(ruta, "utf8")) as { archivos?: unknown };
  if (!Array.isArray(crudo.archivos) || crudo.archivos.length === 0) {
    throw new Error(`${NOMBRE_ORDEN} no tiene la lista "archivos"`);
  }
  return crudo.archivos.map((e, i) => {
    if (typeof e !== "object" || e === null || typeof (e as EntradaOrden).archivo !== "string") {
      throw new Error(`${NOMBRE_ORDEN}: la entrada ${i} no tiene "archivo"`);
    }
    return e as EntradaOrden;
  });
}

/** Todos los .sql de la carpeta, para comprobar que ninguno quede fuera del orden. */
export function archivosSqlDe(carpeta: string = CARPETA_SUPABASE): string[] {
  return readdirSync(carpeta)
    .filter((nombre) => nombre.endsWith(".sql"))
    .sort();
}

/** Una base vacía en memoria. pgcrypto va cargada porque schema.sql:6 la pide y PGlite no la trae de serie. */
export async function crearBase(): Promise<PGlite> {
  const pg = new PGlite({ extensions: { pgcrypto } });
  await pg.waitReady;
  return pg;
}

/** Aplica un archivo sentencia a sentencia. Devuelve cuántas aplicó; si una falla, lanza ErrorDeAplicacion. */
export async function aplicarArchivo(pg: PGlite, ruta: string, nombre: string = path.basename(ruta)): Promise<number> {
  const sentencias = dividirSentencias(readFileSync(ruta, "utf8"));
  for (let i = 0; i < sentencias.length; i++) {
    try {
      await pg.exec(sentencias[i]);
    } catch (e) {
      throw new ErrorDeAplicacion(nombre, i + 1, sentencias[i], e instanceof Error ? e.message : String(e));
    }
  }
  return sentencias.length;
}

/**
 * El stub y después todos los archivos del orden. Un archivo opcional que no existe se salta con aviso
 * (es el caso de migracion-deriva-esquema.sql mientras otro agente la escribe); uno obligatorio que no
 * existe es un error, porque un orden que nombra lo que no hay no se puede confiar.
 */
export async function aplicarTodo(pg: PGlite, opciones: { carpeta?: string; orden?: EntradaOrden[] } = {}): Promise<Resultado> {
  const carpeta = opciones.carpeta ?? CARPETA_SUPABASE;
  const orden = opciones.orden ?? leerOrden(carpeta);
  const aplicados: Aplicado[] = [];
  const avisos: Aviso[] = [];

  aplicados.push({ archivo: path.basename(RUTA_ENTORNO), sentencias: await aplicarArchivo(pg, RUTA_ENTORNO) });

  for (const entrada of orden) {
    const ruta = path.join(carpeta, entrada.archivo);
    if (!existsSync(ruta)) {
      if (entrada.opcional) {
        avisos.push({ archivo: entrada.archivo, motivo: "no existe todavía; está marcado como opcional en el orden y se salta" });
        continue;
      }
      throw new ErrorDeAplicacion(entrada.archivo, 0, "", "el archivo no existe y no está marcado como opcional en el orden");
    }
    aplicados.push({ archivo: entrada.archivo, sentencias: await aplicarArchivo(pg, ruta, entrada.archivo) });
  }
  return { aplicados, avisos };
}

/** Lo que cada archivo de prueba hace en su beforeAll: base nueva con todo aplicado. Si falla, no deja la instancia abierta. */
export async function baseConEsquema(opciones: { carpeta?: string } = {}): Promise<{ pg: PGlite } & Resultado> {
  const pg = await crearBase();
  try {
    const resultado = await aplicarTodo(pg, opciones);
    return { pg, ...resultado };
  } catch (e) {
    await pg.close();
    throw e;
  }
}

/**
 * Ejecuta una consulta como lo haría PostgREST para un usuario: el rol de base y los claims del JWT en
 * la sesión, los dos locales a la transacción para que no se escapen a la siguiente consulta. Aquí los
 * claims los pone la prueba; en Supabase los pone PostgREST tras verificar el JWT. Esa es la diferencia.
 */
export async function consultarComo<T = Record<string, unknown>>(
  pg: PGlite,
  rol: Rol,
  sub: string | null,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return pg.transaction(async (tx) => {
    await tx.exec(`set local role ${rol}`);
    const claims = sub ? { sub, role: rol } : { role: rol };
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await tx.query<T>(sql, params);
    return r.rows;
  });
}
