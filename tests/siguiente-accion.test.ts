/**
 * LA SIGUIENTE ACCIÓN DEL PORTAL: UNA, LA MÁS URGENTE, CON SU ENLACE (R6.1, R16.2).
 *
 * Pedido de Dirección (13-10-2026): «El cliente debe ver una siguiente acción clara». La portada solo conocía
 * la entrada breve, la restricción, la pregunta abierta y los pasos 2 a 8; nunca llevaba a «Hacia dónde vamos»,
 * «Tus números», «Esta semana», «Tus indicadores», el punto de partida ni el informe.
 *
 * Aquí se prueba, SIN BASE:
 *  1 · la decisión pura (src/lib/siguiente-accion.ts): una acción por estado, la prioridad entera, y la lectura
 *      de siempre —idéntica a la que escribía la portada— cuando no hay nada nuevo;
 *  2 · de las filas a los hechos: qué cuenta como «sin confirmar», «esta semana», «sin valor» y «falta»;
 *  3 · la lectura (pendientesDelDueno, en tablero.ts) con un doble de PostgREST en memoria: una tabla que todavía
 *      no existe apaga su aviso y nada más; «no se pudo leer» nunca se vuelve «falta»; no escribe.
 *
 * NOTA DE ALCANCE: el doble no es Postgres ni PostgREST: demuestra qué hace el código con cada respuesta, no que
 * las consultas sean válidas contra una base real. La portada se comprueba leyendo su código fuente: aquí no hay
 * navegador, así que eso demuestra que la decisión está enchufada, no que la pantalla abra con datos reales.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

const rastro = vi.hoisted(() => ({ errores: [] as Record<string, unknown>[] }));
vi.mock("@/lib/errores", () => ({
  registrarError: vi.fn(async (e: Record<string, unknown>) => {
    rastro.errores.push(e);
  }),
}));
// Desde aquí no se llega a ninguna base real: quien pida el cliente de verdad, lanza.
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => {
    throw new Error("La prueba no enchufó un doble de base: desde aquí no se toca ninguna base real.");
  },
}));

import {
  siguienteAccion, accionPendiente, accionDeSiempre, accionDeEntrada, PRIORIDAD, ESTADOS_PENDIENTES, ESTADOS_DE_SIEMPRE, SIN_PENDIENTES, RUTA_ENTRADA,
  RUTA_POR_PASO, RUTA_SIN_PASO, direccionSinConfirmar, puntoDePartidaSinAceptar, tareasDelEquipo, indicadoresSinValor, periodoQueToca, numerosQueFaltan,
  type Hechos, type EstadoSiguiente, type Decision, type DeSiempre, type ActaBreve, type MedicionBreve, type IndicadorBreve,
} from "@/lib/siguiente-accion";
import * as tablero from "@/lib/tablero";
import { pendientesDelDueno } from "@/lib/tablero";
import { armar, paraCliente, semanaEnCurso } from "@/lib/revision-semanal";
import { accionVacia, estadoCanonico, type AccionPlan } from "@/lib/plan-reglas";
import { nombreDePeriodoKpi } from "@/lib/kpis";
import { VITALES, type Metrica } from "@/lib/metricas";

const SRC = path.resolve(__dirname, "../src");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const EMP = "0000000a-0000-4000-8000-00000000000a";
const OTRA = "0000000b-0000-4000-8000-00000000000b";
const DUENO = "u0000000-0000-4000-8000-000000000001";
/** Martes 13 de octubre de 2026, 07:00 en Lima. La semana en curso va del lunes 12 al domingo 18. */
const HOY = new Date("2026-10-13T12:00:00Z");
const LIMA = "America/Lima";

// ───────────────────────── 1 · LA DECISIÓN ─────────────────────────

const RESTRICCION = { titulo: "Todo pasa por ti: sin ti no se cotiza", linea: "Cada cotización espera dos días.", href: "/portal/conversacion?tema=delegar" };
const PREGUNTA = "¿Quién decide el precio cuando tú no estás?";
const QUE_FALTA = "Tu plan está en marcha. Marca lo que vas cerrando.";

/** Hechos con SOLO esos estados encendidos. El paso del recorrido existe siempre que haya lectura de siempre. */
function con(...encendidos: EstadoSiguiente[]): Hechos {
  const on = (e: EstadoSiguiente) => encendidos.includes(e);
  const hayDeSiempre = on("restriccion") || on("pregunta_abierta") || on("paso");
  return {
    entrada: on("entrada") ? { estado: "en_curso", respondidas: 5, total: 12 } : null,
    comoDueno: true,
    direccion: on("direccion") ? { version: 2 } : null,
    puntoDePartida: on("punto_de_partida") ? { version: 1 } : null,
    tareas: { estaSemana: on("tareas_semana") ? 3 : 0, enMarcha: on("tareas_semana") || on("tareas_en_marcha") ? 5 : 0 },
    indicadores: on("indicador") ? [{ nombre: "Devoluciones al mes", periodo: "2026-09" }] : [],
    numeros: { faltan: on("numeros") ? 4 : 0, total: 9 },
    informeListo: on("informe"),
    informeAbierto: false,
    deSiempre: hayDeSiempre ? { restriccion: on("restriccion") ? RESTRICCION : null, preguntaAbierta: on("pregunta_abierta") ? PREGUNTA : null, paso: 8, queFalta: QUE_FALTA } : null,
  };
}

/** Lo que cada estado dice y a dónde lleva. Escrito aquí entero: si el texto cambia, que sea a propósito. */
const ESPERADO: Record<EstadoSiguiente, { texto: string; href: string; accion: string }> = {
  entrada: { texto: "Vas en la pregunta 6 de 12.", href: "/portal/entrada", accion: "Continuar" },
  direccion: { texto: "Revisa hacia dónde va tu empresa.", href: "/portal/direccion", accion: "Leer y confirmar" },
  punto_de_partida: { texto: "Confirma tu punto de partida.", href: "/portal/resultados", accion: "Revisar y aceptar" },
  tareas_semana: { texto: "Tienes 3 tareas esta semana.", href: "/portal/semana", accion: "Ver esta semana" },
  indicador: { texto: "Registra «Devoluciones al mes».", href: "/portal/kpis", accion: "Registrar el valor" },
  numeros: { texto: "Completa tus números.", href: "/portal/numeros", accion: "Completar mis números" },
  tareas_en_marcha: { texto: "Tienes 5 tareas en marcha.", href: "/portal/plan", accion: "Ver mi plan" },
  informe: { texto: "Tu informe está listo.", href: "/portal/informe", accion: "Ver mi informe" },
  restriccion: { texto: RESTRICCION.titulo, href: RESTRICCION.href, accion: "Resolver esto ahora" },
  pregunta_abierta: { texto: PREGUNTA, href: "/portal/conversacion", accion: "Responder ahora" },
  paso: { texto: QUE_FALTA, href: "/portal/plan", accion: "Continuar" },
};

const NUEVOS: EstadoSiguiente[] = [...ESTADOS_PENDIENTES];
const palabras = (a: Decision) => [a.texto, a.linea ?? "", a.fuente ?? "", a.accion].join(" ");

