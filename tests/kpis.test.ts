/**
 * INDICADORES CON LOS DOCE ATRIBUTOS, Y LAS REGLAS QUE NO SE NEGOCIAN (R13.1 y la detección de alertas de R13.2).
 *
 * Hasta el 13-10-2026 un indicador tenía nombre, cómo se mide, unidad, meta y frecuencia. Con eso se
 * lee, pero no se dirige: nadie sabía de dónde salía el dato, quién lo contaba, desde dónde se partía
 * ni a partir de qué cifra preocuparse. Estas pruebas fijan lo que vale ahora:
 *   · la completitud dice qué falta, y sin fuente o sin responsable el indicador no está listo;
 *   · la falta de dato nunca es cero: con valor null no se inserta fila y queda «sin dato en <periodo>»;
 *   · «dato viejo» depende de la frecuencia (2, 10, 20, 40 y 100 días), con el borde incluido;
 *   · el umbral avisa por debajo o por encima, nunca en el borde exacto;
 *   · una meta con plazo y sin acción es una alerta;
 *   · el avance solo compara periodos equivalentes y dice que es resultado observado, no atribuible;
 *   · ejecución y resultado no se mezclan.
 * Todo es determinista: las fechas se pasan a mano y los casos se pueden rehacer con lápiz.
 *
 * REMATE K (13-10-2026), al final del archivo:
 *   · un «sin dato» de un periodo anterior no degrada el valor actual;
 *   · nada se archiva sin motivo (ocho letras), ni desde la pantalla ni contra la ruta;
 *   · hay un solo camino para escribir un valor (`guardarValor`), y la ruta vieja pasa por él;
 *   · un periodo cierra en el reloj de la empresa: entre las 19:00 y las 24:00 de Lima del último día del
 *     mes, el mes sigue abierto aunque en UTC ya sea el día 1;
 *   · los atributos son doce, la clasificación va aparte y «listo para contarse» exige que no falte ninguno.
 * REPAROS DEL VERIFICADOR SOBRE EL REMATE K (13-10-2026):
 *   · todo valor mensual se refleja en los números de la empresa, entre por la ruta que entre, y el reflejo no
 *     pisa lo que salió de un documento; lo que no es mensual no se refleja y la pantalla lo dice;
 *   · el bloque viejo de «Tus números» ya no promete cortes, y ofrece el mes que cerró en el reloj de la empresa;
 *   · un hueco sobre el mismo periodo del valor se dice con sus palabras, y uno de otra clase de periodo (cambio
 *     de frecuencia) no degrada;
 *   · si algo falla después de guardar el valor, el rastro queda escrito y quien registra no lee el mensaje de la base.
 * Las rutas se prueban con dobles (`supabaseAdmin()` es una base en memoria, `perfilApi()` devuelve el perfil
 * que la prueba quiere); el esquema real lo prueba tests/sql/kpis.test.ts sobre Postgres embebido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Fila = Record<string, unknown>;
type Operacion = "select" | "update" | "insert";
const base = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  escrituras: [] as { tabla: string; op: Operacion; datos: Fila }[],
  fallar: {} as Record<string, { op: Operacion; mensaje: string } | undefined>,
  seq: 0,
}));

vi.mock("@/lib/supabase/admin", () => {
  // Un doble de PostgREST en memoria: filtra con los .eq recibidos, aplica update sobre las filas
  // filtradas, inserta con id creciente y apunta cada escritura para poder afirmar «no se escribió nada».
  // `base.fallar[tabla]` hace fallar una operación con un mensaje.
  type Resultado = { data: Fila[] | null; error: { message: string } | null };
  const consulta = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = [];
    let modo: Operacion = "select";
    let cuerpo: Fila = {};
    let afectadas: Fila[] = [];
    let hecho = false;
    // Las columnas pedidas en una LECTURA (null: todas). PostgREST no devuelve lo que no se pidió, y el doble
    // tampoco: una ruta que lee «id,accion,estado» no puede dar por leído el `indicador_id`.
    let columnas: string[] | null = null;
    const filas = () => (base.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
    const ejecutar = (): Resultado => {
      const fallo = base.fallar[tabla];
      if (fallo && fallo.op === modo) return { data: null, error: { message: fallo.mensaje } };
      // Una lectura devuelve copias, como PostgREST: lo leído no cambia aunque después se actualice la fila.
      if (modo === "select") {
        const cols = columnas;
        return { data: filas().map((f) => (cols ? Object.fromEntries(cols.filter((c) => c in f).map((c) => [c, f[c]])) : { ...f })), error: null };
      }
      if (!hecho) {
        hecho = true;
        if (modo === "update") {
          afectadas = filas();
          for (const f of afectadas) Object.assign(f, cuerpo);
          base.escrituras.push({ tabla, op: "update", datos: { ...cuerpo } });
        } else {
          base.seq += 1;
          const nueva = { id: `${tabla}-${base.seq}`, ...cuerpo };
          (base.tablas[tabla] ??= []).push(nueva);
          afectadas = [nueva];
          base.escrituras.push({ tabla, op: "insert", datos: nueva });
        }
      }
      return { data: afectadas, error: null };
    };
    const q = {
      select: (cols?: string) => {
        if (modo === "select" && cols && !/[(:*]/.test(cols)) columnas = cols.split(",").map((c) => c.trim());
        return q;
      },
      order: () => q,
      limit: () => q,
      eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return q; },
      neq: (k: string, v: unknown) => { filtros.push((f) => f[k] !== v); return q; },
      // Solo la forma que usa el código: .not("estado", "in", "(descartado,rechazado)"). Otra, que se note.
      not: (k: string, op: string, v: string) => {
        if (op !== "in") throw new Error(`el doble no entiende .not(…, "${op}", …)`);
        const fuera = v.replace(/^\(|\)$/g, "").split(",").map((x) => x.trim());
        filtros.push((f) => !fuera.includes(String(f[k])));
        return q;
      },
      in: (k: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[k])); return q; },
      update: (datos: Fila) => { modo = "update"; cuerpo = datos; return q; },
      insert: (datos: Fila) => { modo = "insert"; cuerpo = datos; return q; },
      maybeSingle: async () => { const r = ejecutar(); return { data: r.error ? null : (r.data?.[0] ?? null), error: r.error }; },
      single: async () => { const r = ejecutar(); const d = r.data?.[0] ?? null; return { data: d, error: r.error ?? (d ? null : { message: "no hay fila" }) }; },
      then: (res: (v: Resultado) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  return { supabaseAdmin: () => ({ from: consulta }) };
});
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));
vi.mock("@/lib/jobs/queue", () => ({ encolar: vi.fn(async () => ({ id: "job-1" })), PRIORIDAD: { diagnosticar: 5 } }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: () => {} }) }));

import {
  completitud, listo, registrarValor, alerta, alertas, metaSinPlan, avance, separarPorTipo, kpisDesdeVitales, propuestaDesdeMedidor,
  desdeFila, periodoValido, periodoCerradoMasReciente, periodosRecientes, nombreDePeriodoKpi, granularidad, textoValor,
  finDePeriodo, zonaDe, diaEnZona, preparacion, textoValidacion, letrasDe, motivoSuficiente, terminaAntes,
  LIMITE_DIAS, ATRIBUTOS, ATRIBUTOS_DE_REGISTRO, IMPRESCINDIBLES, TEXTO_SIN_DATO, TEXTO_FALTA_MOTIVO, FRECUENCIAS, ZONA_POR_DEFECTO, MIN_LETRAS_MOTIVO,
  TEXTO_SIN_DATO_DESPUES, TEXTO_SIN_DATO_MISMO_PERIODO,
  type Kpi, type Frecuencia,
} from "@/lib/kpis";
import type { Metrica } from "@/lib/metricas";
import { valoresActuales } from "@/lib/medicion";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { registrarError } from "@/lib/errores";
import { guardarValor, zonaDeEmpresa, dejarMotivoDeArchivo, rastroDeValor, TEXTO_NO_SE_GUARDO, TEXTO_PENDIENTE, TEXTO_AL_LADO } from "@/app/api/companies/[id]/kpis/_registro";
import { PATCH as patchViejo } from "@/app/api/companies/[id]/indicadores/route";
import { PATCH as patchIndicador } from "@/app/api/companies/[id]/kpis/[kid]/route";
import { GET as getIndicadores, POST as postIndicador } from "@/app/api/companies/[id]/kpis/route";
import PaginaTablero from "@/app/(consultor)/empresa/[id]/kpis/page";
import { POST as postValor } from "@/app/api/companies/[id]/kpis/[kid]/valor/route";
import { TableroKpis, type KpiVista } from "@/components/kpis/TableroKpis";
import { MotivoArchivo } from "@/components/kpis/MotivoArchivo";
import { TusIndicadores, type IndicadorCliente } from "@/components/kpis/TusIndicadores";
import { Indicadores, type Indicador, type ValorIndicador } from "@/components/cliente/Indicadores";

const HOY = new Date("2026-10-13T12:00:00Z");
const DIA = 86_400_000;
const hace = (dias: number, extraMs = 0) => new Date(HOY.getTime() - dias * DIA - extraMs).toISOString();

/** Un indicador completo, con los doce atributos: la vara contra la que se miden los incompletos. */
function completo(sobre: Partial<Kpi> = {}): Kpi {
  return {
    id: "k1", company_id: "e1", clave: "devoluciones_mes", nombre: "Devoluciones al mes", como_se_mide: "Contar las prendas devueltas en el cuaderno de caja",
    mejor_si: "baja", origen: "incidencia", origen_texto: "Nos devuelven mucho", estado: "activo",
    definicion: "Cuántas prendas vuelven a la tienda cada mes.",
    formula: "Suma de devoluciones anotadas en el cuaderno de caja en el mes.",
    unidad: "unidades", moneda: null,
    fuente: "Cuaderno de caja",
    responsable_participant_id: "p1",
    frecuencia: "mensual",
    linea_base_valor: 40, linea_base_periodo: "2026-06", linea_base_medicion_id: "m1",
    meta_valor: 20, meta_texto: "la mitad", meta_plazo: "2026-12-31",
    valor_actual: 30, valor_actual_periodo: "2026-09", valor_actual_at: hace(5),
    estado_validacion: "declarado",
    umbral_alerta: 45, umbral_sentido: "por_encima",
    accion_asociada_id: "a1", decision_asociada: "Revisar el control de calidad antes de despachar",
    tipo_indicador: "resultado",
    ...sobre,
  };
}

describe("completitud: qué le falta a un indicador para ser un instrumento", () => {
  it("el completo no tiene faltantes y está listo", () => {
    expect(completitud(completo())).toEqual([]);
    expect(listo(completo())).toEqual({ ok: true, faltan: [] });
  });

  it("uno recién propuesto lista los doce atributos que faltan, en el orden de Dirección; la clasificación no es uno de ellos", () => {
    // Unidad y frecuencia siempre tienen algo (la base pone un valor por defecto): para que falten hace falta
    // dinero sin moneda y una frecuencia que no existe. Lo demás, vacío.
    const vacio = completo({
      definicion: null, formula: null, unidad: "soles", moneda: null, fuente: null, responsable_participant_id: null, frecuencia: "anual" as unknown as Frecuencia,
      linea_base_valor: null, linea_base_periodo: null, meta_valor: null, meta_texto: null, meta_plazo: null, valor_actual: null, valor_actual_periodo: null, valor_actual_at: null,
      estado_validacion: null, umbral_alerta: null, umbral_sentido: null, accion_asociada_id: null, decision_asociada: null, tipo_indicador: null,
    });
    const faltan = completitud(vacio).map((f) => f.atributo);
    expect(faltan).toEqual([...ATRIBUTOS]);
    expect(completitud(vacio).every((f) => f.etiqueta.length > 3 && f.por_que.length > 10)).toBe(true);
    // Son doce, no trece: tipo_indicador es la clasificación (ejecución o resultado) y se muestra aparte.
    expect(ATRIBUTOS).toHaveLength(12);
    expect(ATRIBUTOS as readonly string[]).not.toContain("tipo_indicador");
    expect(faltan as string[]).not.toContain("tipo_indicador");
  });

  it("sin fuente o sin responsable NO está listo, aunque tenga todo lo demás", () => {
    const sinFuente = listo(completo({ fuente: null }));
    expect(sinFuente.ok).toBe(false);
    expect(sinFuente.faltan.map((f) => f.atributo)).toEqual(["fuente"]);
    const sinResponsable = listo(completo({ responsable_participant_id: null }));
    expect(sinResponsable.ok).toBe(false);
    expect(sinResponsable.faltan.map((f) => f.atributo)).toEqual(["responsable"]);
    expect(IMPRESCINDIBLES).toContain("fuente");
    expect(IMPRESCINDIBLES).toContain("responsable");
  });

  // CAMBIADA EN EL REMATE K. Antes afirmaba lo contrario («sin meta ni umbral sigue estando listo»): `listo`
  // solo miraba fuente, responsable y frecuencia, y el tablero llamaba listo a un indicador incompleto.
  // Decisión de Dirección: «listo para contarse» exige que no falte ninguno de los doce.
  it("sin meta ni umbral NO está listo para contarse: listo exige que no falte ninguno de los doce", () => {
    const k = completo({ meta_valor: null, meta_texto: null, meta_plazo: null, umbral_alerta: null, umbral_sentido: null });
    expect(listo(k).ok).toBe(false);
    expect(listo(k).faltan.map((f) => f.atributo)).toEqual(["meta", "umbral"]);
    expect(completitud(k).map((f) => f.atributo)).toEqual(["meta", "umbral"]);
    expect(preparacion(k)).toBe("por_definir");
  });

  it("con los doce pero sin clasificar tampoco está listo; clasificado y completo, sí", () => {
    const sinClasificar = completo({ tipo_indicador: null });
    expect(completitud(sinClasificar)).toEqual([]);
    expect(listo(sinClasificar)).toEqual({ ok: false, faltan: [] });
    expect(preparacion(sinClasificar)).toBe("por_definir");
    expect(preparacion(completo())).toBe("listo");
  });

  it("al que solo le falta su primer valor no se le dice «no está listo»: está definido y espera el dato", () => {
    const definido = completo({ valor_actual: null, valor_actual_periodo: null, valor_actual_at: null, estado_validacion: null });
    expect(completitud(definido).map((f) => f.atributo)).toEqual([...ATRIBUTOS_DE_REGISTRO]);
    expect(listo(definido).ok).toBe(false);
    expect(preparacion(definido)).toBe("espera_primer_valor");
    // Si además le falta algo que se define (la fuente), ya no es «solo falta el valor».
    expect(preparacion({ ...definido, fuente: null })).toBe("por_definir");
    // Un periodo anotado sin dato antes del primer valor: sigue esperando su primer valor.
    expect(preparacion({ ...definido, estado_validacion: "sin_dato" })).toBe("espera_primer_valor");
  });

  it("una meta sin plazo cuenta como meta faltante; un valor en dinero sin moneda cuenta como unidad faltante", () => {
    expect(completitud(completo({ meta_plazo: null })).map((f) => f.atributo)).toEqual(["meta"]);
    expect(completitud(completo({ unidad: "soles", moneda: null })).map((f) => f.atributo)).toEqual(["unidad"]);
    expect(completitud(completo({ unidad: "soles", moneda: "PEN" }))).toEqual([]);
  });

  it("un umbral sin sentido no es umbral; una acción O una decisión bastan para la asociación", () => {
    expect(completitud(completo({ umbral_sentido: null })).map((f) => f.atributo)).toEqual(["umbral"]);
    expect(completitud(completo({ accion_asociada_id: null }))).toEqual([]);
    expect(completitud(completo({ accion_asociada_id: null, decision_asociada: null })).map((f) => f.atributo)).toEqual(["asociacion"]);
  });
});

describe("registrarValor: la falta de dato nunca es cero", () => {
  const k = completo();

  it("con valor null NO inserta fila: el indicador queda sin_dato y el texto dice «sin dato en <periodo>»", () => {
    // El último valor es de agosto: setiembre es un periodo nuevo. (El hueco sobre un periodo que ya tiene valor se prueba en (a).)
    const r = registrarValor(completo({ valor_actual_periodo: "2026-08" }), { periodo: "2026-09", valor: null }, HOY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sin_dato).toBe(true);
    expect(r.insertar).toBeNull();
    expect(r.actualizar).toEqual({ estado_validacion: "sin_dato" });
    expect(r.texto).toBe("sin dato en Setiembre 2026");
    expect(r.texto).toBe(TEXTO_SIN_DATO("2026-09"));
    // Y jamás toca el valor actual: no hay un cero disfrazado.
    expect("valor_actual" in r.actualizar).toBe(false);
  });

  it("con un número inserta la fila y actualiza el valor actual con su periodo y su validación", () => {
    const r = registrarValor(k, { periodo: "2026-09", valor: 28, fuente: "Cuaderno de caja", estado_validacion: "conciliado", nota: "revisado con Rosa" }, HOY);
    expect(r.ok && !r.sin_dato).toBe(true);
    if (!r.ok || r.sin_dato) return;
    expect(r.insertar).toEqual({ indicador_id: "k1", periodo: "2026-09", valor: 28, fuente: "Cuaderno de caja", estado_validacion: "conciliado", nota: "revisado con Rosa" });
    expect(r.actualizar).toEqual({ valor_actual: 28, valor_actual_periodo: "2026-09", valor_actual_at: HOY.toISOString(), estado_validacion: "conciliado" });
    expect(r.es_periodo_anterior).toBe(false);
  });

  it("un cero declarado SÍ es un dato (vendió cero): se inserta como 0", () => {
    const r = registrarValor(k, { periodo: "2026-09", valor: 0 }, HOY);
    expect(r.ok && !r.sin_dato && r.insertar.valor === 0).toBe(true);
  });

  it("sin fuente propia hereda la del indicador; sin validación declarada entra como «declarado»", () => {
    const r = registrarValor(k, { periodo: "2026-09", valor: 3 }, HOY);
    if (!r.ok || r.sin_dato) throw new Error("debió registrar");
    expect(r.insertar.fuente).toBe("Cuaderno de caja");
    expect(r.insertar.estado_validacion).toBe("declarado");
  });

  it("un periodo anterior al del valor actual completa la historia sin mover «hoy»", () => {
    const r = registrarValor(k, { periodo: "2026-07", valor: 35 }, HOY);
    if (!r.ok || r.sin_dato) throw new Error("debió registrar");
    expect(r.es_periodo_anterior).toBe(true);
    expect(r.actualizar).toEqual({});
    expect(r.texto).toContain("Setiembre 2026");
  });

  it("rechaza un periodo con la forma equivocada para la frecuencia, y uno que todavía no cerró", () => {
    const semana = registrarValor(k, { periodo: "2026-S40", valor: 3 }, HOY);
    expect(semana.ok).toBe(false);
    if (!semana.ok) expect(semana.motivo).toMatch(/cada mes/);
    const enCurso = registrarValor(k, { periodo: "2026-10", valor: 3 }, HOY);
    expect(enCurso.ok).toBe(false);
    if (!enCurso.ok) expect(enCurso.motivo).toMatch(/todavía no terminó/);
    // El mes que acaba de cerrar sí entra.
    expect(registrarValor(k, { periodo: "2026-09", valor: 3 }, HOY).ok).toBe(true);
  });

  it("un valor que no es número se rechaza con la indicación de dejar vacío, no poner cero", () => {
    const r = registrarValor(k, { periodo: "2026-09", valor: Number.NaN }, HOY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no pongas cero/);
  });
});

