/**
 * EL MÉTODO SE GOBIERNA DESDE UN ARCHIVO, NO DESDE LOS PROMPTS.
 *
 * Los números del método RENASER —cuántos procesos se capturan, cuántos se mapean, cuántos se
 * intervienen— estaban escritos a mano dentro de los prompts de los agentes. Eso significaba que
 * para leer la metodología había que abrir siete archivos, y que cambiar un criterio era editar
 * una cadena de texto sin que nada lo verificara.
 *
 * Esta prueba sostiene tres cosas:
 *   1. La política es coherente consigo misma (un tope de captura no puede ser mayor que la
 *      expectativa de mapeo, y así).
 *   2. Los agentes ya migrados no traen cantidades a mano: las leen de `metodo.ts`.
 *   3. Los esquemas validan LO MISMO que dice la política. Un número en un prompt es una
 *      sugerencia al modelo; el que manda es el del esquema.
 *
 * Y lista los agentes que todavía NO están migrados. Esa lista tiene que encogerse, nunca crecer:
 * si alguien escribe una cantidad nueva a mano, esta prueba falla.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { z } from "zod";
import { BRECHAS, ESTANDARES, ESTRUCTURA, INDICADORES_RUBRO, NORMATIVA, PROCESOS, SERVICIOS, expectativa, rango } from "@/lib/metodo";
import { SalidaModeloAltoRendimiento } from "@/lib/schemas";

// El freno técnico de la sistematización está para parar una respuesta desbocada, no para recortar
// una empresa real. Decía 30, y la primera empresa cliente tiene 33 procesos confirmados en la base: el esquema
// rechazaba la radiografía del primer cliente. Este número sube cuando entre una empresa más
// grande, no cuando a alguien le parezca.
const PROCESOS_DE_LA_EMPRESA_MAS_GRANDE_QUE_ATENDEMOS = 33; // Inversiones la primera empresa cliente S.A.C., 3 sedes

const AGENTES = path.resolve(__dirname, "../src/lib/ai/agents");

/** Agentes cuyos números ya salen de metodo.ts. No pueden traer cantidades a mano. */
const GOBERNADOS = ["investigador.ts"];

/**
 * Agentes que todavía tienen cantidades escritas a mano. Esta lista debe ENCOGERSE.
 * Si agregas un agente aquí, estás documentando deuda, no resolviéndola.
 */
const PENDIENTES = ["organizador.ts", "medidor.ts"];

/** Una cantidad escrita a mano dentro de un prompt: «(3-12)», «máximo 8», «3-10 estándares». */
function cantidadesAMano(src: string): string[] {
  // Solo dentro de los prompts: fuera de ellos un número puede ser legítimo (índices, tokens).
  const prompts = [...src.matchAll(/PROMPT_[A-Z_]+\s*=\s*`([\s\S]*?)`;/g)].map((m) => m[1]);
  const encontradas: string[] = [];
  for (const p of prompts) {
    // Se ignoran los que vienen interpolados: `${rango(...)}` ya quedó resuelto antes del match.
    const sinInterpolar = p.replace(/\$\{[^}]*\}/g, "«interpolado»");
    for (const m of sinInterpolar.matchAll(/\(\s*\d+\s*-\s*\d+\s*\)|m[áa]ximo\s+\d+|m[íi]nimo\s+\d+|\b\d+\s*-\s*\d+\s+(?:procesos|puestos|est[áa]ndares|indicadores|brechas|obligaciones)/gi)) {
      encontradas.push(m[0].trim());
    }
  }
  return encontradas;
}

