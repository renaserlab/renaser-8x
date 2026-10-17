/**
 * EL ARMADO, LAS CIFRAS PINTADAS, LA PÁGINA DEL DUEÑO Y QUÉ CAMBIÓ (src/lib/estrategia/{armar,texto,para-dueno,diferencias}.ts
 * · spec-estrategia-8x.md §6.1, §6.2, §7.3 y §8.2).
 *
 * Con la empresa FICTICIA «Frutas del Valle» y las salidas falsas del modelo (tests/fixtures/estrategia-falsa.ts).
 */
import { describe, it, expect } from "vitest";
import { armarPaquete, type EntradasPaquete } from "@/lib/estrategia/paquete";
import { calcularTodo } from "@/lib/estrategia/calculos";
import { armarEstrategia, conIds, idQueTieneElDato, ordenDeJuego, posicionDe, refsDeEstrategia, reproyectar, type EntradaArmado, type Estrategia } from "@/lib/estrategia/armar";
import { pintar, textoDeTrozos, textoPintado, FALTA_PARA_DUENO } from "@/lib/estrategia/texto";
import { contenidoEntregable, esPaginaDelDueno, FORMATO_PARA_DUENO, PaginaDelDuenoInvalida, textoDeFrase, textoDePagina, vistaParaDueno } from "@/lib/estrategia/para-dueno";
import { convieneRegenerar, cuantoSeMovio, diferencias } from "@/lib/estrategia/diferencias";
import { palabrasQueElDuenoNoVe, partesDeLineas, validar } from "@/lib/estrategia/validador";
import { CHIP_CONSULTORA, CHIP_DUENO, PARA_DUENO } from "@/lib/estrategia/textos";
import {
  entradasFrutas, HOY, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, ROJO_BUENO, ROJO_TIMIDO, METRICAS_FRUTAS, CLAIMS_FRUTAS, K, FICHA_NEGOCIO_FRUTAS,
} from "./fixtures/estrategia-falsa";

type Lentes = Pick<EntradaArmado, "lenteDinero" | "lenteTerreno" | "rojo">;

function version(entradas: EntradasPaquete = entradasFrutas(), cambiar: (x: Lentes) => void = () => {}) {
  const paquete = armarPaquete(entradas, HOY);
  const calculos = calcularTodo(entradas, HOY);
  const x: Lentes = { lenteDinero: structuredClone(LENTE_DINERO_BUENA), lenteTerreno: structuredClone(LENTE_TERRENO_BUENA), rojo: structuredClone(ROJO_BUENO) };
  cambiar(x);
  const estrategia = armarEstrategia({ paquete, calculos, ...x });
  return { paquete, calculos, estrategia, refs: refsDeEstrategia(estrategia, paquete, calculos) };
}

/** Un id interno escrito en un texto de pantalla: «C:poder.precio», «SA2», «J3», «R:a.total.d90». */
const UN_ID = /\b(?:[NLGBKFPDQTZXCSR]:[A-Za-z0-9_]|S[ABR]\d|J\d\b)/;

// ─── El armado ───────────────────────────────────────────────────────────────────────────────────

