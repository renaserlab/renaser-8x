/**
 * INICIATIVAS DE NIVEL 2: LAS REGLAS, SIN BASE (R15.1).
 *
 * Lo que Dirección pidió y aquí se comprueba caso por caso sobre src/lib/iniciativas.ts:
 *  · una iniciativa no se aprueba sin hipótesis, medida de éxito, evidencia o fuente aportada, recursos,
 *    plazo, los tres criterios y responsable (`completitud`);
 *  · la tabla de estados es cerrada: se recorren las 49 parejas y solo pasan las ocho permitidas;
 *  · sin dato del indicador NO hay veredicto, y cero sí es un dato (`evaluarCriterios`);
 *  · que a la empresa le falten documentos operativos ajenos no frena una iniciativa (`pertinencia`);
 *  · mercado y competencia sin fuente aportada exige dejar escrito qué quedó pendiente de investigar;
 *  · un criterio solo se compara con un dato de su misma unidad: «al menos 70 %» frente a «7 de cada 10»
 *    no da veredicto (antes daba «se cumple el criterio de detener»);
 *  · un hallazgo sin revisar o provisional no vale como único sustento para aprobar (R10.4);
 *  · dos escrituras a la vez no se pisan: la iniciativa solo se escribe sobre la versión que se leyó.
 *
 * Después, LA CAPA QUE TOCA LA BASE (api/companies/[id]/iniciativas/_datos.ts) con un doble de
 * `supabaseAdmin()` en memoria: aprobar exige la autoridad «aprobar_plan» antes de escribir, un cambio
 * sin historial se revierte, y lo que se le entrega al dueño sale filtrado de la consulta.
 *
 * Y al final LAS RUTAS DE VERDAD, con el `protegido()` real y dobles de sesión y de base.
 *
 * Y LAS PANTALLAS, PINTADAS A TEXTO con datos de ejemplo (react-dom/server, sin navegador): que el tablero
 * muestre los quince temas, que la ficha diga qué falta y apague el botón de aprobar, que sin dato se lea
 * «Sin dato para evaluar» y que la pantalla del dueño no lleve nada interno.
 *
 * NOTA DE ALCANCE: aquí no hay base real ni navegador. El esquema, los checks y la RLS se prueban en
 * tests/sql/iniciativas.test.ts (Postgres embebido, no Supabase). Pintar a texto demuestra que cada
 * componente arma su contenido sin romperse; NO demuestra clics, guardados ni cómo se ve en un celular.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Fila = Record<string, unknown>;
type Operacion = "select" | "update" | "insert";
const base = vi.hoisted(() => ({
  tablas: {} as Record<string, Record<string, unknown>[]>,
  escrituras: [] as { tabla: string; op: "select" | "update" | "insert"; datos: Record<string, unknown> }[],
  fallar: {} as Record<string, { op: "select" | "update" | "insert"; mensaje: string; code?: string; saltar?: number } | undefined>,
  sinTabla: new Set<string>(),
  consultas: [] as { tabla: string; filtros: string[] }[],
  seq: 0,
}));

vi.mock("@/lib/supabase/admin", () => {
  // Un doble de PostgREST en memoria: filtra con los .eq/.neq/.in recibidos, aplica update sobre las filas
  // filtradas, inserta con id y created_at crecientes y registra cada escritura, para que la prueba pueda
  // afirmar «no se escribió nada». `base.fallar[tabla]` hace fallar una operación; `base.sinTabla` imita una
  // base donde la migración no se aplicó. `base.consultas` guarda los filtros con que se pidió cada tabla.
  type Resultado = { data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null };
  const consulta = (tabla: string) => {
    const filtros: ((f: Record<string, unknown>) => boolean)[] = [];
    const nombres: string[] = [];
    let modo: "select" | "update" | "insert" = "select";
    let cuerpo: Record<string, unknown> = {};
    let insertada: Record<string, unknown> | null = null;
    const filas = () => (base.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
    const ejecutar = (): Resultado => {
      if (base.sinTabla.has(tabla)) return { data: null, error: { code: "PGRST205", message: `Could not find the table 'public.${tabla}' in the schema cache` } };
      const fallo = base.fallar[tabla];
      if (fallo && fallo.op === modo) {
        // `saltar` (solo para update) deja pasar las primeras: así falla la reversión y no el cambio.
        if ((fallo.saltar ?? 0) > 0) fallo.saltar = (fallo.saltar ?? 0) - 1;
        else return { data: null, error: { message: fallo.mensaje, code: fallo.code } };
      }
      if (modo === "update") {
        const objetivo = filas();
        for (const f of objetivo) Object.assign(f, cuerpo);
        base.escrituras.push({ tabla, op: "update", datos: { ...cuerpo, _ids: objetivo.map((f) => f.id) } });
        return { data: objetivo, error: null };
      }
      if (modo === "insert") return { data: insertada ? [insertada] : [], error: null };
      base.consultas.push({ tabla, filtros: [...nombres] });
      return { data: filas(), error: null };
    };
    const q = {
      select: () => q,
      order: () => q,
      limit: () => q,
      eq: (k: string, v: unknown) => { nombres.push(`eq:${k}`); filtros.push((f) => f[k] === v); return q; },
      neq: (k: string, v: unknown) => { nombres.push(`neq:${k}`); filtros.push((f) => f[k] !== v); return q; },
      in: (k: string, vs: unknown[]) => { nombres.push(`in:${k}:${vs.join("|")}`); filtros.push((f) => vs.includes(f[k])); return q; },
      // Solo la forma que usa el código: «col.is.null,col.eq.valor» (basta que una se cumpla).
      or: (expr: string) => {
        nombres.push(`or:${expr}`);
        const partes = expr.split(",").map((p) => p.split(".") as [string, string, string]);
        filtros.push((f) => partes.some(([k, op, v]) => (op === "is" ? (f[k] ?? null) === null : String(f[k]) === v)));
        return q;
      },
      update: (datos: Record<string, unknown>) => { modo = "update"; cuerpo = datos; return q; },
      insert: (datos: Record<string, unknown>) => {
        modo = "insert";
        const fallo = base.fallar[tabla];
        if (!base.sinTabla.has(tabla) && !(fallo && fallo.op === "insert")) {
          base.seq += 1;
          insertada = { id: `00000000-0000-4000-8000-${String(base.seq).padStart(12, "0")}`, created_at: new Date(Date.UTC(2026, 9, 13, 12, 0, base.seq)).toISOString(), ...datos };
          (base.tablas[tabla] ??= []).push(insertada);
          base.escrituras.push({ tabla, op: "insert", datos: insertada });
        }
        return q;
      },
      maybeSingle: async () => { const r = ejecutar(); return { data: r.error ? null : (r.data?.[0] ?? null), error: r.error }; },
      single: async () => { const r = ejecutar(); const d = r.data?.[0] ?? null; return { data: d, error: r.error ?? (d ? null : { message: "no hay fila" }) }; },
      then: (res: (v: Resultado) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  return { supabaseAdmin: () => ({ from: consulta }) };
});
// Para llamar a las rutas con el `protegido()` real: la sesión es la que la prueba diga, el rastro de
// auditoría se espía (no se escribe en la base doble) y el cupo de peticiones siempre deja pasar.
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
// Para pintar a texto los componentes del navegador: el enrutador no existe fuera de la aplicación.
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));

import {
  DOMINIOS, CLAVES_DOMINIO, ESTADOS, DECISIONES, TRANSICIONES, ESTADOS_VISIBLES_CLIENTE, CLAVES_INTERNAS, SIN_DATO_PARA_EVALUAR, TEXTO_PENDIENTE_MERCADO, TEXTO_EN_PALABRAS,
  ERROR_SIN_EVIDENCIA, ERROR_SIN_MOTIVO, ERROR_SOLO_CONSULTORA, SIN_MIGRACION_INICIATIVAS,
  iniciativaVacia, desdeFila, dominioDe, diaCorto, plazoEnPalabras, momentoCorto, completitud, avanceDeFicha, pertinencia, registrarFuenteAportada, leerCriterio, comoSeLee, evaluarCriterios, valorParaEvaluar,
  evaluarConIndicador, transicion, autoridadNecesaria, nueva, editar, agregarFuente, filaCliente, visibleParaCliente, tocaDecidir, porDominio, verboDe, exigePendienteDeInvestigacion, conContexto,
  mismaUnidad, unidadDeIndicador, unidadDeLoEscrito, criterioParaElDueno, type UnidadEscrita,
  type Actor, type Estado, type Iniciativa, type IndicadorDeIniciativa, type NuevaFuente, type Tablero, type FilaHistorialLeida,
} from "@/lib/iniciativas";
import { AccesoDenegado, perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { ESTADOS_VALIDACION_VALOR, VALIDACION_TEXTO } from "@/lib/kpis";
import { aplicarTransicion, cargarTablero, crearIniciativa, iniciativasDelCliente, modificarIniciativa, faltaEnLaBase, SinTablasDeIniciativas } from "@/app/api/companies/[id]/iniciativas/_datos";
import { TableroIniciativas } from "@/components/iniciativas/TableroIniciativas";
import { DetalleIniciativa } from "@/components/iniciativas/DetalleIniciativa";
import { HistorialIniciativa } from "@/components/iniciativas/HistorialIniciativa";
import { LoQueEstamosProbando } from "@/components/iniciativas/LoQueEstamosProbando";
import { GET as leerRuta, POST as crearRuta } from "@/app/api/companies/[id]/iniciativas/route";
import { PATCH as editarRuta } from "@/app/api/companies/[id]/iniciativas/[iid]/route";
import { POST as transitarRuta } from "@/app/api/companies/[id]/iniciativas/[iid]/transicion/route";

const EMP = "0000000a-0000-4000-8000-00000000000a";
const OTRA = "0000000b-0000-4000-8000-00000000000b";
const INI = "000000a1-0000-4000-8000-0000000000a1";
const EV1 = "000000e1-0000-4000-8000-0000000000e1";
const EV2 = "000000e2-0000-4000-8000-0000000000e2";
const IND = "000000d1-0000-4000-8000-0000000000d1";
const PER = "000000c1-0000-4000-8000-0000000000c1";
const U_CONSULTORA = "22222222-2222-4222-8222-222222222222";
const U_DUENO = "11111111-1111-4111-8111-111111111111";
const CONSULTORA: Actor = { id: U_CONSULTORA, rol: "consultor" };
const DUENO: Actor = { id: U_DUENO, rol: "cliente" };
const AHORA = new Date("2026-10-13T15:00:00Z");

/** Una iniciativa completa: pasa `completitud` y se puede aprobar. */
function completa(extra: Partial<Iniciativa> = {}): Iniciativa {
  return iniciativaVacia({
    id: INI, company_id: EMP, dominio: "retencion", titulo: "Llamar a quien no volvió",
    hipotesis: "Si llamamos a los clientes que no vuelven en 60 días, 3 de cada 10 vuelven a comprar",
    evidencia_ids: [EV1], recursos: "Una persona, dos horas por semana", plazo_inicio: "2026-09-01", plazo_fin: "2026-11-30",
    medida_exito: "Clientes que vuelven a comprar, de cada 10 llamados", indicador_id: IND,
    criterio_continuar: "al menos 3 de cada 10", criterio_ajustar: "entre 1 y 2 de cada 10", criterio_detener: "menos de 1 de cada 10",
    responsable_participant_id: PER,
    ...extra,
  });
}

const FUENTE: NuevaFuente = { nombre: "Lista de precios de tres tiendas de la cuadra", quien: "Rosa, encargada de tienda", fecha: "2026-09-20", que_dice: "Las tres venden el polo básico entre S/ 25 y S/ 32" };
const OBSERVADO = { que_se_observo: "De 40 llamadas, 14 clientes volvieron a comprar en el mes" };
const MOTIVO = "El resultado supera lo esperado";

const indicador = (extra: Partial<IndicadorDeIniciativa> = {}): IndicadorDeIniciativa => ({
  id: IND, nombre: "Clientes que vuelven", unidad: "de_cada_10", moneda: null, valor_actual: 3.5, valor_actual_periodo: "2026-09", estado_validacion: "declarado", ...extra,
});

// ───────────────────────── 1 · LOS QUINCE DOMINIOS ─────────────────────────

