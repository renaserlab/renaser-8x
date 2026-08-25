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
];

/**
 * Ejemplos por pregunta: abren la memoria del que responde (queja real: "no entiendo esa pregunta").
 * Se muestran en gris bajo la pregunta. Clave = texto exacto de la pregunta.
 */
export const EJEMPLOS: Record<string, string> = {
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
