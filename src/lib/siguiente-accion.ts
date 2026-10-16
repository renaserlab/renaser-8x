/**
 * LA SIGUIENTE ACCIÓN DEL PORTAL: UNA, LA MÁS URGENTE, CON SU ENLACE (R6.1, R16.2).
 *
 * Pedido de Dirección (13-10-2026): «El cliente debe ver una siguiente acción clara». Hasta ese día la portada
 * solo conocía la entrada breve, la restricción, la pregunta abierta y los pasos 2 a 8: nunca llevaba a «Hacia
 * dónde vamos», a «Tus números», a «Esta semana», a «Tus indicadores», al punto de partida ni al informe, aunque
 * en cada una hubiera algo esperando al dueño.
 *
 * Aquí está la decisión y solo la decisión: funciones puras que reciben HECHOS YA LEÍDOS y devuelven una acción
 * o null. No se lee la base (eso lo hace `pendientesDelDueno`, en src/lib/tablero.ts) y no se inventa nada: un
 * hecho que no se pudo leer llega como «no hay», y su estado simplemente no aparece.
 *
 * EL ORDEN, Y POR QUÉ. Es la constante PRIORIDAD; gana el primero que tenga algo que decir.
 *
 *    1 · entrada            La puerta: sin confirmar lo que entendimos no hay con qué trabajar. (ya existía)
 *    2 · pedidos            La consultora abrió algo para que el dueño lo llene (16-10-2026): es lo que ella espera hoy.
 *    3 · direccion          Espera la palabra del dueño: lo acordado no rige hasta que él lo confirma.
 *    4 · punto_de_partida   Espera la palabra del dueño: sin aceptarlo, ningún avance tiene contra qué compararse.
 *    5 · tareas_semana      Tiene fecha: lo que empieza o vence esta semana, y lo que venció y sigue abierto.
 *    6 · indicador          Tiene fecha: el periodo ya cerró y falta su valor.
 *    7 · numeros            Falta un dato del dueño, sin fecha.
 *    8 · tareas_en_marcha   Trabajo aprobado que esta semana no empieza ni vence.
 *    9 · informe            Para leer: el informe tiene conclusiones y nadie de la empresa lo abrió todavía.
 *   10 · restriccion        La lectura de siempre: lo que más frena a la empresa. (ya existía)
 *   11 · pregunta_abierta   La conversación quedó a mitad. (ya existía)
 *   12 · paso               El paso del recorrido en que está la empresa. (ya existía)
 *
 * Los cuatro estados que ya existían conservan su orden entre ellos. Los nuevos van entre la entrada y la
 * lectura de siempre porque son cosas concretas que esperan al dueño; la restricción no se pierde: sigue en
 * «Mi empresa», a un toque. Primero lo que se resuelve con una confirmación (destraba el trabajo de otros),
 * después lo que tiene fecha, después lo que no la tiene. Lo que pidió la consultora va primero entre los pendientes:
 * es un pedido explícito, con su nota, y el resto del trabajo de esa semana suele depender de que se llene.
 */
import { aceptacionDelDueno } from "./actas";
import { nombreDePeriodoKpi, periodoCerradoMasReciente, zonaDe, FRECUENCIAS, type Frecuencia } from "./kpis";
import { lineaBaseVigente } from "./medicion";
import { radiografia, type Metrica } from "./metricas";
import { estadoCanonico } from "./plan-reglas";
import { diaDe, diaEnZona, rangoSemana, semanaEnCurso } from "./revision-semanal";

/** La siguiente acción del portal: un texto, su explicación, a dónde lleva y qué dice el botón. */
export type SiguienteAccion = { texto: string; linea: string | null; fuente: string | null; href: string; accion: string };

// ───────────────────────── LA ENTRADA BREVE (ya existía; vivía en tablero.ts, que la sigue exportando) ─────────────────────────