describe("los quince dominios", () => {
  const sql = readFileSync(path.resolve(__dirname, "../supabase/migracion-excelencia-y-cartera.sql"), "utf8");
  const deCheck = (columna: string) => {
    const m = sql.match(new RegExp(`${columna} text not null[^\\n]*check \\(${columna} in \\(([\\s\\S]*?)\\)\\)`));
    return [...(m?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  };

  it("son exactamente los quince del check de la migración, en el mismo orden", () => {
    expect(deCheck("dominio")).toHaveLength(15);
    expect(DOMINIOS.map((d) => d.clave)).toEqual(deCheck("dominio"));
    expect(CLAVES_DOMINIO).toEqual(deCheck("dominio"));
  });

  it("los estados son los siete del check de la migración", () => {
    expect([...ESTADOS]).toEqual(deCheck("estado"));
  });

  it("cada uno tiene nombre para el empresario, nombre del método y la pregunta que responde", () => {
    for (const d of DOMINIOS) {
      expect(d.nombre.length, d.clave).toBeGreaterThan(5);
      expect(d.tecnico.length, d.clave).toBeGreaterThan(5);
      expect(d.pregunta, d.clave).toMatch(/¿.+\?$/);
      expect(d.nombre, `${d.clave}: el nombre para el empresario no lleva guiones bajos`).not.toMatch(/_/);
    }
    expect(new Set(DOMINIOS.map((d) => d.nombre)).size).toBe(15);
    expect(new Set(DOMINIOS.map((d) => d.pregunta)).size).toBe(15);
  });

  it("una clave que no es de las quince no tiene definición", () => {
    expect(dominioDe("retencion")?.tecnico).toBe("Retención");
    expect(dominioDe("ventas")).toBeNull();
    expect(dominioDe(null)).toBeNull();
  });

  it("el tablero lista los quince aunque estén vacíos", () => {
    const t = porDominio([completa(), completa({ id: "x2", dominio: "conversion" })]);
    expect(t).toHaveLength(15);
    expect(t.find((x) => x.dominio.clave === "retencion")!.iniciativas).toHaveLength(1);
    expect(t.filter((x) => x.iniciativas.length === 0)).toHaveLength(13);
  });
});

// ───────────────────────── 2 · COMPLETITUD ─────────────────────────

describe("completitud: qué le falta a una iniciativa para aprobarse", () => {
  it("una iniciativa vacía lista las nueve piezas, cada una con su porqué", () => {
    const f = completitud(iniciativaVacia());
    expect(f.map((x) => x.campo)).toEqual(["hipotesis", "medida_exito", "evidencia", "recursos", "plazo", "criterio_continuar", "criterio_ajustar", "criterio_detener", "responsable"]);
    for (const x of f) expect(x.por_que.length, x.campo).toBeGreaterThan(10);
    expect(avanceDeFicha(iniciativaVacia())).toEqual({ completas: 0, total: 9 });
  });

  it("una iniciativa completa no tiene faltantes", () => {
    expect(completitud(completa())).toEqual([]);
    expect(avanceDeFicha(completa())).toEqual({ completas: 9, total: 9 });
  });

  it.each([
    ["hipotesis", { hipotesis: "" }],
    ["hipotesis", { hipotesis: "sube" }],
    ["medida_exito", { medida_exito: "  " }],
    ["evidencia", { evidencia_ids: [] }],
    ["recursos", { recursos: null }],
    ["plazo", { plazo_fin: null }],
    ["plazo", { plazo_fin: "30/11/2026" }],
    ["plazo", { plazo_inicio: "2026-12-01", plazo_fin: "2026-11-30" }],
    ["criterio_continuar", { criterio_continuar: null }],
    ["criterio_ajustar", { criterio_ajustar: "" }],
    ["criterio_detener", { criterio_detener: "no" }],
    ["responsable", { responsable_participant_id: null }],
  ] as [string, Partial<Iniciativa>][])("sin %s no está completa (%o)", (campo, extra) => {
    expect(completitud(completa(extra)).map((x) => x.campo)).toEqual([campo]);
  });

  it("una fuente aportada vale como sustento aunque no haya evidencia de la empresa", () => {
    const r = registrarFuenteAportada(completa({ evidencia_ids: [] }), FUENTE, "2026-10-13");
    if (!r.ok) throw new Error(r.error);
    expect(completitud(r.iniciativa)).toEqual([]);
  });

  it("un criterio escrito como cifra cuenta aunque no tenga letras; una palabra suelta, no", () => {
    expect(completitud(completa({ criterio_continuar: "≥ 40", criterio_ajustar: "entre 30 y 39", criterio_detener: "< 30" }))).toEqual([]);
    expect(completitud(completa({ criterio_continuar: "40" })).map((x) => x.campo)).toEqual(["criterio_continuar"]);
    expect(completitud(completa({ criterio_detener: "poco" })).map((x) => x.campo)).toEqual(["criterio_detener"]);
  });

  it("solo hace falta la fecha de cierre: la de inicio se pone al empezar", () => {
    expect(completitud(completa({ plazo_inicio: null }))).toEqual([]);
  });
});

// ───────────────────────── 3 · MERCADO SIN FUENTE EXIGE DECIR QUÉ QUEDÓ PENDIENTE ─────────────────────────

describe("mercado y competencia sin fuente aportada exige pendiente_investigacion", () => {
  const mercado = (extra: Partial<Iniciativa> = {}) => completa({ dominio: "mercado_y_competencia", ...extra });

  it("sin fuente y sin pendiente: falta, y el motivo dice que no se inventa mercado ni competidores", () => {
    const f = completitud(mercado());
    expect(f.map((x) => x.campo)).toEqual(["pendiente_investigacion"]);
    expect(f[0]!.por_que).toBe(TEXTO_PENDIENTE_MERCADO);
    expect(TEXTO_PENDIENTE_MERCADO).toMatch(/No se inventa mercado ni competidores/);
    expect(avanceDeFicha(mercado())).toEqual({ completas: 9, total: 10 });
  });

  it("tener evidencia interna de la empresa no lo cubre: sigue haciendo falta decir qué no se investigó", () => {
    expect(exigePendienteDeInvestigacion(mercado({ evidencia_ids: [EV1, EV2] }))).toBe(true);
    expect(completitud(mercado({ evidencia_ids: [EV1, EV2] })).map((x) => x.campo)).toEqual(["pendiente_investigacion"]);
  });

  it("con el pendiente escrito, o con una fuente aportada, está completa", () => {
    expect(completitud(mercado({ pendiente_investigacion: "No se pudo averiguar cuántas tiendas del rubro hay en el distrito" }))).toEqual([]);
    const r = registrarFuenteAportada(mercado(), FUENTE, "2026-10-13");
    if (!r.ok) throw new Error(r.error);
    expect(completitud(r.iniciativa)).toEqual([]);
  });

  it("un pendiente de una palabra no cuenta", () => {
    expect(completitud(mercado({ pendiente_investigacion: "nada" })).map((x) => x.campo)).toEqual(["pendiente_investigacion"]);
  });

  it("los otros catorce dominios no lo exigen", () => {
    for (const d of DOMINIOS.filter((x) => x.clave !== "mercado_y_competencia")) expect(completitud(completa({ dominio: d.clave })), d.clave).toEqual([]);
  });

  it("no se puede aprobar, y tampoco proponer, una de mercado sin fuente ni pendiente", () => {
    const t = transicion(mercado(), "aprobada", CONSULTORA);
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.faltan?.map((x) => x.campo)).toEqual(["pendiente_investigacion"]);

    const datos = { dominio: "mercado_y_competencia", titulo: "Subir el precio del polo básico", hipotesis: "El polo básico aguanta S/ 3 más sin perder ventas", medida_exito: "Unidades vendidas por semana" };
    expect(nueva(EMP, datos, CONSULTORA, "2026-10-13")).toEqual({ ok: false, error: TEXTO_PENDIENTE_MERCADO });
    expect(nueva(EMP, { ...datos, pendiente_investigacion: "No se pudo ver el precio en las tiendas de la avenida" }, CONSULTORA, "2026-10-13").ok).toBe(true);
    const conFuente = nueva(EMP, { ...datos, fuente_aportada: FUENTE }, CONSULTORA, "2026-10-13");
    expect(conFuente.ok).toBe(true);
    if (conFuente.ok) expect(conFuente.fila.fuentes_aportadas).toEqual([{ nombre: FUENTE.nombre, quien_la_aporto: FUENTE.quien, fecha: FUENTE.fecha, que_dice: FUENTE.que_dice }]);
  });

  it("tampoco se puede borrar el pendiente, ni mover a mercado una iniciativa que no lo tiene", () => {
    const conPendiente = mercado({ pendiente_investigacion: "No se pudo averiguar cuántas tiendas del rubro hay" });
    expect(editar(conPendiente, { pendiente_investigacion: "" }, CONSULTORA)).toEqual({ ok: false, error: TEXTO_PENDIENTE_MERCADO });
    expect(editar(completa(), { dominio: "mercado_y_competencia" }, CONSULTORA)).toEqual({ ok: false, error: TEXTO_PENDIENTE_MERCADO });
  });
});

// ───────────────────────── 4 · FUENTES APORTADAS ─────────────────────────

describe("registrarFuenteAportada", () => {
  it("guarda nombre, quién, fecha y qué dice, sin tocar la iniciativa original", () => {
    const i = completa();
    const r = registrarFuenteAportada(i, FUENTE, "2026-10-13");
    if (!r.ok) throw new Error(r.error);
    expect(r.fuente).toEqual({ nombre: FUENTE.nombre, quien_la_aporto: FUENTE.quien, fecha: "2026-09-20", que_dice: FUENTE.que_dice });
    expect(r.iniciativa.fuentes_aportadas).toHaveLength(1);
    expect(i.fuentes_aportadas).toHaveLength(0);
  });

  it.each([
    ["sin nombre", { nombre: " " }, /Ponle nombre/],
    ["sin quién", { quien: "" }, /quién la aportó/],
    ["sin fecha", { fecha: "" }, /fecha de la fuente/],
    ["con fecha imposible", { fecha: "2026-02-31" }, /fecha de la fuente/],
    ["con fecha futura", { fecha: "2026-12-01" }, /no puede ser futura/],
    ["sin decir qué dice", { que_dice: "ok" }, /qué dice la fuente/],
  ] as [string, Partial<NuevaFuente>, RegExp][])("%s no entra", (_n, extra, mensaje) => {
    const r = registrarFuenteAportada(completa(), { ...FUENTE, ...extra }, "2026-10-13");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(mensaje);
  });

  it("la misma fuente no se registra dos veces", () => {
    const una = registrarFuenteAportada(completa(), FUENTE, "2026-10-13");
    if (!una.ok) throw new Error(una.error);
    const dos = registrarFuenteAportada(una.iniciativa, { ...FUENTE, nombre: FUENTE.nombre.toUpperCase() }, "2026-10-13");
    expect(dos).toEqual({ ok: false, error: "Esa fuente ya está registrada en esta iniciativa." });
  });

  it("añadirla deja fila de historial y no pide motivo ni autoridad; a una cerrada ya no se le añade", () => {
    const r = agregarFuente(completa({ estado: "en_curso" }), FUENTE, CONSULTORA, "2026-10-13", AHORA);
    if (!r.ok) throw new Error(r.error);
    expect(r.historial).toMatchObject({ iniciativa_id: INI, de_estado: "en_curso", a_estado: "en_curso", actor_id: U_CONSULTORA });
    expect(r.historial.motivo).toMatch(/fuente aportada: Lista de precios/);
    expect(r.cambios.fuentes_aportadas).toHaveLength(1);
    expect(agregarFuente(completa({ estado: "cerrada" }), FUENTE, CONSULTORA, "2026-10-13").ok).toBe(false);
    expect(agregarFuente(completa(), FUENTE, DUENO, "2026-10-13").ok).toBe(false);
  });
});

// ───────────────────────── 5 · PERTINENCIA ─────────────────────────

describe("pertinencia: los documentos operativos ajenos no bloquean", () => {
  const AJENOS = ["Manual de organización y funciones", "Flujograma de compras", "Reglamento interno", "Inventario de activos", "Política de caja chica"];

  it("con cinco documentos operativos faltantes la iniciativa avanza igual, y se dice que no la impiden", () => {
    const p = pertinencia(completa(), { faltantes: AJENOS });
    expect(p.puede_avanzar).toBe(true);
    expect(p.pide).toEqual([]);
    expect(p.no_la_impide).toEqual(AJENOS);
    expect(p.texto).toMatch(/faltan 5 cosas que no tienen que ver con esta iniciativa: no la impiden/);
  });

  it("y se puede aprobar con ese levantamiento a medias", () => {
    const t = transicion(completa(), "aprobada", CONSULTORA, null, null, { ahora: AHORA, levantamiento: { faltantes: [...AJENOS, { que: "«Contrato de alquiler» (todavía sin leer)", id: EV2 }] } });
    expect(t.ok).toBe(true);
    if (t.ok) expect(t.historial.evidencia).toMatchObject({ no_la_impide: [...AJENOS, "«Contrato de alquiler» (todavía sin leer)"] });
  });

  it("un faltante con identificador que la iniciativa NO cita también es ajeno", () => {
    const p = pertinencia(completa(), { faltantes: [{ que: "«Balance 2025» (todavía sin leer)", id: EV2 }] });
    expect(p.puede_avanzar).toBe(true);
    expect(p.no_la_impide).toEqual(["«Balance 2025» (todavía sin leer)"]);
  });

  it("sí pide lo suyo: sin evidencia ni fuente no avanza, con o sin levantamiento", () => {
    for (const lev of [undefined, null, { faltantes: [] }, { faltantes: AJENOS }]) {
      const p = pertinencia(completa({ evidencia_ids: [] }), lev);
      expect(p.puede_avanzar).toBe(false);
      expect(p.pide).toEqual(["Al menos una evidencia de la empresa o una fuente aportada que sustente la hipótesis."]);
    }
  });

  it("sí pide lo suyo: si su única evidencia todavía falta, no avanza y no se aprueba", () => {
    const lev = { faltantes: [{ que: "«Registro de clientes» (todavía sin leer)", id: EV1 }, ...AJENOS] };
    const p = pertinencia(completa(), lev);
    expect(p.puede_avanzar).toBe(false);
    expect(p.pide[0]).toMatch(/La evidencia que esta iniciativa cita todavía falta: «Registro de clientes»/);
    expect(p.no_la_impide).toEqual(AJENOS);
    const t = transicion(completa(), "aprobada", CONSULTORA, null, null, { levantamiento: lev });
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toMatch(/No se puede aprobar todavía\. La evidencia que esta iniciativa cita todavía falta/);
  });

  it("si le falta una evidencia pero tiene otro sustento, avanza con aviso", () => {
    const lev = { faltantes: [{ que: "«Registro de clientes» (todavía sin leer)", id: EV1 }] };
    const conOtra = pertinencia(completa({ evidencia_ids: [EV1, EV2] }), lev);
    expect(conOtra.puede_avanzar).toBe(true);
    expect(conOtra.avisos).toEqual(["Cita una evidencia que todavía falta: «Registro de clientes» (todavía sin leer)."]);
    const r = registrarFuenteAportada(completa(), FUENTE, "2026-10-13");
    if (!r.ok) throw new Error(r.error);
    expect(pertinencia(r.iniciativa, lev).puede_avanzar).toBe(true);
    const t = transicion(completa({ evidencia_ids: [EV1, EV2] }), "aprobada", CONSULTORA, null, null, { levantamiento: lev });
    expect(t.ok).toBe(true);
    if (t.ok) expect(t.aviso).toMatch(/Cita una evidencia que todavía falta/);
  });
});

// ───────────────────────── 6 · LEER UN CRITERIO ESCRITO ─────────────────────────

describe("leerCriterio: prefiere no leer a leer mal", () => {
  it.each([
    ["al menos 3 de cada 10", [{ op: "mayor_igual", a: 3 }]],
    ["3 o más", [{ op: "mayor_igual", a: 3 }]],
    ["7 de cada 10 o más", [{ op: "mayor_igual", a: 7 }]],
    [">= 70 %", [{ op: "mayor_igual", a: 70 }]],
    ["más de S/ 8,000", [{ op: "mayor", a: 8000 }]],
    ["supera los 40 mil", [{ op: "mayor", a: 40000 }]],
    ["menos de 1", [{ op: "menor", a: 1 }]],
    ["no llega a 28.000", [{ op: "menor", a: 28000 }]],
    ["como máximo 5", [{ op: "menor_igual", a: 5 }]],
    ["no más de 12 días", [{ op: "menor_igual", a: 12 }]],
    ["5 o menos", [{ op: "menor_igual", a: 5 }]],
    ["entre 1 y 2 de cada 10", [{ op: "entre", a: 1, b: 2 }]],
    ["de 5 a 7", [{ op: "entre", a: 5, b: 7 }]],
    ["entre 7 y 5", [{ op: "entre", a: 5, b: 7 }]],
    ["exactamente 10", [{ op: "igual", a: 10 }]],
  ] as [string, unknown[]][])("«%s» se entiende", (texto, condiciones) => {
    expect(leerCriterio(texto)?.condiciones).toEqual(condiciones);
  });

  it("dos condiciones unidas por «y» van juntas; por «o», basta una", () => {
    expect(leerCriterio("más de 1 y menos de 3")).toEqual({ modo: "todas", condiciones: [{ op: "mayor", a: 1 }, { op: "menor", a: 3 }], unidad: null });
    expect(leerCriterio("menos de 2 o más de 20")).toEqual({ modo: "alguna", condiciones: [{ op: "menor", a: 2 }, { op: "mayor", a: 20 }], unidad: null });
  });

  it.each([
    "si el dueño ve que la gente responde bien",
    "más de 2 meses sin mejorar",
    "menos de 3 veces",
    "hasta 30 de noviembre",
    "más de 5, menos de 9",
    "menor que -5",
    "7 de cada 10",
    "",
  ])("«%s» no se lee como número: lo evalúa una persona", (texto) => {
    expect(leerCriterio(texto)).toBeNull();
  });

  it("dice cómo lo entendió, para que quien lo escribe lo vea", () => {
    expect(comoSeLee("al menos 3 de cada 10")).toBe("se lee como: 3 de cada 10 o más");
    expect(comoSeLee("entre 1 y 2")).toBe("se lee como: entre 1 y 2");
    expect(comoSeLee("más de 1 y menos de 3")).toBe("se lee como: más de 1 y menos de 3");
    expect(comoSeLee("cuando el equipo lo vea claro")).toBe(TEXTO_EN_PALABRAS);
    expect(comoSeLee(null)).toBe("sin escribir");
  });

  it("«más del 50 %», «por debajo del 40 %» y «no llega al 30 %» se leen como cifra", () => {
    expect(leerCriterio("más del 50%")).toEqual({ modo: "todas", condiciones: [{ op: "mayor", a: 50 }], unidad: "porcentaje" });
    expect(leerCriterio("por debajo del 40 %")?.condiciones).toEqual([{ op: "menor", a: 40 }]);
    expect(leerCriterio("no llega al 30%")?.condiciones).toEqual([{ op: "menor", a: 30 }]);
    expect(leerCriterio("menos del 40% o más del 90%")).toEqual({ modo: "alguna", condiciones: [{ op: "menor", a: 40 }, { op: "mayor", a: 90 }], unidad: "porcentaje" });
  });
});

// ───────────────────────── 6b · LA UNIDAD DEL CRITERIO ─────────────────────────

describe("la unidad del criterio: un porcentaje no se compara con un «de cada 10»", () => {
  it.each([
    ["al menos 70%", "porcentaje"],
    ["al menos 70 por ciento", "porcentaje"],
    ["70 por ciento o más", "porcentaje"],
    ["menos del 40 %", "porcentaje"],
    ["al menos 3 de cada 10", "de_cada_10"],
    ["al menos 3 de cada 10 personas", "de_cada_10"],
    ["3 de cada 5 o más", "otra"],
    ["más de S/ 8,000", "soles"],
    ["al menos 8000 soles", "soles"],
    ["US$ 500 o más", "dolares"],
    ["más de $ 500", "moneda"],
    ["no más de 12 días", "dias"],
    ["menos de 4 horas", "horas"],
    ["al menos 5 personas", "personas"],
    ["más de 200 unidades", "unidades"],
    ["≥ 40", null],
    ["al menos 3", null],
    ["más de 40 clientes", null],
  ] as [string, UnidadEscrita | null][])("«%s» dice la unidad %s", (texto, unidad) => {
    const l = leerCriterio(texto);
    expect(l, "se tiene que poder leer").not.toBeNull();
    expect(l!.unidad).toBe(unidad);
  });

  it("dos unidades en un mismo criterio no se leen: lo evalúa una persona", () => {
    expect(leerCriterio("más de 5 % y menos de 3 de cada 10")).toBeNull();
    expect(leerCriterio("entre S/ 5,000 y US$ 8,000")).toBeNull();
    expect(comoSeLee("más de 5 % y menos de 3 de cada 10")).toBe(TEXTO_EN_PALABRAS);
  });

  it.each([
    [null, "de_cada_10", true], [null, undefined, true], [null, null, true],
    ["porcentaje", "de_cada_10", false], ["de_cada_10", "porcentaje", false], ["de_cada_10", "de_cada_10", true], ["porcentaje", "porcentaje", true],
    ["porcentaje", undefined, true], ["otra", undefined, false], ["otra", "de_cada_10", false],
    ["soles", "soles", true], ["soles", "dolares", false], ["moneda", "dolares", true], ["soles", "moneda", true], ["soles", "porcentaje", false],
    ["personas", null, true], ["unidades", null, true], ["porcentaje", null, false], ["de_cada_10", null, false], ["dias", null, false], ["dias", "horas", false], ["dias", "dias", true],
  ] as [UnidadEscrita | null, UnidadEscrita | null | undefined, boolean][])("criterio en %s frente a un dato en %s: ¿se compara? %s", (delCriterio, delDato, esperado) => {
    expect(mismaUnidad(delCriterio, delDato)).toBe(esperado);
  });

  it("la unidad del indicador se dice con las palabras del criterio; «numero» es una cantidad sin más", () => {
    expect(unidadDeIndicador("de_cada_10")).toBe("de_cada_10");
    expect(unidadDeIndicador("porcentaje")).toBe("porcentaje");
    expect(unidadDeIndicador("soles")).toBe("soles");
    expect(unidadDeIndicador("soles_por_hora")).toBe("soles");
    expect(unidadDeIndicador("moneda", "USD")).toBe("dolares");
    expect(unidadDeIndicador("moneda", "pen")).toBe("soles");
    expect(unidadDeIndicador("moneda", null)).toBe("moneda");
    expect(unidadDeIndicador("numero")).toBeNull();
    expect(unidadDeIndicador("kilos")).toBeUndefined();
    expect(unidadDeIndicador(null)).toBeUndefined();
  });

  it("un valor tecleado a mano dice su unidad solo si la trae", () => {
    expect(unidadDeLoEscrito("70%")).toBe("porcentaje");
    expect(unidadDeLoEscrito("70 %")).toBe("porcentaje");
    expect(unidadDeLoEscrito("-3 %")).toBe("porcentaje");
    expect(unidadDeLoEscrito("S/ 500")).toBe("soles");
    expect(unidadDeLoEscrito("500 soles")).toBe("soles");
    expect(unidadDeLoEscrito("40 mil soles")).toBe("soles");
    expect(unidadDeLoEscrito("US$ 20")).toBe("dolares");
    expect(unidadDeLoEscrito("40 mil")).toBeUndefined();
    expect(unidadDeLoEscrito("4")).toBeUndefined();
    expect(unidadDeLoEscrito("")).toBeUndefined();
  });

  it("al decir cómo lo entendió incluye la unidad, y avisa si el dato se mide en otra", () => {
    expect(comoSeLee("al menos 70%")).toBe("se lee como: 70 % o más");
    expect(comoSeLee("entre S/ 50,000 y S/ 80,000")).toBe("se lee como: entre S/ 50,000 y S/ 80,000");
    expect(comoSeLee("no más de 1 día")).toBe("se lee como: 1 día o menos");
    expect(comoSeLee("al menos 70%", "porcentaje")).toBe("se lee como: 70 % o más");
    expect(comoSeLee("al menos 3", "de_cada_10")).toBe("se lee como: 3 o más");
    expect(comoSeLee("al menos 70%", "de_cada_10")).toBe("se lee como: 70 % o más; el dato se mide en «de cada 10», no en «porcentaje»: lo evalúa una persona");
    expect(comoSeLee("al menos 70%", null)).toBe("se lee como: 70 % o más; el dato se mide en «cantidad», no en «porcentaje»: lo evalúa una persona");
    expect(comoSeLee("3 de cada 5 o más")).toBe("se lee como: 3 o más, en una escala que no es «de cada 10»: lo evalúa una persona");
  });

  const EN_PORCENTAJE = { criterio_continuar: "al menos 70%", criterio_ajustar: "entre 40% y 69%", criterio_detener: "menos de 40%" };

  it("EL CASO QUE DABA UN VEREDICTO FALSO: criterios en porcentaje y un indicador «de cada 10» en 7 no deciden nada", () => {
    const e = evaluarCriterios(EN_PORCENTAJE, 7, { comoSeDice: "7 de cada 10", unidadDelDato: "de_cada_10" });
    expect(e.hay_dato).toBe(true);
    expect(e.veredicto).toBeNull();
    expect(e.cumplen).toEqual([]);
    expect(e.de_otra_unidad).toEqual(["continuar", "ajustar", "detener"]);
    expect(e.no_evaluables).toEqual(["continuar", "ajustar", "detener"]);
    expect(e.criterios.map((c) => c.cumple)).toEqual([null, null, null]);
    expect(e.texto).toBe("Hay dato (7 de cada 10), pero los tres criterios están en otra unidad que el dato: los evalúa una persona.");
    expect(e.texto).not.toMatch(/se cumple el criterio/);
    // Lo mismo, sin decir en qué está el dato, es el número suelto que alguien tecleó mirando esos criterios: ahí sí se compara.
    expect(evaluarCriterios(EN_PORCENTAJE, 55).veredicto).toBe("ajustar");
  });

  it("con el indicador enlazado la unidad sale de él: ni «el dato apunta a detener» ni «se decidió distinto del criterio»", () => {
    const i = completa({ estado: "en_curso", ...EN_PORCENTAJE });
    const e = evaluarConIndicador(i, indicador({ valor_actual: 7 }));
    expect(e.valor).toMatchObject({ valor: 7, unidad: "de_cada_10" });
    expect(e.veredicto).toBeNull();
    expect(e.de_otra_unidad).toHaveLength(3);
    expect(conContexto(i, { hoy: "2026-10-13", indicador: indicador({ valor_actual: 7 }) }).evaluacion.veredicto).toBeNull();
    // Aun sin valor registrado, la unidad del indicador ya se conoce y el aviso ya sale junto a cada criterio.
    const sinValor = evaluarConIndicador(i, indicador({ valor_actual: null }));
    expect(sinValor.texto).toBe(SIN_DATO_PARA_EVALUAR);
    expect(sinValor.criterios[0]!.se_lee_como).toMatch(/el dato se mide en «de cada 10», no en «porcentaje»/);

    const r = transicion(i, "continuar", CONSULTORA, MOTIVO, { ...OBSERVADO, valor_indicador: 7, unidad: "de_cada_10", como_se_dice: "7 de cada 10" });
    if (!r.ok) throw new Error(r.error);
    expect(r.aviso).toBeNull();
    expect(r.historial.evidencia).toMatchObject({ valor_indicador: 7, criterio_que_se_cumple: null, coincide_con_el_criterio: null });
    expect(String(r.historial.evidencia!.evaluacion)).toMatch(/los tres criterios están en otra unidad que el dato/);
  });

  it("si solo uno está en otra unidad, los demás se comparan y ese se deja a una persona", () => {
    const e = evaluarCriterios({ criterio_continuar: "al menos 7 de cada 10", criterio_ajustar: "entre 4 y 6", criterio_detener: "menos de 40%" }, 7, { unidadDelDato: "de_cada_10" });
    expect(e.veredicto).toBe("continuar");
    expect(e.de_otra_unidad).toEqual(["detener"]);
    expect(e.criterios.find((c) => c.decision === "detener")!.cumple).toBeNull();
    expect(e.texto).toBe("Con 7 se cumple el criterio de continuar. El criterio de detener está en otra unidad que el dato: lo evalúa una persona.");
  });

  it("uno en palabras y dos en otra unidad: no hay con qué comparar, y se dice por qué cada uno", () => {
    const e = evaluarCriterios({ criterio_continuar: "al menos 70%", criterio_ajustar: "si responde a medias", criterio_detener: "menos de 40%" }, 7, { unidadDelDato: "de_cada_10" });
    expect(e.veredicto).toBeNull();
    expect(e.texto).toBe("Hay dato (7), pero ningún criterio se puede comparar con él. El criterio de ajustar no se puede leer como número: lo evalúa una persona. Los criterios de continuar y de detener están en otra unidad que el dato: los evalúa una persona.");
  });

  it("en la misma unidad sí se compara: porcentaje con porcentaje, soles con soles, y no soles con dólares", () => {
    expect(evaluarCriterios(EN_PORCENTAJE, 72, { unidadDelDato: "porcentaje" }).veredicto).toBe("continuar");
    const enSoles = { criterio_continuar: "S/ 8,000 o más", criterio_ajustar: "entre S/ 5,000 y S/ 7,999", criterio_detener: "menos de S/ 5,000" };
    const ventas = indicador({ unidad: "soles", moneda: "PEN", valor_actual: 9000 });
    expect(evaluarConIndicador(completa(enSoles), ventas).veredicto).toBe("continuar");
    const e = evaluarConIndicador(completa({ ...enSoles, criterio_continuar: "US$ 8,000 o más" }), ventas);
    expect(e.veredicto).toBeNull();
    expect(e.de_otra_unidad).toEqual(["continuar"]);
  });
});

// ───────────────────────── 7 · EVALUAR: SIN DATO NO HAY VEREDICTO ─────────────────────────

describe("evaluarCriterios: solo decide si hay valor del indicador", () => {
  it.each([[null], [undefined], [Number.NaN], [Number.POSITIVE_INFINITY]])("sin dato (%s) no decide: «sin dato para evaluar» y ningún criterio marcado", (valor) => {
    const e = evaluarCriterios(completa(), valor as number | null | undefined);
    expect(e.hay_dato).toBe(false);
    expect(e.veredicto).toBeNull();
    expect(e.cumplen).toEqual([]);
    expect(e.texto).toBe("sin dato para evaluar");
    expect(e.texto).toBe(SIN_DATO_PARA_EVALUAR);
    expect(e.criterios.map((c) => c.cumple)).toEqual([null, null, null]);
  });

  it("sin dato no decide ni siquiera cuando los tres criterios dirían lo mismo con cualquier número", () => {
    const e = evaluarCriterios({ criterio_continuar: "0 o más", criterio_ajustar: "menos de 0", criterio_detener: "menos de 0" }, null);
    expect(e.veredicto).toBeNull();
    expect(e.hay_dato).toBe(false);
  });

  it("cero es un dato, no un «sin dato»", () => {
    const e = evaluarCriterios(completa(), 0);
    expect(e.hay_dato).toBe(true);
    expect(e.veredicto).toBe("detener");
    expect(e.texto).toBe("Con 0 se cumple el criterio de detener.");
  });

  it.each([[3.5, "continuar"], [3, "continuar"], [2, "ajustar"], [1, "ajustar"], [0.5, "detener"]] as [number, string][])("con %s se cumple el criterio de %s", (valor, veredicto) => {
    const e = evaluarCriterios(completa(), valor);
    expect(e.veredicto).toBe(veredicto);
    expect(e.cumplen).toEqual([veredicto]);
  });

  it("si con ese valor no se cumple ninguno, no hay veredicto y se dice que hay un hueco", () => {
    const e = evaluarCriterios(completa(), 2.5);
    expect(e.hay_dato).toBe(true);
    expect(e.veredicto).toBeNull();
    expect(e.texto).toMatch(/no se cumple ninguno.*Hay un hueco/);
  });

  it("si se cumplen dos a la vez, no hay veredicto y se dice que se pisan", () => {
    const e = evaluarCriterios(completa({ criterio_ajustar: "entre 1 y 3" }), 3);
    expect(e.cumplen).toEqual(["continuar", "ajustar"]);
    expect(e.veredicto).toBeNull();
    expect(e.texto).toMatch(/se pisan\. Decide una persona/);
  });

  it("un criterio escrito en palabras no se da por cumplido ni por incumplido", () => {
    const e = evaluarCriterios(completa({ criterio_detener: "si el dueño decide que ya no vale la pena" }), 3.5);
    expect(e.veredicto).toBe("continuar");
    expect(e.no_evaluables).toEqual(["detener"]);
    expect(e.criterios.find((c) => c.decision === "detener")!.cumple).toBeNull();
    expect(e.texto).toMatch(/El criterio de detener no se puede leer como número: lo evalúa una persona/);
  });

  it("con los tres en palabras hay dato pero no hay veredicto", () => {
    const e = evaluarCriterios({ criterio_continuar: "si la gente responde", criterio_ajustar: "si responde a medias", criterio_detener: "si nadie responde" }, 7);
    expect(e.hay_dato).toBe(true);
    expect(e.veredicto).toBeNull();
    expect(e.texto).toMatch(/los tres criterios están escritos en palabras/);
  });

  it("el valor se dice como lo lee el dueño cuando se le pasa en palabras", () => {
    expect(evaluarCriterios(completa(), 3.5, { comoSeDice: "3,5 de cada 10 (setiembre de 2026)" }).texto).toBe("Con 3,5 de cada 10 (setiembre de 2026) se cumple el criterio de continuar.");
  });
});

describe("valorParaEvaluar: qué valor del indicador sirve, y por qué a veces no hay", () => {
  it("sin indicador enlazado no hay dato", () => {
    const v = valorParaEvaluar(completa({ indicador_id: null }), null);
    expect(v.valor).toBeNull();
    expect(v.por_que_no).toMatch(/no tiene un indicador enlazado/);
  });

  it("un indicador sin ningún valor no es cero: es sin dato", () => {
    const v = valorParaEvaluar(completa(), indicador({ valor_actual: null, valor_actual_periodo: null, estado_validacion: null }));
    expect(v.valor).toBeNull();
    expect(v.por_que_no).toMatch(/todavía no tiene ningún valor registrado/);
  });

  it("si lo último que se anotó fue «sin dato», no se evalúa con el número viejo", () => {
    const v = valorParaEvaluar(completa(), indicador({ estado_validacion: "sin_dato" }));
    expect(v.valor).toBeNull();
    expect(v.por_que_no).toMatch(/fue «sin dato»/);
  });

  it("un valor de antes de que la iniciativa empezara no dice nada de ella", () => {
    const v = valorParaEvaluar(completa({ plazo_inicio: "2026-10-05" }), indicador({ valor_actual_periodo: "2026-09" }));
    expect(v.valor).toBeNull();
    expect(v.por_que_no).toMatch(/anterior al inicio de la iniciativa/);
    expect(evaluarConIndicador(completa({ plazo_inicio: "2026-10-05" }), indicador()).veredicto).toBeNull();
  });

  it("una iniciativa que no empezó no se evalúa", () => {
    expect(valorParaEvaluar(completa({ plazo_inicio: null }), indicador()).por_que_no).toMatch(/todavía no tiene fecha de inicio/);
  });

  it("con un valor de un periodo posterior al inicio, sirve y se dice en palabras", () => {
    const e = evaluarConIndicador(completa(), indicador());
    expect(e.valor).toMatchObject({ valor: 3.5, periodo: "2026-09", calidad: "declarado", por_que_no: null });
    expect(e.valor.como_se_dice).toMatch(/^3[,.]5 de cada 10 \(/);
    expect(e.veredicto).toBe("continuar");
  });

  it("evaluarConIndicador sin dato devuelve «sin dato para evaluar» y el porqué aparte", () => {
    const e = evaluarConIndicador(completa(), indicador({ valor_actual: null }));
    expect(e.texto).toBe(SIN_DATO_PARA_EVALUAR);
    expect(e.veredicto).toBeNull();
    expect(e.valor.por_que_no).toBeTruthy();
  });
});

// ───────────────────────── 8 · TRANSICIONES ─────────────────────────

/** Datos suficientes para que cada paso pase sus propios candados y la prueba mida solo la tabla. */
const pasar = (i: Iniciativa, a: Estado, actor: Actor = CONSULTORA) => transicion(i, a, actor, MOTIVO, { ...OBSERVADO, valor_indicador: 3.5 }, { ahora: AHORA });

describe("la tabla de transiciones", () => {
  const PERMITIDAS: [Estado, Estado][] = [
    ["propuesta", "aprobada"], ["propuesta", "cerrada"], ["aprobada", "en_curso"], ["en_curso", "continuar"], ["en_curso", "ajustar"], ["en_curso", "detener"],
    ["ajustar", "en_curso"], ["continuar", "en_curso"], ["continuar", "cerrada"], ["detener", "cerrada"],
  ];
  const todas = ESTADOS.flatMap((de) => ESTADOS.map((a) => [de, a] as [Estado, Estado]));
  const esPermitida = (de: Estado, a: Estado) => PERMITIDAS.some(([x, y]) => x === de && y === a);

  it("la tabla escrita es exactamente la que Dirección definió", () => {
    expect(TRANSICIONES).toEqual({
      propuesta: ["aprobada", "cerrada"], aprobada: ["en_curso"], en_curso: ["continuar", "ajustar", "detener"],
      ajustar: ["en_curso"], continuar: ["en_curso", "cerrada"], detener: ["cerrada"], cerrada: [],
    });
  });

  it.each(todas.filter(([de, a]) => esPermitida(de, a)))("%s → %s se puede, y deja su fila de historial", (de, a) => {
    const r = pasar(completa({ estado: de }), a);
    if (!r.ok) throw new Error(r.error);
    expect(r.estado).toBe(a);
    expect(r.cambios.estado).toBe(a);
    expect(r.cambios.updated_at).toBe(AHORA.toISOString());
    expect(r.historial).toMatchObject({ iniciativa_id: INI, de_estado: de, a_estado: a, actor_id: U_CONSULTORA, motivo: MOTIVO });
  });

  it.each(todas.filter(([de, a]) => !esPermitida(de, a)))("%s → %s NO se puede", (de, a) => {
    const r = pasar(completa({ estado: de }), a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no puede pasar a/);
  });

  it("son 10 pasos permitidos y 39 prohibidos: ninguno queda sin probar", () => {
    expect(todas.filter(([de, a]) => esPermitida(de, a))).toHaveLength(10);
    expect(todas.filter(([de, a]) => !esPermitida(de, a))).toHaveLength(39);
    expect(Object.values(TRANSICIONES).flat()).toHaveLength(10);
  });

  it("el error de un paso prohibido dice qué sí se puede; una cerrada ya no admite nada", () => {
    const r = transicion(completa({ estado: "en_curso" }), "cerrada", CONSULTORA, MOTIVO);
    expect(r).toEqual({ ok: false, error: "Una iniciativa en «En curso» no puede pasar a «Cerrada». Desde aquí solo se puede: continuar, ajustar, detener." });
    const c = transicion(completa({ estado: "cerrada" }), "en_curso", CONSULTORA, MOTIVO);
    if (!c.ok) expect(c.error).toMatch(/Ya no admite más pasos/);
    expect(c.ok).toBe(false);
  });

  it("el dueño y el sistema no dan ningún paso: lo registra la consultora", () => {
    for (const [de, a] of PERMITIDAS) {
      expect(pasar(completa({ estado: de }), a, DUENO), `${de} → ${a}`).toEqual({ ok: false, error: ERROR_SOLO_CONSULTORA });
      expect(pasar(completa({ estado: de }), a, { id: null, rol: "sistema" }), `${de} → ${a}`).toEqual({ ok: false, error: ERROR_SOLO_CONSULTORA });
    }
  });

  it("un estado inventado no entra por ningún lado", () => {
    const inventado = "terminada" as string as Estado;
    expect(transicion(completa(), inventado, CONSULTORA).ok).toBe(false);
    expect(transicion(completa({ estado: inventado }), "aprobada", CONSULTORA).ok).toBe(false);
  });
});

describe("aprobar", () => {
  it("exige la ficha completa: una incompleta no se aprueba y el error lista lo que falta", () => {
    const r = transicion(completa({ recursos: null, criterio_detener: null, responsable_participant_id: null }), "aprobada", CONSULTORA);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("No se puede aprobar todavía. Falta: recursos, criterio para detener, responsable.");
      expect(r.faltan?.map((f) => f.campo)).toEqual(["recursos", "criterio_detener", "responsable"]);
    }
  });

  it("pide la autoridad «aprobar_plan» y anota quién aprobó y cuándo", () => {
    const r = transicion(completa(), "aprobada", CONSULTORA, null, null, { ahora: AHORA });
    if (!r.ok) throw new Error(r.error);
    expect(r.autoridad).toBe("aprobar_plan");
    expect(r.cambios).toMatchObject({ estado: "aprobada", decision_at: AHORA.toISOString(), decision_por: U_CONSULTORA });
    expect(r.historial.evidencia).toMatchObject({ ficha_completa: true, evidencias: 1, fuentes_aportadas: 0 });
  });

  it("la autoridad que pide cada paso: aprobar y las tres decisiones; empezar, reanudar y cerrar no", () => {
    expect(autoridadNecesaria("aprobada")).toBe("aprobar_plan");
    for (const d of DECISIONES) expect(autoridadNecesaria(d)).toBe("aprobar_plan");
    expect(autoridadNecesaria("en_curso")).toBeNull();
    expect(autoridadNecesaria("cerrada")).toBeNull();
  });
});

describe("empezar, reanudar, descartar y cerrar", () => {
  it("empezar pone la fecha de inicio si no la tenía (el día que vive la empresa), y no la pisa si ya estaba", () => {
    const sin = transicion(completa({ estado: "aprobada", plazo_inicio: null }), "en_curso", CONSULTORA, null, null, { ahora: new Date("2026-10-14T02:00:00Z"), zona: "America/Lima" });
    if (!sin.ok) throw new Error(sin.error);
    expect(sin.cambios.plazo_inicio).toBe("2026-10-13");
    expect(sin.autoridad).toBeNull();
    const con = transicion(completa({ estado: "aprobada" }), "en_curso", CONSULTORA, null, null, { ahora: AHORA });
    if (!con.ok) throw new Error(con.error);
    expect("plazo_inicio" in con.cambios).toBe(false);
  });

  it("reanudar tras un ajuste exige decir qué se ajustó; seguir midiendo tras «continuar», no", () => {
    expect(transicion(completa({ estado: "ajustar" }), "en_curso", CONSULTORA).ok).toBe(false);
    expect(transicion(completa({ estado: "ajustar" }), "en_curso", CONSULTORA, "Se cambió el guion de la llamada").ok).toBe(true);
    expect(transicion(completa({ estado: "continuar" }), "en_curso", CONSULTORA).ok).toBe(true);
  });

  it("descartar una propuesta y cerrar lo que se decidió continuar exigen motivo; cerrar lo detenido, no", () => {
    const d = transicion(completa(), "cerrada", CONSULTORA);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toMatch(/Para descartar una propuesta di por qué/);
    expect(transicion(completa(), "cerrada", CONSULTORA, "La empresa no tiene a quién asignar").ok).toBe(true);
    expect(transicion(completa({ estado: "continuar" }), "cerrada", CONSULTORA, "ok").ok).toBe(false);
    expect(transicion(completa({ estado: "continuar" }), "cerrada", CONSULTORA, "Se alcanzó la medida de éxito").ok).toBe(true);
    const c = transicion(completa({ estado: "detener", decision_motivo: "No volvió nadie" }), "cerrada", CONSULTORA);
    if (!c.ok) throw new Error(c.error);
    expect("decision_motivo" in c.cambios, "cerrar lo detenido no pisa el motivo por el que se detuvo").toBe(false);
  });

  it("descartar una propuesta incompleta se puede: para descartar no hace falta completarla", () => {
    expect(transicion(iniciativaVacia({ id: INI }), "cerrada", CONSULTORA, "Era la misma idea que otra ya propuesta").ok).toBe(true);
  });
});

describe("continuar, ajustar y detener: con motivo y con evidencia", () => {
  const enCurso = () => completa({ estado: "en_curso" });

  it.each([...DECISIONES])("%s sin motivo no pasa", (d) => {
    expect(transicion(enCurso(), d, CONSULTORA, null, OBSERVADO)).toEqual({ ok: false, error: ERROR_SIN_MOTIVO });
    expect(transicion(enCurso(), d, CONSULTORA, "ok", OBSERVADO)).toEqual({ ok: false, error: ERROR_SIN_MOTIVO });
  });

  it.each([...DECISIONES])("%s sin evidencia de lo observado no pasa", (d) => {
    expect(transicion(enCurso(), d, CONSULTORA, MOTIVO, null)).toEqual({ ok: false, error: ERROR_SIN_EVIDENCIA });
    expect(transicion(enCurso(), d, CONSULTORA, MOTIVO, { que_se_observo: "bien", valor_indicador: 3.5 })).toEqual({ ok: false, error: ERROR_SIN_EVIDENCIA });
  });

  it("con motivo y evidencia pasa: pide autoridad, anota la decisión y el historial guarda qué se vio y qué decía el criterio", () => {
    const r = transicion(enCurso(), "continuar", CONSULTORA, MOTIVO, { ...OBSERVADO, valor_indicador: 3.5, periodo: "2026-09", evidencia_ids: [EV2] }, { ahora: AHORA });
    if (!r.ok) throw new Error(r.error);
    expect(r.autoridad).toBe("aprobar_plan");
    expect(r.cambios).toMatchObject({ estado: "continuar", decision_at: AHORA.toISOString(), decision_por: U_CONSULTORA, decision_motivo: MOTIVO });
    expect(r.historial.evidencia).toEqual({
      que_se_observo: OBSERVADO.que_se_observo, valor_indicador: 3.5, periodo: "2026-09", evidencia_ids: [EV2],
      evaluacion: "Con 3.5 se cumple el criterio de continuar.", criterio_que_se_cumple: "continuar", coincide_con_el_criterio: true,
    });
    expect(r.aviso).toBeNull();
  });

  it("decidir distinto de lo que dice el criterio se puede, pero queda dicho", () => {
    const r = transicion(enCurso(), "continuar", CONSULTORA, "El dueño quiere darle un mes más", { ...OBSERVADO, valor_indicador: 0.5 });
    if (!r.ok) throw new Error(r.error);
    expect(r.aviso).toMatch(/Se decide continuar, y con el dato disponible el criterio que se cumple es el de detener/);
    expect(r.historial.evidencia).toMatchObject({ criterio_que_se_cumple: "detener", coincide_con_el_criterio: false });
  });

  it("decidir sin dato del indicador se puede con lo observado, y el historial no inventa un criterio cumplido", () => {
    const r = transicion(enCurso(), "ajustar", CONSULTORA, "Las llamadas se hacen a deshoras", { que_se_observo: "Casi nadie contesta antes del mediodía" });
    if (!r.ok) throw new Error(r.error);
    expect(r.aviso).toMatch(/Se decide sin dato del indicador/);
    expect(r.historial.evidencia).toMatchObject({ valor_indicador: null, periodo: null, evaluacion: "sin dato para evaluar", criterio_que_se_cumple: null, coincide_con_el_criterio: null });
  });
});

// ───────────────────────── 9 · CREAR Y EDITAR ─────────────────────────

describe("proponer una iniciativa", () => {
  const datos = { dominio: "retencion", titulo: "Llamar a quien no volvió", hipotesis: "Si llamamos a quien no vuelve, 3 de cada 10 regresan", medida_exito: "Clientes que vuelven, de cada 10 llamados" };

  it("nace propuesta, con quien la propuso, y su fila de historial no tiene estado anterior", () => {
    const r = nueva(EMP, { ...datos, estado: "aprobada", decision_por: U_DUENO, recursos: "  " }, CONSULTORA, "2026-10-13");
    if (!r.ok) throw new Error(r.error);
    expect(r.fila).toMatchObject({ company_id: EMP, estado: "propuesta", creada_por: U_CONSULTORA, dominio: "retencion", recursos: null, evidencia_ids: [], fuentes_aportadas: [] });
    expect("decision_por" in r.fila, "lo que no es de la ficha no entra aunque se mande").toBe(false);
    expect(r.historial).toEqual({ de_estado: null, a_estado: "propuesta", motivo: "Se propuso la iniciativa", evidencia: null, actor_id: U_CONSULTORA });
  });

  it.each([
    ["sin dominio", { dominio: undefined }, /no es uno de los quince/],
    ["con un dominio inventado", { dominio: "ventas" }, /no es uno de los quince/],
    ["sin título", { titulo: "" }, /título/],
    ["sin hipótesis", { hipotesis: "sube" }, /hipótesis/],
    ["sin medida de éxito", { medida_exito: "" }, /medida de éxito/],
    ["con una fecha mal escrita", { plazo_fin: "30/11/2026" }, /AAAA-MM-DD/],
    ["con el cierre antes del inicio", { plazo_inicio: "2026-12-01", plazo_fin: "2026-11-01" }, /anterior a la de inicio/],
  ] as [string, Record<string, unknown>, RegExp][])("%s no se propone", (_n, extra, mensaje) => {
    const cuerpo: Record<string, unknown> = { ...datos, ...extra };
    if (extra.dominio === undefined && "dominio" in extra) delete cuerpo.dominio;
    const r = nueva(EMP, cuerpo, CONSULTORA, "2026-10-13");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(mensaje);
  });

  it("el dueño no propone", () => {
    expect(nueva(EMP, datos, DUENO, "2026-10-13").ok).toBe(false);
  });
});

describe("editar la ficha", () => {
  it("una propuesta se completa sin motivo ni autoridad, y el historial dice qué cambió", () => {
    const r = editar(completa({ recursos: null }), { recursos: "Una persona, dos horas por semana", titulo: "Llamar a quien no volvió" }, CONSULTORA, null, AHORA);
    if (!r.ok || r.sin_cambios) throw new Error("debía haber cambios");
    expect(r.autoridad).toBeNull();
    expect(r.cambios).toEqual({ recursos: "Una persona, dos horas por semana", updated_at: AHORA.toISOString() });
    expect(r.historial).toMatchObject({ de_estado: "propuesta", a_estado: "propuesta", motivo: "Se completó la ficha" });
    expect(r.historial.evidencia).toEqual({ cambios: { recursos: { antes: null, despues: "Una persona, dos horas por semana" } } });
  });

  it("mandar lo mismo que ya hay no es un cambio", () => {
    expect(editar(completa(), { titulo: "Llamar a quien no volvió", evidencia_ids: [EV1] }, CONSULTORA)).toEqual({ ok: true, sin_cambios: true });
  });

  it("ya aprobada, cambiarla pide motivo y la autoridad de aprobar", () => {
    const aprobada = completa({ estado: "aprobada" });
    const sin = editar(aprobada, { plazo_fin: "2026-12-31" }, CONSULTORA);
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(sin.error).toMatch(/ya está aprobada: para cambiarla di por qué/);
    const con = editar(aprobada, { plazo_fin: "2026-12-31" }, CONSULTORA, "La campaña de diciembre retrasa las llamadas");
    if (!con.ok || con.sin_cambios) throw new Error("debía pasar");
    expect(con.autoridad).toBe("aprobar_plan");
    expect(con.historial.motivo).toBe("La campaña de diciembre retrasa las llamadas");
  });

  it("una aprobada no puede quedar incompleta", () => {
    const r = editar(completa({ estado: "en_curso" }), { criterio_detener: "" }, CONSULTORA, "Se quita el criterio de detener");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no puede quedar incompleta\. Faltaría: criterio para detener/);
  });

  it("lo detenido y lo cerrado ya no se edita; el dueño no edita; el estado no se cambia por aquí", () => {
    for (const estado of ["detener", "cerrada"] as Estado[]) expect(editar(completa({ estado }), { titulo: "Otro título" }, CONSULTORA, MOTIVO).ok).toBe(false);
    expect(editar(completa(), { titulo: "Otro título" }, DUENO).ok).toBe(false);
    expect(editar(completa(), { estado: "aprobada", decision_motivo: "colado", fuentes_aportadas: [] }, CONSULTORA)).toEqual({ ok: true, sin_cambios: true });
  });
});

