/**
 * EL PLAN DE INTERVENCIÓN: LAS REGLAS, SIN BASE (R12.1, R12.2, R12.3).
 *
 * Hasta el 13-10-2026 una acción del plan pasaba de «pendiente» a «hecho» con un select y sin prueba, el
 * planificador borraba las pendientes en cada corrida, el responsable era un texto y nadie sabía quién
 * había decidido qué. Aquí se prueba la regla pura de src/lib/plan-intervencion.ts: la tabla de transiciones
 * completa (lo que se puede y lo que no), que verificar sin prueba falla con su mensaje, que el límite de
 * frentes bloquea la cuarta prioridad y dice cuáles están abiertas, que `queLeFalta` lista los seis
 * mínimos de una acción vacía, que rechazar sin motivo falla, y que la reconciliación del planificador
 * pospone en lugar de borrar.
 *
 * Al final, LA CAPA QUE TOCA LA BASE con dobles de `supabaseAdmin()` (no hay base real aquí: la real es
 * Postgres embebido en tests/sql/plan.test.ts, que prueba el esquema, los checks y la RLS): `aplicarTransicion`
 * corta antes de escribir cuando la regla no se cumple, escribe acción + historial cuando sí, revierte la
 * acción si el historial no entra, y `cargarPlan` falla en voz alta si no puede leer el historial.
 *
 * REMATE P (13-10-2026), EL PLAN SIN PUERTAS TRASERAS. Tres cosas que los refutadores encontraron abiertas:
 * el PATCH heredado de api/companies/[id]/evidencia dejaba que un dueño verificara su propia acción sin
 * transición ni historial (aquí se llama a la ruta DE VERDAD, con `protegido()` real y dobles de sesión y
 * base); la marca de prioridad se ponía después de aprobar y el límite de frentes no se enteraba; y los
 * cortes imprimían JSON crudo al dueño.
 *
 * SEGUNDA VUELTA DEL REMATE P. El verificador encontró que el límite seguía abierto por «bloqueado» (aprobar
 * sin marca, bloquear, marcar prioridad y desbloquear) y que `indicadoresLegibles` todavía devolvía JSON como
 * si fuera legible cuando venía metido como texto. Aquí: la secuencia entera, en la regla pura y con dobles;
 * una prueba que recorre TRANSICIONES y exige que toda entrada a un estado abierto cuente frentes; los casos
 * de JSON que el verificador ejecutó; y components/Plan.tsx y cliente/Evidencia.tsx declarados huérfanos con
 * una prueba que lo comprueba (no se borran: no borrar archivos es regla de esta tanda).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

type Fila = Record<string, unknown>;
type Operacion = "select" | "update" | "insert";
const base = vi.hoisted(() => ({
  tablas: {} as Record<string, Fila[]>,
  escrituras: [] as { tabla: string; op: Operacion; datos: Fila }[],
  fallar: {} as Record<string, { op: Operacion; mensaje: string } | undefined>,
  seq: 0,
}));

vi.mock("@/lib/supabase/admin", () => {
  // Un doble de PostgREST en memoria: filtra con los .eq/.in/.not/.gt recibidos, aplica update sobre las
  // filas filtradas, inserta con id y created_at crecientes, y registra cada escritura para que la prueba
  // pueda afirmar «no se escribió nada». `base.fallar[tabla]` hace fallar una operación con un mensaje.
  type Resultado = { data: Fila[] | null; error: { message: string } | null; count: number | null };
  const consulta = (tabla: string) => {
    const filtros: ((f: Fila) => boolean)[] = [];
    let modo: Operacion = "select";
    let cuerpo: Fila = {};
    let soloConteo = false;
    let insertada: Fila | null = null;
    const filas = () => (base.tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
    const ejecutar = (): Resultado => {
      const fallo = base.fallar[tabla];
      if (fallo && fallo.op === modo) return { data: null, error: { message: fallo.mensaje }, count: null };
      if (modo === "update") {
        const objetivo = filas();
        for (const f of objetivo) Object.assign(f, cuerpo);
        base.escrituras.push({ tabla, op: "update", datos: { ...cuerpo, _ids: objetivo.map((f) => f.id) } });
        return { data: objetivo, error: null, count: null };
      }
      if (modo === "insert") return { data: insertada ? [insertada] : [], error: null, count: null };
      const d = filas();
      return { data: soloConteo ? null : d, error: null, count: d.length };
    };
    const q = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => { soloConteo = Boolean(opts?.head); return q; },
      order: () => q,
      limit: () => q,
      eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[k])); return q; },
      not: (k: string, _op: string, v: unknown) => { filtros.push((f) => f[k] != null && f[k] !== v); return q; },
      gt: (k: string, v: unknown) => { filtros.push((f) => String(f[k]) > String(v)); return q; },
      update: (datos: Fila) => { modo = "update"; cuerpo = datos; return q; },
      insert: (datos: Fila) => {
        modo = "insert";
        const fallo = base.fallar[tabla];
        if (!(fallo && fallo.op === "insert")) {
          base.seq += 1;
          insertada = { id: `${tabla}-${base.seq}`, created_at: new Date(Date.UTC(2026, 9, 13, 12, 0, base.seq)).toISOString(), ...datos };
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
// Para llamar a la ruta de evidencia con el `protegido()` real: la sesión es la que la prueba diga, el
// rastro de auditoría se espía (no se escribe en la base doble) y el cupo de peticiones siempre deja pasar.
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));

import {
  ESTADOS, EVENTOS, TRANSICIONES, ROLES_POR_EVENTO, ESTADO_CLIENTE, ESTADO_CONSULTOR, VERBO_PASADO_CLIENTE, ERROR_SIN_EVIDENCIA, MOTIVO_NO_APARECE,
  ERROR_SIN_FRENTES_QUE_CONTAR, ERROR_SIN_FRENTES_AL_DESBLOQUEAR, ERROR_SIN_FRENTES_AL_APROBAR, ERROR_MARCA_DE_PRIORIDAD, SALIDA_FRENTES, ESTADOS_ABIERTOS, CORTE_CON_NUMEROS_SIN_DETALLE, CORTE_CON_NUMEROS_ILEGIBLES,
  accionVacia, estadoCanonico, transicion, queLeFalta, limiteFrentes, frentesAbiertos, abreFrenteAlModificar, abreFrenteAlDesbloquear, abreFrenteAlAprobar, marcaDePrioridad, validarMotivo, validarModificacion, autoridadNecesaria,
  resolverResponsable, reconciliarPropuesta, fechasDeFrente, normalizar, indicadoresLegibles,
  aplicarTransicion, modificarAccion, cargarPlan, ReglaDelPlan,
  type AccionPlan, type Estado, type Evento, type Actor,
} from "@/lib/plan-intervencion";
import { AccesoDenegado, perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { PATCH as verificarConEvidencia } from "@/app/api/companies/[id]/evidencia/route";
import { POST as pedirTransicion } from "@/app/api/actions/[id]/transicion/route";
import { POST as registrarCorte } from "@/app/api/companies/[id]/close/route";

const EMP = "0000000a-0000-4000-8000-00000000000a";
const CONSULTORA: Actor = { id: "22222222-2222-4222-8222-222222222222", rol: "consultor" };
const DUENO: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "cliente" };
const SISTEMA: Actor = { id: null, rol: "sistema" };
const AHORA = new Date("2026-10-13T12:00:00Z");

/** Una acción completa: pasa `queLeFalta` y se puede aprobar. */
function completa(estado: string, extra: Partial<AccionPlan> = {}): AccionPlan {
  return accionVacia({
    id: "a1000000-0000-4000-8000-000000000001", company_id: EMP, accion: "Cotizar sin el dueño", estado,
    objetivo_empresarial: "Que la venta no dependa del dueño", resultado_esperado: "7 de cada 10 cotizaciones salen sin él",
    responsable_participant_id: "p1000000-0000-4000-8000-000000000001", fecha_inicio: "2026-10-20", vence_at: "2026-11-10",
    criterio_aceptacion: "Diez cotizaciones firmadas por Carlos", kpi: "Cotizaciones sin el dueño, de cada 10", es_prioridad: true,
    ...extra,
  });
}

const EXIGEN_MOTIVO_E_IMPLICA: Evento[] = ["rechazar", "posponer", "modificar"];

/** Datos suficientes para que cada evento pase sus propios candados y la prueba mida solo la tabla. */
function datosPara(evento: Evento) {
  return {
    ahora: AHORA,
    motivo: "motivo suficiente de ocho letras",
    implica: EXIGEN_MOTIVO_E_IMPLICA.includes(evento) ? "corre el plazo una semana" : undefined,
    evidencia: evento === "verificar" ? { pruebas: 1, indicadorPosterior: false } : undefined,
    estadoPrevio: evento === "desbloquear" ? ("en_ejecucion" as Estado) : undefined,
    cambios: evento === "modificar" ? { recursos: "una laptop" } : undefined,
    // Aprobar o desbloquear una prioridad cuenta frentes: aquí no hay ninguna otra abierta, así que cabe.
    frentes: evento === "desbloquear" || evento === "aprobar" ? { acciones: [], limite: 3 } : undefined,
  };
}

