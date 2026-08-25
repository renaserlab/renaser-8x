/**
 * ESTÁNDARES DE UNA EMPRESA QUE CRECE — el criterio experto contra el que se audita lo que la empresa muestra.
 * No es un checklist para culpar: es la vara. Cuando la empresa cuenta cómo hace algo, el diagnóstico compara
 * contra esto y nombra la brecha exacta (patrón: brecha_estandar). Mandato de Kelin: "poner estándares que
 * realmente deberían tener las empresas para que crezcan; actuar como el consultor al que contrato".
 */

export const ESTANDARES: Record<string, string[]> = {
  personas: [
    "Cada puesto tiene por escrito qué debe entregar (una frase) y cómo se sabe si cumplió (un indicador simple)",
    "La autoridad está definida: qué puede decidir cada persona sin consultar, y hasta cuánto (montos, casos)",
    "Existe una forma definida de enseñar a un nuevo (quién le enseña, qué debe saber, cuándo trabaja solo)",
    "Ningún conocimiento crítico vive en una sola cabeza sin respaldo escrito o segunda persona entrenada",
    "Hay conversación periódica de desempeño (aunque sea mensual e informal, pero con fecha y registro)",
    "La contratación compara al menos dos opciones contra el puesto, no solo la confianza o el parentesco",
  ],
  procesos: [
    "Los tres procesos vitales (conseguir clientes, entregar, cobrar) tienen responsable único, inicio y fin claros",
    "El estado del trabajo se puede VER en un registro (cuaderno, pizarra, Excel), no solo preguntando a alguien",
    "Existe un estándar de calidad verificable ANTES de que el cliente vea el resultado (quién revisa y qué mira)",
    "Las excepciones frecuentes tienen respuesta definida (qué hacer, quién decide), no improvisación cada vez",
    "Lo que se hace más de 3 veces por semana a mano tiene candidato a plantilla, checklist o automatización",
    "La caja del negocio está separada de la de la casa, y el día cierra con un cuadre apuntado",
  ],
  producto: [
    "La promesa al cliente es explícita y verificable (qué recibe, cuándo, en qué condición)",
    "Hay control de calidad con criterio nombrado antes de entregar — el cliente nunca es el control de calidad",
    "Se conoce el costo y la ganancia POR producto o servicio, no solo el total del mes",
    "La recompra o permanencia se mide (aunque sea contando: de cada 10, cuántos vuelven)",
    "Los reclamos quedan registrados y cada reclamo repetido produce un cambio, no solo una disculpa",
  ],
  marketing: [
    "Todo interesado queda apuntado: quién preguntó, qué quería, en qué quedó (cuaderno o Excel basta)",
    "El seguimiento tiene responsable y plazo: al que no compró se le vuelve a buscar en una fecha definida",
    "Hay más de un canal de llegada de clientes, o al menos conciencia del riesgo de depender de uno",
    "El precio tiene lógica de ganancia conocida, no solo 'lo que cobra la competencia'",
    "Se pide recomendación o reseña de forma sistemática a los clientes contentos, no solo cuando se acuerdan",
    "A los clientes antiguos que dejaron de comprar alguien los reactiva (la venta más barata disponible)",
  ],
};

/** Bloque para el prompt del diagnosticador. */
export function estandaresComoTexto(pilar: string): string {
  const lista = ESTANDARES[pilar];
  if (!lista) return "";
  return lista.map((e) => "- " + e).join("\n");
}
