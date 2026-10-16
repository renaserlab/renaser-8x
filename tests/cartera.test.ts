/**
 * LA CARTERA: LA VISTA DE DIRECCIÓN DE RENASER (R16.1) — con dobles.
 *
 * Una empresa por fila: quién la lleva, qué se contrató, en qué fase del método está, qué prioridades tiene,
 * cuál es la próxima decisión, qué compromisos y entregas hay, qué está bloqueado, si ya hay un resultado medido
 * y cómo queda repartida la carga. Estas pruebas cuidan seis reglas:
 *
 *  1. LA ETAPA DEL SISTEMA NO ES LA FASE DEL MÉTODO: se traduce, y «El Espejo» se separa con hechos contados.
 *  2. LA PRÓXIMA DECISIÓN SALE AUNQUE NADIE LA ESCRIBA: la acción propuesta más antigua, la semana sin explicar,
 *     el corte que la empresa no aceptó. Una decisión escrita no tapa lo que el sistema ve.
 *  3. LOS BLOQUEOS SON TRES COSAS DISTINTAS Y SE CUENTAN LAS TRES: acciones, fuentes atascadas, trabajos fallidos.
 *  4. SIN CORTE NO HAY RESULTADO, y cuando lo hay se lee con `lecturaDeCorte`, la misma lectura del dueño.
 *  5. NO SABER NO ES CERO: lo que no se pudo leer sale «sin dato» con su motivo.
 *  6. SE CUENTAN COSAS: en ninguna fila ni en la pantalla hay un porcentaje de avance.
 *
 * Aquí no hay base real: `supabaseAdmin()` es una base falsa en memoria (filtros, páginas, actualización y
 * columnas que «no existen» para simular una migración sin aplicar). Las pantallas se pintan en el servidor con
 * `renderToStaticMarkup`; ninguna se abrió en un navegador ni contra la base de producción.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type ErrorFalso = { message: string; code?: string };
type OpcionesBase = { faltan?: Record<string, string[]>; errores?: Record<string, ErrorFalso> };

/**
 * Una base en memoria con lo que la cartera usa de PostgREST: `select` (con columnas que pueden no existir),
 * `eq`, `in`, `order`, `range`, `limit`, `update`, `maybeSingle`, `single`. Anota cuántas veces se pidió cada
 * tabla y con qué páginas, para probar que la cartera no hace una consulta por empresa.
 */
function crearBase(tablas: Record<string, Fila[]>, opciones: OpcionesBase = {}) {
  const llamadas: Record<string, number> = {};
  const rangos: Record<string, [number, number][]> = {};
  const escrituras: { tabla: string; valores: Fila }[] = [];
  const from = (tabla: string) => {
    llamadas[tabla] = (llamadas[tabla] ?? 0) + 1;
    const filtros: ((f: Fila) => boolean)[] = [];
    let columnas = "*";
    let desde = 0;
    let hasta = Number.POSITIVE_INFINITY;
    let tope = Number.POSITIVE_INFINITY;
    let cambio: Fila | null = null;
    const error = (): ErrorFalso | null => {
      const fijo = opciones.errores?.[tabla];
      if (fijo) return fijo;
      const pedidas = columnas.split(",").map((c) => c.trim());
      const falta = (opciones.faltan?.[tabla] ?? []).find((c) => pedidas.includes(c) || (cambio != null && c in cambio));
      return falta ? { code: "42703", message: `column ${tabla}.${falta} does not exist` } : null;
    };
    const resolver = (): { data: Fila[] | null; error: ErrorFalso | null } => {
      const e = error();
      if (e) return { data: null, error: e };
      const filas = (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
      if (cambio) {
        for (const f of filas) Object.assign(f, cambio);
        escrituras.push({ tabla, valores: cambio });
      }
      const orden = [...filas].sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
      return { data: orden.slice(desde, Math.min(hasta + 1, desde + tope)), error: null };
    };
    const q = {
      select: (c: string) => { columnas = c; return q; },
      eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filtros.push((f) => vs.includes(k === "payload->>source_id" ? f.payload?.source_id : f[k])); return q; },
      order: () => q,
      range: (d: number, h: number) => { desde = d; hasta = h; (rangos[tabla] ??= []).push([d, h]); return q; },
      limit: (n: number) => { tope = n; return q; },
      update: (v: Fila) => { cambio = v; return q; },
      maybeSingle: async () => {
        const r = resolver();
        return r.error ? r : { data: r.data?.[0] ?? null, error: null };
      },
      single: async () => {
        const r = resolver();
        if (r.error) return r;
        return r.data?.[0] ? { data: r.data[0], error: null } : { data: null, error: { code: "PGRST116", message: "no rows" } };
      },
      then: (bien: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(bien, mal),
    };
    return q;
  };
  return { from, llamadas, rangos, escrituras, tablas };
}
type BaseFalsa = ReturnType<typeof crearBase>;

const h = vi.hoisted(() => ({ base: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => h.base }));
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, restantes: 99, reiniciaEn: 0 })),
}));

import {
  FASES_METODO, NOMBRE_FASE, FASE_POR_ETAPA, SIN_FASE_NOMBRE, SIN_CORTE, SIN_CONSULTOR, SIN_NIVEL, SIN_MIGRACION_CARTERA, FILTRO_SIN_ASIGNAR, FILTRO_SIN_FASE, PAGINA,
  faseDeEtapa, filaCartera, ordenar, filtrar, filtroDe, cargaPorConsultor, resumenCartera, datosVacios, diasEntre, esActiva, faltaEnLaBase, cargarCartera,
  type AccionCartera, type DatosCartera, type EmpresaCartera, type FilaCartera,
} from "@/lib/cartera";
import { lecturaDeCorte, type AccionLigada, type Medicion } from "@/lib/medicion";
import { nombreDeSemana } from "@/lib/revision-semanal";
import { ETAPA } from "@/lib/textos";
import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { cambiosDeAsignacion, errorDeAsignacion, ERROR_FECHA_SIN_DECISION, type Asignacion } from "@/components/cartera/AsignarCartera";
import { cuandoDecision } from "@/components/cartera/TablaCartera";
import { cuandoVence } from "@/components/cartera/DetalleFila";
import { GET as leerCartera } from "@/app/api/consultor/cartera/route";
import { PATCH as asignar } from "@/app/api/companies/[id]/cartera/route";
import PaginaCartera from "@/app/(consultor)/cartera/page";

// ───────────────────────── LO QUE SE USA EN TODAS ─────────────────────────

/** Martes. La última semana que ya terminó es la del lunes 5 de octubre. */
const HOY = "2026-10-13";
const SEMANA = "2026-10-05";
const AHORA = new Date("2026-10-13T17:00:00Z");

const id = (letra: string, n: number) => `${letra.repeat(8)}-${letra.repeat(4)}-4${letra.repeat(3)}-8${letra.repeat(3)}-${letra.repeat(11)}${n}`;
const E1 = id("e", 1);
const E2 = id("e", 2);
const E3 = id("e", 3);
const ANA = id("a", 1);
const BRUNO = id("a", 2);
const CARLA = id("a", 3);
const DUENO_ID = id("d", 1);

const CONSULTORES = [
  { id: ANA, nombre: "Ana Quispe", email: "ana@ejemplo.test" },
  { id: BRUNO, nombre: "Bruno Mamani", email: "bruno@ejemplo.test" },
  { id: CARLA, nombre: null, email: "carla@ejemplo.test" },
];

const empresa = (extra: Partial<EmpresaCartera> = {}): EmpresaCartera => ({ id: E1, nombre: "Panadería San Blas", etapa: "implementacion", estado_admision: "admitida", ...extra });
const datos = (extra: Partial<DatosCartera> = {}): DatosCartera => ({ ...datosVacios(HOY, SEMANA), consultores: CONSULTORES, ...extra });
const accion = (n: number, extra: Partial<AccionCartera> = {}): AccionCartera => ({ id: `accion-${n}`, accion: `Acción ${n}`, estado: "propuesto", updated_at: "2026-10-01T15:00:00Z", ...extra });

const abril = { periodo_desde: "2026-04-01", periodo_hasta: "2026-04-30" };
const julio = { periodo_desde: "2026-07-01", periodo_hasta: "2026-07-31" };
const lineaBase = (extra: Partial<Medicion> = {}): Medicion => ({
  id: "base-1", tipo: "linea_base", numero: 0, fecha: "2026-05-01", valores: { venta_mes: 40000, ganancia_mes: 4000 }, derivados: {}, nota: null, version: 1, vigente: true, ...abril, ...extra,
});
const corte = (numero: number, extra: Partial<Medicion> = {}): Medicion => ({
  id: `corte-${numero}`, tipo: "corte", numero, fecha: "2026-08-01", valores: { venta_mes: 48000, ganancia_mes: 6000 }, derivados: {}, nota: null, linea_base_id: "base-1", ...julio, ...extra,
});

const CONSULTORA: Perfil = { id: ANA, email: "ana@ejemplo.test", nombre: "Ana Quispe", rol: "consultor" };
const DUENO: Perfil = { id: DUENO_ID, email: "dueno@ejemplo.test", nombre: "Dueño", rol: "cliente" };

