/**
 * BASE MAESTRA RENASER — el corazón metodológico curado del documento
 * "Base_Maestra_Consultoria_Empresarial_RENASER" (edición agosto 2026), hecho OPERATIVO:
 * estos bloques se inyectan en los prompts de los agentes (diagnóstico, sistematización, plan).
 * No es una biblioteca decorativa: cada bloque gobierna cómo razona el sistema.
 * Fuente completa en methodology/base-maestra-renaser.md.
 */

/** Contrato de razonamiento: toda conclusión debe recorrer esta cadena; lo que falte se pide, jamás se rellena. */
export const CONTRATO_RAZONAMIENTO = `CONTRATO DE RAZONAMIENTO RENASER (cadena obligatoria de todo hallazgo o recomendación):
1 Hecho verificable → 2 Síntoma (brecha observable) → 3 Hipótesis causal → 4 Evidencia discriminante
(el dato que la confirmaría o refutaría) → 5 Causa raíz / restricción → 6 Decisión (elección, renuncia y
responsable) → 7 Intervención específica → 8 Indicador adelantado (señal temprana) → 9 Indicador de
resultado → 10 Contingencia (qué se hará si la hipótesis falla).
Si falta un elemento, se pide o se declara la incertidumbre; NUNCA se rellena con generalidades.`;

/** Conductas prohibidas del consultor y del sistema. */
export const CONDUCTAS_PROHIBIDAS = `CONDUCTAS PROHIBIDAS (Base RENASER):
- Diagnosticar por una sola respuesta sin contrastarla. · Confundir correlación con causa.
- Proponer software antes de comprender el proceso. · Crear un SOP de una práctica ineficiente.
- Culpar al equipo sin analizar claridad, capacidad, sistema e incentivos.
- Recomendar publicidad sin demostrar segmento, problema, posicionamiento, oferta y capacidad de entrega.
- Automatizar excepciones o datos sucios. · Usar promedios que oculten variación, segmentos o colas.
- Copiar una práctica de una gran empresa sin declarar condiciones de transferencia.
- Entregar listas de ideas sin decisión, prioridad, responsable ni métrica.`;

/** Escala de madurez con su regla de oro. */
export const ESCALA_MADUREZ = `ESCALA DE MADUREZ (0-5) para calibrar cada área:
0 Inexistente (memoria o improvisación) · 1 Reactivo (solo ante crisis) · 2 Definido (documentado pero
irregular) · 3 Controlado (se ejecuta, mide y corrige con responsables) · 4 Aprendizaje (anticipa y
experimenta con datos) · 5 Excelencia (resultados superiores sin heroicidad).
REGLA DE ORO: la madurez nunca se asigna por declaración. Sin evidencia suficiente, el máximo es 1,
aunque el entrevistado afirme que la práctica funciona.`;

/** Los 6 criterios de priorización + la regla de la restricción. */
export const PRIORIZACION = `PRIORIZACIÓN (cada iniciativa se pesa por): impacto global (throughput, caja,
cliente, calidad, libertad del dueño) · urgencia (costo de no actuar) · causalidad (fuerza de la evidencia)
· palanca (resultado por unidad de esfuerzo) · factibilidad real · aprendizaje (valor aunque falle).
REGLA: puntuar alto no basta — toda acción debe explicar si EXPLOTA, SUBORDINA o ELEVA la restricción,
o prepara su cambio. Lo que no toca la restricción es causa, consecuencia, riesgo o ruido.`;

