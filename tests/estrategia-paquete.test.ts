/**
 * EL PAQUETE DE HECHOS (src/lib/estrategia/paquete.ts · spec-estrategia-8x.md §3 y §9.3).
 *
 * Cada fila de la tabla de clasificación del §3.2, los ids estables (y alargados cuando chocan), lo que falta como
 * «sin dato» con su clave, los recortes dichos, la huella, el mínimo para generar y las lecturas que fallan sin romper.
 * Con dos empresas FICTICIAS (tests/fixtures/estrategia-falsa.ts): nada de clientes reales.
 *
 * Lo que vive en la base (la lectura con tope, el candado de área de `soloConclusionesDeHoy`, la lectura crítica que
 * lanza) se prueba con la lectura, en el tramo 4 (paquete-datos.ts). Al final, lo que tests/provisionales.test.ts fijaba
 * sobre el plan estratégico de antes (handlePlanEstrategico, retirado en el tramo 8) se fija aquí sobre la estrategia:
 * leído de la base (la falsa), lo provisional y lo de un área que hoy no llega al mínimo nunca les llegan a las lentes.
 */
import { describe, it, expect, vi } from "vitest";
import {
  armarPaquete, paqueteComoTexto, huellaPaquete, minimoParaEstrategia, refsDelPaquete, idsCortos, textoDeValor, textoDeRecortes,
  claseDeEstadoDato, TOPE_PAQUETE, type Hecho, type Paquete,
} from "@/lib/estrategia/paquete";
import { calcularTodo, refsDeCalculos } from "@/lib/estrategia/calculos";
import { CLAVES_SUPUESTO } from "@/lib/estrategia/supuestos";
import { FALTA_PARA_GENERAR } from "@/lib/estrategia/textos";
import { porDefecto } from "@/lib/formato";
import { entradasFrutas, entradasDental, HOY, K, F, L, uuid } from "./fixtures/estrategia-falsa";
import { leerEntradasPaquete, ErrorLecturaCritica } from "@/lib/estrategia/paquete-datos";
import { materialLente } from "@/lib/estrategia/motor";
import { crearBaseEstrategia, sembrarEmpresa } from "./fixtures/base-estrategia";
import type { AfirmacionEntrada, HallazgoEntrada } from "@/lib/estrategia/paquete";