describe("la tabla de transiciones, completa: lo permitido y lo prohibido", () => {
  const esperado: Record<Estado, Partial<Record<Evento, Estado>>> = {
    propuesto: { aprobar: "aprobado", rechazar: "rechazado", posponer: "pospuesto", modificar: "propuesto", escalar: "propuesto", comentar: "propuesto" },
    aprobado: { iniciar: "en_ejecucion", bloquear: "bloqueado", posponer: "pospuesto", modificar: "aprobado", escalar: "aprobado", comentar: "aprobado" },
    en_ejecucion: { reportar: "reportado", bloquear: "bloqueado", modificar: "en_ejecucion", escalar: "en_ejecucion", comentar: "en_ejecucion" },
    reportado: { verificar: "verificado", rechazar_verificacion: "en_ejecucion", escalar: "reportado", comentar: "reportado" },
    bloqueado: { desbloquear: "en_ejecucion", modificar: "bloqueado", escalar: "bloqueado", comentar: "bloqueado" },
    verificado: { comentar: "verificado" },
    rechazado: { comentar: "rechazado" },
    pospuesto: { proponer: "propuesto", comentar: "pospuesto" },
  };

  for (const estado of ESTADOS) {
    for (const evento of EVENTOS) {
      const destino = esperado[estado][evento];
      const permitido = destino !== undefined;
      it(`${estado} + ${evento} → ${permitido ? destino : "NO se puede"}`, () => {
        const r = transicion(completa(estado), evento, CONSULTORA, datosPara(evento));
        if (permitido) {
          expect(r.ok, r.ok ? "" : r.error).toBe(true);
          if (r.ok) {
            expect(r.estado).toBe(destino);
            expect(r.historial.accion).toBe(evento);
            expect(r.historial.antes).toMatchObject({ estado });
            expect(r.historial.despues).toMatchObject({ estado: destino });
            expect(r.historial.actor_id).toBe(CONSULTORA.id);
            expect(r.historial.actor_rol).toBe("consultor");
          }
        } else {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error).toMatch(/no se puede .*\. Se puede: /);
        }
      });
    }
  }

  it("la tabla del código y la de esta prueba coinciden celda a celda (ninguna transición escondida)", () => {
    for (const estado of ESTADOS) {
      expect(Object.keys(TRANSICIONES[estado]).sort()).toEqual(Object.keys(esperado[estado]).sort());
    }
  });

  it("el error de una transición prohibida dice qué sí se puede", () => {
    const r = transicion(completa("verificado"), "aprobar", CONSULTORA, { ahora: AHORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Una acción verificada no se puede aprobar. Se puede: comentar.");
  });

  it("desbloquear vuelve al estado previo que diga el historial; sin rastro, no se adivina", () => {
    const bloqueada = completa("bloqueado");
    const vuelta = transicion(bloqueada, "desbloquear", CONSULTORA, { estadoPrevio: "aprobado", frentes: { acciones: [bloqueada], limite: 3 }, ahora: AHORA });
    expect(vuelta.ok && vuelta.estado).toBe("aprobado");
    expect(vuelta.ok && vuelta.cambios).toMatchObject({ bloqueo: null, bloqueado_at: null, estado: "aprobado" });
    const sinRastro = transicion(bloqueada, "desbloquear", CONSULTORA, { ahora: AHORA });
    expect(sinRastro.ok).toBe(false);
    if (!sinRastro.ok) expect(sinRastro.error).toMatch(/no hay rastro del bloqueo/);
  });
});

describe("quién puede qué", () => {
  it("el dueño reporta, comenta, inicia, bloquea, desbloquea y escala; no aprueba, rechaza, pospone, modifica ni verifica", () => {
    expect(ROLES_POR_EVENTO.reportar).toContain("cliente");
    expect(ROLES_POR_EVENTO.comentar).toContain("cliente");
    for (const e of ["aprobar", "rechazar", "modificar", "verificar", "rechazar_verificacion"] as Evento[]) expect(ROLES_POR_EVENTO[e]).toEqual(["consultor"]);
    // Posponer también lo hace el planificador (lo que ya no propone), nunca el dueño.
    expect(ROLES_POR_EVENTO.posponer).toEqual(["consultor", "sistema"]);
    const r = transicion(completa("propuesto"), "aprobar", DUENO, { ahora: AHORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Solo la consultora puede aprobar.");
    const v = transicion(completa("reportado"), "verificar", DUENO, { evidencia: { pruebas: 3, indicadorPosterior: true }, ahora: AHORA });
    expect(v.ok).toBe(false);
  });
  it("el planificador (sistema) solo propone y pospone", () => {
    expect(transicion(completa("propuesto"), "posponer", SISTEMA, { motivo: MOTIVO_NO_APARECE, implica: "sale de la propuesta", ahora: AHORA }).ok).toBe(true);
    expect(transicion(completa("pospuesto"), "proponer", SISTEMA, { motivo: "vuelve a aparecer en la propuesta", ahora: AHORA }).ok).toBe(true);
    const r = transicion(completa("propuesto"), "aprobar", SISTEMA, { ahora: AHORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/«sistema» no puede aprobar/);
  });
  it("aprobar y verificar piden la autoridad aprobar_plan; modificar o posponer algo ya decidido también; completar una propuesta no", () => {
    expect(autoridadNecesaria("aprobar", "propuesto")).toBe("aprobar_plan");
    expect(autoridadNecesaria("verificar", "reportado")).toBe("aprobar_plan");
    expect(autoridadNecesaria("modificar", "aprobado")).toBe("aprobar_plan");
    expect(autoridadNecesaria("posponer", "aprobado")).toBe("aprobar_plan");
    expect(autoridadNecesaria("modificar", "propuesto")).toBeNull();
    expect(autoridadNecesaria("reportar", "en_ejecucion")).toBeNull();
    expect(autoridadNecesaria("comentar", "verificado")).toBeNull();
  });
});

describe("reportado no es verificado", () => {
  it("verificar sin prueba falla con el mensaje exacto", () => {
    const sinDatos = transicion(completa("reportado"), "verificar", CONSULTORA, { ahora: AHORA });
    expect(sinDatos.ok).toBe(false);
    if (!sinDatos.ok) expect(sinDatos.error).toBe(ERROR_SIN_EVIDENCIA);
    const cero = transicion(completa("reportado"), "verificar", CONSULTORA, { evidencia: { pruebas: 0, indicadorPosterior: false }, ahora: AHORA });
    expect(cero.ok).toBe(false);
    if (!cero.ok) expect(cero.error).toBe("reportado no es verificado: falta evidencia");
  });
  it("una prueba subida o un valor del indicador posterior al reporte sí verifican, y queda quién y cuándo", () => {
    const conFoto = transicion(completa("reportado"), "verificar", CONSULTORA, { evidencia: { pruebas: 1, indicadorPosterior: false }, ahora: AHORA });
    expect(conFoto.ok && conFoto.cambios).toMatchObject({ estado: "verificado", verificado_por: CONSULTORA.id, verificado_at: AHORA.toISOString() });
    const conIndicador = transicion(completa("reportado"), "verificar", CONSULTORA, { evidencia: { pruebas: 0, indicadorPosterior: true }, ahora: AHORA });
    expect(conIndicador.ok).toBe(true);
  });
  it("reportar deja fecha, quién y la prueba que acompaña; el estado es reportado, nunca verificado", () => {
    const r = transicion(completa("en_ejecucion"), "reportar", DUENO, { evidenciaId: "e1000000-0000-4000-8000-000000000001", ahora: AHORA });
    expect(r.ok && r.estado).toBe("reportado");
    expect(r.ok && r.cambios).toMatchObject({ reportado_por: DUENO.id, reportado_at: AHORA.toISOString() });
    expect(r.ok && r.historial.despues).toMatchObject({ evidencia_id: "e1000000-0000-4000-8000-000000000001" });
    expect(r.ok && "verificado_at" in r.cambios).toBe(false);
  });
  it("el dueño lee «Enviado para revisar» donde la consultora lee «Reportada»; «hecho» viejo sin prueba es reportado, con prueba verificado", () => {
    expect(ESTADO_CLIENTE.reportado).toBe("Enviado para revisar");
    expect(ESTADO_CONSULTOR.reportado).toBe("Reportada");
    expect(estadoCanonico({ estado: "hecho" })).toBe("reportado");
    expect(estadoCanonico({ estado: "hecho", verificado_at: "2026-10-01T00:00:00Z" })).toBe("verificado");
    expect(estadoCanonico({ estado: "pendiente" })).toBe("propuesto");
    expect(estadoCanonico({ estado: "en_curso" })).toBe("en_ejecucion");
    expect(estadoCanonico({ estado: "descartado" })).toBe("rechazado");
  });
});

describe("de 3 a 5 prioridades abiertas", () => {
  const abierta = (n: number, estado: string) => completa(estado, { id: `a${n}000000-0000-4000-8000-00000000000${n}`, accion: `Frente ${n}` });
  it("con límite 3 y tres prioridades abiertas, la cuarta no se aprueba y el mensaje dice cuáles están abiertas", () => {
    const acciones = [abierta(1, "aprobado"), abierta(2, "en_ejecucion"), abierta(3, "reportado"), abierta(4, "propuesto")];
    const v = limiteFrentes(acciones, 3, acciones[3]);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.abiertas).toBe(3);
      expect(v.error).toContain("«Frente 1»");
      expect(v.error).toContain("«Frente 2»");
      expect(v.error).toContain("«Frente 3»");
      expect(v.error).toMatch(/límite es 3/);
    }
    const r = transicion(acciones[3], "aprobar", CONSULTORA, { frentes: { acciones, limite: 3 }, ahora: AHORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Ya hay 3 prioridades abiertas/);
  });
  it("lo verificado, bloqueado, pospuesto o rechazado no ocupa frente; con límite 5 la cuarta sí entra", () => {
    const acciones = [abierta(1, "aprobado"), abierta(2, "verificado"), abierta(3, "bloqueado"), abierta(4, "rechazado"), abierta(5, "propuesto")];
    expect(limiteFrentes(acciones, 3, acciones[4])).toMatchObject({ ok: true, abiertas: 1 });
    const cuatro = [abierta(1, "aprobado"), abierta(2, "aprobado"), abierta(3, "aprobado"), abierta(4, "propuesto")];
    expect(limiteFrentes(cuatro, 5, cuatro[3]).ok).toBe(true);
  });
  it("una acción que no es prioridad no cuenta ni se bloquea", () => {
    const acciones = [abierta(1, "aprobado"), abierta(2, "aprobado"), abierta(3, "aprobado"), abierta(4, "aprobado")];
    expect(limiteFrentes(acciones, 3, { id: "x", es_prioridad: false }).ok).toBe(true);
    const secundaria = completa("propuesto", { id: "a9000000-0000-4000-8000-000000000009", es_prioridad: false });
    expect(transicion(secundaria, "aprobar", CONSULTORA, { frentes: { acciones, limite: 3 }, ahora: AHORA }).ok).toBe(true);
  });

  describe("la marca de prioridad puesta DESPUÉS de aprobar pasa por el mismo límite (antes entraba por la ficha)", () => {
    const POR_QUE = { motivo: "el dueño la quiere primero", implica: "ocupa un frente más", ahora: AHORA };
    const colada = (estado: string) => completa(estado, { id: "a4000000-0000-4000-8000-000000000004", accion: "Frente 4", es_prioridad: false });
    const tresAbiertas = (cuarta: AccionPlan) => [abierta(1, "aprobado"), abierta(2, "en_ejecucion"), abierta(3, "reportado"), cuarta];

    it("abreFrenteAlModificar: solo cuando el cambio pone la marca en verdadero y la acción está aprobada, en ejecución o reportada", () => {
      for (const e of ["aprobado", "en_ejecucion", "reportado"] as Estado[]) expect(abreFrenteAlModificar(e, { es_prioridad: true })).toBe(true);
      // Bloqueada tampoco cuenta AQUÍ (lo bloqueado no ocupa frente): el límite se le cobra al desbloquear, más abajo.
      for (const e of ["propuesto", "bloqueado", "verificado", "rechazado", "pospuesto"] as Estado[]) expect(abreFrenteAlModificar(e, { es_prioridad: true })).toBe(false);
      expect(abreFrenteAlModificar("aprobado", { es_prioridad: false })).toBe(false);
      expect(abreFrenteAlModificar("aprobado", { vence_at: "2026-11-24" })).toBe(false);
      expect(abreFrenteAlModificar("aprobado", null)).toBe(false);
    });

    it("NEGATIVA: con el límite lleno, una acción aprobada o en ejecución sin la marca no se vuelve prioridad, y el mensaje nombra las tres abiertas", () => {
      for (const estado of ["aprobado", "en_ejecucion"]) {
        const a = colada(estado);
        const r = transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: true }, frentes: { acciones: tresAbiertas(a), limite: 3 } });
        expect(r.ok, estado).toBe(false);
        // El mismo mensaje, letra por letra, que da aprobar una cuarta prioridad.
        const alAprobar = limiteFrentes(tresAbiertas(a), 3, { id: a.id, es_prioridad: true });
        if (!r.ok && !alAprobar.ok) {
          expect(r.error).toBe(alAprobar.error);
          expect(r.error).toMatch(/Ya hay 3 prioridades abiertas y el límite es 3: «Frente 1», «Frente 2», «Frente 3»/);
        }
      }
    });

    it("NEGATIVA: si viene con otros cambios, se rechaza todo (no se cuela el plazo con la marca) y sin las acciones de la empresa no se marca", () => {
      const a = colada("aprobado");
      const junto = transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: true, vence_at: "2026-11-24" }, frentes: { acciones: tresAbiertas(a), limite: 3 } });
      expect(junto.ok).toBe(false);
      const sinContar = transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: true } });
      expect(sinContar.ok).toBe(false);
      if (!sinContar.ok) expect(sinContar.error).toBe(ERROR_SIN_FRENTES_QUE_CONTAR);
    });

    it("POSITIVA: con sitio (límite 5, o una de las tres ya cerrada) la marca entra y el historial guarda el antes y el después", () => {
      const a = colada("aprobado");
      const conLimite5 = transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: true }, frentes: { acciones: tresAbiertas(a), limite: 5 } });
      expect(conLimite5.ok).toBe(true);
      if (conLimite5.ok) {
        expect(conLimite5.cambios.es_prioridad).toBe(true);
        expect(conLimite5.estado).toBe("aprobado");
        expect(conLimite5.historial.antes).toEqual({ estado: "aprobado", es_prioridad: false });
        expect(conLimite5.historial.despues).toMatchObject({ estado: "aprobado", es_prioridad: true });
      }
      const unaCerrada = [abierta(1, "aprobado"), abierta(2, "en_ejecucion"), abierta(3, "verificado"), a];
      expect(transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: true }, frentes: { acciones: unaCerrada, limite: 3 } }).ok).toBe(true);
    });

    it("POSITIVA: lo que no abre un frente no se bloquea: quitar la marca, tocar otro campo de una prioridad ya abierta, o marcar una propuesta (su límite llega al aprobarla)", () => {
      const llenas = [abierta(1, "aprobado"), abierta(2, "en_ejecucion"), abierta(3, "reportado")];
      // Quitar la marca libera un frente: nunca necesita contar.
      expect(transicion(llenas[0], "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: false } }).ok).toBe(true);
      // Una de las tres abiertas cambia su plazo: ya ocupaba su frente.
      expect(transicion(llenas[1], "modificar", CONSULTORA, { ...POR_QUE, cambios: { vence_at: "2026-11-24" }, frentes: { acciones: llenas, limite: 3 } }).ok).toBe(true);
      // Una propuesta se marca sin contar; al aprobarla, el límite la para.
      const propuesta = colada("propuesto");
      const marcada = transicion(propuesta, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: true } });
      expect(marcada.ok).toBe(true);
      const yaMarcada = { ...propuesta, es_prioridad: true };
      const alAprobar = transicion(yaMarcada, "aprobar", CONSULTORA, { frentes: { acciones: [...llenas, yaMarcada], limite: 3 }, ahora: AHORA });
      expect(alAprobar.ok).toBe(false);
      if (!alAprobar.ok) expect(alAprobar.error).toMatch(/Ya hay 3 prioridades abiertas/);
    });
  });

  describe("CIERRE Z5 · la marca de prioridad se lee como sí o no, llegue como llegue, y lo que no se entiende se rechaza", () => {
    const POR_QUE = { motivo: "el dueño la quiere primero", implica: "ocupa un frente más", ahora: AHORA };
    const colada = () => completa("aprobado", { id: "a4000000-0000-4000-8000-000000000004", accion: "Frente 4", es_prioridad: false });
    const llenas = (cuarta: AccionPlan) => [abierta(1, "aprobado"), abierta(2, "en_ejecucion"), abierta(3, "reportado"), cuarta];

    it("marcaDePrioridad: sí y no en las formas que la base acepta para un booleano; lo demás no se adivina", () => {
      for (const si of [true, "true", "TRUE", " t ", "1", 1, "yes", "on", "sí"]) expect(marcaDePrioridad(si), JSON.stringify(si)).toBe(true);
      for (const no of [false, "false", "f", "0", 0, "no", "off"]) expect(marcaDePrioridad(no), JSON.stringify(no)).toBe(false);
      for (const raro of [null, undefined, "", "quizá", 2, -1, {}, [], Number.NaN]) expect(marcaDePrioridad(raro), JSON.stringify(raro)).toBeNull();
    });

    it("NEGATIVA: un «true» escrito como texto, o un 1, ya no se cuela por delante del límite (antes solo contaba el true exacto)", () => {
      for (const disfrazada of ["true", "t", "1", 1, "TRUE"]) {
        expect(abreFrenteAlModificar("aprobado", { es_prioridad: disfrazada }), JSON.stringify(disfrazada)).toBe(true);
        const a = colada();
        const r = transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: disfrazada }, frentes: { acciones: llenas(a), limite: 3 } });
        expect(r.ok, JSON.stringify(disfrazada)).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/Ya hay 3 prioridades abiertas y el límite es 3: «Frente 1», «Frente 2», «Frente 3»/);
        // Y sin las acciones de la empresa delante tampoco pasa: es la misma marca.
        const sinContar = transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: disfrazada } });
        expect(!sinContar.ok && sinContar.error).toBe(ERROR_SIN_FRENTES_QUE_CONTAR);
      }
    });

    it("POSITIVA: con sitio entra, y lo que se escribe y queda en el historial es un sí de verdad, no el texto que llegó", () => {
      const a = colada();
      const r = transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: "true" }, frentes: { acciones: llenas(a), limite: 5 } });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.cambios.es_prioridad).toBe(true);
        expect(r.historial.despues).toMatchObject({ es_prioridad: true });
      }
      // Un «false» en texto quita la marca sin contar, y queda escrito como un no.
      const quitar = transicion(abierta(1, "aprobado"), "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: "false" } });
      expect(quitar.ok && quitar.cambios.es_prioridad).toBe(false);
      expect(abreFrenteAlModificar("aprobado", { es_prioridad: "false" })).toBe(false);
      expect(abreFrenteAlModificar("aprobado", { es_prioridad: 0 })).toBe(false);
      // Pedir «true» sobre una que ya es prioridad no es un cambio: no se escribe un texto encima del sí.
      const igual = transicion(abierta(1, "aprobado"), "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: "true" } });
      expect(!igual.ok && igual.error).toMatch(/Para modificar hay que cambiar algo/);
    });

    it("NEGATIVA: lo que no es ni sí ni no se rechaza con su mensaje, en cualquier estado y aunque venga con otros cambios; nada se cuela", () => {
      for (const raro of [null, "quizá", 2, {}, []]) {
        // Ante la duda cuenta como si marcara (la capa de base lee las acciones), y la regla lo rechaza antes de contar.
        expect(abreFrenteAlModificar("aprobado", { es_prioridad: raro }), JSON.stringify(raro)).toBe(true);
        for (const estado of ["propuesto", "aprobado", "bloqueado"]) {
          const a = completa(estado, { id: "a4000000-0000-4000-8000-000000000004", es_prioridad: false });
          const r = transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: raro, vence_at: "2026-11-24" }, frentes: { acciones: [], limite: 5 } });
          expect(r, `${estado} ${JSON.stringify(raro)}`).toEqual({ ok: false, error: ERROR_MARCA_DE_PRIORIDAD });
        }
      }
      // Un cambio que no trae la marca (o la trae sin valor) no abre nada.
      expect(abreFrenteAlModificar("aprobado", { es_prioridad: undefined })).toBe(false);
      expect(abreFrenteAlModificar("aprobado", {})).toBe(false);
    });
  });

  describe("CIERRE Z5 · la misma regla en los tres caminos: lo que abre un frente se cuenta, y sin con qué contar no pasa", () => {
    const POR_QUE = { motivo: "el dueño la quiere primero", implica: "ocupa un frente más", ahora: AHORA };

    it("NEGATIVA: aprobar una prioridad sin las acciones de la empresa delante NO pasa (antes pasaba sin contar, al revés que modificar y desbloquear)", () => {
      const prioridad = completa("propuesto");
      expect(abreFrenteAlAprobar(prioridad)).toBe(true);
      expect(transicion(prioridad, "aprobar", CONSULTORA, { ahora: AHORA })).toEqual({ ok: false, error: ERROR_SIN_FRENTES_AL_APROBAR });
      // Los otros dos caminos ya respondían así; los tres dicen lo mismo, cada uno con su final.
      const abierta4 = completa("aprobado", { es_prioridad: false });
      expect(transicion(abierta4, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: true } })).toEqual({ ok: false, error: ERROR_SIN_FRENTES_QUE_CONTAR });
      expect(transicion(completa("bloqueado"), "desbloquear", CONSULTORA, { estadoPrevio: "aprobado", ahora: AHORA })).toEqual({ ok: false, error: ERROR_SIN_FRENTES_AL_DESBLOQUEAR });
      for (const e of [ERROR_SIN_FRENTES_AL_APROBAR, ERROR_SIN_FRENTES_QUE_CONTAR, ERROR_SIN_FRENTES_AL_DESBLOQUEAR]) expect(e).toMatch(/^No se pudo contar cuántas prioridades hay abiertas, así que esta /);
    });

    it("POSITIVA: lo que no abre frente no necesita contar en ninguno de los tres; y con las acciones delante, la prioridad se aprueba si cabe", () => {
      const secundaria = completa("propuesto", { es_prioridad: false });
      expect(abreFrenteAlAprobar(secundaria)).toBe(false);
      expect(transicion(secundaria, "aprobar", CONSULTORA, { ahora: AHORA }).ok).toBe(true);
      expect(transicion(completa("aprobado"), "modificar", CONSULTORA, { ...POR_QUE, cambios: { vence_at: "2026-11-24" } }).ok).toBe(true);
      expect(transicion(completa("bloqueado", { es_prioridad: false }), "desbloquear", CONSULTORA, { estadoPrevio: "aprobado", ahora: AHORA }).ok).toBe(true);
      const prioridad = completa("propuesto");
      expect(transicion(prioridad, "aprobar", CONSULTORA, { frentes: { acciones: [prioridad], limite: 3 }, ahora: AHORA }).ok).toBe(true);
      // Una falta de la ficha se dice antes que el límite: primero qué le falta, después si cabe.
      const incompleta = transicion(completa("propuesto", { objetivo_empresarial: null }), "aprobar", CONSULTORA, { ahora: AHORA });
      expect(!incompleta.ok && incompleta.error).toMatch(/Todavía no se puede aprobar\. Falta:/);
    });
  });

  describe("desbloquear una prioridad vuelve a abrir su frente: el límite se cobra a la salida (la puerta que quedaba por «bloqueado»)", () => {
    const POR_QUE = { motivo: "el dueño la quiere primero", implica: "ocupa un frente más", ahora: AHORA };
    const ID_4 = "a4000000-0000-4000-8000-000000000004";
    const tres = () => [abierta(1, "aprobado"), abierta(2, "en_ejecucion"), abierta(3, "reportado")];
    const PRINCIPIO = "Ya hay 3 prioridades abiertas y el límite es 3: «Frente 1», «Frente 2», «Frente 3». ";
    /** Aplica a la acción lo que la regla devolvió, como hace escribirTransicion sobre la fila. */
    const tras = (a: AccionPlan, r: ReturnType<typeof transicion>): AccionPlan => {
      if (!r.ok) throw new Error(r.error);
      return { ...a, ...(r.cambios as Partial<AccionPlan>) };
    };

    it("abreFrenteAlDesbloquear: solo una prioridad que vuelve a aprobada, en ejecución o reportada", () => {
      for (const previo of ESTADOS_ABIERTOS) expect(abreFrenteAlDesbloquear({ es_prioridad: true }, previo)).toBe(true);
      for (const previo of ["propuesto", "bloqueado", "verificado", "rechazado", "pospuesto", null, undefined] as (Estado | null | undefined)[]) {
        expect(abreFrenteAlDesbloquear({ es_prioridad: true }, previo)).toBe(false);
      }
      for (const previo of ESTADOS_ABIERTOS) expect(abreFrenteAlDesbloquear({ es_prioridad: false }, previo)).toBe(false);
    });

    it("NEGATIVA, la secuencia entera del reparo: aprobada sin marca → bloquear → marcar prioridad → desbloquear NO deja una cuarta prioridad abierta con límite 3, la desbloquee la consultora o el dueño", () => {
      for (const desde of ["aprobado", "en_ejecucion"] as Estado[]) {
        // 1. Aprobada (o ya en marcha) sin la marca: no cuenta, entra siempre.
        let a = completa(desde, { id: ID_4, accion: "Frente 4", es_prioridad: false });
        // 2. Se bloquea: deja de estar abierta.
        a = tras(a, transicion(a, "bloquear", DUENO, { motivo: "falta la llave del almacén", ahora: AHORA }));
        expect(a.estado).toBe("bloqueado");
        // 3. Bloqueada, se marca prioridad: todavía no ocupa frente, así que entra sin contar.
        a = tras(a, transicion(a, "modificar", CONSULTORA, { ...POR_QUE, cambios: { es_prioridad: true } }));
        expect(a).toMatchObject({ estado: "bloqueado", es_prioridad: true });
        // 4. Desbloquear la devolvería a un estado abierto: aquí se cobra el límite.
        const frentes = { acciones: [...tres(), a], limite: 3 };
        const consultora = transicion(a, "desbloquear", CONSULTORA, { estadoPrevio: desde, frentes, ahora: AHORA });
        const dueno = transicion(a, "desbloquear", DUENO, { estadoPrevio: desde, frentes, ahora: AHORA });
        expect(consultora, desde).toEqual({ ok: false, error: PRINCIPIO + SALIDA_FRENTES.desbloquear });
        // Al dueño se le nombra lo mismo, pero no se le manda a quitar una marca que no está en su pantalla.
        expect(dueno, desde).toEqual({ ok: false, error: PRINCIPIO + SALIDA_FRENTES.desbloquear_cliente });
        expect(SALIDA_FRENTES.desbloquear_cliente).not.toMatch(/marca de prioridad|aprobar/);
        // Lo que importa: siguen siendo tres las abiertas.
        expect(frentesAbiertos(frentes.acciones).map((x) => x.accion)).toEqual(["Frente 1", "Frente 2", "Frente 3"]);
      }
    });

    it("NEGATIVA: también el caso sin trampa (se bloqueó una de tres y se aprobó otra en su sitio), y sin las acciones de la empresa delante no se desbloquea", () => {
      const bloqueada = completa("bloqueado", { id: "a3000000-0000-4000-8000-000000000003", accion: "Frente 3" });
      const acciones = [abierta(1, "aprobado"), abierta(2, "en_ejecucion"), bloqueada, abierta(4, "aprobado")];
      const r = transicion(bloqueada, "desbloquear", CONSULTORA, { estadoPrevio: "en_ejecucion", frentes: { acciones, limite: 3 }, ahora: AHORA });
      expect(r).toEqual({ ok: false, error: `Ya hay 3 prioridades abiertas y el límite es 3: «Frente 1», «Frente 2», «Frente 4». ${SALIDA_FRENTES.desbloquear}` });
      const sinContar = transicion(bloqueada, "desbloquear", DUENO, { estadoPrevio: "en_ejecucion", ahora: AHORA });
      expect(sinContar).toEqual({ ok: false, error: ERROR_SIN_FRENTES_AL_DESBLOQUEAR });
    });

    it("POSITIVA: con sitio vuelve a su estado previo y suelta el bloqueo; lo que no es prioridad, o vuelve a propuesta, se desbloquea sin contar", () => {
      const a = completa("bloqueado", { id: ID_4, accion: "Frente 4", bloqueo: "falta la llave del almacén", bloqueado_at: AHORA.toISOString() });
      const conHueco = [abierta(1, "aprobado"), abierta(2, "en_ejecucion"), abierta(3, "verificado"), a];
      const cabe = transicion(a, "desbloquear", DUENO, { estadoPrevio: "en_ejecucion", frentes: { acciones: conHueco, limite: 3 }, ahora: AHORA });
      expect(cabe.ok && cabe.estado).toBe("en_ejecucion");
      expect(cabe.ok && cabe.cambios).toMatchObject({ estado: "en_ejecucion", bloqueo: null, bloqueado_at: null });
      expect(cabe.ok && cabe.historial).toMatchObject({ accion: "desbloquear", antes: { estado: "bloqueado" }, despues: { estado: "en_ejecucion" }, actor_rol: "cliente" });
      // Con límite 5, las tres abiertas dejan sitio.
      expect(transicion(a, "desbloquear", CONSULTORA, { estadoPrevio: "aprobado", frentes: { acciones: [...tres(), a], limite: 5 }, ahora: AHORA }).ok).toBe(true);
      // Una acción que no es prioridad se desbloquea con el límite lleno, y sin que nadie tenga que contar nada.
      const secundaria = { ...a, es_prioridad: false };
      expect(transicion(secundaria, "desbloquear", DUENO, { estadoPrevio: "aprobado", ahora: AHORA }).ok).toBe(true);
      expect(transicion(secundaria, "desbloquear", DUENO, { estadoPrevio: "aprobado", frentes: { acciones: [...tres(), secundaria], limite: 3 }, ahora: AHORA }).ok).toBe(true);
      // Y una prioridad que vuelve a «propuesto» no abre frente: su límite llega al aprobarla.
      expect(transicion(a, "desbloquear", CONSULTORA, { estadoPrevio: "propuesto", ahora: AHORA }).ok).toBe(true);
    });

    it("NINGUNA ENTRADA A UN ESTADO ABIERTO SE SALTA EL LÍMITE: recorrida la tabla entera, toda transición que abre un frente se frena con el límite lleno y pasa con sitio", () => {
      // Se calcula de TRANSICIONES, no se enumera a mano: si mañana se añade otra forma de llegar a aprobado,
      // en ejecución o reportado desde fuera, esta prueba la encuentra y exige que cuente.
      const entradas: { estado: Estado; evento: Evento; destino: Estado }[] = [];
      for (const estado of ESTADOS) {
        if (ESTADOS_ABIERTOS.includes(estado)) continue;
        for (const [evento, destino] of Object.entries(TRANSICIONES[estado]) as [Evento, Estado | "previo" | "mismo"][]) {
          const destinos: Estado[] = destino === "previo" ? [...ESTADOS_ABIERTOS] : destino === "mismo" ? [] : [destino];
          for (const d of destinos) if (ESTADOS_ABIERTOS.includes(d)) entradas.push({ estado, evento, destino: d });
        }
      }
      expect(entradas.map((e) => `${e.estado}+${e.evento}→${e.destino}`).sort()).toEqual([
        "bloqueado+desbloquear→aprobado", "bloqueado+desbloquear→en_ejecucion", "bloqueado+desbloquear→reportado", "propuesto+aprobar→aprobado",
      ]);
      for (const { estado, evento, destino } of entradas) {
        const a = completa(estado, { id: ID_4, accion: "Frente 4" });
        const lleno = { acciones: [...tres(), a], limite: 3 };
        const r = transicion(a, evento, CONSULTORA, { ...datosPara(evento), estadoPrevio: destino, frentes: lleno });
        expect(r.ok, `${estado}+${evento}→${destino}`).toBe(false);
        if (!r.ok) expect(r.error.startsWith(PRINCIPIO), r.error).toBe(true);
        // La misma transición, con sitio, pasa: lo que la frenaba era el límite y no otra cosa.
        const conSitio = transicion(a, evento, CONSULTORA, { ...datosPara(evento), estadoPrevio: destino, frentes: { ...lleno, limite: 5 } });
        expect(conSitio.ok && conSitio.estado, `${estado}+${evento}→${destino}`).toBe(destino);
      }
    });
  });
});

