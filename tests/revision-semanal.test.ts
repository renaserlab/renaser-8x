/**
 * LA REVISIÓN SEMANAL: LAS SIETE PREGUNTAS, SIN BASE (R13.2).
 *
 * Hasta el 13-10-2026 nadie contestaba cada semana qué debía ocurrir, qué ocurrió, con qué evidencia, qué se
 * desvió, por qué, qué decisión hace falta y qué sigue: el seguimiento era mirar el plan y recordar. Aquí se
 * prueba la regla pura de src/lib/revision-semanal.ts: una acción vencida sin reportar es un retraso con su
 * decisión propuesta; un indicador mensual con el último valor de hace 60 días es un dato viejo que pide
 * «registrar el valor de setiembre»; una acción en marcha sin persona a cargo pide reasignar; una meta con
 * plazo y sin acción es una meta sin plan; sin corte posterior al punto de partida la revisión dice «sin
 * medición de resultado todavía» y jamás suma tareas como mejora; la falta de dato no se vuelve cero.
 *
 * Al final, LA CAPA QUE TOCA LA BASE con un doble de PostgREST en memoria (la base real es Postgres embebido
 * en tests/sql/revision.test.ts): `generar` lee y arma, falla en voz alta si no puede leer el plan; `guardar`
 * hace upsert por (company_id, semana) y no pisa la explicación que alguien ya escribió.
 *
 * REMATE V (13-10-2026) · LA REVISIÓN NO PONE PALABRAS EN BOCA DE NADIE. Cuatro reparos que estas pruebas cierran:
 * (a) las cajas «Decisión» y «Qué sigue» nacían rellenas con la propuesta del sistema y «Guardar» la escribía como
 * si la consultora la hubiera decidido; (b) toda acción reportada salía «dentro del plazo» sin comparar fechas;
 * (c) «meta sin plan» solo miraba uno de los dos sentidos del vínculo entre indicador y acción; (d) la semana por
 * defecto era la que empieza y se contaba en UTC, el sistema firmaba como «La consultora» ante el dueño, y quien
 * revisaba quedaba escrito en `creada_por`. La parte de pantalla se prueba leyendo el código fuente del componente:
 * aquí no hay navegador, así que eso protege la causa, no demuestra el comportamiento en uno.
 *
 * CIERRE DEL REMATE V (13-10-2026) · lo que un verificador dejó abierto. Sin la migración de las columnas,
 * «Marcar revisada» lanzaba y la ruta respondía 500: ahora marca como antes (en `creada_por`, sin fecha) y lo
 * avisa. La fila «Empieza» heredaba el retraso del reporte y se pintaba «ocurrió con retraso»: el plazo juzga el
 * vencimiento y va en la fila que vence. Volver a marcar reemplazaba a quien revisó primero: la primera marca
 * manda. Y la ruta y las páginas solo se probaban como texto: al final se OPERAN (GET, POST y el primer pintado
 * de las dos páginas) con el doble de base enchufado en `supabaseAdmin()`. Siguen sin operarse los clics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import path from "path";
import {
  armar, generar, guardar, paraCliente, lunesDe, esLunes, rangoSemana, sumarDias, periodosQueCierranEn, nombreDeSemana, resultadoDe,
  textoDecisiones, TEXTO_SIN_MEDICION, DESVIO_TEXTO, TIPOS_DESVIO,
  plazoDe, textoPlazo, metaSinPlan, semanaPorDefecto, semanaEnCurso, diaEnZona, zonaValida, zonaDeEmpresa, ZONA_POR_DEFECTO, QUIEN_CLIENTE,
  escritoDe, camposEditados, cuerpoDeGuardado, conPropuesta, aplicarEscrito, semanaTerminada, errorSemanaSinTerminar,
  ERROR_SIN_EXPLICACION, ERROR_REVISADA_SIN_EXPLICACION, AVISO_MARCA_SIN_FECHA, AVISO_YA_REVISADA, faltanColumnasDeRevisada,
  type Entrada, type Revision, type Guardado,
} from "@/lib/revision-semanal";
import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { contextoPortal } from "@/lib/portal";
import { accionVacia, type AccionPlan } from "@/lib/plan-intervencion";
import type { Kpi } from "@/lib/kpis";
import type { Medicion } from "@/lib/medicion";

// La pantalla de la consultora se pinta en servidor más abajo; fuera de Next no hay enrutador que refrescar.
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));

/**
 * Para OPERAR la ruta y las páginas (al final del archivo): `supabaseAdmin()` devuelve el doble de base que la
 * prueba enchufe, la sesión es la que la prueba diga y el rastro de auditoría se anota en memoria. Si una prueba
 * no enchufa un doble, pedir el cliente lanza: desde aquí no se llega a ninguna base real.
 */
const enchufe = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => {
    if (!enchufe.sb) throw new Error("La prueba no enchufó un doble de base: desde aquí no se toca ninguna base real.");
    return enchufe.sb;
  },
}));
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));
vi.mock("@/lib/portal", () => ({ contextoPortal: vi.fn() }));

const EMP = "0000000a-0000-4000-8000-00000000000a";
const ROSA = { id: "p1000000-0000-4000-8000-000000000001", nombre: "Rosa Quispe", puesto: "Encargada de tienda" };
/** Martes 13 de octubre de 2026 al mediodía: la semana que se revisa es la anterior, del 5 al 11. */
const HOY = new Date("2026-10-13T12:00:00Z");
const SEMANA = "2026-10-05";

function accion(parcial: Partial<AccionPlan> & { id: string; accion: string }): AccionPlan {
  return accionVacia({ company_id: EMP, estado: "en_ejecucion", responsable_participant_id: ROSA.id, es_prioridad: true, ...parcial });
}

function kpi(parcial: Partial<Kpi> & { id: string; nombre: string }): Kpi {
  return {
    company_id: EMP, clave: parcial.nombre.toLowerCase().replace(/\s+/g, "_"), como_se_mide: "Se cuenta", mejor_si: "baja", origen: "manual", origen_texto: null, estado: "activo",
    definicion: "Qué mide", formula: "Cómo", unidad: "unidades", moneda: null, fuente: "Cuaderno de caja", responsable_participant_id: ROSA.id, frecuencia: "mensual",
    linea_base_valor: 8, linea_base_periodo: "2026-07", linea_base_medicion_id: null, meta_valor: null, meta_texto: null, meta_plazo: null,
    valor_actual: 5, valor_actual_periodo: "2026-09", valor_actual_at: "2026-10-02T10:00:00Z", estado_validacion: "declarado",
    umbral_alerta: null, umbral_sentido: null, accion_asociada_id: "a0000000-0000-4000-8000-000000000099", decision_asociada: null, tipo_indicador: "resultado",
    ...parcial,
  };
}

const LINEA_BASE: Medicion = { id: "m0000000-0000-4000-8000-000000000001", tipo: "linea_base", numero: 0, fecha: "2026-09-01", valores: { venta_mes: 40000 }, derivados: {}, nota: null, version: 1, vigente: true, hash_contenido: "abc" };

function entrada(parcial: Partial<Entrada> = {}): Entrada {
  return { companyId: EMP, acciones: [], historial: [], indicadores: [], valores: [], evidencias: [], participantes: [ROSA], mediciones: [LINEA_BASE], textos: null, ...parcial };
}

describe("la semana: se nombra por su lunes y va de lunes a domingo", () => {
  it("lunesDe: un martes, un domingo y el propio lunes caen en el mismo lunes", () => {
    expect(lunesDe("2026-10-13")).toBe("2026-10-12");
    expect(lunesDe("2026-10-11")).toBe("2026-10-05");
    expect(lunesDe("2026-10-05")).toBe("2026-10-05");
    expect(lunesDe(HOY)).toBe("2026-10-12");
  });
  it("esLunes rechaza un día que no es lunes, una fecha inválida y un texto cualquiera", () => {
    expect(esLunes("2026-10-05")).toBe(true);
    expect(esLunes("2026-10-06")).toBe(false);
    expect(esLunes("2026-02-30")).toBe(false);
    expect(esLunes("hoy")).toBe(false);
    expect(esLunes(null)).toBe(false);
  });
  it("rangoSemana da el domingo y el lunes siguiente; con un día que no es lunes, lanza", () => {
    expect(rangoSemana(SEMANA)).toEqual({ desde: "2026-10-05", hasta: "2026-10-11", hastaExclusivo: "2026-10-12" });
    expect(() => rangoSemana("2026-10-06")).toThrow(/no es un lunes/);
    expect(sumarDias("2026-10-05", -7)).toBe("2026-09-28");
    expect(nombreDeSemana(SEMANA)).toBe("Semana del 5 oct 2026 al 11 oct 2026");
  });
  it("periodosQueCierranEn: la semana anterior para un semanal; el mes solo si el día 1 cayó en la semana; siete días para un diario", () => {
    expect(periodosQueCierranEn("semanal", SEMANA)).toEqual(["2026-S40"]);
    expect(periodosQueCierranEn("mensual", SEMANA)).toEqual([]);
    expect(periodosQueCierranEn("mensual", "2026-09-28")).toEqual(["2026-09"]);
    expect(periodosQueCierranEn("quincenal", "2026-10-12")).toEqual(["2026-10-Q1"]);
    expect(periodosQueCierranEn("diaria", SEMANA)).toHaveLength(7);
    expect(periodosQueCierranEn("trimestral", "2026-09-28")).toEqual(["2026-T3"]);
  });
});

describe("1 · qué debía ocurrir, 2 · qué ocurrió, 3 · evidencia", () => {
  it("una acción que empieza y otra que vence en la semana entran; lo rechazado y lo pospuesto no", () => {
    const r = armar(entrada({
      acciones: [
        accion({ id: "a1", accion: "Cotizar sin el dueño", estado: "aprobado", fecha_inicio: "2026-10-06" }),
        accion({ id: "a2", accion: "Cerrar caja a diario", estado: "verificado", vence_at: "2026-10-09" }),
        accion({ id: "a3", accion: "Esto se rechazó", estado: "rechazado", vence_at: "2026-10-09" }),
        accion({ id: "a4", accion: "Fuera de la semana", vence_at: "2026-10-20" }),
      ],
    }), SEMANA, HOY);
    expect(r.que_debia_ocurrir.map((x) => [x.tipo, x.id, x.cumplido])).toEqual([
      ["accion_empieza", "a1", false],
      ["accion_vence", "a2", true],
    ]);
    expect(r.que_debia_ocurrir[0]!.responsable).toBe("Rosa Quispe");
    expect(r.referencia).toBe("2026-10-11");
  });

  it("un indicador semanal sin valor para la semana que cerró queda «sin dato», nunca cero ni cumplido", () => {
    const k = kpi({ id: "k1", nombre: "Devoluciones de la semana", frecuencia: "semanal", valor_actual: null, valor_actual_periodo: null, valor_actual_at: null });
    const r = armar(entrada({ indicadores: [k] }), SEMANA, HOY);
    const x = r.que_debia_ocurrir.find((e) => e.clase === "indicador");
    expect(x).toMatchObject({ tipo: "indicador_valor", id: "k1", periodos: ["2026-S40"], periodos_con_valor: [], cumplido: false });
    expect(x!.detalle).toMatch(/sin dato/i);
    expect(x!.detalle).toMatch(/no es cero/i);
    expect(x!.detalle).not.toMatch(/\b0\b/);
  });

  it("con el valor registrado (en cualquier momento) el periodo está cumplido; un indicador archivado no pide nada", () => {
    const k = kpi({ id: "k1", nombre: "Devoluciones de la semana", frecuencia: "semanal" });
    const r = armar(entrada({ indicadores: [k, kpi({ id: "k2", nombre: "Archivado", frecuencia: "semanal", estado: "archivado" })], valores: [{ indicador_id: "k1", periodo: "2026-S40", valor: 3, created_at: "2026-10-14T09:00:00Z" }] }), SEMANA, HOY);
    expect(r.que_debia_ocurrir.filter((e) => e.clase === "indicador")).toHaveLength(1);
    expect(r.que_debia_ocurrir[0]).toMatchObject({ id: "k1", cumplido: true });
  });

  it("qué ocurrió: solo el historial y los valores registrados dentro de la semana, con quién y en pasado", () => {
    const r = armar(entrada({
      acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño" })],
      indicadores: [kpi({ id: "k1", nombre: "Devoluciones" })],
      historial: [
        { action_id: "a1", accion: "aprobar", motivo: null, actor_rol: "consultor", created_at: "2026-10-05T09:00:00Z" },
        { action_id: "a1", accion: "reportar", motivo: null, actor_rol: "cliente", created_at: "2026-10-09T18:30:00Z" },
        // El lunes 12 a las 00:00:01 de Lima (05:00:01 UTC) ya es la semana siguiente: la semana es la de la empresa.
        { action_id: "a1", accion: "verificar", motivo: "visto", actor_rol: "consultor", created_at: "2026-10-12T05:00:01Z" },
      ],
      valores: [
        { indicador_id: "k1", periodo: "2026-09", valor: 5, estado_validacion: "conciliado", created_at: "2026-10-07T12:00:00Z" },
        { indicador_id: "k1", periodo: "2026-08", valor: 7, created_at: "2026-09-07T12:00:00Z" },
      ],
    }), SEMANA, HOY);
    expect(r.que_ocurrio.map((o) => o.texto)).toEqual([
      "La consultora aprobó «Cotizar sin el dueño»",
      "«Devoluciones»: 5 unidades para Setiembre 2026 (conciliado con los documentos)",
      "La empresa reportó «Cotizar sin el dueño»",
    ]);
    expect(r.que_ocurrio[2]!.texto_cliente).toBe("Tu equipo envió para revisar «Cotizar sin el dueño»");
  });

  it("evidencia: las pruebas ligadas a las acciones de la semana, no las de otras acciones", () => {
    const r = armar(entrada({
      acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño", vence_at: "2026-10-09" }), accion({ id: "a9", accion: "Otra" })],
      evidencias: [
        { id: "e1", action_id: "a1", tipo: "foto", nombre: "cotizacion.jpg", nota: null, created_at: "2026-10-08T10:00:00Z" },
        { id: "e2", action_id: "a9", tipo: "nota", nombre: null, nota: "ajena", created_at: "2026-10-08T10:00:00Z" },
      ],
    }), SEMANA, HOY);
    expect(r.evidencia.map((e) => e.id)).toEqual(["e1"]);
    expect(r.evidencia[0]!.accion).toBe("Cotizar sin el dueño");
  });
});