beforeEach(() => {
  h.base = crearBase({});
  vi.mocked(perfilApi).mockReset();
  vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
  vi.mocked(registrar).mockClear();
});

// ───────────────────────── 1 · LA FASE ─────────────────────────

describe("la fase del método: la etapa del sistema, traducida", () => {
  it("son las ocho fases del método, con su nombre", () => {
    expect(FASES_METODO.map((f) => NOMBRE_FASE[f])).toEqual(["Comprensión", "Radiografía", "Dirección", "Priorización", "Plan", "Implementación", "Medición", "Aprendizaje"]);
  });

  it("cada una de las ocho etapas de companies.etapa cae en una fase", () => {
    const esperado: Record<string, string> = {
      admision: "Comprensión", levantamiento: "Comprensión", contraste: "Radiografía", diagnostico: "Radiografía",
      espejo: "Dirección", implementacion: "Implementación", monitoreo: "Medición", cerrado: "Aprendizaje",
    };
    expect(Object.keys(FASE_POR_ETAPA).sort()).toEqual(Object.keys(esperado).sort());
    for (const [etapa, nombre] of Object.entries(esperado)) expect(faseDeEtapa(etapa, { propuestasSinAprobar: 0, aprobadas: 0 }).nombre, etapa).toBe(nombre);
  });

  it("«El Espejo» cubre tres fases y se separa con lo que hay en el plan: sin nada, Dirección; con propuestas, Priorización; con algo aprobado, Plan", () => {
    expect(faseDeEtapa("espejo", { propuestasSinAprobar: 0, aprobadas: 0 }).clave).toBe("direccion");
    const priorizando = faseDeEtapa("espejo", { propuestasSinAprobar: 3, aprobadas: 0 });
    expect(priorizando.clave).toBe("priorizacion");
    expect(priorizando.porQue).toContain("3 acciones propuestas sin aprobar");
    const conPlan = faseDeEtapa("espejo", { propuestasSinAprobar: 3, aprobadas: 1 });
    expect(conPlan.clave).toBe("plan");
    expect(conPlan.porQue).toContain("1 acción aprobada");
    expect(conPlan.etapaNombre).toBe(ETAPA.espejo);
  });

  it("si el plan no se pudo leer se queda en Dirección y lo dice: no supone que ya se priorizó", () => {
    const f = faseDeEtapa("espejo", null);
    expect(f.clave).toBe("direccion");
    expect(f.porQue).toMatch(/No se pudo leer el plan/);
  });

  it("fuera de «El Espejo» el plan no mueve la fase", () => {
    expect(faseDeEtapa("levantamiento", { propuestasSinAprobar: 5, aprobadas: 5 }).clave).toBe("comprension");
    expect(faseDeEtapa("monitoreo", { propuestasSinAprobar: 5, aprobadas: 0 }).clave).toBe("medicion");
  });

  it("una etapa vacía o desconocida no se convierte en ninguna fase", () => {
    for (const etapa of [null, undefined, "", "   ", "produccion", "constructor", "toString"]) {
      const f = faseDeEtapa(etapa);
      expect(f.clave, String(etapa)).toBeNull();
      expect(f.nombre).toBe(SIN_FASE_NOMBRE);
    }
    expect(faseDeEtapa("produccion").porQue).toContain("«produccion»");
  });

  it("la fila cuenta ella misma lo que hay en el plan (los estados antiguos se leen como su equivalente)", () => {
    const enEspejo = empresa({ etapa: "espejo" });
    expect(filaCartera(enEspejo, datos()).fase.nombre).toBe("Dirección");
    expect(filaCartera(enEspejo, datos({ acciones: [accion(1, { estado: "pendiente" })] })).fase.nombre).toBe("Priorización");
    expect(filaCartera(enEspejo, datos({ acciones: [accion(1), accion(2, { estado: "en_curso" })] })).fase.nombre).toBe("Plan");
    expect(filaCartera(enEspejo, datos({ acciones: null })).fase.porQue).toMatch(/No se pudo leer el plan/);
  });
});

// ───────────────────────── 2 · EMPRESA, CONSULTOR, NIVEL Y ALCANCE ─────────────────────────

describe("empresa, consultor, nivel y alcance", () => {
  it("muestra a quién está asignada, el nivel y el alcance tal como se guardaron", () => {
    const f = filaCartera(empresa({ consultor_responsable_id: BRUNO, nivel_contratado: "nivel_2", alcance_contratado: "  Ordenar caja y compras  " }), datos());
    expect(f.empresa).toMatchObject({ id: E1, nombre: "Panadería San Blas", href: `/empresa/${E1}`, activa: true });
    expect(f.consultor).toEqual({ id: BRUNO, nombre: "Bruno Mamani", conocido: true });
    expect(f.nivel).toEqual({ clave: "nivel_2", nombre: "Nivel 2" });
    expect(f.alcance).toBe("Ordenar caja y compras");
    expect(f.asignacionSinDato).toBeNull();
  });

  it("sin asignar es sin asignar: no se le pone un consultor ni un nivel por defecto", () => {
    const f = filaCartera(empresa(), datos());
    expect(f.consultor).toBeNull();
    expect(f.nivel).toEqual({ clave: null, nombre: SIN_NIVEL });
    expect(f.alcance).toBeNull();
  });

  it("un consultor sin nombre sale por su correo, y uno que ya no figura se dice", () => {
    expect(filaCartera(empresa({ consultor_responsable_id: CARLA }), datos()).consultor).toEqual({ id: CARLA, nombre: "carla@ejemplo.test", conocido: true });
    const fantasma = id("f", 9);
    expect(filaCartera(empresa({ consultor_responsable_id: fantasma }), datos()).consultor).toEqual({ id: fantasma, nombre: "Consultor no encontrado", conocido: false });
  });

  it("un nivel que no es de la lista no se disfraza de Nivel 1", () => {
    expect(filaCartera(empresa({ nivel_contratado: "premium" }), datos()).nivel).toEqual({ clave: null, nombre: "Valor no reconocido: premium" });
  });

  it("sin la migración de cartera no hay consultor, nivel, alcance ni decisión escrita: se dice por qué y no se muestra nada de eso", () => {
    const f = filaCartera(empresa({ consultor_responsable_id: ANA, nivel_contratado: "nivel_1", alcance_contratado: "Todo", proxima_decision: "Renovar", proxima_decision_fecha: "2026-10-20" }), datos({ conAsignacion: false }));
    expect(f.asignacionSinDato).toBe(SIN_MIGRACION_CARTERA);
    expect(f.consultor).toBeNull();
    expect(f.nivel.clave).toBeNull();
    expect(f.alcance).toBeNull();
    expect(f.proximaDecision.origen).toBe("ninguna");
    expect(f.guardado).toEqual({ consultor_responsable_id: null, nivel_contratado: null, alcance_contratado: null, proxima_decision: null, proxima_decision_fecha: null });
  });

  it("una empresa cerrada o rechazada no es carga; una candidata sí", () => {
    expect(esActiva({ etapa: "cerrado", estado_admision: "admitida" })).toBe(false);
    expect(esActiva({ etapa: "admision", estado_admision: "rechazada" })).toBe(false);
    expect(esActiva({ etapa: "admision", estado_admision: "candidata" })).toBe(true);
  });
});

// ───────────────────────── 3 · PRIORIDADES ─────────────────────────

describe("prioridades: cuántas y cuáles", () => {
  const acciones = [
    accion(1, { es_prioridad: true, estado: "aprobado" }),
    accion(2, { es_prioridad: true, estado: "en_ejecucion" }),
    accion(3, { es_prioridad: true, estado: "verificado" }),
    accion(4, { es_prioridad: true, estado: "propuesto" }),
    accion(5, { es_prioridad: false, estado: "aprobado" }),
    accion(6, { es_prioridad: true, estado: "bloqueado" }),
    accion(7, { es_prioridad: true, estado: "rechazado" }),
  ];

  it("cuenta las prioridades abiertas y las trabadas; lo propuesto, lo verificado, lo descartado y lo que no es prioridad no entran", () => {
    const p = filaCartera(empresa({ limite_frentes: 3 }), datos({ acciones })).prioridades;
    expect(p).toMatchObject({ sinDato: null, cuantas: 3, abiertas: 2, trabadas: 1, limite: 3 });
    expect(p.cuales.map((c) => c.id)).toEqual(["accion-6", "accion-1", "accion-2"]);
    expect(p.cuales[0]).toMatchObject({ accion: "Acción 6", estado: "bloqueado" });
  });

  it("si el plan no se pudo leer, o la base no tiene las columnas del plan, es «sin dato» y no cero prioridades", () => {
    expect(filaCartera(empresa(), datos({ acciones: null })).prioridades.sinDato).toMatch(/No se pudieron leer las acciones/);
    expect(filaCartera(empresa(), datos({ acciones, planCompleto: false })).prioridades.sinDato).toMatch(/migracion-plan-kpi-linea-base\.sql/);
  });
});

// ───────────────────────── 4 · LA PRÓXIMA DECISIÓN ─────────────────────────

