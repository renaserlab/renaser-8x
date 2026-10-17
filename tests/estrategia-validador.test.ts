/**
 * EL VALIDADOR: NINGUNA CIFRA SIN ORIGEN (src/lib/estrategia/validador.ts · spec-estrategia-8x.md §6.3, §5.4 y §9.3).
 *
 * Con la empresa FICTICIA «Frutas del Valle» y sus salidas falsas del modelo (tests/fixtures/estrategia-falsa.ts). Cada
 * prueba rompe una sola cosa de la estrategia buena y mira que el validador la nombre, con su lugar y qué hacer.
 */
import { describe, it, expect } from "vitest";
import { armarPaquete } from "@/lib/estrategia/paquete";
import { calcularTodo } from "@/lib/estrategia/calculos";
import { armarEstrategia, refsDeEstrategia, type Estrategia, type EntradaArmado } from "@/lib/estrategia/armar";
import {
  CAMPOS_DE_TEXTO, CAMPOS_DEL_CODIGO, cifrasSinOrigen, estadoDeRevision, frasesDe, palabrasQueElDuenoNoVe, partesDeLineas, quitarLoInvalido,
  referentesEn, resolverQuitado, revisarPregunta, textosEn, validar, type Validacion,
} from "@/lib/estrategia/validador";
import { MARCA_CAMINO_RESTAURADO, MARCA_QUITADO } from "@/lib/estrategia/textos";
import type { Jugada } from "@/lib/estrategia/esquemas";
import {
  entradasFrutas, HOY, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, ROJO_BUENO, ROJO_CON_CIFRAS, ROJO_CAMINO_ROTO, LENTE_SUPONE_HOY,
} from "./fixtures/estrategia-falsa";

const ENTRADAS = entradasFrutas();
const paquete = armarPaquete(ENTRADAS, HOY);
const calculos = calcularTodo(ENTRADAS, HOY);
const ctx = { paquete, calculos };

/** Arma con las salidas buenas, cambiando lo que se pida en una copia. */
function armar(cambiar: (x: Pick<EntradaArmado, "lenteDinero" | "lenteTerreno" | "rojo">) => void = () => {}): Estrategia {
  const x = { lenteDinero: structuredClone(LENTE_DINERO_BUENA), lenteTerreno: structuredClone(LENTE_TERRENO_BUENA), rojo: structuredClone(ROJO_BUENO) };
  cambiar(x);
  return armarEstrategia({ paquete, calculos, ...x });
}
function validada(e: Estrategia, editados?: Set<string>): Validacion {
  return validar(e, refsDeEstrategia(e, paquete, calculos), { partes: partesDeLineas(calculos), editados });
}
const tipos = (v: Validacion) => v.errores.map((x) => x.tipo);
const en = (v: Validacion, tipo: string) => v.errores.filter((x) => x.tipo === tipo);

describe("la estrategia buena pasa limpia", () => {
  it("sin errores ni avisos", () => {
    const v = validada(armar());
    expect(v.errores).toEqual([]);
    expect(v.avisos).toEqual([]);
  });
  it("cada violación dice dónde está y qué hacer", () => {
    const v = validada(armar((x) => (x.rojo.lectura[0] = "Vende 120 al mes.")));
    expect(v.errores).toHaveLength(1);
    expect(v.errores[0]).toMatchObject({ puntero: "/lectura/0", tipo: "cifra_sin_origen" });
    expect(v.errores[0]!.que_hacer).toMatch(/\{\{id\}\}/);
  });
});

// ─── 1 · cifra_sin_origen ────────────────────────────────────────────────────────────────────────

