import { RASGOS, tiene, type ClaveRasgo, type Perfil } from "./perfil";
import { BLOQUES_ACTIVOS } from "./activos";
import { CATEGORIAS, type ClaveCategoria } from "./pcf";

/**
 * LA MATRIZ DE DOCUMENTACIÓN: qué necesita ESTA empresa para diagnosticarse, ordenarse y escalar.
 *
 * Una sola metodología, resultados distintos. La matriz no se escribe por rubro —con cientos de
 * empresas eso es inmantenible y siempre falta el rubro nuevo— sino que se COMPONE de los rasgos
 * del negocio. Un bufete y una mecánica reciben cosas distintas porque tienen rasgos distintos, no
 * porque alguien escribió una lista para bufetes.
 *
 * Cada pieza trae el POR QUÉ, que es lo que la consultora le dice al cliente cuando pregunta
 * «¿y esto para qué me sirve?». Sin ese porqué, una lista de documentos es burocracia.
 */

export type Prioridad = 1 | 2 | 3;
export const NOMBRE_PRIORIDAD: Record<Prioridad, string> = {
  1: "Ahora",
  2: "Después",
  3: "Cuando crezcas",
};

const CLAVES_DOC = new Set(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => `${b.clave}.${a.clave}`)));
const NOMBRE_DOC = new Map<string, string>(BLOQUES_ACTIVOS.flatMap((b) => b.activos.map((a) => [`${b.clave}.${a.clave}`, a.nombre] as [string, string])));

/** Un documento que la empresa necesita, con el rasgo que lo dispara. */
export type PiezaDoc = { clave: string; nombre: string; prioridad: Prioridad; porque: string; disparado_por: ClaveRasgo | "base" };

/** Un proceso que esta empresa debería tener mapeado. */
export type PiezaProceso = {
  nombre: string;
  prioridad: Prioridad;
  porque: string;
  disparado_por: ClaveRasgo | "base";
  /** A qué parte del negocio pertenece, según el mapa de las 13 categorías (APQC). */
  categoria: ClaveCategoria;
};

/**
 * LA BASE: lo que toda empresa necesita, tenga el tamaño que tenga. Es la cadena mínima de
 * cualquier negocio — cómo llega el cliente, cómo se le atiende, cómo se entrega, cómo se cobra y
 * qué pasa cuando algo sale mal.
 */
const DOCS_BASE: [string, Prioridad, string][] = [
  ["procesos.mapa_procesos", 1, "Ver el negocio completo en una hoja antes de tocar nada"],
  ["procesos.incidencias", 1, "Lo que se repite es lo que hay que medir y corregir: de aquí salen tus números"],
  ["personas.funciones", 1, "Que cada persona sepa qué se espera de ella sin tener que preguntarlo"],
  ["marketing.cliente_ideal", 2, "A quién le sirves de verdad: sin eso se vende a cualquiera y se gana con nadie"],
  ["producto.reclamos", 2, "El reclamo mal atendido cuesta el cliente y los que él iba a traer"],
  ["direccion.plan_empresarial", 2, "Adónde va la empresa, escrito, para que las decisiones del día no la desvíen"],
];

const PROCESOS_BASE: [string, Prioridad, string, ClaveCategoria][] = [
  ["Cómo llega un cliente nuevo", 1, "Si no sabes por dónde entran, no sabes qué dejar de hacer", "venta"],
  ["Cómo se atiende a un cliente", 1, "Es donde se gana o se pierde la recompra", "venta"],
  ["Cómo se entrega lo que se vendió", 1, "La promesa se cumple aquí", "entrega_producto"],
  ["Cómo se cobra", 1, "Vender no es cobrar", "dinero"],
  ["Qué pasa cuando algo sale mal", 2, "El reclamo bien atendido fideliza más que la venta perfecta", "postventa"],
];

