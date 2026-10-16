/**
 * UN NÚMERO DICHO, COMO LO DICE UN DUEÑO (src/lib/dato-oral.ts, 16-10-2026).
 *
 * Lo que se fija aquí: la lectura de lo que la persona escribe como habla («8 mil», «30 a 50», «unos 40», «no sé»),
 * la aritmética de rangos (un rango se arrastra como rango, nunca se vuelve su promedio a escondidas), la única
 * equivalencia con company_metricas.estado, el más débil de varios estados, y los esquemas (una sola forma; el del
 * dueño no admite «comprobado»). Puro: sin base, sin red.
 */
import { describe, it, expect } from "vitest";
import {
  leerDatoOral, rangoDe, esExacto, centro, sumarRangos, restarRangos, multiplicarRangos, escalarRango, textoRango,
  estadoDatoDesdeMetrica, peorEstado, formaDe, EsquemaDatoOral, EsquemaDatoOralDueno, esquemaDatoOral,
  ESTADO_DATO_TEXTO, ESTADOS_DEL_DUENO, AVISO_DATO_NEGATIVO, AVISO_DATO_NO_ENTENDIDO, AVISO_DATO_VACIO,
} from "@/lib/dato-oral";

describe("leer lo que la persona escribe como habla", () => {
  it.each([
    ["8 mil", { valor: 8000 }],
    ["8500", { valor: 8500 }],
    ["S/ 1,250", { valor: 1250 }],
    ["28.000", { valor: 28000 }],
    ["12.5", { valor: 12.5 }],
  ])("«%s» es un número exacto, sin estado (lo elige la persona)", (texto, dato) => {
    expect(leerDatoOral(texto)).toEqual({ ok: true, dato });
  });

  it.each([
    ["30 a 50", 30, 50],
    ["entre 30 y 50", 30, 50],
    ["30-50", 30, 50],
    ["30 – 50", 30, 50],
    ["de 30 a 50", 30, 50],
    ["entre 50 y 30", 30, 50],
    ["entre 30 y 50 mil", 30000, 50000],
    ["S/ 1,200 a S/ 1,500", 1200, 1500],
    // Como se dice en voz alta: «de cada 10, 3 o 4»; «7 u 8».
    ["3 o 4", 3, 4],
    ["7 u 8", 7, 8],
    ["62 a 66", 62, 66],
  ])("«%s» es un rango de %d a %d, y un rango es un estimado", (texto, desde, hasta) => {
    expect(leerDatoOral(texto)).toEqual({ ok: true, dato: { desde, hasta, estado: "estimado" } });
  });

  it("«unos 40», «más o menos 40», «40 aprox» son 40, estimado", () => {
    for (const t of ["unos 40", "más o menos 40", "40 aprox", "como 40", "alrededor de 40"]) expect(leerDatoOral(t), t).toEqual({ ok: true, dato: { valor: 40, estado: "estimado" } });
  });

  it("«no sé», «no lo sé», «ni idea» son «no lo sé»: una respuesta, sin número", () => {
    for (const t of ["no sé", "No lo sé", "nose", "ni idea", "no se"]) expect(leerDatoOral(t), t).toEqual({ ok: true, dato: { estado: "no_lo_se" } });
  });

  it("lo que no se entiende se dice con qué hacer: negativo, «consultar», texto suelto, vacío", () => {
    expect(leerDatoOral("-20")).toEqual({ ok: false, aviso: AVISO_DATO_NEGATIVO });
    expect(leerDatoOral("consultar")).toEqual({ ok: false, aviso: AVISO_DATO_NO_ENTENDIDO });
    expect(leerDatoOral("40 y algo")).toEqual({ ok: false, aviso: AVISO_DATO_NO_ENTENDIDO });
    expect(leerDatoOral("")).toEqual({ ok: false, aviso: AVISO_DATO_VACIO });
    expect(leerDatoOral("   ")).toEqual({ ok: false, aviso: AVISO_DATO_VACIO });
  });
});

describe("rangos: se arrastran como rangos", () => {
  it("de un dato a un rango: exacto, rango, «no lo sé» y vacío", () => {
    expect(rangoDe({ valor: 40, estado: "contado" })).toEqual({ bajo: 40, alto: 40 });
    expect(rangoDe({ desde: 30, hasta: 50, estado: "estimado" })).toEqual({ bajo: 30, alto: 50 });
    expect(rangoDe({ estado: "no_lo_se" })).toBeNull();
    expect(rangoDe({ estado: "estimado" })).toBeNull();
    expect(rangoDe(null)).toBeNull();
    expect(rangoDe({ valor: 4, desde: 1, hasta: 9, estado: "estimado" })).toBeNull();
  });

  it("sumar, restar, multiplicar y escalar: la aritmética de intervalos", () => {
    expect(sumarRangos([{ bajo: 1, alto: 2 }, { bajo: 10, alto: 20 }])).toEqual({ bajo: 11, alto: 22 });
    expect(sumarRangos([{ bajo: 1, alto: 2 }, null])).toBeNull();
    expect(sumarRangos([])).toBeNull();
    // Restar cruza los extremos: el peor caso del margen es el precio bajo con el costo alto.
    expect(restarRangos({ bajo: 70, alto: 80 }, { bajo: 40, alto: 45 })).toEqual({ bajo: 25, alto: 40 });
    expect(multiplicarRangos({ bajo: -2, alto: 3 }, { bajo: 10, alto: 20 })).toEqual({ bajo: -40, alto: 60 });
    expect(escalarRango({ bajo: 10, alto: 20 }, 0.5)).toEqual({ bajo: 5, alto: 10 });
    expect(escalarRango({ bajo: 10, alto: 20 }, -1)).toEqual({ bajo: -20, alto: -10 });
    expect(centro({ bajo: 30, alto: 50 })).toBe(40);
    expect(esExacto({ bajo: 4, alto: 4 })).toBe(true);
    expect(esExacto({ bajo: 4, alto: 5 })).toBe(false);
  });

  it("en palabras: «S/ 40» o «entre S/ 30 y S/ 50»; sin dato, «sin dato»", () => {
    const soles = (n: number) => `S/ ${n}`;
    expect(textoRango({ bajo: 40, alto: 40 }, soles)).toBe("S/ 40");
    expect(textoRango({ bajo: 30, alto: 50 }, soles)).toBe("entre S/ 30 y S/ 50");
    expect(textoRango(null, soles)).toBe("sin dato");
    expect(textoRango(null, soles, "—")).toBe("—");
  });
});

