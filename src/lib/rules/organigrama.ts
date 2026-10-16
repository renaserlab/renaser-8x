/**
 * EL ESTUDIO DEL ORGANIGRAMA — el "porqué está hecho así", con reglas y no con opinión.
 * Pedido de Kelin: el organigrama no es un dibujo, es un estudio; de aquí salen el manual de
 * funciones y el cierre de los procesos. Reglas clásicas de diseño organizacional, proporcionales
 * a pyme. Sin IA: puro cálculo verificable.
 */

export type Puesto = {
  id: string;
  nombre: string;
  mision?: string | null;
  decide?: string | null;
  persona?: string | null;
  respaldo?: string | null;
  reporta_a?: string | null;
  por_que?: string | null;
};

export type ReglaEstudio = { clave: string; nombre: string; cumple: boolean; detalle: string };

const norm = (s: string) => s.trim().toLowerCase();

/** Niveles del árbol para dibujarlo: [ [cima], [reportan a la cima], ... ]. Huérfanos al final. */
export function nivelesDelArbol(puestos: Puesto[]): Puesto[][] {
  const ids = new Set(puestos.map((p) => p.id));
  const raices = puestos.filter((p) => !p.reporta_a || !ids.has(p.reporta_a));
  const niveles: Puesto[][] = [];
  let actual = raices;
  const visto = new Set<string>();
  while (actual.length && niveles.length < 10) {
    niveles.push(actual);
    actual.forEach((p) => visto.add(p.id));
    actual = puestos.filter((p) => p.reporta_a && visto.has(p.reporta_a) && !visto.has(p.id));
  }
  const sueltos = puestos.filter((p) => !visto.has(p.id));
  if (sueltos.length) niveles.push(sueltos);
  return niveles;
}

export function profundidad(puestos: Puesto[]): number {
  return nivelesDelArbol(puestos).length;
}

/** Ciclo = A reporta a B y B (directa o indirectamente) reporta a A. Un organigrama con ciclo no es un organigrama. */
export function tieneCiclo(puestos: Puesto[]): boolean {
  const padre = new Map(puestos.map((p) => [p.id, p.reporta_a ?? null]));
  for (const p of puestos) {
    let actual = p.reporta_a ?? null;
    let saltos = 0;
    while (actual && saltos++ < 50) {
      if (actual === p.id) return true;
      actual = padre.get(actual) ?? null;
    }
  }
  return false;
}

