/**
 * LAS PLANTILLAS MAESTRAS DE 8X: la mitad que PRODUCE.
 *
 * QUÉ FALTABA. `varas.ts` es la mitad que MIDE: seis tipos de documento, 100 exigencias, cada una
 * con cómo se comprueba. Con eso 8X sabe decir que el MOF de una empresa cumple 1 de 16. Lo que no
 * tenía es con qué escribir el que sí cumple. Resultado: cuando a una empresa le falta un
 * documento, el sistema lo redacta desde cero y cada empresa nueva cuesta el mismo trabajo que la
 * anterior. La dueña lo dijo así: «no tengo plantillas como tal que se apliquen a las empresas».
 *
 * QUÉ ES UNA PLANTILLA MAESTRA. El formato base del documento, partido en secciones, donde cada
 * sección declara tres cosas: para qué exigencias de la vara existe (`cubre`), de qué material de
 * la empresa se llena (`de_donde_sale`) y qué pregunta se le hace al dueño si ese material no
 * está (`si_falta`). No es un documento con huecos: es el mapa de qué hay que tener para que el
 * documento pase su propia medición.
 *
 * EL INVARIANTE, que es el punto de todo esto. Cada exigencia OBLIGATORIA de una vara está
 * cubierta por al menos una sección de su plantilla. Una plantilla que no cubre su vara produce
 * documentos que fallan la medición de la casa, y eso es exactamente lo que pasó con el MOF de
 * La primera empresa cliente: seis fichas, 113 funciones, 13 de 14 exigencias obligatorias falladas. `sinCubrir()`
 * devuelve vacío para las seis plantillas, y la prueba `tests/plantillas-maestras.test.ts` falla
 * el día que alguien agregue una exigencia obligatoria a una vara y no la cubra aquí.
 *
 * POR QUÉ CADA SECCIÓN TIENE QUE CUBRIR ALGO. Una sección que no satisface ninguna exigencia es
 * relleno con nuestro propio nombre encima. Por eso `cubre` nunca va vacío, y la prueba lo exige.
 *
 * POR QUÉ `si_falta` ES LA PARTE MÁS IMPORTANTE. Es lo que convierte un formato en un
 * levantamiento. La regla de la casa: la magia está en saber preguntar, y nunca se sugiere la
 * respuesta en la pregunta. Una sola pregunta, respondible hablando, sobre un HECHO —no sobre una
 * opinión y nunca con la cifra adentro—. «¿Hasta qué monto puede cerrar una operación un cajero
 * sin llamarte?» sirve. «¿Te parece bien un tope de cinco mil dólares?» no: pone la cifra en la
 * boca del dueño. «¿Cómo manejan la seguridad?» tampoco: pide una opinión.
 *
 * ESTO ES PROPIEDAD DE RENASER, NO DEL CLIENTE. Igual que la vara: el contrato dice que «la
 * metodología, formatos base y know-how de EL PRESTADOR se mantienen como propiedad intelectual
 * del mismo». La empresa recibe el documento armado; no recibe la plantilla.
 *
 * NUMERACIÓN: `cubre` guarda la POSICIÓN de la exigencia en su vara, empezando en 1 —el mismo
 * número con que se publica la revisión al cliente («### 6. Todo puesto que decide sobre
 * dinero…»). Es una referencia posicional y por eso frágil: si alguien inserta una exigencia en el
 * medio de una vara, todos los números de abajo se corren y `cubre` apunta a otra cosa sin avisar.
 * Mientras las exigencias no tengan clave propia, el aviso lo da `exigencias_que_tenia_la_vara`:
 * el conteo con que se escribió cada plantilla, comparado en la prueba contra la vara de hoy.
 */
import { vara, type Vara } from "@/lib/metodo/varas";

/**
 * De dónde sale el contenido de una sección. Las cuatro primeras son material que la empresa ya
 * entregó o ya contó; las dos últimas no se pueden levantar de ningún documento porque son
 * decisiones que todavía no están tomadas.
 */
export type FuenteSeccion =
  /** Una clave de BLOQUES_ACTIVOS (`src/lib/activos.ts`), con su bloque: «personas.funciones». */
  | { de: "activo"; clave: string }
  /** Qué se busca entre las afirmaciones levantadas de la empresa (lo dicho en reunión o en acta). */
  | { de: "afirmaciones"; busca: string }
  /** Los puestos reales de la empresa, con su línea de mando. */
  | { de: "organigrama" }
  /** Los procesos reales de la empresa, con su responsable y su registro. */
  | { de: "procesos" }
  /** Algo que solo puede decidir el dueño o la gerencia: un tope, una reserva, una fecha de vigencia. */
  | { de: "decision_gerencia"; sobre: string }
  /** Algo que no resuelve la consultora: sale de la entrega hasta que el asesor responda por escrito. */
  | { de: "asesor_legal"; sobre: string };

export type SeccionPlantilla = {
  clave: string;
  titulo: string;
  /** Por qué esta sección existe, dicho de forma que se le pueda leer al cliente tal cual. */
  por_que: string;
  /** Sin una sección obligatoria el documento no se entrega. Sin una deseable se entrega diciendo qué falta. */
  obligatoria: boolean;
  de_donde_sale: FuenteSeccion[];
  /** Posiciones (desde 1) de las exigencias de la vara que esta sección satisface. */
  cubre: number[];
  /** LA PREGUNTA EXACTA que se le hace al dueño si el material no está. Una, oral, sobre un hecho. */
  si_falta: string;
};

export type Plantilla = {
  /** La MISMA clave que su vara: sin eso no se puede medir lo que la plantilla produjo. */
  clave: string;
  nombre: string;
  para_quien: string;
  secciones: SeccionPlantilla[];
  /** El relleno conocido de este tipo de documento, sacado de `senales_de_relleno` de su vara. */
  nunca_lleva: string[];
  /**
   * Cuántas exigencias tenía la vara el día que se escribió esta plantilla. No se usa para
   * producir nada: es el aviso de que la numeración de `cubre` puede haberse corrido. Los seis
   * conteos se tomaron de `varas.ts` el 18-10-2026 (100 exigencias en total).
   */
  exigencias_que_tenia_la_vara: number;
};