// ───────────────────────── 10 · LO QUE VE EL DUEÑO ─────────────────────────

describe("lo que viaja al portal del dueño", () => {
  it("ve lo aprobado y lo que está en curso; no ve propuestas, ni lo detenido, ni lo cerrado", () => {
    expect([...ESTADOS_VISIBLES_CLIENTE]).toEqual(["aprobada", "en_curso", "continuar", "ajustar"]);
    expect(ESTADOS.filter(visibleParaCliente)).toEqual(["aprobada", "en_curso", "continuar", "ajustar"]);
    for (const estado of ["propuesta", "detener", "cerrada"] as Estado[]) expect(filaCliente(completa({ estado })), estado).toBeNull();
    expect(visibleParaCliente("cualquier cosa")).toBe(false);
  });

  it("la fila del dueño no trae ninguna columna interna aunque la iniciativa las tenga todas", () => {
    const con = registrarFuenteAportada(completa({ estado: "en_curso", decision_motivo: "Motivo interno de la consultora", decision_por: U_CONSULTORA, pendiente_investigacion: "Falta ver precios de la avenida" }), FUENTE, "2026-10-13");
    if (!con.ok) throw new Error(con.error);
    const fila = filaCliente(con.iniciativa, { indicador: indicador(), responsable_puesto: "Encargada de tienda" })!;
    expect(Object.keys(fila).sort()).toEqual(["ajustamos_si", "como_sabremos", "como_va", "en_que_nos_basamos", "estado", "falta_averiguar", "id", "paramos_si", "plazo_fin", "plazo_inicio", "pregunta", "que_creemos", "responsable_puesto", "seguimos_si", "tema", "titulo"]);
    for (const k of CLAVES_INTERNAS) expect(k in fila, k).toBe(false);
    const todo = JSON.stringify(fila);
    expect(todo).not.toMatch(/Motivo interno|Rosa|dos horas por semana/);
    expect(todo).not.toContain(U_CONSULTORA);
    expect(todo).not.toContain(PER);
    expect(todo).not.toContain(EV1);
    expect(fila).toMatchObject({ tema: "Cuántos clientes vuelven", estado: "En curso", responsable_puesto: "Encargada de tienda", en_que_nos_basamos: [FUENTE.nombre], falta_averiguar: "Falta ver precios de la avenida" });
    expect(fila.como_va).toMatch(/^Hoy va en 3[,.]5 de cada 10/);
  });

  it("junto al número se le dice de dónde sale, con las mismas palabras que el resto del portal", () => {
    const comoVa = (extra: Partial<IndicadorDeIniciativa>) => filaCliente(completa({ estado: "en_curso" }), { indicador: indicador(extra) })!.como_va;
    expect(comoVa({})).toMatch(/^Hoy va en 3[,.]5 de cada 10 \([^)]*\)\. Este dato: lo declaró la empresa\.$/);
    expect(comoVa({ estado_validacion: "extraido" })).toMatch(/Este dato: sacado de un documento, sin conciliar\.$/);
    expect(comoVa({ estado_validacion: "verificado" })).toMatch(/Este dato: verificado\.$/);
    expect(comoVa({ estado_validacion: null })).toMatch(/\. No está anotado de dónde salió este dato\.$/);
    for (const e of ESTADOS_VALIDACION_VALOR) expect(comoVa({ estado_validacion: e }), e).toContain(`Este dato: ${VALIDACION_TEXTO[e]}.`);
  });

  it("un criterio escrito con signos le llega en palabras; uno escrito como frase, tal cual", () => {
    const f = filaCliente(completa({ estado: "en_curso", criterio_continuar: "≥ 3", criterio_ajustar: ">= 1 y < 3", criterio_detener: "si en dos meses nadie contesta" }), { indicador: indicador() })!;
    expect(f).toMatchObject({ seguimos_si: "3 de cada 10 o más", ajustamos_si: "1 de cada 10 o más y menos de 3 de cada 10", paramos_si: "si en dos meses nadie contesta" });
    expect(filaCliente(completa({ estado: "en_curso", indicador_id: null, criterio_continuar: "≥ 40" }))!.seguimos_si).toBe("40 o más");
    expect(filaCliente(completa({ estado: "en_curso" }))!.seguimos_si).toBe("al menos 3 de cada 10");
    expect(criterioParaElDueno("> lo de antes"), "con signo pero sin cifra: no se toca").toBe("> lo de antes");
    expect(criterioParaElDueno(">= 70%", "de_cada_10"), "la unidad escrita manda sobre la del dato").toBe("70 % o más");
    expect(criterioParaElDueno(null)).toBeNull();
  });

  it("sin dato no se le dice un número: se le dice que todavía no hay", () => {
    expect(filaCliente(completa({ estado: "aprobada" }), { indicador: indicador({ valor_actual: null }) })!.como_va).toBe("Todavía no hay un dato que sirva para saber cómo va.");
    expect(filaCliente(completa({ estado: "aprobada", indicador_id: null }))!.como_va).toBe("Se comprueba mirando lo que pasa, no con un número.");
  });

  it("toca decidir cuando el plazo se cumplió y sigue aprobada o en curso", () => {
    expect(tocaDecidir(completa({ estado: "en_curso" }), "2026-12-01")).toBe(true);
    expect(tocaDecidir(completa({ estado: "en_curso" }), "2026-11-30")).toBe(false);
    expect(tocaDecidir(completa({ estado: "continuar" }), "2026-12-01")).toBe(false);
    expect(tocaDecidir(completa({ estado: "propuesta" }), "2026-12-01")).toBe(false);
  });

  it("una fecha de calendario se dice como día: la zona del navegador no la corre", () => {
    expect(diaCorto("2026-11-30")).toBe("30 nov 2026");
    expect(diaCorto("2026-11-01")).toBe("1 nov 2026");
    expect(diaCorto("2026-09-05")).toBe("5 set 2026");
    expect(diaCorto(null)).toBe("sin fecha");
    expect(diaCorto("30/11/2026")).toBe("sin fecha");
    expect(plazoEnPalabras("2026-09-01", "2026-11-30")).toBe("del 1 set 2026 al 30 nov 2026");
    expect(plazoEnPalabras(null, "2026-11-30")).toBe("hasta el 30 nov 2026");
    expect(plazoEnPalabras("2026-09-01", null)).toBe("desde el 1 set 2026, sin fecha de cierre");
    expect(plazoEnPalabras(null, null)).toBe("sin plazo todavía");
    // 02:00 UTC del 14 de octubre todavía es 13 de octubre en Lima.
    expect(momentoCorto("2026-10-14T02:00:00Z", "America/Lima")).toBe("13 oct 2026");
    expect(momentoCorto("2026-10-14T02:00:00Z", "UTC")).toBe("14 oct 2026");
    expect(momentoCorto("2026-10-14T02:00:00Z", "zona/inventada"), "una zona que no se reconoce cae a la de por defecto, no rompe la pantalla").toBe("13 oct 2026");
    expect(momentoCorto("no es una fecha", "America/Lima")).toBe("sin fecha");
    expect(momentoCorto(null, "America/Lima")).toBe("sin fecha");
  });

  it("los botones dicen lo que hacen", () => {
    expect(verboDe("propuesta", "aprobada")).toBe("Aprobar");
    expect(verboDe("propuesta", "cerrada")).toBe("Descartar");
    expect(verboDe("aprobada", "en_curso")).toBe("Empezar");
    expect(DECISIONES.map((d) => verboDe("en_curso", d))).toEqual(["Continuar", "Ajustar", "Detener"]);
    expect(verboDe("detener", "cerrada")).toBe("Cerrar");
  });

  it("una fila de la base se lee sin inventar: estado desconocido es propuesta, fuentes a medias se descartan", () => {
    const i = desdeFila({ id: INI, company_id: EMP, dominio: "retencion", titulo: "t", hipotesis: "h", medida_exito: "m", estado: "terminada", evidencia_ids: [EV1, 7], fuentes_aportadas: [{ nombre: "Lista", que_dice: "dice algo" }, { nombre: "sin contenido" }, "texto suelto"], recursos: "  " });
    expect(i.estado).toBe("propuesta");
    expect(i.evidencia_ids).toEqual([EV1]);
    expect(i.fuentes_aportadas).toEqual([{ nombre: "Lista", quien_la_aporto: "", fecha: "", que_dice: "dice algo" }]);
    expect(i.recursos).toBeNull();
  });
});

