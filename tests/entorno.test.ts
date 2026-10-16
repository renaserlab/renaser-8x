/**
 * EL CANDADO DE ENTORNO: NADIE ESCRIBE EN PRODUCCIÓN POR ACCIDENTE.
 *
 * El 13-10-2026 la base de producción estaba en uso en vivo (cinco empresas reales) mientras
 * se auditaba el sistema. En ese momento, las pruebas de integración, `scripts/qa.mts`, los `prueba-*.mts` y
 * el worker local podían escribir en ella con service role, y lo único que lo «impedía» era que
 * `SUPABASE_TEST_URL` existiera… apuntando al mismo proyecto que `NEXT_PUBLIC_SUPABASE_URL`.
 *
 * Este candado (src/lib/entorno.ts) cambia la pregunta. Ya no es «¿coinciden dos variables?» sino «¿quién
 * escribe y en qué lista está el destino?». Producción se rechaza siempre desde pruebas y scripts, aunque
 * alguien la ponga en la lista. Sin ENTORNO declarado, el destino es ambiguo y se rechaza. Un ref que nadie
 * listó es desconocido y se rechaza. Y el runtime de la app en Vercel, que no define ENTORNO, sigue igual.
 *
 * Todas las pruebas inyectan su propio entorno: no dependen del .env de la máquina.
 */
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import path from "path";
import {
  PRODUCCION_REF,
  contextoDelProceso,
  destinoDe,
  destinosPermitidos,
  comprobarDestinoEscritura,
  exigirDestinoEscritura,
  DestinoNoAutorizado,
  type Variables,
} from "@/lib/entorno";
import { soloLectura } from "@/lib/supabase/admin";

const PRODUCCION_URL = `https://${PRODUCCION_REF}.supabase.co`;
const PRUEBA_REF = "abcdefghijklmnopqrst";
const PRUEBA_URL = `https://${PRUEBA_REF}.supabase.co`;

function rechazo(v: ReturnType<typeof comprobarDestinoEscritura>) {
  if (v.ok) throw new Error("se esperaba un rechazo y pasó");
  return v;
}

describe("destinoDe: de la URL al ref", () => {
  it("extrae el ref de https://<ref>.supabase.co", () => {
    expect(destinoDe(PRODUCCION_URL)).toBe(PRODUCCION_REF);
    expect(destinoDe(`${PRUEBA_URL}/rest/v1`)).toBe(PRUEBA_REF);
  });
  it("localhost, 127.0.0.1 y ::1 son «local»", () => {
    expect(destinoDe("http://localhost:54321")).toBe("local");
    expect(destinoDe("http://127.0.0.1:54321")).toBe("local");
    expect(destinoDe("http://[::1]:54321")).toBe("local");
  });
  it("todo lo demás es «desconocido», incluida la ausencia de URL", () => {
    expect(destinoDe(undefined)).toBe("desconocido");
    expect(destinoDe("")).toBe("desconocido");
    expect(destinoDe("no es una url")).toBe("desconocido");
    expect(destinoDe("https://ejemplo.com")).toBe("desconocido");
    expect(destinoDe("https://x.supabase.co.falso.com")).toBe("desconocido");
  });
});

