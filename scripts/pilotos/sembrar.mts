/**
 * SEMBRAR LOS DOS PILOTOS FICTICIOS EN UN PROYECTO DE PRUEBA. NUNCA EN PRODUCCIÓN.
 *
 *   node --env-file=.env.test --import=tsx scripts/pilotos/sembrar.mts
 *
 * Modas Lucero (tienda de ropa) y Estudio Vargas & Asociados (estudio jurídico) son empresas inventadas
 * (tests/fixtures/pilotos). Este guion las deja en una base como si el consultor y los dueños hubieran
 * hecho el trabajo a mano: la empresa admitida, un dueño con su cuenta y su membresía, el consultor, las
 * personas del equipo, los archivos subidos a Storage con su fuente, y la extracción encolada. Lo que
 * sigue (leer, extraer, contrastar, diagnosticar) lo hace el worker con el modelo; eso no se simula aquí.
 *
 * Reglas que cumple y por qué:
 *  - Pasa por el candado (src/lib/entorno.ts) ANTES de crear ningún cliente: sin ENTORNO=prueba y sin un
 *    destino listado en DESTINOS_PRUEBA aborta con el mensaje del candado y no escribe nada. El 13-10-2026
 *    la única base disponible era la de producción, con empresas reales dentro.
 *  - Usa las mismas funciones que la aplicación (validarArchivo, rutaStorage, encolar, claveIdempotente),
 *    nunca HTTP: lo que queda en la base es exactamente lo que dejaría la ruta POST /api/sources.
 *  - Es idempotente: volver a correrlo encuentra lo que ya sembró y no duplica empresas, usuarios, fuentes
 *    ni trabajos. No borra nada, ni siquiera lo suyo.
 *  - No imprime credenciales. Imprime el ref del destino (público) y, una sola vez, la contraseña de las
 *    cuentas de prueba que acaba de inventar, porque sin ella nadie puede entrar.
 *
 * Cómo se prueba sin base: `sembrar()` se exporta y tests/pilotos/sembrar-candado.test.ts la corre con
 * dobles (candado real, base falsa). El guion solo arranca solo cuando se ejecuta directamente.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirDestinoEscritura, DestinoNoAutorizado, type Variables } from "../../src/lib/entorno";
import { validarArchivo, rutaStorage } from "../../src/lib/archivos";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ_FIXTURES = path.resolve(DIR, "../../tests/fixtures/pilotos");

/** Los correos terminan en .test, dominio reservado para pruebas: nunca llegan a una persona real. */
export const CORREO_CONSULTOR = "consultor@pilotos.renaser.test";

type EntradaBreve = Record<string, string | number | null>;

type Declaraciones = Record<
  "modas_lucero" | "estudio_vargas",
  { empresa: string; sector: string; entrada_breve: EntradaBreve; archivos: string[] }
>;

export type Archivo = {
  archivo: string;
  nombre: string;
  /** Fecha del documento, si el propio documento la dice. null = no consta (y así se guarda). */
  fecha_origen: string | null;
  /** Quién lo produjo, solo si el documento lo dice. */
  autor: string | null;
  periodo_desde: string | null;
  periodo_hasta: string | null;
};

export type Persona = { nombre: string; puesto: string; rol: "dueno" | "socio" | "lider" | "empleado"; es_duenio?: boolean };

export type Piloto = {
  clave: keyof Declaraciones;
  carpeta: string;
  correo_duenio: string;
  nombre_duenio: string;
  /** Qué palabra usa la empresa para quien manda: «la dueña», «el socio». Para el nombre de la fuente de texto. */
  quien_declara: string;
  personas: Persona[];
  archivos: Archivo[];
};

/**
 * Lo que se sabe de cada archivo sale del archivo mismo (generar.py): fechas y periodos que el documento
 * declara. Donde el documento no dice autor ni fecha, aquí va null; un dato que no está no se inventa.
 */