describe("alerta «dato viejo»: depende de la frecuencia, con el borde incluido", () => {
  const limites: Record<Frecuencia, number> = { diaria: 2, semanal: 10, quincenal: 20, mensual: 40, trimestral: 100 };

  it("los límites son 2, 10, 20, 40 y 100 días", () => {
    expect(LIMITE_DIAS).toEqual(limites);
  });

  for (const f of FRECUENCIAS) {
    it(`${f}: a exactamente ${limites[f]} días no es viejo; un minuto más tarde sí`, () => {
      const enElBorde = completo({ frecuencia: f, linea_base_periodo: null, linea_base_valor: null, valor_actual_at: hace(limites[f]) });
      expect(alertas(enElBorde, HOY).some((a) => a.tipo === "desactualizado")).toBe(false);
      const pasado = completo({ frecuencia: f, valor_actual_at: hace(limites[f], 60_000) });
      const a = alertas(pasado, HOY).find((x) => x.tipo === "desactualizado");
      expect(a).toBeTruthy();
      expect(a!.texto).toContain(`hasta ${limites[f]}`);
    });
  }

  it("sin ningún valor registrado también avisa: no hay nada que leer", () => {
    const a = alertas(completo({ valor_actual: null, valor_actual_periodo: null, valor_actual_at: null }), HOY).find((x) => x.tipo === "desactualizado");
    expect(a?.texto).toMatch(/ningún valor/);
  });
});

describe("alerta de umbral: por debajo o por encima, nunca en el borde exacto", () => {
  it("por_encima 45: 46 avisa, 45 no, 44 no", () => {
    const con = (valor: number) => alertas(completo({ umbral_alerta: 45, umbral_sentido: "por_encima", valor_actual: valor }), HOY).find((a) => a.tipo === "umbral");
    expect(con(46)?.texto).toMatch(/por encima del umbral/);
    expect(con(45)).toBeUndefined();
    expect(con(44)).toBeUndefined();
  });

  it("por_debajo 5: 4 avisa, 5 no, 6 no; y el texto trae la decisión asociada", () => {
    const con = (valor: number) => alertas(completo({ umbral_alerta: 5, umbral_sentido: "por_debajo", valor_actual: valor, mejor_si: "sube" }), HOY).find((a) => a.tipo === "umbral");
    expect(con(4)?.texto).toMatch(/por debajo del umbral/);
    expect(con(4)?.texto).toContain("Revisar el control de calidad");
    expect(con(5)).toBeUndefined();
    expect(con(6)).toBeUndefined();
  });

  it("sin valor actual no hay umbral que cruzar: la alerta es que no hay dato, no que se cruzó", () => {
    const as = alertas(completo({ umbral_alerta: 5, umbral_sentido: "por_debajo", valor_actual: null, valor_actual_periodo: null, valor_actual_at: null }), HOY);
    expect(as.map((a) => a.tipo)).toEqual(["desactualizado"]);
  });
});

describe("alertas de dirección: meta sin plan y sin punto de partida", () => {
  it("meta con plazo y sin acción asociada avisa; con acción no; sin plazo no", () => {
    const sinPlan = alertas(completo({ accion_asociada_id: null }), HOY).find((a) => a.tipo === "meta_sin_plan");
    expect(sinPlan?.texto).toContain("2026-12-31");
    expect(alertas(completo(), HOY).find((a) => a.tipo === "meta_sin_plan")).toBeUndefined();
    expect(alertas(completo({ accion_asociada_id: null, meta_plazo: null }), HOY).find((a) => a.tipo === "meta_sin_plan")).toBeUndefined();
  });

  describe("CIERRE Z5 · «meta sin plan» mira el vínculo en sus dos sentidos cuando tiene el plan delante, igual que la revisión semanal", () => {
    const conMeta = (sobre: Partial<Kpi> = {}) => completo({ accion_asociada_id: null, ...sobre });
    const accion = (sobre: { id: string; estado?: string; indicador_id?: string | null; accion?: string }) => ({ estado: "en_ejecucion", indicador_id: null, accion: "Revisar cada devolución", ...sobre });
    const sinPlan = (k: Kpi, acciones: Parameters<typeof metaSinPlan>[1]) => alertas(k, HOY, acciones).find((a) => a.tipo === "meta_sin_plan");

    it("NEGATIVA: una acción del plan dice medirse con este indicador (indicador_id) y el indicador no nombra ninguna → NO es meta sin plan (antes avisaba)", () => {
      const k = conMeta();
      const plan = [accion({ id: "a1", indicador_id: "k1" })];
      expect(metaSinPlan(k, plan)).toBeNull();
      expect(sinPlan(k, plan)).toBeUndefined();
      expect(alertas(k, HOY, plan)).toEqual([]);
      expect(alerta(k, HOY, plan)).toBeNull();
    });

    it("el otro sentido sigue valiendo: el indicador nombra su acción (accion_asociada_id) y la acción no apunta a nadie → tampoco", () => {
      const k = conMeta({ accion_asociada_id: "a1" });
      expect(sinPlan(k, [accion({ id: "a1" })])).toBeUndefined();
    });

    it("POSITIVA: ningún sentido → avisa, con el plazo; una acción que apunta a OTRO indicador no cuenta", () => {
      const k = conMeta();
      expect(sinPlan(k, [])?.texto).toBe("Tiene meta con plazo (2026-12-31) y ninguna acción del plan que la persiga.");
      expect(sinPlan(k, [accion({ id: "a1", indicador_id: "k9" })])?.texto).toBe("Tiene meta con plazo (2026-12-31) y ninguna acción del plan que la persiga.");
    });

    it("una acción rechazada o pospuesta no persigue nada, la apunte quien la apunte; y se dice cuál es y cómo está", () => {
      expect(sinPlan(conMeta(), [accion({ id: "a1", indicador_id: "k1", estado: "rechazado" })])?.texto).toMatch(/ninguna acción del plan que la persiga/);
      const k = conMeta({ accion_asociada_id: "a2" });
      const pospuesta = accion({ id: "a2", estado: "pospuesto", accion: "Llamar a quien devuelve" });
      expect(sinPlan(k, [pospuesta])?.texto).toBe("Tiene meta con plazo (2026-12-31) y la única acción ligada, «Llamar a quien devuelve», está pospuesta: hoy nadie la persigue.");
      // Si otra acción viva la apunta por indicador_id, vuelve a tener plan.
      expect(sinPlan(k, [pospuesta, accion({ id: "a3", indicador_id: "k1" })])).toBeUndefined();
      // Los estados de antes de la migración se leen como su equivalente: «descartado» es rechazado.
      expect(sinPlan(k, [accion({ id: "a2", estado: "descartado" })])?.texto).toMatch(/está rechazada: hoy nadie la persigue/);
      // Si la acción que nombra el indicador no está entre las leídas no se puede juzgar: no se acusa.
      expect(sinPlan(k, [])).toBeUndefined();
    });

    it("sin meta o sin plazo nunca es «meta sin plan», con plan delante o sin él", () => {
      for (const k of [conMeta({ meta_plazo: null }), conMeta({ meta_valor: null, meta_texto: "  " })]) {
        expect(sinPlan(k, [])).toBeUndefined();
        expect(alertas(k, HOY).find((a) => a.tipo === "meta_sin_plan")).toBeUndefined();
      }
    });

    it("SIN el plan delante solo se mira el indicador, y el texto dice eso y nada más: ya no afirma que ninguna acción la persiga", () => {
      const sola = alertas(conMeta(), HOY).find((a) => a.tipo === "meta_sin_plan");
      expect(sola?.texto).toBe("Tiene meta con plazo (2026-12-31) y el indicador no nombra ninguna acción del plan que la persiga.");
      expect(sola?.texto).not.toMatch(/y ninguna acción del plan/);
    });
  });

  it("sin punto de partida avisa, y el completo no tiene ninguna alerta", () => {
    expect(alertas(completo({ linea_base_valor: null }), HOY).map((a) => a.tipo)).toEqual(["sin_linea_base"]);
    expect(alertas(completo(), HOY)).toEqual([]);
    expect(alerta(completo(), HOY)).toBeNull();
  });

  it("alerta() devuelve la más urgente: el umbral cruzado antes que el dato viejo, y este antes que la meta sin plan", () => {
    const k = completo({ umbral_alerta: 45, umbral_sentido: "por_encima", valor_actual: 50, valor_actual_at: hace(60), accion_asociada_id: null });
    expect(alertas(k, HOY).map((a) => a.tipo)).toEqual(["umbral", "desactualizado", "meta_sin_plan"]);
    expect(alerta(k, HOY)?.tipo).toBe("umbral");
  });
});

describe("avance: punto de partida → hoy → meta, solo entre periodos equivalentes", () => {
  it("mes contra mes: de 40 a 30 con meta 20 es mejorar 10 (25 %) y llevar la mitad del camino", () => {
    const a = avance(completo());
    expect(a.desde_linea_base).toEqual({ delta: -10, pct: -25, mejoro: true });
    expect(a.hacia_meta).toEqual({ pct: 50, falta: -10, plazo: "2026-12-31" });
    expect(a.lectura).toContain("Partió en 40 unidades (Junio 2026)");
    expect(a.lectura).toContain("mejoró 10 unidades (25 %)");
    expect(a.lectura).toContain("50 % del camino");
    expect(a.lectura).toContain("resultado observado");
    expect(a.atribucion).toBe("observado");
  });

  it("rechaza mes contra semana: no son periodos equivalentes, y lo dice", () => {
    const a = avance(completo({ frecuencia: "semanal", valor_actual_periodo: "2026-S40" }));
    expect(a.desde_linea_base).toBeNull();
    expect(a.hacia_meta).toBeNull();
    expect(a.lectura).toMatch(/no son periodos equivalentes/);
    expect(a.lectura).toMatch(/clases de periodo distintas/);
  });

  it("rechaza el mismo periodo (todavía no hay un después) y un periodo sin forma conocida", () => {
    expect(avance(completo({ valor_actual_periodo: "2026-06" })).lectura).toMatch(/mismo periodo/);
    expect(avance(completo({ linea_base_periodo: "actual" })).lectura).toMatch(/sin forma conocida/);
  });

  it("sin punto de partida o sin valor actual no hay avance, y dice cuál falta", () => {
    expect(avance(completo({ linea_base_valor: null })).lectura).toMatch(/Sin punto de partida/);
    expect(avance(completo({ valor_actual: null, estado_validacion: "sin_dato" })).lectura).toMatch(/quedó sin dato/);
  });

  it("si empeora lo dice; si no hay meta numérica no inventa camino; si partió de cero no da porcentaje", () => {
    const peor = avance(completo({ valor_actual: 50 }));
    expect(peor.desde_linea_base?.mejoro).toBe(false);
    expect(peor.lectura).toContain("empeoró");
    const sinMeta = avance(completo({ meta_valor: null }));
    expect(sinMeta.hacia_meta).toBeNull();
    expect(sinMeta.lectura).toMatch(/Sin meta numérica/);
    const deCero = avance(completo({ linea_base_valor: 0, mejor_si: "sube" }));
    expect(deCero.desde_linea_base).toEqual({ delta: 30, pct: null, mejoro: true });
  });
});

describe("ejecución y resultado se distinguen y no se mezclan", () => {
  it("separarPorTipo arma tres listas: resultado, ejecución y sin clasificar", () => {
    const r = completo({ id: "r", tipo_indicador: "resultado" });
    const e = completo({ id: "e", tipo_indicador: "ejecucion", clave: "visitas_realizadas" });
    const s = completo({ id: "s", tipo_indicador: null });
    const g = separarPorTipo([r, e, s]);
    expect(g.resultado.map((k) => k.id)).toEqual(["r"]);
    expect(g.ejecucion.map((k) => k.id)).toEqual(["e"]);
    expect(g.sin_clasificar.map((k) => k.id)).toEqual(["s"]);
  });

  it("lo que la IA propone se clasifica por su vocabulario, y se rotula propuesta", () => {
    const tareas = propuestaDesdeMedidor({ clave: "visitas_realizadas_semana", nombre: "Visitas realizadas", como_se_mide: "Contar las visitas realizadas a clientes en la agenda", unidad: "numero" });
    expect(tareas.tipo_indicador).toBe("ejecucion");
    const negocio = propuestaDesdeMedidor({ clave: "devoluciones_mes", nombre: "Devoluciones al mes", como_se_mide: "Contar las prendas devueltas anotadas en el cuaderno de caja", unidad: "unidades", origen_texto: "nos devuelven mucho" });
    expect(negocio.tipo_indicador).toBe("resultado");
    expect(negocio.fuente).toBe("Sugerida, por confirmar: cuaderno de caja");
    expect(negocio.definicion).toContain("nos devuelven mucho");
    expect(negocio.formula).toMatch(/^Propuesta: /);
    expect(negocio.formula).toContain("unidades");
    // Si la frase no dice de dónde sale el dato, la fuente queda vacía: la completitud lo dirá.
    expect(propuestaDesdeMedidor({ clave: "x", nombre: "Algo", como_se_mide: "Contar cuántas veces pasa", unidad: "numero" }).fuente).toBeNull();
  });
});

describe("kpisDesdeVitales propone, no crea", () => {
  const metricas: Metrica[] = [
    { clave: "venta_mes", periodo: "2026-08", valor: 70000, estado: "contado" },
    { clave: "venta_mes", periodo: "2026-09", valor: 80000, estado: "extraido" },
    { clave: "venta_mes", periodo: "epoca_dorada", valor: 120000, estado: "contado" },
    { clave: "caja_hoy", periodo: "actual", valor: 5000, estado: "contado" },
    { clave: "ganancia_mes", periodo: "2026-09", valor: null, estado: "sin_dato" },
    { clave: "merma_panaderia", periodo: "2026-09", valor: 12, estado: "contado" },
  ];

  it("una propuesta por vital con valor, de resultado y «propuesto», sin valor actual ni punto de partida", () => {
    const ps = kpisDesdeVitales("e1", metricas);
    expect(ps.map((p) => p.kpi.clave)).toEqual(["venta_mes", "caja_hoy"]);
    for (const p of ps) {
      expect(p.rotulo).toBe("propuesto");
      expect(p.kpi.estado).toBe("propuesto");
      expect(p.kpi.tipo_indicador).toBe("resultado");
      expect(p.kpi.company_id).toBe("e1");
      expect(p.kpi.valor_actual).toBeNull();
      expect(p.kpi.linea_base_valor).toBeNull();
      expect(p.kpi.responsable_participant_id).toBeNull();
    }
  });

  it("la referencia es el mes más reciente (no la época dorada) y dice qué tan comprobado está", () => {
    const venta = kpisDesdeVitales("e1", metricas).find((p) => p.kpi.clave === "venta_mes")!;
    expect(venta.referencia).toEqual({ valor: 80000, periodo: "2026-09", estado: "extraido", etiqueta: "extraído, pendiente de conciliar" });
    expect(venta.kpi.unidad).toBe("soles");
    expect(venta.kpi.moneda).toBe("PEN");
    expect(venta.kpi.mejor_si).toBe("sube");
  });

  it("sin números no hay propuestas; un vital declarado sin dato tampoco se propone", () => {
    expect(kpisDesdeVitales("e1", [])).toEqual([]);
    expect(kpisDesdeVitales("e1", metricas).some((p) => p.kpi.clave === "ganancia_mes")).toBe(false);
  });
});