describe("4 · desvíos, cada uno con la decisión que exige", () => {
  it("una acción vencida sin reportar → retraso con decisión propuesta (reprogramar o pedir el reporte a la persona)", () => {
    const r = armar(entrada({ acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño", estado: "en_ejecucion", vence_at: "2026-10-07" })] }), SEMANA, HOY);
    const d = r.desvios.find((x) => x.tipo === "retraso");
    expect(d).toMatchObject({ clase: "accion", id: "a1", titulo: "Cotizar sin el dueño", enlace: `/empresa/${EMP}/plan#accion-a1` });
    expect(d!.detalle).toMatch(/Vencía el 7 oct 2026 \(hace 4 días\)/);
    expect(d!.decision_propuesta).toMatch(/Reprogramar el plazo de «Cotizar sin el dueño»/);
    expect(d!.decision_propuesta).toMatch(/pedir el reporte a Rosa Quispe/);
    expect(r.decision_propuesta).toContain(d!.decision_propuesta);
  });

  it("vencida pero ya reportada o verificada no es retraso; vencida en el futuro de la semana en curso tampoco", () => {
    const enCurso = armar(entrada({ acciones: [accion({ id: "a1", accion: "Vence el jueves", vence_at: "2026-10-15" })] }), "2026-10-12", HOY);
    expect(enCurso.referencia).toBe("2026-10-13");
    expect(enCurso.desvios.filter((d) => d.tipo === "retraso")).toEqual([]);
    expect(enCurso.que_debia_ocurrir[0]).toMatchObject({ tipo: "accion_vence", cumplido: null });
    const hecha = armar(entrada({ acciones: [accion({ id: "a2", accion: "Ya reportada", estado: "reportado", vence_at: "2026-10-07", reportado_at: "2026-10-08T10:00:00Z" })] }), SEMANA, HOY);
    expect(hecha.desvios).toEqual([]);
  });

  it("un indicador mensual con el último valor de hace 60 días → dato viejo que pide registrar el valor de setiembre", () => {
    const k = kpi({ id: "k1", nombre: "Devoluciones al mes", frecuencia: "mensual", valor_actual: 4, valor_actual_periodo: "2026-07", valor_actual_at: "2026-08-12T10:00:00Z" });
    const r = armar(entrada({ indicadores: [k] }), SEMANA, HOY);
    const d = r.desvios.find((x) => x.tipo === "datos_desactualizados");
    expect(d).toMatchObject({ clase: "indicador", id: "k1", enlace: `/empresa/${EMP}/kpis#indicador-k1` });
    expect(d!.detalle).toMatch(/60 días/);
    expect(d!.decision_propuesta).toMatch(/Registrar el valor de Setiembre 2026 de «Devoluciones al mes» \(lo cuenta Rosa Quispe\)/);
    expect(d!.decision_propuesta).toMatch(/sin dato, no como cero/);
  });

  it("una acción en marcha sin persona a cargo → sin responsable, aunque tenga un nombre suelto", () => {
    const r = armar(entrada({ acciones: [accion({ id: "a1", accion: "Ordenar el almacén", estado: "aprobado", responsable_participant_id: null, responsable: "Carlos" })] }), SEMANA, HOY);
    const d = r.desvios.find((x) => x.tipo === "sin_responsable");
    expect(d!.detalle).toMatch(/«Carlos» es un nombre suelto/);
    expect(d!.decision_propuesta).toBe("Asignar «Ordenar el almacén» a una persona del equipo (reasignar responsable).");
    // Una propuesta sin responsable no es un desvío de ejecución: todavía no se aprobó.
    const propuesta = armar(entrada({ acciones: [accion({ id: "a2", accion: "Propuesta", estado: "propuesto", responsable_participant_id: null })] }), SEMANA, HOY);
    expect(propuesta.desvios).toEqual([]);
  });

  it("una meta con plazo y sin acción que la persiga → meta sin plan", () => {
    const k = kpi({ id: "k1", nombre: "Devoluciones al mes", meta_valor: 2, meta_plazo: "2026-12-31", accion_asociada_id: null });
    const r = armar(entrada({ indicadores: [k] }), SEMANA, HOY);
    const d = r.desvios.find((x) => x.tipo === "metas_sin_plan");
    expect(d).toBeDefined();
    expect(d!.decision_propuesta).toMatch(/Ligar una acción del plan a «Devoluciones al mes» \(meta 2 unidades para el 31 dic 2026\)/);
    const conPlan = armar(entrada({ indicadores: [kpi({ id: "k2", nombre: "Con plan", meta_valor: 2, meta_plazo: "2026-12-31" })] }), SEMANA, HOY);
    expect(conPlan.desvios.filter((x) => x.tipo === "metas_sin_plan")).toEqual([]);
  });

  it("reportada hace más de 7 días sin verificar → verificación pendiente; hace 2 días, no", () => {
    const r = armar(entrada({
      acciones: [
        accion({ id: "a1", accion: "Vieja", estado: "reportado", reportado_at: "2026-09-20T10:00:00Z" }),
        accion({ id: "a2", accion: "Fresca", estado: "reportado", reportado_at: "2026-10-09T10:00:00Z" }),
      ],
      evidencias: [{ id: "e1", action_id: "a1", tipo: "foto", nombre: null, nota: null, created_at: "2026-09-20T09:00:00Z" }],
    }), SEMANA, HOY);
    const pendientes = r.desvios.filter((x) => x.tipo === "verificaciones_pendientes");
    expect(pendientes.map((d) => d.id)).toEqual(["a1"]);
    expect(pendientes[0]!.detalle).toMatch(/Reportada hace 21 días .* 1 prueba\./);
    expect(pendientes[0]!.decision_propuesta).toMatch(/Verificada no es resultado/);
  });

  it("los cinco tipos tienen nombre para la pantalla y salen en el orden de Dirección", () => {
    expect(TIPOS_DESVIO).toEqual(["retraso", "datos_desactualizados", "sin_responsable", "metas_sin_plan", "verificaciones_pendientes"]);
    for (const t of TIPOS_DESVIO) expect(DESVIO_TEXTO[t]).toBeTruthy();
    const r = armar(entrada({
      acciones: [
        accion({ id: "a1", accion: "Tarde y sin dueño", estado: "en_ejecucion", vence_at: "2026-10-06", responsable_participant_id: null }),
        accion({ id: "a2", accion: "Reportada vieja", estado: "reportado", reportado_at: "2026-09-01T10:00:00Z" }),
      ],
      indicadores: [kpi({ id: "k1", nombre: "Viejo y sin plan", valor_actual_at: "2026-08-01T00:00:00Z", meta_valor: 1, meta_plazo: "2026-12-31", accion_asociada_id: null })],
    }), SEMANA, HOY);
    expect(r.desvios.map((d) => d.tipo)).toEqual(["retraso", "datos_desactualizados", "sin_responsable", "metas_sin_plan", "verificaciones_pendientes"]);
  });

  it("sin desvíos, la decisión propuesta lo dice; sin plan ni indicadores, dice que la primera decisión es tener uno", () => {
    expect(textoDecisiones([])).toMatch(/Sin desvíos detectados/);
    expect(textoDecisiones([], true)).toMatch(/Todavía no hay plan ni indicadores/);
    const r = armar(entrada(), SEMANA, HOY);
    expect(r.vacia).toBe(true);
  });
});

describe("el resultado empresarial no sale de las tareas", () => {
  it("sin corte posterior al punto de partida → «sin medición de resultado todavía», aunque haya tareas verificadas", () => {
    const r = armar(entrada({ acciones: [accion({ id: "a1", accion: "Hecha y comprobada", estado: "verificado", vence_at: "2026-10-07", verificado_at: "2026-10-08T10:00:00Z" })] }), SEMANA, HOY);
    expect(r.resultado.estado).toBe("sin_medicion_todavia");
    expect(r.resultado.texto).toContain(TEXTO_SIN_MEDICION);
    expect(r.resultado.texto).toMatch(/versión 1, del 1 sep 2026/);
    expect(r.resultado.texto).toMatch(/es ejecución/);
    expect(r.resultado.texto_cliente).toContain(TEXTO_SIN_MEDICION);
  });
  it("sin punto de partida → no hay contra qué medir; con corte posterior → remite al corte y a su versión, sin juzgar aquí", () => {
    expect(resultadoDe([]).estado).toBe("sin_punto_de_partida");
    const corte: Medicion = { id: "c1", tipo: "corte", numero: 1, fecha: "2026-10-01", valores: {}, derivados: {}, nota: null, linea_base_id: LINEA_BASE.id, hash_contenido: "x" };
    const con = resultadoDe([LINEA_BASE, corte]);
    expect(con.estado).toBe("con_corte");
    expect(con.corte).toEqual({ id: "c1", numero: 1, fecha: "2026-10-01", version_base: 1 });
    expect(con.texto).toMatch(/medido contra la versión 1/);
    expect(con.texto).not.toMatch(/mejoró|empeoró/);
  });
  it("un corte anterior al punto de partida vigente y sin versión registrada no cuenta como medición posterior", () => {
    const viejo: Medicion = { id: "c0", tipo: "corte", numero: 1, fecha: "2026-08-15", valores: {}, derivados: {}, nota: null };
    expect(resultadoDe([LINEA_BASE, viejo]).estado).toBe("sin_medicion_todavia");
  });
});

describe("7 · siguiente, y los textos de la consultora", () => {
  it("lo que la semana próxima pide: acciones que empiezan o vencen entre el 12 y el 18; lo verificado no", () => {
    const r = armar(entrada({
      acciones: [
        accion({ id: "a1", accion: "Empieza el lunes", estado: "aprobado", fecha_inicio: "2026-10-12" }),
        accion({ id: "a2", accion: "Vence el jueves", vence_at: "2026-10-15" }),
        accion({ id: "a3", accion: "Ya verificada", estado: "verificado", vence_at: "2026-10-15" }),
      ],
    }), SEMANA, HOY);
    expect(r.siguiente_propuesto.map((x) => [x.tipo, x.id])).toEqual([["accion_empieza", "a1"], ["accion_vence", "a2"]]);
    expect(r.siguiente_texto).toBe("· Empieza «Empieza el lunes» (Rosa Quispe) el 12 oct 2026.\n· Vence «Vence el jueves» (Rosa Quispe) el 15 oct 2026.");
  });
  it("la explicación queda vacía hasta que alguien la escriba; lo guardado se trae tal cual", () => {
    expect(armar(entrada(), SEMANA, HOY).explicacion).toBeNull();
    const r = armar(entrada({ textos: { explicacion: "Feria del 8: nadie estuvo en tienda.", decision_necesaria: "Mover el plazo.", siguiente: "  ", creada_por: "u1" } }), SEMANA, HOY);
    expect(r.explicacion).toBe("Feria del 8: nadie estuvo en tienda.");
    expect(r.decision_necesaria).toBe("Mover el plazo.");
    expect(r.siguiente).toBeNull();
    expect(r.revisada).toBe(true);
  });
});

describe("para el dueño: frases cortas, sin culpa y sin jerga", () => {
  it("qué se esperaba, qué se hizo y qué falta, con el siguiente paso; lo que es de la consultora no se le echa encima", () => {
    const r = armar(entrada({
      acciones: [
        accion({ id: "a1", accion: "Cotizar sin el dueño", estado: "en_ejecucion", vence_at: "2026-10-07" }),
        accion({ id: "a2", accion: "Ordenar el almacén", estado: "aprobado", responsable_participant_id: null, fecha_inicio: "2026-10-06" }),
        accion({ id: "a3", accion: "Propuesta invisible", estado: "propuesto", vence_at: "2026-10-07" }),
      ],
      indicadores: [kpi({ id: "k1", nombre: "Devoluciones de la semana", frecuencia: "semanal", valor_actual: null, valor_actual_periodo: null, valor_actual_at: null, meta_valor: 1, meta_plazo: "2026-12-31", accion_asociada_id: null })],
      historial: [{ action_id: "a1", accion: "iniciar", motivo: null, actor_rol: "cliente", created_at: "2026-10-06T10:00:00Z" }],
    }), SEMANA, HOY);
    const c = paraCliente(r);
    expect(c.esperado).toEqual([
      "Terminar «Cotizar sin el dueño» (Rosa Quispe) para el 7 oct 2026.",
      "Empezar «Ordenar el almacén» el 6 oct 2026.",
      "Anotar «Devoluciones de la semana» de Semana 40 de 2026.",
    ]);
    expect(c.hecho).toEqual(["Tu equipo empezó «Cotizar sin el dueño»."]);
    expect(c.falta).toEqual([
      "«Cotizar sin el dueño» sigue pendiente; vencía el 7 oct 2026. Cuando la termines, pulsa «Ya lo hice» y sube una prueba.",
      "«Ordenar el almacén» todavía no empezó; estaba previsto para el 6 oct 2026.",
      "Falta anotar «Devoluciones de la semana» de Semana 40 de 2026. Si no tienes el dato, se anota como sin dato, no como cero.",
    ]);
    const todo = JSON.stringify(c).toLowerCase();
    for (const jerga of ["kpi", "baseline", "reportad", "verificad", "reasignar", "meta sin plan"]) expect(todo).not.toContain(jerga);
    expect(c.resultado).toContain(TEXTO_SIN_MEDICION);
  });
});

// ───────────────────────── LA CAPA QUE TOCA LA BASE, CON UN DOBLE ─────────────────────────

type Fila = Record<string, unknown>;
type Op = "select" | "insert" | "update";

/**
 * Un doble de PostgREST en memoria: filtra con eq/in/not/gte/lt, escribe insert/update y anota cada escritura.
 * `sinColumnas` simula una base a la que le falta una migración: pedir o escribir una de esas columnas devuelve
 * el error que daría la base, y no se escribe nada.
 */
function dobleDeBase(tablas: Record<string, Fila[]>, fallar: Partial<Record<string, { op: Op; mensaje: string }>> = {}, sinColumnas: Record<string, string[]> = {}) {
  const escrituras: { tabla: string; op: Op; datos: Fila }[] = [];
  let seq = 0;
  const from = (tabla: string) => {
    const faltan = sinColumnas[tabla] ?? [];
    const laQueFalta = (nombres: string[]) => nombres.map((n) => n.trim()).find((n) => faltan.includes(n)) ?? null;
    const filtros: ((f: Fila) => boolean)[] = [];
    let modo: Op = "select";
    let cuerpo: Fila = {};
    let insertada: Fila | null = null;
    let columnaQueFalta: string | null = null;
    const filas = () => (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
    const ejecutar = () => {
      const fallo = fallar[tabla];
      if (fallo && fallo.op === modo) return { data: null, error: { message: fallo.mensaje } };
      if (columnaQueFalta) return { data: null, error: { message: `column ${tabla}.${columnaQueFalta} does not exist` } };
      if (modo === "update") {
        const objetivo = filas();
        for (const f of objetivo) Object.assign(f, cuerpo);
        escrituras.push({ tabla, op: "update", datos: { ...cuerpo } });
        return { data: objetivo, error: null };
      }
      if (modo === "insert") return { data: insertada ? [insertada] : [], error: null };
      return { data: filas(), error: null };
    };
    const q = {
      select: (columnas?: string) => { if (modo === "select" && columnas) columnaQueFalta = laQueFalta(columnas.split(",")); return q; },
      order: () => q,
      limit: () => q,
      eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[k])); return q; },
      not: (k: string) => { filtros.push((f) => f[k] != null); return q; },
      gte: (k: string, v: string) => { filtros.push((f) => String(f[k]) >= v); return q; },
      lt: (k: string, v: string) => { filtros.push((f) => String(f[k]) < v); return q; },
      update: (datos: Fila) => { modo = "update"; cuerpo = datos; columnaQueFalta = laQueFalta(Object.keys(datos)); return q; },
      insert: (datos: Fila) => {
        modo = "insert";
        columnaQueFalta = laQueFalta(Object.keys(datos));
        if (!(fallar[tabla]?.op === "insert") && !columnaQueFalta) {
          seq += 1;
          insertada = { id: `${tabla}-${seq}`, ...datos };
          (tablas[tabla] ??= []).push(insertada);
          escrituras.push({ tabla, op: "insert", datos: insertada });
        }
        return q;
      },
      maybeSingle: async () => { const r = ejecutar(); return { data: r.error ? null : (r.data?.[0] ?? null), error: r.error }; },
      single: async () => { const r = ejecutar(); const d = r.data?.[0] ?? null; return { data: d, error: r.error ?? (d ? null : { message: "no hay fila" }) }; },
      then: (res: (v: { data: Fila[] | null; error: { message: string } | null }) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  return { sb: { from } as unknown as Parameters<typeof generar>[2], escrituras, tablas };
}

function tablasBase(): Record<string, Fila[]> {
  return {
    actions: [{ id: "a1", company_id: EMP, accion: "Cotizar sin el dueño", estado: "en_ejecucion", vence_at: "2026-10-07", responsable_participant_id: ROSA.id, es_prioridad: true, evidencia_ids: [], depende_de: [] }],
    participants: [{ id: ROSA.id, company_id: EMP, nombre: ROSA.nombre, puesto: ROSA.puesto }],
    indicadores: [{ id: "k1", company_id: EMP, clave: "devoluciones", nombre: "Devoluciones al mes", como_se_mide: "x", unidad: "unidades", mejor_si: "baja", frecuencia: "mensual", estado: "activo", fuente: "Cuaderno", responsable_participant_id: ROSA.id, tipo_indicador: "resultado", valor_actual: "4", valor_actual_periodo: "2026-07", valor_actual_at: "2026-08-12T10:00:00Z", linea_base_valor: "8", linea_base_periodo: "2026-06", accion_asociada_id: "a1" }],
    indicador_valores: [{ indicador_id: "k1", periodo: "2026-07", valor: "4", created_at: "2026-08-12T10:00:00Z" }],
    evidencias: [{ id: "e1", company_id: EMP, action_id: "a1", tipo: "foto", nombre: "foto.jpg", nota: null, created_at: "2026-10-08T10:00:00Z" }],
    accion_historial: [
      { id: "h1", action_id: "a1", accion: "aprobar", motivo: null, actor_rol: "consultor", created_at: "2026-10-05T09:00:00Z" },
      { id: "h2", action_id: "a1", accion: "comentar", motivo: "fuera de semana", actor_rol: "consultor", created_at: "2026-10-12T09:00:00Z" },
    ],
    mediciones: [{ ...LINEA_BASE, company_id: EMP }],
    revisiones_semanales: [],
  };
}

describe("generar: lee con el cliente que recibe, arma y no escribe", () => {
  it("arma la semana con lo leído: lo esperado, lo ocurrido dentro de la semana, la evidencia y los desvíos", async () => {
    const { sb, escrituras } = dobleDeBase(tablasBase());
    const r = await generar(EMP, SEMANA, sb, HOY);
    expect(r.que_debia_ocurrir.map((x) => x.id)).toEqual(["a1"]);
    expect(r.que_ocurrio.map((o) => o.texto)).toEqual(["La consultora aprobó «Cotizar sin el dueño»"]);
    expect(r.evidencia.map((e) => e.id)).toEqual(["e1"]);
    expect(r.desvios.map((d) => d.tipo)).toEqual(["retraso", "datos_desactualizados"]);
    expect(r.resultado.estado).toBe("sin_medicion_todavia");
    expect(r.explicacion).toBeNull();
    expect(escrituras).toEqual([]);
  });
  it("trae los textos ya guardados para esa semana, y solo para esa", async () => {
    const tablas = tablasBase();
    tablas.revisiones_semanales = [
      { id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1" },
      { id: "r2", company_id: EMP, semana: "2026-09-28", explicacion: "Otra semana.", decision_necesaria: null, siguiente: null, creada_por: null },
    ];
    const r = await generar(EMP, SEMANA, dobleDeBase(tablas).sb, HOY);
    expect(r.explicacion).toBe("Feria del 8.");
    expect(r.revisada).toBe(true);
  });
  it("si no puede leer el plan, falla en voz alta en vez de decir que no ocurrió nada", async () => {
    const { sb } = dobleDeBase(tablasBase(), { actions: { op: "select", mensaje: "relation does not exist" } });
    await expect(generar(EMP, SEMANA, sb, HOY)).rejects.toThrow(/No se pudo leer el plan: relation does not exist/);
  });
  it("una semana que no empieza en lunes se rechaza antes de leer nada", async () => {
    const { sb } = dobleDeBase(tablasBase());
    await expect(generar(EMP, "2026-10-06", sb, HOY)).rejects.toThrow(/no es un lunes/);
  });
});

describe("guardar: upsert por (company_id, semana) sin pisar lo que alguien escribió", () => {
  const revision = (parcial: Partial<Revision> = {}): Revision => ({ ...armar(entrada({ acciones: [accion({ id: "a1", accion: "Cotizar", vence_at: "2026-10-07" })] }), SEMANA, HOY), ...parcial });

  it("la primera vez inserta la fila con las cuatro listas y los textos en blanco", async () => {
    const { sb, escrituras, tablas } = dobleDeBase({ revisiones_semanales: [] });
    const g = await guardar(revision(), sb);
    expect(g).toEqual({ id: "revisiones_semanales-1", creada: true });
    expect(escrituras).toHaveLength(1);
    const fila = tablas.revisiones_semanales![0]!;
    expect(fila).toMatchObject({ company_id: EMP, semana: SEMANA, explicacion: null, decision_necesaria: null, siguiente: null, creada_por: null });
    expect(Array.isArray(fila.desvios)).toBe(true);
  });

  it("guardar de nuevo NO pisa la explicación existente cuando la revisión viene sin ella; sí refresca los desvíos", async () => {
    const { sb, escrituras, tablas } = dobleDeBase({
      revisiones_semanales: [{ id: "r1", company_id: EMP, semana: SEMANA, desvios: [], explicacion: "Feria del 8: nadie estuvo en tienda.", decision_necesaria: "Mover el plazo.", siguiente: null, creada_por: "u1" }],
    });
    const g = await guardar(revision({ explicacion: null, decision_necesaria: null, siguiente: null, creada_por: null }), sb);
    expect(g).toEqual({ id: "r1", creada: false });
    expect(escrituras[0]!.op).toBe("update");
    const fila = tablas.revisiones_semanales![0]!;
    expect(fila.explicacion).toBe("Feria del 8: nadie estuvo en tienda.");
    expect(fila.decision_necesaria).toBe("Mover el plazo.");
    expect(fila.creada_por).toBe("u1");
    expect((fila.desvios as unknown[]).length).toBe(1);
  });

  it("un texto nuevo sí reemplaza al viejo: es la persona escribiendo, no el sistema pisando", async () => {
    const { sb, tablas } = dobleDeBase({ revisiones_semanales: [{ id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Vieja.", decision_necesaria: null, siguiente: null, creada_por: null }] });
    await guardar(revision({ explicacion: "  Nueva explicación.  ", creada_por: "u2" }), sb);
    expect(tablas.revisiones_semanales![0]).toMatchObject({ explicacion: "Nueva explicación.", creada_por: "u2" });
  });

  it("otra semana de la misma empresa es otra fila, no un pisado", async () => {
    const { sb, tablas } = dobleDeBase({ revisiones_semanales: [{ id: "r1", company_id: EMP, semana: "2026-09-28", explicacion: "Otra.", decision_necesaria: null, siguiente: null, creada_por: null }] });
    const g = await guardar(revision(), sb);
    expect(g.creada).toBe(true);
    expect(tablas.revisiones_semanales).toHaveLength(2);
    expect(tablas.revisiones_semanales![0]!.explicacion).toBe("Otra.");
  });

  it("si la base no acepta la fila, lanza con el motivo: nada se da por guardado", async () => {
    const { sb } = dobleDeBase({ revisiones_semanales: [] }, { revisiones_semanales: { op: "insert", mensaje: "violates check" } });
    await expect(guardar(revision(), sb)).rejects.toThrow(/No se pudo guardar la revisión/);
  });
});

// ───────────────────────── REMATE V · LA REVISIÓN NO PONE PALABRAS EN BOCA DE NADIE ─────────────────────────

/** Martes 13 de octubre a las 10:00 de Lima: el momento en que la consultora guarda o marca. */
const AHORA = new Date("2026-10-13T15:00:00Z");
const RAIZ = path.resolve(__dirname, "..");
const fuente = (relativa: string) => readFileSync(path.join(RAIZ, relativa), "utf8");

describe("(a) la propuesta del sistema no se guarda como decisión de la consultora", () => {
  const PANTALLA = "src/components/revision/RevisionSemanal.tsx";
  const RUTA = "src/app/api/companies/[id]/revision/route.ts";

  it("estática: las cajas nacen de lo guardado (escritoDe), ningún useState arranca con la propuesta y la propuesta entra con «Usar esta propuesta»", () => {
    const src = fuente(PANTALLA);
    const estados = src.split("\n").filter((l) => l.includes("useState"));
    expect(estados.length).toBeGreaterThan(0);
    for (const l of estados) {
      expect(l).not.toContain("decision_propuesta");
      expect(l).not.toContain("siguiente_texto");
    }
    expect(src).toContain("escritoDe(revision)");
    expect(src).toContain("Usar esta propuesta");
    expect(src).toContain("conPropuesta(escrito.decision_necesaria, revision.decision_propuesta)");
    expect(src).toContain("conPropuesta(escrito.siguiente, revision.siguiente_texto)");
    // Lo que viaja al guardar sale de comparar lo guardado con lo escrito, no de las tres cajas enteras.
    expect(src).toContain("json: cuerpoDeGuardado(revision.semana, guardado, escrito, marcar)");
    expect(src).not.toMatch(/json:\s*\{/);
  });

  it("estática: la ruta aplica solo lo que llega (aplicarEscrito) y nunca lee la propuesta para guardarla", () => {
    const src = fuente(RUTA);
    expect(src).toContain("aplicarEscrito(");
    expect(src).not.toContain("decision_propuesta");
    expect(src).not.toContain("siguiente_texto");
    expect(src).not.toContain("creada_por");
  });

  it("escritoDe: con desvíos y propuesta del sistema, las tres cajas nacen vacías; con texto guardado, nacen con él", () => {
    const r = armar(entrada({ acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño", vence_at: "2026-10-07" }), accion({ id: "a2", accion: "Ordenar el almacén", vence_at: "2026-10-15" })] }), SEMANA, HOY);
    expect(r.decision_propuesta).toMatch(/Reprogramar el plazo/);
    expect(r.siguiente_texto).toMatch(/Vence «Ordenar el almacén»/);
    expect(escritoDe(r)).toEqual({ explicacion: "", decision_necesaria: "", siguiente: "" });
    const conTexto = armar(entrada({ textos: { explicacion: "Feria del 8.", decision_necesaria: "Mover el plazo.", siguiente: null, creada_por: null } }), SEMANA, HOY);
    expect(escritoDe(conTexto)).toEqual({ explicacion: "Feria del 8.", decision_necesaria: "Mover el plazo.", siguiente: "" });
  });

  it("cuerpoDeGuardado: solo viajan los campos editados; sin editar nada, solo la semana", () => {
    const vacias = { explicacion: "", decision_necesaria: "", siguiente: "" };
    expect(cuerpoDeGuardado(SEMANA, vacias, vacias)).toEqual({ semana: SEMANA });
    expect(cuerpoDeGuardado(SEMANA, vacias, { ...vacias, explicacion: "  Feria del 8.  " })).toEqual({ semana: SEMANA, explicacion: "Feria del 8." });
    expect(cuerpoDeGuardado(SEMANA, vacias, vacias, true)).toEqual({ semana: SEMANA, marcar_revisada: true });
    // Un espacio de más no es una edición; borrar el texto propio sí lo es, y viaja vacío.
    const guardado = { explicacion: "Feria del 8.", decision_necesaria: "Mover el plazo.", siguiente: "" };
    expect(camposEditados(guardado, { ...guardado, explicacion: "Feria del 8. " })).toEqual([]);
    expect(cuerpoDeGuardado(SEMANA, guardado, { ...guardado, decision_necesaria: "" })).toEqual({ semana: SEMANA, decision_necesaria: "" });
  });

  it("conPropuesta: en una caja vacía queda la propuesta; con texto, se añade debajo sin borrar nada; no se repite", () => {
    expect(conPropuesta("", "· Reprogramar.")).toBe("· Reprogramar.");
    expect(conPropuesta("   ", "· Reprogramar.")).toBe("· Reprogramar.");
    expect(conPropuesta("Hablé con Rosa.", "· Reprogramar.")).toBe("Hablé con Rosa.\n· Reprogramar.");
    expect(conPropuesta("Hablé con Rosa.\n· Reprogramar.", "· Reprogramar.")).toBe("Hablé con Rosa.\n· Reprogramar.");
    expect(conPropuesta("Hablé con Rosa.", "  ")).toBe("Hablé con Rosa.");
  });

  /** Una semana con un retraso (propuesta de decisión) y una acción que vence la semana próxima (propuesta de siguiente). */
  function tablasConPropuestas(): Record<string, Fila[]> {
    const tablas = tablasBase();
    tablas.actions!.push({ id: "a2", company_id: EMP, accion: "Ordenar el almacén", estado: "aprobado", vence_at: "2026-10-15", responsable_participant_id: ROSA.id, es_prioridad: true, evidencia_ids: [], depende_de: [] });
    return tablas;
  }

  it("guardar SOLO la explicación no escribe decisión ni siguiente, aunque el sistema proponga las dos; al reabrir siguen en blanco", async () => {
    const { sb, tablas } = dobleDeBase(tablasConPropuestas());
    const r = await generar(EMP, SEMANA, sb, HOY);
    expect(r.decision_propuesta).toMatch(/Reprogramar el plazo de «Cotizar sin el dueño»/);
    expect(r.siguiente_texto).toMatch(/Vence «Ordenar el almacén»/);
    const cajas = escritoDe(r);
    const cuerpo = cuerpoDeGuardado(SEMANA, cajas, { ...cajas, explicacion: "Feria del 8: nadie estuvo en tienda." });
    expect(Object.keys(cuerpo).sort()).toEqual(["explicacion", "semana"]);
    const aplicado = aplicarEscrito(r, cuerpo, "u-consultora", AHORA);
    if (!aplicado.ok) throw new Error(aplicado.error);
    expect(aplicado.vaciar).toEqual([]);
    await guardar(aplicado.revision, sb, { vaciar: aplicado.vaciar });
    const fila = tablas.revisiones_semanales![0]!;
    expect(fila).toMatchObject({ explicacion: "Feria del 8: nadie estuvo en tienda.", decision_necesaria: null, siguiente: null, revisada_at: null, revisada_por: null });
    expect(JSON.stringify([fila.explicacion, fila.decision_necesaria, fila.siguiente])).not.toContain("Reprogramar");
    const otraVez = await generar(EMP, SEMANA, sb, HOY);
    expect(escritoDe(otraVez)).toEqual({ explicacion: "Feria del 8: nadie estuvo en tienda.", decision_necesaria: "", siguiente: "" });
    expect(otraVez.decision_necesaria).toBeNull();
    expect(otraVez.revisada).toBe(false);
  });

  it("guardar sin editar nada escribe la foto de la semana y ningún texto", async () => {
    const { sb, tablas } = dobleDeBase(tablasConPropuestas());
    const r = await generar(EMP, SEMANA, sb, HOY);
    const aplicado = aplicarEscrito(r, cuerpoDeGuardado(SEMANA, escritoDe(r), escritoDe(r)), "u-consultora", AHORA);
    if (!aplicado.ok) throw new Error(aplicado.error);
    await guardar(aplicado.revision, sb, { vaciar: aplicado.vaciar });
    const fila = tablas.revisiones_semanales![0]!;
    expect(fila).toMatchObject({ explicacion: null, decision_necesaria: null, siguiente: null });
    expect((fila.desvios as unknown[]).length).toBeGreaterThan(0);
  });

  it("«Usar esta propuesta» sí la guarda: es la consultora quien la toma, y puede corregirla antes", async () => {
    const { sb, tablas } = dobleDeBase(tablasConPropuestas());
    const r = await generar(EMP, SEMANA, sb, HOY);
    const cajas = escritoDe(r);
    const tomada = conPropuesta(cajas.decision_necesaria, r.decision_propuesta);
    const aplicado = aplicarEscrito(r, cuerpoDeGuardado(SEMANA, cajas, { ...cajas, decision_necesaria: tomada }), "u-consultora", AHORA);
    if (!aplicado.ok) throw new Error(aplicado.error);
    await guardar(aplicado.revision, sb, { vaciar: aplicado.vaciar });
    expect(tablas.revisiones_semanales![0]).toMatchObject({ decision_necesaria: r.decision_propuesta, explicacion: null, siguiente: null });
  });

  it("un campo que no viaja conserva lo guardado; uno que la consultora vació se borra, y solo ese", async () => {
    const tablas = tablasConPropuestas();
    tablas.revisiones_semanales = [{ id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Feria del 8.", decision_necesaria: "Mover el plazo.", siguiente: "Llamar a Rosa.", creada_por: "u1", revisada_at: null, revisada_por: null }];
    const { sb } = dobleDeBase(tablas);
    const r = await generar(EMP, SEMANA, sb, HOY);
    const cajas = escritoDe(r);
    const aplicado = aplicarEscrito(r, cuerpoDeGuardado(SEMANA, cajas, { ...cajas, decision_necesaria: "" }), "u2", AHORA);
    if (!aplicado.ok) throw new Error(aplicado.error);
    expect(aplicado.vaciar).toEqual(["decision_necesaria"]);
    await guardar(aplicado.revision, sb, { vaciar: aplicado.vaciar });
    expect(tablas.revisiones_semanales[0]).toMatchObject({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: "Llamar a Rosa.", creada_por: "u1" });
  });

  it("aplicarEscrito no cambia la revisión que recibe", () => {
    const r = armar(entrada({ acciones: [accion({ id: "a1", accion: "Cotizar", vence_at: "2026-10-07" })] }), SEMANA, HOY);
    const antes = JSON.stringify(r);
    aplicarEscrito(r, { explicacion: "Algo.", marcar_revisada: true }, "u1", AHORA);
    expect(JSON.stringify(r)).toBe(antes);
  });
});

describe("(b) hecha no es «a tiempo»: se compara el día del reporte con el del vencimiento", () => {
  it("reportada antes de vencer → dentro del plazo, con las dos fechas", () => {
    const a = accion({ id: "a1", accion: "Cerrar caja a diario", estado: "reportado", vence_at: "2026-10-09", reportado_at: "2026-10-08T15:00:00Z" });
    expect(plazoDe(a)).toEqual({ tipo: "dentro_del_plazo", vence: "2026-10-09", dia: "2026-10-08", segun: "reporte" });
    const x = armar(entrada({ acciones: [a] }), SEMANA, HOY).que_debia_ocurrir[0]!;
    expect(x).toMatchObject({ tipo: "accion_vence", cumplido: true, plazo: "dentro_del_plazo" });
    expect(x.dias_retraso).toBeUndefined();
    expect(x.detalle).toBe("Reportada dentro del plazo: se reportó el 8 oct 2026 y vencía el 9 oct 2026.");
  });

  it("reportada después de vencer → «con retraso de N días», nunca «dentro del plazo»; ya no es un desvío abierto", () => {
    const a = accion({ id: "a1", accion: "Cotizar sin el dueño", estado: "reportado", vence_at: "2026-10-07", reportado_at: "2026-10-09T15:00:00Z" });
    const r = armar(entrada({ acciones: [a] }), SEMANA, HOY);
    const x = r.que_debia_ocurrir[0]!;
    expect(x).toMatchObject({ cumplido: true, plazo: "con_retraso", dias_retraso: 2 });
    expect(x.detalle).toBe("Reportada con retraso de 2 días: se reportó el 9 oct 2026 y vencía el 7 oct 2026.");
    expect(x.detalle).not.toMatch(/dentro del plazo/);
    expect(r.desvios.filter((d) => d.tipo === "retraso")).toEqual([]);
    // Un día es «día», no «días». Y verificada después no cambia cuándo se reportó.
    const unDia = accion({ id: "a2", accion: "Otra", estado: "verificado", vence_at: "2026-10-07", reportado_at: "2026-10-08T15:00:00Z", verificado_at: "2026-10-10T15:00:00Z" });
    expect(textoPlazo(plazoDe(unDia))).toBe("con retraso de 1 día: se reportó el 8 oct 2026 y vencía el 7 oct 2026");
  });

  it("sin vence_at → «sin fecha comprometida», ni a tiempo ni tarde", () => {
    const a = accion({ id: "a1", accion: "Ordenar el almacén", estado: "reportado", fecha_inicio: "2026-10-06", vence_at: null, reportado_at: "2026-10-09T15:00:00Z" });
    expect(plazoDe(a)).toEqual({ tipo: "sin_fecha_comprometida", dia: "2026-10-09" });
    const x = armar(entrada({ acciones: [a] }), SEMANA, HOY).que_debia_ocurrir[0]!;
    expect(x).toMatchObject({ tipo: "accion_empieza", cumplido: true, plazo: "sin_fecha_comprometida" });
    expect(x.detalle).toBe("Empezó y ya está reportada sin fecha comprometida (quedó hecha el 9 oct 2026).");
    expect(x.detalle).not.toMatch(/dentro del plazo|con retraso/);
    // Lo que empezó y sigue en marcha no lleva plazo: todavía no hay reporte que comparar.
    const enMarcha = armar(entrada({ acciones: [accion({ id: "a2", accion: "Sigue", estado: "en_ejecucion", fecha_inicio: "2026-10-06" })] }), SEMANA, HOY).que_debia_ocurrir[0]!;
    expect(enMarcha.detalle).toBe("Empezó (en ejecución).");
    expect(enMarcha.plazo).toBeUndefined();
  });

  it("el día del reporte es el de la empresa: a las 21:00 de Lima del día que vence todavía es a tiempo, aunque en UTC ya sea mañana", () => {
    const a = accion({ id: "a1", accion: "Cerrar caja", estado: "reportado", vence_at: "2026-10-07", reportado_at: "2026-10-08T02:00:00Z" });
    expect(plazoDe(a, "America/Lima").tipo).toBe("dentro_del_plazo");
    expect(plazoDe(a, "UTC")).toMatchObject({ tipo: "con_retraso", dias: 1 });
    expect(armar(entrada({ acciones: [a] }), SEMANA, HOY).que_debia_ocurrir[0]!.plazo).toBe("dentro_del_plazo");
    expect(armar(entrada({ acciones: [a], zona: "UTC" }), SEMANA, HOY).que_debia_ocurrir[0]!.plazo).toBe("con_retraso");
  });

  it("sin fecha de reporte no se acusa un retraso: verificada antes de vencer es a tiempo; verificada después, no se sabe", () => {
    const antes = accion({ id: "a1", accion: "Vieja", estado: "verificado", vence_at: "2026-10-09", reportado_at: null, verificado_at: "2026-10-08T15:00:00Z" });
    expect(plazoDe(antes)).toEqual({ tipo: "dentro_del_plazo", vence: "2026-10-09", dia: "2026-10-08", segun: "verificacion" });
    expect(textoPlazo(plazoDe(antes))).toMatch(/se verificó el 8 oct 2026/);
    const despues = accion({ id: "a2", accion: "Vieja", estado: "verificado", vence_at: "2026-10-07", reportado_at: null, verificado_at: "2026-10-10T15:00:00Z" });
    expect(plazoDe(despues)).toEqual({ tipo: "sin_fecha_de_reporte", vence: "2026-10-07", verificada: "2026-10-10" });
    expect(textoPlazo(plazoDe(despues))).toMatch(/no se puede decir si se reportó a tiempo/);
    expect(textoPlazo(plazoDe(despues))).not.toMatch(/con retraso|dentro del plazo/);
    const sinNada = accion({ id: "a3", accion: "Sin fechas", estado: "reportado", vence_at: "2026-10-07", reportado_at: null });
    const x = armar(entrada({ acciones: [sinNada] }), SEMANA, HOY).que_debia_ocurrir[0]!;
    expect(x.plazo).toBe("sin_fecha_de_reporte");
    expect(x.detalle).toBe("Reportada sin fecha de reporte registrada: no se puede decir si fue dentro del plazo (vencía el 7 oct 2026).");
  });

  it("lo que no está hecho no lleva plazo: sigue siendo «vencía y está…» o «vence el…»", () => {
    const r = armar(entrada({ acciones: [accion({ id: "a1", accion: "Cotizar", estado: "en_ejecucion", vence_at: "2026-10-07" })] }), SEMANA, HOY);
    expect(r.que_debia_ocurrir[0]!.plazo).toBeUndefined();
    expect(r.que_debia_ocurrir[0]!.detalle).toBe("Vencía el 7 oct 2026 y está en ejecución.");
  });

  it("estática: la pantalla marca «ocurrió con retraso» cuando el plazo lo dice", () => {
    const src = fuente("src/components/revision/RevisionSemanal.tsx");
    expect(src).toContain("ocurrió con retraso");
    expect(src).toMatch(/x\.plazo === "con_retraso"/);
  });
});

describe("(c) meta sin plan: el vínculo entre indicador y acción se mira en los dos sentidos", () => {
  const conMeta = (parcial: Partial<Kpi> = {}) => kpi({ id: "k1", nombre: "Devoluciones al mes", meta_valor: 2, meta_plazo: "2026-12-31", accion_asociada_id: null, ...parcial });
  const sinPlan = (e: Partial<Entrada>) => armar(entrada(e), SEMANA, HOY).desvios.filter((d) => d.tipo === "metas_sin_plan");

  it("la acción apunta al indicador por indicador_id y el indicador no apunta a nadie → NO es meta sin plan", () => {
    const k = conMeta();
    const a = accion({ id: "a1", accion: "Revisar cada devolución", indicador_id: "k1" });
    expect(metaSinPlan(k, [a])).toBeNull();
    expect(sinPlan({ indicadores: [k], acciones: [a] })).toEqual([]);
  });

  it("el indicador apunta a la acción por accion_asociada_id y la acción no apunta a nadie → tampoco", () => {
    const k = conMeta({ accion_asociada_id: "a1" });
    const a = accion({ id: "a1", accion: "Revisar cada devolución", indicador_id: null });
    expect(metaSinPlan(k, [a])).toBeNull();
    expect(sinPlan({ indicadores: [k], acciones: [a] })).toEqual([]);
  });

  it("ningún sentido → meta sin plan, con el plazo escrito para leer; una acción que apunta a OTRO indicador no cuenta", () => {
    const k = conMeta();
    const ajena = accion({ id: "a1", accion: "Otra cosa", indicador_id: "k9" });
    expect(metaSinPlan(k, [ajena])).toEqual({ motivo: "sin_accion" });
    const d = sinPlan({ indicadores: [k], acciones: [ajena] });
    expect(d).toHaveLength(1);
    expect(d[0]!.detalle).toBe("Tiene meta con plazo (31 dic 2026) y ninguna acción del plan que la persiga.");
  });

  it("una acción rechazada o pospuesta no persigue nada, la apunte quien la apunte", () => {
    const rechazada = accion({ id: "a1", accion: "Revisar cada devolución", estado: "rechazado", indicador_id: "k1" });
    expect(metaSinPlan(conMeta(), [rechazada])).toEqual({ motivo: "sin_accion" });
    const pospuesta = accion({ id: "a2", accion: "Llamar a quien devuelve", estado: "pospuesto" });
    const k = conMeta({ accion_asociada_id: "a2" });
    expect(metaSinPlan(k, [pospuesta])).toMatchObject({ motivo: "accion_fuera", estado: "pospuesto" });
    const d = sinPlan({ indicadores: [k], acciones: [pospuesta] });
    expect(d[0]!.detalle).toBe("Tiene meta con plazo (31 dic 2026) y la única acción ligada, «Llamar a quien devuelve», está pospuesta: hoy nadie la persigue.");
    // Si otra acción viva la apunta por indicador_id, vuelve a tener plan.
    expect(metaSinPlan(k, [pospuesta, accion({ id: "a3", accion: "Revisar cada devolución", indicador_id: "k1" })])).toBeNull();
  });

  it("negativo: meta sin plazo, o plazo sin meta, nunca es «meta sin plan»", () => {
    expect(metaSinPlan(conMeta({ meta_plazo: null }), [])).toBeNull();
    expect(metaSinPlan(conMeta({ meta_valor: null, meta_texto: null }), [])).toBeNull();
    expect(sinPlan({ indicadores: [conMeta({ meta_plazo: null })] })).toEqual([]);
    expect(sinPlan({ indicadores: [conMeta({ meta_valor: null, meta_texto: "  " })] })).toEqual([]);
    // Con meta escrita en palabras y plazo, sí.
    expect(sinPlan({ indicadores: [conMeta({ meta_valor: null, meta_texto: "Que no pase de dos" })] })).toHaveLength(1);
  });
});

describe("negativo: un indicador con el valor al día no es «dato viejo»", () => {
  it("mensual con valor de hace 9 días → sin desvío; el mismo con valor de hace 60 → dato viejo", () => {
    const fresco = kpi({ id: "k1", nombre: "Devoluciones al mes", frecuencia: "mensual", valor_actual: 5, valor_actual_periodo: "2026-09", valor_actual_at: "2026-10-02T10:00:00Z" });
    expect(armar(entrada({ indicadores: [fresco] }), SEMANA, HOY).desvios.filter((d) => d.tipo === "datos_desactualizados")).toEqual([]);
    const viejo = { ...fresco, valor_actual_at: "2026-08-12T10:00:00Z" };
    expect(armar(entrada({ indicadores: [viejo] }), SEMANA, HOY).desvios.filter((d) => d.tipo === "datos_desactualizados")).toHaveLength(1);
  });
  it("semanal anotado dentro de su límite → sin desvío y sin «sin dato»", () => {
    const k = kpi({ id: "k1", nombre: "Devoluciones de la semana", frecuencia: "semanal", valor_actual: 3, valor_actual_periodo: "2026-S40", valor_actual_at: "2026-10-06T14:00:00Z" });
    const r = armar(entrada({ indicadores: [k], valores: [{ indicador_id: "k1", periodo: "2026-S40", valor: 3, created_at: "2026-10-06T14:00:00Z" }] }), SEMANA, HOY);
    expect(r.desvios).toEqual([]);
    expect(r.que_debia_ocurrir[0]).toMatchObject({ id: "k1", cumplido: true });
  });
});

describe("(d) la semana por defecto es la que TERMINÓ, contada con el reloj de la empresa", () => {
  /** Lunes 12 de octubre de 2026 a las 00:30 de Lima. */
  const LUNES_0030_LIMA = new Date("2026-10-12T05:30:00Z");
  /** Domingo 11 de octubre a las 23:30 de Lima: en UTC ya es lunes 12. */
  const DOMINGO_2330_LIMA = new Date("2026-10-12T04:30:00Z");

  it("un lunes a las 00:30 de Lima: la semana en curso es la que empieza hoy y la que se revisa es la anterior", () => {
    expect(semanaEnCurso(LUNES_0030_LIMA)).toBe("2026-10-12");
    expect(semanaPorDefecto(LUNES_0030_LIMA)).toBe("2026-10-05");
    expect(semanaPorDefecto(LUNES_0030_LIMA, "America/Lima")).toBe("2026-10-05");
  });

  it("el domingo a las 23:30 de Lima todavía es la semana anterior, aunque en UTC ya sea lunes", () => {
    expect(lunesDe(DOMINGO_2330_LIMA)).toBe("2026-10-12"); // así contaba antes: en UTC
    expect(semanaEnCurso(DOMINGO_2330_LIMA)).toBe("2026-10-05");
    expect(semanaPorDefecto(DOMINGO_2330_LIMA)).toBe("2026-09-28");
    expect(semanaPorDefecto(DOMINGO_2330_LIMA, "UTC")).toBe("2026-10-05");
  });

  it("con la zona de la empresa: el lunes a las 00:30 de Madrid ya se revisa la semana que cerró allí", () => {
    const lunesMadrid = new Date("2026-10-11T22:30:00Z");
    expect(semanaPorDefecto(lunesMadrid, "Europe/Madrid")).toBe("2026-10-05");
    expect(semanaPorDefecto(lunesMadrid, "America/Lima")).toBe("2026-09-28");
  });

  it("diaEnZona y zonaValida: una zona que no existe se cuenta como Lima, no revienta", () => {
    expect(ZONA_POR_DEFECTO).toBe("America/Lima");
    expect(diaEnZona("2026-10-12T04:30:00Z", "America/Lima")).toBe("2026-10-11");
    expect(diaEnZona("2026-10-12T04:30:00Z", "UTC")).toBe("2026-10-12");
    expect(diaEnZona("2026-10-12T04:30:00Z", "Marte/Olimpo")).toBe("2026-10-11");
    expect(diaEnZona(null)).toBeNull();
    expect(diaEnZona("no es fecha")).toBeNull();
    expect(zonaValida("America/Bogota")).toBe(true);
    for (const mala of ["Marte/Olimpo", "", "   ", null, undefined, 5]) expect(zonaValida(mala)).toBe(false);
    expect(semanaPorDefecto(LUNES_0030_LIMA, "Marte/Olimpo")).toBe("2026-10-05");
  });

  it("zonaDeEmpresa: la de la empresa si es válida; Lima si falta, no vale o no se puede leer", async () => {
    const con = (fila: Fila | null, fallar = {}) => dobleDeBase({ companies: fila ? [{ id: EMP, ...fila }] : [] }, fallar).sb;
    expect(await zonaDeEmpresa(EMP, con({ zona_horaria: "America/Bogota" }))).toBe("America/Bogota");
    expect(await zonaDeEmpresa(EMP, con({ zona_horaria: null }))).toBe("America/Lima");
    expect(await zonaDeEmpresa(EMP, con({ zona_horaria: "Marte/Olimpo" }))).toBe("America/Lima");
    expect(await zonaDeEmpresa(EMP, con(null))).toBe("America/Lima");
    expect(await zonaDeEmpresa(EMP, con({ zona_horaria: "America/Bogota" }, { companies: { op: "select", mensaje: "column does not exist" } }))).toBe("America/Lima");
  });

  it("«hoy» es el de la empresa: el lunes a las 21:00 de Lima lo que vence ese lunes no está atrasado, aunque en UTC ya sea martes", () => {
    const lunes2100Lima = new Date("2026-10-13T02:00:00Z");
    const acciones = [accion({ id: "a1", accion: "Vence el lunes", vence_at: "2026-10-12" })];
    const lima = armar(entrada({ acciones }), "2026-10-12", lunes2100Lima);
    expect(lima.referencia).toBe("2026-10-12");
    expect(lima.desvios.filter((d) => d.tipo === "retraso")).toEqual([]);
    const utc = armar(entrada({ acciones, zona: "UTC" }), "2026-10-12", lunes2100Lima);
    expect(utc.referencia).toBe("2026-10-13");
    expect(utc.desvios.filter((d) => d.tipo === "retraso")).toHaveLength(1);
  });

  it("qué ocurrió: lo del domingo a las 20:00 de Lima es de la semana que cierra ese domingo, no de la siguiente", () => {
    const e = entrada({
      acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño" })],
      historial: [{ action_id: "a1", accion: "reportar", motivo: null, actor_rol: "cliente", created_at: "2026-10-12T01:00:00Z" }],
    });
    expect(armar(e, SEMANA, HOY).que_ocurrio.map((o) => o.texto)).toEqual(["La empresa reportó «Cotizar sin el dueño»"]);
    expect(armar(e, "2026-10-12", HOY).que_ocurrio).toEqual([]);
    expect(armar({ ...e, zona: "UTC" }, SEMANA, HOY).que_ocurrio).toEqual([]);
  });

  it("generar: cuenta con la zona de la empresa y pide el historial con margen para no perder el domingo por la noche", async () => {
    const tablas = tablasBase();
    tablas.accion_historial!.push({ id: "h3", action_id: "a1", accion: "reportar", motivo: null, actor_rol: "cliente", created_at: "2026-10-12T01:00:00Z" });
    const lima = await generar(EMP, SEMANA, dobleDeBase(tablas).sb, HOY);
    expect(lima.zona).toBe("America/Lima");
    expect(lima.que_ocurrio.map((o) => o.texto)).toEqual(["La consultora aprobó «Cotizar sin el dueño»", "La empresa reportó «Cotizar sin el dueño»"]);
    const enUtc = await generar(EMP, SEMANA, dobleDeBase({ ...tablas, companies: [{ id: EMP, zona_horaria: "UTC" }] }).sb, HOY);
    expect(enUtc.zona).toBe("UTC");
    expect(enUtc.que_ocurrio.map((o) => o.texto)).toEqual(["La consultora aprobó «Cotizar sin el dueño»"]);
    // La zona que se pasa a mano manda sobre la leída.
    expect((await generar(EMP, SEMANA, dobleDeBase(tablas).sb, HOY, "America/Bogota")).zona).toBe("America/Bogota");
  });

  it("estática: ni la ruta ni las páginas calculan la semana con lunesDe(new Date()); la consultora abre la que terminó y el dueño la que corre", () => {
    const ruta = fuente("src/app/api/companies/[id]/revision/route.ts");
    const consultora = fuente("src/app/(consultor)/empresa/[id]/revision/page.tsx");
    const dueno = fuente("src/app/(cliente)/portal/semana/page.tsx");
    const pantalla = fuente("src/components/revision/RevisionSemanal.tsx");
    for (const src of [ruta, consultora, dueno, pantalla]) expect(src).not.toMatch(/lunesDe\(\s*new Date\(\)\s*\)/);
    for (const src of [ruta, consultora, dueno]) expect(src).toContain("zonaDeEmpresa(");
    expect(ruta).toContain("semanaPorDefecto(ahora, zona)");
    expect(consultora).toContain("semanaPorDefecto(ahora, zona)");
    expect(dueno).toContain("semanaEnCurso(ahora, zona)");
    // Cambiar de semana hace nacer las cajas de nuevo: lo escrito para una semana no viaja a otra.
    expect(consultora).toContain("key={revision.semana}");
  });
});

describe("(d) lo que hizo el sistema lo firma el sistema, no la consultora", () => {
  it("ante el dueño, una propuesta del planificador no se le atribuye a la consultora", () => {
    expect(QUIEN_CLIENTE.sistema).toBe("El sistema");
    const r = armar(entrada({
      acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño" })],
      historial: [{ action_id: "a1", accion: "aprobar", motivo: null, actor_rol: "sistema", created_at: "2026-10-06T10:00:00Z" }],
    }), SEMANA, HOY);
    expect(r.que_ocurrio[0]!.texto_cliente).toBe("El sistema aprobó «Cotizar sin el dueño»");
    expect(JSON.stringify(paraCliente(r).hecho)).not.toContain("La consultora");
    expect(paraCliente(r).hecho).toEqual(["El sistema aprobó «Cotizar sin el dueño»."]);
  });
});

describe("(d) quién revisó y cuándo va en revisada_por y revisada_at, no en creada_por", () => {
  const conTextos = (textos: Entrada["textos"]) => armar(entrada({ textos }), SEMANA, HOY);

  it("con las columnas presentes mandan ellas: una fila con creada_por y sin marca NO está revisada", () => {
    const r = conTextos({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: null, revisada_por: null });
    expect(r).toMatchObject({ revisada: false, revisada_por: null, revisada_at: null, creada_por: "u1" });
    const marcada = conTextos({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: "2026-10-13T15:00:00.000Z", revisada_por: "u2" });
    expect(marcada).toMatchObject({ revisada: true, revisada_por: "u2", revisada_at: "2026-10-13T15:00:00.000Z", creada_por: "u1" });
  });

  it("una fila leída sin las columnas (base sin la migración) se lee como antes: creada_por era la marca, y no hay fecha que inventar", () => {
    const r = conTextos({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1" });
    expect(r).toMatchObject({ revisada: true, revisada_por: "u1", revisada_at: null });
    expect(conTextos({ explicacion: null, decision_necesaria: null, siguiente: null, creada_por: null }).revisada).toBe(false);
  });

  it("marcar revisada exige la explicación y deja quién y cuándo; quien creó la fila sigue siendo quien la creó", () => {
    const r = conTextos({ explicacion: null, decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: null, revisada_por: null });
    expect(aplicarEscrito(r, { marcar_revisada: true }, "u2", AHORA)).toEqual({ ok: false, error: ERROR_SIN_EXPLICACION });
    expect(aplicarEscrito(r, { explicacion: "   ", marcar_revisada: true }, "u2", AHORA)).toEqual({ ok: false, error: ERROR_SIN_EXPLICACION });
    const marcada = aplicarEscrito(r, { explicacion: "Feria del 8.", marcar_revisada: true }, "u2", AHORA);
    if (!marcada.ok) throw new Error(marcada.error);
    expect(marcada.revision).toMatchObject({ revisada: true, revisada_por: "u2", revisada_at: "2026-10-13T15:00:00.000Z", creada_por: "u1", explicacion: "Feria del 8." });
    // Guardar sin marcar no deja marca: solo dice quién creó la fila si nadie lo había hecho.
    const soloGuardar = aplicarEscrito(conTextos(null), { explicacion: "Feria del 8." }, "u2", AHORA);
    if (!soloGuardar.ok) throw new Error(soloGuardar.error);
    expect(soloGuardar.revision).toMatchObject({ revisada: false, revisada_por: null, revisada_at: null, creada_por: "u2" });
  });

  it("una semana ya revisada no se queda sin explicación: se corrige, no se deja en blanco", () => {
    const r = conTextos({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: "2026-10-13T15:00:00.000Z", revisada_por: "u1" });
    expect(aplicarEscrito(r, { explicacion: "" }, "u1", AHORA)).toEqual({ ok: false, error: ERROR_REVISADA_SIN_EXPLICACION });
    expect(aplicarEscrito(r, { explicacion: "Feria del 8 y lluvia." }, "u1", AHORA).ok).toBe(true);
    expect(aplicarEscrito(r, { decision_necesaria: "" }, "u1", AHORA).ok).toBe(true);
  });

  it("guardar escribe la marca en sus columnas y un guardado posterior sin marcar la conserva", async () => {
    const { sb, tablas } = dobleDeBase({ ...tablasBase(), revisiones_semanales: [] });
    const r = await generar(EMP, SEMANA, sb, HOY);
    const marcada = aplicarEscrito(r, { explicacion: "Feria del 8.", marcar_revisada: true }, "u-consultora", AHORA);
    if (!marcada.ok) throw new Error(marcada.error);
    await guardar(marcada.revision, sb, { vaciar: marcada.vaciar });
    expect(tablas.revisiones_semanales![0]).toMatchObject({ revisada_por: "u-consultora", revisada_at: "2026-10-13T15:00:00.000Z", creada_por: "u-consultora" });
    const despues = aplicarEscrito(await generar(EMP, SEMANA, sb, HOY), { siguiente: "Llamar a Rosa." }, "u-otra", new Date("2026-10-14T15:00:00Z"));
    if (!despues.ok) throw new Error(despues.error);
    await guardar(despues.revision, sb, { vaciar: despues.vaciar });
    expect(tablas.revisiones_semanales![0]).toMatchObject({ revisada_por: "u-consultora", revisada_at: "2026-10-13T15:00:00.000Z", creada_por: "u-consultora", siguiente: "Llamar a Rosa." });
  });

  describe("en una base a la que le falta supabase/migracion-revision-revisada.sql", () => {
    const SIN = { revisiones_semanales: ["revisada_at", "revisada_por"] };

    it("la revisión se lee igual, y «Guardar» conserva lo escrito sin tocar columnas que no existen ni encender la marca vieja", async () => {
      const { sb, tablas, escrituras } = dobleDeBase({ ...tablasBase(), revisiones_semanales: [] }, {}, SIN);
      const r = await generar(EMP, SEMANA, sb, HOY);
      expect(r.revisada).toBe(false);
      const aplicado = aplicarEscrito(r, { explicacion: "Feria del 8." }, "u-consultora", AHORA);
      if (!aplicado.ok) throw new Error(aplicado.error);
      await guardar(aplicado.revision, sb, { vaciar: aplicado.vaciar });
      const fila = tablas.revisiones_semanales![0]!;
      expect(fila).toMatchObject({ explicacion: "Feria del 8.", creada_por: null });
      expect(Object.keys(escrituras[0]!.datos)).not.toContain("revisada_at");
      expect(Object.keys(escrituras[0]!.datos)).not.toContain("revisada_por");
      // En ese esquema creada_por ES la marca: al reabrir, guardar un texto no la dejó «revisada».
      expect((await generar(EMP, SEMANA, sb, HOY)).revisada).toBe(false);
    });

    it("«Marcar revisada» SIGUE FUNCIONANDO como antes de la migración: la marca va en creada_por, sin fecha, y se dice; no lanza", async () => {
      const { sb, tablas, escrituras } = dobleDeBase({ ...tablasBase(), revisiones_semanales: [] }, {}, SIN);
      const marcada = aplicarEscrito(await generar(EMP, SEMANA, sb, HOY), { explicacion: "Feria del 8.", marcar_revisada: true }, "u-consultora", AHORA);
      if (!marcada.ok) throw new Error(marcada.error);
      const g = await guardar(marcada.revision, sb, { vaciar: marcada.vaciar });
      expect(g).toEqual({ id: "revisiones_semanales-1", creada: true, marca_sin_fecha: true });
      expect(AVISO_MARCA_SIN_FECHA).toContain("supabase/migracion-revision-revisada.sql");
      expect(tablas.revisiones_semanales![0]).toMatchObject({ explicacion: "Feria del 8.", creada_por: "u-consultora" });
      expect(escrituras).toHaveLength(1);
      expect(Object.keys(escrituras[0]!.datos)).not.toContain("revisada_at");
      expect(Object.keys(escrituras[0]!.datos)).not.toContain("revisada_por");
      // Al reabrir se lee revisada por quien la marcó, sin una fecha que nadie guardó.
      const releida = await generar(EMP, SEMANA, sb, HOY);
      expect(releida).toMatchObject({ revisada: true, revisada_por: "u-consultora", revisada_at: null });
      // Volver a marcar tampoco aquí cambia la marca: queda quien la revisó primero.
      const otra = aplicarEscrito(releida, { marcar_revisada: true }, "u-otra", new Date("2026-10-20T15:00:00Z"));
      if (!otra.ok) throw new Error(otra.error);
      expect(otra.marca).toBe("conservada");
      const g2 = await guardar(otra.revision, sb, { vaciar: otra.vaciar });
      expect(g2).toEqual({ id: "revisiones_semanales-1", creada: false });
      expect(tablas.revisiones_semanales![0]!.creada_por).toBe("u-consultora");
    });

    it("una fila guardada sin marcar se marca después: creada_por pasa a decir quién la revisó, y solo entonces", async () => {
      const { sb, tablas } = dobleDeBase({ ...tablasBase(), revisiones_semanales: [] }, {}, SIN);
      const soloTexto = aplicarEscrito(await generar(EMP, SEMANA, sb, HOY), { explicacion: "Feria del 8." }, "u-otra", AHORA);
      if (!soloTexto.ok) throw new Error(soloTexto.error);
      expect(await guardar(soloTexto.revision, sb, { vaciar: soloTexto.vaciar })).toEqual({ id: "revisiones_semanales-1", creada: true });
      expect(tablas.revisiones_semanales![0]!.creada_por).toBeNull();
      const marcada = aplicarEscrito(await generar(EMP, SEMANA, sb, HOY), { marcar_revisada: true }, "u-consultora", AHORA);
      if (!marcada.ok) throw new Error(marcada.error);
      expect(marcada.marca).toBe("nueva");
      expect(await guardar(marcada.revision, sb, { vaciar: marcada.vaciar })).toEqual({ id: "revisiones_semanales-1", creada: false, marca_sin_fecha: true });
      expect(tablas.revisiones_semanales![0]).toMatchObject({ explicacion: "Feria del 8.", creada_por: "u-consultora" });
    });

    it("lo que ya estaba marcado con el esquema anterior se sigue leyendo como revisado por quien lo marcó", async () => {
      const tablas = { ...tablasBase(), revisiones_semanales: [{ id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1" }] };
      const r = await generar(EMP, SEMANA, dobleDeBase(tablas, {}, SIN).sb, HOY);
      expect(r).toMatchObject({ revisada: true, revisada_por: "u1", revisada_at: null });
    });
  });
});

describe("(a) la pantalla de la consultora, renderizada en servidor (sin navegador: prueba el primer pintado, no los clics)", () => {
  const caja = (html: string, marca: string) => new RegExp(`<textarea[^>]*${marca}[^>]*>([^<]*)</textarea>`).exec(html)?.[1];
  const pintar = async (revision: Revision, extra: Partial<{ revisadaPor: string | null; revisadaEl: string | null }> = {}) => {
    const { RevisionSemanal } = await import("@/components/revision/RevisionSemanal");
    return renderToStaticMarkup(createElement(RevisionSemanal, { companyId: EMP, revision, revisadaPor: null, revisadaEl: null, semanaQueTermino: SEMANA, semanaEnCurso: "2026-10-12", ...extra }));
  };
  const conPropuestas = (textos: Entrada["textos"] = null) =>
    armar(entrada({ acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño", vence_at: "2026-10-07" }), accion({ id: "a2", accion: "Ordenar el almacén", vence_at: "2026-10-15" })], textos }), SEMANA, HOY);

  it("sin nada guardado, las tres cajas se pintan VACÍAS y la propuesta del sistema aparece aparte, con su botón", async () => {
    const r = conPropuestas();
    const html = await pintar(r);
    expect(caja(html, 'aria-label="Explicación"')).toBe("");
    expect(caja(html, 'id="revision-decision"')).toBe("");
    expect(caja(html, 'id="revision-siguiente"')).toBe("");
    // La propuesta está en la página, fuera de las cajas, rotulada como lo que es.
    expect(html).toContain("PROPUESTA DEL SISTEMA · NO ES UNA DECISIÓN TOMADA");
    expect(html).toContain("Reprogramar el plazo de «Cotizar sin el dueño»");
    expect(html).toContain("LO QUE PIDE EL PLAN · PROPUESTA DEL SISTEMA");
    expect(html.match(/Usar esta propuesta/g)).toHaveLength(2);
    expect(html).toContain("Se juzga hasta el 11 oct 2026");
    expect(html).not.toContain("Revisada");
  });

  it("con texto guardado, cada caja se pinta con lo que la consultora escribió, y solo con eso", async () => {
    const html = await pintar(conPropuestas({ explicacion: "Feria del 8.", decision_necesaria: "Mover el plazo.", siguiente: null, creada_por: "u1", revisada_at: null, revisada_por: null }));
    expect(caja(html, 'aria-label="Explicación"')).toBe("Feria del 8.");
    expect(caja(html, 'id="revision-decision"')).toBe("Mover el plazo.");
    expect(caja(html, 'id="revision-siguiente"')).toBe("");
  });

  it("sin desvíos ni acciones próximas no hay nada que «usar»: la propuesta se lee, pero no se ofrece como decisión", async () => {
    const r = armar(entrada({ acciones: [accion({ id: "a1", accion: "Lejana", vence_at: "2026-12-01" })] }), SEMANA, HOY);
    expect(r.desvios).toEqual([]);
    const html = await pintar(r);
    expect(html).toContain("Sin desvíos detectados en lo registrado");
    expect(html).not.toContain("Usar esta propuesta");
  });

  it("una acción reportada tarde se pinta «ocurrió con retraso», y la semana revisada dice quién y cuándo", async () => {
    const r = armar(entrada({
      acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño", estado: "reportado", vence_at: "2026-10-07", reportado_at: "2026-10-09T15:00:00Z" })],
      textos: { explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: "2026-10-13T15:00:00.000Z", revisada_por: "u2" },
    }), SEMANA, HOY);
    const html = await pintar(r, { revisadaPor: "Kelin Merma", revisadaEl: "13 oct 2026" });
    expect(html).toContain("ocurrió con retraso");
    expect(html).toContain("con retraso de 2 días");
    expect(html).toContain("Revisada por Kelin Merma el 13 oct 2026");
  });
});

// ───────────────────────── CIERRE DEL REMATE V · LO QUE EL VERIFICADOR DEJÓ ABIERTO ─────────────────────────

/** La pantalla de la consultora pintada en servidor: el primer pintado, sin clics. */
async function pintarPantalla(revision: Revision, extra: Partial<{ revisadaPor: string | null; revisadaEl: string | null }> = {}): Promise<string> {
  const { RevisionSemanal } = await import("@/components/revision/RevisionSemanal");
  return renderToStaticMarkup(createElement(RevisionSemanal, { companyId: EMP, revision, revisadaPor: null, revisadaEl: null, semanaQueTermino: SEMANA, semanaEnCurso: "2026-10-12", ...extra }));
}

describe("(b) la fila «Empieza» no hereda el retraso del reporte: lo tardío fue terminar, no arrancar", () => {
  /** Empezaba el martes 6, vencía el miércoles 7 y se reportó el viernes 9. */
  const tarde = accion({ id: "a1", accion: "Cotizar sin el dueño", estado: "reportado", fecha_inicio: "2026-10-06", vence_at: "2026-10-07", reportado_at: "2026-10-09T15:00:00Z" });

  it("empezó en la semana y se reportó dos días tarde: «empieza» ocurrió, sin retraso que cargar; «vence» lleva el retraso", () => {
    const [empieza, vence] = armar(entrada({ acciones: [tarde] }), SEMANA, HOY).que_debia_ocurrir;
    expect(empieza).toMatchObject({ tipo: "accion_empieza", cumplido: true });
    expect(empieza!.plazo).toBeUndefined();
    expect(empieza!.dias_retraso).toBeUndefined();
    expect(vence).toMatchObject({ tipo: "accion_vence", cumplido: true, plazo: "con_retraso", dias_retraso: 2 });
    // El detalle de «empieza» sigue contando cómo terminó, con las dos fechas: el retraso no se esconde, se pone donde es.
    expect(empieza!.detalle).toBe("Empezó y ya está reportada con retraso de 2 días: se reportó el 9 oct 2026 y vencía el 7 oct 2026.");
  });

  it("el plazo es de la fila que vence, también cuando fue a tiempo; sin vencimiento lo dice «empieza», porque no hay otra fila", () => {
    const aTiempo = armar(entrada({ acciones: [accion({ ...tarde, reportado_at: "2026-10-07T15:00:00Z" })] }), SEMANA, HOY).que_debia_ocurrir;
    expect(aTiempo.map((x) => [x.tipo, x.plazo])).toEqual([["accion_empieza", undefined], ["accion_vence", "dentro_del_plazo"]]);
    const sinVence = armar(entrada({ acciones: [accion({ ...tarde, vence_at: null })] }), SEMANA, HOY).que_debia_ocurrir;
    expect(sinVence.map((x) => [x.tipo, x.plazo, x.dias_retraso])).toEqual([["accion_empieza", "sin_fecha_comprometida", undefined]]);
  });

  it("pintada: la fila «Empieza» dice «ocurrió» y solo la fila «Vence» dice «ocurrió con retraso»", async () => {
    const html = await pintarPantalla(armar(entrada({ acciones: [tarde] }), SEMANA, HOY));
    const filas = html.split("<li").filter((li) => li.includes("min-width:110px"));
    expect(filas).toHaveLength(2);
    const marcaDeFila = (verbo: string) => />(ocurrió[^<]*|no ocurrió|todavía no se juzga)<\/span>/.exec(filas.find((f) => f.includes(`<span>${verbo}`)) ?? "")?.[1];
    expect(marcaDeFila("Empieza")).toBe("ocurrió");
    expect(marcaDeFila("Vence")).toBe("ocurrió con retraso");
    expect(html.match(/ocurrió con retraso/g)).toHaveLength(1);
  });

  it("pintada: aunque a la fila «Empieza» le llegara el plazo del reporte (una revisión armada por otro camino), la pantalla no la pinta tardía", async () => {
    const r = armar(entrada({ acciones: [tarde] }), SEMANA, HOY);
    const conPlazoEnEmpieza: Revision = { ...r, que_debia_ocurrir: r.que_debia_ocurrir.map((x) => (x.tipo === "accion_empieza" ? { ...x, plazo: "con_retraso" as const, dias_retraso: 2 } : x)) };
    const html = await pintarPantalla(conPlazoEnEmpieza);
    expect(html.match(/ocurrió con retraso/g)).toHaveLength(1);
    const empieza = html.split("<li").find((li) => li.includes("min-width:110px") && li.includes("<span>Empieza"));
    expect(empieza).toMatch(/>ocurrió<\/span>/);
  });
});

describe("(d) la primera marca manda: volver a marcar no reemplaza a quien revisó ni cuándo", () => {
  const T1 = "2026-10-13T15:00:00.000Z";
  const revisada = () => armar(entrada({ textos: { explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: T1, revisada_por: "u1" } }), SEMANA, HOY);

  it("aplicarEscrito: sobre una semana ya revisada guarda el texto y conserva la marca, y dice qué pasó con ella", () => {
    const otra = aplicarEscrito(revisada(), { explicacion: "Feria del 8 y lluvia.", marcar_revisada: true }, "u2", new Date("2026-10-20T15:00:00Z"));
    if (!otra.ok) throw new Error(otra.error);
    expect(otra.marca).toBe("conservada");
    expect(otra.revision).toMatchObject({ revisada: true, revisada_por: "u1", revisada_at: T1, creada_por: "u1", explicacion: "Feria del 8 y lluvia." });
    const nueva = aplicarEscrito(armar(entrada(), SEMANA, HOY), { explicacion: "Feria del 8.", marcar_revisada: true }, "u2", AHORA);
    expect(nueva.ok && nueva.marca).toBe("nueva");
    const sinMarcar = aplicarEscrito(revisada(), { siguiente: "Llamar a Rosa." }, "u2", AHORA);
    expect(sinMarcar.ok && sinMarcar.marca).toBeNull();
  });

  it("una marca que vino del esquema anterior (quién, sin fecha) tampoco se reemplaza ni recibe una fecha inventada", () => {
    const migrada = armar(entrada({ textos: { explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: null, revisada_por: "u1" } }), SEMANA, HOY);
    expect(migrada.revisada).toBe(true);
    const otra = aplicarEscrito(migrada, { marcar_revisada: true }, "u2", AHORA);
    if (!otra.ok) throw new Error(otra.error);
    expect(otra).toMatchObject({ marca: "conservada", revision: { revisada_por: "u1", revisada_at: null } });
  });

  it("guardar: aunque le llegue otra marca (dos consultoras a la vez), la que ya está en la fila se queda", async () => {
    const { sb, tablas } = dobleDeBase({ revisiones_semanales: [{ id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: T1, revisada_por: "u1" }] });
    await guardar({ ...revisada(), revisada_por: "u2", revisada_at: "2026-10-20T15:00:00.000Z", siguiente: "Llamar a Rosa." }, sb);
    expect(tablas.revisiones_semanales![0]).toMatchObject({ revisada_por: "u1", revisada_at: T1, siguiente: "Llamar a Rosa." });
  });

  it("un fallo al leer que NO es la migración pendiente se lanza: la marca no se escribe como en el esquema anterior", async () => {
    const { sb, escrituras } = dobleDeBase({ ...tablasBase(), revisiones_semanales: [] });
    const marcada = aplicarEscrito(await generar(EMP, SEMANA, sb, HOY), { explicacion: "Feria del 8.", marcar_revisada: true }, "u-consultora", AHORA);
    if (!marcada.ok) throw new Error(marcada.error);
    // La primera lectura de la fila guardada se corta; la segunda habría salido bien.
    const rota = dobleDeBase({}, { revisiones_semanales: { op: "select", mensaje: "connection reset" } }).sb;
    let primera = true;
    const intermitente = {
      from: (tabla: string) => {
        if (tabla !== "revisiones_semanales" || !primera) return sb.from(tabla);
        primera = false;
        return rota.from(tabla);
      },
    } as unknown as typeof sb;
    await expect(guardar(marcada.revision, intermitente, { vaciar: marcada.vaciar })).rejects.toThrow(/No se pudo leer la revisión guardada: connection reset/);
    expect(escrituras).toEqual([]);
    expect(faltanColumnasDeRevisada({ message: "connection reset" })).toBe(false);
    expect(faltanColumnasDeRevisada({ code: "42P01", message: 'relation "public.revisiones_semanales" does not exist' })).toBe(false);
    expect(faltanColumnasDeRevisada({ code: "42703", message: "column revisiones_semanales.revisada_at does not exist" })).toBe(true);
    expect(faltanColumnasDeRevisada({ code: "PGRST204", message: "Could not find the 'revisada_por' column of 'revisiones_semanales' in the schema cache" })).toBe(true);
  });
});

describe("la pantalla: «Marcar revisada» exige la explicación y no se ofrece dos veces", () => {
  const boton = (html: string) => /<button[^>]*>Marcar revisada<\/button>/.exec(html)?.[0];
  const conAccion = (textos: Entrada["textos"] = null) => armar(entrada({ acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño", vence_at: "2026-10-07" })], textos }), SEMANA, HOY);

  it("sin explicación el botón nace apagado y dice por qué; con la explicación guardada, encendido", async () => {
    const sin = boton(await pintarPantalla(conAccion()));
    expect(sin).toBeDefined();
    expect(sin).toContain("disabled");
    expect(sin).toContain("Escribe la explicación antes de marcarla revisada.");
    const con = boton(await pintarPantalla(conAccion({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: null, revisada_por: null })));
    expect(con).toBeDefined();
    expect(con).not.toContain("disabled");
  });

  it("una semana ya revisada no ofrece marcarla otra vez: dice que la marca se conserva, y «Guardar» sigue ahí", async () => {
    const html = await pintarPantalla(
      conAccion({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: "2026-10-13T15:00:00.000Z", revisada_por: "u2" }),
      { revisadaPor: "Kelin Merma", revisadaEl: "13 oct 2026" }
    );
    expect(boton(html)).toBeUndefined();
    expect(html).toContain("Ya está marcada como revisada por Kelin Merma: esa marca se conserva.");
    expect(html).toMatch(/<button[^>]*>Guardar<\/button>/);
  });
});

// ───────────────────────── LA RUTA Y LAS PÁGINAS, OPERADAS CON EL DOBLE DE BASE ─────────────────────────

const KELIN: Perfil = { id: "u-kelin", email: "kelin@prueba.local", nombre: "Kelin Merma", rol: "consultor" };
const OTRA: Perfil = { id: "u-otra", email: "otra@prueba.local", nombre: "Otra Consultora", rol: "consultor" };
const DUENA: Perfil = { id: "u-duena", email: "duena@prueba.local", nombre: "Dueña de la tienda", rol: "cliente" };
const AJENO: Perfil = { id: "u-ajeno", email: "ajeno@prueba.local", nombre: "Dueño de otra empresa", rol: "cliente" };
/** Lunes 12 de octubre de 2026 a las 00:30 de Lima (05:30 UTC): acaba de empezar la semana nueva. */
const LUNES_0030_LIMA = new Date("2026-10-12T05:30:00Z");
/** Domingo 11 a las 23:30 de Lima: en UTC ya es lunes 12, en la empresa todavía no. */
const DOMINGO_2330_LIMA = new Date("2026-10-12T04:30:00Z");
const SIN_MIGRACION = { revisiones_semanales: ["revisada_at", "revisada_por"] };

/** La empresa de `tablasBase` con una acción que vence la semana próxima (el sistema propone decisión Y siguiente), sus usuarios y su dueña. */
function tablasDeRuta(): Record<string, Fila[]> {
  const tablas = tablasBase();
  tablas.actions!.push({ id: "a2", company_id: EMP, accion: "Ordenar el almacén", estado: "aprobado", vence_at: "2026-10-15", responsable_participant_id: ROSA.id, es_prioridad: true, evidencia_ids: [], depende_de: [] });
  tablas.users = [{ id: KELIN.id, nombre: KELIN.nombre }, { id: OTRA.id, nombre: OTRA.nombre }];
  tablas.memberships = [{ user_id: DUENA.id, company_id: EMP }];
  return tablas;
}

/** Enchufa un doble de base en `supabaseAdmin()`: la ruta y las páginas leen y escriben ahí. */
function enchufar(tablas: Record<string, Fila[]> = tablasDeRuta(), sinColumnas: Record<string, string[]> = {}) {
  const doble = dobleDeBase(tablas, {}, sinColumnas);
  enchufe.sb = doble.sb;
  return doble;
}

/** Antes de cada prueba: sesión de consultora, rastro limpio y el reloj (solo el reloj) en el martes 13 a las 10:00 de Lima. */
function prepararOperacion() {
  vi.mocked(perfilApi).mockReset();
  vi.mocked(perfilApi).mockResolvedValue(KELIN);
  vi.mocked(registrar).mockClear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
}
function soltarOperacion() {
  vi.useRealTimers();
  enchufe.sb = null;
}

const URL_RUTA = `http://8x.test/api/companies/${EMP}/revision`;
const contexto = () => ({ params: Promise.resolve({ id: EMP }) });

async function leer(consulta = "") {
  const { GET } = await import("@/app/api/companies/[id]/revision/route");
  const res = await GET(new Request(`${URL_RUTA}${consulta}`), contexto());
  return { status: res.status, cuerpo: (await res.json()) as Revision & { error?: string } };
}

async function escribir(cuerpo: Fila) {
  const { POST } = await import("@/app/api/companies/[id]/revision/route");
  const res = await POST(new Request(URL_RUTA, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }), contexto());
  return { status: res.status, cuerpo: (await res.json()) as { revision: Revision; guardado: Guardado; aviso: string | null; error?: string } };
}

/** Lo que la ruta dejó en el rastro sobre la revisión (sin la línea genérica de `protegido`). */
const rastro = () => vi.mocked(registrar).mock.calls.map(([e]) => e).filter((e) => e.entidad === "revision_semanal");

describe("la ruta /api/companies/[id]/revision OPERADA con el doble de base (GET y POST de verdad, no su texto)", () => {
  beforeEach(prepararOperacion);
  afterEach(soltarOperacion);

  it("GET sin semana, un lunes a las 00:30 de Lima: entrega la semana que TERMINÓ, no la que empieza; y no escribe", async () => {
    vi.setSystemTime(LUNES_0030_LIMA);
    const { escrituras } = enchufar();
    const { status, cuerpo } = await leer();
    expect(status).toBe(200);
    expect(cuerpo).toMatchObject({ semana: "2026-10-05", desde: "2026-10-05", hasta: "2026-10-11", referencia: "2026-10-11", zona: "America/Lima" });
    expect(escrituras).toEqual([]);
  });

  it("GET sin semana, el domingo a las 23:30 de Lima (ya lunes en UTC): cuenta con el reloj de la empresa, no con el del servidor", async () => {
    vi.setSystemTime(DOMINGO_2330_LIMA);
    enchufar();
    expect((await leer()).cuerpo).toMatchObject({ semana: "2026-09-28", zona: "America/Lima" });
    // La misma hora para una empresa que vive en UTC: allí ya es lunes, y la semana que terminó es la del 5.
    enchufar({ ...tablasDeRuta(), companies: [{ id: EMP, zona_horaria: "UTC" }] });
    expect((await leer()).cuerpo).toMatchObject({ semana: "2026-10-05", zona: "UTC" });
  });

  it("GET con una semana pedida la entrega; con un día que no es lunes responde 400, no la corrige en silencio", async () => {
    enchufar();
    expect((await leer("?semana=2026-09-28")).cuerpo.semana).toBe("2026-09-28");
    const mala = await leer("?semana=2026-10-06");
    expect(mala.status).toBe(400);
    expect(mala.cuerpo.error).toMatch(/lunes/);
  });

  it("POST con SOLO la explicación: se guarda ella y nada más, aunque el sistema proponga decisión y siguiente", async () => {
    const { tablas } = enchufar();
    const { status, cuerpo } = await escribir({ semana: SEMANA, explicacion: "  Feria del 8: nadie estuvo en tienda.  " });
    expect(status).toBe(201);
    expect(cuerpo.revision.decision_propuesta).toMatch(/Reprogramar el plazo de «Cotizar sin el dueño»/);
    expect(cuerpo.revision.siguiente_texto).toMatch(/Vence «Ordenar el almacén»/);
    expect(cuerpo.aviso).toBeNull();
    expect(cuerpo.guardado).toEqual({ id: "revisiones_semanales-1", creada: true });
    expect(tablas.revisiones_semanales).toHaveLength(1);
    expect(tablas.revisiones_semanales![0]).toMatchObject({
      semana: SEMANA, explicacion: "Feria del 8: nadie estuvo en tienda.", decision_necesaria: null, siguiente: null,
      creada_por: KELIN.id, revisada_por: null, revisada_at: null,
    });
    // Al volver a leer por la ruta, la decisión y el siguiente siguen en blanco: nadie los escribió.
    expect((await leer(`?semana=${SEMANA}`)).cuerpo).toMatchObject({ explicacion: "Feria del 8: nadie estuvo en tienda.", decision_necesaria: null, siguiente: null, revisada: false });
    expect(rastro()).toHaveLength(1);
    expect(rastro()[0]).toMatchObject({ accion: "crear", entidadId: "revisiones_semanales-1", detalle: { semana: SEMANA, revisada: false } });
  });

  it("POST con una caja vaciada (cadena vacía): se borra ESA y solo esa; lo que no viaja se queda como estaba", async () => {
    const tablas = tablasDeRuta();
    tablas.revisiones_semanales = [{ id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Feria del 8.", decision_necesaria: "Mover el plazo.", siguiente: "Llamar a Rosa.", creada_por: OTRA.id, revisada_at: null, revisada_por: null }];
    enchufar(tablas);
    const { status, cuerpo } = await escribir({ semana: SEMANA, decision_necesaria: "" });
    expect(status).toBe(200);
    expect(cuerpo.revision).toMatchObject({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: "Llamar a Rosa." });
    expect(tablas.revisiones_semanales[0]).toMatchObject({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: "Llamar a Rosa.", creada_por: OTRA.id });
    // Un guardado sin ningún texto no vacía nada: ausente no es vacío.
    expect((await escribir({ semana: SEMANA })).status).toBe(200);
    expect(tablas.revisiones_semanales[0]).toMatchObject({ explicacion: "Feria del 8.", decision_necesaria: null, siguiente: "Llamar a Rosa." });
    expect(tablas.revisiones_semanales).toHaveLength(1);
  });

  it("POST «marcar revisada» sin explicación: 400 con el motivo, y no se escribe nada ni queda rastro de un guardado", async () => {
    const { escrituras, tablas } = enchufar();
    const { status, cuerpo } = await escribir({ semana: SEMANA, marcar_revisada: true });
    expect(status).toBe(400);
    expect(cuerpo.error).toBe(ERROR_SIN_EXPLICACION);
    expect(escrituras).toEqual([]);
    expect(tablas.revisiones_semanales).toEqual([]);
    expect(rastro()).toEqual([]);
  });

  it("POST «marcar revisada»: queda quién y cuándo en sus columnas; volver a marcar conserva la primera marca y lo dice", async () => {
    const { tablas } = enchufar();
    const primera = await escribir({ semana: SEMANA, explicacion: "Feria del 8.", marcar_revisada: true });
    expect(primera.status).toBe(201);
    expect(primera.cuerpo.aviso).toBeNull();
    expect(tablas.revisiones_semanales![0]).toMatchObject({ revisada_por: KELIN.id, revisada_at: AHORA.toISOString(), creada_por: KELIN.id });
    expect(rastro()[0]).toMatchObject({ accion: "crear", detalle: { revisada: true } });

    // Una semana después, otra consultora corrige la explicación y vuelve a pulsar «Marcar revisada».
    vi.mocked(perfilApi).mockResolvedValue(OTRA);
    vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
    const segunda = await escribir({ semana: SEMANA, explicacion: "Feria del 8 y lluvia.", marcar_revisada: true });
    expect(segunda.status).toBe(200);
    expect(segunda.cuerpo.aviso).toBe(AVISO_YA_REVISADA);
    expect(segunda.cuerpo.revision).toMatchObject({ revisada: true, revisada_por: KELIN.id, revisada_at: AHORA.toISOString() });
    expect(tablas.revisiones_semanales![0]).toMatchObject({ revisada_por: KELIN.id, revisada_at: AHORA.toISOString(), creada_por: KELIN.id, explicacion: "Feria del 8 y lluvia." });
    expect(rastro()[1]).toMatchObject({ accion: "editar", detalle: { revisada: false } });

    // Y una semana revisada no se queda sin explicación: 400, y el texto sigue ahí.
    const enBlanco = await escribir({ semana: SEMANA, explicacion: "" });
    expect(enBlanco.status).toBe(400);
    expect(enBlanco.cuerpo.error).toBe(ERROR_REVISADA_SIN_EXPLICACION);
    expect(tablas.revisiones_semanales![0]!.explicacion).toBe("Feria del 8 y lluvia.");
  });

  it("en una base SIN la migración, «marcar revisada» no responde 500: marca como antes (creada_por), avisa que quedó sin fecha y se lee revisada", async () => {
    const { tablas, escrituras } = enchufar(tablasDeRuta(), SIN_MIGRACION);
    const { status, cuerpo } = await escribir({ semana: SEMANA, explicacion: "Feria del 8.", marcar_revisada: true });
    expect(status).toBe(201);
    expect(cuerpo.aviso).toBe(AVISO_MARCA_SIN_FECHA);
    expect(cuerpo.guardado).toEqual({ id: "revisiones_semanales-1", creada: true, marca_sin_fecha: true });
    // Lo que se devuelve es lo que quedó: revisada por ella, sin una fecha que la base no guardó.
    expect(cuerpo.revision).toMatchObject({ revisada: true, revisada_por: KELIN.id, revisada_at: null });
    expect(tablas.revisiones_semanales![0]).toMatchObject({ explicacion: "Feria del 8.", creada_por: KELIN.id });
    const columnasEscritas = escrituras.flatMap((e) => Object.keys(e.datos));
    expect(columnasEscritas).not.toContain("revisada_at");
    expect(columnasEscritas).not.toContain("revisada_por");
    expect((await leer(`?semana=${SEMANA}`)).cuerpo).toMatchObject({ revisada: true, revisada_por: KELIN.id, revisada_at: null });
    expect(rastro()[0]).toMatchObject({ detalle: { revisada: true } });

    // Volver a marcar tampoco aquí cambia a quien la revisó.
    vi.mocked(perfilApi).mockResolvedValue(OTRA);
    const segunda = await escribir({ semana: SEMANA, marcar_revisada: true });
    expect(segunda.status).toBe(200);
    expect(segunda.cuerpo.aviso).toBe(AVISO_YA_REVISADA);
    expect(tablas.revisiones_semanales![0]!.creada_por).toBe(KELIN.id);

    // Y guardar un texto sin marcar (otra semana) no enciende la marca de ese esquema.
    expect((await escribir({ semana: "2026-09-28", explicacion: "Semana tranquila." })).status).toBe(201);
    expect(tablas.revisiones_semanales![1]).toMatchObject({ semana: "2026-09-28", creada_por: null });
    expect((await leer("?semana=2026-09-28")).cuerpo.revisada).toBe(false);
  });

  it("la dueña lee la revisión de su empresa pero no la escribe (403, sin tocar la base); quien no es de la empresa ni la lee", async () => {
    const { escrituras } = enchufar();
    vi.mocked(perfilApi).mockResolvedValue(DUENA);
    expect((await leer(`?semana=${SEMANA}`)).status).toBe(200);
    const intento = await escribir({ semana: SEMANA, explicacion: "La escribo yo.", marcar_revisada: true });
    expect(intento.status).toBe(403);
    expect(intento.cuerpo.error).toMatch(/la escribe la consultora/);
    expect(escrituras).toEqual([]);
    vi.mocked(perfilApi).mockResolvedValue(AJENO);
    expect((await leer(`?semana=${SEMANA}`)).status).toBe(403);
  });

  it("POST sin semana guarda la que terminó según el reloj de la empresa; con un día que no es lunes, 400 y nada escrito", async () => {
    vi.setSystemTime(LUNES_0030_LIMA);
    const { tablas } = enchufar();
    expect((await escribir({ explicacion: "Semana corta por el feriado." })).status).toBe(201);
    expect(tablas.revisiones_semanales).toHaveLength(1);
    expect(tablas.revisiones_semanales![0]).toMatchObject({ semana: "2026-10-05", explicacion: "Semana corta por el feriado." });
    const mala = await escribir({ semana: "2026-10-06", explicacion: "No es lunes." });
    expect(mala.status).toBe(400);
    expect(mala.cuerpo.error).toMatch(/lunes/);
    expect(tablas.revisiones_semanales).toHaveLength(1);
  });

  it("POST sin semana, el domingo a las 23:30 de Lima: la empresa de Lima guarda la semana del 28; la que vive en UTC, la del 5", async () => {
    vi.setSystemTime(DOMINGO_2330_LIMA);
    const lima = enchufar();
    await escribir({ explicacion: "Desde Lima." });
    expect(lima.tablas.revisiones_semanales![0]).toMatchObject({ semana: "2026-09-28" });
    const utc = enchufar({ ...tablasDeRuta(), companies: [{ id: EMP, zona_horaria: "UTC" }] });
    await escribir({ explicacion: "Desde UTC." });
    expect(utc.tablas.revisiones_semanales![0]).toMatchObject({ semana: "2026-10-05" });
  });
});

// ───────────────────────── CIERRE Z5 · SOLO SE MARCA UNA SEMANA QUE TERMINÓ, Y EL PERIODO QUE CERRÓ ES EL DE LA EMPRESA ─────────────────────────

/**
 * Lo que un refutador dejó abierto: se podía marcar como revisada la semana en curso, o una futura, y esa marca
 * ya no se podía corregir (la primera marca manda). Y la decisión propuesta de «dato viejo» preguntaba qué
 * periodo había cerrado sin zona, es decir en UTC. Aquí: la regla pura, la ruta OPERADA (409) y el primer pintado.
 */
describe("CIERRE Z5 · solo se marca como revisada una semana TERMINADA, contada con el reloj de la empresa", () => {
  const EN_CURSO = "2026-10-12"; // la que corre el martes 13
  const FUTURA = "2026-10-19";

  it("semanaTerminada: termina cuando en el reloj de la empresa ya es el lunes siguiente", () => {
    expect(semanaTerminada(SEMANA, AHORA, "America/Lima")).toBe(true);
    expect(semanaTerminada(EN_CURSO, AHORA, "America/Lima")).toBe(false);
    expect(semanaTerminada(FUTURA, AHORA, "America/Lima")).toBe(false);
    // El borde: domingo 11 a las 23:30 de Lima (ya lunes en UTC) la semana del 5 NO terminó para Lima y SÍ para UTC.
    expect(semanaTerminada(SEMANA, DOMINGO_2330_LIMA, "America/Lima")).toBe(false);
    expect(semanaTerminada(SEMANA, DOMINGO_2330_LIMA, "UTC")).toBe(true);
    expect(semanaTerminada(SEMANA, LUNES_0030_LIMA, "America/Lima")).toBe(true);
    // Una zona que no existe se cuenta con la de la casa (Lima), nunca con UTC.
    expect(semanaTerminada(SEMANA, DOMINGO_2330_LIMA, "No/Existe")).toBe(false);
  });

  it("aplicarEscrito · NEGATIVA: marcar la semana en curso o una futura no aplica nada y vuelve como conflicto, con desde qué día se podrá", () => {
    const enCurso = armar(entrada({ acciones: [accion({ id: "a1", accion: "Cotizar sin el dueño", vence_at: "2026-10-15" })] }), EN_CURSO, HOY);
    const r = aplicarEscrito(enCurso, { explicacion: "Va bien.", marcar_revisada: true }, "u1", AHORA);
    expect(r).toEqual({
      ok: false, conflicto: true,
      error: "La semana del 12 oct 2026 al 18 oct 2026 todavía no terminó: se podrá marcar como revisada desde el 19 oct 2026. Lo que escribas sí se guarda con «Guardar»; la marca espera a que la semana cierre.",
    });
    expect(enCurso.revisada).toBe(false);
    const futura = aplicarEscrito(armar(entrada(), FUTURA, HOY), { explicacion: "Todavía nada.", marcar_revisada: true }, "u1", AHORA);
    expect(futura).toMatchObject({ ok: false, conflicto: true });
    if (!futura.ok) expect(futura.error).toMatch(/^La semana del 19 oct 2026 al 25 oct 2026 todavía no empezó: se podrá marcar como revisada desde el 26 oct 2026\./);
    expect(errorSemanaSinTerminar(FUTURA, AHORA, "America/Lima")).toMatch(/todavía no empezó/);
    // Va antes que la falta de explicación: escribirla no lo arregla, y decir «escribe la explicación» mandaría a un callejón.
    expect(aplicarEscrito(enCurso, { marcar_revisada: true }, "u1", AHORA)).toMatchObject({ ok: false, conflicto: true });
  });

  it("aplicarEscrito · POSITIVA: los textos de la semana en curso sí se guardan (sin marcar); y la que terminó se marca como siempre", () => {
    const enCurso = armar(entrada(), EN_CURSO, HOY);
    const soloTexto = aplicarEscrito(enCurso, { explicacion: "Va bien." }, "u1", AHORA);
    expect(soloTexto.ok && soloTexto.revision).toMatchObject({ explicacion: "Va bien.", revisada: false, revisada_at: null, revisada_por: null });
    const terminada = aplicarEscrito(armar(entrada(), SEMANA, HOY), { explicacion: "Feria del 8.", marcar_revisada: true }, "u1", AHORA);
    expect(terminada.ok && terminada.marca).toBe("nueva");
    // Los errores de siempre no llevan la marca de conflicto: siguen siendo del cuerpo que llegó.
    expect(aplicarEscrito(armar(entrada(), SEMANA, HOY), { marcar_revisada: true }, "u1", AHORA)).toEqual({ ok: false, error: ERROR_SIN_EXPLICACION });
  });

  it("aplicarEscrito · el borde: el domingo a las 23:30 de Lima la semana del 5 no se marca en Lima y sí en una empresa que vive en UTC", () => {
    const lima = armar(entrada({ zona: "America/Lima" }), SEMANA, DOMINGO_2330_LIMA);
    expect(aplicarEscrito(lima, { explicacion: "Feria del 8.", marcar_revisada: true }, "u1", DOMINGO_2330_LIMA)).toMatchObject({ ok: false, conflicto: true });
    const utc = armar(entrada({ zona: "UTC" }), SEMANA, DOMINGO_2330_LIMA);
    expect(aplicarEscrito(utc, { explicacion: "Feria del 8.", marcar_revisada: true }, "u1", DOMINGO_2330_LIMA)).toMatchObject({ ok: true, marca: "nueva" });
    expect(aplicarEscrito(lima, { explicacion: "Feria del 8.", marcar_revisada: true }, "u1", LUNES_0030_LIMA)).toMatchObject({ ok: true, marca: "nueva" });
  });

  describe("la ruta, OPERADA con el doble de base", () => {
    beforeEach(prepararOperacion);
    afterEach(soltarOperacion);

    it("NEGATIVA: POST «marcar revisada» de la semana en curso → 409 con el motivo; no se escribe nada (tampoco la explicación) y no queda rastro de un guardado", async () => {
      const { escrituras, tablas } = enchufar();
      const { status, cuerpo } = await escribir({ semana: EN_CURSO, explicacion: "Va bien.", marcar_revisada: true });
      expect(status).toBe(409);
      expect(cuerpo.error).toBe(errorSemanaSinTerminar(EN_CURSO, AHORA, "America/Lima"));
      expect(cuerpo.error).toMatch(/todavía no terminó: se podrá marcar como revisada desde el 19 oct 2026/);
      expect(escrituras).toEqual([]);
      expect(tablas.revisiones_semanales).toEqual([]);
      expect(rastro()).toEqual([]);
      // Una futura, igual; y pedida por la URL tampoco queda marcada al leerla.
      const futura = await escribir({ semana: FUTURA, explicacion: "Nada todavía.", marcar_revisada: true });
      expect(futura.status).toBe(409);
      expect(futura.cuerpo.error).toMatch(/todavía no empezó/);
      expect(tablas.revisiones_semanales).toEqual([]);
      expect((await leer(`?semana=${EN_CURSO}`)).cuerpo.revisada).toBe(false);
    });

    it("POSITIVA: la misma semana en curso SÍ guarda sus textos sin la marca (201); y cuando termina, se marca (200) con quién y cuándo", async () => {
      const { tablas } = enchufar();
      const texto = await escribir({ semana: EN_CURSO, explicacion: "Va bien." });
      expect(texto.status).toBe(201);
      expect(tablas.revisiones_semanales![0]).toMatchObject({ semana: EN_CURSO, explicacion: "Va bien.", revisada_at: null, revisada_por: null });
      // Lunes 19 a las 00:30 de Lima: la semana del 12 ya terminó para la empresa.
      const lunes19 = new Date("2026-10-19T05:30:00Z");
      vi.setSystemTime(lunes19);
      const marcada = await escribir({ semana: EN_CURSO, marcar_revisada: true });
      expect(marcada.status).toBe(200);
      expect(tablas.revisiones_semanales![0]).toMatchObject({ revisada_por: KELIN.id, revisada_at: lunes19.toISOString(), explicacion: "Va bien." });
    });

    it("el borde, por la ruta: domingo 23:30 de Lima → 409 para la empresa de Lima y 201 para la que vive en UTC; lunes 00:30 de Lima → 201", async () => {
      vi.setSystemTime(DOMINGO_2330_LIMA);
      const lima = enchufar();
      const temprano = await escribir({ semana: SEMANA, explicacion: "Feria del 8.", marcar_revisada: true });
      expect(temprano.status).toBe(409);
      expect(lima.tablas.revisiones_semanales).toEqual([]);
      const utc = enchufar({ ...tablasDeRuta(), companies: [{ id: EMP, zona_horaria: "UTC" }] });
      expect((await escribir({ semana: SEMANA, explicacion: "Feria del 8.", marcar_revisada: true })).status).toBe(201);
      expect(utc.tablas.revisiones_semanales![0]).toMatchObject({ revisada_por: KELIN.id });
      vi.setSystemTime(LUNES_0030_LIMA);
      const yaLunes = enchufar();
      expect((await escribir({ semana: SEMANA, explicacion: "Feria del 8.", marcar_revisada: true })).status).toBe(201);
      expect(yaLunes.tablas.revisiones_semanales![0]).toMatchObject({ revisada_por: KELIN.id, revisada_at: LUNES_0030_LIMA.toISOString() });
    });

    it("la página de la semana en curso no ofrece «Marcar revisada»: dice desde qué día, y «Guardar» sigue ahí (primer pintado)", async () => {
      enchufar();
      const { default: RevisionPag } = await import("@/app/(consultor)/empresa/[id]/revision/page");
      const html = renderToStaticMarkup(await RevisionPag({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve({ semana: EN_CURSO }) }));
      expect(html).toContain(nombreDeSemana(EN_CURSO));
      expect(html).not.toMatch(/<button[^>]*>Marcar revisada<\/button>/);
      expect(html).toContain("Se podrá marcar como revisada desde el 19 oct 2026, cuando la semana termine.");
      expect(html).toMatch(/<button[^>]*>Guardar<\/button>/);
      // La que terminó sigue ofreciéndolo.
      const terminada = renderToStaticMarkup(await RevisionPag({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve({ semana: SEMANA }) }));
      expect(terminada).toMatch(/<button[^>]*>Marcar revisada<\/button>/);
      expect(terminada).not.toContain("Se podrá marcar como revisada desde");
    });
  });

  it("la pantalla: en la semana en curso el botón no existe aunque ya haya explicación; en la terminada, sí", async () => {
    const textos = { explicacion: "Va bien.", decision_necesaria: null, siguiente: null, creada_por: "u1", revisada_at: null, revisada_por: null };
    const enCurso = await pintarPantalla(armar(entrada({ textos }), EN_CURSO, HOY));
    expect(enCurso).not.toMatch(/<button[^>]*>Marcar revisada<\/button>/);
    expect(enCurso).toContain("Se podrá marcar como revisada desde el 19 oct 2026, cuando la semana termine. «Guardar» sí guarda lo que escribas.");
    const terminada = await pintarPantalla(armar(entrada({ textos }), SEMANA, HOY));
    expect(terminada).toMatch(/<button[^>]*>Marcar revisada<\/button>/);
  });
});

describe("CIERRE Z5 · «dato viejo» propone registrar el periodo que cerró EN EL RELOJ DE LA EMPRESA, no en UTC", () => {
  /** 30 de setiembre a las 21:00 de Lima: en UTC ya es 1 de octubre. Setiembre no cerró para la empresa. */
  const LIMA_30_SET_21H = new Date("2026-10-01T02:00:00Z");
  const viejo = (parcial: Partial<Kpi> = {}) => kpi({ id: "k1", nombre: "Devoluciones al mes", frecuencia: "mensual", valor_actual: 4, valor_actual_periodo: "2026-06", valor_actual_at: "2026-07-12T10:00:00Z", ...parcial });
  const decision = (zona: string, k: Kpi, semana: string, hoy: Date) => armar(entrada({ indicadores: [k], zona }), semana, hoy).desvios.find((d) => d.tipo === "datos_desactualizados")?.decision_propuesta ?? "";

  it("NEGATIVA: a las 21:00 de Lima del 30 de setiembre NO se propone registrar setiembre (antes sí, y la ruta de valores lo rechaza); se propone agosto", () => {
    const lima = decision("America/Lima", viejo(), "2026-09-28", LIMA_30_SET_21H);
    expect(lima).toMatch(/Registrar el valor de Agosto 2026 de «Devoluciones al mes»/);
    expect(lima).not.toMatch(/Setiembre 2026/);
    // POSITIVA: para una empresa que vive en UTC a esa hora setiembre ya cerró.
    expect(decision("UTC", viejo(), "2026-09-28", LIMA_30_SET_21H)).toMatch(/Registrar el valor de Setiembre 2026/);
    // Y tres horas después, pasada la medianoche de Lima, también para Lima.
    expect(decision("America/Lima", viejo(), "2026-09-28", new Date("2026-10-01T05:00:00Z"))).toMatch(/Registrar el valor de Setiembre 2026/);
  });

  it("las demás frecuencias, en el mismo borde: semanal y diaria se cuentan con el día de la empresa", () => {
    const semanal = viejo({ frecuencia: "semanal", valor_actual_periodo: "2026-S30" });
    // Domingo 11 a las 23:30 de Lima, revisando la semana que corre (la del 5): la última que cerró es la del 28 de setiembre (S40), no la del 5.
    expect(decision("America/Lima", semanal, SEMANA, DOMINGO_2330_LIMA)).toMatch(/Registrar el valor de Semana 40 de 2026/);
    expect(decision("UTC", semanal, "2026-10-12", DOMINGO_2330_LIMA)).toMatch(/Registrar el valor de Semana 41 de 2026/);
    const diario = viejo({ frecuencia: "diaria", valor_actual_periodo: "2026-07-11" });
    expect(decision("America/Lima", diario, "2026-09-28", LIMA_30_SET_21H)).toMatch(/Registrar el valor de 29 de setiembre de 2026/);
    expect(decision("UTC", diario, "2026-09-28", LIMA_30_SET_21H)).toMatch(/Registrar el valor de 30 de setiembre de 2026/);
  });

  it("una semana ya pasada se juzga hasta su domingo, viva donde viva la empresa: el periodo propuesto no depende de la hora del servidor", () => {
    for (const zona of ["America/Lima", "UTC", "Asia/Tokyo"]) {
      expect(decision(zona, viejo(), SEMANA, HOY), zona).toMatch(/Registrar el valor de Setiembre 2026/);
      expect(decision(zona, viejo({ frecuencia: "semanal", valor_actual_periodo: "2026-S30" }), SEMANA, HOY), zona).toMatch(/Registrar el valor de Semana 40 de 2026/);
    }
  });
});

describe("la página de la consultora PINTADA con el doble de base (primer pintado en servidor; los clics no se operan aquí)", () => {
  beforeEach(prepararOperacion);
  afterEach(soltarOperacion);

  const pintarPagina = async (sp: { semana?: string } = {}) => {
    const { default: RevisionPag } = await import("@/app/(consultor)/empresa/[id]/revision/page");
    return renderToStaticMarkup(await RevisionPag({ params: Promise.resolve({ id: EMP }), searchParams: Promise.resolve(sp) }));
  };

  it("sin pedir semana, un lunes a las 00:30 de Lima abre la que terminó; el domingo a las 23:30, todavía la anterior", async () => {
    vi.setSystemTime(LUNES_0030_LIMA);
    enchufar();
    const lunes = await pintarPagina();
    expect(lunes).toContain(nombreDeSemana("2026-10-05"));
    expect(lunes).not.toContain(nombreDeSemana("2026-10-12"));
    expect(lunes).not.toContain("Esta semana todavía no terminó");
    expect(lunes).not.toContain("Volver a la semana que terminó");
    vi.setSystemTime(DOMINGO_2330_LIMA);
    const domingo = await pintarPagina();
    expect(domingo).toContain(nombreDeSemana("2026-09-28"));
    expect(domingo).not.toContain(nombreDeSemana("2026-10-05"));
    // A esa misma hora, para una empresa que vive en UTC ya es lunes: se abre la semana que allí terminó.
    enchufar({ ...tablasDeRuta(), companies: [{ id: EMP, zona_horaria: "UTC" }] });
    expect(await pintarPagina()).toContain(nombreDeSemana("2026-10-05"));
  });

  it("una semana que no es lunes no se abre: se abre la que terminó; una semana pasada sí, y ofrece volver", async () => {
    enchufar();
    expect(await pintarPagina({ semana: "2026-10-06" })).toContain(nombreDeSemana("2026-10-05"));
    const pasada = await pintarPagina({ semana: "2026-09-28" });
    expect(pasada).toContain(nombreDeSemana("2026-09-28"));
    expect(pasada).toContain("Volver a la semana que terminó");
  });

  it("quién revisó sale de revisada_por, no de quien creó la fila; el día es el de la empresa; y ya no se ofrece marcar", async () => {
    const tablas = tablasDeRuta();
    // La guardó una consultora y la revisó otra, el martes 13 a las 22:00 de Lima (en UTC ya es miércoles 14).
    tablas.revisiones_semanales = [{ id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: OTRA.id, revisada_por: KELIN.id, revisada_at: "2026-10-14T03:00:00.000Z" }];
    enchufar(tablas);
    const html = await pintarPagina({ semana: SEMANA });
    expect(html).toContain("Revisada por Kelin Merma el 13 oct 2026");
    expect(html).not.toContain("Otra Consultora");
    expect(html).not.toMatch(/<button[^>]*>Marcar revisada<\/button>/);
    expect(html).toContain("Ya está marcada como revisada por Kelin Merma");
    // La misma marca, vista desde una empresa que vive en UTC, cae en su día: el 14.
    enchufar({ ...tablas, companies: [{ id: EMP, zona_horaria: "UTC" }] });
    expect(await pintarPagina({ semana: SEMANA })).toContain("Revisada por Kelin Merma el 14 oct 2026");
  });

  it("guardada por alguien pero sin marcar: no dice «Revisada», y se ofrece marcarla porque ya tiene explicación", async () => {
    const tablas = tablasDeRuta();
    tablas.revisiones_semanales = [{ id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: OTRA.id, revisada_por: null, revisada_at: null }];
    enchufar(tablas);
    const html = await pintarPagina({ semana: SEMANA });
    expect(html).not.toContain("Revisada");
    expect(html).toContain("Se juzga hasta el 11 oct 2026");
    const boton = /<button[^>]*>Marcar revisada<\/button>/.exec(html)?.[0];
    expect(boton).toBeDefined();
    expect(boton).not.toContain("disabled");
  });

  it("en una base sin la migración la página no se cae y lee la marca de antes: quién, sin fecha", async () => {
    const tablas = tablasDeRuta();
    tablas.revisiones_semanales = [{ id: "r1", company_id: EMP, semana: SEMANA, explicacion: "Feria del 8.", decision_necesaria: null, siguiente: null, creada_por: KELIN.id }];
    enchufar(tablas, SIN_MIGRACION);
    const html = await pintarPagina({ semana: SEMANA });
    expect(html).toContain("Revisada por Kelin Merma");
    expect(html).not.toContain("Revisada por Kelin Merma el ");
  });
});

describe("«Esta semana» del dueño PINTADA con el doble de base (primer pintado en servidor)", () => {
  beforeEach(() => {
    prepararOperacion();
    vi.mocked(contextoPortal).mockReset();
    vi.mocked(contextoPortal).mockResolvedValue({ companyId: EMP, queFalta: "" } as unknown as Awaited<ReturnType<typeof contextoPortal>>);
  });
  afterEach(soltarOperacion);

  const pintarSemana = async (sp: { semana?: string } = {}) => {
    const { default: SemanaPag } = await import("@/app/(cliente)/portal/semana/page");
    return renderToStaticMarkup(await SemanaPag({ searchParams: Promise.resolve(sp) }));
  };

  it("abre la semana que CORRE según el reloj de la empresa; una semana futura no se abre", async () => {
    vi.setSystemTime(DOMINGO_2330_LIMA);
    enchufar();
    const domingo = await pintarSemana();
    expect(domingo).toContain(nombreDeSemana("2026-10-05"));
    expect(domingo).toContain(">Esta semana<");
    vi.setSystemTime(LUNES_0030_LIMA);
    expect(await pintarSemana()).toContain(nombreDeSemana("2026-10-12"));
    expect(await pintarSemana({ semana: "2026-10-19" })).toContain(nombreDeSemana("2026-10-12"));
    const pasada = await pintarSemana({ semana: "2026-10-05" });
    expect(pasada).toContain(nombreDeSemana("2026-10-05"));
    expect(pasada).toContain(">Esa semana<");
    // El domingo a las 23:30 de Lima, para una empresa que vive en UTC la semana que corre ya es la del 12.
    vi.setSystemTime(DOMINGO_2330_LIMA);
    enchufar({ ...tablasDeRuta(), companies: [{ id: EMP, zona_horaria: "UTC" }] });
    expect(await pintarSemana()).toContain(nombreDeSemana("2026-10-12"));
  });

  it("lo que hizo el sistema lo firma «El sistema» ante el dueño, no la consultora", async () => {
    const tablas = tablasDeRuta();
    tablas.accion_historial = [{ id: "h9", action_id: "a1", accion: "aprobar", motivo: null, actor_rol: "sistema", created_at: "2026-10-06T15:00:00Z" }];
    enchufar(tablas);
    const html = await pintarSemana({ semana: SEMANA });
    expect(html).toContain("El sistema aprobó «Cotizar sin el dueño».");
    expect(html).not.toContain("La consultora aprobó");
  });
});
