import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { exigirDestinoEscritura } from "../entorno";

let _admin: SupabaseClient | null = null;
let _soloLectura: SupabaseClient | null = null;

function credenciales(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

/**
 * Service role: salta RLS. Solo en servidor (rutas API y worker). La frontera se aplica en código.
 *
 * Antes de crear el cliente pasa por el candado de entorno (src/lib/entorno.ts) UNA vez por proceso: el
 * cliente queda memorizado, así que la comprobación solo corre la primera vez que alguien lo pide. En el
 * runtime de la app (Vercel, `next dev`) el candado deja pasar exactamente igual que antes; desde vitest,
 * los scripts y el worker exige ENTORNO y un destino listado en DESTINOS_PRUEBA. BD, Storage y Auth
 * comparten esta URL: una sola comprobación cubre las tres.
 */
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  exigirDestinoEscritura();
  const { url, key } = credenciales();
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

const MUTACIONES = new Set(["insert", "update", "upsert", "delete"]);
// Todas las puertas por las que supabase-js puede escribir, no solo las evidentes:
//  rpc: una función puede escribir y desde fuera no se distingue. storage: sube y borra archivos.
//  auth: auth.admin crea y borra usuarios. schema: sería la puerta trasera a un from() sin vigilar.
//  rest: el PostgrestClient interno, con su propio from() y rpc() sin vigilar (un verificador reprodujo
//  `ro.rest.from("x").delete()` pasando limpio el 13-10). functions: invoca Edge Functions, que escriben lo
//  que quieran. fetch y functionsFetch: el HTTP crudo ya firmado con la service role.
// Lo que no está aquí (realtime, channel, getChannels…) no toca BD, Storage ni Auth.
const SUPERFICIES_VEDADAS = new Set(["rpc", "storage", "auth", "schema", "rest", "functions", "fetch", "functionsFetch"]);

function vedado(que: string): never {
  throw new Error(
    `supabaseSoloLectura(): ${que} está vedado. Este cliente solo inspecciona; para escribir usa supabaseAdmin() con ENTORNO y DESTINOS_PRUEBA apuntando a un proyecto de prueba.`
  );
}

/**
 * Envuelve un cliente para que solo pueda leer tablas y vistas. Es pura: no crea cliente ni mira el
 * entorno, por eso se prueba con un objeto falso. Los métodos se ligan al objeto real (bind) para que la
 * librería siga viendo su propio `this`; lo que devuelve `.select()` ya no puede mutar, así que no se envuelve.
 *
 * Es una barandilla contra el accidente, no una caja fuerte: quien lea `supabaseUrl` y `supabaseKey` del
 * objeto puede construirse otro cliente. Para eso está el candado de entorno; esto evita que un script de
 * inspección escriba sin querer.
 */
export function soloLectura(cliente: SupabaseClient): SupabaseClient {
  return new Proxy(cliente, {
    get(objetivo, prop) {
      if (typeof prop === "string" && SUPERFICIES_VEDADAS.has(prop)) vedado(`.${prop}`);
      if (prop === "from") {
        return (tabla: string) => {
          const builder = objetivo.from(tabla);
          return new Proxy(builder, {
            get(b, p) {
              if (typeof p === "string" && MUTACIONES.has(p)) vedado(`.from("${tabla}").${p}()`);
              const v = Reflect.get(b, p);
              return typeof v === "function" ? v.bind(b) : v;
            },
          });
        };
      }
      const v = Reflect.get(objetivo, prop);
      return typeof v === "function" ? v.bind(objetivo) : v;
    },
  });
}

/**
 * Cliente de solo lectura. NO pasa por el candado de entorno, porque no puede escribir: sirve para
 * inspeccionar producción sin riesgo, y es el que deben usar los scripts de solo lectura
 * (scripts/tmp/e0-*.mts y afines). Deja pasar `.from(...).select(...)` y lanza en insert, update, upsert,
 * delete, rpc, storage, auth, schema, rest, functions y el fetch crudo.
 */
export function supabaseSoloLectura(): SupabaseClient {
  if (_soloLectura) return _soloLectura;
  const { url, key } = credenciales();
  _soloLectura = soloLectura(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  return _soloLectura;
}
