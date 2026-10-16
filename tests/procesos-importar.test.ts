/**
 * IMPORTAR LA LISTA DE PROCESOS QUE LA EMPRESA YA TIENE (R9.2): PRIMERO SE VE, DESPUÉS SE ESCRIBE,
 * Y LO IMPORTADO NO SE HACE PASAR POR DIBUJADO.
 *
 * Hasta el 13-10-2026 cada proceso se dictaba uno a uno. POST /api/companies/[id]/procesos/importar
 * recibe un Excel o un CSV con nombre, área, responsable y descripción —el encabezado escrito como
 * sea—, muestra qué crearía y qué omite, y solo al confirmar crea los procesos: sin nodos, en borrador,
 * con `version = 'sin_dibujar'` y `origen = 'importado'`, y con el archivo, la hoja y la fila de donde
 * salieron.
 *
 * POR QUÉ «SIN DIBUJAR» Y NO «AS-IS». Todo lo que lee procesos filtra `version = 'as_is'` y trata cada
 * fila como un flujo dibujado. La primera versión de esta ruta guardaba la lista como AS-IS y el dueño
 * leía, de cada nombre importado, «Quedó vacío: no llegamos a entender lo que contaste». Aquí se prueba
 * que eso ya no pasa: ni en la lista del dueño, ni en lo que leen la Ficha de Dirección, el avance y el
 * diagnóstico.
 *
 * LA MIGRACIÓN ESTÁ PEDIDA, NO APLICADA. Los dos valores nuevos los admite
 * supabase/migracion-procesos-importados.sql, que no es de este encargo. Mientras no exista en el
 * repositorio, su texto es la constante MIGRACION_PENDIENTE de este archivo, y la última parte la aplica
 * sobre POSTGRES EMBEBIDO (PGlite, no Supabase) para probar las dos mitades: sin ella la ruta responde
 * 409 y no escribe; con ella escribe y nadie cuenta lo importado como dibujado. Cuando el archivo exista,
 * esta prueba lo lee a él y la constante sobra.
 *
 * CON DOBLES en lo demás: `supabaseAdmin()` es un doble y la sesión la pone la prueba; el archivo se arma
 * aquí mismo con exceljs. Lo que se ejerce es la ruta entera (protegido, lectura del archivo, vista
 * previa, escritura), no PostgREST. Las pantallas se renderizan a HTML en Node; nadie las abrió en un
 * navegador.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";
import type { PGlite } from "@electric-sql/pglite";
import { crearBase, aplicarTodo, leerOrden, dividirSentencias, CARPETA_SUPABASE } from "./sql/aplicar";

type Fila = Record<string, unknown>;
type ErrorBase = { code: string; message: string };
type Insercion = (filas: Fila[]) => Promise<{ data: { id: string }[] | null; error: ErrorBase | null }>;
type Lectura = (filtros: Record<string, unknown>) => Promise<{ data: Fila[] | null; error: ErrorBase | null }>;

/**
 * El doble de `supabaseAdmin()`: lee con la función que se le dé y escribe con la que se le dé. Anota
 * qué tablas se tocaron y cada tanda que se intentó insertar, para poder afirmar «no se escribió nada»
 * o «no se creó ningún nodo» mirando lo que pasó y no lo que se supone.
 */
function baseDoble(opc: { leer: Lectura; insertar: Insercion }) {
  const tablas: string[] = [];
  const inserciones: Fila[][] = [];
  const from = (tabla: string) => {
    tablas.push(tabla);
    const filtros: Record<string, unknown> = {};
    let nuevas: Fila[] | null = null;
    const ejecutar = async () => {
      if (nuevas) {
        inserciones.push(nuevas);
        return opc.insertar(nuevas);
      }
      return opc.leer(filtros);
    };
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        filtros[k] = v;
        return q;
      },
      insert: (f: Fila[]) => {
        nuevas = f;
        return q;
      },
      then: (res: (v: Awaited<ReturnType<typeof ejecutar>>) => unknown, rej?: (e: unknown) => unknown) => ejecutar().then(res, rej),
    };
    return q;
  };
  return { from, tablas, inserciones };
}

