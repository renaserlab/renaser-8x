/**
 * EL ESTRATEGA DE ANTES SE RETIRÓ (spec-estrategia-8x.md §1, §8.4 y §11, tramo 8).
 *
 * El «Plan estratégico» de 15 secciones en una sola llamada nunca se generó en producción (§1): lo reemplaza la
 * estrategia que 8X genera sola. Aquí se fija que se fue entero —su agente, su ficha, su esquema, su trabajo en la cola,
 * su ruta y su pantalla— y que se quedó lo que no era suyo:
 *  - el TIPO DE DOCUMENTO `plan_estrategico`: es la copia de la página del dueño que se congela al aprobar una
 *    estrategia, con su nombre en la biblioteca y su rama en VistaEntregable (nunca el JSON en crudo);
 *  - la dirección vieja de la pantalla, que lleva a la estrategia (307, en next.config.ts);
 *  - un trabajo `plan_estrategico` que hubiera quedado en una cola no se pierde en silencio: el worker lo devuelve con
 *    «tipo desconocido» y, agotados sus intentos, lo deja fallido con ese motivo.
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { CONTRATOS, CLAVES_AGENTE } from "@/lib/agentes/contratos";
import { NODOS } from "@/lib/mapa-sistema";
import { NOMBRE_TIPO } from "@/lib/documental";
import { PANTALLAS_MUDADAS } from "@/lib/vistas-empresa";
import * as esquemas from "@/lib/schemas";
import { crearBaseFalsa, type Fila } from "./fixtures/base-falsa";

const RAIZ = path.resolve(__dirname, "..");
const SRC = path.join(RAIZ, "src");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: lo que se busca es lo que corre, no la historia que cuentan los comentarios. */
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    return e.isDirectory() ? archivos(f) : /\.(ts|tsx)$/.test(e.name) ? [f] : [];
  });
}
const CODIGO = archivos(SRC).map((f) => ({ f: path.relative(RAIZ, f), src: sinComentarios(readFileSync(f, "utf8")) }));

describe("el estratega de antes ya no está", () => {
  it("se encontró el código (si esto falla, la prueba no mira nada)", () => {
    expect(CODIGO.length).toBeGreaterThan(100);
  });

  it("su agente, su ruta y su pantalla ya no existen", () => {
    for (const rel of [
      "src/lib/ai/agents/estratega.ts",
      "src/app/api/companies/[id]/plan-estrategico/route.ts",
      "src/app/(consultor)/empresa/[id]/plan-estrategico/page.tsx",
    ]) expect(existsSync(path.join(RAIZ, rel)), rel).toBe(false);
  });

  it.each([
    ["el archivo del agente", /agents\/estratega\b/],
    ["su función", /\bcorrerEstratega\b/],
    ["su manejador", /\bhandlePlanEstrategico\b/],
    ["su esquema", /\bSalidaPlanEstrategico\b/],
    ["una llamada con su agente", /agente:\s*"estratega"/],
    ["su ruta de la API", /plan-estrategico\/route|\/api\/companies\/[^"'`\s]*\/plan-estrategico/],
    ["encolar su trabajo", /encolar\(\{[^}]*tipo:\s*"plan_estrategico"/],
  ])("nadie en src/ usa %s", (_n, re) => {
    const quien = CODIGO.filter((c) => re.test(c.src)).map((c) => c.f);
    expect(quien).toEqual([]);
  });

  it("no tiene ficha de contrato, ni nodo en el mapa, ni esquema exportado", () => {
    expect(Object.keys(CONTRATOS)).not.toContain("estratega");
    expect(CLAVES_AGENTE).not.toContain("estratega" as never);
    expect(NODOS.map((n) => n.tipo)).not.toContain("plan_estrategico");
    expect(NODOS.flatMap((n) => n.agentes)).not.toContain("estratega");
    expect(Object.keys(esquemas)).not.toContain("SalidaPlanEstrategico");
  });

  it("su trabajo ya no es un tipo de la cola ni tiene manejador en el worker", () => {
    expect(sinComentarios(leer("src/lib/jobs/queue.ts"))).not.toContain('"plan_estrategico"');
    expect(sinComentarios(leer("src/lib/jobs/worker.ts"))).not.toMatch(/plan_estrategico|PlanEstrategico/);
  });

  it("la lista de rutas cuyas claves no llevan hora mira la de la estrategia, no la vieja", () => {
    const jobs = leer("tests/jobs.test.ts");
    expect(jobs).toContain('"src/app/api/companies/[id]/estrategia/route.ts"');
    expect(jobs).not.toContain('"src/app/api/companies/[id]/plan-estrategico/route.ts"');
  });
});

describe("lo que no era suyo se queda", () => {
  it("el tipo de documento plan_estrategico conserva su nombre en la biblioteca", () => {
    expect(NOMBRE_TIPO.plan_estrategico).toBe("Plan estratégico");
  });

  it("al aprobar se congela la página del dueño como plan_estrategico, y VistaEntregable la pinta (nunca el JSON)", () => {
    expect(leer("src/lib/estrategia/acciones.ts")).toMatch(/from\("deliverables"\)\.insert\(\{[^}]*tipo:\s*"plan_estrategico"/);
    expect(leer("src/components/VistaEntregable.tsx")).toContain('d.tipo === "plan_estrategico"');
    expect(leer("supabase/migracion-estrategia.sql")).toMatch(/deliverables_tipo_check check \(tipo in \([^)]*'plan_estrategico'/);
  });

  it("la dirección vieja de la pantalla lleva a la estrategia (307) y no está en ninguna vista", async () => {
    expect(PANTALLAS_MUDADAS["/plan-estrategico"]).toBe("/estrategia");
    const { default: config } = await import("../next.config");
    expect(await config.redirects!()).toContainEqual({ source: "/empresa/:id/plan-estrategico", destination: "/empresa/:id/estrategia", permanent: false });
  });
});

// ─── Un trabajo viejo que quedara en la cola ──────────────────────────────────────────────────────

const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));

describe("un trabajo plan_estrategico que quedara en la cola no se pierde en silencio", () => {
  // Importa el worker entero: con la suite completa cargando a la vez, margen de sobra.
  it("vuelve a la cola con «tipo desconocido» y, agotados sus intentos, queda fallido con ese motivo", { timeout: 30_000 }, async () => {
    const { ejecutar, HANDLERS } = await import("@/lib/jobs/worker");
    expect(Object.keys(HANDLERS)).not.toContain("plan_estrategico");
    const trabajo = (intentos: number) => ({ id: `j${intentos}`, company_id: "c1", tipo: "plan_estrategico", payload: {}, intentos, max_intentos: 3, prioridad: 2 });
    const filas: Fila[] = [1, 3].map((i) => ({ id: `j${i}`, estado: "corriendo", intentos: i, max_intentos: 3, error: null }));
    const base = crearBaseFalsa({ jobs: filas });
    estado.base = base;
    await ejecutar(trabajo(1));
    await ejecutar(trabajo(3));
    const [primero, ultimo] = base.tablas.jobs!;
    expect(primero).toMatchObject({ estado: "pendiente", error: "Tipo de trabajo desconocido en esta instancia: plan_estrategico" });
    expect(ultimo).toMatchObject({ estado: "fallido", error: "Tipo de trabajo desconocido en esta instancia: plan_estrategico" });
  });
});
