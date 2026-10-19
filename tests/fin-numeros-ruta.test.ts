/**
 * «TUS NÚMEROS» NO ESCRIBE LO QUE SALE DE LA CAJA · LA RUTA, CON LA BASE EN MEMORIA (Finanzas, 19-10-2026).
 *
 * /api/portal/numeros recibe del formulario (o de una corrección) un número de un mes. Si ese (número, mes) ya tiene una
 * fila con origen 'caja' (la escribió Finanzas con los movimientos), no se toca y se responde 409 con «sale de tu caja:
 * corrígelo en Finanzas». Lo demás del mismo envío se guarda. La base tampoco lo dejaría pisar (fin_la_caja_manda, en
 * tests/sql/finanzas.test.ts), pero en silencio: la ruta se lo dice al dueño.
 *
 * Cómo se prueba: `supabaseAdmin()` es la base en memoria de tests/fixtures/base-falsa.ts y la sesión la pone la
 * prueba (igual que tests/correccion-dato.test.ts). La empresa es FICTICIA. Nada de esto abrió un navegador.
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

vi.setConfig({ testTimeout: 30_000 });

const EMP = "0000000a-0000-4000-8000-0000000000fa"; // Distribuidora de ensayo (ficticia)
const DUENA: Perfil = { id: "00000000-0000-4000-8000-0000000000f1", email: "duena@prueba.local", nombre: "Dueña", rol: "cliente" };
const RUTA = "@/app/api/portal/numeros/route";

type Respuesta = { status: number; body: Fila };
type Manejador = (req: Request, ctx: unknown) => Promise<Response>;

async function postear(cuerpo: unknown): Promise<Respuesta> {
  const m = (await import(/* @vite-ignore */ RUTA)) as Record<string, Manejador>;
  const req = new Request("http://8x.test/api/portal/numeros", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  const res = await m.POST!(req, {});
  return { status: res.status, body: (await res.json()) as Fila };
}

const metrica = (n: number, clave: string, periodo: string, valor: number, origen: string): Fila => ({
  id: `m${n}`, company_id: EMP, clave, periodo, valor, estado: "contado", origen, valor_texto: null,
  nota: origen === "caja" ? "De tu caja (Finanzas)." : null, response_id: null, source_id: null, cifra_desplazada: null,
  updated_at: "2026-10-10T12:00:00.000Z",
});

/** Agosto lo contó la dueña; setiembre y lo de hoy salen de la caja. */
function base(): BaseFalsa {
  const b = crearBaseFalsa({
    companies: [{ id: EMP, nombre: "Distribuidora de ensayo (ficticia)", zona_horaria: "America/Lima" }],
    memberships: [{ user_id: DUENA.id, company_id: EMP, nivel: "dueno" }],
    company_metricas: [
      metrica(1, "venta_mes", "2026-08", 43200, "declarado"),
      metrica(2, "venta_mes", "2026-09", 45900, "caja"),
      metrica(3, "costo_variable_mes", "2026-09", 24800, "caja"),
      metrica(4, "caja_hoy", "actual", 21600, "caja"),
    ],
  });
  estado.base = b;
  return b;
}
const fila = (b: BaseFalsa, clave: string, periodo: string) => b.tablas.company_metricas!.find((f) => f.clave === clave && f.periodo === periodo)!;

beforeAll(async () => {
  await import(/* @vite-ignore */ RUTA);
}, 180_000);

beforeEach(() => {
  vi.mocked(perfilApi).mockReset();
  vi.mocked(perfilApi).mockResolvedValue(DUENA);
});

describe("/api/portal/numeros: lo que sale de la caja no se escribe aquí", () => {
  it("la venta de un mes de la caja: 409, no se toca y se dice «sale de tu caja: corrígelo en Finanzas»", async () => {
    const b = base();
    const antes = { ...fila(b, "venta_mes", "2026-09") };
    const r = await postear({ meses: [{ periodo: "2026-09", venta: 50000 }] });
    expect(r.status).toBe(409);
    expect(r.body.guardados).toBe(0);
    expect(String(r.body.error)).toContain("«Ventas del mes» (Setiembre 2026) sale de tu caja: corrígelo en Finanzas.");
    expect(r.body.no_guardados).toEqual([
      { clave: "venta_mes", periodo: "2026-09", motivo: "caja", texto: "«Ventas del mes» (Setiembre 2026) sale de tu caja: corrígelo en Finanzas." },
    ]);
    expect(fila(b, "venta_mes", "2026-09")).toEqual(antes);
    expect(b.tablas.company_metricas!.filter((f) => f.clave === "venta_mes" && f.periodo === "2026-09")).toHaveLength(1);
  });

  it("en el mismo envío, lo contado de otro mes se guarda y lo de la caja no", async () => {
    const b = base();
    const r = await postear({ meses: [{ periodo: "2026-08", venta: 44000 }, { periodo: "2026-09", venta: 50000, costo_variable: 30000 }] });
    expect(r.status).toBe(409);
    expect(r.body.guardados).toBe(1);
    expect(String(r.body.error)).toMatch(/^Guardamos 1 de tus números\. /);
    expect((r.body.no_guardados as Fila[]).map((n) => `${n.clave}|${n.periodo}|${n.motivo}`).sort()).toEqual(["costo_variable_mes|2026-09|caja", "venta_mes|2026-09|caja"]);
    expect(Number(fila(b, "venta_mes", "2026-08").valor)).toBe(44000);
    expect(Number(fila(b, "venta_mes", "2026-09").valor)).toBe(45900);
    expect(Number(fila(b, "costo_variable_mes", "2026-09").valor)).toBe(24800);
  });

  it("lo de hoy que suma la caja (el dinero en caja) tampoco, ni con «No lo sé»", async () => {
    const b = base();
    const r = await postear({ vitales: { caja_hoy: 5000 }, sin_dato: [] });
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toContain("sale de tu caja: corrígelo en Finanzas.");
    expect(Number(fila(b, "caja_hoy", "actual").valor)).toBe(21600);
    const n = await postear({ sin_dato: ["caja_hoy"] });
    expect(n.status).toBe(409);
    expect(fila(b, "caja_hoy", "actual")).toMatchObject({ valor: 21600, origen: "caja", estado: "contado" });
  });

  it("sin nada de la caja de por medio, la ruta hace lo de siempre (200)", async () => {
    const b = base();
    const r = await postear({ meses: [{ periodo: "2026-07", venta: 41500 }] });
    expect(r.status).toBe(200);
    expect(r.body.guardados).toBe(1);
    expect(Number(fila(b, "venta_mes", "2026-07").valor)).toBe(41500);
  });
});
