/**
 * LO QUE VENDE LA EMPRESA (R9.3): LA CUENTA ES DETERMINISTA, LO QUE FALTA NO ES CERO Y LA DECISIÓN NO SE INVENTA.
 *
 * Las líneas salen de los dos pilotos FICTICIOS (tests/fixtures/pilotos): el inventario de Modas Lucero
 * (120 artículos, 40 sin costo, ninguno con unidades vendidas) y los expedientes del Estudio Vargas (62
 * laborales, horas vacías en los 110). Lo que se prueba es software: que el Excel se lea sin rellenar
 * huecos, que la evaluación use la aritmética de finanzas.ts, que la sugerencia exista solo con datos
 * completos, que la decisión la fije la consultora con su motivo y que al dueño no le llegue ninguna.
 *
 * Cómo se prueba cada cosa, para no llamar verificado a lo que no lo está:
 *  · La parte pura (evaluar, sugerir, leer el Excel, vista previa, resumen del dueño): ejecutada tal cual.
 *  · Las rutas y las dos pantallas: con DOBLES. `supabaseAdmin()` es una base en memoria y la sesión la
 *    pone la prueba. Las pantallas se renderizan a HTML en Node; nadie las abrió en un navegador.
 *  · Lo que la importación escribe: insertado de verdad en POSTGRES EMBEBIDO (PGlite, no Supabase) con
 *    el SQL del repositorio, para comprobar columnas, checks, la clave única y la política del dueño.
 *  · Lo que la base le deja leer al dueño POR FUERA de la aplicación: hoy, la fila entera, decisión
 *    incluida. Lo cierra supabase/migracion-lineas-producto-cliente.sql, que no es de este encargo y está
 *    PEDIDA, no aplicada: su texto es la constante MIGRACION_PENDIENTE y aquí se aplica sobre PGlite para
 *    probar el antes y el después. Cuando el archivo exista en el repositorio, la prueba lo lee a él.
 *
 * Toda cifra sale de los fixtures o de declaraciones.json. La única que no: las unidades vendidas de una
 * blusa, que ningún archivo del piloto trae; se declara aquí como dato de prueba y se dice donde se usa.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ExcelJS from "exceljs";
import type { PGlite } from "@electric-sql/pglite";
import declaraciones from "./fixtures/pilotos/declaraciones.json";
import { crearBase, aplicarTodo, ordenSin, dividirSentencias, consultarComo, CARPETA_SUPABASE, type Rol } from "./sql/aplicar";

type Fila = Record<string, unknown>;

/**
 * La base en memoria que hace de `supabaseAdmin()`. Encadenable y «thenable» como el cliente real: filtra
 * por los .eq() recibidos, respeta la lista de columnas del .select() (así se ve qué se le pidió a la
 * base) y hace cumplir la clave única (company_id, codigo) de lineas_producto.
 */