describe("contextoDelProceso: quién está corriendo", () => {
  const sinNada: Variables = {};
  // Node entrega argv[1] siempre absoluto, sea cual sea el cwd; por eso la detección no recibe cwd.
  const raiz = "C:\\Users\\Usuario\\Desktop\\RenaserConsulting";
  it("VITEST manda sobre cualquier otra señal", () => {
    expect(contextoDelProceso({ VITEST: "true" }, ["node", `${raiz}\\scripts\\qa.mts`])).toBe("vitest");
  });
  it("PROPOSITO_PROCESO declara script o worker aunque argv no lo diga", () => {
    expect(contextoDelProceso({ PROPOSITO_PROCESO: "script" }, ["node", "/otro/sitio/x.mjs"])).toBe("script");
    expect(contextoDelProceso({ PROPOSITO_PROCESO: "worker" }, ["node", "/otro/sitio/x.mjs"])).toBe("worker");
  });
  it("argv[1] bajo scripts/ (absoluto, con barras invertidas de Windows) es script; también scripts/tmp/", () => {
    expect(contextoDelProceso(sinNada, ["node", `${raiz}\\scripts\\qa.mts`])).toBe("script");
    expect(contextoDelProceso(sinNada, ["node", `${raiz}\\scripts\\tmp\\e0-cola.mts`])).toBe("script");
    expect(contextoDelProceso(sinNada, ["node", "/home/x/repo/scripts/qa.mts"])).toBe("script");
  });
  it("sigue siendo script aunque el cwd no sea la raíz: `cd scripts && node tmp/e0-cola.mts` (el fallo que abría el candado)", () => {
    // Antes la ruta se hacía relativa al cwd: con cwd=scripts/ quedaba «tmp/e0-cola.mts», el contexto caía a
    // «app» y producción pasaba. argv[1] sigue siendo absoluto en ese caso, y eso es lo que se mira ahora.
    expect(contextoDelProceso(sinNada, ["node", `${raiz}\\scripts\\tmp\\e0-cola.mts`])).toBe("script");
    expect(contextoDelProceso(sinNada, ["node", `${raiz}\\scripts\\tmp\\hondo\\mas\\x.mts`])).toBe("script");
    expect(contextoDelProceso(sinNada, ["node", "/home/x/repo/worker/index.ts"])).toBe("worker");
  });
  it("la detección no distingue mayúsculas (Windows tampoco)", () => {
    expect(contextoDelProceso(sinNada, ["node", `c:\\users\\usuario\\desktop\\renaserconsulting\\Scripts\\qa.mts`])).toBe("script");
  });
  it("argv[1] bajo worker/ es worker", () => {
    expect(contextoDelProceso(sinNada, ["node", `${raiz}\\worker\\index.ts`])).toBe("worker");
  });
  it("el binario de next, argv vacío o una ruta ajena son app", () => {
    expect(contextoDelProceso(sinNada, ["node", `${raiz}\\node_modules\\next\\dist\\bin\\next`])).toBe("app");
    expect(contextoDelProceso(sinNada, [])).toBe("app");
    expect(contextoDelProceso(sinNada, ["node"])).toBe("app");
    expect(contextoDelProceso(sinNada, ["node", "/var/task/___next_launcher.cjs"])).toBe("app");
  });
  it("un repo que viva dentro de una carpeta llamada scripts no convierte a next en script, pero sí reconoce su worker", () => {
    const raro = "/home/x/scripts/repo";
    expect(contextoDelProceso(sinNada, [`${raro}/node_modules/.bin/node`, `${raro}/node_modules/next/dist/bin/next`])).toBe("app");
    expect(contextoDelProceso(sinNada, ["node", `${raro}/node_modules/vitest/vitest.mjs`])).toBe("app");
    // La carpeta más cercana al archivo gana: este es el worker del repo, no un script.
    expect(contextoDelProceso(sinNada, ["node", `${raro}/worker/index.ts`])).toBe("worker");
  });
  it("un archivo que se llame scripts o worker no cuenta: se miran carpetas, no el nombre del archivo", () => {
    expect(contextoDelProceso(sinNada, ["node", `${raiz}\\src\\scripts`])).toBe("app");
    expect(contextoDelProceso(sinNada, ["node", `${raiz}\\worker`])).toBe("app");
  });
});

describe("destinosPermitidos: la lista", () => {
  it("separa por comas, recorta espacios y descarta vacíos", () => {
    expect(destinosPermitidos({ DESTINOS_PRUEBA: ` ${PRUEBA_REF} , local,, ` })).toEqual([PRUEBA_REF, "local"]);
    expect(destinosPermitidos({})).toEqual([]);
  });
});

