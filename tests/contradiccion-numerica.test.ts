/**
 * EL CONTRASTE DECLARADO/EXTRAÍDO, EN PRODUCTO (remate 4, 13-10-2026).
 *
 * Hasta hoy «40.000 vs 79.782 → contradicción» vivía solo en tests/pilotos/_reglas.ts. Estas pruebas
 * fijan las reglas ya en src/lib/rules/contradiccion-numerica.ts, deterministas y sin modelo:
 *  - una cifra aproximada tolera 20 %; una exacta, 5 %;
 *  - periodos distintos → «no comparable», nunca contradicción;
 *  - sin dato → nada: ni par, ni cero, ni promedio;
 *  - ninguna cifra sale «verificada» de una comparación;
 *  - el plan de escritura solo toca pregunta y prioridad de la afirmación del dueño, nunca su estado.
 *
 * ESTADO (cierre Z1, 13-10-2026). company_metricas guarda un número por (clave, periodo), y los tres
 * que guardan (`guardarMetricas`, la ruta del portal y el espejo de indicadores) conservan en la
 * columna `cifra_desplazada` (supabase/migracion-cifra-desplazada.sql) la cifra del otro lado que
 * reemplazan. Cada bloque dice con qué se probó:
 *  - «LA REGLA»: funciones puras, con dos filas de igual clave y periodo o con la fila que deja un
 *    escritor que conserva la cifra desplazada;
 *  - «ESCRITORES REALES»: corre `guardarMetricas` y la ruta del portal de verdad sobre la base falsa,
 *    de punta a punta. Las pruebas «HOY» (la cifra se pierde) siguen escritas y se saltan solas
 *    mientras los escritores conserven; si alguno dejara de hacerlo, vuelven a correr y la de punta a
 *    punta se salta diciendo por qué en su nombre;
 *  - contra Postgres de verdad (embebido), el mismo recorrido y el espejo: tests/sql/contraste.test.ts;
 *  - «SEGUNDA VUELTA»: los cuatro reparos del verificador del cierre Z1 (la aproximación de otro número
 *    del texto, la cifra escondida al lado de un «sin dato», la cifra extraída que sale de la revisión
 *    de su documento y la lectura aceptada «sin cifra» tomada por verificada).
 * Aquí todo es con base FALSA (ningún modelo real, ninguna base real, nada en producción).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  leerDeclaracion,
  contradiccionesNumericas,
  TOLERANCIA_PCT,
  ladoDeMetrica,
  ladosDisponibles,
  motivoSinPares,
  escribirConservando,
  MOTIVO_VARIAS_AFIRMACIONES,
  declaracionDeMetrica,
  emparejarDeclaradoExtraido,
  contrasteNumerico,
  cifraQueSeDesplaza,
  cifrasSoloAlLado,
  conCifraDesplazada,
  declaranteDeRol,
  rotuloDeDeclarado,
  mencionaNumero,
  preguntaParaElDueno,
  formatoCifra,
  unidadDeClave,
  type CifraRotulada,
  type Declarante,
  type MetricaGuardada,
} from "@/lib/rules/contradiccion-numerica";
import { normalizarMetrica } from "@/lib/metricas";
import * as reglasPilotos from "./pilotos/_reglas";

// ---- Base de datos FALSA, en memoria: lo que tocan el manejador `contrastar`, la pantalla y los escritores reales ----
type Fila = Record<string, unknown>;
const base = vi.hoisted(() => ({
  metricas: [] as Record<string, unknown>[],
  claims: [] as Record<string, unknown>[],
  fuentes: [] as Record<string, unknown>[],
  /** interview_responses con su sesión y su participante anidados, como los devuelve PostgREST. */
  respuestas: [] as Record<string, unknown>[],
  errorMetricas: null as { message: string } | null,
  /** Cada escritura sobre afirmaciones, tal como llegó: para comprobar qué columnas se tocan. */
  escrituras: [] as Record<string, unknown>[],
  /** Lo que ocurre justo antes de que una escritura sobre afirmaciones llegue a la base: alguien más la cambió. */
  antesDeEscribirAfirmacion: null as (() => void) | null,
  seleccion: "",
  progresos: [] as string[],
  modelo: { llamadas: 0, falla: false },
  secuencia: 0,
  /** Lo que solo toca el manejador de extracción: los trabajos de la cola y los fragmentos citados. */
  jobs: [] as Record<string, unknown>[],
  fragmentos: [] as Record<string, unknown>[],
  /** El extractor FALSO: cuántas veces se le llamó y qué devuelve. */
  extractor: { llamadas: 0, salida: { afirmaciones: [] as Record<string, unknown>[], metricas: [] as Record<string, unknown>[] } },
  /** Una base SIN la migración: rechaza toda escritura en company_metricas que nombre `cifra_desplazada`. */
  sinColumnaDesplazada: null as { message: string; code?: string } | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    from: (tabla: string) => {
      const filtros: ((f: Fila) => boolean)[] = [];
      let op: "leer" | "cambiar" | "insertar" = "leer";
      let carga: Fila | null = null;
      let unaSola = false;
      let soloContar = false;
      const filasDeTabla = (): Fila[] =>
        tabla === "company_metricas" ? base.metricas : tabla === "claims" ? base.claims : tabla === "sources" ? base.fuentes : tabla === "interview_responses" ? base.respuestas
          : tabla === "jobs" ? base.jobs : tabla === "source_fragments" ? base.fragmentos : [];
      const resolver = () => {
        if (tabla === "company_metricas" && base.errorMetricas) return { data: null, error: base.errorMetricas };
        if (tabla === "company_metricas" && op !== "leer" && base.sinColumnaDesplazada && carga && "cifra_desplazada" in carga) return { data: null, error: base.sinColumnaDesplazada };
        const todas = filasDeTabla();
        if (soloContar) return { data: null, error: null, count: todas.filter((f) => filtros.every((cumple) => cumple(f))).length };
        if (op === "insertar") {
          const nueva = { id: `${tabla}-${++base.secuencia}`, ...carga };
          todas.push(nueva);
          return { data: unaSola ? nueva : [nueva], error: null };
        }
        if (op === "cambiar" && tabla === "claims") base.antesDeEscribirAfirmacion?.();
        const casan = todas.filter((f) => filtros.every((cumple) => cumple(f)));
        if (op === "cambiar") {
          for (const f of casan) Object.assign(f, carga);
          if (tabla === "claims") base.escrituras.push(carga as Fila);
          return { data: casan.map((f) => ({ id: f.id })), error: null };
        }
        return { data: unaSola ? (casan[0] ?? null) : casan, error: null };
      };
      const q = {
        select(cols?: string, opciones?: { head?: boolean }) {
          if (tabla === "company_metricas" && op === "leer") base.seleccion = cols ?? "";
          if (opciones?.head) soloContar = true;
          return q;
        },
        neq(col: string, v: unknown) {
          filtros.push((f) => f[col] !== v);
          return q;
        },
        // `payload @> {…}` de PostgREST: la fila contiene cada clave pedida con ese valor.
        contains(col: string, v: Record<string, unknown>) {
          filtros.push((f) => !!f[col] && Object.entries(v).every(([k, x]) => (f[col] as Record<string, unknown>)[k] === x));
          return q;
        },
        update(p: Fila) {
          op = "cambiar";
          carga = p;
          return q;
        },
        insert(p: Fila) {
          op = "insertar";
          carga = p;
          return q;
        },
        upsert: () => q,
        eq(col: string, v: unknown) {
          filtros.push((f) => f[col] === v);
          return q;
        },
        is(col: string, v: unknown) {
          filtros.push((f) => (f[col] ?? null) === v);
          return q;
        },
        in(col: string, v: unknown) {
          filtros.push((f) => (v as unknown[]).includes(f[col]));
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle() {
          unaSola = true;
          return q;
        },
        single() {
          unaSola = true;
          return q;
        },
        then: (bien: (r: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve().then(resolver).then(bien, mal),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/db/queries", async (orig) => ({
  ...(await orig<typeof import("@/lib/db/queries")>()),
  claimsDeEmpresa: async () => base.claims,
  registrarLlamada: async () => {},
}));
vi.mock("@/lib/ai/agents/contrastador", () => ({
  correrContrastador: async () => {
    base.modelo.llamadas++;
    if (base.modelo.falla) throw new Error("PAUSA: el proveedor no tiene crédito");
    return { data: { se_contradicen: false, relacion: "ninguna", explicacion: "no hablan de lo mismo", cual_parece_vigente: null, pregunta_sugerida: null }, tokens_entrada: 0, tokens_salida: 0, modelo: "falso", latencia_ms: 0 };
  },
}));
vi.mock("@/lib/ai/agents/extractor", () => ({
  correrExtractor: async () => {
    base.extractor.llamadas++;
    return { data: base.extractor.salida, tokens_entrada: 0, tokens_salida: 0, modelo: "falso", latencia_ms: 0 };
  },
}));
vi.mock("@/lib/jobs/auto", () => ({ dispararDiagnosticoSiListo: async () => [] }));
vi.mock("@/lib/jobs/queue", () => ({
  progreso: async (_id: string, texto: string) => {
    base.progresos.push(texto);
  },
  // Lo que importa el manejador de extracción y aquí nadie llama: de él solo se usa `guardarMetricas`.
  encolar: async () => null,
  claveIdempotente: (partes: unknown[]) => partes.join("|"),
  PRIORIDAD: {},
}));
// La capa de sesión se aparta: de la ruta del portal aquí interesa lo que HACE con la base, no quién puede llamarla.
vi.mock("@/lib/api", () => ({
  protegido: (_opciones: unknown, fn: unknown) => fn,
  ok: (data: unknown, status = 200) => ({ status, body: data }),
  fallo: (mensaje: string, status = 400) => ({ status, body: { error: mensaje } }),
  leerValidado: async (req: Request, esquema: { parse: (x: unknown) => unknown }) => esquema.parse(await req.json()),
}));
vi.mock("@/lib/auth", () => ({ empresaDelCliente: async () => "e1" }));
vi.mock("@/lib/auditoria", () => ({ registrar: async () => {}, ipDe: () => null }));
vi.mock("@/lib/errores", () => ({ registrarError: async () => {} }));

import { supabaseAdmin } from "@/lib/supabase/admin";
import { handleContrastar } from "@/lib/jobs/handlers/contrastar";
import { Contradicciones } from "@/components/realidad/Contradicciones";

const RAIZ = path.resolve(__dirname, "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

const cifra = (rotulo: "declarado" | "extraido", valor: number, periodo = "hoy", extra: Partial<CifraRotulada> = {}): CifraRotulada => ({
  concepto: "mercadería a costo",
  valor,
  periodo,
  fuente: rotulo === "declarado" ? "entrada breve" : "Inventario!F2:F121",
  rotulo,
  ...extra,
});

const fila = (extra: Partial<MetricaGuardada> & Pick<MetricaGuardada, "clave" | "valor">): MetricaGuardada => ({ periodo: "actual", ...extra });

/** Consta que la respuesta r1 la dio el dueño. */
const DEL_DUENO = { declarantes: new Map<string, Declarante>([["r1", "dueno"]]) };

function limpiarBase() {
  base.metricas = [];
  base.claims = [];
  base.fuentes = [];
  base.respuestas = [];
  base.errorMetricas = null;
  base.escrituras = [];
  base.antesDeEscribirAfirmacion = null;
  base.progresos = [];
  base.seleccion = "";
  base.modelo = { llamadas: 0, falla: false };
  base.jobs = [];
  base.fragmentos = [];
  base.extractor = { llamadas: 0, salida: { afirmaciones: [], metricas: [] } };
  base.sinColumnaDesplazada = null;
}

// ---- LOS ESCRITORES REALES: lo que guarda números en producto, corrido de verdad sobre la base falsa ----

/** La entrevista declara «como 40,000» y después el Excel trae 79.782, con el `guardarMetricas` REAL. Devuelve lo que queda del número. */
async function declararYExtraerDeVerdad(): Promise<Fila[]> {
  const { guardarMetricas } = await import("@/lib/jobs/handlers/extraer");
  const sb = supabaseAdmin();
  await guardarMetricas(sb, "e1", [{ clave: "stock_a_costo", periodo: "actual", valor: 40_000, valor_texto: "como 40,000", estado: "contado" }], { response_id: "r1", origen: "declarado" });
  await guardarMetricas(sb, "e1", [{ clave: "stock_a_costo", periodo: "actual", valor: 79_782, estado: "verificado", nota: "Inventario!F2:F121" }], { source_id: "s1", origen: "extraido" });
  return base.metricas.filter((m) => m.clave === "stock_a_costo");
}

/** El Excel trae 86.900 de ventas de setiembre y después el dueño escribe 60.000 en el portal, con la RUTA REAL. */
async function extraerYDeclararEnElPortalDeVerdad(): Promise<{ estado: number; filas: Fila[] }> {
  const { guardarMetricas } = await import("@/lib/jobs/handlers/extraer");
  const { POST } = await import("@/app/api/portal/numeros/route");
  await guardarMetricas(supabaseAdmin(), "e1", [{ clave: "venta_mes", periodo: "2026-09", valor: 86_900, estado: "verificado" }], { source_id: "s1", origen: "extraido" });
  const guardar = POST as unknown as (perfil: unknown, req: Request) => Promise<{ status: number }>;
  const res = await guardar({ id: "u-duena", rol: "cliente" }, new Request("http://prueba.local/api/portal/numeros", { method: "POST", body: JSON.stringify({ meses: [{ periodo: "2026-09", venta: 60_000 }] }) }));
  return { estado: res.status, filas: base.metricas.filter((m) => m.clave === "venta_mes") };
}

type Escritor = { conserva: boolean; error: string | null };

/** ¿Conserva ya este escritor la cifra del otro lado que pisa? Se le pregunta al código, no a un comentario. */
async function probarEscritor(recorrido: () => Promise<Fila[]>, ladoDesplazado: "declarado" | "extraido"): Promise<Escritor> {
  limpiarBase();
  try {
    const filas = await recorrido();
    return { conserva: filas.some((f) => (f.cifra_desplazada as { lado?: string } | null | undefined)?.lado === ladoDesplazado), error: null };
  } catch (e) {
    return { conserva: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    limpiarBase();
  }
}

const ESCRITOR_EXTRACCION = await probarEscritor(declararYExtraerDeVerdad, "declarado");
const ESCRITOR_PORTAL = await probarEscritor(async () => (await extraerYDeclararEnElPortalDeVerdad()).filas, "extraido");
/** El nombre de la prueba de punta a punta dice si corrió o por qué se saltó. */
const puntaAPunta = (e: Escritor, quien: string, nombre: string) => (e.conserva ? nombre : `SALTADA (${quien} aún no conserva la cifra que desplaza): ${nombre}`);

describe("tolerancia según la clase de la declaración", () => {
  it("exacta 5 %, aproximada 20 %: las dos constantes están en el código, no en la cabeza de nadie", () => {
    expect(TOLERANCIA_PCT).toEqual({ exacta: 5, aproximada: 20 });
  });

  it("40.000 aproximado («como 40,000») frente a 79.782 → CONTRADICCIÓN, con las dos cifras rotuladas y pendientes", () => {
    const d = leerDeclaracion("Tengo como 40,000 en mercadería.");
    expect(d).toMatchObject({ clase: "aproximada", valor: 40_000 });
    const v = contradiccionesNumericas(cifra("declarado", d.valor as number), cifra("extraido", 79_782), { clase: "aproximada" });
    expect(v.tipo).toBe("CONTRADICCION");
    expect(v.tolerancia_pct).toBe(20);
    expect(v.clase).toBe("aproximada");
    expect(v.declarado).toMatchObject({ rotulo: "declarado", valor: 40_000, estado: "pendiente" });
    expect(v.extraido).toMatchObject({ rotulo: "extraido", valor: 79_782, estado: "pendiente" });
    expect(v.diferencia).toBe(39_782);
    expect(v.diferencia_pct).toBeCloseTo(99.455, 2);
    expect(v.motivo).toMatch(/no cuadran/);
    expect(v.motivo).toMatch(/hasta que alguien las concilie/);
  });

  it("80.000 exacto frente a 81.500 → no es contradicción (1,9 % < 5 %)", () => {
    const v = contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 81_500), { clase: "exacta" });
    expect(v.tipo).toBe("COINCIDE");
    expect(v.tolerancia_pct).toBe(5);
    expect(v.diferencia_pct).toBeCloseTo(1.875, 3);
    // Sin opciones, una cifra se toma como exacta: mismo resultado.
    expect(contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 81_500)).tipo).toBe("COINCIDE");
  });

  it("80.000 aproximado frente a 90.000 → no es contradicción (12,5 % < 20 %); la misma cifra exacta sí lo sería", () => {
    const aprox = contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 90_000), { clase: "aproximada" });
    expect(aprox.tipo).toBe("COINCIDE");
    expect(aprox.diferencia_pct).toBe(12.5);
    const exacta = contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 90_000), { clase: "exacta" });
    expect(exacta.tipo).toBe("CONTRADICCION");
    expect(exacta.motivo).toMatch(/cifra exacta/);
  });

  it("el borde no es contradicción: justo 20 % en una aproximada, justo 5 % en una exacta", () => {
    expect(contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 96_000), { clase: "aproximada" }).tipo).toBe("COINCIDE");
    expect(contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 84_000), { clase: "exacta" }).tipo).toBe("COINCIDE");
    expect(contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 84_001), { clase: "exacta" }).tipo).toBe("CONTRADICCION");
    // Hacia abajo vale lo mismo: el documento puede mostrar menos de lo declarado.
    expect(contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 60_000), { clase: "aproximada" }).tipo).toBe("CONTRADICCION");
  });

  it("una tolerancia dada a mano manda sobre la clase", () => {
    const v = contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 90_000), { clase: "exacta", tolerancia_pct: 15 });
    expect(v.tipo).toBe("COINCIDE");
    expect(v.tolerancia_pct).toBe(15);
  });

  it("«como» y «unos» solo hacen aproximada a la cifra cuando van PEGADOS a ella: un artículo o una comparación no regalan 20 % de tolerancia", () => {
    for (const dicho of ["como 40.000", "unos 80 mil", "unas 3 de cada 10", "tengo como S/ 40,000", "como unos 40,000"]) expect(leerDeclaracion(dicho).clase, dicho).toBe("aproximada");
    // Sueltos, «una», «uno», «unas» y «como» no dicen nada de la cifra: es exacta.
    for (const dicho of ["Una sola caja: 80.000", "Uno de mis locales vende 80.000", "Como dueña sé que son 80.000", "Tengo una deuda de 30,000", "unas cajas con 80.000 en total"]) expect(leerDeclaracion(dicho).clase, dicho).toBe("exacta");
    // En el número guardado: ni la nota «una sola caja» ni un «como» de comparación vuelven aproximado un 80.000.
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota: "una sola caja" })).toMatchObject({ clase: "exacta", valor: 80_000 });
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: "como en el 2023 que vendía el doble", nota: null }).clase).toBe("exacta");
    // La cifra en letras, como la deja quien transcribe la voz, sí cuenta.
    expect(declaracionDeMetrica({ valor: 40_000, valor_texto: "como cuarenta mil", nota: null }).clase).toBe("aproximada");
    expect(declaracionDeMetrica({ valor: 2_000, valor_texto: "unos dos mil", nota: null }).clase).toBe("aproximada");
  });

  it("80.000 con la nota «una sola caja» frente a 90.000 → CONTRADICCIÓN (12,5 % > 5 %): ya no pasa por aproximada ni sale «Cuadran»", () => {
    const [par] = emparejarDeclaradoExtraido([
      fila({ clave: "caja_hoy", valor: 80_000, nota: "una sola caja", estado: "contado", origen: "declarado" }),
      fila({ clave: "caja_hoy", valor: 90_000, estado: "extraido", origen: "extraido" }),
    ]);
    expect(par.veredicto.clase).toBe("exacta");
    expect(par.veredicto.tolerancia_pct).toBe(5);
    expect(par.veredicto.tipo).toBe("CONTRADICCION");
  });

  it("comparar nunca verifica: la palabra no aparece en ningún veredicto", () => {
    for (const v of [
      contradiccionesNumericas(cifra("declarado", 40_000), cifra("extraido", 79_782), { clase: "aproximada" }),
      contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 81_500)),
      contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 81_500, "2026-08")),
    ]) {
      expect(JSON.stringify(v)).not.toMatch(/verificad[ao]/i);
      expect(v.declarado.estado).toBe("pendiente");
      expect(v.extraido.estado).toBe("pendiente");
    }
  });
});