describe("la próxima decisión: escrita o derivada", () => {
  it("escrita por Dirección: es la que sale, con los días que faltan", () => {
    const d = filaCartera(empresa({ proxima_decision: "  Decidir si se renueva el contrato ", proxima_decision_fecha: "2026-10-20" }), datos()).proximaDecision;
    expect(d).toMatchObject({ origen: "escrita", texto: "Decidir si se renueva el contrato", fecha: "2026-10-20", vencida: false, dias: 7, tambien: [], sinDato: [] });
    expect(cuandoDecision(d)).toMatch(/^para el .*, en 7 días$/);
  });

  it("escrita y con la fecha pasada: está vencida, y se dice hace cuánto", () => {
    const d = filaCartera(empresa({ proxima_decision: "Renovar", proxima_decision_fecha: "2026-10-06" }), datos()).proximaDecision;
    expect(d).toMatchObject({ origen: "escrita", vencida: true, dias: -7 });
    expect(cuandoDecision(d)).toMatch(/^venció el .*, hace 7 días$/);
  });

  it("escrita sin fecha: no está vencida ni se le inventa una fecha", () => {
    const d = filaCartera(empresa({ proxima_decision: "Renovar" }), datos()).proximaDecision;
    expect(d).toMatchObject({ origen: "escrita", fecha: null, vencida: false, dias: null });
    expect(cuandoDecision(d)).toBeNull();
  });

  it("una decisión escrita no tapa lo que el sistema ve: lo demás que espera se cuenta al lado", () => {
    const d = filaCartera(
      empresa({ proxima_decision: "Renovar" }),
      datos({ acciones: [accion(1), accion(2)], revisiones: [{ semana: SEMANA, explicacion: null }], mediciones: [lineaBase(), corte(1)] })
    ).proximaDecision;
    expect(d.origen).toBe("escrita");
    expect(d.tambien).toEqual(["2 acciones propuestas sin aprobar", "1 semana sin explicar", "1 corte sin aceptación de la empresa"]);
  });

  it("derivada 1 · sin decisión escrita, la acción propuesta que más tiempo lleva sin aprobar", () => {
    const d = filaCartera(
      empresa(),
      datos({ acciones: [accion(1, { accion: "Ordenar la caja", updated_at: "2026-10-01T15:00:00Z" }), accion(2, { accion: "Lista de precios", estado: "pendiente", updated_at: "2026-09-20T15:00:00Z" }), accion(3, { estado: "aprobado", updated_at: "2026-09-01T15:00:00Z" })] })
    ).proximaDecision;
    expect(d).toMatchObject({ origen: "accion_propuesta", texto: "Aprobar o descartar: «Lista de precios»", fecha: "2026-09-20", vencida: false, dias: 23, href: `/empresa/${E1}/plan` });
    expect(d.nota).toMatch(/^Derivada/);
    expect(d.tambien[0]).toBe("1 acción propuesta más sin aprobar");
    expect(cuandoDecision(d)).toMatch(/^espera desde el .*, hace 23 días$/);
  });

  it("derivada 2 · sin propuestas, la revisión semanal que nadie explicó", () => {
    const d = filaCartera(empresa(), datos({ revisiones: [{ semana: SEMANA, explicacion: "   " }, { semana: "2026-09-28", explicacion: "Se atrasó el proveedor" }] })).proximaDecision;
    expect(d).toMatchObject({ origen: "revision_sin_explicar", fecha: "2026-10-11", dias: 2, href: `/empresa/${E1}/revision?semana=${SEMANA}`, tambien: [] });
    expect(d.texto).toBe(`Explicar la ${nombreDeSemana(SEMANA).toLowerCase()}`);
  });

  it("derivada 2 · con el plan en marcha, la semana que terminó cuenta aunque nadie la haya abierto; la que está corriendo, no", () => {
    const enMarcha = [accion(1, { estado: "en_ejecucion" })];
    expect(filaCartera(empresa(), datos({ acciones: enMarcha })).proximaDecision).toMatchObject({ origen: "revision_sin_explicar", fecha: "2026-10-11" });
    // Ya explicada: no hay nada que decidir.
    expect(filaCartera(empresa(), datos({ acciones: enMarcha, revisiones: [{ semana: SEMANA, explicacion: "Todo al día" }] })).proximaDecision.origen).toBe("ninguna");
    // Sin plan en marcha, una revisión de la semana en curso todavía no se le exige a nadie.
    expect(filaCartera(empresa(), datos({ revisiones: [{ semana: "2026-10-12", explicacion: null }] })).proximaDecision.origen).toBe("ninguna");
  });

  it("derivada 3 · sin propuestas ni semanas pendientes, el corte que la empresa todavía no aceptó", () => {
    const mediciones = [lineaBase(), corte(1, { fecha: "2026-09-01" }), corte(2, { fecha: "2026-10-01" })];
    const d = filaCartera(empresa(), datos({ mediciones })).proximaDecision;
    expect(d).toMatchObject({ origen: "corte_sin_acta", texto: "Presentar el corte 2 y registrar la aceptación de la empresa", fecha: "2026-10-01", dias: 12, tambien: ["1 corte más sin aceptación de la empresa"] });
  });

  it("derivada 3 · la aceptación que cuenta es la del dueño: la constancia de la consultora no cierra el corte", () => {
    const mediciones = [lineaBase(), corte(1)];
    const deConsultora = [{ referencia_id: "corte-1", aceptado_rol: "consultor", aceptado_at: "2026-08-02T15:00:00Z" }];
    expect(filaCartera(empresa(), datos({ mediciones, actas: deConsultora })).proximaDecision.origen).toBe("corte_sin_acta");
    const delDueno = [...deConsultora, { referencia_id: "corte-1", aceptado_rol: "dueno", aceptado_at: "2026-08-03T15:00:00Z" }];
    const f = filaCartera(empresa(), datos({ mediciones, actas: delDueno }));
    expect(f.proximaDecision).toMatchObject({ origen: "ninguna", texto: "Ninguna decisión pendiente" });
    expect(f.exigeDecision).toBe(false);
  });

  it("el orden de las derivaciones es fijo: propuesta, después semana, después corte", () => {
    const todo = { acciones: [accion(1)], revisiones: [{ semana: SEMANA, explicacion: null }], mediciones: [lineaBase(), corte(1)] };
    expect(filaCartera(empresa(), datos(todo)).proximaDecision.origen).toBe("accion_propuesta");
    expect(filaCartera(empresa(), datos({ ...todo, acciones: [] })).proximaDecision.origen).toBe("revision_sin_explicar");
    expect(filaCartera(empresa(), datos({ ...todo, acciones: [], revisiones: [] })).proximaDecision.origen).toBe("corte_sin_acta");
  });

  it("si no se pudo mirar, no dice «ninguna decisión pendiente»: dice qué no pudo mirar", () => {
    const f = filaCartera(empresa(), datos({ acciones: null, revisiones: null, mediciones: null }));
    expect(f.proximaDecision).toMatchObject({ origen: "ninguna", texto: "No se pudo determinar" });
    expect(f.proximaDecision.sinDato).toEqual(["acciones propuestas sin aprobar", "revisiones semanales sin explicar", "cortes sin aceptación"]);
    // Con los cortes leídos y las actas no, tampoco se supone que nadie aceptó.
    expect(filaCartera(empresa(), datos({ mediciones: [lineaBase(), corte(1)], actas: null })).proximaDecision.sinDato).toEqual(["actas de aceptación de los cortes"]);
  });
});

// ───────────────────────── 5 · COMPROMISOS Y ENTREGAS ─────────────────────────

describe("compromisos: lo que RENASER se obligó a hacer, vencido primero", () => {
  const acciones = [
    accion(1, { estado: "aprobado", obligaciones_renaser: "Entregar la plantilla de caja", vence_at: "2026-10-01" }),
    accion(2, { estado: "en_ejecucion", obligaciones_renaser: "Capacitar a la cajera", vence_at: "2026-10-15" }),
    accion(3, { estado: "aprobado", obligaciones_renaser: "Revisar el contrato" }),
    accion(4, { estado: "propuesto", obligaciones_renaser: "Todavía no obliga a nadie", vence_at: "2026-09-01" }),
    accion(5, { estado: "verificado", obligaciones_renaser: "Ya comprobado", vence_at: "2026-09-01" }),
    accion(6, { estado: "bloqueado", obligaciones_renaser: "Conseguir al proveedor", vence_at: "2026-09-01T00:00:00Z" }),
    accion(7, { estado: "aprobado", obligaciones_renaser: "   ", obligaciones_cliente: "Abrir la cuenta del banco", vence_at: "2026-10-30" }),
  ];

  it("cuenta solo lo aprobado y sin verificar, con los vencidos arriba (el más atrasado primero) y lo que no tiene fecha al final", () => {
    const c = filaCartera(empresa(), datos({ acciones })).compromisos;
    expect(c).toMatchObject({ sinDato: null, cuantos: 4, vencidos: 2, vencenPronto: 1, sinFecha: 1 });
    expect(c.lista.map((x) => x.id)).toEqual(["accion-6", "accion-1", "accion-2", "accion-3"]);
    expect(c.lista[0]).toMatchObject({ obligacion: "Conseguir al proveedor", vence_at: "2026-09-01", vencido: true, diasDeAtraso: 42 });
    expect(c.lista[2]).toMatchObject({ vencido: false, diasDeAtraso: -2 });
    expect(c.lista[3]).toMatchObject({ vence_at: null, vencido: false, diasDeAtraso: null });
  });

  it("lo que se obligó a hacer la empresa va aparte y no engorda la cuenta de RENASER", () => {
    const c = filaCartera(empresa(), datos({ acciones })).compromisos;
    expect(c.deLaEmpresa.map((x) => x.obligacion)).toEqual(["Abrir la cuenta del banco"]);
    expect(c.lista.some((x) => x.id === "accion-7")).toBe(false);
  });

  it("las frases de vencimiento dicen la fecha y los días", () => {
    const c = filaCartera(empresa(), datos({ acciones })).compromisos.lista;
    expect(cuandoVence(c[0]!)).toMatch(/^venció el .*, hace 42 días$/);
    expect(cuandoVence(c[2]!)).toMatch(/^vence el .*, en 2 días$/);
    expect(cuandoVence(c[3]!)).toBe("sin fecha");
    expect(cuandoVence({ vence_at: HOY, vencido: false, diasDeAtraso: 0 })).toBe("vence hoy");
  });

  it("sin las columnas del plan es «sin dato», no «ningún compromiso»", () => {
    expect(filaCartera(empresa(), datos({ acciones, planCompleto: false })).compromisos).toMatchObject({ cuantos: 0, lista: [] });
    expect(filaCartera(empresa(), datos({ acciones, planCompleto: false })).compromisos.sinDato).toBeTruthy();
  });
});