function crearBaseFalsa(inicial: Record<string, Fila[]> = {}, fallos: Record<string, { code: string; message: string }> = {}) {
  const tablas: Record<string, Fila[]> = {};
  for (const [t, filas] of Object.entries(inicial)) tablas[t] = filas.map((f) => ({ ...f }));
  const pedidos: { tabla: string; op: "select" | "insert" | "update"; columnas?: string; filas?: Fila[] }[] = [];
  let n = 0;
  const from = (tabla: string) => {
    tablas[tabla] ??= [];
    const filtros: [string, unknown][] = [];
    let op: "select" | "insert" | "update" = "select";
    let columnas = "*";
    let nuevas: Fila[] = [];
    let cambios: Fila = {};
    let rango: [number, number] | null = null;
    const ejecutar = (): { data: Fila[] | null; error: { code: string; message: string } | null } => {
      if (fallos[tabla]) return { data: null, error: fallos[tabla] };
      const coincide = (f: Fila) => filtros.every(([k, v]) => f[k] === v);
      if (op === "insert") {
        for (const f of nuevas) {
          const choca = tabla === "lineas_producto" && f.codigo != null && tablas[tabla].some((x) => x.company_id === f.company_id && x.codigo === f.codigo);
          if (choca) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        const creadas = nuevas.map((f) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, created_at: "2026-10-13T12:00:00.000Z", ...f }));
        tablas[tabla].push(...creadas);
        pedidos.push({ tabla, op, filas: creadas });
        return { data: creadas, error: null };
      }
      if (op === "update") {
        const tocadas = tablas[tabla].filter(coincide);
        for (const f of tocadas) Object.assign(f, cambios);
        pedidos.push({ tabla, op, filas: tocadas });
        return { data: tocadas, error: null };
      }
      pedidos.push({ tabla, op, columnas });
      const cols = columnas === "*" ? null : columnas.split(",").map((c) => c.trim());
      const todas = tablas[tabla].filter(coincide).map((f) => (cols ? Object.fromEntries(cols.map((c) => [c, f[c] ?? null])) : { ...f }));
      return { data: rango ? todas.slice(rango[0], rango[1] + 1) : todas, error: null };
    };
    const q = {
      select: (c?: string) => {
        if (op === "select") columnas = c ?? "*";
        return q;
      },
      insert: (f: Fila | Fila[]) => {
        op = "insert";
        nuevas = Array.isArray(f) ? f : [f];
        return q;
      },
      update: (c: Fila) => {
        op = "update";
        cambios = c;
        return q;
      },
      eq: (k: string, v: unknown) => {
        filtros.push([k, v]);
        return q;
      },
      order: () => q,
      range: (desde: number, hasta: number) => {
        rango = [desde, hasta];
        return q;
      },
      maybeSingle: async () => {
        const r = ejecutar();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      single: async () => {
        const r = ejecutar();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      then: (res: (v: ReturnType<typeof ejecutar>) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  return { from, tablas, pedidos };
}

const estado = vi.hoisted(() => ({ base: null as unknown, portal: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), perfilApi: vi.fn(), puedeAcceder: vi.fn(async () => true) }));
vi.mock("@/lib/auditoria", async (original) => ({ ...(await original<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));
// Para renderizar las pantallas en Node: el enrutador de Next y el contexto del portal los pone la prueba.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), redirect: () => {} }));
vi.mock("@/lib/portal", () => ({ contextoPortal: async () => estado.portal }));

import {
  evaluar, sugerir, resumenParaDueno, revisarLinea, numero, desdeFila, lineasDesdeExcel, lineasDesdeHoja, vistaPreviaLineas, reconocerColumnas,
  periodoDe, periodosDe, periodoValido, nombreDePeriodoLinea, periodoConPreposicion, mesesDePeriodo, capacidadDe,
  TEXTO_SIN_DATOS, SIN_PERIODO, DECISIONES, DECISION_TEXTO, COLUMNAS_PARA_DUENO,
  type LineaProducto, type FilaImportada,
} from "@/lib/producto";
import { costeoPorSku, costeoPorServicio, explicarCalculo } from "@/lib/finanzas";
import { leerExcel } from "@/lib/documentos/excel";
import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";

const PILOTOS = path.resolve(__dirname, "fixtures/pilotos");
const EXCEL_LUCERO = readFileSync(path.join(PILOTOS, "modas-lucero", "ventas-e-inventario.xlsx"));
const EXCEL_VARGAS = readFileSync(path.join(PILOTOS, "estudio-vargas", "expedientes-2026-I.xlsx"));
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const EMP_A = "0000000a-0000-4000-8000-00000000000a"; // Modas Lucero (ficticia)
const EMP_B = "0000000b-0000-4000-8000-00000000000b"; // Estudio Vargas (ficticio)
const CONSULTORA: Perfil = { id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@prueba.local", nombre: "Consultora", rol: "consultor" };
const DUENA: Perfil = { id: "00000000-0000-4000-8000-0000000000a1", email: "duena-a@prueba.local", nombre: "Dueña A", rol: "cliente" };

/**
 * EL TEXTO EXACTO DE LA MIGRACIÓN QUE CIERRA LA LECTURA DE LA DECISIÓN POR FUERA DE LA APLICACIÓN. Va aquí
 * porque supabase/ no es de este encargo: la coordinación lo lleva tal cual a
 * supabase/migracion-lineas-producto-cliente.sql y lo registra en orden-aplicacion.json. Mientras tanto se
 * aplica desde esta constante, sobre PGlite, al final del archivo.
 */
const NOMBRE_MIGRACION = "migracion-lineas-producto-cliente.sql";
/** La del 16-10: columnas nuevas en lineas_producto y la vista del dueño rehecha con ellas. */
const MIGRACION_16_10 = "migracion-entrar-hoy.sql";
const MIGRACION_PENDIENTE = `-- EL DUEÑO NO LEE LA DECISIÓN DE UNA LÍNEA HASTA QUE SE ACUERDA (13-10-2026, R9.3).
--
-- migracion-entrada-y-direccion.sql dejó al dueño leer lineas_producto entera (política
-- lineas_producto_cliente): con su propia sesión y por fuera de la aplicación podía pedir decision y
-- decision_motivo, que son lo que la consultora todavía está pensando sobre cada producto (retirar, reposicionar…).
-- La aplicación ya no se las manda (src/lib/producto.ts · COLUMNAS_PARA_DUENO), pero la base sí se las daba.
--
-- Mismo patrón que claims_cliente y participants_cliente (schema.sql, P0-02 y P0-04): el dueño NO lee la tabla;
-- lee una vista con las columnas que le tocan y el filtro de pertenencia dentro. La vista corre como su dueño
-- (no hereda RLS), y security_barrier evita que un predicado del cliente se evalúe antes del filtro.
--
-- Qué cambia para cada quien. Consultora: nada (su política sigue igual). Servidor (service role): nada. Dueño por
-- PostgREST: lineas_producto le devuelve cero filas; lineas_producto_cliente le devuelve las de su empresa sin
-- decisión ni motivo, y solo para leer.
--
-- No borra datos. Quita una política (la que dejaba pasar la fila entera) y crea la vista que la reemplaza.
-- Idempotente.

drop policy if exists lineas_producto_cliente on lineas_producto;

drop view if exists lineas_producto_cliente;
create view lineas_producto_cliente with (security_barrier = true) as
select
  id, company_id, codigo, nombre, tipo, cliente_objetivo, necesidad, promesa,
  precio, costo_variable_unitario, unidades_periodo, horas_por_unidad, periodo,
  origen, source_id, created_at, updated_at
from lineas_producto
where company_id in (select mis_empresas());

-- Los privilegios por defecto de Supabase dan ALL sobre lo nuevo a anon y authenticated, y una vista de una sola
-- tabla es actualizable: sin este revoke el dueño podría ESCRIBIR en lineas_producto a través de la vista, saltando
-- RLS. Se revoca todo, también a authenticated, y se concede solo leer.
revoke all on lineas_producto_cliente from public, anon, authenticated;
grant select on lineas_producto_cliente to authenticated;`;

/** Una línea armada a mano; lo que no se dice queda null, que es como llega de la base. */
const linea = (id: string, extra: Partial<LineaProducto> = {}): LineaProducto => ({
  id, company_id: EMP_A, codigo: null, nombre: `Línea ${id}`, tipo: "producto", cliente_objetivo: null, necesidad: null, promesa: null,
  precio: null, costo_variable_unitario: null, unidades_periodo: null, horas_por_unidad: null, periodo: null, origen: "declarado", source_id: null,
  decision: null, decision_motivo: null, ...extra,
});

/** Una fila leída del Excel como quedaría guardada: mismos campos, sin periodo y con origen «extraido». */
const comoLinea = (f: FilaImportada, extra: Partial<LineaProducto> = {}): LineaProducto =>
  linea(`fila-${f.fila}`, { codigo: f.codigo, nombre: f.nombre, tipo: f.tipo, precio: f.precio, costo_variable_unitario: f.costo_variable_unitario, unidades_periodo: f.unidades_periodo, horas_por_unidad: f.horas_por_unidad, origen: "extraido", ...extra });

let inventario: FilaImportada[];
let lucero: LineaProducto[];
let blusa: LineaProducto;

// Bajo la suite completa (varias bases embebidas arrancando a la vez) la primera importación de una ruta o
// de una pantalla puede tardar más que los 5 s por defecto. Se importan una vez aquí y se da margen a cada prueba.
vi.setConfig({ testTimeout: 30_000 });

beforeAll(async () => {
  const leido = await lineasDesdeExcel(EXCEL_LUCERO, "Inventario");
  inventario = leido.lectura!.filas;
  lucero = inventario.map((f) => comoLinea(f));
  blusa = lucero.find((l) => l.codigo === "ML-064")!;
  await Promise.all([
    import("@/app/api/companies/[id]/producto/route"),
    import("@/app/api/companies/[id]/producto/[lid]/route"),
    import("@/app/api/companies/[id]/producto/importar/route"),
    import("@/app/(consultor)/empresa/[id]/producto/page"),
    import("@/app/(cliente)/portal/producto/page"),
    import("@/components/producto/FormularioLinea"),
    import("@/components/producto/DecisionLinea"),
  ]);
}, 180_000);

beforeEach(() => {
  vi.mocked(perfilApi).mockReset();
  vi.mocked(registrar).mockClear();
});

// ─────────────────────── Leer el Excel de Modas Lucero ───────────────────────

describe("el inventario de Modas Lucero se lee entero y lo vacío se queda vacío", () => {
  it("120 artículos, con las columnas reconocidas aunque el encabezado diga otra cosa", async () => {
    const leido = await lineasDesdeExcel(EXCEL_LUCERO, "Inventario");
    expect(leido.hojas).toEqual(["Ventas", "Gastos", "Inventario"]);
    expect(leido.fidelidad).toBe("alta");
    expect(leido.lectura!.filas).toHaveLength(120);
    expect(leido.lectura!.columnas.codigo?.encabezado).toBe("codigo");
    expect(leido.lectura!.columnas.nombre?.encabezado).toBe("descripcion");
    expect(leido.lectura!.columnas.precio?.encabezado).toBe("precio_venta");
    expect(leido.lectura!.columnas.costo?.encabezado).toBe("costo_unitario");
    // La fila «TOTAL A COSTO» de la hoja no es un artículo: leerExcel ya la apartó como resumen.
    expect(leido.lectura!.filas.some((f) => /total/i.test(f.nombre) || /total/i.test(f.codigo ?? ""))).toBe(false);
  });

  it("sin pedir hoja elige sola la que tiene nombre o código: Inventario, no Ventas ni Gastos", async () => {
    expect((await lineasDesdeExcel(EXCEL_LUCERO)).lectura!.hoja).toBe("Inventario");
    const otra = await lineasDesdeExcel(EXCEL_LUCERO, "Ventas");
    expect(otra.lectura).toBeNull();
    expect(otra.motivo).toMatch(/«Ventas» no tiene una columna de nombre ni de código/);
  });

  it("40 de 120 sin costo: llegan null, jamás cero ni promedio", () => {
    const sinCosto = inventario.filter((f) => f.costo_variable_unitario === null);
    expect(sinCosto).toHaveLength(40);
    expect(inventario.filter((f) => f.costo_variable_unitario === 0)).toHaveLength(0);
    expect(inventario.every((f) => typeof f.precio === "number" && f.precio > 0)).toBe(true);
  });

  it("las existencias NO se toman como ventas: la columna «stock» no alimenta las unidades vendidas", async () => {
    const leido = await lineasDesdeExcel(EXCEL_LUCERO, "Inventario");
    expect(leido.lectura!.columnas.unidades).toBeNull();
    expect(leido.lectura!.faltantes).toEqual(["tipo", "unidades", "horas"]);
    expect(inventario.every((f) => f.unidades_periodo === null)).toBe(true);
    expect(reconocerColumnas(["codigo", "nombre", "stock", "cantidad", "existencias"]).unidades).toBeNull();
    expect(reconocerColumnas(["Código", "NOMBRE", "Unidades_Vendidas"]).unidades?.encabezado).toBe("Unidades_Vendidas");
  });

  it("la blusa ML-064 del Excel: precio 89, costo 38", () => {
    expect(blusa).toMatchObject({ codigo: "ML-064", nombre: "Blusa modelo 64", precio: 89, costo_variable_unitario: 38, unidades_periodo: null, tipo: "producto" });
  });
});

// ─────────────────────── Evaluar ───────────────────────

describe("evaluar: lo que deja cada línea, con la falta de dato a la vista", () => {
  it("las 40 líneas sin costo: contribución null con su motivo, y sin sugerencia de decisión", () => {
    const ev = evaluar(lucero);
    const sinCosto = ev.lineas.filter((e) => e.costo_variable_unitario === null);
    expect(sinCosto).toHaveLength(40);
    for (const e of sinCosto) {
      expect(e.contribucion_unitaria, e.nombre).toBeNull();
      expect(e.contribucion, e.nombre).toBeNull();
      expect(e.motivos, e.nombre).toContain("sin costo variable por unidad");
      expect(e.sugerencia.clave, e.nombre).toBe("sin_datos");
      expect(e.sugerencia.texto).toBe(TEXTO_SIN_DATOS);
      expect(e.sugerencia.falta).toContain("costo variable por unidad");
      expect(e.decision).toBeNull();
    }
  });

  it("las 80 con costo: se sabe cuánto dejan por unidad, pero sin unidades vendidas tampoco hay total ni sugerencia", () => {
    const ev = evaluar(lucero);
    const conCosto = ev.lineas.filter((e) => e.costo_variable_unitario !== null);
    expect(conCosto).toHaveLength(80);
    for (const e of conCosto) {
      expect(e.contribucion_unitaria).toBe((e.precio as number) - (e.costo_variable_unitario as number));
      expect(e.ingreso).toBeNull();
      expect(e.contribucion).toBeNull();
      expect(e.participacion).toBeNull();
      expect(e.motivos).toEqual(["sin unidades del periodo"]);
      expect(e.sugerencia.clave).toBe("sin_datos");
      expect(e.sugerencia.falta).toEqual(["unidades vendidas en el periodo"]);
    }
    expect(ev.lineas.find((e) => e.codigo === "ML-064")!.contribucion_unitaria).toBe(51); // 89 − 38
  });

  it("el total del inventario tal como está: null con el motivo y la cuenta de lo que falta, no un cero", () => {
    const ev = evaluar(lucero);
    expect(ev.periodo).toBe(SIN_PERIODO);
    expect(ev.totales).toMatchObject({ ingreso: null, contribucion: null, completas: 0, de: 120, fuera_de_periodo: 0, parcial: true });
    expect(ev.totales.aviso).toBe("ninguna de las 120 líneas tiene precio, costo y unidades a la vez (0 sin precio, 40 sin costo, 120 sin unidades): no hay total que calcular");
    // finanzas.ts dice lo mismo, y su null viene explicado.
    expect(ev.calculos.sku!.valor).toBeNull();
    expect(ev.calculos.sku!.motivo_nulo).toMatch(/40 sin costo, 120 sin unidades/);
    expect(explicarCalculo(ev.calculos.sku!).map((l) => l.etiqueta)).toContain("Por qué no hay cifra");
  });

  it("la blusa con sus unidades: 51 por unidad, y la sugerencia aparece solo ahora que hay datos", () => {
    // DATO DE PRUEBA: ningún archivo del piloto trae unidades vendidas. Se declaran 30 para ejercer la cuenta.
    const vendida = { ...blusa, unidades_periodo: 30, periodo: "2026-09" };
    const e = evaluar([vendida]).lineas[0];
    expect(e).toMatchObject({ ingreso: 2670, contribucion_unitaria: 51, contribucion: 1530, participacion: 1, motivos: [], en_periodo: true });
    expect(e.sugerencia.clave).toBe("con_datos");
    expect(e.sugerencia.texto).toBe("con datos completos: deja S/ 51 por unidad y S/ 1,530 en el periodo; la decisión la fija la consultora");
    // Con datos completos tampoco hay decisión: la sugerencia no nombra ninguna de las cinco.
    expect(e.decision).toBeNull();
    for (const d of DECISIONES) expect(e.sugerencia.texto).not.toMatch(new RegExp(`\\b${d}\\b`, "i"));
  });

  it("la sugerencia es determinista: cada caso tiene su texto y solo existe con los tres datos", () => {
    const con = (precio: number | null, costo: number | null, unidades: number | null) => sugerir({ tipo: "producto", precio, costo_variable_unitario: costo, unidades_periodo: unidades });
    expect(con(89, 38, 30).clave).toBe("con_datos");
    expect(con(30, 38, 30)).toMatchObject({ clave: "contribucion_negativa", texto: "revisar: contribución negativa (cada unidad cuesta S/ 8 más de lo que se cobra)" });
    expect(con(38, 38, 30)).toMatchObject({ clave: "contribucion_cero", texto: "revisar: no deja nada por unidad" });
    expect(con(89, 38, 0)).toMatchObject({ clave: "sin_ventas", texto: "revisar: sin ventas en el periodo" });
    // Con un precio que no cubre el costo pero sin unidades, NO se dice «negativa»: faltan datos, y se dice cuáles.
    expect(con(30, 38, null)).toEqual({ clave: "sin_datos", texto: TEXTO_SIN_DATOS, falta: ["unidades vendidas en el periodo"] });
    expect(con(null, null, null).falta).toEqual(["precio", "costo variable por unidad", "unidades vendidas en el periodo"]);
    expect(sugerir({ tipo: "servicio", precio: 1800, costo_variable_unitario: null, unidades_periodo: null }).falta).toEqual(["costo variable por caso", "casos atendidos en el periodo"]);
    // Misma entrada, misma salida; y en otra moneda cambia el símbolo, no la cuenta.
    expect(con(89, 38, 30)).toEqual(con(89, 38, 30));
    expect(sugerir({ tipo: "producto", precio: 89, costo_variable_unitario: 38, unidades_periodo: 30 }, { pais: "MX", moneda: "MXN", idioma: "es", zona_horaria: "America/Mexico_City" }).texto).toContain("$51");
  });

  it("donde finanzas.ts da el detalle, evaluar usa el suyo: las dos cuentas coinciden línea por línea", () => {
    // Tres blusas del Excel con unidades de prueba (30, 12 y 0) y una cuarta sin costo.
    const cuatro = [
      { ...lucero.find((l) => l.codigo === "ML-064")!, unidades_periodo: 30 },
      { ...lucero.find((l) => l.codigo === "ML-016")!, unidades_periodo: 12 },
      { ...lucero.find((l) => l.codigo === "ML-008")!, unidades_periodo: 0 },
      { ...lucero.find((l) => l.codigo === "ML-024")!, unidades_periodo: 5 },
    ];
    const ev = evaluar(cuatro);
    const directo = costeoPorSku(cuatro.map((l) => ({ codigo: l.codigo as string, precio: l.precio as number, costo_variable_unitario: l.costo_variable_unitario, unidades: l.unidades_periodo })));
    for (const [i, d] of directo.valor!.detalle.entries()) {
      expect(ev.lineas[i]).toMatchObject({ ingreso: d.ventas, contribucion_unitaria: d.mc_unitaria, contribucion: d.mc_total, participacion: d.participacion });
    }
    expect(ev.totales).toMatchObject({ ingreso: directo.valor!.total_ventas, contribucion: directo.valor!.total_mc, completas: 3, de: 4, parcial: true });
    expect(ev.totales.aviso).toBe("1 de 4 líneas sin precio, costo o unidades: el total es parcial");
    // Las participaciones de las que tienen unidades suman 1; la que no vendió participa con 0, no con null.
    expect(ev.lineas.reduce((s, e) => s + (e.participacion ?? 0), 0)).toBeCloseTo(1, 10);
    expect(ev.lineas[2]).toMatchObject({ ingreso: 0, contribucion: 0, participacion: 0 });
    expect(ev.lineas[2].sugerencia.clave).toBe("sin_ventas");
    expect(ev.lineas[3]).toMatchObject({ contribucion: null, contribucion_unitaria: null });
  });
});

describe("evaluar: dos líneas solo se suman si son del mismo periodo", () => {
  const sep = linea("a", { nombre: "Blusa", precio: 89, costo_variable_unitario: 38, unidades_periodo: 30, periodo: "2026-09" });
  const sep2 = linea("b", { nombre: "Vestido", precio: 149, costo_variable_unitario: 61, unidades_periodo: 10, periodo: "2026-09" });
  const ago = linea("c", { nombre: "Polo", precio: 49, costo_variable_unitario: 22, unidades_periodo: 100, periodo: "2026-08" });

  it("la línea de otro periodo se muestra con su propia cuenta y no entra en el total ni en la participación", () => {
    const ev = evaluar([sep, sep2, ago]);
    expect(ev.periodo).toBe("2026-09");
    expect(ev.totales).toMatchObject({ ingreso: 89 * 30 + 149 * 10, contribucion: 51 * 30 + 88 * 10, completas: 2, de: 2, fuera_de_periodo: 1, parcial: false });
    expect(ev.totales.aviso).toBe("1 línea(s) de otro periodo no entran en el total");
    const polo = ev.lineas.find((e) => e.id === "c")!;
    expect(polo).toMatchObject({ en_periodo: false, ingreso: 4900, contribucion: 2700, participacion: null });
    expect(polo.motivos[0]).toBe("es de otro periodo (agosto de 2026): no entra en el total ni en la participación de septiembre de 2026");
    expect((ev.lineas[0].participacion as number) + (ev.lineas[1].participacion as number)).toBeCloseTo(1, 10);
  });

  it("el periodo se puede pedir suelto —evaluar(lineas, \"2026-08\")— o en las opciones, y da lo mismo", () => {
    const suelto = evaluar([sep, sep2, ago], "2026-08");
    expect(suelto).toEqual(evaluar([sep, sep2, ago], { periodo: "2026-08" }));
    expect(suelto.totales).toMatchObject({ ingreso: 4900, contribucion: 2700, completas: 1, de: 1, fuera_de_periodo: 2 });
    const ninguno = evaluar([sep, sep2, ago], "2026-07");
    expect(ninguno.totales).toMatchObject({ ingreso: null, contribucion: null, de: 0, fuera_de_periodo: 3 });
    expect(ninguno.totales.aviso).toBe("ninguna línea es de julio de 2026: no hay total que calcular");
    expect(evaluar([sep], SIN_PERIODO).totales.aviso).toBe("ninguna línea está sin periodo declarado: no hay total que calcular");
    // Una sola línea incompleta: la frase no dice «ninguna de las 1 líneas».
    expect(evaluar([linea("u", { precio: 10 })]).totales.aviso).toBe("la única línea no tiene precio, costo y unidades a la vez (0 sin precio, 1 sin costo, 1 sin unidades): no hay total que calcular");
    // Y la que sí declara periodo, vista desde las que no: se dice de qué grupo queda fuera.
    expect(evaluar([linea("x", { precio: 10 }), linea("y", { precio: 12 }), sep]).lineas[2].motivos[0]).toBe("es de otro periodo (septiembre de 2026): no entra en el total ni en la participación de las líneas sin periodo declarado");
  });

  it("el periodo por defecto es el que más líneas comparten, y «sin periodo» cuenta como uno más", () => {
    expect(periodoDe([])).toBe(SIN_PERIODO);
    expect(periodoDe([sep, sep2, ago])).toBe("2026-09");
    // Una sola línea con periodo no deja fuera a las 120 importadas sin periodo.
    expect(periodoDe([...lucero, sep])).toBe(SIN_PERIODO);
    expect(evaluar([...lucero, sep]).totales).toMatchObject({ de: 120, fuera_de_periodo: 1 });
    // En el empate gana un periodo declarado, y entre declarados el más reciente.
    expect(periodoDe([sep, linea("x")])).toBe("2026-09");
    expect(periodoDe([sep, ago])).toBe("2026-09");
    expect(periodosDe([ago, linea("x"), sep, sep2])).toEqual(["2026-09", "2026-08", SIN_PERIODO]);
  });

  it("las formas de periodo: año, mes, trimestre y semestre; una semana no es un periodo de venta", () => {
    for (const p of ["2026", "2026-09", "2026-T3", "2026-S1", "2026-S2"]) expect(periodoValido(p), p).toBe(true);
    for (const p of ["2026-13", "2026-T5", "2026-S3", "2026-S41", "septiembre", "26-09", ""]) expect(periodoValido(p), p).toBe(false);
    expect(nombreDePeriodoLinea("2026-09")).toBe("septiembre de 2026");
    expect(nombreDePeriodoLinea("2026-T3")).toBe("trimestre 3 de 2026");
    expect(nombreDePeriodoLinea("2026-S1")).toBe("primer semestre de 2026");
    expect(nombreDePeriodoLinea("2026")).toBe("año 2026");
    expect(nombreDePeriodoLinea(null)).toBe(SIN_PERIODO);
    // En una frase, el mes va sin artículo y lo demás con él.
    expect([periodoConPreposicion("2026-09", "de"), periodoConPreposicion("2026-09", "en")]).toEqual(["de septiembre de 2026", "en septiembre de 2026"]);
    expect([periodoConPreposicion("2026-S1", "de"), periodoConPreposicion("2026-T3", "en"), periodoConPreposicion("2026", "en")]).toEqual(["del primer semestre de 2026", "en el trimestre 3 de 2026", "en el año 2026"]);
    expect([mesesDePeriodo("2026-09"), mesesDePeriodo("2026-T3"), mesesDePeriodo("2026-S1"), mesesDePeriodo("2026"), mesesDePeriodo(null)]).toEqual([1, 3, 6, 12, null]);
  });
});

// ─────────────────────── Estudio Vargas: servicios y horas ───────────────────────

describe("Estudio Vargas: 62 casos laborales con las horas vacías → horas null, no cero", () => {
  let laborales = 0;
  let conHoras = 0;
  /** El servicio laboral como línea: tarifa del tarifario 2025 (declaraciones.json), casos contados en el Excel. */
  let laboral: LineaProducto;

  beforeAll(async () => {
    const hoja = (await leerExcel(EXCEL_VARGAS)).hojas[0];
    const iMateria = hoja.encabezados.indexOf("materia");
    const iHoras = hoja.encabezados.indexOf("horas_estimadas");
    laborales = hoja.filas.filter((f) => f.celdas[iMateria].valor === "Laboral").length;
    conHoras = hoja.filas.filter((f) => f.celdas[iHoras].valor !== null).length;
    const tarifa = Number(/Tarifario laboral ([\d,]+)/.exec(declaraciones.estudio_vargas.contradicciones_deliberadas[0])![1].replace(",", ""));
    laboral = linea("laboral", { company_id: EMP_B, nombre: "Laboral", tipo: "servicio", precio: tarifa, unidades_periodo: laborales, horas_por_unidad: null, periodo: "2026-S1" });
  });

  it("lo que dicen los papeles: 62 laborales, tarifa 1.800 y ninguna hora anotada en los 110 expedientes", () => {
    expect(laborales).toBe(62);
    expect(conHoras).toBe(0);
    expect(laboral.precio).toBe(1800);
  });

  it("horas null con su motivo; el ingreso por hora y la carga total tampoco existen", () => {
    const ev = evaluar([laboral]);
    const e = ev.lineas[0];
    expect(e.ingreso).toBe(111_600); // 1.800 × 62: la tarifa del tarifario por los casos, no lo cobrado
    expect(e.horas).toBeNull();
    expect(e.ingreso_por_hora).toBeNull();
    expect(e.contribucion).toBeNull();
    expect(e.motivos).toEqual(["sin costo variable por caso", "sin horas por caso: no se sabe cuánto tiempo se lleva"]);
    expect(e.sugerencia).toEqual({ clave: "sin_datos", texto: TEXTO_SIN_DATOS, falta: ["costo variable por caso"] });
    expect(ev.horas).toMatchObject({ total: null, disponibles: null, utilizacion_pct: null });
    expect(ev.horas.motivo).toBe("Horas no registradas en: Laboral. La carga total no se puede sumar ni comparar con la capacidad.");
  });

  it("ni declarando la capacidad se inventa la utilización: sin horas, costeoPorServicio también devuelve null", () => {
    const capacidad = { personas: 2, horas_mes_por_persona: 160 };
    const ev = evaluar([laboral], { capacidad });
    expect(ev.horas).toMatchObject({ total: null, disponibles: 1920, utilizacion_pct: null }); // 2 × 160 × 6 meses del semestre
    expect(ev.calculos.servicio!.valor!.servicios_sin_horas).toEqual(["Laboral"]);
    expect(ev.calculos.servicio!.valor!.utilizacion_pct).toBeNull();
    expect(ev.lineas[0].horas).toBeNull();
  });

  it("con las «unas 25 horas por caso» que declaró el socio: 1.550 horas, y coincide con costeoPorServicio", () => {
    const horas = Number(/(\d+) horas por caso/.exec(declaraciones.estudio_vargas.entrada_breve.horas_por_caso_laboral)![1]);
    expect(horas).toBe(25);
    const declarada = { ...laboral, horas_por_unidad: horas };
    const sinCapacidad = evaluar([declarada]);
    expect(sinCapacidad.lineas[0]).toMatchObject({ horas: 1550, ingreso_por_hora: 72 });
    expect(sinCapacidad.horas).toMatchObject({ total: 1550, disponibles: null, utilizacion_pct: null, motivo: "Sin capacidad declarada (personas × horas al mes) no se calcula la utilización." });

    const capacidad = { personas: 2, horas_mes_por_persona: 160 };
    const con = evaluar([declarada], { capacidad });
    const directo = costeoPorServicio([{ nombre: "Laboral", tarifa: 1800, horas_por_caso: 25, casos: 62, costo_hora: null }], { ...capacidad, meses: 6 });
    expect(con.lineas[0]).toMatchObject({ horas: directo.valor!.detalle[0].horas, ingreso_por_hora: directo.valor!.detalle[0].ingreso_por_hora });
    expect(con.horas.total).toBe(directo.valor!.horas_requeridas);
    expect(con.horas.utilizacion_pct).toBeCloseTo(80.73, 2); // 1.550 / 1.920
    expect(con.horas.utilizacion_pct).toBe(directo.valor!.utilizacion_pct);
  });

  it("la capacidad solo existe si vienen los dos números y tienen sentido", () => {
    expect(capacidadDe({ personas: "2", horas: "160" })).toEqual({ personas: 2, horas_mes_por_persona: 160 });
    for (const malo of [{}, { personas: "2" }, { horas: "160" }, { personas: "0", horas: "160" }, { personas: "dos", horas: "160" }, { personas: "2", horas: "-5" }, { personas: "2", horas: "900" }, { personas: " ", horas: "160" }]) {
      expect(capacidadDe(malo), JSON.stringify(malo)).toBeNull();
    }
  });
});

// ─────────────────────── Reglas de guardado y lectura de números ───────────────────────

describe("lo que no se puede guardar, y por qué", () => {
  const base = { tipo: "producto" as const, horas_por_unidad: null, decision: null, decision_motivo: null, periodo: null };

  it("una decisión sin motivo no se guarda; un motivo sin decisión tampoco", () => {
    expect(revisarLinea(base)).toBeNull();
    expect(revisarLinea({ ...base, decision: "retirar" })).toBe("Di por qué: la decisión se guarda con su motivo.");
    expect(revisarLinea({ ...base, decision: "retirar", decision_motivo: "   " })).toBe("Di por qué: la decisión se guarda con su motivo.");
    expect(revisarLinea({ ...base, decision: "retirar", decision_motivo: "No rota desde marzo y ocupa el estante de entrada" })).toBeNull();
    expect(revisarLinea({ ...base, decision_motivo: "porque sí" })).toBe("Hay un motivo sin decisión: elige la decisión o quita el motivo.");
  });

  it("las horas son de un servicio, y el periodo tiene que estar bien escrito", () => {
    expect(revisarLinea({ ...base, horas_por_unidad: 3 })).toBe("Las horas por unidad son de un servicio; en un producto no aplican.");
    expect(revisarLinea({ ...base, tipo: "servicio", horas_por_unidad: 3 })).toBeNull();
    expect(revisarLinea({ ...base, periodo: "setiembre" })).toMatch(/^El periodo se escribe así: 2026 \(un año\)/);
    expect(revisarLinea({ ...base, periodo: "2026-09" })).toBeNull();
  });

  it("las cinco decisiones tienen su texto para la consultora", () => {
    expect([...DECISIONES]).toEqual(["conservar", "mejorar", "ampliar", "reposicionar", "retirar"]);
    for (const d of DECISIONES) expect(DECISION_TEXTO[d].length).toBeGreaterThan(10);
  });

  it("un número se lee como se escribe; lo vacío y lo que no es número son null, no cero", () => {
    expect(numero("89")).toBe(89);
    expect(numero("1,250.50")).toBe(1250.5);
    expect(numero("1250,50")).toBe(1250.5);
    expect(numero("1,250")).toBe(1250);
    expect(numero("12,5")).toBe(12.5);
    expect(numero("S/ 89")).toBe(89);
    expect(numero(0)).toBe(0); // un cero escrito SÍ es un cero
    for (const vacio of [null, undefined, "", "   ", "consultar", "n/a", true, Number.NaN]) expect(numero(vacio)).toBeNull();
    // Como llega de PostgREST: numeric en texto, y lo que no vino queda null.
    expect(desdeFila({ id: "1", company_id: EMP_A, nombre: "Blusa", tipo: "producto", precio: "89.00", costo_variable_unitario: null })).toMatchObject({ precio: 89, costo_variable_unitario: null, unidades_periodo: null, decision: null, origen: null });
    expect(desdeFila({ id: "1", company_id: EMP_A, nombre: "X", tipo: "producto", decision: "liquidar" }).decision).toBeNull(); // una decisión que no existe no se muestra como tal
  });
});

// ─────────────────────── Importar: columnas tolerantes y vista previa ───────────────────────

async function excel(filas: (string | number | null)[][], hoja = "Lista"): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const ws = libro.addWorksheet(hoja);
  for (const f of filas) ws.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe("importar desde un Excel cualquiera: encabezados escritos de cualquier manera y huecos que se respetan", () => {
  it("mayúsculas, tildes y guiones no importan; el texto donde iba un número se deja vacío y se avisa con su celda", async () => {
    const libro = await excel([
      ["CÓDIGO", "Nombre", "Precio_Venta", "Costo Unitario", "Unidades Vendidas"],
      ["A-1", "Blusa", 89, 38, 30],
      ["A-2", "Vestido", 149, null, 10],
      ["A-3", "Polo", "consultar", 22, null],
      [null, null, 10, 5, 1],
      ["A-5", null, 59, -4, 2],
    ]);
    const { lectura } = await lineasDesdeExcel(libro);
    expect(lectura!.faltantes).toEqual(["tipo", "horas"]);
    expect(lectura!.filas.map((f) => [f.codigo, f.nombre, f.precio, f.costo_variable_unitario, f.unidades_periodo])).toEqual([
      ["A-1", "Blusa", 89, 38, 30],
      ["A-2", "Vestido", 149, null, 10],
      ["A-3", "Polo", null, 22, null],
      ["A-5", "A-5", 59, null, 2],
    ]);
    expect(lectura!.filas[2].avisos).toEqual(["precio no numérico («consultar» en C4): se dejó vacío"]);
    expect(lectura!.filas[3].avisos).toEqual(["sin nombre: se usa el código como nombre", "costo negativo (-4 en D6): se dejó vacío"]);
    expect(lectura!.omitidas).toEqual([{ fila: 5, motivo: "sin código ni nombre" }]);
  });

  it("un artículo cuyo nombre empieza por «Total» ya no se pierde; una fila de total se omite, y TODA fila omitida se dice con su rótulo", async () => {
    // Dos filtros en fila. Primero la lectura del Excel (documentos/excel.ts) aparta lo que tiene forma de total: un
    // rótulo sin duda, una cifra que suma su columna, o un rótulo con una sola cifra más ralo que un dato. Después
    // lineasDesdeHoja decide sobre lo que le llega. Antes, aquí bastaba con empezar por «Total» para perder la fila.
    const libro = await excel([
      ["Código", "Nombre", "Precio", "Costo", "Unidades"],
      ["A-1", "Blusa", 89, 38, 30],
      ["A-2", "Total Look pack x3", 149, 70, 4], // un artículo: trae su código y su precio
      [null, "Total Sport zapatilla", 120, 55, 3], // un artículo: sin código, pero con su precio y sus números
      [null, "Total Sport zapatilla sin datos", 120, null, null], // un rótulo y una sola cifra: la lectura lo aparta, y se dice
      ["A-9", "TOTAL", 5, 2, 1], // el rótulo solo es una suma, traiga lo que traiga
      [null, "Total unidades", null, null, 38],
      [null, "TOTAL", 358, 163, 38],
      ["TOTAL", null, null, null, 38],
      [null, "Subtotal", null, null, 30],
      [null, "Totalizador digital", 45, 20, 2], // no empieza por la palabra «total»
    ]);
    const { lectura } = await lineasDesdeExcel(libro);
    expect(lectura!.filas.map((f) => [f.fila, f.codigo, f.nombre, f.precio])).toEqual([
      [2, "A-1", "Blusa", 89],
      [3, "A-2", "Total Look pack x3", 149],
      [4, null, "Total Sport zapatilla", 120],
      [11, null, "Totalizador digital", 45],
    ]);
    // Lo que entró empezando por «Total» lleva su aviso: la consultora lo ve en la vista previa y decide.
    const aviso = "el nombre empieza por «Total»: se toma como un artículo porque la fila trae código o precio; si era una fila de suma, quítala del archivo";
    expect(lectura!.filas.map((f) => f.avisos)).toEqual([[], [aviso], [aviso], []]);
    // Ninguna de las otras seis desaparece sin más: cada una está en la lista de omitidas, con su fila y su rótulo.
    const apartada = (rotulo: string) => `la lectura del Excel la apartó como fila de total o resumen («${rotulo}»): no se importa como línea`;
    expect(lectura!.omitidas).toEqual([
      { fila: 5, motivo: apartada("Total Sport zapatilla sin datos") },
      { fila: 6, motivo: "es una fila de total («TOTAL»), no una línea" },
      { fila: 7, motivo: apartada("Total unidades") },
      { fila: 8, motivo: apartada("TOTAL") },
      { fila: 9, motivo: apartada("TOTAL") },
      { fila: 10, motivo: apartada("Subtotal") },
    ]);
    expect(lectura!.filas.length + lectura!.omitidas.length).toBe(10); // las diez filas de la hoja, ni una menos
  });

  it("servicios: el tipo sale de la columna o de quien importa, y las horas solo valen para un servicio", async () => {
    const hoja = (await leerExcel(await excel([["servicio", "tarifa", "casos", "horas por caso", "tipo"], ["Laboral", 1800, 62, null, "Servicio"], ["Libro de reclamaciones", 35, 4, 2, "producto"], ["Civil", 2500, 30, 40, null]]))).hojas[0];
    const porDefectoProducto = lineasDesdeHoja(hoja);
    expect(porDefectoProducto.filas.map((f) => [f.nombre, f.tipo, f.horas_por_unidad])).toEqual([["Laboral", "servicio", null], ["Libro de reclamaciones", "producto", null], ["Civil", "producto", null]]);
    expect(porDefectoProducto.filas[1].avisos).toEqual(["trae horas pero es un producto: las horas no se importan"]);
    const porDefectoServicio = lineasDesdeHoja(hoja, { tipoPorDefecto: "servicio" });
    expect(porDefectoServicio.filas.map((f) => [f.nombre, f.tipo, f.precio, f.unidades_periodo, f.horas_por_unidad])).toEqual([["Laboral", "servicio", 1800, 62, null], ["Libro de reclamaciones", "producto", 35, 4, null], ["Civil", "servicio", 2500, 30, 40]]);
  });

  it("una hoja sin nombre ni código no es una lista de lo que se vende: no se importa nada y se dice", async () => {
    const r = await lineasDesdeExcel(await excel([["mes", "ventas"], ["2026-09", 80000]]));
    expect(r.lectura).toBeNull();
    expect(r.motivo).toMatch(/^Ninguna hoja tiene una columna de nombre ni de código/);
  });

  it("vista previa: qué se crea, qué se actualiza por código y qué se omite, antes de escribir nada", () => {
    const fila = (n: number, codigo: string | null, nombre: string, extra: Partial<FilaImportada> = {}): FilaImportada => ({ fila: n, codigo, nombre, tipo: "producto", precio: 10, costo_variable_unitario: null, unidades_periodo: null, horas_por_unidad: null, avisos: [], ...extra });
    const existentes = [{ id: "L1", codigo: "ML-001", nombre: "Pantalón modelo 1" }, { id: "L2", codigo: null, nombre: "Arreglo de basta" }];
    const vista = vistaPreviaLineas(
      [fila(2, "ML-001", "Pantalón modelo 1"), fila(3, "ML-900", "Blusa nueva"), fila(4, "ml-900", "Blusa repetida"), fila(5, null, "ARREGLO DE BASTA"), fila(6, null, "Bolsa de tela"), fila(7, null, "bolsa  de tela")],
      existentes,
      [{ fila: 9, motivo: "sin código ni nombre" }]
    );
    expect(vista.nuevas.map((f) => f.fila)).toEqual([3, 6]);
    expect(vista.actualizan).toEqual([expect.objectContaining({ fila: 2, id: "L1" })]);
    expect(vista.omitidas).toEqual([
      { fila: 9, nombre: null, motivo: "sin código ni nombre" },
      { fila: 4, nombre: "Blusa repetida", motivo: "código «ml-900» repetido en el archivo (ya está en la fila 3)" },
      { fila: 5, nombre: "ARREGLO DE BASTA", motivo: "ya existe una línea con ese nombre y la fila no trae código para distinguirla" },
      { fila: 7, nombre: "bolsa  de tela", motivo: "nombre repetido en el archivo (ya está en la fila 6)" },
    ]);
  });
});

// ─────────────────────── Lo que ve el dueño ───────────────────────

describe("el resumen del dueño: sus palabras, sin decisiones y sin ceros inventados", () => {
  const JERGA = /contribuci[oó]n|SKU|costo variable|margen|pilar|claim|matriz|sugerencia|extra[ií]do|conciliar|\bKPI\b/i;

  it("Modas Lucero tal como está en su Excel: lo que deja por unidad, lo que falta dicho una vez", () => {
    const r = resumenParaDueno(lucero, evaluar(lucero));
    expect(r.lineas).toHaveLength(120);
    expect(r.lineas.filter((l) => l.conDatos)).toHaveLength(80);
    const b = r.lineas.find((l) => l.nombre === "Blusa modelo 64")!;
    // A las 120 les falta lo vendido: se dice una vez abajo (`faltan`), no en cada una de las ochenta.
    expect(b.deja).toBe("Te deja S/ 51 por unidad.");
    const sinCosto = r.lineas.find((l) => !l.conDatos)!;
    expect(sinCosto.deja).toBe("Todavía no sabemos cuánto te deja: falta lo que te cuesta cada unidad.");
    expect(r.faltan).toBe(
      "De ninguno de tus 120 productos o servicios sabemos todavía cuánto deja en total: falta lo que te cuesta cada uno y cuánto vendiste de cada uno. No lo calculamos a ojo. Si lo tienes en un cuaderno o en un Excel, pásaselo a tu consultora."
    );
    // Sin lo vendido no hay ranking por total: se ordena por lo que deja cada venta, y se dice que es eso.
    expect(r.dejanMas.criterio).toBe("por_unidad");
    expect(r.dejanMas.lineas).toHaveLength(3);
    expect(r.dejanMas.lineas[0].texto).toMatch(/^Casaca modelo \d+: S\/ \d+ por unidad$/);
    expect(r.dejanMas.nota).toBe("Por cada venta, no en total: falta saber cuánto se vendió de cada uno. Y solo entre 80 de 120: los demás todavía no tienen precio y costo.");
    expect(JSON.stringify(r)).not.toMatch(JERGA);
    expect(JSON.stringify(r)).not.toMatch(/S\/ 0\b/);
  });

  it("con lo vendido: cuánto dejó en el periodo y cuáles dejaron más, solo entre las que tienen datos", () => {
    const lineas = [
      linea("a", { nombre: "Blusa", precio: 89, costo_variable_unitario: 38, unidades_periodo: 30, periodo: "2026-09", promesa: "Te queda bien a la primera", cliente_objetivo: "Mujeres de oficina" }),
      linea("b", { nombre: "Vestido de fiesta", precio: 149, costo_variable_unitario: 61, unidades_periodo: 25, periodo: "2026-09" }),
      linea("c", { nombre: "Polo", precio: 49, costo_variable_unitario: 55, unidades_periodo: 8, periodo: "2026-09" }),
      linea("d", { nombre: "Casaca", precio: 219, periodo: "2026-09" }),
    ];
    const r = resumenParaDueno(lineas, evaluar(lineas));
    expect(r.periodo).toBe("septiembre de 2026");
    expect(r.lineas[0]).toEqual({ nombre: "Blusa", tipo: "producto", promesa: "Te queda bien a la primera", cliente: "Mujeres de oficina", deja: "Te deja S/ 51 por unidad. En septiembre de 2026 dejó S/ 1,530.", conDatos: true });
    expect(r.lineas[2].deja).toBe("Hoy cada unidad te cuesta S/ 6 más de lo que cobras.");
    expect(r.lineas[3].deja).toBe("Todavía no sabemos cuánto te deja: falta lo que te cuesta cada unidad.");
    // Cuando lo vendido falta en UNA y no en todas, se dice en esa.
    const conFalda = [...lineas, linea("e", { nombre: "Falda", precio: 79, costo_variable_unitario: 34, periodo: "2026-09" })];
    expect(resumenParaDueno(conFalda, evaluar(conFalda)).lineas[4].deja).toBe("Te deja S/ 45 por unidad. Falta saber cuánto vendiste para decirte cuánto dejó en total.");
    expect(r.dejanMas).toEqual({
      criterio: "en_el_periodo",
      lineas: [{ nombre: "Vestido de fiesta", texto: "Vestido de fiesta: S/ 2,200" }, { nombre: "Blusa", texto: "Blusa: S/ 1,530" }],
      nota: "Solo entre 3 de 4: los demás todavía no tienen precio, costo y cantidad vendida.",
    });
    expect(r.faltan).toBe("De 1 de tus 4 productos o servicios todavía no sabemos cuánto deja en total: falta lo que te cuesta cada uno y cuánto vendiste de cada uno. No lo calculamos a ojo. Si lo tienes en un cuaderno o en un Excel, pásaselo a tu consultora.");
    expect(JSON.stringify(r)).not.toMatch(JERGA);
  });

  it("ninguna decisión llega al dueño, aunque la fila la traiga con su motivo", () => {
    const motivo = "MOTIVO-INTERNO: no rota desde marzo";
    const lineas = lucero.slice(0, 5).map((l, i) => ({ ...l, decision: DECISIONES[i], decision_motivo: motivo }));
    const texto = JSON.stringify(resumenParaDueno(lineas, evaluar(lineas)));
    expect(texto).not.toContain("MOTIVO-INTERNO");
    for (const d of DECISIONES) {
      expect(texto).not.toContain(DECISION_TEXTO[d]);
      expect(texto).not.toMatch(new RegExp(`"${d}"`));
    }
    expect(texto).not.toMatch(/decisi[oó]n/i);
  });

  it("un servicio se cuenta por caso, y completo no deja nada por decir", () => {
    const civil = linea("s", { nombre: "Civil", tipo: "servicio", precio: 2500, costo_variable_unitario: 400, unidades_periodo: 30, periodo: "2026-S1" });
    const r = resumenParaDueno([civil], evaluar([civil]));
    expect(r.lineas[0].deja).toBe("Te deja S/ 2,100 por caso. En el primer semestre de 2026 dejó S/ 63,000.");
    expect(r.faltan).toBeNull();
    expect(r.dejanMas.nota).toBeNull();
  });
});

// ─────────────────────── Las rutas, con dobles ───────────────────────

type Ctx = { params: Promise<{ id: string }> };
type CtxLinea = { params: Promise<{ id: string; lid: string }> };

async function importar(archivo: Buffer, campos: Record<string, string> = {}, nombre = "ventas-e-inventario.xlsx", empresa = EMP_A) {
  const { POST } = await import("@/app/api/companies/[id]/producto/importar/route");
  const form = new FormData();
  form.set("archivo", new File([new Uint8Array(archivo)], nombre, { type: MIME_XLSX }));
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  const res = await (POST as (req: Request, ctx: Ctx) => Promise<Response>)(new Request(`http://8x.test/api/companies/${empresa}/producto/importar`, { method: "POST", body: form }), { params: Promise.resolve({ id: empresa }) });
  return { status: res.status, body: (await res.json()) as Fila };
}

async function crear(cuerpo: unknown) {
  const { POST } = await import("@/app/api/companies/[id]/producto/route");
  const res = await (POST as (req: Request, ctx: Ctx) => Promise<Response>)(new Request(`http://8x.test/api/companies/${EMP_A}/producto`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }), { params: Promise.resolve({ id: EMP_A }) });
  return { status: res.status, body: (await res.json()) as Fila };
}

async function editar(lid: string, cuerpo: unknown) {
  const { PATCH } = await import("@/app/api/companies/[id]/producto/[lid]/route");
  const res = await (PATCH as (req: Request, ctx: CtxLinea) => Promise<Response>)(new Request(`http://8x.test/api/companies/${EMP_A}/producto/${lid}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }), { params: Promise.resolve({ id: EMP_A, lid }) });
  return { status: res.status, body: (await res.json()) as Fila };
}

async function leer(consulta = "") {
  const { GET } = await import("@/app/api/companies/[id]/producto/route");
  const res = await (GET as (req: Request, ctx: Ctx) => Promise<Response>)(new Request(`http://8x.test/api/companies/${EMP_A}/producto${consulta}`), { params: Promise.resolve({ id: EMP_A }) });
  return { status: res.status, body: (await res.json()) as Fila };
}

describe("POST /producto/importar · con dobles · primero la vista previa, después escribir", () => {
  it("la vista previa del Excel de Modas Lucero dice 120 nuevas y no escribe nada", async () => {
    const base = crearBaseFalsa();
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const r = await importar(EXCEL_LUCERO, { hoja: "Inventario" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ archivo: "ventas-e-inventario.xlsx", hoja: "Inventario", hojas: ["Ventas", "Gastos", "Inventario"], faltantes: ["tipo", "unidades", "horas"], total_filas: 121, tipo: "producto" });
    expect(r.body.nuevas).toHaveLength(120);
    expect(r.body.actualizan).toEqual([]);
    // La hoja termina con el total que escribió la empresa (fila 123). No es un artículo y no se importa, pero se dice.
    expect(r.body.omitidas).toEqual([{ fila: 123, nombre: null, motivo: "la lectura del Excel la apartó como fila de total o resumen («TOTAL A COSTO (solo los que tienen costo)»): no se importa como línea" }]);
    expect(base.pedidos.filter((p) => p.op !== "select")).toEqual([]);
    expect(base.tablas.lineas_producto).toEqual([]);
  });

  it("confirmar escribe exactamente lo que se vio: 120 filas, 40 con el costo en null, origen «extraido», sin decisión", async () => {
    const base = crearBaseFalsa();
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const r = await importar(EXCEL_LUCERO, { modo: "confirmar", hoja: "Inventario" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ creadas: 120, actualizadas: 0 });
    const guardadas = base.tablas.lineas_producto;
    expect(guardadas).toHaveLength(120);
    expect(guardadas.filter((f) => f.costo_variable_unitario === null)).toHaveLength(40);
    expect(guardadas.filter((f) => f.costo_variable_unitario === 0 || f.unidades_periodo === 0)).toEqual([]);
    expect(guardadas.every((f) => f.unidades_periodo === null && f.origen === "extraido" && f.company_id === EMP_A && f.periodo === null)).toBe(true);
    expect(guardadas.some((f) => "decision" in f)).toBe(false);
    expect(guardadas.find((f) => f.codigo === "ML-064")).toMatchObject({ nombre: "Blusa modelo 64", precio: 89, costo_variable_unitario: 38, tipo: "producto" });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ companyId: EMP_A, accion: "crear", entidad: "linea_producto", detalle: expect.objectContaining({ creadas: 120, actualizadas: 0, hoja: "Inventario" }) }));
  });

  it("volver a importar no duplica: las 120 se actualizan por su código, y lo vacío del archivo no borra lo que ya había", async () => {
    const base = crearBaseFalsa();
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    await importar(EXCEL_LUCERO, { modo: "confirmar", hoja: "Inventario" });
    // Entre una carga y otra la consultora anotó el costo que faltaba de ML-003 y decidió sobre ML-064.
    const polo = base.tablas.lineas_producto.find((f) => f.codigo === "ML-003")!;
    expect(polo.costo_variable_unitario).toBeNull();
    polo.costo_variable_unitario = 24;
    Object.assign(base.tablas.lineas_producto.find((f) => f.codigo === "ML-064")!, { decision: "ampliar", decision_motivo: "Es la que más rota" });

    const vista = await importar(EXCEL_LUCERO, { hoja: "Inventario" });
    expect(vista.body.nuevas).toEqual([]);
    expect(vista.body.actualizan).toHaveLength(120);
    const r = await importar(EXCEL_LUCERO, { modo: "confirmar", hoja: "Inventario", periodo: "2026-09" });
    expect(r.body).toMatchObject({ creadas: 0, actualizadas: 120 });
    expect(base.tablas.lineas_producto).toHaveLength(120);
    expect(base.tablas.lineas_producto.find((f) => f.codigo === "ML-003")).toMatchObject({ costo_variable_unitario: 24, periodo: "2026-09" });
    expect(base.tablas.lineas_producto.find((f) => f.codigo === "ML-064")).toMatchObject({ decision: "ampliar", decision_motivo: "Es la que más rota", precio: 89 });
  });

  it("al actualizar por código la línea pasa a «extraido» y toma el periodo; la fila que no trae ningún número no cambia de origen ni de periodo", async () => {
    const base = crearBaseFalsa({
      lineas_producto: [
        { id: "c1", company_id: EMP_A, codigo: "A-1", nombre: "Blusa", tipo: "producto", precio: 80, costo_variable_unitario: 38, unidades_periodo: 25, horas_por_unidad: null, periodo: "2026-08", origen: "conciliado", source_id: null, decision: "ampliar", decision_motivo: "Es la que más rota" },
        { id: "c2", company_id: EMP_A, codigo: "A-2", nombre: "Vestido", tipo: "producto", precio: 149, costo_variable_unitario: 70, unidades_periodo: 10, horas_por_unidad: null, periodo: "2026-08", origen: "conciliado", source_id: null, decision: null, decision_motivo: null },
        { id: "c3", company_id: EMP_A, codigo: "A-3", nombre: "Polo", tipo: "producto", precio: 39, costo_variable_unitario: null, unidades_periodo: null, horas_por_unidad: null, periodo: null, origen: "declarado", source_id: null, decision: null, decision_motivo: null },
      ],
    });
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const libro = await excel([["Código", "Nombre", "Precio", "Costo", "Unidades"], ["A-1", "Blusa", 89, null, 30], ["A-2", "Vestido", null, null, null], ["A-3", "Polo", null, 22, null]]);
    const r = await importar(libro, { modo: "confirmar", periodo: "2026-09" }, "precios-setiembre.xlsx");
    expect(r.body).toMatchObject({ creadas: 0, actualizadas: 3 });
    const fila = (codigo: string) => base.tablas.lineas_producto.find((f) => f.codigo === codigo)!;
    // El precio y las unidades vinieron del archivo: ya no es lo que alguien concilió. El costo, que el archivo
    // no trae, se conserva; la decisión de la consultora no se toca.
    expect(fila("A-1")).toMatchObject({ precio: 89, costo_variable_unitario: 38, unidades_periodo: 30, origen: "extraido", periodo: "2026-09", decision: "ampliar", decision_motivo: "Es la que más rota" });
    // El archivo no trajo ningún número del vestido: sigue conciliado y en su periodo.
    expect(fila("A-2")).toMatchObject({ precio: 149, costo_variable_unitario: 70, unidades_periodo: 10, origen: "conciliado", periodo: "2026-08" });
    // Con un solo número del archivo basta: la fila deja de ser «declarada».
    expect(fila("A-3")).toMatchObject({ precio: 39, costo_variable_unitario: 22, origen: "extraido", periodo: "2026-09" });
  });

  it("lo que no es un Excel, un periodo mal escrito o un tipo inventado se rechazan con su explicación", async () => {
    estado.base = crearBaseFalsa();
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const falso = await importar(Buffer.from("codigo,nombre\nA,Blusa\n"), {}, "lista.xlsx");
    expect(falso).toMatchObject({ status: 400, body: { error: "El archivo dice ser un Excel (.xlsx) pero su contenido no lo es. Ábrelo en Excel y guárdalo de nuevo como .xlsx." } });
    expect((await importar(EXCEL_LUCERO, { periodo: "setiembre" })).body.error).toMatch(/^El periodo se escribe así/);
    expect((await importar(EXCEL_LUCERO, { tipo: "combo" })).body.error).toBe("El tipo tiene que ser producto o servicio.");
    expect((await importar(EXCEL_LUCERO, { modo: "borrar" })).body.error).toBe("El modo tiene que ser vista_previa o confirmar.");
    expect((await importar(EXCEL_LUCERO, { hoja: "Gastos" })).body.error).toMatch(/«Gastos» no tiene una columna de nombre ni de código/);
  });

  it("el dueño no importa: 403, y nada llega a la base", async () => {
    const base = crearBaseFalsa();
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(DUENA);
    const r = await importar(EXCEL_LUCERO, { modo: "confirmar" });
    expect(r).toMatchObject({ status: 403, body: { error: "Solo el consultor puede hacer esto." } });
    expect(base.tablas.lineas_producto ?? []).toEqual([]);
  });
});

describe("crear, editar y decidir · con dobles · la decisión es de la consultora y lleva su motivo", () => {
  const L1 = "11111111-1111-4111-8111-111111111111";
  const baseConBlusa = () => crearBaseFalsa({ lineas_producto: [{ id: L1, company_id: EMP_A, codigo: "ML-064", nombre: "Blusa modelo 64", tipo: "producto", precio: 89, costo_variable_unitario: 38, unidades_periodo: null, horas_por_unidad: null, periodo: null, origen: "extraido", decision: null, decision_motivo: null }] });

  it("crear a mano: lo que no se manda queda vacío, nunca en cero; el origen es «declarado»", async () => {
    const base = crearBaseFalsa();
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const r = await crear({ nombre: "Arreglo de basta", tipo: "servicio", precio: 15 });
    expect(r.status).toBe(201);
    expect(r.body.linea).toMatchObject({ nombre: "Arreglo de basta", tipo: "servicio", precio: 15, costo_variable_unitario: null, unidades_periodo: null, horas_por_unidad: null, origen: "declarado", decision: null });
    expect(base.tablas.lineas_producto[0]).not.toHaveProperty("costo_variable_unitario");
  });

  it("crear con horas en un producto, con decisión sin motivo, con un negativo o con un código repetido: no entra", async () => {
    estado.base = baseConBlusa();
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    expect((await crear({ nombre: "Blusa", tipo: "producto", horas_por_unidad: 2 })).body.error).toBe("Las horas por unidad son de un servicio; en un producto no aplican.");
    expect((await crear({ nombre: "Blusa", tipo: "producto", decision: "retirar" })).body.error).toBe("Di por qué: la decisión se guarda con su motivo.");
    expect((await crear({ nombre: "Blusa", tipo: "producto", decision: "liquidar", decision_motivo: "x" })).status).toBe(400);
    expect((await crear({ nombre: "Blusa", tipo: "producto", precio: -5 })).body.error).toBe("Revisa estos campos: precio.");
    expect((await crear({ tipo: "producto" })).body.error).toBe("Revisa estos campos: nombre.");
    expect(await crear({ nombre: "Otra blusa", tipo: "producto", codigo: "ML-064" })).toMatchObject({ status: 409, body: { error: "Ya hay una línea con el código «ML-064» en esta empresa." } });
  });

  it("fijar la decisión: sin motivo no se guarda; con motivo queda en la fila y en el rastro, con quién", async () => {
    const base = baseConBlusa();
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    expect(await editar(L1, { decision: "ampliar" })).toMatchObject({ status: 400, body: { error: "Di por qué: una decisión nueva se guarda con su propio motivo." } });
    expect(base.tablas.lineas_producto[0].decision).toBeNull();

    const r = await editar(L1, { decision: "ampliar", decision_motivo: "Deja 51 por unidad y es la que más preguntan" });
    expect(r.status).toBe(200);
    expect(base.tablas.lineas_producto[0]).toMatchObject({ decision: "ampliar", decision_motivo: "Deja 51 por unidad y es la que más preguntan", precio: 89, costo_variable_unitario: 38 });
    expect(registrar).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: EMP_A, actor: CONSULTORA, accion: "editar", entidad: "linea_producto", entidadId: L1, detalle: expect.objectContaining({ decision_antes: null, decision_despues: "ampliar", motivo: "Deja 51 por unidad y es la que más preguntan" }) })
    );
  });

  it("cambiar la decisión pide su propio motivo; quitarla se lleva el motivo y también deja rastro", async () => {
    const base = baseConBlusa();
    Object.assign(base.tablas.lineas_producto[0], { decision: "ampliar", decision_motivo: "Es la que más rota" });
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    expect((await editar(L1, { decision: "retirar" })).body.error).toBe("Di por qué: una decisión nueva se guarda con su propio motivo.");
    expect(base.tablas.lineas_producto[0]).toMatchObject({ decision: "ampliar", decision_motivo: "Es la que más rota" });
    // Editar un dato sin tocar la decisión no la pierde.
    expect((await editar(L1, { unidades_periodo: 30, periodo: "2026-09" })).status).toBe(200);
    expect(base.tablas.lineas_producto[0]).toMatchObject({ decision: "ampliar", decision_motivo: "Es la que más rota", unidades_periodo: 30 });

    expect((await editar(L1, { decision: null })).status).toBe(200);
    expect(base.tablas.lineas_producto[0]).toMatchObject({ decision: null, decision_motivo: null });
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ entidad: "linea_producto", entidadId: L1, detalle: expect.objectContaining({ decision_antes: "ampliar", decision_despues: null, motivo: null }) }));
  });

  it("una línea de otra empresa no existe para esta: 404, y un cuerpo vacío no cambia nada", async () => {
    const base = baseConBlusa();
    base.tablas.lineas_producto[0].company_id = EMP_B;
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    expect(await editar(L1, { precio: 1 })).toMatchObject({ status: 404, body: { error: "Esa línea no es de esta empresa." } });
    expect(base.tablas.lineas_producto[0].precio).toBe(89);
    expect((await editar(L1, {})).body.error).toBe("No hay nada que cambiar.");
  });

  it("el dueño no crea, no edita y no decide: 403", async () => {
    estado.base = baseConBlusa();
    vi.mocked(perfilApi).mockResolvedValue(DUENA);
    expect((await crear({ nombre: "Blusa", tipo: "producto" })).status).toBe(403);
    expect((await editar(L1, { decision: "retirar", decision_motivo: "x" })).status).toBe(403);
    expect((estado.base as ReturnType<typeof crearBaseFalsa>).tablas.lineas_producto[0].decision).toBeNull();
  });
});