describe("lo que no se compara", () => {
  it("periodos distintos → NO_COMPARABLE, nunca contradicción, aunque las cifras difieran mucho", () => {
    const v = contradiccionesNumericas(cifra("declarado", 40_000, "Setiembre 2026"), cifra("extraido", 79_782, "Agosto 2026"), { clase: "aproximada" });
    expect(v.tipo).toBe("NO_COMPARABLE");
    expect(v.diferencia).toBeNull();
    expect(v.diferencia_pct).toBeNull();
    expect(v.motivo).toMatch(/Periodos distintos \(Setiembre 2026 y Agosto 2026\)/);
  });

  it("conceptos o monedas distintas tampoco se comparan, y se dice por qué", () => {
    expect(contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 52_000, "hoy", { concepto: "compras del mes" })).motivo).toMatch(/No miden lo mismo/);
    expect(contradiccionesNumericas(cifra("declarado", 80_000), cifra("extraido", 22_000, "hoy", { moneda: "USD" })).tipo).toBe("NO_COMPARABLE");
  });

  it("sin dato → nada: «no lo sé» es desconocido, no cero", () => {
    const d = leerDeclaracion("No lo sé.");
    expect(d.clase).toBe("desconocida");
    expect(d.valor).toBeNull();
    expect(d.valor).not.toBe(0);
    expect(leerDeclaracion(null).clase).toBe("desconocida");
    expect(leerDeclaracion("").clase).toBe("desconocida");
    expect(leerDeclaracion("Casi nada, vendemos al contado.").clase).toBe("desconocida");
  });

  it("un rango no inventa un punto medio", () => {
    expect(leerDeclaracion("Entre 18,000 y 25,000 según el mes")).toMatchObject({ clase: "rango", valor: null, desde: 18_000, hasta: 25_000 });
    expect(leerDeclaracion("entre 25.000 y 18.000")).toMatchObject({ clase: "rango", desde: 18_000, hasta: 25_000 });
  });

  it("lee miles con coma y con punto, y decimales", () => {
    expect(leerDeclaracion("como 40.000").valor).toBe(40_000);
    expect(leerDeclaracion("unos 1,250").valor).toBe(1_250);
    expect(leerDeclaracion("149.50").valor).toBe(149.5);
    expect(leerDeclaracion("0.125").valor).toBe(0.125); // un decimal, no ciento veinticinco
    expect(leerDeclaracion(8000)).toEqual({ clase: "exacta", valor: 8_000, texto: "8000" });
  });

  it("«40 mil» son cuarenta mil, no cuarenta: así habla el dueño y así lo escribe quien transcribe la voz", () => {
    expect(leerDeclaracion("Tengo como 40 mil en mercadería")).toMatchObject({ clase: "aproximada", valor: 40_000 });
    expect(leerDeclaracion("2 millones")).toMatchObject({ clase: "exacta", valor: 2_000_000 });
    expect(leerDeclaracion("1,5 millones más o menos")).toMatchObject({ clase: "aproximada", valor: 1_500_000 });
    expect(leerDeclaracion("entre 18 y 25 mil")).toMatchObject({ clase: "rango", desde: 18_000, hasta: 25_000 });
    expect(leerDeclaracion("entre 800 y 2 mil")).toMatchObject({ clase: "rango", desde: 800, hasta: 2_000 });
    // «mil» pegado a otra palabra no multiplica nada.
    expect(leerDeclaracion("3 milímetros").valor).toBe(3);
  });
});

describe("cada número en su unidad: no todo son soles", () => {
  it("la unidad sale de la clave; de una clave que nadie definió no se sabe y se muestra el número a secas", () => {
    expect(unidadDeClave("venta_mes")).toBe("soles");
    expect(unidadDeClave("conversion_de_cada_10")).toBe("de_cada_10");
    expect(unidadDeClave("stock_a_costo")).toBe("numero");
    expect(formatoCifra(40_000, "soles")).toMatch(/^S\/ 40[\s.,]?000$/);
    expect(formatoCifra(3, "de_cada_10")).toBe("3 de cada 10");
    expect(formatoCifra(1, "dias")).toBe("1 día");
    expect(formatoCifra(40_000, "numero")).toMatch(/^40[\s.,]?000$/);
    expect(formatoCifra(149.5, "soles")).toMatch(/^S\/ 149[.,]5$/);
  });

  it("«de cada 10 compran 3» frente a 6 del documento: la pregunta no habla de soles", () => {
    const [par] = emparejarDeclaradoExtraido([
      fila({ clave: "conversion_de_cada_10", valor: 6, estado: "extraido", origen: "extraido", cifra_desplazada: { lado: "declarado", valor: 3 } }),
    ]);
    expect(par.veredicto.tipo).toBe("CONTRADICCION");
    expect(par.pregunta).toMatch(/en tus números figura 3 de cada 10 y el documento que nos entregaste muestra 6 de cada 10/);
    expect(par.pregunta).not.toMatch(/S\//);
    expect(par.veredicto.motivo).not.toMatch(/S\//);
  });
});

describe("LA REGLA · emparejar los números guardados (dos filas de igual clave y periodo: la forma más simple de tener los dos lados; los escritores reales los dejan en UNA fila y se prueban más abajo)", () => {
  it("de qué lado está cada número: declarado, extraído o ninguno", () => {
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "declarado" }))).toBe("declarado");
    // Sin la columna origen (migración sin aplicar) un «contado» sigue siendo lo que dijo el dueño.
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "contado" }))).toBe("declarado");
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: "79782", estado: "extraido", origen: "extraido" }))).toBe("extraido");
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 79_782, estado: "extraido" }))).toBe("extraido");
    // Lo conciliado, lo verificado, lo calculado y lo sin dato no forman par.
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "verificado", origen: "conciliado" }))).toBeNull();
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "verificado", origen: "declarado" }))).toBeNull();
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "calculado" }))).toBeNull();
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: null, estado: "sin_dato", origen: "declarado" }))).toBeNull();
  });

  it("lo extraído que una persona ya verificó o descartó no entra: nunca se rotula «pendiente» lo que ya se revisó", () => {
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 79_782, estado: "verificado", origen: "extraido" }))).toBeNull();
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 79_782, estado: "descartado", origen: "extraido" }))).toBeNull();
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "descartado", origen: "declarado" }))).toBeNull();
    // Estado que nadie definió, o cadena vacía en vez de número: no se adivina.
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "raro" }))).toBeNull();
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: "", estado: "contado" }))).toBeNull();
  });

  it("el formulario del portal pisa el valor sin tocar el origen: un «contado» es del dueño aunque la fila diga origen extraído", () => {
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "extraido" }))).toBe("declarado");
    // Y lo que un lector de documento sacó no se hace pasar por declaración aunque el origen diga otra cosa.
    expect(ladoDeMetrica(fila({ clave: "venta_mes", valor: 80_000, estado: "extraido", origen: "declarado" }))).toBeNull();
  });

  it("la clase de la declaración sale del texto del dueño; un número a secas es exacto", () => {
    expect(declaracionDeMetrica({ valor: 40_000, valor_texto: "como 40,000", nota: null })).toMatchObject({ clase: "aproximada", valor: 40_000 });
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota: null })).toMatchObject({ clase: "exacta", valor: 80_000 });
    expect(declaracionDeMetrica({ valor: "80000", valor_texto: null, nota: "aproximado, de memoria" })).toMatchObject({ clase: "aproximada", valor: 80_000 });
    expect(declaracionDeMetrica({ valor: null, valor_texto: "entre 18,000 y 25,000", nota: null })).toMatchObject({ clase: "rango", desde: 18_000, hasta: 25_000 });
    expect(declaracionDeMetrica({ valor: null, valor_texto: null, nota: null }).clase).toBe("desconocida");
  });

  it("sin número guardado, del texto libre no se saca uno: «en 2024 vendía bastante» no declara 2.024", () => {
    expect(declaracionDeMetrica({ valor: null, valor_texto: "En 2024 vendía bastante más", nota: null })).toMatchObject({ clase: "desconocida", valor: null });
    expect(declaracionDeMetrica({ valor: null, valor_texto: "unos 2 o 3 mil", nota: null }).clase).toBe("desconocida");
    // Un rango escrito manda sobre el punto medio que alguien haya puesto en `valor`.
    expect(declaracionDeMetrica({ valor: 21_500, valor_texto: "entre 18,000 y 25,000", nota: null })).toMatchObject({ clase: "rango", valor: null });
  });

  it("empareja por clave y periodo: 40.000 «como» vs 79.782 del inventario → CONTRADICCIÓN con pregunta; 80.000 vs 79.967 → coinciden", () => {
    const pares = emparejarDeclaradoExtraido([
      fila({ id: "m1", clave: "stock_a_costo", valor: 40_000, valor_texto: "como 40,000", estado: "contado", origen: "declarado", response_id: "r1" }),
      fila({ id: "m2", clave: "stock_a_costo", valor: "79782", estado: "extraido", origen: "extraido", source_id: "s1", nota: "Inventario!F2:F121 × E2:E121" }),
      fila({ id: "m3", clave: "ventas_mes", valor: 80_000, estado: "contado", origen: "declarado", response_id: "r2" }),
      fila({ id: "m4", clave: "venta_mes", valor: 79_967, estado: "extraido", origen: "extraido", source_id: "s1" }),
    ], DEL_DUENO);
    expect(pares).toHaveLength(2);
    const [stock, ventas] = pares;
    expect(stock.clave).toBe("stock_a_costo");
    expect(stock.nombre).toBe("Stock a costo");
    expect(stock.veredicto.tipo).toBe("CONTRADICCION");
    expect(stock.veredicto.clase).toBe("aproximada");
    expect(stock.veredicto.tolerancia_pct).toBe(20);
    expect(stock.veredicto.declarado).toMatchObject({ rotulo: "declarado", valor: 40_000, estado: "pendiente" });
    expect(stock.veredicto.extraido).toMatchObject({ rotulo: "extraido", valor: 79_782, estado: "pendiente" });
    expect(stock.pregunta).toMatch(/^Sobre «Stock a costo»: nos dijiste aproximadamente 40[\s.,]?000 y el documento que nos entregaste muestra 79[\s.,]?782\./);
    expect(stock.pregunta).toMatch(/\?$/);
    // El sinónimo `ventas_mes` cae en la clave canónica venta_mes: por eso forman par.
    expect(ventas.clave).toBe("venta_mes");
    expect(ventas.nombre).toBe("Ventas del mes");
    expect(ventas.veredicto.tipo).toBe("COINCIDE");
    expect(ventas.pregunta).toBeNull();
    expect(JSON.stringify(pares)).not.toMatch(/verificad[ao]/i);
  });

  it("periodos distintos: el declarado de hoy frente al extraído de un mes → NO_COMPARABLE, nunca contradicción", () => {
    const pares = emparejarDeclaradoExtraido([
      fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "declarado", periodo: "actual" }),
      fila({ clave: "venta_mes", valor: 70_000, estado: "extraido", origen: "extraido", periodo: "2026-08" }),
      fila({ clave: "venta_mes", valor: 45_000, estado: "extraido", origen: "extraido", periodo: "2026-09" }),
    ]);
    expect(pares).toHaveLength(1);
    expect(pares[0].veredicto.tipo).toBe("NO_COMPARABLE");
    expect(pares[0].periodo).toBe("actual");
    expect(pares[0].periodo_extraido).toBe("2026-09"); // el más reciente, para que se vea que existe
    expect(pares[0].veredicto.diferencia).toBeNull();
    expect(pares[0].pregunta).toBeNull();
    expect(pares[0].veredicto.motivo).toMatch(/Periodos distintos/);
  });

  it("una sola constancia de «no se comparan» por número, no una por mes; y ninguna si ya hay un par del mismo periodo", () => {
    const seisMeses = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map((periodo) => fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "declarado", periodo }));
    const sinPar = emparejarDeclaradoExtraido([
      ...seisMeses,
      fila({ clave: "venta_mes", valor: 150_000, estado: "contado", origen: "declarado", periodo: "epoca_dorada" }),
      fila({ clave: "venta_mes", valor: 52_000, estado: "extraido", origen: "extraido", periodo: "2026-08" }),
      fila({ clave: "venta_mes", valor: 49_000, estado: "extraido", origen: "extraido", periodo: "2026-07" }),
    ]);
    expect(sinPar).toHaveLength(1);
    expect(sinPar[0].veredicto.tipo).toBe("NO_COMPARABLE");
    expect([sinPar[0].periodo, sinPar[0].periodo_extraido]).toEqual(["2026-06", "2026-08"]); // lo más reciente de cada lado

    const conPar = emparejarDeclaradoExtraido([
      ...seisMeses,
      fila({ clave: "venta_mes", valor: 52_000, estado: "extraido", origen: "extraido", periodo: "2026-08" }),
      fila({ clave: "venta_mes", valor: 81_000, estado: "extraido", origen: "extraido", periodo: "2026-03" }),
    ]);
    expect(conPar.map((p) => [p.periodo, p.veredicto.tipo])).toEqual([["2026-03", "COINCIDE"]]);
  });

  it("sin dato → nada: un «no lo sé» o un extraído sin valor no forman par; un declarado sin contraparte tampoco", () => {
    expect(
      emparejarDeclaradoExtraido([
        fila({ clave: "ganancia_mes", valor: null, estado: "sin_dato", origen: "declarado" }),
        fila({ clave: "ganancia_mes", valor: 8_000, estado: "extraido", origen: "extraido" }),
        fila({ clave: "caja_hoy", valor: 15_000, estado: "contado", origen: "declarado" }),
        fila({ clave: "caja_hoy", valor: null, estado: "extraido", origen: "extraido" }),
        fila({ clave: "deuda_propia", valor: 30_000, estado: "contado", origen: "declarado" }),
      ])
    ).toEqual([]);
  });

  it("un rango se compara contra su extremo más cercano: dentro coincide, fuera contradice", () => {
    const dentro = emparejarDeclaradoExtraido([
      fila({ clave: "venta_mes", valor: null, valor_texto: "entre 18,000 y 25,000", estado: "contado", origen: "declarado" }),
      fila({ clave: "venta_mes", valor: 21_000, estado: "extraido", origen: "extraido" }),
    ]);
    expect(dentro[0].veredicto.tipo).toBe("COINCIDE");
    const fuera = emparejarDeclaradoExtraido([
      fila({ clave: "venta_mes", valor: null, valor_texto: "entre 18,000 y 25,000", estado: "contado", origen: "declarado" }),
      fila({ clave: "venta_mes", valor: 40_000, estado: "extraido", origen: "extraido" }),
    ]);
    expect(fuera[0].veredicto.tipo).toBe("CONTRADICCION");
    expect(fuera[0].veredicto.declarado.valor).toBe(25_000);
    expect(fuera[0].pregunta).toMatch(/entre S\/ 18[\s.,]?000 y S\/ 25[\s.,]?000/);
  });

  it("las contradicciones van primero, después lo que cuadra, al final lo que no se compara", () => {
    const pares = emparejarDeclaradoExtraido([
      fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "declarado" }),
      fila({ clave: "venta_mes", valor: 81_000, estado: "extraido", origen: "extraido" }),
      fila({ clave: "caja_hoy", valor: 15_000, estado: "contado", origen: "declarado", periodo: "actual" }),
      fila({ clave: "caja_hoy", valor: 9_000, estado: "extraido", origen: "extraido", periodo: "2026-09" }),
      fila({ clave: "deuda_propia", valor: 30_000, estado: "contado", origen: "declarado" }),
      fila({ clave: "deuda_propia", valor: 61_000, estado: "extraido", origen: "extraido" }),
    ]);
    expect(pares.map((p) => p.veredicto.tipo)).toEqual(["CONTRADICCION", "COINCIDE", "NO_COMPARABLE"]);
  });
});