describe("§6.3, 1 · cifra sin origen", () => {
  it("dígito suelto, «S/», «$», «%», «por ciento» y «dos mil soles» son error", () => {
    for (const t of ["Vende 120 al mes", "Cuesta S/ mucho dinero", "Se pierden $ cada mes", "El precio sube un 5 %", "El precio sube un cinco por ciento", "Seguir igual cuesta dos mil soles", "Llegan veinte clientes nuevos", "Tres de cada 10 compran"]) {
      expect(cifrasSinOrigen(t), t).not.toEqual([]);
    }
    expect(cifrasSinOrigen("Seguir igual cuesta dos mil soles")).toContain("dos mil soles");
  });

  it("lo que va dentro de {{…}} no cuenta", () => {
    expect(cifrasSinOrigen("Vende {{N:venta_mes}} al mes y le deben {{C:parado.deuda_clientes}}.")).toEqual([]);
  });

  it("«duplicar la utilidad» sin cuenta es error; con {{C:mult.…}} o {{R:…}} en la misma frase pasa", () => {
    expect(cifrasSinOrigen("Hay que duplicar la utilidad.")).toEqual(["duplicar"]);
    expect(cifrasSinOrigen("Se puede triplicar.")).not.toEqual([]);
    expect(cifrasSinOrigen("Vende la mitad que antes.")).not.toEqual([]);
    expect(cifrasSinOrigen("Para duplicar la utilidad hay que vender {{C:mult.venta_x2}} al mes.")).toEqual([]);
    expect(cifrasSinOrigen("A 90 días la utilidad sería {{R:a.multiplo.d90}}: el doble.")).toEqual([]);
    // La cuenta tiene que estar en la misma frase.
    expect(cifrasSinOrigen("Hay que vender {{C:mult.venta_x2}}. Eso es el doble.")).toEqual(["el doble"]);
    // «a mitad de» es una fecha, no una división.
    expect(cifrasSinOrigen("Se revisa a mitad de mes.")).toEqual([]);
  });

  it("pasan «de cada 10», «a 90 días», «14, 30 y 90 días», «día 14», «días 1 a 7», «jugada 2» y «8X»", () => {
    for (const t of [
      "De cada 10 interesados, {{N:conversion_de_cada_10}} compran", "Lo sabremos a 90 días", "Se mide a 14, 30 y 90 días", "Desde el día 14", "En los días 1 a 7",
      "Del día 1 al 7", "Abre la jugada 2", "Lo calcula 8X", "Entre 14 y 30 días", "Lo sabremos el día 30, con la deuda atrasada bajando",
      "Cobrar en los primeros 30 días lo que ya se vendió", "A partir del día 45 entra la jugada 4", "A los 90 días la utilidad sería {{R:a.utilidad.d90}}",
    ]) {
      expect(cifrasSinOrigen(t), t).toEqual([]);
    }
  });

  it("no pasan los otros plazos ni los días fuera del horizonte", () => {
    expect(cifrasSinOrigen("En 60 días")).not.toEqual([]);
    expect(cifrasSinOrigen("El día 120")).not.toEqual([]);
    expect(cifrasSinOrigen("Se prueba dos semanas")).not.toEqual([]);
    // Un id que se escapa al texto también es una cifra (y la pantalla no muestra ids).
    expect(cifrasSinOrigen("Usa el supuesto SA2")).not.toEqual([]);
  });

  it("un plazo de crédito, de cobro, de pago o de entrega no es un horizonte, aunque sea de 14, 30 o 90 días", () => {
    for (const t of [
      "Pasar el crédito de 90 días a 30 días", "Pagar a proveedores a 90 días", "Cobrar al día 45", "Abrir los días 15 a 30 del mes",
      "La factura vence el día 15", "Se entrega a los 14 días", "Cobrar a 30 días", "El día 5 de cada mes se cobra", "Un plazo de 30 días para pagar",
    ]) {
      expect(cifrasSinOrigen(t), t).not.toEqual([]);
    }
  });

  it("toda cantidad en palabras es una cifra, con unidad o sin ella; y la moneda dicha sin su número también", () => {
    for (const t of [
      "Quinientos por paciente", "Ciento veinte por sesión", "Llegar a los ochocientos al mes", "Subir a veinte", "Se pierden miles de soles",
      "Tiene cientos de clientes", "Se pierde un tercio de la fruta", "Se va la cuarta parte de la venta", "Cobrar cien USD", "Abrir una docena de locales",
      "Cobra en PEN", "Pierde unos soles por caja", "Medio mes de venta se queda en la calle", "Tres cuartos de lo que se vende",
    ]) {
      expect(cifrasSinOrigen(t), t).not.toEqual([]);
    }
    // Multiplicar sin la cuenta es una promesa, también con «doblar».
    expect(cifrasSinOrigen("Hay que doblar la atención.")).not.toEqual([]);
    expect(cifrasSinOrigen("Doblar la atención deja {{R:a.total.d90}} más al mes.")).toEqual([]);
  });

  it("una palabra con un número que no es cifra no salta: «las dos jugadas», «un día», «los dos caminos», «uno de los dos»", () => {
    for (const t of [
      "Las dos jugadas van juntas y empiezan un día antes.", "Los dos caminos se pueden empezar a la vez.", "Sus dos primeras jugadas no piden dinero.",
      "Elegir uno de los dos.", "Cada camino tiene de tres a cinco jugadas.", "El cuarto frío se ordena por madurez.",
    ]) {
      expect(cifrasSinOrigen(t), t).toEqual([]);
    }
  });

  it("la cifra que escribe la consultora no es error: es aviso, con su chip", () => {
    const e = armar((x) => (x.rojo.lectura[0] = "Vende 120 mil al mes."));
    expect(tipos(validada(e))).toEqual(["cifra_sin_origen"]);
    const v = validada(e, new Set(["/lectura/0"]));
    expect(v.errores).toEqual([]);
    expect(v.avisos).toEqual([expect.objectContaining({ tipo: "cifra_de_la_consultora", puntero: "/lectura/0" })]);
  });
});

// ─── 2 · ref_desconocida ─────────────────────────────────────────────────────────────────────────