describe("§6.1 · armarEstrategia: el camino de la lente más los cambios del equipo rojo", () => {
  const { estrategia: e, refs } = version();

  it("los ids de las jugadas son estables: los de la lente conservan su número; la agregada, el siguiente", () => {
    // En el orden en que se juegan: la agregada (J5, habilitadora del día 7) va antes de la J2 que abre (día 14).
    expect(e.caminos.a.jugadas.map((j) => [j.id, j.de, j.origen])).toEqual([
      ["J1", "A.J1", "dinero"], ["J5", "rojo", "equipo_rojo"], ["J2", "A.J2", "dinero"], ["J3", "A.J3", "dinero"], ["J4", "A.J4", "dinero"],
    ]);
    expect(e.caminos.b.jugadas.map((j) => j.id)).toEqual(["J1", "J2", "J3"]);
    expect(e.caminos.b.cambiadas).toEqual([expect.objectContaining({ motivo: "quitada", por: null, jugada: expect.objectContaining({ id: "J4" }) })]);
    expect(posicionDe(e.caminos.a, "A.J5")).toBe(2);
  });

  it("las jugadas quedan en el orden en que se juegan: por su día de inicio, la habilitadora antes de la que abre, y cada paso del dueño con la suya", () => {
    expect(e.caminos.a.jugadas.map((j) => j.desde_dia)).toEqual([7, 7, 14, 14, 30]);
    // El paso que escribió el equipo rojo para la agregada (el último que escribió) viaja con ella al segundo lugar.
    expect(e.caminos.a.para_el_dueno.pasos[1]).toBe("Diego aprueba los descuentos con una regla, sin esperarte");
    expect(e.caminos.a.para_el_dueno.pasos[4]).toBe("Subimos el precio de la palta en los pedidos nuevos");
    // Una habilitadora que empieza más tarde que la jugada que abre se juega antes que ella.
    expect(ordenDeJuego([
      { id: "J1", desde_dia: 14, efecto: { tipo: "precio_general", pct: "SA1" } },
      { id: "J2", desde_dia: 20, efecto: { tipo: "habilitador", abre: "J1" } },
      { id: "J3", desde_dia: 3, efecto: { tipo: "precio_general", pct: "SA1" } },
    ])).toEqual([2, 1, 0]);
    // Las victorias, por el día en que empiezan.
    expect(e.victorias_14_dias.map((v) => v.desde_dia)).toEqual([1, 2, 3]);
    // «la jugada 4» que escribió la lente (su J4, el precio de la palta) pasa a la posición que hoy tiene: la quinta.
    expect(e.caminos.a.jugadas[0]!.que_abre).toBe("Deja de esconder pérdidas detrás de las ventas y prepara la lista de precios de la jugada 5");
    expect(e.caminos.b.jugadas[0]!.que_abre).toBe("Permite bajar la merma con la jugada 2");
  });

  it("un reemplazo recibe el número siguiente y la habilitadora que abría la reemplazada pasa a abrir su reemplazo", () => {
    const { estrategia } = version(undefined, (x) => (x.rojo.cambios.b = { ...x.rojo.cambios.b, quitar: [], reemplazar: [{ n: 2, jugada: structuredClone(LENTE_TERRENO_BUENA.camino.jugadas[1]!) }] }));
    const b = estrategia.caminos.b;
    expect(b.jugadas.map((j) => j.id)).toEqual(["J1", "J5", "J3", "J4"]);
    expect(b.jugadas[0]!.efecto).toEqual({ tipo: "habilitador", abre: "J5" });
    expect(b.cambiadas).toEqual([expect.objectContaining({ motivo: "reemplazada", por: "J5" })]);
  });

  it("los casos del equipo rojo van primero; el punto de decisión es el de la lente si el equipo rojo no lo cambia", () => {
    expect(e.caminos.a.casos.map((c) => c.origen)).toEqual(["equipo_rojo", "dinero", "dinero"]);
    expect(e.caminos.a.punto_de_decision_de).toBe("dinero");
    expect(e.caminos.a.para_el_dueno.titulo).toBe("Cobrar antes de crecer");
  });

  it("el FODA y los cruces elegidos se resuelven desde las lentes, con sus refs y su lente", () => {
    expect(e.foda.f.map((x) => [x.de, x.lente])).toEqual([["A.F1", "dinero"], ["B.F1", "terreno"]]);
    expect(e.foda.o[1]).toMatchObject({ de: "B.O2", sin_fuente_externa: true, refs: ["B:historia.que_pasaba"], reescrito: false });
    expect(e.tows.map((t) => [t.de, t.cuadrante, t.cruza])).toEqual([["A.T1", "FO", ["A.F1", "A.O1"]], ["A.T2", "DA", ["A.D1", "A.A1"]], ["B.T1", "FA", ["B.F1", "B.A1"]], ["B.T2", "DO", ["B.D2", "B.O1"]]]);
    const reescrito = version(undefined, (x) => (x.rojo.foda.d[0] = { de: "A.D1", texto: "Fía sin ninguna regla escrita" })).estrategia;
    expect(reescrito.foda.d[0]).toMatchObject({ texto: "Fía sin ninguna regla escrita", reescrito: true, refs: ["C:fuga.credito_incobrable", "B:credito.de_cada_10"] });
  });

  it("cada cruce trae su impacto calculado por el código; el que no tiene cuenta, su pregunta", () => {
    const fo = e.tows.find((t) => t.de === "A.T1")!;
    expect(fo.impacto.estado).toBe("con_numero");
    expect(fo.impacto.utilidad_mes.valor).toEqual({ bajo: 2500, alto: 4000 }); // «Palta» +5 a 8 %: 10 × 5.000 × 5 a 8 %
    const fa = e.tows.find((t) => t.de === "B.T1")!;
    expect(fa.impacto.estado).toBe("sin_efecto");
    expect(fa.impacto.utilidad_mes.motivo_nulo).toMatch(/¿cuántas cajas te devolvieron/);
  });

  it("los supuestos dicen dónde se usan; lo que falta, sin repetir clave y con quién lo pidió", () => {
    expect(e.supuestos.find((s) => s.id === "SA4")!.usado_en).toEqual(["a.J4", "A.T1"]);
    expect(e.supuestos.find((s) => s.id === "SB3")!.usado_en).toEqual([]); // su jugada la quitó el equipo rojo
    expect(e.faltan.map((f) => f.clave)).toEqual(["clientes_dormidos", "inversion_disponible_mes", "capacidad_extra_mes", "otra", "descuentos_mes"]);
    const dos = version(undefined, (x) => x.rojo.faltan.push({ clave: "clientes_dormidos", por_que_importa: "Para la jugada de recompra", pregunta_si_otra: null, unidad_si_otra: null })).estrategia;
    expect(dos.faltan.find((f) => f.clave === "clientes_dormidos")!.origen).toEqual(["dinero", "equipo_rojo"]);
  });

  it("la oferta es la de la lente del dinero si el equipo rojo no la reescribe", () => {
    expect(e.oferta).toMatchObject({ nombre: "Fruta en su punto", reescrita: false });
  });

  it("la nota de confianza la escribe el código con sus conteos", () => {
    expect(e.nota_de_confianza).toMatch(/^De las \d+ cifras que usa, \d+ son hechos, \d+ estimados del dueño y \d+ supuestos por confirmar\.$/);
    const timida = version(undefined, (x) => (x.rojo = structuredClone(ROJO_TIMIDO))).estrategia;
    expect(timida.nota_de_confianza).not.toMatch(/por probar/);
  });

  it("«si seguimos igual» y los anexos de la consultora citan cuentas que existen", () => {
    // 7.200 de crédito + 500 de lo que resta + 3.000 de merma = 10.700: sale de estimados, así que se escribe redondeado.
    expect(refs.get(e.si_seguimos_igual.mes)!.valor!.bajo).toBeCloseTo(10_700, 6);
    expect(refs.get(e.si_seguimos_igual.mes)!.texto).toBe("S/ 11,000");
    const c = e.anexos.cuentas;
    const ids = [...c.fugas.caja, c.fugas.total_caja, c.fugas.vitales, ...c.fugas.horas, ...c.fugas.oportunidad, ...c.fugas.parado, c.noventa_diez, ...c.productos, ...c.poder.utilidad, ...c.poder.caja, c.poder.utilidad_juntas, c.poder.caja_juntas, ...c.multiplicador, ...c.equilibrio, c.dependencia];
    for (const id of ids) expect(refs.has(id), id).toBe(true);
    expect(c.poder.utilidad[0]).toBe("C:poder.precio"); // la palanca que más mueve, primero
    expect(e.anexos.terreno.restriccion.refs).toEqual(["F:4d4d0001", "K:3c3c0006", "C:fuga.merma"]);
  });

  it("todo es JSON: se guarda tal cual en la versión", () => {
    expect(JSON.parse(JSON.stringify(e))).toEqual(e);
  });

  it("los ids locales que lee el equipo rojo", () => {
    const l = conIds(LENTE_DINERO_BUENA, "A");
    expect(Object.keys(l.ids)).toEqual(["A.F1", "A.F2", "A.D1", "A.D2", "A.O1", "A.A1", "A.T1", "A.T2", "A.J1", "A.J2", "A.J3", "A.J4"]);
    expect(LENTE_DINERO_BUENA).not.toHaveProperty("ids");
  });
});