describe("LA REGLA · un número por clave y periodo: el par existe porque quien guarda conserva la cifra que desplaza", () => {
  const declarada = fila({ id: "m1", clave: "stock_a_costo", valor: 40_000, valor_texto: "como 40,000", estado: "contado", origen: "declarado", response_id: "r1" });

  it("en una base sin la columna (migración sin aplicar) el Excel pisa lo declarado y queda una sola fila: sin la cifra desplazada no hay nada que poner al lado", () => {
    // Así queda la fila cuando la base no tiene la columna: el 40.000 ya no está en ninguna parte.
    const despuesDelExcel = fila({ id: "m1", clave: "stock_a_costo", valor: 79_782, estado: "extraido", origen: "extraido", source_id: "s1", response_id: null });
    expect(emparejarDeclaradoExtraido([despuesDelExcel])).toEqual([]);
  });

  it("cifraQueSeDesplaza dice a quien guarda qué conservar: solo lo del otro lado y solo si nadie lo concilió", () => {
    expect(cifraQueSeDesplaza(declarada, "extraido")).toEqual({ lado: "declarado", valor: 40_000, valor_texto: "como 40,000", nota: null, response_id: "r1", source_id: null });
    expect(cifraQueSeDesplaza(fila({ clave: "stock_a_costo", valor: "79782", estado: "extraido", origen: "extraido", source_id: "s1" }), "declarado")).toMatchObject({ lado: "extraido", valor: "79782", source_id: "s1" });
    // Mismo lado (el dueño corrige lo suyo, o llega otro documento): no se desplaza nada.
    expect(cifraQueSeDesplaza(declarada, "declarado")).toBeNull();
    // Sin fila previa, sin dato, descartada o ya conciliada: nada que conservar.
    expect(cifraQueSeDesplaza(null, "extraido")).toBeNull();
    expect(cifraQueSeDesplaza(fila({ clave: "stock_a_costo", valor: null, estado: "sin_dato", origen: "declarado" }), "extraido")).toBeNull();
    expect(cifraQueSeDesplaza(fila({ clave: "stock_a_costo", valor: 79_782, estado: "descartado", origen: "extraido" }), "declarado")).toBeNull();
    expect(cifraQueSeDesplaza(fila({ clave: "stock_a_costo", valor: 79_782, estado: "verificado", origen: "conciliado" }), "declarado")).toBeNull();
  });

  it("conCifraDesplazada arma la fila que escribe quien guarda: conserva lo del otro lado, retira lo superado y no nombra la columna si no hay nada que cambiar", () => {
    const nueva = { valor: 79_782, estado: "extraido" };
    // El documento pisa lo declarado: la fila lleva el 40.000 al lado.
    expect(conCifraDesplazada(nueva, declarada, "extraido")).toEqual({ ...nueva, cifra_desplazada: { lado: "declarado", valor: 40_000, valor_texto: "como 40,000", nota: null, response_id: "r1", source_id: null } });
    // Sin fila previa, o el mismo lado corrigiéndose: la fila sale tal cual, sin la clave.
    expect(conCifraDesplazada(nueva, null, "extraido")).toBe(nueva);
    expect("cifra_desplazada" in conCifraDesplazada({ valor: 42_000 }, declarada, "declarado")).toBe(false);
    // Otro documento sobre una fila extraída que ya guardaba lo declarado: lo declarado se queda donde está.
    const extraidaConDeclarado = fila({ clave: "stock_a_costo", valor: 79_782, estado: "extraido", origen: "extraido", cifra_desplazada: { lado: "declarado", valor: 40_000 } });
    expect("cifra_desplazada" in conCifraDesplazada({ valor: 81_000 }, extraidaConDeclarado, "extraido")).toBe(false);
    // El dueño vuelve a hablar («no lo sé») sobre esa fila: se conserva el extraído que pisa; su 40.000 de antes ya no está.
    expect(conCifraDesplazada({ valor: null, estado: "sin_dato" }, extraidaConDeclarado, "declarado").cifra_desplazada).toMatchObject({ lado: "extraido", valor: 79_782 });
    // Una fila sin lado (sin dato, descartada) que guardaba algo del MISMO lado que ahora escribe: quedó superado → null.
    const sinDatoConExtraido = fila({ clave: "stock_a_costo", valor: null, estado: "sin_dato", origen: "declarado", cifra_desplazada: { lado: "extraido", valor: 79_782 } });
    expect(conCifraDesplazada({ valor: 80_500 }, sinDatoConExtraido, "extraido")).toEqual({ valor: 80_500, cifra_desplazada: null });
    // ...y si lo guardado es del OTRO lado, sigue en pie: descartar un documento no retira lo que el dueño declaró.
    const descartadaConDeclarado = fila({ clave: "stock_a_costo", valor: null, estado: "descartado", origen: "extraido", cifra_desplazada: { lado: "declarado", valor: 40_000 } });
    expect("cifra_desplazada" in conCifraDesplazada({ valor: 80_500 }, descartadaConDeclarado, "extraido")).toBe(false);
    // Quien guarda leyó la fila previa a medias (solo id y estado, como hoy): no se pierde la cifra en silencio, se rechaza.
    expect(() => conCifraDesplazada(nueva, { id: "m1", estado: "contado" } as unknown as MetricaGuardada, "extraido")).toThrow(/fila previa entera/);
  });

  it("con la cifra desplazada en la fila, el 40.000 «como» frente al 79.782 vuelve a ser una CONTRADICCIÓN, en cualquier orden de llegada", () => {
    const llegoElExcelDespues = fila({ id: "m1", clave: "stock_a_costo", valor: 79_782, estado: "extraido", origen: "extraido", source_id: "s1", cifra_desplazada: cifraQueSeDesplaza(declarada, "extraido") });
    const [a] = emparejarDeclaradoExtraido([llegoElExcelDespues]);
    expect(a.veredicto.tipo).toBe("CONTRADICCION");
    expect(a.veredicto.clase).toBe("aproximada");
    expect(a.veredicto.declarado.valor).toBe(40_000);
    expect(a.veredicto.extraido.valor).toBe(79_782);
    expect(a.declarado.response_id).toBe("r1"); // por aquí se encuentra la afirmación del dueño
    expect(a.extraido.source_id).toBe("s1");
    expect([a.periodo, a.periodo_extraido]).toEqual(["actual", "actual"]);

    const extraida = fila({ id: "m1", clave: "stock_a_costo", valor: 79_782, estado: "extraido", origen: "extraido", source_id: "s1" });
    const declaroDespues = fila({ id: "m1", clave: "stock_a_costo", valor: 40_000, valor_texto: "como 40,000", estado: "contado", origen: "declarado", response_id: "r1", cifra_desplazada: cifraQueSeDesplaza(extraida, "declarado") });
    const [b] = emparejarDeclaradoExtraido([declaroDespues]);
    expect(b.veredicto.tipo).toBe("CONTRADICCION");
    expect(b.pregunta).toBe(a.pregunta);
    expect(b.extraido.source_id).toBe("s1");
  });

  it("cuando el consultor concilia o descarta el número, el par desaparece: ya lo resolvió una persona", () => {
    const desplazada = cifraQueSeDesplaza(declarada, "extraido");
    expect(emparejarDeclaradoExtraido([fila({ clave: "stock_a_costo", valor: 79_782, estado: "verificado", origen: "conciliado", cifra_desplazada: desplazada })])).toEqual([]);
    expect(emparejarDeclaradoExtraido([fila({ clave: "stock_a_costo", valor: null, estado: "descartado", origen: "extraido", cifra_desplazada: desplazada })])).toEqual([]);
    // Una cifra desplazada del mismo lado, o mal formada, no inventa un par.
    expect(emparejarDeclaradoExtraido([fila({ clave: "stock_a_costo", valor: 79_782, estado: "extraido", origen: "extraido", cifra_desplazada: { lado: "extraido", valor: 70_000 } })])).toEqual([]);
    expect(emparejarDeclaradoExtraido([fila({ clave: "stock_a_costo", valor: 79_782, estado: "extraido", origen: "extraido", cifra_desplazada: { lado: "declarado", valor: null } })])).toEqual([]);
  });
});

describe("LA REGLA · el plan de escritura para el manejador contrastar (dos filas de igual clave y periodo)", () => {
  const metricas: MetricaGuardada[] = [
    { clave: "stock_a_costo", periodo: "actual", valor: 40_000, valor_texto: "como 40,000", estado: "contado", origen: "declarado", response_id: "r1" },
    { clave: "stock_a_costo", periodo: "actual", valor: 79_782, estado: "extraido", origen: "extraido", source_id: "s1" },
    { clave: "venta_mes", periodo: "actual", valor: 80_000, estado: "contado", origen: "declarado", response_id: "r2" },
    { clave: "venta_mes", periodo: "actual", valor: 79_967, estado: "extraido", origen: "extraido", source_id: "s1" },
  ];
  const delDueno = [
    { id: "c1", texto: "La dueña tiene como 40,000 soles en mercadería.", estado: "confirmado", response_id: "r1" },
    { id: "c2", texto: "Rosa lleva cinco años en la tienda.", estado: "confirmado", response_id: "r1" },
    { id: "c3", texto: "Vende unos 80,000 al mes.", estado: "confirmado", response_id: "r2" },
  ];

  it("la pregunta va a la afirmación del dueño que declaró ese número (misma respuesta y la cifra en el texto); nunca a su estado", () => {
    const r = contrasteNumerico(metricas, delDueno);
    expect(r.contradicciones).toBe(1);
    expect(r.coincidencias).toBe(1);
    expect(r.escrituras).toHaveLength(1);
    expect(r.escrituras[0]).toMatchObject({ claim_id: "c1", clave: "stock_a_costo", reemplaza: null });
    expect(r.escrituras[0].pregunta_sugerida).toMatch(/79[\s.,]?782/);
    // Lo que se escribe sobre la afirmación del dueño es pregunta y prioridad: nunca `estado`, nunca `texto`.
    for (const e of r.escrituras) expect(Object.keys(e).sort()).toEqual(["claim_id", "clave", "periodo", "pregunta_sugerida", "reemplaza"]);
    expect(r.sin_afirmacion).toEqual([]);
  });

  it("si la respuesta tiene una sola afirmación, esa recibe la pregunta aunque no repita la cifra", () => {
    const r = contrasteNumerico(metricas, [{ id: "c1", texto: "Tiene mercadería parada de la temporada pasada.", estado: "confirmado", response_id: "r1" }]);
    expect(r.escrituras.map((e) => e.claim_id)).toEqual(["c1"]);
  });

  it("sin afirmación del dueño donde dejarla, la pregunta no se pierde: queda aparte para el rastro del trabajo", () => {
    const r = contrasteNumerico(metricas, [
      { id: "c2", texto: "Rosa lleva cinco años en la tienda.", estado: "confirmado", response_id: "r1" },
      { id: "c9", texto: "Las compras se detienen sin la dueña.", estado: "confirmado", response_id: "r1" },
    ]);
    expect(r.escrituras).toEqual([]);
    expect(r.sin_afirmacion).toHaveLength(1);
    expect(r.sin_afirmacion[0]).toMatchObject({ clave: "stock_a_costo", periodo: "actual" });
    expect(r.sin_afirmacion[0].pregunta).toMatch(/40[\s.,]?000/);
  });

  it("correr dos veces no pregunta dos veces: la afirmación que ya tiene esta pregunta no se vuelve a tocar", () => {
    const primera = contrasteNumerico(metricas, delDueno);
    const yaPreguntada = delDueno.map((c) => (c.id === "c1" ? { ...c, pregunta_sugerida: primera.escrituras[0].pregunta_sugerida } : c));
    const segunda = contrasteNumerico(metricas, yaPreguntada);
    expect(segunda.escrituras).toEqual([]);
    expect(segunda.ya_preguntadas).toBe(1);
  });

  it("si cambia la cifra del documento, la pregunta vieja de ESE número se reemplaza; la de otro asunto se respeta", () => {
    const primera = contrasteNumerico(metricas, delDueno).escrituras[0].pregunta_sugerida;
    const otroInventario = metricas.map((m) => (m.clave === "stock_a_costo" && m.estado === "extraido" ? { ...m, valor: 91_300 } : m));

    const conLaVieja = delDueno.map((c) => (c.id === "c1" ? { ...c, pregunta_sugerida: primera } : c));
    const r = contrasteNumerico(otroInventario, conLaVieja);
    expect(r.escrituras).toHaveLength(1);
    expect(r.escrituras[0].reemplaza).toBe(primera);
    expect(r.escrituras[0].pregunta_sugerida).toMatch(/91[\s.,]?300/);

    const conOtra = delDueno.map((c) => (c.id === "c1" ? { ...c, pregunta_sugerida: "¿Sigue vigente el acuerdo con el proveedor de Gamarra?" } : c));
    const respetada = contrasteNumerico(otroInventario, conOtra);
    expect(respetada.escrituras).toEqual([]);
    expect(respetada.con_otra_pregunta).toBe(1);
  });

  it("una pregunta vacía (la cadena vacía que a veces deja el modelo) no es una pregunta: se escribe encima, y la condición lleva lo que hay, tal cual", () => {
    for (const vacia of ["", "   "]) {
      const r = contrasteNumerico(metricas, delDueno.map((c) => (c.id === "c1" ? { ...c, pregunta_sugerida: vacia } : c)));
      expect(r.escrituras).toHaveLength(1);
      expect(r.escrituras[0].reemplaza).toBe(vacia);
      expect(r.con_otra_pregunta).toBe(0);
    }
  });

  it("«nos dijiste» solo cuando consta que lo dijo el dueño; si lo dijo otra persona, o no consta quién, se dice así", () => {
    const con = (rol: string | null) =>
      contrasteNumerico(metricas, [{ id: "c1", texto: "Hay como 40,000 en mercadería.", estado: "confirmado", response_id: "r1", participants: rol === null ? null : { rol } }]);
    expect(con("dueno").pares[0].declarante).toBe("dueno");
    expect(con("dueno").escrituras[0].pregunta_sugerida).toMatch(/: nos dijiste aproximadamente 40/);
    expect(con("socio").escrituras[0].pregunta_sugerida).toMatch(/: tu socio nos dijo aproximadamente 40/);
    expect(con("empleado").pares[0].declarante).toBe("equipo");
    expect(con("empleado").escrituras[0].pregunta_sugerida).toMatch(/: una persona de tu equipo nos dijo aproximadamente 40/);
    expect(con("empleado").pares[0].veredicto.motivo).toMatch(/lo que dijo una persona del equipo/);
    // Sin participante (el portal, el espejo de indicadores) o con un rol que no es de la empresa: no se le atribuye a nadie.
    expect(con(null).pares[0].declarante).toBeNull();
    expect(con(null).escrituras[0].pregunta_sugerida).toMatch(/: en tus números figura aproximadamente 40/);
    expect(con(null).escrituras[0].pregunta_sugerida).not.toMatch(/nos dij/);
    expect(con(null).pares[0].veredicto.motivo).not.toMatch(/dueño: /);
    expect(con("consultor").pares[0].declarante).toBeNull();
    expect(["dueno", "socio", "lider", "empleado", "cliente", undefined].map(declaranteDeRol)).toEqual(["dueno", "socio", "equipo", "equipo", null, null]);
    expect([rotuloDeDeclarado("dueno"), rotuloDeDeclarado("socio"), rotuloDeDeclarado("equipo"), rotuloDeDeclarado(null)]).toEqual(["Declarado por el dueño", "Declarado por un socio", "Declarado por una persona del equipo", "Declarado"]);
  });

  it("dos números contradichos que apuntan a la misma afirmación: una sola pregunta, y la misma en cada corrida", () => {
    const dos: MetricaGuardada[] = [
      { clave: "venta_mes", periodo: "actual", valor: 80_000, estado: "contado", origen: "declarado", response_id: "r1" },
      { clave: "venta_mes", periodo: "actual", valor: 52_000, estado: "extraido", origen: "extraido" },
      { clave: "ganancia_mes", periodo: "actual", valor: 8_000, estado: "contado", origen: "declarado", response_id: "r1" },
      { clave: "ganancia_mes", periodo: "actual", valor: 2_000, estado: "extraido", origen: "extraido" },
    ];
    const unica = [{ id: "c1", texto: "Vende 80,000 al mes y le quedan 8,000.", estado: "confirmado", response_id: "r1" }];
    const primera = contrasteNumerico(dos, unica);
    expect(primera.contradicciones).toBe(2);
    expect(primera.escrituras).toHaveLength(1);
    expect(primera.con_otra_pregunta).toBe(1);
    const segunda = contrasteNumerico(dos, [{ ...unica[0], pregunta_sugerida: primera.escrituras[0].pregunta_sugerida }]);
    expect(segunda.escrituras).toEqual([]); // no alterna entre una pregunta y la otra
  });

  it("menciona la cifra en cualquiera de las formas en que se escribe", () => {
    expect(mencionaNumero("tengo 40000 en mercadería", 40_000)).toBe(true);
    expect(mencionaNumero("tengo 40.000 en mercadería", 40_000)).toBe(true);
    expect(mencionaNumero("tengo 40,000 en mercadería", 40_000)).toBe(true);
    expect(mencionaNumero("tengo 40 000 en mercadería", 40_000)).toBe(true);
    expect(mencionaNumero("tengo 40 mil en mercadería", 40_000)).toBe(true);
    expect(mencionaNumero("tengo 140,000 en mercadería", 40_000)).toBe(false);
    expect(mencionaNumero("vendí 400 polos", 40_000)).toBe(false);
  });

  it("la pregunta para el dueño trae las dos cifras, va de tú y no decide cuál es la buena", () => {
    const par = emparejarDeclaradoExtraido(metricas, DEL_DUENO)[0];
    const q = preguntaParaElDueno(par);
    expect(q).toMatch(/40[\s.,]?000/);
    expect(q).toMatch(/79[\s.,]?782/);
    expect(q).toMatch(/nos dijiste/);
    expect(q).toMatch(/miden cosas distintas/);
    expect(q).not.toMatch(/usted|verificad|contradic|claim|métrica/i);
    // El periodo se dice cuando no es «hoy»: un mes por su nombre, la mejor época con sus palabras.
    expect(preguntaParaElDueno({ ...par, nombre: "Ventas del mes", periodo: "2026-09" })).toMatch(/^Sobre «Ventas del mes» \(setiembre 2026\): nos dijiste /i);
    expect(preguntaParaElDueno({ ...par, nombre: "Ventas del mes", periodo: "epoca_dorada" })).toMatch(/^Sobre «Ventas del mes» \(tu mejor época\): /);
  });
});