describe("§6.3, 2 · ids que no existen", () => {
  it("un {{id}} que no está en el paquete, los cálculos, los supuestos ni las proyecciones", () => {
    const v = validada(armar((x) => (x.rojo.lectura[4] = "Lo sabremos mirando {{K:ffffffff}}.")));
    expect(en(v, "ref_desconocida")).toEqual([expect.objectContaining({ puntero: "/lectura/4" })]);
  });
  it("un id en una lista de refs, en un ancla o en una meta", () => {
    const v = validada(armar((x) => {
      x.rojo.gran_apuesta.refs.push("C:fuga.inventada");
      x.rojo.medir_desde_el_dia_1[0]!.meta_30 = "N:no_existe";
    }));
    expect(en(v, "ref_desconocida").map((x) => x.puntero).sort()).toEqual(["/gran_apuesta/refs/3", "/medir_desde_el_dia_1/0/meta_30"]);
  });
  it("llaves sueltas o vacías", () => {
    const v = validada(armar((x) => (x.rojo.lectura[3] = "La apuesta {{ }} va.")));
    expect(tipos(v)).toContain("ref_desconocida");
  });
  it("las proyecciones de cada camino y los supuestos existen como ids", () => {
    const refs = refsDeEstrategia(armar(), paquete, calculos);
    for (const id of ["R:a.total.d90", "R:a.multiplo.d90", "R:b.utilidad.d30", "R:a.J5.mes", "S:SA1", "S:SB2"]) expect(refs.has(id), id).toBe(true);
    // La habilitadora se nombra por la posición de lo que abre, nunca por su id.
    expect(refs.get("R:a.J5.mes")!.texto).toBe("no mueve dinero por sí misma: abre la jugada 3"); // la J2, que en el orden de juego va tercera
  });
});

// ─── 3 · efecto_mal_armado ───────────────────────────────────────────────────────────────────────

describe("§6.3, 3 · efectos mal armados", () => {
  const conEfecto = (efecto: Jugada["efecto"]) => validada(armar((x) => (x.lenteDinero.camino.jugadas[0]!.efecto = efecto)));

  it("una fuga que no es C:fuga.* (el dinero parado no es una fuga del mes)", () => {
    const v = conEfecto({ tipo: "cierre_fuga", fuga: "C:parado.deuda_clientes", de_cada_10: "SA2" });
    expect(en(v, "efecto_mal_armado")[0]).toMatchObject({ puntero: "/caminos/a/jugadas/0/efecto" });
    expect(en(v, "efecto_mal_armado")[0]!.texto).toMatch(/dinero parado/);
  });
  it("una línea que no es L:", () => {
    expect(tipos(conEfecto({ tipo: "precio_linea", linea: "C:poder.precio", pct: "SA1" }))).toContain("efecto_mal_armado");
  });
  it("un S: donde va el dato de hoy", () => {
    const v = conEfecto({ tipo: "conversion", interesados: "S:SA1", de_cada_10_nuevo: "SA2" });
    expect(en(v, "efecto_mal_armado").some((x) => /dato de hoy/.test(x.texto))).toBe(true);
  });
  it("una parte del costo que la línea no tiene; la que tiene, pasa", () => {
    expect(en(conEfecto({ tipo: "costo_parte", linea: "L:1a1a0001", parte: "embalaje", pct: "SA1" }), "efecto_mal_armado").some((x) => /embalaje/.test(x.texto))).toBe(true);
    const ok = validada(armar((x) => {
      x.lenteDinero.supuestos.push({ id: "SA5", clave: "costo_parte.pct", que_se_supone: "Cuánto baja el flete", unidad: "pct", rango: { bajo: -20, alto: -10 }, ancla: null, por_que: "Juntar repartos" });
      x.lenteDinero.camino.jugadas[0]!.efecto = { tipo: "costo_parte", linea: "L:1a1a0001", parte: "Flete", pct: "SA5" };
    }));
    expect(en(ok, "efecto_mal_armado")).toEqual([]);
  });
  it("un supuesto de otra clave (la jugada de precio con el supuesto de la fuga)", () => {
    const v = conEfecto({ tipo: "precio_linea", linea: "L:1a1a0004", pct: "SA2" });
    expect(en(v, "efecto_mal_armado").some((x) => /supuesto/.test(x.texto))).toBe(true);
  });
  it("una habilitadora que abre una jugada que no está", () => {
    expect(tipos(conEfecto({ tipo: "habilitador", abre: "J9" }))).toContain("efecto_mal_armado");
  });
  it("un camino que con los cambios queda con menos de tres o más de cinco jugadas", () => {
    expect(en(validada(armarEstrategia({ ...ctx, lenteDinero: LENTE_DINERO_BUENA, lenteTerreno: LENTE_TERRENO_BUENA, rojo: ROJO_CAMINO_ROTO })), "efecto_mal_armado")).toEqual([expect.objectContaining({ puntero: "/caminos/b/jugadas" })]);
    const seis = validada(armar((x) => x.lenteDinero.camino.jugadas.push(structuredClone(x.lenteDinero.camino.jugadas[0]!))));
    expect(en(seis, "efecto_mal_armado")).toEqual([expect.objectContaining({ puntero: "/caminos/a/jugadas" })]);
  });
  it("el equipo rojo quita una jugada que no existe, o quita y reemplaza la misma", () => {
    expect(tipos(validada(armar((x) => (x.rojo.cambios.b.quitar = [9]))))).toContain("efecto_mal_armado");
    const v = validada(armar((x) => (x.rojo.cambios.b.reemplazar = [{ n: 4, jugada: structuredClone(LENTE_TERRENO_BUENA.camino.jugadas[1]!) }])));
    expect(en(v, "efecto_mal_armado").some((x) => /misma jugada/.test(x.texto))).toBe(true);
  });
  it("el equipo rojo elige un ítem del FODA o un cruce que no existe", () => {
    const v = validada(armar((x) => {
      x.rojo.foda.f[0] = { de: "A.F9", texto: null };
      x.rojo.tows[0] = { de: "B.T7", estrategia: null };
    }));
    expect(en(v, "ref_desconocida").map((x) => x.puntero)).toEqual(expect.arrayContaining(["/foda/f/0", "/tows/0"]));
  });
});