describe("la decisión: una acción por estado, con su enlace", () => {
  it("el orden es este, entero y a la vista", () => {
    expect([...PRIORIDAD]).toEqual([
      "entrada",
      "direccion", "punto_de_partida", "tareas_semana", "indicador", "numeros", "tareas_en_marcha", "informe",
      "restriccion", "pregunta_abierta", "paso",
    ]);
    expect([...ESTADOS_PENDIENTES, ...ESTADOS_DE_SIEMPRE]).toEqual(PRIORIDAD.slice(1));
    // Los cuatro que ya existían conservan su orden entre ellos.
    const deAntes = PRIORIDAD.filter((e) => e === "entrada" || (ESTADOS_DE_SIEMPRE as readonly string[]).includes(e));
    expect(deAntes).toEqual(["entrada", "restriccion", "pregunta_abierta", "paso"]);
  });

  it.each([...PRIORIDAD])("con solo «%s» encendido devuelve exactamente esa acción", (estado) => {
    const a = siguienteAccion(con(estado));
    expect(a, `«${estado}» no produjo ninguna acción`).not.toBeNull();
    expect(a!.estado).toBe(estado);
    expect({ texto: a!.texto, href: a!.href, accion: a!.accion }).toEqual(ESPERADO[estado]);
    // Una, no una lista: un texto, un enlace, un botón.
    expect(Array.isArray(a)).toBe(false);
    expect(a!.texto.trim().length).toBeGreaterThan(0);
    expect(a!.accion.trim().length).toBeGreaterThan(0);
    expect(a!.href.startsWith("/portal")).toBe(true);
  });

  it("los seis lugares que la portada nunca señalaba ahora tienen quién los señale", () => {
    const destinos = NUEVOS.map((e) => siguienteAccion(con(e))!.href);
    for (const ruta of ["/portal/direccion", "/portal/numeros", "/portal/semana", "/portal/plan", "/portal/kpis", "/portal/resultados", "/portal/informe"]) {
      expect(destinos, `ningún estado lleva a ${ruta}`).toContain(ruta);
    }
  });

  it("todo enlace fijo lleva a una pantalla que existe", () => {
    const fijos = new Set<string>([RUTA_ENTRADA, RUTA_SIN_PASO, "/portal/conversacion", ...Object.values(RUTA_POR_PASO), ...NUEVOS.map((e) => siguienteAccion(con(e))!.href)]);
    for (const ruta of fijos) expect(existsSync(path.join(SRC, "app/(cliente)", ruta, "page.tsx")), `${ruta} no tiene page.tsx`).toBe(true);
  });

  it("sin ningún hecho no hay acción: null, no una frase de relleno", () => {
    expect(siguienteAccion({})).toBeNull();
    expect(siguienteAccion({ ...SIN_PENDIENTES, entrada: null, deSiempre: null })).toBeNull();
    expect(accionPendiente(SIN_PENDIENTES)).toBeNull();
    expect(accionPendiente({})).toBeNull();
  });
});

describe("la prioridad: siempre gana la más urgente", () => {
  const parejas = PRIORIDAD.flatMap((arriba, i) => PRIORIDAD.slice(i + 1).map((abajo) => [arriba, abajo] as const));

  it.each(parejas)("«%s» va antes que «%s»", (arriba, abajo) => {
    expect(siguienteAccion(con(arriba, abajo))?.estado).toBe(arriba);
  });

  it("con todo encendido manda la entrada; al ir apagando de arriba abajo, aparece el siguiente y solo ese", () => {
    for (let i = 0; i < PRIORIDAD.length; i++) {
      const quedan = PRIORIDAD.slice(i);
      expect(siguienteAccion(con(...quedan))?.estado, `con ${quedan.join(", ")} encendidos`).toBe(PRIORIDAD[i]);
    }
  });

  it("la decisión entera es la suma de sus tres tramos: entrada, lo que espera al dueño y la lectura de siempre", () => {
    const casos: Hechos[] = [...PRIORIDAD.map((e) => con(e)), con(...PRIORIDAD), con("numeros", "restriccion"), con("informe", "paso"), con("tareas_en_marcha", "pregunta_abierta")];
    for (const h of casos) {
      const deEntrada = accionDeEntrada(h.entrada ?? null);
      const porTramos = deEntrada ? { ...deEntrada, estado: "entrada" } : (accionPendiente(h) ?? (h.deSiempre ? accionDeSiempre(h.deSiempre) : null));
      expect(siguienteAccion(h)).toEqual(porTramos);
    }
  });
});

describe("la lectura de siempre, cuando no hay nada nuevo", () => {
  const sinNada = (d: DeSiempre): Hechos => ({ ...SIN_PENDIENTES, comoDueno: true, entrada: null, deSiempre: d });

  it("la restricción manda, con su costo y su fuente, tal como la escribía la portada", () => {
    expect(siguienteAccion(sinNada({ restriccion: RESTRICCION, preguntaAbierta: PREGUNTA, paso: 3, queFalta: "Conversemos." }))).toEqual({
      estado: "restriccion",
      texto: RESTRICCION.titulo,
      linea: RESTRICCION.linea,
      fuente: "Visto en tu propia información — nada es inventado.",
      href: RESTRICCION.href,
      accion: "Resolver esto ahora",
    });
  });

  it("sin restricción, la conversación a mitad", () => {
    expect(siguienteAccion(sinNada({ restriccion: null, preguntaAbierta: PREGUNTA, paso: 3, queFalta: "Conversemos." }))).toEqual({
      estado: "pregunta_abierta",
      texto: PREGUNTA,
      linea: null,
      fuente: "Tu conversación está a mitad — cada respuesta afina el diagnóstico.",
      href: "/portal/conversacion",
      accion: "Responder ahora",
    });
  });

  it.each([
    [2, "/portal/activos"],
    [3, "/portal/conversacion"],
    [4, "/portal/validar"],
    [5, "/portal/procesos"],
    [6, "/portal/activos"],
    [7, "/portal/resultados"],
    [8, "/portal/plan"],
  ])("sin restricción ni pregunta, el paso %i lleva a %s con «Continuar»", (paso, ruta) => {
    const frase = `Frase del paso ${paso}.`;
    expect(siguienteAccion(sinNada({ restriccion: null, preguntaAbierta: null, paso, queFalta: frase }))).toEqual({ estado: "paso", texto: frase, linea: null, fuente: null, href: ruta, accion: "Continuar" });
  });

  it("un paso que no tiene pantalla propia lleva a «Mi empresa»", () => {
    for (const paso of [0, 1, 9]) expect(accionDeSiempre({ restriccion: null, preguntaAbierta: null, paso, queFalta: "x" }).href).toBe("/portal/hoy");
  });

  it("la entrada sin confirmar sigue por delante de todo, con sus tres textos de siempre", () => {
    const todo = con(...PRIORIDAD);
    expect(siguienteAccion({ ...todo, entrada: { estado: "sin_empezar", respondidas: 0, total: 12 } })).toMatchObject({ estado: "entrada", href: "/portal/entrada", accion: "Empezar", texto: "Empecemos por conocer tu negocio." });
    expect(siguienteAccion({ ...todo, entrada: { estado: "en_curso", respondidas: 5, total: 12 } })).toMatchObject({ estado: "entrada", accion: "Continuar", texto: "Vas en la pregunta 6 de 12." });
    expect(siguienteAccion({ ...todo, entrada: { estado: "por_confirmar", respondidas: 12, total: 12 } })).toMatchObject({ estado: "entrada", accion: "Revisar y confirmar" });
    // Confirmada, o sin entrada (empresas que ya estaban en marcha): no manda.
    expect(siguienteAccion({ ...todo, entrada: { estado: "confirmada", respondidas: 12, total: 12 } })?.estado).toBe("direccion");
    expect(siguienteAccion({ ...todo, entrada: null })?.estado).toBe("direccion");
  });

  it("tablero.ts sigue exportando la entrada con los nombres de antes", () => {
    expect(tablero.accionDeEntrada).toBe(accionDeEntrada);
    expect(tablero.RUTA_ENTRADA).toBe("/portal/entrada");
    expect(typeof tablero.entradaDesde).toBe("function");
    expect(typeof tablero.tableroEmpresario).toBe("function");
    // Lo que tests/entrada.test.ts lee del código de tablero.ts y de la portada sigue escrito igual (se repite aquí
    // porque esa prueba no es de este encargo: si alguien lo toca, que falle también esta).
    expect(leer("lib/tablero.ts")).toContain('.neq("interview_sessions.tipo", "entrada_breve")');
    const portada = leer("app/(cliente)/portal/page.tsx");
    expect(portada).toContain("const deEntrada = accionDeEntrada(t.entrada);");
    expect(portada).toContain("const lectura = deEntrada ?? lecturaDeSiempre;");
  });
});

