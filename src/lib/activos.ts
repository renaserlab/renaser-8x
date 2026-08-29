/**
 * LEVANTAMIENTO GUIADO de información empresarial — la mirada de un consultor que está
 * conociendo la empresa. Primero entender cómo funciona (documentos si existen, y si no,
 * que lo CUENTEN); construir y sistematizar viene después, con lo levantado.
 *
 * IMPORTANTE: el cliente nunca ve la metodología interna (personas/procesos/producto/marketing).
 * Las claves internas se conservan para el motor; los nombres visibles hablan de SU empresa.
 */

export type ActivoDef = {
  clave: string;
  nombre: string;
  ayuda: string;
  /** Preguntas de levantamiento: cómo funciona esto HOY, respondibles hablando. */
  preguntas: string[];
  /** Estructura sugerida cuando más adelante se construya el documento (constructor). */
  estructura?: string;
};
export type BloqueActivos = { clave: string; nombre: string; intro: string; activos: ActivoDef[] };

export const BLOQUES_ACTIVOS: BloqueActivos[] = [
  {
    clave: "personas",
    nombre: "Tu equipo",
    intro: "Quiénes son, qué hace cada uno, cómo entra y crece la gente.",
    activos: [
      {
        clave: "organigrama",
        nombre: "Cómo está organizado el equipo",
        ayuda: "Si tienes un organigrama —aunque sea una foto de la pizarra— súbelo. Si no, cuéntanos cómo se organizan.",
        preguntas: ["¿Quiénes forman la empresa y qué hace cada uno, en una frase por persona?", "¿Quién le responde a quién cuando algo sale mal?", "¿Hay alguien que haga de todo un poco? ¿Qué cosas?"],
        estructura: "quién dirige, quién reporta a quién, y qué hace cada puesto en una línea; solo personas y puestos que la empresa mencionó",
      },
      {
        clave: "funciones",
        nombre: "Qué se espera de cada puesto",
        ayuda: "Manual de funciones, descripciones de puesto o simplemente lo que cada quien sabe que le toca.",
        preguntas: ["Toma un puesto clave: ¿qué resultado tiene que entregar para decir que hizo bien su trabajo?", "¿Qué puede decidir esa persona sola y qué tiene que consultar?", "¿Cómo se dan cuenta cuando alguien está fallando en su puesto?"],
        estructura: "por cada puesto conocido: resultado que entrega, tareas principales, qué decide solo y qué escala, cómo se sabe que lo hizo bien",
      },
      {
        clave: "mvv",
        nombre: "Lo que la empresa quiere ser",
        ayuda: "Misión, visión, valores o propósito escritos. Si nunca se escribieron, cuéntanos qué los mueve.",
        preguntas: ["¿Para qué existe esta empresa, más allá de ganar dinero?", "¿Qué comportamiento de tu gente te enorgullece y cuál no tolerarías?", "¿Cómo quieres que se sienta un cliente después de tratar con ustedes?"],
        estructura: "propósito (por qué existe, en las palabras del dueño), misión (qué hace y para quién), visión (a dónde quiere llegar según lo dicho HOY, no planes viejos), valores (los que se ven en cómo trabajan, con un ejemplo real cada uno)",
      },
      {
        clave: "seleccion",
        nombre: "Cómo contratan gente",
        ayuda: "Avisos, entrevistas, pruebas… o el ojo del dueño.",
        preguntas: ["La última vez que contrataron a alguien, ¿cómo fue, paso a paso?", "¿Qué buscas en una persona antes de traerla al equipo?"],
      },
      {
        clave: "onboarding",
        nombre: "Cómo entra alguien nuevo",
        ayuda: "Qué le enseñan los primeros días, quién y con qué.",
        preguntas: ["¿Quién le enseña a un nuevo y cuánto tarda en trabajar solo?", "¿Qué es lo primero que un nuevo hace mal casi siempre?"],
      },
      {
        clave: "evaluacion",
        nombre: "Cómo saben si alguien lo hace bien",
        ayuda: "Evaluaciones, conversaciones, indicadores o simple observación.",
        preguntas: ["¿Cómo te das cuenta de que alguien está rindiendo?", "¿Cada cuánto conversan sobre cómo le va a cada persona?"],
      },
      {
        clave: "plan_personal",
        nombre: "Qué pasa si alguien falta",
        ayuda: "El plan B por puesto: quién cubre, qué no puede esperar, y qué harías si tu mejor persona renuncia.",
        preguntas: ["La última vez que alguien faltó sin avisar, ¿qué pasó ese día? ¿Quién cubrió?", "Por cada puesto clave: si esa persona no viene mañana, ¿quién sabe hacer lo suyo?", "¿Qué tarea NO puede esperar ni un día si falta quien la hace?", "Si tu mejor persona renuncia hoy con una semana de aviso, ¿qué harías esa semana?"],
        estructura: "por cada puesto clave: quién cubre (plan B), qué tareas no pueden esperar, qué debe quedar escrito para que otro las haga; señales de alerta (tardanzas, bajón de ritmo) y qué se hace a la primera y a la tercera; qué hacer ante una renuncia (la semana de transición)",
      },
      {
        clave: "reglamento",
        nombre: "Las reglas de la casa",
        ayuda: "Reglamento interno: horarios, permisos, faltas, adelantos… las reglas que ya existen aunque nadie las escribió.",
        preguntas: ["¿Qué reglas ya existen aunque nadie las escribió? (horarios, celular, permisos, adelantos)", "Cuéntame la última vez que tuviste que llamar la atención a alguien: ¿por qué fue y cómo se resolvió?", "¿Cómo se piden los permisos y quién los aprueba? ¿Y las faltas: se descuentan, se recuperan, se conversan?", "¿Qué cosa se permite hoy que sabes que no deberías permitir?"],
        estructura: "horario y asistencia (tardanzas y faltas: qué pasa), permisos (cómo se piden, quién aprueba), adelantos y préstamos si existen, uso de celular/herramientas, y las 3-5 reglas que el dueño ya aplica en la práctica — cada regla con su consecuencia real, no letra muerta",
      },
      {
        clave: "cultura",
        nombre: "Cómo somos aquí",
        ayuda: "La cultura real: lo que se celebra, lo que no se tolera, y cómo se decide cuando hay que elegir.",
        preguntas: ["Cuéntame algo que hizo alguien del equipo y te hizo pensar «así quiero que seamos siempre».", "¿Y algo que hizo alguien que te hizo decir «esto aquí no va»?", "Cuando hay que elegir entre hacerlo rápido o hacerlo bien, ¿qué se elige en tu empresa?", "¿Qué se celebra en tu empresa y cómo? ¿Qué te gustaría que se celebre?"],
        estructura: "cada valor con el EJEMPLO REAL que lo demuestra (la historia contada, con nombre si lo dieron), los límites (lo que aquí no va, con su caso), cómo se decide ante los dilemas típicos (rápido vs bien, cliente vs caja), y qué se celebra; nada de palabras de póster sin historia detrás",
      },
      {
        // Exigente Y legal: la escalera disciplinaria peruana bien documentada protege a la empresa
        // ante SUNAFIL y sostiene la cultura de excelencia. Distingue error honesto de falta deliberada.
        clave: "disciplina",
        nombre: "Qué pasa cuando alguien falla",
        ayuda: "Cómo se corrige de verdad: la conversación, el memorándum, y qué queda por escrito. Exigente y bien hecho.",
        preguntas: [
          "La última vez que alguien hizo algo que no debía, ¿qué pasó? ¿Quién habló con esa persona y qué le dijo?",
          "Cuando llamas la atención, ¿queda algo escrito y firmado, o solo es conversación?",
          "¿Qué cosas para ti son un error del que se aprende, y qué cosas no las perdonas nunca?",
          "Si la misma persona repite la misma falta tres veces, ¿qué pasa hoy en tu empresa?",
          "Antes de sancionar a alguien, ¿le das oportunidad de explicar su versión?",
        ],
        estructura:
          "TRES NIVELES DE FALTA con ejemplos REALES de esta empresa (leve / grave / muy grave); LA DIFERENCIA CLAVE: error honesto que se reporta (se corrige y se mejora el proceso) vs negligencia (no cumplió el estándar que debía) vs incumplimiento deliberado (conocía la regla y decidió saltarla); LA ESCALERA en tres pasos: 1) conversación con constancia escrita, 2) memorándum de amonestación firmado, 3) sanción mayor; CÓMO SE DOCUMENTA cada paso: qué dice el memorándum (hecho concreto, fecha, regla incumplida, qué se espera en adelante), quién lo firma, qué hacer si la persona se niega a firmar (constancia con testigo), dónde se archiva; EL DESCARGO: antes de una sanción grave la persona da su versión por escrito — es su derecho y protege a la empresa; QUIÉN APLICA cada nivel; y LO QUE NUNCA SE SANCIONA: reportar un error propio a tiempo. Cierra con la nota de que los plazos y formalidades del despido se validan con asesoría laboral antes de aplicarlos",
      },
      {
        // Matriz de habilidades + certificación interna: el antídoto contra "solo Rosa sabe hacerlo".
        clave: "habilidades",
        nombre: "Quién sabe hacer qué",
        ayuda: "Las tareas clave del negocio y quién las domina de verdad. Para que nada dependa de una sola persona.",
        preguntas: [
          "Nómbrame las 5 cosas que alguien tiene que saber hacer sí o sí en tu negocio.",
          "De cada una: ¿quién la hace hoy sin que nadie lo supervise?",
          "¿Hay algo que SOLO una persona sabe hacer? ¿Qué pasaría si mañana no viene?",
          "Cuando alguien nuevo aprende una tarea, ¿cómo te das cuenta de que ya la domina?",
          "¿Quién enseña a los nuevos, y esa persona tiene tiempo para hacerlo?",
        ],
        estructura:
          "TABLA de las tareas críticas × las personas reales, con tres niveles por casilla: APRENDIENDO (necesita supervisión) / LO HACE SOLO / PUEDE ENSEÑARLO; los PUNTOS ÚNICOS DE FALLA marcados (tarea que solo una persona domina) con qué pasaría si esa persona falta; CÓMO SE CERTIFICA cada tarea: qué tiene que demostrar la persona para pasar de nivel (una prueba observable, no un curso), quién lo evalúa y dónde queda registrado; y EL PLAN: qué persona debe aprender qué en los próximos 90 días para cerrar los puntos únicos de falla",
      },
      {
        // Mérito: el reconocimiento deja de depender de simpatías y pasa a resultado + conducta.
        clave: "meritos",
        nombre: "Cómo se reconoce al que lo hace bien",
        ayuda: "Qué gana quien cumple y mejora: reconocimiento, crecimiento, o lo que ya haces sin nombrarlo.",
        preguntas: [
          "¿Cómo reconoces hoy a alguien que hizo un buen trabajo? Cuéntame la última vez.",
          "¿Tu gente sabe qué tiene que lograr para ganar más o subir de puesto?",
          "Si dos personas hacen el mismo puesto y una lo hace mucho mejor, ¿se nota en algo?",
          "¿Alguien de tu equipo se ha ido porque sentía que su esfuerzo no se veía?",
        ],
        estructura:
          "QUÉ SE RECONOCE, atado a tres cosas medibles: resultado (su número), conducta (los valores de esta empresa en hechos) y responsabilidad; CÓMO se reconoce: lo que ya existe hoy (aunque no tenga nombre) más lo que conviene agregar a este tamaño de empresa — reconocimiento público, crecimiento de puesto, bono si el margen lo permite [por definir: p. ej. S/200]; CADA CUÁNTO se revisa y QUIÉN decide; y la regla anti-favoritismo: el reconocimiento se sustenta en el número o en el hecho observado, nunca en la simpatía",
      },
    ],
  },
  {
    clave: "procesos",
    nombre: "Cómo se hace el trabajo",
    intro: "Los pasos de las cosas importantes, dónde vive la información y con qué herramientas.",
    activos: [
      {
        clave: "mapa_procesos",
        nombre: "Las tareas importantes, paso a paso",
        ayuda: "Si tienes procesos escritos o dibujados, súbelos. Si no, en la sección Procesos puedes contarlos y los dibujamos.",
        preguntas: ["¿Cuáles son las 3 tareas que si fallan, la empresa sufre? (vender, entregar, cobrar…)", "De esas, ¿cuál depende más de la memoria de alguien?"],
        estructura: "lista de los procesos que la empresa mostró, cada uno con: para qué existe, quién lo hace, con qué empieza y con qué termina; marcar cuáles están dibujados y cuáles solo mencionados",
      },
      {
        clave: "procedimientos",
        nombre: "Guías y manuales escritos",
        ayuda: "Manuales, checklists, instructivos. Aunque estén desactualizados, sirven.",
        preguntas: ["¿Qué cosas se hacen 'como siempre se hicieron' sin nada escrito?", "Cuando alguien duda de cómo hacer algo, ¿a quién o a qué recurre?"],
      },
      {
        clave: "politicas",
        nombre: "Las reglas del negocio",
        ayuda: "Descuentos, créditos, devoluciones, permisos: quién decide qué.",
        preguntas: ["¿Quién puede dar un descuento o fiar, y hasta cuánto?", "¿Qué pasa cuando un cliente pide algo fuera de lo normal? ¿Quién decide?"],
      },
      {
        clave: "indicadores",
        nombre: "Los números que revisan",
        ayuda: "Lo que miran cada semana o mes para saber cómo van.",
        preguntas: ["¿Qué números revisas tú cada semana, aunque sea mentalmente?", "¿Hay algo que te gustaría medir y hoy no puedes?"],
      },
      {
        clave: "sistemas",
        nombre: "Dónde vive la información",
        ayuda: "Excel, WhatsApp, cuadernos, algún sistema: donde se apunta lo importante.",
        preguntas: ["Si mañana se pierde tu celular o tu cuaderno, ¿qué información se pierde con él?", "¿Qué se apunta dos veces en lugares distintos?"],
      },
      {
        // Las incidencias son la mina de KPIs: lo que se repite es lo que hay que medir y corregir.
        clave: "incidencias",
        nombre: "Lo que sale mal seguido",
        ayuda: "Los problemas que se repiten en el trabajo del día. De aquí salen los números que hay que vigilar.",
        preguntas: [
          "¿Qué problema se repite tanto que ya les parece normal?",
          "La última vez que pasó, ¿cuánto costó arreglarlo: en dinero, en horas o en un cliente molesto?",
          "Cuando pasa, ¿quién se da cuenta primero y qué hace?",
          "¿Hay algo que ya intentaron para que no vuelva a pasar? ¿Funcionó?",
        ],
        estructura:
          "por cada incidencia repetida: QUÉ PASA (el hecho concreto, contado), CADA CUÁNTO (de cada 10 veces, cuántas sale mal), QUÉ CUESTA (en soles, horas o clientes — con el número si lo dieron, o 'sin dato' si no), POR QUÉ PASA (la causa, no el culpable: procedimiento poco claro, falta de capacitación, no hay control, o el diseño del proceso), CÓMO SE RESUELVE HOY (el parche actual) y CÓMO SE EVITA (la corrección de fondo); cierra con EL NÚMERO A VIGILAR de cada una — el indicador que avisa si el problema vuelve, con su meta",
      },
      {
        // Cultura de control: crítico en negocios que mueven efectivo o datos sensibles.
        clave: "controles",
        nombre: "Cómo se cuida el dinero y la información",
        ayuda: "Los controles que protegen la caja, los datos y los accesos. Sin volver lento el trabajo.",
        preguntas: [
          "Al cerrar el día, ¿quién cuenta el dinero y quién lo revisa? ¿Es la misma persona?",
          "¿Hay alguna operación que hoy una sola persona puede hacer de principio a fin sin que nadie más la vea?",
          "¿Quién tiene las llaves, las claves y los accesos al dinero o al sistema?",
          "La última vez que faltó dinero o hubo un descuadre, ¿cómo se dieron cuenta y qué hicieron?",
          "¿Qué se guarda como respaldo y dónde: contratos, comprobantes, fotos, copias?",
        ],
        estructura:
          "por cada punto donde se toca dinero, datos o accesos: QUIÉN LO HACE y QUIÉN LO REVISA (el principio de que quien ejecuta no se autoriza a sí mismo), QUÉ SE CUENTA Y CUÁNDO (arqueos, cierre diario, conciliación con el banco), QUÉ QUEDA REGISTRADO y dónde, QUIÉN TIENE ACCESO a llaves/claves/sistema y quién lo revisa; los RIESGOS ABIERTOS que el levantamiento mostró (operación que una sola persona controla de punta a punta, accesos sin dueño, información sin respaldo) con el control concreto que los cierra; proporcional al tamaño: en una empresa chica el control es el dueño revisando una vez al día, no un área de auditoría",
      },
    ],
  },
  {
    clave: "producto",
    nombre: "Lo que vendes",
    intro: "Tus productos o servicios, cómo los entregas y cómo cuidas que salgan bien.",
    activos: [
      {
        clave: "catalogo",
        nombre: "Tus productos o servicios",
        ayuda: "Lista, catálogo o foto de la pizarra de precios.",
        preguntas: ["¿Qué vendes y cuál de todo deja más dinero?", "¿Hay algo que vendes por costumbre y casi no sale?"],
      },
      {
        clave: "entrega",
        nombre: "Cómo entregas lo prometido",
        ayuda: "Del pedido a la entrega: pasos, tiempos, quién.",
        preguntas: ["Desde que el cliente pide hasta que recibe: ¿qué pasa en el medio y cuánto tarda?", "¿Dónde se demora o se traba más seguido?"],
      },
      {
        clave: "calidad",
        nombre: "Cómo cuidas la calidad",
        ayuda: "Revisiones, estándares o el criterio de alguien con buen ojo.",
        preguntas: ["¿Cómo sabes que lo que salió está bien hecho, antes de que lo vea el cliente?", "¿Quién se da cuenta primero cuando algo no está quedando bien, y en qué se fija?"],
      },
      {
        clave: "reclamos",
        nombre: "Reclamos y devoluciones",
        ayuda: "Qué reclaman los clientes y qué hacen ustedes con eso.",
        preguntas: ["¿Cuál es el reclamo que más se repite?", "¿Qué hacen cuando un cliente reclama? ¿Queda apuntado en algún lado?"],
      },
      {
        clave: "testimonios",
        nombre: "Lo que dicen tus clientes",
        ayuda: "Reseñas, mensajes de agradecimiento, contratos tipo.",
        preguntas: ["¿Qué te dicen los clientes contentos que les gusta de ustedes?", "¿Tienes mensajes o reseñas guardados que lo muestren?"],
      },
    ],
  },
  {
    clave: "marketing",
    nombre: "Tus clientes y cómo llegan",
    intro: "Quién te compra, por dónde llega y qué pasa desde el primer contacto hasta la venta.",
    activos: [
      {
        clave: "cliente_ideal",
        nombre: "Quién te compra hoy",
        ayuda: "El cliente real, no el del plan: quién es y por qué te elige.",
        preguntas: ["Describe a tu cliente típico: ¿quién es y qué problema le resuelves?", "¿Por qué te compra a ti y no a otro?"],
        estructura: "quién compra hoy (con los datos reales si existen), qué problema le resuelve la empresa, qué promete (propuesta de valor en una frase), por qué la eligen frente a otras",
      },
      {
        clave: "oferta",
        nombre: "Qué prometes y a qué precio",
        ayuda: "Tu oferta: qué se lleva el cliente, precio, garantía.",
        preguntas: ["¿Qué le prometes exactamente al cliente cuando te compra?", "¿Cómo pusiste tus precios?"],
      },
      {
        clave: "canales",
        nombre: "Por dónde llegan los clientes",
        ayuda: "Referidos, redes, el local, llamadas: por dónde entra la gente.",
        preguntas: ["¿De dónde llegaron tus últimos 5 clientes nuevos?", "Si esa forma de llegar se apagara un mes, ¿qué pasaría?"],
      },
      {
        clave: "proceso_comercial",
        nombre: "Qué pasa con un interesado",
        ayuda: "Del primer mensaje a la venta: pasos y seguimiento.",
        preguntas: ["Cuando alguien pregunta y no compra en el momento, ¿alguien lo vuelve a buscar?", "¿Dónde queda apuntado quién preguntó y en qué quedaron?"],
      },
      {
        clave: "resultados_comerciales",
        nombre: "Tus números de venta",
        ayuda: "Ventas por mes, cotizaciones enviadas, cuántos terminan comprando.",
        preguntas: ["¿Cuánto vendes en un mes normal y en uno bueno?", "De cada 10 que preguntan, ¿cuántos compran?"],
      },
    ],
  },
  {
    clave: "resultados",
    nombre: "Tus números",
    intro: "Lo que muestra cómo le va a la empresa de verdad.",
    activos: [
      {
        clave: "ventas",
        nombre: "Ventas",
        ayuda: "Facturación por mes, aunque salga del cuaderno.",
        preguntas: ["¿Cuánto vende el negocio al mes, más o menos?", "¿Las ventas van subiendo, bajando o igual que el año pasado?"],
      },
      {
        clave: "margen",
        nombre: "Lo que queda",
        ayuda: "Margen o utilidad después de los costos, si lo conocen.",
        preguntas: ["Después de pagar todo, ¿cuánto queda en un mes normal?", "¿Sabes cuál de tus productos o servicios te deja más ganancia por cada venta?"],
      },
      {
        clave: "retencion",
        nombre: "Clientes que vuelven",
        ayuda: "Recompra, permanencia, o tu sensación con nombres concretos.",
        preguntas: ["De tus clientes de hace un año, ¿cuántos siguen comprando?", "¿Sabes por qué se fue el último cliente que se fue?"],
      },
      {
        clave: "tiempos",
        nombre: "Tiempos reales",
        ayuda: "Cuánto tarda lo prometido, y cuánto tarda de verdad.",
        preguntas: ["¿Cuánto prometes de tiempo de entrega y cuánto tarda en realidad?", "¿Qué es lo que más espera un cliente sin necesidad?"],
      },
    ],
  },
  {
    clave: "direccion",
    nombre: "Hacia dónde va la empresa",
    intro: "La dirección puesta por escrito: la estrategia y el plan del negocio.",
    activos: [
      {
        clave: "estrategia",
        nombre: "La estrategia del negocio",
        ayuda: "A quién le vendes, con qué ganas frente a otros, qué NO haces, y las 3 apuestas del año.",
        preguntas: ["De todos los que podrían comprarte, ¿a quiénes decidiste dedicarte… y a quiénes NO?", "¿Con qué le ganas a los demás del rubro — qué haces tú que ellos no pueden copiar fácil?", "Si solo pudieras apostar por 3 cosas este año, ¿cuáles serían?", "¿Qué has decidido NO hacer aunque parezca negocio?"],
        estructura: "a quién servimos (y a quién no), con qué ganamos (el diferencial demostrado, no declarado), las 3 apuestas del año con su porqué, lo que NO hacemos, y cómo sabremos que la estrategia funciona (2-3 números simples); todo con las palabras y los datos de la empresa",
      },
      {
        clave: "plan_empresarial",
        nombre: "El plan de la empresa",
        ayuda: "El documento que resume el negocio completo: qué es, cómo gana dinero, sus metas y su plan.",
        preguntas: ["En una frase: ¿qué es tu negocio y para quién?", "¿Cómo entra el dinero: qué vendes, a cuánto, y qué te cuesta?", "¿Cuál es tu meta de este año en dinero y en clientes?", "¿Qué necesitas (gente, equipo, dinero) para llegar a esa meta?"],
        estructura: "resumen del negocio (qué es, para quién, con qué gana), cómo entra el dinero (productos, precios, costos y ganancia según lo contado), la foto de hoy (números con estado), las metas del año (las del dueño, no inventadas), el plan por frentes con responsable y primer paso, y los riesgos que el diagnóstico encontró",
      },
    ],
  },
];