// ─── 4 y 5 · supuestos ───────────────────────────────────────────────────────────────────────────

describe("§6.3, 4 y 5 · los supuestos", () => {
  const conSupuesto = (i: number, cambio: Partial<(typeof LENTE_DINERO_BUENA)["supuestos"][number]>) =>
    armar((x) => Object.assign(x.lenteDinero.supuestos[i]!, cambio));

  it("bajo mayor que alto, o fuera del límite del catálogo, o en otra unidad", () => {
    expect(en(validada(conSupuesto(0, { rango: { bajo: 15, alto: 10 } })), "supuesto_fuera_de_limite")).toHaveLength(1);
    expect(en(validada(conSupuesto(0, { rango: { bajo: 10, alto: 40 } })), "supuesto_fuera_de_limite")[0]!.texto).toMatch(/de -30 a 30/);
    expect(en(validada(conSupuesto(2, { rango: { bajo: 4, alto: 20 } })), "supuesto_fuera_de_limite")).toHaveLength(1); // cobra a 12 días: no puede cobrar 20 días antes
    expect(en(validada(conSupuesto(0, { unidad: "de_cada_10" })), "supuesto_fuera_de_limite")).toHaveLength(1);
  });

  it("un supuesto fuera de su límite no entra en las cuentas: su jugada queda sin número", () => {
    const e = conSupuesto(0, { rango: { bajo: 10, alto: 40 } });
    expect(e.caminos.a.proyeccion.jugadas.some((j) => j.id === "J1")).toBe(false);
    expect(e.caminos.a.proyeccion.total.d90.ritmo.valor!.alto).toBeCloseTo(4320 + 4000, 4); // sin «Fruta picada»
  });

  it("supuesto de estado actual: una clave que no es de cambio, o un cambio sin el dato del que parte", () => {
    const v = validada(armarEstrategia({ ...ctx, lenteDinero: LENTE_SUPONE_HOY, lenteTerreno: LENTE_TERRENO_BUENA, rojo: ROJO_BUENO }));
    expect(en(v, "supuesto_de_estado_actual")).toEqual([expect.objectContaining({ puntero: "/supuestos/4" })]);
    const sinAncla = validada(armar((x) => (x.lenteTerreno.supuestos[1]!.ancla = null)));
    expect(en(sinAncla, "supuesto_de_estado_actual")[0]!.texto).toMatch(/de qué dato de hoy parte/);
  });
});

// ─── 6 · referencia_como_dato ────────────────────────────────────────────────────────────────────

describe("§6.3, 6 · la referencia del rubro y el calendario no son datos de la empresa", () => {
  it("Z: como ancla", () => {
    const v = validada(armarEstrategia({ ...ctx, lenteDinero: LENTE_SUPONE_HOY, lenteTerreno: LENTE_TERRENO_BUENA, rojo: ROJO_BUENO }));
    expect(en(v, "referencia_como_dato")).toEqual([expect.objectContaining({ puntero: "/supuestos/4/ancla" })]);
  });
  it("dentro de un efecto, o como base o meta de lo que se mide", () => {
    const v = validada(armar((x) => {
      x.lenteTerreno.tows[1]!.efecto = { tipo: "cierre_fuga", fuga: "Z:rubro.merma", de_cada_10: "SB1" };
      x.rojo.medir_desde_el_dia_1[0]!.meta_90 = "T:2026-12";
    }));
    expect(en(v, "referencia_como_dato").map((x) => x.puntero).sort()).toEqual(["/medir_desde_el_dia_1/0/meta_90", "/tows/3/efecto"]);
  });
  it("en las refs de un ítem del FODA sí puede estar: es la fuente de afuera de una oportunidad", () => {
    expect(en(validada(armar()), "referencia_como_dato")).toEqual([]);
  });
});

// ─── 7 · pregunta_mal_hecha ──────────────────────────────────────────────────────────────────────

