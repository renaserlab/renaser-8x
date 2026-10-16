/**
 * CANDADO DE ENTORNO: A QUÉ PROYECTO SE LE PUEDE ESCRIBIR, Y DESDE DÓNDE.
 *
 * El 13-10-2026 la base de producción (las cinco empresas reales) estaba en uso
 * en vivo mientras se auditaba el sistema. La única protección era que `tests/supabase/integracion.test.ts`
 * saltara si faltaba SUPABASE_TEST_URL; y esa variable apuntaba al MISMO proyecto que
 * NEXT_PUBLIC_SUPABASE_URL. Los scripts (`scripts/qa.mts`, `prueba-*.mts`) y el worker local usaban
 * `supabaseAdmin()` (service role, salta RLS) contra producción sin que nada se lo impidiera.
 *
 * Comparar dos variables no es un candado: basta que las dos estén mal para que «coincidan». Esto es una
 * lista explícita de destinos permitidos (el ref del proyecto) cruzada con el propósito del proceso. Un
 * destino que no está en la lista no es «probablemente de prueba»: es desconocido y se rechaza. Un proceso
 * que no declara ENTORNO no es «probablemente inofensivo»: es ambiguo y se rechaza.
 *
 * BD, Storage y Auth viven detrás de la misma URL (https://<ref>.supabase.co): comprobar esa URL una vez
 * cubre las tres superficies de escritura.
 *
 * Nada aquí lee process.env al importar. Todo recibe el entorno como parámetro (process.env por defecto)
 * para que las pruebas inyecten el suyo y no dependan del .env real de la máquina.
 */

/** Ref del proyecto de producción. No es credencial: es la parte pública de la URL. */
export const PRODUCCION_REF = "otqfqafstrohugvgbkmd";

/** Quién está corriendo: decide qué tan estricto es el candado. */
export type Contexto = "app" | "vitest" | "script" | "worker";

export type Variables = Record<string, string | undefined>;

/** Por qué se rechaza. Las pruebas y los mensajes de consola se apoyan en esta clase, no en el texto. */
export type ClaseRechazo = "produccion" | "desconocido" | "ambiguo" | "sin_url" | "entorno_invalido" | "configuracion";

export type Veredicto =
  | { ok: true; destino: string }
  | { ok: false; clase: ClaseRechazo; motivo: string; destino: string };

/** Lanzada por exigirDestinoEscritura(). Lleva la clase y el destino para que quien la atrape pueda decidir. */
export class DestinoNoAutorizado extends Error {
  readonly clase: ClaseRechazo;
  readonly destino: string;
  readonly contexto: Contexto;
  constructor(veredicto: Extract<Veredicto, { ok: false }>, contexto: Contexto) {
    super(`Destino de escritura no autorizado (contexto ${contexto}, ${veredicto.clase}): ${veredicto.motivo}`);
    this.name = "DestinoNoAutorizado";
    this.clase = veredicto.clase;
    this.destino = veredicto.destino;
    this.contexto = contexto;
  }
}

// En el runtime Edge de Next no existe process.argv: se degrada a vacío y el contexto cae a "app", que
// es justo lo que ese runtime es.
function argvSeguro(): readonly string[] {
  return typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
}

/**
 * Qué carpeta del repo ejecuta argv[1]: "scripts", "worker" o ninguna.
 *
 * Se mira la ruta ABSOLUTA tal como la entrega Node (argv[1] llega siempre absoluta, aunque el comando
 * haya sido `cd scripts && node tmp/x.mts`), nunca la ruta relativa al cwd. Hacerla relativa al cwd fue
 * el fallo que un verificador reprodujo el 13-10: con el cwd dentro de scripts/, la ruta relativa perdía
 * la carpeta, el contexto caía a «app» y el candado dejaba escribir en producción. Un candado que se
 * abre según desde qué carpeta se invoca no es un candado.
 *
 * Reglas, de la más a la menos importante:
 *  - Lo que viene de node_modules (next, vitest, tsx…) nunca es script ni worker, aunque el repo viva
 *    dentro de una carpeta llamada así: es la app.
 *  - Si hay varias carpetas candidatas, gana la más cercana al archivo: `/home/x/scripts/repo/worker/index.ts`
 *    es worker.
 *  - Un repo clonado bajo una carpeta llamada scripts/ o worker/ puede marcar como «script» un servidor
 *    propio (`node server.mjs`). Ese error va hacia el lado seguro (pide ENTORNO con motivo), nunca hacia
 *    producción; se resuelve declarando PROPOSITO_PROCESO.
 */