const estado = vi.hoisted(() => ({ base: null as unknown, procesos: [] as unknown[] }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), perfilApi: vi.fn(), puedeAcceder: vi.fn(async () => true) }));
vi.mock("@/lib/auditoria", async (original) => ({ ...(await original<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
// La página del consultor pide la lista con listarProcesos (PostgREST, con cuentas embebidas). Aquí esa
// lista la da la prueba, armada con SQL sobre PGlite: se ejerce la página, no la consulta a PostgREST.
vi.mock("@/lib/procesos", () => ({ listarProcesos: vi.fn(async () => estado.procesos) }));
// Desde el 16-10-2026 el cliente también importa, pero solo con «subir_procesos» abierta (exigirLlenado). Aquí esa
// sección está siempre CERRADA: el doble de la base no sabe de membresías ni de pedidos. Con la sección abierta lo
// prueba tests/subir-por-seccion.test.ts, sobre la base en memoria.
vi.mock("@/lib/solicitudes", async (original) => {
  const { AccesoDenegado } = await import("@/lib/auth");
  const real = await original<typeof import("@/lib/solicitudes")>();
  return {
    ...real,
    exigirLlenado: vi.fn(async (perfil: { rol: string }, companyId: string) => {
      if (perfil.rol !== "consultor") throw new AccesoDenegado(real.TEXTO_SECCION_CERRADA, "autoridad", companyId);
    }),
  };
});

import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { VACIO } from "@/lib/textos";
import { TEXTO_SECCION_CERRADA } from "@/lib/secciones";
import type { ProcesoResumen } from "@/components/ProcesosLista";

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Modas Lucero (ficticia)
const OTRA = "0000000b-0000-4000-8000-00000000000b";
const CONSULTORA: Perfil = { id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@prueba.local", nombre: "Consultora", rol: "consultor" };
const DUENA: Perfil = { id: "00000000-0000-4000-8000-0000000000a1", email: "duena-a@prueba.local", nombre: "Dueña A", rol: "cliente" };
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * EL TEXTO EXACTO DE LA MIGRACIÓN QUE ESTA RUTA NECESITA. Va aquí porque supabase/ no es de este encargo:
 * la coordinación lo lleva tal cual a supabase/migracion-procesos-importados.sql y lo registra en
 * orden-aplicacion.json. Mientras tanto se aplica desde esta constante, sobre PGlite, al final del archivo.
 */
const NOMBRE_MIGRACION = "migracion-procesos-importados.sql";
const MIGRACION_PENDIENTE = `-- PROCESOS DE LA LISTA DE LA EMPRESA, SIN DIBUJAR (13-10-2026, R9.2).
--
-- Una empresa que ya tiene sus procesos en un Excel los importa (api/companies/[id]/procesos/importar) en vez de
-- dictarlos uno a uno. Lo importado es un nombre con su área y su responsable: la empresa dijo que existe, nadie lo
-- ha dibujado. No es un AS-IS, y guardarlo como AS-IS hacía que todo lo que lee procesos —la lista del dueño, la
-- Ficha de Dirección, el avance, el diagnóstico— lo contara como un flujo dibujado.
--
-- Por eso version admite un tercer valor, 'sin_dibujar', y origen admite 'importado'. Quien filtra
-- version = 'as_is' no los ve. Cuando al proceso se le guarda el primer paso (el editor o el dibujo de la IA
-- insertan en process_nodes), un disparador lo pasa a 'as_is': desde ese momento es un proceso dibujado como
-- cualquier otro, y conserva origen = 'importado' y su fuente en fuentes_usadas.
--
-- Aditiva: no borra datos. Los únicos drop son de los dos checks, que se vuelven a crear más amplios en la línea
-- siguiente, y del disparador, que se vuelve a crear. Idempotente: se puede aplicar dos veces.

-- 1 · Los dos checks, más amplios. Los nombres son los que Postgres da a un check de columna (tabla_columna_check).
alter table processes drop constraint if exists processes_version_check;
alter table processes add constraint processes_version_check check (version in ('as_is','to_be','sin_dibujar'));
alter table processes drop constraint if exists processes_origen_check;
alter table processes add constraint processes_origen_check check (origen in ('dibujado','generado_ia','importado'));

-- Si en esta base los checks originales tenían otro nombre, siguen vivos y más estrechos que los nuevos: la
-- importación fallaría sin explicar por qué. Se dice aquí, con el nombre, en vez de dejarlo para después.
do $$
declare
  sobrante text;
begin
  select string_agg(conname, ', ') into sobrante
    from pg_constraint
   where conrelid = 'public.processes'::regclass
     and contype = 'c'
     and conname not in ('processes_version_check', 'processes_origen_check')
     and (pg_get_constraintdef(oid) like '%as_is%' or pg_get_constraintdef(oid) like '%generado_ia%');
  if sobrante is not null then
    raise exception 'processes conserva otro check de version u origen (%): hay que quitarlo a mano para que admita sin_dibujar e importado', sobrante;
  end if;
end $$;

-- 2 · El primer paso dibujado convierte el proceso en AS-IS. Solo toca filas 'sin_dibujar': un AS-IS o un TO-BE
-- no cambian. Security definer para que valga igual lo inserte quien lo inserte (el editor escribe con
-- guardar_proceso, el dibujo de la IA con la service role).
create or replace function proceso_pasa_a_dibujado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update processes set version = 'as_is' where id = new.process_id and version = 'sin_dibujar';
  return new;
end;
$$;
revoke execute on function proceso_pasa_a_dibujado() from public, anon, authenticated;

drop trigger if exists process_nodes_dibuja_proceso on process_nodes;
create trigger process_nodes_dibuja_proceso after insert on process_nodes
  for each row execute function proceso_pasa_a_dibujado();`;

/** Las maneras de escribir del doble. `checksDeHoy` imita los checks de schema.sql:240-241; los de verdad están al final, en PGlite. */
let n = 0;
const admiteTodo: Insercion = async (filas) => ({ data: filas.map(() => ({ id: `id-${++n}` })), error: null });
const checksDeHoy: Insercion = async (filas) =>
  filas.some((f) => (f.version != null && f.version !== "as_is" && f.version !== "to_be") || (f.origen != null && f.origen !== "dibujado" && f.origen !== "generado_ia"))
    ? { data: null, error: { code: "23514", message: 'new row for relation "processes" violates check constraint "processes_version_check"' } }
    : admiteTodo(filas);
const existentes = (filas: Fila[]): Lectura => async (filtros) => ({ data: filas.filter((f) => Object.entries(filtros).every(([k, v]) => f[k] === v)), error: null });
const sinProcesos = existentes([]);

async function excel(filas: (string | number | null)[][], hoja = "Procesos"): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const ws = libro.addWorksheet(hoja);
  for (const f of filas) ws.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

/**
 * La lista de una tienda: cinco procesos, y el quinto repite al primero escrito de otra manera. Los
 * encabezados van con mayúsculas, tildes y palabras de más, que es como llegan los archivos de verdad.
 */
const CINCO: (string | null)[][] = [
  ["Nombre del Proceso", "ÁREA", "Responsable", "Descripción"],
  ["Apertura de caja", "Tienda", "Rosa", "Contar el fondo y anotarlo en el cuaderno"],
  ["Cierre y cuadre de caja", "Tienda", "Rosa", "Cuadrar las ventas del día contra efectivo y tarjeta"],
  ["Compra de mercadería", "Compras", "Gerente", null],
  ["Reposición de estante", "Tienda", null, "Reponer lo que falta al abrir"],
  ["APERTURA DE CAJA ", "Tienda", "Carmen", "El mismo proceso, escrito otra vez"],
];
let EXCEL_CINCO: Buffer;

type Ctx = { params: Promise<{ id: string }> };

async function importar(archivo: Buffer | null, opc: { modo?: string; hoja?: string; nombre?: string; mime?: string; empresa?: string } = {}) {
  const { POST } = await import("@/app/api/companies/[id]/procesos/importar/route");
  const empresa = opc.empresa ?? EMP;
  const form = new FormData();
  if (archivo) form.set("archivo", new File([new Uint8Array(archivo)], opc.nombre ?? "procesos-lucero.xlsx", { type: opc.mime ?? MIME_XLSX }));
  if (opc.modo) form.set("modo", opc.modo);
  if (opc.hoja) form.set("hoja", opc.hoja);
  const res = await (POST as (req: Request, ctx: Ctx) => Promise<Response>)(new Request(`http://8x.test/api/companies/${empresa}/procesos/importar`, { method: "POST", body: form }), { params: Promise.resolve({ id: empresa }) });
  return { status: res.status, body: (await res.json()) as Fila };
}

// Bajo la suite completa (varias bases embebidas arrancando a la vez) la primera importación de la ruta puede
// tardar más que los 5 s por defecto. Se importa una vez aquí y se da margen a cada prueba.
vi.setConfig({ testTimeout: 30_000 });

beforeAll(async () => {
  EXCEL_CINCO = await excel(CINCO);
  await Promise.all([
    import("@/app/api/companies/[id]/procesos/importar/route"),
    import("@/components/procesos/ImportarProcesos"),
    import("@/components/ProcesosLista"),
    import("@/app/(consultor)/empresa/[id]/procesos/page"),
  ]);
}, 180_000);

beforeEach(() => {
  vi.mocked(perfilApi).mockReset();
  vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
  vi.mocked(registrar).mockClear();
});

// ─────────────────────── La vista previa ───────────────────────

describe("vista previa · con dobles · qué se va a crear y qué se omite, antes de escribir", () => {
  it("un Excel con 5 procesos y 1 repetido: 4 nuevos, 1 omitido con su motivo, y nada escrito", async () => {
    const base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    estado.base = base;
    const r = await importar(EXCEL_CINCO);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ archivo: "procesos-lucero.xlsx", hoja: "Procesos", hojas: ["Procesos"], faltantes: [], total_filas: 5 });
    expect(r.body.nuevos).toEqual([
      { fila: 2, nombre: "Apertura de caja", area: "Tienda", responsable: "Rosa", descripcion: "Contar el fondo y anotarlo en el cuaderno" },
      { fila: 3, nombre: "Cierre y cuadre de caja", area: "Tienda", responsable: "Rosa", descripcion: "Cuadrar las ventas del día contra efectivo y tarjeta" },
      { fila: 4, nombre: "Compra de mercadería", area: "Compras", responsable: "Gerente", descripcion: null },
      { fila: 5, nombre: "Reposición de estante", area: "Tienda", responsable: null, descripcion: "Reponer lo que falta al abrir" },
    ]);
    expect(r.body.omitidos).toEqual([{ fila: 6, nombre: "APERTURA DE CAJA", motivo: "repetido en el archivo (ya está en la fila 2)" }]);
    // Ver no es escribir: ni una inserción, y no devuelve «creados».
    expect(base.inserciones).toEqual([]);
    expect(r.body).not.toHaveProperty("creados");
    expect(registrar).not.toHaveBeenCalledWith(expect.objectContaining({ entidad: "processes", accion: "crear", detalle: expect.anything() }));
  });

  it("la vista previa no depende de la migración: con los checks de hoy también responde, porque no escribe", async () => {
    const base = baseDoble({ leer: sinProcesos, insertar: checksDeHoy });
    estado.base = base;
    const r = await importar(EXCEL_CINCO);
    expect(r.status).toBe(200);
    expect(r.body.nuevos).toHaveLength(4);
    expect(base.inserciones).toEqual([]);
  });

  it("los encabezados se reconocen con mayúsculas, tildes y palabras de más, y se dice cuál se tomó para cada dato", async () => {
    estado.base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    const r = await importar(EXCEL_CINCO);
    expect(r.body.columnas).toEqual({ nombre: "Nombre del Proceso", area: "ÁREA", responsable: "Responsable", descripcion: "Descripción" });
    const otros = await importar(await excel([["PROCEDIMIENTO", "Departamento", "Quién lo hace"], ["Inventario mensual", "Almacén", "Jorge"]]));
    expect(otros.body.columnas).toEqual({ nombre: "PROCEDIMIENTO", area: "Departamento", responsable: "Quién lo hace", descripcion: null });
    expect(otros.body.faltantes).toEqual(["descripcion"]);
    expect(otros.body.nuevos).toEqual([{ fila: 2, nombre: "Inventario mensual", area: "Almacén", responsable: "Jorge", descripcion: null }]);
  });

  it("lo que la empresa ya tiene no se duplica ni se pisa: se omite por nombre, y el motivo dice si ya está dibujado o ya está en la lista", async () => {
    const yaTiene = existentes([
      { id: "p1", company_id: EMP, version: "as_is", nombre: "cierre y cuadre de caja" }, // dibujado
      { id: "p2", company_id: EMP, version: "sin_dibujar", nombre: "REPOSICION DE ESTANTE" }, // importado antes, sin dibujar
      { id: "p3", company_id: OTRA, version: "as_is", nombre: "Compra de mercadería" }, // de otra empresa: no cuenta
      { id: "p4", company_id: EMP, version: "to_be", nombre: "Apertura de caja" }, // un rediseño, no el proceso de hoy: no cuenta
    ]);
    estado.base = baseDoble({ leer: yaTiene, insertar: admiteTodo });
    const r = await importar(EXCEL_CINCO);
    expect((r.body.nuevos as Fila[]).map((p) => p.nombre)).toEqual(["Apertura de caja", "Compra de mercadería"]);
    expect(r.body.omitidos).toEqual([
      { fila: 3, nombre: "Cierre y cuadre de caja", motivo: "ya existe un proceso con ese nombre en la empresa" },
      { fila: 5, nombre: "Reposición de estante", motivo: "ya está en la lista de la empresa, sin dibujar todavía" },
      { fila: 6, nombre: "APERTURA DE CAJA", motivo: "repetido en el archivo (ya está en la fila 2)" },
    ]);
  });

  it("una fila sin nombre o con una parrafada por nombre se omite y se dice; no se crea un proceso sin nombre", async () => {
    estado.base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    const largo = "Primero se abre la tienda y después ".repeat(6);
    const r = await importar(await excel([["proceso", "area"], [null, "Tienda"], [largo, "Tienda"], ["Arqueo sorpresa", null]]));
    expect((r.body.nuevos as Fila[]).map((p) => [p.fila, p.nombre, p.area])).toEqual([[4, "Arqueo sorpresa", null]]);
    expect(r.body.omitidos).toEqual([
      { fila: 2, nombre: null, motivo: "sin nombre" },
      { fila: 3, nombre: `${largo.trim().slice(0, 60)}…`, motivo: "el nombre pasa de 160 letras: parece una descripción, no un nombre" },
    ]);
  });

  it("de un libro con varias hojas toma la que tiene nombre de proceso, y deja pedir otra", async () => {
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet("Portada").addRow(["Manual de la tienda", 2026]);
    const a = libro.addWorksheet("Tienda");
    a.addRow(["Proceso", "Área"]);
    a.addRow(["Apertura de caja", "Tienda"]);
    const b = libro.addWorksheet("Almacén");
    b.addRow(["Proceso", "Área"]);
    b.addRow(["Recepción de mercadería", "Almacén"]);
    const bytes = Buffer.from(await libro.xlsx.writeBuffer());
    estado.base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    const primera = await importar(bytes);
    expect(primera.body).toMatchObject({ hoja: "Tienda", hojas: ["Portada", "Tienda", "Almacén"] });
    const pedida = await importar(bytes, { hoja: "Almacén" });
    expect((pedida.body.nuevos as Fila[]).map((p) => p.nombre)).toEqual(["Recepción de mercadería"]);
    expect((await importar(bytes, { hoja: "Portada" })).body.error).toBe("La hoja «Portada» no tiene una columna con el nombre del proceso.");
  });
});

// ─────────────────────── CSV ───────────────────────

describe("CSV · con dobles · como lo guarda Excel en Windows y como lo guarda cualquier otro programa", () => {
  it("separado por punto y coma y en Windows-1252: las tildes llegan bien y «Área» se reconoce", async () => {
    estado.base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    const texto = 'Proceso;Área;Encargado;Detalle\r\nAtención en mostrador;Tienda;Rosa;"Saludar; ofrecer talla"\r\n;Tienda;Carmen;sin nombre\r\nDevolución de prenda;Tienda;;"La clienta dice ""no me quedó"""\r\n';
    const bytes = Buffer.from(texto, "latin1");
    expect(bytes.includes(0xc1)).toBe(true); // «Á» en un solo byte: esto NO es UTF-8
    const r = await importar(bytes, { nombre: "procesos.csv", mime: "application/vnd.ms-excel" }); // el MIME que pone Windows a un .csv
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ archivo: "procesos.csv", hoja: null, hojas: [], columnas: { nombre: "Proceso", area: "Área", responsable: "Encargado", descripcion: "Detalle" } });
    expect(r.body.nuevos).toEqual([
      { fila: 2, nombre: "Atención en mostrador", area: "Tienda", responsable: "Rosa", descripcion: "Saludar; ofrecer talla" },
      { fila: 4, nombre: "Devolución de prenda", area: "Tienda", responsable: null, descripcion: 'La clienta dice "no me quedó"' },
    ]);
    expect(r.body.omitidos).toEqual([{ fila: 3, nombre: null, motivo: "sin nombre" }]);
  });

  it("separado por comas, en UTF-8 y con marca de orden de bytes: igual", async () => {
    estado.base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    const bytes = Buffer.from("﻿nombre,área,responsable\nCobranza a clientes,Administración,Gerente\n", "utf8");
    const r = await importar(bytes, { nombre: "procesos.csv", mime: "text/csv" });
    expect(r.body.columnas).toMatchObject({ nombre: "nombre", area: "área", responsable: "responsable" });
    expect(r.body.nuevos).toEqual([{ fila: 2, nombre: "Cobranza a clientes", area: "Administración", responsable: "Gerente", descripcion: null }]);
  });
});

// ─────────────────────── Confirmar ───────────────────────

describe("confirmar · con dobles · crea lo que se vio, sin nodos, sin dibujar, marcado como importado y con su fuente", () => {
  it("cuando la base admite «sin dibujar»: 4 procesos con origen importado, en borrador, con archivo, hoja y fila", async () => {
    const base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    estado.base = base;
    const r = await importar(EXCEL_CINCO, { modo: "confirmar" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ creados: 4, origen: "importado", version: "sin_dibujar" });
    expect(r.body.ids).toHaveLength(4);
    expect(r.body.omitidos).toEqual([{ fila: 6, nombre: "APERTURA DE CAJA", motivo: "repetido en el archivo (ya está en la fila 2)" }]);

    expect(base.inserciones).toHaveLength(1);
    const filas = base.inserciones[0];
    expect(filas.map((f) => [f.nombre, f.area, f.responsable, f.descripcion_original])).toEqual([
      ["Apertura de caja", "Tienda", "Rosa", "Contar el fondo y anotarlo en el cuaderno"],
      ["Cierre y cuadre de caja", "Tienda", "Rosa", "Cuadrar las ventas del día contra efectivo y tarjeta"],
      ["Compra de mercadería", "Compras", "Gerente", null],
      ["Reposición de estante", "Tienda", null, "Reponer lo que falta al abrir"],
    ]);
    for (const f of filas) {
      // Ninguno entra como AS-IS: eso es lo que todos los demás lectores cuentan como dibujado.
      expect(f).toMatchObject({ company_id: EMP, version: "sin_dibujar", origen: "importado", confirmacion: "borrador" });
      // El comentario del proceso es del dueño (FichaProceso): la importación no escribe ahí.
      expect(f).not.toHaveProperty("comentario");
    }
    expect(filas[0].fuentes_usadas).toEqual([{ id: null, nombre: "procesos-lucero.xlsx", version: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), tipo: "importado", hoja: "Procesos", fila: 2 }]);
    expect(filas.map((f) => (f.fuentes_usadas as { fila: number }[])[0].fila)).toEqual([2, 3, 4, 5]);
    // Sin nodos: lo único que se tocó fue `processes` (leer los existentes e insertar). Nada de process_nodes ni process_edges.
    expect([...new Set(base.tablas)]).toEqual(["processes"]);
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: EMP, actor: CONSULTORA, accion: "crear", entidad: "processes", detalle: { archivo: "procesos-lucero.xlsx", hoja: "Procesos", creados: 4, omitidos: 1, origen: "importado", version: "sin_dibujar" } })
    );
  });

  it("con los checks de hoy (migración sin aplicar): 409, dice qué falta, no crea nada y NO reintenta como AS-IS «dibujado»", async () => {
    const base = baseDoble({ leer: sinProcesos, insertar: checksDeHoy });
    estado.base = base;
    const r = await importar(EXCEL_CINCO, { modo: "confirmar" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(
      "Esta base todavía no deja guardar procesos «de la lista, sin dibujar»: falta aplicar supabase/migracion-procesos-importados.sql. No se creó ningún proceso. Lo que viste en la vista previa sigue valiendo: confirma cuando la migración esté aplicada."
    );
    expect(r.body).not.toHaveProperty("creados");
    // Un solo intento, el rechazado. Antes había un segundo, con version 'as_is' y origen 'dibujado': ese es el que ya no existe.
    expect(base.inserciones.map((t) => [t.length, t[0].version, t[0].origen])).toEqual([[4, "sin_dibujar", "importado"]]);
    expect(base.inserciones.flat().some((f) => f.version === "as_is" || f.origen === "dibujado")).toBe(false);
    expect(registrar).not.toHaveBeenCalledWith(expect.objectContaining({ entidad: "processes", accion: "crear" }));
  });

  it("cualquier otro fallo de la base se dice y no se reintenta: 500, y no se afirma haber creado nada", async () => {
    const base = baseDoble({ leer: sinProcesos, insertar: async () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }) });
    estado.base = base;
    const r = await importar(EXCEL_CINCO, { modo: "confirmar" });
    expect(r).toMatchObject({ status: 500, body: { error: "No pudimos crear los procesos: canceling statement due to statement timeout" } });
    expect(base.inserciones).toHaveLength(1);
    expect(r.body).not.toHaveProperty("creados");
    // Y si lo que falla es leer los procesos que ya hay, no se escribe a ciegas.
    const sinLectura = baseDoble({ leer: async () => ({ data: null, error: { code: "08006", message: "connection failure" } }), insertar: admiteTodo });
    estado.base = sinLectura;
    expect(await importar(EXCEL_CINCO, { modo: "confirmar" })).toMatchObject({ status: 500, body: { error: "No pudimos leer los procesos de la empresa: connection failure" } });
    expect(sinLectura.inserciones).toEqual([]);
  });

  it("si todo lo del archivo ya existe, confirmar no escribe: creados 0", async () => {
    const todos = existentes(CINCO.slice(1).map((f, i) => ({ id: `p${i}`, company_id: EMP, version: i % 2 ? "as_is" : "sin_dibujar", nombre: f[0] })));
    const base = baseDoble({ leer: todos, insertar: admiteTodo });
    estado.base = base;
    const r = await importar(EXCEL_CINCO, { modo: "confirmar" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ creados: 0, ids: [], nuevos: [] });
    expect(r.body.omitidos).toHaveLength(5);
    expect(base.inserciones).toEqual([]);
  });

  it("un CSV confirmado guarda la fuente sin hoja: no hay hoja que citar", async () => {
    const base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    estado.base = base;
    const r = await importar(Buffer.from("proceso;area\nApertura de caja;Tienda\n", "utf8"), { modo: "confirmar", nombre: "lista.csv", mime: "text/csv" });
    expect(r.body).toMatchObject({ creados: 1, hoja: null });
    expect(base.inserciones[0][0].fuentes_usadas).toEqual([expect.objectContaining({ nombre: "lista.csv", tipo: "importado", hoja: null, fila: 2 })]);
  });
});

