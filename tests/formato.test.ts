/**
 * FORMATO POR EMPRESA: SE AFIRMA LO QUE AQUÍ SE PRUEBA, NADA MÁS.
 *
 * El código da Perú por hecho: «S/», es-PE y hora de Lima. `companies` ya declara pais, moneda, idioma y
 * zona_horaria, y `src/lib/formato.ts` es el único sitio que convierte esa declaración en texto. Estas pruebas
 * fijan lo que está probado (PEN, USD, MXN, COP, CLP, EUR; Lima frente a Ciudad de México en la medianoche) y lo
 * que NO se promete: el único idioma disponible es «es», y la pantalla lo dice en vez de disimularlo.
 *
 * Tres niveles, cada uno rotulado. (1) Las funciones, puras, con el Intl de Node. (2) La pantalla dibujada en
 * servidor con react-dom: prueba lo que se pinta, no lo que pasa al pulsar; nadie la abrió en un navegador.
 * (3) La ruta ejecutada contra Postgres embebido (PGlite) con la migración real aplicada: prueba las columnas,
 * los valores por defecto, quién puede y qué se guarda. NO es Supabase: sin PostgREST ni Auth, y `supabaseAdmin`
 * es un adaptador mínimo escrito aquí. La sesión es un doble.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PGlite } from "@electric-sql/pglite";
import { baseConEsquema } from "./sql/aplicar";

type Fila = Record<string, unknown>;
const doble = vi.hoisted(() => ({ sb: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => {
    if (!doble.sb) throw new Error("Esta prueba no declaró una base: la ruta no debió llegar a consultarla.");
    return doble.sb;
  },
}));
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), perfilApi: vi.fn() }));
vi.mock("@/lib/auditoria", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auditoria")>()), registrar: vi.fn(async () => {}) }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("@/lib/limite", () => ({
  CUPO: { escritura: { max: 100, ventana: 60 }, ia: { max: 100, ventana: 60 }, subida: { max: 100, ventana: 60 } },
  limitar: vi.fn(async () => ({ permitido: true, reiniciaEn: 0 })),
}));

import {
  porDefecto, moneda, numero, fecha, hora, fechaHora, simboloMoneda, configDe, validarConfig, esMonedaValida, esZonaValida, esPaisValido,
  ConfiguracionInvalida, SIN_DATO, SIN_FECHA, SIN_HORA, MENSAJE, PAISES, MONEDAS, IDIOMAS, IDIOMAS_DISPONIBLES, ZONAS, NOTA_IDIOMA_NO_DISPONIBLE, localidadDe, ejemplo,
  cambiosDe, proponerPorPais, type ConfigEmpresa,
} from "@/lib/formato";
import { GET, PATCH } from "@/app/api/companies/[id]/configuracion/route";
import { ConfiguracionEmpresa, CamposConfiguracion } from "@/components/consultor/ConfiguracionEmpresa";
import { perfilApi, type Perfil } from "@/lib/auth";
import { registrar } from "@/lib/auditoria";
import { registrarError } from "@/lib/errores";

const PE: ConfigEmpresa = porDefecto;
const MX: ConfigEmpresa = { pais: "MX", moneda: "MXN", idioma: "es", zona_horaria: "America/Mexico_City" };
const US: ConfigEmpresa = { pais: "US", moneda: "USD", idioma: "es", zona_horaria: "America/New_York" };
const CO: ConfigEmpresa = { pais: "CO", moneda: "COP", idioma: "es", zona_horaria: "America/Bogota" };
const CL: ConfigEmpresa = { pais: "CL", moneda: "CLP", idioma: "es", zona_horaria: "America/Santiago" };
const ES: ConfigEmpresa = { pais: "ES", moneda: "EUR", idioma: "es", zona_horaria: "Europe/Madrid" };

describe("porDefecto: sin declaración, rige Perú", () => {
  it("es exactamente lo que la migración pone por defecto", () => {
    expect(porDefecto).toEqual({ pais: "PE", moneda: "PEN", idioma: "es", zona_horaria: "America/Lima" });
    expect(localidadDe()).toBe("es-PE");
  });
  it("nadie lo cambia por accidente: está congelado, y quien lo necesita distinto hace una copia", () => {
    expect(Object.isFrozen(porDefecto)).toBe(true);
    expect(() => { (porDefecto as ConfigEmpresa).moneda = "USD"; }).toThrow(TypeError);
    expect(configDe(null)).not.toBe(porDefecto);
  });
  it("configDe rellena con Perú lo que falte y tolera filas sin columnas o nulas", () => {
    expect(configDe(null)).toEqual(porDefecto);
    expect(configDe({})).toEqual(porDefecto);
    expect(configDe({ pais: null, moneda: null, idioma: null, zona_horaria: null })).toEqual(porDefecto);
    expect(configDe({ pais: "", moneda: "  ", idioma: "", zona_horaria: "" })).toEqual(porDefecto);
    expect(configDe({ pais: " MX ", moneda: "MXN", idioma: "es", zona_horaria: "America/Mexico_City" })).toEqual(MX);
    expect(configDe({ moneda: "USD" })).toEqual({ ...porDefecto, moneda: "USD" });
  });
  it("configDe arregla lo que es solo de forma y no adivina lo que no es un código", () => {
    expect(configDe({ pais: "mx", moneda: "mxn", idioma: "ES", zona_horaria: " America/Mexico_City " })).toEqual(MX);
    // «Perú» no es un código: pasa tal cual y es la función de formato la que lo rechaza con su mensaje.
    expect(configDe({ pais: "Perú" }).pais).toBe("Perú");
  });
});

describe("moneda: PEN con «S/» y separadores peruanos", () => {
  it("sin decimales por defecto, con coma de miles y «S/» delante", () => {
    expect(moneda(1234567.5, PE)).toBe("S/ 1,234,568");
    expect(moneda(8000, PE)).toBe("S/ 8,000");
    expect(moneda(0, PE)).toBe("S/ 0");
  });
  it("con decimales cuando se piden: punto decimal, no coma", () => {
    expect(moneda(1234.5, PE, { decimales: 2 })).toBe("S/ 1,234.50");
  });
  it("un negativo conserva el signo delante del símbolo", () => {
    expect(moneda(-1234.6, PE)).toBe("-S/ 1,235");
  });
  it("lo que redondea a cero se escribe cero, sin signo: «-S/ 0» no existe", () => {
    expect(moneda(-0.4, PE)).toBe("S/ 0");
    expect(moneda(-0.004, PE, { decimales: 2 })).toBe("S/ 0.00");
    expect(moneda(-0.5, PE)).toBe("-S/ 1");
    expect(numero(-0.001, PE)).toBe("0");
    expect(moneda(-0.4, ES)).toBe("0 €");
  });
  it("el símbolo solo, para etiquetas", () => {
    expect(simboloMoneda(PE)).toBe("S/");
  });
});

describe("moneda: USD y MXN correctos", () => {
  it("dólares en una empresa de Estados Unidos: «$» pegado y separadores anglosajones", () => {
    expect(moneda(1234567.5, US, { decimales: 2 })).toBe("$1,234,567.50");
    expect(simboloMoneda(US)).toBe("$");
  });
  it("pesos mexicanos en México: «$» pegado, coma de miles, punto decimal", () => {
    expect(moneda(1234567.5, MX, { decimales: 2 })).toBe("$1,234,567.50");
    expect(moneda(1234567.5, MX)).toBe("$1,234,568");
    expect(simboloMoneda(MX)).toBe("$");
  });
  it("dólares en una empresa peruana se escriben con el código, no con un «$» que se confunde con pesos", () => {
    const texto = moneda(1234567.5, { ...PE, moneda: "USD" });
    expect(texto.startsWith("USD")).toBe(true);
    expect(texto).toContain("1,234,568");
    expect(moneda(1234.5, { ...MX, moneda: "USD" }, { decimales: 2 })).toBe("USD 1,234.50");
    expect(simboloMoneda({ ...PE, moneda: "USD" })).toBe("USD");
  });
  it("Colombia, Chile y España: cambian el separador de miles y el lugar del símbolo", () => {
    expect(moneda(1234567.5, CO)).toBe("$ 1.234.568");
    expect(moneda(1234567.5, CL)).toBe("$1.234.568");
    expect(moneda(1234567.5, ES, { decimales: 2 })).toBe("1.234.567,50 €");
    expect(simboloMoneda(ES)).toBe("€");
  });
  it("montos de cuatro cifras, los de todos los días: cada país los escribe a su manera", () => {
    expect(moneda(8000, MX)).toBe("$8,000");
    expect(moneda(8000, US)).toBe("$8,000");
    expect(moneda(8000, CO)).toBe("$ 8.000");
    expect(moneda(8000, CL)).toBe("$8.000");
    // En España un número de cuatro cifras va sin separador: es la regla del español de allá, no un fallo.
    expect(moneda(8000, ES)).toBe("8000 €");
    expect(moneda(18000, ES)).toBe("18.000 €");
  });
  it("no deja espacios irrompibles: el texto es predecible y copiable", () => {
    for (const cfg of [PE, CO, ES]) expect(moneda(1500, cfg)).not.toMatch(/[\u00A0\u202F]/);
    expect(fecha(new Date("2026-10-14T05:30:00Z"), PE, "larga")).not.toMatch(/[\u00A0\u202F]/);
  });
});

describe("moneda: la falta de dato nunca es cero", () => {
  it("nulo, indefinido o no numérico → «sin dato», jamás «S/ 0»", () => {
    expect(moneda(null, PE)).toBe(SIN_DATO);
    expect(moneda(undefined, PE)).toBe(SIN_DATO);
    expect(moneda(Number.NaN, PE)).toBe(SIN_DATO);
    expect(moneda(Number.POSITIVE_INFINITY, PE)).toBe(SIN_DATO);
    expect(moneda("8000" as unknown as number, PE)).toBe(SIN_DATO);
    expect(numero(null, PE)).toBe(SIN_DATO);
  });
});

describe("moneda: un código inválido da un error claro, no un texto raro", () => {
  it("«ABC» no es una moneda aunque Intl lo imprimiría como «ABC 1.00»", () => {
    expect(esMonedaValida("ABC")).toBe(false);
    expect(() => moneda(100, { ...PE, moneda: "ABC" })).toThrow(ConfiguracionInvalida);
    expect(() => moneda(100, { ...PE, moneda: "ABC" })).toThrow(MENSAJE.moneda);
  });
  it("«soles», «pen» o vacío tampoco: tres letras mayúsculas o nada", () => {
    expect(esMonedaValida("soles")).toBe(false);
    expect(esMonedaValida("pen")).toBe(false);
    expect(esMonedaValida("")).toBe(false);
    expect(esMonedaValida(null)).toBe(false);
    expect(() => simboloMoneda({ ...PE, moneda: "soles" })).toThrow(ConfiguracionInvalida);
  });
  it("el error dice qué campo y qué valor llegó", () => {
    try {
      moneda(1, { ...PE, moneda: "XYZ1" });
      expect.unreachable("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfiguracionInvalida);
      expect((e as ConfiguracionInvalida).campo).toBe("moneda");
      expect((e as Error).message).toContain("XYZ1");
    }
  });
  it("la moneda mala se dice aunque el valor falte: la configuración rota no se esconde detrás de un «sin dato»", () => {
    expect(() => moneda(null, { ...PE, moneda: "ABC" })).toThrow(ConfiguracionInvalida);
  });
  it("cualquier código ISO que Intl reconozca pasa, esté o no en nuestra lista", () => {
    for (const c of ["PEN", "USD", "MXN", "COP", "CLP", "EUR", "BRL", "JPY", "GBP"]) expect(esMonedaValida(c)).toBe(true);
    expect(moneda(1000, { ...PE, moneda: "JPY" })).toContain("1,000");
  });
  it("decimales imposibles: el error está en castellano y dice qué llegó", () => {
    expect(() => moneda(10, PE, { decimales: -1 })).toThrow(/«decimales» debe ser un entero entre 0 y 6\. Se recibió «-1»/);
    expect(() => moneda(10, PE, { decimales: 25 })).toThrow(RangeError);
    expect(() => numero(10, PE, { decimales: 1.5 })).toThrow(RangeError);
  });
});

describe("país e idioma: lo que no es un código se rechaza; el idioma que no está disponible no cambia nada", () => {
  it("un país escrito a mano, en minúsculas o inexistente da un error claro, no un formato distinto sin avisar", () => {
    // Antes: «Perú» lanzaba un RangeError en inglés y «XX» escribía «100 PEN» con el formato de España.
    for (const pais of ["Perú", "pe", "XX", "ZZ", "!!", "PER"]) {
      expect(esPaisValido(pais), pais).toBe(false);
      expect(() => moneda(100, { ...PE, pais }), pais).toThrow(ConfiguracionInvalida);
      expect(() => fecha(new Date(0), { ...PE, pais }), pais).toThrow(MENSAJE.pais);
    }
    try {
      numero(1, { ...PE, pais: "Perú" });
      expect.unreachable("debió lanzar");
    } catch (e) {
      expect((e as ConfiguracionInvalida).campo).toBe("pais");
      expect((e as Error).message).toContain("«Perú»");
    }
  });
  it("un país real que no está en la lista de los selectores sí se puede ESCRIBIR (Brasil), aunque no se pueda guardar", () => {
    expect(esPaisValido("BR")).toBe(true);
    expect(moneda(1234.5, { pais: "BR", moneda: "BRL", idioma: "es", zona_horaria: "America/Sao_Paulo" }, { decimales: 2 })).toBe("R$1,234.50");
    expect(validarConfig({ pais: "BR" })).toEqual({ ok: false, campo: "pais", error: MENSAJE.pais });
  });
  it("un país vacío es «no declarado»: rige Perú", () => {
    expect(localidadDe({ ...PE, pais: "" })).toBe("es-PE");
    expect(moneda(100, { ...PE, pais: "" })).toBe("S/ 100");
  });
  it("una fila con idioma «en» se escribe en español: no hay media pantalla en inglés que nadie probó", () => {
    const instante = new Date("2026-10-14T05:30:00Z");
    expect(localidadDe({ ...PE, idioma: "en" })).toBe("es-PE");
    expect(fecha(instante, { ...PE, idioma: "en" }, "larga")).toBe("14 de octubre de 2026");
    expect(moneda(1234.5, { ...PE, idioma: "en" }, { decimales: 2 })).toBe("S/ 1,234.50");
    expect(moneda(1234.5, { ...PE, idioma: "español" })).toBe("S/ 1,235");
  });
});

describe("numero: separadores del país, sin moneda", () => {
  it("Perú y México con coma de miles y punto decimal; Colombia al revés", () => {
    expect(numero(1234567.891, PE)).toBe("1,234,567.89");
    expect(numero(1234567.891, MX)).toBe("1,234,567.89");
    expect(numero(1234567.891, CO)).toBe("1.234.567,89");
  });
  it("hasta dos decimales por defecto; fijos cuando se piden", () => {
    expect(numero(0.3, PE)).toBe("0.3");
    expect(numero(12, PE)).toBe("12");
    expect(numero(12, PE, { decimales: 1 })).toBe("12.0");
  });
});

describe("fecha y hora: la zona horaria de la empresa decide el día", () => {
  // 05:30 UTC: en Lima (UTC-5) ya es 14 a las 00:30; en Ciudad de México (UTC-6) sigue siendo 13 a las 23:30.
  const instante = new Date("2026-10-14T05:30:00Z");
  it("el mismo instante es otro día a cada lado de la medianoche", () => {
    expect(fecha(instante, PE)).toBe("14/10/2026");
    expect(fecha(instante, MX)).toBe("13/10/2026");
    expect(hora(instante, PE)).toBe("00:30");
    expect(hora(instante, MX)).toBe("23:30");
    expect(fechaHora(instante, PE)).toBe("14/10/2026 00:30");
    expect(fechaHora(instante, MX)).toBe("13/10/2026 23:30");
  });
  it("un minuto antes y un minuto después de la medianoche de cada ciudad", () => {
    // Medianoche de Lima = 05:00 UTC; medianoche de Ciudad de México = 06:00 UTC.
    expect(fechaHora("2026-10-14T04:59:00Z", PE)).toBe("13/10/2026 23:59");
    expect(fechaHora("2026-10-14T05:00:00Z", PE)).toBe("14/10/2026 00:00");
    expect(fechaHora("2026-10-14T05:59:00Z", MX)).toBe("13/10/2026 23:59");
    expect(fechaHora("2026-10-14T06:00:00Z", MX)).toBe("14/10/2026 00:00");
  });
  it("la forma larga escribe el mes en español", () => {
    expect(fecha(instante, PE, "larga")).toBe("14 de octubre de 2026");
    expect(fecha(instante, MX, "larga")).toBe("13 de octubre de 2026");
  });
  it("la forma «mes» sirve a los periodos: octubre de 2026", () => {
    expect(fecha("2026-10", PE, "mes")).toBe("octubre de 2026");
    expect(fecha(instante, MX, "mes")).toBe("octubre de 2026");
    // 1 de noviembre a las 02:00 UTC todavía es octubre en Lima.
    expect(fecha("2026-11-01T02:00:00Z", PE, "mes")).toBe("octubre de 2026");
  });
  it("acepta cadenas ISO y marcas de tiempo, y una fecha ilegible da «sin fecha», no «Invalid Date»", () => {
    expect(fecha("2026-10-14T05:30:00Z", PE)).toBe("14/10/2026");
    expect(fecha(instante.getTime(), MX)).toBe("13/10/2026");
    expect(fecha("no es fecha", PE)).toBe(SIN_FECHA);
    expect(fecha(null, PE)).toBe(SIN_FECHA);
    expect(fecha("", PE)).toBe(SIN_FECHA);
    expect(fecha(new Date(Number.NaN), PE)).toBe(SIN_FECHA);
    expect(fechaHora(undefined, PE)).toBe(SIN_FECHA);
    expect(hora(null, PE)).toBe(SIN_FECHA);
  });
  it("la hora es de 24 horas: la medianoche es 00, no 24 ni 12 a. m.", () => {
    expect(hora(new Date("2026-10-14T05:00:00Z"), PE)).toBe("00:00");
    expect(hora(new Date("2026-10-14T17:05:00Z"), PE)).toBe("12:05");
    expect(hora(new Date("2026-10-14T06:00:00Z"), MX)).toBe("00:00");
  });
  it("una zona inválida da un error claro", () => {
    expect(esZonaValida("America/Nowhere")).toBe(false);
    expect(esZonaValida("Lima")).toBe(false);
    expect(esZonaValida("")).toBe(false);
    expect(() => fecha(instante, { ...PE, zona_horaria: "America/Nowhere" })).toThrow(ConfiguracionInvalida);
    expect(() => fecha(instante, { ...PE, zona_horaria: "America/Nowhere" })).toThrow(MENSAJE.zona_horaria);
    expect(() => fechaHora(null, { ...PE, zona_horaria: "Lima" })).toThrow(ConfiguracionInvalida);
  });
  it("Buenos Aires vale aunque la lista publicada de Intl use otro alias", () => {
    expect(esZonaValida("America/Argentina/Buenos_Aires")).toBe(true);
  });
});

describe("un día del calendario no es un instante: no se le restan horas", () => {
  it("«2026-10-14» es 14 en Lima y en Ciudad de México (leído como instante salía 13 en toda América)", () => {
    expect(fecha("2026-10-14", PE)).toBe("14/10/2026");
    expect(fecha("2026-10-14", MX)).toBe("14/10/2026");
    expect(fecha("2026-10-14", ES)).toBe("14/10/2026");
    expect(fecha("2026-10-14", PE, "larga")).toBe("14 de octubre de 2026");
  });
  it("un periodo «2026-10» es octubre, no el 30 de setiembre", () => {
    expect(fecha("2026-10", PE, "mes")).toBe("octubre de 2026");
    expect(fecha("2026-10", PE)).toBe("01/10/2026");
    expect(fecha("2026-01", MX, "mes")).toBe("enero de 2026");
  });
  it("un día no tiene hora: no se le inventa una", () => {
    expect(hora("2026-10-14", PE)).toBe(SIN_HORA);
    expect(fechaHora("2026-10-14", MX)).toBe("14/10/2026");
  });
  it("un día que no existe da «sin fecha»: el 30 de febrero no se convierte en 2 de marzo", () => {
    expect(fecha("2026-02-30", PE)).toBe(SIN_FECHA);
    expect(fecha("2026-02-29", PE)).toBe(SIN_FECHA);
    expect(fecha("2024-02-29", PE)).toBe("29/02/2024");
    expect(fecha("2026-13", PE)).toBe(SIN_FECHA);
    expect(fecha("2026-02-30T10:00:00Z", PE)).toBe(SIN_FECHA);
    expect(fecha("2026-10-14T25:00:00Z", PE)).toBe(SIN_FECHA);
  });
});

describe("leer una fecha no depende de la máquina", () => {
  it("con hora y sin zona se lee como UTC, igual en un servidor en UTC que en un equipo en Lima", () => {
    expect(fechaHora("2026-10-14T05:30:00", PE)).toBe(fechaHora("2026-10-14T05:30:00Z", PE));
    expect(fechaHora("2026-10-14T05:30:00", PE)).toBe("14/10/2026 00:30");
    expect(fechaHora("2026-10-14T05:30", MX)).toBe("13/10/2026 23:30");
  });
  it("entiende la forma en que Postgres escribe un instante: espacio, microsegundos y zona corta", () => {
    expect(fechaHora("2026-10-14 05:30:00+00", PE)).toBe("14/10/2026 00:30");
    expect(fechaHora("2026-10-14 05:30:00.123456-05", PE)).toBe("14/10/2026 05:30");
    expect(fechaHora("2026-10-14T05:30:00+00:00", MX)).toBe("13/10/2026 23:30");
    expect(fechaHora("2026-10-14T05:30+0530", PE)).toBe("13/10/2026 19:00");
  });
  it("no adivina fechas escritas a la manera de cada país: «10/11/2026» no es ni octubre ni noviembre", () => {
    expect(fecha("10/11/2026", PE)).toBe(SIN_FECHA);
    expect(fecha("14 oct 2026", PE)).toBe(SIN_FECHA);
    expect(fecha("October 14, 2026", PE)).toBe(SIN_FECHA);
  });
});

describe("los formateadores se construyen una vez", () => {
  it("cinco mil fechas con hora caben en un momento (sin guardar el formateador tardaban más de cinco segundos)", () => {
    const base = Date.parse("2026-01-01T00:00:00Z");
    const t0 = performance.now();
    let ultima = "";
    for (let i = 0; i < 5000; i++) ultima = fechaHora(base + i * 3_600_000, MX);
    const ms = performance.now() - t0;
    // 4.999 horas después del 1 de enero a las 00:00 UTC son las 07:00 UTC del 28 de julio: la 01:00 en Ciudad de México.
    expect(ultima).toBe("28/07/2026 01:00");
    // Medido el 13-10-2026 en esta máquina: unos 35 ms guardando, unos 5.300 ms construyendo cada vez.
    expect(ms).toBeLessThan(1500);
  });
});

describe("validarConfig: lo que entra a la base pasa por aquí", () => {
  it("completa sobre Perú lo que no se manda", () => {
    expect(validarConfig({})).toEqual({ ok: true, config: porDefecto });
    expect(validarConfig({ moneda: " usd " })).toEqual({ ok: true, config: { ...porDefecto, moneda: "USD" } });
  });
  it("un idioma que no está disponible se rechaza con la razón, aunque sea un idioma real", () => {
    const r = validarConfig({ idioma: "en" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.campo).toBe("idioma");
      expect(r.error).toBe(MENSAJE.idioma);
    }
  });
  it("país desconocido, moneda inválida y zona inválida: cada uno con su mensaje", () => {
    expect(validarConfig({ pais: "XX" })).toEqual({ ok: false, campo: "pais", error: MENSAJE.pais });
    expect(validarConfig({ moneda: "ABC" })).toEqual({ ok: false, campo: "moneda", error: MENSAJE.moneda });
    expect(validarConfig({ zona_horaria: "Lima" })).toEqual({ ok: false, campo: "zona_horaria", error: MENSAJE.zona_horaria });
  });
  it("una configuración completa válida pasa entera", () => {
    expect(validarConfig(MX)).toEqual({ ok: true, config: MX });
  });
  it("lo que valida no toca la base que recibe", () => {
    const base = { ...MX };
    validarConfig({ moneda: "USD" }, base);
    expect(base).toEqual(MX);
  });
});

describe("las listas conocidas son coherentes con lo que Intl acepta", () => {
  it("cada país propone una moneda y una zona válidas", () => {
    for (const p of PAISES) {
      expect(esPaisValido(p.codigo), p.codigo).toBe(true);
      expect(esMonedaValida(p.moneda), p.codigo).toBe(true);
      expect(esZonaValida(p.zona_horaria), p.codigo).toBe(true);
      // Cada país de la lista se puede escribir de punta a punta, no solo validar.
      const cfg = { pais: p.codigo, moneda: p.moneda, idioma: "es", zona_horaria: p.zona_horaria };
      // Coma, punto o espacio de miles según el país (Costa Rica escribe «₡1 500»).
      expect(moneda(1500, cfg), p.codigo).toMatch(/1[., ]?500/);
      expect(fechaHora("2026-10-14T05:30:00Z", cfg), p.codigo).toMatch(/^\d{2}[/-]\d{2}[/-]2026 \d{2}:\d{2}$/);
    }
    expect(PAISES[0]).toMatchObject({ codigo: "PE", moneda: "PEN", zona_horaria: "America/Lima" });
  });
  it("cada moneda y cada zona de las listas valen, y ningún código se repite", () => {
    for (const m of MONEDAS) expect(esMonedaValida(m.codigo), m.codigo).toBe(true);
    for (const z of ZONAS) expect(esZonaValida(z.zona), z.zona).toBe(true);
    expect(new Set(PAISES.map((p) => p.codigo)).size).toBe(PAISES.length);
    expect(new Set(MONEDAS.map((m) => m.codigo)).size).toBe(MONEDAS.length);
    expect(new Set(ZONAS.map((z) => z.zona)).size).toBe(ZONAS.length);
  });
  it("la moneda y la zona que propone cada país están en los selectores", () => {
    for (const p of PAISES) {
      expect(MONEDAS.some((m) => m.codigo === p.moneda), p.codigo).toBe(true);
      expect(ZONAS.some((z) => z.zona === p.zona_horaria), p.codigo).toBe(true);
    }
  });
  it("solo el español está disponible; los demás existen para decir que faltan", () => {
    expect(IDIOMAS_DISPONIBLES).toEqual(["es"]);
    expect(IDIOMAS.filter((i) => !i.disponible).length).toBeGreaterThan(0);
    expect(NOTA_IDIOMA_NO_DISPONIBLE).toBe("próximamente, no probado");
  });
  it("la muestra que ve la consultora sale de las mismas funciones", () => {
    const m = ejemplo(MX, new Date("2026-10-14T05:30:00Z"), 1234567.89);
    expect(m).toEqual({ monto: "$1,234,568", fecha: "13 de octubre de 2026", fecha_hora: "13/10/2026 23:30", simbolo: "$" });
  });
});

describe("lo que la pantalla decide sin dibujar nada", () => {
  it("al elegir un país se proponen su moneda y su hora; el idioma no se toca", () => {
    expect(proponerPorPais(PE, "MX")).toEqual(MX);
    expect(proponerPorPais({ ...PE, moneda: "USD" }, "CO")).toEqual(CO);
    // Un país que no está en la lista no propone nada: solo cambia el país.
    expect(proponerPorPais(PE, "BR")).toEqual({ ...PE, pais: "BR" });
  });
  it("solo viaja lo que cambió", () => {
    expect(cambiosDe(PE, PE)).toEqual({});
    expect(cambiosDe(PE, { ...PE, moneda: "USD" })).toEqual({ moneda: "USD" });
    expect(cambiosDe(PE, MX)).toEqual({ pais: "MX", moneda: "MXN", zona_horaria: "America/Mexico_City" });
  });
});

describe("la pantalla dibujada en servidor (react-dom, sin navegador)", () => {
  const AHORA = new Date("2026-10-14T05:30:00Z");
  const dibujar = (cfg: ConfigEmpresa) => renderToStaticMarkup(createElement(CamposConfiguracion, { cfg, alCambiar: () => {}, ahora: AHORA }));

  it("cerrada es solo un botón: el panel no se pinta hasta que alguien lo abre", () => {
    const html = renderToStaticMarkup(createElement(ConfiguracionEmpresa, { companyId: "0000000a-0000-4000-8000-00000000000a", actual: PE }));
    expect(html).toContain("País y moneda");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<aside");
  });
  it("cuatro selectores, con lo que la empresa declaró ya elegido", () => {
    const html = dibujar(PE);
    expect((html.match(/<select/g) ?? []).length).toBe(4);
    expect(html).toContain('<option value="PE" selected="">Perú</option>');
    expect(html).toContain('<option value="PEN" selected="">Sol peruano (PEN)</option>');
    expect(html).toContain('<option value="es" selected="">Español</option>');
    expect(html).toContain('<option value="America/Lima" selected="">Lima (Perú)</option>');
    for (const p of PAISES) expect(html, p.codigo).toContain(`<option value="${p.codigo}"`);
  });
  it("los idiomas que no están disponibles salen desactivados y rotulados «próximamente, no probado»", () => {
    const html = dibujar(PE);
    expect(html).toContain('<option value="en" disabled="">Inglés · próximamente, no probado</option>');
    expect(html).toContain('<option value="pt" disabled="">Portugués · próximamente, no probado</option>');
    expect(html).not.toMatch(/<option value="es"[^>]*disabled/);
    expect(html).toContain("Hoy todo está solo en español.");
  });
  it("la muestra es la de la empresa: soles y Lima, o pesos y Ciudad de México", () => {
    const pe = dibujar(PE);
    expect(pe).toContain("<strong>S/ 1,234,568</strong>");
    expect(pe).toContain("<strong>14 de octubre de 2026</strong>");
    expect(pe).toContain("<strong>14/10/2026 00:30</strong>");
    const mx = dibujar(MX);
    expect(mx).toContain("<strong>$1,234,568</strong>");
    expect(mx).toContain("<strong>13 de octubre de 2026</strong>");
    expect(mx).toContain("<strong>13/10/2026 23:30</strong>");
    expect(mx).toContain('<option value="MX" selected="">México</option>');
  });
  it("dice la verdad antes de guardar: casi todas las pantallas todavía muestran soles y hora de Lima", () => {
    const html = dibujar(MX);
    expect(html).toContain("Algunas pantallas ya escriben con esta configuración.");
    expect(html).toContain("Las demás todavía muestran soles y hora de Lima: se van actualizando por partes.");
  });
  it("no promete compatibilidad internacional ni expone metodología ni palabras en inglés", () => {
    for (const cfg of [PE, MX, ES]) {
      const texto = dibujar(cfg).replace(/<[^>]+>/g, " ");
      expect(texto).not.toMatch(/internacional|multi-?país|multi-?moneda|global/i);
      expect(texto).not.toMatch(/pilar|claim|matriz|hallazgo/i);
      expect(texto).not.toMatch(/\b(locale|timezone|currency|settings|default)\b/i);
    }
  });
  it("un valor guardado que no está en las listas se muestra tal cual y se dice por qué no sirve", () => {
    const html = dibujar({ pais: "BR", moneda: "JPY", idioma: "en", zona_horaria: "Asia/Tokyo" });
    expect(html).toContain('<option value="BR" selected="">BR</option>');
    expect(html).toContain('<option value="JPY" selected="">JPY</option>');
    expect(html).toContain('<option value="Asia/Tokyo" selected="">Asia/Tokyo</option>');
    expect(html).toContain(MENSAJE.pais);
    expect(html).not.toContain("<strong>");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// LA RUTA CONTRA POSTGRES EMBEBIDO (PGlite), NO SUPABASE.
// ---------------------------------------------------------------------------------------------------------------

type ErrorPg = { code?: string; message: string };

/**
 * `supabaseAdmin()` reducido a lo que la ruta y `autoridad.ts` usan: select/update con .eq() y una fila. Traduce a
 * SQL y lo ejecuta en PGlite, así las columnas, los valores por defecto y los códigos de error son los de Postgres.
 * Los nombres de tabla y columna vienen del código que se prueba, no de fuera.
 */