function carpetaDelProceso(argv1: string | undefined): "scripts" | "worker" | null {
  if (!argv1) return null;
  // Barras de Windows a barras normales; se descarta el último tramo (el archivo) y se compara sin
  // distinguir mayúsculas porque Windows no las distingue.
  const carpetas = argv1.replace(/\\/g, "/").split("/").slice(0, -1).map((s) => s.toLowerCase());
  if (carpetas.includes("node_modules")) return null;
  for (let i = carpetas.length - 1; i >= 0; i--) {
    if (carpetas[i] === "scripts") return "scripts";
    if (carpetas[i] === "worker") return "worker";
  }
  return null;
}

/**
 * Qué proceso somos. Orden: VITEST manda (un test que importe un script no debe pasar por script);
 * después la declaración explícita PROPOSITO_PROCESO; después la carpeta de argv[1]; si nada encaja, "app"
 * (el runtime de Next en Vercel o `next dev`). No depende del cwd: ver carpetaDelProceso().
 */
export function contextoDelProceso(env: Variables = process.env, argv: readonly string[] = argvSeguro()): Contexto {
  if (env.VITEST) return "vitest";
  const proposito = env.PROPOSITO_PROCESO;
  if (proposito === "script" || proposito === "worker") return proposito;
  const carpeta = carpetaDelProceso(argv[1]);
  if (carpeta === "scripts") return "script";
  if (carpeta === "worker") return "worker";
  return "app";
}

/** El ref de https://<ref>.supabase.co; "local" para localhost/127.0.0.1/::1; "desconocido" para todo lo demás (incluida la ausencia de URL). */
export function destinoDe(url: string | undefined): string {
  if (!url) return "desconocido";
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "desconocido";
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".localhost")) return "local";
  const m = host.match(/^([a-z0-9-]+)\.supabase\.co$/);
  return m ? m[1] : "desconocido";
}

