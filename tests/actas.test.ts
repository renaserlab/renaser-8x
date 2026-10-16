/**
 * ACTAS DE ACEPTACIÓN (R14.2): QUIÉN ACEPTÓ QUÉ, CUÁNDO, QUÉ VERSIÓN Y CON QUÉ CONTENIDO EXACTO.
 *
 * Tres cosas que estas pruebas no dejan que vuelvan a fallar: la huella depende del contenido y no del
 * orden de las claves (dos JSON iguales con las claves al revés dan la misma huella); si la referencia
 * cambia después de aceptada, la verificación lo dice y el acta no se corrige; y el documento exportado
 * lleva la nota jurídica a la vista, no en una columna que nadie imprime.
 *
 * Con dobles: `crearActa` recibe un guardador falso. No hay base aquí; lo que la tabla hace lo prueba
 * tests/sql/medicion-versiones.test.ts sobre Postgres embebido.
 */
import { describe, it, expect } from "vitest";
import {
  jsonCanonico, hashContenido, prepararActa, crearActa, verificarActa, exportarActa, contenidoDeMedicion, rutaActa,
  aceptacionDelDueno, constanciaDeLaConsultora, claseDeActa, fechaActa,
  NOTA_JURIDICA, ALCANCE_ACTA, type Acta, type Guardador,
} from "@/lib/actas";
import { VITAL_POR_CLAVE } from "@/lib/metricas";
import type { Medicion } from "@/lib/medicion";

const EMPRESA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEDICION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DUENO = "11111111-1111-4111-8111-111111111111";

const medicion: Medicion = {
  id: MEDICION, tipo: "linea_base", numero: 0, fecha: "2026-05-01", version: 2, vigente: true, reemplaza_a: null, linea_base_id: null,
  valores: { venta_mes: 40000, ganancia_mes: 4000, caja_hoy: 8000 }, derivados: { margen: 10, diasAguante: 20, equilibrio: null },
  nota: null, motivo_version: "costos completos tras conciliar", periodo_desde: "2026-04-01", periodo_hasta: "2026-04-30",
  condiciones: { temporada: "normal", cambios: [] }, hash_contenido: "abc",
};

/** Un guardador que anota lo que se le pide insertar y lo devuelve, como haría la base. */
function guardadorFalso(opts: { error?: string } = {}): Guardador & { insertadas: Record<string, unknown>[] } {
  const insertadas: Record<string, unknown>[] = [];
  return {
    insertadas,
    from: () => ({
      insert: (fila: Record<string, unknown>) => {
        insertadas.push(fila);
        return { select: () => ({ single: async () => (opts.error ? { data: null, error: { message: opts.error } } : { data: { ...fila, created_at: "2026-10-13T10:00:00Z" }, error: null }) }) };
      },
    }),
  };
}

