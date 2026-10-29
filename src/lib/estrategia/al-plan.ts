/**
 * LA ESTRATEGIA APROBADA BAJA AL PLAN (28-10-2026). PURO: sin base, sin red, sin reloj.
 *
 * QUÉ ESTABA ROTO. Aprobar una estrategia no escribía NADA en el plan. Dentro de la fila de la estrategia
 * aprobada ya estaban escritas, validadas y con sus cuentas hechas tres cosas que son exactamente un plan:
 *
 *   · `victorias_14_dias` — de dos a cuatro cosas que se hacen en la primera semana, cada una con su
 *     responsable, el día en que empieza y lo que entra a la caja o deja de salir cada mes. Esto es lo que
 *     se pidió: «estrategias simples para que en una semana ya tengamos resultados».
 *   · `caminos[el elegido].jugadas` — de tres a cinco jugadas, cada una con por qué se hace, qué abre, qué
 *     se espera que haga el mercado, qué hacemos si responde distinto, y desde qué día.
 *   · `medir_desde_el_dia_1` — de dos a cuatro números, cada uno con cómo se mide, quién lo anota, cada
 *     cuánto, y sus metas a 30 y 90 días.
 *
 * Y la tabla del plan seguía vacía. La dueña veía DOS PLANES SIN RELACIÓN: arriba el camino aprobado, y
 * abajo «las acciones en marcha», que salían del diagnóstico y no de su estrategia. Ninguna jugada aparecía
 * en esa lista y nada decía por qué.
 *
 * CÓMO SE DECIDE QUÉ VA EN CADA CAMPO. La regla es una: cada campo del plan se llena con el campo de la
 * estrategia que dice lo mismo, o se queda vacío. Nada se traduce, nada se interpreta y nada se inventa:
 *
 *   accion                  ← `que` de la victoria · `que_se_mueve` de la jugada
 *   objetivo_empresarial    ← `por_que` de la jugada · la gran apuesta, para una victoria (no tiene suyo)
 *   resultado_esperado      ← el texto de la cuenta ya hecha (`R:v.1.caja`, `R:a.J2.mes`), no una promesa
 *   restriccion_oportunidad ← `que_abre` de la jugada: qué jugada habilita esta
 *   riesgos                 ← `si_responde_distinto`: qué hacemos si el mercado no responde como se espera
 *   supuestos               ← `respuesta_del_mercado`: lo que se da por hecho que harán clientes y rivales
 *   responsable             ← `responsable`, tal como está
 *   responsable_participant_id ← la persona registrada que se llama así, SOLO si la estrategia la encontró
 *   fecha_inicio            ← el día del paquete congelado más `desde_dia` (el día 1 es el día de hoy)
 *   vence_at                ← catorce días después, para las victorias; vacío para las jugadas
 *
 * Y lo que la estrategia no dice se queda en nulo: `criterio_aceptacion` e `indicador_id` no existen en su
 * vocabulario. La pantalla del plan ya dice qué le falta a cada acción para poder aprobarse (`queLeFalta`),
 * y ahora dice dos cosas en vez de catorce, con los indicadores de la estrategia ya en la lista para elegir.
 *
 * POR QUÉ NACEN «PROPUESTAS» Y NO «APROBADAS». Aprobar la estrategia y aprobar una acción del plan son dos
 * actos distintos, y el segundo tiene sus reglas: los seis mínimos llenos, la autoridad de aprobar planes y
 * el límite de frentes abiertos de la empresa. Escribirlas «aprobadas» saltaría las tres y dejaría acciones
 * aprobadas sin responsable identificado ni criterio de aceptación. Lo que cambia con esto no es quién
 * aprueba: es que la consultora deje de mirar una tabla vacía.
 */
import { resolverResponsable } from "../plan-reglas";
import type { Estrategia, LetraCamino } from "./armar";
import type { RefValor, Unidad } from "./paquete";

/** Lo que basta saber de una persona para poder apuntarle una acción. */
export type Persona = { id: string; nombre: string; puesto?: string | null };

/** Una fila de `actions` lista para insertar, sin `company_id` ni `estrategia_id` (los pone quien escribe). */
export type AccionDeEstrategia = {
  /** De qué pieza de la estrategia salió: «v.1» la primera victoria, «a.J2» la segunda jugada del camino A. */
  estrategia_ref: string;
  accion: string;
  objetivo_empresarial: string | null;
  resultado_esperado: string | null;
  restriccion_oportunidad: string | null;
  riesgos: string | null;
  supuestos: string | null;
  responsable: string | null;
  responsable_participant_id: string | null;
  fecha_inicio: string;
  vence_at: string | null;
  semana_inicio: number;
  semana_cierre: number | null;
  prioridad: number;
  fase: "implementacion";
  estado: "propuesto";
  nota: string;
};