describe("la política del método es coherente consigo misma", () => {
  it("el tope de captura no se pasa de la expectativa de mapeo", () => {
    // Capturar más procesos de los que se mapean no tendría sentido: la captura es el subconjunto
    // que se le pide contar a quien no tiene nada escrito.
    expect(PROCESOS.captura.tope).toBeLessThanOrEqual(PROCESOS.sistematizacion.esperado_min);
  });

  it("las claves de intervención son menos que los procesos que se capturan", () => {
    expect(PROCESOS.intervencion.tope).toBeLessThan(PROCESOS.captura.tope);
  });

  it("la intervención admite una sola clave: no es un cupo de tres que haya que llenar", () => {
    expect(PROCESOS.intervencion.minimo).toBe(1);
    expect(PROCESOS.intervencion.tope).toBe(3);
  });

  it("cada rango tiene mínimo menor o igual que su tope", () => {
    for (const [nombre, r] of Object.entries({ captura: PROCESOS.captura, intervencion: PROCESOS.intervencion, ESTRUCTURA, ESTANDARES, INDICADORES_RUBRO, BRECHAS })) {
      expect(r.minimo, nombre).toBeLessThanOrEqual(r.tope);
    }
  });

  it("la sistematización es expectativa, no tope: su freno técnico deja aire sobre lo esperado", () => {
    expect(PROCESOS.sistematizacion.naturaleza).toBe("expectativa");
    expect(PROCESOS.sistematizacion.esperado_min).toBeLessThan(PROCESOS.sistematizacion.esperado_max);
    expect(PROCESOS.sistematizacion.tope_tecnico).toBeGreaterThan(PROCESOS.sistematizacion.esperado_max);
  });

  // El freno técnico está para parar una respuesta desbocada, no para recortar una empresa real.
  // la primera empresa cliente tiene 33 procesos confirmados en la base y el freno decía 30: el esquema rechazaba
  // la radiografía del primer cliente. Esta prueba existe para que no vuelva a pasar, y el número
  // sube cuando entre una empresa más grande, no cuando a alguien le parezca.
  it("el freno técnico vive por encima de la empresa más grande que ya atendemos, no al borde", () => {
    expect(
      PROCESOS.sistematizacion.tope_tecnico,
      "un freno por debajo de una empresa real rechaza su propio mapa de procesos"
    ).toBeGreaterThan(PROCESOS_DE_LA_EMPRESA_MAS_GRANDE_QUE_ATENDEMOS);
  });

  it("la instrucción de la expectativa no le pone techo al modelo: le pide todos y que explique", () => {
    const t = expectativa(PROCESOS.sistematizacion);
    expect(t, "pedir «hasta N» hace que el modelo recorte la lista en N").not.toMatch(/hasta \d+/);
    expect(t).toMatch(/TODOS/);
    expect(t).toMatch(/por_que_mas_de_lo_esperado/);
  });

  it("los dos servicios apuntan a un momento de procesos que existe", () => {
    for (const s of Object.values(SERVICIOS)) expect(PROCESOS[s.procesos]).toBeDefined();
  });

  it("cada número declara si es tope o expectativa", () => {
    const todos = [PROCESOS.captura, PROCESOS.sistematizacion, PROCESOS.intervencion, ESTRUCTURA, NORMATIVA, ESTANDARES, INDICADORES_RUBRO, BRECHAS];
    for (const r of todos) expect(["tope", "expectativa"]).toContain(r.naturaleza);
  });
});

describe("los agentes migrados no traen cantidades a mano", () => {
  it.each(GOBERNADOS)("%s lee sus números de metodo.ts", (archivo) => {
    const src = readFileSync(path.join(AGENTES, archivo), "utf8");
    expect(src, `${archivo} debe importar la política`).toMatch(/from "@\/lib\/metodo"/);
    const aMano = cantidadesAMano(src);
    expect(aMano, `${archivo} tiene cantidades escritas a mano en su prompt: ${aMano.join(", ")}`).toEqual([]);
  });

  it("la lista de pendientes no creció: ningún agente nuevo escribe cantidades a mano", () => {
    const conCantidades = readdirSync(AGENTES)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => cantidadesAMano(readFileSync(path.join(AGENTES, f), "utf8")).length > 0);
    const inesperados = conCantidades.filter((f) => !PENDIENTES.includes(f));
    expect(
      inesperados,
      `Estos agentes escriben cantidades a mano y no están declarados como deuda: ${inesperados.join(", ")}. O los migras a metodo.ts, o los agregas a PENDIENTES diciendo por qué.`
    ).toEqual([]);
  });
});