describe("lo que no se sabe no se anuncia", () => {
  const base = con("paso");

  it("quien no es el dueño no recibe confirmaciones que no puede dar", () => {
    const h: Hechos = { ...base, comoDueno: false, direccion: { version: 2 }, puntoDePartida: { version: 1 } };
    expect(siguienteAccion(h)?.estado).toBe("paso");
    expect(siguienteAccion({ ...h, comoDueno: true })?.estado).toBe("direccion");
    // Lo demás sí le llega: las tareas y los números son de la empresa.
    expect(siguienteAccion({ ...h, tareas: { estaSemana: 1, enMarcha: 1 } })?.estado).toBe("tareas_semana");
  });

  it("el informe solo se anuncia si está listo Y consta que el dueño no lo abrió", () => {
    expect(siguienteAccion({ ...base, informeListo: true, informeAbierto: false })?.estado).toBe("informe");
    expect(siguienteAccion({ ...base, informeListo: true, informeAbierto: true })?.estado).toBe("paso");
    expect(siguienteAccion({ ...base, informeListo: true, informeAbierto: null })?.estado, "sin rastro legible no se sabe si lo abrió").toBe("paso");
    expect(siguienteAccion({ ...base, informeListo: false, informeAbierto: false })?.estado).toBe("paso");
  });

  it("cero, vacío y null son «no hay»: ni tareas, ni indicadores, ni números", () => {
    expect(siguienteAccion({ ...base, tareas: null, indicadores: [], numeros: null })?.estado).toBe("paso");
    expect(siguienteAccion({ ...base, tareas: { estaSemana: 0, enMarcha: 0 }, numeros: { faltan: 0, total: 9 } })?.estado).toBe("paso");
    expect(siguienteAccion({ ...base, tareas: { estaSemana: Number.NaN, enMarcha: -2 }, numeros: { faltan: -1, total: 9 } })?.estado).toBe("paso");
  });
});

describe("los textos: claros, con el número bien dicho y sin jerga", () => {
  it("una tarea es «1 tarea»; varias, «tareas»", () => {
    expect(siguienteAccion({ tareas: { estaSemana: 1, enMarcha: 4 } })?.texto).toBe("Tienes 1 tarea esta semana.");
    expect(siguienteAccion({ tareas: { estaSemana: 2, enMarcha: 4 } })?.texto).toBe("Tienes 2 tareas esta semana.");
    expect(siguienteAccion({ tareas: { estaSemana: 0, enMarcha: 1 } })).toMatchObject({ texto: "Tienes 1 tarea en marcha.", href: "/portal/plan" });
    expect(siguienteAccion({ tareas: { estaSemana: 0, enMarcha: 1 } })?.linea).toContain("No empieza ni vence esta semana.");
    expect(siguienteAccion({ tareas: { estaSemana: 0, enMarcha: 4 } })?.linea).toContain("Ninguna empieza ni vence esta semana.");
  });

  it("si alguna tarea toca esta semana, nunca se dice que «ninguna vence»", () => {
    expect(accionPendiente({ tareas: { estaSemana: 2, enMarcha: 5 } })?.estado).toBe("tareas_semana");
    const todasLasFrases = PRIORIDAD.map((e) => siguienteAccion({ ...con(e), tareas: { estaSemana: 2, enMarcha: 5 } })).map((a) => (a ? palabras(a) : ""));
    for (const frase of todasLasFrases) expect(frase).not.toMatch(/[Nn]inguna empieza|No empieza ni vence/);
  });

  it("el indicador se nombra, con el periodo que falta en palabras, y se dice cuántos más hay", () => {
    const uno = siguienteAccion({ indicadores: [{ nombre: "  Ventas de la semana ", periodo: "2026-S41" }] })!;
    expect(uno.texto).toBe("Registra «Ventas de la semana».");
    expect(uno.linea).toBe(`Falta el valor de ${nombreDePeriodoKpi("2026-S41")}. Si no tienes el dato, se anota como sin dato, no como cero.`);
    expect(uno.linea).toContain("Semana 41 de 2026");
    const tres = siguienteAccion({ indicadores: [{ nombre: "Devoluciones al mes", periodo: "2026-09" }, { nombre: "Reclamos", periodo: "2026-09" }, { nombre: "Caja del día", periodo: "2026-10-12" }] })!;
    expect(tres.texto).toBe("Registra «Devoluciones al mes».");
    expect(tres.linea).toContain("Setiembre 2026");
    expect(tres.linea).toMatch(/Hay 2 más por anotar\.$/);
    // Un indicador sin nombre no deja comillas vacías en la portada.
    expect(siguienteAccion({ indicadores: [{ nombre: "  ", periodo: "2026-09" }] })?.texto).toBe("Registra tu indicador.");
  });

  it("los números dicen cuántos faltan y de cuántos", () => {
    expect(siguienteAccion({ numeros: { faltan: 1, total: 9 } })?.linea).toMatch(/^Te falta 1 de los 9 números de tu negocio\./);
    expect(siguienteAccion({ numeros: { faltan: 4, total: 9 } })?.linea).toMatch(/^Te faltan 4 de los 9 números de tu negocio\./);
  });

  it("ningún texto usa jerga de consultoría", () => {
    const variantes: Hechos[] = [
      ...PRIORIDAD.map((e) => con(e)),
      { entrada: { estado: "sin_empezar", respondidas: 0, total: 12 } },
      { entrada: { estado: "por_confirmar", respondidas: 12, total: 12 } },
      { tareas: { estaSemana: 1, enMarcha: 1 } },
      { tareas: { estaSemana: 0, enMarcha: 1 } },
      { numeros: { faltan: 1, total: 9 } },
      { indicadores: [{ nombre: "Reclamos", periodo: "2026-T3" }, { nombre: "Caja", periodo: "2026-10-Q1" }] },
      { indicadores: [{ nombre: "", periodo: "2026-10-12" }] },
    ];
    const frases = variantes.map((h) => siguienteAccion(h)).filter((a): a is Decision => a != null).map(palabras);
    expect(frases.length).toBe(variantes.length);
    for (const frase of frases) {
      for (const jerga of ["pilar", "claim", "KPI", "baseline", "matriz", "línea base", "stakeholder", "feedback", "dashboard"]) {
        expect(frase.toLowerCase(), `«${frase}» contiene «${jerga}»`).not.toContain(jerga.toLowerCase());
      }
      // Tampoco se le enseña un código de periodo ni un identificador.
      expect(frase).not.toMatch(/\d{4}-(\d{2}|S\d{2}|T\d)\b/);
    }
  });

  it("los textos nuevos hablan de tú, terminan en punto y caben en una línea de titular", () => {
    for (const estado of NUEVOS) {
      const a = siguienteAccion(con(estado))!;
      expect(a.texto, estado).toMatch(/\.$/);
      expect(a.texto.length, `el titular de «${estado}» es demasiado largo`).toBeLessThanOrEqual(60);
      expect(a.linea, `«${estado}» no explica nada debajo del titular`).toBeTruthy();
      expect(a.fuente).toBeNull();
      expect(palabras(a)).not.toMatch(/\busted\b|\bsu empresa\b/i);
    }
  });
});