// Solo las pruebas del final leen de una base: la falsa de la estrategia (tests/fixtures/base-estrategia.ts).
const estado = vi.hoisted(() => ({ base: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));

const frutas = () => armarPaquete(entradasFrutas(), HOY);
const hecho = (p: Paquete, id: string): Hecho => {
  const h = p.hechos.find((x) => x.id === id);
  if (!h) throw new Error(`no está el hecho ${id}`);
  return h;
};
const corto = (uuid: string) => uuid.replace(/-/g, "").slice(0, 8);

describe("§3.2 · los números (company_metricas): la equivalencia es solo estadoDatoDesdeMetrica", () => {
  it("verificado es hecho; extraído es hecho provisional; contado es estimado «dicho de memoria»", () => {
    const p = frutas();
    expect(hecho(p, "N:deuda_clientes")).toMatchObject({ clase: "hecho", fuente: { tabla: "company_metricas", como: "verificado con un documento" }, valor: { bajo: 45000, alto: 45000 } });
    expect(hecho(p, "N:costo_variable_mes")).toMatchObject({ clase: "hecho", provisional: true, fuente: { como: "leído de un documento, falta revisar" } });
    expect(hecho(p, "N:venta_mes")).toMatchObject({ clase: "estimado", fuente: { como: "dicho de memoria" }, unidad: "soles" });
  });

  it("el más reciente lleva el id corto; los otros meses y la mejor época llevan su periodo", () => {
    const p = frutas();
    expect(hecho(p, "N:venta_mes").valor).toEqual({ bajo: 120000, alto: 120000 });
    expect(hecho(p, "N:venta_mes@2026-08")).toMatchObject({ clase: "hecho", valor: { bajo: 110000, alto: 110000 } });
    expect(hecho(p, "N:venta_mes@epoca_dorada").valor).toEqual({ bajo: 160000, alto: 160000 });
    expect(hecho(p, "N:venta_mes").texto).toBe("La venta del mes (setiembre de 2026): S/ 120,000");
  });

  it("descartado o sin estado no entra, y se dice en los recortes", () => {
    const p = frutas();
    expect(p.hechos.some((h) => h.id === "N:gasto_fijo_mes@2026-07")).toBe(false);
    expect(p.hechos.some((h) => h.id === "N:caja_hoy@2026-06")).toBe(false);
    expect(p.recortes).toContainEqual(expect.objectContaining({ grupo: "números sin estado o descartados", incluidos: 0, total: 2 }));
  });

  it("«sin dato» con valor nulo es sin dato y dice que el dueño no lo sabe; un sinónimo se lleva a su clave", () => {
    const p = armarPaquete(entradasDental(), HOY);
    expect(p.sin_dato).toContainEqual(expect.objectContaining({ id: "X:gasto_fijo_mes", clave: "gasto_fijo_mes", dijo_no_lo_se: true }));
    // «ventas_mes» es un sinónimo de venta_mes (metricas.ts).
    expect(hecho(p, "N:venta_mes").valor).toEqual({ bajo: 18000, alto: 18000 });
  });
});

describe("§3.2 · lo que vende, sus gastos y su ficha (EstadoDato)", () => {
  it("comprobado o contado es hecho; estimado es estimado; un rango dicho es a ojo; «no lo sé» es sin dato", () => {
    const p = frutas();
    const palta = corto(L.palta);
    expect(hecho(p, `L:${palta}.precio`)).toMatchObject({ clase: "hecho", fuente: { como: "lo tiene anotado o lo contó" } });
    expect(hecho(p, `L:${palta}.unidades`)).toMatchObject({ clase: "estimado", fuente: { como: "lo calcula a ojo" }, valor: { bajo: 5000, alto: 5000 } });
    // El costo de la palta sale de sus partes (compra 5,5 + flete 0,5), las dos contadas.
    expect(hecho(p, `L:${palta}.costo`)).toMatchObject({ clase: "hecho", valor: { bajo: 6, alto: 6 } });
    const uva = corto(L.uva);
    expect(p.hechos.some((h) => h.id === `L:${uva}.costo`)).toBe(false);
    expect(p.sin_dato).toContainEqual(expect.objectContaining({ id: `X:linea.costo@${uva}`, clave: "linea.costo" }));
    // Gastos: contado es hecho, el rango a ojo es estimado.
    expect(hecho(p, "G:2b2b0001")).toMatchObject({ clase: "hecho", valor: { bajo: 8000, alto: 8000 } });
    expect(hecho(p, "G:2b2b0003")).toMatchObject({ clase: "estimado", valor: { bajo: 2000, alto: 3000 } });
    // Ficha del negocio.
    expect(hecho(p, "B:credito.de_cada_10")).toMatchObject({ clase: "hecho", unidad: "de_cada_10" });
    expect(hecho(p, "B:credito.dias")).toMatchObject({ clase: "estimado", unidad: "dias" });
    expect(hecho(p, "B:inventario.parado")).toMatchObject({ clase: "estimado", valor: { bajo: 2000, alto: 4000 } });
    expect(hecho(p, "B:historia.que_pasaba")).toMatchObject({ clase: "percepcion" });
  });

  it("un gasto con «no lo sé» es sin dato con su clave, nunca cero", () => {
    const p = armarPaquete(entradasDental(), HOY);
    expect(p.hechos.some((h) => h.id.startsWith("G:"))).toBe(false);
    expect(p.sin_dato).toContainEqual(expect.objectContaining({ id: "X:gastos_mes@7c7c0001", clave: "gastos_mes", dijo_no_lo_se: true }));
  });

  it("si dijo que no vende al crédito, no se le piden los datos del crédito", () => {
    const e = entradasFrutas();
    e.ficha_negocio = { ...e.ficha_negocio, modulos: { ...e.ficha_negocio.modulos, credito: false }, credito: {} };
    const p = armarPaquete(e, HOY);
    expect(hecho(p, "B:credito.no_vende").clase).toBe("percepcion");
    expect(p.sin_dato.some((s) => s.clave.startsWith("credito."))).toBe(false);
  });

  it("la clase de cada EstadoDato, en una sola función", () => {
    expect(claseDeEstadoDato("comprobado")).toBe("hecho");
    expect(claseDeEstadoDato("contado")).toBe("hecho");
    expect(claseDeEstadoDato("estimado")).toBe("estimado");
    expect(claseDeEstadoDato("no_lo_se")).toBe("sin_dato");
  });
});

describe("§3.2 · las afirmaciones (claims), en orden: gana la primera regla que se cumple", () => {
  const p = frutas();
  const k = (id: string) => `K:${corto(id)}`;

  it("contradicha, caducada o refutada va a contradicciones, con lo que la contradice", () => {
    expect(p.contradicciones).toContainEqual({ id: k(K.contradicha), texto: "El cliente objetivo son cadenas con muchos locales", versus: "Casi toda la venta es a restaurantes de un solo local" });
    expect(p.contradicciones).toContainEqual({ id: k(K.refutada), texto: "Todos los clientes pagan a tiempo", versus: "lo que le deben dice otra cosa" });
    expect(p.hechos.some((h) => h.id === k(K.contradicha) || h.id === k(K.refutada))).toBe(false);
  });

  it("aspiracional es deseo, aunque esté confirmada", () => {
    expect(p.deseos).toContainEqual(expect.objectContaining({ id: k(K.deseo), fuente: "lo dijo el dueño" }));
  });

  it("comprobada, registro de la empresa y lo que vio la consultora son hechos", () => {
    expect(hecho(p, k(K.comprobada))).toMatchObject({ clase: "hecho", fuente: { como: "comprobado" }, pilar: "marketing" });
    expect(hecho(p, k(K.registro))).toMatchObject({ clase: "hecho", fuente: { como: "registro de la empresa" } });
    expect(hecho(p, k(K.vio))).toMatchObject({ clase: "hecho", fuente: { como: "lo vio la consultora" } });
  });

  it("un documento sin revisar o mal leído es hecho provisional; uno revisado, hecho con su fecha", () => {
    expect(hecho(p, k(K.documentoPendiente))).toMatchObject({ clase: "hecho", provisional: true });
    expect(hecho(p, k(K.fotoBorrosa))).toMatchObject({ clase: "hecho", provisional: true });
    const revisado = hecho(p, k(K.documentoRevisado));
    expect(revisado.provisional).toBeUndefined();
    expect(revisado.fuente.como).toBe("documento de la empresa, del 2026-05-01");
  });

  it("una cifra dicha en una entrevista es estimado, aunque esté confirmada (la regla de la cifra va antes)", () => {
    expect(hecho(p, k(K.cifraEntrevista))).toMatchObject({ clase: "estimado", fuente: { como: "lo dijo el dueño en la entrevista" } });
    expect(hecho(p, k(K.precioDicho)).clase).toBe("estimado");
  });

  it("confirmada sin comprobación es percepción confirmada; lo demás, percepción con quién lo dijo", () => {
    expect(hecho(p, k(K.confirmada))).toMatchObject({ clase: "percepcion", confirmada: true, fuente: { como: "lo dijo el dueño y lo confirmó" } });
    expect(hecho(p, k(K.equipo))).toMatchObject({ clase: "percepcion", fuente: { como: "lo dijo una persona del equipo (Compradora)" } });
    expect(hecho(p, k(K.audio))).toMatchObject({ clase: "percepcion", fecha: "2026-09-25" });
    expect(hecho(p, k(K.equipo)).confirmada).toBeUndefined();
  });

  it("una observación que escribió el cliente sobre sí mismo no es «lo vio la consultora»", () => {
    const e = entradasFrutas({ claims: [{ ...entradasFrutas().claims[1]!, fuente: { tipo: "observacion", origen: "cliente" } }] });
    expect(armarPaquete(e, HOY).hechos.find((h) => h.id.startsWith("K:"))!.clase).toBe("percepcion");
  });
});

describe("§3.2 · los hallazgos: lo provisional nunca entra", () => {
  const p = frutas();
  const f = (id: string) => `F:${corto(id)}`;

  it("aprobado o corregido es conclusión revisada; el anterior a la columna (provisional null) también", () => {
    expect(p.conclusiones.find((c) => c.id === f(F.revisado))).toMatchObject({ revisada: true, impacto: "alto" });
    expect(p.conclusiones.find((c) => c.id === f(F.anterior))).toMatchObject({ revisada: true, impacto: null });
  });

  it("pendiente es hipótesis; provisional, rechazado y pendiente provisional no entran", () => {
    expect(p.conclusiones.find((c) => c.id === f(F.pendiente))).toMatchObject({ revisada: false });
    const titulos = p.conclusiones.map((c) => c.titulo).join(" | ");
    expect(titulos).not.toContain("TITULO-provisional");
    expect(titulos).not.toContain("TITULO-rechazado");
    expect(titulos).not.toContain("TITULO-pendiente-provisional");
    expect(p.conteo.hipotesis).toBe(1);
  });

  it("cita sus afirmaciones por su id corto, y solo las que están en el paquete", () => {
    expect(p.conclusiones.find((c) => c.id === f(F.revisado))!.refs).toEqual([`K:${corto(K.registro)}`, `K:${corto(K.equipo)}`].sort());
  });

  it("con solo hallazgos provisionales no hay conclusiones, y el texto no los nombra", () => {
    const e = entradasFrutas({ findings: entradasFrutas().findings.filter((x) => x.provisional === true) });
    const solo = armarPaquete(e, HOY);
    expect(solo.conclusiones).toEqual([]);
    expect(paqueteComoTexto(solo, refsDelPaquete(solo)).texto).not.toContain("TITULO-");
  });
});

describe("§3.2 · la ficha de dirección vigente", () => {
  const p = frutas();
  const todo = JSON.stringify(p);

  it("lo que el asistente propuso y nadie revisó no entra, ni lo descartado", () => {
    expect(todo).not.toContain("PROPUESTA-SIN-REVISAR");
    expect(todo).not.toContain("DESCARTADO");
    expect(todo).not.toContain("DIMENSION-SIN-REVISAR");
  });

  it("propósito y resultados deseados son deseos; fortalezas, percepción con la etiqueta de la ficha", () => {
    expect(p.deseos).toContainEqual({ id: "D:proposito:p1", texto: "Que los restaurantes reciban la fruta en su punto", fuente: "Dijo el dueño" });
    expect(p.deseos).toContainEqual(expect.objectContaining({ id: "D:resultados_deseados:r1", texto: "Vender 200.000 al mes" }));
    expect(hecho(p, "D:fortalezas:f1")).toMatchObject({ clase: "percepcion", fuente: { como: "Interpretamos" } });
  });

  it("las cuentas de la ficha y los números que ya están en los nueve no se repiten: se dice en los recortes", () => {
    expect(todo).not.toContain("le faltan 80.000");
    expect(p.recortes).toContainEqual(expect.objectContaining({ grupo: "cuentas de la ficha de dirección", total: 1 }));
    expect(p.recortes).toContainEqual(expect.objectContaining({ grupo: "números de hoy de la ficha de dirección", total: 1 }));
  });

  it("lo que el dueño dijo de su dependencia es percepción, por dimensión y campo", () => {
    expect(hecho(p, "D:dependencia.comercial.que_se_detiene")).toMatchObject({ clase: "percepcion", fuente: { como: "lo dijo el dueño sobre lo que se detiene sin él" } });
  });
});

describe("§3.2 · procesos, respuestas del dueño, contexto y personas", () => {
  const p = frutas();

  it("un proceso confirmado es hecho; uno dibujado sin confirmar, percepción", () => {
    expect(hecho(p, "P:5e5e0001")).toMatchObject({ clase: "hecho", texto: "Proceso «Compras» (área: Operaciones)" });
    expect(hecho(p, "P:5e5e0004").clase).toBe("percepcion");
  });

  it("la respuesta del dueño entra como Q:<clave> con la clase de su estado; «no lo sé» queda sin dato", () => {
    expect(hecho(p, "Q:interesados_mes")).toMatchObject({ clase: "hecho", valor: { bajo: 500, alto: 500 }, fuente: { tabla: "estrategia_preguntas", como: "respondió el dueño el 2026-10-12" } });
    expect(hecho(p, "Q:ticket_promedio").clase).toBe("estimado");
    expect(p.sin_dato.some((s) => s.clave === "interesados_mes")).toBe(false);
    const e = entradasFrutas();
    e.respuestas = [{ ...e.respuestas[0]!, respuesta: { estado: "no_lo_se" } }];
    expect(armarPaquete(e, HOY).sin_dato).toContainEqual(expect.objectContaining({ id: "X:interesados_mes", dijo_no_lo_se: true }));
  });

  it("el calendario son los tres meses que siguen a hoy en la zona de la empresa, y la referencia del rubro es contexto", () => {
    expect(p.contexto.calendario.map((t) => t.id)).toEqual(["T:2026-11", "T:2026-12", "T:2027-01"]);
    expect(p.contexto.referencia).toEqual([{ id: "Z:rubro.merma", texto: "En la distribución de perecibles, la merma suele ser una de las fugas más grandes" }]);
    expect(p.hechos.some((h) => h.id.startsWith("Z:") || h.id.startsWith("T:"))).toBe(false);
    // A las 23:30 de Lima del 31-12 ya es 1-1 en UTC: el calendario sigue la zona de la empresa.
    const p2 = armarPaquete(entradasFrutas(), new Date("2027-01-01T04:30:00Z"));
    expect(p2.empresa.hoy).toBe("2026-12-31");
    expect(p2.contexto.calendario[0]!.id).toBe("T:2027-01");
  });

  it("las personas son las de la empresa, sin los clientes", () => {
    expect(p.personas.map((x) => x.nombre)).toEqual(["Diego", "Julio", "Marta", "Rosa"]);
  });

  it("la empresa: rubro, personas leídas de la ficha, modelo, moneda y hoy", () => {
    expect(p.empresa).toEqual({ sector: "Distribución de alimentos", personas: 14, modelo_negocio: ["compra_y_revende"], tipo_trabajo: "estructurar_y_sistematizar", moneda: "PEN", zona: "America/Lima", hoy: "2026-10-16" });
    expect(armarPaquete(entradasDental(), HOY).empresa.personas).toBeNull();
  });
});

describe("§3.4 · ids estables", () => {
  it("dos armados con las filas en otro orden dan el mismo paquete", () => {
    const e = entradasFrutas();
    const al_reves = entradasFrutas({ claims: [...e.claims].reverse(), lineas: [...e.lineas].reverse(), metricas: [...e.metricas].reverse(), findings: [...e.findings].reverse(), costos: [...e.costos].reverse() });
    expect(armarPaquete(al_reves, HOY)).toEqual(armarPaquete(e, HOY));
  });

  it("ocho caracteres del uuid; si dos chocan en la misma empresa, doce", () => {
    const p = frutas();
    expect(p.hechos.some((h) => h.id === "K:3c3c00ffaaaa")).toBe(true);
    expect(p.hechos.some((h) => h.id === "K:3c3c00ffbbbb")).toBe(true);
    expect(p.hechos.some((h) => h.id === `K:${corto(K.registro)}`)).toBe(true);
    const ids = idsCortos(["abcdef01-1111-4000-8000-000000000001", "abcdef01-2222-4000-8000-000000000002", "12345678-0000-4000-8000-000000000003"]);
    expect([...ids.values()]).toEqual(["abcdef011111", "abcdef012222", "12345678"]);
    // Si aun con doce chocan, el id entero.
    expect([...idsCortos(["aaaaaaaa-bbbb-4000-8000-000000000001", "aaaaaaaa-bbbb-4000-8000-000000000002"]).values()]).toEqual(["aaaaaaaabbbb40008000000000000001", "aaaaaaaabbbb40008000000000000002"]);
  });

  it("todo id cabe en el Ref de la salida del modelo", () => {
    const p = frutas();
    const ref = /^(N|L|G|B|K|F|P|D|Q|T|Z|X|C|S|R):[A-Za-z0-9_.:@-]{1,80}$/;
    const ids = [...p.hechos, ...p.sin_dato, ...p.conclusiones, ...p.deseos, ...p.contradicciones, ...p.contexto.calendario, ...p.contexto.referencia, ...p.lineas].map((x) => x.id);
    expect(ids.filter((id) => !ref.test(id))).toEqual([]);
    const calc = refsDeCalculos(calcularTodo(entradasFrutas(), HOY));
    expect([...calc.keys()].filter((id) => !ref.test(id))).toEqual([]);
  });
});

describe("§4.4 · por probar: toda clave «cuánto es hoy» sin dato queda en sin_dato con su clave", () => {
  it("cada sin dato nombra una clave del catálogo de estado actual", () => {
    for (const p of [frutas(), armarPaquete(entradasDental(), HOY)]) {
      for (const s of p.sin_dato) {
        expect(CLAVES_SUPUESTO[s.clave]?.tipo, s.id).toBe("estado_actual");
        expect(s.que_falta.length).toBeGreaterThan(3);
      }
    }
  });

  it("la empresa casi vacía tiene en sin dato lo que se pregunta suelto y lo que se pide por sección", () => {
    const ids = armarPaquete(entradasDental(), HOY).sin_dato.map((s) => s.id);
    for (const id of ["X:interesados_mes", "X:ticket_promedio", "X:clientes_que_vuelven_de_cada_10", "X:dias_pago_proveedor", "X:horas_dueno_operacion_semana", "X:capacidad_extra_mes", "X:caja_hoy", "X:ganancia_mes", "X:credito.dias", "X:inventario.parado"]) {
      expect(ids, id).toContain(id);
    }
    expect(ids).not.toContain("X:otra");
  });

  it("lo que ya tiene dato no queda en sin dato", () => {
    const ids = frutas().sin_dato.map((s) => s.id);
    expect(ids).not.toContain("X:venta_mes");
    expect(ids).not.toContain("X:gastos_mes");
    expect(ids).not.toContain("X:credito.dias");
    expect(ids).toContain("X:descuentos_mes");
  });
});

describe("§3.5 · el paquete como texto: nada se recorta en silencio", () => {
  const e = entradasFrutas();
  const p = armarPaquete(e, HOY);
  const refs = new Map([...refsDelPaquete(p), ...refsDeCalculos(calcularTodo(e, HOY))]);

  it("una línea por elemento, con id, clase, de dónde salió, fecha y pilar", () => {
    const { texto } = paqueteComoTexto(p, refs);
    expect(texto).toContain(`[K:${corto(K.equipo)}] (percepción · lo dijo una persona del equipo (Compradora) · 2026-09-10 · procesos) Cuando la compradora no está, se compra por precio y la fruta llega pasada`);
    expect(texto).toContain("[C:poder.precio] (cálculo · sale de estimados) Precio +1 %: S/ 1,200");
    expect(texto).toContain("[X:descuentos_mes] (sin dato)");
    expect(texto.length).toBeLessThanOrEqual(TOPE_PAQUETE);
    // Sin recorte por tamaño: solo los que ya traía el paquete.
    expect(paqueteComoTexto(p, refs).recortes).toEqual(p.recortes);
  });

  it("con un tope chico se recorta por prioridad, se cuenta y nunca se pasa del tope", () => {
    const tope = 6000;
    const { texto, recortes } = paqueteComoTexto(p, refs, tope);
    expect(texto.length).toBeLessThanOrEqual(tope);
    expect(texto).toContain("CÁLCULOS DE 8X");
    expect(texto).not.toContain("LO QUE QUIERE EL DUEÑO");
    const deseos = recortes.find((r) => r.grupo === "deseos")!;
    expect(deseos).toMatchObject({ incluidos: 0, total: 3, criterio: "no entraron por tamaño; se priorizó lo confirmado y lo reciente" });
    for (const r of recortes) expect(r.incluidos).toBeLessThanOrEqual(r.total);
    expect(textoDeRecortes(recortes)).toContain("8X usó 0 de 3 (deseos)");
  });

  it("dentro de un grupo, primero lo confirmado y lo más reciente", () => {
    const { texto } = paqueteComoTexto(p, refs);
    const grupo = texto.slice(texto.indexOf("HECHOS\n"), texto.indexOf("ESTIMADOS DEL DUEÑO"));
    // Los provisionales van al final de su grupo.
    expect(grupo.lastIndexOf("provisional")).toBeGreaterThan(grupo.indexOf("(hecho ·"));
    expect(grupo.indexOf(`K:${corto(K.documentoPendiente)}`)).toBeGreaterThan(grupo.indexOf(`K:${corto(K.registro)}`));
  });

  it("la tope de lectura se dice: «8X usó 16 de 640 afirmaciones»", () => {
    expect(p.recortes).toContainEqual({ grupo: "afirmaciones", incluidos: 16, total: 640, criterio: "la lectura trae como mucho este número de filas por empresa; se priorizó lo más reciente" });
  });
});

describe("la huella del paquete", () => {
  it("igual con las mismas filas, distinta si cambia un valor, igual al día siguiente", () => {
    const base = huellaPaquete(frutas());
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaPaquete(armarPaquete(entradasFrutas(), HOY))).toBe(base);
    expect(huellaPaquete(armarPaquete(entradasFrutas(), new Date("2026-10-17T15:00:00Z")))).toBe(base);
    expect(huellaPaquete(armarPaquete(entradasFrutas(), new Date("2026-11-20T15:00:00Z")))).toBe(base);
    const otra = entradasFrutas();
    otra.metricas = otra.metricas.map((m) => (m.clave === "venta_mes" && m.periodo === "2026-09" ? { ...m, valor: 121000 } : m));
    expect(huellaPaquete(armarPaquete(otra, HOY))).not.toBe(base);
    // Los recortes y las lecturas fallidas no cambian la huella: dependen de cómo se leyó, no de la empresa.
    expect(huellaPaquete(armarPaquete(entradasFrutas({ totales: { claims: 9000 }, lecturas_fallidas: [{ tabla: "x", motivo: "y" }] }), HOY))).toBe(base);
  });
});