describe("qué le falta para aprobarse", () => {
  it("una acción vacía lista exactamente seis faltantes", () => {
    const falta = queLeFalta(accionVacia({ id: "x", company_id: EMP, accion: "Hacer algo" }));
    expect(falta).toHaveLength(6);
    expect(falta.join(" | ")).toMatch(/objetivo empresarial/);
    expect(falta.join(" | ")).toMatch(/resultado esperado/);
    expect(falta.join(" | ")).toMatch(/responsable identificado/);
    expect(falta.join(" | ")).toMatch(/fecha de inicio y la de vencimiento/);
    expect(falta.join(" | ")).toMatch(/criterio de aceptación/);
    expect(falta.join(" | ")).toMatch(/indicador para medirla, o el motivo/);
  });
  it("un responsable en texto que no coincide con nadie sigue faltando, y el mensaje lo nombra", () => {
    const falta = queLeFalta(accionVacia({ id: "x", company_id: EMP, accion: "Hacer algo", responsable: "El equipo" }));
    expect(falta.find((f) => f.includes("responsable"))).toContain("«El equipo» no coincide con nadie registrado");
  });
  it("completa, no falta nada y aprobar deja aprobador, fecha y la línea base vigente como referencia", () => {
    const a = completa("propuesto");
    expect(queLeFalta(a)).toEqual([]);
    const r = transicion(a, "aprobar", CONSULTORA, { lineaBaseVigenteId: "b1000000-0000-4000-8000-000000000001", frentes: { acciones: [a], limite: 3 }, ahora: AHORA });
    expect(r.ok && r.cambios).toMatchObject({ estado: "aprobado", aprobador_id: CONSULTORA.id, aprobado_at: AHORA.toISOString(), linea_base_id: "b1000000-0000-4000-8000-000000000001" });
  });
  it("aprobar con faltantes falla y los enumera; el texto del indicador basta mientras no haya indicador formal", () => {
    const r = transicion(completa("propuesto", { objetivo_empresarial: null }), "aprobar", CONSULTORA, { ahora: AHORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Todavía no se puede aprobar\. Falta: el objetivo empresarial/);
    expect(queLeFalta(completa("propuesto", { indicador_id: null, kpi: "No se mide: es un trámite legal" }))).toEqual([]);
    expect(queLeFalta(completa("propuesto", { indicador_id: null, kpi: null })).join()).toMatch(/indicador/);
  });
});

describe("rechazar, posponer, modificar: quién, por qué, qué implica", () => {
  it("rechazar sin motivo falla; con motivo corto también; con motivo pero sin implicación también", () => {
    const sin = transicion(completa("propuesto"), "rechazar", CONSULTORA, { ahora: AHORA });
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(sin.error).toMatch(/Para rechazar: Di por qué/);
    const corto = transicion(completa("propuesto"), "rechazar", CONSULTORA, { motivo: "no", implica: "nada", ahora: AHORA });
    expect(corto.ok).toBe(false);
    const sinImplica = transicion(completa("propuesto"), "rechazar", CONSULTORA, { motivo: "duplica lo que ya hace la acción 2", ahora: AHORA });
    expect(sinImplica.ok).toBe(false);
    if (!sinImplica.ok) expect(sinImplica.error).toMatch(/qué implica/);
  });
  it("con motivo e implicación, rechazar y posponer dejan ambos en el historial", () => {
    const r = transicion(completa("propuesto"), "rechazar", CONSULTORA, { motivo: "duplica lo que ya hace la acción 2", implica: "la acción 2 absorbe su indicador", ahora: AHORA });
    expect(r.ok && r.historial).toMatchObject({ accion: "rechazar", motivo: "duplica lo que ya hace la acción 2", implica: "la acción 2 absorbe su indicador", actor_rol: "consultor" });
    const p = transicion(completa("aprobado"), "posponer", CONSULTORA, { motivo: "temporada alta hasta diciembre", implica: "arranca en enero", ahora: AHORA });
    expect(p.ok && p.estado).toBe("pospuesto");
  });
  it("modificar guarda el antes y el después de lo que cambió, y falla si no cambia nada", () => {
    const a = completa("aprobado");
    const r = transicion(a, "modificar", CONSULTORA, { motivo: "Carlos sale de vacaciones", implica: "vence dos semanas después", cambios: { vence_at: "2026-11-24", estado: "verificado", aprobador_id: "x" }, ahora: AHORA });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estado).toBe("aprobado");
      expect(r.cambios.vence_at).toBe("2026-11-24");
      // Ni el estado ni el aprobador se cambian por la puerta de atrás.
      expect(r.cambios.aprobador_id).toBeUndefined();
      expect(r.cambios.estado).toBeUndefined();
      expect(r.historial.antes).toEqual({ estado: "aprobado", vence_at: "2026-11-10" });
      expect(r.historial.despues).toMatchObject({ estado: "aprobado", vence_at: "2026-11-24" });
    }
    const nada = transicion(a, "modificar", CONSULTORA, { motivo: "motivo suficiente", implica: "nada cambia", cambios: { vence_at: a.vence_at }, ahora: AHORA });
    expect(nada.ok).toBe(false);
  });
  it("validarMotivo y validarModificacion: completar una propuesta no pide motivo; tocar lo aprobado sí, y también la implicación", () => {
    expect(validarMotivo("ok")).toMatch(/al menos 8 letras/);
    expect(validarMotivo("porque el dueño lo pidió")).toBeNull();
    expect(validarModificacion("propuesto", null, null)).toBeNull();
    expect(validarModificacion("aprobado", null, null)).toMatch(/ya está aprobada/);
    expect(validarModificacion("aprobado", "cambia el responsable", null)).toMatch(/qué implica/);
    expect(validarModificacion("en_ejecucion", "cambia el responsable", "Rosa asume")).toBeNull();
  });
  it("bloquear guarda qué bloquea; escalar deja a quién y cuándo; comentar vacío no se guarda", () => {
    const b = transicion(completa("en_ejecucion"), "bloquear", DUENO, { motivo: "no tengo la llave del almacén", ahora: AHORA });
    expect(b.ok && b.cambios).toMatchObject({ estado: "bloqueado", bloqueo: "no tengo la llave del almacén", bloqueado_at: AHORA.toISOString() });
    const e = transicion(completa("aprobado"), "escalar", DUENO, { motivo: "necesito que la consultora decida el precio", escaladoA: CONSULTORA.id, ahora: AHORA });
    expect(e.ok && e.cambios).toMatchObject({ escalado_a: CONSULTORA.id, escalado_at: AHORA.toISOString() });
    expect(e.ok && e.estado).toBe("aprobado");
    const c = transicion(completa("aprobado"), "comentar", DUENO, { motivo: "   ", ahora: AHORA });
    expect(c.ok).toBe(false);
  });
});