// ───────────────────────── 2 · DE LAS FILAS A LOS HECHOS ─────────────────────────

const F2 = "f0000000-0000-4000-8000-000000000002";
const M1 = "m0000000-0000-4000-8000-000000000001";
const M2 = "m0000000-0000-4000-8000-000000000002";
const acta = (parcial: Partial<ActaBreve> & { referencia_id: string }): ActaBreve => ({ tipo: "ficha_direccion", aceptado_rol: "dueno", aceptado_at: "2026-10-10T15:00:00Z", ...parcial });

describe("hacia dónde va la empresa: acordada y sin la constancia del dueño", () => {
  const ficha = { id: F2, version: 2 };

  it("sin versión acordada no hay nada que confirmar", () => {
    expect(direccionSinConfirmar(null, [])).toBeNull();
    expect(direccionSinConfirmar(undefined, [acta({ referencia_id: F2 })])).toBeNull();
  });

  it("acordada y sin acta: falta, y dice qué versión", () => {
    expect(direccionSinConfirmar(ficha, [])).toEqual({ version: 2 });
  });

  it("la constancia de la consultora no reemplaza la palabra del dueño", () => {
    expect(direccionSinConfirmar(ficha, [acta({ referencia_id: F2, aceptado_rol: "consultor" })])).toEqual({ version: 2 });
    expect(direccionSinConfirmar(ficha, [acta({ referencia_id: F2, aceptado_rol: null })])).toEqual({ version: 2 });
    expect(direccionSinConfirmar(ficha, [acta({ referencia_id: F2, aceptado_rol: "socio" })])).toEqual({ version: 2 });
  });

  it("confirmó ESTA versión: ya no falta; haber confirmado la anterior no cuenta", () => {
    expect(direccionSinConfirmar(ficha, [acta({ referencia_id: F2 })])).toBeNull();
    expect(direccionSinConfirmar(ficha, [acta({ referencia_id: F2, aceptado_rol: "cliente" })])).toBeNull();
    expect(direccionSinConfirmar(ficha, [acta({ referencia_id: "f0000000-0000-4000-8000-000000000001" })])).toEqual({ version: 2 });
    // Un acta de otra clase con el mismo identificador no confirma la ficha.
    expect(direccionSinConfirmar(ficha, [acta({ referencia_id: F2, tipo: "linea_base" })])).toEqual({ version: 2 });
  });
});

describe("el punto de partida: vigente y sin la aceptación del dueño", () => {
  const v1: MedicionBreve = { id: M1, tipo: "linea_base", version: 1, vigente: false };
  const v2: MedicionBreve = { id: M2, tipo: "linea_base", version: 2, vigente: true };
  const corte: MedicionBreve = { id: "m0000000-0000-4000-8000-000000000009", tipo: "corte" };

  it("sin punto de partida fijado no hay nada que aceptar", () => {
    expect(puntoDePartidaSinAceptar([], [])).toBeNull();
    expect(puntoDePartidaSinAceptar([corte], [])).toBeNull();
  });

  it("la versión que rige sin acta del dueño: falta, aunque haya aceptado la anterior", () => {
    expect(puntoDePartidaSinAceptar([v1, v2, corte], [])).toEqual({ version: 2 });
    expect(puntoDePartidaSinAceptar([v1, v2], [acta({ tipo: "linea_base", referencia_id: M1 })])).toEqual({ version: 2 });
    expect(puntoDePartidaSinAceptar([v1, v2], [acta({ tipo: "linea_base", referencia_id: M2, aceptado_rol: "consultor" })])).toEqual({ version: 2 });
  });

  it("el dueño aceptó la versión que rige: ya no falta", () => {
    expect(puntoDePartidaSinAceptar([v1, v2], [acta({ tipo: "linea_base", referencia_id: M2 })])).toBeNull();
  });

  it("una fila anterior al versionado (sin versión ni marca) cuenta como la versión 1", () => {
    expect(puntoDePartidaSinAceptar([{ id: M1, tipo: "linea_base" }], [])).toEqual({ version: 1 });
  });
});

const ROSA = { id: "p1000000-0000-4000-8000-000000000001", nombre: "Rosa Quispe", puesto: "Encargada de tienda" };
function accion(id: string, titulo: string, parcial: Partial<AccionPlan> = {}): AccionPlan {
  return accionVacia({ id, company_id: EMP, accion: titulo, estado: "en_ejecucion", responsable_participant_id: ROSA.id, ...parcial });
}

/** El plan de ejemplo. A la derecha, qué se espera de cada una el martes 13 de octubre de 2026. */
const PLAN: AccionPlan[] = [
  accion("a01", "Cotizar sin el dueño", { vence_at: "2026-10-15" }), // vence esta semana
  accion("a02", "Ordenar el almacén", { estado: "aprobado", fecha_inicio: "2026-10-12", vence_at: "2026-10-30" }), // empieza esta semana
  accion("a03", "Cobrar las facturas vencidas", { vence_at: "2026-10-07" }), // venció y sigue abierta
  accion("a04", "Escribir el manual de caja", { estado: "aprobado", fecha_inicio: "2026-10-26", vence_at: "2026-11-10" }), // en marcha, otra semana
  accion("a05", "Definir la lista de precios", { vence_at: "2026-10-14", responsable_participant_id: null }), // sin persona asignada: es de la empresa igual
  accion("a06", "Capacitar a ventas", { estado: "bloqueado", vence_at: "2026-10-14" }), // trabada: no cuenta
  accion("a07", "Ordenar las compras", { estado: "reportado", vence_at: "2026-10-13", reportado_at: "2026-10-12T15:00:00Z" }), // enviada a revisar: no cuenta
  accion("a08", "Cerrar la caja diaria", { estado: "verificado", vence_at: "2026-10-13" }), // comprobada: no cuenta
  accion("a09", "Abrir otra tienda", { estado: "propuesto", vence_at: "2026-10-16" }), // propuesta: no obliga
  accion("a10", "Cambiar de proveedor", { estado: "rechazado", vence_at: "2026-10-16" }),
  accion("a11", "Comprar una balanza", { estado: "pospuesto", vence_at: "2026-10-16" }),
  accion("a12", "Llamar a los clientes dormidos", { estado: "en_curso", vence_at: "2026-10-16" }), // estado de antes: se lee como en ejecución
  accion("a13", "Pintar el local", { estado: "hecho", vence_at: "2026-10-16" }), // estado de antes: se lee como reportada
  accion("a14", "Revisar los contratos", {}), // en marcha, sin fechas
];
const ESTA_SEMANA = ["a01", "a02", "a03", "a05", "a12"];
const EN_MARCHA = [...ESTA_SEMANA, "a04", "a14"];

