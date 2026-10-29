/**
 * LA ESTRATEGIA APROBADA BAJA AL PLAN (src/lib/estrategia/al-plan.ts).
 *
 * Con la empresa FICTICIA «Frutas del Valle» y las salidas falsas del modelo (tests/fixtures/estrategia-falsa.ts):
 * se arma una estrategia de verdad, con sus cuentas, y se comprueba qué filas de plan salen de ella.
 *
 * LO QUE ESTO VIGILA, Y POR QUÉ. Hasta el 28-10-2026 aprobar una estrategia no escribía NADA en el plan: sus
 * victorias de 14 días, sus jugadas y sus números se quedaban como JSON dentro de la fila. El riesgo de la pieza
 * que lo arregla no es que no escriba: es que escriba MAL. Tres maneras de escribir mal, una por bloque:
 *
 *  1. INVENTAR. Rellenar «qué se espera que cambie» con una promesa en vez de con la cuenta ya hecha, o ponerle a
 *     un número una dirección («mejor si sube») que la estrategia no dice. Un número con la dirección al revés
 *     pinta en rojo el día que las cosas van bien.
 *  2. DUPLICAR. Aprobar dos veces, o aprobar la versión actualizada, y acabar con el plan dos veces escrito. Una
 *     acción duplicada se aprueba dos veces y cuenta dos veces para el límite de frentes.
 *  3. SALTARSE LA REGLA. Escribirlas «aprobadas» en vez de «propuestas» saltaría los seis mínimos, la autoridad y
 *     el límite de frentes de una vez.
 */
import { describe, it, expect } from "vitest";
import { armarPaquete, type EntradasPaquete } from "@/lib/estrategia/paquete";
import { calcularTodo } from "@/lib/estrategia/calculos";
import { armarEstrategia, refsDeEstrategia, type EntradaArmado } from "@/lib/estrategia/armar";
import { bajarAlPlan, loQueFalta, type Bajada } from "@/lib/estrategia/al-plan";
import { queLeFalta, CAMPOS_EDITABLES, ESTADOS } from "@/lib/plan-reglas";
import { entradasFrutas, HOY, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, ROJO_BUENO } from "./fixtures/estrategia-falsa";

type Lentes = Pick<EntradaArmado, "lenteDinero" | "lenteTerreno" | "rojo">;

function armada(entradas: EntradasPaquete = entradasFrutas(), cambiar: (x: Lentes) => void = () => {}) {
  const paquete = armarPaquete(entradas, HOY);
  const calculos = calcularTodo(entradas, HOY);
  const x: Lentes = { lenteDinero: structuredClone(LENTE_DINERO_BUENA), lenteTerreno: structuredClone(LENTE_TERRENO_BUENA), rojo: structuredClone(ROJO_BUENO) };
  cambiar(x);
  const estrategia = armarEstrategia({ paquete, calculos, ...x });
  return { paquete, calculos, estrategia, refs: refsDeEstrategia(estrategia, paquete, calculos) };
}

/** La bajada del camino A de la estrategia de Frutas del Valle, con las personas que el paquete conoce. */
function bajada(camino: "a" | "b" = "a"): Bajada & { personas: readonly { id: string; nombre: string }[]; hoy: string } {
  const { estrategia, paquete, refs } = armada();
  return {
    ...bajarAlPlan({ estrategia, camino, version: 1, refs, personas: paquete.personas, hoy: estrategia.hoy }),
    personas: paquete.personas,
    hoy: estrategia.hoy,
  };
}

const SIN_NADA = { acciones: [], claves: [] };