export const PLANTILLAS: Record<string, Plantilla> = {
  // ───────────────────────────────────────────────────────────────────────────────────────────
  // MOF. La plantilla está escrita contra un caso real: el manual de funciones de la primera empresa cliente (6 fichas, 113
  // funciones) falló 13 de sus 14 exigencias obligatorias. Cada fallo tiene aquí la sección que lo
  // hace imposible: funciones repetidas → la tabla de funciones con una fila por objeto y familia
  // de verbo; sin tabla de montos → `autoridad_y_montos`; sin respaldo → `respaldo_del_puesto`; un
  // horario para todas las sedes → `condiciones_por_sede`; habilidades como adjetivos →
  // `habilidades_observables`; jefes sin ficha → `mapa_de_puestos`.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  mof: {
    clave: "mof",
    nombre: "Manual de Organización y Funciones y fichas de puesto",
    para_quien:
      "El dueño, para decidir qué suelta; el jefe inmediato, para exigir; el trabajador, el día que entra, y lo firma. Un encabezado común de dos páginas más una ficha por puesto de dos a cuatro páginas: un manual de seis puestos no pasa de treinta páginas.",
    exigencias_que_tenia_la_vara: 16,
    secciones: [
      {
        clave: "portada_aprobacion_vigencia",
        titulo: "Portada: versión, quién la aprobó y desde cuándo rige",
        por_que:
          "Un manual sin fecha de vigencia no se puede exigir: nadie sabe si lo que lee es lo que manda hoy. Y la aprobación no es la vigencia: una cosa es quién firmó y qué día lo decidió, otra es desde qué día rige. Van escritas por separado porque son dos hechos distintos y se confunden todo el tiempo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "decision_gerencia", sobre: "quién aprueba esta versión del manual, qué día la aprueba y desde qué día rige" },
        ],
        cubre: [12],
        si_falta: "¿Qué día firmó la Gerencia el manual que hoy manda en la empresa?",
      },
      {
        clave: "marco_de_la_casa",
        titulo: "Lo que la casa exige a todos los puestos",
        por_que:
          "Si el manual de funciones no recoge el estándar de la casa, la empresa termina con dos documentos que le piden cosas distintas a la misma persona. Aquí bajan los pilares, los valores, los principios y el protocolo de atención, y los puestos que atienden al público llevan ese protocolo entre sus funciones, no como adorno del encabezado.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.mvv" },
          { de: "activo", clave: "personas.cultura" },
        ],
        cubre: [12],
        si_falta: "¿Qué hizo alguien de tu equipo que te hizo decir «esto aquí no va»?",
      },
      {
        clave: "mapa_de_puestos",
        titulo: "Todos los puestos, con un solo nombre cada uno",
        por_que:
          "Un puesto que manda sin ficha manda sin funciones ni límites escritos, y nadie puede reclamarle nada. Esta sección lista los puestos ocupados hoy, quién reporta a quién, y obliga a que cada puesto nombrado como jefe tenga su propia ficha en el mismo documento. También obliga a usar un solo nombre por puesto: con tres nombres para el mismo puesto no se puede cruzar el manual con el organigrama ni con la planilla.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
        ],
        cubre: [7],
        si_falta: "La última vez que alguien de tienda pidió permiso para salir, ¿a quién se lo pidió?",
      },
      {
        clave: "objetivo_del_puesto",
        titulo: "Para qué existe el puesto, en una oración",
        por_que:
          "El título del puesto no puede contradecir lo que la propia ficha le encarga. Si la ficha trae marcadores de mando —custodiar efectivo o valores, tener una clave o una llave, aprobar o autorizar montos, supervisar personal, firmar a nombre de la empresa, responder por más de un local—, el título no puede decir «asistente», «auxiliar» ni «apoyo»; y si no trae ninguno, no puede decir «jefe» ni «gerente». Un título mal puesto desordena el sueldo, la selección y la responsabilidad, y esconde en el organigrama al puesto de más confianza de la empresa.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.funciones" },
        ],
        cubre: [15],
        si_falta: "De la persona que ocupa ese puesto, ¿qué tiene que entregar para que digas que hizo bien su trabajo?",
      },
      {
        clave: "funciones_del_puesto",
        titulo: "Tabla de funciones: número, qué hace, cada cuánto y dónde queda la constancia",
        por_que:
          "Es el corazón de la ficha y la sección donde se cae la mayoría de los manuales. Va como tabla, no como lista corrida, y cada fila trae cuatro cosas: la función en verbo y objeto, la familia del verbo (ejecuta, verifica o aprueba), cada cuánto se hace —de la lista cerrada: permanente, diario, semanal, mensual, anual o según requerimiento— y, si es diaria o permanente, dónde queda la constancia de que se hizo. La tabla admite una sola fila por objeto y familia de verbo: así el mismo cuadre de caja no puede quedar escrito tres veces con tres verbos distintos, que es lo que diluye la obligación hasta que nadie sabe cuál se le exige. Al costado del nombre del puesto van dos conteos: cuántas funciones tiene la ficha y cuántas de ellas son diarias o permanentes, porque la carga del día tiene que caber en una jornada. Y se escribe qué parte de todas las funciones del manual se lleva ese puesto: es la forma más rápida de ver si una ficha se quedó con todo lo que nadie quiso asignar.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.funciones" },
          { de: "procesos" },
          { de: "activo", clave: "procesos.sistemas" },
        ],
        cubre: [1, 2, 3, 4, 5, 14],
        si_falta: "La semana pasada, ¿qué hizo esa persona cada día al abrir y al cerrar?",
      },
      {
        clave: "decisiones_reservadas",
        titulo: "Lo que la Gerencia no delega",
        por_que:
          "Una función que hoy nadie puede cumplir —porque la decisión es de otro o porque no tiene la llave— deja de ser exigible, y con ella pierde fuerza todo el documento. Esta sección va en el encabezado común y lista las decisiones que la Gerencia se queda: el precio, el acceso al dinero guardado, los sueldos y las salidas del personal. Toda función de toda ficha se escribe contra esta lista, y el verbo se ajusta: quien propone, propone; quien aprueba, aprueba.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "qué decisiones no delega: el precio, el acceso al dinero guardado, los sueldos y las salidas del personal" },
          { de: "activo", clave: "procesos.politicas" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [8],
        si_falta: "La última vez que alguien de tu equipo quiso decidir algo y le dijiste que eso lo decides tú, ¿qué era?",
      },
      {
        clave: "autoridad_y_montos",
        titulo: "Hasta dónde decide solo: tabla de montos por tramo",
        por_que:
          "Un puesto sin monto escrito no tiene autoridad: cada decisión sube al dueño y el puesto queda de adorno. La tabla trae tramo, moneda dicha, quién decide y qué se exige además en ese tramo. Mientras la Gerencia no la firme va marcada como pendiente de firma, con su línea de firma incluida: pendiente se puede entregar, inventada no.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "los tramos de monto que cada puesto decide solo, la moneda de cada tramo y qué se exige además" },
          { de: "activo", clave: "procesos.politicas" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [6],
        si_falta: "¿Hasta qué monto puede cerrar una operación un cajero sin llamarte?",
      },
      {
        clave: "habilidades_observables",
        titulo: "Habilidades escritas como conducta que se puede ver",
        por_que:
          "Una lista de adjetivos no se puede evaluar, así que a la hora de la verdad el jefe califica por simpatía. Cada habilidad entra con cuatro cosas: la conducta que se ve, cómo se demuestra, qué la contradice y con qué se mide; y ordenada contra las cuatro partes de la evaluación de la casa: resultados, comportamiento, competencia y responsabilidad. «Responsabilidad» en un cajero no es una palabra: es que cuadra su caja sin diferencias, y se mide con los cuadres del mes.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.evaluacion" },
          { de: "activo", clave: "personas.habilidades" },
        ],
        cubre: [10],
        si_falta: "La última vez que notaste que alguien de ese puesto lo estaba haciendo bien, ¿qué viste?",
      },
      {
        clave: "respaldo_del_puesto",
        titulo: "Quién cubre este puesto y qué no hereda el que cubre",
        por_que:
          "Sin respaldo escrito, una ausencia de tres días la resuelve el dueño en persona o no la resuelve nadie. La sección nombra el puesto que cubre —no «el jefe inmediato»— y dice qué queda fuera del reemplazo: las claves, los montos y las firmas. Decir qué no hereda el que cubre es lo que evita que una ausencia se convierta en un acceso regalado.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.plan_personal" },
          { de: "activo", clave: "personas.habilidades" },
          { de: "activo", clave: "procesos.controles" },
          { de: "organigrama" },
        ],
        cubre: [11],
        si_falta: "La última vez que faltó la persona de ese puesto, ¿quién hizo su trabajo ese día?",
      },
      {
        clave: "condiciones_por_sede",
        titulo: "Condiciones de trabajo de la sede donde trabaja el puesto",
        por_que:
          "Si todas las fichas repiten el mismo horario y cada local abre a hora distinta, el candidato firma un horario y trabaja otro: la relación arranca con una mentira escrita y el documento no vale el día del reclamo. Va el horario real del local donde trabaja el puesto, y si el puesto rota entre locales, el de cada uno.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "hora de apertura, de cierre y de refrigerio de cada sede, y la hora en que sale y llega el dinero" },
          { de: "decision_gerencia", sobre: "en qué sede trabaja cada puesto y cuáles rotan entre sedes" },
        ],
        cubre: [9],
        si_falta: "¿A qué hora abrió y a qué hora cerró ayer cada una de tus tiendas?",
      },
      {
        clave: "evaluacion_y_recepcion",
        titulo: "Contra qué se evalúa al ocupante, qué día, y firma de recepción",
        por_que:
          "El documento solo se vuelve real cuando se enseña, se evalúa y se firma. Sin la fecha de la primera evaluación nadie revisa si el puesto funcionó; sin el bloque de firma —nombre, documento de identidad y fecha— el trabajador siempre puede decir que no lo conocía. Lo que se mira ese día sale de las funciones de mayor peso de esta misma ficha, no de una lista aparte.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.evaluacion" },
          { de: "activo", clave: "personas.onboarding" },
          { de: "decision_gerencia", sobre: "a los cuántos días se evalúa a quien entra a este puesto y quién lo evalúa" },
        ],
        cubre: [13],
        si_falta: "La última persona que entró a ese puesto, ¿qué día se sentaron a decirle cómo le estaba yendo?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Lo que sale de la entrega hasta que responda el asesor",
        por_que:
          "Una cláusula inventada en un documento firmado la paga la empresa, no la consultora. Todo lo que suene a obligación legal —poner un faltante a cargo del trabajador, marcar un puesto sin control de horario, invocar un procedimiento interno que no existe por escrito, descuentos o sanciones— va marcado y queda fuera de la entrega hasta que vuelva la respuesta por escrito. El manual no fija plazos, montos ni artículos por su cuenta.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "el faltante de caja a cargo del trabajador, los puestos marcados sin control de horario, los préstamos al personal y todo descuento o sanción" },
        ],
        cubre: [16],
        si_falta: "¿Qué le pasa hoy al cajero cuando al cerrar la caja falta dinero?",
      },
    ],
    nunca_lleva: [
      "«Otras funciones inherentes al cargo que le sean asignadas por su jefe directo»: no dice qué hace la persona ni cómo se verifica.",
      "Funciones que empiezan con «apoyar en», «coadyuvar», «velar por» o «participar en».",
      "Funciones que son el nombre de un área en vez de una tarea: «gestión de recursos humanos», «gestión de calidad».",
      "Habilidades que son adjetivos sueltos: proactividad, liderazgo, compromiso organizacional.",
      "Secciones copiadas palabra por palabra entre fichas: riesgos, condiciones de trabajo y habilidades iguales para el gerente y para el cajero.",
      "Dos funciones seguidas que solo se diferencian en un verbo añadido.",
      "Verbos de supervisión sobre puestos que no tienen ficha en el manual.",
      "Más páginas de manual que trabajadores en la empresa.",
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // SELECCIÓN. El hueco que este documento cierra: las pérdidas de caja de una empresa de efectivo
  // casi nunca son por mala fe, son por dar autonomía antes de tiempo. Por eso la plantilla parte
  // el camino en perfil → entrevista igual para todos → prueba práctica → acompañamiento →
  // certificación firmada, y el tope del no certificado va escrito.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  seleccion: {
    clave: "seleccion",
    nombre: "Manual de Selección y Reclutamiento",
    para_quien:
      "Lo aprueba Gerencia y lo aplica quien administra el personal; lo lee también el supervisor que recibe al nuevo. Cuerpo de quince a veinticinco páginas, nunca más, y los formatos aparte, uno por paso.",
    exigencias_que_tenia_la_vara: 15,
    secciones: [
      {
        clave: "perfil_firmado_antes_de_buscar",
        titulo: "El perfil del puesto, escrito y firmado antes de buscar a nadie",
        por_que:
          "Sin perfil se contrata a la persona que cayó y después se le inventan las funciones: así nace el puesto que termina con cuarenta y ocho obligaciones porque recogió todo lo que nadie quiso asignar. La regla va escrita como prohibición —no se busca ni se comenta una vacante sin perfil firmado— y el formato de perfil lleva su casilla de firma. El puesto se llama igual que en el organigrama y en el manual de funciones, con el mismo nombre, para poder cruzar los tres documentos.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.funciones" },
          { de: "activo", clave: "personas.seleccion" },
        ],
        cubre: [1, 3],
        si_falta: "La última vez que contrataron a alguien, ¿qué quedó escrito del puesto antes de empezar a buscar?",
      },
      {
        clave: "tope_de_dinero_del_puesto",
        titulo: "Las dos cifras del puesto: certificado y todavía no certificado",
        por_que:
          "Todo puesto que decida sobre dinero, autorice transferencias o custodie valores lleva dos cifras con su moneda dicha: hasta cuánto decide solo una persona ya certificada en ese puesto, y hasta cuánto decide quien todavía no está certificado, que puede ser cero. Y los puestos que no deciden dinero lo dicen con esa palabra: ninguno. Es la pieza que evita lo que ya pasó una vez: alguien solo frente a la caja antes de demostrar que sabía. «Según criterio del jefe» y «montos menores» no son topes, y una cifra sin moneda tampoco.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "el tope de dinero que decide solo cada puesto y la moneda de ese tope" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [2],
        si_falta: "¿En qué moneda y hasta qué monto decide solo quien ocupa ese puesto?",
      },
      {
        clave: "guia_de_entrevista_igual_para_todos",
        titulo: "Las mismas preguntas a todos, y una sola tabla para compararlos",
        por_que:
          "Dos candidatos al mismo puesto solo se pueden comparar si se les evaluó igual. La guía trae las preguntas escritas palabra por palabra, no temas sueltos, y la tabla comparativa una fila por candidato con las mismas columnas. Ningún criterio es un adjetivo: cada uno dice qué conducta se observa y qué puntaje recibe, porque «proactividad» no se puede marcar mirando a alguien trabajar.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.seleccion" },
          { de: "activo", clave: "personas.funciones" },
        ],
        cubre: [4, 6],
        si_falta: "En la última entrevista que hiciste, ¿qué le preguntaste?",
      },
      {
        clave: "prueba_practica_con_puntaje",
        titulo: "Prueba práctica del oficio, con puntaje mínimo en número",
        por_que:
          "Todo puesto que toca dinero, llaves o datos de clientes se prueba haciendo, no conversando. La hoja trae los ejercicios, el puntaje de cada bloque, el mínimo para aprobar escrito en número, y qué bloques descalifican aunque el total alcance. «Se evaluará su desempeño práctico» no es una prueba.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "personas.habilidades" },
          { de: "procesos" },
        ],
        cubre: [5, 6],
        si_falta: "La última persona que entró a tocar la caja, ¿qué le pusiste a hacer para saber si sabía?",
      },
      {
        clave: "acompanamiento_y_criterio_de_salida",
        titulo: "El acompañamiento cierra con lo que la persona tiene que demostrar",
        por_que:
          "Un acompañamiento que termina por calendario —tres días, una semana, «según capte»— suelta a la persona sin que nadie sepa si está lista. Cierra con una lista de lo que demuestra haciendo y el puesto que lo firma. Esa lista sale de las tareas reales del puesto, no de una plantilla de curso.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.onboarding" },
          { de: "activo", clave: "personas.habilidades" },
          { de: "procesos" },
        ],
        cubre: [7],
        si_falta: "La última persona que entró, ¿qué día empezó a trabajar sola?",
      },
      {
        clave: "certificacion_antes_de_la_autonomia",
        titulo: "Certificación firmada antes de dejar a alguien solo frente al dinero",
        por_que:
          "Es la pieza que evita la pérdida de caja que después termina en despido por falta de capacitación. El acta trae el nombre de la persona, la fecha, qué se le habilita, hasta cuánto, y la firma de quien lo supervisa y de quien administra: la autonomía sobre dinero no se entrega de palabra ni se da por supuesta al terminar la inducción. Y la certificación caduca: se escribe cada cuánto se revisa y qué la suspende, porque un cambio de local o de puesto cambia lo que la persona sabe hacer.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.habilidades" },
          { de: "activo", clave: "procesos.controles" },
          { de: "decision_gerencia", sobre: "qué puede decidir sobre dinero quien todavía no está certificado, y cada cuánto se revisa la certificación" },
        ],
        cubre: [8, 14],
        si_falta: "Mientras una persona nueva aprende, ¿qué operaciones puede cerrar sin que nadie la mire?",
      },
      {
        clave: "quien_decide_contratar",
        titulo: "Quién decide contratar, y por qué el puntaje no decide solo",
        por_que:
          "La decisión queda en un puesto nombrado —no «el comité», no «el área»— y deja rastro escrito con firma. Y el puntaje informa, no decide: contratar, no contratar o separar a alguien lo escribe y lo firma una persona. Un número que descalifica por su cuenta deja a la empresa sin nadie que responda por la decisión.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "decision_gerencia", sobre: "qué puesto decide y firma la contratación y la no contratación" },
        ],
        cubre: [9, 10],
        si_falta: "La última persona que entró, ¿quién dijo que sí?",
      },
      {
        clave: "acta_de_accesos",
        titulo: "Acta de entrega y devolución de accesos, uno por uno",
        por_que:
          "Un acceso que se entrega sin acta no se devuelve: queda abierto cuando la persona ya no está. Se lista cada cosa por separado —usuario del sistema, correo, token del banco, clave del dinero guardado, llave del local— con firma al entregar y firma al devolver. «Se le otorgarán los accesos correspondientes» no es un acta.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.sistemas" },
        ],
        cubre: [11],
        si_falta: "Hoy, ¿quién tiene las llaves, las claves y los accesos al dinero y al sistema?",
      },
      {
        clave: "preguntas_al_asesor_legal",
        titulo: "Lo que se le pregunta al asesor antes de exigirlo a un candidato",
        por_que:
          "Todo lo que la empresa quiera pedirle a un candidato y huela a ley entra como pregunta, no como requisito ya decidido: antecedentes, informe de deudas, consentimiento y tiempo de conservación de las hojas de vida, edad mínima para manejar efectivo de terceros, modalidad de contratación. Sin plazos, montos ni artículos que nadie verificó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "antecedentes, informe de deudas, consentimiento y conservación de hojas de vida, edad mínima para manejar efectivo de terceros y modalidad de contratación" },
        ],
        cubre: [12],
        si_falta: "¿Qué papeles le pides hoy a alguien antes de contratarlo?",
      },
      {
        clave: "respaldo_del_puesto_contratado",
        titulo: "Quién cubre el puesto si falta, y el día en que se probó",
        por_que:
          "Un nombre sin fecha de prueba es una suposición: nadie sabe si esa persona puede hacerlo de verdad hasta que lo hizo una vez. Por eso el respaldo se escribe con el día en que se probó.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.plan_personal" },
          { de: "organigrama" },
        ],
        cubre: [13],
        si_falta: "La última vez que faltó quien ocupa ese puesto, ¿quién lo cubrió?",
      },
      {
        clave: "numeros_y_linea_base",
        titulo: "Con qué números se sabrá si el manual sirvió, y cuánto valen hoy",
        por_que:
          "Un manual sin línea base no se puede defender ni corregir: cuando alguien pregunte si sirvió, la respuesta va a ser una opinión. Cierra con entre dos y cuatro números, cada uno con dónde se lee, cada cuánto y su valor de hoy. Si el valor de hoy no existe, se dice que no existe: nada se inventa.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "personas.plan_personal" },
        ],
        cubre: [15],
        si_falta: "En lo que va del año, ¿cuántas personas entraron y cuántas se fueron?",
      },
    ],
    nunca_lleva: [
      "Listas simétricas de competencias, las mismas de un puesto a otro cambiando una palabra.",
      "Párrafos que explican qué es el reclutamiento en vez de decir quién hace qué el lunes.",
      "Frases que no se pueden comprobar: «se aplicarán las mejores prácticas», «se garantizará la idoneidad del personal».",
      "El mismo paso contado dos veces con otras palabras en secciones distintas.",
      "Anexos con formatos vacíos y sin instrucción: no dicen quién los llena, en qué momento ni dónde quedan.",
      "Un capítulo de marco legal que cita normas en general y no cambia nada de lo que la empresa hace el día que contrata.",
      "Misión, visión y organigrama pegados al inicio para dar cuerpo, cuando ya viven en otro documento de la casa.",
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // PROCESOS. Dos documentos en uno: el del dueño (el inventario y las fichas) y el del trabajador
  // (el procedimiento de lo que él hace, una cara, de pie). La plantilla separa describir de
  // intervenir: entre uno y tres procesos traen versión mejorada; describir todo y mejorar nada es
  // lo que convierte un manual en un adorno.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  procesos: {
    clave: "procesos",
    nombre: "Manual de Procesos y Procedimientos",
    para_quien:
      "El dueño y el responsable de cada área leen el inventario y los procesos de su área. El trabajador lee solo el procedimiento de lo que él hace, y lo lee de pie: una cara. De diez a quince procesos mapeados, cada procedimiento en una o dos páginas.",
    exigencias_que_tenia_la_vara: 16,
    secciones: [
      {
        clave: "inventario_de_procesos",
        titulo: "Inventario: un proceso por trabajo, con un solo responsable",
        por_que:
          "El inventario es lo que impide que el mismo trabajo entre dos veces con dos nombres —cerrar caja y cuadrar caja— y lo que obliga a que cada proceso tenga un responsable que es un puesto con ficha en el manual de funciones, no un área ni el nombre de una persona. Dos puestos unidos por una barra no son un responsable: son ninguno.",
        obligatoria: true,
        de_donde_sale: [
          { de: "procesos" },
          { de: "activo", clave: "procesos.mapa_procesos" },
          { de: "organigrama" },
        ],
        cubre: [1, 9],
        si_falta: "¿Qué tareas, si fallan, hacen sufrir a la empresa? Dímelas una por una.",
      },
      {
        clave: "inicio_y_fin_del_proceso",
        titulo: "Con qué hecho empieza y con qué hecho termina",
        por_que:
          "Los dos extremos tienen que ser hechos que se ven desde afuera: el cliente llega a la ventanilla, el reloj marca la hora de cierre, el reporte está enviado. «Inicio: el proceso de caja» y «fin: fin del proceso» no delimitan nada, y un fin que es un estado de ánimo —«queda el cliente satisfecho»— no se puede verificar ni al día siguiente.",
        obligatoria: true,
        de_donde_sale: [
          { de: "procesos" },
          { de: "activo", clave: "procesos.mapa_procesos" },
        ],
        cubre: [2],
        si_falta: "La última vez que se hizo ese trabajo, ¿qué pasó justo antes de empezarlo?",
      },
      {
        clave: "donde_queda_el_resultado",
        titulo: "Dónde queda anotado el resultado, con el lugar exacto",
        por_que:
          "«En el sistema» o «en el Excel» no es un lugar: hay que nombrar la pantalla, el archivo, el cuaderno o el grupo donde el dato queda, y al lado la fecha en que ese registro se miró con los propios ojos. Un registro que nadie abrió es un registro que puede no existir. Y los procesos cuyo resultado hoy no se anota en ninguna parte van marcados con letra, diciendo que no queda registrado y qué habría que crear para registrarlo: un documento donde todos los procesos tienen indicador y ninguno confiesa un hueco es un documento donde los indicadores se escribieron en vez de encontrarse.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.sistemas" },
          { de: "activo", clave: "procesos.indicadores" },
        ],
        cubre: [3, 4],
        si_falta: "Cuando ese trabajo termina, ¿en qué cuaderno, hoja o pantalla queda anotado?",
      },
      {
        clave: "tiempo_con_su_origen",
        titulo: "Cuánto tarda, y de dónde salió ese tiempo",
        por_que:
          "Cada duración lleva su etiqueta: medido —con la fecha y cuántas veces se cronometró—, declarado si lo dijo quien hace el trabajo, o estimado si es nuestro cálculo. Un tiempo sin etiqueta no se puede discutir, y un tiempo redondo marcado como medido sin fecha es una estimación disfrazada.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "resultados.tiempos" },
          { de: "activo", clave: "producto.entrega" },
        ],
        cubre: [5],
        si_falta: "El último pedido que entregaron, ¿qué día lo pidió el cliente y qué día lo recibió?",
      },
      {
        clave: "pasos_del_procedimiento",
        titulo: "Los pasos, de forma que se ejecuten sin llamar a nadie",
        por_que:
          "La prueba de un procedimiento es que alguien lo pueda hacer de principio a fin sin llamar a nadie. Por eso, donde un paso implica decidir, el texto responde las cinco preguntas: hasta qué monto decide solo, a qué puesto escala y por qué canal, qué documento le exige al cliente, qué hace si el cliente dice no, y qué hace si el sistema o el canal está caído. Si queda una sin responder, el procedimiento no está terminado, está empezado. Y el mismo paso no se escribe dos veces con palabras distintas para que la lista parezca más completa.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "procesos" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [8, 9],
        si_falta: "La última vez que alguien dudó de cómo hacer ese trabajo, ¿qué fue lo que preguntó?",
      },
      {
        clave: "topes_y_decisiones_reservadas",
        titulo: "Los topes de cada paso y lo que la gerencia no delega",
        por_que:
          "Los pasos que fijan precio, autorizan una excepción, abren un acceso o aprueban un monto se escriben contra la lista de decisiones que la gerencia se reservó. Si un paso le entrega a otro puesto algo que la gerencia maneja ella, el procedimiento no se puede ejecutar como está escrito y el que lo intente se va a chocar con el dueño.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "qué decisiones de precio, excepción, acceso y monto no se delegan a ningún puesto" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [8, 10],
        si_falta: "La última vez que un cliente pidió algo fuera de lo de siempre, ¿quién decidió?",
      },
      {
        clave: "cuando_sale_mal",
        titulo: "Qué se hace cuando sale mal",
        por_que:
          "Cada procedimiento cierra con cuatro datos: qué puesto avisa, a qué puesto o a qué número, en cuánto tiempo, y dónde queda anotada la falla. «Reportar al jefe inmediato» no es ninguno de los cuatro, y remitir a «los protocolos establecidos por la empresa» cuando esos protocolos no están escritos deja al trabajador solo justo el día que algo se rompió.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "procesos.sistemas" },
          { de: "organigrama" },
        ],
        cubre: [6],
        si_falta: "La última vez que ese trabajo salió mal, ¿a quién le avisaron?",
      },
      {
        clave: "lo_que_cambia_por_sede",
        titulo: "Lo que cambia de un local a otro, escrito por local",
        por_que:
          "Una sola línea no puede servir para locales que abren a horas distintas, manejan montos distintos o tienen a otra persona abriendo y cerrando. Van por local: horario, monto mínimo de efectivo, quién abre, quién cierra y quién custodia.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "hora de apertura y cierre, monto mínimo de efectivo, y quién abre, cierra y custodia en cada sede" },
          { de: "decision_gerencia", sobre: "en qué sede este trabajo se hace distinto y por qué" },
        ],
        cubre: [11],
        si_falta: "¿En cuál de tus tiendas se hace ese trabajo distinto que en las otras?",
      },
      {
        clave: "estado_de_cada_paso",
        titulo: "Lo confirmado y lo propuesto, distinguidos a simple vista",
        por_que:
          "Un paso que salió de nuestra cabeza y no de la boca de quien lo ejecuta va marcado como propuesta o pendiente de firma. Si el documento entero suena igual de firme de principio a fin, el dueño no puede saber qué está describiendo su empresa y qué le estamos proponiendo, y acaba firmando las dos cosas sin distinguirlas.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "quién confirmó cada paso y en qué fecha lo confirmó" },
          { de: "procesos" },
        ],
        cubre: [7],
        si_falta: "¿Quién hace hoy ese trabajo con sus propias manos?",
      },
      {
        clave: "version_mejorada",
        titulo: "La versión mejorada de uno a tres procesos",
        por_que:
          "Un proceso solo descrito no mejora nada, y una lista donde todos traen versión mejorada no es una intervención: es una lista de deseos. Van de uno a tres, y cada versión mejorada dice qué paso se quita o se junta, qué número debe moverse, cuánto vale hoy ese número y a cuánto debe llegar. El tope de tres es del método: tres frentes abiertos a la vez es lo que una empresa chica puede sostener sin dejar de operar.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "procesos.indicadores" },
          { de: "decision_gerencia", sobre: "cuál de estos procesos se interviene primero" },
        ],
        cubre: [13],
        si_falta: "¿Qué problema de ese trabajo se repite tanto que ya les parece normal?",
      },
      {
        clave: "constancia_de_que_se_enseno",
        titulo: "Constancia de que el procedimiento fue enseñado y recibido",
        por_que:
          "Un procedimiento que nadie firmó no se le puede exigir a nadie. Al final va el bloque con nombre, documento de identidad, fecha y firma de quien lo va a ejecutar; y en los procedimientos que mueven dinero o datos del cliente, además el espacio de la evaluación que se tomó y su resultado.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.onboarding" },
          { de: "organigrama" },
        ],
        cubre: [14],
        si_falta: "La última persona que aprendió ese trabajo, ¿quién le enseñó?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Lo que sale de la entrega hasta que responda el asesor",
        por_que:
          "Dos cosas se marcan y salen: los pasos que ordenan cobrarle o descontarle algo al trabajador —faltantes, pérdidas, responsabilidad del mismo— y todo monto, umbral o plazo que parezca exigido por una norma. Mientras quede uno sin marcar, el documento no se entrega como definitivo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "los pasos que ponen un faltante o un descuento a cargo del trabajador, y los montos, umbrales y plazos que parecen exigidos por una norma" },
        ],
        cubre: [12],
        si_falta: "¿Qué pasa hoy con el dinero cuando al cerrar la caja falta?",
      },
      {
        clave: "hoja_de_pared",
        titulo: "La hoja que se pega al lado del puesto",
        por_que:
          "Lo que el trabajador necesita no es el capítulo del manual: es una cara, pasos numerados, en imperativo, con los números y topes que usa. Sin diagnóstico, sin justificación y sin la palabra «alcance». Si la hoja tiene dos caras, no se va a leer de pie.",
        obligatoria: false,
        de_donde_sale: [
          { de: "procesos" },
          { de: "activo", clave: "procesos.procedimientos" },
        ],
        cubre: [15],
        si_falta: "En el puesto donde se hace ese trabajo, ¿qué hay hoy pegado en la pared?",
      },
      {
        clave: "trato_al_cliente",
        titulo: "Los pasos de trato al cliente, tomados del protocolo de la casa",
        por_que:
          "Donde hay un cliente al frente, los pasos de atención son los del protocolo de la casa, con sus mismos nombres y en el mismo orden. Si cada proceso inventa su forma de saludar, explicar y despedir, la empresa tiene tantas formas de atender como documentos.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "producto.entrega" },
        ],
        cubre: [16],
        si_falta: "¿Qué es lo primero que le dice tu gente al cliente que entra?",
      },
    ],
    nunca_lleva: [
      "Pasos que empiezan con «velar por», «coordinar», «asegurar» o «apoyar en»: no dicen qué hace la persona con las manos.",
      "El mismo paso repetido con sinónimos en procesos vecinos, para que la lista parezca más completa.",
      "Nombres de proceso que son nombres de área —«Proceso de administración»— en vez de un trabajo con inicio y fin.",
      "Diagramas de flujo vistosos sin un solo dato de tiempo, de sistema ni de responsable.",
      "Secciones de «objetivo», «alcance» y «marco normativo» de dos páginas, con el procedimiento en media página.",
      "Todos los procesos escritos con el mismo nivel de detalle: eso es plantilla llenada, no levantamiento.",
      "Verbos sin número: «rápidamente», «de forma oportuna», «en el menor tiempo posible».",
      "Los valores de la empresa pegados al encabezado de cada proceso sin que cambien un solo paso.",
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // REGLAMENTO. El documento donde una cláusula inventada se vuelve un problema que paga la
  // empresa. Por eso la plantilla separa en dos lo que normalmente va mezclado: lo que la casa ya
  // decidió (conductas, horarios, obligaciones) y lo que no resuelve nadie más que el asesor
  // (faltantes, descuentos, registro ante la autoridad). Lo segundo va en anexo, con fecha y estado.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  reglamento: {
    clave: "reglamento",
    nombre: "Reglamento Interno de Trabajo",
    para_quien:
      "Lo lee el trabajador el día que entra y lo firma; lo aplican la Gerencia y el jefe inmediato; lo revisa el asesor legal antes de entregarse. El cuerpo que el trabajador lee no pasa de doce páginas; con anexos, veinticinco.",
    exigencias_que_tenia_la_vara: 16,
    secciones: [
      {
        clave: "alcance_y_personas",
        titulo: "A qué empresa, a qué locales y a qué personas se aplica",
        por_que:
          "Un reglamento que dice «la empresa» sin nombrarla no se puede aplicar a nadie. Va la razón social y el número de RUC de cada empresa que emplea, la lista de locales, y adjunta la relación de personal local por local. Y todo puesto, área o local que el reglamento nombre —sobre todo los que autorizan, aprueban o sancionan— existe con el mismo nombre en el organigrama y en el manual de funciones: si manda, tiene ficha.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "razón social, número de RUC y locales de cada empresa que emplea, y la relación de personal por local" },
          { de: "organigrama" },
        ],
        cubre: [2, 13],
        si_falta: "¿Con qué razón social está en planilla cada una de las personas que trabajan contigo?",
      },
      {
        clave: "conductas_no_negociables",
        titulo: "Las conductas que aquí no van",
        por_que:
          "Las conductas no negociables del reglamento son las mismas del manual de identidad vigente, con la misma exigencia: si el reglamento ablanda una, la empresa termina con dos documentos que permiten cosas distintas y el trabajador elige el que le conviene. Y el reglamento se fecha después del manual de identidad, para que lo recoja.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.cultura" },
        ],
        cubre: [3],
        si_falta: "¿Qué hizo alguien de tu equipo que te hizo decir «esto aquí no va»?",
      },
      {
        clave: "horario_por_sede",
        titulo: "Jornada y horario, local por local",
        por_que:
          "Un horario único para toda la empresa es un horario que no es el de ningún local. Va una fila por local con hora de entrada, de salida y de refrigerio, y el personal de seguridad con la suya, y cada fila coincide con la hora a la que ese local abre y cierra hoy. Es el artículo que más se usa y el que más rápido deja al documento sin valor cuando no corresponde a la realidad.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "hora de entrada, de salida y de refrigerio de cada local, y la del personal de seguridad" },
          { de: "decision_gerencia", sobre: "el horario que rige en cada local y desde qué día rige" },
        ],
        cubre: [7],
        si_falta: "¿A qué hora entró y a qué hora salió ayer la gente de cada una de tus tiendas?",
      },
      {
        clave: "obligaciones_del_trabajador",
        titulo: "Las obligaciones, cada una una sola vez y con dónde se comprueba",
        por_que:
          "Dos artículos que un trabajador leería como la misma regla son una sola regla escrita dos veces: diluyen la obligación y hacen el documento más largo de lo que nadie va a leer. Cada obligación entra una vez y dice dónde queda el registro de su cumplimiento —el control de asistencia, un acta, un formato, un libro—, porque «cumplir el horario» sin decir dónde se comprueba no se puede exigir ni defender.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.reglamento" },
          { de: "activo", clave: "procesos.controles" },
          { de: "procesos" },
        ],
        cubre: [12, 14],
        si_falta: "¿Qué reglas ya existen en tu empresa aunque nadie las haya escrito?",
      },
      {
        clave: "faltas_segun_si_se_le_enseno",
        titulo: "Las faltas separadas por si la persona conocía el procedimiento",
        por_que:
          "Graduar solo en leve, grave y muy grave castiga igual al que se equivocó sin querer y al que sabía y decidió saltarse la regla. Van las tres situaciones del estándar de la casa, cada una con su respuesta escrita y distinta de las otras dos: el error de quien tenía el procedimiento, la negligencia de quien lo conocía, y el incumplimiento a sabiendas. Y antes de aplicar cualquier sanción queda escrito si a la persona se le había enseñado el procedimiento y dónde consta esa enseñanza: si no consta, el caso no se sanciona, se corrige la inducción y se vuelve a enseñar. Esa es la regla que faltaba el día que una pérdida de caja terminó en un despido cuya causa documentada fue falta de capacitación.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.disciplina" },
          { de: "activo", clave: "personas.onboarding" },
          { de: "activo", clave: "personas.habilidades" },
        ],
        cubre: [4, 5],
        si_falta: "La última vez que alguien se equivocó sin querer, ¿qué hiciste?",
      },
      {
        clave: "procedimiento_de_sancion",
        titulo: "Cómo se sanciona: los cinco datos de cada sanción",
        por_que:
          "Cada sanción dice quién levanta el hecho, en qué plazo, quién decide, dónde queda registrado y cómo se le comunica al trabajador. «A criterio de la empresa», «según determine la empresa» y «según la gravedad» no son ninguno de los cinco: son el hueco por donde después se discute todo. Y antes de una sanción grave la persona da su versión por escrito, que es su derecho y además es lo que protege a la empresa.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.disciplina" },
          { de: "activo", clave: "procesos.sistemas" },
          { de: "organigrama" },
        ],
        cubre: [6],
        si_falta: "La última vez que llamaste la atención a alguien, ¿quedó algo escrito?",
      },
      {
        clave: "constancia_de_entrega",
        titulo: "Constancia de entrega firmada, una por persona",
        por_que:
          "Un reglamento sin constancia firmada es un reglamento que el trabajador puede decir que no conocía. El formato va como anexo, con casilleros de nombre, documento de identidad, fecha, versión del reglamento y firma, y el documento dice quién la recoge, en qué plazo desde el ingreso y dónde se archiva. La versión importa: sin ella no se puede saber qué reglas firmó cada uno. Y sin decir quién la recoge y dónde queda, el formato existe y las constancias no.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "afirmaciones", busca: "la relación de personal por local, con el documento de identidad de cada persona" },
        ],
        cubre: [1],
        si_falta: "De la gente que trabaja hoy contigo, ¿quiénes firmaron algo cuando entraron?",
      },
      {
        clave: "dinero_que_sale_del_sueldo",
        titulo: "Todo lo que toca el sueldo, marcado y pendiente de confirmación",
        por_que:
          "Es la parte del reglamento que más caro sale cuando se inventa. Cualquier cláusula que haga al trabajador asumir de su bolsillo un faltante, una pérdida o un daño va marcada para revisión legal y no se aplica hasta que haya respuesta por escrito. Y todo dinero que salga del sueldo —faltas, tardanzas, adelantos, multas— se escribe como pendiente de confirmación, sin monto, sin porcentaje y sin plazo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "el faltante de caja a cargo del trabajador y todo descuento, retención, adelanto o multa sobre el sueldo" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [8, 9],
        si_falta: "Cuando alguien llega tarde o falta un día, ¿qué pasa hoy con su sueldo?",
      },
      {
        clave: "registro_ante_la_autoridad",
        titulo: "Si corresponde registrarlo ante la autoridad de trabajo, y quién responde",
        por_que:
          "Si el documento no menciona el tema, nadie se hace cargo del trámite y la empresa se entera el día de una inspección. Va escrito que la consulta existe, quién responde por el trámite y en qué estado está, aunque la respuesta todavía no haya llegado: pendiente es un estado, el silencio no.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "si corresponde registrar o presentar el reglamento ante la autoridad de trabajo" },
          { de: "organigrama" },
        ],
        cubre: [10],
        si_falta: "¿Quién de tu equipo lleva hoy los trámites de la empresa ante el Estado?",
      },
      {
        clave: "anexo_de_preguntas_al_asesor",
        titulo: "Anexo: las preguntas abiertas al asesor legal",
        por_que:
          "Cada pregunta con la fecha en que se preguntó, quién debe responder y su estado. El anexo es lo que separa un documento honesto de uno que afirma cosas que nadie verificó: mientras una pregunta esté abierta se ve que está abierta, y lo que depende de ella no se aplica.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "cada pregunta abierta, con la fecha en que se preguntó, quién debe responder y su estado" },
        ],
        cubre: [11],
        si_falta: "¿A quién le consultas hoy los temas laborales de la empresa?",
      },
      {
        clave: "como_se_ensena_el_reglamento",
        titulo: "Cómo se enseña antes de firmarlo",
        por_que:
          "Un reglamento que se entrega para leer y firmar el mismo día no se leyó. Va escrito quién lo explica, en qué momento del ingreso, y cómo se comprueba que el trabajador lo entendió antes de firmar.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.onboarding" },
          { de: "organigrama" },
        ],
        cubre: [15],
        si_falta: "La última persona que entró, ¿quién le explicó las reglas de la casa?",
      },
      {
        clave: "solo_lo_que_esta_casa_tiene",
        titulo: "Solo capítulos de cosas que esta empresa tiene",
        por_que:
          "Un capítulo sobre comedor, vestuarios, uniformes, vehículos o turnos rotativos en una empresa que no tiene nada de eso es la señal de que el documento se armó desde una plantilla ajena y no desde esta casa. Cada capítulo regula algo que existe hoy en alguno de los locales, o no entra.",
        obligatoria: false,
        de_donde_sale: [
          { de: "afirmaciones", busca: "qué tiene cada local: comedor, vestuario, uniforme, vehículo, turnos" },
          { de: "procesos" },
        ],
        cubre: [16],
        si_falta: "En cada una de tus tiendas, ¿qué le da la empresa al trabajador para hacer su trabajo?",
      },
    ],
    nunca_lleva: [
      "Dos o tres artículos que un trabajador leería como la misma regla, separados por diez páginas.",
      "Una lista larga de prohibiciones donde varias son la misma cosa partida en pedazos.",
      "Adjetivos en lugar de conductas: «el trabajador debe ser responsable, proactivo y leal».",
      "Párrafos que recitan la ley y no dicen qué hace esta empresa ni quién responde.",
      "Cierres como «de acuerdo a las normas vigentes» o «conforme al procedimiento interno» cuando ese procedimiento no existe por escrito.",
      "Un primer capítulo sobre el objeto, el ámbito y la filosofía del reglamento, que no obliga a nadie a nada.",
      "Capítulos sobre materias que la casa no tiene: señal de plantilla ajena y no de esta empresa.",
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // ESTRATEGIA. La plantilla pone la línea base PRIMERO y no al final, que es donde suele faltar:
  // sin la foto fechada de los números del día en que arranca, la pregunta «¿funcionó?» no tiene
  // respuesta y el plan se juzga por sensación. Y el FODA solo entra si cada ítem termina en una
  // decisión: cuatro listas sin cruce son relleno con forma de análisis.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  estrategia: {
    clave: "estrategia",
    nombre: "Plan Estratégico y análisis de la organización",
    para_quien:
      "Lo lee el dueño o la gerencia y lo usa el responsable de cada prioridad. El plan completo no pasa de quince a veinte páginas, y lleva además una sola hoja con las prioridades, su responsable, su fecha y su número: esa hoja es la que se mira en cada revisión.",
    exigencias_que_tenia_la_vara: 20,
    secciones: [
      {
        clave: "linea_base_de_los_numeros",
        titulo: "La foto fechada de los números del día en que arranca",
        por_que:
          "Es la sección que permite responder «¿funcionó?» con un número en vez de una sensación. Va una tabla con fecha y los números del negocio al inicio —venta del mes, ganancia del mes, caja de hoy, gasto fijo, precio y costo de lo principal, de cada diez interesados cuántos compran, lo que deben los clientes y lo que debe la empresa— y dice expresamente que esa foto es el punto de comparación. Cada cifra lleva su marca: medida si sale de un registro, contada si alguien la contó a mano y el conteo se puede repetir, estimada si es de memoria o es nuestro cálculo. Un número sin marca se lee como si fuera exacto.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "resultados.ventas" },
          { de: "activo", clave: "resultados.margen" },
          { de: "activo", clave: "marketing.resultados_comerciales" },
          { de: "activo", clave: "resultados.retencion" },
          { de: "activo", clave: "resultados.tiempos" },
        ],
        cubre: [10, 12],
        si_falta: "El mes pasado, ¿cuánto vendió el negocio?",
      },
      {
        clave: "de_donde_sale_cada_afirmacion",
        titulo: "De dónde salió cada afirmación, y cuándo",
        por_que:
          "Cada ítem del análisis cierra con su origen: quién lo dijo y en qué fecha, o qué documento o registro lo respalda. Sin eso no se distingue lo que alguien recordó de memoria de lo que está en un registro, y el plan entero se vuelve imposible de corregir: cuando un dato resulta falso, no se sabe qué más se cae con él.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "quién dijo cada cosa y en qué fecha, o el documento o registro que la respalda" },
        ],
        cubre: [3, 10],
        si_falta: "Eso que me acabas de decir, ¿lo viste en algún papel o en algún sistema?",
      },
      {
        clave: "foda_con_causa_y_uso",
        titulo: "FODA donde cada ítem termina en una decisión",
        por_que:
          "Cuatro listas sin cruce son relleno con forma de análisis. Cada fortaleza dice en qué cliente, producto, local o proceso se va a usar para que rinda más; cada debilidad dice qué la causa —falta una persona, falta una regla escrita, falta el dato, el dueño es el único que puede hacerlo—; y cada ítem de las cuatro cajas vuelve a aparecer, numerado, en al menos una decisión. Una fortaleza que es solo un adjetivo —«buen clima», «personal comprometido»— no se puede usar para nada.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "lo que la empresa hace mejor que el resto y lo que hoy no puede hacer, con quién lo dijo" },
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "marketing.cliente_ideal" },
          { de: "activo", clave: "producto.testimonios" },
        ],
        cubre: [1, 2],
        si_falta: "Tu último cliente, ¿qué te dijo cuando decidió comprarte a ti?",
      },
      {
        clave: "lo_poco_que_hace_ganar",
        titulo: "Lo poco que de verdad hace ganar al negocio, con la cuenta a la vista",
        por_que:
          "Una sola frase que nombre ese elemento —un producto, un tipo de cliente, un canal, una capacidad— y que nombre uno, no tres candidatos sin elegir: elegir es el trabajo. Debajo va la cuenta de qué parte del ingreso sale de ahí; esa cuenta no se puede exigir mientras no exista la foto de los números del arranque, pero desde el día en que la foto existe se exige, porque entonces los datos están y no hacerla sería pereza. Y si el documento habla de margen o de rentabilidad, va la lista de los costos que entraron en la cuenta —compra, personal, alquiler, comisiones, transporte, merma, impuestos— y dice cuál quedó fuera. Un margen sin su lista de costos es un número que nadie puede repetir.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "producto.catalogo" },
          { de: "activo", clave: "resultados.margen" },
          { de: "activo", clave: "marketing.resultados_comerciales" },
        ],
        cubre: [5, 6, 11],
        si_falta: "Para tener listo lo que más vendes, ¿qué pagas? Dímelo parte por parte.",
      },
      {
        clave: "lo_que_limita_el_resultado",
        titulo: "Qué limita hoy el resultado",
        por_que:
          "El plan nombra qué es lo que hoy pone el techo —una persona, la caja, un equipo, un permiso, la falta de clientes— y al menos una prioridad ataca justo eso. Un plan que mejora cinco cosas y no toca el límite no mueve el resultado: la empresa trabaja más y gana lo mismo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "producto.entrega" },
          { de: "activo", clave: "resultados.tiempos" },
          { de: "activo", clave: "marketing.canales" },
        ],
        cubre: [7],
        si_falta: "El mes pasado, ¿qué venta se te cayó porque no alcanzaste a atenderla?",
      },
      {
        clave: "prioridades_del_plan",
        titulo: "Las prioridades, de tres a cinco, y qué cambia cada una",
        por_que:
          "Más de cinco frentes abiertos al mismo tiempo no se sostienen, aunque todos sean buenos; el resto va en una lista aparte de «después», con su fecha de revisión. Cada prioridad aterriza en algo con nombre propio: el manual de funciones, el organigrama, el protocolo de atención, el proceso de cierre de caja, el perfil de un puesto. Una prioridad que no toca nada con nombre no se puede empezar ni terminar. Y ninguna le entrega a un puesto una atribución que el dueño se reservó: si el plan le da el precio al administrador cuando el precio lo manda la Gerencia, el plan no se va a poder ejecutar y nadie va a saber por qué.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "qué pocas cosas va a atacar la empresa este año, en qué orden, y qué decisiones no delega" },
          { de: "activo", clave: "direccion.estrategia" },
          { de: "activo", clave: "direccion.plan_empresarial" },
        ],
        cubre: [4, 15, 16],
        si_falta: "¿Qué decidiste que la empresa va a hacer este año y no hizo el año pasado?",
      },
      {
        clave: "cada_prioridad_con_dueno_y_dos_fechas",
        titulo: "Cada prioridad con su responsable y sus dos fechas",
        por_que:
          "Por prioridad: el nombre de la persona y su puesto, y dos fechas distintas —cuándo queda instalada y cuándo se mide su resultado—, más la señal que dirá si se logró, con su unidad y de dónde se lee ese número. Una sola fecha promete el cambio y el resultado el mismo día, que es lo que hace que todo plan parezca atrasado. «Todos», «el equipo», «el área» y «permanente» no son responsables ni fechas.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "procesos.indicadores" },
          { de: "decision_gerencia", sobre: "quién responde por cada prioridad, para qué día queda instalada y qué día se mide" },
        ],
        cubre: [8, 9, 13, 15],
        si_falta: "De las personas que trabajan contigo, ¿quién va a responder por esto?",
      },
      {
        clave: "metas_en_rango_con_supuestos",
        titulo: "Metas en rango, con sus supuestos escritos",
        por_que:
          "Una meta en punto exacto se incumple siempre; una en rango con supuestos numerados se puede discutir y corregir. Y el documento no garantiza ningún resultado económico: «garantizamos», «aseguramos» y «se duplicará» no entran, porque lo que la consultora controla es el trabajo, no el mercado.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "resultados.ventas" },
          { de: "activo", clave: "marketing.resultados_comerciales" },
          { de: "activo", clave: "procesos.indicadores" },
        ],
        cubre: [10, 14],
        si_falta: "En tu mejor mes del año y en tu peor mes, ¿cuánto vendiste?",
      },
      {
        clave: "identidad_copiada_del_manual",
        titulo: "El propósito, la misión, la visión y los valores, copiados del manual vigente",
        por_que:
          "Si el plan vuelve a redactar quién es la empresa, la casa termina con dos versiones de su propia identidad y nadie sabe cuál manda. El propósito, la misión, la visión, los pilares y los valores van copiados palabra por palabra del manual de identidad vigente, con su versión y su fecha: el plan usa la identidad, no la reescribe. Y si ese manual todavía no existe, el plan lo dice y no lo inventa.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.mvv" },
        ],
        cubre: [17],
        si_falta: "¿En qué documento está escrito hoy para qué existe tu empresa?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Las prioridades que cierran en asesoría legal",
        por_que:
          "Toda prioridad que toque contratos, sueldos, jornada, descuentos al trabajador, apertura de local o publicidad de precios cierra diciendo que falta confirmarla con asesoría legal. Y el plan no afirma plazos, montos, porcentajes ni artículos de ley: si inventa uno, la empresa actúa sobre una cifra que nadie verificó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "las prioridades que tocan contratos, sueldos, jornada, descuentos al trabajador, apertura de local o publicidad de precios" },
        ],
        cubre: [18],
        si_falta: "De lo que quieres hacer este año, ¿qué toca contratos, sueldos o la apertura de un local?",
      },
      {
        clave: "lo_que_se_deja_de_hacer",
        titulo: "Lo que se deja de hacer, con fecha de corte",
        por_que:
          "Un plan que solo suma actividades le pide a la misma gente que haga todo lo de antes más lo nuevo, y lo nuevo es lo que no se hace. Va la lista de lo que se elimina o se reduce —un reporte que nadie usa, un producto que resta, una reunión, un paso del proceso— cada uno con el día en que se deja de hacer.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "producto.catalogo" },
          { de: "decision_gerencia", sobre: "qué deja de hacer la empresa y desde qué día" },
        ],
        cubre: [19],
        si_falta: "¿Qué has decidido no hacer aunque parezca negocio?",
      },
      {
        clave: "la_revision_del_plan",
        titulo: "Cuándo se revisa el plan y qué pasa si algo se atrasa dos veces",
        por_que:
          "El día y la hora fija de la revisión, quién la dirige, qué se mira, y la regla escrita para el atraso repetido: se cambia el responsable, se recorta el alcance o se baja la prioridad. «Se hará seguimiento» es la frase con la que mueren los planes.",
        obligatoria: false,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "procesos.indicadores" },
          { de: "decision_gerencia", sobre: "el día y la hora fija de la revisión y quién la dirige" },
        ],
        cubre: [20],
        si_falta: "¿Qué día y a qué hora de la semana te sientas a ver los números del negocio?",
      },
    ],
    nunca_lleva: [
      "Páginas que explican qué es un FODA y para qué sirve la planificación estratégica: eso es teoría, no análisis de esta empresa.",
      "Tres páginas seguidas sin una fecha, sin un nombre de persona y sin una cifra.",
      "Misión y visión con las palabras «líder», «referente» y «excelencia», y ninguna conducta que las aterrice.",
      "Cuadros perfectamente simétricos: cinco fortalezas, cinco debilidades, cinco oportunidades, cinco amenazas.",
      "Gráficos sin la tabla de datos ni la fuente que los origina.",
      "Oportunidades y amenazas copiadas del contexto del país, sin un dato de esta empresa ni un competidor con nombre.",
      "Objetivos que empiezan con «optimizar», «fortalecer», «potenciar» o «promover»: no se pueden terminar ni verificar.",
      "El mismo párrafo repetido con sinónimos para llenar la página del área que no se levantó.",
    ],
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────
  // ATENCIÓN. Dos lectores y dos largos, y la plantilla lo declara en la primera sección porque a
  // la primera empresa cliente ya le dijeron que su manual era muy largo: un manual de cuarenta páginas para un cajero no
  // se lee. El protocolo de seis pasos es el que ya está vigente en la casa; la plantilla no inventa
  // una segunda secuencia.
  // ───────────────────────────────────────────────────────────────────────────────────────────
  atencion: {
    clave: "atencion",
    nombre: "Manual de Atención al Cliente",
    para_quien:
      "Dos lectores y dos largos, declarados en la primera página. Si va dirigido al trabajador de ventanilla, la parte que él usa va al principio, en cuatro caras como máximo, y todo lo demás como anexo. El del administrador y la consultora: el criterio completo con sus anexos, hasta unas quince páginas.",
    exigencias_que_tenia_la_vara: 17,
    secciones: [
      {
        clave: "para_quien_es_y_en_cuantas_caras",
        titulo: "Primera página: a quién va dirigido este documento",
        por_que:
          "Si no dice a quién va dirigido, se le entrega al cajero la versión larga y no se lee: ya pasó, y a esta casa ya le dijeron que su manual era muy largo. La primera página nombra al lector; y cuando el lector es el trabajador de ventanilla, la parte que él usa va al principio, en cuatro caras como máximo, y el resto queda como anexo para el administrador.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "procesos" },
        ],
        cubre: [1],
        si_falta: "¿Quién de tu gente atiende al cliente de frente?",
      },
      {
        clave: "los_seis_pasos_de_la_casa",
        titulo: "Los seis pasos del protocolo vigente, con lo que se hace y lo que se dice",
        por_que:
          "Se usan los seis pasos que ya están vigentes en la empresa, con sus mismos nombres y en el mismo orden, y no se propone una segunda secuencia distinta: dos protocolos es ninguno. Cada paso trae al menos un verbo de acción que se ve desde la puerta —saluda y dice el nombre de la empresa, repite en voz alta el monto, cuenta el efectivo delante del cliente, entrega el comprobante— y, donde corresponde, la frase textual que se dice. Lo que el trabajador debe sentir no es un paso: «ser amable» y «generar confianza» no se pueden ejecutar ni verificar. Y cada paso termina en algo que queda: una frase dicha al cliente, un papel firmado, un comprobante entregado o una anotación en un registro con nombre. Un paso que no deja nada no se puede supervisar ni al día siguiente.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "producto.entrega" },
          { de: "procesos" },
        ],
        cubre: [2, 3, 14],
        si_falta: "Ayer, cuando entró un cliente, ¿qué es lo primero que hizo tu gente?",
      },
      {
        clave: "una_rama_por_tipo_de_cliente",
        titulo: "Una rama por cada cosa que la gente viene a pedir",
        por_que:
          "Cada servicio que la empresa atiende hoy en ventanilla tiene su rama: qué se le pregunta al cliente, qué se le dice y qué se hace. Y el caso que todavía no tiene procedimiento se declara con esas palabras —no tiene procedimiento escrito— y dice a quién se llama mientras no lo tenga. Una rama que no está ni declarada deja al trabajador improvisando delante del cliente.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "producto.catalogo" },
          { de: "activo", clave: "marketing.cliente_ideal" },
          { de: "procesos" },
        ],
        cubre: [4],
        si_falta: "¿Qué cosas distintas viene a pedir la gente a tu ventanilla? Dímelas una por una.",
      },
      {
        clave: "hasta_donde_decide_el_que_atiende",
        titulo: "Hasta dónde decide el que atiende, y quién autoriza lo demás",
        por_que:
          "Cada excepción —precio preferencial, billete deteriorado, devolución o anulación, operación por encima de lo permitido— nombra el puesto que autoriza. Donde la regla todavía no existe, el texto dice que no está definida y qué se hace mientras tanto, en lugar de poner un porcentaje o un monto que nadie decidió. Y ninguna frase del manual le da al trabajador una facultad que la Gerencia se reservó: si se la da, el trabajador la usa una vez y se choca con el dueño.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "qué decisiones de precio, excepción y devolución no se delegan a quien atiende, y qué puesto autoriza cada una" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [6, 7],
        si_falta: "La última vez que un cliente pidió un precio especial, ¿quién dijo que sí?",
      },
      {
        clave: "cuando_el_cliente_reclama",
        titulo: "Qué se hace cuando el cliente reclama",
        por_que:
          "Tres datos: el nombre del registro donde queda anotado el reclamo, el puesto que responde y el puesto que cierra el caso. Decir que el reclamo «se atiende con calma y se escala al superior» deja el caso sin dueño, y el cliente lo nota. Y si todavía no está decidido si la empresa lleva un libro de reclamaciones, el manual lo dice con esas palabras y escribe mientras tanto dónde se anota: un cuaderno con fecha, local y nombre de quien atendió. Un reclamo sin dónde anotarse se pierde, y con él la única información gratis que da un cliente molesto.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "producto.reclamos" },
          { de: "activo", clave: "procesos.sistemas" },
          { de: "organigrama" },
        ],
        cubre: [5],
        si_falta: "¿Cuál fue el último reclamo de un cliente y dónde quedó apuntado?",
      },
      {
        clave: "lo_que_cambia_por_sede",
        titulo: "Lo que cambia de un local a otro, escrito por local",
        por_que:
          "Horario de atención, hora de cierre, cobertura de seguridad y hora del corte de caja van por local, con el nombre del local al lado. Un solo horario para toda la empresa cuando los locales abren y cierran a horas distintas convierte el manual en algo que nadie puede cumplir.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "horario de atención, hora de cierre, cobertura de seguridad y hora del corte de caja de cada local" },
        ],
        cubre: [8],
        si_falta: "¿A qué hora atiende cada una de tus tiendas?",
      },
      {
        clave: "cuando_se_cae_el_sistema",
        titulo: "Qué se hace cuando se cae el sistema o el internet",
        por_que:
          "Tres cosas: hasta cuánto se puede operar sin sistema —el monto que firma la Gerencia, no uno que proponga la consultora—, en qué papel se anota la operación y con qué datos, y la frase que se le dice al cliente que no puede ser atendido. Sin eso, cada caída se resuelve distinto y alguna se resuelve mal.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.sistemas" },
          { de: "activo", clave: "procesos.incidencias" },
          { de: "decision_gerencia", sobre: "hasta cuánto se puede operar sin sistema y quién lo autoriza" },
        ],
        cubre: [9],
        si_falta: "La última vez que se cayó el internet o el sistema, ¿qué hicieron con los clientes que estaban esperando?",
      },
      {
        clave: "ficha_de_observacion",
        titulo: "Anexo: la ficha de observación que la empresa ya usa",
        por_que:
          "La ficha no se diseña de nuevo: se usa la que la empresa ya tiene, con sus mismos casilleros, su puntaje y su semáforo verde, amarillo y rojo, sin quitarle ni renombrarle ninguno. Lo único que se agrega es una columna, la de minutos. Cambiarle los casilleros obliga a la empresa a aprender un formato nuevo y tira lo poco que ya estaba funcionando: lo que el cliente entrega es materia prima, no borrador. Y la ficha trae los tres puestos: quién observa, cada cuánto, y quién firma que la persona ya atiende así. Es la única forma de saber si el manual se aplica o solo se entregó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.evaluacion" },
          { de: "activo", clave: "producto.calidad" },
          { de: "organigrama" },
        ],
        cubre: [10],
        si_falta: "¿Quién mira hoy cómo atiende tu gente?",
      },
      {
        clave: "el_numero_que_dice_si_se_aplica",
        titulo: "Con qué número se sabrá si el manual se aplica",
        por_que:
          "Al menos un indicador con sus cuatro datos: nombre, de dónde sale, cada cuánto se lee y qué puesto lo lee. Y el valor de hoy, aunque sea cero: si no se ha observado a nadie todavía, el manual lo dice con el número. Un indicador sin fuente ni responsable no se lee nunca.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "producto.reclamos" },
          { de: "activo", clave: "resultados.tiempos" },
        ],
        cubre: [11],
        si_falta: "El mes pasado, ¿cuántos reclamos llegaron?",
      },
      {
        clave: "lo_que_nunca_es_aceptable",
        titulo: "Lo que nunca es aceptable en la atención",
        por_que:
          "Una lista corta, y cada línea una conducta que se puede ver: atender sin contar el efectivo delante del cliente, entregar sin comprobante, discutir el precio con el cliente, anotar sus datos donde no corresponde. Valores negados en abstracto —«falta de respeto», «mala actitud»— no se pueden señalar el día que ocurren.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.cultura" },
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "producto.reclamos" },
        ],
        cubre: [12],
        si_falta: "¿Qué hizo alguna vez alguien atendiendo que no quieres que vuelva a pasar?",
      },
      {
        clave: "tabla_de_obligaciones",
        titulo: "Tabla final de obligaciones: una fila por obligación",
        por_que:
          "Es el anexo que hace imposible escribir la misma obligación dos veces y mandar algo que no esté declarado. Una fila por obligación, con el número de la sección donde está escrita: si una obligación aparece en dos filas, sobra una; y si una sección manda algo que no está en la tabla, eso no se le puede exigir a nadie. También es lo que permite revisar el manual sin volver a leerlo entero, que es lo que hace que un manual se mantenga en vez de envejecer.",
        obligatoria: true,
        de_donde_sale: [
          { de: "procesos" },
          { de: "activo", clave: "procesos.procedimientos" },
        ],
        cubre: [13],
        si_falta: "¿Qué cosas le exiges hoy a tu gente de ventanilla que tienen que hacer sin falta?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Lo que se confirma con el asesor antes de entregar",
        por_que:
          "Dos puntos van marcados: si la empresa debe llevar un registro oficial de reclamos, y qué datos del cliente puede pedir, anotar y conservar en cada formato anexo, con quién los custodia. Los datos del cliente son de lo poco que una empresa chica puede hacer mal sin darse cuenta y caro.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "si corresponde llevar un registro oficial de reclamos, y qué datos del cliente se pueden pedir, anotar y conservar" },
        ],
        cubre: [15],
        si_falta: "¿Qué datos le pides al cliente cuando hace una operación y dónde quedan guardados?",
      },
      {
        clave: "tiempo_de_la_operacion",
        titulo: "Cuánto debería tomar, y de dónde salió ese tiempo",
        por_que:
          "Cada paso con su tiempo, o la operación completa con el suyo en minutos, y al lado su origen: medido con reloj, con fecha y local, o marcado por medir. Un tiempo que solo repite lo que alguien recuerda se usa después como si fuera medido.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "resultados.tiempos" },
          { de: "procesos" },
        ],
        cubre: [16],
        si_falta: "Tu último cliente, ¿en qué momento tuvo que esperar?",
      },
      {
        clave: "antes_de_entrar_y_al_salir",
        titulo: "Antes de entrar, la espera, la salida y lo que se lleva",
        por_que:
          "Un manual que empieza cuando el cliente ya está frente al cajero y termina cuando recibe el dinero deja fuera la mitad de lo que el cliente recuerda. Van los pasos de quién recibe, qué se le dice al que espera, cuánto se espera como máximo, la despedida, y qué se lleva el cliente en la mano.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "producto.entrega" },
          { de: "activo", clave: "producto.testimonios" },
          { de: "procesos" },
        ],
        cubre: [17],
        si_falta: "¿Qué se lleva en la mano el cliente cuando sale de tu tienda?",
      },
    ],
    nunca_lleva: [
      "Capítulos de introducción, misión, visión y filosofía de servicio antes del primer paso de atención.",
      "La misma obligación escrita en dos o tres lugares con palabras distintas.",
      "Listas de cualidades del buen servicio —empatía, proactividad, vocación— sin una conducta observable al lado.",
      "Pasos que no cambian nada: «mantener una postura adecuada», «proyectar profesionalismo».",
      "Teoría de atención al cliente copiada de un curso: tipos de cliente por carácter, pirámides de necesidades.",
      "Frases como «según las mejores prácticas internacionales» o «de acuerdo a la normativa vigente» sin decir cuál.",
      "Anexos vacíos: la ficha de observación anunciada en el índice y que no está, o un formato sin campos.",
      "Simetría sospechosa: diez principios, diez compromisos, diez prohibiciones, todos del mismo largo.",
      "Indicadores sin fuente ni responsable: «nivel de satisfacción del cliente» sin decir de dónde sale el número.",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // LAS PLANTILLAS DE LAS DIEZ VARAS NUEVAS
  //
  // Escritas el 19-10-2026, después de medir la biblioteca completa del primer cliente: de 23
  // mediciones, 15 salieron nulas porque el revisor devolvió «este documento no es del tipo que
  // esta vara mide». No eran documentos malos: eran tipos de documento sin vara. Cada una de las
  // que siguen se escribió contra el documento real que la destapó, por un agente con su
  // refutador adversarial detrás, igual que las seis de arriba.
  //
  // VAN AL FINAL A PROPÓSITO. En las plantillas, `cubre` guarda la posición de la exigencia
  // dentro de su vara: insertar algo en medio correría esos números en silencio.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  capacitacion: {
    clave: "capacitacion",
    nombre: "Plan de capacitación e implementación de un estándar",
    para_quien:
      "La aprueba la Gerencia, la ejecuta el puesto que dicta las sesiones y la recibe cada trabajador el día que firma su constancia. Cuerpo de doce a veinte páginas, el cronograma en una sola cara para pegarlo en cada local, y los formatos aparte: asistencia, prueba con su clave, ficha de observación, constancia y reporte diario, uno por hoja.",
    exigencias_que_tenia_la_vara: 16,
    secciones: [
      {
        clave: "aprobacion_y_vigencia",
        titulo: "Portada: quién aprueba el plan, qué día, y desde qué día se ejecuta",
        por_que:
          "Un plan sin aprobación firmada no obliga a nadie: el día que alguien no asista a una sesión, no hay decisión de la Gerencia detrás del reclamo. Y la fecha en que el documento se escribió no es la fecha en que se aprobó, ni la fecha en que empieza a ejecutarse. Van las tres escritas por separado, con el puesto que firma, porque son tres hechos distintos y se confunden todo el tiempo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "decision_gerencia", sobre: "qué puesto aprueba este plan, qué día lo aprueba y desde qué día empieza a ejecutarse en cada local" },
        ],
        cubre: [10],
        si_falta: "¿Qué día firmó la Gerencia el plan con el que se está capacitando hoy al personal?",
      },
      {
        clave: "que_se_ensena_y_de_donde_sale",
        titulo: "Lo que se enseña: una fila por conducta, con sus cuatro partes",
        por_que:
          "Cada valor, principio o estándar que se enseña entra con cuatro partes: qué significa, cómo se demuestra, qué conducta lo contradice y con qué se mide. La parte de lo que lo contradice es la que más se cae, y es justo la que quien dicta necesita para corregir en el momento: sin el contrario escrito, la corrección depende de lo que ese día le parezca a quien está enseñando. La lista de pilares, valores y principios se copia del manual aprobado y se cita su versión, porque una lista propia convierte la capacitación en un segundo estándar que compite con el primero.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.mvv" },
          { de: "activo", clave: "personas.cultura" },
          { de: "activo", clave: "personas.disciplina" },
        ],
        cubre: [11],
        si_falta: "¿Qué hizo alguien de tu equipo la semana pasada que te hizo decir «esto aquí no se hace así»?",
      },
      {
        clave: "lista_nominal_y_grupos",
        titulo: "Lista nominal: quién entra al plan, en qué local y en qué grupo",
        por_que:
          "Sin lista con nombres por local y por turno no se puede saber si faltó alguien, y entonces la cobertura se declara completa sin que nadie haya contado cabezas. Un negocio que atiende público no cierra para capacitar: siempre hay gente en ventanilla, de franco o de descanso médico. Por eso cada nombre sin sesión asignada se lleva al costado su fecha de reposición y el puesto que se la dicta, y el cuadro se arma por local, no por empresa: el total de la empresa es exactamente lo que permite que un local entero se quede afuera sin que se note.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
          { de: "afirmaciones", busca: "cuántas personas trabaja en cada local, en qué turno, quién está de descanso o de licencia esta semana y quién ingresó este mes" },
        ],
        cubre: [3, 14],
        si_falta: "¿Quiénes de tu equipo no estuvieron en el local la semana pasada, y por qué cada uno?",
      },
      {
        clave: "quien_dicta_y_quien_revisa",
        titulo: "Quién dicta cada sesión, qué lo acredita y quién revisa lo que él califica",
        por_que:
          "Un estándar enseñado por alguien a quien nadie acreditó se enseña en la versión que esa persona entendió sola, y es esa versión la que queda instalada en la empresa. Por eso cada sesión nombra el puesto que la dicta y pone al lado lo que acredita su dominio: la constancia del curso con su fecha, o el acta del puesto que lo evaluó. Y si quien dicta es también quien califica, aparece un segundo puesto que revisa una muestra de las pruebas ya calificadas: nadie tiene que ser mal intencionado para que las notas suban cuando el mismo documento le pide el número y le da el lápiz.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.habilidades" },
          { de: "activo", clave: "personas.meritos" },
          { de: "decision_gerencia", sobre: "qué puesto dicta cada sesión, qué puesto califica las pruebas y qué puesto revisa una muestra de lo ya calificado" },
        ],
        cubre: [1, 13],
        si_falta: "¿Quién le enseñó el estándar a la persona que va a dictar estas sesiones, y qué día?",
      },
      {
        clave: "cronograma_por_sesion",
        titulo: "Cronograma: una fila por sesión, con día, hora, duración y local",
        por_que:
          "Una sesión sin duración escrita se mete donde se pueda, se corta a la mitad cuando entra un cliente, y el tema que quedó sin terminar nadie lo retoma porque el cronograma ya pasó al día siguiente. Cada fila trae su día, su hora de inicio, cuánto dura y en qué local se dicta; y al costado, qué puesto queda atendiendo al público mientras la sesión ocurre. Ese último dato es el que hace que el plan sea ejecutable en un negocio que no puede cerrar la puerta para capacitar.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "hora de apertura y de cierre de cada local, hora de mayor afluencia y en qué momento del día hay menos clientes en ventanilla" },
          { de: "decision_gerencia", sobre: "en qué horario se dicta cada sesión y qué puesto queda atendiendo al público durante ese rato" },
        ],
        cubre: [4],
        si_falta: "¿En qué momento del día puedes sacar a una persona de la ventanilla sin cerrar el local?",
      },
      {
        clave: "registro_de_asistencia",
        titulo: "Hoja de asistencia por sesión, con las dos firmas",
        por_que:
          "Es la hoja que contesta la única pregunta que importa el día que alguien dice que no sabía: quién estuvo, qué día, a qué hora, en qué local y en qué grupo. Lleva el nombre del participante, su firma, y también la firma de quien dictó, porque una lista que firma solo el que enseña es una lista que se puede llenar después. La casilla de grupo existe porque el mismo tema se dicta varias veces cuando no se puede reunir a todos, y sin esa casilla no hay forma de saber en cuál de esas sesiones estuvo cada persona.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.onboarding" },
          { de: "afirmaciones", busca: "cómo se anota hoy quién asistió a una reunión o a una charla, quién guarda esa hoja y dónde queda archivada" },
        ],
        cubre: [2, 3],
        si_falta: "De la última charla que dieron al personal, ¿dónde quedó la hoja que firmaron los que asistieron?",
      },
      {
        clave: "comprobacion_por_tema",
        titulo: "Cómo se comprueba cada tema: el instrumento, quién califica y dónde queda",
        por_que:
          "Prometer que casi todos obtendrán la nota mínima de un día cuya prueba no está escrita es prometer el resultado de un instrumento que nadie redactó. Cada tema del cronograma cierra con tres cosas escritas: el instrumento mismo —el cuestionario con sus preguntas, la ficha de observación con sus casillas, la hoja de simulación con sus elementos—, el puesto que lo califica, y el lugar exacto donde queda el papel respondido. Sin el tercero, al mes siguiente no hay nada que revisar y la única prueba de que la gente entendió es el recuerdo de quien enseñó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.evaluacion" },
          { de: "activo", clave: "personas.habilidades" },
          { de: "activo", clave: "procesos.sistemas" },
        ],
        cubre: [5, 6],
        si_falta: "La última vez que evaluaron a alguien del equipo, ¿qué papel quedó firmado y dónde está guardado?",
      },
      {
        clave: "prueba_final_y_certificacion",
        titulo: "Prueba final con su clave de respuestas, y qué habilita la certificación",
        por_que:
          "Las preguntas van escritas una por una, con la respuesta que se considera correcta y el puntaje de cada una, y la nota mínima dicha en puntos y no solo en porcentaje. Sin clave, dos personas que califican la misma hoja ponen dos notas distintas, y la certificación se decide sobre una impresión con número encima. Y certificar tiene que habilitar algo concreto: la sección dice qué tareas ejecuta quien está certificado y no ejecuta quien todavía no lo está. Si la certificación no cambia nada de lo que la persona hace al día siguiente, la prueba fue un trámite.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.evaluacion" },
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "decision_gerencia", sobre: "qué tareas ejecuta quien está certificado, cuáles no ejecuta quien todavía no lo está, y qué puesto firma la certificación" },
        ],
        cubre: [6, 7],
        si_falta: "¿Qué tarea deja de hacer una persona del equipo mientras no demuestre que domina el estándar?",
      },
      {
        clave: "que_pasa_con_quien_no_alcanza",
        titulo: "La salida del que no alcanza el criterio",
        por_que:
          "«Recibirá reforzamiento hasta alcanzar el nivel» no es una salida: no dice quién lo refuerza, qué día se lo vuelve a evaluar, cuántos intentos hay ni qué pasa al agotarlos. Aquí van las cuatro cosas escritas, y la cuarta es la que de verdad cambia algo: qué tareas del puesto no ejecuta esa persona mientras no esté certificada. En un negocio que maneja dinero de terceros, una etiqueta sin consecuencia operativa significa que esa persona sigue atendiendo igual que la certificada.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.disciplina" },
          { de: "activo", clave: "personas.plan_personal" },
          { de: "decision_gerencia", sobre: "qué puesto vuelve a enseñar, cuándo se vuelve a evaluar, cuántos intentos hay y qué tareas se retiran mientras no se alcance el criterio" },
        ],
        cubre: [7],
        si_falta: "La última persona que no logró hacer bien una tarea de su puesto, ¿qué día volvieron a sentarse a enseñarle?",
      },
      {
        clave: "control_directo_de_gerencia",
        titulo: "El control que la Gerencia hace por su cuenta",
        por_que:
          "Es el único dato del plan que no viene filtrado por la misma persona a la que se está evaluando, y por eso vale más que todo el reporte diario junto. Va como paso con día fijado, con a cuántas personas de cada local se pregunta, con las preguntas escritas y con el papel donde queda anotado lo que cada persona respondió. Dicho como recomendación —«la Gerencia deberá realizar controles directos»— no ocurre; y si ocurre, no se puede comparar con lo que se escuchó la semana siguiente.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "decision_gerencia", sobre: "qué día de la semana la Gerencia pregunta por su cuenta, a cuántas personas de cada local y dónde anota lo que escuchó" },
        ],
        cubre: [12, 13],
        si_falta: "La última vez que le preguntaste algo del estándar a alguien del equipo sin avisarle, ¿qué te respondió?",
      },
      {
        clave: "linea_base_antes_de_empezar",
        titulo: "El número de antes: qué se lee el día previo al inicio",
        por_que:
          "Sin el número de antes, a los tres meses nadie puede responder si esto movió algo, y la discusión vuelve a ser quién opina qué. Esta sección se llena antes del primer día: cada número que el plan promete lleva al costado su valor de hoy, la fecha en que se leyó y el papel o la pantalla de donde se leyó. Cuando ese valor no existe, se escribe con esas palabras que hoy eso no se mide y qué registro habría que abrir: confesar el hueco es información útil y rellenarlo es una mentira que vuelve en tres meses.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "personas.evaluacion" },
          { de: "afirmaciones", busca: "qué número de hoy se puede leer antes del primer día de capacitación y en qué papel o pantalla se lee cada uno" },
        ],
        cubre: [9],
        si_falta: "Antes de esta capacitación, ¿qué número tienes anotado sobre cómo atiende tu equipo?",
      },
      {
        clave: "medicion_de_conducta_despues",
        titulo: "El corte de después: qué se mira en el puesto unas semanas más tarde",
        por_que:
          "Asistir, firmar y aprobar un examen son tres cosas que se pueden cumplir sin que nadie trabaje distinto. Esta sección es la que contesta la pregunta que la dueña va a hacer a las pocas semanas: si la gente atiende distinto. Trae al menos una medición de conducta en el puesto, con su fecha de corte posterior al último día del cronograma, el puesto que la ejecuta, qué se observa exactamente y dónde se anota el resultado. Y se compara contra el número de antes, no contra la impresión de quien dictó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "producto.reclamos" },
          { de: "activo", clave: "resultados.tiempos" },
          { de: "decision_gerencia", sobre: "a las cuántas semanas del cierre se vuelve a mirar la conducta en el puesto y qué puesto hace esa observación" },
        ],
        cubre: [8, 9],
        si_falta: "¿En qué papel o en qué pantalla se lee hoy si una atención salió bien o salió mal?",
      },
      {
        clave: "expediente_y_custodia",
        titulo: "El expediente: qué evidencia se junta, quién la guarda y dónde",
        por_que:
          "Una carpeta que nadie custodia es la carpeta que no se encuentra el día que alguien reclama que no fue capacitado. La sección lista la evidencia que se junta —hojas de asistencia, pruebas calificadas, fichas de observación, constancias firmadas, reportes diarios—, nombra el puesto que la custodia y el lugar físico o la carpeta del sistema donde queda. Y exige que cada formato se entregue con al menos un ejemplar llenado: un juego de formatos todos en blanco no permite saber si la implementación ocurrió ni qué día empezó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.sistemas" },
          { de: "activo", clave: "procesos.controles" },
          { de: "decision_gerencia", sobre: "qué puesto custodia el expediente de la capacitación, en qué lugar queda y quién puede abrirlo" },
        ],
        cubre: [2, 5, 10],
        si_falta: "¿Dónde está hoy la carpeta con las constancias que firmó tu equipo, y quién tiene la llave?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Lo que sale de la entrega hasta que responda el asesor",
        por_que:
          "Una consecuencia inventada en un documento que el trabajador firma la paga la empresa, no la consultora. Todo lo que toque la relación laboral o los datos personales va marcado y queda fuera de la entrega hasta que vuelva la respuesta por escrito: a qué obliga la constancia que el trabajador firma, si las horas de capacitación van dentro o fuera de la jornada y cómo se registran, qué consecuencia puede tener no alcanzar el criterio, hasta cuándo se conservan el documento de identidad y las notas de cada persona, y si el giro del negocio obliga a capacitaciones que este plan no incluye.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "la constancia que el trabajador firma y a qué lo obliga, las horas de capacitación dentro o fuera de la jornada, la consecuencia de no alcanzar el criterio y la conservación del documento de identidad y de las notas" },
        ],
        cubre: [16],
        si_falta: "¿Qué le pasa hoy a quien no alcanza el nivel que la empresa le pide en su puesto?",
      },
      {
        clave: "cierre_por_local",
        titulo: "Cuadro de cierre, una fila por local",
        por_que:
          "Una sola fila con el total de la empresa esconde el local donde no se dictó. Cada local tiene su fila: qué puesto dictó allí, qué días, cuántas personas quedaron certificadas y cuántas pendientes. Es lo que permite mirar el cuadro y ver de inmediato dónde hay que volver, y es coherente con lo que el propio estándar de la casa ya pide: que el cliente reciba el mismo trato en cualquiera de los locales.",
        obligatoria: false,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "afirmaciones", busca: "en qué local se dictó cada sesión, qué días, quién la dictó allí y cuántas personas de ese local quedaron pendientes" },
        ],
        cubre: [14],
        si_falta: "¿En qué local se quedó gente sin recibir la última charla que dieron al personal?",
      },
      {
        clave: "quien_entra_despues",
        titulo: "Cómo entra al estándar quien llegue después del cierre",
        por_que:
          "Un plan que empieza y termina en una semana instala el estándar en la gente que estaba ese día y en nadie más. Con la rotación normal de un negocio de atención al público, en pocos meses hay personas atendiendo que nunca lo escucharon, y conviven con las que sí: el cliente recibe dos tratos distintos en el mismo mostrador. La sección nombra el puesto que enseña al que entra, el hecho que dispara esa enseñanza —el día de su ingreso, antes de operar solo— y la misma evidencia que dejaron los demás.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.onboarding" },
          { de: "activo", clave: "personas.seleccion" },
        ],
        cubre: [15],
        si_falta: "¿Qué día entró la última persona nueva, y quién se sentó con ella a explicarle cómo se trabaja aquí?",
      },
    ],
    nunca_lleva: [
      "Metas escritas todas en la cifra entera, una por día, sin decir qué pasa con quien estaba de descanso o con licencia ese día.",
      "Listas de temas puestas donde deberían ir las preguntas: un índice del manual no es un cuestionario y no se puede calificar.",
      "Frases de arenga como actividad: «dar el ejemplo permanentemente» no es algo que alguien pueda hacer el lunes a una hora.",
      "Secuencias de verbos en mayúsculas —observar, medir, reconocer, corregir, enseñar— sin un puesto, una fecha y un papel donde se anoten.",
      "Indicadores con su peso porcentual y sin decir en qué papel o en qué pantalla se lee cada uno, ni cuál es su valor del día de hoy.",
      "Formatos al final con todos los campos en blanco y sin decir quién los llena, en qué momento y dónde quedan guardados después.",
      "Tareas de reflexión personal que nadie recoge ni lee: una hoja que no se junta no sirve como evidencia de que la persona entendió.",
      "El mismo contenido contado dos veces, una como actividad del día y otra como mensaje de cierre, sin que la segunda agregue nada que hacer.",
      "La palabra «reforzamiento» sin el puesto que lo dicta, la fecha en que se vuelve a evaluar y la tarea que la persona no hace mientras tanto.",
    ],
  },

  contrato: {
    clave: "contrato",
    nombre: "Contrato de trabajo y sus anexos",
    para_quien:
      "Lo firman la Gerencia y el trabajador, lo arma quien administra el personal y lo revisa el asesor legal antes de que nadie lo firme. Cuerpo de hasta seis páginas, que la persona alcance a leer antes de firmar, y con los anexos no más de veinte.",
    exigencias_que_tenia_la_vara: 17,
    secciones: [
      {
        clave: "portada_del_modelo",
        titulo: "Portada del modelo: código, versión, quién lo aprobó y desde cuándo se usa",
        por_que:
          "Sin versión no se sabe qué modelo firmó cada trabajador, y el día que se corrige una cláusula no hay manera de saber a quién hay que volver a hacer firmar. Van cuatro datos en la primera página del contrato, no en la del anexo: código, versión, el día en que la Gerencia aprobó el modelo y el día desde el que se usa. Y aparte de las firmas de las partes va el bloque del modelo mismo —quién lo elaboró, quién lo revisó y quién lo aprobó, con nombre, puesto y fecha—, para que el día que aparezca una cláusula que la empresa no puede sostener haya a quién preguntarle de dónde salió.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "decision_gerencia", sobre: "quién aprueba este modelo de contrato, qué día lo aprueba y desde qué día se usa para incorporar gente" },
        ],
        cubre: [1, 2],
        si_falta: "¿Qué día aprobó la Gerencia el modelo de contrato con el que hoy entra la gente?",
      },
      {
        clave: "campos_que_se_llenan",
        titulo: "Los campos que se llenan antes de imprimir, en una lista de control",
        por_que:
          "Un contrato firmado con el sueldo, el correo o la fecha en blanco no sirve ni para pagar ni para reclamar: el trabajador queda sin defensa y la empresa sin prueba. El modelo abre con la lista de todos sus casilleros —del cuerpo y de los anexos—, cada uno con el dato que va adentro y de dónde sale, y el ejemplar que se firma no llega a la mesa con ninguno abierto. Sin esa lista el control se hace de memoria, y siempre se olvida el mismo: el que está lejos del inicio, metido dentro de una cláusula larga.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "cómo se piden hoy los datos de quien entra —nombre, documento de identidad, domicilio, correo y teléfono—, quién los pide y contra qué papel se verifican" },
          { de: "activo", clave: "personas.seleccion" },
        ],
        cubre: [3, 4],
        si_falta: "La última persona que entró, ¿qué datos suyos tuvieron que pedirle antes de imprimir su contrato?",
      },
      {
        clave: "limpieza_de_datos_ajenos",
        titulo: "El modelo limpio: ningún dato de otra persona adentro",
        por_que:
          "Es el defecto que más rápido convierte un contrato en un problema de datos personales y en una vergüenza frente a la persona que lo está firmando. Cada correo, teléfono, nombre y documento de identidad que quede en el modelo pertenece a una de las dos partes de este contrato, incluidos los que viajan escondidos dentro de un enlace. Los datos heredados del ejemplar con el que se armó el modelo salen antes de imprimir, no después de que alguien los note.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.sistemas" },
        ],
        cubre: [5],
        si_falta: "¿De qué contrato anterior salió el modelo que usan hoy para contratar?",
      },
      {
        clave: "anexos_y_documentos_que_obligan",
        titulo: "Los anexos y los documentos que el contrato manda cumplir",
        por_que:
          "Todo lo que el contrato nombra queda obligado a existir, a tener versión y a haberse entregado. Los anexos nombrados son exactamente los que van adjuntos, cada uno con su nombre, su código y su versión; y cada documento interno cuyo cumplimiento se exige —reglamento, políticas, protocolos, manuales— va nombrado con precisión y existe hoy por escrito. Nombrar en genérico «las políticas internas» es hacer firmar una obligación que nadie puede mostrar, y el día del reclamo la empresa no tiene qué exhibir.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.funciones" },
          { de: "activo", clave: "personas.reglamento" },
          { de: "activo", clave: "procesos.procedimientos" },
        ],
        cubre: [6, 7],
        si_falta: "Cuando alguien firma su contrato, ¿qué otros papeles le entregan ese mismo día?",
      },
      {
        clave: "puesto_funciones_y_jefatura",
        titulo: "El puesto, su jefe y sus funciones, dichos una sola vez",
        por_que:
          "Con dos listas de funciones firmadas el mismo día, el trabajador cumple la más corta y el jefe exige la más larga, y la discusión no la gana nadie porque los dos tienen un documento en la mano. El contrato no reescribe las funciones: remite al anexo y, si las repite, las repite con las mismas palabras y sin agregar ninguna. Y el puesto lleva un solo nombre y un solo jefe inmediato, iguales a los del organigrama y del manual de funciones: con más de un jefe escrito, el día que dos piden cosas distintas ninguna instrucción es exigible.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.funciones" },
          { de: "organigrama" },
        ],
        cubre: [8, 9],
        si_falta: "La última vez que la persona de ese puesto recibió una orden, ¿quién se la dio?",
      },
      {
        clave: "horario_y_local",
        titulo: "El horario y el local donde esa persona va a trabajar",
        por_que:
          "El trabajador firma un horario y trabaja otro, y cuando reclama tiene razón y el documento no vale. Va la hora de entrada, de salida y de refrigerio del local donde esa persona va a estar, no un horario único para toda la empresa, y el local se nombra con el mismo nombre que la empresa usa en su lista de locales: un código de sede que no figura en ninguna lista no identifica nada. Si el puesto rota entre locales, va el horario de cada uno, y queda escrito que rota.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "hora de apertura, de cierre y de refrigerio de cada local, y el nombre con el que la empresa llama a cada uno" },
          { de: "decision_gerencia", sobre: "en qué local trabaja este puesto, con qué horario, y si rota entre locales" },
        ],
        cubre: [10],
        si_falta: "¿A qué hora abrió y a qué hora cerró ayer el local donde va a trabajar esa persona?",
      },
      {
        clave: "remuneracion_y_forma_de_pago",
        titulo: "El sueldo en números y en letras, la moneda y la forma de pago",
        por_que:
          "Una cifra sin moneda, y una cifra que no coincide con su versión en letras, son las dos formas más rápidas de perder una discusión de sueldo. Van las dos escrituras del mismo número, la moneda con su nombre y la forma de pago. Y la cifra la decide la Gerencia antes de imprimir: un sueldo puesto por quien armó el documento, para que se vea completo, compromete dinero que la empresa no decidió, y eso no se inventa.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "el sueldo de este puesto, la moneda en que se paga y la forma en que se paga" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [11],
        si_falta: "¿Cuánto cobra hoy quien ocupa ese mismo puesto?",
      },
      {
        clave: "obligaciones_de_conducta",
        titulo: "Lo que la persona se compromete a hacer, y a no hacer cuando se vaya",
        por_que:
          "Un contrato que solo dice qué funciones cumple la persona no la obliga a nada más: el día que alguien cuenta afuera lo que vio en caja, o se va con una llave en el bolsillo y su acceso al sistema abierto, no hay nada escrito que la empresa pueda sostener. Aquí van las obligaciones de conducta una por una —reserva de información, trato de los datos del cliente, prevención de lavado de activos, colaboración con auditorías, devolución de bienes y cierre de accesos—, cada una dicha con lo que la persona hace o no hace, desde cuándo rige y hasta cuándo sigue rigiendo cuando ya no trabaja ahí, y remitiendo al documento donde está detallada. Escribirlas con adjetivos —diligencia, lealtad, probidad— es no escribir nada: nadie puede cumplir un adjetivo, y nadie puede reclamarle a otro por uno.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.cultura" },
          { de: "activo", clave: "procesos.controles" },
          { de: "decision_gerencia", sobre: "qué información de la empresa y de sus clientes no puede salir, hasta cuándo, y qué bienes y accesos se devuelven el día que alguien deja de trabajar ahí" },
        ],
        cubre: [17],
        si_falta: "¿Qué tiene que devolver una persona el día que deja de trabajar contigo?",
      },
      {
        clave: "firmas_de_las_partes",
        titulo: "Las firmas de las dos partes, cada una con su nombre debajo",
        por_que:
          "Una raya sin nombre no prueba quién firmó, y un anexo que firma solo el trabajador no obliga a la empresa a nada. Debajo de cada línea de firma —del contrato y de cada anexo— va el nombre, el documento de identidad, el puesto con el que firma quien firma por la empresa, y la fecha. La fecha de la firma no puede quedar como casillero: es el dato con el que después se cuenta todo lo demás.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "afirmaciones", busca: "quién firma a nombre de la empresa, con qué puesto y con qué documento de identidad" },
        ],
        cubre: [12],
        si_falta: "¿Quién firma a nombre de la empresa los contratos de la gente que entra?",
      },
      {
        clave: "constancia_de_entrega",
        titulo: "Constancia de entrega del contrato y de cada anexo",
        por_que:
          "Sin constancia, cualquier exigencia se cae con una sola frase: «eso nunca me lo dieron». El formato dice qué documento se entregó, en qué versión, a quién, en qué fecha y con qué firma, y el cuerpo dice qué puesto la recoge y dónde queda archivada. La versión importa más de lo que parece: es lo único que permite saber qué reglas firmó cada persona el día que el modelo se corrige. Y va una constancia por documento, no una sola para el juego entero.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.onboarding" },
          { de: "organigrama" },
        ],
        cubre: [13],
        si_falta: "Cuando le entregan el contrato a alguien, ¿qué queda en la empresa como prueba de que lo recibió?",
      },
      {
        clave: "lo_que_espera_al_asesor_legal",
        titulo: "Lo que sale del juego hasta que responda el asesor",
        por_que:
          "Una obligación legal inventada en un documento que las dos partes firmaron la paga la empresa, no la consultora, y el trabajador la cumple creyendo que es ley. Todo lo que el contrato afirme sobre la modalidad y su causa, el régimen declarado, el periodo de prueba, el aviso de renuncia y las causales de término queda marcado y fuera de la entrega hasta que la respuesta llegue por escrito. Y la causa por la que se contrata se escribe como hecho de esta empresa, con el documento donde consta, no como una fórmula copiada: aquí no se fija ningún plazo, ningún monto ni ninguna norma por cuenta propia.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "la modalidad del contrato y la causa que la sustenta, el régimen declarado, el periodo de prueba, el aviso de renuncia y las causales de término" },
          { de: "afirmaciones", busca: "por qué se contrata a esta persona ahora y qué documento del expediente respalda esa causa" },
        ],
        cubre: [14],
        si_falta: "¿Qué pasó en el negocio que hizo falta contratar a alguien más justo ahora?",
      },
      {
        clave: "anexo_de_preguntas_al_asesor",
        titulo: "Anexo: las preguntas abiertas al asesor legal",
        por_que:
          "Lo que está en duda tiene que estar en una lista con fecha y con dueño, no en la cabeza de quien redactó. Cada pregunta va con el día en que se hizo, quién debe responderla y en qué estado está, y mientras siga abierta se ve que está abierta y lo que depende de ella no se aplica. Así el contrato se entrega diciendo exactamente qué falta verificar, en lugar de afirmar para que el documento parezca completo: el silencio se lee como que alguien ya lo revisó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "cada pregunta abierta sobre este contrato, con la fecha en que se preguntó, quién debe responder y su estado" },
        ],
        cubre: [15],
        si_falta: "¿A quién le consulta hoy la empresa los temas laborales antes de hacer firmar un contrato?",
      },
      {
        clave: "faltas_y_causales",
        titulo: "Las faltas graves, dichas igual en toda la casa",
        por_que:
          "Si el contrato y las reglas internas le dan a la misma conducta consecuencias distintas, el trabajador se defiende con el documento que más le conviene y la empresa no puede sostener la medida. Cada conducta se escribe una sola vez, en el documento que le corresponde, y el contrato remite ahí en lugar de armar su propia lista paralela. Mientras las reglas internas no existan por escrito, cada conducta que el contrato declara falta grave se consulta antes de entregarla.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.disciplina" },
          { de: "activo", clave: "personas.reglamento" },
          { de: "asesor_legal", sobre: "qué parte de la lista de faltas graves se puede sostener y qué parte le corresponde al reglamento interno" },
        ],
        cubre: [16],
        si_falta: "La última vez que alguien hizo algo que aquí no va, ¿dónde estaba escrito que no se podía?",
      },
    ],
    nunca_lleva: [
      "Cláusulas que encadenan materias —laboral, tributaria, datos personales, seguridad de información— sin decir qué tiene que hacer la persona en cada una.",
      "La misma prohibición escrita en tres cláusulas con palabras distintas: reserva, confidencialidad y seguridad de información diciendo lo mismo.",
      "Listas de faltas graves que cierran con «cualquier conducta que afecte gravemente», que no es una conducta que alguien pueda evitar.",
      "Cierres del tipo «conforme a la normativa aplicable» o «conforme al procedimiento interno» cuando ese procedimiento no está escrito.",
      "Una cláusula de antecedentes que describe el rubro de la empresa y no obliga a ninguna de las dos partes a nada.",
      "El periodo de prueba explicado dos veces en párrafos seguidos, cada uno con su propia lista de lo que se va a evaluar.",
      "Adjetivos en lugar de conductas: diligencia, lealtad, probidad y atención al detalle en una sola línea, sin un hecho al lado.",
      "Cláusulas traídas de un modelo de otro rubro: material que la casa no entrega, vehículos que no tiene, turnos rotativos que no existen.",
    ],
  },

  diagnostico: {
    clave: "diagnostico",
    nombre: "Informe de diagnóstico organizacional",
    para_quien:
      "La dueña o la gerencia lo lee entero una vez y después lo usa por partes: el responsable de cada frente abre la suya, y la hoja de hallazgos con su registro de acciones es la que se mira en cada revisión. Cuerpo de veinticinco a cuarenta páginas más las dos hojas; si el análisis de la organización va aparte, de ocho a doce páginas y citando a este por su código.",
    exigencias_que_tenia_la_vara: 18,
    secciones: [
      {
        clave: "identificacion_del_informe",
        titulo: "Portada: código del informe, una sola versión y su fecha",
        por_que:
          "Un informe que no sabe qué versión es no se puede aprobar ni citar. La portada lleva el código del documento, el número de versión y la fecha, y el pie de cada página repite exactamente los mismos tres datos: si la portada dice una versión y el pie repite otra en cincuenta páginas, el que lo lee no sabe si tiene delante lo que manda hoy. El código es además lo que permite que el resto de los documentos del proyecto citen a este sin apodos: dos documentos distintos no pueden llevar el mismo número de versión y ningún código, porque entonces «la versión 02» puede ser cualquiera de los dos.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "decision_gerencia", sobre: "qué versión del informe aprueba la Gerencia y desde qué día es la que manda para trabajar" },
        ],
        cubre: [1, 2],
        si_falta: "¿Cuál de los informes que te entregamos es el que tienes impreso en tu oficina?",
      },
      {
        clave: "registro_de_cambios",
        titulo: "Registro de cambios: qué se quitó, por qué y quién lo autorizó",
        por_que:
          "Una fila por versión, incluida la de este documento, y una fila por cada cosa que esta versión quita, corrige o anula de la anterior, con el motivo y el puesto que lo autorizó. Quitar lo que no corresponde es obligatorio; quitarlo en un párrafo del cuerpo, sin dejar rastro, es lo que deja el informe indefendible: nadie puede mostrar después quién decidió, qué día ni con qué se comprobó, y el error vuelve a entrar en la versión siguiente. Aquí es donde se anota, por ejemplo, el material que resultó ser de otra entidad y que esta versión retira.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "qué dijo la empresa que no le corresponde del informe anterior, quién lo dijo y en qué fecha" },
          { de: "decision_gerencia", sobre: "qué material de la versión anterior se quita o se corrige, por qué, y quién autoriza quitarlo" },
        ],
        cubre: [1, 4],
        si_falta: "¿Qué parte del informe anterior pediste que se saque?",
      },
      {
        clave: "firmas_de_entrega_y_recepcion",
        titulo: "Firmas: quién lo elaboró, quién lo revisó y quién lo recibe",
        por_que:
          "Tres líneas de firma, cada una con nombre, puesto, documento de identidad y fecha: quien elaboró el informe, quien lo revisó por la consultora y quien lo recibe por la empresa. Sin la firma de recepción el informe no es un entregable, es un borrador que circula: la empresa puede decir después que nunca lo recibió, y la consultora no puede probar qué entregó ni qué día lo entregó. Un informe que propone un plan de noventa días y que nadie firmó no compromete a nadie a nada.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "decision_gerencia", sobre: "quién firma por la empresa la recepción del informe y quién lo revisa y lo firma por la consultora" },
        ],
        cubre: [3],
        si_falta: "¿Quién de tu empresa firma cuando recibe un documento de la consultora?",
      },
      {
        clave: "alcance_lector_y_limitaciones",
        titulo: "A quién va dirigido, quién puede tener copia y qué no reemplaza",
        por_que:
          "La primera página dice el lector, la lista de puestos que pueden tener copia y qué revisiones no reemplaza este informe. Un sello de «confidencial» sin la lista no protege nada, y es grave cuando el informe habla de un incidente con el personal: circula por correo y nadie incumple ninguna regla porque la regla no está escrita. Aquí va también la salvedad que obliga a leer «no se evidenció» en lugar de «no existe», con la lista de los documentos que se pidieron, los que llegaron y los que no: decirle a una dueña que no tiene algo que sí tiene quema el informe completo, y a partir de ahí discute cada línea con razón.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "qué documentos se le pidieron a la empresa, en qué fecha se pidió cada uno, cuáles llegaron y cuáles no" },
          { de: "decision_gerencia", sobre: "a quién va dirigido el informe y qué puestos de la empresa pueden tener copia" },
        ],
        cubre: [5, 9],
        si_falta: "¿Quién abrió este informe en tu empresa desde que lo recibiste?",
      },
      {
        clave: "indice_y_numeracion_unica",
        titulo: "Índice: un número y un título por sección, los mismos del cuerpo",
        por_que:
          "El índice se arma al final y se compara entrada por entrada con el cuerpo: mismo número y mismo título. Un documento que no se puede citar por número no se puede trabajar en reunión, porque nadie llega a la misma página y todos discuten de memoria. Y ninguna subsección se cuelga de una sección con la que no tiene relación: la parte de proveedores no puede ir colgada de la de seguridad y salud en el trabajo solo porque quedaron pegadas al redactar.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "afirmaciones", busca: "cómo numera y codifica la empresa sus propios documentos y quién los guarda" },
        ],
        cubre: [6],
        si_falta: "¿Dónde está guardado hoy el último documento que tu empresa aprobó, y con qué nombre?",
      },
      {
        clave: "un_solo_mapa_de_la_empresa",
        titulo: "Los frentes de la empresa, una sola lista para todo el informe",
        por_que:
          "Una sola lista de frentes, con los mismos nombres, usada en el resumen, en la tabla de madurez, en las recomendaciones, en el plan y en la hoja de hallazgos. Cuando el mismo informe parte la empresa de cinco maneras distintas —unos frentes en el resumen, otras dimensiones en la madurez, otros ejes en las recomendaciones— nadie puede seguir un frente de punta a punta, del hallazgo a la acción, y en la revisión del mes cada tabla contesta por una empresa distinta. La lista se decide una vez, con la Gerencia, y después no se toca.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "procesos.mapa_procesos" },
          { de: "decision_gerencia", sobre: "cómo se llama cada frente de la empresa y qué puesto responde por cada uno" },
        ],
        cubre: [12],
        si_falta: "Cuando pides cuentas de la empresa, ¿por cuáles partes preguntas y en qué orden?",
      },
      {
        clave: "cuenta_del_dia_uno",
        titulo: "La cuenta del día del diagnóstico, con su fecha",
        por_que:
          "Una tabla fechada con lo que hay el día que se levanta el diagnóstico: el número exacto de personas y en qué sede trabaja cada una, los documentos pedidos marcando cuáles llegaron, y el valor de hoy de cada indicador que el informe propone, además de su fórmula. Un conteo de personal escrito con «aproximadamente» no sirve para repartir trabajo ni para hablar de suplencias. Y un indicador con fórmula y sin valor de hoy es una promesa de medir: dentro de tres meses la pregunta «¿mejoró algo?» se contesta con opiniones, porque el punto de partida no se puede reconstruir después. Nadie se acuerda.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.organigrama" },
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "resultados.ventas" },
          { de: "activo", clave: "resultados.tiempos" },
          { de: "afirmaciones", busca: "cuántas personas trabajan hoy en cada sede, en qué puesto cada una y con qué horario" },
        ],
        cubre: [15],
        si_falta: "Ahora mismo, ¿cuántas personas están trabajando en cada una de tus sedes?",
      },
      {
        clave: "ficha_de_cada_hallazgo",
        titulo: "Ficha del hallazgo: código, hecho, de dónde salió y lectura",
        por_que:
          "Cada hallazgo entra con su código y con cinco partes separadas y rotuladas: de dónde salió —quién lo dijo con su puesto y en qué fecha, o qué documento lo contiene con su código—, el hecho observado, la lectura del diagnóstico, lo que puede pasar si sigue así, y la acción recomendada. Las partes van separadas porque cuando el hecho y la opinión están en el mismo párrafo la dueña discute la opinión y se lleva el hecho por delante: se pierde media hora defendiendo un adjetivo y el dato que importaba queda sin confirmar. Y el origen va al costado porque lo que alguien recordó en una reunión y lo que está en un registro no pesan igual: el día que un hallazgo resulta falso, sin el origen hay que revisar el informe entero.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "quién dijo cada cosa, en qué reunión y en qué fecha, y qué documento o registro la respalda" },
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [7, 8, 13],
        si_falta: "Eso que me acabas de contar, ¿qué día pasó y quién estaba delante?",
      },
      {
        clave: "escalas_declaradas_del_informe",
        titulo: "Las escalas del informe, definidas antes de usarse",
        por_que:
          "Toda escala que el informe va a usar queda definida antes: la de madurez, la de prioridad, la de probabilidad y la de estado de validación, cada una con sus niveles y la descripción de cada nivel. Después ninguna tabla usa un valor que no esté en esa definición. Una escala declarada con cuatro valores y usada con cinco deja de ordenar el trabajo: el orden pasa a ser el de quien lee el documento ese día. Y una columna de probabilidad donde conviven un nivel, un estado del expediente y un juicio de manejabilidad no se puede comparar consigo misma el mes siguiente.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [10],
        si_falta: "Cuando dices que un área de tu empresa está atrasada, ¿con qué la estás comparando?",
      },
      {
        clave: "madurez_por_dimension",
        titulo: "Tabla de madurez: un nivel por frente y el hecho que lo produjo",
        por_que:
          "Una fila por frente, y en cada fila un solo nivel de la escala declarada, el documento o registro concreto con que se decidió ese nivel, y qué falta exactamente para subir al siguiente. Un frente con dos niveles a la vez mientras los demás llevan uno rompe la escala: ya no se puede comparar entre sedes ni volver a medir dentro de tres meses para ver si subió. Y una justificación que repite la definición del nivel —«falta formalización», «requiere criterios uniformes»— no le sirve a la empresa: deja el nivel como una nota puesta a mano alzada y no le dice qué tiene que entregar para cambiarla.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.mapa_procesos" },
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.indicadores" },
        ],
        cubre: [11],
        si_falta: "¿Qué papel o qué registro de esa área me puedes mostrar hoy mismo?",
      },
      {
        clave: "matriz_de_hallazgos_y_acciones",
        titulo: "La hoja de hallazgos y el registro de acciones",
        por_que:
          "Una sola hoja con todos los hallazgos del cuerpo —uno por fila, con su código, su frente, su prioridad tomada de la escala declarada y su cierre esperado— y al lado el registro de acciones, con el puesto que responde, la fecha de calendario en que vence y la evidencia que la cierra. Los dos conteos tienen que cuadrar con el cuerpo: si el cuerpo trae treinta hallazgos y la hoja catorce, dieciséis quedaron fuera del plan sin que nadie lo decidiera y sin que se pueda saber cuáles. Un área en lugar de un puesto no es un responsable, y un plazo contado en días sin decir desde cuándo no vence nunca: al mes y medio nadie puede decir qué está atrasado.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "procesos.controles" },
          { de: "decision_gerencia", sobre: "qué puesto responde por cada acción, para qué fecha vence y qué evidencia se acepta para cerrarla" },
        ],
        cubre: [13, 14],
        si_falta: "¿Quién va a responder por cada una de estas acciones, y para qué día?",
      },
      {
        clave: "recomendaciones_con_su_medicion",
        titulo: "Recomendaciones, cada una con su medición debajo",
        por_que:
          "Cada recomendación cierra con la señal que dirá si funcionó: el número, su unidad y el registro, cuaderno o sistema de donde se lee. Lo pide el manual de identidad vigente de la propia empresa, que cierra cada uno de sus principios con una línea de medición, así que se le puede mostrar en su propia página en lugar de pedirle que confíe en una regla nuestra. «Formalizar», «fortalecer», «consolidar» y «estandarizar» sin número debajo no se pueden cerrar nunca: quedan abiertos para siempre o se cierran por cansancio, y el informe termina midiendo documentos redactados en lugar de controles usados.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "resultados.tiempos" },
        ],
        cubre: [16],
        si_falta: "¿De dónde vas a leer el número que te diga que esto funcionó?",
      },
      {
        clave: "personas_contra_el_estandar_de_la_casa",
        titulo: "Lo que se dice de las personas, medido contra lo escrito",
        por_que:
          "Donde el informe habla de desempeño, disciplina, atención o capacitación, se apoya en una conducta escrita en el manual de identidad vigente de la empresa, citado con su versión y su fecha. Un diagnóstico que mide a la gente contra un estándar que la empresa nunca aprobó no es exigible: el dueño no puede pedirle a nadie que cambie una conducta que no está escrita en ninguna parte, y el trabajador tiene razón si dice que nunca se la pidieron. Y si ese manual todavía no existe, el informe lo dice así y no lo inventa.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.cultura" },
          { de: "activo", clave: "personas.evaluacion" },
          { de: "activo", clave: "personas.disciplina" },
        ],
        cubre: [17],
        si_falta: "¿En qué documento está escrito hoy lo que tu empresa le exige a su gente?",
      },
      {
        clave: "para_asesoria_especializada",
        titulo: "Lo que sale de la entrega hasta que responda el especialista",
        por_que:
          "Los permisos de cada sede, la seguridad y salud en el trabajo, los contratos, el procedimiento disciplinario, la separación de un trabajador y toda materia tributaria entran aquí, cada uno con la pregunta concreta que se le hace al especialista y el puesto que la lleva, y quedan fuera de la entrega hasta que vuelva la respuesta por escrito. El informe no afirma por su cuenta que algo esté incumplido, vencido o sancionable, y no fija plazos ni montos de ley. Declarar un incumplimiento que nadie verificó le deja a la empresa un problema escrito con su propio nombre encima, y además desarma al informe donde sí tiene razón: basta un punto legal equivocado para que la dueña desconfíe de todos los demás.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "los permisos de cada sede, la seguridad y salud en el trabajo, los contratos, el procedimiento disciplinario y toda materia tributaria que aparezca en el levantamiento" },
        ],
        cubre: [18],
        si_falta: "¿Qué permiso de tus sedes te pidieron mostrar la última vez que vino una inspección?",
      },
      {
        clave: "cuando_se_vuelve_a_medir",
        titulo: "Cuándo se vuelve a medir y quién dirige esa revisión",
        por_que:
          "La fecha en que se vuelve a tomar la cuenta del día uno, el puesto que dirige la revisión y la lista de lo que se mira: los mismos indicadores, leídos del mismo sitio, para que los números se puedan poner uno al lado del otro. Un diagnóstico que no dice cuándo se vuelve a medir se convierte en una foto que nadie compara con nada, y la empresa termina discutiendo si mejoró. Aquí va también la regla de cierre: un documento redactado no equivale a un control implementado, y una acción solo se cierra con la evidencia de que se usó.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "decision_gerencia", sobre: "qué día se vuelve a medir, qué puesto dirige la revisión y qué se mira en ella" },
        ],
        cubre: [15, 16],
        si_falta: "¿Qué día se sentaron a revisar lo que el informe anterior mandó hacer?",
      },
    ],
    nunca_lleva: [
      "Páginas que explican qué es un diagnóstico organizacional, qué es el control interno y para qué sirve documentar: teoría, no hallazgos de esta empresa.",
      "Bloques donde el hecho observado tiene una línea y la interpretación tiene tres párrafos: falta el dato y sobra la explicación.",
      "Listas de riesgos que servirían para cualquier empresa del rubro: «pérdida de evidencia», «decisiones apresuradas», «sobrecarga del personal con más experiencia».",
      "Acciones escritas como títulos de documento, sin verbo y sin dueño: «protocolo de incidente», «cadena de evidencias», «carpeta anual por sede».",
      "Columnas de cálculo que repiten el nombre del indicador en lugar de decir de dónde se lee el número.",
      "El mismo diagnóstico escrito dos veces en dos documentos del proyecto sin que el corto cite al largo por su código ni diga qué le agrega.",
      "Conclusiones que podrían cerrar cualquier informe, sin una cifra, sin una fecha y sin un documento nombrado.",
      "Ejes o capítulos con títulos casi iguales entre sí, partidos para llenar páginas en lugar de para separar trabajos distintos.",
      "Tres páginas seguidas sin una fecha, sin un puesto y sin una cifra.",
    ],
  },

  formato: {
    clave: "formato",
    nombre: "Formato o anexo operativo de un procedimiento",
    para_quien:
      "Lo llena quien ejecuta, de pie y con alguien esperando; lo revisa quien aprueba, en medio minuto; y lo busca quien audita, meses después. Una cara, dos como máximo, con el código y la numeración de página repetidos en cada cara. Las instrucciones de llenado van al reverso o en hoja aparte, y nunca entre los campos.",
    exigencias_que_tenia_la_vara: 15,
    secciones: [
      {
        clave: "identidad_y_parentesco",
        titulo: "Encabezado: un solo código, su versión y de qué procedimiento es anexo",
        por_que:
          "Un formato suelto es un formato sin dueño: el que lo recibe reenviado en un correo no sabe qué trámite está ejecutando ni a quién preguntarle. El encabezado lleva un solo código —el mismo en el encabezado, en el pie y en el nombre del archivo—, su versión, su fecha de validación y, escrito con palabras y no insinuado por el prefijo del código, el nombre y el código del procedimiento del que este formato es anexo, con la versión de ese procedimiento. El parentesco escrito es lo que permite que, cuando el procedimiento cambie, alguien sepa qué formatos hay que cambiar con él.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "procesos.mapa_procesos" },
        ],
        cubre: [1],
        si_falta: "¿De qué procedimiento es anexo el último formato que te llegó firmado?",
      },
      {
        clave: "quien_llena_cada_bloque",
        titulo: "Columna de responsable: qué puesto llena cada bloque y en qué paso",
        por_que:
          "Un campo sin dueño lo llena el que tiene prisa, o no lo llena nadie, y el papel llega a la firma con huecos que ya no se pueden cerrar sin devolverlo. Cada bloque del formato lleva al margen dos datos —el puesto que lo llena y el paso del trámite en que se llena—, y el campo que se sale de la regla de su bloque los lleva escritos en su propia línea. «Uso interno» no es un puesto. Esta columna es lo que convierte un papel con casillas en un trámite que avanza solo: el que recibe el formato a medio llenar sabe de inmediato si le toca a él o si lo tiene que devolver, y a quién.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "organigrama" },
          { de: "decision_gerencia", sobre: "qué puesto llena cada bloque de este formato y en qué paso del trámite lo llena" },
        ],
        cubre: [2],
        si_falta: "Del último formato que firmaste, ¿quién llenó cada parte antes de que llegara a tu escritorio?",
      },
      {
        clave: "datos_que_no_se_vuelven_a_pedir",
        titulo: "Campos que citan el documento en lugar de copiarlo, y un solo campo por dato",
        por_que:
          "Lo que está escrito en dos documentos se corrige en uno solo. Donde el dato ya vive en un documento codificado de la empresa —las funciones, la formación, la experiencia y las competencias de un puesto que ya tiene su ficha—, el formato pide el código y la versión de esa ficha, no manda escribirla de nuevo: así las dos versiones no se separan al segundo pedido del mismo puesto. Y cada dato tiene un solo campo. Si el mismo hecho necesita aparecer dos veces, el formato escribe al lado qué las separa —lo que se pidió y lo que se autorizó, lo previsto y lo ocurrido—; si no lo escribe, las dos casillas se llenan distinto y después no se puede medir si el trámite salió a tiempo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.funciones" },
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "organigrama" },
        ],
        cubre: [3, 4],
        si_falta: "¿Dónde está escrito hoy lo que tiene que hacer el puesto que pidieron la última vez?",
      },
      {
        clave: "opciones_cerradas_con_su_leyenda",
        titulo: "Listas cerradas completas, y qué significa marcar cada casilla",
        por_que:
          "Una casilla sin leyenda la marca cada persona por una razón distinta, y entonces el formato no recoge un dato: recoge la costumbre de quien lo llenó. Cada grupo de casillas va con todas sus opciones y con la línea que dice qué quiere decir marcar una, y qué quiere decir dejarla en blanco. Y todo campo que pida algo que la empresa ya tiene cerrado —la sede, el área, el puesto, la moneda, la prioridad— va como lista, no como línea en blanco: en una empresa con varias sedes, la misma sede escrita de tres formas es la razón por la que los pedidos no se pueden contar por sede ni comparar entre ellas.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "el nombre exacto de cada sede, de cada área y de cada puesto tal como aparecen en los papeles de la empresa" },
          { de: "activo", clave: "personas.organigrama" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [5],
        si_falta: "¿Con qué nombre exacto aparece cada una de tus sedes en los papeles de la empresa?",
      },
      {
        clave: "cuando_el_tramite_no_avanza",
        titulo: "Toda opción que detiene el trámite trae su motivo y su paso siguiente",
        por_que:
          "Un trámite detenido sin motivo escrito se queda en el escritorio de alguien, y el área que pidió nunca sabe por qué no llega: termina resolviéndolo por fuera, sin papel y sin aprobación. Cada opción que significa que algo no avanza —observado, pendiente, rechazado, cancelado— lleva al lado el campo donde se escribe el motivo y la línea que nombra el puesto que actúa después y qué hace. Es la diferencia entre un papel que informa y un papel que mueve el trabajo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "procesos.incidencias" },
          { de: "decision_gerencia", sobre: "qué puesto retoma un pedido observado y qué tiene que pasar para que ese pedido vuelva a avanzar" },
        ],
        cubre: [6],
        si_falta: "La última vez que un pedido se quedó observado, ¿en el escritorio de qué puesto se quedó?",
      },
      {
        clave: "firmas_y_orden_de_aprobacion",
        titulo: "Una línea de firma por cada puesto que aprueba, y en qué orden firman",
        por_que:
          "Una casilla marcada no es la firma de nadie. El bloque de aprobación trae una línea de firma con fecha por cada puesto que aprueba, ni una más ni una menos, y no trae la firma de quien no aprueba: el que pide no se aprueba a sí mismo. Va escrito también el orden —qué puesto firma primero y qué puesto no puede firmar antes que otro—, porque una aprobación firmada fuera de orden no aprobó nada: se firmó sin la información que tenía que tener delante. El día que se discute quién autorizó el gasto, lo único que sirve es la letra de alguien.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "procesos.politicas" },
          { de: "decision_gerencia", sobre: "qué puestos aprueban este formato, en qué orden firman y qué puesto firma la autorización final" },
        ],
        cubre: [7],
        si_falta: "Del último pedido aprobado, ¿quién firmó primero y quién firmó al final?",
      },
      {
        clave: "correlativo_archivo_y_registro",
        titulo: "El número, el custodio y el registro donde queda anotado",
        por_que:
          "Un correlativo sin dueño se repite: dos áreas que piden el mismo día se ponen el mismo número y el archivo queda con dos expedientes bajo un solo código. El formato dice qué puesto entrega el número y en qué registro queda anotada la asignación. Y dice dónde queda el original una vez firmado: la carpeta exacta, el puesto que la custodia y el registro donde se anota cada formato llenado. Un formato sin línea de archivo es el control que no queda: la única copia vive en el correo del que la mandó y se pierde cuando esa persona se va. Si el registro todavía no existe, se escribe así, y qué habría que abrir.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.sistemas" },
          { de: "decision_gerencia", sobre: "qué puesto entrega el correlativo, qué puesto custodia el original firmado y en qué registro se anota" },
        ],
        cubre: [8, 9],
        si_falta: "El último formato que se llenó y se firmó, ¿dónde está hoy ese papel?",
      },
      {
        clave: "campos_sin_respuesta_adentro",
        titulo: "Dentro del campo va el formato del dato, no la respuesta ni la teoría",
        por_que:
          "Un ejemplo impreso dentro del campo es la respuesta puesta en la boca del que llena, y vuelve copiada en todos los formatos: a partir de ahí el papel repite lo suyo en lugar de recoger lo de este caso. Dentro de cada campo va solamente el formato del dato que se pide —día, mes y año; moneda y cifra; nombre del puesto—, nunca una respuesta de muestra ni una orden de redacción. Y el formato no lleva teoría: ni objetivo, ni alcance, ni base normativa, ni glosario. Todo eso vive en el procedimiento del que es anexo, y copiado aquí lo único que hace es empujar los campos a la segunda cara, donde el que llena ya no los lee, y contradecir al procedimiento en la primera revisión.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [10, 12],
        si_falta: "Del último formato que te llegó, ¿qué campos venían con el texto de muestra sin cambiar?",
      },
      {
        clave: "conducta_observable_del_puesto",
        titulo: "La conducta que se pide, escrita como algo que se puede ver",
        por_que:
          "Un pedido que pide «precisión» o «trabajo bajo presión» no le dice nada a quien después tiene que entrevistar, y la decisión termina tomándose por simpatía. Donde el formato pide conducta o competencias, cada entrada trae la conducta que se puede ver, cómo se demuestra y con qué se mide, y queda ordenada contra las cuatro partes de la evaluación de la casa: resultados, comportamiento, competencia y responsabilidad. El manual de identidad de la empresa ya escribió cada valor con su conducta, su contrario y su medida: el campo sale de ahí y no de una lista de adjetivos.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.habilidades" },
          { de: "activo", clave: "personas.evaluacion" },
        ],
        cubre: [11],
        si_falta: "De la última persona que contrataste y se quedó, ¿qué la viste hacer en su primera semana?",
      },
      {
        clave: "lo_que_espera_al_asesor",
        titulo: "Los campos que salen de la entrega hasta que responda el asesor",
        por_que:
          "Un papel que circula por varios escritorios con el sueldo de un puesto y el motivo de salida de una persona con nombre adentro es un problema que paga la empresa, no la consultora. Todo campo que recoja datos de personas o de dinero —nombres, documento de identidad, motivo de la salida del trabajador anterior, rango de remuneración, modalidad de vínculo, documentación que se le pide al candidato— va marcado, y queda fuera de la entrega hasta que vuelva por escrito la respuesta sobre qué se puede pedir, qué puesto puede verlo y por cuánto tiempo se guarda. El formato no fija eso por su cuenta.",
        obligatoria: true,
        de_donde_sale: [
          {
            de: "asesor_legal",
            sobre:
              "los datos personales, el rango de sueldo y la modalidad de vínculo que este formato recoge: qué se puede pedir, qué modalidad corresponde, qué puesto puede verlo y cuánto se conserva",
          },
        ],
        cubre: [15],
        si_falta: "¿Qué puestos pueden ver hoy el sueldo escrito en un pedido de personal?",
      },
      {
        clave: "respaldo_de_quien_llena_y_firma",
        titulo: "Quién llena y quién firma cuando el titular no está",
        por_que:
          "Un trámite que solo puede firmar un puesto se detiene las semanas que ese puesto está de vacaciones, y el área que pidió termina resolviéndolo por fuera o quedándose sin nadie en temporada alta. Esta sección nombra, por bloque, el puesto que llena y el puesto que firma cuando el titular no está, y dice qué queda fuera del reemplazo: los montos, las claves y la autorización final. Decir qué no hereda el que cubre es lo que evita que una ausencia se convierta en una firma regalada.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.plan_personal" },
          { de: "organigrama" },
          { de: "decision_gerencia", sobre: "qué puesto firma este formato cuando el titular no está y qué queda fuera de ese reemplazo" },
        ],
        cubre: [14],
        si_falta: "La última vez que el puesto que aprueba estuvo de vacaciones, ¿quién firmó en su lugar?",
      },
      {
        clave: "una_cara_y_su_pie_de_pagina",
        titulo: "El largo del papel y lo que repite cada cara",
        por_que:
          "El formato se llena de pie, con alguien esperando, así que cabe en una cara. Si pasa a una segunda, cada cara repite el código, la versión y la numeración de página escrita como página sobre total: cuando se imprime en dos hojas y se separan, la hoja de las firmas —la única que prueba algo— tiene que poder volver a su expediente. Y si el papel pasa de dos caras, lo que hay que hacer no es reducir la letra: es sacar bloques a un anexo distinto, porque un formato de cuatro caras no se llena, se deja a medias.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "afirmaciones", busca: "en qué parte del local se llena este formato, si se llena a mano o en pantalla, y en cuántas hojas se imprime hoy" },
        ],
        cubre: [13],
        si_falta: "¿En cuántas hojas se imprime hoy el formato que tu equipo llena más seguido?",
      },
    ],
    nunca_lleva: [
      "Bloques numerados que crecen hasta ocho secciones cuando el trámite tiene dos decisiones reales: lo que sobra son casillas que nadie mira al aprobar.",
      "Filas de «Otro: ____» repetidas en varios bloques, y hasta dos veces en el mismo bloque: es el campo cerrado que nadie se atrevió a cerrar.",
      "Casillas de verificación en batería, simétricas y en columnas iguales por lado, sin una línea que diga qué significa marcarlas ni qué pasa si quedan en blanco.",
      "Campos de texto libre largos —justificación, observaciones, observaciones de filtro— donde el procedimiento ya tiene su lista de causas cerrada.",
      "Un bloque de «uso interno» que recoge por segunda vez datos que ya están arriba, llenado por alguien que el formato no nombra.",
      "Objetivo, alcance, base normativa o glosario copiados del procedimiento: empujan los campos a la segunda cara y lo contradicen en la primera revisión.",
      "Ejemplos de respuesta impresos dentro del campo, y corchetes cuyo contenido es una orden de redacción en vez del formato del dato.",
      "Un pie de página que gasta la línea en la razón social y en el nombre del formato y deja fuera la numeración de página, ni marcas de plantilla sin reemplazar en el formato ya llenado.",
    ],
  },

  identidad: {
    clave: "identidad",
    nombre: "Manual de Identidad Estratégica y Cultura Organizacional",
    para_quien:
      "Lo aprueba y lo firma la Gerencia, lo lee entero quien administra el personal, y lo recibe y firma cada trabajador el día que entra. Cuerpo de doce a veinte páginas, nunca más de veinticinco; una cara aparte con los valores, su conducta y su contrario, para pegar donde la gente la vea; y el tablero de mediciones como anexo, porque ese se actualiza y el cuerpo no.",
    exigencias_que_tenia_la_vara: 16,
    secciones: [
      {
        clave: "portada_aprobacion_y_vigencia",
        titulo: "Portada: versión, quién la firmó, desde cuándo rige y hasta qué año llega",
        por_que:
          "Un manual de cultura sin firma no es un acuerdo: es la opinión de quien lo escribió, y el día que la empresa le reclame a alguien por una conducta que este documento declara, nadie puede decir quién la decidió ni cuándo. Van tres casillas separadas —quién lo elaboró, quién lo revisó, quién lo aprobó—, cada una con nombre, puesto y fecha, porque son tres hechos distintos y una fecha sola no dice cuál de los tres ocurrió. Y va un solo año de cierre, el mismo que lleva la visión del cuerpo: con dos horizontes en el mismo documento cada uno elige el año que le conviene y nadie se siente medido.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "decision_gerencia", sobre: "quién elabora, quién revisa y quién aprueba esta versión, qué día la aprueba, desde qué día rige y en qué mes se vuelve a revisar" },
        ],
        cubre: [1, 2],
        si_falta: "¿Qué día aprobó la Gerencia este manual y desde qué día se lo está exigiendo a la gente?",
      },
      {
        clave: "quienes_somos_y_hasta_donde",
        titulo: "Quiénes somos y hasta dónde vamos: pilares, propósito, misión y visión",
        por_que:
          "Es la parte que después se copia palabra por palabra en el plan, en el manual de funciones y en la selección, así que aquí se escribe una sola vez y bien. Los pilares no se quedan en la portada: cada uno vuelve a aparecer, escrito con esa misma palabra, en un valor o en una conducta que trae su propia medición, porque un pilar que no baja a ninguna conducta es un cartel en la pared y nadie puede incumplirlo. La visión lleva el mismo año que la portada. Y cada adjetivo con que la empresa se describe a sí misma —rentable, ordenada, segura— trae al lado el número con que se sabrá si se cumplió, o va marcado como aspiración: si el documento se exige a sí mismo menos de lo que exige a la gente, la gente lo nota el primer día.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.mvv" },
          { de: "decision_gerencia", sobre: "hasta qué año llega lo que este manual declara y qué año lleva la visión de la empresa" },
        ],
        cubre: [2, 8, 14],
        si_falta: "¿En qué año quiere la Gerencia ver cumplida la visión que tiene escrita?",
      },
      {
        clave: "valores_con_su_contrario",
        titulo: "Los valores, con la conducta que los demuestra y la que los contradice",
        por_que:
          "Es el corazón del documento y la sección donde se cae la mayoría de los manuales de cultura. Cada valor entra con cuatro cosas: la frase que lo resume, lo que se hace cuando se cumple, lo que nunca es aceptable, y con qué se mide. Sin la conducta contraria escrita, el día que hay que corregir a alguien la discusión es si eso estuvo mal o no, y gana quien habla más fuerte. Van pocos valores y todos en presente: lo que la empresa ya es no se escribe en futuro, porque un documento vigente escrito en futuro no se puede exigir ni se puede incumplir, siempre falta para que empiece. Y donde el documento anuncia una cantidad, debajo van exactamente esos renglones, uno por línea.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.cultura" },
          { de: "activo", clave: "personas.disciplina" },
        ],
        cubre: [3, 4, 7],
        si_falta: "¿Qué hizo alguien de tu equipo que te hizo decir que así no se trabaja aquí?",
      },
      {
        clave: "principios_y_estandar_de_atencion",
        titulo: "Cómo nos comportamos: principios de conducta y estándar de atención",
        por_que:
          "Los valores dicen en qué cree la empresa; los principios dicen qué se hace cuando dos cosas buenas se pelean entre ellas. Por eso cada principio se escribe como una elección concreta —qué se sacrifica y qué no se sacrifica nunca— con la conducta que se ve y con qué se mide. El estándar de atención va aquí y no en un anexo, porque es el principio aplicado al mostrador: lo que el cliente tiene que poder decir al salir, y lo que ningún trabajador puede dejar pasar. Esta sección es también donde el pilar que no alcanzó a ser valor encuentra su conducta medida, para que ningún pilar de la portada se quede sin un lugar donde exigirse.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.cultura" },
          { de: "activo", clave: "producto.calidad" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [4, 8],
        si_falta: "¿Qué pasó la última vez que un cajero tuvo que elegir entre terminar rápido y cumplir un control?",
      },
      {
        clave: "tablero_de_mediciones",
        titulo: "Tablero de mediciones: el número, de dónde sale, cada cuánto y su valor de hoy",
        por_que:
          "Es lo que convierte este documento en algo que se puede revisar en tres meses, y va como anexo aparte porque se actualiza mientras el cuerpo no cambia. Una fila por cada vez que el documento promete medir algo, y cada fila con cinco columnas: el número, el registro o la pantalla de donde sale, cada cuánto se lee, el puesto que lo lee, y el valor de hoy con la fecha en que se tomó. La fila que todavía no tiene número lo dice con esas palabras y nombra el registro que habría que abrir: confesar el hueco es información útil, rellenarlo con un número que nadie midió es una mentira que vuelve en tres meses. Sin el valor de hoy no existe la pregunta de si funcionó, porque hay un número y nada contra qué compararlo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "producto.reclamos" },
          { de: "afirmaciones", busca: "qué número mira la Gerencia hoy para saber si la semana salió bien, en qué pantalla o cuaderno lo lee y qué día de la semana lo mira" },
        ],
        cubre: [5, 6],
        si_falta: "¿Dónde está anotado el número de reclamos que te llegaron el mes pasado?",
      },
      {
        clave: "tipo_de_persona_y_evaluacion",
        titulo: "Qué tipo de persona buscamos y con qué se la evalúa",
        por_que:
          "Aquí se escribe la clase de persona que la empresa quiere y, pegado a cada característica, la conducta que la demuestra y la que la niega: sin eso, selección y evaluación se quedan con una lista de adjetivos que nadie puede puntuar. Las dimensiones de la evaluación entran con tres cosas cada una: de qué registro sale la evidencia, con qué escala se puntúa y qué puesto pone el puntaje. Un documento que prohíbe depender de la opinión del jefe y después no entrega escala ni evaluador se incumple solo, porque al jefe no se le dio otra cosa. Las preguntas que el trabajador se hace a sí mismo pueden quedarse, pero no cuentan como evaluación. Y donde el título anuncia una cantidad de características o de dimensiones, debajo van exactamente esos renglones, uno por línea y ninguno pegado al de arriba: el trabajador que encuentra siete donde se le anunciaron ocho deja de leer con atención.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.evaluacion" },
          { de: "activo", clave: "personas.habilidades" },
          { de: "activo", clave: "personas.meritos" },
        ],
        cubre: [4, 7, 13],
        si_falta: "¿Con qué dato en la mano decidiste el último aumento de sueldo que diste?",
      },
      {
        clave: "error_negligencia_incumplimiento",
        titulo: "Error, negligencia e incumplimiento deliberado: quién clasifica y dónde queda",
        por_que:
          "Distinguir al que se equivocó de buena fe del que ignoró un control a propósito es lo más valioso que puede traer un documento de cultura: evita castigar todos los errores y evita tolerar cualquier conducta con la excusa de que fue un error. Pero una clasificación que nadie firma y que no queda anotada no se puede aplicar: la segunda vez que pasa lo mismo nadie puede probar que ya había pasado. Por eso cada una de las tres categorías entra con el puesto que clasifica el hecho, el registro donde queda la clasificación con su fecha, y el documento nombrado —con su código— que fija qué se hace después. Si ese documento todavía no existe, se dice así y entra en la lista de lo pendiente.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.disciplina" },
          { de: "activo", clave: "personas.reglamento" },
          { de: "activo", clave: "procesos.incidencias" },
          { de: "asesor_legal", sobre: "qué consecuencia puede fijar la empresa cuando alguien ignora un control a propósito, con qué procedimiento escrito y qué se le tiene que entregar al trabajador" },
        ],
        cubre: [9, 12],
        si_falta: "La última vez que alguien incumplió un control a propósito, ¿qué hiciste y dónde quedó anotado?",
      },
      {
        clave: "cruce_con_reglamento_y_funciones",
        titulo: "Tabla de cruce: cada conducta, contra el reglamento y contra la ficha de puesto",
        por_que:
          "Dos documentos de la misma empresa que le piden cosas distintas a la misma persona se anulan entre los dos, y el trabajador aprende que los documentos de la casa se pueden ignorar. Esta tabla pone en una fila cada conducta que el manual exige y en las columnas de al lado dónde se exige de verdad: la falta del reglamento interno que la nombra, la función de la ficha de puesto que la contiene, y el monto o el tope que la hace posible. Pedirle a alguien que resuelva dentro de su autoridad cuando no hay un solo monto escrito en ningún documento de la empresa es pedirle que adivine. Cada remisión a otro documento va con su código y su versión, y lo que todavía no existe se escribe así, no se da por supuesto.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.reglamento" },
          { de: "activo", clave: "personas.funciones" },
          { de: "organigrama" },
        ],
        cubre: [9, 10],
        si_falta: "¿En qué documento está escrito hasta dónde puede resolver solo el encargado de una sede?",
      },
      {
        clave: "plan_de_bajada",
        titulo: "Cómo baja esta identidad: qué documento, qué puesto y qué fecha",
        por_que:
          "Un manual de cultura que termina diciendo con qué sistemas va a conectarse y no dice quién los escribe ni cuándo, se queda en la carpeta. Esta sección es una tabla con una fila por cada pieza que tiene que bajar —entre ellas el organigrama, el manual de funciones, los perfiles, la selección, la inducción, la matriz de habilidades, la evaluación, los protocolos, los controles y los indicadores— y tres columnas: el documento que se escribe, el puesto que responde por él y la fecha. Se ordena por etapas, y la primera etapa es corta a propósito: intentar bajar todo al mismo tiempo es la forma más segura de no bajar nada. Diecisiete compromisos sin responsable son cero compromisos.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "direccion.plan_empresarial" },
          { de: "decision_gerencia", sobre: "qué documento de la bajada se escribe primero, qué puesto responde por cada uno y en qué fecha queda cada uno terminado" },
        ],
        cubre: [3, 11],
        si_falta: "¿Qué puesto se va a sentar a escribir el manual de funciones, y qué día empieza?",
      },
      {
        clave: "constancia_de_entrega_y_lectura",
        titulo: "Constancia de entrega y lectura, con firma del trabajador",
        por_que:
          "Un documento de cultura que nadie firmó es una carpeta, no una cultura: sin firma de recepción el trabajador siempre puede decir que no lo conocía, y toda la conducta que el manual declara deja de ser exigible. El anexo lleva cinco campos —nombre, documento de identidad, fecha, firma y el puesto que se lo explicó— y separa la fecha de entrega de la fecha en que se explicó, porque entregar un documento y enseñarlo no son lo mismo. También dice en qué momento se entrega, el día que la persona entra y el día que se aprueba una versión nueva, y qué pasa con quien ya estaba en la empresa antes de esta versión.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.onboarding" },
          { de: "activo", clave: "personas.identidad" },
        ],
        cubre: [15],
        si_falta: "La última persona que entró a la empresa, ¿quién se sentó a explicarle cómo se trabaja aquí?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Lo que sale de la entrega hasta que responda el asesor",
        por_que:
          "Este manual lo va a firmar el trabajador, así que es un documento que se le puede oponer: lo que diga sobre observarlo, evaluarlo y sancionarlo se verifica antes y no después. Van marcadas y fuera de la entrega la observación sin aviso previo, el cliente incógnito aplicado al trabajador, la evaluación que afecte el sueldo, el puesto o la permanencia, el legajo donde se anotan las conductas, y el tratamiento de los datos personales del trabajador y de sus evaluaciones. El documento no fija por su cuenta la consecuencia, el plazo ni el monto, y no se conforma con remitir a la norma aplicable sin decir quién la revisó: una cláusula inventada en un documento firmado la paga la empresa.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "la observación del trabajador sin aviso previo, la evaluación que afecte sueldo o permanencia, el legajo de conductas y la conservación de los datos personales del trabajador" },
        ],
        cubre: [16],
        si_falta: "¿Qué pasó con el último trabajador al que la empresa le anotó una falta de conducta?",
      },
      {
        clave: "lo_que_todavia_no_existe",
        titulo: "Lo que este manual promete y todavía no existe",
        por_que:
          "Es la hoja que permite escribir el cuerpo del manual en presente. Todo lo que la empresa todavía no tiene sale del cuerpo y entra aquí, cada línea con la fecha en que va a existir y el puesto que responde: el informe que no se emite, la medición que nadie toma, el documento que no está escrito. Así el cuerpo declara solo lo que es verdad hoy y nadie puede alegar que la conducta exigida aún no entró en vigor. Mezclar lo que hay con lo que se quiere es la manera más eficaz de que nunca se note qué falta, y de que la palabra «progresivamente» reemplace a una fecha. Esta hoja se revisa cada vez que se aprueba una versión nueva, y lo que ya existe se tacha con la fecha en que empezó a existir.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "decision_gerencia", sobre: "qué de lo que este manual promete se compromete la Gerencia a tener escrito o medido, para qué fecha y con qué puesto a cargo" },
        ],
        cubre: [3, 6, 14],
        si_falta: "De todo lo que este manual promete, ¿qué cosa no existe todavía en la empresa?",
      },
    ],
    nunca_lleva: [
      "Listas de adjetivos sobre la propia empresa presentadas como compromisos: rentable, ordenada, segura, confiable, humana, escalable.",
      "Valores escritos en futuro —«la empresa tendrá seis valores»— en un documento que ya está vigente y que se le exige a la gente.",
      "Renglones de medición que son el nombre del concepto y nada más: «Reclamos», «Puntualidad», «Auditorías», «Satisfacción del cliente».",
      "Remisiones a documentos sin nombre: «el PDF», «el diagnóstico», «las políticas internas», «el procedimiento correspondiente».",
      "Páginas que explican qué es la cultura y por qué importa, en lugar de decir qué hace la gente el lunes y con qué se la mide.",
      "Preguntas de sí o no que el trabajador se hace a sí mismo puestas en el lugar donde debería ir la escala de la evaluación.",
      "Flechas, cadenas y fórmulas con signos de suma que ordenan palabras sin nombrar un puesto responsable ni una fecha.",
      "Dos valores con la misma lista de conductas debajo, diferenciados solo por el título que llevan encima.",
      "Una visión con un año distinto al horizonte que declara la portada del mismo documento.",
    ],
  },

  instructivo: {
    clave: "instructivo",
    nombre: "Instructivo del puesto: la guía operativa de quien lo ejecuta",
    para_quien:
      "Lo lee y lo firma la persona que ocupa el puesto, muchas veces de pie y con un cliente adelante; lo aprueba quien la supervisa; y lo abre quien la reemplaza el día que falta. Cuerpo de seis a doce páginas por puesto, más una hoja de pared de una sola cara por cada procedimiento que se hace a diario.",
    exigencias_que_tenia_la_vara: 17,
    secciones: [
      {
        clave: "portada_version_y_recepcion",
        titulo: "Portada: puesto, sede, versión, quién lo aprobó y firma de quien lo ejecuta",
        por_que:
          "Un instructivo sin versión ni fecha no se puede exigir: nadie sabe si lo que la persona sigue en ventanilla es lo último o un borrador que quedó dando vueltas. La portada separa dos hechos que se confunden siempre: quién lo aprobó y qué día, por un lado, y desde qué día rige, por otro. Y al final va el bloque de recepción con nombre, documento de identidad, fecha y firma de quien lo va a ejecutar, porque un documento sin firma de recibido deja al trabajador con razón cuando dice que no lo conocía.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "decision_gerencia", sobre: "qué puesto aprueba el instructivo de cada puesto, qué día lo aprueba y desde qué día rige la versión" },
        ],
        cubre: [15],
        si_falta: "¿Qué día firmó quien supervisa el instructivo que hoy sigue la persona en la ventanilla?",
      },
      {
        clave: "identificacion_del_puesto_y_sede",
        titulo: "De qué puesto es este documento, y de qué sede",
        por_que:
          "Un instructivo de dos puestos no se le puede entregar a ninguno de los dos: el que lo recibe no sabe qué parte le toca y se queda con la que le conviene. El encabezado nombra un solo puesto y la sede donde ese puesto trabaja, con el mismo nombre que trae el organigrama, para que el documento se pueda cruzar con la ficha del puesto y con la planilla. Todo lo que aparezca aquí y sea trabajo de otro puesto —supervisar, orientar, recuadrar la caja de otro— sale a su propio instructivo con su propio nombre.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
          { de: "decision_gerencia", sobre: "en qué sede trabaja cada puesto, cuáles rotan entre sedes y con qué nombre se llama cada puesto de aquí en adelante" },
        ],
        cubre: [1],
        si_falta: "¿En qué tienda trabajó ayer la persona que ocupa ese puesto?",
      },
      {
        clave: "mapa_de_la_jornada",
        titulo: "Todo lo que hace el puesto, en el orden del día",
        por_que:
          "Esta sección es la tabla que decide si el documento está terminado o es un apunte. Lista todas las funciones del puesto —las de su ficha, o las que la propia persona dictó— y al lado de cada una dos cosas: en qué momento corre, de una lista cerrada (apertura, durante la jornada, cierre, semanal, mensual o según requerimiento), y si su procedimiento está escrito más adelante o vive en otro documento, dicho con nombre. Lo que no tenga ninguna de las dos cosas queda a la vista como hueco, y los huecos nunca caen en lo fácil: caen en lo que nadie quiso escribir. Después se ordena: primero lo de la apertura, luego lo del día, luego el cierre, porque un documento que acompaña la jornada se usa y una lista de obligaciones hay que leerla entera para saber qué toca ahora.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.funciones" },
          { de: "activo", clave: "procesos.mapa_procesos" },
          { de: "afirmaciones", busca: "qué hace la persona de ese puesto desde que abre hasta que cierra, en el orden en que lo hace, y qué hace solo una vez al mes" },
        ],
        cubre: [2, 6],
        si_falta: "La última jornada completa de esa persona, ¿qué hizo desde que abrió la tienda hasta que la cerró?",
      },
      {
        clave: "procedimiento_paso_a_paso",
        titulo: "Cada procedimiento: con qué hecho empieza, los pasos numerados, y con qué hecho termina",
        por_que:
          "Es el corazón del documento y donde se cae la mayoría. Cada procedimiento abre con el hecho que lo dispara y cierra con el hecho que lo termina, y los dos tienen que poder verse desde afuera: el cliente pone sus dólares en la ventanilla, el reloj marca la hora de cierre, la foto de la pizarra está enviada al grupo. Sin esos dos límites el trabajo se cae justo en el borde, donde cada uno pensó que lo último lo hacía el otro. Los pasos van numerados, en imperativo y uno por línea, con una sola acción cada uno: un paso sin número no se puede señalar cuando falla ni marcar como hecho, y el «nosotros» esconde quién hace qué. Y todo lo que una captura de pantalla muestre va escrito en palabras —el menú, la opción, el campo—, porque las capturas envejecen con la primera actualización del sistema y una imagen no se lee en voz alta ni se pega en la pared.",
        obligatoria: true,
        de_donde_sale: [
          { de: "procesos" },
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "procesos.sistemas" },
        ],
        cubre: [3, 4, 5],
        si_falta: "Cuando se abre la ventanilla, ¿cuál es la primera cosa que esa persona hace con las manos?",
      },
      {
        clave: "donde_queda_la_constancia",
        titulo: "Dónde queda escrito que el procedimiento se hizo",
        por_que:
          "Un procedimiento sin lugar de registro no se puede revisar ni al día siguiente, y entonces el único control que queda es el dueño mirando. Cada procedimiento cierra nombrando el lugar exacto donde el resultado queda: el sistema y la pantalla, el nombre del archivo, el cuaderno o el grupo. «En el sistema» y «en el Excel» no sirven, porque no se puede ir a mirar. Y si hoy el resultado no queda en ninguna parte, eso se escribe así, con el registro que habría que abrir: confesar el hueco es información útil y rellenarlo es una mentira que vuelve en tres meses. Una señal que aparece en pantalla y desaparece no es una constancia: cuando aparece un faltante, no hay con qué saber en qué turno nació.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.sistemas" },
          { de: "activo", clave: "procesos.indicadores" },
          { de: "procesos" },
        ],
        cubre: [7],
        si_falta: "Al cerrar el día de ayer, ¿en qué pantalla o en qué cuaderno quedó escrito el resultado del cuadre?",
      },
      {
        clave: "accesos_sin_claves_escritas",
        titulo: "Los accesos del puesto: quién los entrega y dónde se firman",
        por_que:
          "Un instructivo circula: se imprime, se fotografía, se manda por mensaje y se queda en el teléfono de quien ya salió de la empresa. Por eso ninguna contraseña, PIN, token, red inalámbrica ni usuario se escribe adentro, y tampoco se explica en qué teléfono y en qué aplicación vive el código que autoriza una transferencia. En su lugar va la lista de accesos que el puesto necesita, el puesto que entrega cada uno, y el acta donde se firma la entrega y la devolución, una línea por acceso. La empresa ya pagó una vez el no tener esa acta: alguien salió y se fue con los tokens y los correos abiertos.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.controles" },
          { de: "decision_gerencia", sobre: "qué puesto entrega cada acceso del puesto y dónde se archiva el acta de entrega y de devolución firmada" },
        ],
        cubre: [8],
        si_falta: "¿Quién le entregó al último cajero que entró la contraseña del sistema de cambio?",
      },
      {
        clave: "topes_umbrales_y_escalamiento",
        titulo: "Hasta dónde decide solo: tope, umbral y a quién consulta",
        por_que:
          "Un paso sin cifra convierte cada operación en una llamada, y la llamada vuelve a la supervisora o al dueño: el puesto queda de adorno y la cola se para. Cada paso que implica decidir trae tres cosas: la cifra con su moneda dicha, el umbral desde el cual el procedimiento cambia —la operación que obliga a un paso extra, el monto que habilita un precio preferencial— y el puesto al que se consulta cuando se pasa de ahí. «Monto alto», «cantidad mayor» y «montos menores» no son topes: con eso, tres personas del mismo negocio cobran tres precios distintos el mismo día, a dos cuadras una de la otra. Mientras la Gerencia no firme la tabla va marcada como pendiente de firma: pendiente se puede entregar, inventada no.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "el tope en moneda dicha que cada paso decide solo, el umbral desde el cual se pide autorización y el puesto que la da" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [9],
        si_falta: "¿Desde qué monto un cajero tiene que pedir autorización antes de cerrar la operación?",
      },
      {
        clave: "decisiones_que_no_son_del_puesto",
        titulo: "Lo que este puesto no decide, aunque lo tenga a mano",
        por_que:
          "Un documento que ordena algo que en la práctica no manda la persona deja de ser exigible completo: el trabajador aprende que se puede ignorar y a partir de ahí ignora también los pasos que sí importan. Esta sección lista las decisiones que la Gerencia se queda —el precio del día, el acceso al dinero guardado, las excepciones, la entrega de un acceso— y cada paso del instructivo se escribe contra esa lista, ajustando el verbo: quien propone, propone; quien aprueba, aprueba. Es lo que corrige el caso más común, que es el puesto armando el precio por su cuenta porque nadie le dijo nunca que ese no era su trabajo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "qué decisiones no se delegan a este puesto: el precio del día, el acceso al dinero guardado, las excepciones y la entrega de accesos" },
          { de: "activo", clave: "procesos.politicas" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [13],
        si_falta: "La última vez que alguien de ventanilla quiso decidir algo y le dijiste que eso lo decides tú, ¿qué era?",
      },
      {
        clave: "de_donde_llega_el_dato_del_dia",
        titulo: "De qué puesto y por qué canal llega el dato con el que se abre",
        por_que:
          "El precio con el que abre la ventanilla no puede depender de que una persona conteste un mensaje. Donde hoy hay un nombre propio, esta sección pone el puesto que responde, el canal oficial por donde se pide y la hora a la que ese dato tiene que estar puesto. Vale para el precio del día y para cualquier otro dato de entrada que venga de afuera del puesto. El día que la persona con nombre no contesta, las tres sedes abren sin precio; y el día que se molesta, la empresa descubre que su dato más crítico era un favor de alguien que no trabaja ahí.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "decision_gerencia", sobre: "qué puesto publica el precio del día y los demás datos de entrada, por qué canal y a qué hora los publica" },
          { de: "afirmaciones", busca: "de quién y por qué canal llega hoy el tipo de cambio a cada sede, a qué hora llega y quién lo pide" },
        ],
        cubre: [10],
        si_falta: "Esta mañana, ¿quién le dijo al cajero a qué precio comprar el dólar?",
      },
      {
        clave: "cuando_el_sistema_se_cae",
        titulo: "Qué se hace cuando el sistema o el canal se cae",
        por_que:
          "Es el único momento del día en que no hay con qué reconstruir qué pasó, y por eso es el momento exacto en que nace un faltante. Cada procedimiento que depende de un sistema cierra con su camino alterno escrito: quién avisa, a quién y por qué canal, hasta qué monto se puede seguir operando mientras, qué queda prohibido hacer, dónde se anota lo que se hizo a mano y cuándo se pasa al sistema. «Lo hacemos con la calculadora y un apunte» no es un camino alterno: es la ausencia de uno. Y remitir a los protocolos de la empresa no sirve cuando esos protocolos no están escritos en ninguna parte.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "procesos.controles" },
          { de: "decision_gerencia", sobre: "hasta qué monto y por cuánto rato se puede seguir operando con el sistema caído, y qué puesto autoriza seguir" },
        ],
        cubre: [11],
        si_falta: "La última vez que el sistema de cambio se quedó parado, ¿qué hizo el cajero con el cliente adelante?",
      },
      {
        clave: "doble_confirmacion_del_dinero",
        titulo: "Los pasos donde el dinero sale: quién confirma antes",
        por_que:
          "La salida de dinero es el único paso que no tiene vuelta: una transferencia mal hecha no se corrige, se reclama. Cada paso donde el dinero sale de la empresa o cambia de manos —una transferencia, la entrega de efectivo a otra caja, la venta de divisa a la caja principal, la entrega de una clave— nombra el segundo puesto que confirma antes de ejecutar el número de cuenta, el titular, el monto y la moneda, y dónde queda esa confirmación. Con un solo par de ojos el error y la mala fe se ven exactamente igual: no se ven. Y el puesto que mueve el dinero de varias empresas es justo el que suele tener el instructivo más corto.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "qué puesto confirma los datos antes de que salga una transferencia y qué puesto compara después el movimiento del banco" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [12],
        si_falta: "Antes de que salga una transferencia desde la cuenta de la empresa, ¿quién revisa los datos aparte de quien la hace?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Lo que sale de la entrega hasta que responda el asesor",
        por_que:
          "El instructivo es el documento que la persona de ventanilla de verdad sigue, así que un umbral escrito ahí se aplica aunque nadie lo haya verificado nunca. Todo lo que suene a obligación de norma —el monto desde el cual se llena una declaración, la toma y la guarda de los datos de identidad del cliente, los pasos que dejan los fondos del turno a cargo del trabajador, los descuentos y los faltantes— va marcado y queda fuera de la entrega definitiva hasta que vuelva la respuesta por escrito. No se fija aquí la cifra, el tiempo de conservación ni la norma: una cláusula inventada en un documento que alguien firmó la paga la empresa, no la consultora.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "el monto desde el cual corresponde una declaración, la conservación de los datos del cliente y los pasos que ponen los fondos del turno a cargo del trabajador" },
        ],
        cubre: [14],
        si_falta: "En la operación más grande que pasó por tu ventanilla, ¿qué le pidieron al cliente y dónde quedó guardado ese dato?",
      },
      {
        clave: "hoja_de_pared",
        titulo: "La hoja que se pega en la ventanilla, de una sola cara",
        por_que:
          "Lo que no cabe en una cara no se lee con un cliente adelante y una cola detrás. Por cada procedimiento de apertura, de la jornada y de cierre se saca una hoja de una sola cara: pasos numerados en imperativo, con los topes, los umbrales y el puesto al que se escala, y nada más —sin diagnóstico, sin justificación y sin capturas. El documento completo es para enseñar y para quien reemplaza; esta hoja es la que se usa todos los días. Sin ella el instructivo todavía se entrega, diciendo que falta la versión que de verdad va a la pared.",
        obligatoria: false,
        de_donde_sale: [
          { de: "procesos" },
          { de: "activo", clave: "procesos.procedimientos" },
        ],
        cubre: [16],
        si_falta: "¿Qué hoja tiene pegada hoy el cajero a la vista en su ventanilla?",
      },
      {
        clave: "solo_instruccion",
        titulo: "Todo lo que está escrito aquí ordena una acción",
        por_que:
          "Un párrafo que no instruye le enseña al trabajador, en la primera página que lee, que este documento no habla de su trabajo; después de eso no lee el resto, y las partes que sí importan se pierden junto con las que sobran. Lo que no ordena una acción de este puesto sale y vuelve al documento de la casa donde vive: el propósito, la misión y la visión, las metas de largo plazo, las frases de marca, los objetivos comerciales, los correos y los datos de otras empresas del grupo. También se va la lista de servicios que no cambia ningún paso. Si queda algo pegado, el documento se entrega igual, diciendo qué hay que limpiar.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.mvv" },
          { de: "activo", clave: "procesos.procedimientos" },
        ],
        cubre: [17],
        si_falta: "De lo que el propio personal escribió sobre su puesto, ¿qué parte copiaron de otro documento de la empresa?",
      },
    ],
    nunca_lleva: [
      "Pasos en primera persona del plural —«enviamos», «marcamos», «nos dirigimos»—, que esconden a quién le toca hacerlos.",
      "Pasos que solo se entienden mirando la captura: «damos clic en el cuadro», «ingresamos los montos de la franja de color».",
      "Contraseñas, PIN, usuarios, códigos de autorización o nombres de redes inalámbricas escritos o fotografiados adentro.",
      "Nombres propios de personas, o nombres de chats y contactos, como fuente del dato con el que el puesto abre su jornada.",
      "Decisiones descritas sin cifra: «monto alto», «cantidad mayor», «montos menores», «precio preferencial» sin su umbral.",
      "Misión, visión, metas de largo plazo, frases de marca o correos de otras empresas pegados entre los pasos del procedimiento.",
      "Frases que no ordenan nada: que la atención consiste en ser amable, crear un ambiente cordial o cumplir las normas de seguridad.",
      "Páginas en blanco, o con el título solo, dejadas para completar después; y páginas que son una captura sin un paso escrito al lado.",
    ],
  },

  organigrama: {
    clave: "organigrama",
    nombre: "Informe de diseño organizacional y organigrama",
    para_quien:
      "Lo aprueba y lo firma la Gerencia; lo usa a diario quien administra el personal para contratar, repartir carga y cubrir ausencias; y lo lee el trabajador el día que entra, para saber a quién le reporta y quién lo cubre. De ocho a quince páginas: el organigrama en una cara, la tabla de puestos completa en otra y una página por sede. Los perfiles y las funciones viven en el manual de funciones, no aquí.",
    exigencias_que_tenia_la_vara: 17,
  
    secciones: [
      {
        clave: "portada_version_y_vigencia",
        titulo: "Portada: versión, quién aprobó la estructura y desde cuándo rige",
        por_que:
          "Una estructura sin fecha no se puede exigir: nadie sabe si lo que está leyendo es la que manda hoy o la de dos reorganizaciones atrás. Y aprobar no es entrar en vigencia: una cosa es quién firmó y qué día lo decidió, otra es desde qué día esta estructura reemplaza a la anterior. Van escritas por separado porque son dos hechos distintos y se confunden todo el tiempo. El bloque de firmas lleva nombre, cargo y fecha llenos, en quien elabora y en quien aprueba, y el cargo que acompaña a cada firma tiene que ser uno de los puestos que el propio documento dibuja.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "decision_gerencia", sobre: "quién aprueba esta versión de la estructura, qué día la aprueba y desde qué día reemplaza a la anterior" },
        ],
        cubre: [11, 12],
        si_falta: "¿Qué día firmó la Gerencia el organigrama que la empresa está usando hoy?",
      },
      {
        clave: "inventario_de_puestos",
        titulo: "Todos los puestos: los que tienen persona y los que están vacíos",
        por_que:
          "Un organigrama que dibuja solo los puestos ocupados describe la empresa que hay hoy en ventanilla, no la que la empresa necesita cubrir. Aquí entra un recuadro por cada puesto que la empresa tiene registrado, y cada uno dice si hoy tiene persona o está vacío; el vacío dice además desde cuándo lo está y qué puesto está cargando esas funciones mientras tanto, que casi siempre es el de más arriba. Al pie va el par de conteos: cuántos recuadros tienen persona y cuántos están esperando. Y cada puesto se escribe con un solo nombre, el mismo en todas las páginas del documento: con dos escrituras para el mismo puesto no se puede cruzar la estructura con la planilla ni con el manual de funciones.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
          { de: "decision_gerencia", sobre: "qué puestos la empresa necesita tener cubiertos este año, cuáles quedan vacantes a propósito y cuáles se cubren primero" },
        ],
        cubre: [1, 2, 11],
        si_falta: "Hoy, ¿qué puestos de tu empresa no tienen a nadie sentado?",
      },
      {
        clave: "linea_de_mando",
        titulo: "Un solo jefe por puesto, y ese jefe con recuadro propio",
        por_que:
          "Dos jefes escritos es una instrucción contradictoria con respaldo documental: el día del conflicto cada uno muestra su página y la orden que se cumple es la del que grita más fuerte. Esta sección escribe, puesto por puesto, el nombre del único jefe inmediato, y obliga a que ese jefe tenga recuadro propio en el mismo documento. Después se cruza contra lo que cada recuadro dice que supervisa: si un puesto cuelga de un mando en la línea de reporte y de otro en un campo de supervisión, se corrige ahí mismo, no se deja para la próxima versión.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
          { de: "activo", clave: "personas.funciones" },
        ],
        cubre: [3],
        si_falta: "La última vez que un cajero recibió una orden de alguien que no es su jefe, ¿quién se la dio?",
      },
      {
        clave: "niveles_y_cadena_de_reporte",
        titulo: "Los niveles, contados saltando de jefe en jefe",
        por_que:
          "Los niveles son el dato que todo el mundo cita y que nadie comprueba. Aquí no se declaran: se cuentan. Para cada puesto se sube por su jefe inmediato hasta el que no tiene jefe, y el número de saltos es su nivel; el número de niveles del documento es el largo de la cadena más larga. Así se ve de inmediato si hay puestos colgados a dos saltos del dueño y otros a cinco, que es la señal de que la delegación que el documento promete todavía no existe.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
        ],
        cubre: [4],
        si_falta: "La última vez que un cajero cambió de puesto, ¿por qué manos pasó esa decisión antes de llegar a la tuya?",
      },
      {
        clave: "tramo_de_mando",
        titulo: "Cuánta gente tiene debajo cada jefe, en número",
        por_que:
          "Decir que el tramo de mando está «controlado» sin escribir un número deja el principio sin forma de comprobarse ni de incumplirse. Cada puesto con gente debajo lleva escrito a cuántas personas les reporta directamente, y ese número se compara con el tope que la Gerencia fijó. El que pasa el tope aparece en la lista de ajustes con el puesto nuevo o el traslado que lo resuelve: cuando un jefe tiene demasiada gente debajo deja de supervisar y empieza a apagar incendios, y en una empresa de efectivo eso se paga en faltantes.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "decision_gerencia", sobre: "cuántas personas como máximo puede tener debajo un mismo jefe, y qué se hace con el puesto que hoy pasa ese tope" },
        ],
        cubre: [5],
        si_falta: "¿Cuánta gente le reporta directamente a quien supervisa la sede principal?",
      },
      {
        clave: "respaldo_y_quien_cubre",
        titulo: "Quién cubre cada puesto, y qué no hereda el que cubre",
        por_que:
          "Sin respaldo escrito, una ausencia de tres días la resuelve el dueño en persona o no la resuelve nadie. Cada puesto nombra el puesto que lo cubre —no «el jefe inmediato»— y dice qué queda fuera del reemplazo: las claves, las llaves, los topes de monto, las firmas y el acceso al dinero guardado. Decir qué no hereda el que cubre es lo que evita que una ausencia se convierta en un acceso regalado. Y un respaldo escrito sobre un puesto vacío no es un respaldo: es una ausencia tapando otra.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.plan_personal" },
          { de: "activo", clave: "personas.habilidades" },
          { de: "activo", clave: "procesos.controles" },
          { de: "organigrama" },
        ],
        cubre: [6],
        si_falta: "La última vez que faltó quien custodia el dinero guardado, ¿quién abrió la caja ese día?",
      },
      {
        clave: "puestos_sin_ficha",
        titulo: "Los puestos dibujados que todavía no tienen funciones escritas",
        por_que:
          "Un puesto que aparece en la estructura sin funciones escritas custodia o manda sin límites, y nadie puede reclamarle nada el día que algo sale mal. Esta sección cruza los recuadros contra las fichas del manual de funciones y deja la lista de los que no tienen: cada uno marcado en el propio dibujo y anotado aquí con el puesto que va a escribir la ficha y el día en que la entrega. Reconocer el hueco en una línea de las conclusiones no lo cierra; ponerle dueño y fecha, sí.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.funciones" },
          { de: "organigrama" },
          { de: "decision_gerencia", sobre: "qué puesto escribe las fichas que faltan y en qué orden se entregan" },
        ],
        cubre: [7],
        si_falta: "¿De qué puestos de tu empresa no existe nada escrito sobre lo que hacen?",
      },
      {
        clave: "tabla_de_la_estructura",
        titulo: "La estructura como tabla: una fila por puesto",
        por_que:
          "Lo que vive dentro de una figura no se puede cruzar con la planilla, ni pegar en un correo, ni corregir sin volver a dibujarlo, así que se desactualiza con la primera contratación y nadie se entera. Al dibujo lo acompaña siempre la tabla, con una fila por puesto y estas columnas: nombre del puesto, jefe inmediato, a quiénes supervisa, cuántos le reportan, sede, estado y respaldo. Una fila por puesto y un puesto por fila: ninguna celda junta dos cargos ni un cargo con una cantidad de personas, porque así no se puede contar quién manda ni cuántos son. Si una misma persona ocupa dos puestos, aparece en las dos filas y se dice cuál es el principal.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
          { de: "activo", clave: "personas.funciones" },
        ],
        cubre: [8, 10],
        si_falta: "La última vez que entró alguien nuevo, ¿dónde le mostraron quién manda sobre quién?",
      },
      {
        clave: "estructura_por_sede",
        titulo: "Quién está en cada sede y en qué horas, sede por sede",
        por_que:
          "Hay sedes que cierran más tarde que el horario del puesto que manda sobre ellas: en ese tramo hay dinero en ventanilla y no hay a quién llamar escrito en ninguna parte. Esta sección pone una página por sede con su hora real de apertura y de cierre, los puestos asignados y el horario de cada uno, y marca los tramos en que la sede está abierta y no hay ningún puesto de mando presente. Es el único lugar del documento donde ese hueco se ve de un golpe. Si un puesto rota entre sedes, lo dice y trae el horario de cada una.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "hora de apertura, de cierre y de refrigerio de cada sede, y qué puesto queda a cargo en la última hora de cada una" },
          { de: "decision_gerencia", sobre: "en qué sede trabaja cada puesto, cuáles rotan entre sedes y qué puesto queda a cargo del cierre de cada sede" },
        ],
        cubre: [9],
        si_falta: "¿A qué hora cerró ayer la sede que cierra más tarde, y quién estuvo a cargo hasta esa hora?",
      },
      {
        clave: "plan_de_las_recomendaciones",
        titulo: "Lo que hay que arreglar, con dueño, día y prueba",
        por_que:
          "Una recomendación sin dueño se lee, se aprueba y no pasa nada: el informe queda bien y la empresa sigue igual. Cada cosa por arreglar entra aquí numerada y con tres datos obligados: el puesto que la ejecuta, el día en que la entrega y el documento o registro que servirá de prueba de que se hizo. Llamarla prioritaria no reemplaza a ninguno de los tres. Y lo que se recomienda tiene nombre propio: no «un plan de sucesión para puestos críticos», sino qué puestos, quién cubre a quién y qué le falta a ese alguien para poder cubrirlo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "direccion.plan_empresarial" },
          { de: "activo", clave: "personas.plan_personal" },
          { de: "decision_gerencia", sobre: "en qué orden se cierran los huecos de la estructura, qué puesto responde por cada uno y con qué fecha de entrega" },
        ],
        cubre: [13],
        si_falta: "La última recomendación que te hicieron sobre el personal, ¿quién quedó encargado de cumplirla?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Lo que sale de la entrega hasta que responda el asesor",
        por_que:
          "Una decisión inventada en un documento firmado la paga la empresa, no la consultora. Todo lo que la estructura toque y huela a ley entra aquí como pregunta y queda fuera de la entrega hasta que vuelva la respuesta por escrito: los puestos marcados sin control de horario, la gente de una empresa tercera dibujada con línea de mando adentro, cualquier puesto al que se le cargue una pérdida, y el puesto que responde ante la autoridad del sector por el cumplimiento. Ese último deber tiene que aterrizar en un recuadro con nombre, porque un deber frente a la autoridad que no está en ningún recuadro no tiene quién lo cumpla. Nada de plazos, montos ni artículos que nadie verificó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "los puestos marcados sin control de horario, el personal de terceros dibujado dentro de la estructura, las pérdidas cargadas a un puesto y la designación del puesto que responde ante la autoridad del sector" },
        ],
        cubre: [16, 17],
        si_falta: "¿Quién de tu equipo trabaja hoy sin marcar su hora de entrada?",
      },
      {
        clave: "cambios_desde_la_version_anterior",
        titulo: "Qué se movió desde la versión anterior",
        por_que:
          "Una versión nueva sin lista de cambios obliga a todos los que la leen a comparar dos dibujos a ojo, y nadie lo hace: se asume que es igual con otro color. Van tres columnas con nombre de puesto: los recuadros nuevos, los que se eliminaron y los que cambiaron de jefe inmediato. Es lo que permite saber si el cambio de mando que alguien recuerda quedó escrito o se perdió entre una versión y la siguiente.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.organigrama" },
          { de: "organigrama" },
        ],
        cubre: [14],
        si_falta: "Desde la última vez que dibujaron la estructura, ¿qué puesto se creó y cuál desapareció?",
      },
      {
        clave: "registro_de_la_supervision",
        titulo: "Dónde queda la constancia de cada línea de supervisión",
        por_que:
          "Una línea de supervisión sin registro es una flecha en un dibujo: no se puede verificar ni al día siguiente, y lo que no se puede verificar se deja de hacer sin que nadie lo note. Por cada puesto que supervisa a otro va el registro donde queda la prueba: la hoja de cuadre, el reporte del día, el cuaderno o el módulo del sistema. Una conversación o un grupo de mensajería no sirven de registro, porque de ahí no se saca la constancia de un día pasado.",
        obligatoria: false,
        de_donde_sale: [
          { de: "procesos" },
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.indicadores" },
        ],
        cubre: [15],
        si_falta: "Cuando el supervisor revisa el cierre de caja de una sede, ¿dónde queda anotado que lo revisó?",
      },
    ],
  
    nunca_lleva: [
      "Párrafos que explican qué es un organigrama o qué es una estructura funcional-lineal: quien lo abre ya sabe para qué lo abrió.",
      "Cuadros de tipología organizacional —centralización, formalización, diferenciación horizontal y vertical— que se copian a cualquier empresa del país sin cambiar una palabra.",
      "Fortalezas que repiten como logro lo que los principios ya declararon como intención, sin un conteo que lo sostenga.",
      "Celdas que juntan un puesto con una cantidad de personas: «supervisor más cajeros de la sede» no se puede contar ni mandar.",
      "Mecanismos de control escritos igual para todos los niveles: reportes diarios y supervisión directa, de la Gerencia al cajero.",
      "Cuadros de competencias con la misma formación y el mismo nivel de idioma repetidos puesto por puesto, cambiando solo los años de experiencia.",
      "Recomendaciones de una línea sin puesto responsable, sin día de entrega y sin el registro que las da por hechas.",
      "La estructura encerrada en una imagen pegada, sin la tabla que se pueda cruzar con la planilla y corregir sin volver a dibujar.",
      "Conclusiones que declaran la estructura coherente e integral mientras los recuadros ocupados no cuadran con el registro de personas de la empresa.",
    ],
  },

  perfil: {
    clave: "perfil",
    nombre: "Perfil de puesto y ficha de convocatoria",
    para_quien:
      "Lo redacta quien administra el personal, lo firma Gerencia antes de que salga la convocatoria, y después lo usan el que entrevista, el que recibe al nuevo y el propio ocupante el día que entra. Dos a tres páginas por puesto, la hoja de firma al final, y el aviso que se publica en una sola cara.",
    exigencias_que_tenia_la_vara: 17,
    secciones: [
      {
        clave: "identificacion_del_puesto",
        titulo: "El puesto y su nombre, uno solo y el mismo de siempre",
        por_que:
          "El puesto se escribe con el mismo nombre que tiene en el organigrama y en el manual de funciones, uno solo y sin juntar dos oficios con un guion. Con tres nombres distintos para el mismo puesto no se puede cruzar el perfil con el organigrama ni con la planilla, y se termina contratando para un cargo que en los papeles de la empresa no existe: el día de la evaluación nadie sabe contra qué ficha se mide al candidato. Si el nombre que se usa hoy junta dos oficios, aquí se decide cuál de los dos es el puesto y cuál es una función suya.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
          { de: "activo", clave: "personas.funciones" },
        ],
        cubre: [1],
        si_falta: "¿Con qué nombre aparece ese puesto en la lista de personal que le pasas al contador?",
      },
      {
        clave: "linea_de_mando_y_local",
        titulo: "A quién reporta, qué tiene a cargo y en qué local trabaja",
        por_que:
          "Tres campos que casi nunca están y que se escriben aquí: a qué puesto reporta el ocupante, qué puestos tiene a cargo —o la palabra ninguno— y en qué local va a trabajar; y si el puesto rota entre locales, cada local nombrado. Sin jefe escrito, el día que hay un problema el nuevo le escribe a la dueña, y la dueña vuelve a hacer el trabajo del que puso en medio. Sin local escrito nadie sabe a qué dirección se cita al candidato ni qué horario le toca, y en una empresa con más de un local abierto eso se descubre el primer día de trabajo.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "decision_gerencia", sobre: "en qué local queda este puesto, a qué puesto reporta y qué puestos quedan a su cargo" },
        ],
        cubre: [4],
        si_falta: "¿A quién le avisa la persona de ese puesto el día que no puede resolver algo sola?",
      },
      {
        clave: "para_que_existe_el_puesto",
        titulo: "Para qué existe el puesto, en una sola oración",
        por_que:
          "Una oración, y nombra el resultado que se le va a pedir: caja cuadrada sin diferencia, informe enviado dentro del horario, margen respetado, cliente registrado al entrar. No las tareas con las que lo consigue, que van más abajo, y tampoco una cualidad de la persona: «ser confiable» no es un resultado y no se puede constatar al día siguiente mirando un registro. Esta oración es lo que se le lee al candidato en el primer minuto de la entrevista y lo que el jefe usa el día que tiene que decirle que no está funcionando.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.funciones" },
          { de: "activo", clave: "procesos.mapa_procesos" },
        ],
        cubre: [2],
        si_falta: "La última vez que alguien ocupó ese puesto, ¿qué entregó al final del día para que supieras que hizo su trabajo?",
      },
      {
        clave: "funciones_tomadas_de_la_ficha",
        titulo: "Las funciones, copiadas de la ficha del puesto",
        por_que:
          "Las funciones del perfil no se escriben de nuevo: se toman de la ficha de ese puesto en el manual de funciones, sin agregar ninguna y sin omitir ninguna de las que se hacen todos los días. Si se agrega, se exige algo que nadie va a verificar; si se omite, el candidato acepta leyendo siete funciones y entra a hacer veinte, y el que lo contrató no puede reclamarle nada de lo que no estaba escrito. Si el puesto todavía no tiene ficha, eso es lo primero que hay que hacer: un perfil escrito sin ficha es el puesto que termina cargando todo lo que nadie quiso asignar.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.funciones" },
          { de: "procesos" },
        ],
        cubre: [3],
        si_falta: "¿Qué tareas de ese puesto no pueden quedar sin hacer ni un día?",
      },
      {
        clave: "hasta_donde_decide_el_puesto",
        titulo: "Hasta dónde decide: las dos cifras del puesto",
        por_que:
          "Si el puesto decide sobre dinero, autoriza transferencias o custodia valores, van dos cifras con su moneda dicha: hasta cuánto decide solo quien ya está certificado en ese puesto, y hasta cuánto quien todavía no lo está, que puede ser cero. Los puestos que no deciden dinero lo dicen con esa palabra: ninguno. Un puesto de ventanilla sin tope escrito no es un puesto, es una ambigüedad con sueldo: cada operación sube a la dueña hasta que alguien se cansa y decide solo. La segunda cifra es la que evita el día caro, cuando falta gente en ventanilla y alguien opera solo «por mientras». «A convenir», «montos menores» y «según criterio del jefe» no son topes, y una cifra sin moneda tampoco.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "hasta qué monto decide solo cada puesto, en qué moneda, y qué puede decidir quien todavía no está certificado" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [5],
        si_falta: "¿Hasta qué monto cierra una operación la persona de ese puesto sin llamarte?",
      },
      {
        clave: "accesos_y_custodias_del_puesto",
        titulo: "Lo que se le entrega: accesos y custodias, uno por uno",
        por_que:
          "Cada cosa dicha por separado y marcada con un sí o un no: usuario del sistema, correo de la empresa, token del banco, clave del dinero guardado, llave del local, caja chica, acceso a los datos de los clientes. «Se le otorgarán los accesos correspondientes» no es una lista. El candidato tiene que saber de qué se va a hacer responsable antes de aceptar, y la empresa tiene que saber qué le va a cortar el día que esa persona salga. Esta lista es además el papel contra el que después se firma la entrega y la devolución.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.sistemas" },
          { de: "decision_gerencia", sobre: "qué llaves, claves y accesos al dinero y al sistema recibe cada puesto, y cuáles no" },
        ],
        cubre: [6],
        si_falta: "¿Qué llave, qué clave y qué acceso recibe la persona el primer día en ese puesto?",
      },
      {
        clave: "requisitos_con_su_acreditacion",
        titulo: "Requisitos: cada renglón marcado y con qué se acredita",
        por_que:
          "Formación, experiencia y conocimientos van en una tabla de tres columnas: el requisito, si es obligatorio o deseable, y con qué se acredita —un documento nombrado, una prueba, o la referencia de un empleador con su dato de contacto—. La marca va en cada renglón y no en el título del bloque, porque dentro del mismo bloque hay renglones de las dos clases: así se evita lo que pasa hoy, que un bloque entero quede marcado deseable con requisitos adentro que no eran negociables. Sin la marca, el que filtra las hojas de vida descarta a quien la empresa habría contratado; sin la forma de acreditarlo, el año de experiencia que decidió la contratación nunca se verificó.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.seleccion" },
          { de: "activo", clave: "personas.funciones" },
          { de: "activo", clave: "personas.habilidades" },
        ],
        cubre: [7],
        si_falta: "Del último que contrataste para ese puesto, ¿qué papel le pediste para comprobar que tenía la experiencia?",
      },
      {
        clave: "competencias_observables",
        titulo: "Competencias escritas como conducta que se puede ver",
        por_que:
          "Cada competencia entra con cuatro cosas: la conducta que se ve, cómo se demuestra, qué la contradice y con qué se mide; y ordenada contra las cuatro partes de la evaluación de la casa: resultados, comportamiento, competencia y responsabilidad. «Responsabilidad» en quien atiende la ventanilla no es una palabra: es que cuadra su caja sin diferencias, y se mide con los cuadres del mes. Una lista de adjetivos no se puede puntuar, así que a la hora de la verdad el entrevistador califica por simpatía y después no puede explicar por qué eligió a ese. Y pedir una persona carismática no se puede marcar mirando a nadie trabajar.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.identidad" },
          { de: "activo", clave: "personas.evaluacion" },
          { de: "activo", clave: "personas.habilidades" },
        ],
        cubre: [8],
        si_falta: "La última vez que alguien de ese puesto te hizo decir «este sí sabe», ¿qué estaba haciendo?",
      },
      {
        clave: "prueba_de_oficio_del_puesto",
        titulo: "La prueba de oficio, con su mínimo escrito en número",
        por_que:
          "El requisito obligatorio principal del puesto no se cree de palabra: se prueba haciendo. La sección nombra los ejercicios que se le ponen al candidato —contar y entregar efectivo, armar un cuadre con una diferencia metida a propósito, usar la hoja de cálculo con la que se trabaja—, el puntaje de cada bloque y el mínimo para aprobar escrito en número. La entrevista se pasa hablando bien; la prueba con dinero en la mano no. Y si el perfil no dice qué prueba corresponde a ese puesto, cada entrevistador improvisa una distinta y los candidatos dejan de ser comparables.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "personas.seleccion" },
          { de: "procesos" },
        ],
        cubre: [9],
        si_falta: "Al último que entró a ese puesto, ¿qué le pusiste a hacer para saber si sabía?",
      },
      {
        clave: "con_que_se_mide_al_ocupante",
        titulo: "Con qué números se va a medir a quien ocupe el puesto",
        por_que:
          "Entre uno y tres números, cada uno con el registro, el cuaderno o el sistema de donde se lee y cada cuánto se mira. Si el número exige un reporte que la empresa no tiene hoy, se dice que no lo tiene: nada se inventa. Sin esto el jefe no puede decirle al ocupante cómo le está yendo, y la primera conversación de evaluación se vuelve un intercambio de impresiones que nadie puede sostener. Es también lo único que permite saber, meses después, si el puesto que se creó sirvió para algo.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "personas.evaluacion" },
        ],
        cubre: [10],
        si_falta: "La última vez que decidiste que alguien de ese puesto no estaba rindiendo, ¿en qué lo viste?",
      },
      {
        clave: "condiciones_del_local",
        titulo: "Condiciones: el horario real del local donde va a trabajar",
        por_que:
          "Va el horario del local donde ese puesto trabaja, con la hora de entrada, la de salida y los días de descanso dichos; y si el puesto rota entre locales, el horario de cada uno. «Jornada completa» y «horario rotativo» no son horarios: valen para cualquier empresa del país y no le dicen nada a quien tiene que organizar su semana. Cuando todos los perfiles repiten la misma palabra y los locales abren a hora distinta, el candidato firma un horario y trabaja otro: la relación arranca con una mentira escrita, el documento no vale el día del reclamo, y es la primera razón por la que alguien se va en las primeras semanas.",
        obligatoria: true,
        de_donde_sale: [
          { de: "afirmaciones", busca: "la hora de apertura, de cierre y de refrigerio de cada local, y los días en que cada uno atiende" },
          { de: "decision_gerencia", sobre: "qué horario cumple este puesto en su local, si rota entre locales y qué días descansa" },
        ],
        cubre: [11],
        si_falta: "¿A qué hora abre y a qué hora cierra el local donde va a trabajar esa persona?",
      },
      {
        clave: "remuneracion_del_puesto",
        titulo: "La remuneración, escrita de una sola forma",
        por_que:
          "O el monto con su moneda y su periodo, o la banda con su piso y su techo. Una de las dos, nunca las dos juntas: un monto y «a convenir» en la misma línea son dos cosas distintas puestas una al lado de la otra, y el candidato negocia contra una cifra que la empresa no sostiene. El día de la oferta la conversación empieza de cero con las dos partes molestas. Adentro es peor todavía: si no hay banda escrita, nadie sabe qué puede ofrecer sin preguntarle a la dueña, así que cada contratación cuesta una llamada más. Y lo que se publica en el aviso tiene que ser la misma cifra que la del perfil firmado.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "el piso y el techo de la remuneración de este puesto, su moneda y qué mueve a alguien del piso al techo" },
          { de: "activo", clave: "personas.meritos" },
        ],
        cubre: [12],
        si_falta: "¿Cuánto le pagas hoy a quien ocupa ese puesto, y en qué moneda?",
      },
      {
        clave: "aprobacion_y_firma",
        titulo: "Quién aprueba el perfil, y la fecha en que lo firmó",
        por_que:
          "El perfil cierra con el bloque de firma del puesto que lo aprueba: nombre, puesto y fecha. Y la regla va escrita como prohibición en la primera hoja: no se busca ni se comenta una vacante sin este perfil firmado. Sin firma no hay nadie que haya aprobado la búsqueda, y el perfil se vuelve un borrador que cada uno corrige mientras entrevista; así se contrata a la persona que cayó y después se le inventan las funciones. La fecha de la firma tiene que ser anterior al día en que sale el aviso, porque un perfil firmado después es un perfil escrito para explicar a quien ya se eligió.",
        obligatoria: true,
        de_donde_sale: [
          { de: "decision_gerencia", sobre: "qué puesto aprueba y firma el perfil antes de que salga cualquier convocatoria" },
          { de: "activo", clave: "personas.seleccion" },
        ],
        cubre: [13],
        si_falta: "¿Quién aprobó la última búsqueda de personal antes de que saliera el aviso?",
      },
      {
        clave: "aviso_que_se_publica",
        titulo: "El aviso que sale a la calle, y lo que no sale en él",
        por_que:
          "El aviso se saca del perfil y no es el perfil. Lleva cuántas vacantes se abren, en qué local va cada una, hasta qué día se reciben postulaciones y a dónde llegan, escrito: sin fecha de cierre la convocatoria no se cierra nunca, las hojas de vida siguen llegando a una bandeja que nadie mira y el que postula no sabe si lo descartaron. Y deja adentro lo que es de uso interno: los tramos de monto que el puesto decide, las claves y custodias que recibe, los nombres de las personas y el sueldo de otros puestos. Publicar hasta cuánto dinero puede mover por su cuenta quien atiende la ventanilla, y en qué dirección trabaja, es entregarle el mapa de la caja a cualquiera que lea un anuncio de trabajo. Por eso cada bloque que no pasa al aviso queda marcado en el perfil como de uso interno.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "personas.seleccion" },
          { de: "activo", clave: "marketing.canales" },
          { de: "decision_gerencia", sobre: "cuántas vacantes se abren, en qué local va cada una y hasta qué día se reciben postulaciones" },
        ],
        cubre: [14, 16],
        si_falta: "¿Dónde llegaron las hojas de vida de la última convocatoria que abriste?",
      },
      {
        clave: "instrucciones_en_hoja_aparte",
        titulo: "Anexo: cómo se llena este formato, en su propia hoja",
        por_que:
          "Las indicaciones para quien redacta un perfil nuevo van al final, en una hoja con su propio título, y nunca intercaladas entre el objetivo, las funciones y las condiciones. Cuando están adentro, el que copia el formato para la siguiente vacante copia también las indicaciones, y el aviso sale a la calle diciéndole al candidato «se añaden las funciones». En el documento que la empresa usa hoy esas líneas están repartidas por todo el cuerpo, y el perfil completo cabe en dos hojas: el papel con el que se convoca está hecho casi por mitades de contenido y de indicaciones para el que lo redacta.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "personas.seleccion" },
        ],
        cubre: [15],
        si_falta: "¿Qué hoja usa hoy la persona que redacta un perfil nuevo para no empezar de cero?",
      },
      {
        clave: "para_asesoria_legal",
        titulo: "Lo que sale de la entrega hasta que responda el asesor",
        por_que:
          "Como el perfil es el papel que se publica, un requisito legal inventado no se queda adentro: sale a la calle con el nombre de la empresa encima. Todo lo que la empresa quiera pedirle a un postulante y suene a ley entra como pregunta y no como requisito ya decidido: antecedentes, informe de deudas, examen médico, edad mínima para manejar efectivo de terceros, consentimiento para guardar su hoja de vida y por cuánto tiempo se conserva, modalidad de contratación, y los datos personales que el aviso pide. Queda fuera de la entrega hasta que la respuesta vuelva por escrito, y el perfil no fija plazos, montos ni normas por su cuenta.",
        obligatoria: true,
        de_donde_sale: [
          { de: "asesor_legal", sobre: "antecedentes, informe de deudas, examen médico, edad mínima para manejar efectivo de terceros, consentimiento y conservación de hojas de vida, modalidad de contratación y qué datos personales puede pedir un aviso" },
        ],
        cubre: [17],
        si_falta: "¿Qué le pediste al último postulante que te mandara antes de citarlo?",
      },
    ],
    nunca_lleva: [
      "Líneas que le hablan al que redacta y no al candidato: «iniciamos siempre con», «se añaden las funciones», «frase de cierre».",
      "Un párrafo de empresa y de propuesta de valor más largo que la lista de funciones del puesto que se está convocando.",
      "Frases de cierre de autoayuda financiera al pie, que no cambian nada de lo que el candidato va a hacer el lunes.",
      "Bloques de «ofrecemos» con lo que ofrece cualquier empresa: ambiente de orden, participación directa, operación estructurada.",
      "Competencias que son adjetivos sueltos: responsabilidad, compromiso organizacional, proactividad, persona carismática.",
      "Un monto de remuneración y «a convenir» o «según experiencia» escritos en la misma línea.",
      "Condiciones que dicen «jornada completa» o «horario rotativo» en lugar del horario del local donde el puesto trabaja.",
      "Requisitos copiados de otro aviso del rubro, que piden conocimientos que este puesto no usa ni un día del mes.",
      "Secciones que se pueden pegar al perfil de cualquier otro puesto de la empresa sin cambiarles una palabra.",
    ],
  },

  procedimiento: {
    clave: "procedimiento",
    nombre: "Procedimiento interno codificado",
    para_quien:
      "Quien ejecuta lee el desarrollo y el flujograma; quien aprueba lee la ficha de control, los responsables y los indicadores; quien audita lee el control documental, los registros y las referencias. Cuerpo de ocho a quince páginas, y cada formato aparte con su propio código.",
    exigencias_que_tenia_la_vara: 17,
    secciones: [
      {
        clave: "ficha_de_control_del_documento",
        titulo: "Ficha de control: un solo código, su versión y su estado",
        por_que:
          "Un documento con dos códigos se archiva dos veces y después se busca en vano, y es el error más frecuente de esta familia: el código del encabezado no es el de la ficha, así que el documento se guarda encima de otro. Aquí va un solo código, repetido igual en el encabezado, en la ficha, en el pie de página y en cada anexo, y va dicho si ese código ya está asignado o si todavía está propuesto, que son dos estados distintos. El código no se inventa en el documento: sale de la lista maestra de documentos de la empresa, una fila por código con su nombre, su versión, su fecha y quién lo custodia. Y todo correlativo que el procedimiento mande usar dice qué puesto entrega el número y en qué registro queda anotado, porque un correlativo sin dueño se repite. Las fechas de elaboración y de validación dicen lo mismo en todos los lugares del documento donde aparecen.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "procesos.controles" },
          {
            de: "decision_gerencia",
            sobre: "qué puesto asigna los códigos y los correlativos de los documentos de la empresa, y dónde queda la lista maestra",
          },
        ],
        cubre: [1, 2, 3],
        si_falta: "¿Quién le pone el código a un documento nuevo de la empresa?",
      },
      {
        clave: "aprobacion_y_vigencia",
        titulo: "Quién lo revisa, quién lo firma y desde qué día rige",
        por_que:
          "Aprobar y entrar en vigencia son dos hechos distintos, y mientras falte la firma el documento no manda. Aquí van las tres casillas con cargo, fecha y firma, la fecha desde la que rige —que no es la de la firma—, cada cuánto se revisa y qué puesto convoca esa revisión. Mientras una casilla siga con el marcador de fecha vacío, el documento lleva la palabra borrador en el encabezado de cada página y no figura como vigente en su lista de distribución: un procedimiento que circula sin firma se cumple a medias, porque el que lo incumple dice que no estaba aprobado y tiene razón. Y el control de cambios lleva una fila por versión, con la sección tocada y qué cambió, para que la versión siguiente no borre el rastro de la anterior.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          {
            de: "decision_gerencia",
            sobre: "qué puesto revisa y qué puesto aprueba este procedimiento, qué día lo aprueba, desde qué día rige y cada cuánto se revisa",
          },
        ],
        cubre: [4, 5],
        si_falta: "¿Qué día quedó firmado el último procedimiento que hoy se aplica en la empresa?",
      },
      {
        clave: "referencias_con_codigo_y_version",
        titulo: "Los documentos con los que se cruza, con código y versión",
        por_que:
          "Una referencia que no se puede abrir es un hueco con apariencia de orden. Cada documento interno que este procedimiento nombre entra con su código, su versión y la fecha de esa versión, y antes de escribirlo se abre para comprobar que existe: hoy estos documentos remiten al reglamento de la casa poniendo la palabra «Interno» donde va el código, y el reglamento que la empresa de verdad tiene lleva otro esquema y otra versión, así que el que sigue la referencia no sabe cuál obedecer. Y mientras este documento esté pendiente de firma no declara aprobado, validado ni vigente a ningún otro: un documento que nadie aprobó no puede aprobar nada, y los formatos que cuelgan de él quedan en el aire.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "personas.reglamento" },
          { de: "activo", clave: "procesos.politicas" },
        ],
        cubre: [6, 7],
        si_falta: "Cuando este procedimiento manda abrir otro papel de la casa, ¿dónde está guardado ese papel hoy?",
      },
      {
        clave: "alcance_y_hechos_de_la_operacion",
        titulo: "A quién se aplica y qué hechos de la operación entran",
        por_que:
          "El alcance se escribe con las palabras de lo que de verdad pasa, no con categorías abstractas. Aquí va la lista de los hechos que los registros de la empresa ya muestran —faltante de caja, diferencia de arqueo, billete deteriorado, clave o llave compartida, apertura fuera de hora, operación por encima del tope— y cada uno aparece nombrado en el texto con su palabra. Es el hueco más caro de esta familia: el procedimiento disciplinario de una empresa que mueve efectivo en tres locales no nombra la palabra faltante ni una vez, y hay dos pérdidas de caja registradas, una terminada en despido. Un documento que regula incumplimientos en general y deja afuera el único que ya costó dinero no se va a usar el día que vuelva a pasar.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.incidencias" },
          { de: "activo", clave: "procesos.controles" },
          {
            de: "afirmaciones",
            busca: "los hechos que ya ocurrieron en la operación y quedaron registrados: faltantes de caja, diferencias de arqueo, billetes deteriorados, claves compartidas y aperturas fuera de hora",
          },
        ],
        cubre: [11],
        si_falta: "¿Qué fue lo último que pasó en caja que te obligó a intervenir?",
      },
      {
        clave: "pasos_con_sujeto_y_responsables",
        titulo: "El desarrollo paso a paso, cada paso con el puesto que lo hace",
        por_que:
          "Un paso sin sujeto lo acaba haciendo el dueño. Cada paso numerado dice qué puesto lo ejecuta, y ese puesto existe en el organigrama con el mismo nombre; nada queda escrito en impersonal, del tipo «se verifica» o «se deben recopilar». La matriz de responsabilidades no deja ninguna fila sin alguien que ejecute, sus columnas son puestos con ficha en el manual de funciones, y las abreviaturas de cargo se escriben completas la primera vez. El estándar de la casa ya lo pide: los procesos importantes tienen responsable, control y registro. Y hay una razón práctica: en esta empresa casi todos los pasos de estos documentos caen en el puesto que administra, que arrastra treinta acciones del plan sin empezar. Y el flujograma se dibuja desde esta misma lista y no aparte: una caja por paso, con el puesto que lo hace, y un rombo en cada punto donde la respuesta puede ser no. Es lo único que alguien abre cuando tiene el caso encima, así que si le falta un paso, ese paso no se hace.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
          { de: "activo", clave: "procesos.procedimientos" },
        ],
        cubre: [12, 13],
        si_falta: "La última vez que pasó un caso de estos, ¿quién lo llevó de principio a fin?",
      },
      {
        clave: "registros_que_el_procedimiento_genera",
        titulo: "Tabla de registros: cada papel que queda, con su custodio",
        por_que:
          "Un control que se apoya en un registro inexistente es un control escrito, no un control. En esta tabla entra cada registro, formato, expediente o legajo que el documento nombre en cualquier parte —en el desarrollo, en la tabla de riesgos, en los indicadores o en los anexos—, con quién lo genera, quién lo custodia y dónde se archiva. El registro que hoy no existe en ninguna carpeta lleva escrito que no existe, qué puesto lo abre y en qué fecha: confesar el hueco es información útil, inventarlo es una mentira que vuelve en tres meses. Hoy uno de estos procedimientos apoya su control de trazabilidad en un registro maestro de casos que no está en su propia tabla, no tiene custodio y no está en ninguna carpeta.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.sistemas" },
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.incidencias" },
        ],
        cubre: [10],
        si_falta: "Cuando un caso de estos se cierra, ¿en qué carpeta o pantalla queda guardado?",
      },
      {
        clave: "indicadores_con_fuente_y_valor_de_hoy",
        titulo: "Los números del procedimiento, con su fuente y su valor de hoy",
        por_que:
          "Cada número entra con tres cosas: de qué registro sale su numerador, de qué registro sale su denominador, y cuánto vale hoy con la fecha en que se leyó. Un número cuyo denominador obliga a contar algo que nadie cuenta no se puede calcular ni el primer mes, y lo que pasa entonces es peor que no medir: alguien pone una cifra a ojo. El que nunca se midió dice «no medido» y la fecha en que se va a leer por primera vez. Y ninguna meta entra sin su valor de partida: metas redondas en un procedimiento que todavía no se aplicó son un deseo, y el mes en que se mida por primera vez nadie podrá decir si mejoró. El manual de identidad de la casa ya cierra cada uno de sus principios con su línea de medición: esto sale de ahí.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "procesos.incidencias" },
          {
            de: "decision_gerencia",
            sobre: "qué puesto lee cada número de este procedimiento, cada cuánto lo lee y a quién se lo reporta",
          },
        ],
        cubre: [8, 9],
        si_falta: "De los casos del año pasado, ¿cuántos quedaron con su papel firmado?",
      },
      {
        clave: "tiempos_internos_y_plazos_de_norma",
        titulo: "Los tiempos, separados en dos columnas",
        por_que:
          "Hay dos clases de tiempo y no pesan igual: el que la empresa fija y puede cambiar mañana, y el que viene de una norma y no se cambia. Van en dos columnas distintas, y toda fila de la segunda trae su fuente escrita y queda marcada para confirmarla con el asesor antes de aplicarse. Hoy en esta familia las dos clases están en la misma tabla con el mismo peso: el aviso previo que el documento atribuye a la norma, el tiempo interno para cerrar un tablero mensual y la orientación de una autoridad, todo bajo un mismo título. Si el tiempo interno está mal, lo arregla la Gerencia; si el de la norma está mal, lo paga la empresa. Nosotros no lo resolvemos: va al asesor y sale de la entrega hasta que responda.",
        obligatoria: true,
        de_donde_sale: [
          {
            de: "asesor_legal",
            sobre: "qué plazos, formalidades y comunicaciones exige la norma en este procedimiento, y qué tiempos puede fijar la empresa por su cuenta",
          },
          {
            de: "decision_gerencia",
            sobre: "los tiempos internos de gestión que la empresa se compromete a cumplir en este procedimiento y qué puesto responde por ellos",
          },
        ],
        cubre: [14],
        si_falta: "Cuando hoy se le pide algo por escrito a un trabajador, ¿para cuándo se le pide?",
      },
      {
        clave: "fuentes_citadas_y_su_fecha",
        titulo: "Las fuentes legales citadas, con su fecha de consulta",
        por_que:
          "Toda afirmación que venga de una norma o de un pronunciamiento de autoridad remite a una fuente con nombre completo, fecha de publicación y fecha en que se consultó, y la lista entera va al final del documento. Uno de estos procedimientos ya cierra así, y eso se conserva tal cual; los otros afirman cosas del mismo tenor sin fuente ninguna. La fecha de consulta es lo único que después permite saber qué hay que volver a mirar cuando una norma cambia. La lista completa se entrega al asesor para que confirme qué sigue vigente, y mientras no vuelva su respuesta por escrito el documento no se entrega como definitivo.",
        obligatoria: true,
        de_donde_sale: [
          {
            de: "asesor_legal",
            sobre: "qué normas y pronunciamientos de autoridad citados en este procedimiento siguen vigentes hoy, y cuáles de ellos cambiaron",
          },
        ],
        cubre: [15],
        si_falta: "¿Qué fue lo último que el asesor laboral de la empresa revisó por escrito?",
      },
      {
        clave: "datos_de_la_persona_en_los_anexos",
        titulo: "Qué datos de la persona pide cada formato, y quién los guarda",
        por_que:
          "Estos expedientes guardan hechos, evidencias y notas de desempeño de personas con nombre y apellido. Por cada formato anexo va la lista de los datos que pide, el puesto que custodia el expediente, los puestos que pueden abrirlo y por cuánto tiempo se conserva. Hoy el periodo de conservación se remite a una política interna de archivo que no está escrita, así que en la práctica no hay periodo, y el acceso se manda limitar sin decir a qué puestos. Qué se puede recoger, quién puede leerlo y cuánto se guarda no lo decide la consultora: sale de la entrega hasta que el asesor responda por escrito.",
        obligatoria: false,
        de_donde_sale: [
          {
            de: "asesor_legal",
            sobre: "qué datos del trabajador puede recoger y conservar cada formato anexo, por cuánto tiempo, y qué puestos pueden acceder al expediente",
          },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [16],
        si_falta: "Hoy, ¿quién puede abrir el legajo de un trabajador?",
      },
      {
        clave: "cierre_y_lista_de_verificacion",
        titulo: "La lista con la que se cierra el caso",
        por_que:
          "La lista de cierre es lo que permite verificar un caso sin volver a leer el procedimiento entero, y por eso se conserva siempre que existe. Lleva una casilla por cada paso que produce un documento, una firma o un registro, y ninguna casilla pide algo que ningún paso ordenó. Con menos casillas que pasos, un caso se cierra con un hueco; con más casillas que pasos, se le pide a quien cierra algo que nadie le enseñó, y a la tercera vez deja de usar la lista.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.procedimientos" },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [17],
        si_falta: "¿Qué tiene que estar listo para que digas que un caso de estos quedó cerrado?",
      },
    ],
    nunca_lleva: [
      "Capítulos de objetivo, alcance, principios y terminología que ocupan más páginas que el desarrollo del procedimiento.",
      "Listas de principios de nueve o diez entradas, todas del mismo largo, que no cambian un solo paso del desarrollo.",
      "Glosarios que definen palabras usadas una sola vez, o que explican lo que cualquiera entiende sin glosario.",
      "Flujogramas que son los títulos de los pasos puestos en vertical con flechas, sin responsable, sin tiempo y sin bifurcación.",
      "Columnas de evidencia de control que nombran registros que no existen en ninguna otra parte del documento.",
      "La misma instrucción escrita en el desarrollo, repetida en los principios y repetida otra vez en la lista de cierre, con tres redacciones distintas.",
      "Matrices de responsabilidad simétricas donde una misma área autoriza y ejecuta casi todas las filas.",
      "Anexos con todos sus campos entre corchetes y sin una línea que diga quién los llena, en qué momento y dónde quedan después.",
      "Menciones a un enfoque o a una norma de gestión en la tabla de referencias que no cambian ni un paso ni un control del documento.",
    ],
  },

  seguimiento: {
    clave: "seguimiento",
    nombre: "Matriz de seguimiento y control de actividades del plan",
    para_quien:
      "Lo llena el puesto que administra, lo lee la Gerencia en la revisión semanal, y cada responsable lee solo las filas que le toca mover. La matriz completa no pasa de cinco páginas, y encima va una sola hoja por semana: lo que se movió, lo que está vencido y lo que la Gerencia tiene que decidir.",
    exigencias_que_tenia_la_vara: 18,
    secciones: [
      {
        clave: "portada_y_aprobacion",
        titulo: "Portada: qué plan sigue, quién aprobó las fechas y desde cuándo rige",
        por_que:
          "Una matriz de seguimiento no inventa fechas: las toma de un plan. Por eso la portada dice qué plan sigue, con su versión y su fecha, y además el día en que la Gerencia aprobó esas fechas y los objetivos que la matriz va a exigir, con el puesto que firma. Si el plan del que salen se declara a sí mismo una propuesta de gestión, la matriz no puede exigirlo como compromiso: el primer responsable al que se le reclame va a contestar que su fecha era una propuesta, y va a tener razón.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "direccion.plan_empresarial" },
          { de: "activo", clave: "direccion.estrategia" },
          {
            de: "decision_gerencia",
            sobre: "qué día aprueba la Gerencia las fechas y los objetivos que esta matriz va a exigir, y desde qué día rige",
          },
        ],
        cubre: [1, 12],
        si_falta: "¿Qué día firmó la Gerencia las fechas que esta matriz le va a exigir a tu gente?",
      },
      {
        clave: "fecha_de_corte_y_vencidas",
        titulo: "La fecha de corte, y el bloque de lo que está en rojo",
        por_que:
          "Arriba de la matriz va el día en que se tomó la foto, y debajo, antes que nada, el bloque corto de lo que está en rojo, que son dos listas y no una: las filas cuya fecha de fin ya pasó y siguen sin cerrar, y las que debieron empezar y no empezaron. Sin fecha de corte nadie sabe si lo que lee es de esta semana o del mes pasado, y sin ese bloque la matriz se lee igual de tranquila el día antes y el día después del incumplimiento. Este bloque es también la hoja que se lleva a la reunión: lo que se movió, lo que está en rojo y lo que la Gerencia tiene que decidir. El atraso tiene que doler a la vista, no esconderse en la fila treinta.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "direccion.plan_empresarial" },
          {
            de: "decision_gerencia",
            sobre: "qué día de la semana se toma la foto del avance y en qué reunión se lee el bloque de lo atrasado",
          },
        ],
        cubre: [2, 3],
        si_falta: "¿Qué día se revisó por última vez el avance de las actividades del plan?",
      },
      {
        clave: "una_fila_por_actividad",
        titulo: "La matriz: una fila por actividad, con lo que la hace exigible",
        por_que:
          "Una fila por actividad, con su código, lo que hay que lograr, la fecha de inicio y la fecha de fin, la meta dicha en algo que se pueda contar, el estado, la evidencia con la que se va a cerrar y el lugar exacto donde esa evidencia queda guardada. Y dos casillas que casi ninguna matriz trae y son las que la mantienen viva: el día en que se actualizó el estado y el puesto que lo actualizó. Un estado sin fecha no se puede creer ni desmentir, y una evidencia sin lugar de archivo no se encuentra el día de la revisión: entonces la actividad se cierra con la palabra de quien la tenía a cargo. La fecha de inicio va porque es la que deja ver el atraso cuando todavía se puede recuperar.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "direccion.plan_empresarial" },
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.sistemas" },
        ],
        cubre: [3, 4, 8, 9],
        si_falta: "¿Dónde quedó guardado el papel con el que diste por terminada la última actividad del plan?",
      },
      {
        clave: "estados_con_su_definicion",
        titulo: "Los estados, y el hecho que autoriza cada uno",
        por_que:
          "La lista de estados se escribe una sola vez, cerrada, y cada estado dice qué hecho hay que ver para ponerlo: un acta firmada, un registro abierto con filas escritas, un entregable enviado a revisión, una validación recibida. Si «en curso» no dice qué hay que ver, cada responsable lo pone cuando siente que avanzó y la columna deja de comparar nada: hay actividades que viven meses en ese estado sin que nadie pueda decir que están detenidas.",
        obligatoria: true,
        de_donde_sale: [
          {
            de: "afirmaciones",
            busca: "qué hecho hizo que el responsable moviera una actividad de un estado al siguiente, contado por él mismo",
          },
          { de: "activo", clave: "procesos.controles" },
        ],
        cubre: [5],
        si_falta: "¿Qué tuviste que ver para creer que una actividad del plan ya estaba en marcha y no solo prometida?",
      },
      {
        clave: "responsable_y_quien_cubre",
        titulo: "Un responsable por fila, y quién cubre si el puesto está vacante",
        por_que:
          "Un solo puesto por fila, nunca dos unidos con un signo más y nunca el nombre de un área. Una fila con dos responsables no tiene ninguno: el día que vence, cada uno muestra la matriz y señala al otro. Y la fila cuyo responsable es un puesto que todavía no está ocupado dice quién la cubre mientras tanto y qué hecho termina esa cobertura —la contratación, el día de ingreso, la firma de la ficha del puesto nuevo—, porque una actividad encargada a un puesto que no existe no la hace nadie y su fila se ve igual de ordenada que las demás.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "personas.organigrama" },
          {
            de: "decision_gerencia",
            sobre: "qué puesto cubre cada actividad cuyo responsable todavía no está ocupado, y qué hecho termina esa cobertura",
          },
        ],
        cubre: [6, 7],
        si_falta: "¿Quién está haciendo hoy el trabajo del puesto que todavía no has llenado?",
      },
      {
        clave: "criterio_de_cierre",
        titulo: "Qué tiene que pasar para cerrar una fila",
        por_que:
          "El criterio se escribe una vez y vale para todas: resultado logrado, meta contada, evidencia archivada y, cuando corresponde, validación recibida. Y cada fila agrega el hecho de aplicación que hay que ver además del entregable: el registro en uso, la persona capacitada operando sola, el acceso retirado. Un procedimiento aprobado y guardado no cambió nada todavía, y la empresa paga por el cambio, no por el archivo.",
        obligatoria: true,
        de_donde_sale: [
          {
            de: "afirmaciones",
            busca: "qué tuvo que ver el responsable para dar por cerrada una actividad, y qué le hizo devolverla sin cerrarla",
          },
          { de: "activo", clave: "procesos.controles" },
          { de: "activo", clave: "procesos.procedimientos" },
        ],
        cubre: [10],
        si_falta: "La última actividad que diste por cerrada, ¿qué estaba funcionando distinto el día que la cerraste?",
      },
      {
        clave: "indicadores_del_seguimiento",
        titulo: "Los indicadores, calculables el día del cierre",
        por_que:
          "Pocos indicadores, y cada uno con la cuenta hecha a mano antes de publicarla: qué se cuenta arriba, qué se cuenta abajo, de qué columna o registro sale cada número, qué puesto lo calcula y qué se reporta cuando abajo no hay nada que contar. Un indicador que no se puede calcular se reporta igual, a ojo, y el reporte parece medición. Y el objetivo de cada uno va aprobado y con su fecha, no escrito como sugerencia: un objetivo sugerido no se incumple nunca, porque nadie se comprometió con él.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "procesos.sistemas" },
          {
            de: "decision_gerencia",
            sobre: "qué objetivo aprueba la Gerencia para cada indicador del seguimiento y desde qué mes se empieza a exigir",
          },
        ],
        cubre: [11, 12],
        si_falta: "¿De qué cuaderno o pantalla saldría el número de actividades que cerraste dentro de la fecha prometida?",
      },
      {
        clave: "reprogramacion_con_rastro",
        titulo: "Las columnas de la reprogramación",
        por_que:
          "Mover una fecha es legítimo; moverla sin dejar rastro, no. En la propia fila van las cuatro casillas: la fecha anterior, la nueva, la causa y el puesto que la aprobó. Una fecha que se mueve sin dejar la anterior escrita borra el atraso: la matriz se ve cumplida mientras el plan entero se va corriendo, y al cierre del año nadie puede decir cuánto se movió ni por qué. La regla sola, escrita en un párrafo, no alcanza: si no hay dónde anotarla, no se cumple aunque todos quieran cumplirla.",
        obligatoria: true,
        de_donde_sale: [
          { de: "activo", clave: "procesos.incidencias" },
          { de: "decision_gerencia", sobre: "qué puesto autoriza mover una fecha del plan y qué causa escrita se le exige para autorizarla" },
        ],
        cubre: [13],
        si_falta: "¿Quién autorizó la última vez que una fecha del plan se movió?",
      },
      {
        clave: "escalamiento_y_bloqueos",
        titulo: "El escalamiento, y dónde queda anotado el bloqueo",
        por_que:
          "Cuatro datos y no tres: a qué puesto se avisa, por qué canal, en cuánto tiempo y dónde queda anotado el bloqueo con el día en que se destrabó. «Elevar a Gerencia» sin canal ni registro no es un escalamiento, es una intención. Sin registro, la tercera vez que la misma dependencia detiene el plan nadie puede probar que ya había pasado, y el atraso se explica de nuevo como si fuera la primera vez. Aquí va también el tope de decisiones que se le llevan a la Gerencia cada semana, para que la lista llegue priorizada y no completa.",
        obligatoria: true,
        de_donde_sale: [
          { de: "organigrama" },
          { de: "activo", clave: "procesos.incidencias" },
          {
            de: "decision_gerencia",
            sobre: "a qué puesto se escala un bloqueo, por qué canal, en cuánto tiempo y cuántas decisiones acepta ver por semana",
          },
        ],
        cubre: [14],
        si_falta: "La última vez que una actividad se trabó esperando una decisión, ¿a quién le avisaste y por dónde?",
      },
      {
        clave: "para_validacion_especializada",
        titulo: "Las filas que no se cierran sin alguien de afuera",
        por_que:
          "Lista aparte, corta y visible: las actividades cuyo cierre depende de una exigencia de norma —legajos del personal, seguridad y salud en el trabajo, jornada y descuentos, datos de clientes, contratos con proveedores, conservación de archivos—. Cada una dice que se verifica con el especialista o con asesoría legal y que no se cierra hasta que esa respuesta esté por escrito. Y la matriz no afirma por su cuenta ningún plazo, monto, porcentaje ni artículo: una fila cerrada sin la validación que la norma pide deja a la empresa creyendo que cumplió.",
        obligatoria: true,
        de_donde_sale: [
          {
            de: "asesor_legal",
            sobre:
              "las actividades cuyo cierre depende de legajos del personal, seguridad y salud en el trabajo, jornada y descuentos, datos de clientes o contratos con proveedores",
          },
        ],
        cubre: [15],
        si_falta: "¿Qué actividad del plan no puedes cerrar sin que la firme alguien de afuera de la empresa?",
      },
      {
        clave: "lo_que_queda_fuera",
        titulo: "Lo que esta matriz no sigue, dicho aquí",
        por_que:
          "Si la matriz sigue solo una parte del plan, lo dice y nombra el documento o el puesto que sigue el resto. La mitad de un plan sin dueño documental se detiene sin que nadie lo note, y la revisión mensual da verde porque solo mira lo que la matriz trae. Es una línea escribirla, y es la que evita que al año siguiente la empresa descubra que la mitad de lo que decidió nunca se empezó.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "direccion.plan_empresarial" },
          { de: "activo", clave: "direccion.estrategia" },
        ],
        cubre: [16],
        si_falta: "De las acciones del plan que no figuran en esta matriz, ¿en qué documento se les sigue el rastro?",
      },
      {
        clave: "actividades_recurrentes",
        titulo: "Las actividades que se repiten, medidas por frecuencia",
        por_que:
          "Las filas que son una costumbre y no una entrega —la reunión semanal, las auditorías de caja, la revisión trimestral— van en su propio bloque, con el periodo que se está midiendo y cuántas veces va en ese periodo. Una reunión semanal medida con una sola fecha de fin a años de distancia no se puede incumplir hasta el último día, y por eso se deja de hacer el primer mes sin que la matriz se entere.",
        obligatoria: false,
        de_donde_sale: [
          { de: "activo", clave: "procesos.indicadores" },
          { de: "activo", clave: "procesos.procedimientos" },
        ],
        cubre: [17],
        si_falta: "¿Qué día de la semana pasada se sentaron a revisar el avance del plan?",
      },
      {
        clave: "por_sede_donde_corresponde",
        titulo: "Lo que se cierra local por local",
        por_que:
          "Las actividades cuyo trabajo ocurre en cada local —la inducción, las auditorías de caja, los pendientes de seguridad, los accesos, el inventario— llevan una casilla por local y no se cierran hasta que estén todos. Una mejora instalada en el local principal se reporta como cerrada para toda la empresa, y los demás siguen igual hasta que algo falla ahí: ese día la empresa descubre que lo que creía resuelto estaba resuelto en un solo sitio.",
        obligatoria: false,
        de_donde_sale: [
          {
            de: "afirmaciones",
            busca: "qué actividades se tienen que cerrar en cada local por separado y cuáles se cierran una sola vez para toda la empresa",
          },
          { de: "activo", clave: "procesos.mapa_procesos" },
        ],
        cubre: [18],
        si_falta: "De lo que ya quedó funcionando en la empresa, ¿en qué locales lo has visto con tus ojos?",
      },
    ],
    nunca_lleva: [
      "Una columna de estado con el mismo valor en todas las filas el día en que se entrega.",
      "Un capítulo que explica qué es el seguimiento y por qué conviene controlar el avance.",
      "Formatos de reporte en blanco, con las instrucciones entre corchetes todavía puestas.",
      "El objetivo del documento y la función del responsable repetidos en dos secciones.",
      "«100%» en la columna de meta sin decir cien por ciento de qué ni en cuántos locales.",
      "Indicadores que se calculan con un registro que la empresa no tiene abierto hoy.",
      "«Mantener trazabilidad», «asegurar el cumplimiento», «velar por el avance del plan».",
      "Las mismas columnas del plan y ninguna propia: el plan otra vez con otro título.",
      "Filas con dos responsables unidos por un signo más, o con un área en vez de un puesto.",
      "Objetivos de indicador escritos como «sugerido», «recomendado» o «condición deseada».",
      "Una fecha de fin a años de distancia para una actividad que se repite cada semana.",
    ],
  },
};

