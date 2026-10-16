import { protegido, ok, fallo, exigirAcceso } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { registrar, ipDe } from "@/lib/auditoria";
import { validarArchivo } from "@/lib/archivos";
import { MIME_EXCEL, firmaDe, leerExcel } from "@/lib/documentos";
import { letraColumna, type Hoja, type ValorCelda } from "@/lib/documentos/excel";

type Ctx = { params: Promise<{ id: string }> };

/**
 * IMPORTAR LOS PROCESOS QUE LA EMPRESA YA TIENE ESCRITOS.
 *
 * Hasta el 13-10-2026 cada proceso se dictaba uno a uno. Una empresa con su lista en Excel o CSV
 * —nombre, área, responsable, descripción, con el encabezado escrito como sea— la sube aquí: primero ve
 * qué se va a crear y qué se omite (repetidos por nombre, filas sin nombre) y solo al confirmar se
 * escribe. Nada se borra ni se pisa: un nombre que ya existe se omite.
 *
 * QUÉ SE CREA. Un proceso de la lista NO es un proceso dibujado: la empresa dijo que existe; nadie lo ha
 * levantado. Por eso no entra como `as_is`. Todo lo que lee procesos —la lista del dueño, la Ficha de
 * Dirección, el avance del panorama, el diagnóstico, la entrevista, el mapa que se entrega— filtra
 * `version = 'as_is'` y trata cada fila como un flujo dibujado: cuarenta nombres importados le dirían
 * al dueño «Quedó vacío: no llegamos a entender lo que contaste» y subirían el avance sin que nadie
 * hubiera dibujado nada. Se guardan con `version = 'sin_dibujar'` y `origen = 'importado'`, sin nodos
 * y en borrador, con el archivo, la hoja y la fila en `fuentes_usadas`. Así ninguno de esos lectores
 * los cuenta; la Radiografía sí los ve, en nivel 0, que es la verdad. Cuando alguien le dibuja el primer
 * paso, la base lo pasa sola a `as_is` (disparador de la misma migración).
 *
 * LA MIGRACIÓN. Los checks de `processes.version` y `processes.origen` (schema.sql:240-241) no admiten
 * hoy esos dos valores: los amplía supabase/migracion-procesos-importados.sql. Mientras no esté
 * aplicada, Postgres rechaza la escritura (23514) y esta ruta responde 409 diciendo qué falta, sin
 * crear nada. No hay camino de respaldo, a propósito: guardar la lista como `as_is` «dibujado» era
 * decir dos cosas falsas a la vez. La vista previa funciona siempre, porque no escribe.
 *
 * Todo vive en este archivo, sin exportar nada más que POST: un archivo de ruta de Next solo exporta
 * métodos HTTP. La parte pura (leer el CSV, reconocer columnas, armar la vista previa) se prueba a
 * través de la ruta, con dobles.
 */
const ORIGEN_IMPORTADO = "importado";
/** En la lista de la empresa y sin dibujar: ni AS-IS ni TO-BE. Ningún lector de `as_is` lo cuenta. */
const VERSION_SIN_DIBUJAR = "sin_dibujar";
const MIGRACION = "supabase/migracion-procesos-importados.sql";
const CHECK_VIOLADO = "23514";
const MAX_PROCESOS = 500;
const MAX_NOMBRE = 160;

const SINONIMOS: Record<"nombre" | "area" | "responsable" | "descripcion", string[]> = {
  nombre: ["nombre", "proceso", "nombre del proceso", "nombre proceso", "titulo", "actividad", "procedimiento"],
  area: ["area", "departamento", "unidad", "gerencia", "seccion"],
  responsable: ["responsable", "dueno", "dueno del proceso", "encargado", "quien lo hace", "quien", "cargo responsable"],
  descripcion: ["descripcion", "detalle", "que hace", "como se hace", "observaciones", "notas", "alcance"],
};

/** «Área» → «area»; «Nombre_del_Proceso» → «nombre del proceso». Encabezados y nombres se comparan así. */
const normalizar = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();

type Columnas = Record<keyof typeof SINONIMOS, { indice: number; encabezado: string } | null>;