describe("periodos: la frecuencia decide la forma, y nunca se ofrece el que está en curso", () => {
  it("el periodo cerrado más reciente para cada frecuencia, hoy 13-10-2026", () => {
    expect(periodoCerradoMasReciente("diaria", HOY)).toBe("2026-10-12");
    expect(periodoCerradoMasReciente("semanal", HOY)).toBe("2026-S41");
    expect(periodoCerradoMasReciente("quincenal", HOY)).toBe("2026-09-Q2");
    expect(periodoCerradoMasReciente("mensual", HOY)).toBe("2026-09");
    expect(periodoCerradoMasReciente("trimestral", HOY)).toBe("2026-T3");
    // El 16 ya cerró la primera quincena del mes; el 1 de enero el trimestre anterior es el T4 del año pasado.
    expect(periodoCerradoMasReciente("quincenal", new Date("2026-10-16T00:00:00Z"))).toBe("2026-10-Q1");
    expect(periodoCerradoMasReciente("trimestral", new Date("2027-01-01T00:00:00Z"))).toBe("2026-T4");
  });

  it("los recientes van del más nuevo al más viejo y cruzan el año", () => {
    expect(periodosRecientes("mensual", 3, HOY)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(periodosRecientes("quincenal", 3, HOY)).toEqual(["2026-09-Q2", "2026-09-Q1", "2026-08-Q2"]);
    expect(periodosRecientes("trimestral", 4, HOY)).toEqual(["2026-T3", "2026-T2", "2026-T1", "2025-T4"]);
    // 2025 tiene 52 semanas ISO (el 1 de enero fue miércoles y no es bisiesto): después de la S01 de 2026 viene la S52 de 2025.
    expect(periodosRecientes("semanal", 2, new Date("2026-01-08T00:00:00Z"))).toEqual(["2026-S01", "2025-S52"]);
  });

  it("periodoValido exige la forma de la frecuencia; granularidad rechaza fechas que no existen", () => {
    expect(periodoValido("2026-09", "mensual")).toBe(true);
    expect(periodoValido("2026-09", "semanal")).toBe(false);
    expect(periodoValido("2026-S41", "semanal")).toBe(true);
    expect(periodoValido("2026-09-Q2", "quincenal")).toBe(true);
    expect(periodoValido("2026-T3", "trimestral")).toBe(true);
    expect(periodoValido("2026-10-12", "diaria")).toBe(true);
    expect(granularidad("2026-02-30")).toBeNull();
    expect(granularidad("2026-13")).toBeNull();
    expect(granularidad("actual")).toBeNull();
    expect(granularidad("2025-S53")).toBeNull(); // 2025 no tiene semana 53
    expect(granularidad("2026-S53")).toBe("semana"); // 2026 sí: el 1 de enero cae jueves
    expect(granularidad("2020-S53")).toBe("semana"); // 2020 también: bisiesto con el 1 de enero en miércoles
  });

  it("ninguna pantalla muestra un código: cada periodo tiene nombre", () => {
    expect(nombreDePeriodoKpi("2026-09")).toBe("Setiembre 2026");
    expect(nombreDePeriodoKpi("2026-10-12")).toBe("12 de octubre de 2026");
    expect(nombreDePeriodoKpi("2026-S41")).toBe("Semana 41 de 2026");
    expect(nombreDePeriodoKpi("2026-09-Q1")).toBe("Primera quincena de setiembre 2026");
    expect(nombreDePeriodoKpi("2026-T3")).toBe("Trimestre 3 de 2026");
  });

  it("el valor se muestra en el idioma del dueño", () => {
    expect(textoValor("soles", 12500, "PEN")).toBe("S/ 12,500");
    expect(textoValor("de_cada_10", 7)).toBe("7 de cada 10");
    expect(textoValor("dias", 1)).toBe("1 día");
    expect(textoValor("porcentaje", 12.5)).toBe("12.5 %");
    expect(textoValor("moneda", 300, "USD")).toBe("USD 300");
  });
});

describe("desdeFila: lo que viene de la base entra tipado y lo desconocido cae a lo seguro", () => {
  it("convierte numéricos en texto, respeta nulos y no acepta valores fuera del vocabulario", () => {
    const k = desdeFila({ id: "k", company_id: "e", clave: "x", nombre: "X", como_se_mide: "y", unidad: "soles", frecuencia: "quincenal", valor_actual: "12.50", linea_base_valor: null, estado_validacion: "quizas", tipo_indicador: "mixto", umbral_sentido: "arriba", mejor_si: "sube", estado: "activo" });
    expect(k.valor_actual).toBe(12.5);
    expect(k.linea_base_valor).toBeNull();
    expect(k.frecuencia).toBe("quincenal");
    expect(k.estado_validacion).toBeNull();
    expect(k.tipo_indicador).toBeNull();
    expect(k.umbral_sentido).toBeNull();
  });
});

describe("las rutas y el manejador respetan las reglas (lectura del código)", () => {
  const SRC = path.resolve(__dirname, "../src");
  const leer = (ruta: string) => readFileSync(path.join(SRC, ruta), "utf8");

  it("el manejador completa definición, fórmula, fuente sugerida y tipo con propuestaDesdeMedidor, y nunca escribe valor actual ni punto de partida", () => {
    const h = leer("lib/jobs/handlers/indicadores.ts");
    expect(h).toContain("propuestaDesdeMedidor(");
    expect(h).toContain("tipo_indicador: completado.tipo_indicador");
    expect(h).not.toMatch(/valor_actual\s*:/);
    expect(h).not.toMatch(/linea_base_valor\s*:/);
  });

  // ADAPTADA EN EL REMATE K: la regla se mudó de la ruta a `_registro.ts` (el único camino, que también usa
  // la ruta vieja). Se afirma lo mismo, donde ahora vive.
  it("la ruta de valores fuerza «declarado» para la empresa y usa registrarValor (sin cero por defecto)", () => {
    const r = leer("app/api/companies/[id]/kpis/[kid]/valor/route.ts");
    expect(r).toContain("guardarValor(");
    expect(r).toMatch(/\.nullable\(\)/);
    const camino = leer("app/api/companies/[id]/kpis/_registro.ts");
    expect(camino).toContain("registrarValor(");
    expect(camino).toContain('estado_validacion = "declarado"');
    expect(camino).toContain("plan.sin_dato");
  });

  it("crear y redefinir indicadores es de la consultora; la empresa solo adopta o archiva", () => {
    const crear = leer("app/api/companies/[id]/kpis/route.ts");
    expect(crear).toMatch(/perfil\.rol !== "consultor"[\s\S]*AccesoDenegado/);
    const editar = leer("app/api/companies/[id]/kpis/[kid]/route.ts");
    expect(editar).toMatch(/clavesPedidas\.some\(\(k\) => k !== "estado"\)/);
  });

  it("el esquema de atributos no admite valor_actual: ese solo entra por /valor", () => {
    const comun = leer("app/api/companies/[id]/kpis/_comun.ts");
    expect(comun).not.toMatch(/valor_actual\s*:/);
  });

  it("la pantalla del cliente no dice KPI ni baseline", () => {
    const cliente = leer("components/kpis/TusIndicadores.tsx") + leer("app/(cliente)/portal/kpis/page.tsx");
    const visible = cliente.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/import[^;]+;/g, "");
    expect(visible).not.toMatch(/\bKPI\b/);
    expect(visible).not.toMatch(/baseline/i);
    expect(visible).toContain("Punto de partida");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REMATE K · UN SOLO CAMINO PARA REGISTRAR UN VALOR, Y NADA SIN MOTIVO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const FUENTES = path.resolve(__dirname, "../src");
const leerFuente = (ruta: string) => readFileSync(path.join(FUENTES, ruta), "utf8");

// El último día de setiembre de 2026 en Lima (UTC−5). De 19:00 a 24:00 de Lima ya es 1 de octubre en UTC.
const LIMA_18_59 = new Date("2026-09-30T23:59:59Z"); // 30-09 18:59:59 en Lima: mismo día en los dos relojes
const LIMA_19_00 = new Date("2026-10-01T00:00:00Z"); // 30-09 19:00:00 en Lima
const LIMA_21_30 = new Date("2026-10-01T02:30:00Z"); // 30-09 21:30:00 en Lima
const LIMA_23_59 = new Date("2026-10-01T04:59:59Z"); // 30-09 23:59:59 en Lima
const LIMA_00_00 = new Date("2026-10-01T05:00:00Z"); // 01-10 00:00:00 en Lima

describe("(a) un «sin dato» de un periodo anterior no degrada el valor actual", () => {
  const k = completo({ valor_actual: 30, valor_actual_periodo: "2026-09", estado_validacion: "conciliado" });

  it("sin dato en julio, con el valor actual de setiembre conciliado: no inserta nada y NO toca el indicador", () => {
    const r = registrarValor(k, { periodo: "2026-07", valor: null }, HOY);
    if (!r.ok || !r.sin_dato) throw new Error("debió anotarse como sin dato");
    expect(r.insertar).toBeNull();
    expect(r.actualizar).toEqual({});
    expect(r.es_periodo_anterior).toBe(true);
    expect(r.texto).toBe("Se anotó sin dato en Julio 2026; el valor actual sigue siendo el de Setiembre 2026.");
  });

  it("sin dato en el MISMO periodo del valor actual, o en uno posterior: sí se refleja, y el valor no se toca", () => {
    const mismo = registrarValor(k, { periodo: "2026-09", valor: null }, HOY);
    if (!mismo.ok || !mismo.sin_dato) throw new Error("debió anotarse como sin dato");
    expect(mismo.actualizar).toEqual({ estado_validacion: "sin_dato" });
    expect(mismo.es_periodo_anterior).toBe(false);
    // Ese periodo YA tenía un valor: el texto lo dice con sus palabras, y dice que el número no se borra.
    expect(mismo.texto).toBe("Se anotó sin dato en Setiembre 2026. Ese periodo ya tenía un valor: no se borra, sigue en la historia.");
    expect(mismo.insertar).toBeNull();

    const deAgosto = completo({ valor_actual: 30, valor_actual_periodo: "2026-08", estado_validacion: "conciliado" });
    const posterior = registrarValor(deAgosto, { periodo: "2026-09", valor: null }, HOY);
    if (!posterior.ok || !posterior.sin_dato) throw new Error("debió anotarse como sin dato");
    expect(posterior.actualizar).toEqual({ estado_validacion: "sin_dato" });
    expect(posterior.es_periodo_anterior).toBe(false);
    expect(posterior.texto).toBe("sin dato en Setiembre 2026");
    expect("valor_actual" in posterior.actualizar).toBe(false);
  });

  it("un indicador que nunca tuvo valor: el primer «sin dato» se refleja (no hay nada que degradar)", () => {
    const nuevo = completo({ valor_actual: null, valor_actual_periodo: null, valor_actual_at: null, estado_validacion: null });
    const r = registrarValor(nuevo, { periodo: "2026-07", valor: null }, HOY);
    if (!r.ok || !r.sin_dato) throw new Error("debió anotarse como sin dato");
    expect(r.actualizar).toEqual({ estado_validacion: "sin_dato" });
    expect(r.es_periodo_anterior).toBe(false);
  });

  it("semanal: la semana 9 es anterior a la 10 y la 11 es posterior", () => {
    const semanal = completo({ frecuencia: "semanal", valor_actual: 4, valor_actual_periodo: "2026-S10", estado_validacion: "verificado" });
    const antes = registrarValor(semanal, { periodo: "2026-S09", valor: null }, HOY);
    const despues = registrarValor(semanal, { periodo: "2026-S11", valor: null }, HOY);
    if (!antes.ok || !antes.sin_dato || !despues.ok || !despues.sin_dato) throw new Error("debieron anotarse como sin dato");
    expect(antes.actualizar).toEqual({});
    expect(despues.actualizar).toEqual({ estado_validacion: "sin_dato" });
  });

  it("junto al valor, «sin_dato» no califica al número que se ve; y solo dice «de este mismo periodo» cuando se puede asegurar", () => {
    const conHueco = { estado_validacion: "sin_dato" as const, valor_actual: 30, valor_actual_periodo: "2026-09", frecuencia: "mensual" as const };
    // Sin reloj no se sabe de qué periodo fue el hueco: se dice lo que es cierto en los dos casos.
    expect(textoValidacion(conHueco)).toBe("lo último que se anotó fue «sin dato»");
    expect(textoValidacion({ estado_validacion: "sin_dato", valor_actual: 30 })).toBe(TEXTO_SIN_DATO_DESPUES);
    // NEGATIVO · lo que decía antes era falso cuando el hueco era del mismo periodo: no vuelve.
    expect(TEXTO_SIN_DATO_DESPUES).not.toMatch(/después se anotó un periodo/);
    // 13 de octubre: setiembre es el último mes que cerró. Octubre todavía no se puede anotar: el hueco es de setiembre.
    expect(textoValidacion(conHueco, { zona: "America/Lima", hoy: HOY })).toBe("de este mismo periodo se anotó después «sin dato»");
    expect(textoValidacion(conHueco, { zona: "America/Lima", hoy: HOY })).toBe(TEXTO_SIN_DATO_MISMO_PERIODO);
    // NEGATIVO · en noviembre ya cerró octubre: el hueco pudo ser de setiembre o de octubre. No se afirma ninguna de las dos.
    expect(textoValidacion(conHueco, { zona: "America/Lima", hoy: new Date("2026-11-13T12:00:00Z") })).toBe(TEXTO_SIN_DATO_DESPUES);
    // NEGATIVO · el valor es de agosto y ya cerró setiembre: tampoco.
    expect(textoValidacion({ ...conHueco, valor_actual_periodo: "2026-08" }, { zona: "America/Lima", hoy: HOY })).toBe(TEXTO_SIN_DATO_DESPUES);
    // El borde: 30 de setiembre, 21:30 en Lima. Para Lima el último mes cerrado es agosto; para una empresa en UTC ya es setiembre.
    expect(textoValidacion({ ...conHueco, valor_actual_periodo: "2026-08" }, { zona: "America/Lima", hoy: LIMA_21_30 })).toBe(TEXTO_SIN_DATO_MISMO_PERIODO);
    expect(textoValidacion({ ...conHueco, valor_actual_periodo: "2026-08" }, { zona: "UTC", hoy: LIMA_21_30 })).toBe(TEXTO_SIN_DATO_DESPUES);
    // Una zona inventada se lee como Lima, nunca como UTC.
    expect(textoValidacion({ ...conHueco, valor_actual_periodo: "2026-08" }, { zona: "No/Existe", hoy: LIMA_21_30 })).toBe(TEXTO_SIN_DATO_MISMO_PERIODO);
    // Un valor mensual en un indicador que ahora es semanal: su periodo no es «la última semana cerrada».
    expect(textoValidacion({ ...conHueco, frecuencia: "semanal" }, { zona: "America/Lima", hoy: HOY })).toBe(TEXTO_SIN_DATO_DESPUES);
    // La alerta de dato viejo dice lo mismo, sin afirmar que «el último periodo» quedó sin dato cuando hay un valor a la vista.
    const viejoConHueco = alertas(completo({ valor_actual_at: hace(45), estado_validacion: "sin_dato" }), HOY).find((a) => a.tipo === "desactualizado");
    expect(viejoConHueco?.texto).toBe("El último valor tiene 45 días; para un indicador cada mes se admite hasta 40. Lo último que se anotó fue «sin dato».");
    // Lo demás no cambia.
    expect(textoValidacion({ estado_validacion: "sin_dato", valor_actual: null })).toBe("sin dato");
    expect(textoValidacion({ estado_validacion: "conciliado", valor_actual: 30 })).toBe("conciliado con los documentos");
    expect(textoValidacion({ estado_validacion: "conciliado", valor_actual: 30, valor_actual_periodo: "2026-09", frecuencia: "mensual" }, { zona: "America/Lima", hoy: HOY })).toBe("conciliado con los documentos");
    expect(textoValidacion({ estado_validacion: null, valor_actual: 30 })).toBe("sin rotular");
  });

  it("terminaAntes ordena por el calendario, dentro de una clase de periodo y entre clases", () => {
    expect(terminaAntes("2026-07", "2026-09")).toBe(true);
    expect(terminaAntes("2026-09", "2026-09")).toBe(false);
    expect(terminaAntes("2026-10", "2026-09")).toBe(false);
    expect(terminaAntes("2026-S09", "2026-S10")).toBe(true);
    expect(terminaAntes("2025-12-31", "2026-S01")).toBe(true); // la semana 1 de 2026 termina el 4 de enero
    // Entre clases: letra a letra «2026-S30» va DESPUÉS de «2026-09», y es una semana de julio.
    expect("2026-S30" > "2026-09").toBe(true);
    expect(terminaAntes("2026-S30", "2026-09")).toBe(true);
    expect(terminaAntes("2026-S39", "2026-09")).toBe(true); // termina el domingo 27 de setiembre
    expect(terminaAntes("2026-S40", "2026-09")).toBe(false); // termina el domingo 4 de octubre
    expect(terminaAntes("2026-09-Q1", "2026-09")).toBe(true);
    expect(terminaAntes("2026-09-Q2", "2026-09")).toBe(false); // terminan el mismo día: no es anterior
    expect(terminaAntes("2026-T2", "2026-09")).toBe(true);
    // Sin forma conocida no hay orden que dar.
    for (const [a, b] of [["2026-07", "actual"], ["2026-07", null], ["2026-07", ""], ["hoy", "2026-09"], [null, "2026-09"], [undefined, undefined]] as const) {
      expect(terminaAntes(a, b)).toBe(false);
    }
  });

  it("cambio de frecuencia · un hueco de otra clase de periodo no degrada, sea antiguo o reciente", () => {
    // Era mensual (setiembre, conciliado) y ahora se anota por semana.
    const ahoraSemanal = completo({ frecuencia: "semanal", valor_actual: 30, valor_actual_periodo: "2026-09", estado_validacion: "conciliado" });
    // La semana 30 es de julio. Antes del arreglo se comparaba letra a letra, salía «posterior» y degradaba.
    const antiguo = registrarValor(ahoraSemanal, { periodo: "2026-S30", valor: null }, HOY);
    if (!antiguo.ok || !antiguo.sin_dato) throw new Error("debió anotarse como sin dato");
    expect(antiguo.actualizar).toEqual({});
    expect(antiguo.es_periodo_anterior).toBe(true);
    expect(antiguo.texto).toBe("Se anotó sin dato en Semana 30 de 2026; el valor actual sigue siendo el de Setiembre 2026.");
    // La semana 40 termina el 4 de octubre, después de setiembre: no es anterior, pero una semana sin dato no desmiente un mes comprobado.
    const reciente = registrarValor(ahoraSemanal, { periodo: "2026-S40", valor: null }, HOY);
    if (!reciente.ok || !reciente.sin_dato) throw new Error("debió anotarse como sin dato");
    expect(reciente.actualizar).toEqual({});
    expect(reciente.es_periodo_anterior).toBe(false);
    expect(reciente.texto).toBe("Se anotó sin dato en Semana 40 de 2026; el valor actual sigue siendo el de Setiembre 2026.");
  });

  it("cambio de frecuencia · un VALOR sí pasa a ser el actual cuando su periodo termina después; si termina antes, solo completa la historia", () => {
    const ahoraSemanal = completo({ frecuencia: "semanal", valor_actual: 30, valor_actual_periodo: "2026-09", estado_validacion: "conciliado" });
    const deJulio = registrarValor(ahoraSemanal, { periodo: "2026-S30", valor: 7 }, HOY);
    if (!deJulio.ok || deJulio.sin_dato) throw new Error("debió guardarse");
    expect(deJulio.actualizar).toEqual({});
    expect(deJulio.es_periodo_anterior).toBe(true);
    expect(deJulio.insertar).toMatchObject({ periodo: "2026-S30", valor: 7 });
    // Con la frecuencia nueva el indicador vuelve a moverse: si no, se quedaría para siempre en el último mes.
    const deOctubre = registrarValor(ahoraSemanal, { periodo: "2026-S40", valor: 7 }, HOY);
    if (!deOctubre.ok || deOctubre.sin_dato) throw new Error("debió guardarse");
    expect(deOctubre.actualizar).toEqual({ valor_actual: 7, valor_actual_periodo: "2026-S40", valor_actual_at: HOY.toISOString(), estado_validacion: "declarado" });
    expect(deOctubre.es_periodo_anterior).toBe(false);
    // Desde ahí los huecos vuelven a compararse dentro de la misma clase.
    const yaSemanal = completo({ frecuencia: "semanal", valor_actual: 7, valor_actual_periodo: "2026-S40", estado_validacion: "declarado" });
    const anterior = registrarValor(yaSemanal, { periodo: "2026-S39", valor: null }, HOY);
    const mismo = registrarValor(yaSemanal, { periodo: "2026-S40", valor: null }, HOY);
    if (!anterior.ok || !anterior.sin_dato || !mismo.ok || !mismo.sin_dato) throw new Error("debieron anotarse como sin dato");
    expect(anterior.actualizar).toEqual({});
    expect(mismo.actualizar).toEqual({ estado_validacion: "sin_dato" });
    expect(mismo.texto).toBe("Se anotó sin dato en Semana 40 de 2026. Ese periodo ya tenía un valor: no se borra, sigue en la historia.");
  });

  it("un valor actual con un periodo sin forma conocida no se puede ordenar: el hueco se refleja y el valor nuevo pasa a ser el actual", () => {
    const raro = completo({ valor_actual: 30, valor_actual_periodo: "actual", estado_validacion: "declarado" });
    const hueco = registrarValor(raro, { periodo: "2026-07", valor: null }, HOY);
    if (!hueco.ok || !hueco.sin_dato) throw new Error("debió anotarse como sin dato");
    expect(hueco.actualizar).toEqual({ estado_validacion: "sin_dato" });
    expect(hueco.texto).toBe("sin dato en Julio 2026");
    const valor = registrarValor(raro, { periodo: "2026-07", valor: 5 }, HOY);
    if (!valor.ok || valor.sin_dato) throw new Error("debió guardarse");
    expect(valor.actualizar).toMatchObject({ valor_actual: 5, valor_actual_periodo: "2026-07" });
  });
});

describe("(d) un periodo cierra en el reloj de la empresa, no en UTC", () => {
  const sinValor = completo({ valor_actual: null, valor_actual_periodo: null, valor_actual_at: null, estado_validacion: null });

  it("el día que vive la empresa: a las 19:00 de Lima del 30 de setiembre sigue siendo 30, aunque en UTC ya sea 1", () => {
    expect(diaEnZona(LIMA_19_00, "America/Lima")).toBe("2026-09-30");
    expect(diaEnZona(LIMA_23_59, "America/Lima")).toBe("2026-09-30");
    expect(diaEnZona(LIMA_00_00, "America/Lima")).toBe("2026-10-01");
    expect(diaEnZona(LIMA_19_00, "UTC")).toBe("2026-10-01");
    expect(diaEnZona(LIMA_19_00)).toBe("2026-09-30"); // sin decir zona: Lima
  });

  it("cuándo termina cada clase de periodo en Lima: a las 05:00 UTC del día siguiente, no a las 00:00", () => {
    expect(finDePeriodo("2026-09", "America/Lima")?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(finDePeriodo("2026-09-30", "America/Lima")?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(finDePeriodo("2026-09-Q1", "America/Lima")?.toISOString()).toBe("2026-09-16T05:00:00.000Z");
    expect(finDePeriodo("2026-09-Q2", "America/Lima")?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(finDePeriodo("2026-T3", "America/Lima")?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    // La semana 40 de 2026 va del lunes 28 de setiembre al domingo 4 de octubre.
    expect(finDePeriodo("2026-S40", "America/Lima")?.toISOString()).toBe("2026-10-05T05:00:00.000Z");
    expect(finDePeriodo("actual", "America/Lima")).toBeNull();
    // En UTC, y sin zona (día de calendario, como lo pide la revisión semanal), a medianoche UTC.
    expect(finDePeriodo("2026-09", "UTC")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(finDePeriodo("2026-09")?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("mensual · de 19:00 a 24:00 de Lima del último día el mes cerrado sigue siendo agosto; a las 00:00 ya es setiembre", () => {
    for (const t of [LIMA_19_00, LIMA_21_30, LIMA_23_59]) {
      expect(periodoCerradoMasReciente("mensual", t, "America/Lima")).toBe("2026-08");
      // Lo que se respondía antes del remate, leyendo el reloj en UTC: setiembre, que en Lima no había terminado.
      expect(periodoCerradoMasReciente("mensual", t, "UTC")).toBe("2026-09");
    }
    expect(periodoCerradoMasReciente("mensual", LIMA_00_00, "America/Lima")).toBe("2026-09");
    // Un segundo antes de las 19:00 los dos relojes coinciden: no es un borde.
    expect(periodoCerradoMasReciente("mensual", LIMA_18_59, "America/Lima")).toBe("2026-08");
    expect(periodoCerradoMasReciente("mensual", LIMA_18_59, "UTC")).toBe("2026-08");
    expect(periodosRecientes("mensual", 3, LIMA_21_30, "America/Lima")).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(periodosRecientes("mensual", 3, LIMA_00_00, "America/Lima")).toEqual(["2026-09", "2026-08", "2026-07"]);
  });

  it("las demás frecuencias, en la misma franja", () => {
    expect(periodoCerradoMasReciente("diaria", LIMA_21_30, "America/Lima")).toBe("2026-09-29");
    expect(periodoCerradoMasReciente("diaria", LIMA_21_30, "UTC")).toBe("2026-09-30");
    expect(periodoCerradoMasReciente("quincenal", LIMA_21_30, "America/Lima")).toBe("2026-09-Q1");
    expect(periodoCerradoMasReciente("quincenal", LIMA_21_30, "UTC")).toBe("2026-09-Q2");
    expect(periodoCerradoMasReciente("trimestral", LIMA_21_30, "America/Lima")).toBe("2026-T2");
    expect(periodoCerradoMasReciente("trimestral", LIMA_21_30, "UTC")).toBe("2026-T3");
    // La semana cierra el domingo a las 24:00 de Lima: el domingo 4 de octubre a las 21:00 de Lima la 40 sigue abierta.
    const domingo21 = new Date("2026-10-05T02:00:00Z");
    expect(periodoCerradoMasReciente("semanal", domingo21, "America/Lima")).toBe("2026-S39");
    expect(periodoCerradoMasReciente("semanal", domingo21, "UTC")).toBe("2026-S40");
    expect(periodoCerradoMasReciente("semanal", new Date("2026-10-05T05:00:00Z"), "America/Lima")).toBe("2026-S40");
  });

  it("registrarValor · a las 21:30 de Lima del 30 de setiembre, setiembre no se anota (ni como sin dato); a las 00:00, sí", () => {
    const antes = registrarValor(sinValor, { periodo: "2026-09", valor: 3 }, LIMA_21_30, "America/Lima");
    expect(antes.ok).toBe(false);
    if (!antes.ok) expect(antes.motivo).toBe("Setiembre 2026 todavía no terminó: se registra cuando cierre.");
    expect(registrarValor(sinValor, { periodo: "2026-09", valor: 3 }, LIMA_19_00, "America/Lima").ok).toBe(false);
    expect(registrarValor(sinValor, { periodo: "2026-09", valor: null }, LIMA_23_59, "America/Lima").ok).toBe(false);
    expect(registrarValor(sinValor, { periodo: "2026-09", valor: 3 }, LIMA_00_00, "America/Lima").ok).toBe(true);
    // Sin decir zona, la regla usa la de Lima: nunca UTC por descuido.
    expect(registrarValor(sinValor, { periodo: "2026-09", valor: 3 }, LIMA_21_30).ok).toBe(false);
    // Una empresa cuyo reloj es UTC sí lo tiene cerrado a esa misma hora.
    expect(registrarValor(sinValor, { periodo: "2026-09", valor: 3 }, LIMA_21_30, "UTC").ok).toBe(true);
    // Agosto cerró hace un mes: entra en cualquier reloj.
    expect(registrarValor(sinValor, { periodo: "2026-08", valor: 3 }, LIMA_21_30, "America/Lima").ok).toBe(true);
  });

  it("zonaDe · la de la empresa si existe; vacía, nula o inventada cae a America/Lima, nunca a UTC", () => {
    expect(ZONA_POR_DEFECTO).toBe("America/Lima");
    expect(zonaDe("America/Bogota")).toBe("America/Bogota");
    expect(zonaDe("  America/Santiago ")).toBe("America/Santiago");
    for (const v of [null, undefined, "", "   ", "No/Existe", 5, {}]) expect(zonaDe(v)).toBe("America/Lima");
    // Una zona inventada que llegue hasta la regla se lee como Lima.
    expect(registrarValor(sinValor, { periodo: "2026-09", valor: 3 }, LIMA_21_30, "No/Existe").ok).toBe(false);
    expect(finDePeriodo("2026-09", zonaDe("No/Existe"))?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });

  it("otras zonas · Buenos Aires (UTC−3) y Madrid, con su cambio de hora", () => {
    expect(finDePeriodo("2026-09", "America/Argentina/Buenos_Aires")?.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(finDePeriodo("2026-02", "Europe/Madrid")?.toISOString()).toBe("2026-02-28T23:00:00.000Z"); // invierno, UTC+1
    expect(finDePeriodo("2026-03", "Europe/Madrid")?.toISOString()).toBe("2026-03-31T22:00:00.000Z"); // verano, UTC+2
    expect(periodoCerradoMasReciente("mensual", new Date("2026-03-31T21:30:00Z"), "Europe/Madrid")).toBe("2026-02");
    expect(periodoCerradoMasReciente("mensual", new Date("2026-03-31T22:30:00Z"), "Europe/Madrid")).toBe("2026-03");
  });

  it("Santiago · el día que no tiene medianoche y el día que repite una hora", () => {
    // El domingo 6 de setiembre de 2026 el reloj salta de las 24:00 del sábado a la 01:00: el día empieza a las 04:00 UTC.
    expect(finDePeriodo("2026-09-05", "America/Santiago")?.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    // El domingo 5 de abril de 2026 se repite la hora de 23:00 a 24:00 del sábado: el día empieza a las 04:00 UTC, no a las 03:00.
    expect(finDePeriodo("2026-04-04", "America/Santiago")?.toISOString()).toBe("2026-04-05T04:00:00.000Z");
  });

  it("lectura del código · quien pregunta «qué periodo cerró» pasa la zona de la empresa", () => {
    expect(leerFuente("components/kpis/TusIndicadores.tsx")).toContain("periodoCerradoMasReciente(i.frecuencia, undefined, zona)");
    expect(leerFuente("components/kpis/RegistrarValor.tsx")).toContain("periodosRecientes(kpi.frecuencia, 6, undefined, zona)");
    // Ninguna pantalla de indicadores pregunta por el periodo cerrado sin decir en qué reloj.
    let llamadas = 0;
    for (const archivo of ["TusIndicadores.tsx", "RegistrarValor.tsx", "FormularioKpi.tsx", "TableroKpis.tsx"]) {
      for (const m of leerFuente(`components/kpis/${archivo}`).matchAll(/(?:periodoCerradoMasReciente|periodosRecientes)\(([^)]*)\)/g)) {
        llamadas += 1;
        expect(m[1], `${archivo}: ${m[0]}`).toMatch(/, zona$/);
      }
    }
    expect(llamadas).toBe(3);
    expect(leerFuente("app/api/companies/[id]/kpis/_registro.ts")).toMatch(/registrarValor\(kpi, [^;]*, hoy, zonaDe\(opciones\.zona\)\)/);
    // El bloque viejo de «Tus números» ya no usa el mes que le calcula la página con el reloj del servidor.
    const bloque = leerFuente("components/cliente/Indicadores.tsx");
    expect(bloque).toContain('const periodoActual = periodoCerradoMasReciente("mensual", undefined, zonaDe(zona));');
    expect(bloque).not.toContain("mesCerradoMasReciente");
    expect(bloque).toMatch(/periodoActual\?: string;/); // se sigue aceptando, pero ya no decide
    // Y la etiqueta junto al valor pregunta con el reloj de la empresa.
    expect(leerFuente("components/kpis/TusIndicadores.tsx")).toContain("textoValidacion(i, { zona })");
    expect(leerFuente("components/kpis/TableroKpis.tsx")).toContain("textoValidacion(k, { zona: ctx.zona })");
    expect(leerFuente("app/api/companies/[id]/kpis/[kid]/valor/route.ts")).toContain("zonaDeEmpresa(sb, id)");
    expect(leerFuente("app/api/companies/[id]/indicadores/route.ts")).toContain("zonaDeEmpresa(sb, id)");
    for (const pagina of ["app/(cliente)/portal/kpis/page.tsx", "app/(consultor)/empresa/[id]/kpis/page.tsx"]) {
      const src = leerFuente(pagina);
      expect(src).toContain('select("zona_horaria")');
      expect(src).toContain("zona={zona}");
    }
    // La zona se lee con Intl y timeZone, sin importar formato.ts (es de otra tanda).
    const lib = leerFuente("lib/kpis.ts");
    expect(lib).toMatch(/new Intl\.DateTimeFormat\([^)]*timeZone: zona/);
    expect(lib).not.toMatch(/from "\.\/formato"/);
  });
});

// ─── Lo que sigue toca la base (un doble en memoria) ─────────────────────────────────────────────

const EMP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // en America/Lima
const EMP_UTC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // en UTC
const IND = "10000000-0000-4000-8000-000000000001"; // mensual, activo, sin valor todavía
const IND_SEM = "10000000-0000-4000-8000-000000000002"; // semanal, activo
const IND_PROP = "10000000-0000-4000-8000-000000000003"; // mensual, propuesto
const IND_UTC = "10000000-0000-4000-8000-000000000004"; // mensual, activo, de la empresa en UTC
const DUENO: Perfil = { id: "11111111-1111-4111-8111-111111111111", email: "dueno@ejemplo.test", nombre: "Dueño", rol: "cliente" };
const CONSULTORA: Perfil = { id: "22222222-2222-4222-8222-222222222222", email: "consultora@ejemplo.test", nombre: "Consultora", rol: "consultor" };

const sb = () => supabaseAdmin() as unknown as SupabaseClient;
const filaIndicador = (sobre: Fila = {}): Fila => ({
  ...completo({ id: IND, company_id: EMP, valor_actual: null, valor_actual_periodo: null, valor_actual_at: null, estado_validacion: null }),
  ...sobre,
});
const indicador = (id = IND): Fila => base.tablas.indicadores!.find((f) => f.id === id)!;
const kpiDe = (id = IND) => desdeFila(indicador(id));
const escriturasEn = (tabla: string) => base.escrituras.filter((e) => e.tabla === tabla);

function sembrar() {
  base.tablas = {
    companies: [{ id: EMP, zona_horaria: "America/Lima" }, { id: EMP_UTC, zona_horaria: "UTC" }],
    memberships: [{ user_id: DUENO.id, company_id: EMP }, { user_id: DUENO.id, company_id: EMP_UTC }],
    indicadores: [
      filaIndicador(),
      filaIndicador({ id: IND_SEM, clave: "visitas_semana", nombre: "Visitas a clientes", frecuencia: "semanal", linea_base_valor: null, linea_base_periodo: null }),
      filaIndicador({ id: IND_PROP, clave: "quejas_mes", nombre: "Quejas al mes", estado: "propuesto" }),
      filaIndicador({ id: IND_UTC, company_id: EMP_UTC, clave: "pedidos_mes", nombre: "Pedidos al mes" }),
    ],
    indicador_valores: [],
    company_metricas: [],
    audit_log: [],
  };
  base.escrituras = [];
  base.fallar = {};
  base.seq = 0;
}

/** Un indicador tal como lo recibe el bloque viejo de «Tus números». */
const indicadorViejo = (sobre: Partial<Indicador> = {}): Indicador => ({
  id: IND, clave: "devoluciones_mes", nombre: "Devoluciones al mes", como_se_mide: "Contar las prendas devueltas", unidad: "unidades",
  mejor_si: "baja", meta_valor: null, meta_texto: null, frecuencia: "mensual", origen_texto: null, estado: "activo", ...sobre,
});
/** El bloque viejo pintado en el servidor. `periodoActual` es lo que todavía le pasa la página (reloj del servidor). */
const bloqueViejo = (props: { indicadores: Indicador[]; zona?: string | null; periodoActual?: string; valores?: ValorIndicador[] }) =>
  renderToStaticMarkup(createElement(Indicadores, { companyId: EMP, valores: [], ...props })).replace(/<!-- -->/g, "");
/** Una fila de los números de la empresa (`company_metricas`) para el mismo indicador y mes. */
const numeroDeEmpresa = (sobre: Fila = {}): Fila => ({ id: "cm-1", company_id: EMP, clave: "devoluciones_mes", periodo: "2026-09", valor: 20, estado: "verificado", ...sobre });

describe("(c) un solo camino para escribir un valor: guardarValor (con dobles)", () => {
  beforeEach(sembrar);

  it("la empresa anota un número: fila declarada en la historia, valor actual movido y el reflejo en los números de la empresa", async () => {
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY, zona: "America/Lima" });
    expect(r).toMatchObject({ ok: true, sin_dato: false, periodo: "2026-09", valor: 12, estado_validacion: "declarado", corregido: false, antes: null, es_periodo_anterior: false, espejo: "reflejado", aviso: null, pendiente: null });
    expect(base.tablas.indicador_valores).toEqual([
      { id: expect.any(String), indicador_id: IND, periodo: "2026-09", valor: 12, fuente: "Cuaderno de caja", estado_validacion: "declarado", nota: null, registrado_por: DUENO.id },
    ]);
    expect(indicador()).toMatchObject({ valor_actual: 12, valor_actual_periodo: "2026-09", valor_actual_at: HOY.toISOString(), estado_validacion: "declarado" });
    expect(base.tablas.company_metricas).toEqual([
      { id: expect.any(String), company_id: EMP, clave: "devoluciones_mes", periodo: "2026-09", valor: 12, estado: "contado", updated_at: HOY.toISOString() },
    ]);
  });

  it("NEGATIVO · lo que no es mensual queda en la historia y en el indicador, y NO en los números de la empresa: esa tabla guarda meses", async () => {
    const r = await guardarValor(sb(), kpiDe(IND_SEM), { periodo: "2026-S40", valor: 4 }, DUENO, { hoy: HOY, zona: "America/Lima" });
    expect(r).toMatchObject({ ok: true, sin_dato: false, valor: 4, estado_validacion: "declarado", espejo: "no_aplica", aviso: null, pendiente: null });
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(indicador(IND_SEM)).toMatchObject({ valor_actual: 4, valor_actual_periodo: "2026-S40" });
    expect(base.tablas.company_metricas).toEqual([]);
    expect(escriturasEn("company_metricas")).toEqual([]);
  });

  it("el reflejo no depende de quién registra ni de por dónde: lo que la consultora da por verificado queda «contado» en los números (no asciende solo)", async () => {
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12, estado_validacion: "verificado", fuente: "Libro de devoluciones" }, CONSULTORA, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, estado_validacion: "verificado", espejo: "reflejado" });
    expect(base.tablas.indicador_valores![0]).toMatchObject({ valor: 12, estado_validacion: "verificado" });
    expect(base.tablas.company_metricas).toEqual([expect.objectContaining({ clave: "devoluciones_mes", periodo: "2026-09", valor: 12, estado: "contado" })]);
  });

  it("NEGATIVO · el reflejo no pisa lo que salió de un documento: verificado, extraído o descartado quedan intactos, y se avisa", async () => {
    for (const estado of ["verificado", "extraido", "descartado"]) {
      sembrar();
      base.tablas.company_metricas = [numeroDeEmpresa({ estado })];
      const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
      if (!r.ok || r.sin_dato) throw new Error("debió guardarse");
      expect(r).toMatchObject({ valor: 12, espejo: "intacto", pendiente: null });
      expect(r.aviso).toContain("En «Tus números», Setiembre 2026 ya tiene un dato que no se reemplaza desde aquí (");
      expect(r.aviso).toContain("Lo que registraste quedó en la historia del indicador.");
      // El valor entró en la historia y en el indicador; el número de la empresa no se tocó.
      expect(base.tablas.indicador_valores).toHaveLength(1);
      expect(indicador().valor_actual).toBe(12);
      expect(base.tablas.company_metricas).toHaveLength(1);
      expect(base.tablas.company_metricas![0]).toMatchObject(numeroDeEmpresa({ estado }));
      if (estado !== "extraido") {
        expect(base.tablas.company_metricas).toEqual([numeroDeEmpresa({ estado })]);
        expect(escriturasEn("company_metricas")).toEqual([]);
        expect(r.aviso).not.toContain(TEXTO_AL_LADO.trim());
        continue;
      }
      // UNA CIFRA EXTRAÍDA SIN REVISAR (cierre Z1, src/app/api/companies/[id]/kpis/_registro.ts): el número del
      // documento tampoco se reemplaza, pero lo registrado se guarda AL LADO, como lo declarado, para que se puedan
      // comparar las dos. Es la única escritura, y toca solo esa columna: ni el valor, ni el estado.
      expect(r).toMatchObject({ declarado_al_lado: true });
      expect(r.aviso).toContain(TEXTO_AL_LADO.trim());
      expect(base.tablas.company_metricas![0]).toMatchObject({ valor: 20, estado: "extraido", cifra_desplazada: { lado: "declarado", valor: 12 } });
      expect(escriturasEn("company_metricas")).toHaveLength(1);
      expect(Object.keys(escriturasEn("company_metricas")[0]!.datos).filter((k) => !k.startsWith("_"))).toEqual(["cifra_desplazada"]);
    }
    sembrar();
    base.tablas.company_metricas = [numeroDeEmpresa()];
    const verificado = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, CONSULTORA, { hoy: HOY });
    if (!verificado.ok || verificado.sin_dato) throw new Error("debió guardarse");
    // Tampoco la consultora lo pisa desde un indicador: conciliar un número es otro camino, con el documento delante.
    expect(verificado.aviso).toBe("En «Tus números», Setiembre 2026 ya tiene un dato que no se reemplaza desde aquí (verificado). Lo que registraste quedó en la historia del indicador.");
    expect(base.tablas.company_metricas).toEqual([numeroDeEmpresa()]);
  });

  it("POSITIVO · lo contado de memoria, un «no lo sé» o una fila sin rotular sí se reemplazan, y quedan «contado»", async () => {
    for (const previa of [{ estado: "contado", valor: 20 }, { estado: "sin_dato", valor: null }, { estado: null, valor: 20 }]) {
      sembrar();
      base.tablas.company_metricas = [numeroDeEmpresa(previa)];
      const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
      expect(r).toMatchObject({ ok: true, sin_dato: false, espejo: "reflejado", aviso: null });
      expect(base.tablas.company_metricas).toEqual([expect.objectContaining({ id: "cm-1", valor: 12, estado: "contado", updated_at: HOY.toISOString() })]);
    }
  });

  it("dos filas para el mismo mes en los números (esa tabla no tiene restricción única): no falla ni añade una tercera; y si una es verificada, no toca ninguna", async () => {
    base.tablas.company_metricas = [numeroDeEmpresa({ estado: "contado", valor: 5 }), numeroDeEmpresa({ id: "cm-2", estado: "contado", valor: 6 })];
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, espejo: "reflejado", pendiente: null });
    expect(base.tablas.company_metricas).toHaveLength(2);
    expect(base.tablas.company_metricas![0]).toMatchObject({ id: "cm-1", valor: 12, estado: "contado" });

    sembrar();
    base.tablas.company_metricas = [numeroDeEmpresa({ estado: "contado", valor: 5 }), numeroDeEmpresa({ id: "cm-2" })];
    const conVerificada = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
    expect(conVerificada).toMatchObject({ ok: true, sin_dato: false, espejo: "intacto" });
    expect(escriturasEn("company_metricas")).toEqual([]);
  });

  it("NEGATIVO · sin dato: no inserta nada en ninguna tabla, tampoco en los números de la empresa; solo marca el indicador", async () => {
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: null }, DUENO, { hoy: HOY });
    expect(r).toEqual({ ok: true, sin_dato: true, periodo: "2026-09", texto: "sin dato en Setiembre 2026", es_periodo_anterior: false });
    expect(base.tablas.indicador_valores).toEqual([]);
    expect(base.tablas.company_metricas).toEqual([]);
    expect(base.escrituras).toEqual([{ tabla: "indicadores", op: "update", datos: { estado_validacion: "sin_dato" } }]);
    expect(indicador().valor_actual).toBeNull();
  });

  it("NEGATIVO · sin dato de un periodo anterior al del valor actual: no se escribe NADA y el conciliado sigue conciliado", async () => {
    Object.assign(indicador(), { valor_actual: 30, valor_actual_periodo: "2026-09", valor_actual_at: hace(5), estado_validacion: "conciliado" });
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-07", valor: null }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: true, es_periodo_anterior: true });
    expect(base.escrituras).toEqual([]);
    expect(indicador()).toMatchObject({ valor_actual: 30, valor_actual_periodo: "2026-09", estado_validacion: "conciliado" });
  });

  it("un valor de un periodo anterior entra en la historia (y en el espejo) sin mover el valor actual", async () => {
    Object.assign(indicador(), { valor_actual: 30, valor_actual_periodo: "2026-09", valor_actual_at: hace(5), estado_validacion: "conciliado" });
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-07", valor: 41 }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, es_periodo_anterior: true });
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(base.tablas.company_metricas).toHaveLength(1);
    expect(escriturasEn("indicadores")).toEqual([]);
    expect(indicador()).toMatchObject({ valor_actual: 30, estado_validacion: "conciliado" });
  });

  it("NEGATIVO · periodo con la forma equivocada, en curso, o que no cerró en el reloj de la empresa: 400 y nada escrito", async () => {
    const semanal = await guardarValor(sb(), kpiDe(IND_SEM), { periodo: "2026-09", valor: 4 }, DUENO, { hoy: HOY });
    expect(semanal).toMatchObject({ ok: false, status: 400 });
    if (!semanal.ok) expect(semanal.motivo).toMatch(/cada semana/);
    expect(await guardarValor(sb(), kpiDe(), { periodo: "2026-10", valor: 4 }, DUENO, { hoy: HOY })).toMatchObject({ ok: false, status: 400 });
    // 30 de setiembre, 21:30 en Lima.
    expect(await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4 }, DUENO, { hoy: LIMA_21_30, zona: "America/Lima" })).toMatchObject({ ok: false, status: 400 });
    expect(await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4 }, DUENO, { hoy: LIMA_21_30 })).toMatchObject({ ok: false, status: 400 }); // sin zona: Lima
    expect(await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4 }, DUENO, { hoy: LIMA_21_30, zona: "No/Existe" })).toMatchObject({ ok: false, status: 400 });
    expect(base.escrituras).toEqual([]);
    // POSITIVO · la misma petición, a la misma hora, para una empresa cuyo reloj es UTC.
    expect(await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4 }, DUENO, { hoy: LIMA_21_30, zona: "UTC" })).toMatchObject({ ok: true, sin_dato: false });
  });

  it("la empresa no concilia ni verifica: 403 y nada escrito; la consultora sí, con su fuente y su nota", async () => {
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4, estado_validacion: "conciliado" }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(base.escrituras).toEqual([]);
    const c = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4, estado_validacion: "conciliado", fuente: "Excel de ventas", nota: "con Rosa" }, CONSULTORA, { hoy: HOY });
    expect(c).toMatchObject({ ok: true, estado_validacion: "conciliado" });
    expect(base.tablas.indicador_valores![0]).toMatchObject({ estado_validacion: "conciliado", fuente: "Excel de ventas", nota: "con Rosa", registrado_por: CONSULTORA.id });
    expect(indicador().estado_validacion).toBe("conciliado");
  });

  it("un segundo valor del mismo periodo es una corrección: se reemplaza (también en el espejo) y devuelve lo que había", async () => {
    await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 15 }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, corregido: true, antes: { valor: 12 } });
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(base.tablas.indicador_valores![0]!.valor).toBe(15);
    expect(base.tablas.company_metricas).toHaveLength(1);
    expect(base.tablas.company_metricas![0]!.valor).toBe(15);
    expect(indicador().valor_actual).toBe(15);
  });

  it("NEGATIVO · un indicador archivado no recibe números", async () => {
    indicador().estado = "archivado";
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4 }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(base.escrituras).toEqual([]);
  });

  it("NEGATIVO · si la base rechaza la fila, se dice con una frase (el mensaje de la base va aparte) y el indicador no se mueve", async () => {
    base.fallar.indicador_valores = { op: "insert", mensaje: "violates check constraint" };
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4 }, DUENO, { hoy: HOY });
    expect(r).toEqual({ ok: false, status: 500, motivo: TEXTO_NO_SE_GUARDO, tecnico: "indicador_valores.insert (devoluciones_mes/2026-09): violates check constraint" });
    expect(TEXTO_NO_SE_GUARDO).toBe("No pudimos guardarlo y no quedó nada registrado. Inténtalo de nuevo.");
    expect(escriturasEn("indicadores")).toEqual([]);
    expect(base.tablas.company_metricas).toEqual([]);
    expect(indicador().valor_actual).toBeNull();
    // Lo mismo si lo que falla es leer si ya había un valor, o anotar un «sin dato».
    base.fallar = { indicador_valores: { op: "select", mensaje: "timeout" } };
    expect(await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 4 }, DUENO, { hoy: HOY })).toEqual({ ok: false, status: 500, motivo: TEXTO_NO_SE_GUARDO, tecnico: "indicador_valores.select (devoluciones_mes/2026-09): timeout" });
    base.fallar = { indicadores: { op: "update", mensaje: "deadlock detected" } };
    expect(await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: null }, DUENO, { hoy: HOY })).toEqual({ ok: false, status: 500, motivo: TEXTO_NO_SE_GUARDO, tecnico: "indicadores.update, sin dato (devoluciones_mes/2026-09): deadlock detected" });
    expect(base.escrituras).toEqual([]);
  });

  it("NEGATIVO · si el reflejo falla, el valor YA está en la historia: vuelve como pendiente, con una frase para quien registra y el detalle técnico aparte", async () => {
    base.fallar.company_metricas = { op: "insert", mensaje: "relation is locked" };
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({
      ok: true, sin_dato: false, valor: 12, corregido: false, espejo: "pendiente", aviso: null,
      pendiente: { que: "tus_numeros", motivo: TEXTO_PENDIENTE.tus_numeros, tecnico: "company_metricas.insert (devoluciones_mes/2026-09): relation is locked" },
    });
    expect(TEXTO_PENDIENTE.tus_numeros).toBe("El valor quedó guardado en el indicador, pero no llegó a «Tus números». Guárdalo otra vez para que aparezca también ahí.");
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(indicador()).toMatchObject({ valor_actual: 12, valor_actual_periodo: "2026-09" });
    expect(base.tablas.company_metricas).toEqual([]);
    // POSITIVO · guardar otra vez lo completa: es una corrección con el mismo número, sin fila nueva.
    base.fallar = {};
    const otra = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
    expect(otra).toMatchObject({ ok: true, corregido: true, espejo: "reflejado", pendiente: null });
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(base.tablas.company_metricas).toEqual([expect.objectContaining({ periodo: "2026-09", valor: 12, estado: "contado" })]);
  });

  it("NEGATIVO · si no se pueden leer los números de la empresa, no se inserta a ciegas: pendiente", async () => {
    base.fallar.company_metricas = { op: "select", mensaje: "timeout" };
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({ ok: true, sin_dato: false, espejo: "pendiente", pendiente: { que: "tus_numeros", tecnico: "company_metricas.select (devoluciones_mes/2026-09): timeout" } });
    expect(escriturasEn("company_metricas")).toEqual([]);
  });

  it("NEGATIVO · el valor entra en la historia y el indicador no se puede actualizar: pendiente «valor_actual», y el reflejo no se intenta", async () => {
    base.fallar.indicadores = { op: "update", mensaje: "deadlock detected" };
    const r = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
    expect(r).toMatchObject({
      ok: true, sin_dato: false, valor: 12, espejo: "pendiente", aviso: null,
      pendiente: { que: "valor_actual", motivo: TEXTO_PENDIENTE.valor_actual, tecnico: "indicadores.update (devoluciones_mes/2026-09): deadlock detected" },
    });
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(indicador().valor_actual).toBeNull();
    expect(base.tablas.company_metricas).toEqual([]);
    // Ninguna de las frases para quien registra trae el mensaje de la base.
    for (const frase of [TEXTO_NO_SE_GUARDO, TEXTO_PENDIENTE.valor_actual, TEXTO_PENDIENTE.tus_numeros]) expect(frase).not.toMatch(/deadlock|relation|constraint|timeout|select|insert|update/i);
    // POSITIVO · al guardar otra vez queda todo: último valor y reflejo.
    base.fallar = {};
    expect(await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY })).toMatchObject({ ok: true, corregido: true, espejo: "reflejado", pendiente: null });
    expect(indicador()).toMatchObject({ valor_actual: 12, valor_actual_periodo: "2026-09" });
    expect(base.tablas.company_metricas).toHaveLength(1);
  });

  it("rastroDeValor · lo que queda en el rastro dice el reflejo y lo pendiente; un «sin dato» no trae valor", async () => {
    const bien = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 12 }, DUENO, { hoy: HOY });
    if (!bien.ok) throw new Error("debió guardarse");
    expect(rastroDeValor(kpiDe(), bien)).toEqual({
      accion: "crear",
      detalle: { clave: "devoluciones_mes", periodo: "2026-09", valor: 12, estado_validacion: "declarado", antes: null, es_periodo_anterior: false, espejo: "reflejado" },
    });
    base.fallar.company_metricas = { op: "update", mensaje: "relation is locked" };
    const aMedias = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: 15 }, DUENO, { hoy: HOY });
    if (!aMedias.ok) throw new Error("el valor quedó en la historia");
    expect(rastroDeValor(kpiDe(), aMedias)).toMatchObject({ accion: "editar", detalle: { valor: 15, antes: { valor: 12 }, espejo: "pendiente", pendiente: "tus_numeros" } });
    base.fallar = {};
    const hueco = await guardarValor(sb(), kpiDe(), { periodo: "2026-09", valor: null }, DUENO, { hoy: HOY });
    if (!hueco.ok) throw new Error("debió anotarse");
    expect(rastroDeValor(kpiDe(), hueco)).toEqual({
      accion: "editar",
      detalle: { clave: "devoluciones_mes", periodo: "2026-09", sin_dato: true, es_periodo_anterior: false, texto: "Se anotó sin dato en Setiembre 2026. Ese periodo ya tenía un valor: no se borra, sigue en la historia." },
    });
  });

  it("zonaDeEmpresa · la de la empresa; sin fila, vacía, inventada o sin columna → America/Lima", async () => {
    expect(await zonaDeEmpresa(sb(), EMP_UTC)).toBe("UTC");
    expect(await zonaDeEmpresa(sb(), EMP)).toBe("America/Lima");
    base.tablas.companies![0]!.zona_horaria = "America/Bogota";
    expect(await zonaDeEmpresa(sb(), EMP)).toBe("America/Bogota");
    base.tablas.companies![0]!.zona_horaria = null;
    expect(await zonaDeEmpresa(sb(), EMP)).toBe("America/Lima");
    base.tablas.companies![0]!.zona_horaria = "No/Existe";
    expect(await zonaDeEmpresa(sb(), EMP)).toBe("America/Lima");
    expect(await zonaDeEmpresa(sb(), "cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toBe("America/Lima");
    // La base todavía no tiene la columna: el error no tumba la ruta, se usa Lima.
    base.fallar.companies = { op: "select", mensaje: "column companies.zona_horaria does not exist" };
    expect(await zonaDeEmpresa(sb(), EMP_UTC)).toBe("America/Lima");
  });

  it("dejarMotivoDeArchivo · escribe el motivo en el rastro, y si no puede lo dice", async () => {
    const datos = { companyId: EMP, indicadorId: IND, clave: "devoluciones_mes", motivo: "  Ya lo cuenta el contador  ", quien: DUENO, ruta: "/x", ip: null, antes: { estado: "activo" }, despues: { estado: "archivado" } };
    expect(await dejarMotivoDeArchivo(sb(), datos)).toEqual({ ok: true });
    expect(base.tablas.audit_log).toEqual([
      expect.objectContaining({ company_id: EMP, actor_id: DUENO.id, actor_rol: "cliente", accion: "editar", entidad: "indicador", entidad_id: IND, detalle: { clave: "devoluciones_mes", antes: { estado: "activo" }, despues: { estado: "archivado" }, motivo: "Ya lo cuenta el contador" } }),
    ]);
    base.fallar.audit_log = { op: "insert", mensaje: "sin conexión" };
    const r = await dejarMotivoDeArchivo(sb(), datos);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no se archivó/);
  });
});