// ───────────────────────── 11 · LA CAPA QUE TOCA LA BASE (con dobles) ─────────────────────────

const PERFIL_CONSULTORA: Perfil = { id: U_CONSULTORA, email: "c@prueba.local", nombre: "Consultora", rol: "consultor" };
const PERFIL_SIN_AUTORIDAD: Perfil = { ...PERFIL_CONSULTORA, autoridad: ["aprobar_hallazgo"] };
const PERFIL_DUENO: Perfil = { id: U_DUENO, email: "d@prueba.local", nombre: "Dueña", rol: "cliente" };

const filaDe = (i: Iniciativa): Fila => ({ ...i });
const escriturasEn = (tabla: string, op?: Operacion) => base.escrituras.filter((e) => e.tabla === tabla && (!op || e.op === op));

function sembrar(iniciativas: Iniciativa[] = [completa()]) {
  base.tablas = {
    iniciativas: iniciativas.map(filaDe),
    iniciativa_historial: [],
    companies: [{ id: EMP, zona_horaria: "America/Lima" }, { id: OTRA, zona_horaria: "America/Lima" }],
    users: [{ id: U_CONSULTORA, nombre: "Consultora", autoridad: [] }, { id: U_DUENO, nombre: "Dueña", autoridad: [] }],
    memberships: [{ user_id: U_DUENO, company_id: EMP }],
    participants: [{ id: PER, company_id: EMP, nombre: "Rosa Mamani", puesto: "Encargada de tienda", rol: "lider" }],
    indicadores: [{ id: IND, company_id: EMP, nombre: "Clientes que vuelven", unidad: "de_cada_10", estado: "activo", valor_actual: 3.5, valor_actual_periodo: "2026-09", estado_validacion: "declarado" }],
    findings: [{ id: EV1, company_id: EMP, titulo: "Seis de cada diez clientes no vuelven", estado_revision: "aprobado" }],
    sources: [{ id: EV2, company_id: EMP, nombre: "Registro de clientes 2026", estado: "subido" }],
    claims: [],
  };
}