/** DESTINOS_PRUEBA: lista separada por comas de refs (o «local»). Vacía si no está. */
export function destinosPermitidos(env: Variables = process.env): string[] {
  return (env.DESTINOS_PRUEBA ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function hostDe(url: string | undefined): string {
  if (!url) return "(vacía)";
  try {
    return new URL(url).host;
  } catch {
    return "(URL inválida)";
  }
}

/**
 * La regla. Devuelve un veredicto con motivo accionable: qué variable falta o qué valor sobra.
 *
 * - "app": pasa siempre, salvo ENTORNO=prueba con destino producción (un `next dev` de pruebas apuntando
 *   a la base real es un error de configuración, no una operación). Sin ENTORNO se comporta como antes
 *   del candado: Vercel no define ENTORNO y no tiene por qué.
 * - "vitest", "script", "worker": exigen ENTORNO en {prueba, local}, destino listado en DESTINOS_PRUEBA y
 *   destino distinto de producción. Producción se rechaza aunque alguien la haya puesto en la lista.
 * - Única excepción: el worker con ENTORNO=produccion escrito a mano y destino producción. Es la
 *   operación deliberada de atender la cola real; cualquier otro destino con ese ENTORNO se rechaza.
 *
 * `variable` es el nombre de la variable de la que salió `url`, para que el motivo diga cuál corregir.
 */
export function comprobarDestinoEscritura(p: { url: string | undefined; contexto: Contexto; env?: Variables; variable?: string }): Veredicto {
  const env = p.env ?? process.env;
  const variable = p.variable ?? "NEXT_PUBLIC_SUPABASE_URL";
  const destino = destinoDe(p.url);
  const entorno = env.ENTORNO;
  const rechazo = (clase: ClaseRechazo, motivo: string): Veredicto => ({ ok: false, clase, motivo, destino });

  if (p.contexto === "app") {
    if (entorno === "prueba" && destino === PRODUCCION_REF) {
      return rechazo(
        "produccion",
        `ENTORNO=prueba pero ${variable} apunta al proyecto de producción (${PRODUCCION_REF}). O quitas ENTORNO=prueba, si de verdad quieres producción, o cambias ${variable} al proyecto de prueba.`
      );
    }
    return { ok: true, destino };
  }

  if (p.contexto === "worker" && entorno === "produccion") {
    if (destino === PRODUCCION_REF) return { ok: true, destino };
    return rechazo(
      "configuracion",
      `ENTORNO=produccion autoriza al worker solo contra el proyecto de producción (${PRODUCCION_REF}), pero ${variable} apunta a «${destino}» (${hostDe(p.url)}). Corrige ${variable} o cambia ENTORNO a prueba.`
    );
  }

  if (!entorno) {
    return rechazo(
      "ambiguo",
      `Falta ENTORNO. Desde el contexto «${p.contexto}» hay que declarar ENTORNO=prueba o ENTORNO=local (el worker admite además ENTORNO=produccion, escrito a propósito). Sin esa variable el destino es ambiguo y no se escribe nada.`
    );
  }
  if (entorno !== "prueba" && entorno !== "local") {
    return rechazo("entorno_invalido", `ENTORNO=${entorno} no autoriza escrituras desde el contexto «${p.contexto}». Valores aceptados aquí: prueba, local.`);
  }

  if (!p.url) return rechazo("sin_url", `Falta ${variable}: sin ella no se sabe a qué proyecto se escribiría.`);

  if (destino === PRODUCCION_REF) {
    const listada = destinosPermitidos(env).includes(PRODUCCION_REF);
    return rechazo(
      "produccion",
      `${variable} apunta al proyecto de PRODUCCIÓN (${PRODUCCION_REF}). Desde el contexto «${p.contexto}» no se escribe ahí nunca, con ningún ENTORNO.` +
        (listada ? ` Además, quita ${PRODUCCION_REF} de DESTINOS_PRUEBA: producción no es un destino de prueba.` : "") +
        ` Cambia ${variable} al proyecto de prueba.`
    );
  }
  if (destino === "desconocido") {
    return rechazo(
      "desconocido",
      `Destino desconocido: ${variable} (${hostDe(p.url)}) no tiene la forma https://<ref>.supabase.co ni es una URL local (localhost, 127.0.0.1).`
    );
  }

  const lista = destinosPermitidos(env);
  if (!lista.length) {
    return rechazo(
      "configuracion",
      `Falta DESTINOS_PRUEBA: la lista, separada por comas, de refs de proyectos de prueba a los que sí se puede escribir (para un Supabase local, «local»). El destino actual es «${destino}».`
    );
  }
  if (!lista.includes(destino)) {
    return rechazo(
      "desconocido",
      `Destino desconocido: «${destino}» no está en DESTINOS_PRUEBA (${lista.join(", ")}). Si es el proyecto de prueba, añádelo a la lista; si no, corrige ${variable}.`
    );
  }
  return { ok: true, destino };
}

/**
 * Lanza DestinoNoAutorizado si no se puede escribir. Lee NEXT_PUBLIC_SUPABASE_URL, que es la URL con la que
 * `supabaseAdmin()` crea el cliente: la misma para BD (PostgREST), Storage y Auth, así que una sola
 * comprobación protege las tres. Devuelve el destino autorizado para que quien arranca lo imprima.
 */
export function exigirDestinoEscritura(contexto?: Contexto, env: Variables = process.env): string {
  const ctx = contexto ?? contextoDelProceso(env);
  const v = comprobarDestinoEscritura({ url: env.NEXT_PUBLIC_SUPABASE_URL, contexto: ctx, env });
  if (!v.ok) throw new DestinoNoAutorizado(v, ctx);
  return v.destino;
}