const pedir = (metodo: string, ruta: string, cuerpo: Fila) =>
  new Request(`http://8x.test${ruta}`, { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
const viejo = (cuerpo: Fila, empresa = EMP) => patchViejo(pedir("PATCH", `/api/companies/${empresa}/indicadores`, cuerpo), { params: Promise.resolve({ id: empresa }) });
const editar = (kid: string, cuerpo: Fila, empresa = EMP) => patchIndicador(pedir("PATCH", `/api/companies/${empresa}/kpis/${kid}`, cuerpo), { params: Promise.resolve({ id: empresa, kid }) });
const anotar = (kid: string, cuerpo: Fila, empresa = EMP) => postValor(pedir("POST", `/api/companies/${empresa}/kpis/${kid}/valor`, cuerpo), { params: Promise.resolve({ id: empresa, kid }) });
/** Lo que las rutas dejaron en el rastro de este indicador (sin contar la línea genérica de protegido()). */
const rastroDe = (id: string) => vi.mocked(registrar).mock.calls.map(([e]) => e).filter((e) => e.entidadId === id);

function prepararRutas() {
  sembrar();
  vi.mocked(perfilApi).mockReset();
  vi.mocked(perfilApi).mockResolvedValue(DUENO);
  vi.mocked(registrar).mockClear();
  vi.mocked(registrarError).mockClear();
  // Solo el reloj: las promesas siguen corriendo de verdad.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOY);
}

describe("(c) la ruta vieja PATCH /indicadores pasa por el mismo camino y conserva su contrato (con dobles)", () => {
  beforeEach(prepararRutas);
  afterEach(() => { vi.useRealTimers(); });

  it("anotar el mes que cerró: responde { listo: true } como siempre y deja historia, valor actual y espejo", async () => {
    const res = await viejo({ indicador_id: IND, valor: 12, periodo: "2026-09" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ listo: true });
    expect(base.tablas.indicador_valores).toEqual([expect.objectContaining({ indicador_id: IND, periodo: "2026-09", valor: 12, estado_validacion: "declarado", registrado_por: DUENO.id })]);
    expect(indicador()).toMatchObject({ valor_actual: 12, valor_actual_periodo: "2026-09", estado_validacion: "declarado" });
    expect(base.tablas.company_metricas).toEqual([expect.objectContaining({ company_id: EMP, clave: "devoluciones_mes", periodo: "2026-09", valor: 12, estado: "contado" })]);
    expect(rastroDe(IND)).toEqual([expect.objectContaining({ accion: "crear", entidad: "indicador_valor", detalle: expect.objectContaining({ periodo: "2026-09", valor: 12, estado_validacion: "declarado", espejo: "reflejado" }) })]);
  });

  it("las dos rutas dejan exactamente lo mismo en las tres tablas: historia, indicador y números de la empresa", async () => {
    const foto = () => JSON.parse(JSON.stringify({ historia: base.tablas.indicador_valores, numeros: base.tablas.company_metricas, indicador: indicador() }));
    expect((await anotar(IND, { periodo: "2026-09", valor: 12 })).status).toBe(201);
    const porLaNueva = foto();
    expect(porLaNueva.numeros).toHaveLength(1); // antes del arreglo la ruta nueva no reflejaba, y «Tus números» no lo veía
    sembrar();
    expect((await viejo({ indicador_id: IND, valor: 12, periodo: "2026-09" })).status).toBe(200);
    expect(foto()).toEqual(porLaNueva);
  });

  it("si en los números ese mes ya está verificado: responde { listo: true, aviso }, no lo pisa, y el valor queda en la historia", async () => {
    base.tablas.company_metricas = [numeroDeEmpresa()];
    const res = await viejo({ indicador_id: IND, valor: 12, periodo: "2026-09" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      listo: true,
      aviso: "En «Tus números», Setiembre 2026 ya tiene un dato que no se reemplaza desde aquí (verificado). Lo que registraste quedó en la historia del indicador.",
    });
    expect(base.tablas.company_metricas).toEqual([numeroDeEmpresa()]);
    expect(base.tablas.indicador_valores).toEqual([expect.objectContaining({ periodo: "2026-09", valor: 12, estado_validacion: "declarado" })]);
    expect(rastroDe(IND)).toEqual([expect.objectContaining({ entidad: "indicador_valor", detalle: expect.objectContaining({ valor: 12, espejo: "intacto" }) })]);
  });

  it("NEGATIVO · el valor entra y el reflejo falla: 500 con una frase, sin el mensaje de la base, y el rastro de lo guardado ya está escrito al responder", async () => {
    base.fallar.company_metricas = { op: "insert", mensaje: "relation is locked" };
    const orden: string[] = [];
    // Un rastro lento: si la ruta no lo esperara, respondería antes de que quedara escrito.
    vi.mocked(registrar).mockImplementationOnce(async () => { await new Promise((r) => setTimeout(r, 15)); orden.push("rastro"); });
    const res = await viejo({ indicador_id: IND, valor: 12, periodo: "2026-09" });
    orden.push("respuesta");
    expect(orden).toEqual(["rastro", "respuesta"]);
    expect(res.status).toBe(500);
    const cuerpo = await res.json();
    expect(cuerpo).toEqual({ error: TEXTO_PENDIENTE.tus_numeros });
    expect(JSON.stringify(cuerpo)).not.toMatch(/relation|locked/);
    // El valor quedó guardado, y el rastro lo dice junto con lo que faltó.
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(indicador()).toMatchObject({ valor_actual: 12, valor_actual_periodo: "2026-09" });
    expect(rastroDe(IND)).toEqual([expect.objectContaining({ accion: "crear", entidad: "indicador_valor", detalle: expect.objectContaining({ periodo: "2026-09", valor: 12, espejo: "pendiente", pendiente: "tus_numeros" }) })]);
    // El mensaje de la base va al registro de errores, para la consultora.
    expect(vi.mocked(registrarError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(registrarError)).toHaveBeenCalledWith(expect.objectContaining({ ruta: "/api/companies/indicadores", detalle: "company_metricas.insert (devoluciones_mes/2026-09): relation is locked", actorId: DUENO.id, companyId: EMP }));
    // POSITIVO · anotarlo otra vez lo completa.
    base.fallar = {};
    expect((await viejo({ indicador_id: IND, valor: 12, periodo: "2026-09" })).status).toBe(200);
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(base.tablas.company_metricas).toHaveLength(1);
  });

  it("NEGATIVO · la base rechaza el valor antes de escribir nada: 500 con una frase, ningún rastro de un valor que no existe, y el detalle en el registro de errores", async () => {
    base.fallar.indicador_valores = { op: "insert", mensaje: "violates check constraint" };
    const res = await viejo({ indicador_id: IND, valor: 12, periodo: "2026-09" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: TEXTO_NO_SE_GUARDO });
    expect(rastroDe(IND)).toEqual([]);
    expect(base.escrituras).toEqual([]);
    expect(vi.mocked(registrarError)).toHaveBeenCalledWith(expect.objectContaining({ detalle: "indicador_valores.insert (devoluciones_mes/2026-09): violates check constraint", companyId: EMP }));
  });

  it("NEGATIVO · si no se puede cambiar el estado, se dice con una frase y el indicador sigue como estaba", async () => {
    base.fallar.indicadores = { op: "update", mensaje: "deadlock detected" };
    const res = await viejo({ indicador_id: IND_PROP, estado: "activo" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No pudimos guardar el cambio y el indicador sigue como estaba. Inténtalo de nuevo." });
    expect(indicador(IND_PROP).estado).toBe("propuesto");
    expect(vi.mocked(registrarError)).toHaveBeenCalledWith(expect.objectContaining({ detalle: expect.stringContaining("deadlock detected") }));
  });

  it("(d) en el borde, el mes que ofrece el bloque es el que la ruta acepta; el que ofrecía antes, no", async () => {
    vi.setSystemTime(LIMA_21_30); // 30 de setiembre, 21:30 en Lima; en el servidor (UTC) ya es 1 de octubre
    const html = bloqueViejo({ indicadores: [indicadorViejo()], zona: await zonaDeEmpresa(sb(), EMP), periodoActual: "2026-09" });
    expect(html).toContain("Anotar el de Agosto 2026");
    // Lo que el botón manda ahora: el mes que cerró en el reloj de la empresa.
    const ofrecido = periodoCerradoMasReciente("mensual", new Date(), "America/Lima");
    expect(ofrecido).toBe("2026-08");
    expect((await viejo({ indicador_id: IND, valor: 4, periodo: ofrecido })).status).toBe(200);
    expect(indicador()).toMatchObject({ valor_actual: 4, valor_actual_periodo: "2026-08" });
    // NEGATIVO · lo que mandaba antes, con el mes que la página calcula en UTC.
    const antes = await viejo({ indicador_id: IND, valor: 4, periodo: "2026-09" });
    expect(antes.status).toBe(400);
    expect((await antes.json()).error).toBe("Setiembre 2026 todavía no terminó: se registra cuando cierre.");
  });

  it("NEGATIVO · valor null: antes entraba en los números como un dato; ahora no inserta nada y queda «sin dato»", async () => {
    const res = await viejo({ indicador_id: IND, valor: null, periodo: "2026-09" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ listo: true });
    expect(base.tablas.indicador_valores).toEqual([]);
    expect(base.tablas.company_metricas).toEqual([]);
    expect(indicador()).toMatchObject({ valor_actual: null, estado_validacion: "sin_dato" });
    expect(rastroDe(IND)).toEqual([expect.objectContaining({ entidad: "indicador_valor", detalle: expect.objectContaining({ sin_dato: true, texto: "sin dato en Setiembre 2026" }) })]);
  });

  it("NEGATIVO · un indicador semanal no acepta un mes: 400 con el motivo y nada escrito", async () => {
    const res = await viejo({ indicador_id: IND_SEM, valor: 4, periodo: "2026-09" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cada semana/);
    expect(base.escrituras).toEqual([]);
  });

  it("NEGATIVO · el mes en curso no se anota; y a las 21:30 de Lima del 30 de setiembre, tampoco setiembre", async () => {
    expect((await viejo({ indicador_id: IND, valor: 4, periodo: "2026-10" })).status).toBe(400);
    vi.setSystemTime(LIMA_21_30);
    const res = await viejo({ indicador_id: IND, valor: 4, periodo: "2026-09" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Setiembre 2026 todavía no terminó: se registra cuando cierre.");
    expect(base.escrituras).toEqual([]);
    // POSITIVO · la empresa en UTC, a esa misma hora, ya lo tiene cerrado; y la de Lima, desde las 00:00.
    expect((await viejo({ indicador_id: IND_UTC, valor: 4, periodo: "2026-09" }, EMP_UTC)).status).toBe(200);
    vi.setSystemTime(LIMA_00_00);
    expect((await viejo({ indicador_id: IND, valor: 4, periodo: "2026-09" })).status).toBe(200);
  });

  it("aunque anote la consultora, por este camino entra como declarado: el contrato viejo no deja elegir", async () => {
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const res = await viejo({ indicador_id: IND, valor: 9, periodo: "2026-09", estado_validacion: "verificado" });
    expect(res.status).toBe(200);
    expect(base.tablas.indicador_valores![0]).toMatchObject({ valor: 9, estado_validacion: "declarado" });
    expect(indicador().estado_validacion).toBe("declarado");
  });

  it("adoptar («Vigilar este») sigue igual y no pide motivo; pedir el estado que ya tiene no escribe nada", async () => {
    const res = await viejo({ indicador_id: IND_PROP, estado: "activo" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ listo: true });
    expect(indicador(IND_PROP).estado).toBe("activo");
    base.escrituras = [];
    expect((await viejo({ indicador_id: IND_PROP, estado: "activo" })).status).toBe(200);
    expect(base.escrituras).toEqual([]);
  });

  it("NEGATIVO · si el valor no va a entrar, tampoco se cambia el estado: nada a medias", async () => {
    const res = await viejo({ indicador_id: IND_PROP, estado: "activo", valor: 3, periodo: "2026-10" });
    expect(res.status).toBe(400);
    expect(indicador(IND_PROP).estado).toBe("propuesto");
    expect(base.escrituras).toEqual([]);
    // POSITIVO · con un mes cerrado, activar y anotar en la misma petición sigue valiendo.
    expect((await viejo({ indicador_id: IND_PROP, estado: "activo", valor: 3, periodo: "2026-09" })).status).toBe(200);
    expect(indicador(IND_PROP)).toMatchObject({ estado: "activo", valor_actual: 3 });
  });

  it("NEGATIVO · archivar sin motivo, o con menos de ocho letras: 400 y el indicador sigue como estaba", async () => {
    for (const cuerpo of [{ estado: "archivado" }, { estado: "archivado", motivo: "no sirve" }, { estado: "archivado", motivo: "1234567890 ..." }]) {
      const res = await viejo({ indicador_id: IND_PROP, ...cuerpo });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(TEXTO_FALTA_MOTIVO);
    }
    expect(indicador(IND_PROP).estado).toBe("propuesto");
    expect(base.escrituras).toEqual([]);
  });

  it("archivar con motivo: primero queda escrito el motivo, después se archiva", async () => {
    const res = await viejo({ indicador_id: IND_PROP, estado: "archivado", motivo: "Eso ya lo cuenta el contador" });
    expect(res.status).toBe(200);
    expect(indicador(IND_PROP).estado).toBe("archivado");
    expect(base.escrituras.map((e) => `${e.tabla}:${e.op}`)).toEqual(["audit_log:insert", "indicadores:update"]);
    expect(base.tablas.audit_log![0]).toMatchObject({
      company_id: EMP, actor_id: DUENO.id, actor_rol: "cliente", entidad: "indicador", entidad_id: IND_PROP,
      detalle: { motivo: "Eso ya lo cuenta el contador", antes: { estado: "propuesto" }, despues: { estado: "archivado" } },
    });
  });

  it("NEGATIVO · si el motivo no se pudo guardar, no se archiva", async () => {
    base.fallar.audit_log = { op: "insert", mensaje: "sin conexión" };
    const res = await viejo({ indicador_id: IND_PROP, estado: "archivado", motivo: "Eso ya lo cuenta el contador" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/no se archivó/);
    expect(indicador(IND_PROP).estado).toBe("propuesto");
    expect(escriturasEn("indicadores")).toEqual([]);
  });

  it("NEGATIVO · indicador de otra empresa → 404; valor sin periodo o cuerpo sin nada que cambiar → 400", async () => {
    expect((await viejo({ indicador_id: IND_UTC, valor: 4, periodo: "2026-09" })).status).toBe(404);
    expect((await viejo({ indicador_id: IND, valor: 4 })).status).toBe(400);
    expect((await viejo({ indicador_id: IND })).status).toBe(400);
    expect(base.escrituras).toEqual([]);
  });

  it("lectura del código · la ruta vieja ya no escribe valores por su cuenta, y el componente la sigue llamando igual", () => {
    const vieja = leerFuente("app/api/companies/[id]/indicadores/route.ts");
    expect(vieja).toContain("guardarValor(");
    expect(vieja).not.toContain('from("company_metricas")');
    expect(vieja).not.toContain('from("indicador_valores")');
    expect(vieja).toContain("ok({ listo: true })");
    const nueva = leerFuente("app/api/companies/[id]/kpis/[kid]/valor/route.ts");
    expect(nueva).toContain("guardarValor(");
    expect(nueva).not.toContain('from("indicador_valores")');
    expect(nueva).not.toContain('from("company_metricas")');
    // El reflejo en los números ya no es cosa de una ruta ni de una opción: lo hace guardarValor, siempre, para las dos.
    const registro = leerFuente("app/api/companies/[id]/kpis/_registro.ts");
    for (const src of [vieja, nueva, registro]) expect(src).not.toContain("espejoEnNumeros");
    expect(registro.match(/await reflejarEnNumeros\(/g)).toHaveLength(1);
    expect(registro).toContain('if (!mensual) return { ...guardado, espejo: "no_aplica"');
    // Ninguna le enseña a quien registra el mensaje de la base: va al registro de errores.
    for (const src of [vieja, nueva, registro]) expect(src).not.toMatch(/(?:fallo\(|motivo: )\w*[eE]rror\w*\.message/);
    expect(registro).not.toContain("registrarError"); // el camino no escribe por su cuenta: devuelve `tecnico` y la ruta lo anota
    for (const src of [vieja, nueva]) {
      expect(src).toContain("registrarError(");
      // Si algo quedó pendiente, el rastro de lo guardado se espera ANTES de responder el fallo.
      expect(src).toMatch(/await registrar\(rastro\);\s*void registrarError\([^\n]*\);\s*return fallo\(r\.pendiente\.motivo, 500\);/);
      expect(src).toContain("rastroDeValor(kpi, r)");
    }
    // Las dos pantallas que registran muestran el aviso en vez de taparlo.
    expect(leerFuente("components/kpis/RegistrarValor.tsx")).toContain("if (!r.aviso) setTimeout(() => alCerrar?.(), 900);");
    const componente = leerFuente("components/cliente/Indicadores.tsx");
    expect(componente).toMatch(/if \(r\?\.aviso\) \{[\s\S]*?setAviso\(r\.aviso\);[\s\S]*?return;\s*\}\s*window\.location\.reload\(\);/);
    expect(componente).toContain("`/api/companies/${companyId}/indicadores`");
    expect(componente).toContain("cambiar(i.id, { valor: n, periodo: periodoActual })");
    // Lo que no se anota por mes se manda a «Tus indicadores», donde sí se ofrece su periodo.
    expect(componente).toContain('i.frecuencia !== "mensual"');
    expect(componente).toContain('href="/portal/kpis"');
  });
});

describe("(b) nada se archiva sin motivo", () => {
  beforeEach(prepararRutas);
  afterEach(() => { vi.useRealTimers(); });

  it("motivoSuficiente cuenta letras, no caracteres: ocho como mínimo", () => {
    expect(MIN_LETRAS_MOTIVO).toBe(8);
    expect(letrasDe("no sirve")).toBe(7);
    expect(motivoSuficiente("no sirve")).toBe(false);
    expect(motivoSuficiente("no me sirve")).toBe(true);
    expect(motivoSuficiente("Ya lo cuenta el contador")).toBe(true);
    expect(motivoSuficiente("niños años")).toBe(true); // las letras con tilde y la ñ cuentan
    for (const vacio of [null, undefined, "", "        ", "1234567890", "........ ??", "ok", "no"]) expect(motivoSuficiente(vacio)).toBe(false);
  });

  it("PATCH /kpis/[kid] · NEGATIVO · la empresa archiva sin motivo o con uno corto: 400 y sigue propuesto", async () => {
    for (const cuerpo of [{ estado: "archivado" }, { estado: "archivado", motivo: "no sirve" }, { estado: "archivado", motivo: "12345678" }]) {
      const res = await editar(IND_PROP, cuerpo);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(TEXTO_FALTA_MOTIVO);
    }
    expect(indicador(IND_PROP).estado).toBe("propuesto");
    expect(base.escrituras).toEqual([]);
  });

  it("PATCH /kpis/[kid] · NEGATIVO · la consultora tampoco archiva sin motivo", async () => {
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const res = await editar(IND, { estado: "archivado" });
    expect(res.status).toBe(400);
    expect(indicador().estado).toBe("activo");
    expect(base.escrituras).toEqual([]);
  });

  it("PATCH /kpis/[kid] · con motivo: una sola fila en el rastro, escrita antes de archivar, con antes, después y motivo", async () => {
    const res = await editar(IND_PROP, { estado: "archivado", motivo: "No vendemos por catálogo" });
    expect(res.status).toBe(200);
    expect((await res.json()).kpi.estado).toBe("archivado");
    expect(indicador(IND_PROP).estado).toBe("archivado");
    expect(base.escrituras.map((e) => `${e.tabla}:${e.op}`)).toEqual(["audit_log:insert", "indicadores:update"]);
    expect(base.tablas.audit_log![0]).toMatchObject({
      company_id: EMP, actor_id: DUENO.id, entidad: "indicador", entidad_id: IND_PROP,
      detalle: { motivo: "No vendemos por catálogo", antes: { estado: "propuesto" }, despues: { estado: "archivado" } },
    });
    // Y no se duplica con el rastro normal.
    expect(rastroDe(IND_PROP)).toEqual([]);
  });

  it("PATCH /kpis/[kid] · NEGATIVO · si el motivo no se pudo guardar, no se archiva", async () => {
    base.fallar.audit_log = { op: "insert", mensaje: "sin conexión" };
    const res = await editar(IND_PROP, { estado: "archivado", motivo: "No vendemos por catálogo" });
    expect(res.status).toBe(500);
    expect(indicador(IND_PROP).estado).toBe("propuesto");
    expect(escriturasEn("indicadores")).toEqual([]);
  });

  it("PATCH /kpis/[kid] · adoptar no pide motivo, y archivar lo ya archivado no cambia ni escribe nada", async () => {
    expect((await editar(IND_PROP, { estado: "activo" })).status).toBe(200);
    expect(indicador(IND_PROP).estado).toBe("activo");
    expect(rastroDe(IND_PROP)).toEqual([expect.objectContaining({ accion: "aprobar" })]);
    indicador(IND_PROP).estado = "archivado";
    base.escrituras = [];
    const res = await editar(IND_PROP, { estado: "archivado" });
    expect(res.status).toBe(200);
    expect((await res.json()).sin_cambios).toBe(true);
    expect(base.escrituras).toEqual([]);
  });

  it("POST /kpis · NEGATIVO · un indicador no puede nacer archivado (sería archivar sin motivo); propuesto, sí", async () => {
    vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
    const crear = (cuerpo: Fila) => postIndicador(pedir("POST", `/api/companies/${EMP}/kpis`, cuerpo), { params: Promise.resolve({ id: EMP }) });
    const res = await crear({ nombre: "Reclamos al mes", como_se_mide: "Contar los reclamos del libro", estado: "archivado" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/nace propuesto o activo/);
    expect(base.escrituras).toEqual([]);
    const bien = await crear({ nombre: "Reclamos al mes", como_se_mide: "Contar los reclamos del libro" });
    expect(bien.status).toBe(201);
    expect((await bien.json()).kpi).toMatchObject({ clave: "reclamos_al_mes", estado: "propuesto" });
  });

  it("lectura del código · «Este no me sirve» abre la pregunta del motivo; ningún botón archiva directo", () => {
    const tus = leerFuente("components/kpis/TusIndicadores.tsx");
    expect(tus).toContain("Este no me sirve");
    expect(tus).toContain("setDescartando(i.id)");
    expect(tus).toContain("<MotivoArchivo");
    expect(tus).toContain('estado === "archivado" && !motivoSuficiente(motivo)');
    expect(tus).toContain("{ estado, motivo: motivo!.trim() }");
    const llamadas = [...tus.matchAll(/decidir\(i\.id, "archivado"([^)]*)\)/g)];
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]![1]).toBe(", motivo");

    const viejoComp = leerFuente("components/cliente/Indicadores.tsx");
    expect(viejoComp).toContain("<MotivoArchivo");
    expect(viejoComp).toContain('cambiar(i.id, { estado: "archivado", motivo })');
    expect(viejoComp).not.toContain('cambiar(i.id, { estado: "archivado" })');
    expect(viejoComp).toMatch(/cuerpo\.estado === "archivado" && !motivoSuficiente\(/);

    // La consultora tampoco: el tablero comprueba el motivo antes de pedir el archivo.
    expect(leerFuente("components/kpis/TableroKpis.tsx")).toContain("!motivoSuficiente(respuesta)");
    // Y las dos rutas lo exigen aunque la pantalla se salte.
    for (const ruta of ["app/api/companies/[id]/kpis/[kid]/route.ts", "app/api/companies/[id]/indicadores/route.ts"]) {
      const src = leerFuente(ruta);
      expect(src).toContain("motivoSuficiente(b.motivo)");
      expect(src).toContain("dejarMotivoDeArchivo(");
    }
  });

  it("la pregunta del motivo nace vacía, sin ejemplo dentro de la caja, y con el botón apagado", () => {
    const html = renderToStaticMarkup(createElement(MotivoArchivo, { nombre: "Devoluciones al mes", trabajando: false, alConfirmar: () => {}, alCancelar: () => {} }));
    expect(html).toContain("¿Por qué no te sirve «Devoluciones al mes»?");
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
    expect(html).not.toContain("placeholder");
    expect(html).toContain("Faltan 8 letras.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>No vigilarlo<\/button>/);
    // El texto que ve el dueño no trae jerga.
    expect(html).not.toMatch(/\bKPI\b|baseline|archiv/i);
  });
});

describe("(d) POST /kpis/[kid]/valor usa el reloj de la empresa (con dobles)", () => {
  beforeEach(prepararRutas);
  afterEach(() => { vi.useRealTimers(); });

  it("30 de setiembre, 21:30 en Lima: setiembre no entra para la empresa de Lima y sí para la que vive en UTC", async () => {
    vi.setSystemTime(LIMA_21_30);
    const lima = await anotar(IND, { periodo: "2026-09", valor: 5 });
    expect(lima.status).toBe(400);
    expect((await lima.json()).error).toBe("Setiembre 2026 todavía no terminó: se registra cuando cierre.");
    expect(base.escrituras).toEqual([]);
    const utc = await anotar(IND_UTC, { periodo: "2026-09", valor: 5 }, EMP_UTC);
    expect(utc.status).toBe(201);
    // A las 00:00 de Lima, ya entra.
    vi.setSystemTime(LIMA_00_00);
    expect((await anotar(IND, { periodo: "2026-09", valor: 5 })).status).toBe(201);
    expect(indicador()).toMatchObject({ valor_actual: 5, valor_actual_periodo: "2026-09" });
    // El camino nuevo refleja lo mensual en los números de la empresa igual que el viejo: un solo escritor.
    expect(base.tablas.company_metricas).toEqual([
      expect.objectContaining({ company_id: EMP_UTC, clave: "pedidos_mes", periodo: "2026-09", valor: 5, estado: "contado" }),
      expect.objectContaining({ company_id: EMP, clave: "devoluciones_mes", periodo: "2026-09", valor: 5, estado: "contado" }),
    ]);
  });

  it("NEGATIVO · un indicador semanal por la ruta nueva: entra en su historia y no en los números de la empresa, y el rastro lo dice", async () => {
    const res = await anotar(IND_SEM, { periodo: "2026-S40", valor: 4 });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ sin_dato: false, aviso: null });
    expect(base.tablas.indicador_valores).toEqual([expect.objectContaining({ indicador_id: IND_SEM, periodo: "2026-S40", valor: 4 })]);
    expect(base.tablas.company_metricas).toEqual([]);
    expect(rastroDe(IND_SEM)).toEqual([expect.objectContaining({ detalle: expect.objectContaining({ espejo: "no_aplica" }) })]);
  });

  it("si en los números ese mes ya está verificado, la respuesta trae el aviso y el número verificado no se toca", async () => {
    base.tablas.company_metricas = [numeroDeEmpresa()];
    const res = await anotar(IND, { periodo: "2026-09", valor: 5 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      sin_dato: false, texto: "Registrado para Setiembre 2026 (lo declaró la empresa).", corregido: false, es_periodo_anterior: false,
      aviso: "En «Tus números», Setiembre 2026 ya tiene un dato que no se reemplaza desde aquí (verificado). Lo que registraste quedó en la historia del indicador.",
    });
    expect(base.tablas.company_metricas).toEqual([numeroDeEmpresa()]);
  });

  it("NEGATIVO · el valor entra y algo de lo demás falla: 500 con una frase, el rastro de lo guardado escrito antes de responder, y el mensaje de la base solo en el registro de errores", async () => {
    base.fallar.company_metricas = { op: "insert", mensaje: "relation is locked" };
    const orden: string[] = [];
    vi.mocked(registrar).mockImplementationOnce(async () => { await new Promise((r) => setTimeout(r, 15)); orden.push("rastro"); });
    const res = await anotar(IND, { periodo: "2026-09", valor: 5 });
    orden.push("respuesta");
    expect(orden).toEqual(["rastro", "respuesta"]);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: TEXTO_PENDIENTE.tus_numeros });
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(indicador()).toMatchObject({ valor_actual: 5, valor_actual_periodo: "2026-09" });
    expect(rastroDe(IND)).toEqual([expect.objectContaining({ accion: "crear", entidad: "indicador_valor", detalle: expect.objectContaining({ valor: 5, espejo: "pendiente", pendiente: "tus_numeros" }) })]);
    expect(vi.mocked(registrarError)).toHaveBeenCalledWith(expect.objectContaining({ ruta: "/api/companies/kpis/valor", detalle: "company_metricas.insert (devoluciones_mes/2026-09): relation is locked", companyId: EMP }));

    // El otro pendiente: la historia recibe el valor y el indicador no se puede actualizar.
    prepararRutas();
    base.fallar.indicadores = { op: "update", mensaje: "deadlock detected" };
    const otro = await anotar(IND, { periodo: "2026-09", valor: 5 });
    expect(otro.status).toBe(500);
    expect(await otro.json()).toEqual({ error: TEXTO_PENDIENTE.valor_actual });
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(indicador().valor_actual).toBeNull();
    expect(rastroDe(IND)).toEqual([expect.objectContaining({ detalle: expect.objectContaining({ valor: 5, pendiente: "valor_actual" }) })]);
    // POSITIVO · registrarlo otra vez lo completa, como corrección.
    base.fallar = {};
    expect((await anotar(IND, { periodo: "2026-09", valor: 5 })).status).toBe(200);
    expect(indicador()).toMatchObject({ valor_actual: 5, valor_actual_periodo: "2026-09" });
    expect(base.tablas.company_metricas).toHaveLength(1);
  });

  it("NEGATIVO · la base rechaza el valor antes de escribir nada: 500 con una frase y nada en el rastro del indicador", async () => {
    base.fallar.indicador_valores = { op: "insert", mensaje: "violates check constraint" };
    const res = await anotar(IND, { periodo: "2026-09", valor: 5 });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: TEXTO_NO_SE_GUARDO });
    expect(rastroDe(IND)).toEqual([]);
    expect(vi.mocked(registrarError)).toHaveBeenCalledWith(expect.objectContaining({ detalle: "indicador_valores.insert (devoluciones_mes/2026-09): violates check constraint" }));
  });

  it("«sin dato» sobre el mismo periodo que ya tiene valor: la respuesta lo dice con sus palabras, el número sigue en la historia y el indicador queda sin_dato", async () => {
    expect((await anotar(IND, { periodo: "2026-09", valor: 5 })).status).toBe(201);
    const res = await anotar(IND, { periodo: "2026-09", valor: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sin_dato: true, es_periodo_anterior: false, texto: "Se anotó sin dato en Setiembre 2026. Ese periodo ya tenía un valor: no se borra, sigue en la historia." });
    expect(base.tablas.indicador_valores).toEqual([expect.objectContaining({ periodo: "2026-09", valor: 5 })]);
    expect(indicador()).toMatchObject({ valor_actual: 5, valor_actual_periodo: "2026-09", estado_validacion: "sin_dato" });
  });

  it("sin dato de un periodo anterior por la ruta nueva: 200, nada escrito en la base, y el rastro lo dice", async () => {
    Object.assign(indicador(), { valor_actual: 30, valor_actual_periodo: "2026-09", valor_actual_at: hace(5), estado_validacion: "conciliado" });
    const res = await anotar(IND, { periodo: "2026-07", valor: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sin_dato: true, texto: "Se anotó sin dato en Julio 2026; el valor actual sigue siendo el de Setiembre 2026.", es_periodo_anterior: true });
    expect(base.escrituras).toEqual([]);
    expect(indicador()).toMatchObject({ valor_actual: 30, estado_validacion: "conciliado" });
    expect(rastroDe(IND)).toEqual([expect.objectContaining({ entidad: "indicador_valor", detalle: expect.objectContaining({ sin_dato: true, periodo: "2026-07", es_periodo_anterior: true }) })]);
  });

  it("la empresa que pide «conciliado» por la ruta nueva: 403 y nada escrito", async () => {
    const res = await anotar(IND, { periodo: "2026-09", valor: 5, estado_validacion: "conciliado" });
    expect(res.status).toBe(403);
    expect(base.escrituras).toEqual([]);
  });
});

describe("las pantallas del dueño, pintadas en el servidor (no en un navegador)", () => {
  afterEach(() => { vi.useRealTimers(); });

  const deCliente = (sobre: Partial<IndicadorCliente> = {}): IndicadorCliente => {
    const k = completo({ id: IND, valor_actual: null, valor_actual_periodo: null, valor_actual_at: null, estado_validacion: null });
    return { ...k, responsable_puesto: "Encargada de tienda", ...sobre };
  };
  const tus = (zona: string, indicadores: IndicadorCliente[]) =>
    renderToStaticMarkup(createElement(TusIndicadores, { companyId: EMP, zona, indicadores, valores: [] })).replace(/<!-- -->/g, "");

  it("(d) Tus indicadores · 30 de setiembre, 21:30 en Lima: ofrece registrar agosto; a una empresa en UTC, setiembre", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(LIMA_21_30);
    expect(tus("America/Lima", [deCliente()])).toContain("Registrar el valor de Agosto 2026");
    expect(tus("America/Lima", [deCliente()])).not.toContain("Setiembre 2026");
    expect(tus("UTC", [deCliente()])).toContain("Registrar el valor de Setiembre 2026");
    vi.setSystemTime(LIMA_00_00);
    expect(tus("America/Lima", [deCliente()])).toContain("Registrar el valor de Setiembre 2026");
  });

  it("(b) Tus indicadores · un propuesto muestra «Este no me sirve» y la pregunta del motivo empieza cerrada", () => {
    const html = tus("America/Lima", [deCliente({ id: IND_PROP, estado: "propuesto" })]);
    expect(html).toContain("Vigilar este");
    expect(html).toContain("Este no me sirve");
    expect(html).not.toContain("¿Por qué no te sirve");
    expect(html).not.toMatch(/\bKPI\b|baseline/i);
  });

  it("(a) Tus indicadores · un valor con un «sin dato» anotado después no se rotula «sin dato», y solo dice «de este mismo periodo» cuando lo es", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(HOY); // 13 de octubre: el último mes cerrado es setiembre
    // El valor es de agosto y setiembre ya cerró: el hueco pudo ser de agosto o de setiembre. No se afirma cuál.
    const html = tus("America/Lima", [deCliente({ valor_actual: 30, valor_actual_periodo: "2026-08", estado_validacion: "sin_dato" })]);
    expect(html).toContain("Agosto 2026 · lo último que se anotó fue «sin dato»");
    expect(html).not.toContain("Agosto 2026 · sin dato");
    expect(html).not.toContain("después se anotó un periodo sin dato"); // lo que decía antes, falso si el hueco era del mismo mes
    // El valor es de setiembre, el último mes cerrado: el hueco solo puede ser de setiembre.
    const mismo = tus("America/Lima", [deCliente({ valor_actual: 30, valor_actual_periodo: "2026-09", estado_validacion: "sin_dato" })]);
    expect(mismo).toContain("Setiembre 2026 · de este mismo periodo se anotó después «sin dato»");
    // NEGATIVO · un valor conciliado no cambia de rótulo por tener reloj.
    expect(tus("America/Lima", [deCliente({ valor_actual: 30, valor_actual_periodo: "2026-09", estado_validacion: "conciliado" })])).toContain("Setiembre 2026 · conciliado con los documentos");
  });

  it("(c) Tus números (bloque viejo) · el mensual se anota ahí; el semanal manda a «Tus indicadores»; archivar empieza por el motivo", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(HOY);
    const html = bloqueViejo({
      periodoActual: "2026-09",
      indicadores: [
        indicadorViejo(),
        indicadorViejo({ id: IND_SEM, clave: "visitas_semana", nombre: "Visitas a clientes", frecuencia: "semanal" }),
        indicadorViejo({ id: IND_PROP, clave: "quejas_trimestre", nombre: "Quejas al trimestre", frecuencia: "trimestral", estado: "propuesto" }),
      ],
    });
    expect(html.match(/Anotar el de Setiembre 2026/g)).toHaveLength(1); // solo el mensual
    expect(html).toContain("Este se anota cada semana, no por mes:");
    expect(html).toMatch(/<a[^>]*href="\/portal\/kpis"[^>]*>regístralo en Tus indicadores<\/a>/);
    // Lo que no es mensual no vive en «Tus números»: la lista lo dice en vez de quedarse muda.
    expect(html).toContain("Lo que anotes allí se ve allí, no en esta lista.");
    expect(html).toContain("Se anota cada trimestre"); // antes salía «trimestral», la clave interna
    expect(html).toContain("Este no me sirve");
    expect(html).not.toContain("¿Por qué no te sirve");
  });

  it("(c) Tus números (bloque viejo) · ya no promete que los indicadores entran en los cortes: un corte guarda solo los nueve números", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(HOY);
    const html = bloqueViejo({ indicadores: [indicadorViejo()] });
    expect(html).not.toContain("Entran en tus cortes");
    expect(html).toContain("Tus cortes comparan solo los nueve números de tu negocio: lo que anotes aquí no entra en ellos, salvo que el indicador sea uno de esos nueve.");
    expect(html).not.toMatch(/\bKPI\b|baseline/i);
    // Y es cierto: lo que un corte congela sale solo de las nueve claves. Un indicador propio reflejado en los números no entra;
    // uno cuya clave ES una de las nueve, sí.
    expect(valoresActuales([{ clave: "devoluciones_mes", periodo: "2026-09", valor: 12, estado: "contado" }])).toEqual({});
    expect(valoresActuales([{ clave: "venta_mes", periodo: "2026-09", valor: 50000, estado: "contado" }])).toEqual({ venta_mes: 50000 });
  });

  it("CIERRE Z5 · (c) Tus números (bloque viejo) · la cabecera dice la verdad según la frecuencia: lo mensual se anota aquí; lo demás, con su frecuencia, no entra en los cortes", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(HOY);
    const mensual = indicadorViejo();
    const semanal = indicadorViejo({ id: IND_SEM, clave: "visitas_semana", nombre: "Visitas a clientes", frecuencia: "semanal" });
    const trimestral = indicadorViejo({ id: IND_PROP, clave: "quejas_trimestre", nombre: "Quejas al trimestre", frecuencia: "trimestral" });
    // Solo mensuales: se dice de todos, porque es cierto de todos.
    const soloMes = bloqueViejo({ indicadores: [mensual] });
    expect(soloMes).toContain("Anota cada uno cuando cierre el mes; aquí lo ves junto a los meses anteriores.");
    expect(soloMes).not.toContain("se registran en «Tus indicadores»");
    // Mezcla: «cada uno cuando cierre el mes» sería falso del semanal y del trimestral.
    const mezcla = bloqueViejo({ indicadores: [mensual, semanal, trimestral] });
    expect(mezcla).not.toContain("Anota cada uno cuando cierre el mes");
    expect(mezcla).toContain("Los que se anotan cada mes se anotan aquí, cuando cierre el mes; aquí los ves junto a los meses anteriores.");
    expect(mezcla).toContain("Los que se anotan cada semana o cada trimestre se registran en «Tus indicadores»: no se ven en esta lista ni entran en tus cortes.");
    expect(mezcla).toContain("Tus cortes comparan solo los nueve números de tu negocio: lo que anotes aquí no entra en ellos, salvo que el indicador sea uno de esos nueve.");
    expect(mezcla.match(/Tampoco entra en tus cortes\./g)).toHaveLength(2); // una vez por cada fila no mensual
    // Ninguno mensual: no se promete que algo de esta lista se anote aquí ni que entre en un corte.
    const sinMes = bloqueViejo({ indicadores: [semanal] });
    expect(sinMes).not.toContain("cuando cierre el mes");
    expect(sinMes).not.toContain("salvo que el indicador sea uno de esos nueve");
    expect(sinMes).toContain("Los que se anotan cada semana se registran en «Tus indicadores»: no se ven en esta lista ni entran en tus cortes.");
    expect(sinMes).not.toContain("Anotar el de");
    for (const html of [soloMes, mezcla, sinMes]) {
      expect(html).not.toContain("Entran en tu"); // la promesa de antes, con su mayúscula
      expect(html).not.toMatch(/\bKPI\b|baseline/i);
    }
  });

  it("CIERRE Z5 · (c) lo que no es mensual de verdad no llega a un corte: por ninguna de las dos rutas se refleja en los números de la empresa", async () => {
    sembrar();
    const r = await guardarValor(sb(), kpiDe(IND_SEM), { periodo: "2026-S40", valor: 7 }, DUENO, { hoy: HOY });
    if (!r.ok || r.sin_dato) throw new Error("debió guardarse");
    expect(r.espejo).toBe("no_aplica");
    expect(base.tablas.indicador_valores).toHaveLength(1);
    expect(base.tablas.company_metricas).toEqual([]);
    // Y un corte congela solo lo que hay en esos números: sin fila, nada que congelar.
    expect(valoresActuales(base.tablas.company_metricas as unknown as Metrica[])).toEqual({});
  });

  it("(c) Tus números (bloque viejo) · la serie sale de los números de la empresa: un valor mensual reflejado se ve con su mes y el anterior", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(HOY);
    const html = bloqueViejo({
      indicadores: [indicadorViejo()],
      valores: [{ clave: "devoluciones_mes", periodo: "2026-09", valor: 12 }, { clave: "devoluciones_mes", periodo: "2026-08", valor: 15 }],
    });
    expect(html).toContain("Setiembre 2026");
    expect(html).toContain("Antes: Agosto 2026 15");
  });

  it("(d) Tus números (bloque viejo) · de 19:00 a 24:00 de Lima del último día ofrece el mes que SÍ cerró para la empresa, diga lo que diga el reloj del servidor", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const uno = [indicadorViejo()];
    for (const t of [LIMA_19_00, LIMA_21_30, LIMA_23_59]) {
      vi.setSystemTime(t);
      // La página todavía pasa el mes que calculó con el reloj del servidor (UTC: setiembre). Ya no decide.
      const lima = bloqueViejo({ indicadores: uno, zona: "America/Lima", periodoActual: "2026-09" });
      expect(lima).toContain("Anotar el de Agosto 2026");
      expect(lima).not.toContain("Setiembre 2026");
      // Sin zona (la página aún no la pasa), vacía o inventada: Lima, nunca UTC.
      expect(bloqueViejo({ indicadores: uno, periodoActual: "2026-09" })).toContain("Anotar el de Agosto 2026");
      expect(bloqueViejo({ indicadores: uno, zona: null })).toContain("Anotar el de Agosto 2026");
      expect(bloqueViejo({ indicadores: uno, zona: "No/Existe" })).toContain("Anotar el de Agosto 2026");
      // POSITIVO · una empresa cuyo reloj es UTC sí tiene setiembre cerrado a esa hora.
      expect(bloqueViejo({ indicadores: uno, zona: "UTC" })).toContain("Anotar el de Setiembre 2026");
    }
    // A las 00:00 de Lima setiembre ya cerró.
    vi.setSystemTime(LIMA_00_00);
    expect(bloqueViejo({ indicadores: uno, zona: "America/Lima" })).toContain("Anotar el de Setiembre 2026");
    // Un segundo antes de las 19:00 los dos relojes coinciden: no es un borde.
    vi.setSystemTime(LIMA_18_59);
    expect(bloqueViejo({ indicadores: uno, zona: "America/Lima" })).toContain("Anotar el de Agosto 2026");
    expect(bloqueViejo({ indicadores: uno, zona: "UTC" })).toContain("Anotar el de Agosto 2026");
  });
});

