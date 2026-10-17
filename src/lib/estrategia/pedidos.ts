/**
 * DE LO QUE FALTA SABER A PEDIDO, SOLO (spec-estrategia-8x.md §7.2).
 *
 * Al terminar una generación, `pedidosDesdeFaltantes` arma, sin que nadie escriba nada, lo que hay que pedirle al
 * dueño. Sale de dos fuentes, sin repetir clave:
 *  - lo que anotaron en `faltan` las dos lentes y el equipo rojo;
 *  - lo que una jugada o un cruce necesita para tener número (`destraban`: los «sin dato» del paquete que una cuenta
 *    espera), con las jugadas que lo esperan.
 * Cada clave va a su destino del catálogo (supuestos.ts):
 *  - una PREGUNTA suelta (estrategia_preguntas, estado «propuesta»), con el texto que escribió una persona en el
 *    catálogo —nunca la IA—, salvo la clave «otra», cuya pregunta redactó el modelo y pasa por revisarPregunta. Una
 *    «otra» se guarda con su propia clave (`otra.<huella>`), para que dos preguntas distintas no choquen;
 *  - una LÍNEA para la nota de la sección del portal donde se responde (productos, gastos, crédito, inventario, los
 *    nueve números). Se agrega a la nota cuando la consultora envía (tramo 5), debajo de lo que ella escribió.
 * El envío es un solo toque de la consultora: aquí no se envía nada.
 *
 * Puro salvo la huella (sha256 de Node): sin base, sin red, sin IA.
 */
import { createHash } from "crypto";
import { normalizar } from "../plan-reglas";
import type { Seccion } from "../secciones";
import type { Paquete, Unidad } from "./paquete";
import type { Estrategia, LetraCamino } from "./armar";
import { CLAVES_SUPUESTO, preguntaDe } from "./supuestos";
import { palabrasQueElDuenoNoVe, revisarPregunta } from "./validador";
import { PREGUNTAS } from "./textos";

/** Lo que una respuesta destraba: la jugada (o el cruce) de una versión. */
export type EsperaPregunta = { version: number; camino: LetraCamino | null; jugada: string };

/** Las unidades que admite estrategia_preguntas.unidad (al dueño nunca se le pregunta en porcentaje). */
export const UNIDADES_PREGUNTA = ["soles", "de_cada_10", "dias", "unidades_mes", "veces_mes", "horas_semana", "personas", "texto"] as const;
export type UnidadPregunta = (typeof UNIDADES_PREGUNTA)[number];
const unidadPregunta = (u: Unidad | undefined): UnidadPregunta => ((UNIDADES_PREGUNTA as readonly string[]).includes(String(u)) ? (u as UnidadPregunta) : "texto");

export type PreguntaPropuesta = { clave: string; texto: string; por_que: string; unidad: UnidadPregunta; espera: EsperaPregunta[] };
export type LineaDeSeccion = { seccion: Seccion; clave: string; linea: string; espera: EsperaPregunta[] };
export type Pedidos = { preguntas: PreguntaPropuesta[]; secciones: LineaDeSeccion[] };

/** Lo que la base admite en estrategia_preguntas: clave con su forma y texto de 8 a 200 caracteres. */
const CLAVE_VALIDA = /^[a-z][a-z0-9_.]{2,60}$/;
const TOPE_POR_QUE = 300;

/** La clave de una pregunta «otra»: la huella de su texto, para que dos distintas no choquen en el índice «una abierta». */
export const claveDeOtra = (texto: string): string => `otra.${createHash("sha256").update(normalizar(texto), "utf8").digest("hex").slice(0, 8)}`;

/** «a.J2» → la jugada J2 del camino a; «A.T1» → el cruce A.T1 (sin camino). */
function espera(quien: string, version: number): EsperaPregunta {
  const m = /^([ab])\.(J\d+)$/.exec(quien);
  return m ? { version, camino: m[1] as LetraCamino, jugada: m[2]! } : { version, camino: null, jugada: quien };
}

/** El nombre de la línea o del gasto detrás de un «sin dato» con sufijo, para la línea de la sección. */
function cosaDe(id: string, paquete: Paquete): string | null {
  const sufijo = /@([A-Za-z0-9_]+)$/.exec(id)?.[1];
  if (!sufijo) return null;
  return paquete.lineas.find((l) => l.id === `L:${sufijo}`)?.nombre ?? null;
}

/** ¿El dueño ya respondió esa clave? Entonces no se le vuelve a preguntar. */
const yaRespondida = (clave: string, paquete: Paquete) => paquete.hechos.some((h) => h.id === `Q:${clave}`);

/**
 * Lo que hay que pedirle al dueño para esta versión: las preguntas propuestas (para estrategia_preguntas) y las líneas
 * de la nota de cada sección. `version` es el número de la versión, para que cada espera diga de cuál es.
 */