export function estudioOrganigrama(puestos: Puesto[]): ReglaEstudio[] {
  if (!puestos.length) return [];
  const ids = new Set(puestos.map((p) => p.id));
  const raices = puestos.filter((p) => !p.reporta_a || !ids.has(p.reporta_a));
  const reglas: ReglaEstudio[] = [];

  reglas.push({
    clave: "cima_unica",
    nombre: "Una sola cabeza",
    cumple: raices.length === 1 && !tieneCiclo(puestos),
    detalle: tieneCiclo(puestos)
      ? "Hay un ciclo de reporte: alguien termina reportándose a sí mismo. Eso no es una estructura, es un nudo."
      : raices.length === 1
        ? `Todo el organigrama responde, al final, a ${raices[0].nombre}.`
        : `Hay ${raices.length} puestos sin jefe: ${raices.map((r) => r.nombre).join(", ")}. Dos cabezas en una pyme son cero cabezas.`,
  });

  const reportes = new Map<string, Puesto[]>();
  for (const p of puestos) if (p.reporta_a) reportes.set(p.reporta_a, [...(reportes.get(p.reporta_a) ?? []), p]);
  const excedidos = puestos.filter((p) => (reportes.get(p.id) ?? []).length > 6);
  reglas.push({
    clave: "tramo_de_control",
    nombre: "Nadie dirige a más de 6",
    cumple: excedidos.length === 0,
    detalle: excedidos.length
      ? excedidos.map((p) => `${p.nombre} tiene ${reportes.get(p.id)!.length} reportes directos — a partir de 7, ya no dirige: apaga incendios`).join(". ")
      : "Todos los tramos de control permiten dirigir de verdad: mirar el trabajo, no solo repartirlo.",
  });

  const prof = profundidad(puestos);
  reglas.push({
    clave: "niveles",
    nombre: "Máximo 3 niveles",
    cumple: prof <= 3,
    detalle: prof <= 3
      ? `${prof} nivel${prof === 1 ? "" : "es"}: una orden y una alerta cruzan la empresa en el día.`
      : `${prof} niveles para una pyme es burocracia: cada nivel extra es un día más para que una alerta llegue arriba.`,
  });

  const incompletos = puestos.filter((p) => !p.mision?.trim() || !p.decide?.trim());
  reglas.push({
    clave: "mision_y_decision",
    nombre: "Cada puesto con misión y decisión propia",
    cumple: incompletos.length === 0,
    detalle: incompletos.length
      ? `Sin misión o sin decisión escrita: ${incompletos.map((p) => p.nombre).join(", ")}. Un puesto que no decide nada es un mensajero caro; uno sin misión es un sueldo sin dirección.`
      : "Todos los puestos saben qué entregan y qué pueden decidir sin preguntar. Esta es la base del manual de funciones.",
  });

  const sinRespaldo = puestos.filter((p) => !p.respaldo?.trim());
  reglas.push({
    clave: "respaldo",
    nombre: "Ningún punto único de falla",
    cumple: sinRespaldo.length === 0,
    detalle: sinRespaldo.length
      ? `Sin respaldo nombrado: ${sinRespaldo.map((p) => p.nombre).join(", ")}. Si esa persona falta mañana, ese puesto — y lo que depende de él — se detiene.`
      : "Cada puesto tiene quién lo cubra. La empresa aguanta una gripe, una renuncia y unas vacaciones.",
  });

  const porPersona = new Map<string, string[]>();
  for (const p of puestos) if (p.persona?.trim()) porPersona.set(norm(p.persona), [...(porPersona.get(norm(p.persona)) ?? []), p.nombre]);
  const sobrecargados = [...porPersona.entries()].filter(([, v]) => v.length >= 3);
  reglas.push({
    clave: "sobrecarga",
    nombre: "Nadie carga 3 puestos",
    cumple: sobrecargados.length === 0,
    detalle: sobrecargados.length
      ? sobrecargados.map(([per, v]) => `${per} ocupa ${v.length} puestos (${v.join(", ")}) — con 3 sombreros, ninguno se lleva bien`).join(". ")
      : "Ninguna persona carga 3 puestos. En una pyme dos sombreros son normales; tres son el cuello de botella.",
  });

  const sinPersona = puestos.filter((p) => !p.persona?.trim());
  reglas.push({
    clave: "puestos_cubiertos",
    nombre: "Todo puesto con nombre propio",
    cumple: sinPersona.length === 0,
    detalle: sinPersona.length
      ? `Vacantes o sin asignar: ${sinPersona.map((p) => p.nombre).join(", ")}. Un rol sin persona es una promesa, no una estructura.`
      : "Cada puesto tiene un nombre y apellido que responde por él.",
  });

  return reglas;
}

// ─── La lectura de personas (R9.1): vacíos, duplicidades y sobrecarga como listas, no como veredicto ────────

/** Un puesto que nadie ocupa: lo que depende de él se detiene o lo absorbe otro sin que conste. */
export type VacioOrganigrama = { id: string; puesto: string; reporta_a: string | null; detalle: string };

/** Dos o más puestos que declaran la misma función (misión o decisión): o es un puesto repetido o la frontera no está escrita. */
export type Duplicidad = { campo: "mision" | "decide"; funcion: string; puestos: string[]; detalle: string };

/** Una persona con más puestos de los que se toleran: el cuello de botella con nombre. */
export type Sobrecarga = { persona: string; puestos: string[]; cuantos: number; detalle: string };

export type LecturaOrganigrama = {
  vacios: VacioOrganigrama[];
  duplicidades: Duplicidad[];
  sobrecarga: Sobrecarga[];
  /** Cuántos puestos por persona se toleran antes de leerlo como sobrecarga. */
  tolerados_por_persona: number;
};

