/**
 * LA PÁGINA DE LA ESTRATEGIA, PARA LA CONSULTORA (spec-estrategia-8x.md §8.1, §8.3, §8.4 y §9.3), RENDERIZADA A HTML
 * EN NODE. Tramo 6. La parte del dueño (su «Plan» y sus preguntas, tramo 7) vive en su propia prueba.
 *
 * Lo que se fija:
 *  - arriba solo la lectura y la gran apuesta; los dos caminos con las mismas secciones en el mismo orden y el detalle
 *    plegado; el recomendado con su porqué; «Si seguimos igual»;
 *  - ningún id en la página de la consultora (ni en lo que se ve, ni en sus etiquetas), ni «lente» ni «equipo rojo»;
 *  - «sin dato» rayado y nunca «S/ 0»; la jugada «por probar» con lo que falta y su pregunta;
 *  - el original de 8X a mano junto a lo que corrigió la consultora; el lápiz solo donde se corrige y solo en una
 *    versión lista o con observaciones;
 *  - la vista previa del dueño antes de aprobar (la misma pieza que él lee), sin el otro camino ni palabras del método;
 *    con cosas por resolver, el botón dice cuántas y lleva a ellas;
 *  - sin estrategia, con qué se haría y UN botón (generar, o pedírselo al cliente); generándose, sus etapas;
 *  - la vista para imprimir; la copia en la biblioteca (VistaEntregable) pinta la página del dueño y nunca un <pre>;
 *  - /plan-estrategico lleva a /estrategia (por next.config.ts: la carpeta vieja se retiró en el tramo 8);
 *  - lo puro de la página (pantalla.ts y marcas.ts): el lugar en palabras, sin ids, las cifras entre ⟦ ⟧.
 *
 * Cómo se prueba, para no llamar verificado a lo que no lo está: `supabaseAdmin()` es la base en memoria de la
 * estrategia (tests/fixtures/base-estrategia.ts) y la versión se arma con las salidas falsas de
 * tests/fixtures/estrategia-falsa.ts, sin ningún modelo. Las pantallas se renderizan con renderToStaticMarkup: nadie las
 * abrió en un navegador aquí, y lo que pasa al tocar (corregir, elegir, aprobar, abrir el detalle de una cifra) no se
 * ejecuta. Empresas FICTICIAS.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { existsSync } from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { crearBaseEstrategia, type BaseEstrategia } from "./fixtures/base-estrategia";
import type { Fila } from "./fixtures/base-falsa";
import { entradasDental, entradasFrutas, HOY, LENTE_DINERO_BUENA, LENTE_TERRENO_BUENA, RESPUESTAS_FRUTAS, ROJO_BUENO, ROJO_CON_CIFRAS } from "./fixtures/estrategia-falsa";
import type { EntradasPaquete } from "@/lib/estrategia/paquete";
import type { SalidaEquipoRojo } from "@/lib/estrategia/esquemas";

const estado = vi.hoisted(() => ({ base: null as unknown, redirigido: null as string | null }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => estado.base }));
vi.mock("@/lib/errores", () => ({ registrarError: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/empresa/x/estrategia",
  useSearchParams: () => new URLSearchParams(),
  redirect: (a: string) => {
    estado.redirigido = a;
    throw new Error("NEXT_REDIRECT");
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
// 8X lee la empresa con leerEntradasPaquete: aquí le da las entradas ficticias de cada empresa.
const entradas = vi.hoisted(() => ({ de: new Map<string, () => EntradasPaquete>() }));
vi.mock("@/lib/estrategia/paquete-datos", async (orig) => {
  const real = await orig<typeof import("@/lib/estrategia/paquete-datos")>();
  return { ...real, leerEntradasPaquete: async (id: string) => (entradas.de.get(id) ? entradas.de.get(id)!() : real.leerEntradasPaquete(id)) };
});

import { congelar } from "@/lib/estrategia/generar";
import { huellaPaquete } from "@/lib/estrategia/paquete";
import { conIds } from "@/lib/estrategia/armar";
import { cerrarEstrategia } from "@/lib/estrategia/motor";
import { editarTexto } from "@/lib/estrategia/edicion";
import { contenidoEntregable, vistaParaDueno } from "@/lib/estrategia/para-dueno";
import { refsDeEstrategia } from "@/lib/estrategia/armar";
import { palabrasQueElDuenoNoVe } from "@/lib/estrategia/validador";
import { MOTOR, PANTALLA, PARA_DUENO, TEXTO } from "@/lib/estrategia/textos";
import {
  PATRON_ID_A_LA_VISTA, elegirVersion, esperanEnPalabras, jugadasEnPalabras, lugarDe, sinIds, aEditable, deEditable,
} from "@/lib/estrategia/pantalla";

vi.setConfig({ testTimeout: 60_000 });

const FRUTAS = "0000000f-0000-4000-8000-00000000000f";
const DENTAL = "0000000d-0000-4000-8000-00000000000d";
const V1 = "00000000-0000-4000-8000-0000000e5001";
const V2 = "00000000-0000-4000-8000-0000000e5002";
const CREADA = "2026-10-16T15:00:00.000Z";

/** Un «0» en dinero que nadie dijo. */
const CERO_INVENTADO = /S\/\s?0(?![.,]?\d)/;