const job = { id: "j1", company_id: "e1", payload: {} };
/** Una afirmación de la dueña, tal como la devuelve `claimsDeEmpresa`: con su participante. */
const afirmacion = (extra: Record<string, unknown>) => ({
  company_id: "e1", source_id: "s-entrevista", fragment_id: null, participant_id: "p-duena", response_id: null, pilar: "producto", tipo: "otro",
  temporalidad: "actual", fecha_afirmacion: null, estado: "confirmado", contradice_a: null, explicacion_contradiccion: null, pregunta_sugerida: null,
  prioridad_validacion: false, validado_por: null, created_at: "2026-10-13T00:00:00Z", participants: { nombre: "Lucero Quintana", rol: "dueno", puesto: "Gerente general" }, ...extra,
});
/** Lo que hay en la base además de los números: lo que la dueña dijo en su entrevista (respuesta r1) y el Excel (fuente s1). */
function sembrarEntrevistaYFuente() {
  limpiarBase();
  base.claims = [
    afirmacion({ id: "c1", texto: "La dueña tiene como 40,000 soles en mercadería.", response_id: "r1" }),
    afirmacion({ id: "c2", texto: "Rosa lleva cinco años en la tienda.", response_id: "r1" }),
  ];
  base.fuentes = [{ id: "s1", nombre: "ventas-e-inventario.xlsx", tipo: "dato" }];
  base.respuestas = [{ id: "r1", interview_sessions: { participants: { rol: "dueno" } } }];
}
const pintar = async () => renderToStaticMarkup(await Contradicciones({ companyId: "e1" }));

/**
 * Lo que debe verse cuando la entrevista declaró «como 40,000» y el Excel trajo 79.782, guarde quien
 * guarde. Lo usan HOY las pruebas con el escritor de referencia y, el día que `guardarMetricas` conserve
 * la cifra que desplaza, la de punta a punta: las mismas afirmaciones, ya ejercitadas.
 */
async function seVeLaContradiccionDelStock() {
  const r = await handleContrastar(job);
  const c1 = base.claims.find((c) => c.id === "c1")!;
  expect(r.contraste_numerico).toMatchObject({ corrido: true, contradicciones: 1, preguntas_dejadas: 1, sin_afirmacion: [] });
  expect(c1.pregunta_sugerida).toMatch(/nos dijiste aproximadamente 40[\s.,]?000 y el documento que nos entregaste muestra 79[\s.,]?782/);
  expect(c1.prioridad_validacion).toBe(true);
  expect(c1.estado).toBe("confirmado");
  const html = await pintar();
  expect(html).toMatch(/No cuadran/);
  expect(html).toMatch(/Declarado por el dueño · Hoy/);
  expect(html).toMatch(/Extraído de un documento · Hoy/);
  expect(html).toMatch(/ventas-e-inventario\.xlsx \(dato\)/);
  expect(html).not.toMatch(/verificad[ao]/i);
  expect(html).not.toMatch(/guarda una sola cifra/);
}

/** Lo que debe verse cuando el Excel trajo 86.900 de ventas de setiembre y después se escribieron 60.000 en el portal. */
async function seVeElParDelPortal() {
  const [par] = emparejarDeclaradoExtraido(base.metricas as MetricaGuardada[]);
  expect(par.veredicto).toMatchObject({ tipo: "CONTRADICCION", clase: "exacta" });
  expect([par.veredicto.declarado.valor, par.veredicto.extraido.valor]).toEqual([60_000, 86_900]);
  // El portal no guarda respuesta de entrevista: no hay afirmación donde dejar la pregunta, y queda en el resultado.
  const r = await handleContrastar(job);
  expect(r.contraste_numerico).toMatchObject({ contradicciones: 1, preguntas_dejadas: 0 });
  expect((r.contraste_numerico as { sin_afirmacion: unknown[] }).sin_afirmacion).toHaveLength(1);
  const html = await pintar();
  expect(html).toMatch(/No cuadran/);
  expect(html).toMatch(/Declarado · Setiembre 2026/);
  expect(html).toMatch(/en tus números figura/);
  expect(html).not.toMatch(/Declarado por/);
}

describe("el manejador contrastar corre la regla (base y modelo FALSOS; parte de la fila que deja un escritor que conserva la cifra desplazada)", () => {
  // Lo que deja `guardarMetricas` cuando el Excel reemplaza lo declarado: la cifra de la dueña, al lado.
  const stockConDesplazada = { id: "m1", company_id: "e1", clave: "stock_a_costo", periodo: "actual", valor: "79782", valor_texto: null, estado: "extraido", origen: "extraido", nota: "Inventario!F2:F121", response_id: null, source_id: "s1", cifra_desplazada: { lado: "declarado", valor: 40000, valor_texto: "como 40,000", response_id: "r1", source_id: null } };

  beforeEach(() => {
    sembrarEntrevistaYFuente();
    base.metricas = [structuredClone(stockConDesplazada)];
  });

  it("deja la pregunta y la prioridad en la afirmación del dueño; su estado y su texto quedan como estaban", async () => {
    const r = await handleContrastar(job);
    const c1 = base.claims.find((c) => c.id === "c1")!;
    expect(c1.pregunta_sugerida).toMatch(/nos dijiste aproximadamente 40[\s.,]?000 y el documento que nos entregaste muestra 79[\s.,]?782/);
    expect(c1.prioridad_validacion).toBe(true);
    expect(c1.estado).toBe("confirmado");
    expect(c1.texto).toBe("La dueña tiene como 40,000 soles en mercadería.");
    expect(base.claims.find((c) => c.id === "c2")!.pregunta_sugerida).toBeNull();
    // Ninguna escritura del contraste de números toca otra columna que pregunta y prioridad.
    expect(base.escrituras.length).toBeGreaterThan(0);
    for (const e of base.escrituras) expect(Object.keys(e).sort()).toEqual(["pregunta_sugerida", "prioridad_validacion"]);
    expect(r.contraste_numerico).toMatchObject({ corrido: true, contradicciones: 1, preguntas_dejadas: 1, sin_afirmacion: [] });
    expect(JSON.stringify(r.contraste_numerico)).not.toMatch(/verificad[ao]/i);
    expect(base.progresos.join(" | ")).toMatch(/1 número\(s\) declarado\(s\) no cuadra\(n\)/);
    // Lee `*`: si falta una columna nueva en la base, lee lo que haya en vez de fallar entero.
    expect(base.seleccion).toBe("*");
  });

  it("repetir el trabajo no vuelve a marcar lo que el consultor ya atendió", async () => {
    await handleContrastar(job);
    const c1 = base.claims.find((c) => c.id === "c1")!;
    c1.prioridad_validacion = false; // el consultor la validó
    base.escrituras = [];
    const r = await handleContrastar(job);
    expect(c1.prioridad_validacion).toBe(false);
    expect(base.escrituras).toEqual([]);
    expect(r.contraste_numerico).toMatchObject({ preguntas_dejadas: 0, ya_preguntadas: 1 });
  });

  it("una pregunta que ya estaba en la afirmación (del modelo, de una persona) no se pisa", async () => {
    const c1 = base.claims.find((c) => c.id === "c1")!;
    c1.pregunta_sugerida = "¿Sigue vigente el acuerdo con el proveedor de Gamarra?";
    const r = await handleContrastar(job);
    expect(c1.pregunta_sugerida).toBe("¿Sigue vigente el acuerdo con el proveedor de Gamarra?");
    expect(c1.prioridad_validacion).toBe(false);
    expect(r.contraste_numerico).toMatchObject({ contradicciones: 1, preguntas_dejadas: 0, con_otra_pregunta: 1 });
  });

  it("una afirmación con la pregunta vacía («») también recibe la pregunta: la cadena vacía no la deja sin escribir", async () => {
    const c1 = base.claims.find((c) => c.id === "c1")!;
    c1.pregunta_sugerida = "";
    const r = await handleContrastar(job);
    expect(c1.pregunta_sugerida).toMatch(/79[\s.,]?782/);
    expect(c1.prioridad_validacion).toBe(true);
    expect(r.contraste_numerico).toMatchObject({ preguntas_dejadas: 1 });
    expect(r.contraste_numerico).not.toHaveProperty("errores");
    expect(r.contraste_numerico).not.toHaveProperty("preguntas_no_dejadas");
  });

  it("si la afirmación cambia mientras se compara, la pregunta no la pisa y lo que no se escribió queda dicho en el resultado", async () => {
    const c1 = base.claims.find((c) => c.id === "c1")!;
    base.antesDeEscribirAfirmacion = () => {
      c1.pregunta_sugerida = "¿Sigue vigente el acuerdo con el proveedor de Gamarra?";
    };
    const r = await handleContrastar(job);
    expect(c1.pregunta_sugerida).toBe("¿Sigue vigente el acuerdo con el proveedor de Gamarra?");
    expect(c1.prioridad_validacion).toBe(false);
    const n = r.contraste_numerico as { preguntas_dejadas: number; errores: string[]; preguntas_no_dejadas: { clave: string; periodo: string; pregunta: string }[] };
    expect(n.preguntas_dejadas).toBe(0);
    expect(n.errores).toEqual([expect.stringMatching(/^stock_a_costo\/actual: la afirmación cambió mientras se comparaba/)]);
    expect(n.preguntas_no_dejadas).toHaveLength(1);
    expect(n.preguntas_no_dejadas[0]).toMatchObject({ clave: "stock_a_costo", periodo: "actual" });
    expect(n.preguntas_no_dejadas[0].pregunta).toMatch(/79[\s.,]?782/);
  });

  it("sin afirmación del dueño, la pregunta queda escrita en el resultado del trabajo", async () => {
    base.claims = [];
    const r = await handleContrastar(job);
    const n = r.contraste_numerico as { sin_afirmacion: { clave: string; pregunta: string }[] };
    expect(n.sin_afirmacion).toHaveLength(1);
    expect(n.sin_afirmacion[0].pregunta).toMatch(/79[\s.,]?782/);
  });

  it("corre antes que el modelo: si el proveedor se cae, la pregunta de los números ya quedó", async () => {
    base.claims.push(
      afirmacion({ id: "c5", texto: "El precio lo fija la dueña.", tipo: "politica", response_id: "r5" }),
      afirmacion({ id: "c6", texto: "Rosa fija el precio de las ofertas.", tipo: "politica", source_id: "s-word", participant_id: null })
    );
    base.modelo.falla = true;
    await expect(handleContrastar(job)).rejects.toThrow(/PAUSA/);
    expect(base.modelo.llamadas).toBe(1);
    expect(base.claims.find((c) => c.id === "c1")!.pregunta_sugerida).toMatch(/79[\s.,]?782/);
  });

  it("si no se pueden leer los números, se dice y el resto del contraste sigue", async () => {
    base.errorMetricas = { message: "permission denied for table company_metricas" };
    const r = await handleContrastar(job);
    expect(r.contraste_numerico).toEqual({ corrido: false, error: "permission denied for table company_metricas" });
    expect(base.progresos.join(" | ")).toMatch(/Contraste de números no corrido: permission denied/);
    expect(base.escrituras).toEqual([]);
  });

  it("cero pares no es «todo cuadra»: con una sola cifra (la del documento) el trabajo dice que no comparó nada y qué falta", async () => {
    base.metricas = [{ ...structuredClone(stockConDesplazada), cifra_desplazada: undefined }];
    const r = await handleContrastar(job);
    expect(r.contraste_numerico).toMatchObject({ corrido: true, contradicciones: 0, coincidencias: 0, no_comparables: 0, pares: [], lados: { declarados: 0, extraidos: 1 } });
    const n = r.contraste_numerico as { sin_pares?: string };
    expect(n.sin_pares).toMatch(/^No hay pares comparables todavía: hay 1 número extraído de un documento y ninguno declarado\. Falta la cifra declarada\./);
    expect(n.sin_pares).toMatch(/No se comparó nada: esto no significa que cuadren\.$/);
    expect(base.progresos.join(" | ")).toMatch(/Contraste de números: No hay pares comparables todavía/);
    expect(base.escrituras).toEqual([]);
  });

  it("una base sin la columna cifra_desplazada (migración sin aplicar): el trabajo dice que ahí los pares del mismo periodo no existen", async () => {
    const sinColumna: Record<string, unknown> = structuredClone(stockConDesplazada);
    delete sinColumna.cifra_desplazada;
    base.metricas = [sinColumna];
    const r = await handleContrastar(job);
    expect((r.contraste_numerico as { aviso_columna?: string }).aviso_columna).toMatch(/falta aplicar supabase\/migracion-cifra-desplazada\.sql/);
    // Con la columna en la base (aunque venga vacía) ese aviso no sale.
    base.metricas = [{ ...sinColumna, cifra_desplazada: null }];
    expect(await handleContrastar(job).then((x) => x.contraste_numerico)).not.toHaveProperty("aviso_columna");
  });

  it("con pares y sin contradicciones, el trabajo dice cuántos comparó y cuántos no pudo comparar", async () => {
    base.metricas = [
      { id: "m7", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: 80000, estado: "contado", origen: "declarado", cifra_desplazada: { lado: "extraido", valor: 81500 } },
      { id: "m8", company_id: "e1", clave: "caja_hoy", periodo: "actual", valor: 15000, estado: "contado", origen: "declarado" },
      { id: "m9", company_id: "e1", clave: "caja_hoy", periodo: "2026-09", valor: 9000, estado: "extraido", origen: "extraido" },
    ];
    const r = await handleContrastar(job);
    expect(r.contraste_numerico).toMatchObject({ contradicciones: 0, coincidencias: 1, no_comparables: 1, lados: { declarados: 2, extraidos: 2 } });
    expect(r.contraste_numerico).not.toHaveProperty("sin_pares");
    expect(base.progresos.join(" | ")).toMatch(/Contraste de números: se comparó 1 par y cuadra dentro de la tolerancia; 1 no se pudo comparar por ser de periodos distintos\. Comparar no verifica/);
  });
});

describe("la pantalla del consultor: Contradicciones en la Matriz de Realidad (el «No cuadran» sale de una fila con la cifra desplazada)", () => {
  // El número que el dueño escribió en el portal (sin respuesta de entrevista) y el que trae el Excel de otro mes: lo que SÍ hay hoy.
  const ventaDelPortal = { id: "m2", company_id: "e1", clave: "venta_mes", periodo: "actual", valor: 80000, estado: "contado", origen: "declarado" };
  const ventaDelExcel = { id: "m3", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: 52300, estado: "extraido", origen: "extraido", source_id: "s1" };

  beforeEach(() => {
    sembrarEntrevistaYFuente();
    base.metricas = [
      { id: "m1", company_id: "e1", clave: "stock_a_costo", periodo: "actual", valor: "79782", estado: "extraido", origen: "extraido", source_id: "s1", cifra_desplazada: { lado: "declarado", valor: 40000, valor_texto: "como 40,000", response_id: "r1" } },
      { ...ventaDelPortal },
      { ...ventaDelExcel },
      // Ya conciliado por el consultor: no entra en la lista.
      { id: "m4", company_id: "e1", clave: "caja_hoy", periodo: "actual", valor: 15000, estado: "verificado", origen: "conciliado", cifra_desplazada: { lado: "declarado", valor: 9000 } },
    ];
  });

  it("lista cada par con las dos cifras rotuladas «declarado» y «extraído», y la pregunta para el dueño", async () => {
    const html = await pintar();
    expect(html).toMatch(/Declarado por el dueño/);
    expect(html).toMatch(/Extraído de un documento/);
    expect(html).toMatch(/Stock a costo/);
    expect(html).toMatch(/40[\s.,]?000/);
    expect(html).toMatch(/79[\s.,]?782/);
    expect(html).toMatch(/No cuadran/);
    expect(html).toMatch(/cifra aproximada/);
    expect(html).toMatch(/«como 40,000»/);
    expect(html).toMatch(/ventas-e-inventario\.xlsx \(dato\)/);
    expect(html).toMatch(/Pregunta para el dueño/);
    expect(html).toMatch(/nos dijiste aproximadamente 40[\s.,]?000/);
    expect(html).toMatch(/contado de memoria · pendiente de conciliar/);
    expect(html).toMatch(/extraído, pendiente de conciliar/);
  });

  it("ninguna cifra aparece como «verificada», y lo ya conciliado no se lista", async () => {
    const html = await pintar();
    expect(html).not.toMatch(/verificad[ao]/i);
    expect(html).not.toMatch(/Dinero en caja hoy/);
    expect(html).toMatch(/Comparar no verifica/);
  });

  it("periodos distintos: las dos cifras a la vista, «No se comparan» y el porqué; sin pregunta ni porcentaje", async () => {
    const html = await pintar();
    expect(html).toMatch(/No se comparan/);
    expect(html).toMatch(/Declarado · Hoy/); // el número del portal: no consta quién lo escribió
    expect(html).toMatch(/Extraído de un documento · Setiembre 2026/);
    expect(html).not.toMatch(/hace falta la cifra del dueño/);
    expect(html).toMatch(/Periodos distintos \(Hoy y Setiembre 2026\): no se comparan\./);
    expect(html).toMatch(/1 no cuadra con lo que muestran los documentos; 1 no se pudo comparar/);
    expect(html.match(/Pregunta para el dueño/g)).toHaveLength(1);
    expect(html.match(/% de diferencia/g)).toHaveLength(1);
  });

  it("quién declaró solo se dice cuando consta: lo que dijo alguien del equipo no se rotula «por el dueño», y lo del portal queda «Declarado» a secas", async () => {
    base.respuestas = [{ id: "r1", interview_sessions: { participants: { rol: "empleado" } } }];
    const html = await pintar();
    expect(html).toMatch(/Declarado por una persona del equipo · Hoy/);
    expect(html).toMatch(/una persona de tu equipo nos dijo aproximadamente 40/);
    expect(html).toMatch(/Declarado · Hoy/);
    expect(html).not.toMatch(/Declarado por el dueño/);
    expect(html).not.toMatch(/nos dijiste/);
    // Si no se puede saber quién dio la respuesta, tampoco se inventa.
    base.respuestas = [];
    expect(await pintar()).not.toMatch(/Declarado por/);
  });

  it("mientras la base guarde una sola cifra por número y periodo, «No se comparan» lo dice y NO aconseja pedir la cifra del mismo periodo", async () => {
    // Como lee una base sin la migración: filas sin la columna cifra_desplazada. Solo puede haber pares de periodos distintos.
    base.metricas = [{ ...ventaDelPortal }, { ...ventaDelExcel }];
    const html = await pintar();
    expect(html).toMatch(/No se comparan/);
    expect(html).toMatch(/Periodos distintos \(Hoy y Setiembre 2026\): no se comparan\./);
    expect(html).toMatch(/guarda una sola cifra por número y periodo/);
    expect(html).toMatch(/todavía no se pueden comparar aquí/);
    expect(html).not.toMatch(/hace falta la cifra del dueño/);
    expect(html).not.toMatch(/No cuadran|Pregunta para el dueño|verificad[ao]/i);
    // Con la columna en la base (aunque venga vacía), las dos cifras del mismo periodo ya pueden estar: el aviso deja de salir.
    base.metricas = base.metricas.map((m) => ({ ...m, cifra_desplazada: null }));
    expect(await pintar()).not.toMatch(/guarda una sola cifra/);
  });

  it("sin pares NO se calla: dice que no se comparó nada y qué cifra falta, para que el silencio no se lea como «todo cuadra»", async () => {
    // Solo lo declarado: falta la cifra del documento.
    base.metricas = [{ ...ventaDelPortal, cifra_desplazada: null }];
    let html = await pintar();
    expect(html).toMatch(/Números declarados frente a documentos/);
    expect(html).toMatch(/No hay pares comparables todavía: hay 1 número declarado y ninguno extraído de un documento que siga pendiente de conciliar\. Falta la cifra del documento\./);
    expect(html).toMatch(/No se comparó nada: esto no significa que cuadren\./);
    expect(html).not.toMatch(/Cuadran|No cuadran|cuadra dentro|guarda una sola cifra/);
    // Solo lo extraído: falta la cifra declarada.
    base.metricas = [{ ...ventaDelExcel, cifra_desplazada: null }];
    expect(await pintar()).toMatch(/hay 1 número extraído de un documento y ninguno declarado\. Falta la cifra declarada\./);
    // Las dos, pero de números distintos: no hay nada que poner al lado.
    base.metricas = [{ ...ventaDelPortal, clave: "caja_hoy", cifra_desplazada: null }, { ...ventaDelExcel, cifra_desplazada: null }];
    expect(await pintar()).toMatch(/hay 1 número declarado y 1 número extraído de un documento, pero ninguno es del mismo número\./);
    // Ningún número, o todos ya conciliados: tampoco se calla.
    base.metricas = [{ id: "m4", company_id: "e1", clave: "caja_hoy", periodo: "actual", valor: 15000, estado: "verificado", origen: "conciliado", cifra_desplazada: null }];
    html = await pintar();
    expect(html).toMatch(/la empresa no tiene números declarados ni números extraídos de documentos que sigan pendientes de conciliar\./);
    expect(html).toMatch(/Lo ya verificado o conciliado no entra en esta comparación\./);
    // En una base sin la columna, además se dice que ahí las dos cifras del mismo periodo no pueden estar a la vez.
    base.metricas = [{ ...ventaDelPortal }];
    expect(await pintar()).toMatch(/por ahora el sistema guarda una sola cifra por número y periodo/);
  });

  it("«se compararon N y cuadran» solo se lee cuando hubo pares del mismo periodo y ninguno contradice", async () => {
    base.metricas = [{ ...ventaDelPortal, periodo: "2026-09", cifra_desplazada: { lado: "extraido", valor: 81500, source_id: "s1" } }];
    const html = await pintar();
    expect(html).toMatch(/Se comparó 1 par del mismo periodo y cuadra dentro de la tolerancia\./);
    expect(html).toMatch(/Comparar no verifica/);
    expect(html).not.toMatch(/No hay pares comparables|No cuadran/);
  });

  it("si la lectura falla, lo dice y no afirma que cuadren", async () => {
    base.metricas = [{ ...ventaDelPortal }];
    base.errorMetricas = { message: "tiempo de espera agotado" };
    const html = await pintar();
    expect(html).toMatch(/No se pudieron leer los números de la empresa: tiempo de espera agotado/);
    expect(html).toMatch(/esto no significa que cuadren/);
  });

  it("la página de Realidad la monta antes de la matriz", () => {
    const pagina = leer("src/app/(consultor)/empresa/[id]/realidad/page.tsx");
    expect(pagina).toMatch(/<Contradicciones companyId=\{id\} \/>[\s\S]*<MatrizRealidad /);
  });
});

