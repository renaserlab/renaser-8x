/**
 * LOS ESQUEMAS DE LO QUE DEVUELVE EL MODELO (src/lib/estrategia/esquemas.ts · spec-estrategia-8x.md §5.1, §6.1 y §9.3).
 *
 * EL PRESUPUESTO CUBRE AL ESQUEMA, NO AL REVÉS: una salida cortada por tamaño no valida, se repite igual de cortada y la
 * etapa falla siempre en la empresa con más datos. Aquí se ata el tamaño máximo de cada esquema a su presupuesto de
 * salida, y ese presupuesto al contrato de su agente (src/lib/agentes/contratos.ts), que es el que el proveedor impone.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  caracteresMaximos, tokensMaximos, CARACTERES_POR_TOKEN, ESQUEMA_DE, PRESUPUESTO_TOKENS, Efecto, Ref, SalidaEquipoRojo, SalidaLenteDinero,
  SalidaLenteTerreno,
} from "@/lib/estrategia/esquemas";
import { CONTRATOS, aplicarContrato } from "@/lib/agentes/contratos";
import { armarEstrategia, refsDeEstrategia } from "@/lib/estrategia/armar";
import { armarPaquete } from "@/lib/estrategia/paquete";
import { calcularTodo } from "@/lib/estrategia/calculos";
import { validar, partesDeLineas } from "@/lib/estrategia/validador";
import {
  LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, ROJO_BUENO, ROJO_TIMIDO, ROJO_GENERICO, ROJO_ALARMISTA, ROJO_CON_CIFRAS, ROJO_CAMINOS_IGUALES,
  ROJO_CAMINO_ROTO, LENTE_SUPONE_HOY, entradasFrutas, HOY,
} from "./fixtures/estrategia-falsa";

describe("§5.1 · el tamaño de cada salida cabe en su presupuesto", () => {
  for (const [agente, esquema] of Object.entries(ESQUEMA_DE) as [keyof typeof ESQUEMA_DE, z.ZodType][]) {
    it(`${agente}: caracteres máximos ÷ ${CARACTERES_POR_TOKEN} ≤ ${PRESUPUESTO_TOKENS[agente]} tokens`, () => {
      expect(caracteresMaximos(esquema) / CARACTERES_POR_TOKEN).toBeLessThanOrEqual(PRESUPUESTO_TOKENS[agente]);
      expect(tokensMaximos(esquema)).toBeLessThanOrEqual(PRESUPUESTO_TOKENS[agente]);
    });
  }

  for (const agente of Object.keys(ESQUEMA_DE) as (keyof typeof ESQUEMA_DE)[]) {
    it(`${agente}: el contrato del agente tiene ese mismo presupuesto, y es el que impone el proveedor`, () => {
      expect(CONTRATOS[agente].presupuesto_tokens).toBe(PRESUPUESTO_TOKENS[agente]);
      expect(caracteresMaximos(ESQUEMA_DE[agente]) / CARACTERES_POR_TOKEN).toBeLessThanOrEqual(CONTRATOS[agente].presupuesto_tokens);
      // Pedir más no sirve: el contrato manda.
      expect(aplicarContrato(agente, 999_999)!.maxTokens).toBe(PRESUPUESTO_TOKENS[agente]);
    });
  }

  it("un texto o una lista sin tope no se puede presupuestar", () => {
    expect(() => caracteresMaximos(z.object({ a: z.string() }))).toThrow(/sin tope/);
    expect(() => caracteresMaximos(z.object({ a: z.array(z.string().max(3)) }))).toThrow(/sin tope/);
    expect(caracteresMaximos(z.object({ a: z.string().max(10) }))).toBe(2 + 1 + 3 + 12 + 1); // {"a":"diez letras"}
  });

  it("sin z.tuple: ningún esquema sale con prefixItems", () => {
    for (const esquema of Object.values(ESQUEMA_DE)) expect(JSON.stringify(z.toJSONSchema(esquema))).not.toContain("prefixItems");
  });
});

describe("§6.1 · las salidas falsas cumplen los esquemas (lo malo de las malas es de fondo, no de forma)", () => {
  it("lentes y equipos rojos, buenos y malos", () => {
    for (const s of [LENTE_DINERO_BUENA, LENTE_SUPONE_HOY]) expect(SalidaLenteDinero.safeParse(s).success).toBe(true);
    expect(SalidaLenteTerreno.safeParse(LENTE_TERRENO_BUENA).success).toBe(true);
    for (const r of [ROJO_BUENO, ROJO_TIMIDO, ROJO_GENERICO, ROJO_ALARMISTA, ROJO_CON_CIFRAS, ROJO_CAMINOS_IGUALES, ROJO_CAMINO_ROTO]) {
      const p = SalidaEquipoRojo.safeParse(r);
      expect(p.success, JSON.stringify(p.error?.issues.slice(0, 2))).toBe(true);
    }
  });
  it("el canvas pide sus nueve bloques", () => {
    const sin = structuredClone(LENTE_TERRENO_BUENA) as unknown as { canvas: Record<string, unknown> };
    delete sin.canvas.socios;
    expect(SalidaLenteTerreno.safeParse(sin).success).toBe(false);
  });
  it("un camino de la lente tiene de tres a cinco jugadas y al menos dos casos", () => {
    const pocas = structuredClone(LENTE_DINERO_BUENA);
    pocas.camino.jugadas = pocas.camino.jugadas.slice(0, 2);
    expect(SalidaLenteDinero.safeParse(pocas).success).toBe(false);
    const sinCasos = structuredClone(LENTE_DINERO_BUENA);
    sinCasos.camino.casos = sinCasos.camino.casos.slice(0, 1);
    expect(SalidaLenteDinero.safeParse(sinCasos).success).toBe(false);
  });
  it("la lectura del equipo rojo son cinco líneas, ni una más", () => {
    const r = structuredClone(ROJO_BUENO);
    r.lectura.push("Una sexta línea que sobra");
    expect(SalidaEquipoRojo.safeParse(r).success).toBe(false);
  });
});

describe("§6.1 · los ids y los efectos, en su forma", () => {
  it("un id lleva prefijo y clave; sin prefijo o con espacios, no", () => {
    for (const id of ["N:venta_mes", "L:1a1a0001.precio", "C:fuga.credito_incobrable", "X:linea.costo@1a1a0005", "R:a.total.d90", "D:dependencia.comercial.que_se_detiene"]) expect(Ref.safeParse(id).success, id).toBe(true);
    for (const id of ["venta_mes", "SA1", "C:con espacio", "Y:otra_cosa", `N:${"x".repeat(70)}`]) expect(Ref.safeParse(id).success, id).toBe(false);
  });
  it("un supuesto en el efecto va sin «S:»; un dato de hoy, con su prefijo", () => {
    expect(Efecto.safeParse({ tipo: "precio_general", pct: "SA1" }).success).toBe(true);
    expect(Efecto.safeParse({ tipo: "precio_general", pct: "S:SA1" }).success).toBe(false);
    expect(Efecto.safeParse({ tipo: "conversion", interesados: "SA1", de_cada_10_nuevo: "SA2" }).success).toBe(false);
    expect(Efecto.safeParse({ tipo: "habilitador", abre: "J3" }).success).toBe(true);
    expect(Efecto.safeParse({ tipo: "habilitador", abre: "la siguiente" }).success).toBe(false);
  });
  it("los once tipos de efecto de §4.4", () => {
    const tipos = (z.toJSONSchema(Efecto) as unknown as { oneOf: { properties: { tipo: { const: string } } }[] }).oneOf.map((o) => o.properties.tipo.const);
    expect(tipos.sort()).toEqual(["cierre_fuga", "conversion", "costo_parte", "dias_cobro", "gasto_fijo", "habilitador", "inventario_liberado", "precio_general", "precio_linea", "recompra", "volumen_linea"]);
  });
});

describe("§6.1 · el camino armado (lente + cambios del equipo rojo) se queda entre tres y cinco jugadas", () => {
  const armar = (rojo: typeof ROJO_BUENO) => {
    const paquete = armarPaquete(entradasFrutas(), HOY);
    const calculos = calcularTodo(entradasFrutas(), HOY);
    const e = armarEstrategia({ paquete, calculos, lenteDinero: LENTE_DINERO_BUENA, lenteTerreno: LENTE_TERRENO_BUENA, rojo });
    return { e, errores: validar(e, refsDeEstrategia(e, paquete, calculos), { partes: partesDeLineas(calculos) }).errores };
  };
  it("con los cambios de la buena: cinco en el camino del dinero (agrega una) y tres en el de la operación (quita una)", () => {
    const { e, errores } = armar(ROJO_BUENO);
    expect(e.caminos.a.jugadas).toHaveLength(5);
    expect(e.caminos.b.jugadas).toHaveLength(3);
    expect(errores).toEqual([]);
  });
  it("unos cambios que dejan dos jugadas son un error del validador, con su puntero", () => {
    const { e, errores } = armar(ROJO_CAMINO_ROTO);
    expect(e.caminos.b.jugadas).toHaveLength(2);
    expect(errores).toEqual(expect.arrayContaining([expect.objectContaining({ puntero: "/caminos/b/jugadas", tipo: "efecto_mal_armado" })]));
  });
  it("y unos que dejan seis, también", () => {
    // Una lente con cinco jugadas y un equipo rojo que agrega otra.
    const seis = structuredClone(ROJO_BUENO);
    const conSeis = structuredClone(LENTE_DINERO_BUENA);
    conSeis.camino.jugadas.push(structuredClone(conSeis.camino.jugadas[0]!));
    const paquete = armarPaquete(entradasFrutas(), HOY);
    const calculos = calcularTodo(entradasFrutas(), HOY);
    const e = armarEstrategia({ paquete, calculos, lenteDinero: conSeis, lenteTerreno: LENTE_TERRENO_BUENA, rojo: seis });
    expect(e.caminos.a.jugadas).toHaveLength(6);
    const errores = validar(e, refsDeEstrategia(e, paquete, calculos), { partes: partesDeLineas(calculos) }).errores;
    expect(errores).toEqual(expect.arrayContaining([expect.objectContaining({ puntero: "/caminos/a/jugadas", tipo: "efecto_mal_armado" })]));
  });
});