/** Una fila de `indicadores` lista para insertar, sin `company_id` ni `estrategia_id`. */
export type IndicadorDeEstrategia = {
  estrategia_ref: string;
  clave: string;
  nombre: string;
  como_se_mide: string;
  unidad: "soles" | "de_cada_10" | "dias" | "personas" | "numero" | "porcentaje";
  mejor_si: "sube" | "baja" | "neutro";
  meta_valor: number | null;
  meta_texto: string | null;
  frecuencia: "diaria" | "semanal" | "mensual";
  origen: "accion";
  origen_texto: string;
  definicion: string;
  estado: "activo";
};

export type Bajada = { acciones: AccionDeEstrategia[]; indicadores: IndicadorDeEstrategia[] };

/** Días a sumar a un día AAAA-MM-DD. En UTC a propósito: un día ya es un día, no un instante con zona. */
function masDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * La semana del plan en que cae un día: el día 1 es la semana 1, el 8 la semana 2. El plan cuenta hasta siete
 * semanas (rules/plan.ts y el esquema de la ficha), así que una jugada que empieza el día 90 cae en la última.
 * El día exacto no se pierde: va en `fecha_inicio` y en la nota.
 */
const semanaDe = (desdeDia: number): number => Math.min(7, Math.max(1, Math.ceil(desdeDia / 7)));

/**
 * La persona registrada que se llama así. Solo cuenta si la estrategia ya dijo que la encontró
 * (`responsable_encontrado`): sin eso, `responsable` dice «por definir» y no hay a quién apuntar.
 *
 * SE BUSCA CON EL MISMO BUSCADOR QUE USÓ EL ARMADO (29-10-2026). Aquí había una comparación propia, más
 * estricta: el nombre completo, exacto. Y el armado marca «encontrado» con `resolverResponsable`, que además
 * reconoce el nombre dentro de una frase, el nombre de pila y el puesto. Resultado: la estrategia decía
 * «la dueña» y la daba por encontrada, y al bajar al plan no apuntaba a nadie, así que TODAS las acciones
 * nacían sin responsable y ninguna se podía aprobar —justo en una empresa donde hay una sola persona
 * registrada—. Dos buscadores distintos para la misma pregunta siempre terminan contestando distinto.
 */
function quienEs(nombre: string, encontrado: boolean, personas: readonly Persona[]): string | null {
  if (!encontrado) return null;
  return resolverResponsable(nombre, personas)?.id ?? null;
}

/** El texto de una cuenta ya hecha, si tiene número. Sin número no se promete nada. */
function cuenta(refs: ReadonlyMap<string, RefValor>, id: string): string | null {
  const r = refs.get(id);
  if (!r || !r.valor) return null;
  return `${r.nombre}: ${r.texto}`;
}

/** Lo que entra a la caja y lo que deja de salir cada mes, juntos en una frase si están los dos. */
function loQueCambia(refs: ReadonlyMap<string, RefValor>, caja: string | null, mes: string | null): string | null {
  const partes = [caja && cuenta(refs, caja), mes && cuenta(refs, mes)].filter((x): x is string => !!x);
  return partes.length ? partes.join(". ") : null;
}

/** La unidad del indicador, tomada de la unidad de su propio número. Lo que el plan no sabe contar, «numero». */
function unidadDe(u: Unidad | undefined): IndicadorDeEstrategia["unidad"] {
  return u === "soles" || u === "dias" || u === "personas" || u === "de_cada_10" ? u : "numero";
}

/** El punto medio de un rango, para poder comparar un «de 3 a 5» con un «de 8 a 10». */
const medio = (r: { bajo: number; alto: number } | null | undefined): number | null => (r ? (r.bajo + r.alto) / 2 : null);

/**
 * HACIA DÓNDE ES MEJOR QUE VAYA ESTE NÚMERO. No lo dice la estrategia, así que se CALCULA comparando el
 * punto de partida con la meta de 30 días, que sí están escritos. Si falta uno de los dos, o si son
 * iguales, queda «neutro»: un número al que se le pone la dirección equivocada pinta en rojo el día que
 * las cosas van bien, y eso es peor que no pintar nada.
 */
function direccion(refs: ReadonlyMap<string, RefValor>, base: string | null, meta: string | null): IndicadorDeEstrategia["mejor_si"] {
  const b = medio(base ? refs.get(base)?.valor : null);
  const m = medio(meta ? refs.get(meta)?.valor : null);
  if (b === null || m === null || b === m) return "neutro";
  return m > b ? "sube" : "baja";
}