/** Lo que se lee en pantalla: sin etiquetas y con las entidades de React deshechas. */
const visible = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
/** Lo que se lee sin verlo: las etiquetas para el lector de pantalla y los títulos. */
const etiquetas = (html: string) => [...html.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1]!);
/** Lo de dentro de un elemento por su comienzo (la primera vez que aparece) hasta su cierre. */
function bloque(html: string, abre: RegExp, etiqueta: string): string {
  const m = abre.exec(html);
  if (!m) return "";
  let i = m.index + m[0].length;
  let hondo = 1;
  const re = new RegExp(`<${etiqueta}\\b|</${etiqueta}>`, "g");
  re.lastIndex = i;
  for (let x = re.exec(html); x; x = re.exec(html)) {
    hondo += x[0].startsWith("</") ? -1 : 1;
    if (!hondo) return html.slice(m.index, x.index + x[0].length);
    i = re.lastIndex;
  }
  return html.slice(m.index);
}

/** Una versión armada con las salidas falsas, como la deja el motor al terminar (sin ningún modelo). */
function version(o: { id?: string; n?: number; rojo?: SalidaEquipoRojo; quitar?: boolean; e?: EntradasPaquete; extra?: Fila } = {}): Fila {
  const { paquete, calculos } = congelar(o.e ?? entradasFrutas(), HOY);
  const dinero = conIds(LENTE_DINERO_BUENA, "A");
  const terreno = conIds(LENTE_TERRENO_BUENA, "B");
  const c = cerrarEstrategia({ paquete, calculos, dinero, terreno, rojo: o.rojo ?? ROJO_BUENO }, { quitar: o.quitar ?? false });
  return {
    id: o.id ?? V1,
    company_id: FRUTAS,
    version: o.n ?? 1,
    estado: c.estado,
    etapa: "terminada",
    origen: "ia",
    paquete,
    paquete_huella: huellaPaquete(paquete),
    calculos,
    lente_dinero: dinero,
    lente_terreno: terreno,
    proyecciones_lentes: null,
    equipo_rojo: { primera: o.rojo ?? ROJO_BUENO, reparacion: null },
    salida: c.estrategia,
    vigente: structuredClone(c.estrategia),
    validacion: { ...c.validacion, de: "final" },
    calidad: { items: c.calidad },
    errores: [],
    trabajos: {},
    camino_elegido: null,
    motivo_eleccion: null,
    para_dueno: null,
    basada_en: null,
    pedida_por: null,
    aprobada_por: null,
    aprobada_at: null,
    created_at: CREADA,
    updated_at: CREADA,
    ...o.extra,
  };
}

let base: BaseEstrategia;
function nuevaBase(extra: Record<string, Fila[]> = {}) {
  base = crearBaseEstrategia({
    companies: [
      { id: FRUTAS, nombre: "Frutas del Valle (ficticia)", zona_horaria: "America/Lima", tope_tokens: 2_000_000 },
      { id: DENTAL, nombre: "Consultorio ficticio", zona_horaria: "America/Lima", tope_tokens: 2_000_000 },
    ],
    ...extra,
  });
  estado.base = base;
}

async function pagina(id = FRUTAS, q: Record<string, string> = {}): Promise<string> {
  const { default: Pagina } = await import("@/app/(consultor)/empresa/[id]/estrategia/page");
  return renderToStaticMarkup(await Pagina({ params: Promise.resolve({ id }), searchParams: Promise.resolve(q) }));
}

beforeAll(async () => {
  // Lo pesado se carga una vez (la página arrastra el armado entero).
  await import("@/app/(consultor)/empresa/[id]/estrategia/page");
}, 120_000);

beforeEach(() => {
  entradas.de.clear();
  entradas.de.set(FRUTAS, () => entradasFrutas());
  entradas.de.set(DENTAL, () => entradasDental());
  estado.redirigido = null;
});

// ————————————————————————————————————— LISTA —————————————————————————————————————