describe("§6.3, 7 · las preguntas para el dueño", () => {
  it("una buena pasa: una sola, corta, por el episodio; el «¿» de apertura no cuenta como segundo signo", () => {
    expect(revisarPregunta("La semana pasada, ¿cuántas cajas te devolvieron en la puerta?")).toEqual([]);
    expect(revisarPregunta("De cada 10 clientes que te compran, ¿cuántos vuelven a comprarte?")).toEqual([]);
  });
  it("doble, unida, larga, con cifra, con promedio, con ejemplo o con jerga", () => {
    expect(revisarPregunta("¿Cuántos clientes tienes? ¿Cuántos vuelven?").join()).toMatch(/más de una pregunta/);
    expect(revisarPregunta("¿Cuántos clientes tienes y cuántos vuelven?").join()).toMatch(/une dos preguntas/);
    expect(revisarPregunta("¿Le vendes a hoteles o si no a restaurantes?").join()).toMatch(/une dos preguntas/);
    expect(revisarPregunta("¿Qué vendiste y qué te devolvieron?").join()).toMatch(/une dos preguntas/);
    // «y que» sin tilde es un relativo: no une dos preguntas.
    expect(revisarPregunta("La semana pasada, ¿cuántos pedidos llegaron tarde y que tuviste que reponer?")).toEqual([]);
    expect(revisarPregunta(`¿${"cuántas cajas ".repeat(16)}vendiste?`).join()).toMatch(/larga/);
    expect(revisarPregunta("¿Vendes más de 100 cajas al mes?").join()).toMatch(/cifra/);
    expect(revisarPregunta("¿Vendes más de cien cajas?").join()).toMatch(/cifra/);
    expect(revisarPregunta("En un mes normal, ¿cuánto vendes?").join()).toMatch(/promedio/);
    expect(revisarPregunta("¿Cuánto vendes, por ejemplo en cajas?").join()).toMatch(/ejemplo/);
    for (const j of ["¿Cuál es tu tasa de cierre?", "¿Qué porcentaje te pagan?", "¿Cuánta plata te deben?", "¿Cuál es tu KPI de cobro?", "¿Qué indicador miras?", "¿Cuál es tu margen de contribución?"]) {
      expect(revisarPregunta(j).join(), j).toMatch(/palabras que el dueño no usa/);
    }
    expect(revisarPregunta("Cuántas cajas vendiste").join()).toMatch(/no es una pregunta/);
  });
  it("en la estrategia: la pregunta propia mal hecha, u «otra» sin su pregunta", () => {
    const mala = validada(armar((x) => (x.lenteTerreno.faltan[1]!.pregunta_si_otra = "¿Cuántas cajas devuelven y cuántas se botan?")));
    expect(en(mala, "pregunta_mal_hecha")).toEqual([expect.objectContaining({ puntero: "/faltan/3/pregunta_si_otra" })]);
    const sin = validada(armar((x) => (x.lenteTerreno.faltan[1]!.pregunta_si_otra = null)));
    expect(en(sin, "pregunta_mal_hecha")).toHaveLength(1);
    const cruce = validada(armar((x) => (x.lenteTerreno.tows[0]!.pregunta_si_no_hay_cuenta = "¿Cuál es tu tasa de devolución?")));
    expect(en(cruce, "pregunta_mal_hecha")[0]).toMatchObject({ puntero: "/tows/2/pregunta_si_no_hay_cuenta" });
  });
  it("una clave de lo que falta que no está en el catálogo, o que es de cambio", () => {
    const v = validada(armar((x) => x.rojo.faltan.push({ clave: "precio.pct", por_que_importa: "Para saber cuánto subir", pregunta_si_otra: null, unidad_si_otra: null })));
    expect(en(v, "ref_desconocida").some((x) => x.puntero.startsWith("/faltan/"))).toBe(true);
  });
});

// ─── 8 · palabra_que_el_dueno_no_ve ──────────────────────────────────────────────────────────────

describe("§6.3, 8 · lo que el dueño no ve", () => {
  it("las palabras del método, con borde de palabra y sin distinguir tildes", () => {
    expect(palabrasQueElDuenoNoVe("Tu matriz de contribucion y el costo variable")).toEqual(["contribución", "costo variable", "matriz"]);
    expect(palabrasQueElDuenoNoVe("El FODA, el TOWS, la lente y el equipo rojo")).toEqual(["FODA", "TOWS", "lente", "equipo rojo"]);
    expect(palabrasQueElDuenoNoVe("Es una hipótesis, una percepción y un supuesto del camino B")).toEqual(["supuesto", "hipótesis", "percepción", "camino B"]);
    expect(palabrasQueElDuenoNoVe("Lo hace la IA con un KPI y un SKU extraído")).toEqual(["SKU", "KPI", "extraído", "IA"]);
  });
  it("«familia», «diaria», «media» y «compañía» no saltan por «IA»; «por supuesto» no salta por «supuesto»", () => {
    for (const t of ["La familia lo ayuda", "Una venta diaria", "La media mañana", "LA MEDIA MAÑANA", "UNA COMPAÑIA", "Por supuesto que sí"]) expect(palabrasQueElDuenoNoVe(t), t).toEqual([]);
  });
  it("salta en la página del dueño, no en lo que lee la consultora", () => {
    const v = validada(armar((x) => (x.rojo.cambios.a.para_el_dueno.pasos[0] = "Subimos el precio según el supuesto de la consultora")));
    expect(en(v, "palabra_que_el_dueno_no_ve")).toEqual([expect.objectContaining({ puntero: "/caminos/a/para_el_dueno/pasos/0" })]);
    const consultora = validada(armar((x) => (x.lenteDinero.camino.jugadas[0]!.por_que = "Es un supuesto de la lente del dinero")));
    expect(en(consultora, "palabra_que_el_dueno_no_ve")).toEqual([]);
  });
  it("también en los casos y las señales que ve el dueño", () => {
    const v = validada(armar((x) => (x.rojo.cambios.a.casos_nuevos[0]!.solucion = "Se revisa el FODA con el cliente")));
    expect(en(v, "palabra_que_el_dueno_no_ve")[0]).toMatchObject({ puntero: "/caminos/a/casos/0/solucion" });
  });
});