describe("ESCRITORES REALES · declarar, extraer, contrastar con lo que guarda números en producto (base falsa, ningún modelo)", () => {
  beforeEach(sembrarEntrevistaYFuente);

  it("los dos escritores reales se pudieron ejecutar: si no, lo de abajo no dice nada", () => {
    expect(ESCRITOR_EXTRACCION.error).toBeNull();
    expect(ESCRITOR_PORTAL.error).toBeNull();
  });

  it("los dos conservan la cifra del otro lado que reemplazan: si alguno dejara de hacerlo, esto falla (las «HOY» de abajo solo documentan qué se perdería)", () => {
    expect(ESCRITOR_EXTRACCION.conserva).toBe(true);
    expect(ESCRITOR_PORTAL.conserva).toBe(true);
  });

  it.skipIf(ESCRITOR_EXTRACCION.conserva)("HOY · `guardarMetricas` pisa la fila: el 40.000 declarado no queda en ninguna parte, y ni el manejador ni la pantalla tienen qué contrastar", async () => {
    const filas = await declararYExtraerDeVerdad();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ valor: 79_782, estado: "extraido", origen: "extraido", source_id: "s1", response_id: null });
    expect(JSON.stringify(base.metricas)).not.toMatch(/40[.,]?000/);

    const r = await handleContrastar(job);
    expect(r.contraste_numerico).toMatchObject({ corrido: true, contradicciones: 0, coincidencias: 0, no_comparables: 0, pares: [] });
    expect(base.claims.find((c) => c.id === "c1")!.pregunta_sugerida).toBeNull();
    expect(base.escrituras).toEqual([]);
    expect(await pintar()).toMatch(/No hay pares comparables todavía/);
  });

  it.runIf(ESCRITOR_EXTRACCION.conserva)(puntaAPunta(ESCRITOR_EXTRACCION, "guardarMetricas", "de punta a punta · la entrevista declara «como 40,000», el Excel trae 79.782 y el contraste deja la pregunta en la afirmación de la dueña"), async () => {
    await declararYExtraerDeVerdad();
    await seVeLaContradiccionDelStock();
  });

  it.skipIf(ESCRITOR_PORTAL.conserva)("HOY · el formulario del portal pisa la cifra extraída: el 86.900 del Excel desaparece y no hay par que mostrar", async () => {
    const { estado, filas } = await extraerYDeclararEnElPortalDeVerdad();
    expect(estado).toBe(200);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ valor: 60_000, estado: "contado" });
    expect(JSON.stringify(base.metricas)).not.toMatch(/86[.,]?900/);
    expect(emparejarDeclaradoExtraido(base.metricas as MetricaGuardada[])).toEqual([]);
    expect(await pintar()).toMatch(/No hay pares comparables todavía/);
  });

  it.runIf(ESCRITOR_PORTAL.conserva)(puntaAPunta(ESCRITOR_PORTAL, "la ruta del portal", "de punta a punta · el Excel trae 86.900, el dueño escribe 60.000 en el portal y las dos cifras quedan al lado, sin atribuirle la declarada a nadie"), async () => {
    const { estado } = await extraerYDeclararEnElPortalDeVerdad();
    expect(estado).toBe(200);
    await seVeElParDelPortal();
  });
});

describe("con un escritor DE REFERENCIA (no es producto: los reales hacen lo mismo y se prueban arriba): los órdenes de llegada y lo que pasa después", () => {
  type Numero = { clave: string; periodo: string; valor: number | null; valor_texto?: string | null; estado: "contado" | "verificado" | "sin_dato"; nota?: string | null };
  /**
   * Lo mismo que hace hoy `guardarMetricas` (buscar la fila por clave y periodo, y pisarla), con el único
   * cambio que falta: leer la fila entera y pasar lo que se va a escribir por `conCifraDesplazada`.
   */
  async function guardarComoDeberia(m: Numero, ref: { response_id?: string; source_id?: string; origen: "declarado" | "extraido" }) {
    const sb = supabaseAdmin();
    const { clave, periodo } = normalizarMetrica(m.clave, m.periodo);
    const { data: prev } = await sb.from("company_metricas").select("*").eq("company_id", "e1").eq("clave", clave).eq("periodo", periodo).maybeSingle();
    const estado = m.estado === "sin_dato" ? "sin_dato" : ref.origen === "extraido" ? "extraido" : m.estado;
    const nueva = { company_id: "e1", clave, periodo, valor: m.valor, valor_texto: m.valor_texto ?? null, estado, origen: ref.origen, nota: m.nota ?? null, response_id: ref.response_id ?? null, source_id: ref.source_id ?? null };
    const filaAGuardar = conCifraDesplazada(nueva, prev as MetricaGuardada | null, ref.origen);
    if (prev) await sb.from("company_metricas").update(filaAGuardar).eq("id", (prev as { id: string }).id);
    else await sb.from("company_metricas").insert(filaAGuardar);
  }
  const declara = () => guardarComoDeberia({ clave: "stock_a_costo", periodo: "actual", valor: 40_000, valor_texto: "como 40,000", estado: "contado" }, { response_id: "r1", origen: "declarado" });
  const extrae = (valor = 79_782, source_id = "s1") => guardarComoDeberia({ clave: "stock_a_costo", periodo: "actual", valor, estado: "verificado", nota: "Inventario!F2:F121" }, { source_id, origen: "extraido" });
  const pares = () => emparejarDeclaradoExtraido(base.metricas as MetricaGuardada[]);

  beforeEach(sembrarEntrevistaYFuente);

  it("declarar → extraer → contrastar: una sola fila con las dos cifras, la pregunta en la afirmación de la dueña y «No cuadran» en la pantalla", async () => {
    await declara();
    await extrae();
    expect(base.metricas).toHaveLength(1);
    expect(base.metricas[0]).toMatchObject({ valor: 79_782, estado: "extraido", cifra_desplazada: { lado: "declarado", valor: 40_000, valor_texto: "como 40,000", response_id: "r1" } });
    await seVeLaContradiccionDelStock();
  });

  it("extraer → declarar → contrastar: el mismo par y la misma pregunta, en el otro orden de llegada", async () => {
    await extrae();
    await declara();
    expect(base.metricas).toHaveLength(1);
    expect(base.metricas[0]).toMatchObject({ valor: 40_000, estado: "contado", cifra_desplazada: { lado: "extraido", valor: 79_782, source_id: "s1" } });
    await seVeLaContradiccionDelStock();
  });

  it("extraer → escribir en el portal (sin respuesta de entrevista): las dos cifras quedan al lado y la declarada no se le atribuye a nadie", async () => {
    await guardarComoDeberia({ clave: "venta_mes", periodo: "2026-09", valor: 86_900, estado: "verificado" }, { source_id: "s1", origen: "extraido" });
    await guardarComoDeberia({ clave: "venta_mes", periodo: "2026-09", valor: 60_000, estado: "contado" }, { origen: "declarado" });
    expect(base.metricas).toHaveLength(1);
    await seVeElParDelPortal();
  });

  it("el dueño dice después «no lo sé» y llega otro documento: el 40.000 que retiró no resucita", async () => {
    await declara();
    await extrae();
    await guardarComoDeberia({ clave: "stock_a_costo", periodo: "actual", valor: null, estado: "sin_dato" }, { response_id: "r2", origen: "declarado" });
    expect(pares()).toEqual([]);
    await extrae(80_500, "s2");
    expect(base.metricas[0]).toMatchObject({ valor: 80_500, estado: "extraido", cifra_desplazada: null });
    expect(pares()).toEqual([]);
  });

  it("el consultor descarta la cifra del documento: el par desaparece; lo declarado sigue en pie y se pone al lado del documento siguiente", async () => {
    await declara();
    await extrae();
    // Lo que hace la ruta de consolidar al descartar un número: lo vacía y le pone estado propio.
    Object.assign(base.metricas[0], { valor: null, estado: "descartado" });
    expect(pares()).toEqual([]);
    await extrae(80_500, "s2");
    const [par] = pares();
    expect(par.veredicto.tipo).toBe("CONTRADICCION");
    expect([par.veredicto.declarado.valor, par.veredicto.extraido.valor]).toEqual([40_000, 80_500]);
    expect(par.extraido.source_id).toBe("s2");
  });
});

describe("CIERRE Z1 · la aproximación solo cuenta cuando acompaña a la cifra", () => {
  it("«casi 40 mil», «cerca de los 40 mil», «alrededor de 40.000», «por ahí de 40 mil»: aproximadas", () => {
    for (const dicho of ["casi 40 mil", "cerca de los 40 mil", "alrededor de 40.000", "alrededor de unos 40 mil", "por ahí de 40 mil", "40 mil por ahí", "calculo que son 40 mil", "casi S/ 40,000", "40.000 aprox.", "aproximadamente 40.000", "redondeando, 40.000"]) {
      expect(leerDeclaracion(dicho), dicho).toMatchObject({ clase: "aproximada", valor: 40_000 });
    }
    // En letras, como lo deja quien transcribe la voz: vale junto al número ya guardado.
    expect(declaracionDeMetrica({ valor: 40_000, valor_texto: "casi cuarenta mil", nota: null }).clase).toBe("aproximada");
    expect(declaracionDeMetrica({ valor: 40_000, valor_texto: "alrededor de cuarenta mil", nota: null }).clase).toBe("aproximada");
  });

  it("«casi todo», «cerca del mercado», «cálculo del contador», «por ahí»: sueltos no dicen nada de la cifra, y es exacta", () => {
    for (const dicho of ["Casi todo al contado: 80.000", "El local queda cerca del mercado y vende 80.000", "Según el cálculo del contador son 80.000", "Segun el calculo del contador son 80.000", "Alrededor de la plaza hay competencia; vendo 80.000", "La tienda de por ahí vende 80.000"]) {
      expect(leerDeclaracion(dicho), dicho).toMatchObject({ clase: "exacta", valor: 80_000 });
    }
  });

  it("en el número guardado: la nota «casi todo al contado», «cerca del mercado» o «cálculo del contador» no regala 20 % de tolerancia", () => {
    for (const nota of ["casi todo al contado", "local cerca del mercado", "cálculo del contador", "calculo del contador", "queda por ahí, cerca de la plaza"]) {
      expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota }), nota).toMatchObject({ clase: "exacta", valor: 80_000 });
    }
    // «aproximado» y «más o menos» solo se dicen de una cifra: en la nota siguen contando.
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota: "aproximado, de memoria" }).clase).toBe("aproximada");
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota: "más o menos" }).clase).toBe("aproximada");
    // La diferencia que la tolerancia de más escondía: 80.000 con esa nota frente a 90.000 es CONTRADICCIÓN (12,5 % > 5 %).
    const [par] = emparejarDeclaradoExtraido([
      fila({ clave: "venta_mes", valor: 80_000, nota: "casi todo al contado", estado: "contado", origen: "declarado" }),
      fila({ clave: "venta_mes", valor: 90_000, estado: "extraido", origen: "extraido" }),
    ]);
    expect(par.veredicto).toMatchObject({ tipo: "CONTRADICCION", clase: "exacta", tolerancia_pct: 5 });
  });
});

describe("CIERRE Z1 · un rango no manda cuando no es un rango de esta cifra", () => {
  it("dos años no son dos montos: «entre 2019 y 2021 vendía 80.000» deja mandar al 80.000 guardado", () => {
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: "entre 2019 y 2021 vendía 80.000 al mes", nota: null })).toMatchObject({ clase: "exacta", valor: 80_000 });
    // Sin número guardado, de dos años no sale ni un rango ni una cifra.
    expect(declaracionDeMetrica({ valor: null, valor_texto: "entre 2019 y 2021 vendía más", nota: null })).toMatchObject({ clase: "desconocida", valor: null });
    // Frente a 81.500 del documento, coincide: antes se comparaba contra «2021» y salía una contradicción de 3.900 %.
    const [par] = emparejarDeclaradoExtraido([
      fila({ clave: "venta_mes", valor: 80_000, valor_texto: "entre 2019 y 2021 vendía 80.000 al mes", estado: "contado", origen: "declarado" }),
      fila({ clave: "venta_mes", valor: 81_500, estado: "extraido", origen: "extraido" }),
    ]);
    expect(par.veredicto.tipo).toBe("COINCIDE");
    expect(par.veredicto.declarado.valor).toBe(80_000);
  });

  it("si el valor guardado cae fuera del rango escrito, el texto es de otra declaración: manda el valor y el texto viejo no se cita", () => {
    const d = declaracionDeMetrica({ valor: 30_000, valor_texto: "entre 18,000 y 25,000", nota: null });
    expect(d).toEqual({ clase: "exacta", valor: 30_000, texto: "30000" });
    // Dentro del rango (o en su borde) el rango sigue mandando, sin punto medio inventado.
    expect(declaracionDeMetrica({ valor: 25_000, valor_texto: "entre 18,000 y 25,000", nota: null }).clase).toBe("rango");
    expect(declaracionDeMetrica({ valor: null, valor_texto: "entre 18,000 y 25,000", nota: null }).clase).toBe("rango");
    // 30.000 frente a 30.500 del documento coincide; con el rango viejo mandando habría salido CONTRADICCIÓN (25.000 vs 30.500).
    const [par] = emparejarDeclaradoExtraido([
      fila({ clave: "venta_mes", valor: 30_000, valor_texto: "entre 18,000 y 25,000", estado: "contado", origen: "declarado" }),
      fila({ clave: "venta_mes", valor: 30_500, estado: "extraido", origen: "extraido" }),
    ]);
    expect(par.veredicto.tipo).toBe("COINCIDE");
    expect(par.veredicto.motivo).not.toMatch(/entre 18/);
  });
});