describe("la huella del contenido", () => {
  it("es la misma con las claves en distinto orden, en todos los niveles", () => {
    const a = { valores: { venta_mes: 40000, caja_hoy: 8000 }, version: 2, lista: [{ b: 1, a: 2 }] };
    const b = { lista: [{ a: 2, b: 1 }], version: 2, valores: { caja_hoy: 8000, venta_mes: 40000 } };
    expect(jsonCanonico(a)).toBe(jsonCanonico(b));
    expect(hashContenido(a)).toBe(hashContenido(b));
    expect(hashContenido(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cambia si cambia un solo número, y el orden de una lista sí importa", () => {
    expect(hashContenido({ venta_mes: 40000 })).not.toBe(hashContenido({ venta_mes: 40001 }));
    expect(hashContenido([1, 2])).not.toBe(hashContenido([2, 1]));
  });

  it("ignora claves con undefined (como JSON.stringify) y conserva null", () => {
    expect(jsonCanonico({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("el contenido de una medición se copia literal: no se recalcula nada", () => {
    const c = contenidoDeMedicion(medicion);
    expect(c.valores).toEqual(medicion.valores);
    expect(c.derivados).toEqual(medicion.derivados);
    expect(c.version).toBe(2);
    expect(c.periodo_desde).toBe("2026-04-01");
    expect(c.hash_contenido).toBe("abc");
  });
});

describe("prepararActa y crearActa", () => {
  const entrada = { company_id: EMPRESA, tipo: "linea_base" as const, referencia_id: MEDICION, version: 2, contenido: contenidoDeMedicion(medicion), aceptado_por: DUENO, nombre: "Rosa Quispe", rol: "dueno" };

  it("calcula la huella del contenido, liga la ruta imprimible y pone la nota jurídica", () => {
    const acta = prepararActa(entrada, new Date("2026-10-13T15:00:00Z"), "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(acta.hash_contenido).toBe(hashContenido(entrada.contenido));
    expect(acta.documento_path).toBe(rutaActa(acta.id));
    expect(acta.documento_path).toBe("/acta/cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(acta.nota_juridica).toBe(NOTA_JURIDICA);
    expect(acta.aceptado_at).toBe("2026-10-13T15:00:00.000Z");
    expect(acta).toMatchObject({ tipo: "linea_base", version: 2, aceptado_nombre: "Rosa Quispe", aceptado_rol: "dueno", aceptado_por: DUENO });
  });

  it("sin contenido no hay acta; un tipo inventado tampoco", () => {
    expect(() => prepararActa({ ...entrada, contenido: null })).toThrow(/sin contenido/);
    expect(() => prepararActa({ ...entrada, tipo: "contrato" as unknown as "plan" })).toThrow(/no válido/);
  });

  it("guarda exactamente la fila preparada y devuelve el acta", async () => {
    const sb = guardadorFalso();
    const acta = await crearActa(entrada, sb);
    expect(sb.insertadas).toHaveLength(1);
    expect(sb.insertadas[0]).toMatchObject({ company_id: EMPRESA, tipo: "linea_base", referencia_id: MEDICION, version: 2, hash_contenido: acta.hash_contenido, nota_juridica: NOTA_JURIDICA });
    expect(acta.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("si la base rechaza, el error dice por qué y no finge haber guardado", async () => {
    await expect(crearActa(entrada, guardadorFalso({ error: "relation actas_aceptacion does not exist" }))).rejects.toThrow(/No se pudo guardar el acta.*does not exist/);
  });
});

describe("verificarActa: lo que hay hoy frente a lo que se aceptó", () => {
  const acta = prepararActa({ company_id: EMPRESA, tipo: "linea_base", referencia_id: MEDICION, version: 2, contenido: contenidoDeMedicion(medicion), aceptado_por: DUENO, nombre: "Rosa", rol: "dueno" });

  it("coincide cuando la referencia no cambió, aunque las claves vengan en otro orden", () => {
    const actual = JSON.parse(JSON.stringify(contenidoDeMedicion(medicion)));
    const r = verificarActa(acta, { ...actual, valores: { caja_hoy: 8000, ganancia_mes: 4000, venta_mes: 40000 } });
    expect(r.resultado).toBe("coincide");
  });

  it("difiere si un valor cambió después, y lo dice sin tocar el acta", () => {
    const cambiado = contenidoDeMedicion({ ...medicion, valores: { ...medicion.valores, venta_mes: 45000 } });
    const r = verificarActa(acta, cambiado);
    expect(r.resultado).toBe("difiere");
    expect(r.motivo).toMatch(/cambió después de la aceptación/);
    expect(r.motivo).toMatch(/conserva lo que se aceptó/);
    expect(r.hashActa).toBe(acta.hash_contenido);
    expect(r.hashActual).not.toBe(acta.hash_contenido);
  });

  it("si además cambió la versión, nombra las dos", () => {
    const r = verificarActa(acta, contenidoDeMedicion({ ...medicion, version: 3 }));
    expect(r.motivo).toMatch(/se aceptó la 2 y hoy es la 3/);
  });
});

describe("exportarActa: el documento imprimible", () => {
  const acta: Acta = prepararActa(
    { company_id: EMPRESA, tipo: "linea_base", referencia_id: MEDICION, version: 2, contenido: contenidoDeMedicion(medicion), aceptado_por: DUENO, nombre: "Rosa <Quispe>", rol: "dueno" },
    new Date("2026-10-13T15:00:00Z"),
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  );
  const html = exportarActa(acta, { empresa: "Tienda Rosa & Cía" });

  it("lleva la nota jurídica a la vista, con el alcance de lo que no es", () => {
    expect(html).toContain("sujeto a revisión jurídica antes de uso contractual");
    expect(html).toContain(NOTA_JURIDICA);
    expect(html).toContain(ALCANCE_ACTA);
    expect(html).toMatch(/<strong>Nota jurídica<\/strong>/);
  });

  it("identifica a quien acepta, la fecha, la versión y la huella", () => {
    expect(html).toContain("Rosa &lt;Quispe&gt;");
    expect(html).toContain("Dueño de la empresa");
    expect(html).toMatch(/13 de octubre de 2026/);
    expect(html).toContain("versión 2");
    expect(html).toContain(acta.hash_contenido);
    expect(html).toContain(DUENO);
  });

  it("reproduce el contenido aceptado literal (JSON canónico) y lo muestra también en palabras", () => {
    expect(html).toContain(jsonCanonico(acta.contenido).replace(/"/g, "&quot;"));
    expect(html).toContain(VITAL_POR_CLAVE.get("venta_mes")!.nombre);
    expect(html).toContain("S/40,000");
    expect(html).toContain("del 1 abr 2026 al 30 abr 2026");
  });

  it("escapa lo que viene del usuario: un nombre con etiquetas no se convierte en HTML", () => {
    const malicioso = exportarActa({ ...acta, aceptado_nombre: "<script>alert(1)</script>" });
    expect(malicioso).not.toContain("<script>alert(1)</script>");
    expect(malicioso).toContain("&lt;script&gt;");
  });

  it("es un documento completo y autocontenido, ligado a su ruta", () => {
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('lang="es"');
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).toContain("/acta/cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  });

  it("si la referencia cambió después, el documento lo advierte; si coincide, lo confirma", () => {
    const difiere = exportarActa(acta, { verificacion: verificarActa(acta, { otro: 1 }) });
    expect(difiere).toMatch(/Atención: La referencia cambió después/);
    const coincide = exportarActa(acta, { verificacion: verificarActa(acta, acta.contenido) });
    expect(coincide).toMatch(/Comprobado hoy/);
  });
});

/**
 * LA ACEPTACIÓN QUE CUENTA PARA EL DUEÑO ES LA DEL DUEÑO (remate L, 13-10-2026). La pantalla del dueño
 * tomaba el acta más reciente de cualquier rol: si la consultora levantaba la suya, él veía «Aceptado» y
 * se quedaba sin botón para aceptar. Estas pruebas fijan la regla pura que ahora deciden las dos pantallas.
 */
describe("quién aceptó: la aceptación del dueño no es la constancia de la consultora", () => {
  const CONSULTORA = "22222222-2222-4222-8222-222222222222";
  const OTRA_VERSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  let n = 0;
  const acta = (rol: string | null, cuando: string, referencia = MEDICION): Acta => {
    n += 1;
    return prepararActa(
      { company_id: EMPRESA, tipo: "linea_base", referencia_id: referencia, version: 2, contenido: contenidoDeMedicion(medicion), aceptado_por: rol === "consultor" ? CONSULTORA : DUENO, nombre: rol === "consultor" ? "Consultora" : "Rosa Quispe", rol },
      new Date(cuando),
      `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, "0")}`
    );
  };

  it("con solo el acta de la consultora, el dueño todavía NO aceptó: hay constancia, no aceptación", () => {
    const deLaConsultora = acta("consultor", "2026-10-13T15:00:00Z");
    expect(aceptacionDelDueno([deLaConsultora], MEDICION)).toBeNull();
    expect(constanciaDeLaConsultora([deLaConsultora], MEDICION)).toBe(deLaConsultora);
  });

  it("con las dos, lo aceptó el dueño, aunque la constancia de la consultora sea posterior y venga primero en la lista", () => {
    const delDueno = acta("dueno", "2026-10-13T15:00:00Z");
    const deLaConsultora = acta("consultor", "2026-10-14T09:00:00Z");
    // La carga las trae la más reciente primero: antes ganaba la de la consultora por ir en [0].
    const lista = [deLaConsultora, delDueno];
    expect(aceptacionDelDueno(lista, MEDICION)).toBe(delDueno);
    expect(aceptacionDelDueno(lista, MEDICION)?.aceptado_rol).toBe("dueno");
    expect(constanciaDeLaConsultora(lista, MEDICION)).toBe(deLaConsultora);
  });

  it("sin ninguna acta no hay aceptación ni constancia", () => {
    expect(aceptacionDelDueno([], MEDICION)).toBeNull();
    expect(constanciaDeLaConsultora([], MEDICION)).toBeNull();
  });

  it("«cliente» cuenta como dueño; un socio, un rol sin registrar o uno desconocido no: la falta de dato no es «aceptado»", () => {
    expect(aceptacionDelDueno([acta("cliente", "2026-10-13T15:00:00Z")], MEDICION)).not.toBeNull();
    for (const rol of ["socio", null, "", "administrador"]) expect(aceptacionDelDueno([acta(rol, "2026-10-13T15:00:00Z")], MEDICION), String(rol)).toBeNull();
    expect(claseDeActa({ aceptado_rol: "dueno" })).toBe("dueno");
    expect(claseDeActa({ aceptado_rol: " Cliente " })).toBe("dueno");
    expect(claseDeActa({ aceptado_rol: "consultor" })).toBe("consultora");
    expect(claseDeActa({ aceptado_rol: "socio" })).toBe("otro");
    expect(claseDeActa({ aceptado_rol: null })).toBe("otro");
  });

  it("va por referencia: aceptar una versión del punto de partida no acepta la siguiente", () => {
    const deLaVersionAnterior = acta("dueno", "2026-09-01T15:00:00Z", OTRA_VERSION);
    expect(aceptacionDelDueno([deLaVersionAnterior], MEDICION)).toBeNull();
    expect(aceptacionDelDueno([deLaVersionAnterior], OTRA_VERSION)).toBe(deLaVersionAnterior);
  });

  it("si el dueño aceptó dos veces, vale la más reciente, venga en el orden que venga", () => {
    const primera = acta("dueno", "2026-10-10T15:00:00Z");
    const segunda = acta("dueno", "2026-10-13T15:00:00Z");
    expect(aceptacionDelDueno([primera, segunda], MEDICION)).toBe(segunda);
    expect(aceptacionDelDueno([segunda, primera], MEDICION)).toBe(segunda);
  });

  it("el día del acta es el de Lima: a las 01:30 UTC del 14 todavía es 13 de octubre allí", () => {
    expect(fechaActa("2026-10-14T01:30:00Z")).toMatch(/^13 /);
    expect(fechaActa("2026-10-14T01:30:00Z")).toMatch(/2026/);
    expect(fechaActa(null)).toBe("sin fecha");
    expect(fechaActa("ayer")).toBe("sin fecha");
  });
});