beforeEach(() => {
  base.escrituras = [];
  base.fallar = {};
  base.sinTabla = new Set();
  base.consultas = [];
  base.seq = 0;
  sembrar();
  vi.mocked(perfilApi).mockReset();
  vi.mocked(registrar).mockClear();
});

describe("aplicarTransicion (con dobles de la base)", () => {
  it("aprobar exige la autoridad «aprobar_plan»: quien no la tiene recibe una denegación y no se escribe nada", async () => {
    await expect(aplicarTransicion(completa(), PERFIL_SIN_AUTORIDAD, { a_estado: "aprobada" })).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(aplicarTransicion(completa(), PERFIL_SIN_AUTORIDAD, { a_estado: "aprobada" })).rejects.toThrow(/No tienes autoridad para aprobar o publicar el plan/);
    expect(base.escrituras).toEqual([]);
    expect(base.tablas.iniciativas![0]!.estado).toBe("propuesta");
  });

  it("las tres decisiones también la exigen; empezar no", async () => {
    sembrar([completa({ estado: "en_curso" })]);
    for (const d of DECISIONES) await expect(aplicarTransicion(completa({ estado: "en_curso" }), PERFIL_SIN_AUTORIDAD, { a_estado: d, motivo: MOTIVO, ...OBSERVADO })).rejects.toBeInstanceOf(AccesoDenegado);
    expect(base.escrituras).toEqual([]);
    sembrar([completa({ estado: "aprobada" })]);
    await expect(aplicarTransicion(completa({ estado: "aprobada" }), PERFIL_SIN_AUTORIDAD, { a_estado: "en_curso" })).resolves.toMatchObject({ estado: "en_curso" });
  });

  it("la autoridad guardada en la base también cuenta: «ninguna» no aprueba", async () => {
    base.tablas.users![0]!.autoridad = ["ninguna"];
    await expect(aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "aprobada" })).rejects.toBeInstanceOf(AccesoDenegado);
    expect(base.escrituras).toEqual([]);
  });

  it("con autoridad y la ficha completa: escribe la iniciativa y su fila de historial", async () => {
    const r = await aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "aprobada" });
    expect(r.estado).toBe("aprobada");
    expect(base.tablas.iniciativas![0]).toMatchObject({ estado: "aprobada", decision_por: U_CONSULTORA });
    expect(escriturasEn("iniciativas", "update")).toHaveLength(1);
    expect(escriturasEn("iniciativa_historial", "insert")).toHaveLength(1);
    expect(base.tablas.iniciativa_historial![0]).toMatchObject({ iniciativa_id: INI, de_estado: "propuesta", a_estado: "aprobada", actor_id: U_CONSULTORA });
  });

  it("la regla incumplida corta antes de escribir", async () => {
    sembrar([completa({ recursos: null })]);
    await expect(aplicarTransicion(completa({ recursos: null }), PERFIL_CONSULTORA, { a_estado: "aprobada" })).rejects.toThrow(/Falta: recursos/);
    await expect(aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "en_curso" })).rejects.toThrow(/no puede pasar a/);
    expect(base.escrituras).toEqual([]);
  });

  it("no se aprueba si la única evidencia que cita todavía no sirve; otros documentos sin leer no cuentan", async () => {
    // EV2 (una fuente sin leer) no la cita esta iniciativa: no la impide.
    await expect(aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "aprobada" })).resolves.toMatchObject({ estado: "aprobada" });
    // Ahora la iniciativa cita SOLO esa fuente sin leer.
    sembrar([completa({ evidencia_ids: [EV2] })]);
    base.escrituras = [];
    await expect(aplicarTransicion(completa({ evidencia_ids: [EV2] }), PERFIL_CONSULTORA, { a_estado: "aprobada" })).rejects.toThrow(/La evidencia que esta iniciativa cita todavía falta: «Registro de clientes 2026» \(todavía sin leer\)/);
    expect(base.escrituras).toEqual([]);
  });

  it("si el historial no entra, la iniciativa vuelve a como estaba y se falla en voz alta", async () => {
    base.fallar.iniciativa_historial = { op: "insert", mensaje: "sin espacio" };
    await expect(aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "aprobada" })).rejects.toThrow(/no se cambió porque su historial no se pudo guardar: sin espacio/);
    expect(base.tablas.iniciativas![0]).toMatchObject({ estado: "propuesta", decision_por: null, decision_at: null });
    expect(base.tablas.iniciativa_historial).toEqual([]);
    // Y vuelve también a la versión que tenía: quien la tenga abierta puede seguir escribiendo sobre ella.
    const leida = completa({ updated_at: "2026-10-13T14:00:00.000Z" });
    sembrar([leida]);
    await expect(aplicarTransicion(leida, PERFIL_CONSULTORA, { a_estado: "aprobada" })).rejects.toThrow(/no se cambió porque su historial no se pudo guardar/);
    expect(base.tablas.iniciativas![0]).toMatchObject({ estado: "propuesta", updated_at: "2026-10-13T14:00:00.000Z" });
  });

  it("si el historial no entra y tampoco se puede deshacer el cambio, se dice que quedó sin historial", async () => {
    base.fallar.iniciativa_historial = { op: "insert", mensaje: "sin espacio" };
    base.fallar.iniciativas = { op: "update", mensaje: "conexión perdida", saltar: 1 };
    await expect(aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "aprobada" })).rejects.toThrow(/quedó cambiada SIN su fila de historial y no se pudo devolver a como estaba \(conexión perdida\).*sin espacio/);
  });

  it("si otra persona la editó entretanto (mismo estado, otra versión), no se pisa: no se aprueba una ficha que acaba de cambiar", async () => {
    const leida = completa({ updated_at: "2026-10-13T14:00:00.000Z" });
    sembrar([leida]);
    // Entre la lectura y la escritura alguien le quitó los recursos: sigue en «propuesta», pero ya es otra versión.
    Object.assign(base.tablas.iniciativas![0]!, { recursos: null, updated_at: "2026-10-13T14:00:05.000Z" });
    await expect(aplicarTransicion(leida, PERFIL_CONSULTORA, { a_estado: "aprobada" })).rejects.toThrow(/Otra persona cambió esta iniciativa/);
    expect(base.tablas.iniciativas![0]).toMatchObject({ estado: "propuesta", recursos: null, updated_at: "2026-10-13T14:00:05.000Z" });
    expect(escriturasEn("iniciativa_historial")).toEqual([]);
    // Tampoco una fuente añadida a la vez borra la que otra persona acaba de registrar.
    await expect(modificarIniciativa(leida, PERFIL_CONSULTORA, { fuente_aportada: FUENTE })).rejects.toThrow(/Otra persona cambió esta iniciativa/);
    expect(base.tablas.iniciativas![0]!.fuentes_aportadas).toEqual([]);
    expect(escriturasEn("iniciativa_historial")).toEqual([]);
  });

  it("un hallazgo sin revisar, provisional o rechazado no vale como único sustento para aprobar (R10.4)", async () => {
    const casos: [Fila, RegExp][] = [
      [{ estado_revision: "pendiente" }, /cita todavía falta: «Seis de cada diez clientes no vuelven» \(el hallazgo está sin revisar\)/],
      [{ estado_revision: null }, /el hallazgo está sin revisar/],
      [{ estado_revision: "aprobado", provisional: true }, /el hallazgo es provisional/],
      [{ estado_revision: "corregido", provisional: true }, /el hallazgo es provisional/],
      [{ estado_revision: "rechazado" }, /el hallazgo fue rechazado/],
    ];
    for (const [marca, porQue] of casos) {
      sembrar();
      Object.assign(base.tablas.findings![0]!, marca);
      base.escrituras = [];
      await expect(aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "aprobada" }), JSON.stringify(marca)).rejects.toThrow(porQue);
      expect(base.escrituras, JSON.stringify(marca)).toEqual([]);
      expect(base.tablas.iniciativas![0]!.estado, JSON.stringify(marca)).toBe("propuesta");
    }
    // Revisado por una persona y no provisional: sí sustenta.
    sembrar();
    Object.assign(base.tablas.findings![0]!, { estado_revision: "corregido", provisional: false });
    await expect(aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "aprobada" })).resolves.toMatchObject({ estado: "aprobada" });
  });

  it("con otro sustento que sí vale, el hallazgo sin revisar es un aviso y no un freno", async () => {
    const conFuente = registrarFuenteAportada(completa(), FUENTE, "2026-10-13");
    if (!conFuente.ok) throw new Error(conFuente.error);
    sembrar([conFuente.iniciativa]);
    Object.assign(base.tablas.findings![0]!, { estado_revision: "pendiente" });
    const r = await aplicarTransicion(conFuente.iniciativa, PERFIL_CONSULTORA, { a_estado: "aprobada" });
    expect(r.estado).toBe("aprobada");
    expect(r.aviso).toMatch(/Cita una evidencia que todavía falta: «Seis de cada diez clientes no vuelven» \(el hallazgo está sin revisar\)/);
  });

  it("criterios en porcentaje con un indicador «de cada 10»: decidir no anota un criterio cumplido que no lo es", async () => {
    const i = completa({ estado: "en_curso", criterio_continuar: "al menos 70%", criterio_ajustar: "entre 40% y 69%", criterio_detener: "menos de 40%" });
    sembrar([i]);
    Object.assign(base.tablas.indicadores![0]!, { valor_actual: 7 });
    const r = await aplicarTransicion(i, PERFIL_CONSULTORA, { a_estado: "continuar", motivo: MOTIVO, ...OBSERVADO });
    expect(r.aviso, "no hay «se decide distinto del criterio»: ningún criterio se pudo comparar").toBeNull();
    const anotado = base.tablas.iniciativa_historial![0]!.evidencia as Fila;
    expect(anotado).toMatchObject({ valor_indicador: 7, criterio_que_se_cumple: null, coincide_con_el_criterio: null });
    expect(String(anotado.evaluacion)).toMatch(/^Hay dato \(7 de cada 10 [^)]*\)\), pero los tres criterios están en otra unidad que el dato/);
  });

  it("un valor escrito a mano con su unidad tampoco se compara con criterios de otra", async () => {
    const sinIndicador = completa({ estado: "en_curso", indicador_id: null });
    sembrar([sinIndicador]);
    await aplicarTransicion(sinIndicador, PERFIL_CONSULTORA, { a_estado: "continuar", motivo: MOTIVO, ...OBSERVADO, valor_observado: "70%" });
    expect(base.tablas.iniciativa_historial![0]!.evidencia).toMatchObject({ valor_indicador: 70, criterio_que_se_cumple: null, coincide_con_el_criterio: null });
  });

  it("si otra persona la cambió entretanto, no se pisa", async () => {
    base.tablas.iniciativas![0]!.estado = "cerrada";
    await expect(aplicarTransicion(completa(), PERFIL_CONSULTORA, { a_estado: "aprobada" })).rejects.toThrow(/Otra persona cambió esta iniciativa/);
    expect(base.tablas.iniciativas![0]!.estado).toBe("cerrada");
    expect(escriturasEn("iniciativa_historial")).toEqual([]);
  });

  it("decidir toma el valor del indicador de la base y lo deja en el historial", async () => {
    sembrar([completa({ estado: "en_curso" })]);
    const r = await aplicarTransicion(completa({ estado: "en_curso" }), PERFIL_CONSULTORA, { a_estado: "continuar", motivo: MOTIVO, ...OBSERVADO });
    expect(r.aviso).toBeNull();
    expect(base.tablas.iniciativa_historial![0]!.evidencia).toMatchObject({ valor_indicador: 3.5, periodo: "2026-09", criterio_que_se_cumple: "continuar", coincide_con_el_criterio: true });
  });

  it("si el indicador no tiene dato, la decisión queda anotada como tomada sin dato: no se inventa un valor", async () => {
    sembrar([completa({ estado: "en_curso" })]);
    Object.assign(base.tablas.indicadores![0]!, { valor_actual: null, valor_actual_periodo: null, estado_validacion: null });
    const r = await aplicarTransicion(completa({ estado: "en_curso" }), PERFIL_CONSULTORA, { a_estado: "detener", motivo: "Nadie contesta las llamadas", que_se_observo: "En tres semanas no contestó ningún cliente" });
    expect(r.aviso).toMatch(/Se decide sin dato del indicador/);
    expect(base.tablas.iniciativa_historial![0]!.evidencia).toMatchObject({ valor_indicador: null, evaluacion: "sin dato para evaluar", criterio_que_se_cumple: null });
  });

  it("un valor escrito a mano solo vale si no hay indicador enlazado, y tiene que ser un número", async () => {
    sembrar([completa({ estado: "en_curso" })]);
    await expect(aplicarTransicion(completa({ estado: "en_curso" }), PERFIL_CONSULTORA, { a_estado: "continuar", motivo: MOTIVO, ...OBSERVADO, valor_observado: "4" })).rejects.toThrow(/tiene un indicador enlazado/);
    const sinIndicador = completa({ estado: "en_curso", indicador_id: null });
    sembrar([sinIndicador]);
    await expect(aplicarTransicion(sinIndicador, PERFIL_CONSULTORA, { a_estado: "continuar", motivo: MOTIVO, ...OBSERVADO, valor_observado: "bastantes" })).rejects.toThrow(/no se entiende como número/);
    expect(base.escrituras).toEqual([]);
    await aplicarTransicion(sinIndicador, PERFIL_CONSULTORA, { a_estado: "continuar", motivo: MOTIVO, ...OBSERVADO, valor_observado: "4" });
    expect(base.tablas.iniciativa_historial![0]!.evidencia).toMatchObject({ valor_indicador: 4, criterio_que_se_cumple: "continuar" });
  });
});