/** En una pyme dos sombreros son normales; el tercero es el que no se lleva bien (misma vara que la regla «sobrecarga»). */
export const PUESTOS_TOLERADOS_POR_PERSONA = 2;

/** Para agrupar funciones y personas escritas de distinta manera: «Cobrar en caja » y «cobrar en caja» son lo mismo. */
const llave = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/**
 * Lo que la estructura actual deja ver sin interpretar: qué puesto no tiene quién lo ocupe, qué función
 * aparece escrita igual en dos puestos y quién carga más puestos de los tolerados. Son listas
 * descriptivas para la consultora, con el detalle en palabras; no son hallazgos ni decisiones. Puro:
 * sin base, sin modelo, mismo resultado cada vez.
 */
export function lecturaOrganigrama(puestos: Puesto[], opciones: { toleradosPorPersona?: number } = {}): LecturaOrganigrama {
  const tolerados = opciones.toleradosPorPersona ?? PUESTOS_TOLERADOS_POR_PERSONA;
  const nombreDe = new Map(puestos.map((p) => [p.id, p.nombre]));

  const vacios: VacioOrganigrama[] = puestos
    .filter((p) => !p.persona?.trim())
    .map((p) => {
      const jefe = p.reporta_a ? nombreDe.get(p.reporta_a) ?? null : null;
      return {
        id: p.id,
        puesto: p.nombre,
        reporta_a: jefe,
        detalle: `«${p.nombre}» no tiene quién lo ocupe${jefe ? ` (reporta a ${jefe})` : ""}: lo que ese puesto debía hacer hoy se detiene o lo absorbe alguien sin que conste.`,
      };
    });

  const duplicidades: Duplicidad[] = [];
  for (const campo of ["mision", "decide"] as const) {
    const grupos = new Map<string, { funcion: string; puestos: string[] }>();
    for (const p of puestos) {
      const texto = p[campo]?.trim();
      if (!texto) continue;
      const k = llave(texto);
      const g = grupos.get(k) ?? { funcion: texto, puestos: [] };
      if (!g.puestos.includes(p.nombre)) g.puestos.push(p.nombre);
      grupos.set(k, g);
    }
    for (const g of grupos.values()) {
      if (g.puestos.length < 2) continue;
      const que = campo === "mision" ? "la misma misión" : "la misma decisión";
      duplicidades.push({
        campo,
        funcion: g.funcion,
        puestos: g.puestos,
        detalle: `${g.puestos.join(" y ")} declaran ${que} («${g.funcion}»): o es un puesto repetido o la frontera entre ellos no está escrita.`,
      });
    }
  }

  const porPersona = new Map<string, { persona: string; puestos: string[] }>();
  for (const p of puestos) {
    const persona = p.persona?.trim();
    if (!persona) continue;
    const k = llave(persona);
    const g = porPersona.get(k) ?? { persona, puestos: [] };
    g.puestos.push(p.nombre);
    porPersona.set(k, g);
  }
  const sobrecarga: Sobrecarga[] = [...porPersona.values()]
    .filter((g) => g.puestos.length > tolerados)
    .map((g) => ({
      persona: g.persona,
      puestos: g.puestos,
      cuantos: g.puestos.length,
      detalle: `${g.persona} ocupa ${g.puestos.length} puestos (${g.puestos.join(", ")}); se toleran ${tolerados}. Cuando falte, faltan ${g.puestos.length} puestos a la vez.`,
    }));

  return { vacios, duplicidades, sobrecarga, tolerados_por_persona: tolerados };
}

// ─── Actual frente a objetivo, sin migración ─────────────────────────────────────────────────────────────

export type PuestoObjetivo = { nombre: string; cuando?: string | null };

/** Cuándo dijo el estudio que toca cada puesto nuevo (schemas · PuestoPropuesto.cuando), en palabras. */
export const CUANDO_TEXTO: Record<string, string> = {
  ahora: "Ahora",
  tres_meses: "En tres meses",
  al_crecer: "Cuando la empresa crezca",
};
const ORDEN_CUANDO = ["ahora", "tres_meses", "al_crecer"];
const SIN_FECHA = "sin_fecha";