function sobrePostgres(pg: PGlite) {
  return {
    from(tabla: string) {
      let columnas = "*";
      let cambios: Fila | null = null;
      const filtros: [string, unknown][] = [];
      const correr = async (): Promise<{ filas: Fila[]; error: ErrorPg | null }> => {
        try {
          const valores = cambios ? Object.values(cambios) : [];
          const donde = filtros.map(([k], i) => `${k} = $${valores.length + i + 1}`).join(" and ");
          const sql = cambios
            ? `update ${tabla} set ${Object.keys(cambios).map((k, i) => `${k} = $${i + 1}`).join(", ")} where ${donde} returning ${columnas}`
            : `select ${columnas} from ${tabla} where ${donde}`;
          const r = await pg.query<Fila>(sql, [...valores, ...filtros.map(([, v]) => v)]);
          return { filas: r.rows, error: null };
        } catch (e) {
          return { filas: [], error: { code: (e as { code?: string }).code, message: (e as Error).message } };
        }
      };
      const q = {
        select(c: string) { columnas = c; return q; },
        update(c: Fila) { cambios = c; return q; },
        eq(k: string, v: unknown) { filtros.push([k, v]); return q; },
        async maybeSingle() {
          const { filas, error } = await correr();
          return { data: error ? null : filas[0] ?? null, error };
        },
        async single() {
          const { filas, error } = await correr();
          if (error) return { data: null, error };
          return filas[0] ? { data: filas[0], error: null } : { data: null, error: { code: "PGRST116", message: "sin filas" } };
        },
      };
      return q;
    },
  };
}