describe("(d) el tablero cuenta doce atributos, muestra la clasificación aparte y ancla cada fila", () => {
  const vista = (sobre: Partial<Kpi> = {}): KpiVista => {
    const k = completo(sobre);
    return { ...k, completitud: completitud(k), listo: listo(k).ok, alertas: [], avance: avance(k) };
  };
  const pintar = (kpis: KpiVista[]) =>
    renderToStaticMarkup(createElement(TableroKpis, { companyId: EMP, zona: "America/Lima", kpis, historia: [], participantes: [], acciones: [], lineasBase: [], propuestas: [] })).replace(/<!-- -->/g, "");
  /** El trozo de la página que empieza en la fila de ese indicador. */
  const fila = (html: string, id: string) => {
    const desde = html.indexOf(`id="indicador-${id}"`);
    expect(desde, `la fila de ${id} no tiene ancla`).toBeGreaterThan(-1);
    return html.slice(desde);
  };

  it("completo y clasificado: «12 de 12 atributos · listo para contarse», su clase aparte y su ancla para la revisión semanal", () => {
    const html = pintar([vista({ id: "k-completo" })]);
    const f = fila(html, "k-completo");
    expect(f).toContain("12 de 12 atributos · listo para contarse");
    expect(f).toContain("Indicador de resultado: qué cambió en el negocio.");
    expect(html).not.toContain("de 13");
    // El enlace de la revisión semanal apunta exactamente a esa ancla.
    expect(leerFuente("lib/revision-semanal.ts")).toContain("/kpis#indicador-${id}");
  });

  it("NEGATIVO · sin meta: «11 de 12 atributos · no está listo para contarse»; nunca «listo» a secas", () => {
    const html = pintar([vista({ id: "k-sin-meta", meta_valor: null, meta_texto: null, meta_plazo: null })]);
    const f = fila(html, "k-sin-meta");
    expect(f).toContain("11 de 12 atributos · no está listo para contarse");
    expect(f.replace(/no está listo para contarse/g, "")).not.toContain("listo para contarse");
    expect(f).toContain("meta y plazo");
  });

  it("definido y sin su primer valor: «10 de 12 atributos · definido; solo le falta su primer valor»", () => {
    const html = pintar([vista({ id: "k-nuevo", valor_actual: null, valor_actual_periodo: null, valor_actual_at: null, estado_validacion: null })]);
    const f = fila(html, "k-nuevo");
    expect(f).toContain("10 de 12 atributos · definido; solo le falta su primer valor");
    expect(f).not.toContain("listo para contarse");
  });

  it("sin clasificar: se dice aparte, no resta atributos y no está listo", () => {
    const html = pintar([vista({ id: "k-sin-clase", tipo_indicador: null })]);
    const f = fila(html, "k-sin-clase");
    expect(f).toContain("12 de 12 atributos · no está listo para contarse: falta clasificarlo");
    expect(f).toContain("Sin clasificar: falta decir si es de ejecución o de resultado.");
    expect(html).toContain("Sin clasificar (1)");
  });

  it("de ejecución: su clase es otra y va en su propia lista", () => {
    const html = pintar([vista({ id: "k-ejec", tipo_indicador: "ejecucion" })]);
    expect(fila(html, "k-ejec")).toContain("Indicador de ejecución: qué se hizo.");
    expect(html).toContain("De ejecución (1)");
    expect(html).toContain("De resultado (0)");
  });
});

