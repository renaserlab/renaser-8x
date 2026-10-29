/**
 * EL PLAN DE INTERVENCIÓN: UNA ACCIÓN SE PROPONE, SE APRUEBA, SE EJECUTA, SE REPORTA Y SE COMPRUEBA (sección 12).
 *
 * Hasta el 13-10-2026 el planificador BORRABA las acciones pendientes y las volvía a insertar con cinco
 * campos (acción, responsable en texto libre, indicador en texto, evidencia, semanas). «Hecho» se marcaba
 * sin prueba (api/actions/[id]), nadie sabía quién había decidido qué, y una acción terminada se leía como
 * si la empresa hubiera mejorado. Este módulo pone las reglas en código, sin IA:
 *
 *  1. UNA ACCIÓN TERMINADA NO ES UN RESULTADO. Reportado ≠ verificado ≠ resultado observado. Verificar
 *     exige una prueba (evidencia o un valor del indicador posterior al reporte). El resultado empresarial
 *     se lee en el corte contra la línea base, nunca aquí.
 *  2. CADA DECISIÓN DEJA RASTRO. Aprobar, rechazar, posponer, modificar, bloquear, escalar: quién, por qué
 *     y qué implica. La fila de la acción se actualiza; el historial (`accion_historial`) nunca se pisa.
 *  3. DE 3 A 5 PRIORIDADES ABIERTAS, configurable por empresa (`companies.limite_frentes`). Una prioridad
 *     más no se aprueba mientras el límite esté lleno, y el mensaje dice cuáles están abiertas. Marcar como
 *     prioridad una acción que ya está abierta es abrir un frente: pasa por el mismo límite. Desbloquear una
 *     prioridad también: lo bloqueado no ocupa frente, así que al volver se cuenta.
 *  4. LAS TAREAS SON DE PERSONAS, NO DE TEXTOS. El responsable es un `participant`; si el nombre que
 *     propuso el planificador no coincide con nadie, queda vacío y `queLeFalta` lo dice.
 *  5. NADA SE BORRA. Lo que el planificador ya no propone pasa a pospuesto con su motivo.
 *
 * La parte de arriba es pura (se prueba sin base). La de abajo lee y escribe con la service role y
 * aplica estas mismas reglas; es la única que las rutas y las páginas deben llamar.
 */

import type { AccionAutoridad } from "./autoridad";


// ───────────────────────── ESTADOS Y EVENTOS ─────────────────────────

export const ESTADOS = ["propuesto", "aprobado", "en_ejecucion", "reportado", "verificado", "rechazado", "pospuesto", "bloqueado"] as const;
export type Estado = (typeof ESTADOS)[number];

/** Los valores anteriores a la migración siguen siendo válidos en la base; aquí se leen como su equivalente. */
export const ESTADOS_LEGADOS: Record<string, Estado> = { pendiente: "propuesto", en_curso: "en_ejecucion", hecho: "reportado", descartado: "rechazado" };

/** «hecho» sin prueba fue siempre una casilla marcada: se lee como reportado. Con `verificado_at`, como verificado. */
export function estadoCanonico(a: { estado: string; verificado_at?: string | null }): Estado {
  if ((ESTADOS as readonly string[]).includes(a.estado)) return a.estado as Estado;
  if (a.estado === "hecho" && a.verificado_at) return "verificado";
  return ESTADOS_LEGADOS[a.estado] ?? "propuesto";
}

/** Coinciden con el check de `accion_historial.accion` (migracion-plan-kpi-linea-base.sql). */
export const EVENTOS = ["proponer", "aprobar", "rechazar", "posponer", "modificar", "iniciar", "reportar", "verificar", "rechazar_verificacion", "bloquear", "desbloquear", "escalar", "comentar"] as const;
export type Evento = (typeof EVENTOS)[number];

export type Rol = "consultor" | "cliente" | "sistema";
export type Actor = { id: string | null; rol: Rol };

/** «previo» = el estado desde el que se bloqueó; «mismo» = el evento no cambia el estado (escalar, comentar, modificar). */
type Destino = Estado | "previo" | "mismo";

/**
 * LA TABLA. Lo que no está aquí no se puede hacer, y el error lo dice. Comentar y escalar valen en
 * cualquier estado activo; en los cerrados (verificado, rechazado) solo se puede comentar; lo pospuesto se
 * puede volver a proponer.
 */
export const TRANSICIONES: Record<Estado, Partial<Record<Evento, Destino>>> = {
  propuesto: { aprobar: "aprobado", rechazar: "rechazado", posponer: "pospuesto", modificar: "mismo", escalar: "mismo", comentar: "mismo" },
  aprobado: { iniciar: "en_ejecucion", bloquear: "bloqueado", posponer: "pospuesto", modificar: "mismo", escalar: "mismo", comentar: "mismo" },
  en_ejecucion: { reportar: "reportado", bloquear: "bloqueado", modificar: "mismo", escalar: "mismo", comentar: "mismo" },
  reportado: { verificar: "verificado", rechazar_verificacion: "en_ejecucion", escalar: "mismo", comentar: "mismo" },
  bloqueado: { desbloquear: "previo", modificar: "mismo", escalar: "mismo", comentar: "mismo" },
  verificado: { comentar: "mismo" },
  rechazado: { comentar: "mismo" },
  pospuesto: { proponer: "propuesto", comentar: "mismo" },
};

/** Quién puede disparar cada evento. «sistema» es el planificador (propone y pospone, nada más). */
export const ROLES_POR_EVENTO: Record<Evento, readonly Rol[]> = {
  proponer: ["consultor", "sistema"],
  aprobar: ["consultor"],
  rechazar: ["consultor"],
  posponer: ["consultor", "sistema"],
  modificar: ["consultor"],
  iniciar: ["consultor", "cliente"],
  reportar: ["consultor", "cliente"],
  verificar: ["consultor"],
  rechazar_verificacion: ["consultor"],
  bloquear: ["consultor", "cliente"],
  desbloquear: ["consultor", "cliente"],
  escalar: ["consultor", "cliente"],
  comentar: ["consultor", "cliente"],
};