export type ActualVsObjetivo = {
  /** Puestos que ya existen hoy y que el objetivo también contempla (por nombre). */
  coinciden: string[];
  /** Puestos de hoy que el objetivo no nombra: no significa que sobren, significa que hay que decidirlo. */
  solo_hoy: string[];
  /** Puestos del objetivo que hoy no existen: la transición pendiente. */
  solo_objetivo: PuestoObjetivo[];
  /** Los mismos puestos pendientes, agrupados por cuándo tocan: es la transición puesta en orden. */
  transicion: { cuando: string; rotulo: string; puestos: string[] }[];
  nota: string;
};

/**
 * La estructura actual (org_puestos) frente a una estructura objetivo (los puestos de una opción del
 * estudio guardado en org_estudio, que ya existe y no exige migración). Se compara por nombre de
 * puesto normalizado: es lo único que las dos listas comparten. No dice qué opción se adoptó —eso no
 * se guarda en ninguna tabla— así que quien la llame debe decir de qué opción salió el objetivo.
 */
export function compararConObjetivo(actuales: Puesto[], objetivo: PuestoObjetivo[], rotuloObjetivo = "la opción recomendada del estudio"): ActualVsObjetivo {
  const hoy = new Map(actuales.map((p) => [llave(p.nombre), p.nombre]));
  const meta = new Map(objetivo.map((p) => [llave(p.nombre), p]));
  const coinciden = [...hoy.entries()].filter(([k]) => meta.has(k)).map(([, nombre]) => nombre);
  const solo_hoy = [...hoy.entries()].filter(([k]) => !meta.has(k)).map(([, nombre]) => nombre);
  const solo_objetivo = [...meta.entries()].filter(([k]) => !hoy.has(k)).map(([, p]) => p);

  const porCuando = new Map<string, string[]>();
  for (const p of solo_objetivo) {
    const cuando = p.cuando && CUANDO_TEXTO[p.cuando] ? p.cuando : SIN_FECHA;
    porCuando.set(cuando, [...(porCuando.get(cuando) ?? []), p.nombre]);
  }
  const transicion = [...ORDEN_CUANDO, SIN_FECHA]
    .filter((c) => porCuando.has(c))
    .map((c) => ({ cuando: c, rotulo: CUANDO_TEXTO[c] ?? "Sin fecha dicha", puestos: porCuando.get(c) as string[] }));

  return {
    coinciden,
    solo_hoy,
    solo_objetivo,
    transicion,
    nota: `Comparación por nombre de puesto entre la estructura de hoy y ${rotuloObjetivo}. No consta en la base qué opción se adoptó: la transición la decide la consultora con la empresa.`,
  };
}

export type ObjetivoDelEstudio = { opcion: "a" | "b"; nombre: string; rotulo: string; puestos: PuestoObjetivo[] };

/**
 * La estructura objetivo tal como está guardada en `org_estudio.contenido` (o en una fila de
 * `org_estudio_versiones`): los puestos de la opción recomendada, o de la que se pida. El contenido lo
 * escribió el modelo y se validó al guardarlo, pero aquí se vuelve a leer con cuidado: si no tiene la
 * forma esperada devuelve null, y quien llama dice «no hay estudio que comparar» en vez de inventar uno.
 */
export function objetivoDelEstudio(contenido: unknown, opcion?: "a" | "b"): ObjetivoDelEstudio | null {
  if (!contenido || typeof contenido !== "object") return null;
  const c = contenido as Record<string, unknown>;
  const recomendada = (c.recomendacion as { opcion?: unknown } | null | undefined)?.opcion;
  const cual = opcion ?? (recomendada === "a" || recomendada === "b" ? recomendada : null);
  if (!cual) return null;
  const elegida = c[`opcion_${cual}`] as { nombre?: unknown; puestos?: unknown } | null | undefined;
  if (!elegida || !Array.isArray(elegida.puestos)) return null;
  const puestos: PuestoObjetivo[] = [];
  for (const p of elegida.puestos as { nombre?: unknown; cuando?: unknown }[]) {
    if (!p || typeof p.nombre !== "string" || !p.nombre.trim()) continue;
    puestos.push({ nombre: p.nombre.trim(), cuando: typeof p.cuando === "string" ? p.cuando : null });
  }
  if (!puestos.length) return null;
  const nombre = typeof elegida.nombre === "string" && elegida.nombre.trim() ? elegida.nombre.trim() : `Opción ${cual.toUpperCase()}`;
  const esRecomendada = recomendada === cual;
  return { opcion: cual, nombre, rotulo: `la opción ${cual.toUpperCase()} del estudio («${nombre}»${esRecomendada ? ", la recomendada" : ""})`, puestos };
}