describe("de qué se llena cada campo del plan", () => {
  it("baja TODO lo que la estrategia dice que hay que hacer: las victorias de 14 días primero y después las jugadas del camino elegido", () => {
    const { estrategia } = armada();
    const b = bajada("a");
    const victorias = estrategia.victorias_14_dias.length;
    const jugadas = estrategia.caminos.a.jugadas.length;
    expect(victorias).toBeGreaterThan(0);
    expect(jugadas).toBeGreaterThan(0);
    expect(b.acciones).toHaveLength(victorias + jugadas);
    // Las victorias van delante y con la prioridad más alta: son lo que da resultado en la primera semana.
    expect(b.acciones.slice(0, victorias).map((a) => a.estrategia_ref)).toEqual(["v.1", "v.2", "v.3"]);
    expect(b.acciones.map((a) => a.prioridad)).toEqual([...Array(victorias + jugadas)].map((_, i) => i + 1));
    // Y el texto de cada una es el de la estrategia, palabra por palabra: nada se reescribe.
    expect(b.acciones[0]!.accion).toBe(estrategia.victorias_14_dias[0]!.que);
    expect(b.acciones[victorias]!.accion).toBe(estrategia.caminos.a.jugadas[0]!.que_se_mueve);
  });

  it("del camino B baja las jugadas del camino B, no las del A", () => {
    const { estrategia } = armada();
    const a = bajada("a").acciones.map((x) => x.accion);
    const b = bajada("b").acciones.map((x) => x.accion);
    expect(a).not.toEqual(b);
    for (const j of estrategia.caminos.b.jugadas) expect(b).toContain(j.que_se_mueve);
    expect(bajada("b").acciones.map((x) => x.estrategia_ref).filter((r) => r.startsWith("b."))).toHaveLength(estrategia.caminos.b.jugadas.length);
  });

  it("una jugada trae su «para qué», lo que abre, su riesgo y su supuesto, cada uno del campo que dice lo mismo", () => {
    const { estrategia } = armada();
    const j = estrategia.caminos.a.jugadas[0]!;
    const fila = bajada("a").acciones.find((a) => a.estrategia_ref === `a.${j.id}`)!;
    expect(fila.objetivo_empresarial).toBe(j.por_que);
    expect(fila.restriccion_oportunidad).toBe(j.que_abre);
    expect(fila.riesgos).toBe(j.si_responde_distinto);
    expect(fila.supuestos).toBe(j.respuesta_del_mercado);
  });

  it("una victoria no tiene «por qué» propio, así que su objetivo es la gran apuesta: no se inventa uno", () => {
    const { estrategia } = armada();
    for (const a of bajada("a").acciones.filter((x) => x.estrategia_ref.startsWith("v."))) {
      expect(a.objetivo_empresarial).toBe(estrategia.gran_apuesta.frase);
    }
  });

  it("«qué se espera que cambie» es la CUENTA YA HECHA, con su nombre y su cifra, y queda vacío cuando la estrategia no tiene número", () => {
    const { estrategia, refs } = armada();
    const b = bajada("a");
    // La primera victoria del fixture no trae efecto: sin cuenta no se promete nada.
    expect(estrategia.victorias_14_dias[0]!.efecto).toBeNull();
    expect(b.acciones[0]!.resultado_esperado).toBeNull();
    // La segunda sí: su texto es el de la ref, no una frase nueva.
    const conCuenta = b.acciones.find((a) => a.estrategia_ref === "v.2")!;
    const caja = refs.get("R:v.2.caja")!;
    expect(caja.valor).not.toBeNull();
    expect(conCuenta.resultado_esperado).toContain(caja.texto);
    expect(conCuenta.resultado_esperado).toContain(caja.nombre);
  });

  it("el responsable se apunta a una persona registrada SOLO cuando la estrategia dijo que la encontró", () => {
    const { estrategia, paquete } = armada();
    const b = bajada("a");
    const porNombre = new Map(paquete.personas.map((p) => [p.nombre, p.id]));
    let encontrados = 0;
    estrategia.victorias_14_dias.forEach((v, i) => {
      const fila = b.acciones[i]!;
      expect(fila.responsable).toBe(v.responsable);
      if (v.responsable_encontrado && porNombre.has(v.responsable)) {
        expect(fila.responsable_participant_id, v.responsable).toBe(porNombre.get(v.responsable));
        encontrados++;
      } else {
        expect(fila.responsable_participant_id, v.responsable).toBeNull();
      }
    });
    // Si ninguna se apuntara a nadie, esta prueba no estaría probando nada.
    expect(encontrados).toBeGreaterThan(0);
  });

  it("«la dueña» apunta a la dueña: se busca con el mismo buscador con el que la estrategia dijo que la encontró", () => {
    const { estrategia, refs } = armada();
    const trucada = structuredClone(estrategia);
    // El caso real del 29-10-2026: una empresa con UNA persona registrada, y la estrategia nombrándola por su
    // puesto. El armado la da por encontrada (resolverResponsable reconoce el puesto); la bajada al plan tenía su
    // propia comparación, exacta y por nombre completo, así que no apuntaba a nadie y la acción no se podía
    // aprobar nunca. Dos buscadores para la misma pregunta siempre terminan contestando distinto.
    trucada.victorias_14_dias[0] = { ...trucada.victorias_14_dias[0]!, responsable: "la dueña", responsable_encontrado: true };
    const personas = [{ id: "P-DUENA", nombre: "Rosi Alvina Huaqui Ramos", puesto: "Dueña" }];
    const b = bajarAlPlan({ estrategia: trucada, camino: "a", version: 1, refs, personas, hoy: trucada.hoy });
    expect(b.acciones[0]!.responsable).toBe("la dueña");
    expect(b.acciones[0]!.responsable_participant_id).toBe("P-DUENA");
  });

  it("si dos personas pueden ser «el jefe», no se adivina: queda sin apuntar y la ficha lo pide", () => {
    const { estrategia, refs } = armada();
    const trucada = structuredClone(estrategia);
    trucada.victorias_14_dias[0] = { ...trucada.victorias_14_dias[0]!, responsable: "el jefe de tienda", responsable_encontrado: true };
    const personas = [
      { id: "P1", nombre: "Ana Pérez", puesto: "Jefe de tienda" },
      { id: "P2", nombre: "Luis Soto", puesto: "Jefe de tienda" },
    ];
    const b = bajarAlPlan({ estrategia: trucada, camino: "a", version: 1, refs, personas, hoy: trucada.hoy });
    expect(b.acciones[0]!.responsable_participant_id).toBeNull();
  });

  it("un responsable que la estrategia NO encontró no se apunta a nadie, aunque haya alguien con ese nombre", () => {
    const { estrategia, paquete, refs } = armada();
    const trucada = structuredClone(estrategia);
    // Mismo nombre, pero marcado como no encontrado: adivinarlo sería ponerle una persona que nadie eligió.
    trucada.victorias_14_dias[1] = { ...trucada.victorias_14_dias[1]!, responsable_encontrado: false };
    const b = bajarAlPlan({ estrategia: trucada, camino: "a", version: 1, refs, personas: paquete.personas, hoy: trucada.hoy });
    expect(b.acciones[1]!.responsable).toBe(trucada.victorias_14_dias[1]!.responsable);
    expect(b.acciones[1]!.responsable_participant_id).toBeNull();
  });

  it("las fechas se cuentan desde el día del paquete congelado, no desde el reloj de la máquina", () => {
    const { estrategia } = armada();
    const b = bajada("a");
    expect(estrategia.hoy).toBe("2026-10-16");
    // El armado ya dejó las victorias en orden de día (ordenarVictorias): 1, 2 y 3.
    expect(estrategia.victorias_14_dias.map((v) => v.desde_dia)).toEqual([1, 2, 3]);
    // «desde_dia: 1» es hoy mismo; el 2, un día después; el 3, dos.
    expect(b.acciones.slice(0, 3).map((a) => a.fecha_inicio)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
    // Catorce días contados desde que empieza, el último incluido: es lo que la victoria promete.
    expect(b.acciones.slice(0, 3).map((a) => a.vence_at)).toEqual(["2026-10-29", "2026-10-30", "2026-10-31"]);
  });

  it("una jugada NO lleva fecha de vencimiento: la estrategia dice cuándo empieza y ninguna dice cuándo acaba", () => {
    for (const a of bajada("a").acciones.filter((x) => !x.estrategia_ref.startsWith("v."))) {
      expect(a.vence_at, a.accion).toBeNull();
      expect(a.fecha_inicio, a.accion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("la semana del plan no pasa de 7 aunque la jugada empiece el día 90: el día exacto va en la fecha y en la nota", () => {
    const { estrategia, paquete, refs } = armada();
    const trucada = structuredClone(estrategia);
    trucada.caminos.a.jugadas[0] = { ...trucada.caminos.a.jugadas[0]!, desde_dia: 90 };
    const b = bajarAlPlan({ estrategia: trucada, camino: "a", version: 1, refs, personas: paquete.personas, hoy: trucada.hoy });
    const fila = b.acciones.find((a) => a.estrategia_ref === `a.${trucada.caminos.a.jugadas[0]!.id}`)!;
    expect(fila.semana_inicio).toBe(7);
    expect(fila.fecha_inicio).toBe("2027-01-13");
    expect(fila.nota).toContain("día 90");
  });

  it("cada acción dice en su nota de qué estrategia, qué versión y qué camino salió", () => {
    for (const a of bajada("b").acciones) {
      expect(a.nota).toContain("versión 1");
      expect(a.nota).toContain("camino B");
    }
  });
});

describe("las reglas del plan no se saltan", () => {
  it("nacen PROPUESTAS: aprobar la estrategia y aprobar una acción son dos actos distintos", () => {
    for (const a of bajada("a").acciones) expect(a.estado).toBe("propuesto");
    expect(ESTADOS).toContain("propuesto");
  });

  it("ninguna acción nace con los seis mínimos completos, y lo que le falta es solo lo que la estrategia NO dice", () => {
    for (const a of bajada("a").acciones) {
      const falta = queLeFalta({ ...a, evidencia_ids: [], depende_de: [], es_prioridad: false });
      // Lo que falta siempre: la estrategia no tiene vocabulario para el criterio de aceptación ni para el
      // indicador con el que se mide. Si algún día lo tuviera, esta prueba lo dirá.
      expect(falta.join(" "), a.accion).toContain("criterio de aceptación");
      expect(falta.join(" "), a.accion).toContain("indicador");
      // Y el objetivo empresarial NUNCA falta: lo da la jugada o la gran apuesta.
      expect(falta.join(" "), a.accion).not.toContain("objetivo empresarial");
    }
  });

  it("no nace marcada como prioridad: marcarla abre un frente y eso lo decide la consultora contra su límite", () => {
    for (const a of bajada("a").acciones) expect((a as Record<string, unknown>).es_prioridad).toBeUndefined();
  });

  it("solo escribe campos que la ficha del plan reconoce: nada que el PATCH no pudiera cambiar después", () => {
    const propios = new Set(["estrategia_ref", "estado"]);
    for (const a of bajada("a").acciones) {
      for (const k of Object.keys(a)) {
        if (propios.has(k)) continue;
        expect(CAMPOS_EDITABLES as readonly string[], k).toContain(k);
      }
    }
  });
});

describe("los números que se miden desde el día 1", () => {
  it("baja uno por cada número de la estrategia, activo y con su clave en snake_case", () => {
    const { estrategia } = armada();
    const b = bajada("a");
    expect(b.indicadores).toHaveLength(estrategia.medir_desde_el_dia_1.length);
    expect(b.indicadores.map((i) => i.clave)).toEqual(["deuda_atrasada", "cajas_devueltas_en_la_puerta"]);
    expect(b.indicadores.map((i) => i.estrategia_ref)).toEqual(["m.1", "m.2"]);
    for (const i of b.indicadores) {
      // Activos, no propuestos: son parte de lo que la consultora acaba de aprobar, y un número que nadie
      // activa no se puede anotar.
      expect(i.estado).toBe("activo");
      expect(i.origen).toBe("accion");
    }
  });

  it("el nombre, cómo se mide y cada cuánto son los de la estrategia, y «quién lo anota» no se pierde", () => {
    const { estrategia } = armada();
    const b = bajada("a");
    estrategia.medir_desde_el_dia_1.forEach((m, i) => {
      const fila = b.indicadores[i]!;
      expect(fila.nombre).toBe(m.nombre);
      expect(fila.como_se_mide).toBe(m.como_se_mide);
      expect(fila.frecuencia).toBe(m.frecuencia);
      // No hay columna para «quién lo anota», así que va donde se guarda la procedencia: alguien lo irá a buscar.
      expect(fila.origen_texto).toContain(m.quien_anota);
    });
  });

  it("sin punto de partida y sin meta, la dirección queda NEUTRA: no se adivina si es mejor que suba o que baje", () => {
    const { estrategia } = armada();
    // El fixture no les pone meta_30: ninguna dirección se puede calcular.
    for (const m of estrategia.medir_desde_el_dia_1) expect(m.meta_30).toBeNull();
    for (const i of bajada("a").indicadores) {
      expect(i.mejor_si).toBe("neutro");
      expect(i.meta_valor).toBeNull();
      expect(i.meta_texto).toBeNull();
    }
  });

  it("con punto de partida y meta, la dirección se CALCULA comparándolos: no la dice el modelo", () => {
    const { estrategia, paquete, calculos } = armada();
    const refs = new Map(refsDeEstrategia(estrategia, paquete, calculos));
    const falsa = (nombre: string, bajo: number, alto: number) => ({
      valor: { bajo, alto }, unidad: "soles" as const, texto: `S/ ${bajo}`, clase: "hecho" as const, formula: "x", nombre,
    });
    refs.set("X:base", falsa("Deuda de hoy", 100, 100));
    refs.set("X:meta30", falsa("Deuda en 30 días", 40, 60));
    refs.set("X:meta90", falsa("Deuda en 90 días", 10, 10));
    const trucada = structuredClone(estrategia);
    trucada.medir_desde_el_dia_1[0] = { ...trucada.medir_desde_el_dia_1[0]!, base: "X:base", meta_30: "X:meta30", meta_90: "X:meta90" };
    const b = bajarAlPlan({ estrategia: trucada, camino: "a", version: 1, refs, personas: paquete.personas, hoy: trucada.hoy });
    const i = b.indicadores[0]!;
    // La meta (50 de media) es menor que el punto de partida (100): mejor si BAJA.
    expect(i.mejor_si).toBe("baja");
    // Un rango no es un número: «de 40 a 60» no entra en meta_valor, entra entero en el texto.
    expect(i.meta_valor).toBeNull();
    expect(i.meta_texto).toContain("Deuda en 30 días");
    expect(i.meta_texto).toContain("Deuda en 90 días");
    // La unidad sale de la unidad de su propio número, no de un valor por defecto.
    expect(i.unidad).toBe("soles");

    // Y al revés: una meta mayor que el punto de partida es «mejor si sube», con su número cuando no es rango.
    refs.set("X:meta30", falsa("Ventas en 30 días", 180, 180));
    const subiendo = bajarAlPlan({ estrategia: trucada, camino: "a", version: 1, refs, personas: paquete.personas, hoy: trucada.hoy });
    expect(subiendo.indicadores[0]!.mejor_si).toBe("sube");
    expect(subiendo.indicadores[0]!.meta_valor).toBe(180);
  });
});

describe("aprobar dos veces no duplica el plan", () => {
  it("la primera vez hay que escribirlo todo", () => {
    const b = bajada("a");
    const falta = loQueFalta(b, SIN_NADA, ["E1"]);
    expect(falta.acciones).toHaveLength(b.acciones.length);
    expect(falta.indicadores).toHaveLength(b.indicadores.length);
    expect(falta.ya_estaban).toBe(0);
  });

  it("volver a aprobar la MISMA versión no escribe nada: lo que ya bajó se queda como está", () => {
    const b = bajada("a");
    const ya = {
      acciones: b.acciones.map((a) => ({ estrategia_id: "E1", estrategia_ref: a.estrategia_ref, accion: a.accion })),
      claves: b.indicadores.map((i) => i.clave),
    };
    const falta = loQueFalta(b, ya, ["E1"]);
    expect(falta.acciones).toEqual([]);
    expect(falta.indicadores).toEqual([]);
    expect(falta.ya_estaban).toBe(b.acciones.length + b.indicadores.length);
  });

  it("aprobar la versión ACTUALIZADA tampoco duplica: los textos son los mismos aunque la estrategia sea otra fila", () => {
    const b = bajada("a");
    // «Actualizar números» copia los textos y solo rehace las cuentas: casi todo llega palabra por palabra.
    // Esas acciones pueden estar ya en ejecución o verificadas; reescribirlas borraría trabajo hecho.
    const ya = {
      acciones: b.acciones.map((a) => ({ estrategia_id: "E1", estrategia_ref: a.estrategia_ref, accion: a.accion })),
      claves: b.indicadores.map((i) => i.clave),
    };
    const falta = loQueFalta(b, ya, ["E2"]);
    expect(falta.acciones).toEqual([]);
    expect(falta.ya_estaban).toBe(b.acciones.length + b.indicadores.length);
  });

  it("corregirle la redacción a una acción ya no la duplica: la pieza se reconoce por su origen en la cadena", () => {
    const b = bajada("a");
    // Lo que pasaba hasta el 29-10-2026: la consultora corrige la redacción de una acción en su ficha (que es el
    // único sitio donde se puede, una vez aprobada la estrategia), pulsa «Actualizar números», y la versión nueva
    // vuelve a bajar la misma pieza con el texto viejo, al lado de la corregida. El único candado entre versiones
    // era el texto, y corregirlo es justo lo que lo desarma.
    const ya = {
      acciones: b.acciones.map((a) => ({ estrategia_id: "E1", estrategia_ref: a.estrategia_ref, accion: `${a.accion} (con la redacción corregida a mano)` })),
      claves: b.indicadores.map((i) => i.clave),
    };
    expect(loQueFalta(b, ya, ["E2"]).acciones).toHaveLength(b.acciones.length);
    expect(loQueFalta(b, ya, ["E2", "E1"]).acciones).toEqual([]);
  });

  it("una jugada NUEVA de la versión actualizada sí baja, y las que ya estaban no", () => {
    const b = bajada("a");
    const ya = {
      acciones: b.acciones.slice(1).map((a) => ({ estrategia_id: "E1", estrategia_ref: a.estrategia_ref, accion: a.accion })),
      claves: [b.indicadores[0]!.clave],
    };
    const falta = loQueFalta(b, ya, ["E2"]);
    expect(falta.acciones.map((a) => a.accion)).toEqual([b.acciones[0]!.accion]);
    expect(falta.indicadores.map((i) => i.clave)).toEqual([b.indicadores[1]!.clave]);
  });

  it("el mismo texto con otros acentos, otras mayúsculas u otros espacios cuenta como el mismo: no entra dos veces", () => {
    const b = bajada("a");
    const revuelto = (s: string) => `  ${s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}  `.replace(/ +/g, "  ");
    const ya = { acciones: b.acciones.map((a) => ({ estrategia_id: "E9", estrategia_ref: null, accion: revuelto(a.accion) })), claves: [] };
    expect(loQueFalta(b, ya, ["E1"]).acciones).toEqual([]);
  });

  it("un número con una clave que la empresa ya usa no se crea otra vez, venga de donde venga", () => {
    const b = bajada("a");
    const falta = loQueFalta(b, { acciones: [], claves: ["deuda_atrasada"] }, ["E1"]);
    expect(falta.indicadores.map((i) => i.clave)).toEqual(["cajas_devueltas_en_la_puerta"]);
  });

  it("lo que escribió el planificador o una persona NO frena a la estrategia por su referencia, solo por su texto", () => {
    const b = bajada("a");
    // Filas sin estrategia (estrategia_id en nulo): no comparten `estrategia_ref` con nadie.
    const ya = { acciones: [{ estrategia_id: null, estrategia_ref: null, accion: "Cualquier otra cosa" }], claves: [] };
    expect(loQueFalta(b, ya, ["E1"]).acciones).toHaveLength(b.acciones.length);
  });
});