describe("comprobarDestinoEscritura: la regla", () => {
  it("app + producción sin ENTORNO → ok (Vercel no define ENTORNO y no tiene por qué)", () => {
    const v = comprobarDestinoEscritura({ url: PRODUCCION_URL, contexto: "app", env: {} });
    expect(v).toEqual({ ok: true, destino: PRODUCCION_REF });
  });
  it("app sin URL → ok también: admin.ts conserva su propio error «Faltan …» para ese caso", () => {
    expect(comprobarDestinoEscritura({ url: undefined, contexto: "app", env: {} }).ok).toBe(true);
  });
  it("app + ENTORNO=prueba + producción → rechazado como error de configuración", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: PRODUCCION_URL, contexto: "app", env: { ENTORNO: "prueba" } }));
    expect(v.clase).toBe("produccion");
    expect(v.motivo).toMatch(/ENTORNO=prueba/);
    expect(v.motivo).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
  });
  it("vitest + producción → rechazado aunque DESTINOS_PRUEBA la liste, y el motivo pide quitarla de la lista", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: PRODUCCION_URL, contexto: "vitest", env: { ENTORNO: "prueba", DESTINOS_PRUEBA: PRODUCCION_REF } }));
    expect(v.clase).toBe("produccion");
    expect(v.motivo).toMatch(/PRODUCCIÓN/);
    expect(v.motivo).toMatch(/quita .* de DESTINOS_PRUEBA/);
  });
  it("vitest + prueba listado → ok", () => {
    const v = comprobarDestinoEscritura({ url: PRUEBA_URL, contexto: "vitest", env: { ENTORNO: "prueba", DESTINOS_PRUEBA: `otro,${PRUEBA_REF}` } });
    expect(v).toEqual({ ok: true, destino: PRUEBA_REF });
  });
  it("vitest + prueba NO listado → «desconocido», y el motivo nombra la lista actual", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: PRUEBA_URL, contexto: "vitest", env: { ENTORNO: "prueba", DESTINOS_PRUEBA: "otro" } }));
    expect(v.clase).toBe("desconocido");
    expect(v.motivo).toMatch(/desconocido/i);
    expect(v.motivo).toContain(PRUEBA_REF);
    expect(v.motivo).toContain("otro");
  });
  it("vitest + prueba sin DESTINOS_PRUEBA → rechazado pidiendo la variable", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: PRUEBA_URL, contexto: "vitest", env: { ENTORNO: "prueba" } }));
    expect(v.clase).toBe("configuracion");
    expect(v.motivo).toMatch(/Falta DESTINOS_PRUEBA/);
  });
  it("script sin ENTORNO → «ambiguo», rechazado aunque el destino esté listado", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: PRUEBA_URL, contexto: "script", env: { DESTINOS_PRUEBA: PRUEBA_REF } }));
    expect(v.clase).toBe("ambiguo");
    expect(v.motivo).toMatch(/Falta ENTORNO/);
    expect(v.motivo).toMatch(/ambiguo/);
  });
  it("script con ENTORNO raro → rechazado nombrando los valores válidos", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: PRUEBA_URL, contexto: "script", env: { ENTORNO: "staging", DESTINOS_PRUEBA: PRUEBA_REF } }));
    expect(v.clase).toBe("entorno_invalido");
    expect(v.motivo).toMatch(/prueba, local/);
  });
  it("script + ENTORNO=prueba sin URL → dice qué variable falta", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: undefined, contexto: "script", env: { ENTORNO: "prueba", DESTINOS_PRUEBA: PRUEBA_REF } }));
    expect(v.clase).toBe("sin_url");
    expect(v.motivo).toMatch(/Falta NEXT_PUBLIC_SUPABASE_URL/);
  });
  it("la variable de origen se puede nombrar: el motivo habla de SUPABASE_TEST_URL cuando la URL salió de ahí", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: undefined, contexto: "vitest", env: { ENTORNO: "prueba" }, variable: "SUPABASE_TEST_URL" }));
    expect(v.motivo).toMatch(/Falta SUPABASE_TEST_URL/);
  });
  it("URL que no es Supabase ni local → «desconocido»", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: "https://ejemplo.com", contexto: "vitest", env: { ENTORNO: "prueba", DESTINOS_PRUEBA: PRUEBA_REF } }));
    expect(v.clase).toBe("desconocido");
  });
  it("local: ENTORNO=local + http://127.0.0.1 + «local» en la lista → ok; sin «local» en la lista → desconocido", () => {
    expect(comprobarDestinoEscritura({ url: "http://127.0.0.1:54321", contexto: "script", env: { ENTORNO: "local", DESTINOS_PRUEBA: "local" } })).toEqual({ ok: true, destino: "local" });
    expect(rechazo(comprobarDestinoEscritura({ url: "http://127.0.0.1:54321", contexto: "script", env: { ENTORNO: "local", DESTINOS_PRUEBA: PRUEBA_REF } })).clase).toBe("desconocido");
  });
  it("worker + ENTORNO=produccion + producción → ok: es la operación deliberada", () => {
    expect(comprobarDestinoEscritura({ url: PRODUCCION_URL, contexto: "worker", env: { ENTORNO: "produccion" } })).toEqual({ ok: true, destino: PRODUCCION_REF });
  });
  it("worker + ENTORNO=produccion + otro destino → rechazado (producción explícita solo autoriza producción)", () => {
    const v = rechazo(comprobarDestinoEscritura({ url: PRUEBA_URL, contexto: "worker", env: { ENTORNO: "produccion" } }));
    expect(v.clase).toBe("configuracion");
    expect(v.motivo).toMatch(/ENTORNO=produccion/);
  });
  it("vitest y script con ENTORNO=produccion → rechazados: la excepción es solo del worker", () => {
    for (const contexto of ["vitest", "script"] as const) {
      const v = rechazo(comprobarDestinoEscritura({ url: PRODUCCION_URL, contexto, env: { ENTORNO: "produccion" } }));
      expect(v.clase, contexto).toBe("entorno_invalido");
    }
  });
  it("worker sin ENTORNO → ambiguo, igual que los demás", () => {
    expect(rechazo(comprobarDestinoEscritura({ url: PRODUCCION_URL, contexto: "worker", env: {} })).clase).toBe("ambiguo");
  });
});

