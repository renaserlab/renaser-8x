/**
 * LA LISTA DE CONTROL (src/lib/estrategia/calidad.ts · spec-estrategia-8x.md §9.2 y §9.3).
 *
 * Kelin rechazó la estrategia tímida («Hormozi se reiría, Lemonis también… esto es morir o ganar»), la que le serviría a
 * cualquier negocio y la que asusta en vez de dar salida. Aquí se fija, con la empresa FICTICIA «Frutas del Valle» y
 * las salidas falsas del modelo (tests/fixtures/estrategia-falsa.ts), que la buena cumple todo y que cada mala falla
 * EXACTAMENTE lo que le corresponde: ni más (un ítem que salta por cualquier cosa no le dice nada a la consultora) ni
 * menos.
 *
 * Las cuentas del camino del dinero (camino A) de la buena, a mano:
 *   «Fruta picada» +10 a 15 %: 12 × 10 % × 500 = 600 a 900 al mes, desde el día 7
 *   crédito que no se cobra 7.200 × (5 a 8 de cada 10) = 3.600 a 5.760 al mes, desde el día 14
 *   cobrar 4 a 8 días antes: (120.000 ÷ 30) × 4 a 8 = 16.000 a 32.000 de caja, una vez, desde el día 14
 *   «Palta» +5 a 8 %: 10 × 5 % × 5.000 = 2.500 a 4.000 al mes, desde el día 30
 *   a 90 días: 6.700 a 10.660 más al mes sobre una utilidad de hoy de 9.179 a 10.179 → ×1,66 a ×2,16
 */
import { describe, it, expect } from "vitest";
import { armarPaquete } from "@/lib/estrategia/paquete";
import { calcularTodo } from "@/lib/estrategia/calculos";
import { armarEstrategia, problemaDeSupuesto, refsDeBase } from "@/lib/estrategia/armar";
import { CLAVES_CONTROL, LISTA_DE_CONTROL, FRASES_GENERICAS, PALABRAS_ALARMA, parecidoDeCaminos, queNoCumple, revisarCalidad, type ClaveControl } from "@/lib/estrategia/calidad";
import { cifrasSinOrigen, palabrasQueElDuenoNoVe, revisarPregunta } from "@/lib/estrategia/validador";
import { CLAVES_SUPUESTO, limitesDe, preguntaDe } from "@/lib/estrategia/supuestos";
import { MODELOS_NEGOCIO } from "@/lib/negocio";
import type { EntradasPaquete } from "@/lib/estrategia/paquete";
import type { SalidaEquipoRojo, SalidaLenteDinero } from "@/lib/estrategia/esquemas";
import {
  entradasFrutas, HOY, COSTOS_FRUTAS, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, ROJO_BUENO, ROJO_TIMIDO, ROJO_GENERICO, ROJO_ALARMISTA,
  ROJO_CON_CIFRAS, ROJO_CAMINOS_IGUALES, ROJO_CAMINO_ROTO, LENTE_SUPONE_HOY,
} from "./fixtures/estrategia-falsa";

function control(rojo: SalidaEquipoRojo, lenteDinero: SalidaLenteDinero = LENTE_DINERO_BUENA, entradas: EntradasPaquete = entradasFrutas()) {
  const paquete = armarPaquete(entradas, HOY);
  const calculos = calcularTodo(entradas, HOY);
  const e = armarEstrategia({ paquete, calculos, lenteDinero, lenteTerreno: LENTE_TERRENO_BUENA, rojo });
  return { e, calculos, resultado: revisarCalidad(e, paquete, calculos) };
}