// ─── CIERRE Z5 · REPARO DEL VERIFICADOR: «meta sin plan» donde se ve (el tablero de la consultora y su ruta) ──
//
// `alertas()` mira el vínculo entre indicador y acción en sus dos sentidos SOLO si quien la llama le pasa las
// acciones del plan. Quien pinta el tablero es la página (app/(consultor)/empresa/[id]/kpis/page.tsx) y quien lo
// sirve es GET /api/companies/[id]/kpis: los dos archivos son de otra lista y este remate no puede tocarlos.
// Lo que sí puede es MEDIR, con la página y la ruta de verdad sobre el doble, si ya leen el plan. Mientras no lo
// lean, las pruebas «HOY» dejan escrito qué pinta el tablero; en cuanto lo lean, las «HOY» se saltan y corren
// solas las «de punta a punta», sin tocar este archivo (el mismo patrón que tests/contradiccion-numerica.test.ts).

const ACC_VIVA = "a0000000-0000-4000-8000-000000000001";
const ACC_RECHAZADA = "a0000000-0000-4000-8000-000000000002";
const accionDelPlan = (sobre: Fila = {}): Fila => ({
  id: ACC_VIVA, company_id: EMP, accion: "Revisar cada devolución antes de despachar", estado: "en_ejecucion", indicador_id: null, verificado_at: null, prioridad: 1, ...sobre,
});
const SIN_MIRAR_EL_PLAN = "Tiene meta con plazo (2026-12-31) y el indicador no nombra ninguna acción del plan que la persiga.";
const NADIE_LA_PERSIGUE = "Tiene meta con plazo (2026-12-31) y ninguna acción del plan que la persiga.";

