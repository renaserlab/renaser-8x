import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import {
  ordenarCola, estadoTrasFallo, recuperarVencidos, esperaRateLimit, ESPERAS_MS, TIPOS_LARGOS, MARGEN_TRABAJO_LARGO_MS, cambioTrasDevolver,
  hayQueDevolver, PROGRESO_DEVUELTO,
} from "@/lib/jobs/reglas";
import { claveIdempotente, claveDePeticion, canonico, PRIORIDAD } from "@/lib/jobs/queue";
import { drenarCola, ejecutar } from "@/lib/jobs/worker";
import { AIProviderDownError, AISinTiempoError, LLAMADA_LARGA } from "@/lib/ai/provider";

// ---- Para la guarda del drenaje: una cola FALSA mínima (take_job, update) y manejadores falsos. Nada real. ----
type FilaJob = Record<string, unknown>;
const cola = vi.hoisted(() => ({ jobs: [] as FilaJob[] }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    rpc: async (nombre: string) => {
      if (nombre === "take_job") {
        const j = cola.jobs.find((x) => x.estado === "pendiente");
        if (!j) return { data: [], error: null };
        Object.assign(j, { estado: "corriendo", intentos: Number(j.intentos) + 1 });
        return { data: [j], error: null };
      }
      return { data: nombre === "circuito_abierto" ? false : null, error: null };
    },
    from: () => ({
      update: (patch: FilaJob) => ({
        eq: async (col: string, v: unknown) => {
          for (const f of cola.jobs) if (f[col] === v) Object.assign(f, patch);
          return { data: null, error: null };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/db/queries", async (orig) => ({ ...(await orig<typeof import("@/lib/db/queries")>()), superaTope: async () => false, registrarErrorLlamada: async () => {}, refrescarStats: async () => {} }));
const manejadores = vi.hoisted(() => ({ lente: vi.fn(async () => ({ ok: true })), rojo: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/jobs/handlers/estrategia", () => ({ handleEstrategiaLente: manejadores.lente, handleEstrategiaRojo: manejadores.rojo }));

const j = (id: string, prioridad: number, created_at: string, extra: Partial<{ estado: string; intentos: number; max_intentos: number; lease_expira_at: string | null }> = {}) => ({ id, prioridad, created_at, estado: "pendiente", intentos: 0, max_intentos: 3, lease_expira_at: null, ...extra });

describe("cola: prioridad, idempotencia, reintentos, recuperación", () => {
  it("una pregunta de entrevista (p1) nunca espera detrás del PDF de otra empresa (p5)", () => {
    const cola = ordenarCola([j("pdf", PRIORIDAD.extraer, "2026-01-01T00:00:00Z"), j("pregunta", PRIORIDAD.entrevista, "2026-01-01T00:00:05Z"), j("diag", PRIORIDAD.diagnosticar, "2026-01-01T00:00:01Z")]);
    expect(cola.map((x) => x.id)).toEqual(["pregunta", "pdf", "diag"]);
  });
  it("a igual prioridad, el más antiguo primero; los que no están pendientes no se toman", () => {
    const cola = ordenarCola([j("b", 5, "2026-01-02"), j("a", 5, "2026-01-01"), j("c", 1, "2026-01-01", { estado: "corriendo" })]);
    expect(cola.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("las prioridades del capítulo 28.3 están en el código", () => {
    expect(PRIORIDAD).toEqual({ entrevista: 1, proceso_voz: 2, contrastar: 3, extraer: 5, estrategia: 6, diagnosticar: 7, lote: 9 });
    // La estrategia es pesada en take_job (prioridad ≥ 5): a lo sumo dos por empresa a la vez, justo las dos lentes.
    expect(PRIORIDAD.estrategia).toBeGreaterThanOrEqual(5);
  });
  it("idempotencia: misma entrada → misma clave; distinta → distinta; incluye la versión del prompt", () => {
    expect(claveIdempotente(["extraer", "src1", 0])).toBe(claveIdempotente(["extraer", "src1", 0]));
    expect(claveIdempotente(["extraer", "src1", 0])).not.toBe(claveIdempotente(["extraer", "src1", 1]));
    expect(claveIdempotente(["a"])).toHaveLength(40);
  });
  it("retry: vuelve a pendiente hasta agotar; luego fallido visible (nunca desaparece)", () => {
    expect(estadoTrasFallo({ intentos: 1, max_intentos: 3 })).toBe("pendiente");
    expect(estadoTrasFallo({ intentos: 3, max_intentos: 3 })).toBe("fallido");
  });
  it("worker muerto: lease vencido → pendiente; con intentos agotados → fallido; lease vigente se respeta", () => {
    const ahora = new Date("2026-01-01T10:00:00Z");
    const r = recuperarVencidos(
      [
        j("v", 5, "x", { estado: "corriendo", intentos: 1, lease_expira_at: "2026-01-01T09:00:00Z" }),
        j("agotado", 5, "x", { estado: "corriendo", intentos: 3, lease_expira_at: "2026-01-01T09:00:00Z" }),
        j("vivo", 5, "x", { estado: "corriendo", intentos: 1, lease_expira_at: "2026-01-01T11:00:00Z" }),
      ],
      ahora
    );
    expect(r.map((x) => x.estado)).toEqual(["pendiente", "fallido", "corriendo"]);
  });
  it("backoff 1s, 4s, 16s; máximo dos reintentos por límite del proveedor", () => {
    expect(ESPERAS_MS).toEqual([1000, 4000, 16000]);
    expect(esperaRateLimit(0)).toBe(1000);
    expect(esperaRateLimit(1)).toBe(4000);
    expect(esperaRateLimit(2)).toBeNull();
  });
});

/**
 * LA CLAVE DE UNA PETICIÓN ES LA PETICIÓN, NO EL MOMENTO. La clave por defecto llevaba la hora, así
 * que la misma petición repetida (doble clic, recarga, reintento de red) creaba otro trabajo idéntico:
 * de ahí la «triple pregunta» de la entrevista. Estas pruebas fijan que la clave sale del contenido.
 */
describe("clave determinista de una petición", () => {
  const RAIZ = path.resolve(__dirname, "..");
  const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
  const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("misma petición → misma clave; distinta petición → distinta clave", () => {
    expect(claveDePeticion("diagnosticar", "c1", { pilar: "procesos" })).toBe(claveDePeticion("diagnosticar", "c1", { pilar: "procesos" }));
    expect(claveDePeticion("diagnosticar", "c1", { pilar: "procesos" })).not.toBe(claveDePeticion("diagnosticar", "c1", { pilar: "personas" }));
    expect(claveDePeticion("diagnosticar", "c1", { pilar: "procesos" })).not.toBe(claveDePeticion("diagnosticar", "c2", { pilar: "procesos" }));
    expect(claveDePeticion("diagnosticar", "c1", {})).not.toBe(claveDePeticion("planificar", "c1", {}));
  });

  it("el payload con las claves en distinto orden es la MISMA petición, también en objetos anidados", () => {
    const a = claveDePeticion("extraer", "c1", { source_id: "s1", chunk_index: 2, meta: { b: 1, a: [{ y: 2, x: 1 }] } });
    const b = claveDePeticion("extraer", "c1", { meta: { a: [{ x: 1, y: 2 }], b: 1 }, chunk_index: 2, source_id: "s1" });
    expect(a).toBe(b);
    expect(canonico({ b: 1, a: undefined, c: { z: 1, y: 2 } })).toBe('{"b":1,"c":{"y":2,"z":1}}');
    // Un arreglo conserva su orden: [1,2] y [2,1] no son lo mismo.
    expect(claveDePeticion("x", null, { lista: [1, 2] })).not.toBe(claveDePeticion("x", null, { lista: [2, 1] }));
  });

  it("la cola no usa la hora en ninguna clave: Date.now no aparece en queue.ts fuera de comentarios", () => {
    expect(sinComentarios(leer("src/lib/jobs/queue.ts"))).not.toContain("Date.now");
  });

  it("los sitios que encolaban con la hora en la clave ya no lo hacen", () => {
    const archivos = [
      "src/app/api/companies/[id]/assets/construir/route.ts",
      "src/app/api/companies/[id]/assets/sistematizar/route.ts",
      // La estrategia (spec-estrategia-8x.md §5.3): la ruta de generar reemplaza a la del plan estratégico de antes, que se
      // retiró en el tramo 8; la de reintentar, y lo que encola por ellas.
      "src/app/api/companies/[id]/estrategia/route.ts",
      "src/app/api/companies/[id]/estrategia/[eid]/reintentar/route.ts",
      "src/lib/estrategia/generar.ts",
      "src/lib/estrategia/acciones.ts",
      "src/lib/entrevista.ts",
    ];
    for (const a of archivos) {
      const src = sinComentarios(leer(a));
      expect(src, `${a} sigue metiendo la hora en una clave de idempotencia`).not.toMatch(/claveIdempotente\([^;]*Date\.now/);
      expect(src, `${a} sigue metiendo azar en una clave de idempotencia`).not.toMatch(/claveIdempotente\([^;]*Math\.random/);
    }
    // En todo src/, ninguna clave de idempotencia lleva la hora ni azar.
    const buscar = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? buscar(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : []));
    const culpables = buscar(path.join(RAIZ, "src")).filter((f) => /claveIdempotente\([^;]*(Date\.now|Math\.random)/.test(sinComentarios(readFileSync(f, "utf8"))));
    expect(culpables).toEqual([]);
  });
});

/**
 * UN TRABAJO LARGO NO EMPIEZA SI NO ALCANZA A TERMINAR (spec-estrategia-8x.md §5.3). El drenaje en Vercel corre unos
 * 270 s y la función se corta a los 300 s: una lente tomada al final moría sin que su manejador anotara nada, el lease
 * vencía a los diez minutos y el reintento pagaba otra llamada. Con menos de 150 s por delante, se devuelve a la cola
 * SIN gastar el intento y el drenaje termina; la continuación lo toma con el reloj entero.
 */
describe("la guarda de tiempo del drenaje para los trabajos largos", () => {
  beforeEach(() => {
    cola.jobs = [];
    manejadores.lente.mockClear();
    manejadores.rojo.mockClear();
  });
  const largo = (extra: Partial<FilaJob> = {}): FilaJob => ({ id: "j1", company_id: "c1", tipo: "estrategia_lente", payload: { estrategia_id: "e1", lente: "dinero" }, intentos: 0, max_intentos: 3, prioridad: PRIORIDAD.estrategia, estado: "pendiente", ...extra });

  it("los tipos largos son las lentes y el equipo rojo; su margen sale de lo que se le permite a la llamada larga", () => {
    expect([...TIPOS_LARGOS].sort()).toEqual(["estrategia_lente", "estrategia_rojo"]);
    // Un solo intento con el plazo de una petición, dos esperas cortas por 503 y el respiro de guardar: 149 s.
    expect(LLAMADA_LARGA.intentos).toBe(1);
    expect(MARGEN_TRABAJO_LARGO_MS).toBe(LLAMADA_LARGA.plazoMs + 3_000 + 6_000 + 20_000);
    expect(MARGEN_TRABAJO_LARGO_MS).toBe(149_000);
    expect(hayQueDevolver("estrategia_rojo", MARGEN_TRABAJO_LARGO_MS - 1)).toBe(true);
    expect(hayQueDevolver("estrategia_rojo", MARGEN_TRABAJO_LARGO_MS)).toBe(false);
    expect(hayQueDevolver("extraer", 1_000)).toBe(false);
  });

  it("devolverlo no gasta el intento ni lleva error: no es un fallo", () => {
    expect(cambioTrasDevolver({ intentos: 1 })).toEqual({ estado: "pendiente", intentos: 0, progreso: PROGRESO_DEVUELTO, lease_expira_at: null, terminado_at: null });
    expect(cambioTrasDevolver({ intentos: 0 }).intentos).toBe(0);
  });

  it("con menos de su margen por delante, drenarCola lo devuelve a pendiente sin gastar el intento, no lo corre y termina", async () => {
    cola.jobs = [largo(), largo({ id: "j2", tipo: "estrategia_rojo", payload: { estrategia_id: "e1" } })];
    const r = await drenarCola(100_000);
    expect(r.procesados).toBe(0);
    expect(cola.jobs[0]).toMatchObject({ estado: "pendiente", intentos: 0, progreso: PROGRESO_DEVUELTO });
    expect(manejadores.lente).not.toHaveBeenCalled();
    // El drenaje terminó: el segundo trabajo largo ni se tomó.
    expect(cola.jobs[1]).toMatchObject({ estado: "pendiente", intentos: 0 });
  });

  it("con el reloj entero, el trabajo largo corre", async () => {
    cola.jobs = [largo()];
    const r = await drenarCola(270_000);
    expect(r.procesados).toBe(1);
    expect(manejadores.lente).toHaveBeenCalledTimes(1);
    expect(cola.jobs[0]).toMatchObject({ estado: "hecho" });
  });

  it("si a la llamada no le alcanzaba el reloj del drenaje, el trabajo vuelve a la cola sin gastar el intento (no muere con la función)", async () => {
    const job = largo({ estado: "corriendo", intentos: 1 });
    cola.jobs = [job];
    manejadores.lente.mockRejectedValueOnce(new AISinTiempoError("No queda tiempo en esta vuelta para pedirle al asistente"));
    await ejecutar(job as never, { hasta: Date.now() + 10_000 });
    expect(cola.jobs[0]).toMatchObject({ estado: "pendiente", intentos: 0, progreso: PROGRESO_DEVUELTO });
    expect(manejadores.lente).toHaveBeenCalledTimes(1);
  });

  it("un reintento por proveedor caído que ya no cabe en el reloj tampoco se hace: vuelve a la cola sin gastar el intento", async () => {
    const job = largo({ id: "j9", tipo: "estrategia_rojo", payload: { estrategia_id: "e1" }, estado: "corriendo", intentos: 1 });
    cola.jobs = [job];
    manejadores.rojo.mockRejectedValueOnce(new AIProviderDownError("Gemini 503: The model is overloaded"));
    await ejecutar(job as never, { hasta: Date.now() + MARGEN_TRABAJO_LARGO_MS - 1_000 });
    expect(cola.jobs[0]).toMatchObject({ estado: "pendiente", intentos: 0, progreso: PROGRESO_DEVUELTO });
    expect(manejadores.rojo).toHaveBeenCalledTimes(1);
  });
});
