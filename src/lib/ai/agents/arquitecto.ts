import { ai } from "..";
import { SalidaArquitecto, SalidaToBe, SalidaSop } from "@/lib/schemas";

export const PROMPT_ARQUITECTO = `Recibes la descripcion de un proceso empresarial en lenguaje natural,
posiblemente transcrita de una nota de voz y con lenguaje coloquial.
Devuelve el flujograma como JSON.

{
  "nombre": "...",
  "area": "...",
  "nodos": [
    { "id": "n1", "tipo": "inicio", "etiqueta": "Lead entra por WhatsApp" },
    { "id": "n2", "tipo": "actividad", "etiqueta": "Asesor contacta",
      "responsable": "Asesor comercial", "ejecutor": "humano",
      "herramienta": "WhatsApp" },
    { "id": "n3", "tipo": "decision", "etiqueta": "Respondio?" },
    { "id": "n4", "tipo": "fin", "etiqueta": "Lead perdido" }
  ],
  "conexiones": [
    { "de": "n1", "a": "n2" },
    { "de": "n2", "a": "n3" },
    { "de": "n3", "a": "n4", "etiqueta": "no" }
  ]
}

Tipos de nodo: inicio | actividad | decision | espera | fin.
Ejecutor (solo en actividad): humano | software | ia | hibrido.

REGLAS:
- Dibuja el proceso REAL que describe la persona, no el ideal.
- Todo camino termina en un nodo fin, incluidos los malos
  ("lead perdido", "cliente se va"). No los omitas por incomodos.
- Toda decision tiene al menos dos salidas con etiqueta.
- No inventes pasos que la persona no menciono. Si falta algo
  evidente, agregalo como nodo con etiqueta que empiece por "?".
- Las etiquetas usan las palabras de la persona, no vocabulario
  de consultoria.
- Sin posiciones: el layout lo calcula la aplicacion.`;

export async function correrArquitecto(descripcion: string) {
  return ai().complete({ system: PROMPT_ARQUITECTO, user: descripcion, schema: SalidaArquitecto, priority: "interactive", maxTokens: 4000 });
}

export const PROMPT_TOBE = `Eres el motor de rediseno. Recibes un proceso AS-IS (como funciona hoy) en JSON,
con el veredicto y el problema de cada nodo si existen, los hallazgos aprobados
que lo tocan y el know-how minado de los puestos involucrados.

Devuelve el proceso TO-BE con el mismo formato JSON del flujograma
(nombre, area, nodos, conexiones) mas "justificacion": un parrafo.

Para cada nodo del TO-BE pon "veredicto":
- keep: se preserva tal cual
- improve: se mantiene el mecanismo, se corrige lo que falla
- replace: se conserva la funcion, se cambia el mecanismo
- create: algo nuevo que no existia
Los nodos con veredicto remove del AS-IS NO aparecen en el TO-BE.

Asigna "ejecutor" a cada actividad:
- humano: requiere juicio, relacion, confrontacion o responsabilidad legal
- software: regla fija, sin ambiguedad, alto volumen
- ia: requiere lenguaje o criterio acotado, tolera revision
- hibrido: la IA prepara, el humano aprueba

REGLAS:
- Se conserva lo que sirve. Un rediseno que borra todo es senal de que
  no entendiste la empresa. Si un paso lleva anos funcionando, tiene una razon.
- Un agente sobre un proceso indefinido automatiza el desorden:
  solo asigna ia o software a pasos con regla clara.
- Un paso con veredicto remove nunca se automatiza.
- Un puesto cuyo know-how esta vacio no se automatiza: dejalo humano y
  anotalo en el campo problema.
- Todo camino termina en un fin, incluidos los malos.
- Usa ids nuevos (t1, t2...).`;

export async function correrToBe(contexto: string) {
  return ai().complete({ system: PROMPT_TOBE, user: contexto, schema: SalidaToBe, priority: "batch", maxTokens: 5000 });
}

export const PROMPT_SOP = `Redactas el SOP (como se hace) de un proceso con veredicto keep o improve.
Recibes el proceso en JSON (nodos y conexiones) y el know-how minado relacionado.

Devuelve JSON:
- objetivo
- disparador
- responsable (un unico puesto)
- pasos: [{ n, que, quien, estandar }]
- entradas: []
- salidas: []
- estandar: estandar de calidad del entregable
- indicador: un indicador medible
- excepciones: [{ situacion, que_hacer }] — las excepciones conocidas, incluidas las del know-how

REGLAS:
- Lenguaje llano. Una persona nueva debe poder seguirlo sin preguntar.
- Un responsable unico. "El equipo" no es un responsable.
- Integra el know-how como reglas practicas dentro de los pasos o las excepciones.
- No inventes pasos que el proceso no tiene.`;

export async function correrSop(contexto: string) {
  return ai().complete({ system: PROMPT_SOP, user: contexto, schema: SalidaSop, priority: "batch", maxTokens: 4000 });
}
