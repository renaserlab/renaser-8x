/**
 * POR DÓNDE SE EMPIEZA: LAS DOS LISTAS NO SON LA MISMA COSA.
 *
 * El hueco que esto cierra: 8X tenía la vara del rubro (10 a 15 procesos que el sector exige) y el
 * arquitecto, que dibuja UNO cuando alguien lo cuenta. En medio nada decidía CUÁLES. El consultor
 * elegía de memoria y a la empresa sin nada escrito le caía la lista entera encima.
 *
 * Lo que estas pruebas sostienen:
 *   1. El tope de captura se respeta: a quien no tiene nada escrito no se le piden más de 8.
 *   2. La intervención admite UNA sola clave. No es un cupo de tres que haya que llenar.
 *   3. Una clave de intervención que nadie va a contar NO pasa. Intervenir un proceso que nadie
 *      describió es intervenir a ciegas, y es el error más caro de este paso.
 *   4. La selección nace «propuesta» y el cliente no la ve hasta que la consultora firma —con
 *      nombre y fecha, porque «aprobada» sin firma es un campo cambiado, no una aprobación.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SalidaSeleccionProcesos } from "@/lib/schemas";
import { PROCESOS } from "@/lib/metodo";
import { CONTRATOS, esAgenteConocido } from "@/lib/agentes/contratos";
import { NODOS } from "@/lib/mapa-sistema";

const RAIZ = path.resolve(__dirname, "..");
const MIGRACION = readFileSync(path.join(RAIZ, "supabase/migracion-seleccion-procesos.sql"), "utf8");
const RUTA = readFileSync(path.join(RAIZ, "src/app/api/companies/[id]/seleccion/route.ts"), "utf8");
const HANDLER = readFileSync(path.join(RAIZ, "src/lib/jobs/handlers/seleccion.ts"), "utf8");

const contar = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    nombre: `Proceso ${i + 1}`,
    por_que_este: "Lo que se destraba conociendo este proceso, anclado en el diagnóstico.",
    que_preguntarle: "Cuéntame qué hace desde que llega el cliente hasta que se va.",
    ya_lo_tiene_levantado: false,
  }));

const clave = (nombre: string, apoyo = "Hallazgo confirmado del diagnóstico sobre este proceso.") => ({
  nombre,
  por_que_mueve_todo: "Cuando este funciona se arreglan el cierre del día y la confianza en los números.",
  que_desbloquea: "Poder saber cada día si el negocio ganó o perdió.",
  apoyado_en: apoyo,
});

const seleccion = (nContar: number, claves: ReturnType<typeof clave>[]) => ({
  para_contar: contar(nContar),
  mueven_las_ruedas: claves,
  lo_que_no_se_pide: ["Prevención de lavado: se mira cuando esté el oficial de cumplimiento."],
  nota_para_la_consultora: "La empresa no tiene nada escrito, así que esta lista es lo primero que va a ver de nuestro criterio.",
});

describe("el tope de captura protege a quien no tiene nada escrito", () => {
  it(`acepta hasta ${PROCESOS.captura.tope} procesos para contar`, () => {
    const r = SalidaSeleccionProcesos.safeParse(seleccion(PROCESOS.captura.tope, [clave("Proceso 1")]));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it(`rechaza ${PROCESOS.captura.tope + 1}: más de eso es un interrogatorio y el dueño abandona`, () => {
    expect(SalidaSeleccionProcesos.safeParse(seleccion(PROCESOS.captura.tope + 1, [clave("Proceso 1")])).success).toBe(false);
  });

  it("acepta menos del tope: elegir pocos es elegir, llenar el tope no", () => {
    expect(SalidaSeleccionProcesos.safeParse(seleccion(3, [clave("Proceso 2")])).success).toBe(true);
  });
});

describe("la intervención es de una a tres, no un cupo de tres", () => {
  it("UNA sola clave pasa: si la empresa tiene una restricción de verdad, es una", () => {
    const r = SalidaSeleccionProcesos.safeParse(seleccion(5, [clave("Proceso 1")]));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
    expect(PROCESOS.intervencion.minimo).toBe(1);
  });

  it(`rechaza cero claves: una selección sin dónde intervenir no sirve`, () => {
    expect(SalidaSeleccionProcesos.safeParse(seleccion(5, [])).success).toBe(false);
  });

  it(`rechaza más de ${PROCESOS.intervencion.tope}: abrir cuatro frentes es no haber priorizado`, () => {
    const cuatro = ["Proceso 1", "Proceso 2", "Proceso 3", "Proceso 4"].map((n) => clave(n));
    expect(SalidaSeleccionProcesos.safeParse(seleccion(6, cuatro)).success).toBe(false);
  });
});

describe("una clave que nadie va a contar no pasa", () => {
  it("rechaza intervenir un proceso que no está en para_contar ni se dice que esté levantado", () => {
    const r = SalidaSeleccionProcesos.safeParse(seleccion(4, [clave("Conciliación bancaria")]));
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toMatch(/a ciegas|para_contar/);
  });

  it("lo acepta si se declara que ya está levantado", () => {
    const r = SalidaSeleccionProcesos.safeParse(
      seleccion(4, [clave("Conciliación bancaria", "Ya levantado y confirmado por la empresa el mes pasado.")])
    );
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("lo acepta cuando sí está en la lista que se va a contar", () => {
    const r = SalidaSeleccionProcesos.safeParse(seleccion(4, [clave("Proceso 3")]));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });
});

describe("la consultora aprueba antes de que el cliente lo vea", () => {
  it("la selección nace en estado propuesta, nunca aprobada", () => {
    expect(MIGRACION).toMatch(/estado text not null default 'propuesta'/);
    expect(HANDLER).toMatch(/estado: "propuesta"/);
    expect(HANDLER).not.toMatch(/estado: "aprobada"/);
  });

  it("la base solo admite los tres estados del vocabulario", () => {
    expect(MIGRACION).toMatch(/estado in \('propuesta', 'aprobada', 'descartada'\)/);
  });

  it("«aprobada» sin firma no entra: la restricción lo exige en la base, no solo en el código", () => {
    expect(MIGRACION).toMatch(/estado <> 'aprobada' or \(aprobada_por is not null and aprobada_at is not null\)/);
  });

  it("solo una aprobada vigente por empresa: dos dejarían al consultor y al cliente en listas distintas", () => {
    expect(MIGRACION).toMatch(/unique index[\s\S]*seleccion_procesos_una_aprobada[\s\S]*where \(estado = 'aprobada'\)/);
  });

  it("aprobar deja quién y cuándo", () => {
    expect(RUTA).toMatch(/aprobada_por: perfil\.id/);
    expect(RUTA).toMatch(/aprobada_at: ahora/);
  });

  it("la ruta es solo de consultor: el cliente no puede aprobar su propia selección", () => {
    expect(RUTA).toMatch(/protegido<Ctx>\(\{ consultor: true/);
  });

  it("la tabla tiene RLS y no se abre al cliente", () => {
    expect(MIGRACION).toMatch(/enable row level security/);
    expect(MIGRACION).not.toMatch(/create policy/);
  });
});

describe("el paso está conectado al sistema, no suelto", () => {
  it("el agente selector tiene contrato: sin eso no corre", () => {
    expect(esAgenteConocido("selector")).toBe(true);
    expect(CONTRATOS.selector.aprobador).toBe("consultor");
    expect(CONTRATOS.selector.salida).toBe("SalidaSeleccionProcesos");
  });

  it("el contrato prohíbe explícitamente entregarlo sin aprobación", () => {
    expect(CONTRATOS.selector.acciones_prohibidas.join(" ")).toMatch(/sin que la consultora la apruebe/i);
  });

  it("el trabajo está dibujado en el mapa", () => {
    const nodo = NODOS.find((n) => n.tipo === "seleccionar_procesos");
    expect(nodo, "el worker ejecuta seleccionar_procesos y el mapa tiene que dibujarlo").toBeDefined();
    expect(nodo?.agentes).toContain("selector");
  });

  it("no inventa procesos: exige el modelo del rubro antes de elegir", () => {
    expect(HANDLER).toMatch(/falta el modelo de alto rendimiento/i);
    expect(RUTA).toMatch(/Falta el modelo de alto rendimiento/i);
  });

  it("los topes del prompt salen de la política, no escritos a mano", () => {
    const selector = readFileSync(path.join(RAIZ, "src/lib/ai/agents/selector.ts"), "utf8");
    expect(selector).toMatch(/from "@\/lib\/metodo"/);
    expect(selector).toMatch(/\$\{PROCESOS\.captura\.tope\}/);
    expect(selector).toMatch(/\$\{PROCESOS\.intervencion\.tope\}/);
  });
});
