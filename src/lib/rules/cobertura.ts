/**
 * Cobertura de entrevistas (1.1, 1.4). Una sesión no se cierra hasta cubrir sus bloques obligatorios.
 * El banco es la fuente única: lo lee el prompt del ENTREVISTADOR y lo comprueba el handler en código.
 */

export type Bloque = { clave: string; nombre: string; preguntas: string[] };

export const BLOQUES: Record<string, Bloque[]> = {
  // UNA PREGUNTA, UNA COSA (revisión del 16-10-2026, secciones 3a y 3b). Cada pregunta pide el episodio («la última
  // vez», «el mes pasado», «ayer»), no el promedio; no trae cifras ni listas de ejemplo, ni un menú de opciones; y lo
  // que es una cuenta (una proporción, un total) se pide por partes: la cuenta la hace 8X. Lo vigila
  // tests/preguntas-sin-eco.test.ts.
  sueno_dueno: [
    { clave: "origen", nombre: "Origen", preguntas: ["Cuéntame el día que decidiste empezar este negocio: ¿qué estaba pasando en tu vida?", "¿Con qué empezaste el negocio?", "Cuando empezaste, ¿quién te ayudó?", "De lo que soñabas cuando empezaste, ¿qué se cumplió?", "¿Y qué falta por cumplirse?"] },
    { clave: "historia_intentos", nombre: "Lo que ya intentó", preguntas: ["¿Qué has intentado ya para que el negocio crezca?", "¿Y qué pasó con cada intento?", "¿Qué te recomendaron para el negocio que nunca terminaste de hacer?", "¿Qué te frenó para terminar eso?", "¿Hubo alguna época en que el negocio estuvo mejor que hoy?", "En esa época, ¿qué era distinto?"] },
    { clave: "empresa_deseada", nombre: "Empresa deseada", preguntas: ["Si dentro de tres años todo sale bien y yo visito tu negocio, ¿qué veo?", "Ese día, dentro de tres años, ¿qué haces tú en el negocio?", "Y ese día, ¿qué ya no haces tú?", "¿Qué parte del negocio NO quieres que crezca ni cambie?"] },
    { clave: "vida_deseada", nombre: "Vida deseada", preguntas: ["Imagina un martes normal dentro de tres años, con el negocio andando como lo sueñas: ¿dónde estás tú al mediodía?", "¿Qué haces tú personalmente ese martes?", "¿Cuántas horas a la semana trabajas en esa vida que imaginas?", "¿Qué quieres poder hacer fuera del negocio?"] },
    { clave: "rol", nombre: "Rol", preguntas: ["¿Qué es lo que más te gusta hacer en el negocio?", "¿Qué haces bien pero ya te cansó?", "¿Qué haces tú porque nadie más puede hacerlo?"] },
    { clave: "exito", nombre: "Éxito", preguntas: ["Cuéntame la última vez que te sentiste orgulloso de tu negocio.", "¿Cuánto dinero tendría que quedarte al mes para estar tranquilo?", "¿Cuánto es suficiente para ti?", "El día que ya no estés en el negocio, ¿qué quieres dejar construido?"] },
    { clave: "verdad_dificil", nombre: "Verdad difícil", preguntas: ["¿Qué sabes que debe cambiar en tu negocio?", "¿Qué decisión del negocio llevas meses postergando?", "Cada mes que no la tomas, ¿qué te cuesta?", "¿Qué parte del negocio te da más miedo soltar?", "Si la sueltas, ¿qué es lo peor que crees que pasaría?", "¿Qué cambiarías de tu negocio si nadie te juzgara?"] },
  ],
  empresa_dueno: [
    { clave: "hoy", nombre: "Hoy", preguntas: ["Cuéntame tu negocio hoy: ¿a qué se dedica?", "Hoy, ¿cuántas personas trabajan en el negocio, contándote a ti?", "¿Qué vendes? Dime los nombres, uno por uno.", "El mes pasado, ¿cuál de esos vendiste más veces?", "El mes pasado, ¿cuánto vendiste en total?", "Ese mes, ¿cuánto dinero sacaste del negocio para ti?", "Ayer, al cerrar, ¿cómo supiste cuánto vendiste?", "La última vez que pagaste un gasto de tu casa, ¿de qué dinero salió?", "El mes pasado, ¿quién fue el cliente que más te compró?", "Ese mes, ¿cuánto te compró ese cliente?", "Hoy, ¿quiénes te deben? Dime sus nombres, uno por uno.", "Cada uno de ellos, ¿cuánto te debe?", "¿Desde qué fecha te debe cada uno?", "¿Qué parte del negocio funciona especialmente bien?", "¿Qué es lo que más te preocupa del negocio hoy?"] },
    { clave: "epoca_dorada", nombre: "Su mejor época", preguntas: ["¿Hubo un año o una época en que el negocio vendía más que hoy?", "¿Cuál fue el mes que más vendiste en toda la historia del negocio?", "En esa época, ¿cuánto vendías al mes?", "En esa época, ¿qué hacías que hoy ya no haces?", "¿En qué mes notaste que las ventas empezaban a bajar?", "Ese mes, ¿qué cambió dentro del negocio?", "Y afuera del negocio, ¿qué pasó ese mismo mes?", "De los clientes de tu mejor época, ¿de cuántos tienes todavía el número?", "¿Alguien volvió a buscar a los clientes de esa época?", "De esa época, ¿qué habría que volver a hacer?", "Y de esa época, ¿qué no habría que repetir?"] },
    { clave: "dependencia", nombre: "Dependencia", preguntas: ["Cuéntame tu último día de trabajo en el negocio, desde que llegaste al local hasta que saliste.", "De todo lo que hiciste ese día, ¿qué podría haber hecho alguien de tu equipo?", "La última vez que faltaste al negocio, ¿qué se quedó esperando hasta que volviste?", "La semana pasada, ¿cuántas veces te pidieron que aprobaras algo?"] },
    { clave: "brecha", nombre: "La brecha", preguntas: ["Entre el negocio que quieres y el que tienes hoy, ¿qué crees TÚ que ha sido el freno todos estos años?", "Si nada cambia y pasan dos años, ¿dónde queda el negocio?", "Si nada cambia en esos dos años, ¿dónde estás tú?"] },
    { clave: "proposito", nombre: "Propósito", preguntas: ["¿Qué cambia en la vida de tus clientes porque tu negocio existe?", "¿Qué impacto quieres dejar con tu negocio?", "¿Qué no estás dispuesto a sacrificar por crecer?"] },
    { clave: "personas", nombre: "Personas", preguntas: ["¿Quiénes trabajan contigo? Dime sus nombres, uno por uno.", "Cada una de esas personas, ¿cómo llegó al negocio?", "La última persona que entró a trabajar contigo, ¿cómo la escogiste?", "La última persona que dejó de trabajar contigo, ¿qué pasó?", "La última vez que algo salió mal en el negocio, ¿a quién llamaste primero?", "La semana pasada, ¿qué decidió alguien de tu equipo sin pedirte permiso?", "¿Qué persona de tu equipo te costaría más reemplazar mañana?", "¿Hay alguien que sigue en el equipo aunque sabes que ya no debería?", "Con esa persona, ¿qué te frena para decidir?", "¿Cuándo fue la última vez que alguien de tu equipo te dijo que estabas equivocado?"] },
    { clave: "procesos", nombre: "Procesos", preguntas: ["Cuéntame paso a paso tu última venta, desde que ese cliente te buscó hasta que pagó.", "La semana pasada, ¿qué pedido se atrasó?", "Ese pedido, ¿en qué paso se quedó?", "El mes pasado, ¿qué trabajo se tuvo que hacer dos veces?", "Tu última venta de ayer, ¿dónde quedó anotada?", "¿Me la muestras?", "La última vez que alguien del equipo faltó, ¿quién hizo lo suyo?", "¿Qué cosa se sigue haciendo solo porque siempre se hizo así?"] },
    { clave: "producto", nombre: "Producto", preguntas: ["Cuando alguien te compra, ¿qué le prometes exactamente?", "¿Y qué recibe de verdad?", "La última vez que algo salió mal con un cliente, ¿qué pasó?", "La semana que más pedidos tuviste este año, ¿qué pasó con la calidad de lo que entregaste?", "Este mes, ¿cuántos clientes te compraron por segunda vez?", "Este mes, ¿cuántos clientes nuevos llegaron porque alguien los mandó?"] },
    { clave: "marketing", nombre: "Marketing", preguntas: ["¿De dónde llegaron tus últimos cinco clientes nuevos?", "Si esa forma en que te llegan clientes se apaga un mes, ¿qué pasa con el negocio?", "Nómbrame a tus tres mejores clientes.", "Esos tres clientes, ¿qué te compraron el mes pasado?", "¿Quién quisieras que te compre?", "La semana pasada, ¿quiénes te compraron?", "El último día que abriste, ¿cuántas personas preguntaron por lo que vendes?", "De ellas, ¿cuántas compraron?", "La última persona que preguntó y no compró, ¿alguien la volvió a buscar?", "¿Dónde quedó apuntado su nombre?", "¿Cómo decidiste los precios que cobras hoy?", "El mes pasado, ¿cuánto pagaste en publicidad?", "¿Y en comisiones?", "¿Cuántos clientes nuevos llegaron ese mes?"] },
  ],
  lider: [
    { clave: "area_real", nombre: "Su área", preguntas: ["¿Qué resultado se espera de tu área?", "El mes pasado, ¿cómo supiste si lo cumpliste?", "La última vez que apareció un caso fuera de lo de siempre, ¿quién decidió?", "Ayer, ¿qué tuviste que consultarle al jefe antes de hacerlo?", "La última vez que el jefe no estuvo, ¿qué pasó en tu área?", "¿Quién resuelve de verdad?"] },
    { clave: "trabajo_real", nombre: "Trabajo real", preguntas: ["La semana pasada, ¿en qué se trabó tu área?", "El mes pasado, ¿qué se tuvo que rehacer en tu área?", "Ayer, ¿en qué momento te quedaste esperando a alguien?", "La última vez que no pudiste decidir algo, ¿qué dato te faltó?", "Además del sistema de la empresa, ¿qué usan en tu área para anotar el trabajo?"] },
    { clave: "vision_lider", nombre: "Lo que ve", preguntas: ["¿Qué problema todos aceptan como normal?", "¿Qué escuchas de los clientes que Dirección probablemente no escucha?", "¿Qué eliminarías?", "¿Qué conservarías a toda costa?", "¿Qué crees que Dirección no ve?"] },
  ],
  personal: [
    { clave: "trabajo_real", nombre: "Trabajo real", preguntas: ["Cuéntame cómo haces realmente tu trabajo, paso a paso.", "Cuéntame tu último día de trabajo, desde que llegaste.", "¿Qué esperan que salga de tu trabajo cada día?", "¿Cómo sabes que lo hiciste bien?", "Cuando el procedimiento dice una cosa, ¿qué hacen realmente?", "¿Qué paso se saltan cuando hay urgencia?"] },
    { clave: "trabas", nombre: "Trabas", preguntas: ["¿En qué parte de tu trabajo pierdes más tiempo?", "Ayer, ¿en qué momento te quedaste esperando a alguien?", "¿Qué repites o rehaces más de una vez?", "¿Qué información te falta para hacer bien tu trabajo?", "¿Qué cosas tienes que consultarle al jefe que tú ya sabrías resolver?"] },
    { clave: "verdad_operativa", nombre: "Verdad operativa", preguntas: ["¿Qué pasa cuando hay urgencia?", "¿Qué pasa cuando el jefe no está?", "¿Quién resuelve de verdad?", "¿Qué problema todos aceptan como normal?", "Además del sistema de la empresa, ¿qué usas para anotar tu trabajo?", "¿Cómo sabes que algo va a salir mal antes de que falle?"] },
    { clave: "vision_personal", nombre: "Lo que ve", preguntas: ["¿Qué escuchas de los clientes?", "¿Qué eliminarías?", "¿Qué conservarías?", "¿Qué harías distinto si esta empresa fuera tuya?", "¿Qué crees que Dirección no ve?"] },
  ],
  know_how: [
    { clave: "know_how", nombre: "Lo que solo tú sabes", preguntas: ["¿Qué sabes hacer tú que alguien nuevo tardaría meses en aprender?", "¿Qué notas tú antes que los demás cuando algo va a salir mal?", "¿Qué haces diferente cuando aparece un caso complicado?", "¿Qué cosa importante de tu trabajo nunca quedó escrita?", "Si mañana no pudieras venir, ¿qué se perdería contigo?", "¿Qué error comete siempre un principiante que tú ya no cometes?", "¿Cuándo sabes que un problema te queda grande y hay que avisar?"] },
  ],
  validacion: [{ clave: "validacion", nombre: "Validación", preguntas: [] }],
  // LA ENTRADA BREVE (Dirección, 13-10-2026, sección 7). Su plan de doce preguntas vive en src/lib/entrada.ts y
  // once de ellas citan bloques que ya están arriba (hoy, dependencia, empresa_deseada, exito, proposito,
  // epoca_dorada). Aquí va solo lo que el banco no tenía: lo que el negocio tiene y no usa, que Dirección exige
  // preguntar. Es INTERNO (el mapa de recursos), no una oportunidad: las oportunidades vienen de afuera. Los
  // clientes antiguos que todavía se pueden llamar sí lo son, y se cuentan en su propia pregunta. Vive bajo su
  // propio tipo de sesión, y no dentro de empresa_dueno, para que ninguna sesión que ya existe pierda cobertura por
  // un bloque que nadie le había pedido cubrir.
  entrada_breve: [
    { clave: "recursos", nombre: "Recursos desaprovechados", preguntas: ["La semana pasada, ¿qué máquina o espacio del negocio no se usó?", "De los clientes que ya no te compran, ¿de cuántos tienes todavía el número?"] },
  ],
};