describe("exigirDestinoEscritura: lanza con el motivo", () => {
  it("lanza DestinoNoAutorizado con clase, destino y contexto", () => {
    const env: Variables = { NEXT_PUBLIC_SUPABASE_URL: PRODUCCION_URL, ENTORNO: "prueba", DESTINOS_PRUEBA: PRUEBA_REF };
    let capturado: unknown;
    try {
      exigirDestinoEscritura("script", env);
    } catch (e) {
      capturado = e;
    }
    expect(capturado).toBeInstanceOf(DestinoNoAutorizado);
    const e = capturado as DestinoNoAutorizado;
    expect(e.name).toBe("DestinoNoAutorizado");
    expect(e.clase).toBe("produccion");
    expect(e.destino).toBe(PRODUCCION_REF);
    expect(e.contexto).toBe("script");
    expect(e.message).toMatch(/contexto script, produccion/);
  });
  it("devuelve el destino cuando está autorizado", () => {
    expect(exigirDestinoEscritura("script", { NEXT_PUBLIC_SUPABASE_URL: PRUEBA_URL, ENTORNO: "prueba", DESTINOS_PRUEBA: PRUEBA_REF })).toBe(PRUEBA_REF);
  });
  it("sin contexto explícito lo deduce del entorno inyectado (VITEST → vitest, que exige ENTORNO)", () => {
    expect(() => exigirDestinoEscritura(undefined, { VITEST: "true", NEXT_PUBLIC_SUPABASE_URL: PRUEBA_URL })).toThrow(/Falta ENTORNO/);
    // Sin VITEST ni argv de script el contexto es app y producción pasa: así corre Vercel.
    expect(exigirDestinoEscritura(undefined, { NEXT_PUBLIC_SUPABASE_URL: PRODUCCION_URL })).toBe(PRODUCCION_REF);
  });
});