/**
 * Dónde va la entrada breve (src/lib/entrada.ts): sin empezar, a medias, respondida y por confirmar, o confirmada.
 * `respondidas` y `total` son preguntas del plan, no un porcentaje.
 */
export type EntradaTablero = { estado: "sin_empezar" | "en_curso" | "por_confirmar" | "confirmada"; respondidas: number; total: number };

export const RUTA_ENTRADA = "/portal/entrada";

/**
 * MIENTRAS LA ENTRADA NO ESTÉ CONFIRMADA, ES LO PRIMERO (R7.1, R6.1). Pura. Devuelve la siguiente acción que
 * apunta a la entrada, o null si no manda: porque el dueño ya confirmó lo que entendimos, o porque la empresa
 * no tiene entrada (las que ya estaban en marcha no se devuelven al principio: siguen su camino de siempre).
 */
export function accionDeEntrada(e: EntradaTablero | null): SiguienteAccion | null {
  if (!e || e.estado === "confirmada") return null;
  if (e.estado === "por_confirmar") {
    return {
      texto: "Ya respondiste todo. Falta que revises lo que entendimos.",
      linea: "Marca lo que esté bien y corrige lo que no. Con eso empezamos.",
      fuente: null,
      href: RUTA_ENTRADA,
      accion: "Revisar y confirmar",
    };
  }
  // Con la primera pregunta abierta y ninguna respondida todavía no hay nada «guardado» que retomar: es empezar.
  if (e.estado === "en_curso" && e.respondidas > 0) {
    return {
      texto: `Vas en la pregunta ${Math.min(e.respondidas + 1, e.total)} de ${e.total}.`,
      linea: "Lo que ya respondiste está guardado. Sigues donde te quedaste.",
      fuente: null,
      href: RUTA_ENTRADA,
      accion: "Continuar",
    };
  }
  return {
    texto: "Empecemos por conocer tu negocio.",
    linea: `Son ${e.total} preguntas cortas. Puedes responder hablando, escribiendo o con un «no lo sé».`,
    fuente: null,
    href: RUTA_ENTRADA,
    accion: "Empezar",
  };
}

// ───────────────────────── LOS HECHOS ─────────────────────────

/** Acciones del plan aprobadas o en ejecución. Las de `estaSemana` están contadas también en `enMarcha`. */
export type TareasDelEquipo = { estaSemana: number; enMarcha: number };
/** Un indicador activo al que le falta el valor del último periodo que cerró (el periodo, en su código: «2026-09»). */
export type IndicadorPendiente = { nombre: string; periodo: string };

/**
 * Lo que espera al dueño, ya leído. Cada campo es un hecho; null, cero o lista vacía quieren decir «no hay nada
 * pendiente de esto» O «no se pudo saber» (tabla que todavía no existe, lectura fallida): en los dos casos el
 * estado no aparece. Nunca se rellena un hecho con una suposición.
 */
export type Pendientes = {
  /** Quien mira es el dueño, o la consultora viendo el portal como él. Un líder o un participante no confirma por la empresa. */
  comoDueno: boolean;
  /** Lo que la consultora activó para que la empresa lo llene y sigue abierto (solicitudes_cliente activas). */
  pedidos: { abiertas: number } | null;
  /** La versión acordada de «Hacia dónde va tu empresa» que el dueño todavía no confirmó. */
  direccion: { version: number } | null;
  /** El punto de partida vigente que el dueño todavía no aceptó. */
  puntoDePartida: { version: number } | null;
  tareas: TareasDelEquipo | null;
  /** En el orden en que se ven en «Tus indicadores». */
  indicadores: IndicadorPendiente[];
  /** Cuántos de los números del negocio no tienen ni cifra ni un «no lo sé». */
  numeros: { faltan: number; total: number } | null;
  /** El informe tiene al menos una conclusión firme que leer. */
  informeListo: boolean;
  /** ¿Hay rastro de que alguien de la empresa abrió el informe? (La consultora no cuenta.) null = no se pudo saber, y entonces no se anuncia. */
  informeAbierto: boolean | null;
};