describe("estados", () => {
  it("company_metricas.estado → estado del dato: una sola equivalencia", () => {
    expect(estadoDatoDesdeMetrica("verificado")).toBe("comprobado");
    expect(estadoDatoDesdeMetrica("extraido")).toBe("contado");
    expect(estadoDatoDesdeMetrica("contado")).toBe("estimado");
    expect(estadoDatoDesdeMetrica("sin_dato")).toBe("no_lo_se");
    expect(estadoDatoDesdeMetrica("descartado")).toBeNull();
    expect(estadoDatoDesdeMetrica(null)).toBeNull();
  });

  it("el más débil manda; un «no lo sé» anula; sin estados, null", () => {
    expect(peorEstado(["comprobado", "contado", "comprobado"])).toBe("contado");
    expect(peorEstado(["comprobado", "estimado"])).toBe("estimado");
    expect(peorEstado(["comprobado"])).toBe("comprobado");
    expect(peorEstado(["contado", "no_lo_se"])).toBeNull();
    expect(peorEstado([])).toBeNull();
    expect(peorEstado([null, undefined])).toBeNull();
    // Un estado que falta no vale más que un cálculo a ojo.
    expect(peorEstado(["comprobado", null])).toBe("estimado");
  });

  it("el dueño no elige «comprobado»; los textos son los suyos", () => {
    expect(ESTADOS_DEL_DUENO).toEqual(["estimado", "contado", "no_lo_se"]);
    expect(ESTADO_DATO_TEXTO).toEqual({ estimado: "Lo calculo a ojo", contado: "Lo tengo anotado o lo conté", comprobado: "Comprobado con un documento", no_lo_se: "No lo sé" });
  });
});

describe("los esquemas: una sola forma", () => {
  it("exacto, rango y «no lo sé» pasan; dos formas, vacío, «no lo sé» con número o desde > hasta, no", () => {
    expect(EsquemaDatoOral.safeParse({ valor: 40, estado: "contado" }).success).toBe(true);
    expect(EsquemaDatoOral.safeParse({ desde: 30, hasta: 50, estado: "estimado" }).success).toBe(true);
    expect(EsquemaDatoOral.safeParse({ estado: "no_lo_se" }).success).toBe(true);
    expect(EsquemaDatoOral.safeParse({ valor: 40, desde: 30, hasta: 50, estado: "estimado" }).success).toBe(false);
    expect(EsquemaDatoOral.safeParse({ estado: "estimado" }).success).toBe(false);
    expect(EsquemaDatoOral.safeParse({ valor: 40, estado: "no_lo_se" }).success).toBe(false);
    expect(EsquemaDatoOral.safeParse({ desde: 50, hasta: 30, estado: "estimado" }).success).toBe(false);
    expect(EsquemaDatoOral.safeParse({ desde: 30, estado: "estimado" }).success).toBe(false);
    expect(EsquemaDatoOral.safeParse({ valor: -1, estado: "contado" }).success).toBe(false);
    expect(EsquemaDatoOral.safeParse({ valor: 2e12, estado: "contado" }).success).toBe(false);
    expect(EsquemaDatoOral.safeParse({ valor: 1, estado: "contado", extra: true }).success).toBe(false);
  });

  it("el del dueño rechaza «comprobado»; el de la consultora lo admite", () => {
    expect(EsquemaDatoOralDueno.safeParse({ valor: 40, estado: "comprobado" }).success).toBe(false);
    expect(EsquemaDatoOral.safeParse({ valor: 40, estado: "comprobado" }).success).toBe(true);
  });

  it("«de cada 10» no pasa de 10; una parte del costo puede quedar sin número todavía", () => {
    expect(esquemaDatoOral({ max: 10 }).safeParse({ valor: 11, estado: "estimado" }).success).toBe(false);
    expect(esquemaDatoOral({ max: 10 }).safeParse({ valor: 7, estado: "estimado" }).success).toBe(true);
    expect(esquemaDatoOral({ admiteVacio: true }).safeParse({ estado: "estimado" }).success).toBe(true);
    expect(formaDe({ estado: "estimado" })).toBe("vacio");
  });
});