export function pedidosDesdeFaltantes(e: Pick<Estrategia, "faltan" | "destraban">, paquete: Paquete, version: number): Pedidos {
  const modelo = paquete.empresa.modelo_negocio[0] ?? null;
  const preguntas = new Map<string, PreguntaPropuesta>();
  const secciones = new Map<string, LineaDeSeccion>();

  const sumarEsperas = (destino: { espera: EsperaPregunta[] }, nuevas: EsperaPregunta[]) => {
    for (const n of nuevas) if (!destino.espera.some((x) => x.version === n.version && x.camino === n.camino && x.jugada === n.jugada)) destino.espera.push(n);
  };

  const pedir = (clave: string, porQue: string | null, esperas: EsperaPregunta[], id: string | null, preguntaOtra: string | null, unidadOtra: UnidadPregunta | null = null) => {
    const def = CLAVES_SUPUESTO[clave];
    if (!def || def.tipo !== "estado_actual") return;
    if (def.destino === "pregunta") {
      if (yaRespondida(clave, paquete)) return;
      let texto: string | null;
      let claveFinal = clave;
      if (clave === "otra") {
        texto = preguntaOtra?.trim() || null;
        // La pregunta que redactó el modelo se revisa otra vez: una que no se puede hacer no sale.
        if (!texto || revisarPregunta(texto).length || palabrasQueElDuenoNoVe(texto).length) return;
        claveFinal = claveDeOtra(texto);
      } else texto = preguntaDe(clave, modelo);
      if (!texto || texto.length < 8 || texto.length > 200 || !CLAVE_VALIDA.test(claveFinal)) return;
      const previa = preguntas.get(claveFinal);
      if (previa) {
        sumarEsperas(previa, esperas);
        return;
      }
      preguntas.set(claveFinal, {
        clave: claveFinal,
        texto,
        por_que: (porQue?.trim() || def.por_que_importa).slice(0, TOPE_POR_QUE),
        // Una «otra» que pide un número se responde con su casilla de número (y entra en las cuentas); sin unidad, en texto.
        unidad: clave === "otra" ? (unidadOtra ?? "texto") : unidadPregunta(def.unidad),
        espera: [...esperas],
      });
      return;
    }
    if (!def.destino) return;
    const cosa = id ? cosaDe(id, paquete) : null;
    const linea = `Para la estrategia: ${def.para_dueno ?? def.que_falta}${cosa ? ` («${cosa}»)` : ""}`;
    const k = `${def.destino}|${linea}`;
    const previa = secciones.get(k);
    if (previa) sumarEsperas(previa, esperas);
    else secciones.set(k, { seccion: def.destino, clave, linea, espera: [...esperas] });
  };

  // Primero lo que anotaron los modelos (con su porqué); después lo que espera cada jugada, con quién lo espera. Un «sin
  // dato» que no es una clave del catálogo no tiene pregunta escrita por nadie: no sale.
  for (const f of e.faltan) pedir(f.clave, f.por_que_importa, [], null, f.pregunta_si_otra, f.unidad_si_otra ?? null);
  for (const d of e.destraban) if (d.clave !== "otra") pedir(d.clave, null, d.esperan.map((q) => espera(q, version)), d.id, null);

  return { preguntas: [...preguntas.values()], secciones: [...secciones.values()] };
}

// ─── La nota de cada sección (§7.2) ──────────────────────────────────────────────────────────────

/** El tope de la nota de una solicitud (check de solicitudes_cliente.nota en la migración del 16-10). */
export const TOPE_NOTA = 600;

/** «…y 3 cosas más que verás al entrar»: lo escribe el código, así que se puede reescribir al sumar otras. */
const CIERRE = /^…y (?:una cosa|\d+ cosas) más que verás al entrar$/;

export type NotaConLineas = { nota: string | null; agregadas: string[]; no_cupieron: string[] };

/**
 * La nota de una sección con las líneas de la estrategia AGREGADAS debajo de lo que escribió la consultora: nunca lo
 * pisan, no se repiten y la nota no pasa de su tope. Si no caben todas, la última línea dice cuántas faltan («…y N
 * cosas más que verás al entrar»); si ni eso cabe, la nota queda como estaba y `no_cupieron` lo dice. El cierre de un
 * envío anterior lo escribió 8X, no la consultora: se rehace con lo que no cabe ahora (contar el viejo y el nuevo
 * contaría dos veces las mismas líneas cuando se vuelve a enviar).
 */
export function notaConLineas(previa: string | null | undefined, lineas: readonly string[], tope = TOPE_NOTA): NotaConLineas {
  const tal = { nota: previa?.trim() ? previa.trim() : null, agregadas: [] as string[], no_cupieron: [] as string[] };
  const renglones = (previa ?? "").split("\n");
  if (CIERRE.test(renglones[renglones.length - 1]?.trim() ?? "")) renglones.pop();
  const base = renglones.join("\n").trim();
  const yaEstan = new Set(renglones.map((l) => l.trim()).filter(Boolean));
  const nuevas = [...new Set(lineas.map((l) => l.trim()).filter((l) => l && !yaEstan.has(l)))];
  if (!nuevas.length) return tal;
  const juntar = (xs: string[]) => [base, ...xs].filter(Boolean).join("\n");
  for (let k = nuevas.length; k >= 0; k--) {
    const fuera = nuevas.length - k;
    const nota = juntar(fuera ? [...nuevas.slice(0, k), PREGUNTAS.y_mas(fuera)] : nuevas);
    if (nota.length <= tope) return { nota, agregadas: nuevas.slice(0, k), no_cupieron: nuevas.slice(k) };
  }
  return { ...tal, no_cupieron: nuevas };
}

/** Lo que una versión le abriría al dueño, sección por sección, con sus líneas (la confirmación del envío y el envío). */
export function seccionesPorAbrir(p: Pick<Pedidos, "secciones">): { seccion: Seccion; lineas: string[] }[] {
  const por = new Map<Seccion, string[]>();
  for (const l of p.secciones) por.set(l.seccion, [...(por.get(l.seccion) ?? []), l.linea]);
  return [...por.entries()].map(([seccion, lineas]) => ({ seccion, lineas }));
}