/** Lo que agrega cada rasgo. Aquí vive el criterio de consultoría, no en el código de pantalla. */
const POR_RASGO: Partial<Record<ClaveRasgo, { docs: [string, Prioridad, string][]; procesos: [string, Prioridad, string, ClaveCategoria][] }>> = {
  efectivo: {
    docs: [["procesos.controles", 1, "Donde se toca efectivo, quien cuenta no puede ser el único que revisa"]],
    procesos: [
      ["Apertura de caja", 1, "Con cuánto empieza el día, y quién lo confirma", "dinero"],
      ["Cierre y cuadre de caja", 1, "El descuadre que no se detecta el mismo día ya no se explica", "dinero"],
      ["Qué hacer con faltantes y sobrantes", 1, "Sin regla escrita, cada faltante es una discusión personal", "dinero"],
      ["Traslado y custodia del dinero", 2, "El momento más expuesto del día", "dinero"],
      ["Depósitos y conciliación con el banco", 2, "Lo que dice la caja tiene que cuadrar con lo que dice el banco", "dinero"],
    ],
  },
  inventario: {
    docs: [["procesos.controles", 1, "Lo que no se cuenta, se pierde"], ["producto.catalogo", 2, "Qué vendes exactamente y a qué precio: sin esto cada quien cotiza distinto"]],
    procesos: [
      ["Cómo se compra y se abastece", 1, "Comprar de más inmoviliza plata; de menos, pierde ventas", "externos"],
      ["Recepción de mercadería", 1, "Lo que entra mal contado se descubre cuando ya no hay a quién reclamar", "externos"],
      ["Control de stock y mermas", 2, "La merma que nadie mide se vuelve costo invisible", "bienes"],
    ],
  },
  credito: {
    docs: [["procesos.politicas", 1, "A quién se le fía, cuánto y hasta cuándo: escrito, no al criterio del día"]],
    procesos: [["Cómo se decide a quién fiar", 1, "Fiar sin criterio es regalar con retraso", "dinero"], ["Cómo se cobra lo que deben", 1, "La cobranza que no tiene dueño no ocurre", "dinero"]],
  },
  entrega: {
    docs: [["producto.entrega", 1, "Cómo se entrega y en cuánto tiempo, prometido igual por todos"]],
    procesos: [["Cómo se despacha y se entrega", 1, "Aquí se rompe la promesa o se cumple", "entrega_producto"], ["Qué pasa si la entrega falla", 2, "El cliente no juzga que falles: juzga cómo respondes", "postventa"]],
  },
  canales_digitales: {
    docs: [["marketing.canales", 2, "Por dónde llegan y quién responde en cada sitio"], ["marketing.proceso_comercial", 1, "Del primer mensaje al pago, con tiempos: si nadie responde, la venta se pierde en silencio"]],
    procesos: [["Cómo se atiende por WhatsApp o redes", 1, "El mensaje sin responder es una venta perdida que nadie registra", "venta"]],
  },
  citas: {
    docs: [["producto.entrega", 1, "Qué se promete en cada cita y en cuánto tiempo"]],
    procesos: [["Cómo se agenda una cita", 1, "La agenda ES el ingreso", "entrega_servicio"], ["Qué se hace cuando el cliente no viene", 1, "La hora vacía no se recupera", "entrega_servicio"]],
  },
  multi_sede: {
    docs: [
      ["procesos.procedimientos", 1, "El mismo trabajo hecho igual en todas las sedes, o cada una se vuelve otra empresa"],
      ["procesos.indicadores", 1, "Comparar sedes con los mismos números es la única forma de saber cuál necesita ayuda"],
      ["personas.cultura", 1, "Cada sede representa a toda la empresa: el criterio tiene que viajar"],
    ],
    procesos: [["Cómo se reporta cada sede", 1, "Sin reporte igual, no hay comparación posible", "mejora"], ["Cómo se abre y se cierra el local", 2, "El día empieza y termina igual en todas partes", "entrega_servicio"]],
  },
  turnos: {
    docs: [["procesos.procedimientos", 1, "Lo que no queda escrito en el cambio de turno se pierde entre uno y otro"]],
    procesos: [["Cómo se entrega el turno", 1, "Lo pendiente tiene que cruzar de una persona a la siguiente", "entrega_servicio"]],
  },
  datos_sensibles: {
    docs: [["procesos.sistemas", 1, "Dónde vive la información y quién puede verla"], ["procesos.controles", 1, "Quién accede a los datos de clientes y qué queda respaldado"]],
    procesos: [["Quién accede a qué información", 1, "El acceso sin dueño es el que nadie revisa", "informacion"], ["Cómo se respalda la información", 2, "Se descubre que no había respaldo el día que se pierde", "informacion"]],
  },
  atencion_publico: {
    docs: [["personas.cultura", 1, "Cada persona del mostrador ES la marca"], ["producto.calidad", 2, "Qué es un trabajo bien hecho, para que no dependa del ánimo del día"]],
    procesos: [],
  },
  activos_criticos: {
    docs: [["procesos.procedimientos", 2, "Cómo se cuida lo que si para, para el negocio"]],
    procesos: [["Mantenimiento de equipos", 2, "El equipo que solo se arregla cuando falla, falla siempre en el peor momento", "bienes"], ["Qué se hace si se cae el sistema o la luz", 2, "Improvisar una caída cuesta el día", "riesgos"]],
  },
  proveedores_clave: {
    docs: [["procesos.politicas", 2, "Con quién se compra y qué pasa si ese proveedor falla"]],
    procesos: [["Cómo se elige y evalúa un proveedor", 3, "Depender de uno solo sin alternativa es una decisión, aunque nadie la haya tomado", "externos"]],
  },
  // TAMAÑO: la vara crece con la empresa. A dos personas no se les pide un reglamento interno.
  equipo: {
    docs: [
      ["personas.organigrama", 1, "Quién responde por qué, dibujado"],
      ["personas.onboarding", 2, "Que el que entra aprenda igual que el anterior, sin depender de quién lo reciba"],
      ["personas.disciplina", 2, "Corregir con criterio y por escrito protege a la empresa y al trabajador"],
      ["personas.habilidades", 2, "Quién sabe hacer qué, y qué pasa si esa persona falta"],
      ["personas.cultura", 2, "Con varias personas, el criterio se transmite o se deforma"],
    ],
    procesos: [["Cómo se contrata e induce a alguien nuevo", 2, "El que entra sin inducción aprende los vicios, no el estándar", "personas"]],
  },
  varias_capas: {
    docs: [
      ["personas.reglamento", 1, "Con equipo grande, las reglas iguales para todos dejan de ser opcionales"],
      ["personas.evaluacion", 2, "Cómo se sabe que alguien hace bien su trabajo"],
      ["personas.meritos", 2, "Reconocer con criterio o el mérito se lo lleva el que está más cerca del dueño"],
      ["personas.seleccion", 2, "Contratar por criterio y no por urgencia"],
      ["direccion.estrategia", 2, "Con varios niveles, la dirección se escribe o cada jefe inventa la suya"],
    ],
    procesos: [["Cómo se evalúa y capacita al personal", 2, "Sin evaluación, el que mejora y el que no valen igual", "personas"]],
  },
  solo_dueno: {
    docs: [["personas.plan_personal", 1, "Todo depende de ti: lo primero es que el negocio no se caiga si faltas"]],
    procesos: [],
  },
};