describe("entregas: documentos publicados y pendientes", () => {
  it("cuenta por documento: lo publicado, y lo que tiene una versión más nueva sin publicar", () => {
    const e = filaCartera(
      empresa(),
      datos({
        entregables: [
          { id: "d1", tipo: "diagnostico", version: 1, publicado: true, publicado_at: "2026-09-10T15:00:00Z" },
          { id: "d2", tipo: "diagnostico", version: 2, publicado: false },
          { id: "d3", tipo: "plan", version: 1, publicado: false },
          { id: "d4", tipo: "espejo", version: 1, publicado: true, estado: "obsoleto" },
        ],
      })
    ).entregas;
    expect(e).toMatchObject({ sinDato: null, publicadas: 1, pendientes: 2 });
    expect(e.lista.find((x) => x.tipo === "diagnostico")).toMatchObject({ versionPublicada: 1, publicadaEl: "2026-09-10", versionPendiente: 2 });
    expect(e.lista.find((x) => x.tipo === "plan")).toMatchObject({ versionPublicada: null, versionPendiente: 1 });
    expect(e.lista.some((x) => x.tipo === "espejo")).toBe(false);
  });

  it("si no se pudieron leer es «sin dato»", () => {
    expect(filaCartera(empresa(), datos({ entregables: null })).entregas.sinDato).toMatch(/No se pudieron leer/);
  });
});

// ───────────────────────── 6 · BLOQUEOS ─────────────────────────

describe("bloqueos: acciones bloqueadas, fuentes atascadas y trabajos fallidos", () => {
  const tres = {
    acciones: [accion(1, { accion: "Contratar cajera", estado: "bloqueado", bloqueo: "Falta presupuesto", bloqueado_at: "2026-10-08T14:00:00Z" }), accion(2, { estado: "aprobado" })],
    fuentesAtascadas: [{ id: "f1", nombre: "ventas.xlsx", horas: 60, desde: "2026-10-10T12:00:00Z" }],
    trabajosFallidos: [{ id: "j1", tipo: "extraer", cuando: "2026-09-30T12:00:00Z" }, { id: "j2", tipo: "plan", cuando: "2026-10-12T12:00:00Z" }],
  };

  it("cuenta las tres fuentes y dice cuál es la más antigua", () => {
    const f = filaCartera(empresa(), datos(tres));
    expect(f.bloqueos).toMatchObject({ total: 4, acciones: 1, fuentes: 1, trabajos: 2, sinDato: [] });
    expect(f.bloqueos.masAntiguo).toMatchObject({ origen: "trabajo", desde: "2026-09-30T12:00:00Z", dias: 13 });
    expect(f.bloqueada).toBe(true);
  });

  it("cada fuente cuenta por sí sola", () => {
    const soloAccion = filaCartera(empresa(), datos({ acciones: tres.acciones })).bloqueos;
    expect(soloAccion).toMatchObject({ total: 1, acciones: 1, fuentes: 0, trabajos: 0 });
    expect(soloAccion.masAntiguo).toMatchObject({ origen: "accion", dias: 5 });
    expect(soloAccion.masAntiguo!.texto).toBe("Acción bloqueada: «Contratar cajera» — Falta presupuesto");
    const soloFuente = filaCartera(empresa(), datos({ fuentesAtascadas: tres.fuentesAtascadas })).bloqueos;
    expect(soloFuente).toMatchObject({ total: 1, acciones: 0, fuentes: 1, trabajos: 0 });
    expect(soloFuente.masAntiguo).toMatchObject({ origen: "fuente", dias: 3 });
    const soloTrabajo = filaCartera(empresa(), datos({ trabajosFallidos: [tres.trabajosFallidos[1]!] })).bloqueos;
    expect(soloTrabajo).toMatchObject({ total: 1, acciones: 0, fuentes: 0, trabajos: 1 });
    expect(soloTrabajo.masAntiguo).toMatchObject({ origen: "trabajo", dias: 1 });
  });

  it("sin nada trabado no hay bloqueo ni «más antiguo»", () => {
    const f = filaCartera(empresa(), datos());
    expect(f.bloqueos).toEqual({ total: 0, acciones: 0, fuentes: 0, trabajos: 0, masAntiguo: null, sinDato: [] });
    expect(f.bloqueada).toBe(false);
  });

  it("uno sin fecha no le gana al que sí la tiene", () => {
    const b = filaCartera(empresa(), datos({ trabajosFallidos: [{ id: "j0", tipo: "plan", cuando: null }, { id: "j1", tipo: "extraer", cuando: "2026-10-01T12:00:00Z" }] })).bloqueos;
    expect(b.masAntiguo).toMatchObject({ desde: "2026-10-01T12:00:00Z" });
  });

  it("lo que no se pudo mirar se nombra: la cuenta queda como un mínimo, no como un total", () => {
    const b = filaCartera(empresa(), datos({ ...tres, fuentesAtascadas: null, trabajosFallidos: null })).bloqueos;
    expect(b).toMatchObject({ total: 1, acciones: 1, fuentes: 0, trabajos: 0 });
    expect(b.sinDato).toEqual(["fuentes atascadas", "trabajos fallidos"]);
    expect(filaCartera(empresa(), datos({ acciones: null })).bloqueos.sinDato).toEqual(["acciones bloqueadas"]);
  });
});

// ───────────────────────── 7 · RESULTADOS ─────────────────────────

describe("resultados: el último corte contra su punto de partida", () => {
  it("sin mediciones es «sin corte», y dice que no hay contra qué medir", () => {
    const r = filaCartera(empresa(), datos()).resultados;
    expect(r).toMatchObject({ estado: "sin_corte", texto: SIN_CORTE, base: null });
    expect(SIN_CORTE).toBe("sin corte");
    expect(r.detalle).toMatch(/No hay punto de partida ni corte/);
  });

  it("con punto de partida y ningún corte sigue siendo «sin corte»: un punto de partida no es un resultado", () => {
    const r = filaCartera(empresa(), datos({ mediciones: [lineaBase()] })).resultados;
    expect(r).toMatchObject({ estado: "sin_corte", texto: "sin corte", base: { version: 1, fecha: "2026-05-01" } });
    expect(r.detalle).toMatch(/ningún corte después/);
  });

  it("si las mediciones no se pudieron leer es «sin dato», que no es lo mismo que «sin corte»", () => {
    expect(filaCartera(empresa(), datos({ mediciones: null })).resultados).toMatchObject({ estado: "sin_dato", texto: "sin dato" });
  });

  it("con corte, la lectura es la de `lecturaDeCorte`: aquí no se calcula otra", () => {
    const mediciones = [lineaBase(), corte(1)];
    const accionesLigadas: AccionLigada[] = [{ id: "a1", accion: "Vitrina y precios visibles", estado: "verificado", clave: "ganancia_mes", fecha_verificacion: "2026-07-15" }];
    const r = filaCartera(empresa(), datos({ mediciones, accionesLigadas })).resultados;
    const l = lecturaDeCorte({ corte: mediciones[1]!, mediciones, acciones: accionesLigadas, para: "consultor" });
    if (r.estado !== "con_corte") throw new Error(`se esperaba un corte y salió ${r.estado}`);
    expect(r.titular).toBe(l.titular);
    expect(r.esResultado).toBe(l.esResultado);
    expect(r.cuenta).toEqual({ movidos: l.cuenta.movidos, atribuibles: l.cuenta.si, enParte: l.cuenta.parcial, observados: l.cuenta.observados, sinCambio: l.cuenta.sinCambio, sinDato: l.cuenta.sinDato });
    // Períodos equivalentes y una acción verificada antes del corte: se movieron dos números, uno atribuible y otro solo observado.
    expect(r.esResultado).toBe(true);
    expect(r.cuenta).toMatchObject({ movidos: 2, atribuibles: 1, observados: 1 });
    expect(r.corte).toEqual({ id: "corte-1", numero: 1, fecha: "2026-08-01" });
    expect(r.base).toEqual({ version: 1, fecha: "2026-05-01" });
    expect(r.texto).toMatch(/^Corte 1 · /);
  });

  it("lo observado no se presenta como atribuible: sin períodos comparables nada se atribuye", () => {
    const mediciones = [lineaBase(), corte(1, { periodo_desde: "2026-05-01", periodo_hasta: "2026-07-29" })];
    const accionesLigadas: AccionLigada[] = [{ id: "a1", accion: "Vitrina", estado: "verificado", clave: "ganancia_mes", fecha_verificacion: "2026-07-15" }];
    const r = filaCartera(empresa(), datos({ mediciones, accionesLigadas })).resultados;
    if (r.estado !== "con_corte") throw new Error(`se esperaba un corte y salió ${r.estado}`);
    expect(r.esResultado).toBe(false);
    expect(r.cuenta.atribuibles).toBe(0);
    expect(r.detalle).toMatch(/observados|nada se observa ni se atribuye/);
  });

  it("con varios cortes se lee el último", () => {
    const r = filaCartera(empresa(), datos({ mediciones: [lineaBase(), corte(1), corte(2, { fecha: "2026-09-01" })] })).resultados;
    expect(r.estado === "con_corte" && r.corte.numero).toBe(2);
  });
});