export const CLAVES_PLANTILLA = Object.keys(PLANTILLAS);

/**
 * La plantilla maestra de un tipo de documento. Falla diciéndolo: una plantilla que no existe es
 * un documento que el sistema iba a escribir desde cero sin que nadie se enterara.
 */
export function plantilla(clave: string): Plantilla {
  const p = PLANTILLAS[clave];
  if (!p) throw new Error(`No existe la plantilla «${clave}». Las que hay: ${CLAVES_PLANTILLA.join(", ")}.`);
  return p;
}

/**
 * Qué sección de la plantilla satisface cada exigencia de la vara, exigencia por exigencia y en el
 * orden de la vara. Es la lectura que hace falta para defender la plantilla delante de un
 * consultor: si una exigencia sale con la lista vacía, el documento que esta plantilla produzca va
 * a fallar esa exigencia.
 */
export function cobertura(clave: string): { exigencia: number; cubierta_por: string[] }[] {
  const p = plantilla(clave);
  const v: Vara = vara(clave);
  return v.exigencias.map((_, i) => {
    const n = i + 1;
    return { exigencia: n, cubierta_por: p.secciones.filter((s) => s.cubre.includes(n)).map((s) => s.clave) };
  });
}

/**
 * Las exigencias OBLIGATORIAS que ninguna sección produce. Tiene que devolver vacío siempre: una
 * exigencia obligatoria sin sección es un documento que no se puede entregar, escrito con nuestra
 * propia plantilla. Las deseables sin cubrir se leen con `cobertura()`, porque esas no impiden la
 * entrega: se entrega diciendo qué falta.
 */