describe("la ruta de configuración · Postgres embebido (PGlite), no Supabase · sesión con doble", () => {
  const U_C = "00000000-0000-4000-8000-0000000000c1"; // consultora con la autoridad que su rol trae
  const U_S = "00000000-0000-4000-8000-0000000000c2"; // consultora a la que se le dejó solo aprobar planes
  const U_D = "00000000-0000-4000-8000-0000000000d1"; // dueña de la empresa A
  const EMP_A = "0000000a-0000-4000-8000-00000000000a";
  const EMP_B = "0000000b-0000-4000-8000-00000000000b";
  const EMP_C = "0000000c-0000-4000-8000-00000000000c";
  const NO_EXISTE = "0000000f-0000-4000-8000-00000000000f";
  const CONSULTORA: Perfil = { id: U_C, email: "consultora@prueba.local", nombre: "Consultora", rol: "consultor" };
  const SIN_ADMINISTRAR: Perfil = { id: U_S, email: "revisora@prueba.local", nombre: "Revisora", rol: "consultor" };
  const DUENA: Perfil = { id: U_D, email: "duena@prueba.local", nombre: "Dueña", rol: "cliente" };

  let pg: PGlite | undefined;
  let fallo: unknown;

  beforeAll(async () => {
    try {
      pg = (await baseConEsquema()).pg;
      await pg.query(
        "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'consultora@prueba.local', $2::jsonb), ($3, 'revisora@prueba.local', $4::jsonb), ($5, 'duena@prueba.local', $6::jsonb)",
        [U_C, JSON.stringify({ nombre: "Consultora" }), U_S, JSON.stringify({ nombre: "Revisora" }), U_D, JSON.stringify({ nombre: "Dueña" })]
      );
      await pg.query("update users set rol = 'consultor' where id in ($1, $2)", [U_C, U_S]);
      await pg.query("update users set autoridad = '{aprobar_plan}' where id = $1", [U_S]);
      // Las tres empresas se crean SIN decir país ni moneda: lo que tengan lo puso la migración.
      await pg.query("insert into companies (id, nombre) values ($1, 'Tienda de ropa (sintética)'), ($2, 'Estudio jurídico (sintético)'), ($3, 'Taller (sintético)')", [EMP_A, EMP_B, EMP_C]);
      await pg.query("insert into memberships (user_id, company_id) values ($1, $2)", [U_D, EMP_A]);
    } catch (e) {
      fallo = e;
    }
  }, 180_000);

  afterAll(async () => {
    doble.sb = null;
    await pg?.close();
  });

  beforeEach(() => {
    if (fallo) throw fallo;
    doble.sb = sobrePostgres(pg!);
    vi.mocked(perfilApi).mockReset();
    vi.mocked(registrar).mockClear();
    vi.mocked(registrarError).mockClear();
  });

  const guardada = async (id: string) => (await pg!.query<Fila>("select pais, moneda, idioma, zona_horaria from companies where id = $1", [id])).rows[0];
  const contexto = (id: string) => ({ params: Promise.resolve({ id }) });
  const cambiar = (id: string, cuerpo: unknown, como: Perfil | null = CONSULTORA) => {
    vi.mocked(perfilApi).mockResolvedValue(como);
    return PATCH(new Request(`http://8x.test/api/companies/${id}/configuracion`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }), contexto(id));
  };
  const leer = (id: string, como: Perfil | null = CONSULTORA) => {
    vi.mocked(perfilApi).mockResolvedValue(como);
    return GET(new Request(`http://8x.test/api/companies/${id}/configuracion`), contexto(id));
  };

  it("una empresa creada sin decir nada queda en Perú: la migración y `porDefecto` dicen lo mismo", async () => {
    expect(await guardada(EMP_A)).toEqual(porDefecto);
    expect(configDe(await guardada(EMP_A))).toEqual(porDefecto);
  });

  it("leer devuelve la configuración y la muestra en soles", async () => {
    const res = await leer(EMP_A);
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.configuracion).toEqual(porDefecto);
    expect(cuerpo.ejemplo.monto).toBe("S/ 1,234,568");
    expect(cuerpo.ejemplo.simbolo).toBe("S/");
  });

  it("la dueña lee la de SU empresa y no la de otra", async () => {
    expect((await leer(EMP_A, DUENA)).status).toBe(200);
    const ajena = await leer(EMP_B, DUENA);
    expect(ajena.status).toBe(403);
    expect((await ajena.json()).error).toBe("No tienes acceso a esta empresa.");
  });

  it("sin sesión → 401 y nada cambia", async () => {
    const res = await cambiar(EMP_A, { moneda: "USD" }, null);
    expect(res.status).toBe(401);
    expect(await guardada(EMP_A)).toEqual(porDefecto);
  });

  it("la dueña no cambia la configuración: 403, queda el intento en el rastro y nada cambia", async () => {
    const res = await cambiar(EMP_A, { moneda: "USD" }, DUENA);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Solo el consultor puede hacer esto.");
    expect(vi.mocked(registrar).mock.calls[0]![0]).toMatchObject({ accion: "denegado", entidad: "configuracion", detalle: { motivo: "rol" } });
    expect(await guardada(EMP_A)).toEqual(porDefecto);
  });

  it("una consultora sin autoridad para administrar tampoco: 403 con motivo «autoridad», leído de users.autoridad", async () => {
    const res = await cambiar(EMP_A, { moneda: "USD" }, SIN_ADMINISTRAR);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/^No tienes autoridad para /);
    expect(vi.mocked(registrar).mock.calls[0]![0]).toMatchObject({ accion: "denegado", detalle: { motivo: "autoridad", metodo: "PATCH" } });
    expect(registrarError).not.toHaveBeenCalled();
    expect(await guardada(EMP_A)).toEqual(porDefecto);
  });

  it("valores que no valen → 400 con el mensaje del campo, en castellano, y nada cambia", async () => {
    const casos: [unknown, string][] = [
      [{ moneda: "ABC" }, MENSAJE.moneda],
      [{ moneda: "soles" }, MENSAJE.moneda],
      [{ moneda: 5 }, MENSAJE.moneda], // Zod diría «Invalid input: expected string»: eso no llega a la persona.
      [{ idioma: "en" }, MENSAJE.idioma],
      [{ pais: "XX" }, MENSAJE.pais],
      [{ pais: "Perú" }, MENSAJE.pais],
      [{ zona_horaria: "Lima" }, MENSAJE.zona_horaria],
      [{ zona_horaria: null }, MENSAJE.zona_horaria],
      [{ nombre: "Otra empresa" }, "Solo se pueden cambiar país, moneda, idioma y zona horaria."],
      [{ moneda: "USD", tope_tokens: 9_999_999 }, "Solo se pueden cambiar país, moneda, idioma y zona horaria."],
      [["USD"], "Los datos enviados no son válidos. Manda país, moneda, idioma o zona horaria."],
      [{}, "No hay nada que cambiar: manda al menos país, moneda, idioma o zona horaria."],
    ];
    for (const [cuerpo, mensaje] of casos) {
      const res = await cambiar(EMP_A, cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
      expect((await res.json()).error, JSON.stringify(cuerpo)).toBe(mensaje);
    }
    expect(await guardada(EMP_A)).toEqual(porDefecto);
    expect(registrar).not.toHaveBeenCalled();
  });

  it("un cambio válido se guarda, se devuelve con su muestra y deja rastro con el antes y el después", async () => {
    const res = await cambiar(EMP_A, { pais: "MX", moneda: " mxn ", zona_horaria: "America/Mexico_City" });
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.configuracion).toEqual(MX);
    expect(cuerpo.ejemplo.monto).toBe("$1,234,568");
    expect(await guardada(EMP_A)).toEqual(MX);
    // Dos entradas: la genérica de `protegido` y la que dice qué empresa y qué había antes.
    const rastros = vi.mocked(registrar).mock.calls.map((c) => c[0]);
    const detallado = rastros.find((r) => r.companyId === EMP_A);
    expect(detallado).toMatchObject({
      accion: "editar", entidad: "configuracion", entidadId: EMP_A, actor: CONSULTORA,
      ruta: `/api/companies/${EMP_A}/configuracion`,
      detalle: { antes: porDefecto, despues: MX, campos: ["pais", "moneda", "zona_horaria"] },
    });
    // Las otras empresas no se enteran.
    expect(await guardada(EMP_B)).toEqual(porDefecto);
  });

  it("un solo campo cambia solo ese campo", async () => {
    const res = await cambiar(EMP_B, { moneda: "USD" });
    expect(res.status).toBe(200);
    expect(await guardada(EMP_B)).toEqual({ ...porDefecto, moneda: "USD" });
    expect((await res.json()).ejemplo.monto).toBe("USD 1,234,568");
  });

  it("una empresa que no existe o un identificador mal escrito → 404, no un error de Postgres", async () => {
    const res = await cambiar(NO_EXISTE, { moneda: "USD" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Empresa no encontrada");
    expect((await cambiar("no-es-un-identificador", { moneda: "USD" })).status).toBe(404);
    expect((await leer("no-es-un-identificador")).status).toBe(404);
    expect((await leer(NO_EXISTE)).status).toBe(404);
    expect(registrarError).not.toHaveBeenCalled();
  });

  it("columnas vacías en la base se leen como Perú", async () => {
    await pg!.query("update companies set pais = null, moneda = null, idioma = null, zona_horaria = null where id = $1", [EMP_C]);
    const res = await leer(EMP_C);
    expect(res.status).toBe(200);
    expect((await res.json()).configuracion).toEqual(porDefecto);
  });

  it("un país escrito a mano en la base no tumba la lectura: sin muestra y con el aviso de qué campo falla", async () => {
    await pg!.query("update companies set pais = 'Perú', moneda = 'PEN', idioma = 'es', zona_horaria = 'America/Lima' where id = $1", [EMP_C]);
    const res = await leer(EMP_C);
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.configuracion.pais).toBe("Perú");
    expect(cuerpo.ejemplo).toBeNull();
    expect(cuerpo.aviso).toContain("País no reconocido");
    // Y se arregla desde la misma ruta, eligiendo un país de la lista.
    const arreglo = await cambiar(EMP_C, { pais: "PE" });
    expect(arreglo.status).toBe(200);
    expect((await arreglo.json()).ejemplo.monto).toBe("S/ 1,234,568");
  });

  it("si la migración no está aplicada, la ruta lo dice: 503 al guardar, Perú con aviso al leer", async () => {
    // Se quita la columna de verdad (renombrándola) para que el error sea el 42703 que da Postgres, no uno fingido.
    await pg!.query("alter table companies rename column zona_horaria to zona_horaria_quitada");
    try {
      const res = await cambiar(EMP_B, { moneda: "MXN" });
      expect(res.status).toBe(503);
      expect((await res.json()).error).toMatch(/falta aplicar supabase\/migracion-entrada-y-direccion\.sql\. No se cambió nada/);
      const lectura = await leer(EMP_B);
      expect(lectura.status).toBe(200);
      const cuerpo = await lectura.json();
      expect(cuerpo.configuracion).toEqual(porDefecto);
      expect(cuerpo.aviso).toMatch(/todavía no está habilitada/);
    } finally {
      await pg!.query("alter table companies rename column zona_horaria_quitada to zona_horaria");
    }
    // No se cambió nada: sigue lo que había.
    expect(await guardada(EMP_B)).toEqual({ ...porDefecto, moneda: "USD" });
  });
});