describe("leer todas las líneas · con dobles · la base corta en 1.000 y no se pierde ninguna", () => {
  it("2.300 líneas se leen en tres tramos, completas y sin repetir", async () => {
    const muchas = Array.from({ length: 2300 }, (_, i) => ({ id: `l-${i}`, company_id: EMP_A, codigo: `C-${String(i).padStart(4, "0")}`, nombre: `Artículo ${i}`, tipo: "producto", precio: 10 }));
    const base = crearBaseFalsa({ lineas_producto: muchas });
    estado.base = base;
    const { listarLineas } = await import("@/lib/producto");
    const leidas = await listarLineas(EMP_A);
    expect(leidas).toHaveLength(2300);
    expect(new Set(leidas.map((l) => l.id)).size).toBe(2300);
    expect(base.pedidos.filter((p) => p.tabla === "lineas_producto" && p.op === "select")).toHaveLength(3);
  });
});

describe("GET /producto · con dobles · la consultora ve la decisión; al dueño ni se le pide a la base", () => {
  const L1 = "11111111-1111-4111-8111-111111111111";
  const baseDecidida = () =>
    crearBaseFalsa({
      lineas_producto: [{ id: L1, company_id: EMP_A, codigo: "ML-064", nombre: "Blusa modelo 64", tipo: "producto", precio: 89, costo_variable_unitario: 38, unidades_periodo: 30, periodo: "2026-09", origen: "conciliado", decision: "retirar", decision_motivo: "MOTIVO-INTERNO" }],
      companies: [{ id: EMP_A, pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" }],
    });

  it("la consultora recibe las líneas con su evaluación y la decisión", async () => {
    estado.base = baseDecidida();
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const r = await leer();
    expect(r.status).toBe(200);
    expect((r.body.lineas as Fila[])[0]).toMatchObject({ decision: "retirar", decision_motivo: "MOTIVO-INTERNO" });
    expect((r.body.evaluacion as { lineas: Fila[] }).lineas[0]).toMatchObject({ contribucion: 1530, decision: "retirar" });
    expect((await leer("?periodo=setiembre")).status).toBe(400);
  });

  it("el dueño recibe su resumen y nada más; la consulta a la base no incluyó la decisión ni su motivo", async () => {
    const base = baseDecidida();
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(DUENA);
    const r = await leer();
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(["resumen"]);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain("MOTIVO-INTERNO");
    expect(texto).not.toMatch(/retirar|decisi[oó]n/i);
    expect(texto).toContain("Te deja S/ 51 por unidad. En septiembre de 2026 dejó S/ 1,530.");
    const consulta = base.pedidos.find((p) => p.tabla === "lineas_producto" && p.op === "select")!;
    expect(consulta.columnas).toContain("precio");
    expect(consulta.columnas).not.toMatch(/decision/);
  });
});

// ─────────────────────── Las dos pantallas, renderizadas en Node con dobles ───────────────────────

describe("las pantallas · renderizadas a HTML en Node con una base falsa (no abiertas en un navegador)", () => {
  const conLucero = async () => {
    const base = crearBaseFalsa({ companies: [{ id: EMP_A, pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" }] });
    estado.base = base;
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    await importar(EXCEL_LUCERO, { modo: "confirmar", hoja: "Inventario" });
    return base;
  };

  it("consultora · /empresa/[id]/producto: tabla con evaluación y decisión; lo que falta dice «sin dato», no cero", async () => {
    const base = await conLucero();
    Object.assign(base.tablas.lineas_producto.find((f) => f.codigo === "ML-064")!, { decision: "ampliar", decision_motivo: "Es la que más preguntan" });
    const { default: Producto } = await import("@/app/(consultor)/empresa/[id]/producto/page");
    const html = renderToStaticMarkup(await Producto({ params: Promise.resolve({ id: EMP_A }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Lo que vende la empresa");
    expect(html).toContain("Blusa modelo 64");
    expect(html).toContain("Líneas, sin periodo declarado");
    expect(html).toContain("0 de 120");
    expect((html.match(/sin datos para decidir/g) ?? []).length).toBe(120);
    expect(html).toContain("ninguna de las 120 líneas tiene precio, costo y unidades a la vez (0 sin precio, 40 sin costo, 120 sin unidades)");
    expect(html).toContain("extraído, pendiente de conciliar");
    // 40 costos y 120 «vendido» sin dato, más el total: ninguno pintado como S/ 0.
    expect((html.match(/sin dato</g) ?? []).length).toBeGreaterThanOrEqual(160);
    expect(html).not.toMatch(/S\/ 0</);
    // La decisión que fijó la consultora se ve con su motivo; las otras 119 dicen «Sin decidir».
    expect(html).toContain("Ampliar: vender más de esto");
    expect(html).toContain("Es la que más preguntan");
    expect((html.match(/Sin decidir/g) ?? []).length).toBe(119);
    expect(html).toContain("Importar desde un Excel");
    expect(html).toContain("No descuenta alquiler, planilla ni otros gastos fijos: no es la utilidad.");
  });

  it("consultora · con servicios aparece la capacidad, y con ?personas=&horas= el uso de las horas", async () => {
    estado.base = crearBaseFalsa({
      lineas_producto: [{ id: "s1", company_id: EMP_B, nombre: "Laboral", tipo: "servicio", precio: 1800, unidades_periodo: 62, horas_por_unidad: 25, periodo: "2026-S1", origen: "declarado" }],
      companies: [{ id: EMP_B, pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" }],
    });
    const { default: Producto } = await import("@/app/(consultor)/empresa/[id]/producto/page");
    const sin = renderToStaticMarkup(await Producto({ params: Promise.resolve({ id: EMP_B }), searchParams: Promise.resolve({}) }));
    expect(sin).toContain("Personas que atienden los servicios");
    expect(sin).toContain("Líneas del primer semestre de 2026");
    expect(sin).toContain("Horas que piden los servicios: 1,550 h");
    expect(sin).toContain("Sin capacidad declarada (personas × horas al mes) no se calcula la utilización.");
    const con = renderToStaticMarkup(await Producto({ params: Promise.resolve({ id: EMP_B }), searchParams: Promise.resolve({ personas: "2", horas: "160" }) }));
    expect(con).toContain("disponibles: 1,920 h");
    expect(con).toContain("uso de la capacidad: 81 %");
  });

  it("consultora · sin la tabla en la base lo dice con el nombre de la migración, no con una lista vacía", async () => {
    estado.base = crearBaseFalsa({}, { lineas_producto: { code: "PGRST205", message: "Could not find the table 'public.lineas_producto' in the schema cache" } });
    const { default: Producto } = await import("@/app/(consultor)/empresa/[id]/producto/page");
    const html = renderToStaticMarkup(await Producto({ params: Promise.resolve({ id: EMP_A }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("falta aplicar supabase/migracion-entrada-y-direccion.sql");
    expect(html).toContain("no es que la empresa no venda nada");
    // Cualquier otro fallo de la base no se disfraza de «falta la tabla»: sube tal cual.
    estado.base = crearBaseFalsa({}, { lineas_producto: { code: "57014", message: "canceling statement due to statement timeout" } });
    await expect(Producto({ params: Promise.resolve({ id: EMP_A }), searchParams: Promise.resolve({}) })).rejects.toThrow(/statement timeout/);
  });

  it("dueño · /portal/producto «Lo que vendes»: sus líneas y lo que dejan, sin decisiones ni palabras del método", async () => {
    const base = await conLucero();
    Object.assign(base.tablas.lineas_producto.find((f) => f.codigo === "ML-064")!, { decision: "retirar", decision_motivo: "MOTIVO-INTERNO", promesa: "Te queda bien a la primera" });
    base.pedidos.length = 0;
    estado.portal = { companyId: EMP_A, queFalta: "" };
    const { default: LoQueVendes } = await import("@/app/(cliente)/portal/producto/page");
    const html = renderToStaticMarkup(await LoQueVendes());
    expect(html).toContain("Lo que vendes");
    expect(html).toContain("Blusa modelo 64");
    expect(html).toContain("Lo que le prometes al cliente: Te queda bien a la primera");
    expect(html).toContain("Te deja S/ 51 por unidad.");
    expect(html).toContain("Lo que más te deja por cada venta");
    expect(html).toContain("los 40 que todavía no tienen sus números");
    expect(html).toContain("De ninguno de tus 120 productos o servicios sabemos todavía cuánto deja en total");
    expect(html).toContain("todavía no descuenta el alquiler, los sueldos ni los demás gastos del mes");
    // Nada de la consultora: ni la decisión, ni su motivo, ni la evaluación, ni el origen del dato.
    expect(html).not.toContain("MOTIVO-INTERNO");
    expect(html).not.toMatch(/Retirar|retirar|decisi[oó]n|Sin decidir|sin datos para decidir/);
    expect(html).not.toMatch(/contribuci[oó]n|SKU|costo variable|pilar|claim|matriz|extra[ií]do|conciliar|\bIA\b/i);
    expect(html).not.toMatch(/S\/ 0\b/);
    // Y no es que se esconda al pintar: a la base ni se le pidió.
    const consulta = base.pedidos.find((p) => p.tabla === "lineas_producto" && p.op === "select")!;
    expect(consulta.columnas).not.toMatch(/decision/);
  });

  it("dueño · sin líneas, sin empresa o sin la tabla: una frase clara en cada caso", async () => {
    const { default: LoQueVendes } = await import("@/app/(cliente)/portal/producto/page");
    estado.base = crearBaseFalsa({ lineas_producto: [] });
    estado.portal = { companyId: EMP_A, queFalta: "" };
    expect(renderToStaticMarkup(await LoQueVendes())).toContain("Todavía no hemos anotado lo que vendes.");
    estado.portal = { companyId: null, queFalta: "Cuéntanos de tu empresa para empezar." };
    expect(renderToStaticMarkup(await LoQueVendes())).toContain("Cuéntanos de tu empresa para empezar.");
    estado.base = crearBaseFalsa({}, { lineas_producto: { code: "42P01", message: 'relation "lineas_producto" does not exist' } });
    estado.portal = { companyId: EMP_A, queFalta: "" };
    const html = renderToStaticMarkup(await LoQueVendes());
    expect(html).toContain("Todavía no podemos mostrarte esta parte");
    expect(html).not.toMatch(/migraci[oó]n|tabla|supabase/i);
  });

  it("el formulario y el paso de decisión se renderizan con sus etiquetas, y la decisión no viene marcada", async () => {
    const { FormularioLinea } = await import("@/components/producto/FormularioLinea");
    const { DecisionLinea } = await import("@/components/producto/DecisionLinea");
    const servicio = linea("s", { nombre: "Laboral", tipo: "servicio", precio: 1800 });
    const formulario = renderToStaticMarkup(createElement(FormularioLinea, { companyId: EMP_B, linea: servicio }));
    expect(formulario).toContain("Horas que se lleva cada caso");
    expect(formulario).toContain("un campo vacío se guarda como «sin dato», nunca como cero");
    expect(formulario).toMatch(/aria-label="Costo variable por caso" value=""/); // el costo que no se sabe llega vacío, no «0»
    expect(renderToStaticMarkup(createElement(FormularioLinea, { companyId: EMP_A }))).not.toContain("Horas que se lleva cada caso");

    const decision = renderToStaticMarkup(
      createElement(DecisionLinea, { companyId: EMP_B, linea: servicio, opciones: DECISIONES.map((clave) => ({ clave, texto: DECISION_TEXTO[clave] })), sugerencia: sugerir(servicio), alCerrar: () => {} })
    );
    expect(decision).toContain("La cuenta dice: sin datos para decidir (falta costo variable por caso, casos atendidos en el periodo). Decidir es tuyo.");
    expect(decision).toMatch(/<option value="" selected="">Sin decidir<\/option>/);
    for (const d of DECISIONES) expect(decision).toContain(DECISION_TEXTO[d]);
  });
});

// ─────────────────────── Postgres embebido: lo que la importación escribe entra en el esquema real ───────────────────────

describe("POSTGRES EMBEBIDO (PGlite, no Supabase) · las filas que escribe la importación, sobre el SQL del repositorio", () => {
  let pg: PGlite | undefined;
  let fallo: unknown;
  let escritas: Fila[] = [];

  const db = (): PGlite => {
    if (fallo) throw fallo;
    if (!pg) throw new Error("no hay base: beforeAll no la creó");
    return pg;
  };
  const codigoDe = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await db().query(sql, params);
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
    return null;
  };
  /** Lo mismo, pero como lo pediría una persona con su sesión: el código de Postgres o null si pasó. */
  const codigoComo = async (rol: Rol, sub: string | null, sql: string, params: unknown[] = []): Promise<string | null> => {
    try {
      await consultarComo(db(), rol, sub, sql, params);
    } catch (e) {
      return (e as { code?: string }).code ?? String(e);
    }
    return null;
  };
  const rutaMigracion = path.join(CARPETA_SUPABASE, NOMBRE_MIGRACION);
  /** El texto que se aplica: el archivo del repositorio cuando exista; mientras tanto, el pedido. */
  const sqlMigracion = () => (existsSync(rutaMigracion) ? readFileSync(rutaMigracion, "utf8") : MIGRACION_PENDIENTE);
  const DUENO_B = "00000000-0000-4000-8000-0000000000b1";

  beforeAll(async () => {
    try {
      // Lo que la ruta manda a insertar, capturado del doble: son esas filas, no unas escritas para la ocasión.
      const base = crearBaseFalsa();
      estado.base = base;
      vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
      await importar(EXCEL_LUCERO, { modo: "confirmar", hoja: "Inventario" });
      escritas = base.pedidos.filter((p) => p.tabla === "lineas_producto" && p.op === "insert").flatMap((p) => p.filas ?? []);

      // El esquema del repositorio SIN la migración pedida, exista ya el archivo o no: así el «antes» se puede
      // reproducir siempre, también el día que la migración esté registrada en orden-aplicacion.json.
      pg = await crearBase();
      // Tampoco la del 16-10 (migracion-entrar-hoy.sql), que rehace la misma vista con más columnas: se aplica al final, encima.
      // Ni lo que se apoya en ella (migracion-estrategia.sql amplía un check de su tabla solicitudes_cliente): sin la del
      // 16-10 no aplica, y esta prueba no la necesita.
      await aplicarTodo(pg, {
        orden: ordenSin([NOMBRE_MIGRACION, MIGRACION_16_10]),
      });
      await pg.query(
        "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'duena-a@prueba.local', $2::jsonb), ($3, 'dueno-b@prueba.local', $4::jsonb), ($5, 'consultora@prueba.local', $6::jsonb)",
        [DUENA.id, JSON.stringify({ nombre: "Dueña A" }), "00000000-0000-4000-8000-0000000000b1", JSON.stringify({ nombre: "Dueño B" }), CONSULTORA.id, JSON.stringify({ nombre: "Consultora" })]
      );
      await pg.query("update users set rol = 'consultor' where id = $1", [CONSULTORA.id]);
      await pg.query("insert into companies (id, nombre) values ($1, 'Modas Lucero (ficticia)'), ($2, 'Estudio Vargas (ficticio)')", [EMP_A, EMP_B]);
      await pg.query("insert into memberships (user_id, company_id) values ($1, $2), ($3, $4)", [DUENA.id, EMP_A, "00000000-0000-4000-8000-0000000000b1", EMP_B]);
      const columnas = ["company_id", "codigo", "nombre", "tipo", "precio", "costo_variable_unitario", "unidades_periodo", "horas_por_unidad", "periodo", "origen", "source_id"];
      for (const f of escritas) {
        await pg.query(`insert into lineas_producto (${columnas.join(",")}) values (${columnas.map((_, i) => `$${i + 1}`).join(",")})`, columnas.map((c) => f[c] ?? null));
      }
    } catch (e) {
      fallo = e;
      await pg?.close().catch(() => {});
      pg = undefined;
    }
  }, 240_000);

  afterAll(async () => {
    await pg?.close();
  });

  it("las 120 filas entran tal cual: 40 con el costo NULL y ninguna con un cero puesto por nosotros", async () => {
    expect(escritas).toHaveLength(120);
    const { rows } = await db().query<{ total: number; sin_costo: number; costo_cero: number; sin_unidades: number; extraidas: number; decididas: number }>(
      `select count(*)::int as total,
              count(*) filter (where costo_variable_unitario is null)::int as sin_costo,
              count(*) filter (where costo_variable_unitario = 0)::int as costo_cero,
              count(*) filter (where unidades_periodo is null)::int as sin_unidades,
              count(*) filter (where origen = 'extraido')::int as extraidas,
              count(*) filter (where decision is not null)::int as decididas
         from lineas_producto where company_id = $1`,
      [EMP_A]
    );
    expect(rows[0]).toEqual({ total: 120, sin_costo: 40, costo_cero: 0, sin_unidades: 120, extraidas: 120, decididas: 0 });
  });

  it("lo que se lee de vuelta se evalúa igual que antes de guardarlo: el viaje a la base no cambia la cuenta", async () => {
    const { rows } = await db().query<Fila>("select * from lineas_producto where company_id = $1 order by codigo", [EMP_A]);
    const deVuelta = rows.map(desdeFila);
    expect(deVuelta.find((l) => l.codigo === "ML-064")).toMatchObject({ precio: 89, costo_variable_unitario: 38, unidades_periodo: null });
    const ev = evaluar(deVuelta);
    expect(ev.totales).toMatchObject({ completas: 0, de: 120, ingreso: null, contribucion: null });
    expect(ev.lineas.filter((e) => e.contribucion_unitaria === null)).toHaveLength(40);
  });

  it("los checks y la clave única de la migración existen: código repetido, decisión, tipo y origen inventados no entran", async () => {
    expect(await codigoDe("insert into lineas_producto (company_id, codigo, nombre, tipo) values ($1, 'ML-064', 'Otra blusa', 'producto')", [EMP_A])).toBe("23505");
    expect(await codigoDe("update lineas_producto set decision = 'liquidar' where company_id = $1 and codigo = 'ML-064'", [EMP_A])).toBe("23514");
    expect(await codigoDe("insert into lineas_producto (company_id, nombre, tipo) values ($1, 'Combo', 'combo')", [EMP_A])).toBe("23514");
    expect(await codigoDe("insert into lineas_producto (company_id, nombre, tipo, origen) values ($1, 'Polo', 'producto', 'inventado')", [EMP_A])).toBe("23514");
    // El mismo código en OTRA empresa sí entra: la clave es por empresa. Y las cinco decisiones del módulo son las del check.
    expect(await codigoDe("insert into lineas_producto (company_id, codigo, nombre, tipo) values ($1, 'ML-064', 'Laboral', 'servicio')", [EMP_B])).toBeNull();
    for (const d of DECISIONES) expect(await codigoDe("update lineas_producto set decision = $2, decision_motivo = 'prueba' where company_id = $1 and codigo = 'ML-001'", [EMP_A, d]), d).toBeNull();
  });

  it("SIN la migración pedida · la política del dueño: lee las líneas de su empresa, no las de otra, y no puede escribir", async () => {
    const propias = await consultarComo<{ n: number }>(db(), "authenticated", DUENA.id, "select count(*)::int as n from lineas_producto");
    expect(propias[0].n).toBe(120);
    const ajenas = await consultarComo<{ n: number }>(db(), "authenticated", DUENA.id, "select count(*)::int as n from lineas_producto where company_id = $1", [EMP_B]);
    expect(ajenas[0].n).toBe(0);
    await expect(consultarComo(db(), "authenticated", DUENA.id, "insert into lineas_producto (company_id, nombre, tipo) values ($1, 'Mía', 'producto')", [EMP_A])).rejects.toThrow(/row-level security/);
    const tocadas = await consultarComo<{ id: string }>(db(), "authenticated", DUENA.id, "update lineas_producto set decision = 'retirar' where company_id = $1 returning id", [EMP_A]);
    expect(tocadas).toEqual([]);
    const consultora = await consultarComo<{ n: number }>(db(), "authenticated", CONSULTORA.id, "select count(*)::int as n from lineas_producto");
    expect(consultora[0].n).toBe(121);
  });

  it("SIN la migración pedida · EL HUECO, declarado: con su propia sesión y por fuera de la aplicación, el dueño lee la decisión y su motivo", async () => {
    // La prueba anterior dejó ML-001 con la última decisión del catálogo y el motivo «prueba». La aplicación no se
    // los manda al dueño (COLUMNAS_PARA_DUENO), pero la política lineas_producto_cliente deja pasar la fila entera.
    const leido = await consultarComo<{ decision: string | null; decision_motivo: string | null }>(db(), "authenticated", DUENA.id, "select decision, decision_motivo from lineas_producto where codigo = 'ML-001'");
    expect(leido).toEqual([{ decision: DECISIONES[DECISIONES.length - 1], decision_motivo: "prueba" }]);
  });

  it("CON la migración pedida · aplica dos veces seguidas y el dueño ya no lee la tabla: lee una vista sin decisión ni motivo, y solo para leer", async () => {
    const antesConsultora = (await consultarComo<{ n: number }>(db(), "authenticated", CONSULTORA.id, "select count(*)::int as n from lineas_producto"))[0].n;
    for (let vez = 0; vez < 2; vez++) for (const s of dividirSentencias(sqlMigracion())) await db().exec(s);
    // La migración del 13-10 recrea la vista con las columnas de entonces; la del 16-10 la rehace con las nuevas (dos veces: es idempotente).
    for (let vez = 0; vez < 2; vez++) for (const s of dividirSentencias(readFileSync(path.join(CARPETA_SUPABASE, MIGRACION_16_10), "utf8"))) await db().exec(s);

    // La tabla ya no le devuelve nada al dueño: ni filas, ni por tanto decisiones.
    expect(await consultarComo(db(), "authenticated", DUENA.id, "select decision, decision_motivo from lineas_producto")).toEqual([]);
    // La vista le da lo suyo y nada de otra empresa.
    const propias = await consultarComo<{ n: number }>(db(), "authenticated", DUENA.id, "select count(*)::int as n from lineas_producto_cliente");
    expect(propias[0].n).toBe(120);
    const ajenas = await consultarComo<{ n: number }>(db(), "authenticated", DUENA.id, "select count(*)::int as n from lineas_producto_cliente where company_id = $1", [EMP_B]);
    expect(ajenas[0].n).toBe(0);
    expect((await consultarComo<{ n: number }>(db(), "authenticated", DUENO_B, "select count(*)::int as n from lineas_producto_cliente"))[0].n).toBe(1);
    // Las columnas de la vista son exactamente las que la aplicación le pide a la base para el dueño.
    const { rows: cols } = await db().query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'lineas_producto_cliente'");
    expect(cols.map((c) => c.column_name).sort()).toEqual(COLUMNAS_PARA_DUENO.split(",").sort());
    expect(COLUMNAS_PARA_DUENO.split(",")).not.toContain("decision");
    // Pedir la decisión a la vista es pedir una columna que no existe (42703), no una fila vacía.
    expect(await codigoComo("authenticated", DUENA.id, "select decision from lineas_producto_cliente")).toBe("42703");
    expect(await codigoComo("authenticated", DUENA.id, "select decision_motivo from lineas_producto_cliente")).toBe("42703");
    // Una vista de una sola tabla es actualizable: sin el revoke, el dueño escribiría en la tabla saltando RLS.
    expect(await codigoComo("authenticated", DUENA.id, "update lineas_producto_cliente set precio = 0")).toBe("42501");
    expect(await codigoComo("authenticated", DUENA.id, "insert into lineas_producto_cliente (company_id, nombre, tipo) values ($1, 'Mía', 'producto')", [EMP_A])).toBe("42501");
    expect(await codigoComo("authenticated", DUENA.id, "delete from lineas_producto_cliente")).toBe("42501");
    expect(await codigoComo("anon", null, "select * from lineas_producto_cliente")).toBe("42501");
    // Para la consultora no cambió nada: lee la tabla entera, con sus decisiones.
    const consultora = await consultarComo<{ n: number }>(db(), "authenticated", CONSULTORA.id, "select count(*)::int as n from lineas_producto");
    expect(consultora[0].n).toBe(antesConsultora);
    expect(await consultarComo(db(), "authenticated", CONSULTORA.id, "select decision, decision_motivo from lineas_producto where codigo = 'ML-001' and company_id = $1", [EMP_A])).toEqual([{ decision: DECISIONES[DECISIONES.length - 1], decision_motivo: "prueba" }]);
    // Y ningún precio cambió con los intentos de escritura del dueño.
    expect((await db().query<{ n: number }>("select count(*)::int as n from lineas_producto where company_id = $1 and precio = 0", [EMP_A])).rows[0].n).toBe(0);
  });
});
