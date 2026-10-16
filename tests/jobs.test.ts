import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { ordenarCola, estadoTrasFallo, recuperarVencidos, esperaRateLimit, ESPERAS_MS } from "@/lib/jobs/reglas";
import { claveIdempotente, claveDePeticion, canonico, PRIORIDAD } from "@/lib/jobs/queue";

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
    expect(PRIORIDAD).toEqual({ entrevista: 1, proceso_voz: 2, contrastar: 3, extraer: 5, diagnosticar: 7, lote: 9 });
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
      "src/app/api/companies/[id]/plan-estrategico/route.ts",
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