describe("§6.1 · reproyectar: los números se rehacen sin tocar ningún texto", () => {
  it("corregir el rango de un supuesto rehace las cuentas del camino", () => {
    const { estrategia, paquete, calculos } = version();
    const cambiada = structuredClone(estrategia);
    cambiada.supuestos.find((s) => s.id === "SA4")!.rango = { bajo: 2, alto: 3 };
    const r = reproyectar(cambiada, paquete, calculos);
    const v = r.caminos.a.proyeccion.total.d90.ritmo.valor!;
    expect(v.bajo).toBeCloseTo(600 + 2880 + 1000, 6); // «Palta» ahora +2 a 3 %: 1.000 a 1.500
    expect(v.alto).toBeCloseTo(900 + 4320 + 1500, 6);
    expect(r.lectura).toEqual(estrategia.lectura);
  });

  it("lo que era «sin dato» y el dueño ya respondió pasa a citar su respuesta, y la jugada gana su número", () => {
    const sinRespuesta = entradasFrutas({ respuestas: entradasFrutas().respuestas.filter((x) => x.clave !== "interesados_mes") });
    const antes = version(sinRespuesta, (x) => {
      x.lenteDinero.supuestos.push({ id: "SA5", clave: "conversion.de_cada_10_nuevo", que_se_supone: "Cuántos de cada 10 interesados comprarían con la oferta", unidad: "de_cada_10", rango: { bajo: 5, alto: 6 }, ancla: "N:conversion_de_cada_10", por_que: "La oferta quita el miedo a la fruta pasada" });
      x.lenteDinero.camino.jugadas[3] = { ...x.lenteDinero.camino.jugadas[3]!, por_que: "Hoy preguntan {{X:interesados_mes}} y compran pocos", efecto: { tipo: "conversion", interesados: "X:interesados_mes", de_cada_10_nuevo: "SA5" } };
    });
    const j4 = antes.estrategia.caminos.a.proyeccion.jugadas.find((j) => j.id === "J4")!;
    expect(j4.proyeccion.estado).toBe("por_probar");
    expect(antes.estrategia.destraban.find((d) => d.id === "X:interesados_mes")).toMatchObject({ esperan: ["a.J4"], pregunta: expect.stringMatching(/¿cuántas personas te preguntaron precio/) });
    expect(validar(antes.estrategia, antes.refs, { partes: partesDeLineas(antes.calculos) }).errores).toEqual([]);

    // El dueño responde: «Actualizar números» rehace con el paquete nuevo.
    const p2 = armarPaquete(entradasFrutas(), HOY);
    const c2 = calcularTodo(entradasFrutas(), HOY);
    const despues = reproyectar(antes.estrategia, p2, c2);
    const jugada = despues.caminos.a.jugadas.find((j) => j.id === "J4")!;
    expect(jugada.efecto).toEqual({ tipo: "conversion", interesados: "Q:interesados_mes", de_cada_10_nuevo: "SA5" });
    expect(jugada.por_que).toBe("Hoy preguntan {{Q:interesados_mes}} y compran pocos");
    expect(despues.caminos.a.proyeccion.jugadas.find((j) => j.id === "J4")!.proyeccion.estado).toBe("con_numero");
    expect(despues.destraban.some((d) => d.id === "X:interesados_mes")).toBe(false);
    expect(validar(despues, refsDeEstrategia(despues, p2, c2), { partes: partesDeLineas(c2) }).errores).toEqual([]);
  });

  it("idQueTieneElDato: la respuesta, el número, el campo de la línea o el gasto", () => {
    const { refs } = version();
    expect(idQueTieneElDato("X:interesados_mes", refs)).toBe("Q:interesados_mes");
    expect(idQueTieneElDato("X:linea.precio@1a1a0001", refs)).toBe("L:1a1a0001.precio");
    expect(idQueTieneElDato("X:credito.dias", refs)).toBe("B:credito.dias");
    expect(idQueTieneElDato("X:clientes_dormidos", refs)).toBeNull(); // sigue sin dato
  });
});