describe("las tareas: aprobadas o en ejecución; «esta semana» es la de la empresa", () => {
  it("cuenta las abiertas, y aparte las que empiezan o vencen esta semana o ya vencieron", () => {
    expect(tareasDelEquipo(PLAN, HOY, LIMA)).toEqual({ estaSemana: ESTA_SEMANA.length, enMarcha: EN_MARCHA.length });
    expect(tareasDelEquipo([], HOY, LIMA)).toEqual({ estaSemana: 0, enMarcha: 0 });
  });

  it("una por una: cuáles cuentan y cuáles no", () => {
    for (const a of PLAN) {
      const t = tareasDelEquipo([a], HOY, LIMA);
      expect(t.estaSemana, `«${a.accion}» (${a.estado}) · esta semana`).toBe(ESTA_SEMANA.includes(a.id) ? 1 : 0);
      expect(t.enMarcha, `«${a.accion}» (${a.estado}) · en marcha`).toBe(EN_MARCHA.includes(a.id) ? 1 : 0);
    }
  });

  it("toda tarea que cuenta la portada está en «Esta semana», y las de otra semana no", () => {
    const zona = LIMA;
    const revision = armar({ companyId: EMP, acciones: PLAN, historial: [], indicadores: [], valores: [], evidencias: [], participantes: [ROSA], mediciones: [], textos: null, zona }, semanaEnCurso(HOY, zona), HOY);
    const abiertas = new Set(PLAN.filter((a) => ["aprobado", "en_ejecucion"].includes(estadoCanonico(a))).map((a) => a.id));
    const enLaRevision = new Set(
      [...revision.que_debia_ocurrir.filter((x) => x.clase === "accion").map((x) => x.id), ...revision.desvios.filter((d) => d.tipo === "retraso").map((d) => d.id)].filter((id) => abiertas.has(id))
    );
    // La regla de la portada y la de la revisión semanal dan el mismo conjunto: si una cambia, esta prueba lo dice.
    expect([...enLaRevision].sort()).toEqual([...ESTA_SEMANA].sort());
    expect(tareasDelEquipo(PLAN, HOY, zona).estaSemana).toBe(enLaRevision.size);

    const pantalla = paraCliente(revision);
    const loQueVeElDueno = [...pantalla.esperado, ...pantalla.falta].join("\n");
    for (const a of PLAN.filter((x) => ESTA_SEMANA.includes(x.id))) expect(loQueVeElDueno, `«${a.accion}» se contó y no sale en la pantalla`).toContain(`«${a.accion}»`);
    for (const id of ["a04", "a14"]) expect(loQueVeElDueno).not.toContain(`«${PLAN.find((a) => a.id === id)!.accion}»`);
  });

  it("la semana se cuenta con el reloj de la empresa, no con el del servidor", () => {
    // Domingo 18 a las 23:30 en Lima ya es lunes 19 en UTC. Para Lima la semana sigue siendo la del 12 al 18.
    const domingoDeNoche = new Date("2026-10-19T04:30:00Z");
    const delLunes19 = [accion("b01", "Abrir la tienda nueva", { estado: "aprobado", fecha_inicio: "2026-10-19", vence_at: "2026-10-23" })];
    expect(tareasDelEquipo(delLunes19, domingoDeNoche, LIMA)).toEqual({ estaSemana: 0, enMarcha: 1 });
    expect(tareasDelEquipo(delLunes19, domingoDeNoche, "Europe/Madrid")).toEqual({ estaSemana: 1, enMarcha: 1 });
    // Sin zona, o con una que no existe, se cuenta con la de la casa: America/Lima.
    expect(tareasDelEquipo(delLunes19, domingoDeNoche)).toEqual({ estaSemana: 0, enMarcha: 1 });
    expect(tareasDelEquipo(delLunes19, domingoDeNoche, "Marte/Olympus")).toEqual({ estaSemana: 0, enMarcha: 1 });
  });

  it("lo que vence hoy todavía no está vencido, pero es de esta semana", () => {
    expect(tareasDelEquipo([accion("c01", "Entregar la cotización", { vence_at: "2026-10-13" })], HOY, LIMA)).toEqual({ estaSemana: 1, enMarcha: 1 });
    // Un instante con hora en vez de un día: cuenta el día.
    expect(tareasDelEquipo([accion("c02", "Entregar el pedido", { vence_at: "2026-10-16T00:00:00+00:00" })], HOY, LIMA)).toEqual({ estaSemana: 1, enMarcha: 1 });
  });
});

const indicador = (id: string, nombre: string, parcial: Partial<IndicadorBreve> = {}): IndicadorBreve => ({ id, nombre, estado: "activo", frecuencia: "mensual", estado_validacion: "declarado", ...parcial });

describe("los indicadores: activos y sin el valor del periodo que ya cerró", () => {
  it("el periodo que toca es el último que cerró: el mes pasado, la semana pasada, ayer", () => {
    expect(periodoQueToca({ frecuencia: "mensual" }, HOY, LIMA)).toBe("2026-09");
    expect(periodoQueToca({ frecuencia: "semanal" }, HOY, LIMA)).toBe("2026-S41");
    expect(periodoQueToca({ frecuencia: "diaria" }, HOY, LIMA)).toBe("2026-10-12");
    expect(periodoQueToca({ frecuencia: "quincenal" }, HOY, LIMA)).toBe("2026-09-Q2");
    expect(periodoQueToca({ frecuencia: "trimestral" }, HOY, LIMA)).toBe("2026-T3");
    // Una frecuencia vacía o desconocida se lee como mensual, igual que en el resto de la casa.
    expect(periodoQueToca({ frecuencia: null }, HOY, LIMA)).toBe("2026-09");
    expect(periodoQueToca({ frecuencia: "cada tanto" }, HOY, LIMA)).toBe("2026-09");
  });

  it("falta si ese periodo no tiene valor; tener el de otro mes no lo cubre", () => {
    const k = [indicador("k1", "Devoluciones al mes")];
    expect(indicadoresSinValor(k, [], HOY, LIMA)).toEqual([{ nombre: "Devoluciones al mes", periodo: "2026-09" }]);
    expect(indicadoresSinValor(k, [{ indicador_id: "k1", periodo: "2026-08" }], HOY, LIMA)).toEqual([{ nombre: "Devoluciones al mes", periodo: "2026-09" }]);
    expect(indicadoresSinValor(k, [{ indicador_id: "k2", periodo: "2026-09" }], HOY, LIMA)).toHaveLength(1);
    expect(indicadoresSinValor(k, [{ indicador_id: "k1", periodo: "2026-09" }], HOY, LIMA)).toEqual([]);
  });

  it("solo los activos; los propuestos y los archivados no se le piden al dueño", () => {
    const ks = [indicador("k1", "Propuesto", { estado: "propuesto" }), indicador("k2", "Archivado", { estado: "archivado" }), indicador("k3", "Activo")];
    expect(indicadoresSinValor(ks, [], HOY, LIMA).map((i) => i.nombre)).toEqual(["Activo"]);
  });

  it("si lo último que anotó fue «sin dato», no se le vuelve a pedir desde la portada", () => {
    expect(indicadoresSinValor([indicador("k1", "Reclamos", { estado_validacion: "sin_dato" })], [], HOY, LIMA)).toEqual([]);
    expect(indicadoresSinValor([indicador("k1", "Reclamos", { estado_validacion: null })], [], HOY, LIMA)).toHaveLength(1);
  });

  it("conserva el orden recibido y a cada uno le pide el periodo de su frecuencia", () => {
    const ks = [indicador("k1", "Ventas de la semana", { frecuencia: "semanal" }), indicador("k2", "Devoluciones al mes"), indicador("k3", "Caja del día", { frecuencia: "diaria" })];
    expect(indicadoresSinValor(ks, [{ indicador_id: "k2", periodo: "2026-09" }], HOY, LIMA)).toEqual([
      { nombre: "Ventas de la semana", periodo: "2026-S41" },
      { nombre: "Caja del día", periodo: "2026-10-12" },
    ]);
  });

  it("el mes cierra en el reloj de la empresa: el 30 a las 22:00 de Lima setiembre todavía no cerró", () => {
    const treintaDeNoche = new Date("2026-10-01T03:00:00Z");
    const k = [indicador("k1", "Devoluciones al mes")];
    expect(indicadoresSinValor(k, [{ indicador_id: "k1", periodo: "2026-08" }], treintaDeNoche, LIMA)).toEqual([]);
    expect(indicadoresSinValor(k, [{ indicador_id: "k1", periodo: "2026-08" }], treintaDeNoche, "Europe/Madrid")).toEqual([{ nombre: "Devoluciones al mes", periodo: "2026-09" }]);
  });
});