// ───────────────────────── 8 · ORDEN, FILTRO Y CARGA ─────────────────────────

describe("ordenar: primero lo que exige una decisión o está bloqueado", () => {
  const fallo = [{ id: "j1", tipo: "extraer", cuando: "2026-10-12T12:00:00Z" }];
  const tranquila = filaCartera(empresa({ id: id("e", 1), nombre: "Tranquila" }), datos());
  const decide = filaCartera(empresa({ id: id("e", 2), nombre: "Decide" }), datos({ acciones: [accion(1, { updated_at: "2026-10-05T15:00:00Z" })] }));
  const trabada = filaCartera(empresa({ id: id("e", 3), nombre: "Trabada" }), datos({ trabajosFallidos: fallo }));
  const vencida = filaCartera(empresa({ id: id("e", 4), nombre: "Vencida", proxima_decision: "Renovar", proxima_decision_fecha: "2026-10-01" }), datos());
  const ambas = filaCartera(empresa({ id: id("e", 5), nombre: "Ambas" }), datos({ acciones: [accion(1)], trabajosFallidos: fallo }));
  const cerrada = filaCartera(empresa({ id: id("e", 6), nombre: "Archivada", etapa: "cerrado" }), datos());

  it("las fichas de partida son las que se cree", () => {
    expect([tranquila.exigeDecision, tranquila.bloqueada]).toEqual([false, false]);
    expect([decide.exigeDecision, decide.bloqueada]).toEqual([true, false]);
    expect([trabada.exigeDecision, trabada.bloqueada]).toEqual([false, true]);
    expect([vencida.exigeDecision, vencida.proximaDecision.vencida]).toEqual([true, true]);
    expect([ambas.exigeDecision, ambas.bloqueada]).toEqual([true, true]);
  });

  it("decisión vencida, decisión con bloqueo, bloqueo, decisión; lo que no pide nada al final y lo cerrado en último lugar", () => {
    const orden = ordenar([cerrada, tranquila, decide, trabada, ambas, vencida]).map((f) => f.empresa.nombre);
    expect(orden).toEqual(["Vencida", "Ambas", "Trabada", "Decide", "Tranquila", "Archivada"]);
  });

  it("ninguna empresa que exige decisión o está bloqueada queda debajo de una que no pide nada", () => {
    const orden = ordenar([tranquila, cerrada, trabada, decide]);
    const pide = orden.map((f) => f.exigeDecision || f.bloqueada);
    expect(pide).toEqual([true, true, false, false]);
  });

  it("a igual urgencia, primero la que tiene compromisos de RENASER vencidos y después la que lleva más tiempo esperando", () => {
    const vieja = filaCartera(empresa({ id: id("e", 7), nombre: "Zeta espera más" }), datos({ acciones: [accion(1, { updated_at: "2026-09-01T15:00:00Z" })] }));
    const conVencido = filaCartera(
      empresa({ id: id("e", 8), nombre: "Yunta con vencido" }),
      datos({ acciones: [accion(1, { updated_at: "2026-10-10T15:00:00Z" }), accion(2, { estado: "aprobado", obligaciones_renaser: "Entregar", vence_at: "2026-10-01" })], revisiones: [{ semana: SEMANA, explicacion: "Explicada" }] })
    );
    expect(ordenar([decide, vieja, conVencido]).map((f) => f.empresa.nombre)).toEqual(["Yunta con vencido", "Zeta espera más", "Decide"]);
  });

  it("es estable y no toca la lista que recibe: con los mismos datos, el mismo orden", () => {
    const entrada = [tranquila, cerrada, decide, trabada, ambas, vencida];
    const copia = [...entrada];
    const una = ordenar(entrada).map((f) => f.empresa.id);
    const otra = ordenar([...entrada].reverse()).map((f) => f.empresa.id);
    expect(una).toEqual(otra);
    expect(entrada).toEqual(copia);
  });
});

describe("filtros por consultor y por fase", () => {
  const filas = [
    filaCartera(empresa({ id: E1, nombre: "Uno", consultor_responsable_id: ANA, etapa: "implementacion" }), datos()),
    filaCartera(empresa({ id: E2, nombre: "Dos", consultor_responsable_id: BRUNO, etapa: "monitoreo" }), datos()),
    filaCartera(empresa({ id: E3, nombre: "Tres", etapa: null }), datos()),
  ];
  const nombres = (fs: FilaCartera[]) => fs.map((f) => f.empresa.nombre);

  it("filtra por consultor, por fase, por los dos, y por «sin asignar» o «sin fase»", () => {
    expect(nombres(filtrar(filas, {}))).toEqual(["Uno", "Dos", "Tres"]);
    expect(nombres(filtrar(filas, { consultor: ANA }))).toEqual(["Uno"]);
    expect(nombres(filtrar(filas, { fase: "medicion" }))).toEqual(["Dos"]);
    expect(nombres(filtrar(filas, { consultor: ANA, fase: "medicion" }))).toEqual([]);
    expect(nombres(filtrar(filas, { consultor: FILTRO_SIN_ASIGNAR }))).toEqual(["Tres"]);
    expect(nombres(filtrar(filas, { fase: FILTRO_SIN_FASE }))).toEqual(["Tres"]);
  });

  it("un filtro que no vale no se ignora en silencio", () => {
    expect(filtroDe({ consultor: ANA, fase: "plan" })).toEqual({ ok: true, filtro: { consultor: ANA, fase: "plan" } });
    expect(filtroDe({ consultor: "", fase: null })).toEqual({ ok: true, filtro: { consultor: null, fase: null } });
    expect(filtroDe({ consultor: "ana" })).toMatchObject({ ok: false });
    expect(filtroDe({ fase: "espejo" })).toMatchObject({ ok: false, error: expect.stringMatching(/ocho del método/) });
  });
});

describe("carga por consultor: empresas activas, contadas", () => {
  const fantasma = id("f", 9);
  const filas = [
    filaCartera(empresa({ id: id("e", 1), nombre: "Uno", consultor_responsable_id: ANA }), datos({ acciones: [accion(1), accion(2, { estado: "aprobado", es_prioridad: true, obligaciones_renaser: "Entregar", vence_at: "2026-10-01" })] })),
    filaCartera(empresa({ id: id("e", 2), nombre: "Dos", consultor_responsable_id: ANA }), datos({ trabajosFallidos: [{ id: "j1", tipo: "plan", cuando: null }] })),
    filaCartera(empresa({ id: id("e", 3), nombre: "Tres", consultor_responsable_id: ANA, etapa: "cerrado" }), datos({ acciones: [accion(1)] })),
    filaCartera(empresa({ id: id("e", 4), nombre: "Cuatro", consultor_responsable_id: BRUNO }), datos()),
    filaCartera(empresa({ id: id("e", 5), nombre: "Cinco" }), datos()),
    filaCartera(empresa({ id: id("e", 6), nombre: "Seis", consultor_responsable_id: fantasma }), datos()),
  ];
  const carga = cargaPorConsultor(filas, CONSULTORES);

  it("cuenta las empresas activas de cada consultor; las cerradas no son carga pero siguen siendo suyas", () => {
    expect(carga.find((c) => c.id === ANA)).toEqual({ id: ANA, nombre: "Ana Quispe", activas: 2, empresas: 3, exigenDecision: 1, conBloqueo: 1, compromisosVencidos: 1, prioridades: 1 });
    expect(carga.find((c) => c.id === BRUNO)).toMatchObject({ activas: 1, empresas: 1, exigenDecision: 0, conBloqueo: 0 });
  });

  it("salen todos los consultores, también el que no lleva ninguna, y quien ya no figura conserva su fila", () => {
    expect(carga.find((c) => c.id === CARLA)).toMatchObject({ nombre: "carla@ejemplo.test", activas: 0, empresas: 0 });
    expect(carga.find((c) => c.id === fantasma)).toMatchObject({ nombre: "Consultor no encontrado", activas: 1 });
  });

  it("de más carga a menos, y las empresas sin asignar al final", () => {
    expect(carga.map((c) => c.nombre)).toEqual(["Ana Quispe", "Bruno Mamani", "Consultor no encontrado", "carla@ejemplo.test", SIN_CONSULTOR]);
    expect(carga.at(-1)).toMatchObject({ id: null, activas: 1, empresas: 1 });
    expect(carga.reduce((n, c) => n + c.empresas, 0)).toBe(filas.length);
  });

  it("si todas están asignadas no se pinta una fila «sin asignar» vacía", () => {
    expect(cargaPorConsultor(filas.slice(0, 4), CONSULTORES).some((c) => c.id === null)).toBe(false);
  });

  it("el resumen suma lo que cada fila ya contó", () => {
    expect(resumenCartera(filas)).toMatchObject({ empresas: 6, activas: 5, exigenDecision: 2, conBloqueo: 1, compromisosVencidos: 1, trabajosFallidos: 1, fuentesAtascadas: 0, sinConsultor: 1 });
  });
});

