/**
 * La frontera (capítulo 34) en la capa de servidor, espejo exacto de la vista `claims_cliente` del esquema.
 * Las rutas que usan la service role NO pueden apoyarse en RLS: deben construir la fila del cliente con esta función.
 * Cualquier columna que no esté aquí no sale hacia un cliente.
 */

export const COLUMNAS_CLIENTE_CLAIM = ["id", "texto", "fecha", "fuente", "fuente_tipo", "requiere_validacion", "pregunta", "opciones", "contradiccion"] as const;
export const COLUMNAS_INTERNAS_CLAIM = ["estado", "pilar", "tipo", "temporalidad", "contradice_a", "explicacion_contradiccion", "pregunta_sugerida", "participant_id", "validado_por", "source_id", "fragment_id", "prioridad_validacion"] as const;

export type ClaimInterno = {
  id: string;
  texto: string;
  estado: string;
  participant_id: string | null;
  fecha_afirmacion: string | null;
  prioridad_validacion: boolean;
  contradice_a: string | null;
  [k: string]: unknown;
};

export type FilaCliente = {
  id: string;
  texto: string;
  fecha: string | null;
  fuente: string;
  fuente_tipo: string | null;
  requiere_validacion: boolean;
  pregunta: string;
  opciones: readonly ["si", "ya_no", "nunca"];
  contradiccion: { texto: string; fuente: string } | null;
};

export const OPCIONES = ["si", "ya_no", "nunca"] as const;

/** ¿Puede el cliente ver este claim? Documentos y lo que él mismo dijo; nunca lo de otras personas. */
export function visibleParaCliente(c: ClaimInterno, participantesDelUsuario: Set<string>): boolean {
  return c.participant_id === null || participantesDelUsuario.has(c.participant_id);
}

export function filaCliente(c: ClaimInterno, fuente: string, fuente_tipo: string | null, contraparte?: { texto: string; fuente: string } | null): FilaCliente {
  const contradicho = c.estado === "contradicho";
  return {
    id: c.id,
    texto: c.texto,
    fecha: c.fecha_afirmacion,
    fuente,
    fuente_tipo,
    requiere_validacion: contradicho || (c.estado === "sin_verificar" && !!c.prioridad_validacion),
    pregunta: contradicho ? "Aquí hay dos versiones distintas. ¿Cuál es la verdad hoy?" : "¿Esto sigue siendo verdad?",
    opciones: OPCIONES,
    contradiccion: contradicho && contraparte ? contraparte : null,
  };
}

/** Garantía estática: una fila de cliente jamás contiene columnas internas. */
export function sinColumnasInternas(fila: Record<string, unknown>): boolean {
  return !COLUMNAS_INTERNAS_CLAIM.some((k) => k in fila);
}