/** Qué autoridad (autoridad.ts) hace falta además del rol. Deshacer o tocar algo ya aprobado pesa lo mismo que aprobarlo. */
export function autoridadNecesaria(evento: Evento, estado: Estado): AccionAutoridad | null {
  if (evento === "aprobar" || evento === "verificar") return "aprobar_plan";
  if ((evento === "modificar" || evento === "posponer") && estado !== "propuesto") return "aprobar_plan";
  return null;
}

export const MIN_MOTIVO = 8;
const EXIGEN_MOTIVO: readonly Evento[] = ["rechazar", "posponer", "modificar", "rechazar_verificacion", "bloquear", "escalar", "proponer"];
const EXIGEN_IMPLICA: readonly Evento[] = ["rechazar", "posponer", "modificar"];

export const VERBO: Record<Evento, string> = {
  proponer: "volver a proponer",
  aprobar: "aprobar",
  rechazar: "rechazar",
  posponer: "posponer",
  modificar: "modificar",
  iniciar: "iniciar",
  reportar: "reportar",
  verificar: "verificar",
  rechazar_verificacion: "devolver a ejecución",
  bloquear: "marcar como bloqueada",
  desbloquear: "desbloquear",
  escalar: "escalar",
  comentar: "comentar",
};

/** El historial, en pasado, como lo lee la consultora. */
export const VERBO_PASADO: Record<Evento, string> = {
  proponer: "propuso",
  aprobar: "aprobó",
  rechazar: "rechazó",
  posponer: "pospuso",
  modificar: "modificó",
  iniciar: "inició",
  reportar: "reportó",
  verificar: "verificó",
  rechazar_verificacion: "devolvió a ejecución",
  bloquear: "marcó como bloqueada",
  desbloquear: "desbloqueó",
  escalar: "escaló",
  comentar: "comentó",
};

/**
 * El historial como lo lee el dueño, con las mismas palabras que sus estados: «envió para revisar» (no
 * «reportó»), «comprobó» (no «verificó»), «pidió completar» (no «devolvió a ejecución»). Sin jerga.
 */
export const VERBO_PASADO_CLIENTE: Record<Evento, string> = {
  proponer: "volvió a poner en estudio",
  aprobar: "aprobó",
  rechazar: "descartó",
  posponer: "dejó para más adelante",
  modificar: "cambió la ficha",
  iniciar: "empezó",
  reportar: "envió para revisar",
  verificar: "comprobó",
  rechazar_verificacion: "pidió completar",
  bloquear: "avisó que está trabada",
  desbloquear: "avisó que se destrabó",
  escalar: "pidió ayuda a la consultora",
  comentar: "comentó",
};

/** Cómo se le dice a cada estado a la consultora. */
export const ESTADO_CONSULTOR: Record<Estado, string> = {
  propuesto: "Propuesta",
  aprobado: "Aprobada",
  en_ejecucion: "En ejecución",
  reportado: "Reportada",
  verificado: "Verificada",
  rechazado: "Rechazada",
  pospuesto: "Pospuesta",
  bloqueado: "Bloqueada",
};

/** Cómo se le dice al dueño. «Reportado» es «Enviado para revisar»: él la terminó; la consultora aún no la comprobó. */
export const ESTADO_CLIENTE: Record<Estado, string> = {
  propuesto: "En estudio",
  aprobado: "Lista para empezar",
  en_ejecucion: "En marcha",
  reportado: "Enviado para revisar",
  verificado: "Comprobada",
  rechazado: "Descartada",
  pospuesto: "Para más adelante",
  bloqueado: "Trabada",
};

export const ERROR_SIN_EVIDENCIA = "reportado no es verificado: falta evidencia";
export const NOTA_VERIFICADA_NO_ES_RESULTADO = "Verificada quiere decir que se hizo y hay prueba. Si la empresa mejoró se ve en el corte contra el punto de partida, no aquí.";
export const MOTIVO_NO_APARECE = "no aparece en la nueva propuesta del planificador";
export const MOTIVO_REAPARECE = "vuelve a aparecer en la propuesta del planificador";
export const LIMITE_FRENTES_POR_DEFECTO = 3;

// ───────────────────────── LA ACCIÓN Y SUS CAMPOS ─────────────────────────

export type AccionPlan = {
  id: string;
  company_id: string;
  finding_id: string | null;
  prioridad: number | null;
  fase: string | null;
  semana_inicio: number | null;
  semana_cierre: number | null;
  accion: string;
  responsable: string | null;
  kpi: string | null;
  evidencia: string | null;
  impacto: string | null;
  estado: string;
  nota: string | null;
  vence_at: string | null;
  updated_at?: string | null;
  verificado_at?: string | null;
  verificado_por?: string | null;
  verificado_nota?: string | null;
  // Los 14 campos (sección 12)
  objetivo_empresarial: string | null;
  linea_base_id: string | null;
  resultado_esperado: string | null;
  restriccion_oportunidad: string | null;
  evidencia_ids: string[];
  entregable: string | null;
  responsable_participant_id: string | null;
  aprobador_id: string | null;
  aprobado_at: string | null;
  recursos: string | null;
  fecha_inicio: string | null;
  depende_de: string[];
  indicador_id: string | null;
  criterio_aceptacion: string | null;
  // Condiciones
  riesgos: string | null;
  supuestos: string | null;
  obligaciones_cliente: string | null;
  obligaciones_renaser: string | null;
  // Seguimiento
  bloqueo: string | null;
  bloqueado_at: string | null;
  escalado_a: string | null;
  escalado_at: string | null;
  reportado_at: string | null;
  reportado_por: string | null;
  es_prioridad: boolean;
};

/** Una fila completa con todo vacío; sirve para construir propuestas y para las pruebas. */
export function accionVacia(parcial: Partial<AccionPlan> & { id: string; company_id: string; accion: string }): AccionPlan {
  return {
    finding_id: null, prioridad: null, fase: "implementacion", semana_inicio: null, semana_cierre: null,
    responsable: null, kpi: null, evidencia: null, impacto: null, estado: "propuesto", nota: null, vence_at: null,
    objetivo_empresarial: null, linea_base_id: null, resultado_esperado: null, restriccion_oportunidad: null, evidencia_ids: [],
    entregable: null, responsable_participant_id: null, aprobador_id: null, aprobado_at: null, recursos: null, fecha_inicio: null,
    depende_de: [], indicador_id: null, criterio_aceptacion: null, riesgos: null, supuestos: null, obligaciones_cliente: null,
    obligaciones_renaser: null, bloqueo: null, bloqueado_at: null, escalado_a: null, escalado_at: null, reportado_at: null,
    reportado_por: null, es_prioridad: false,
    ...parcial,
  };
}