function reconocer(encabezados: string[]): Columnas {
  const normalizados = encabezados.map(normalizar);
  const usados = new Set<number>();
  const salida = {} as Columnas;
  for (const campo of Object.keys(SINONIMOS) as (keyof typeof SINONIMOS)[]) {
    let hallado: Columnas[keyof Columnas] = null;
    for (const s of SINONIMOS[campo]) {
      const i = normalizados.findIndex((n, idx) => n === s && !usados.has(idx));
      if (i >= 0) {
        hallado = { indice: i, encabezado: encabezados[i] };
        break;
      }
    }
    if (hallado) usados.add(hallado.indice);
    salida[campo] = hallado;
  }
  return salida;
}

/**
 * Los bytes de un CSV como texto. Excel en Windows guarda «CSV» en la codificación del sistema
 * (Windows-1252) y solo «CSV UTF-8» en UTF-8: si los bytes no son UTF-8 válido se leen como
 * Windows-1252, que es lo que eran. Sin esto «Área» llegaba rota y la columna no se reconocía.
 */
function textoDeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Corta por salto de línea respetando los saltos que van dentro de comillas. */
function partirLineas(texto: string): string[] {
  const lineas: string[] = [];
  let actual = "";
  let dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') dentro = !dentro;
    if (!dentro && (c === "\n" || c === "\r")) {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      lineas.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function partirCampos(linea: string, separador: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (dentro && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else dentro = !dentro;
      continue;
    }
    if (c === separador && !dentro) {
      campos.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  campos.push(actual);
  return campos;
}

/**
 * Un CSV leído como si fuera una hoja: el separador es el que parte la cabecera en más columnas (punto
 * y coma, coma o tabulador), comillas dobles con «""» como escape, marca de orden de bytes fuera.
 * Devuelve la misma forma que leerExcel para que el resto del camino no distinga de dónde vino la tabla.
 */
function csvComoHoja(texto: string, nombre: string): Hoja {
  const lineas = partirLineas(texto.replace(/^﻿/, ""));
  const primera = lineas.find((l) => l.trim()) ?? "";
  const separador = [";", ",", "\t"].map((s) => [s, partirCampos(primera, s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const crudas = lineas.map((l, i) => ({ numero: i + 1, campos: partirCampos(l, separador) })).filter((f) => f.campos.some((c) => c.trim() !== ""));
  if (!crudas.length) return { nombre, encabezados: [], filaEncabezados: null, filas: [], resumen: [], vacias: [], avisos: ["El CSV está vacío."] };
  const [cabecera, ...resto] = crudas;
  const encabezados = cabecera.campos.map((c) => c.trim());
  const filas = resto.map((f) => ({
    numero: f.numero,
    celdas: encabezados.map((_, i) => {
      const valor = (f.campos[i] ?? "").trim();
      return { ref: `${letraColumna(i + 1)}${f.numero}`, valor: valor === "" ? null : (valor as ValorCelda) };
    }),
  }));
  const vacias = encabezados.map((columna, i) => ({
    columna: columna || `columna ${letraColumna(i + 1)}`,
    letra: letraColumna(i + 1),
    vacias: filas.filter((f) => f.celdas[i].valor === null).length,
    de: filas.length,
  }));
  return { nombre, encabezados, filaEncabezados: cabecera.numero, filas, resumen: [], vacias, avisos: [] };
}

const textoDe = (v: ValorCelda): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

type ProcesoImportado = { fila: number; nombre: string; area: string | null; responsable: string | null; descripcion: string | null };
type Omitido = { fila: number; nombre: string | null; motivo: string };

/**
 * Qué se crearía: cada fila con nombre que no repita uno existente (por nombre normalizado: sin
 * mayúsculas ni tildes) ni uno anterior del mismo archivo. Lo demás se omite con su motivo. «Existente»
 * es tanto lo que la empresa ya tiene dibujado como lo que ya trajo en una lista anterior, y el motivo
 * dice cuál de los dos. Puro: se calcula igual para la vista previa y para confirmar, así lo que se
 * confirma es lo que se vio.
 */
function vistaPrevia(hoja: Hoja, existentes: { nombre: string; version?: string | null }[]): { columnas: Columnas; faltantes: string[]; nuevos: ProcesoImportado[]; omitidos: Omitido[] } {
  const columnas = reconocer(hoja.encabezados);
  const faltantes = (Object.keys(columnas) as (keyof Columnas)[]).filter((c) => !columnas[c]);
  const nuevos: ProcesoImportado[] = [];
  const omitidos: Omitido[] = [];
  if (!columnas.nombre) return { columnas, faltantes, nuevos, omitidos };
  const yaExiste = new Set<string>();
  const yaEnLista = new Set<string>();
  for (const e of existentes) (e.version === VERSION_SIN_DIBUJAR ? yaEnLista : yaExiste).add(normalizar(e.nombre));
  const enArchivo = new Map<string, number>();
  const valor = (f: Hoja["filas"][number], c: keyof Columnas) => {
    const col = columnas[c];
    return col ? textoDe(f.celdas[col.indice]?.valor ?? null) : null;
  };
  for (const f of hoja.filas) {
    const nombre = valor(f, "nombre");
    if (!nombre) {
      omitidos.push({ fila: f.numero, nombre: null, motivo: "sin nombre" });
      continue;
    }
    if (nombre.length > MAX_NOMBRE) {
      omitidos.push({ fila: f.numero, nombre: `${nombre.slice(0, 60)}…`, motivo: `el nombre pasa de ${MAX_NOMBRE} letras: parece una descripción, no un nombre` });
      continue;
    }
    const k = normalizar(nombre);
    if (yaExiste.has(k)) {
      omitidos.push({ fila: f.numero, nombre, motivo: "ya existe un proceso con ese nombre en la empresa" });
      continue;
    }
    if (yaEnLista.has(k)) {
      omitidos.push({ fila: f.numero, nombre, motivo: "ya está en la lista de la empresa, sin dibujar todavía" });
      continue;
    }
    if (enArchivo.has(k)) {
      omitidos.push({ fila: f.numero, nombre, motivo: `repetido en el archivo (ya está en la fila ${enArchivo.get(k)})` });
      continue;
    }
    enArchivo.set(k, f.numero);
    nuevos.push({ fila: f.numero, nombre, area: valor(f, "area"), responsable: valor(f, "responsable"), descripcion: valor(f, "descripcion") });
  }
  return { columnas, faltantes, nuevos, omitidos };
}

/**
 * POST multipart: archivo (.xlsx o .csv), modo (vista_previa | confirmar), hoja?.
 * Vista previa: { archivo, hoja, hojas, columnas, faltantes, nuevos, omitidos, total_filas }.
 * Confirmar: además { creados, ids } y, si se creó algo, { origen, version }. 409 si la base todavía no
 * admite un proceso «sin dibujar» (migración sin aplicar): no se crea ninguno.
 */
export const POST = protegido<Ctx>({ consultor: true, cupo: "subida", entidad: "processes" }, async (perfil, req, ctx) => {
  const { id } = await ctx.params;
  await exigirAcceso(perfil, id);
  const form = await req.formData();
  const archivo = form.get("archivo");
  if (!(archivo instanceof File)) return fallo("Sube el Excel (.xlsx) o el CSV con la lista de procesos.");
  const v = validarArchivo({ nombre: archivo.name, mime: archivo.type || "application/octet-stream", bytes: archivo.size });
  if (!v.ok) return fallo(v.error);
  const modo = String(form.get("modo") ?? "vista_previa");
  if (modo !== "vista_previa" && modo !== "confirmar") return fallo("El modo tiene que ser vista_previa o confirmar.");
  const hojaPedida = String(form.get("hoja") ?? "").trim() || null;

  const bytes = Buffer.from(await archivo.arrayBuffer());
  const esExcel = v.mime === MIME_EXCEL;
  let hojas: Hoja[];
  if (esExcel) {
    if (firmaDe(bytes) !== "zip") return fallo("El archivo dice ser un Excel (.xlsx) pero su contenido no lo es. Ábrelo en Excel y guárdalo de nuevo como .xlsx.");
    try {
      hojas = (await leerExcel(bytes)).hojas;
    } catch {
      return fallo("No pudimos abrir ese Excel: parece dañado o no es un .xlsx de verdad. Ábrelo en Excel, guárdalo de nuevo y súbelo otra vez.");
    }
  } else if (v.mime === "text/csv" || v.mime === "application/csv") {
    if (firmaDe(bytes) !== "otra") return fallo("El archivo dice ser un CSV pero su contenido no es texto. Si es un Excel, guárdalo como .xlsx y súbelo de nuevo.");
    hojas = [csvComoHoja(textoDeCsv(bytes), v.nombre)];
  } else {
    return fallo("Para importar procesos hace falta un Excel (.xlsx) o un CSV con las columnas nombre, área, responsable y descripción.");
  }

  const candidatas = hojaPedida ? hojas.filter((h) => h.nombre === hojaPedida) : hojas;
  const hoja = candidatas.find((h) => h.filas.length && reconocer(h.encabezados).nombre) ?? null;
  if (!hoja) {
    return fallo(
      hojaPedida
        ? `La hoja «${hojaPedida}» no tiene una columna con el nombre del proceso.`
        : `No encontramos una columna con el nombre del proceso. Se aceptan encabezados como: ${SINONIMOS.nombre.join(", ")}.`
    );
  }

  const sb = supabaseAdmin();
  // Cuenta como existente lo que la empresa ya tiene dibujado y lo que ya trajo en una lista anterior. Un
  // TO-BE no: es el rediseño de un proceso y lleva su mismo nombre a propósito.
  const { data: leidos, error } = await sb.from("processes").select("id,nombre,version").eq("company_id", id);
  if (error) return fallo(`No pudimos leer los procesos de la empresa: ${error.message}`, 500);
  const existentes = ((leidos ?? []) as { nombre: string; version: string | null }[]).filter((p) => p.version !== "to_be");
  const vista = vistaPrevia(hoja, existentes);
  if (vista.nuevos.length > MAX_PROCESOS) return fallo(`El archivo trae ${vista.nuevos.length} procesos nuevos; el tope por importación es ${MAX_PROCESOS}. Divídelo.`);
  const base = {
    archivo: v.nombre,
    hoja: esExcel ? hoja.nombre : null,
    hojas: esExcel ? hojas.map((h) => h.nombre) : [],
    columnas: Object.fromEntries(Object.entries(vista.columnas).map(([c, x]) => [c, x?.encabezado ?? null])),
    faltantes: vista.faltantes,
    nuevos: vista.nuevos,
    omitidos: vista.omitidos,
    total_filas: hoja.filas.length,
  };
  if (modo === "vista_previa") return ok(base);

  if (!vista.nuevos.length) return ok({ ...base, creados: 0, ids: [] });
  const fecha = new Date().toISOString().slice(0, 10);
  const filas = vista.nuevos.map((p) => ({
    company_id: id,
    nombre: p.nombre,
    area: p.area,
    responsable: p.responsable,
    descripcion_original: p.descripcion,
    version: VERSION_SIN_DIBUJAR,
    origen: ORIGEN_IMPORTADO,
    confirmacion: "borrador",
    // Misma forma que las referencias de fuentes del resto del sistema (nombre y versión), más de qué
    // hoja y fila salió. `id` va null: el archivo se leyó aquí y no se guardó como fuente.
    fuentes_usadas: [{ id: null, nombre: v.nombre, version: fecha, tipo: ORIGEN_IMPORTADO, hoja: esExcel ? hoja.nombre : null, fila: p.fila }],
  }));

  const insercion = await sb.from("processes").insert(filas).select("id");
  if (insercion.error?.code === CHECK_VIOLADO) {
    // Una sola sentencia: si el check la rechazó, no entró ninguna fila. No se reintenta como `as_is`:
    // eso metería la lista entre los procesos dibujados, que es justo lo que no es.
    return fallo(
      `Esta base todavía no deja guardar procesos «de la lista, sin dibujar»: falta aplicar ${MIGRACION}. No se creó ningún proceso. Lo que viste en la vista previa sigue valiendo: confirma cuando la migración esté aplicada.`,
      409
    );
  }
  if (insercion.error) return fallo(`No pudimos crear los procesos: ${insercion.error.message}`, 500);
  const ids = ((insercion.data ?? []) as { id: string }[]).map((c) => c.id);
  void registrar({
    companyId: id,
    actor: perfil,
    accion: "crear",
    entidad: "processes",
    detalle: { archivo: v.nombre, hoja: base.hoja, creados: ids.length, omitidos: vista.omitidos.length, origen: ORIGEN_IMPORTADO, version: VERSION_SIN_DIBUJAR },
    ruta: "/api/companies/procesos/importar",
    ip: ipDe(req),
  });
  return ok({ ...base, creados: ids.length, ids, origen: ORIGEN_IMPORTADO, version: VERSION_SIN_DIBUJAR }, 201);
});
