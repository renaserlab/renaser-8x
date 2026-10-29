/**
 * EL REVISOR: lo que el cliente entrega es materia prima, no producto terminado.
 *
 * Entra al expediente, se mide contra la vara de su tipo, y sale una propuesta de mejora. Estas
 * pruebas sostienen las cuatro cosas que hacen que eso sirva de algo:
 *
 *   1. LA REVISIÓN ES EXHAUSTIVA. Un veredicto por cada exigencia de la vara, no un ensayo sobre
 *      lo que al modelo le llamó la atención.
 *   2. EL VEREDICTO SALE DE LOS HECHOS. Si alguna exigencia no se cumple, el documento no puede
 *      salir «cumple». No lo elige el modelo: lo rechaza el esquema.
 *   3. NO REESCRIBE NADA. Propone. Sustituir un documento aprobado es decisión de quien tiene
 *      autoridad.
 *   4. LO VIGENTE MANDA. Un documento nuevo que contradiga lo aprobado tiene que decirlo, no
 *      convivir en silencio con la regla anterior.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SalidaRevisionDocumental } from "@/lib/schemas";
import { CONTRATOS, esAgenteConocido } from "@/lib/agentes/contratos";
import { NODOS } from "@/lib/mapa-sistema";
import { vara, CLAVES_VARA } from "@/lib/metodo/varas";
import { varaComoTexto, PROMPT_REVISOR } from "@/lib/ai/agents/revisor";

const RAIZ = path.resolve(__dirname, "..");
const HANDLER = readFileSync(path.join(RAIZ, "src/lib/jobs/handlers/revisar.ts"), "utf8");
const RUTA = readFileSync(path.join(RAIZ, "src/app/api/companies/[id]/expediente/route.ts"), "utf8");
const MIGRACION = readFileSync(path.join(RAIZ, "supabase/migracion-expediente-documental.sql"), "utf8");

const veredicto = (n: number, cumple: "si" | "no" | "no_aplica" = "si") => ({
  numero: n,
  cumple,
  evidencia: "Lo que se encontró en el documento al buscar esta exigencia, citado.",
  ...(cumple === "no" ? { que_falta: "Lo que habría que agregar para que cumpla." } : {}),
});

const revision = (over: Record<string, unknown> = {}) => ({
  tipo_detectado: "Manual de Organización y Funciones",
  es_el_tipo_esperado: true,
  veredicto: "entregable_con_observaciones" as const,
  verdictos: [veredicto(1), veredicto(2), veredicto(3, "no")],
  que_se_conserva: ["La estructura de ocho secciones por puesto: es la correcta y no hay que cambiarla."],
  contradicciones_con_lo_vigente: [],
  relleno_encontrado: [],
  mejoras_propuestas: [{ que: "Despejar las funciones repetidas del puesto.", por_que: "Una obligación escrita tres veces se diluye.", cuesta: "horas" as const }],
  para_asesor_legal: [],
  no_se_pudo_comprobar: [],
  ...over,
});

describe("la revisión es exhaustiva, no un ensayo", () => {
  it("acepta una revisión con un veredicto por exigencia", () => {
    const r = SalidaRevisionDocumental.safeParse(revision());
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("rechaza una revisión sin ningún veredicto", () => {
    expect(SalidaRevisionDocumental.safeParse(revision({ verdictos: [] })).success).toBe(false);
  });

  it("exige decir qué se conserva: un revisor que solo ve defectos obliga a rehacer todo", () => {
    expect(SalidaRevisionDocumental.safeParse(revision({ que_se_conserva: [] })).success).toBe(false);
  });

  it("exige al menos una mejora propuesta", () => {
    expect(SalidaRevisionDocumental.safeParse(revision({ mejoras_propuestas: [] })).success).toBe(false);
  });

  it("cada veredicto trae su evidencia: sin cita, «no cumple» es una opinión", () => {
    const sinEvidencia = { numero: 1, cumple: "no" as const, evidencia: "no", que_falta: "algo" };
    expect(SalidaRevisionDocumental.safeParse(revision({ verdictos: [sinEvidencia] })).success).toBe(false);
  });
});

describe("el veredicto sale de los hechos, no lo elige el modelo", () => {
  it("si una exigencia no se cumple, el documento NO puede salir «cumple»", () => {
    const r = SalidaRevisionDocumental.safeParse(revision({ veredicto: "cumple" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toMatch(/no puede ser «cumple»/);
  });

  it("si todas cumplen, «cumple» sí pasa", () => {
    const r = SalidaRevisionDocumental.safeParse(revision({ veredicto: "cumple", verdictos: [veredicto(1), veredicto(2)] }));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("un «no cumple» sin decir qué falta no pasa: no sirve para mejorar nada", () => {
    const malo = { numero: 1, cumple: "no" as const, evidencia: "Se buscó la tabla de montos y no está en ninguna parte del documento." };
    const r = SalidaRevisionDocumental.safeParse(revision({ verdictos: [malo] }));
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toMatch(/qué falta/);
  });
});

describe("no reescribe: propone", () => {
  it("el contrato prohíbe reescribir o sustituir el documento", () => {
    expect(esAgenteConocido("revisor")).toBe(true);
    expect(CONTRATOS.revisor.acciones_prohibidas.join(" ")).toMatch(/Reescribir o sustituir/i);
    expect(CONTRATOS.revisor.acciones_prohibidas.join(" ")).toMatch(/Rehacer desde cero lo que ya sirve/i);
  });

  it("el prompt se lo dice al modelo en mayúsculas, no en una nota al pie", () => {
    expect(PROMPT_REVISOR).toMatch(/NO REESCRIBAS EL DOCUMENTO/);
    expect(PROMPT_REVISOR).toMatch(/MATERIA PRIMA, no basura/);
  });

  it("el esquema no tiene ningún campo donde devolver el documento reescrito", () => {
    // Se mira la declaración del esquema: si alguien agrega un campo para devolver la versión
    // nueva, el revisor deja de proponer y empieza a sustituir, que es justo lo prohibido.
    const esquemas = readFileSync(path.join(RAIZ, "src/lib/schemas/index.ts"), "utf8");
    const i = esquemas.indexOf("export const SalidaRevisionDocumental");
    const bloque = esquemas.slice(i, esquemas.indexOf("});", i));
    expect(bloque.length, "se encontró la declaración del esquema").toBeGreaterThan(200);
    expect(bloque, "ningún campo entrega una versión nueva del documento").not.toMatch(/version_nueva|documento_corregido|texto_corregido|reescrit/i);
  });
});

describe("lo vigente manda", () => {
  it("el handler carga los documentos vigentes para contrastar", () => {
    expect(HANDLER).toMatch(/\.eq\("estado", "vigente"\)/);
    expect(HANDLER).toMatch(/loVigente/);
  });

  it("la revisión tiene dónde registrar que el documento contradice lo aprobado", () => {
    const r = SalidaRevisionDocumental.safeParse(
      revision({
        contradicciones_con_lo_vigente: [
          { dice_el_documento: "El Administrador define el tipo de cambio.", dice_lo_vigente: "El precio lo manda Gerencia.", cual_manda: "Lo vigente: la decisión de Gerencia." },
        ],
      })
    );
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("sin vara no se mide: el handler lo rechaza en vez de improvisar", () => {
    expect(HANDLER).toMatch(/sin vara no se puede medir/i);
  });

  it("un documento sin texto suficiente no se revisa: puede ser una extracción fallida", () => {
    expect(HANDLER).toMatch(/texto suficiente para revisarlo/);
  });
});

describe("aprobación y vigencia son dos cosas distintas, también en la base", () => {
  it("aprobado exige quién y cuándo", () => {
    expect(MIGRACION).toMatch(/expediente_aprobado_con_firma[\s\S]*aprobado_por is not null and aprobado_at is not null/);
  });

  it("vigente exige la fecha desde la que rige", () => {
    expect(MIGRACION).toMatch(/expediente_vigente_con_fecha[\s\S]*vigente_desde is not null/);
  });

  it("un solo documento vigente por entregable", () => {
    expect(MIGRACION).toMatch(/expediente_un_vigente_por_entregable[\s\S]*estado = 'vigente'/);
  });

  it("las revisiones se conservan todas: sin eso no se puede comparar antes y después", () => {
    expect(MIGRACION).toMatch(/create table if not exists revision_documental/);
    expect(MIGRACION).not.toMatch(/on conflict[\s\S]{0,80}revision_documental/i);
  });

  it("la ruta pide la vigencia aparte de la aprobación", () => {
    expect(RUTA).toMatch(/vigente_desde/);
    expect(RUTA).toMatch(/queLeFaltaParaVigencia/);
  });

  it("no se puede declarar vigente un documento que nunca se midió contra su vara", () => {
    expect(RUTA).toMatch(/revisado_contra_vara/);
  });
});

describe("la vara llega completa al modelo", () => {
  it("el texto de la vara trae cada exigencia numerada, con su comprobación", () => {
    for (const k of CLAVES_VARA) {
      const t = varaComoTexto(vara(k));
      const n = vara(k).exigencias.length;
      expect(t, k).toContain(`${n}. [`);
      expect(t, k).toContain("cómo se comprueba:");
      expect(t, k).toContain("LO QUE NORMALMENTE SE CONSERVA");
    }
  });

  it("marca cuáles son obligatorias: sin eso el modelo no sabe qué corta la entrega", () => {
    expect(varaComoTexto(vara("mof"))).toContain("[OBLIGATORIA]");
  });

  it("el trabajo está dibujado en el mapa y usa al revisor", () => {
    const n = NODOS.find((x) => x.tipo === "revisar_documento");
    expect(n, "el worker ejecuta revisar_documento y el mapa tiene que dibujarlo").toBeDefined();
    expect(n?.agentes).toContain("revisor");
  });
});