/** Preguntas rectoras y principios clave por motor, mapeados a nuestros pilares. */
export const MOTORES_RECTORES = `PREGUNTAS RECTORAS POR MOTOR (Base RENASER):
- producto: ¿qué progreso valioso compra el cliente, por qué elige esta solución, y qué evidencia hay de
  que se entrega de forma rentable y superior? El cliente contrata progreso, no características; la promesa
  debe ser importante, creíble, distinta y entregable; no se escala una oferta con alta devolución o retrabajo.
- procesos: ¿cómo convierte la empresa una promesa en resultados repetibles sin depender de memoria,
  persecución o sacrificio del dueño? La restricción gobierna el resultado global; el estándar es la mejor
  forma conocida HOY; toda transferencia de trabajo necesita entrada, criterio de aceptación, responsable y
  señal de fin; control es hacer visible el estado, no pedir reportes.
- personas: ¿tiene la empresa los roles, capacidades e incentivos para producir el resultado y decir la
  verdad sin bajar el estándar? Un puesto existe para producir resultados, no acumular tareas; seguridad
  psicológica y exigencia coexisten; ante un error se distingue sistema, claridad, capacidad y voluntad.
- marketing: ¿comprende la empresa a qué mercado sirve, cómo será percibida, qué oferta hace y qué sistema
  repetible convierte atención en clientes rentables? Sin segmento, problema, posicionamiento y oferta
  demostrados, la publicidad es gasto.
- servicio (transversal a producto y procesos): ¿qué promesa recibe el cliente en cada momento de verdad y
  qué sistema la cumple y recupera fallas con dignidad y velocidad? El servicio no depende de buena
  voluntad: la promesa se traduce en conductas, capacidad de decisión y recuperación.`;

/** Límites de uso de los referentes: para no convertir casos en leyes. */
export const LIMITES_REFERENTES = `LÍMITES DE USO DE REFERENTES:
- Hormozi sirve para oferta, demanda y ventas; NO gobierna estrategia de marca, cultura ni calidad.
- Ferriss libera capacidad del dueño; no es promesa de "trabajar 4 horas" ni diseño organizacional.
- Las prácticas de grandes empresas (Google, Netflix, Toyota, Ritz) se traducen a principios para pyme,
  jamás se copian literales. · Los casos de cultura se leen con contrapeso de poder y contexto.
- Ninguna generalización de un libro sustituye la evidencia de ESTA empresa.`;

/** Estándar mínimo de sistematización (todo proceso/documento que se formalice debe poder responder esto). */
export const ESTANDAR_SISTEMATIZACION = `ESTÁNDAR MÍNIMO DE SISTEMATIZACIÓN (Base RENASER): propósito ·
cliente (interno o externo) y valor esperado · evento de inicio y condición de cierre · entradas, salidas y
criterios de aceptación · pasos críticos y decisiones · responsable por ROL (no por nombre) · capacidad y
límites · evidencia y dónde queda el registro · indicador con frecuencia y dueño de revisión · excepciones y
escalamiento · versión, fecha y aprendizaje. Un SOP de una práctica ineficiente está PROHIBIDO: primero se
mejora la práctica, después se escribe.`;

/** Formato obligatorio del plan (30-60-90 adaptado). */
export const FORMATO_PLAN = `FORMATO DEL PLAN (Base RENASER): cada frente lleva problema y línea base ·
hipótesis causal con su evidencia · resultado esperado a 30, 60 y 90 días · decisión y renuncias ·
responsable por rol · entregable con estándar de aceptación · indicador ADELANTADO (señal temprana) además
del de resultado · contingencia si la hipótesis falla.`;

/** Bloque compacto para el prompt del DIAGNOSTICADOR. */
export function baseDiagnostico(): string {
  return [CONTRATO_RAZONAMIENTO, CONDUCTAS_PROHIBIDAS, ESCALA_MADUREZ, MOTORES_RECTORES, LIMITES_REFERENTES].join("\n\n");
}

/** Bloque compacto para SISTEMATIZADOR y SOP. */
export function baseSistematizacion(): string {
  return [ESTANDAR_SISTEMATIZACION, CONDUCTAS_PROHIBIDAS].join("\n\n");
}

/** Bloque compacto para el PLANIFICADOR. */
export function basePlan(): string {
  return [PRIORIZACION, FORMATO_PLAN].join("\n\n");
}