export const PILOTOS: Piloto[] = [
  {
    clave: "modas_lucero",
    carpeta: "modas-lucero",
    correo_duenio: "duena.modas-lucero@pilotos.renaser.test",
    nombre_duenio: "Lucero Quintana",
    quien_declara: "la dueña",
    personas: [
      { nombre: "Lucero Quintana", puesto: "Gerente general", rol: "dueno", es_duenio: true },
      { nombre: "Rosa Mamani", puesto: "Vendedora principal / caja", rol: "empleado" },
      { nombre: "Carmen Huamán", puesto: "Vendedora", rol: "empleado" },
      { nombre: "Jorge Ccahuana", puesto: "Almacén y reparto (medio tiempo)", rol: "empleado" },
    ],
    archivos: [
      { archivo: "funciones-del-personal.docx", nombre: "Funciones del personal (marzo 2025)", fecha_origen: "2025-03-01", autor: "Gerencia de Modas Lucero", periodo_desde: null, periodo_hasta: null },
      { archivo: "contrato-alquiler.pdf", nombre: "Contrato de alquiler del local", fecha_origen: "2025-02-20", autor: null, periodo_desde: "2025-03-01", periodo_hasta: "2027-02-28" },
      { archivo: "ventas-e-inventario.xlsx", nombre: "Ventas, gastos e inventario abril–septiembre 2026", fecha_origen: "2026-09-30", autor: null, periodo_desde: "2026-04-01", periodo_hasta: "2026-09-30" },
    ],
  },
  {
    clave: "estudio_vargas",
    carpeta: "estudio-vargas",
    correo_duenio: "socio.estudio-vargas@pilotos.renaser.test",
    nombre_duenio: "Dr. Vargas",
    quien_declara: "el socio",
    personas: [
      { nombre: "Dr. Vargas", puesto: "Socio", rol: "socio", es_duenio: true },
      { nombre: "Dra. Paredes", puesto: "Abogada", rol: "lider" },
      { nombre: "Sr. Quispe", puesto: "Asistente", rol: "empleado" },
    ],
    archivos: [
      { archivo: "tarifario-2025.pdf", nombre: "Tarifario de honorarios 2025", fecha_origen: "2025-01-01", autor: "Estudio Vargas & Asociados", periodo_desde: "2025-01-01", periodo_hasta: "2025-12-31" },
      { archivo: "procedimiento-seguimiento.docx", nombre: "Procedimiento de seguimiento de casos (borrador)", fecha_origen: null, autor: null, periodo_desde: null, periodo_hasta: null },
      { archivo: "expedientes-2026-I.xlsx", nombre: "Expedientes 2026-I", fecha_origen: "2026-06-30", autor: null, periodo_desde: "2026-01-01", periodo_hasta: "2026-06-30" },
    ],
  },
];

/**
 * La entrada breve como texto, una línea por pregunta, con las palabras del dueño tal como las dio. Es la
 * fuente «observación del cliente» de la que el extractor sacará lo DECLARADO (ventas 80.000, stock «como
 * 40.000»), para que luego se pueda poner al lado de lo EXTRAÍDO de los archivos.
 */
export function textoEntradaBreve(empresa: string, quien: string, entrada: EntradaBreve): string {
  const lineas = Object.entries(entrada).map(([pregunta, respuesta]) => `- ${pregunta}: ${respuesta === null || respuesta === "" ? "(no respondió)" : String(respuesta)}`);
  return [`Entrada breve de ${empresa}. Respuestas de ${quien}, tal como las dio. Empresa y datos ficticios (piloto).`, ...lineas].join("\n");
}

export type FuenteSembrada = { archivo: string | null; source_id: string; job_id: string; trabajo_repetido: boolean; nueva: boolean };

export type EmpresaSembrada = {
  clave: Piloto["clave"];
  nombre: string;
  company_id: string;
  nueva: boolean;
  correo_duenio: string;
  participantes: number;
  fuentes: FuenteSembrada[];
};

export type ResultadoSiembra = {
  destino: string;
  consultor: { id: string; correo: string; nuevo: boolean };
  empresas: EmpresaSembrada[];
  /** true si este guion inventó la contraseña (y entonces el que lo corre tiene que apuntarla). */
  clave_generada: boolean;
  clave: string;
};