describe("los números: faltan los que no tienen ni cifra ni un «no lo sé»", () => {
  const de = (clave: string, parcial: Partial<Metrica> = {}): Metrica => ({ clave, periodo: VITALES.find((v) => v.clave === clave)?.mensual ? "2026-09" : "actual", valor: 1000, estado: "contado", ...parcial });

  it("sin nada contado faltan todos", () => {
    expect(numerosQueFaltan([])).toEqual({ faltan: VITALES.length, total: VITALES.length });
    expect(VITALES.length).toBe(9);
  });

  it("un número contado y un «no lo sé» ya no faltan; uno descartado sí", () => {
    const [a, b, c] = VITALES.map((v) => v.clave);
    expect(numerosQueFaltan([de(a!)])).toEqual({ faltan: 8, total: 9 });
    expect(numerosQueFaltan([de(a!), de(b!, { valor: null, estado: "sin_dato" })])).toEqual({ faltan: 7, total: 9 });
    expect(numerosQueFaltan([de(a!), de(c!, { estado: "descartado" })])).toEqual({ faltan: 8, total: 9 });
    // Un número que no es de los nueve no completa nada.
    expect(numerosQueFaltan([{ clave: "merma_semanal", periodo: "actual", valor: 12, estado: "contado" }])).toEqual({ faltan: 9, total: 9 });
  });

  it("con los nueve respondidos no falta ninguno, y entonces la portada no lo pide", () => {
    const todos = VITALES.map((v) => de(v.clave));
    expect(numerosQueFaltan(todos)).toEqual({ faltan: 0, total: 9 });
    expect(accionPendiente({ numeros: numerosQueFaltan(todos) })).toBeNull();
  });
});

// ───────────────────────── 3 · LA LECTURA, CON UN DOBLE DE BASE ─────────────────────────

type Fila = Record<string, unknown>;
type ErrorDoble = { code?: string; message: string };

/**
 * Un doble de PostgREST en memoria, solo para leer: filtra con eq/in, ordena y corta. `fallas` hace que una tabla
 * responda con ese error (la que no existe, la que perdió una columna, la que se cayó). Cualquier intento de
 * escribir queda anotado en `escrituras`.
 */
