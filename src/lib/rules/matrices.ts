/**
 * Sistema Adaptativo v2 — clasificación por modelo operativo y matrices de preguntas.
 * El Driver Tree y sus términos viven AQUÍ (adentro): cada dato se obtiene con su pregunta ORAL.
 * El cliente nunca escucha la jerga.
 */

export type Matriz = {
  clave: string;
  nombre: string;
  /** palabras que activan esta matriz desde la ficha/sector (minúsculas, sin tildes) */
  senales: string[];
  /** ecuación interna — solo para el contexto de los agentes, jamás para el cliente */
  driver_tree: string;
  /**
   * Preguntas en lenguaje oral, respondibles hablando por alguien que no escribe. Una cosa por pregunta, por el
   * episodio («la semana pasada», «tu último trabajo»), sin cifras de ejemplo ni menú de opciones: lo que es una
   * proporción se pide en dos conteos y la cuenta la hace 8X (revisión del 16-10-2026).
   */
  preguntas: string[];
};

export const MATRICES: Matriz[] = [
  {
    clave: "citas",
    nombre: "Citas / capacidad",
    senales: ["peluqueria", "barberia", "salon", "spa", "estetica", "clinica", "dental", "odonto", "medico", "consultorio", "psicolog", "terapia", "veterinaria", "masaje", "cita"],
    driver_tree: "Ingresos = Capacidad disponible x Ocupacion x Asistencia x Ticket x Frecuencia",
    preguntas: [
      "La semana pasada, ¿cuántas citas atendiste?", "Esa semana, ¿cuántos espacios de tu agenda quedaron libres?",
      "La semana pasada, ¿cuántas citas se agendaron?", "De esas citas, ¿cuántas no vinieron o cancelaron a última hora?",
      "El mes pasado, ¿cuántos clientes vinieron por primera vez?", "De ellos, ¿cuántos ya regresaron?",
      "Para que tu servicio funcione, ¿cada cuánto tendría que volver un cliente?", "Tu último cliente que volvió, ¿cuántas semanas pasaron desde su visita anterior?",
      "¿Qué servicio te toma más tiempo?", "Ese servicio, ¿a cuánto lo cobras?",
      "La semana pasada, ¿en qué horas estuvo vacío el local?",
    ],
  },
  {
    clave: "orden",
    nombre: "Trabajo por orden / proyecto",
    senales: ["taller", "mecanic", "construc", "arquitect", "reparacion", "mantenimiento", "instalacion", "electric", "gasfiter", "carpint", "soldadura", "imprenta", "proyecto"],
    driver_tree: "Ingresos = Ordenes x Diagnostico x Presupuestos aceptados x Ticket · Capacidad = Puestos x Horas x Utilizacion",
    preguntas: [
      "Tu último trabajo entregado, ¿cuántos días pasaron desde que entró hasta que salió?",
      "De esos días, ¿cuántos estuvo parado esperando?",
      "Ese trabajo, ¿qué lo tuvo parado?",
      "El mes pasado, ¿cuántos presupuestos pasaste?", "De esos presupuestos, ¿cuántos te aceptaron?",
      "El mes pasado, ¿cuántos clientes regresaron por un problema que ya les habías arreglado?",
      "¿Qué tipo de trabajo te ocupa el taller más días?", "Ese tipo de trabajo, ¿a cuánto lo cobras?",
    ],
  },
  {
    clave: "profesional",
    nombre: "Servicios profesionales / consultoría",
    senales: ["consultor", "abogad", "juridic", "legal", "notari", "contab", "contador", "estudio", "agencia", "asesor", "auditor", "marketing digital", "diseño", "software", "desarrollo"],
    driver_tree: "Ingresos = Oportunidades x Reuniones x Propuestas x Cierre x Honorario",
    preguntas: [
      "El mes pasado, ¿cuántos interesados te escribieron o llamaron?", "¿Con cuántos de ellos te reuniste?", "¿Cuántos te contrataron?",
      "Tu último proyecto terminado, ¿cuántas horas de trabajo te tomó?", "¿Cuántas horas le cobraste al cliente?",
      "En tu último proyecto, ¿qué hiciste que no estaba en lo que cobraste?",
      "De tus clientes del año pasado, ¿cuántos siguen contigo?",
      "¿Qué parte de la entrega solo puedes hacerla tú?",
      "¿Qué hace tu persona más cara que podría hacer alguien más?",
    ],
  },
  {
    clave: "retail",
    nombre: "Retail / reventa",
    senales: ["tienda", "bodega", "minimarket", "market", "fruteria", "ferreteria", "farmacia", "botica", "libreria", "bazar", "abarrotes", "venta de", "comercio", "distribuidora", "mayorista"],
    driver_tree: "Ingresos = Transacciones x Ticket · Utilidad = Ventas x Margen - Merma - Costos",
    preguntas: [
      "La última mercadería que se te quedó sin vender, ¿cuál fue?",
      "La semana pasada, ¿qué mercadería se malogró o se perdió?", "Esa semana, ¿cuánto dinero fue eso?",
      "El mes pasado, ¿qué producto vendiste más veces?",
      "La semana pasada, ¿qué producto te pidieron y no tenías?",
      "La última vez que compraste mercadería, ¿cómo decidiste cuánto comprar?",
      "Hoy, ¿qué mercadería tienes que no se vendió en los últimos tres meses?",
      "Tu última compra a un proveedor, ¿la pagaste el mismo día?", "La última vez que le fiaste a un cliente, ¿qué día te pagó?",
    ],
  },
  {
    clave: "restaurante",
    nombre: "Restaurante / comida",
    senales: ["restaurante", "cevicheria", "polleria", "chifa", "pizzeria", "cafeteria", "cafe", "juguer", "sangucheria", "menu", "comida", "catering", "panaderia", "pasteleria"],
    driver_tree: "Ingresos = Asientos x Ocupacion x Rotacion x Ticket x Dias + Delivery",
    preguntas: [
      "Ayer, ¿en qué horas estuvo vacío el local?", "Ayer, ¿en qué hora no te diste abasto?",
      "La semana pasada, ¿qué plato vendiste más veces?", "Ese plato, ¿cuánto te cuesta prepararlo?",
      "Ayer, en la hora con más gente, ¿cuántos minutos pasaron desde que un cliente pidió hasta que le llegó el plato?", "Ese pedido, ¿en qué paso se atoró?",
      "La semana pasada, ¿qué comida se botó?",
      "Ayer, en hora punta, ¿cuánto tardó en desocuparse una mesa?",
      "El mes pasado, ¿cuánto pagaste en comisiones de delivery?",
    ],
  },
  {
    clave: "produccion",
    nombre: "Producción / extracción",
    senales: ["fabrica", "manufactura", "planta", "produccion", "agroindustria", "agricola", "textil", "confeccion", "mineria", "minera", "pesquer", "maderera", "metalmecanica"],
    driver_tree: "Resultado = Volumen x Precio - Costo · Produccion = Capacidad x Disponibilidad x Utilizacion x Rendimiento",
    preguntas: [
      "La última vez que se detuvo la producción, ¿qué pasó?",
      "La semana pasada, ¿cuántas horas estuvo parada la máquina principal?",
      "¿Qué equipo o etapa marca el tope de cuánto puedes producir?",
      "Para producir una unidad, ¿qué pagas? Dímelo parte por parte.",
      "El mes pasado, ¿qué se tuvo que volver a hacer porque salió mal?",
      "¿Qué riesgo podría parar TODO de un día para otro?",
    ],
  },
  {
    clave: "recurrencia",
    nombre: "Recurrencia / membresía",
    senales: ["gimnasio", "gym", "academia", "colegio", "instituto", "escuela", "nido", "guarderia", "club", "suscripcion", "membresia", "cursos"],
    driver_tree: "Ingresos = Miembros activos x Cuota x Permanencia + Nuevos x Matricula",
    preguntas: [
      "Hoy, ¿cuántos alumnos o miembros activos tienes?", "Hace un año, ¿cuántos tenías?",
      "Hace seis meses, ¿cuántos se inscribieron?", "De ellos, ¿cuántos siguen hoy?",
      "El último que dejó de venir, ¿cuántos meses estuvo?",
      "Al último que dejó de venir, ¿alguien lo llamó?",
      "El mes pasado, ¿a cuántos tuviste que perseguir para que pagaran?",
      "¿Qué haría que un miembro se quede el doble de tiempo?",
    ],
  },
];