export type Opciones = {
  /** Variables de entorno. Por defecto las del proceso; las pruebas inyectan las suyas. */
  env?: Variables;
  /** Carpeta de los fixtures. */
  raiz?: string;
  /** Contraseña de las cuentas de prueba. Si no viene, PILOTOS_CLAVE del entorno; si tampoco, se inventa una. */
  clave?: string;
  log?: (linea: string) => void;
};

type Admin = SupabaseClient;

function fallo(donde: string, error: { message?: string } | null | undefined): never {
  throw new Error(`${donde}: ${error?.message ?? "sin detalle"}`);
}

async function asegurarUsuario(sb: Admin, u: { email: string; nombre: string; rol: "consultor" | "cliente" }, clave: string): Promise<{ id: string; nuevo: boolean }> {
  const { data: existente, error: e0 } = await sb.from("users").select("id,rol").eq("email", u.email).maybeSingle();
  if (e0) fallo(`leer users (${u.email})`, e0);
  if (existente) {
    if (existente.rol !== u.rol) {
      const { error } = await sb.from("users").update({ rol: u.rol }).eq("id", existente.id);
      if (error) fallo(`fijar rol de ${u.email}`, error);
    }
    return { id: existente.id, nuevo: false };
  }
  const { data, error } = await sb.auth.admin.createUser({ email: u.email, password: clave, email_confirm: true, user_metadata: { nombre: u.nombre } });
  if (error || !data?.user) {
    throw new Error(`No se pudo crear la cuenta ${u.email}: ${error?.message ?? "sin usuario en la respuesta"}. Si ya existe en Auth pero no en users, bórrala desde el panel del proyecto de PRUEBA y vuelve a correr.`);
  }
  // El trigger handle_new_user (schema.sql) crea la fila en users con rol cliente. El upsert la asegura
  // aunque el trigger no esté y fija el rol (consultor para la consultora): nunca dos filas.
  const { error: e2 } = await sb.from("users").upsert({ id: data.user.id, email: u.email, nombre: u.nombre, rol: u.rol }, { onConflict: "id" });
  if (e2) fallo(`asegurar users (${u.email})`, e2);
  return { id: data.user.id, nuevo: true };
}

async function asegurarEmpresa(sb: Admin, nombre: string, sector: string): Promise<{ id: string; nueva: boolean }> {
  const { data: existente, error: e0 } = await sb.from("companies").select("id").eq("nombre", nombre).maybeSingle();
  if (e0) fallo(`leer companies (${nombre})`, e0);
  if (existente) return { id: existente.id, nueva: false };
  const { data, error } = await sb.from("companies").insert({ nombre, sector, estado_admision: "admitida" }).select("id").single();
  if (error || !data) fallo(`crear la empresa ${nombre}`, error);
  return { id: data.id, nueva: true };
}

async function asegurarParticipante(sb: Admin, companyId: string, p: Persona, userId: string | null): Promise<void> {
  const { data: existente, error: e0 } = await sb.from("participants").select("id").eq("company_id", companyId).eq("nombre", p.nombre).maybeSingle();
  if (e0) fallo(`leer participants (${p.nombre})`, e0);
  if (existente) return;
  const { error } = await sb.from("participants").insert({ company_id: companyId, nombre: p.nombre, puesto: p.puesto, rol: p.rol, user_id: userId });
  if (error) fallo(`crear participante ${p.nombre}`, error);
}

type FuenteNueva = {
  company_id: string;
  tipo: string;
  nombre: string;
  fecha_origen: string | null;
  mime: string;
  origen: "cliente";
  storage_path?: string;
  contenido?: string;
  autor?: string | null;
  periodo_desde?: string | null;
  periodo_hasta?: string | null;
};