describe("§3.6 · el mínimo para generar, dicho antes de gastar", () => {
  it("la empresa con datos pasa; la casi vacía no, con lo que falta en palabras de consultora", () => {
    expect(minimoParaEstrategia(frutas())).toEqual([]);
    expect(minimoParaEstrategia(armarPaquete(entradasDental(), HOY))).toEqual([FALTA_PARA_GENERAR.gastos, FALTA_PARA_GENERAR.diagnostico]);
  });

  it("sin la venta del mes no hay base; la ganancia sola alcanza como gasto; quince hechos alcanzan como diagnóstico", () => {
    const sinVenta = entradasFrutas();
    sinVenta.metricas = sinVenta.metricas.filter((m) => m.clave !== "venta_mes");
    expect(minimoParaEstrategia(armarPaquete(sinVenta, HOY))).toEqual([FALTA_PARA_GENERAR.venta]);
    const dental = entradasDental();
    dental.metricas.push({ id: "m-g", clave: "ganancia_mes", periodo: "2026-09", valor: 4000, estado: "contado" });
    dental.claims = Array.from({ length: 15 }, (_, i) => ({ ...dental.claims[0]!, id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, texto: `percepción ${i}` }));
    expect(minimoParaEstrategia(armarPaquete(dental, HOY))).toEqual([]);
  });
});