// ─── Las cifras pintadas ─────────────────────────────────────────────────────────────────────────

describe("§6.2 · pintar: ningún id llega a la pantalla", () => {
  const { refs } = version();

  it("la consultora ve el valor con su chip, y al tocarlo, qué es y cómo se calcula", () => {
    const t = pintar("Vende {{N:venta_mes}}; seguir igual cuesta {{C:no_actuar.mes}} y el precio sube {{S:SA4}}.", refs, "consultora");
    // Lo que dijo el dueño va tal cual; la cuenta que sale de estimados, redondeada (sin precisión falsa).
    expect(textoDeTrozos(t)).toBe("Vende S/ 120,000; seguir igual cuesta S/ 11,000 y el precio sube entre 5 y 8 %.");
    const cifras = t.filter((x) => x.t === "cifra");
    // Una cuenta que sale de estimados lo dice en su chip: no se pinta igual que un cálculo con hechos.
    expect(cifras.map((x) => x.t === "cifra" && x.chip)).toEqual([CHIP_CONSULTORA.estimado, CHIP_CONSULTORA.calculo_estimado, CHIP_CONSULTORA.supuesto]);
    expect(JSON.stringify(t)).not.toMatch(UN_ID);
    const calculo = cifras[1]!;
    expect(calculo.t === "cifra" && calculo.detalle.map((d) => d.etiqueta)).toEqual(["Qué es", "Cómo se calcula", "Qué tan firme es"]);
  });

  it("lo que no tiene valor es «sin dato» rayado con su motivo; nunca «S/ 0»", () => {
    const t = pintar("La uva deja {{C:producto.1a1a0005.deja_mes}}.", refs, "consultora");
    const c = t.find((x) => x.t === "cifra")!;
    expect(c).toMatchObject({ texto: "sin dato", rayado: true, chip: CHIP_CONSULTORA.sin_dato });
    expect(textoDeTrozos(t)).not.toMatch(/S\/ 0/);
    // Un id que no existe tampoco se muestra.
    expect(textoPintado("Mira {{K:ffffffff}}", refs, "consultora")).toBe("Mira sin dato");
  });

  it("las unidades: veces, razón, de cada 10, días, y las descripciones como mención", () => {
    // Las veces, a un decimal: «×1.66» decía más de lo que se sabe.
    expect(textoPintado("{{R:a.multiplo.d90}}", refs, "consultora")).toBe("entre ×1.6 y ×2");
    expect(textoPintado("{{C:mult.margen}}", refs, "consultora")).toBe("0.33");
    expect(textoPintado("{{Q:clientes_que_vuelven_de_cada_10}}", refs, "consultora")).toBe("7 de cada 10");
    expect(textoPintado("{{C:poder.dias_cobro_hoy}}", refs, "consultora")).toBe("12 días");
    const m = pintar("Sube {{L:1a1a0001}} y ordena {{P:5e5e0004}}", refs, "consultora");
    expect(m.filter((x) => x.t === "mencion").map((x) => x.texto)).toEqual(["Palta", "Proceso «Cobranza» (área: Administración)"]);
    expect(textoPintado("{{C:dependencia.procesos}}", refs, "consultora")).toBe("participa en 3 de 4 procesos del mapa; en 2 de ellos es el único que decide");
  });

  it("el dueño ve «lo que nos dijiste», «estimado» o «por confirmar»; lo que falta no se pinta: se dice", () => {
    const t = pintar("Clientes {{Q:clientes_activos_mes}}, venta {{N:venta_mes}}, sube {{S:SA4}}, uva {{C:producto.1a1a0005.deja_mes}}", refs, "dueno");
    expect(t.filter((x) => x.t === "cifra").map((x) => x.t === "cifra" && x.chip)).toEqual([CHIP_DUENO.hecho, CHIP_DUENO.estimado, CHIP_DUENO.supuesto]);
    expect(t.find((x) => x.t === "falta")).toEqual({ t: "falta", texto: FALTA_PARA_DUENO });
    expect(textoDeTrozos(t)).not.toMatch(/sin dato|S\/ 0/);
  });

  it("una cifra que escribió la consultora a mano lleva su chip", () => {
    const t = pintar("Cobrar S/ 5,000 antes del viernes", refs, "consultora", { escritoPorConsultora: true });
    expect(t.find((x) => x.t === "cifra")).toMatchObject({ texto: "S/ 5,000", chip: CHIP_CONSULTORA.escrito_por_consultora });
  });
});

