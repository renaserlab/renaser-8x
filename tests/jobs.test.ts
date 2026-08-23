import { describe, it, expect } from "vitest";
import { ordenarCola, estadoTrasFallo, recuperarVencidos, esperaRateLimit, ESPERAS_MS } from "@/lib/jobs/reglas";
import { claveIdempotente, PRIORIDAD } from "@/lib/jobs/queue";

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