describe("la pantalla y la ruta usan la regla (lectura del código fuente)", () => {
  const SRC = path.resolve(__dirname, "../src");
  const ruta = readFileSync(path.join(SRC, "app/api/companies/[id]/configuracion/route.ts"), "utf8");
  const pantalla = readFileSync(path.join(SRC, "components/consultor/ConfiguracionEmpresa.tsx"), "utf8");
  // Desde el 16-10-2026 el acceso a la configuración vive en el menú «Administrar» de la cabecera de la empresa (layout de
  // /empresa/[id], dentro de <MenuAdministrar>), no en la portada: sale en todas las vistas de la empresa.
  const pagina = readFileSync(path.join(SRC, "app/(consultor)/empresa/[id]/layout.tsx"), "utf8");
  const modulo = readFileSync(path.join(SRC, "lib/formato.ts"), "utf8");

  it("la ruta PATCH exige autoridad para administrar y valida con Zod y las mismas listas", () => {
    expect(ruta).toMatch(/export const PATCH = protegido<Ctx>\(\{ consultor: true/);
    expect(ruta).toMatch(/exigirAutoridad\(perfil, "administrar"\)/);
    expect(ruta).toMatch(/from "zod"/);
    expect(ruta).toMatch(/z\.enum\(CODIGOS_PAIS/);
    expect(ruta).toMatch(/z\.enum\(IDIOMAS_DISPONIBLES/);
    expect(ruta).toMatch(/refine\(esMonedaValida/);
    expect(ruta).toMatch(/refine\(esZonaValida/);
  });
  it("si la migración no está aplicada, la ruta lo dice en vez de fallar con un 500 mudo", () => {
    expect(ruta).toMatch(/42703/);
    expect(ruta).toMatch(/PGRST204/);
    expect(ruta).toMatch(/falta aplicar supabase\/migracion-entrada-y-direccion\.sql/);
  });
  it("la pantalla desactiva los idiomas no disponibles y los rotula", () => {
    expect(pantalla).toMatch(/disabled=\{!i\.disponible\}/);
    expect(pantalla).toMatch(/NOTA_IDIOMA_NO_DISPONIBLE/);
  });
  it("la pantalla no promete compatibilidad internacional ni expone metodología", () => {
    expect(pantalla).not.toMatch(/internacional/i);
    expect(pantalla).not.toMatch(/pilar|claim|matriz/i);
    expect(pantalla).toMatch(/todavía muestran soles y hora de Lima/);
  });
  it("la página de la empresa da acceso a la configuración con lo que la empresa declaró", () => {
    expect(pagina).toMatch(/import \{ ConfiguracionEmpresa \} from "@\/components\/consultor\/ConfiguracionEmpresa"/);
    expect(pagina).toMatch(/<ConfiguracionEmpresa companyId=\{id\} actual=\{configDe\(c\)\} \/>/);
    // Dentro del menú «Administrar», que se pinta en todas las vistas de la empresa.
    expect(pagina.indexOf("<ConfiguracionEmpresa")).toBeGreaterThan(pagina.indexOf("<MenuAdministrar>"));
    expect(pagina.indexOf("<ConfiguracionEmpresa")).toBeLessThan(pagina.indexOf("</MenuAdministrar>"));
  });
  it("el módulo no trae dependencias ni caracteres invisibles: todo sale de Intl", () => {
    expect(modulo).not.toMatch(/^import /m);
    expect(modulo).not.toMatch(/[\u00A0\u202F]/);
    expect(modulo).toMatch(/ESTO PREPARA LA INTERNACIONALIZACIÓN; NO LA DECLARA/);
  });
});