// ─── La lectura lista para mostrar: una sola llamada para la página del organigrama ──────────────────────

export type SeccionPersonas = {
  clave: "vacios" | "duplicidades" | "sobrecarga";
  titulo: string;
  /** Una frase por hallazgo, ya escrita. */
  items: string[];
  /** Lo que se dice cuando la lista está vacía: que se miró y no hay nada, no un hueco en la pantalla. */
  sin_nada: string;
};

export type LecturaDePersonas = {
  /** false cuando no hay ningún puesto anotado: no hay estructura que leer y no se afirma nada de ella. */
  hay_puestos: boolean;
  /** Vacíos, duplicidades y sobrecarga, en ese orden. Vacía si no hay puestos. */
  secciones: SeccionPersonas[];
  /** La comparación con la estructura objetivo; null si no hay estudio guardado con qué comparar. */
  objetivo: (ActualVsObjetivo & { nombre: string; rotulo: string }) | null;
  /** Por qué no hay comparación, en palabras. null cuando sí la hay. */
  sin_objetivo: string | null;
};

/**
 * Todo lo que la página del organigrama necesita para mostrar la lectura de personas (R9.1), en una
 * llamada: `puestos` es org_puestos tal cual y `contenidoEstudio` es `org_estudio.contenido` tal cual (o
 * null). Devuelve textos ya escritos para la consultora, de modo que la página solo los pinte.
 *
 * Es descriptivo: dice lo que la estructura deja ver y lo que el estudio guardado propone. No decide
 * nada, no llama al modelo y no escribe en la base. Sin puestos no afirma «todo está cubierto»; sin
 * estudio no inventa una estructura objetivo.
 */
export function lecturaDePersonas(puestos: Puesto[], contenidoEstudio: unknown, opciones: { toleradosPorPersona?: number; opcion?: "a" | "b" } = {}): LecturaDePersonas {
  const lectura = lecturaOrganigrama(puestos, { toleradosPorPersona: opciones.toleradosPorPersona });
  const n = lectura.tolerados_por_persona;
  const secciones: SeccionPersonas[] = puestos.length
    ? [
        { clave: "vacios", titulo: "Puestos sin quién los ocupe", items: lectura.vacios.map((v) => v.detalle), sin_nada: "Todos los puestos anotados tienen a alguien asignado." },
        { clave: "duplicidades", titulo: "La misma función escrita en dos puestos", items: lectura.duplicidades.map((d) => d.detalle), sin_nada: "Ninguna misión ni decisión está escrita igual en dos puestos." },
        { clave: "sobrecarga", titulo: `Personas con más de ${n} puestos`, items: lectura.sobrecarga.map((s) => s.detalle), sin_nada: `Nadie ocupa más de ${n} puestos.` },
      ]
    : [];

  const meta = objetivoDelEstudio(contenidoEstudio, opciones.opcion);
  if (!meta) {
    return {
      hay_puestos: puestos.length > 0,
      secciones,
      objetivo: null,
      sin_objetivo: "No hay un estudio guardado con una opción recomendada: no hay estructura objetivo con la que comparar la de hoy. Se genera con el botón «Generar el estudio».",
    };
  }
  return {
    hay_puestos: puestos.length > 0,
    secciones,
    objetivo: { ...compararConObjetivo(puestos, meta.puestos, meta.rotulo), nombre: meta.nombre, rotulo: meta.rotulo },
    sin_objetivo: null,
  };
}