// ───────────────────────── 9 · SE CUENTAN COSAS ─────────────────────────

describe("nada de porcentajes de avance", () => {
  it("una fila llena no trae ningún porcentaje ni un campo de avance", () => {
    const f = filaCartera(
      empresa({ consultor_responsable_id: ANA, nivel_contratado: "nivel_1", alcance_contratado: "Ordenar la caja", limite_frentes: 3 }),
      datos({
        acciones: [accion(1), accion(2, { estado: "aprobado", es_prioridad: true, obligaciones_renaser: "Entregar", vence_at: "2026-10-01" }), accion(3, { estado: "bloqueado", bloqueo: "Sin presupuesto" })],
        entregables: [{ id: "d1", tipo: "diagnostico", version: 1, publicado: true }],
        mediciones: [lineaBase(), corte(1)],
        trabajosFallidos: [{ id: "j1", tipo: "plan", cuando: "2026-10-12T12:00:00Z" }],
      })
    );
    const texto = JSON.stringify(f);
    expect(texto).not.toMatch(/%|porcentaje|avance|progreso/i);
  });

  it("los días entre dos fechas se cuentan por calendario, y lo que no es una fecha no es cero", () => {
    expect(diasEntre("2026-10-01", "2026-10-13")).toBe(12);
    expect(diasEntre("2026-10-13", "2026-10-01")).toBe(-12);
    expect(diasEntre(null, "2026-10-01")).toBeNull();
    expect(diasEntre("pronto", "2026-10-01")).toBeNull();
  });
});

// ───────────────────────── 10 · LA LECTURA DE LA BASE (doble) ─────────────────────────

function tablasDeEjemplo(): Record<string, Fila[]> {
  return {
    companies: [
      { id: E1, nombre: "Panadería San Blas", etapa: "implementacion", estado_admision: "admitida", consultor_responsable_id: ANA, nivel_contratado: "nivel_2", alcance_contratado: "Caja y compras", proxima_decision: null, proxima_decision_fecha: null, limite_frentes: 3 },
      { id: E2, nombre: "Ferretería El Tornillo", etapa: "espejo", estado_admision: "admitida", consultor_responsable_id: null, nivel_contratado: null, alcance_contratado: null, proxima_decision: null, proxima_decision_fecha: null, limite_frentes: 3 },
      { id: E3, nombre: "Botica Santa Ana", etapa: "cerrado", estado_admision: "admitida", consultor_responsable_id: ANA, nivel_contratado: "nivel_1", alcance_contratado: null, proxima_decision: null, proxima_decision_fecha: null, limite_frentes: 3 },
    ],
    users: [
      { id: ANA, nombre: "Ana Quispe", email: "ana@ejemplo.test", rol: "consultor" },
      { id: BRUNO, nombre: "Bruno Mamani", email: "bruno@ejemplo.test", rol: "consultor" },
      { id: DUENO_ID, nombre: "Dueño", email: "dueno@ejemplo.test", rol: "cliente" },
    ],
    actions: [
      { id: "a1", company_id: E1, accion: "Ordenar la caja", estado: "bloqueado", es_prioridad: true, bloqueo: "Falta la caja registradora", bloqueado_at: "2026-10-09T15:00:00Z", obligaciones_renaser: "Entregar la plantilla", vence_at: "2026-10-01", updated_at: "2026-10-09T15:00:00Z" },
      { id: "a2", company_id: E2, accion: "Lista de precios", estado: "propuesto", updated_at: "2026-10-02T15:00:00Z" },
    ],
    deliverables: [{ id: "d1", company_id: E1, tipo: "diagnostico", version: 1, publicado: true, publicado_at: "2026-09-10T15:00:00Z", estado: "vigente" }],
    sources: [
      { id: "s1", company_id: E1, nombre: "ventas.xlsx", estado: "leyendo", created_at: "2026-10-10T10:00:00Z" },
      { id: "s2", company_id: E1, nombre: "leida.pdf", estado: "leido", created_at: "2026-10-01T10:00:00Z" },
    ],
    jobs: [
      { id: "j1", company_id: E1, tipo: "plan", estado: "fallido", terminado_at: "2026-10-11T10:00:00Z", created_at: "2026-10-11T09:00:00Z", payload: {} },
      { id: "j2", company_id: null, tipo: "mantenimiento", estado: "fallido", terminado_at: "2026-10-11T10:00:00Z", created_at: "2026-10-11T09:00:00Z", payload: {} },
    ],
    revisiones_semanales: [],
    mediciones: [{ company_id: E1, ...lineaBase() }],
    actas_aceptacion: [],
    indicadores: [],
    accion_historial: [],
  };
}
const leer = (base: BaseFalsa) => cargarCartera(base as unknown as Parameters<typeof cargarCartera>[0], AHORA);