/** Sube el archivo y crea la fuente, o encuentra la fuente que ya existe con ese nombre. */
async function asegurarFuente(sb: Admin, fila: FuenteNueva, cuerpo: Buffer | null): Promise<{ id: string; nueva: boolean }> {
  const { data: existente, error: e0 } = await sb.from("sources").select("id").eq("company_id", fila.company_id).eq("nombre", fila.nombre).maybeSingle();
  if (e0) fallo(`leer sources (${fila.nombre})`, e0);
  if (existente) return { id: existente.id, nueva: false };
  if (cuerpo && fila.storage_path) {
    const { error } = await sb.storage.from("fuentes").upload(fila.storage_path, cuerpo, { contentType: fila.mime, upsert: false });
    if (error) fallo(`subir ${fila.nombre} a Storage`, error);
  }
  const { data, error } = await sb.from("sources").insert(fila).select("id").single();
  if (error || !data) fallo(`crear la fuente ${fila.nombre}`, error);
  return { id: data.id, nueva: true };
}

/**
 * Siembra los dos pilotos. Lanza DestinoNoAutorizado si el entorno no apunta a un destino de prueba
 * listado: esa comprobación ocurre antes de importar nada que pueda crear un cliente.
 */
export async function sembrar(opciones: Opciones = {}): Promise<ResultadoSiembra> {
  const env = opciones.env ?? process.env;
  const log = opciones.log ?? (() => {});
  const raiz = opciones.raiz ?? RAIZ_FIXTURES;

  // EL CANDADO VA PRIMERO. Si no pasa, nada de lo que sigue llega a ejecutarse.
  const destino = exigirDestinoEscritura("script", env);
  log(`Candado: destino de escritura autorizado «${destino}».`);

  const { supabaseAdmin } = await import("../../src/lib/supabase/admin");
  const { encolar, PRIORIDAD, claveIdempotente } = await import("../../src/lib/jobs/queue");
  const sb = supabaseAdmin();

  const declaraciones = JSON.parse(readFileSync(path.join(raiz, "declaraciones.json"), "utf8")) as Declaraciones;
  const claveDada = opciones.clave ?? env.PILOTOS_CLAVE;
  const clave = claveDada ?? randomBytes(12).toString("base64url");

  const consultor = await asegurarUsuario(sb, { email: CORREO_CONSULTOR, nombre: "Consultora RENASER (prueba)", rol: "consultor" }, clave);
  log(`Consultor ${consultor.nuevo ? "creado" : "ya existía"}: ${CORREO_CONSULTOR}`);

  const empresas: EmpresaSembrada[] = [];
  for (const piloto of PILOTOS) {
    const d = declaraciones[piloto.clave];
    const empresa = await asegurarEmpresa(sb, d.empresa, d.sector);
    log(`${d.empresa}: empresa ${empresa.nueva ? "creada" : "ya existía"} (${empresa.id})`);

    const duenio = await asegurarUsuario(sb, { email: piloto.correo_duenio, nombre: piloto.nombre_duenio, rol: "cliente" }, clave);
    const { error: eM } = await sb.from("memberships").upsert({ user_id: duenio.id, company_id: empresa.id, nivel: "dueno" }, { onConflict: "user_id,company_id" });
    if (eM) fallo(`membresía de ${piloto.correo_duenio}`, eM);

    for (const p of piloto.personas) await asegurarParticipante(sb, empresa.id, p, p.es_duenio ? duenio.id : null);

    const fuentes: FuenteSembrada[] = [];
    const encolarExtraccion = async (sourceId: string) => {
      // La misma clave que la ruta POST /api/sources: repetir la siembra devuelve el mismo trabajo.
      const job = await encolar({ company_id: empresa.id, tipo: "extraer", payload: { source_id: sourceId }, prioridad: PRIORIDAD.extraer, idempotency_key: claveIdempotente(["extraer-raiz", sourceId]) });
      return job;
    };

    for (const a of piloto.archivos) {
      if (!d.archivos.includes(a.archivo)) throw new Error(`${a.archivo} no está en declaraciones.json de ${piloto.clave}: no se siembra un archivo que el fixture no declara.`);
      const cuerpo = readFileSync(path.join(raiz, piloto.carpeta, a.archivo));
      // El MIME lo decide el mismo validador de la app a partir de la extensión, como con un navegador que manda octet-stream.
      const v = validarArchivo({ nombre: a.archivo, mime: "application/octet-stream", bytes: cuerpo.byteLength });
      if (!v.ok) throw new Error(`${a.archivo}: ${v.error}`);
      const fuente = await asegurarFuente(
        sb,
        { company_id: empresa.id, tipo: v.tipo, nombre: a.nombre, fecha_origen: a.fecha_origen, storage_path: rutaStorage(empresa.id, v.nombre), mime: v.mime, origen: "cliente", autor: a.autor, periodo_desde: a.periodo_desde, periodo_hasta: a.periodo_hasta },
        cuerpo
      );
      const job = await encolarExtraccion(fuente.id);
      fuentes.push({ archivo: a.archivo, source_id: fuente.id, job_id: job.id, trabajo_repetido: job.duplicado, nueva: fuente.nueva });
      log(`  ${a.archivo} → fuente ${fuente.nueva ? "nueva" : "ya existía"}, extracción ${job.duplicado ? "ya encolada" : "encolada"}`);
    }

    const declaracion = await asegurarFuente(
      sb,
      {
        company_id: empresa.id,
        tipo: "observacion",
        nombre: `Entrada breve · lo que declaró ${piloto.quien_declara}`,
        fecha_origen: new Date().toISOString().slice(0, 10),
        mime: "text/plain",
        origen: "cliente",
        contenido: textoEntradaBreve(d.empresa, piloto.quien_declara, d.entrada_breve),
        autor: piloto.nombre_duenio,
      },
      null
    );
    const jobDeclaracion = await encolarExtraccion(declaracion.id);
    fuentes.push({ archivo: null, source_id: declaracion.id, job_id: jobDeclaracion.id, trabajo_repetido: jobDeclaracion.duplicado, nueva: declaracion.nueva });

    // Lo mismo que hace la ruta al recibir la primera fuente: la empresa pasa de admisión a levantamiento.
    const { error: eE } = await sb.from("companies").update({ etapa: "levantamiento" }).eq("id", empresa.id).eq("etapa", "admision");
    if (eE) fallo(`etapa de ${d.empresa}`, eE);

    empresas.push({ clave: piloto.clave, nombre: d.empresa, company_id: empresa.id, nueva: empresa.nueva, correo_duenio: piloto.correo_duenio, participantes: piloto.personas.length, fuentes });
  }

  return { destino, consultor: { id: consultor.id, correo: CORREO_CONSULTOR, nuevo: consultor.nuevo }, empresas, clave_generada: !claveDada, clave };
}