describe("CIERRE Z1 · una contradicción, una afirmación: dos de la misma respuesta con la misma cifra no reciben ambas la pregunta", () => {
  // La dueña dijo en la misma respuesta que vende 40.000 y que tiene 40.000 en mercadería. Solo el stock no cuadra.
  const dosNumeros: MetricaGuardada[] = [
    { clave: "venta_mes", periodo: "actual", valor: 40_000, estado: "contado", origen: "declarado", response_id: "r1", cifra_desplazada: { lado: "extraido", valor: 40_500 } },
    { clave: "stock_a_costo", periodo: "actual", valor: 79_782, estado: "extraido", origen: "extraido", source_id: "s1", cifra_desplazada: { lado: "declarado", valor: 40_000, valor_texto: "como 40,000", response_id: "r1" } },
  ];
  const deVentas = { id: "c-ventas", texto: "Vende 40,000 soles al mes.", estado: "confirmado", response_id: "r1" };
  const deStock = { id: "c-stock", texto: "Tiene como 40,000 en mercadería.", estado: "confirmado", response_id: "r1" };

  it("la pregunta del stock va solo a la afirmación del stock: la de las ventas habla del otro número con esa cifra", () => {
    for (const orden of [[deVentas, deStock], [deStock, deVentas]]) {
      const r = contrasteNumerico(dosNumeros, orden);
      expect(r.contradicciones).toBe(1);
      expect(r.escrituras.map((e) => [e.claim_id, e.clave])).toEqual([["c-stock", "stock_a_costo"]]);
      expect(r.escrituras[0].pregunta_sugerida).toMatch(/^Sobre «Stock a costo»/);
      expect(r.sin_afirmacion).toEqual([]);
    }
  });

  it("si la que nombra el número es una sola, esa: «ventas» en el texto la señala aunque otra repita la cifra", () => {
    const soloVentas: MetricaGuardada[] = [{ clave: "venta_mes", periodo: "actual", valor: 40_000, estado: "contado", origen: "declarado", response_id: "r1", cifra_desplazada: { lado: "extraido", valor: 79_782 } }];
    const r = contrasteNumerico(soloVentas, [{ ...deStock, texto: "Hace un año debía 40,000 al banco." }, deVentas]);
    expect(r.escrituras.map((e) => e.claim_id)).toEqual(["c-ventas"]);
  });

  it("la misma cifra dicha dos veces sobre el mismo número: una pregunta basta, y cada corrida elige la misma afirmación", () => {
    const soloVentas: MetricaGuardada[] = [{ clave: "venta_mes", periodo: "actual", valor: 40_000, estado: "contado", origen: "declarado", response_id: "r1", cifra_desplazada: { lado: "extraido", valor: 79_782 } }];
    const otraDeVentas = { id: "c-a", texto: "Las ventas del mes son 40,000.", estado: "confirmado", response_id: "r1" };
    for (const orden of [[deVentas, otraDeVentas], [otraDeVentas, deVentas]]) {
      const r = contrasteNumerico(soloVentas, orden);
      expect(r.escrituras).toHaveLength(1);
      expect(r.escrituras[0].claim_id).toBe("c-a");
    }
  });

  it("si no se puede saber cuál habla de ese número, ninguna la recibe: la pregunta queda en el resultado, con el porqué", () => {
    const stock: MetricaGuardada[] = [dosNumeros[1]];
    const r = contrasteNumerico(stock, [
      { id: "c1", texto: "Hay 40,000 parados desde la campaña pasada.", estado: "confirmado", response_id: "r1" },
      { id: "c2", texto: "Le prestaron 40,000 el año pasado.", estado: "confirmado", response_id: "r1" },
    ]);
    expect(r.escrituras).toEqual([]);
    expect(r.sin_afirmacion).toHaveLength(1);
    expect(r.sin_afirmacion[0]).toMatchObject({ clave: "stock_a_costo", motivo: MOTIVO_VARIAS_AFIRMACIONES });
    expect(r.sin_afirmacion[0].pregunta).toMatch(/79[\s.,]?782/);
  });

  it("el manejador escribe UNA sola afirmación", async () => {
    limpiarBase();
    base.metricas = dosNumeros.map((m, i) => ({ ...structuredClone(m), id: `m-${i}`, company_id: "e1" }));
    base.claims = [afirmacion({ ...deVentas }), afirmacion({ ...deStock })];
    const r = await handleContrastar(job);
    expect(r.contraste_numerico).toMatchObject({ contradicciones: 1, preguntas_dejadas: 1 });
    expect(base.claims.find((c) => c.id === "c-ventas")).toMatchObject({ pregunta_sugerida: null, prioridad_validacion: false });
    expect(base.claims.find((c) => c.id === "c-stock")!.pregunta_sugerida).toMatch(/Stock a costo/);
  });
});

describe("CIERRE Z1 · cuántos números hay de cada lado, haya par o no", () => {
  it("cuenta lo declarado y lo extraído que siguen pendientes; lo conciliado, lo descartado y el «no lo sé» no cuentan", () => {
    expect(ladosDisponibles([
      fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "declarado" }),
      fila({ clave: "caja_hoy", valor: null, valor_texto: "entre 5 y 8 mil", estado: "contado", origen: "declarado" }),
      fila({ clave: "ganancia_mes", valor: null, estado: "sin_dato", origen: "declarado" }),
      fila({ clave: "deuda_propia", valor: 30_000, estado: "verificado", origen: "conciliado" }),
      fila({ clave: "stock_a_costo", valor: 79_782, estado: "extraido", origen: "extraido", cifra_desplazada: { lado: "declarado", valor: 40_000 } }),
      fila({ clave: "deuda_clientes", valor: null, estado: "descartado", origen: "extraido" }),
    ])).toEqual({ declarados: 3, extraidos: 1 });
    expect(ladosDisponibles([])).toEqual({ declarados: 0, extraidos: 0 });
  });

  it("la frase de «no hay pares» dice qué falta y nunca dice que cuadren", () => {
    expect(motivoSinPares({ declarados: 0, extraidos: 0 })).toMatch(/no tiene números declarados ni números extraídos/);
    expect(motivoSinPares({ declarados: 3, extraidos: 0 })).toMatch(/hay 3 números declarados y ninguno extraído.*Falta la cifra del documento\./);
    expect(motivoSinPares({ declarados: 0, extraidos: 2 })).toMatch(/hay 2 números extraídos de documentos y ninguno declarado\. Falta la cifra declarada\./);
    expect(motivoSinPares({ declarados: 1, extraidos: 1 })).toMatch(/ninguno es del mismo número/);
    for (const l of [{ declarados: 0, extraidos: 0 }, { declarados: 3, extraidos: 0 }, { declarados: 0, extraidos: 2 }, { declarados: 1, extraidos: 1 }]) {
      expect(motivoSinPares(l)).toMatch(/^No hay pares comparables todavía/);
      expect(motivoSinPares(l)).not.toMatch(/cuadra|coincid|verificad/i);
    }
    const r = contrasteNumerico([fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "declarado" })], []);
    expect(r).toMatchObject({ pares: [], lados: { declarados: 1, extraidos: 0 } });
    expect(r.sin_pares).toMatch(/Falta la cifra del documento/);
  });
});

/** El cuerpo de una respuesta, venga del `ok` falso de esta prueba o de un NextResponse de verdad. */
async function cuerpoDe(res: unknown): Promise<Record<string, unknown>> {
  const r = res as { body?: unknown; json?: () => Promise<unknown> };
  return (typeof r.json === "function" ? await r.json() : r.body) as Record<string, unknown>;
}
/** Lo que el dueño manda desde «Tus números», con la RUTA REAL. */
async function escribirEnElPortal(cuerpo: Record<string, unknown>): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/portal/numeros/route");
  const guardar = POST as unknown as (perfil: unknown, req: Request) => Promise<{ status: number }>;
  const res = await guardar({ id: "u-duena", rol: "cliente" }, new Request("http://prueba.local/api/portal/numeros", { method: "POST", body: JSON.stringify(cuerpo) }));
  return { estado: res.status, cuerpo: await cuerpoDe(res) };
}

describe("CIERRE Z1 · ESCRITORES REALES en una base que todavía no tiene la columna cifra_desplazada: el número nunca se pierde", () => {
  beforeEach(sembrarEntrevistaYFuente);

  it("escribirConservando: si la base no conoce la columna (42703 o PGRST204), guarda sin ella y avisa en consola; otro fallo se devuelve tal cual", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (const error of [{ code: "42703", message: 'column "cifra_desplazada" of relation "company_metricas" does not exist' }, { code: "PGRST204", message: "Could not find the 'cifra_desplazada' column of 'company_metricas' in the schema cache" }]) {
        aviso.mockClear();
        const recibidas: Record<string, unknown>[] = [];
        const r = await escribirConservando({ valor: 79_782, cifra_desplazada: { lado: "declarado", valor: 40_000 } }, async (f) => {
          recibidas.push(f);
          return { error: "cifra_desplazada" in f ? error : null };
        }, "stock_a_costo/actual");
        expect(r).toEqual({ error: null, sin_columna: true });
        expect(recibidas).toEqual([{ valor: 79_782, cifra_desplazada: { lado: "declarado", valor: 40_000 } }, { valor: 79_782 }]);
        expect(aviso).toHaveBeenCalledTimes(1);
        expect(String(aviso.mock.calls[0][0])).toMatch(/stock_a_costo\/actual.*migracion-cifra-desplazada\.sql/);
      }
      // Otro fallo (la base caída) no se reintenta ni se disfraza.
      aviso.mockClear();
      let veces = 0;
      const caida = await escribirConservando({ valor: 1, cifra_desplazada: null }, async () => {
        veces++;
        return { error: { code: "57P01", message: "terminating connection" } };
      }, "x/actual");
      expect(caida).toEqual({ error: { code: "57P01", message: "terminating connection" }, sin_columna: false });
      expect(veces).toBe(1);
      // Si la fila no lleva la columna, no hay nada que quitar: el fallo se devuelve.
      expect((await escribirConservando({ valor: 1 }, async () => ({ error: { code: "42703", message: 'column "origen" does not exist' } }), "x/actual")).error).toMatchObject({ code: "42703" });
      // Y si sin la columna tampoco entra, el fallo que vuelve es el de verdad.
      expect((await escribirConservando({ valor: 1, cifra_desplazada: null }, async () => ({ error: { code: "42703", message: 'column "origen" does not exist' } }), "x/actual")).error).toMatchObject({ message: 'column "origen" does not exist' });
      expect(aviso).not.toHaveBeenCalled();
    } finally {
      aviso.mockRestore();
    }
  });

  it("`guardarMetricas` y la ruta del portal guardan el número nuevo aunque la base rechace la columna; lo dicen en consola", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      base.sinColumnaDesplazada = { code: "PGRST204", message: "Could not find the 'cifra_desplazada' column of 'company_metricas' in the schema cache" };
      const stock = await declararYExtraerDeVerdad();
      expect(stock).toHaveLength(1);
      expect(stock[0]).toMatchObject({ valor: 79_782, estado: "extraido", source_id: "s1" });
      expect(stock[0]).not.toHaveProperty("cifra_desplazada");
      const { estado, filas } = await extraerYDeclararEnElPortalDeVerdad();
      expect(estado).toBe(200);
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ valor: 60_000, estado: "contado" });
      expect(aviso).toHaveBeenCalledTimes(2);
      // En esa base el par no existe, y la pantalla no lo calla.
      expect(await pintar()).toMatch(/No hay pares comparables todavía/);
    } finally {
      aviso.mockRestore();
    }
  });
});

describe("CIERRE Z1 · ESCRITORES REALES · la ruta del portal dice lo que no guardó y por qué", () => {
  beforeEach(sembrarEntrevistaYFuente);

  it("un número ya verificado no se reemplaza, y la respuesta lo dice con su nombre y su mes; lo demás sí se guarda", async () => {
    base.metricas = [{ id: "m1", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: "86900", estado: "verificado", origen: "conciliado", cifra_desplazada: null }];
    const r = await escribirEnElPortal({ meses: [{ periodo: "2026-09", venta: 60_000 }], vitales: { caja_hoy: 5_000 } });
    expect(r.estado).toBe(409);
    expect(r.cuerpo.guardados).toBe(1);
    expect(r.cuerpo.no_guardados).toEqual([{ clave: "venta_mes", periodo: "2026-09", motivo: "verificado", texto: "«Ventas del mes» (Setiembre 2026) ya está verificado con un documento y no se cambió por lo que escribiste." }]);
    expect(r.cuerpo.error).toBe("Guardamos 1 de tus números. «Ventas del mes» (Setiembre 2026) ya está verificado con un documento y no se cambió por lo que escribiste. Si ese dato cambió, cuéntaselo a tu consultor.");
    expect(base.metricas.find((m) => m.clave === "venta_mes")).toMatchObject({ valor: "86900", estado: "verificado", origen: "conciliado" });
    expect(base.metricas.find((m) => m.clave === "caja_hoy")).toMatchObject({ valor: 5_000, estado: "contado" });
  });

  it("si el dueño escribe lo mismo que ya está verificado, no hay nada que decirle", async () => {
    base.metricas = [{ id: "m1", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: "86900", estado: "verificado", origen: "conciliado" }];
    const r = await escribirEnElPortal({ meses: [{ periodo: "2026-09", venta: 86_900 }] });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toEqual({ guardados: 0, no_guardados: [] });
  });

  it("si la lectura previa falla, no inserta a ciegas: lo dice con el nombre del número y no trae el mensaje de la base", async () => {
    base.errorMetricas = { message: "tiempo de espera agotado en company_metricas_pkey" };
    const r = await escribirEnElPortal({ meses: [{ periodo: "2026-09", venta: 60_000 }] });
    expect(r.estado).toBe(500);
    expect(r.cuerpo.guardados).toBe(0);
    expect(r.cuerpo.no_guardados).toEqual([{ clave: "venta_mes", periodo: "2026-09", motivo: "error", texto: "«Ventas del mes» (Setiembre 2026) no se pudo guardar." }]);
    expect(String(r.cuerpo.error)).toMatch(/^No pudimos guardar tus números\. «Ventas del mes» \(Setiembre 2026\) no se pudo guardar\. Intenta de nuevo\.$/);
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/pkey|tiempo de espera/);
    expect(base.metricas).toEqual([]);
  });

  it("con dos filas del mismo número y mes no añade una tercera: actualiza una", async () => {
    base.metricas = [
      { id: "m1", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: 50_000, estado: "contado" },
      { id: "m2", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: 51_000, estado: "contado" },
    ];
    const r = await escribirEnElPortal({ meses: [{ periodo: "2026-09", venta: 60_000 }] });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toEqual({ guardados: 1, no_guardados: [] });
    expect(base.metricas).toHaveLength(2);
    expect(base.metricas.filter((m) => m.valor === 60_000)).toHaveLength(1);
    // Y lee la fila entera, no solo id y estado: sin eso no habría cifra que conservar.
    expect(base.seleccion).toBe("*");
  });

  it("lo que se escribe en el portal deja de atribuirse a la respuesta de entrevista del número anterior", async () => {
    base.metricas = [{ id: "m1", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: 40_000, valor_texto: "como 40 mil", estado: "contado", origen: "declarado", response_id: "r1", cifra_desplazada: { lado: "extraido", valor: 86_900, source_id: "s1" } }];
    expect((await escribirEnElPortal({ meses: [{ periodo: "2026-09", venta: 60_000 }] })).estado).toBe(200);
    expect(base.metricas[0]).toMatchObject({ valor: 60_000, valor_texto: null, response_id: null, cifra_desplazada: { lado: "extraido", valor: 86_900 } });
    const html = await pintar();
    expect(html).toMatch(/Declarado · Setiembre 2026/);
    expect(html).not.toMatch(/Declarado por/);
  });

  it("al reemplazar una cifra extraída, la fila deja de ser «del documento»: el documento queda citado en la cifra que se conserva al lado", async () => {
    const { estado, filas } = await extraerYDeclararEnElPortalDeVerdad();
    expect(estado).toBe(200);
    // La fila es ahora lo que escribió el dueño: ni origen «extraido» ni la fuente del Excel. Así la revisión de
    // ese documento no la muestra como leída de él, y nadie puede aceptar como del documento una cifra del dueño.
    expect(filas[0]).toMatchObject({ valor: 60_000, estado: "contado", origen: "declarado", source_id: null });
    expect(filas[0].cifra_desplazada).toMatchObject({ lado: "extraido", valor: 86_900, source_id: "s1" });
    expect(base.metricas.filter((m) => m.source_id === "s1")).toEqual([]);
    // Y el par sigue diciendo de qué documento salió la otra cifra.
    expect(await pintar()).toMatch(/ventas-e-inventario\.xlsx \(dato\)/);
  });
});