// ─── La página del dueño ─────────────────────────────────────────────────────────────────────────

describe("§8.2 · vistaParaDueno: solo el camino elegido, con las cifras ya escritas", () => {
  const { estrategia, refs } = version();
  const p = vistaParaDueno(estrategia, "a", refs);
  const todo = textoDePagina(p);

  it("sin ids, sin «{{», sin palabras del método y sin el otro camino", () => {
    expect(JSON.stringify(p)).not.toContain("{{");
    expect(todo).not.toMatch(UN_ID);
    expect(palabrasQueElDuenoNoVe(todo)).toEqual([]);
    expect(todo).not.toContain(estrategia.caminos.b.nombre);
    expect(todo).not.toContain("sin dato");
    expect(p.formato).toBe(FORMATO_PARA_DUENO);
  });

  it("el título, por qué, y los pasos con desde cuándo y quién", () => {
    expect(textoDeFrase(p.titulo)).toBe("Cobrar antes de crecer");
    expect(textoDeFrase(p.por_que)).toContain("te deben S/ 45,000");
    expect(p.pasos).toHaveLength(5);
    // En el orden en que se juegan: el dueño nunca lee «desde el día 7» después de «desde el día 30».
    expect(p.pasos.map((x) => x.desde_dia)).toEqual([7, 7, 14, 14, 30]);
    expect(p.pasos[1]).toMatchObject({ desde_dia: 7, quien: "Diego" });
    expect(textoDeFrase(p.pasos[1]!.que)).toBe("Diego aprueba los descuentos con una regla, sin esperarte");
    expect(p.pasos[2]).toMatchObject({ desde_dia: 14, quien: "Marta" });
  });

  it("qué esperamos ver, en rango y con «si»; si a los 30 días ya da lo mismo que a los 90, se dice una vez", () => {
    expect(p.esperamos.d30).toBeNull();
    expect(textoDeFrase(p.esperamos.d90)).toBe(`${PARA_DUENO.desde_los(30)}entre S/ 6,000 y S/ 9,200${PARA_DUENO.mas_al_mes}`);
    // La caja que libera cobrar antes va con lo que esperamos ver, no escondida en un paso.
    expect(textoDeFrase(p.esperamos.caja)).toBe(`${PARA_DUENO.caja_1}entre S/ 16,000 y S/ 32,000${PARA_DUENO.caja_2}`);
    // Lo que deja un camino depende de lo que se supone que cambia con cada jugada: para el dueño, «por confirmar».
    expect(p.esperamos.d90!.find((x) => x.t === "cifra")).toMatchObject({ chip: CHIP_DUENO.supuesto });
    expect(p.esperamos.falta).toBeNull();
    // Con la jugada de los hoteles (empieza el día 45), a los 30 y a los 90 días se espera distinto: dos líneas.
    const conHoteles = version(undefined, (x) => (x.rojo.cambios.b.quitar = []));
    const b = vistaParaDueno(conHoteles.estrategia, "b", conHoteles.refs);
    expect(textoDeFrase(b.esperamos.d30)).toMatch(/^A los 30 días: entre S\/ /);
    expect(textoDeFrase(b.esperamos.d90)).toMatch(/^A los 90 días: entre S\/ .* más al mes, si se cumple lo que estimamos\.$/);
    // El camino de la operación no libera caja de una vez: no hay línea de caja.
    expect(b.esperamos.caja).toBeNull();
  });

  it("sin número todavía: no hay hueco rayado, se dice que lo calculamos", () => {
    const t = version(undefined, (x) => (x.rojo = structuredClone(ROJO_TIMIDO)));
    const pt = vistaParaDueno(t.estrategia, "a", t.refs);
    expect(pt.esperamos).toEqual({ d30: null, d90: null, caja: null, falta: PARA_DUENO.falta_datos });
    // Si lo que falta es una respuesta del dueño a una pregunta de ESTE camino, se le dice que responda.
    const sinRespuestas = version(entradasFrutas({ respuestas: entradasFrutas().respuestas.filter((r) => r.clave !== "ticket_promedio" && r.clave !== "merma_mes") }));
    expect(vistaParaDueno(sinRespuestas.estrategia, "b", sinRespuestas.refs).esperamos).toEqual({ d30: null, d90: null, caja: null, falta: PARA_DUENO.falta_responder });
    const timidaSinTicket = version(entradasFrutas({ respuestas: entradasFrutas().respuestas.filter((r) => r.clave !== "ticket_promedio") }), (x) => (x.rojo = structuredClone(ROJO_TIMIDO)));
    expect(vistaParaDueno(timidaSinTicket.estrategia, "a", timidaSinTicket.refs).esperamos.falta).toBe(PARA_DUENO.falta_datos);
  });

  it("como mucho dos casos, primero los del equipo rojo; nunca el que sumó 8X", () => {
    expect(p.casos.map((c) => textoDeFrase(c.si_pasa))).toEqual(["Un cliente puntual pide un plazo más largo para las fiestas", "Un restaurante grande con deuda atrasada se molesta cuando se le suspende el crédito"]);
    const caja = version(undefined, (x) => (x.lenteDinero.camino.que_pide.dinero = "Comprar al contado: {{C:parado.deuda_clientes}}"));
    expect(textoDePagina(vistaParaDueno(caja.estrategia, "a", caja.refs))).not.toMatch(/Lo que pide este camino/);
  });

  it("si se cuela una palabra del método, falla en vez de mostrarla («por supuesto» sí se puede)", () => {
    const mala = structuredClone(estrategia);
    mala.caminos.a.para_el_dueno.pasos[0] = "Ajustamos el supuesto de precio";
    expect(() => vistaParaDueno(mala, "a", refs)).toThrow(PaginaDelDuenoInvalida);
    mala.caminos.a.para_el_dueno.pasos[0] = "Por supuesto, subimos el precio de la fruta picada";
    expect(() => vistaParaDueno(mala, "a", refs)).not.toThrow();
  });

  it("la copia de la biblioteca lleva solo la página del dueño", () => {
    const c = contenidoEntregable("e-1", 3, p);
    expect(Object.keys(c).sort()).toEqual(["estrategia_id", "formato", "para_dueno", "version"]);
    expect(esPaginaDelDueno(c)).toBe(true);
    expect(esPaginaDelDueno({ secciones: [] })).toBe(false);
    expect(JSON.stringify(c)).not.toMatch(/\{\{|lente|equipo_rojo|calculos/);
  });
});

// ─── Qué cambió ──────────────────────────────────────────────────────────────────────────────────

describe("§7.3 · diferencias y convieneRegenerar", () => {
  /** «Actualizar números»: la estrategia de antes, rehecha con el paquete y los cálculos de ahora. */
  function actualizar(antesEntradas: EntradasPaquete, despuesEntradas: EntradasPaquete) {
    const antes = version(antesEntradas);
    const p2 = armarPaquete(despuesEntradas, HOY);
    const c2 = calcularTodo(despuesEntradas, HOY);
    const despues = reproyectar(antes.estrategia, p2, c2);
    return diferencias({ paquete: antes.paquete, estrategia: antes.estrategia }, { paquete: p2, estrategia: despues });
  }
  const sin = (clave: string) => entradasFrutas({ respuestas: entradasFrutas().respuestas.filter((r) => r.clave !== clave) });

  it("el dueño respondió: entra su respuesta, deja de faltar, la jugada gana su número y los números se mueven", () => {
    const d = actualizar(sin("ticket_promedio"), entradasFrutas());
    expect(d.respondidas.map((r) => r.id)).toEqual(["Q:ticket_promedio"]);
    expect(d.ya_no_falta.map((x) => x.id)).toEqual(["X:ticket_promedio"]);
    expect(d.jugadas).toEqual([expect.objectContaining({ camino: "b", jugada: "J3", antes: "por_probar", despues: "con_numero" })]);
    expect(d.numeros.map((n) => `${n.camino}.${n.horizonte}`)).toEqual(["b.d30", "b.d90"]);
    expect(d.resumen[0]).toBe("El dueño respondió una pregunta.");
    // Nada de eso pide volver a pensarla.
    expect(convieneRegenerar(d)).toEqual({ conviene: false, motivos: [] });
  });

  it("un dato que pasa de estimado a hecho se dice así", () => {
    const verificada = entradasFrutas({ metricas: METRICAS_FRUTAS.map((m) => (m.clave === "conversion_de_cada_10" ? { ...m, estado: "verificado" } : { ...m })) });
    const d = actualizar(entradasFrutas(), verificada);
    expect(d.cambiaron).toEqual([expect.objectContaining({ id: "N:conversion_de_cada_10", que: "clase", texto: "de cada 10 interesados, cuántos compran pasó de estimado del dueño a hecho." })]);
  });

  it("conviene regenerar si una jugada pierde su número", () => {
    const d = actualizar(entradasFrutas(), sin("merma_mes"));
    expect(d.senales.jugadas_que_perdieron_su_numero).toEqual(["b.J2"]);
    expect(convieneRegenerar(d).motivos).toEqual(["una jugada que tenía número lo perdió o quedó restando"]);
  });

  it("conviene regenerar si el camino recomendado deja de ser el que más da a 90 días", () => {
    const sinIncobrables = entradasFrutas({ ficha_negocio: { ...structuredClone(FICHA_NEGOCIO_FRUTAS), credito: { ...FICHA_NEGOCIO_FRUTAS.credito, incobrables_de_cada_10: { estado: "no_lo_se" } } } });
    const d = actualizar(entradasFrutas(), sinIncobrables);
    expect(d.senales.recomendado_dejo_de_ser_el_que_mas_da).toBe(true);
    expect(convieneRegenerar(d).motivos).toContain("con lo respondido, el camino recomendado ya no es el que más deja a 90 días");
  });

  it("conviene regenerar si entra un hecho nuevo sobre lo que frena a la empresa", () => {
    const comprobada = entradasFrutas({ claims: CLAIMS_FRUTAS.map((c) => (c.id === K.equipo ? { ...c, comprobacion: "comprobado_por_consultor" } : { ...c })) });
    const d = actualizar(entradasFrutas(), comprobada);
    expect(d.senales.hechos_nuevos_sobre_la_restriccion).toEqual(["K:3c3c0006"]);
    expect(convieneRegenerar(d)).toEqual({ conviene: true, motivos: ["entró un dato nuevo sobre lo que frena a la empresa"] });
  });

  it("cuánto se movió un rango, por su centro", () => {
    expect(cuantoSeMovio({ bajo: 100, alto: 100 }, { bajo: 108, alto: 112 })).toBeCloseTo(0.1, 6);
    expect(cuantoSeMovio(null, { bajo: 1, alto: 1 })).toBeNull();
    expect(cuantoSeMovio({ bajo: 0, alto: 0 }, { bajo: 0, alto: 0 })).toBe(0);
  });
});

describe("una versión vieja y una nueva no se confunden con otra empresa", () => {
  it("dos armados con las mismas salidas dan lo mismo", () => {
    const a: Estrategia = version().estrategia;
    const b: Estrategia = version().estrategia;
    expect(b).toEqual(a);
  });
});