describe("crear y modificar (con dobles de la base)", () => {
  const datos = { dominio: "retencion", titulo: "Llamar a quien no volvió", hipotesis: "Si llamamos a quien no vuelve, 3 de cada 10 regresan", medida_exito: "Clientes que vuelven, de cada 10 llamados" };

  it("crear guarda la propuesta y su fila de historial", async () => {
    sembrar([]);
    const r = await crearIniciativa(EMP, PERFIL_CONSULTORA, { ...datos, responsable_participant_id: PER, indicador_id: IND, evidencia_ids: [EV1] });
    expect(r.aviso).toBeNull();
    expect(base.tablas.iniciativas![0]).toMatchObject({ company_id: EMP, estado: "propuesta", creada_por: U_CONSULTORA, responsable_participant_id: PER });
    expect(base.tablas.iniciativa_historial![0]).toMatchObject({ iniciativa_id: r.iniciativa.id, de_estado: null, a_estado: "propuesta" });
  });

  it("no se enlaza una persona, un indicador ni una evidencia de otra empresa", async () => {
    sembrar([]);
    const ajeno = "000000ff-0000-4000-8000-0000000000ff";
    await expect(crearIniciativa(EMP, PERFIL_CONSULTORA, { ...datos, responsable_participant_id: ajeno })).rejects.toThrow(/Esa persona no es de esta empresa/);
    await expect(crearIniciativa(EMP, PERFIL_CONSULTORA, { ...datos, indicador_id: ajeno })).rejects.toThrow(/Ese indicador no es de esta empresa/);
    await expect(crearIniciativa(EMP, PERFIL_CONSULTORA, { ...datos, evidencia_ids: [EV1, ajeno] })).rejects.toThrow(/Una evidencia no es de esta empresa/);
    expect(base.escrituras).toEqual([]);
  });

  it("editar una aprobada sin la autoridad de aprobar se deniega y no escribe", async () => {
    const aprobada = completa({ estado: "aprobada" });
    sembrar([aprobada]);
    await expect(modificarIniciativa(aprobada, PERFIL_SIN_AUTORIDAD, { cambios: { plazo_fin: "2026-12-31" }, motivo: "La campaña retrasa las llamadas" })).rejects.toBeInstanceOf(AccesoDenegado);
    expect(base.escrituras).toEqual([]);
    await modificarIniciativa(aprobada, PERFIL_CONSULTORA, { cambios: { plazo_fin: "2026-12-31" }, motivo: "La campaña retrasa las llamadas" });
    expect(base.tablas.iniciativas![0]!.plazo_fin).toBe("2026-12-31");
    expect(base.tablas.iniciativa_historial![0]).toMatchObject({ de_estado: "aprobada", a_estado: "aprobada", motivo: "La campaña retrasa las llamadas" });
  });

  it("una fuente mal dada no deja la edición a medias: no se escribe ni lo uno ni lo otro", async () => {
    await expect(modificarIniciativa(completa(), PERFIL_CONSULTORA, { cambios: { titulo: "Otro título más claro" }, fuente_aportada: { ...FUENTE, que_dice: "" } })).rejects.toThrow(/qué dice la fuente/);
    expect(base.escrituras).toEqual([]);
    const r = await modificarIniciativa(completa(), PERFIL_CONSULTORA, { cambios: { titulo: "Otro título más claro" }, fuente_aportada: FUENTE });
    expect(r.historialIds).toHaveLength(2);
    expect(base.tablas.iniciativas![0]).toMatchObject({ titulo: "Otro título más claro" });
    expect(base.tablas.iniciativas![0]!.fuentes_aportadas).toHaveLength(1);
  });

  it("una edición y una fuente en la misma petición se escriben una sobre la otra, sin tropezar con su propia versión", async () => {
    const leida = completa({ updated_at: "2026-10-13T14:00:00.000Z" });
    sembrar([leida]);
    const r = await modificarIniciativa(leida, PERFIL_CONSULTORA, { cambios: { titulo: "Otro título más claro" }, fuente_aportada: FUENTE });
    expect(r.historialIds).toHaveLength(2);
    expect(base.tablas.iniciativas![0]).toMatchObject({ titulo: "Otro título más claro" });
    expect(base.tablas.iniciativas![0]!.fuentes_aportadas).toHaveLength(1);
    expect(base.tablas.iniciativas![0]!.updated_at).not.toBe("2026-10-13T14:00:00.000Z");
  });
});