export type TipoCampo = "texto" | "texto_largo" | "linea_base" | "uuids" | "participante" | "solo_lectura" | "plazo" | "acciones" | "indicador";

/**
 * LOS 14 CAMPOS de la ficha, en el orden en que se leen. «plazo» junta fecha de inicio y vencimiento. Las
 * cuatro condiciones (riesgos, supuestos, obligaciones de cada parte) van aparte: son las condiciones bajo
 * las que la acción vale, no la acción misma.
 */
export const CAMPOS_PLAN: readonly { clave: string; titulo: string; tipo: TipoCampo; ayuda?: string }[] = [
  { clave: "accion", titulo: "Qué se hace", tipo: "texto_largo", ayuda: "Una instrucción que el dueño pueda repetirle a su equipo sin traducir." },
  { clave: "objetivo_empresarial", titulo: "Para qué (objetivo de la empresa)", tipo: "texto_largo" },
  { clave: "linea_base_id", titulo: "Punto de partida (versión exacta de la línea base)", tipo: "linea_base" },
  { clave: "resultado_esperado", titulo: "Qué se espera que cambie, y cuánto", tipo: "texto_largo" },
  { clave: "restriccion_oportunidad", titulo: "Qué restricción quita o qué oportunidad abre", tipo: "texto_largo" },
  { clave: "evidencia_ids", titulo: "En qué se apoya (evidencias)", tipo: "uuids" },
  { clave: "entregable", titulo: "Qué queda hecho (entregable)", tipo: "texto" },
  { clave: "responsable_participant_id", titulo: "Quién la hace (persona del equipo)", tipo: "participante" },
  { clave: "aprobador_id", titulo: "Quién la aprobó", tipo: "solo_lectura" },
  { clave: "recursos", titulo: "Qué necesita (recursos)", tipo: "texto" },
  { clave: "plazo", titulo: "Cuándo empieza y cuándo vence", tipo: "plazo" },
  { clave: "depende_de", titulo: "De qué depende (otras acciones)", tipo: "acciones" },
  { clave: "indicador_id", titulo: "Con qué indicador se mide", tipo: "indicador", ayuda: "Si todavía no hay indicador formal, escribe en «indicador (texto)» cuál es o por qué no lo tiene." },
  { clave: "criterio_aceptacion", titulo: "Cuándo se da por aceptada", tipo: "texto_largo" },
];

export const CONDICIONES_PLAN: readonly { clave: string; titulo: string }[] = [
  { clave: "riesgos", titulo: "Riesgos" },
  { clave: "supuestos", titulo: "Supuestos" },
  { clave: "obligaciones_cliente", titulo: "Qué se compromete la empresa" },
  { clave: "obligaciones_renaser", titulo: "Qué se compromete RENASER" },
];

/** Lo que la consultora puede cambiar con PATCH. El estado y las marcas de aprobación, reporte, verificación, bloqueo y escalamiento NO: cambian con eventos. */
export const CAMPOS_EDITABLES = [
  "accion", "objetivo_empresarial", "linea_base_id", "resultado_esperado", "restriccion_oportunidad", "evidencia_ids", "entregable",
  "responsable_participant_id", "recursos", "fecha_inicio", "vence_at", "depende_de", "indicador_id", "criterio_aceptacion",
  "riesgos", "supuestos", "obligaciones_cliente", "obligaciones_renaser",
  "responsable", "kpi", "evidencia", "impacto", "nota", "semana_inicio", "semana_cierre", "prioridad", "es_prioridad", "fase",
] as const;
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];

const lleno = (s: unknown): boolean => typeof s === "string" && s.trim().length > 0;

/**
 * QUÉ LE FALTA PARA PODER APROBARLA. Son los seis mínimos de una acción que se puede exigir: para qué,
 * qué cambia, quién, cuándo, cómo sabremos que se hizo y con qué se mide (o por qué no se mide).
 */
export function queLeFalta(a: Partial<AccionPlan>): string[] {
  const falta: string[] = [];
  if (!lleno(a.objetivo_empresarial)) falta.push("el objetivo empresarial (para qué sirve esta acción)");
  if (!lleno(a.resultado_esperado)) falta.push("el resultado esperado (qué debería cambiar y cuánto)");
  if (!a.responsable_participant_id) {
    falta.push(lleno(a.responsable) ? `un responsable identificado del equipo («${(a.responsable as string).trim()}» no coincide con nadie registrado)` : "un responsable identificado del equipo");
  }
  if (!a.fecha_inicio || !a.vence_at) falta.push("la fecha de inicio y la de vencimiento");
  if (!lleno(a.criterio_aceptacion)) falta.push("el criterio de aceptación (cómo sabremos que quedó hecha)");
  if (!a.indicador_id && !lleno(a.kpi)) falta.push("un indicador para medirla, o el motivo de no tenerlo");
  return falta;
}

/** Estados que cuentan como «frente abierto» para el límite: lo aprobado y todo lo que sigue hasta que se verifica. */
export const ESTADOS_ABIERTOS: readonly Estado[] = ["aprobado", "en_ejecucion", "reportado"];

export function frentesAbiertos<T extends Pick<AccionPlan, "estado" | "es_prioridad" | "verificado_at">>(acciones: T[]): T[] {
  return acciones.filter((a) => a.es_prioridad && ESTADOS_ABIERTOS.includes(estadoCanonico(a)));
}

export type VeredictoFrentes = { ok: true; abiertas: number; limite: number } | { ok: false; abiertas: number; limite: number; error: string };

/**
 * CÓMO TERMINA EL MENSAJE DEL LÍMITE, según por dónde se quiso abrir el frente. El principio es siempre el
 * mismo (cuántas hay abiertas, cuál es el límite y cuáles son); lo que cambia es qué puede hacer quien lo
 * lee. Al dueño no se le dice «quita la marca de prioridad» (eso no está en su pantalla) ni que sigue trabada
 * (él acaba de avisar que ya no lo está): se le dice que espera su turno y con quién hablarlo.
 */