const normalizar = (bruta: string): string =>
  bruta
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

/**
 * LAS ACCIONES Y LOS NÚMEROS QUE SALEN DE UNA ESTRATEGIA APROBADA.
 *
 * `hoy` es el día del paquete congelado, no el de la máquina: la estrategia se armó con los datos de ese
 * día y sus «desde el día 3» se cuentan desde ahí. Devuelve TODO lo que la estrategia dice; qué parte de eso
 * hay que escribir de verdad lo decide `loQueFalta`.
 */
export function bajarAlPlan(x: {
  estrategia: Estrategia;
  camino: LetraCamino;
  version: number;
  refs: ReadonlyMap<string, RefValor>;
  personas: readonly Persona[];
  hoy: string;
}): Bajada {
  const { estrategia: e, camino, version, refs, personas, hoy } = x;
  const c = e.caminos[camino];
  const deDonde = `Sale de la estrategia aprobada (versión ${version}, camino ${camino.toUpperCase()}: ${c.nombre}).`;
  const acciones: AccionDeEstrategia[] = [];

  // ─── Las victorias de los primeros 14 días ─────────────────────────────────────────────────────
  // Van primero y con la prioridad más alta porque son lo que da resultado en la primera semana. Su
  // objetivo es la gran apuesta: una victoria no trae un «por qué» propio, y el único que es verdad para
  // todas es el de la estrategia entera.
  (e.victorias_14_dias ?? []).forEach((v, i) => {
    const n = i + 1;
    const inicio = masDias(hoy, Math.max(0, v.desde_dia - 1));
    acciones.push({
      estrategia_ref: `v.${n}`,
      accion: v.que,
      objetivo_empresarial: e.gran_apuesta.frase,
      resultado_esperado: loQueCambia(refs, `R:v.${n}.caja`, `R:v.${n}.mes`),
      restriccion_oportunidad: null,
      riesgos: null,
      supuestos: null,
      responsable: v.responsable,
      responsable_participant_id: quienEs(v.responsable, v.responsable_encontrado, personas),
      fecha_inicio: inicio,
      // Catorce días contados desde que empieza, el último incluido: es lo que la propia victoria promete.
      vence_at: masDias(inicio, 13),
      semana_inicio: semanaDe(v.desde_dia),
      semana_cierre: semanaDe(v.desde_dia) + 1,
      prioridad: n,
      fase: "implementacion",
      estado: "propuesto",
      nota: `${deDonde} Es una de las victorias de los primeros 14 días: empieza el día ${v.desde_dia}.`,
    });
  });

  // ─── Las jugadas del camino elegido ────────────────────────────────────────────────────────────
  // Después de las victorias, en el orden en que el camino las dejó (que ya tiene en cuenta qué jugada
  // abre a cuál). Sin fecha de vencimiento: la jugada dice desde qué día empieza y ninguna dice cuándo
  // termina. Inventarle un plazo sería ponerle una fecha que nadie acordó.
  c.jugadas.forEach((j, i) => {
    const inicio = masDias(hoy, Math.max(0, j.desde_dia - 1));
    acciones.push({
      estrategia_ref: `${camino}.${j.id}`,
      accion: j.que_se_mueve,
      objetivo_empresarial: j.por_que,
      resultado_esperado: loQueCambia(refs, null, `R:${camino}.${j.id}.mes`),
      restriccion_oportunidad: j.que_abre,
      riesgos: j.si_responde_distinto,
      supuestos: j.respuesta_del_mercado,
      responsable: j.responsable,
      responsable_participant_id: quienEs(j.responsable, j.responsable_encontrado, personas),
      fecha_inicio: inicio,
      vence_at: null,
      semana_inicio: semanaDe(j.desde_dia),
      semana_cierre: null,
      prioridad: (e.victorias_14_dias ?? []).length + i + 1,
      fase: "implementacion",
      estado: "propuesto",
      nota: `${deDonde} Es la jugada ${i + 1} del camino: empieza el día ${j.desde_dia}. Pilar: ${j.pilar}.`,
    });
  });

  // ─── Los números que se miden desde el día 1 ───────────────────────────────────────────────────
  // Nacen ACTIVOS, no propuestos: son parte de lo que la consultora acaba de aprobar, y un número que
  // nadie activa no se puede anotar. «Quién lo anota» no tiene columna propia en la tabla, así que se
  // guarda donde se guarda la procedencia, que es donde alguien lo va a ir a buscar.
  const indicadores: IndicadorDeEstrategia[] = (e.medir_desde_el_dia_1 ?? []).map((m, i) => {
    const clave = normalizar(m.nombre) || `medir_dia_1_${i + 1}`;
    const metaRef = m.meta_30 ? refs.get(m.meta_30) : undefined;
    const rango = metaRef?.valor ?? null;
    const metaTexto = [m.meta_30 && cuenta(refs, m.meta_30), m.meta_90 && cuenta(refs, m.meta_90)].filter((t): t is string => !!t).join(". ");
    return {
      estrategia_ref: `m.${i + 1}`,
      clave,
      nombre: m.nombre,
      como_se_mide: m.como_se_mide,
      unidad: unidadDe(metaRef?.unidad ?? (m.base ? refs.get(m.base)?.unidad : undefined)),
      mejor_si: direccion(refs, m.base, m.meta_30),
      // Un rango no es un número: «de 8 a 10» no se puede guardar como meta_valor. Cuando la meta es un
      // solo número sí entra; cuando es un rango, entra entero en el texto, que es donde se lee.
      meta_valor: rango && rango.bajo === rango.alto ? rango.bajo : null,
      meta_texto: metaTexto || null,
      frecuencia: m.frecuencia,
      origen: "accion",
      origen_texto: `${deDonde} Hay que medirlo desde el día 1. Lo anota: ${m.quien_anota}.`,
      definicion: `${m.nombre}. ${deDonde}`,
      estado: "activo",
    };
  });

  return { acciones, indicadores };
}

