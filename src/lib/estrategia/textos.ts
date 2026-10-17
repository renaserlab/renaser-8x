/**
 * LAS PALABRAS DE LA ESTRATEGIA, EN UN SOLO LUGAR (clientes/8x-plan/spec-estrategia-8x.md §2.2 y §8.3).
 *
 * Todo texto que la estrategia pone en pantalla vive aquí, para que Kelin cambie una palabra en un solo sitio. En 8X
 * «la ruta» ya es la barra de avance del programa (src/lib/ruta.ts): por eso las dos opciones de la estrategia se
 * llaman «caminos». Si Kelin prefiere «rutas», se cambia `TEXTO.camino` y `TEXTO.caminos` y nada más.
 *
 * «Lente» y «equipo rojo» son nombres del código, no de la pantalla. Ningún texto de aquí lleva un id interno, una
 * cifra de ejemplo ni el nombre de una empresa: los datos los pone cada empresa, nunca este archivo.
 *
 * Puro: sin base, sin red. Lo puede importar un componente de cliente.
 */

export const TEXTO = {
  camino: "camino",
  caminos: "caminos",
  dos_caminos: "Dos caminos",
  camino_a: "Camino A",
  camino_b: "Camino B",
  el_camino_elegido: "El camino que elegimos",
  camino_del_dinero: "el camino del dinero",
  camino_de_la_operacion: "el camino de la operación",
  por_probar: "Por probar",
  sin_dato: "sin dato",
  si_seguimos_igual: "Si seguimos igual",
} as const;

/** El chip de cada clase de dato, para la consultora (§3.1 y §8.3). El dueño nunca ve estas palabras. */
export const CHIP_CONSULTORA = {
  hecho: "Hecho",
  estimado: "Estimado del dueño",
  percepcion: "Percepción",
  sin_dato: "Sin dato",
  // Una cuenta del código lleva el chip de lo más débil de lo que usa (revisión del 17-10: el mismo «Cálculo» salía en
  // verde y en ámbar, y escondía que una proyección está por confirmar).
  calculo: "Cálculo",
  calculo_estimado: "Cálculo · con estimados",
  proyeccion: "Proyección · por confirmar",
  supuesto: "Supuesto · por confirmar",
  hipotesis: "Hallazgo sin revisar",
  deseo: "Lo que quiere el dueño",
  contexto: "Contexto, no es dato de la empresa",
  provisional: "Provisional: falta revisar el documento",
  escrito_por_consultora: "Escrito por la consultora",
} as const;

/** El mismo origen, dicho al dueño (§6.2): sin «hecho», «supuesto» ni «percepción». */
export const CHIP_DUENO = {
  hecho: "lo que nos dijiste",
  estimado: "estimado",
  supuesto: "por confirmar",
  sin_dato: "falta saberlo",
} as const;

/** Cómo se dice de dónde salió cada dato (columna «Cómo se dice la fuente» del §3.2). */
export const COMO = {
  metrica_verificado: "verificado con un documento",
  metrica_extraido: "leído de un documento, falta revisar",
  metrica_contado: "dicho de memoria",
  dato_comprobado: "comprobado",
  dato_contado: "lo tiene anotado o lo contó",
  dato_estimado: "lo calcula a ojo",
  claim_comprobado: "comprobado",
  claim_registro: "registro de la empresa",
  claim_vio_consultora: "lo vio la consultora",
  claim_documento: "documento de la empresa",
  hallazgo_sin_revisar: "hallazgo sin revisar",
  hallazgo_revisado: "hallazgo revisado por la consultora",
  respondio_el_dueno: "respondió el dueño",
  calendario: "calendario comercial",
  referencia: "referencia del rubro, no es dato de la empresa",
  procesos_dibujados: "sale de los procesos dibujados",
  consultora_anoto: "lo anotó la consultora",
  operaciones_moneda: "ventas en otra moneda anotadas",
} as const;

/** Quién dijo algo, por su rol en la empresa. El puesto, si se sabe, va entre paréntesis. */
export const QUIEN: Record<string, string> = {
  dueno: "el dueño",
  socio: "un socio",
  lider: "un líder del equipo",
  empleado: "una persona del equipo",
  cliente: "un cliente",
  consultor: "la consultora",
};
export const QUIEN_DESCONOCIDO = "alguien de la empresa";

/** Lo que el dueño dijo sobre su dependencia, por campo de la dimensión (src/lib/ficha-direccion.ts). */
export const SOBRE_DEPENDENCIA: Record<"que_se_detiene" | "podria_delegarse" | "capacidad_falta" | "aporta_valor", string> = {
  que_se_detiene: "sobre lo que se detiene sin él",
  podria_delegarse: "sobre lo que podría delegar",
  capacidad_falta: "sobre lo que falta para poder soltarlo",
  aporta_valor: "sobre dónde su presencia suma",
};

/** Lo que falta del mínimo para generar (§3.6), en palabras de consultora. */
export const FALTA_PARA_GENERAR = {
  venta: "Sin la venta del mes no hay base para ningún número.",
  gastos: "Sin gastos ni ganancia no hay utilidad que duplicar.",
  diagnostico: "Sin diagnóstico no hay de dónde partir: hace falta al menos un hallazgo, o quince hechos y percepciones.",
} as const;

export const TEXTO_PARTE_NO_HABILITADA = "esta parte no está habilitada en esta base";
export const CRITERIO_RECORTE = "no entraron por tamaño; se priorizó lo confirmado y lo reciente";
export const CRITERIO_TOPE_LECTURA = "la lectura trae como mucho este número de filas por empresa; se priorizó lo más reciente";
export const CRITERIO_CUENTAS_FICHA = "son cuentas de la ficha de dirección: 8X las rehace con sus propios cálculos, con sus fuentes";
export const CRITERIO_NUMERO_REPETIDO = "es un número que ya está en los nueve números de la empresa";

/** «Si seguimos igual» y lo que no se puede sumar entre jugadas (§4.4). */
export const LIMITACION_SIN_INTERACCION = "Se suman sin interacción entre jugadas: subir el precio y vender más a la vez no se cruzan en esta cuenta.";
export const LIMITACION_NO_ES_PROMESA = "Es una cuenta, no una promesa: dice cuánto deja si pasa, no que vaya a pasar.";