describe("soloLectura: el proxy que no puede escribir", () => {
  const llamadas: string[] = [];
  const builderFalso = {
    select: (cols: string) => {
      llamadas.push(`select ${cols}`);
      return { eq: (c: string, v: string) => `filtrado ${c}=${v}` };
    },
    insert: () => "insertado",
    update: () => "actualizado",
    upsert: () => "upsert",
    delete: () => "borrado",
  };
  const clienteFalso = {
    from: (tabla: string) => {
      llamadas.push(`from ${tabla}`);
      return builderFalso;
    },
    rpc: () => "rpc ejecutado",
    storage: { from: () => ({}) },
    auth: { admin: { createUser: () => "creado" } },
    schema: () => ({}),
    // Las puertas menos evidentes, tal como las expone supabase-js: el PostgrestClient interno con su
    // propio from()/rpc(), el cliente de Edge Functions y el fetch crudo ya firmado.
    rest: { from: () => builderFalso, rpc: () => "rpc por rest" },
    functions: { invoke: () => "función invocada" },
    fetch: () => "http crudo",
    functionsFetch: () => "http crudo a funciones",
    channel: (n: string) => `canal ${n}`,
  } as unknown as SupabaseClient;
  const ro = soloLectura(clienteFalso);

  it("deja pasar from().select() y lo que sigue", () => {
    const r = ro.from("companies").select("id") as unknown as { eq: (c: string, v: string) => string };
    expect(r.eq("id", "1")).toBe("filtrado id=1");
    expect(llamadas).toEqual(["from companies", "select id"]);
  });
  it("lanza en insert, update, upsert y delete, nombrando la tabla y el método", () => {
    const b = ro.from("companies");
    expect(() => b.insert({})).toThrow(/from\("companies"\)\.insert\(\) está vedado/);
    expect(() => b.update({})).toThrow(/vedado/);
    expect(() => b.upsert({})).toThrow(/vedado/);
    expect(() => b.delete()).toThrow(/vedado/);
  });
  it("rpc, storage, auth, schema, rest y functions lanzan al tocarlos", () => {
    expect(() => ro.rpc("take_job")).toThrow(/\.rpc está vedado/);
    expect(() => ro.storage).toThrow(/\.storage está vedado/);
    expect(() => ro.auth).toThrow(/\.auth está vedado/);
    expect(() => ro.schema("public")).toThrow(/\.schema está vedado/);
    // Reproducción del verificador (13-10): `ro.rest.from("x").delete()` pasaba limpio. Ahora no llega ni al from.
    // `rest` es protected en el tipo pero público en el objeto: justo por eso un script en JS llegaba a él.
    const interno = ro as unknown as { rest: { from: (t: string) => { delete: () => unknown } } };
    expect(() => interno.rest.from("x").delete()).toThrow(/\.rest está vedado/);
    expect(() => ro.functions.invoke("lo-que-sea")).toThrow(/\.functions está vedado/);
  });
  it("el fetch crudo firmado con la service role también está vedado", () => {
    const crudo = ro as unknown as { fetch: () => string; functionsFetch: () => string };
    expect(() => crudo.fetch()).toThrow(/\.fetch está vedado/);
    expect(() => crudo.functionsFetch()).toThrow(/\.functionsFetch está vedado/);
  });
  it("lo que no escribe se reenvía intacto", () => {
    expect(ro.channel("x")).toBe("canal x");
  });
});

/**
 * supabaseAdmin() memoriza el cliente por módulo, así que cada caso recarga el módulo (vi.resetModules) con
 * su propio process.env y lo restaura al salir. createClient no abre red al construirse: la clave es falsa.
 */