/** Lo que el plan de la empresa ya tiene bajado de alguna estrategia, para no escribirlo dos veces. */
export type YaBajado = {
  /** Las acciones que vinieron de CUALQUIER estrategia de esta empresa: su referencia y su texto. */
  acciones: readonly { estrategia_id: string | null; estrategia_ref: string | null; accion: string }[];
  /** TODAS las claves de indicador de la empresa, vengan de donde vengan. */
  claves: readonly string[];
};

/**
 * QUÉ HAY QUE ESCRIBIR DE VERDAD. Aprobar la misma estrategia otra vez, o aprobar su actualización, no puede
 * duplicar el plan: una acción duplicada se aprueba dos veces, se ejecuta dos veces y cuenta dos veces para el
 * límite de frentes. Se descarta lo que ya está, por dos caminos:
 *
 *  · MISMA PIEZA DE LA MISMA CADENA DE VERSIONES (`estrategia_ref`): es volver a aprobar lo mismo. Lo que ya bajó
 *    se queda como está, con las correcciones que la consultora le haya hecho encima; no se pisa nada. La cadena
 *    la arma quien llama, siguiendo `basada_en`: la victoria 1 de la versión 2 es la victoria 1 de la versión 1,
 *    aunque su fila sea otra. (Hasta el 29-10-2026 esto solo miraba DENTRO de una versión, y la red de abajo —el
 *    texto— era lo único que sostenía la cadena: bastaba con corregirle la redacción a una acción para que
 *    «Actualizar números» la volviera a crear, duplicada, con la redacción vieja al lado de la corregida.)
 *  · MISMO TEXTO, VENGA DE DONDE VENGA: segunda red, por si la cadena se rompió (una estrategia nueva que
 *    repite una jugada, una fila sin procedencia). Esas acciones pueden estar ya en ejecución, reportadas o
 *    verificadas: se dejan donde están. Reescribirlas borraría trabajo hecho.
 *
 * Y un número con una clave que la empresa ya usa no se crea otra vez: el mismo número medido igual es el mismo
 * número. Lo impide además `unique (company_id, clave)` en la base; aquí se decide antes para poder contarlo.
 */
export function loQueFalta(b: Bajada, ya: YaBajado, cadena: readonly string[]): Bajada & { ya_estaban: number } {
  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const deLaCadena = new Set(cadena);
  const refsDeEsta = new Set(ya.acciones.filter((a) => a.estrategia_id && deLaCadena.has(a.estrategia_id)).map((a) => a.estrategia_ref));
  const textos = new Set(ya.acciones.map((a) => plano(a.accion)));
  const claves = new Set(ya.claves);
  const acciones = b.acciones.filter((a) => !refsDeEsta.has(a.estrategia_ref) && !textos.has(plano(a.accion)));
  const indicadores = b.indicadores.filter((i) => !claves.has(i.clave));
  return {
    acciones,
    indicadores,
    ya_estaban: b.acciones.length - acciones.length + (b.indicadores.length - indicadores.length),
  };
}