describe("lo que no se pudo leer no rompe nada", () => {
  it("una tabla ausente queda en lecturas_fallidas y su parte sale «sin dato»; el texto lo dice", () => {
    const p = armarPaquete(entradasDental(), HOY);
    expect(p.lecturas_fallidas).toEqual([{ tabla: "ficha_negocio", motivo: "esta parte no está habilitada en esta base" }]);
    expect(p.sin_dato.some((s) => s.clave === "credito.dias")).toBe(true);
    expect(paqueteComoTexto(p, refsDelPaquete(p)).texto).toContain("NO HABILITADO EN ESTA BASE (sus datos salen como sin dato): ficha_negocio");
  });
});

describe("refsDelPaquete · lo que vale cada id del paquete", () => {
  const p = frutas();
  const refs = refsDelPaquete(p);

  it("un número con su cifra y su clase; lo que falta, sin dato con su motivo (nunca cero)", () => {
    expect(refs.get("N:venta_mes")).toMatchObject({ valor: { bajo: 120000, alto: 120000 }, clase: "estimado", texto: "S/ 120,000", unidad: "soles" });
    expect(refs.get("X:descuentos_mes")).toMatchObject({ valor: null, clase: "sin_dato", texto: "sin dato" });
    expect(refs.get("X:descuentos_mes")!.motivo_nulo).toMatch(/^falta: /);
    expect(refs.get("N:costo_variable_mes")!.provisional).toBe(true);
  });

  it("las líneas, las conclusiones, los deseos y el contexto existen como texto", () => {
    expect(refs.get(`L:${corto(L.palta)}`)).toMatchObject({ unidad: "texto", texto: "Palta" });
    expect(refs.get(`F:${corto(F.revisado)}`)!.texto).toBe("El criterio de compra vive en una sola persona");
    expect(refs.get("T:2026-12")!.texto).toContain("Diciembre 2026");
    expect(refs.get("Z:rubro.merma")!.formula).toBe("referencia del rubro, no es dato de la empresa");
  });

  it("los valores se escriben con la moneda y la unidad, una sola vez al final del rango", () => {
    expect(textoDeValor({ bajo: 10, alto: 12 }, "dias", porDefecto)).toBe("entre 10 y 12 días");
    expect(textoDeValor({ bajo: 1, alto: 1 }, "dias", porDefecto)).toBe("1 día");
    expect(textoDeValor({ bajo: 12.000000000000002, alto: 12.000000000000002 }, "dias", porDefecto)).toBe("12 días");
    expect(textoDeValor({ bajo: 3, alto: 4 }, "de_cada_10", porDefecto)).toBe("entre 3 y 4 de cada 10");
    expect(textoDeValor({ bajo: 1.5, alto: 2 }, "veces", porDefecto)).toBe("entre ×1.5 y ×2");
    expect(textoDeValor({ bajo: 4000, alto: 4000 }, "soles", porDefecto)).toBe("S/ 4,000");
    expect(textoDeValor(null, "soles", porDefecto)).toBe("sin dato");
  });
});