async function conEntorno<T>(vars: Variables, fn: () => Promise<T>): Promise<T> {
  const previos: Variables = {};
  for (const k of Object.keys(vars)) {
    previos[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    vi.resetModules();
    return await fn();
  } finally {
    for (const k of Object.keys(previos)) {
      if (previos[k] === undefined) delete process.env[k];
      else process.env[k] = previos[k];
    }
    vi.resetModules();
  }
}

describe("supabaseAdmin() pasa por el candado (bajo vitest el contexto es vitest)", () => {
  it("rehúsa crear el cliente contra producción, aunque la lista la incluya", async () => {
    await conEntorno({ NEXT_PUBLIC_SUPABASE_URL: PRODUCCION_URL, SUPABASE_SERVICE_ROLE_KEY: "clave-falsa", ENTORNO: "prueba", DESTINOS_PRUEBA: PRODUCCION_REF }, async () => {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      const { DestinoNoAutorizado: Clase } = await import("@/lib/entorno");
      expect(() => supabaseAdmin()).toThrow(Clase);
      expect(() => supabaseAdmin()).toThrow(/PRODUCCIÓN/);
    });
  });
  it("sin ENTORNO rehúsa como ambiguo antes de mirar las credenciales", async () => {
    await conEntorno({ NEXT_PUBLIC_SUPABASE_URL: PRUEBA_URL, SUPABASE_SERVICE_ROLE_KEY: undefined, ENTORNO: undefined, DESTINOS_PRUEBA: PRUEBA_REF }, async () => {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      expect(() => supabaseAdmin()).toThrow(/Falta ENTORNO/);
    });
  });
  it("crea el cliente contra el proyecto de prueba listado, y lo memoriza", async () => {
    await conEntorno({ NEXT_PUBLIC_SUPABASE_URL: PRUEBA_URL, SUPABASE_SERVICE_ROLE_KEY: "clave-falsa", ENTORNO: "prueba", DESTINOS_PRUEBA: PRUEBA_REF }, async () => {
      const { supabaseAdmin } = await import("@/lib/supabase/admin");
      const a = supabaseAdmin();
      expect(a).toBeDefined();
      expect(supabaseAdmin()).toBe(a);
    });
  });
  it("supabaseSoloLectura() NO pasa por el candado: sirve para inspeccionar producción", async () => {
    await conEntorno({ NEXT_PUBLIC_SUPABASE_URL: PRODUCCION_URL, SUPABASE_SERVICE_ROLE_KEY: "clave-falsa", ENTORNO: undefined, DESTINOS_PRUEBA: undefined }, async () => {
      const { supabaseSoloLectura } = await import("@/lib/supabase/admin");
      const ro = supabaseSoloLectura();
      expect(() => ro.from("companies").insert({})).toThrow(/vedado/);
      expect(() => ro.storage).toThrow(/vedado/);
    });
  });
});

describe("integración estática: quien escribe pasa por el candado", () => {
  const raiz = path.resolve(__dirname, "..");
  const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");
  it("admin.ts llama a exigirDestinoEscritura() antes de createClient en supabaseAdmin()", () => {
    const src = leer("src/lib/supabase/admin.ts");
    const cuerpo = src.slice(src.indexOf("export function supabaseAdmin"), src.indexOf("const MUTACIONES"));
    expect(cuerpo.indexOf("exigirDestinoEscritura()")).toBeGreaterThan(-1);
    expect(cuerpo.indexOf("exigirDestinoEscritura()")).toBeLessThan(cuerpo.indexOf("createClient("));
  });
  it("worker/index.ts exige destino con contexto «worker» antes de correr", () => {
    const src = leer("worker/index.ts");
    expect(src.indexOf('exigirDestinoEscritura("worker")')).toBeGreaterThan(-1);
    expect(src.indexOf('exigirDestinoEscritura("worker")')).toBeLessThan(src.indexOf("correrWorker()"));
  });
  it("la plantilla .env.test.example no contiene el ref de producción como destino", () => {
    const src = leer(".env.test.example");
    const destinos = src.split("\n").find((l) => l.startsWith("DESTINOS_PRUEBA=")) ?? "";
    expect(destinos).not.toContain(PRODUCCION_REF);
    expect(src).toMatch(/^ENTORNO=prueba$/m);
    expect(src).toMatch(/^PRUEBAS_INTEGRACION=0$/m);
  });
});