describe("§9.2 · la buena cumple todo", () => {
  it("los diecinueve ítems de la lista", () => {
    const { resultado } = control(ROJO_BUENO);
    expect(resultado.map((r) => r.clave)).toEqual([...CLAVES_CONTROL]);
    expect(queNoCumple(resultado)).toEqual([]);
  });
  it("en lo más optimista llega a duplicar; en el medio de su rango no, y lo dice con la cuenta del multiplicador", () => {
    const { e, resultado } = control(ROJO_BUENO);
    const m = e.caminos.a.proyeccion.multiplo.d90.valor!;
    expect(m.bajo).toBeCloseTo((10178.5714 + 5980) / 10178.5714, 3);
    expect(m.alto).toBeCloseTo((9178.5714 + 9220) / 9178.5714, 3);
    expect(m.alto).toBeGreaterThanOrEqual(2);
    // La ambición se mide con el medio del rango: con el alto bastaba poner los supuestos en el tope para «duplicar».
    expect((m.bajo + m.alto) / 2).toBeLessThan(2);
    expect(resultado.find((r) => r.clave === "ambicion")!.cumple).toBe(true);
    expect(e.por_que_no_llega).toMatch(/\{\{C:mult\./);
    // Sin decir por qué no llega, en el medio no le alcanza: no cumple.
    const sinDecirlo = control({ ...structuredClone(ROJO_BUENO), por_que_no_llega: null });
    expect(queNoCumple(sinDecirlo.resultado)).toEqual(["ambicion"]);
    expect(sinDecirlo.resultado.find((r) => r.clave === "ambicion")!.detalle[0]).toMatch(/en el medio de su rango, multiplica la utilidad por 1\.8, no por dos/);
  });
});

describe("§9.2 · cada salida mala falla exactamente lo suyo", () => {
  const casos: [string, SalidaEquipoRojo, SalidaLenteDinero, ClaveControl[]][] = [
    ["tímida: jugadas sin efecto y sin decir por qué no llega", ROJO_TIMIDO, LENTE_DINERO_BUENA, ["ambicion", "mueve_dinero", "sale_a_ganar"]],
    ["genérica: frases de cualquiera, sin nada propio", ROJO_GENERICO, LENTE_DINERO_BUENA, ["de_esta_empresa", "sin_frases_de_relleno", "cuelga_de_lo_que_importa"]],
    ["alarmista: asusta y un caso sin salida", ROJO_ALARMISTA, LENTE_DINERO_BUENA, ["casos_con_solucion", "tono_sereno"]],
    ["con cifras: suelta, en palabras, «duplicar» sin cuenta y un id que no existe", ROJO_CON_CIFRAS, LENTE_DINERO_BUENA, ["cifras_con_origen"]],
    ["caminos iguales", ROJO_CAMINOS_IGUALES, LENTE_DINERO_BUENA, ["dos_caminos_distintos"]],
    ["camino roto: dos jugadas", ROJO_CAMINO_ROTO, LENTE_DINERO_BUENA, ["cifras_con_origen"]],
    ["la lente supone cuánto es hoy y usa el rubro como ancla", ROJO_BUENO, LENTE_SUPONE_HOY, ["cifras_con_origen"]],
  ];
  for (const [nombre, rojo, lente, esperado] of casos) {
    it(nombre, () => {
      const { resultado } = control(rojo, lente);
      expect(queNoCumple(resultado)).toEqual(esperado);
      for (const r of resultado.filter((x) => !x.cumple)) expect(r.detalle.length, r.clave).toBeGreaterThan(0);
    });
  }

  it("la tímida dice qué faltaría; con «por qué no llega» y su cuenta, la ambición se da por dicha", () => {
    const r = structuredClone(ROJO_TIMIDO);
    r.por_que_no_llega = "Con estas jugadas no se llega a {{C:mult.venta_x2}}: falta medir lo que deja cada venta.";
    expect(queNoCumple(control(r).resultado)).toEqual(["mueve_dinero", "sale_a_ganar"]);
    r.por_que_no_llega = "No se llega porque falta tiempo.";
    expect(queNoCumple(control(r).resultado)).toEqual(["ambicion", "mueve_dinero", "sale_a_ganar"]);
  });

  it("una jugada «por probar» todavía no mueve dinero: el ítem dice la pregunta que la destraba", () => {
    const sinTicket = entradasFrutas({ respuestas: entradasFrutas().respuestas.filter((x) => x.clave !== "ticket_promedio") });
    const { resultado } = control(ROJO_BUENO, LENTE_DINERO_BUENA, sinTicket);
    const mueve = resultado.find((x) => x.clave === "mueve_dinero")!;
    expect(mueve.cumple).toBe(false); // el camino B queda con una sola jugada con número: la recompra espera el ticket
    expect(mueve.detalle.join(" ")).toMatch(/La última vez que un cliente te compró, ¿cuánto gastó en esa compra\?/);
  });
});

describe("§9.2 · con la utilidad de hoy en cero o negativa, la ambición mide el punto de equilibrio", () => {
  const conGastos = (sueldos: number) => entradasFrutas({ costos: COSTOS_FRUTAS.map((c) => (c.nombre === "Sueldos" ? { ...c, dato: { valor: sueldos, estado: "contado" as const } } : { ...c })) });

  it("si a 90 días el camino no pasa el equilibrio y no dice por qué, no cumple", () => {
    const { calculos, resultado } = control({ ...structuredClone(ROJO_BUENO), por_que_no_llega: null }, LENTE_DINERO_BUENA, conGastos(50000));
    expect(calculos.multiplicador.estado).toBe("equilibrio_primero");
    const a = resultado.find((x) => x.clave === "ambicion")!;
    expect(a.cumple).toBe(false);
    expect(a.detalle.join(" ")).toMatch(/punto de equilibrio/);
  });
  it("si lo pasa en su rango alto, cumple (no se le pide multiplicar un cero)", () => {
    const { e, calculos, resultado } = control(ROJO_BUENO, LENTE_DINERO_BUENA, conGastos(28500));
    expect(calculos.multiplicador.estado).toBe("equilibrio_primero");
    expect(e.caminos.a.proyeccion.multiplo.d90.valor).toBeNull();
    expect(e.caminos.a.proyeccion.utilidad.d90.valor!.alto).toBeGreaterThan(0);
    expect(resultado.find((x) => x.clave === "ambicion")!.cumple).toBe(true);
  });
  it("si no lo pasa pero dice por qué con la cuenta, cumple", () => {
    const r = structuredClone(ROJO_BUENO);
    r.por_que_no_llega = "Primero hay que llegar a {{C:mult.venta_equilibrio}} al mes: estas jugadas solas no alcanzan.";
    expect(control(r, LENTE_DINERO_BUENA, conGastos(50000)).resultado.find((x) => x.clave === "ambicion")!.cumple).toBe(true);
  });
});

describe("§9.2 · las piezas de la lista", () => {
  it("el parecido de dos caminos: tipo de efecto y primera ref", () => {
    const { e } = control(ROJO_BUENO);
    expect(parecidoDeCaminos(e.caminos.a, e.caminos.b)).toBe(0);
    expect(parecidoDeCaminos(e.caminos.a, e.caminos.a)).toBe(1);
    const iguales = control(ROJO_CAMINOS_IGUALES).e;
    expect(parecidoDeCaminos(iguales.caminos.a, iguales.caminos.b)).toBe(1);
  });
  it("si el dueño decide solo en algún proceso, el camino recomendado tiene que quitárselo", () => {
    const r = structuredClone(ROJO_BUENO);
    r.cambios.a.agregar = [];
    r.cambios.a.para_el_dueno.pasos = r.cambios.a.para_el_dueno.pasos.slice(0, 4);
    const l = structuredClone(LENTE_DINERO_BUENA);
    l.camino.jugadas[1]!.reduce_dependencia_del_dueno = false;
    const res = control(r, l).resultado.find((x) => x.clave === "dependencia_del_dueno")!;
    expect(res.cumple).toBe(false);
    expect(res.detalle.join(" ")).toMatch(/«Compras», «Cobranza»/);
  });
  it("las oportunidades y amenazas necesitan fuente de afuera o la marca «falta investigar»", () => {
    const l = structuredClone(LENTE_DINERO_BUENA);
    l.foda.o[0]!.refs = ["K:3c3c0009"];
    expect(queNoCumple(control(ROJO_BUENO, l).resultado)).toEqual(["foda_con_hechos"]);
  });
  it("los cuatro cruces: si falta uno, no cumple", () => {
    const r = structuredClone(ROJO_BUENO);
    r.tows = r.tows.filter((t) => t.de !== "B.T1");
    r.tows.push({ de: "A.T1", estrategia: "Otra vez el mismo cruce, reescrito" });
    expect(queNoCumple(control(r).resultado)).toEqual(["cuatro_cruces"]);
  });
  it("las victorias empiezan en la primera semana, con una persona de la empresa", () => {
    const r = structuredClone(ROJO_BUENO);
    r.victorias_14_dias[0]!.responsable = "La consultora";
    expect(queNoCumple(control(r).resultado)).toEqual(["victorias_reales"]);
  });
  it("la oferta, con sus cuatro términos con respaldo o «sin dato»", () => {
    const l = structuredClone(LENTE_DINERO_BUENA);
    l.oferta.tiempo = { texto: "Llega rápido", refs: [] };
    expect(queNoCumple(control(ROJO_BUENO, l).resultado)).toEqual(["oferta_completa"]);
    l.oferta.tiempo = { texto: "Cuánto tarda: sin dato todavía", refs: [] };
    expect(queNoCumple(control(ROJO_BUENO, l).resultado)).toEqual([]);
  });
  it("«capacitar al personal» pasa si dice a quién; «redes sociales» pasa si dice el canal", () => {
    const l = structuredClone(LENTE_DINERO_BUENA);
    l.camino.que_pide.personas = "Capacitar al personal de reparto con Rosa";
    l.camino.que_pide.herramientas = "Un catálogo en redes sociales: WhatsApp y Facebook";
    expect(queNoCumple(control(ROJO_BUENO, l).resultado)).toEqual([]);
    l.camino.que_pide.personas = "Capacitar al personal";
    expect(queNoCumple(control(ROJO_BUENO, l).resultado)).toEqual(["sin_frases_de_relleno"]);
  });
  it("nombrar a un autor cuenta como relleno, no como cifra", () => {
    const r = structuredClone(ROJO_BUENO);
    r.objeciones[0]!.arreglo = "Como enseña Goldratt, se ataca la restricción";
    expect(queNoCumple(control(r).resultado)).toEqual(["sin_frases_de_relleno"]);
  });
});

describe("§9.2 · la lista misma", () => {
  it("cada clave tiene su nombre y lo que exige, sin dígitos salvo «90 días» (el equipo rojo la recibe para atacar)", () => {
    for (const k of CLAVES_CONTROL) {
      expect(LISTA_DE_CONTROL[k].nombre, k).toBeTruthy();
      expect(LISTA_DE_CONTROL[k].exige.replace(/\b(?:14|30|90) días\b/g, ""), k).not.toMatch(/\d|S\/|%/);
    }
    expect(Object.keys(LISTA_DE_CONTROL).sort()).toEqual([...CLAVES_CONTROL].sort());
  });
  it("las listas de relleno y de alarma no están vacías", () => {
    expect(FRASES_GENERICAS.length).toBeGreaterThan(5);
    expect(PALABRAS_ALARMA).toEqual(expect.arrayContaining(["grave", "peligro", "crisis", "catastrofe", "quiebra", "urgente", "alarmante", "fracaso"]));
  });
});

// ─── El catálogo de preguntas ────────────────────────────────────────────────────────────────────

describe("§7.1 · el catálogo pasa revisarPregunta", () => {
  const defs = Object.values(CLAVES_SUPUESTO);

  it("cada pregunta suelta, y la de capacidad con cada uno de los seis modelos (y sin modelo)", () => {
    const preguntas = defs
      .filter((d) => d.destino === "pregunta" && d.clave !== "otra")
      .flatMap((d) => [...MODELOS_NEGOCIO, null].map((m) => [d.clave, preguntaDe(d.clave, m)!] as const));
    expect(preguntas.length).toBeGreaterThan(MODELOS_NEGOCIO.length);
    for (const [clave, p] of preguntas) {
      expect(revisarPregunta(p), `${clave}: «${p}»`).toEqual([]);
      expect(palabrasQueElDuenoNoVe(p), clave).toEqual([]);
    }
  });

  it("la línea que se agrega a la nota de una sección tampoco trae cifras ni palabras del método", () => {
    for (const d of defs.filter((x) => x.para_dueno)) {
      expect(cifrasSinOrigen(d.para_dueno!), d.clave).toEqual([]);
      expect(palabrasQueElDuenoNoVe(d.para_dueno!), d.clave).toEqual([]);
    }
  });

  it("toda clave de cambio tiene límites; ninguna de estado actual acepta un rango de la IA", () => {
    const refs = refsDeBase(armarPaquete(entradasFrutas(), HOY), calcularTodo(entradasFrutas(), HOY));
    for (const d of defs) {
      if (d.tipo === "cambio") {
        expect(limitesDe(d.clave, { valor: (id) => refs.get(id)?.valor ?? null }).ok, d.clave).toBe(true);
      } else {
        const p = problemaDeSupuesto({ clave: d.clave, rango: { bajo: 1, alto: 2 }, unidad: "pct", ancla: null }, refs);
        expect(p?.tipo, d.clave).toBe("supuesto_de_estado_actual");
      }
    }
  });
});
