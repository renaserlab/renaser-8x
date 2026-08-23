/**
 * Cobertura de entrevistas (1.1, 1.4). Una sesión no se cierra hasta cubrir sus bloques obligatorios.
 * El banco es la fuente única: lo lee el prompt del ENTREVISTADOR y lo comprueba el handler en código.
 */

export type Bloque = { clave: string; nombre: string; preguntas: string[] };

export const BLOQUES: Record<string, Bloque[]> = {
  sueno_dueno: [
    { clave: "origen", nombre: "Origen", preguntas: ["¿Por qué empezaste esta empresa?", "¿Qué querías conseguir con ella?", "¿Qué parte de ese sueño sigue viva?", "¿Qué cambió desde entonces?"] },
    { clave: "empresa_deseada", nombre: "Empresa deseada", preguntas: ["¿Qué empresa quieres construir realmente?", "¿Qué debería ser verdad dentro de tres años?", "¿Qué tamaño quieres tener?", "¿Qué NO necesita crecer?"] },
    { clave: "vida_deseada", nombre: "Vida deseada", preguntas: ["Imagina un martes normal ideal dentro de tres años: ¿dónde estás?", "¿Qué haces tú personalmente ese día?", "¿Qué ya no haces?", "¿Cuántas horas trabajas a la semana?", "¿Qué quieres poder hacer fuera de la empresa?"] },
    { clave: "rol", nombre: "Rol", preguntas: ["¿Qué amas hacer en la empresa?", "¿Qué haces bien pero ya no quieres hacer?", "¿Qué haces porque nadie más puede?", "¿Qué responsabilidades conservarías siempre?"] },
    { clave: "exito", nombre: "Éxito", preguntas: ["¿Qué significa éxito para ti?", "¿Cuánto es suficiente?", "¿Qué no estás dispuesto a sacrificar?", "¿Qué quieres dejar construido?"] },
    { clave: "verdad_dificil", nombre: "Verdad difícil", preguntas: ["¿Qué sabes que debe cambiar?", "¿Qué decisión estás postergando?", "¿Qué no quieres soltar?", "¿Qué cambiarías si nadie te juzgara?"] },
  ],
  empresa_dueno: [
    { clave: "hoy", nombre: "Hoy", preguntas: ["¿Qué empresa tienes hoy?", "¿Qué vendes y a quién?", "¿Dónde se concentra hoy el dinero?", "¿Qué funciona especialmente bien?", "¿Qué área sabes que está rota?", "¿Qué te preocupa?"] },
    { clave: "dependencia", nombre: "Dependencia", preguntas: ["¿Qué sigue dependiendo de ti?", "¿Qué pasaría si desaparecieras un mes?", "¿Cuántas decisiones al día pasan por ti?"] },
    { clave: "proposito", nombre: "Propósito", preguntas: ["¿Qué cambia en la vida de las personas porque esta empresa existe?", "¿Qué impacto quieres dejar?", "¿Qué no estás dispuesto a sacrificar?"] },
    { clave: "personas", nombre: "Personas", preguntas: ["¿Quién responde si un resultado no ocurre?", "¿Quién decide ante una excepción?", "¿Puede decidir sin pedirte permiso?", "¿Cómo sabes que alguien desempeña bien su puesto?", "¿Qué puesto te costaría más reemplazar mañana?", "¿Cuándo fue la última vez que alguien te dijo que estabas equivocado?"] },
    { clave: "procesos", nombre: "Procesos", preguntas: ["Cuéntame paso a paso qué pasa desde que entra un cliente hasta que paga.", "¿Dónde se traba habitualmente?", "¿Qué se rehace más de una vez?", "¿Dónde vive la información?", "¿Qué pasa cuando la persona que lo hace no está?", "¿Qué actividad existe solo porque siempre se hizo así?"] },
    { clave: "producto", nombre: "Producto", preguntas: ["¿Qué le prometes exactamente al cliente?", "¿Qué recibe efectivamente?", "¿Cómo lo demuestras?", "¿Dónde se rompe la experiencia?", "¿Qué pasa con la calidad si mañana entra el triple de clientes?", "¿Cuántos clientes vuelven o recomiendan?"] },
    { clave: "marketing", nombre: "Marketing", preguntas: ["¿De dónde vienen tus clientes hoy? ¿Todos del mismo lugar?", "¿Qué pasa si ese canal deja de funcionar un mes?", "¿Ese cliente ideal es el que realmente compra?", "¿Qué pasa con un interesado que no compra de inmediato?", "¿Cómo pusiste tu precio actual?", "¿Cuánto te cuesta conseguir un cliente?"] },
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
    { clave: "know_how", nombre: "Lo que sabes", preguntas: ["¿Qué sabes tú que alguien nuevo no sabría aunque leyera el manual?", "¿Qué señal detectas antes de que el problema aparezca?", "¿Cómo decides cuando el procedimiento no aplica?", "¿Qué error comete un principiante?", "¿Cómo reconoces un trabajo excelente sin mirar un indicador?", "¿Qué hace distinto la mejor persona de este puesto?", "¿Cuándo sabes que debes escalar el problema?"] },
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