// ─── 9 · nombre_de_referente ─────────────────────────────────────────────────────────────────────

describe("§6.3, 9 · ningún autor ni otra empresa", () => {
  it("salta el nombre del autor o de la empresa, con o sin tildes", () => {
    expect(referentesEn("Como dice Hormozi, la oferta manda")).toEqual(["hormozi"]);
    expect(referentesEn("Un océano azul para la fruta")).toEqual(["oceano azul"]);
    expect(referentesEn("Hacerlo como Toyota")).toEqual(["toyota"]);
  });
  it("«que lean el guion» no salta: «lean» es el verbo leer", () => {
    expect(referentesEn("Que los vendedores lean el guion antes de llamar")).toEqual([]);
  });
  it("en la estrategia, en cualquier texto", () => {
    const v = validada(armar((x) => (x.lenteTerreno.terreno.donde_ganar_sin_pelear = "Un océano azul: ganar sin pelear por precio")));
    expect(en(v, "nombre_de_referente")).toEqual([expect.objectContaining({ puntero: "/anexos/terreno/terreno/donde_ganar_sin_pelear" })]);
  });
});

// ─── Avisos ──────────────────────────────────────────────────────────────────────────────────────

describe("§6.3 · los avisos no bloquean", () => {
  it("un responsable que no es de la empresa queda «por definir», con aviso; el dueño siempre es de la empresa", () => {
    const e = armar((x) => {
      x.lenteDinero.camino.jugadas[0]!.responsable = "Pedro";
      x.lenteDinero.camino.jugadas[1]!.responsable = "El dueño";
    });
    expect(e.caminos.a.jugadas[0]).toMatchObject({ responsable: "por definir (8X no encontró a «Pedro» en la empresa)", responsable_encontrado: false, responsable_dicho: "Pedro" });
    expect(e.caminos.a.jugadas[1]!.responsable_encontrado).toBe(true);
    const v = validada(e);
    expect(v.errores).toEqual([]);
    expect(v.avisos).toEqual([expect.objectContaining({ tipo: "responsable_no_encontrado", puntero: "/caminos/a/jugadas/0/responsable" })]);
  });
  it("algo que anticipar fuera de los meses que siguen", () => {
    const v = validada(armar((x) => (x.lenteDinero.camino.anticipar[0]!.cuando = "2027-06")));
    expect(v.avisos).toEqual([expect.objectContaining({ tipo: "fecha_fuera_de_horizonte" })]);
  });
  it("un camino que pide más dinero del que hay: aviso, y un caso a tener en cuenta que suma 8X", () => {
    const e = armar((x) => (x.lenteDinero.camino.que_pide.dinero = "Comprar al contado lo de diciembre: {{C:parado.deuda_clientes}}"));
    expect(validada(e).avisos).toEqual([expect.objectContaining({ tipo: "pide_mas_caja_de_la_que_hay", puntero: "/caminos/a/que_pide/dinero" })]);
    const caso = e.caminos.a.casos.find((c) => c.origen === "8x")!;
    expect(caso.caso).toContain("{{N:caja_hoy}}");
    expect(cifrasSinOrigen(caso.caso + caso.solucion + caso.senal)).toEqual([]);
  });
});

// ─── Quitar lo inválido ──────────────────────────────────────────────────────────────────────────