describe("lecturas (con dobles de la base)", () => {
  it("al dueño solo le sale lo aprobado y lo que está en curso, y se pide así a la base", async () => {
    sembrar(ESTADOS.map((estado, n) => completa({ id: `000000a${n}-0000-4000-8000-0000000000a${n}`, estado, titulo: `Iniciativa ${estado}` })));
    const filas = await iniciativasDelCliente(EMP);
    expect(filas.map((f) => f.titulo).sort()).toEqual(["Iniciativa ajustar", "Iniciativa aprobada", "Iniciativa continuar", "Iniciativa en_curso"]);
    const pedida = base.consultas.find((c) => c.tabla === "iniciativas")!;
    expect(pedida.filtros, "el filtro por estado va en la consulta, no después").toContain("in:estado:aprobada|en_curso|continuar|ajustar");
    expect(pedida.filtros).toContain("eq:company_id");
    expect(filas[0]!.responsable_puesto).toBe("Encargada de tienda");
    expect(JSON.stringify(filas)).not.toMatch(/Rosa Mamani|dos horas por semana/);
  });

  it("al dueño no le sale nada de otra empresa", async () => {
    sembrar([completa({ estado: "en_curso", company_id: OTRA })]);
    expect(await iniciativasDelCliente(EMP)).toEqual([]);
  });

  it("el tablero de la consultora trae todo: lo que falta, lo que dicen los criterios y el historial", async () => {
    sembrar([completa({ estado: "en_curso" }), completa({ id: "000000a2-0000-4000-8000-0000000000a2", recursos: null, evidencia_ids: [EV2] })]);
    base.tablas.iniciativa_historial = [{ id: "h1", iniciativa_id: INI, de_estado: "aprobada", a_estado: "en_curso", motivo: null, evidencia: null, actor_id: U_CONSULTORA, created_at: "2026-09-01T10:00:00Z", users: { nombre: "Consultora" } }];
    const t = await cargarTablero(EMP);
    if (!t.disponible) throw new Error(t.motivo);
    expect(t.iniciativas).toHaveLength(2);
    expect(t.iniciativas[0]).toMatchObject({ falta: [], responsable_nombre: "Rosa Mamani", indicador_nombre: "Clientes que vuelven" });
    expect(t.iniciativas[0]!.evaluacion.veredicto).toBe("continuar");
    expect(t.iniciativas[0]!.historial).toEqual([expect.objectContaining({ id: "h1", actor_nombre: "Consultora" })]);
    expect(t.iniciativas[1]!.falta.map((f) => f.campo)).toEqual(["recursos"]);
    expect(t.iniciativas[1]!.pertinencia.puede_avanzar, "cita solo una fuente sin leer").toBe(false);
    expect(t.iniciativas[0]!.pertinencia).toMatchObject({ puede_avanzar: true, no_la_impide: ["«Registro de clientes 2026» (todavía sin leer)"] });
    expect(t.evidencias.map((e) => e.clase).sort()).toEqual(["fuente", "hallazgo"]);
  });

  it("si la base no tiene las tablas, la consultora lo lee; no se finge un tablero vacío", async () => {
    base.sinTabla.add("iniciativas");
    expect(await cargarTablero(EMP)).toEqual({ disponible: false, motivo: SIN_MIGRACION_INICIATIVAS });
    await expect(crearIniciativa(EMP, PERFIL_CONSULTORA, { dominio: "retencion", titulo: "Llamar a quien no volvió", hipotesis: "Si llamamos, tres de cada diez regresan", medida_exito: "Clientes que vuelven a comprar" })).rejects.toBeInstanceOf(SinTablasDeIniciativas);
    expect(await iniciativasDelCliente(EMP), "para el dueño, sin tablas no hay nada aprobado: es verdad").toEqual([]);
  });

  it("si el historial no se puede leer, el tablero falla en voz alta", async () => {
    base.fallar.iniciativa_historial = { op: "select", mensaje: "tiempo agotado" };
    await expect(cargarTablero(EMP)).rejects.toThrow(/No se pudo leer el historial de las iniciativas: tiempo agotado/);
  });

  it("para citar solo se ofrecen hallazgos aprobados o corregidos y no provisionales; uno ya citado que no vale sale con su porqué", async () => {
    const H = (n: number) => `000000e${n}-0000-4000-8000-0000000000f${n}`;
    sembrar();
    base.tablas.findings = [
      { id: EV1, company_id: EMP, titulo: "Citado y sin revisar", estado_revision: "pendiente", provisional: false },
      { id: H(3), company_id: EMP, titulo: "Aprobado", estado_revision: "aprobado", provisional: false },
      { id: H(4), company_id: EMP, titulo: "Corregido, sin la marca", estado_revision: "corregido" },
      { id: H(5), company_id: EMP, titulo: "Aprobado pero provisional", estado_revision: "aprobado", provisional: true },
      { id: H(6), company_id: EMP, titulo: "Pendiente de revisar", estado_revision: "pendiente", provisional: false },
      { id: H(7), company_id: EMP, titulo: "Rechazado", estado_revision: "rechazado", provisional: false },
    ];
    const t = await cargarTablero(EMP);
    if (!t.disponible) throw new Error(t.motivo);
    const hallazgos = t.evidencias.filter((e) => e.clase === "hallazgo");
    expect(hallazgos.map((h) => h.texto).sort()).toEqual(["Aprobado", "Citado y sin revisar", "Corregido, sin la marca"]);
    expect(hallazgos.find((h) => h.id === EV1)!.falta).toBe("el hallazgo está sin revisar");
    expect(hallazgos.filter((h) => h.id !== EV1).map((h) => h.falta)).toEqual([null, null]);
    expect(t.iniciativas[0]!.pertinencia.puede_avanzar, "su único sustento es un hallazgo sin revisar").toBe(false);
    const pedida = base.consultas.find((c) => c.tabla === "findings")!;
    expect(pedida.filtros, "el filtro va en la consulta").toEqual(expect.arrayContaining(["in:estado_revision:aprobado|corregido", "or:provisional.is.null,provisional.eq.false"]));
  });

  it("si a los hallazgos les falta la columna «provisional», se dice qué migración falta y no se culpa a las tablas de iniciativas", async () => {
    base.fallar.findings = { op: "select", mensaje: "column findings.provisional does not exist", code: "42703" };
    const error = await cargarTablero(EMP).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SinTablasDeIniciativas);
    expect((error as Error).message).toMatch(/le falta la columna «provisional».*migracion-evidencia-dimensiones\.sql/);
  });

  it("reconoce cuándo un error dice «no existe» y cuándo es otra cosa", () => {
    expect(faltaEnLaBase({ code: "42P01", message: "x" })).toBe(true);
    expect(faltaEnLaBase({ message: "Could not find the table 'public.iniciativas' in the schema cache" })).toBe(true);
    expect(faltaEnLaBase({ message: "tiempo agotado" })).toBe(false);
    expect(faltaEnLaBase(null)).toBe(false);
  });
});

// ───────────────────────── 12 · LAS RUTAS, CON EL `protegido()` REAL ─────────────────────────