export const SALIDA_FRENTES = {
  aprobar: "Cierra, pospón o quita la marca de prioridad a una antes de aprobar otra.",
  desbloquear: "Cierra, pospón o quita la marca de prioridad a una antes de desbloquear esta.",
  desbloquear_cliente: "Esta espera su turno hasta que una de esas se cierre: escríbele a tu consultora para decidir cuál va primero.",
} as const;

/**
 * DE 3 A 5 PRIORIDADES ACTIVAS. `limite` viene de `companies.limite_frentes` (1 a 10 por el check; 3 por
 * defecto). Una acción que no es prioridad no cuenta ni se bloquea. La candidata que ya está abierta
 * (volver a aprobar) tampoco suma. `salida` es la última frase del mensaje (`SALIDA_FRENTES`).
 */
export function limiteFrentes<T extends Pick<AccionPlan, "id" | "accion" | "estado" | "es_prioridad" | "verificado_at">>(
  acciones: T[],
  limite: number,
  candidata?: Pick<AccionPlan, "id" | "es_prioridad">,
  salida: string = SALIDA_FRENTES.aprobar
): VeredictoFrentes {
  const abiertas = frentesAbiertos(acciones);
  const n = abiertas.length;
  const cuenta = !candidata || candidata.es_prioridad;
  const yaAbierta = candidata ? abiertas.some((a) => a.id === candidata.id) : false;
  if (!cuenta || yaAbierta || n < limite) return { ok: true, abiertas: n, limite };
  const lista = abiertas.map((a) => `«${a.accion}»`).join(", ");
  return {
    ok: false, abiertas: n, limite,
    error: `Ya hay ${n} prioridad${n === 1 ? "" : "es"} abierta${n === 1 ? "" : "s"} y el límite es ${limite}: ${lista}. ${salida}`,
  };
}

/**
 * MARCAR PRIORIDAD UNA ACCIÓN YA ABIERTA ES ABRIR UN FRENTE. Sin esta pregunta el límite tenía una puerta
 * trasera: aprobar la acción sin la marca (no cuenta, entra siempre) y marcarla después desde la ficha.
 * Verdadero cuando el cambio pone `es_prioridad` en verdadero y la acción está aprobada, en ejecución o
 * reportada. En una propuesta no: ahí la marca todavía no ocupa frente y el límite se le aplica al aprobarla.
 */
export function abreFrenteAlModificar(estado: Estado, cambios: Record<string, unknown> | null | undefined): boolean {
  const pedida = cambios?.es_prioridad;
  if (pedida === undefined || !ESTADOS_ABIERTOS.includes(estado)) return false;
  // Solo un «no» limpio deja de contar. Lo que no se entiende se cuenta como si marcara: ante la duda el límite
  // se aplica, y `transicion` rechaza después lo que no es ni sí ni no.
  return marcaDePrioridad(pedida) !== false;
}

const DICEN_SI: ReadonlySet<string> = new Set(["true", "t", "yes", "y", "on", "1", "si", "sí"]);
const DICEN_NO: ReadonlySet<string> = new Set(["false", "f", "no", "n", "off", "0"]);

/**
 * LA MARCA DE PRIORIDAD TAL COMO LLEGA EN UN CAMBIO: `true` o `false` cuando se entiende, `null` cuando no es ni
 * un sí ni un no. Hasta el 13-10-2026 solo contaba el `true` exacto: un «true» escrito como texto (o un 1) no
 * pasaba por el límite de frentes, y la base lo guardaba igual como verdadero. Se leen como sí y como no las
 * formas que Postgres acepta para un booleano; cualquier otra cosa no se adivina.
 */
export function marcaDePrioridad(valor: unknown): boolean | null {
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor === 1 ? true : valor === 0 ? false : null;
  if (typeof valor === "string") {
    const t = valor.trim().toLowerCase();
    if (DICEN_SI.has(t)) return true;
    if (DICEN_NO.has(t)) return false;
  }
  return null;
}

/** Lo que se responde cuando la marca llega con algo que no es sí ni no. No se escribe nada. */
export const ERROR_MARCA_DE_PRIORIDAD = "La marca de prioridad es sí o no. Llegó otra cosa y no se cambió nada.";

/**
 * APROBAR UNA PRIORIDAD ES ABRIR UN FRENTE. Es la tercera pregunta, con la misma forma que las otras dos
 * (`abreFrenteAlModificar`, `abreFrenteAlDesbloquear`): si el evento abre un frente, hay que contar, y sin las
 * acciones de la empresa delante no pasa. Lo que no es prioridad se aprueba sin contar.
 */
export function abreFrenteAlAprobar(a: Pick<AccionPlan, "es_prioridad">): boolean {
  return Boolean(a.es_prioridad);
}

/** Lo mismo al aprobar: un límite que no se pudo contar no se da por cumplido. */
export const ERROR_SIN_FRENTES_AL_APROBAR = "No se pudo contar cuántas prioridades hay abiertas, así que esta no se aprueba. Vuelve a intentarlo.";

/** Si quien llama no trae las acciones de la empresa, la marca no se pone: un límite que no se pudo contar no se da por cumplido. */
export const ERROR_SIN_FRENTES_QUE_CONTAR = "No se pudo contar cuántas prioridades hay abiertas, así que esta no se marca como prioridad. Vuelve a intentarlo.";

/**
 * DESBLOQUEAR UNA PRIORIDAD ES VOLVER A ABRIR SU FRENTE. Lo bloqueado no ocupa frente, y por eso la marca de
 * prioridad se puede poner sobre una acción bloqueada sin contar (`abreFrenteAlModificar` no la ve). El
 * límite se cobra a la salida: aprobar sin la marca, bloquear, marcar y desbloquear dejaba una prioridad
 * abierta de más, y el último paso lo puede dar el dueño. Verdadero cuando la acción es prioridad y vuelve
 * a aprobada, en ejecución o reportada. Sirve igual para el caso honesto: se bloqueó una de tres, se aprobó
 * otra en su sitio, y la primera no vuelve hasta que haya hueco.
 */
export function abreFrenteAlDesbloquear(a: Pick<AccionPlan, "es_prioridad">, estadoPrevio: Estado | null | undefined): boolean {
  return Boolean(a.es_prioridad) && !!estadoPrevio && ESTADOS_ABIERTOS.includes(estadoPrevio);
}

