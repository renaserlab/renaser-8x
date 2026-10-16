/**
 * CORREGIR UN DATO QUE NO CUADRA, EN UN PASO (16-10-2026) · LO PURO Y LA RUTA, CON LA BASE EN MEMORIA.
 *
 * Lo que se fija:
 *  - el pedido (EsquemaCorreccion): solo reglas que se corrigen con un número, solo los nueve y los reconocidos, una
 *    cifra imposible no se elige, «Ninguna, es…» entiende cómo habla el dueño («unos 30 mil» → 30000);
 *  - la ruta /api/portal/numeros con `correccion`: sin sección abierta, 403 y nada escrito; «Esta es la correcta»
 *    deja el número «contado» con esa cifra y una fila de audit_log «correccion_dato» con antes, después y huella;
 *    «No lo sé» deja `sin_dato`; lo verificado no se pisa y se dice; si el rastro falla, el número queda y se avisa;
 *  - con la huella de después, el diagnóstico (incongruenciasDe, de B) da la diferencia por resuelta o ya no la ve;
 *  - sin `correccion`, la ruta hace lo de siempre.
 *
 * Cómo se prueba: `supabaseAdmin()` es la base en memoria de tests/fixtures/base-falsa.ts y la sesión la pone la
 * prueba. La empresa es FICTICIA («Jeans del Valle (ficticia)»). Nada de esto abrió un navegador.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { crearBaseFalsa, type Fila, type BaseFalsa } from "./fixtures/base-falsa";

const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/auth", async (original) => ({ ...(await original<typeof import("@/lib/auth")>()), perfilApi: vi.fn(), puedeAcceder: vi.fn(async () => true) }));
vi.mock("@/lib/auditoria", async (original) => ({ ...(await original<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));

import { perfilApi, type Perfil } from "@/lib/auth";
import { registrarError } from "@/lib/errores";
import { TEXTO_SECCION_CERRADA } from "@/lib/secciones";
import { FICHA_VACIA } from "@/lib/rentabilidad";
import { porDefecto } from "@/lib/formato";
import { huellaDe, incongruenciasDe, type Correccion, type HechosIncongruencia, type Incongruencia } from "@/lib/incongruencias";
import type { MetricaGuardada } from "@/lib/rules/contradiccion-numerica";
import {
  EsquemaCorreccion, filaDeCorreccion, detalleDeRastro, correccionDe, leerCifraDicha, valorElegido, seCorrigeConUnNumero,
  AVISO_SIN_RASTRO, AVISO_CIFRA_NO_ENTENDIDA, REGLAS_POR_NUMERO, type CorreccionPedida,
} from "@/lib/correccion-dato";

vi.setConfig({ testTimeout: 30_000 });

const EMP = "0000000a-0000-4000-8000-00000000000a"; // Jeans del Valle (ficticia)
const DUENA: Perfil = { id: "00000000-0000-4000-8000-0000000000a1", email: "duena@prueba.local", nombre: "Dueña", rol: "cliente" };
const PARTICIPANTE: Perfil = { id: "00000000-0000-4000-8000-0000000000a2", email: "equipo@prueba.local", nombre: "Equipo", rol: "cliente" };
const CONSULTORA: Perfil = { id: "00000000-0000-4000-8000-0000000000c1", email: "consultora@prueba.local", nombre: "Consultora", rol: "consultor" };
const RUTA = "@/app/api/portal/numeros/route";
const MES = "2026-09";

type Respuesta = { status: number; body: Fila };
type Manejador = (req: Request, ctx: unknown) => Promise<Response>;

async function postear(cuerpo: unknown): Promise<Respuesta> {
  const m = (await import(/* @vite-ignore */ RUTA)) as Record<string, Manejador>;
  const req = new Request("http://8x.test/api/portal/numeros", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  const res = await m.POST!(req, {});
  return { status: res.status, body: (await res.json()) as Fila };
}

const como = (p: Perfil) => vi.mocked(perfilApi).mockResolvedValue(p);