export function sinCubrir(clave: string): number[] {
  const v = vara(clave);
  return cobertura(clave)
    .filter((c) => c.cubierta_por.length === 0 && v.exigencias[c.exigencia - 1].obligatoria)
    .map((c) => c.exigencia);
}

/**
 * Qué secciones no se pueden escribir todavía con lo que la empresa entregó, y la pregunta exacta
 * que hay que hacerle al dueño por cada una. Las obligatorias van primero: son las que impiden la
 * entrega.
 *
 * `tiene` lleva los identificadores del material ya levantado: la clave del activo con su bloque
 * («personas.funciones»), más «organigrama», «procesos» y «afirmaciones» cuando esas piezas están.
 *
 * DOS DECISIONES QUE CONVIENE SABER:
 *  · Una sección se pregunta si le falta ALGUNA de sus fuentes, no solo si le faltan todas.
 *    Preguntar de más cuesta una pregunta; preguntar de menos produce un documento que falla su
 *    propia medición, que es lo que esta pieza viene a evitar.
 *  · Lo que solo puede decidir la gerencia, y lo que solo puede responder el asesor legal, nunca
 *    cuenta como «ya está»: no es un dato que la empresa entregó, es una decisión que todavía no se
 *    ha tomado para este documento. Esas secciones se preguntan siempre, y son justo las que
 *    faltaban en el MOF que medimos: la tabla de montos, el horario por local y lo legal.
 */
export function queFaltaPreguntar(
  clave: string,
  tiene: string[],
): { seccion: string; pregunta: string; obligatoria: boolean }[] {
  const ya = new Set(tiene);
  return plantilla(clave)
    .secciones.filter((s) => s.de_donde_sale.some((f) => !fuenteEnMano(f, ya)))
    .map((s) => ({ seccion: s.clave, pregunta: s.si_falta, obligatoria: s.obligatoria }))
    .sort((a, b) => Number(b.obligatoria) - Number(a.obligatoria));
}

/** El identificador con el que una fuente aparece en `tiene`. */
function claveDeFuente(f: FuenteSeccion): string {
  switch (f.de) {
    case "activo":
      return f.clave;
    case "afirmaciones":
      return "afirmaciones";
    case "organigrama":
      return "organigrama";
    case "procesos":
      return "procesos";
    case "decision_gerencia":
      return "decision_gerencia";
    case "asesor_legal":
      return "asesor_legal";
  }
}

function fuenteEnMano(f: FuenteSeccion, ya: Set<string>): boolean {
  if (f.de === "decision_gerencia" || f.de === "asesor_legal") return false;
  return ya.has(claveDeFuente(f));
}
