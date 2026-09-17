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
