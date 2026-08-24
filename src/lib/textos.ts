/** Copy centralizado. El cliente nunca ve vocabulario interno (capítulo 19.6). */

export const ESTADO_CLIENTE: Record<string, string> = {
  sin_verificar: "Por confirmar",
  confirmado: "Sigue siendo verdad",
  caducado: "Ya no está vigente",
  contradicho: "Hay dos versiones distintas",
};

export const ESTADO_CONSULTOR: Record<string, string> = {
  sin_verificar: "Sin verificar",
  confirmado: "Confirmado",
  caducado: "Caducado",
  contradicho: "Contradicho",
};

/** Nombres de cara al cliente: él ve SU empresa, no nuestra metodología. */
export const PILAR_CLIENTE: Record<string, string> = {
  personas: "Tu equipo",
  procesos: "Cómo se hace el trabajo",
  producto: "Lo que vendes",
  marketing: "Tus clientes y ventas",
  transversal: "Toda la empresa",
};

export const PILAR: Record<string, string> = {
  personas: "Personas",
  procesos: "Procesos",
  producto: "Producto / Servicio",
  marketing: "Marketing",
  transversal: "Transversal",
};

export const PILAR_PREGUNTA: Record<string, string> = {
  personas: "¿Están las personas correctas, en los lugares correctos, haciendo lo correcto y produciendo resultados?",
  procesos: "¿Cómo convierte la empresa recursos y trabajo en resultados repetibles, medibles y cada vez mejores?",
  producto: "¿Lo que vendemos genera un resultado extraordinario y diferenciable?",
  marketing: "¿La empresa sabe identificar, construir, comunicar y monetizar su valor frente al cliente correcto?",
};

export const ESTADO_PILAR: Record<string, string> = {
  solido: "Sólido",
  mejorable: "Mejorable",
  critico: "Crítico",
  desconocido: "Desconocido",
};

export const VEREDICTO: Record<string, string> = {
  keep: "Se conserva",
  improve: "Se mejora",
  replace: "Se reemplaza",
  remove: "Se elimina",
  create: "Se crea",
};

export const EJECUTOR: Record<string, string> = {
  humano: "Persona",
  software: "Software",
  ia: "Agente de IA",
  hibrido: "IA prepara, persona aprueba",
};

/** Para el cliente: sin la palabra IA (capítulo 18). */
export const EJECUTOR_CLIENTE: Record<string, string> = {
  humano: "Persona",
  software: "Sistema",
  ia: "Automático",
  hibrido: "Automático, revisa una persona",
};

export const TIPO_NODO: Record<string, string> = {
  inicio: "Inicio",
  actividad: "Actividad",
  decision: "Decisión",
  espera: "Espera",
  fin: "Fin",
};

export const TIPO_SESION: Record<string, string> = {
  sueno_dueno: "Tu sueño",
  empresa_dueno: "Tu empresa",
  lider: "Tu área",
  personal: "Tu trabajo",
  know_how: "La Caleta: lo que solo tú sabes",
  validacion: "Confirmar lo encontrado",
};

export const ENTREGABLE: Record<string, string> = {
  informe_realidad: "Informe de realidad",
  diagnostico_4p: "Diagnóstico 4P",
  mapa_as_is: "Cómo funciona hoy",
  mapa_to_be: "Cómo debería funcionar",
  manual_procesos: "Manual de procesos",
  plan_90: "Plan de implementación 45 + 45",
  mapa_automatizacion: "Mapa de automatización",
};

export const ETAPA: Record<string, string> = {
  admision: "Admisión",
  levantamiento: "Levantamiento",
  contraste: "Contraste y validación",
  diagnostico: "Diagnóstico",
  espejo: "El Espejo",
  implementacion: "Implementación · 45 días",
  monitoreo: "Monitoreo · 45 días",
  cerrado: "Cerrado",
};

export const MOTIVO_CORRECCION: Record<string, string> = {
  sin_evidencia: "Sin evidencia suficiente",
  sintoma_no_causa: "Es síntoma, no causa",
  impacto_mal_calibrado: "Impacto mal calibrado",
  ya_resuelto: "Ya está resuelto",
  fuera_de_alcance: "Fuera de alcance / pilar equivocado",
  contradice_filtro_proposito: "Contradice el filtro de propósito",
  otro: "Otro",
};

export const VACIO = {
  fuentes: "Todavía no subiste nada. Empieza con una foto de lo que tengas.",
  fuentesConsultor: "Sin fuentes todavía. Sube un documento o pide al cliente que lo haga.",
  afirmaciones: "Todavía no hay definiciones. Aparecen solas cuando se lee una fuente.",
  hallazgos: "Sin hallazgos todavía. Corre el diagnóstico cuando el levantamiento esté completo.",
  procesos: "Ningún proceso dibujado. Describe uno en voz alta o dibújalo a mano.",
  plan: "El plan se genera cuando los hallazgos estén aprobados.",
  bandeja: "Nada requiere atención hoy.",
  resultados: "Tu consultor está revisando los resultados. Te avisamos cuando estén listos.",
};

export const CARGA_PORTAL = "Sube lo que tengas. Una foto del cuaderno sirve. Si no tienes nada escrito, no importa: conversamos y lo armamos.";

export function fechaCorta(iso?: string | null) {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "sin fecha";
  return d.toLocaleDateString("es-PE", { year: "numeric", month: "short", day: "numeric" });
}

export function fechaMes(iso?: string | null) {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "sin fecha";
  return d.toLocaleDateString("es-PE", { year: "numeric", month: "long" });
}