// ─────────────────────── Lo que no entra ───────────────────────

describe("lo que se rechaza · con dobles · con la explicación y el siguiente paso", () => {
  it("sin archivo, con un PDF, con un Excel que no lo es, sin columna de nombre o con un modo inventado", async () => {
    const base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    estado.base = base;
    expect((await importar(null)).body.error).toBe("Sube el Excel (.xlsx) o el CSV con la lista de procesos.");
    expect((await importar(Buffer.from("%PDF-1.4 contenido"), { nombre: "procesos.pdf", mime: "application/pdf" })).body.error).toBe(
      "Para importar procesos hace falta un Excel (.xlsx) o un CSV con las columnas nombre, área, responsable y descripción."
    );
    expect((await importar(Buffer.from("proceso;area\nApertura;Tienda\n"), { nombre: "procesos.xlsx" })).body.error).toBe(
      "El archivo dice ser un Excel (.xlsx) pero su contenido no lo es. Ábrelo en Excel y guárdalo de nuevo como .xlsx."
    );
    expect((await importar(EXCEL_CINCO, { nombre: "procesos.csv", mime: "text/csv" })).body.error).toBe("El archivo dice ser un CSV pero su contenido no es texto. Si es un Excel, guárdalo como .xlsx y súbelo de nuevo.");
    expect((await importar(await excel([["mes", "ventas"], ["2026-09", 80000]]))).body.error).toMatch(/^No encontramos una columna con el nombre del proceso\. Se aceptan encabezados como: nombre, proceso/);
    expect((await importar(EXCEL_CINCO, { modo: "reemplazar" })).body.error).toBe("El modo tiene que ser vista_previa o confirmar.");
    expect((await importar(Buffer.from("x"), { nombre: "viejo.xls", mime: "application/vnd.ms-excel" })).body.error).toMatch(/formato antiguo \(\.xls\)/);
    expect(base.inserciones).toEqual([]);
  });

  it("el dueño sin «subir_procesos» abierta no importa: 403 con el texto de sección cerrada, y la base ni se consulta", async () => {
    const base = baseDoble({ leer: sinProcesos, insertar: admiteTodo });
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(DUENA);
    const r = await importar(EXCEL_CINCO, { modo: "confirmar" });
    expect(r).toMatchObject({ status: 403, body: { error: TEXTO_SECCION_CERRADA } });
    expect(base.tablas).toEqual([]);
    vi.mocked(perfilApi).mockResolvedValue(null);
    expect((await importar(EXCEL_CINCO)).status).toBe(401);
  });
});