const pedir = (metodo: string, url: string, cuerpo?: unknown) =>
  new Request(`http://prueba.test${url}`, { method: metodo, headers: { "content-type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
const deEmpresa = (id: string) => ({ params: Promise.resolve({ id }) });
const deIniciativa = (id: string, iid: string) => ({ params: Promise.resolve({ id, iid }) });
const NUEVA = { dominio: "retencion", titulo: "Llamar a quien no volvió", hipotesis: "Si llamamos a quien no vuelve, 3 de cada 10 regresan", medida_exito: "Clientes que vuelven, de cada 10 llamados" };

describe("las rutas de iniciativas", () => {
  it("sin sesión: 401 y nada escrito", async () => {
    vi.mocked(perfilApi).mockResolvedValue(null);
    const r = await crearRuta(pedir("POST", `/api/companies/${EMP}/iniciativas`, NUEVA), deEmpresa(EMP));
    expect(r.status).toBe(401);
    expect(base.escrituras).toEqual([]);
  });

  it("el dueño no propone, no edita y no decide: 403 con rastro «denegado», y nada escrito", async () => {
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_DUENO);
    const crear = await crearRuta(pedir("POST", `/api/companies/${EMP}/iniciativas`, NUEVA), deEmpresa(EMP));
    const editarR = await editarRuta(pedir("PATCH", `/api/companies/${EMP}/iniciativas/${INI}`, { titulo: "Cambiado por el dueño" }), deIniciativa(EMP, INI));
    const transitar = await transitarRuta(pedir("POST", `/api/companies/${EMP}/iniciativas/${INI}/transicion`, { a_estado: "aprobada" }), deIniciativa(EMP, INI));
    expect([crear.status, editarR.status, transitar.status]).toEqual([403, 403, 403]);
    expect(base.escrituras).toEqual([]);
    expect(vi.mocked(registrar).mock.calls.map(([e]) => e.accion)).toEqual(["denegado", "denegado", "denegado"]);
  });

  it("GET para el dueño de la empresa: solo lo aprobado y lo que está en curso; la propuesta no viaja", async () => {
    sembrar([completa({ titulo: "Propuesta que el dueño no ve" }), completa({ id: "000000a2-0000-4000-8000-0000000000a2", estado: "en_curso", titulo: "Apuesta en curso" })]);
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_DUENO);
    const r = await leerRuta(pedir("GET", `/api/companies/${EMP}/iniciativas`), deEmpresa(EMP));
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).toContain("Apuesta en curso");
    expect(texto).not.toContain("Propuesta que el dueño no ve");
    expect(Object.keys(JSON.parse(texto))).toEqual(["iniciativas"]);
  });

  it("GET para un dueño de OTRA empresa: 403", async () => {
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_DUENO);
    const r = await leerRuta(pedir("GET", `/api/companies/${OTRA}/iniciativas`), deEmpresa(OTRA));
    expect(r.status).toBe(403);
  });

  it("GET para la consultora: el tablero; y si faltan las tablas, 503 que lo dice", async () => {
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_CONSULTORA);
    const r = await leerRuta(pedir("GET", `/api/companies/${EMP}/iniciativas`), deEmpresa(EMP));
    expect(r.status).toBe(200);
    expect((await r.json()).iniciativas).toHaveLength(1);
    base.sinTabla.add("iniciativas");
    const sin = await leerRuta(pedir("GET", `/api/companies/${EMP}/iniciativas`), deEmpresa(EMP));
    expect(sin.status).toBe(503);
    expect((await sin.json()).error).toBe(SIN_MIGRACION_INICIATIVAS);
  });

  it("POST: la consultora propone (201); de mercado sin fuente ni pendiente, 400 con el porqué", async () => {
    sembrar([]);
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_CONSULTORA);
    const bien = await crearRuta(pedir("POST", `/api/companies/${EMP}/iniciativas`, NUEVA), deEmpresa(EMP));
    expect(bien.status).toBe(201);
    const cuerpo = await bien.json();
    expect(cuerpo.iniciativa.estado).toBe("propuesta");
    expect(cuerpo.falta.map((f: { campo: string }) => f.campo)).toEqual(["evidencia", "recursos", "plazo", "criterio_continuar", "criterio_ajustar", "criterio_detener", "responsable"]);

    const mal = await crearRuta(pedir("POST", `/api/companies/${EMP}/iniciativas`, { ...NUEVA, dominio: "mercado_y_competencia" }), deEmpresa(EMP));
    expect(mal.status).toBe(400);
    expect((await mal.json()).error).toBe(TEXTO_PENDIENTE_MERCADO);
    expect(base.tablas.iniciativas).toHaveLength(1);

    const inventado = await crearRuta(pedir("POST", `/api/companies/${EMP}/iniciativas`, { ...NUEVA, dominio: "ventas" }), deEmpresa(EMP));
    expect(inventado.status).toBe(400);
  });

  it("POST transicion: aprobar incompleta es 400 con lo que falta; completa, 200 y queda aprobada", async () => {
    sembrar([completa({ recursos: null })]);
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_CONSULTORA);
    const mal = await transitarRuta(pedir("POST", `/api/companies/${EMP}/iniciativas/${INI}/transicion`, { a_estado: "aprobada" }), deIniciativa(EMP, INI));
    expect(mal.status).toBe(400);
    expect((await mal.json()).faltan.map((f: { campo: string }) => f.campo)).toEqual(["recursos"]);
    expect(base.escrituras).toEqual([]);

    sembrar();
    const bien = await transitarRuta(pedir("POST", `/api/companies/${EMP}/iniciativas/${INI}/transicion`, { a_estado: "aprobada" }), deIniciativa(EMP, INI));
    expect(bien.status).toBe(200);
    expect((await bien.json()).estado).toBe("aprobada");
    expect(vi.mocked(registrar).mock.calls.map(([e]) => e.accion)).toContain("aprobar");
  });

  it("POST transicion: una consultora sin la autoridad de aprobar recibe 403 y queda rastro", async () => {
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_SIN_AUTORIDAD);
    const r = await transitarRuta(pedir("POST", `/api/companies/${EMP}/iniciativas/${INI}/transicion`, { a_estado: "aprobada" }), deIniciativa(EMP, INI));
    expect(r.status).toBe(403);
    expect(base.escrituras).toEqual([]);
    expect(vi.mocked(registrar).mock.calls.map(([e]) => [e.accion, e.detalle?.motivo])).toEqual([["denegado", "autoridad"]]);
  });

  it("POST transicion: un estado inventado es 400 y no llega a la regla", async () => {
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_CONSULTORA);
    const r = await transitarRuta(pedir("POST", `/api/companies/${EMP}/iniciativas/${INI}/transicion`, { a_estado: "terminada" }), deIniciativa(EMP, INI));
    expect(r.status).toBe(400);
    expect(base.escrituras).toEqual([]);
  });

  it("una iniciativa de otra empresa, o un identificador mal escrito, no existe aquí: 404 y nada escrito", async () => {
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_CONSULTORA);
    const ajena = await editarRuta(pedir("PATCH", `/api/companies/${OTRA}/iniciativas/${INI}`, { titulo: "Cambiada desde otra empresa" }), deIniciativa(OTRA, INI));
    const rota = await transitarRuta(pedir("POST", `/api/companies/${EMP}/iniciativas/no-es-uuid/transicion`, { a_estado: "aprobada" }), deIniciativa(EMP, "no-es-uuid"));
    expect([ajena.status, rota.status]).toEqual([404, 404]);
    expect(base.escrituras).toEqual([]);
  });

  it("PATCH: completa la ficha, añade una fuente, y un cuerpo vacío es 400", async () => {
    sembrar([completa({ recursos: null })]);
    vi.mocked(perfilApi).mockResolvedValue(PERFIL_CONSULTORA);
    const r = await editarRuta(pedir("PATCH", `/api/companies/${EMP}/iniciativas/${INI}`, { recursos: "Una persona, dos horas por semana", fuente_aportada: FUENTE }), deIniciativa(EMP, INI));
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.falta).toEqual([]);
    expect(cuerpo.iniciativa.fuentes_aportadas).toHaveLength(1);
    expect(base.tablas.iniciativa_historial).toHaveLength(2);

    const vacio = await editarRuta(pedir("PATCH", `/api/companies/${EMP}/iniciativas/${INI}`, {}), deIniciativa(EMP, INI));
    expect(vacio.status).toBe(400);
    const estado = await editarRuta(pedir("PATCH", `/api/companies/${EMP}/iniciativas/${INI}`, { estado: "aprobada" }), deIniciativa(EMP, INI));
    expect(estado.status, "el estado no se cambia por PATCH: la clave se descarta y no queda nada que guardar").toBe(400);
    expect(base.tablas.iniciativas![0]!.estado).toBe("propuesta");
  });
});

// ───────────────────────── 13 · LAS PANTALLAS, PINTADAS A TEXTO (sin navegador) ─────────────────────────

describe("las pantallas arman su contenido con datos de ejemplo", () => {
  const HOY = "2026-10-13";
  const ZONA = "America/Lima";
  const AJENO = { faltantes: [{ que: "«Manual de funciones» (todavía sin leer)", id: EV2 }] };
  const HISTORIAL: FilaHistorialLeida[] = [
    { id: "h1", iniciativa_id: INI, de_estado: null, a_estado: "propuesta", motivo: "Se propuso la iniciativa", evidencia: null, actor_id: U_CONSULTORA, actor_nombre: "Ana Quispe", created_at: "2026-08-20T15:00:00Z" },
    {
      id: "h2", iniciativa_id: INI, de_estado: "en_curso", a_estado: "continuar", motivo: "El dueño quiere darle un mes más", actor_id: U_CONSULTORA, actor_nombre: "Ana Quispe", created_at: "2026-10-10T15:00:00Z",
      evidencia: { que_se_observo: "De 40 llamadas volvieron 2", valor_indicador: 0.5, evaluacion: "Con 0.5 se cumple el criterio de detener.", criterio_que_se_cumple: "detener", coincide_con_el_criterio: false },
    },
  ];
  const enCurso = conContexto(completa({ estado: "en_curso" }), { hoy: HOY, indicador: indicador(), levantamiento: AJENO, responsable_nombre: "Rosa Mamani", historial: HISTORIAL });
  const sinDato = conContexto(completa({ id: "000000a2-0000-4000-8000-0000000000a2", estado: "en_curso", titulo: "Probar el horario extendido" }), { hoy: HOY, indicador: indicador({ valor_actual: null }), levantamiento: AJENO });
  const incompleta = conContexto(completa({ id: "000000a3-0000-4000-8000-0000000000a3", titulo: "Subir el precio del polo", dominio: "mercado_y_competencia", recursos: null, criterio_detener: null }), { hoy: HOY, levantamiento: AJENO });
  const vencida = conContexto(completa({ id: "000000a4-0000-4000-8000-0000000000a4", estado: "en_curso", titulo: "Vender por catálogo", dominio: "adquisicion", plazo_fin: "2026-09-30" }), { hoy: HOY });
  const tablero: Extract<Tablero, { disponible: true }> = {
    disponible: true, hoy: HOY, zona: ZONA, iniciativas: [enCurso, sinDato, incompleta, vencida],
    participantes: [{ id: PER, nombre: "Rosa Mamani", puesto: "Encargada de tienda" }],
    indicadores: [{ id: IND, nombre: "Clientes que vuelven", unidad: "de_cada_10" }],
    evidencias: [{ id: EV1, clase: "hallazgo", texto: "Seis de cada diez clientes no vuelven", falta: null }, { id: EV2, clase: "fuente", texto: "Manual de funciones", falta: "todavía sin leer" }],
  };
  const comunes = { companyId: EMP, participantes: tablero.participantes, indicadores: tablero.indicadores, evidencias: tablero.evidencias, hoy: HOY, zona: ZONA, onCambio: () => {} };
  const pintar = (i: typeof enCurso) => renderToStaticMarkup(createElement(DetalleIniciativa, { ...comunes, iniciativa: i }));
  const APROBAR_APAGADO = /<button[^>]*disabled=""[^>]*>Aprobar<\/button>/;

  it("el tablero muestra los quince temas con su pregunta, las iniciativas en su tema y el resumen de arriba", () => {
    const html = renderToStaticMarkup(createElement(TableroIniciativas, { companyId: EMP, tablero }));
    for (const d of DOMINIOS) {
      expect(html, d.clave).toContain(d.nombre);
      expect(html, d.clave).toContain(d.tecnico);
    }
    expect(html).toContain("Llamar a quien no volvió");
    expect(html).toContain("Plazo cumplido: toca decidir");
    expect(html).toContain("Sin dato para evaluar");
    expect(html).toContain("Ficha: 7 de 10");
    expect(html.match(/Ninguna iniciativa en este tema\./g)).toHaveLength(12);
    expect(html.match(/Proponer una iniciativa en este tema/g)).toHaveLength(15);
  });

  it("una propuesta incompleta dice qué le falta y tiene el botón de aprobar apagado", () => {
    const html = pintar(incompleta);
    expect(html).toContain("PARA APROBARLA FALTA");
    expect(html).toContain("Recursos.");
    expect(html).toContain("Criterio para detener.");
    expect(html).toContain("Pendiente de investigar.");
    expect(html).toContain("No se inventa mercado ni competidores");
    expect(html).toMatch(APROBAR_APAGADO);
    expect(html).toContain(">Descartar</button>");
    expect(html).toContain("no la impide");
  });

  it("una propuesta completa tiene el botón de aprobar encendido", () => {
    const html = pintar(conContexto(completa(), { hoy: HOY, levantamiento: AJENO }));
    expect(html).toContain("La ficha está completa: se puede aprobar");
    expect(html).not.toMatch(APROBAR_APAGADO);
    expect(html).toContain(">Aprobar</button>");
  });

  it("una en curso ofrece continuar, ajustar y detener, y lee los criterios con el dato", () => {
    const html = pintar(enCurso);
    for (const boton of ["Continuar", "Ajustar", "Detener"]) expect(html, boton).toContain(`>${boton}</button>`);
    expect(html).not.toContain(">Aprobar</button>");
    expect(html).toMatch(/Con 3[.,]5 de cada 10 \([^)]*\) se cumple el criterio de continuar\./);
    expect(html).toContain("se lee como: 3 de cada 10 o más");
    expect(html).toContain("lo declaró la empresa");
    expect(html).toContain("Es una lectura del dato, no una decisión");
    expect(html).toContain("Se decidió distinto de lo que decía el criterio.");
    expect(html).toContain("Ana Quispe");
  });

  it("sin dato del indicador no se pinta ningún veredicto", () => {
    const html = pintar(sinDato);
    expect(html).toContain("Sin dato para evaluar.");
    expect(html).toContain("todavía no tiene ningún valor registrado");
    expect(html).not.toMatch(/se cumple el criterio de/);
    expect(html).not.toContain("· se cumple");
    expect(html).not.toContain("· no se cumple");
  });

  it("criterios en otra unidad que el indicador: se dice junto a cada uno y no se pinta ningún veredicto", () => {
    const otra = conContexto(completa({ estado: "en_curso", criterio_continuar: "al menos 70%", criterio_ajustar: "entre 40% y 69%", criterio_detener: "menos de 40%" }), { hoy: HOY, indicador: indicador({ valor_actual: 7 }) });
    const html = pintar(otra);
    expect(html).toContain("pero los tres criterios están en otra unidad que el dato: los evalúa una persona.");
    // Tres veces en «qué dicen los criterios» y tres en la ficha, que es donde se corrige.
    expect(html.match(/el dato se mide en «de cada 10», no en «porcentaje»: lo evalúa una persona/g)).toHaveLength(6);
    expect(html).not.toMatch(/se cumple el criterio de/);
    expect(html).not.toContain("· se cumple");
    expect(html).not.toContain("· no se cumple");
    const lista = renderToStaticMarkup(createElement(TableroIniciativas, { companyId: EMP, tablero: { ...tablero, iniciativas: [otra] } }));
    expect(lista).not.toContain("El dato apunta a");
    // En la misma unidad el tablero sí lo dice: la prueba de arriba no pasa por estar vacía.
    expect(renderToStaticMarkup(createElement(TableroIniciativas, { companyId: EMP, tablero: { ...tablero, iniciativas: [enCurso] } }))).toContain("El dato apunta a continuar");
  });

  it("una con el plazo cumplido lo dice", () => {
    expect(pintar(vencida)).toMatch(/El plazo se cumplió el 30 [^:]*: toca decidir/);
  });

  it("el historial dice quién, qué pasó, por qué y qué se observó, lo más reciente arriba", () => {
    const html = renderToStaticMarkup(createElement(HistorialIniciativa, { historial: HISTORIAL, zona: ZONA }));
    expect(html).toContain("la pasó de «En curso» a «Se decidió continuar»");
    expect(html.indexOf("la pasó de")).toBeLessThan(html.indexOf("propuso la iniciativa"));
    expect(html).toContain("De 40 llamadas volvieron 2");
    expect(html).toContain("El dueño quiere darle un mes más");
    expect(renderToStaticMarkup(createElement(HistorialIniciativa, { historial: [], zona: ZONA }))).toContain("Sin historial todavía.");
  });

  it("la pantalla del dueño dice qué creemos, cómo sabremos y hasta cuándo, sin jerga y sin nada interno", () => {
    const filas = [enCurso, sinDato].map((i) => filaCliente({ ...i, decision_motivo: "Motivo interno de la consultora" }, { indicador: indicador(), responsable_puesto: "Encargada de tienda" })!);
    const html = renderToStaticMarkup(createElement(LoQueEstamosProbando, { iniciativas: filas }));
    for (const texto of ["Qué creemos que va a pasar", "Cómo sabremos si funcionó", "Hasta cuándo lo probamos", "Seguimos si:", "Cambiamos algo si:", "Paramos si:", "Lo lleva: Encargada de tienda", "Llamar a quien no volvió"]) expect(html, texto).toContain(texto);
    expect(html).not.toMatch(/Motivo interno|Rosa Mamani|dos horas por semana|hipótesis|criterio|KPI|indicador/i);
    expect(html.match(/Este dato: lo declaró la empresa\./g), "de dónde sale el número, en las dos apuestas").toHaveLength(2);
    const conSignos = filaCliente({ ...enCurso, criterio_continuar: "≥ 3" }, { indicador: indicador() })!;
    const pintada = renderToStaticMarkup(createElement(LoQueEstamosProbando, { iniciativas: [conSignos] }));
    expect(pintada).toContain("3 de cada 10 o más");
    expect(pintada).not.toContain("≥");
    expect(html).not.toContain(U_CONSULTORA);
    expect(html).not.toContain(EV1);
  });
});