describe("el esquema valida lo mismo que dice la política", () => {
  /** Un modelo del rubro válido, con n procesos. */
  const modelo = (n: number, porQueMas?: string) => ({
    el_rubro_en_su_mejor_version: "Una casa de cambio bien operada cierra su caja en minutos, conoce su margen por operación y no depende de que la dueña esté presente para dar un precio.",
    estandares_de_servicio: Array.from({ length: ESTANDARES.minimo }, (_, i) => ({ estandar: `Estándar de servicio número ${i + 1} del rubro`, meta: "meta concreta", origen: "practica_de_industria" as const })),
    estructura_tipo: Array.from({ length: ESTRUCTURA.minimo }, (_, i) => ({ puesto: `Puesto ${i + 1}`, mision: "La misión de este puesto en una línea." })),
    procesos_imprescindibles: Array.from({ length: n }, (_, i) => ({ nombre: `Proceso ${i + 1}`, por_que: "Lo que este proceso protege o produce.", detalle_minimo: "Tiempos, montos y controles que debe contener.", la_empresa_lo_tiene: "no" as const })),
    ...(porQueMas ? { por_que_mas_de_lo_esperado: porQueMas } : {}),
    numeros_de_clase_mundial: Array.from({ length: INDICADORES_RUBRO.minimo }, (_, i) => ({ nombre: `Indicador ${i + 1}`, como_se_mide: "Cómo se mide este número.", meta_referencia: "rango típico" })),
    normativa: [],
    las_tres_brechas_mayores: ["La brecha más grave de esta empresa, dicha sin anestesia."],
  });

  it("una empresa con más procesos de lo esperado pasa, si dice por qué", () => {
    const m = modelo(PROCESOS_DE_LA_EMPRESA_MAS_GRANDE_QUE_ATENDEMOS, "Tres sedes con horarios distintos, canal virtual y operación de divisas regulada obligan a mapear más de lo normal.");
    const r = SalidaModeloAltoRendimiento.safeParse(m);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });


  it("acepta la cantidad esperada de procesos", () => {
    expect(SalidaModeloAltoRendimiento.safeParse(modelo(PROCESOS.sistematizacion.esperado_max)).success).toBe(true);
  });

  it("rechaza menos procesos que el mínimo de captura", () => {
    expect(SalidaModeloAltoRendimiento.safeParse(modelo(PROCESOS.captura.minimo - 1)).success).toBe(false);
  });

  it("PASARSE DE LO ESPERADO EN SILENCIO NO PASA: es lo que distingue expectativa de tope", () => {
    const r = SalidaModeloAltoRendimiento.safeParse(modelo(PROCESOS.sistematizacion.esperado_max + 3));
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("por_que_mas_de_lo_esperado");
  });

  it("pasarse DICIENDO POR QUÉ sí pasa: la expectativa no recorta el trabajo", () => {
    const r = SalidaModeloAltoRendimiento.safeParse(
      modelo(PROCESOS.sistematizacion.esperado_max + 3, "Tres sedes con horarios distintos y cuatro líneas de negocio reguladas obligan a mapear más de lo normal.")
    );
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("frena una lista desbocada en el tope absoluto", () => {
    const r = SalidaModeloAltoRendimiento.safeParse(modelo(PROCESOS.sistematizacion.tope_tecnico + 1, "porque sí, y esta razón es suficientemente larga"));
    expect(r.success).toBe(false);
  });

  it("las brechas admiten una sola", () => {
    const m = modelo(PROCESOS.sistematizacion.esperado_min);
    expect(SalidaModeloAltoRendimiento.safeParse({ ...m, las_tres_brechas_mayores: ["Una sola brecha grave, y es la que hay, no un cupo."] }).success).toBe(true);
  });
});

describe("los ayudantes de redacción no mienten sobre la política", () => {
  it("rango() escribe el rango real", () => {
    expect(rango(ESTRUCTURA)).toBe(`${ESTRUCTURA.minimo}-${ESTRUCTURA.tope}`);
  });

  it("expectativa() dice lo normal Y que pasarse exige explicarlo", () => {
    const t = expectativa(PROCESOS.sistematizacion);
    expect(t).toContain(String(PROCESOS.sistematizacion.esperado_min));
    expect(t).toContain(String(PROCESOS.sistematizacion.esperado_max));
    // La segunda mitad es la que evita que el modelo lea la expectativa como tope.
    expect(t).toContain("por_que_mas_de_lo_esperado");
  });

  it("z está disponible para los esquemas de prueba", () => {
    expect(typeof z.object).toBe("function");
  });
});
