import { RASGOS, tiene, type ClaveRasgo, type Perfil } from "./perfil";
import { BLOQUES_ACTIVOS } from "./activos";
import { type ClaveCategoria } from "./pcf";
import { MATRICES } from "./rules/matrices";

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

/**
 * Los modelos operativos que clasifica rules/matrices.ts (citas, orden, profesional, retail, restaurante,
 * produccion, recurrencia). Se repiten aquí como tipo cerrado para que `POR_MODELO` no pueda nombrar un
 * modelo que no existe; la prueba de matriz comprueba que cada clave está en MATRICES.
 */
export type ClaveModelo = "citas" | "orden" | "profesional" | "retail" | "restaurante" | "produccion" | "recurrencia";
export const CLAVES_MODELO: readonly ClaveModelo[] = ["citas", "orden", "profesional", "retail", "restaurante", "produccion", "recurrencia"];

/**
 * Qué disparó una pieza: la base común, un rasgo del negocio o su modelo operativo. El modelo va con
 * prefijo porque «citas» es a la vez un rasgo (trabaja con agenda) y un modelo (citas / capacidad), y
 * la pantalla tiene que poder decir cuál de los dos la pidió.
 */
export type DisparadoPor = ClaveRasgo | "base" | `modelo:${ClaveModelo}`;

/** Un documento que la empresa necesita, con el rasgo (o el modelo) que lo dispara. */
export type PiezaDoc = { clave: string; nombre: string; prioridad: Prioridad; porque: string; disparado_por: DisparadoPor };