/**
 * Ejemplos por pregunta: abren la memoria del que responde (queja real: "no entiendo esa pregunta").
 * Se muestran en gris bajo la pregunta. Clave = texto exacto de la pregunta.
 */
export const EJEMPLOS: Record<string, string> = {
  // Disciplina, habilidades, mérito, incidencias y controles: temas delicados, ejemplos que abren la memoria.
  "La última vez que alguien hizo algo que no debía, ¿qué pasó? ¿Quién habló con esa persona y qué le dijo?": "«Llegó tarde tres días seguidos; le hablé yo en la mañana y quedamos en que avisaba si se le hacía tarde.»",
  "Cuando llamas la atención, ¿queda algo escrito y firmado, o solo es conversación?": "«Solo hablamos; nunca hemos hecho un papel.»",
  "¿Qué cosas para ti son un error del que se aprende, y qué cosas no las perdonas nunca?": "«Que se equivoque en un vuelto, se aprende. Que agarre plata de la caja, no.»",
  "Si la misma persona repite la misma falta tres veces, ¿qué pasa hoy en tu empresa?": "«Le vuelvo a llamar la atención… la verdad es que no pasa nada más.»",
  "Nómbrame las 5 cosas que alguien tiene que saber hacer sí o sí en tu negocio.": "«Atender al cliente, cobrar y dar vuelto, cerrar la caja, hacer el pedido al proveedor y limpiar el local.»",
  "¿Hay algo que SOLO una persona sabe hacer? ¿Qué pasaría si mañana no viene?": "«Solo Rosa sabe hacer el pedido al proveedor; si falta, ese día no pedimos.»",
  "Cuando alguien nuevo aprende una tarea, ¿cómo te das cuenta de que ya la domina?": "«Cuando lo veo hacerlo tres veces sin preguntarme nada.»",
  "¿Cómo reconoces hoy a alguien que hizo un buen trabajo? Cuéntame la última vez.": "«Le dije 'buen trabajo' delante de todos y le invité el almuerzo.»",
  "¿Qué problema se repite tanto que ya les parece normal?": "«Que el pedido llegue incompleto del proveedor; ya sabemos que hay que contarlo todo.»",
  "La última vez que pasó, ¿cuánto costó arreglarlo: en dinero, en horas o en un cliente molesto?": "«Perdimos media mañana y un cliente se fue sin comprar.»",
  "Al cerrar el día, ¿quién cuenta el dinero y quién lo revisa? ¿Es la misma persona?": "«Lo cuenta la cajera y lo vuelvo a contar yo antes de guardarlo.»",
  "¿Quién tiene las llaves, las claves y los accesos al dinero o al sistema?": "«Yo y mi hermana tenemos llave; la clave del sistema la sabemos los dos.»",
  "¿Quiénes forman la empresa y qué hace cada uno, en una frase por persona?": "«Somos 4: yo vendo y compro; Marta atiende la caja; Luis reparte; mi hijo ve las redes.»",
  "¿Quién le responde a quién cuando algo sale mal?": "«Si un pedido sale mal, Luis me avisa a mí y yo hablo con el cliente.»",
  "Toma un puesto clave: ¿qué resultado tiene que entregar para decir que hizo bien su trabajo?": "«La cajera tiene que cuadrar la caja al centavo cada noche.»",
  "La última vez que contrataron a alguien, ¿cómo fue, paso a paso?": "«Pusimos un aviso, vinieron tres personas, conversamos y escogimos a la más puntual.»",
  "¿Quién le enseña a un nuevo y cuánto tarda en trabajar solo?": "«Lo pongo una semana al lado de Marta; al mes ya atiende solo.»",
  "¿Cómo te das cuenta de que alguien está rindiendo?": "«Veo cuántos pedidos saca al día y si los clientes se quejan o lo felicitan.»",
  "¿Quién puede dar un descuento o fiar, y hasta cuánto?": "«Solo yo doy descuentos; Marta puede fiar hasta 50 soles a caseros conocidos.»",
  "¿Qué pasa cuando un cliente pide algo fuera de lo normal? ¿Quién decide?": "«Si piden entrega un domingo, me llaman y yo decido.»",
  "¿Qué números revisas tú cada semana, aunque sea mentalmente?": "«Cuánto vendí, cuánto debo a proveedores y cuánto me deben a mí.»",
  "Si mañana se pierde tu celular o tu cuaderno, ¿qué información se pierde con él?": "«Los pedidos apuntados, los números de los caseros y quiénes me deben.»",
  "¿Cómo sabes que lo que salió está bien hecho, antes de que lo vea el cliente?": "«Antes de entregar, yo mismo reviso cada pedido: que esté completo y bien presentado.»",
  "¿Quién se da cuenta primero cuando algo no está quedando bien, y en qué se fija?": "«Rosa se da cuenta al toque: mira el color de la masa y ya sabe si va a salir mal.»",
  "¿Cuál es el reclamo que más se repite?": "«Que la entrega llegó tarde», «que no era el color que pidieron».",
  "Describe a tu cliente típico: ¿quién es y qué problema le resuelves?": "«Mamás de la zona que quieren la torta del cumpleaños sin complicarse.»",
  "¿Qué cosas se hacen 'como siempre se hicieron' sin nada escrito?": "«El inventario se cuenta como lo hacía mi papá: al ojo, cada fin de mes.»",
  "La última vez que alguien faltó sin avisar, ¿qué pasó ese día? ¿Quién cubrió?": "«Faltó el repartidor y yo mismo salí a repartir; se atrasaron tres pedidos.»",
  "Por cada puesto clave: si esa persona no viene mañana, ¿quién sabe hacer lo suyo?": "«Si falta la cajera, Marta sabe cobrar; si falta el maestro, nadie — ese es el hueco.»",
  "¿Qué reglas ya existen aunque nadie las escribió? (horarios, celular, permisos, adelantos)": "«Se entra 8:30, el celular se deja en el cajón en atención, los permisos se piden con un día.»",
  "Cuéntame la última vez que tuviste que llamar la atención a alguien: ¿por qué fue y cómo se resolvió?": "«Llegaba tarde toda la semana; conversamos y quedamos en que avisa por WhatsApp si se retrasa.»",
  "Cuéntame algo que hizo alguien del equipo y te hizo pensar «así quiero que seamos siempre».": "«Luis se quedó hasta tarde para rehacer un pedido que salió mal, sin que nadie se lo pidiera.»",
  "¿Y algo que hizo alguien que te hizo decir «esto aquí no va»?": "«Uno le echó la culpa al compañero delante del cliente. Eso aquí no va.»",
  "Cuando alguien duda de cómo hacer algo, ¿a quién o a qué recurre?": "«Le pregunta a Marta, que es la más antigua. Si ella no está, me llaman.»",
};

export const ESTADOS_ACTIVO: { clave: string; nombre: string; sub: string }[] = [
  { clave: "lo_tengo", nombre: "Lo tengo", sub: "Súbelo aquí mismo" },
  { clave: "incompleto", nombre: "Tengo algo", sub: "Sube lo que haya y cuéntanos el resto" },
  { clave: "no_lo_tengo", nombre: "No está escrito", sub: "Cuéntanos cómo funciona hoy" },
  { clave: "no_se", nombre: "No sé qué es", sub: "Te lo explicamos en una frase" },
];
