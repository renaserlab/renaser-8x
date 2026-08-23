/** Los patrones ocultos. Capítulo 10. Son hipótesis que el DIAGNOSTICADOR puede nombrar y el AUDITOR debe intentar derribar. */

export const PATRONES: { clave: string; nombre: string; firma: string }[] = [
  { clave: "dependencia_fundador", nombre: "Dependencia invisible del fundador", firma: "El organigrama declara delegación; los procesos muestran N decisiones que vuelven al fundador" },
  { clave: "cultura_declarada_vs_real", nombre: "Cultura declarada ≠ cultura real", firma: "Valor declarado 'responsabilidad'; ningún puesto con dueño de resultado" },
  { clave: "vision_obsoleta", nombre: "Visión obsoleta", firma: "Plan estratégico antiguo sin validación; el dueño describe otra compañía" },
  { clave: "personas_disfrazado_de_proceso", nombre: "Problema de personas disfrazado de proceso", firma: "Un proceso funciona con nueve personas y falla siempre con una" },
  { clave: "proceso_disfrazado_de_personas", nombre: "Problema de proceso disfrazado de personas", firma: "Tres personas distintas fracasan en la misma actividad" },
  { clave: "producto_excelente_marketing_mediocre", nombre: "Producto excelente, marketing mediocre", firma: "Alta satisfacción y recompra, baja adquisición" },
  { clave: "marketing_excelente_producto_debil", nombre: "Marketing excelente, producto débil", firma: "Alta venta, baja retención, problemas de entrega" },
  { clave: "crecimiento_destruye_excelencia", nombre: "Crecimiento que destruye excelencia", firma: "Más ventas correlacionan con peores indicadores de calidad" },
  { clave: "automatizacion_equivocada", nombre: "Automatización equivocada", firma: "Se intenta automatizar un proceso que debería desaparecer" },
  { clave: "trabajo_sin_valor", nombre: "Trabajo sin valor", firma: "Actividad que existe porque 'siempre se hizo así', sin consumidor aguas abajo" },
  { clave: "canal_unico", nombre: "Canal único", firma: "100% de la adquisición depende de una sola fuente" },
  { clave: "cuello_financiero_invisible", nombre: "Cuello de botella financiero invisible", firma: "Todo el dinero pasa por una persona sin respaldo ni proceso" },
];

export function patronesComoTexto(): string {
  return PATRONES.map((p) => `- ${p.clave}: ${p.nombre}. Firma: ${p.firma}`).join("\n");
}

export const LENTES = `
- Lemonis (People, Process, Product): ¿las personas correctas? ¿el proceso produce? ¿el producto responde al mercado real?
- McKinsey (claridad y accountability): ¿quién es dueño de cada resultado? ¿el trabajo está diseñado alrededor del valor?
- Hormozi (oferta y adquisición): ¿qué tan grande es el valor percibido? ¿de dónde vienen los clientes? ¿qué pasa si ese canal muere?
- Jobs/Apple (simplicidad y experiencia): ¿qué sobra? ¿dónde se rompe la experiencia? ¿esto es extraordinario o solo cumple?
- Collins (propósito e institución): ¿qué se preserva siempre? ¿la empresa funciona sin sus héroes?
- Lean (flujo de valor): ¿qué paso crea valor y cuál es desperdicio? ¿optimizar aquí daña el flujo completo?
- EOS (ejecución): ¿los problemas se resuelven en la raíz? ¿existe cadencia de ejecución?
Regla: los lentes sirven para PREGUNTAR. Solo la evidencia interna sirve para AFIRMAR.`;