// ─────────────────────── El componente ───────────────────────

describe("ImportarProcesos · renderizado a HTML en Node (no abierto en un navegador)", () => {
  it("arranca pidiendo el archivo, con su etiqueta, y sin ofrecer crear nada todavía", async () => {
    const { ImportarProcesos } = await import("@/components/procesos/ImportarProcesos");
    const html = renderToStaticMarkup(createElement(ImportarProcesos, { companyId: EMP }));
    expect(html).toContain("Importar la lista de procesos");
    expect(html).toContain("Antes de crear nada verás qué entra y qué se omite.");
    expect(html).toMatch(/<input[^>]*type="file"[^>]*aria-label="Archivo con la lista de procesos"/);
    expect(html).not.toMatch(/Crear \d+ proceso/);
    expect(html).not.toMatch(/<button/); // el botón de crear solo existe cuando ya hay una vista previa que mirar
    expect(html).not.toContain("De la lista de la empresa, sin dibujar"); // sin nada importado no hay lista que mostrar
  });

  it("lo importado se ve aquí, rotulado «sin dibujar», con cómo dibujarlo y cómo quitarlo si fue un error", async () => {
    const { ImportarProcesos } = await import("@/components/procesos/ImportarProcesos");
    const enLista = [
      { id: "11111111-1111-4111-8111-111111111111", nombre: "Apertura de caja", area: "Tienda" },
      { id: "22222222-2222-4222-8222-222222222222", nombre: "Compra de mercadería", area: null },
    ];
    const html = renderToStaticMarkup(createElement(ImportarProcesos, { companyId: EMP, enLista, base: `/empresa/${EMP}/procesos` }));
    expect(html).toContain("De la lista de la empresa, sin dibujar (2)");
    expect(html).toContain("No cuentan en el avance ni entran al diagnóstico. El dueño los ve solo mientras le tengas abierta «Subir o dibujar los procesos».");
    expect(html).toContain("Apertura de caja");
    expect(html).toContain("sin área"); // lo que el archivo no trajo se dice, no se rellena
    expect(html).toContain(`href="/empresa/${EMP}/procesos/11111111-1111-4111-8111-111111111111"`);
    expect(html.match(/>Abrir para dibujarlo</g)).toHaveLength(2);
    expect(html.match(/>Quitar de la lista</g)).toHaveLength(2);
    expect(html).not.toContain("Sí, quitarlo"); // quitar pide confirmación: el «sí» no está a la vista hasta que se pide
  });
});