describe("el planificador no borra: reconcilia", () => {
  const ex = (id: string, finding: string, accion: string, estado: string) => ({ id, finding_id: finding, accion, estado, verificado_at: null });
  it("lo propuesto que ya no viene se pospone; lo idéntico no se duplica; lo pospuesto que reaparece se vuelve a proponer; lo aprobado no se toca", () => {
    const existentes = [
      ex("e1", "h1", "Cotizar sin el dueño", "propuesto"),
      ex("e2", "h2", "Cerrar caja a diario", "propuesto"),
      ex("e3", "h3", "Contratar un vendedor", "pospuesto"),
      ex("e4", "h4", "Separar la cuenta personal", "aprobado"),
    ];
    const nuevas = [
      { finding_id: "h1", accion: "cotizar sin el dueño" },
      { finding_id: "h3", accion: "Contratar un vendedor" },
      { finding_id: "h5", accion: "Poner precios a la vista" },
    ];
    const r = reconciliarPropuesta(existentes, nuevas);
    expect(r.posponer.map((e) => e.id)).toEqual(["e2"]);
    expect(r.reproponer.map((e) => e.id)).toEqual(["e3"]);
    expect(r.crear.map((n) => n.finding_id)).toEqual(["h5"]);
    expect(r.iguales).toBe(2);
  });
  it("una propuesta nueva para un hallazgo ya aprobado con otro texto sí se crea: es otra acción, no la misma", () => {
    const r = reconciliarPropuesta([ex("e4", "h4", "Separar la cuenta personal", "aprobado")], [{ finding_id: "h4", accion: "Abrir una cuenta solo del negocio" }]);
    expect(r.crear).toHaveLength(1);
    expect(r.posponer).toEqual([]);
  });
  it("handlePlanificar ya no tiene el delete y el motivo de posponer es el acordado", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../src/lib/jobs/handlers/plan.ts"), "utf8");
    const cuerpo = fuente.slice(fuente.indexOf("export async function handlePlanificar"), fuente.indexOf("const TIPOS_DOC"));
    expect(cuerpo).not.toMatch(/\.delete\(/);
    expect(cuerpo).toMatch(/reconciliarPropuesta\(/);
    expect(cuerpo).toMatch(/MOTIVO_NO_APARECE/);
    expect(cuerpo).toMatch(/estado: "propuesto"/);
    expect(MOTIVO_NO_APARECE).toBe("no aparece en la nueva propuesta del planificador");
  });
});

describe("el responsable es una persona, no un texto", () => {
  const equipo = [
    { id: "p1", nombre: "Carlos Quispe", puesto: "Jefe de taller" },
    { id: "p2", nombre: "Rosa Mamani", puesto: "Cajera" },
    { id: "p3", nombre: "Carlos Huamán", puesto: "Vendedor" },
  ];
  it("coincide por nombre completo, por nombre dentro del texto y por puesto", () => {
    expect(resolverResponsable("Rosa Mamani", equipo)?.id).toBe("p2");
    expect(resolverResponsable("Rosa (cajera)", equipo)?.id).toBe("p2");
    expect(resolverResponsable("el jefe de taller", equipo)?.id).toBe("p1");
    expect(resolverResponsable("Cajera", equipo)?.id).toBe("p2");
  });
  it("si coincide con dos personas o con ninguna, no adivina: null, y queLeFalta lo pedirá", () => {
    expect(resolverResponsable("Carlos", equipo)).toBeNull();
    expect(resolverResponsable("El equipo", equipo)).toBeNull();
    expect(resolverResponsable("", equipo)).toBeNull();
    expect(resolverResponsable("Rosa", [])).toBeNull();
  });
  it("normalizar quita tildes (también la de la ñ: «Huamán» y «Huaman» son la misma persona), mayúsculas y signos", () => {
    expect(normalizar("  Cotización  SIN el dueño! ")).toBe("cotizacion sin el dueno");
    expect(normalizar("Huamán")).toBe(normalizar("huaman"));
  });
  it("las fechas del frente salen del día cero del plan y las semanas", () => {
    expect(fechasDeFrente(new Date("2026-10-13T12:00:00Z"), 1, 2)).toEqual({ fecha_inicio: "2026-10-13", vence_at: "2026-10-27" });
    expect(fechasDeFrente(new Date("2026-10-13T12:00:00Z"), 3, 4)).toEqual({ fecha_inicio: "2026-10-27", vence_at: "2026-11-10" });
  });
});

describe("las pantallas usan la regla, no la reinventan", () => {
  const SRC = path.resolve(__dirname, "../src");
  it("el PATCH de acciones ya no acepta `estado`; el estado cambia solo por /transicion", () => {
    const ruta = readFileSync(path.join(SRC, "app/api/actions/[id]/route.ts"), "utf8");
    expect(ruta).toMatch(/modificarAccion\(/);
    expect(ruta).not.toMatch(/"estado"\s*:/);
    expect(ruta).toMatch(/consultor: true/);
    const transicionRuta = readFileSync(path.join(SRC, "app/api/actions/[id]/transicion/route.ts"), "utf8");
    expect(transicionRuta).toMatch(/aplicarTransicion\(/);
  });
  it("el dueño ve «Enviado para revisar», pulsa «Ya lo hice» y eso reporta con prueba; la consultora verifica solo con evidencia", () => {
    const cliente = readFileSync(path.join(SRC, "components/cliente/PlanCliente.tsx"), "utf8");
    expect(cliente).toMatch(/Ya lo hice/);
    expect(cliente).toMatch(/evento: "reportar", evidencia_id/);
    expect(cliente).not.toMatch(/evento: "verificar"/);
    expect(cliente).toMatch(/ESTADO_CLIENTE/);
    const consultor = readFileSync(path.join(SRC, "components/plan/PlanConsultor.tsx"), "utf8");
    expect(consultor).toMatch(/ERROR_SIN_EVIDENCIA/);
    expect(consultor).toMatch(/limiteFrentes\(/);
    expect(consultor).toMatch(/a\.falta\.length/);
  });
  it("el vocabulario del dueño no lleva jerga: ni los estados ni los verbos del historial, y la pantalla usa los suyos", () => {
    for (const texto of [...Object.values(ESTADO_CLIENTE), ...Object.values(VERBO_PASADO_CLIENTE)]) {
      expect(texto).not.toMatch(/kpi|baseline|propuest|verific|report|ejecuci/i);
    }
    // Los verbos hablan igual que los estados: lo que el dueño ve como «Enviado para revisar» lo «envió para revisar».
    expect(VERBO_PASADO_CLIENTE.reportar).toBe("envió para revisar");
    expect(VERBO_PASADO_CLIENTE.verificar).toBe("comprobó");
    expect(VERBO_PASADO_CLIENTE.rechazar_verificacion).toBe("pidió completar");
    expect(Object.keys(VERBO_PASADO_CLIENTE).sort()).toEqual([...EVENTOS].sort());
    const historial = readFileSync(path.join(SRC, "components/plan/HistorialAccion.tsx"), "utf8");
    expect(historial).toMatch(/modo === "cliente" \? VERBO_PASADO_CLIENTE : VERBO_PASADO/);
  });

  /** Todos los .ts/.tsx bajo una carpeta, para buscar en el fuente sin depender de la shell. */
  function archivosBajo(carpeta: string): string[] {
    return readdirSync(carpeta, { withFileTypes: true }).flatMap((d) => {
      const ruta = path.join(carpeta, d.name);
      return d.isDirectory() ? archivosBajo(ruta) : /\.tsx?$/.test(d.name) ? [ruta] : [];
    });
  }

  it("nadie escribe verificado_at fuera de la máquina de estados (una verificación sin transición ni historial sería una puerta trasera)", () => {
    // El PATCH heredado de api/companies/[id]/evidencia escribía `estado: 'hecho'` + verificado_at sin
    // transición. El remate P lo cerró (ahora delega en aplicarTransicion) y la lista quedó vacía: el trinquete
    // exige CERO escritores fuera de la máquina de estados. Si alguien añade aquí un archivo, está reabriendo la puerta.
    const PENDIENTE_DE_LA_COORDINACION: string[] = [];
    const escriben = [...archivosBajo(path.join(SRC, "app")), ...archivosBajo(path.join(SRC, "lib")), ...archivosBajo(path.join(SRC, "components"))]
      .filter((f) => !f.endsWith("plan-intervencion.ts") && /\bverificado_at\s*:/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f).replace(/\\/g, "/"));
    for (const f of escriben) expect(PENDIENTE_DE_LA_COORDINACION, `${f} escribe verificado_at fuera de plan-intervencion.ts`).toContain(f);
    expect(escriben.length).toBeLessThanOrEqual(PENDIENTE_DE_LA_COORDINACION.length);
  });

  it("el PATCH de evidencia es solo de la consultora y delega en la máquina de estados (estático)", () => {
    const ruta = readFileSync(path.join(SRC, "app/api/companies/[id]/evidencia/route.ts"), "utf8");
    const patch = ruta.slice(ruta.indexOf("export const PATCH"));
    expect(patch).toMatch(/^export const PATCH = protegido<Ctx>\(\{ consultor: true/);
    expect(patch).toMatch(/exigirAutoridad\(perfil, "aprobar_plan"\)/);
    expect(patch).toMatch(/leerAccion\(/);
    expect(patch).toMatch(/aplicarTransicion\(a, perfil, \{ evento: "verificar"/);
    expect(patch).toMatch(/instanceof ReglaDelPlan\) return fallo\(e\.message, 409\)/);
    // La ruta entera no actualiza ninguna tabla por su cuenta ni conoce el estado «hecho».
    expect(ruta).not.toMatch(/\.update\(/);
    expect(ruta).not.toMatch(/estado:\s*["']hecho["']/);
  });

  it("HUÉRFANOS, DECLARADOS Y COMPROBADOS: components/Plan.tsx y cliente/Evidencia.tsx no están montados en ninguna pantalla; el camino del dueño que sí lo está es PlanCliente → SubirPrueba → reportar", () => {
    const todos = [...archivosBajo(path.join(SRC, "app")), ...archivosBajo(path.join(SRC, "lib")), ...archivosBajo(path.join(SRC, "components"))];
    const quienNombra = (modulo: RegExp) => todos.filter((f) => modulo.test(readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f).replace(/\\/g, "/"));
    // Nadie importa el Plan.tsx antiguo: su selector de estado (que el PATCH de acciones ya no acepta) y su
    // JSON.stringify de los indicadores no llegan a ninguna pantalla. Si esto deja de ser cierto, alguien lo
    // volvió a montar y hay que arreglarlo o borrarlo antes.
    expect(quienNombra(/["'][^"'\n]*\/Plan["']/)).toEqual([]);
    // Y a cliente/Evidencia.tsx solo lo importa ese archivo que nadie importa.
    expect(quienNombra(/["'][^"'\n]*\/Evidencia["']/)).toEqual(["components/Plan.tsx"]);
    // Por si alguien lo vuelve a montar, que no reabra la puerta: su botón REPORTA por la ruta de transición, nunca verifica.
    const boton = readFileSync(path.join(SRC, "components/cliente/Evidencia.tsx"), "utf8");
    expect(boton).toMatch(/\/api\/actions\/\$\{actionId\}\/transicion`, \{ json: \{ evento: "reportar" \} \}/);
    expect(boton).not.toMatch(/method: "PATCH"/);
    expect(boton).not.toMatch(/evento: "verificar"/);
    expect(boton).not.toMatch(/Darla por hecha/);
    // El camino que SÍ está montado en el portal: sube la prueba y reporta con ella.
    const portal = readFileSync(path.join(SRC, "app/(cliente)/portal/plan/page.tsx"), "utf8");
    expect(portal).toMatch(/<PlanCliente\b/);
    const planCliente = readFileSync(path.join(SRC, "components/cliente/PlanCliente.tsx"), "utf8");
    expect(planCliente).toMatch(/<SubirPrueba\b/);
    expect(planCliente).toMatch(/evento: "reportar", evidencia_id: p\.id/);
    expect(planCliente).not.toMatch(/companies\/[^"`]*\/evidencia`, \{ method: "PATCH"/);
  });

  it("los cortes no imprimen JSON y la fila de cada acción tiene el ancla que usa la revisión semanal (estático)", () => {
    const cortes = readFileSync(path.join(SRC, "components/plan/CortesPlan.tsx"), "utf8");
    expect(cortes).not.toMatch(/JSON\.stringify/);
    expect(cortes).toMatch(/indicadoresLegibles\(c\.indicadores, puedeRegistrar \? "consultor" : "cliente"\)/);
    const consultor = readFileSync(path.join(SRC, "components/plan/PlanConsultor.tsx"), "utf8");
    expect(consultor).toContain("<tr id={`accion-${a.id}`}>");
    // El enlace que tiene que aterrizar ahí lo arma la revisión semanal con la misma forma.
    const revision = readFileSync(path.join(SRC, "lib/revision-semanal.ts"), "utf8");
    expect(revision).toContain("/plan#accion-${id}");
  });
});

describe("los indicadores de un corte se leen en palabras, nunca en JSON", () => {
  const sinJson = (t: string) => expect(t).not.toMatch(/[{}[\]"]/);

  it("el texto que escribió la consultora sale tal cual; sin nada, no se muestra nada", () => {
    expect(indicadoresLegibles({ texto: "  Cotizaciones sin el dueño: de 2 a 6 de cada 10 " })).toEqual({ texto: "Cotizaciones sin el dueño: de 2 a 6 de cada 10", legible: true });
    expect(indicadoresLegibles("Subió la venta de mostrador")).toEqual({ texto: "Subió la venta de mostrador", legible: true });
    for (const vacio of [null, undefined, "", "   ", {}, [], { texto: "" }, { texto: null }]) expect(indicadoresLegibles(vacio), JSON.stringify(vacio)).toBeNull();
  });

  it("pares sencillos y listas con nombre y valor salen como «Nombre: valor»; un valor que falta se lee «sin dato», nunca cero", () => {
    const pares = indicadoresLegibles({ venta_mes: 40000, clientes_nuevos: 12, caja_cuadrada: true, margen: null });
    expect(pares).toEqual({ texto: "Venta mes: 40000 · Clientes nuevos: 12 · Caja cuadrada: sí · Margen: sin dato", legible: true });
    expect(pares!.texto).not.toMatch(/Margen: 0/);
    const lista = indicadoresLegibles([{ nombre: "Cotizaciones sin el dueño", valor: 6, unidad: "de cada 10" }, { clave: "venta_mes", valor: null, unidad: "soles" }, "La caja cuadró toda la quincena"]);
    expect(lista).toEqual({ texto: "Cotizaciones sin el dueño: 6 de cada 10 · Venta mes: sin dato · La caja cuadró toda la quincena", legible: true });
    // Un JSON que alguien guardó como texto se lee por dentro, no se imprime.
    expect(indicadoresLegibles('{"venta_mes": 40000}')).toEqual({ texto: "Venta mes: 40000", legible: true });
    for (const r of [pares, lista]) sinJson(r!.texto);
  });

  it("lo que no se puede leer se dice con una frase: al dueño, a quién pedírselo; a la consultora, que la pantalla no lo sabe leer", () => {
    const raros: unknown[] = [{ ventas: { enero: 1, febrero: 2 } }, [{ a: 1 }], [[1, 2]], 42, true, '{"ventas":{"enero":1}}', [{ nombre: "Venta", valor: { soles: 3 } }], { venta: Number.NaN }];
    for (const raro of raros) {
      const dueno = indicadoresLegibles(raro);
      expect(dueno, JSON.stringify(raro)).toEqual({ texto: CORTE_CON_NUMEROS_SIN_DETALLE, legible: false });
      expect(indicadoresLegibles(raro, "consultor")).toEqual({ texto: CORTE_CON_NUMEROS_ILEGIBLES, legible: false });
      sinJson(dueno!.texto);
    }
    expect(CORTE_CON_NUMEROS_SIN_DETALLE).toBe("Hay números registrados en este corte; pídele el detalle a tu consultora");
    expect(CORTE_CON_NUMEROS_ILEGIBLES).not.toMatch(/tu consultora/);
    // Un texto que empieza con corchete pero no es JSON sigue siendo un texto.
    expect(indicadoresLegibles("[sin cambios esta quincena")).toEqual({ texto: "[sin cambios esta quincena", legible: true });
  });

  it("JSON metido como texto no se imprime por ningún lado: en `texto`, suelto y roto, como elemento de una lista o como valor de un par", () => {
    // Lo que se deja leer por dentro, se lee.
    expect(indicadoresLegibles({ texto: '{"ventas": 3}' })).toEqual({ texto: "Ventas: 3", legible: true });
    expect(indicadoresLegibles(['{"a":1}'])).toEqual({ texto: "A: 1", legible: true });
    expect(indicadoresLegibles({ texto: JSON.stringify({ texto: JSON.stringify({ venta_mes: 40000 }) }) })).toEqual({ texto: "Venta mes: 40000", legible: true });
    expect(indicadoresLegibles('["Subió el mostrador", "La caja cuadró"]')).toEqual({ texto: "Subió el mostrador · La caja cuadró", legible: true });
    // Lo que no, sale como la frase; nunca crudo. Los cuatro primeros son los que el verificador ejecutó y vio salir tal cual.
    const ilegibles: unknown[] = [
      '{"a":1',
      { nota: '{"x":1}' },
      { texto: '{"a":1' },
      ['{"a":1'],
      { texto: '[{"x":' },
      { texto: "[1,2]" },
      { nota: "[1, 2]" },
      "[1, 2",
      [{ nombre: "Venta", valor: '{"soles":3}' }],
      [{ nombre: '{"n":1}', valor: 3 }],
      [{ nombre: "Venta", valor: 3, unidad: '["soles"]' }],
      { '{"k":1}': 3 },
      // Y un objeto JSON en mitad de una frase: no empieza por llave, pero lleva su firma (llave, clave entre comillas, dos puntos).
      { texto: 'ver {"x":1} al final' },
      'Ventas {"enero": 3}',
      { nota: 'antes [{"x": 1}]' },
      ['Subió el mostrador {"de":2,"a":6}'],
    ];
    for (const caso of ilegibles) {
      for (const lector of ["cliente", "consultor"] as const) {
        const r = indicadoresLegibles(caso, lector);
        expect(r, JSON.stringify(caso)).toEqual({ texto: lector === "cliente" ? CORTE_CON_NUMEROS_SIN_DETALLE : CORTE_CON_NUMEROS_ILEGIBLES, legible: false });
        sinJson(r!.texto);
      }
    }
    // Un JSON dentro de otro, y de otro, y de otro: se abre hasta un tope y de ahí no se sigue (ni se imprime).
    let anidado: unknown = { venta_mes: 40000 };
    for (let i = 0; i < 8; i++) anidado = { texto: JSON.stringify(anidado) };
    expect(indicadoresLegibles(anidado)).toEqual({ texto: CORTE_CON_NUMEROS_SIN_DETALLE, legible: false });
  });

  it("CIERRE Z5 · un JSON codificado dos veces no es legible: salía a la pantalla con sus comillas y sus barras, rotulado como texto", () => {
    const dosVeces = (v: unknown) => JSON.stringify(JSON.stringify(v));
    // Lo que el refutador vio salir tal cual: «"{\"venta_mes\":40000}"».
    expect(dosVeces({ venta_mes: 40000 })).toBe('"{\\"venta_mes\\":40000}"');
    const ilegibles: unknown[] = [
      dosVeces({ venta_mes: 40000 }),
      { texto: dosVeces({ venta_mes: 40000 }) },
      [dosVeces({ a: 1 })],
      { nota: dosVeces({ a: 1 }) },
      [{ nombre: "Venta", valor: dosVeces({ soles: 3 }) }],
      [{ nombre: dosVeces({ n: 1 }), valor: 3 }],
      dosVeces(["Subió el mostrador", "La caja cuadró"]),
      dosVeces([1, 2]),
      // Tres veces, y a medias (le falta la comilla de cierre): tampoco.
      JSON.stringify(dosVeces({ a: 1 })),
      '"{\\"a\\":1',
      { texto: 'ver {\\"x\\":1} al final' },
    ];
    for (const caso of ilegibles) {
      for (const lector of ["cliente", "consultor"] as const) {
        const r = indicadoresLegibles(caso, lector);
        expect(r, JSON.stringify(caso)).toEqual({ texto: lector === "cliente" ? CORTE_CON_NUMEROS_SIN_DETALLE : CORTE_CON_NUMEROS_ILEGIBLES, legible: false });
        expect(r!.texto).not.toMatch(/[{}[\]"\\]/);
      }
    }
    // Una frase entre comillas no es JSON codificado dos veces: dentro no hay JSON, y se lee como la escribieron.
    for (const frase of ['"sin cambios esta quincena"', '"Mostrador": subió de 2 a 6', 'Dijo "ya cuadra la caja"']) {
      expect(indicadoresLegibles(frase), frase).toEqual({ texto: frase, legible: true });
      expect(indicadoresLegibles({ texto: frase }), frase).toEqual({ texto: frase, legible: true });
    }
    // Y el JSON guardado UNA vez como texto se sigue leyendo por dentro: eso no cambió.
    expect(indicadoresLegibles(JSON.stringify({ venta_mes: 40000 }))).toEqual({ texto: "Venta mes: 40000", legible: true });
  });

  it("una frase que empieza con corchete sigue siendo una frase: no se confunde con JSON ni se esconde", () => {
    for (const frase of ["[sin cambios esta quincena", "[Mostrador] subió de 2 a 6 de cada 10", "[ ] cerrar caja a diario; [x] cotizar sin el dueño", "[2] cotizaciones sin el dueño", "{pendiente de la visita}"]) {
      expect(indicadoresLegibles(frase), frase).toEqual({ texto: frase, legible: true });
      expect(indicadoresLegibles({ texto: frase }), frase).toEqual({ texto: frase, legible: true });
    }
    expect(indicadoresLegibles({ nota: "[sin cambios]", venta_mes: 40000 })).toEqual({ texto: "Nota: [sin cambios] · Venta mes: 40000", legible: true });
    // Un `texto` que al abrirse está vacío no tapa los pares que sí hay, y solo no es nada.
    expect(indicadoresLegibles({ texto: "{}", venta_mes: 40000 })).toEqual({ texto: "Venta mes: 40000", legible: true });
    expect(indicadoresLegibles({ texto: "{}" })).toBeNull();
  });
});

describe("la capa que toca la base, con dobles de supabaseAdmin: la regla corta antes de escribir, y lo que se escribe deja rastro", () => {
  const PERFIL_C: Perfil = { id: CONSULTORA.id as string, email: "consultora@ejemplo.test", nombre: "Consultora", rol: "consultor", autoridad: ["aprobar_plan"] };
  const PERFIL_D: Perfil = { id: DUENO.id as string, email: "dueno@ejemplo.test", nombre: "Dueño", rol: "cliente" };
  const LB_V2 = "b2000000-0000-4000-8000-000000000002";
  const LB_V1 = "b1000000-0000-4000-8000-000000000001";
  const PART = "p1000000-0000-4000-8000-000000000001";
  const idDe = (n: number) => `a${n}000000-0000-4000-8000-00000000000${n}`;
  const fila = (n: number, estado: string, extra: Partial<AccionPlan> = {}) => completa(estado, { id: idDe(n), accion: `Frente ${n}`, linea_base_id: null, ...extra });
  const guardada = (n: number) => base.tablas.actions.find((x) => x.id === idDe(n)) as Fila;
  const historialDe = (n: number) => (base.tablas.accion_historial ?? []).filter((h) => h.action_id === idDe(n));

  beforeEach(() => {
    base.tablas = {
      companies: [{ id: EMP, limite_frentes: 3 }],
      mediciones: [
        { id: LB_V2, company_id: EMP, tipo: "linea_base", version: 2, vigente: true, fecha: "2026-10-01" },
        { id: LB_V1, company_id: EMP, tipo: "linea_base", version: 1, vigente: false, fecha: "2026-09-01" },
      ],
      participants: [{ id: PART, company_id: EMP, nombre: "Carlos Quispe", puesto: "Jefe de taller", rol: "lider" }],
      actions: [], accion_historial: [], evidencias: [], indicador_valores: [], indicadores: [],
    };
    base.escrituras = [];
    base.fallar = {};
  });

  it("aprobar con el límite lleno: la regla corta antes de escribir (ni acción ni historial); con límite 5 entra y referencia la línea base vigente", async () => {
    const candidata = fila(4, "propuesto");
    base.tablas.actions = [fila(1, "aprobado"), fila(2, "en_ejecucion"), fila(3, "reportado"), candidata].map((x) => ({ ...x }));
    await expect(aplicarTransicion(candidata, PERFIL_C, { evento: "aprobar" })).rejects.toThrow(/Ya hay 3 prioridades abiertas y el límite es 3: «Frente 1», «Frente 2», «Frente 3»/);
    await expect(aplicarTransicion(candidata, PERFIL_C, { evento: "aprobar" })).rejects.toBeInstanceOf(ReglaDelPlan);
    expect(base.escrituras).toEqual([]);

    base.tablas.companies[0].limite_frentes = 5;
    const r = await aplicarTransicion(candidata, PERFIL_C, { evento: "aprobar" });
    expect(r.estado).toBe("aprobado");
    expect(r.historialIds).toHaveLength(1);
    expect(guardada(4)).toMatchObject({ estado: "aprobado", aprobador_id: PERFIL_C.id, linea_base_id: LB_V2 });
    expect(guardada(4).aprobado_at).toBeTruthy();
    expect(historialDe(4)).toHaveLength(1);
    expect(historialDe(4)[0]).toMatchObject({ accion: "aprobar", actor_id: PERFIL_C.id, actor_rol: "consultor", antes: { estado: "propuesto" }, despues: { estado: "aprobado", linea_base_id: LB_V2 } });
    expect(base.escrituras.map((e) => `${e.op}:${e.tabla}`)).toEqual(["update:actions", "insert:accion_historial"]);
  });

  it("aprobar sin la autoridad aprobar_plan se niega (403) y nada se escribe; una propuesta incompleta tampoco se aprueba", async () => {
    const candidata = fila(1, "propuesto");
    base.tablas.actions = [{ ...candidata }];
    await expect(aplicarTransicion(candidata, { ...PERFIL_C, autoridad: ["ninguna"] }, { evento: "aprobar" })).rejects.toBeInstanceOf(AccesoDenegado);
    const incompleta = fila(2, "propuesto", { criterio_aceptacion: null });
    base.tablas.actions.push({ ...incompleta });
    await expect(aplicarTransicion(incompleta, PERFIL_C, { evento: "aprobar" })).rejects.toThrow(/Todavía no se puede aprobar\. Falta: el criterio de aceptación/);
    expect(base.escrituras).toEqual([]);
    expect(guardada(1).estado).toBe("propuesto");
  });

  it("verificar sin prueba falla con el mensaje exacto y no escribe; con una evidencia subida, o un valor del indicador posterior al reporte, verifica y deja quién y cuándo", async () => {
    const reportada = fila(1, "reportado", { reportado_at: "2026-10-10T10:00:00.000Z" });
    const conIndicador = fila(2, "reportado", { reportado_at: "2026-10-10T10:00:00.000Z", indicador_id: "i1000000-0000-4000-8000-000000000001" });
    base.tablas.actions = [{ ...reportada }, { ...conIndicador }];
    await expect(aplicarTransicion(reportada, PERFIL_C, { evento: "verificar" })).rejects.toThrow(ERROR_SIN_EVIDENCIA);
    await expect(aplicarTransicion(conIndicador, PERFIL_C, { evento: "verificar" })).rejects.toThrow("reportado no es verificado: falta evidencia");
    expect(base.escrituras).toEqual([]);

    base.tablas.evidencias.push({ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "foto" });
    const r = await aplicarTransicion(reportada, PERFIL_C, { evento: "verificar", motivo: "la foto muestra la plantilla firmada" });
    expect(r.estado).toBe("verificado");
    expect(guardada(1)).toMatchObject({ estado: "verificado", verificado_por: PERFIL_C.id, verificado_nota: "la foto muestra la plantilla firmada" });
    expect(guardada(1).verificado_at).toBeTruthy();

    // Un valor del indicador ANTERIOR al reporte no cuenta; uno posterior sí.
    base.tablas.indicador_valores.push({ id: "v0", indicador_id: conIndicador.indicador_id, created_at: "2026-10-09T00:00:00.000Z" });
    await expect(aplicarTransicion(conIndicador, PERFIL_C, { evento: "verificar" })).rejects.toThrow(ERROR_SIN_EVIDENCIA);
    base.tablas.indicador_valores.push({ id: "v1", indicador_id: conIndicador.indicador_id, created_at: "2026-10-12T00:00:00.000Z" });
    expect((await aplicarTransicion(conIndicador, PERFIL_C, { evento: "verificar" })).estado).toBe("verificado");
    expect(historialDe(2).map((h) => h.accion)).toEqual(["verificar"]);
  });

  it("el dueño reporta una acción aprobada: queda en reportado (nunca verificado) y el historial tiene dos filas, iniciar y reportar, en ese orden", async () => {
    const aprobada = fila(1, "aprobado", { fecha_inicio: null });
    base.tablas.actions = [{ ...aprobada }];
    base.tablas.evidencias.push({ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "nota" });
    const r = await aplicarTransicion(aprobada, PERFIL_D, { evento: "reportar", evidencia_id: "e1" });
    expect(r.estado).toBe("reportado");
    expect(r.historialIds).toHaveLength(2);
    expect(historialDe(1).map((h) => h.accion)).toEqual(["iniciar", "reportar"]);
    expect(historialDe(1)[0]).toMatchObject({ antes: { estado: "aprobado" }, despues: { estado: "en_ejecucion" }, actor_rol: "cliente" });
    expect(historialDe(1)[1]).toMatchObject({ antes: { estado: "en_ejecucion" }, despues: { estado: "reportado", evidencia_id: "e1" }, actor_id: PERFIL_D.id });
    expect(guardada(1)).toMatchObject({ estado: "reportado", reportado_por: PERFIL_D.id });
    expect(guardada(1).fecha_inicio).toBeTruthy();
    expect(guardada(1).verificado_at ?? null).toBeNull();
  });

  it("un reporte con una prueba ajena, o sin prueba, se rechaza y NO deja la acción iniciada: una petición que falla no tiene efectos", async () => {
    const aprobada = fila(1, "aprobado");
    base.tablas.actions = [{ ...aprobada }];
    base.tablas.evidencias.push({ id: "e-ajena", company_id: EMP, action_id: idDe(9), tipo: "nota" });
    await expect(aplicarTransicion(aprobada, PERFIL_D, { evento: "reportar", evidencia_id: "e-ajena" })).rejects.toThrow(/Esa prueba no es de esta acción/);
    await expect(aplicarTransicion(aprobada, PERFIL_D, { evento: "reportar" })).rejects.toThrow(/Sin prueba no hay reporte/);
    expect(base.escrituras).toEqual([]);
    expect(guardada(1).estado).toBe("aprobado");
    expect(historialDe(1)).toEqual([]);
    // Y el dueño no verifica ni aprueba, aunque lo pida por la ruta: la regla lo dice antes de tocar la base.
    await expect(aplicarTransicion(fila(2, "reportado"), PERFIL_D, { evento: "verificar" })).rejects.toThrow("Solo la consultora puede verificar.");
    expect(base.escrituras).toEqual([]);
  });

  it("si el historial no entra, la acción vuelve a como estaba y se lanza: un cambio sin rastro no se deja a medias", async () => {
    const propuesta = fila(1, "propuesto");
    base.tablas.actions = [{ ...propuesta }];
    base.fallar.accion_historial = { op: "insert", mensaje: "disco lleno" };
    await expect(
      aplicarTransicion(propuesta, PERFIL_C, { evento: "rechazar", motivo: "duplica lo que ya hace la acción 2", implica: "la acción 2 absorbe su indicador" })
    ).rejects.toThrow(/no se cambió porque su historial no se pudo guardar: disco lleno/);
    expect(guardada(1).estado).toBe("propuesto");
    expect(base.tablas.accion_historial).toEqual([]);
    expect(base.escrituras.map((e) => `${e.op}:${e.tabla}`)).toEqual(["update:actions", "update:actions"]);
  });

  it("modificarAccion en una propuesta: la ficha cambia, el historial guarda antes y después, y el estado no se toca; si el historial falla, la ficha vuelve atrás", async () => {
    const propuesta = fila(1, "propuesto", { recursos: null });
    base.tablas.actions = [{ ...propuesta }];
    const r = await modificarAccion(propuesta, PERFIL_C, { recursos: "una laptop", estado: "verificado", aprobador_id: "colado" });
    expect(r.historialId).toBeTruthy();
    expect(guardada(1)).toMatchObject({ recursos: "una laptop", estado: "propuesto", aprobador_id: null });
    expect(historialDe(1)[0]).toMatchObject({ accion: "modificar", antes: { estado: "propuesto", recursos: null }, despues: { estado: "propuesto", recursos: "una laptop" }, actor_id: PERFIL_C.id });

    base.fallar.accion_historial = { op: "insert", mensaje: "sin permiso" };
    await expect(modificarAccion({ ...propuesta, recursos: "una laptop" }, PERFIL_C, { recursos: "dos laptops" })).rejects.toThrow(/historial no se pudo guardar: sin permiso/);
    expect(guardada(1).recursos).toBe("una laptop");
    expect(historialDe(1)).toHaveLength(1);
  });

  it("modificarAccion sobre algo ya aprobado es volver a decidir: pide motivo e implicación, y lo que se enlaza tiene que ser de la misma empresa", async () => {
    const aprobada = fila(1, "aprobado");
    base.tablas.actions = [{ ...aprobada }];
    await expect(modificarAccion(aprobada, PERFIL_C, { vence_at: "2026-11-24" })).rejects.toThrow(/ya está aprobada/);
    await expect(modificarAccion(aprobada, PERFIL_C, { responsable_participant_id: "99999999-0000-4000-8000-000000000009" }, "Carlos sale de vacaciones", "Rosa asume")).rejects.toThrow(/no está registrada en el equipo/);
    expect(base.escrituras).toEqual([]);
    const r = await modificarAccion(aprobada, PERFIL_C, { vence_at: "2026-11-24" }, "Carlos sale de vacaciones", "vence dos semanas después");
    expect(r.historialId).toBeTruthy();
    expect(guardada(1)).toMatchObject({ estado: "aprobado", vence_at: "2026-11-24" });
    expect(historialDe(1)[0]).toMatchObject({ accion: "modificar", motivo: "Carlos sale de vacaciones", implica: "vence dos semanas después", antes: { estado: "aprobado", vence_at: "2026-11-10" } });
  });

  it("modificarAccion NO deja marcar como prioridad una acción ya aprobada si el límite está lleno: nombra las abiertas y no escribe nada; con límite 5 entra y deja historial", async () => {
    const colada = fila(4, "aprobado", { es_prioridad: false });
    base.tablas.actions = [fila(1, "aprobado"), fila(2, "en_ejecucion"), fila(3, "reportado"), colada].map((x) => ({ ...x }));
    const marcar = () => modificarAccion(colada, PERFIL_C, { es_prioridad: true }, "el dueño la quiere primero", "ocupa un frente más");
    await expect(marcar()).rejects.toThrow(/Ya hay 3 prioridades abiertas y el límite es 3: «Frente 1», «Frente 2», «Frente 3»/);
    await expect(marcar()).rejects.toBeInstanceOf(ReglaDelPlan);
    // Tampoco se cuela junto a otro cambio: la petición entera se rechaza.
    await expect(modificarAccion(colada, PERFIL_C, { es_prioridad: true, vence_at: "2026-11-24" }, "el dueño la quiere primero", "ocupa un frente más")).rejects.toThrow(/Ya hay 3 prioridades abiertas/);
    expect(base.escrituras).toEqual([]);
    expect(guardada(4)).toMatchObject({ es_prioridad: false, vence_at: "2026-11-10" });
    expect(historialDe(4)).toEqual([]);

    base.tablas.companies[0].limite_frentes = 5;
    const r = await marcar();
    expect(r.historialId).toBeTruthy();
    expect(guardada(4)).toMatchObject({ estado: "aprobado", es_prioridad: true });
    expect(historialDe(4)).toHaveLength(1);
    expect(historialDe(4)[0]).toMatchObject({ accion: "modificar", antes: { estado: "aprobado", es_prioridad: false }, despues: { estado: "aprobado", es_prioridad: true }, motivo: "el dueño la quiere primero", implica: "ocupa un frente más", actor_id: PERFIL_C.id });
    expect(base.escrituras.map((e) => `${e.op}:${e.tabla}`)).toEqual(["update:actions", "insert:accion_historial"]);
  });

  it("lo que no abre un frente sigue pasando con el límite lleno: cambiar el plazo de una prioridad abierta, quitar la marca, o marcar una propuesta; y marcar sin autoridad se niega", async () => {
    const propuesta = fila(5, "propuesto", { es_prioridad: false });
    base.tablas.actions = [fila(1, "aprobado"), fila(2, "en_ejecucion"), fila(3, "reportado"), propuesta].map((x) => ({ ...x }));
    await modificarAccion(fila(2, "en_ejecucion"), PERFIL_C, { vence_at: "2026-11-24" }, "Carlos sale de vacaciones", "vence dos semanas después");
    expect(guardada(2).vence_at).toBe("2026-11-24");
    // Una propuesta se marca sin contar (todavía no ocupa frente): su límite llega al aprobarla, y ahí sí la para.
    await modificarAccion(propuesta, PERFIL_C, { es_prioridad: true });
    expect(guardada(5)).toMatchObject({ estado: "propuesto", es_prioridad: true });
    await expect(aplicarTransicion({ ...propuesta, es_prioridad: true }, PERFIL_C, { evento: "aprobar" })).rejects.toThrow(/Ya hay 3 prioridades abiertas/);
    // Quitar la marca libera un frente y no necesita sitio.
    await modificarAccion(fila(1, "aprobado"), PERFIL_C, { es_prioridad: false }, "deja de ser urgente", "libera un frente");
    expect(guardada(1).es_prioridad).toBe(false);

    const escritasAntes = base.escrituras.length;
    const otra = fila(6, "aprobado", { es_prioridad: false });
    base.tablas.actions.push({ ...otra });
    await expect(modificarAccion(otra, { ...PERFIL_C, autoridad: ["ninguna"] }, { es_prioridad: true }, "el dueño la quiere primero", "ocupa un frente más")).rejects.toBeInstanceOf(AccesoDenegado);
    expect(base.escrituras).toHaveLength(escritasAntes);
  });

  it("si las acciones de la empresa no se pueden leer, el límite no se da por cumplido: ni la marca ni la aprobación pasan, y nada se escribe", async () => {
    const colada = fila(4, "aprobado", { es_prioridad: false });
    const candidata = fila(5, "propuesto");
    base.tablas.actions = [{ ...colada }, { ...candidata }];
    base.fallar.actions = { op: "select", mensaje: "la base no responde" };
    await expect(modificarAccion(colada, PERFIL_C, { es_prioridad: true }, "el dueño la quiere primero", "ocupa un frente más")).rejects.toThrow("No se pudo contar las prioridades abiertas: la base no responde");
    await expect(aplicarTransicion(candidata, PERFIL_C, { evento: "aprobar" })).rejects.toThrow("No se pudo contar las prioridades abiertas: la base no responde");
    expect(base.escrituras).toEqual([]);
  });

  it("LA PUERTA POR «BLOQUEADO», DE PUNTA A PUNTA: aprobada sin marca → bloqueada → marcada prioridad → «Ya se destrabó». Con el límite lleno NO vuelve (sigue bloqueada, nada se escribe); con sitio vuelve y deja historial", async () => {
    const colada = fila(4, "aprobado", { es_prioridad: false });
    base.tablas.actions = [fila(1, "aprobado"), fila(2, "en_ejecucion"), fila(3, "reportado"), colada].map((x) => ({ ...x }));
    // El dueño la bloquea; bloqueada, la consultora la marca prioridad (no ocupa frente todavía: entra sin contar).
    const bloqueada = (await aplicarTransicion(colada, PERFIL_D, { evento: "bloquear", motivo: "falta la llave del almacén" })).accion;
    expect(guardada(4).estado).toBe("bloqueado");
    const marcada = (await modificarAccion(bloqueada, PERFIL_C, { es_prioridad: true }, "el dueño la quiere primero", "ocupa un frente más")).accion;
    expect(guardada(4)).toMatchObject({ estado: "bloqueado", es_prioridad: true });
    const escritasAntes = base.escrituras.length;

    // Desbloquear: antes pasaba y quedaban cuatro prioridades abiertas con límite 3. Lo pida el dueño o la consultora.
    const nombradas = "Ya hay 3 prioridades abiertas y el límite es 3: «Frente 1», «Frente 2», «Frente 3». ";
    await expect(aplicarTransicion(marcada, PERFIL_D, { evento: "desbloquear" })).rejects.toBeInstanceOf(ReglaDelPlan);
    await expect(aplicarTransicion(marcada, PERFIL_D, { evento: "desbloquear" })).rejects.toThrow(nombradas + SALIDA_FRENTES.desbloquear_cliente);
    await expect(aplicarTransicion(marcada, PERFIL_C, { evento: "desbloquear" })).rejects.toBeInstanceOf(ReglaDelPlan);
    await expect(aplicarTransicion(marcada, PERFIL_C, { evento: "desbloquear" })).rejects.toThrow(nombradas + SALIDA_FRENTES.desbloquear);
    expect(base.escrituras).toHaveLength(escritasAntes);
    expect(guardada(4)).toMatchObject({ estado: "bloqueado", es_prioridad: true });
    expect(historialDe(4).map((h) => h.accion)).toEqual(["bloquear", "modificar"]);
    expect(frentesAbiertos(base.tablas.actions as unknown as AccionPlan[]).map((a) => a.accion)).toEqual(["Frente 1", "Frente 2", "Frente 3"]);

    // Si las acciones no se pueden leer, tampoco vuelve: un límite que no se pudo contar no se da por cumplido.
    base.fallar.actions = { op: "select", mensaje: "la base no responde" };
    await expect(aplicarTransicion(marcada, PERFIL_D, { evento: "desbloquear" })).rejects.toThrow("No se pudo contar las prioridades abiertas: la base no responde");
    base.fallar = {};
    expect(base.escrituras).toHaveLength(escritasAntes);

    // Con sitio (la consultora comprueba una de las tres y deja de ocupar frente) el dueño sí la destraba.
    guardada(3).estado = "verificado";
    const r = await aplicarTransicion(marcada, PERFIL_D, { evento: "desbloquear" });
    expect(r.estado).toBe("aprobado");
    expect(guardada(4)).toMatchObject({ estado: "aprobado", es_prioridad: true, bloqueo: null, bloqueado_at: null });
    expect(historialDe(4).map((h) => h.accion)).toEqual(["bloquear", "modificar", "desbloquear"]);
    expect(historialDe(4)[2]).toMatchObject({ antes: { estado: "bloqueado" }, despues: { estado: "aprobado" }, actor_id: PERFIL_D.id, actor_rol: "cliente" });
    expect(frentesAbiertos(base.tablas.actions as unknown as AccionPlan[])).toHaveLength(3);
  });

  it("desbloquear lo que no es prioridad no lee las acciones de la empresa ni se frena con el límite lleno", async () => {
    const secundaria = fila(4, "aprobado", { es_prioridad: false });
    base.tablas.actions = [fila(1, "aprobado"), fila(2, "en_ejecucion"), fila(3, "reportado"), secundaria].map((x) => ({ ...x }));
    const bloqueada = (await aplicarTransicion(secundaria, PERFIL_D, { evento: "bloquear", motivo: "falta la llave del almacén" })).accion;
    // Aunque la lectura de acciones fallara, este desbloqueo no depende de ella: no abre ningún frente.
    base.fallar.actions = { op: "select", mensaje: "la base no responde" };
    const r = await aplicarTransicion(bloqueada, PERFIL_D, { evento: "desbloquear" });
    expect(r.estado).toBe("aprobado");
    expect(historialDe(4).map((h) => h.accion)).toEqual(["bloquear", "desbloquear"]);
  });

  describe("PATCH /api/companies/[id]/evidencia · la ruta de verdad, con `protegido()` real y dobles de sesión y de base", () => {
    type Ctx = { params: Promise<{ id: string }> };
    const OTRA_EMPRESA = "0000000b-0000-4000-8000-00000000000b";
    const llamar = async (perfil: Perfil | null, cuerpo: Fila, empresa = EMP) => {
      vi.mocked(perfilApi).mockResolvedValue(perfil);
      const req = new Request(`http://8x.test/api/companies/${empresa}/evidencia`, { method: "PATCH", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } });
      const ctx: Ctx = { params: Promise.resolve({ id: empresa }) };
      const res = await verificarConEvidencia(req, ctx);
      return { status: res.status, cuerpo: (await res.json()) as Fila };
    };
    const rastro = () => vi.mocked(registrar).mock.calls.map(([e]) => e);

    beforeEach(() => {
      vi.mocked(perfilApi).mockReset();
      vi.mocked(registrar).mockClear();
      base.tablas.memberships = [{ user_id: PERFIL_D.id, company_id: EMP }];
      base.tablas.actions = [{ ...fila(1, "reportado", { reportado_at: "2026-10-10T10:00:00.000Z", reportado_por: PERFIL_D.id }) }];
    });

    it("el dueño, miembro de la empresa y con su prueba subida, ya NO verifica: 403, la acción sigue reportada, sin historial, y el intento queda en el rastro", async () => {
      base.tablas.evidencias.push({ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "foto" });
      const r = await llamar(PERFIL_D, { action_id: idDe(1) });
      expect(r.status).toBe(403);
      expect(base.escrituras).toEqual([]);
      expect(guardada(1).estado).toBe("reportado");
      expect(guardada(1).verificado_at ?? null).toBeNull();
      expect(guardada(1).verificado_por ?? null).toBeNull();
      expect(historialDe(1)).toEqual([]);
      expect(rastro()).toEqual([expect.objectContaining({ accion: "denegado", entidad: "accion_verificada", detalle: expect.objectContaining({ motivo: "rol", metodo: "PATCH" }) })]);
    });

    it("sin sesión → 401; la consultora sin la autoridad de aprobar el plan → 403; ninguna de las dos escribe", async () => {
      base.tablas.evidencias.push({ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "foto" });
      expect((await llamar(null, { action_id: idDe(1) })).status).toBe(401);
      const sinAutoridad = await llamar({ ...PERFIL_C, autoridad: ["ninguna"] }, { action_id: idDe(1) });
      expect(sinAutoridad.status).toBe(403);
      expect(sinAutoridad.cuerpo.error).toMatch(/No tienes autoridad para aprobar o publicar el plan/);
      expect(base.escrituras).toEqual([]);
      expect(guardada(1).estado).toBe("reportado");
    });

    it("la consultora SIN prueba → 409 con «reportado no es verificado: falta evidencia», y nada se escribe", async () => {
      const r = await llamar(PERFIL_C, { action_id: idDe(1), nota: "la vi en la visita" });
      expect(r.status).toBe(409);
      expect(r.cuerpo.error).toBe("reportado no es verificado: falta evidencia");
      expect(r.cuerpo.error).toBe(ERROR_SIN_EVIDENCIA);
      expect(base.escrituras).toEqual([]);
      expect(guardada(1).estado).toBe("reportado");
      expect(historialDe(1)).toEqual([]);
    });

    it("la consultora CON prueba → verificado, con quién, cuándo y la nota, y UNA fila de historial «verificar»; el rastro dice con cuántas pruebas", async () => {
      base.tablas.evidencias.push({ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "foto" }, { id: "e2", company_id: EMP, action_id: idDe(1), tipo: "nota" });
      const r = await llamar(PERFIL_C, { action_id: idDe(1), nota: "la foto muestra la plantilla firmada" });
      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ verificada: true, estado: "verificado", pruebas: 2 });
      expect(r.cuerpo.historial_ids).toHaveLength(1);
      expect(guardada(1)).toMatchObject({ estado: "verificado", verificado_por: PERFIL_C.id, verificado_nota: "la foto muestra la plantilla firmada" });
      expect(guardada(1).verificado_at).toBeTruthy();
      expect(historialDe(1)).toHaveLength(1);
      expect(historialDe(1)[0]).toMatchObject({ accion: "verificar", antes: { estado: "reportado" }, despues: { estado: "verificado", verificado_por: PERFIL_C.id }, motivo: "la foto muestra la plantilla firmada", actor_id: PERFIL_C.id, actor_rol: "consultor" });
      expect(base.escrituras.map((e) => `${e.op}:${e.tabla}`)).toEqual(["update:actions", "insert:accion_historial"]);
      expect(rastro()).toContainEqual(expect.objectContaining({ accion: "aprobar", entidad: "accion_verificada", entidadId: idDe(1), detalle: expect.objectContaining({ evento: "verificar", de: "reportado", a: "verificado", pruebas: 2, por_indicador: false }) }));
    });

    it("la prueba puede ser un valor del indicador posterior al reporte: verifica con cero evidencias subidas y el rastro lo dice", async () => {
      const IND = "i1000000-0000-4000-8000-000000000001";
      base.tablas.actions = [{ ...fila(1, "reportado", { reportado_at: "2026-10-10T10:00:00.000Z", indicador_id: IND }) }];
      base.tablas.indicador_valores.push({ id: "v1", indicador_id: IND, created_at: "2026-10-12T00:00:00.000Z" });
      const r = await llamar(PERFIL_C, { action_id: idDe(1) });
      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ verificada: true, estado: "verificado", pruebas: 0 });
      expect(rastro()).toContainEqual(expect.objectContaining({ accion: "aprobar", detalle: expect.objectContaining({ pruebas: 0, por_indicador: true }) }));
    });

    it("una acción que no está reportada no se verifica aunque tenga prueba (antes este PATCH la dejaba «hecho» desde cualquier estado): 409 con lo que sí se puede", async () => {
      for (const estado of ["propuesto", "aprobado", "en_ejecucion", "bloqueado", "rechazado", "pospuesto"]) {
        base.tablas.actions = [{ ...fila(1, estado) }];
        base.tablas.evidencias = [{ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "foto" }];
        const r = await llamar(PERFIL_C, { action_id: idDe(1) });
        expect(r.status, estado).toBe(409);
        expect(r.cuerpo.error, estado).toMatch(/no se puede verificar\. Se puede: /);
        expect(guardada(1).estado).toBe(estado);
      }
      expect(base.escrituras).toEqual([]);
    });

    it("un «hecho» antiguo sin comprobar se lee como reportado: con prueba pasa a verificado por la misma máquina, con su historial", async () => {
      base.tablas.actions = [{ ...fila(1, "hecho") }];
      base.tablas.evidencias.push({ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "archivo" });
      const r = await llamar(PERFIL_C, { action_id: idDe(1) });
      expect(r.status).toBe(200);
      expect(guardada(1)).toMatchObject({ estado: "verificado", verificado_por: PERFIL_C.id });
      expect(historialDe(1)[0]).toMatchObject({ accion: "verificar", antes: { estado: "reportado" }, despues: { estado: "verificado" } });
    });

    it("la acción de otra empresa, o una que no existe, es 404; un cuerpo sin identificador válido es 400; nada se escribe", async () => {
      base.tablas.evidencias.push({ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "foto" });
      const ajena = await llamar(PERFIL_C, { action_id: idDe(1) }, OTRA_EMPRESA);
      expect(ajena.status).toBe(404);
      expect(ajena.cuerpo.error).toBe("Esa acción no es de esta empresa.");
      expect((await llamar(PERFIL_C, { action_id: idDe(9) })).status).toBe(404);
      expect((await llamar(PERFIL_C, { action_id: "no-es-un-uuid" })).status).toBe(400);
      expect((await llamar(PERFIL_C, {})).status).toBe(400);
      expect(base.escrituras).toEqual([]);
      expect(guardada(1).estado).toBe("reportado");
    });
  });

  describe("CIERRE Z5 · POST /api/actions/[id]/transicion · la ruta de verdad: una regla incumplida es 409, igual que en el PATCH de evidencia", () => {
    type Ctx = { params: Promise<{ id: string }> };
    const pedir = async (perfil: Perfil | null, n: number, cuerpo: Fila) => {
      vi.mocked(perfilApi).mockResolvedValue(perfil);
      const req = new Request(`http://8x.test/api/actions/${idDe(n)}/transicion`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } });
      const ctx: Ctx = { params: Promise.resolve({ id: idDe(n) }) };
      const res = await pedirTransicion(req, ctx);
      return { status: res.status, cuerpo: (await res.json()) as Fila };
    };

    beforeEach(() => {
      vi.mocked(perfilApi).mockReset();
      vi.mocked(registrar).mockClear();
      base.tablas.memberships = [{ user_id: PERFIL_D.id, company_id: EMP }];
    });

    it("verificar sin prueba → 409 con «reportado no es verificado: falta evidencia»; el mismo código y el mismo texto que da la ruta de evidencia", async () => {
      base.tablas.actions = [{ ...fila(1, "reportado", { reportado_at: "2026-10-10T10:00:00.000Z" }) }];
      const porTransicion = await pedir(PERFIL_C, 1, { evento: "verificar" });
      expect(porTransicion.status).toBe(409);
      expect(porTransicion.cuerpo.error).toBe(ERROR_SIN_EVIDENCIA);
      vi.mocked(perfilApi).mockResolvedValue(PERFIL_C);
      const porEvidencia = await verificarConEvidencia(
        new Request(`http://8x.test/api/companies/${EMP}/evidencia`, { method: "PATCH", body: JSON.stringify({ action_id: idDe(1) }), headers: { "content-type": "application/json" } }),
        { params: Promise.resolve({ id: EMP }) }
      );
      expect(porEvidencia.status).toBe(porTransicion.status);
      expect(((await porEvidencia.json()) as Fila).error).toBe(porTransicion.cuerpo.error);
      expect(base.escrituras).toEqual([]);
      expect(guardada(1).estado).toBe("reportado");
    });

    it("el límite de frentes lleno, un evento que ese estado no admite, un motivo que falta y un reporte sin prueba: todos 409, y nada se escribe", async () => {
      base.tablas.actions = [fila(1, "aprobado"), fila(2, "en_ejecucion"), fila(3, "reportado"), fila(4, "propuesto")].map((x) => ({ ...x }));
      const lleno = await pedir(PERFIL_C, 4, { evento: "aprobar" });
      expect(lleno.status).toBe(409);
      expect(lleno.cuerpo.error).toMatch(/Ya hay 3 prioridades abiertas y el límite es 3/);
      const noAdmite = await pedir(PERFIL_C, 4, { evento: "verificar" });
      expect(noAdmite.status).toBe(409);
      expect(noAdmite.cuerpo.error).toMatch(/no se puede verificar\. Se puede: /);
      const sinMotivo = await pedir(PERFIL_C, 4, { evento: "rechazar" });
      expect(sinMotivo.status).toBe(409);
      expect(sinMotivo.cuerpo.error).toMatch(/Para rechazar: Di por qué/);
      const sinPrueba = await pedir(PERFIL_D, 2, { evento: "reportar" });
      expect(sinPrueba.status).toBe(409);
      expect(sinPrueba.cuerpo.error).toMatch(/Sin prueba no hay reporte/);
      expect(base.escrituras).toEqual([]);
      expect(guardada(4).estado).toBe("propuesto");
    });

    it("el 400 queda para el cuerpo mal formado, el 404 para la acción que no existe y el 403 para quien no puede; con sitio, 200 y deja historial", async () => {
      base.tablas.actions = [{ ...fila(1, "propuesto") }];
      expect((await pedir(PERFIL_C, 1, { evento: "inventado" })).status).toBe(400);
      expect((await pedir(PERFIL_C, 1, {})).status).toBe(400);
      expect((await pedir(PERFIL_C, 9, { evento: "aprobar" })).status).toBe(404);
      expect((await pedir({ ...PERFIL_C, autoridad: ["ninguna"] }, 1, { evento: "aprobar" })).status).toBe(403);
      expect((await pedir(null, 1, { evento: "aprobar" })).status).toBe(401);
      expect(base.escrituras).toEqual([]);
      const aprobada = await pedir(PERFIL_C, 1, { evento: "aprobar" });
      expect(aprobada.status).toBe(200);
      expect(aprobada.cuerpo).toMatchObject({ estado: "aprobado" });
      expect(historialDe(1).map((h) => h.accion)).toEqual(["aprobar"]);
    });

    it("estático: las dos rutas traducen la regla con el mismo código", () => {
      const SRC = path.resolve(__dirname, "../src");
      for (const ruta of ["app/api/actions/[id]/transicion/route.ts", "app/api/companies/[id]/evidencia/route.ts"]) {
        expect(readFileSync(path.join(SRC, ruta), "utf8"), ruta).toMatch(/instanceof ReglaDelPlan\) return fallo\(e\.message, 409\)/);
      }
    });
  });

  describe("CIERRE Z5 · POST /api/companies/[id]/close · los indicadores de un corte se validan antes de guardar (la ruta de verdad, con dobles)", () => {
    const CIERRA: Perfil = { ...PERFIL_C, autoridad: ["cerrar_medicion"] };
    const corte = async (indicadores: unknown) => {
      vi.mocked(perfilApi).mockResolvedValue(CIERRA);
      const res = await registrarCorte(
        new Request(`http://8x.test/api/companies/${EMP}/close`, { method: "POST", body: JSON.stringify({ corte: { que_se_hizo: "Se ordenó la caja", que_se_trabo: "", indicadores } }), headers: { "content-type": "application/json" } }),
        { params: Promise.resolve({ id: EMP }) }
      );
      return { status: res.status, cuerpo: (await res.json()) as Fila };
    };
    const guardados = () => (base.tablas.checkpoints ?? []).map((c) => c.indicadores);

    beforeEach(() => {
      vi.mocked(perfilApi).mockReset();
      // Sin números en la empresa: el corte es solo qué se hizo y qué se trabó, y no congela ninguna medición.
      base.tablas.company_metricas = [];
      base.tablas.checkpoints = [];
    });

    it("POSITIVA: las formas que la pantalla sabe leer se guardan tal cual: el texto de la consultora, pares sencillos, una lista de nombre y valor, o nada", async () => {
      const buenos: unknown[] = [
        { texto: "Cotizaciones sin el dueño: de 2 a 6 de cada 10" },
        "Subió la venta de mostrador",
        { venta_mes: 40000, caja_cuadrada: true, margen: null },
        [{ nombre: "Cotizaciones sin el dueño", valor: 6, unidad: "de cada 10" }, { clave: "venta_mes", valor: null }, "La caja cuadró toda la quincena"],
        null,
        // REPARO DEL VERIFICADOR: `{ texto }` es lo que manda el formulario y admite lo mismo que el texto suelto.
        // Con 601 caracteres caía en los pares (tope 600 por valor) y daba 400 «llegaron con otra forma».
        { texto: "x".repeat(601) },
        { texto: "palabra ".repeat(250) }, // 2000 justos: el borde entra
        "x".repeat(2000),
      ];
      for (const b of buenos) {
        const r = await corte(b);
        expect(r.status, JSON.stringify(b)).toBe(200);
        // Lo guardado se lee en palabras (o no hay nada): nunca la frase de «no se puede leer».
        expect(indicadoresLegibles(guardados().at(-1))?.legible ?? true, JSON.stringify(b)).toBe(true);
      }
      expect(guardados()).toEqual(buenos);
      // Sin la clave en el cuerpo también vale: es un corte sin indicadores.
      vi.mocked(perfilApi).mockResolvedValue(CIERRA);
      const sin = await registrarCorte(
        new Request(`http://8x.test/api/companies/${EMP}/close`, { method: "POST", body: JSON.stringify({ corte: { que_se_hizo: "Se ordenó la caja" } }), headers: { "content-type": "application/json" } }),
        { params: Promise.resolve({ id: EMP }) }
      );
      expect(sin.status).toBe(200);
      expect(guardados().at(-1)).toBeNull();
    });

    it("NEGATIVA: una forma que la pantalla no sabría leer es 400 con una frase que dice cómo van, y no se guarda nada (antes se guardaba lo que llegara)", async () => {
      const malos: unknown[] = [
        { ventas: { enero: 1, febrero: 2 } },
        [{ a: 1 }],
        [[1, 2]],
        42,
        true,
        [{ nombre: "Venta", valor: { soles: 3 } }],
        [{ nombre: "Venta", valor: 3, extra: "x" }],
        [{ valor: 3 }],
        // JSON metido como texto que no se deja leer, y JSON codificado dos veces.
        { texto: '{"a":1' },
        { nota: '{"x":1}' },
        JSON.stringify(JSON.stringify({ venta_mes: 40000 })),
        { texto: JSON.stringify(JSON.stringify({ venta_mes: 40000 })) },
      ];
      for (const m of malos) {
        const r = await corte(m);
        expect(r.status, JSON.stringify(m).slice(0, 80)).toBe(400);
        expect(r.cuerpo.error).toBe("Los indicadores del corte van como un texto («qué indicador se movió y cuánto») o como una lista corta de nombre y valor. Llegaron con otra forma y no se guardó nada.");
      }
      expect(base.tablas.checkpoints).toEqual([]);
      expect(base.escrituras).toEqual([]);
    });

    it("NEGATIVA POR LARGO (reparo del verificador): lo que se pasa de largo es 400 con SU mensaje, que dice qué se pasa, cuánto tiene y cuánto se admite; nunca «llegaron con otra forma»", async () => {
      const casos: [unknown, string][] = [
        [{ texto: "x".repeat(2001) }, "el texto tiene 2001 caracteres y se admiten hasta 2000"],
        ["x".repeat(2001), "el texto tiene 2001 caracteres y se admiten hasta 2000"],
        [{ venta_mes: 40000, nota: "x".repeat(601) }, "el valor de un indicador tiene 601 caracteres y se admiten hasta 600"],
        [[{ nombre: "Venta", valor: "x".repeat(601) }], "el valor de un indicador tiene 601 caracteres y se admiten hasta 600"],
        [[{ nombre: "n".repeat(201), valor: 3 }], "el nombre de un indicador tiene 201 caracteres y se admiten hasta 200"],
        [[{ nombre: "Venta", valor: 3, unidad: "u".repeat(61) }], "la unidad de un indicador tiene 61 caracteres y se admiten hasta 60"],
        [["x".repeat(601)], "una línea de la lista tiene 601 caracteres y se admiten hasta 600"],
        [Array.from({ length: 41 }, (_, i) => `Línea ${i + 1}`), "la lista tiene 41 indicadores y se admiten hasta 40"],
        [{ ["k".repeat(81)]: 1 }, "el nombre de un indicador tiene 81 caracteres y se admiten hasta 80"],
      ];
      for (const [largo, detalle] of casos) {
        const r = await corte(largo);
        expect(r.status, detalle).toBe(400);
        expect(r.cuerpo.error).toBe(`Los indicadores del corte no se guardaron porque son demasiado largos: ${detalle}. Acórtalos y vuelve a registrar el corte.`);
        expect(r.cuerpo.error).not.toContain("otra forma");
      }
      // Y el mensaje del largo no tapa el de la forma: corto y mal formado sigue diciendo cómo van.
      expect((await corte({ ventas: { enero: 1 } })).cuerpo.error).toMatch(/Llegaron con otra forma y no se guardó nada.$/);
      expect(base.tablas.checkpoints).toEqual([]);
      expect(base.escrituras).toEqual([]);
    });
  });

  it("cargarPlan: lo que falta por acción, el nombre del responsable, el límite, la vigente y las abiertas; si el historial no se puede leer, falla en voz alta", async () => {
    base.tablas.actions = [{ ...fila(1, "aprobado") }, { ...fila(2, "propuesto", { objetivo_empresarial: null }) }];
    base.tablas.accion_historial = [{ id: "h1", action_id: idDe(1), accion: "aprobar", antes: { estado: "propuesto" }, despues: { estado: "aprobado" }, motivo: "los seis campos están", implica: null, actor_id: PERFIL_C.id, actor_rol: "consultor", created_at: "2026-10-12T00:00:00.000Z" }];
    base.tablas.evidencias = [{ id: "e1", company_id: EMP, action_id: idDe(1), tipo: "foto" }, { id: "e2", company_id: EMP, action_id: null, asset_clave: "manual", tipo: "archivo" }];
    const plan = await cargarPlan(EMP);
    expect(plan.limiteFrentes).toBe(3);
    expect(plan.lineaBaseVigente).toMatchObject({ id: LB_V2, version: 2, vigente: true });
    expect(plan.lineasBase.map((l) => l.version)).toEqual([2, 1]);
    expect(plan.abiertas.map((a) => a.id)).toEqual([idDe(1)]);
    const [uno, dos] = plan.acciones;
    expect(uno).toMatchObject({ estado_canonico: "aprobado", responsable_nombre: "Carlos Quispe", pruebas: 1, falta: [] });
    expect(uno.historial).toHaveLength(1);
    expect(uno.historial[0]).toMatchObject({ accion: "aprobar", motivo: "los seis campos están" });
    expect(dos.falta).toEqual([expect.stringMatching(/objetivo empresarial/)]);
    expect(dos.pruebas).toBe(0);

    base.fallar.accion_historial = { op: "select", mensaje: "la relación users no existe" };
    await expect(cargarPlan(EMP)).rejects.toThrow("No se pudo leer el historial: la relación users no existe");
  });
});
