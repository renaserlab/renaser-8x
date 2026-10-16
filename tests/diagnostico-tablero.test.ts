/**
 * EL TABLERO DE DIAGNÓSTICO (src/lib/diagnostico-tablero.ts, src/lib/diagnostico-datos.ts y la portada de la empresa,
 * 16-10-2026).
 *
 * Lo que se fija:
 *  - `armarDiagnostico` da los cuatro bloques y la pantalla los pinta en su orden (procesos, dependencia, dinero,
 *    resultado);
 *  - para el dueño: sin dimensiones, sin puntajes por área, sin «Lo que falta» y sin el detalle de cada cifra;
 *  - para la consultora: «Lo que falta» con 5 filas como mucho, en el orden fijo y con la sección correcta;
 *  - null (no se pudo leer) no es «vacío»: se dice distinto y no se le pide al cliente lo que quizá ya dio;
 *  - la cuenta de los puntajes por área es la del Panorama, movida sin cambiar;
 *  - la portada de /empresa/[id], con la base en memoria: con datos que no cuadran, el aviso y «Pedir al cliente que
 *    los corrija»; sin ellos, ningún aviso; una empresa recién creada, todo «sin dato», el medidor sin dato, la ficha
 *    de trabajo abierta y ningún «S/ 0» inventado.
 *
 * Cómo se prueba: `supabaseAdmin()` es la base en memoria de tests/fixtures/base-falsa.ts; la página se renderiza con
 * renderToStaticMarkup. Nadie la abrió en un navegador y los botones no se tocan aquí. Todo es FICTICIO.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseFalsa, type Fila } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => "/empresa", redirect: () => {}, notFound: () => {} }));
vi.mock("next/link", async () => {
  const { createElement: ce } = await import("react");
  return {
    default: ({ href, children, ...resto }: { href: string; children?: unknown } & Record<string, unknown>) => {
      delete resto.prefetch;
      return ce("a", { href, ...resto }, children as never);
    },
  };
});

import { armarDiagnostico, conteoProcesos, loQueFalta, puntajesPorPilar, saludDe, serieDeMeses, type HechosDiagnostico, type EntradaPuntajes } from "@/lib/diagnostico-tablero";
import { mesPasadoEn } from "@/lib/diagnostico-datos";
import { FICHA_VACIA } from "@/lib/rentabilidad";
import { porDefecto } from "@/lib/formato";
import { bibliotecaEsperada } from "@/lib/biblioteca";
import { dimensionesVacias, type ConteoProcesos } from "@/lib/ficha-direccion";
import type { MapaEmpresa } from "@/lib/mapa-empresa";
import type { Solicitud } from "@/lib/secciones";
import type { HechosIncongruencia } from "@/lib/incongruencias";

vi.setConfig({ testTimeout: 60_000 });

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Jeans del Valle (ficticia)
const CERO_INVENTADO = /S\/\s0(?![.,]?\d)/;
const PROHIBIDAS = /contribuci[oó]n|costo variable|\bSKU\b|matriz|\bKPI\b|claim|extra[ií]do|decisi[oó]n|INTERNO/i;

// ─────────────────────── Hechos de prueba ───────────────────────

const conteo = (total: number, conDueno: number, decideSolo: number): ConteoProcesos => ({
  total, con_dueno: conDueno, decide_solo: decideSolo, nombres_con_dueno: [], nombres_decide_solo: [],
  texto: `participa en ${conDueno} de ${total} procesos del mapa; en ${decideSolo} de ellos es el único que decide`,
});

const incongruenciasFalsas = (extra: Partial<HechosIncongruencia> = {}): HechosIncongruencia => ({
  metricas: [{ clave: "gasto_fijo_mes", periodo: "2026-09", valor: 4000, estado: "contado" }],
  lineas: [],
  costos: [
    { id: "c1", periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler", dato: { valor: 2000, estado: "contado" }, nota: null },
    { id: "c2", periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos", dato: { valor: 3000, estado: "contado" }, nota: null },
  ],
  ficha: { ...FICHA_VACIA }, config: porDefecto, claimsContradichas: [], preguntaDeRespuesta: new Map(), declarantes: new Map(), correcciones: [], mesPasado: "2026-09",
  ...extra,
});

const puntajes = (): EntradaPuntajes => ({
  diagnosticos: [{ pilar: "procesos", estado: "critico" }, { pilar: "marketing", estado: "mejorable" }, { pilar: "producto", estado: "desconocido" }],
  claims: [...Array.from({ length: 19 }, () => ({ pilar: "procesos", estado: "confirmado" })), ...Array.from({ length: 19 }, () => ({ pilar: "marketing", estado: "confirmado" })), { pilar: "personas", estado: "sin_verificar" }],
  hallazgos: [{ pilar: "procesos", impacto: "alto", requiere_validacion: false, filtros: null }, { pilar: "marketing", impacto: "medio", requiere_validacion: true, filtros: null }],
  procesos: [{ confirmacion: "confirmado" }, { confirmacion: null }],
  activos: bibliotecaEsperada(2).map((clave) => ({ clave, estado: "en_uso" })),
  personas: 2,
});

const sol = (seccion: Solicitud["seccion"], e: Solicitud["estado"]): Solicitud => ({ id: `s-${seccion}-${e}`, company_id: EMP, seccion, nota: null, estado: e, activada_at: "2026-10-15T13:00:00.000Z", completada_at: e === "completada" ? "2026-10-16T13:00:00.000Z" : null });

function hechos(h: Partial<HechosDiagnostico> = {}): HechosDiagnostico {
  return {
    para: "consultora",
    config: porDefecto,
    admitida: true,
    procesos: { esperados: 5, dibujados: 2, conResponsable: 2, escritos: 1, medidos: 0, nivel: 0.9, nombreNivel: "Sin mapear", lista: [] },
    dependencia: { conteo: conteo(2, 2, 1), dimensiones: dimensionesVacias(), seDetiene: ["Si no estoy, nadie aprueba los descuentos."] },
    metricas: [{ clave: "venta_mes", periodo: "2026-08", valor: 39900, estado: "verificado" }, { clave: "venta_mes", periodo: "2026-09", valor: 41800, estado: "contado" }],
    negocio: { lineas: [], costos: [], ficha: { ...FICHA_VACIA }, operaciones: [] },
    incongruencias: incongruenciasFalsas(),
    resultado: { puntajes: puntajes(), restricciones: [{ titulo: "El precio del jean clásico no cubre la tela de este año", monto: "hasta S/ 2,100 al mes", porCorroborar: false }], publicado: true, enMarcha: ["Subir el precio del jean clásico"] },
    ruta: { productos: { lineas: 0, completas: 0 }, costos: { conMonto: 0 }, historia: { respondidas: 2 }, organigrama: { puestos: 0, documentoConfirmado: false } },
    solicitudes: [sol("corroborar_diagnostico", "activa"), sol("productos", "completada")],
    porConfirmar: 3,
    ...h,
  };
}

// ─────────────────────── Lo puro ───────────────────────

describe("armarDiagnostico", () => {
  it("da los cuatro bloques, la restricción arriba con su monto y lo que no cuadra", () => {
    const t = armarDiagnostico(hechos(), "consultora");
    expect(Object.keys(t)).toEqual(expect.arrayContaining(["procesos", "dependencia", "dinero", "resultado"]));
    expect(t.frase).toBe("El precio del jean clásico no cubre la tela de este año");
    expect(t.monto).toBe("hasta S/ 2,100 al mes");
    expect(t.incongruencias.map((i) => i.regla)).toEqual(["gasto_fijo_vs_tabla"]);
    expect(t.dinero.numeros).toEqual({ conCifra: 1, comprobados: 1, noLoSabe: 0, total: 9 });
    expect(t.dinero.serie.map((p) => p.valor)).toEqual([39900, 41800]);
    expect(t.dependencia.procesos).toEqual({ total: 2, conDueno: 2, decideSolo: 1 });
    expect(t.dependencia.dimensiones).toHaveLength(8);
    expect(t.dependencia.dimensiones!.every((d) => d.estado === "sin_dato")).toBe(true);
  });

  it("sin restricción con evidencia, lo dice; una por corroborar va después de una crítica", () => {
    expect(armarDiagnostico(hechos({ resultado: { puntajes: puntajes(), restricciones: [], publicado: true, enMarcha: [] } }), "consultora").frase).toBe("Todavía no hay una restricción con evidencia");
    const t = armarDiagnostico(
      hechos({ resultado: { puntajes: puntajes(), restricciones: [{ titulo: "Por corroborar", monto: null, porCorroborar: true }, { titulo: "Crítica", monto: null, porCorroborar: false }], publicado: true, enMarcha: [] } }),
      "consultora"
    );
    expect(t.frase).toBe("Crítica");
    expect(t.monto).toBeNull();
  });

  it("para el dueño: sin dimensiones, sin áreas, sin «Lo que falta», sin el detalle de cada cifra, y su frase con lo que hay", () => {
    const t = armarDiagnostico(hechos({ para: "dueno", dependencia: { conteo: conteo(5, 3, 1), dimensiones: null, seDetiene: [] } }), "dueno");
    expect(t.dependencia.dimensiones).toBeNull();
    expect(t.resultado.pilares).toBeNull();
    expect(t.resultado.salud).toBeNull();
    expect(t.loQueFalta).toHaveLength(0);
    for (const i of t.incongruencias) {
      expect(i.izquierda.detalle).toBe("");
      expect(i.derecha?.detalle ?? "").toBe("");
    }
    expect(t.frase).toBe("Tu empresa hoy vende S/ 41,800 al mes (setiembre de 2026) y participas en 3 de 5 procesos.");
    // Sin repetir el total: «Tus procesos», al lado, ya lo dice (revisión del 16-10-2026).
    expect(t.dependencia.frase).toBe("Estás en 3 procesos y en 1 eres la única persona que decide.");
    const vacio = armarDiagnostico(hechos({ para: "dueno", metricas: [], dependencia: { conteo: conteo(0, 0, 0), dimensiones: null, seDetiene: [] } }), "dueno");
    expect(vacio.frase).toBe("Todavía estamos reuniendo lo que hace falta para leer tu empresa.");
    // Sin publicar: ni restricción ni nada que diga que encontró algo.
    const sinPublicar = armarDiagnostico(hechos({ para: "dueno", resultado: { puntajes: null, restricciones: [{ titulo: "x", monto: null, porCorroborar: false }], publicado: false, enMarcha: [] } }), "dueno");
    expect(sinPublicar.resultado.restriccion).toBeNull();
    expect(sinPublicar.resultado.falta).toBe("Tu consultora está terminando tu diagnóstico");
    expect(sinPublicar.frase).not.toMatch(PROHIBIDAS);
  });
});

describe("loQueFalta", () => {
  it("5 como mucho, en el orden fijo, con la sección correcta y su pedido", () => {
    const f = loQueFalta(hechos());
    expect(f).toHaveLength(5);
    expect(f.map((x) => x.clave)).toEqual(["incongruencias", "numeros", "productos", "costos", "historia"]);
    expect(f.map((x) => x.seccion)).toEqual(["corroborar_diagnostico", "datos_faltantes", "productos", "costos", "historia"]);
    expect(f[0]!.pedido).toEqual({ estado: "activa", desde: "2026-10-15T13:00:00.000Z" });
    expect(f[2]!.pedido).toEqual({ estado: "completada", desde: "2026-10-16T13:00:00.000Z" });
    expect(f[1]!.pedido).toBeNull();
  });

  it("con todo lo de arriba al día, siguen procesos, organigrama, por confirmar y evidencia", () => {
    const f = loQueFalta(
      hechos({
        incongruencias: null,
        metricas: ["venta_mes", "ganancia_mes", "caja_hoy", "gasto_fijo_mes", "precio_producto_estrella", "costo_producto_estrella", "conversion_de_cada_10", "deuda_clientes", "deuda_propia"].map((clave) => ({ clave, periodo: "actual", valor: 10, estado: "contado" })),
        ruta: { productos: { lineas: 3, completas: 3 }, costos: { conMonto: 2 }, historia: { respondidas: 5 }, organigrama: { puestos: 0, documentoConfirmado: false } },
        resultado: { puntajes: { ...puntajes(), claims: [] }, restricciones: [], publicado: true, enMarcha: [] },
      })
    );
    expect(f.map((x) => x.clave)).toEqual(["procesos", "organigrama", "por_confirmar", "evidencia"]);
    expect(f.map((x) => x.seccion)).toEqual(["subir_procesos", "subir_organigrama", "corroborar_diagnostico", null]);
    expect(f[3]!.href).toBe("/entrevista");
  });

  it("lo que no se pudo leer no se le pide al cliente; y para el dueño no hay lista", () => {
    const f = loQueFalta(hechos({ incongruencias: null, metricas: null, ruta: null, procesos: null, porConfirmar: null, resultado: null }));
    expect(f).toHaveLength(0);
    expect(loQueFalta(hechos({ para: "dueno" }))).toHaveLength(0);
  });
});

describe("null no es vacío", () => {
  it("procesos, dinero, dependencia y resultado dicen «no se pudo leer», distinto de «todavía no hay»", () => {
    const sinLeer = armarDiagnostico(hechos({ procesos: null, metricas: null, dependencia: null, resultado: null }), "consultora");
    const vacio = armarDiagnostico(
      hechos({
        procesos: conteoProcesos({ procesos: [], empresa: { nivel: 0, nombre: "Sin mapear", mapeados: 0, esperados: 0, nivelMapeados: 0, nombreMapeados: "Sin mapear" } } as unknown as MapaEmpresa),
        metricas: [],
        dependencia: { conteo: conteo(0, 0, 0), dimensiones: null, seDetiene: [] },
        resultado: { puntajes: { ...puntajes(), diagnosticos: [] }, restricciones: [], publicado: false, enMarcha: [] },
      }),
      "consultora"
    );
    expect(sinLeer.procesos.falta).toBe("No se pudo leer el mapa de procesos");
    expect(vacio.procesos.falta).toBe("Todavía no hay procesos dibujados");
    expect(sinLeer.dinero.falta).toBe("No se pudieron leer los números de la empresa");
    expect(vacio.dinero.falta).toBe("Todavía no hay ninguno de los 9 números");
    expect(sinLeer.dependencia.falta).toMatch(/No se pudo leer/);
    expect(vacio.dependencia.falta).toBe("Hacen falta procesos dibujados para contar");
    expect(sinLeer.resultado.falta).toBe("No se pudo leer el diagnóstico");
    expect(vacio.resultado.falta).toBe("Corre el diagnóstico en Hallazgos");
    expect(vacio.resultado.salud).toBeNull();
  });
});

describe("las piezas", () => {
  it("conteoProcesos: dibujado es nivel 1 o más; escritos 3+, medidos 4+; con responsable desde que se dijo quién", () => {
    const ev = (nivel: number, siguiente: string | null) => ({ nivel, nombre: `n${nivel}`, siguiente, porque: [] });
    const mapa = {
      procesos: [
        { id: "a", nombre: "Atender un pedido", categoria: null, evaluacion: ev(4, "Falta que el número mejore") },
        { id: "b", nombre: "Corte", categoria: null, evaluacion: ev(3, "Falta el número") },
        { id: "c", nombre: "Compras", categoria: null, evaluacion: ev(1, "Falta decir cuánto toma") },
        { id: "d", nombre: "Caja", categoria: null, evaluacion: ev(1, "Falta decir quién responde, cuánto toma") },
        { id: "e", nombre: "Despacho", categoria: null, evaluacion: ev(0, "Cuéntanos cómo funciona y lo dibujamos") },
      ],
      empresa: { nivel: 1.1, nombre: "Contado", mapeados: 5, esperados: 6, nivelMapeados: 1.8, nombreMapeados: "Contado" },
    } as unknown as MapaEmpresa;
    const c = conteoProcesos(mapa);
    expect(c).toMatchObject({ esperados: 6, dibujados: 4, conResponsable: 3, escritos: 2, medidos: 1, nivel: 1.1, nombreNivel: "Contado" });
    expect(c.lista[0]!.id).toBe("a");
    expect(conteoProcesos(null)).toMatchObject({ esperados: 0, dibujados: 0, nivel: null });
  });

  it("los puntajes por área son la cuenta del Panorama: techo por evidencia, hallazgos y construcción", () => {
    const p = puntajesPorPilar(puntajes())!;
    // procesos: salud 90 − 20 = 70; construcción = (avance 50 + documentos 100) / 2 = 75; 0,6 × 70 + 0,4 × 75 = 72; techo 95.
    expect(p.find((x) => x.pilar === "procesos")).toMatchObject({ estado: "critico", puntaje: 72, confirmadas: 19, total: 19 });
    // marketing: un hallazgo medio aunque espere validación cuenta entero: 90 − 10 = 80, sin documentos exigidos a este tamaño.
    expect(p.find((x) => x.pilar === "marketing")).toMatchObject({ puntaje: 80 });
    expect(p.find((x) => x.pilar === "producto")!.puntaje).toBeNull();
    expect(p.find((x) => x.pilar === "personas")).toMatchObject({ estado: null, puntaje: null, confirmadas: 0, total: 1 });
    expect(saludDe(p)).toBe(76);
  });

  it("la serie de ventas deja huecos donde no hay venta, nunca ceros", () => {
    expect(serieDeMeses([{ clave: "venta_mes", periodo: "2026-06", valor: 10, estado: "contado" }, { clave: "venta_mes", periodo: "2026-08", valor: 12, estado: "contado" }, { clave: "venta_mes", periodo: "epoca_dorada", valor: 99, estado: "contado" }])).toEqual([
      { periodo: "2026-06", valor: 10 }, { periodo: "2026-07", valor: null }, { periodo: "2026-08", valor: 12 },
    ]);
  });

  it("el mes pasado, en la zona de la empresa", () => {
    expect(mesPasadoEn("America/Lima", new Date("2026-10-16T15:00:00Z"))).toBe("2026-09");
    // El 1 de enero a las 02:00 UTC todavía es 31 de diciembre en Lima: el mes pasado es noviembre.
    expect(mesPasadoEn("America/Lima", new Date("2027-01-01T02:00:00Z"))).toBe("2026-11");
    expect(mesPasadoEn("Zona/Inexistente", new Date("2026-03-10T12:00:00Z"))).toBe("2026-02");
  });
});

// ─────────────────────── La portada de la empresa ───────────────────────

function base(extra: Record<string, Fila[]> = {}) {
  const b = crearBaseFalsa({
    companies: [{ id: EMP, nombre: "Jeans del Valle (ficticia)", sector: "Confección textil", etapa: "diagnostico", estado_admision: "admitida", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", ficha: { personas: "6" }, tipo_trabajo: "estructurar", ruta_inicio: "2026-10-01", modelo_negocio: ["fabrica_y_vende"], modelo_operativo: [] }],
    ...extra,
  });
  // Lo que la base en memoria no trae y otras lecturas de la empresa usan: .or/.not (aquí no filtran) y rpc.
  const from = (t: string) => {
    const q = b.from(t) as unknown as Record<string, unknown>;
    q.or = () => q;
    q.not = () => q;
    return q;
  };
  estado.base = { from, rpc: async () => ({ data: 0, error: null }) };
  return b;
}

const GASTOS: Fila[] = [
  { id: "c1", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Alquiler", monto: 2000, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 1 },
  { id: "c2", company_id: EMP, periodo: "mes_tipico", tipo: "fijo", nombre: "Sueldos", monto: 3000, monto_desde: null, monto_hasta: null, estado: "contado", nota: null, orden: 2 },
];

const pagina = async () => {
  const { default: Diagnostico } = await import("@/app/(consultor)/empresa/[id]/page");
  return renderToStaticMarkup((await Diagnostico({ params: Promise.resolve({ id: EMP }) })) as React.ReactElement);
};

beforeAll(async () => {
  await import("@/app/(consultor)/empresa/[id]/page");
}, 180_000);

describe("consultora · /empresa/[id]", () => {
  it("con datos que no cuadran: el aviso arriba, las dos cifras y un solo «Pedir al cliente que los corrija»", async () => {
    base({ company_metricas: [{ company_id: EMP, clave: "gasto_fijo_mes", periodo: "2026-09", valor: 4000, estado: "contado" }], costos_mes: GASTOS });
    const h = await pagina();
    expect(h).toContain('class="aviso-incongruencias"');
    expect(h).toContain("1 dato no cuadra");
    expect(h).toContain('id="incongruencias"');
    expect(h).toContain("Gasto fijo declarado frente a la suma de la tabla de gastos");
    expect(h).toContain("S/ 4,000");
    expect(h).toContain("S/ 5,000");
    expect(h.match(/Pedir al cliente que los corrija/g) ?? []).toHaveLength(1);
    // Los cuatro bloques, en su orden.
    const orden = ["t-procesos", "t-dependencia", "t-dinero", "t-resultado"].map((id) => h.indexOf(`id="${id}"`));
    expect(orden.every((x) => x > 0)).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    // «Lo que falta», con su botón en cada fila que se puede pedir.
    expect(h).toContain("Lo que falta levantar o validar");
    expect(h).toContain("Pedírselo al cliente");
    expect(h).not.toMatch(CERO_INVENTADO);
  });

  it("sin datos que no cuadren: ningún aviso", async () => {
    base({ company_metricas: [{ company_id: EMP, clave: "gasto_fijo_mes", periodo: "2026-09", valor: 5000, estado: "contado" }], costos_mes: GASTOS });
    const h = await pagina();
    expect(h).not.toContain("aviso-incongruencias");
    expect(h).not.toContain("Pedir al cliente que los corrija");
  });

  it("una empresa recién creada: todo «sin dato», el medidor sin dato, la ficha de trabajo abierta y ningún «S/ 0»", async () => {
    estado.base = null;
    const b = crearBaseFalsa({ companies: [{ id: EMP, nombre: "Panadería Flor de Mayo (ficticia)", estado_admision: "admitida", pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima", ficha: null }] });
    const from = (t: string) => {
      const q = b.from(t) as unknown as Record<string, unknown>;
      q.or = () => q;
      q.not = () => q;
      return q;
    };
    estado.base = { from, rpc: async () => ({ data: 0, error: null }) };
    const h = await pagina();
    expect(h).toContain("Todavía no hay una restricción con evidencia");
    expect(h).toContain('aria-label="Salud con evidencia: sin dato"');
    expect(h).toContain("Todavía no hay procesos dibujados");
    expect(h).toContain("Todavía sin ventas contadas");
    expect(h).toContain("Corre el diagnóstico en Hallazgos");
    expect(h).toMatch(/<details id="ficha" open=""/);
    expect(h).toContain('class="sin-dato"');
    expect(h).not.toContain("aviso-incongruencias");
    expect(h).not.toMatch(CERO_INVENTADO);
    expect(h).not.toMatch(/\b0 %/);
  });

  it("la admisión pendiente se dice arriba, con su camino al Expediente", async () => {
    const b = base();
    b.tablas.companies![0]!.estado_admision = "pendiente";
    const h = await pagina();
    expect(h).toContain("Admisión pendiente:");
    expect(h).toContain(`href="/empresa/${EMP}/expediente"`);
  });
});

describe("leerHechosDiagnostico", () => {
  it("nunca lanza: sin base, todo queda en «no se pudo leer»", async () => {
    estado.base = { from: () => { throw new Error("sin base"); } };
    const { leerHechosDiagnostico } = await import("@/lib/diagnostico-datos");
    const h = await leerHechosDiagnostico(EMP, { para: "consultora" });
    expect(h).toMatchObject({ procesos: null, metricas: null, dependencia: null, ruta: null, solicitudes: null, porConfirmar: null, incongruencias: null });
    const t = armarDiagnostico(h, "consultora");
    expect(t.procesos.falta).toBe("No se pudo leer el mapa de procesos");
    expect(t.dinero.falta).toBe("No se pudieron leer los números de la empresa");
    expect(t.loQueFalta).toHaveLength(0);
  });

  it("al dueño: las palabras de una persona del equipo no le llegan, ni la ficha en borrador, ni lo que tiene pendiente la consultora", async () => {
    const b = base({
      participants: [{ id: "pa1", company_id: EMP, nombre: "Rosa Ejemplo", rol: "dueno", puesto: "Dueña" }, { id: "pa2", company_id: EMP, nombre: "Ana Ejemplo", rol: "empleado", puesto: "Vendedora" }],
      claims: [
        { id: "c1", company_id: EMP, texto: "Todas las ventas se anotan.", estado: "contradicho", contradice_a: "c2", participant_id: "pa1", source_id: null },
        { id: "c2", company_id: EMP, texto: "Las ventas del sábado no se anotan nunca.", estado: "contradicho", contradice_a: "c1", participant_id: "pa2", source_id: null },
      ],
      ficha_direccion: [{ id: "f1", company_id: EMP, version: 1, estado: "borrador", bloques: {}, dependencia: { declaraciones: [{ id: "d1", texto: "BORRADOR: nadie aprueba sin ella", tipo: "declaracion", origen: "sistema", fuentes: [], fecha: null }], procesos: conteo(4, 2, 1) } }],
      solicitudes_cliente: [{ id: "s1", company_id: EMP, seccion: "productos", nota: null, estado: "activa", activada_at: "2026-10-15T13:00:00.000Z", completada_at: null }],
    });
    const { leerHechosDiagnostico } = await import("@/lib/diagnostico-datos");
    const h = await leerHechosDiagnostico(EMP, { para: "dueno" });
    const textos = h.incongruencias!.claimsContradichas.map((c) => c.texto);
    expect(textos).toContain("Todas las ventas se anotan.");
    expect(textos).not.toContain("Las ventas del sábado no se anotan nunca.");
    expect(textos).toContain("Otra persona de tu empresa lo cuenta distinto.");
    expect(JSON.stringify(h)).not.toContain("Vendedora");
    // Ni la ficha en borrador (solo la acordada, y no hay), ni lo que la consultora tiene pendiente.
    expect(h.dependencia?.dimensiones).toBeNull();
    expect(JSON.stringify(h.dependencia)).not.toContain("BORRADOR");
    expect(h.solicitudes).toBeNull();
    expect(h.porConfirmar).toBeNull();
    expect(b.pedidos.some((p) => p.tabla === "ficha_direccion" && p.filtros?.some(([, k, v]) => k === "estado" && v === "borrador"))).toBe(false);
    const t = armarDiagnostico(h, "dueno");
    expect(t.resultado.pilares).toBeNull();
    expect(t.loQueFalta).toHaveLength(0);
  });
});

describe("el tablero del dueño, pintado", () => {
  it("las mismas piezas con sus palabras: sin pilares, sin dimensiones, sin «Lo que falta» y sin palabras del método", async () => {
    const { TableroDiagnostico } = await import("@/components/diagnostico/TableroDiagnostico");
    const t = armarDiagnostico(hechos({ para: "dueno", dependencia: { conteo: conteo(5, 3, 1), dimensiones: null, seDetiene: ["Si no estoy, nadie aprueba los descuentos."] } }), "dueno");
    const h = renderToStaticMarkup(createElement(TableroDiagnostico, { t, base: "/portal" }));
    for (const titulo of ["Tus procesos", "Tu tiempo", "Tu dinero", "Lo que encontramos"]) expect(h).toContain(titulo);
    expect(h).toContain("1 dato no cuadra. Corrígelo en un minuto.");
    expect(h).toContain("Lo que pagas sí o sí cada mes no cuadra con la suma de tu tabla de gastos");
    expect(h).toContain("Lo dijiste tú");
    expect(h).toContain("Sale de tu tabla");
    expect(h).not.toContain("Lo que falta levantar o validar");
    expect(h).not.toContain("Las ocho dimensiones");
    expect(h).not.toContain("Salud con evidencia");
    expect(h).not.toContain("tabla de gastos del mes"); // el detalle de la consultora no llega
    expect(h).not.toMatch(PROHIBIDAS);
    expect(h).not.toMatch(CERO_INVENTADO);
  });
});

// ─────────────────────── Revisión del 16-10-2026 ───────────────────────

describe("revisión del 16-10-2026 · lo que se contradecía en Tu diagnóstico", () => {
  /** Lo que le quedó en setiembre (3.000) no cuadra con la cuenta: 41.800 − 20.000 − 8.000 = 13.800. */
  const metricasQueNoCuadran = [
    { clave: "venta_mes", periodo: "2026-08", valor: 39900, estado: "verificado" },
    { clave: "venta_mes", periodo: "2026-09", valor: 41800, estado: "contado" },
    { clave: "costo_variable_mes", periodo: "2026-09", valor: 20000, estado: "contado" },
    { clave: "gasto_fijo_mes", periodo: "2026-09", valor: 8000, estado: "contado" },
    { clave: "ganancia_mes", periodo: "2026-09", valor: 3000, estado: "contado" },
  ];
  const conGananciaEnDuda = (para: "dueno" | "consultora") =>
    hechos({ para, metricas: metricasQueNoCuadran, incongruencias: incongruenciasFalsas({ metricas: metricasQueNoCuadran, costos: [] }) });

  it("una ganancia que no cuadra no sale como hecho: ni en la frase ni como cifra grande de «Tu dinero»; se dice «por confirmar»", async () => {
    const t = armarDiagnostico(conGananciaEnDuda("dueno"), "dueno");
    expect(t.incongruencias.map((i) => i.regla)).toContain("ganancia_vs_cuenta");
    expect(t.dinero.quedaAlMes).toMatchObject({ valor: 3000, periodo: "2026-09", porConfirmar: true });
    expect(t.dinero.venta).toMatchObject({ valor: 41800, porConfirmar: false });
    expect(t.frase).toContain("vende S/ 41,800 al mes");
    expect(t.frase).not.toContain("te quedan");
    expect(t.frase).not.toContain("3,000");
    const { TableroDiagnostico } = await import("@/components/diagnostico/TableroDiagnostico");
    const h = renderToStaticMarkup(createElement(TableroDiagnostico, { t, base: "/portal" }));
    const dinero = h.slice(h.indexOf('aria-labelledby="t-dinero"'), h.indexOf('aria-labelledby="t-resultado"'));
    expect(dinero).toMatch(/Vendiste <span class="grande">S\/ 41,800<\/span>/);
    expect(dinero).not.toContain("Te quedan");
    expect(dinero).toContain('<span class="estado espera">por confirmar</span>');
    expect(dinero).toContain('href="#incongruencias"');
    // Sin nada que no cuadre, la misma cifra sí es un hecho.
    const firme = armarDiagnostico(hechos({ para: "dueno", metricas: metricasQueNoCuadran, incongruencias: null }), "dueno");
    expect(firme.dinero.quedaAlMes?.porConfirmar).toBe(false);
    expect(firme.frase).toContain("te quedan S/ 3,000");
  });

  it("la consultora ve el margen marcado: sale de una cifra que no cuadra", async () => {
    const t = armarDiagnostico(conGananciaEnDuda("consultora"), "consultora");
    const { TableroDiagnostico } = await import("@/components/diagnostico/TableroDiagnostico");
    const h = renderToStaticMarkup(createElement(TableroDiagnostico, { t, base: "/empresa/e1" }));
    expect(h).toContain("sale de una cifra que no cuadra");
  });

  it("«Tu tiempo» cuenta sobre los mismos procesos que «Tus procesos» (los dibujados) y no repite el total", () => {
    const lista = [
      { id: "p1", nombre: "Pedidos", nivel: 3, nombreNivel: "Escrito", siguiente: null },
      { id: "p2", nombre: "Corte", nivel: 2, nombreNivel: "Ordenado", siguiente: null },
      { id: "p3", nombre: "Caja", nivel: 1, nombreNivel: "Contado", siguiente: null },
      { id: "p4", nombre: "Compras", nivel: 1, nombreNivel: "Contado", siguiente: null },
      { id: "p5", nombre: "Calidad", nivel: 0, nombreNivel: "Sin mapear", siguiente: "Falta dibujarlo" },
    ];
    const procesos = { esperados: 21, dibujados: 4, conResponsable: 3, escritos: 1, medidos: 0, nivel: 0.6, nombreNivel: "Sin mapear", lista };
    // La ficha acordada contó los cinco «as_is», también el que no tiene pasos.
    const ficha: ConteoProcesos = { total: 5, con_dueno: 3, decide_solo: 1, nombres_con_dueno: ["Pedidos", "Caja", "Compras"], nombres_decide_solo: ["Compras"], texto: "" };
    const t = armarDiagnostico(hechos({ para: "dueno", procesos, dependencia: { conteo: ficha, dimensiones: null, seDetiene: [] } }), "dueno");
    expect(t.procesos.dibujados).toBe(4);
    expect(t.dependencia.procesos).toEqual({ total: 4, conDueno: 3, decideSolo: 1 });
    expect(t.frase).toContain("participas en 3 de 4 procesos");
    expect(t.dependencia.frase).toBe("Estás en 3 procesos y en 1 eres la única persona que decide.");
    expect(t.dependencia.frase).not.toMatch(/dibujado/);
    // Si los nombres de la ficha ya no están en el mapa, no se inventa otra cuenta: queda la de la ficha.
    const otros = armarDiagnostico(
      hechos({ para: "dueno", procesos, dependencia: { conteo: { ...ficha, nombres_con_dueno: ["Otro", "Caja", "Compras"] }, dimensiones: null, seDetiene: [] } }),
      "dueno"
    );
    expect(otros.dependencia.procesos?.total).toBe(5);
  });

  it("la leyenda de «Tu tiempo» habla en palabras del dueño: decides tú, con otros, no estás", async () => {
    const { TableroDiagnostico } = await import("@/components/diagnostico/TableroDiagnostico");
    const t = armarDiagnostico(hechos({ para: "dueno", dependencia: { conteo: conteo(5, 3, 1), dimensiones: null, seDetiene: [] } }), "dueno");
    const h = renderToStaticMarkup(createElement(TableroDiagnostico, { t, base: "/portal" }));
    const tiempo = h.slice(h.indexOf('aria-labelledby="t-dependencia"'), h.indexOf('aria-labelledby="t-dinero"'));
    expect(tiempo).toMatch(/Estás en <span class="grande">3<\/span> procesos/);
    expect(tiempo).toContain("En 1 eres la única persona que decide.");
    expect(tiempo).toContain('<i class="l1"></i>1 decides tú');
    expect(tiempo).toContain('<i class="l2"></i>2 con otros');
    expect(tiempo).toContain('<i class="l4"></i>2 no estás');
    expect(tiempo).not.toMatch(/participas|solo tú decides/);
  });

  it("los cuatro bloques van justo bajo la frase; lo que no cuadra, debajo (el aviso de arriba lleva hasta ahí)", async () => {
    const { TableroDiagnostico } = await import("@/components/diagnostico/TableroDiagnostico");
    const t = armarDiagnostico(hechos(), "consultora");
    const h = renderToStaticMarkup(createElement(TableroDiagnostico, { t, base: "/empresa/e1" }));
    const frase = h.indexOf('id="t-frase"');
    const bloques = ["t-procesos", "t-dependencia", "t-dinero", "t-resultado"].map((id) => h.indexOf(`aria-labelledby="${id}"`));
    const incongruencias = h.indexOf('id="incongruencias"');
    expect(h.indexOf('class="aviso-incongruencias"')).toBeLessThan(frase);
    expect(h).toContain('href="#incongruencias"');
    for (const b of bloques) expect(b).toBeGreaterThan(frase);
    for (const b of bloques) expect(b).toBeLessThan(incongruencias);
    // «Hasta S/ 2,100» se lee con números proporcionales: la cifra va dentro de la frase.
    expect(h).toContain('class="grande en-frase"');
  });
});
