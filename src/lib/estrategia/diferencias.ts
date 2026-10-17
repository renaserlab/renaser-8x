/**
 * QUÉ CAMBIÓ ENTRE DOS VERSIONES (spec-estrategia-8x.md §7.3).
 *
 * Cuando el dueño responde y la consultora pulsa «Actualizar números», 8X crea una versión nueva sin llamar al modelo.
 * Arriba de ella aparece solo —no es un botón más— lo que cambió:
 *  - los hechos que entraron, salieron o cambiaron de valor o de clase («la conversión pasó de estimado a hecho»);
 *  - las preguntas que el dueño respondió y lo que dejó de faltar;
 *  - los números de cada camino a 14, 30 y 90 días que se movieron más de un 10 %, o que ganaron o perdieron su número.
 * `convieneRegenerar` dice si conviene volver a pensarla con el modelo, y por qué; sin motivo, el botón no aparece.
 *
 * Puro: sin base, sin red, sin IA.
 */
import { centro, textoRango, type Rango } from "../dato-oral";
import { porDefecto, type ConfigEmpresa } from "../formato";
import { plata, refsDelPaquete, textoDeValor, type Hecho, type Paquete, type RefValor } from "./paquete";
import { claveDeRef, HORIZONTES } from "./proyeccion";
import type { Estrategia, LetraCamino } from "./armar";
import { CHIP_CONSULTORA } from "./textos";

export type Version = { paquete: Paquete; estrategia: Estrategia };

export type CambioHecho = { id: string; nombre: string; antes: string; despues: string; que: "valor" | "clase" | "valor_y_clase"; texto: string };
export type CambioNumero = { camino: LetraCamino; horizonte: `d${(typeof HORIZONTES)[number]}`; antes: Rango | null; despues: Rango | null; texto: string };
export type CambioJugada = { camino: LetraCamino; jugada: string; antes: string; despues: string; texto: string };

export type Diferencias = {
  entraron: { id: string; nombre: string; texto: string }[];
  salieron: { id: string; nombre: string; texto: string }[];
  cambiaron: CambioHecho[];
  /** Las preguntas de la estrategia que el dueño respondió desde la versión anterior. */
  respondidas: { id: string; texto: string }[];
  /** Lo que antes era «sin dato» y ya no. */
  ya_no_falta: { id: string; que_falta: string }[];
  numeros: CambioNumero[];
  jugadas: CambioJugada[];
  /** Lo que mira convieneRegenerar. */
  senales: {
    recomendado_dejo_de_ser_el_que_mas_da: boolean;
    jugadas_que_perdieron_su_numero: string[];
    hechos_nuevos_sobre_la_restriccion: string[];
  };
  /** Todo, en frases para la consultora (las escribe el código). */
  resumen: string[];
};

const UMBRAL = 0.1;

const cfgDe = (p: Paquete): ConfigEmpresa => ({ ...porDefecto, moneda: p.empresa.moneda, zona_horaria: p.empresa.zona });

const NOMBRE_CLASE: Record<Hecho["clase"], string> = { hecho: CHIP_CONSULTORA.hecho.toLowerCase(), estimado: CHIP_CONSULTORA.estimado.toLowerCase(), percepcion: CHIP_CONSULTORA.percepcion.toLowerCase() };

const igualRango = (a: Rango | null | undefined, b: Rango | null | undefined) => (a == null && b == null) || (!!a && !!b && a.bajo === b.bajo && a.alto === b.alto);

function valorDe(h: Hecho, cfg: ConfigEmpresa): string {
  return h.valor ? textoDeValor(h.valor, h.unidad ?? "texto", cfg) : h.texto;
}

/** Cuánto se movió un rango, por su centro: null si no se puede decir (uno de los dos falta o el de antes es cero). */
export function cuantoSeMovio(antes: Rango | null, despues: Rango | null): number | null {
  if (!antes || !despues) return null;
  const a = centro(antes);
  if (a === 0) return centro(despues) === 0 ? 0 : null;
  return (centro(despues) - a) / Math.abs(a);
}