const metrica = (n: number, clave: string, valor: number | null, est = "contado", periodo = MES, extra: Fila = {}): Fila => ({
  id: `m${n}`, company_id: EMP, clave, periodo, valor, estado: est, origen: "declarado", valor_texto: null, nota: null, response_id: null, source_id: null,
  updated_at: "2026-10-10T12:00:00.000Z", ...extra,
});

/**
 * Lo que le quedó en setiembre (3.000) no cuadra con la cuenta: 41.800 − 20.000 − 8.000 = 13.800. Regla 3.
 * Con `abiertas`: las secciones con solicitud activa.
 */
function base(abiertas: string[] = ["corroborar_diagnostico"], extra: Record<string, Fila[]> = {}): BaseFalsa {
  const b = crearBaseFalsa({
    companies: [{ id: EMP, nombre: "Jeans del Valle (ficticia)", zona_horaria: "America/Lima" }],
    memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }, { user_id: PARTICIPANTE.id, company_id: EMP, nivel: "participante" }],
    company_metricas: [
      metrica(1, "venta_mes", 41800),
      metrica(2, "costo_variable_mes", 20000),
      metrica(3, "gasto_fijo_mes", 8000),
      metrica(4, "ganancia_mes", 3000),
    ],
    solicitudes_cliente: abiertas.map((seccion) => ({ id: `s-${seccion}`, company_id: EMP, seccion, nota: null, estado: "activa", activada_at: "2026-10-15T13:00:00.000Z", completada_at: null })),
    ...extra,
  });
  estado.base = b;
  return b;
}

/** Los hechos que mira el diagnóstico, con lo que hay en la base ahora y las correcciones del rastro. */
function hechos(b: BaseFalsa): HechosIncongruencia {
  const correcciones: Correccion[] = (b.tablas.audit_log ?? [])
    .filter((f) => f.entidad === "correccion_dato")
    .map((f) => {
      const d = f.detalle as Record<string, unknown>;
      return {
        id: String(f.id), incongruencia: String(f.entidad_id), huella: String(d.huella), eleccion: d.eleccion as Correccion["eleccion"],
        antes: d.antes, despues: d.despues as Correccion["despues"], motivo: (d.motivo as string | null) ?? null, at: String(f.created_at), quien: "Dueña",
      };
    });
  return {
    metricas: (b.tablas.company_metricas ?? []) as unknown as MetricaGuardada[],
    lineas: [], costos: [], ficha: { ...FICHA_VACIA }, config: porDefecto,
    claimsContradichas: [], preguntaDeRespuesta: new Map(), declarantes: new Map(), correcciones, mesPasado: MES,
  };
}

const laDeLaCuenta = (b: BaseFalsa): Incongruencia => {
  const i = incongruenciasDe(hechos(b)).find((x) => x.regla === "ganancia_vs_cuenta");
  if (!i) throw new Error("la base de la prueba debería tener la diferencia de la cuenta");
  return i;
};
const ganancia = (b: BaseFalsa) => b.tablas.company_metricas!.find((f) => f.clave === "ganancia_mes" && f.periodo === MES)!;
const rastros = (b: BaseFalsa) => (b.tablas.audit_log ?? []).filter((f) => f.entidad === "correccion_dato");

beforeAll(async () => {
  await import(/* @vite-ignore */ RUTA);
}, 180_000);

beforeEach(() => {
  vi.mocked(perfilApi).mockReset();
  vi.mocked(registrarError).mockClear();
});

// ─────────────────────────── Lo puro ───────────────────────────

describe("«Ninguna, es…»: el número como lo dice el dueño", () => {
  it.each([
    ["unos 30 mil", 30000],
    ["Unos 30 mil soles", 30000],
    ["más o menos 12.500", 12500],
    ["como S/ 8,000", 8000],
    ["casi 1,5 millones", 1_500_000],
    ["aprox. 4500", 4500],
    ["~ 2 mil", 2000],
    ["28.000", 28000],
  ])("«%s» → %d", (texto, n) => {
    expect(leerCifraDicha(texto)).toBe(n);
  });

  it("nada escrito no es cero, y lo que no es un número se dice", () => {
    expect(leerCifraDicha("")).toBeNull();
    expect(leerCifraDicha("   ")).toBeNull();
    expect(leerCifraDicha("muchísimo")).toBe("invalido");
    expect(leerCifraDicha("unos")).toBe("invalido");
  });

  it("un negativo solo donde puede serlo (lo que te quedó: una pérdida)", () => {
    expect(leerCifraDicha("-2 mil")).toBe("invalido");
    expect(leerCifraDicha("-2 mil", { negativo: true })).toBe(-2000);
  });
});

