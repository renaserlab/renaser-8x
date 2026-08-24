/**
 * Cobertura de entrevistas (1.1, 1.4). Una sesión no se cierra hasta cubrir sus bloques obligatorios.
 * El banco es la fuente única: lo lee el prompt del ENTREVISTADOR y lo comprueba el handler en código.
 */

export type Bloque = { clave: string; nombre: string; preguntas: string[] };

export const BLOQUES: Record<string, Bloque[]> = {
  sueno_dueno: [
    { clave: "origen", nombre: "Origen", preguntas: ["Cuéntame el día que decidiste empezar este negocio: ¿qué estaba pasando en tu vida?", "¿Con qué empezaste: cuánta plata tenías, quién te ayudó?", "De lo que soñabas ese día, ¿qué se cumplió y qué no?"] },
    { clave: "historia_intentos", nombre: "Lo que ya intentó", preguntas: ["¿Qué has intentado ya para que el negocio crezca… y qué pasó con cada intento?", "¿Qué te ha recomendado gente de confianza que nunca terminaste de hacer? ¿Qué te frenó?", "¿Hubo alguna época en que el negocio estuvo mejor que hoy? ¿Qué era distinto entonces?"] },
    { clave: "empresa_deseada", nombre: "Empresa deseada", preguntas: ["Si dentro de tres años todo sale bien y yo visito tu negocio, ¿qué veo? Cuéntamelo: cuánta gente, qué locales, qué se vende.", "¿Qué haces tú ese día… y qué ya no haces?", "¿Qué parte del negocio NO quieres que crezca ni cambie?"] },
    { clave: "vida_deseada", nombre: "Vida deseada", preguntas: ["Imagina un martes normal ideal dentro de tres años: ¿dónde estás?", "¿Qué haces tú personalmente ese día?", "¿Cuántas horas trabajas a la semana?", "¿Qué quieres poder hacer fuera de la empresa?"] },
    { clave: "rol", nombre: "Rol", preguntas: ["¿Qué es lo que más te gusta hacer en el negocio?", "¿Qué haces bien pero ya te cansó?", "¿Qué haces solo porque nadie más puede hacerlo?"] },
    { clave: "exito", nombre: "Éxito", preguntas: ["¿Cuándo fue la última vez que te sentiste orgulloso de tu negocio? ¿Qué había pasado?", "¿Cuánto tendría que entrar al mes para que estés tranquilo? ¿Cuánto es suficiente para ti?", "¿Qué quieres dejar construido?"] },
    { clave: "verdad_dificil", nombre: "Verdad difícil", preguntas: ["¿Qué sabes que debe cambiar?", "¿Qué decisión llevas tiempo postergando… y qué te cuesta cada mes no tomarla?", "¿Qué es lo que más miedo te da soltar? ¿Qué es lo peor que crees que pasaría?", "¿Qué cambiarías si nadie te juzgara?"] },
  ],
  empresa_dueno: [
    { clave: "hoy", nombre: "Hoy", preguntas: ["¿Qué empresa tienes hoy?", "¿Qué vendes y a quién?", "¿Dónde se concentra hoy el dinero?", "En un mes normal, ¿cuánta plata entra en total… y cuánto queda para ti después de pagar todo?", "Al final del día, ¿cómo sabes cuánto vendiste y cuánto quedó? ¿Dónde se apunta?", "¿La plata del negocio y la de tu casa van juntas o separadas?", "Si mañana tu cliente más grande se va, ¿cuánto pierdes?", "¿Cuánto te deben hoy, y desde cuándo?", "¿Qué funciona especialmente bien?", "¿Qué te preocupa?"] },
    { clave: "dependencia", nombre: "Dependencia", preguntas: ["Cuéntame tu día de ayer completo: desde que llegaste hasta que te fuiste, ¿qué hiciste?", "De todo lo que hiciste ayer, ¿qué podría haber hecho otra persona si tú no estabas?", "La última vez que te enfermaste o viajaste, ¿qué se detuvo y qué siguió andando?"] },
    { clave: "brecha", nombre: "La brecha", preguntas: ["Entre la empresa que quieres y la que tienes hoy, ¿qué crees TÚ que ha sido el freno todos estos años?", "Si nada cambia y pasan dos años, ¿dónde queda el negocio? ¿Y tú?"] },
    { clave: "proposito", nombre: "Propósito", preguntas: ["¿Qué cambia en la vida de tus clientes porque este negocio existe?", "¿Qué impacto quieres dejar?", "¿Qué no estás dispuesto a sacrificar?"] },
    { clave: "personas", nombre: "Personas", preguntas: ["¿Quiénes trabajan contigo y cómo llegó cada uno: familia, recomendado, aviso?", "La última persona que entró, ¿cómo la escogiste?", "¿Y la última que se fue o sacaste: qué pasó?", "Cuando algo sale mal, ¿a quién buscas primero?", "¿Quién puede decidir algo sin pedirte permiso? ¿Qué cosa?", "¿Qué persona te costaría más reemplazar mañana?", "¿Hay alguien que sigue en el equipo aunque sabes que ya no debería? ¿Qué te frena?", "¿Cuándo fue la última vez que alguien del equipo te dijo que estabas equivocado?"] },
    { clave: "procesos", nombre: "Procesos", preguntas: ["Cuéntame paso a paso qué pasa desde que entra un cliente hasta que paga.", "¿Dónde se traba habitualmente?", "¿Qué se rehace más de una vez?", "¿Dónde queda apuntado todo: cuaderno, WhatsApp, Excel… o en la cabeza de alguien?", "¿Qué pasa cuando la persona que lo hace no está?", "¿Qué actividad existe solo porque siempre se hizo así?"] },
    { clave: "producto", nombre: "Producto", preguntas: ["¿Qué le prometes exactamente al cliente?", "¿Qué recibe efectivamente?", "¿Cómo lo demuestras?", "¿Dónde se rompe la experiencia?", "¿Qué pasa con la calidad si mañana entra el triple de clientes?", "De cada 10 clientes, ¿cuántos vuelven a comprarte o te mandan a alguien?"] },
    { clave: "marketing", nombre: "Marketing", preguntas: ["¿De dónde llegaron tus últimos cinco clientes nuevos?", "¿Qué pasa si esa forma de llegar deja de funcionar un mes?", "Nómbrame tus tres mejores clientes: ¿por qué ellos?", "¿Quién quisieras que te compre… y quién te compra de verdad?", "De cada 10 que preguntan, ¿cuántos terminan comprando?", "Al que pregunta y no compra, ¿alguien lo vuelve a buscar? ¿Dónde queda apuntado?", "¿Cómo pusiste tu precio actual?", "¿Cuánto gastas para que te llegue un cliente nuevo (anuncios, comisiones, lo que sea)?"] },
  ],
  lider: [
    { clave: "area_real", nombre: "Su área", preguntas: ["¿Qué resultado se espera de tu área y cómo sabes si lo cumpliste?", "¿Quién decide cuando aparece una excepción?", "¿Qué decisiones tienes que escalar que podrías tomar tú?", "¿Qué pasa cuando el jefe no está?", "¿Quién resuelve de verdad?"] },
    { clave: "trabajo_real", nombre: "Trabajo real", preguntas: ["¿Dónde se traba tu área?", "¿Qué se rehace más de una vez?", "¿Dónde se pierde tiempo esperando?", "¿Qué información te falta para decidir?", "¿Qué Excel, WhatsApp o sistema paralelo usan porque el oficial no sirve?"] },
    { clave: "vision_lider", nombre: "Lo que ve", preguntas: ["¿Qué problema todos aceptan como normal?", "¿Qué escuchas de los clientes que Dirección probablemente no escucha?", "¿Qué eliminarías?", "¿Qué conservarías a toda costa?", "¿Qué crees que Dirección no ve?"] },
  ],
  personal: [
    { clave: "trabajo_real", nombre: "Trabajo real", preguntas: ["Cuéntame cómo haces realmente tu trabajo, paso a paso.", "¿Qué resultado esperan de ti?", "¿Cómo sabes que lo hiciste bien?", "Cuando el procedimiento dice una cosa, ¿qué hacen realmente?", "¿Qué paso se saltan cuando hay urgencia?"] },
    { clave: "trabas", nombre: "Trabas", preguntas: ["¿Dónde pierdes tiempo?", "¿Dónde te quedas esperando y a quién?", "¿Qué repites o rehaces más de una vez?", "¿Qué información te falta?", "¿Qué decisión tienes que escalar que podrías tomar tú?"] },
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