export const MINIMO_POR_BLOQUE = 1;

/**
 * Bloques del tipo de sesión que todavía no están cubiertos. Un bloque se cubre respondiendo una pregunta
 * suya O cuando el entrevistador declara que lo ya dicho lo cubre (una respuesta rica puede cubrir varias
 * áreas: el sistema trabaja por cobertura de realidad, no por cuestionario).
 */
export function bloquesSinCubrir(tipo: string, respondidas: { bloque: string | null }[], cubiertos: string[] = []): Bloque[] {
  const req = BLOQUES[tipo] ?? [];
  const conteo = new Map<string, number>();
  for (const r of respondidas) if (r.bloque) conteo.set(r.bloque, (conteo.get(r.bloque) ?? 0) + 1);
  const extra = new Set(cubiertos);
  return req.filter((b) => b.preguntas.length > 0 && (conteo.get(b.clave) ?? 0) < MINIMO_POR_BLOQUE && !extra.has(b.clave));
}

/** La sesión puede cerrarse solo si no queda ningún bloque sin cubrir (o si es de validación). */
export function puedeCerrarSesion(tipo: string, respondidas: { bloque: string | null }[], cubiertos: string[] = []): boolean {
  return bloquesSinCubrir(tipo, respondidas, cubiertos).length === 0;
}

export type CoberturaSesion = { porcentaje: number; areas: { clave: string; nombre: string; cubierta: boolean }[] };

/** Cobertura de comprensión de la sesión: qué áreas ya entendimos, en % — lo que ve la persona en vez de un contador. */
export function coberturaSesion(tipo: string, respondidas: { bloque: string | null }[], cubiertos: string[] = []): CoberturaSesion {
  const req = (BLOQUES[tipo] ?? []).filter((b) => b.preguntas.length > 0);
  if (!req.length) return { porcentaje: 100, areas: [] };
  const faltan = new Set(bloquesSinCubrir(tipo, respondidas, cubiertos).map((b) => b.clave));
  const areas = req.map((b) => ({ clave: b.clave, nombre: b.nombre, cubierta: !faltan.has(b.clave) }));
  return { porcentaje: Math.round((areas.filter((a) => a.cubierta).length / areas.length) * 100), areas };
}

/** Texto del banco para el prompt, con la clave exacta que debe devolver el modelo en `bloque`. */
export function bancoComoTexto(tipo: string): string {
  return (BLOQUES[tipo] ?? []).map((b) => `[${b.clave}] ${b.nombre}:\n${b.preguntas.map((q) => "  - " + q).join("\n")}`).join("\n");
}
