import { describe, it, expect } from "vitest";
import { accionDeMetodo } from "@/lib/auditoria";
import { CUPO } from "@/lib/limite";
import { porTipo, ESTADO_DOC, NOMBRE_TIPO, type Documento } from "@/lib/documental";

const doc = (p: Partial<Documento>): Documento => ({
  id: "d", tipo: "manual_procesos", version: 1, estado: "borrador", publicado: false,
  publicado_at: null, aprobado_at: null, aprobado_nombre: null, motivo_cambio: null,
  created_at: "2026-08-01T00:00:00Z", ...p,
});

describe("auditoría", () => {
  it("traduce el método HTTP a la acción que se registra", () => {
    expect(accionDeMetodo("POST")).toBe("crear");
    expect(accionDeMetodo("PATCH")).toBe("editar");
    expect(accionDeMetodo("PUT")).toBe("editar");
    expect(accionDeMetodo("DELETE")).toBe("eliminar");
  });

  it("no registra las lecturas por método: se registran a mano donde importan", () => {
    expect(accionDeMetodo("GET")).toBeNull();
    expect(accionDeMetodo("HEAD")).toBeNull();
  });
});

describe("cupos de peticiones", () => {
  it("lo caro (IA) es más estrecho que lo barato (escritura)", () => {
    const porSegundoIA = CUPO.ia.max / CUPO.ia.ventana;
    const porSegundoEscritura = CUPO.escritura.max / CUPO.escritura.ventana;
    expect(porSegundoIA).toBeLessThan(porSegundoEscritura);
  });

  it("todos los cupos tienen ventana y tope positivos", () => {
    for (const [nombre, c] of Object.entries(CUPO)) {
      expect(c.max, nombre).toBeGreaterThan(0);
      expect(c.ventana, nombre).toBeGreaterThan(0);
    }
  });

  it("el cupo de sesión frena la fuerza bruta: menos de un intento por minuto", () => {
    expect(CUPO.sesion.max / (CUPO.sesion.ventana / 60)).toBeLessThan(1);
  });
});

describe("control documental (ISO 9001 7.5)", () => {
  it("agrupa por tipo y pone el vigente aparte del historial", () => {
    const g = porTipo([
      doc({ id: "v2", version: 2, estado: "vigente" }),
      doc({ id: "v1", version: 1, estado: "obsoleto" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.vigente?.id).toBe("v2");
    expect(g[0]!.historial.map((h) => h.id)).toEqual(["v1"]);
  });

  it("un borrador sin aprobar no cuenta como vigente", () => {
    const g = porTipo([doc({ id: "b", estado: "borrador" })]);
    expect(g[0]!.vigente).toBeNull();
    expect(g[0]!.historial).toHaveLength(1);
  });

  it("con dos vigentes por error, solo el primero manda y el otro queda en historial", () => {
    const g = porTipo([doc({ id: "a", estado: "vigente" }), doc({ id: "b", estado: "vigente" })]);
    expect(g[0]!.vigente?.id).toBe("a");
    expect(g[0]!.historial).toHaveLength(1);
  });

  it("separa tipos distintos en grupos distintos", () => {
    const g = porTipo([doc({ tipo: "manual_procesos" }), doc({ tipo: "plan_90" })]);
    expect(g).toHaveLength(2);
  });

  it("todo estado tiene texto en castellano y color", () => {
    for (const e of ["borrador", "vigente", "obsoleto"]) {
      expect(ESTADO_DOC[e]?.texto).toBeTruthy();
      expect(ESTADO_DOC[e]?.color).toMatch(/^var\(--/);
    }
  });

  it("los tipos que la base acepta tienen nombre que el dueño entiende", () => {
    for (const t of ["informe_realidad", "manual_procesos", "plan_90", "plan_estrategico"]) {
      expect(NOMBRE_TIPO[t], t).toBeTruthy();
      expect(NOMBRE_TIPO[t]).not.toContain("_");
    }
  });
});

/**
 * El cortacircuitos compartido (30-08-2026). Vivía en la memoria del proceso, y en serverless cada
 * instancia arrancaba con el contador en cero: la primera petición de cada una volvía a pagar la
 * espera del modelo caído. Mismo error que ya se había corregido en el límite de peticiones.
 */
describe("cortacircuitos del modelo", () => {
  it("el estado se consulta a la base, no a una variable del proceso", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/lib/ai/gemini.ts", "utf8");
    expect(src, "el estado tiene que ser común a todas las instancias").toContain("circuito_abierto");
    expect(src).toContain("circuito_fallo");
    expect(src).toContain("circuito_exito");
    expect(src, "ya no puede quedar un contador suelto en memoria").not.toMatch(/let fallosSeguidos/);
    expect(src, "ni una ventana guardada solo en el proceso").not.toMatch(/let cortadoHasta/);
  });

  it("un circuito roto no puede dejar sin IA al cliente: ante error, se asume sano", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/lib/ai/gemini.ts", "utf8");
    const bloque = src.slice(src.indexOf("async function principalCaido"), src.indexOf("async function anotarFallo"));
    expect(bloque).toContain("return false");
  });

  it("el fallo se espera antes de seguir: de él depende que el siguiente trabajo no pague la espera", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/lib/ai/gemini.ts", "utf8");
    expect(src).toContain("await anotarFallo()");
  });
});