describe("EsquemaCorreccion: el pedido, validado", () => {
  const pedido = (extra: Partial<CorreccionPedida> = {}): CorreccionPedida => ({
    id: `ganancia_vs_cuenta:ganancia_mes:${MES}`, regla: "ganancia_vs_cuenta", clave: "ganancia_mes", periodo: MES,
    corrige: { clave: "ganancia_mes", periodo: MES }, eleccion: "derecha", antes: { izquierda: 3000, derecha: 13800 }, ...extra,
  });

  it("acepta lo que arma la tarjeta y lo convierte en la fila de siempre", () => {
    const c = EsquemaCorreccion.parse(pedido());
    expect(filaDeCorreccion(c)).toEqual({ clave: "ganancia_mes", periodo: MES, valor: 13800, estado: "contado" });
    expect(filaDeCorreccion({ ...c, eleccion: "izquierda" })).toEqual({ clave: "ganancia_mes", periodo: MES, valor: 3000, estado: "contado" });
    expect(filaDeCorreccion({ ...c, eleccion: "no_lo_se" })).toEqual({ clave: "ganancia_mes", periodo: MES, valor: null, estado: "sin_dato" });
    expect(valorElegido({ ...c, eleccion: "otra", texto: "unos 30 mil" })).toBe(30000);
  });

  it("solo reglas que se corrigen escribiendo un número; las de una sección o de «Confirmar» van a su pantalla", () => {
    expect([...REGLAS_POR_NUMERO]).not.toContain("de_cada_10");
    expect([...REGLAS_POR_NUMERO]).not.toContain("respuestas_contradichas");
    expect(EsquemaCorreccion.safeParse({ ...pedido(), regla: "de_cada_10", id: "de_cada_10:-:-" }).success).toBe(false);
  });

  it("solo los nueve números y los reconocidos, en un periodo que existe", () => {
    expect(EsquemaCorreccion.safeParse(pedido({ corrige: { clave: "merma_semana", periodo: MES } })).success).toBe(false);
    expect(EsquemaCorreccion.safeParse(pedido({ corrige: { clave: "ganancia_mes", periodo: "2026-13" } })).success).toBe(false);
    expect(EsquemaCorreccion.safeParse(pedido({ corrige: { clave: "ganancia_mes", periodo: "actual" } })).success).toBe(true);
  });

  it("el id es de esa regla; un lado sin cifra no se elige; una cifra imposible tampoco", () => {
    expect(EsquemaCorreccion.safeParse(pedido({ id: `imposible:ganancia_mes:${MES}` })).success).toBe(false);
    expect(EsquemaCorreccion.safeParse(pedido({ antes: { izquierda: 3000, derecha: null } })).success).toBe(false);
    expect(EsquemaCorreccion.safeParse(pedido({ antes: { izquierda: 3000 } })).success).toBe(false);
    const imposible = { ...pedido(), id: `imposible:ganancia_mes:${MES}`, regla: "imposible" as const, antes: { izquierda: 50000 } };
    expect(EsquemaCorreccion.safeParse({ ...imposible, eleccion: "izquierda" }).success).toBe(false);
    expect(EsquemaCorreccion.safeParse({ ...imposible, eleccion: "otra", texto: "unos 3 mil" }).success).toBe(true);
    expect(EsquemaCorreccion.safeParse({ ...imposible, eleccion: "no_lo_se" }).success).toBe(true);
  });

  it("«Ninguna, es…» sin cifra o con una que no se entiende: la frase, sin una cifra de muestra", () => {
    const vacia = EsquemaCorreccion.safeParse(pedido({ eleccion: "otra" }));
    expect(vacia.success).toBe(false);
    const rara = EsquemaCorreccion.safeParse(pedido({ eleccion: "otra", texto: "muchísimo" }));
    expect(rara.success).toBe(false);
    expect(rara.error!.issues[0]!.message).toBe(AVISO_CIFRA_NO_ENTENDIDA);
    expect(AVISO_CIFRA_NO_ENTENDIDA).not.toMatch(/\d/);
    // Un negativo, solo en lo que te quedó.
    expect(EsquemaCorreccion.safeParse(pedido({ eleccion: "otra", texto: "-2 mil" })).success).toBe(true);
    expect(EsquemaCorreccion.safeParse(pedido({ corrige: { clave: "caja_hoy", periodo: "actual" }, eleccion: "otra", texto: "-2 mil" })).success).toBe(false);
  });

  it("el rastro: antes, después y la huella con los valores de después (la derecha no cambia)", () => {
    const c = EsquemaCorreccion.parse(pedido({ eleccion: "otra", texto: "unos 30 mil", motivo: "Me olvidé de la campaña" }));
    expect(detalleDeRastro(c, 30000)).toEqual({
      regla: "ganancia_vs_cuenta", clave: "ganancia_mes", periodo: MES,
      numero: { clave: "ganancia_mes", periodo: MES, nombre: "Lo que te quedó libre" },
      eleccion: "otra", antes: { izquierda: 3000, derecha: 13800 }, despues: 30000, texto: "unos 30 mil", motivo: "Me olvidé de la campaña",
      huella: huellaDe("ganancia_vs_cuenta", "ganancia_mes", MES, 30000, 13800),
    });
    expect(detalleDeRastro({ ...c, eleccion: "no_lo_se", texto: undefined }, null)).toMatchObject({ despues: "no_lo_se", texto: null });
    // Un solo lado (eco, imposible): la huella lo distingue de un lado sin cifra.
    const solo = { ...c, antes: { izquierda: 50000 } };
    expect(detalleDeRastro(solo, 5000).huella).toBe(huellaDe("ganancia_vs_cuenta", "ganancia_mes", MES, 5000, undefined));
    expect(detalleDeRastro(solo, 5000).huella).not.toBe(huellaDe("ganancia_vs_cuenta", "ganancia_mes", MES, 5000, null));
  });

  it("correccionDe arma el pedido desde la diferencia que el dueño tiene delante", () => {
    const b = base();
    const i = laDeLaCuenta(b);
    expect(seCorrigeConUnNumero(i)).toBe(true);
    const c = correccionDe(i, "derecha", { motivo: "  " })!;
    expect(c).toEqual({
      id: i.id, regla: "ganancia_vs_cuenta", clave: "ganancia_mes", periodo: MES, corrige: { clave: "ganancia_mes", periodo: MES },
      eleccion: "derecha", antes: { izquierda: 3000, derecha: 13800 },
    });
    expect(EsquemaCorreccion.safeParse(c).success).toBe(true);
    // Lo que se corrige en una sección o en «Confirmar» no se arma aquí.
    expect(correccionDe({ ...i, corrige: { via: "seccion", seccion: "productos", href: "/portal/producto" } }, "otra")).toBeNull();
  });
});