/** Lo que cambió de una versión a la siguiente. */
export function diferencias(antes: Version, despues: Version): Diferencias {
  const cfg = cfgDe(despues.paquete);
  const fmt = plata(cfg);
  const refsAntes = refsDelPaquete(antes.paquete);
  const refsDespues = refsDelPaquete(despues.paquete);
  const nombre = (id: string, refs: Map<string, RefValor>) => refs.get(id)?.nombre ?? id;
  const resumen: string[] = [];

  // ── Los hechos.
  const ha = new Map(antes.paquete.hechos.map((h) => [h.id, h]));
  const hd = new Map(despues.paquete.hechos.map((h) => [h.id, h]));
  const entraron = [...hd.values()].filter((h) => !ha.has(h.id)).map((h) => ({ id: h.id, nombre: nombre(h.id, refsDespues), texto: h.texto }));
  const salieron = [...ha.values()].filter((h) => !hd.has(h.id)).map((h) => ({ id: h.id, nombre: nombre(h.id, refsAntes), texto: h.texto }));
  const cambiaron: CambioHecho[] = [];
  for (const [id, d] of hd) {
    const a = ha.get(id);
    if (!a) continue;
    const valor = !igualRango(a.valor, d.valor);
    const clase = a.clase !== d.clase;
    if (!valor && !clase) continue;
    const n = nombre(id, refsDespues);
    const texto = valor && clase
      ? `${n} pasó de ${valorDe(a, cfg)} (${NOMBRE_CLASE[a.clase]}) a ${valorDe(d, cfg)} (${NOMBRE_CLASE[d.clase]}).`
      : valor ? `${n} pasó de ${valorDe(a, cfg)} a ${valorDe(d, cfg)}.` : `${n} pasó de ${NOMBRE_CLASE[a.clase]} a ${NOMBRE_CLASE[d.clase]}.`;
    cambiaron.push({ id, nombre: n, antes: valorDe(a, cfg), despues: valorDe(d, cfg), que: valor && clase ? "valor_y_clase" : valor ? "valor" : "clase", texto });
  }
  const respondidas = [...hd.values()]
    .filter((h) => h.fuente.tabla === "estrategia_preguntas" && (!ha.has(h.id) || !igualRango(ha.get(h.id)!.valor, h.valor)))
    .map((h) => ({ id: h.id, texto: h.texto }));
  const sinDespues = new Set(despues.paquete.sin_dato.map((s) => s.id));
  const ya_no_falta = antes.paquete.sin_dato.filter((s) => !sinDespues.has(s.id)).map((s) => ({ id: s.id, que_falta: s.que_falta }));

  if (respondidas.length) resumen.push(`El dueño respondió ${respondidas.length === 1 ? "una pregunta" : `${respondidas.length} preguntas`}.`);
  for (const c of cambiaron) resumen.push(c.texto);
  for (const x of entraron.filter((h) => !respondidas.some((r) => r.id === h.id))) resumen.push(`Entró: ${x.texto}.`);
  for (const x of salieron) resumen.push(`Salió: ${x.texto}.`);
  for (const x of ya_no_falta) resumen.push(`Ya no falta ${x.que_falta}.`);

  // ── Los números de cada camino.
  const numeros: CambioNumero[] = [];
  for (const letra of ["a", "b"] as const) {
    for (const h of HORIZONTES) {
      const k = `d${h}` as const;
      const a = antes.estrategia.caminos[letra].proyeccion.total[k].ritmo.valor;
      const d = despues.estrategia.caminos[letra].proyeccion.total[k].ritmo.valor;
      const camino = letra === "a" ? "Camino A" : "Camino B";
      if (!a && d) numeros.push({ camino: letra, horizonte: k, antes: a, despues: d, texto: `${camino}, a ${h} días: ahora tiene número, ${textoRango(d, fmt)} más al mes.` });
      else if (a && !d) numeros.push({ camino: letra, horizonte: k, antes: a, despues: d, texto: `${camino}, a ${h} días: perdió su número.` });
      else if (a && d) {
        const m = cuantoSeMovio(a, d);
        if (m == null || Math.abs(m) > UMBRAL) numeros.push({ camino: letra, horizonte: k, antes: a, despues: d, texto: `${camino}, a ${h} días: de ${textoRango(a, fmt)} a ${textoRango(d, fmt)} más al mes.` });
      }
    }
  }
  resumen.push(...numeros.map((n) => n.texto));

  // ── Las jugadas que cambiaron de estado.
  const jugadas: CambioJugada[] = [];
  const perdieron: string[] = [];
  for (const letra of ["a", "b"] as const) {
    const pa = new Map(antes.estrategia.caminos[letra].proyeccion.jugadas.map((j) => [j.id, j]));
    const posicion = (id: string) => despues.estrategia.caminos[letra].jugadas.findIndex((j) => j.id === id) + 1;
    for (const j of despues.estrategia.caminos[letra].proyeccion.jugadas) {
      const a = pa.get(j.id);
      if (!a) continue;
      const negativa = j.proyeccion.estado === "con_numero" && (j.proyeccion.utilidad_mes.valor?.alto ?? 0) < 0;
      const camino = letra === "a" ? "Camino A" : "Camino B";
      if (a.proyeccion.estado !== j.proyeccion.estado || negativa) {
        const texto = a.proyeccion.estado === "por_probar" && j.proyeccion.estado === "con_numero"
          ? `${camino}, jugada ${posicion(j.id)}: ya tiene número.`
          : negativa ? `${camino}, jugada ${posicion(j.id)}: con lo respondido, resta.` : `${camino}, jugada ${posicion(j.id)}: ${a.proyeccion.estado === "con_numero" ? "perdió su número" : "cambió"}.`;
        jugadas.push({ camino: letra, jugada: j.id, antes: a.proyeccion.estado, despues: j.proyeccion.estado, texto });
        if ((a.proyeccion.estado === "con_numero" && j.proyeccion.estado !== "con_numero") || negativa) perdieron.push(`${letra}.${j.id}`);
      }
    }
  }
  resumen.push(...jugadas.map((j) => j.texto));

  // ── Lo que mira convieneRegenerar.
  const rec = despues.estrategia.recomendado.camino;
  const otro: LetraCamino = rec === "a" ? "b" : "a";
  const d90 = (e: Estrategia, l: LetraCamino) => {
    const r = e.caminos[l].proyeccion.total.d90.ritmo.valor;
    return r ? centro(r) : null;
  };
  const daMas = (e: Estrategia) => {
    const r = d90(e, rec);
    const o = d90(e, otro);
    return o != null && (r == null || o > r);
  };
  const recomendadoDejo = daMas(despues.estrategia) && !daMas(antes.estrategia);

  const restriccion = despues.estrategia.anexos.terreno.restriccion.refs;
  const clavesRestriccion = new Set(restriccion.map(claveDeRef));
  const tocaRestriccion = (id: string) => restriccion.includes(id) || clavesRestriccion.has(claveDeRef(id));
  const sobreRestriccion = [...entraron.map((x) => x.id), ...cambiaron.filter((c) => c.que !== "valor").map((c) => c.id)].filter(tocaRestriccion);

  return {
    entraron,
    salieron,
    cambiaron,
    respondidas,
    ya_no_falta,
    numeros,
    jugadas,
    senales: { recomendado_dejo_de_ser_el_que_mas_da: recomendadoDejo, jugadas_que_perdieron_su_numero: perdieron, hechos_nuevos_sobre_la_restriccion: [...new Set(sobreRestriccion)] },
    resumen,
  };
}

/**
 * Si conviene volver a pensar la estrategia con el modelo (tres consultas), y por qué. Solo cuando el camino
 * recomendado deja de ser el que más da a 90 días, cuando una jugada que tenía número lo pierde o queda en negativo, o
 * cuando entra un hecho nuevo sobre la restricción. Sin motivo, no conviene: «Actualizar números» ya lo dijo todo.
 */
export function convieneRegenerar(d: Diferencias): { conviene: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (d.senales.recomendado_dejo_de_ser_el_que_mas_da) motivos.push("con lo respondido, el camino recomendado ya no es el que más deja a 90 días");
  if (d.senales.jugadas_que_perdieron_su_numero.length) motivos.push(d.senales.jugadas_que_perdieron_su_numero.length === 1 ? "una jugada que tenía número lo perdió o quedó restando" : "varias jugadas que tenían número lo perdieron o quedaron restando");
  if (d.senales.hechos_nuevos_sobre_la_restriccion.length) motivos.push("entró un dato nuevo sobre lo que frena a la empresa");
  return { conviene: motivos.length > 0, motivos };
}
