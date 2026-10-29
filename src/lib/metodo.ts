/**
 * LA POLÍTICA DEL MÉTODO RENASER, EN UN SOLO LUGAR.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. Los números del método estaban escritos como literales sueltos
 * dentro de los prompts de los agentes: «(5-20)» en el investigador, «máximo 10» en el
 * organizador. Eso tenía tres problemas. Nadie podía leer la metodología sin abrir siete prompts.
 * Cambiar un número era editar una cadena de texto. Y un número dentro de un prompt es una
 * sugerencia al modelo, no una regla del sistema.
 *
 * Aquí los números viven una sola vez, con la razón de ser de cada uno al lado, y de aquí los
 * leen tanto los prompts como los esquemas que validan la salida. Si alguien vuelve a escribir
 * una cantidad a mano en un prompt, la prueba `tests/metodo-gobernado.test.ts` falla.
 *
 * TOPE vs EXPECTATIVA. No es lo mismo y el sistema tiene que distinguirlo:
 *   · TOPE: pasarse está prohibido. El esquema lo rechaza.
 *   · EXPECTATIVA: es lo normal, no el límite. Pasarse se permite PERO hay que decir por qué.
 * Confundir las dos cosas es lo que convierte un método en una camisa de fuerza, o en nada.
 *
 * Fijado con Kelin (RENASER) el 18-10-2026.
 */

/** Los tres momentos en que el método decide cuántos procesos se tocan. No son el mismo número. */
export const PROCESOS = {
  /**
   * CAPTURA. Cuando la empresa no tiene ningún proceso claro, le proponemos que nos cuente unos
   * pocos. Es TOPE duro: más de ocho no se le pide a nadie que no tiene nada escrito, porque la
   * conversación se vuelve un interrogatorio y el dueño abandona.
   */
  captura: { minimo: 5, tope: 8, naturaleza: "tope" as const },

  /**
   * SISTEMATIZACIÓN. Aquí el propósito es mapear TODOS los procesos necesarios, no unos pocos.
   * Diez a quince es la EXPECTATIVA, no el límite: una empresa de tres sedes y cuatro líneas de
   * negocio puede necesitar más, y si los necesita se hacen. Lo que no se permite es pasarse en
   * silencio: hay que decir por qué este negocio exige más de lo normal.
   *
   * `tope_tecnico` NO es una regla del método: es el freno que impide que una respuesta
   * desbocada entre a la base como si fuera un mapa de procesos. Antes decía 30, y eso estaba
   * mal: la primera empresa cliente —una casa de cambio de tres sedes— tiene 33 procesos confirmados, así que el
   * esquema rechazaba la radiografía de la primera empresa real. El freno tiene que vivir por
   * encima de cualquier empresa que podamos atender, no al borde de la que ya atendemos.
   */
  sistematizacion: { esperado_min: 10, esperado_max: 15, tope_tecnico: 60, naturaleza: "expectativa" as const },

  /**
   * INTERVENCIÓN. Las pocas que mueven todas las ruedas. Es UNO a TRES, no siempre tres: forzar
   * tres cuando la empresa tiene una sola restricción de verdad diluye la intervención. la primera empresa cliente
   * es el caso: su única afirmación confirmada de dolor operativo es el cuadre de caja.
   */
  intervencion: { minimo: 1, tope: 3, naturaleza: "tope" as const },
} as const;

/**
 * Frentes abiertos a la vez en el plan. Es la misma regla que la intervención, aplicada al
 * calendario: pocos frentes de verdad. Abrir seis frentes es no haber priorizado, y el dueño
 * termina sin terminar ninguno.
 */
export const FRENTES_SIMULTANEOS = { tope: 3, naturaleza: "tope" as const } as const;

/** Cuántos puestos propone el modelo del rubro. Proporcional al tamaño de ESTA empresa. */
export const ESTRUCTURA = { minimo: 3, tope: 12, naturaleza: "tope" as const } as const;

/** Obligaciones regulatorias del rubro. Tope bajo a propósito: el detalle lo valida asesoría. */
export const NORMATIVA = { tope: 8, naturaleza: "tope" as const } as const;

/** Estándares de servicio e indicadores de clase mundial del rubro. */
export const ESTANDARES = { minimo: 3, tope: 10, naturaleza: "tope" as const } as const;
export const INDICADORES_RUBRO = { minimo: 3, tope: 10, naturaleza: "tope" as const } as const;

/** Las brechas que se le dicen sin anestesia. Mismo criterio que la intervención: una a tres. */
export const BRECHAS = { minimo: 1, tope: 3, naturaleza: "tope" as const } as const;

/**
 * Los dos servicios, con el momento del método que le corresponde a cada uno.
 * El plazo es objetivo, no promesa: depende del alcance contratado.
 */
export const SERVICIOS = {
  estructuracion: {
    nombre: "Estructuración empresarial",
    plazo_objetivo: "hasta 1 semana",
    procesos: "captura" as const,
    cierra_con: "Diseño aprobado, decisiones resueltas, responsables asignados y primeras acciones iniciadas.",
  },
  sistematizacion: {
    nombre: "Sistematización completa con estrategia",
    plazo_objetivo: "2 semanas a 1 mes",
    procesos: "sistematizacion" as const,
    cierra_con: "Uso real demostrado del alcance, capacitación hecha y evidencias aceptadas.",
  },
} as const;

/** Redacta el rango para meterlo en un prompt, sin que nadie escriba el número a mano. */
export function rango(r: { minimo: number; tope: number }): string {
  return `${r.minimo}-${r.tope}`;
}

/**
 * Redacta la instrucción de una expectativa. Dice lo normal Y que pasarse exige explicarlo,
 * porque una expectativa sin esa segunda mitad se lee como tope y recorta el trabajo.
 */
export function expectativa(e: { esperado_min: number; esperado_max: number; tope_tecnico: number }): string {
  return (
    `normalmente ${e.esperado_min} a ${e.esperado_max}; si este rubro y este tamaño exigen más, ` +
    `devuelve TODOS los que haga falta y explica en por_que_mas_de_lo_esperado qué tiene este ` +
    `negocio que obliga a pasar de ${e.esperado_max}. No recortes la lista para quedar en el ` +
    `rango: un proceso que existe y no se mapea queda sin dueño`
  );
}