async function main() {
  try {
    const r = await sembrar({ log: (l) => console.log(l) });
    console.log("");
    console.log(`Sembrado en «${r.destino}»: ${r.empresas.length} empresas, ${r.empresas.reduce((s, e) => s + e.fuentes.length, 0)} fuentes con su extracción encolada.`);
    for (const e of r.empresas) console.log(`  ${e.nombre} · ${e.company_id} · dueño ${e.correo_duenio} · ${e.participantes} personas · ${e.fuentes.filter((f) => f.nueva).length} fuentes nuevas`);
    console.log(`  Consultor: ${r.consultor.correo}`);
    if (r.clave_generada) console.log(`  Contraseña de las cuentas de prueba (inventada ahora; apúntala, no se vuelve a mostrar): ${r.clave}`);
    console.log("Siguiente paso: npm run worker (con el mismo .env.test) para que la extracción corra.");
  } catch (e) {
    if (e instanceof DestinoNoAutorizado) {
      console.error(`\nCANDADO (${e.clase}): ${e.message}\nNo se escribió nada.`);
      process.exit(2);
    }
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

// Solo arranca cuando se ejecuta directamente (node … sembrar.mts). Importado desde una prueba, no hace nada.
const ejecutadoDirectamente = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (ejecutadoDirectamente) void main();