const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Clasifica el negocio por señales de texto (actividad, sector, productos, canales).
 * Regla de respaldo: si nada encaja, devuelve [] y el sistema usa el árbol universal
 * (Clientes x Frecuencia x Ticket) + las 6 maestras — nunca se detiene.
 */
export function clasificarModelo(textos: (string | null | undefined)[]): string[] {
  const t = sinTildes(textos.filter(Boolean).join(" "));
  if (!t.trim()) return [];
  const claves = MATRICES.filter((m) => m.senales.some((s) => t.includes(s))).map((m) => m.clave);
  return claves;
}

/** Etapa de la empresa según la ficha (la antigüedad no determina sola la madurez, pero enruta). */
export function etapaDe(antiguedadAnios: number | null | undefined): string | null {
  if (antiguedadAnios == null || Number.isNaN(antiguedadAnios)) return null;
  if (antiguedadAnios < 1) return "inicio";
  if (antiguedadAnios <= 3) return "temprana";
  if (antiguedadAnios <= 7) return "estructura";
  return "madura";
}

/** Bloque de texto para el prompt del entrevistador: matriz activa + preguntas orales del oficio. */
export function matricesComoTexto(claves: string[]): string {
  const activas = MATRICES.filter((m) => claves.includes(m.clave));
  if (!activas.length) return "";
  return activas
    .map((m) => `MODELO: ${m.nombre} (interno: ${m.driver_tree})\nPreguntas del oficio (úsalas u adáptalas al profundizar — nunca menciones la ecuación al cliente):\n${m.preguntas.map((q) => "  - " + q).join("\n")}`)
    .join("\n\n");
}
