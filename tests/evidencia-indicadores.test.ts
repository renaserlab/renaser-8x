import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { reconocerPorBytes, MAX_EVIDENCIA_BYTES, validarArchivo, rutaStorage } from "@/lib/archivos";
import { SalidaMedidor } from "@/lib/schemas";
import { PROMPT_MEDIDOR } from "@/lib/ai/agents/medidor";
import { GUARDIA } from "@/lib/rules/patrones";
import { mesCerradoMasReciente, ultimosMeses } from "@/lib/temporadas";

const conCabecera = (...bytes: number[]) => {
  const b = new Uint8Array(16);
  bytes.forEach((v, i) => (b[i] = v));
  return b;
};

/**
 * Punto 5: la prueba de que algo se hizo. El campo `evidencia` de las acciones DESCRIBÍA qué prueba
 * haría falta y no guardaba nada. Sin prueba, "se implementó" es una afirmación, no un hecho.
 */
describe("evidencia: qué archivo se acepta", () => {
  it("reconoce las fotos por sus bytes, no por lo que diga el navegador", () => {
    expect(reconocerPorBytes(conCabecera(0x89, 0x50, 0x4e, 0x47))?.mime).toBe("image/png");
    expect(reconocerPorBytes(conCabecera(0xff, 0xd8, 0xff))?.mime).toBe("image/jpeg");
    expect(reconocerPorBytes(conCabecera(0x25, 0x50, 0x44, 0x46))?.mime).toBe("application/pdf");
  });

  it("acepta HEIC: el celular de un dueño peruano lo manda sin avisar", () => {
    const b = conCabecera(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63);
    expect(reconocerPorBytes(b)?.mime).toBe("image/heic");
  });

  it("las fotos se clasifican como foto y el PDF como documento", () => {
    expect(reconocerPorBytes(conCabecera(0x89, 0x50, 0x4e, 0x47))?.familia).toBe("foto");
    expect(reconocerPorBytes(conCabecera(0x25, 0x50, 0x44, 0x46))?.familia).toBe("documento");
  });

  it("un archivo que MIENTE sobre lo que es no pasa", () => {
    // Un ejecutable renombrado a .png: la cabecera lo delata.
    expect(reconocerPorBytes(conCabecera(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
  });

  it("el SVG no entra: puede llevar script dentro", () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>");
    expect(reconocerPorBytes(svg)).toBeNull();
  });

  it("un archivo demasiado corto para tener cabecera no pasa", () => {
    expect(reconocerPorBytes(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it("el tope de una evidencia deja pasar una foto de celular pero no un video", () => {
    expect(MAX_EVIDENCIA_BYTES).toBeGreaterThanOrEqual(4 * 1024 * 1024);
    expect(MAX_EVIDENCIA_BYTES).toBeLessThanOrEqual(12 * 1024 * 1024);
  });

  it("la ruta siempre cuelga de la carpeta de la empresa y nunca acepta una ruta del cliente", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const r = rutaStorage(id, "../../otra-empresa/robo.png", 1);
    expect(r.startsWith(`${id}/`)).toBe(true);
    expect(r).not.toContain("..");
  });

  it("la validación que ya existía sigue funcionando: no se rompió al añadir la de bytes", () => {
    expect(validarArchivo({ nombre: "foto.png", mime: "image/png", bytes: 1000 }).ok).toBe(true);
    expect(validarArchivo({ nombre: "vacio.png", mime: "image/png", bytes: 0 }).ok).toBe(false);
  });
});

describe("evidencia: las reglas viven en la ruta, no solo en la interfaz", () => {
  const src = readFileSync(path.join(process.cwd(), "src/app/api/companies/[id]/evidencia/route.ts"), "utf8");

  it("comprueba que la acción sea de esta empresa antes de colgarle nada", () => {
    expect(src).toContain("Esa acción no es de esta empresa");
  });

  it("no deja dar por verificada una acción sin al menos una prueba", () => {
    expect(src).toMatch(/count.*=== 0|\(count \?\? 0\) === 0/);
    expect(src).toContain("sube al menos una prueba");
  });

  it("guarda quién verificó y cuándo: 'hecho' deja de ser una casilla anónima", () => {
    expect(src).toContain("verificado_por");
    expect(src).toContain("verificado_at");
  });
});

/**
 * Punto 6: lo que se repite se mide. En el catálogo estaba escrito que "las incidencias son la mina
 * de KPIs" y no había una sola línea que las extrajera.
 */
describe("el medidor: incidencias que se vuelven números", () => {
  it("lleva la guardia contra instrucciones incrustadas, como los demás agentes", () => {
    expect(PROMPT_MEDIDOR.startsWith(GUARDIA)).toBe(true);
  });

  it("prohíbe inventar cuando no hay incidencias contadas", () => {
    expect(PROMPT_MEDIDOR).toMatch(/indicadores: \[\] en vez de inventar/);
  });

  it("exige que el dueño pueda contarlo con lo que YA tiene", () => {
    expect(PROMPT_MEDIDOR).toContain("con lo que YA tiene");
    expect(PROMPT_MEDIDOR).toMatch(/es una tarea mas, no una medicion/);
  });

  it("prohíbe los indicadores de vanidad y la jerga", () => {
    expect(PROMPT_MEDIDOR).toMatch(/vanidad/);
    expect(PROMPT_MEDIDOR).toMatch(/Nunca "KPI", "tasa" ni "ratio"/);
  });

  it("prohíbe inventar metas redondas porque suenan bien", () => {
    expect(PROMPT_MEDIDOR).toMatch(/Nunca inventes una meta redonda/);
  });

  it("el esquema acepta como máximo seis: un tablero de veinte no se mira", () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({
      clave: `x_${i}`, nombre: "Devoluciones del mes", como_se_mide: "contar los reclamos del cuaderno",
      unidad: "numero", mejor_si: "baja", meta_valor: null, meta_texto: null, frecuencia: "mensual", origen_texto: null,
    }));
    expect(SalidaMedidor.safeParse({ indicadores: seis }).success).toBe(true);
    expect(SalidaMedidor.safeParse({ indicadores: [...seis, seis[0]] }).success).toBe(false);
  });

  it("una unidad o frecuencia rara no rompe: cae en el valor por defecto", () => {
    const r = SalidaMedidor.parse({
      indicadores: [{ clave: "a_b", nombre: "Algo", como_se_mide: "se cuenta a mano cada mes", unidad: "bananas", mejor_si: "?", frecuencia: "trimestral", meta_valor: null, meta_texto: null, origen_texto: null }],
    });
    expect(r.indicadores[0]!.unidad).toBe("numero");
    expect(r.indicadores[0]!.mejor_si).toBe("baja");
    expect(r.indicadores[0]!.frecuencia).toBe("mensual");
  });

  it("no acepta un indicador sin explicar cómo se mide", () => {
    const r = SalidaMedidor.safeParse({ indicadores: [{ clave: "a_b", nombre: "Algo", como_se_mide: "x", unidad: "numero", mejor_si: "baja", frecuencia: "mensual", meta_valor: null, meta_texto: null, origen_texto: null }] });
    expect(r.success).toBe(false);
  });
});

describe("el manejador no inventa números de la nada", () => {
  const src = readFileSync(path.join(process.cwd(), "src/lib/jobs/handlers/indicadores.ts"), "utf8");

  it("sin incidencias ni hallazgos no propone nada", () => {
    expect(src).toContain("todavía no hay incidencias ni hallazgos");
  });

  it("los indicadores nacen propuestos, no activos: el dueño decide cuáles adopta", () => {
    expect(src).toContain('estado: "propuesto"');
  });

  it("normaliza la clave y no duplica uno que ya existe", () => {
    expect(src).toContain("normalizarClave");
    expect(src).toContain("existentes.has(clave)");
  });

  it("trata el contenido de la empresa como dato, no como instrucciones", () => {
    expect(src).toContain("comoDato");
  });
});

describe("el periodo que se ofrece anotar", () => {
  it("es siempre un mes cerrado, nunca el mes en curso", () => {
    const ofrecido = mesCerradoMasReciente();
    expect(ofrecido).toBe(ultimosMeses(new Date(), 1)[0]!.periodo);
    const ahora = new Date();
    expect(ofrecido).not.toBe(`${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`);
  });
});
