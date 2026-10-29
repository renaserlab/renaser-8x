/**
 * LA BIBLIOTECA MAESTRA DE 8X: la vara por tipo de documento.
 *
 * QUÉ ES UNA VARA. La lista de exigencias contra las que RENASER mide cualquier documento que un
 * cliente entregue, para decidir qué conservar, qué corregir y qué mejorar.
 *
 * POR QUÉ CADA EXIGENCIA SE COMPRUEBA SÍ O NO. Si la vara dijera «el documento debe ser claro y
 * completo», mejorar sería una opinión y cada consultor opinaría distinto. Diciendo «ninguna ficha
 * pasa de 25 funciones» o «ninguna ficha concentra más de un tercio de las funciones del manual»,
 * se comprueba contando — y el sistema puede hacerlo solo. Toda exigencia trae su `como_se_comprueba`:
 * qué se busca exactamente en el documento para decidir.
 *
 * ESTO ES PROPIEDAD DE RENASER, NO DEL CLIENTE. El contrato lo dice: los documentos elaborados
 * para el cliente son suyos, pero «la metodología, formatos base y know-how de EL PRESTADOR se
 * mantienen como propiedad intelectual del mismo». Por eso la vara vive aquí, en el producto, y no
 * en la carpeta de ninguna empresa. Una empresa recibe el documento mejorado; no recibe la vara.
 *
 * DE DÓNDE SALE CADA EXIGENCIA. Cuatro orígenes, y solo cuatro:
 *   · manual_vigente         del Manual de Identidad y Cultura aprobado por la empresa
 *   · metodo_renaser         de la metodología: 90/10, estrategia sobre esfuerzo, nada se inventa
 *   · practica_de_excelencia del modo de operar de las casas que son referencia, traducido a
 *                            exigencia concreta y sin nombrar a nadie
 *   · obligacion_a_verificar algo que la ley podría exigir — SIN plazos, montos ni artículos
 *                            inventados; siempre cierra en asesoría legal
 *
 * Generado el 18-10-2026 por seis agentes con un refutador adversarial cada uno. El refutador dejó
 * 20 objeciones anotadas en las propias exigencias, sin aplicar, para que las revisara alguien. Se
 * revisaron y se aplicaron una por una ese mismo día: lo que está escrito abajo ya no es una
 * objeción resuelta, es la exigencia buena. Queda UNA abierta, visible en su campo
 * `objecion_pendiente`, y abierta a propósito: depende de abrir el Manual de Identidad del cliente,
 * que no está en el expediente, y no se cierra inventando lo que ese manual dice.
 */

export type OrigenExigencia = "manual_vigente" | "metodo_renaser" | "practica_de_excelencia" | "obligacion_a_verificar";

export type Exigencia = {
  /** Qué debe cumplir el documento, en una línea. */
  exigencia: string;
  /** Qué se busca EXACTAMENTE en el documento para decidir sí o no. */
  como_se_comprueba: string;
  origen: OrigenExigencia;
  /** Sin lo obligatorio, el documento no se entrega. Sin lo deseable, se entrega diciendo qué falta. */
  obligatoria: boolean;
  /** Qué se rompe si el documento no la cumple. */
  por_que: string;
  /** Lo que el refutador objetó, si objetó algo grave. Se corrige con criterio, no en automático. */
  objecion_pendiente?: string;
};

export type Vara = {
  clave: string;
  tipo: string;
  para_que_sirve: string;
  para_quien_es: string;
  exigencias: Exigencia[];
  errores_tipicos: string[];
  senales_de_relleno: string[];
  que_se_conserva_casi_siempre: string;
};

export const VARAS: Record<string, Vara> = {
  mof: {
    clave: "mof",
    tipo: "Manual de Organización y Funciones (MOF) y fichas de puesto",
    para_que_sirve: "Es el documento que dice de qué responde cada puesto y hasta dónde decide solo. Bien hecho, resuelve tres cosas que hoy cuestan plata: que todo vuelva al dueño porque nadie más tiene autoridad escrita, que dos personas crean que la misma tarea es del otro, y que se contrate a alguien para un puesto que nadie definió. También es la base de lo demás: sin saber quién responde por cada cosa, no hay proceso con dueño, no hay nada que medir y no hay a quién capacitar. Y es lo único exigible el día que alguien incumple.",
    para_quien_es: "Lo lee el dueño para decidir qué suelta, el jefe inmediato para exigir y el trabajador el día que entra. Se firma. Por eso: una ficha por puesto de 2 a 4 páginas, que se lea en diez minutos, más un encabezado común de 2 páginas para todo el manual. Un MOF de seis puestos no debería pasar de 30 páginas; si pasa de 50, nadie lo abrió nunca.",
    exigencias: [
      {
        exigencia: "Ninguna función se repite dentro de la misma ficha: no hay dos funciones que caigan en el mismo objeto del negocio y en la misma familia de verbo.",
        como_se_comprueba: "Clasificar cada función de la ficha con dos etiquetas de lista cerrada. Objeto del negocio: cuadre de caja, caja fuerte, precio del tipo de cambio, plan, personal, compras, reporte a Gerencia, seguridad. Familia de verbo: EJECUTA (hacer, registrar, entregar), VERIFICA (supervisar, verificar, validar, controlar, arquear), APRUEBA (aprobar, autorizar, firmar). Agrupar las funciones por el par objeto + familia. Si dos o más funciones caen en el mismo par, la ficha no cumple y se escriben sus números. La función cuyo objeto no está en la lista no entra en el conteo y se anota aparte, dicha, para que el hueco de la lista se vea.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Una obligación escrita tres veces no se cumple tres veces: se diluye. El que la lee no sabe cuál es la que de verdad le van a exigir, y el que la escribió tapó con repetición el hecho de que nunca definió el puesto. Se mide por par objeto + familia porque el caso real se escondía en el verbo: en el manual vigente de este cliente el cuadre de caja aparece en las funciones 9, 37 y 43 con tres verbos distintos y reducido a verbo + objeto se escapaba.",
      },
      {
        exigencia: "Cada función tiene un solo dueño en todo el manual; si dos puestos la tocan, uno la ejecuta y el otro la verifica, con verbos distintos.",
        como_se_comprueba: "Cruzar las listas de funciones de todas las fichas. Si la misma función aparece como propia en dos fichas con el mismo verbo, no cumple. Sí cumple si en una dice «ejecutar/registrar» y en la otra «verificar/aprobar», con el momento en que ocurre cada una.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Una tarea con dos dueños no tiene ninguno. El día que falla, cada uno muestra el manual y señala al otro, y el dueño termina haciéndola él.",
      },
      {
        exigencia: "Ninguna ficha pasa de 25 funciones, y ninguna pasa de 10 funciones marcadas «diario» o «permanente».",
        como_se_comprueba: "Contar dos veces las funciones numeradas de cada ficha: el total, y aparte solo las que llevan frecuencia «diario» o «permanente». 26 o más en el total, no cumple. 11 o más diarias o permanentes, no cumple. Se escribe el par de conteos al costado del nombre del puesto (por ejemplo «36 funciones, 14 diarias»).",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Nadie dirige su día con 48 obligaciones; dirige con las que de verdad le van a pedir. El total se corta en 25 y no más abajo porque en una empresa de once personas sin áreas el administrador general carga treinta obligaciones legítimas: no hay a quién repartirlas, y un techo más bajo obliga a borrar funciones reales o a inventar puestos que no existen. El segundo conteo es el que protege a la persona: la carga del día tiene que caber en una jornada.",
      },
      {
        exigencia: "Ninguna ficha concentra más de un tercio de todas las funciones del manual.",
        como_se_comprueba: "Sumar las funciones de todas las fichas del manual. Dividir las funciones de cada puesto entre ese total y escribir el porcentaje al costado de su nombre. Más de 33%, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Lo que hay que ver es el reparto, no la proporción contra el jefe: un gerente bien escrito tiene pocas funciones y anchas, y un cajero tiene muchas y finas, así que compararlos castiga al jefe por tener la ficha corta. El porcentaje sí señala el puesto donde cayó todo lo que nadie quiso asignar: en el manual vigente de este cliente el administrador se lleva casi la mitad.",
      },
      {
        exigencia: "Cada función lleva su frecuencia, tomada de una lista cerrada: permanente, diario, semanal, mensual, anual o según requerimiento.",
        como_se_comprueba: "Recorrer las funciones y contar las que no tienen frecuencia o traen una palabra que no está en la lista. Una sola sin frecuencia, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Sin frecuencia no se sabe qué le toca a la persona hoy y qué una vez al año, y el puesto se vuelve imposible de medir y de exigir. Es también la única forma de ver si la carga diaria cabe en una jornada.",
      },
      {
        exigencia: "Todo puesto que decide sobre dinero trae su tabla de montos: tramo, moneda, quién decide y qué se exige además.",
        como_se_comprueba: "Buscar en la ficha una tabla con cifras y moneda escrita (soles o dólares, dicho). Si en lugar de cifra dice «aprobar gastos», «autorizar operaciones» o «según corresponda», no cumple. Si hay cifra sin moneda, no cumple. Si un monto está propuesto y no firmado, se admite solo si está marcado como pendiente de firma con la línea de firma incluida.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Un puesto sin monto no tiene autoridad: cada decisión sube al dueño y el puesto queda de adorno. La tabla es lo que convierte la delegación en algo que ocurre sin que nadie pregunte.",
      },
      {
        exigencia: "Todo puesto nombrado en el manual como jefe de otro, o como jefatura inmediata, o en «puestos a cargo», tiene su propia ficha en el mismo documento.",
        como_se_comprueba: "Anotar todos los nombres de puesto que aparecen en los campos de línea de mando de todas las fichas y verificar que cada nombre tenga ficha. Cualquier nombre sin ficha, no cumple. Se escribe la lista de los que faltan.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un puesto que manda sin ficha manda sin funciones ni límites escritos, y nadie puede reclamarle nada. También se comprueba al revés: si la empresa tiene puestos ocupados que el manual no nombra, el manual describe otra empresa.",
      },
      {
        exigencia: "Ninguna función contradice una decisión vigente de la Gerencia.",
        como_se_comprueba: "Poner al costado la lista de decisiones vigentes de la Gerencia (quién fija el precio, quién tiene la clave de la caja fuerte, quién aprueba sueldos y salidas, cuál es el margen mínimo) y buscar función por función si alguna dice lo contrario. Una sola contradicción, no cumple. Se escribe el número de función y la decisión que contradice.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Una función que hoy nadie puede cumplir —porque la decisión es de otro o porque no tiene la llave— deja de ser exigible, y con ella pierde fuerza todo el documento. El manual tiene que decir lo que pasa, no lo que se copió de otro lado.",
      },
      {
        exigencia: "Las condiciones de trabajo de cada ficha corresponden a la sede donde ese puesto trabaja.",
        como_se_comprueba: "Comparar el horario, el lugar y los días escritos en la ficha con la hora real de apertura y cierre de esa sede. Si todas las fichas repiten el mismo horario y las sedes abren a hora distinta, no cumple. Si el puesto rota entre sedes, debe decirlo y traer el horario de cada una.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "El candidato firma un horario y trabaja otro. Eso arranca la relación con una mentira escrita y deja al documento sin valor el día que hay un reclamo.",
      },
      {
        exigencia: "Las habilidades del puesto están escritas como conducta que se puede ver, con cómo se demuestra, qué la contradice y cómo se mide, y se ordenan contra las cuatro partes de la evaluación de la casa: resultados, comportamiento, competencia y responsabilidad.",
        como_se_comprueba: "Leer la sección de habilidades. Si una entrada es un adjetivo solo —proactividad, liderazgo, compromiso—, no cumple. Cada entrada debe traer al menos una conducta observable y una forma de medirla, y encajar en una de las cuatro partes.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Una lista de adjetivos no se puede evaluar, así que a la hora de la verdad el jefe califica por simpatía. El manual de la casa ya resolvió esto escribiendo cada valor con su conducta, su contrario y su medida: la ficha tiene que salir de ahí.",
      },
      {
        exigencia: "Cada ficha dice qué puesto cubre a este si la persona falta, y qué cosas el que cubre no puede hacer.",
        como_se_comprueba: "Buscar el campo de respaldo. Si no existe, no cumple. Si dice «el jefe inmediato» sin nombrar el puesto, no cumple. Si nombra el puesto pero no dice qué queda fuera —las claves, los montos, las firmas—, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "El estándar de la casa cierra con respaldar, y sin eso una ausencia de tres días para la operación o la resuelve el dueño en persona. Decir qué no hereda el que cubre es lo que evita que una ausencia se convierta en un acceso regalado.",
      },
      {
        exigencia: "El manual es de fecha igual o posterior al manual de identidad de la casa, lo cita con su versión y recoge sus piezas donde corresponde.",
        como_se_comprueba: "Comparar la fecha del manual con la del manual de identidad. Si es anterior, no cumple. Luego buscar en el documento los tres pilares, los seis valores, los ocho principios y el protocolo de atención: los puestos que atienden al público deben tener el protocolo entre sus funciones, y todos deben evaluarse contra el modelo de la casa. Si el manual de identidad no aparece citado ni una vez, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Si el manual de funciones es más viejo que el estándar de la casa, no lo recoge, y la empresa termina con dos documentos que piden cosas distintas. El propio manual de identidad pide que la identidad baje al organigrama, al manual de funciones y a los perfiles de puesto: es un pedido escrito, no una sugerencia.",
      },
      {
        exigencia: "Cada ficha dice contra qué se evalúa al ocupante y en qué fecha, y cierra con firma de recepción con nombre, documento de identidad y fecha.",
        como_se_comprueba: "Buscar en la ficha la fecha de la primera evaluación (por ejemplo a los 45 o 90 días) y qué se le va a mirar ese día. Buscar el bloque de firma con los tres campos. Si falta la fecha de evaluación o falta el bloque de firma, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "El documento solo se vuelve real cuando se enseña, se evalúa y se firma. Sin fecha de evaluación nadie revisa si el puesto funcionó; sin firma el trabajador siempre puede decir que no lo conocía.",
      },
      {
        exigencia: "Las funciones de frecuencia diaria o permanente dicen dónde queda la constancia de que se hicieron.",
        como_se_comprueba: "Tomar solo las funciones marcadas como diarias o permanentes y verificar que cada una nombre el registro, el cuaderno, la hoja o el sistema donde queda el resultado. Si no nombra ninguno, esa función no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "Una función diaria sin registro no se puede verificar ni al día siguiente, y lo que no se puede verificar se deja de hacer sin que nadie lo note. Es además lo que permite medir el puesto en lugar de opinar sobre él.",
      },
      {
        exigencia: "El título del puesto no contradice los marcadores de mando que trae su propia ficha.",
        como_se_comprueba: "Buscar en la ficha los seis marcadores de mando, que están escritos o no están: custodiar efectivo o valores, tener clave o llave, aprobar o autorizar montos, supervisar personal, firmar a nombre de la empresa, responder por más de una sede. Si la ficha trae uno o más y el título contiene «asistente», «auxiliar», «apoyo» o «practicante», no cumple y se propone el nombre correcto. Si no trae ninguno y el título contiene «jefe», «supervisor» o «gerente», tampoco cumple. Se escribe qué marcadores se encontraron.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "El título mal puesto desordena el sueldo, la selección y la responsabilidad: se busca un perfil y se contrata para otro trabajo. También confunde a los clientes y a los bancos sobre quién tiene qué autoridad. En el manual vigente de este cliente el caso es un «asistente administrativo» que custodia la bóveda.",
      },
      {
        exigencia: "Toda función o condición que suene a obligación legal va marcada para asesoría legal, sin que el manual resuelva por su cuenta.",
        como_se_comprueba: "Buscar en el documento: funciones que pongan una pérdida o un faltante a cargo del trabajador; puestos marcados como sin control de horario; funciones que invoquen un procedimiento interno que no existe por escrito; descuentos, sanciones o retenciones. Cada hallazgo debe estar marcado con la nota de que se verifica con asesoría legal y debe quedar fuera de la entrega hasta que vuelva la respuesta. Si el manual fija el plazo, el monto o el artículo por su cuenta, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "Una cláusula inventada en un documento firmado es un problema que la empresa paga, no la consultora. Y la función que invoca un procedimiento que no existe no es exigible: hay que verificar con asesoría legal qué se puede exigir, con qué procedimiento, y que el procedimiento esté escrito.",
      },
    ],
    errores_tipicos: ["Funciones repetidas en bloque: un tramo entero de funciones que copia otro tramo anterior del mismo puesto, a veces palabra por palabra, con un verbo cambiado. En un caso real, 12 de 48 funciones eran repetición.", "La obligación más importante del puesto escrita tres veces en tres secciones distintas, como si repetirla la resolviera.", "El jefe con 10 funciones y su subordinado con 48: todo lo que nadie quiso asignar cayó en el puesto del medio.", "Funciones que contradicen lo que el dueño ya decidió: el manual le da el precio al administrador cuando el precio lo manda la Gerencia, o le encarga abrir la caja fuerte cuando no tiene la clave.", "Un puesto que el manual nombra cinco veces como jefe de otro y que no tiene ficha propia en ninguna parte.", "Puestos que la empresa tiene ocupados hoy y el manual no nombra, y puestos del manual que ya no existen.", "Un horario único copiado en todas las fichas cuando cada sede abre y cierra a hora distinta.", "Una sección de habilidades hecha de adjetivos que nadie puede evaluar.", "Ninguna tabla de montos: el puesto «aprueba» y «autoriza» sin que exista una cifra, o hay cifra sin decir si son soles o dólares.", "El manual con fecha anterior al estándar de la casa, así que no lo recoge: ni pilares, ni valores, ni protocolo de atención, ni el modelo de evaluación.", "Títulos que no describen el trabajo: un «asistente administrativo» que custodia la bóveda y supervisa a los cajeros de tres sedes.", "Nada sobre quién cubre el puesto si la persona falta."],
    senales_de_relleno: ["El conteo de funciones por puesto es muy desigual entre fichas de nivel parecido: donde hay 40 y hay 10, lo que sobra es relleno.", "Funciones que empiezan con «apoyar en», «coadyuvar», «velar por», «participar en» o «otras funciones que le asigne su jefe»: no dicen qué hace la persona ni cómo se verifica.", "Dos funciones seguidas que solo se diferencian en un verbo añadido.", "Funciones que son el nombre de un área en lugar de una tarea: «gestión de recursos humanos», «gestión de calidad».", "Secciones que dicen lo mismo en todas las fichas, palabra por palabra: riesgos, condiciones de trabajo, habilidades. Si se puede copiar y pegar entre puestos, no describe ningún puesto.", "Verbos de supervisión encadenados sin que exista el puesto supervisado ni el registro que se supervisa.", "La lista de habilidades crece hasta diez o doce cualidades y ninguna trae cómo se mide.", "El documento pesa más que la empresa: más páginas de manual que trabajadores."],
    que_se_conserva_casi_siempre: "Casi siempre se conserva el esqueleto, y hay que decirlo antes de criticar: la estructura de secciones por puesto (objetivo, funciones, perfil, habilidades, relaciones, autoridad, riesgos, condiciones de trabajo) suele estar bien y no se cambia; la costumbre de poner frecuencia a cada función, cuando existe, es mejor que la de la mayoría de las empresas; la sección de riesgos; el código y la versión del documento, porque ya hay un sistema documental y no hay que inventarlo; y la hoja de firma de recepción con nombre, documento y fecha, que es lo que lo hace exigible. El trabajo normal es una versión nueva —quitar repetición, corregir lo que contradice las decisiones del dueño, agregar las fichas que faltan, poner la tabla de montos, el horario por sede, el respaldo y las habilidades medibles—, no un documento nuevo. Rehacerlo desde cero es lo que convierte días de trabajo en meses y hace que el cliente pierda lo único que ya tenía ordenado.",
  },
  seleccion: {
    clave: "seleccion",
    tipo: "Manual de Selección y Reclutamiento",
    para_que_sirve: "Convierte el contratar en un proceso con pasos, formatos y firmas, en lugar de una decisión de confianza que cada vez se toma distinto. Bien hecho resuelve tres cosas concretas: que nadie empiece a buscar gente sin saber qué puesto está cubriendo y hasta cuánto dinero va a decidir esa persona; que dos candidatos al mismo puesto se puedan comparar porque se les evaluó igual; y que nadie quede solo frente a la plata antes de demostrar que sabe hacerlo. Las pérdidas de caja de una empresa de efectivo casi nunca son por mala fe: son por falta de capacitación de alguien a quien se le dio autonomía antes de tiempo. Este manual es el documento que cierra ese hueco.",
    para_quien_es: "Lo aprueba Gerencia y lo aplica quien administra el personal (por ejemplo, quien administra la empresa). También lo lee el supervisor que recibe al nuevo. Cuerpo del manual: entre 15 y 25 páginas, nunca más. Los formatos van aparte, al final, uno por paso. Si el cuerpo pasa de 25 páginas, se está explicando en vez de instruir.",
    exigencias: [
      {
        exigencia: "Ninguna vacante se busca ni se comenta antes de tener el perfil del puesto escrito y firmado.",
        como_se_comprueba: "Buscar en el documento la frase que prohíbe buscar candidatos sin perfil firmado, y comprobar que existe un formato de perfil con casilla de firma. Si el perfil aparece como un paso posterior a la entrevista, o como algo opcional, es no.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Sin perfil, se contrata a la persona que cayó y después se le inventan las funciones. Así nació el puesto del MOF con 48 funciones: todo lo que nadie quiso asignar terminó en el del medio.",
      },
      {
        exigencia: "Todo puesto que decida sobre dinero, autorice transferencias o custodie valores lleva dos cifras con moneda: hasta cuánto decide solo una persona certificada en ese puesto, y hasta cuánto decide quien todavía no está certificado, que puede ser cero. Los puestos que no deciden dinero lo dicen así: ninguno.",
        como_se_comprueba: "Abrir cada perfil y leer el campo del tope. Sí: hay dos cifras y cada una dice su moneda (soles o dólares), o el campo dice «ninguno». No: falta una de las dos cifras, hay cifra sin moneda, el campo está en blanco, o dice «según criterio del jefe» o «montos menores».",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un puesto de una casa de cambio sin tope escrito no es un puesto: es una ambigüedad con sueldo. Y es el dato que decide si la persona está lista o no para operar sola. La segunda cifra es la que evita el día caro: si el tope del que no está certificado no está escrito, la primera jornada con poca gente en ventanilla alguien opera solo «por mientras». La palabra «ninguno» existe para que un manual correcto no falle por un campo que no tiene sentido llenar en el puesto de un agente de seguridad.",
      },
      {
        exigencia: "Todos los puestos que el manual nombra existen en el organigrama vigente y se llaman exactamente igual.",
        como_se_comprueba: "Hacer dos columnas: puestos nombrados en el manual y puestos del organigrama. Cruzarlas. Si el manual nombra a alguien como jefe de otro y ese jefe no tiene perfil propio, es no. Si un puesto se llama distinto en cada documento, es no.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "En el MOF vigente aparece cinco veces un «Supervisor Principal» que manda sobre el cajero y no tiene ficha. Un puesto que manda sin perfil no puede mandar, y se contrata para un cargo que no existe.",
      },
      {
        exigencia: "Todos los candidatos al mismo puesto se evalúan con las mismas preguntas y se comparan en una sola tabla.",
        como_se_comprueba: "Verificar que existe una guía de entrevista con las preguntas escritas palabra por palabra, no temas sueltos, y una matriz comparativa con una fila por candidato y las mismas columnas para todos. Si cada entrevistador arma su conversación, es no.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Si cada candidato responde preguntas distintas, no hay comparación posible: se elige por simpatía y después no se puede explicar por qué se eligió a ese.",
      },
      {
        exigencia: "Todo puesto que toque dinero, llaves o datos de clientes tiene prueba práctica con puntaje mínimo numérico, y el documento nombra los bloques eliminatorios.",
        como_se_comprueba: "Buscar la hoja de prueba práctica. Tiene que traer los ejercicios, el puntaje de cada bloque, el mínimo para aprobar en número y la lista de los bloques eliminatorios: los que, al no alcanzarse, obligan a no recomendar al candidato. Si solo hay entrevista, es no. Si dice «se evaluará su desempeño práctico» sin puntaje, es no. Si no hay lista de bloques eliminatorios, es no.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "La entrevista se pasa hablando bien; la prueba con dinero en la mano no. Separar lo que la persona dice de lo que la persona hace es la única forma de no enterarse en caja.",
      },
      {
        exigencia: "Ningún criterio de evaluación es un adjetivo: cada uno dice qué conducta se observa y cómo se puntúa.",
        como_se_comprueba: "Leer la lista de criterios o habilidades. Si aparecen «proactividad», «liderazgo», «compromiso» o «actitud de servicio» sin decir qué hace una persona que lo tiene y qué puntaje recibe, es no. Cada criterio tiene que poder marcarse mirando a alguien trabajar.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "El estándar de la casa ya resolvió esto: cada valor dice cómo se demuestra, qué lo contradice y cómo se mide. La sección de habilidades del MOF es una lista de adjetivos que nadie puede evaluar, y por eso nadie la usa.",
      },
      {
        exigencia: "El acompañamiento al que entra cierra con un criterio de salida escrito: qué tiene que demostrar para operar solo.",
        como_se_comprueba: "Buscar cómo termina el periodo de acompañamiento. Tiene que haber una lista de lo que la persona demuestra y un puesto que lo firma. Si lo único que hay es una duración —tres días, una semana, «según capte»— es no.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "El tiempo es la variable, no el requisito. «Tres días si capta rápido» deja la decisión más caliente del negocio en una impresión que nadie firma ni registra.",
      },
      {
        exigencia: "Antes de dar autonomía sobre dinero hay una certificación firmada con nombre, fecha y puesto de quien la firma.",
        como_se_comprueba: "Buscar el acta o constancia. Tiene que traer el nombre de la persona, la fecha, qué se le habilita, hasta cuánto, y las firmas de quien lo supervisa y de quien administra. Si la autonomía se entrega de palabra o se da por supuesta al terminar la inducción, es no.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "La cadena de la casa es documentar, enseñar, evaluar, certificar y respaldar. Sin el paso firmado, enseñar y evaluar no sirven de nada: nadie puede decir después quién autorizó qué.",
      },
      {
        exigencia: "La decisión de contratar o no contratar queda en un puesto nombrado y por escrito en una línea.",
        como_se_comprueba: "Buscar quién decide. Tiene que decir el puesto —no «el comité», no «el área»— y tiene que haber un campo donde se escribe la recomendación o la decisión con firma. Si la decisión no deja rastro escrito, es no.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Una decisión sin dueño no se puede revisar ni corregir. Cuando algo sale mal, la empresa necesita saber quién decidió y con qué información delante.",
      },
      {
        exigencia: "Ningún puntaje contrata por sí solo: la decisión final la escribe y la firma el puesto que el manual nombra, también cuando el candidato alcanzó el mínimo.",
        como_se_comprueba: "Seguir en el documento el camino de un candidato después de la prueba. Sí: están listados los bloques eliminatorios y hay un campo de decisión firmada por el puesto que el manual nombra, tanto si el candidato alcanzó el mínimo como si no. No: el documento dice que el sistema, la matriz o el puntaje contrata o descarta sin que nadie firme después.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un número ayuda a ver; no contrata a nadie. Automatizar esa decisión expone a la empresa y le quita a Gerencia lo único que no puede delegar. La separación de un trabajador no se decide aquí: es materia del Reglamento Interno, y arrastra un punto legal que sigue abierto con el asesor.",
      },
      {
        exigencia: "Cada acceso se entrega y se devuelve con acta firmada, listado uno por uno.",
        como_se_comprueba: "Buscar el acta de accesos. Tiene que listar cada cosa por separado —usuario de sistema, correo, token de banca, clave de caja fuerte, llave del local— con firma al entregar y firma al devolver. Una frase genérica de «se le otorgarán los accesos correspondientes» es no.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "La empresa ya pagó esta lección: alguien salió sin acta y se fue con los tokens, el correo y el acceso al Drive abiertos. No se puede entregar lo que no se sabe quién tiene.",
      },
      {
        exigencia: "Todo lo que la empresa quiera exigirle a un candidato y huela a ley va listado como pregunta al asesor, sin plazos ni montos inventados.",
        como_se_comprueba: "Revisar que estos aparezcan como consulta y no como requisito ya decidido: antecedentes penales, policiales o judiciales; informe crediticio o de deudas; consentimiento y tiempo de conservación de hojas de vida y copias de documento; edad mínima para manejar efectivo de terceros; modalidad de contratación y periodo de prueba. Si alguno aparece afirmado con un plazo, un monto o un artículo citado, es no. Verificar con asesoría legal.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "Un manual que afirma una obligación legal que no existe es peor que uno que la deja abierta: la empresa empieza a pedir cosas que quizá no puede pedir, y el documento pierde valor cuando se descubre.",
      },
      {
        exigencia: "Cada puesto que se contrata deja escrito quién lo cubre si falta, con la fecha en que ese respaldo se probó.",
        como_se_comprueba: "Buscar en el perfil el campo de respaldo. Tiene que nombrar el puesto que cubre y traer una fecha de prueba. Un nombre sin fecha de prueba es no.",
        origen: "manual_vigente",
        obligatoria: false,
        por_que: "El estándar de la casa dice que ninguna operación crítica debe depender de una sola persona, y lo mide. Hoy cero de diecisiete puestos tiene respaldo escrito: cada contratación es la oportunidad de bajar ese número, y si el manual no lo pide, no baja.",
      },
      {
        exigencia: "La certificación caduca: el documento dice cada cuánto se revisa y qué la suspende.",
        como_se_comprueba: "Buscar el plazo de revisión y la lista de causas de suspensión. Si la certificación se da una vez y no se vuelve a mirar, es no. Tiene que decir también qué pasa cuando la persona cambia de sede o de puesto.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "Una habilitación que no caduca se vuelve un título. Y el mismo trabajo en otra sede no es el mismo trabajo: una que cierra sola a las 20:00 no es la central con bóveda y seguridad en turno.",
      },
      {
        exigencia: "El manual cierra con los números con los que se sabrá si sirvió, y con su línea base de hoy.",
        como_se_comprueba: "Buscar al final entre dos y cuatro números, cada uno con dónde se lee, cada cuánto y su valor de hoy. Si el valor de hoy no existe, tiene que decirlo así. Metas sin línea base, o números que exigen un reporte que la empresa no tiene, es no.",
        origen: "manual_vigente",
        obligatoria: false,
        por_que: "La regla de la casa es que todo enunciado lleva su medición. Sin línea base nadie puede responder dentro de tres meses si el manual cambió algo, y el documento se vuelve decoración.",
      },
    ],
    errores_tipicos: ["El documento dice «se evaluará al candidato» sin traer las preguntas escritas: cada entrevistador pregunta otra cosa y después los candidatos no se pueden comparar.", "El acompañamiento tiene duración pero no criterio: «de tres días a una semana, según capte», y nadie en particular evalúa si captó ni lo firma.", "La sección de habilidades son adjetivos copiados del MOF —proactividad, liderazgo estratégico, compromiso organizacional— que no se pueden puntuar y por eso nadie las usa.", "El manual nombra puestos que el organigrama no tiene, o los llama distinto: un jefe sin ficha propia, o un «asistente administrativo» que en realidad custodia la bóveda.", "El tope de dinero dice «según criterio del jefe», o trae la cifra sin moneda: «de 10,000 para arriba» sin decir si son soles o dólares.", "Se confunde la certificación de cultura con la habilitación para tocar dinero, y alguien opera solo creyendo que pasar una es pasar la otra.", "Se afirma que se pedirán antecedentes penales o se fija un periodo de prueba en meses, sin haberlo preguntado al asesor legal.", "El mismo requisito aparece escrito tres veces en secciones distintas —como el cuadre de caja en el MOF, en las funciones 9, 37 y 43— y eso lo diluye, no lo refuerza.", "El documento es anterior al estándar de la casa y no lo recoge: no menciona los pilares, los valores, los principios, el protocolo de atención ni el modelo de evaluación de resultados, comportamiento, competencia y responsabilidad.", "Los formatos piden datos que la empresa no tiene hoy —fechas de ingreso y salida del equipo, por ejemplo— así que quedan en blanco desde el primer día.", "Un horario único para toda la empresa cuando cada sede abre a hora distinta: el candidato firma una cosa y trabaja otra.", "Los accesos se entregan «según corresponda», sin lista ni acta, y cuando la persona sale nadie sabe qué hay que cortar."],
    senales_de_relleno: ["Listas simétricas: cinco competencias por puesto, siempre cinco, y son las mismas de un puesto a otro cambiando una palabra.", "Párrafos que explican qué es el reclutamiento y por qué importa, en lugar de decir quién hace qué el lunes.", "Frases que no se pueden comprobar: «se aplicarán las mejores prácticas», «se garantizará la idoneidad del personal», «se promoverá un clima laboral adecuado».", "El mismo paso contado dos veces con otras palabras en secciones distintas, como verificar referencias en la de evaluación y otra vez en la de verificaciones.", "Anexos con formatos vacíos y sin instrucción: no dice quién los llena, en qué momento ni dónde quedan después.", "Un capítulo de marco legal que cita normas en general y no dice ni una cosa que la empresa haga distinto el día que contrata.", "Más páginas que decisiones: si el documento tiene cuarenta páginas y seis decisiones reales, el resto es relleno.", "Organigramas, misión y visión pegados al inicio para dar cuerpo, cuando ya viven en otro documento de la casa."],
    que_se_conserva_casi_siempre: "Casi siempre se conserva el andamiaje y se corrige el contenido: el código y la versión del documento, los formatos que ya existen y la gente ya reconoce, la estructura por etapas —solicitud, perfil, búsqueda, evaluación, verificaciones, inducción— y la firma de recepción del trabajador, que es lo que lo hace exigible. Eso no se rehace. Si el cliente ya tiene su manual codificado, como el APO-REC-01 de la primera empresa cliente con sus formatos, el trabajo es la versión siguiente de ese documento, no un documento nuevo: se le despeja la repetición, se le corrige lo que contradice lo que Gerencia decidió, se le agregan los topes de dinero y el criterio de salida del acompañamiento, y se reescriben los criterios de evaluación contra el estándar de la casa. Son días de trabajo sobre lo que ya hay, no meses de documento nuevo.",
  },
  procesos: {
    clave: "procesos",
    tipo: "Manual de Procesos y Procedimientos",
    para_que_sirve: "Hace que el trabajo salga igual aunque el dueño no esté mirando, y que una persona nueva produzca en días en vez de meses. Cuando está bien hecho, el dueño deja de ser el manual: el procedimiento responde las preguntas que hoy le llegan por WhatsApp. Y como cada proceso dice dónde queda anotado su resultado, deja de discutirse si algo funcionó: se mira el número. Mal hecho, es un inventario de descripciones que nadie abre y que no mejora nada.",
    para_quien_es: "Tres lectores distintos, y por eso dos documentos. El dueño y el responsable de cada área leen el índice completo y los procesos de su área. El trabajador lee únicamente el procedimiento de lo que él hace, y lo lee de pie: una sola cara. Largo máximo razonable: de 10 a 15 procesos mapeados (hasta 30 solo si queda escrito por qué esta empresa necesita más), cada procedimiento en una o dos páginas, y la hoja de pared en una cara. Un manual de procesos de 80 páginas no se entrega: se recorta.",
    exigencias: [
      {
        exigencia: "Cada proceso tiene un solo responsable, y ese responsable es un puesto del organigrama real, no un área ni una persona.",
        como_se_comprueba: "Leer la casilla de responsable de cada proceso. No cumple si hay dos puestos unidos por «y» o por «/», si dice el nombre de una persona en vez de un puesto, o si dice un área («Administración», «Operaciones»). Si el puesto nombrado todavía no tiene ficha en el manual de funciones, el proceso sigue cumpliendo y el puesto entra en la lista de fichas por escribir, que se entrega junto al manual. Si el puesto está vacante, el proceso dice qué puesto lo cubre y qué hecho o fecha termina esa cobertura.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Que los procesos importantes tengan responsable, control y registro es el cuarto principio del manual de identidad vigente: lo pide su propio manual, no nosotros. Si el responsable no existe o son dos, el día que el proceso falla no hay a quién preguntarle. Y el hueco del manual de funciones no se cobra aquí: un proceso bien escrito no puede reprobar porque a su responsable todavía le falte la ficha.",
      },
      {
        exigencia: "Cada proceso dice con qué hecho empieza y con qué hecho termina, y los dos se pueden ver desde afuera.",
        como_se_comprueba: "Leer la primera y la última línea de cada proceso. El inicio y el fin tienen que ser hechos observables («el cliente llega a la ventanilla», «el reloj marca las 6:00 pm», «el reporte está enviado al grupo»). No cumple si dice «inicio: el proceso de caja» y «fin: fin del proceso», ni si el fin es un estado de ánimo o una intención («queda el cliente satisfecho»).",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Sin límites, dos personas creen que el proceso es otra cosa y el trabajo se cae justo en el borde: cada uno pensó que lo último lo hacía el otro.",
      },
      {
        exigencia: "Cada proceso dice dónde queda anotado su resultado nombrando el lugar exacto, o dice que hoy no queda anotado en ninguna parte y qué registro habría que abrir.",
        como_se_comprueba: "Buscar en cada proceso la casilla de dónde se anota. Tiene que nombrar la pantalla del sistema, el nombre del archivo, el cuaderno o el grupo donde el dato queda, o decir que hoy no queda anotado en ninguna parte y qué registro habría que abrir. No cumple si la casilla está vacía, ni si dice «en el sistema», «en el Excel» o «se registra» sin decir cuál ni qué pantalla.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "El estándar de la casa es que todo enunciado lleve su medición. Un proceso sin lugar de registro no se puede revisar la semana que viene, y entonces el único control posible vuelve a ser el dueño mirando. La segunda salida existe porque el punto de partida de este cliente son 34 procesos escritos y ninguno con dónde se mide: confesar el hueco es información útil, y un documento que lo confiesa tiene que poder entregarse.",
      },
      {
        exigencia: "Todo proceso cuyo resultado no queda hoy en ningún registro lleva escrito «hoy esto no queda registrado» y qué habría que crear para registrarlo; y cada proceso que sí declara un lugar de registro lleva al lado la fecha en que ese registro se miró con los propios ojos.",
        como_se_comprueba: "Recorrer los lugares de registro declarados en el documento: cada uno tiene que llevar al lado su fecha de verificación, y un lugar de registro sin fecha no cumple, porque se escribió sin mirarlo. Recorrer después los procesos sin lugar de registro: cada uno tiene que llevar la frase «hoy esto no queda registrado» más lo que habría que crear, y si no la lleva, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un indicador inventado es peor que ninguno: alguien va a tomar decisiones contra un número que nunca se midió. Decir «esto no se mide todavía» es información útil; rellenarlo es mentira que vuelve en tres meses. Lo que se comprueba es la fecha de verificación y no la cantidad de huecos, porque cero huecos es un resultado posible y honesto, y el indicador inventado igual cae: no tiene fecha.",
      },
      {
        exigencia: "Cada proceso lleva su tiempo, y al lado la palabra que dice de dónde salió ese tiempo: medido, declarado o estimado.",
        como_se_comprueba: "Buscar cada duración del documento. Cada una debe tener su etiqueta. «Medido» solo vale si al lado está la fecha y cuántas veces se cronometró. «Declarado» es lo que dijo quien hace el trabajo. «Estimado» es nuestro cálculo. Un tiempo sin etiqueta no cumple, y un tiempo redondo y limpio (30 minutos, 2 horas) marcado como medido sin fecha tampoco.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Publicar un tiempo inventado como real es el error que más cuesta: el día que alguien mida la mejora, va a comparar contra un número que nunca existió y va a concluir cualquier cosa. El tiempo es la variable con la que se compra libertad; si es falso, no se compró nada.",
      },
      {
        exigencia: "Cada procedimiento dice qué se hace cuando sale mal: quién avisa, a quién, en cuánto tiempo, y dónde queda anotada la falla.",
        como_se_comprueba: "Buscar en cada procedimiento el bloque de qué hacer si falla. Tiene que nombrar el puesto que avisa, el puesto o el teléfono al que avisa, el plazo, y el lugar donde queda el registro de lo ocurrido. No cumple si dice «reportar al jefe inmediato» sin canal ni registro, ni si remite a «los protocolos establecidos por la empresa» cuando esos protocolos no están escritos en ningún sitio.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "El estándar de la casa separa el error de la negligencia y del incumplimiento deliberado, y cada uno tiene respuesta distinta. Eso solo se puede aplicar si la falla quedó anotada. Sin registro, la segunda vez que pasa lo mismo nadie puede probar que ya había pasado.",
      },
      {
        exigencia: "Lo que todavía no fue confirmado por quien hace el trabajo va marcado como propuesta, y se distingue a simple vista de lo confirmado.",
        como_se_comprueba: "Recorrer los pasos y buscar la marca de estado. Todo paso que salió de nuestra cabeza y no de la boca de quien lo ejecuta debe decir «propuesta», «por confirmar» o «pendiente de firma». No cumple si el documento entero suena igual de firme de principio a fin, ni si la versión propuesta y la actual están mezcladas en el mismo texto.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Si una propuesta se lee como conducta, el trabajador va a ser evaluado contra algo que nunca aceptó y el documento pierde autoridad el primer día. Y la empresa pierde la oportunidad de discutirlo antes de firmarlo.",
      },
      {
        exigencia: "Donde un paso implica decidir, el documento responde las cinco preguntas: hasta qué monto decide solo, a qué puesto escala y por qué canal, qué documento exige al cliente, qué hace si el cliente dice no, y qué hace si el sistema o el canal está caído.",
        como_se_comprueba: "Marcar los pasos que implican decidir: son los que nombran un monto, los que esperan un sí o un no del cliente, y los que usan los verbos autorizar, aprobar, rechazar o escalar. Para cada paso marcado, buscar en el documento la respuesta a las cinco preguntas de la lista. Una pregunta de la lista sin respuesta, en un paso que la hace nacer, no cumple. Se escribe el número del paso y cuál de las cinco quedó sin responder.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Un paso con un hueco convierte la decisión en una llamada, y la llamada vuelve al dueño. Las casas que operan bien convierten cada decisión repetida en una regla escrita con su número, y así deja de ser una decisión. Las preguntas son cinco y están cerradas a propósito: con la lista abierta siempre se puede inventar una pregunta más y entonces ningún procedimiento aprueba nunca.",
      },
      {
        exigencia: "El mismo trabajo no está escrito dos veces, ni como dos procesos, ni como dos pasos con palabras distintas.",
        como_se_comprueba: "Agrupar los nombres de proceso y los pasos por el verbo y el objeto (cerrar caja, cuadrar caja, consolidar cierre). Dos entradas que ordenan la misma acción son una. Si aparecen dos o más, no cumple hasta que quede una sola con todo su detalle adentro.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "En el manual anterior de este cliente el cuadre de caja estaba escrito tres veces en un mismo puesto, y era justamente el cuello de botella de la empresa. Escribir una obligación tres veces no la refuerza: la diluye, porque ninguna de las tres es la versión oficial.",
      },
      {
        exigencia: "Ningún paso le da a un puesto una decisión que la gerencia ya se reservó.",
        como_se_comprueba: "Marcar todos los pasos que fijan precio, autorizan una excepción, abren un acceso o aprueban un monto. Cruzar cada uno contra la lista de decisiones que la gerencia tomó por escrito o dijo en reunión. Si el paso le entrega a otro puesto algo que la gerencia dijo que maneja ella, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un documento que ordena algo que en la práctica no pasa deja de ser exigible completo: el trabajador aprende que el manual se puede ignorar. En el manual anterior de este cliente el precio se le daba a un puesto cuando el precio lo manda la gerencia.",
      },
      {
        exigencia: "Lo que cambia según la sede está escrito por sede, no en una sola línea promedio.",
        como_se_comprueba: "Revisar horarios de apertura y cierre, montos mínimos de efectivo, quién abre, quién cierra y quién custodia. Si una sola línea pretende servir para locales que abren a horas distintas o manejan montos distintos, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Conocer el terreno antes de escribir es lo que separa un manual usable de una plantilla. En el manual anterior de este cliente las seis fichas decían el mismo horario para toda la empresa, cuando una sede abría dos horas más tarde y el dinero salía antes de la hora escrita. Con ese horario no se puede ni contratar: el candidato firma una cosa y trabaja otra.",
      },
      {
        exigencia: "Ningún paso impone una consecuencia al trabajador ni fija un monto, umbral o plazo que parezca exigido por una norma, sin dejarlo marcado para verificación legal.",
        como_se_comprueba: "Buscar dos cosas. Primera: las palabras «asume», «descuento», «faltante», «responsabilidad del mismo», o cualquier paso que ordene cobrarle o descontarle al trabajador. Segunda: todo monto, umbral o plazo que suene a exigencia de norma (umbrales de declaración, plazos de conservación, topes de jornada). Cada hallazgo debe llevar su fuente o la marca «verificar con asesoría legal», y el documento no se entrega como definitivo mientras quede uno sin marcar.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "Un paso que carga una pérdida sobre el trabajador puede ser inválido, y aun así ya se aplicó: en este cliente hubo dos pérdidas bajo esa función y una terminó en despido, con falta de capacitación como causa documentada. Escribir un umbral o un plazo que nadie verificó convierte el manual en una fuente de riesgo en lugar de una protección. Verificar con asesoría legal.",
      },
      {
        exigencia: "De los procesos que se van a intervenir existe la versión mejorada además de la actual, y son entre uno y tres, no todos.",
        como_se_comprueba: "Contar los procesos que traen versión mejorada. Si son cero, no cumple: un proceso solo descrito no mejora nada. Si todos la traen, tampoco cumple: eso es una lista de deseos, no una intervención. Cada versión mejorada debe nombrar qué paso se quita o se junta, qué número debe moverse, cuánto vale hoy ese número y a cuánto debe llegar.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Pocas piezas mueven todo. Describir treinta procesos y mejorar ninguno entrega un inventario; elegir uno a tres y moverles un número es lo que el cliente pagó. Y sin el valor de hoy escrito, dentro de tres meses nadie puede decir si funcionó.",
      },
      {
        exigencia: "Cada procedimiento termina con el espacio donde consta que fue enseñado y recibido: nombre, fecha y firma de quien lo va a ejecutar.",
        como_se_comprueba: "Ir al final de cada procedimiento operativo y buscar el bloque de recepción con nombre, documento de identidad, fecha y firma. Para los procedimientos que mueven dinero o datos del cliente, buscar además el espacio de la evaluación que se tomó y su resultado. Si falta en alguno, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "La cadena del estándar de la casa es documentar, enseñar, evaluar, certificar y respaldar. Un procedimiento sin firma de recibido no se puede exigir: el trabajador siempre podrá decir que no lo conocía, y tendrá razón.",
      },
      {
        exigencia: "La hoja que se pega en la pared existe, cabe en una cara y no es el documento del consultor.",
        como_se_comprueba: "Pedir las hojas de pared de los procedimientos operativos. Cada una: una sola cara, pasos numerados, en imperativo, con los números y topes que el trabajador necesita, sin diagnóstico, sin justificación y sin la palabra «alcance». Si la hoja de pared tiene dos caras, o si lo que se entregó para pegar es el capítulo completo del manual, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "Lo que no cabe en una cara no se lee en la ventanilla con un cliente adelante. El manual completo es para el dueño y el jefe de área; quitarle todo lo que el ejecutor no necesita es lo que hace que se use. Sin esta hoja el manual todavía se entrega, pero diciendo que falta la versión que de verdad va a la pared.",
      },
      {
        exigencia: "Los pasos de trato al cliente siguen el protocolo de atención de la casa, no uno distinto por proceso.",
        como_se_comprueba: "En cada proceso donde hay un cliente al frente, comparar los pasos de atención con los seis pasos del protocolo del manual de identidad vigente. Deben coincidir en orden y contenido. Si cada proceso inventó su propia forma de saludar, explicar y despedir, no cumple.",
        origen: "manual_vigente",
        obligatoria: false,
        por_que: "El cliente no distingue procesos: distingue si lo atendieron igual en las tres sedes. Un protocolo por proceso es lo mismo que ningún protocolo. Si no está alineado el manual se entrega igual, dejando escrito que esta pieza queda pendiente.",
      },
    ],
    errores_tipicos: ["El mismo trabajo escrito como tres procesos distintos porque se levantó con tres personas distintas, y ninguna de las tres versiones es la oficial.", "El responsable es un área («Administración») o son dos puestos separados por una barra; o es un puesto que no tiene ficha en el manual de funciones.", "El lugar de registro dice «en el sistema» o «en el Excel» sin decir qué pantalla ni qué archivo, así que nadie puede ir a mirar.", "Tiempos redondos (30 minutos, 2 horas) publicados como reales cuando nadie cronometró nada.", "El manual describe lo que debería pasar y no lo que pasa: un paso le entrega el precio a un puesto cuando el precio lo manda la gerencia.", "Un horario único para toda la empresa cuando cada sede abre y cierra a hora distinta.", "Todos los procesos con indicador y ninguno diciendo «esto hoy no se mide»: señal de que los indicadores se escribieron en vez de encontrarse.", "El paso de excepción remite a «los protocolos establecidos por la empresa», que no existen por escrito.", "El paso de faltante ordena que el trabajador asuma la pérdida, sin que nadie haya verificado si eso se puede exigir.", "Claves, PIN de caja o usuarios compartidos escritos dentro del paso, como si el manual fuera un lugar seguro.", "Treinta procesos descritos y ninguno mejorado: se entregó un inventario y se cobró una intervención.", "El documento del consultor entregado como hoja de pared: cuarenta páginas que nadie va a leer con un cliente adelante.", "Procesos que cruzan dos sedes sin decir quién entrega y quién recibe, así que el trabajo se cae exactamente en el borde.", "El manual se escribió antes del estándar de la casa y nunca se actualizó, así que no menciona ni una vez los valores, los principios ni el protocolo de atención."],
    senales_de_relleno: ["Pasos que empiezan con «velar por», «coordinar», «asegurar» o «apoyar en»: no dicen qué hace la persona con las manos.", "El mismo paso repetido con sinónimos en procesos vecinos, para que la lista parezca más completa.", "Nombres de proceso que son nombres de área («Proceso de administración») en vez de un trabajo con inicio y fin.", "Diagramas de flujo vistosos sin un solo dato de tiempo, de sistema ni de responsable.", "Secciones de «objetivo», «alcance» y «marco normativo» de dos páginas, y el procedimiento en media página.", "Los valores y los pilares de la empresa pegados al encabezado de cada proceso sin que cambien un solo paso.", "Todos los procesos escritos con exactamente el mismo nivel de detalle: eso es plantilla, no levantamiento. En una empresa real unos procesos se conocen al minuto y otros apenas de nombre.", "Verbos sin número: «rápidamente», «de forma oportuna», «en el menor tiempo posible», donde debería ir una cifra con su etiqueta.", "Crece el número de páginas y no crece la cantidad de decisiones escritas ni de topes definidos."],
    que_se_conserva_casi_siempre: "Casi nunca hay que rehacer el documento: el trabajo es la versión siguiente, no uno nuevo. Se conserva la lista de procesos que el cliente ya identificó y, sobre todo, el vocabulario de su gente: el nombre real del sistema, del archivo, del grupo de WhatsApp y del formato donde las cosas quedan. Eso es lo más caro de levantar y no se puede inventar desde afuera. Se conservan también los pasos que el propio trabajador describió de su puesto, los formatos y plantillas que ya están en uso, y toda la codificación, versión y firmas si el cliente ya tiene un sistema documental: si existe, se continúa, no se reemplaza. Lo que se rehace es lo otro: las repeticiones, los pasos que contradicen lo decidido, los indicadores inventados, el horario único y los tiempos sin etiqueta.",
  },
  reglamento: {
    clave: "reglamento",
    tipo: "Reglamento Interno de Trabajo y políticas internas",
    para_que_sirve: "Pone por escrito, y de manera exigible, qué se espera de cada trabajador y qué pasa cuando no cumple. Bien hecho, convierte la disciplina en procedimiento: la misma falta recibe la misma respuesta en las tres sedes, el jefe deja de decidir de memoria y la empresa puede sostener una sanción o una salida porque hay regla previa, entregada y firmada. Mal hecho es peor que no tenerlo: fija obligaciones que la empresa no puede exigir y le da al trabajador razones para reclamar.",
    para_quien_es: "Lo lee el trabajador el día que entra —cajero, personal de seguridad, encargado de tienda—, lo aplica Gerencia y el jefe inmediato, y lo revisa el asesor legal antes de entregarse. El cuerpo que el trabajador debe leer y firmar no pasa de 12 páginas; con anexos (constancia de entrega, horario por sede, preguntas abiertas a la asesoría), 25 como máximo. Si no se puede leer de corrido en una sentada, no se va a leer.",
    exigencias: [
      {
        exigencia: "El reglamento trae como anexo el formato de constancia de entrega, con casilleros de nombre, documento de identidad, fecha, versión del reglamento y firma, y dice quién la recoge, en qué plazo desde el ingreso y dónde se archiva.",
        como_se_comprueba: "Buscar el anexo y contar sus casilleros: nombre, documento de identidad, fecha, versión del reglamento y firma. Buscar después el artículo que nombra los tres datos: qué puesto recoge la constancia, en qué plazo desde el ingreso y dónde se archiva. Sí: están los cinco casilleros y los tres datos. No: falta un casillero, o no se dice quién la recoge, o no se dice el plazo, o no se dice dónde queda archivada. El conteo de constancias firmadas contra la relación de personal no se mide aquí: es un punto de la revisión de implementación, y solo corre cuando exista la relación de personal que pide la exigencia del alcance.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Un reglamento que nadie firmó no se le puede exigir a nadie. Sin constancia, cualquier sanción se cae con una sola frase: «nunca me lo dieron». Lo que se mide en el documento es el formato con el que esas firmas se van a recoger: el manual de funciones vigente se elogia justamente por traer su firma de recepción con documento y fecha, no por tenerlas todas cobradas.",
      },
      {
        exigencia: "El reglamento dice a qué empresa y a qué personas se aplica: razón social, número de RUC, las sedes, y la relación de personal adjunta.",
        como_se_comprueba: "Leer el artículo de alcance. Sí: nombra la razón social y el RUC de cada empresa que emplea, lista las sedes y trae adjunta la relación de personal por local. No: dice «la empresa» sin nombrarla, o no hay relación de personal.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "En esta casa hay tres empresas y los papeles dan cuatro cifras distintas de cuánta gente trabaja: 11, 10, 8 y de 15 a 20. Un reglamento que no dice a quién obliga no obliga a nadie, y no se puede ni empezar a escribir sin ese dato.",
      },
      {
        exigencia: "Las conductas no negociables del reglamento son las mismas del manual de identidad vigente, y ninguna regla del reglamento permite lo que ese manual prohíbe.",
        como_se_comprueba: "Poner las dos listas una al lado de la otra. Sí: cada conducta no negociable del manual aparece en el reglamento con la misma exigencia, ninguna regla del reglamento la contradice, y la fecha del reglamento es posterior a la del manual. No: falta una conducta, alguna se ablanda, o el reglamento está fechado antes que el manual.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Si la casa tiene dos listas de conducta, el trabajador elige cuál cumple, y cuando se le corrige saca la otra. Ya pasó con el manual de organización y funciones: quedó tres meses más viejo que el estándar de la casa y por eso no lo recoge.",
      },
      {
        exigencia: "El capítulo de faltas distingue las tres situaciones del estándar de la casa —error teniendo el procedimiento, negligencia de quien conocía el procedimiento e incumplimiento a sabiendas— y cada una tiene su respuesta escrita, distinta de las otras dos.",
        como_se_comprueba: "Buscar las tres situaciones en el capítulo de faltas y leer la respuesta de cada una. Sí: están las tres y las tres respuestas son distintas entre sí. No: falta una de las tres, o dos comparten la misma respuesta, o el reglamento solo gradúa por «leve, grave y muy grave» sin preguntar si la persona tenía el procedimiento.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Sin esa separación, el trabajador a quien nunca se le explicó recibe lo mismo que el que actuó a sabiendas. El estándar de la casa ya separa las tres situaciones y le da respuesta distinta a cada una: el reglamento tiene que salir de ahí y no de una graduación por gravedad.",
      },
      {
        exigencia: "Antes de aplicar cualquier sanción, el reglamento obliga a dejar escrito si a la persona se le había enseñado el procedimiento y dónde consta esa enseñanza; y dice que si no consta, el caso no se sanciona: se corrige la inducción y se vuelve a enseñar.",
        como_se_comprueba: "Buscar en el procedimiento de sanción el paso que exige el registro de la capacitación de esa persona en ese procedimiento, y leer qué dice el reglamento que pasa cuando ese registro no existe. Sí: el paso está y dice que sin registro no se sanciona y se vuelve a enseñar. No: el paso no está, o está y no dice qué pasa cuando el registro no existe.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "En esta casa la causa documentada de una de las dos pérdidas de caja fue falta de capacitación, y terminó en un despido. Sancionar a quien nunca fue enseñado le cobra a la persona un hueco de la empresa. Esta regla la escribió RENASER y por eso se firma como nuestra. A quién le corresponde responder por ese hueco es una medida disciplinaria contra un jefe: eso no se da por bueno en el reglamento, va al anexo de preguntas a la asesoría legal.",
      },
      {
        exigencia: "Toda sanción tiene procedimiento escrito: quién levanta el hecho, en qué plazo, quién decide, dónde queda registrado, y cómo se le comunica al trabajador.",
        como_se_comprueba: "Por cada sanción, buscar esos cinco puntos. Y buscar en todo el documento las expresiones «a criterio», «según determine la empresa», «cuando se considere» y «según la gravedad». Sí: las cinco preguntas están respondidas en cada sanción y ninguna de esas expresiones aparece. No: aparece una sola vez.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Si la sanción depende de quién esté de turno ese día, no protege a nadie: el trabajador no sabe a qué se expone y la empresa no puede sostener la medida después. Hoy en esta casa las llamadas de atención son solo verbales y la sanción la decide Gerencia sin que eso esté escrito en ninguna parte.",
      },
      {
        exigencia: "El horario está escrito sede por sede —hora de entrada, de salida y de refrigerio de cada local— y coincide con la hora a la que ese local abre y cierra hoy.",
        como_se_comprueba: "Comparar el artículo de jornada con el horario real de cada sede, local por local. Sí: hay una fila por sede, y además el personal de seguridad tiene la suya, y ninguna contradice lo observado. No: hay un horario único para toda la empresa.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "El manual de funciones puso un horario único de 09:00 a 18:00 cuando una sede abre a las 11:00 y cierra a las 20:00, el dinero sale a las 8:40 y seguridad termina a las 18:00. El que firma una cosa y trabaja otra tiene razón cuando reclama, y el documento no sirve para contratar.",
      },
      {
        exigencia: "Cualquier cláusula que haga al trabajador asumir de su bolsillo un faltante de caja, una pérdida o un daño está marcada para revisión legal y no se aplica hasta que haya respuesta por escrito.",
        como_se_comprueba: "Buscar en todo el documento las palabras «faltante», «asumir la responsabilidad», «repone», «reintegra», «pérdida» y «diferencia». Sí: cada aparición está marcada como pendiente de revisión legal y ninguna está redactada como regla en vigor. No: alguna está escrita como obligación del trabajador.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "El manual de funciones vigente ya le hace al cajero «asumir la responsabilidad» del faltante, y esa función estaba en vigor cuando ocurrieron las dos pérdidas registradas. El descuento sobre la remuneración del trabajador tiene límites y condiciones, y además el procedimiento interno que esa cláusula invoca no existe por escrito. No lo resolvemos nosotros: verificar con asesoría legal.",
      },
      {
        exigencia: "Todo dinero que el reglamento haga salir del sueldo —faltas, tardanzas, adelantos, multas— está escrito como pendiente de confirmación, sin monto, sin porcentaje y sin plazo inventado.",
        como_se_comprueba: "Listar cada mención de dinero que descuenta, retiene o adelanta. Sí: cada una cierra diciendo que se confirma con la asesoría. No: alguna fija una cifra, un porcentaje, un plazo o un número de artículo que nadie verificó.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "Hoy en esta casa «las faltas se descuentan» y hay adelantos de emergencia de 50 a 100 soles, todo contado y sin verificar. Una cifra inventada en un reglamento firmado es una obligación que la empresa después no puede sostener. Verificar con asesoría legal.",
      },
      {
        exigencia: "El reglamento deja escrito si corresponde registrarlo o presentarlo ante la autoridad de trabajo, y quién responde por ese trámite.",
        como_se_comprueba: "Buscar el artículo o la nota de registro. Sí: existe, nombra al responsable y dice en qué estado está la consulta, aunque la respuesta todavía no haya llegado. No: el documento no menciona el tema.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "Un reglamento que debía presentarse y no se presentó deja a la empresa expuesta justo cuando lo necesita. Qué corresponde presentar, ante quién y en qué forma lo responde el asesor legal y contable, no Gerencia: verificar con asesoría legal.",
      },
      {
        exigencia: "El documento trae un anexo con las preguntas abiertas a la asesoría legal, cada una con la fecha en que se preguntó, quién debe responder y su estado.",
        como_se_comprueba: "Buscar el anexo. Sí: existe, cada pregunta tiene fecha, destinatario y estado, y están al menos las tres que esta casa ya tiene a la vista: el faltante a cuenta del trabajador, los dos puestos marcados «sin fiscalización de horario», y el uso del control biométrico y los datos del trabajador. No: no hay anexo, o hay afirmaciones legales sin fuente ni fecha.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "Lo que está en duda tiene que estar en una lista con fecha y dueño, no en la cabeza de quien redactó. Así se entrega el reglamento diciendo exactamente qué falta, en vez de inventar la respuesta para que el documento parezca completo. Verificar con asesoría legal.",
      },
      {
        exigencia: "Ninguna obligación ni prohibición está escrita dos veces, con las mismas palabras o con otras.",
        como_se_comprueba: "Leer la lista de obligaciones y la de prohibiciones buscando pares que digan lo mismo. Sí: cada obligación aparece una sola vez. No: hay dos o más artículos que un trabajador leería como la misma regla.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "En el manual de funciones de esta casa el cuadre de caja estaba escrito tres veces en el mismo puesto, y 12 de 48 funciones eran copiar y pegar. Escribir una regla tres veces no la refuerza: la diluye, y el día que hay que corregirla hay que corregirla en tres lugares y uno se queda viejo.",
      },
      {
        exigencia: "Todo puesto, área o sede que el reglamento nombre existe en el organigrama y en el manual de funciones vigentes, y con el mismo nombre.",
        como_se_comprueba: "Listar cada puesto nombrado en el reglamento —sobre todo los que autorizan, aprueban o sancionan— y buscar su ficha en el manual de funciones. Sí: todos tienen ficha y el nombre coincide. No: alguno manda o sanciona sin ficha, o se llama distinto en cada documento.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "El manual de funciones nombraba cinco veces a un «Supervisor Principal» como jefe del cajero, y ese puesto no tenía ficha. Un puesto que sanciona sin funciones ni autoridad escritas no puede sancionar, y el trabajador que lo sepa tiene cómo desarmar la medida.",
      },
      {
        exigencia: "Cada obligación del trabajador dice dónde queda el registro de su cumplimiento.",
        como_se_comprueba: "Por cada obligación, buscar el registro nombrado: el control biométrico, un acta, un formato, un libro, un reporte. Sí: cada una dice dónde se lee. No: hay obligaciones del tipo «cumplir el horario» o «reportar incidencias» sin decir dónde se comprueba.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "Una regla sin registro vuelve a discutirse cada mes y acaba dependiendo de quién se acuerde. La decisión solo queda tomada cuando se convierte en un mecanismo que deja rastro sin que nadie se esfuerce.",
      },
      {
        exigencia: "El reglamento nace diciendo cómo se enseña: quién lo explica, en qué momento del ingreso, y cómo se comprueba que el trabajador lo entendió antes de firmar.",
        como_se_comprueba: "Buscar el artículo o anexo de inducción al reglamento. Sí: nombra responsable, momento y la forma concreta de comprobar que se entendió. No: el reglamento se entrega para leer y firmar el mismo día, sin que nadie lo explique ni verifique.",
        origen: "manual_vigente",
        obligatoria: false,
        por_que: "La cadena de la casa es documentar, enseñar, evaluar, certificar y respaldar. Un reglamento que solo se documenta se queda en la carpeta, y la firma de recepción prueba que se entregó, no que se entendió.",
      },
      {
        exigencia: "No hay capítulos sobre cosas que esta empresa no tiene.",
        como_se_comprueba: "Buscar menciones de comedor, vestuarios, uniformes, vehículos de la empresa, fundo o planta, turnos rotativos, sindicato, áreas o cargos que la casa no tiene. Sí: cada capítulo regula algo que existe hoy en alguna de las sedes. No: aparece aunque sea uno que no se aplica a nadie.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "El capítulo copiado de plantilla le enseña al trabajador, en la primera página que lee, que este documento no habla de su trabajo. Después de eso no lee el resto, y las reglas que sí importan se pierden junto con las que sobran.",
      },
    ],
    errores_tipicos: ["Es una plantilla descargada con el nombre de la empresa cambiado: regula comedor, uniformes, vehículos y sindicato, y no menciona la caja, el efectivo ni la bóveda, que es de lo único que vive la empresa.", "Un horario único para toda la empresa cuando cada sede abre y cierra a hora distinta, y el personal de seguridad tiene otra franja.", "Sanciones sin procedimiento: «la empresa aplicará la sanción que corresponda según la gravedad», sin decir quién levanta el hecho, quién decide ni dónde queda escrito.", "Causales de despido y artículos de ley copiados de internet, con numeración equivocada o de una norma que ya cambió.", "Una cláusula que hace al trabajador reponer el faltante de caja, escrita como regla en vigor y no como punto a revisar.", "Montos de multa, de descuento o de adelanto puestos a ojo, que después la empresa no puede exigir.", "Se entrega por el grupo de WhatsApp o se deja impreso en una sede, y no hay constancia firmada de nadie.", "Nombra puestos que no existen en el manual de funciones, y les da la facultad de sancionar.", "La parte de conducta no coincide con el manual de identidad vigente: dos listas distintas de lo mismo, y el trabajador elige.", "Prohibiciones sin registro: prohíbe la tardanza y nadie dice que la tardanza se lee en el control biométrico.", "Fechado antes que el manual de identidad de la casa, y nadie lo notó al entregarlo."],
    senales_de_relleno: ["Dos o tres artículos que un trabajador leería como la misma regla, escritos con palabras distintas y separados por diez páginas.", "Una lista de 40 prohibiciones donde diez son la misma cosa partida en pedazos.", "Adjetivos en lugar de conductas: «el trabajador debe ser responsable, proactivo y leal». No hay manera de decir si lo cumplió o no.", "Párrafos que recitan la ley y no dicen qué hace esta empresa ni quién responde.", "Frases de cierre como «de acuerdo a las normas vigentes» o «conforme al procedimiento interno» cuando ese procedimiento interno no existe por escrito.", "Un primer capítulo de tres páginas sobre el objeto, el ámbito y la filosofía del reglamento, que no obliga a nadie a nada.", "Capítulos sobre materias que la casa no tiene, señal de que el documento se armó desde una plantilla y no desde la empresa."],
    que_se_conserva_casi_siempre: "Cuando el cliente ya tiene reglamento, casi siempre sirve el armazón y hay que decirlo antes de criticar nada: el orden de los capítulos (alcance, ingreso, jornada, obligaciones, prohibiciones, faltas y sanciones, término de la relación), el código, la versión y la fecha si la casa ya tiene sistema documental, el formato de constancia de entrega si existe, y las obligaciones de manejo de efectivo y custodia escritas por quien conoce el negocio. El trabajo es de versión siguiente, no de documento nuevo. En la primera empresa cliente hoy no existe reglamento, así que lo que se conserva es el material disperso que ya está y no hay que volver a levantar: los horarios por sede, el control biométrico como registro de asistencia, y los diez compromisos del manual de identidad, que son la parte de conducta y están vigentes. Lo que no se puede conservar porque no existe: cuánta gente es y bajo qué razón social trabaja cada una. Sin eso el reglamento no se empieza, y no se inventa.",
  },
  estrategia: {
    clave: "estrategia",
    tipo: "Plan Estratégico, FODA y análisis de la organización",
    para_que_sirve: "Es el documento donde el dueño decide en qué va a gastar su atención los próximos meses y qué va a dejar de hacer. Bien hecho, convierte lo que la empresa sabe de sí misma en pocas decisiones con responsable, fecha y número, y deja escrito el punto de partida contra el cual se va a comparar el resultado. Mal hecho, es un cuaderno de buenas intenciones: describe la empresa, no la cambia, y a los tres meses nadie puede decir si funcionó.",
    para_quien_es: "Lo lee el dueño o la gerencia y lo usa el responsable de cada prioridad. El plan completo no pasa de 15 a 20 páginas, y además lleva una sola hoja con las prioridades, su responsable, su fecha y su número: esa hoja es la que se mira en cada revisión.",
    exigencias: [
      {
        exigencia: "Cada cosa escrita en el FODA aparece después en al menos una decisión concreta.",
        como_se_comprueba: "Numerar los ítems de las cuatro cajas y buscar cada número en la sección de decisiones o estrategias cruzadas. Si el documento tiene las cuatro listas y ninguna tabla que las cruce (fortaleza con oportunidad, debilidad con amenaza), o si quedan ítems que nunca se vuelven a mencionar, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un FODA que no termina en decisiones solo describe. La empresa paga por lo que va a hacer, no por el inventario de lo que tiene.",
      },
      {
        exigencia: "Cada fortaleza dice dónde se va a usar para que rinda más, y cada debilidad dice qué la causa.",
        como_se_comprueba: "Leer fortaleza por fortaleza: tiene que haber una frase que diga en qué cliente, producto, sede o proceso se aplica. Leer debilidad por debilidad: tiene que decir por qué pasa (falta una persona, falta una regla escrita, falta el dato, el dueño es el único que puede hacerlo). Una fortaleza que es solo un adjetivo —«buen clima», «personal comprometido»— no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Sin la causa no se corrige nada: se atacan síntomas. Y una fortaleza que no se aplica a nada no da un sol más.",
      },
      {
        exigencia: "Cada afirmación del análisis dice de dónde salió y cuándo.",
        como_se_comprueba: "Cada ítem del FODA y cada párrafo del análisis cierra con su origen: quién lo dijo y en qué fecha, o qué documento o registro lo respalda. Si el documento no distingue lo que alguien dijo de memoria de lo que está en un registro, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Si todo pesa igual, se decide sobre percepciones creyendo que son hechos. Lo dicho de memoria sirve para pensar; para apostar dinero hace falta saber qué es cada cosa.",
      },
      {
        exigencia: "El plan tiene de tres a cinco prioridades, no más.",
        como_se_comprueba: "Contar los objetivos de primer nivel. Si hay más de cinco frentes abiertos al mismo tiempo, no cumple, aunque todos sean buenos. Los demás tienen que estar en una lista aparte de «después», con su fecha de revisión.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Quince prioridades son cero prioridades: el equipo avanza un poco en todo y nada termina. Pocas piezas mueven casi todo el resultado, y el plan tiene que apostar a esas.",
      },
      {
        exigencia: "El plan nombra en una sola frase cuál es el elemento que hace ganar al negocio —un producto, un tipo de cliente, un canal o una capacidad—, y es uno, no tres candidatos sin elegir.",
        como_se_comprueba: "Buscar la frase única. Sí: hay una sola frase y nombra un solo elemento. No: la frase no existe, o lista dos o más candidatos sin elegir uno.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Sin eso, el plan es una lista de mejoras parejas y el dueño reparte su atención por igual entre lo que mueve la empresa y lo que no.",
      },
      {
        exigencia: "Debajo de esa frase va la cuenta de qué parte del ingreso sale de ese elemento. Es deseable mientras no exista la foto de los números del arranque, y obligatoria desde el día en que esa foto exista.",
        como_se_comprueba: "Buscar debajo de la frase la cifra y la cuenta que la produce. Sí: está la cifra con la cuenta a la vista; y si el dato todavía no está medido, la cifra va marcada «estimada» y el plan dice en qué fecha se reemplaza por la medida. No: no hay cifra, o hay cifra sin la cuenta a la vista, o hay cifra estimada sin la fecha en que se reemplaza.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que: "La frase sin número es una creencia. Pero exigir el número antes de que exista la línea base bloquea la entrega del plan: hoy el margen por línea no está medido, y hablar de ganancia obliga antes a la lista de costos, que tampoco existe. Por eso el número entra marcado como estimado y con fecha de reemplazo, y nunca en silencio.",
      },
      {
        exigencia: "El plan nombra qué es lo que hoy limita el resultado, y al menos una prioridad ataca justo eso.",
        como_se_comprueba: "Buscar la frase que dice qué lo limita: una persona, la caja, un equipo, un permiso o la falta de clientes. Después revisar que una de las prioridades cambie ese límite. Si el documento no lo nombra, o lo nombra y ninguna prioridad lo toca, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Mejorar en cualquier otra parte no cambia el resultado mientras el límite siga puesto: se trabaja más y se gana lo mismo.",
      },
      {
        exigencia: "Cada objetivo trae responsable con nombre y puesto, y fecha de término.",
        como_se_comprueba: "Por cada objetivo, buscar los tres datos: nombre de la persona, su puesto y el día y mes de término. «Todos», «el equipo», «el área» y «permanente» no cumplen.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un objetivo sin dueño no lo hace nadie. El responsable con nombre y puesto y la fecha de término salen de nuestra metodología: se firman como nuestros y no como pedido del manual del cliente.",
      },
      {
        exigencia: "Cada objetivo cierra con su medición: el número, su unidad y de dónde se lee.",
        como_se_comprueba: "Por cada objetivo, buscar el número con su unidad y el registro, sistema o cuaderno de donde se lee. «Mejorar la atención», «aumentar las ventas» y un número sin decir de dónde sale no cumplen.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Lo pide el manual de identidad vigente del propio cliente, y por eso se le puede mostrar en su propia página en vez de pedirle que confíe en una regla nuestra: sus ocho principios cierran uno por uno con una línea «Medición: …» —por ejemplo «Medición: porcentaje de procesos críticos documentados y porcentaje de puestos con respaldo operativo»—. Un objetivo sin señal de logro no se puede cerrar: queda abierto para siempre o se cierra por cansancio.",
      },
      {
        exigencia: "Cada cifra del plan dice si está medida, contada o estimada.",
        como_se_comprueba: "Recorrer todas las cifras del documento. Cada una lleva su marca: medida (sale de un registro o sistema), contada (alguien la contó a mano y el conteo se puede repetir) o estimada (la dio de memoria, o es un cálculo nuestro). Una cifra sin marca no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Una cifra estimada que se lee como medida es la forma más común de decidir mal. El dueño tiene derecho a saber sobre qué piso está parado cada número.",
      },
      {
        exigencia: "No se afirma rentabilidad ni margen sin la lista de los costos que entraron en la cuenta.",
        como_se_comprueba: "Para cada margen, rentabilidad o «producto más rentable» del documento, buscar la lista de costos usados: compra, personal, alquiler, comisiones, transporte, merma e impuestos. Si la lista no está, o están solo precio menos costo de compra, o el documento no dice qué costo quedó fuera, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Con costos incompletos, el producto que parece el más rentable puede ser el que hace perder dinero, y el plan lo manda a crecer. Es el error más caro de todos.",
      },
      {
        exigencia: "El documento deja escrita la foto de los números del día en que arranca el plan, con su fecha.",
        como_se_comprueba: "Buscar una tabla fechada con los números del negocio al inicio: venta del mes, ganancia del mes, caja de hoy, gasto fijo del mes, precio y costo del producto principal, de cada diez interesados cuántos compran, lo que le deben los clientes y lo que la empresa debe. Tiene que decir expresamente que esa foto es el punto de comparación. Con menos de cinco de esos nueve números, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Sin punto de partida escrito, dentro de tres meses la pregunta «¿funcionó?» se contesta con opiniones. Y el punto de partida no se puede reconstruir después: nadie se acuerda.",
      },
      {
        exigencia: "Cada prioridad trae dos fechas distintas: cuándo queda instalada y cuándo se mide su resultado.",
        como_se_comprueba: "Por cada prioridad, buscar las dos fechas. Si hay una sola fecha que promete el cambio y el resultado al mismo tiempo, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Instalar una regla toma días; que mueva el dinero toma semanas o meses. Prometer las dos cosas juntas es lo que después no se cumple, y quema la confianza del plan entero.",
      },
      {
        exigencia: "Las metas numéricas vienen en rango, con sus supuestos escritos, y el documento no garantiza ningún resultado.",
        como_se_comprueba: "Buscar cada meta: tiene que estar escrita como rango («entre X e Y al mes») y apoyarse en supuestos numerados que estén en el documento. Buscar también las palabras «garantizamos», «aseguramos» y «se duplicará»: si aparecen sobre un resultado económico, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Una cifra exacta sobre datos estimados es una promesa que el documento no puede sostener. El rango con sus supuestos sí se puede defender, y se cierra cuando llegan los datos.",
      },
      {
        exigencia: "Cada prioridad nombra el documento, puesto o proceso concreto que cambia.",
        como_se_comprueba: "Por cada prioridad, buscar el nombre propio de lo que se toca: el manual de funciones, el organigrama, el protocolo de atención, el proceso de cierre de caja, el perfil de un puesto. Sí: cada prioridad nombra al menos uno. No: una sola prioridad no aterriza en nada con nombre propio.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Lo que no queda escrito en un documento, enseñado y evaluado, vuelve a como estaba en cuanto nadie mira. Una prioridad que no nombra el documento que cambia no se puede ejecutar ni revisar.",
      },
      {
        exigencia: "Ninguna prioridad le entrega a un puesto una atribución que el dueño se reservó.",
        como_se_comprueba: "Poner al costado el acta de decisiones firmada por el dueño, que el propio plan cita con su fecha. Recorrer las prioridades y buscar si alguna le da a un puesto una atribución que el acta le reserva al dueño (por ejemplo, poner el precio). Una sola, no cumple. Si el plan no cita ninguna acta firmada por el dueño, la exigencia queda abierta, no se marca cumple, y se dice así en la entrega.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un plan que contradice lo que el dueño decidió no se ejecuta: se ignora. Y la comprobación se firma como nuestra, porque el hallazgo es nuestro: en el manual de funciones de este cliente la función del precio estaba en el puesto del administrador y la Gerencia dijo que el precio lo manda ella.",
      },
      {
        exigencia: "El propósito, la misión, la visión, los pilares y los valores que el plan escribe están copiados palabra por palabra del manual de identidad vigente.",
        como_se_comprueba: "Poner los dos textos al lado: el del plan y el del manual de identidad vigente. Sí: las cinco piezas están en el plan y cada una coincide palabra por palabra con el manual. No: falta una, o alguna está reescrita con otras palabras. Donde el plan diga otra cosa, manda el manual. Si el manual de identidad vigente no está a la vista, la exigencia queda abierta, no se marca cumple, y se dice así en la entrega.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "El manual de la casa pide que la identidad baje a los documentos de la empresa, y el plan es el documento que la empresa va a leer todo el año: si reescribe el propósito con otras palabras, la casa termina con dos propósitos y ninguno manda. Es la pieza del plan que no es nuestra y que no se discute.",
      },
      {
        exigencia: "Toda prioridad que toque contratos, sueldos, jornada, descuentos al trabajador, apertura de local o publicidad de precios cierra diciendo que falta confirmarla con asesoría legal.",
        como_se_comprueba: "Buscar esas prioridades y verificar que cada una cierre con esa frase. Revisar además que el documento no afirme plazos, montos, porcentajes ni artículos de ley: si inventa uno, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "Un plan que afirma lo que la ley exige sin haberlo confirmado expone a la empresa y a quien lo firmó. Marcar el punto cuesta una línea; equivocarse cuesta una multa o un juicio. Verificar con asesoría legal.",
      },
      {
        exigencia: "El plan dice qué se deja de hacer, con fecha de corte.",
        como_se_comprueba: "Buscar la lista de lo que se elimina o se reduce: un reporte que nadie usa, un producto que resta, una reunión, un paso del proceso. Tiene que haber al menos tres cosas, cada una con la fecha en que se deja de hacer. Si el plan solo suma actividades, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "Las horas del equipo ya están ocupadas. Si el plan solo agrega, se ejecuta a medias y el dueño concluye que su gente no quiere trabajar.",
      },
      {
        exigencia: "El plan deja escrito cuándo se revisa, quién dirige la revisión y qué pasa si una prioridad se atrasa dos veces seguidas.",
        como_se_comprueba: "Buscar el día y la hora fija de la revisión, el nombre de quien la dirige, la lista de lo que se mira, y la regla escrita para el atraso repetido (se cambia el responsable, se recorta el alcance o se baja la prioridad). Si solo dice «se hará seguimiento», no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "Sin una cita fija y una consecuencia escrita, el plan depende de que el dueño se acuerde. La decisión tiene que quedar convertida en un mecanismo que corra sin él.",
      },
    ],
    errores_tipicos: ["El FODA son cuatro cajas con viñetas y el documento pasa a otra sección: nunca se cruzan ni producen una decisión.", "Las fortalezas y debilidades son adjetivos trasplantables: cambiando el nombre de la empresa, el párrafo sirve para cualquier otra.", "Quince objetivos de primer nivel, todos marcados como prioritarios, repartidos en un cuadro simétrico de cinco áreas por tres objetivos.", "«Responsable: todos» o «Responsable: el área administrativa». Nadie con nombre y puesto.", "«Plazo: permanente» o «corto plazo» en lugar de un día y un mes.", "Objetivos que son actividades («realizar capacitaciones», «implementar mejoras») y no resultados que se puedan medir.", "Metas redondas sin cuenta detrás: «incrementar las ventas en un 30 %», sin decir 30 % sobre qué número ni de dónde sale ese número.", "Rentabilidad por producto calculada con precio menos costo de compra, sin personal, alquiler ni comisiones; y después el plan manda a crecer justo lo que pierde.", "Ningún punto de partida escrito: el plan arranca sin la foto de los números del día uno, y al cierre no hay contra qué comparar.", "Un dato único para una empresa que tiene varias sedes (un horario, un precio, un responsable) cuando cada sede opera distinto.", "El plan es más viejo que el manual de identidad o que las decisiones del dueño y no los recoge; sigue repartiendo atribuciones que el dueño ya se reservó.", "La misma idea escrita tres veces con palabras distintas en secciones distintas, como si fueran tres objetivos."],
    senales_de_relleno: ["Páginas que explican qué es un FODA, qué significa cada letra y para qué sirve la planificación estratégica. Eso es teoría, no análisis de esta empresa.", "Ninguna fecha, ningún nombre de persona y ninguna cifra en tres páginas seguidas.", "Visión y misión de tres renglones con las palabras «líder», «referente» y «excelencia», y ninguna conducta que las aterrice.", "Cuadros perfectamente simétricos: cinco fortalezas, cinco debilidades, cinco oportunidades, cinco amenazas. La realidad no sale pareja; esa simetría es una plantilla llenada.", "Gráficos de torta y de barras sin la tabla de datos ni la fuente que los origina.", "Oportunidades y amenazas copiadas del contexto del país («crecimiento del comercio electrónico», «inestabilidad política») sin un solo dato de esta empresa ni un competidor con nombre.", "Objetivos que empiezan con «optimizar», «fortalecer», «potenciar» o «promover»: verbos que no se pueden terminar ni verificar.", "El mismo párrafo repetido con sinónimos para llenar la página del área que no se levantó."],
    que_se_conserva_casi_siempre: "Casi todo el material de la empresa se conserva y no hay que rehacerlo: la historia, las sedes, las líneas de producto o servicio, los clientes, el organigrama que ya dibujaron, la lista de problemas que el dueño ya detectó, y su lectura de lo que la empresa hace bien y mal — eso es información de primera mano que nadie de afuera tiene. También se conservan la misión, la visión y los valores si el equipo ya los reconoce como suyos, y la estructura, la codificación y el versionado del documento si ya existen: no se inventa un sistema documental nuevo, se sube la versión. Lo que se rehace es siempre lo mismo: el cruce que convierte el análisis en decisiones, el recorte a tres o cinco prioridades, las cifras con su estado, la foto del punto de partida y los plazos separados entre instalar y ver resultado.",
  },
  atencion: {
    clave: "atencion",
    tipo: "Manual de Atención al Cliente",
    para_que_sirve: "Hace que el cliente reciba la misma atención en cualquier sede y con cualquier trabajador, sin que dependa de quién esté ese día en la ventanilla. Convierte la promesa de la empresa (que el cliente no haga cola ni cargue efectivo, y que se vaya sabiendo exactamente qué recibió) en pasos que se hacen, se observan y se corrigen. Cuando está bien hecho, se puede contratar, enseñar y evaluar con él: una persona nueva atiende bien en su primera semana porque está escrito qué hace y qué dice. Cuando está mal hecho, es un discurso de buen trato que nadie puede comprobar y que se contradice con lo que la dueña ya decidió.",
    para_quien_es: "Dos lectores y dos largos, declarados en la primera página. El del trabajador de ventanilla: una cara, que se pega al lado de la caja y se lee de pie — los seis pasos, las frases que se dicen, a quién se llama cuando el caso lo excede, y qué nunca es aceptable. El del administrador y la consultora: el criterio completo, con las ramas de atención, los formatos anexos, la ficha de observación y los números con que se mide; hasta unas 12 a 15 páginas, incluidos anexos. Un manual de atención de 40 páginas para un cajero no se lee.",
    exigencias: [
      {
        exigencia: "La primera página dice a quién va dirigido el documento; y si va dirigido al trabajador de ventanilla, la parte que él usa está al principio y no pasa de 4 caras, y lo demás va como anexo.",
        como_se_comprueba: "Buscar en la primera página la línea que nombra al lector (trabajador de ventanilla, administrador, consultora): si no está, no cumple. Si nombra al trabajador de ventanilla, contar las caras desde el inicio hasta donde terminan los pasos de ventanilla: 5 caras o más, no cumple. Lo que venga después de esas caras tiene que estar rotulado como anexo.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Un manual que no cabe en la jornada de quien lo usa no se lee, y lo que no se lee no se aplica. El límite es un número exacto de caras contadas y no una apreciación de largo, porque «unas quince páginas» se mide distinto según quién revise: 4 caras se cuentan igual en manos de cualquiera.",
      },
      {
        exigencia: "Usa el protocolo de atención de seis pasos que ya está vigente en la empresa, con sus mismos nombres y en el mismo orden, y no propone una segunda secuencia distinta.",
        como_se_comprueba: "Buscar los seis pasos RECIBIR, ESCUCHAR, INFORMAR, EJECUTAR, VERIFICAR y CERRAR. Tienen que estar los seis, escritos con esos nombres y en ese orden. Después buscar en todo el documento cualquier otra secuencia de atención con otros nombres o otra cantidad de pasos: si aparece una, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "El personal ya fue capacitado en esos seis pasos y los firmó. Un manual que trae otra secuencia obliga al trabajador a elegir entre dos doctrinas, y en la duda no aplica ninguna: vuelve a atender como le parece.",
      },
      {
        exigencia: "Cada paso dice qué hace el trabajador y qué dice, no qué debe sentir ni cómo debe ser.",
        como_se_comprueba: "Leer paso por paso. Cada uno tiene que tener al menos un verbo de acción que se puede ver desde dos metros (saluda y dice el nombre de la empresa, repite en voz alta el monto y el tipo de cambio, cuenta el efectivo delante del cliente, entrega el comprobante) y, donde corresponde, la frase textual que se dice. Marcar todo paso cuyo texto sea solo actitud: ser amable, mostrar empatía, generar confianza, atender con calidez. Si queda un paso solo con adjetivos, ese paso no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un adjetivo no se puede enseñar, ni observar, ni corregir. Ya pasó en el MOF de esta empresa: la sección de habilidades es una lista de adjetivos que nadie pudo evaluar nunca. Si el paso no se ve, el cumplimiento es opinión del jefe.",
      },
      {
        exigencia: "Cubre todos los tipos de cliente que de verdad llegan a la ventanilla, y cada uno tiene escrito a dónde va; el tipo que todavía no tiene procedimiento se declara como faltante en vez de quedar en el aire.",
        como_se_comprueba: "Hacer la lista de los servicios que la empresa atiende hoy en ventanilla (cambio de moneda, remesa, envío de encomienda, transferencia virtual, y cualquier otro). Para cada uno, buscar en el manual su rama: qué se le pregunta al cliente, qué se le dice y qué se hace. Si falta una rama, el manual debe decir con esas palabras que ese caso no tiene procedimiento escrito y a quién se llama mientras no lo tenga. Una rama que no está ni declarada no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "El cliente que llega por el servicio que nadie escribió es el que termina mal atendido y el que genera el reclamo. En esta empresa el reparto de la ventanilla ya deriva a un vacío en una de sus ramas: el trabajador improvisa y cada sede improvisa distinto.",
      },
      {
        exigencia: "Tiene escrito qué se hace cuando el cliente reclama: el nombre del registro donde queda anotado, el puesto que responde y el puesto que cierra. Si todavía no está decidido si la empresa lleva un libro de reclamaciones, el manual lo dice con esas palabras y escribe mientras tanto dónde se anota: cuaderno con fecha, sede y nombre de quien atendió.",
        como_se_comprueba: "Buscar el capítulo de reclamos. Sí: están los tres datos —el nombre del registro, el puesto que responde y el puesto que cierra—, o está escrito que todavía no está decidido si la empresa lleva un libro de reclamaciones y, mientras tanto, dónde se anota con fecha, sede y nombre de quien atendió. No: falta uno de los tres datos, o el capítulo solo dice que el reclamo se atiende con calma y se escala al superior.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "El reclamo es el único momento en que el cliente dice gratis qué está roto, y es el hecho que esta empresa no está capturando. Sin registro, el reclamo se resuelve y se olvida, el mismo problema vuelve el mes siguiente y la empresa no tiene cómo demostrar que lo atendió. La exigencia se firma como nuestra: el procedimiento de reclamos no está en el manual de identidad de la casa.",
      },
      {
        exigencia: "Cada caso que excede lo que el trabajador puede decidir nombra el puesto que autoriza, y lo que todavía no está decidido se escribe como no decidido, sin inventar el número.",
        como_se_comprueba: "Hacer la lista de las excepciones que aparecen en el manual (tipo de cambio preferencial, billete deteriorado, devolución o anulación, operación por encima del monto permitido, cliente que exige algo fuera de lo normal). Cada una tiene que nombrar el puesto que autoriza. Donde la regla no exista todavía, el texto debe decir que no está definida y qué se hace mientras tanto (por ejemplo: apartar el billete y consultar), en lugar de poner un porcentaje o un monto. Un porcentaje o monto sin fuente no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "El trabajador que no sabe a quién llamar decide solo sobre el dinero del cliente, y hoy eso ya ocurre: el descuento por billete deteriorado se decide a ojo porque no hay tabla. Un número inventado en el manual es peor que un vacío declarado, porque se vuelve exigible contra la empresa.",
      },
      {
        exigencia: "Ninguna frase del manual le da al trabajador una facultad que la Gerencia se reservó.",
        como_se_comprueba: "Tomar las decisiones vigentes de Gerencia (quién fija el precio del día, quién aprueba un precio preferencial, quién autoriza devolver) y buscar en el manual cualquier frase que ponga esa decisión en manos del cajero o del administrador. Una sola frase así no cumple, y se corrige o se quita.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Un manual que describe algo que no pasa deja de ser exigible, y el personal aprende que los manuales de la casa se pueden ignorar. Ya ocurrió con el MOF: le da el precio al Administrador cuando el precio lo manda Gerencia.",
      },
      {
        exigencia: "Lo que cambia de una sede a otra está escrito por sede, no en una regla única para toda la empresa.",
        como_se_comprueba: "Buscar horario de atención, hora de cierre, cobertura de seguridad y hora del corte de caja. Cada uno tiene que estar por sede, con el nombre de la sede al lado. Si hay un solo horario o un solo cierre para toda la empresa cuando las sedes abren y cierran a horas distintas, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "Cada sede representa a toda la empresa ante el cliente, y las sedes no operan igual: una cierra dos horas después que las otras. Una regla única hace que dos de las tres sedes estén en falta todos los días sin que nadie lo haya decidido.",
      },
      {
        exigencia: "Tiene escrito qué se hace y qué se le dice al cliente cuando el sistema o el internet se caen.",
        como_se_comprueba: "Buscar el apartado de contingencia. Tiene que tener tres cosas: hasta cuánto se puede operar sin sistema (el monto firmado por Gerencia, no uno propuesto aquí), en qué papel se anota la operación y con qué datos, y la frase que se le dice al cliente que no puede ser atendido. Si falta alguna de las tres, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "La caída del sistema es el momento en que se pierde al cliente y en que aparecen las diferencias de caja. Dejarlo al criterio del momento es repetir el problema cada vez; escribirlo una vez lo convierte en un mecanismo que funciona sin que nadie lo recuerde.",
      },
      {
        exigencia: "Trae como anexo la ficha de observación que la empresa ya usa —la del Día 4 del Plan de Acción, de siete casilleros, con su puntaje y su semáforo verde, amarillo y rojo—, sin quitarle ni renombrarle un casillero, con una sola columna añadida, la de minutos; y dice quién observa, cada cuánto y quién firma la certificación.",
        como_se_comprueba: "Buscar la ficha como anexo. Contar los casilleros: tienen que ser los siete del Día 4 y llevar sus mismos nombres. Verificar que conserve el semáforo verde, amarillo y rojo, y que tenga la columna de minutos. Buscar los tres nombres de puesto: quién observa, cada cuánto y quién firma la certificación. No cumple si falta un casillero, si alguno está renombrado, si falta el semáforo, si falta la columna de minutos, o si falta uno de los tres puestos. Una ficha nueva en lugar de la vigente no cumple: cambiar el instrumento es una decisión que sube a Gerencia.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "La cadena de la casa es documentar, enseñar, evaluar, certificar y respaldar, y el instrumento con que se evalúa ya está vigente y ya se enseñó. Una ficha nueva deja dos instrumentos y crea la segunda doctrina que esta misma vara prohíbe para el protocolo. Lo único que al instrumento vigente le falta es el tiempo, y eso se añade como columna.",
      },
      {
        exigencia: "Dice con qué número se sabrá si el manual se aplica, con fuente, frecuencia y responsable, y dice el valor de hoy aunque sea cero.",
        como_se_comprueba: "Buscar al menos un indicador escrito con sus cuatro datos: nombre, de dónde sale, cada cuánto se lee y qué puesto lo lee (por ejemplo: fichas de observación aplicadas por sede y por semana, reclamos registrados y cerrados, minutos de la operación principal). Y buscar el valor actual. Si el valor es cero porque no se ha observado a nadie, el manual tiene que decirlo con el número.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que: "Sin número de partida, al mes siguiente nadie puede responder si la atención mejoró: se compara contra un recuerdo. Y aquí el valor de partida es cero fichas aplicadas, así que declararlo evita vender como mejora algo que nunca se midió.",
      },
      {
        exigencia: "Tiene una lista corta de lo que nunca es aceptable en la atención, con conductas que se pueden ver.",
        como_se_comprueba: "Buscar un bloque encabezado por «Nunca será aceptable» o equivalente. Cada línea tiene que ser una conducta observable (atender sin contar el efectivo delante del cliente, entregar sin comprobante, discutir el precio con el cliente, anotar el nombre o el documento del cliente donde no corresponde). Si la lista son valores negados en abstracto —falta de respeto, mala actitud— no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que: "El estándar se entiende por el límite, no solo por el ideal. Sin el límite escrito, cada jefe pone el suyo, y la primera vez que hay que sancionar no existe el papel que lo sostenga.",
      },
      {
        exigencia: "El manual trae al final una tabla de obligaciones: una fila por obligación, con el número de la sección donde está escrita. Ninguna obligación aparece en dos filas y ninguna sección manda algo que no esté en la tabla.",
        como_se_comprueba: "Buscar la tabla al final del manual. Contar las filas que repiten la misma obligación: dos filas con la misma obligación, no cumple. Recorrer después las secciones y comprobar que cada obligación que mandan tiene su fila: una obligación mandada en una sección y ausente de la tabla, no cumple. Se escriben los números de las filas repetidas y de las secciones sin fila.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "La repetición no refuerza, diluye: lo escrito tres veces deja de tener dueño. En el manual de funciones de esta empresa el cuadre de caja está escrito tres veces en el mismo puesto y sigue siendo el punto que falla, y una de cada cuatro funciones era copia de otra. La tabla convierte eso en un conteo de filas que el sistema puede hacer solo, en vez de una discusión sobre cuándo dos redacciones dicen lo mismo.",
      },
      {
        exigencia: "Cada paso termina en algo que queda: una frase dicha al cliente, un papel firmado, un comprobante entregado o una anotación en un registro con nombre.",
        como_se_comprueba: "Leer el texto de cada paso y buscar una de las cuatro cosas: la frase que se le dice al cliente, el papel que se firma, el comprobante que se entrega, o el registro con nombre donde queda la anotación. El paso que no termina en ninguna de las cuatro no cumple. Se escriben los números de esos pasos.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que: "Un paso que no deja nada —«mantener una postura adecuada», «proyectar profesionalismo»— no se puede observar ni corregir, y llena el manual de frases que el trabajador no sabe si hizo. Pedir que cada paso termine en una de cuatro cosas concretas es lo que lo vuelve comprobable sin que nadie tenga que opinar sobre si el paso sobra.",
      },
      {
        exigencia: "El manual nombra el registro oficial donde van los reclamos y dice qué datos del cliente se anotan en cada formato anexo, y los dos puntos quedan marcados para verificar con asesoría legal.",
        como_se_comprueba: "Buscar el nombre y la ubicación del registro de reclamos (física o digital) y, en cada formato anexo, la lista de datos del cliente que se piden y quién los custodia. Verificar que el documento incluya una nota escrita que diga que corresponde confirmar con asesoría legal si la empresa debe llevar un registro oficial de reclamos y qué datos del cliente puede registrar y conservar. Sin esa nota, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que: "El capítulo de reclamos y los formatos de atención recogen datos de personas y pueden estar sujetos a obligaciones formales. Escribirlos sin confirmar expone a la empresa, y poner aquí un plazo o un artículo que no se verificó sería inventarlo. Verificar con asesoría legal.",
      },
      {
        exigencia: "Cada paso trae el tiempo que debería tomar, o la operación completa trae su tiempo en minutos, y dice de dónde salió ese número.",
        como_se_comprueba: "Buscar minutos en el documento. Al lado de cada número tiene que estar su origen: medido con reloj, con fecha y sede, o marcado «por medir». Un tiempo sin origen o un tiempo que solo repite lo que alguien recuerda no cumple.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que: "El tiempo es lo que el cliente de esta empresa está comprando: no hacer cola. Sin tiempo escrito, la atención rápida es una intención; con tiempo escrito, se nota el día que se alarga. Aquí se afirma que la operación toma cuatro o cinco minutos y esa cifra nunca se midió.",
      },
      {
        exigencia: "Diseña la experiencia completa del cliente —antes de entrar, la espera, la salida y lo que se lleva— y no solo el momento frente a la caja.",
        como_se_comprueba: "Verificar que haya pasos escritos para lo que pasa antes de llegar a la ventanilla (quién recibe, qué se le dice al que espera, cuánto se espera como máximo), para la despedida y para lo que el cliente se lleva en la mano. Si el manual empieza cuando el cliente ya está frente al cajero y termina cuando recibe el dinero, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que: "La atención se pierde o se gana antes y después de la ventanilla: en la espera sin que nadie lo mire y en la salida sin saber qué recibió. Exigir buen trato sin diseñar esos dos momentos deja al trabajador respondiendo por algo que no controla.",
      },
    ],
    errores_tipicos: ["Un solo documento largo para todos los lectores: el cajero recibe las mismas cuarenta páginas que el administrador, y no las lee.", "El manual inventa su propia secuencia de atención en vez de usar el protocolo de seis pasos que ya está vigente y que el personal ya firmó. Quedan dos doctrinas y no se aplica ninguna.", "Los pasos están escritos como actitudes y no como acciones: ser amable, generar confianza, mostrar empatía. Nadie puede observarlo ni corregirlo, igual que la sección de habilidades del MOF, que son adjetivos.", "Falta la rama del servicio que sí existe pero no tiene procedimiento escrito, y el trabajador improvisa: en esta empresa la ventanilla ya deriva a un vacío en una de sus ramas.", "El capítulo de reclamos dice que se atiende el reclamo con calma y no dice dónde se anota, quién responde ni en cuánto tiempo.", "El manual le da al cajero o al administrador decisiones que Gerencia se reservó, sobre todo el precio. Es el mismo error del MOF, donde la función del precio está en el puesto equivocado.", "Un solo horario y un solo cierre para toda la empresa, cuando las sedes abren y cierran a horas distintas. El MOF vigente tiene exactamente ese error en sus seis fichas.", "Montos y porcentajes puestos para que el documento se vea completo: un descuento por billete deteriorado, un tope de operación, un plazo de respuesta, ninguno decidido por Gerencia.", "El manual se escribe sin haber observado una sola atención real, y queda el estándar que debería ser sin saber cuál es el de hoy.", "No hay ficha de observación, o la ficha evalúa con nota de 1 a 10 y no con casilleros de sí o no, así que dos observadores dan resultados distintos a la misma atención.", "Nada de lo que promete el manual tiene un número, así que al mes siguiente la pregunta de si la atención mejoró se responde de memoria.", "Promesas que la empresa no puede sostener hoy: atención en un minuto, respuesta en el día, un servicio que todavía no existe."],
    senales_de_relleno: ["Capítulos de introducción, misión, visión y filosofía de servicio antes del primer paso de atención. Si el trabajador tiene que pasar cinco páginas para saber qué dice al recibir al cliente, esas páginas son relleno.", "La misma obligación escrita en dos o tres lugares con palabras distintas, como el cuadre de caja escrito tres veces en el MOF.", "Listas de cualidades del buen servicio —empatía, proactividad, vocación, actitud positiva— sin una sola conducta observable al lado.", "Pasos que no cambian nada: 'mantener una postura adecuada', 'proyectar profesionalismo'. Si se quitan, ni el cliente ni el registro se enteran.", "Teoría de atención al cliente copiada de un curso: tipos de cliente por carácter, pirámides de necesidades, la regla de los primeros segundos. Nada de eso se comprueba en la ventanilla.", "Frases del tipo 'según las mejores prácticas internacionales' o 'de acuerdo a la normativa vigente' sin decir cuál, lo que normalmente significa que nadie la verificó.", "Anexos vacíos: la ficha de evaluación anunciada en el índice y que no está, o un formato sin campos.", "Simetría sospechosa: diez principios, diez compromisos, diez prohibiciones, todos con el mismo largo. Indica lista rellenada hasta el número redondo y no criterio.", "Indicadores sin fuente ni responsable: 'nivel de satisfacción del cliente' sin decir de dónde sale el número, cada cuánto se lee ni quién lo lee."],
    que_se_conserva_casi_siempre: "Casi siempre se conserva el protocolo de atención ya vigente y enseñado —los seis pasos RECIBIR, ESCUCHAR, INFORMAR, EJECUTAR, VERIFICAR y CERRAR, las sensaciones que el cliente debe llevarse y la ficha de evaluación del día de capacitación—, y ese protocolo no se pisa: el manual nuevo es su anexo operativo, no una segunda doctrina. También se conserva el código, la versión, la fecha y la firma de recepción del documento del cliente, porque ya existe un sistema documental y no hay que inventarlo; y se conservan las partes que describen lo que de verdad se hace hoy en la ventanilla, que son la línea base contra la que se medirá la mejora. Lo que se corrige es lo que no se puede ver ni medir, lo repetido, lo que contradice lo que la Gerencia decidió, lo que es igual para todas las sedes sin serlo, y lo que falta: las ramas sin procedimiento, los reclamos y la contingencia. El trabajo es una versión siguiente, no un documento nuevo.",
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // LAS DIEZ VARAS QUE FALTABAN
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
    tipo: "Plan de capacitación e implementación de un estándar (manual, protocolo o procedimiento nuevo)",
    para_que_sirve:
      "Es el documento que convierte un manual aprobado en la forma de trabajar de todos los días. Bien hecho resuelve cuatro cosas que hoy cuestan dinero: que nadie pueda decir que no sabía, porque existe una hoja firmada con su nombre, la fecha y el local; que se sepa quién entendió y quién no, porque hay una prueba calificada contra una clave de respuestas y no contra la impresión del que enseñó; que el que no alcanza el nivel deje de hacer exactamente lo mismo que el que sí lo alcanzó, porque hay tareas que se le retiran hasta que demuestre; y que a las pocas semanas se pueda responder si la gente trabaja distinto, porque hay un número de antes y un corte de después. Mal hecho es un cronograma bonito: se dicta, se firma la lista el último día, y a los dos meses nadie recuerda el estándar ni hay con qué probar que se enseñó.",
    para_quien_es:
      "Tres lectores y por eso tres largos. Quien ejecuta el plan lee el cuerpo completo: de 12 a 20 páginas. Quien dicta en cada local lee el cronograma en una sola cara, para pegarlo en la pared. El trabajador no lee el plan: recibe la hoja del día y firma su constancia. Los formatos van aparte, uno por hoja —asistencia, prueba con su clave, ficha de observación, constancia y reporte diario—, porque son lo que de verdad se usa. Un cuerpo de plan que pasa de 30 páginas se está explicando en lugar de instruir, y nadie lo lleva a la sesión.",
    exigencias: [
      {
        exigencia: "Cada sesión dice qué puesto la dicta, y al lado qué acredita que ese puesto domina el tema que va a enseñar.",
        como_se_comprueba:
          "Recorrer sesión por sesión la casilla de quién dicta. Tiene que decir un puesto del organigrama, no «la empresa», no «el área», no «un facilitador». Al lado tiene que estar lo que acredita su dominio: la constancia del curso con su fecha, o el acta del puesto que lo evaluó con el día en que lo evaluó. Si en todas las sesiones el que dicta es el mismo puesto que después califica y certifica, y no hay ni un documento que lo acredite a él, no cumple. Se escribe la lista de sesiones sin acreditación.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "En el plan de este cliente un solo puesto explica los temas de los siete días, observa a cada trabajador, califica las pruebas, firma las certificaciones y arma el expediente; y nada dice quién le enseñó a él ni qué acredita que domina el estándar que va a exigir. Un estándar enseñado por alguien que nunca fue acreditado se enseña con el entendimiento que esa persona alcanzó sola, y lo que se instala en la empresa es su versión, no la aprobada.",
      },
      {
        exigencia: "Cada sesión tiene su hoja de asistencia con siete campos: fecha, hora, local, grupo, nombre del participante, su firma y la firma de quien dictó.",
        como_se_comprueba:
          "Buscar el formato de asistencia entre los anexos y contar sus campos: tienen que estar los siete, y la casilla de grupo va siempre, no solo cuando el tema se dicta más de una vez. Si el plan autoriza dictar el mismo tema a grupos separados, el formato trae además la casilla de turno. Si la asistencia aparece solo nombrada en la lista de evidencias del cierre y el formato no está en el documento ni en su anexo, no cumple. Si trae el nombre del participante y no su firma, tampoco cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "El plan de este cliente autoriza dictar el mismo tema a grupos separados cuando la operación no permite reunir a todos, y la asistencia aparece una sola vez, como un ítem de la lista de evidencias del último día. Así no hay forma de saber quién estuvo en qué sesión: el día que alguien diga que no fue capacitado, la empresa no tiene con qué contradecirlo, y el porcentaje de cobertura que el plan promete se declara cumplido sin que nadie haya contado cabezas.",
      },
      {
        exigencia: "El plan trae la lista nominal del personal por local y turno, el total cuadra con el alcance declarado, y cada persona que no pudo asistir a una sesión tiene su fecha de reposición.",
        como_se_comprueba:
          "Comparar el total de personas que el alcance declara con la cantidad de nombres de la lista nominal. Si el alcance declara un rango de personas en lugar de un número, no cumple. Si no hay lista nominal por local y turno, no cumple. Después, para cada nombre sin sesión asignada —por descanso, vacaciones, licencia o turno de cierre— buscar la fecha de reposición y el puesto que la dicta: un nombre sin fecha de reposición no cumple y se escribe.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "El alcance de este plan declara un rango de colaboradores y tres locales. Con un rango no se puede saber si faltó alguien, y la cobertura total queda declarada cumplida sin contar a nadie. Y una casa que atiende público no cierra para capacitar: siempre hay alguien en ventanilla, de franco o de descanso médico, así que el plan que no trae reposición deja fuera justo a la gente que nunca se enteró del estándar.",
      },
      {
        exigencia: "Cada sesión dice cuánto dura y a qué hora se dicta, el horario cuadra con la hora de atención del local donde se dicta, y está escrito qué puesto atiende al público mientras la sesión ocurre.",
        como_se_comprueba:
          "Buscar la duración de cada actividad del cronograma y contar las que no la traen. Si solo la primera actividad del primer día tiene duración y el resto no, no cumple. Después comparar la hora de cada sesión con la hora de apertura y de cierre del local donde se dicta. Por último buscar, sesión por sesión, el puesto que queda atendiendo al público mientras esa sesión ocurre: la sesión que no lo nombra no cumple y se escribe.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "En este plan solo la primera actividad del primer día trae duración; las demás actividades no dicen cuánto duran. Un cronograma sin duración no se puede cuadrar contra las horas en que los locales atienden, así que la sesión se mete donde se pueda, se corta a la mitad cuando llega un cliente, y el tema que quedó sin terminar nadie lo retoma porque el plan ya pasó al día siguiente. Y si no está escrito qué puesto queda atendiendo, la sesión la interrumpe el primer cliente que entra o se dicta con el local cerrado: las dos formas de que la capacitación no ocurra.",
      },
      {
        exigencia: "Cada tema cierra con una evidencia de comprensión que queda archivada, y el plan nombra tres cosas: qué instrumento es, qué puesto lo califica y dónde queda el documento respondido.",
        como_se_comprueba:
          "Por cada día o tema del cronograma, buscar las tres cosas: el instrumento escrito —el cuestionario con sus preguntas, la ficha de observación con sus casillas, la hoja de simulación con sus elementos—, el puesto que lo califica, y el lugar donde queda el papel respondido o la carpeta del sistema con su nombre. Si el plan anuncia que habrá evaluación de un día y el instrumento de ese día no está en el documento ni en su anexo, ese tema no cumple. Se escribe la lista de temas sin instrumento.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Este plan promete que nueve de cada diez personas obtendrán ochenta o más en la evaluación de cada día, y la evaluación de los primeros días no existe en ninguna parte del documento: se promete el resultado de un instrumento que nadie escribió. Un tema sin evidencia archivada no se puede revisar al mes siguiente, y entonces la única prueba de que la gente entendió es el recuerdo de quien enseñó.",
      },
      {
        exigencia: "La prueba de conocimientos trae sus preguntas escritas una por una, con la respuesta que se considera correcta, el puntaje de cada una y la nota mínima escrita en puntos.",
        como_se_comprueba:
          "Contar las preguntas escritas del instrumento y compararlas con la cantidad que el plan anuncia. Si el plan anuncia una cantidad de preguntas y lo que lista son los temas, no cumple. Verificar que cada pregunta traiga su respuesta esperada y su puntaje, y que la nota mínima esté escrita en puntos y no solo en porcentaje. Si la clave de respuestas no existe, no cumple, porque dos personas que califican la misma hoja ponen dos notas distintas.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "El último día de este plan pide una prueba de veinte preguntas y lo que lista son diez temas: las preguntas no están escritas, no hay clave de respuestas y la nota mínima está puesta en porcentaje sin que exista el puntaje de cada pregunta. Lo que se califica distinto cada vez no es una nota, es una impresión con número encima, y sobre esa impresión el plan decide quién queda certificado.",
      },
      {
        exigencia: "Quien no alcanza el criterio tiene cuatro cosas escritas: qué puesto lo vuelve a enseñar, qué día se lo vuelve a evaluar, cuántos intentos hay y qué pasa al agotarlos, y qué tareas no ejecuta mientras no está certificado.",
        como_se_comprueba:
          "Buscar la salida del que no aprueba y contar cuántas de las cuatro cosas están escritas. Si lo único que dice es que recibirá reforzamiento hasta alcanzar el nivel, no cumple. La fecha puede ser un día o un hecho observable —la siguiente sesión, el regreso de su descanso—, pero tiene que estar. Y la lista de tareas retiradas tiene que nombrar tareas concretas del puesto: si no hay ni una tarea que se le retire, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "En este plan el que no aprueba queda «pendiente de certificación» y recibe reforzamiento «hasta alcanzar el nivel establecido»: sin fecha, sin quién lo refuerza, sin cuántos intentos y sin una sola tarea que se le retire. En una empresa que maneja dinero de terceros, una etiqueta sin consecuencia operativa significa que esa persona sigue atendiendo igual que la certificada, y entonces certificar no cambia nada y la prueba del último día fue un trámite.",
      },
      {
        exigencia: "El plan trae al menos una medición de conducta en el puesto, con fecha de corte posterior al último día, el puesto que la hace y el lugar donde se anota.",
        como_se_comprueba:
          "Clasificar cada número que el plan promete en tres cajas: cobertura (cuántos asistieron, cuántos firmaron), aprendizaje (notas de prueba) y conducta en el puesto (algo que se observa trabajando, semanas después de terminar). Si la caja de conducta queda vacía, no cumple. La medición de conducta tiene que traer su fecha de corte posterior al último día del cronograma, el puesto que la ejecuta y el papel o la pantalla donde se anota el resultado.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Todos los números que este plan promete son de cobertura y de nota: personal capacitado, personal que firmó, promedio de la prueba, porcentaje de certificados. Con eso se aprueba un examen, no se cambia una conducta. La pregunta que la dueña va a hacer a las pocas semanas —si la gente atiende distinto— no tiene con qué responderse, y lo único que quedará para discutirlo será la opinión de quien dictó la capacitación.",
      },
      {
        exigencia: "Cada número que el plan promete trae al lado su valor de hoy con la fecha y el lugar donde se leyó, o dice con esas palabras que hoy no se mide y qué registro habría que abrir.",
        como_se_comprueba:
          "Recorrer la lista de metas e indicadores del plan. Al costado de cada meta tiene que estar el valor de hoy, la fecha en que se leyó y el papel o la pantalla de donde se leyó. Si el valor de hoy no existe, tiene que estar escrita la frase de que hoy eso no se mide, más el registro que habría que abrir. Una meta sin valor de hoy y sin esa confesión no cumple. Un valor de hoy sin fecha de lectura, o sin el papel o la pantalla de donde salió, tampoco cumple: se escribió sin mirar nada.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "La regla de la casa es que todo enunciado lleva su medición y nada se inventa. Este plan promete cobertura total y un promedio mínimo en la prueba, y no dice cuántos de los que hoy trabajan conocían el estándar antes de empezar: a los tres meses nadie puede responder si el plan movió algo. Peor todavía, el plan enseña que el desempeño se medirá con cinco indicadores y sus pesos, y ninguno de esos cinco tiene hoy dónde se lee: se le enseña a la gente una medición que la empresa no tiene.",
      },
      {
        exigencia: "El propio plan está aprobado y fechado: qué puesto lo aprueba con su firma, qué día lo aprobó y desde qué día se ejecuta, y los formatos van con al menos un ejemplar llenado.",
        como_se_comprueba:
          "Mirar la portada y el cierre. Tiene que estar el puesto que aprueba con su firma y la fecha de aprobación, y por separado la fecha de inicio de la ejecución, que son dos hechos distintos. Si el documento solo trae la fecha en que se redactó y las líneas de firma vacías, no cumple. Después revisar los formatos: si la constancia del trabajador, el reporte diario y el expediente de cierre vienen todos en blanco y no hay ni un ejemplar llenado, el plan está escrito y no ejecutado, y se dice así en la medición.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El plan de este cliente trae la fecha en que se redactó, y la constancia del trabajador, el reporte diario y el expediente final están todos en blanco. Por el documento no se puede saber si la implementación ocurrió ni qué día empezó, así que no hay nada que medir contra nada. Y un plan sin aprobación firmada no obliga a nadie: el día que alguien no asista a una sesión, no hay decisión de la Gerencia que respalde el reclamo.",
      },
      {
        exigencia: "Cada conducta que el plan enseña trae sus cuatro partes —qué significa, cómo se demuestra, qué la contradice y cómo se mide— y la lista de pilares, valores y principios es exactamente la del manual aprobado, citado con su versión.",
        como_se_comprueba:
          "Tomar cada valor, principio o estándar que el plan enseña y buscar sus cuatro partes. Contar los que traen las cuatro y los que se quedan en menos, y escribir cuál parte le falta a cada uno. Un valor enseñado solo con su definición y una frase de aliento no cumple. Después comparar la lista de pilares, valores y principios del plan con la del manual de identidad aprobado y verificar que el plan cite su versión: si enseña una lista distinta, o no cita la versión del manual, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "En el plan de este cliente el primer valor llega completo —qué significa, cómo se demuestra, qué lo contradice y cómo se mide— y los cinco siguientes pierden la parte de lo que lo contradice: la precisión se cae a medida que avanza el documento. Y lo que no tiene contrario escrito no se puede corregir en el momento, que es justo lo que el propio plan le pide a quien dicta. Si además el plan enseña una lista de valores distinta de la del manual aprobado, la empresa queda con dos estándares y la gente obedece el que escuchó.",
      },
      {
        exigencia: "El control que la Gerencia hace por su cuenta es un paso del plan, con día, con a cuántas personas de cada local pregunta, con las preguntas escritas y con el lugar donde anota lo que escuchó.",
        como_se_comprueba:
          "Buscar en el plan el control que la Gerencia ejecuta sin pasar por quien dictó las sesiones. Tiene que traer cuatro cosas: el día en que se hace, a cuántas personas y de qué locales, las preguntas escritas, y el papel o la carpeta donde queda anotado lo que cada persona respondió. Si el control existe como párrafo de recomendación —«la Gerencia deberá realizar controles directos»— y no como paso con día y registro, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Este plan le pide a la Gerencia que no se limite a recibir los informes de quien dictó, y hasta le escribe las preguntas que debe hacer. Pero no le pone día, ni cuántas personas, ni dónde anotar lo que escuche: un control sin fecha ni registro no ocurre, y si ocurre no se puede comparar con nada. Es además el único dato del plan que no viene filtrado por la misma persona a la que se está evaluando.",
      },
      {
        exigencia: "El puesto que califica las pruebas no es el mismo que dictó la sesión; si lo es, o si su propia evaluación depende de esas notas, hay un segundo puesto que revisa una muestra de lo ya calificado.",
        como_se_comprueba:
          "Mirar, sesión por sesión, qué puesto la dicta y qué puesto califica su prueba. Después cruzar dos listas: los rubros con que el plan evalúa a quien dicta la capacitación, y los resultados que esa misma persona califica. Si el que dicta es el que califica, o si un rubro de su evaluación es el promedio de las notas que él pone o el porcentaje de certificados que él firma, buscar el segundo puesto que revisa una muestra de las pruebas ya calificadas: tiene que decir cuántas revisa y qué hace cuando encuentra una nota que no corresponde a la hoja. Si ese segundo puesto no existe, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "En el tablero de este cliente quien dicta la capacitación es evaluado por el promedio de las evaluaciones de conocimientos y por el porcentaje de personal certificado, y es la misma persona la que califica esas pruebas y la que firma las certificaciones. Nadie tiene que ser mal intencionado para que las notas suban: el documento le pide el número y le da el lápiz. Y después la empresa toma decisiones de puesto y de dinero creyendo que ese número midió algo.",
      },
      {
        exigencia: "Cada local tiene su propia fila de cierre: qué puesto dictó allí, qué días, cuántas personas quedaron certificadas y cuántas pendientes.",
        como_se_comprueba:
          "Buscar el cuadro de cierre y contar sus filas: tiene que haber una por local, no un total de la empresa. Cada fila tiene que traer el puesto que dictó allí, los días en que dictó, las personas certificadas y las pendientes. Si el plan declara que todos los locales quedaron incorporados y el cuadro trae una sola fila con el total, no cumple, porque el total esconde el local donde no se dictó.",
        origen: "manual_vigente",
        obligatoria: false,
        por_que:
          "El manual de identidad de esta empresa tiene un principio escrito que dice que cada local representa a toda la empresa y que el cliente recibe el mismo estándar en cualquiera de ellos: lo pide su propio manual, no nosotros. Este plan promete que los tres locales quedan incorporados y nunca dice quién dictó en cada uno con una sola persona a cargo y pocos días de cronograma. El total de la empresa es exactamente lo que permite que un local se quede afuera sin que se note.",
      },
      {
        exigencia: "El plan dice cómo entra al estándar quien se incorpore a la empresa después del último día: qué puesto le enseña, en qué plazo y con qué evidencia queda.",
        como_se_comprueba:
          "Buscar qué dice el plan de quien entra después del cierre. Tiene que nombrar el puesto que le enseña, el hecho o la fecha que dispara esa enseñanza —el día que firma su ingreso, antes de operar solo—, y la misma evidencia que dejaron los demás: hoja de asistencia, prueba calificada y constancia firmada. Si el plan termina en su último día y no dice nada de quien entra después, no cumple.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "Un plan que empieza y termina en una semana instala el estándar en la gente que estaba ese día y en nadie más. Con la rotación normal de una empresa de atención al público, en pocos meses hay personas atendiendo que nunca escucharon el estándar, y conviven con las que sí: el cliente recibe dos tratos distintos en el mismo mostrador y la empresa cree que ya capacitó.",
      },
      {
        exigencia: "Todo lo que el plan le exija al trabajador y pueda tocar su relación laboral o sus datos personales va listado como consulta al asesor, sin que el plan lo resuelva por su cuenta.",
        como_se_comprueba:
          "Revisar que estos aparezcan como consulta y no como requisito ya decidido: la constancia que el trabajador firma declarando que conoce el estándar y a qué lo obliga esa firma; si las horas de capacitación van dentro o fuera de la jornada y cómo se registran; qué consecuencia puede tener sobre la relación laboral no alcanzar el criterio; la conservación del documento de identidad, de las notas y de las fichas de observación de cada persona, y hasta cuándo; y si el giro del negocio obliga a capacitaciones que este plan no incluye. Cada uno marcado para verificar con asesoría legal y fuera de la entrega hasta que vuelva la respuesta por escrito. Si el plan fija la consecuencia o el tiempo por su cuenta, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Una consecuencia inventada en un documento que el trabajador firma la paga la empresa, no la consultora. La constancia de este cliente recoge nombre, documento de identidad, cargo, local y firma, y el plan no dice quién guarda ese dato ni hasta cuándo: eso se verifica con asesoría legal antes de pedirle la firma a nadie. Y el que no alcanza el criterio queda etiquetado en un documento firmado, lo que es materia del asesor y no del cronograma.",
      },
    ],
    errores_tipicos: [
      "Un solo puesto dicta todos los temas, observa a cada trabajador, califica las pruebas, firma las certificaciones y arma el expediente: el plan no tiene un segundo par de ojos en ninguna parte del camino.",
      "El tablero de quien dicta la capacitación se llena con el promedio de las notas que él mismo pone y con el porcentaje de certificados que él mismo firma.",
      "La asistencia aparece como una línea de la lista de evidencias del último día, y el formato con fecha, hora, local, grupo y firma no existe en ninguna parte del documento.",
      "El plan autoriza dictar el mismo tema a grupos separados cuando la operación no permite reunir a todos, y no abre la casilla donde se anota qué grupo, qué día y en qué local.",
      "El alcance declara un rango de personas en lugar de un número, y no hay lista nominal: con un rango la cobertura total se declara cumplida sin contar a nadie.",
      "Los indicadores del día prometen que casi todos obtendrán la nota mínima, y la prueba de ese día no está escrita: se promete el resultado de un instrumento que nadie redactó.",
      "La prueba final anuncia una cantidad de preguntas y lo que lista son los temas: sin preguntas escritas, sin clave de respuestas y con la nota mínima solo en porcentaje.",
      "Quien no aprueba queda «pendiente de certificación» y recibe reforzamiento «hasta alcanzar el nivel»: sin fecha, sin quién lo refuerza, sin intentos y sin una sola tarea que se le retire.",
      "Solo la primera actividad del primer día trae duración; las demás no dicen cuánto duran, así que el cronograma no se puede cuadrar contra las horas en que los locales atienden público.",
      "Todas las metas son de cobertura y de nota —capacitados, firmantes, promedio de la prueba— y ninguna mira la conducta en el puesto unas semanas después del cierre.",
      "El plan enseña que el desempeño se medirá con cinco indicadores y sus pesos, y ninguno de esos indicadores tiene hoy dónde se lee ni valor de hoy.",
      "Las casillas de fecha y firma del plan, de la constancia del trabajador y del reporte diario están todas en blanco, y no hay ni un ejemplar llenado que pruebe que algo se ejecutó.",
    ],
    senales_de_relleno: [
      "Metas escritas todas en la cifra entera —cobertura total, firma total, conocimiento total— repetidas día por día: una meta que no admite ni una ausencia no se escribió para cumplirse.",
      "Listas de temas puestas donde deberían ir las preguntas: identidad, propósito, misión, visión, valores. Eso es el índice del manual, no un cuestionario.",
      "Actividades que son frases de arenga: «dar el ejemplo permanentemente», «conseguir que entiendan una nueva forma de trabajar», «la cultura se construye todos los días».",
      "El mismo contenido contado dos veces, una como actividad del día y otra como mensaje de cierre, con las mismas palabras y sin que la segunda agregue nada que alguien tenga que hacer.",
      "Páginas de modelo y secuencias de verbos en mayúsculas —observar, medir, reconocer, corregir, enseñar— sin un puesto, una fecha ni un papel donde se anoten.",
      "Indicadores con su peso porcentual y sin fuente: el peso se escribe en un cuadro y el dato no se lee en ninguna parte de la empresa.",
      "Formatos pegados al final con todos sus campos en blanco y sin instrucción de quién los llena, en qué momento y dónde quedan después.",
      "Tareas del día que son preguntas de reflexión personal y nadie recoge la hoja ni la lee: lo que no se junta no es evidencia de nada.",
    ],
    que_se_conserva_casi_siempre:
      "Casi siempre se conserva el diseño pedagógico, y hay que decirlo antes de criticar: un tema por día con su objetivo, sus actividades y su resultado esperado es mejor orden que el de la mayoría de las empresas, y no se toca. Se conservan los casos prácticos escritos con la situación real del negocio —la diferencia en caja detectada minutos antes de cerrar el turno es el mejor de todos—, porque son lo más difícil de escribir y lo único que impide que la sesión se vuelva una lectura en voz alta. Se conserva la estructura de retroalimentación en cinco frases: esto observé, este es el estándar, esto hiciste distinto, esto esperamos desde ahora, vamos a corregirlo; y se conserva el paso de volver a hacer la tarea bien, que es lo que separa enseñar de avisar. Se conservan también la clasificación en verde, amarillo y rojo, el reporte diario de una página con su estado del día, las preguntas con que la Gerencia comprueba por su cuenta, y la constancia firmada con nombre, documento, cargo, local y fecha, que es lo que lo hace exigible. El trabajo normal es la versión siguiente de ese mismo plan —ponerle los formatos que anuncia y no trae, nombrar quién dicta y quién revisa lo calificado, escribir las preguntas con su clave, darle fecha y consecuencia al que no alcanza, y agregar el corte de unas semanas después con su valor de antes—, no un plan nuevo. Rehacerlo desde cero bota el único día que la empresa ya tenía bien escrito y convierte días de trabajo en meses.",
  },

  contrato: {
    clave: "contrato",
    tipo: "Contrato de trabajo y sus anexos",
    para_que_sirve:
      "Es el único documento que firman las dos partes, y el que decide qué se puede exigir el día que algo sale mal. Bien hecho resuelve tres cosas que hoy cuestan dinero: que la persona entre a trabajar sin que quede escrito qué se le prometió; que el contrato prometa una cosa y el manual de funciones otra, de modo que cada uno se defienda con el papel que le conviene; y que un modelo lleno de casilleros se firme con los casilleros en blanco, con lo que el documento no sirve ni para pagar ni para reclamar. Es además el documento que arrastra a todos los demás: nombra los anexos, el reglamento, los manuales y las políticas, y todo lo que nombra queda obligado a existir, a tener versión y a haberse entregado.",
    para_quien_es:
      "Lo firman la Gerencia y el trabajador, lo arma quien administra el personal, y lo revisa el asesor legal antes de que nadie lo firme. El cuerpo que el trabajador tiene que leer antes de firmar no pasa de 6 páginas; con sus anexos —funciones del puesto, declaración jurada, constancia de entrega— 20 como máximo. Un contrato que no se puede leer de corrido antes de firmarlo se firma sin leer, y lo que se firmó sin leer es exactamente lo que después se discute.",
    exigencias: [
      {
        exigencia:
          "El modelo de contrato trae su propio código, su número de versión, la fecha en que la Gerencia lo aprobó y la fecha desde la que rige, en su primera página.",
        como_se_comprueba:
          "Mirar la primera página del contrato —no la del anexo— y buscar cuatro datos: código del documento, número de versión, fecha de aprobación y fecha desde la que rige. Sí: los cuatro están, cada fecha se puede leer como día, mes y año, y la de aprobación no es posterior a la de vigencia. No: falta alguno de los cuatro, o el código y la versión solo aparecen en el anexo de funciones y no en el contrato que lo encabeza.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "Sin versión no se sabe qué modelo firmó cada trabajador, y el día que se corrige una cláusula no hay manera de saber a quién hay que volver a hacer firmar. En el modelo de este cliente el anexo de funciones sí trae código, versión y fecha —con un separador de más en la fecha, que ya hace dudar de qué día es—, y el contrato que lo encabeza no trae ninguno de los tres: la casa ya tiene sistema documental y el documento más importante quedó fuera.",
      },
      {
        exigencia:
          "El modelo trae el bloque de quién lo elaboró, quién lo revisó y quién lo aprobó, con nombre, puesto y fecha de cada uno, separado y distinto de las firmas de las partes.",
        como_se_comprueba:
          "Contar los bloques de firma del documento y clasificarlos. Tienen que haber de dos clases: el del modelo —elaboró, revisó, aprobó, cada uno con nombre, puesto y fecha— y el de las partes que suscriben el contrato. Sí: existen los dos y no se confunden. No: el único bloque de firmas es el de las partes, o el bloque del modelo existe y a alguno de los tres le falta el nombre, el puesto o la fecha.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un modelo que nadie firma como autor no tiene dueño: cuando aparece una cláusula que la empresa no puede sostener, no hay a quién preguntarle de dónde salió ni quién la revisó. Y sin revisión escrita, el mismo modelo se sigue entregando años después de que el asesor observó algo, porque nadie sabe que la observación existió.",
      },
      {
        exigencia: "Ningún casillero del modelo llega a la firma sin llenar, ni en el cuerpo ni en los anexos.",
        como_se_comprueba:
          "Recorrer el ejemplar que se va a firmar, cuerpo y anexos, buscando corchetes, rayas de relleno y las instrucciones «rellenar», «inserte» e «ingrese», y contarlos. Sí: no queda ninguno. No: queda al menos uno abierto, aunque sea el del teléfono o el de la fecha de la firma.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un contrato firmado con el sueldo, el correo o la fecha en blanco no sirve ni para pagar ni para reclamar: el trabajador queda sin defensa y la empresa sin prueba. En el modelo de este cliente quedan abiertos el nombre, el documento de identidad, el domicilio, el sueldo en números y en letras, el número de registro del régimen declarado, el correo, el teléfono y la fecha de la firma: ocho huecos que alguien tiene que acordarse de llenar a mano cada vez.",
      },
      {
        exigencia:
          "El modelo trae al inicio la lista de los campos que hay que llenar antes de imprimirlo, con el nombre de cada campo y de dónde sale el dato.",
        como_se_comprueba:
          "Buscar en la primera página o en una hoja de control la lista de campos a llenar, y compararla con los casilleros que de verdad trae el documento. Sí: la lista existe, nombra todos los casilleros del cuerpo y de los anexos, y cada uno dice de dónde sale el dato. No: no hay lista, o la hay y le falta algún casillero.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "Sin esa lista el control se hace de memoria y siempre se olvida el mismo campo: el que está lejos del inicio, metido dentro de una cláusula larga. Es la diferencia entre revisar un documento y confiar en que quien lo imprimió se acordó de todo.",
      },
      {
        exigencia:
          "No queda en el documento ningún dato de otra persona ni de otro contrato: ni correos, ni teléfonos, ni nombres, ni documentos de identidad, ni enlaces heredados del ejemplar con el que se armó el modelo.",
        como_se_comprueba:
          "Buscar en el documento, incluidos los enlaces y el texto que llevan escondido debajo, todo correo, todo número de teléfono, todo documento de identidad y todo nombre de persona —de persona, no de distrito, de banco ni de entidad—, y comparar cada uno con las dos partes de este contrato. Sí: cada dato pertenece a una de las dos. No: aparece el dato de una persona que no es ninguna de las dos, aunque esté dentro de un casillero todavía sin llenar.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Es el defecto que más rápido convierte un contrato en un problema de datos personales y en una vergüenza frente a la persona que lo está firmando. En el modelo de este cliente el casillero del correo del trabajador lleva pegado, dentro del enlace, el correo personal de un tercero: viajó con la plantilla desde un contrato anterior y hoy se le entrega a cada nuevo ingreso.",
      },
      {
        exigencia:
          "Los anexos que el contrato nombra como parte integrante son exactamente los que van adjuntos al ejemplar, y cada adjunto va identificado con su nombre, su código y su versión.",
        como_se_comprueba:
          "Listar los anexos nombrados en la cláusula de documentos integrantes y listar los que de verdad van adjuntos. Sí: las dos listas coinciden una por una, con el mismo nombre, y cada adjunto trae código y versión. No: el contrato nombra un anexo que no está, va adjunto algo que el contrato no nombra, o un adjunto no dice de qué versión es.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un anexo nombrado y no entregado es una obligación que el trabajador firmó sin verla, y no se le puede exigir. Y un adjunto sin versión impide saber qué funciones firmó cada uno: en el modelo de este cliente el anexo de funciones ya va por una tercera versión y la hoja de recepción no dice cuál se entregó.",
      },
      {
        exigencia:
          "Todo documento interno cuyo cumplimiento el contrato obliga está nombrado con su nombre exacto, su código y su versión, y existe hoy por escrito.",
        como_se_comprueba:
          "Listar cada documento interno que el contrato manda cumplir —reglamentos, políticas, protocolos, manuales, códigos de conducta— y buscar cada uno en el expediente de la empresa. Sí: cada uno está nombrado con nombre exacto, código y versión, y el documento existe. No: alguno está nombrado en genérico, del tipo «políticas internas» o «protocolos de registro digital», o está bien nombrado y no existe escrito en ninguna parte.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "El trabajador firma que cumplirá documentos que nadie puede mostrarle, y el día del reclamo la empresa no tiene qué exhibir. En el modelo de este cliente se obliga a cumplir el reglamento interno, las políticas de atención virtual, los protocolos de registro digital y los manuales operativos, y varios de esos documentos no existen escritos en esta empresa: el reglamento interno, el primero.",
      },
      {
        exigencia:
          "Las funciones escritas en el cuerpo del contrato son las mismas del anexo de funciones, dichas con las mismas palabras, y el cuerpo no agrega ninguna que el anexo no tenga.",
        como_se_comprueba:
          "Numerar las funciones del cuerpo del contrato y las del anexo, y cruzarlas una por una. Sí: cada función del cuerpo tiene su igual en el anexo, con el mismo verbo y el mismo objeto, y ninguna de las dos listas tiene una función de más. No: el cuerpo trae una función que el anexo no tiene, el anexo trae una que el cuerpo no menciona, o la misma función aparece con verbos distintos en los dos documentos.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Con dos listas de funciones firmadas el mismo día, el trabajador cumple la más corta y el jefe exige la más larga, y la discusión no la gana nadie porque los dos tienen un documento en la mano. En el modelo de este cliente el cuerpo del contrato enumera las funciones en un párrafo corrido y el anexo las vuelve a enumerar en una tabla, con otro conteo y otras palabras: no hay forma de saber cuál de las dos listas es la que obliga.",
      },
      {
        exigencia:
          "El puesto, su jefatura inmediata y el local donde trabaja están escritos con un solo nombre y un solo jefe, y coinciden con el organigrama y el manual de funciones vigentes.",
        como_se_comprueba:
          "Anotar el nombre del puesto, el de su jefatura inmediata y el del local tal como aparecen en el contrato, y volver a anotarlos tal como aparecen en el anexo de funciones, en el organigrama y en el manual de funciones. Sí: los cuatro documentos dicen lo mismo y la jefatura inmediata es una sola. No: el contrato nombra más de una jefatura inmediata para el mismo puesto, o el nombre del puesto o del local cambia de un documento a otro.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Con más de un jefe inmediato escrito, el día que dos le piden cosas distintas la persona obedece a uno y queda mal con el otro, y ninguna instrucción resulta exigible. En el modelo de este cliente el mismo puesto reporta a una supervisión de área, a la gerencia y a la administración general a la vez, y eso está escrito dos veces: en el contrato y en el anexo de funciones.",
      },
      {
        exigencia:
          "El horario escrito en el contrato es el del local donde la persona va a trabajar, y el local está identificado con el mismo nombre con el que la empresa lo llama en su lista de locales.",
        como_se_comprueba:
          "Comparar la hora de entrada, de salida y de refrigerio escritas en el contrato con la hora a la que ese local abre y cierra hoy, y buscar el nombre del local en la lista de locales de la empresa. Sí: las horas coinciden y el local está en la lista con ese mismo nombre. No: el horario es el de otro local o uno solo para toda la empresa, o el local se identifica con un código que no figura en ninguna lista.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "El trabajador firma un horario y trabaja otro, y cuando reclama tiene razón y el documento no vale. En el modelo de este cliente el local se identifica con un código de sede que no aparece en ninguna lista de locales de la casa, y la cláusula siguiente autoriza mandar a la persona a cualquier otro local sin que ninguno esté nombrado: se firma un lugar de trabajo que el documento no dice cuál es.",
      },
      {
        exigencia:
          "La remuneración va escrita en números y en letras que coinciden, con la moneda dicha y la forma de pago, y la cifra consta por escrito como decidida por la Gerencia antes de imprimirse el ejemplar.",
        como_se_comprueba:
          "Leer la cláusula de remuneración y buscar aparte la constancia escrita de la decisión. Sí: hay cifra en números, la misma cifra en letras, la moneda escrita con su nombre, la forma de pago dicha, y existe el acta, el correo o la hoja firmada donde la Gerencia decidió esa cifra. No: falta una de las dos escrituras de la cifra, las dos no coinciden, no se dice la moneda, o no existe ninguna constancia escrita de que la Gerencia haya decidido esa cifra.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Una cifra sin moneda, y una cifra que no coincide con su versión en letras, son las dos formas más rápidas de perder una discusión de sueldo. Y una cifra puesta para que el documento se vea completo compromete dinero que la empresa no decidió: eso no se inventa, se pregunta. En el modelo de este cliente la remuneración tiene los dos casilleros abiertos y no dice la moneda en ninguno.",
      },
      {
        exigencia:
          "Cada línea de firma del contrato y de cada anexo trae debajo el nombre de quien firma, su documento de identidad, el puesto con el que firma cuando firma por la empresa, y la fecha.",
        como_se_comprueba:
          "Contar las líneas de firma del contrato y de cada anexo, y mirar qué hay escrito debajo de cada una. Sí: todas las líneas, de las dos partes, traen nombre, documento de identidad, puesto cuando firma por la empresa, y fecha. No: hay una raya sin nada debajo, falta la firma de una de las dos partes en alguno de los anexos, o la fecha de la firma quedó como casillero.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una raya sin nombre no prueba quién firmó, y un anexo que firma solo el trabajador no obliga a la empresa a nada. En el modelo de este cliente la única línea identificada es la del trabajador: la de la empresa es una raya suelta, sin nombre, sin documento y sin el puesto con el que firma, y la declaración jurada anexa no tiene línea para la empresa.",
      },
      {
        exigencia:
          "El contrato y cada uno de sus anexos se entregan contra una constancia firmada que dice qué documento se entregó, en qué versión, a quién, en qué fecha, quién la recoge y dónde queda archivada.",
        como_se_comprueba:
          "Buscar el formato de constancia y contar sus casilleros: documento entregado, versión de ese documento, nombre, documento de identidad, fecha y firma. Buscar después los dos datos que van en el cuerpo: qué puesto recoge la constancia y dónde se archiva. Sí: están los seis casilleros y los dos datos, y hay constancia para el contrato y para cada anexo. No: falta un casillero, la constancia no dice de qué versión es lo que se entregó, o solo uno de los anexos tiene constancia y el contrato no.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "Sin constancia, cualquier exigencia se cae con una frase: «eso nunca me lo dieron». En el modelo de este cliente el anexo de funciones sí trae su bloque de recepción con nombre, documento de identidad, firma y fecha —y hay que decirlo, porque es lo mejor que tiene el documento—, pero no dice de qué versión del anexo se trata; y el contrato y la declaración jurada no traen bloque de recepción de ninguna clase.",
      },
      {
        exigencia:
          "Todo lo que el contrato afirme sobre la modalidad y su causa, el régimen declarado, el periodo de prueba, el aviso de renuncia, las causales de término y las normas que cita va marcado para asesoría legal, y no se entrega como regla en vigor hasta que la respuesta vuelva por escrito.",
        como_se_comprueba:
          "Listar una por una las afirmaciones de esa clase que trae el documento: la modalidad y la causa que la sustenta, el régimen laboral y el de beneficios declarados, el periodo de prueba, el aviso de renuncia, las causales de extinción y cada norma citada por su nombre. Sí: cada una está marcada como pendiente de verificación legal, con la fecha en que se preguntó, y el ejemplar que se entrega lleva la marca a la vista. No: alguna está escrita como regla en vigor sin marca, o el documento resuelve por su cuenta el plazo, el monto o la norma que corresponde.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Una obligación legal inventada en un documento que las dos partes firmaron la paga la empresa, no la consultora, y el trabajador la cumple creyendo que es ley. En el modelo de este cliente el título ofrece dos causas a la vez —inicio o incremento de actividad— y el cuerpo desarrolla una sola, hay un régimen de beneficios declarado con su número de registro en blanco, y un periodo de prueba y un aviso de renuncia afirmados con todas sus letras. Qué corresponde en cada uno lo responde el asesor legal, no la consultora ni la Gerencia.",
      },
      {
        exigencia:
          "El contrato se entrega con un anexo de preguntas abiertas al asesor legal, cada una con la fecha en que se preguntó, quién debe responder y en qué estado está.",
        como_se_comprueba:
          "Buscar el anexo de preguntas. Sí: existe, cada pregunta trae fecha, destinatario y estado, y están al menos las que el contrato medido deja a la vista: la modalidad y su causa, el régimen de beneficios declarado, el periodo de prueba, el aviso de renuncia y la lista de faltas graves. No: no hay anexo, o hay afirmaciones de contenido legal sin pregunta, sin fecha y sin dueño.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Lo que está en duda tiene que estar en una lista con fecha y con dueño, no en la cabeza de quien redactó. Así el contrato se entrega diciendo exactamente qué falta verificar, en lugar de afirmar para que el documento parezca completo. Lo que no se puede hacer es entregarlo en silencio: el silencio se lee como que alguien ya lo revisó.",
      },
      {
        exigencia:
          "Las faltas graves y las causales de término que el contrato enumera se leen igual en el reglamento interno y en la escalera de disciplina vigentes, y ninguna aparece solo en el contrato.",
        como_se_comprueba:
          "Poner las tres listas una al lado de la otra: las faltas graves del contrato, las del reglamento interno y los niveles de la escalera de disciplina. Sí: cada conducta aparece en las tres listas, escrita con las mismas palabras y con la misma consecuencia. No: el contrato declara falta grave algo que el reglamento no menciona, el reglamento sanciona algo que el contrato no nombra, o los dos documentos le dan a la misma conducta consecuencias distintas.",
        origen: "obligacion_a_verificar",
        obligatoria: false,
        por_que:
          "Si el contrato y el reglamento le dan a la misma conducta consecuencias distintas, el trabajador se defiende con el documento que más le conviene y la empresa no puede sostener la medida. En el modelo de este cliente el contrato enumera una lista larga de faltas graves y esta empresa todavía no tiene reglamento interno escrito contra el que cotejarla: hasta que exista, cada falta de esa lista se verifica con el asesor legal antes de entregarse.",
      },
      {
        exigencia:
          "Cada obligación de conducta que el contrato le impone al trabajador está escrita como algo que se hace o que no se hace, dice desde cuándo rige y hasta cuándo sigue rigiendo después de la salida, y remite al documento donde está detallada.",
        como_se_comprueba:
          "Listar una por una las obligaciones de conducta que trae el contrato —reserva de información, trato de datos de clientes, prevención de lavado de activos, colaboración con auditorías, devolución de bienes y cierre de accesos— y mirar cada una por separado. Sí: cada una dice qué conducta se exige o se prohíbe, desde cuándo rige, hasta cuándo sigue rigiendo cuando la persona ya no trabaja ahí, y nombra con nombre exacto el documento donde está detallada. No: alguna está escrita solo con adjetivos —diligencia, lealtad, probidad—, o no dice hasta cuándo rige, o remite a un documento nombrado en genérico.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una obligación escrita con adjetivos no se cumple ni se reclama, porque nadie sabe qué había que hacer. Y una obligación sin fecha de término se discute el día de la salida, que es justo el día en que la empresa ya no tiene con qué presionar: la reserva de lo que la persona vio en caja, los bienes que tiene en la mano y los accesos que hay que cerrar. En el modelo de este cliente la confidencialidad sí dice que sigue después del término, y hay que decirlo porque es lo mejor escrito del documento; pero la diligencia, la lealtad y la probidad están puestas en una sola línea, sin un hecho al lado, y la devolución de bienes no dice contra qué papel se devuelve ni hasta qué día.",
      },
    ],
    errores_tipicos: [
      "El ejemplar se firma con casilleros abiertos: el sueldo en números y en letras, el número de registro del régimen declarado, el correo, el teléfono y la fecha de la firma quedan en blanco y alguien tiene que acordarse de llenarlos a mano.",
      "Datos de otra persona heredados de la plantilla anterior: el casillero del correo del trabajador trae pegado, dentro del enlace, el correo personal de un tercero, y se entrega así a cada nuevo ingreso.",
      "El anexo de funciones trae código, versión y fecha, y el contrato que lo encabeza no trae ninguno de los tres: el documento más importante quedó fuera del sistema documental de la casa.",
      "La fecha del anexo escrita con un separador de más, de modo que no se puede leer con certeza qué día es ni si es anterior o posterior al contrato.",
      "El título del contrato ofrece dos causas a la vez —inicio o incremento de actividad— y el cuerpo desarrolla una sola: el documento nunca dice cuál se está usando.",
      "Las funciones del puesto escritas dos veces: un párrafo corrido en el cuerpo del contrato y una tabla en el anexo, con otro conteo y otras palabras, sin que se sepa cuál obliga.",
      "Tres jefaturas inmediatas para un solo puesto, repetidas en el contrato y en el anexo, de modo que la persona no sabe a quién obedecer cuando dos le piden cosas distintas.",
      "Un código de local en el campo de modalidad que no aparece en ninguna lista de locales de la empresa, en una casa que tiene más de uno y que además autoriza mover a la persona entre ellos.",
      "El contrato obliga a cumplir el reglamento interno, las políticas de atención virtual, los protocolos de registro digital y los manuales operativos, y varios de esos documentos no existen escritos.",
      "Una sola línea de firma identificada, la del trabajador: la de la empresa es una raya sin nombre, sin documento de identidad y sin el puesto con el que firma.",
      "La declaración jurada anexa la firma solo el trabajador, y nadie por la empresa acusa recibo de ella ni queda constancia de que se entregó.",
      "El régimen de beneficios declarado en el cuerpo con su número de registro en blanco: una afirmación con consecuencia legal puesta antes de que nadie la verifique.",
    ],
    senales_de_relleno: [
      "Cláusulas que encadenan materias —laboral, tributaria, datos personales, seguridad de información— sin decir qué tiene que hacer la persona en cada una.",
      "La misma prohibición escrita en tres cláusulas con palabras distintas: reserva, confidencialidad y seguridad de información diciendo lo mismo en tres lugares.",
      "Listas de faltas graves tan largas que repiten la misma conducta partida en pedazos, y que cierran con «cualquier conducta que afecte gravemente», que no es una conducta.",
      "Cierres del tipo «conforme a la normativa aplicable», «según corresponda» o «conforme al procedimiento interno» cuando ese procedimiento no está escrito.",
      "Una cláusula de antecedentes que describe el rubro de la empresa y no obliga a ninguna de las dos partes a nada.",
      "El periodo de prueba explicado dos veces en párrafos seguidos, cada uno con su propia lista de lo que se va a evaluar.",
      "Adjetivos en lugar de conductas: diligencia, lealtad, probidad, orientación a resultados y atención al detalle en una sola línea, ninguno con un hecho al lado.",
      "Cláusulas traídas de un modelo de otro rubro: material que la casa no entrega, vehículos que no tiene, turnos rotativos que no existen.",
    ],
    que_se_conserva_casi_siempre:
      "Casi siempre se conserva el cuerpo del contrato, y hay que decirlo antes de criticar nada: el orden de las cláusulas, la de confidencialidad con su vigencia después del término, la de protección de datos personales, la de prevención de lavado de activos con la prohibición de alertar al cliente, la de colaboración con auditorías y autoridades, la de devolución de bienes y cierre de accesos, y la declaración jurada anexa. Están escritas por alguien que conoce el riesgo real de una casa que mueve efectivo, y rehacerlas desde cero es tirar lo único que ya estaba bien. También se conserva el anexo de funciones con su código, su versión y su bloque de recepción con nombre, documento de identidad y fecha, porque la casa ya tiene sistema documental y no hay que inventarlo. El trabajo normal es una versión siguiente: ponerle al contrato el código, la versión y la vigencia que ya tiene su anexo, agregar el bloque de quién elaboró, revisó y aprobó el modelo, cerrar los casilleros, sacar los datos de terceros, dejar una sola lista de funciones y una sola jefatura, poner el horario del local real con el nombre con que la empresa lo llama, cambiar los adjetivos de conducta por conductas y ponerle a cada obligación hasta cuándo rige, completar las firmas de las dos partes, agregar la constancia de entrega documento por documento, y mandar al asesor legal todo lo que afirma modalidad, régimen, plazos y causales. Lo que no se puede conservar porque no existe: los documentos internos que el contrato manda cumplir y que esta empresa todavía no tiene escritos. Eso no se da por bueno y no se inventa.",
  },

  diagnostico: {
    clave: "diagnostico",
    tipo: "Informe de diagnóstico organizacional y análisis de la organización",
    para_que_sirve:
      "Es el documento que fija el punto de partida: dice qué hay hoy en la empresa, con qué se comprobó, qué falta y en qué orden conviene atacarlo. Todo lo que se haga después —el plan, los manuales, los procesos— se mide contra él, así que si él no se puede verificar, nada de lo que venga después se puede verificar tampoco. Bien hecho, cualquiera puede volver sobre un hallazgo un año más tarde y saber de dónde salió, quién lo dijo, qué día y qué documento lo respalda; y puede volver a medir lo mismo para ver si cambió. Mal hecho es una descripción larga y casi siempre correcta que nadie puede auditar: se lee, se asiente, se archiva, y a los tres meses la pregunta «¿mejoró algo?» se contesta con opiniones. Es además el primer entregable que el cliente recibe, el que decide si va a creer que esto es trabajo serio, y el único que la consultora firma como propio.",
    para_quien_es:
      "La dueña o la gerencia lo lee entero una vez; después se usa por partes: el responsable de cada frente abre la suya, y la matriz de hallazgos con su registro de acciones es la hoja que se mira en cada revisión. Por eso: cuerpo de 25 a 40 páginas, más la hoja de hallazgos y la de acciones; y si el análisis de la organización va como documento aparte, de 8 a 12 páginas. Un informe de 50 páginas cuyos hallazgos no están en una sola hoja no se trabaja: se archiva y se cita de memoria.",
    exigencias: [
      {
        exigencia:
          "El documento declara una sola versión: el número de la portada es el mismo que repite el pie de página, y esa versión tiene su propia fila en la tabla de control de versiones.",
        como_se_comprueba:
          "Anotar la versión que dice la portada. Recorrer el pie de todas las páginas y anotar la versión que aparece ahí y cuántas veces aparece. Si los dos números no son el mismo, no cumple, y se escriben los dos con su conteo. Después buscar en la tabla de control de versiones la fila de la versión que repite el pie: si no tiene fila propia, tampoco cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Nada se inventa y nada confunde: un documento que no sabe qué versión es no se puede aprobar ni citar. En el informe de este cliente la portada dice una versión y el pie repite otra cincuenta y una veces, y la tabla de control no tiene fila para la del pie. El que lo lee no sabe si tiene delante lo que manda hoy, y el día que se le pide a la Gerencia que apruebe «la versión», nadie puede decir cuál es.",
      },
      {
        exigencia:
          "El informe lleva código propio en portada y en pie, y todo documento del proyecto que cita lo cita por código, versión y fecha.",
        como_se_comprueba:
          "Buscar el código del documento en la portada y en el pie: si no está en los dos sitios, no cumple. Recorrer después todas las citas a otros documentos del proyecto y verificar que cada una traiga código, versión y fecha. Contar las citas que dicen «el diagnóstico», «el documento base», «la fuente» o «la versión anterior» sin código: una sola, no cumple. Comprobar además que dos documentos distintos del mismo proyecto no lleven el mismo número de versión.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una cita que no se puede abrir no es una cita: es una afirmación sin respaldo. En este cliente el análisis de la organización cita «el diagnóstico» y «el documento fuente» seis veces sin nombrarlos, y los dos documentos del proyecto llevan el mismo número de versión y ninguno lleva código, así que dicho «la versión 02» no se sabe de cuál de los dos se habla. Sin código no se puede comprobar contra qué se hizo el análisis, ni si el hallazgo citado sigue vigente.",
      },
      {
        exigencia:
          "El informe cierra con bloque de firmas: quien lo elaboró, quien lo revisó por la consultora y quien lo recibe por la empresa, cada uno con nombre, puesto, documento de identidad y fecha.",
        como_se_comprueba:
          "Buscar el bloque de firmas en la primera o en la última página y contar sus líneas: tienen que estar las tres, y cada una con los cuatro campos. Si el documento solo trae «Elaborado por» con el nombre de la consultora y ninguna línea para firmar, no cumple. Si trae la de la consultora y ninguna de recepción por la empresa, tampoco. Una firma escaneada sin fecha al lado no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un diagnóstico sin firma de recepción no es un entregable: es un borrador que circula. La empresa puede decir después que nunca lo recibió, y la consultora no puede probar qué entregó ni qué día. En este cliente ninguno de los dos documentos tiene una sola línea de firma, y los dos proponen un plan de noventa días: nadie se comprometió por escrito a nada.",
      },
      {
        exigencia:
          "Todo material que esta versión quita, cambia o anula de la versión anterior está anotado en el registro de cambios, con qué se quitó, por qué y el puesto que lo autorizó.",
        como_se_comprueba:
          "Buscar en el cuerpo las frases que anulan material anterior: «se excluye», «no corresponde», «queda fuera del presente documento», «se descarta». Por cada una, buscar su fila en el registro de cambios con el qué, el por qué y el puesto que autorizó. Una sola exclusión sin fila, no cumple, y se escribe en qué página está. Si el documento no tiene registro de cambios y no es la primera versión, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Quitar lo que no corresponde está bien; quitarlo sin rastro es lo que deja el documento indefendible. En este cliente la última sección del análisis anula una contingencia tributaria que la versión anterior le atribuía a la empresa y que no era suya —corregirlo era obligatorio—, pero lo hace en un párrafo del cuerpo, sin registro de cambios y sin decir quién lo autorizó. Así el documento se corrige a sí mismo en silencio: nadie puede mostrar quién decidió, cuándo, ni con qué se comprobó, y el error vuelve a entrar en la versión siguiente.",
      },
      {
        exigencia:
          "La primera página dice a quién va dirigido el informe, quién más puede tener copia y qué revisiones no reemplaza.",
        como_se_comprueba:
          "Buscar en la primera página tres cosas: la línea que nombra al lector, la lista de puestos que pueden tener copia y la línea que dice qué no reemplaza este informe. Si el documento solo trae un sello de «confidencial» o «uso interno» sin la lista de quién puede abrirlo, no cumple. Si no dice qué no reemplaza, tampoco.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "Un sello sin lista no protege nada. En este cliente uno de los dos documentos está marcado «estratégico interno – confidencial» y no dice quién puede abrirlo; el otro no lleva ninguna marca, y es justo el que detalla un incidente de integridad del personal con la decisión disciplinaria que siguió. Los dos circulan por correo y nadie incumple ninguna regla, porque la regla no está escrita. Y sin la línea de lo que no reemplaza, el informe se usa después como si fuera una auditoría contable o un informe de seguridad y salud en el trabajo, que no es.",
      },
      {
        exigencia:
          "El índice y el cuerpo coinciden número por número y título por título, y cada subsección trata del asunto que anuncia su sección madre.",
        como_se_comprueba:
          "Poner el índice al lado del cuerpo y comparar entrada por entrada: mismo número y mismo título. Contar las entradas del índice y las secciones del cuerpo; si los conteos no coinciden, o si una sección del cuerpo no está en el índice, no cumple, y se escribe la lista de las que se caen. Después, por cada subsección, anotar el asunto que nombra su título y los asuntos que nombra el título de su sección madre: si el asunto de la subsección no está nombrado ahí, esa subsección no cumple, y se escribe su número y el de la sección de la que cuelga.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "Un documento que no se puede citar por número no se puede trabajar en reunión: nadie llega a la misma página y se discute de memoria. En este cliente el índice anuncia diecisiete secciones, el cuerpo tiene diecinueve y desde la mitad del documento todos los números están corridos; y la sección de seguridad y salud en el trabajo lleva colgadas tres subsecciones que hablan de proveedores, de contabilidad y de la estructura societaria. El índice tampoco nombra la matriz de priorización de riesgos, que sí está en el cuerpo.",
      },
      {
        exigencia:
          "Cada hallazgo dice de dónde salió: la fuente, quién lo dijo o qué documento lo contiene con su código, y la fecha.",
        como_se_comprueba:
          "Tomar los hallazgos uno por uno y buscar los tres datos al costado: de dónde salió (reunión de levantamiento, documento entregado, registro del sistema, observación en sede), quién lo dijo con su puesto o qué documento lo contiene con su código, y la fecha. Contar los hallazgos que no traen los tres. Uno solo sin fecha o sin autor, no cumple. «Según el informe base», «el levantamiento reporta» y «la fuente indica» no cuentan como fuente: no se puede volver a ellas.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Hechos y percepciones no pesan igual, y sin el origen al costado todo pesa igual. Lo que alguien dijo de memoria en una reunión sirve para pensar; para mover dinero hace falta saber qué es cada cosa. Y cuando un hallazgo resulta falso —en este cliente pasó con la contingencia tributaria que no era de la empresa— sin la fuente no se sabe qué más se cae con él, así que hay que revisar el documento entero o confiar en que lo demás está bien.",
      },
      {
        exigencia:
          "Cada hallazgo separa, con rótulo propio, el hecho observado, la lectura del diagnóstico y la acción recomendada.",
        como_se_comprueba:
          "Verificar que cada bloque de hallazgo traiga los tres rótulos separados. Después leer solo la parte del hecho observado y buscar ahí palabras de lectura: «insuficiente», «débil», «inadecuado», «requiere», «no es suficiente». Si aparecen en el hecho en lugar de en la lectura, ese bloque no cumple, y se escribe cuántos bloques de cuántos fallan.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Cuando el hecho y la opinión van en el mismo párrafo, la dueña discute la opinión y se lleva el hecho por delante: se pierde media hora defendiendo un adjetivo y el dato que importaba queda sin confirmar. Separarlos es también lo que permite que ella acepte el hecho y rechace la lectura, que es su derecho y es información para nosotros.",
      },
      {
        exigencia:
          "Lo que no se encontró se escribe como «no se evidenció», y la salvedad está dicha una vez en el alcance.",
        como_se_comprueba:
          "Buscar en el documento las frases «no existe», «no hay» y «carece de» aplicadas a un documento, un control o un registro de la empresa, y contarlas. Cada una tiene que estar reescrita como «no se evidenció» o quedar cubierta por la salvedad del alcance, que debe estar escrita con esas palabras. Después cruzar cada una de esas frases con la lista de documentos pedidos que el propio informe trae: si el informe afirma que a la empresa le falta algo y ese documento no aparece en su lista de pedidos, no cumple, y se escribe en qué página está.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Decirle a una dueña que no tiene algo que sí tiene quema el informe completo: a partir de ahí discute cada línea, y tiene razón. La diferencia entre «no existe» y «no se evidenció» es la diferencia entre acusar y medir. En este cliente la salvedad está escrita en el alcance y es de las mejores líneas de los dos documentos; se conserva tal cual.",
      },
      {
        exigencia:
          "Toda escala que el informe usa está definida en el propio informe, y ningún valor usado queda fuera de su definición.",
        como_se_comprueba:
          "Listar las escalas del documento: madurez, prioridad, probabilidad, impacto, estado de validación. Por cada una, verificar que esté definida con un nombre y una descripción por nivel. Después recorrer todas las tablas y anotar cada valor usado. Cualquier valor que no esté en la definición —un valor compuesto con guion, un «por validar», un «controlable» en la columna de probabilidad— no cumple, y se escribe cuántas veces aparece.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Una escala con valores que no existen deja de ordenar el trabajo: el orden pasa a ser el de quien lee el documento ese día. En este cliente la convención declara cuatro prioridades y las matrices usan cuatro veces una quinta compuesta que no está declarada; y la columna de probabilidad mezcla cinco cosas distintas, de las cuales dos no son probabilidades sino estados del expediente. El informe propone ordenar y no se ordena a sí mismo.",
      },
      {
        exigencia:
          "Cada dimensión evaluada recibe un solo nivel de la escala, y ese nivel trae al costado el documento o el registro con que se decidió.",
        como_se_comprueba:
          "Recorrer la tabla de madurez fila por fila y contar cuántos niveles recibe cada dimensión. Si una dimensión recibe dos a la vez —«2/3», «reactivo / repetible»— y las demás reciben uno, no cumple, y se escribe qué dimensiones son. Después leer la columna de justificación de cada fila: tiene que nombrar un documento, un registro o un control concreto. Si repite la definición del nivel —«falta formalización», «requiere criterios uniformes»— sin nombrar nada, esa fila no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una escala que se usa distinta en cada fila no se puede sumar, no se puede comparar entre sedes y no se puede volver a medir dentro de tres meses para ver si subió. En este cliente pasa de las dos formas: en el informe hay dimensiones con dos niveles a la vez mientras las demás llevan uno, y en el análisis las etiquetas —«en desarrollo», «en formalización», «transición a estandarización»— no salen de ninguna escala declarada. Y sin el hecho al costado, el nivel es una nota puesta a mano alzada: la empresa no sabe qué tiene que entregar para subir uno.",
      },
      {
        exigencia:
          "El informe parte la empresa una sola vez: la lista de frentes del resumen, las dimensiones de la madurez, los ejes de recomendación, los frentes del plan y las áreas de la matriz de hallazgos son la misma lista, con los mismos nombres.",
        como_se_comprueba:
          "Escribir en columnas todas las listas con que el documento parte la empresa y contar los nombres de cada columna. Si los conteos no coinciden, o si un nombre está en una columna y no en las otras, no cumple, y se escribe el nombre que se cae y en qué columna falta.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "En el informe de este cliente la misma empresa está partida en seis frentes en el resumen, ocho dimensiones en la madurez, siete prioridades de intervención, cinco ejes de recomendación y catorce áreas en la matriz de hallazgos, y nada dice cómo se corresponden. El que lo lee no puede seguir un frente de punta a punta —del hallazgo a la recomendación y de ahí a la acción— y en la revisión del mes cada tabla contesta por una empresa distinta.",
      },
      {
        exigencia:
          "Todo hallazgo del cuerpo tiene su código, y todo código de la matriz del anexo aparece en el cuerpo.",
        como_se_comprueba:
          "Contar los bloques de hallazgo del cuerpo. Contar las filas de la matriz de hallazgos del anexo. Buscar en el cuerpo el código de cada fila del anexo. Si los dos conteos no coinciden, o si un código del anexo no aparece ni una vez en el cuerpo, no cumple, y se escriben los dos conteos y los códigos huérfanos.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "En este cliente el cuerpo trae treinta bloques de hallazgo, la matriz del anexo catorce códigos y el registro de acciones diez acciones, y los códigos no aparecen en ninguna página del cuerpo. Dieciséis hallazgos quedaron fuera del plan sin que nadie lo decidiera, y no hay forma de saber cuáles: el cuerpo y el anexo hablan del mismo trabajo y no se pueden cruzar.",
      },
      {
        exigencia:
          "Cada acción del plan trae el puesto que responde, la fecha de calendario en que vence y la evidencia que la cierra.",
        como_se_comprueba:
          "Recorrer el plan y el registro de acciones. Por cada acción buscar los tres datos: el puesto o la persona que responde, el día y el mes de vencimiento, y la evidencia que la cierra. Un área en lugar de un puesto —«Administración», «Operaciones / Gerencia»— no cumple. Un plazo contado en días, sin la fecha desde la que se cuenta, no cumple. Se escribe cuántas acciones fallan de cuántas.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Una acción sin dueño no la hace nadie, y un plazo sin fecha de arranque no vence nunca. En este cliente todos los responsables son áreas y todos los plazos están contados en días desde un día que el documento no dice, así que al mes y medio nadie puede decir qué está atrasado. Y dos de esas áreas —operaciones y el soporte técnico— no existen como puesto en una empresa de ocho personas que todavía no tiene organigrama aprobado: la acción está asignada a nadie.",
      },
      {
        exigencia:
          "El informe deja escrita la cuenta del día del diagnóstico: cuántas personas y en qué sede cada una, qué documentos se pidieron y cuáles llegaron, y el valor de hoy de cada indicador que propone.",
        como_se_comprueba:
          "Buscar la tabla fechada del arranque. Tiene que traer el número exacto de personas con la sede de cada una, la lista de documentos pedidos marcando cuáles llegaron y cuáles no, y, por cada indicador propuesto, su valor de hoy además de su fórmula. Si el conteo de personas viene con «aproximadamente», no cumple. Si los indicadores traen fórmula y no traen valor de hoy, no cumple, y se escribe cuántos de cuántos.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un diagnóstico sin la cuenta del día uno no se puede volver a medir, y el punto de partida no se reconstruye después porque nadie se acuerda. En este cliente el único conteo de personal es «aproximadamente ocho colaboradores más gerencia», y los diez indicadores propuestos traen su fórmula y ninguno su valor de hoy: el informe propone medir y no mide, así que dentro de tres meses no habrá contra qué comparar.",
      },
      {
        exigencia:
          "Cada recomendación cierra con su medición: el número, su unidad y de dónde se lee.",
        como_se_comprueba:
          "Recorrer las recomendaciones una por una y buscar debajo de cada una la línea de medición: el número con su unidad y el registro, cuaderno o sistema de donde se lee. Contar las recomendaciones sin esa línea. «Formalizar», «fortalecer», «consolidar», «homologar» y «estandarizar» sin número debajo no cumplen.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "Lo pide el manual de identidad vigente del propio cliente, y por eso se le puede mostrar en su propia página en lugar de pedirle que confíe en una regla nuestra: sus principios cierran uno por uno con una línea «Medición: …». Una recomendación sin señal de logro no se puede cerrar nunca: queda abierta para siempre o se cierra por cansancio, y el informe termina midiendo documentos redactados en lugar de controles usados.",
      },
      {
        exigencia:
          "Donde el informe mide a las personas, mide contra las conductas escritas en el manual de identidad vigente, citándolo con su versión.",
        como_se_comprueba:
          "Buscar los hallazgos de personas: desempeño, disciplina, atención y capacitación. Cada uno tiene que apoyarse en una conducta escrita en el manual de identidad vigente, citado con su versión y su fecha. Si el hallazgo se apoya en un adjetivo —«personal comprometido», «actitud de servicio»— o en un marco de afuera que el informe no nombra, no cumple. Si el manual de identidad vigente no está a la vista, la exigencia queda abierta, no se marca cumple, y se dice así en la entrega.",
        origen: "manual_vigente",
        obligatoria: false,
        por_que:
          "Un diagnóstico que mide a la gente contra un estándar que la empresa nunca aprobó no es exigible: el dueño no puede pedirle a nadie que cambie una conducta que no está escrita en ninguna parte, y el trabajador tiene razón si dice que nunca se la pidieron. El manual de la casa ya escribió cada valor con su conducta, su contrario y su medida: el diagnóstico tiene que salir de ahí y no de un modelo de control copiado de afuera.",
      },
      {
        exigencia:
          "Todo punto de permisos, seguridad y salud en el trabajo, contratos, disciplina, separación de un trabajador o materia tributaria sale marcado para asesoría especializada, con la pregunta concreta que se le hace y el puesto que la lleva, y el informe no califica incumplimiento por su cuenta.",
        como_se_comprueba:
          "Listar los puntos del informe que tocan permisos, seguridad y salud en el trabajo, contratos, disciplina, separación de un trabajador o materia tributaria. Cada uno tiene que cerrar con la pregunta concreta que se le hace al asesor y el puesto que la lleva, y tiene que quedar fuera de la entrega hasta que vuelva la respuesta por escrito. Buscar después si el informe afirma por su cuenta que algo está incumplido, vencido o sancionable, o si fija plazos, montos o porcentajes de ley: una sola afirmación así, no cumple. También hay que verificar que el documento no atribuya a esta empresa una contingencia de otra entidad.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Un informe que declara un incumplimiento que nadie verificó le deja a la empresa un problema escrito con su propio nombre encima, y el papel lo paga ella, no la consultora. Además se desarma donde sí tiene razón: basta un punto legal equivocado para que la dueña desconfíe de los otros veintinueve. En este cliente la disciplina es ejemplar justo aquí —el informe dice expresamente que no califica sanciones porque no incorpora normativa externa, y manda verificar con especialista—, y eso es lo que hay que conservar; lo que falló fue el párrafo que atribuyó a esta empresa una deuda tributaria que era de otra entidad, y que la versión siguiente tuvo que retirar.",
      },
    ],
    errores_tipicos: [
      "La portada declara una versión y el pie de página repite otra en todas las páginas, cincuenta y una veces en un caso real, y la tabla de control de versiones no tiene fila para la del pie.",
      "Ni una línea de firma: el informe nombra en «Elaborado por» a la consultora y a un responsable, y no hay quién firme que lo elaboró, quién lo revisó ni quién lo recibió, ni fecha de recepción.",
      "Citas al documento anterior por apodo —«el diagnóstico», «el documento base», «la fuente», «la versión anterior»—, sin código, sin versión y sin fecha, en dos documentos del mismo proyecto que llevan el mismo número de versión y ninguno código propio: dicho «la versión 02» puede ser cualquiera de los dos y no se puede comprobar contra qué se trabajó.",
      "Material de la versión anterior anulado en un párrafo del cuerpo —una contingencia que no correspondía a la empresa— sin fila en el registro de cambios y sin el puesto que lo autorizó.",
      "La misma empresa partida de cinco maneras distintas en el mismo documento: frentes en el resumen, dimensiones en la madurez, prioridades de intervención, ejes de recomendación y áreas en la matriz de hallazgos, sin una tabla que las cruce.",
      "Treinta hallazgos en el cuerpo, catorce códigos en la matriz del anexo, diez acciones en el registro, y los códigos no aparecen en ninguna página del cuerpo.",
      "Una escala de prioridades declarada con cuatro valores y usada con cinco, incluido uno compuesto con guion; y una columna de probabilidad donde conviven un nivel, un estado del expediente y un juicio de manejabilidad.",
      "Una dimensión con dos niveles de madurez a la vez mientras las demás llevan uno, y justificaciones que repiten la definición del nivel en lugar de nombrar el documento que se pidió.",
      "Responsables que son áreas y no puestos —«Administración», «Operaciones / Gerencia»—, algunas de las cuales no existen en una empresa de ocho personas sin organigrama aprobado.",
      "Plazos contados en días —quince, treinta, sesenta, noventa— sin decir desde qué fecha se cuentan, de modo que ninguna acción vence nunca.",
      "Indicadores propuestos con su fórmula y sin su valor de hoy, y un conteo de personal escrito con «aproximadamente»: el informe pide medir y no deja ninguna medición hecha.",
      "El índice anuncia menos secciones que las que el cuerpo tiene y no nombra la matriz de priorización de riesgos, que sí está; y la sección de seguridad y salud en el trabajo lleva colgadas subsecciones de proveedores, de contabilidad y de la estructura societaria.",
    ],
    senales_de_relleno: [
      "Páginas que explican qué es un diagnóstico organizacional, qué es el control interno y para qué sirve documentar: eso es teoría, no hallazgo de esta empresa.",
      "Bloques de hallazgo donde la situación observada tiene una línea y la lectura tiene tres párrafos: lo que falta es el dato y lo que sobra es la explicación.",
      "Listas de riesgos posibles que servirían para cualquier empresa del rubro: «pérdida de evidencia», «decisiones apresuradas», «sobrecarga del personal experimentado».",
      "Acciones recomendadas escritas como títulos de documento sin verbo ni dueño: «protocolo de incidente», «cadena de evidencias», «carpeta anual por sede».",
      "Tablas donde la columna de cálculo repite el nombre del indicador: «tiempo promedio por servicio: minutos promedio».",
      "El mismo diagnóstico escrito dos veces en dos documentos del proyecto, uno largo y uno corto, sin que el corto cite al largo por código ni diga qué agrega.",
      "Conclusiones que podrían cerrar cualquier informe: «la empresa tiene la parte difícil hecha y le falta institucionalizar», sin un número ni un documento nombrado.",
      "Ejes de recomendación con títulos casi iguales entre sí —formalización interna y formalización estructural interna—, señal de que se partieron para llenar páginas.",
      "Secciones enteras sin una fecha, sin un puesto y sin una cifra en tres páginas seguidas.",
    ],
    que_se_conserva_casi_siempre:
      "Casi todo el contenido se conserva, y hay que decirlo antes de criticar, porque lo que falla en estos documentos es el gobierno del documento y no el trabajo. Se conserva la estructura de cada hallazgo —situación observada, lectura, riesgos, causas, acciones, evidencia esperada y puntos de validación con responsables—, que en este cliente está repetida igual en treinta bloques y es mejor que la de la mayoría de los informes que se ven; se conserva la salvedad del alcance que obliga a leer «no existe» como «no se evidenció», que es la línea que impide acusar a una empresa de no tener lo que nunca se le pidió; se conserva la tabla de estados de validación (pendiente, validado, observado, no aplica, cerrado) y la regla de cierre de que un documento redactado no equivale a un control implementado, que es exactamente el criterio de la casa; se conserva la columna de justificación al lado de cada nivel de madurez, aunque haya que llenarla con hechos; y se conserva la disciplina legal, que es la pieza mejor hecha: el informe declara que no califica sanciones ni obligaciones porque no incorpora normativa externa, y manda verificar con especialista. El trabajo normal es una versión nueva que arregla el gobierno —una sola versión, código, firmas, registro de cambios, una sola partición de la empresa, los códigos de hallazgo puestos en el cuerpo, las escalas declaradas, el responsable convertido en puesto, el plazo convertido en fecha y el indicador con su valor de hoy—, no un informe nuevo. Rehacerlo desde cero tira a la basura treinta hallazgos levantados en reuniones que ya no se van a repetir.",
  },

  formato: {
    clave: "formato",
    tipo: "Formato o anexo operativo de un procedimiento",
    para_que_sirve:
      "Es el papel que alguien llena para que el procedimiento ocurra, y el único documento del sistema que se usa todos los días. Bien hecho resuelve tres cosas que hoy cuestan dinero: que un trámite se detenga porque un campo lo tenía que llenar alguien que no sabía que era suyo; que lo que se decidió no se pueda probar después, porque el que aprobó marcó una casilla en vez de firmar; y que los datos que la empresa junta cada semana no se puedan contar, porque la misma sede se escribió de tres formas. Mal hecho es peor que no tenerlo: un formato con huecos circula igual, se firma igual y se archiva igual, y el día que hay que revisar qué pasó, el papel no dice nada.",
    para_quien_es:
      "Lo llena quien ejecuta, de pie y con alguien esperando; lo revisa quien aprueba, en treinta segundos; y lo busca quien audita, meses después. Por eso el largo es el más corto de toda la biblioteca: una página a una cara, dos caras como máximo, y si pasa de dos caras es que adentro se metió el procedimiento. Las instrucciones de llenado van al reverso o en una hoja aparte, nunca entre los campos. Un formato de cuatro caras no se llena: se deja a medias.",
    exigencias: [
      {
        exigencia:
          "El formato trae un solo código, su versión, y dice de qué procedimiento es anexo con el código y la versión de ese procedimiento.",
        como_se_comprueba:
          "Listar los códigos con que el documento se identifica a sí mismo: encabezado, pie de página y nombre del archivo. El correlativo que se le pone a cada copia llenada no entra en esta lista y se mide por separado. Si el documento se identifica con dos códigos distintos, no cumple, y se escriben los dos. Buscar después el nombre y el código del procedimiento del que este formato es anexo, con su versión. Si el formato no nombra ningún procedimiento, no cumple, aunque el prefijo de su propio código lo insinúe.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un formato suelto es un formato sin dueño. El que lo recibe reenviado en un correo no sabe qué proceso está ejecutando, ni qué versión del procedimiento manda hoy, ni a quién preguntarle. En el formato medido de este cliente el código propio está bien puesto y repetido en el pie, y en ninguna de sus ocho secciones aparece el nombre del procedimiento al que pertenece: el parentesco está solo en el prefijo del código, que nadie lee como parentesco.",
      },
      {
        exigencia:
          "Todo campo del formato tiene escrito qué puesto lo llena y en qué paso del procedimiento se llena, sea campo por campo o en la columna de su bloque.",
        como_se_comprueba:
          "Recorrer los bloques y, por cada campo, buscar dos datos: el puesto que lo llena y el paso o el momento en que se llena. Una columna al margen del bloque que nombre el puesto cubre a todos los campos de ese bloque y vale. Escribir los dos conteos: campos sin puesto y campos sin momento. Un solo campo sin puesto que lo llene, no cumple. Un bloque marcado únicamente como «uso interno» no nombra puesto y cuenta como campo sin dueño.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un campo sin dueño lo llena el que tiene prisa, o no lo llena nadie, y el formato llega a la firma con huecos que ya no se pueden cerrar sin devolver el papel. En el formato medido de este cliente, de los ocho bloques solo uno dice algo sobre quién lo usa —«uso interno»— y ninguno nombra un puesto: el rango de sueldo y el presupuesto aprobado quedan en el aire entre el área que pide y la administración.",
      },
      {
        exigencia:
          "Ningún campo pide un dato que ya vive en otro documento codificado de la empresa: se pide el código del documento, no se copia su contenido.",
        como_se_comprueba:
          "Cruzar los campos del formato contra las fichas del manual de funciones y contra los procedimientos codificados. Marcar los campos que piden funciones, perfil, formación, experiencia o competencias de un puesto que ya tiene ficha. Cada uno tiene que pedir el código y la versión de la ficha, no volver a escribir su contenido. Si el formato manda escribir de nuevo las funciones del puesto, no cumple, y se escribe qué campos duplican qué documento.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Lo que está escrito en dos documentos se corrige en uno solo. El formato medido de este cliente pide cinco funciones principales, la formación, la experiencia, los conocimientos técnicos y las competencias del puesto, y todo eso ya está en la ficha del manual de funciones: al segundo requerimiento del mismo puesto las dos versiones ya no dicen lo mismo, y el que entrevista no sabe cuál es la que manda.",
      },
      {
        exigencia:
          "El mismo dato no se pide dos veces con dos nombres: o aparece una sola vez, o el formato dice qué distingue a las dos apariciones.",
        como_se_comprueba:
          "Listar todos los nombres de campo del formato y agruparlos por el dato que piden: las fechas de la misma cosa, el canal, el responsable, el estado. Si dos o más campos piden el mismo dato y el formato no escribe qué los separa —lo previsto y lo ocurrido, lo solicitado y lo autorizado—, no cumple, y se escriben los nombres de los campos del grupo.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Dos casillas para el mismo dato se llenan distinto, y después no se puede medir nada. En el formato medido de este cliente la fecha en que se quiere al nuevo aparece como fecha objetivo de ingreso en el primer bloque, como fecha máxima de cobertura en el cuarto y como fecha objetivo en el octavo: tres nombres, tres bloques, un solo hecho. Con eso nadie puede responder si la vacante se cubrió a tiempo.",
      },
      {
        exigencia:
          "Toda opción cerrada trae su lista completa y una línea que dice qué significa marcarla, y ningún campo de texto libre ocupa el lugar de una lista que la empresa ya tiene cerrada.",
        como_se_comprueba:
          "Recorrer los grupos de casillas: cada grupo tiene que traer todas sus opciones y la línea que dice qué quiere decir marcar una. Una casilla suelta sin leyenda, no cumple. Recorrer después los campos abiertos que piden un dato que la empresa tiene cerrado —sede, área, puesto, moneda, prioridad— y que están escritos como línea en blanco o entre corchetes: cada uno no cumple, y se escribe la lista que debía estar ahí.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una casilla sin leyenda la marca cada persona por una razón distinta, y entonces el formato no recoge ningún dato: recoge la costumbre de quien lo llenó. En el formato medido de este cliente el bloque de preselección trae diez casillas sin una sola palabra que diga si marcar significa que cumple, que se verificó o que excluye. Y la sede se pide como texto libre en una empresa con tres sedes: la misma sede se escribe de tres formas y los requerimientos dejan de poder contarse por sede.",
      },
      {
        exigencia:
          "Toda opción que detiene o desvía el trámite trae al lado el campo donde se escribe el motivo y la línea que dice qué puesto hace qué a continuación.",
        como_se_comprueba:
          "Marcar las opciones que significan que algo no avanza: observado, rechazado, pendiente, cancelado, no aprobado, en espera. Para cada una buscar en el formato el campo donde se escribe el motivo y la línea que nombra el puesto que actúa después y qué hace. Una opción de detención sin motivo ni paso siguiente, no cumple, y se escribe cuál es.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un trámite detenido sin motivo escrito se queda en el escritorio de alguien y el área que pidió nunca sabe por qué no llega. En el formato medido de este cliente se puede marcar «Observado» en las tres aprobaciones y «Cancelada» en el estado de la vacante, y no hay ni una casilla para escribir qué se observó ni qué pasa después: el pedido muere en silencio y el área contrata por fuera.",
      },
      {
        exigencia:
          "Cada puesto que aprueba tiene su propia línea de firma, ningún puesto firma algo que no aprueba, y el orden de las aprobaciones está escrito.",
        como_se_comprueba:
          "Contar los puestos que el bloque de aprobación nombra y contar las líneas de firma con fecha. Si los dos conteos no coinciden, no cumple, y se escribe el par. Verificar después que esté escrito el orden: qué puesto firma primero y qué puesto no puede firmar antes que otro. Un bloque de aprobación sin orden escrito, no cumple. Una casilla de estado sin línea de firma al lado no cuenta como firma.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una casilla marcada no es la firma de nadie. En el formato medido de este cliente el bloque de aprobación nombra tres puestos que aprueban —el área que pide, la administración y la gerencia— y trae dos líneas de firma, y una de las dos es la del solicitante, que no aprueba nada: dos de los tres aprobadores marcan una casilla y nunca firman. El día que se discute quién autorizó el gasto, no hay a quién mostrarle su propia letra.",
      },
      {
        exigencia: "El formato dice dónde queda el original llenado, qué puesto lo custodia y en qué registro se anota.",
        como_se_comprueba:
          "Buscar en el formato la línea de archivo: el lugar físico o la carpeta digital exacta, el puesto que custodia y el nombre del registro o de la lista donde se anota cada formato llenado. Si esa línea no existe, no cumple. Si dice «se archiva en el file del proceso» sin nombrar puesto ni registro, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El cuarto principio del manual de identidad vigente pide que todo proceso importante tenga responsable, control y registro: un formato sin lugar de archivo es justamente el control que no queda. En el formato medido de este cliente los ocho bloques se llenan, se firman dos veces y ninguno dice dónde va el papel después, así que la única copia vive en el correo del que la mandó y se pierde cuando esa persona se va.",
      },
      {
        exigencia: "Todo correlativo que el formato manda usar dice qué puesto entrega el número y en qué registro queda anotado.",
        como_se_comprueba:
          "Buscar los campos de número, correlativo o expediente, incluidos los que vienen con su máscara escrita. Para cada uno buscar el puesto que asigna el número y el registro donde queda anotada la asignación. Un correlativo con máscara y sin puesto que lo entregue, no cumple. Si el registro que se nombra no existe todavía, el formato tiene que decirlo así y qué habría que abrir.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un correlativo sin dueño se repite. El formato medido de este cliente trae su número con la máscara del consecutivo y del año y no dice quién lo da: dos áreas que piden personal el mismo día se ponen el mismo número, y el archivo queda con dos expedientes distintos bajo un solo código. A partir de ahí no hay forma de saber cuántos pedidos hubo en el año.",
      },
      {
        exigencia:
          "Ningún campo trae ejemplos ni respuestas de muestra adentro: lo que va dentro del campo es el formato del dato que se pide.",
        como_se_comprueba:
          "Recorrer los corchetes y las líneas en blanco del formato. Lo que va adentro tiene que ser el formato del dato —día, mes y año; moneda y cifra; nombre del puesto; nombre de la sede— y no una respuesta de muestra ni una orden de redacción. Un campo que trae una lista de respuestas de muestra, no cumple. Un corchete cuyo contenido es una instrucción —«indicar las condiciones aprobadas», «según aprobación», «explicar brevemente»—, no cumple: eso va a las instrucciones de llenado, no al campo.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un ejemplo dentro del campo es la respuesta puesta en la boca del que llena, y vuelve copiada en todos los formatos. En el medido de este cliente el campo de competencias trae cinco cualidades de muestra adentro y el de condiciones trae la orden en lugar del formato: el resultado es que cada requerimiento pide lo mismo, no lo que esta vacante necesita, y el formato deja de recoger un dato para empezar a repetir el suyo.",
      },
      {
        exigencia:
          "La conducta y las competencias que el formato pide van escritas como conducta observable, con cómo se demuestra y con qué se mide, y no como adjetivos.",
        como_se_comprueba:
          "Leer el campo de competencias, conducta o perfil blando. Si las entradas son adjetivos solos —proactividad, precisión, trabajo bajo presión, ética, orientación al cliente—, no cumple. Cada entrada tiene que traer la conducta que se puede ver, con qué se mide, y encajar en una de las cuatro partes de la evaluación de la casa: resultados, comportamiento, competencia y responsabilidad.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El manual de identidad de la casa ya escribió cada valor con su conducta, su contrario y su medida, y todo formato que pida conducta tiene que salir de ahí. Un pedido de personal que pide «precisión» y «trabajo bajo presión» no le dice nada al que entrevista: la entrevista termina decidiéndose por simpatía y el formato queda como el papel que no sirvió para elegir.",
      },
      {
        exigencia: "El formato no lleva teoría: ni objetivo, ni alcance, ni base normativa, ni definiciones.",
        como_se_comprueba:
          "Contar los párrafos de prosa del formato, entendiendo por prosa todo texto corrido que no es un campo, una leyenda de opción ni una instrucción de llenado. Un objetivo, un alcance, un marco normativo o un glosario dentro del formato, no cumple: eso vive en el procedimiento del que es anexo. Tres o más líneas seguidas de prosa que no sean instrucción de llenado, no cumple, y se escribe dónde están.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "El formato se llena de pie, con alguien esperando: cada párrafo de teoría empuja los campos a la segunda cara y el que llena deja de leerlos. Y lo que está escrito en dos documentos se corrige en uno solo, así que la teoría copiada en el formato contradice al procedimiento en la primera revisión y la gente termina obedeciendo al papel que tiene en la mano.",
      },
      {
        exigencia:
          "El formato cabe en una cara, y si pasa a una segunda, cada cara repite el código, la versión y la numeración de página.",
        como_se_comprueba:
          "Contar las caras del formato impreso. Si pasa de una cara, verificar que cada cara traiga el código, la versión y la numeración de página escrita como página sobre total. Una segunda cara sin código ni numeración, no cumple. Si pasa de dos caras, se escribe qué bloques habría que mover a un anexo distinto.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "El formato medido de este cliente tiene un pie con el código y el nombre, que es más de lo que hace la mayoría, y no tiene numeración de página en ninguna parte. Cuando se imprime en dos hojas y se separan, la hoja de las firmas —la única que prueba algo— no se puede devolver a su expediente, y el trámite se repite desde el principio.",
      },
      {
        exigencia: "El formato dice qué puesto llena y qué puesto firma cuando el titular no está, y qué no puede hacer el que reemplaza.",
        como_se_comprueba:
          "Buscar en el formato o en sus instrucciones de llenado el puesto de respaldo por bloque: quién llena y quién firma si el titular no está, y qué queda fuera del reemplazo —los montos, las claves, la autorización final—. Un bloque de aprobación con un solo puesto y sin respaldo nombrado, no cumple, y se escribe cuál.",
        origen: "manual_vigente",
        obligatoria: false,
        por_que:
          "El estándar de la casa pide que ninguna operación crítica dependa de una sola persona. Un pedido de personal que solo puede firmar un puesto se detiene las dos semanas que ese puesto está de vacaciones, y el área que pidió la persona contrata por fuera, sin formato y sin aprobación, o se queda sin nadie en temporada alta.",
      },
      {
        exigencia:
          "Todo dato personal o económico que el formato recoge va marcado para asesoría legal, y el formato no fija por su cuenta qué documentos se exigen, qué modalidad de vínculo corresponde, quién ve esos datos ni cuánto se conservan.",
        como_se_comprueba:
          "Listar los campos que recogen datos de personas y de dinero: nombres y documento de identidad, motivo de la salida del trabajador anterior, rango de remuneración, centro de costo, modalidad de vínculo prevista, documentación que se pide al candidato, nombre del contratado. Cada uno debe llevar la marca de que se verifica con asesoría legal qué se puede pedir, qué puesto puede verlo y por cuánto tiempo se guarda. Si el formato afirma por su cuenta un requisito de documento, una modalidad de vínculo, un tiempo de conservación o un tope, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Un papel que circula por tres escritorios con el sueldo de un puesto y el motivo de salida de una persona con nombre adentro es un problema que paga la empresa, no la consultora. El formato medido de este cliente pide las dos cosas y además la documentación básica del candidato, y en ninguna línea dice quién puede ver ese papel ni hasta cuándo se guarda: eso se verifica con el asesor legal antes de repartirlo, y hasta que vuelva la respuesta por escrito esos campos salen de la entrega.",
      },
    ],
    errores_tipicos: [
      "Ningún bloque dice qué puesto lo llena: el formato llega a la firma con el rango de sueldo y el presupuesto en blanco porque el área que pide creía que eso lo ponía administración, y administración creía lo contrario.",
      "El bloque de aprobación nombra tres puestos que aprueban y trae dos líneas de firma, y una de las dos es la del solicitante, que no aprueba nada: dos aprobadores marcan casilla y nunca firman.",
      "Casillas sin leyenda: diez casillas de preselección sin una palabra que diga si marcar significa que cumple, que se verificó o que excluye al candidato.",
      "El mismo hecho con tres nombres en tres bloques: fecha objetivo de ingreso, fecha máxima de cobertura y fecha objetivo, todas para el día en que se quiere al nuevo.",
      "El formato pide escribir otra vez las funciones, la formación y la experiencia del puesto, que ya están en su ficha del manual de funciones, y al segundo pedido las dos versiones ya no dicen lo mismo.",
      "La sede, el área y el cargo pedidos como texto libre en una empresa con tres sedes: la misma sede se escribe de tres formas y los pedidos dejan de poder contarse por sede.",
      "Un correlativo con su máscara impresa y sin decir quién entrega el número: dos áreas que piden el mismo día se ponen el mismo código.",
      "Ejemplos de respuesta impresos dentro del campo de competencias, que vuelven copiados en todos los formatos y tapan lo que esta vacante necesitaba.",
      "Campos cuyo contenido entre corchetes es una orden y no un formato: «según aprobación», «indicar las condiciones aprobadas», «explicar brevemente».",
      "Una lista de funciones con exactamente cinco casillas numeradas, que obliga a cortar lo que sobra o a inventar lo que falta para llenar las cinco.",
      "Casillas de «Observado» y «Cancelada» sin campo para el motivo ni línea que diga qué puesto actúa después.",
      "Ni una línea sobre dónde queda el papel firmado, qué puesto lo custodia y en qué registro se anota: la única copia vive en el correo del que la mandó.",
    ],
    senales_de_relleno: [
      "Bloques que crecen hasta ocho secciones numeradas cuando el trámite tiene dos decisiones reales: lo que sobra son casillas que nadie mira al aprobar.",
      "Filas de «Otro: ____» repetidas en varios bloques, y hasta dos veces en el mismo bloque, que son el campo cerrado que nadie se atrevió a cerrar.",
      "Campos que piden lo mismo con otras palabras en bloques distintos, para que cada área sienta que tiene su propia casilla.",
      "Un bloque marcado «uso interno» que recoge por segunda vez datos que ya están arriba, llenados por alguien que no se nombra.",
      "Casillas de verificación en batería, simétricas y en columnas de cinco por lado, sin que ninguna diga qué pasa si queda sin marcar.",
      "Campos de texto libre largos —justificación, observaciones, observaciones de filtro— donde el procedimiento ya tiene una lista de causas cerrada.",
      "Un pie de página que gasta su línea en la razón social y en el nombre del formato y no trae la numeración de página, que es lo único que ahí hace falta.",
      "Marcas de plantilla sin reemplazar: corchetes, guiones bajos y máscaras de fecha que siguen ahí en el formato ya llenado y archivado.",
    ],
    que_se_conserva_casi_siempre:
      "Casi siempre se conserva el esqueleto, y hay que decirlo antes de criticar: el código del formato con su versión y su fecha de validación, que es lo que permite saber qué papel se está llenando; el pie de página con la razón social, el nombre del formato y el código repetido; el orden de los bloques, que suele seguir el camino real del trámite —quién pide, por qué, qué perfil, con qué condiciones, por qué ruta, con qué filtro, quién aprueba, cómo cerró—; las máscaras de fecha escritas como día, mes y año; y el bloque de cierre que anota cómo terminó el caso, que es la única fuente de los números del proceso y casi nadie lo pone. Eso no se rehace. El trabajo normal es la versión siguiente del mismo formato: agregarle la columna de quién llena cada bloque y en qué paso, poner una línea de firma por cada puesto que aprueba y sacar la del que no aprueba, poner leyenda a cada grupo de casillas, cerrar en lista los campos que la empresa ya tiene cerrados, fusionar las fechas repetidas en una sola, reemplazar los datos copiados del manual de funciones por el código de la ficha, y agregar la línea de archivo. Son horas de trabajo sobre lo que ya hay. Rehacer el formato desde cero es lo que hace que la gente siga usando la copia vieja que tiene impresa en el cajón.",
  },

  identidad: {
    clave: "identidad",
    tipo: "Manual de Identidad Estratégica y Cultura Organizacional",
    para_que_sirve:
      "Es el documento que dice quién es la empresa, qué conducta espera de cada persona y qué no va a tolerar nunca. Bien hecho resuelve tres cosas que hoy cuestan dinero: que el dueño tenga que explicar en persona, una por una, cómo se hacen las cosas aquí; que el jefe califique por simpatía porque lo único escrito son adjetivos; y que una falta grave se discuta de cero cada vez porque nadie dejó escrito qué es un error y qué es ignorar un control a propósito. También es la raíz de todo lo demás: el manual de funciones, la selección, el reglamento y la evaluación se escriben contra él, así que un valor que no baja a conducta medible deja cuatro documentos sin fundamento. Y es la única pieza que permite abrir una sede nueva sin que la empresa se parta en dos formas de trabajar.",
    para_quien_es:
      "Lo aprueba y lo firma la Gerencia, lo lee entero quien administra el personal, y lo recibe y firma cada trabajador el día que entra. Por eso: cuerpo de 12 a 20 páginas, nunca más de 25; una sola cara con los valores, su conducta y su contrario, para pegar donde la gente la vea; y el tablero de mediciones como anexo aparte, porque ese se actualiza y el cuerpo no. Un manual de identidad de 40 páginas no se le lee a nadie el primer día, y lo que no se lee el primer día no se exige nunca.",
    exigencias: [
      {
        exigencia:
          "El documento cierra con bloque de firmas: quién lo elaboró, quién lo revisó y quién lo aprobó, cada uno con nombre, puesto y fecha; y dice desde qué día rige y en qué mes se vuelve a revisar.",
        como_se_comprueba:
          "Buscar en el documento las tres casillas de firma y, en cada una, los tres campos: nombre, puesto y fecha. Una casilla sin alguno de los tres no cumple. Una casilla dibujada y en blanco no cumple, y se escribe cuál. Después buscar la fecha de vigencia y la fecha de la próxima revisión. Si la portada trae una fecha sola sin decir cuál de los tres hechos ocurrió ese día —elaborado, revisado o aprobado—, tampoco cumple, porque una fecha que no dice de qué es no hace exigible nada.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un manual de identidad sin firma no es un acuerdo: es la opinión de quien lo escribió. El día que la empresa le reclame a alguien por una conducta que este documento declara, el trabajador puede preguntar quién decidió eso y cuándo, y no hay respuesta. El manual vigente de este cliente está en uso y no tiene ni una firma: ni elaborado, ni revisado, ni aprobado, ni fecha de vigencia.",
      },
      {
        exigencia:
          "El documento declara un solo horizonte: el año que cierra la portada es el mismo año que cierra la visión y el mismo contra el que se escriben las metas del cuerpo.",
        como_se_comprueba:
          "Listar todos los años y rangos de años que el documento escribe: el de la portada, el del título de la visión, los de las metas y los de cualquier etapa. Compararlos. Si dos de ellos cierran en años distintos, no cumple, y se escriben los dos años con la página donde aparece cada uno. Si el documento trae dos horizontes a propósito —uno de cultura y otro de negocio—, cada uno tiene que decir a qué se aplica y los dos tienen que estar en la portada.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Dos horizontes en un mismo documento es la forma más barata de que nadie se sienta medido: cada uno elige el año que le conviene. Y la visión deja de ser una meta, porque el documento que la contiene ya se declaró vencido antes. En el manual vigente de este cliente la portada cierra el horizonte dos años antes que la visión del cuerpo, y las dos cosas están escritas en el mismo archivo.",
      },
      {
        exigencia:
          "Lo que la empresa ya es está escrito en presente; lo que todavía no existe va en una lista aparte, cada línea con su fecha y el puesto que responde.",
        como_se_comprueba:
          "Buscar los verbos en futuro y las fórmulas de intención: «tendrá», «será», «deberá», «se medirá», «contará con», «progresivamente», «cuando sea implementado», «buscamos construir». Para cada hallazgo, verificar si el documento declara esa cosa como vigente en otra parte. Si la declara vigente y la escribe en futuro, no cumple. Si de verdad todavía no existe, tiene que estar en la lista de lo pendiente con fecha y puesto responsable, y si no lo está, tampoco cumple. Se escribe la cuenta de frases en futuro y cuántas tienen fecha y dueño.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un documento vigente escrito en futuro no se puede exigir ni se puede incumplir: siempre falta para que empiece. El manual vigente de este cliente dice que la empresa «tendrá seis valores» y acto seguido los enumera y los declara en uso, así que el trabajador puede alegar con razón que todavía no entraron en vigor. Mezclar lo que hay con lo que se quiere es también la manera de que nunca se note qué falta.",
      },
      {
        exigencia:
          "Cada valor, cada principio de conducta y cada estándar de atención trae tres cosas: la conducta que se ve cuando se cumple, la conducta que lo contradice y con qué se mide.",
        como_se_comprueba:
          "Recorrer valor por valor, principio por principio y estándar por estándar, y marcar en una tabla de tres columnas qué tiene cada uno. Una entrada que solo trae la frase bonita y la lista de lo que se hace, sin la lista de lo que nunca es aceptable, no cumple. Una entrada que es un adjetivo solo —«precisión», «orden», «iniciativa»— no cumple. Se escribe la cuenta: cuántos valores, cuántos con conducta visible, cuántos con su contrario y cuántos con medición.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El propio manual de este cliente ya resolvió esto en uno de sus valores, escribiendo qué se hace y qué nunca será aceptable, y es la parte mejor hecha del documento. El problema es que de sus seis valores solo ese trae la lista de lo contrario, y otro la reemplaza por una frase suelta. Sin la conducta contraria escrita, el día que hay que corregir a alguien la discusión es si eso estuvo mal o no, y gana quien habla más fuerte. El mismo hueco se repite en el tipo de persona que la empresa dice buscar: ocho características y ninguna con la conducta que la niega.",
      },
      {
        exigencia:
          "Cada renglón de medición nombra el registro, la pantalla o el informe de donde sale el número, cada cuánto se lee y el puesto que lo lee.",
        como_se_comprueba:
          "Tomar una por una todas las listas que siguen a «¿Cómo se medirá?» y a «Medición:», y todos los renglones del cuadro de medición si existe. Para cada renglón verificar los tres datos. Un renglón que solo escribe el nombre del concepto —«Reclamos», «Puntualidad», «Auditorías», «Satisfacción del cliente»— no cumple. Un renglón que dice «en el sistema» o «en el Excel» sin decir cuál ni qué pantalla, tampoco. Se escribe la cuenta final: cuántos renglones de medición tiene el documento y cuántos de ellos nombran su fuente, su frecuencia y su lector.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "Es la mejor costumbre del manual vigente de este cliente y a la vez su hueco más grande: se compromete veintiséis veces a medir algo y ni una sola vez dice de dónde sale el número. Un compromiso de medición sin fuente no se puede cumplir ni se puede auditar, así que a los tres meses nadie puede responder si la cultura mejoró o empeoró. El documento mismo escribe que si no se puede medir no se puede gestionar: esta exigencia es la que hace que esa frase sea verdad.",
      },
      {
        exigencia:
          "Cada renglón de medición trae su valor de hoy con la fecha en que se tomó, o la frase de que hoy eso no se mide y qué registro habría que abrir.",
        como_se_comprueba:
          "Recorrer los renglones de medición y buscar en cada uno el valor de hoy con su fecha. Un renglón con meta y sin valor de hoy no cumple. Un valor redondo y limpio sin fecha de toma no cumple, porque se escribió sin mirarlo. El renglón que todavía no tiene número tiene que decirlo con esas palabras —hoy esto no se mide— y nombrar el registro que habría que abrir; si no lo dice, no cumple. Confesar el hueco sí cumple: rellenarlo con un número que nadie midió, no.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Sin el valor de hoy no existe la pregunta «¿funcionó?»: dentro de tres meses hay un número y nada contra qué compararlo, y cada uno concluye lo que quiere. Un número inventado es peor que ninguno, porque alguien va a decidir contra él. Y decir «esto todavía no se mide» es información útil para la empresa: es la lista de los registros que hay que abrir antes de prometer una medición.",
      },
      {
        exigencia:
          "Los conteos que el documento declara coinciden con los renglones que lista, y ningún renglón de una lista quedó pegado al renglón anterior.",
        como_se_comprueba:
          "Buscar cada vez que el documento anuncia una cantidad —«seis valores», «ocho principios», «ocho características», «diez compromisos», «cinco dimensiones»— y contar los renglones que siguen. Una diferencia, no cumple, y se escribe el conteo declarado y el conteo real. Después revisar el final de cada renglón: si una línea contiene dos entradas de la lista unidas en el mismo párrafo, esa lista no cumple y se escribe en qué renglón se perdió el corte.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "Un documento que no sabe contar lo propio pierde autoridad en todo lo demás: el trabajador que encuentra siete cosas donde el título anunció ocho deja de leer con atención. En el manual vigente de este cliente varias entradas quedaron pegadas al renglón anterior al pasar el archivo, y una de ellas es justamente la conducta más grave de la lista: saltarse un control a propósito, escondida al final de la línea de arriba.",
      },
      {
        exigencia:
          "Cada pilar de la identidad está escrito con su mismo nombre en al menos un valor, un principio o una característica del documento, y esa entrada trae su propia medición.",
        como_se_comprueba:
          "Escribir los pilares en una columna y en la otra los nombres de los valores, de los principios y de las características que la empresa pide a sus personas. Buscar cada nombre de pilar, con esa misma palabra, en la segunda columna. El pilar que no aparece con su nombre en ninguna entrada no cumple, y se escribe el pilar y la página donde el documento lo declara. Donde sí aparece, verificar que esa entrada traiga su renglón de medición; una entrada sin medición tampoco cumple. Se escribe la cuenta: cuántos pilares tiene el documento, cuántos aparecen con su nombre en una entrada y cuántos de esos están medidos.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "Un pilar que no baja a ninguna conducta es un cartel en la pared: se repite en la portada y en la última página y nadie puede incumplirlo. En el manual vigente de este cliente uno de los tres pilares no es ninguno de los seis valores ni ninguna de las características que la empresa pide a su gente, y el que quiera exigirlo tiene que irlo a buscar a otra sección del documento.",
      },
      {
        exigencia:
          "Ninguna remisión a otro documento queda sin nombre: cada una lo nombra con su código y su versión, o dice que ese documento todavía no existe.",
        como_se_comprueba:
          "Buscar las remisiones del documento: «el PDF», «el diagnóstico», «las políticas internas», «el procedimiento correspondiente», «el protocolo de atención», «el código de conducta», «la legislación aplicable». Para cada una verificar que el documento quede nombrado con su código y su versión, o que el texto diga que no existe todavía y entre en la lista de lo pendiente. Una remisión a un documento sin nombre no cumple, y se escribe la frase tal como está y la página.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Una remisión a un documento sin nombre no es exigible y no se puede verificar: el trabajador no sabe qué leer y el jefe no sabe qué aplicar. En el manual vigente de este cliente la respuesta a la conducta más grave —ignorar un control a propósito— queda en «las medidas correspondientes conforme a las políticas internas», y esas políticas internas no están escritas en ninguna parte del expediente. Es decir: la falta más grave del documento no tiene consecuencia escrita.",
      },
      {
        exigencia:
          "Nada de lo que la identidad exige contradice el reglamento interno ni el manual de funciones vigentes, y donde uno de esos documentos no existe, el documento lo dice.",
        como_se_comprueba:
          "Poner al costado el reglamento interno y el manual de funciones vigentes, y cruzar tres cosas. Primera: cada conducta que la identidad declara inaceptable, contra la lista de faltas del reglamento; una conducta que la identidad prohíbe y el reglamento no nombra se anota. Segunda: el modelo de evaluación que la identidad declara, contra lo que el manual de funciones dice que se evalúa en cada puesto. Tercera: cada vez que la identidad le pide al trabajador decidir o resolver por su cuenta, contra los montos y topes escritos en el manual de funciones. Una contradicción, no cumple, y se escribe qué dice cada documento. Si uno de los dos no existe, se escribe así y la contradicción queda pendiente, no resuelta.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Dos documentos de la misma empresa que le piden cosas distintas a la misma persona se anulan entre los dos: el trabajador aprende que los documentos de la casa se pueden ignorar. El caso de este cliente es exacto: la identidad le pide al trabajador «resolver dentro de su autoridad» y el manual de funciones de la misma empresa no trae un solo monto escrito, así que esa autoridad no existe en ningún papel y cada decisión vuelve al dueño.",
      },
      {
        exigencia:
          "Cada sistema con el que el documento dice que la identidad se conecta lleva el documento que se va a escribir, el puesto que responde por él y la fecha.",
        como_se_comprueba:
          "Tomar TODOS los sistemas con los que el documento dice que la identidad debe conectarse, no solo los primeros: entre ellos el organigrama, el manual de funciones, los perfiles, la selección, la inducción, la matriz de habilidades, la evaluación, los protocolos, los controles, los indicadores, la disciplina y la capacitación. Armar una fila por cada uno con tres columnas: documento, puesto responsable y fecha. Una fila sin puesto o sin fecha no cumple. Se escribe la cuenta: cuántos sistemas nombra el documento y cuántos tienen dueño y fecha.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El propio manual de este cliente pide que la identidad baje al organigrama, al manual de funciones, a los perfiles, a la selección y a trece sistemas más: es un pedido escrito, no una sugerencia nuestra. Pero los nombra todos en una sola oración, sin un dueño y sin una fecha, y así la bajada no ocurre nunca y el manual se queda en la carpeta. Diecisiete compromisos sin responsable son cero compromisos.",
      },
      {
        exigencia:
          "La diferencia entre error, negligencia e incumplimiento deliberado dice, para cada uno, qué puesto clasifica el hecho, dónde queda escrita la clasificación y qué documento fija la respuesta.",
        como_se_comprueba:
          "Buscar las tres definiciones. Para cada una verificar los tres datos: el puesto que clasifica, el registro donde queda la clasificación con su fecha, y el documento nombrado que fija qué se hace después. Si la respuesta a una de las tres remite a un documento sin nombre o a una frase general, no cumple. Si el documento fija por su cuenta la consecuencia de la conducta más grave sin remitir a asesoría legal, tampoco cumple, y se escribe la frase tal como está.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "Es la pieza más valiosa del manual vigente de este cliente: distinguir el error de la negligencia y del incumplimiento deliberado es lo que evita castigar a quien se equivocó de buena fe y tolerar a quien ignoró un control a propósito. Pero una clasificación que nadie firma y que no queda anotada no se puede aplicar: la segunda vez que pasa lo mismo, nadie puede probar que ya había pasado, y la empresa termina tratando las dos cosas igual.",
      },
      {
        exigencia:
          "Las dimensiones de la evaluación de personas traen cada una su evidencia nombrada, su escala y el puesto que evalúa.",
        como_se_comprueba:
          "Buscar el modelo de evaluación y recorrer sus dimensiones una por una. Cada una tiene que traer de qué registro sale la evidencia, con qué escala se puntúa y qué puesto pone el puntaje. Una dimensión que es una palabra sola —resultados, comportamiento, competencia, responsabilidad— no cumple. Las preguntas que el documento le propone al trabajador hacerse a sí mismo no cuentan como evaluación: si son lo único que hay, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El manual vigente de este cliente escribe la regla correcta —la evaluación no debe depender únicamente de la opinión del jefe y debe usar evidencias— y después no entrega ninguna evidencia, ninguna escala y ningún evaluador. Así la regla se incumple sola: el jefe califica por simpatía porque no se le dio otra cosa. Y como el manual de funciones y la selección se escriben contra estas dimensiones, un modelo sin escala deja esos dos documentos sin con qué evaluar a nadie.",
      },
      {
        exigencia:
          "Todo adjetivo que el documento usa para describirse a sí mismo trae al lado el número con que se sabrá si se cumplió, o va marcado como aspiración.",
        como_se_comprueba:
          "Recorrer las listas de adjetivos sobre la propia empresa —rentable, ordenada, segura, confiable, humana, escalable, referente, reconocida— y buscar al lado de cada uno el número con que se comprueba o la palabra que lo marca como aspiración. Un adjetivo suelto dentro de una lista titulada como compromiso no cumple, porque un compromiso sin medida no se puede incumplir. Se escribe la cuenta de adjetivos y cuántos están medidos o marcados.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "Una lista de adjetivos presentada como compromiso de la empresa es exactamente lo que el documento le prohíbe al trabajador: palabras bonitas sin conducta ni medición. Si el documento se exige a sí mismo menos de lo que exige a la gente, la gente lo nota el primer día y el documento pierde fuerza completo.",
      },
      {
        exigencia:
          "El documento trae su constancia de entrega y lectura: nombre, documento de identidad, fecha, firma del trabajador y el puesto que se lo explicó.",
        como_se_comprueba:
          "Buscar el anexo de constancia y sus cinco campos. Si no existe, no cumple. Si existe y no dice qué puesto explica el documento, no cumple. Si existe y no distingue la fecha de entrega de la fecha en que se explicó, no cumple. Verificar además que el documento diga en qué momento se entrega —el día que la persona entra, o el día que se aprueba una versión nueva— y qué pasa con quien ya estaba en la empresa antes de esta versión.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "El manual vigente de este cliente dice de sí mismo, en su primera página, que no fue creado para guardarse en una computadora ni para colgarse en una pared, y no trae constancia de que una sola persona lo haya leído. Sin firma de recepción el trabajador siempre puede decir que no lo conocía, y la conducta que el documento declara deja de ser exigible. Un documento de cultura que nadie firmó es una carpeta, no una cultura.",
      },
      {
        exigencia:
          "Todo lo que el documento anuncie sobre la persona del trabajador va marcado para asesoría legal y sale de la entrega hasta que vuelva la respuesta por escrito.",
        como_se_comprueba:
          "Buscar y listar: la observación del trabajador sin aviso previo, incluida la figura del cliente incógnito y la auditoría de conducta; la evaluación de desempeño que afecte el sueldo, el puesto o la permanencia; el registro de incidencias de conducta en un legajo personal; el tratamiento y la conservación de los datos personales del trabajador y de sus evaluaciones; y toda consecuencia disciplinaria que el documento anuncie. Cada hallazgo debe llevar la marca de que se verifica con asesoría legal. Si el documento fija por su cuenta la consecuencia, el plazo o el monto, no cumple; y si remite a la legislación aplicable sin nombrar quién la revisó, tampoco.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Un manual de cultura firmado por el trabajador es un documento que la empresa puede usar y que al trabajador se le puede oponer, así que lo que diga sobre observarlo, evaluarlo y sancionarlo hay que verificarlo antes y no después. El manual vigente de este cliente anuncia cliente incógnito, auditorías de conducta y medidas disciplinarias conforme a la legislación aplicable, sin que nadie haya revisado ni una de las tres. Una cláusula inventada en un documento firmado la paga la empresa, no la consultora.",
      },
    ],
    errores_tipicos: [
      "El documento está vigente y no tiene una sola firma: ni elaborado, ni revisado, ni aprobado, y la fecha de la portada no dice cuál de los tres hechos ocurrió ese día.",
      "La portada declara un horizonte que cierra antes que la visión del cuerpo, y las dos cosas conviven en el mismo archivo sin que nadie lo note.",
      "Todo el documento está escrito en futuro —«tendrá», «deberá», «progresivamente»— estando vigente, así que siempre falta para que empiece a exigirse.",
      "Veintiséis compromisos de medición y ni uno dice de dónde sale el número: los renglones son el nombre del concepto, «Reclamos», «Puntualidad», «Auditorías».",
      "Ninguna medición trae el valor de hoy, así que dentro de tres meses hay número y no hay con qué compararlo.",
      "De seis valores, uno solo trae la lista de lo que nunca es aceptable; los otros cinco solo dicen lo que sí se hace, y corregir a alguien vuelve a ser una discusión.",
      "Remisiones a documentos sin nombre: «el PDF», «el diagnóstico», «las políticas internas». La consecuencia de la falta más grave queda en una de ellas.",
      "La identidad le pide al trabajador resolver dentro de su autoridad y el manual de funciones de la misma empresa no trae un solo monto escrito.",
      "Diecisiete sistemas con los que la identidad «deberá conectarse», nombrados en una sola oración, sin un dueño y sin una fecha.",
      "El modelo de evaluación prohíbe depender de la opinión del jefe y después no entrega ni evidencia, ni escala, ni evaluador: queda la opinión del jefe.",
      "Un pilar de la portada que no es ninguno de los valores ni ninguna de las características que la empresa pide a su gente.",
      "El documento declara que no fue hecho para guardarse y no trae constancia de que una sola persona lo haya leído ni firmado.",
    ],
    senales_de_relleno: [
      "Listas de adjetivos sobre la propia empresa presentadas como compromisos: rentable, ordenada, segura, confiable, humana, escalable. Ninguno se puede incumplir.",
      "Frases que se repiten en la portada, en el medio y en la última página como lema, y que no aparecen en ninguna conducta ni en ninguna medición.",
      "Secciones que explican qué es la cultura y por qué importa, en lugar de decir qué hace la gente el lunes y con qué se le mide.",
      "Preguntas que el documento le propone al trabajador hacerse a sí mismo, de respuesta sí o no, puestas en el lugar donde debería ir la evaluación.",
      "Valores que se diferencian solo en una palabra: disciplina y responsabilidad con la misma lista de conductas debajo.",
      "Flechas, cadenas y fórmulas con signos de suma que ordenan palabras sin decir quién hace qué: la figura reemplaza al dueño y a la fecha.",
      "Mediciones que son el nombre de un informe que la empresa no tiene: auditorías, cliente incógnito, evaluación de clima.",
      "Más páginas de declaración que renglones de medición: si el documento declara treinta cosas y mide tres, el resto es decoración.",
    ],
    que_se_conserva_casi_siempre:
      "Casi siempre se conserva más de lo que parece, y hay que decirlo antes de criticar. Lo primero, el compromiso de medición: cuando el documento del cliente escribe debajo de cada valor y de cada estándar cómo se medirá, eso no se toca ni se recorta, se baja a renglón con su fuente, su frecuencia y su valor de hoy. Lo segundo, la estructura: quiénes somos, hacia dónde vamos, en qué creemos, cómo nos comportamos, qué tipo de personas somos, cómo debe ser la experiencia del cliente, cómo lideramos, cómo tratamos los errores, cómo hacemos las cosas. Ese orden funciona y no se cambia. Lo tercero, y es lo más valioso que suele traer este documento: la distinción entre error, negligencia e incumplimiento deliberado, con su respuesta distinta para cada uno. Esa idea es difícil de tener y fácil de perder en una reescritura; se le agrega quién clasifica y dónde queda anotado, y queda. También se conservan el código de conducta en dos columnas —lo que sí y lo que no—, los valores que ya traen su conducta y su contrario escritos, y la versión del documento, porque ya hay un sistema documental y no hay que inventarlo. El trabajo normal es la versión siguiente: firmarlo, fecharlo, pasarlo a presente, abrir el tablero de mediciones, nombrar las remisiones y poner dueño y fecha a la bajada. Rehacer la identidad desde cero es lo peor que se le puede hacer a una empresa que ya se puso de acuerdo en quién es.",
  },

  instructivo: {
    clave: "instructivo",
    tipo: "Instructivo o guía operativa de un puesto",
    para_que_sirve:
      "Es el documento con el que la persona que ocupa un puesto hace el trabajo sin preguntarle a nadie, el día que la que sabe no vino. Resuelve tres cosas que hoy cuestan dinero: que el conocimiento del puesto más caro de la empresa viva en la cabeza de una sola persona y se vaya con ella; que alguien nuevo tarde meses en producir porque aprende mirando; y que la misma operación se haga distinto en cada sede porque cada una aprendió de otra persona. Es la pieza de abajo de la pila: el manual de funciones dice de qué responde el puesto, el manual de procesos dice cómo el trabajo pasa de un puesto a otro, y el instructivo dice qué pantalla se abre, qué dato se escribe y qué se hace cuando el sistema se cae. Es además el único documento del expediente que no escribió la consultora ni la gerencia, sino la persona que ejecuta: eso lo hace el material más valioso y el más desordenado de todos.",
    para_quien_es:
      "Lo lee y lo firma la persona que ocupa el puesto, muchas veces de pie y con un cliente adelante; lo aprueba quien la supervisa; y lo abre quien la reemplaza el día que falta. Por eso: cuerpo de seis a doce páginas por puesto, más una hoja de pared de una sola cara por cada procedimiento que se hace a diario. Si pasa de veinte páginas ya no es un instructivo, es un manual y hay que partirlo por procedimiento. Y si no llega a dos páginas tampoco es un instructivo: es un apunte, y el puesto sigue viviendo en la cabeza de una persona. En este cliente el puesto que autoriza transferencias bancarias de varias empresas tiene dos páginas, y el que atiende la ventanilla tiene treinta.",
    exigencias: [
      {
        exigencia: "El instructivo es de un solo puesto y de una sola sede, nombrados en el encabezado con el mismo nombre que trae el organigrama.",
        como_se_comprueba:
          "Leer el encabezado: tiene que nombrar un puesto y la sede donde ese puesto trabaja. Después recorrer los procedimientos y marcar los que pertenecen a otro puesto: son los que ordenan supervisar, orientar, recuadrar o ayudar a otro trabajador, y los que usan una llave, una clave o una aprobación que el encabezado no le dio a este puesto. Un solo procedimiento de otro puesto, no cumple, y se escribe el nombre del puesto que se metió adentro. Si el nombre del puesto no es el mismo que trae el organigrama, tampoco cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un instructivo de dos puestos no se le puede entregar a ninguno de los dos: el que lo recibe no sabe qué parte le toca y asume la que le conviene. En este cliente el documento se titula obligaciones del cajero de ventanilla y a media página ya está ordenando el cuadre de la caja principal, ayudar a los cajeros que no cuadran y orientar a los que entran: tres trabajos de otro puesto dentro del mismo texto. Y el nombre tiene que ser el del organigrama porque si no, el instructivo no se puede cruzar con la ficha del puesto ni con la planilla.",
      },
      {
        exigencia: "Cada función del puesto tiene su procedimiento en el instructivo, o una línea que dice en qué otro documento está y con qué nombre.",
        como_se_comprueba:
          "Hacer dos columnas. A la izquierda, las funciones de ese puesto tal como las trae su ficha del manual de funciones; si no hay ficha, las que la propia persona dictó. A la derecha, los procedimientos escritos en el instructivo. Cruzarlas: cada función tiene que tener su procedimiento, o la línea que dice en qué documento está. Se escribe el par de conteos al costado del puesto —«catorce funciones, nueve procedimientos»— y la lista de las que quedaron sin ninguna de las dos cosas. Una sola función sin procedimiento y sin remisión, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un instructivo incompleto es peor que ninguno, porque el que lo lee cree que ya está todo y lo que falta lo improvisa. Y el hueco nunca cae en lo fácil: cae justo en lo que nadie quiso escribir. En este cliente el puesto que mueve las transferencias bancarias de cinco empresas tiene dos páginas de instructivo, donde solo están escritos los pasos del token y la frase de que el personal rellena un Excel; el dinero sale de la empresa en ese puesto y no vuelve, y es el que menos texto tiene de los tres.",
      },
      {
        exigencia: "Cada procedimiento abre con el hecho observable que lo dispara y cierra con el hecho observable que lo termina.",
        como_se_comprueba:
          "Tomar la primera y la última línea de cada procedimiento. Las dos tienen que ser hechos que alguien de afuera puede ver o leer sin preguntarle a nadie: «el cliente pone sus dólares en la ventanilla», «el reloj marca la hora de cierre», «la foto de la pizarra está enviada al grupo». No cumple si el inicio es el título del procedimiento o una intención, ni si el final es un estado como «queda todo en orden», ni si entre el último paso de un procedimiento y el primero del siguiente no hay corte visible —un título, una numeración que vuelve a empezar o una línea de cierre—, porque entonces no se puede decir dónde termina uno y dónde empieza el otro.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Sin el hecho de inicio y el de fin, dos personas creen que el procedimiento es otra cosa y el trabajo se cae exactamente en el borde: cada una pensó que lo último lo hacía la otra. En los tres documentos de este cliente no hay un solo procedimiento con límites: el de caja arranca con la foto de asistencia al grupo de WhatsApp y acaba barriendo el piso, todo seguido y sin cortes, como si la jornada entera fuera una sola tarea. Así no se puede enseñar, ni medir, ni pedirle cuentas a nadie.",
      },
      {
        exigencia: "Los pasos van numerados, en imperativo y uno por línea, y ningún paso junta dos acciones que ocurren en momentos distintos.",
        como_se_comprueba:
          "Contar los pasos numerados de cada procedimiento y escribir el conteo al costado de su nombre. No cumple si hay procedimientos sin numeración, si los pasos están escritos en primera persona del plural —«enviamos», «marcamos», «nos dirigimos»—, o si un paso trae dos verbos de acción unidos por «y» que pasan en momentos distintos. Se escribe el número de los pasos que hay que partir.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un paso sin número no se puede señalar cuando falla, ni citar en una capacitación, ni marcar como hecho. Y el «nosotros» esconde quién hace qué: los tres documentos de este cliente están escritos en primera persona del plural de principio a fin, así que el día que el paso no se hizo no hay nadie a quien preguntarle. El listado de obligaciones del cajero, además, es un solo bloque de texto corrido sin un número de paso en toda su extensión: eso no es un instructivo terminado, es un dictado sin pasar a limpio.",
      },
      {
        exigencia: "Ningún paso se puede ejecutar solo mirando una imagen: lo que la captura de pantalla muestra está escrito en palabras.",
        como_se_comprueba:
          "Recorrer los pasos que remiten a una pantalla, un ícono, un botón, un recuadro o un color. Cada uno tiene que nombrar en texto el menú, la opción y el dato que se escribe, de modo que el paso se entienda con la imagen tapada. No cumple si el paso dice «damos clic en el cuadro» o «ingresamos los montos de la franja de color» sin nombrar la opción ni el campo. Se cuentan aparte las páginas que son solo una captura sin un paso escrito al lado, y las páginas en blanco: cada una se lista con su número.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Las capturas envejecen con la primera actualización del sistema y dejan el instructivo inservible justo cuando más se necesita. Y una imagen no se puede leer en voz alta ni pegar en la pared. En el documento de caja de este cliente hay páginas que son solo pantallas fotografiadas, cuatro páginas en blanco seguidas en el medio, y un paso que manda ingresar los montos de la franja de color roja del Excel: alguien que nunca vio ese Excel no puede hacer nada con eso, y es precisamente la persona para la que el documento existe.",
      },
      {
        exigencia: "Cada procedimiento dice en qué momento de la jornada corre, con una frecuencia de lista cerrada, y los de frecuencia diaria están puestos en el orden en que de verdad ocurren.",
        como_se_comprueba:
          "Buscar en cada procedimiento su frecuencia, tomada de la lista cerrada: apertura, durante la jornada, cierre, semanal, mensual o según requerimiento. Un procedimiento sin frecuencia, o con una palabra que no está en la lista, no cumple. Después leer seguidos los de apertura, los de durante la jornada y los de cierre: tienen que estar en el orden en que pasan en el día. No cumple si el documento mezcla el cierre con la apertura, ni si lo que hay es una lista de obligaciones sin momento, donde el cuadre del mes aparece entre dos tareas de ventanilla. Las funciones que la ficha del puesto trae como diarias o permanentes tienen que caer en apertura, durante la jornada o cierre: si una queda sin momento del día, tampoco cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Es lo que separa un instructivo terminado de un listado de funciones: el instructivo acompaña la jornada y el listado hay que leerlo entero para saber qué toca ahora. En este cliente los dos extremos están a la vista: el documento de caja sí sigue el día —asistencia, apertura, precios, operaciones, cuadre, cierre— y por eso se puede usar; el listado del mismo puesto pone el cuadre mensual de encomiendas entre dos tareas de ventanilla, y nadie que lo lea sabe qué hacer a las ocho de la mañana.",
      },
      {
        exigencia: "Cada procedimiento dice dónde queda la constancia de que se hizo, nombrando el sistema y la pantalla, el archivo, el cuaderno o el grupo exacto.",
        como_se_comprueba:
          "Buscar al cierre de cada procedimiento el lugar del registro. Tiene que nombrar la pantalla del sistema, el nombre del archivo, el cuaderno o el grupo donde el resultado queda, o decir que hoy no queda registrado en ninguna parte y qué registro habría que abrir. No cumple si dice «en el sistema», «en el Excel» o «se registra» sin decir cuál ni en qué pantalla. Tampoco cumple si lo único que se nombra como prueba de que salió bien es una señal de la pantalla que no deja rastro al día siguiente.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El estándar de la casa es que todo enunciado lleve su medición, y un procedimiento sin lugar de registro no se puede revisar ni al día siguiente: el único control posible vuelve a ser el dueño mirando. En el documento de caja de este cliente la prueba de que el cuadre salió conforme son los emojis que muestra el sistema en pantalla; eso se ve en el momento y desaparece. Al día siguiente nadie puede saber si el cierre de ayer cuadró, y cuando aparece un faltante no hay con qué reconstruir en qué turno nació.",
      },
      {
        exigencia: "Ninguna clave, contraseña, PIN, token, red inalámbrica ni usuario está escrito dentro del instructivo: en su lugar va el puesto que entrega el acceso y el acta donde se firma.",
        como_se_comprueba:
          "Buscar en todo el documento, texto e imágenes, las palabras clave, contraseña, PIN, usuario, token y los nombres de redes inalámbricas, y las capturas donde alguno de esos datos quede fotografiado. Cada aparición es un fallo y se cuenta con su número de página. El paso correcto nombra el puesto que entrega el acceso y el acta de entrega y devolución donde se firma, sin el dato. No cumple tampoco si el documento explica en qué teléfono y en qué aplicación vive el token que autoriza las transferencias.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un instructivo circula: se imprime, se fotografía, se manda por WhatsApp y se queda en el teléfono de quien ya salió de la empresa. En los documentos de este cliente están escritos el PIN de una computadora de ventanilla, la contraseña de un sistema de cambio, las redes a las que hay que conectarse para grabar las pizarras de precios y en qué aplicación de qué banco se genera el código que autoriza una transferencia. La empresa ya pagó una vez el no tener acta de accesos: alguien salió y se fue con los tokens y los correos abiertos.",
      },
      {
        exigencia: "Donde el paso implica decidir, el instructivo trae la cifra y no la palabra: el tope con su moneda dicha, el umbral a partir del cual el procedimiento cambia, y el puesto al que se escala.",
        como_se_comprueba:
          "Marcar los pasos que esperan una decisión: los que nombran un monto, los que hablan de un precio preferencial, los que ordenan autorizar, aprobar, rechazar o escalar. Cada uno tiene que traer la cifra con su moneda dicha —soles o dólares—, el umbral desde el cual el procedimiento cambia y el puesto al que se consulta. No cumple si en lugar de la cifra dice «monto alto», «cantidad mayor», «montos menores», «cambio preferencial» sin número, «según costo promedio» o «en base a criterio». Se escribe el número del paso y la frase encontrada.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un paso sin cifra convierte cada operación en una llamada, y la llamada vuelve a la supervisora o al dueño: el puesto queda de adorno y la cola se para. En el documento de caja de este cliente el precio preferencial se aplica «en base a criterio y costo promedio» con autorización de la supervisora, y en el listado del mismo puesto basta con que el monto «sea alto». Tres personas leen eso y cobran tres precios distintos el mismo día, en la misma empresa, a dos cuadras una de la otra.",
      },
      {
        exigencia: "Ningún paso depende del nombre de una persona para poder ejecutarse: donde hoy hay un nombre propio va el puesto que responde y el canal por donde se pide.",
        como_se_comprueba:
          "Listar todos los nombres propios de personas y todos los nombres de chats, contactos o páginas de terceros que aparecen como fuente de un dato en los pasos. Cada uno tiene que estar reemplazado por el puesto que responde y el canal oficial por donde se pide, con la hora a la que ese dato tiene que estar. No cumple si queda un solo paso cuyo dato de entrada dependa de que una persona con nombre conteste un mensaje. Se escribe la lista de nombres encontrados y el paso donde aparece cada uno.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "El precio con el que abre la ventanilla no puede depender de que alguien conteste el WhatsApp. En los documentos de este cliente el tipo de cambio del día se pide por nombre propio a tres personas distintas, dos de ellas de fuera de la empresa, y uno de los documentos nombra además los chats exactos donde se pregunta la compra y la venta. El día que esa persona no contesta, las tres sedes abren sin precio; y el día que se enoja, la empresa se enteró de que su dato más crítico era un favor.",
      },
      {
        exigencia: "Cada procedimiento dice qué se hace cuando el sistema o el canal se cae, y ese camino alterno trae su tope, su registro y a quién se avisa.",
        como_se_comprueba:
          "Buscar en cada procedimiento el bloque de qué hacer si falla: el puesto que avisa, a quién avisa y por qué canal, hasta qué monto se puede seguir operando mientras, qué queda prohibido hacer, y dónde queda anotado lo ocurrido para pasarlo al sistema después. No cumple si el camino alterno está escrito sin tope ni registro, ni si remite a «los protocolos establecidos» cuando esos protocolos no están escritos en ninguna parte del expediente.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El estándar de la casa separa el error de la negligencia y del incumplimiento a sabiendas, y eso solo se puede aplicar si la falla quedó anotada. En el documento de caja de este cliente la caída del sistema de cambio se resuelve con una calculadora y un apunte, sin decir hasta qué monto se puede operar así, a quién se avisa, ni dónde queda ese apunte después. Es el momento exacto en que nace un faltante, y es el único momento del día en que no hay con qué reconstruir qué pasó.",
      },
      {
        exigencia: "Todo paso que hace salir dinero de la empresa, autoriza una transferencia o entrega un acceso nombra al segundo puesto que confirma antes de que ocurra.",
        como_se_comprueba:
          "Marcar los pasos donde el dinero sale de la empresa o cambia de manos: transferencias bancarias, entrega de efectivo a otra caja, venta de divisa a la caja principal, entrega de una clave o un token. Cada uno tiene que nombrar el segundo puesto que confirma el dato antes de ejecutar —número de cuenta, titular, monto y moneda— y dónde queda esa confirmación. Un solo paso de salida de dinero ejecutable por una sola persona sin confirmación nombrada, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "La salida de dinero es el único paso que no tiene vuelta: una transferencia mal hecha no se corrige, se reclama. En este cliente el instructivo del puesto que mueve las transferencias de cinco empresas describe cómo generar el código que las autoriza y nada más: no dice quién revisa la cuenta de destino antes, ni quién compara el movimiento del banco contra el Excel después, ni qué pasa si no coinciden. Con un solo par de ojos, el error y la mala fe se ven exactamente igual: no se ven.",
      },
      {
        exigencia: "Ningún paso le entrega al puesto una decisión que la Gerencia se reservó.",
        como_se_comprueba:
          "Poner al costado la lista de decisiones que la Gerencia se reservó, por escrito o dichas en la sesión de levantamiento —quién fija el precio del día, quién abre el dinero guardado, quién autoriza una excepción, quién entrega un acceso— y recorrer los pasos buscando si alguno le da esa decisión al puesto. Una sola contradicción, no cumple, y se escribe el número del paso y la decisión que contradice. Si el paso le hace al puesto armar el precio sumando o restando a una cotización que llega de afuera, no cumple. Si no hay ninguna decisión reservada escrita ni dicha, la exigencia queda abierta, no se marca cumple, y se dice así en la entrega.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un instructivo que ordena algo que en la práctica no manda la persona deja de ser exigible completo: el trabajador aprende que el documento se puede ignorar, y a partir de ahí ignora también los pasos que sí importan. En el documento de caja de este cliente el puesto arma el precio del día restando y sumando líneas a lo que llega por mensaje, cuando la Gerencia dijo que el precio lo manda ella. Eso no se corrige quitando el paso: se corrige nombrando al puesto que publica el precio y a qué hora lo publica.",
      },
      {
        exigencia: "Todo umbral, declaración, conservación de datos del cliente o consecuencia sobre el trabajador que el instructivo ordene va marcado para asesoría legal, y el instructivo no fija por su cuenta el monto, el tiempo ni la norma.",
        como_se_comprueba:
          "Buscar en los pasos: el monto desde el cual se llena una declaración jurada; la toma y la conservación del documento de identidad, los nombres y el celular del cliente para emitir comprobante; los pasos que ordenan al trabajador cuidar, vigilar o responder por los fondos de su turno; los descuentos y los faltantes. Cada hallazgo tiene que quedar marcado para verificar con asesoría legal y fuera de la entrega definitiva hasta que vuelva la respuesta por escrito. Si el instructivo escribe por su cuenta la cifra, el tiempo de conservación o la norma que lo exige, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "El instructivo es el documento que la persona de ventanilla de verdad sigue, así que un umbral escrito ahí se aplica aunque nadie lo haya verificado nunca. En los documentos de este cliente el paso de la declaración jurada trae su cifra en dólares puesta por quien dictó, se piden y se guardan los datos de identidad del cliente sin decir dónde ni por cuánto tiempo, y un paso deja los fondos del turno a cargo del cajero: bajo una función parecida ya hubo dos pérdidas y una terminó en despido. Qué corresponde pedir, declarar y conservar lo responde el asesor legal, no la consultora: verificar con asesoría legal.",
      },
      {
        exigencia: "El instructivo trae portada con su versión y su fecha, el puesto que lo aprobó, y al final el bloque de firma de recepción de quien lo va a ejecutar.",
        como_se_comprueba:
          "Buscar en la portada cuatro datos: el puesto y la sede, el código y la versión del documento, la fecha desde la que rige, y el puesto que lo aprobó con su fecha de aprobación. Buscar al final el bloque de recepción con nombre, documento de identidad, fecha y firma de quien lo va a ejecutar. Falta uno de los cuatro datos de portada o falta el bloque de firma, no cumple. Si la aprobación y la vigencia están escritas como un solo dato, tampoco cumple: son dos hechos distintos.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El documento solo se vuelve real cuando se enseña, se evalúa y se firma, y un instructivo sin firma de recibido no se le puede exigir a nadie: el trabajador siempre podrá decir que no lo conocía, y tendrá razón. Ninguno de los tres documentos de este cliente tiene portada, versión, fecha ni aprobación; dos de ellos no dicen ni de qué empresa son, y la propia empresa tiene varias razones sociales. Hoy nadie puede saber si lo que la persona sigue en ventanilla es la última versión o un borrador que quedó dando vueltas.",
      },
      {
        exigencia: "Cada procedimiento de frecuencia diaria tiene su hoja de pared: una sola cara, pasos numerados, con los topes y los umbrales que el ejecutor necesita.",
        como_se_comprueba:
          "Pedir las hojas de pared de los procedimientos marcados como de apertura, de durante la jornada y de cierre. Cada una: una sola cara, pasos numerados en imperativo, con los topes, los umbrales y el puesto al que se escala, sin diagnóstico y sin justificación. No cumple si la hoja tiene dos caras, ni si lo que se entregó para pegar es el capítulo completo del instructivo con sus capturas.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "Lo que no cabe en una cara no se lee en la ventanilla con un cliente adelante y una cola detrás. El instructivo completo es para enseñar y para el que reemplaza; la hoja de pared es la que se usa a diario. Sin ella el instructivo todavía se entrega, diciendo que falta la versión que de verdad va a la pared. Es además lo único de este tipo que este cliente ya tiene a su manera: la pizarra de precios que se actualiza y se fotografía al grupo cada media hora.",
      },
      {
        exigencia: "Todo el texto del instructivo instruye: no hay párrafos de otro documento pegados entre los pasos.",
        como_se_comprueba:
          "Recorrer párrafo por párrafo y marcar los que no ordenan una acción de este puesto: misión, visión, metas de largo plazo, frases de marca, objetivos comerciales, correos o datos de otras empresas del grupo, listas de servicios que no cambian ningún paso. Se cuentan los párrafos marcados y se escribe en qué página está cada uno. Un solo párrafo marcado, no cumple, y lo que se saca se devuelve al documento de la casa donde vive.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "Un párrafo que no instruye le enseña al trabajador, en la primera página que lee, que este documento no habla de su trabajo; después de eso no lee el resto. En el instructivo del área de transferencias de este cliente, entre el paso del código que autoriza la transferencia y el paso de verificar los movimientos del banco, hay frases sobre posicionarse como referentes del mercado local y sobre mostrar un estilo de vida en redes sociales: texto de otro documento que se pegó y nadie quitó. Se entrega igual, diciendo qué hay que limpiar.",
      },
    ],
    errores_tipicos: [
      "El documento se titula obligaciones de un puesto de ventanilla y a media página ya ordena el cuadre de la caja principal, ayudar a los cajeros que no cuadran y orientar a los que entran: tres trabajos de otro puesto dentro del mismo texto.",
      "Todo escrito en primera persona del plural —«enviamos», «marcamos», «nos dirigimos»—, así que el día que el paso no se hizo no hay nadie a quien preguntarle.",
      "Un solo bloque de texto corrido, sin un número de paso en toda su extensión: el puesto está descrito, pero nadie puede seguirlo línea por línea.",
      "Páginas que son solo una captura de pantalla sin un paso escrito al lado, y páginas en blanco seguidas en el medio del documento, dejadas para llenar después.",
      "Pasos imposibles de ejecutar sin haber visto la pantalla antes: «damos clic en el cuadro» o «ingresamos los montos de la franja de color» sin nombrar la opción ni el campo.",
      "La contraseña del sistema, el PIN de la computadora de ventanilla y los nombres de las redes inalámbricas escritos adentro, en un documento que se imprime, se fotografía y se reenvía por WhatsApp.",
      "El dato de entrada del día —el tipo de cambio— pedido por nombre propio a personas distintas, dos de ellas de fuera de la empresa, y por chats nombrados uno por uno.",
      "El propio puesto arma el precio del día sumando y restando líneas a una cotización que llega por mensaje, cuando el precio lo manda la Gerencia.",
      "El precio preferencial se aplica «en base a criterio y costo promedio», o basta con que el monto «sea alto»: tres personas leen eso y cobran tres precios distintos el mismo día.",
      "La caída del sistema se resuelve «con la calculadora y un apunte», sin decir hasta qué monto se puede operar así, a quién se avisa ni dónde queda ese apunte después.",
      "El puesto que mueve las transferencias bancarias de varias empresas tiene menos texto que el que atiende la ventanilla: dos páginas para el trabajo donde el dinero sale y no vuelve.",
      "Ni portada ni cierre: sin versión, sin fecha, sin el puesto que lo aprobó y sin la firma de quien lo va a ejecutar, así que no se le puede exigir a nadie ni se sabe si es la última versión.",
    ],
    senales_de_relleno: [
      "El documento engorda con capturas y adelgaza en pasos: hay más imágenes que líneas que ordenen una acción.",
      "Frases que no ordenan nada: que la atención consiste en ofrecer un servicio amable, eficiente y preciso; crear un ambiente cordial; cumplir con las normas sanitarias y de seguridad.",
      "Misión, visión, metas de largo plazo o frases de marca pegadas entre los pasos, señal de que el texto se armó copiando de otro documento.",
      "El mismo trabajo escrito dos veces con otras palabras en dos partes del documento, porque se dictó en dos sesiones y nadie juntó las versiones.",
      "Páginas en blanco, o con el título solo, dejadas para completar después y que llevan meses así.",
      "Listas de servicios, de operadores o de correos de otras empresas que ocupan una página y no cambian ningún paso.",
      "El mismo nivel de detalle para prender la computadora que para autorizar una transferencia bancaria: eso es dictado sin pasar a limpio, no un instructivo.",
      "Verbos sin número: «monitorearlo durante todo el día», «de tener poco saldo enviar a recargar», donde debería ir la frecuencia y el umbral.",
    ],
    que_se_conserva_casi_siempre:
      "Casi todo se conserva, y hay que decirlo antes de criticar una sola línea: este es el único documento que escribió la persona que hace el trabajo, y eso es lo más caro de levantar y lo imposible de inventar desde afuera. Se conserva el vocabulario completo —el nombre real del sistema, de la pantalla, del archivo, del grupo de WhatsApp, del ícono, de la pizarra—; el orden de la jornada cuando ya está, que en este cliente está bien hecho en el documento de caja: asistencia, apertura, precios, operaciones, cuadre, cierre y limpieza; las definiciones escritas desde el lado del ejecutor, como que comprar es cuando el cliente entrega sus dólares y vender cuando entrega sus soles, que valen más que cualquier glosario nuestro; el objetivo del puesto donde alguien ya lo redactó; y el detalle fino de las operaciones que solo conoce quien las hace, incluidos los pasos de las remesas, los pagos de servicios y las encomiendas. El trabajo es una versión siguiente, no un documento nuevo: numerar los pasos, sacar las claves y los nombres propios, poner el puesto y la sede en el encabezado, escribir los topes y los umbrales, agregar el camino alterno cuando el sistema se cae, decir dónde queda la constancia, y ponerle portada y firma. Son días sobre lo que ya hay. Rehacerlo desde cero es tirar el único material de primera mano del expediente y pedirle a la misma persona que lo vuelva a dictar.",
  },

  organigrama: {
    clave: "organigrama",
    tipo: "Informe de diseño organizacional y organigrama",
  
    para_que_sirve:
      "Es el documento que dice cuántos puestos tiene la empresa, quién manda sobre quién y qué falta por cubrir. Bien hecho resuelve cuatro cosas que hoy cuestan dinero: que el dueño no se entere de cuánta gente le falta hasta el día en que alguien renuncia; que una ausencia de tres días la resuelva él en persona porque nadie tiene escrito quién cubre a quién; que dos personas reciban órdenes de dos jefes distintos y la empresa pague el choque; y que se contrate por urgencia un puesto que nunca se diseñó. Es además el mapa del que salen los demás documentos: el manual de funciones, la planilla, la selección, la evaluación y el plan de sucesión leen de aquí los nombres de puesto y la línea de mando. Si este documento cuenta mal, todos los de abajo cuentan mal.",
  
    para_quien_es:
      "Lo aprueba y lo firma la Gerencia, lo usa quien administra el personal para contratar y repartir carga, y lo lee el trabajador el día que entra para saber a quién le reporta y quién lo cubre. El cuerpo va entre 8 y 15 páginas: el organigrama en una sola cara, la tabla de puestos completa en otra, y una página por sede. Los perfiles y las funciones viven en el manual de funciones, no aquí. Si pasa de 20 páginas dejó de ser el mapa y se volvió un informe que nadie cruza con la planilla.",
  
    exigencias: [
      {
        exigencia:
          "Hay un recuadro por cada puesto que la empresa tiene registrado, ocupado o vacío, y el conteo que el informe declara en su alcance es el mismo que el de los recuadros dibujados.",
        como_se_comprueba:
          "Escribir tres cifras una al lado de la otra: los puestos que el alcance del informe declara, los recuadros que el organigrama dibuja y los puestos que la empresa tiene registrados en su sistema o planilla. Si el organigrama tiene menos recuadros que puestos registrados, no cumple, y se escribe la lista de los que faltan con su nombre. Si el alcance declara una cifra distinta a los recuadros dibujados, tampoco cumple. Los puestos que existen y no están dibujados se cuentan aparte, separando los que tienen persona de los que están vacíos.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un organigrama que dibuja solo los puestos ocupados describe la empresa que hay hoy en ventanilla, no la que la empresa necesita cubrir. En el informe de este cliente el alcance declara los puestos formalizados en el manual y el registro de la empresa tiene bastantes más: los que faltan son justo los vacíos, y así el hueco de personal desaparece del único documento donde se vería. Nadie puede planificar una contratación con un mapa que borra lo que falta.",
      },
      {
        exigencia:
          "Cada recuadro dice si hoy tiene persona o está vacío, y cada vacío dice desde cuándo lo está y qué puesto absorbe esas funciones mientras tanto.",
        como_se_comprueba:
          "Recorrer recuadro por recuadro buscando el estado escrito: ocupado o vacante. Para cada vacante buscar dos datos más: el mes desde el que está sin persona y el puesto que carga esas funciones hoy. Un recuadro sin estado, no cumple. Una vacante sin el puesto que la absorbe, no cumple. Al pie del organigrama se escribe el par de conteos: cuántos recuadros tienen persona y cuántos están vacíos.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "El puesto vacío no deja de trabajarse: lo absorbe alguien, casi siempre el de más arriba, y nadie lleva la cuenta de cuánto está cargando. En este cliente los puestos vacíos son más de un tercio del registro y ninguno aparece marcado, así que la sobrecarga real del administrador y de la dueña no está escrita en ninguna parte y no se puede repartir.",
      },
      {
        exigencia:
          "Cada recuadro nombra un solo jefe inmediato, ese jefe tiene recuadro propio, y ningún puesto aparece debajo de dos mandos distintos en dos partes del mismo informe.",
        como_se_comprueba:
          "Armar la lista de pares puesto y jefe inmediato con todos los recuadros. Comprobar tres cosas: que ningún puesto tenga dos jefes, que todo jefe nombrado tenga recuadro, y que haya un solo puesto sin jefe, el de más arriba. Después cruzar esa lista contra los campos «supervisa a» de cada recuadro: si un puesto aparece colgado de un mando en la línea de reporte y de otro mando en un «supervisa a», no cumple, y se escriben los dos mandos y la página de cada uno.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "El informe de este cliente declara la unidad de mando entre sus principios y acto seguido pone a los cajeros bajo el administrador general en el cuadro de niveles y bajo su supervisor en las líneas de reporte. Dos jefes escritos es una instrucción contradictoria con respaldo documental: el día del conflicto cada uno muestra su página, y la orden que se cumple es la del que grita más fuerte.",
      },
      {
        exigencia:
          "El nivel jerárquico que lleva cada recuadro es el largo de su propia cadena de reporte hasta el puesto de más arriba, y el número de niveles que el informe declara es el largo de la cadena más larga.",
        como_se_comprueba:
          "Para cada recuadro, subir por el campo de jefe inmediato hasta el puesto que no tiene jefe, contando los saltos. El conteo de saltos más uno es el nivel de ese puesto. Comparar ese resultado con el nivel escrito en el recuadro: cualquier diferencia, no cumple, y se escribe el puesto con los dos números. Tomar después la cadena más larga del organigrama y comparar su largo con el número de niveles que el informe declara en su alcance y en sus conclusiones: si no coinciden, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Los niveles son el dato que todo el mundo cita del informe y que nadie comprueba. Si el número declarado no sale de las líneas dibujadas, el documento puede prometer cuatro niveles y tener puestos colgados a dos saltos del dueño y otros a cinco: la delegación que el informe dice que existe no existe, y la Gerencia sigue decidiendo todo porque la cadena nunca se cerró.",
      },
      {
        exigencia:
          "Cada puesto que tiene gente debajo trae escrito cuántas personas le reportan directamente, y ninguno pasa del tope de personas por jefe que la Gerencia fijó por escrito.",
        como_se_comprueba:
          "Contar, para cada puesto con gente debajo, los recuadros que lo nombran como jefe inmediato, y comprobar que ese número esté escrito en su propio recuadro. Si el recuadro no trae el conteo, no cumple. Comparar cada conteo con el tope de personas por jefe que la Gerencia fijó: el puesto que lo pasa tiene que aparecer en la lista de ajustes del informe, con el puesto nuevo o el traslado que lo resuelve. Un puesto por encima del tope sin nada escrito al respecto, no cumple. Si la Gerencia todavía no fijó el tope, el informe tiene que decirlo y traer la fila del tope en blanco con su línea de firma, marcada como pendiente: los conteos por jefe se escriben igual. El informe que no trae el tope y tampoco lo deja pendiente de firma, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Este informe declara entre sus principios el control del tramo de mando y no escribe un solo número, así que el principio no se puede comprobar ni incumplir: es decoración. Cuando un jefe tiene demasiada gente debajo deja de supervisar y empieza a apagar incendios, y en una empresa de efectivo eso se paga en faltantes que aparecen donde nadie estaba mirando.",
      },
      {
        exigencia:
          "Cada puesto dice qué puesto lo cubre cuando la persona falta, y qué no hereda el que cubre.",
        como_se_comprueba:
          "Buscar en cada recuadro, o en la tabla de puestos, el campo de respaldo. No cumple si el campo no existe, si dice «el jefe inmediato» sin nombrar el puesto, o si nombra el puesto y no dice qué queda fuera del reemplazo: las claves, las llaves, los topes de monto, las firmas y el acceso al dinero guardado. Los cinco rubros se resuelven uno por uno, y «ninguno» es respuesta válida en el puesto donde el rubro no tiene sentido: lo que no cumple es dejar el rubro en blanco. Se cuenta cuántos puestos tienen respaldo escrito y cuántos no, y se escribe el par de conteos. Un respaldo escrito sobre un puesto vacío no cuenta como respaldo.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El estándar de la casa cierra con respaldar, y en el registro de este cliente un solo puesto tiene respaldo escrito: el resto se resuelve el día de la ausencia con una llamada a la dueña. El informe lo vio y lo despachó en una línea —«crear un plan de sucesión para puestos críticos»— sin nombrar un puesto ni quién cubre a quién. Una recomendación así no se puede ejecutar ni comprobar, y la ausencia del lunes la sigue cubriendo la Gerencia en persona.",
      },
      {
        exigencia:
          "Todo puesto dibujado en el organigrama tiene su ficha de funciones, y el que no la tiene aparece marcado en el propio recuadro y en una lista de pendientes con el puesto que la va a escribir.",
        como_se_comprueba:
          "Cruzar los nombres de todos los recuadros contra las fichas del manual de funciones vigente, y escribir la lista de los recuadros sin ficha. Cada uno de esos recuadros tiene que estar marcado en el dibujo y aparecer en la lista de pendientes con el puesto responsable de escribir la ficha y el día en que la entrega. Un recuadro sin ficha y sin marca, no cumple. Un pendiente sin puesto responsable, tampoco.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "El informe de este cliente lista al personal de seguridad como puesto a cargo del administrador, con línea de reporte dibujada, y reconoce en una línea de las áreas de mejora que no tiene ficha propia. Un puesto que aparece en el organigrama sin funciones escritas custodia o manda sin límites, y nadie puede reclamarle nada el día que algo sale mal.",
      },
      {
        exigencia:
          "El organigrama se puede leer sin la imagen: además del dibujo va la tabla con una fila por puesto.",
        como_se_comprueba:
          "Buscar la tabla de puestos y revisar sus columnas: nombre del puesto, jefe inmediato, puestos que supervisa, cuántos le reportan, sede, estado —ocupado o vacante— y respaldo. Si la estructura existe solo como figura, no cumple. Si la tabla existe y le falta una columna, no cumple y se escribe cuál falta. Si la tabla y el dibujo se contradicen en un solo puesto, no cumple y se escribe el puesto.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "En el informe de este cliente la estructura completa vive dentro de una figura. Lo que dice una figura no se puede cruzar con la planilla, ni pegar en un correo, ni corregir sin volver a dibujarla, así que se desactualiza con la primera contratación y nadie se entera. La tabla es lo que convierte el organigrama en algo que se cuenta, no en algo que se admira.",
      },
      {
        exigencia:
          "Cada recuadro dice en qué sede trabaja el puesto, y por cada hora en que una sede está abierta hay un puesto de mando asignado a esa sede en ese tramo.",
        como_se_comprueba:
          "Hacer una fila por sede con su hora real de apertura y de cierre, y poner debajo los puestos asignados a esa sede con el horario de cada uno. Marcar los tramos en que la sede está abierta y ningún puesto de mando está presente. Un solo tramo descubierto, no cumple, y se escribe la sede y las horas del tramo. Un puesto sin sede asignada, no cumple. Si el puesto rota entre sedes, tiene que decirlo y traer el horario de cada una.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Este cliente tiene una sede que cierra más tarde que el horario del puesto que manda sobre ella y más tarde que el de la Gerencia. En ese tramo hay dinero en ventanilla y no hay a quién llamar escrito en ninguna parte. El organigrama es el único documento donde ese hueco se ve de un golpe, y si no trae el horario por sede, el hueco sigue ahí todos los días.",
      },
      {
        exigencia:
          "Un puesto por recuadro y un recuadro por puesto: ningún recuadro junta dos cargos ni un cargo con una cantidad de personas, y si una persona ocupa dos puestos aparece en los dos recuadros con el mismo nombre y se dice cuál es el principal.",
        como_se_comprueba:
          "Listar los nombres de todos los recuadros y de todas las celdas de los cuadros de distribución. Buscar los que unan dos cargos con «y», con «/» o con «+», y los que unan un cargo con una cantidad de personas. Buscar después nombres de puesto repetidos en recuadros distintos. Si la misma persona aparece en dos recuadros, comprobar que los dos la nombren y que uno diga que es su puesto principal. Cualquiera de los tres casos, no cumple, y se escribe el recuadro.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Juntar dos cosas en un recuadro es la forma más común de tapar que una de las dos no tiene persona. En los cuadros de distribución por sede de este informe hay celdas que pegan al supervisor con la cantidad de cajeros de la sede: así no se puede contar cuántos son, ni quién manda sobre quién, ni cuál de los dos está vacío. Y una persona que ocupa dos puestos sin que se diga aparece como dos personas en el conteo de la empresa.",
      },
      {
        exigencia:
          "Cada puesto se escribe con el mismo nombre en todo el documento, y el cargo que acompaña a cada firma es uno de los puestos del organigrama.",
        como_se_comprueba:
          "Tomar el nombre de cada recuadro como el nombre único del puesto y buscar cada vez que ese puesto se nombra en el resto del informe: cuadros de niveles, líneas de reporte, distribución por sede, mapa de riesgos, cuadro de competencias y bloque de firmas. Si el mismo puesto aparece con dos escrituras distintas, no cumple, y se escriben las dos con su página. Si el cargo escrito junto a una firma no corresponde a ningún recuadro, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "En el bloque de firmas de este informe el cargo de quien lo elaboró no es ninguno de los puestos que el propio informe dibuja, y además está escrito con un error de tecleo. Con dos escrituras para el mismo puesto no se puede cruzar el organigrama con la planilla ni con el manual de funciones, y el documento deja de servir para lo único que tiene que servir: contar.",
      },
      {
        exigencia:
          "El informe trae su versión, el día en que se aprobó y el día desde el que rige, escritos por separado, y el bloque de firmas tiene nombre, cargo y fecha llenos tanto en quien elabora como en quien aprueba.",
        como_se_comprueba:
          "Buscar en la portada la versión, el día de aprobación y el día desde el que rige, escritos como tres datos distintos. Buscar en el bloque de firmas, para quien elabora y para quien aprueba, los tres campos: nombre, cargo y fecha. Cualquier casilla en blanco, no cumple, y se escribe cuál. Una versión sin día de vigencia, no cumple. Si el día de aprobación y el de vigencia son el mismo dato escrito una sola vez, no cumple.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El informe de este cliente trae la firma de la Gerencia y las casillas de fecha en blanco. Sin fecha nadie puede decir si la estructura que está leyendo es la que manda hoy o la de dos reorganizaciones atrás, y una firma sin fecha no sostiene ninguna decisión de personal el día que alguien reclama. Aprobar y entrar en vigencia son además dos hechos distintos que se confunden todo el tiempo.",
      },
      {
        exigencia:
          "Cada recomendación del informe tiene puesto responsable, día de entrega y con qué se va a saber que se hizo.",
        como_se_comprueba:
          "Listar y numerar todas las recomendaciones y áreas de mejora del informe. Para cada una buscar tres datos: el puesto que la ejecuta, el día en que la entrega y el documento o registro que servirá de prueba de que se hizo. A la recomendación que le falte uno de los tres, no cumple, y se escribe su número. La recomendación escrita en una sola línea sin responsable se cuenta como no cumple aunque el informe la llame prioritaria o final.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Las áreas de mejora de este informe son cinco líneas sin un responsable y sin una fecha, y cada una de ellas es un documento que alguien tiene que escribir: la ficha del puesto de seguridad, los indicadores por puesto, el protocolo de traslado de dinero, el plan de sucesión. Una recomendación sin dueño se lee, se aprueba y no pasa nada: el informe queda bien y la empresa sigue igual.",
      },
      {
        exigencia:
          "El informe dice qué cambió respecto de la versión anterior: qué recuadro se creó, cuál se eliminó y cuál cambió de jefe.",
        como_se_comprueba:
          "Si el informe lleva un número de versión mayor que el primero, buscar la lista de cambios. Tiene que traer tres columnas: recuadros nuevos, recuadros eliminados y recuadros que cambiaron de jefe inmediato, cada uno con el nombre del puesto. Si la versión avanzó y no hay lista de cambios, no cumple. Si la lista existe y algún puesto que aparece distinto en el dibujo no está en ella, no cumple y se escribe el puesto.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "Una versión nueva sin lista de cambios obliga a todos los que la leen a comparar dos dibujos a ojo, y nadie lo hace: se asume que es igual con otro color. El informe de este cliente va en su segunda versión y en ninguna página dice qué se movió, así que no hay forma de saber si el cambio de mando que alguien recuerda está escrito o se perdió entre versiones.",
      },
      {
        exigencia:
          "Cada «supervisa a» dibujado tiene el registro donde queda la constancia de esa supervisión.",
        como_se_comprueba:
          "Tomar uno por uno los campos «supervisa a» de los recuadros y buscar, para cada uno, el registro nombrado donde queda la prueba de esa supervisión: el cuaderno, la hoja de cuadre, el reporte diario o el módulo del sistema. Un «supervisa a» sin registro nombrado, no cumple. Si el único registro nombrado es una conversación o un grupo de mensajería, no cumple, porque de ahí no se puede sacar la constancia de un día pasado.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "Una línea de supervisión sin registro es una flecha en un dibujo: no se puede verificar ni al día siguiente, y lo que no se puede verificar se deja de hacer sin que nadie lo note. En este informe la coordinación se apoya en grupos de mensajería y en reportes de media mañana que no quedan en ningún lado, de modo que la supervisión que el organigrama promete no deja rastro.",
      },
      {
        exigencia:
          "Todo lo que la estructura decida sobre jornada, mando sobre personal de terceros o responsabilidad por dinero ajeno va marcado para asesoría legal y sale de la entrega hasta que el asesor responda por escrito.",
        como_se_comprueba:
          "Buscar en el informe cuatro cosas: puestos marcados como «sin fiscalización» o eximidos de marcar su hora de entrada; personal de una empresa tercera dibujado dentro de la estructura con línea de reporte; puestos a los que el informe carga una pérdida o un faltante; y funciones de mando escritas sobre personas que no están en la planilla de la empresa. Cada hallazgo tiene que llevar la marca de que se verifica con asesoría legal y quedar fuera de la entrega hasta que vuelva la respuesta. Si el informe resuelve por su cuenta cuál es la jornada que corresponde o de quién es la responsabilidad, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Una estructura que decide jornadas y responsabilidades por su cuenta se firma y después se cobra, y el que paga el error es la empresa, no la consultora. Este informe marca a sus dos puestos de arriba sin fiscalización de horario como si fuera una característica del cargo, y dibuja a la gente de una empresa tercera con línea de mando adentro: las dos cosas hay que verificarlas con asesoría legal antes de escribirlas, no después de firmarlas.",
      },
      {
        exigencia:
          "Si el informe o el expediente de la empresa nombran una autoridad del sector, un registro o una licencia, el informe dice qué puesto responde ante esa autoridad por el cumplimiento, y deja esa designación marcada para que la confirme el asesor.",
        como_se_comprueba:
          "Buscar primero el hecho que enciende esta comprobación: una autoridad del sector, un registro o una licencia nombrados en el informe o en el expediente de la empresa. Si no aparece ninguno de los tres, se escribe eso mismo —que el informe no nombra autoridad, registro ni licencia— y ahí termina. Si aparece alguno, buscar el puesto al que el informe le asigna responder ante esa autoridad y comprobar que ese puesto tenga recuadro propio y persona nombrada. Si el cumplimiento aparece solo en el mapa de riesgos, como un riesgo del nivel de arriba, y no aterriza en un puesto con nombre, no cumple. La designación va marcada como pendiente de confirmación del asesor legal, y el informe no fija por su cuenta el alcance de ese deber.",
        origen: "obligacion_a_verificar",
        obligatoria: false,
        por_que:
          "En este informe el cumplimiento normativo aparece como un riesgo de la Gerencia con «asesoría legal» escrito al costado, y nunca se convierte en el deber de un puesto con nombre y recuadro. Un deber frente a la autoridad que no está en ningún recuadro no tiene quién lo cumpla: el día de la visita nadie sabe quién contesta, y el documento que debía decirlo es justo este.",
      },
    ],
  
    errores_tipicos: [
      "El alcance declara los puestos que el manual de funciones formalizó y el organigrama dibuja solo esos, así que los puestos vacíos del registro de la empresa no aparecen en ninguna página y el hueco de personal no se ve.",
      "Un cuadro de niveles que cuelga a los cajeros del administrador general y otro cuadro de líneas de reporte que los cuelga de su supervisor, en el mismo documento que declara la unidad de mando como primer principio.",
      "Un puesto listado como «a cargo de» y como «transversal» que no tiene ficha propia, reconocido en una línea de las áreas de mejora y dejado así hasta la próxima versión.",
      "La estructura completa metida dentro de una figura, sin tabla que se pueda cruzar con la planilla ni corregir sin volver a dibujar.",
      "Principios declarados sin un número que los haga comprobables: el tramo de mando «controlado» sin decir cuánta gente tiene cada jefe debajo.",
      "Celdas que juntan un puesto con una cantidad de personas —el supervisor más los cajeros de su sede— y que por eso no se pueden contar.",
      "El cargo escrito junto a la firma de quien elaboró el informe no es ninguno de los puestos que el informe dibuja, y viene además con un error de tecleo.",
      "Firma de la Gerencia con las casillas de fecha en blanco, y una versión sin día desde el que rige.",
      "Cuatro niveles declarados en el alcance y en las conclusiones sin que nadie haya seguido la cadena de reporte puesto por puesto para contarlos.",
      "Áreas de mejora de una línea cada una, sin responsable, sin día y sin prueba: «crear un plan de sucesión para puestos críticos», sin nombrar cuáles ni quién cubre a quién.",
      "Una sede que cierra más tarde que el horario del puesto que manda sobre ella, sin que el documento diga quién queda a cargo en ese tramo con dinero en ventanilla.",
      "Personal de una empresa tercera dibujado dentro de la estructura con línea de reporte, como si estuviera en la planilla, y puestos marcados sin control de horario como si fuera un beneficio del cargo.",
    ],
  
    senales_de_relleno: [
      "Párrafos que explican qué es un organigrama o qué es una estructura funcional-lineal, en lugar de decir quién manda sobre quién en esta empresa.",
      "Cuadros de tipología —centralización, formalización, diferenciación horizontal y vertical— que se podrían copiar a cualquier empresa del país sin cambiar una palabra.",
      "Una sección de fortalezas que repite como logro lo que los principios ya habían declarado como intención, sin un conteo que lo sostenga.",
      "Comparaciones entre puestos que cuentan funciones y no dicen qué decide cada uno ni hasta cuánto.",
      "Mapas de riesgo con el mismo mecanismo de control escrito para todos los niveles: reportes diarios y supervisión directa.",
      "Cuadros de competencias con la misma formación y el mismo nivel de idioma repetidos puesto por puesto, cambiando solo los años de experiencia.",
      "Conclusiones que afirman que la estructura es coherente e integral sin un solo conteo que se pueda verificar.",
      "Recomendaciones que piden desarrollar un documento que esta misma consultoría tenía que entregar.",
    ],
  
    que_se_conserva_casi_siempre:
      "Casi siempre se conserva el esqueleto, y hay que decirlo antes de criticar. En este tipo de informe suele estar bien y no se toca: el orden de las secciones —propósito, modelo y principios, organigrama, niveles, comparación de roles, distribución por sede, riesgos por nivel, relaciones de autoridad, relaciones con terceros, fortalezas y mejoras, conclusiones—; el código por puesto, porque significa que ya existe un sistema documental y no hay que inventarlo; las líneas de reporte escritas cadena por cadena, que es la pieza que permite contar los niveles aunque el informe no las haya contado; la lógica de especialización por canal y por sede, que es una decisión de diseño real y bien tomada; el cuadro de distribución por sede con turno y horario, que es el único lugar donde se ve la cobertura; el mapa de riesgos por nivel, que la mayoría de las empresas no tiene; el cuadro de relaciones con entidades externas; y la honestidad de la sección de áreas de mejora, que nombra los huecos aunque no los asigne a nadie. El trabajo normal es una versión nueva —agregar los recuadros vacíos, poner el estado y el respaldo de cada puesto, cerrar la doble línea de mando, sacar la estructura de la figura a una tabla, contar los niveles de verdad, llenar las fechas y ponerle dueño y día a cada recomendación—, no un documento nuevo. Rehacerlo desde cero convierte días de trabajo en meses y le quita al cliente lo único que ya tenía ordenado.",
  },

  perfil: {
    clave: "perfil",
    tipo: "Perfil de puesto y ficha de convocatoria",
    para_que_sirve:
      "Es el documento con el que se sale a buscar a una persona y con el que después se la evalúa y se la contrata. Bien hecho resuelve cuatro cosas que hoy cuestan dinero: que no se busque gente para un puesto que nadie definió y que termina cargando todo lo que nadie quiso asignar; que el que entrevista sepa qué tiene que comprobar antes de recomendar a alguien; que el candidato sepa de qué va a responder, hasta dónde va a decidir y cuánto se le va a pagar antes de aceptar; y que quede escrito quién aprobó la búsqueda. En una empresa que mueve efectivo tiene además una función que ningún otro documento cumple: es donde se escribe hasta cuánto decide solo quien todavía no está certificado, que es la cifra que evita el día caro.",
    para_quien_es:
      "Lo redacta quien administra el personal, lo firma Gerencia antes de que salga la convocatoria, y después lo leen el que entrevista, el que recibe al nuevo y el propio ocupante el día que entra. Dos a tres páginas por puesto: la primera con el nombre del puesto, de qué responde y hasta dónde decide; la segunda con requisitos, prueba, condiciones del local y remuneración; la hoja de firma al final. Un perfil que pasa de cuatro páginas se convirtió en manual de funciones y nadie lo va a leer antes de una entrevista; uno que cabe en media página no alcanza para contratar a nadie. El aviso que se publica se saca de aquí y es más corto todavía: una cara.",
    exigencias: [
      {
        exigencia:
          "El puesto se llama exactamente igual que en el organigrama vigente y que en su ficha del manual de funciones, y el título no junta dos oficios distintos.",
        como_se_comprueba:
          "Copiar el nombre del puesto del encabezado del perfil y buscarlo palabra por palabra en el organigrama vigente y en el índice del manual de funciones. Si en alguno de los dos no aparece, o aparece con otras palabras, no cumple y se escriben los tres nombres uno debajo del otro. Después mirar el propio título: si trae un guion, una barra o una «y» que une dos oficios que se hacen en momentos distintos —cajero y atención al cliente, asistente y cobranzas—, no cumple, y se escribe cuál de los dos es el puesto y cuál es una función suya.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Con tres nombres para el mismo puesto no se puede cruzar el perfil con el organigrama ni con la planilla, y se contrata para un cargo que en los papeles de la empresa no existe. En el modelo de este cliente el puesto se publica con un guion que une dos oficios, y ese nombre compuesto no está en el manual de funciones: el día de la evaluación nadie sabe contra qué ficha se mide al candidato.",
      },
      {
        exigencia:
          "El objetivo del puesto está en una sola oración y nombra el resultado que se le va a pedir, no las tareas con las que lo consigue.",
        como_se_comprueba:
          "Leer el objetivo y buscar adentro al menos un resultado que se pueda constatar al día siguiente mirando un registro: caja cuadrada sin diferencia, informe enviado dentro del horario, margen respetado, cliente registrado al entrar. Si el objetivo es la lista de funciones otra vez, separada por comas y repetida más abajo, no cumple. Si el objetivo nombra solo una cualidad del ocupante —ser confiable, ser ágil, tener vocación de servicio—, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "El objetivo es lo que se le lee al candidato en el primer minuto de la entrevista y lo que el jefe usa el día que tiene que decirle que no está funcionando. Si ahí dice una cualidad en lugar de un resultado, la conversación se vuelve sobre cómo es la persona y no sobre lo que entregó. El modelo de este cliente sí lo tiene bien escrito y esa oración se conserva tal cual.",
      },
      {
        exigencia:
          "Las funciones del perfil son las de la ficha de ese puesto en el manual de funciones: ninguna se agrega, ninguna de las diarias o permanentes se omite.",
        como_se_comprueba:
          "Poner las dos listas en dos columnas y cruzarlas por objeto del negocio, no por el verbo. Escribir las funciones que el perfil trae y la ficha no, y las funciones marcadas diarias o permanentes en la ficha que el perfil no dice. Una sola de cualquiera de las dos clases, no cumple. Si ese puesto no tiene ficha en el manual de funciones, el perfil no se mide: se anota que falta la ficha y eso es lo primero que se devuelve.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Se contrata para un trabajo y se exige otro. El candidato acepta leyendo siete funciones, entra y se encuentra con las veinte de la ficha, y el que lo contrató no puede reclamarle nada de lo que no estaba escrito. Al revés es igual de caro: una función que el perfil inventa y la ficha no tiene no la va a verificar nadie.",
      },
      {
        exigencia:
          "El perfil dice a qué puesto reporta el ocupante, qué puestos tiene a cargo —o la palabra ninguno— y en qué local va a trabajar.",
        como_se_comprueba:
          "Buscar los tres campos por separado: jefatura inmediata, puestos a cargo y local. Cada uno tiene que traer el nombre de un puesto, la palabra «ninguno», o el nombre del local. Si falta uno de los tres, no cumple. Si la jefatura dice «la Gerencia» y el organigrama pone un puesto en medio, no cumple. Si el puesto rota entre locales, tiene que decirlo y nombrar cada local.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Sin jefe escrito, el día que hay un problema el nuevo le escribe a la dueña, y la dueña vuelve a hacer el trabajo del que puso en medio. Sin local escrito nadie sabe a qué dirección se le cita ni qué horario le toca. En el modelo de este cliente no hay ninguno de los tres campos: el único rastro de lugar es la dirección al pie del documento, y la empresa tiene más de un local abierto.",
      },
      {
        exigencia:
          "Si el puesto decide sobre dinero, autoriza transferencias o custodia valores, el perfil trae dos cifras con su moneda dicha: hasta cuánto decide solo quien ya está certificado y hasta cuánto quien todavía no, que puede ser cero. Los puestos que no deciden dinero lo dicen con la palabra ninguno.",
        como_se_comprueba:
          "Abrir el perfil, leer los dos campos de tope y escribir las dos cifras una debajo de la otra con su moneda. Sí: hay dos cifras, cada cifra distinta de cero dice si son soles o dólares, y un tope en cero se escribe cero y no necesita moneda; o el campo entero dice «ninguno» porque el puesto no decide dinero. No: hay una sola cifra, a una cifra distinta de cero le falta la moneda, el campo está en blanco, o dice «a convenir», «montos menores» o «según criterio del jefe».",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un puesto de ventanilla sin tope escrito no es un puesto: es una ambigüedad con sueldo, y cada operación sube a la dueña hasta que alguien se cansa y decide solo. La segunda cifra es la que evita la pérdida de caja que después termina en despido por falta de capacitación: si el tope del que no está certificado no está escrito, la primera jornada con poca gente en ventanilla alguien opera solo «por mientras». En el modelo de este cliente el puesto que se describe maneja efectivo todo el día y no hay ninguna cifra de autoridad en todo el documento.",
      },
      {
        exigencia:
          "El perfil lista uno por uno los accesos y las custodias que recibe el puesto, y marca cada uno como sí o no.",
        como_se_comprueba:
          "Buscar la lista de lo que se le entrega al ocupante y comprobar que cada cosa esté dicha por separado con su sí o su no: usuario del sistema, correo de la empresa, token del banco, clave del dinero guardado, llave del local, caja chica, acceso a los datos de clientes. Si en lugar de la lista hay una frase como «se le otorgarán los accesos correspondientes», no cumple. Si la lista existe pero sin marcar cuáles sí y cuáles no, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "El candidato tiene que saber de qué se va a hacer responsable antes de aceptar, y la empresa tiene que saber qué le va a cortar el día que esa persona salga. Esta empresa ya pagó esa lección: alguien salió sin acta y se fue con los tokens, el correo y el acceso al archivo abiertos. La lista del perfil es el papel contra el que después se firma la entrega y la devolución.",
      },
      {
        exigencia:
          "Cada requisito está marcado línea por línea como obligatorio o deseable, y dice con qué se acredita: un documento nombrado, una prueba o la referencia de un empleador con su dato de contacto.",
        como_se_comprueba:
          "Recorrer formación, experiencia y conocimientos técnicos renglón por renglón. Cada renglón tiene que traer dos cosas: la marca de obligatorio o deseable, y con qué se acredita. Una marca puesta en el título del bloque y no en el renglón no cuenta, porque el bloque mezcla renglones de las dos clases. Contar los renglones a los que les falta una de las dos cosas y escribir el número: uno solo, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Sin la marca, el que filtra las hojas de vida descarta a quien la empresa habría contratado y cita a quien no cumple lo único que no era negociable. Sin la forma de acreditarlo, el requisito se cree de palabra y el año de experiencia que decidió la contratación nunca se verificó. En el modelo de este cliente la formación entera va marcada como deseable, el bloque de conocimientos técnicos va marcado como obligatorio para todos sus renglones, y la experiencia mínima queda sin marca: nadie sabe si un postulante sin ese año queda fuera o entra.",
      },
      {
        exigencia:
          "Las competencias están escritas como conducta que se puede ver, con cómo se demuestra, qué la contradice y con qué se mide, y cada una entra en una de las cuatro partes de la evaluación de la casa: resultados, comportamiento, competencia y responsabilidad.",
        como_se_comprueba:
          "Leer la lista de competencias renglón por renglón. Si el renglón es un adjetivo o una frase hecha —responsabilidad, compromiso organizacional, proactividad, trabajo en equipo, persona carismática—, no cumple. Cada renglón tiene que traer una conducta que se pueda marcar mirando a alguien trabajar, lo que la contradice, con qué se mide, y a cuál de las cuatro partes pertenece. Escribir cuántos renglones son adjetivos sobre el total.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "Una lista de adjetivos no se puede puntuar, así que a la hora de la verdad el entrevistador califica por simpatía y después no puede explicar por qué eligió a ese. El estándar de la casa ya resolvió esto escribiendo cada valor con su conducta, su contrario y su medida, y el perfil tiene que salir de ahí. En el modelo de este cliente las competencias conductuales son todas adjetivos, y una pide una persona carismática: nadie puede marcar eso mirando a nadie trabajar.",
      },
      {
        exigencia:
          "El perfil nombra la prueba de oficio con la que se comprueba el requisito obligatorio principal del puesto, con sus ejercicios y su mínimo escrito en número.",
        como_se_comprueba:
          "Buscar en el perfil la prueba que se le va a poner al candidato. Tiene que traer los ejercicios —contar y entregar efectivo, armar un cuadre con una diferencia metida a propósito, usar la hoja de cálculo con la que se trabaja—, el puntaje de cada bloque y el mínimo para aprobar en número. Si solo dice que se evaluará su desempeño práctico, no cumple. Si la prueba está nombrada sin mínimo en número, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "La entrevista se pasa hablando bien; la prueba con dinero en la mano no. Si el perfil no dice qué prueba corresponde a ese puesto, cada entrevistador improvisa una distinta y los candidatos dejan de ser comparables. El modelo de este cliente pide Excel intermedio y manejo de caja como conocimientos obligatorios y no dice con qué se comprueban: se comprueban creyéndole al postulante.",
      },
      {
        exigencia:
          "El perfil dice con qué números se va a medir al ocupante y de dónde se lee cada uno.",
        como_se_comprueba:
          "Buscar entre uno y tres números de medición del puesto, cada uno con el registro, el cuaderno o el sistema de donde se lee y cada cuánto se mira. Si hay un objetivo bien escrito pero ningún número, no cumple. Si hay números que exigen un reporte que la empresa no tiene hoy, no cumple y se escribe cuál es el reporte que falta.",
        origen: "manual_vigente",
        obligatoria: false,
        por_que:
          "La regla de la casa es que todo enunciado lleva su medición. Sin números el jefe no puede decirle al ocupante cómo le está yendo y la primera evaluación se vuelve una conversación de impresiones. Y es lo único que permite saber, meses después, si el puesto que se creó sirvió para algo.",
      },
      {
        exigencia:
          "Las condiciones de trabajo traen el horario real del local donde va a trabajar el puesto, con los días de descanso, y no una palabra que vale para cualquier empresa.",
        como_se_comprueba:
          "Comparar el horario escrito en el perfil con la hora de apertura y de cierre del local donde va a trabajar ese puesto. Si lo único que dice es «jornada completa», «horario rotativo» o «según necesidad del servicio», no cumple. Si trae un horario y los locales de la empresa abren a hora distinta, comprobar que es el del local de este puesto. Si el puesto rota, tiene que traer el horario de cada local. Los días de descanso tienen que estar dichos.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "El candidato firma un horario y trabaja otro: la relación arranca con una mentira escrita y el documento no vale nada el día del reclamo. Además es la primera causa por la que alguien se va en las primeras semanas. En el modelo de este cliente la condición dice jornada completa y el único lugar que aparece es una dirección al pie, con más de un local abriendo a hora distinta.",
      },
      {
        exigencia:
          "La remuneración se escribe de una sola forma: o el monto con su moneda y su periodo, o la banda con piso y techo; nunca un monto y «a convenir» en la misma línea.",
        como_se_comprueba:
          "Leer la línea de remuneración. Tiene que traer moneda dicha y periodo —mensual—, y una sola de las dos formas. No cumple si en la misma línea aparecen un monto y «a convenir», «según experiencia» o «según perfil», porque son dos cosas distintas puestas juntas. No cumple si falta el periodo. No cumple si lo que se publicó en el aviso es una cifra distinta de la del perfil firmado.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "El candidato negocia contra una cifra que la empresa no sostiene, y el día de la oferta la conversación empieza de cero con las dos partes molestas. Adentro es peor: nadie sabe qué puede ofrecer sin preguntarle a la dueña, así que cada contratación cuesta una llamada más. En el modelo de este cliente la línea trae el monto y, en la misma oración, «según experiencia y perfil técnico. A convenir».",
      },
      {
        exigencia:
          "El perfil cierra con el bloque de firma del puesto que lo aprueba —nombre, puesto y fecha—, y esa fecha es anterior o igual al día en que salió la convocatoria.",
        como_se_comprueba:
          "Buscar al pie del perfil el bloque de firma con sus tres campos y el puesto que aprueba. Si el bloque no existe, no cumple. Si existe en blanco en un perfil con el que ya se publicó una convocatoria, no cumple. Comparar la fecha de la firma con la fecha del aviso publicado: si la firma es posterior al aviso, no cumple, y se escriben las dos fechas. Si todavía no se publicó convocatoria con ese perfil, basta con que el bloque esté firmado y con fecha.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Sin firma no hay nadie que haya aprobado la búsqueda, y el perfil se vuelve un borrador que cada uno corrige mientras entrevista: así se contrata a la persona que cayó y después se le inventan las funciones. La revisión del procedimiento de selección de esta empresa ya había pedido exactamente esto —prohibir cualquier búsqueda sin perfil formal firmado y agregar la casilla de firma al formato—, y el modelo sigue sin tener ni una línea de firma, así que de ninguno de los perfiles que ya se usaron se puede decir quién lo aprobó.",
      },
      {
        exigencia:
          "El perfil dice cuántas vacantes se abren, en qué local va cada una, hasta qué día se reciben postulaciones y a dónde llegan.",
        como_se_comprueba:
          "Buscar los cuatro datos: número de vacantes, local de cada vacante, fecha de cierre de la convocatoria y el correo o el número al que llegan las postulaciones, escrito. Si falta uno de los cuatro, no cumple. Si la fecha de cierre ya pasó y el aviso sigue publicado, se anota aparte.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "Una convocatoria sin fecha de cierre no se cierra: las hojas de vida siguen llegando por meses a una bandeja que nadie mira, y el que postula nunca sabe si lo descartaron. Sin el local de cada vacante se cita a la gente al local equivocado, y sin un punto de llegada escrito las postulaciones entran por el teléfono personal de quien publicó el aviso.",
      },
      {
        exigencia:
          "Ninguna línea del cuerpo del perfil le habla al que lo redacta: las instrucciones de cómo llenarlo viven en una hoja aparte con su propio título.",
        como_se_comprueba:
          "Recorrer el documento renglón por renglón buscando los que le hablan al redactor y no al candidato ni al jefe: «iniciamos siempre con», «se añade», «se añaden», «se menciona», «aquí va», «frase de cierre». Contar cuántos hay dentro del cuerpo del perfil: uno solo, no cumple, y se escribe en qué sección quedó. La hoja de instrucciones puede existir, pero como anexo separado y titulado.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "El que usa el modelo para una vacante nueva copia también las instrucciones, y el aviso sale a la calle diciéndole al candidato «se añaden las funciones». En el modelo de este cliente hay ocho de esas líneas intercaladas entre el objetivo, las funciones y las condiciones, y el perfil completo cabe en dos hojas: el documento con el que la empresa convoca está hecho casi por mitades de contenido y de instrucción.",
      },
      {
        exigencia:
          "El aviso que se publica no trae adentro los topes de dinero del puesto, las claves o custodias que recibe, el nombre de ninguna persona ni el sueldo de otros puestos; y en el perfil, cada bloque que no pasa al aviso está marcado como de uso interno.",
        como_se_comprueba:
          "Poner al costado el aviso tal como se publicó y el perfil firmado. Buscar en el aviso: tramos de monto que el puesto decide, mención de claves, llaves o del lugar donde se guarda el dinero, nombres de personas, y sueldos de puestos distintos del convocado. Cualquiera de esos dentro del aviso, no cumple, y se escribe cuál. Si todavía no se publicó ningún aviso, lo que se mira es el propio perfil: los bloques de topes, de accesos y custodias y de remuneración tienen que estar marcados de uso interno. Si ninguno lo está, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Publicar hasta cuánto dinero puede mover por su cuenta quien atiende la ventanilla, y en qué dirección trabaja, es entregarle el mapa de la caja a cualquiera que lea un anuncio de trabajo. El perfil y el aviso no son el mismo papel: el aviso se saca del perfil y deja adentro lo que es de uso interno. En el modelo de este cliente la dirección del local va al pie del mismo documento que describe quién maneja el efectivo.",
      },
      {
        exigencia:
          "Todo lo que la empresa quiera exigirle a un postulante y suene a obligación legal va escrito como pregunta al asesor, y no como requisito ya decidido.",
        como_se_comprueba:
          "Revisar que estos aparezcan como consulta pendiente y no como requisito afirmado: antecedentes penales, policiales o judiciales; informe de deudas o reporte crediticio; edad mínima para manejar efectivo de terceros; examen médico; consentimiento del postulante para guardar su hoja de vida y por cuánto tiempo se conserva; modalidad de contratación y periodo de prueba; y los datos que el aviso pide —foto, estado civil, edad—. Cada hallazgo tiene que estar marcado para verificar con asesoría legal y quedar fuera de la entrega hasta que vuelva la respuesta por escrito. Si el perfil fija por su cuenta un plazo, un monto o cita una norma, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Un requisito legal inventado es peor que no decir nada: la empresa empieza a pedirle al postulante cosas que quizá no puede pedirle, y lo descubre cuando alguien reclama. Como el perfil es el papel que se publica, el error no se queda adentro: sale a la calle con el nombre de la empresa encima. Se verifica con el asesor legal y recién después se escribe.",
      },
    ],
    errores_tipicos: [
      "El documento es el modelo y el ejemplo a la vez: las instrucciones de cómo llenarlo quedan intercaladas entre el objetivo, las funciones y las condiciones, y el que copia el modelo las publica.",
      "El perfil describe a quien maneja efectivo todo el día y no trae ninguna cifra de autoridad: ni cuánto decide solo el certificado, ni cuánto el que todavía no lo está.",
      "No hay bloque de firma en ninguna parte, así que de los perfiles que ya se usaron no se puede decir quién aprobó la búsqueda ni qué día.",
      "Falta la línea de mando completa: ni a qué puesto reporta, ni qué puestos tiene a cargo, y el nuevo termina escribiéndole a la dueña por cada duda.",
      "El título junta dos oficios con un guion —cajero y atención al cliente—, y ese nombre compuesto no existe en el organigrama ni en el manual de funciones.",
      "Las competencias conductuales son una lista de adjetivos, incluida una que pide una persona carismática: nadie puede puntuar eso mirando a alguien trabajar.",
      "La remuneración trae un monto y, en la misma oración, «a convenir» y «según experiencia»: tres cosas distintas en una línea.",
      "Las condiciones dicen «jornada completa» y el único lugar que aparece es una dirección al pie, cuando la empresa tiene locales que abren a hora distinta.",
      "Los requisitos no dicen con qué se acreditan: se pide Excel intermedio y manejo de caja, y se comprueban creyéndole al postulante.",
      "La marca de obligatorio o deseable va en el título del bloque y no en cada renglón, así que un bloque entero queda marcado deseable con requisitos adentro que no eran negociables.",
      "Las funciones del perfil son menos que las de la ficha del puesto: el candidato acepta leyendo siete y entra a hacer veinte.",
      "La convocatoria sale sin fecha de cierre y sin punto de llegada escrito: las hojas de vida entran al teléfono personal del que publicó el aviso y nadie las vuelve a mirar.",
    ],
    senales_de_relleno: [
      "Párrafos que describen a la empresa y su propuesta de valor con más renglones que la lista de funciones del puesto.",
      "Una frase de cierre de autoayuda financiera al pie del perfil, que no se puede comprobar ni cambia nada de lo que el candidato va a hacer.",
      "Bloques de «ofrecemos» escritos con lo que cualquier empresa ofrece: ambiente de orden, participación directa, integrarse a una operación estructurada.",
      "Listas simétricas de competencias: siempre la misma cantidad por puesto y las mismas palabras de un puesto a otro cambiando una.",
      "Requisitos copiados de otro aviso del mismo rubro, que piden conocimientos que este puesto no usa ni un día del mes.",
      "Funciones que empiezan con «apoyar en», «velar por» o «participar en»: no dicen qué hace la persona ni dónde queda la constancia.",
      "El mismo requisito escrito dos veces en bloques distintos, una vez como conocimiento y otra como competencia.",
      "Secciones que se pueden copiar y pegar al perfil de cualquier otro puesto de la empresa sin cambiarles una palabra.",
    ],
    que_se_conserva_casi_siempre:
      "Casi siempre se conserva más de lo que parece, y hay que decirlo antes de criticar. El orden de las secciones de este modelo es bueno y no se cambia: puesto, descripción de la empresa, objetivo, funciones, formación y experiencia, conocimientos técnicos, competencias, condiciones y propuesta de valor. El objetivo del puesto, cuando está escrito como en este caso —ejecutar la operación garantizando precisión en el registro, cumplimiento del margen y cuadre diario sin diferencias—, se conserva tal cual: nombra resultados que se pueden constatar y es mejor que el de la mayoría. También se conserva la costumbre de separar los conocimientos obligatorios de los deseables, que ya está a medio camino de lo que la vara pide, y el párrafo corto de empresa, que sirve para que el candidato sepa dónde postula. El trabajo normal es una versión nueva del mismo formato: sacarle las líneas de instrucción a una hoja aparte, agregarle los dos topes en moneda, la línea de mando, el local con su horario, la acreditación de cada requisito, la prueba de oficio con su mínimo, los números con los que se va a medir al ocupante y el bloque de firma. Son horas de trabajo sobre lo que ya hay, no un documento nuevo, y conviene que sea así: la empresa ya convoca con este formato y lo reconoce.",
  },

  procedimiento: {
    clave: "procedimiento",
    tipo: "Procedimiento interno codificado y su ficha de control documental",
    para_que_sirve:
      "Es la pieza suelta del sistema documental: un trabajo que se repite, escrito paso a paso, con su código, su versión, su aprobación y sus registros, de modo que se pueda encontrar, citar desde otro documento y reemplazar por una versión siguiente sin que nadie se quede con la vieja en la mano. Bien hecho resuelve tres cosas: quien ejecuta sabe qué hace y con qué papel queda constancia; quien aprueba sabe qué firmó y desde cuándo rige; y quien audita puede abrir el procedimiento, seguir sus referencias y llegar a los documentos que nombra. Mal hecho es el documento más engañoso de todos, porque la forma está completa —objetivo, alcance, principios, matriz de responsabilidades, flujograma, indicadores, riesgos— y lo que falta es justamente lo que lo hace funcionar: la firma, el código que no choca con otro, la referencia que se puede abrir y el registro del que sale el número.",
    para_quien_es:
      "Tres lectores y tres recorridos, y el documento tiene que decirlo en su primera página. Quien ejecuta lee el desarrollo y el flujograma, y nada más. Quien aprueba lee la ficha de control, los responsables y los indicadores. Quien audita o entrega al cliente lee el control documental, los registros y las referencias. Cuerpo de 8 a 15 páginas, y los formatos aparte, cada uno con su propio código: un procedimiento de veintiséis capítulos con ocho anexos pegados se lee una sola vez, el día que se aprueba, y después nadie lo vuelve a abrir.",
    exigencias: [
      {
        exigencia:
          "El código del documento es el mismo en todas las partes del documento, y el documento dice si ese código ya está asignado o si todavía está propuesto.",
        como_se_comprueba:
          "Listar todos los lugares donde aparece el código: la tabla del encabezado, la ficha de datos, el pie de página, el control de cambios, la tabla de referencias y cada anexo. Compararlos carácter por carácter. Dos códigos distintos en el mismo documento, no cumple, y se escriben los dos con el lugar donde está cada uno. Después leer el rótulo del campo: si un lugar dice «CÓDIGO» y otro dice «CÓDIGO PROPUESTO», no cumple, porque asignado y propuesto son dos estados distintos y el documento está declarando los dos a la vez.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un documento con dos códigos se archiva dos veces y después se busca en vano. En esta familia de procedimientos del cliente, el de contratación lleva en su tabla de encabezado el código del procedimiento vecino mientras su propia ficha declara otro: quien lo archive por el encabezado lo pone encima del disciplinario, y quien lo cite por la ficha cita un documento que en el archivo no está.",
      },
      {
        exigencia:
          "El código y la versión del documento están en una lista maestra de documentos aparte, y todo correlativo que el procedimiento manda usar dice qué puesto lo asigna y dónde queda anotado.",
        como_se_comprueba:
          "Pedir la lista maestra de documentos de la empresa: una fila por documento, con código, nombre, versión, fecha de aprobación, puesto que lo custodia y estado. Buscar en ella la fila de este procedimiento. Si no hay lista maestra, no cumple, y se escribe que hay que abrirla. Después buscar en el documento cada esquema de correlativo que manda usar y verificar que diga el puesto que entrega el número y el registro donde ese número queda anotado. Si lo único que el documento dice sobre los códigos es que se controlan «cuando corresponda», no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Sin una lista aparte, el único lugar donde consta qué código tiene cada documento es el documento mismo, y entonces el choque de códigos no se descubre nunca. Y un correlativo sin dueño se repite: los dos formatos del procedimiento disciplinario de este cliente mandan numerar cada comunicación con un correlativo por año, y lo único que se dice sobre quién lo asigna queda en «cuando corresponda».",
      },
      {
        exigencia:
          "La fecha de validación dice lo mismo en el encabezado que en la ficha de datos: o hay una fecha en los dos lugares, o los dos dicen que está pendiente.",
        como_se_comprueba:
          "Leer el campo de fecha de validación en la tabla del encabezado y el mismo campo en la ficha de datos. Compararlos. Una fecha en un lugar y «pendiente de aprobación» en el otro, no cumple, y se escriben los dos textos tal como están. Comparar después la fecha de elaboración de la ficha con la fecha de la fila del control de cambios y con la fecha de la casilla de elaborado: son tres fechas que deberían ser la misma, y si no lo son, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Es el defecto más repetido de esta familia: dos de los cuatro procedimientos de este cliente traen una fecha de validación en el encabezado y «pendiente de aprobación» en su ficha, en la misma página. El mismo documento dice que rige y que no rige, y el que lo lee elige. Las fechas de elaboración tampoco calzan: la ficha pone una y la casilla de firma pone otra.",
      },
      {
        exigencia:
          "Ninguna casilla de firma queda con el marcador de fecha en blanco; y mientras alguna lo esté, el documento va rotulado como borrador en el encabezado de cada página y no figura como vigente en su lista de distribución.",
        como_se_comprueba:
          "Contar las casillas de revisado, de aprobado y las de los anexos que todavía traigan el marcador de fecha vacío entre corchetes, y las líneas de firma en blanco. Escribir el conteo. Si hay una sola, buscar en el encabezado de cada página la palabra borrador o el rótulo de pendiente de aprobación: si el encabezado se lee como documento vigente, no cumple. Revisar también la lista de distribución controlada, porque un documento con casillas vacías no puede figurar ahí como vigente.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Tres procedimientos de esta familia están bien armados y ninguno está firmado: las casillas de revisado y aprobado siguen con el marcador de fecha vacío desde agosto, y uno de los tres es una acción del plan estratégico que ya venció. Un procedimiento que circula sin firma se cumple a medias: el que lo incumple dice que no estaba aprobado, y tiene razón.",
      },
      {
        exigencia:
          "El documento dice desde qué día rige, cada cuánto se revisa y qué puesto convoca esa revisión; y el control de cambios trae una fila por versión con qué cambió.",
        como_se_comprueba:
          "Buscar tres datos y comprobar que estén los tres: la fecha desde la que rige, que es distinta de la fecha de aprobación; el periodo de revisión; y el puesto que convoca la revisión. Si el documento solo trae fecha de elaboración y fecha de validación, no cumple, porque aprobar no es poner en vigencia. Leer después el control de cambios: una fila por versión, con la sección tocada y qué cambió. Una tabla con una sola fila que dice «emisión inicial» cumple únicamente si el documento sigue en su primera versión.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Aprobar y entrar en vigencia son dos hechos distintos y se confunden todo el tiempo. Sin fecha de vigencia nadie sabe si lo que está leyendo es lo que manda hoy, y sin periodo de revisión el documento envejece en silencio: en este cliente hay un reglamento en su segunda versión, de marzo, y cuatro procedimientos de agosto que lo citan sin decir qué versión miraron.",
      },
      {
        exigencia:
          "Cada documento interno que la tabla de referencias nombra entra con su código, su versión y la fecha de esa versión, y ese documento existe.",
        como_se_comprueba:
          "Recorrer la tabla de referencias fila por fila. Cada fila de un documento interno tiene que traer código, versión y fecha de la versión. Una fila que solo trae el nombre del documento, o que pone la palabra «Interno» en la columna del código, no cumple. Buscar después cada documento referido en la lista maestra o en la carpeta de la empresa: un código que no aparece en ninguna de las dos, no cumple. Se escriben las filas sin código y los códigos que no se encontraron.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Una referencia que no se puede abrir es un hueco con apariencia de orden. Los cuatro procedimientos de este cliente remiten al reglamento interno poniendo «Interno» donde va el código, y el reglamento que la empresa de verdad tiene lleva otro esquema de codificación, otra versión y otra fecha: el que sigue la referencia no sabe si tiene que obedecer ese documento o algún otro.",
      },
      {
        exigencia: "Ningún documento pendiente de aprobación declara aprobado, validado o vigente a otro documento.",
        como_se_comprueba:
          "Leer el estado de aprobación del propio documento en su ficha. Si está pendiente, recorrer sus anexos y sus referencias buscando cualquier frase que declare a otro documento validado, aprobado o vigente, con fecha o sin ella. Una sola, no cumple. Al revés también: si el documento se declara vigente, cada documento que cita como vigente tiene que estar firmado, y basta abrirlo para verlo. Se escribe qué documento declara a qué otro y en qué estado está cada uno.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un documento que nadie aprobó no puede aprobar nada. El procedimiento disciplinario de este cliente dice en su propia ficha que está pendiente de aprobación y en su anexo declara sus dos formatos «validados» con fecha: la validación de esos formatos cuelga de un documento que todavía no tiene firma, así que no existe.",
      },
      {
        exigencia:
          "Cada indicador dice de qué registro sale su numerador y de qué registro sale su denominador, y los dos registros están nombrados en la tabla de registros del propio documento.",
        como_se_comprueba:
          "Tomar los indicadores uno por uno y partir la fórmula en dos: numerador y denominador. Buscar cada mitad en la tabla de registros y evidencias del documento, donde tiene que aparecer con nombre, responsable de generarla y lugar de archivo. Un indicador cuyo denominador obliga a contar algo que hoy nadie cuenta, no cumple. Se escribe el nombre del indicador y cuál de las dos mitades quedó sin registro.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un indicador sin registro no se puede calcular ni el primer mes, y lo que pasa entonces es peor que no medir: alguien pone una cifra a ojo y el tablero queda con un número que nunca se midió. En este cliente un procedimiento mide el porcentaje de compromisos verificados en plazo y el registro de compromisos con su fecha de vencimiento aparece solo como evidencia de control en la tabla de riesgos, sin nombre, sin código y sin custodio; otro apoya el bloque más pesado de la evaluación en un tablero de indicadores por puesto que hoy ninguna sede lleva.",
      },
      {
        exigencia:
          "Cada indicador trae su valor de hoy con la fecha en que se leyó, y el que nunca se midió lo dice con esas palabras; ninguna meta entra sin su valor de partida.",
        como_se_comprueba:
          "Por cada indicador buscar dos cosas al lado de la meta: el valor de hoy y la fecha en que se leyó. Una meta escrita como porcentaje redondo sin valor de hoy, no cumple. Si el indicador nunca se leyó, tiene que decir «no medido», la fecha en que se va a leer por primera vez y el puesto que lo va a leer. Un valor de hoy sin fecha tampoco cumple, porque se escribió sin abrir el registro.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "Lo pide el manual de identidad vigente de este mismo cliente, y por eso se le puede mostrar en su propia página en vez de pedirle que confíe en una regla nuestra: sus ocho principios cierran uno por uno con una línea de medición. Metas al noventa y cinco y al cien por ciento en un procedimiento que todavía no se aplicó ni una vez no son metas: son un deseo, y el mes en que se mida por primera vez nadie va a poder decir si mejoró.",
      },
      {
        exigencia:
          "Todo registro, formato o expediente que el documento nombra en cualquier parte está en su tabla de registros con responsable de generarlo y lugar de archivo; y el que hoy no existe va marcado como por crear, con el puesto que lo abre y la fecha.",
        como_se_comprueba:
          "Recorrer el documento entero —desarrollo, tabla de riesgos, indicadores, control documental y anexos— y anotar cada nombre de registro, formato, expediente o legajo que aparezca. Cruzar esa lista contra la tabla de registros. Un registro nombrado en el cuerpo y ausente de la tabla, no cumple. Un registro en la tabla sin responsable o sin lugar de archivo, no cumple. Y el registro que hoy no existe en ninguna carpeta tiene que llevar escrito que no existe, quién lo abre y cuándo.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un control que se apoya en un registro inexistente es un control escrito, no un control. El procedimiento disciplinario de este cliente nombra un registro maestro de casos como evidencia de su control de trazabilidad; ese registro no aparece en su propia tabla de registros, no tiene código ni custodio y hoy no está en ninguna carpeta. El día que haya que demostrar que un caso se gestionó, no hay dónde buscarlo.",
      },
      {
        exigencia:
          "El alcance nombra los hechos que de verdad ocurren en la operación de la empresa: cada hecho que ya pasó y quedó registrado aparece escrito en el documento con su palabra.",
        como_se_comprueba:
          "Hacer la lista de los hechos que los registros de la empresa ya muestran —faltante de caja, diferencia de arqueo, billete deteriorado, clave o llave compartida, apertura o cierre fuera de hora, operación por encima del tope— y buscar cada palabra en el texto del documento, una por una. Un hecho que ya ocurrió, que está registrado y que el documento no nombra ni una vez, no cumple. Se escribe qué palabras se buscaron y cuáles no aparecieron.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Es el hueco más caro de esta familia: el procedimiento disciplinario de una empresa que mueve efectivo en tres sedes no nombra la palabra faltante ni una sola vez, y hay dos pérdidas de caja registradas, una de ellas terminada en despido con falta de capacitación como causa documentada. El documento regula «incumplimientos» en abstracto y deja afuera el único incumplimiento que ya le costó dinero a la empresa.",
      },
      {
        exigencia:
          "Cada paso del desarrollo tiene sujeto: un puesto que existe en el organigrama con el mismo nombre; y la matriz de responsabilidades no deja ninguna actividad sin quien la ejecuta.",
        como_se_comprueba:
          "Recorrer los pasos numerados del desarrollo y marcar los que están escritos en impersonal, del tipo «se verifica» o «se deben recopilar»: cada uno de esos, no cumple, y se escribe su número. Tomar después la matriz de responsabilidades y comprobar dos cosas: que cada fila tenga a alguien marcado como quien ejecuta, y que cada columna sea un puesto con ficha en el manual de funciones, con el mismo nombre. Las abreviaturas de cargo tienen que estar escritas completas la primera vez que aparecen.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El cuarto principio del manual de identidad vigente pide que los procesos importantes tengan responsable, control y registro: lo pide su propio manual, no nosotros. Un paso sin sujeto lo acaba haciendo el dueño. Y en este cliente el único cargo que estos procedimientos nombran para casi todo es el de quien administra, que ya carga treinta acciones del plan estratégico sin empezar, siete de ellas vencidas.",
      },
      {
        exigencia:
          "Si el documento trae flujograma, cada paso numerado del desarrollo aparece en él y cada caja del flujograma corresponde a un paso del desarrollo, con las mismas bifurcaciones.",
        como_se_comprueba:
          "Poner al lado la lista de pasos numerados del desarrollo y las cajas del flujograma, y cruzarlas en los dos sentidos. Un paso del desarrollo que no aparece en el flujograma, no cumple, y se escribe su número. Una caja del flujograma que no corresponde a ningún paso, no cumple, y se escribe su texto. Contar después las bifurcaciones: cada punto donde el desarrollo abre dos caminos —se aprueba o no se aprueba, hay evidencia o no la hay— tiene que aparecer como rombo en el flujograma. Un flujograma de una sola columna recta cuando el desarrollo tiene decisiones, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "El flujograma es lo único que alguien abre cuando tiene el caso encima y no tiene tiempo de leer el documento entero, así que en la práctica es el que manda. Si le falta un paso, ese paso no se hace; y si no tiene los rombos, el que ejecuta no sabe qué ocurre cuando la respuesta es no. En los procedimientos de este cliente el flujograma es la lista de títulos de los pasos puesta en vertical con flechas, así que las decisiones del desarrollo no aparecen en ninguna parte y la bifurcación se resuelve preguntándole al dueño.",
      },
      {
        exigencia:
          "El procedimiento no fija por su cuenta un plazo, un monto ni el número de un artículo de norma: separa en dos columnas el tiempo interno que la empresa decide y el plazo que viene de una norma, y lo segundo queda marcado para verificar con asesoría legal antes de aplicarse.",
        como_se_comprueba:
          "Tomar la tabla de tiempos del documento y partirla en dos columnas: tiempo interno de gestión, que la empresa fija y puede cambiar, y plazo exigido por una norma, que no. Toda fila de la segunda columna tiene que traer su fuente escrita y la marca de que se verifica con asesoría legal antes de aplicarse. Si las dos clases de tiempo están mezcladas en la misma columna y con el mismo peso, no cumple. Buscar además en todo el texto las cifras pegadas a las palabras días, horas, meses, naturales y hábiles, y los números de artículo citados sin fuente: cada hallazgo sin fuente y sin la marca, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "En esta familia las dos clases de tiempo están en la misma tabla y con el mismo peso: el aviso previo que el documento atribuye a la norma, el tiempo interno para cerrar un tablero mensual y la orientación de una autoridad, todo bajo un mismo título de tiempo objetivo. El tiempo interno lo puede cambiar la Gerencia mañana; el de la norma no, y si está mal escrito lo paga la empresa, no la consultora. Verificar con asesoría legal.",
      },
      {
        exigencia:
          "Toda afirmación del documento que venga de una norma o de un pronunciamiento de autoridad remite a una fuente con nombre y fecha de consulta, y la lista completa de fuentes va al asesor para que confirme que siguen vigentes antes de entregar.",
        como_se_comprueba:
          "Listar cada afirmación del documento que empiece nombrando una norma o una autoridad. Cada una tiene que remitir a una fuente con nombre completo, fecha de publicación y fecha en que se consultó, y esa lista de fuentes tiene que estar al final del documento. Una afirmación legal sin fuente, no cumple. Una fuente citada sin fecha de consulta, no cumple. La lista entera se entrega al asesor legal para que diga qué sigue vigente, y mientras no vuelva su respuesta por escrito el documento no se entrega como definitivo.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Uno de los cuatro procedimientos de este cliente sí cierra con su lista de fuentes oficiales y eso se conserva tal cual; los otros tres afirman cosas del mismo tenor sin fuente ninguna. Una norma cambia y nadie se entera: la fecha de consulta es lo único que después permite saber qué hay que volver a mirar. Verificar con asesoría legal.",
      },
      {
        exigencia:
          "Cada formato anexo lista qué datos de la persona recoge, qué puesto custodia el expediente donde quedan, qué puestos pueden abrirlo y por cuánto tiempo se conservan, y los cuatro puntos quedan marcados para verificar con asesoría legal.",
        como_se_comprueba:
          "Abrir cada formato anexo y escribir la lista de datos de la persona que pide: nombre, documento de identidad, puesto, sede, hechos, evidencias, resultados de evaluación. Buscar después en el documento, por cada formato, qué puesto custodia el expediente, qué puestos pueden abrirlo y por cuánto tiempo se conserva. Si el documento remite el periodo de conservación a una política interna de archivo y esa política no existe por escrito, no cumple. Los cuatro puntos van marcados para verificar con asesoría legal.",
        origen: "obligacion_a_verificar",
        obligatoria: false,
        por_que:
          "Estos expedientes guardan hechos, evidencias y notas de desempeño de personas con nombre y apellido, y el propio documento manda limitar el acceso sin decir a qué puestos. En este cliente el periodo de conservación se remite a una política interna de archivo que no está escrita, así que en la práctica no hay periodo. Qué se puede recoger, quién puede leerlo y cuánto se guarda no lo decide la consultora: verificar con asesoría legal.",
      },
      {
        exigencia:
          "La lista de verificación del cierre tiene una casilla por cada paso del procedimiento que produce un documento, una firma o un registro, y ninguna casilla pide algo que el procedimiento no mandó.",
        como_se_comprueba:
          "Poner al lado la lista de pasos numerados del desarrollo y la lista de casillas del cierre. Cruzarlas en los dos sentidos. Un paso que produce documento, firma o registro y no tiene casilla, no cumple. Una casilla que pide algo que ningún paso ordenó, no cumple. Se escriben los números de los pasos sin casilla y el texto de las casillas sin paso.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "La lista de cierre es lo que permite verificar un caso sin volver a leer el procedimiento entero, y por eso se conserva siempre que existe. Con menos casillas que pasos, un caso se cierra con un hueco; con más casillas que pasos, se le pide a quien cierra algo que nadie le enseñó, y a la tercera vez deja de usar la lista.",
      },
    ],
    errores_tipicos: [
      "El código del encabezado y el código de la ficha son distintos: uno de los procedimientos de esta familia lleva arriba el código de su vecino, así que se archiva encima de otro documento.",
      "La misma página dice que el documento fue validado en una fecha y que está pendiente de aprobación: una cosa en la tabla del encabezado y la otra en la ficha de datos.",
      "Las casillas de revisado y aprobado siguen con el marcador de fecha entre corchetes meses después de la elaboración, y el documento igual circula como si rigiera.",
      "No hay fecha de vigencia: están la de elaboración y la de validación, y nadie puede decir desde qué día lo escrito manda.",
      "El control de cambios tiene una sola fila que dice «emisión inicial» y el documento ya fue corregido sin que la tabla registre nada.",
      "Las referencias nombran documentos sin código ni versión, y uno de ellos existe de verdad pero con otro esquema de codificación y otra versión que el procedimiento no dice.",
      "El documento está pendiente de aprobación y en su propio anexo declara sus formatos «validados» con fecha.",
      "Indicadores con meta redonda —noventa y cinco por ciento, cien por ciento— sin un solo valor de hoy, en un procedimiento que todavía no se aplicó ni una vez.",
      "El denominador del indicador obliga a contar algo que nadie cuenta: compromisos vencidos, planes cerrados, puestos comparables en una empresa donde no hay dos puestos iguales.",
      "Registros nombrados en la tabla de riesgos que no aparecen en la tabla de registros del mismo documento, sin código, sin custodio y sin existir en ninguna carpeta.",
      "El desarrollo está escrito en impersonal de principio a fin —«se verifica», «se deben recopilar»— y los cargos aparecen abreviados sin que el documento diga una sola vez qué significan.",
      "Un procedimiento disciplinario para una empresa de efectivo que no nombra el faltante de caja ni una vez, mientras hay dos pérdidas registradas y una terminó en despido.",
    ],
    senales_de_relleno: [
      "Capítulos de objetivo, alcance, principios y terminología que ocupan más páginas que el desarrollo del procedimiento.",
      "Listas de principios de nueve o diez entradas, todas del mismo largo, que no cambian un solo paso del desarrollo.",
      "Un glosario que define palabras que el documento usa una sola vez, o que explica lo que cualquiera entiende sin glosario.",
      "El flujograma es la lista de títulos de los pasos puesta en vertical con flechas: no agrega ni un responsable, ni un tiempo, ni una bifurcación.",
      "Tablas de riesgos y controles donde la columna de evidencia nombra registros que no existen en ninguna otra parte del documento.",
      "La misma instrucción escrita en el desarrollo, repetida en los principios y repetida otra vez en la lista de cierre, con tres redacciones distintas.",
      "Matriz de responsabilidades perfectamente simétrica, con una letra en cada casilla, donde una misma área autoriza y ejecuta casi todas las filas.",
      "Anexos que son formatos con todos sus campos entre corchetes y sin una línea que diga quién los llena, en qué momento y dónde quedan después.",
      "Menciones a un enfoque o a una norma de gestión en la tabla de referencias que no cambian ni un paso ni un control concreto del documento.",
    ],
    que_se_conserva_casi_siempre:
      "Casi nunca hay que rehacer estos documentos, y hay que decirlo antes de criticar nada: la familia de procedimientos de este cliente está bien armada y lo que le falta es firma, no estructura. Se conserva el esqueleto completo —objetivo, alcance, referencias, principios, terminología, responsables con su matriz, desarrollo paso a paso, flujograma, registros, indicadores, riesgos y controles, control documental y cierre con lista de verificación—, que es mejor que el de la mayoría de las empresas de este tamaño y no se toca. Se conserva el esquema de codificación que la empresa ya usa, con su prefijo y su correlativo, porque ya hay un sistema documental y no hay que inventarle otro; los criterios de redacción institucional, que son la pieza más valiosa y la que nadie copia de una plantilla; la matriz de responsabilidades; la lista de verificación del cierre; y la lista de fuentes oficiales con su fecha, allí donde existe. El trabajo normal es la versión siguiente: cerrar el código, cuadrar las fechas, conseguir las firmas, ponerle código y versión a cada referencia, nombrar los registros que faltan, darle a cada indicador el registro de donde sale y su valor de hoy, y escribir en el alcance los hechos de la operación que el documento todavía no nombra. Son días de trabajo sobre lo que ya hay, no meses de documento nuevo.",
  },

  seguimiento: {
    clave: "seguimiento",
    tipo: "Matriz de seguimiento y control de actividades del plan",
    para_que_sirve:
      "Es el documento con el que la empresa sabe, cualquier lunes, qué de lo que decidió está hecho, qué está atrasado y qué está detenido esperando una decisión. Bien hecho resuelve tres cosas que hoy cuestan dinero: que un plan aprobado se detenga sin que nadie lo note hasta el trimestre siguiente; que el dueño se entere de un atraso cuando ya no se puede recuperar; y que la discusión sobre si algo avanzó se resuelva mirando una evidencia archivada en lugar de escuchando a quien la tenía a cargo. Es además la pieza que convierte un plan en trabajo: sin ella, el plan es una intención con fechas y nadie responde por ninguna.",
    para_quien_es:
      "Lo llena el puesto que administra y lo lee la Gerencia; cada responsable lee solo sus filas. Son dos piezas de largo distinto: la matriz completa, de una a dos páginas por bloque temático —treinta actividades caben en cinco páginas—, y una sola hoja por semana con las filas que se movieron, las atrasadas —las vencidas y las que debieron empezar y no empezaron— y las decisiones que se le piden a la Gerencia. Un documento de seguimiento de más de 15 páginas no se actualiza nunca: se archiva.",
    exigencias: [
      {
        exigencia:
          "Las fechas que la matriz exige están aprobadas: el documento dice qué día se aprobaron, qué puesto las firmó, y cierra con el bloque de firma.",
        como_se_comprueba:
          "Buscar en el documento el bloque de aprobación con tres datos: el día, el puesto que aprueba y la firma. Si falta cualquiera de los tres, no cumple, y se escribe cuántas filas quedan exigiendo una fecha que nadie aprobó. Después abrir el plan del que salen las fechas y buscar si se declara a sí mismo una propuesta —la frase «son propuestas de gestión y deben aprobarse formalmente», o equivalente—: si también se declara propuesta, se anota que ni el plan ni la matriz tienen con qué exigirle una fecha a nadie.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Una matriz que exige fechas que nadie aprobó no sirve para pedirle cuentas a nadie: el primer responsable al que se le reclame va a contestar que esa fecha era una propuesta, y va a tener razón. Es el caso exacto de este cliente: treinta filas con fecha de agosto y setiembre, el plan del que salen diciendo de sí mismo que sus fechas deben aprobarse formalmente, y ningún bloque de firma en ninguno de los dos documentos.",
      },
      {
        exigencia:
          "El documento declara el día en que se tomó la foto, y toda fila cuya fecha de fin es anterior a ese día aparece marcada como vencida.",
        como_se_comprueba:
          "Buscar la fecha de corte en la cabecera o al pie. Después comparar fila por fila la fecha de fin contra esa fecha de corte: cada fila con fecha de fin anterior tiene que estar marcada como vencida o traer su reprogramación aprobada. Se cuentan las filas vencidas sin marca y se escribe el número. Si la fecha de corte no existe, no cumple y no hace falta seguir contando.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Sin fecha de corte nadie sabe si la foto es de esta semana o del mes pasado. Y una matriz que no distingue lo vencido de lo que todavía tiene plazo deja de ser un control: se lee igual de tranquila el día antes y el día después del incumplimiento. En la matriz de este cliente todas las filas con fecha de agosto y setiembre figuran como «No iniciado» y ninguna aparece marcada como vencida.",
      },
      {
        exigencia:
          "Cada fila trae su fecha de inicio además de la de fin, y toda fila que sigue sin empezar con la fecha de inicio ya pasada aparece marcada como atrasada en el arranque.",
        como_se_comprueba:
          "Buscar en la matriz la columna de fecha de inicio. Si no existe, no cumple y se dice que el atraso solo se va a poder ver el día del vencimiento. Si existe, comparar fila por fila esa fecha contra la fecha de corte y cruzarla con el estado: toda fila cuyo inicio ya pasó y sigue en el estado de no empezada tiene que estar marcada como atrasada en el arranque o traer su reprogramación aprobada. Se cuentan esas filas y se escribe el número.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una matriz que solo guarda la fecha de fin no avisa nada hasta el día del vencimiento, y ese día ya no hay nada que recuperar. El atraso se ve antes en el arranque que en la entrega: una actividad que debió empezar hace un mes y sigue sin empezar ya está perdida aunque su fecha de fin sea de diciembre. En la matriz de este cliente no existe la columna de inicio, así que nada distingue la fila que recién arranca de la que lleva meses detenida: las treinta se leen igual.",
      },
      {
        exigencia: "Cada fila dice el día en que su estado se actualizó por última vez y qué puesto lo actualizó.",
        como_se_comprueba:
          "Buscar en la matriz las dos columnas: fecha de actualización y puesto que actualiza. Recorrer las filas y contar las que traen estado escrito y les falta una de las dos. Una sola fila con estado y sin fecha de actualización, no cumple. Si el documento solo dice que el estado «debe actualizarse semanalmente» y no existe la columna donde anotar cuándo se actualizó, tampoco cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un estado sin fecha no se puede creer ni desmentir: el mismo «No iniciado» puede ser de hoy o de hace tres meses, y nadie puede probar que la matriz se miró. Es lo único que separa un tablero vivo de una foto vieja que se sigue repartiendo en las reuniones.",
      },
      {
        exigencia:
          "La lista de estados es cerrada, cada estado trae el hecho que hay que ver para ponerlo, y ningún valor usado en la columna de estado queda fuera de la lista.",
        como_se_comprueba:
          "Listar los estados definidos en el documento y listar aparte los valores que de verdad aparecen escritos en la columna de estado. Cruzarlos: un valor usado que no está definido, no cumple. Después leer cada definición: tiene que decir qué hecho observable autoriza ese estado —un acta firmada, un registro abierto con filas escritas, un entregable enviado a revisión, una validación recibida—. Una definición que repite el nombre del estado con otras palabras, no cumple.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Si «En curso» no dice qué hay que ver para ponerlo, cada responsable lo pone cuando siente que avanzó y la columna deja de comparar nada. Este cliente ya tiene seis estados bien nombrados; lo que falta es el hecho que autoriza cada salto, que es lo único que evita que una actividad viva meses «En curso» sin que nadie pueda decir que está detenida.",
      },
      {
        exigencia: "Cada fila tiene un solo responsable, y es un puesto: no un área, no dos puestos unidos.",
        como_se_comprueba:
          "Leer la casilla de responsable de cada fila. No cumple si trae dos nombres unidos por «+» o por «/», si nombra un área en lugar de un puesto («RR. HH.», «Tecnología», «Operaciones», «Comercial») o si dice «responsable designado» sin nombrarlo. Se escribe el número de filas con responsable compartido y la lista de las áreas que aparecen en lugar de un puesto.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "Es el cuarto principio del manual de identidad vigente de este cliente: los procesos importantes tienen responsable, control y registro. Lo pide su propio manual, no nosotros. Y una fila con dos responsables no tiene ninguno: el día que vence, cada uno muestra la matriz y señala al otro. En la matriz de este cliente casi todas las filas llevan dos nombres unidos con un signo más.",
      },
      {
        exigencia:
          "Toda fila cuyo responsable es un puesto vacante dice qué puesto la cubre mientras tanto y qué hecho termina esa cobertura.",
        como_se_comprueba:
          "Poner al costado la lista de puestos que hoy están ocupados. Marcar las filas cuyo responsable no esté en esa lista. Cada fila marcada tiene que traer el puesto que la cubre y el hecho que termina la cobertura: la contratación, el día de ingreso o la firma de la ficha del puesto nuevo. Una fila con responsable vacante y sin puesto que la cubra, no cumple. Si la lista de puestos ocupados no está al costado, la exigencia queda abierta, no se marca cumple, y se dice así en la entrega.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una actividad encargada a un puesto que no existe no la hace nadie y nadie lo nota, porque la fila se ve igual de ordenada que las demás. En la matriz de este cliente hay filas a cargo de recursos humanos y de tecnología en una empresa que no tiene ninguna de las dos áreas: esas actividades estaban asignadas a nadie desde el día en que se escribió el documento.",
      },
      {
        exigencia: "Cada meta dice de qué se calcula: qué se cuenta arriba, qué se cuenta abajo y en qué unidad queda el resultado.",
        como_se_comprueba:
          "Leer la columna de meta fila por fila. Un «100%» sin decir cien por ciento de qué, no cumple. Un «Sí» como meta, no cumple. Sí cumplen las metas que nombran lo que se cuenta: «una por sede y por mes», «tres sedes de tres», «todos los legajos del personal activo». Se escribe la lista de filas cuya meta no se puede contar el día del cierre.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Una meta que no se puede contar se cierra por cansancio: el responsable dice que ya está y nadie puede mostrar lo contrario. Y un «100%» repetido en casi todas las filas deja de informar: tapa la diferencia entre una actividad que se cierra una vez y otra que hay que cerrar en tres locales.",
      },
      {
        exigencia:
          "Cada fila nombra la evidencia con la que se va a cerrar y dónde queda archivada, con el nombre del archivo, de la carpeta o del sistema.",
        como_se_comprueba:
          "Recorrer la columna de evidencia: cada fila tiene que nombrar el entregable y además el lugar donde queda guardado. Una evidencia nombrada sin lugar de archivo, no cumple. «Según corresponda», «la documentación respectiva» y «referencia» tampoco cumplen. Se escribe cuántas filas nombran evidencia sin decir dónde se guarda.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El estándar de la casa es que todo enunciado lleve su medición y su registro. Una evidencia sin lugar de archivo no se encuentra el día de la revisión, y entonces la actividad se cierra con la palabra de quien la tenía a cargo. En este cliente la matriz nombra bien la evidencia de cada fila y no dice en ninguna dónde se guarda, así que el mes que viene habrá que buscarla preguntando de escritorio en escritorio.",
      },
      {
        exigencia:
          "Ninguna fila se cierra con un documento solo: cada una dice qué hecho de aplicación hay que ver además del entregable.",
        como_se_comprueba:
          "Recorrer la columna de evidencia fila por fila: cada fila tiene que traer, además del entregable, el hecho de aplicación que se mira —el registro en uso con filas escritas, la persona capacitada operando sola, el acceso retirado—. Una fila cuya única evidencia es un documento, no cumple, y se escribe la lista de esas filas. Después buscar si el documento trae escrita la regla de que una acción no se cierra solo porque exista un documento: si la trae y la columna de evidencia la contradice, se anota que la regla buena ya está escrita y no tiene dónde cumplirse.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un procedimiento aprobado y guardado no cambió nada todavía: la empresa paga por el cambio, no por el archivo. Este cliente ya escribió la regla buena —una acción no se cierra solo porque exista un documento— y en la misma matriz la contradice: las evidencias de cierre que lista son todas documentos firmados. Una regla sin la columna que la sostenga no se aplica nunca.",
      },
      {
        exigencia:
          "Cada indicador se puede calcular el día del cierre: trae lo que se cuenta arriba y abajo, de dónde se lee cada número, qué puesto lo calcula y qué se reporta cuando abajo no hay nada que contar.",
        como_se_comprueba:
          "Tomar cada indicador y hacer la cuenta con la matriz delante. Comprobar cuatro cosas: que el numerador y el denominador se puedan contar en la propia matriz; que esté escrito de qué columna, registro o sistema sale cada número; que esté nombrado el puesto que lo calcula; y que esté dicho qué se reporta cuando el denominador queda en cero. Una fórmula que no se puede completar con la matriz delante, no cumple, y se escribe cuál de las cuatro piezas faltó.",
        origen: "metodo_renaser",
        obligatoria: true,
        por_que:
          "Un indicador que no se puede calcular se reporta igual, a ojo, y el reporte parece medición. En este cliente el cumplimiento a tiempo se define como las acciones cerradas dentro de fecha divididas entre las acciones vencidas: el día que todo se cierre a tiempo el denominador queda en cero y la cuenta no se puede hacer, y mientras nada se cierre el resultado es cero por una división que no mide lo que el indicador promete.",
      },
      {
        exigencia:
          "Ningún objetivo de indicador queda escrito como sugerencia: cada uno está aprobado, o está marcado como pendiente de aprobación con la fecha en que se decide.",
        como_se_comprueba:
          "Buscar en la columna de objetivo las palabras «sugerido», «recomendado», «deseable» y «condición deseada». Cada aparición tiene que convertirse en un objetivo aprobado con su fecha de aprobación, o quedar marcada como pendiente de aprobación con el día en que la Gerencia lo decide. Un objetivo sugerido sin fecha de decisión, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Un objetivo sugerido no se incumple nunca, porque nadie se comprometió con él: el mes que el cumplimiento baje, la respuesta va a ser que ese número era una recomendación. En este cliente los cinco indicadores están bien construidos y sus objetivos están escritos como sugerencia o como condición deseada, así que ninguno obliga a nada.",
      },
      {
        exigencia:
          "Toda fila reprogramada guarda en la propia fila la fecha anterior, la fecha nueva, la causa y el puesto que la aprobó.",
        como_se_comprueba:
          "Buscar las cuatro casillas de reprogramación dentro de la fila, no en el párrafo de reglas: fecha anterior, fecha nueva, causa y puesto que aprueba. Si el documento trae la regla escrita y la matriz no tiene dónde anotar esos cuatro datos, no cumple. Si existe una versión anterior de la matriz, se comparan las fechas de fin de las dos y se escribe cuántas se movieron sin dejar la fecha anterior escrita en su propia fila.",
        origen: "practica_de_excelencia",
        obligatoria: true,
        por_que:
          "Una fecha que se mueve sin dejar la anterior escrita borra el atraso: la matriz se ve cumplida mientras el plan entero se va corriendo, y al cierre del año nadie puede decir cuánto se movió ni por qué. Este cliente ya tiene la regla —ninguna fecha se modifica sin registrar causa y aprobación— y no tiene la columna donde escribirla, así que la regla no se puede cumplir aunque todos quieran cumplirla.",
      },
      {
        exigencia:
          "El escalamiento dice a qué puesto se avisa, por qué canal, en cuánto tiempo y dónde queda anotado el bloqueo con su salida.",
        como_se_comprueba:
          "Buscar las cuatro piezas del escalamiento: el puesto al que se avisa, el canal, el plazo y el registro donde queda el bloqueo con la fecha en que se destrabó. «Elevar a Gerencia» sin canal ni registro, no cumple. Si el documento fija el plazo y no nombra el registro, tampoco cumple: se escribe cuál de las cuatro piezas falta.",
        origen: "manual_vigente",
        obligatoria: true,
        por_que:
          "El estándar de la casa pide que todo lo importante tenga responsable, control y registro, y separa el error del incumplimiento deliberado: eso solo se puede aplicar si el bloqueo quedó anotado. Sin registro, la tercera vez que la misma dependencia detiene el plan nadie puede probar que ya había pasado, y el atraso se explica de nuevo como si fuera la primera vez.",
      },
      {
        exigencia:
          "Las filas cuyo cierre depende de una exigencia de norma van listadas aparte y marcadas para verificar con el especialista o con asesoría legal, y la matriz no fija por su cuenta ningún plazo, monto ni artículo.",
        como_se_comprueba:
          "Buscar las filas que toquen legajos del personal, seguridad y salud en el trabajo, jornada y descuentos, datos de clientes, contratos con proveedores y conservación de archivos. Cada una tiene que estar en la lista aparte, con la marca de que se verifica con el especialista o con asesoría legal, y con la nota de que no se cierra hasta que esa respuesta esté por escrito. Si la matriz afirma por su cuenta un plazo, un monto, un porcentaje o un artículo de norma, no cumple.",
        origen: "obligacion_a_verificar",
        obligatoria: true,
        por_que:
          "Una fila cerrada sin la validación que la norma pide deja a la empresa creyendo que cumplió, y el costo lo paga ella, no la consultora. Este cliente ya escribió bien la mitad: dice que las acciones que requieren validación especializada solo se cierran cuando esa validación existe. Lo que falta es la lista separada de cuáles son, y que ninguna cifra legal se afirme sin verificar antes con asesoría legal.",
      },
      {
        exigencia: "El documento dice cuántas acciones del plan quedan fuera de la matriz y en qué documento se les sigue el rastro.",
        como_se_comprueba:
          "Contar las filas de la matriz y compararlas con el total de acciones del plan que la propia matriz declara seguir. Si la matriz cubre menos, tiene que decir cuántas quedan fuera y nombrar el documento o el puesto que las sigue. Una matriz que declara el total y no dice dónde está el resto, no cumple.",
        origen: "metodo_renaser",
        obligatoria: false,
        por_que:
          "La mitad de un plan sin dueño documental se detiene sin que nadie lo note, y la revisión mensual da verde porque solo mira lo que la matriz trae. En este cliente la matriz dice con claridad que sigue las acciones donde participa quien administra, y no dice dónde se siguen las demás, que son casi la mitad del plan.",
      },
      {
        exigencia:
          "Las filas recurrentes se miden por frecuencia cumplida: traen el periodo, cuántas veces va en el periodo y el estado del periodo en curso, no un estado único hasta el final del plan.",
        como_se_comprueba:
          "Marcar las filas cuya meta es una frecuencia: «una por semana», «dos por sede y por mes», «cuatro por año». Cada una tiene que traer el periodo que se está midiendo y el conteo de ese periodo. Una fila recurrente con una sola fecha de fin a años de distancia y un estado único para todo ese tiempo, no cumple.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "Una reunión semanal que se mide con una sola fecha de fin a dos años vista no se puede incumplir hasta el último día, y por eso se deja de hacer el primer mes. En la matriz de este cliente la reunión ejecutiva semanal y las auditorías de caja comparten columna y estado con actividades que se cierran una sola vez.",
      },
      {
        exigencia:
          "Las filas que se cierran en cada local por separado llevan el avance local por local, y el cierre exige que estén todos los locales que la empresa tiene abiertos.",
        como_se_comprueba:
          "Poner al costado la lista de locales que la empresa tiene abiertos. Marcar las filas cuyo trabajo ocurre en cada local: inducción, auditorías de caja, pendientes de seguridad y salud, accesos, inventario. Cada una tiene que traer una casilla por cada local de esa lista y decir que el cierre exige que estén todas llenas. Una fila de trabajo por local con un solo estado para toda la empresa, no cumple, y se escribe en cuántos locales quedó sin instalar.",
        origen: "practica_de_excelencia",
        obligatoria: false,
        por_que:
          "Una mejora instalada en el local principal se reporta como cerrada para toda la empresa, y los otros dos siguen igual hasta que algo falla ahí. Este cliente tiene tres locales y su propia guía de seguimiento ya pide revisar la consistencia entre ellos; la matriz, en cambio, cierra casi todo con un «100%» que no dice en cuál.",
      },
    ],
    errores_tipicos: [
      "Todas las filas en «No iniciado» con fechas de fin ya pasadas, y ninguna marcada como vencida: la matriz se lee igual de tranquila el día antes y el día después del incumplimiento.",
      "Las fechas salen de un plan que se declara propuesta de gestión y la matriz las exige como compromisos, sin que exista en ninguno de los dos documentos un bloque de firma.",
      "El responsable de cada fila son dos puestos unidos con un signo más, o es un área: recursos humanos, tecnología, operaciones, comercial.",
      "Filas a cargo de un área que la empresa no tiene, así que la actividad quedó asignada a nadie desde el día en que se escribió el documento.",
      "«100%» repetido en la columna de meta de casi todas las filas, sin decir cien por ciento de qué, y «Sí» como meta en otra.",
      "La evidencia de cierre está bien nombrada en todas las filas y en ninguna se dice dónde queda archivada.",
      "La regla de cierre dice que un documento no basta, y la columna de evidencia pide puros documentos firmados.",
      "Un indicador cuya fórmula no se puede completar: el denominador queda en cero justo cuando la empresa va bien.",
      "Los objetivos de los indicadores escritos como «objetivo sugerido» o «condición deseada», así que ninguno obliga a nada.",
      "La regla de que toda reprogramación registra causa y aprobación existe, y la matriz no tiene las columnas donde escribirla.",
      "Actividades recurrentes de años mezcladas con actividades que se cierran una sola vez, en la misma columna y con el mismo estado único.",
      "El documento manda actualizar el estado cada semana y no trae ninguna columna donde anotar qué día se actualizó ni quién lo hizo.",
    ],
    senales_de_relleno: [
      "Una columna de estado con el mismo valor en todas las filas: si nada se mueve, lo que hay es una lista de deseos con forma de tablero.",
      "Párrafos que explican qué es el seguimiento y por qué importa controlar, en lugar de decir quién mira qué el lunes.",
      "Formatos de reporte con las casillas vacías y las instrucciones entre corchetes, repetidos varias veces para dar cuerpo.",
      "El objetivo del documento y la función del responsable contados dos veces con otras palabras en secciones distintas.",
      "Metas perfectamente parejas: todas las filas al cien por ciento, sin una sola que diga cuántas veces ni en cuántos locales.",
      "Indicadores que exigen un registro que la empresa no tiene abierto hoy, así que se van a reportar de memoria.",
      "Frases que no se pueden comprobar: «mantener trazabilidad», «asegurar el cumplimiento», «velar por el avance».",
      "La matriz copia las columnas del plan y no agrega ninguna propia: entonces no es un control, es el plan otra vez.",
    ],
    que_se_conserva_casi_siempre:
      "Casi siempre se conserva el tablero y se corrige lo que lo hace exigible, y esto hay que decirlo antes de criticar nada. Se conservan: la estructura de la matriz por bloques temáticos —gobierno, personas, operación, tecnología, comercial, proveedores—, con una fila por acción y su código, que es lo que permite nombrar una actividad en una reunión sin tener que describirla; los códigos mismos, porque ya existe un sistema de numeración y no hay que inventar otro; la lista de estados, que suele estar bien nombrada y solo necesita que cada uno diga qué hecho lo autoriza; las fórmulas de los indicadores, que se corrigen en una línea y no se rehacen; el formato del reporte semanal y el del cierre mensual; el tope de decisiones que se le llevan a la Gerencia por semana, que es una buena costumbre que casi nadie escribe; y la regla de que una acción no se cierra solo porque exista un documento, que es la mejor frase del documento y la que hay que bajar a la columna de evidencia. El trabajo normal es la versión siguiente de la misma matriz —fecha de corte, bloque de vencidas, un responsable por fila, metas contables, lugar de archivo de la evidencia, columnas de reprogramación y bloque de firma—, no un tablero nuevo. Rehacerlo desde cero tira el único inventario completo de las actividades del plan que la empresa tiene.",
  },
};

export const CLAVES_VARA = Object.keys(VARAS);

/** La vara de un tipo de documento. Sin vara no se mide: mejorar sin vara es opinar. */
export function vara(clave: string): Vara {
  const v = VARAS[clave];
  if (!v) throw new Error(`No existe la vara «${clave}». Las que hay: ${CLAVES_VARA.join(", ")}.`);
  return v;
}

/** Lo que NO se entrega si falta. Es el corte entre «se entrega con observaciones» y «no se entrega». */
export function obligatorias(clave: string): Exigencia[] {
  return vara(clave).exigencias.filter((e) => e.obligatoria);
}

/** Las que hay que llevarle al asesor legal antes de entregar el documento. */
export function paraAsesorLegal(clave: string): Exigencia[] {
  return vara(clave).exigencias.filter((e) => e.origen === "obligacion_a_verificar");
}