function dobleDeBase(tablas: Record<string, Fila[]>, fallas: Record<string, ErrorDoble> = {}) {
  const pedidas: string[] = [];
  const escrituras: string[] = [];
  const from = (tabla: string) => {
    pedidas.push(tabla);
    const filtros: ((f: Fila) => boolean)[] = [];
    let orden: { columna: string; asc: boolean } | null = null;
    let tope = Number.POSITIVE_INFINITY;
    const ejecutar = (): { data: Fila[] | null; error: ErrorDoble | null } => {
      const falla = fallas[tabla];
      if (falla) return { data: null, error: falla };
      let filas = (tablas[tabla] ?? []).filter((f) => filtros.every((p) => p(f)));
      if (orden) {
        const { columna, asc } = orden;
        filas = [...filas].sort((a, b) => (String(a[columna] ?? "") < String(b[columna] ?? "") ? -1 : String(a[columna] ?? "") > String(b[columna] ?? "") ? 1 : 0) * (asc ? 1 : -1));
      }
      return { data: filas.slice(0, tope), error: null };
    };
    const escribir = (op: string) => () => {
      escrituras.push(`${op} ${tabla}`);
      return q;
    };
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filtros.push((f) => f[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[k])); return q; },
      order: (columna: string, o?: { ascending?: boolean }) => { orden = { columna, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { tope = n; return q; },
      insert: escribir("insert"),
      update: escribir("update"),
      upsert: escribir("upsert"),
      delete: escribir("delete"),
      maybeSingle: async () => { const r = ejecutar(); return { data: r.error ? null : (r.data?.[0] ?? null), error: r.error }; },
      then: (res: (v: { data: Fila[] | null; error: ErrorDoble | null }) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  type Sb = NonNullable<NonNullable<Parameters<typeof pendientesDelDueno>[2]>["sb"]>;
  return { sb: { from } as unknown as Sb, pedidas, escrituras };
}

/** Una empresa con todo pendiente: ficha acordada, punto de partida vigente, plan, indicadores, números a medias, informe sin abrir. */
function empresaConTodoPendiente(): Record<string, Fila[]> {
  const vitales = VITALES.map((v) => v.clave);
  return {
    companies: [{ id: EMP, zona_horaria: LIMA }],
    memberships: [{ user_id: DUENO, company_id: EMP, nivel: "dueno" }],
    ficha_direccion: [
      { id: "f0000000-0000-4000-8000-000000000001", company_id: EMP, estado: "reemplazada", version: 1 },
      { id: F2, company_id: EMP, estado: "acordada", version: 2 },
      { id: "f0000000-0000-4000-8000-000000000003", company_id: EMP, estado: "borrador", version: 3 },
      { id: "f0000000-0000-4000-8000-000000000009", company_id: OTRA, estado: "acordada", version: 9 },
    ],
    mediciones: [
      { id: M1, company_id: EMP, tipo: "linea_base", version: 1, vigente: false },
      { id: M2, company_id: EMP, tipo: "linea_base", version: 2, vigente: true },
      { id: "m0000000-0000-4000-8000-000000000009", company_id: EMP, tipo: "corte", version: null, vigente: null },
    ],
    actas_aceptacion: [
      // El dueño aceptó la versión 1 del punto de partida, no la 2; y la consultora dejó su constancia de la ficha.
      { company_id: EMP, tipo: "linea_base", referencia_id: M1, aceptado_rol: "dueno", aceptado_at: "2026-09-02T15:00:00Z" },
      { company_id: EMP, tipo: "ficha_direccion", referencia_id: F2, aceptado_rol: "consultor", aceptado_at: "2026-10-09T15:00:00Z" },
    ],
    actions: PLAN.map((a) => ({ ...a })),
    indicadores: [
      { id: "k1", company_id: EMP, nombre: "Devoluciones al mes", estado: "activo", frecuencia: "mensual", estado_validacion: "declarado", created_at: "2026-09-01T10:00:00Z" },
      { id: "k2", company_id: EMP, nombre: "Ventas de la semana", estado: "activo", frecuencia: "semanal", estado_validacion: "declarado", created_at: "2026-09-02T10:00:00Z" },
      { id: "k3", company_id: EMP, nombre: "Reclamos", estado: "propuesto", frecuencia: "mensual", estado_validacion: null, created_at: "2026-09-03T10:00:00Z" },
      { id: "k9", company_id: OTRA, nombre: "De otra empresa", estado: "activo", frecuencia: "mensual", estado_validacion: null, created_at: "2026-09-01T10:00:00Z" },
    ],
    indicador_valores: [
      { indicador_id: "k1", periodo: "2026-08", valor: 4 },
      { indicador_id: "k2", periodo: "2026-S41", valor: 12000 },
    ],
    company_metricas: [
      { company_id: EMP, clave: vitales[0], periodo: "2026-09", valor: 42000, estado: "contado" },
      { company_id: EMP, clave: vitales[1], periodo: "2026-09", valor: null, estado: "sin_dato" },
      { company_id: OTRA, clave: vitales[2], periodo: "actual", valor: 5000, estado: "contado" },
    ],
    audit_log: [
      { id: 1, company_id: EMP, accion: "ver", entidad: "informe_diagnostico", actor_rol: "consultor" },
      { id: 2, company_id: OTRA, accion: "ver", entidad: "informe_diagnostico", actor_rol: "cliente" },
    ],
  };
}

const elDueno = { id: DUENO, rol: "cliente" as const };

describe("pendientesDelDueno: lee lo que espera al dueño", () => {
  beforeEach(() => {
    rastro.errores.length = 0;
  });

  it("con todo pendiente, cada hecho sale de sus filas y solo de las de su empresa", async () => {
    const { sb, escrituras } = dobleDeBase(empresaConTodoPendiente());
    const p = await pendientesDelDueno(EMP, elDueno, { sb, ahora: HOY });
    expect(p).toEqual({
      comoDueno: true,
      direccion: { version: 2 },
      puntoDePartida: { version: 2 },
      tareas: { estaSemana: ESTA_SEMANA.length, enMarcha: EN_MARCHA.length },
      indicadores: [{ nombre: "Devoluciones al mes", periodo: "2026-09" }],
      numeros: { faltan: 7, total: 9 },
      informeListo: false,
      informeAbierto: false,
    });
    expect(escrituras, "leer lo pendiente no escribe nada").toEqual([]);
    expect(rastro.errores).toEqual([]);
    // Con esos hechos la portada pide primero la confirmación de hacia dónde va la empresa.
    expect(accionPendiente(p)).toMatchObject({ estado: "direccion", href: "/portal/direccion" });
  });

  it("cuando el dueño cumple, el aviso se apaga y aparece el siguiente", async () => {
    const tablas = empresaConTodoPendiente();
    const leerDeNuevo = async () => pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase(tablas).sb, ahora: HOY });

    tablas.actas_aceptacion!.push({ company_id: EMP, tipo: "ficha_direccion", referencia_id: F2, aceptado_rol: "dueno", aceptado_at: "2026-10-13T09:00:00Z" });
    expect(accionPendiente(await leerDeNuevo())?.estado).toBe("punto_de_partida");

    tablas.actas_aceptacion!.push({ company_id: EMP, tipo: "linea_base", referencia_id: M2, aceptado_rol: "dueno", aceptado_at: "2026-10-13T09:05:00Z" });
    expect(accionPendiente(await leerDeNuevo())).toMatchObject({ estado: "tareas_semana", texto: `Tienes ${ESTA_SEMANA.length} tareas esta semana.` });

    for (const a of tablas.actions!) if (ESTA_SEMANA.includes(String(a.id))) a.estado = "reportado";
    expect(accionPendiente(await leerDeNuevo())).toMatchObject({ estado: "indicador", texto: "Registra «Devoluciones al mes»." });

    tablas.indicador_valores!.push({ indicador_id: "k1", periodo: "2026-09", valor: 3 });
    expect(accionPendiente(await leerDeNuevo())).toMatchObject({ estado: "numeros", href: "/portal/numeros" });

    tablas.company_metricas = VITALES.map((v) => ({ company_id: EMP, clave: v.clave, periodo: v.mensual ? "2026-09" : "actual", valor: 100, estado: "contado" }));
    expect(accionPendiente(await leerDeNuevo())).toMatchObject({ estado: "tareas_en_marcha", texto: "Tienes 2 tareas en marcha." });

    for (const a of tablas.actions!) a.estado = "verificado";
    const sinTareas = await leerDeNuevo();
    expect(accionPendiente(sinTareas)).toBeNull();
    // El informe lo decide la portada: aquí solo consta que el dueño todavía no lo abrió.
    expect(accionPendiente({ ...sinTareas, informeListo: true })?.estado).toBe("informe");

    tablas.audit_log!.push({ id: 3, company_id: EMP, accion: "ver", entidad: "informe_diagnostico", actor_rol: "cliente" });
    const alFinal = await leerDeNuevo();
    expect(alFinal.informeAbierto).toBe(true);
    expect(accionPendiente({ ...alFinal, informeListo: true })).toBeNull();
  });

  it("un líder o un participante no es el dueño; la consultora que mira como él, sí", async () => {
    const tablas = empresaConTodoPendiente();
    tablas.memberships = [{ user_id: DUENO, company_id: EMP, nivel: "lider" }];
    const lider = await pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase(tablas).sb, ahora: HOY });
    expect(lider.comoDueno).toBe(false);
    expect(accionPendiente(lider)?.estado, "a quien no puede confirmar se le muestra lo siguiente").toBe("tareas_semana");

    tablas.memberships = [];
    expect((await pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase(tablas).sb, ahora: HOY })).comoDueno).toBe(false);

    const doble = dobleDeBase(tablas);
    const consultora = await pendientesDelDueno(EMP, { id: "u0000000-0000-4000-8000-000000000099", rol: "consultor" }, { sb: doble.sb, ahora: HOY });
    expect(consultora.comoDueno).toBe(true);
    expect(doble.pedidas, "a la consultora no se le busca membresía").not.toContain("memberships");
  });

  it("una empresa sin nada de esto: ningún aviso, y los nueve números por contar", async () => {
    const p = await pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase({ memberships: [{ user_id: DUENO, company_id: EMP, nivel: "dueno" }] }).sb, ahora: HOY });
    expect(p).toEqual({ comoDueno: true, direccion: null, puntoDePartida: null, tareas: { estaSemana: 0, enMarcha: 0 }, indicadores: [], numeros: { faltan: 9, total: 9 }, informeListo: false, informeAbierto: false });
    expect(accionPendiente(p)?.estado).toBe("numeros");
    expect(rastro.errores).toEqual([]);
  });
});