describe("CIERRE Z1 · ESCRITORES REALES · el manejador de extracción (extractor FALSO, base falsa)", () => {
  const sesion = { id: "ses-00000001", company_id: "e1", participant_id: "p-duena", tipo: "entrada_breve", participants: { nombre: "Lucero Quintana", puesto: "Gerente general", rol: "dueno" } };
  const extraer = async (trabajo: { id: string; company_id: string; payload: Record<string, unknown> }) => (await import("@/lib/jobs/handlers/extraer")).handleExtraer(trabajo);

  beforeEach(() => {
    sembrarEntrevistaYFuente();
    base.extractor.salida = { afirmaciones: [], metricas: [{ clave: "venta_mes", periodo: "actual", valor: 0, estado: "contado", valor_texto: "No lo sé." }] };
  });

  it("una respuesta con certeza «no_lo_se» NO va al extractor ni produce número, ni siquiera un cero", async () => {
    base.respuestas = [{ id: "r9", pregunta: "¿Cuánto vendiste el mes pasado?", respuesta: "No lo sé.", certeza: "no_lo_se", orden: 3, interview_sessions: sesion }];
    const r = await extraer({ id: "j9", company_id: "e1", payload: { response_id: "r9" } });
    expect(r).toMatchObject({ nuevas: 0 });
    expect((r as { sin_extraer?: string }).sin_extraer).toMatch(/no lo sé/);
    expect(base.extractor.llamadas).toBe(0);
    expect(base.metricas).toEqual([]);
    expect(base.claims.filter((c) => c.response_id === "r9")).toEqual([]);
  });

  it("la misma respuesta con otra certeza sí se extrae: lo que la frena es el «no lo sé», no otra cosa", async () => {
    base.respuestas = [{ id: "r8", pregunta: "¿Cuánto vendiste el mes pasado?", respuesta: "Como 40 mil.", certeza: "aproximada", orden: 3, interview_sessions: sesion }];
    base.extractor.salida = { afirmaciones: [], metricas: [{ clave: "venta_mes", periodo: "actual", valor: 40_000, estado: "contado", valor_texto: "como 40 mil" }] };
    await extraer({ id: "j8", company_id: "e1", payload: { response_id: "r8" } });
    expect(base.extractor.llamadas).toBe(1);
    expect(base.metricas).toEqual([expect.objectContaining({ clave: "venta_mes", valor: 40_000, estado: "contado", origen: "declarado", response_id: "r8" })]);
  });

  it("lecturaEnParte: dice qué tramos fallaron, contados desde 1, y conserva la nota que la fuente ya tenía", async () => {
    const { lecturaEnParte } = await import("@/lib/jobs/handlers/extraer");
    expect(lecturaEnParte([], 3)).toBeNull();
    expect(lecturaEnParte([NaN], 3)).toBeNull();
    expect(lecturaEnParte([1], 3)).toEqual({ fidelidad_extraccion: "baja", fidelidad_nota: "Se leyó en parte: falló el tramo 2 de 3. Lo que traía esa parte no está en la lectura: vuelve a extraer la fuente antes de darla por revisada." });
    expect(lecturaEnParte([3, 0, 3], 5)!.fidelidad_nota).toMatch(/^Se leyó en parte: fallaron los tramos 1 y 4 de 5\./);
    expect(lecturaEnParte([0], 2, "Hoja «Inventario»: 3 celdas vacías.")!.fidelidad_nota).toMatch(/de 2\..*revisada\. Hoja «Inventario»: 3 celdas vacías\.$/);
  });

  it("un tramo falló y otro termina: la fuente queda «leído» pero dice que se leyó en parte; y el número del tramo conserva lo declarado", async () => {
    base.metricas = [{ id: "m1", company_id: "e1", clave: "stock_a_costo", periodo: "actual", valor: 40_000, valor_texto: "como 40,000", estado: "contado", origen: "declarado", response_id: "r1", source_id: null, nota: null, cifra_desplazada: null }];
    base.jobs = [
      { id: "j-t0", company_id: "e1", tipo: "extraer", estado: "fallido", payload: { source_id: "s1", chunk_index: 0, total: 2 } },
      { id: "j-t1", company_id: "e1", tipo: "extraer", estado: "corriendo", payload: { source_id: "s1", chunk_index: 1, total: 2 } },
      // De otra fuente: no cuenta.
      { id: "j-otra", company_id: "e1", tipo: "extraer", estado: "fallido", payload: { source_id: "s2", chunk_index: 0, total: 1 } },
    ];
    base.extractor.salida = {
      afirmaciones: [{ texto: "El inventario a costo suma 79,782.", pilar: "producto", tipo: "otro", temporalidad: "actual", fragmento: "Total a costo: 79782", celda: "F122" }],
      metricas: [{ clave: "stock_a_costo", periodo: "actual", valor: 79_782, estado: "verificado", nota: "Inventario!F2:F121" }],
    };
    const r = await extraer({ id: "j-t1", company_id: "e1", payload: { source_id: "s1", chunk_index: 1, total: 2, texto: "Inventario | Total a costo: 79782", hoja: "Inventario" } });
    expect(base.extractor.llamadas).toBe(1);
    const fuente = base.fuentes.find((f) => f.id === "s1")!;
    expect(fuente).toMatchObject({ estado: "leido", revision: "pendiente", fidelidad_extraccion: "baja" });
    expect(String(fuente.fidelidad_nota)).toMatch(/^Se leyó en parte: falló el tramo 1 de 2\./);
    expect((r as { lectura_en_parte?: string }).lectura_en_parte).toMatch(/falló el tramo 1 de 2/);
    // El número del documento reemplaza al declarado en la fila, y el declarado queda al lado: nunca verificado.
    expect(base.metricas).toHaveLength(1);
    expect(base.metricas[0]).toMatchObject({ valor: 79_782, estado: "extraido", origen: "extraido", source_id: "s1", cifra_desplazada: { lado: "declarado", valor: 40_000, valor_texto: "como 40,000", response_id: "r1" } });
    await seVeLaContradiccionDelStock();
  });

  it("si ningún tramo falló, la fuente queda «leído» sin tocar su fidelidad; y con tramos aún en curso no se marca", async () => {
    base.fuentes = [{ id: "s1", nombre: "ventas-e-inventario.xlsx", tipo: "dato", estado: "leyendo", fidelidad_extraccion: "media", fidelidad_nota: "Hoja «Inventario»: 3 celdas vacías." }];
    base.jobs = [
      { id: "j-t0", company_id: "e1", tipo: "extraer", estado: "pendiente", payload: { source_id: "s1", chunk_index: 0, total: 2 } },
      { id: "j-t1", company_id: "e1", tipo: "extraer", estado: "corriendo", payload: { source_id: "s1", chunk_index: 1, total: 2 } },
    ];
    base.extractor.salida = { afirmaciones: [], metricas: [] };
    await extraer({ id: "j-t1", company_id: "e1", payload: { source_id: "s1", chunk_index: 1, total: 2, texto: "fila 2" } });
    expect(base.fuentes[0]).toMatchObject({ estado: "leyendo" });
    base.jobs[0].estado = "hecho";
    const r = await extraer({ id: "j-t1", company_id: "e1", payload: { source_id: "s1", chunk_index: 1, total: 2, texto: "fila 2" } });
    expect(base.fuentes[0]).toMatchObject({ estado: "leido", revision: "pendiente", fidelidad_extraccion: "media", fidelidad_nota: "Hoja «Inventario»: 3 celdas vacías." });
    expect(r).not.toHaveProperty("lectura_en_parte");
  });

  it("una relectura que sale entera retira el «se leyó en parte» de la lectura anterior", async () => {
    base.fuentes = [{ id: "s1", nombre: "notas-de-la-visita.txt", tipo: "documento", estado: "leyendo", fidelidad_extraccion: "baja", fidelidad_nota: "Se leyó en parte: falló el tramo 1 de 2. Lo que traía esa parte no está en la lectura: vuelve a extraer la fuente antes de darla por revisada." }];
    base.jobs = [
      { id: "j-t0", company_id: "e1", tipo: "extraer", estado: "hecho", payload: { source_id: "s1", chunk_index: 0, total: 2 } },
      { id: "j-t1", company_id: "e1", tipo: "extraer", estado: "corriendo", payload: { source_id: "s1", chunk_index: 1, total: 2 } },
    ];
    base.extractor.salida = { afirmaciones: [], metricas: [] };
    await extraer({ id: "j-t1", company_id: "e1", payload: { source_id: "s1", chunk_index: 1, total: 2, texto: "segunda mitad" } });
    expect(base.fuentes[0]).toMatchObject({ estado: "leido", revision: "pendiente", fidelidad_extraccion: null, fidelidad_nota: null });
  });

  // ---- Reparo del verificador: reencolar deja el trabajo original «fallido»; contarlo siempre dejaba la fuente «en parte» para siempre ----
  const T1 = "2026-10-13T10:00:00.000Z";
  const T2 = "2026-10-13T10:05:00.000Z";
  const T3 = "2026-10-13T10:10:00.000Z";
  const NOTA_DEL_EXCEL = "Hoja «Inventario»: 3 celdas vacías.";
  const tramo = (id: string, estado: string, indice: number, total: number, creado: string, extra: Fila = {}): Fila => ({ id, company_id: "e1", tipo: "extraer", estado, created_at: creado, payload: { source_id: "s1", chunk_index: indice, total }, ...extra });

  it("tramosSinLeer: un tramo fallido que se releyó DESPUÉS ya no falta; un trabajo bueno de antes, de otro tramo o sin fecha no lo cubre", async () => {
    const { tramosSinLeer } = await import("@/lib/jobs/handlers/extraer");
    expect(tramosSinLeer([], [], 0)).toEqual([]);
    expect(tramosSinLeer([{ tramo: 0, creado: T1 }], [], 1)).toEqual([0]);
    expect(tramosSinLeer([{ tramo: 0, creado: T1 }], [{ tramo: 0, creado: T2 }], 1)).toEqual([]);
    // El que termina ahora mismo es el tramo que había fallado: ya está leído.
    expect(tramosSinLeer([{ tramo: 0, creado: T1 }], [], 0)).toEqual([]);
    // NEGATIVO · un trabajo bueno ANTERIOR al fallo no lo cubre, ni uno de OTRO tramo, ni uno cuya fecha no consta.
    expect(tramosSinLeer([{ tramo: 0, creado: T2 }], [{ tramo: 0, creado: T1 }], 1)).toEqual([0]);
    expect(tramosSinLeer([{ tramo: 0, creado: T1 }], [{ tramo: 1, creado: T2 }], 2)).toEqual([0]);
    expect(tramosSinLeer([{ tramo: 0, creado: null }], [{ tramo: 0, creado: T2 }], 1)).toEqual([0]);
    expect(tramosSinLeer([{ tramo: 0, creado: T1 }], [{ tramo: 0 }], 1)).toEqual([0]);
    // Falló, se reencoló, salió bien y volvió a fallar: el bueno tiene que ser posterior al ÚLTIMO fallo.
    expect(tramosSinLeer([{ tramo: 2, creado: T1 }, { tramo: 2, creado: T3 }, { tramo: 0, creado: T1 }], [{ tramo: 2, creado: T2 }], 1)).toEqual([0, 2]);
    // Un trabajo sin tramo (el que trocea la fuente) no es un tramo caído.
    expect(tramosSinLeer([{ tramo: NaN, creado: T1 }], [], 1)).toEqual([]);
  });

  it("lecturaYaEntera: retira el aviso y devuelve la nota y el nivel que la fuente tenía; lo que no consta no se inventa", async () => {
    const { lecturaYaEntera, lecturaEnParte, notaDetrasDelAviso } = await import("@/lib/jobs/handlers/extraer");
    const soloAviso = lecturaEnParte([0], 2)!.fidelidad_nota;
    const conNota = lecturaEnParte([0], 2, NOTA_DEL_EXCEL)!.fidelidad_nota;
    // Texto, audio y fotos: no tenían nota ni nivel, y así vuelven a quedar aunque alguien pase un nivel.
    expect(lecturaYaEntera(soloAviso, "media")).toEqual({ fidelidad_extraccion: null, fidelidad_nota: null });
    expect(lecturaYaEntera(conNota, "media")).toEqual({ fidelidad_extraccion: "media", fidelidad_nota: NOTA_DEL_EXCEL });
    // El nivel de antes no consta, o lo que llega no es un nivel: queda sin nivel, con su nota.
    expect(lecturaYaEntera(conNota, undefined)).toEqual({ fidelidad_extraccion: null, fidelidad_nota: NOTA_DEL_EXCEL });
    expect(lecturaYaEntera(conNota, "excelente")).toEqual({ fidelidad_extraccion: null, fidelidad_nota: NOTA_DEL_EXCEL });
    // La constancia de una consolidación en parte hablaba de la lectura anterior: no se arrastra.
    const consolidada = `${conNota} Consolidada con la lectura en parte el 2026-10-13: se revisó lo que se leyó; lo que traía la parte que falló no se leyó ni se revisó.`;
    expect(notaDetrasDelAviso(consolidada)).toBe(NOTA_DEL_EXCEL);
    expect(notaDetrasDelAviso(NOTA_DEL_EXCEL)).toBe(NOTA_DEL_EXCEL);
    // Volver a marcarla «en parte» con otros tramos conserva lo que había detrás.
    expect(lecturaEnParte([1], 2, consolidada)!.fidelidad_nota).toBe(`Se leyó en parte: falló el tramo 2 de 2. Lo que traía esa parte no está en la lectura: vuelve a extraer la fuente antes de darla por revisada. ${NOTA_DEL_EXCEL}`);
  });

  it("un tramo que falló y se reencoló con éxito ya no cuenta: la fuente queda «leído» entera y su fidelidad no se toca", async () => {
    base.fuentes = [{ id: "s1", nombre: "ventas-e-inventario.xlsx", tipo: "dato", estado: "leyendo", fidelidad_extraccion: "media", fidelidad_nota: NOTA_DEL_EXCEL }];
    base.jobs = [
      // `reencolarSeguro` deja el original «fallido» como constancia y crea otro, que terminó bien.
      tramo("j-t0", "fallido", 0, 2, T1),
      tramo("j-t0-bis", "hecho", 0, 2, T2, { origen_job_id: "j-t0" }),
      tramo("j-t1", "corriendo", 1, 2, T1),
    ];
    base.extractor.salida = { afirmaciones: [], metricas: [] };
    const r = await extraer({ id: "j-t1", company_id: "e1", payload: { source_id: "s1", chunk_index: 1, total: 2, texto: "fila 2" } });
    // Antes: «Se leyó en parte: falló el tramo 1 de 2… vuelve a extraer la fuente», con fidelidad baja. Era falso.
    expect(base.fuentes[0]).toMatchObject({ estado: "leido", revision: "pendiente", fidelidad_extraccion: "media", fidelidad_nota: NOTA_DEL_EXCEL });
    expect(r).not.toHaveProperty("lectura_en_parte");
    expect(base.progresos.join("\n")).not.toMatch(/Se leyó en parte/);
  });

  it("NEGATIVO · un trabajo bueno de ese tramo ANTERIOR al fallo no lo tapa: la fuente sigue «en parte»", async () => {
    base.fuentes = [{ id: "s1", nombre: "ventas-e-inventario.xlsx", tipo: "dato", estado: "leyendo", fidelidad_extraccion: "media", fidelidad_nota: NOTA_DEL_EXCEL }];
    base.jobs = [tramo("j-t0", "hecho", 0, 2, T1), tramo("j-t0-otra-vez", "fallido", 0, 2, T2), tramo("j-t1", "corriendo", 1, 2, T1)];
    base.extractor.salida = { afirmaciones: [], metricas: [] };
    await extraer({ id: "j-t1", company_id: "e1", payload: { source_id: "s1", chunk_index: 1, total: 2, texto: "fila 2" } });
    expect(base.fuentes[0]).toMatchObject({ estado: "leido", fidelidad_extraccion: "baja" });
    expect(String(base.fuentes[0].fidelidad_nota)).toMatch(/^Se leyó en parte: falló el tramo 1 de 2\./);
  });

  it("la secuencia entera: se marca «en parte», se reencola el tramo caído y, cuando termina bien, la fuente recupera la nota y el nivel que tenía", async () => {
    base.fuentes = [{ id: "s1", nombre: "ventas-e-inventario.xlsx", tipo: "dato", estado: "leyendo", fidelidad_extraccion: "media", fidelidad_nota: NOTA_DEL_EXCEL }];
    base.jobs = [tramo("j-t0", "fallido", 0, 2, T1), tramo("j-t1", "corriendo", 1, 2, T1)];
    base.extractor.salida = { afirmaciones: [], metricas: [] };
    const primero = await extraer({ id: "j-t1", company_id: "e1", payload: { source_id: "s1", chunk_index: 1, total: 2, texto: "fila 2" } });
    // El trabajo que la marca deja escrito el nivel que tenía: es lo que permite devolvérselo.
    expect(primero).toMatchObject({ fidelidad_anterior: "media" });
    expect((primero as { lectura_en_parte?: string }).lectura_en_parte).toMatch(/^Se leyó en parte: falló el tramo 1 de 2\./);
    expect(base.fuentes[0]).toMatchObject({ estado: "leido", fidelidad_extraccion: "baja" });
    expect(String(base.fuentes[0].fidelidad_nota)).toMatch(/revisada\. Hoja «Inventario»: 3 celdas vacías\.$/);

    // Lo que pasa después en producto: el worker deja el trabajo «hecho» con su resultado, el consultor consolida lo
    // leído (queda la constancia en la nota) y reencola el tramo caído. El original sigue «fallido».
    Object.assign(base.jobs[1], { estado: "hecho", resultado: primero });
    base.fuentes[0].fidelidad_nota = `${String(base.fuentes[0].fidelidad_nota)} Consolidada con la lectura en parte el 2026-10-13: se revisó lo que se leyó; lo que traía la parte que falló no se leyó ni se revisó.`;
    base.jobs.push(tramo("j-t0-bis", "corriendo", 0, 2, T3, { origen_job_id: "j-t0" }));
    base.progresos = [];
    const reintento = await extraer({ id: "j-t0-bis", company_id: "e1", payload: { source_id: "s1", chunk_index: 0, total: 2, texto: "fila 1" } });
    expect(reintento).not.toHaveProperty("lectura_en_parte");
    expect(reintento).toMatchObject({ lectura_completada: true });
    expect(base.fuentes[0]).toMatchObject({ estado: "leido", revision: "pendiente", fidelidad_extraccion: "media", fidelidad_nota: NOTA_DEL_EXCEL });
    expect(base.progresos.join("\n")).toMatch(/La lectura quedó entera: se retiró el aviso de que se había leído en parte\./);
    expect(base.jobs.find((j) => j.id === "j-t0")).toMatchObject({ estado: "fallido" }); // la constancia del fallo sigue ahí
  });

  it("si tras el reintento todavía falta otro tramo, sigue «en parte» con los tramos de ahora y sin perder la nota que la fuente tenía", async () => {
    const antes = `Se leyó en parte: fallaron los tramos 1 y 3 de 3. Lo que traía esa parte no está en la lectura: vuelve a extraer la fuente antes de darla por revisada. ${NOTA_DEL_EXCEL}`;
    base.fuentes = [{ id: "s1", nombre: "ventas-e-inventario.xlsx", tipo: "dato", estado: "leido", revision: "pendiente", fidelidad_extraccion: "baja", fidelidad_nota: antes }];
    base.jobs = [
      tramo("j-t0", "fallido", 0, 3, T1),
      tramo("j-t2", "fallido", 2, 3, T1),
      tramo("j-t1", "hecho", 1, 3, T1, { resultado: { nuevas: 0, lectura_en_parte: antes, fidelidad_anterior: "media" } }),
      tramo("j-t0-bis", "corriendo", 0, 3, T3, { origen_job_id: "j-t0" }),
    ];
    base.extractor.salida = { afirmaciones: [], metricas: [] };
    const r = await extraer({ id: "j-t0-bis", company_id: "e1", payload: { source_id: "s1", chunk_index: 0, total: 3, texto: "fila 1" } });
    expect(base.fuentes[0]).toMatchObject({
      estado: "leido", fidelidad_extraccion: "baja",
      fidelidad_nota: `Se leyó en parte: falló el tramo 3 de 3. Lo que traía esa parte no está en la lectura: vuelve a extraer la fuente antes de darla por revisada. ${NOTA_DEL_EXCEL}`,
    });
    expect((r as { lectura_en_parte?: string }).lectura_en_parte).toMatch(/falló el tramo 3 de 3/);
    // El nivel de antes ya lo dejó escrito el trabajo que la marcó primero: este no escribe «baja» como si fuera el original.
    expect(r).not.toHaveProperty("fidelidad_anterior");
    expect(r).not.toHaveProperty("lectura_completada");
  });
});