describe("§5.4 · lo que sigue inválido después de la reparación se quita, con marca visible", () => {
  it("las frases con cifras sin origen o ids que no existen; después no queda error, pero sí la marca", () => {
    const e = armarEstrategia({ ...ctx, lenteDinero: LENTE_DINERO_BUENA, lenteTerreno: LENTE_TERRENO_BUENA, rojo: ROJO_CON_CIFRAS });
    const v = validada(e);
    const q = quitarLoInvalido(e, v.errores, ctx);
    expect(q.lectura[0]).toBe("");
    expect(q.lectura[2]).toBe("");
    expect(q.gran_apuesta.por_que).toBe("");
    expect(q.lectura[1]).toBe(ROJO_CON_CIFRAS.lectura[1]); // lo que no tenía nada, intacto
    expect(q.quitado).toHaveLength(4);
    expect(q.quitado.find((x) => x.puntero === "/lectura/0")).toMatchObject({ tipo: "cifra_sin_origen", motivo: MARCA_QUITADO.cifra_sin_origen, resuelto: false });
    expect(q.quitado.find((x) => x.puntero === "/lectura/0")!.quitado).toContain("120 mil");
    const despues = validada(q);
    expect(despues.errores).toEqual([]);
    expect(estadoDeRevision(q, despues)).toBe("con_observaciones");
  });

  it("de un texto con varias frases se quita solo la que trae el problema", () => {
    const e = armar((x) => (x.lenteDinero.lectura = "Vende {{N:venta_mes}} al mes. Pierde 500 cada semana. Le deben {{C:parado.deuda_clientes}}."));
    const q = quitarLoInvalido(e, validada(e).errores, ctx);
    expect(q.anexos.dinero.lectura).toBe("Vende {{N:venta_mes}} al mes. Le deben {{C:parado.deuda_clientes}}.");
    expect(q.quitado[0]!.quitado).toBe("Pierde 500 cada semana.");
  });

  it("un camino que quedó con dos jugadas recupera la que el equipo rojo le quitó, en su lugar", () => {
    const e = armarEstrategia({ ...ctx, lenteDinero: LENTE_DINERO_BUENA, lenteTerreno: LENTE_TERRENO_BUENA, rojo: ROJO_CAMINO_ROTO });
    expect(e.caminos.b.jugadas.map((j) => j.id)).toEqual(["J2", "J3"]);
    const q = quitarLoInvalido(e, validada(e).errores, ctx);
    expect(q.caminos.b.jugadas.map((j) => j.id)).toEqual(["J1", "J2", "J3"]);
    expect(q.quitado).toEqual([expect.objectContaining({ motivo: MARCA_CAMINO_RESTAURADO })]);
    expect(validada(q).errores).toEqual([]);
  });

  it("un supuesto inválido queda fuera de las cuentas, y su ancla de contexto se borra", () => {
    const e = armarEstrategia({ ...ctx, lenteDinero: LENTE_SUPONE_HOY, lenteTerreno: LENTE_TERRENO_BUENA, rojo: ROJO_BUENO });
    const q = quitarLoInvalido(e, validada(e).errores, ctx);
    expect(q.supuestos[4]).toMatchObject({ id: "SA5", ancla: null });
    expect(q.supuestos[4]!.retirado).toBeTruthy();
    expect(validada(q).errores).toEqual([]);
  });

  it("un efecto que no se puede calcular: la jugada queda sin número y se dice por qué", () => {
    const e = armar((x) => (x.lenteDinero.camino.jugadas[0]!.efecto = { tipo: "cierre_fuga", fuga: "C:parado.deuda_clientes", de_cada_10: "SA2" }));
    const q = quitarLoInvalido(e, validada(e).errores, ctx);
    expect(q.caminos.a.jugadas[0]!.efecto).toBeNull();
    expect(q.caminos.a.jugadas[0]!.efecto_retirado!.motivo).toMatch(/dinero parado/);
    expect(q.caminos.a.proyeccion.jugadas.some((j) => j.id === "J1")).toBe(false);
    expect(validada(q).errores).toEqual([]);
  });

  it("resuelto lo último, la versión vuelve a «lista»", () => {
    const e = armarEstrategia({ ...ctx, lenteDinero: LENTE_DINERO_BUENA, lenteTerreno: LENTE_TERRENO_BUENA, rojo: ROJO_CON_CIFRAS });
    let q = quitarLoInvalido(e, validada(e).errores, ctx);
    const punteros = [...new Set(q.quitado.map((x) => x.puntero))];
    for (const p of punteros.slice(0, -1)) q = resolverQuitado(q, p);
    expect(estadoDeRevision(q, validada(q))).toBe("con_observaciones");
    q = resolverQuitado(q, punteros[punteros.length - 1]!);
    expect(estadoDeRevision(q, validada(q))).toBe("lista");
    // Con un error vivo, no vuelve aunque no haya nada quitado.
    expect(estadoDeRevision({ quitado: [] }, validada(e))).toBe("con_observaciones");
  });
});

// ─── Dónde hay texto ─────────────────────────────────────────────────────────────────────────────