describe("una estrategia lista: arriba la lectura y la apuesta, debajo los dos caminos", () => {
  it("arriba solo la lectura en cinco líneas y la gran apuesta; después los caminos, aprobar y los cuatro grupos", async () => {
    nuevaBase({ estrategias: [version()] });
    const h = await pagina();
    expect(h).toMatch(/^<div class="tablero estrategia">/);
    const orden = ["estrategia-cabeza", "lectura-tarjeta", "apuesta-tarjeta", "dos-caminos", PANTALLA.elige_para_aprobar, 'id="primeros-dias"', 'id="analisis"', 'id="como-se-armo"', 'id="versiones"'].map((c) => h.indexOf(c));
    expect(orden.every((i) => i >= 0), `falta alguna pieza: ${orden.join(", ")}`).toBe(true);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    // Entre la cabecera y la lectura no hay nada más (sin respuestas nuevas ni «qué cambió»).
    const entre = h.slice(h.indexOf("estrategia-cabeza"), h.indexOf('<section class="tarjeta lectura-tarjeta"'));
    expect(entre).not.toMatch(/tarjeta|franja-accion/);
    // Las cinco líneas, cada una con su rótulo.
    for (const r of PANTALLA.rotulos_lectura) expect(h).toContain(`<dt>${r}</dt>`);
    expect(visible(bloque(h, /<section class="tarjeta apuesta-tarjeta"/, "section"))).toContain(ROJO_BUENO.gran_apuesta.frase);
  });

  it("los dos caminos con las mismas secciones en el mismo orden, el detalle plegado y el recomendado con su porqué", async () => {
    nuevaBase({ estrategias: [version()] });
    const h = await pagina();
    const a = bloque(h, /<article id="camino-a"/, "article");
    const b = bloque(h, /<article id="camino-b"/, "article");
    const filas = (x: string) => [...x.matchAll(/class="camino__fila ([a-z0-9_]+)/g)].map((m) => m[1]);
    // Lo que deja a 90 días va justo bajo la cabeza, en grande (revisión del 17-10): antes quedaba debajo de las jugadas.
    const SECCIONES = ["camino__cabeza", "camino__a90", "camino__jugadas", "camino__casos", "camino__detalle", "camino__eleccion"];
    expect(filas(a)).toEqual(SECCIONES);
    expect(filas(b)).toEqual(SECCIONES);
    // El detalle va plegado: un <details> sin «open».
    for (const x of [a, b]) expect(x).toMatch(/<details class="camino__fila camino__detalle plegado"><summary>/);
    // El recomendado (A, en la salida falsa) lleva su marca y su porqué; el otro, no.
    expect(a).toContain(PANTALLA.recomendado);
    expect(b).not.toContain(PANTALLA.recomendado);
    // El porqué va a lo ancho, entre la comparación y las tarjetas (en la cabeza del A dejaba un hueco en el B).
    const rec = bloque(h, /<section class="tarjeta recomendacion"/, "section");
    expect(visible(rec)).toContain(PANTALLA.por_que_este);
    expect(visible(rec)).toContain(PANTALLA.por_que_no_el_otro);
    expect(visible(a)).not.toContain(PANTALLA.por_que_no_el_otro);
    // Arriba de las tarjetas, los dos lado a lado: lo que deja, la caja, cuántas veces la de hoy, qué pide, qué cuidar y cuándo conviene.
    const cmp = bloque(h, /<div class="tarjeta comparacion"/, "div");
    for (const f of ["mes", "caja", "veces", "pide", "cuidar", "conviene"]) expect(visible(cmp), f).toContain(PANTALLA.comparacion_filas[f]!);
    expect(visible(cmp)).toContain("entre S/ 16,000 y S/ 32,000");
    expect(visible(cmp)).toContain(PANTALLA.no_libera_caja);
    expect(h.indexOf('class="tarjeta comparacion"')).toBeLessThan(h.indexOf('id="camino-a"'));
    // La caja que libera el camino del dinero, en su titular; y de dónde sale, contado en una línea.
    expect(visible(bloque(a, /<section class="camino__fila camino__a90"/, "section"))).toMatch(new RegExp(`${PANTALLA.y_libera} entre S/ 16,000 y S/ 32,000 .*${PANTALLA.de_caja_una_vez}`));
    expect(visible(a)).toMatch(/Sale de \d+ estimados del dueño y \d+ cifras por confirmar\./);
    // Ver el detalle, con su flecha (parece tocable).
    expect(a).toMatch(/<summary><span>Ver el detalle<\/span><svg/);
    // Una línea por jugada, numeradas por su posición, con su cifra o por qué no la tiene.
    expect((a.match(/<li class="jugada"/g) ?? []).length).toBe(5);
    expect((b.match(/<li class="jugada"/g) ?? []).length).toBe(3);
    // Los casos, «Si pasa… → Lo que haremos…».
    expect(visible(a)).toContain(`${PANTALLA.si_pasa} `);
    expect(visible(a)).toContain(PANTALLA.haremos);
    // Debajo de los dos, «Si seguimos igual».
    expect(visible(h)).toContain(TEXTO.si_seguimos_igual);
    // En un celular se salta de uno a otro.
    expect(h).toMatch(/<nav class="selector-camino no-imprimir" aria-label="[^"]+"><a href="#camino-a"/);
    // Sin elegir todavía: «Elegir este camino» en los dos, el recomendado como acción principal.
    expect(a).toMatch(/<button type="button" class="boton elegir-camino">Elegir este camino<\/button>/);
    expect(b).toMatch(/<button type="button" class="boton boton--secundario elegir-camino">Elegir este camino<\/button>/);
    expect(visible(h)).toContain(PANTALLA.elige_para_aprobar);
  });

  it("ningún id en la página de la consultora: ni en lo que se lee, ni en sus etiquetas; ni «lente» ni «equipo rojo»", async () => {
    nuevaBase({ estrategias: [version()], estrategia_preguntas: [{ id: "00000000-0000-4000-8000-00000000a001", company_id: FRUTAS, estrategia_id: V1, clave: "clientes_dormidos", texto: "¿Cuántos clientes te compraron alguna vez y este año no han vuelto?", por_que: "Para saber cuántos se pueden recuperar", unidad: "personas", estado: "propuesta", espera: [{ version: 1, camino: "b", jugada: "J3" }], created_at: CREADA }] });
    const h = await pagina();
    const texto = visible(h);
    const id = PATRON_ID_A_LA_VISTA.exec(texto);
    expect(id, `se ve un id: «${texto.slice(Math.max(0, (id?.index ?? 0) - 60), (id?.index ?? 0) + 60)}»`).toBeNull();
    for (const t of etiquetas(h)) expect(t, `una etiqueta trae un id: «${t}»`).not.toMatch(PATRON_ID_A_LA_VISTA);
    expect(texto).not.toMatch(/\blentes?\b|equipo rojo/i);
    // La pregunta propuesta sale con lo que destraba, en palabras.
    expect(texto).toContain("La esperan: Camino B, jugada 3");
  });

  it("«sin dato» rayado y nunca «S/ 0»; un cero no inventado tampoco se pinta como dinero suelto", async () => {
    const v = version();
    // La lectura cita algo que la empresa no tiene: se pinta «sin dato», rayado, con su motivo al tocarlo.
    (v.vigente as { lectura: string[] }).lectura[2] = "Seguir igual cuesta {{X:clientes_dormidos}} en clientes que se fueron.";
    (v.salida as { lectura: string[] }).lectura[2] = (v.vigente as { lectura: string[] }).lectura[2]!;
    nuevaBase({ estrategias: [v] });
    const h = await pagina();
    const linea = bloque(h, /<div class="lectura-lineas__fila"><dt>Cuánto cuesta seguir igual<\/dt>/, "div");
    expect(linea).toMatch(/class="cifra-e cifra-e--sin-dato"><button[^>]*><span class="sin-dato">sin dato<\/span>/);
    expect(linea).toContain(PANTALLA.por_que_sin_cifra);
    expect(visible(h)).not.toMatch(CERO_INVENTADO);
  });

  it("la jugada «por probar»: sin número, fuera de la suma, con lo que falta y la pregunta que la destraba", async () => {
    // Sin la respuesta de cuántos clientes distintos compran, la jugada de recompra del camino B no tiene número.
    const e = entradasFrutas({ respuestas: RESPUESTAS_FRUTAS.filter((r) => r.clave !== "clientes_activos_mes").map((r) => ({ ...r })) });
    nuevaBase({ estrategias: [version({ e })] });
    entradas.de.set(FRUTAS, () => e);
    const h = await pagina();
    const b = bloque(h, /<article id="camino-b"/, "article");
    const fila = bloque(b, /<li class="jugada" data-estado="por_probar"/, "li");
    expect(fila, "ninguna jugada quedó por probar").not.toBe("");
    expect(visible(fila)).toContain(TEXTO.por_probar);
    expect(visible(fila)).toContain(PANTALLA.falta_saber);
    expect(visible(fila)).toContain(`${PANTALLA.se_destraba_con}: «El mes pasado, ¿a cuántos clientes distintos les vendiste?»`);
    // Y el total a 90 días lo dice: no entra en la suma.
    expect(visible(b)).toContain(PANTALLA.por_probar_fuera(1));
  });

  it("el lápiz solo en una versión que se corrige, y solo donde se corrige (lo que falta saber se retoca como pregunta)", async () => {
    nuevaBase({ estrategias: [version()] });
    const h = await pagina();
    const lapices = (h.match(/class="lapiz no-imprimir"/g) ?? []).length;
    expect(lapices).toBeGreaterThan(40);
    expect(h).toMatch(/aria-label="Corregir: Camino A, jugada 1: lo que se mueve"/);
    expect(h).not.toMatch(/aria-label="Corregir: Lo que falta saber/);
  });

  it("el original de 8X a mano junto a lo que corrigió la consultora, y su cifra con su chip", async () => {
    const v = version();
    const e = editarTexto(v.vigente as never, "/lectura/1", "Lo frena dar crédito sin reglas a 3 clientes grandes.", (v.paquete as { personas: [] }));
    if (!e.ok) throw new Error(e.texto);
    v.vigente = e.vigente;
    nuevaBase({ estrategias: [v] });
    const h = await pagina();
    const linea = bloque(h, /<div class="lectura-lineas__fila"><dt>Qué la frena<\/dt>/, "div");
    expect(linea).toContain(PANTALLA.editado_por_ti);
    expect(visible(linea)).toContain(ROJO_BUENO.lectura[1]);
    expect(visible(linea)).toContain(PANTALLA.volver_a_8x);
    // Su cifra escrita a mano no es error: lleva el chip «Escrito por la consultora».
    expect(visible(linea)).toContain("Escrito por la consultora");
  });
});

// ————————————————————————————————————— ELEGIR Y APROBAR —————————————————————————————————————

describe("elegido un camino: la página del dueño a la vista antes de aprobar", () => {
  it("muestra lo que verá el cliente (la misma pieza de su «Plan»), sin el otro camino ni palabras del método", async () => {
    nuevaBase({ estrategias: [version({ extra: { camino_elegido: "a", motivo_eleccion: "Ataca la fuga más grande" } })] });
    const h = await pagina();
    const tarjeta = bloque(h, /<section class="tarjeta a-lo-ancho aprobacion"/, "section");
    expect(visible(tarjeta)).toContain(PANTALLA.asi_lo_vera);
    expect(visible(tarjeta)).toContain(PANTALLA.asi_lo_vera_sub);
    const vista = bloque(tarjeta, /<div class="aprobacion__vista">/, "div");
    expect(vista).toContain('class="camino-elegido"');
    expect(visible(vista)).toContain(ROJO_BUENO.cambios.a.para_el_dueno.titulo);
    expect(visible(vista)).not.toContain(ROJO_BUENO.cambios.b.para_el_dueno.titulo);
    expect(palabrasQueElDuenoNoVe(visible(vista))).toEqual([]);
    expect(visible(vista)).not.toMatch(PATRON_ID_A_LA_VISTA);
    expect(vista).not.toContain("sin-dato");
    // El botón de aprobar, y lo elegido marcado en su camino.
    expect(tarjeta).toContain("Aprobar la estrategia");
    expect(bloque(h, /<article id="camino-a"/, "article")).toContain(PANTALLA.elegido);
    // Se puede corregir ahí mismo lo que leerá el cliente.
    expect(tarjeta).toContain(PANTALLA.corregir_dueno);
  });

  it("con cosas por resolver, el botón dice cuántas y lleva a ellas; cada una con su lugar en palabras", async () => {
    nuevaBase({ estrategias: [version({ rojo: ROJO_CON_CIFRAS, quitar: true, extra: { camino_elegido: "a" } })] });
    const h = await pagina();
    expect(h).toContain('id="por-resolver"');
    const n = (bloque(h, /<section id="por-resolver"/, "section").match(/<li class="por-resolver__item"/g) ?? []).length;
    expect(n).toBeGreaterThan(0);
    const tarjeta = bloque(h, /<section class="tarjeta a-lo-ancho aprobacion"/, "section");
    expect(tarjeta).toContain(`href="#por-resolver"`);
    expect(visible(tarjeta)).toContain(PANTALLA.ir_a_resolver(n));
    expect(tarjeta).not.toContain("Aprobar la estrategia");
    const resolver = visible(bloque(h, /<section id="por-resolver"/, "section"));
    expect(resolver).toContain("La lectura, línea 1");
    expect(resolver).toContain(PANTALLA.quito);
    expect(resolver).toContain("Aceptar que se quite");
    expect(resolver).not.toMatch(PATRON_ID_A_LA_VISTA);
  });

  it("aprobada: dice desde cuándo la ve el cliente, muestra lo que se congeló y ya no se corrige ni se elige", async () => {
    const v = version({ extra: { camino_elegido: "a" } });
    const { paquete, calculos } = congelar(entradasFrutas(), HOY);
    const para = vistaParaDueno(v.vigente as never, "a", refsDeEstrategia(v.vigente as never, paquete, calculos));
    Object.assign(v, { estado: "aprobada", para_dueno: para, aprobada_at: "2026-10-17T14:00:00.000Z", aprobada_por: "00000000-0000-4000-8000-0000000000c1" });
    nuevaBase({ estrategias: [v] });
    const h = await pagina();
    expect(visible(h)).toContain("Aprobada el 17/10/2026");
    expect(bloque(h, /<div class="aprobacion__vista">/, "div")).toContain('class="camino-elegido"');
    expect(h).not.toContain('class="lapiz no-imprimir"');
    expect(h).not.toContain("Elegir este camino");
    expect(h).not.toContain("Aprobar la estrategia");
  });
});

// ————————————————————————————————————— LOS OTROS ESTADOS —————————————————————————————————————

describe("sin estrategia, generándose, otra versión y la vista para imprimir", () => {
  it("sin estrategia: con qué datos se haría, el consumo y UN botón, «Generar la estrategia»", async () => {
    nuevaBase();
    const h = await pagina();
    const t = visible(h);
    expect(t).toContain(PANTALLA.prep_titulo);
    expect(t).toContain(PANTALLA.con_que);
    expect(h).toContain('class="segmentos"');
    expect(t).toMatch(/Esta empresa usó 0 de su tope de 2,000,000; generar usa unas 130,000\./);
    expect((h.match(/<button[^>]*>Generar la estrategia<\/button>/g) ?? []).length).toBe(1);
    expect(t).toContain(MOTOR.generar_nota);
    expect(t).not.toContain(MOTOR.pedir_al_cliente);
  });

  it("sin el mínimo: lo que falta, en palabras, y «Pedírselo al cliente» en vez de generar", async () => {
    nuevaBase();
    const h = await pagina(DENTAL);
    const t = visible(h);
    expect(t).toContain(PANTALLA.falta_minimo);
    expect(t).toContain(MOTOR.pedir_al_cliente);
    expect(h).not.toMatch(/>Generar la estrategia</);
  });

  it("generándose: las cuatro etapas en palabras llanas, sin «lente» ni «equipo rojo»", async () => {
    nuevaBase({
      estrategias: [{ ...version(), estado: "en_curso", etapa: "lentes", salida: null, vigente: null, lente_dinero: null, lente_terreno: null, trabajos: { dinero: "00000000-0000-4000-8000-00000000b001", terreno: "00000000-0000-4000-8000-00000000b002" } }],
      jobs: [
        { id: "00000000-0000-4000-8000-00000000b001", company_id: FRUTAS, tipo: "estrategia_lente", estado: "corriendo", progreso: null, error: null, resultado: null },
        { id: "00000000-0000-4000-8000-00000000b002", company_id: FRUTAS, tipo: "estrategia_lente", estado: "pendiente", progreso: null, error: null, resultado: null },
      ],
    });
    const h = await pagina();
    const t = visible(h);
    expect(t).toContain(PANTALLA.generando(1));
    for (const e of ["Pensando el camino del dinero", "Pensando el camino de la operación", "Poniéndolos a prueba", "Revisando cada cifra"]) expect(t).toContain(e);
    expect(t).not.toMatch(/\blentes?\b|equipo rojo/i);
  });

  it("?v=N abre otra versión; una que no existe lo dice; ?vista=documento es la vista para imprimir, sin ids", async () => {
    nuevaBase({ estrategias: [version(), version({ id: V2, n: 2, extra: { origen: "actualizacion", basada_en: V1 } })] });
    const h2 = await pagina(FRUTAS);
    expect(h2).toMatch(/<option value="2" selected="">Versión 2 · /);
    const h1 = await pagina(FRUTAS, { v: "1" });
    expect(h1).toMatch(/<option value="1" selected="">Versión 1 · /);
    expect(visible(await pagina(FRUTAS, { v: "9" }))).toContain(PANTALLA.no_existe(9));
    const doc = await pagina(FRUTAS, { v: "1", vista: "documento" });
    expect(doc).toContain('<article class="doc-plan t-doc">');
    expect(visible(doc)).toContain(PANTALLA.imprimir);
    expect((doc.match(/<section class="hoja-plan/g) ?? []).length).toBeGreaterThanOrEqual(10);
    expect(visible(doc)).not.toMatch(PATRON_ID_A_LA_VISTA);
  });

  it("una versión que salió de «Actualizar números» dice qué cambió, arriba y sola", async () => {
    const antes = version();
    const despues = version({ id: V2, n: 2, e: entradasFrutas({ respuestas: RESPUESTAS_FRUTAS.map((r) => (r.clave === "merma_mes" ? { ...r, respuesta: { valor: 6000, estado: "contado" } } : { ...r })) }), extra: { origen: "actualizacion", basada_en: V1 } });
    nuevaBase({ estrategias: [antes, despues] });
    const h = await pagina();
    expect(h).toContain('class="tarjeta a-lo-ancho que-cambio"');
    expect(visible(h)).toContain(PANTALLA.que_cambio(1));
    expect(h.indexOf("que-cambio")).toBeLessThan(h.indexOf("lectura-tarjeta"));
  });

  it("el dueño respondió después de esta versión: UNA franja con UNA acción, «Actualizar números»", async () => {
    nuevaBase({
      estrategias: [version()],
      estrategia_preguntas: [{ id: "00000000-0000-4000-8000-00000000a009", company_id: FRUTAS, clave: "descuentos_mes", texto: "El mes pasado, ¿cuánto se dio en descuentos que tú no autorizaste?", unidad: "soles", estado: "respondida", respuesta: { valor: 800, estado: "estimado" }, respondida_at: "2026-10-17T10:00:00.000Z", espera: [], created_at: CREADA }],
    });
    const h = await pagina();
    const franja = bloque(h, /<div class="franja-accion franja-accion--fuerte a-lo-ancho"/, "div");
    expect(visible(franja)).toContain(PANTALLA.respondio(1));
    expect((franja.match(/<button/g) ?? []).length).toBe(1);
    expect(visible(franja)).toContain("Actualizar números");
  });
});

// ————————————————————————————————————— LA BIBLIOTECA Y LA REDIRECCIÓN —————————————————————————————————————

describe("la copia en la biblioteca y la pestaña vieja", () => {
  it("VistaEntregable de un plan_estrategico pinta la página del dueño y nunca un <pre>; uno viejo lo dice", async () => {
    const v = version({ extra: { camino_elegido: "a" } });
    const { paquete, calculos } = congelar(entradasFrutas(), HOY);
    const para = vistaParaDueno(v.vigente as never, "a", refsDeEstrategia(v.vigente as never, paquete, calculos));
    nuevaBase();
    const { VistaEntregable } = await import("@/components/VistaEntregable");
    const nuevo = renderToStaticMarkup(await VistaEntregable({ d: { id: "d1", company_id: FRUTAS, tipo: "plan_estrategico", contenido: contenidoEntregable(V1, 1, para) as never, version: 1, publicado: true }, paraCliente: true }));
    expect(nuevo).toContain('class="camino-elegido"');
    expect(nuevo).not.toContain("<pre");
    expect(visible(nuevo)).toContain(ROJO_BUENO.cambios.a.para_el_dueno.titulo);
    expect(visible(nuevo)).not.toContain(ROJO_BUENO.cambios.b.para_el_dueno.titulo);
    expect(nuevo).not.toContain("{{");
    const viejo = renderToStaticMarkup(await VistaEntregable({ d: { id: "d2", company_id: FRUTAS, tipo: "plan_estrategico", contenido: { desafio: "plan de antes", resumen: {} }, version: 1, publicado: true }, paraCliente: true }));
    expect(viejo).not.toContain("<pre");
    expect(visible(viejo)).toContain(PARA_DUENO.plan_anterior);
    expect(viejo).not.toContain("plan de antes");
  });

  it("/plan-estrategico lleva a /estrategia de la misma empresa: lo hace next.config.ts (307), y la página vieja ya no existe", async () => {
    // Tramo 8: la carpeta se retiró; la redirección se mira antes que las páginas, así que la dirección vieja sigue abriendo.
    const { default: config } = await import("../next.config");
    expect(await config.redirects!()).toContainEqual({ source: "/empresa/:id/plan-estrategico", destination: "/empresa/:id/estrategia", permanent: false });
    expect(existsSync(path.resolve(__dirname, "../src/app/(consultor)/empresa/[id]/plan-estrategico/page.tsx"))).toBe(false);
  });
});

// ————————————————————————————————————— LO PURO —————————————————————————————————————

describe("lo puro de la página: lugares en palabras, sin ids, las cifras de 8X entre ⟦ ⟧", () => {
  it("el lugar de cada cosa, dicho a la consultora", () => {
    expect(lugarDe("/caminos/a/jugadas/1/por_que")).toBe("Camino A, jugada 2: por qué");
    expect(lugarDe("/caminos/b/casos/0/solucion")).toBe("Camino B, caso 1: lo que haremos");
    expect(lugarDe("/lectura/4")).toBe("La lectura, línea 5");
    expect(lugarDe("/caminos/a/para_el_dueno/pasos/2")).toBe("Camino A, lo que leerá el dueño: paso 3");
    expect(lugarDe("/foda/o/0/texto")).toBe("El FODA, oportunidad 1");
    expect(lugarDe("/supuestos/0", { tows: [], supuestos: [{ que_se_supone: "Cuánto sube el precio" }] } as never)).toBe("La cifra por confirmar 1 («Cuánto sube el precio»)");
    expect(lugarDe("/no/existe")).toBe("Otra parte de la estrategia");
  });

  it("sin ids en lo que escribió el código, y sin los nombres del código", () => {
    expect(sinIds("Cita «C:nada», que no existe en esta versión.")).toBe("Cita un dato, que no existe en esta versión.");
    expect(sinIds("Cifra sin origen: 120 (/lectura/0)")).toBe("Cifra sin origen: 120 (La lectura, línea 1)");
    expect(sinIds("El equipo rojo eligió «A.F1» para el FODA")).toBe("La prueba de los dos caminos eligió un punto del FODA para el FODA");
    expect(sinIds("Usa el supuesto «SA3», que no existe.")).toBe("Usa el supuesto una cifra por confirmar, que no existe.");
    expect(sinIds("Elegir un ítem que esté en el FODA de una de las dos lentes")).not.toMatch(/lente/);
    expect(sinIds("La venta del mes: S/ 40,000")).toBe("La venta del mes: S/ 40,000");
  });

  it("los ids de jugada del código pasan a su posición en el camino", () => {
    const c = { jugadas: [{ id: "J1" }, { id: "J3" }, { id: "J6" }] } as never;
    expect(jugadasEnPalabras("Lo que deja la jugada J3 al mes", c)).toBe("Lo que deja la jugada 2 al mes");
    expect(jugadasEnPalabras("no mueve dinero por sí misma: abre J6", c)).toBe("no mueve dinero por sí misma: abre la jugada 3");
    expect(jugadasEnPalabras("abre J2", c)).toBe("abre una jugada que ya no está en el camino");
    const e = { caminos: { a: { jugadas: [{ id: "J1" }, { id: "J2" }] }, b: { jugadas: [{ id: "J4" }] } }, tows: [{ de: "A.T1", cuadrante: "FO" }] } as never;
    expect(esperanEnPalabras(["a.J2", "b.J4", "A.T1", "b.J9"], e)).toEqual(["Camino A, jugada 2", "Camino B, jugada 1", "el cruce FO"]);
  });

  it("la caja de corregir: cada cifra de 8X entre ⟦ ⟧ vuelve a ser su id, aunque se la mueva; lo de la consultora queda suyo", () => {
    const refs = new Map([["C:poder.precio", { texto: "S/ 410" }], ["N:venta_mes", { texto: "S/ 41,000" }]]);
    const { visible: caja, marcas } = aEditable("Vende {{N:venta_mes}} y cada punto de precio deja {{C:poder.precio}}.", (id) => refs.get(id)?.texto);
    expect(caja).toBe("Vende ⟦S/ 41,000⟧ y cada punto de precio deja ⟦S/ 410⟧.");
    expect(deEditable(caja, marcas)).toBe("Vende {{N:venta_mes}} y cada punto de precio deja {{C:poder.precio}}.");
    expect(deEditable("Cada punto de precio deja ⟦S/ 410⟧; vende ⟦S/ 41,000⟧.", marcas)).toBe("Cada punto de precio deja {{C:poder.precio}}; vende {{N:venta_mes}}.");
    expect(deEditable("Vende ⟦S/ 41,000⟧ y deja ⟦S/ 999⟧.", marcas)).toBe("Vende {{N:venta_mes}} y deja S/ 999.");
    expect(deEditable("Ya no cita nada.", marcas)).toBe("Ya no cita nada.");
    expect(aEditable("Sin el dato {{X:nada}}.", () => null).visible).toBe(`Sin el dato ⟦${TEXTO.sin_dato}⟧.`);
  });

  it("qué versión se abre: la pedida, o la más nueva que no se descartó", () => {
    const v = (version: number, estado: string) => ({ id: `v${version}`, version, estado, etapa: "terminada", origen: "ia", camino_elegido: null, aprobada_at: null, created_at: CREADA, updated_at: CREADA }) as never;
    expect(elegirVersion([v(3, "descartada"), v(2, "aprobada"), v(1, "reemplazada")])).toMatchObject({ version: 2 });
    expect(elegirVersion([v(2, "en_curso"), v(1, "aprobada")])).toMatchObject({ version: 2 });
    expect(elegirVersion([v(1, "descartada")])).toBeNull();
    expect(elegirVersion([], null)).toBeNull();
    expect(elegirVersion([v(1, "lista")], 4)).toBe("no_existe");
  });
});

describe("las piezas de cliente se pintan solas, sin datos de la base", () => {
  it("las etapas fallidas ofrecen reintentar esa etapa y, aparte, descartar la versión", async () => {
    const { Etapas } = await import("@/components/estrategia/Etapas");
    const h = renderToStaticMarkup(
      createElement(Etapas, {
        companyId: FRUTAS,
        eid: V1,
        inicial: {
          pasos: [
            { clave: "dinero", texto: "Pensando el camino del dinero", estado: "lista", detalle: null, job_id: "j1", reintentable: false },
            { clave: "terreno", texto: "Pensando el camino de la operación", estado: "fallida", detalle: MOTOR.cortada, job_id: "j2", reintentable: true },
            { clave: "rojo", texto: "Poniéndolos a prueba", estado: "esperando", detalle: MOTOR.espera_los_dos, job_id: null, reintentable: false },
            { clave: "revision", texto: "Revisando cada cifra", estado: "esperando", detalle: null, job_id: null, reintentable: false },
          ],
          fallida: true,
          terminada: false,
          aviso: MOTOR.lente_lista_y_fallida("el camino del dinero", "el camino de la operación", MOTOR.cortada),
        },
      })
    );
    expect((h.match(new RegExp(MOTOR.reintentar, "g")) ?? []).length).toBe(1);
    expect(visible(h)).toContain(MOTOR.descartar);
    expect(visible(h)).toContain("El camino del dinero está listo; el camino de la operación no salió");
    expect(visible(h)).not.toMatch(/\blentes?\b|equipo rojo/i);
  });
});