describe("cargarCartera: una lectura por tabla, y lo que no se lee se dice", () => {
  it("arma la fila de cada empresa con sus tres clases de bloqueo, y deja fuera el trabajo que no es de ninguna empresa", async () => {
    const c = await leer(crearBase(tablasDeEjemplo()));
    expect(c.hoy).toBe(HOY);
    expect(c.avisos).toEqual([]);
    expect(c.conAsignacion).toBe(true);
    const sanBlas = c.filas.find((f) => f.empresa.id === E1)!;
    expect(sanBlas.consultor).toMatchObject({ nombre: "Ana Quispe" });
    expect(sanBlas.nivel.nombre).toBe("Nivel 2");
    expect(sanBlas.fase.nombre).toBe("Implementación");
    expect(sanBlas.bloqueos).toMatchObject({ total: 3, acciones: 1, fuentes: 1, trabajos: 1 });
    expect(sanBlas.bloqueos.masAntiguo).toMatchObject({ origen: "accion" });
    expect(sanBlas.compromisos).toMatchObject({ cuantos: 1, vencidos: 1 });
    expect(sanBlas.entregas).toMatchObject({ publicadas: 1, pendientes: 0 });
    expect(sanBlas.resultados).toMatchObject({ estado: "sin_corte", texto: "sin corte" });
    // Solo los consultores: un dueño no es alguien a quien asignarle una empresa.
    expect(c.consultores.map((x) => x.id)).toEqual([ANA, BRUNO]);
  });

  it("la fila sale ordenada, con la carga y el resumen de toda la cartera", async () => {
    const c = await leer(crearBase(tablasDeEjemplo()));
    expect(c.filas.map((f) => f.empresa.nombre)).toEqual(["Panadería San Blas", "Ferretería El Tornillo", "Botica Santa Ana"]);
    expect(c.filas[1]!.fase.nombre).toBe("Priorización");
    expect(c.filas[1]!.proximaDecision).toMatchObject({ origen: "accion_propuesta", texto: "Aprobar o descartar: «Lista de precios»" });
    expect(c.carga.map((x) => [x.nombre, x.activas, x.empresas])).toEqual([["Ana Quispe", 1, 2], ["Bruno Mamani", 0, 0], [SIN_CONSULTOR, 1, 1]]);
    expect(c.resumen).toMatchObject({ empresas: 3, activas: 2, conBloqueo: 1, sinConsultor: 1 });
  });

  it("no hace una consulta por empresa: con una empresa o con tres, las mismas lecturas", async () => {
    const tres = crearBase(tablasDeEjemplo());
    await leer(tres);
    const unaSola = tablasDeEjemplo();
    unaSola.companies = unaSola.companies!.slice(0, 1);
    const una = crearBase(unaSola);
    await leer(una);
    expect(tres.llamadas).toEqual(una.llamadas);
    expect(tres.llamadas.companies).toBe(1);
    expect(tres.llamadas.actions).toBe(1);
  });

  it("pasa de las mil filas: lee por páginas en vez de quedarse con las mil primeras", async () => {
    const tablas = tablasDeEjemplo();
    tablas.actions = Array.from({ length: PAGINA + 1 }, (_, i) => ({ id: `a${String(i).padStart(5, "0")}`, company_id: E2, accion: `Acción ${i}`, estado: "propuesto", updated_at: "2026-10-02T15:00:00Z" }));
    const base = crearBase(tablas);
    const c = await leer(base);
    expect(base.rangos.actions).toEqual([[0, PAGINA - 1], [PAGINA, 2 * PAGINA - 1]]);
    expect(c.filas.find((f) => f.empresa.id === E2)!.fase.porQue).toContain(`${PAGINA + 1} acciones propuestas`);
    expect(c.avisos).toEqual([]);
  });

  it("sin la migración de cartera la pantalla sigue saliendo: lo dice arriba y deja consultor, nivel y alcance «sin dato»", async () => {
    const c = await leer(crearBase(tablasDeEjemplo(), { faltan: { companies: ["consultor_responsable_id", "nivel_contratado", "alcance_contratado", "proxima_decision", "proxima_decision_fecha"] } }));
    expect(c.conAsignacion).toBe(false);
    expect(c.avisos).toContain(SIN_MIGRACION_CARTERA);
    expect(c.filas).toHaveLength(3);
    expect(c.filas.every((f) => f.asignacionSinDato === SIN_MIGRACION_CARTERA && f.consultor === null)).toBe(true);
    // Lo demás no depende de esa migración y se sigue contando.
    expect(c.filas.find((f) => f.empresa.id === E1)!.bloqueos.total).toBe(3);
  });

  it("sin las columnas del plan lee las acciones de siempre y marca prioridades y compromisos «sin dato»", async () => {
    const c = await leer(crearBase(tablasDeEjemplo(), { faltan: { actions: ["es_prioridad", "obligaciones_renaser", "bloqueo"] } }));
    const sanBlas = c.filas.find((f) => f.empresa.id === E1)!;
    expect(sanBlas.prioridades.sinDato).toBeTruthy();
    expect(sanBlas.compromisos.sinDato).toBeTruthy();
    expect(sanBlas.bloqueos.acciones).toBe(1);
    expect(c.avisos.some((a) => /Acciones del plan/.test(a))).toBe(true);
  });

  it("una tabla que falla no se convierte en cero: el bloque dice qué no se pudo mirar y arriba hay un aviso", async () => {
    const c = await leer(crearBase(tablasDeEjemplo(), { errores: { mediciones: { message: "tiempo agotado" }, revisiones_semanales: { code: "42P01", message: 'relation "revisiones_semanales" does not exist' } } }));
    const sanBlas = c.filas.find((f) => f.empresa.id === E1)!;
    expect(sanBlas.resultados.estado).toBe("sin_dato");
    expect(sanBlas.proximaDecision.sinDato).toEqual(expect.arrayContaining(["revisiones semanales sin explicar", "cortes sin aceptación"]));
    expect(c.avisos.some((a) => /^Mediciones: no se pudieron leer \(tiempo agotado\)/.test(a))).toBe(true);
    expect(c.avisos.some((a) => /^Revisiones semanales: esa tabla o columna todavía no existe/.test(a))).toBe(true);
  });

  it("si no se leen los trabajos fallidos, los bloqueos son un mínimo y se dice", async () => {
    const c = await leer(crearBase(tablasDeEjemplo(), { errores: { jobs: { message: "sin permiso" } } }));
    const b = c.filas.find((f) => f.empresa.id === E1)!.bloqueos;
    expect(b.acciones).toBe(1);
    expect(b.sinDato).toEqual(expect.arrayContaining(["trabajos fallidos"]));
  });

  it("si no puede leer las empresas falla en voz alta: una cartera vacía por no poder leer sería mentira", async () => {
    await expect(leer(crearBase(tablasDeEjemplo(), { errores: { companies: { message: "conexión rechazada" } } }))).rejects.toThrow(/no pudo leer las empresas: conexión rechazada/);
  });

  it("reconoce cuándo un error dice «no existe» y cuándo es otra cosa", () => {
    expect(faltaEnLaBase({ code: "42703", message: "x" })).toBe(true);
    expect(faltaEnLaBase({ code: "PGRST205", message: "x" })).toBe(true);
    expect(faltaEnLaBase({ message: "Could not find the table 'public.iniciativas' in the schema cache" })).toBe(true);
    expect(faltaEnLaBase({ message: "tiempo agotado" })).toBe(false);
    expect(faltaEnLaBase(null)).toBe(false);
  });
});

// ───────────────────────── 11 · LAS RUTAS ─────────────────────────

const pedirCartera = (consulta = "") => leerCartera(new Request(`http://prueba.test/api/consultor/cartera${consulta}`), undefined as never);
const pedirAsignar = (empresaId: string, cuerpo: unknown) =>
  asignar(new Request(`http://prueba.test/api/companies/${empresaId}/cartera`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }), { params: Promise.resolve({ id: empresaId }) });
const filaDe = (base: BaseFalsa, empresaId: string) => base.tablas.companies!.find((c) => c.id === empresaId)!;

describe("GET /api/consultor/cartera", () => {
  it("devuelve las filas, la carga y el resumen; el filtro recorta las filas y no la carga", async () => {
    h.base = crearBase(tablasDeEjemplo());
    const todo = await pedirCartera();
    expect(todo.status).toBe(200);
    const cuerpo = await todo.json();
    expect(cuerpo.total).toBe(3);
    expect(cuerpo.filas).toHaveLength(3);
    expect(cuerpo.consultores).toEqual([{ id: ANA, nombre: "Ana Quispe" }, { id: BRUNO, nombre: "Bruno Mamani" }]);

    const deAna = await (await pedirCartera(`?consultor=${ANA}&fase=implementacion`)).json();
    expect(deAna.filas.map((f: FilaCartera) => f.empresa.nombre)).toEqual(["Panadería San Blas"]);
    expect(deAna.total).toBe(3);
    expect(deAna.resumen_filtrado.empresas).toBe(1);
    expect(deAna.resumen.empresas).toBe(3);
    expect(deAna.carga).toEqual(cuerpo.carga);
  });

  it("un filtro que no vale es un 400 con el motivo, no una cartera vacía", async () => {
    h.base = crearBase(tablasDeEjemplo());
    const r = await pedirCartera("?fase=espejo");
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/ocho del método/);
  });

  it("es solo de la consultora: un dueño recibe 403 y sin sesión, 401", async () => {
    h.base = crearBase(tablasDeEjemplo());
    vi.mocked(perfilApi).mockResolvedValue(DUENO);
    expect((await pedirCartera()).status).toBe(403);
    vi.mocked(perfilApi).mockResolvedValue(null);
    expect((await pedirCartera()).status).toBe(401);
  });

  it("no escribe nada", async () => {
    const base = crearBase(tablasDeEjemplo());
    h.base = base;
    await pedirCartera();
    expect(base.escrituras).toEqual([]);
  });
});