describe("CAMPOS_DE_TEXTO: ningún texto se queda sin revisar", () => {
  /** Las claves cuyo valor es un id, un número o una palabra del código: no son texto para leer. */
  const NO_SON_TEXTO = new Set([
    "de", "lente", "id", "clave", "unidad", "tipo", "cuadrante", "cruza", "camino", "letra", "origen", "pilar", "eslabon", "aterriza_en", "estado",
    "frecuencia", "a", "gravedad", "cuando", "base", "meta_30", "meta_90", "precio", "ancla", "refs", "linea", "pct", "interesados", "clientes",
    "veces_mes", "fuga", "de_cada_10", "de_cada_10_nuevo", "menos_dias", "abre", "parte", "hoy", "punto_de_decision_de", "usado_en", "responsable_dicho", "unidad_si_otra",
  ]);
  /** Lo que es del código y no se muestra como texto del modelo. */
  const FUERA = /^\/(?:caminos\/[ab]\/(?:proyeccion|cambiadas)|tows\/\d+\/impacto|victorias_14_dias\/\d+\/proyeccion|anexos\/cuentas|si_seguimos_igual|destraban|problemas|quitado)(?:\/|$)/;
  const coincide = (patron: string, puntero: string) => new RegExp(`^${patron.replace(/\*/g, "[^/]+")}$`).test(puntero);

  it("todo texto de una estrategia armada está en CAMPOS_DE_TEXTO o es del código", () => {
    const e = armar();
    const sueltos: string[] = [];
    const bajar = (x: unknown, camino: string, clave: string | null) => {
      if (FUERA.test(camino)) return;
      if (typeof x === "string") {
        if (clave && NO_SON_TEXTO.has(clave)) return;
        if (/\/refs\/\d+$|\/cruza\/\d+$|\/usado_en\/\d+$/.test(camino)) return;
        if (![...CAMPOS_DE_TEXTO, ...CAMPOS_DEL_CODIGO].some((p) => coincide(p, camino))) sueltos.push(camino);
      } else if (Array.isArray(x)) x.forEach((y, i) => bajar(y, `${camino}/${i}`, clave));
      else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) bajar(y, `${camino}/${k}`, k);
    };
    bajar(e, "", null);
    expect(sueltos).toEqual([]);
  });

  it("textosEn encuentra los textos por su puntero real", () => {
    const t = textosEn(armar(), ["/caminos/*/jugadas/*/que_se_mueve"]);
    expect(t).toHaveLength(8); // cinco del camino A y tres del B
    expect(t[0]!.puntero).toBe("/caminos/a/jugadas/0/que_se_mueve");
  });
});

describe("frasesDe no parte los {{…}}", () => {
  it("separa por punto, punto y coma o salto de línea, y respeta los puntos de los ids", () => {
    expect(frasesDe("Vende {{C:mult.venta_x2}} al mes. Le deben {{C:parado.deuda_clientes}}; y cobra tarde.\nOtra")).toEqual([
      "Vende {{C:mult.venta_x2}} al mes.",
      "Le deben {{C:parado.deuda_clientes}};",
      "y cobra tarde.",
      "Otra",
    ]);
  });
});

// ─── Lo que se agregó en la revisión del 17-10 ───────────────────────────────────────────────────

describe("revisión del 17-10 · las victorias con su cuenta y los supuestos en el tope", () => {
  it("el efecto de una victoria se revisa como el de una jugada: una fuga que no es del mes es error", () => {
    // La de la merma empieza el día 2: queda segunda en el orden de las victorias.
    const e = armar((x) => (x.rojo.victorias_14_dias[2]!.efecto = { tipo: "cierre_fuga", fuga: "C:parado.deuda_clientes", de_cada_10: "SR2" }));
    expect(en(validada(e), "efecto_mal_armado")).toEqual([expect.objectContaining({ puntero: "/victorias_14_dias/1/efecto" })]);
  });

  it("la victoria que cobra antes tiene su cifra de caja, y el total de los primeros 14 días la suma", () => {
    const e = armar();
    const refs = refsDeEstrategia(e, paquete, calculos);
    expect(e.victorias_14_dias.map((v) => v.efecto?.tipo ?? null)).toEqual([null, "cierre_fuga", "dias_cobro"]);
    // Cobrar de dos a cuatro días antes: venta del mes ÷ 30 × días.
    expect(refs.get("R:v.3.caja")!.valor).toEqual({ bajo: 8_000, alto: 16_000 });
    expect(refs.get("R:v.total.caja")!.valor).toEqual({ bajo: 8_000, alto: 16_000 });
    // Separar la palta: de 1 a 2 de cada 10 de la merma del mes deja de salir.
    expect(refs.get("R:v.2.mes")!.valor).toEqual({ bajo: 300, alto: 600 });
    expect(refs.get("R:v.total.mes")!.valor).toEqual({ bajo: 300, alto: 600 });
    // La que no mueve dinero no tiene cifra: se cuenta.
    expect(refs.has("R:v.1.caja")).toBe(false);
  });

  it("un supuesto que toca el tope de lo creíble en 90 días no es error: es aviso", () => {
    const e = armar((x) => (x.lenteDinero.supuestos[1]!.rango = { bajo: 5, alto: 7 }));
    const v = validada(e);
    expect(v.errores).toEqual([]);
    expect(v.avisos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: "supuesto_en_el_tope", puntero: "/supuestos/1" })]));
    // Pasarlo sí es error, como siempre.
    expect(tipos(validada(armar((x) => (x.lenteDinero.supuestos[1]!.rango = { bajo: 5, alto: 8 }))))).toContain("supuesto_fuera_de_limite");
  });
});