/** La empresa con UN indicador activo (meta 20 para el 2026-12-31) y el plan que se le dé; quien mira es la consultora. */
function sembrarTablero(sobreIndicador: Fila, acciones: Fila[]) {
  sembrar();
  base.tablas.indicadores = [filaIndicador(sobreIndicador)];
  base.tablas.actions = acciones;
  base.tablas.participants = [];
  base.tablas.mediciones = [];
  vi.mocked(perfilApi).mockReset();
  vi.mocked(perfilApi).mockResolvedValue(CONSULTORA);
}

/** Quien enseña las alertas del indicador, y qué dice de «meta sin plan» (null: no la rotula). */
type Pintor = { nombre: string; archivo: string; metaSinPlan: () => Promise<string | null> };
const PAGINA: Pintor = {
  nombre: "la página del tablero",
  archivo: "src/app/(consultor)/empresa/[id]/kpis/page.tsx",
  metaSinPlan: async () => {
    const html = renderToStaticMarkup(await PaginaTablero({ params: Promise.resolve({ id: EMP }) })).replace(/<!-- -->/g, "");
    const desde = html.indexOf(`id="indicador-${IND}"`);
    if (desde < 0) throw new Error("la página no pintó la fila del indicador");
    return /meta sin plan<\/span> · ([^<]*)</.exec(html.slice(desde))?.[1] ?? null;
  },
};
const RUTA: Pintor = {
  nombre: "GET /api/companies/[id]/kpis",
  archivo: "src/app/api/companies/[id]/kpis/route.ts",
  metaSinPlan: async () => {
    const res = await getIndicadores(new Request(`http://8x.test/api/companies/${EMP}/kpis`), { params: Promise.resolve({ id: EMP }) });
    if (res.status !== 200) throw new Error(`la ruta respondió ${res.status}`);
    const { kpis } = (await res.json()) as { kpis: { id: string; alertas: { tipo: string; texto: string }[] }[] };
    const k = kpis.find((x) => x.id === IND);
    if (!k) throw new Error("la ruta no devolvió el indicador");
    return k.alertas.find((a) => a.tipo === "meta_sin_plan")?.texto ?? null;
  },
};