/** Nada pendiente y nada sabido: de aquí parte quien lee, y es lo que queda si no se pudo leer nada. */
export const SIN_PENDIENTES: Readonly<Pendientes> = Object.freeze({
  comoDueno: false,
  pedidos: null,
  direccion: null,
  puntoDePartida: null,
  tareas: null,
  indicadores: [],
  numeros: null,
  informeListo: false,
  informeAbierto: null,
});

/** La lectura de siempre: la restricción manda; si no, la conversación a mitad; si no, el paso del recorrido. */
export type DeSiempre = {
  restriccion: { titulo: string; linea: string | null; href: string } | null;
  preguntaAbierta: string | null;
  /** El paso de `contextoPortal` (2 a 8) y su frase «qué falta ahora». */
  paso: number;
  queFalta: string;
};

/** Todo lo que la decisión mira. Lo que no se pasa cuenta como «no hay». */
export type Hechos = Partial<Pendientes> & { entrada?: EntradaTablero | null; deSiempre?: DeSiempre | null };

// ───────────────────────── EL ORDEN ─────────────────────────

/** Lo que espera al dueño, en orden de urgencia. */
export const ESTADOS_PENDIENTES = ["pedidos", "direccion", "punto_de_partida", "tareas_semana", "indicador", "numeros", "tareas_en_marcha", "informe"] as const;
/** La lectura de siempre, en el orden que ya tenía. */
export const ESTADOS_DE_SIEMPRE = ["restriccion", "pregunta_abierta", "paso"] as const;
/** EL ORDEN COMPLETO. La decisión se recorre con esta lista: cambiar la prioridad es cambiar el orden de estas tres listas. */
export const PRIORIDAD = ["entrada", ...ESTADOS_PENDIENTES, ...ESTADOS_DE_SIEMPRE] as const;

export type EstadoSiguiente = (typeof PRIORIDAD)[number];
/** La acción elegida y el estado que la decidió. */
export type Decision = SiguienteAccion & { estado: EstadoSiguiente };

/** A dónde lleva «Continuar» en cada paso del recorrido (estaba escrito en la portada). */
export const RUTA_POR_PASO: Readonly<Record<number, string>> = {
  2: "/portal/activos",
  3: "/portal/conversacion",
  4: "/portal/validar",
  5: "/portal/procesos",
  6: "/portal/activos",
  7: "/portal/resultados",
  8: "/portal/plan",
};
export const RUTA_SIN_PASO = "/portal/hoy";