// ─────────────────────── Postgres embebido: sin la migración y con ella ───────────────────────

describe("POSTGRES EMBEBIDO (PGlite, no Supabase) · el esquema del repositorio sin la migración pedida y con ella", () => {
  let pg: PGlite | undefined;
  let fallo: unknown;
  const rutaMigracion = path.join(CARPETA_SUPABASE, NOMBRE_MIGRACION);
  /** El texto que se aplica: el archivo del repositorio cuando exista; mientras tanto, el pedido. */
  const sqlMigracion = () => (existsSync(rutaMigracion) ? readFileSync(rutaMigracion, "utf8") : MIGRACION_PENDIENTE);

  const db = (): PGlite => {
    if (fallo) throw fallo;
    if (!pg) throw new Error("no hay base: beforeAll no la creó");
    return pg;
  };
  const codigoDe = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await db().query(sql, params);
      return null;
    } catch (e) {
      return (e as { code?: string }).code ?? "desconocido";
    }
  };

  /** La escritura del doble, hecha de verdad: una transacción con las filas que la ruta manda, tal cual. */
  const enPostgres: Insercion = async (filas) => {
    try {
      const ids = await db().transaction(async (tx) => {
        const creados: { id: string }[] = [];
        for (const f of filas) {
          const columnas = Object.keys(f);
          const r = await tx.query<{ id: string }>(
            `insert into processes (${columnas.join(",")}) values (${columnas.map((c, i) => (c === "fuentes_usadas" ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(",")}) returning id`,
            columnas.map((c) => (c === "fuentes_usadas" ? JSON.stringify(f[c]) : f[c]))
          );
          creados.push(r.rows[0]);
        }
        return creados;
      });
      return { data: ids, error: null };
    } catch (e) {
      return { data: null, error: { code: (e as { code?: string }).code ?? "desconocido", message: e instanceof Error ? e.message : String(e) } };
    }
  };
  /** Lo que la ruta lee para no duplicar: todos los procesos de la empresa, con su versión. */
  const dePostgres: Lectura = async (filtros) => {
    const { rows } = await db().query<Fila>("select id, nombre, version from processes where company_id = $1", [filtros.company_id]);
    return { data: rows, error: null };
  };
  /**
   * La misma forma que arma listarProcesos (src/lib/procesos.ts) para las dos pantallas: TODAS las versiones
   * de la empresa, cada una con su cuenta de pasos. Con SQL, porque aquí no hay PostgREST.
   */
  const resumenes = async (): Promise<ProcesoResumen[]> => {
    const { rows } = await db().query<ProcesoResumen>(
      `select p.id, p.nombre, p.area, p.version, p.origen, p.padre_id,
              (select count(*)::int from process_nodes x where x.process_id = p.id) as nodos,
              exists (select 1 from processes t where t.padre_id = p.id and t.version = 'to_be') as tiene_tobe,
              exists (select 1 from sops s where s.process_id = p.id) as tiene_sop
         from processes p where p.company_id = $1 order by p.created_at, p.nombre`,
      [EMP]
    );
    return rows;
  };
  const listaDelDueno = async () => {
    const { ProcesosLista } = await import("@/components/ProcesosLista");
    return renderToStaticMarkup(createElement(ProcesosLista, { companyId: EMP, procesos: await resumenes(), base: "/portal/procesos", paraCliente: true }));
  };
  const cuenta = async (sql: string): Promise<number> => (await db().query<{ n: number }>(sql, [EMP])).rows[0].n;

  beforeAll(async () => {
    try {
      // El esquema del repositorio SIN la migración pedida, exista ya el archivo o no: así el «antes» se puede
      // reproducir siempre, también el día que la migración esté registrada en orden-aplicacion.json.
      pg = await crearBase();
      await aplicarTodo(pg, { orden: leerOrden().filter((e) => e.archivo !== NOMBRE_MIGRACION) });
      await pg.query("insert into companies (id, nombre) values ($1, 'Modas Lucero (ficticia)')", [EMP]);
    } catch (e) {
      fallo = e;
      await pg?.close().catch(() => {});
      pg = undefined;
    }
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("SIN la migración: los dos valores nuevos se rechazan con 23514, la ruta responde 409 y la tabla queda vacía", async () => {
    expect(await codigoDe("insert into processes (company_id, nombre, version) values ($1, 'sonda', 'sin_dibujar')", [EMP])).toBe("23514");
    expect(await codigoDe("insert into processes (company_id, nombre, origen) values ($1, 'sonda', 'importado')", [EMP])).toBe("23514");
    const base = baseDoble({ leer: dePostgres, insertar: enPostgres });
    estado.base = base;
    const r = await importar(EXCEL_CINCO, { modo: "confirmar" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("falta aplicar supabase/migracion-procesos-importados.sql");
    expect(base.inserciones).toHaveLength(1);
    expect(await cuenta("select count(*)::int as n from processes where company_id = $1")).toBe(0);
  });

  it("la migración aplica sobre el esquema del repositorio, dos veces seguidas, y deja los dos checks ampliados", async () => {
    for (let vez = 0; vez < 2; vez++) for (const s of dividirSentencias(sqlMigracion())) await db().exec(s);
    const { rows } = await db().query<{ conname: string; def: string }>(
      "select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.processes'::regclass and contype = 'c' and conname in ('processes_version_check', 'processes_origen_check') order by conname"
    );
    expect(rows.map((c) => c.conname)).toEqual(["processes_origen_check", "processes_version_check"]);
    expect(rows[0].def).toContain("importado");
    expect(rows[1].def).toContain("sin_dibujar");
    // Lo de siempre sigue entrando, y lo inventado sigue sin entrar: el check se amplió, no se quitó.
    expect(await codigoDe("insert into processes (company_id, nombre, version, origen) values ($1, 'Venta en mostrador', 'as_is', 'dibujado')", [EMP])).toBeNull();
    expect(await codigoDe("insert into processes (company_id, nombre, origen) values ($1, 'x', 'copiado_de_otra_empresa')", [EMP])).toBe("23514");
    expect(await codigoDe("insert into processes (company_id, nombre, version) values ($1, 'x', 'borrador')", [EMP])).toBe("23514");
    await db().query("delete from processes where company_id = $1", [EMP]);
  });

  it("CON la migración: los 4 procesos entran en la tabla real, sin dibujar, importados, en borrador, sin un solo paso y con su fuente", async () => {
    const base = baseDoble({ leer: dePostgres, insertar: enPostgres });
    estado.base = base;
    const r = await importar(EXCEL_CINCO, { modo: "confirmar" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ creados: 4, origen: "importado", version: "sin_dibujar" });
    expect(base.inserciones).toHaveLength(1);

    const { rows } = await db().query<Fila>(
      "select nombre, area, responsable, descripcion_original, version, origen, confirmacion, comentario, fuentes_usadas, (select count(*)::int from process_nodes x where x.process_id = p.id) as nodos from processes p where company_id = $1 order by nombre",
      [EMP]
    );
    expect(rows.map((p) => p.nombre)).toEqual(["Apertura de caja", "Cierre y cuadre de caja", "Compra de mercadería", "Reposición de estante"]);
    for (const p of rows) {
      expect(p).toMatchObject({ version: "sin_dibujar", origen: "importado", confirmacion: "borrador", comentario: null, nodos: 0 });
      expect((p.fuentes_usadas as Fila[])[0]).toMatchObject({ tipo: "importado", nombre: "procesos-lucero.xlsx", hoja: "Procesos" });
    }
    expect(rows[2]).toMatchObject({ nombre: "Compra de mercadería", area: "Compras", responsable: "Gerente", descripcion_original: null });
    expect(rows[3]).toMatchObject({ nombre: "Reposición de estante", responsable: null });
  });

  it("LA VISTA DEL DUEÑO tras importar: su lista sigue vacía; ni «Quedó vacío», ni los nombres importados, ni «Quitar este proceso»", async () => {
    const html = await listaDelDueno();
    expect(html).toContain(VACIO.procesosCliente);
    expect(html).not.toContain("Quedó vacío");
    expect(html).not.toContain("no llegamos a entender lo que contaste");
    expect(html).not.toContain("Quitar este proceso");
    for (const nombre of ["Apertura de caja", "Cierre y cuadre de caja", "Compra de mercadería", "Reposición de estante"]) expect(html).not.toContain(nombre);
  });

  it("lo que leen la Ficha de Dirección, el avance del panorama, el diagnóstico y la entrevista (version = 'as_is'): cero procesos", async () => {
    // Las consultas de ficha-direccion.ts:879, empresa/[id]/page.tsx:73, diagnostico.ts:206 y entrevista.ts:69 filtran así.
    expect(await cuenta("select count(*)::int as n from processes where company_id = $1 and version = 'as_is'")).toBe(0);
    // Tampoco se confunden con un rediseño: el plan y el mapa TO-BE leen version = 'to_be'.
    expect(await cuenta("select count(*)::int as n from processes where company_id = $1 and version = 'to_be'")).toBe(0);
  });

  it("OJO, declarado: la Radiografía (version <> 'to_be') y el redactor de entregables (sin filtro) SÍ los leen; por eso se piden dos parches", async () => {
    // mapa-empresa.ts:108 los contaría como «mapeados» en nivel 0 y plan.ts:190 los pasaría al redactor. No es de
    // este encargo tocarlos: quedan pedidos en cambios_fuera_de_alcance. Esta prueba fija el hecho, no lo arregla.
    expect(await cuenta("select count(*)::int as n from processes where company_id = $1 and version <> 'to_be'")).toBe(4);
    expect(await cuenta("select count(*)::int as n from processes where company_id = $1")).toBe(4);
  });

  it("la consultora los ve en su pantalla de Procesos, pero en el importador y rotulados; la tabla de procesos dibujados sigue vacía", async () => {
    estado.procesos = await resumenes();
    const { default: Pagina } = await import("@/app/(consultor)/empresa/[id]/procesos/page");
    const html = renderToStaticMarkup(await Pagina({ params: Promise.resolve({ id: EMP }) }));
    expect(html).toContain(VACIO.procesos); // «Ningún proceso dibujado…»: la tabla de arriba no los cuenta
    expect(html).toContain("De la lista de la empresa, sin dibujar (4)");
    expect(html.match(/>Abrir para dibujarlo</g)).toHaveLength(4);
    const idApertura = (await db().query<{ id: string }>("select id from processes where company_id = $1 and nombre = 'Apertura de caja'", [EMP])).rows[0].id;
    expect(html).toContain(`href="/empresa/${EMP}/procesos/${idApertura}"`);
    expect(html).not.toContain("dibujado a mano"); // nadie lee de un proceso importado que alguien lo dibujó
  });

  it("importar el mismo archivo otra vez no duplica: los cinco se omiten, diciendo que ya están en la lista, y la tabla sigue con cuatro", async () => {
    const base = baseDoble({ leer: dePostgres, insertar: enPostgres });
    estado.base = base;
    const vista = await importar(EXCEL_CINCO);
    expect(vista.body.nuevos).toEqual([]);
    expect((vista.body.omitidos as Fila[]).map((o) => o.motivo)).toEqual(Array(5).fill("ya está en la lista de la empresa, sin dibujar todavía"));
    expect((await importar(EXCEL_CINCO, { modo: "confirmar" })).body).toMatchObject({ creados: 0 });
    expect(base.inserciones).toEqual([]);
    expect(await cuenta("select count(*)::int as n from processes where company_id = $1")).toBe(4);
  });

  it("al guardarle los primeros pasos con guardar_proceso (lo que usa el editor), el proceso pasa solo a AS-IS y conserva que vino importado", async () => {
    const id = (await db().query<{ id: string }>("select id from processes where company_id = $1 and nombre = 'Apertura de caja'", [EMP])).rows[0].id;
    await db().query("select guardar_proceso($1, null, null, $2::jsonb, $3::jsonb)", [
      id,
      JSON.stringify([
        { id: null, _tmp: "a", tipo: "inicio", etiqueta: "Se abre la tienda" },
        { id: null, _tmp: "b", tipo: "actividad", etiqueta: "Contar el fondo y anotarlo en el cuaderno" },
        { id: null, _tmp: "c", tipo: "fin", etiqueta: "Caja lista" },
      ]),
      JSON.stringify([{ origen: "a", destino: "b" }, { origen: "b", destino: "c" }]),
    ]);
    const { rows } = await db().query<Fila>("select nombre, version, origen, (select count(*)::int from process_nodes x where x.process_id = p.id) as nodos from processes p where company_id = $1 order by nombre", [EMP]);
    expect(rows).toEqual([
      { nombre: "Apertura de caja", version: "as_is", origen: "importado", nodos: 3 },
      { nombre: "Cierre y cuadre de caja", version: "sin_dibujar", origen: "importado", nodos: 0 },
      { nombre: "Compra de mercadería", version: "sin_dibujar", origen: "importado", nodos: 0 },
      { nombre: "Reposición de estante", version: "sin_dibujar", origen: "importado", nodos: 0 },
    ]);
    // Ahora sí es un proceso dibujado: el dueño lo ve con sus pasos, y los otros tres siguen sin aparecer.
    const html = await listaDelDueno();
    expect(html).toContain("Apertura de caja");
    expect(html).toContain("3 pasos · dibujado a mano");
    expect(html).not.toContain("Quedó vacío");
    expect(html).not.toContain("Compra de mercadería");
    expect(await cuenta("select count(*)::int as n from processes where company_id = $1 and version = 'as_is'")).toBe(1);
    // Y al volver a importar, el motivo distingue el que ya se dibujó de los que siguen en la lista.
    estado.base = baseDoble({ leer: dePostgres, insertar: enPostgres });
    const vista = await importar(EXCEL_CINCO);
    expect((vista.body.omitidos as Fila[]).map((o) => [o.fila, o.motivo])).toEqual([
      [2, "ya existe un proceso con ese nombre en la empresa"],
      [3, "ya está en la lista de la empresa, sin dibujar todavía"],
      [4, "ya está en la lista de la empresa, sin dibujar todavía"],
      [5, "ya está en la lista de la empresa, sin dibujar todavía"],
      [6, "ya existe un proceso con ese nombre en la empresa"],
    ]);
  });

  it("el disparador solo toca lo que estaba sin dibujar: un TO-BE que recibe un paso sigue siendo TO-BE", async () => {
    const padre = (await db().query<{ id: string }>("select id from processes where company_id = $1 and nombre = 'Apertura de caja'", [EMP])).rows[0].id;
    const tobe = (await db().query<{ id: string }>("insert into processes (company_id, nombre, version, origen, padre_id) values ($1, 'Apertura de caja', 'to_be', 'generado_ia', $2) returning id", [EMP, padre])).rows[0].id;
    await db().query("insert into process_nodes (process_id, tipo, etiqueta) values ($1, 'inicio', 'Se abre la tienda')", [tobe]);
    expect((await db().query<{ version: string }>("select version from processes where id = $1", [tobe])).rows[0].version).toBe("to_be");
  });
});