/**
 * ¿Quien pinta ya lee el plan? Se mide con el caso del reparo y con la conducta, no con el texto del archivo:
 * una acción viva dice medirse con el indicador (`indicador_id`) y el indicador no nombra ninguna.
 */
async function sondear(p: Pintor): Promise<{ lee: boolean; error: string | null }> {
  try {
    sembrarTablero({ accion_asociada_id: null }, [accionDelPlan({ indicador_id: IND })]);
    return { lee: (await p.metaSinPlan()) === null, error: null };
  } catch (e) {
    return { lee: false, error: e instanceof Error ? e.message : String(e) };
  }
}
const SONDA = { pagina: await sondear(PAGINA), ruta: await sondear(RUTA) };
// Las sondas corren al cargar el archivo: la base en memoria vuelve a quedar como estaba.
base.tablas = {};
base.escrituras = [];
base.fallar = {};
base.seq = 0;
vi.mocked(perfilApi).mockReset();

describe("CIERRE Z5 · REPARO: «meta sin plan» donde se ve, en el tablero de la consultora y en su ruta, con el plan delante", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(HOY);
  });
  afterEach(() => { vi.useRealTimers(); });

  const planDe = () => base.tablas.actions as unknown as Parameters<typeof metaSinPlan>[1];

  it("las dos sondas corrieron sin tropezar: la página y la ruta de verdad pintaron el indicador (si no, lo de abajo no mediría nada)", () => {
    expect(SONDA.pagina.error).toBeNull();
    expect(SONDA.ruta.error).toBeNull();
  });

  it("el tablero pintado con las alertas que da el plan delante: una acción que apunta por indicador_id quita el rótulo; sin ninguna, el rótulo dice que nadie la persigue", () => {
    const k = completo({ id: IND, company_id: EMP, accion_asociada_id: null });
    const pintarCon = (acciones: Fila[]) => {
      const vista: KpiVista = { ...k, completitud: completitud(k), listo: listo(k).ok, alertas: alertas(k, HOY, acciones as unknown as Parameters<typeof alertas>[2]), avance: avance(k) };
      return renderToStaticMarkup(createElement(TableroKpis, { companyId: EMP, zona: "America/Lima", kpis: [vista], historia: [], participantes: [], acciones: [], lineasBase: [], propuestas: [] })).replace(/<!-- -->/g, "");
    };
    // NEGATIVA: con plan, ni rótulo ni lista de alertas.
    const conPlan = pintarCon([accionDelPlan({ indicador_id: IND })]);
    expect(conPlan).not.toContain("meta sin plan");
    expect(conPlan).not.toContain('aria-label="Alertas"');
    // POSITIVA: sin plan, el rótulo y la frase de quien sí miró el plan.
    expect(pintarCon([])).toContain(`meta sin plan</span> · ${NADIE_LA_PERSIGUE}`);
    expect(pintarCon([accionDelPlan({ indicador_id: IND, estado: "pospuesto" })])).toContain(`meta sin plan</span> · ${NADIE_LA_PERSIGUE}`);
  });

  for (const [p, sonda] of [[PAGINA, SONDA.pagina], [RUTA, SONDA.ruta]] as const) {
    it.skipIf(sonda.lee)(`HOY · PENDIENTE, FUERA DE LA LISTA DE ESTE REMATE · ${p.nombre} llama a alertas() sin el plan: rotula «meta sin plan» a un indicador que una acción persigue por indicador_id, y contradice a la regla que usa la revisión semanal`, async () => {
      sembrarTablero({ accion_asociada_id: null }, [accionDelPlan({ indicador_id: IND })]);
      // La regla única (la que usa la revisión semanal), con las mismas filas: hay plan.
      expect(metaSinPlan(kpiDe(), planDe())).toBeNull();
      // Y quien pinta lo rotula igual, con la frase de quien no miró el plan.
      expect(await p.metaSinPlan()).toBe(SIN_MIRAR_EL_PLAN);
    });

    it.runIf(sonda.lee)(
      `${sonda.lee ? "de punta a punta" : `SALTADA (${p.nombre} aún no le pasa las acciones del plan a alertas(); el cambio va en ${p.archivo})`} · ${p.nombre} mira el vínculo en sus dos sentidos y lee TODAS las acciones, también las rechazadas`,
      async () => {
        // 1 · NEGATIVA: una acción viva dice medirse con el indicador → no es meta sin plan.
        sembrarTablero({ accion_asociada_id: null }, [accionDelPlan({ indicador_id: IND })]);
        expect(await p.metaSinPlan()).toBeNull();
        // 2 · NEGATIVA: el otro sentido, el indicador nombra una acción viva → tampoco.
        sembrarTablero({ accion_asociada_id: ACC_VIVA }, [accionDelPlan()]);
        expect(await p.metaSinPlan()).toBeNull();
        // 3 · POSITIVA: nadie la persigue (ninguna acción, o la única apunta a otro indicador) → la frase de quien SÍ miró el plan.
        sembrarTablero({ accion_asociada_id: null }, []);
        expect(await p.metaSinPlan()).toBe(NADIE_LA_PERSIGUE);
        sembrarTablero({ accion_asociada_id: null }, [accionDelPlan({ indicador_id: IND_SEM })]);
        expect(await p.metaSinPlan()).toBe(NADIE_LA_PERSIGUE);
        // 4 · POSITIVA: la acción que nombra el indicador está rechazada → se dice cuál y cómo está. Solo sale si se
        // leen todas las acciones: con la lista del formulario (sin rechazadas ni descartadas) el tablero callaría.
        sembrarTablero({ accion_asociada_id: ACC_RECHAZADA }, [accionDelPlan({ id: ACC_RECHAZADA, accion: "Llamar a quien devuelve", estado: "rechazado" })]);
        expect(await p.metaSinPlan()).toBe("Tiene meta con plazo (2026-12-31) y la única acción ligada, «Llamar a quien devuelve», está rechazada: hoy nadie la persigue.");
        // 5 · Y si además otra acción viva apunta al indicador, vuelve a tener plan: lo mismo que dice la regla única.
        sembrarTablero({ accion_asociada_id: ACC_RECHAZADA }, [accionDelPlan({ id: ACC_RECHAZADA, estado: "rechazado" }), accionDelPlan({ indicador_id: IND })]);
        expect(metaSinPlan(kpiDe(), planDe())).toBeNull();
        expect(await p.metaSinPlan()).toBeNull();
      }
    );
  }
});
