/**
 * Cobertura de entrevistas (1.1, 1.4). Una sesión no se cierra hasta cubrir sus bloques obligatorios.
 * El banco es la fuente única: lo lee el prompt del ENTREVISTADOR y lo comprueba el handler en código.
 */

export type Bloque = { clave: string; nombre: string; preguntas: string[] };

export const BLOQUES: Record<string, Bloque[]> = {
  sueno_dueno: [
    { clave: "origen", nombre: "Origen", preguntas: ["Cuéntame el día que decidiste empezar este negocio: ¿qué estaba pasando en tu vida?", "¿Con qué empezaste: cuánta plata tenías, quién te ayudó?", "De lo que soñabas cuando empezaste, ¿qué se cumplió y qué no?"] },
    { clave: "historia_intentos", nombre: "Lo que ya intentó", preguntas: ["¿Qué has intentado ya para que el negocio crezca… y qué pasó con cada intento?", "¿Qué te han recomendado para el negocio que nunca terminaste de hacer? ¿Qué te frenó?", "¿Hubo alguna época en que el negocio estuvo mejor que hoy? ¿Qué era distinto entonces?"] },
    { clave: "empresa_deseada", nombre: "Empresa deseada", preguntas: ["Si dentro de tres años todo sale bien y yo visito tu negocio, ¿qué veo? Cuéntamelo: cuánta gente, qué locales, qué se vende.", "Ese día, dentro de tres años, ¿qué haces tú en el negocio… y qué ya no haces?", "¿Qué parte del negocio NO quieres que crezca ni cambie?"] },
    { clave: "vida_deseada", nombre: "Vida deseada", preguntas: ["Imagina un martes normal dentro de tres años, con el negocio andando como lo sueñas: ¿dónde estás tú al mediodía?", "¿Qué haces tú personalmente ese martes?", "¿Cuántas horas a la semana trabajas en esa vida que imaginas?", "¿Qué quieres poder hacer fuera del negocio: familia, viajes, descanso?"] },
    { clave: "rol", nombre: "Rol", preguntas: ["¿Qué es lo que más te gusta hacer en el negocio?", "¿Qué haces bien pero ya te cansó?", "¿Qué haces tú porque nadie más puede hacerlo?"] },
    { clave: "exito", nombre: "Éxito", preguntas: ["¿Cuándo fue la última vez que te sentiste orgulloso de tu negocio? ¿Qué había pasado?", "¿Cuánta plata tendría que quedarte al mes para estar tranquilo? ¿Cuánto es suficiente para ti?", "El día que ya no estés en el negocio, ¿qué quieres dejar construido?"] },
    { clave: "verdad_dificil", nombre: "Verdad difícil", preguntas: ["¿Qué sabes que debe cambiar en tu negocio?", "¿Qué decisión del negocio llevas meses postergando… y qué te cuesta cada mes no tomarla?", "¿Qué parte del negocio te da más miedo soltar? ¿Qué es lo peor que crees que pasaría si la sueltas?", "¿Qué cambiarías de tu negocio si nadie te juzgara?"] },
  ],
  empresa_dueno: [
    { clave: "hoy", nombre: "Hoy", preguntas: ["Cuéntame tu negocio hoy: ¿qué haces, dónde, con cuánta gente?", "¿Qué vendes y a quién?", "¿Qué es lo que más plata te trae: qué producto o qué tipo de cliente?", "En un mes normal, ¿cuánta plata entra al negocio en total… y cuánto queda para ti después de pagar todo?", "Al final del día, ¿cómo sabes cuánto vendiste? ¿Dónde queda apuntado?", "¿La plata del negocio y la de tu casa van juntas o separadas?", "Si mañana tu cliente más grande se va, ¿cuánto dejarías de vender al mes?", "¿Cuánto te deben tus clientes hoy, y desde cuándo?", "¿Qué parte del negocio funciona especialmente bien?", "¿Qué es lo que más te preocupa del negocio hoy?"] },
    { clave: "epoca_dorada", nombre: "Su mejor época", preguntas: ["¿Hubo un año o una época en que el negocio vendía más que hoy? ¿Cuándo fue?", "¿Cuánto vendías en ese tiempo, más o menos?", "¿Qué hacías en esa época que hoy ya no haces?", "¿Qué cambió: qué dejaste de hacer tú, y qué cambió afuera (competencia, precios, la zona)?", "¿Los clientes de esa época siguen existiendo? ¿Alguien los volvió a buscar?", "De esa época, ¿qué habría que volver a hacer… y qué no habría que repetir?"] },
    { clave: "dependencia", nombre: "Dependencia", preguntas: ["Cuéntame tu último día normal en el negocio: desde que llegaste al local hasta que saliste, ¿qué fuiste haciendo?", "De todo lo que hiciste ese día, ¿qué podría haber hecho alguien de tu equipo?", "La última vez que te enfermaste o viajaste, ¿qué se detuvo en el negocio y qué siguió andando sin ti?"] },
    { clave: "brecha", nombre: "La brecha", preguntas: ["Entre el negocio que quieres y el que tienes hoy, ¿qué crees TÚ que ha sido el freno todos estos años?", "Si nada cambia y pasan dos años, ¿dónde queda el negocio? ¿Y tú?"] },
    { clave: "proposito", nombre: "Propósito", preguntas: ["¿Qué cambia en la vida de tus clientes porque tu negocio existe?", "¿Qué impacto quieres dejar con tu negocio?", "¿Qué no estás dispuesto a sacrificar por crecer?"] },
    { clave: "personas", nombre: "Personas", preguntas: ["¿Quiénes trabajan contigo y cómo llegó cada uno: familia, recomendado, aviso?", "La última persona que entró a trabajar contigo, ¿cómo la escogiste?", "¿Y la última que se fue o sacaste: qué pasó?", "Cuando algo sale mal en el negocio, ¿a quién llamas primero para que lo arregle?", "¿Quién de tu equipo puede decidir algo sin pedirte permiso? ¿Qué cosa?", "¿Qué persona de tu equipo te costaría más reemplazar mañana?", "¿Hay alguien que sigue en el equipo aunque sabes que ya no debería? ¿Qué te frena para decidir?", "¿Cuándo fue la última vez que alguien de tu equipo te dijo que estabas equivocado?"] },
    { clave: "procesos", nombre: "Procesos", preguntas: ["Cuéntame paso a paso qué pasa desde que un cliente te busca hasta que paga.", "¿En qué paso se traba más seguido?", "¿Qué trabajo se termina haciendo dos veces?", "¿Dónde queda apuntado todo: cuaderno, WhatsApp, Excel… o en la cabeza de alguien?", "Cuando la persona que hace una tarea no viene, ¿qué pasa con esa tarea?", "¿Qué cosa se sigue haciendo solo porque siempre se hizo así?"] },
    { clave: "producto", nombre: "Producto", preguntas: ["Cuando alguien te compra, ¿qué le prometes exactamente?", "¿Y qué recibe de verdad?", "¿En qué parte el cliente suele llevarse una mala impresión de tu negocio?", "Si mañana entra el triple de clientes, ¿qué pasa con la calidad de lo que entregas?", "De cada 10 clientes, ¿cuántos vuelven a comprarte o te mandan a alguien?"] },
    { clave: "marketing", nombre: "Marketing", preguntas: ["¿De dónde llegaron tus últimos cinco clientes nuevos?", "Si esa forma en que te llegan clientes se apaga un mes, ¿qué pasa con el negocio?", "Nómbrame tus tres mejores clientes. ¿Qué los hace los mejores?", "¿Quién quisieras que te compre… y quién te compra de verdad?", "De cada 10 personas que preguntan por lo que vendes, ¿cuántas terminan comprando?", "Al que pregunta y no compra, ¿alguien lo vuelve a buscar? ¿Dónde queda apuntado?", "¿Cómo decidiste los precios que cobras hoy?", "¿Cuánto gastas para que te llegue un cliente nuevo (anuncios, comisiones, lo que sea)?"] },
  ],
  lider: [
    { clave: "area_real", nombre: "Su área", preguntas: ["¿Qué resultado se espera de tu área y cómo sabes si lo cumpliste?", "¿Quién decide cuando aparece una excepción?", "¿Qué cosas tienes que consultarle al jefe que tú ya sabrías resolver?", "¿Qué pasa cuando el jefe no está?", "¿Quién resuelve de verdad?"] },
    { clave: "trabajo_real", nombre: "Trabajo real", preguntas: ["¿Dónde se traba tu área?", "¿Qué se rehace más de una vez?", "¿Dónde se pierde tiempo esperando?", "¿Qué información te falta para decidir?", "¿Qué Excel, WhatsApp o sistema paralelo usan porque el oficial no sirve?"] },
    { clave: "vision_lider", nombre: "Lo que ve", preguntas: ["¿Qué problema todos aceptan como normal?", "¿Qué escuchas de los clientes que Dirección probablemente no escucha?", "¿Qué eliminarías?", "¿Qué conservarías a toda costa?", "¿Qué crees que Dirección no ve?"] },
  ],
  personal: [
    { clave: "trabajo_real", nombre: "Trabajo real", preguntas: ["Cuéntame cómo haces realmente tu trabajo, paso a paso.", "¿Qué esperan que salga de tu trabajo cada día?", "¿Cómo sabes que lo hiciste bien?", "Cuando el procedimiento dice una cosa, ¿qué hacen realmente?", "¿Qué paso se saltan cuando hay urgencia?"] },
    { clave: "trabas", nombre: "Trabas", preguntas: ["¿En qué parte de tu trabajo pierdes más tiempo?", "¿Dónde te quedas esperando y a quién?", "¿Qué repites o rehaces más de una vez?", "¿Qué información te falta para hacer bien tu trabajo?", "¿Qué cosas tienes que consultarle al jefe que tú ya sabrías resolver?"] },
    { clave: "verdad_operativa", nombre: "Verdad operativa", preguntas: ["¿Qué pasa cuando hay urgencia?", "¿Qué pasa cuando el jefe no está?", "¿Quién resuelve de verdad?", "¿Qué problema todos aceptan como normal?", "¿Qué Excel, WhatsApp o sistema paralelo usas?", "¿Cómo sabes que algo va a salir mal antes de que falle?"] },
    { clave: "vision_personal", nombre: "Lo que ve", preguntas: ["¿Qué escuchas de los clientes?", "¿Qué eliminarías?", "¿Qué conservarías?", "¿Qué harías distinto si esta empresa fuera tuya?", "¿Qué crees que Dirección no ve?"] },
  ],
  know_how: [
    { clave: "know_how", nombre: "La Caleta", preguntas: ["¿Qué sabes hacer tú que alguien nuevo tardaría meses en aprender?", "¿Qué notas tú antes que los demás cuando algo va a salir mal?", "¿Qué haces diferente cuando aparece un caso complicado?", "¿Qué cosa importante de tu trabajo nunca quedó escrita?", "Si mañana no pudieras venir, ¿qué se perdería contigo?", "¿Qué error comete siempre un principiante que tú ya no cometes?", "¿Cuándo sabes que un problema te queda grande y hay que avisar?"] },
  ],
  validacion: [{ clave: "validacion", nombre: "Validación", preguntas: [] }],
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