// ─── El armado (armar.ts) ────────────────────────────────────────────────────────────────────────

/** El responsable que 8X no encontró entre las personas de la empresa (§6.3, avisos). */
export const NO_ENCONTRADO = (dicho: string) => `por definir (8X no encontró a «${dicho}» en la empresa)`;

/** La nota de confianza (§6.1): la escribe el código con sus conteos; el modelo nunca escribe una cifra. */
export function notaDeConfianza(c: { hecho: number; estimado: number; supuesto: number; sin_dato: number; por_probar: number }): string {
  const total = c.hecho + c.estimado + c.supuesto + c.sin_dato;
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  const partes = [plural(c.hecho, "es un hecho", "son hechos"), plural(c.estimado, "estimado del dueño", "estimados del dueño"), plural(c.supuesto, "supuesto por confirmar", "supuestos por confirmar")];
  if (c.sin_dato) partes.push(plural(c.sin_dato, "sin dato", "sin dato"));
  const lista = `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
  const probar = c.por_probar ? `; ${plural(c.por_probar, "jugada está por probar", "jugadas están por probar")}` : "";
  return total ? `De las ${total} cifras que usa, ${lista}${probar}.` : `No usa ninguna cifra todavía${probar}.`;
}

/**
 * El caso que 8X suma cuando lo que un camino pide en dinero pasa lo que hay (§6.3, `pide_mas_caja_de_la_que_hay`).
 * Con calma y con su salida; las cifras van como `{{id}}`.
 */
export const CASO_CAJA = (contra: string[]) => ({
  caso: `Lo que pide este camino en dinero puede pasar ${contra.map((id) => `{{${id}}}`).join(" y ")}`,
  por_que_puede_pasar: "Las jugadas que piden dinero empiezan antes de que las otras liberen caja",
  refs: [...contra],
  solucion: "Empezar por las jugadas que no piden dinero y usar lo que liberen para pagar las demás",
  senal: "La caja de cada viernes no baja de lo que había al empezar",
});

/** La marca de lo que 8X quitó porque seguía inválido después de la reparación (§5.4). */
export const MARCA_QUITADO: Record<string, string> = {
  cifra_sin_origen: "8X quitó esto porque traía una cifra sin origen",
  ref_desconocida: "8X quitó esto porque citaba un dato que no existe",
  efecto_mal_armado: "8X no pudo calcular esta jugada y la dejó sin número",
  supuesto_fuera_de_limite: "8X dejó este supuesto fuera de las cuentas porque pasa su límite",
  supuesto_de_estado_actual: "8X dejó este supuesto fuera de las cuentas: suponía cuánto es algo hoy, y eso se pregunta",
  referencia_como_dato: "8X quitó esto porque usaba la referencia del rubro o el calendario como si fuera un dato de la empresa",
  pregunta_mal_hecha: "8X quitó esta pregunta porque no se podía hacer así",
  palabra_que_el_dueno_no_ve: "8X quitó esto porque usaba palabras que el dueño no tiene por qué conocer",
  nombre_de_referente: "8X quitó esto porque nombraba a un autor o a otra empresa",
};
export const MARCA_CAMINO_RESTAURADO = "8X volvió a poner jugadas que la prueba había quitado porque los cambios dejaban el camino con menos de tres";
export const MARCA_JUGADA_DE_MAS = "8X quitó la jugada agregada porque el camino pasaba de cinco";

// ─── La página del dueño (para-dueno.ts) ─────────────────────────────────────────────────────────

export const PARA_DUENO = {
  titulo: "El camino que elegimos para tu empresa",
  pasos: "Los pasos",
  esperamos: "Qué esperamos ver",
  // «Qué esperamos ver»: la cifra va en su propia línea grande; cuándo, arriba; y el «si», al pie (revisión del 17-10).
  si_se_cumple: (dias: number) => `A los ${dias} días: `,
  desde_los: (dias: number) => `Desde los ${dias} días: `,
  mas_al_mes: " más al mes, si se cumple lo que estimamos.",
  caja_1: "Y liberaría ",
  caja_2: " de caja, una sola vez.",
  falta_responder: "Los números los calculamos en cuanto respondas las preguntas de abajo.",
  falta_datos: "Los números los calculamos en cuanto tengamos los datos que faltan.",
  te_pedimos: "Lo que te pedimos",
  como_sabremos: "Cómo sabremos que funciona",
  si_pasa: "Si pasa esto, haremos esto",
  plan_anterior: "Este plan es de una versión anterior de 8X.",
} as const;

// ─── El motor: generar, etapas y fallos (spec-estrategia-8x.md §5.4 y §8.1) ───────────────────────

/** Las etapas de una generación, en palabras llanas. «Lente» y «equipo rojo» no salen a la pantalla. */
export const ETAPA = {
  dinero: { nombre: "el camino del dinero", pensando: "Pensando el camino del dinero" },
  terreno: { nombre: "el camino de la operación", pensando: "Pensando el camino de la operación" },
  rojo: { nombre: "la prueba de los dos caminos", pensando: "Poniéndolos a prueba" },
  revision: { nombre: "la revisión de cada cifra", pensando: "Revisando cada cifra" },
} as const;

/** En qué va una versión que se está generando, dicho a la consultora («Ya se está generando: va en …»). */
export const EN_QUE_VA: Record<"lentes" | "equipo_rojo" | "reparacion" | "armado" | "terminada", string> = {
  lentes: "los dos caminos",
  equipo_rojo: "la prueba de los dos caminos",
  reparacion: "la revisión de cada cifra",
  armado: "la revisión de cada cifra",
  terminada: "el cierre",
};

const miles = (n: number) => Math.round(n).toLocaleString("es-PE");

export const MOTOR = {
  lectura_critica: (tabla: string, motivo: string) => `No se pudo leer ${tabla}: ${motivo}. No se gastó ninguna consulta. Vuelve a intentarlo.`,
  tope_empresa: (usados: number, tope: number, porEstrategia: number) =>
    `Esta empresa ya usó ${miles(usados)} de su tope de ${miles(tope)}; una estrategia usa unas ${miles(porEstrategia)}. Sube el tope en la ficha de la empresa para generar.`,
  consumo: (usados: number, tope: number, porEstrategia: number) => `Esta empresa usó ${miles(usados)} de su tope de ${miles(tope)}; generar usa unas ${miles(porEstrategia)}.`,
  en_curso: (enQueVa: string) => `Ya se está generando: va en ${enQueVa}. Aquí verás cuando termine.`,
  tope_diario: (porDia: number) => `Hoy ya se generaron ${porDia} para esta empresa. Mañana se puede de nuevo; «Actualizar números» no gasta.`,
  a_la_vez: (aLaVez: number) => `Ahora se están generando ${aLaVez} estrategias; para no frenar las entrevistas de los clientes, esta se puede pedir en unos minutos.`,
  no_se_puso_en_marcha: (motivo: string) => `No se pudo poner en marcha: ${motivo}. No se gastó ninguna consulta. Vuelve a intentarlo.`,
  generar: "Generar la estrategia",
  generar_nota: "Usa tres consultas al asistente; tarda unos minutos; puedes salir de la página.",
  pedir_al_cliente: "Pedírselo al cliente",
  reintentar: "Reintentar esta etapa",
  descartar: "Descartar esta versión",
  /** Una salida cortada por MAX_TOKENS: es un error del esquema, no del modelo (§5.1). */
  cortada: "La respuesta del asistente salió cortada por tamaño.",
  no_valido: (detalle: string) => `La respuesta del asistente no tenía la forma pedida (${detalle}).`,
  cuota_del_dia: "Se acabó la cuota del día del asistente; se puede reintentar mañana (se repone hacia las 02:00 de Lima).",
  en_pausa: "En pausa: el asistente no tiene crédito. Se reanuda solo.",
  lente_lista_y_fallida: (lista: string, fallida: string, motivo: string) => `${lista.charAt(0).toUpperCase()}${lista.slice(1)} está listo; ${fallida} no salió: ${motivo}`,
  etapa_fallida: (nombre: string, motivo: string) => `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} no salió: ${motivo}`,
  etapa_no_termino: (nombre: string, error: string) => `La etapa «${nombre}» no terminó: ${error}`,
  sin_trabajo: "no se puso en marcha (no tiene un trabajo en la cola)",
  sin_resultado: "el trabajo terminó sin guardar su resultado",
  rojo_sin_lanzar: "los dos caminos están listos, pero la prueba no se puso en marcha",
  espera_los_dos: "Corre cuando estén los dos caminos.",
  faltan_las_lentes: "Faltan los dos caminos guardados: la prueba no tiene qué revisar.",
} as const;

// ─── Las rutas: lo que se lee cuando algo no se puede (spec-estrategia-8x.md §5.4, §7 y §8) ───────

/** Lo que el dueño llena para que haya con qué generar (§3.6, «Pedírselo al cliente»): solo lo que él puede dar. */
const PEDIR_POR_MINIMO: { falta: string; para_dueno: string }[] = [
  { falta: FALTA_PARA_GENERAR.venta, para_dueno: "cuánto vendiste el mes pasado" },
  { falta: FALTA_PARA_GENERAR.gastos, para_dueno: "tus gastos fijos del mes, o lo que te quedó libre" },
];

/**
 * El pedido que 8X arma cuando no alcanza el mínimo para generar: abre «Los números que faltan» con una nota escrita
 * por el código. Sin diagnóstico no hay nada que pedirle al dueño: eso lo hace la consultora (null).
 */
export function pedidoPorMinimo(faltan: readonly string[]): { seccion: "datos_faltantes"; nota: string } | null {
  const piezas = PEDIR_POR_MINIMO.filter((p) => faltan.includes(p.falta)).map((p) => p.para_dueno);
  if (!piezas.length) return null;
  return { seccion: "datos_faltantes", nota: `Para preparar tu plan nos falta saber ${piezas.join(" y ")}.` };
}

const mayuscula = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;

/** Lo que dicen las rutas de la estrategia a la consultora. */
export const API = {
  no_habilitada: "La estrategia todavía no está habilitada en esta base: falta aplicar su migración.",
  version_no_existe: "Esa versión de la estrategia no es de esta empresa.",
  /** §7.3: una versión aprobada no se edita; se corrige en una nueva. */
  ya_la_ve_el_cliente: "Esta versión ya la ve tu cliente. Para cambiarla, «Actualizar números» crea una nueva sin gastar consultas; corriges ahí y la apruebas.",
  ya_la_vio_el_cliente: "Esta versión ya la vio tu cliente y la reemplazó otra: no se corrige. Para cambiar la que ve hoy, «Actualizar números» crea una nueva sin gastar consultas.",
  generandose: "Esta versión todavía se está generando: se corrige cuando termine.",
  descartada: "Esta versión se descartó: no se corrige ni se aprueba.",
  no_editable: "Ese texto no se corrige desde aquí.",
  cambio_mientras_tanto: "Esta versión cambió mientras tanto: vuelve a cargar la página para ver lo último.",
  supuesto_no_existe: "Esa cifra por confirmar no está en esta versión.",
  supuesto_fuera: (problema: string) => `Ese rango no entra en las cuentas: ${problema}.`,
  nada_que_aceptar: "Ahí no hay nada que 8X haya quitado sin resolver.",
  ya_es_lo_de_8x: "Ese texto ya dice lo que escribió 8X.",
  sin_rastro: (motivo: string) => `Se guardó el cambio, pero no quedó anotado en el rastro de correcciones: ${motivo}. Avísale a quien mantiene 8X.`,
  falta_elegir: "Falta elegir el camino: elige uno y después apruébala.",
  por_resolver: (n: number) =>
    `Queda${n === 1 ? "" : "n"} ${n === 1 ? "una cosa" : `${n} cosas`} por resolver antes de aprobar: cada una se corrige, o se acepta que 8X la quite.`,
  solo_se_aprueba_lista: "Solo se aprueba una estrategia lista.",
  pagina_del_dueno: (problemas: string) => `La página que vería tu cliente no se puede aprobar así: ${problemas}. Corrígela y vuelve a aprobar.`,
  copia_no_guardada: (motivo: string) => `La estrategia quedó aprobada y tu cliente ya la ve, pero no se pudo guardar su copia en la biblioteca: ${motivo}.`,
  espera_la_que_se_genera: "Espera a que termine la que se está generando: después se actualizan los números.",
  sin_numeros: "Esta versión todavía no tiene números que actualizar.",
  sin_cambios: "Nada cambió en la empresa desde esta versión: los números serían los mismos.",
  no_se_genera: "Esta versión ya no se está generando: no hay etapa que reintentar.",
  etapa_no_fallo: (nombre: string) => `${mayuscula(nombre)} no falló: no hace falta reintentarla.`,
  etapa_no_reintentable: (nombre: string) => `${mayuscula(nombre)} no se puede reintentar: descarta esta versión y genera una nueva.`,
  nada_que_reintentar: "Ninguna etapa falló: no hay nada que reintentar.",
  solo_se_descarta_en_curso: "Solo se descarta una versión que se está generando.",
} as const;

/** El estado de una pregunta para el dueño, dicho a la consultora. */
export const ESTADO_PREGUNTA: Record<"propuesta" | "enviada" | "respondida" | "retirada", string> = {
  propuesta: "propuesta, sin enviar",
  enviada: "enviada al dueño",
  respondida: "respondida",
  retirada: "retirada",
};

/** Lo que dicen las rutas de las preguntas (§7.2 y §7.3). Lo que lee el dueño, en segunda persona y sin jerga. */
export const PREGUNTAS = {
  no_habilitadas: "Las preguntas de la estrategia no están habilitadas en esta base.",
  no_es_de_la_empresa: "Esa pregunta no es de esta empresa.",
  /** A quien no dirige la empresa: las preguntas de su plan son para el dueño o un líder. */
  solo_quien_dirige: "Estas preguntas son para quien dirige la empresa.",
  /** Al dueño: una pregunta propuesta o retirada no existe para él. */
  no_esta_para_ti: "Esa pregunta ya no está para ti. Si quieres decir algo, escríbele a tu consultora.",
  nada_que_enviar: "No hay nada que enviar: elige al menos una pregunta.",
  ya_no_se_envia: (estado: keyof typeof ESTADO_PREGUNTA) => `Esa pregunta ya no se puede enviar: está ${ESTADO_PREGUNTA[estado]}.`,
  solo_propuesta_se_retoca: "Solo se retoca una pregunta que todavía no se envió.",
  ya_retirada: "Esa pregunta ya estaba retirada.",
  respondida_no_se_retira: "Esa pregunta ya la respondió el dueño: no se retira.",
  mal_hecha: (problemas: string) => `Esa pregunta no se puede hacer así: ${problemas}.`,
  falta_texto: "Escribe tu respuesta.",
  no_se_aviso: (motivo: string) => `Las preguntas quedaron enviadas, pero no se pudo avisar al dueño: ${motivo}. Vuelve a enviarlas: lo ya enviado no se repite.`,
  no_se_abrio: (seccion: string, motivo: string) => `No se pudo abrir «${seccion}» para el dueño: ${motivo}. Vuelve a enviarlas: lo ya enviado no se repite.`,
  /** La nota del pedido «Unas preguntas para afinar tu plan». */
  nota: (n: number) => (n === 1 ? "Tu consultora te dejó una pregunta. Se responde en un minuto." : `Tu consultora te dejó ${n} preguntas. Cada una se responde en su tarjeta.`),
  /** Cuando lo que se agrega a la nota de una sección no cabe entero. */
  y_mas: (n: number) => (n === 1 ? "…y una cosa más que verás al entrar" : `…y ${n} cosas más que verás al entrar`),
  /** La confirmación del envío (§7.2): todo lo que se le abrirá al dueño. */
  resumen_envio: (preguntas: number, secciones: readonly string[]) => {
    const partes = [...(preguntas ? [preguntas === 1 ? "una pregunta" : `${preguntas} preguntas`] : []), ...secciones.map((s) => `«${s}»`)];
    if (!partes.length) return "Nada que enviar.";
    const lista = partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
    return `Se le abrirá al dueño: ${lista}.`;
  },
} as const;

// ─── La página de la consultora: «Estrategia» de cada empresa (spec-estrategia-8x.md §8.1 y §8.3) ───

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Lo que lee la consultora en /empresa/[id]/estrategia. Palabras de consultora, sin ids ni nombres del código («lente»,
 * «equipo rojo»): una consultora nueva del equipo no tiene por qué conocerlos. Ninguna cifra de ejemplo.
 */
export const PANTALLA = {
  titulo: "La estrategia",
  para_imprimir: "Ver para imprimir",
  volver: "Volver a la estrategia",
  imprimir: "Descargar PDF (imprimir)",
  marca_documento: "RENASER · CONSULTORÍA EMPRESARIAL",
  punto_decision_titulo: "El punto de decisión",
  no_existe: (v: number) => `Esta empresa no tiene una versión ${v} de la estrategia.`,
  ver_la_ultima: "Ver la última",

  // Corregir en el lugar (TextoEditable)
  corregir: "Corregir",
  editado_por_ti: "Editado por ti · ver lo que escribió 8X",
  lo_que_escribio_8x: "Lo que escribió 8X",
  volver_a_8x: "Volver a lo que escribió 8X",
  ayuda_cifras: "Las cifras de 8X van entre ⟦ ⟧: puedes moverlas o borrarlas. Lo que escribas tú queda como tu cifra.",
  guardando: "Guardando…",
  cerrar: "Cerrar",
  // Los botones y lo que dicen mientras trabajan
  elegir_camino: "Elegir este camino",
  elegir: (nombre: string) => `Elegir ${nombre}`,
  motivo_eleccion: "Por qué este camino (si quieres dejarlo dicho)",
  cancelar: "Cancelar",
  atras: "Volver",
  aprobar: "Aprobar la estrategia",
  aprobar_confirmar: "Desde que la apruebes, tu cliente la ve en su página «Plan».",
  aprobar_si: "Sí, aprobarla",
  aprobando: "Aprobando…",
  confirmar_aprobacion: "Confirmar la aprobación",
  poniendo_en_marcha: "Poniéndola en marcha…",
  actualizar: "Actualizar números",
  actualizando: "Rehaciendo las cuentas…",
  aceptar_quitado: "Aceptar que se quite",
  version_de_estrategia: "Versión de la estrategia",
  no_se_pudo: "No se pudo. Vuelve a intentarlo.",
  estado_etapa: { esperando: "espera a las anteriores", en_cola: "en cola", corriendo: "pensando", lista: "lista", fallida: "no salió", en_pausa: "en pausa" } as Record<string, string>,
  reintentando: "Reintentando…",
  descartar_nota: "Lo ya pagado queda guardado; después se puede generar una nueva.",
  descartar_si: "Sí, descartarla",
  descartando: "Descartando…",
  supuesto_dos: "Escribe los dos números: desde cuánto y hasta cuánto.",
  supuesto_orden: "El primero no puede pasar al segundo.",
  supuesto_puede: (a: number, b: number) => `Puede ir de ${a} a ${b}.`,
  supuesto_desde: "Desde",
  supuesto_hasta: "Hasta",
  supuesto_a: "a",
  corregir_rango: "Corregir el rango",
  guardar: "Guardar",
  rehaciendo: "Rehaciendo los números…",
  unidades_supuesto: { de_cada_10: "de cada 10", dias: "días", veces_mes: "veces al mes", pct: "%" } as Record<string, string>,
  // Las preguntas propuestas se separan en las que destraban un número y las que son para afinar (revisión del 17-10:
  // «harían falta para los números» exageraba cuando ninguna destrababa una jugada).
  hay_preguntas: (destraban: number, afinar: number, donde: string) => {
    const n = destraban + afinar;
    const total = n === 1 ? "Hay una pregunta para el dueño" : `Hay ${n} preguntas para el dueño`;
    const d = destraban === 1 ? "una destraba números" : `${destraban} destraban números`;
    const a = afinar === 1 ? "una es para afinar" : `${afinar} son para afinar`;
    if (!destraban) return `${n === 1 ? "Hay una pregunta" : `Hay ${n} preguntas`} para afinar el plan con el dueño; ninguna destraba un número todavía.`;
    if (!afinar) return `${total} que ${destraban === 1 ? "destraba" : "destraban"} números${donde ? ` (${donde})` : ""}.`;
    return `${total}: ${d}${donde ? ` (${donde})` : ""} y ${a}.`;
  },
  destraba: "Destraba números",
  para_afinar: "Para afinar",
  ya_enviadas: (n: number) => (n === 1 ? "Otra ya enviada espera respuesta." : `Otras ${n} ya enviadas esperan respuesta.`),
  enviadas_esperan: (n: number) => (n === 1 ? "Una pregunta enviada espera la respuesta del dueño." : `${n} preguntas enviadas esperan la respuesta del dueño.`),
  revisar_y_enviar: "Revisar y enviar",
  corregir_pregunta: "Corregir la pregunta",
  quitar_pregunta: "Quitar esta pregunta",
  enviar_a: (n: number, empresa: string) => (n === 1 ? `Enviar la pregunta a ${empresa}` : `Enviar las ${n} preguntas a ${empresa}`),
  enviar_si: (n: number) => (n === 1 ? "Sí, enviarla" : "Sí, enviarlas"),
  enviando: "Enviando…",
  confirmar_envio: "Confirmar el envío",

  // Las cifras (Frase)
  ver_de_donde: "Ver de dónde sale",
  de_donde_sale: "De dónde sale esta cifra",
  por_que_sin_cifra: "Por qué no hay cifra",
  como_se_calcula: "Cómo se calcula",
  periodo: "Periodo",
  faltan_datos: "faltan datos",
  provisional: "provisional",

  // Sin estrategia todavía (Preparacion)
  prep_titulo: "Todavía no hay estrategia",
  prep_sub: "8X la arma con los datos de la empresa: cada cifra con su origen, dos caminos para elegir y lo que falta saber vuelto preguntas para el dueño.",
  con_que: "Con qué datos se haría",
  falta_minimo: "Lo que falta para poder generarla",
  pedido_activo: "Ya se lo pediste al cliente: cuando lo llene, vuelve aquí.",
  ir_a_hallazgos: "Ver los hallazgos",
  no_se_pudo_leer: "No se pudieron contar los datos de la empresa:",
  descartadas: (n: number) => `${n === 1 ? "Una versión anterior se descartó" : `${n} versiones anteriores se descartaron`}: ${plural(n, "está", "están")} en «Versiones».`,

  // Generando
  generando: (v: number) => `Se está generando la versión ${v}`,
  generando_sub: "Tarda unos minutos y puedes salir de la página: aquí verás cuando termine.",
  otra_en_curso: (v: number) => `Se está generando la versión ${v}.`,
  ver_en_que_va: "Ver en qué va",
  descartada: (v: number) => `La versión ${v} se descartó`,
  descartada_sub: "Lo que ya se había pagado queda guardado en ella; no se corrige ni se aprueba.",

  // Las franjas de arriba
  respondio: (n: number) => (n === 1 ? "El dueño respondió una pregunta desde esta versión." : `El dueño respondió ${n} preguntas desde esta versión.`),
  que_cambio: (v: number | null) => (v ? `Qué cambió desde la versión ${v}` : "Qué cambió"),
  que_cambio_nada: "Los números son los mismos: nada se movió más de lo que se nota.",
  cambios: (n: number) => (n === 0 ? "sin cambios" : n === 1 ? "un cambio" : `${n} cambios`),
  versiones_n: (n: number) => (n === 1 ? "una versión" : `${n} versiones`),
  conviene: (motivos: string) => `Conviene volver a pensarla: ${motivos}.`,
  regenerar: "Regenerar",
  regenerar_nota: "Usa tres consultas al asistente.",

  // Arriba: la lectura y la gran apuesta
  lectura: "La lectura en cinco líneas",
  rotulos_lectura: ["Dónde está", "Qué la frena", "Cuánto cuesta seguir igual", "La apuesta", "Cómo sabremos"] as readonly string[],
  gran_apuesta: "La gran apuesta",
  apuesta_de: { a: "en el camino A", b: "en el camino B", ambos: "en los dos caminos" } as Record<string, string>,

  // Los dos caminos
  dos_caminos_sub: "Las mismas preguntas para los dos, renglón por renglón. A la vista, lo que decide la elección.",
  // La comparación de arriba (revisión del 17-10): para elegir de un vistazo, sin bajar a las jugadas.
  comparacion: "Los dos, lado a lado",
  comparacion_filas: { mes: "Deja de más al mes, a 90 días", caja: "Caja que libera, una vez", veces: "La utilidad a 90 días", pide: "Qué pide", cuidar: "Lo que hay que cuidar", conviene: "Conviene si" } as Record<string, string>,
  veces_la_de_hoy: "la de hoy",
  no_libera_caja: "No libera caja de una vez.",
  y_libera: "y libera",
  de_caja_una_vez: "de caja, una vez",
  ver_origen: "De dónde sale",
  origen_titulo: "De dónde salen estas cifras",
  recomendacion: "La recomendación de 8X",
  ir_a_camino: "Ir a un camino",
  recomendado: "Recomendado por 8X",
  por_que_este: "Por qué este",
  por_que_no_el_otro: "Por qué no el otro",
  jugadas: "Las jugadas, en orden",
  al_mes: "al mes",
  de_una_vez: "de una vez",
  desde_el_dia: (n: number) => `desde el día ${n}`,
  por_definir: "responsable por definir",
  meta_por_definir: "por definir",
  falta_saber: "falta saber",
  se_destraba_con: "Se destraba con",
  sin_cuenta: "sin número: 8X la dejó sin cuenta",
  no_se_calcula: "8X no pudo calcular esta jugada",
  a_90: "A 90 días",
  mas_al_mes: "más al mes",
  sin_numero_90: "Todavía sin número: ninguna jugada tiene su dato.",
  por_probar_fuera: (n: number) => `${n} ${plural(n, "jugada por probar no entra", "jugadas por probar no entran")} en la suma hasta tener su dato.`,
  casos: "Casos a tener en cuenta",
  si_pasa: "Si pasa",
  haremos: "Lo que haremos",
  lo_avisa: "Lo avisa",
  ver_detalle: "Ver el detalle",
  cada_jugada: "Cada jugada",
  jugada: (n: number) => `Jugada ${n}`,
  por_que: "Por qué",
  responde_el_mercado: "Qué responde el mercado",
  si_responde_distinto: "Si responde distinto",
  por_que_puede_pasar: "Por qué puede pasar",
  que_abre: "Qué abre",
  quien: "Quién responde",
  lo_que_se_supone: "Lo que se supone",
  numeros: "Los números a 14, 30 y 90 días",
  numeros_filas: { ritmo: "Deja de más al mes", acumulado: "Lleva dado", caja: "Caja que libera" },
  aun_nada: "todavía nada",
  dias: (n: number) => `Día ${n}`,
  que_pide: "Qué pide",
  pide: { dinero: "Dinero", horas_del_dueno: "Horas del dueño", personas: "Personas", herramientas: "Herramientas" } as Record<string, string>,
  anticipar: "Lo que viene y qué hacemos antes",
  senales: "Señales tempranas",
  se_mira_el_dia: (n: number) => `se mira el día ${n}`,
  punto_de_decision: (dia: number) => `El punto de decisión: día ${dia}`,
  que_mirar: "Qué se mira",
  si_va_bien: "Si va bien",
  si_no: "Si no va",
  elegido: "El camino elegido",
  si_seguimos_igual_1: "se siguen yendo",
  si_seguimos_igual_2: "de la caja cada mes",
  // La oportunidad no es una pérdida de caja: se dice aparte (revisión del 17-10).
  si_seguimos_igual_3: "Aparte, podrían entrar",
  si_seguimos_igual_4: "más al mes que hoy no entran",

  // Lo que hay que resolver antes de aprobar
  por_resolver: (n: number) => `Por resolver antes de aprobar (${n})`,
  por_resolver_sub: "Cada una se corrige aquí mismo, o se acepta que 8X la quite.",
  ir_a_resolver: (n: number) => (n === 1 ? "Queda una cosa por resolver antes de aprobar: ir a ella" : `Quedan ${n} cosas por resolver antes de aprobar: ir a ellas`),
  quito: "8X quitó",

  // Elegir y aprobar
  elige_para_aprobar: "Elige uno de los dos caminos: después, aquí verás lo que leerá tu cliente y podrás aprobarla.",
  asi_lo_vera: "Así lo verá tu cliente",
  asi_lo_vera_sub: "Esto es lo que verá tu cliente en su página «Plan». Lo que no apruebes no lo ve.",
  dueno_sin_revisar: "Corregiste jugadas de este camino, pero no lo que leerá tu cliente: revísalo antes de aprobar.",
  corregir_dueno: "Corregir lo que leerá tu cliente",
  no_se_aprueba_asi: "La página de tu cliente no se puede aprobar así:",
  aprobada: (fecha: string) => `Aprobada el ${fecha}: tu cliente la ve en su página «Plan».`,
  reemplazada: "Tu cliente vio esta versión; ahora ve una más nueva.",
  motivo: "Por qué se eligió",

  // Los cuatro grupos plegados
  grupo_14: "Lo de los primeros 14 días",
  grupo_14_sub: "Las victorias de la primera semana y lo que se mide desde el día 1",
  victorias: "Victorias de los primeros 14 días",
  victoria_tipo: { entra: "entra a la caja, una vez", deja: "deja de salir, cada mes", cuenta: "se cuenta: no mueve dinero por sí sola" } as Record<string, string>,
  victorias_total_1: "En los primeros 14 días entran",
  victorias_total_2: "de una vez",
  victorias_total_3: "y dejan de salir",
  victorias_total_4: "cada mes",
  victorias_aparte: "No se suman a ningún camino: sirven a los dos.",
  medir: "Qué medimos desde el día 1",
  medir_columnas: ["Qué", "Cómo se mide", "Quién anota", "Cada cuánto", "Desde", "A 30 días", "A 90 días"] as readonly string[],
  frecuencia: { diaria: "cada día", semanal: "cada semana", mensual: "cada mes" } as Record<string, string>,
  grupo_analisis: "El análisis",
  grupo_analisis_sub: "FODA y cruces, canvas, árboles, la oferta, fugas, el poder del uno y la cuenta de duplicar y triplicar",
  como_lo_ve: (camino: string) => `Cómo lo ve ${camino}`,
  modelo_de_dinero: "Cómo entra el dinero hoy",
  le_falta: "Lo que le falta",
  la_caja: "La caja",
  restriccion: "Lo que frena a la empresa",
  por_que_manda: "Por qué manda",
  personas: "Personas",
  procesos: "Procesos",
  producto: "Producto",
  dependencia: "Dependencia del dueño",
  tiempo_del_dueno: "El tiempo del dueño",
  foda: "FODA",
  cuadrantes: { f: "Fortalezas", d: "Debilidades", o: "Oportunidades", a: "Amenazas" } as Record<string, string>,
  falta_investigar: "falta investigar",
  /** «del camino del dinero», «de la prueba de los dos caminos». */
  de_camino: (camino: string) => (camino.startsWith("el ") ? `del ${camino.slice(3)}` : `de ${camino}`),
  con: "con",
  cruces: "Cruces",
  cruza: "Cruza",
  impacto: "Impacto",
  como_se_calculo: "Cómo se calculó",
  recursos: "Recursos",
  cambio_de_estructura: "Cambio de estructura",
  plazo: (dias: number) => `en ${dias} días`,
  indicador: "Indicador",
  sin_cuenta_pregunta: "Sin cuenta todavía. La pregunta que la calcularía:",
  canvas: "Canvas",
  bloques_canvas: { segmentos: "Segmentos de clientes", propuesta: "Propuesta de valor", canales: "Canales", relacion: "Relación con clientes", ingresos: "Fuentes de ingreso", recursos: "Recursos clave", actividades: "Actividades clave", socios: "Socios clave", costos: "Estructura de costos" } as Record<string, string>,
  estado_canvas: { comprobado: "comprobado", por_validar: "por validar", contradicho: "contradicho" } as Record<string, string>,
  arbol_problemas: "Árbol de problemas",
  arbol_soluciones: "Árbol de soluciones",
  causas: "Causas",
  aterriza: { proceso: "en un proceso", puesto: "en un puesto", politica: "en una política", palanca: "en una palanca" } as Record<string, string>,
  terreno: "El terreno propio",
  terreno_filas: { eliminar: "Eliminar", reducir: "Reducir", incrementar: "Incrementar", crear: "Crear" } as Record<string, string>,
  donde_ganar: "Dónde ganar sin pelear por precio",
  oferta: "La oferta",
  oferta_terminos: { resultado_sonado: "El resultado que sueña", probabilidad_percibida: "Por qué cree que le va a funcionar", tiempo: "Cuánto tarda", esfuerzo: "Cuánto le cuesta" } as Record<string, string>,
  oferta_campos: { para_quien: "Para quién", nombre: "Nombre", promesa: "Promesa", garantia: "Garantía", urgencia_real: "Urgencia real", precio: "Precio" } as Record<string, string>,
  bonos: "Bonos",
  oferta_escrita: "La oferta escrita",
  fugas: "Fugas y 90/10",
  fugas_bolsas: { caja: "Se van de la caja, al mes", horas: "Horas del dueño, al mes", oportunidad: "No entran, al mes", parado: "Dinero parado (no es del mes: no se suma)" } as Record<string, string>,
  fugas_total: "Total de la caja",
  noventa_diez: "Las pocas líneas que dejan casi todo (90/10)",
  fugas_vitales: "Las fugas que pesan casi todo",
  poder: "El poder del uno",
  poder_utilidad: "Mueven la utilidad del mes",
  poder_caja: "Liberan caja de una vez",
  poder_juntas: "Todas juntas",
  multiplicador: "Duplicar y triplicar",
  equilibrio: "Punto de equilibrio",
  productos: "Lo que deja cada producto",
  grupo_armo: "Cómo se armó",
  grupo_armo_sub: "Con qué datos, lo que 8X quitó o no pudo comprobar, la lista de control y lo que se le objetó a cada camino",
  confianza: "Con qué confianza",
  datos: "Con qué datos se hizo",
  /** Cómo se dice cada clase de dato junto a su cuenta: «1 hecho», «3 hechos», «30 sin dato». */
  clase: (n: number, k: "hecho" | "estimado" | "percepcion" | "sin_dato" | "hipotesis" | "deseo") =>
    ({
      hecho: ["hecho", "hechos"],
      estimado: ["estimado del dueño", "estimados del dueño"],
      percepcion: ["percepción", "percepciones"],
      sin_dato: ["sin dato", "sin dato"],
      hipotesis: ["hallazgo sin revisar", "hallazgos sin revisar"],
      deseo: ["deseo del dueño", "deseos del dueño"],
    })[k][n === 1 ? 0 : 1],
  datos_que_cita: "Los datos que cita",
  y_mas: (n: number) => `y ${n} más`,
  no_habilitado: "esta parte no está habilitada en esta base",
  /** Las tablas que lee 8X, dichas a la consultora (nunca el nombre de la base). */
  tablas: {
    companies: "la ficha de la empresa", company_metricas: "los números de la empresa", claims: "las afirmaciones", findings: "los hallazgos",
    sources: "las fuentes", participants: "las personas de la empresa", lineas_producto: "lo que vende", costos_mes: "los gastos del mes",
    ficha_negocio: "la ficha del negocio", operaciones_moneda: "las ventas en otra moneda", ficha_direccion: "la ficha de dirección",
    processes: "los procesos", estrategia_preguntas: "las respuestas del dueño", modelo_alto_rendimiento: "la referencia del rubro",
    finding_evidence: "lo que sostiene cada hallazgo",
  } as Record<string, string>,
  una_parte: "una parte de los datos",
  quitado: "Lo que 8X quitó o no pudo comprobar",
  nada_quitado: "8X no quitó nada y la revisión de cada cifra no dejó avisos.",
  resuelto: "resuelto",
  sin_resolver: "sin resolver",
  avisos: "Avisos",
  control: "La lista de control",
  cumple: "cumple",
  no_cumple: "no cumple",
  objeciones: "Lo que se le objetó a cada camino",
  objecion_de: { a: "Camino A", b: "Camino B", general: "A los dos" } as Record<string, string>,
  gravedad: { cambia_el_camino: "cambia el camino", ajuste: "ajuste" } as Record<string, string>,
  arreglo: "Cómo se arregla",
  cambiadas: "Jugadas que la prueba cambió",
  quitada: "se quitó",
  reemplazada_por: (n: number | null) => (n ? `se reemplazó por la jugada ${n}` : "se reemplazó"),
  supuestos: "Las cifras por confirmar",
  supuestos_sub: "Lo único que 8X puede suponer: cuánto cambia algo con una jugada, dentro de su límite. Se corrige el rango y los números se rehacen.",
  usado_en: "Se usa en",
  fuera_de_cuentas: "fuera de las cuentas",
  faltan: "Lo que falta saber",
  esperan: "La esperan",
  por_que_no_llega: "Por qué no llega a duplicar",
  grupo_versiones: "Versiones",
  version: (n: number) => `Versión ${n}`,
  origen_version: { ia: "la generó 8X", actualizacion: "números actualizados sin consultas" } as Record<string, string>,
  esta: "la que estás viendo",
  actualizar_nota: "Si la empresa cambió sus datos, «Actualizar números» rehace las cuentas sin gastar consultas.",
  generar_de_nuevo: "Volver a generarla desde cero",
} as const;

// ─── El portal del dueño: su camino y sus preguntas (spec-estrategia-8x.md §7.3 y §8.2) ──────────

/**
 * Lo que lee el dueño en «Tu plan» (CaminoElegido) y en «Unas preguntas para afinar tu plan» (ResponderPreguntas).
 * Segunda persona, palabras de todos los días, ninguna de PALABRAS_QUE_EL_DUENO_NO_VE y ninguna cifra de ejemplo: las
 * cifras las pone la empresa, nunca este archivo.
 */
export const PORTAL = {
  // El camino que elegimos (CaminoElegido)
  desde_el: (dia: string) => `Desde el ${dia}`,
  desde_el_dia: (n: number) => (n <= 1 ? "Desde el primer día" : `Desde el día ${n}`),
  a_cargo_de: (quien: string) => `a cargo de ${quien}`,
  lo_miramos_el: (dia: string) => `Lo miramos juntos el ${dia}`,
  lo_miramos_el_dia: (n: number) => `Lo miramos juntos el día ${n}`,
  si_pasa: "Si pasa",
  haremos: "Lo que haremos",
  preguntas_pendientes: (n: number) => (n === 1 ? "Tienes una pregunta para afinar este plan." : `Tienes ${n} preguntas para afinar este plan.`),
  responder: "Responder",
  /** Los números esperaban respuestas y ya no queda ninguna por responder: los rehace la consultora. */
  ya_respondiste_numeros: "Con lo que respondiste, tu consultora rehace estos números y te los muestra aquí.",
  no_se_pudo_camino: "No pudimos cargar el camino que elegimos para tu empresa. Vuelve a cargar la página en un momento; si sigue igual, escríbele a tu consultora.",
  // Debajo del camino, el plan de cada semana
  acciones_sin_empezar: "Las acciones de cada semana",
  sin_acciones: "Cuando convirtamos estos pasos en acciones con fechas y responsables, aparecen aquí para que marques lo que vas cerrando.",
  // Las preguntas (ResponderPreguntas)
  preguntas_intro: "Una pregunta por tarjeta. Si no sabes un número, elige «No lo sé»: también sirve. Lo que escribes se guarda solo al pasar a la siguiente.",
  preguntas_vacia: "Tu consultora no te ha hecho preguntas por ahora.",
  preguntas_cerradas: "Tu consultora cerró estas preguntas por ahora. Si quieres corregir algo, escríbele.",
  preguntas_no_se_pudo: "No pudimos leer tus preguntas ahora. Vuelve a cargar la página en un momento; si sigue igual, escríbele a tu consultora.",
  preguntas_sin_preparar: "Todavía no podemos mostrarte esta parte: la estamos terminando de preparar. No falta nada de tu lado.",
  pregunta_de: (i: number, n: number) => `Pregunta ${i} de ${n}`,
  ya_respondiste: (n: number) => `Ya respondiste (${n})`,
  guardando: "Guardando…",
  guardado: "Guardado",
  respondida: "Respondida",
  sin_responder: "Sin responder",
  tu_respuesta: "Tu respuesta",
  no_se_guardo: (motivo: string) => `No se guardó: ${motivo}`,
  /** Vaciar la caja no es responder: «No lo sé» sí lo es. */
  vacio: "Si no lo sabes, elige «No lo sé»: también es una respuesta.",
  escribe: "Escribe tu respuesta o díctala",
  no_lo_se: "No lo sé",
  dictado_no_entendido: (dicho: string) => `No entendimos el número que dictaste («${dicho}»). Escríbelo con cifras, o di de cuánto a cuánto.`,
  te_faltan: (n: number) =>
    n === 1 ? "Te falta una pregunta. Cuando la respondas, avísale a tu consultora aquí mismo." : `Te faltan ${n} preguntas. Cuando las respondas, avísale a tu consultora aquí mismo.`,
  listo: "Listo, ya respondí",
  /** La consultora que mira el portal «como el empresario»: ve lo mismo, sin responder por él. */
  como_consultora: "Las responde el dueño desde su portal. Tú las ves como él, sin poder responder por él.",
} as const;