/** Un proceso que esta empresa debería tener mapeado. */
export type PiezaProceso = {
  nombre: string;
  prioridad: Prioridad;
  porque: string;
  disparado_por: DisparadoPor;
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

/**
 * Lo que agrega el MODELO OPERATIVO. Hasta el 13-10-2026 el perfil clasificaba el modelo (p.modelos,
 * rules/matrices.ts) y la matriz lo ignoraba: una tienda recibía lo mismo que un estudio jurídico salvo
 * por sus rasgos. El modelo dice de qué vive el negocio —la ecuación interna de cada matriz— y de ahí
 * salen los procesos que ningún rasgo pide: fijar el precio y la oferta en una tienda, el alcance de un
 * caso en un estudio, el pedido que llega a cocina en un restaurante.
 *
 * Los nombres no repiten los de la base ni los de los rasgos a propósito: dos nombres distintos para el
 * mismo proceso serían dos filas en la pantalla. Lo que ya pide un rasgo (comprar y abastecer, cuadrar
 * caja, cobrar lo que deben) no se vuelve a pedir aquí.
 */
const POR_MODELO: Record<ClaveModelo, { docs: [string, Prioridad, string][]; procesos: [string, Prioridad, string, ClaveCategoria][] }> = {
  retail: {
    docs: [
      ["producto.catalogo", 1, "Qué vendes, a qué precio y qué te deja cada cosa: en una tienda el margen por producto es la primera cuenta"],
      ["resultados.margen", 1, "Lo que sale rápido y lo que deja más no siempre es lo mismo: hay que saber cuál es cuál"],
      ["procesos.indicadores", 2, "Rotación, merma y margen por producto: los tres números que mandan en una tienda"],
    ],
    procesos: [
      ["Cómo se fija el precio y se decide una oferta", 1, "Si cada quien pone el precio, el margen lo decide el ánimo del día", "oferta"],
      ["Cómo se repone lo que falta en el estante", 1, "El producto que falta justo cuando lo piden es una venta regalada al vecino", "entrega_producto"],
      ["Qué se hace con lo que no rota", 2, "La mercadería parada es plata parada: liquidar a tiempo cuesta menos que guardarla", "bienes"],
    ],
  },
  citas: {
    docs: [
      ["resultados.tiempos", 2, "La agenda llena a medias no se ve en la caja del día: se ve a fin de mes"],
      ["marketing.proceso_comercial", 2, "Del mensaje a la cita agendada: si nadie responde rápido, la hora se la lleva otro"],
    ],
    procesos: [
      ["Cómo se confirma la cita el día anterior", 1, "La cita que no se confirma es la que se cae", "entrega_servicio"],
      ["Cómo se llena una hora que quedó libre", 2, "Una hora vacía no se guarda para mañana: se pierde hoy", "venta"],
      ["Cómo se invita al cliente a volver", 2, "El cliente que no agenda la próxima antes de irse vuelve cuando se acuerda", "postventa"],
    ],
  },
  orden: {
    docs: [
      ["producto.calidad", 1, "Qué es un trabajo bien hecho, escrito, para que no vuelva por el mismo problema"],
      ["resultados.tiempos", 1, "Cuántos días está el trabajo parado esperando repuesto, aprobación o gente: ahí se va el margen"],
    ],
    procesos: [
      ["Cómo se recibe y diagnostica un trabajo", 1, "Lo que entra mal diagnosticado sale mal cobrado", "entrega_servicio"],
      ["Cómo se presupuesta y se aprueba con el cliente", 1, "El presupuesto sin aprobación escrita termina en discusión al entregar", "venta"],
      ["Cómo se avisa al cliente del avance", 2, "El cliente que no sabe, llama; el que llama tres veces, desconfía", "postventa"],
      ["Qué se hace con el trabajo que vuelve por el mismo problema", 2, "La garantía que se repite dos veces señala el paso que falla", "postventa"],
    ],
  },
  profesional: {
    docs: [
      ["procesos.indicadores", 1, "Horas por caso y cobrado contra pactado: sin eso nadie sabe qué servicio deja plata"],
      ["marketing.oferta", 2, "Qué incluye el honorario y qué no: el alcance que no está escrito crece solo"],
    ],
    procesos: [
      ["Cómo se abre un caso y se define su alcance", 1, "El alcance que no se escribe crece solo y nadie lo cobra", "entrega_servicio"],
      ["Cómo se controlan plazos y vencimientos", 1, "Un plazo vencido no se recupera con horas extra", "entrega_servicio"],
      ["Cómo se registran las horas por caso", 2, "Sin horas por caso la rentabilidad de cada servicio es una suposición", "dinero"],
      ["Cómo se cobra la parte final del honorario", 1, "Lo pactado no es lo cobrado: la mitad final entra si alguien la persigue", "dinero"],
    ],
  },
  restaurante: {
    docs: [
      ["producto.catalogo", 1, "Cada plato con su costo de receta: sin eso la carta se arma por gusto y no por margen"],
      ["procesos.controles", 1, "Insumos que entran, salen y se botan: lo que no se pesa se pierde en la cocina"],
    ],
    procesos: [
      ["Cómo se toma el pedido y llega a cocina", 1, "El pedido mal tomado se paga dos veces: en insumo y en cliente", "entrega_servicio"],
      ["Cómo se controlan los insumos y lo que se bota", 1, "Lo que se bota a la semana es margen que ya se pagó", "bienes"],
      ["Cómo se atiende el delivery", 2, "El delivery sin control de comisiones vende mucho y deja poco", "entrega_producto"],
      ["Cómo se arma el turno de hora punta", 2, "La mesa que tarda en desocuparse es un cliente que se fue sin sentarse", "entrega_servicio"],
    ],
  },
  produccion: {
    docs: [
      ["procesos.procedimientos", 1, "Cada etapa escrita igual, para que el rendimiento no dependa del turno"],
      ["producto.calidad", 1, "Lo que sale mal y se rehace cuesta dos veces: el estándar se revisa antes de despachar"],
    ],
    procesos: [
      ["Cómo se planifica la producción de la semana", 1, "Sin plan, la máquina produce lo urgente y no lo que se vende", "entrega_producto"],
      ["Qué se hace cuando la línea se para", 1, "Cada hora parada tiene una causa con dueño, o se repite la semana siguiente", "bienes"],
      ["Cómo se controla la calidad antes de despachar", 1, "El defecto que llega al cliente cuesta el flete, la reposición y la confianza", "entrega_producto"],
      ["Cómo se calcula el costo de producir una unidad", 2, "Sin costo por unidad el precio se pone por comparación y no por margen", "dinero"],
    ],
  },
  recurrencia: {
    docs: [
      ["resultados.retencion", 1, "Cuántos de los que entran siguen a los seis meses: el número que dice si el negocio crece o se vacía"],
      ["procesos.politicas", 2, "Cuotas, mora y congelamientos: la regla escrita evita la excepción de cada mes"],
    ],
    procesos: [
      ["Cómo se inscribe y se recibe a un miembro nuevo", 1, "El primer mes decide si se queda", "venta"],
      ["Qué se hace cuando alguien deja de venir", 1, "Al que se va sin que nadie lo llame, no vuelve", "postventa"],
      ["Cómo se cobra la cuota y se persigue la mora", 1, "La cuota que no se cobra a tiempo se vuelve deuda que nadie cobra", "dinero"],
    ],
  },
};

/** Las claves de MATRICES (rules/matrices.ts), para comprobar que POR_MODELO no nombra un modelo que no existe. */
export const MODELOS_CLASIFICABLES: readonly string[] = MATRICES.map((m) => m.clave);

/** Las piezas que agrega un modelo, de solo lectura: lo usan las pruebas y quien quiera mostrar el catálogo. */
export function piezasDelModelo(modelo: string): { docs: readonly [string, Prioridad, string][]; procesos: readonly [string, Prioridad, string, ClaveCategoria][] } | null {
  return (CLAVES_MODELO as readonly string[]).includes(modelo) ? POR_MODELO[modelo as ClaveModelo] : null;
}

export type Matriz = {
  documentos: PiezaDoc[];
  procesos: PiezaProceso[];
  /** Lo que no se puede decidir todavía porque la empresa no ha hablado de eso. */
  porAveriguar: { nombre: string; porque: string }[];
};

/**
 * Compone la matriz de ESTA empresa: la base, lo que agregan sus rasgos y lo que agrega su modelo
 * operativo. Los duplicados se resuelven quedándose con la prioridad más alta: si un documento lo
 * piden dos rasgos, es más urgente, no menos. Un perfil sin modelo clasificado recibe exactamente lo
 * que recibía antes de que el modelo contara: la base y sus rasgos.
 */
export function matrizDe(p: Perfil): Matriz {
  const docs = new Map<string, PiezaDoc>();
  const procesos = new Map<string, PiezaProceso>();

  const ponerDoc = (clave: string, prioridad: Prioridad, porque: string, por: DisparadoPor) => {
    if (!CLAVES_DOC.has(clave)) return; // nunca se recomienda un documento que no existe
    const previo = docs.get(clave);
    if (previo && previo.prioridad <= prioridad) return;
    docs.set(clave, { clave, nombre: NOMBRE_DOC.get(clave) ?? clave, prioridad, porque, disparado_por: por });
  };
  const ponerProceso = (nombre: string, prioridad: Prioridad, porque: string, por: DisparadoPor, categoria: ClaveCategoria) => {
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

  // El modelo operativo (p.modelos) viene de clasificarModelo; un modelo que no tiene catálogo aquí
  // no agrega nada, y se dice en la prueba, no en silencio: CLAVES_MODELO cubre todas las MATRICES.
  for (const m of p.modelos) {
    const extra = piezasDelModelo(m);
    if (!extra) continue;
    const por: DisparadoPor = `modelo:${m as ClaveModelo}`;
    for (const [c, pr, pq] of extra.docs) ponerDoc(c, pr, pq, por);
    for (const [n, pr, pq, cat] of extra.procesos) ponerProceso(n, pr, pq, por, cat);
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