/** Lo mismo al desbloquear: sin las acciones de la empresa delante, la acción se queda como está. */
export const ERROR_SIN_FRENTES_AL_DESBLOQUEAR = "No se pudo contar cuántas prioridades hay abiertas, así que esta sigue bloqueada. Vuelve a intentarlo.";

/** Motivo de verdad: al menos 8 letras. «ok» o «no» no explican nada a quien lo lea en seis meses. */
export function validarMotivo(motivo: string | null | undefined): string | null {
  const m = (motivo ?? "").trim();
  if (m.length < MIN_MOTIVO) return `Di por qué, aunque sea en una línea (al menos ${MIN_MOTIVO} letras): el motivo es lo que sirve después.`;
  return null;
}

/**
 * Cambiar la ficha de una propuesta es completarla; cambiar una acción ya decidida es una decisión y pide
 * motivo e implicación.
 */
export function validarModificacion(estado: Estado, motivo: string | null | undefined, implica: string | null | undefined): string | null {
  if (estado === "propuesto") return null;
  const e = validarMotivo(motivo);
  if (e) return `La acción ya está ${ESTADO_CONSULTOR[estado].toLowerCase()}: ${e}`;
  if (!lleno(implica)) return "Di qué implica el cambio (plazo, recursos, otra acción): una modificación sin consecuencias declaradas no se puede seguir.";
  return null;
}

// ───────────────────────── LA TRANSICIÓN ─────────────────────────

export type FilaHistorial = {
  action_id: string;
  accion: Evento;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string | null;
  implica: string | null;
  actor_id: string | null;
  actor_rol: string | null;
};

export type DatosTransicion = {
  motivo?: string | null;
  implica?: string | null;
  /** Para verificar: cuántas pruebas tiene la acción y si su indicador recibió un valor posterior al reporte. */
  evidencia?: { pruebas: number; indicadorPosterior: boolean };
  /** Para reportar: la prueba que acompaña el reporte, si la hay. */
  evidenciaId?: string | null;
  /** Para desbloquear: el estado desde el que se bloqueó (se lee del historial). */
  estadoPrevio?: Estado | null;
  /** Para modificar: los campos nuevos (solo CAMPOS_EDITABLES). */
  cambios?: Record<string, unknown>;
  /**
   * Las acciones de la empresa y el límite de frentes. LA MISMA REGLA EN LOS TRES CAMINOS: son obligatorias
   * cuando el evento abre un frente, y sin ellas el evento no pasa. Aprobar: cuando la acción es prioridad
   * (`abreFrenteAlAprobar`). Modificar: cuando el cambio marca como prioridad una acción abierta
   * (`abreFrenteAlModificar`). Desbloquear: cuando lo que vuelve es una prioridad (`abreFrenteAlDesbloquear`).
   * Lo que no abre frente no las necesita.
   */
  frentes?: { acciones: Pick<AccionPlan, "id" | "accion" | "estado" | "es_prioridad" | "verificado_at">[]; limite: number };
  /** Para aprobar: la línea base vigente, que la acción referencia si no traía una. */
  lineaBaseVigenteId?: string | null;
  /** Para escalar: a quién. */
  escaladoA?: string | null;
  ahora?: Date;
};

export type ResultadoTransicion =
  | { ok: true; estado: Estado; cambios: Record<string, unknown>; historial: FilaHistorial }
  | { ok: false; error: string };

const fechaISO = (d: Date) => d.toISOString().slice(0, 10);

/**
 * La regla entera, pura: dado el estado de la acción, el evento, quién lo dispara y los datos, devuelve el
 * estado nuevo, los campos a actualizar y la fila de historial; o un error que dice exactamente qué no se
 * puede y por qué. No toca la base.
 */