const cuantas = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`;
const positivo = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** El último peldaño: el paso del recorrido. Con `deSiempre` presente nunca falta. */
const accionDePaso = (d: DeSiempre): SiguienteAccion => ({ texto: d.queFalta, linea: null, fuente: null, href: RUTA_POR_PASO[d.paso] ?? RUTA_SIN_PASO, accion: "Continuar" });

const PELDANOS: Record<EstadoSiguiente, (h: Hechos) => SiguienteAccion | null> = {
  entrada: (h) => accionDeEntrada(h.entrada ?? null),

  pedidos: (h) => {
    const n = h.pedidos?.abiertas;
    if (!positivo(n)) return null;
    return {
      texto: `Tu consultora te pidió ${cuantas(n, "cosa", "cosas")}.`,
      linea: "Ahí está qué es y dónde se llena. Si no sabes un número, dilo: también sirve.",
      fuente: null,
      href: "/portal/pedidos",
      accion: "Ver lo que te pidió",
    };
  },

  direccion: (h) =>
    h.comoDueno === true && h.direccion
      ? {
          texto: "Revisa hacia dónde va tu empresa.",
          linea: "Ya está escrito lo que conversamos y acordamos contigo sobre la empresa que quieres. Léelo y dinos si es así.",
          fuente: null,
          href: "/portal/direccion",
          accion: "Leer y confirmar",
        }
      : null,

  punto_de_partida: (h) =>
    h.comoDueno === true && h.puntoDePartida
      ? {
          texto: "Confirma tu punto de partida.",
          linea: "Es la foto de los números de tu negocio contra la que vamos a comparar todo lo que hagamos. Revísala y acéptala si es correcta.",
          fuente: null,
          href: "/portal/resultados",
          accion: "Revisar y aceptar",
        }
      : null,

  tareas_semana: (h) => {
    const n = h.tareas?.estaSemana;
    if (!positivo(n)) return null;
    return {
      texto: `Tienes ${cuantas(n, "tarea", "tareas")} esta semana.`,
      linea: "Ahí está qué toca, quién lo hace y para cuándo.",
      fuente: null,
      href: "/portal/semana",
      accion: "Ver esta semana",
    };
  },

  indicador: (h) => {
    const primero = h.indicadores?.[0];
    if (!primero) return null;
    const nombre = primero.nombre.trim();
    const otros = (h.indicadores?.length ?? 1) - 1;
    return {
      texto: nombre ? `Registra «${nombre}».` : "Registra tu indicador.",
      linea:
        `Falta el valor de ${nombreDePeriodoKpi(primero.periodo)}. Si no tienes el dato, se anota como sin dato, no como cero.` +
        (otros > 0 ? ` Hay ${otros} más por anotar.` : ""),
      fuente: null,
      href: "/portal/kpis",
      accion: "Registrar el valor",
    };
  },

  numeros: (h) => {
    const faltan = h.numeros?.faltan;
    if (!positivo(faltan)) return null;
    const total = h.numeros?.total ?? faltan;
    return {
      texto: "Completa tus números.",
      linea: `${faltan === 1 ? "Te falta 1" : `Te faltan ${faltan}`} de los ${total} números de tu negocio. Contesta de memoria; si alguno no lo sabes, dilo: también sirve.`,
      fuente: null,
      href: "/portal/numeros",
      accion: "Completar mis números",
    };
  },

  tareas_en_marcha: (h) => {
    const n = h.tareas?.enMarcha;
    // Si alguna toca esta semana ya lo dijo el peldaño de arriba; aquí la frase «ninguna vence» sería falsa.
    if (!positivo(n) || positivo(h.tareas?.estaSemana)) return null;
    return {
      texto: `Tienes ${cuantas(n, "tarea", "tareas")} en marcha.`,
      linea: `${n === 1 ? "No empieza ni vence" : "Ninguna empieza ni vence"} esta semana. Cuando termines una, pulsa «Ya lo hice» y sube una foto o una nota.`,
      fuente: null,
      href: "/portal/plan",
      accion: "Ver mi plan",
    };
  },

  informe: (h) =>
    h.informeListo === true && h.informeAbierto === false
      ? {
          texto: "Tu informe está listo.",
          linea: "Reúne lo que encontramos en tu empresa, punto por punto y con su evidencia. Puedes leerlo o imprimirlo.",
          fuente: null,
          href: "/portal/informe",
          accion: "Ver mi informe",
        }
      : null,

  restriccion: (h) => {
    const r = h.deSiempre?.restriccion;
    return r ? { texto: r.titulo, linea: r.linea, fuente: "Visto en tu propia información — nada es inventado.", href: r.href, accion: "Resolver esto ahora" } : null;
  },

  pregunta_abierta: (h) => {
    const pregunta = h.deSiempre?.preguntaAbierta;
    return pregunta
      ? { texto: pregunta, linea: null, fuente: "Tu conversación está a mitad — cada respuesta afina el diagnóstico.", href: "/portal/conversacion", accion: "Responder ahora" }
      : null;
  },

  paso: (h) => (h.deSiempre ? accionDePaso(h.deSiempre) : null),
};

function recorrer(estados: readonly EstadoSiguiente[], h: Hechos): Decision | null {
  for (const estado of estados) {
    const a = PELDANOS[estado](h);
    if (a) return { ...a, estado };
  }
  return null;
}

// ───────────────────────── LA DECISIÓN ─────────────────────────

/**
 * LA SIGUIENTE ACCIÓN: una sola, la primera de PRIORIDAD que tenga algo que decir, con su enlace. Devuelve null
 * solo cuando no hay ni un hecho (ni siquiera el paso del recorrido). Pura: se prueba sin base.
 */
export function siguienteAccion(h: Hechos): Decision | null {
  return recorrer(PRIORIDAD, h);
}

/** Solo lo que espera al dueño (estados 2 a 9). null = nada pendiente: toca la lectura de siempre. */
export function accionPendiente(p: Partial<Pendientes>): Decision | null {
  return recorrer(ESTADOS_PENDIENTES, p);
}

/** La lectura de siempre (estados 10 a 12). Nunca es null: el paso del recorrido siempre existe. */
export function accionDeSiempre(d: DeSiempre): Decision {
  return recorrer(ESTADOS_DE_SIEMPRE, { deSiempre: d }) ?? { ...accionDePaso(d), estado: "paso" };
}

// ───────────────────────── DE LAS FILAS A LOS HECHOS (puro; quien lee la base llama a esto) ─────────────────────────

/** Lo mínimo de un acta para saber quién aceptó qué. */
export type ActaBreve = { tipo?: string | null; referencia_id: string; aceptado_rol: string | null; aceptado_at: string };

/**
 * ¿Hay una versión acordada de la ficha de dirección que el dueño todavía no confirmó? Solo cuenta la
 * constancia del dueño: la que deja la consultora no reemplaza su palabra (misma regla que /portal/direccion).
 */
export function direccionSinConfirmar(ficha: { id: string; version: number } | null | undefined, actas: readonly ActaBreve[]): { version: number } | null {
  if (!ficha) return null;
  const deLaFicha = actas.filter((a) => a.tipo == null || a.tipo === "ficha_direccion");
  return aceptacionDelDueno(deLaFicha, ficha.id) ? null : { version: ficha.version };
}

/** Lo mínimo de una medición para saber cuál es el punto de partida que rige. */
export type MedicionBreve = { id: string; tipo: "linea_base" | "corte"; version?: number | null; vigente?: boolean | null };

/**
 * ¿El punto de partida que rige hoy está sin aceptar por el dueño? Cada versión es una fila distinta: haber
 * aceptado la versión 1 no acepta la 2 (misma regla que «Cómo vamos», en /portal/resultados).
 */
export function puntoDePartidaSinAceptar(mediciones: readonly MedicionBreve[], actas: readonly ActaBreve[]): { version: number } | null {
  const vigente = lineaBaseVigente(mediciones);
  if (!vigente) return null;
  return aceptacionDelDueno(actas, vigente.id) ? null : { version: vigente.version ?? 1 };
}

/** Lo que hace falta de una acción del plan para saber si está abierta y si toca esta semana. */
export type AccionBreve = {
  id: string;
  estado: string;
  verificado_at?: string | null;
  fecha_inicio?: string | null;
  vence_at?: string | null;
};

/**
 * LAS TAREAS DEL DUEÑO Y SU EQUIPO. Cuentan las acciones del plan aprobadas o en ejecución: el plan es de la
 * empresa (lo que le toca a RENASER dentro de una acción va en su campo de obligaciones, no en acciones aparte).
 * No cuentan las propuestas (todavía no obligan a nadie), las trabadas (ya las ve la consultora), las reportadas
 * (esperan a que ella las compruebe) ni las descartadas o dejadas para más adelante.
 *
 * «Esta semana» sigue la regla de /portal/semana (`armar`, en revision-semanal.ts): la acción empieza o vence
 * entre el lunes y el domingo de la semana en curso —con el reloj de la empresa—, o venció antes y sigue abierta.
 * Así toda tarea que cuenta la portada está en la pantalla a la que lleva.
 */
export function tareasDelEquipo(acciones: readonly AccionBreve[], ahora: Date = new Date(), zona?: string | null): TareasDelEquipo {
  const z = zonaDe(zona);
  const semana = rangoSemana(semanaEnCurso(ahora, z));
  const hoy = diaEnZona(ahora, z) ?? semana.hasta;
  const enLaSemana = (dia: string | null) => dia != null && dia >= semana.desde && dia <= semana.hasta;
  let estaSemana = 0;
  let enMarcha = 0;
  for (const a of acciones) {
    const estado = estadoCanonico(a);
    if (estado !== "aprobado" && estado !== "en_ejecucion") continue;
    enMarcha += 1;
    const inicio = diaDe(a.fecha_inicio);
    const vence = diaDe(a.vence_at);
    if (enLaSemana(inicio) || enLaSemana(vence) || (vence != null && vence < hoy)) estaSemana += 1;
  }
  return { estaSemana, enMarcha };
}

/** Lo que hace falta de un indicador para saber si le falta el valor del periodo que cerró. */
export type IndicadorBreve = { id: string; nombre: string; estado: string; frecuencia: string | null; estado_validacion?: string | null };

/** La frecuencia tal como viene de la base; lo desconocido se lee como mensual, igual que `desdeFila` en kpis.ts. */
export function frecuenciaDe(valor: unknown): Frecuencia {
  return (FRECUENCIAS as readonly string[]).includes(String(valor)) ? (valor as Frecuencia) : "mensual";
}

/**
 * El periodo que se le pide a un indicador: el último que cerró en el reloj de la empresa (el mismo que ofrece
 * el botón «Registrar el valor de…» en «Tus indicadores»). Lo usa quien lee para pedir solo esos valores.
 */
export function periodoQueToca(k: Pick<IndicadorBreve, "frecuencia">, ahora: Date = new Date(), zona?: string | null, horaCierre?: string | null): string {
  return periodoCerradoMasReciente(frecuenciaDe(k.frecuencia), ahora, zonaDe(zona), horaCierre);
}

/**
 * LOS INDICADORES ACTIVOS SIN EL VALOR DEL PERIODO QUE CERRÓ, en el orden recibido.
 *
 * Uno cuyo último registro fue «sin dato» no se reclama: el dueño ya contestó que no lo tiene, y la base no
 * guarda de qué periodo fue ese «sin dato» (ver `textoValidacion` en kpis.ts). Pedírselo otra vez sería un
 * recordatorio que no se puede apagar contestando. El precio: si el «sin dato» era de un periodo anterior, este
 * no se le recuerda aquí (sí en «Esta semana» y en «Tus indicadores»).
 */
export function indicadoresSinValor(
  indicadores: readonly IndicadorBreve[],
  valores: readonly { indicador_id: string; periodo: string }[],
  ahora: Date = new Date(),
  zona?: string | null,
  horaCierre?: string | null
): IndicadorPendiente[] {
  const conValor = new Set(valores.map((v) => `${v.indicador_id}|${v.periodo}`));
  const faltan: IndicadorPendiente[] = [];
  for (const k of indicadores) {
    if (k.estado !== "activo" || k.estado_validacion === "sin_dato") continue;
    const periodo = periodoQueToca(k, ahora, zona, horaCierre);
    if (!conValor.has(`${k.id}|${periodo}`)) faltan.push({ nombre: k.nombre, periodo });
  }
  return faltan;
}

/** Cuántos de los números del negocio faltan: los mismos que cuenta «Tus números» (`radiografia`). */
export function numerosQueFaltan(metricas: Metrica[]): { faltan: number; total: number } {
  const r = radiografia(metricas);
  return { faltan: r.faltan.length, total: r.total };
}