describe("CIERRE Z1 · SEGUNDA VUELTA · la aproximación tiene que ser de ESTA cifra, no de otro número del texto", () => {
  it("«unos 3 clientes», «como 2 veces al mes», «cerca de 3 cuadras» en la nota de un 80.000: hablan de otro número, y el 80.000 es exacto", () => {
    for (const nota of ["unos 3 clientes", "como 2 veces al mes", "cerca de 3 cuadras", "casi 10 años en el rubro", "unos tres clientes grandes", "aprox. 3 clientes al día", "más o menos 2 veces al mes", "como 40 mil eran antes"]) {
      expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota }), nota).toMatchObject({ clase: "exacta", valor: 80_000 });
    }
    // También en las palabras del dueño: el cuantificador acompaña a los clientes, no a la venta.
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: "vendo 80.000 a unos 3 clientes", nota: null }).clase).toBe("exacta");
    expect(leerDeclaracion("Vendo 80.000 al mes a unos 3 clientes")).toMatchObject({ clase: "exacta", valor: 80_000 });
  });

  it("pegado a la cifra guardada sigue contando: en dígitos, con «mil» o en letras, y aunque el texto traiga además otros números", () => {
    for (const nota of ["unos 80 mil", "como 80.000, a unos 3 clientes", "casi ochenta mil", "como S/ 80,000", "80 mil por ahí", "80.000 aprox., 3 clientes", "más o menos, de memoria", "aproximado"]) {
      expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota }), nota).toMatchObject({ clase: "aproximada", valor: 80_000 });
    }
    // Las cifras en letras se leen enteras, no por su primera palabra.
    expect(declaracionDeMetrica({ valor: 35_000, valor_texto: "unos treinta y cinco mil", nota: null }).clase).toBe("aproximada");
    expect(declaracionDeMetrica({ valor: 2_500, valor_texto: "casi dos mil quinientos", nota: null }).clase).toBe("aproximada");
    expect(declaracionDeMetrica({ valor: 1_500_000, valor_texto: "como un millón y medio", nota: null }).clase).toBe("aproximada");
    expect(declaracionDeMetrica({ valor: 500_000, valor_texto: "alrededor de medio millón", nota: null }).clase).toBe("aproximada");
    // «treinta mil» no es «treinta y cinco mil»: otra cifra en letras tampoco regala tolerancia.
    expect(declaracionDeMetrica({ valor: 35_000, valor_texto: null, nota: "unos treinta mil eran antes" }).clase).toBe("exacta");
    // Una palabra cualquiera no se toma por número («constructor» no es una cifra en letras).
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota: "aproximado, según el constructor" }).clase).toBe("aproximada");
    expect(declaracionDeMetrica({ valor: 80_000, valor_texto: null, nota: "como constructor cobra 80.000" }).clase).toBe("exacta");
  });

  it("la diferencia que se escondía: 80.000 con la nota «unos 3 clientes» frente a 90.000 es CONTRADICCIÓN (12,5 % > 5 %), ya no «Cuadran»", () => {
    for (const nota of ["unos 3 clientes", "como 2 veces al mes", "cerca de 3 cuadras"]) {
      const [par] = emparejarDeclaradoExtraido([
        fila({ clave: "venta_mes", valor: 80_000, nota, estado: "contado", origen: "declarado" }),
        fila({ clave: "venta_mes", valor: 90_000, estado: "extraido", origen: "extraido" }),
      ]);
      expect(par.veredicto, nota).toMatchObject({ tipo: "CONTRADICCION", clase: "exacta", tolerancia_pct: 5 });
    }
    // Con la aproximación en SU cifra, el mismo par sigue dentro del 20 %.
    const [par] = emparejarDeclaradoExtraido([
      fila({ clave: "venta_mes", valor: 80_000, valor_texto: "unos 80 mil", nota: "a unos 3 clientes", estado: "contado", origen: "declarado" }),
      fila({ clave: "venta_mes", valor: 90_000, estado: "extraido", origen: "extraido" }),
    ]);
    expect(par.veredicto).toMatchObject({ tipo: "COINCIDE", clase: "aproximada", tolerancia_pct: 20 });
  });
});

describe("CIERRE Z1 · SEGUNDA VUELTA · una cifra guardada al lado de un número que se quedó sin cifra no se esconde", () => {
  // Lo que deja un «no lo sé» (entrevista o portal) sobre un número que antes trajo el Excel.
  const sinDatoTrasElExcel = fila({ id: "m1", clave: "venta_mes", periodo: "2026-09", valor: null, estado: "sin_dato", origen: "declarado", cifra_desplazada: { lado: "extraido", valor: 86_900, source_id: "s1" } });

  it("«no lo sé» después del Excel: el 86.900 cuenta como extraído pendiente, y la frase dice que falta la cifra declarada", () => {
    expect(emparejarDeclaradoExtraido([sinDatoTrasElExcel])).toEqual([]); // sin dato no hay par
    expect(ladosDisponibles([sinDatoTrasElExcel])).toEqual({ declarados: 0, extraidos: 1 });
    const r = contrasteNumerico([sinDatoTrasElExcel], []);
    expect(r).toMatchObject({ pares: [], lados: { declarados: 0, extraidos: 1 } });
    expect(r.sin_pares).toMatch(/hay 1 número extraído de un documento y ninguno declarado\. Falta la cifra declarada\./);
    expect(cifrasSoloAlLado([sinDatoTrasElExcel])).toEqual([
      { clave: "venta_mes", nombre: "Ventas del mes", periodo: "2026-09", lado: "extraido", texto: expect.stringMatching(/^S\/ 86[\s.,]?900$/), figura: "sin_dato", source_id: "s1" },
    ]);
  });

  it("un documento que no traía el número reemplazó lo declarado, o el consultor descartó la cifra del documento: lo declarado que quedó al lado sigue contando", () => {
    const documentoSinNumero = fila({ clave: "stock_a_costo", valor: null, estado: "sin_dato", origen: "extraido", source_id: "s1", cifra_desplazada: { lado: "declarado", valor: 40_000, valor_texto: "como 40,000", response_id: "r1" } });
    const descartada = fila({ clave: "caja_hoy", valor: null, estado: "descartado", origen: "extraido", source_id: "s1", cifra_desplazada: { lado: "declarado", valor: null, valor_texto: "entre 5 y 8 mil" } });
    expect(ladosDisponibles([documentoSinNumero, descartada])).toEqual({ declarados: 2, extraidos: 0 });
    const sueltas = cifrasSoloAlLado([documentoSinNumero, descartada]);
    expect(sueltas.map((c) => [c.clave, c.lado, c.figura])).toEqual([["caja_hoy", "declarado", "descartado"], ["stock_a_costo", "declarado", "sin_dato"]]);
    expect(sueltas[0].texto).toMatch(/^entre S\/ 5[\s.,]?000 y S\/ 8[\s.,]?000$/);
    // De «Stock a costo» no consta la unidad en el catálogo: el número a secas, nunca soles inventados.
    expect(sueltas[1].texto).toMatch(/^40[\s.,]?000$/);
    // Y con un documento de otro periodo deja constancia de que las dos cifras existen y no se compararon.
    const [par] = emparejarDeclaradoExtraido([sinDatoTrasElExcel, fila({ clave: "venta_mes", valor: 80_000, estado: "contado", origen: "declarado" })]);
    expect(par.veredicto.tipo).toBe("NO_COMPARABLE");
    expect([par.periodo, par.periodo_extraido, par.extraido_al_lado]).toEqual(["actual", "2026-09", true]);
  });

  it("NEGATIVO · si a la fila la resolvió una persona, o tiene cifra propia, lo guardado al lado no se cuenta aparte", () => {
    const alLado = { lado: "declarado" as const, valor: 9_000 };
    const resueltas = [
      fila({ clave: "caja_hoy", valor: 15_000, estado: "verificado", origen: "conciliado", cifra_desplazada: alLado }),
      // Una lectura aceptada «sin cifra»: el consultor ya la decidió.
      fila({ clave: "deuda_propia", valor: null, estado: "sin_dato", origen: "conciliado", cifra_desplazada: alLado }),
      fila({ clave: "ganancia_mes", valor: null, estado: "sin_dato", origen: "calculado", cifra_desplazada: alLado }),
      // Mal formada o sin valor: no inventa una cifra.
      fila({ clave: "venta_mes", valor: null, estado: "sin_dato", origen: "declarado", cifra_desplazada: { lado: "extraido", valor: null } }),
      fila({ clave: "gasto_fijo_mes", valor: null, estado: "sin_dato", origen: "declarado", cifra_desplazada: { lado: "otro", valor: 5 } as unknown as MetricaGuardada["cifra_desplazada"] }),
    ];
    expect(ladosDisponibles(resueltas)).toEqual({ declarados: 0, extraidos: 0 });
    expect(cifrasSoloAlLado(resueltas)).toEqual([]);
    // Con cifra propia, las dos van al par de siempre: no es una cifra «solo al lado».
    const conPar = fila({ clave: "stock_a_costo", valor: 79_782, estado: "extraido", origen: "extraido", cifra_desplazada: { lado: "declarado", valor: 40_000 } });
    expect(cifrasSoloAlLado([conPar])).toEqual([]);
    expect(ladosDisponibles([conPar])).toEqual({ declarados: 1, extraidos: 1 });
  });

  it("la pantalla la nombra, haya pares o no: antes no salía en ninguna parte y el estado vacío decía que no había nada extraído por conciliar", async () => {
    sembrarEntrevistaYFuente();
    base.metricas = [{ ...sinDatoTrasElExcel, company_id: "e1" }];
    let html = await pintar();
    expect(html).toMatch(/No hay pares comparables todavía: hay 1 número extraído de un documento y ninguno declarado\. Falta la cifra declarada\./);
    expect(html).toMatch(/Una cifra pendiente que no se ve en otra pantalla/);
    expect(html).toMatch(/Ventas del mes · Setiembre 2026: S\/ 86[\s.,]?900, extraída de ventas-e-inventario\.xlsx \(dato\)\. Hoy ese número figura «sin dato», y esta cifra ya no aparece en la revisión de ese documento\./);
    expect(html).not.toMatch(/Cuadran|cuadra dentro/);
    // El trabajo de contraste dice lo mismo en su resultado.
    const r = await handleContrastar(job);
    expect(r.contraste_numerico).toMatchObject({ corrido: true, lados: { declarados: 0, extraidos: 1 } });
    // Con pares en la misma pantalla, también.
    const stock = { id: "m9", company_id: "e1", clave: "stock_a_costo", periodo: "actual", valor: "79782", estado: "extraido", origen: "extraido", source_id: "s1", cifra_desplazada: { lado: "declarado", valor: 40000, valor_texto: "como 40,000", response_id: "r1" } };
    base.metricas.push(stock);
    html = await pintar();
    expect(html).toMatch(/No cuadran/);
    expect(html).toMatch(/Una cifra pendiente que no se ve en otra pantalla/);
    // Y si no hay ninguna, el bloque no ocupa lugar.
    base.metricas = [stock];
    expect(await pintar()).not.toMatch(/no se ve en otra pantalla/);
  });
});

describe("CIERRE Z1 · SEGUNDA VUELTA · ESCRITORES REALES · la cifra del documento que una declaración posterior deja al lado sale de la revisión de su fuente, y la tarjeta lo dice", () => {
  beforeEach(sembrarEntrevistaYFuente);

  it("extraer → declarar en el portal: el par marca `extraido_al_lado` y la tarjeta avisa de que el documento puede darse por revisado sin decidirla", async () => {
    const { filas } = await extraerYDeclararEnElPortalDeVerdad();
    // Por qué hace falta el aviso: ninguna fila queda atribuida al documento, que es por donde lee su revisión.
    expect(base.metricas.filter((m) => m.source_id === "s1")).toEqual([]);
    const [par] = emparejarDeclaradoExtraido(filas as MetricaGuardada[]);
    expect(par.extraido_al_lado).toBe(true);
    expect(par.extraido.source_id).toBe("s1");
    const html = await pintar();
    expect(html).toMatch(/La cifra del documento quedó guardada al lado de la declarada cuando el número se volvió a declarar, y ya no figura en la revisión de ventas-e-inventario\.xlsx \(dato\): ese documento puede darse por revisado sin que nadie la haya decidido\./);
    expect(html).toMatch(/El sistema todavía no tiene una pantalla donde conciliarla/);
    expect(html).not.toMatch(/verificad[ao]/i);
  });

  it("declarar → extraer: la cifra del documento es el número de la fila y sigue en la revisión de su fuente; no hay aviso", async () => {
    const filas = await declararYExtraerDeVerdad();
    expect(filas[0]).toMatchObject({ source_id: "s1", origen: "extraido" });
    const [par] = emparejarDeclaradoExtraido(filas as MetricaGuardada[]);
    expect(par.extraido_al_lado).toBe(false);
    expect(await pintar()).not.toMatch(/ya no figura en la revisión/);
  });
});

describe("CIERRE Z1 · SEGUNDA VUELTA · ESCRITORES REALES · una lectura aceptada «sin cifra» no es un número verificado", () => {
  // Lo que deja la ruta de consolidar cuando el consultor acepta una lectura que no traía el número.
  const aceptadaSinCifra = { id: "m1", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: null, estado: "sin_dato", origen: "conciliado", source_id: "s1", conciliado_por: "u-consultor", cifra_desplazada: null };

  beforeEach(sembrarEntrevistaYFuente);

  it("el portal: el dueño escribe 52.000 y se guarda como contado; ya no se le responde «ya está verificado con un documento»", async () => {
    base.metricas = [{ ...aceptadaSinCifra }];
    const r = await escribirEnElPortal({ meses: [{ periodo: "2026-09", venta: 52_000 }] });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toEqual({ guardados: 1, no_guardados: [] });
    expect(base.metricas).toHaveLength(1);
    // Contado, declarado y sin atribuirse al documento: una cifra del dueño no figura como conciliada.
    expect(base.metricas[0]).toMatchObject({ valor: 52_000, estado: "contado", origen: "declarado", source_id: null });
    expect(ladoDeMetrica(base.metricas[0] as MetricaGuardada)).toBe("declarado");
  });

  it("el portal: si escribe 0, el 0 se guarda y se cuenta: un valor ausente no es igual a cero", async () => {
    base.metricas = [{ ...aceptadaSinCifra }];
    const r = await escribirEnElPortal({ meses: [{ periodo: "2026-09", venta: 0 }] });
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toEqual({ guardados: 1, no_guardados: [] });
    expect(base.metricas[0]).toMatchObject({ valor: 0, estado: "contado", origen: "declarado" });
  });

  it("el portal: un «no lo sé» sobre esa fila dice lo mismo que ya dice, y no borra la constancia de la revisión", async () => {
    base.metricas = [{ ...aceptadaSinCifra, clave: "caja_hoy", periodo: "actual" }];
    const r = await escribirEnElPortal({ sin_dato: ["caja_hoy"] });
    expect(r.estado).toBe(200);
    expect(base.metricas).toEqual([{ ...aceptadaSinCifra, clave: "caja_hoy", periodo: "actual" }]);
  });

  it("NEGATIVO · el portal: lo verificado CON cifra sigue sin reemplazarse, y si el dueño escribe 0 se le dice (no se da por igual)", async () => {
    base.metricas = [{ id: "m1", company_id: "e1", clave: "venta_mes", periodo: "2026-09", valor: "86900", estado: "verificado", origen: "conciliado" }];
    const r = await escribirEnElPortal({ meses: [{ periodo: "2026-09", venta: 0 }] });
    expect(r.estado).toBe(409);
    expect(r.cuerpo.guardados).toBe(0);
    expect(r.cuerpo.no_guardados).toMatchObject([{ clave: "venta_mes", periodo: "2026-09", motivo: "verificado" }]);
    expect(base.metricas[0]).toMatchObject({ valor: "86900", estado: "verificado", origen: "conciliado" });
  });

  it("`guardarMetricas`: la cifra que declara una persona entra; otro «sin dato» no toca la fila; y lo conciliado CON cifra sigue intocable", async () => {
    const { guardarMetricas, puedePisar } = await import("@/lib/jobs/handlers/extraer");
    const sinCifra = { id: "m1", estado: "sin_dato", origen: "conciliado" };
    expect(puedePisar(sinCifra, { estado: "contado", origen: "declarado" })).toBe(true);
    expect(puedePisar(sinCifra, { estado: "extraido", origen: "extraido" })).toBe(true);
    expect(puedePisar(sinCifra, { estado: "sin_dato", origen: "extraido" })).toBe(false);
    expect(puedePisar({ id: "m1", estado: "verificado", origen: "conciliado" }, { estado: "contado", origen: "declarado" })).toBe(false);
    expect(puedePisar({ id: "m1", estado: "contado", origen: "conciliado" }, { estado: "extraido", origen: "extraido" })).toBe(false);

    base.metricas = [{ ...aceptadaSinCifra }];
    await guardarMetricas(supabaseAdmin(), "e1", [{ clave: "venta_mes", periodo: "2026-09", valor: null, estado: "sin_dato" }], { source_id: "s2", origen: "extraido" });
    expect(base.metricas).toEqual([{ ...aceptadaSinCifra }]);
    await guardarMetricas(supabaseAdmin(), "e1", [{ clave: "venta_mes", periodo: "2026-09", valor: 52_000, valor_texto: "52 mil", estado: "contado" }], { response_id: "r1", origen: "declarado" });
    expect(base.metricas).toHaveLength(1);
    expect(base.metricas[0]).toMatchObject({ valor: 52_000, estado: "contado", origen: "declarado", response_id: "r1", source_id: null });
  });
});

describe("los pilotos leen las mismas funciones que el producto", () => {
  it("_reglas.ts reexporta desde src: no hay dos copias de la regla", () => {
    expect(reglasPilotos.contradiccionesNumericas).toBe(contradiccionesNumericas);
    expect(reglasPilotos.leerDeclaracion).toBe(leerDeclaracion);
    expect(reglasPilotos.TOLERANCIA_PCT).toBe(TOLERANCIA_PCT);
    expect(leer("tests/pilotos/_reglas.ts")).not.toMatch(/export function (contradiccionesNumericas|leerDeclaracion|sumaSiCompleta|filasDe)\b/);
  });
});