describe("PATCH /api/companies/[id]/cartera", () => {
  it("guarda nivel, alcance y próxima decisión, y deja rastro de lo que había y lo que quedó", async () => {
    const base = crearBase(tablasDeEjemplo());
    h.base = base;
    const r = await pedirAsignar(E2, { nivel_contratado: "nivel_1", alcance_contratado: "  Ordenar el almacén ", proxima_decision: "Decidir si pasa a Nivel 2", proxima_decision_fecha: "2026-11-02" });
    expect(r.status).toBe(200);
    expect((await r.json()).cartera).toEqual({ consultor_responsable_id: null, nivel_contratado: "nivel_1", alcance_contratado: "Ordenar el almacén", proxima_decision: "Decidir si pasa a Nivel 2", proxima_decision_fecha: "2026-11-02" });
    expect(filaDe(base, E2)).toMatchObject({ nivel_contratado: "nivel_1", alcance_contratado: "Ordenar el almacén", proxima_decision_fecha: "2026-11-02" });
    const rastro = vi.mocked(registrar).mock.calls.map((c) => c[0]).find((e) => e.entidadId === E2);
    expect(rastro).toMatchObject({ companyId: E2, accion: "editar", entidad: "cartera" });
    expect((rastro!.detalle as { antes: Asignacion; despues: Asignacion }).antes.nivel_contratado).toBeNull();
    expect((rastro!.detalle as { antes: Asignacion; despues: Asignacion }).despues.nivel_contratado).toBe("nivel_1");
  });

  it("cambiar al consultor exige autoridad para administrar: sin ella es 403 y no se guarda nada", async () => {
    const tablas = tablasDeEjemplo();
    tablas.users!.find((u) => u.id === ANA)!.autoridad = ["aprobar_plan"];
    const base = crearBase(tablas);
    h.base = base;
    const r = await pedirAsignar(E2, { consultor_responsable_id: BRUNO, nivel_contratado: "nivel_2" });
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/No tienes autoridad/);
    expect(base.escrituras).toEqual([]);
    expect(filaDe(base, E2)).toMatchObject({ consultor_responsable_id: null, nivel_contratado: null });
  });

  it("quien no puede administrar sí puede escribir nivel, alcance y próxima decisión", async () => {
    const tablas = tablasDeEjemplo();
    tablas.users!.find((u) => u.id === ANA)!.autoridad = ["aprobar_plan"];
    const base = crearBase(tablas);
    h.base = base;
    const r = await pedirAsignar(E2, { nivel_contratado: "nivel_2" });
    expect(r.status).toBe(200);
    expect(filaDe(base, E2).nivel_contratado).toBe("nivel_2");
  });

  it("con autoridad, asigna a un consultor que existe; un dueño o un identificador cualquiera no llevan una empresa", async () => {
    const base = crearBase(tablasDeEjemplo());
    h.base = base;
    expect((await pedirAsignar(E2, { consultor_responsable_id: BRUNO })).status).toBe(200);
    expect(filaDe(base, E2).consultor_responsable_id).toBe(BRUNO);
    for (const quien of [DUENO_ID, id("f", 9)]) {
      const r = await pedirAsignar(E2, { consultor_responsable_id: quien });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/no es un consultor de RENASER/);
    }
    expect(filaDe(base, E2).consultor_responsable_id).toBe(BRUNO);
    // Quitar al consultor también es una decisión sobre personas, y se puede.
    expect((await pedirAsignar(E2, { consultor_responsable_id: null })).status).toBe(200);
    expect(filaDe(base, E2).consultor_responsable_id).toBeNull();
  });

  it("rechaza lo que no vale con un mensaje que se entiende, y no guarda nada", async () => {
    const base = crearBase(tablasDeEjemplo());
    h.base = base;
    const casos: [unknown, RegExp][] = [
      [{}, /No hay nada que cambiar/],
      [{ etapa: "cerrado" }, /Solo se pueden cambiar/],
      [{ nivel_contratado: "premium" }, /Nivel 1 o Nivel 2/],
      [{ consultor_responsable_id: "ana" }, /identificador válido/],
      [{ proxima_decision: "Renovar", proxima_decision_fecha: "2026-02-31" }, /un día que exista/],
      [{ proxima_decision_fecha: "2026-11-02" }, /Escribe la próxima decisión antes de ponerle fecha/],
      [{ proxima_decision: "x".repeat(501) }, /500 letras/],
    ];
    for (const [cuerpo, mensaje] of casos) {
      const r = await pedirAsignar(E2, cuerpo);
      expect(r.status, JSON.stringify(cuerpo).slice(0, 60)).toBe(400);
      expect((await r.json()).error).toMatch(mensaje);
    }
    expect(base.escrituras).toEqual([]);
  });

  it("borrar la decisión borra su fecha: una fecha sin decisión no dice nada", async () => {
    const tablas = tablasDeEjemplo();
    Object.assign(tablas.companies!.find((c) => c.id === E2)!, { proxima_decision: "Renovar", proxima_decision_fecha: "2026-11-02" });
    const base = crearBase(tablas);
    h.base = base;
    const r = await pedirAsignar(E2, { proxima_decision: "   " });
    expect(r.status).toBe(200);
    expect(filaDe(base, E2)).toMatchObject({ proxima_decision: null, proxima_decision_fecha: null });
  });

  it("guardar lo mismo que ya había no es un cambio: no escribe ni deja rastro propio", async () => {
    const base = crearBase(tablasDeEjemplo());
    h.base = base;
    const r = await pedirAsignar(E1, { nivel_contratado: "nivel_2", alcance_contratado: "Caja y compras" });
    expect(r.status).toBe(200);
    expect((await r.json()).sin_cambios).toBe(true);
    expect(base.escrituras).toEqual([]);
    expect(vi.mocked(registrar).mock.calls.some((c) => c[0].entidadId === E1)).toBe(false);
  });

  it("una empresa que no existe, o un identificador mal escrito, es 404", async () => {
    h.base = crearBase(tablasDeEjemplo());
    expect((await pedirAsignar(id("e", 9), { nivel_contratado: "nivel_1" })).status).toBe(404);
    expect((await pedirAsignar("no-es-un-id", { nivel_contratado: "nivel_1" })).status).toBe(404);
  });

  it("sin la migración de cartera dice qué falta aplicar en vez de un error de la base", async () => {
    const base = crearBase(tablasDeEjemplo(), { faltan: { companies: ["nivel_contratado"] } });
    h.base = base;
    const r = await pedirAsignar(E2, { nivel_contratado: "nivel_1" });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe(SIN_MIGRACION_CARTERA);
    expect(base.escrituras).toEqual([]);
  });

  it("es solo de la consultora: el dueño no asigna nada", async () => {
    const base = crearBase(tablasDeEjemplo());
    h.base = base;
    vi.mocked(perfilApi).mockResolvedValue(DUENO);
    expect((await pedirAsignar(E2, { nivel_contratado: "nivel_1" })).status).toBe(403);
    expect(base.escrituras).toEqual([]);
  });
});

// ───────────────────────── 12 · EL FORMULARIO Y LA PANTALLA ─────────────────────────

describe("el formulario de asignar", () => {
  const guardada: Asignacion = { consultor_responsable_id: ANA, nivel_contratado: "nivel_1", alcance_contratado: "Caja", proxima_decision: null, proxima_decision_fecha: null };

  it("envía solo lo que cambió, y un texto en blanco es «sin valor»", () => {
    expect(cambiosDeAsignacion(guardada, guardada)).toEqual({});
    expect(cambiosDeAsignacion(guardada, { ...guardada, alcance_contratado: " Caja " })).toEqual({});
    expect(cambiosDeAsignacion(guardada, { ...guardada, nivel_contratado: "nivel_2", alcance_contratado: "   " })).toEqual({ nivel_contratado: "nivel_2", alcance_contratado: null });
    expect(cambiosDeAsignacion(guardada, { ...guardada, consultor_responsable_id: null })).toEqual({ consultor_responsable_id: null });
  });

  it("no deja poner fecha a una decisión que no está escrita", () => {
    expect(errorDeAsignacion({ ...guardada, proxima_decision_fecha: "2026-11-02" })).toBe(ERROR_FECHA_SIN_DECISION);
    expect(errorDeAsignacion({ ...guardada, proxima_decision: "Renovar", proxima_decision_fecha: "2026-11-02" })).toBeNull();
    expect(errorDeAsignacion(guardada)).toBeNull();
  });
});

describe("la pantalla /cartera (pintada en el servidor, sin navegador)", () => {
  const pintar = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await PaginaCartera({ searchParams: Promise.resolve(sp) }));
  const soloTexto = (html: string) => html.replace(/<[^>]*>/g, " ");

  it("muestra la carga por consultor arriba, una fila por empresa con sus nueve datos y el formulario para asignar", async () => {
    h.base = crearBase(tablasDeEjemplo());
    const html = await pintar();
    expect(html.indexOf("Carga por consultor")).toBeGreaterThan(-1);
    expect(html.indexOf("Carga por consultor")).toBeLessThan(html.indexOf("Panadería San Blas"));
    for (const rotulo of ["Empresa", "Consultor y nivel", "Fase", "Próxima decisión", "Prioridades", "Compromisos", "Entregas", "Bloqueos", "Resultados"]) expect(html, rotulo).toContain(rotulo);
    for (const nombre of ["Panadería San Blas", "Ferretería El Tornillo", "Botica Santa Ana", "Ana Quispe", "Bruno Mamani"]) expect(html, nombre).toContain(nombre);
    expect(html).toContain("sin corte");
    expect(html).toContain("Sin asignar");
    expect(html).toContain("Aprobar o descartar: «Lista de precios»");
    expect(html).toContain("Guardar asignación");
    // Cada fila se puede abrir: es un <details> con su resumen, que funciona con un toque y sin JavaScript.
    expect(html.match(/<details/g)).toHaveLength(3);
  });

  it("no pinta ningún porcentaje", async () => {
    h.base = crearBase(tablasDeEjemplo());
    expect(soloTexto(await pintar())).not.toMatch(/%|porcentaje|avance/i);
  });

  it("filtra por consultor y por fase desde la dirección", async () => {
    h.base = crearBase(tablasDeEjemplo());
    const html = await pintar({ consultor: ANA, fase: "implementacion" });
    expect(html).toContain("Se muestran 1 de 3 empresas.");
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toContain("Quitar filtros");
  });

  it("un filtro que no vale se dice y se muestra la cartera completa", async () => {
    h.base = crearBase(tablasDeEjemplo());
    const html = await pintar({ fase: "espejo" });
    expect(html).toContain("Se muestra la cartera completa.");
    expect(html.match(/<details/g)).toHaveLength(3);
  });

  it("lo que no se pudo leer sale arriba y en la celda como «sin dato», no como un cero", async () => {
    h.base = crearBase(tablasDeEjemplo(), { errores: { mediciones: { message: "tiempo agotado" } }, faltan: { companies: ["consultor_responsable_id"] } });
    const html = await pintar();
    expect(html).toContain("Lo que esta pantalla no pudo leer");
    expect(html).toContain("migracion-excelencia-y-cartera.sql");
    expect(html).toContain("sin dato");
    expect(html).not.toContain("Guardar asignación");
  });

  it("sin empresas lo dice", async () => {
    h.base = crearBase({ companies: [], users: [] });
    expect(await pintar()).toContain("Todavía no hay empresas en la cartera.");
  });
});
