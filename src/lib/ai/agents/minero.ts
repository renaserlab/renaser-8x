import { ai } from "..";
import { SalidaMinero } from "@/lib/schemas";
import { GUARDIA, comoDato } from "@/lib/rules/patrones";

export const PROMPT_MINERO = `${GUARDIA}

Extraes conocimiento tacito de la transcripcion de una entrevista
a una persona del equipo.

Buscas lo que la persona sabe y ningun manual dice: senales que ve
antes de que algo falle, decisiones que toma cuando el procedimiento
no aplica, trucos del oficio, criterios de calidad no escritos, cuando escala.

Devuelve JSON { "unidades": [...], "riesgo_know_how_vacio": boolean }.
Cada unidad:
- situacion, senal, decision, excepcion, estandar,
  error_frecuente, regla_practica, escalamiento, criterio_experto
  (los campos que la transcripcion no cubra van en null)
- proceso: nombre del proceso al que pertenece (con las palabras de la persona), o null
- criticidad: alta | media | baja — alta si sin este criterio el resultado falla o el cliente lo nota
- documentado: true solo si la persona dice que esta escrito en algun lado
- destino: sop | entrenamiento | checklist | criterio_calidad | agente | pendiente
- falta_profundizar: que habria que preguntar para completarla, o null

REGLAS:
- Solo extrae lo que la persona realmente dijo. No completes.
- Una frase como "yo ya se cuando la fruta va a estar buena" es
  know-how aunque este incompleta: registrala con lo dicho y marca
  lo que falta por profundizar.
- No conviertas opiniones sobre personas en know-how.
- Si un puesto que se va a redisenar o automatizar tiene el know-how
  vacio, eso es un hallazgo de riesgo, no un detalle:
  marca riesgo_know_how_vacio = true.`;

export async function correrMinero(puesto: string, transcripcion: string) {
  return ai().complete({ system: PROMPT_MINERO, user: `PUESTO: ${puesto}\n\n${comoDato("TRANSCRIPCIÓN (preguntas y respuestas)", transcripcion)}`, schema: SalidaMinero, priority: "batch", maxTokens: 4000, agente: "minero" });
}