// ─── Lo provisional nunca les llega a las lentes, leído de la base (de tests/provisionales.test.ts, tramo 8) ──────────

describe("leído de la base: lo provisional y lo de un área corta nunca les llegan a las lentes (antes, al estratega)", () => {
  const EMP = "emp-provisionales";
  /** N afirmaciones confirmadas de un área: las que cuenta el candado del área (5 por área, con las transversales). */
  const confirmadas = (n: number, pilar: string, prefijo: string): AfirmacionEntrada[] =>
    Array.from({ length: n }, (_, i) => ({ ...entradasFrutas().claims[0]!, id: uuid(`${prefijo}${String(i + 1).padStart(4, "0")}`, i + 1), texto: `confirmada de ${pilar} ${i + 1}`, pilar, estado: "confirmado", comprobacion: null }));
  let n = 0;
  const hallazgo = (titulo: string, extra: Partial<HallazgoEntrada> = {}): HallazgoEntrada => ({
    id: uuid(`9a9a${String(++n).padStart(4, "0")}`, n), titulo, causa_raiz: `causa de ${titulo}`, impacto: "alto", pilar: "procesos", estado_revision: "aprobado",
    provisional: false, origen: "ia", created_at: "2026-09-20T10:00:00Z", claim_ids: [], ...extra,
  });
  /** Lee la empresa de la base, la arma y devuelve lo que recibiría cada lente. */
  async function loQueRecibenLasLentes(claims: AfirmacionEntrada[], findings: HallazgoEntrada[]) {
    estado.base = crearBaseEstrategia(sembrarEmpresa(entradasFrutas({ claims, findings }), EMP));
    const leidas = await leerEntradasPaquete(EMP);
    const p = armarPaquete(leidas, HOY);
    const c = calcularTodo(leidas, HOY);
    const texto = (["dinero", "terreno"] as const).map((l) => JSON.stringify(materialLente(l, p, c))).join("\n");
    return { p, texto };
  }

  it("a las lentes les llegan las conclusiones y nunca lo provisional (ni el pendiente provisional); con solo provisionales no llega ninguna", async () => {
    const { p, texto } = await loQueRecibenLasLentes(confirmadas(5, "procesos", "8b8b"), [
      hallazgo("TITULO-f-conclusion"),
      hallazgo("TITULO-f-provisional", { provisional: true }),
      hallazgo("TITULO-f-pendiente-provisional", { provisional: true, estado_revision: "pendiente" }),
      hallazgo("TITULO-f-anterior", { provisional: null }),
    ]);
    expect(p.conclusiones.map((x) => x.titulo).sort()).toEqual(["TITULO-f-anterior", "TITULO-f-conclusion"]);
    expect(p.conclusiones.every((x) => x.revisada)).toBe(true);
    expect(texto).toContain("TITULO-f-conclusion");
    expect(texto).toContain("TITULO-f-anterior");
    expect(texto).not.toContain("TITULO-f-provisional");
    expect(texto).not.toContain("TITULO-f-pendiente-provisional");

    const solo = await loQueRecibenLasLentes(confirmadas(5, "procesos", "8b8b"), [hallazgo("TITULO-f-provisional", { provisional: true })]);
    expect(solo.p.conclusiones).toEqual([]);
    expect(solo.p.conteo.hipotesis).toBe(0);
    expect(solo.texto).not.toContain("TITULO-f-");
  });

  it("lo de la IA de un área que hoy no llega al mínimo no llega, ni aprobado ni pendiente; lo de la consultora sí", async () => {
    // Personas bajó a 4 confirmadas (la columna provisional todavía dice false); producto tiene sus 5.
    const claims = [...confirmadas(4, "personas", "8c8c"), ...confirmadas(5, "producto", "8d8d")];
    const { p, texto } = await loQueRecibenLasLentes(claims, [
      hallazgo("TITULO-f-ia-aprobado", { pilar: "personas" }),
      hallazgo("TITULO-f-ia-pendiente", { pilar: "personas", estado_revision: "pendiente" }),
      hallazgo("TITULO-f-consultora", { pilar: "personas", origen: "consultor" }),
      hallazgo("TITULO-f-ia-producto", { pilar: "producto" }),
    ]);
    expect(p.conclusiones.map((x) => x.titulo).sort()).toEqual(["TITULO-f-consultora", "TITULO-f-ia-producto"]);
    expect(texto).toContain("TITULO-f-consultora");
    expect(texto).toContain("TITULO-f-ia-producto");
    expect(texto).not.toContain("TITULO-f-ia-aprobado");
    expect(texto).not.toContain("TITULO-f-ia-pendiente");
    // Con solo lo de un área corta no hay de dónde partir.
    const corta = await loQueRecibenLasLentes(confirmadas(4, "personas", "8c8c"), [hallazgo("TITULO-f-ia-aprobado", { pilar: "personas" })]);
    expect(corta.p.conclusiones).toEqual([]);
  });

  it("si no se pueden contar las confirmadas del área, no se supone que alcanza: no se arma nada y se dice por qué", async () => {
    const b = crearBaseEstrategia(sembrarEmpresa(entradasFrutas({ claims: confirmadas(5, "personas", "8c8c"), findings: [hallazgo("TITULO-f-ia-aprobado", { pilar: "personas" })] }), EMP));
    // Solo falla la cuenta (un select con head); leer las afirmaciones sigue funcionando.
    const from = b.from;
    estado.base = {
      ...b,
      from: (tabla: string) => {
        const q = from(tabla);
        if (tabla !== "claims") return q;
        const select = q.select;
        q.select = (c?: string, o?: { count?: string; head?: boolean }) => {
          select(c, o);
          if (o?.head) Object.assign(q, { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: null, count: null, error: { code: "57014", message: "la base no responde" } }).then(res, rej) });
          return q;
        };
        return q;
      },
    };
    const error = await leerEntradasPaquete(EMP).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorLecturaCritica);
    expect(error).toMatchObject({ tabla: "findings" });
    expect(String((error as Error).message)).toContain("No se pudo contar las afirmaciones confirmadas de personas");
  });
});
