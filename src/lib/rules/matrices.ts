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
  /** preguntas en lenguaje oral, respondibles hablando por alguien que no escribe */
  preguntas: string[];
};

export const MATRICES: Matriz[] = [
  {
    clave: "citas",
    nombre: "Citas / capacidad",
    senales: ["peluqueria", "barberia", "salon", "spa", "estetica", "clinica", "dental", "odonto", "medico", "consultorio", "psicolog", "terapia", "veterinaria", "masaje", "cita"],
    driver_tree: "Ingresos = Capacidad disponible x Ocupacion x Asistencia x Ticket x Frecuencia",
    preguntas: [
      "En una semana normal, ¿cuántas citas puedes atender como máximo… y cuántas atiendes de verdad?",
      "De cada 10 citas agendadas, ¿cuántas se caen — no vienen o cancelan a última hora?",
      "De cada 10 clientes que vienen por primera vez, ¿cuántos regresan?",
      "¿Cada cuánto DEBERÍA volver un cliente… y cada cuánto vuelve de verdad?",
      "¿Qué servicio te toma más tiempo y te deja menos plata?",
      "¿En qué días u horas se queda vacío el local?",
    ],
  },
  {
    clave: "orden",
    nombre: "Trabajo por orden / proyecto",
    senales: ["taller", "mecanic", "construc", "arquitect", "reparacion", "mantenimiento", "instalacion", "electric", "gasfiter", "carpint", "soldadura", "imprenta", "proyecto"],
    driver_tree: "Ingresos = Ordenes x Diagnostico x Presupuestos aceptados x Ticket · Capacidad = Puestos x Horas x Utilizacion",
    preguntas: [
      "Desde que entra un trabajo hasta que sale, ¿cuántos días pasan?",
      "De esos días, ¿cuántos se está trabajando de verdad… y cuántos está parado esperando?",
      "¿Qué es lo que más detiene un trabajo: repuestos, aprobación del cliente, gente, plata?",
      "De cada 10 presupuestos que pasas, ¿cuántos te aceptan?",
      "¿Cuántos clientes regresan por el mismo problema que ya les arreglaste?",
      "¿Qué tipo de trabajo te deja buena plata… y cuál te ocupa el taller sin dejar casi nada?",
    ],
  },
  {
    clave: "profesional",
    nombre: "Servicios profesionales / consultoría",
    senales: ["consultor", "abogad", "contab", "contador", "estudio", "agencia", "asesor", "auditor", "marketing digital", "diseño", "software", "desarrollo"],
    driver_tree: "Ingresos = Oportunidades x Reuniones x Propuestas x Cierre x Honorario",
    preguntas: [
      "De cada 10 interesados que llegan, ¿con cuántos llegas a reunirte… y cuántos te contratan?",
      "Un proyecto típico, ¿cuántas horas de trabajo consume de verdad… contra las que cobraste?",
      "¿Cuánto trabajo se hace de más sin cobrarlo (cambios, favores, alcance que creció)?",
      "De tus clientes del año pasado, ¿cuántos siguen contigo?",
      "¿Qué parte de la entrega solo puedes hacerla tú (o el socio)?",
      "¿Qué hace tu persona más cara que podría hacer alguien más?",
    ],
  },
  {
    clave: "retail",
    nombre: "Retail / reventa",
    senales: ["tienda", "bodega", "minimarket", "market", "fruteria", "ferreteria", "farmacia", "botica", "libreria", "bazar", "abarrotes", "venta de", "comercio", "distribuidora", "mayorista"],
    driver_tree: "Ingresos = Transacciones x Ticket · Utilidad = Ventas x Margen - Merma - Costos",
    preguntas: [
      "¿Qué compras que después no se vende?",
      "¿Qué se te malogra o se pierde? ¿Cuánto a la semana, más o menos?",
      "¿Qué producto sale más rápido… y cuál te deja más ganancia por venta? ¿Son el mismo?",
      "¿Qué producto suele faltar justo cuando lo piden?",
      "¿Cómo decides cuánto comprar: por dato o por ojo?",
      "¿Cuánta plata tienes parada en mercadería que no se mueve?",
      "¿Compras al contado o te fían los proveedores? ¿Y tú fías a tus clientes?",
    ],
  },
  {
    clave: "restaurante",
    nombre: "Restaurante / comida",
    senales: ["restaurante", "cevicheria", "polleria", "chifa", "pizzeria", "cafeteria", "cafe", "juguer", "sangucheria", "menu", "comida", "catering", "panaderia", "pasteleria"],
    driver_tree: "Ingresos = Asientos x Ocupacion x Rotacion x Ticket x Dias + Delivery",
    preguntas: [
      "¿En qué horario está vacío el local… y en cuál no te das abasto?",
      "¿Qué plato se vende mucho pero deja poco… y cuál deja buena plata pero se pide poco?",
      "Desde que el cliente pide hasta que le llega el plato, ¿cuánto pasa? ¿Dónde se atora?",
      "¿Cuánta comida se bota a la semana, más o menos?",
      "Una mesa, ¿cuánto se demora en desocuparse en hora punta?",
      "¿El delivery deja ganancia de verdad, contando comisiones?",
    ],
  },
  {
    clave: "produccion",
    nombre: "Producción / extracción",
    senales: ["fabrica", "manufactura", "planta", "produccion", "agroindustria", "agricola", "textil", "confeccion", "mineria", "minera", "pesquer", "maderera", "metalmecanica"],
    driver_tree: "Resultado = Volumen x Precio - Costo · Produccion = Capacidad x Disponibilidad x Utilizacion x Rendimiento",
    preguntas: [
      "¿Qué es lo que más detiene la producción?",
      "¿Cuántas horas a la semana está parada la máquina o la línea? ¿Por qué?",
      "¿Qué equipo o etapa marca el tope de cuánto puedes producir?",
      "¿Cuánto te cuesta producir una unidad, más o menos?",
      "¿Qué se tiene que volver a hacer porque salió mal?",
      "¿Qué riesgo podría parar TODO de un día para otro?",
    ],
  },
  {
    clave: "recurrencia",
    nombre: "Recurrencia / membresía",
    senales: ["gimnasio", "gym", "academia", "colegio", "instituto", "escuela", "nido", "guarderia", "club", "suscripcion", "membresia", "cursos"],
    driver_tree: "Ingresos = Miembros activos x Cuota x Permanencia + Nuevos x Matricula",
    preguntas: [
      "¿Cuántos alumnos o miembros activos tienes hoy… y cuántos tenías hace un año?",
      "De cada 10 que se inscriben, ¿cuántos siguen a los 6 meses?",
      "¿Cuándo se va la gente: al primer mes, a mitad de año, cuando acaba el ciclo?",
      "Al que deja de venir, ¿alguien lo llama? ¿Qué le dicen?",
      "¿Cuántos pagan puntual y a cuántos hay que perseguir?",
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