describe("pendientesDelDueno: la portada nunca se cae por una migración pendiente", () => {
  beforeEach(() => {
    rastro.errores.length = 0;
  });

  const FALTA_TABLA: ErrorDoble = { code: "42P01", message: 'relation "public.x" does not exist' };
  const FALTA_COLUMNA: ErrorDoble = { code: "42703", message: "column x.y does not exist" };
  const FUERA_DE_CACHE: ErrorDoble = { code: "PGRST205", message: "Could not find the table 'public.x' in the schema cache" };

  /** Qué hecho depende de cada tabla, y cómo queda cuando esa tabla (o su columna) no existe. */
  const CASOS: [string, ErrorDoble, (p: Awaited<ReturnType<typeof pendientesDelDueno>>) => void][] = [
    ["ficha_direccion", FALTA_TABLA, (p) => expect(p.direccion).toBeNull()],
    ["ficha_direccion", FUERA_DE_CACHE, (p) => expect(p.direccion).toBeNull()],
    ["mediciones", FALTA_COLUMNA, (p) => expect(p.puntoDePartida).toBeNull()],
    ["actas_aceptacion", FALTA_TABLA, (p) => { expect(p.direccion).toBeNull(); expect(p.puntoDePartida).toBeNull(); }],
    ["actas_aceptacion", FUERA_DE_CACHE, (p) => { expect(p.direccion).toBeNull(); expect(p.puntoDePartida).toBeNull(); }],
    ["actions", FALTA_COLUMNA, (p) => expect(p.tareas).toBeNull()],
    ["indicadores", FALTA_COLUMNA, (p) => expect(p.indicadores).toEqual([])],
    ["indicador_valores", FALTA_TABLA, (p) => expect(p.indicadores).toEqual([])],
    ["indicador_valores", FUERA_DE_CACHE, (p) => expect(p.indicadores).toEqual([])],
    ["company_metricas", FALTA_TABLA, (p) => expect(p.numeros).toBeNull()],
    ["audit_log", FALTA_TABLA, (p) => expect(p.informeAbierto).toBeNull()],
  ];

  it.each(CASOS)("sin %s (%o) ese aviso no aparece, los demás siguen y no queda error anotado", async (tabla, error, comprobar) => {
    const completa = await pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase(empresaConTodoPendiente()).sb, ahora: HOY });
    const p = await pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase(empresaConTodoPendiente(), { [tabla]: error }).sb, ahora: HOY });
    comprobar(p);
    // Lo que no depende de esa tabla queda igual que con la base completa.
    const dependen: Record<string, (keyof typeof p)[]> = {
      ficha_direccion: ["direccion"],
      mediciones: ["puntoDePartida"],
      actas_aceptacion: ["direccion", "puntoDePartida"],
      actions: ["tareas"],
      indicadores: ["indicadores"],
      indicador_valores: ["indicadores"],
      company_metricas: ["numeros"],
      audit_log: ["informeAbierto"],
    };
    for (const campo of Object.keys(completa) as (keyof typeof p)[]) {
      if (!dependen[tabla]!.includes(campo)) expect(p[campo], `«${campo}» cambió al faltar ${tabla}`).toEqual(completa[campo]);
    }
    expect(rastro.errores, "una migración pendiente no es un error que anotar en cada visita").toEqual([]);
    // Y con lo que quedó, la decisión sigue dando una acción (o ninguna), nunca una excepción.
    expect(() => accionPendiente(p)).not.toThrow();
  });

  it("sin ninguna de las tablas nuevas la portada queda como antes: ningún aviso nuevo", async () => {
    const fallas = Object.fromEntries(["ficha_direccion", "actas_aceptacion", "indicadores", "indicador_valores", "audit_log"].map((t) => [t, FALTA_TABLA]));
    const tablas = empresaConTodoPendiente();
    tablas.company_metricas = VITALES.map((v) => ({ company_id: EMP, clave: v.clave, periodo: v.mensual ? "2026-09" : "actual", valor: 100, estado: "contado" }));
    const p = await pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase(tablas, { ...fallas, mediciones: FALTA_COLUMNA, actions: FALTA_COLUMNA }).sb, ahora: HOY });
    expect(accionPendiente({ ...p, informeListo: true })).toBeNull();
    expect(rastro.errores).toEqual([]);
  });

  it("«no se pudo leer» no se vuelve «falta»: sin las actas no se le pide confirmar lo que quizá ya confirmó", async () => {
    const tablas = empresaConTodoPendiente();
    tablas.actas_aceptacion!.push({ company_id: EMP, tipo: "ficha_direccion", referencia_id: F2, aceptado_rol: "dueno", aceptado_at: "2026-10-13T09:00:00Z" });
    tablas.actas_aceptacion!.push({ company_id: EMP, tipo: "linea_base", referencia_id: M2, aceptado_rol: "dueno", aceptado_at: "2026-10-13T09:05:00Z" });
    const p = await pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase(tablas, { actas_aceptacion: { message: "connection reset by peer" } }).sb, ahora: HOY });
    expect(p.direccion).toBeNull();
    expect(p.puntoDePartida).toBeNull();
  });

  it("un fallo que no es de migración tampoco tumba la portada, pero queda anotado para la consultora", async () => {
    const p = await pendientesDelDueno(EMP, elDueno, { sb: dobleDeBase(empresaConTodoPendiente(), { actions: { message: "connection reset by peer" }, audit_log: { code: "57014", message: "canceling statement due to statement timeout" } }).sb, ahora: HOY });
    expect(p.tareas).toBeNull();
    expect(p.informeAbierto).toBeNull();
    expect(p.direccion).toEqual({ version: 2 });
    expect(rastro.errores).toHaveLength(1);
    expect(rastro.errores[0]).toMatchObject({ ruta: "/portal", companyId: EMP, actorId: DUENO });
    expect(String(rastro.errores[0]!.detalle)).toContain("connection reset by peer");
    expect(String(rastro.errores[0]!.detalle)).toContain("statement timeout");
  });

  it("si ni siquiera hay cliente de base, devuelve «nada pendiente» y lo anota: no lanza", async () => {
    // Sin doble, pedir el cliente lanza (así está armada esta prueba). La portada tiene que seguir.
    const p = await pendientesDelDueno(EMP, elDueno, { ahora: HOY });
    expect(p).toEqual({ ...SIN_PENDIENTES });
    expect(accionPendiente(p)).toBeNull();
    expect(rastro.errores).toHaveLength(1);
  });

  it("una base que lanza en vez de responder con error tampoco la tumba", async () => {
    const sb = { from: () => { throw new Error("fetch failed"); } } as unknown as NonNullable<NonNullable<Parameters<typeof pendientesDelDueno>[2]>["sb"]>;
    const p = await pendientesDelDueno(EMP, elDueno, { sb, ahora: HOY });
    expect(accionPendiente(p)).toBeNull();
    expect(p.comoDueno).toBe(false);
    expect(rastro.errores).toHaveLength(1);
    expect(String(rastro.errores[0]!.detalle)).toContain("fetch failed");
  });
});

// ───────────────────────── LA PORTADA USA LA DECISIÓN (lectura del código, sin navegador) ─────────────────────────

describe("la portada: pinta UNA acción, la que decide siguiente-accion.ts", () => {
  const portada = leer("app/(cliente)/portal/page.tsx");
  const decision = leer("lib/siguiente-accion.ts");
  const lector = leer("lib/tablero.ts");

  it("junta los hechos y delega: entrada, después lo que espera al dueño, después la lectura de siempre", () => {
    expect(portada).toContain("pendientesDelDueno(c.companyId, c.u)");
    expect(portada).toContain("const deEntrada = accionDeEntrada(t.entrada);");
    expect(portada).toMatch(/const lecturaDeSiempre =\s+accionPendiente\(\{ \.\.\.pendientes, informeListo \}\) \?\?\s+accionDeSiempre\(\{/);
    expect(portada).toContain("const lectura = deEntrada ?? lecturaDeSiempre;");
    // La misma composición que `siguienteAccion`: la prueba «la decisión entera es la suma de sus tres tramos» la ata.
    expect(decision).toMatch(/export function siguienteAccion\(h: Hechos\): Decision \| null \{\s+return recorrer\(PRIORIDAD, h\);/);
  });

  it("un solo botón de acción, con el texto y el enlace que vienen de la decisión", () => {
    expect(portada.match(/boton boton--grande/g) ?? []).toHaveLength(1);
    expect(portada).toContain('<Link href={lectura.href} className="boton boton--grande">{lectura.accion}</Link>');
    expect(portada).toContain("{lectura.texto}");
  });

  it("los textos de los estados no se repiten escritos a mano en la portada", () => {
    for (const estado of NUEVOS) expect(portada, `la portada vuelve a escribir «${ESPERADO[estado].accion}»`).not.toContain(ESPERADO[estado].accion);
    for (const frase of ["Resolver esto ahora", "Responder ahora", "Completa tus números", "Tu informe está listo"]) expect(portada).not.toContain(frase);
  });

  it("el informe solo se da por listo con diagnóstico y al menos una conclusión firme", () => {
    expect(portada).toMatch(/const informeListo = hoy\.nivel >= 3 && hallazgos\.filter\(\(h\) => !h\.provisional\)\.length \+ hoy\.fortalezas\.length > 0;/);
  });

  it("la decisión no toca la base; la lectura no escribe en las tablas de la empresa", () => {
    expect(decision).not.toMatch(/supabase|\.from\(|fetch\(/);
    const cuerpo = lector.slice(lector.indexOf("export async function pendientesDelDueno"));
    expect(cuerpo.length).toBeGreaterThan(500);
    expect(cuerpo).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });
});