// ─────────────────────────── La ruta ───────────────────────────

describe("/api/portal/numeros con `correccion`", () => {
  it("sin «Confirmar lo que encontramos» ni «Los números que faltan» abiertas: 403 con su frase, y nada escrito", async () => {
    const b = base([]);
    como(DUENA);
    const r = await postear({ correccion: correccionDe(laDeLaCuenta(b), "derecha") });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe(TEXTO_SECCION_CERRADA);
    expect(ganancia(b).valor).toBe(3000);
    expect(rastros(b)).toHaveLength(0);
    expect(b.pedidos.some((p) => p.tabla === "company_metricas" && p.op !== "select")).toBe(false);
  });

  it("una participante (no dueña ni líder) tampoco corrige, aunque la sección esté abierta", async () => {
    const b = base();
    como(PARTICIPANTE);
    const r = await postear({ correccion: correccionDe(laDeLaCuenta(b), "derecha") });
    expect(r.status).toBe(403);
    expect(ganancia(b).valor).toBe(3000);
    expect(rastros(b)).toHaveLength(0);
  });

  it("la consultora (aunque mire «como el empresario») no corrige por el dueño: la ruta exige cuenta de cliente", async () => {
    const b = base();
    como(CONSULTORA);
    const r = await postear({ correccion: correccionDe(laDeLaCuenta(b), "derecha") });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(ganancia(b).valor).toBe(3000);
    expect(rastros(b)).toHaveLength(0);
  });

  it("«Esta es la correcta» (derecha): el número queda contado con esa cifra, y el rastro lleva antes, después y huella", async () => {
    const b = base();
    const i = laDeLaCuenta(b);
    como(DUENA);
    const r = await postear({ correccion: correccionDe(i, "derecha") });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ guardados: 1, no_guardados: [] });
    expect(r.body.aviso).toBeUndefined();
    expect(ganancia(b)).toMatchObject({ valor: 13800, estado: "contado" });
    const [fila] = rastros(b);
    expect(fila).toMatchObject({ company_id: EMP, actor_id: DUENA.id, actor_rol: "cliente", accion: "editar", entidad: "correccion_dato", entidad_id: i.id, ruta: "/api/portal/numeros" });
    expect(fila!.detalle).toMatchObject({
      regla: "ganancia_vs_cuenta", eleccion: "derecha", antes: { izquierda: 3000, derecha: 13800 }, despues: 13800,
      huella: huellaDe("ganancia_vs_cuenta", "ganancia_mes", MES, 13800, 13800),
    });
    // Con el número corregido, la cuenta cuadra: el diagnóstico ya no ve esa diferencia.
    expect(incongruenciasDe(hechos(b)).some((x) => x.regla === "ganancia_vs_cuenta")).toBe(false);
  });

  it("«Esta es la correcta» (la suya): el número no cambia, la diferencia queda vista (resuelta) con la misma huella", async () => {
    const b = base(["datos_faltantes"]);
    const i = laDeLaCuenta(b);
    como(DUENA);
    const r = await postear({ correccion: correccionDe(i, "izquierda", { motivo: "La cuenta no incluye el préstamo" }) });
    expect(r.status).toBe(200);
    expect(ganancia(b)).toMatchObject({ valor: 3000, estado: "contado" });
    expect(rastros(b)[0]!.detalle).toMatchObject({ despues: 3000, motivo: "La cuenta no incluye el préstamo", huella: i.huella });
    const otraVez = laDeLaCuenta(b);
    expect(otraVez.resuelta).toMatchObject({ eleccion: "izquierda", quien: "Dueña" });
    expect(otraVez.resuelta!.linea).toMatch(/Dueña confirmó «Lo que te quedó libre»/);
  });

  it("«Ninguna, es unos 30 mil»: se guarda 30000 contado, con sus palabras en el rastro", async () => {
    const b = base();
    como(DUENA);
    const r = await postear({ correccion: correccionDe(laDeLaCuenta(b), "otra", { texto: "unos 30 mil" }) });
    expect(r.status).toBe(200);
    expect(ganancia(b)).toMatchObject({ valor: 30000, estado: "contado" });
    expect(rastros(b)[0]!.detalle).toMatchObject({ eleccion: "otra", despues: 30000, texto: "unos 30 mil" });
  });

  it("lo que no se entiende como número: 400 con la frase, y nada escrito", async () => {
    const b = base();
    como(DUENA);
    const pedido = { ...correccionDe(laDeLaCuenta(b), "otra", { texto: "x" })!, texto: "muchísimo" };
    const r = await postear({ correccion: pedido });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe(AVISO_CIFRA_NO_ENTENDIDA);
    expect(ganancia(b).valor).toBe(3000);
    expect(rastros(b)).toHaveLength(0);
  });

  it("«No lo sé»: el número queda sin cifra (sin_dato), nunca en cero; lo de antes queda en el rastro", async () => {
    const b = base();
    const i = laDeLaCuenta(b);
    como(DUENA);
    const r = await postear({ correccion: correccionDe(i, "no_lo_se") });
    expect(r.status).toBe(200);
    expect(ganancia(b)).toMatchObject({ valor: null, estado: "sin_dato" });
    expect(rastros(b)[0]!.detalle).toMatchObject({ eleccion: "no_lo_se", despues: "no_lo_se", antes: { izquierda: 3000, derecha: 13800 } });
    // Sin la cifra no hay par: la diferencia desaparece del diagnóstico (no se compara lo que no se sabe).
    expect(incongruenciasDe(hechos(b)).some((x) => x.regla === "ganancia_vs_cuenta")).toBe(false);
  });

  it("un número verificado no se pisa: 409, se dice cuál, y no queda rastro de una corrección que no ocurrió", async () => {
    const b = base(["corroborar_diagnostico"], {});
    ganancia(b).estado = "verificado";
    ganancia(b).origen = "conciliado";
    // La diferencia se arma a mano: con la ganancia verificada el diagnóstico la sigue viendo, pero la cifra no cambia aquí.
    const pedido: CorreccionPedida = {
      id: `ganancia_vs_cuenta:ganancia_mes:${MES}`, regla: "ganancia_vs_cuenta", clave: "ganancia_mes", periodo: MES,
      corrige: { clave: "ganancia_mes", periodo: MES }, eleccion: "derecha", antes: { izquierda: 3000, derecha: 13800 },
    };
    como(DUENA);
    const r = await postear({ correccion: pedido });
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toMatch(/«Lo que te quedó libre» \(Setiembre 2026\) ya está verificado con un documento y no se cambió/);
    expect(ganancia(b)).toMatchObject({ valor: 3000, estado: "verificado" });
    expect(rastros(b)).toHaveLength(0);
  });

  it("si el rastro no se pudo anotar, el número queda guardado y la respuesta lo dice", async () => {
    const b = base();
    const i = laDeLaCuenta(b);
    b.fallos.audit_log = { code: "57014", message: "canceling statement due to statement timeout" };
    como(DUENA);
    const r = await postear({ correccion: correccionDe(i, "derecha") });
    expect(r.status).toBe(200);
    expect(r.body.aviso).toBe(AVISO_SIN_RASTRO);
    expect(ganancia(b)).toMatchObject({ valor: 13800, estado: "contado" });
    expect(registrarError).toHaveBeenCalledWith(expect.objectContaining({ ruta: "/api/portal/numeros", companyId: EMP }));
  });

  it("con una corrección no se tocan las temporadas ni otros números que vinieran en el cuerpo", async () => {
    const b = base();
    como(DUENA);
    const r = await postear({ correccion: correccionDe(laDeLaCuenta(b), "derecha"), meses: [{ periodo: MES, venta: 99999 }], temporadas: { altas: ["12"], bajas: [] } });
    expect(r.status).toBe(200);
    expect(b.tablas.company_metricas!.find((f) => f.clave === "venta_mes")!.valor).toBe(41800);
    expect(b.pedidos.some((p) => p.tabla === "companies" && p.op === "update")).toBe(false);
  });
});

describe("/api/portal/numeros sin `correccion`: lo de siempre", () => {
  it("guarda los números del formulario sin pedir sección abierta y sin rastro de corrección", async () => {
    const b = base([]);
    como(DUENA);
    const r = await postear({ meses: [{ periodo: "2026-08", venta: 39900 }], vitales: { caja_hoy: 3200 } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ guardados: 2, no_guardados: [] });
    expect(b.tablas.company_metricas!.find((f) => f.clave === "venta_mes" && f.periodo === "2026-08")).toMatchObject({ valor: 39900, estado: "contado" });
    expect(b.tablas.company_metricas!.find((f) => f.clave === "caja_hoy")).toMatchObject({ valor: 3200, estado: "contado", periodo: "actual" });
    expect(rastros(b)).toHaveLength(0);
  });
});