export type Matriz = {
  documentos: PiezaDoc[];
  procesos: PiezaProceso[];
  /** Lo que no se puede decidir todavía porque la empresa no ha hablado de eso. */
  porAveriguar: { nombre: string; porque: string }[];
};

/**
 * Compone la matriz de ESTA empresa. Los duplicados se resuelven quedándose con la prioridad más
 * alta: si un documento lo piden dos rasgos, es más urgente, no menos.
 */
export function matrizDe(p: Perfil): Matriz {
  const docs = new Map<string, PiezaDoc>();
  const procesos = new Map<string, PiezaProceso>();

  const ponerDoc = (clave: string, prioridad: Prioridad, porque: string, por: ClaveRasgo | "base") => {
    if (!CLAVES_DOC.has(clave)) return; // nunca se recomienda un documento que no existe
    const previo = docs.get(clave);
    if (previo && previo.prioridad <= prioridad) return;
    docs.set(clave, { clave, nombre: NOMBRE_DOC.get(clave) ?? clave, prioridad, porque, disparado_por: por });
  };
  const ponerProceso = (nombre: string, prioridad: Prioridad, porque: string, por: ClaveRasgo | "base", categoria: ClaveCategoria) => {
    const previo = procesos.get(nombre);
    if (previo && previo.prioridad <= prioridad) return;
    procesos.set(nombre, { nombre, prioridad, porque, disparado_por: por, categoria });
  };

  for (const [c, pr, pq] of DOCS_BASE) ponerDoc(c, pr, pq, "base");
  for (const [n, pr, pq, cat] of PROCESOS_BASE) ponerProceso(n, pr, pq, "base", cat);

  for (const r of p.rasgos) {
    const extra = POR_RASGO[r.clave];
    if (!extra) continue;
    for (const [c, pr, pq] of extra.docs) ponerDoc(c, pr, pq, r.clave);
    for (const [n, pr, pq, cat] of extra.procesos) ponerProceso(n, pr, pq, r.clave, cat);
  }

  const orden = (a: { prioridad: Prioridad }, b: { prioridad: Prioridad }) => a.prioridad - b.prioridad;
  return {
    documentos: [...docs.values()].sort(orden),
    procesos: [...procesos.values()].sort(orden),
    // Lo que falta preguntar para completar la matriz. Se limita a lo que de verdad la cambiaría.
    porAveriguar: p.sinDatos
      .filter((r) => POR_RASGO[r.clave])
      .map((r) => ({ nombre: r.nombre, porque: r.porque })),
  };
}

/** Cuánto de su matriz tiene ya construida. Es el avance real, no el porcentaje de pantallas. */
export function avanceMatriz(m: Matriz, construidos: string[]): { listos: number; total: number; faltanAhora: PiezaDoc[] } {
  const hechos = new Set(construidos);
  const listos = m.documentos.filter((d) => hechos.has(d.clave)).length;
  return { listos, total: m.documentos.length, faltanAhora: m.documentos.filter((d) => d.prioridad === 1 && !hechos.has(d.clave)) };
}

export { RASGOS, tiene };