export function transicion(a: AccionPlan, evento: Evento, actor: Actor, datos: DatosTransicion = {}): ResultadoTransicion {
  const estado = estadoCanonico(a);
  const ahora = datos.ahora ?? new Date();
  const destino = TRANSICIONES[estado][evento];
  if (!destino) {
    const posibles = Object.keys(TRANSICIONES[estado]).map((e) => VERBO[e as Evento]);
    return { ok: false, error: `Una acción ${ESTADO_CONSULTOR[estado].toLowerCase()} no se puede ${VERBO[evento]}. Se puede: ${posibles.join(", ")}.` };
  }
  if (!ROLES_POR_EVENTO[evento].includes(actor.rol)) {
    return { ok: false, error: actor.rol === "cliente" ? `Solo la consultora puede ${VERBO[evento]}.` : `El rol «${actor.rol}» no puede ${VERBO[evento]}.` };
  }
  const motivo = (datos.motivo ?? "").trim() || null;
  const implica = (datos.implica ?? "").trim() || null;
  if (EXIGEN_MOTIVO.includes(evento)) {
    const e = validarMotivo(motivo);
    if (e) return { ok: false, error: `Para ${VERBO[evento]}: ${e}` };
  }
  if (EXIGEN_IMPLICA.includes(evento) && !implica) {
    return { ok: false, error: `Para ${VERBO[evento]} di qué implica (plazo, recursos, otra acción). Sin eso nadie puede seguir la decisión.` };
  }
  if (evento === "comentar" && !motivo) return { ok: false, error: "Un comentario vacío no se guarda." };

  const cambios: Record<string, unknown> = {};
  let antesExtra: Record<string, unknown> = {};
  let nuevo: Estado = destino === "mismo" || destino === "previo" ? estado : destino;

  switch (evento) {
    case "aprobar": {
      const falta = queLeFalta(a);
      if (falta.length) return { ok: false, error: `Todavía no se puede aprobar. Falta: ${falta.join("; ")}.` };
      // Aprobar una prioridad abre un frente: se cuenta, y si no hay con qué contar no se aprueba. Hasta el
      // 13-10-2026 era al revés que en modificar y desbloquear: sin las acciones de la empresa, se aprobaba.
      if (abreFrenteAlAprobar(a)) {
        if (!datos.frentes) return { ok: false, error: ERROR_SIN_FRENTES_AL_APROBAR };
        const v = limiteFrentes(datos.frentes.acciones, datos.frentes.limite, a);
        if (!v.ok) return { ok: false, error: v.error };
      }
      cambios.aprobador_id = actor.id;
      cambios.aprobado_at = ahora.toISOString();
      if (!a.linea_base_id && datos.lineaBaseVigenteId) cambios.linea_base_id = datos.lineaBaseVigenteId;
      break;
    }
    case "iniciar":
      if (!a.fecha_inicio) cambios.fecha_inicio = fechaISO(ahora);
      break;
    case "reportar":
      cambios.reportado_at = ahora.toISOString();
      cambios.reportado_por = actor.id;
      break;
    case "verificar": {
      const ev = datos.evidencia;
      if (!ev || (ev.pruebas <= 0 && !ev.indicadorPosterior)) return { ok: false, error: ERROR_SIN_EVIDENCIA };
      cambios.verificado_at = ahora.toISOString();
      cambios.verificado_por = actor.id;
      cambios.verificado_nota = motivo;
      break;
    }
    case "bloquear":
      cambios.bloqueo = motivo;
      cambios.bloqueado_at = ahora.toISOString();
      break;
    case "desbloquear": {
      const previo = datos.estadoPrevio;
      if (!previo || !(["propuesto", "aprobado", "en_ejecucion", "reportado"] as Estado[]).includes(previo)) {
        return { ok: false, error: "No se sabe desde qué estado se bloqueó: no hay rastro del bloqueo en el historial." };
      }
      // Una prioridad que vuelve de estar bloqueada ocupa frente otra vez: se cuenta como al aprobarla, lo
      // dispare la consultora o el dueño. Si no cabe, se queda bloqueada y el mensaje nombra las abiertas.
      if (abreFrenteAlDesbloquear(a, previo)) {
        if (!datos.frentes) return { ok: false, error: ERROR_SIN_FRENTES_AL_DESBLOQUEAR };
        const salida = actor.rol === "cliente" ? SALIDA_FRENTES.desbloquear_cliente : SALIDA_FRENTES.desbloquear;
        const v = limiteFrentes(datos.frentes.acciones, datos.frentes.limite, { id: a.id, es_prioridad: true }, salida);
        if (!v.ok) return { ok: false, error: v.error };
      }
      nuevo = previo;
      cambios.bloqueo = null;
      cambios.bloqueado_at = null;
      break;
    }
    case "escalar":
      cambios.escalado_a = datos.escaladoA ?? null;
      cambios.escalado_at = ahora.toISOString();
      break;
    case "modificar": {
      const entradas = Object.entries(datos.cambios ?? {}).filter(([k]) => (CAMPOS_EDITABLES as readonly string[]).includes(k));
      // La marca de prioridad se compara y se escribe como sí o no, nunca como llegó: lo que no se entiende se rechaza.
      const pedida = entradas.find(([k]) => k === "es_prioridad");
      if (pedida) {
        const marca = marcaDePrioridad(pedida[1]);
        if (marca === null) return { ok: false, error: ERROR_MARCA_DE_PRIORIDAD };
        pedida[1] = marca;
      }
      const distintos = entradas.filter(([k, v]) => JSON.stringify((a as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null));
      if (!distintos.length) return { ok: false, error: "Para modificar hay que cambiar algo. Si solo quieres aceptarla, apruébala." };
      // El límite de frentes vale también por esta puerta: la marca de prioridad sobre una acción abierta se
      // cuenta igual que una aprobación, y el mensaje nombra las que ya están abiertas.
      if (abreFrenteAlModificar(estado, Object.fromEntries(distintos))) {
        if (!datos.frentes) return { ok: false, error: ERROR_SIN_FRENTES_QUE_CONTAR };
        const v = limiteFrentes(datos.frentes.acciones, datos.frentes.limite, { id: a.id, es_prioridad: true });
        if (!v.ok) return { ok: false, error: v.error };
      }
      antesExtra = Object.fromEntries(distintos.map(([k]) => [k, (a as Record<string, unknown>)[k] ?? null]));
      for (const [k, v] of distintos) cambios[k] = v;
      break;
    }
    default:
      break;
  }
  if (a.estado !== nuevo) cambios.estado = nuevo;
  cambios.updated_at = ahora.toISOString();

  const despues: Record<string, unknown> = { estado: nuevo };
  for (const [k, v] of Object.entries(cambios)) if (k !== "updated_at") despues[k] = v;
  if (evento === "reportar" && datos.evidenciaId) despues.evidencia_id = datos.evidenciaId;

  return {
    ok: true,
    estado: nuevo,
    cambios,
    historial: {
      action_id: a.id,
      accion: evento,
      antes: { estado, ...antesExtra },
      despues,
      motivo,
      implica,
      actor_id: actor.id,
      actor_rol: actor.rol,
    },
  };
}

// ───────────────────────── LO QUE PROPONE EL PLANIFICADOR ─────────────────────────

/** Sin tildes (la ñ queda como n), sin mayúsculas, sin signos ni espacios dobles: para comparar nombres y textos que escribió un modelo. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export type Participante = { id: string; nombre: string; puesto?: string | null; rol?: string | null };

/**
 * «Carlos (jefe de taller)» → el participante Carlos. Coincide por nombre completo, por nombre contenido o
 * por puesto. Si coincide con más de una persona no se adivina: queda vacío y `queLeFalta` lo pide.
 */
export function resolverResponsable(texto: string | null | undefined, participantes: readonly Participante[]): Participante | null {
  const t = normalizar(texto);
  if (!t) return null;
  const palabras = new Set(t.split(" "));
  const candidatos = participantes.filter((p) => {
    const n = normalizar(p.nombre);
    const puesto = normalizar(p.puesto);
    if (!n) return false;
    if (n === t) return true;
    if (n.length >= 3 && ` ${t} `.includes(` ${n} `)) return true;
    const primerNombre = n.split(" ")[0];
    if (primerNombre.length >= 3 && palabras.has(primerNombre)) return true;
    if (puesto.length >= 4 && (t === puesto || ` ${t} `.includes(` ${puesto} `))) return true;
    return false;
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}

export type Existente = Pick<AccionPlan, "id" | "finding_id" | "accion" | "estado" | "verificado_at">;
export type Propuesta = { finding_id: string; accion: string };

export type Reconciliacion<N extends Propuesta> = {
  /** Propuestas anteriores que ya no vienen: pasan a pospuesto con motivo. */
  posponer: Existente[];
  /** Pospuestas que vuelven a venir: se vuelven a proponer. */
  reproponer: Existente[];
  /** Frentes nuevos de verdad: nacen propuestos. */
  crear: N[];
  /** Frentes que ya existen en algún estado: no se duplican. */
  iguales: number;
};

const mismaAccion = (e: Existente, n: Propuesta) => e.finding_id === n.finding_id && normalizar(e.accion) === normalizar(n.accion);

/**
 * EL PLANIFICADOR NO BORRA. Antes, cada corrida hacía `delete … estado = 'pendiente'` y volvía a insertar:
 * lo que la consultora hubiera escrito en una propuesta desaparecía, y nadie sabía que una acción había
 * existido. Ahora: lo propuesto que ya no viene se pospone (con motivo), lo idéntico no se duplica, lo
 * pospuesto que reaparece se vuelve a proponer, y solo lo nuevo se crea. Lo aprobado, en ejecución,
 * reportado, verificado, rechazado o bloqueado no se toca: son decisiones ya tomadas.
 */
export function reconciliarPropuesta<N extends Propuesta>(existentes: Existente[], nuevas: N[]): Reconciliacion<N> {
  const posponer = existentes.filter((e) => estadoCanonico(e) === "propuesto" && !nuevas.some((n) => mismaAccion(e, n)));
  const reproponer = existentes.filter((e) => estadoCanonico(e) === "pospuesto" && nuevas.some((n) => mismaAccion(e, n)));
  const crear = nuevas.filter((n) => !existentes.some((e) => mismaAccion(e, n)));
  return { posponer, reproponer, crear, iguales: nuevas.length - crear.length };
}

/** La fecha de inicio de un frente: el día cero del plan más las semanas previas. Vence al cerrar su última semana. */
export function fechasDeFrente(inicioPlan: Date, semanaInicio: number, semanaCierre: number): { fecha_inicio: string; vence_at: string } {
  const ini = new Date(inicioPlan);
  ini.setDate(ini.getDate() + Math.max(0, semanaInicio - 1) * 7);
  const fin = new Date(inicioPlan);
  fin.setDate(fin.getDate() + semanaCierre * 7);
  return { fecha_inicio: fechaISO(ini), vence_at: fechaISO(fin) };
}

// ───────────────────────── LOS CORTES, EN PALABRAS ─────────────────────────

/** Lo que lee el dueño cuando el corte guardó números con una forma que la pantalla no sabe contar. */
export const CORTE_CON_NUMEROS_SIN_DETALLE = "Hay números registrados en este corte; pídele el detalle a tu consultora";
/** Lo mismo, dicho a la consultora: a ella no se le manda a preguntarse a sí misma. */
export const CORTE_CON_NUMEROS_ILEGIBLES = "Hay números registrados en este corte, pero con una forma que esta pantalla no sabe leer";

type Simple = string | number | boolean | null;
const esSimple = (v: unknown): v is Simple => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
/** Un valor vacío se lee «sin dato», nunca cero: que falte el número no quiere decir que valga nada. */
const valorLegible = (v: Simple): string => (v === null || v === "" ? "sin dato" : typeof v === "boolean" ? (v ? "sí" : "no") : String(v).trim() || "sin dato");
const nombreLegible = (k: string): string => {
  const t = k.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
};
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Tras la llave o el corchete viene sintaxis y no una palabra: una comilla u otra llave, o solo números y
 * literales separados por comas hasta el final. Es lo que separa un JSON roto («{"a":1», «[1, 2») de una
 * frase que empieza con corchete («[sin cambios», «[ ] pendiente», «[2] cotizaciones»).
 */
const SINTAXIS_JSON = /^[{[]\s*(["{[]|(-?\d+(\.\d+)?|true|false|null)(\s*,\s*(-?\d+(\.\d+)?|true|false|null))*\s*,?\s*$)/;

/**
 * ¿ESTE TEXTO ES JSON Y NO UNA FRASE? `undefined`: es una frase («[sin cambios esta quincena» lo es, aunque
 * empiece con corchete). `{ valor }`: es JSON y se pudo abrir. `{ roto: true }`: tiene forma de JSON pero no
 * se deja leer («{"a":1»); eso no se le enseña a nadie.
 */
function abrirJson(texto: string): { valor: unknown } | { roto: true } | undefined {
  const t = texto.trim();
  if (!/^[{[]/.test(t)) return undefined;
  try {
    return { valor: JSON.parse(t) as unknown };
  } catch {
    return SINTAXIS_JSON.test(t) ? { roto: true } : undefined;
  }
}

/**
 * LA FIRMA DE UN OBJETO JSON EN CUALQUIER PARTE DE UN TEXTO: llave, clave entre comillas y dos puntos. Una
 * frase no la lleva; si aparece («ver {"x":1} al final»), lo que hay ahí son datos y no se le enseñan a nadie.
 */
const FIRMA_JSON = /\{\s*"[^"]*"\s*:/;
/** La misma firma con las comillas escapadas («{\"x\":1}»): lo que queda a la vista de un JSON codificado dos veces, entero o a medias. */
const FIRMA_JSON_ESCAPADA = /\{\s*\\+"[^"\\]*\\+"\s*:/;
const llevaFirmaJson = (t: string): boolean => FIRMA_JSON.test(t) || FIRMA_JSON_ESCAPADA.test(t);

/**
 * JSON CODIFICADO DOS VECES: el texto entero es una cadena JSON («"{\"venta_mes\":40000}"», con sus comillas y sus
 * barras) y lo que lleva dentro vuelve a ser JSON. No empieza por llave ni por corchete, así que `abrirJson` lo
 * tomaba por una frase y salía a la pantalla tal cual, barras incluidas, como si fuera legible. No se abre para
 * leerlo por dentro: nadie escribe así a mano, y lo guardado con esa forma es un dato mal guardado, no un texto.
 * Una frase entre comillas («"sin cambios"») no es esto: dentro no hay JSON.
 */
function codificadoDosVeces(texto: string): boolean {
  const t = texto.trim();
  if (t.length < 2 || !t.startsWith('"') || !t.endsWith('"')) return false;
  let dentro: unknown;
  try {
    dentro = JSON.parse(t);
  } catch {
    return false;
  }
  return typeof dentro === "string" && (abrirJson(dentro) !== undefined || llevaFirmaJson(dentro) || codificadoDosVeces(dentro));
}

/** Hay algo guardado, pero no se sabe leer. Distinto de `null` (no hay nada) y de un texto (se puede mostrar). */
const ILEGIBLE = Symbol("ilegible");
type Lectura = string | null | typeof ILEGIBLE;
/** Un JSON guardado como texto dentro de otro JSON guardado como texto… hasta aquí se abre; más allá no se lee. */
const MAX_ANIDADO = 4;

/** Un texto vale tal cual, salvo que sea JSON: entonces se lee por dentro, y si no se deja, no se muestra. */
function leerTexto(texto: string, nivel: number): Lectura {
  const t = texto.trim();
  if (!t) return null;
  if (codificadoDosVeces(t)) return ILEGIBLE;
  const j = abrirJson(t);
  if (!j) return t;
  return "roto" in j ? ILEGIBLE : leerIndicadores(j.valor, nivel + 1);
}

/** Un nombre, un valor o una unidad sueltos: simples, y si son texto, que no sea JSON metido como texto. */
const sinJsonDentro = (v: unknown): boolean => typeof v !== "string" || (abrirJson(v) === undefined && !codificadoDosVeces(v));
const valorLimpio = (v: unknown): v is Simple => esSimple(v) && sinJsonDentro(v);

/** `{ nombre, valor, unidad? }` se lee «Nombre: valor unidad»; un texto suelto pasa por `leerTexto`; otra cosa no se lee. */
function elementoLegible(e: unknown, nivel: number): Lectura {
  if (typeof e === "string") return leerTexto(e, nivel) ?? ILEGIBLE;
  if (!esObjeto(e)) return ILEGIBLE;
  const nombre = [e.nombre, e.indicador, e.clave].find((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (!nombre || !sinJsonDentro(nombre) || !("valor" in e) || !valorLimpio(e.valor) || !sinJsonDentro(e.unidad)) return ILEGIBLE;
  const unidad = typeof e.unidad === "string" && e.unidad.trim() && e.valor !== null && e.valor !== "" ? ` ${e.unidad.trim()}` : "";
  return `${nombreLegible(nombre)}: ${valorLegible(e.valor)}${unidad}`;
}

function leerIndicadores(v: unknown, nivel: number): Lectura {
  if (v === null || v === undefined) return null;
  if (nivel > MAX_ANIDADO) return ILEGIBLE;
  if (typeof v === "string") return leerTexto(v, nivel);
  if (Array.isArray(v)) {
    if (!v.length) return null;
    const partes = v.map((e) => elementoLegible(e, nivel));
    return partes.every((p): p is string => typeof p === "string") ? partes.join(" · ") : ILEGIBLE;
  }
  if (!esObjeto(v)) return ILEGIBLE;
  if (typeof v.texto === "string") {
    const texto = leerTexto(v.texto, nivel);
    if (texto !== null) return texto;
  }
  const pares = Object.entries(v).filter(([k, x]) => !(k === "texto" && (x === null || typeof x === "string")));
  if (!pares.length) return null;
  if (!pares.every(([k, x]) => nombreLegible(k) && sinJsonDentro(k) && valorLimpio(x))) return ILEGIBLE;
  return pares.map(([k, x]) => `${nombreLegible(k)}: ${valorLegible(x as Simple)}`).join(" · ");
}

export type IndicadoresDelCorte = { texto: string; legible: boolean };

/**
 * LO QUE UN CORTE GUARDÓ DE SUS INDICADORES, PARA LEERSE. `checkpoints.indicadores` es jsonb libre y la ruta
 * que lo guarda no le exige forma: lo normal es `{ texto }` (lo que escribió la consultora), pero puede
 * traer pares clave y valor, una lista, o JSON metido como texto en cualquiera de esos sitios. Hasta el
 * 13-10-2026 la pantalla imprimía el JSON crudo cuando no había texto, también al dueño. Ahora: el texto si
 * lo hay; los pares «Nombre: valor» si son simples; un JSON guardado como texto (suelto, en `texto` o como
 * elemento de una lista) se lee por dentro; y lo que no se deja leer (una forma rara, un JSON roto, JSON en
 * el valor de un par, un objeto JSON en mitad de una frase, un JSON codificado dos veces) sale como una frase que
 * dice que hay números y a quién pedírselos (`legible: false`). `null` es «no hay nada». Lo que NO hace: en mitad de una frase
 * solo reconoce la firma de un objeto; unos corchetes sueltos («subió [2 de 10]») son texto de quien lo escribió.
 */
export function indicadoresLegibles(indicadores: unknown, lector: "cliente" | "consultor" = "cliente"): IndicadoresDelCorte | null {
  const leido = leerIndicadores(indicadores, 0);
  if (leido === null) return null;
  if (leido === ILEGIBLE || llevaFirmaJson(leido)) return { texto: lector === "consultor" ? CORTE_CON_NUMEROS_ILEGIBLES : CORTE_CON_NUMEROS_SIN_DETALLE, legible: false };
  return { texto: leido, legible: true };
}

// ───────────────────────── ABAJO: LO QUE TOCA LA BASE ─────────────────────────

/**
 * Una regla del plan que no se cumplió. Las rutas la devuelven como 409: la petición está bien formada y lo que
 * choca es el estado del plan (un límite lleno, una prueba que falta, un evento que ese estado no admite). El 400
 * queda para el cuerpo mal formado. Nunca como 500.
 */
export class ReglaDelPlan extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ReglaDelPlan";
  }
}

export type HistorialFila = FilaHistorial & { id: string; created_at: string; actor_nombre?: string | null };

export type AccionConContexto = AccionPlan & {
  estado_canonico: Estado;
  falta: string[];
  responsable_nombre: string | null;
  pruebas: number;
  historial: HistorialFila[];
  finding_titulo: string | null;
};

export type LineaBase = { id: string; version: number; fecha: string | null; vigente: boolean };
export type IndicadorBreve = { id: string; nombre: string; unidad: string | null };

export type PlanCargado = {
  acciones: AccionConContexto[];
  participantes: Participante[];
  indicadores: IndicadorBreve[];
  lineasBase: LineaBase[];
  lineaBaseVigente: LineaBase | null;
  limiteFrentes: number;
  abiertas: AccionConContexto[];
};

